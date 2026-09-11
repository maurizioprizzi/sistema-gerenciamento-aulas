'use strict';

const {
    rateLimit,
} = require('express-rate-limit');

const { AppError } = require('../errors/AppError');

/**
 * Cinco tentativas recusadas em quinze minutos são suficientes para reduzir
 * ataques automatizados sem bloquear facilmente o administrador legítimo.
 */
const DEFAULT_LOGIN_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const DEFAULT_LOGIN_RATE_LIMIT_MAX_ATTEMPTS = 5;

/**
 * Limites defensivos para configurações recebidas por injeção.
 *
 * O intervalo menor é útil em testes. O maior impede que um erro de
 * configuração mantenha um endereço bloqueado por tempo desproporcional.
 */
const MIN_LOGIN_RATE_LIMIT_WINDOW_MS = 1000;
const MAX_LOGIN_RATE_LIMIT_WINDOW_MS = 24 * 60 * 60 * 1000;
const MIN_LOGIN_RATE_LIMIT_MAX_ATTEMPTS = 1;
const MAX_LOGIN_RATE_LIMIT_MAX_ATTEMPTS = 100;

const AUTHENTICATION_RATE_LIMIT_ERRORS = Object.freeze({
    INVALID_WINDOW:
        'A janela do limitador deve ser um número inteiro entre um segundo e vinte e quatro horas.',
    INVALID_MAX_ATTEMPTS:
        'O limite de tentativas deve ser um número inteiro entre 1 e 100.',
    INVALID_FACTORY:
        'Uma fábrica válida é necessária para criar o limitador de autenticação.',
    INVALID_MIDDLEWARE:
        'A fábrica deve retornar um middleware de limitação válido.',
    TOO_MANY_ATTEMPTS:
        'Muitas tentativas de acesso foram realizadas. Aguarde alguns minutos e tente novamente.',
});

const AUTHENTICATION_RATE_LIMIT_CODES = Object.freeze({
    TOO_MANY_ATTEMPTS: 'AUTHENTICATION_RATE_LIMITED',
});

/**
 * Valida a duração da janela de contagem.
 *
 * @param {unknown} windowMs Duração em milissegundos.
 */
function validateWindow(windowMs) {
    const isValid =
        Number.isInteger(windowMs)
        && windowMs >= MIN_LOGIN_RATE_LIMIT_WINDOW_MS
        && windowMs <= MAX_LOGIN_RATE_LIMIT_WINDOW_MS;

    if (!isValid) {
        throw new RangeError(
            AUTHENTICATION_RATE_LIMIT_ERRORS.INVALID_WINDOW,
        );
    }
}

/**
 * Valida a quantidade máxima de tentativas recusadas.
 *
 * @param {unknown} maxAttempts Quantidade que será aceita na janela.
 */
function validateMaxAttempts(maxAttempts) {
    const isValid =
        Number.isInteger(maxAttempts)
        && maxAttempts >= MIN_LOGIN_RATE_LIMIT_MAX_ATTEMPTS
        && maxAttempts <= MAX_LOGIN_RATE_LIMIT_MAX_ATTEMPTS;

    if (!isValid) {
        throw new RangeError(
            AUTHENTICATION_RATE_LIMIT_ERRORS.INVALID_MAX_ATTEMPTS,
        );
    }
}

/**
 * Cria o middleware aplicado exclusivamente à rota de login.
 *
 * A biblioteca utiliza por padrão o endereço de origem da requisição e já
 * possui tratamento apropriado para IPv6. Não criamos um keyGenerator próprio
 * para não enfraquecer essa proteção.
 *
 * Tentativas que terminam com sucesso são removidas da contagem. Respostas de
 * erro, inclusive credenciais recusadas, permanecem contabilizadas.
 *
 * O armazenamento padrão permanece em memória porque a aplicação utiliza uma
 * única instância neste estágio. Antes de escalar horizontalmente, o contador
 * deverá ser transferido para um armazenamento compartilhado.
 *
 * @param {object} options Configuração do limitador.
 * @param {number} [options.windowMs] Janela de contagem.
 * @param {number} [options.maxAttempts] Máximo de tentativas recusadas.
 * @param {Function} [options.rateLimitFactory] Fábrica da biblioteca.
 * @returns {Function} Middleware Express configurado.
 */
function createAuthenticationRateLimiter({
    windowMs = DEFAULT_LOGIN_RATE_LIMIT_WINDOW_MS,
    maxAttempts = DEFAULT_LOGIN_RATE_LIMIT_MAX_ATTEMPTS,
    rateLimitFactory = rateLimit,
} = {}) {
    validateWindow(windowMs);
    validateMaxAttempts(maxAttempts);

    if (typeof rateLimitFactory !== 'function') {
        throw new TypeError(
            AUTHENTICATION_RATE_LIMIT_ERRORS.INVALID_FACTORY,
        );
    }

    const middleware = rateLimitFactory({
        windowMs,
        limit: maxAttempts,

        /**
         * Emite o cabeçalho RateLimit moderno e não emite os antigos
         * X-RateLimit-*.
         */
        standardHeaders: 'draft-8',
        legacyHeaders: false,

        /**
         * Um login aprovado não deve reduzir a disponibilidade futura da
         * conta. Somente respostas recusadas permanecem na contagem.
         */
        skipSuccessfulRequests: true,

        /**
         * Se o armazenamento do contador falhar, a requisição permanece
         * bloqueada. Para uma rota de autenticação, falhar de modo fechado é
         * mais seguro do que remover silenciosamente a proteção.
         */
        passOnStoreError: false,

        /**
         * Encaminha um AppError ao tratamento centralizado. Assim, a resposta
         * mantém o mesmo formato JSON utilizado pelo restante da API.
         */
        handler(request, response, next) {
            next(new AppError(
                AUTHENTICATION_RATE_LIMIT_ERRORS
                    .TOO_MANY_ATTEMPTS,
                {
                    statusCode: 429,
                    code:
                        AUTHENTICATION_RATE_LIMIT_CODES
                            .TOO_MANY_ATTEMPTS,
                },
            ));
        },
    });

    if (typeof middleware !== 'function') {
        throw new TypeError(
            AUTHENTICATION_RATE_LIMIT_ERRORS.INVALID_MIDDLEWARE,
        );
    }

    return middleware;
}

module.exports = {
    AUTHENTICATION_RATE_LIMIT_CODES,
    AUTHENTICATION_RATE_LIMIT_ERRORS,
    DEFAULT_LOGIN_RATE_LIMIT_MAX_ATTEMPTS,
    DEFAULT_LOGIN_RATE_LIMIT_WINDOW_MS,
    MAX_LOGIN_RATE_LIMIT_MAX_ATTEMPTS,
    MAX_LOGIN_RATE_LIMIT_WINDOW_MS,
    MIN_LOGIN_RATE_LIMIT_MAX_ATTEMPTS,
    MIN_LOGIN_RATE_LIMIT_WINDOW_MS,
    createAuthenticationRateLimiter,
};
