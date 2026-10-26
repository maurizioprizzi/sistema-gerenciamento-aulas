'use strict';

const { AppError } = require('../errors/AppError');
const { isObjectIdOrHexString } = require('mongoose');
const { Course } = require('../models/Course');
const { CourseService } = require('./CourseService');
const { LessonCourseValidator } = require('./LessonCourseValidator');
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
    LESSON_CHANGED: 'LESSON_CHANGED',
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
    INVALID_COURSE_MODEL:
        'Um modelo de curso com consultas válidas é necessário para gerenciar as aulas.',
    INVALID_COURSE_VALIDATOR:
        'Um validador de cursos válido é necessário para gerenciar as aulas.',
    INVALID_COURSE_RESPONSE:
        'O catálogo retornou dados incompatíveis com o vínculo da aula.',
    INVALID_CATALOG_LESSON_MODEL:
        'O modelo de aulas deve oferecer leitura por identificador e atualização condicional.',
    LESSON_CHANGED:
        'A aula foi alterada durante a edição. Atualize a lista e tente novamente.',
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

/** Contrato novo: a identidade substitui a sigla enviada pelo formulário. */
const LESSON_CATALOG_FIELDS = Object.freeze(LESSON_CREATION_FIELDS.map(
    (field) => field === 'course' ? 'courseId' : field,
));

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

/** Opções da atualização condicional usada com os vínculos do catálogo. */
const LESSON_CATALOG_UPDATE_OPTIONS = Object.freeze({
    returnDocument: 'after',
    upsert: false,
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
    'courseId',
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
 * Lê a referência persistida sem aceitar siglas, números ou objetos de filtro.
 * Ausência continua possível somente para os registros do contrato anterior.
 */
function readStoredCourseId(lesson) {
    if (!isInputObject(lesson)) {
        throw new TypeError(LESSON_SERVICE_MESSAGES.INVALID_LESSON_DOCUMENT);
    }
    if (lesson.courseId === undefined || lesson.courseId === null) return null;
    if (!isObjectIdOrHexString(lesson.courseId)) {
        throw new TypeError(LESSON_SERVICE_MESSAGES.INVALID_LESSON_DOCUMENT);
    }
    return String(lesson.courseId).toLowerCase();
}

/**
 * Coordena as regras de criação, edição, exclusão e consulta das aulas.
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
    #CourseModel;
    #courseValidator;

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
     * @param {object} dependencies.CourseModel Modelo de cursos da instalação.
     * @param {object} dependencies.courseValidator Validação da associação.
     */
    constructor({
        LessonModel = Lesson,
        CourseModel = Course,
        courseValidator,
    } = {}) {
        LessonService.validateLessonModel(LessonModel);

        if (
            !CourseModel
            || typeof CourseModel.find !== 'function'
            || typeof CourseModel.findById !== 'function'
        ) {
            throw new TypeError(LESSON_SERVICE_MESSAGES.INVALID_COURSE_MODEL);
        }
        const selectedValidator = courseValidator === undefined
            ? new LessonCourseValidator({ CourseModel }) : courseValidator;
        if (
            !selectedValidator
            || typeof selectedValidator.validateForCreation !== 'function'
            || typeof selectedValidator.validateForUpdate !== 'function'
        ) {
            throw new TypeError(LESSON_SERVICE_MESSAGES.INVALID_COURSE_VALIDATOR);
        }

        this.#LessonModel = LessonModel;
        this.#CourseModel = CourseModel;
        this.#courseValidator = selectedValidator;

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
            && typeof LessonModel.findByIdAndUpdate === 'function'
            && typeof LessonModel.findByIdAndDelete === 'function';

        if (!isValid) {
            throw new TypeError(
                LESSON_SERVICE_MESSAGES.INVALID_LESSON_MODEL,
            );
        }
    }

    /**
     * Mantém somente os campos funcionais de um dos dois contratos.
     * course atende temporariamente ao fluxo anterior. courseId seleciona o
     * contrato do catálogo, sem aceitar sigla ou estado ativo enviados à parte.
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
        if (
            !isInputObject(lessonData)
            || ![Object.prototype, null].includes(Object.getPrototypeOf(lessonData))
        ) {
            throw createInvalidLessonDataError();
        }

        const fields = Object.hasOwn(lessonData, 'courseId')
            ? LESSON_CATALOG_FIELDS : LESSON_CREATION_FIELDS;
        const receivedFields = Reflect.ownKeys(lessonData);
        const hasUnknownField = receivedFields.some(
            (field) => !fields.includes(field),
        );

        if (hasUnknownField) {
            throw createInvalidLessonDataError();
        }

        const preparedData = {};

        for (const field of fields) {
            if (Object.hasOwn(lessonData, field)) {
                preparedData[field] = lessonData[field];
            }
        }

        if (fields === LESSON_CATALOG_FIELDS) {
            if (
                typeof preparedData.courseId !== 'string'
                || !LESSON_ID_PATTERN.test(preparedData.courseId)
            ) {
                throw createInvalidLessonDataError();
            }
            preparedData.courseId = preparedData.courseId.toLowerCase();
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
        const fields = Object.hasOwn(preparedData, 'courseId')
            ? LESSON_CATALOG_FIELDS : LESSON_UPDATE_FIELDS;
        const hasEveryField = fields.every(
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
            courseId,
            month,
            fromDate,
        } = filters;

        const hasCourse = course !== undefined;
        const hasCourseId = courseId !== undefined;
        const hasMonth = month !== undefined;
        const hasFromDate = fromDate !== undefined;

        if (
            hasCourse
            && !Object.values(LESSON_COURSES).includes(course)
        ) {
            throw createInvalidLessonFiltersError();
        }

        if (
            (hasCourse && hasCourseId)
            || (hasCourseId && (
                typeof courseId !== 'string'
                || !LESSON_ID_PATTERN.test(courseId)
            ))
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
        if (hasCourseId) {
            queryFilter.courseId = courseId.toLowerCase();
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
    static createLessonRepresentation(lesson, course = null) {
        const courseId = readStoredCourseId(lesson);
        let linkedCourse = null;
        if (courseId !== null) {
            linkedCourse = LessonService.validateCourseResponse(course, courseId);
            if (!LESSON_ID_PATTERN.test(String(lesson._id))) {
                throw new TypeError(LESSON_SERVICE_MESSAGES.INVALID_LESSON_DOCUMENT);
            }
        }
        const hasValidDocument =
            lesson
            && lesson._id !== undefined
            && lesson._id !== null
            && typeof lesson.date === 'string'
            && (linkedCourse !== null || typeof lesson.course === 'string')
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
            course: linkedCourse === null ? lesson.course : linkedCourse.code,
            ...(linkedCourse === null ? {} : { courseId: linkedCourse.id }),
            curricularUnit: lesson.curricularUnit,
            type: lesson.type,
            lessonNumber: lesson.lessonNumber,
            needsReview: lesson.needsReview,
            lessonPlanUrl: lesson.lessonPlanUrl,
            studentGuideUrl: lesson.studentGuideUrl,
        });
    }

    /** Confirma a identidade e o contrato público devolvidos por uma dependência. */
    static validateCourseResponse(course, expectedId) {
        if (!isInputObject(course)) {
            throw new TypeError(LESSON_SERVICE_MESSAGES.INVALID_COURSE_RESPONSE);
        }
        const representation = CourseService.createCourseRepresentation({
            ...course,
            _id: course.id,
        });
        if (representation.id !== expectedId) {
            throw new TypeError(LESSON_SERVICE_MESSAGES.INVALID_COURSE_RESPONSE);
        }
        return representation;
    }

    /**
     * Resolve o catálogo uma vez por operação, inclusive para uma lista grande.
     * A sigla exibida é a atual: nunca é utilizada como chave da associação.
     * Cursos desativados também participam da consulta para manter o histórico.
     * Uma referência ausente ou inconsistente no banco não vira aula vazia.
     */
    async #createRepresentations(lessons) {
        const requestedIds = new Set(lessons.map(readStoredCourseId).filter(
            (id) => id !== null,
        ));
        const coursesById = new Map();

        if (requestedIds.size > 0) {
            let selector = { $in: [...requestedIds] };
            const base = this.#CourseModel.base;
            if (base && typeof base.trusted === 'function') {
                // Apenas o seletor interno recebe confiança; nenhum operador
                // recebido do navegador é repassado à consulta.
                selector = base.trusted(selector);
            }
            const courses = await this.#CourseModel.find({ _id: selector });
            if (!Array.isArray(courses)) {
                throw new TypeError(LESSON_SERVICE_MESSAGES.INVALID_COURSE_RESPONSE);
            }
            for (const document of courses) {
                const course = CourseService.createCourseRepresentation(document);
                if (!requestedIds.has(course.id) || coursesById.has(course.id)) {
                    throw new TypeError(LESSON_SERVICE_MESSAGES.INVALID_COURSE_RESPONSE);
                }
                coursesById.set(course.id, course);
            }
            if (coursesById.size !== requestedIds.size) {
                throw new TypeError(LESSON_SERVICE_MESSAGES.INVALID_COURSE_RESPONSE);
            }
        }

        return Object.freeze(lessons.map((lesson) => (
            LessonService.createLessonRepresentation(
                lesson,
                coursesById.get(readStoredCourseId(lesson)),
            )
        )));
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

        if (Object.hasOwn(preparedData, 'courseId')) {
            const selected = await this.#courseValidator.validateForCreation(
                preparedData.courseId,
            );
            const course = LessonService.validateCourseResponse(
                selected, preparedData.courseId,
            );
            if (!course.active) {
                throw new TypeError(LESSON_SERVICE_MESSAGES.INVALID_COURSE_RESPONSE);
            }
        }

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

        if (Object.hasOwn(preparedData, 'courseId')
            && readStoredCourseId(createdLesson) !== preparedData.courseId) {
            throw new TypeError(LESSON_SERVICE_MESSAGES.INVALID_LESSON_DOCUMENT);
        }
        return (await this.#createRepresentations([createdLesson]))[0];
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
        if (Object.hasOwn(preparedData, 'courseId')) {
            return this.#updateCatalogLesson(preparedId, preparedData);
        }
        const update = Object.freeze({
            $set: preparedData,
        });

        let updatedLesson;

        try {
            if (typeof this.#LessonModel.findOneAndUpdate === 'function') {
                // O formulário antigo não pode sobrescrever uma aula que já
                // foi convertida ao vínculo por identidade. null também
                // encontra documentos legados em que courseId não existe.
                updatedLesson = await this.#LessonModel.findOneAndUpdate(
                    { _id: preparedId, courseId: null }, update,
                    LESSON_CATALOG_UPDATE_OPTIONS,
                );
            } else {
                // Adaptadores do contrato anterior continuam válidos durante
                // a transição. O novo contrato exige atualização condicional.
                updatedLesson = await this.#LessonModel.findByIdAndUpdate(
                    preparedId, update, LESSON_UPDATE_OPTIONS,
                );
            }
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

        return (await this.#createRepresentations([updatedLesson]))[0];
    }

    /**
     * Lê o vínculo anterior do banco e mantém essa condição na escrita.
     * Se outro pedido trocar o curso nesse intervalo, esta edição recebe 409
     * em vez de reutilizar a permissão de manter um curso desativado.
     * Essa condição protege o vínculo; não constitui transação com o curso.
     */
    async #updateCatalogLesson(preparedId, data) {
        if (
            typeof this.#LessonModel.findById !== 'function'
            || typeof this.#LessonModel.findOneAndUpdate !== 'function'
        ) {
            throw new TypeError(LESSON_SERVICE_MESSAGES.INVALID_CATALOG_LESSON_MODEL);
        }
        const previous = await this.#LessonModel.findById(preparedId);
        if (previous === null) return null;
        const previousCourseId = readStoredCourseId(previous);
        if (String(previous._id).toLowerCase() !== preparedId.toLowerCase()) {
            throw new TypeError(LESSON_SERVICE_MESSAGES.INVALID_LESSON_DOCUMENT);
        }
        const selected = await this.#courseValidator.validateForUpdate(
            data.courseId, previousCourseId,
        );
        const course = LessonService.validateCourseResponse(selected, data.courseId);
        if (!course.active && course.id !== previousCourseId) {
            throw new TypeError(LESSON_SERVICE_MESSAGES.INVALID_COURSE_RESPONSE);
        }

        let updated;
        try {
            updated = await this.#LessonModel.findOneAndUpdate(
                { _id: preparedId, courseId: previousCourseId },
                { $set: data, $unset: { course: 1 } },
                LESSON_CATALOG_UPDATE_OPTIONS,
            );
        } catch (error) {
            if (LessonService.isModelValidationError(error)
                || LessonService.isModelCastError(error)) {
                throw createInvalidLessonDataError();
            }
            throw error;
        }
        if (updated === null) {
            throw new AppError(LESSON_SERVICE_MESSAGES.LESSON_CHANGED, {
                statusCode: 409, code: LESSON_SERVICE_CODES.LESSON_CHANGED,
            });
        }
        if (readStoredCourseId(updated) !== data.courseId
            || String(updated._id).toLowerCase() !== preparedId.toLowerCase()) {
            throw new TypeError(LESSON_SERVICE_MESSAGES.INVALID_LESSON_DOCUMENT);
        }
        return (await this.#createRepresentations([updated]))[0];
    }

    /**
     * Exclui atomicamente uma aula pelo identificador.
     *
     * A validação ocorre antes do acesso ao modelo. A ausência do documento
     * é representada por 'null', tornando a operação idempotente para as
     * camadas HTTP e visual sem ocultar identificadores malformados.
     *
     * O documento removido atravessa a mesma seleção defensiva aplicada à
     * criação e à edição. Assim, propriedades internas do MongoDB não saem
     * da fronteira do serviço.
     *
     * @param {unknown} lessonId Identificador da aula.
     * @returns {Promise<Readonly<object>|null>} Aula excluída ou ausência.
     */
    async deleteLesson(lessonId) {
        const preparedId =
            LessonService.prepareLessonId(lessonId);

        let deletedLesson;

        try {
            deletedLesson =
                await this.#LessonModel.findByIdAndDelete(
                    preparedId,
                );
        } catch (error) {
            if (LessonService.isModelCastError(error)) {
                throw createInvalidLessonIdError();
            }

            throw error;
        }

        if (deletedLesson === null) {
            return null;
        }

        return (await this.#createRepresentations([deletedLesson]))[0];
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

        return this.#createRepresentations(lessons);
    }
}

/**
 * Instância padrão utilizada pela composição real da aplicação.
 */
const lessonService = new LessonService();

module.exports = {
    LESSON_CATALOG_FIELDS,
    LESSON_CATALOG_UPDATE_OPTIONS,
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
