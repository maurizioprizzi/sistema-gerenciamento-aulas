'use strict';

const assert = require('node:assert/strict');
const {
    describe,
    test,
} = require('node:test');

const {
    createAdminBootstrapper,
    createAdministrativeLessonRouter,
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

/**
 * Cria um middleware neutro para os testes do ciclo do servidor.
 *
 * A compilação real do frontend possui testes próprios. Aqui precisamos
 * apenas representar sua dependência sem acessar client/dist.
 *
 * @returns {Function} Middleware Express controlado.
 */
function createTestFrontendAssetsMiddleware() {
    return function frontendAssetsMiddleware(
        request,
        response,
        next,
    ) {
        next();
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

describe('createAdministrativeLessonRouter', () => {
    test('compõe um roteador válido sem abrir conexão com o banco', () => {
        const router = createAdministrativeLessonRouter();

        assert.equal(typeof router, 'function');
        assert.equal(typeof router.get, 'function');
        assert.equal(typeof router.post, 'function');
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
                        frontendAssetsMiddlewareFactory:
                            createTestFrontendAssetsMiddleware,
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
                        frontendAssetsMiddlewareFactory:
                            createTestFrontendAssetsMiddleware,
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
                        frontendAssetsMiddlewareFactory:
                            createTestFrontendAssetsMiddleware,
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
                        frontendAssetsMiddlewareFactory:
                            createTestFrontendAssetsMiddleware,
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
        'rejeita uma fábrica de armazenamento inválida antes de conectar',
        async () => {
            await withTestEnvironment(async () => {
                const calls = {
                    connect: 0,
                    disconnect: 0,
                };

                const database = {
                    async connect() {
                        calls.connect += 1;
                    },

                    async disconnect() {
                        calls.disconnect += 1;
                    },
                };

                const { logger } = createFakeLogger();

                await assert.rejects(
                    startServer({
                        frontendAssetsMiddlewareFactory:
                            createTestFrontendAssetsMiddleware,
                        database,
                        sessionStoreFactory: null,
                        logger,
                    }),
                    {
                        name: 'TypeError',
                        message:
                            'A fábrica do armazenamento de sessões deve ser uma função.',
                    },
                );

                /**
                 * A falha é estrutural e foi detectada antes que qualquer
                 * recurso externo fosse aberto.
                 */
                assert.equal(calls.connect, 0);
                assert.equal(calls.disconnect, 0);
            });
        },
    );

    test(
        'rejeita uma fábrica de middleware inválida antes de conectar',
        async () => {
            await withTestEnvironment(async () => {
                const calls = {
                    connect: 0,
                    disconnect: 0,
                };

                const database = {
                    async connect() {
                        calls.connect += 1;
                    },

                    async disconnect() {
                        calls.disconnect += 1;
                    },
                };

                const { logger } = createFakeLogger();

                await assert.rejects(
                    startServer({
                        frontendAssetsMiddlewareFactory:
                            createTestFrontendAssetsMiddleware,
                        database,
                        sessionMiddlewareFactory: null,
                        logger,
                    }),
                    {
                        name: 'TypeError',
                        message:
                            'A fábrica do middleware de sessão deve ser uma função.',
                    },
                );

                assert.equal(calls.connect, 0);
                assert.equal(calls.disconnect, 0);
            });
        },
    );

    test(
        'rejeita uma fábrica de aulas inválida antes de conectar',
        async () => {
            await withTestEnvironment(async () => {
                const calls = {
                    connect: 0,
                    disconnect: 0,
                };

                const database = {
                    async connect() {
                        calls.connect += 1;
                    },

                    async disconnect() {
                        calls.disconnect += 1;
                    },
                };

                const { logger } = createFakeLogger();

                await assert.rejects(
                    startServer({
                        frontendAssetsMiddlewareFactory:
                            createTestFrontendAssetsMiddleware,
                        database,
                        lessonRouterFactory: null,
                        logger,
                    }),
                    {
                        name: 'TypeError',
                        message:
                            'A fábrica do roteador de aulas deve ser uma função.',
                    },
                );

                assert.equal(calls.connect, 0);
                assert.equal(calls.disconnect, 0);
            });
        },
    );

    test(
        'desconecta o banco quando a fábrica retorna aulas inválidas',
        async () => {
            await withTestEnvironment(async () => {
                const nativeClient = {
                    db() {
                        return {};
                    },
                };

                const sessionStore = {
                    on() {
                        return this;
                    },

                    get() {},
                    set() {},
                    destroy() {},
                };

                const calls = {
                    connect: 0,
                    disconnect: 0,
                    lessonRouterFactory: 0,
                    appFactory: 0,
                };

                const database = {
                    async connect() {
                        calls.connect += 1;
                    },

                    getNativeClient() {
                        return nativeClient;
                    },

                    async disconnect() {
                        calls.disconnect += 1;
                    },
                };

                function adminBootstrapperFactory() {
                    return {
                        async ensureAdmin() {},
                    };
                }

                function sessionStoreFactory() {
                    return sessionStore;
                }

                function sessionMiddlewareFactory() {
                    return function sessionMiddleware(
                        request,
                        response,
                        next
                    ) {
                        next();
                    };
                }

                function authenticationRouterFactory() {
                    return function authenticationRouter(
                        request,
                        response,
                        next
                    ) {
                        next();
                    };
                }

                function lessonRouterFactory() {
                    calls.lessonRouterFactory += 1;

                    return {};
                }

                function appFactory() {
                    calls.appFactory += 1;
                }

                const { logger } = createFakeLogger();

                await assert.rejects(
                    startServer({
                        frontendAssetsMiddlewareFactory:
                            createTestFrontendAssetsMiddleware,
                        database,
                        appFactory,
                        adminBootstrapperFactory,
                        sessionStoreFactory,
                        sessionMiddlewareFactory,
                        authenticationRouterFactory,
                        lessonRouterFactory,
                        logger,
                    }),
                    {
                        name: 'TypeError',
                        message:
                            'A fábrica de aulas deve retornar um roteador válido.',
                    },
                );

                assert.equal(calls.connect, 1);
                assert.equal(calls.disconnect, 1);
                assert.equal(calls.lessonRouterFactory, 1);
                assert.equal(calls.appFactory, 0);
            });
        },
    );

    test(
        'desconecta o banco quando o armazenamento de sessões falha',
        async () => {
            await withTestEnvironment(async () => {
                const expectedError = new Error(
                    'Falha controlada no armazenamento de sessões.',
                );

                const nativeClient = {
                    db() {
                        return {};
                    },
                };

                const calls = {
                    connect: 0,
                    getNativeClient: 0,
                    disconnect: 0,
                    sessionStoreFactory: 0,
                    sessionMiddlewareFactory: 0,
                    appFactory: 0,
                };

                const database = {
                    async connect() {
                        calls.connect += 1;
                    },

                    getNativeClient() {
                        calls.getNativeClient += 1;

                        return nativeClient;
                    },

                    async disconnect() {
                        calls.disconnect += 1;
                    },
                };

                function adminBootstrapperFactory() {
                    return {
                        async ensureAdmin() {},
                    };
                }

                function sessionStoreFactory(options) {
                    calls.sessionStoreFactory += 1;

                    assert.strictEqual(
                        options.nativeClient,
                        nativeClient,
                    );
                    assert.equal(
                        options.maxAgeMs,
                        60 * 60 * 1000,
                    );

                    throw expectedError;
                }

                function sessionMiddlewareFactory() {
                    calls.sessionMiddlewareFactory += 1;

                    throw new Error(
                        'O middleware de sessão não deveria ser criado.',
                    );
                }

                function appFactory() {
                    calls.appFactory += 1;

                    throw new Error(
                        'O Express não deveria ser criado.',
                    );
                }

                const { logger } = createFakeLogger();

                await assert.rejects(
                    startServer({
                        frontendAssetsMiddlewareFactory:
                            createTestFrontendAssetsMiddleware,
                        database,
                        appFactory,
                        adminBootstrapperFactory,
                        sessionStoreFactory,
                        sessionMiddlewareFactory,
                        logger,
                    }),
                    (error) => {
                        assert.strictEqual(error, expectedError);

                        return true;
                    },
                );

                assert.equal(calls.connect, 1);
                assert.equal(calls.getNativeClient, 1);
                assert.equal(calls.disconnect, 1);
                assert.equal(calls.sessionStoreFactory, 1);
                assert.equal(
                    calls.sessionMiddlewareFactory,
                    0,
                );
                assert.equal(calls.appFactory, 0);
            });
        },
    );

    test(
        'desconecta o banco quando o middleware de sessão falha',
        async () => {
            await withTestEnvironment(async () => {
                const expectedError = new Error(
                    'Falha controlada no middleware de sessão.',
                );

                const nativeClient = {
                    db() {
                        return {};
                    },
                };

                const sessionStore = {
                    on(eventName, listener) {
                        assert.equal(eventName, 'error');
                        assert.equal(typeof listener, 'function');

                        return this;
                    },

                    get() {},
                    set() {},
                    destroy() {},
                };

                const calls = {
                    connect: 0,
                    disconnect: 0,
                    sessionStoreFactory: 0,
                    sessionMiddlewareFactory: 0,
                    appFactory: 0,
                };

                const database = {
                    async connect() {
                        calls.connect += 1;
                    },

                    getNativeClient() {
                        return nativeClient;
                    },

                    async disconnect() {
                        calls.disconnect += 1;
                    },
                };

                function adminBootstrapperFactory() {
                    return {
                        async ensureAdmin() {},
                    };
                }

                function sessionStoreFactory(options) {
                    calls.sessionStoreFactory += 1;

                    assert.strictEqual(
                        options.nativeClient,
                        nativeClient,
                    );

                    return sessionStore;
                }

                function sessionMiddlewareFactory(options) {
                    calls.sessionMiddlewareFactory += 1;

                    assert.strictEqual(
                        options.store,
                        sessionStore,
                    );
                    assert.equal(
                        options.secret,
                        TEST_ENVIRONMENT.SESSION_SECRET,
                    );
                    assert.equal(
                        options.maxAgeMs,
                        60 * 60 * 1000,
                    );
                    assert.equal(
                        options.isProduction,
                        false,
                    );

                    throw expectedError;
                }

                function appFactory() {
                    calls.appFactory += 1;

                    throw new Error(
                        'O Express não deveria ser criado.',
                    );
                }

                const { logger, entries } =
                    createFakeLogger();

                await assert.rejects(
                    startServer({
                        frontendAssetsMiddlewareFactory:
                            createTestFrontendAssetsMiddleware,
                        database,
                        appFactory,
                        adminBootstrapperFactory,
                        sessionStoreFactory,
                        sessionMiddlewareFactory,
                        logger,
                    }),
                    (error) => {
                        assert.strictEqual(error, expectedError);

                        return true;
                    },
                );

                assert.equal(calls.connect, 1);
                assert.equal(calls.disconnect, 1);
                assert.equal(calls.sessionStoreFactory, 1);
                assert.equal(
                    calls.sessionMiddlewareFactory,
                    1,
                );
                assert.equal(calls.appFactory, 0);

                /**
                 * Nem o segredo de sessão nem a senha administrativa podem
                 * aparecer nos registros produzidos durante a falha.
                 */
                const serializedLogs = JSON.stringify(entries);

                assert.equal(
                    serializedLogs.includes(
                        TEST_ENVIRONMENT.SESSION_SECRET,
                    ),
                    false,
                );
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
        'executa banco, administrador, sessões e Express na ordem correta',
        async () => {
            await withTestEnvironment(async () => {
                const expectedError = new Error(
                    'Parada controlada antes da abertura HTTP.',
                );

                const order = [];

                /**
                 * Representa o mesmo cliente MongoDB nativo que seria mantido
                 * internamente pelo Mongoose.
                 */
                const nativeClient = {
                    db() {
                        return {};
                    },
                };

                /**
                 * O armazenamento possui somente o contrato necessário para
                 * esta etapa da composição. Os detalhes do connect-mongo já
                 * estão cobertos isoladamente em session.test.js.
                 */
                const sessionStore = {
                    on(eventName, listener) {
                        order.push(`session.store.on:${eventName}`);

                        assert.equal(eventName, 'error');
                        assert.equal(typeof listener, 'function');

                        return this;
                    },

                    get() {},
                    set() {},
                    destroy() {},
                };

                const sessionMiddleware = (
                    request,
                    response,
                    next
                ) => next();

                const authenticationRouter = (
                    request,
                    response,
                    next
                ) => next();

                const lessonRouter = (
                    request,
                    response,
                    next
                ) => next();

                const database = {
                    async connect() {
                        order.push('database.connect');
                    },

                    getNativeClient() {
                        order.push(
                            'database.getNativeClient',
                        );

                        return nativeClient;
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

                function sessionStoreFactory(options) {
                    order.push('session.store.factory');

                    assert.strictEqual(
                        options.nativeClient,
                        nativeClient,
                    );
                    assert.equal(
                        options.maxAgeMs,
                        60 * 60 * 1000,
                    );

                    return sessionStore;
                }

                function sessionMiddlewareFactory(options) {
                    order.push('session.middleware.factory');

                    assert.strictEqual(
                        options.store,
                        sessionStore,
                    );
                    assert.equal(
                        options.secret,
                        TEST_ENVIRONMENT.SESSION_SECRET,
                    );
                    assert.equal(
                        options.maxAgeMs,
                        60 * 60 * 1000,
                    );
                    assert.equal(
                        options.isProduction,
                        false,
                    );

                    return sessionMiddleware;
                }

                function authenticationRouterFactory(options) {
                    order.push('authentication.router.factory');

                    assert.equal(
                        options.passwordHashRounds,
                        13,
                    );
                    assert.equal(options.isProduction, false);

                    return authenticationRouter;
                }

                function lessonRouterFactory() {
                    order.push('lesson.router.factory');

                    return lessonRouter;
                }

                function appFactory(options) {
                    order.push('app.factory');

                    assert.strictEqual(
                        options.sessionMiddleware,
                        sessionMiddleware,
                    );
                    assert.strictEqual(
                        options.authenticationRouter,
                        authenticationRouter,
                    );
                    assert.strictEqual(
                        options.lessonRouter,
                        lessonRouter,
                    );

                    /**
                     * A mesma instância do logger deve atravessar todo o ponto
                     * de composição.
                     */
                    assert.strictEqual(
                        options.logger,
                        logger,
                    );

                    /**
                     * A falha intencional interrompe o teste antes da criação
                     * de um servidor HTTP real.
                     */
                    throw expectedError;
                }

                const { logger } = createFakeLogger();

                await assert.rejects(
                    startServer({
                        frontendAssetsMiddlewareFactory:
                            createTestFrontendAssetsMiddleware,
                        database,
                        appFactory,
                        adminBootstrapperFactory,
                        sessionStoreFactory,
                        sessionMiddlewareFactory,
                        authenticationRouterFactory,
                        lessonRouterFactory,
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
                    'database.getNativeClient',
                    'session.store.factory',
                    'session.store.on:error',
                    'session.middleware.factory',
                    'authentication.router.factory',
                    'lesson.router.factory',
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
                            frontendAssetsMiddlewareFactory:
                                createTestFrontendAssetsMiddleware,
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