'use strict';

/**
 * Mensagens relacionadas à configuração do controlador.
 *
 * Elas descrevem somente contratos internos e nunca incluem credenciais,
 * cookies ou dados da sessão.
 */
const AUTHENTICATION_CONTROLLER_ERRORS = Object.freeze({
    INVALID_AUTHENTICATION_SERVICE:
        'O controlador exige um serviço de autenticação válido.',
    INVALID_SESSION_MANAGER:
        'O controlador exige um gerenciador de sessões válido.',
    INVALID_COOKIE_NAME:
        'O controlador exige um nome de cookie válido.',
    INVALID_PRODUCTION_FLAG:
        'A indicação de ambiente de produção deve ser booleana.',
    INVALID_IDENTITY:
        'O serviço de autenticação retornou uma identidade inválida.',
    INVALID_AUTHENTICATED_USER:
        'A autorização não disponibilizou uma identidade válida.',
});

/**
 * Nomes de cookies seguem a gramática de token utilizada pelo protocolo HTTP.
 *
 * A validação impede espaços, separadores e caracteres de controle antes que
 * o valor seja entregue ao Express.
 */
const COOKIE_NAME_PATTERN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;

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
 * Coordena autenticação, sessão e respostas HTTP.
 *
 * O controlador não conhece bcrypt, Mongoose ou MongoDB. Ele recebe serviços
 * prontos e limita-se a traduzir a requisição HTTP para o fluxo da aplicação.
 */
class AuthenticationController {
    /** @type {object} */
    #authenticationService;

    /** @type {object} */
    #sessionManager;

    /** @type {string} */
    #cookieName;

    /** @type {Readonly<object>} */
    #clearCookieOptions;

    /**
     * @param {object} dependencies Dependências do controlador.
     * @param {object} dependencies.authenticationService
     * Serviço que oferece authenticate().
     * @param {object} dependencies.sessionManager
     * Serviço que oferece establish() e destroy().
     * @param {string} dependencies.cookieName Nome do cookie da sessão.
     * @param {boolean} dependencies.isProduction Define o uso de Secure.
     */
    constructor({
        authenticationService,
        sessionManager,
        cookieName,
        isProduction,
    } = {}) {
        AuthenticationController.validateAuthenticationService(
            authenticationService,
        );
        AuthenticationController.validateSessionManager(
            sessionManager,
        );
        AuthenticationController.validateCookieName(
            cookieName,
        );

        if (typeof isProduction !== 'boolean') {
            throw new TypeError(
                AUTHENTICATION_CONTROLLER_ERRORS
                    .INVALID_PRODUCTION_FLAG,
            );
        }

        this.#authenticationService = authenticationService;
        this.#sessionManager = sessionManager;
        this.#cookieName = cookieName;
        this.#clearCookieOptions = Object.freeze({
            httpOnly: true,
            secure: isProduction,
            sameSite: 'lax',
            path: '/',
            priority: 'high',
        });

        /**
         * As funções são vinculadas à instância para poderem ser entregues
         * diretamente ao Router do Express sem perder o acesso aos campos
         * privados.
         */
        this.login = this.login.bind(this);
        this.getSession = this.getSession.bind(this);
        this.logout = this.logout.bind(this);

        Object.freeze(this);
    }

    /**
     * Valida o serviço responsável pelas credenciais.
     *
     * @param {unknown} service Dependência recebida.
     * @throws {TypeError} Quando authenticate() não está disponível.
     */
    static validateAuthenticationService(service) {
        if (
            !isObject(service)
            || typeof service.authenticate !== 'function'
        ) {
            throw new TypeError(
                AUTHENTICATION_CONTROLLER_ERRORS
                    .INVALID_AUTHENTICATION_SERVICE,
            );
        }
    }

    /**
     * Valida o serviço responsável pelo ciclo da sessão.
     *
     * @param {unknown} manager Dependência recebida.
     * @throws {TypeError} Quando establish() ou destroy() não existem.
     */
    static validateSessionManager(manager) {
        if (
            !isObject(manager)
            || typeof manager.establish !== 'function'
            || typeof manager.destroy !== 'function'
        ) {
            throw new TypeError(
                AUTHENTICATION_CONTROLLER_ERRORS
                    .INVALID_SESSION_MANAGER,
            );
        }
    }

    /**
     * Valida o nome utilizado para remover o cookie durante o logout.
     *
     * @param {unknown} cookieName Nome recebido.
     * @throws {TypeError} Quando o nome não é um token HTTP válido.
     */
    static validateCookieName(cookieName) {
        if (
            typeof cookieName !== 'string'
            || cookieName.length === 0
            || !COOKIE_NAME_PATTERN.test(cookieName)
        ) {
            throw new TypeError(
                AUTHENTICATION_CONTROLLER_ERRORS
                    .INVALID_COOKIE_NAME,
            );
        }
    }

    /**
     * Cria a representação pública enviada após o login.
     *
     * Mesmo que uma implementação incorreta do serviço acrescente campos
     * privados, o controlador seleciona explicitamente somente os dados
     * permitidos na resposta HTTP.
     *
     * @param {unknown} identity Identidade recebida do serviço.
     * @returns {Readonly<{ id: string, name: string, email: string, role: string }>}
     * @throws {TypeError} Quando a identidade estiver incompleta.
     */
    static createPublicUser(identity) {
        const requiredFields = [
            'id',
            'name',
            'email',
            'role',
        ];

        const isValid =
            isObject(identity)
            && requiredFields.every(
                (fieldName) =>
                    typeof identity[fieldName] === 'string'
                    && identity[fieldName].trim().length > 0,
            );

        if (!isValid) {
            throw new TypeError(
                AUTHENTICATION_CONTROLLER_ERRORS.INVALID_IDENTITY,
            );
        }

        return Object.freeze({
            id: identity.id,
            name: identity.name,
            email: identity.email,
            role: identity.role,
        });
    }

    /**
     * Cria a representação mínima da sessão autorizada.
     *
     * A autorização já seleciona somente identificador e papel. Esta segunda
     * seleção mantém a resposta protegida mesmo se outra implementação de
     * middleware acrescentar campos à requisição.
     *
     * @param {unknown} authenticatedUser Identidade autorizada.
     * @returns {Readonly<{ id: string, role: string }>} Identidade pública.
     */
    static createAuthenticatedUserResponse(authenticatedUser) {
        const isValid =
            isObject(authenticatedUser)
            && typeof authenticatedUser.id === 'string'
            && authenticatedUser.id.trim().length > 0
            && typeof authenticatedUser.role === 'string'
            && authenticatedUser.role.trim().length > 0;

        if (!isValid) {
            throw new TypeError(
                AUTHENTICATION_CONTROLLER_ERRORS
                    .INVALID_AUTHENTICATED_USER,
            );
        }

        return Object.freeze({
            id: authenticatedUser.id.trim(),
            role: authenticatedUser.role.trim(),
        });
    }

    /**
     * Autentica o administrador e estabelece uma nova sessão.
     *
     * @param {import('express').Request} request Requisição HTTP.
     * @param {import('express').Response} response Resposta HTTP.
     * @param {import('express').NextFunction} next Tratamento seguinte.
     * @returns {Promise<void>}
     */
    async login(request, response, next) {
        try {
            const identity =
                await this.#authenticationService.authenticate(
                    request?.body,
                );

            const publicUser =
                AuthenticationController.createPublicUser(
                    identity,
                );

            await this.#sessionManager.establish(
                request,
                publicUser,
            );

            response.status(200).json({
                data: {
                    user: publicUser,
                },
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * Informa que a sessão administrativa atual está autenticada.
     *
     * Este handler deve ser utilizado somente depois do middleware de
     * autorização. Ele não consulta cookies nem o armazenamento diretamente.
     *
     * @param {import('express').Request} request Requisição autorizada.
     * @param {import('express').Response} response Resposta HTTP.
     * @param {import('express').NextFunction} next Tratamento seguinte.
     * @returns {void}
     */
    getSession(request, response, next) {
        try {
            const authenticatedUser =
                AuthenticationController
                    .createAuthenticatedUserResponse(
                        request?.authenticatedUser,
                    );

            response.status(200).json({
                data: {
                    authenticated: true,
                    user: authenticatedUser,
                },
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * Destrói a sessão e remove o cookie correspondente.
     *
     * O cookie só é removido depois que a destruição no servidor termina com
     * sucesso. Em caso de falha, o erro é encaminhado e o cliente não recebe
     * uma indicação falsa de encerramento.
     *
     * @param {import('express').Request} request Requisição HTTP.
     * @param {import('express').Response} response Resposta HTTP.
     * @param {import('express').NextFunction} next Tratamento seguinte.
     * @returns {Promise<void>}
     */
    async logout(request, response, next) {
        try {
            await this.#sessionManager.destroy(request);

            response.clearCookie(
                this.#cookieName,
                this.#clearCookieOptions,
            );

            response.status(204).end();
        } catch (error) {
            next(error);
        }
    }
}

module.exports = {
    AUTHENTICATION_CONTROLLER_ERRORS,
    COOKIE_NAME_PATTERN,
    AuthenticationController,
};
