'use strict';

const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const fs = require('node:fs/promises');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const mongoose = require('mongoose');

/**
 * Execute: node scripts/previewInitialSetup.js
 *
 * Abre a aplicação real para uma verificação manual no navegador. Requer
 * MongoDB local ativo e o frontend compilado com npm --prefix client run build.
 *
 * Cada execução usa banco, porta, segredo de sessão e convite próprios.
 * O servidor roda em um processo filho, a partir de uma pasta vazia, para
 * impedir que dotenv carregue o .env do projeto. A aplicação é atendida pelo
 * Express, com frontend e API na mesma origem exigida pelo primeiro cadastro.
 *
 * Ctrl+C encerra o servidor e remove SOMENTE o banco marcado por esta execução.
 * O script não é um instalador nem uma forma de iniciar a instalação pessoal.
 */
const PROJECT_DIRECTORY = path.resolve(__dirname, '..');
const SERVER_FILE = path.join(PROJECT_DIRECTORY, 'src', 'server.js');
const FRONTEND_FILE = path.join(PROJECT_DIRECTORY, 'client', 'dist', 'index.html');
const DATABASE_PREFIX = 'initial_setup_preview_';
const MARKER_COLLECTION = 'preview_execution_owner';

function availablePort() {
    return new Promise((resolve, reject) => {
        const probe = http.createServer();
        probe.once('error', reject);
        probe.listen(0, '127.0.0.1', () => {
            const port = probe.address().port;
            probe.close((error) => error ? reject(error) : resolve(port));
        });
    });
}

/** Não altera process.env do processo que está executando a verificação. */
function createPreviewEnvironment({ uri, origin, port, invitationToken }) {
    const environment = {
        ...process.env,
        NODE_ENV: 'test',
        HOST: '127.0.0.1',
        PORT: String(port),
        MONGODB_URI: uri,
        SESSION_SECRET: randomBytes(48).toString('hex'),
        PASSWORD_HASH_ROUNDS: '10',
        SESSION_HOURS: '1',
        APP_ORIGIN: origin,
        TRUST_PROXY: '0',
        INITIAL_SETUP_TOKEN: invitationToken,
    };
    for (const key of ['ADMIN_NAME', 'ADMIN_EMAIL', 'ADMIN_PASSWORD']) {
        delete environment[key];
    }
    return environment;
}

function readStatus(port) {
    return new Promise((resolve, reject) => {
        const request = http.get({
            host: '127.0.0.1', port, path: '/api/setup/status', agent: false,
        }, (response) => {
            let body = '';
            response.setEncoding('utf8');
            response.on('data', (chunk) => { body += chunk; });
            response.on('error', reject);
            response.on('end', () => {
                try {
                    assert.equal(response.statusCode, 200);
                    assert.deepEqual(JSON.parse(body), { data: { available: true } });
                    resolve();
                } catch (error) {
                    reject(error);
                }
            });
        });
        request.setTimeout(1000, () => request.destroy(new Error('Servidor ainda indisponível.')));
        request.on('error', reject);
    });
}

async function main() {
    const ownerId = randomBytes(16).toString('hex');
    const dbName = `${DATABASE_PREFIX}${ownerId}`;
    const uri = `mongodb://127.0.0.1:27017/${dbName}`;
    const invitationToken = randomBytes(32).toString('hex');
    const connection = mongoose.createConnection();
    let temporaryDirectory;
    let ownsDatabase = false;
    let child;
    let childHasExited = false;
    let childError;
    let childOutput = '';
    let childClosed;
    let stopRequested = false;
    let resolveStop;
    const stopped = new Promise((resolve) => { resolveStop = resolve; });

    function requestStop() {
        if (stopRequested) return;
        stopRequested = true;
        console.info('\nEncerrando a verificação e limpando os dados temporários...');
        resolveStop();
    }

    process.on('SIGINT', requestStop);
    process.on('SIGTERM', requestStop);

    try {
        await fs.access(FRONTEND_FILE);
        console.info('Preparando a verificação visual com MongoDB local...');
        await connection.openUri(uri, {
            serverSelectionTimeoutMS: 10000,
            autoIndex: false,
        });
        if (stopRequested) return;

        // A limpeza depende tanto do nome aleatório quanto desta marca.
        assert.equal(connection.name, dbName);
        const collections = await connection.db.listCollections({}, { nameOnly: true }).toArray();
        assert.equal(collections.length, 0, 'O banco escolhido já possui dados; verificação recusada.');
        await connection.db.collection(MARKER_COLLECTION).insertOne({ _id: ownerId });
        ownsDatabase = true;
        if (stopRequested) return;

        temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'initial-setup-preview-'));
        const port = await availablePort();
        const origin = `http://127.0.0.1:${port}`;
        if (stopRequested) return;

        child = spawn(process.execPath, [SERVER_FILE], {
            cwd: temporaryDirectory,
            env: createPreviewEnvironment({ uri, origin, port, invitationToken }),
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        childClosed = new Promise((resolve) => {
            child.once('error', (error) => { childError = error; });
            child.once('close', () => {
                childHasExited = true;
                resolve();
            });
        });
        // Guarda apenas uma pequena cauda para diagnóstico de falha ao iniciar.
        const rememberOutput = (chunk) => {
            childOutput = (childOutput + chunk.toString()).slice(-6000);
        };
        child.stdout.on('data', rememberOutput);
        child.stderr.on('data', rememberOutput);

        const deadline = Date.now() + 30000;
        let ready = false;
        while (!ready && !stopRequested) {
            if (childHasExited) {
                throw childError || new Error(`O servidor encerrou durante a inicialização.\n${childOutput}`);
            }
            try {
                await readStatus(port);
                ready = true;
            } catch {
                if (Date.now() >= deadline) {
                    throw new Error(`O servidor não confirmou o primeiro cadastro a tempo.\n${childOutput}`);
                }
                await Promise.race([
                    stopped,
                    new Promise((resolve) => setTimeout(resolve, 250)),
                ]);
            }
        }
        if (stopRequested) return;

        console.info(`\nEndereço do teste: ${origin}`);
        console.info(`Código de primeiro acesso deste teste: ${invitationToken}`);
        console.info(`Banco temporário: ${dbName}`);
        console.info('\nAbra o endereço em uma janela anônima do navegador.');
        console.info('Use nome, e-mail e senha fictícios para criar a conta de teste.');
        console.info('Mantenha este terminal aberto enquanto usa a aplicação.');
        console.info('Ao terminar, Ctrl+C encerra o teste e remove seus dados temporários.\n');

        await Promise.race([stopped, childClosed]);
        if (!stopRequested) {
            throw new Error(`O servidor encerrou antes do fim da verificação.\n${childOutput}`);
        }
    } finally {
        const cleanupErrors = [];
        try {
            if (child && !childHasExited) {
                child.kill('SIGTERM');
                const forceStop = setTimeout(() => {
                    if (!childHasExited) child.kill('SIGKILL');
                }, 10000);
                try {
                    await childClosed;
                } finally {
                    clearTimeout(forceStop);
                }
            }
        } catch (error) {
            cleanupErrors.push(error);
        }

        try {
            if (ownsDatabase) {
                assert.ok(dbName.startsWith(DATABASE_PREFIX));
                assert.equal(connection.name, dbName);
                const marker = await connection.db.collection(MARKER_COLLECTION).findOne({ _id: ownerId });
                assert.equal(marker?._id, ownerId, 'A marca do banco temporário não foi confirmada.');
                await connection.db.dropDatabase();
                console.info(`Banco temporário removido: ${dbName}`);
            }
        } catch (error) {
            cleanupErrors.push(error);
            console.error(`A limpeza do banco temporário não foi concluída: ${dbName}`);
        }
        try {
            await connection.close();
        } catch (error) {
            cleanupErrors.push(error);
        }
        if (temporaryDirectory) {
            try {
                await fs.rm(temporaryDirectory, { recursive: true, force: true });
            } catch (error) {
                cleanupErrors.push(error);
            }
        }
        process.removeListener('SIGINT', requestStop);
        process.removeListener('SIGTERM', requestStop);
        if (cleanupErrors.length) {
            throw new AggregateError(cleanupErrors, 'A limpeza da verificação visual requer atenção.');
        }
    }
}

if (require.main === module) {
    main().catch((error) => {
        const message = error.code === 'ENOENT'
            ? 'Compile primeiro o frontend com: npm --prefix client run build'
            : error.message;
        console.error('Verificação visual interrompida.', {
            errorName: error.name,
            message,
        });
        process.exitCode = 1;
    });
}

module.exports = { createPreviewEnvironment, main };
