'use strict';

const assert = require('node:assert/strict');
const {
    describe,
    test,
} = require('node:test');

const { AppError } = require('../src/errors/AppError');
const {
    MONTHLY_MATERIAL_DATA_FIELDS,
    MONTHLY_MATERIAL_SERVICE_CODES,
    MONTHLY_MATERIAL_SERVICE_MESSAGES,
    MONTHLY_MATERIAL_SORT,
    MONTHLY_MATERIAL_UPDATE_OPTIONS,
    MonthlyMaterialService,
} = require('../src/services/MonthlyMaterialService');

/**
 * Dados válidos utilizados durante as substituições mensais.
 */
const VALID_MATERIAL_DATA = Object.freeze({
    lessonPlanUrl: 'https://example.com/pa-setembro',
    studentGuideUrl: 'https://example.com/gd-ad-setembro',
});

/**
 * Cria um documento semelhante ao devolvido pelo Mongoose.
 *
 * Campos adicionais demonstram que a representação pública realiza seleção
 * explícita e não espalha o documento persistente.
 *
 * @param {object} overrides Campos que substituirão os valores padrão.
 * @returns {object} Documento controlado.
 */
function createMonthlyMaterialDocument(overrides = {}) {
    return {
        _id: 'material-mensal-123',
        month: '2026-09',
        lessonPlanUrl: 'https://example.com/pa-setembro',
        studentGuideUrl: 'https://example.com/gd-ad-setembro',
        createdAt: new Date('2026-09-01T12:00:00.000Z'),
        updatedAt: new Date('2026-09-15T12:00:00.000Z'),
        internalValue: 'não deve atravessar o serviço',
        ...overrides,
    };
}

/**
 * Cria um modelo controlado sem abrir conexão com o MongoDB.
 *
 * @param {object} options Comportamento desejado.
 * @param {Array} options.listedMaterials Resultado de find().sort().
 * @param {object|null} options.foundMaterial Resultado de findOne().
 * @param {object|null} options.savedMaterial Resultado de findOneAndUpdate().
 * @param {object|null} options.deletedMaterial Resultado de findOneAndDelete().
 * @param {Error|null} options.listError Falha opcional da listagem.
 * @param {Error|null} options.findError Falha opcional da consulta.
 * @param {Error|null} options.saveError Falha opcional da gravação.
 * @param {Error|null} options.deleteError Falha opcional da exclusão.
 * @returns {{ MonthlyMaterialModel: object, calls: object }} Dependências.
 */
function createFakeMonthlyMaterialModel({
    listedMaterials = [createMonthlyMaterialDocument()],
    foundMaterial = createMonthlyMaterialDocument(),
    savedMaterial = createMonthlyMaterialDocument(),
    deletedMaterial = createMonthlyMaterialDocument(),
    listError = null,
    findError = null,
    saveError = null,
    deleteError = null,
} = {}) {
    const calls = {
        find: [],
        sort: [],
        findOne: [],
        findOneAndUpdate: [],
        findOneAndDelete: [],
    };

    const MonthlyMaterialModel = {
        find(filter) {
            calls.find.push(filter);

            return {
                async sort(sort) {
                    calls.sort.push(sort);

                    if (listError) {
                        throw listError;
                    }

                    return listedMaterials;
                },
            };
        },

        async findOne(filter) {
            calls.findOne.push(filter);

            if (findError) {
                throw findError;
            }

            return foundMaterial;
        },

        async findOneAndUpdate(filter, update, options) {
            calls.findOneAndUpdate.push({
                filter,
                update,
                options,
            });

            if (saveError) {
                throw saveError;
            }

            return savedMaterial;
        },

        async findOneAndDelete(filter) {
            calls.findOneAndDelete.push(filter);

            if (deleteError) {
                throw deleteError;
            }

            return deletedMaterial;
        },
    };

    return {
        MonthlyMaterialModel,
        calls,
    };
}

/**
 * Confirma o contrato comum dos erros operacionais de entrada.
 *
 * @param {unknown} error Erro recebido.
 * @param {string} expectedCode Código público esperado.
 * @param {string} expectedMessage Mensagem pública esperada.
 * @returns {boolean} Verdadeiro para uso no validador de assert.
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

describe('configuração do MonthlyMaterialService', () => {
    test('expõe contratos estáveis para todas as operações', () => {
        assert.deepEqual(MONTHLY_MATERIAL_SERVICE_CODES, {
            INVALID_MONTHLY_MATERIAL_MONTH:
                'INVALID_MONTHLY_MATERIAL_MONTH',
            INVALID_MONTHLY_MATERIAL_DATA:
                'INVALID_MONTHLY_MATERIAL_DATA',
        });

        assert.deepEqual(MONTHLY_MATERIAL_DATA_FIELDS, [
            'lessonPlanUrl',
            'studentGuideUrl',
        ]);

        assert.deepEqual(MONTHLY_MATERIAL_UPDATE_OPTIONS, {
            returnDocument: 'after',
            upsert: true,
            runValidators: true,
            setDefaultsOnInsert: true,
        });
        assert.deepEqual(MONTHLY_MATERIAL_SORT, {
            month: -1,
            _id: -1,
        });
    });

    test('protege constantes contra alterações', () => {
        assert.equal(
            Object.isFrozen(MONTHLY_MATERIAL_SERVICE_CODES),
            true,
        );
        assert.equal(
            Object.isFrozen(MONTHLY_MATERIAL_SERVICE_MESSAGES),
            true,
        );
        assert.equal(
            Object.isFrozen(MONTHLY_MATERIAL_DATA_FIELDS),
            true,
        );
        assert.equal(
            Object.isFrozen(MONTHLY_MATERIAL_UPDATE_OPTIONS),
            true,
        );
        assert.equal(Object.isFrozen(MONTHLY_MATERIAL_SORT), true);
    });

    test('permite construir o serviço com a dependência padrão', () => {
        const service = new MonthlyMaterialService();

        assert.equal(
            typeof service.listMonthlyMaterials,
            'function',
        );
        assert.equal(
            typeof service.getMonthlyMaterial,
            'function',
        );
        assert.equal(
            typeof service.saveMonthlyMaterial,
            'function',
        );
        assert.equal(
            typeof service.deleteMonthlyMaterial,
            'function',
        );
    });

    test('rejeita modelos mensais inválidos', () => {
        const invalidModels = [
            null,
            false,
            {},
            {
                find: 'não é função',
                findOne() {},
                findOneAndUpdate() {},
                findOneAndDelete() {},
            },
            {
                find() {},
                findOne: 'não é função',
                findOneAndUpdate() {},
                findOneAndDelete() {},
            },
            {
                find() {},
                findOne() {},
                findOneAndUpdate: 'não é função',
                findOneAndDelete() {},
            },
            {
                find() {},
                findOne() {},
                findOneAndUpdate() {},
                findOneAndDelete: 'não é função',
            },
        ];

        for (const MonthlyMaterialModel of invalidModels) {
            assert.throws(
                () => new MonthlyMaterialService({
                    MonthlyMaterialModel,
                }),
                {
                    name: 'TypeError',
                    message:
                        MONTHLY_MATERIAL_SERVICE_MESSAGES
                            .INVALID_MONTHLY_MATERIAL_MODEL,
                },
            );
        }
    });
});

describe('preparação do mês do material', () => {
    test('preserva um mês civil válido', () => {
        assert.equal(
            MonthlyMaterialService.prepareMonth('2026-09'),
            '2026-09',
        );
    });

    test('rejeita meses inválidos com erro operacional seguro', () => {
        for (const month of [
            undefined,
            null,
            202609,
            '',
            '0000-01',
            '2026-00',
            '2026-13',
            '2026-9',
            ' 2026-09 ',
        ]) {
            assert.throws(
                () => MonthlyMaterialService.prepareMonth(month),
                (error) => assertOperationalInputError(
                    error,
                    MONTHLY_MATERIAL_SERVICE_CODES
                        .INVALID_MONTHLY_MATERIAL_MONTH,
                    MONTHLY_MATERIAL_SERVICE_MESSAGES
                        .INVALID_MONTHLY_MATERIAL_MONTH,
                ),
            );
        }
    });
});

describe('preparação dos dados mensais', () => {
    test('cria uma cópia imutável dos dois links permitidos', () => {
        const source = {
            ...VALID_MATERIAL_DATA,
        };
        const result =
            MonthlyMaterialService.prepareMaterialData(source);

        assert.deepEqual(result, VALID_MATERIAL_DATA);
        assert.notStrictEqual(result, source);
        assert.equal(Object.isFrozen(result), true);
    });

    test('representa campos ausentes explicitamente com null', () => {
        assert.deepEqual(
            MonthlyMaterialService.prepareMaterialData({}),
            {
                lessonPlanUrl: null,
                studentGuideUrl: null,
            },
        );

        assert.deepEqual(
            MonthlyMaterialService.prepareMaterialData({
                lessonPlanUrl: 'https://example.com/pa',
            }),
            {
                lessonPlanUrl: 'https://example.com/pa',
                studentGuideUrl: null,
            },
        );
    });

    test('preserva valores presentes para validação pelo schema', () => {
        const result =
            MonthlyMaterialService.prepareMaterialData({
                lessonPlanUrl: 42,
                studentGuideUrl: undefined,
            });

        assert.equal(result.lessonPlanUrl, 42);
        assert.equal(result.studentGuideUrl, undefined);
    });

    test('rejeita estruturas que não sejam objetos de entrada', () => {
        for (const materialData of [
            undefined,
            null,
            false,
            'material',
            [],
        ]) {
            assert.throws(
                () => MonthlyMaterialService
                    .prepareMaterialData(materialData),
                (error) => assertOperationalInputError(
                    error,
                    MONTHLY_MATERIAL_SERVICE_CODES
                        .INVALID_MONTHLY_MATERIAL_DATA,
                    MONTHLY_MATERIAL_SERVICE_MESSAGES
                        .INVALID_MONTHLY_MATERIAL_DATA,
                ),
            );
        }
    });

    test('rejeita mês e campos internos ou desconhecidos', () => {
        for (const unknownField of [
            'month',
            'id',
            '_id',
            'createdAt',
            'updatedAt',
            '__v',
            'notes',
        ]) {
            assert.throws(
                () => MonthlyMaterialService
                    .prepareMaterialData({
                        ...VALID_MATERIAL_DATA,
                        [unknownField]: 'não permitido',
                    }),
                (error) => assertOperationalInputError(
                    error,
                    MONTHLY_MATERIAL_SERVICE_CODES
                        .INVALID_MONTHLY_MATERIAL_DATA,
                    MONTHLY_MATERIAL_SERVICE_MESSAGES
                        .INVALID_MONTHLY_MATERIAL_DATA,
                ),
            );
        }
    });
});

describe('representação pública do material mensal', () => {
    test('seleciona somente identificador, mês e links', () => {
        const representation = MonthlyMaterialService
            .createMonthlyMaterialRepresentation(
                createMonthlyMaterialDocument(),
            );

        assert.deepEqual(representation, {
            id: 'material-mensal-123',
            month: '2026-09',
            lessonPlanUrl: 'https://example.com/pa-setembro',
            studentGuideUrl:
                'https://example.com/gd-ad-setembro',
        });
        assert.equal(Object.isFrozen(representation), true);
        assert.equal(
            Object.hasOwn(representation, 'createdAt'),
            false,
        );
        assert.equal(
            Object.hasOwn(representation, 'internalValue'),
            false,
        );
    });

    test('aceita os dois links representados por null', () => {
        const representation = MonthlyMaterialService
            .createMonthlyMaterialRepresentation(
                createMonthlyMaterialDocument({
                    lessonPlanUrl: null,
                    studentGuideUrl: null,
                }),
            );

        assert.equal(representation.lessonPlanUrl, null);
        assert.equal(representation.studentGuideUrl, null);
    });

    test('rejeita documentos incompletos ou inconsistentes', () => {
        const invalidDocuments = [
            null,
            {},
            createMonthlyMaterialDocument({ _id: null }),
            createMonthlyMaterialDocument({ month: '2026-13' }),
            createMonthlyMaterialDocument({ lessonPlanUrl: 42 }),
            createMonthlyMaterialDocument({ studentGuideUrl: {} }),
        ];

        for (const document of invalidDocuments) {
            assert.throws(
                () => MonthlyMaterialService
                    .createMonthlyMaterialRepresentation(document),
                {
                    name: 'TypeError',
                    message:
                        MONTHLY_MATERIAL_SERVICE_MESSAGES
                            .INVALID_MONTHLY_MATERIAL_DOCUMENT,
                },
            );
        }
    });
});

describe('listagem dos materiais mensais', () => {
    test('lista em ordem decrescente e devolve representações públicas', async () => {
        const listedMaterials = [
            createMonthlyMaterialDocument({
                _id: 'material-outubro',
                month: '2026-10',
            }),
            createMonthlyMaterialDocument({
                _id: 'material-setembro',
                month: '2026-09',
            }),
        ];
        const {
            MonthlyMaterialModel,
            calls,
        } = createFakeMonthlyMaterialModel({ listedMaterials });
        const service = new MonthlyMaterialService({
            MonthlyMaterialModel,
        });

        const result = await service.listMonthlyMaterials();

        assert.deepEqual(calls.find, [{}]);
        assert.equal(Object.isFrozen(calls.find[0]), true);
        assert.deepEqual(calls.sort, [MONTHLY_MATERIAL_SORT]);
        assert.deepEqual(
            result.map((material) => material.month),
            ['2026-10', '2026-09'],
        );
        assert.equal(Object.isFrozen(result), true);
        assert.equal(Object.isFrozen(result[0]), true);
        assert.notStrictEqual(result[0], listedMaterials[0]);
        assert.equal(Object.hasOwn(result[0], 'createdAt'), false);
    });

    test('aceita uma coleção vazia', async () => {
        const { MonthlyMaterialModel } =
            createFakeMonthlyMaterialModel({
                listedMaterials: [],
            });
        const service = new MonthlyMaterialService({
            MonthlyMaterialModel,
        });

        const result = await service.listMonthlyMaterials();

        assert.deepEqual(result, []);
        assert.equal(Object.isFrozen(result), true);
    });

    test('rejeita um resultado que não seja uma lista', async () => {
        const { MonthlyMaterialModel } =
            createFakeMonthlyMaterialModel({
                listedMaterials: {},
            });
        const service = new MonthlyMaterialService({
            MonthlyMaterialModel,
        });

        await assert.rejects(
            service.listMonthlyMaterials(),
            {
                name: 'TypeError',
                message:
                    MONTHLY_MATERIAL_SERVICE_MESSAGES
                        .INVALID_MONTHLY_MATERIAL_LIST,
            },
        );
    });

    test('traduz um item inconsistente como lista inválida', async () => {
        const { MonthlyMaterialModel } =
            createFakeMonthlyMaterialModel({
                listedMaterials: [
                    createMonthlyMaterialDocument(),
                    { month: '2026-08' },
                ],
            });
        const service = new MonthlyMaterialService({
            MonthlyMaterialModel,
        });

        await assert.rejects(
            service.listMonthlyMaterials(),
            {
                name: 'TypeError',
                message:
                    MONTHLY_MATERIAL_SERVICE_MESSAGES
                        .INVALID_MONTHLY_MATERIAL_LIST,
            },
        );
    });

    test('propaga uma falha real ocorrida durante a listagem', async () => {
        const expectedError = new Error(
            'Falha real de listagem.',
        );
        const { MonthlyMaterialModel } =
            createFakeMonthlyMaterialModel({
                listError: expectedError,
            });
        const service = new MonthlyMaterialService({
            MonthlyMaterialModel,
        });

        await assert.rejects(
            service.listMonthlyMaterials(),
            expectedError,
        );
    });
});

describe('consulta dos materiais mensais', () => {
    test('consulta pelo mês e devolve a representação pública', async () => {
        const {
            MonthlyMaterialModel,
            calls,
        } = createFakeMonthlyMaterialModel();
        const service = new MonthlyMaterialService({
            MonthlyMaterialModel,
        });

        const result = await service.getMonthlyMaterial('2026-09');

        assert.deepEqual(calls.findOne, [
            { month: '2026-09' },
        ]);
        assert.equal(Object.isFrozen(calls.findOne[0]), true);
        assert.deepEqual(result, {
            id: 'material-mensal-123',
            month: '2026-09',
            lessonPlanUrl: 'https://example.com/pa-setembro',
            studentGuideUrl:
                'https://example.com/gd-ad-setembro',
        });
    });

    test('devolve null quando o mês ainda não possui materiais', async () => {
        const { MonthlyMaterialModel } =
            createFakeMonthlyMaterialModel({
                foundMaterial: null,
            });
        const service = new MonthlyMaterialService({
            MonthlyMaterialModel,
        });

        const result = await service.getMonthlyMaterial('2026-10');

        assert.equal(result, null);
    });

    test('não consulta o modelo quando o mês é inválido', async () => {
        const {
            MonthlyMaterialModel,
            calls,
        } = createFakeMonthlyMaterialModel();
        const service = new MonthlyMaterialService({
            MonthlyMaterialModel,
        });

        await assert.rejects(
            service.getMonthlyMaterial('2026-13'),
            (error) => assertOperationalInputError(
                error,
                MONTHLY_MATERIAL_SERVICE_CODES
                    .INVALID_MONTHLY_MATERIAL_MONTH,
                MONTHLY_MATERIAL_SERVICE_MESSAGES
                    .INVALID_MONTHLY_MATERIAL_MONTH,
            ),
        );

        assert.equal(calls.findOne.length, 0);
    });

    test('propaga uma falha real da consulta', async () => {
        const expectedError = new Error('Falha real de consulta.');
        const { MonthlyMaterialModel } =
            createFakeMonthlyMaterialModel({
                findError: expectedError,
            });
        const service = new MonthlyMaterialService({
            MonthlyMaterialModel,
        });

        await assert.rejects(
            service.getMonthlyMaterial('2026-09'),
            expectedError,
        );
    });

    test('rejeita um documento inconsistente devolvido pelo modelo', async () => {
        const { MonthlyMaterialModel } =
            createFakeMonthlyMaterialModel({
                foundMaterial: { month: '2026-09' },
            });
        const service = new MonthlyMaterialService({
            MonthlyMaterialModel,
        });

        await assert.rejects(
            service.getMonthlyMaterial('2026-09'),
            {
                name: 'TypeError',
                message:
                    MONTHLY_MATERIAL_SERVICE_MESSAGES
                        .INVALID_MONTHLY_MATERIAL_DOCUMENT,
            },
        );
    });
});

describe('gravação dos materiais mensais', () => {
    test('substitui atomicamente os links e devolve o estado público', async () => {
        const {
            MonthlyMaterialModel,
            calls,
        } = createFakeMonthlyMaterialModel();
        const service = new MonthlyMaterialService({
            MonthlyMaterialModel,
        });

        const result = await service.saveMonthlyMaterial(
            '2026-09',
            VALID_MATERIAL_DATA,
        );

        assert.deepEqual(calls.findOneAndUpdate, [
            {
                filter: { month: '2026-09' },
                update: {
                    $set: VALID_MATERIAL_DATA,
                },
                options: MONTHLY_MATERIAL_UPDATE_OPTIONS,
            },
        ]);
        assert.equal(
            Object.isFrozen(
                calls.findOneAndUpdate[0].filter,
            ),
            true,
        );
        assert.equal(
            Object.isFrozen(
                calls.findOneAndUpdate[0].update,
            ),
            true,
        );
        assert.deepEqual(result, {
            id: 'material-mensal-123',
            month: '2026-09',
            lessonPlanUrl: 'https://example.com/pa-setembro',
            studentGuideUrl:
                'https://example.com/gd-ad-setembro',
        });
    });

    test('converte campos omitidos em remoções explícitas', async () => {
        const {
            MonthlyMaterialModel,
            calls,
        } = createFakeMonthlyMaterialModel({
            savedMaterial: createMonthlyMaterialDocument({
                lessonPlanUrl: null,
                studentGuideUrl: null,
            }),
        });
        const service = new MonthlyMaterialService({
            MonthlyMaterialModel,
        });

        const result = await service.saveMonthlyMaterial(
            '2026-09',
            {},
        );

        assert.deepEqual(
            calls.findOneAndUpdate[0].update,
            {
                $set: {
                    lessonPlanUrl: null,
                    studentGuideUrl: null,
                },
            },
        );
        assert.equal(result.lessonPlanUrl, null);
        assert.equal(result.studentGuideUrl, null);
    });

    test('não acessa o modelo quando mês ou dados são inválidos', async () => {
        const {
            MonthlyMaterialModel,
            calls,
        } = createFakeMonthlyMaterialModel();
        const service = new MonthlyMaterialService({
            MonthlyMaterialModel,
        });

        await assert.rejects(
            service.saveMonthlyMaterial(
                '2026-13',
                VALID_MATERIAL_DATA,
            ),
            (error) => assertOperationalInputError(
                error,
                MONTHLY_MATERIAL_SERVICE_CODES
                    .INVALID_MONTHLY_MATERIAL_MONTH,
                MONTHLY_MATERIAL_SERVICE_MESSAGES
                    .INVALID_MONTHLY_MATERIAL_MONTH,
            ),
        );

        await assert.rejects(
            service.saveMonthlyMaterial(
                '2026-09',
                { month: '2026-09' },
            ),
            (error) => assertOperationalInputError(
                error,
                MONTHLY_MATERIAL_SERVICE_CODES
                    .INVALID_MONTHLY_MATERIAL_DATA,
                MONTHLY_MATERIAL_SERVICE_MESSAGES
                    .INVALID_MONTHLY_MATERIAL_DATA,
            ),
        );

        assert.equal(calls.findOneAndUpdate.length, 0);
    });

    test('converte validação do modelo em erro operacional seguro', async () => {
        const validationError = new Error(
            'Detalhe interno da validação.',
        );
        validationError.name = 'ValidationError';

        const { MonthlyMaterialModel } =
            createFakeMonthlyMaterialModel({
                saveError: validationError,
            });
        const service = new MonthlyMaterialService({
            MonthlyMaterialModel,
        });

        await assert.rejects(
            service.saveMonthlyMaterial(
                '2026-09',
                VALID_MATERIAL_DATA,
            ),
            (error) => assertOperationalInputError(
                error,
                MONTHLY_MATERIAL_SERVICE_CODES
                    .INVALID_MONTHLY_MATERIAL_DATA,
                MONTHLY_MATERIAL_SERVICE_MESSAGES
                    .INVALID_MONTHLY_MATERIAL_DATA,
            ),
        );
    });

    test('converte falha de conversão em erro operacional seguro', async () => {
        const castError = new Error(
            'Detalhe interno da conversão.',
        );
        castError.name = 'CastError';

        const { MonthlyMaterialModel } =
            createFakeMonthlyMaterialModel({
                saveError: castError,
            });
        const service = new MonthlyMaterialService({
            MonthlyMaterialModel,
        });

        await assert.rejects(
            service.saveMonthlyMaterial(
                '2026-09',
                VALID_MATERIAL_DATA,
            ),
            (error) => assertOperationalInputError(
                error,
                MONTHLY_MATERIAL_SERVICE_CODES
                    .INVALID_MONTHLY_MATERIAL_DATA,
                MONTHLY_MATERIAL_SERVICE_MESSAGES
                    .INVALID_MONTHLY_MATERIAL_DATA,
            ),
        );
    });

    test('propaga uma falha real ocorrida durante a gravação', async () => {
        const expectedError = new Error('Falha real de gravação.');
        const { MonthlyMaterialModel } =
            createFakeMonthlyMaterialModel({
                saveError: expectedError,
            });
        const service = new MonthlyMaterialService({
            MonthlyMaterialModel,
        });

        await assert.rejects(
            service.saveMonthlyMaterial(
                '2026-09',
                VALID_MATERIAL_DATA,
            ),
            expectedError,
        );
    });

    test('rejeita um documento inconsistente devolvido pela gravação', async () => {
        const { MonthlyMaterialModel } =
            createFakeMonthlyMaterialModel({
                savedMaterial: null,
            });
        const service = new MonthlyMaterialService({
            MonthlyMaterialModel,
        });

        await assert.rejects(
            service.saveMonthlyMaterial(
                '2026-09',
                VALID_MATERIAL_DATA,
            ),
            {
                name: 'TypeError',
                message:
                    MONTHLY_MATERIAL_SERVICE_MESSAGES
                        .INVALID_MONTHLY_MATERIAL_DOCUMENT,
            },
        );
    });
});

describe('exclusão dos materiais mensais', () => {
    test('remove pelo mês e devolve a representação excluída', async () => {
        const {
            MonthlyMaterialModel,
            calls,
        } = createFakeMonthlyMaterialModel();
        const service = new MonthlyMaterialService({
            MonthlyMaterialModel,
        });

        const result = await service.deleteMonthlyMaterial('2026-09');

        assert.deepEqual(calls.findOneAndDelete, [
            { month: '2026-09' },
        ]);
        assert.equal(
            Object.isFrozen(calls.findOneAndDelete[0]),
            true,
        );
        assert.deepEqual(result, {
            id: 'material-mensal-123',
            month: '2026-09',
            lessonPlanUrl: 'https://example.com/pa-setembro',
            studentGuideUrl:
                'https://example.com/gd-ad-setembro',
        });
        assert.equal(Object.isFrozen(result), true);
    });

    test('devolve null quando o mês já não possui material', async () => {
        const { MonthlyMaterialModel } =
            createFakeMonthlyMaterialModel({
                deletedMaterial: null,
            });
        const service = new MonthlyMaterialService({
            MonthlyMaterialModel,
        });

        const result = await service.deleteMonthlyMaterial('2026-10');

        assert.equal(result, null);
    });

    test('não acessa o modelo quando o mês é inválido', async () => {
        const {
            MonthlyMaterialModel,
            calls,
        } = createFakeMonthlyMaterialModel();
        const service = new MonthlyMaterialService({
            MonthlyMaterialModel,
        });

        await assert.rejects(
            service.deleteMonthlyMaterial('2026-13'),
            (error) => assertOperationalInputError(
                error,
                MONTHLY_MATERIAL_SERVICE_CODES
                    .INVALID_MONTHLY_MATERIAL_MONTH,
                MONTHLY_MATERIAL_SERVICE_MESSAGES
                    .INVALID_MONTHLY_MATERIAL_MONTH,
            ),
        );

        assert.equal(calls.findOneAndDelete.length, 0);
    });

    test('propaga uma falha real ocorrida durante a exclusão', async () => {
        const expectedError = new Error('Falha real de exclusão.');
        const { MonthlyMaterialModel } =
            createFakeMonthlyMaterialModel({
                deleteError: expectedError,
            });
        const service = new MonthlyMaterialService({
            MonthlyMaterialModel,
        });

        await assert.rejects(
            service.deleteMonthlyMaterial('2026-09'),
            expectedError,
        );
    });

    test('rejeita um documento inconsistente devolvido pela exclusão', async () => {
        const { MonthlyMaterialModel } =
            createFakeMonthlyMaterialModel({
                deletedMaterial: { month: '2026-09' },
            });
        const service = new MonthlyMaterialService({
            MonthlyMaterialModel,
        });

        await assert.rejects(
            service.deleteMonthlyMaterial('2026-09'),
            {
                name: 'TypeError',
                message:
                    MONTHLY_MATERIAL_SERVICE_MESSAGES
                        .INVALID_MONTHLY_MATERIAL_DOCUMENT,
            },
        );
    });
});
