/** Endereços relativos mantêm o catálogo na mesma origem da aplicação. */
const COURSE_API_PATHS = Object.freeze({ COURSES: '/api/courses' });

/** Limites do contrato HTTP, iguais aos aceitos pelo serviço no servidor. */
const COURSE_API_FIELD_LIMITS = Object.freeze({
    MIN_NAME_LENGTH: 2,
    MAX_NAME_LENGTH: 120,
    MIN_CODE_LENGTH: 1,
    MAX_CODE_LENGTH: 20,
});

const COURSE_API_CODES = Object.freeze({
    NETWORK_ERROR: 'COURSE_NETWORK_ERROR',
    INVALID_RESPONSE: 'INVALID_COURSE_RESPONSE',
    REQUEST_FAILED: 'COURSE_REQUEST_FAILED',
});

const COURSE_API_MESSAGES = Object.freeze({
    INVALID_FETCH_CLIENT: 'A API de cursos exige um cliente HTTP válido.',
    INVALID_DATA: 'Informe nome e sigla válidos para o curso.',
    INVALID_ID: 'O identificador do curso é inválido.',
    INVALID_FILTERS: 'Os filtros de consulta dos cursos são inválidos.',
    INVALID_ERROR_MESSAGE: 'O erro da API exige uma mensagem válida.',
    INVALID_ERROR_STATUS: 'O erro da API exige um estado HTTP válido.',
    INVALID_ERROR_CODE: 'O erro da API exige um código válido.',
    NETWORK_ERROR: 'Não foi possível conectar ao servidor. Verifique a conexão e tente novamente.',
    INVALID_RESPONSE: 'O servidor devolveu uma resposta inválida.',
    REQUEST_FAILED: 'Não foi possível concluir a operação com os cursos.',
    AUTHENTICATION_REQUIRED: 'Sua sessão terminou. Entre novamente para gerenciar os cursos.',
    ADMINISTRATIVE_ACCESS_REQUIRED: 'É necessário acesso administrativo para gerenciar os cursos.',
    CODE_CONFLICT: 'Já existe um curso com essa sigla, inclusive entre os cursos desativados.',
    NOT_FOUND: 'O curso informado não foi encontrado. Atualize a lista e tente novamente.',
});

const ID_PATTERN = /^[a-fA-F0-9]{24}$/;
const ERROR_CODE_PATTERN = /^[A-Z][A-Z0-9_]*$/;

/**
 * Somente combinações conhecidas de código, estado e operação são públicas.
 * As mensagens são locais: detalhes recebidos do servidor não são exibidos.
 */
const PUBLIC_ERRORS = Object.freeze({
    AUTHENTICATION_REQUIRED: Object.freeze({
        status: 401, methods: ['GET', 'POST', 'PUT', 'PATCH'],
        message: COURSE_API_MESSAGES.AUTHENTICATION_REQUIRED,
    }),
    ADMINISTRATIVE_ACCESS_REQUIRED: Object.freeze({
        status: 403, methods: ['GET', 'POST', 'PUT', 'PATCH'],
        message: COURSE_API_MESSAGES.ADMINISTRATIVE_ACCESS_REQUIRED,
    }),
    INVALID_COURSE_DATA: Object.freeze({
        status: 400, methods: ['POST', 'PUT', 'PATCH'], message: COURSE_API_MESSAGES.INVALID_DATA,
    }),
    INVALID_COURSE_ID: Object.freeze({
        status: 400, methods: ['PUT', 'PATCH'], message: COURSE_API_MESSAGES.INVALID_ID,
    }),
    INVALID_COURSE_FILTERS: Object.freeze({
        status: 400, methods: ['GET'], message: COURSE_API_MESSAGES.INVALID_FILTERS,
    }),
    COURSE_CODE_CONFLICT: Object.freeze({
        status: 409, methods: ['POST', 'PUT', 'PATCH'], message: COURSE_API_MESSAGES.CODE_CONFLICT,
    }),
    COURSE_NOT_FOUND: Object.freeze({
        status: 404, methods: ['PUT', 'PATCH'], message: COURSE_API_MESSAGES.NOT_FOUND,
    }),
});

function isObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isInputObject(value) {
    return isObject(value)
        && [Object.prototype, null].includes(Object.getPrototypeOf(value));
}

function hasText(value) {
    return typeof value === 'string' && value.trim().length > 0;
}

function normalizeText(value) {
    return value.normalize('NFC').trim().replace(/\s+/g, ' ');
}

function defaultFetchClient(input, init) {
    return globalThis.fetch(input, init);
}

/** Mensagem segura e metadados imutáveis que a tela pode interpretar. */
class CourseApiError extends Error {
    constructor(message, { statusCode = 0, code = COURSE_API_CODES.REQUEST_FAILED } = {}) {
        if (!hasText(message)) throw new TypeError(COURSE_API_MESSAGES.INVALID_ERROR_MESSAGE);
        if (!Number.isInteger(statusCode)
            || (statusCode !== 0 && (statusCode < 100 || statusCode > 599))) {
            throw new RangeError(COURSE_API_MESSAGES.INVALID_ERROR_STATUS);
        }
        if (!hasText(code) || !ERROR_CODE_PATTERN.test(code)) {
            throw new TypeError(COURSE_API_MESSAGES.INVALID_ERROR_CODE);
        }
        super(message);
        this.name = 'CourseApiError';
        Object.defineProperties(this, {
            statusCode: { value: statusCode, enumerable: true },
            code: { value: code, enumerable: true },
        });
    }
}

/**
 * Cliente do catálogo de uma instalação individual.
 *
 * Construir ou importar a instância não envia requisições. Cada operação usa
 * a sessão existente, consulta o servidor novamente e devolve somente dados
 * públicos. Não há exclusão definitiva, reativação ou cadastro de aulas aqui.
 */
class CourseApi {
    #fetchClient;

    constructor({ fetchClient = defaultFetchClient } = {}) {
        if (typeof fetchClient !== 'function') {
            throw new TypeError(COURSE_API_MESSAGES.INVALID_FETCH_CLIENT);
        }
        this.#fetchClient = fetchClient;
        this.listCourses = this.listCourses.bind(this);
        this.createCourse = this.createCourse.bind(this);
        this.updateCourse = this.updateCourse.bind(this);
        this.deactivateCourse = this.deactivateCourse.bind(this);
        Object.freeze(this);
    }

    /** Normaliza o texto sem modificar a entrada nem aceitar campos adicionais. */
    static createCourseData(input) {
        if (!isInputObject(input)
            || Reflect.ownKeys(input).length !== 2
            || !Object.hasOwn(input, 'name') || !Object.hasOwn(input, 'code')
            || typeof input.name !== 'string' || typeof input.code !== 'string') {
            throw new TypeError(COURSE_API_MESSAGES.INVALID_DATA);
        }
        const name = normalizeText(input.name);
        const code = normalizeText(input.code).toUpperCase();
        if (name.length < COURSE_API_FIELD_LIMITS.MIN_NAME_LENGTH
            || name.length > COURSE_API_FIELD_LIMITS.MAX_NAME_LENGTH
            || code.length < COURSE_API_FIELD_LIMITS.MIN_CODE_LENGTH
            || code.length > COURSE_API_FIELD_LIMITS.MAX_CODE_LENGTH) {
            throw new TypeError(COURSE_API_MESSAGES.INVALID_DATA);
        }
        return Object.freeze({ name, code });
    }

    static createCourseId(id) {
        if (typeof id !== 'string' || !ID_PATTERN.test(id)) {
            throw new TypeError(COURSE_API_MESSAGES.INVALID_ID);
        }
        return id.toLowerCase();
    }

    /** A situação é booleana; ausência do filtro inclui ativos e desativados. */
    static createListFilters(filters) {
        if (!isInputObject(filters)
            || Reflect.ownKeys(filters).some(field => field !== 'active')
            || (Object.hasOwn(filters, 'active') && typeof filters.active !== 'boolean')) {
            throw new TypeError(COURSE_API_MESSAGES.INVALID_FILTERS);
        }
        return Object.freeze(Object.hasOwn(filters, 'active') ? { active: filters.active } : {});
    }

    static createInvalidResponseError(statusCode = 0) {
        return new CourseApiError(COURSE_API_MESSAGES.INVALID_RESPONSE, {
            statusCode, code: COURSE_API_CODES.INVALID_RESPONSE,
        });
    }

    /** Reconstrói o curso recebido, descartando propriedades internas. */
    static createPublicCourse(course, statusCode = 200) {
        if (!isObject(course)
            || typeof course.id !== 'string' || !ID_PATTERN.test(course.id)
            || typeof course.name !== 'string' || typeof course.code !== 'string'
            || typeof course.active !== 'boolean') {
            throw CourseApi.createInvalidResponseError(statusCode);
        }
        let normalized;
        try {
            normalized = CourseApi.createCourseData({ name: course.name, code: course.code });
        } catch {
            throw CourseApi.createInvalidResponseError(statusCode);
        }
        if (normalized.name !== course.name || normalized.code !== course.code) {
            throw CourseApi.createInvalidResponseError(statusCode);
        }
        return Object.freeze({ id: course.id.toLowerCase(), ...normalized, active: course.active });
    }

    static createCourseResult(payload, statusCode) {
        if (!isObject(payload) || !isObject(payload.data)) {
            throw CourseApi.createInvalidResponseError(statusCode);
        }
        return CourseApi.createPublicCourse(payload.data.course, statusCode);
    }

    static createRequestError(statusCode, payload, method) {
        const code = isObject(payload) && isObject(payload.error) ? payload.error.code : undefined;
        const known = typeof code === 'string' && Object.hasOwn(PUBLIC_ERRORS, code)
            ? PUBLIC_ERRORS[code] : null;
        const accepted = known?.status === statusCode && known.methods.includes(method);
        return new CourseApiError(accepted ? known.message : COURSE_API_MESSAGES.REQUEST_FAILED, {
            statusCode, code: accepted ? code : COURSE_API_CODES.REQUEST_FAILED,
        });
    }

    /**
     * Não repete escritas automaticamente: a rede pode falhar após uma gravação.
     * Uma resposta só confirma sucesso com o estado e o JSON esperados.
     */
    async #request({ path, method, expectedStatus, body }) {
        const options = {
            method,
            headers: { Accept: 'application/json' },
            credentials: 'same-origin',
            mode: 'same-origin',
            cache: 'no-store',
            redirect: 'error',
        };
        if (body !== undefined) {
            options.headers['Content-Type'] = 'application/json';
            options.body = JSON.stringify(body);
        }
        let response;
        try {
            response = await this.#fetchClient(path, options);
        } catch {
            throw new CourseApiError(COURSE_API_MESSAGES.NETWORK_ERROR, {
                code: COURSE_API_CODES.NETWORK_ERROR,
            });
        }
        if (!isObject(response)
            || !Number.isInteger(response.status) || response.status < 100 || response.status > 599
            || typeof response.ok !== 'boolean'
            || response.ok !== (response.status >= 200 && response.status <= 299)) {
            throw CourseApi.createInvalidResponseError();
        }
        if (!response.ok) {
            let payload = null;
            if (typeof response.json === 'function') {
                try { payload = await response.json(); } catch { /* Mantém a recusa sem JSON. */ }
            }
            throw CourseApi.createRequestError(response.status, payload, method);
        }
        if (response.status !== expectedStatus || typeof response.json !== 'function') {
            throw CourseApi.createInvalidResponseError(response.status);
        }
        try { return await response.json(); } catch {
            throw CourseApi.createInvalidResponseError(response.status);
        }
    }

    /** @returns {Promise<ReadonlyArray<Readonly<object>>>} Catálogo na ordem do servidor. */
    async listCourses(filters = {}) {
        const prepared = CourseApi.createListFilters(filters);
        const query = Object.hasOwn(prepared, 'active') ? `?active=${prepared.active}` : '';
        const payload = await this.#request({
            path: `${COURSE_API_PATHS.COURSES}${query}`, method: 'GET', expectedStatus: 200,
        });
        if (!isObject(payload) || !isObject(payload.data) || !Array.isArray(payload.data.courses)) {
            throw CourseApi.createInvalidResponseError(200);
        }
        const courses = payload.data.courses.map(course => CourseApi.createPublicCourse(course));
        if (new Set(courses.map(course => course.id)).size !== courses.length) {
            throw CourseApi.createInvalidResponseError(200);
        }
        return Object.freeze(courses);
    }

    /** @returns {Promise<Readonly<object>>} Curso criado e ativo. */
    async createCourse(input) {
        const body = CourseApi.createCourseData(input);
        const payload = await this.#request({
            path: COURSE_API_PATHS.COURSES, method: 'POST', expectedStatus: 201, body,
        });
        const course = CourseApi.createCourseResult(payload, 201);
        if (!course.active || course.name !== body.name || course.code !== body.code) {
            throw CourseApi.createInvalidResponseError(201);
        }
        return course;
    }

    /** Edita os textos sem solicitar alteração da situação do curso. */
    async updateCourse(id, input) {
        const preparedId = CourseApi.createCourseId(id);
        const body = CourseApi.createCourseData(input);
        const payload = await this.#request({
            path: `${COURSE_API_PATHS.COURSES}/${preparedId}`, method: 'PUT', expectedStatus: 200, body,
        });
        const course = CourseApi.createCourseResult(payload, 200);
        if (course.id !== preparedId || course.name !== body.name || course.code !== body.code) {
            throw CourseApi.createInvalidResponseError(200);
        }
        return course;
    }

    /** Desativa sem enviar um corpo de atualização ou excluir o registro. */
    async deactivateCourse(id) {
        const preparedId = CourseApi.createCourseId(id);
        const payload = await this.#request({
            path: `${COURSE_API_PATHS.COURSES}/${preparedId}/deactivate`,
            method: 'PATCH', expectedStatus: 200,
        });
        const course = CourseApi.createCourseResult(payload, 200);
        if (course.id !== preparedId || course.active !== false) {
            throw CourseApi.createInvalidResponseError(200);
        }
        return course;
    }
}

const courseApi = new CourseApi();

export {
    COURSE_API_PATHS,
    COURSE_API_FIELD_LIMITS,
    COURSE_API_CODES,
    COURSE_API_MESSAGES,
    CourseApi,
    CourseApiError,
    courseApi,
    defaultFetchClient,
};
