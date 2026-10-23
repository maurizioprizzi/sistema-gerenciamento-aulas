'use strict';

const { AppError } = require('../errors/AppError');
const {
    Course,
    COURSE_FIELD_LIMITS,
    normalizeCourseName,
    normalizeCourseCode,
} = require('../models/Course');

const COURSE_SERVICE_CODES = Object.freeze({
    INVALID_DATA: 'INVALID_COURSE_DATA',
    INVALID_ID: 'INVALID_COURSE_ID',
    INVALID_FILTERS: 'INVALID_COURSE_FILTERS',
    CODE_CONFLICT: 'COURSE_CODE_CONFLICT',
});

const COURSE_SERVICE_MESSAGES = Object.freeze({
    INVALID_MODEL:
        'Um modelo de curso válido é necessário para gerenciar os cursos.',
    INVALID_DATA:
        'Informe nome e sigla válidos para o curso.',
    INVALID_ID:
        'O identificador do curso é inválido.',
    INVALID_FILTERS:
        'Os filtros de consulta dos cursos são inválidos.',
    CODE_CONFLICT:
        'Já existe um curso com essa sigla, inclusive entre os cursos desativados.',
    INVALID_DOCUMENT:
        'O modelo retornou um curso inválido.',
    INVALID_LIST:
        'O modelo retornou uma lista de cursos inválida.',
});

const COURSE_ID_PATTERN = /^[a-fA-F0-9]{24}$/;
const COURSE_DATA_FIELDS = Object.freeze(['name', 'code']);
const COURSE_LIST_SORT = Object.freeze({ name: 1, code: 1, _id: 1 });
const COURSE_UPDATE_OPTIONS = Object.freeze({
    returnDocument: 'after',
    upsert: false,
    runValidators: true,
    context: 'query',
});

function isObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** A fronteira recebe objetos de dados, não documentos ou instâncias de classes. */
function isInputObject(value) {
    return isObject(value)
        && [Object.prototype, null].includes(Object.getPrototypeOf(value));
}

function createInputError(code) {
    return new AppError(COURSE_SERVICE_MESSAGES[code], {
        statusCode: code === 'CODE_CONFLICT' ? 409 : 400,
        code: COURSE_SERVICE_CODES[code],
    });
}

/**
 * Gerencia o catálogo de cursos de uma instalação individual.
 *
 * O serviço não conhece HTTP, sessão ou interface. Exige somente criação,
 * consulta e atualização do modelo; desativação altera active para false.
 * A preparação do índice único deve ser aguardada na composição do servidor
 * antes de disponibilizar as operações de gravação.
 */
class CourseService {
    #CourseModel;

    constructor({ CourseModel = Course } = {}) {
        if (
            !CourseModel
            || typeof CourseModel.create !== 'function'
            || typeof CourseModel.find !== 'function'
            || typeof CourseModel.findByIdAndUpdate !== 'function'
        ) {
            throw new TypeError(COURSE_SERVICE_MESSAGES.INVALID_MODEL);
        }
        this.#CourseModel = CourseModel;
    }

    /** Recebe o estado completo de nome e sigla, tanto na criação quanto na edição. */
    static prepareCourseData(input) {
        if (
            !isInputObject(input)
            || Reflect.ownKeys(input).length !== COURSE_DATA_FIELDS.length
            || !COURSE_DATA_FIELDS.every((field) => Object.hasOwn(input, field))
            || typeof input.name !== 'string'
            || typeof input.code !== 'string'
        ) {
            throw createInputError('INVALID_DATA');
        }

        const name = normalizeCourseName(input.name);
        const code = normalizeCourseCode(input.code);
        if (
            name.length < COURSE_FIELD_LIMITS.MIN_NAME_LENGTH
            || name.length > COURSE_FIELD_LIMITS.MAX_NAME_LENGTH
            || code.length < COURSE_FIELD_LIMITS.MIN_CODE_LENGTH
            || code.length > COURSE_FIELD_LIMITS.MAX_CODE_LENGTH
        ) {
            throw createInputError('INVALID_DATA');
        }
        return Object.freeze({ name, code });
    }

    static prepareCourseId(id) {
        if (typeof id !== 'string' || !COURSE_ID_PATTERN.test(id)) {
            throw createInputError('INVALID_ID');
        }
        return id.toLowerCase();
    }

    /** Sem filtro, inclui ativos e desativados para a tela de gerenciamento. */
    static prepareListFilter(filters) {
        if (
            !isInputObject(filters)
            || Reflect.ownKeys(filters).some((field) => field !== 'active')
            || (Object.hasOwn(filters, 'active') && typeof filters.active !== 'boolean')
        ) {
            throw createInputError('INVALID_FILTERS');
        }
        return Object.freeze(Object.hasOwn(filters, 'active')
            ? { active: filters.active } : {});
    }

    /** Seleciona somente os quatro campos públicos, sem timestamps ou métodos. */
    static createCourseRepresentation(document) {
        if (
            !isObject(document)
            || typeof document.name !== 'string'
            || typeof document.code !== 'string'
            || typeof document.active !== 'boolean'
        ) {
            throw new TypeError(COURSE_SERVICE_MESSAGES.INVALID_DOCUMENT);
        }

        const id = String(document._id);
        const name = document.name;
        const code = document.code;
        if (
            !COURSE_ID_PATTERN.test(id)
            || name !== normalizeCourseName(name)
            || code !== normalizeCourseCode(code)
            || name.length < COURSE_FIELD_LIMITS.MIN_NAME_LENGTH
            || name.length > COURSE_FIELD_LIMITS.MAX_NAME_LENGTH
            || code.length < COURSE_FIELD_LIMITS.MIN_CODE_LENGTH
            || code.length > COURSE_FIELD_LIMITS.MAX_CODE_LENGTH
        ) {
            throw new TypeError(COURSE_SERVICE_MESSAGES.INVALID_DOCUMENT);
        }
        return Object.freeze({ id: id.toLowerCase(), name, code, active: document.active });
    }

    /** Não confunde conflitos de outros índices com uma sigla já utilizada. */
    static isCourseCodeConflict(error) {
        if (!error || error.code !== 11000) return false;
        const hasOnlyCode = (value) => isObject(value)
            && Reflect.ownKeys(value).length === 1
            && Object.hasOwn(value, 'code');

        return (hasOnlyCode(error.keyPattern) && error.keyPattern.code === 1)
            || hasOnlyCode(error.keyValue);
    }

    /** Converte somente falhas conhecidas da escrita; preserva falhas inesperadas. */
    async #write(operation) {
        try {
            return await operation();
        } catch (error) {
            if (CourseService.isCourseCodeConflict(error)) {
                throw createInputError('CODE_CONFLICT');
            }
            if (
                error instanceof Error
                && ['ValidationError', 'CastError', 'StrictModeError'].includes(error.name)
            ) {
                throw createInputError('INVALID_DATA');
            }
            throw error;
        }
    }

    /**
     * Cria sempre um curso ativo. Siglas duplicadas são recusadas pelo índice
     * do MongoDB, inclusive em criações concorrentes e contra cursos inativos.
     * @param {unknown} input Nome e sigla do curso.
     * @returns {Promise<Readonly<object>>} Curso criado.
     */
    async createCourse(input) {
        const data = CourseService.prepareCourseData(input);
        const created = await this.#write(() => this.#CourseModel.create(
            Object.freeze({ ...data, active: true }),
        ));
        const representation = CourseService.createCourseRepresentation(created);
        if (
            representation.name !== data.name || representation.code !== data.code
            || representation.active !== true
        ) {
            throw new TypeError(COURSE_SERVICE_MESSAGES.INVALID_DOCUMENT);
        }
        return representation;
    }

    /**
     * Consulta todos os cursos ou somente uma situação explicitamente escolhida.
     * @param {object} [filters={}] Filtro active opcional, obrigatoriamente booleano.
     * @returns {Promise<ReadonlyArray<Readonly<object>>>} Lista pública e imutável.
     */
    async listCourses(filters = {}) {
        const filter = CourseService.prepareListFilter(filters);
        const documents = await this.#CourseModel.find(filter).sort(COURSE_LIST_SORT);
        if (!Array.isArray(documents)) {
            throw new TypeError(COURSE_SERVICE_MESSAGES.INVALID_LIST);
        }
        return Object.freeze(documents.map(CourseService.createCourseRepresentation));
    }

    /**
     * Edita nome e sigla pelo identificador estável, preservando a situação.
     * Um curso desativado continua desativado ao editar seus textos.
     * A ausência retorna null para o controlador decidir a resposta HTTP.
     * @param {unknown} id Identificador do curso.
     * @param {unknown} input Nome e sigla completos.
     * @returns {Promise<Readonly<object>|null>} Curso editado ou ausência.
     */
    async updateCourse(id, input) {
        const preparedId = CourseService.prepareCourseId(id);
        const data = CourseService.prepareCourseData(input);
        const updated = await this.#write(() => this.#CourseModel.findByIdAndUpdate(
            preparedId,
            Object.freeze({ $set: data }),
            COURSE_UPDATE_OPTIONS,
        ));
        if (updated === null) return null;
        const representation = CourseService.createCourseRepresentation(updated);
        if (
            representation.id !== preparedId
            || representation.name !== data.name || representation.code !== data.code
        ) {
            throw new TypeError(COURSE_SERVICE_MESSAGES.INVALID_DOCUMENT);
        }
        return representation;
    }

    /**
     * Desativa sem excluir o registro ou escrever em aulas e turmas. Repetir
     * a operação mantém o curso desativado; nome, sigla e identidade permanecem.
     * Os futuros vínculos das aulas usarão esse identificador estável.
     * @param {unknown} id Identificador do curso.
     * @returns {Promise<Readonly<object>|null>} Curso desativado ou ausência.
     */
    async deactivateCourse(id) {
        const preparedId = CourseService.prepareCourseId(id);
        const deactivated = await this.#write(() => this.#CourseModel.findByIdAndUpdate(
            preparedId,
            Object.freeze({ $set: Object.freeze({ active: false }) }),
            COURSE_UPDATE_OPTIONS,
        ));
        if (deactivated === null) return null;
        const representation = CourseService.createCourseRepresentation(deactivated);
        if (representation.id !== preparedId || representation.active !== false) {
            throw new TypeError(COURSE_SERVICE_MESSAGES.INVALID_DOCUMENT);
        }
        return representation;
    }
}

const courseService = new CourseService();

module.exports = {
    COURSE_SERVICE_CODES,
    COURSE_SERVICE_MESSAGES,
    COURSE_ID_PATTERN,
    COURSE_DATA_FIELDS,
    COURSE_LIST_SORT,
    COURSE_UPDATE_OPTIONS,
    CourseService,
    courseService,
};
