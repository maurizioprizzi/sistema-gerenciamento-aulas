'use strict';

const assert = require('node:assert/strict');
const {
    describe,
    test,
} = require('node:test');

const { AppError } = require('../src/errors/AppError');
const {
    USER_ROLES,
} = require('../src/models/User');
const {
    ADMINISTRATIVE_AUTHORIZATION_CODES,
    ADMINISTRATIVE_AUTHORIZATION_ERRORS,
    AUTHENTICATED_USER_REQUEST_KEY,
    createAdministrativeAccessRequiredError,
    createAuthenticatedUser,
    createAuthenticationRequiredError,
    requireAdministrativeAuthentication,
} = require('../src/middlewares/administrativeAuthorization');
const {
    SESSION_AUTHENTICATION_KEY,
} = require('../src/services/SessionManager');

function createRequest(overrides = {}) {
    return {
        session: {
            [SESSION_AUTHENTICATION_KEY]: {
                userId: 'usuario-administrativo-123',
                role: USER_ROLES.ADMIN,
            },
        },
        ...overrides,
    };
}

function executeMiddleware(request) {
    const calls = [];

    requireAdministrativeAuthentication(
        request,
        {},
        (...argumentsReceived) => {
            calls.push(argumentsReceived);
        },
    );

    return calls;
}

function assertOperationalError(
    error,
    {
        statusCode,
        code,
        message,
    },
) {
    assert.equal(error instanceof AppError, true);
    assert.equal(error.isOperational, true);
    assert.equal(error.statusCode, statusCode);
    assert.equal(error.code, code);
    assert.equal(error.message, message);
}

describe('configuração da autorização administrativa', () => {
    test('expõe constantes estáveis e protegidas', () => {
        assert.equal(
            AUTHENTICATED_USER_REQUEST_KEY,
            'authenticatedUser',
        );
        assert.deepEqual(
            ADMINISTRATIVE_AUTHORIZATION_CODES,
            {
                AUTHENTICATION_REQUIRED:
                    'AUTHENTICATION_REQUIRED',
                ADMINISTRATIVE_ACCESS_REQUIRED:
                    'ADMINISTRATIVE_ACCESS_REQUIRED',
            },
        );
        assert.equal(
            Object.isFrozen(
                ADMINISTRATIVE_AUTHORIZATION_CODES,
            ),
            true,
        );
        assert.equal(
            Object.isFrozen(
                ADMINISTRATIVE_AUTHORIZATION_ERRORS,
            ),
            true,
        );
    });

    test('cria um erro seguro para autenticação ausente', () => {
        const error = createAuthenticationRequiredError();

        assertOperationalError(error, {
            statusCode: 401,
            code:
                ADMINISTRATIVE_AUTHORIZATION_CODES
                    .AUTHENTICATION_REQUIRED,
            message:
                ADMINISTRATIVE_AUTHORIZATION_ERRORS
                    .AUTHENTICATION_REQUIRED,
        });
    });

    test('cria um erro seguro para papel não autorizado', () => {
        const error =
            createAdministrativeAccessRequiredError();

        assertOperationalError(error, {
            statusCode: 403,
            code:
                ADMINISTRATIVE_AUTHORIZATION_CODES
                    .ADMINISTRATIVE_ACCESS_REQUIRED,
            message:
                ADMINISTRATIVE_AUTHORIZATION_ERRORS
                    .ADMINISTRATIVE_ACCESS_REQUIRED,
        });
    });
});

describe('identidade administrativa autorizada', () => {
    test('seleciona somente identificador e papel', () => {
        const source = {
            userId: '  usuario-123  ',
            role: '  admin  ',
            name: 'Não deve atravessar',
            email: 'nao-deve-aparecer@example.com',
            password: 'não deve aparecer',
            passwordHash: 'não deve aparecer',
            sessionId: 'não deve aparecer',
        };

        const authenticatedUser =
            createAuthenticatedUser(source);

        assert.deepEqual(authenticatedUser, {
            id: 'usuario-123',
            role: 'admin',
        });
        assert.equal(Object.isFrozen(authenticatedUser), true);
        assert.deepEqual(
            Object.keys(authenticatedUser).sort(),
            ['id', 'role'],
        );
    });

    test('rejeita identidades ausentes ou malformadas', () => {
        const invalidIdentities = [
            undefined,
            null,
            false,
            'authentication',
            [],
            {},
            { userId: 'usuario-123' },
            { role: USER_ROLES.ADMIN },
            { userId: '', role: USER_ROLES.ADMIN },
            { userId: '   ', role: USER_ROLES.ADMIN },
            { userId: 42, role: USER_ROLES.ADMIN },
            { userId: 'usuario-123', role: '' },
            { userId: 'usuario-123', role: '   ' },
            { userId: 'usuario-123', role: null },
        ];

        for (const identity of invalidIdentities) {
            assert.throws(
                () => createAuthenticatedUser(identity),
                (error) => {
                    assertOperationalError(error, {
                        statusCode: 401,
                        code:
                            ADMINISTRATIVE_AUTHORIZATION_CODES
                                .AUTHENTICATION_REQUIRED,
                        message:
                            ADMINISTRATIVE_AUTHORIZATION_ERRORS
                                .AUTHENTICATION_REQUIRED,
                    });

                    return true;
                },
            );
        }
    });

    test('cria objetos independentes da sessão original', () => {
        const source = {
            userId: 'usuario-123',
            role: USER_ROLES.ADMIN,
        };

        const authenticatedUser =
            createAuthenticatedUser(source);

        source.userId = 'usuario-alterado';
        source.role = 'papel-alterado';

        assert.deepEqual(authenticatedUser, {
            id: 'usuario-123',
            role: USER_ROLES.ADMIN,
        });
    });
});

describe('requireAdministrativeAuthentication', () => {
    test('autoriza uma sessão administrativa válida', () => {
        const request = createRequest();
        const sessionBefore = JSON.stringify(request.session);
        const calls = executeMiddleware(request);

        assert.deepEqual(calls, [[]]);
        assert.deepEqual(
            request[AUTHENTICATED_USER_REQUEST_KEY],
            {
                id: 'usuario-administrativo-123',
                role: USER_ROLES.ADMIN,
            },
        );
        assert.equal(
            Object.isFrozen(
                request[AUTHENTICATED_USER_REQUEST_KEY],
            ),
            true,
        );
        assert.equal(
            JSON.stringify(request.session),
            sessionBefore,
        );
    });

    test('protege a propriedade anexada à requisição', () => {
        const request = createRequest();

        executeMiddleware(request);

        const descriptor = Object.getOwnPropertyDescriptor(
            request,
            AUTHENTICATED_USER_REQUEST_KEY,
        );

        assert.equal(descriptor.writable, false);
        assert.equal(descriptor.enumerable, false);
        assert.equal(descriptor.configurable, false);
        assert.equal(
            Object.keys(request).includes(
                AUTHENTICATED_USER_REQUEST_KEY,
            ),
            false,
        );
    });

    test('mantém o contexto quando o middleware é extraído', () => {
        const middleware =
            requireAdministrativeAuthentication;
        const request = createRequest();
        const calls = [];

        assert.doesNotThrow(() => middleware(
            request,
            {},
            (...argumentsReceived) => {
                calls.push(argumentsReceived);
            },
        ));

        assert.deepEqual(calls, [[]]);
    });

    test('recusa requisições sem autenticação válida', () => {
        const invalidRequests = [
            undefined,
            null,
            {},
            { session: null },
            { session: [] },
            { session: {} },
            {
                session: {
                    [SESSION_AUTHENTICATION_KEY]: null,
                },
            },
            {
                session: {
                    [SESSION_AUTHENTICATION_KEY]: {
                        userId: '',
                        role: USER_ROLES.ADMIN,
                    },
                },
            },
        ];

        for (const request of invalidRequests) {
            const calls = executeMiddleware(request);

            assert.equal(calls.length, 1);
            assert.equal(calls[0].length, 1);
            assertOperationalError(calls[0][0], {
                statusCode: 401,
                code:
                    ADMINISTRATIVE_AUTHORIZATION_CODES
                        .AUTHENTICATION_REQUIRED,
                message:
                    ADMINISTRATIVE_AUTHORIZATION_ERRORS
                        .AUTHENTICATION_REQUIRED,
            });

            if (request && typeof request === 'object') {
                assert.equal(
                    Object.hasOwn(
                        request,
                        AUTHENTICATED_USER_REQUEST_KEY,
                    ),
                    false,
                );
            }
        }
    });

    test('recusa uma sessão com papel não administrativo', () => {
        const request = createRequest({
            session: {
                [SESSION_AUTHENTICATION_KEY]: {
                    userId: 'usuario-123',
                    role: 'viewer',
                },
            },
        });
        const calls = executeMiddleware(request);

        assert.equal(calls.length, 1);
        assert.equal(calls[0].length, 1);
        assertOperationalError(calls[0][0], {
            statusCode: 403,
            code:
                ADMINISTRATIVE_AUTHORIZATION_CODES
                    .ADMINISTRATIVE_ACCESS_REQUIRED,
            message:
                ADMINISTRATIVE_AUTHORIZATION_ERRORS
                    .ADMINISTRATIVE_ACCESS_REQUIRED,
        });
        assert.equal(
            Object.hasOwn(
                request,
                AUTHENTICATED_USER_REQUEST_KEY,
            ),
            false,
        );
    });

    test('não inclui conteúdo confidencial nos erros', () => {
        const request = createRequest({
            session: {
                [SESSION_AUTHENTICATION_KEY]: {
                    userId: '',
                    role: USER_ROLES.ADMIN,
                    email: 'nao-deve-aparecer@example.com',
                    password: 'senha-nao-deve-aparecer',
                    passwordHash: 'hash-nao-deve-aparecer',
                },
            },
        });
        const calls = executeMiddleware(request);
        const serializedError = JSON.stringify(calls[0][0]);

        assert.equal(
            serializedError.includes(
                request.session.authentication.email,
            ),
            false,
        );
        assert.equal(
            serializedError.includes(
                request.session.authentication.password,
            ),
            false,
        );
        assert.equal(
            serializedError.includes(
                request.session.authentication.passwordHash,
            ),
            false,
        );
    });

    test('encaminha falhas ao anexar a identidade', () => {
        const request = Object.freeze(createRequest());
        const calls = executeMiddleware(request);

        assert.equal(calls.length, 1);
        assert.equal(calls[0].length, 1);
        assert.equal(calls[0][0] instanceof TypeError, true);
        assert.equal(
            Object.hasOwn(
                request,
                AUTHENTICATED_USER_REQUEST_KEY,
            ),
            false,
        );
    });

    test('rejeita uma função next inválida', () => {
        const invalidNextValues = [
            undefined,
            null,
            false,
            {},
            [],
            'next',
        ];

        for (const next of invalidNextValues) {
            assert.throws(
                () => requireAdministrativeAuthentication(
                    createRequest(),
                    {},
                    next,
                ),
                {
                    name: 'TypeError',
                    message:
                        ADMINISTRATIVE_AUTHORIZATION_ERRORS
                            .INVALID_NEXT,
                },
            );
        }
    });
});
