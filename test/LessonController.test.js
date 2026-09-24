'use strict';

const assert = require('node:assert/strict');
const {
    describe,
    test,
} = require('node:test');

const { AppError } = require('../src/errors/AppError');
const {
    LESSON_CONTROLLER_CODES,
    LESSON_CONTROLLER_ERRORS,
    LessonController,
} = require('../src/controllers/LessonController');

/**
 * Cria uma aula pública semelhante à devolvida pelo LessonService.
 *
 * Campos adicionais permitem comprovar que o controlador realiza sua própria
 * seleção defensiva antes de construir a resposta HTTP.
 *
 * @param {object} overrides Campos que serão substituídos.
 * @returns {object} Aula controlada para os testes.
 */
function createLesson(overrides = {}) {
    return {
        id: 'aula-123',
        date: '2026-09-15',
        course: 'APQSA',
        curricularUnit: 'UC 1',
        type: 'Aula',
        lessonNumber: '12',
        needsReview: true,
        lessonPlanUrl: 'https://example.com/plano-aula',
        studentGuideUrl: 'https://example.com/guia-discente',
        _id: 'identificador-interno',
        createdAt: new Date('2026-09-15T12:00:00.000Z'),
        internalValue: 'não deve aparecer na resposta',
        ...overrides,
    };
}

/**
 * Cria um serviço de aulas controlado.
 *
 * @param {object} options Comportamento das operações.
 * @param {object} options.createdLesson Aula devolvida pela criação.
 * @param {object|null} options.updatedLesson Resultado da edição.
 * @param {Array|unknown} options.lessons Resultado devolvido pela consulta.
 * @param {Error|null} options.createError Falha opcional da criação.
 * @param {Error|null} options.updateError Falha opcional da edição.
 * @param {Error|null} options.listError Falha opcional da consulta.
 * @returns {{ lessonService: object, calls: object }} Serviço e chamadas.
 */
function createFakeLessonService({
    createdLesson = createLesson(),
    updatedLesson = createLesson(),
    lessons = [createLesson()],
    createError = null,
    updateError = null,
    listError = null,
} = {}) {
    const calls = {
        createLesson: [],
        updateLesson: [],
        listLessons: [],
    };

    const lessonService = {
        async createLesson(lessonData) {
            calls.createLesson.push(lessonData);

            if (createError) {
                throw createError;
            }

            return createdLesson;
        },

        async updateLesson(lessonId, lessonData) {
            calls.updateLesson.push({
                lessonId,
                lessonData,
            });

            if (updateError) {
                throw updateError;
            }

            return updatedLesson;
        },

        async listLessons(filters) {
            calls.listLessons.push(filters);

            if (listError) {
                throw listError;
            }

            return lessons;
        },
    };

    return {
        lessonService,
        calls,
    };
}

/**
 * Cria uma resposta Express mínima e registra sua utilização.
 *
 * @param {object} options Falhas opcionais da resposta.
 * @param {Error|null} options.statusError Falha produzida por status().
 * @param {Error|null} options.jsonError Falha produzida por json().
 * @returns {{ response: object, calls: object }} Resposta e chamadas.
 */
function createFakeResponse({
    statusError = null,
    jsonError = null,
} = {}) {
    const calls = {
        status: [],
        json: [],
    };

    const response = {
        status(statusCode) {
            calls.status.push(statusCode);

            if (statusError) {
                throw statusError;
            }

            return response;
        },

        json(payload) {
            calls.json.push(payload);

            if (jsonError) {
                throw jsonError;
            }

            return response;
        },
    };

    return {
        response,
        calls,
    };
}

/**
 * Cria uma função next controlada.
 *
 * @returns {{ next: Function, calls: Array }} Função e erros recebidos.
 */
function createNextRecorder() {
    const calls = [];

    return {
        next(error) {
            calls.push(error);
        },
        calls,
    };
}

/**
 * Representação exata autorizada nas respostas HTTP.
 *
 * @param {object} overrides Campos públicos que serão substituídos.
 * @returns {object} Aula esperada na resposta.
 */
function createExpectedPublicLesson(overrides = {}) {
    return {
        id: 'aula-123',
        date: '2026-09-15',
        course: 'APQSA',
        curricularUnit: 'UC 1',
        type: 'Aula',
        lessonNumber: '12',
        needsReview: true,
        lessonPlanUrl: 'https://example.com/plano-aula',
        studentGuideUrl: 'https://example.com/guia-discente',
        ...overrides,
    };
}

describe('configuração do LessonController', () => {
    test('expõe códigos e mensagens estáveis e protegidos', () => {
        assert.deepEqual(LESSON_CONTROLLER_CODES, {
            LESSON_NOT_FOUND: 'LESSON_NOT_FOUND',
        });
        assert.deepEqual(LESSON_CONTROLLER_ERRORS, {
            INVALID_LESSON_SERVICE:
                'O controlador exige um serviço de aulas válido.',
            INVALID_LESSON_RESPONSE:
                'O serviço de aulas retornou uma aula inválida.',
            INVALID_LESSON_LIST_RESPONSE:
                'O serviço de aulas retornou uma lista inválida.',
            LESSON_NOT_FOUND:
                'A aula informada não foi encontrada.',
        });
        assert.equal(
            Object.isFrozen(LESSON_CONTROLLER_CODES),
            true,
        );
        assert.equal(
            Object.isFrozen(LESSON_CONTROLLER_ERRORS),
            true,
        );
    });

    test('cria handlers vinculados e uma instância imutável', () => {
        const { lessonService } = createFakeLessonService();
        const controller = new LessonController({ lessonService });

        assert.equal(typeof controller.create, 'function');
        assert.equal(typeof controller.update, 'function');
        assert.equal(typeof controller.list, 'function');
        assert.equal(Object.isFrozen(controller), true);
    });

    test('rejeita serviços de aulas inválidos', () => {
        const invalidServices = [
            undefined,
            null,
            false,
            'serviço',
            42,
            [],
            {},
            { createLesson: 'não é função', listLessons() {} },
            { createLesson() {} },
            { createLesson() {}, listLessons: 'não é função' },
            { createLesson() {}, listLessons() {} },
            {
                createLesson() {},
                updateLesson: 'não é função',
                listLessons() {},
            },
        ];

        for (const lessonService of invalidServices) {
            assert.throws(
                () => new LessonController({ lessonService }),
                {
                    name: 'TypeError',
                    message:
                        LESSON_CONTROLLER_ERRORS
                            .INVALID_LESSON_SERVICE,
                },
            );
        }
    });
});

describe('representação pública de uma aula', () => {
    test('mantém somente o identificador e os oito campos funcionais', () => {
        const receivedLesson = createLesson();

        const publicLesson =
            LessonController.createPublicLesson(receivedLesson);

        assert.deepEqual(
            publicLesson,
            createExpectedPublicLesson(),
        );
        assert.equal(Object.isFrozen(publicLesson), true);
        assert.notStrictEqual(publicLesson, receivedLesson);
        assert.equal(Object.hasOwn(publicLesson, '_id'), false);
        assert.equal(Object.hasOwn(publicLesson, 'createdAt'), false);
        assert.equal(
            Object.hasOwn(publicLesson, 'internalValue'),
            false,
        );
    });

    test('aceita os campos opcionais representados por null', () => {
        const publicLesson = LessonController.createPublicLesson(
            createLesson({
                lessonNumber: null,
                needsReview: false,
                lessonPlanUrl: null,
                studentGuideUrl: null,
            }),
        );

        assert.deepEqual(
            publicLesson,
            createExpectedPublicLesson({
                lessonNumber: null,
                needsReview: false,
                lessonPlanUrl: null,
                studentGuideUrl: null,
            }),
        );
    });

    test('rejeita aulas incompletas ou estruturalmente inválidas', () => {
        const invalidLessons = [
            undefined,
            null,
            [],
            {},
            createLesson({ id: '   ' }),
            createLesson({ date: '   ' }),
            createLesson({ course: '   ' }),
            createLesson({ curricularUnit: '   ' }),
            createLesson({ type: '   ' }),
            createLesson({ lessonNumber: 12 }),
            createLesson({ needsReview: 'true' }),
            createLesson({ lessonPlanUrl: false }),
            createLesson({ studentGuideUrl: {} }),
        ];

        for (const lesson of invalidLessons) {
            assert.throws(
                () => LessonController.createPublicLesson(lesson),
                {
                    name: 'TypeError',
                    message:
                        LESSON_CONTROLLER_ERRORS
                            .INVALID_LESSON_RESPONSE,
                },
            );
        }
    });
});

describe('representação pública da lista', () => {
    test('cria uma lista imutável com itens selecionados', () => {
        const receivedLessons = [
            createLesson({ id: 'aula-1' }),
            createLesson({
                id: 'aula-2',
                course: 'TECMKT',
            }),
        ];

        const publicLessons =
            LessonController.createPublicLessonList(
                receivedLessons,
            );

        assert.deepEqual(publicLessons, [
            createExpectedPublicLesson({ id: 'aula-1' }),
            createExpectedPublicLesson({
                id: 'aula-2',
                course: 'TECMKT',
            }),
        ]);
        assert.equal(Object.isFrozen(publicLessons), true);
        assert.equal(Object.isFrozen(publicLessons[0]), true);
        assert.notStrictEqual(publicLessons, receivedLessons);
        assert.notStrictEqual(
            publicLessons[0],
            receivedLessons[0],
        );
    });

    test('aceita uma lista vazia', () => {
        const publicLessons =
            LessonController.createPublicLessonList([]);

        assert.deepEqual(publicLessons, []);
        assert.equal(Object.isFrozen(publicLessons), true);
    });

    test('rejeita resultados que não sejam listas', () => {
        const invalidResults = [
            undefined,
            null,
            {},
            'aulas',
            42,
        ];

        for (const lessons of invalidResults) {
            assert.throws(
                () => LessonController
                    .createPublicLessonList(lessons),
                {
                    name: 'TypeError',
                    message:
                        LESSON_CONTROLLER_ERRORS
                            .INVALID_LESSON_LIST_RESPONSE,
                },
            );
        }
    });

    test('traduz um item inconsistente como lista inválida', () => {
        assert.throws(
            () => LessonController.createPublicLessonList([
                createLesson(),
                createLesson({ needsReview: undefined }),
            ]),
            {
                name: 'TypeError',
                message:
                    LESSON_CONTROLLER_ERRORS
                        .INVALID_LESSON_LIST_RESPONSE,
            },
        );
    });
});

describe('criação de uma aula pelo controlador', () => {
    test('encaminha o corpo e responde 201 com a aula pública', async () => {
        const receivedBody = {
            date: '2026-09-15',
            course: 'APQSA',
            curricularUnit: 'UC 1',
        };
        const {
            lessonService,
            calls: serviceCalls,
        } = createFakeLessonService();
        const {
            response,
            calls: responseCalls,
        } = createFakeResponse();
        const { next, calls: nextCalls } = createNextRecorder();
        const controller = new LessonController({ lessonService });

        await controller.create(
            { body: receivedBody },
            response,
            next,
        );

        assert.deepEqual(serviceCalls.createLesson, [
            receivedBody,
        ]);
        assert.strictEqual(
            serviceCalls.createLesson[0],
            receivedBody,
        );
        assert.deepEqual(responseCalls.status, [201]);
        assert.deepEqual(responseCalls.json, [
            {
                data: {
                    lesson: createExpectedPublicLesson(),
                },
            },
        ]);
        assert.equal(
            Object.isFrozen(
                responseCalls.json[0].data.lesson,
            ),
            true,
        );
        assert.deepEqual(nextCalls, []);
    });

    test('mantém o contexto quando o handler é extraído', async () => {
        const {
            lessonService,
            calls: serviceCalls,
        } = createFakeLessonService();
        const { response, calls: responseCalls } =
            createFakeResponse();
        const { next, calls: nextCalls } = createNextRecorder();
        const controller = new LessonController({ lessonService });
        const create = controller.create;

        await create(
            { body: { course: 'TECADM' } },
            response,
            next,
        );

        assert.deepEqual(serviceCalls.createLesson, [
            { course: 'TECADM' },
        ]);
        assert.deepEqual(responseCalls.status, [201]);
        assert.deepEqual(nextCalls, []);
    });

    test('encaminha uma falha do serviço sem iniciar a resposta', async () => {
        const expectedError = new Error(
            'Falha controlada na criação.',
        );
        const { lessonService } = createFakeLessonService({
            createError: expectedError,
        });
        const { response, calls: responseCalls } =
            createFakeResponse();
        const { next, calls: nextCalls } = createNextRecorder();
        const controller = new LessonController({ lessonService });

        await controller.create(
            { body: {} },
            response,
            next,
        );

        assert.deepEqual(responseCalls.status, []);
        assert.deepEqual(responseCalls.json, []);
        assert.equal(nextCalls.length, 1);
        assert.strictEqual(nextCalls[0], expectedError);
    });

    test('encaminha uma aula inválida sem enviá-la ao cliente', async () => {
        const { lessonService } = createFakeLessonService({
            createdLesson: createLesson({
                lessonPlanUrl: undefined,
            }),
        });
        const { response, calls: responseCalls } =
            createFakeResponse();
        const { next, calls: nextCalls } = createNextRecorder();
        const controller = new LessonController({ lessonService });

        await controller.create(
            { body: {} },
            response,
            next,
        );

        assert.deepEqual(responseCalls.status, []);
        assert.deepEqual(responseCalls.json, []);
        assert.equal(nextCalls.length, 1);
        assert.equal(nextCalls[0] instanceof TypeError, true);
        assert.equal(
            nextCalls[0].message,
            LESSON_CONTROLLER_ERRORS.INVALID_LESSON_RESPONSE,
        );
    });

    test('encaminha uma falha produzida pela resposta HTTP', async () => {
        const expectedError = new Error(
            'Falha controlada ao serializar a resposta.',
        );
        const { lessonService } = createFakeLessonService();
        const { response, calls: responseCalls } =
            createFakeResponse({ jsonError: expectedError });
        const { next, calls: nextCalls } = createNextRecorder();
        const controller = new LessonController({ lessonService });

        await controller.create(
            { body: {} },
            response,
            next,
        );

        assert.deepEqual(responseCalls.status, [201]);
        assert.equal(responseCalls.json.length, 1);
        assert.equal(nextCalls.length, 1);
        assert.strictEqual(nextCalls[0], expectedError);
    });
});

describe('edição de uma aula pelo controlador', () => {
    test('encaminha identificador e corpo e responde 200', async () => {
        const lessonId = '507f1f77bcf86cd799439011';
        const receivedBody = {
            date: '2026-09-24',
            course: 'TECADM',
            curricularUnit: 'UC atualizada',
        };
        const updatedLesson = createLesson({
            id: lessonId,
            ...receivedBody,
        });
        const {
            lessonService,
            calls: serviceCalls,
        } = createFakeLessonService({ updatedLesson });
        const {
            response,
            calls: responseCalls,
        } = createFakeResponse();
        const { next, calls: nextCalls } = createNextRecorder();
        const controller = new LessonController({ lessonService });

        await controller.update(
            {
                params: { id: lessonId },
                body: receivedBody,
            },
            response,
            next,
        );

        assert.deepEqual(serviceCalls.updateLesson, [
            {
                lessonId,
                lessonData: receivedBody,
            },
        ]);
        assert.strictEqual(
            serviceCalls.updateLesson[0].lessonData,
            receivedBody,
        );
        assert.deepEqual(responseCalls.status, [200]);
        assert.deepEqual(responseCalls.json, [
            {
                data: {
                    lesson: createExpectedPublicLesson({
                        id: lessonId,
                        ...receivedBody,
                    }),
                },
            },
        ]);
        assert.equal(
            Object.isFrozen(
                responseCalls.json[0].data.lesson,
            ),
            true,
        );
        assert.deepEqual(nextCalls, []);
    });

    test('mantém o contexto quando o handler é extraído', async () => {
        const {
            lessonService,
            calls: serviceCalls,
        } = createFakeLessonService();
        const { response, calls: responseCalls } =
            createFakeResponse();
        const { next, calls: nextCalls } = createNextRecorder();
        const controller = new LessonController({ lessonService });
        const update = controller.update;

        await update(
            {
                params: { id: 'aula-extraída' },
                body: { course: 'TECMKT' },
            },
            response,
            next,
        );

        assert.deepEqual(serviceCalls.updateLesson, [
            {
                lessonId: 'aula-extraída',
                lessonData: { course: 'TECMKT' },
            },
        ]);
        assert.deepEqual(responseCalls.status, [200]);
        assert.deepEqual(nextCalls, []);
    });

    test('encaminha um erro 404 quando a aula não existe', async () => {
        const { lessonService } = createFakeLessonService({
            updatedLesson: null,
        });
        const { response, calls: responseCalls } =
            createFakeResponse();
        const { next, calls: nextCalls } = createNextRecorder();
        const controller = new LessonController({ lessonService });

        await controller.update(
            {
                params: { id: 'aula-ausente' },
                body: {},
            },
            response,
            next,
        );

        assert.deepEqual(responseCalls.status, []);
        assert.deepEqual(responseCalls.json, []);
        assert.equal(nextCalls.length, 1);
        assert.equal(nextCalls[0] instanceof AppError, true);
        assert.equal(nextCalls[0].statusCode, 404);
        assert.equal(
            nextCalls[0].code,
            LESSON_CONTROLLER_CODES.LESSON_NOT_FOUND,
        );
        assert.equal(
            nextCalls[0].message,
            LESSON_CONTROLLER_ERRORS.LESSON_NOT_FOUND,
        );
        assert.equal(nextCalls[0].isOperational, true);
    });

    test('encaminha falha do serviço sem responder', async () => {
        const expectedError = new Error(
            'Falha controlada na edição.',
        );
        const { lessonService } = createFakeLessonService({
            updateError: expectedError,
        });
        const { response, calls: responseCalls } =
            createFakeResponse();
        const { next, calls: nextCalls } = createNextRecorder();
        const controller = new LessonController({ lessonService });

        await controller.update(
            { params: { id: 'aula-123' }, body: {} },
            response,
            next,
        );

        assert.deepEqual(responseCalls.status, []);
        assert.deepEqual(responseCalls.json, []);
        assert.equal(nextCalls.length, 1);
        assert.strictEqual(nextCalls[0], expectedError);
    });

    test('encaminha uma aula inválida sem enviá-la', async () => {
        const { lessonService } = createFakeLessonService({
            updatedLesson: createLesson({
                studentGuideUrl: undefined,
            }),
        });
        const { response, calls: responseCalls } =
            createFakeResponse();
        const { next, calls: nextCalls } = createNextRecorder();
        const controller = new LessonController({ lessonService });

        await controller.update(
            { params: { id: 'aula-123' }, body: {} },
            response,
            next,
        );

        assert.deepEqual(responseCalls.status, []);
        assert.deepEqual(responseCalls.json, []);
        assert.equal(nextCalls.length, 1);
        assert.equal(nextCalls[0] instanceof TypeError, true);
        assert.equal(
            nextCalls[0].message,
            LESSON_CONTROLLER_ERRORS.INVALID_LESSON_RESPONSE,
        );
    });

    test('encaminha uma falha produzida pela resposta HTTP', async () => {
        const expectedError = new Error(
            'Falha controlada ao serializar a edição.',
        );
        const { lessonService } = createFakeLessonService();
        const { response, calls: responseCalls } =
            createFakeResponse({ jsonError: expectedError });
        const { next, calls: nextCalls } = createNextRecorder();
        const controller = new LessonController({ lessonService });

        await controller.update(
            { params: { id: 'aula-123' }, body: {} },
            response,
            next,
        );

        assert.deepEqual(responseCalls.status, [200]);
        assert.equal(responseCalls.json.length, 1);
        assert.equal(nextCalls.length, 1);
        assert.strictEqual(nextCalls[0], expectedError);
    });
});

describe('consulta de aulas pelo controlador', () => {
    test('encaminha a query e responde 200 com a lista pública', async () => {
        const receivedQuery = {
            course: 'APQSA',
            month: '2026-09',
            fromDate: '2026-09-15',
        };
        const serviceLessons = [
            createLesson({ id: 'aula-1' }),
            createLesson({ id: 'aula-2' }),
        ];
        const {
            lessonService,
            calls: serviceCalls,
        } = createFakeLessonService({
            lessons: serviceLessons,
        });
        const {
            response,
            calls: responseCalls,
        } = createFakeResponse();
        const { next, calls: nextCalls } = createNextRecorder();
        const controller = new LessonController({ lessonService });

        await controller.list(
            { query: receivedQuery },
            response,
            next,
        );

        assert.deepEqual(serviceCalls.listLessons, [
            receivedQuery,
        ]);
        assert.strictEqual(
            serviceCalls.listLessons[0],
            receivedQuery,
        );
        assert.deepEqual(responseCalls.status, [200]);
        assert.deepEqual(responseCalls.json, [
            {
                data: {
                    lessons: [
                        createExpectedPublicLesson({
                            id: 'aula-1',
                        }),
                        createExpectedPublicLesson({
                            id: 'aula-2',
                        }),
                    ],
                },
            },
        ]);
        assert.equal(
            Object.isFrozen(
                responseCalls.json[0].data.lessons,
            ),
            true,
        );
        assert.deepEqual(nextCalls, []);
    });

    test('responde normalmente quando nenhuma aula é encontrada', async () => {
        const { lessonService } = createFakeLessonService({
            lessons: [],
        });
        const { response, calls: responseCalls } =
            createFakeResponse();
        const { next, calls: nextCalls } = createNextRecorder();
        const controller = new LessonController({ lessonService });

        await controller.list(
            { query: {} },
            response,
            next,
        );

        assert.deepEqual(responseCalls.status, [200]);
        assert.deepEqual(responseCalls.json, [
            {
                data: {
                    lessons: [],
                },
            },
        ]);
        assert.deepEqual(nextCalls, []);
    });

    test('mantém o contexto quando o handler é extraído', async () => {
        const {
            lessonService,
            calls: serviceCalls,
        } = createFakeLessonService({ lessons: [] });
        const { response, calls: responseCalls } =
            createFakeResponse();
        const { next, calls: nextCalls } = createNextRecorder();
        const controller = new LessonController({ lessonService });
        const list = controller.list;

        await list(
            { query: { course: 'TECMKT' } },
            response,
            next,
        );

        assert.deepEqual(serviceCalls.listLessons, [
            { course: 'TECMKT' },
        ]);
        assert.deepEqual(responseCalls.status, [200]);
        assert.deepEqual(nextCalls, []);
    });

    test('encaminha uma falha do serviço sem iniciar a resposta', async () => {
        const expectedError = new Error(
            'Falha controlada na consulta.',
        );
        const { lessonService } = createFakeLessonService({
            listError: expectedError,
        });
        const { response, calls: responseCalls } =
            createFakeResponse();
        const { next, calls: nextCalls } = createNextRecorder();
        const controller = new LessonController({ lessonService });

        await controller.list(
            { query: {} },
            response,
            next,
        );

        assert.deepEqual(responseCalls.status, []);
        assert.deepEqual(responseCalls.json, []);
        assert.equal(nextCalls.length, 1);
        assert.strictEqual(nextCalls[0], expectedError);
    });

    test('encaminha uma lista inválida sem enviá-la ao cliente', async () => {
        const { lessonService } = createFakeLessonService({
            lessons: null,
        });
        const { response, calls: responseCalls } =
            createFakeResponse();
        const { next, calls: nextCalls } = createNextRecorder();
        const controller = new LessonController({ lessonService });

        await controller.list(
            { query: {} },
            response,
            next,
        );

        assert.deepEqual(responseCalls.status, []);
        assert.deepEqual(responseCalls.json, []);
        assert.equal(nextCalls.length, 1);
        assert.equal(nextCalls[0] instanceof TypeError, true);
        assert.equal(
            nextCalls[0].message,
            LESSON_CONTROLLER_ERRORS.INVALID_LESSON_LIST_RESPONSE,
        );
    });
});
