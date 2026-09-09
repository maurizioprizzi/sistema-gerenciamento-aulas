'use strict';

const assert = require('node:assert/strict');
const {
    describe,
    test,
} = require('node:test');

const {
    createAdminBootstrapper,
    resolvePort,
    startServer,
} = require('../src/server');

/**
 * Variáveis necessárias para testar startServer sem depender do .env local.
 *
 * Todos os valores são fictícios e existem somente no processo de teste.
 */
const TEST_ENVIRONMENT = Object.freeze({
    NODE_ENV: 'test',
    HOST: '127.0.0.1',
    PORT: '3000',
    MONGODB_URI:
        'mongodb://127.0.0.1:27017/calendario_teste',
    SESSION_SECRET:
        'segredo-de-teste-com-mais-de-trinta-e-dois-caracteres',
    PASSWORD_HASH_ROUNDS: '13',
    ADMIN_NAME: 'Administrador de Teste',
    ADMIN_EMAIL: 'admin@example.com',
    ADMIN_PASSWORD: 'senha-forte-de-teste',
    SESSION_HOURS: '1',
    APP_ORIGIN: 'http://localhost:3000',
    TRUST_PROXY: '0',
});

/**
 * Executa uma função com variáveis de ambiente temporárias.
 *
 * Ao final, os valores originais são restaurados, mesmo quando o teste falha.
 *
 * @param {Function} callback Operação que utilizará o ambiente de teste.
 * @param {Record<string, string>} overrides Valores que substituem o ambiente.
 * @returns {Promise<void>}
 */
async function withTestEnvironment(
    callback,
    overrides = {},
) {
    const temporaryEnvironment = {
        ...TEST_ENVIRONMENT,
        ...overrides,
    };

    const originalValues = {};

    for (const key of Object.keys(temporaryEnvironment)) {
        originalValues[key] = process.env[key];
        process.env[key] = temporaryEnvironment[key];
    }

    try {
        await callback();
    } finally {
        for (const key of Object.keys(temporaryEnvironment)) {
            if (originalValues[key] === undefined) {
                delete process.env[key];
            } else {
                process.env[key] = originalValues[key];
            }
        }
    }
}

/**
 * Cria um logger controlado que não escreve no terminal.
 *
 * @returns {{ logger: object, entries: object[] }}
 */
function createFakeLogger() {
    const entries = [];

    function register(level, args) {
        entries.push({
            level,
            args,
        });
    }

    return {
        logger: {
            log(...args) {
                register('log', args);
            },

            info(...args) {
                register('info', args);
            },

            error(...args) {
                register('error', args);
            },
        },
        entries,
    };
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
        '3.14',
    ];

    for (const value of invalidValues) {
        test(
            `rejeita a porta inválida ${JSON.stringify(value)}`,
            () => {
                assert.throws(
                    () => resolvePort(value),
                    {
                        name: 'RangeError',
                        message:
                            'A variável PORT deve conter um número inteiro entre 1 e 65535.',
                    },
                );
            },
        );
    }
});

describe('createAdminBootstrapper', () => {
    test('cria o serviço sem abrir conexão com o banco', () => {
        const { logger } = createFakeLogger();

        const service = createAdminBootstrapper({
            passwordHashRounds: 12,
            logger,
        });

        assert.equal(
            typeof service.ensureAdmin,
            'function',
        );
    });

    test('rejeita um custo inseguro antes de criar o serviço', () => {
        const { logger } = createFakeLogger();

        assert.throws(
            () => createAdminBootstrapper({
                passwordHashRounds: 9,
                logger,
            }),
            {
                name: 'RangeError',
                message:
                    'O custo do hash deve ser um número inteiro entre 10 e 15.',
            },
        );
    });
});

describe('startServer', () => {
    test(
        'não cria o administrador nem o HTTP quando o MongoDB falha',
        async () => {
            await withTestEnvironment(async () => {
                const expectedError = new Error(
                    'MongoDB indisponível para o teste.',
                );

                const calls = {
                    connect: [],
                    disconnect: 0,
                    adminFactory: 0,
                    appFactory: 0,
                };

                /**
                 * Banco simulado que falha ao conectar.
                 */
                const database = {
                    async connect(uri, options) {
                        calls.connect.push({
                            uri,
                            options,
                        });

                        throw expectedError;
                    },

                    async disconnect() {
                        calls.disconnect += 1;
                    },
                };

                function adminBootstrapperFactory() {
                    calls.adminFactory += 1;

                    throw new Error(
                        'A fábrica administrativa não deveria ter sido chamada.',
                    );
                }

                /**
                 * Se esta função for chamada, significa que o servidor tentou
                 * criar o Express mesmo sem armazenamento disponível.
                 */
                function appFactory() {
                    calls.appFactory += 1;

                    throw new Error(
                        'appFactory não deveria ter sido chamada.',
                    );
                }

                const { logger } = createFakeLogger();

                await assert.rejects(
                    startServer({
                        database,
                        appFactory,
                        adminBootstrapperFactory,
                        logger,
                    }),
                    (error) => {
                        assert.strictEqual(error, expectedError);

                        return true;
                    },
                );

                assert.deepEqual(calls.connect, [
                    {
                        uri:
                            TEST_ENVIRONMENT.MONGODB_URI,
                        options: {
                            autoIndex: true,
                        },
                    },
                ]);

                /**
                 * Mesmo após uma tentativa incompleta, o gerenciador recebe
                 * a ordem de limpeza. Sua implementação decide se existe
                 * alguma conexão que realmente precise ser encerrada.
                 */
                assert.equal(calls.disconnect, 1);

                assert.equal(calls.adminFactory, 0);
                assert.equal(calls.appFactory, 0);
            });
        },
    );

    test(
        'rejeita uma fábrica administrativa inválida antes de conectar',
        async () => {
            await withTestEnvironment(async () => {
                const calls = {
                    connect: 0,
                    disconnect: 0,
                    appFactory: 0,
                };

                const database = {
                    async connect() {
                        calls.connect += 1;
                    },

                    async disconnect() {
                        calls.disconnect += 1;
                    },
                };

                function appFactory() {
                    calls.appFactory += 1;
                }

                const { logger } = createFakeLogger();

                await assert.rejects(
                    startServer({
                        database,
                        appFactory,
                        adminBootstrapperFactory: null,
                        logger,
                    }),
                    {
                        name: 'TypeError',
                        message:
                            'A fábrica de inicialização administrativa deve ser uma função.',
                    },
                );

                assert.equal(calls.connect, 0);
                assert.equal(calls.disconnect, 0);
                assert.equal(calls.appFactory, 0);
            });
        },
    );

    test(
        'desconecta o banco quando a fábrica retorna um serviço inválido',
        async () => {
            await withTestEnvironment(async () => {
                const calls = {
                    connect: 0,
                    disconnect: 0,
                    appFactory: 0,
                };

                const database = {
                    async connect() {
                        calls.connect += 1;
                    },

                    async disconnect() {
                        calls.disconnect += 1;
                    },
                };

                function adminBootstrapperFactory() {
                    return {};
                }

                function appFactory() {
                    calls.appFactory += 1;
                }

                const { logger } = createFakeLogger();

                await assert.rejects(
                    startServer({
                        database,
                        appFactory,
                        adminBootstrapperFactory,
                        logger,
                    }),
                    {
                        name: 'TypeError',
                        message:
                            'A fábrica administrativa deve retornar um serviço com ensureAdmin().',
                    },
                );

                assert.equal(calls.connect, 1);
                assert.equal(calls.disconnect, 1);
                assert.equal(calls.appFactory, 0);
            });
        },
    );

    test(
        'entrega custo e credenciais ao inicializador administrativo',
        async () => {
            await withTestEnvironment(async () => {
                const expectedError = new Error(
                    'Falha administrativa controlada.',
                );

                const calls = {
                    connect: 0,
                    disconnect: 0,
                    adminFactory: [],
                    ensureAdmin: [],
                    appFactory: 0,
                };

                const database = {
                    async connect() {
                        calls.connect += 1;
                    },

                    async disconnect() {
                        calls.disconnect += 1;
                    },
                };

                const { logger, entries } =
                    createFakeLogger();

                function adminBootstrapperFactory(options) {
                    calls.adminFactory.push(options);

                    return {
                        async ensureAdmin(configuration) {
                            calls.ensureAdmin.push(configuration);

                            throw expectedError;
                        },
                    };
                }

                function appFactory() {
                    calls.appFactory += 1;

                    throw new Error(
                        'appFactory não deveria ter sido chamada.',
                    );
                }

                await assert.rejects(
                    startServer({
                        database,
                        appFactory,
                        adminBootstrapperFactory,
                        logger,
                    }),
                    (error) => {
                        assert.strictEqual(error, expectedError);

                        return true;
                    },
                );

                assert.equal(calls.adminFactory.length, 1);
                assert.equal(
                    calls.adminFactory[0].passwordHashRounds,
                    13,
                );
                assert.strictEqual(
                    calls.adminFactory[0].logger,
                    logger,
                );

                assert.deepEqual(calls.ensureAdmin, [
                    {
                        name: TEST_ENVIRONMENT.ADMIN_NAME,
                        email: TEST_ENVIRONMENT.ADMIN_EMAIL,
                        password:
                            TEST_ENVIRONMENT.ADMIN_PASSWORD,
                    },
                ]);

                assert.equal(calls.connect, 1);
                assert.equal(calls.disconnect, 1);
                assert.equal(calls.appFactory, 0);

                /**
                 * O servidor não registra as credenciais recebidas.
                 */
                const serializedLogs = JSON.stringify(entries);

                assert.equal(
                    serializedLogs.includes(
                        TEST_ENVIRONMENT.ADMIN_PASSWORD,
                    ),
                    false,
                );
            });
        },
    );

    test(
        'executa banco, administrador e Express na ordem correta',
        async () => {
            await withTestEnvironment(async () => {
                const expectedError = new Error(
                    'Parada controlada antes da abertura HTTP.',
                );

                const order = [];

                const database = {
                    async connect() {
                        order.push('database.connect');
                    },

                    async disconnect() {
                        order.push('database.disconnect');
                    },
                };

                function adminBootstrapperFactory() {
                    order.push('admin.factory');

                    return {
                        async ensureAdmin() {
                            order.push('admin.ensure');
                        },
                    };
                }

                function appFactory() {
                    order.push('app.factory');

                    /**
                     * A falha intencional interrompe o teste antes da criação
                     * de um servidor HTTP real.
                     */
                    throw expectedError;
                }

                const { logger } = createFakeLogger();

                await assert.rejects(
                    startServer({
                        database,
                        appFactory,
                        adminBootstrapperFactory,
                        logger,
                    }),
                    (error) => {
                        assert.strictEqual(error, expectedError);

                        return true;
                    },
                );

                assert.deepEqual(order, [
                    'database.connect',
                    'admin.factory',
                    'admin.ensure',
                    'app.factory',
                    'database.disconnect',
                ]);
            });
        },
    );

    test(
        'desativa índices automáticos no ambiente de produção',
        async () => {
            await withTestEnvironment(
                async () => {
                    const expectedError = new Error(
                        'Parada controlada após a conexão.',
                    );

                    const calls = {
                        connect: [],
                        disconnect: 0,
                    };

                    const database = {
                        async connect(uri, options) {
                            calls.connect.push({
                                uri,
                                options,
                            });
                        },

                        async disconnect() {
                            calls.disconnect += 1;
                        },
                    };

                    function adminBootstrapperFactory() {
                        return {
                            async ensureAdmin() {
                                throw expectedError;
                            },
                        };
                    }

                    const { logger } = createFakeLogger();

                    await assert.rejects(
                        startServer({
                            database,
                            adminBootstrapperFactory,
                            logger,
                        }),
                        (error) => {
                            assert.strictEqual(
                                error,
                                expectedError,
                            );

                            return true;
                        },
                    );

                    assert.deepEqual(calls.connect, [
                        {
                            uri:
                                TEST_ENVIRONMENT.MONGODB_URI,
                            options: {
                                autoIndex: false,
                            },
                        },
                    ]);

                    assert.equal(calls.disconnect, 1);
                },
                {
                    NODE_ENV: 'production',
                    APP_ORIGIN:
                        'https://calendario.example.com',
                    TRUST_PROXY: '1',
                },
            );
        },
    );
});