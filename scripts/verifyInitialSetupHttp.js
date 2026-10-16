'use strict';

const assert = require('node:assert/strict');
const http = require('node:http');
const { randomBytes } = require('node:crypto');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const mongoose = require('mongoose');
const { startServer } = require('../src/server');
const { DatabaseConnection } = require('../src/config/database');
const { User } = require('../src/models/User');
const { InitialSetupState, INITIAL_SETUP_STATE_ID } = require('../src/models/InitialSetupState');
const { PasswordHasher } = require('../src/services/PasswordHasher');

/**
 * Execute: node scripts/verifyInitialSetupHttp.js
 *
 * Exercita startServer, configuração, índices, decisão administrativa, rotas,
 * bcrypt, sessões e MongoDB reais. Somente o frontend é substituído por um
 * middleware neutro: não requer compilação e não verifica interface visual.
 *
 * Usa banco local temporário e valores fictícios. O diretório de trabalho é
 * temporariamente alterado para uma pasta vazia, de modo que dotenv.config()
 * não carregue o .env do projeto. As variáveis são restauradas ao terminar.
 */
const DATABASE_PREFIX = 'initial_setup_http_check_';
const TOKEN = 'ab'.repeat(32);
const PASSWORD = 'senha-ficticia-http-de-teste';
const logger = { info() {}, error() {}, log() {} };

function availablePort() {
    return new Promise((resolve, reject) => {
        const probe = http.createServer();
        probe.once('error', reject);
        probe.listen(0, '127.0.0.1', () => {
            const port = probe.address().port;
            probe.close(error => error ? reject(error) : resolve(port));
        });
    });
}

async function main() {
    const dbName = `${DATABASE_PREFIX}${randomBytes(8).toString('hex')}`;
    const uri = `mongodb://127.0.0.1:27017/${dbName}`;
    const originalDirectory = process.cwd();
    const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'initial-setup-http-'));
    const originals = new Map();
    const originalSignals = new Map(['SIGINT', 'SIGTERM'].map(signal => [signal, new Set(process.listeners(signal))]));
    const database = new DatabaseConnection({ mongooseClient: mongoose, logger });
    let server;
    let connected = false;
    let scenarios = 0;
    let currentScenario = 'inicialização';
    const connectDatabase = database.connect.bind(database);
    database.connect = async (...args) => {
        const connection = await connectDatabase(...args);
        connected = true;
        return connection;
    };

    function passed(description) {
        scenarios += 1;
        console.info(`OK ${scenarios}: ${description}`);
    }
    function setEnvironment(values) {
        for (const [key, value] of Object.entries(values)) {
            if (!originals.has(key)) originals.set(key, process.env[key]);
            if (value === undefined) delete process.env[key];
            else process.env[key] = value;
        }
    }
    function removeTestSignalHandlers() {
        for (const [signal, originalHandlers] of originalSignals) {
            for (const handler of process.listeners(signal)) {
                if (!originalHandlers.has(handler)) process.removeListener(signal, handler);
            }
        }
    }
    async function stopHttp() {
        if (server) {
            await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
            server = null;
        }
        removeTestSignalHandlers();
    }
    async function launch() {
        server = await startServer({
            database,
            logger,
            frontendAssetsMiddlewareFactory: () => (_request, _response, next) => next(),
        });
        connected = true;
    }
    function request(route, { method = 'GET', body, headers = {} } = {}) {
        return new Promise((resolve, reject) => {
            const text = body === undefined ? '' : JSON.stringify(body);
            const outgoing = http.request({
                host: '127.0.0.1', port: server.address().port, path: route, method,
                agent: false,
                headers: { ...(text ? { 'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(text) } : {}), ...headers },
            }, response => {
                let data = '';
                response.setEncoding('utf8');
                response.on('data', chunk => { data += chunk; });
                response.on('error', reject);
                response.on('end', () => {
                    try { resolve({ status: response.statusCode, headers: response.headers,
                        body: data ? JSON.parse(data) : null }); }
                    catch (error) { reject(error); }
                });
            });
            outgoing.setTimeout(15000, () => outgoing.destroy(new Error('Tempo HTTP excedido.')));
            outgoing.on('error', reject);
            outgoing.end(text);
        });
    }

    try {
        process.chdir(temporaryDirectory);
        const port = await availablePort();
        const origin = `http://127.0.0.1:${port}`;
        setEnvironment({ NODE_ENV: 'test', HOST: '127.0.0.1', PORT: String(port),
            MONGODB_URI: uri, SESSION_SECRET: randomBytes(48).toString('hex'),
            PASSWORD_HASH_ROUNDS: '10', SESSION_HOURS: '1', APP_ORIGIN: origin,
            TRUST_PROXY: '0', INITIAL_SETUP_TOKEN: TOKEN,
            ADMIN_NAME: undefined, ADMIN_EMAIL: undefined, ADMIN_PASSWORD: undefined });
        await launch();

        currentScenario = 'instalação sem credenciais predefinidas';
        const status = await request('/api/setup/status');
        assert.equal(status.status, 200);
        assert.deepEqual(status.body, { data: { available: true } });
        assert.equal(await User.countDocuments({}), 0);
        assert.equal(await InitialSetupState.countDocuments({}), 0);
        passed('servidor inicia sem ADMIN_* e informa primeiro cadastro disponível');

        const input = { invitationToken: TOKEN, name: '  Ana   Silva  ',
            email: ' ANA@EXAMPLE.COM ', password: PASSWORD };
        currentScenario = 'proteções antes do cadastro';
        const foreign = await request('/api/setup/admin', { method: 'POST', body: input,
            headers: { Origin: 'https://outro.example.com' } });
        assert.equal(foreign.status, 403);
        assert.equal(foreign.body.error.code, 'INITIAL_SETUP_FORBIDDEN_ORIGIN');
        const text = await request('/api/setup/admin', { method: 'POST', body: input,
            headers: { Origin: origin, 'Content-Type': 'text/plain' } });
        assert.equal(text.status, 415);
        assert.equal(await User.countDocuments({}), 0);
        assert.equal(await InitialSetupState.countDocuments({}), 0);
        passed('origem não autorizada e conteúdo não JSON não gravam conta ou reserva');

        currentScenario = 'convite inválido';
        const invalid = await request('/api/setup/admin', { method: 'POST',
            body: { ...input, invitationToken: 'cd'.repeat(32) }, headers: { Origin: origin } });
        assert.equal(invalid.status, 403);
        assert.equal(invalid.body.error.code, 'INITIAL_SETUP_INVALID_INVITATION');
        assert.equal(await InitialSetupState.countDocuments({}), 0);
        passed('convite inválido é recusado por HTTP sem consumir a reserva persistente');

        currentScenario = 'criação HTTP da conta';
        const created = await request('/api/setup/admin', { method: 'POST', body: input,
            headers: { Origin: origin } });
        assert.equal(created.status, 201);
        assert.deepEqual(created.body, { data: { created: true } });
        assert.equal(created.headers['set-cookie'], undefined);
        const account = await User.findOne({ role: 'admin' }).select('+passwordHash').lean();
        const state = await InitialSetupState.findById(INITIAL_SETUP_STATE_ID).lean();
        assert.equal(account.email, 'ana@example.com');
        assert.equal(account.name, 'Ana Silva');
        assert.equal(await new PasswordHasher({ rounds: 10 }).compare(PASSWORD, account.passwordHash), true);
        assert.equal(state.status, 'completed');
        assert.equal(state.administratorId.toString(), account._id.toString());
        passed('POST cria conta com bcrypt real e conclui o registro sem autenticar automaticamente');

        currentScenario = 'repetição do cadastro';
        const repeated = await request('/api/setup/admin', { method: 'POST', body: input,
            headers: { Origin: origin } });
        assert.equal(repeated.status, 409);
        assert.equal(repeated.body.error.code, 'INITIAL_SETUP_UNAVAILABLE');
        assert.equal(await User.countDocuments({}), 1);
        passed('cadastro repetido é recusado e mantém uma conta');

        currentScenario = 'limitação e estado após cadastro';
        const limited = await request('/api/setup/admin', { method: 'POST', body: input,
            headers: { Origin: origin } });
        assert.equal(limited.status, 429);
        assert.equal(limited.body.error.code, 'INITIAL_SETUP_RATE_LIMITED');
        const closed = await request('/api/setup/status');
        assert.equal(closed.status, 200);
        assert.deepEqual(closed.body, { data: { available: false } });
        passed('sexta tentativa recebe 429 e a consulta de disponibilidade continua respondendo');

        currentScenario = 'login e sessão da conta criada';
        const login = await request('/api/auth/login', { method: 'POST',
            body: { email: account.email, password: PASSWORD } });
        assert.equal(login.status, 200);
        const cookies = login.headers['set-cookie'];
        assert.ok(Array.isArray(cookies) && cookies.length > 0);
        const cookie = cookies.map(value => value.split(';')[0]).join('; ');
        assert.equal((await request('/api/auth/session', { headers: { Cookie: cookie } })).status, 200);
        assert.equal((await request('/api/auth/logout', { method: 'POST', headers: { Cookie: cookie } })).status, 204);
        assert.equal((await request('/api/auth/session', { headers: { Cookie: cookie } })).status, 401);
        passed('conta criada permite login, consulta da sessão e logout com MongoDB real');

        currentScenario = 'nova inicialização sem convite nem credenciais';
        const accountBeforeRestart = await User.findById(account._id).select('+passwordHash').lean();
        await stopHttp();
        await database.disconnect();
        setEnvironment({ INITIAL_SETUP_TOKEN: undefined });
        await launch();
        const restartedStatus = await request('/api/setup/status');
        assert.deepEqual(restartedStatus.body, { data: { available: false } });
        assert.deepEqual(await User.findById(account._id).select('+passwordHash').lean(), accountBeforeRestart);
        assert.deepEqual(await InitialSetupState.findById(INITIAL_SETUP_STATE_ID).lean(), state);
        assert.equal(await User.countDocuments({}), 1);
        passed('nova inicialização reconhece a conta sem ADMIN_* ou convite e preserva dados');
    } catch (error) {
        console.error(`Falha no cenário: ${currentScenario}.`);
        throw error;
    } finally {
        const cleanupErrors = [];
        try { await stopHttp(); } catch (error) { cleanupErrors.push(error); }
        try {
            if (connected || mongoose.connection.readyState === 1) {
                // Uma falha de startServer pode ter fechado a conexão. Nesse
                // caso, reconecta somente à URI temporária conhecida para limpeza.
                if (mongoose.connection.readyState !== 1) {
                    await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000, autoIndex: false });
                }
                assert.equal(mongoose.connection.name, dbName);
                assert.ok(dbName.startsWith(DATABASE_PREFIX));
                await mongoose.connection.db.dropDatabase();
                console.info(`Banco temporário removido: ${dbName}`);
            }
        } catch (error) { cleanupErrors.push(error); }
        finally {
            try { await database.disconnect(); } catch (error) { cleanupErrors.push(error); }
            for (const [key, value] of originals) {
                if (value === undefined) delete process.env[key];
                else process.env[key] = value;
            }
            process.chdir(originalDirectory);
            try { await fs.rm(temporaryDirectory, { recursive: true, force: true }); }
            catch (error) { cleanupErrors.push(error); }
        }
        if (cleanupErrors.length) {
            throw new AggregateError(cleanupErrors, 'A limpeza da verificação HTTP não foi concluída.');
        }
    }
    console.info(`Verificação concluída: ${scenarios} cenários aprovados.`);
}

main().catch(error => {
    console.error('Verificação interrompida.', { errorName: error.name, message: error.message });
    process.exitCode = 1;
});
