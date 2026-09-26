/**
 * Caminho público da API administrativa de aulas.
 */
const LESSON_API_PATHS = Object.freeze({
    LESSONS: '/api/lessons',
});

/**
 * Códigos criados exclusivamente pelo cliente HTTP de aulas.
 *
 * Códigos públicos devolvidos pelo backend são preservados somente quando a
 * resposta possui o contrato esperado.
 */
const LESSON_API_CODES = Object.freeze({
    NETWORK_ERROR: 'LESSON_NETWORK_ERROR',
    INVALID_RESPONSE: 'INVALID_LESSON_RESPONSE',
    REQUEST_FAILED: 'LESSON_REQUEST_FAILED',
});

/**
 * Mensagens estáveis do serviço.
 *
 * As mensagens não incorporam corpo da requisição, URLs de materiais nem
 * detalhes técnicos recebidos do fetch.
 */
const LESSON_API_MESSAGES = Object.freeze({
    INVALID_FETCH_CLIENT:
        'A API de aulas exige um cliente HTTP válido.',
    INVALID_FILTERS:
        'A consulta de aulas recebeu filtros inválidos.',
    INVALID_LESSON_DATA:
        'A criação da aula recebeu dados inválidos.',
    INVALID_LESSON_ID:
        'A edição da aula recebeu um identificador inválido.',
    INVALID_LESSON_UPDATE_DATA:
        'A edição da aula recebeu dados inválidos.',
    INVALID_ERROR_MESSAGE:
        'O erro da API exige uma mensagem válida.',
    INVALID_ERROR_STATUS:
        'O erro da API exige um estado HTTP válido.',
    INVALID_ERROR_CODE:
        'O erro da API exige um código válido.',
    NETWORK_ERROR:
        'Não foi possível conectar ao servidor. Verifique a conexão e tente novamente.',
    INVALID_RESPONSE:
        'O servidor devolveu uma resposta inválida.',
    REQUEST_FAILED:
        'Não foi possível concluir a operação.',
});

/**
 * Cursos e tipos públicos pertencentes ao protótipo original.
 *
 * O frontend não importa o modelo CommonJS do backend. Estas coleções formam
 * o contrato público utilizado para preparar filtros e dados do formulário.
 */
const LESSON_API_COURSES = Object.freeze([
    'APQSA',
    'TECMKT',
    'TECADM',
]);

const LESSON_API_TYPES = Object.freeze([
    'Aula',
    'Atividade',
    'Avaliação',
]);

const LESSON_FILTER_FIELDS = Object.freeze([
    'course',
    'month',
    'fromDate',
]);

const LESSON_DATA_FIELDS = Object.freeze([
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
 * A edição utiliza uma substituição completa dos oito campos funcionais.
 */
const LESSON_UPDATE_FIELDS = LESSON_DATA_FIELDS;

const ERROR_CODE_PATTERN = /^[A-Z][A-Z0-9_]*$/;
const LESSON_ID_PATTERN = /^[a-fA-F0-9]{24}$/;
const CALENDAR_MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
const CALENDAR_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Verifica se um valor representa um objeto comum.
 *
 * @param {unknown} value Valor recebido.
 * @returns {boolean} Verdadeiro para objetos não nulos que não sejam listas.
 */
function isObject(value) {
    return (
        value !== null
        && typeof value === 'object'
        && !Array.isArray(value)
    );
}

/**
 * Verifica se um valor contém texto útil.
 *
 * @param {unknown} value Valor recebido.
 * @returns {boolean} Verdadeiro para textos que não sejam somente espaços.
 */
function hasText(value) {
    return (
        typeof value === 'string'
        && value.trim().length > 0
    );
}

/**
 * Confirma que uma data civil realmente existe.
 *
 * @param {unknown} value Data no formato YYYY-MM-DD.
 * @returns {boolean} Verdadeiro somente para uma data civil válida.
 */
function isValidCalendarDate(value) {
    if (!hasText(value)) {
        return false;
    }

    const normalizedValue = value.trim();

    if (!CALENDAR_DATE_PATTERN.test(normalizedValue)) {
        return false;
    }

    const [year, month, day] = normalizedValue
        .split('-')
        .map(Number);

    if (year < 1 || month < 1 || month > 12 || day < 1) {
        return false;
    }

    const parsedDate = new Date(0);

    parsedDate.setUTCHours(0, 0, 0, 0);
    parsedDate.setUTCFullYear(year, month - 1, day);

    return (
        parsedDate.getUTCFullYear() === year
        && parsedDate.getUTCMonth() === month - 1
        && parsedDate.getUTCDate() === day
    );
}

/**
 * Confirma que o valor representa um mês civil do contrato.
 *
 * @param {unknown} value Mês no formato YYYY-MM.
 * @returns {boolean} Verdadeiro somente para um período válido.
 */
function isValidCalendarMonth(value) {
    if (!hasText(value)) {
        return false;
    }

    const normalizedValue = value.trim();

    return (
        CALENDAR_MONTH_PATTERN.test(normalizedValue)
        && Number(normalizedValue.slice(0, 4)) >= 1
    );
}

/**
 * Cliente HTTP padrão utilizado pela interface no navegador.
 *
 * @param {RequestInfo | URL} input Endereço solicitado.
 * @param {RequestInit} init Configuração da requisição.
 * @returns {Promise<Response>} Resposta do navegador.
 */
function defaultFetchClient(input, init) {
    return globalThis.fetch(input, init);
}

/**
 * Erro conhecido produzido durante a comunicação com a API de aulas.
 */
class LessonApiError extends Error {
    /**
     * @param {string} message Mensagem segura para apresentação.
     * @param {object} options Metadados do erro.
     * @param {number} [options.statusCode=0] Estado HTTP ou zero sem resposta.
     * @param {string} options.code Código estável.
     * @param {unknown} [options.cause] Causa técnica opcional.
     */
    constructor(
        message,
        {
            statusCode = 0,
            code = LESSON_API_CODES.REQUEST_FAILED,
            cause,
        } = {},
    ) {
        if (!hasText(message)) {
            throw new TypeError(
                LESSON_API_MESSAGES.INVALID_ERROR_MESSAGE,
            );
        }

        const hasValidStatus =
            Number.isInteger(statusCode)
            && (
                statusCode === 0
                || (statusCode >= 100 && statusCode <= 599)
            );

        if (!hasValidStatus) {
            throw new RangeError(
                LESSON_API_MESSAGES.INVALID_ERROR_STATUS,
            );
        }

        if (!hasText(code) || !ERROR_CODE_PATTERN.test(code)) {
            throw new TypeError(
                LESSON_API_MESSAGES.INVALID_ERROR_CODE,
            );
        }

        super(
            message,
            cause === undefined ? undefined : { cause },
        );

        this.name = 'LessonApiError';

        Object.defineProperties(this, {
            statusCode: {
                value: statusCode,
                enumerable: true,
                writable: false,
                configurable: false,
            },
            code: {
                value: code,
                enumerable: true,
                writable: false,
                configurable: false,
            },
        });
    }
}

/**
 * Encapsula consulta, criação, edição e exclusão pela API administrativa.
 */
class LessonApi {
    /** @type {Function} */
    #fetchClient;

    /**
     * @param {object} options Dependências do serviço.
     * @param {Function} [options.fetchClient=defaultFetchClient]
     * Implementação compatível com fetch.
     */
    constructor({ fetchClient = defaultFetchClient } = {}) {
        if (typeof fetchClient !== 'function') {
            throw new TypeError(
                LESSON_API_MESSAGES.INVALID_FETCH_CLIENT,
            );
        }

        this.#fetchClient = fetchClient;
        this.listLessons = this.listLessons.bind(this);
        this.createLesson = this.createLesson.bind(this);
        this.updateLesson = this.updateLesson.bind(this);
        this.deleteLesson = this.deleteLesson.bind(this);

        Object.freeze(this);
    }

    /**
     * Prepara somente os três filtros públicos autorizados.
     *
     * Campos desconhecidos e valores indefinidos explicitamente são
     * recusados. A ordem fixa dos campos produz URLs determinísticas.
     *
     * @param {unknown} filters Filtros opcionais.
     * @returns {Readonly<object>} Filtros normalizados e imutáveis.
     */
    static createFilters(filters = {}) {
        if (!isObject(filters)) {
            throw new TypeError(
                LESSON_API_MESSAGES.INVALID_FILTERS,
            );
        }

        const receivedFields = Object.keys(filters);
        const hasUnknownField = receivedFields.some(
            (field) => !LESSON_FILTER_FIELDS.includes(field),
        );

        if (hasUnknownField) {
            throw new TypeError(
                LESSON_API_MESSAGES.INVALID_FILTERS,
            );
        }

        const preparedFilters = {};

        if (Object.hasOwn(filters, 'course')) {
            const course = hasText(filters.course)
                ? filters.course.trim()
                : null;

            if (!LESSON_API_COURSES.includes(course)) {
                throw new TypeError(
                    LESSON_API_MESSAGES.INVALID_FILTERS,
                );
            }

            preparedFilters.course = course;
        }

        if (Object.hasOwn(filters, 'month')) {
            if (!isValidCalendarMonth(filters.month)) {
                throw new TypeError(
                    LESSON_API_MESSAGES.INVALID_FILTERS,
                );
            }

            preparedFilters.month = filters.month.trim();
        }

        if (Object.hasOwn(filters, 'fromDate')) {
            if (!isValidCalendarDate(filters.fromDate)) {
                throw new TypeError(
                    LESSON_API_MESSAGES.INVALID_FILTERS,
                );
            }

            preparedFilters.fromDate = filters.fromDate.trim();
        }

        return Object.freeze(preparedFilters);
    }

    /**
     * Seleciona os campos aceitos pela criação sem reproduzir o schema.
     *
     * O cliente confirma o contrato estrutural e normaliza espaços externos.
     * Regras completas de tamanho e URLs continuam centralizadas no backend.
     * Campos opcionais ausentes permanecem ausentes para que o schema aplique
     * seus valores padrão.
     *
     * @param {unknown} lessonData Dados recebidos do formulário.
     * @returns {Readonly<object>} Dados autorizados e imutáveis.
     */
    static createLessonData(lessonData) {
        if (!isObject(lessonData)) {
            throw new TypeError(
                LESSON_API_MESSAGES.INVALID_LESSON_DATA,
            );
        }

        const receivedFields = Object.keys(lessonData);
        const hasUnknownField = receivedFields.some(
            (field) => !LESSON_DATA_FIELDS.includes(field),
        );
        const hasRequiredFields =
            isValidCalendarDate(lessonData.date)
            && hasText(lessonData.course)
            && LESSON_API_COURSES.includes(
                lessonData.course.trim(),
            )
            && hasText(lessonData.curricularUnit);

        if (hasUnknownField || !hasRequiredFields) {
            throw new TypeError(
                LESSON_API_MESSAGES.INVALID_LESSON_DATA,
            );
        }

        const preparedData = {
            date: lessonData.date.trim(),
            course: lessonData.course.trim(),
            curricularUnit: lessonData.curricularUnit.trim(),
        };

        if (Object.hasOwn(lessonData, 'type')) {
            const type = hasText(lessonData.type)
                ? lessonData.type.trim()
                : null;

            if (!LESSON_API_TYPES.includes(type)) {
                throw new TypeError(
                    LESSON_API_MESSAGES.INVALID_LESSON_DATA,
                );
            }

            preparedData.type = type;
        }

        const appendNullableText = (field) => {
            if (!Object.hasOwn(lessonData, field)) {
                return;
            }

            const value = lessonData[field];

            if (value !== null && typeof value !== 'string') {
                throw new TypeError(
                    LESSON_API_MESSAGES.INVALID_LESSON_DATA,
                );
            }

            preparedData[field] = typeof value === 'string'
                ? (value.trim().length > 0 ? value.trim() : null)
                : null;
        };

        appendNullableText('lessonNumber');

        if (Object.hasOwn(lessonData, 'needsReview')) {
            if (typeof lessonData.needsReview !== 'boolean') {
                throw new TypeError(
                    LESSON_API_MESSAGES.INVALID_LESSON_DATA,
                );
            }

            preparedData.needsReview = lessonData.needsReview;
        }

        appendNullableText('lessonPlanUrl');
        appendNullableText('studentGuideUrl');

        return Object.freeze(preparedData);
    }

    /**
     * Valida e normaliza o identificador utilizado na edição.
     *
     * @param {unknown} lessonId Identificador recebido da interface.
     * @returns {string} Identificador MongoDB normalizado.
     */
    static createLessonId(lessonId) {
        const normalizedId = hasText(lessonId)
            ? lessonId.trim()
            : '';

        if (!LESSON_ID_PATTERN.test(normalizedId)) {
            throw new TypeError(
                LESSON_API_MESSAGES.INVALID_LESSON_ID,
            );
        }

        return normalizedId;
    }

    /**
     * Prepara a substituição completa de uma aula existente.
     *
     * Todos os oito campos devem estar presentes para que uma edição não
     * remova informações por acidente. Campos opcionais podem utilizar null
     * para representar uma remoção explícita.
     *
     * @param {unknown} lessonData Estado completo recebido do formulário.
     * @returns {Readonly<object>} Dados normalizados e imutáveis.
     */
    static createLessonUpdateData(lessonData) {
        const hasCompleteStructure =
            isObject(lessonData)
            && Object.keys(lessonData).length
                === LESSON_UPDATE_FIELDS.length
            && LESSON_UPDATE_FIELDS.every(
                (field) => Object.hasOwn(lessonData, field),
            );

        if (!hasCompleteStructure) {
            throw new TypeError(
                LESSON_API_MESSAGES.INVALID_LESSON_UPDATE_DATA,
            );
        }

        try {
            return LessonApi.createLessonData(lessonData);
        } catch (error) {
            if (
                error instanceof TypeError
                && error.message
                    === LESSON_API_MESSAGES.INVALID_LESSON_DATA
            ) {
                throw new TypeError(
                    LESSON_API_MESSAGES.INVALID_LESSON_UPDATE_DATA,
                );
            }

            throw error;
        }
    }

    /**
     * Seleciona somente os nove campos públicos de uma aula.
     *
     * @param {unknown} lesson Candidato recebido do backend.
     * @returns {Readonly<object>} Aula pública imutável.
     */
    static createPublicLesson(lesson) {
        const hasValidNullableText = (value) => (
            value === null || hasText(value)
        );
        const isValid =
            isObject(lesson)
            && hasText(lesson.id)
            && isValidCalendarDate(lesson.date)
            && LESSON_API_COURSES.includes(lesson.course)
            && hasText(lesson.curricularUnit)
            && LESSON_API_TYPES.includes(lesson.type)
            && hasValidNullableText(lesson.lessonNumber)
            && typeof lesson.needsReview === 'boolean'
            && hasValidNullableText(lesson.lessonPlanUrl)
            && hasValidNullableText(lesson.studentGuideUrl);

        if (!isValid) {
            throw LessonApi.createInvalidResponseError();
        }

        return Object.freeze({
            id: lesson.id.trim(),
            date: lesson.date.trim(),
            course: lesson.course,
            curricularUnit: lesson.curricularUnit.trim(),
            type: lesson.type,
            lessonNumber: lesson.lessonNumber === null
                ? null
                : lesson.lessonNumber.trim(),
            needsReview: lesson.needsReview,
            lessonPlanUrl: lesson.lessonPlanUrl === null
                ? null
                : lesson.lessonPlanUrl.trim(),
            studentGuideUrl: lesson.studentGuideUrl === null
                ? null
                : lesson.studentGuideUrl.trim(),
        });
    }

    /**
     * Valida o envelope de uma consulta e congela também a lista resultante.
     *
     * @param {unknown} payload Corpo devolvido pelo servidor.
     * @returns {ReadonlyArray<Readonly<object>>} Aulas públicas.
     */
    static createPublicLessonList(payload) {
        const lessons = isObject(payload?.data)
            ? payload.data.lessons
            : null;

        if (!Array.isArray(lessons)) {
            throw LessonApi.createInvalidResponseError();
        }

        try {
            return Object.freeze(
                lessons.map(LessonApi.createPublicLesson),
            );
        } catch (error) {
            if (error instanceof LessonApiError) {
                throw error;
            }

            throw LessonApi.createInvalidResponseError(0, error);
        }
    }

    /**
     * Valida o envelope de uma criação.
     *
     * @param {unknown} payload Corpo devolvido pelo servidor.
     * @returns {Readonly<object>} Aula criada.
     */
    static createPublicCreatedLesson(payload) {
        const lesson = isObject(payload?.data)
            ? payload.data.lesson
            : null;

        return LessonApi.createPublicLesson(lesson);
    }

    /**
     * Cria o erro utilizado para respostas de sucesso malformadas.
     *
     * @param {number} [statusCode=0] Estado HTTP recebido.
     * @param {unknown} [cause] Causa técnica da leitura.
     * @returns {LessonApiError} Erro seguro.
     */
    static createInvalidResponseError(statusCode = 0, cause) {
        return new LessonApiError(
            LESSON_API_MESSAGES.INVALID_RESPONSE,
            {
                statusCode,
                code: LESSON_API_CODES.INVALID_RESPONSE,
                cause,
            },
        );
    }

    /**
     * Converte uma resposta HTTP recusada em erro público seguro.
     *
     * @param {number} statusCode Estado HTTP recebido.
     * @param {unknown} payload Corpo interpretado, quando disponível.
     * @returns {LessonApiError} Erro seguro.
     */
    static createRequestError(statusCode, payload) {
        const responseError = isObject(payload)
            ? payload.error
            : null;
        const hasValidPublicError =
            isObject(responseError)
            && hasText(responseError.message)
            && hasText(responseError.code)
            && ERROR_CODE_PATTERN.test(responseError.code);

        return new LessonApiError(
            hasValidPublicError
                ? responseError.message
                : LESSON_API_MESSAGES.REQUEST_FAILED,
            {
                statusCode,
                code: hasValidPublicError
                    ? responseError.code
                    : LESSON_API_CODES.REQUEST_FAILED,
            },
        );
    }

    /**
     * Executa uma requisição e valida seu contrato HTTP básico.
     *
     * @param {object} request Configuração interna.
     * @param {string} request.path Caminho relativo.
     * @param {'GET' | 'POST' | 'PUT' | 'DELETE'} request.method
     * Método HTTP.
     * @param {number} request.expectedStatus Estado esperado.
     * @param {object} [request.body] Corpo opcional.
     * @returns {Promise<unknown|null>} Corpo JSON ou null para 204.
     */
    async #request({ path, method, expectedStatus, body }) {
        const headers = {
            Accept: 'application/json',
        };
        const requestOptions = {
            method,
            headers,
            credentials: 'same-origin',
            cache: 'no-store',
        };

        if (body !== undefined) {
            headers['Content-Type'] = 'application/json';
            requestOptions.body = JSON.stringify(body);
        }

        let response;

        try {
            response = await this.#fetchClient(
                path,
                requestOptions,
            );
        } catch (cause) {
            throw new LessonApiError(
                LESSON_API_MESSAGES.NETWORK_ERROR,
                {
                    code: LESSON_API_CODES.NETWORK_ERROR,
                    cause,
                },
            );
        }

        const hasValidResponse =
            isObject(response)
            && Number.isInteger(response.status)
            && response.status >= 100
            && response.status <= 599
            && typeof response.ok === 'boolean';

        if (!hasValidResponse) {
            throw LessonApi.createInvalidResponseError();
        }

        if (!response.ok) {
            let errorPayload = null;

            if (typeof response.json === 'function') {
                try {
                    errorPayload = await response.json();
                } catch {
                    /**
                     * Uma resposta recusada sem JSON válido continua sendo
                     * convertida no erro genérico do cliente.
                     */
                }
            }

            throw LessonApi.createRequestError(
                response.status,
                errorPayload,
            );
        }

        if (response.status !== expectedStatus) {
            throw LessonApi.createInvalidResponseError(
                response.status,
            );
        }

        if (expectedStatus === 204) {
            return null;
        }

        if (typeof response.json !== 'function') {
            throw LessonApi.createInvalidResponseError(
                response.status,
            );
        }

        try {
            return await response.json();
        } catch (cause) {
            throw LessonApi.createInvalidResponseError(
                response.status,
                cause,
            );
        }
    }

    /**
     * Consulta aulas com filtros opcionais em ordem determinística.
     *
     * @param {object} [filters={}] Filtros públicos.
     * @returns {Promise<ReadonlyArray<Readonly<object>>>} Aulas públicas.
     */
    async listLessons(filters = {}) {
        const preparedFilters = LessonApi.createFilters(filters);
        const searchParameters = new URLSearchParams();

        for (const field of LESSON_FILTER_FIELDS) {
            if (Object.hasOwn(preparedFilters, field)) {
                searchParameters.set(field, preparedFilters[field]);
            }
        }

        const query = searchParameters.toString();
        const path = query.length > 0
            ? `${LESSON_API_PATHS.LESSONS}?${query}`
            : LESSON_API_PATHS.LESSONS;
        const payload = await this.#request({
            path,
            method: 'GET',
            expectedStatus: 200,
        });

        return LessonApi.createPublicLessonList(payload);
    }

    /**
     * Cria uma aula e devolve somente sua representação pública.
     *
     * @param {object} lessonData Dados recebidos do formulário.
     * @returns {Promise<Readonly<object>>} Aula criada.
     */
    async createLesson(lessonData) {
        const preparedData = LessonApi.createLessonData(lessonData);
        const payload = await this.#request({
            path: LESSON_API_PATHS.LESSONS,
            method: 'POST',
            expectedStatus: 201,
            body: preparedData,
        });

        return LessonApi.createPublicCreatedLesson(payload);
    }

    /**
     * Substitui os dados funcionais de uma aula existente.
     *
     * @param {string} lessonId Identificador público da aula.
     * @param {object} lessonData Estado completo recebido do formulário.
     * @returns {Promise<Readonly<object>>} Aula atualizada.
     */
    async updateLesson(lessonId, lessonData) {
        const preparedId = LessonApi.createLessonId(lessonId);
        const preparedData =
            LessonApi.createLessonUpdateData(lessonData);
        const payload = await this.#request({
            path: LESSON_API_PATHS.LESSONS + '/' + preparedId,
            method: 'PUT',
            expectedStatus: 200,
            body: preparedData,
        });

        return LessonApi.createPublicCreatedLesson(payload);
    }

    /**
     * Exclui uma aula pelo identificador público.
     *
     * A API responde 204 sem corpo. A operação não envia conteúdo e não
     * devolve representação, evitando que dados removidos permaneçam na
     * camada visual como se ainda fossem um estado atual.
     *
     * @param {string} lessonId Identificador público da aula.
     * @returns {Promise<void>}
     */
    async deleteLesson(lessonId) {
        const preparedId = LessonApi.createLessonId(lessonId);

        await this.#request({
            path: LESSON_API_PATHS.LESSONS + '/' + preparedId,
            method: 'DELETE',
            expectedStatus: 204,
        });
    }
}

/**
 * Instância padrão utilizada pela interface real.
 */
const lessonApi = new LessonApi();

export {
    LESSON_API_CODES,
    LESSON_API_COURSES,
    LESSON_API_MESSAGES,
    LESSON_API_PATHS,
    LESSON_API_TYPES,
    LESSON_DATA_FIELDS,
    LESSON_FILTER_FIELDS,
    LESSON_ID_PATTERN,
    LESSON_UPDATE_FIELDS,
    LessonApi,
    LessonApiError,
    defaultFetchClient,
    lessonApi,
};
