'use strict';

const assert = require('node:assert/strict');
const {
    describe,
    test,
    mock,
} = require('node:test');

const {
    FRONTEND_BUILD_DIRECTORY,
    SERVER_ERROR_MESSAGES,
    startServer,
} = require('../src/server');

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
    INITIAL_SETUP_TOKEN: undefined,
});

async function withTestEnvironment(callback, overrides = {}) {
    const source = {
        ...TEST_ENVIRONMENT,
        ...overrides,
    };
    const originals = {};

    for (const [key, value] of Object.entries(source)) {
        originals[key] = process.env[key];
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
    }

    const dotenvMock = mock.method(require('dotenv'), 'config', () => ({ parsed: {} }));
    try {
        await callback();
    } finally {
        dotenvMock.mock.restore();
        for (const key of Object.keys(source)) {
            if (originals[key] === undefined) {
                delete process.env[key];
            } else {
                process.env[key] = originals[key];
            }
        }
    }
}

describe('cabeçalhos de segurança no ciclo do servidor', () => {
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
                        courseRouterFactory: () => (_request, _response, next) => next(),
                        database,
                        securityHeadersMiddlewareFactory: null,
                    }),
                    {
                        name: 'TypeError',
                        message:
                            SERVER_ERROR_MESSAGES
                                .INVALID_SECURITY_HEADERS_MIDDLEWARE_FACTORY,
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
                        courseRouterFactory: () => (_request, _response, next) => next(),
                        database,
                        securityHeadersMiddlewareFactory() {
                            return {};
                        },
                    }),
                    {
                        name: 'TypeError',
                        message:
                            SERVER_ERROR_MESSAGES
                                .INVALID_SECURITY_HEADERS_MIDDLEWARE,
                    },
                );

                assert.equal(connectionAttempts, 0);
            });
        },
    );

    test(
        'entrega ao Express a segurança adequada ao ambiente',
        async () => {
            await withTestEnvironment(
                async () => {
                    const expectedError = new Error(
                        'Parada controlada antes da abertura HTTP.',
                    );
                    const order = [];
                    const nativeClient = { db() {} };
                    const initialSetupRouter = (_request, _response, next) => next();
                    const securityHeadersMiddleware = (
                        request,
                        response,
                        next,
                    ) => next();
                    const frontendAssetsMiddleware = (
                        request,
                        response,
                        next,
                    ) => next();
                    const sessionMiddleware = (
                        request,
                        response,
                        next,
                    ) => next();
                    const authenticationRouter = (
                        request,
                        response,
                        next,
                    ) => next();
                    const sessionStore = {
                        on(eventName) {
                            order.push(`session.store.on:${eventName}`);
                            return this;
                        },
                        get() {},
                        set() {},
                        destroy() {},
                    };

                    const database = {
                        async connect() {
                            order.push('database.connect');
                        },
                        getNativeClient() {
                            order.push('database.getNativeClient');
                            return nativeClient;
                        },
                        async disconnect() {
                            order.push('database.disconnect');
                        },
                    };

                    function securityHeadersMiddlewareFactory(
                        options,
                    ) {
                        order.push('security.headers.factory');
                        assert.deepEqual(options, {
                            isProduction: true,
                        });
                        return securityHeadersMiddleware;
                    }

                    function frontendAssetsMiddlewareFactory(
                        options,
                    ) {
                        order.push('frontend.assets.factory');

                        assert.deepEqual(options, {
                            directory:
                                FRONTEND_BUILD_DIRECTORY,
                        });

                        return frontendAssetsMiddleware;
                    }

                    function adminBootstrapperFactory() {
                        order.push('admin.factory');
                        return {
                            async ensureAdmin() {
                                order.push('admin.ensure');
                            },
                        };
                    }

                    function administrativeStartupServiceFactory({ adminBootstrapper }) {
                        order.push('startup.factory');
                        return {
                            async initialize({ adminCredentials, initialSetupToken }) {
                                order.push('startup.initialize');
                                assert.equal(initialSetupToken, undefined);
                                await adminBootstrapper.ensureAdmin(adminCredentials);
                                return { status: 'created_admin' };
                            },
                        };
                    }

                    function initialSetupRouterFactory(options) {
                        order.push('setup.router.factory');
                        assert.deepEqual(options, {
                            passwordHashRounds: 12,
                            initialSetupToken: undefined,
                            appOrigin: 'https://calendario.example.com',
                        });
                        return initialSetupRouter;
                    }

                    function sessionStoreFactory(options) {
                        order.push('session.store.factory');
                        assert.strictEqual(
                            options.nativeClient,
                            nativeClient,
                        );
                        return sessionStore;
                    }

                    function sessionMiddlewareFactory(options) {
                        order.push('session.middleware.factory');
                        assert.strictEqual(
                            options.store,
                            sessionStore,
                        );
                        return sessionMiddleware;
                    }

                    function authenticationRouterFactory(options) {
                        order.push('authentication.router.factory');
                        assert.equal(options.isProduction, true);
                        return authenticationRouter;
                    }

                    function appFactory(options) {
                        order.push('app.factory');
                        assert.strictEqual(options.initialSetupRouter, initialSetupRouter);
                        assert.strictEqual(
                            options.securityHeadersMiddleware,
                            securityHeadersMiddleware,
                        );
                        assert.strictEqual(
                            options.frontendAssetsMiddleware,
                            frontendAssetsMiddleware,
                        );
                        assert.strictEqual(
                            options.sessionMiddleware,
                            sessionMiddleware,
                        );
                        assert.strictEqual(
                            options.authenticationRouter,
                            authenticationRouter,
                        );
                        throw expectedError;
                    }

                    const logger = {
                        log() {},
                        info() {},
                        error() {},
                    };

                    await assert.rejects(
                        startServer({
                            courseRouterFactory: () => (_request, _response, next) => next(),
                            // O banco simulado exige preparação de índices simulada.
                            administrativeIndexInitializerFactory() {
                                order.push('indexes.factory');
                                return {
                                    async initialize() {
                                        order.push('indexes.ready');
                                    },
                                };
                            },
                            database,
                            appFactory,
                            adminBootstrapperFactory,
                            administrativeStartupServiceFactory,
                            initialSetupRouterFactory,
                            sessionStoreFactory,
                            sessionMiddlewareFactory,
                            authenticationRouterFactory,
                            securityHeadersMiddlewareFactory,
                            frontendAssetsMiddlewareFactory,
                            logger,
                        }),
                        expectedError,
                    );

                    assert.deepEqual(order, [
                        'security.headers.factory',
                        'frontend.assets.factory',
                        'database.connect',
                        'indexes.factory',
                        'indexes.ready',
                        'admin.factory',
                        'startup.factory',
                        'startup.initialize',
                        'admin.ensure',
                        'database.getNativeClient',
                        'session.store.factory',
                        'session.store.on:error',
                        'session.middleware.factory',
                        'authentication.router.factory',
                        'setup.router.factory',
                        'app.factory',
                        'database.disconnect',
                    ]);
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
