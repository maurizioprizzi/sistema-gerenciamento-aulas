/**
 * Caminhos relativos à origem da aplicação, como nos demais clientes HTTP.
 * O convite nunca é incluído no endereço da requisição.
 */
const INITIAL_SETUP_API_PATHS = Object.freeze({
    STATUS: '/api/setup/status',
    CREATE_ADMIN: '/api/setup/admin',
});

const INITIAL_SETUP_API_CODES = Object.freeze({
    NETWORK_ERROR: 'INITIAL_SETUP_NETWORK_ERROR',
    INVALID_RESPONSE: 'INVALID_INITIAL_SETUP_RESPONSE',
    REQUEST_FAILED: 'INITIAL_SETUP_REQUEST_FAILED',
});

const INITIAL_SETUP_API_MESSAGES = Object.freeze({
    INVALID_FETCH_CLIENT:
        'A API de primeiro cadastro exige um cliente HTTP válido.',
    INVALID_DATA:
        'Informe nome, e-mail e senha válidos para o cadastro inicial.',
    INVALID_NAME:
        'O nome deve possuir entre 2 e 120 caracteres.',
    INVALID_EMAIL:
        'Informe um e-mail válido com no máximo 254 caracteres.',
    INVALID_PASSWORD:
        'A senha deve possuir pelo menos 12 caracteres, não conter somente espaços e ter no máximo 72 bytes em UTF-8.',
    INVALID_INVITATION:
        'O convite de primeiro acesso é inválido.',
    UNAVAILABLE:
        'O cadastro inicial não está disponível nesta instalação.',
    FORBIDDEN_ORIGIN:
        'A origem desta requisição não está autorizada para o primeiro cadastro.',
    UNSUPPORTED_MEDIA_TYPE:
        'O primeiro cadastro aceita somente requisições JSON.',
    RATE_LIMITED:
        'Muitas tentativas de primeiro cadastro foram realizadas. Aguarde alguns minutos e tente novamente.',
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
        'Não foi possível concluir o primeiro cadastro.',
});

const INVITATION_PATTERN = /^[a-fA-F0-9]{64}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ERROR_CODE_PATTERN = /^[A-Z][A-Z0-9_]*$/;

/**
 * Apenas estas combinações de estado e código representam recusas públicas
 * conhecidas. A mensagem é local: texto, detalhes ou valores privados de uma
 * resposta inesperada não são incorporados ao erro apresentado pela interface.
 */
const PUBLIC_CREATION_ERRORS = Object.freeze({
    INITIAL_SETUP_INVALID_DATA: Object.freeze({
        statusCode: 400,
        message: INITIAL_SETUP_API_MESSAGES.INVALID_DATA,
    }),
    INITIAL_SETUP_INVALID_INVITATION: Object.freeze({
        statusCode: 403,
        message: INITIAL_SETUP_API_MESSAGES.INVALID_INVITATION,
    }),
    INITIAL_SETUP_FORBIDDEN_ORIGIN: Object.freeze({
        statusCode: 403,
        message: INITIAL_SETUP_API_MESSAGES.FORBIDDEN_ORIGIN,
    }),
    INITIAL_SETUP_UNAVAILABLE: Object.freeze({
        statusCode: 409,
        message: INITIAL_SETUP_API_MESSAGES.UNAVAILABLE,
    }),
    INITIAL_SETUP_UNSUPPORTED_MEDIA_TYPE: Object.freeze({
        statusCode: 415,
        message: INITIAL_SETUP_API_MESSAGES.UNSUPPORTED_MEDIA_TYPE,
    }),
    INITIAL_SETUP_RATE_LIMITED: Object.freeze({
        statusCode: 429,
        message: INITIAL_SETUP_API_MESSAGES.RATE_LIMITED,
    }),
});

function isObject(value) {
    return value !== null
        && typeof value === 'object'
        && !Array.isArray(value);
}

function hasText(value) {
    return typeof value === 'string' && value.trim().length > 0;
}

function defaultFetchClient(input, init) {
    return globalThis.fetch(input, init);
}

/** Erro com mensagem pública e metadados estáveis para a interface. */
class InitialSetupApiError extends Error {
    constructor(message, {
        statusCode = 0,
        code = INITIAL_SETUP_API_CODES.REQUEST_FAILED,
    } = {}) {
        if (!hasText(message)) {
            throw new TypeError(INITIAL_SETUP_API_MESSAGES.INVALID_ERROR_MESSAGE);
        }
        if (
            !Number.isInteger(statusCode)
            || (statusCode !== 0 && (statusCode < 100 || statusCode > 599))
        ) {
            throw new RangeError(INITIAL_SETUP_API_MESSAGES.INVALID_ERROR_STATUS);
        }
        if (!hasText(code) || !ERROR_CODE_PATTERN.test(code)) {
            throw new TypeError(INITIAL_SETUP_API_MESSAGES.INVALID_ERROR_CODE);
        }

        super(message);
        this.name = 'InitialSetupApiError';
        Object.defineProperties(this, {
            statusCode: { value: statusCode, enumerable: true },
            code: { value: code, enumerable: true },
        });
    }
}

/**
 * Consulta e primeiro cadastro de uma instalação independente.
 *
 * Não mantém credenciais na instância, não acessa armazenamento do navegador
 * e não inicia uma sessão. Após criar a conta, o login continua pertencendo
 * à AuthenticationApi. Construir ou importar este serviço não envia pedidos.
 */
class InitialSetupApi {
    #fetchClient;

    constructor({ fetchClient = defaultFetchClient } = {}) {
        if (typeof fetchClient !== 'function') {
            throw new TypeError(INITIAL_SETUP_API_MESSAGES.INVALID_FETCH_CLIENT);
        }
        this.#fetchClient = fetchClient;
        this.getStatus = this.getStatus.bind(this);
        this.createAdmin = this.createAdmin.bind(this);
        Object.freeze(this);
    }

    /**
     * Seleciona somente os quatro campos do contrato. Nome e e-mail recebem
     * a mesma normalização do servidor; senha e convite não são transformados.
     * A validação do navegador não substitui as regras obrigatórias da API.
     *
     * @param {unknown} input Dados recebidos do formulário.
     * @returns {Readonly<object>} Corpo independente da entrada original.
     */
    static createAccountData(input) {
        if (!isObject(input)) {
            throw new TypeError(INITIAL_SETUP_API_MESSAGES.INVALID_DATA);
        }
        if (
            typeof input.invitationToken !== 'string'
            || !INVITATION_PATTERN.test(input.invitationToken)
        ) {
            throw new TypeError(INITIAL_SETUP_API_MESSAGES.INVALID_INVITATION);
        }

        const name = typeof input.name === 'string'
            ? input.name.trim().replace(/\s+/g, ' ') : '';
        const email = typeof input.email === 'string'
            ? input.email.trim().toLowerCase() : '';

        if (name.length < 2 || name.length > 120) {
            throw new TypeError(INITIAL_SETUP_API_MESSAGES.INVALID_NAME);
        }
        if (email.length > 254 || !EMAIL_PATTERN.test(email)) {
            throw new TypeError(INITIAL_SETUP_API_MESSAGES.INVALID_EMAIL);
        }
        if (
            !hasText(input.password)
            || input.password.length < 12
            || new TextEncoder().encode(input.password).byteLength > 72
        ) {
            throw new TypeError(INITIAL_SETUP_API_MESSAGES.INVALID_PASSWORD);
        }

        return Object.freeze({
            invitationToken: input.invitationToken,
            name,
            email,
            password: input.password,
        });
    }

    static createInvalidResponseError(statusCode = 0) {
        return new InitialSetupApiError(
            INITIAL_SETUP_API_MESSAGES.INVALID_RESPONSE,
            { statusCode, code: INITIAL_SETUP_API_CODES.INVALID_RESPONSE },
        );
    }

    /** Não preserva mensagens, detalhes ou causas técnicas recebidas. */
    static createRequestError(statusCode, payload, method) {
        const responseError = isObject(payload) && isObject(payload.error)
            ? payload.error : null;
        const code = responseError?.code;
        const knownError = method === 'POST'
            && typeof code === 'string'
            && Object.hasOwn(PUBLIC_CREATION_ERRORS, code)
            ? PUBLIC_CREATION_ERRORS[code] : null;
        const isKnown = knownError?.statusCode === statusCode;

        return new InitialSetupApiError(
            isKnown ? knownError.message : INITIAL_SETUP_API_MESSAGES.REQUEST_FAILED,
            {
                statusCode,
                code: isKnown ? code : INITIAL_SETUP_API_CODES.REQUEST_FAILED,
            },
        );
    }

    async #request({ path, method, expectedStatus, body }) {
        const headers = { Accept: 'application/json' };
        const options = {
            method,
            headers,
            credentials: 'same-origin',
            mode: 'same-origin',
            cache: 'no-store',
            redirect: 'error',
        };
        if (body !== undefined) {
            headers['Content-Type'] = 'application/json';
            options.body = JSON.stringify(body);
        }

        // O navegador define Origin no POST; o cliente não tenta forjá-lo.
        let response;
        try {
            response = await this.#fetchClient(path, options);
        } catch {
            throw new InitialSetupApiError(
                INITIAL_SETUP_API_MESSAGES.NETWORK_ERROR,
                { code: INITIAL_SETUP_API_CODES.NETWORK_ERROR },
            );
        }

        if (
            !isObject(response)
            || !Number.isInteger(response.status)
            || response.status < 100 || response.status > 599
            || typeof response.ok !== 'boolean'
            || response.ok !== (response.status >= 200 && response.status <= 299)
        ) {
            throw InitialSetupApi.createInvalidResponseError();
        }

        if (!response.ok) {
            let payload = null;
            if (typeof response.json === 'function') {
                try {
                    payload = await response.json();
                } catch {
                    // Recusas sem JSON continuam sendo erros, nunca sucesso.
                }
            }
            throw InitialSetupApi.createRequestError(response.status, payload, method);
        }

        if (
            response.status !== expectedStatus
            || typeof response.json !== 'function'
        ) {
            throw InitialSetupApi.createInvalidResponseError(response.status);
        }
        try {
            return await response.json();
        } catch {
            throw InitialSetupApi.createInvalidResponseError(response.status);
        }
    }

    /** @returns {Promise<Readonly<{ available: boolean }>>} */
    async getStatus() {
        const payload = await this.#request({
            path: INITIAL_SETUP_API_PATHS.STATUS,
            method: 'GET',
            expectedStatus: 200,
        });
        if (
            !isObject(payload) || !isObject(payload.data)
            || typeof payload.data.available !== 'boolean'
        ) {
            throw InitialSetupApi.createInvalidResponseError(200);
        }
        return Object.freeze({ available: payload.data.available });
    }

    /**
     * Uma falha de rede pode acontecer depois da gravação da conta no servidor.
     * O serviço não repete automaticamente este POST nem confirma sem resposta.
     * @param {object} input Convite, nome, e-mail e senha.
     * @returns {Promise<Readonly<{ created: true }>>} Confirmação sem credenciais.
     */
    async createAdmin(input) {
        const body = InitialSetupApi.createAccountData(input);
        const payload = await this.#request({
            path: INITIAL_SETUP_API_PATHS.CREATE_ADMIN,
            method: 'POST',
            expectedStatus: 201,
            body,
        });
        if (
            !isObject(payload) || !isObject(payload.data)
            || payload.data.created !== true
        ) {
            throw InitialSetupApi.createInvalidResponseError(201);
        }
        return Object.freeze({ created: true });
    }
}

const initialSetupApi = new InitialSetupApi();

export {
    INITIAL_SETUP_API_PATHS,
    INITIAL_SETUP_API_CODES,
    INITIAL_SETUP_API_MESSAGES,
    InitialSetupApi,
    InitialSetupApiError,
    initialSetupApi,
    defaultFetchClient,
};
