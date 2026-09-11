'use strict';

const assert = require('node:assert/strict');
const {
    describe,
    test,
} = require('node:test');

const {
    AUTHENTICATION_ROUTE_ERRORS,
    AUTHENTICATION_ROUTE_PATHS,
    createAuthenticationRouter,
} = require('../src/routes/authenticationRoutes');

function createController(overrides = {}) {
    return {
        login() {},
        getSession() {},
        logout() {},
        ...overrides,
    };
}

function createLoginRateLimiter() {
    return function loginRateLimiter(
        request,
        response,
        next,
    ) {
        next();
    };
}

function createAdministrativeAuthorization() {
    return function administrativeAuthorization(
        request,
        response,
        next,
    ) {
        next();
    };
}

function createRouter(calls = []) {
    return {
        get(path, ...handlers) {
            calls.push({
                method: 'get',
                path,
                handlers,
            });

            return this;
        },

        post(path, ...handlers) {
            calls.push({
                method: 'post',
                path,
                handlers,
            });

            return this;
        },
    };
}

describe('createAuthenticationRouter', () => {
    test('expõe caminhos e mensagens protegidos', () => {
        assert.deepEqual(AUTHENTICATION_ROUTE_PATHS, {
            LOGIN: '/login',
            SESSION: '/session',
            LOGOUT: '/logout',
        });
        assert.equal(
            Object.isFrozen(AUTHENTICATION_ROUTE_PATHS),
            true,
        );
        assert.equal(
            Object.isFrozen(AUTHENTICATION_ROUTE_ERRORS),
            true,
        );
    });

    test('protege a sessão, limita o login e preserva o logout', () => {
        const calls = [];
        const controller = createController();
        const loginRateLimiter = createLoginRateLimiter();
        const administrativeAuthorizationMiddleware =
            createAdministrativeAuthorization();
        const router = createRouter(calls);
        let factoryCalls = 0;

        const result = createAuthenticationRouter({
            controller,
            loginRateLimiter,
            administrativeAuthorizationMiddleware,
            routerFactory() {
                factoryCalls += 1;
                return router;
            },
        });

        assert.equal(factoryCalls, 1);
        assert.equal(result, router);
        assert.deepEqual(calls, [
            {
                method: 'post',
                path: '/login',
                handlers: [
                    loginRateLimiter,
                    controller.login,
                ],
            },
            {
                method: 'get',
                path: '/session',
                handlers: [
                    administrativeAuthorizationMiddleware,
                    controller.getSession,
                ],
            },
            {
                method: 'post',
                path: '/logout',
                handlers: [controller.logout],
            },
        ]);
    });

    test('rejeita controladores inválidos', () => {
        const invalidControllers = [
            undefined,
            null,
            [],
            {},
            { login() {} },
            { logout() {} },
            { login: true, logout() {} },
            { login() {}, logout: true },
            { login() {}, logout() {} },
        ];

        for (const controller of invalidControllers) {
            assert.throws(
                () => createAuthenticationRouter({
                    controller,
                    loginRateLimiter:
                        createLoginRateLimiter(),
                    routerFactory: createRouter,
                }),
                {
                    name: 'TypeError',
                    message:
                        AUTHENTICATION_ROUTE_ERRORS
                            .INVALID_CONTROLLER,
                },
            );
        }
    });

    test('rejeita limitadores de login inválidos', () => {
        const invalidLimiters = [
            undefined,
            null,
            42,
            'limiter',
            {},
            [],
        ];

        for (const loginRateLimiter of invalidLimiters) {
            assert.throws(
                () => createAuthenticationRouter({
                    controller: createController(),
                    loginRateLimiter,
                    routerFactory: createRouter,
                }),
                {
                    name: 'TypeError',
                    message:
                        AUTHENTICATION_ROUTE_ERRORS
                            .INVALID_LOGIN_RATE_LIMITER,
                },
            );
        }
    });

    test('rejeita autorizações administrativas inválidas', () => {
        const invalidMiddlewares = [
            null,
            42,
            'authorization',
            {},
            [],
        ];

        for (const administrativeAuthorizationMiddleware
            of invalidMiddlewares) {
            assert.throws(
                () => createAuthenticationRouter({
                    controller: createController(),
                    loginRateLimiter:
                        createLoginRateLimiter(),
                    administrativeAuthorizationMiddleware,
                    routerFactory: createRouter,
                }),
                {
                    name: 'TypeError',
                    message:
                        AUTHENTICATION_ROUTE_ERRORS
                            .INVALID_ADMINISTRATIVE_AUTHORIZATION,
                },
            );
        }
    });

    test('valida dependências antes da fábrica', () => {
        let factoryCalls = 0;

        function routerFactory() {
            factoryCalls += 1;
            return createRouter();
        }

        assert.throws(
            () => createAuthenticationRouter({
                controller: null,
                loginRateLimiter: null,
                routerFactory,
            }),
            {
                name: 'TypeError',
                message:
                    AUTHENTICATION_ROUTE_ERRORS
                        .INVALID_CONTROLLER,
            },
        );

        assert.throws(
            () => createAuthenticationRouter({
                controller: createController(),
                loginRateLimiter: null,
                routerFactory,
            }),
            {
                name: 'TypeError',
                message:
                    AUTHENTICATION_ROUTE_ERRORS
                        .INVALID_LOGIN_RATE_LIMITER,
            },
        );

        assert.throws(
            () => createAuthenticationRouter({
                controller: createController(),
                loginRateLimiter: createLoginRateLimiter(),
                administrativeAuthorizationMiddleware: null,
                routerFactory,
            }),
            {
                name: 'TypeError',
                message:
                    AUTHENTICATION_ROUTE_ERRORS
                        .INVALID_ADMINISTRATIVE_AUTHORIZATION,
            },
        );

        assert.equal(factoryCalls, 0);
    });

    test('rejeita fábricas de roteador inválidas', () => {
        const invalidFactories = [
            null,
            42,
            'router',
            {},
            [],
        ];

        for (const routerFactory of invalidFactories) {
            assert.throws(
                () => createAuthenticationRouter({
                    controller: createController(),
                    loginRateLimiter:
                        createLoginRateLimiter(),
                    routerFactory,
                }),
                {
                    name: 'TypeError',
                    message:
                        AUTHENTICATION_ROUTE_ERRORS
                            .INVALID_ROUTER_FACTORY,
                },
            );
        }
    });

    test('rejeita roteadores sem operação post', () => {
        const invalidRouters = [
            undefined,
            null,
            42,
            'router',
            {},
            { post: true },
            { post() {} },
        ];

        for (const router of invalidRouters) {
            assert.throws(
                () => createAuthenticationRouter({
                    controller: createController(),
                    loginRateLimiter:
                        createLoginRateLimiter(),
                    routerFactory() {
                        return router;
                    },
                }),
                {
                    name: 'TypeError',
                    message:
                        AUTHENTICATION_ROUTE_ERRORS.INVALID_ROUTER,
                },
            );
        }
    });

    test('aceita um roteador representado por função', () => {
        const calls = [];

        function router() {}

        router.get = (path, ...handlers) => {
            calls.push({ method: 'get', path, handlers });
            return router;
        };

        router.post = (path, ...handlers) => {
            calls.push({ method: 'post', path, handlers });
            return router;
        };

        const result = createAuthenticationRouter({
            controller: createController(),
            loginRateLimiter: createLoginRateLimiter(),
            routerFactory() {
                return router;
            },
        });

        assert.equal(result, router);
        assert.equal(calls.length, 3);
        assert.deepEqual(
            calls.map((call) => call.method),
            ['post', 'get', 'post'],
        );
        assert.equal(calls[0].handlers.length, 2);
        assert.equal(calls[1].handlers.length, 2);
        assert.equal(calls[2].handlers.length, 1);
    });

    test('propaga uma falha real da fábrica', () => {
        const expectedError = new Error(
            'Falha controlada da fábrica.',
        );

        assert.throws(
            () => createAuthenticationRouter({
                controller: createController(),
                loginRateLimiter:
                    createLoginRateLimiter(),
                routerFactory() {
                    throw expectedError;
                },
            }),
            expectedError,
        );
    });

    test('propaga uma falha durante o registro', () => {
        const expectedError = new Error(
            'Falha controlada ao registrar rota.',
        );

        assert.throws(
            () => createAuthenticationRouter({
                controller: createController(),
                loginRateLimiter:
                    createLoginRateLimiter(),
                routerFactory() {
                    return {
                        get() {},
                        post() {
                            throw expectedError;
                        },
                    };
                },
            }),
            expectedError,
        );
    });
});
