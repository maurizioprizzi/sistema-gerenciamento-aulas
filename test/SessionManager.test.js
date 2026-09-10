'use strict';

const assert = require('node:assert/strict');
const {
    describe,
    test,
} = require('node:test');

const {
    SESSION_AUTHENTICATION_KEY,
    SESSION_MANAGER_ERRORS,
    SessionManager,
    sessionManager,
} = require('../src/services/SessionManager');

/**
 * Identidade válida semelhante à produzida pelo AuthenticationService.
 *
 * @param {object} overrides Campos substituídos no teste.
 * @returns {object} Identidade completa.
 */
function createIdentity(overrides = {}) {
    return {
        id: '507f1f77bcf86cd799439011',
        name: 'Administrador de Teste',
        email: 'admin@example.com',
        role: 'admin',
        ...overrides,
    };
}

/**
 * Cria uma requisição cuja regeneração substitui a sessão anterior.
 *
 * @param {object} options Comportamentos simulados.
 * @returns {{ request: object, calls: string[], regeneratedSession: object }}
 */
function createRequest({
    regenerationError = null,
    saveError = null,
    destroyError = null,
    throwDuringSave = null,
    throwDuringDestroy = null,
    replaceWithInvalidSession = false,
} = {}) {
    const calls = [];

    const regeneratedSession = {
        save(callback) {
            calls.push('save');

            if (throwDuringSave) {
                throw throwDuringSave;
            }

            callback(saveError);
        },

        destroy(callback) {
            calls.push('destroy');

            if (throwDuringDestroy) {
                throw throwDuringDestroy;
            }

            callback(destroyError);
        },
    };

    const request = {
        session: {
            regenerate(callback) {
                calls.push('regenerate');

                if (!regenerationError) {
                    request.session = replaceWithInvalidSession
                        ? {}
                        : regeneratedSession;
                }

                callback(regenerationError);
            },

            destroy(callback) {
                calls.push('destroy-previous');
                callback(destroyError);
            },
        },
    };

    return {
        calls,
        regeneratedSession,
        request,
    };
}

describe('configuração do SessionManager', () => {
    test('expõe constantes estáveis e protegidas', () => {
        assert.equal(
            SESSION_AUTHENTICATION_KEY,
            'authentication',
        );
        assert.equal(
            Object.isFrozen(SESSION_MANAGER_ERRORS),
            true,
        );
        assert.equal(
            SESSION_MANAGER_ERRORS.INVALID_REQUEST,
            'Uma requisição com sessão válida é necessária.',
        );
    });

    test('disponibiliza uma instância padrão do serviço', () => {
        assert.equal(
            sessionManager instanceof SessionManager,
            true,
        );
        assert.equal(
            typeof sessionManager.establish,
            'function',
        );
        assert.equal(
            typeof sessionManager.destroy,
            'function',
        );
    });
});

describe('identidade mínima da sessão', () => {
    test('mantém somente identificador e papel', () => {
        const result = SessionManager.createSessionIdentity(
            createIdentity(),
        );

        assert.deepEqual(result, {
            userId: '507f1f77bcf86cd799439011',
            role: 'admin',
        });
        assert.equal(Object.isFrozen(result), true);
        assert.equal(Object.hasOwn(result, 'name'), false);
        assert.equal(Object.hasOwn(result, 'email'), false);
    });

    test('remove espaços externos do identificador e do papel', () => {
        const result = SessionManager.createSessionIdentity({
            id: '  identificador-com-espacos  ',
            role: '  papel-personalizado  ',
        });

        assert.deepEqual(result, {
            userId: 'identificador-com-espacos',
            role: 'papel-personalizado',
        });
    });

    test('rejeita identidades inválidas', () => {
        const invalidIdentities = [
            undefined,
            null,
            [],
            {},
            { id: '', role: 'admin' },
            { id: '   ', role: 'admin' },
            { id: 42, role: 'admin' },
            { id: 'user-id' },
            { id: 'user-id', role: '' },
            { id: 'user-id', role: '   ' },
            { id: 'user-id', role: 42 },
        ];

        for (const identity of invalidIdentities) {
            assert.throws(
                () => SessionManager.createSessionIdentity(
                    identity,
                ),
                {
                    name: 'TypeError',
                    message:
                        SESSION_MANAGER_ERRORS.INVALID_IDENTITY,
                },
            );
        }
    });
});

describe('estabelecimento da sessão autenticada', () => {
    test(
        'regenera, grava a identidade mínima e salva em ordem',
        async () => {
            const {
                calls,
                regeneratedSession,
                request,
            } = createRequest();

            const manager = new SessionManager();

            const result = await manager.establish(
                request,
                createIdentity(),
            );

            assert.deepEqual(calls, [
                'regenerate',
                'save',
            ]);

            assert.deepEqual(
                regeneratedSession[
                    SESSION_AUTHENTICATION_KEY
                ],
                {
                    userId: '507f1f77bcf86cd799439011',
                    role: 'admin',
                },
            );

            assert.equal(
                result,
                regeneratedSession[
                    SESSION_AUTHENTICATION_KEY
                ],
            );
            assert.equal(Object.isFrozen(result), true);
        },
    );

    test(
        'não persiste nome, e-mail, senha ou hash',
        async () => {
            const {
                regeneratedSession,
                request,
            } = createRequest();

            await sessionManager.establish(
                request,
                {
                    ...createIdentity(),
                    password: 'não deve ser armazenada',
                    passwordHash: 'não deve ser armazenado',
                },
            );

            const serializedSession = JSON.stringify(
                regeneratedSession,
            );

            assert.equal(
                serializedSession.includes('Administrador'),
                false,
            );
            assert.equal(
                serializedSession.includes('example.com'),
                false,
            );
            assert.equal(
                serializedSession.includes('não deve'),
                false,
            );
        },
    );

    test(
        'valida a identidade antes de regenerar a sessão',
        async () => {
            const { calls, request } = createRequest();

            await assert.rejects(
                sessionManager.establish(request, {}),
                {
                    name: 'TypeError',
                    message:
                        SESSION_MANAGER_ERRORS.INVALID_IDENTITY,
                },
            );

            assert.deepEqual(calls, []);
        },
    );

    test('rejeita requisições sem sessão válida', async () => {
        const invalidRequests = [
            undefined,
            null,
            [],
            {},
            { session: null },
            { session: {} },
            { session: { regenerate: true } },
        ];

        for (const request of invalidRequests) {
            await assert.rejects(
                sessionManager.establish(
                    request,
                    createIdentity(),
                ),
                {
                    name: 'TypeError',
                    message:
                        SESSION_MANAGER_ERRORS.INVALID_REQUEST,
                },
            );
        }
    });

    test(
        'propaga uma falha ocorrida durante a regeneração',
        async () => {
            const expectedError = new Error(
                'Falha controlada ao regenerar.',
            );

            const { calls, request } = createRequest({
                regenerationError: expectedError,
            });

            await assert.rejects(
                sessionManager.establish(
                    request,
                    createIdentity(),
                ),
                expectedError,
            );

            assert.deepEqual(calls, ['regenerate']);
        },
    );

    test(
        'rejeita uma sessão regenerada sem save e destroy',
        async () => {
            const { calls, request } = createRequest({
                replaceWithInvalidSession: true,
            });

            await assert.rejects(
                sessionManager.establish(
                    request,
                    createIdentity(),
                ),
                {
                    name: 'TypeError',
                    message:
                        SESSION_MANAGER_ERRORS
                            .INVALID_REGENERATED_SESSION,
                },
            );

            assert.deepEqual(calls, ['regenerate']);
        },
    );

    test(
        'remove a identidade e destrói a sessão quando save falha',
        async () => {
            const expectedError = new Error(
                'Falha controlada ao salvar.',
            );

            const {
                calls,
                regeneratedSession,
                request,
            } = createRequest({
                saveError: expectedError,
            });

            await assert.rejects(
                sessionManager.establish(
                    request,
                    createIdentity(),
                ),
                expectedError,
            );

            assert.deepEqual(calls, [
                'regenerate',
                'save',
                'destroy',
            ]);
            assert.equal(
                Object.hasOwn(
                    regeneratedSession,
                    SESSION_AUTHENTICATION_KEY,
                ),
                false,
            );
        },
    );

    test(
        'preserva a falha de save quando a limpeza também falha',
        async () => {
            const saveError = new Error(
                'Falha principal de gravação.',
            );
            const destroyError = new Error(
                'Falha posterior de limpeza.',
            );

            const { calls, request } = createRequest({
                saveError,
                destroyError,
            });

            await assert.rejects(
                sessionManager.establish(
                    request,
                    createIdentity(),
                ),
                saveError,
            );

            assert.deepEqual(calls, [
                'regenerate',
                'save',
                'destroy',
            ]);
        },
    );

    test(
        'trata exceções síncronas de save como falhas assíncronas',
        async () => {
            const expectedError = new Error(
                'Exceção síncrona controlada.',
            );

            const { calls, request } = createRequest({
                throwDuringSave: expectedError,
            });

            await assert.rejects(
                sessionManager.establish(
                    request,
                    createIdentity(),
                ),
                expectedError,
            );

            assert.deepEqual(calls, [
                'regenerate',
                'save',
                'destroy',
            ]);
        },
    );

    test(
        'preserva a falha de save diante de exceção na limpeza',
        async () => {
            const saveError = new Error(
                'Falha principal.',
            );

            const { calls, request } = createRequest({
                saveError,
                throwDuringDestroy: new Error(
                    'Exceção de limpeza.',
                ),
            });

            await assert.rejects(
                sessionManager.establish(
                    request,
                    createIdentity(),
                ),
                saveError,
            );

            assert.deepEqual(calls, [
                'regenerate',
                'save',
                'destroy',
            ]);
        },
    );
});

describe('destruição da sessão autenticada', () => {
    test('destrói a sessão atual', async () => {
        const calls = [];
        const request = {
            session: {
                destroy(callback) {
                    calls.push('destroy');
                    callback();
                },
            },
        };

        const result = await sessionManager.destroy(request);

        assert.equal(result, undefined);
        assert.deepEqual(calls, ['destroy']);
    });

    test('propaga uma falha de destruição', async () => {
        const expectedError = new Error(
            'Falha controlada ao destruir.',
        );

        const request = {
            session: {
                destroy(callback) {
                    callback(expectedError);
                },
            },
        };

        await assert.rejects(
            sessionManager.destroy(request),
            expectedError,
        );
    });

    test(
        'trata exceções síncronas de destroy como falhas assíncronas',
        async () => {
            const expectedError = new Error(
                'Exceção síncrona controlada.',
            );

            const request = {
                session: {
                    destroy() {
                        throw expectedError;
                    },
                },
            };

            await assert.rejects(
                sessionManager.destroy(request),
                expectedError,
            );
        },
    );

    test('rejeita requisições sem operação destroy', async () => {
        const invalidRequests = [
            undefined,
            null,
            [],
            {},
            { session: null },
            { session: {} },
            { session: { destroy: true } },
        ];

        for (const request of invalidRequests) {
            await assert.rejects(
                sessionManager.destroy(request),
                {
                    name: 'TypeError',
                    message:
                        SESSION_MANAGER_ERRORS.INVALID_REQUEST,
                },
            );
        }
    });
});
