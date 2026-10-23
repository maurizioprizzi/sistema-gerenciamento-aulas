'use strict';

const { AppError } = require('../errors/AppError');

const COURSE_CONTROLLER_CODES = Object.freeze({
    NOT_FOUND: 'COURSE_NOT_FOUND',
    INVALID_FILTERS: 'INVALID_COURSE_FILTERS',
});

const COURSE_CONTROLLER_ERRORS = Object.freeze({
    INVALID_SERVICE:
        'O controlador exige um serviço de cursos válido.',
    INVALID_RESPONSE:
        'O serviço retornou um curso inválido.',
    INVALID_LIST_RESPONSE:
        'O serviço retornou uma lista de cursos inválida.',
    NOT_FOUND:
        'O curso informado não foi encontrado.',
    INVALID_FILTERS:
        'Os filtros de consulta dos cursos são inválidos.',
});

function isObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasText(value) {
    return typeof value === 'string' && value.trim().length > 0;
}

function createNotFoundError() {
    return new AppError(COURSE_CONTROLLER_ERRORS.NOT_FOUND, {
        statusCode: 404,
        code: COURSE_CONTROLLER_CODES.NOT_FOUND,
    });
}

/**
 * Fronteira HTTP do cadastro de cursos de uma instalação individual.
 *
 * Recebe o serviço pronto, sem importar Mongoose ou abrir recursos. O serviço
 * valida os dados e executa as operações; o controlador traduz a consulta
 * textual e seleciona novamente os campos públicos antes de responder.
 * O roteador deverá aplicar autorização administrativa a todos os handlers.
 */
class CourseController {
    #courseService;

    constructor({ courseService } = {}) {
        if (
            !isObject(courseService)
            || !['createCourse', 'listCourses', 'updateCourse', 'deactivateCourse']
                .every((method) => typeof courseService[method] === 'function')
        ) {
            throw new TypeError(COURSE_CONTROLLER_ERRORS.INVALID_SERVICE);
        }
        this.#courseService = courseService;
        this.create = this.create.bind(this);
        this.list = this.list.bind(this);
        this.update = this.update.bind(this);
        this.deactivate = this.deactivate.bind(this);
        Object.freeze(this);
    }

    /**
     * Sem active, a listagem inclui todas as situações. A query HTTP aceita
     * somente active=true ou active=false, sem coerção de arrays ou objetos.
     * Campos desconhecidos são recusados em vez de ignorados.
     * @param {unknown} query Consulta textual produzida pelo Express.
     * @returns {Readonly<object>} Filtro booleano entregue ao serviço.
     */
    static prepareListQuery(query = {}) {
        const isValidObject = isObject(query)
            && [Object.prototype, null].includes(Object.getPrototypeOf(query));
        if (
            !isValidObject
            || Reflect.ownKeys(query).some((field) => field !== 'active')
            || (Object.hasOwn(query, 'active')
                && query.active !== 'true' && query.active !== 'false')
        ) {
            throw new AppError(COURSE_CONTROLLER_ERRORS.INVALID_FILTERS, {
                statusCode: 400,
                code: COURSE_CONTROLLER_CODES.INVALID_FILTERS,
            });
        }
        return Object.freeze(Object.hasOwn(query, 'active')
            ? { active: query.active === 'true' } : {});
    }

    /**
     * Reconstrói o contrato público, descartando timestamps e campos extras.
     * Respostas inválidas são erros internos e não se tornam sucesso HTTP.
     * @param {unknown} course Resultado recebido do serviço.
     * @returns {Readonly<object>} Curso público independente do resultado.
     */
    static createPublicCourse(course) {
        if (
            !isObject(course)
            || typeof course.id !== 'string'
            || !/^[a-fA-F0-9]{24}$/.test(course.id)
            || !hasText(course.name) || !hasText(course.code)
            || typeof course.active !== 'boolean'
        ) {
            throw new TypeError(COURSE_CONTROLLER_ERRORS.INVALID_RESPONSE);
        }
        return Object.freeze({
            id: course.id.toLowerCase(),
            name: course.name,
            code: course.code,
            active: course.active,
        });
    }

    static createPublicCourseList(courses) {
        if (!Array.isArray(courses)) {
            throw new TypeError(COURSE_CONTROLLER_ERRORS.INVALID_LIST_RESPONSE);
        }
        return Object.freeze(courses.map(CourseController.createPublicCourse));
    }

    /** Cria um curso no catálogo: HTTP 201 com data.course, sem campos internos. */
    async create(request, response, next) {
        try {
            response.set('Cache-Control', 'no-store');
            // O corpo inteiro permite ao serviço recusar campos não previstos.
            const course = await this.#courseService.createCourse(request?.body);
            const publicCourse = CourseController.createPublicCourse(course);
            if (publicCourse.active !== true) {
                throw new TypeError(COURSE_CONTROLLER_ERRORS.INVALID_RESPONSE);
            }
            response.status(201).json({ data: { course: publicCourse } });
        } catch (error) {
            next(error);
        }
    }

    /** Lista os cursos: HTTP 200 com data.courses, incluindo lista vazia. */
    async list(request, response, next) {
        try {
            response.set('Cache-Control', 'no-store');
            const filters = CourseController.prepareListQuery(request?.query);
            const courses = await this.#courseService.listCourses(filters);
            const publicCourses = CourseController.createPublicCourseList(courses);
            response.status(200).json({ data: { courses: publicCourses } });
        } catch (error) {
            next(error);
        }
    }

    /** Edita nome e sigla pelo id do caminho: HTTP 200 ou recusa pública 404. */
    async update(request, response, next) {
        try {
            response.set('Cache-Control', 'no-store');
            const course = await this.#courseService.updateCourse(
                request?.params?.id,
                request?.body,
            );
            if (course === null) throw createNotFoundError();
            const publicCourse = CourseController.createPublicCourse(course);
            response.status(200).json({ data: { course: publicCourse } });
        } catch (error) {
            next(error);
        }
    }

    /**
     * Desativa pelo id do caminho, sem receber alterações pelo corpo.
     * Retorna HTTP 200 com o curso desativado; ausência resulta em 404.
     */
    async deactivate(request, response, next) {
        try {
            response.set('Cache-Control', 'no-store');
            const course = await this.#courseService.deactivateCourse(request?.params?.id);
            if (course === null) throw createNotFoundError();
            const publicCourse = CourseController.createPublicCourse(course);
            if (publicCourse.active !== false) {
                throw new TypeError(COURSE_CONTROLLER_ERRORS.INVALID_RESPONSE);
            }
            response.status(200).json({ data: { course: publicCourse } });
        } catch (error) {
            next(error);
        }
    }
}

module.exports = {
    COURSE_CONTROLLER_CODES,
    COURSE_CONTROLLER_ERRORS,
    CourseController,
};
