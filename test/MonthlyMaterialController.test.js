'use strict';

const assert = require('node:assert/strict');
const {
    describe,
    test,
} = require('node:test');

const {
    MONTHLY_MATERIAL_CONTROLLER_ERRORS,
    MonthlyMaterialController,
} = require('../src/controllers/MonthlyMaterialController');

/**
 * Cria um material semelhante ao devolvido pelo serviço.
 *
 * Propriedades adicionais comprovam que o controlador realiza uma segunda
 * seleção defensiva antes de construir a resposta HTTP.
 *
 * @param {object} overrides Campos que serão substituídos.
 * @returns {object} Material mensal controlado.
 */
function createMonthlyMaterial(overrides = {}) {
    return {
        id: 'material-mensal-123',
        month: '2026-09',
        lessonPlanUrl: 'https://example.com/pa-setembro',
        studentGuideUrl: 'https://example.com/gd-ad-setembro',
        _id: 'identificador-interno',
        createdAt: new Date('2026-09-01T12:00:00.000Z'),
        internalValue: 'não deve aparecer na resposta',
        ...overrides,
    };
}

/**
 * Representação exata autorizada nas respostas HTTP.
 *
 * @param {object} overrides Campos públicos que serão substituídos.
 * @returns {object} Material esperado na resposta.
 */
function createExpectedPublicMaterial(overrides = {}) {
    return {
        id: 'material-mensal-123',
        month: '2026-09',
        lessonPlanUrl: 'https://example.com/pa-setembro',
        studentGuideUrl: 'https://example.com/gd-ad-setembro',
        ...overrides,
    };
}

/**
 * Cria um serviço mensal controlado.
 *
 * @param {object} options Comportamento das operações.
 * @param {object|null} options.foundMaterial Resultado da consulta.
 * @param {object} options.savedMaterial Resultado da gravação.
 * @param {Error|null} options.getError Falha opcional da consulta.
 * @param {Error|null} options.saveError Falha opcional da gravação.
 * @returns {{ monthlyMaterialService: object, calls: object }} Dependências.
 */
function createFakeMonthlyMaterialService({
    foundMaterial = createMonthlyMaterial(),
    savedMaterial = createMonthlyMaterial(),
    getError = null,
    saveError = null,
} = {}) {
    const calls = {
        getMonthlyMaterial: [],
        saveMonthlyMaterial: [],
    };

    const monthlyMaterialService = {
        async getMonthlyMaterial(month) {
            calls.getMonthlyMaterial.push(month);

            if (getError) {
                throw getError;
            }

            return foundMaterial;
        },

        async saveMonthlyMaterial(month, materialData) {
            calls.saveMonthlyMaterial.push({
                month,
                materialData,
            });

            if (saveError) {
                throw saveError;
            }

            return savedMaterial;
        },
    };

    return {
        monthlyMaterialService,
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

describe('configuração do MonthlyMaterialController', () => {
    test('expõe mensagens internas estáveis e protegidas', () => {
        assert.deepEqual(MONTHLY_MATERIAL_CONTROLLER_ERRORS, {
            INVALID_MONTHLY_MATERIAL_SERVICE:
                'O controlador exige um serviço de materiais mensais válido.',
            INVALID_MONTHLY_MATERIAL_RESPONSE:
                'O serviço retornou um material mensal inválido.',
        });
        assert.equal(
            Object.isFrozen(MONTHLY_MATERIAL_CONTROLLER_ERRORS),
            true,
        );
    });

    test('cria handlers vinculados e uma instância imutável', () => {
        const { monthlyMaterialService } =
            createFakeMonthlyMaterialService();
        const controller = new MonthlyMaterialController({
            monthlyMaterialService,
        });

        assert.equal(typeof controller.get, 'function');
        assert.equal(typeof controller.save, 'function');
        assert.equal(Object.isFrozen(controller), true);
    });

    test('rejeita serviços mensais inválidos', () => {
        const invalidServices = [
            undefined,
            null,
            false,
            'serviço',
            42,
            [],
            {},
            {
                getMonthlyMaterial: 'não é função',
                saveMonthlyMaterial() {},
            },
            { getMonthlyMaterial() {} },
            {
                getMonthlyMaterial() {},
                saveMonthlyMaterial: 'não é função',
            },
        ];

        for (const monthlyMaterialService of invalidServices) {
            assert.throws(
                () => new MonthlyMaterialController({
                    monthlyMaterialService,
                }),
                {
                    name: 'TypeError',
                    message:
                        MONTHLY_MATERIAL_CONTROLLER_ERRORS
                            .INVALID_MONTHLY_MATERIAL_SERVICE,
                },
            );
        }
    });
});

describe('representação pública do material mensal', () => {
    test('mantém somente identificador, mês e links', () => {
        const receivedMaterial = createMonthlyMaterial();

        const publicMaterial = MonthlyMaterialController
            .createPublicMonthlyMaterial(receivedMaterial);

        assert.deepEqual(
            publicMaterial,
            createExpectedPublicMaterial(),
        );
        assert.equal(Object.isFrozen(publicMaterial), true);
        assert.notStrictEqual(publicMaterial, receivedMaterial);
        assert.equal(Object.hasOwn(publicMaterial, '_id'), false);
        assert.equal(
            Object.hasOwn(publicMaterial, 'createdAt'),
            false,
        );
        assert.equal(
            Object.hasOwn(publicMaterial, 'internalValue'),
            false,
        );
    });

    test('aceita os dois links representados por null', () => {
        const publicMaterial = MonthlyMaterialController
            .createPublicMonthlyMaterial(
                createMonthlyMaterial({
                    lessonPlanUrl: null,
                    studentGuideUrl: null,
                }),
            );

        assert.deepEqual(
            publicMaterial,
            createExpectedPublicMaterial({
                lessonPlanUrl: null,
                studentGuideUrl: null,
            }),
        );
    });

    test('rejeita materiais incompletos ou estruturalmente inválidos', () => {
        const invalidMaterials = [
            null,
            {},
            createMonthlyMaterial({ id: '' }),
            createMonthlyMaterial({ id: 42 }),
            createMonthlyMaterial({ month: '' }),
            createMonthlyMaterial({ month: null }),
            createMonthlyMaterial({ lessonPlanUrl: 42 }),
            createMonthlyMaterial({ studentGuideUrl: {} }),
        ];

        for (const material of invalidMaterials) {
            assert.throws(
                () => MonthlyMaterialController
                    .createPublicMonthlyMaterial(material),
                {
                    name: 'TypeError',
                    message:
                        MONTHLY_MATERIAL_CONTROLLER_ERRORS
                            .INVALID_MONTHLY_MATERIAL_RESPONSE,
                },
            );
        }
    });
});

describe('consulta mensal pelo controlador', () => {
    test('encaminha o mês e responde 200 com o material público', async () => {
        const {
            monthlyMaterialService,
            calls: serviceCalls,
        } = createFakeMonthlyMaterialService();
        const controller = new MonthlyMaterialController({
            monthlyMaterialService,
        });
        const {
            response,
            calls: responseCalls,
        } = createFakeResponse();
        const { next, calls: nextCalls } = createNextRecorder();

        await controller.get(
            { params: { month: '2026-09' } },
            response,
            next,
        );

        assert.deepEqual(
            serviceCalls.getMonthlyMaterial,
            ['2026-09'],
        );
        assert.deepEqual(responseCalls.status, [200]);
        assert.deepEqual(responseCalls.json, [
            {
                data: {
                    material: createExpectedPublicMaterial(),
                },
            },
        ]);
        assert.deepEqual(nextCalls, []);
    });

    test('responde normalmente quando o mês não possui material', async () => {
        const { monthlyMaterialService } =
            createFakeMonthlyMaterialService({
                foundMaterial: null,
            });
        const controller = new MonthlyMaterialController({
            monthlyMaterialService,
        });
        const {
            response,
            calls: responseCalls,
        } = createFakeResponse();
        const { next, calls: nextCalls } = createNextRecorder();

        await controller.get(
            { params: { month: '2026-10' } },
            response,
            next,
        );

        assert.deepEqual(responseCalls.status, [200]);
        assert.deepEqual(responseCalls.json, [
            {
                data: {
                    material: null,
                },
            },
        ]);
        assert.deepEqual(nextCalls, []);
    });

    test('mantém o contexto quando o handler é extraído', async () => {
        const { monthlyMaterialService, calls } =
            createFakeMonthlyMaterialService({
                foundMaterial: null,
            });
        const controller = new MonthlyMaterialController({
            monthlyMaterialService,
        });
        const get = controller.get;
        const { response } = createFakeResponse();
        const { next, calls: nextCalls } = createNextRecorder();

        await get(
            { params: { month: '2026-09' } },
            response,
            next,
        );

        assert.deepEqual(calls.getMonthlyMaterial, ['2026-09']);
        assert.deepEqual(nextCalls, []);
    });

    test('encaminha uma falha do serviço sem iniciar a resposta', async () => {
        const expectedError = new Error('Falha controlada.');
        const { monthlyMaterialService } =
            createFakeMonthlyMaterialService({
                getError: expectedError,
            });
        const controller = new MonthlyMaterialController({
            monthlyMaterialService,
        });
        const { response, calls: responseCalls } =
            createFakeResponse();
        const { next, calls: nextCalls } = createNextRecorder();

        await controller.get(
            { params: { month: '2026-09' } },
            response,
            next,
        );

        assert.deepEqual(responseCalls.status, []);
        assert.deepEqual(responseCalls.json, []);
        assert.deepEqual(nextCalls, [expectedError]);
    });

    test('encaminha um material inválido sem enviá-lo ao cliente', async () => {
        const { monthlyMaterialService } =
            createFakeMonthlyMaterialService({
                foundMaterial: { id: 'incompleto' },
            });
        const controller = new MonthlyMaterialController({
            monthlyMaterialService,
        });
        const { response, calls: responseCalls } =
            createFakeResponse();
        const { next, calls: nextCalls } = createNextRecorder();

        await controller.get(
            { params: { month: '2026-09' } },
            response,
            next,
        );

        assert.deepEqual(responseCalls.status, []);
        assert.deepEqual(responseCalls.json, []);
        assert.equal(nextCalls.length, 1);
        assert.equal(nextCalls[0] instanceof TypeError, true);
        assert.equal(nextCalls[0].name, 'TypeError');
        assert.equal(
            nextCalls[0].message,
            MONTHLY_MATERIAL_CONTROLLER_ERRORS
                .INVALID_MONTHLY_MATERIAL_RESPONSE,
        );
    });

    test('encaminha uma falha produzida pela resposta HTTP', async () => {
        const expectedError = new Error('Falha ao produzir JSON.');
        const { monthlyMaterialService } =
            createFakeMonthlyMaterialService();
        const controller = new MonthlyMaterialController({
            monthlyMaterialService,
        });
        const { response } = createFakeResponse({
            jsonError: expectedError,
        });
        const { next, calls: nextCalls } = createNextRecorder();

        await controller.get(
            { params: { month: '2026-09' } },
            response,
            next,
        );

        assert.deepEqual(nextCalls, [expectedError]);
    });
});

describe('gravação mensal pelo controlador', () => {
    test('encaminha mês e corpo e responde 200 com o estado público', async () => {
        const {
            monthlyMaterialService,
            calls: serviceCalls,
        } = createFakeMonthlyMaterialService();
        const controller = new MonthlyMaterialController({
            monthlyMaterialService,
        });
        const {
            response,
            calls: responseCalls,
        } = createFakeResponse();
        const { next, calls: nextCalls } = createNextRecorder();
        const body = {
            lessonPlanUrl: 'https://example.com/pa-setembro',
            studentGuideUrl:
                'https://example.com/gd-ad-setembro',
        };

        await controller.save(
            {
                params: { month: '2026-09' },
                body,
            },
            response,
            next,
        );

        assert.deepEqual(serviceCalls.saveMonthlyMaterial, [
            {
                month: '2026-09',
                materialData: body,
            },
        ]);
        assert.deepEqual(responseCalls.status, [200]);
        assert.deepEqual(responseCalls.json, [
            {
                data: {
                    material: createExpectedPublicMaterial(),
                },
            },
        ]);
        assert.deepEqual(nextCalls, []);
    });

    test('mantém o contexto quando o handler é extraído', async () => {
        const { monthlyMaterialService, calls } =
            createFakeMonthlyMaterialService();
        const controller = new MonthlyMaterialController({
            monthlyMaterialService,
        });
        const save = controller.save;
        const { response } = createFakeResponse();
        const { next, calls: nextCalls } = createNextRecorder();
        const body = {};

        await save(
            {
                params: { month: '2026-09' },
                body,
            },
            response,
            next,
        );

        assert.deepEqual(calls.saveMonthlyMaterial, [
            {
                month: '2026-09',
                materialData: body,
            },
        ]);
        assert.deepEqual(nextCalls, []);
    });

    test('encaminha uma falha do serviço sem iniciar a resposta', async () => {
        const expectedError = new Error('Falha controlada.');
        const { monthlyMaterialService } =
            createFakeMonthlyMaterialService({
                saveError: expectedError,
            });
        const controller = new MonthlyMaterialController({
            monthlyMaterialService,
        });
        const { response, calls: responseCalls } =
            createFakeResponse();
        const { next, calls: nextCalls } = createNextRecorder();

        await controller.save(
            {
                params: { month: '2026-09' },
                body: {},
            },
            response,
            next,
        );

        assert.deepEqual(responseCalls.status, []);
        assert.deepEqual(responseCalls.json, []);
        assert.deepEqual(nextCalls, [expectedError]);
    });

    test('encaminha um material inválido sem enviá-lo ao cliente', async () => {
        const { monthlyMaterialService } =
            createFakeMonthlyMaterialService({
                savedMaterial: { id: 'incompleto' },
            });
        const controller = new MonthlyMaterialController({
            monthlyMaterialService,
        });
        const { response, calls: responseCalls } =
            createFakeResponse();
        const { next, calls: nextCalls } = createNextRecorder();

        await controller.save(
            {
                params: { month: '2026-09' },
                body: {},
            },
            response,
            next,
        );

        assert.deepEqual(responseCalls.status, []);
        assert.deepEqual(responseCalls.json, []);
        assert.equal(nextCalls.length, 1);
        assert.equal(nextCalls[0] instanceof TypeError, true);
        assert.equal(nextCalls[0].name, 'TypeError');
        assert.equal(
            nextCalls[0].message,
            MONTHLY_MATERIAL_CONTROLLER_ERRORS
                .INVALID_MONTHLY_MATERIAL_RESPONSE,
        );
    });

    test('encaminha uma falha produzida pela resposta HTTP', async () => {
        const expectedError = new Error('Falha ao produzir JSON.');
        const { monthlyMaterialService } =
            createFakeMonthlyMaterialService();
        const controller = new MonthlyMaterialController({
            monthlyMaterialService,
        });
        const { response } = createFakeResponse({
            statusError: expectedError,
        });
        const { next, calls: nextCalls } = createNextRecorder();

        await controller.save(
            {
                params: { month: '2026-09' },
                body: {},
            },
            response,
            next,
        );

        assert.deepEqual(nextCalls, [expectedError]);
    });
});
