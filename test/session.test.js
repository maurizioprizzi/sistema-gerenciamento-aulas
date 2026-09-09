'use strict';

const assert = require('node:assert/strict');
const {
    describe,
    test
} = require('node:test');

const {
    MAX_SESSION_MAX_AGE_MS,
    MIN_SESSION_MAX_AGE_MS,
    SESSION_COLLECTION_NAME,
    SESSION_COOKIE_NAMES,
    SESSION_ERROR_MESSAGES,
    SESSION_TOUCH_AFTER_SECONDS,
    createMongoSessionStore,
    createSessionMiddleware
} = require('../src/config/session');

/**
 * Cria um cliente MongoDB mínimo para os testes.
 *
 * Nenhuma conexão real é aberta.
 *
 * @returns {object} Cliente nativo simulado.
 */
function createNativeClient() {
    return {
        db() {
            return {};
        }
    };
}

/**
 * Cria um armazenamento compatível com a interface mínima exigida pelo
 * express-session.
 *
 * @param {object} overrides Métodos que serão substituídos.
 * @returns {object} Armazenamento controlado.
 */
function createSessionStore(overrides = {}) {
    return {
        on() {
            return this;
        },

        get() {},

        set() {},

        destroy() {},

        touch() {},

        ...overrides
    };
}

/**
 * Cria uma configuração válida para o armazenamento MongoDB.
 *
 * @param {object} overrides Campos que serão substituídos.
 * @returns {object} Configuração completa.
 */
function createValidStoreConfiguration(overrides = {}) {
    return {
        nativeClient: createNativeClient(),
        maxAgeMs: MIN_SESSION_MAX_AGE_MS,
        storeFactory() {
            return createSessionStore();
        },
        ...overrides
    };
}

/**
 * Cria uma configuração válida para o middleware de sessão.
 *
 * @param {object} overrides Campos que serão substituídos.
 * @returns {object} Configuração completa.
 */
function createValidMiddlewareConfiguration(overrides = {}) {
    return {
        store: createSessionStore(),
        secret:
            'segredo-de-teste-com-mais-de-trinta-e-dois-bytes',
        maxAgeMs: MIN_SESSION_MAX_AGE_MS,
        isProduction: false,
        sessionFactory() {
            return function sessionMiddleware(
                request,
                response,
                next
            ) {
                next();
            };
        },
        ...overrides
    };
}

describe('constantes de sessão', () => {
    test('define limites e nomes esperados', () => {
        assert.equal(
            MIN_SESSION_MAX_AGE_MS,
            1 * 60 * 60 * 1000
        );

        assert.equal(
            MAX_SESSION_MAX_AGE_MS,
            168 * 60 * 60 * 1000
        );

        assert.equal(
            SESSION_COLLECTION_NAME,
            'sessions'
        );

        assert.equal(
            SESSION_TOUCH_AFTER_SECONDS,
            300
        );

        assert.deepEqual(
            SESSION_COOKIE_NAMES,
            {
                DEVELOPMENT: 'calendario.sid',
                PRODUCTION: '__Host-calendario.sid'
            }
        );
    });

    test('protege nomes e mensagens contra alterações', () => {
        assert.equal(
            Object.isFrozen(SESSION_COOKIE_NAMES),
            true
        );

        assert.equal(
            Object.isFrozen(SESSION_ERROR_MESSAGES),
            true
        );

        assert.throws(
            () => {
                SESSION_COOKIE_NAMES.DEVELOPMENT =
                    'cookie-alterado';
            },
            TypeError
        );

        assert.equal(
            SESSION_COOKIE_NAMES.DEVELOPMENT,
            'calendario.sid'
        );
    });
});

describe('createMongoSessionStore', () => {
    test(
        'cria o armazenamento com o cliente e opções seguras',
        () => {
            const nativeClient = createNativeClient();
            const expectedStore = createSessionStore();
            const calls = [];

            function storeFactory(options) {
                calls.push(options);

                return expectedStore;
            }

            const result = createMongoSessionStore({
                nativeClient,
                maxAgeMs: MIN_SESSION_MAX_AGE_MS,
                storeFactory
            });

            assert.equal(result, expectedStore);

            assert.deepEqual(calls, [
                {
                    client: nativeClient,
                    collectionName: 'sessions',
                    ttl: 3600,
                    autoRemove: 'native',
                    touchAfter: 300,
                    stringify: true,
                    timestamps: true
                }
            ]);
        }
    );

    test(
        'arredonda o TTL sem antecipar a expiração',
        () => {
            let receivedOptions;

            createMongoSessionStore(
                createValidStoreConfiguration({
                    maxAgeMs:
                        MIN_SESSION_MAX_AGE_MS + 1,

                    storeFactory(options) {
                        receivedOptions = options;

                        return createSessionStore();
                    }
                })
            );

            assert.equal(
                receivedOptions.ttl,
                3601
            );
        }
    );

    test('rejeita clientes MongoDB inválidos', () => {
        const invalidClients = [
            undefined,
            null,
            {},
            [],
            {
                db: 'não é uma função'
            }
        ];

        for (const nativeClient of invalidClients) {
            assert.throws(
                () => createMongoSessionStore(
                    createValidStoreConfiguration({
                        nativeClient
                    })
                ),
                {
                    name: 'TypeError',
                    message:
                        SESSION_ERROR_MESSAGES.INVALID_CLIENT
                }
            );
        }
    });

    test('rejeita durações inválidas', () => {
        const invalidDurations = [
            MIN_SESSION_MAX_AGE_MS - 1,
            MAX_SESSION_MAX_AGE_MS + 1,
            3600000.5,
            Number.NaN,
            Number.POSITIVE_INFINITY,
            '3600000',
            null
        ];

        for (const maxAgeMs of invalidDurations) {
            assert.throws(
                () => createMongoSessionStore(
                    createValidStoreConfiguration({
                        maxAgeMs
                    })
                ),
                {
                    name: 'RangeError',
                    message:
                        SESSION_ERROR_MESSAGES.INVALID_MAX_AGE
                }
            );
        }
    });

    test('rejeita fábricas de armazenamento inválidas', () => {
        const invalidFactories = [
            null,
            {},
            'fábrica-inválida',
            42
        ];

        for (const storeFactory of invalidFactories) {
            assert.throws(
                () => createMongoSessionStore(
                    createValidStoreConfiguration({
                        storeFactory
                    })
                ),
                {
                    name: 'TypeError',
                    message:
                        SESSION_ERROR_MESSAGES
                            .INVALID_STORE_FACTORY
                }
            );
        }
    });

    test('rejeita armazenamentos incompletos', () => {
        const invalidStores = [
            null,
            {},
            createSessionStore({
                on: undefined
            }),
            createSessionStore({
                get: undefined
            }),
            createSessionStore({
                set: undefined
            }),
            createSessionStore({
                destroy: undefined
            })
        ];

        for (const invalidStore of invalidStores) {
            assert.throws(
                () => createMongoSessionStore(
                    createValidStoreConfiguration({
                        storeFactory() {
                            return invalidStore;
                        }
                    })
                ),
                {
                    name: 'TypeError',
                    message:
                        SESSION_ERROR_MESSAGES.INVALID_STORE
                }
            );
        }
    });

    test('propaga falhas da fábrica de armazenamento', () => {
        const expectedError = new Error(
            'Falha controlada ao criar armazenamento.'
        );

        assert.throws(
            () => createMongoSessionStore(
                createValidStoreConfiguration({
                    storeFactory() {
                        throw expectedError;
                    }
                })
            ),
            expectedError
        );
    });
});

describe('createSessionMiddleware', () => {
    test(
        'configura sessões seguras para desenvolvimento',
        () => {
            const store = createSessionStore();
            const secret =
                'segredo-de-teste-com-mais-de-trinta-e-dois-bytes';

            const calls = [];
            const expectedMiddleware = (
                request,
                response,
                next
            ) => next();

            function sessionFactory(options) {
                calls.push(options);

                return expectedMiddleware;
            }

            const result = createSessionMiddleware({
                store,
                secret,
                maxAgeMs: MIN_SESSION_MAX_AGE_MS,
                isProduction: false,
                sessionFactory
            });

            assert.equal(result, expectedMiddleware);

            assert.deepEqual(calls, [
                {
                    name: 'calendario.sid',
                    secret,
                    store,
                    resave: false,
                    saveUninitialized: false,
                    rolling: false,
                    unset: 'destroy',
                    cookie: {
                        httpOnly: true,
                        secure: false,
                        sameSite: 'lax',
                        path: '/',
                        maxAge:
                            MIN_SESSION_MAX_AGE_MS,
                        priority: 'high'
                    }
                }
            ]);
        }
    );

    test(
        'utiliza cookie com prefixo protegido em produção',
        () => {
            let receivedOptions;

            createSessionMiddleware(
                createValidMiddlewareConfiguration({
                    isProduction: true,

                    sessionFactory(options) {
                        receivedOptions = options;

                        return (
                            request,
                            response,
                            next
                        ) => next();
                    }
                })
            );

            assert.equal(
                receivedOptions.name,
                '__Host-calendario.sid'
            );

            assert.equal(
                receivedOptions.cookie.secure,
                true
            );

            assert.equal(
                receivedOptions.cookie.path,
                '/'
            );

            assert.equal(
                Object.hasOwn(
                    receivedOptions.cookie,
                    'domain'
                ),
                false
            );
        }
    );

    test(
        'cria um middleware real do express-session',
        () => {
            const middleware = createSessionMiddleware({
                store: createSessionStore(),
                secret:
                    'segredo-real-de-teste-com-mais-de-trinta-e-dois-bytes',
                maxAgeMs: MIN_SESSION_MAX_AGE_MS,
                isProduction: false
            });

            assert.equal(
                typeof middleware,
                'function'
            );
        }
    );

    test('rejeita segredos inválidos', () => {
        const invalidSecrets = [
            undefined,
            null,
            '',
            'segredo-curto',
            42,
            {},
            []
        ];

        for (const secret of invalidSecrets) {
            assert.throws(
                () => createSessionMiddleware(
                    createValidMiddlewareConfiguration({
                        secret
                    })
                ),
                {
                    name: 'TypeError',
                    message:
                        SESSION_ERROR_MESSAGES.INVALID_SECRET
                }
            );
        }
    });

        test(
        'rejeita segredo formado somente por espaços',
        () => {
            const whitespaceOnlySecret = ' '.repeat(32);

            assert.throws(
                () => createSessionMiddleware(
                    createValidMiddlewareConfiguration({
                        secret: whitespaceOnlySecret
                    })
                ),
                {
                    name: 'TypeError',
                    message:
                        SESSION_ERROR_MESSAGES.INVALID_SECRET
                }
            );
        }
    );

    test('rejeita durações inválidas', () => {
        const invalidDurations = [
            MIN_SESSION_MAX_AGE_MS - 1,
            MAX_SESSION_MAX_AGE_MS + 1,
            3600000.5,
            Number.NaN,
            Number.POSITIVE_INFINITY,
            '3600000',
            null
        ];

        for (const maxAgeMs of invalidDurations) {
            assert.throws(
                () => createSessionMiddleware(
                    createValidMiddlewareConfiguration({
                        maxAgeMs
                    })
                ),
                {
                    name: 'RangeError',
                    message:
                        SESSION_ERROR_MESSAGES.INVALID_MAX_AGE
                }
            );
        }
    });

    test('exige indicação booleana de produção', () => {
        const invalidValues = [
            undefined,
            null,
            0,
            1,
            'false',
            'true'
        ];

        for (const isProduction of invalidValues) {
            assert.throws(
                () => createSessionMiddleware(
                    createValidMiddlewareConfiguration({
                        isProduction
                    })
                ),
                {
                    name: 'TypeError',
                    message:
                        SESSION_ERROR_MESSAGES
                            .INVALID_PRODUCTION_FLAG
                }
            );
        }
    });

    test('rejeita armazenamento incompleto', () => {
        const invalidStores = [
            null,
            {},
            createSessionStore({
                on: undefined
            }),
            createSessionStore({
                get: undefined
            }),
            createSessionStore({
                set: undefined
            }),
            createSessionStore({
                destroy: undefined
            })
        ];

        for (const store of invalidStores) {
            assert.throws(
                () => createSessionMiddleware(
                    createValidMiddlewareConfiguration({
                        store
                    })
                ),
                {
                    name: 'TypeError',
                    message:
                        SESSION_ERROR_MESSAGES.INVALID_STORE
                }
            );
        }
    });

    test('rejeita fábricas de middleware inválidas', () => {
        const invalidFactories = [
            null,
            {},
            'fábrica-inválida',
            42
        ];

        for (const sessionFactory of invalidFactories) {
            assert.throws(
                () => createSessionMiddleware(
                    createValidMiddlewareConfiguration({
                        sessionFactory
                    })
                ),
                {
                    name: 'TypeError',
                    message:
                        SESSION_ERROR_MESSAGES
                            .INVALID_SESSION_FACTORY
                }
            );
        }
    });

    test(
        'rejeita quando a fábrica não retorna middleware',
        () => {
            const invalidResults = [
                undefined,
                null,
                {},
                'middleware-inválido'
            ];

            for (const invalidResult of invalidResults) {
                assert.throws(
                    () => createSessionMiddleware(
                        createValidMiddlewareConfiguration({
                            sessionFactory() {
                                return invalidResult;
                            }
                        })
                    ),
                    {
                        name: 'TypeError',
                        message:
                            SESSION_ERROR_MESSAGES
                                .INVALID_MIDDLEWARE
                    }
                );
            }
        }
    );

    test(
        'não inclui o segredo em erros de validação',
        () => {
            const confidentialSecret =
                'este-segredo-nao-pode-aparecer-em-mensagens';

            assert.throws(
                () => createSessionMiddleware(
                    createValidMiddlewareConfiguration({
                        secret: confidentialSecret,
                        isProduction: 'valor-inválido'
                    })
                ),
                (error) => {
                    assert.equal(
                        error.message.includes(
                            confidentialSecret
                        ),
                        false
                    );

                    return true;
                }
            );
        }
    );
});