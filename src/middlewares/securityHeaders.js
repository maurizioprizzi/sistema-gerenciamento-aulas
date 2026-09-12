'use strict';

const helmet = require('helmet');

/**
 * Duração padrão do HSTS: um ano, em segundos.
 *
 * Esse cabeçalho é emitido somente em produção, quando a aplicação deverá
 * estar disponível exclusivamente por HTTPS.
 */
const HSTS_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;

/**
 * Mensagens estáveis utilizadas na validação da configuração.
 */
const SECURITY_HEADERS_ERROR_MESSAGES = Object.freeze({
    INVALID_PRODUCTION_FLAG:
        'A configuração dos cabeçalhos exige uma indicação booleana de produção.',
    INVALID_HELMET_FACTORY:
        'A configuração dos cabeçalhos exige uma fábrica Helmet válida.',
    INVALID_MIDDLEWARE:
        'A fábrica Helmet não retornou um middleware válido.',
});

/**
 * Cria o middleware responsável pelos cabeçalhos HTTP de segurança.
 *
 * A política padrão do Helmet é preservada. Alteramos somente os pontos que
 * precisam conhecer o ambiente:
 *
 * - desenvolvimento não envia HSTS, pois utiliza HTTP local;
 * - desenvolvimento não tenta promover recursos para HTTPS;
 * - produção ativa HSTS por um ano;
 * - produção preserva upgrade-insecure-requests na CSP.
 *
 * A fábrica é injetável para permitir testes completos das opções sem
 * depender da implementação interna da biblioteca.
 *
 * @param {object} options Configuração do middleware.
 * @param {boolean} [options.isProduction=false]
 * Indica se a aplicação utiliza o ambiente de produção.
 * @param {Function} [options.helmetFactory=helmet]
 * Fábrica compatível com Helmet.
 * @returns {Function} Middleware Express configurado.
 */
function createSecurityHeadersMiddleware({
    isProduction = false,
    helmetFactory = helmet,
} = {}) {
    if (typeof isProduction !== 'boolean') {
        throw new TypeError(
            SECURITY_HEADERS_ERROR_MESSAGES
                .INVALID_PRODUCTION_FLAG,
        );
    }

    if (typeof helmetFactory !== 'function') {
        throw new TypeError(
            SECURITY_HEADERS_ERROR_MESSAGES
                .INVALID_HELMET_FACTORY,
        );
    }

    const strictTransportSecurity = isProduction
        ? {
            maxAge: HSTS_MAX_AGE_SECONDS,
            includeSubDomains: true,
            preload: false,
        }
        : false;

    const middleware = helmetFactory({
        contentSecurityPolicy: {
            directives: {
                upgradeInsecureRequests:
                    isProduction ? [] : null,
            },
        },
        strictTransportSecurity,
    });

    if (typeof middleware !== 'function') {
        throw new TypeError(
            SECURITY_HEADERS_ERROR_MESSAGES.INVALID_MIDDLEWARE,
        );
    }

    return middleware;
}

module.exports = {
    HSTS_MAX_AGE_SECONDS,
    SECURITY_HEADERS_ERROR_MESSAGES,
    createSecurityHeadersMiddleware,
};
