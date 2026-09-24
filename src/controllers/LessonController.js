'use strict';

const { AppError } = require('../errors/AppError');

/**
 * Códigos públicos produzidos diretamente pela fronteira HTTP de aulas.
 */
const LESSON_CONTROLLER_CODES = Object.freeze({
    LESSON_NOT_FOUND: 'LESSON_NOT_FOUND',
});

/**
 * Mensagens relacionadas à configuração e às respostas do controlador.
 *
 * Elas descrevem somente contratos internos e não incluem detalhes do banco,
 * documentos Mongoose ou dados administrativos.
 */
const LESSON_CONTROLLER_ERRORS = Object.freeze({
    INVALID_LESSON_SERVICE:
        'O controlador exige um serviço de aulas válido.',
    INVALID_LESSON_RESPONSE:
        'O serviço de aulas retornou uma aula inválida.',
    INVALID_LESSON_LIST_RESPONSE:
        'O serviço de aulas retornou uma lista inválida.',
    LESSON_NOT_FOUND:
        'A aula informada não foi encontrada.',
});

/**
 * Verifica se o valor é um objeto não nulo e não é uma lista.
 *
 * @param {unknown} value Valor recebido.
 * @returns {boolean} Verdadeiro quando o valor possui formato de objeto.
 */
function isObject(value) {
    return (
        value !== null
        && typeof value === 'object'
        && !Array.isArray(value)
    );
}

/**
 * Coordena as requisições HTTP de criação, edição e consulta das aulas.
 *
 * O controlador não conhece Mongoose nem regras de persistência. Ele recebe
 * um serviço pronto, traduz a entrada HTTP e limita explicitamente o formato
 * das respostas enviadas ao cliente.
 */
class LessonController {
    /**
     * Serviço responsável pelas regras de aplicação das aulas.
     *
     * @type {object}
     */
    #lessonService;

    /**
     * @param {object} dependencies Dependências do controlador.
     * @param {object} dependencies.lessonService
     * Serviço que oferece createLesson(), updateLesson() e listLessons().
     */
    constructor({ lessonService } = {}) {
        LessonController.validateLessonService(lessonService);

        this.#lessonService = lessonService;

        /**
         * Os handlers são vinculados para poderem ser entregues diretamente
         * ao Router do Express sem perder o acesso ao campo privado.
         */
        this.create = this.create.bind(this);
        this.update = this.update.bind(this);
        this.list = this.list.bind(this);

        Object.freeze(this);
    }

    /**
     * Valida o serviço utilizado pelo controlador.
     *
     * @param {unknown} service Dependência recebida.
     * @throws {TypeError} Quando as operações necessárias não existem.
     */
    static validateLessonService(service) {
        if (
            !isObject(service)
            || typeof service.createLesson !== 'function'
            || typeof service.updateLesson !== 'function'
            || typeof service.listLessons !== 'function'
        ) {
            throw new TypeError(
                LESSON_CONTROLLER_ERRORS.INVALID_LESSON_SERVICE,
            );
        }
    }

    /**
     * Cria a representação pública de uma aula.
     *
     * Mesmo que uma implementação incorreta do serviço acrescente campos
     * internos, o controlador seleciona novamente somente o identificador e
     * os oito campos funcionais autorizados pelo calendário.
     *
     * @param {unknown} lesson Aula recebida do serviço.
     * @returns {Readonly<object>} Aula segura para a resposta HTTP.
     * @throws {TypeError} Quando a representação estiver inconsistente.
     */
    static createPublicLesson(lesson) {
        const hasRequiredStrings =
            isObject(lesson)
            && typeof lesson.id === 'string'
            && lesson.id.trim().length > 0
            && typeof lesson.date === 'string'
            && lesson.date.trim().length > 0
            && typeof lesson.course === 'string'
            && lesson.course.trim().length > 0
            && typeof lesson.curricularUnit === 'string'
            && lesson.curricularUnit.trim().length > 0
            && typeof lesson.type === 'string'
            && lesson.type.trim().length > 0;

        const hasValidOptionalFields =
            hasRequiredStrings
            && (
                lesson.lessonNumber === null
                || typeof lesson.lessonNumber === 'string'
            )
            && typeof lesson.needsReview === 'boolean'
            && (
                lesson.lessonPlanUrl === null
                || typeof lesson.lessonPlanUrl === 'string'
            )
            && (
                lesson.studentGuideUrl === null
                || typeof lesson.studentGuideUrl === 'string'
            );

        if (!hasValidOptionalFields) {
            throw new TypeError(
                LESSON_CONTROLLER_ERRORS.INVALID_LESSON_RESPONSE,
            );
        }

        return Object.freeze({
            id: lesson.id,
            date: lesson.date,
            course: lesson.course,
            curricularUnit: lesson.curricularUnit,
            type: lesson.type,
            lessonNumber: lesson.lessonNumber,
            needsReview: lesson.needsReview,
            lessonPlanUrl: lesson.lessonPlanUrl,
            studentGuideUrl: lesson.studentGuideUrl,
        });
    }

    /**
     * Cria a lista pública enviada nas consultas.
     *
     * Cada item atravessa a mesma seleção defensiva aplicada à criação. A
     * lista também é congelada para preservar o resultado até sua entrega ao
     * Express.
     *
     * @param {unknown} lessons Resultado recebido do serviço.
     * @returns {ReadonlyArray<Readonly<object>>} Lista pública de aulas.
     * @throws {TypeError} Quando o resultado não for uma lista válida.
     */
    static createPublicLessonList(lessons) {
        if (!Array.isArray(lessons)) {
            throw new TypeError(
                LESSON_CONTROLLER_ERRORS
                    .INVALID_LESSON_LIST_RESPONSE,
            );
        }

        let publicLessons;

        try {
            publicLessons = lessons.map(
                LessonController.createPublicLesson,
            );
        } catch (error) {
            if (
                error instanceof TypeError
                && error.message ===
                    LESSON_CONTROLLER_ERRORS.INVALID_LESSON_RESPONSE
            ) {
                throw new TypeError(
                    LESSON_CONTROLLER_ERRORS
                        .INVALID_LESSON_LIST_RESPONSE,
                );
            }

            throw error;
        }

        return Object.freeze(publicLessons);
    }

    /**
     * Cria uma aula a partir do corpo da requisição.
     *
     * A resposta utiliza 201 porque um novo recurso foi persistido. A rota
     * responsável por este handler definirá posteriormente o endereço e a
     * autorização administrativa.
     *
     * @param {import('express').Request} request Requisição HTTP.
     * @param {import('express').Response} response Resposta HTTP.
     * @param {import('express').NextFunction} next Tratamento seguinte.
     * @returns {Promise<void>}
     */
    async create(request, response, next) {
        try {
            const lesson = await this.#lessonService.createLesson(
                request?.body,
            );

            const publicLesson =
                LessonController.createPublicLesson(lesson);

            response.status(201).json({
                data: {
                    lesson: publicLesson,
                },
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * Atualiza uma aula a partir do identificador e do corpo da requisição.
     *
     * O serviço valida a entrada e devolve 'null' quando o identificador não
     * corresponde a uma aula existente. O controlador converte essa ausência
     * em uma resposta operacional 404 antes de iniciar a resposta HTTP.
     *
     * @param {import('express').Request} request Requisição HTTP.
     * @param {import('express').Response} response Resposta HTTP.
     * @param {import('express').NextFunction} next Tratamento seguinte.
     * @returns {Promise<void>}
     */
    async update(request, response, next) {
        try {
            const lesson = await this.#lessonService.updateLesson(
                request?.params?.id,
                request?.body,
            );

            if (lesson === null) {
                throw new AppError(
                    LESSON_CONTROLLER_ERRORS.LESSON_NOT_FOUND,
                    {
                        statusCode: 404,
                        code:
                            LESSON_CONTROLLER_CODES
                                .LESSON_NOT_FOUND,
                    },
                );
            }

            const publicLesson =
                LessonController.createPublicLesson(lesson);

            response.status(200).json({
                data: {
                    lesson: publicLesson,
                },
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * Lista as aulas conforme os filtros recebidos na query string.
     *
     * O serviço continua responsável por reconhecer os nomes e validar os
     * valores dos filtros. O controlador apenas encaminha a estrutura recebida
     * e apresenta o resultado sob o envelope HTTP padronizado.
     *
     * @param {import('express').Request} request Requisição HTTP.
     * @param {import('express').Response} response Resposta HTTP.
     * @param {import('express').NextFunction} next Tratamento seguinte.
     * @returns {Promise<void>}
     */
    async list(request, response, next) {
        try {
            const lessons = await this.#lessonService.listLessons(
                request?.query,
            );

            const publicLessons =
                LessonController.createPublicLessonList(lessons);

            response.status(200).json({
                data: {
                    lessons: publicLessons,
                },
            });
        } catch (error) {
            next(error);
        }
    }
}

module.exports = {
    LESSON_CONTROLLER_CODES,
    LESSON_CONTROLLER_ERRORS,
    LessonController,
};
