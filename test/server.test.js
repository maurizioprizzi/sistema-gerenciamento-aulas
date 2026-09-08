const assert = require('node:assert/strict');
const {
    describe,
    test
} = require('node:test');

const {
    resolvePort,
    startServer
} = require('../src/server');

/**
 * Variáveis necessárias para testar startServer sem depender do .env local.
 */
const TEST_ENVIRONMENT = Object.freeze({
    NODE_ENV: 'test',
    HOST: '127.0.0.1',
    PORT: '3000',
    MONGODB_URI:
        'mongodb://127.0.0.1:27017/calendario_teste',
    SESSION_SECRET:
        'segredo-de-teste-com-mais-de-trinta-e-dois-caracteres',
    ADMIN_NAME: 'Administrador de Teste',
    ADMIN_EMAIL: 'admin@example.com',
    ADMIN_PASSWORD: 'senha-forte-de-teste',
    SESSION_HOURS: '1',
    APP_ORIGIN: 'http://localhost:3000',
    TRUST_PROXY: '0'
});

/**
 * Executa uma função com variáveis de ambiente temporárias.
 *
 * Ao final, os valores originais são restaurados, mesmo quando o teste falha.
 *
 * @param {Function} callback Operação que utilizará o ambiente de teste.
 * @returns {Promise<void>}
 */
async function withTestEnvironment(callback) {
    const originalValues = {};

    for (const key of Object.keys(TEST_ENVIRONMENT)) {
        originalValues[key] = process.env[key];
        process.env[key] = TEST_ENVIRONMENT[key];
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

describe('resolvePort', () => {
    test('usa a porta 3000 quando PORT não foi informada', () => {
        const port = resolvePort(undefined);

        assert.equal(port, 3000);
    });

    test('converte uma porta válida recebida como texto', () => {
        const port = resolvePort('8080');

        assert.equal(port, 8080);
    });

    test('aceita os limites válidos de uma porta TCP', () => {
        assert.equal(resolvePort('1'), 1);
        assert.equal(resolvePort('65535'), 65535);
    });

    /**
     * Criamos um teste independente para cada entrada inválida.
     */
    const invalidValues = [
        '0',
        '-1',
        '65536',
        '',
        'abc',
        '3000abc',
        '3.14'
    ];

    for (const value of invalidValues) {
        test(`rejeita a porta inválida ${JSON.stringify(value)}`, () => {
            assert.throws(
                () => resolvePort(value),
                {
                    name: 'RangeError',
                    message:
                        'A variável PORT deve conter um número inteiro entre 1 e 65535.'
                }
            );
        });
    }
});

describe('startServer', () => {
    test(
        'não cria o servidor HTTP quando o MongoDB falha',
        async () => {
            await withTestEnvironment(async () => {
                const expectedError = new Error(
                    'MongoDB indisponível para o teste.'
                );

                const calls = {
                    connect: [],
                    disconnect: 0,
                    appFactory: 0
                };

                /**
                 * Banco simulado que falha ao conectar.
                 */
                const database = {
                    async connect(uri, options) {
                        calls.connect.push({
                            uri,
                            options
                        });

                        throw expectedError;
                    },

                    async disconnect() {
                        calls.disconnect += 1;
                    }
                };

                /**
                 * Se esta função for chamada, significa que o servidor tentou
                 * criar o Express mesmo sem armazenamento disponível.
                 */
                function appFactory() {
                    calls.appFactory += 1;

                    throw new Error(
                        'appFactory não deveria ter sido chamada.'
                    );
                }

                const logger = {
                    log() {},
                    error() {}
                };

                await assert.rejects(
                    startServer({
                        database,
                        appFactory,
                        logger
                    }),
                    expectedError
                );

                assert.deepEqual(calls.connect, [
                    {
                        uri:
                            TEST_ENVIRONMENT.MONGODB_URI,
                        options: {
                            autoIndex: true
                        }
                    }
                ]);

                /**
                 * Mesmo após uma tentativa incompleta, o gerenciador recebe
                 * a ordem de limpeza. Sua implementação decide se existe
                 * alguma conexão que realmente precise ser encerrada.
                 */
                assert.equal(calls.disconnect, 1);

                /**
                 * O Express e o servidor HTTP não foram criados.
                 */
                assert.equal(calls.appFactory, 0);
            });
        }
    );
});