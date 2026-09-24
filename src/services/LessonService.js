'use strict';

const { AppError } = require('../errors/AppError');
const {
    LESSON_COURSES,
    Lesson,
    isValidCalendarDate,
} = require('../models/Lesson');

/**
 * Códigos estáveis produzidos pelas regras de aplicação das aulas.
 *
 * Controladores e clientes poderão reagir aos códigos sem depender do texto
 * humano das mensagens.
 */
const LESSON_SERVICE_CODES = Object.freeze({
    INVALID_LESSON_DATA: 'INVALID_LESSON_DATA',
    INVALID_LESSON_FILTERS: 'INVALID_LESSON_FILTERS',
    INVALID_LESSON_ID: 'INVALID_LESSON_ID',
});

/**
 * Mensagens seguras utilizadas pelo serviço de aulas.
 */
const LESSON_SERVICE_MESSAGES = Object.freeze({
    INVALID_LESSON_MODEL:
        'Um modelo de aula válido é necessário para gerenciar o calendário.',
    INVALID_LESSON_DATA:
        'Os dados da aula são inválidos.',
    INVALID_LESSON_FILTERS:
        'Os filtros de consulta das aulas são inválidos.',
    INVALID_LESSON_ID:
        'O identificador da aula é inválido.',
    INVALID_LESSON_DOCUMENT:
        'O modelo retornou uma aula inválida.',
    INVALID_LESSON_LIST:
        'O modelo retornou uma lista de aulas inválida.',
});

/**
 * Campos funcionais aceitos durante a criação de uma aula.
 *
 * A lista explícita impede que identificadores, timestamps ou propriedades
 * administrativas recebidas por HTTP atravessem a fronteira do serviço.
 */
const LESSON_CREATION_FIELDS = Object.freeze([
    'date',
    'course',
    'curricularUnit',
    'type',
    'lessonNumber',
    'needsReview',
    'lessonPlanUrl',
    'studentGuideUrl',
]);

/**
 * Campos exigidos durante a substituição funcional de uma aula.
 *
 * A edição recebe o estado completo apresentado pelo formulário. Isso evita
 * que a ausência acidental de um campo mantenha silenciosamente um valor
 * antigo. Campos opcionais podem ser removidos explicitamente com 'null'.
 */
const LESSON_UPDATE_FIELDS = LESSON_CREATION_FIELDS;

/**
 * Formato textual dos identificadores ObjectId utilizados pelo MongoDB.
 *
 * A validação ocorre antes do acesso ao modelo para que identificadores
 * inválidos não se transformem em detalhes técnicos de conversão.
 */
const LESSON_ID_PATTERN = /^[a-fA-F0-9]{24}$/;

/**
 * Opções estáveis da atualização atômica.
 *
 * 'new' devolve o documento posterior à alteração e 'runValidators'
 * mantém o schema como fonte única das regras funcionais.
 */
const LESSON_UPDATE_OPTIONS = Object.freeze({
    new: true,
    runValidators: true,
    context: 'query',
});

/**
 * Filtros presentes na interface original de gerenciamento de aulas.
 *
 * `fromDate` representa a data mínima utilizada pela opção visual
 * "Mostrar a partir de hoje". O cálculo do dia atual ficará fora deste
 * serviço para que a regra permaneça independente de relógio e fuso horário.
 */
const LESSON_LIST_FILTER_FIELDS = Object.freeze([
    'course',
    'month',
    'fromDate',
]);

/**
 * Ordenação estável das consultas.
 *
 * O protótipo ordenava por data crescente. O identificador é utilizado apenas
 * como desempate determinístico quando existem vários registros no mesmo dia.
 */
const LESSON_LIST_SORT = Object.freeze({
    date: 1,
    _id: 1,
});

/**
 * Confirma que um valor é um objeto de entrada, e não null ou uma lista.
 *
 * @param {unknown} value Valor recebido pela fronteira do serviço.
 * @returns {boolean} Verdadeiro somente para objetos não nulos.
 */
function isInputObject(value) {
    return (
        value !== null
        && typeof value === 'object'
        && !Array.isArray(value)
    );
}

/**
 * Cria um erro operacional seguro para dados inválidos de uma aula.
 *
 * @returns {AppError} Erro público de cliente.
 */
function createInvalidLessonDataError() {
    return new AppError(
        LESSON_SERVICE_MESSAGES.INVALID_LESSON_DATA,
        {
            statusCode: 400,
            code: LESSON_SERVICE_CODES.INVALID_LESSON_DATA,
        },
    );
}

/**
 * Cria um erro operacional seguro para filtros inválidos.
 *
 * @returns {AppError} Erro público de cliente.
 */
function createInvalidLessonFiltersError() {
    return new AppError(
        LESSON_SERVICE_MESSAGES.INVALID_LESSON_FILTERS,
        {
            statusCode: 400,
            code: LESSON_SERVICE_CODES.INVALID_LESSON_FILTERS,
        },
    );
}

/**
 * Cria um erro operacional seguro para identificadores inválidos.
 *
 * @returns {AppError} Erro público de cliente.
 */
function createInvalidLessonIdError() {
    return new AppError(
        LESSON_SERVICE_MESSAGES.INVALID_LESSON_ID,
        {
            statusCode: 400,
            code: LESSON_SERVICE_CODES.INVALID_LESSON_ID,
        },
    );
}

/**
 * Coordena as regras de criação, edição e consulta das aulas.
 *
 * O serviço desconhece HTTP, sessões e detalhes visuais. O modelo é recebido
 * por injeção para permitir testes inteiramente isolados do MongoDB.
 */
class LessonService {
    /**
     * Modelo utilizado para persistir e consultar aulas.
     *
     * @type {object}
     */
    #LessonModel;

    /**
     * Marca seletores construídos internamente como confiáveis para o
     * sanitizador do adaptador persistente.
     *
     * @type {Function|null}
     */
    #trustQuerySelector;

    /**
     * @param {object} dependencies Dependências do serviço.
     * @param {object} dependencies.LessonModel Modelo Mongoose de aula.
     */
    constructor({ LessonModel = Lesson } = {}) {
        LessonService.validateLessonModel(LessonModel);

        this.#LessonModel = LessonModel;

        /**
         * Modelos Mongoose expõem em `base` a instância que os criou. Quando
         * `sanitizeFilter` está habilitado globalmente, `trusted()` permite
         * preservar operadores seguros construídos pela própria aplicação.
         *
         * Outros adaptadores e modelos controlados de teste não precisam
         * oferecer essa operação e continuam recebendo o filtro comum.
         */
        this.#trustQuerySelector =
            LessonModel.base
            && typeof LessonModel.base.trusted === 'function'
                ? LessonModel.base.trusted.bind(LessonModel.base)
                : null;
    }

    /**
     * Verifica as operações exigidas do modelo.
     *
     * @param {unknown} LessonModel Modelo que será validado.
     * @throws {TypeError} Quando alguma operação exigida não está disponível.
     */
    static validateLessonModel(LessonModel) {
        const isValid =
            LessonModel
            && typeof LessonModel.create === 'function'
            && typeof LessonModel.find === 'function'
            && typeof LessonModel.findByIdAndUpdate === 'function';

        if (!isValid) {
            throw new TypeError(
                LESSON_SERVICE_MESSAGES.INVALID_LESSON_MODEL,
            );
        }
    }

    /**
     * Mantém somente os oito campos funcionais autorizados.
     *
     * A validação detalhada de valores permanece no schema `Lesson`, que é a
     * fonte única das regras de data, curso, tipo, tamanho e URL. Nesta etapa,
     * o serviço protege a estrutura e impede propriedades desconhecidas.
     *
     * @param {unknown} lessonData Dados recebidos para criação.
     * @returns {Readonly<object>} Cópia segura entregue ao modelo.
     * @throws {AppError} Quando a estrutura contém campos não autorizados.
     */
    static prepareLessonData(lessonData) {
        if (!isInputObject(lessonData)) {
            throw createInvalidLessonDataError();
        }

        const receivedFields = Object.keys(lessonData);
        const hasUnknownField = receivedFields.some(
            (field) => !LESSON_CREATION_FIELDS.includes(field),
        );

        if (hasUnknownField) {
            throw createInvalidLessonDataError();
        }

        const preparedData = {};

        for (const field of LESSON_CREATION_FIELDS) {
            if (Object.hasOwn(lessonData, field)) {
                preparedData[field] = lessonData[field];
            }
        }

        return Object.freeze(preparedData);
    }

    /**
     * Valida um identificador antes de consultar o MongoDB.
     *
     * @param {unknown} lessonId Identificador recebido pela aplicação.
     * @returns {string} Identificador validado sem transformação.
     * @throws {AppError} Quando o valor não representa um ObjectId.
     */
    static prepareLessonId(lessonId) {
        if (
            typeof lessonId !== 'string'
            || !LESSON_ID_PATTERN.test(lessonId)
        ) {
            throw createInvalidLessonIdError();
        }

        return lessonId;
    }

    /**
     * Prepara o estado completo utilizado para editar uma aula.
     *
     * Os mesmos oito campos da criação são permitidos, mas todos devem estar
     * presentes. Valores opcionais continuam podendo ser representados por
     * 'null', permitindo limpar links e número durante a edição.
     *
     * @param {unknown} lessonData Estado funcional completo da aula.
     * @returns {Readonly<object>} Cópia segura entregue ao modelo.
     * @throws {AppError} Quando a estrutura está incompleta ou é inválida.
     */
    static prepareLessonUpdateData(lessonData) {
        const preparedData =
            LessonService.prepareLessonData(lessonData);
        const hasEveryField = LESSON_UPDATE_FIELDS.every(
            (field) => Object.hasOwn(preparedData, field),
        );

        if (!hasEveryField) {
            throw createInvalidLessonDataError();
        }

        return preparedData;
    }

    /**
     * Confirma que um mês pode identificar datas do calendário.
     *
     * Reutilizar a validação de data com o primeiro dia evita duplicar as
     * regras civis já mantidas pelo modelo de aula.
     *
     * @param {unknown} month Mês candidato no formato YYYY-MM.
     * @returns {boolean} Verdadeiro somente para um mês válido.
     */
    static isValidCalendarMonth(month) {
        return (
            typeof month === 'string'
            && isValidCalendarDate(`${month}-01`)
        );
    }

    /**
     * Valida os filtros e constrói a consulta correspondente do MongoDB.
     *
     * O intervalo mensal termina textualmente em `31`. Como o schema impede
     * datas civis inexistentes, esse limite inclui todos os dias válidos do
     * mês sem converter o valor para Date nem depender de fuso horário.
     *
     * @param {unknown} filters Filtros opcionais da consulta.
     * @returns {Readonly<object>} Filtro pronto para LessonModel.find().
     * @throws {AppError} Quando algum filtro é inválido ou desconhecido.
     */
    static prepareListFilter(filters = {}) {
        if (!isInputObject(filters)) {
            throw createInvalidLessonFiltersError();
        }

        const receivedFields = Object.keys(filters);
        const hasUnknownField = receivedFields.some(
            (field) => !LESSON_LIST_FILTER_FIELDS.includes(field),
        );

        if (hasUnknownField) {
            throw createInvalidLessonFiltersError();
        }

        const {
            course,
            month,
            fromDate,
        } = filters;

        const hasCourse = course !== undefined;
        const hasMonth = month !== undefined;
        const hasFromDate = fromDate !== undefined;

        if (
            hasCourse
            && !Object.values(LESSON_COURSES).includes(course)
        ) {
            throw createInvalidLessonFiltersError();
        }

        if (
            hasMonth
            && !LessonService.isValidCalendarMonth(month)
        ) {
            throw createInvalidLessonFiltersError();
        }

        if (
            hasFromDate
            && !isValidCalendarDate(fromDate)
        ) {
            throw createInvalidLessonFiltersError();
        }

        const queryFilter = {};

        if (hasCourse) {
            queryFilter.course = course;
        }

        if (hasMonth || hasFromDate) {
            const dateFilter = {};

            if (hasMonth) {
                dateFilter.$gte = `${month}-01`;
                dateFilter.$lte = `${month}-31`;
            }

            if (
                hasFromDate
                && (
                    dateFilter.$gte === undefined
                    || fromDate > dateFilter.$gte
                )
            ) {
                dateFilter.$gte = fromDate;
            }

            queryFilter.date = Object.freeze(dateFilter);
        }

        return Object.freeze(queryFilter);
    }

    /**
     * Prepara o filtro validado para o adaptador persistente.
     *
     * A proteção global `sanitizeFilter` transforma objetos que contêm
     * operadores iniciados por `$` em comparações literais. Essa defesa é
     * correta para objetos externos, mas o intervalo de data não vem do
     * cliente: seus nomes de operadores são definidos neste serviço e seus
     * operandos já foram validados como datas civis.
     *
     * Somente esse objeto interno recebe a marca de confiança do Mongoose. O
     * filtro externo nunca é marcado, e campos ou operadores desconhecidos
     * continuam sendo recusados antes desta etapa.
     *
     * @param {Readonly<object>} preparedFilter Filtro validado.
     * @returns {Readonly<object>} Filtro seguro para o modelo.
     */
    #createModelFilter(preparedFilter) {
        if (
            !Object.hasOwn(preparedFilter, 'date')
            || this.#trustQuerySelector === null
        ) {
            return preparedFilter;
        }

        const trustedDateFilter = this.#trustQuerySelector({
            ...preparedFilter.date,
        });

        return Object.freeze({
            ...preparedFilter,
            date: Object.freeze(trustedDateFilter),
        });
    }

    /**
     * Converte um documento em uma representação pública da aula.
     *
     * Documentos Mongoose, métodos internos, timestamps e propriedades não
     * autorizadas não atravessam a camada de serviço.
     *
     * @param {unknown} lesson Documento devolvido pelo modelo.
     * @returns {Readonly<object>} Aula pública e imutável.
     * @throws {TypeError} Quando o modelo retorna um documento inconsistente.
     */
    static createLessonRepresentation(lesson) {
        const hasValidDocument =
            lesson
            && lesson._id !== undefined
            && lesson._id !== null
            && typeof lesson.date === 'string'
            && typeof lesson.course === 'string'
            && typeof lesson.curricularUnit === 'string'
            && typeof lesson.type === 'string'
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

        if (!hasValidDocument) {
            throw new TypeError(
                LESSON_SERVICE_MESSAGES.INVALID_LESSON_DOCUMENT,
            );
        }

        return Object.freeze({
            id: String(lesson._id),
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
     * Identifica erros de validação produzidos pelo Mongoose.
     *
     * @param {unknown} error Falha recebida do modelo.
     * @returns {boolean} Verdadeiro para uma ValidationError do Mongoose.
     */
    static isModelValidationError(error) {
        return (
            error instanceof Error
            && error.name === 'ValidationError'
        );
    }

    /**
     * Identifica falhas de conversão produzidas pelo Mongoose.
     *
     * Atualizações executam conversões diretamente na consulta. Uma falha de
     * tipo conhecida pertence aos dados recebidos e deve produzir a mesma
     * resposta pública segura utilizada pelas demais validações.
     *
     * @param {unknown} error Falha recebida do modelo.
     * @returns {boolean} Verdadeiro para uma CastError do Mongoose.
     */
    static isModelCastError(error) {
        return (
            error instanceof Error
            && error.name === 'CastError'
        );
    }

    /**
     * Persiste uma nova aula.
     *
     * Erros de validação do schema tornam-se uma resposta operacional segura.
     * Falhas reais do banco continuam intactas para o tratamento central.
     *
     * @param {unknown} lessonData Dados funcionais da nova aula.
     * @returns {Promise<Readonly<object>>} Aula criada.
     */
    async createLesson(lessonData) {
        const preparedData =
            LessonService.prepareLessonData(lessonData);

        let createdLesson;

        try {
            createdLesson = await this.#LessonModel.create(
                preparedData,
            );
        } catch (error) {
            if (LessonService.isModelValidationError(error)) {
                throw createInvalidLessonDataError();
            }

            throw error;
        }

        return LessonService.createLessonRepresentation(
            createdLesson,
        );
    }

    /**
     * Substitui atomicamente o estado funcional de uma aula existente.
     *
     * O identificador e o corpo são validados antes do acesso ao modelo. A
     * atualização utiliza somente '$set' construído internamente, executa as
     * validações do schema e devolve o documento posterior à alteração.
     *
     * @param {unknown} lessonId Identificador da aula.
     * @param {unknown} lessonData Estado funcional completo.
     * @returns {Promise<Readonly<object>|null>} Aula atualizada ou ausência.
     */
    async updateLesson(lessonId, lessonData) {
        const preparedId =
            LessonService.prepareLessonId(lessonId);
        const preparedData =
            LessonService.prepareLessonUpdateData(lessonData);
        const update = Object.freeze({
            $set: preparedData,
        });

        let updatedLesson;

        try {
            updatedLesson = await this.#LessonModel.findByIdAndUpdate(
                preparedId,
                update,
                LESSON_UPDATE_OPTIONS,
            );
        } catch (error) {
            if (
                LessonService.isModelValidationError(error)
                || LessonService.isModelCastError(error)
            ) {
                throw createInvalidLessonDataError();
            }

            throw error;
        }

        if (updatedLesson === null) {
            return null;
        }

        return LessonService.createLessonRepresentation(
            updatedLesson,
        );
    }

    /**
     * Consulta aulas conforme os filtros existentes no protótipo.
     *
     * @param {unknown} filters Curso, mês e data mínima opcionais.
     * @returns {Promise<ReadonlyArray<Readonly<object>>>}
     * Lista pública, ordenada e imutável.
     */
    async listLessons(filters = {}) {
        const preparedFilter =
            LessonService.prepareListFilter(filters);
        const modelFilter = this.#createModelFilter(
            preparedFilter,
        );

        const lessons = await this.#LessonModel
            .find(modelFilter)
            .sort(LESSON_LIST_SORT);

        if (!Array.isArray(lessons)) {
            throw new TypeError(
                LESSON_SERVICE_MESSAGES.INVALID_LESSON_LIST,
            );
        }

        const representations = lessons.map(
            LessonService.createLessonRepresentation,
        );

        return Object.freeze(representations);
    }
}

/**
 * Instância padrão utilizada pela composição real da aplicação.
 */
const lessonService = new LessonService();

module.exports = {
    LESSON_CREATION_FIELDS,
    LESSON_ID_PATTERN,
    LESSON_LIST_FILTER_FIELDS,
    LESSON_LIST_SORT,
    LESSON_SERVICE_CODES,
    LESSON_SERVICE_MESSAGES,
    LESSON_UPDATE_FIELDS,
    LESSON_UPDATE_OPTIONS,
    LessonService,
    lessonService,
};
