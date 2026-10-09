'use strict';

const assert = require('node:assert/strict');
const http = require('node:http');
const {
    describe,
    test,
} = require('node:test');

const {
    APP_ERROR_MESSAGES,
    createApp,
} = require('../src/app');
const {
    FRONTEND_BUILD_DIRECTORY,
    SERVER_ERROR_MESSAGES,
    createAdministrativeAuthenticationRouter,
    startServer,
} = require('../src/server');
const {
    ADMINISTRATIVE_AUTHORIZATION_CODES,
    ADMINISTRATIVE_AUTHORIZATION_ERRORS,
} = require('../src/middlewares/administrativeAuthorization');
const {
    SESSION_AUTHENTICATION_KEY,
} = require('../src/services/SessionManager');
const {
    createAuthenticationRouter,
} = require('../src/routes/authenticationRoutes');

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

async function withTestEnvironment(callback) {
    const originals = {};

    for (const [key, value] of Object.entries(TEST_ENVIRONMENT)) {
        originals[key] = process.env[key];
        process.env[key] = value;
    }

    try {
        await callback();
    } finally {
        for (const key of Object.keys(TEST_ENVIRONMENT)) {
            if (originals[key] === undefined) {
                delete process.env[key];
            } else {
                process.env[key] = originals[key];
            }
        }
    }
}

async function listenTemporarily(app, callback) {
    const server = http.createServer(app);

    await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
    });

    try {
        const address = server.address();
        await callback(`http://127.0.0.1:${address.port}`);
    } finally {
        await new Promise((resolve, reject) => {
            server.close((error) => {
                if (error) {
                    reject(error);
                    return;
                }

                resolve();
            });
        });
    }
}

/**
 * Cria um middleware neutro para cenários que não testam o frontend.
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

describe('integração das rotas de autenticação no Express', () => {
    test('rejeita um roteador de autenticação inválido', () => {
        const invalidRouters = [
            'router',
            42,
            {},
            [],
        ];

        for (const authenticationRouter of invalidRouters) {
            assert.throws(
                () => createApp({ authenticationRouter }),
                {
                    name: 'TypeError',
                    message:
                        APP_ERROR_MESSAGES
                            .INVALID_AUTHENTICATION_ROUTER,
                },
            );
        }
    });

    test(
        'monta o roteador sob /api/auth depois da sessão',
        async () => {
            const order = [];

            function sessionMiddleware(request, response, next) {
                order.push('session');
                request.sessionWasPrepared = true;
                next();
            }

            function authenticationRouter(request, response, next) {
                order.push('authentication');

                if (
                    request.method === 'POST'
                    && request.url === '/login'
                ) {
                    response.status(200).json({
                        sessionWasPrepared:
                            request.sessionWasPrepared,
                    });
                    return;
                }

                next();
            }

            const app = createApp({
                sessionMiddleware,
                authenticationRouter,
            });

            await listenTemporarily(app, async (baseUrl) => {
                const response = await fetch(
                    `${baseUrl}/api/auth/login`,
                    {
                        method: 'POST',
                        headers: {
                            'content-type': 'application/json',
                        },
                        body: JSON.stringify({}),
                    },
                );
                const body = await response.json();

                assert.equal(response.status, 200);
                assert.deepEqual(body, {
                    sessionWasPrepared: true,
                });
                assert.deepEqual(order, [
                    'session',
                    'authentication',
                ]);
            });
        },
    );

    test('não monta o roteador fora do prefixo autorizado', async () => {
        function authenticationRouter(request, response) {
            response.status(204).end();
        }

        const app = createApp({ authenticationRouter });

        await listenTemporarily(app, async (baseUrl) => {
            const response = await fetch(`${baseUrl}/login`, {
                method: 'POST',
            });
            const body = await response.json();

            assert.equal(response.status, 404);
            assert.equal(body.error.code, 'ROUTE_NOT_FOUND');
        });
    });
});

describe('composição da autenticação administrativa', () => {
    test('cria roteadores válidos para desenvolvimento e produção', () => {
        const developmentRouter =
            createAdministrativeAuthenticationRouter({
                passwordHashRounds: 12,
                isProduction: false,
            });

        const productionRouter =
            createAdministrativeAuthenticationRouter({
                passwordHashRounds: 12,
                isProduction: true,
            });

        assert.equal(typeof developmentRouter, 'function');
        assert.equal(typeof productionRouter, 'function');
    });

    test('rejeita configurações inseguras na composição', () => {
        assert.throws(
            () => createAdministrativeAuthenticationRouter({
                passwordHashRounds: 9,
                isProduction: false,
            }),
            {
                name: 'RangeError',
                message:
                    'O custo do hash deve ser um número inteiro entre 10 e 15.',
            },
        );

        assert.throws(
            () => createAdministrativeAuthenticationRouter({
                passwordHashRounds: 12,
                isProduction: 'false',
            }),
            {
                name: 'TypeError',
            },
        );
    });
});

describe('integração da autenticação no ciclo de abertura', () => {
    test('rejeita uma fábrica inválida antes de conectar', async () => {
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
                    authenticationRouterFactory: {},
                    frontendAssetsMiddlewareFactory:
                        createTestFrontendAssetsMiddleware,
                }),
                {
                    name: 'TypeError',
                    message:
                        SERVER_ERROR_MESSAGES
                            .INVALID_AUTHENTICATION_ROUTER_FACTORY,
                },
            );

            assert.equal(connectionAttempts, 0);
        });
    });

    test(
        'constrói a autenticação antes de entregar o app ao Express',
        async () => {
            await withTestEnvironment(async () => {
                const expectedError = new Error(
                    'Parada controlada antes da abertura HTTP.',
                );
                const order = [];
                const nativeClient = { db() {} };
                const sessionStore = {
                    on() {
                        return this;
                    },
                    get() {},
                    set() {},
                    destroy() {},
                };
                const sessionMiddleware = (request, response, next) =>
                    next();
                const authenticationRouter = (
                    request,
                    response,
                    next,
                ) => next();
                const frontendAssetsMiddleware = (
                    request,
                    response,
                    next,
                ) => next();

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

                function adminBootstrapperFactory() {
                    order.push('admin.factory');
                    return {
                        async ensureAdmin() {
                            order.push('admin.ensure');
                        },
                    };
                }

                function sessionStoreFactory() {
                    order.push('session.store.factory');
                    return sessionStore;
                }

                function sessionMiddlewareFactory() {
                    order.push('session.middleware.factory');
                    return sessionMiddleware;
                }

                function authenticationRouterFactory(options) {
                    order.push('authentication.router.factory');
                    assert.deepEqual(options, {
                        passwordHashRounds: 12,
                        isProduction: false,
                    });
                    return authenticationRouter;
                }

                function frontendAssetsMiddlewareFactory(
                    options,
                ) {
                    order.push('frontend.factory');

                    assert.deepEqual(options, {
                        directory:
                            FRONTEND_BUILD_DIRECTORY,
                    });

                    return frontendAssetsMiddleware;
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
                        options.frontendAssetsMiddleware,
                        frontendAssetsMiddleware,
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
                        // O banco é simulado; a preparação dos índices também.
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
                        sessionStoreFactory,
                        sessionMiddlewareFactory,
                        authenticationRouterFactory,
                        frontendAssetsMiddlewareFactory,
                        logger,
                    }),
                    expectedError,
                );

                assert.deepEqual(order, [
                    'frontend.factory',
                    'database.connect',
                    'indexes.factory',
                    'indexes.ready',
                    'admin.factory',
                    'admin.ensure',
                    'database.getNativeClient',
                    'session.store.factory',
                    'session.middleware.factory',
                    'authentication.router.factory',
                    'app.factory',
                    'database.disconnect',
                ]);
            });
        },
    );
});

/**
 * Cria uma aplicação HTTP com uma sessão controlada pelo teste.
 *
 * A autorização e o roteador são os componentes reais da aplicação. Somente
 * a preparação da sessão e os handlers que não participam da consulta são
 * substituídos, mantendo o teste independente de MongoDB e bcrypt.
 *
 * @param {object | undefined} sessionIdentity Identidade colocada na sessão.
 * @returns {import('express').Express} Aplicação configurada.
 */
function createProtectedSessionTestApp(sessionIdentity) {
    const controller = {
        login(request, response) {
            response.status(204).end();
        },

        getSession(request, response) {
            response.status(200).json({
                data: {
                    authenticated: true,
                    user: request.authenticatedUser,
                },
            });
        },

        logout(request, response) {
            response.status(204).end();
        },
    };

    function loginRateLimiter(request, response, next) {
        next();
    }

    const authenticationRouter = createAuthenticationRouter({
        controller,
        loginRateLimiter,
    });

    function sessionMiddleware(request, response, next) {
        request.session = {};

        if (sessionIdentity !== undefined) {
            request.session[SESSION_AUTHENTICATION_KEY] = {
                ...sessionIdentity,
            };
        }

        next();
    }

    return createApp({
        sessionMiddleware,
        authenticationRouter,
        logger: {
            error() {},
        },
    });
}

describe('integração HTTP da autorização administrativa', () => {
    test('recusa a consulta quando não existe autenticação', async () => {
        const app = createProtectedSessionTestApp(undefined);

        await listenTemporarily(app, async (baseUrl) => {
            const response = await fetch(
                `${baseUrl}/api/auth/session`,
            );
            const body = await response.json();

            assert.equal(response.status, 401);
            assert.equal(response.headers.get('set-cookie'), null);
            assert.deepEqual(body, {
                error: {
                    code:
                        ADMINISTRATIVE_AUTHORIZATION_CODES
                            .AUTHENTICATION_REQUIRED,
                    message:
                        ADMINISTRATIVE_AUTHORIZATION_ERRORS
                            .AUTHENTICATION_REQUIRED,
                },
            });
        });
    });

    test('recusa uma sessão sem papel administrativo', async () => {
        const app = createProtectedSessionTestApp({
            userId: 'usuario-sem-autorizacao',
            role: 'viewer',
        });

        await listenTemporarily(app, async (baseUrl) => {
            const response = await fetch(
                `${baseUrl}/api/auth/session`,
            );
            const body = await response.json();

            assert.equal(response.status, 403);
            assert.equal(response.headers.get('set-cookie'), null);
            assert.deepEqual(body, {
                error: {
                    code:
                        ADMINISTRATIVE_AUTHORIZATION_CODES
                            .ADMINISTRATIVE_ACCESS_REQUIRED,
                    message:
                        ADMINISTRATIVE_AUTHORIZATION_ERRORS
                            .ADMINISTRATIVE_ACCESS_REQUIRED,
                },
            });
        });
    });

    test('retorna somente a identidade mínima do administrador', async () => {
        const administrativeIdentity = {
            userId: '507f1f77bcf86cd799439011',
            role: 'admin',
            name: 'Nome que não pode ser exposto',
            email: 'nao-expor@example.com',
            passwordHash: 'hash-que-nao-pode-ser-exposto',
        };

        const app = createProtectedSessionTestApp(
            administrativeIdentity,
        );

        await listenTemporarily(app, async (baseUrl) => {
            const response = await fetch(
                `${baseUrl}/api/auth/session`,
            );
            const body = await response.json();

            assert.equal(response.status, 200);
            assert.equal(response.headers.get('set-cookie'), null);
            assert.deepEqual(body, {
                data: {
                    authenticated: true,
                    user: {
                        id: '507f1f77bcf86cd799439011',
                        role: 'admin',
                    },
                },
            });

            assert.equal(
                JSON.stringify(body).includes(
                    'nao-expor@example.com',
                ),
                false,
            );
            assert.equal(
                JSON.stringify(body).includes(
                    'hash-que-nao-pode-ser-exposto',
                ),
                false,
            );
        });
    });
});
