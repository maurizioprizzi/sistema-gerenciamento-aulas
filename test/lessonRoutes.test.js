'use strict';

const assert = require('node:assert/strict');
const {
    describe,
    test,
} = require('node:test');

const {
    LESSON_ROUTE_ERRORS,
    LESSON_ROUTE_PATHS,
    createLessonRouter,
    defaultLessonRouterFactory,
} = require('../src/routes/lessonRoutes');

/**
 * Cria um controlador válido com handlers identificáveis.
 *
 * @returns {{ create: Function, update: Function,
 * delete: Function, list: Function }} Controlador controlado.
 */
function createController() {
    return {
        create() {},
        update() {},
        delete() {},
        list() {},
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
 * @param {Error|null} options.postError Falha produzida por post().
 * @param {Error|null} options.putError Falha produzida por put().
 * @param {Error|null} options.deleteError Falha produzida por delete().
 * @returns {{ router: object, calls: object }} Roteador e chamadas.
 */
function createFakeRouter({
    getError = null,
    postError = null,
    putError = null,
    deleteError = null,
} = {}) {
    const calls = {
        get: [],
        post: [],
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

        post(...argumentsReceived) {
            calls.post.push(argumentsReceived);
            calls.sequence.push({
                method: 'post',
                arguments: argumentsReceived,
            });

            if (postError) {
                throw postError;
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

describe('configuração das rotas de aulas', () => {
    test('expõe caminhos e mensagens estáveis protegidos', () => {
        assert.deepEqual(LESSON_ROUTE_PATHS, {
            COLLECTION: '/',
            ITEM: '/:id',
        });
        assert.deepEqual(LESSON_ROUTE_ERRORS, {
            INVALID_CONTROLLER:
                'As rotas exigem um controlador de aulas válido.',
            INVALID_ADMINISTRATIVE_AUTHORIZATION:
                'As rotas de aulas exigem um middleware de autorização administrativa válido.',
            INVALID_ROUTER_FACTORY:
                'As rotas de aulas exigem uma fábrica de roteador válida.',
            INVALID_ROUTER:
                'A fábrica não retornou um roteador de aulas válido.',
        });
        assert.equal(Object.isFrozen(LESSON_ROUTE_PATHS), true);
        assert.equal(Object.isFrozen(LESSON_ROUTE_ERRORS), true);
    });

    test('cria um Router real por meio da fábrica padrão', () => {
        const router = defaultLessonRouterFactory();

        assert.equal(typeof router, 'function');
        assert.equal(typeof router.get, 'function');
        assert.equal(typeof router.post, 'function');
        assert.equal(typeof router.put, 'function');
        assert.equal(typeof router.delete, 'function');
    });

    test('protege criação, edição, exclusão e consulta antes dos controladores', () => {
        const controller = createController();
        const { router, calls } = createFakeRouter();

        const result = createLessonRouter({
            controller,
            administrativeAuthorizationMiddleware,
            routerFactory() {
                return router;
            },
        });

        assert.strictEqual(result, router);
        assert.deepEqual(calls.get, [
            [
                LESSON_ROUTE_PATHS.COLLECTION,
                administrativeAuthorizationMiddleware,
                controller.list,
            ],
        ]);
        assert.deepEqual(calls.post, [
            [
                LESSON_ROUTE_PATHS.COLLECTION,
                administrativeAuthorizationMiddleware,
                controller.create,
            ],
        ]);
        assert.deepEqual(calls.put, [
            [
                LESSON_ROUTE_PATHS.ITEM,
                administrativeAuthorizationMiddleware,
                controller.update,
            ],
        ]);
        assert.deepEqual(calls.delete, [
            [
                LESSON_ROUTE_PATHS.ITEM,
                administrativeAuthorizationMiddleware,
                controller.delete,
            ],
        ]);
        assert.deepEqual(
            calls.sequence.map((entry) => entry.method),
            ['get', 'post', 'put', 'delete'],
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
            { create: 'não é função', update() {}, list() {} },
            { create() {}, update() {} },
            { create() {}, update: 'não é função', list() {} },
            { create() {}, list() {} },
            { create() {}, update() {}, list: 'não é função' },
            {
                create() {},
                update() {},
                delete: 'não é função',
                list() {},
            },
        ];

        for (const controller of invalidControllers) {
            assert.throws(
                () => createLessonRouter({ controller }),
                {
                    name: 'TypeError',
                    message: LESSON_ROUTE_ERRORS.INVALID_CONTROLLER,
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

        for (
            const invalidMiddleware of invalidMiddlewares
        ) {
            assert.throws(
                () => createLessonRouter({
                    controller,
                    administrativeAuthorizationMiddleware:
                        invalidMiddleware,
                }),
                {
                    name: 'TypeError',
                    message:
                        LESSON_ROUTE_ERRORS
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
                () => createLessonRouter({
                    controller,
                    administrativeAuthorizationMiddleware,
                    routerFactory,
                }),
                {
                    name: 'TypeError',
                    message:
                        LESSON_ROUTE_ERRORS.INVALID_ROUTER_FACTORY,
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
            () => createLessonRouter({
                controller: null,
                administrativeAuthorizationMiddleware,
                routerFactory,
            }),
            {
                message: LESSON_ROUTE_ERRORS.INVALID_CONTROLLER,
            },
        );

        assert.throws(
            () => createLessonRouter({
                controller: createController(),
                administrativeAuthorizationMiddleware: null,
                routerFactory,
            }),
            {
                message:
                    LESSON_ROUTE_ERRORS
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
            { get() {}, post() {} },
            { get() {}, put() {} },
            { post() {}, put() {} },
            { get: 'não é função', post() {}, put() {} },
            { get() {}, post: 'não é função', put() {} },
            { get() {}, post() {}, put: 'não é função' },
            {
                get() {},
                post() {},
                put() {},
                delete: 'não é função',
            },
        ];

        for (const invalidRouter of invalidRouters) {
            assert.throws(
                () => createLessonRouter({
                    controller,
                    administrativeAuthorizationMiddleware,
                    routerFactory() {
                        return invalidRouter;
                    },
                }),
                {
                    name: 'TypeError',
                    message: LESSON_ROUTE_ERRORS.INVALID_ROUTER,
                },
            );
        }
    });

    test('aceita um roteador representado por função', () => {
        const calls = {
            get: [],
            post: [],
            put: [],
            delete: [],
        };

        function router() {}

        router.get = (...argumentsReceived) => {
            calls.get.push(argumentsReceived);
        };
        router.post = (...argumentsReceived) => {
            calls.post.push(argumentsReceived);
        };
        router.put = (...argumentsReceived) => {
            calls.put.push(argumentsReceived);
        };
        router.delete = (...argumentsReceived) => {
            calls.delete.push(argumentsReceived);
        };

        const controller = createController();
        const result = createLessonRouter({
            controller,
            administrativeAuthorizationMiddleware,
            routerFactory() {
                return router;
            },
        });

        assert.strictEqual(result, router);
        assert.equal(calls.get.length, 1);
        assert.equal(calls.post.length, 1);
        assert.equal(calls.put.length, 1);
        assert.equal(calls.delete.length, 1);
    });

    test('propaga uma falha real da fábrica', () => {
        const expectedError = new Error(
            'Falha controlada ao criar o roteador.',
        );

        assert.throws(
            () => createLessonRouter({
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
        const postError = new Error(
            'Falha controlada ao registrar POST.',
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
                router: createFakeRouter({ postError }).router,
                expectedError: postError,
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
                () => createLessonRouter({
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
