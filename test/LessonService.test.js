'use strict';

const assert = require('node:assert/strict');
const {
    describe,
    test,
} = require('node:test');
const mongoose = require('mongoose');

const { AppError } = require('../src/errors/AppError');
const {
    LESSON_CREATION_FIELDS,
    LESSON_ID_PATTERN,
    LESSON_LIST_FILTER_FIELDS,
    LESSON_LIST_SORT,
    LESSON_SERVICE_CODES,
    LESSON_SERVICE_MESSAGES,
    LESSON_UPDATE_FIELDS,
    LESSON_UPDATE_OPTIONS,
    LessonService,
} = require('../src/services/LessonService');

/**
 * Dados funcionais válidos utilizados nos testes de criação.
 */
const VALID_LESSON_DATA = Object.freeze({
    date: '2026-09-15',
    course: 'APQSA',
    curricularUnit: 'UC 1',
    type: 'Aula',
    lessonNumber: '12',
    needsReview: true,
    lessonPlanUrl: 'https://example.com/plano-aula',
    studentGuideUrl: 'https://example.com/guia-discente',
});

/**
 * Identificador MongoDB válido utilizado nos testes de edição e exclusão.
 */
const VALID_LESSON_ID = '507f1f77bcf86cd799439011';

/**
 * Cria um documento semelhante ao devolvido pelo Mongoose.
 *
 * Propriedades adicionais comprovam que a representação pública seleciona
 * explicitamente seus campos em vez de espalhar o documento original.
 *
 * @param {object} overrides Campos que serão substituídos.
 * @returns {object} Documento controlado de aula.
 */
function createLessonDocument(overrides = {}) {
    return {
        _id: 'aula-123',
        date: '2026-09-15',
        course: 'APQSA',
        curricularUnit: 'UC 1',
        type: 'Aula',
        lessonNumber: '12',
        needsReview: true,
        lessonPlanUrl: 'https://example.com/plano-aula',
        studentGuideUrl: 'https://example.com/guia-discente',
        createdAt: new Date('2026-09-15T12:00:00.000Z'),
        updatedAt: new Date('2026-09-15T12:00:00.000Z'),
        internalValue: 'não deve atravessar o serviço',
        ...overrides,
    };
}

/**
 * Cria um modelo de aula controlado sem abrir conexão com o MongoDB.
 *
 * A consulta devolvida por find() implementa sort() e é aguardável no mesmo
 * ponto utilizado pelo serviço real. Todas as entradas ficam registradas para
 * que os testes verifiquem a fronteira entregue ao modelo.
 *
 * @param {object} options Comportamento configurável do modelo.
 * @param {object} options.createdLesson Documento devolvido por create().
 * @param {object|null} options.updatedLesson Resultado da edição.
 * @param {object|null} options.deletedLesson Resultado da exclusão.
 * @param {Array|unknown} options.lessons Resultado devolvido por sort().
 * @param {Error|null} options.createError Falha opcional da criação.
 * @param {Error|null} options.updateError Falha opcional da edição.
 * @param {Error|null} options.deleteError Falha opcional da exclusão.
 * @param {Error|null} options.findError Falha síncrona opcional de find().
 * @param {Error|null} options.sortError Falha assíncrona opcional de sort().
 * @returns {{ LessonModel: object, calls: object }} Modelo e chamadas.
 */
function createFakeLessonModel({
    createdLesson = createLessonDocument(),
    updatedLesson = createLessonDocument({
        _id: VALID_LESSON_ID,
    }),
    deletedLesson = createLessonDocument({
        _id: VALID_LESSON_ID,
    }),
    lessons = [createLessonDocument()],
    createError = null,
    updateError = null,
    deleteError = null,
    findError = null,
    sortError = null,
} = {}) {
    const calls = {
        create: [],
        findByIdAndUpdate: [],
        findByIdAndDelete: [],
        find: [],
        sort: [],
    };

    const LessonModel = {
        async create(lessonData) {
            calls.create.push(lessonData);

            if (createError) {
                throw createError;
            }

            return createdLesson;
        },

        async findByIdAndUpdate(lessonId, update, options) {
            calls.findByIdAndUpdate.push({
                lessonId,
                update,
                options,
            });

            if (updateError) {
                throw updateError;
            }

            return updatedLesson;
        },

        async findByIdAndDelete(lessonId) {
            calls.findByIdAndDelete.push(lessonId);

            if (deleteError) {
                throw deleteError;
            }

            return deletedLesson;
        },

        find(filter) {
            calls.find.push(filter);

            if (findError) {
                throw findError;
            }

            return {
                sort(sortDefinition) {
                    calls.sort.push(sortDefinition);

                    if (sortError) {
                        return Promise.reject(sortError);
                    }

                    return Promise.resolve(lessons);
                },
            };
        },
    };

    return {
        LessonModel,
        calls,
    };
}

/**
 * Confirma o contrato comum dos erros operacionais de entrada.
 *
 * @param {unknown} error Erro recebido.
 * @param {string} expectedCode Código público esperado.
 * @param {string} expectedMessage Mensagem pública esperada.
 * @returns {boolean} Verdadeiro para uso nos validadores de assert.
 */
function assertOperationalInputError(
    error,
    expectedCode,
    expectedMessage,
) {
    assert.equal(error instanceof AppError, true);
    assert.equal(error.statusCode, 400);
    assert.equal(error.code, expectedCode);
    assert.equal(error.message, expectedMessage);
    assert.equal(error.isOperational, true);

    return true;
}

describe('configuração do LessonService', () => {
    test('expõe contratos estáveis para criação, edição, exclusão e consulta', () => {
        assert.deepEqual(LESSON_SERVICE_CODES, {
            INVALID_LESSON_DATA: 'INVALID_LESSON_DATA',
            INVALID_LESSON_FILTERS: 'INVALID_LESSON_FILTERS',
            INVALID_LESSON_ID: 'INVALID_LESSON_ID',
        });

        assert.deepEqual(LESSON_CREATION_FIELDS, [
            'date',
            'course',
            'curricularUnit',
            'type',
            'lessonNumber',
            'needsReview',
            'lessonPlanUrl',
            'studentGuideUrl',
        ]);

        assert.deepEqual(LESSON_LIST_FILTER_FIELDS, [
            'course',
            'month',
            'fromDate',
        ]);

        assert.deepEqual(LESSON_LIST_SORT, {
            date: 1,
            _id: 1,
        });
        assert.strictEqual(
            LESSON_UPDATE_FIELDS,
            LESSON_CREATION_FIELDS,
        );
        assert.deepEqual(LESSON_UPDATE_OPTIONS, {
            new: true,
            runValidators: true,
            context: 'query',
        });
        assert.equal(
            LESSON_ID_PATTERN.test(VALID_LESSON_ID),
            true,
        );
    });

    test('protege constantes contra alterações', () => {
        assert.equal(Object.isFrozen(LESSON_SERVICE_CODES), true);
        assert.equal(Object.isFrozen(LESSON_SERVICE_MESSAGES), true);
        assert.equal(Object.isFrozen(LESSON_CREATION_FIELDS), true);
        assert.equal(Object.isFrozen(LESSON_UPDATE_FIELDS), true);
        assert.equal(Object.isFrozen(LESSON_UPDATE_OPTIONS), true);
        assert.equal(
            Object.isFrozen(LESSON_LIST_FILTER_FIELDS),
            true,
        );
        assert.equal(Object.isFrozen(LESSON_LIST_SORT), true);
    });

    test('permite construir o serviço com a dependência padrão', () => {
        const service = new LessonService();

        assert.equal(typeof service.createLesson, 'function');
        assert.equal(typeof service.updateLesson, 'function');
        assert.equal(typeof service.deleteLesson, 'function');
        assert.equal(typeof service.listLessons, 'function');
    });

    test('rejeita modelos de aula inválidos', () => {
        const invalidModels = [
            null,
            false,
            {},
            { create: 'não é função', find() {} },
            { create() {} },
            { create() {}, find: 'não é função' },
            { create() {}, find() {} },
            {
                create() {},
                find() {},
                findByIdAndUpdate: 'não é função',
            },
            {
                create() {},
                find() {},
                findByIdAndUpdate() {},
                findByIdAndDelete: 'não é função',
            },
        ];

        for (const LessonModel of invalidModels) {
            assert.throws(
                () => new LessonService({ LessonModel }),
                {
                    name: 'TypeError',
                    message:
                        LESSON_SERVICE_MESSAGES.INVALID_LESSON_MODEL,
                },
            );
        }
    });
});

describe('preparação dos dados de criação', () => {
    test('cria uma cópia imutável com os oito campos autorizados', () => {
        const receivedData = {
            ...VALID_LESSON_DATA,
        };

        const preparedData =
            LessonService.prepareLessonData(receivedData);

        assert.deepEqual(preparedData, VALID_LESSON_DATA);
        assert.notStrictEqual(preparedData, receivedData);
        assert.equal(Object.isFrozen(preparedData), true);
    });

    test('preserva a ausência dos campos opcionais para o schema', () => {
        const preparedData = LessonService.prepareLessonData({
            date: '2026-09-15',
            course: 'TECMKT',
            curricularUnit: 'UC 4',
        });

        assert.deepEqual(preparedData, {
            date: '2026-09-15',
            course: 'TECMKT',
            curricularUnit: 'UC 4',
        });
        assert.equal(Object.hasOwn(preparedData, 'type'), false);
        assert.equal(
            Object.hasOwn(preparedData, 'lessonNumber'),
            false,
        );
    });

    test('rejeita estruturas que não sejam objetos de entrada', () => {
        const invalidData = [
            undefined,
            null,
            false,
            'aula',
            42,
            [],
        ];

        for (const lessonData of invalidData) {
            assert.throws(
                () => LessonService.prepareLessonData(lessonData),
                (error) => assertOperationalInputError(
                    error,
                    LESSON_SERVICE_CODES.INVALID_LESSON_DATA,
                    LESSON_SERVICE_MESSAGES.INVALID_LESSON_DATA,
                ),
            );
        }
    });

    test('rejeita identificadores, timestamps e campos desconhecidos', () => {
        const invalidFields = [
            'id',
            '_id',
            'createdAt',
            'updatedAt',
            'administratorId',
            'unknownField',
        ];

        for (const field of invalidFields) {
            assert.throws(
                () => LessonService.prepareLessonData({
                    ...VALID_LESSON_DATA,
                    [field]: 'valor não autorizado',
                }),
                (error) => assertOperationalInputError(
                    error,
                    LESSON_SERVICE_CODES.INVALID_LESSON_DATA,
                    LESSON_SERVICE_MESSAGES.INVALID_LESSON_DATA,
                ),
            );
        }
    });
});

describe('preparação da edição de aulas', () => {
    test('preserva um identificador MongoDB válido', () => {
        assert.equal(
            LessonService.prepareLessonId(VALID_LESSON_ID),
            VALID_LESSON_ID,
        );
        assert.equal(
            LessonService.prepareLessonId(
                VALID_LESSON_ID.toUpperCase(),
            ),
            VALID_LESSON_ID.toUpperCase(),
        );
    });

    test('rejeita identificadores inválidos antes do modelo', () => {
        const invalidIds = [
            undefined,
            null,
            false,
            42,
            '',
            'aula-123',
            '507f1f77bcf86cd79943901',
            '507f1f77bcf86cd7994390110',
            '507f1f77bcf86cd79943901z',
            ' ' + VALID_LESSON_ID,
        ];

        for (const lessonId of invalidIds) {
            assert.throws(
                () => LessonService.prepareLessonId(lessonId),
                (error) => assertOperationalInputError(
                    error,
                    LESSON_SERVICE_CODES.INVALID_LESSON_ID,
                    LESSON_SERVICE_MESSAGES.INVALID_LESSON_ID,
                ),
            );
        }
    });

    test('cria uma cópia completa e imutável para atualização', () => {
        const receivedData = {
            ...VALID_LESSON_DATA,
        };
        const preparedData =
            LessonService.prepareLessonUpdateData(receivedData);

        assert.deepEqual(preparedData, VALID_LESSON_DATA);
        assert.notStrictEqual(preparedData, receivedData);
        assert.equal(Object.isFrozen(preparedData), true);
    });

    test('aceita remoções explícitas dos campos opcionais', () => {
        const preparedData =
            LessonService.prepareLessonUpdateData({
                ...VALID_LESSON_DATA,
                lessonNumber: null,
                lessonPlanUrl: null,
                studentGuideUrl: null,
            });

        assert.equal(preparedData.lessonNumber, null);
        assert.equal(preparedData.lessonPlanUrl, null);
        assert.equal(preparedData.studentGuideUrl, null);
    });

    test('rejeita estados incompletos ou com campos desconhecidos', () => {
        const { date, ...withoutDate } = VALID_LESSON_DATA;
        const invalidUpdates = [
            undefined,
            null,
            {},
            withoutDate,
            {
                ...VALID_LESSON_DATA,
                id: VALID_LESSON_ID,
            },
            {
                ...VALID_LESSON_DATA,
                updatedAt: '2026-09-24T12:00:00.000Z',
            },
        ];

        assert.equal(date, VALID_LESSON_DATA.date);

        for (const lessonData of invalidUpdates) {
            assert.throws(
                () => LessonService
                    .prepareLessonUpdateData(lessonData),
                (error) => assertOperationalInputError(
                    error,
                    LESSON_SERVICE_CODES.INVALID_LESSON_DATA,
                    LESSON_SERVICE_MESSAGES.INVALID_LESSON_DATA,
                ),
            );
        }
    });
});

describe('preparação dos filtros de consulta', () => {
    test('aceita uma consulta sem filtros', () => {
        const filter = LessonService.prepareListFilter();

        assert.deepEqual(filter, {});
        assert.equal(Object.isFrozen(filter), true);
    });

    test('prepara o filtro pelos três cursos originais', () => {
        const courses = [
            'APQSA',
            'TECMKT',
            'TECADM',
        ];

        for (const course of courses) {
            const filter = LessonService.prepareListFilter({
                course,
            });

            assert.deepEqual(filter, { course });
        }
    });

    test('transforma o mês em um intervalo textual fechado', () => {
        const filter = LessonService.prepareListFilter({
            month: '2026-09',
        });

        assert.deepEqual(filter, {
            date: {
                $gte: '2026-09-01',
                $lte: '2026-09-31',
            },
        });
        assert.equal(Object.isFrozen(filter), true);
        assert.equal(Object.isFrozen(filter.date), true);
    });

    test('prepara uma data mínima sem converter seu fuso horário', () => {
        const filter = LessonService.prepareListFilter({
            fromDate: '2026-09-15',
        });

        assert.deepEqual(filter, {
            date: {
                $gte: '2026-09-15',
            },
        });
    });

    test('combina curso, mês e data mínima posterior', () => {
        const filter = LessonService.prepareListFilter({
            course: 'TECADM',
            month: '2026-09',
            fromDate: '2026-09-15',
        });

        assert.deepEqual(filter, {
            course: 'TECADM',
            date: {
                $gte: '2026-09-15',
                $lte: '2026-09-31',
            },
        });
    });

    test('mantém o início do mês quando a data mínima é anterior', () => {
        const filter = LessonService.prepareListFilter({
            month: '2026-09',
            fromDate: '2026-08-20',
        });

        assert.deepEqual(filter, {
            date: {
                $gte: '2026-09-01',
                $lte: '2026-09-31',
            },
        });
    });

    test('rejeita estruturas e campos de filtro desconhecidos', () => {
        const invalidFilters = [
            null,
            false,
            'filtros',
            42,
            [],
            { today: true },
            { limit: 5 },
            { search: 'UC 1' },
        ];

        for (const filters of invalidFilters) {
            assert.throws(
                () => LessonService.prepareListFilter(filters),
                (error) => assertOperationalInputError(
                    error,
                    LESSON_SERVICE_CODES.INVALID_LESSON_FILTERS,
                    LESSON_SERVICE_MESSAGES.INVALID_LESSON_FILTERS,
                ),
            );
        }
    });

    test('rejeita cursos, meses e datas mínimas inválidos', () => {
        const invalidFilters = [
            { course: '' },
            { course: 'OUTRO' },
            { course: null },
            { month: '' },
            { month: '2026-00' },
            { month: '2026-13' },
            { month: '26-09' },
            { fromDate: '' },
            { fromDate: '2026-02-30' },
            { fromDate: '15/09/2026' },
        ];

        for (const filters of invalidFilters) {
            assert.throws(
                () => LessonService.prepareListFilter(filters),
                (error) => assertOperationalInputError(
                    error,
                    LESSON_SERVICE_CODES.INVALID_LESSON_FILTERS,
                    LESSON_SERVICE_MESSAGES.INVALID_LESSON_FILTERS,
                ),
            );
        }
    });
});

describe('representação pública da aula', () => {
    test('seleciona somente o identificador e os campos funcionais', () => {
        const document = createLessonDocument();

        const lesson =
            LessonService.createLessonRepresentation(document);

        assert.deepEqual(lesson, {
            id: 'aula-123',
            ...VALID_LESSON_DATA,
        });
        assert.equal(Object.isFrozen(lesson), true);
        assert.notStrictEqual(lesson, document);
        assert.equal(Object.hasOwn(lesson, '_id'), false);
        assert.equal(Object.hasOwn(lesson, 'createdAt'), false);
        assert.equal(Object.hasOwn(lesson, 'updatedAt'), false);
        assert.equal(Object.hasOwn(lesson, 'internalValue'), false);
    });

    test('aceita a ausência normalizada dos campos opcionais', () => {
        const lesson = LessonService.createLessonRepresentation(
            createLessonDocument({
                lessonNumber: null,
                lessonPlanUrl: null,
                studentGuideUrl: null,
                needsReview: false,
            }),
        );

        assert.equal(lesson.lessonNumber, null);
        assert.equal(lesson.lessonPlanUrl, null);
        assert.equal(lesson.studentGuideUrl, null);
        assert.equal(lesson.needsReview, false);
    });

    test('rejeita documentos incompletos ou estruturalmente inválidos', () => {
        const invalidDocuments = [
            undefined,
            null,
            {},
            createLessonDocument({ _id: null }),
            createLessonDocument({ date: undefined }),
            createLessonDocument({ course: undefined }),
            createLessonDocument({ curricularUnit: undefined }),
            createLessonDocument({ type: undefined }),
            createLessonDocument({ lessonNumber: 12 }),
            createLessonDocument({ needsReview: 'true' }),
            createLessonDocument({ lessonPlanUrl: false }),
            createLessonDocument({ studentGuideUrl: {} }),
        ];

        for (const document of invalidDocuments) {
            assert.throws(
                () => LessonService
                    .createLessonRepresentation(document),
                {
                    name: 'TypeError',
                    message:
                        LESSON_SERVICE_MESSAGES
                            .INVALID_LESSON_DOCUMENT,
                },
            );
        }
    });
});

describe('criação de aulas', () => {
    test('entrega somente os dados autorizados e retorna a aula pública', async () => {
        const createdDocument = createLessonDocument();
        const {
            LessonModel,
            calls,
        } = createFakeLessonModel({
            createdLesson: createdDocument,
        });

        const service = new LessonService({ LessonModel });
        const lesson = await service.createLesson({
            ...VALID_LESSON_DATA,
        });

        assert.deepEqual(calls.create, [VALID_LESSON_DATA]);
        assert.equal(Object.isFrozen(calls.create[0]), true);
        assert.deepEqual(lesson, {
            id: 'aula-123',
            ...VALID_LESSON_DATA,
        });
        assert.equal(Object.isFrozen(lesson), true);
        assert.notStrictEqual(lesson, createdDocument);
    });

    test('não consulta o modelo quando a estrutura é inválida', async () => {
        const { LessonModel, calls } = createFakeLessonModel();
        const service = new LessonService({ LessonModel });

        await assert.rejects(
            service.createLesson({
                ...VALID_LESSON_DATA,
                id: 'identificador-forjado',
            }),
            (error) => assertOperationalInputError(
                error,
                LESSON_SERVICE_CODES.INVALID_LESSON_DATA,
                LESSON_SERVICE_MESSAGES.INVALID_LESSON_DATA,
            ),
        );

        assert.deepEqual(calls.create, []);
    });

    test('converte a validação do modelo em erro operacional seguro', async () => {
        const technicalMessage =
            'curricularUnit: Path is required.';
        const validationError = new Error(technicalMessage);

        validationError.name = 'ValidationError';

        const { LessonModel } = createFakeLessonModel({
            createError: validationError,
        });
        const service = new LessonService({ LessonModel });

        await assert.rejects(
            service.createLesson({}),
            (error) => {
                assertOperationalInputError(
                    error,
                    LESSON_SERVICE_CODES.INVALID_LESSON_DATA,
                    LESSON_SERVICE_MESSAGES.INVALID_LESSON_DATA,
                );
                assert.equal(
                    error.message.includes(technicalMessage),
                    false,
                );

                return true;
            },
        );
    });

    test('propaga uma falha real ocorrida durante a criação', async () => {
        const expectedError = new Error(
            'Falha controlada ao gravar a aula.',
        );
        const { LessonModel } = createFakeLessonModel({
            createError: expectedError,
        });
        const service = new LessonService({ LessonModel });

        await assert.rejects(
            service.createLesson(VALID_LESSON_DATA),
            (error) => {
                assert.strictEqual(error, expectedError);

                return true;
            },
        );
    });

    test('rejeita um documento inconsistente devolvido pela criação', async () => {
        const { LessonModel } = createFakeLessonModel({
            createdLesson: createLessonDocument({
                needsReview: undefined,
            }),
        });
        const service = new LessonService({ LessonModel });

        await assert.rejects(
            service.createLesson(VALID_LESSON_DATA),
            {
                name: 'TypeError',
                message:
                    LESSON_SERVICE_MESSAGES.INVALID_LESSON_DOCUMENT,
            },
        );
    });
});

describe('edição de aulas', () => {
    test('atualiza atomicamente e retorna a aula pública', async () => {
        const editedData = {
            ...VALID_LESSON_DATA,
            date: '2026-09-24',
            curricularUnit: 'UC atualizada',
            needsReview: false,
            lessonPlanUrl: null,
        };
        const updatedDocument = createLessonDocument({
            _id: VALID_LESSON_ID,
            ...editedData,
        });
        const {
            LessonModel,
            calls,
        } = createFakeLessonModel({
            updatedLesson: updatedDocument,
        });
        const service = new LessonService({ LessonModel });

        const lesson = await service.updateLesson(
            VALID_LESSON_ID,
            editedData,
        );

        assert.equal(calls.findByIdAndUpdate.length, 1);
        assert.deepEqual(calls.findByIdAndUpdate[0], {
            lessonId: VALID_LESSON_ID,
            update: {
                $set: editedData,
            },
            options: {
                new: true,
                runValidators: true,
                context: 'query',
            },
        });
        assert.equal(
            Object.isFrozen(
                calls.findByIdAndUpdate[0].update,
            ),
            true,
        );
        assert.equal(
            Object.isFrozen(
                calls.findByIdAndUpdate[0].update.$set,
            ),
            true,
        );
        assert.strictEqual(
            calls.findByIdAndUpdate[0].options,
            LESSON_UPDATE_OPTIONS,
        );
        assert.deepEqual(lesson, {
            id: VALID_LESSON_ID,
            ...editedData,
        });
        assert.equal(Object.isFrozen(lesson), true);
        assert.notStrictEqual(lesson, updatedDocument);
    });

    test('devolve null quando a aula não existe', async () => {
        const {
            LessonModel,
            calls,
        } = createFakeLessonModel({
            updatedLesson: null,
        });
        const service = new LessonService({ LessonModel });

        const lesson = await service.updateLesson(
            VALID_LESSON_ID,
            VALID_LESSON_DATA,
        );

        assert.equal(lesson, null);
        assert.equal(calls.findByIdAndUpdate.length, 1);
    });

    test('não acessa o modelo quando o identificador é inválido', async () => {
        const { LessonModel, calls } = createFakeLessonModel();
        const service = new LessonService({ LessonModel });

        await assert.rejects(
            service.updateLesson(
                'identificador-inválido',
                VALID_LESSON_DATA,
            ),
            (error) => assertOperationalInputError(
                error,
                LESSON_SERVICE_CODES.INVALID_LESSON_ID,
                LESSON_SERVICE_MESSAGES.INVALID_LESSON_ID,
            ),
        );

        assert.deepEqual(calls.findByIdAndUpdate, []);
    });

    test('não acessa o modelo quando os dados são inválidos', async () => {
        const { LessonModel, calls } = createFakeLessonModel();
        const service = new LessonService({ LessonModel });

        await assert.rejects(
            service.updateLesson(VALID_LESSON_ID, {}),
            (error) => assertOperationalInputError(
                error,
                LESSON_SERVICE_CODES.INVALID_LESSON_DATA,
                LESSON_SERVICE_MESSAGES.INVALID_LESSON_DATA,
            ),
        );

        assert.deepEqual(calls.findByIdAndUpdate, []);
    });

    test('converte a validação do modelo em erro seguro', async () => {
        const technicalMessage = 'date: invalid calendar date';
        const validationError = new Error(technicalMessage);

        validationError.name = 'ValidationError';

        const { LessonModel } = createFakeLessonModel({
            updateError: validationError,
        });
        const service = new LessonService({ LessonModel });

        await assert.rejects(
            service.updateLesson(
                VALID_LESSON_ID,
                VALID_LESSON_DATA,
            ),
            (error) => {
                assertOperationalInputError(
                    error,
                    LESSON_SERVICE_CODES.INVALID_LESSON_DATA,
                    LESSON_SERVICE_MESSAGES.INVALID_LESSON_DATA,
                );
                assert.equal(
                    error.message.includes(technicalMessage),
                    false,
                );

                return true;
            },
        );
    });

    test('converte uma falha de conversão em erro seguro', async () => {
        const technicalMessage = 'Cast to boolean failed';
        const castError = new Error(technicalMessage);

        castError.name = 'CastError';

        const { LessonModel } = createFakeLessonModel({
            updateError: castError,
        });
        const service = new LessonService({ LessonModel });

        await assert.rejects(
            service.updateLesson(
                VALID_LESSON_ID,
                VALID_LESSON_DATA,
            ),
            (error) => {
                assertOperationalInputError(
                    error,
                    LESSON_SERVICE_CODES.INVALID_LESSON_DATA,
                    LESSON_SERVICE_MESSAGES.INVALID_LESSON_DATA,
                );
                assert.equal(
                    error.message.includes(technicalMessage),
                    false,
                );

                return true;
            },
        );
    });

    test('propaga uma falha real ocorrida durante a edição', async () => {
        const expectedError = new Error(
            'Falha controlada ao atualizar a aula.',
        );
        const { LessonModel } = createFakeLessonModel({
            updateError: expectedError,
        });
        const service = new LessonService({ LessonModel });

        await assert.rejects(
            service.updateLesson(
                VALID_LESSON_ID,
                VALID_LESSON_DATA,
            ),
            (error) => {
                assert.strictEqual(error, expectedError);

                return true;
            },
        );
    });

    test('rejeita um documento inconsistente devolvido pela edição', async () => {
        const { LessonModel } = createFakeLessonModel({
            updatedLesson: createLessonDocument({
                _id: VALID_LESSON_ID,
                needsReview: undefined,
            }),
        });
        const service = new LessonService({ LessonModel });

        await assert.rejects(
            service.updateLesson(
                VALID_LESSON_ID,
                VALID_LESSON_DATA,
            ),
            {
                name: 'TypeError',
                message:
                    LESSON_SERVICE_MESSAGES.INVALID_LESSON_DOCUMENT,
            },
        );
    });
});

describe('exclusão de aulas', () => {
    test('exclui atomicamente e retorna a aula pública', async () => {
        const deletedDocument = createLessonDocument({
            _id: VALID_LESSON_ID,
        });
        const {
            LessonModel,
            calls,
        } = createFakeLessonModel({
            deletedLesson: deletedDocument,
        });
        const service = new LessonService({ LessonModel });

        const lesson = await service.deleteLesson(
            VALID_LESSON_ID,
        );

        assert.deepEqual(calls.findByIdAndDelete, [
            VALID_LESSON_ID,
        ]);
        assert.deepEqual(lesson, {
            id: VALID_LESSON_ID,
            ...VALID_LESSON_DATA,
        });
        assert.equal(Object.isFrozen(lesson), true);
        assert.notStrictEqual(lesson, deletedDocument);
    });

    test('devolve null quando a aula já não existe', async () => {
        const {
            LessonModel,
            calls,
        } = createFakeLessonModel({
            deletedLesson: null,
        });
        const service = new LessonService({ LessonModel });

        const lesson = await service.deleteLesson(
            VALID_LESSON_ID,
        );

        assert.equal(lesson, null);
        assert.deepEqual(calls.findByIdAndDelete, [
            VALID_LESSON_ID,
        ]);
    });

    test('não acessa o modelo quando o identificador é inválido', async () => {
        const { LessonModel, calls } = createFakeLessonModel();
        const service = new LessonService({ LessonModel });

        await assert.rejects(
            service.deleteLesson('identificador-inválido'),
            (error) => assertOperationalInputError(
                error,
                LESSON_SERVICE_CODES.INVALID_LESSON_ID,
                LESSON_SERVICE_MESSAGES.INVALID_LESSON_ID,
            ),
        );

        assert.deepEqual(calls.findByIdAndDelete, []);
    });

    test('converte uma falha de conversão em erro seguro', async () => {
        const technicalMessage = 'Cast to ObjectId failed';
        const castError = new Error(technicalMessage);

        castError.name = 'CastError';

        const { LessonModel } = createFakeLessonModel({
            deleteError: castError,
        });
        const service = new LessonService({ LessonModel });

        await assert.rejects(
            service.deleteLesson(VALID_LESSON_ID),
            (error) => {
                assertOperationalInputError(
                    error,
                    LESSON_SERVICE_CODES.INVALID_LESSON_ID,
                    LESSON_SERVICE_MESSAGES.INVALID_LESSON_ID,
                );
                assert.equal(
                    error.message.includes(technicalMessage),
                    false,
                );

                return true;
            },
        );
    });

    test('propaga uma falha real ocorrida durante a exclusão', async () => {
        const expectedError = new Error(
            'Falha controlada ao excluir a aula.',
        );
        const { LessonModel } = createFakeLessonModel({
            deleteError: expectedError,
        });
        const service = new LessonService({ LessonModel });

        await assert.rejects(
            service.deleteLesson(VALID_LESSON_ID),
            (error) => {
                assert.strictEqual(error, expectedError);

                return true;
            },
        );
    });

    test('rejeita um documento inconsistente devolvido pela exclusão', async () => {
        const { LessonModel } = createFakeLessonModel({
            deletedLesson: createLessonDocument({
                _id: VALID_LESSON_ID,
                needsReview: undefined,
            }),
        });
        const service = new LessonService({ LessonModel });

        await assert.rejects(
            service.deleteLesson(VALID_LESSON_ID),
            {
                name: 'TypeError',
                message:
                    LESSON_SERVICE_MESSAGES.INVALID_LESSON_DOCUMENT,
            },
        );
    });
});

describe('consulta de aulas', () => {
    test('consulta sem filtros e aplica a ordenação determinística', async () => {
        const documents = [
            createLessonDocument({
                _id: 'aula-1',
                date: '2026-09-15',
            }),
            createLessonDocument({
                _id: 'aula-2',
                date: '2026-09-16',
            }),
        ];
        const {
            LessonModel,
            calls,
        } = createFakeLessonModel({ lessons: documents });
        const service = new LessonService({ LessonModel });

        const lessons = await service.listLessons();

        assert.deepEqual(calls.find, [{}]);
        assert.deepEqual(calls.sort, [
            {
                date: 1,
                _id: 1,
            },
        ]);
        assert.equal(Object.isFrozen(calls.find[0]), true);
        assert.strictEqual(calls.sort[0], LESSON_LIST_SORT);
        assert.equal(lessons.length, 2);
        assert.equal(lessons[0].id, 'aula-1');
        assert.equal(lessons[1].id, 'aula-2');
        assert.equal(Object.isFrozen(lessons), true);
        assert.equal(Object.isFrozen(lessons[0]), true);
        assert.notStrictEqual(lessons[0], documents[0]);
    });

    test('entrega ao modelo os filtros combinados', async () => {
        const {
            LessonModel,
            calls,
        } = createFakeLessonModel({ lessons: [] });
        const service = new LessonService({ LessonModel });

        const lessons = await service.listLessons({
            course: 'APQSA',
            month: '2026-09',
            fromDate: '2026-09-15',
        });

        assert.deepEqual(calls.find, [
            {
                course: 'APQSA',
                date: {
                    $gte: '2026-09-15',
                    $lte: '2026-09-31',
                },
            },
        ]);
        assert.deepEqual(lessons, []);
        assert.equal(Object.isFrozen(lessons), true);
    });

    test(
        'preserva o intervalo interno diante do sanitizador do Mongoose',
        async () => {
            const mongooseClient = new mongoose.Mongoose();
            mongooseClient.set('sanitizeFilter', true);

            const {
                LessonModel,
                calls,
            } = createFakeLessonModel({ lessons: [] });

            /**
             * Model.base possui a instância Mongoose que criou um modelo
             * real. O modelo controlado reproduz somente essa propriedade
             * para exercitar o mesmo mecanismo de confiança sem abrir banco.
             */
            LessonModel.base = mongooseClient;

            const service = new LessonService({ LessonModel });

            await service.listLessons({
                course: 'APQSA',
                month: '2026-09',
                fromDate: '2026-09-15',
            });

            const filterDeliveredToModel = calls.find[0];

            /**
             * sanitizeFilter altera o objeto recebido quando encontra um
             * seletor não confiável. Aqui ele deve preservar `$gte` e `$lte`
             * porque os dois foram construídos depois da validação do serviço.
             */
            mongooseClient.sanitizeFilter(
                filterDeliveredToModel,
            );

            assert.deepEqual({
                course: filterDeliveredToModel.course,
                date: Object.fromEntries(
                    Object.entries(filterDeliveredToModel.date),
                ),
            }, {
                course: 'APQSA',
                date: {
                    $gte: '2026-09-15',
                    $lte: '2026-09-31',
                },
            });
            assert.equal(
                Object.hasOwn(
                    filterDeliveredToModel.date,
                    '$eq',
                ),
                false,
            );
            assert.equal(
                Object.isFrozen(filterDeliveredToModel),
                true,
            );
            assert.equal(
                Object.isFrozen(filterDeliveredToModel.date),
                true,
            );
        },
    );

    test('não consulta o modelo quando os filtros são inválidos', async () => {
        const { LessonModel, calls } = createFakeLessonModel();
        const service = new LessonService({ LessonModel });

        await assert.rejects(
            service.listLessons({ course: 'OUTRO' }),
            (error) => assertOperationalInputError(
                error,
                LESSON_SERVICE_CODES.INVALID_LESSON_FILTERS,
                LESSON_SERVICE_MESSAGES.INVALID_LESSON_FILTERS,
            ),
        );

        assert.deepEqual(calls.find, []);
        assert.deepEqual(calls.sort, []);
    });

    test('propaga uma falha real iniciada por find', async () => {
        const expectedError = new Error(
            'Falha controlada ao iniciar a consulta.',
        );
        const { LessonModel } = createFakeLessonModel({
            findError: expectedError,
        });
        const service = new LessonService({ LessonModel });

        await assert.rejects(
            service.listLessons(),
            (error) => {
                assert.strictEqual(error, expectedError);

                return true;
            },
        );
    });

    test('propaga uma falha real durante a ordenação', async () => {
        const expectedError = new Error(
            'Falha controlada ao executar a consulta.',
        );
        const { LessonModel } = createFakeLessonModel({
            sortError: expectedError,
        });
        const service = new LessonService({ LessonModel });

        await assert.rejects(
            service.listLessons(),
            (error) => {
                assert.strictEqual(error, expectedError);

                return true;
            },
        );
    });

    test('rejeita um resultado que não seja uma lista', async () => {
        const { LessonModel } = createFakeLessonModel({
            lessons: null,
        });
        const service = new LessonService({ LessonModel });

        await assert.rejects(
            service.listLessons(),
            {
                name: 'TypeError',
                message:
                    LESSON_SERVICE_MESSAGES.INVALID_LESSON_LIST,
            },
        );
    });

    test('rejeita uma aula inconsistente presente na lista', async () => {
        const { LessonModel } = createFakeLessonModel({
            lessons: [
                createLessonDocument(),
                createLessonDocument({
                    _id: 'aula-inconsistente',
                    studentGuideUrl: undefined,
                }),
            ],
        });
        const service = new LessonService({ LessonModel });

        await assert.rejects(
            service.listLessons(),
            {
                name: 'TypeError',
                message:
                    LESSON_SERVICE_MESSAGES.INVALID_LESSON_DOCUMENT,
            },
        );
    });
});
