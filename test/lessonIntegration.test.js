'use strict';

const assert = require('node:assert/strict');
const http = require('node:http');
const {
    describe,
    test,
} = require('node:test');

const { createApp } = require('../src/app');
const {
    LessonController,
} = require('../src/controllers/LessonController');
const {
    ADMINISTRATIVE_AUTHORIZATION_CODES,
    ADMINISTRATIVE_AUTHORIZATION_ERRORS,
} = require('../src/middlewares/administrativeAuthorization');
const {
    USER_ROLES,
} = require('../src/models/User');
const {
    createLessonRouter,
} = require('../src/routes/lessonRoutes');
const {
    LESSON_LIST_SORT,
    LESSON_SERVICE_CODES,
    LESSON_SERVICE_MESSAGES,
    LessonService,
} = require('../src/services/LessonService');
const {
    SESSION_AUTHENTICATION_KEY,
} = require('../src/services/SessionManager');

/**
 * Identidade administrativa utilizada somente pelo armazenamento de sessão
 * simulado. O middleware real de autorização continua responsável por ler e
 * validar essa estrutura antes que uma rota de aulas possa ser executada.
 */
const ADMINISTRATIVE_AUTHENTICATION = Object.freeze({
    userId: 'administrador-1',
    role: USER_ROLES.ADMIN,
});

/**
 * Inicia uma aplicação em uma porta efêmera e garante seu encerramento.
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
 * Propriedades privadas adicionais comprovam que serviço e controlador
 * selecionam novamente somente os campos públicos do calendário.
 *
 * @param {object} overrides Valores específicos do cenário.
 * @returns {object} Documento controlado.
 */
function createLessonDocument(overrides = {}) {
    return {
        _id: 'lesson-1',
        date: '2026-09-18',
        course: 'APQSA',
        curricularUnit: 'Qualidade de Software',
        type: 'Aula',
        lessonNumber: '12',
        needsReview: false,
        lessonPlanUrl: null,
        studentGuideUrl: null,
        createdAt: new Date('2026-09-15T12:00:00.000Z'),
        internalNote: 'não deve atravessar a API',
        ...overrides,
    };
}

/**
 * Cria um modelo observável com o mesmo contrato usado por LessonService.
 *
 * Ele não tenta reproduzir o Mongoose. Apenas representa sua fronteira para
 * que o teste HTTP permaneça rápido, determinístico e independente do banco.
 *
 * @param {object} options Comportamentos do modelo.
 * @param {object[]} [options.lessons] Resultado da consulta.
 * @param {object} [options.createdLesson] Resultado da criação.
 * @param {Error | null} [options.createError] Falha da criação.
 * @param {Error | null} [options.sortError] Falha da consulta ordenada.
 * @returns {{ LessonModel: object, calls: object }} Modelo e chamadas.
 */
function createFakeLessonModel({
    lessons = [],
    createdLesson = createLessonDocument(),
    createError = null,
    sortError = null,
} = {}) {
    const calls = {
        create: [],
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

        find(filter) {
            calls.find.push(filter);

            return {
                async sort(sortDefinition) {
                    calls.sort.push(sortDefinition);

                    if (sortError) {
                        throw sortError;
                    }

                    return lessons;
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
 * Compõe a cadeia real da API de aulas com uma sessão e um modelo controlados.
 *
 * Permanecem reais: Express, parser JSON, tratamento de erros, autorização,
 * roteador, controlador e serviço. Somente sessão persistente e MongoDB são
 * substituídos porque já possuem testes próprios.
 *
 * @param {object} options Dependências do cenário.
 * @param {object} options.LessonModel Modelo observável.
 * @param {object | undefined} [options.authentication]
 * Identidade que será colocada na sessão.
 * @param {object} [options.logger] Logger do tratamento central.
 * @returns {Function} Aplicação Express pronta para o teste HTTP.
 */
function createLessonTestApp({
    LessonModel,
    authentication,
    logger = {
        error() {},
    },
}) {
    const lessonService = new LessonService({
        LessonModel,
    });

    const controller = new LessonController({
        lessonService,
    });

    const lessonRouter = createLessonRouter({
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
        lessonRouter,
    });
}

describe('integração HTTP administrativa das aulas', () => {
    test(
        'recusa consulta sem autenticação antes de acessar o modelo',
        async () => {
            const { LessonModel, calls } =
                createFakeLessonModel();
            const app = createLessonTestApp({
                LessonModel,
                authentication: undefined,
            });

            await listenTemporarily(app, async (baseUrl) => {
                const response = await fetch(
                    `${baseUrl}/api/lessons`,
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

            assert.equal(calls.find.length, 0);
            assert.equal(calls.sort.length, 0);
        },
    );

    test(
        'recusa papel não administrativo antes de criar uma aula',
        async () => {
            const { LessonModel, calls } =
                createFakeLessonModel();
            const app = createLessonTestApp({
                LessonModel,
                authentication: {
                    userId: 'usuario-1',
                    role: 'viewer',
                },
            });

            await listenTemporarily(app, async (baseUrl) => {
                const response = await fetch(
                    `${baseUrl}/api/lessons`,
                    {
                        method: 'POST',
                        headers: {
                            'content-type': 'application/json',
                        },
                        body: JSON.stringify({
                            date: '2026-09-18',
                        }),
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

            assert.equal(calls.create.length, 0);
        },
    );

    test(
        'consulta com filtros e ordenação pela cadeia HTTP completa',
        async () => {
            const documents = [
                createLessonDocument({
                    _id: 'lesson-2',
                    date: '2026-09-20',
                    curricularUnit: 'Testes Automatizados',
                }),
                createLessonDocument({
                    _id: 'lesson-3',
                    date: '2026-09-22',
                    curricularUnit: 'Integração Contínua',
                    lessonNumber: null,
                    needsReview: true,
                }),
            ];
            const { LessonModel, calls } =
                createFakeLessonModel({
                    lessons: documents,
                });
            const app = createLessonTestApp({
                LessonModel,
                authentication: ADMINISTRATIVE_AUTHENTICATION,
            });

            await listenTemporarily(app, async (baseUrl) => {
                const parameters = new URLSearchParams({
                    course: 'APQSA',
                    month: '2026-09',
                    fromDate: '2026-09-15',
                });
                const response = await fetch(
                    `${baseUrl}/api/lessons?${parameters}`,
                );
                const body = await response.json();

                assert.equal(response.status, 200);
                assert.deepEqual(body, {
                    data: {
                        lessons: [
                            {
                                id: 'lesson-2',
                                date: '2026-09-20',
                                course: 'APQSA',
                                curricularUnit:
                                    'Testes Automatizados',
                                type: 'Aula',
                                lessonNumber: '12',
                                needsReview: false,
                                lessonPlanUrl: null,
                                studentGuideUrl: null,
                            },
                            {
                                id: 'lesson-3',
                                date: '2026-09-22',
                                course: 'APQSA',
                                curricularUnit:
                                    'Integração Contínua',
                                type: 'Aula',
                                lessonNumber: null,
                                needsReview: true,
                                lessonPlanUrl: null,
                                studentGuideUrl: null,
                            },
                        ],
                    },
                });

                assert.equal(
                    JSON.stringify(body).includes('internalNote'),
                    false,
                );
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
            assert.deepEqual(calls.sort, [LESSON_LIST_SORT]);
        },
    );

    test(
        'cria uma aula autorizada e responde somente com campos públicos',
        async () => {
            const createdLesson = createLessonDocument({
                _id: 'lesson-created',
                lessonPlanUrl:
                    'https://example.com/plano-aula.pdf',
            });
            const { LessonModel, calls } =
                createFakeLessonModel({
                    createdLesson,
                });
            const app = createLessonTestApp({
                LessonModel,
                authentication: ADMINISTRATIVE_AUTHENTICATION,
            });
            const lessonData = {
                date: '2026-09-18',
                course: 'APQSA',
                curricularUnit: 'Qualidade de Software',
                type: 'Aula',
                lessonNumber: '12',
                needsReview: false,
                lessonPlanUrl:
                    'https://example.com/plano-aula.pdf',
                studentGuideUrl: null,
            };

            await listenTemporarily(app, async (baseUrl) => {
                const response = await fetch(
                    `${baseUrl}/api/lessons`,
                    {
                        method: 'POST',
                        headers: {
                            'content-type': 'application/json',
                        },
                        body: JSON.stringify(lessonData),
                    },
                );
                const body = await response.json();

                assert.equal(response.status, 201);
                assert.deepEqual(body, {
                    data: {
                        lesson: {
                            id: 'lesson-created',
                            ...lessonData,
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

            assert.deepEqual(calls.create, [lessonData]);
        },
    );

    test(
        'transforma validação do modelo em resposta segura de cliente',
        async () => {
            const validationError = new Error(
                'course: valor interno rejeitado pelo schema',
            );
            validationError.name = 'ValidationError';

            const { LessonModel, calls } =
                createFakeLessonModel({
                    createError: validationError,
                });
            const app = createLessonTestApp({
                LessonModel,
                authentication: ADMINISTRATIVE_AUTHENTICATION,
            });

            await listenTemporarily(app, async (baseUrl) => {
                const response = await fetch(
                    `${baseUrl}/api/lessons`,
                    {
                        method: 'POST',
                        headers: {
                            'content-type': 'application/json',
                        },
                        body: JSON.stringify({
                            date: '2026-09-18',
                            course: 'CURSO_INEXISTENTE',
                            curricularUnit: 'Qualidade de Software',
                            type: 'Aula',
                        }),
                    },
                );
                const body = await response.json();

                assert.equal(response.status, 400);
                assert.deepEqual(body, {
                    error: {
                        code:
                            LESSON_SERVICE_CODES.INVALID_LESSON_DATA,
                        message:
                            LESSON_SERVICE_MESSAGES
                                .INVALID_LESSON_DATA,
                    },
                });
                assert.equal(
                    JSON.stringify(body).includes(
                        validationError.message,
                    ),
                    false,
                );
            });

            assert.equal(calls.create.length, 1);
        },
    );

    test(
        'rejeita filtros desconhecidos antes de consultar o modelo',
        async () => {
            const { LessonModel, calls } =
                createFakeLessonModel();
            const app = createLessonTestApp({
                LessonModel,
                authentication: ADMINISTRATIVE_AUTHENTICATION,
            });

            await listenTemporarily(app, async (baseUrl) => {
                const response = await fetch(
                    `${baseUrl}/api/lessons?search=conteudo`,
                );
                const body = await response.json();

                assert.equal(response.status, 400);
                assert.deepEqual(body, {
                    error: {
                        code:
                            LESSON_SERVICE_CODES
                                .INVALID_LESSON_FILTERS,
                        message:
                            LESSON_SERVICE_MESSAGES
                                .INVALID_LESSON_FILTERS,
                    },
                });
            });

            assert.equal(calls.find.length, 0);
            assert.equal(calls.sort.length, 0);
        },
    );

    test(
        'oculta uma falha inesperada da consulta e a registra no servidor',
        async () => {
            const databaseError = new Error(
                'MongoDB interno indisponível em mongodb://segredo',
            );
            const { LessonModel, calls } =
                createFakeLessonModel({
                    sortError: databaseError,
                });
            const logEntries = [];
            const logger = {
                error(...argumentsReceived) {
                    logEntries.push(argumentsReceived);
                },
            };
            const app = createLessonTestApp({
                LessonModel,
                authentication: ADMINISTRATIVE_AUTHENTICATION,
                logger,
            });

            await listenTemporarily(app, async (baseUrl) => {
                const response = await fetch(
                    `${baseUrl}/api/lessons`,
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

            assert.equal(calls.find.length, 1);
            assert.equal(calls.sort.length, 1);
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
