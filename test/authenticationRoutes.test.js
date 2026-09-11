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

function createRouter(calls = []) {
    return {
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

    test('limita o login e mantém o logout disponível', () => {
        const calls = [];
        const controller = createController();
        const loginRateLimiter = createLoginRateLimiter();
        const router = createRouter(calls);
        let factoryCalls = 0;

        const result = createAuthenticationRouter({
            controller,
            loginRateLimiter,
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

    test('valida controlador e limitador antes da fábrica', () => {
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

        router.post = (path, ...handlers) => {
            calls.push({ path, handlers });
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
        assert.equal(calls.length, 2);
        assert.equal(calls[0].handlers.length, 2);
        assert.equal(calls[1].handlers.length, 1);
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
