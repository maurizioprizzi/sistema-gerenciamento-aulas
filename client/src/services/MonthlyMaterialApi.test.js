import {
    afterEach,
    describe,
    expect,
    test,
    vi,
} from 'vitest';

import {
    MONTHLY_MATERIAL_API_CODES,
    MONTHLY_MATERIAL_API_MESSAGES,
    MONTHLY_MATERIAL_API_PATHS,
    MONTHLY_MATERIAL_DATA_FIELDS,
    MonthlyMaterialApi,
    MonthlyMaterialApiError,
    defaultFetchClient,
    monthlyMaterialApi,
} from './MonthlyMaterialApi.js';

/**
 * Cria a representação pública controlada de um material mensal.
 *
 * @param {object} overrides Campos substituídos pelo cenário.
 * @returns {object} Material mensal recebido do backend.
 */
function createPublicMonthlyMaterial(overrides = {}) {
    return {
        id: 'monthly-material-123',
        month: '2026-09',
        lessonPlanUrl: 'https://example.com/pa-setembro',
        studentGuideUrl: 'https://example.com/gd-ad-setembro',
        createdAt: '2026-09-01T10:00:00.000Z',
        internalNote: 'não deve atravessar o cliente',
        ...overrides,
    };
}

/**
 * Monta o envelope público utilizado pelas duas operações mensais.
 *
 * @param {object|null} material Material presente ou ausência normal.
 * @returns {object} Corpo JSON da API.
 */
function createMaterialPayload(
    material = createPublicMonthlyMaterial(),
) {
    return {
        data: {
            material,
        },
    };
}

/**
 * Monta o envelope público da listagem mensal.
 *
 * @param {Array} materials Materiais presentes na coleção.
 * @returns {object} Corpo JSON da API.
 */
function createMaterialListPayload(
    materials = [createPublicMonthlyMaterial()],
) {
    return {
        data: {
            materials,
        },
    };
}

/**
 * Simula somente as propriedades de Response utilizadas pelo serviço.
 *
 * @param {number} status Estado HTTP.
 * @param {unknown} payload Corpo devolvido por json().
 * @returns {{ status: number, json: ReturnType<typeof vi.fn> }} Resposta.
 */
function createJsonResponse(status, payload) {
    return {
        status,
        json: vi.fn().mockResolvedValue(payload),
    };
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('configuração da MonthlyMaterialApi', () => {
    test('expõe contratos públicos estáveis e protegidos', () => {
        expect(MONTHLY_MATERIAL_API_PATHS).toEqual({
            MONTHLY_MATERIALS: '/api/monthly-materials',
        });
        expect(MONTHLY_MATERIAL_API_CODES).toEqual({
            NETWORK_ERROR: 'MONTHLY_MATERIAL_NETWORK_ERROR',
            INVALID_RESPONSE: 'INVALID_MONTHLY_MATERIAL_RESPONSE',
            REQUEST_FAILED: 'MONTHLY_MATERIAL_REQUEST_FAILED',
        });
        expect(MONTHLY_MATERIAL_DATA_FIELDS).toEqual([
            'lessonPlanUrl',
            'studentGuideUrl',
        ]);

        for (const contract of [
            MONTHLY_MATERIAL_API_PATHS,
            MONTHLY_MATERIAL_API_CODES,
            MONTHLY_MATERIAL_API_MESSAGES,
            MONTHLY_MATERIAL_DATA_FIELDS,
        ]) {
            expect(Object.isFrozen(contract)).toBe(true);
        }
    });

    test('disponibiliza uma instância padrão imutável', () => {
        expect(monthlyMaterialApi).toBeInstanceOf(
            MonthlyMaterialApi,
        );
        expect(Object.isFrozen(monthlyMaterialApi)).toBe(true);
        expect(typeof monthlyMaterialApi.listMonthlyMaterials).toBe(
            'function',
        );
        expect(typeof monthlyMaterialApi.getMonthlyMaterial).toBe(
            'function',
        );
        expect(typeof monthlyMaterialApi.saveMonthlyMaterial).toBe(
            'function',
        );
        expect(typeof monthlyMaterialApi.deleteMonthlyMaterial).toBe(
            'function',
        );
    });

    test('rejeita clientes HTTP inválidos', () => {
        for (const fetchClient of [null, 42, 'fetch', {}, []]) {
            expect(
                () => new MonthlyMaterialApi({ fetchClient }),
            ).toThrowError(
                MONTHLY_MATERIAL_API_MESSAGES.INVALID_FETCH_CLIENT,
            );
        }
    });

    test('utiliza o fetch global pela dependência padrão', async () => {
        const fetchClient = vi.fn().mockResolvedValue(
            createJsonResponse(200, createMaterialPayload(null)),
        );

        vi.stubGlobal('fetch', fetchClient);

        const response = await defaultFetchClient(
            '/api/monthly-materials/2026-09',
            { method: 'GET' },
        );

        expect(response.status).toBe(200);
        expect(fetchClient).toHaveBeenCalledOnce();
    });

    test('mantém o contexto quando as operações são extraídas', async () => {
        const fetchClient = vi.fn()
            .mockResolvedValueOnce(
                createJsonResponse(200, createMaterialListPayload([])),
            )
            .mockResolvedValueOnce(
                createJsonResponse(200, createMaterialPayload(null)),
            )
            .mockResolvedValueOnce(
                createJsonResponse(200, createMaterialPayload()),
            )
            .mockResolvedValueOnce(
                createJsonResponse(204, null),
            );
        const api = new MonthlyMaterialApi({ fetchClient });
        const listMonthlyMaterials = api.listMonthlyMaterials;
        const getMonthlyMaterial = api.getMonthlyMaterial;
        const saveMonthlyMaterial = api.saveMonthlyMaterial;
        const deleteMonthlyMaterial = api.deleteMonthlyMaterial;

        expect(await listMonthlyMaterials()).toEqual([]);
        expect(await getMonthlyMaterial('2026-09')).toBeNull();
        expect(await saveMonthlyMaterial('2026-09', {})).toEqual(
            expect.objectContaining({ month: '2026-09' }),
        );
        await expect(
            deleteMonthlyMaterial('2026-09'),
        ).resolves.toBeUndefined();
        expect(fetchClient).toHaveBeenCalledTimes(4);
    });
});

describe('MonthlyMaterialApiError', () => {
    test('mantém metadados estáveis sem incorporar a causa', () => {
        const cause = new Error('Falha técnica controlada.');
        const error = new MonthlyMaterialApiError(
            'Mensagem pública segura.',
            {
                statusCode: 503,
                code: 'SERVICE_UNAVAILABLE',
                cause,
            },
        );

        expect(error).toBeInstanceOf(Error);
        expect(error.name).toBe('MonthlyMaterialApiError');
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
        for (const message of [undefined, null, '', '   ', 42, {}]) {
            expect(
                () => new MonthlyMaterialApiError(message),
            ).toThrowError(
                MONTHLY_MATERIAL_API_MESSAGES.INVALID_ERROR_MESSAGE,
            );
        }
    });

    test('rejeita estados HTTP inválidos', () => {
        for (const statusCode of [-1, 99, 600, 400.5, '400', null]) {
            expect(
                () => new MonthlyMaterialApiError(
                    'Mensagem segura.',
                    { statusCode },
                ),
            ).toThrowError(
                MONTHLY_MATERIAL_API_MESSAGES.INVALID_ERROR_STATUS,
            );
        }
    });

    test('rejeita códigos inválidos', () => {
        for (const code of [null, '', 'erro', 'INVALID-CODE', 42, {}]) {
            expect(
                () => new MonthlyMaterialApiError(
                    'Mensagem segura.',
                    { code },
                ),
            ).toThrowError(
                MONTHLY_MATERIAL_API_MESSAGES.INVALID_ERROR_CODE,
            );
        }
    });
});

describe('preparação do mês e dos links', () => {
    test('normaliza um mês civil válido', () => {
        expect(MonthlyMaterialApi.createMonth(' 2026-09 ')).toBe(
            '2026-09',
        );
    });

    test('rejeita meses inválidos', () => {
        for (const month of [
            undefined,
            null,
            '',
            '   ',
            '0000-01',
            '2026-00',
            '2026-13',
            '09/2026',
            202609,
        ]) {
            expect(
                () => MonthlyMaterialApi.createMonth(month),
            ).toThrowError(
                MONTHLY_MATERIAL_API_MESSAGES.INVALID_MONTH,
            );
        }
    });

    test('normaliza os dois links em ordem estável', () => {
        const materialData = MonthlyMaterialApi.createMaterialData({
            studentGuideUrl: ' https://example.com/gd-ad ',
            lessonPlanUrl: ' https://example.com/pa ',
        });

        expect(materialData).toEqual({
            lessonPlanUrl: 'https://example.com/pa',
            studentGuideUrl: 'https://example.com/gd-ad',
        });
        expect(Object.isFrozen(materialData)).toBe(true);
    });

    test('converte campos vazios ou omitidos em null', () => {
        expect(MonthlyMaterialApi.createMaterialData({})).toEqual({
            lessonPlanUrl: null,
            studentGuideUrl: null,
        });
        expect(MonthlyMaterialApi.createMaterialData({
            lessonPlanUrl: '   ',
        })).toEqual({
            lessonPlanUrl: null,
            studentGuideUrl: null,
        });
    });

    test('rejeita estruturas, campos internos e desconhecidos', () => {
        for (const materialData of [
            undefined,
            null,
            [],
            'material',
            { month: '2026-09' },
            { id: 'monthly-material-123' },
            { createdAt: 'interno' },
            { ignored: true },
        ]) {
            expect(
                () => MonthlyMaterialApi.createMaterialData(
                    materialData,
                ),
            ).toThrowError(
                MONTHLY_MATERIAL_API_MESSAGES.INVALID_MATERIAL_DATA,
            );
        }
    });

    test('rejeita links com tipos inválidos', () => {
        for (const materialData of [
            { lessonPlanUrl: 42 },
            { lessonPlanUrl: {} },
            { studentGuideUrl: [] },
            { studentGuideUrl: false },
        ]) {
            expect(
                () => MonthlyMaterialApi.createMaterialData(
                    materialData,
                ),
            ).toThrowError(
                MONTHLY_MATERIAL_API_MESSAGES.INVALID_MATERIAL_DATA,
            );
        }
    });
});

describe('representação pública dos materiais mensais', () => {
    test('mantém somente os quatro campos públicos', () => {
        const material = MonthlyMaterialApi
            .createPublicMonthlyMaterial(
                createPublicMonthlyMaterial({
                    id: ' monthly-material-123 ',
                    month: ' 2026-09 ',
                }),
            );

        expect(material).toEqual({
            id: 'monthly-material-123',
            month: '2026-09',
            lessonPlanUrl: 'https://example.com/pa-setembro',
            studentGuideUrl:
                'https://example.com/gd-ad-setembro',
        });
        expect(Object.isFrozen(material)).toBe(true);
        expect('createdAt' in material).toBe(false);
        expect('internalNote' in material).toBe(false);
    });

    test('aceita os dois links representados por null', () => {
        const material = MonthlyMaterialApi
            .createPublicMonthlyMaterial(
                createPublicMonthlyMaterial({
                    lessonPlanUrl: null,
                    studentGuideUrl: null,
                }),
            );

        expect(material.lessonPlanUrl).toBeNull();
        expect(material.studentGuideUrl).toBeNull();
    });

    test('rejeita materiais incompletos ou inconsistentes', () => {
        for (const material of [
            null,
            {},
            createPublicMonthlyMaterial({ id: '' }),
            createPublicMonthlyMaterial({ month: '2026-13' }),
            createPublicMonthlyMaterial({ lessonPlanUrl: {} }),
            createPublicMonthlyMaterial({ studentGuideUrl: [] }),
        ]) {
            expect(
                () => MonthlyMaterialApi
                    .createPublicMonthlyMaterial(material),
            ).toThrowError(
                MONTHLY_MATERIAL_API_MESSAGES.INVALID_RESPONSE,
            );
        }
    });

    test('aceita a ausência normal somente no envelope mensal', () => {
        expect(
            MonthlyMaterialApi.createPublicMonthlyMaterialResult(
                createMaterialPayload(null),
            ),
        ).toBeNull();
    });

    test('rejeita envelopes mensais inconsistentes', () => {
        for (const payload of [
            null,
            {},
            { data: {} },
            { data: { material: undefined } },
            createMaterialPayload(
                createPublicMonthlyMaterial({ id: '' }),
            ),
        ]) {
            expect(
                () => MonthlyMaterialApi
                    .createPublicMonthlyMaterialResult(payload),
            ).toThrowError(
                MONTHLY_MATERIAL_API_MESSAGES.INVALID_RESPONSE,
            );
        }
    });

    test('cria uma lista pública imutável e independente', () => {
        const source = [
            createPublicMonthlyMaterial({ month: '2026-10' }),
            createPublicMonthlyMaterial(),
        ];
        const materials = MonthlyMaterialApi
            .createPublicMonthlyMaterialList(
                createMaterialListPayload(source),
            );

        expect(materials).toHaveLength(2);
        expect(materials.map((material) => material.month)).toEqual([
            '2026-10',
            '2026-09',
        ]);
        expect(Object.isFrozen(materials)).toBe(true);
        expect(Object.isFrozen(materials[0])).toBe(true);
        expect(materials[0]).not.toBe(source[0]);
        expect('createdAt' in materials[0]).toBe(false);
    });

    test('aceita uma lista mensal vazia', () => {
        const materials = MonthlyMaterialApi
            .createPublicMonthlyMaterialList(
                createMaterialListPayload([]),
            );

        expect(materials).toEqual([]);
        expect(Object.isFrozen(materials)).toBe(true);
    });

    test('rejeita envelopes e itens inválidos da listagem', () => {
        for (const payload of [
            null,
            {},
            { data: {} },
            { data: { materials: {} } },
            createMaterialListPayload([
                createPublicMonthlyMaterial({ id: '' }),
            ]),
        ]) {
            expect(
                () => MonthlyMaterialApi
                    .createPublicMonthlyMaterialList(payload),
            ).toThrowError(
                MONTHLY_MATERIAL_API_MESSAGES.INVALID_RESPONSE,
            );
        }
    });
});

describe('listagem dos materiais mensais', () => {
    test('consulta a coleção e devolve somente materiais públicos', async () => {
        const fetchClient = vi.fn().mockResolvedValue(
            createJsonResponse(200, createMaterialListPayload()),
        );
        const api = new MonthlyMaterialApi({ fetchClient });

        const materials = await api.listMonthlyMaterials();

        expect(fetchClient).toHaveBeenCalledWith(
            '/api/monthly-materials',
            {
                method: 'GET',
                headers: {
                    Accept: 'application/json',
                },
                credentials: 'same-origin',
                cache: 'no-store',
            },
        );
        expect(materials).toHaveLength(1);
        expect(Object.isFrozen(materials)).toBe(true);
        expect('internalNote' in materials[0]).toBe(false);
    });

    test('aceita a coleção vazia', async () => {
        const api = new MonthlyMaterialApi({
            fetchClient: vi.fn().mockResolvedValue(
                createJsonResponse(
                    200,
                    createMaterialListPayload([]),
                ),
            ),
        });

        await expect(api.listMonthlyMaterials()).resolves.toEqual([]);
    });

    test('preserva uma recusa pública do backend', async () => {
        const api = new MonthlyMaterialApi({
            fetchClient: vi.fn().mockResolvedValue(
                createJsonResponse(401, {
                    error: {
                        code: 'AUTHENTICATION_REQUIRED',
                        message: 'É necessário entrar na aplicação.',
                    },
                }),
            ),
        });

        await expect(api.listMonthlyMaterials()).rejects.toMatchObject({
            statusCode: 401,
            code: 'AUTHENTICATION_REQUIRED',
            message: 'É necessário entrar na aplicação.',
        });
    });

    test('rejeita estado e envelope de sucesso inconsistentes', async () => {
        const wrongStatusApi = new MonthlyMaterialApi({
            fetchClient: vi.fn().mockResolvedValue(
                createJsonResponse(201, createMaterialListPayload()),
            ),
        });
        const invalidPayloadApi = new MonthlyMaterialApi({
            fetchClient: vi.fn().mockResolvedValue(
                createJsonResponse(200, { data: {} }),
            ),
        });

        await expect(
            wrongStatusApi.listMonthlyMaterials(),
        ).rejects.toMatchObject({
            statusCode: 201,
            code: MONTHLY_MATERIAL_API_CODES.INVALID_RESPONSE,
        });
        await expect(
            invalidPayloadApi.listMonthlyMaterials(),
        ).rejects.toMatchObject({
            code: MONTHLY_MATERIAL_API_CODES.INVALID_RESPONSE,
        });
    });

    test('converte falha de rede sem expor dados técnicos', async () => {
        const cause = new Error('MongoDB interno indisponível.');
        const api = new MonthlyMaterialApi({
            fetchClient: vi.fn().mockRejectedValue(cause),
        });

        const error = await api.listMonthlyMaterials()
            .catch((receivedError) => receivedError);

        expect(error).toBeInstanceOf(MonthlyMaterialApiError);
        expect(error.code).toBe(
            MONTHLY_MATERIAL_API_CODES.NETWORK_ERROR,
        );
        expect(error.message).toBe(
            MONTHLY_MATERIAL_API_MESSAGES.NETWORK_ERROR,
        );
        expect(error.message).not.toContain(cause.message);
        expect(error.cause).toBe(cause);
    });
});

describe('consulta dos materiais mensais', () => {
    test('consulta o mês e devolve o material público', async () => {
        const fetchClient = vi.fn().mockResolvedValue(
            createJsonResponse(200, createMaterialPayload()),
        );
        const api = new MonthlyMaterialApi({ fetchClient });

        const material = await api.getMonthlyMaterial('2026-09');

        expect(fetchClient).toHaveBeenCalledWith(
            '/api/monthly-materials/2026-09',
            {
                method: 'GET',
                headers: {
                    Accept: 'application/json',
                },
                credentials: 'same-origin',
                cache: 'no-store',
            },
        );
        expect(material.id).toBe('monthly-material-123');
        expect(Object.isFrozen(material)).toBe(true);
        expect('createdAt' in material).toBe(false);
    });

    test('devolve null quando o mês ainda não possui materiais', async () => {
        const api = new MonthlyMaterialApi({
            fetchClient: vi.fn().mockResolvedValue(
                createJsonResponse(200, createMaterialPayload(null)),
            ),
        });

        await expect(
            api.getMonthlyMaterial('2026-09'),
        ).resolves.toBeNull();
    });

    test('preserva um erro público recusado pelo backend', async () => {
        const api = new MonthlyMaterialApi({
            fetchClient: vi.fn().mockResolvedValue(
                createJsonResponse(400, {
                    error: {
                        code: 'INVALID_MONTHLY_MATERIAL_MONTH',
                        message: 'O mês do material é inválido.',
                    },
                }),
            ),
        });

        await expect(
            api.getMonthlyMaterial('2026-09'),
        ).rejects.toMatchObject({
            name: 'MonthlyMaterialApiError',
            statusCode: 400,
            code: 'INVALID_MONTHLY_MATERIAL_MONTH',
            message: 'O mês do material é inválido.',
        });
    });

    test('usa erro genérico para uma recusa malformada', async () => {
        const api = new MonthlyMaterialApi({
            fetchClient: vi.fn().mockResolvedValue(
                createJsonResponse(500, {
                    error: {
                        code: 'codigo-invalido',
                        message: 'Detalhe interno.',
                    },
                }),
            ),
        });

        await expect(
            api.getMonthlyMaterial('2026-09'),
        ).rejects.toMatchObject({
            statusCode: 500,
            code: MONTHLY_MATERIAL_API_CODES.REQUEST_FAILED,
            message: MONTHLY_MATERIAL_API_MESSAGES.REQUEST_FAILED,
        });
    });

    test('converte falha de rede sem expor o mês', async () => {
        const cause = new Error('Falha simulada contendo 2026-09.');
        const api = new MonthlyMaterialApi({
            fetchClient: vi.fn().mockRejectedValue(cause),
        });

        const error = await api.getMonthlyMaterial('2026-09')
            .catch((receivedError) => receivedError);

        expect(error).toBeInstanceOf(MonthlyMaterialApiError);
        expect(error.statusCode).toBe(0);
        expect(error.code).toBe(
            MONTHLY_MATERIAL_API_CODES.NETWORK_ERROR,
        );
        expect(error.message).toBe(
            MONTHLY_MATERIAL_API_MESSAGES.NETWORK_ERROR,
        );
        expect(error.message).not.toContain('2026-09');
        expect(error.cause).toBe(cause);
    });

    test('rejeita resposta HTTP e sucesso inconsistentes', async () => {
        const invalidResponseApi = new MonthlyMaterialApi({
            fetchClient: vi.fn().mockResolvedValue({}),
        });
        const wrongStatusApi = new MonthlyMaterialApi({
            fetchClient: vi.fn().mockResolvedValue(
                createJsonResponse(201, createMaterialPayload()),
            ),
        });

        await expect(
            invalidResponseApi.getMonthlyMaterial('2026-09'),
        ).rejects.toMatchObject({
            statusCode: 0,
            code: MONTHLY_MATERIAL_API_CODES.INVALID_RESPONSE,
        });
        await expect(
            wrongStatusApi.getMonthlyMaterial('2026-09'),
        ).rejects.toMatchObject({
            statusCode: 201,
            code: MONTHLY_MATERIAL_API_CODES.INVALID_RESPONSE,
        });
    });

    test('rejeita JSON inválido em uma resposta de sucesso', async () => {
        const cause = new SyntaxError('JSON controlado inválido.');
        const response = createJsonResponse(200, null);

        response.json.mockRejectedValue(cause);

        const api = new MonthlyMaterialApi({
            fetchClient: vi.fn().mockResolvedValue(response),
        });
        const error = await api.getMonthlyMaterial('2026-09')
            .catch((receivedError) => receivedError);

        expect(error).toMatchObject({
            statusCode: 200,
            code: MONTHLY_MATERIAL_API_CODES.INVALID_RESPONSE,
            message: MONTHLY_MATERIAL_API_MESSAGES.INVALID_RESPONSE,
        });
        expect(error.cause).toBe(cause);
    });
});

describe('gravação dos materiais mensais', () => {
    test('envia somente os dois links e devolve o estado público', async () => {
        const fetchClient = vi.fn().mockResolvedValue(
            createJsonResponse(200, createMaterialPayload()),
        );
        const api = new MonthlyMaterialApi({ fetchClient });
        const materialData = {
            lessonPlanUrl: 'https://example.com/pa-setembro',
            studentGuideUrl: 'https://example.com/gd-ad-setembro',
        };

        const material = await api.saveMonthlyMaterial(
            '2026-09',
            materialData,
        );

        expect(fetchClient).toHaveBeenCalledWith(
            '/api/monthly-materials/2026-09',
            {
                method: 'PUT',
                headers: {
                    Accept: 'application/json',
                    'Content-Type': 'application/json',
                },
                credentials: 'same-origin',
                cache: 'no-store',
                body: JSON.stringify(materialData),
            },
        );
        expect(material.id).toBe('monthly-material-123');
        expect(Object.isFrozen(material)).toBe(true);
    });

    test('envia remoções explícitas para campos omitidos', async () => {
        const fetchClient = vi.fn().mockResolvedValue(
            createJsonResponse(200, createMaterialPayload({
                ...createPublicMonthlyMaterial(),
                studentGuideUrl: null,
            })),
        );
        const api = new MonthlyMaterialApi({ fetchClient });

        await api.saveMonthlyMaterial('2026-09', {
            lessonPlanUrl: ' https://example.com/pa-setembro ',
        });

        const request = fetchClient.mock.calls[0][1];

        expect(JSON.parse(request.body)).toEqual({
            lessonPlanUrl: 'https://example.com/pa-setembro',
            studentGuideUrl: null,
        });
    });

    test('preserva uma validação pública recusada pelo backend', async () => {
        const api = new MonthlyMaterialApi({
            fetchClient: vi.fn().mockResolvedValue(
                createJsonResponse(400, {
                    error: {
                        code: 'INVALID_MONTHLY_MATERIAL_DATA',
                        message:
                            'Os dados do material mensal são inválidos.',
                    },
                }),
            ),
        });

        await expect(
            api.saveMonthlyMaterial('2026-09', {}),
        ).rejects.toMatchObject({
            statusCode: 400,
            code: 'INVALID_MONTHLY_MATERIAL_DATA',
            message: 'Os dados do material mensal são inválidos.',
        });
    });

    test('rejeita estado de sucesso diferente de 200', async () => {
        const api = new MonthlyMaterialApi({
            fetchClient: vi.fn().mockResolvedValue(
                createJsonResponse(201, createMaterialPayload()),
            ),
        });

        await expect(
            api.saveMonthlyMaterial('2026-09', {}),
        ).rejects.toMatchObject({
            statusCode: 201,
            code: MONTHLY_MATERIAL_API_CODES.INVALID_RESPONSE,
        });
    });

    test('rejeita ausência e envelopes de gravação inconsistentes', async () => {
        for (const payload of [
            null,
            {},
            { data: {} },
            createMaterialPayload(null),
            createMaterialPayload(
                createPublicMonthlyMaterial({ id: '' }),
            ),
        ]) {
            const api = new MonthlyMaterialApi({
                fetchClient: vi.fn().mockResolvedValue(
                    createJsonResponse(200, payload),
                ),
            });

            await expect(
                api.saveMonthlyMaterial('2026-09', {}),
            ).rejects.toMatchObject({
                code: MONTHLY_MATERIAL_API_CODES.INVALID_RESPONSE,
            });
        }
    });

    test('converte falha de rede sem expor os links', async () => {
        const cause = new Error(
            'Falha com https://example.com/material-confidencial.',
        );
        const api = new MonthlyMaterialApi({
            fetchClient: vi.fn().mockRejectedValue(cause),
        });

        const error = await api.saveMonthlyMaterial('2026-09', {
            lessonPlanUrl:
                'https://example.com/material-confidencial',
        }).catch((receivedError) => receivedError);

        expect(error).toBeInstanceOf(MonthlyMaterialApiError);
        expect(error.code).toBe(
            MONTHLY_MATERIAL_API_CODES.NETWORK_ERROR,
        );
        expect(error.message).not.toContain('material-confidencial');
        expect(error.cause).toBe(cause);
    });
});

describe('exclusão dos materiais mensais', () => {
    test('envia DELETE e aceita a resposta 204 sem ler JSON', async () => {
        const response = createJsonResponse(204, null);
        const fetchClient = vi.fn().mockResolvedValue(response);
        const api = new MonthlyMaterialApi({ fetchClient });

        await expect(
            api.deleteMonthlyMaterial(' 2026-09 '),
        ).resolves.toBeUndefined();

        expect(fetchClient).toHaveBeenCalledWith(
            '/api/monthly-materials/2026-09',
            {
                method: 'DELETE',
                headers: {
                    Accept: 'application/json',
                },
                credentials: 'same-origin',
                cache: 'no-store',
            },
        );
        expect(response.json).not.toHaveBeenCalled();
    });

    test('rejeita o mês inválido antes de acessar a rede', async () => {
        const fetchClient = vi.fn();
        const api = new MonthlyMaterialApi({ fetchClient });

        await expect(
            api.deleteMonthlyMaterial('2026-13'),
        ).rejects.toThrowError(
            MONTHLY_MATERIAL_API_MESSAGES.INVALID_MONTH,
        );
        expect(fetchClient).not.toHaveBeenCalled();
    });

    test('preserva uma recusa pública do backend', async () => {
        const api = new MonthlyMaterialApi({
            fetchClient: vi.fn().mockResolvedValue(
                createJsonResponse(400, {
                    error: {
                        code: 'INVALID_MONTHLY_MATERIAL_MONTH',
                        message: 'O mês do material é inválido.',
                    },
                }),
            ),
        });

        await expect(
            api.deleteMonthlyMaterial('2026-09'),
        ).rejects.toMatchObject({
            statusCode: 400,
            code: 'INVALID_MONTHLY_MATERIAL_MONTH',
            message: 'O mês do material é inválido.',
        });
    });

    test('rejeita um estado de sucesso diferente de 204', async () => {
        const api = new MonthlyMaterialApi({
            fetchClient: vi.fn().mockResolvedValue(
                createJsonResponse(200, {}),
            ),
        });

        await expect(
            api.deleteMonthlyMaterial('2026-09'),
        ).rejects.toMatchObject({
            statusCode: 200,
            code: MONTHLY_MATERIAL_API_CODES.INVALID_RESPONSE,
        });
    });

    test('converte falha de rede sem expor o mês', async () => {
        const cause = new Error('Falha contendo 2026-09.');
        const api = new MonthlyMaterialApi({
            fetchClient: vi.fn().mockRejectedValue(cause),
        });

        const error = await api.deleteMonthlyMaterial('2026-09')
            .catch((receivedError) => receivedError);

        expect(error).toBeInstanceOf(MonthlyMaterialApiError);
        expect(error.code).toBe(
            MONTHLY_MATERIAL_API_CODES.NETWORK_ERROR,
        );
        expect(error.message).not.toContain('2026-09');
        expect(error.cause).toBe(cause);
    });
});
