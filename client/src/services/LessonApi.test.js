import {
    afterEach,
    describe,
    expect,
    test,
    vi,
} from 'vitest';

import {
    LESSON_API_CODES,
    LESSON_API_COURSES,
    LESSON_API_MESSAGES,
    LESSON_API_PATHS,
    LESSON_API_TYPES,
    LESSON_DATA_FIELDS,
    LESSON_FILTER_FIELDS,
    LESSON_ID_PATTERN,
    LESSON_UPDATE_FIELDS,
    LessonApi,
    LessonApiError,
    lessonApi,
} from './LessonApi.js';

/**
 * Cria uma resposta controlada compatível com a parte de Fetch utilizada.
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

/**
 * Cria uma resposta sem conteúdo e registra qualquer leitura indevida de JSON.
 *
 * @returns {object} Resposta HTTP 204 simulada.
 */
function createNoContentResponse() {
    return {
        status: 204,
        ok: true,
        json: vi.fn(),
    };
}

/**
 * Cria a representação pública completa de uma aula.
 *
 * Campos internos adicionais comprovam que o cliente seleciona novamente
 * somente o contrato público antes de entregar dados aos componentes.
 *
 * @param {object} overrides Valores específicos do cenário.
 * @returns {object} Aula recebida do backend.
 */
function createPublicLesson(overrides = {}) {
    return {
        id: 'lesson-123',
        date: '2026-09-18',
        course: 'APQSA',
        curricularUnit: 'Qualidade de Software',
        type: 'Aula',
        lessonNumber: '12',
        needsReview: false,
        lessonPlanUrl: 'https://example.com/pa',
        studentGuideUrl: 'https://example.com/gd-ad',
        createdAt: '2026-09-18T12:00:00.000Z',
        internalNote: 'não deve atravessar o cliente',
        ...overrides,
    };
}

function createListPayload(lessons = [createPublicLesson()]) {
    return {
        data: {
            lessons,
        },
    };
}

function createCreatedPayload(lesson = createPublicLesson()) {
    return {
        data: {
            lesson,
        },
    };
}

function createLessonData(overrides = {}) {
    return {
        date: '2026-09-18',
        course: 'APQSA',
        curricularUnit: 'Qualidade de Software',
        type: 'Aula',
        lessonNumber: '12',
        needsReview: false,
        lessonPlanUrl: 'https://example.com/pa',
        studentGuideUrl: 'https://example.com/gd-ad',
        ...overrides,
    };
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('configuração da LessonApi', () => {
    test('expõe contratos públicos estáveis e protegidos', () => {
        expect(LESSON_API_PATHS).toEqual({
            LESSONS: '/api/lessons',
        });
        expect(LESSON_API_CODES).toEqual({
            NETWORK_ERROR: 'LESSON_NETWORK_ERROR',
            INVALID_RESPONSE: 'INVALID_LESSON_RESPONSE',
            REQUEST_FAILED: 'LESSON_REQUEST_FAILED',
        });
        expect(LESSON_API_COURSES).toEqual([
            'APQSA',
            'TECMKT',
            'TECADM',
        ]);
        expect(LESSON_API_TYPES).toEqual([
            'Aula',
            'Atividade',
            'Avaliação',
        ]);
        expect(LESSON_FILTER_FIELDS).toEqual([
            'course',
            'courseId',
            'month',
            'fromDate',
        ]);
        expect(LESSON_DATA_FIELDS).toEqual([
            'date',
            'course',
            'curricularUnit',
            'type',
            'lessonNumber',
            'needsReview',
            'lessonPlanUrl',
            'studentGuideUrl',
        ]);
        expect(LESSON_UPDATE_FIELDS).toBe(LESSON_DATA_FIELDS);
        expect(LESSON_ID_PATTERN.test(
            '64f000000000000000000001',
        )).toBe(true);

        for (const contract of [
            LESSON_API_PATHS,
            LESSON_API_CODES,
            LESSON_API_MESSAGES,
            LESSON_API_COURSES,
            LESSON_API_TYPES,
            LESSON_FILTER_FIELDS,
            LESSON_DATA_FIELDS,
            LESSON_UPDATE_FIELDS,
        ]) {
            expect(Object.isFrozen(contract)).toBe(true);
        }
    });

    test('disponibiliza uma instância padrão imutável', () => {
        expect(lessonApi).toBeInstanceOf(LessonApi);
        expect(Object.isFrozen(lessonApi)).toBe(true);
        expect(typeof lessonApi.listLessons).toBe('function');
        expect(typeof lessonApi.createLesson).toBe('function');
        expect(typeof lessonApi.updateLesson).toBe('function');
        expect(typeof lessonApi.deleteLesson).toBe('function');
    });

    test('rejeita clientes HTTP inválidos', () => {
        for (const fetchClient of [null, 42, 'fetch', {}, []]) {
            expect(
                () => new LessonApi({ fetchClient }),
            ).toThrowError(
                LESSON_API_MESSAGES.INVALID_FETCH_CLIENT,
            );
        }
    });

    test('mantém o contexto quando a consulta é extraída', async () => {
        const fetchClient = vi.fn().mockResolvedValue(
            createJsonResponse(200, createListPayload([])),
        );
        const api = new LessonApi({ fetchClient });
        const listLessons = api.listLessons;

        const lessons = await listLessons();

        expect(lessons).toEqual([]);
        expect(fetchClient).toHaveBeenCalledOnce();
    });

    test('mantém o contexto quando a criação é extraída', async () => {
        const fetchClient = vi.fn().mockResolvedValue(
            createJsonResponse(201, createCreatedPayload()),
        );
        const api = new LessonApi({ fetchClient });
        const createLesson = api.createLesson;

        const lesson = await createLesson(createLessonData());

        expect(lesson.id).toBe('lesson-123');
        expect(fetchClient).toHaveBeenCalledOnce();
    });

    test('mantém o contexto quando a edição é extraída', async () => {
        const lessonId = '64f000000000000000000001';
        const fetchClient = vi.fn().mockResolvedValue(
            createJsonResponse(
                200,
                createCreatedPayload(
                    createPublicLesson({ id: lessonId }),
                ),
            ),
        );
        const api = new LessonApi({ fetchClient });
        const updateLesson = api.updateLesson;

        const lesson = await updateLesson(
            lessonId,
            createLessonData(),
        );

        expect(lesson.id).toBe(lessonId);
        expect(fetchClient).toHaveBeenCalledOnce();
    });

    test('mantém o contexto quando a exclusão é extraída', async () => {
        const lessonId = '64f000000000000000000001';
        const response = createNoContentResponse();
        const fetchClient = vi.fn().mockResolvedValue(response);
        const api = new LessonApi({ fetchClient });
        const deleteLesson = api.deleteLesson;

        await expect(deleteLesson(lessonId)).resolves.toBeUndefined();

        expect(fetchClient).toHaveBeenCalledOnce();
        expect(response.json).not.toHaveBeenCalled();
    });
});

describe('LessonApiError', () => {
    test('mantém metadados estáveis sem incorporar a causa', () => {
        const cause = new Error('Falha técnica controlada.');
        const error = new LessonApiError(
            'Mensagem pública segura.',
            {
                statusCode: 503,
                code: 'SERVICE_UNAVAILABLE',
                cause,
            },
        );

        expect(error).toBeInstanceOf(Error);
        expect(error.name).toBe('LessonApiError');
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
                () => new LessonApiError(message),
            ).toThrowError(
                LESSON_API_MESSAGES.INVALID_ERROR_MESSAGE,
            );
        }
    });

    test('rejeita estados HTTP inválidos', () => {
        for (const statusCode of [-1, 99, 600, 400.5, '400', null]) {
            expect(
                () => new LessonApiError(
                    'Mensagem segura.',
                    { statusCode },
                ),
            ).toThrowError(
                LESSON_API_MESSAGES.INVALID_ERROR_STATUS,
            );
        }
    });

    test('rejeita códigos inválidos', () => {
        for (const code of [null, '', 'erro', 'INVALID-CODE', 42, {}]) {
            expect(
                () => new LessonApiError(
                    'Mensagem segura.',
                    { code },
                ),
            ).toThrowError(
                LESSON_API_MESSAGES.INVALID_ERROR_CODE,
            );
        }
    });
});

describe('preparação dos filtros de aulas', () => {
    test('aceita uma consulta sem filtros', () => {
        const filters = LessonApi.createFilters();

        expect(filters).toEqual({});
        expect(Object.isFrozen(filters)).toBe(true);
    });

    test('normaliza os três filtros em ordem estável', () => {
        const filters = LessonApi.createFilters({
            fromDate: ' 2026-09-15 ',
            month: ' 2026-09 ',
            course: ' APQSA ',
        });

        expect(filters).toEqual({
            course: 'APQSA',
            month: '2026-09',
            fromDate: '2026-09-15',
        });
        expect(Object.isFrozen(filters)).toBe(true);
    });

    test('rejeita estruturas e campos desconhecidos', () => {
        for (const filters of [
            null,
            [],
            'course=APQSA',
            { page: 1 },
            { course: 'APQSA', ignored: true },
        ]) {
            expect(
                () => LessonApi.createFilters(filters),
            ).toThrowError(LESSON_API_MESSAGES.INVALID_FILTERS);
        }
    });

    test('rejeita cursos, meses e datas inválidos', () => {
        for (const filters of [
            { course: undefined },
            { course: 'OUTRO' },
            { month: '0000-01' },
            { month: '2026-13' },
            { fromDate: '2026-02-30' },
            { fromDate: '18/09/2026' },
        ]) {
            expect(
                () => LessonApi.createFilters(filters),
            ).toThrowError(LESSON_API_MESSAGES.INVALID_FILTERS);
        }
    });
});

describe('preparação dos dados de criação', () => {
    test('seleciona, normaliza e protege os oito campos', () => {
        const lessonData = LessonApi.createLessonData({
            date: ' 2026-09-18 ',
            course: ' APQSA ',
            curricularUnit: '  Qualidade de Software  ',
            type: ' Aula ',
            lessonNumber: '  12  ',
            needsReview: true,
            lessonPlanUrl: '  https://example.com/pa  ',
            studentGuideUrl: '   ',
        });

        expect(lessonData).toEqual({
            date: '2026-09-18',
            course: 'APQSA',
            curricularUnit: 'Qualidade de Software',
            type: 'Aula',
            lessonNumber: '12',
            needsReview: true,
            lessonPlanUrl: 'https://example.com/pa',
            studentGuideUrl: null,
        });
        expect(Object.isFrozen(lessonData)).toBe(true);
    });

    test('preserva a ausência dos campos opcionais', () => {
        const lessonData = LessonApi.createLessonData({
            date: '2026-09-18',
            course: 'TECMKT',
            curricularUnit: 'Marketing Digital',
        });

        expect(lessonData).toEqual({
            date: '2026-09-18',
            course: 'TECMKT',
            curricularUnit: 'Marketing Digital',
        });
        expect('type' in lessonData).toBe(false);
    });

    test('rejeita estruturas, campos internos e desconhecidos', () => {
        for (const lessonData of [
            undefined,
            null,
            [],
            'aula',
            createLessonData({ id: 'lesson-123' }),
            createLessonData({ createdAt: 'interno' }),
            createLessonData({ ignored: true }),
        ]) {
            expect(
                () => LessonApi.createLessonData(lessonData),
            ).toThrowError(
                LESSON_API_MESSAGES.INVALID_LESSON_DATA,
            );
        }
    });

    test('rejeita campos obrigatórios inválidos', () => {
        for (const lessonData of [
            {},
            createLessonData({ date: '2026-02-30' }),
            createLessonData({ course: 'OUTRO' }),
            createLessonData({ curricularUnit: '   ' }),
        ]) {
            expect(
                () => LessonApi.createLessonData(lessonData),
            ).toThrowError(
                LESSON_API_MESSAGES.INVALID_LESSON_DATA,
            );
        }
    });

    test('rejeita campos opcionais com tipos inválidos', () => {
        for (const lessonData of [
            createLessonData({ type: 'Outro' }),
            createLessonData({ lessonNumber: 12 }),
            createLessonData({ needsReview: 'false' }),
            createLessonData({ lessonPlanUrl: {} }),
            createLessonData({ studentGuideUrl: [] }),
        ]) {
            expect(
                () => LessonApi.createLessonData(lessonData),
            ).toThrowError(
                LESSON_API_MESSAGES.INVALID_LESSON_DATA,
            );
        }
    });
});

describe('preparação dos dados de edição', () => {
    test('normaliza um identificador MongoDB válido', () => {
        const lessonId = LessonApi.createLessonId(
            ' 64f000000000000000000001 ',
        );

        expect(lessonId).toBe('64f000000000000000000001');
    });

    test('rejeita identificadores inválidos', () => {
        for (const lessonId of [
            undefined,
            null,
            '',
            'lesson-123',
            '64f00000000000000000000g',
            42,
            {},
        ]) {
            expect(
                () => LessonApi.createLessonId(lessonId),
            ).toThrowError(
                LESSON_API_MESSAGES.INVALID_LESSON_ID,
            );
        }
    });

    test('prepara os oito campos completos e imutáveis', () => {
        const lessonData = LessonApi.createLessonUpdateData({
            date: ' 2026-09-25 ',
            course: ' TECMKT ',
            curricularUnit: '  Marketing Digital  ',
            type: ' Atividade ',
            lessonNumber: '   ',
            needsReview: true,
            lessonPlanUrl: null,
            studentGuideUrl:
                '  https://example.com/guia-atualizado  ',
        });

        expect(lessonData).toEqual({
            date: '2026-09-25',
            course: 'TECMKT',
            curricularUnit: 'Marketing Digital',
            type: 'Atividade',
            lessonNumber: null,
            needsReview: true,
            lessonPlanUrl: null,
            studentGuideUrl:
                'https://example.com/guia-atualizado',
        });
        expect(Object.isFrozen(lessonData)).toBe(true);
    });

    test('rejeita estados incompletos ou com campos desconhecidos', () => {
        const completeData = createLessonData();
        const { studentGuideUrl, ...incompleteData } = completeData;

        for (const lessonData of [
            undefined,
            null,
            [],
            incompleteData,
            {
                ...completeData,
                internalNote: 'não autorizado',
            },
        ]) {
            expect(
                () => LessonApi.createLessonUpdateData(lessonData),
            ).toThrowError(
                LESSON_API_MESSAGES.INVALID_LESSON_UPDATE_DATA,
            );
        }

        expect(studentGuideUrl).toBe(
            'https://example.com/gd-ad',
        );
    });

    test('traduz valores inválidos para o contrato da edição', () => {
        for (const lessonData of [
            createLessonData({ date: '2026-02-30' }),
            createLessonData({ course: 'OUTRO' }),
            createLessonData({ type: 'Outro' }),
            createLessonData({ needsReview: 'false' }),
        ]) {
            expect(
                () => LessonApi.createLessonUpdateData(lessonData),
            ).toThrowError(
                LESSON_API_MESSAGES.INVALID_LESSON_UPDATE_DATA,
            );
        }
    });
});

describe('representação pública das aulas', () => {
    test('mantém somente os nove campos públicos', () => {
        const lesson = LessonApi.createPublicLesson(
            createPublicLesson({
                id: '  lesson-123  ',
                curricularUnit: '  Qualidade de Software  ',
            }),
        );

        expect(lesson).toEqual({
            id: 'lesson-123',
            date: '2026-09-18',
            course: 'APQSA',
            curricularUnit: 'Qualidade de Software',
            type: 'Aula',
            lessonNumber: '12',
            needsReview: false,
            lessonPlanUrl: 'https://example.com/pa',
            studentGuideUrl: 'https://example.com/gd-ad',
        });
        expect(Object.isFrozen(lesson)).toBe(true);
        expect('createdAt' in lesson).toBe(false);
        expect('internalNote' in lesson).toBe(false);
    });

    test('aceita campos opcionais representados por null', () => {
        const lesson = LessonApi.createPublicLesson(
            createPublicLesson({
                lessonNumber: null,
                lessonPlanUrl: null,
                studentGuideUrl: null,
            }),
        );

        expect(lesson.lessonNumber).toBeNull();
        expect(lesson.lessonPlanUrl).toBeNull();
        expect(lesson.studentGuideUrl).toBeNull();
    });

    test('rejeita aulas incompletas ou inconsistentes', () => {
        for (const lesson of [
            null,
            {},
            createPublicLesson({ id: '' }),
            createPublicLesson({ date: '2026-02-30' }),
            createPublicLesson({ course: 'OUTRO' }),
            createPublicLesson({ curricularUnit: null }),
            createPublicLesson({ type: 'Outro' }),
            createPublicLesson({ lessonNumber: 12 }),
            createPublicLesson({ needsReview: 'false' }),
            createPublicLesson({ lessonPlanUrl: {} }),
        ]) {
            expect(
                () => LessonApi.createPublicLesson(lesson),
            ).toThrowError(LESSON_API_MESSAGES.INVALID_RESPONSE);
        }
    });

    test('cria uma lista pública imutável e independente', () => {
        const source = [createPublicLesson()];
        const lessons = LessonApi.createPublicLessonList(
            createListPayload(source),
        );

        expect(lessons).toHaveLength(1);
        expect(Object.isFrozen(lessons)).toBe(true);
        expect(Object.isFrozen(lessons[0])).toBe(true);
        expect(lessons[0]).not.toBe(source[0]);
    });

    test('rejeita envelopes e itens inválidos', () => {
        for (const payload of [
            null,
            {},
            { data: {} },
            { data: { lessons: {} } },
            createListPayload([createPublicLesson({ id: '' })]),
        ]) {
            expect(
                () => LessonApi.createPublicLessonList(payload),
            ).toThrowError(LESSON_API_MESSAGES.INVALID_RESPONSE);
        }
    });
});

describe('consulta de aulas', () => {
    test('consulta sem filtros e devolve uma lista pública', async () => {
        const fetchClient = vi.fn().mockResolvedValue(
            createJsonResponse(200, createListPayload()),
        );
        const api = new LessonApi({ fetchClient });

        const lessons = await api.listLessons();

        expect(fetchClient).toHaveBeenCalledWith(
            '/api/lessons',
            {
                method: 'GET',
                headers: {
                    Accept: 'application/json',
                },
                credentials: 'same-origin',
                cache: 'no-store',
            },
        );
        expect(lessons).toHaveLength(1);
        expect(lessons[0].id).toBe('lesson-123');
    });

    test('codifica filtros válidos em ordem determinística', async () => {
        const fetchClient = vi.fn().mockResolvedValue(
            createJsonResponse(200, createListPayload([])),
        );
        const api = new LessonApi({ fetchClient });

        await api.listLessons({
            fromDate: '2026-09-15',
            month: '2026-09',
            course: 'APQSA',
        });

        expect(fetchClient).toHaveBeenCalledWith(
            '/api/lessons?course=APQSA&month=2026-09&fromDate=2026-09-15',
            expect.objectContaining({ method: 'GET' }),
        );
    });

    test('preserva um erro público recusado pelo backend', async () => {
        const fetchClient = vi.fn().mockResolvedValue(
            createJsonResponse(400, {
                error: {
                    code: 'INVALID_LESSON_FILTERS',
                    message: 'Os filtros informados são inválidos.',
                },
            }),
        );
        const api = new LessonApi({ fetchClient });

        await expect(api.listLessons()).rejects.toMatchObject({
            name: 'LessonApiError',
            statusCode: 400,
            code: 'INVALID_LESSON_FILTERS',
            message: 'Os filtros informados são inválidos.',
        });
    });

    test('usa erro genérico para uma recusa malformada', async () => {
        const fetchClient = vi.fn().mockResolvedValue(
            createJsonResponse(500, {
                error: {
                    code: 'codigo-invalido',
                    message: 'Detalhe interno.',
                },
            }),
        );
        const api = new LessonApi({ fetchClient });

        await expect(api.listLessons()).rejects.toMatchObject({
            statusCode: 500,
            code: LESSON_API_CODES.REQUEST_FAILED,
            message: LESSON_API_MESSAGES.REQUEST_FAILED,
        });
    });

    test('converte falha de rede sem expor os filtros', async () => {
        const cause = new Error(
            'Falha simulada contendo APQSA e 2026-09.',
        );
        const fetchClient = vi.fn().mockRejectedValue(cause);
        const api = new LessonApi({ fetchClient });

        const error = await api.listLessons({
            course: 'APQSA',
            month: '2026-09',
        }).catch((receivedError) => receivedError);

        expect(error).toBeInstanceOf(LessonApiError);
        expect(error.statusCode).toBe(0);
        expect(error.code).toBe(LESSON_API_CODES.NETWORK_ERROR);
        expect(error.message).toBe(
            LESSON_API_MESSAGES.NETWORK_ERROR,
        );
        expect(error.message).not.toContain('APQSA');
        expect(error.cause).toBe(cause);
    });

    test('rejeita resposta HTTP e estado de sucesso inconsistentes', async () => {
        const invalidResponseApi = new LessonApi({
            fetchClient: vi.fn().mockResolvedValue({}),
        });
        const wrongStatusApi = new LessonApi({
            fetchClient: vi.fn().mockResolvedValue(
                createJsonResponse(201, createListPayload()),
            ),
        });

        await expect(
            invalidResponseApi.listLessons(),
        ).rejects.toMatchObject({
            statusCode: 0,
            code: LESSON_API_CODES.INVALID_RESPONSE,
        });
        await expect(
            wrongStatusApi.listLessons(),
        ).rejects.toMatchObject({
            statusCode: 201,
            code: LESSON_API_CODES.INVALID_RESPONSE,
        });
    });

    test('rejeita JSON inválido em uma resposta de sucesso', async () => {
        const cause = new SyntaxError('JSON controlado inválido.');
        const response = createJsonResponse(200, null);
        response.json.mockRejectedValue(cause);
        const api = new LessonApi({
            fetchClient: vi.fn().mockResolvedValue(response),
        });

        const error = await api.listLessons()
            .catch((receivedError) => receivedError);

        expect(error).toMatchObject({
            statusCode: 200,
            code: LESSON_API_CODES.INVALID_RESPONSE,
            message: LESSON_API_MESSAGES.INVALID_RESPONSE,
        });
        expect(error.cause).toBe(cause);
    });
});

describe('edição de aulas', () => {
    const lessonId = '64f000000000000000000001';

    test('envia uma substituição completa e devolve a aula pública', async () => {
        const input = createLessonData({
            date: ' 2026-09-25 ',
            course: ' TECMKT ',
            curricularUnit: '  Marketing Digital  ',
            lessonNumber: '   ',
            lessonPlanUrl: null,
        });
        const expectedData = {
            date: '2026-09-25',
            course: 'TECMKT',
            curricularUnit: 'Marketing Digital',
            type: 'Aula',
            lessonNumber: null,
            needsReview: false,
            lessonPlanUrl: null,
            studentGuideUrl: 'https://example.com/gd-ad',
        };
        const fetchClient = vi.fn().mockResolvedValue(
            createJsonResponse(
                200,
                createCreatedPayload(
                    createPublicLesson({
                        id: lessonId,
                        ...expectedData,
                    }),
                ),
            ),
        );
        const api = new LessonApi({ fetchClient });

        const lesson = await api.updateLesson(lessonId, input);

        expect(fetchClient).toHaveBeenCalledWith(
            '/api/lessons/64f000000000000000000001',
            {
                method: 'PUT',
                headers: {
                    Accept: 'application/json',
                    'Content-Type': 'application/json',
                },
                credentials: 'same-origin',
                cache: 'no-store',
                body: JSON.stringify(expectedData),
            },
        );
        expect(lesson).toEqual({
            id: lessonId,
            ...expectedData,
        });
        expect(Object.isFrozen(lesson)).toBe(true);
        expect('internalNote' in lesson).toBe(false);
    });

    test('preserva recusas públicas conhecidas do backend', async () => {
        const scenarios = [
            {
                status: 400,
                code: 'INVALID_LESSON_DATA',
                message: 'Os dados da aula são inválidos.',
            },
            {
                status: 404,
                code: 'LESSON_NOT_FOUND',
                message: 'A aula informada não foi encontrada.',
            },
        ];

        for (const scenario of scenarios) {
            const fetchClient = vi.fn().mockResolvedValue(
                createJsonResponse(scenario.status, {
                    error: {
                        code: scenario.code,
                        message: scenario.message,
                    },
                }),
            );
            const api = new LessonApi({ fetchClient });

            await expect(
                api.updateLesson(lessonId, createLessonData()),
            ).rejects.toMatchObject({
                statusCode: scenario.status,
                code: scenario.code,
                message: scenario.message,
            });
        }
    });

    test('rejeita estado de sucesso diferente de 200', async () => {
        const fetchClient = vi.fn().mockResolvedValue(
            createJsonResponse(201, createCreatedPayload()),
        );
        const api = new LessonApi({ fetchClient });

        await expect(
            api.updateLesson(lessonId, createLessonData()),
        ).rejects.toMatchObject({
            statusCode: 201,
            code: LESSON_API_CODES.INVALID_RESPONSE,
        });
    });

    test('rejeita envelopes de edição inconsistentes', async () => {
        for (const payload of [
            null,
            {},
            { data: {} },
            createCreatedPayload(createPublicLesson({ id: '' })),
        ]) {
            const api = new LessonApi({
                fetchClient: vi.fn().mockResolvedValue(
                    createJsonResponse(200, payload),
                ),
            });

            await expect(
                api.updateLesson(lessonId, createLessonData()),
            ).rejects.toMatchObject({
                code: LESSON_API_CODES.INVALID_RESPONSE,
            });
        }
    });

    test('converte falha de rede sem expor dados da edição', async () => {
        const cause = new Error(
            'Falha com https://example.com/material-confidencial.',
        );
        const fetchClient = vi.fn().mockRejectedValue(cause);
        const api = new LessonApi({ fetchClient });

        const error = await api.updateLesson(
            lessonId,
            createLessonData({
                lessonPlanUrl:
                    'https://example.com/material-confidencial',
            }),
        ).catch((receivedError) => receivedError);

        expect(error).toBeInstanceOf(LessonApiError);
        expect(error.code).toBe(LESSON_API_CODES.NETWORK_ERROR);
        expect(error.message).not.toContain(
            'material-confidencial',
        );
        expect(error.cause).toBe(cause);
    });
});

describe('exclusão de aulas', () => {
    const lessonId = '64f000000000000000000001';

    test('envia DELETE sem corpo e aceita a resposta 204', async () => {
        const response = createNoContentResponse();
        const fetchClient = vi.fn().mockResolvedValue(response);
        const api = new LessonApi({ fetchClient });

        await expect(
            api.deleteLesson(lessonId),
        ).resolves.toBeUndefined();

        expect(fetchClient).toHaveBeenCalledWith(
            '/api/lessons/' + lessonId,
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

    test('rejeita o identificador inválido antes da requisição', async () => {
        const fetchClient = vi.fn();
        const api = new LessonApi({ fetchClient });

        await expect(
            api.deleteLesson('identificador-inválido'),
        ).rejects.toThrowError(
            LESSON_API_MESSAGES.INVALID_LESSON_ID,
        );

        expect(fetchClient).not.toHaveBeenCalled();
    });

    test('preserva uma recusa pública conhecida do backend', async () => {
        const fetchClient = vi.fn().mockResolvedValue(
            createJsonResponse(400, {
                error: {
                    code: 'INVALID_LESSON_ID',
                    message:
                        'O identificador da aula é inválido.',
                },
            }),
        );
        const api = new LessonApi({ fetchClient });

        await expect(
            api.deleteLesson(lessonId),
        ).rejects.toMatchObject({
            statusCode: 400,
            code: 'INVALID_LESSON_ID',
            message: 'O identificador da aula é inválido.',
        });
    });

    test('rejeita estado de sucesso diferente de 204', async () => {
        const response = createJsonResponse(200, {});
        const api = new LessonApi({
            fetchClient: vi.fn().mockResolvedValue(response),
        });

        await expect(
            api.deleteLesson(lessonId),
        ).rejects.toMatchObject({
            statusCode: 200,
            code: LESSON_API_CODES.INVALID_RESPONSE,
        });
        expect(response.json).not.toHaveBeenCalled();
    });

    test('rejeita uma resposta HTTP sem estrutura válida', async () => {
        const api = new LessonApi({
            fetchClient: vi.fn().mockResolvedValue({}),
        });

        await expect(
            api.deleteLesson(lessonId),
        ).rejects.toMatchObject({
            code: LESSON_API_CODES.INVALID_RESPONSE,
            message: LESSON_API_MESSAGES.INVALID_RESPONSE,
        });
    });

    test('converte uma falha de rede em erro público seguro', async () => {
        const cause = new Error(
            'Falha técnica controlada durante a exclusão.',
        );
        const api = new LessonApi({
            fetchClient: vi.fn().mockRejectedValue(cause),
        });

        const error = await api.deleteLesson(lessonId)
            .catch((receivedError) => receivedError);

        expect(error).toBeInstanceOf(LessonApiError);
        expect(error).toMatchObject({
            code: LESSON_API_CODES.NETWORK_ERROR,
            message: LESSON_API_MESSAGES.NETWORK_ERROR,
        });
        expect(error.message).not.toContain(lessonId);
        expect(error.cause).toBe(cause);
    });
});

describe('criação de aulas', () => {
    test('envia somente dados autorizados e devolve a aula pública', async () => {
        const fetchClient = vi.fn().mockResolvedValue(
            createJsonResponse(201, createCreatedPayload()),
        );
        const api = new LessonApi({ fetchClient });
        const input = createLessonData();

        const lesson = await api.createLesson(input);

        expect(fetchClient).toHaveBeenCalledWith(
            '/api/lessons',
            {
                method: 'POST',
                headers: {
                    Accept: 'application/json',
                    'Content-Type': 'application/json',
                },
                credentials: 'same-origin',
                cache: 'no-store',
                body: JSON.stringify(input),
            },
        );
        expect(lesson.id).toBe('lesson-123');
        expect(Object.isFrozen(lesson)).toBe(true);
        expect('createdAt' in lesson).toBe(false);
    });

    test('preserva uma validação pública recusada pelo backend', async () => {
        const fetchClient = vi.fn().mockResolvedValue(
            createJsonResponse(400, {
                error: {
                    code: 'INVALID_LESSON_DATA',
                    message: 'Os dados da aula são inválidos.',
                },
            }),
        );
        const api = new LessonApi({ fetchClient });

        await expect(
            api.createLesson(createLessonData()),
        ).rejects.toMatchObject({
            statusCode: 400,
            code: 'INVALID_LESSON_DATA',
            message: 'Os dados da aula são inválidos.',
        });
    });

    test('rejeita estado de sucesso diferente de 201', async () => {
        const fetchClient = vi.fn().mockResolvedValue(
            createJsonResponse(200, createCreatedPayload()),
        );
        const api = new LessonApi({ fetchClient });

        await expect(
            api.createLesson(createLessonData()),
        ).rejects.toMatchObject({
            statusCode: 200,
            code: LESSON_API_CODES.INVALID_RESPONSE,
        });
    });

    test('rejeita envelopes de criação inconsistentes', async () => {
        for (const payload of [
            null,
            {},
            { data: {} },
            createCreatedPayload(createPublicLesson({ id: '' })),
        ]) {
            const api = new LessonApi({
                fetchClient: vi.fn().mockResolvedValue(
                    createJsonResponse(201, payload),
                ),
            });

            await expect(
                api.createLesson(createLessonData()),
            ).rejects.toMatchObject({
                code: LESSON_API_CODES.INVALID_RESPONSE,
            });
        }
    });

    test('converte falha de rede sem expor dados da aula', async () => {
        const cause = new Error(
            'Falha com https://example.com/material-confidencial.',
        );
        const api = new LessonApi({
            fetchClient: vi.fn().mockRejectedValue(cause),
        });

        const error = await api.createLesson(createLessonData({
            lessonPlanUrl:
                'https://example.com/material-confidencial',
        })).catch((receivedError) => receivedError);

        expect(error).toBeInstanceOf(LessonApiError);
        expect(error.code).toBe(LESSON_API_CODES.NETWORK_ERROR);
        expect(error.message).not.toContain('material-confidencial');
        expect(error.cause).toBe(cause);
    });
});


describe('identidade dos cursos personalizados na LessonApi', () => {
    const courseId = '507f1f77bcf86cd7994390ab';
    const otherCourseId = '507f1f77bcf86cd7994390ac';
    const lessonId = '507f1f77bcf86cd799439011';

    function linkedLesson(overrides = {}) {
        return createPublicLesson({ id: lessonId, courseId, course: 'CD', ...overrides });
    }
    function linkedData(overrides = {}) {
        const { course: _legacy, ...data } = createLessonData();
        return { ...data, courseId, ...overrides };
    }

    test('normaliza a identidade enviada sem aceitar sigla ou campos adicionais', () => {
        const input = linkedData({ courseId: courseId.toUpperCase() });
        expect(LessonApi.createLessonData(input)).toEqual(linkedData());
        expect(input.courseId).toBe(courseId.toUpperCase());
        expect(Object.isFrozen(LessonApi.createLessonData(input))).toBe(true);
        for (const extra of [
            { course: 'CD' }, { active: true }, { previousCourseId: courseId },
            { [Symbol('extra')]: true },
        ]) {
            expect(() => LessonApi.createLessonData({ ...input, ...extra }))
                .toThrowError(LESSON_API_MESSAGES.INVALID_LESSON_DATA);
        }
    });

    test('recusa identidades inválidas antes da rede na criação e na edição', async () => {
        const fetchClient = vi.fn();
        const api = new LessonApi({ fetchClient });
        for (const value of [undefined, null, '', 'CD', {}, [], 42, ` ${courseId}`, 'z'.repeat(24)]) {
            await expect(api.createLesson(linkedData({ courseId: value }))).rejects.toBeInstanceOf(TypeError);
            await expect(api.updateLesson(lessonId, linkedData({ courseId: value })))
                .rejects.toBeInstanceOf(TypeError);
        }
        expect(fetchClient).not.toHaveBeenCalled();
    });

    test('edição exige todos os campos do contrato por identidade', () => {
        const data = linkedData();
        for (const field of Object.keys(data)) {
            const incomplete = { ...data };
            delete incomplete[field];
            expect(() => LessonApi.createLessonUpdateData(incomplete))
                .toThrowError(LESSON_API_MESSAGES.INVALID_LESSON_UPDATE_DATA);
        }
        expect(LessonApi.createLessonUpdateData(data)).toEqual(data);
    });

    test('consulta por courseId produz URL determinística sem enviar sigla', async () => {
        const fetchClient = vi.fn().mockResolvedValue(createJsonResponse(200, createListPayload([])));
        await new LessonApi({ fetchClient }).listLessons({
            fromDate: '2026-10-25', month: '2026-10', courseId: courseId.toUpperCase(),
        });
        expect(fetchClient).toHaveBeenCalledWith(
            `/api/lessons?courseId=${courseId}&month=2026-10&fromDate=2026-10-25`,
            expect.objectContaining({ method: 'GET', credentials: 'same-origin' }),
        );
    });

    test('recusa filtros ambíguos, operadores e identidades malformadas antes da rede', async () => {
        const fetchClient = vi.fn();
        const api = new LessonApi({ fetchClient });
        for (const filters of [
            { courseId, course: 'APQSA' }, { courseId: { $ne: null } },
            { courseId: undefined }, { courseId: 'CD' }, { courseId: ` ${courseId}` },
            { courseId, [Symbol('extra')]: true },
        ]) {
            await expect(api.listLessons(filters)).rejects.toBeInstanceOf(TypeError);
        }
        expect(fetchClient).not.toHaveBeenCalled();
    });

    test('seleciona a identidade e aceita siglas personalizadas normalizadas', () => {
        for (const code of ['CD', 'DADOS + IA', 'TÉC. REDES', 'CURSO/2026']) {
            const result = LessonApi.createPublicLesson(linkedLesson({ course: code }));
            expect(result.courseId).toBe(courseId);
            expect(result.course).toBe(code);
            expect(Object.isFrozen(result)).toBe(true);
            expect('internalNote' in result).toBe(false);
        }
        const upper = LessonApi.createPublicLesson(linkedLesson({ courseId: courseId.toUpperCase() }));
        expect(upper.courseId).toBe(courseId);
    });

    test('não aceita sigla personalizada sem identidade nem identidade presente mas inválida', () => {
        const invalidLessons = [createPublicLesson({ course: 'CD' })];
        for (const value of [undefined, null, '', 'CD', {}, [], ` ${courseId}`]) {
            invalidLessons.push(linkedLesson({ courseId: value }));
        }
        for (const lesson of invalidLessons) {
            expect(() => LessonApi.createPublicLesson(lesson)).toThrowError(LessonApiError);
        }
    });

    test('recusa siglas inconsistentes e identificadores inválidos nas respostas vinculadas', () => {
        for (const course of ['', 'cd', ' CD ', 'DADOS  IA', 'A'.repeat(21)]) {
            expect(() => LessonApi.createPublicLesson(linkedLesson({ course })))
                .toThrowError(LESSON_API_MESSAGES.INVALID_RESPONSE);
        }
        expect(() => LessonApi.createPublicLesson(linkedLesson({ id: 'aula-inválida' })))
            .toThrowError(LESSON_API_MESSAGES.INVALID_RESPONSE);
    });

    test('lista mista preserva vínculos novos e não inventa identidades legadas', async () => {
        const fetchClient = vi.fn().mockResolvedValue(createJsonResponse(200,
            createListPayload([createPublicLesson(), linkedLesson()])));
        const result = await new LessonApi({ fetchClient }).listLessons();
        expect(Object.hasOwn(result[0], 'courseId')).toBe(false);
        expect(result[1].courseId).toBe(courseId);
        expect(Object.isFrozen(result)).toBe(true);
    });

    for (const method of ['createLesson', 'updateLesson']) {
        test(`${method}: envia somente o contrato por ID e confirma o vínculo solicitado`, async () => {
            const status = method === 'createLesson' ? 201 : 200;
            const fetchClient = vi.fn().mockResolvedValue(createJsonResponse(status,
                createCreatedPayload(linkedLesson())));
            const api = new LessonApi({ fetchClient });
            const result = method === 'createLesson' ? await api[method](linkedData())
                : await api[method](lessonId, linkedData());
            expect(JSON.parse(fetchClient.mock.calls[0][1].body)).toEqual(linkedData());
            expect(result.courseId).toBe(courseId);
            expect(fetchClient).toHaveBeenCalledOnce();
        });

        test(`${method}: não confirma sucesso quando o vínculo devolvido é outro ou está ausente`, async () => {
            const status = method === 'createLesson' ? 201 : 200;
            for (const lesson of [linkedLesson({ courseId: otherCourseId }), createPublicLesson()]) {
                const fetchClient = vi.fn().mockResolvedValue(createJsonResponse(status,
                    createCreatedPayload(lesson)));
                const api = new LessonApi({ fetchClient });
                const pending = method === 'createLesson' ? api[method](linkedData())
                    : api[method](lessonId, linkedData());
                await expect(pending).rejects.toMatchObject({ code: LESSON_API_CODES.INVALID_RESPONSE });
                expect(fetchClient).toHaveBeenCalledOnce();
            }
        });
    }

    test('edição não confirma outra aula mesmo que o curso seja o solicitado', async () => {
        const fetchClient = vi.fn().mockResolvedValue(createJsonResponse(200,
            createCreatedPayload(linkedLesson({ id: '507f1f77bcf86cd799439012' }))));
        await expect(new LessonApi({ fetchClient }).updateLesson(lessonId, linkedData()))
            .rejects.toMatchObject({ code: LESSON_API_CODES.INVALID_RESPONSE });
    });

    test('renomeação da sigla mantém a identidade recebida em uma nova consulta', async () => {
        const fetchClient = vi.fn()
            .mockResolvedValueOnce(createJsonResponse(200, createListPayload([linkedLesson()])))
            .mockResolvedValueOnce(createJsonResponse(200, createListPayload([linkedLesson({ course: 'AD' })])));
        const api = new LessonApi({ fetchClient });
        const first = await api.listLessons();
        const second = await api.listLessons();
        expect(first[0].course).toBe('CD');
        expect(second[0].course).toBe('AD');
        expect(second[0].courseId).toBe(first[0].courseId);
        expect(fetchClient).toHaveBeenCalledTimes(2);
    });

    test('novas recusas conhecidas usam mensagens locais sem expor detalhes do servidor', async () => {
        for (const [status, code, message] of [
            [400, 'INVALID_LESSON_COURSE_ID', LESSON_API_MESSAGES.INVALID_COURSE_ID],
            [404, 'LESSON_COURSE_NOT_FOUND', LESSON_API_MESSAGES.COURSE_NOT_FOUND],
            [409, 'LESSON_COURSE_INACTIVE', LESSON_API_MESSAGES.COURSE_INACTIVE],
            [409, 'LESSON_CHANGED', LESSON_API_MESSAGES.LESSON_CHANGED],
        ]) {
            const fetchClient = vi.fn().mockResolvedValue(createJsonResponse(status, {
                error: { code, message: 'detalhe privado recebido do servidor' },
            }));
            await expect(new LessonApi({ fetchClient }).updateLesson(lessonId, linkedData()))
                .rejects.toMatchObject({ code, statusCode: status, message });
            expect(fetchClient).toHaveBeenCalledOnce();
        }
    });

    test('código novo em operação ou estado incompatível produz erro genérico', async () => {
        const response = { error: { code: 'LESSON_COURSE_INACTIVE', message: 'detalhe privado' } };
        for (const status of [400, 409, 500]) {
            const fetchClient = vi.fn().mockResolvedValue(createJsonResponse(status, response));
            await expect(new LessonApi({ fetchClient }).listLessons())
                .rejects.toMatchObject({ code: LESSON_API_CODES.REQUEST_FAILED,
                    message: LESSON_API_MESSAGES.REQUEST_FAILED });
        }
        const api = new LessonApi({ fetchClient: vi.fn().mockResolvedValue(createJsonResponse(500, response)) });
        await expect(api.updateLesson(lessonId, linkedData()))
            .rejects.toMatchObject({ code: LESSON_API_CODES.REQUEST_FAILED });
    });
});
