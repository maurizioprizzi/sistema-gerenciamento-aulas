'use strict';

const assert = require('node:assert/strict');
const {
    describe,
    test,
} = require('node:test');

const {
    MONTHLY_MATERIAL_ROUTE_ERRORS,
    MONTHLY_MATERIAL_ROUTE_PATHS,
    createMonthlyMaterialRouter,
    defaultMonthlyMaterialRouterFactory,
} = require('../src/routes/monthlyMaterialRoutes');

/**
 * Cria um controlador válido com handlers identificáveis.
 *
 * @returns {{ list: Function, get: Function, save: Function,
 * remove: Function }} Controlador controlado.
 */
function createController() {
    return {
        list() {},
        get() {},
        save() {},
        remove() {},
    };
}

/**
 * Middleware de autorização utilizado nos testes.
 *
 * @param {object} request Requisição fictícia.
 * @param {object} response Resposta fictícia.
 * @param {Function} next Próximo middleware.
 * @returns {void}
 */
function administrativeAuthorizationMiddleware(
    request,
    response,
    next,
) {
    next();
}

/**
 * Cria um roteador substituto e registra as rotas recebidas.
 *
 * @param {object} options Comportamento opcional dos registros.
 * @param {Error|null} options.getError Falha produzida por get().
 * @param {Error|null} options.putError Falha produzida por put().
 * @param {Error|null} options.deleteError Falha produzida por delete().
 * @returns {{ router: object, calls: object }} Roteador e chamadas.
 */
function createFakeRouter({
    getError = null,
    putError = null,
    deleteError = null,
} = {}) {
    const calls = {
        get: [],
        put: [],
        delete: [],
        sequence: [],
    };

    const router = {
        get(...argumentsReceived) {
            calls.get.push(argumentsReceived);
            calls.sequence.push({
                method: 'get',
                arguments: argumentsReceived,
            });

            if (getError) {
                throw getError;
            }

            return router;
        },

        put(...argumentsReceived) {
            calls.put.push(argumentsReceived);
            calls.sequence.push({
                method: 'put',
                arguments: argumentsReceived,
            });

            if (putError) {
                throw putError;
            }

            return router;
        },

        delete(...argumentsReceived) {
            calls.delete.push(argumentsReceived);
            calls.sequence.push({
                method: 'delete',
                arguments: argumentsReceived,
            });

            if (deleteError) {
                throw deleteError;
            }

            return router;
        },
    };

    return {
        router,
        calls,
    };
}

describe('configuração das rotas de materiais mensais', () => {
    test('expõe caminhos e mensagens estáveis protegidos', () => {
        assert.deepEqual(MONTHLY_MATERIAL_ROUTE_PATHS, {
            COLLECTION: '/',
            RESOURCE_BY_MONTH: '/:month',
        });
        assert.deepEqual(MONTHLY_MATERIAL_ROUTE_ERRORS, {
            INVALID_CONTROLLER:
                'As rotas exigem um controlador de materiais mensais válido.',
            INVALID_ADMINISTRATIVE_AUTHORIZATION:
                'As rotas de materiais mensais exigem um middleware de autorização administrativa válido.',
            INVALID_ROUTER_FACTORY:
                'As rotas de materiais mensais exigem uma fábrica de roteador válida.',
            INVALID_ROUTER:
                'A fábrica não retornou um roteador de materiais mensais válido.',
        });
        assert.equal(
            Object.isFrozen(MONTHLY_MATERIAL_ROUTE_PATHS),
            true,
        );
        assert.equal(
            Object.isFrozen(MONTHLY_MATERIAL_ROUTE_ERRORS),
            true,
        );
    });

    test('cria um Router real por meio da fábrica padrão', () => {
        const router = defaultMonthlyMaterialRouterFactory();

        assert.equal(typeof router, 'function');
        assert.equal(typeof router.get, 'function');
        assert.equal(typeof router.put, 'function');
        assert.equal(typeof router.delete, 'function');
    });

    test('protege todas as operações antes dos controladores', () => {
        const controller = createController();
        const { router, calls } = createFakeRouter();

        const result = createMonthlyMaterialRouter({
            controller,
            administrativeAuthorizationMiddleware,
            routerFactory() {
                return router;
            },
        });

        assert.strictEqual(result, router);
        assert.deepEqual(calls.get, [
            [
                MONTHLY_MATERIAL_ROUTE_PATHS.COLLECTION,
                administrativeAuthorizationMiddleware,
                controller.list,
            ],
            [
                MONTHLY_MATERIAL_ROUTE_PATHS.RESOURCE_BY_MONTH,
                administrativeAuthorizationMiddleware,
                controller.get,
            ],
        ]);
        assert.deepEqual(calls.put, [
            [
                MONTHLY_MATERIAL_ROUTE_PATHS.RESOURCE_BY_MONTH,
                administrativeAuthorizationMiddleware,
                controller.save,
            ],
        ]);
        assert.deepEqual(calls.delete, [
            [
                MONTHLY_MATERIAL_ROUTE_PATHS.RESOURCE_BY_MONTH,
                administrativeAuthorizationMiddleware,
                controller.remove,
            ],
        ]);
        assert.deepEqual(
            calls.sequence.map((entry) => entry.method),
            ['get', 'get', 'put', 'delete'],
        );
    });

    test('rejeita controladores inválidos', () => {
        const invalidControllers = [
            undefined,
            null,
            false,
            'controlador',
            42,
            [],
            {},
            { list() {}, get() {}, save() {} },
            { list() {}, get() {}, remove() {} },
            { list() {}, save() {}, remove() {} },
            { get() {}, save() {}, remove() {} },
            {
                list: 'não é função',
                get() {},
                save() {},
                remove() {},
            },
            {
                list() {},
                get: 'não é função',
                save() {},
                remove() {},
            },
            {
                list() {},
                get() {},
                save: 'não é função',
                remove() {},
            },
            {
                list() {},
                get() {},
                save() {},
                remove: 'não é função',
            },
        ];

        for (const controller of invalidControllers) {
            assert.throws(
                () => createMonthlyMaterialRouter({ controller }),
                {
                    name: 'TypeError',
                    message:
                        MONTHLY_MATERIAL_ROUTE_ERRORS
                            .INVALID_CONTROLLER,
                },
            );
        }
    });

    test('rejeita middlewares de autorização inválidos', () => {
        const controller = createController();
        const invalidMiddlewares = [
            null,
            false,
            'autorização',
            42,
            {},
            [],
        ];

        for (const invalidMiddleware of invalidMiddlewares) {
            assert.throws(
                () => createMonthlyMaterialRouter({
                    controller,
                    administrativeAuthorizationMiddleware:
                        invalidMiddleware,
                }),
                {
                    name: 'TypeError',
                    message:
                        MONTHLY_MATERIAL_ROUTE_ERRORS
                            .INVALID_ADMINISTRATIVE_AUTHORIZATION,
                },
            );
        }
    });

    test('rejeita fábricas de roteador inválidas', () => {
        const controller = createController();
        const invalidFactories = [
            null,
            false,
            'fábrica',
            42,
            {},
            [],
        ];

        for (const routerFactory of invalidFactories) {
            assert.throws(
                () => createMonthlyMaterialRouter({
                    controller,
                    administrativeAuthorizationMiddleware,
                    routerFactory,
                }),
                {
                    name: 'TypeError',
                    message:
                        MONTHLY_MATERIAL_ROUTE_ERRORS
                            .INVALID_ROUTER_FACTORY,
                },
            );
        }
    });

    test('valida dependências antes de executar a fábrica', () => {
        let factoryCalls = 0;

        function routerFactory() {
            factoryCalls += 1;

            return createFakeRouter().router;
        }

        assert.throws(
            () => createMonthlyMaterialRouter({
                controller: null,
                administrativeAuthorizationMiddleware,
                routerFactory,
            }),
            {
                message:
                    MONTHLY_MATERIAL_ROUTE_ERRORS
                        .INVALID_CONTROLLER,
            },
        );

        assert.throws(
            () => createMonthlyMaterialRouter({
                controller: createController(),
                administrativeAuthorizationMiddleware: null,
                routerFactory,
            }),
            {
                message:
                    MONTHLY_MATERIAL_ROUTE_ERRORS
                        .INVALID_ADMINISTRATIVE_AUTHORIZATION,
            },
        );

        assert.equal(factoryCalls, 0);
    });

    test('rejeita resultados de fábrica que não sejam roteadores', () => {
        const controller = createController();
        const invalidRouters = [
            undefined,
            null,
            false,
            'roteador',
            42,
            {},
            { get() {} },
            { put() {} },
            { delete() {} },
            { get() {}, put() {} },
            { get() {}, delete() {} },
            { put() {}, delete() {} },
            {
                get: 'não é função',
                put() {},
                delete() {},
            },
            {
                get() {},
                put: 'não é função',
                delete() {},
            },
            {
                get() {},
                put() {},
                delete: 'não é função',
            },
        ];

        for (const invalidRouter of invalidRouters) {
            assert.throws(
                () => createMonthlyMaterialRouter({
                    controller,
                    administrativeAuthorizationMiddleware,
                    routerFactory() {
                        return invalidRouter;
                    },
                }),
                {
                    name: 'TypeError',
                    message:
                        MONTHLY_MATERIAL_ROUTE_ERRORS
                            .INVALID_ROUTER,
                },
            );
        }
    });

    test('aceita um roteador representado por função', () => {
        const calls = {
            get: [],
            put: [],
            delete: [],
        };

        function router() {}

        router.get = (...argumentsReceived) => {
            calls.get.push(argumentsReceived);
        };
        router.put = (...argumentsReceived) => {
            calls.put.push(argumentsReceived);
        };
        router.delete = (...argumentsReceived) => {
            calls.delete.push(argumentsReceived);
        };

        const controller = createController();
        const result = createMonthlyMaterialRouter({
            controller,
            administrativeAuthorizationMiddleware,
            routerFactory() {
                return router;
            },
        });

        assert.strictEqual(result, router);
        assert.equal(calls.get.length, 2);
        assert.equal(calls.put.length, 1);
        assert.equal(calls.delete.length, 1);
    });

    test('propaga uma falha real da fábrica', () => {
        const expectedError = new Error(
            'Falha controlada ao criar o roteador.',
        );

        assert.throws(
            () => createMonthlyMaterialRouter({
                controller: createController(),
                administrativeAuthorizationMiddleware,
                routerFactory() {
                    throw expectedError;
                },
            }),
            (error) => {
                assert.strictEqual(error, expectedError);

                return true;
            },
        );
    });

    test('propaga falhas reais durante o registro das rotas', () => {
        const getError = new Error(
            'Falha controlada ao registrar GET.',
        );
        const putError = new Error(
            'Falha controlada ao registrar PUT.',
        );
        const deleteError = new Error(
            'Falha controlada ao registrar DELETE.',
        );

        const scenarios = [
            {
                router: createFakeRouter({ getError }).router,
                expectedError: getError,
            },
            {
                router: createFakeRouter({ putError }).router,
                expectedError: putError,
            },
            {
                router: createFakeRouter({ deleteError }).router,
                expectedError: deleteError,
            },
        ];

        for (const { router, expectedError } of scenarios) {
            assert.throws(
                () => createMonthlyMaterialRouter({
                    controller: createController(),
                    administrativeAuthorizationMiddleware,
                    routerFactory() {
                        return router;
                    },
                }),
                (error) => {
                    assert.strictEqual(error, expectedError);

                    return true;
                },
            );
        }
    });
});
