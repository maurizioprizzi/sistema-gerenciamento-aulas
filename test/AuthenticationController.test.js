'use strict';

const assert = require('node:assert/strict');
const {
    describe,
    test,
} = require('node:test');

const {
    AUTHENTICATION_CONTROLLER_ERRORS,
    COOKIE_NAME_PATTERN,
    AuthenticationController,
} = require('../src/controllers/AuthenticationController');

function createIdentity(overrides = {}) {
    return {
        id: '507f1f77bcf86cd799439011',
        name: 'Administrador de Teste',
        email: 'admin@example.com',
        role: 'admin',
        ...overrides,
    };
}

function createDependencies(overrides = {}) {
    return {
        authenticationService: {
            async authenticate() {
                return createIdentity();
            },
        },
        sessionManager: {
            async establish() {},
            async destroy() {},
        },
        cookieName: 'calendario.sid',
        isProduction: false,
        ...overrides,
    };
}

function createResponse(calls = []) {
    return {
        statusCode: null,
        body: null,

        clearCookie(name, options) {
            calls.push({
                operation: 'clearCookie',
                name,
                options,
            });

            return this;
        },

        status(statusCode) {
            calls.push({
                operation: 'status',
                statusCode,
            });
            this.statusCode = statusCode;

            return this;
        },

        json(body) {
            calls.push({
                operation: 'json',
                body,
            });
            this.body = body;

            return this;
        },

        end() {
            calls.push({
                operation: 'end',
            });

            return this;
        },
    };
}

describe('configuração do AuthenticationController', () => {
    test('expõe constantes protegidas', () => {
        assert.equal(
            Object.isFrozen(AUTHENTICATION_CONTROLLER_ERRORS),
            true,
        );
        assert.equal(
            COOKIE_NAME_PATTERN.test('calendario.sid'),
            true,
        );
        assert.equal(
            COOKIE_NAME_PATTERN.test('__Host-calendario.sid'),
            true,
        );
    });

    test('cria handlers vinculados e uma instância imutável', () => {
        const controller = new AuthenticationController(
            createDependencies(),
        );

        assert.equal(typeof controller.login, 'function');
        assert.equal(typeof controller.logout, 'function');
        assert.equal(Object.isFrozen(controller), true);
    });

    test('rejeita serviços de autenticação inválidos', () => {
        const invalidServices = [
            undefined,
            null,
            [],
            {},
            { authenticate: true },
        ];

        for (const authenticationService of invalidServices) {
            assert.throws(
                () => new AuthenticationController(
                    createDependencies({
                        authenticationService,
                    }),
                ),
                {
                    name: 'TypeError',
                    message:
                        AUTHENTICATION_CONTROLLER_ERRORS
                            .INVALID_AUTHENTICATION_SERVICE,
                },
            );
        }
    });

    test('rejeita gerenciadores de sessão inválidos', () => {
        const invalidManagers = [
            undefined,
            null,
            [],
            {},
            { establish() {} },
            { destroy() {} },
            { establish: true, destroy() {} },
            { establish() {}, destroy: true },
        ];

        for (const sessionManager of invalidManagers) {
            assert.throws(
                () => new AuthenticationController(
                    createDependencies({
                        sessionManager,
                    }),
                ),
                {
                    name: 'TypeError',
                    message:
                        AUTHENTICATION_CONTROLLER_ERRORS
                            .INVALID_SESSION_MANAGER,
                },
            );
        }
    });

    test('rejeita nomes de cookie inválidos', () => {
        const invalidCookieNames = [
            undefined,
            null,
            '',
            'cookie com espaços',
            'cookie;inseguro',
            'cookie\nquebrado',
            42,
            {},
            [],
        ];

        for (const cookieName of invalidCookieNames) {
            assert.throws(
                () => new AuthenticationController(
                    createDependencies({ cookieName }),
                ),
                {
                    name: 'TypeError',
                    message:
                        AUTHENTICATION_CONTROLLER_ERRORS
                            .INVALID_COOKIE_NAME,
                },
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
            'true',
            {},
            [],
        ];

        for (const isProduction of invalidValues) {
            assert.throws(
                () => new AuthenticationController(
                    createDependencies({ isProduction }),
                ),
                {
                    name: 'TypeError',
                    message:
                        AUTHENTICATION_CONTROLLER_ERRORS
                            .INVALID_PRODUCTION_FLAG,
                },
            );
        }
    });
});

describe('representação pública do usuário', () => {
    test('mantém somente os quatro campos autorizados', () => {
        const result = AuthenticationController.createPublicUser({
            ...createIdentity(),
            password: 'não deve aparecer',
            passwordHash: 'não deve aparecer',
            active: true,
            internalField: 'não deve aparecer',
        });

        assert.deepEqual(result, createIdentity());
        assert.equal(Object.isFrozen(result), true);
        assert.equal(Object.hasOwn(result, 'password'), false);
        assert.equal(Object.hasOwn(result, 'passwordHash'), false);
        assert.equal(Object.hasOwn(result, 'active'), false);
        assert.equal(Object.hasOwn(result, 'internalField'), false);
    });

    test('rejeita identidades incompletas', () => {
        const invalidIdentities = [
            undefined,
            null,
            [],
            {},
            createIdentity({ id: '' }),
            createIdentity({ name: '   ' }),
            createIdentity({ email: 42 }),
            createIdentity({ role: null }),
        ];

        for (const identity of invalidIdentities) {
            assert.throws(
                () => AuthenticationController.createPublicUser(
                    identity,
                ),
                {
                    name: 'TypeError',
                    message:
                        AUTHENTICATION_CONTROLLER_ERRORS
                            .INVALID_IDENTITY,
                },
            );
        }
    });
});

describe('login administrativo', () => {
    test(
        'autentica, estabelece a sessão e responde em ordem',
        async () => {
            const calls = [];
            const credentials = {
                email: 'ADMIN@EXAMPLE.COM',
                password: 'senha de teste',
            };
            const identity = createIdentity();
            const request = {
                body: credentials,
                session: {},
            };
            const response = createResponse(calls);
            const received = {};

            const controller = new AuthenticationController(
                createDependencies({
                    authenticationService: {
                        async authenticate(value) {
                            calls.push({
                                operation: 'authenticate',
                            });
                            received.credentials = value;

                            return identity;
                        },
                    },
                    sessionManager: {
                        async establish(
                            receivedRequest,
                            receivedIdentity,
                        ) {
                            calls.push({
                                operation: 'establish',
                            });
                            received.request = receivedRequest;
                            received.identity = receivedIdentity;
                        },
                        async destroy() {},
                    },
                }),
            );

            const nextErrors = [];

            await controller.login(
                request,
                response,
                (error) => nextErrors.push(error),
            );

            assert.equal(received.credentials, credentials);
            assert.equal(received.request, request);
            assert.deepEqual(received.identity, identity);
            assert.notEqual(received.identity, identity);
            assert.equal(Object.isFrozen(received.identity), true);

            assert.deepEqual(
                calls.map((call) => call.operation),
                [
                    'authenticate',
                    'establish',
                    'status',
                    'json',
                ],
            );

            assert.equal(response.statusCode, 200);
            assert.deepEqual(response.body, {
                data: {
                    user: identity,
                },
            });
            assert.deepEqual(nextErrors, []);
        },
    );

    test(
        'remove campos privados antes da sessão e da resposta',
        async () => {
            let receivedIdentity;
            const response = createResponse();

            const controller = new AuthenticationController(
                createDependencies({
                    authenticationService: {
                        async authenticate() {
                            return {
                                ...createIdentity(),
                                password: 'segredo original',
                                passwordHash: 'hash protegido',
                            };
                        },
                    },
                    sessionManager: {
                        async establish(_request, identity) {
                            receivedIdentity = identity;
                        },
                        async destroy() {},
                    },
                }),
            );

            await controller.login(
                { body: {}, session: {} },
                response,
                assert.fail,
            );

            const serializedResult = JSON.stringify({
                receivedIdentity,
                responseBody: response.body,
            });

            assert.equal(
                serializedResult.includes('segredo original'),
                false,
            );
            assert.equal(
                serializedResult.includes('hash protegido'),
                false,
            );
        },
    );

    test('mantém o contexto quando login é extraído', async () => {
        const response = createResponse();
        const controller = new AuthenticationController(
            createDependencies(),
        );
        const login = controller.login;

        await login(
            { body: {}, session: {} },
            response,
            assert.fail,
        );

        assert.equal(response.statusCode, 200);
    });

    test(
        'encaminha falha de autenticação sem iniciar sessão',
        async () => {
            const expectedError = new Error(
                'Falha controlada de autenticação.',
            );
            let establishCalls = 0;
            const responseCalls = [];

            const controller = new AuthenticationController(
                createDependencies({
                    authenticationService: {
                        async authenticate() {
                            throw expectedError;
                        },
                    },
                    sessionManager: {
                        async establish() {
                            establishCalls += 1;
                        },
                        async destroy() {},
                    },
                }),
            );

            const nextErrors = [];

            await controller.login(
                { body: {} },
                createResponse(responseCalls),
                (error) => nextErrors.push(error),
            );

            assert.equal(establishCalls, 0);
            assert.deepEqual(responseCalls, []);
            assert.deepEqual(nextErrors, [expectedError]);
        },
    );

    test(
        'encaminha identidade inválida sem iniciar sessão',
        async () => {
            let establishCalls = 0;
            const responseCalls = [];

            const controller = new AuthenticationController(
                createDependencies({
                    authenticationService: {
                        async authenticate() {
                            return {};
                        },
                    },
                    sessionManager: {
                        async establish() {
                            establishCalls += 1;
                        },
                        async destroy() {},
                    },
                }),
            );

            const nextErrors = [];

            await controller.login(
                { body: {} },
                createResponse(responseCalls),
                (error) => nextErrors.push(error),
            );

            assert.equal(establishCalls, 0);
            assert.deepEqual(responseCalls, []);
            assert.equal(nextErrors.length, 1);
            assert.equal(
                nextErrors[0].message,
                AUTHENTICATION_CONTROLLER_ERRORS.INVALID_IDENTITY,
            );
        },
    );

    test('encaminha falha ao estabelecer a sessão', async () => {
        const expectedError = new Error(
            'Falha controlada de sessão.',
        );
        const responseCalls = [];

        const controller = new AuthenticationController(
            createDependencies({
                sessionManager: {
                    async establish() {
                        throw expectedError;
                    },
                    async destroy() {},
                },
            }),
        );

        const nextErrors = [];

        await controller.login(
            { body: {}, session: {} },
            createResponse(responseCalls),
            (error) => nextErrors.push(error),
        );

        assert.deepEqual(responseCalls, []);
        assert.deepEqual(nextErrors, [expectedError]);
    });
});

describe('logout administrativo', () => {
    test(
        'destrói a sessão, limpa o cookie e retorna 204',
        async () => {
            const calls = [];
            const request = { session: {} };
            const received = {};

            const controller = new AuthenticationController(
                createDependencies({
                    sessionManager: {
                        async establish() {},
                        async destroy(receivedRequest) {
                            calls.push({ operation: 'destroy' });
                            received.request = receivedRequest;
                        },
                    },
                }),
            );

            const response = createResponse(calls);
            const nextErrors = [];

            await controller.logout(
                request,
                response,
                (error) => nextErrors.push(error),
            );

            assert.equal(received.request, request);
            assert.deepEqual(
                calls.map((call) => call.operation),
                [
                    'destroy',
                    'clearCookie',
                    'status',
                    'end',
                ],
            );

            assert.deepEqual(calls[1], {
                operation: 'clearCookie',
                name: 'calendario.sid',
                options: {
                    httpOnly: true,
                    secure: false,
                    sameSite: 'lax',
                    path: '/',
                    priority: 'high',
                },
            });
            assert.equal(response.statusCode, 204);
            assert.deepEqual(nextErrors, []);
        },
    );

    test('utiliza as opções seguras de produção', async () => {
        const calls = [];
        const controller = new AuthenticationController(
            createDependencies({
                cookieName: '__Host-calendario.sid',
                isProduction: true,
            }),
        );

        await controller.logout(
            { session: {} },
            createResponse(calls),
            assert.fail,
        );

        assert.deepEqual(calls[0], {
            operation: 'clearCookie',
            name: '__Host-calendario.sid',
            options: {
                httpOnly: true,
                secure: true,
                sameSite: 'lax',
                path: '/',
                priority: 'high',
            },
        });
    });

    test('mantém o contexto quando logout é extraído', async () => {
        const controller = new AuthenticationController(
            createDependencies(),
        );
        const logout = controller.logout;
        const response = createResponse();

        await logout(
            { session: {} },
            response,
            assert.fail,
        );

        assert.equal(response.statusCode, 204);
    });

    test(
        'não limpa o cookie quando a destruição falha',
        async () => {
            const expectedError = new Error(
                'Falha controlada ao destruir a sessão.',
            );
            const responseCalls = [];

            const controller = new AuthenticationController(
                createDependencies({
                    sessionManager: {
                        async establish() {},
                        async destroy() {
                            throw expectedError;
                        },
                    },
                }),
            );

            const nextErrors = [];

            await controller.logout(
                { session: {} },
                createResponse(responseCalls),
                (error) => nextErrors.push(error),
            );

            assert.deepEqual(responseCalls, []);
            assert.deepEqual(nextErrors, [expectedError]);
        },
    );
});
