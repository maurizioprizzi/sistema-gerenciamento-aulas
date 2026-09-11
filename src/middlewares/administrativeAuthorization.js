'use strict';

const { AppError } = require('../errors/AppError');
const {
    USER_ROLES,
} = require('../models/User');
const {
    SESSION_AUTHENTICATION_KEY,
} = require('../services/SessionManager');

/**
 * Nome utilizado para disponibilizar a identidade autorizada aos próximos
 * middlewares e controladores.
 *
 * A propriedade é criada como não enumerável. Assim, uma serialização ou um
 * registro genérico da requisição não inclui a identidade por acidente.
 */
const AUTHENTICATED_USER_REQUEST_KEY = 'authenticatedUser';

/**
 * Códigos estáveis devolvidos pela autorização administrativa.
 */
const ADMINISTRATIVE_AUTHORIZATION_CODES = Object.freeze({
    AUTHENTICATION_REQUIRED: 'AUTHENTICATION_REQUIRED',
    ADMINISTRATIVE_ACCESS_REQUIRED:
        'ADMINISTRATIVE_ACCESS_REQUIRED',
});

/**
 * Mensagens públicas e internas do middleware.
 *
 * As mensagens públicas não revelam identificadores, conteúdo da sessão ou
 * detalhes sobre outros papéis reconhecidos pelo sistema.
 */
const ADMINISTRATIVE_AUTHORIZATION_ERRORS = Object.freeze({
    AUTHENTICATION_REQUIRED:
        'É necessário entrar com uma conta válida para acessar este endereço.',
    ADMINISTRATIVE_ACCESS_REQUIRED:
        'Este endereço exige acesso administrativo.',
    INVALID_NEXT:
        'O middleware de autorização exige uma função next válida.',
});

/**
 * Verifica se um valor pode representar um objeto de sessão.
 *
 * @param {unknown} value Valor recebido.
 * @returns {boolean} Verdadeiro quando o valor é um objeto não nulo e não é
 * uma lista.
 */
function isObject(value) {
    return (
        value !== null
        && typeof value === 'object'
        && !Array.isArray(value)
    );
}

/**
 * Cria o erro utilizado quando não existe uma identidade de sessão válida.
 *
 * @returns {AppError} Erro operacional seguro.
 */
function createAuthenticationRequiredError() {
    return new AppError(
        ADMINISTRATIVE_AUTHORIZATION_ERRORS
            .AUTHENTICATION_REQUIRED,
        {
            statusCode: 401,
            code:
                ADMINISTRATIVE_AUTHORIZATION_CODES
                    .AUTHENTICATION_REQUIRED,
        },
    );
}

/**
 * Cria o erro utilizado para uma identidade válida sem papel administrativo.
 *
 * @returns {AppError} Erro operacional seguro.
 */
function createAdministrativeAccessRequiredError() {
    return new AppError(
        ADMINISTRATIVE_AUTHORIZATION_ERRORS
            .ADMINISTRATIVE_ACCESS_REQUIRED,
        {
            statusCode: 403,
            code:
                ADMINISTRATIVE_AUTHORIZATION_CODES
                    .ADMINISTRATIVE_ACCESS_REQUIRED,
        },
    );
}

/**
 * Constrói a identidade mínima autorizada a partir da sessão.
 *
 * A seleção explícita impede que campos acrescentados indevidamente à sessão
 * atravessem a fronteira de autorização. Nome, e-mail, senha, hash, cookie e
 * identificador da própria sessão não são copiados.
 *
 * @param {unknown} authentication Identidade armazenada na sessão.
 * @returns {Readonly<{ id: string, role: string }>} Identidade mínima.
 * @throws {AppError} Quando a estrutura da identidade é inválida.
 */
function createAuthenticatedUser(authentication) {
    const hasValidUserId =
        isObject(authentication)
        && typeof authentication.userId === 'string'
        && authentication.userId.trim().length > 0;

    const hasValidRole =
        isObject(authentication)
        && typeof authentication.role === 'string'
        && authentication.role.trim().length > 0;

    if (!hasValidUserId || !hasValidRole) {
        throw createAuthenticationRequiredError();
    }

    return Object.freeze({
        id: authentication.userId.trim(),
        role: authentication.role.trim(),
    });
}

/**
 * Exige uma sessão autenticada com papel administrativo.
 *
 * O middleware confia somente na identidade mínima armazenada pelo servidor.
 * A conta foi validada como ativa durante o login e a sessão foi regenerada
 * antes de receber essa identidade.
 *
 * Uma futura funcionalidade de desativação de contas também deverá remover as
 * sessões correspondentes para revogar imediatamente acessos já estabelecidos.
 *
 * @param {import('express').Request} request Requisição HTTP.
 * @param {import('express').Response} _response Resposta HTTP não utilizada.
 * @param {import('express').NextFunction} next Próximo middleware.
 * @returns {void}
 */
function requireAdministrativeAuthentication(
    request,
    _response,
    next,
) {
    if (typeof next !== 'function') {
        throw new TypeError(
            ADMINISTRATIVE_AUTHORIZATION_ERRORS.INVALID_NEXT,
        );
    }

    try {
        const authentication =
            isObject(request)
            && isObject(request.session)
                ? request.session[
                    SESSION_AUTHENTICATION_KEY
                ]
                : null;

        const authenticatedUser =
            createAuthenticatedUser(authentication);

        if (authenticatedUser.role !== USER_ROLES.ADMIN) {
            next(createAdministrativeAccessRequiredError());
            return;
        }

        /**
         * A propriedade não pode ser substituída nem enumerada. O próprio
         * valor também está congelado.
         */
        Object.defineProperty(
            request,
            AUTHENTICATED_USER_REQUEST_KEY,
            {
                value: authenticatedUser,
                writable: false,
                enumerable: false,
                configurable: false,
            },
        );

        next();
    } catch (error) {
        next(error);
    }
}

module.exports = {
    ADMINISTRATIVE_AUTHORIZATION_CODES,
    ADMINISTRATIVE_AUTHORIZATION_ERRORS,
    AUTHENTICATED_USER_REQUEST_KEY,
    createAdministrativeAccessRequiredError,
    createAuthenticatedUser,
    createAuthenticationRequiredError,
    requireAdministrativeAuthentication,
};
