'use strict';

const assert = require('node:assert/strict');
const http = require('node:http');
const {
    describe,
    test,
} = require('node:test');

const { createApp } = require('../src/app');
const {
    MonthlyMaterialController,
} = require('../src/controllers/MonthlyMaterialController');
const {
    ADMINISTRATIVE_AUTHORIZATION_CODES,
    ADMINISTRATIVE_AUTHORIZATION_ERRORS,
} = require('../src/middlewares/administrativeAuthorization');
const {
    USER_ROLES,
} = require('../src/models/User');
const {
    createMonthlyMaterialRouter,
} = require('../src/routes/monthlyMaterialRoutes');
const {
    MONTHLY_MATERIAL_SERVICE_CODES,
    MONTHLY_MATERIAL_SERVICE_MESSAGES,
    MONTHLY_MATERIAL_SORT,
    MONTHLY_MATERIAL_UPDATE_OPTIONS,
    MonthlyMaterialService,
} = require('../src/services/MonthlyMaterialService');
const {
    SESSION_AUTHENTICATION_KEY,
} = require('../src/services/SessionManager');

/**
 * Identidade administrativa mantida somente pela sessão simulada.
 *
 * O middleware real de autorização continua responsável por ler e validar a
 * estrutura antes que qualquer operação mensal alcance o serviço.
 */
const ADMINISTRATIVE_AUTHENTICATION = Object.freeze({
    userId: 'administrador-1',
    role: USER_ROLES.ADMIN,
});

/**
 * Inicia uma aplicação em porta efêmera e garante seu encerramento.
 *
 * @param {Function} app Aplicação Express.
 * @param {Function} callback Operação HTTP que utilizará a aplicação.
 * @returns {Promise<void>}
 */
async function listenTemporarily(app, callback) {
    const server = http.createServer(app);

    await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
    });

    try {
        const address = server.address();

        await callback(`http://127.0.0.1:${address.port}`);
    } finally {
        await new Promise((resolve, reject) => {
            server.close((error) => {
                if (error) {
                    reject(error);
                    return;
                }

                resolve();
            });
        });
    }
}

/**
 * Produz um documento semelhante ao devolvido pelo Mongoose.
 *
 * Campos privados adicionais comprovam que serviço e controlador selecionam
 * novamente somente os quatro campos públicos mensais.
 *
 * @param {object} overrides Valores específicos do cenário.
 * @returns {object} Documento controlado.
 */
function createMonthlyMaterialDocument(overrides = {}) {
    return {
        _id: 'monthly-material-1',
        month: '2026-09',
        lessonPlanUrl: 'https://example.com/pa-setembro',
        studentGuideUrl: 'https://example.com/gd-ad-setembro',
        createdAt: new Date('2026-09-01T12:00:00.000Z'),
        updatedAt: new Date('2026-09-16T12:00:00.000Z'),
        internalNote: 'não deve atravessar a API',
        ...overrides,
    };
}

/**
 * Cria um modelo observável com o contrato usado pelo serviço mensal.
 *
 * O modelo não reproduz o Mongoose. Ele representa somente sua fronteira para
 * manter o teste HTTP rápido, determinístico e independente do banco.
 *
 * @param {object} options Comportamentos do modelo.
 * @param {Array} [options.listedMaterials] Resultado da listagem.
 * @param {object|null} [options.foundMaterial] Resultado da consulta.
 * @param {object|null} [options.savedMaterial] Resultado da gravação.
 * @param {object|null} [options.deletedMaterial] Resultado da exclusão.
 * @param {Error|null} [options.listError] Falha da listagem.
 * @param {Error|null} [options.findError] Falha da consulta.
 * @param {Error|null} [options.saveError] Falha da gravação.
 * @param {Error|null} [options.deleteError] Falha da exclusão.
 * @returns {{ MonthlyMaterialModel: object, calls: object }} Dependências.
 */
function createFakeMonthlyMaterialModel({
    listedMaterials = [],
    foundMaterial = null,
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
 * Compõe a cadeia real da API mensal com sessão e modelo controlados.
 *
 * Permanecem reais: Express, parser JSON, tratamento de erros, autorização,
 * roteador, controlador e serviço. Somente sessão persistente e MongoDB são
 * substituídos porque possuem suítes próprias.
 *
 * @param {object} options Dependências do cenário.
 * @param {object} options.MonthlyMaterialModel Modelo observável.
 * @param {object|undefined} [options.authentication] Identidade da sessão.
 * @param {object} [options.logger] Logger do tratamento central.
 * @returns {Function} Aplicação Express pronta para o teste HTTP.
 */
function createMonthlyMaterialTestApp({
    MonthlyMaterialModel,
    authentication,
    logger = {
        error() {},
    },
}) {
    const monthlyMaterialService = new MonthlyMaterialService({
        MonthlyMaterialModel,
    });

    const controller = new MonthlyMaterialController({
        monthlyMaterialService,
    });

    const monthlyMaterialRouter = createMonthlyMaterialRouter({
        controller,
    });

    function sessionMiddleware(request, response, next) {
        request.session = {};

        if (authentication !== undefined) {
            request.session[SESSION_AUTHENTICATION_KEY] =
                authentication;
        }

        next();
    }

    return createApp({
        logger,
        sessionMiddleware,
        monthlyMaterialRouter,
    });
}

describe('integração HTTP administrativa dos materiais mensais', () => {
    test(
        'recusa consulta sem autenticação antes de acessar o modelo',
        async () => {
            const { MonthlyMaterialModel, calls } =
                createFakeMonthlyMaterialModel();
            const app = createMonthlyMaterialTestApp({
                MonthlyMaterialModel,
                authentication: undefined,
            });

            await listenTemporarily(app, async (baseUrl) => {
                const response = await fetch(
                    `${baseUrl}/api/monthly-materials/2026-09`,
                );
                const body = await response.json();

                assert.equal(response.status, 401);
                assert.deepEqual(body, {
                    error: {
                        code:
                            ADMINISTRATIVE_AUTHORIZATION_CODES
                                .AUTHENTICATION_REQUIRED,
                        message:
                            ADMINISTRATIVE_AUTHORIZATION_ERRORS
                                .AUTHENTICATION_REQUIRED,
                    },
                });
            });

            assert.equal(calls.findOne.length, 0);
        },
    );

    test(
        'recusa papel não administrativo antes de gravar materiais',
        async () => {
            const { MonthlyMaterialModel, calls } =
                createFakeMonthlyMaterialModel();
            const app = createMonthlyMaterialTestApp({
                MonthlyMaterialModel,
                authentication: {
                    userId: 'usuario-1',
                    role: 'viewer',
                },
            });

            await listenTemporarily(app, async (baseUrl) => {
                const response = await fetch(
                    `${baseUrl}/api/monthly-materials/2026-09`,
                    {
                        method: 'PUT',
                        headers: {
                            'content-type': 'application/json',
                        },
                        body: JSON.stringify({}),
                    },
                );
                const body = await response.json();

                assert.equal(response.status, 403);
                assert.deepEqual(body, {
                    error: {
                        code:
                            ADMINISTRATIVE_AUTHORIZATION_CODES
                                .ADMINISTRATIVE_ACCESS_REQUIRED,
                        message:
                            ADMINISTRATIVE_AUTHORIZATION_ERRORS
                                .ADMINISTRATIVE_ACCESS_REQUIRED,
                    },
                });
            });

            assert.equal(calls.findOneAndUpdate.length, 0);
        },
    );

    test(
        'representa normalmente um mês ainda sem materiais',
        async () => {
            const { MonthlyMaterialModel, calls } =
                createFakeMonthlyMaterialModel({
                    foundMaterial: null,
                });
            const app = createMonthlyMaterialTestApp({
                MonthlyMaterialModel,
                authentication: ADMINISTRATIVE_AUTHENTICATION,
            });

            await listenTemporarily(app, async (baseUrl) => {
                const response = await fetch(
                    `${baseUrl}/api/monthly-materials/2026-10`,
                );
                const body = await response.json();

                assert.equal(response.status, 200);
                assert.deepEqual(body, {
                    data: {
                        material: null,
                    },
                });
            });

            assert.deepEqual(calls.findOne, [
                { month: '2026-10' },
            ]);
        },
    );

    test(
        'consulta um material e responde somente com campos públicos',
        async () => {
            const document = createMonthlyMaterialDocument();
            const { MonthlyMaterialModel, calls } =
                createFakeMonthlyMaterialModel({
                    foundMaterial: document,
                });
            const app = createMonthlyMaterialTestApp({
                MonthlyMaterialModel,
                authentication: ADMINISTRATIVE_AUTHENTICATION,
            });

            await listenTemporarily(app, async (baseUrl) => {
                const response = await fetch(
                    `${baseUrl}/api/monthly-materials/2026-09`,
                );
                const body = await response.json();

                assert.equal(response.status, 200);
                assert.deepEqual(body, {
                    data: {
                        material: {
                            id: 'monthly-material-1',
                            month: '2026-09',
                            lessonPlanUrl:
                                'https://example.com/pa-setembro',
                            studentGuideUrl:
                                'https://example.com/gd-ad-setembro',
                        },
                    },
                });
                assert.equal(
                    JSON.stringify(body).includes('internalNote'),
                    false,
                );
                assert.equal(
                    JSON.stringify(body).includes('createdAt'),
                    false,
                );
            });

            assert.deepEqual(calls.findOne, [
                { month: '2026-09' },
            ]);
        },
    );

    test(
        'grava os links pela cadeia completa e devolve o estado público',
        async () => {
            const materialData = {
                lessonPlanUrl:
                    'https://example.com/pa-setembro',
                studentGuideUrl:
                    'https://example.com/gd-ad-setembro',
            };
            const savedMaterial = createMonthlyMaterialDocument();
            const { MonthlyMaterialModel, calls } =
                createFakeMonthlyMaterialModel({
                    savedMaterial,
                });
            const app = createMonthlyMaterialTestApp({
                MonthlyMaterialModel,
                authentication: ADMINISTRATIVE_AUTHENTICATION,
            });

            await listenTemporarily(app, async (baseUrl) => {
                const response = await fetch(
                    `${baseUrl}/api/monthly-materials/2026-09`,
                    {
                        method: 'PUT',
                        headers: {
                            'content-type': 'application/json',
                        },
                        body: JSON.stringify(materialData),
                    },
                );
                const body = await response.json();

                assert.equal(response.status, 200);
                assert.deepEqual(body, {
                    data: {
                        material: {
                            id: 'monthly-material-1',
                            month: '2026-09',
                            ...materialData,
                        },
                    },
                });
            });

            assert.deepEqual(calls.findOneAndUpdate, [
                {
                    filter: { month: '2026-09' },
                    update: {
                        $set: materialData,
                    },
                    options: MONTHLY_MATERIAL_UPDATE_OPTIONS,
                },
            ]);
        },
    );

    test(
        'lista os materiais em ordem e somente com campos públicos',
        async () => {
            const listedMaterials = [
                createMonthlyMaterialDocument({
                    _id: 'monthly-material-2',
                    month: '2026-10',
                }),
                createMonthlyMaterialDocument(),
            ];
            const { MonthlyMaterialModel, calls } =
                createFakeMonthlyMaterialModel({ listedMaterials });
            const app = createMonthlyMaterialTestApp({
                MonthlyMaterialModel,
                authentication: ADMINISTRATIVE_AUTHENTICATION,
            });

            await listenTemporarily(app, async (baseUrl) => {
                const response = await fetch(
                    `${baseUrl}/api/monthly-materials`,
                );
                const body = await response.json();

                assert.equal(response.status, 200);
                assert.deepEqual(
                    body.data.materials.map((material) => (
                        material.month
                    )),
                    ['2026-10', '2026-09'],
                );
                assert.deepEqual(
                    Object.keys(body.data.materials[0]),
                    [
                        'id',
                        'month',
                        'lessonPlanUrl',
                        'studentGuideUrl',
                    ],
                );
                assert.equal(
                    JSON.stringify(body).includes('internalNote'),
                    false,
                );
            });

            assert.deepEqual(calls.find, [{}]);
            assert.deepEqual(calls.sort, [MONTHLY_MATERIAL_SORT]);
        },
    );

    test(
        'exclui um material pela cadeia completa sem devolver corpo',
        async () => {
            const { MonthlyMaterialModel, calls } =
                createFakeMonthlyMaterialModel();
            const app = createMonthlyMaterialTestApp({
                MonthlyMaterialModel,
                authentication: ADMINISTRATIVE_AUTHENTICATION,
            });

            await listenTemporarily(app, async (baseUrl) => {
                const response = await fetch(
                    `${baseUrl}/api/monthly-materials/2026-09`,
                    { method: 'DELETE' },
                );

                assert.equal(response.status, 204);
                assert.equal(await response.text(), '');
            });

            assert.deepEqual(calls.findOneAndDelete, [
                { month: '2026-09' },
            ]);
        },
    );

    test(
        'mantém a exclusão idempotente quando o mês não existe',
        async () => {
            const { MonthlyMaterialModel, calls } =
                createFakeMonthlyMaterialModel({
                    deletedMaterial: null,
                });
            const app = createMonthlyMaterialTestApp({
                MonthlyMaterialModel,
                authentication: ADMINISTRATIVE_AUTHENTICATION,
            });

            await listenTemporarily(app, async (baseUrl) => {
                const response = await fetch(
                    `${baseUrl}/api/monthly-materials/2026-10`,
                    { method: 'DELETE' },
                );

                assert.equal(response.status, 204);
                assert.equal(await response.text(), '');
            });

            assert.deepEqual(calls.findOneAndDelete, [
                { month: '2026-10' },
            ]);
        },
    );

    test(
        'recusa exclusão sem autenticação antes de acessar o modelo',
        async () => {
            const { MonthlyMaterialModel, calls } =
                createFakeMonthlyMaterialModel();
            const app = createMonthlyMaterialTestApp({
                MonthlyMaterialModel,
                authentication: undefined,
            });

            await listenTemporarily(app, async (baseUrl) => {
                const response = await fetch(
                    `${baseUrl}/api/monthly-materials/2026-09`,
                    { method: 'DELETE' },
                );
                const body = await response.json();

                assert.equal(response.status, 401);
                assert.equal(
                    body.error.code,
                    ADMINISTRATIVE_AUTHORIZATION_CODES
                        .AUTHENTICATION_REQUIRED,
                );
            });

            assert.equal(calls.findOneAndDelete.length, 0);
        },
    );

    test(
        'rejeita um mês inválido antes de consultar o modelo',
        async () => {
            const { MonthlyMaterialModel, calls } =
                createFakeMonthlyMaterialModel();
            const app = createMonthlyMaterialTestApp({
                MonthlyMaterialModel,
                authentication: ADMINISTRATIVE_AUTHENTICATION,
            });

            await listenTemporarily(app, async (baseUrl) => {
                const response = await fetch(
                    `${baseUrl}/api/monthly-materials/2026-13`,
                );
                const body = await response.json();

                assert.equal(response.status, 400);
                assert.deepEqual(body, {
                    error: {
                        code:
                            MONTHLY_MATERIAL_SERVICE_CODES
                                .INVALID_MONTHLY_MATERIAL_MONTH,
                        message:
                            MONTHLY_MATERIAL_SERVICE_MESSAGES
                                .INVALID_MONTHLY_MATERIAL_MONTH,
                    },
                });
            });

            assert.equal(calls.findOne.length, 0);
        },
    );

    test(
        'rejeita campos desconhecidos antes de gravar no modelo',
        async () => {
            const { MonthlyMaterialModel, calls } =
                createFakeMonthlyMaterialModel();
            const app = createMonthlyMaterialTestApp({
                MonthlyMaterialModel,
                authentication: ADMINISTRATIVE_AUTHENTICATION,
            });

            await listenTemporarily(app, async (baseUrl) => {
                const response = await fetch(
                    `${baseUrl}/api/monthly-materials/2026-09`,
                    {
                        method: 'PUT',
                        headers: {
                            'content-type': 'application/json',
                        },
                        body: JSON.stringify({
                            month: '2026-09',
                        }),
                    },
                );
                const body = await response.json();

                assert.equal(response.status, 400);
                assert.deepEqual(body, {
                    error: {
                        code:
                            MONTHLY_MATERIAL_SERVICE_CODES
                                .INVALID_MONTHLY_MATERIAL_DATA,
                        message:
                            MONTHLY_MATERIAL_SERVICE_MESSAGES
                                .INVALID_MONTHLY_MATERIAL_DATA,
                    },
                });
            });

            assert.equal(calls.findOneAndUpdate.length, 0);
        },
    );

    test(
        'transforma validação do modelo em resposta segura de cliente',
        async () => {
            const validationError = new Error(
                'lessonPlanUrl: detalhe interno rejeitado',
            );
            validationError.name = 'ValidationError';

            const { MonthlyMaterialModel, calls } =
                createFakeMonthlyMaterialModel({
                    saveError: validationError,
                });
            const app = createMonthlyMaterialTestApp({
                MonthlyMaterialModel,
                authentication: ADMINISTRATIVE_AUTHENTICATION,
            });

            await listenTemporarily(app, async (baseUrl) => {
                const response = await fetch(
                    `${baseUrl}/api/monthly-materials/2026-09`,
                    {
                        method: 'PUT',
                        headers: {
                            'content-type': 'application/json',
                        },
                        body: JSON.stringify({
                            lessonPlanUrl: 'ftp://example.com/pa',
                        }),
                    },
                );
                const body = await response.json();

                assert.equal(response.status, 400);
                assert.deepEqual(body, {
                    error: {
                        code:
                            MONTHLY_MATERIAL_SERVICE_CODES
                                .INVALID_MONTHLY_MATERIAL_DATA,
                        message:
                            MONTHLY_MATERIAL_SERVICE_MESSAGES
                                .INVALID_MONTHLY_MATERIAL_DATA,
                    },
                });
                assert.equal(
                    JSON.stringify(body).includes(
                        validationError.message,
                    ),
                    false,
                );
            });

            assert.equal(calls.findOneAndUpdate.length, 1);
        },
    );

    test(
        'oculta uma falha inesperada da consulta e a registra no servidor',
        async () => {
            const databaseError = new Error(
                'MongoDB interno indisponível em mongodb://segredo',
            );
            const { MonthlyMaterialModel, calls } =
                createFakeMonthlyMaterialModel({
                    findError: databaseError,
                });
            const logEntries = [];
            const logger = {
                error(...argumentsReceived) {
                    logEntries.push(argumentsReceived);
                },
            };
            const app = createMonthlyMaterialTestApp({
                MonthlyMaterialModel,
                authentication: ADMINISTRATIVE_AUTHENTICATION,
                logger,
            });

            await listenTemporarily(app, async (baseUrl) => {
                const response = await fetch(
                    `${baseUrl}/api/monthly-materials/2026-09`,
                );
                const body = await response.json();

                assert.equal(response.status, 500);
                assert.deepEqual(body, {
                    error: {
                        code: 'INTERNAL_ERROR',
                        message:
                            'Não foi possível concluir a operação.',
                    },
                });
                assert.equal(
                    JSON.stringify(body).includes(
                        databaseError.message,
                    ),
                    false,
                );
            });

            assert.equal(calls.findOne.length, 1);
            assert.equal(logEntries.length, 1);
            assert.equal(
                JSON.stringify(logEntries).includes(
                    databaseError.message,
                ),
                true,
            );
        },
    );
});
