'use strict';

const { rateLimit } = require('express-rate-limit');
const { AppError } = require('../errors/AppError');

const DEFAULT_INITIAL_SETUP_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const DEFAULT_INITIAL_SETUP_RATE_LIMIT_MAX_ATTEMPTS = 5;
const MIN_INITIAL_SETUP_RATE_LIMIT_WINDOW_MS = 1000;
const MAX_INITIAL_SETUP_RATE_LIMIT_WINDOW_MS = 24 * 60 * 60 * 1000;
const MIN_INITIAL_SETUP_RATE_LIMIT_MAX_ATTEMPTS = 1;
const MAX_INITIAL_SETUP_RATE_LIMIT_MAX_ATTEMPTS = 100;

const INITIAL_SETUP_RATE_LIMIT_CODES = Object.freeze({
    TOO_MANY_ATTEMPTS: 'INITIAL_SETUP_RATE_LIMITED',
});

const INITIAL_SETUP_RATE_LIMIT_ERRORS = Object.freeze({
    INVALID_WINDOW:
        'A janela do limitador de primeiro cadastro deve ser um número inteiro entre um segundo e vinte e quatro horas.',
    INVALID_MAX_ATTEMPTS:
        'O limite de primeiro cadastro deve ser um número inteiro entre 1 e 100.',
    INVALID_FACTORY:
        'O primeiro cadastro exige uma fábrica de limitação válida.',
    INVALID_MIDDLEWARE:
        'A fábrica não retornou um middleware de limitação válido.',
    TOO_MANY_ATTEMPTS:
        'Muitas tentativas de primeiro cadastro foram realizadas. Aguarde alguns minutos e tente novamente.',
});

/**
 * Cria um contador exclusivo do futuro POST de primeiro cadastro.
 *
 * O contador padrão fica em memória por instância da aplicação. Reiniciar
 * o processo reinicia esse contador; a reserva persistente continua sendo
 * a proteção de uso único. Múltiplas instâncias exigirão armazenamento
 * compartilhado antes de uma implantação com essa configuração.
 *
 * Todas as tentativas que chegam ao middleware são contadas, incluindo
 * sucesso. A consulta GET de disponibilidade não utiliza este contador.
 * Não definimos keyGenerator: a biblioteca trata req.ip e IPv6.
 * Não compartilhamos a instância ou o contador com o login.
 *
 * O futuro roteador deve instalar este middleware antes do controlador,
 * preservando a limitação antes das consultas e do cálculo bcrypt.
 * Este arquivo não registra rotas nem altera o limitador do login.
 *
 * @param {object} options Configuração e fábrica substituível nos testes.
 * @param {number} [options.windowMs] Janela em milissegundos.
 * @param {number} [options.maxAttempts] Quantidade máxima por endereço.
 * @param {Function} [options.rateLimitFactory=rateLimit] Fábrica da biblioteca.
 * @returns {import('express').RequestHandler} Limitador específico do cadastro.
 */
function createInitialSetupRateLimiter({
    windowMs = DEFAULT_INITIAL_SETUP_RATE_LIMIT_WINDOW_MS,
    maxAttempts = DEFAULT_INITIAL_SETUP_RATE_LIMIT_MAX_ATTEMPTS,
    rateLimitFactory = rateLimit,
} = {}) {
    if (
        !Number.isInteger(windowMs)
        || windowMs < MIN_INITIAL_SETUP_RATE_LIMIT_WINDOW_MS
        || windowMs > MAX_INITIAL_SETUP_RATE_LIMIT_WINDOW_MS
    ) {
        throw new RangeError(INITIAL_SETUP_RATE_LIMIT_ERRORS.INVALID_WINDOW);
    }
    if (
        !Number.isInteger(maxAttempts)
        || maxAttempts < MIN_INITIAL_SETUP_RATE_LIMIT_MAX_ATTEMPTS
        || maxAttempts > MAX_INITIAL_SETUP_RATE_LIMIT_MAX_ATTEMPTS
    ) {
        throw new RangeError(INITIAL_SETUP_RATE_LIMIT_ERRORS.INVALID_MAX_ATTEMPTS);
    }
    if (typeof rateLimitFactory !== 'function') {
        throw new TypeError(INITIAL_SETUP_RATE_LIMIT_ERRORS.INVALID_FACTORY);
    }

    const middleware = rateLimitFactory({
        windowMs,
        limit: maxAttempts,
        standardHeaders: 'draft-8',
        legacyHeaders: false,
        skipSuccessfulRequests: false,
        skipFailedRequests: false,
        passOnStoreError: false,
        handler(request, response, next) {
            response.set('Cache-Control', 'no-store');
            next(new AppError(INITIAL_SETUP_RATE_LIMIT_ERRORS.TOO_MANY_ATTEMPTS, {
                statusCode: 429,
                code: INITIAL_SETUP_RATE_LIMIT_CODES.TOO_MANY_ATTEMPTS,
            }));
        },
    });

    if (typeof middleware !== 'function') {
        throw new TypeError(INITIAL_SETUP_RATE_LIMIT_ERRORS.INVALID_MIDDLEWARE);
    }
    return middleware;
}

module.exports = {
    DEFAULT_INITIAL_SETUP_RATE_LIMIT_WINDOW_MS,
    DEFAULT_INITIAL_SETUP_RATE_LIMIT_MAX_ATTEMPTS,
    MIN_INITIAL_SETUP_RATE_LIMIT_WINDOW_MS,
    MAX_INITIAL_SETUP_RATE_LIMIT_WINDOW_MS,
    MIN_INITIAL_SETUP_RATE_LIMIT_MAX_ATTEMPTS,
    MAX_INITIAL_SETUP_RATE_LIMIT_MAX_ATTEMPTS,
    INITIAL_SETUP_RATE_LIMIT_CODES,
    INITIAL_SETUP_RATE_LIMIT_ERRORS,
    createInitialSetupRateLimiter,
};
