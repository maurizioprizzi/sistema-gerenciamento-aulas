'use strict';

const assert = require('node:assert/strict');
const {
    describe,
    test,
} = require('node:test');

const {
    SERVER_ERROR_MESSAGES,
    startServer,
} = require('../src/server');

/**
 * Ambiente completo e fictício utilizado para validar a inicialização sem
 * depender das configurações mantidas no arquivo .env do desenvolvedor.
 */
const TEST_ENVIRONMENT = Object.freeze({
    NODE_ENV: 'test',
    HOST: '127.0.0.1',
    PORT: '3000',
    MONGODB_URI:
        'mongodb://127.0.0.1:27017/calendario_teste',
    SESSION_SECRET:
        'segredo-de-teste-com-mais-de-trinta-e-dois-caracteres',
    PASSWORD_HASH_ROUNDS: '12',
    ADMIN_NAME: 'Administrador de Teste',
    ADMIN_EMAIL: 'admin@example.com',
    ADMIN_PASSWORD: 'senha-forte-de-teste',
    SESSION_HOURS: '1',
    APP_ORIGIN: 'http://localhost:3000',
    TRUST_PROXY: '0',
});

/**
 * Executa um cenário com variáveis temporárias e restaura o ambiente original
 * mesmo quando a operação testada termina com erro.
 *
 * @param {Function} callback Cenário que utilizará o ambiente de teste.
 * @returns {Promise<void>}
 */
async function withTestEnvironment(callback) {
    const originalValues = {};

    for (
        const [key, value]
        of Object.entries(TEST_ENVIRONMENT)
    ) {
        originalValues[key] = process.env[key];
        process.env[key] = value;
    }

    try {
        await callback();
    } finally {
        for (const key of Object.keys(TEST_ENVIRONMENT)) {
            if (originalValues[key] === undefined) {
                delete process.env[key];
            } else {
                process.env[key] = originalValues[key];
            }
        }
    }
}

describe('arquivos do frontend no ciclo do servidor', () => {
    test(
        'rejeita uma fábrica inválida antes de conectar o banco',
        async () => {
            await withTestEnvironment(async () => {
                let connectionAttempts = 0;

                const database = {
                    async connect() {
                        connectionAttempts += 1;
                    },
                };

                await assert.rejects(
                    startServer({
                        database,
                        frontendAssetsMiddlewareFactory: null,
                    }),
                    {
                        name: 'TypeError',
                        message:
                            SERVER_ERROR_MESSAGES
                                .INVALID_FRONTEND_ASSETS_MIDDLEWARE_FACTORY,
                    },
                );

                assert.equal(connectionAttempts, 0);
            });
        },
    );

    test(
        'rejeita um resultado inválido antes de conectar o banco',
        async () => {
            await withTestEnvironment(async () => {
                let connectionAttempts = 0;

                const database = {
                    async connect() {
                        connectionAttempts += 1;
                    },
                };

                await assert.rejects(
                    startServer({
                        database,
                        frontendAssetsMiddlewareFactory() {
                            return {};
                        },
                    }),
                    {
                        name: 'TypeError',
                        message:
                            SERVER_ERROR_MESSAGES
                                .INVALID_FRONTEND_ASSETS_MIDDLEWARE,
                    },
                );

                assert.equal(connectionAttempts, 0);
            });
        },
    );
});