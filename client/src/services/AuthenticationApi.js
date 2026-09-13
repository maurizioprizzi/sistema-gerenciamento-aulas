/**
 * Caminhos públicos da API de autenticação.
 *
 * Os caminhos são relativos à origem atual. Durante o desenvolvimento, o
 * Vite os encaminha ao Express; em produção, navegador e API compartilharão
 * a mesma origem.
 */
const AUTHENTICATION_API_PATHS = Object.freeze({
    LOGIN: '/api/auth/login',
    SESSION: '/api/auth/session',
    LOGOUT: '/api/auth/logout',
});

/**
 * Códigos criados exclusivamente pelo cliente HTTP.
 *
 * Códigos devolvidos pelo backend, como INVALID_CREDENTIALS e
 * AUTHENTICATION_RATE_LIMITED, são preservados quando a resposta possui o
 * contrato esperado.
 */
const AUTHENTICATION_API_CODES = Object.freeze({
    NETWORK_ERROR: 'AUTHENTICATION_NETWORK_ERROR',
    INVALID_RESPONSE: 'INVALID_AUTHENTICATION_RESPONSE',
    REQUEST_FAILED: 'AUTHENTICATION_REQUEST_FAILED',
});

/**
 * Mensagens estáveis do serviço.
 *
 * Nenhuma mensagem contém e-mail, senha, cookie ou conteúdo da sessão.
 */
const AUTHENTICATION_API_MESSAGES = Object.freeze({
    INVALID_FETCH_CLIENT:
        'A API de autenticação exige um cliente HTTP válido.',
    INVALID_CREDENTIALS:
        'A API de autenticação exige e-mail e senha válidos.',
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

const ERROR_CODE_PATTERN = /^[A-Z][A-Z0-9_]*$/;

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
 * Cliente HTTP padrão utilizado no navegador.
 *
 * A função intermediária também facilita a substituição do fetch nos testes.
 *
 * @param {RequestInfo | URL} input Endereço solicitado.
 * @param {RequestInit} init Configuração da requisição.
 * @returns {Promise<Response>} Resposta do navegador.
 */
function defaultFetchClient(input, init) {
    return globalThis.fetch(input, init);
}

/**
 * Erro conhecido produzido durante a comunicação com a autenticação.
 *
 * A interface poderá mostrar message e reagir a code sem conhecer detalhes
 * do fetch. A causa técnica de uma falha de rede permanece disponível apenas
 * para diagnóstico interno e nunca é incorporada à mensagem pública.
 */
class AuthenticationApiError extends Error {
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
            code = AUTHENTICATION_API_CODES.REQUEST_FAILED,
            cause,
        } = {},
    ) {
        if (!hasText(message)) {
            throw new TypeError(
                AUTHENTICATION_API_MESSAGES.INVALID_ERROR_MESSAGE,
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
                AUTHENTICATION_API_MESSAGES.INVALID_ERROR_STATUS,
            );
        }

        if (!hasText(code) || !ERROR_CODE_PATTERN.test(code)) {
            throw new TypeError(
                AUTHENTICATION_API_MESSAGES.INVALID_ERROR_CODE,
            );
        }

        super(
            message,
            cause === undefined ? undefined : { cause },
        );

        this.name = 'AuthenticationApiError';

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
 * Encapsula as requisições relacionadas à sessão administrativa.
 */
class AuthenticationApi {
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
                AUTHENTICATION_API_MESSAGES.INVALID_FETCH_CLIENT,
            );
        }

        this.#fetchClient = fetchClient;

        /**
         * Os métodos podem ser entregues diretamente a componentes sem perder
         * o acesso ao campo privado que armazena o cliente HTTP.
         */
        this.login = this.login.bind(this);
        this.getSession = this.getSession.bind(this);
        this.logout = this.logout.bind(this);

        Object.freeze(this);
    }

    /**
     * Prepara as credenciais sem modificar a senha.
     *
     * O e-mail perde apenas espaços externos. Espaços pertencentes à senha
     * são preservados e a validação completa continua pertencendo ao backend.
     *
     * @param {unknown} credentials Valores recebidos do formulário.
     * @returns {Readonly<{ email: string, password: string }>} Credenciais.
     */
    static createCredentials(credentials) {
        const isValid =
            isObject(credentials)
            && hasText(credentials.email)
            && typeof credentials.password === 'string'
            && credentials.password.length > 0;

        if (!isValid) {
            throw new TypeError(
                AUTHENTICATION_API_MESSAGES.INVALID_CREDENTIALS,
            );
        }

        return Object.freeze({
            email: credentials.email.trim(),
            password: credentials.password,
        });
    }

    /**
     * Seleciona somente os campos públicos autorizados depois do login.
     *
     * @param {unknown} payload Corpo devolvido pelo servidor.
     * @returns {Readonly<{ id: string, name: string, email: string,
     * role: string }>} Usuário público.
     */
    static createLoginUser(payload) {
        const user = isObject(payload?.data)
            ? payload.data.user
            : null;

        const fields = ['id', 'name', 'email', 'role'];
        const isValid =
            isObject(user)
            && fields.every((field) => hasText(user[field]));

        if (!isValid) {
            throw AuthenticationApi.createInvalidResponseError();
        }

        return Object.freeze({
            id: user.id.trim(),
            name: user.name.trim(),
            email: user.email.trim(),
            role: user.role.trim(),
        });
    }

    /**
     * Seleciona a confirmação e a identidade mínima da sessão atual.
     *
     * @param {unknown} payload Corpo devolvido pelo servidor.
     * @returns {Readonly<{ authenticated: true,
     * user: Readonly<{ id: string, role: string }> }>} Sessão confirmada.
     */
    static createSession(payload) {
        const data = isObject(payload?.data)
            ? payload.data
            : null;
        const user = isObject(data)
            ? data.user
            : null;

        const isValid =
            data?.authenticated === true
            && isObject(user)
            && hasText(user.id)
            && hasText(user.role);

        if (!isValid) {
            throw AuthenticationApi.createInvalidResponseError();
        }

        const sessionUser = Object.freeze({
            id: user.id.trim(),
            role: user.role.trim(),
        });

        return Object.freeze({
            authenticated: true,
            user: sessionUser,
        });
    }

    /**
     * Cria o erro utilizado para respostas de sucesso malformadas.
     *
     * @param {number} [statusCode=0] Estado HTTP recebido.
     * @param {unknown} [cause] Causa técnica da leitura.
     * @returns {AuthenticationApiError} Erro seguro.
     */
    static createInvalidResponseError(statusCode = 0, cause) {
        return new AuthenticationApiError(
            AUTHENTICATION_API_MESSAGES.INVALID_RESPONSE,
            {
                statusCode,
                code: AUTHENTICATION_API_CODES.INVALID_RESPONSE,
                cause,
            },
        );
    }

    /**
     * Converte uma resposta HTTP recusada em erro da aplicação.
     *
     * Mensagem e código do backend são aceitos somente quando possuem o
     * formato público documentado. Qualquer corpo diferente resulta em uma
     * mensagem genérica.
     *
     * @param {number} statusCode Estado HTTP recebido.
     * @param {unknown} payload Corpo interpretado, quando disponível.
     * @returns {AuthenticationApiError} Erro seguro.
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

        return new AuthenticationApiError(
            hasValidPublicError
                ? responseError.message
                : AUTHENTICATION_API_MESSAGES.REQUEST_FAILED,
            {
                statusCode,
                code: hasValidPublicError
                    ? responseError.code
                    : AUTHENTICATION_API_CODES.REQUEST_FAILED,
            },
        );
    }

    /**
     * Executa uma requisição e valida seu contrato básico.
     *
     * @param {object} request Configuração interna.
     * @param {string} request.path Caminho relativo.
     * @param {'GET' | 'POST'} request.method Método HTTP.
     * @param {number} request.expectedStatus Estado esperado no sucesso.
     * @param {object} [request.body] Corpo opcional.
     * @returns {Promise<unknown>} Corpo JSON ou null para resposta 204.
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
            throw new AuthenticationApiError(
                AUTHENTICATION_API_MESSAGES.NETWORK_ERROR,
                {
                    code: AUTHENTICATION_API_CODES.NETWORK_ERROR,
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
            throw AuthenticationApi.createInvalidResponseError();
        }

        if (!response.ok) {
            let errorPayload = null;

            if (typeof response.json === 'function') {
                try {
                    errorPayload = await response.json();
                } catch {
                    /**
                     * Uma resposta de erro sem JSON válido continua sendo
                     * recusada com a mensagem genérica do cliente.
                     */
                }
            }

            throw AuthenticationApi.createRequestError(
                response.status,
                errorPayload,
            );
        }

        if (response.status !== expectedStatus) {
            throw AuthenticationApi.createInvalidResponseError(
                response.status,
            );
        }

        if (expectedStatus === 204) {
            return null;
        }

        if (typeof response.json !== 'function') {
            throw AuthenticationApi.createInvalidResponseError(
                response.status,
            );
        }

        try {
            return await response.json();
        } catch (cause) {
            throw AuthenticationApi.createInvalidResponseError(
                response.status,
                cause,
            );
        }
    }

    /**
     * Autentica o administrador e recebe sua identidade pública.
     *
     * @param {object} credentials E-mail e senha informados.
     * @returns {Promise<Readonly<object>>} Usuário público autenticado.
     */
    async login(credentials) {
        const preparedCredentials =
            AuthenticationApi.createCredentials(credentials);

        const payload = await this.#request({
            path: AUTHENTICATION_API_PATHS.LOGIN,
            method: 'POST',
            expectedStatus: 200,
            body: preparedCredentials,
        });

        return AuthenticationApi.createLoginUser(payload);
    }

    /**
     * Consulta a sessão administrativa atual.
     *
     * @returns {Promise<Readonly<object>>} Sessão confirmada.
     */
    async getSession() {
        const payload = await this.#request({
            path: AUTHENTICATION_API_PATHS.SESSION,
            method: 'GET',
            expectedStatus: 200,
        });

        return AuthenticationApi.createSession(payload);
    }

    /**
     * Encerra a sessão administrativa atual.
     *
     * @returns {Promise<void>}
     */
    async logout() {
        await this.#request({
            path: AUTHENTICATION_API_PATHS.LOGOUT,
            method: 'POST',
            expectedStatus: 204,
        });
    }
}

/**
 * Instância padrão utilizada pela interface real.
 */
const authenticationApi = new AuthenticationApi();

export {
    AUTHENTICATION_API_CODES,
    AUTHENTICATION_API_MESSAGES,
    AUTHENTICATION_API_PATHS,
    AuthenticationApi,
    AuthenticationApiError,
    authenticationApi,
    defaultFetchClient,
};
