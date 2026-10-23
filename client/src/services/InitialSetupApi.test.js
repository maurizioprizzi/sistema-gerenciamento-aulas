import { afterEach, describe, expect, test, vi } from 'vitest';

import {
    INITIAL_SETUP_API_CODES,
    INITIAL_SETUP_API_MESSAGES,
    INITIAL_SETUP_API_PATHS,
    InitialSetupApi,
    InitialSetupApiError,
    initialSetupApi,
} from './InitialSetupApi.js';

// Todos os valores são fictícios e exclusivos dos testes.
function createInput(overrides = {}) {
    return {
        invitationToken: 'ab'.repeat(32),
        name: 'Ana Silva',
        email: 'ana@example.com',
        password: 'senha fictícia de teste',
        ...overrides,
    };
}

function createJsonResponse(status, payload) {
    return {
        status,
        ok: status >= 200 && status <= 299,
        json: vi.fn().mockResolvedValue(payload),
    };
}

function createClient(response) {
    const fetchClient = vi.fn().mockResolvedValue(response);
    return { api: new InitialSetupApi({ fetchClient }), fetchClient };
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('configuração da InitialSetupApi', () => {
    test('constrói uma instância imutável sem enviar requisições', () => {
        const fetchClient = vi.fn();
        const api = new InitialSetupApi({ fetchClient });
        expect(fetchClient).not.toHaveBeenCalled();
        expect(Object.isFrozen(api)).toBe(true);
        expect(initialSetupApi).toBeInstanceOf(InitialSetupApi);
        expect(Object.isFrozen(initialSetupApi)).toBe(true);
        expect(Object.isFrozen(INITIAL_SETUP_API_PATHS)).toBe(true);
        expect(Object.isFrozen(INITIAL_SETUP_API_CODES)).toBe(true);
        expect(Object.isFrozen(INITIAL_SETUP_API_MESSAGES)).toBe(true);
    });

    test('recusa clientes HTTP incompatíveis', () => {
        for (const fetchClient of [null, false, 42, 'fetch', {}, []]) {
            expect(() => new InitialSetupApi({ fetchClient }))
                .toThrowError(INITIAL_SETUP_API_MESSAGES.INVALID_FETCH_CLIENT);
        }
    });

    test('usa o fetch do navegador quando nenhuma dependência é fornecida', async () => {
        const fetchClient = vi.fn().mockResolvedValue(
            createJsonResponse(200, { data: { available: false } }),
        );
        vi.stubGlobal('fetch', fetchClient);
        await expect(initialSetupApi.getStatus()).resolves.toEqual({ available: false });
        expect(fetchClient).toHaveBeenCalledOnce();
        expect(fetchClient.mock.calls[0][0]).toBe('/api/setup/status');
    });
});

describe('metadados de InitialSetupApiError', () => {
    test('expõe código e estado sem permitir substituí-los', () => {
        const error = new InitialSetupApiError('Recusa pública.', {
            statusCode: 409,
            code: 'INITIAL_SETUP_UNAVAILABLE',
        });
        expect(error).toBeInstanceOf(Error);
        expect(error.name).toBe('InitialSetupApiError');
        expect(error.statusCode).toBe(409);
        expect(error.code).toBe('INITIAL_SETUP_UNAVAILABLE');
        expect(() => { error.code = 'OTHER'; }).toThrow(TypeError);
        expect(() => { error.statusCode = 200; }).toThrow(TypeError);
    });

    test('rejeita mensagem, estado e código incompatíveis', () => {
        for (const message of [null, undefined, '', '   ', 42]) {
            expect(() => new InitialSetupApiError(message)).toThrow(TypeError);
        }
        for (const statusCode of [-1, 99, 600, 200.5, '400', NaN]) {
            expect(() => new InitialSetupApiError('Erro.', { statusCode }))
                .toThrow(RangeError);
        }
        for (const code of [null, '', 'unknown', ' BAD_CODE', 42]) {
            expect(() => new InitialSetupApiError('Erro.', { code })).toThrow(TypeError);
        }
    });
});

describe('consulta de disponibilidade do primeiro cadastro', () => {
    test.each([true, false])('retorna somente a disponibilidade %s', async (available) => {
        const { api, fetchClient } = createClient(createJsonResponse(200, {
            data: { available, invitationToken: 'valor privado', user: { id: 'interno' } },
        }));
        const getStatus = api.getStatus;
        const result = await getStatus();
        expect(result).toEqual({ available });
        expect(Object.isFrozen(result)).toBe(true);
        expect(fetchClient).toHaveBeenCalledExactlyOnceWith('/api/setup/status', {
            method: 'GET',
            headers: { Accept: 'application/json' },
            credentials: 'same-origin',
            mode: 'same-origin',
            cache: 'no-store',
            redirect: 'error',
        });
    });

    test.each([
        null, [], {}, { data: null }, { data: [] },
        { data: {} }, { data: { available: 'true' } }, { data: { available: 1 } },
    ])('recusa disponibilidade malformada: %j', async (payload) => {
        const { api } = createClient(createJsonResponse(200, payload));
        await expect(api.getStatus()).rejects.toMatchObject({
            name: 'InitialSetupApiError',
            statusCode: 200,
            code: INITIAL_SETUP_API_CODES.INVALID_RESPONSE,
        });
    });

    test('consulta novamente em vez de guardar a disponibilidade anterior', async () => {
        const fetchClient = vi.fn()
            .mockResolvedValueOnce(createJsonResponse(200, { data: { available: true } }))
            .mockResolvedValueOnce(createJsonResponse(200, { data: { available: false } }));
        const api = new InitialSetupApi({ fetchClient });
        await expect(api.getStatus()).resolves.toEqual({ available: true });
        await expect(api.getStatus()).resolves.toEqual({ available: false });
        expect(fetchClient).toHaveBeenCalledTimes(2);
    });
});

describe('dados enviados no primeiro cadastro', () => {
    test('normaliza nome/e-mail, preserva senha/convite e seleciona quatro campos', async () => {
        const input = Object.freeze(createInput({
            invitationToken: 'AB'.repeat(32),
            name: '  Ana \t Silva  ',
            email: ' ANA@EXAMPLE.COM ',
            password: '  senha com espaços  ',
            role: 'admin',
            active: false,
            passwordHash: 'campo extra',
        }));
        const { api, fetchClient } = createClient(createJsonResponse(201, {
            data: { created: true, passwordHash: 'privado', user: { id: 'interno' } },
        }));
        const createAdmin = api.createAdmin;
        const result = await createAdmin(input);
        expect(result).toEqual({ created: true });
        expect(Object.isFrozen(result)).toBe(true);
        expect(fetchClient).toHaveBeenCalledExactlyOnceWith('/api/setup/admin', {
            method: 'POST',
            headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            mode: 'same-origin',
            cache: 'no-store',
            redirect: 'error',
            referrerPolicy: 'strict-origin',
            body: JSON.stringify({
                invitationToken: input.invitationToken,
                name: 'Ana Silva',
                email: 'ana@example.com',
                password: input.password,
            }),
        });
        expect(input.name).toBe('  Ana \t Silva  ');
        expect(input.email).toBe(' ANA@EXAMPLE.COM ');
        // Nenhum pedido adicional de login ou consulta de sessão.
        expect(fetchClient).toHaveBeenCalledOnce();
    });

    test('recusa entradas que não sejam objetos antes de acessar a rede', async () => {
        const { api, fetchClient } = createClient(null);
        for (const input of [undefined, null, [], 'dados', 42]) {
            await expect(api.createAdmin(input))
                .rejects.toThrow(INITIAL_SETUP_API_MESSAGES.INVALID_DATA);
        }
        expect(fetchClient).not.toHaveBeenCalled();
    });

    const invalidFields = [
        ['convite', 'invitationToken', [undefined, null, '', 'a'.repeat(63), 'g'.repeat(64), ` ${'ab'.repeat(32)}`], 'INVALID_INVITATION'],
        ['nome', 'name', [undefined, null, ' ', ' A ', 'a'.repeat(121)], 'INVALID_NAME'],
        ['e-mail', 'email', [undefined, null, '', 'sem-arroba', 'a b@example.com', `${'a'.repeat(243)}@example.com`], 'INVALID_EMAIL'],
        ['senha', 'password', [undefined, null, '', 'curta', ' '.repeat(12), 'a'.repeat(73)], 'INVALID_PASSWORD'],
    ];

    test.each(invalidFields)('recusa %s inválido antes da rede', async (_, field, values, messageKey) => {
        const { api, fetchClient } = createClient(null);
        for (const value of values) {
            await expect(api.createAdmin(createInput({ [field]: value })))
                .rejects.toThrow(INITIAL_SETUP_API_MESSAGES[messageKey]);
        }
        expect(fetchClient).not.toHaveBeenCalled();
    });

    test.each(['a'.repeat(72), 'é'.repeat(36), '🙂'.repeat(18)])(
        'aceita senha com exatamente 72 bytes UTF-8: %s', async (password) => {
            const { api, fetchClient } = createClient(createJsonResponse(201, {
                data: { created: true },
            }));
            await api.createAdmin(createInput({ password }));
            expect(JSON.parse(fetchClient.mock.calls[0][1].body).password).toBe(password);
        },
    );

    test('recusa senha Unicode acima de 72 bytes sem truncá-la', async () => {
        const { api, fetchClient } = createClient(null);
        for (const password of ['é'.repeat(37), '🙂'.repeat(19)]) {
            await expect(api.createAdmin(createInput({ password })))
                .rejects.toThrow(INITIAL_SETUP_API_MESSAGES.INVALID_PASSWORD);
        }
        expect(fetchClient).not.toHaveBeenCalled();
    });

    test('aguarda a resposta HTTP antes de confirmar a criação', async () => {
        let resolveResponse;
        const fetchClient = vi.fn(() => new Promise((resolve) => { resolveResponse = resolve; }));
        const api = new InitialSetupApi({ fetchClient });
        const completed = vi.fn();
        const pending = api.createAdmin(createInput()).then(completed);
        await Promise.resolve();
        expect(completed).not.toHaveBeenCalled();
        resolveResponse(createJsonResponse(201, { data: { created: true } }));
        await pending;
        expect(completed).toHaveBeenCalledExactlyOnceWith({ created: true });
    });
});

describe('recusas públicas e confidencialidade', () => {
    test.each([
        [400, 'INITIAL_SETUP_INVALID_DATA', 'INVALID_DATA'],
        [403, 'INITIAL_SETUP_INVALID_INVITATION', 'INVALID_INVITATION'],
        [403, 'INITIAL_SETUP_FORBIDDEN_ORIGIN', 'FORBIDDEN_ORIGIN'],
        [409, 'INITIAL_SETUP_UNAVAILABLE', 'UNAVAILABLE'],
        [415, 'INITIAL_SETUP_UNSUPPORTED_MEDIA_TYPE', 'UNSUPPORTED_MEDIA_TYPE'],
        [429, 'INITIAL_SETUP_RATE_LIMITED', 'RATE_LIMITED'],
    ])('trata HTTP %s / %s com mensagem local segura', async (statusCode, code, messageKey) => {
        const secrets = createInput();
        const { api, fetchClient } = createClient(createJsonResponse(statusCode, {
            error: { code, message: secrets.password, details: secrets, stack: secrets.invitationToken },
        }));
        const error = await api.createAdmin(secrets).catch((failure) => failure);
        expect(error).toBeInstanceOf(InitialSetupApiError);
        expect(error).toMatchObject({ statusCode, code, message: INITIAL_SETUP_API_MESSAGES[messageKey] });
        expect(error).not.toHaveProperty('details');
        expect(error).not.toHaveProperty('cause');
        expect(String(error)).not.toContain(secrets.password);
        expect(JSON.stringify(error)).not.toContain(secrets.invitationToken);
        expect(fetchClient).toHaveBeenCalledOnce();
    });

    test.each([
        [500, { error: { code: 'INITIAL_SETUP_INVALID_DATA', message: 'detalhe interno' } }],
        [403, { error: { code: 'INITIAL_SETUP_UNAVAILABLE', message: 'estado incompatível' } }],
        [400, { error: { code: 'UNKNOWN_ERROR', message: 'detalhe interno' } }],
        [400, { error: { code: '__proto__', message: 'detalhe interno' } }],
        [400, null],
        [400, { error: [] }],
    ])('usa erro genérico para recusa não reconhecida: %s %j', async (statusCode, payload) => {
        const { api } = createClient(createJsonResponse(statusCode, payload));
        await expect(api.createAdmin(createInput())).rejects.toMatchObject({
            statusCode,
            code: INITIAL_SETUP_API_CODES.REQUEST_FAILED,
            message: INITIAL_SETUP_API_MESSAGES.REQUEST_FAILED,
        });
    });

    test('não aplica códigos exclusivos da criação ao GET de disponibilidade', async () => {
        const { api } = createClient(createJsonResponse(409, {
            error: { code: 'INITIAL_SETUP_UNAVAILABLE', message: 'texto recebido' },
        }));
        await expect(api.getStatus()).rejects.toMatchObject({
            statusCode: 409,
            code: INITIAL_SETUP_API_CODES.REQUEST_FAILED,
        });
    });

    test.each([false, true])('trata recusa sem JSON válido (leitura falha: %s)', async (readFails) => {
        const response = { status: 503, ok: false };
        if (readFails) response.json = vi.fn().mockRejectedValue(new Error('detalhe interno'));
        const { api } = createClient(response);
        await expect(api.createAdmin(createInput())).rejects.toMatchObject({
            statusCode: 503,
            code: INITIAL_SETUP_API_CODES.REQUEST_FAILED,
            message: INITIAL_SETUP_API_MESSAGES.REQUEST_FAILED,
        });
    });
});

describe('respostas inválidas e falhas de comunicação', () => {
    test.each([
        null, [], {},
        { status: '200', ok: true },
        { status: 0, ok: false },
        { status: 600, ok: false },
        { status: 200, ok: false },
        { status: 403, ok: true },
    ])('recusa metadados HTTP inconsistentes: %j', async (response) => {
        const { api } = createClient(response);
        await expect(api.getStatus()).rejects.toMatchObject({
            code: INITIAL_SETUP_API_CODES.INVALID_RESPONSE,
        });
    });

    test.each([200, 202, 204])('não confirma criação com HTTP %s', async (status) => {
        const { api } = createClient(createJsonResponse(status, { data: { created: true } }));
        await expect(api.createAdmin(createInput())).rejects.toMatchObject({
            statusCode: status,
            code: INITIAL_SETUP_API_CODES.INVALID_RESPONSE,
        });
    });

    test.each([null, {}, { data: [] }, { data: {} }, { data: { created: false } }, { data: { created: 'true' } }])(
        'não confirma criação com envelope inválido: %j', async (payload) => {
            const { api } = createClient(createJsonResponse(201, payload));
            await expect(api.createAdmin(createInput())).rejects.toMatchObject({
                statusCode: 201,
                code: INITIAL_SETUP_API_CODES.INVALID_RESPONSE,
            });
        },
    );

    test.each([false, true])('recusa sucesso sem JSON legível (leitura falha: %s)', async (readFails) => {
        const response = { status: 201, ok: true };
        if (readFails) response.json = vi.fn().mockRejectedValue(new Error('segredo'));
        const { api } = createClient(response);
        await expect(api.createAdmin(createInput())).rejects.toMatchObject({
            statusCode: 201,
            code: INITIAL_SETUP_API_CODES.INVALID_RESPONSE,
        });
    });

    test.each(['getStatus', 'createAdmin'])('falha de rede em %s não expõe causa nem repete a requisição', async (method) => {
        const input = createInput();
        const fetchClient = vi.fn().mockRejectedValue(new Error(JSON.stringify(input)));
        const api = new InitialSetupApi({ fetchClient });
        const error = await api[method](input).catch((failure) => failure);
        expect(error).toBeInstanceOf(InitialSetupApiError);
        expect(error).toMatchObject({
            statusCode: 0,
            code: INITIAL_SETUP_API_CODES.NETWORK_ERROR,
            message: INITIAL_SETUP_API_MESSAGES.NETWORK_ERROR,
        });
        expect(error).not.toHaveProperty('cause');
        expect(String(error)).not.toContain(input.password);
        expect(fetchClient).toHaveBeenCalledOnce();
    });
});
