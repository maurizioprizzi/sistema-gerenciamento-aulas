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

function createRouter(calls = []) {
    return {
        post(path, handler) {
            calls.push({
                method: 'post',
                path,
                handler,
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

    test('registra login e logout na ordem esperada', () => {
        const calls = [];
        const controller = createController();
        const router = createRouter(calls);
        let factoryCalls = 0;

        const result = createAuthenticationRouter({
            controller,
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
                handler: controller.login,
            },
            {
                method: 'post',
                path: '/logout',
                handler: controller.logout,
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

    test('valida o controlador antes da fábrica', () => {
        let factoryCalls = 0;

        assert.throws(
            () => createAuthenticationRouter({
                controller: null,
                routerFactory() {
                    factoryCalls += 1;

                    return createRouter();
                },
            }),
            {
                name: 'TypeError',
                message:
                    AUTHENTICATION_ROUTE_ERRORS
                        .INVALID_CONTROLLER,
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

        router.post = (path, handler) => {
            calls.push({ path, handler });

            return router;
        };

        const controller = createController();

        const result = createAuthenticationRouter({
            controller,
            routerFactory() {
                return router;
            },
        });

        assert.equal(result, router);
        assert.equal(calls.length, 2);
    });

    test('propaga uma falha real da fábrica', () => {
        const expectedError = new Error(
            'Falha controlada da fábrica.',
        );

        assert.throws(
            () => createAuthenticationRouter({
                controller: createController(),
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
