'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const dotenv = require('dotenv');
const mongoose = require('mongoose');

/**
 * Execute: node scripts/inspectLocalDatabase.js
 *
 * Inventário somente de leitura do banco local indicado no .env do projeto.
 * Não importa modelos, cria índices ou altera documentos. A saída contém
 * nomes de coleções, contagens e siglas de cursos gravadas nas aulas.
 * URI, credenciais administrativas e documentos completos não são exibidos.
 */
const ENVIRONMENT_FILE = path.resolve(__dirname, '..', '.env');

function readLocalDatabaseConfiguration(source) {
    const uri = typeof source.MONGODB_URI === 'string'
        ? source.MONGODB_URI.trim() : '';
    let url;
    try {
        url = new URL(uri);
    } catch {
        throw new Error('MONGODB_URI não contém uma configuração local válida.');
    }

    if (
        url.protocol !== 'mongodb:'
        || !['localhost', '127.0.0.1', '[::1]', '::1'].includes(url.hostname)
    ) {
        throw new Error('Esta inspeção aceita somente um servidor MongoDB local.');
    }

    const dbName = url.pathname.slice(1);
    if (
        !/^[a-zA-Z0-9_-]+$/.test(dbName)
        || ['admin', 'config', 'local'].includes(dbName.toLowerCase())
    ) {
        throw new Error('Informe explicitamente o banco da aplicação na MONGODB_URI.');
    }

    return Object.freeze({
        uri,
        dbName,
        server: `${url.hostname}:${url.port || '27017'}`,
    });
}

async function main() {
    const source = dotenv.parse(await fs.readFile(ENVIRONMENT_FILE, 'utf8'));
    const configuration = readLocalDatabaseConfiguration(source);
    const connection = mongoose.createConnection();

    try {
        await connection.openUri(configuration.uri, {
            serverSelectionTimeoutMS: 5000,
            maxPoolSize: 1,
            autoIndex: false,
            autoCreate: false,
            directConnection: true,
        });
        if (connection.name !== configuration.dbName) {
            throw new Error('O nome do banco conectado não corresponde à configuração.');
        }

        console.info(`Banco configurado: ${configuration.dbName}`);
        console.info(`Servidor local: ${configuration.server}`);
        console.info('\nColeções e quantidades:');
        const collections = await connection.db
            .listCollections({}, { nameOnly: true }).toArray();
        collections.sort((first, second) => first.name.localeCompare(second.name));
        for (const collection of collections) {
            const count = await connection.db.collection(collection.name)
                .countDocuments({}, { maxTimeMS: 5000 });
            console.info(`- ${JSON.stringify(collection.name)}: ${count}`);
        }
        if (collections.length === 0) console.info('- Nenhuma coleção encontrada.');

        if (collections.some((collection) => collection.name === 'lessons')) {
            const courses = await connection.db.collection('lessons').aggregate([
                { $match: { course: { $type: 'string' } } },
                { $group: { _id: '$course', lessons: { $sum: 1 } } },
                { $sort: { _id: 1 } },
            ], { maxTimeMS: 5000 }).toArray();
            console.info('\nSiglas de cursos gravadas nas aulas:');
            for (const course of courses) {
                console.info(`- ${JSON.stringify(course._id)}: ${course.lessons} aula(s)`);
            }
            if (courses.length === 0) console.info('- Nenhuma sigla textual encontrada.');
        }
        console.info('\nInspeção concluída somente com operações de leitura.');
    } finally {
        await connection.close();
    }
}

if (require.main === module) {
    main().catch((error) => {
        const isConfigurationError = error instanceof Error
            && error.constructor === Error;
        console.error('Inspeção interrompida.', {
            errorName: error.name,
            message: error.code === 'ENOENT'
                ? 'O arquivo .env do projeto não foi encontrado.'
                : isConfigurationError
                    ? error.message
                    : 'Não foi possível concluir a consulta. Confira o MongoDB local e a configuração.',
        });
        process.exitCode = 1;
    });
}

module.exports = { main, readLocalDatabaseConfiguration };
