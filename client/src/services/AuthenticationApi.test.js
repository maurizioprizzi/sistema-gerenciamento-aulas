import {
    afterEach,
    describe,
    expect,
    test,
    vi,
} from 'vitest';

import {
    AUTHENTICATION_API_CODES,
    AUTHENTICATION_API_MESSAGES,
    AUTHENTICATION_API_PATHS,
    AuthenticationApi,
    AuthenticationApiError,
    authenticationApi,
} from './AuthenticationApi.js';

/**
 * Cria uma resposta controlada compatível com a parte da interface Fetch
 * utilizada pelo serviço.
 *
 * @param {number} status Estado HTTP.
 * @param {unknown} body Corpo devolvido por json().
 * @returns {object} Resposta simulada.
 */
function createJsonResponse(status, body) {
    return {
        status,
        ok: status >= 200 && status <= 299,
        json: vi.fn().mockResolvedValue(body),
    };
}

function createLoginPayload(overrides = {}) {
    return {
        data: {
            user: {
                id: 'user-123',
                name: 'Professor Dionísio',
                email: 'dionisio@example.com',
                role: 'admin',
                passwordHash: 'campo-que-nao-deve-atravessar',
                ...overrides,
            },
        },
    };
}

function createSessionPayload(overrides = {}) {
    return {
        data: {
            authenticated: true,
            user: {
                id: 'user-123',
                role: 'admin',
                email: 'campo-que-nao-deve-atravessar',
                ...overrides,
            },
        },
    };
}

function createCredentials(overrides = {}) {
    return {
        email: 'dionisio@example.com',
        password: 'senha de teste',
        ...overrides,
    };
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('configuração da AuthenticationApi', () => {
    test('expõe caminhos, códigos e mensagens protegidos', () => {
        expect(AUTHENTICATION_API_PATHS).toEqual({
            LOGIN: '/api/auth/login',
            SESSION: '/api/auth/session',
            LOGOUT: '/api/auth/logout',
        });
        expect(AUTHENTICATION_API_CODES).toEqual({
            NETWORK_ERROR: 'AUTHENTICATION_NETWORK_ERROR',
            INVALID_RESPONSE: 'INVALID_AUTHENTICATION_RESPONSE',
            REQUEST_FAILED: 'AUTHENTICATION_REQUEST_FAILED',
        });
        expect(Object.isFrozen(AUTHENTICATION_API_PATHS)).toBe(true);
        expect(Object.isFrozen(AUTHENTICATION_API_CODES)).toBe(true);
        expect(Object.isFrozen(AUTHENTICATION_API_MESSAGES)).toBe(true);
    });

    test('disponibiliza uma instância padrão imutável', () => {
        expect(authenticationApi).toBeInstanceOf(AuthenticationApi);
        expect(Object.isFrozen(authenticationApi)).toBe(true);
        expect(typeof authenticationApi.login).toBe('function');
        expect(typeof authenticationApi.getSession).toBe('function');
        expect(typeof authenticationApi.logout).toBe('function');
    });

    test('rejeita clientes HTTP inválidos', () => {
        const invalidClients = [
            null,
            42,
            'fetch',
            {},
            [],
        ];

        for (const fetchClient of invalidClients) {
            expect(
                () => new AuthenticationApi({ fetchClient }),
            ).toThrowError(
                AUTHENTICATION_API_MESSAGES.INVALID_FETCH_CLIENT,
            );
        }
    });

    test('mantém o contexto quando login é extraído', async () => {
        const fetchClient = vi.fn().mockResolvedValue(
            createJsonResponse(200, createLoginPayload()),
        );
        const api = new AuthenticationApi({ fetchClient });
        const login = api.login;

        const user = await login(createCredentials());

        expect(user.id).toBe('user-123');
        expect(fetchClient).toHaveBeenCalledOnce();
    });
});

describe('AuthenticationApiError', () => {
    test('mantém metadados estáveis sem incorporar a causa', () => {
        const cause = new Error('Falha técnica controlada.');
        const error = new AuthenticationApiError(
            'Mensagem pública segura.',
            {
                statusCode: 503,
                code: 'SERVICE_UNAVAILABLE',
                cause,
            },
        );

        expect(error).toBeInstanceOf(Error);
        expect(error.name).toBe('AuthenticationApiError');
        expect(error.message).toBe('Mensagem pública segura.');
        expect(error.statusCode).toBe(503);
        expect(error.code).toBe('SERVICE_UNAVAILABLE');
        expect(error.cause).toBe(cause);
        expect(error.message).not.toContain(cause.message);
        expect(() => {
            error.code = 'CHANGED';
        }).toThrow(TypeError);
    });

    test('rejeita mensagens inválidas', () => {
        const invalidMessages = [undefined, null, '', '   ', 42, {}];

        for (const message of invalidMessages) {
            expect(
                () => new AuthenticationApiError(message),
            ).toThrowError(
                AUTHENTICATION_API_MESSAGES.INVALID_ERROR_MESSAGE,
            );
        }
    });

    test('rejeita estados HTTP inválidos', () => {
        const invalidStatuses = [-1, 99, 600, 401.5, '401', null];

        for (const statusCode of invalidStatuses) {
            expect(
                () => new AuthenticationApiError(
                    'Mensagem segura.',
                    { statusCode },
                ),
            ).toThrowError(
                AUTHENTICATION_API_MESSAGES.INVALID_ERROR_STATUS,
            );
        }
    });

    test('rejeita códigos inválidos', () => {
        const invalidCodes = [null, '', 'erro', 'INVALID-CODE', 42, {}];

        for (const code of invalidCodes) {
            expect(
                () => new AuthenticationApiError(
                    'Mensagem segura.',
                    { code },
                ),
            ).toThrowError(
                AUTHENTICATION_API_MESSAGES.INVALID_ERROR_CODE,
            );
        }
    });
});

describe('preparação das credenciais', () => {
    test('normaliza somente os espaços externos do e-mail', () => {
        const credentials = AuthenticationApi.createCredentials({
            email: '  Dionisio@Example.com  ',
            password: '  senha com espaços  ',
            ignored: 'campo adicional',
        });

        expect(credentials).toEqual({
            email: 'Dionisio@Example.com',
            password: '  senha com espaços  ',
        });
        expect(Object.isFrozen(credentials)).toBe(true);
        expect('ignored' in credentials).toBe(false);
    });

    test('rejeita estruturas incompletas', () => {
        const invalidCredentials = [
            undefined,
            null,
            [],
            {},
            { email: 'dionisio@example.com' },
            { password: 'senha' },
            { email: '', password: 'senha' },
            { email: '   ', password: 'senha' },
            { email: 'dionisio@example.com', password: '' },
            { email: 'dionisio@example.com', password: null },
        ];

        for (const credentials of invalidCredentials) {
            expect(
                () => AuthenticationApi.createCredentials(credentials),
            ).toThrowError(
                AUTHENTICATION_API_MESSAGES.INVALID_CREDENTIALS,
            );
        }
    });
});

describe('login administrativo', () => {
    test('envia JSON seguro e devolve somente o usuário público', async () => {
        const response = createJsonResponse(
            200,
            createLoginPayload({
                id: '  user-123  ',
                name: '  Professor Dionísio  ',
            }),
        );
        const fetchClient = vi.fn().mockResolvedValue(response);
        const api = new AuthenticationApi({ fetchClient });

        const user = await api.login({
            email: '  dionisio@example.com  ',
            password: '  senha preservada  ',
            ignored: 'não enviar',
        });

        expect(fetchClient).toHaveBeenCalledWith(
            '/api/auth/login',
            {
                method: 'POST',
                headers: {
                    Accept: 'application/json',
                    'Content-Type': 'application/json',
                },
                credentials: 'same-origin',
                cache: 'no-store',
                body: JSON.stringify({
                    email: 'dionisio@example.com',
                    password: '  senha preservada  ',
                }),
            },
        );
        expect(user).toEqual({
            id: 'user-123',
            name: 'Professor Dionísio',
            email: 'dionisio@example.com',
            role: 'admin',
        });
        expect(Object.isFrozen(user)).toBe(true);
        expect('passwordHash' in user).toBe(false);
    });

    test('preserva um erro público recusado pelo backend', async () => {
        const fetchClient = vi.fn().mockResolvedValue(
            createJsonResponse(401, {
                error: {
                    code: 'INVALID_CREDENTIALS',
                    message: 'E-mail ou senha inválidos.',
                },
            }),
        );
        const api = new AuthenticationApi({ fetchClient });

        await expect(
            api.login(createCredentials()),
        ).rejects.toMatchObject({
            name: 'AuthenticationApiError',
            statusCode: 401,
            code: 'INVALID_CREDENTIALS',
            message: 'E-mail ou senha inválidos.',
        });
    });

    test('usa erro genérico para uma recusa malformada', async () => {
        const fetchClient = vi.fn().mockResolvedValue(
            createJsonResponse(429, {
                error: {
                    code: 'codigo-invalido',
                    message: 'Detalhe que não deve ser aceito.',
                },
            }),
        );
        const api = new AuthenticationApi({ fetchClient });

        await expect(
            api.login(createCredentials()),
        ).rejects.toMatchObject({
            statusCode: 429,
            code: AUTHENTICATION_API_CODES.REQUEST_FAILED,
            message: AUTHENTICATION_API_MESSAGES.REQUEST_FAILED,
        });
    });

    test('converte falha de rede sem expor credenciais', async () => {
        const cause = new Error(
            'Falha simulada contendo senha-de-teste.',
        );
        const fetchClient = vi.fn().mockRejectedValue(cause);
        const api = new AuthenticationApi({ fetchClient });

        const error = await api
            .login(createCredentials({
                password: 'senha-de-teste',
            }))
            .catch((receivedError) => receivedError);

        expect(error).toBeInstanceOf(AuthenticationApiError);
        expect(error.statusCode).toBe(0);
        expect(error.code).toBe(
            AUTHENTICATION_API_CODES.NETWORK_ERROR,
        );
        expect(error.message).toBe(
            AUTHENTICATION_API_MESSAGES.NETWORK_ERROR,
        );
        expect(error.message).not.toContain('senha-de-teste');
        expect(error.cause).toBe(cause);
    });

    test('rejeita um resultado que não seja resposta HTTP', async () => {
        const fetchClient = vi.fn().mockResolvedValue({});
        const api = new AuthenticationApi({ fetchClient });

        await expect(
            api.login(createCredentials()),
        ).rejects.toMatchObject({
            statusCode: 0,
            code: AUTHENTICATION_API_CODES.INVALID_RESPONSE,
            message: AUTHENTICATION_API_MESSAGES.INVALID_RESPONSE,
        });
    });

    test('rejeita um estado de sucesso diferente do contrato', async () => {
        const fetchClient = vi.fn().mockResolvedValue(
            createJsonResponse(201, createLoginPayload()),
        );
        const api = new AuthenticationApi({ fetchClient });

        await expect(
            api.login(createCredentials()),
        ).rejects.toMatchObject({
            statusCode: 201,
            code: AUTHENTICATION_API_CODES.INVALID_RESPONSE,
        });
    });

    test('rejeita JSON inválido em uma resposta de sucesso', async () => {
        const cause = new SyntaxError('JSON controlado inválido.');
        const response = createJsonResponse(200, null);
        response.json.mockRejectedValue(cause);
        const fetchClient = vi.fn().mockResolvedValue(response);
        const api = new AuthenticationApi({ fetchClient });

        const error = await api
            .login(createCredentials())
            .catch((receivedError) => receivedError);

        expect(error).toMatchObject({
            statusCode: 200,
            code: AUTHENTICATION_API_CODES.INVALID_RESPONSE,
            message: AUTHENTICATION_API_MESSAGES.INVALID_RESPONSE,
        });
        expect(error.cause).toBe(cause);
    });

    test('rejeita identidades públicas incompletas', async () => {
        const invalidPayloads = [
            null,
            {},
            { data: {} },
            createLoginPayload({ id: '' }),
            createLoginPayload({ name: null }),
            createLoginPayload({ email: '   ' }),
            createLoginPayload({ role: undefined }),
        ];

        for (const payload of invalidPayloads) {
            const fetchClient = vi.fn().mockResolvedValue(
                createJsonResponse(200, payload),
            );
            const api = new AuthenticationApi({ fetchClient });

            await expect(
                api.login(createCredentials()),
            ).rejects.toMatchObject({
                code: AUTHENTICATION_API_CODES.INVALID_RESPONSE,
            });
        }
    });
});

describe('consulta da sessão administrativa', () => {
    test('consulta sem corpo e devolve somente a identidade mínima', async () => {
        const fetchClient = vi.fn().mockResolvedValue(
            createJsonResponse(200, createSessionPayload({
                id: '  user-123  ',
                role: '  admin  ',
            })),
        );
        const api = new AuthenticationApi({ fetchClient });

        const session = await api.getSession();

        expect(fetchClient).toHaveBeenCalledWith(
            '/api/auth/session',
            {
                method: 'GET',
                headers: {
                    Accept: 'application/json',
                },
                credentials: 'same-origin',
                cache: 'no-store',
            },
        );
        expect(session).toEqual({
            authenticated: true,
            user: {
                id: 'user-123',
                role: 'admin',
            },
        });
        expect(Object.isFrozen(session)).toBe(true);
        expect(Object.isFrozen(session.user)).toBe(true);
        expect('email' in session.user).toBe(false);
    });

    test('preserva a recusa de uma consulta anônima', async () => {
        const fetchClient = vi.fn().mockResolvedValue(
            createJsonResponse(401, {
                error: {
                    code: 'AUTHENTICATION_REQUIRED',
                    message: 'É necessário entrar com uma conta válida.',
                },
            }),
        );
        const api = new AuthenticationApi({ fetchClient });

        await expect(api.getSession()).rejects.toMatchObject({
            statusCode: 401,
            code: 'AUTHENTICATION_REQUIRED',
            message: 'É necessário entrar com uma conta válida.',
        });
    });

    test('rejeita confirmações de sessão inconsistentes', async () => {
        const invalidPayloads = [
            null,
            {},
            { data: { authenticated: false } },
            createSessionPayload({ id: '' }),
            createSessionPayload({ role: null }),
        ];

        for (const payload of invalidPayloads) {
            const fetchClient = vi.fn().mockResolvedValue(
                createJsonResponse(200, payload),
            );
            const api = new AuthenticationApi({ fetchClient });

            await expect(api.getSession()).rejects.toMatchObject({
                code: AUTHENTICATION_API_CODES.INVALID_RESPONSE,
            });
        }
    });
});

describe('logout administrativo', () => {
    test('envia POST sem corpo e aceita somente 204', async () => {
        const response = createJsonResponse(204, null);
        const fetchClient = vi.fn().mockResolvedValue(response);
        const api = new AuthenticationApi({ fetchClient });

        const result = await api.logout();

        expect(fetchClient).toHaveBeenCalledWith(
            '/api/auth/logout',
            {
                method: 'POST',
                headers: {
                    Accept: 'application/json',
                },
                credentials: 'same-origin',
                cache: 'no-store',
            },
        );
        expect(result).toBeUndefined();
        expect(response.json).not.toHaveBeenCalled();
    });

    test('preserva uma falha conhecida do logout', async () => {
        const fetchClient = vi.fn().mockResolvedValue(
            createJsonResponse(500, {
                error: {
                    code: 'INTERNAL_ERROR',
                    message: 'Não foi possível concluir a operação.',
                },
            }),
        );
        const api = new AuthenticationApi({ fetchClient });

        await expect(api.logout()).rejects.toMatchObject({
            statusCode: 500,
            code: 'INTERNAL_ERROR',
            message: 'Não foi possível concluir a operação.',
        });
    });

    test('rejeita sucesso com corpo no lugar de 204', async () => {
        const fetchClient = vi.fn().mockResolvedValue(
            createJsonResponse(200, { data: null }),
        );
        const api = new AuthenticationApi({ fetchClient });

        await expect(api.logout()).rejects.toMatchObject({
            statusCode: 200,
            code: AUTHENTICATION_API_CODES.INVALID_RESPONSE,
        });
    });
});
