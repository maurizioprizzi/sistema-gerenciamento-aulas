/**
 * Caminho público da API administrativa de materiais mensais.
 */
const MONTHLY_MATERIAL_API_PATHS = Object.freeze({
    MONTHLY_MATERIALS: '/api/monthly-materials',
});

/**
 * Códigos criados exclusivamente pelo cliente HTTP mensal.
 *
 * Códigos públicos devolvidos pelo backend são preservados somente quando a
 * resposta possui o contrato seguro esperado.
 */
const MONTHLY_MATERIAL_API_CODES = Object.freeze({
    NETWORK_ERROR: 'MONTHLY_MATERIAL_NETWORK_ERROR',
    INVALID_RESPONSE: 'INVALID_MONTHLY_MATERIAL_RESPONSE',
    REQUEST_FAILED: 'MONTHLY_MATERIAL_REQUEST_FAILED',
});

/**
 * Mensagens estáveis utilizadas pelo cliente de materiais mensais.
 *
 * Nenhuma mensagem incorpora o mês consultado, os links recebidos ou detalhes
 * técnicos do cliente HTTP.
 */
const MONTHLY_MATERIAL_API_MESSAGES = Object.freeze({
    INVALID_FETCH_CLIENT:
        'A API de materiais mensais exige um cliente HTTP válido.',
    INVALID_MONTH:
        'A operação de materiais mensais exige um mês válido.',
    INVALID_MATERIAL_DATA:
        'A gravação dos materiais mensais recebeu dados inválidos.',
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
 * Campos públicos aceitos pelo corpo da substituição mensal.
 */
const MONTHLY_MATERIAL_DATA_FIELDS = Object.freeze([
    'lessonPlanUrl',
    'studentGuideUrl',
]);

const ERROR_CODE_PATTERN = /^[A-Z][A-Z0-9_]*$/;
const CALENDAR_MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

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
 * Erro conhecido produzido durante a comunicação com a API mensal.
 */
class MonthlyMaterialApiError extends Error {
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
            code = MONTHLY_MATERIAL_API_CODES.REQUEST_FAILED,
            cause,
        } = {},
    ) {
        if (!hasText(message)) {
            throw new TypeError(
                MONTHLY_MATERIAL_API_MESSAGES.INVALID_ERROR_MESSAGE,
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
                MONTHLY_MATERIAL_API_MESSAGES.INVALID_ERROR_STATUS,
            );
        }

        if (!hasText(code) || !ERROR_CODE_PATTERN.test(code)) {
            throw new TypeError(
                MONTHLY_MATERIAL_API_MESSAGES.INVALID_ERROR_CODE,
            );
        }

        super(
            message,
            cause === undefined ? undefined : { cause },
        );

        this.name = 'MonthlyMaterialApiError';

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
 * Encapsula listagem, consulta, substituição e exclusão dos materiais mensais.
 */
class MonthlyMaterialApi {
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
                MONTHLY_MATERIAL_API_MESSAGES.INVALID_FETCH_CLIENT,
            );
        }

        this.#fetchClient = fetchClient;
        this.listMonthlyMaterials =
            this.listMonthlyMaterials.bind(this);
        this.getMonthlyMaterial = this.getMonthlyMaterial.bind(this);
        this.saveMonthlyMaterial = this.saveMonthlyMaterial.bind(this);
        this.deleteMonthlyMaterial =
            this.deleteMonthlyMaterial.bind(this);

        Object.freeze(this);
    }

    /**
     * Valida e normaliza o mês utilizado no caminho da API.
     *
     * @param {unknown} month Mês no formato YYYY-MM.
     * @returns {string} Mês pronto para compor o caminho.
     * @throws {TypeError} Quando o período é inválido.
     */
    static createMonth(month) {
        if (!isValidCalendarMonth(month)) {
            throw new TypeError(
                MONTHLY_MATERIAL_API_MESSAGES.INVALID_MONTH,
            );
        }

        return month.trim();
    }

    /**
     * Prepara os dois links públicos da substituição mensal.
     *
     * A operação PUT representa o estado completo do mês. Por isso, campos
     * omitidos ou textos vazios tornam-se `null`, permitindo remover um link
     * anteriormente registrado sem criar outra operação HTTP.
     *
     * @param {unknown} materialData Dados recebidos do formulário.
     * @returns {Readonly<object>} Corpo público e imutável da requisição.
     * @throws {TypeError} Quando a estrutura ou algum campo é inválido.
     */
    static createMaterialData(materialData) {
        if (!isObject(materialData)) {
            throw new TypeError(
                MONTHLY_MATERIAL_API_MESSAGES.INVALID_MATERIAL_DATA,
            );
        }

        const receivedFields = Object.keys(materialData);
        const hasUnknownField = receivedFields.some(
            (field) => !MONTHLY_MATERIAL_DATA_FIELDS.includes(field),
        );

        if (hasUnknownField) {
            throw new TypeError(
                MONTHLY_MATERIAL_API_MESSAGES.INVALID_MATERIAL_DATA,
            );
        }

        const preparedData = {};

        for (const field of MONTHLY_MATERIAL_DATA_FIELDS) {
            const value = Object.hasOwn(materialData, field)
                ? materialData[field]
                : null;

            if (value !== null && typeof value !== 'string') {
                throw new TypeError(
                    MONTHLY_MATERIAL_API_MESSAGES.INVALID_MATERIAL_DATA,
                );
            }

            preparedData[field] =
                typeof value === 'string' && value.trim().length > 0
                    ? value.trim()
                    : null;
        }

        return Object.freeze(preparedData);
    }

    /**
     * Reconstrói um material mensal somente com seus quatro campos públicos.
     *
     * @param {unknown} material Material recebido do backend.
     * @returns {Readonly<object>} Representação pública independente.
     * @throws {MonthlyMaterialApiError} Quando a estrutura é inconsistente.
     */
    static createPublicMonthlyMaterial(material) {
        const hasRequiredFields =
            isObject(material)
            && hasText(material.id)
            && isValidCalendarMonth(material.month);

        const hasValidLinks =
            hasRequiredFields
            && (
                material.lessonPlanUrl === null
                || typeof material.lessonPlanUrl === 'string'
            )
            && (
                material.studentGuideUrl === null
                || typeof material.studentGuideUrl === 'string'
            );

        if (!hasValidLinks) {
            throw new MonthlyMaterialApiError(
                MONTHLY_MATERIAL_API_MESSAGES.INVALID_RESPONSE,
                {
                    code:
                        MONTHLY_MATERIAL_API_CODES.INVALID_RESPONSE,
                },
            );
        }

        return Object.freeze({
            id: material.id.trim(),
            month: material.month.trim(),
            lessonPlanUrl: material.lessonPlanUrl,
            studentGuideUrl: material.studentGuideUrl,
        });
    }

    /**
     * Lê o envelope mensal aceitando a ausência normal de um cadastro.
     *
     * @param {unknown} payload Corpo JSON recebido.
     * @returns {Readonly<object>|null} Material público ou ausência.
     * @throws {MonthlyMaterialApiError} Quando o envelope é inválido.
     */
    static createPublicMonthlyMaterialResult(payload) {
        if (
            !isObject(payload)
            || !isObject(payload.data)
            || !Object.hasOwn(payload.data, 'material')
        ) {
            throw new MonthlyMaterialApiError(
                MONTHLY_MATERIAL_API_MESSAGES.INVALID_RESPONSE,
                {
                    code:
                        MONTHLY_MATERIAL_API_CODES.INVALID_RESPONSE,
                },
            );
        }

        if (payload.data.material === null) {
            return null;
        }

        return MonthlyMaterialApi.createPublicMonthlyMaterial(
            payload.data.material,
        );
    }

    /**
     * Reconstrói a coleção mensal sem conservar propriedades adicionais.
     *
     * A ordem definida pelo backend é preservada para que os períodos mais
     * recentes continuem aparecendo primeiro na tabela administrativa.
     *
     * @param {unknown} payload Corpo JSON recebido.
     * @returns {ReadonlyArray<Readonly<object>>} Materiais públicos.
     * @throws {MonthlyMaterialApiError} Quando o envelope é inválido.
     */
    static createPublicMonthlyMaterialList(payload) {
        if (
            !isObject(payload)
            || !isObject(payload.data)
            || !Array.isArray(payload.data.materials)
        ) {
            throw MonthlyMaterialApi.createInvalidResponseError();
        }

        try {
            return Object.freeze(
                payload.data.materials.map((material) => (
                    MonthlyMaterialApi
                        .createPublicMonthlyMaterial(material)
                )),
            );
        } catch (error) {
            if (error instanceof MonthlyMaterialApiError) {
                throw MonthlyMaterialApi.createInvalidResponseError();
            }

            throw error;
        }
    }

    /**
     * Confirma a estrutura mínima exigida de uma resposta semelhante a fetch.
     *
     * @param {unknown} response Resposta recebida do cliente HTTP.
     * @returns {boolean} Verdadeiro quando estado e leitura JSON existem.
     */
    static isValidResponse(response) {
        return (
            isObject(response)
            && Number.isInteger(response.status)
            && response.status >= 100
            && response.status <= 599
            && typeof response.json === 'function'
        );
    }

    /**
     * Cria o erro utilizado para respostas de sucesso malformadas.
     *
     * @param {number} [statusCode=0] Estado HTTP recebido.
     * @param {unknown} [cause] Causa técnica da leitura.
     * @returns {MonthlyMaterialApiError} Erro público seguro.
     */
    static createInvalidResponseError(statusCode = 0, cause) {
        return new MonthlyMaterialApiError(
            MONTHLY_MATERIAL_API_MESSAGES.INVALID_RESPONSE,
            {
                statusCode,
                code: MONTHLY_MATERIAL_API_CODES.INVALID_RESPONSE,
                cause,
            },
        );
    }

    /**
     * Converte uma recusa HTTP em erro público conhecido ou genérico.
     *
     * @param {number} statusCode Estado HTTP recebido.
     * @param {unknown} payload Corpo eventualmente devolvido.
     * @returns {MonthlyMaterialApiError} Erro seguro para a interface.
     */
    static createRequestError(statusCode, payload) {
        const hasPublicError =
            isObject(payload)
            && isObject(payload.error)
            && hasText(payload.error.message)
            && hasText(payload.error.code)
            && ERROR_CODE_PATTERN.test(payload.error.code);

        if (hasPublicError) {
            return new MonthlyMaterialApiError(
                payload.error.message,
                {
                    statusCode,
                    code: payload.error.code,
                },
            );
        }

        return new MonthlyMaterialApiError(
            MONTHLY_MATERIAL_API_MESSAGES.REQUEST_FAILED,
            {
                statusCode,
                code: MONTHLY_MATERIAL_API_CODES.REQUEST_FAILED,
            },
        );
    }

    /**
     * Executa uma requisição e aplica o tratamento comum de transporte.
     *
     * @param {object} options Opções internas.
     * @param {string} options.path Caminho relativo.
     * @param {string} options.method Método HTTP.
     * @param {number} options.expectedStatus Estado de sucesso esperado.
     * @param {Readonly<object>} [options.body] Corpo JSON opcional.
     * @returns {Promise<unknown>} Corpo JSON validamente recebido.
     */
    async #request({ path, method, expectedStatus, body }) {
        const requestOptions = {
            method,
            headers: {
                Accept: 'application/json',
            },
            credentials: 'same-origin',
            cache: 'no-store',
        };

        if (body !== undefined) {
            requestOptions.headers['Content-Type'] =
                'application/json';
            requestOptions.body = JSON.stringify(body);
        }

        let response;

        try {
            response = await this.#fetchClient(path, requestOptions);
        } catch (cause) {
            throw new MonthlyMaterialApiError(
                MONTHLY_MATERIAL_API_MESSAGES.NETWORK_ERROR,
                {
                    code: MONTHLY_MATERIAL_API_CODES.NETWORK_ERROR,
                    cause,
                },
            );
        }

        if (!MonthlyMaterialApi.isValidResponse(response)) {
            throw MonthlyMaterialApi.createInvalidResponseError();
        }

        if (response.status === expectedStatus && expectedStatus === 204) {
            return null;
        }

        let payload;

        try {
            payload = await response.json();
        } catch (cause) {
            if (response.status === expectedStatus) {
                throw MonthlyMaterialApi.createInvalidResponseError(
                    response.status,
                    cause,
                );
            }

            throw MonthlyMaterialApi.createRequestError(
                response.status,
                null,
            );
        }

        if (response.status !== expectedStatus) {
            if (response.status >= 200 && response.status <= 299) {
                throw MonthlyMaterialApi.createInvalidResponseError(
                    response.status,
                );
            }

            throw MonthlyMaterialApi.createRequestError(
                response.status,
                payload,
            );
        }

        return payload;
    }

    /**
     * Lista todos os recursos mensais na ordem devolvida pelo backend.
     *
     * @returns {Promise<ReadonlyArray<Readonly<object>>>} Coleção pública.
     */
    async listMonthlyMaterials() {
        const payload = await this.#request({
            path: MONTHLY_MATERIAL_API_PATHS.MONTHLY_MATERIALS,
            method: 'GET',
            expectedStatus: 200,
        });

        return MonthlyMaterialApi
            .createPublicMonthlyMaterialList(payload);
    }

    /**
     * Consulta os links registrados para um mês.
     *
     * @param {unknown} month Mês no formato YYYY-MM.
     * @returns {Promise<Readonly<object>|null>} Material ou ausência normal.
     */
    async getMonthlyMaterial(month) {
        const preparedMonth = MonthlyMaterialApi.createMonth(month);
        const payload = await this.#request({
            path:
                `${MONTHLY_MATERIAL_API_PATHS.MONTHLY_MATERIALS}`
                + `/${encodeURIComponent(preparedMonth)}`,
            method: 'GET',
            expectedStatus: 200,
        });

        return MonthlyMaterialApi
            .createPublicMonthlyMaterialResult(payload);
    }

    /**
     * Cria ou substitui integralmente os dois links de um mês.
     *
     * @param {unknown} month Mês no formato YYYY-MM.
     * @param {unknown} materialData Links recebidos do formulário.
     * @returns {Promise<Readonly<object>>} Estado mensal persistido.
     */
    async saveMonthlyMaterial(month, materialData) {
        const preparedMonth = MonthlyMaterialApi.createMonth(month);
        const preparedData = MonthlyMaterialApi.createMaterialData(
            materialData,
        );
        const payload = await this.#request({
            path:
                `${MONTHLY_MATERIAL_API_PATHS.MONTHLY_MATERIALS}`
                + `/${encodeURIComponent(preparedMonth)}`,
            method: 'PUT',
            expectedStatus: 200,
            body: preparedData,
        });
        const material = MonthlyMaterialApi
            .createPublicMonthlyMaterialResult(payload);

        if (material === null) {
            throw MonthlyMaterialApi.createInvalidResponseError(200);
        }

        return material;
    }

    /**
     * Exclui o recurso mensal indicado, aceitando a ausência como sucesso.
     *
     * O backend responde 204 tanto para um recurso existente quanto para uma
     * repetição da mesma exclusão. Nenhum corpo é lido nesse estado.
     *
     * @param {unknown} month Mês no formato YYYY-MM.
     * @returns {Promise<void>}
     */
    async deleteMonthlyMaterial(month) {
        const preparedMonth = MonthlyMaterialApi.createMonth(month);

        await this.#request({
            path:
                `${MONTHLY_MATERIAL_API_PATHS.MONTHLY_MATERIALS}`
                + `/${encodeURIComponent(preparedMonth)}`,
            method: 'DELETE',
            expectedStatus: 204,
        });
    }
}

/**
 * Instância padrão utilizada pela interface real.
 */
const monthlyMaterialApi = new MonthlyMaterialApi();

export {
    MONTHLY_MATERIAL_API_CODES,
    MONTHLY_MATERIAL_API_MESSAGES,
    MONTHLY_MATERIAL_API_PATHS,
    MONTHLY_MATERIAL_DATA_FIELDS,
    MonthlyMaterialApi,
    MonthlyMaterialApiError,
    defaultFetchClient,
    monthlyMaterialApi,
};
