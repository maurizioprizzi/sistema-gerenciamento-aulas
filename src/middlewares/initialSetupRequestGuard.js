'use strict';

const { AppError } = require('../errors/AppError');

const INITIAL_SETUP_REQUEST_GUARD_CODES = Object.freeze({
    FORBIDDEN_ORIGIN: 'INITIAL_SETUP_FORBIDDEN_ORIGIN',
    UNSUPPORTED_MEDIA_TYPE: 'INITIAL_SETUP_UNSUPPORTED_MEDIA_TYPE',
});

const INITIAL_SETUP_REQUEST_GUARD_ERRORS = Object.freeze({
    INVALID_APP_ORIGIN:
        'A proteção do primeiro cadastro exige uma origem HTTP ou HTTPS válida, sem caminho, credenciais, consulta ou fragmento.',
    FORBIDDEN_ORIGIN:
        'A origem desta requisição não está autorizada para o primeiro cadastro.',
    UNSUPPORTED_MEDIA_TYPE:
        'O primeiro cadastro aceita somente requisições JSON.',
});

/**
 * Normaliza a origem configurada; aceita a barra final padrão de uma URL.
 * Não deriva confiança de Host, X-Forwarded-Host ou valores enviados pelo
 * cliente. A origem autorizada pertence à configuração da instalação.
 */
function resolveAppOrigin(appOrigin) {
    if (typeof appOrigin !== 'string' || appOrigin.trim().length === 0) {
        throw new TypeError(INITIAL_SETUP_REQUEST_GUARD_ERRORS.INVALID_APP_ORIGIN);
    }

    let url;
    try {
        url = new URL(appOrigin.trim());
    } catch {
        throw new TypeError(INITIAL_SETUP_REQUEST_GUARD_ERRORS.INVALID_APP_ORIGIN);
    }

    if (
        !['http:', 'https:'].includes(url.protocol)
        || url.username !== '' || url.password !== ''
        || url.pathname !== '/' || url.search !== '' || url.hash !== ''
    ) {
        throw new TypeError(INITIAL_SETUP_REQUEST_GUARD_ERRORS.INVALID_APP_ORIGIN);
    }
    return url.origin;
}

/**
 * Protege o futuro POST de primeiro cadastro. Não deve ser instalado sobre
 * o GET de disponibilidade: navegações GET podem não enviar Origin.
 *
 * Requer Origin exatamente igual à origem configurada e Content-Type JSON.
 * Requisições sem Origin, com origem opaca "null" ou valores múltiplos são
 * recusadas. Formulários de outros sites não são aceitos como cadastro.
 *
 * Origin não autentica clientes fora do navegador, que podem definir esse
 * cabeçalho. Convite, reserva persistente e limitação continuam necessários.
 * Este middleware não habilita CORS nem registra rotas.
 *
 * @param {object} options Configuração validada da instalação.
 * @param {string} options.appOrigin Origem em APP_ORIGIN.
 * @returns {import('express').RequestHandler} Proteção da rota de criação.
 */
function createInitialSetupRequestGuard({ appOrigin } = {}) {
    const allowedOrigin = resolveAppOrigin(appOrigin);

    return function initialSetupRequestGuard(request, response, next) {
        try {
            // Recusas também não devem ficar armazenadas no navegador/proxy.
            response.set('Cache-Control', 'no-store');
            const receivedOrigin = request?.headers?.origin;
            if (typeof receivedOrigin !== 'string' || receivedOrigin !== allowedOrigin) {
                return next(new AppError(
                    INITIAL_SETUP_REQUEST_GUARD_ERRORS.FORBIDDEN_ORIGIN,
                    { statusCode: 403, code: INITIAL_SETUP_REQUEST_GUARD_CODES.FORBIDDEN_ORIGIN },
                ));
            }

            // Express usa type-is para verificar o tipo, incluindo charset.
            // application/*+json não é aceito implicitamente neste contrato.
            if (!request.is('application/json')) {
                return next(new AppError(
                    INITIAL_SETUP_REQUEST_GUARD_ERRORS.UNSUPPORTED_MEDIA_TYPE,
                    { statusCode: 415, code: INITIAL_SETUP_REQUEST_GUARD_CODES.UNSUPPORTED_MEDIA_TYPE },
                ));
            }

            return next();
        } catch (error) {
            return next(error);
        }
    };
}

module.exports = {
    INITIAL_SETUP_REQUEST_GUARD_CODES,
    INITIAL_SETUP_REQUEST_GUARD_ERRORS,
    createInitialSetupRequestGuard,
};
