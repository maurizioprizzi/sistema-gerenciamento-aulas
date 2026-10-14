'use strict';

/**
 * Caminhos internos. O prefixo /api/setup pertence à composição da aplicação.
 * Importar este arquivo não monta rotas nem inicia o servidor.
 */
const INITIAL_SETUP_ROUTE_PATHS = Object.freeze({
    STATUS: '/status',
    CREATE_ADMIN: '/admin',
});

const INITIAL_SETUP_ROUTE_ERRORS = Object.freeze({
    INVALID_CONTROLLER:
        'As rotas de primeiro cadastro exigem um controlador válido.',
    INVALID_RATE_LIMITER:
        'A criação administrativa exige um limitador de tentativas válido.',
    INVALID_REQUEST_GUARD:
        'A criação administrativa exige uma proteção de origem e JSON válida.',
    INVALID_ROUTER_FACTORY:
        'O primeiro cadastro exige uma fábrica de roteador válida.',
    INVALID_ROUTER:
        'A fábrica não retornou um roteador de primeiro cadastro válido.',
});

function defaultRouterFactory() {
    const express = require('express');
    return express.Router();
}

/**
 * Compõe o futuro roteador de primeiro cadastro com proteções obrigatórias.
 *
 * GET /status informa somente a disponibilidade, sem segredo, conta ou
 * credenciais. Não exige sessão administrativa, pois é consultado antes de
 * criar a conta. Não consome o contador exclusivo da criação.
 *
 * POST /admin executa limitador, verificação de origem/JSON e controlador,
 * nessa ordem. Até uma origem recusada consome uma tentativa. Uma requisição
 * bloqueada não chega às consultas do serviço nem ao cálculo bcrypt.
 * O convite e a reserva persistente são verificados pelo serviço.
 *
 * Middlewares não têm padrão permissivo: a composição deve fornecer ambos.
 * O roteador permanece protegido mesmo se montado em outro contexto.
 * Não existe rota pública de recuperação; essa operação pertence à futura
 * inicialização ou a um procedimento operacional controlado.
 *
 * @param {object} options Dependências HTTP já configuradas.
 * @param {object} options.controller Controlador com getStatus/createAdmin.
 * @param {Function} options.initialSetupRateLimiter Limitador específico.
 * @param {Function} options.initialSetupRequestGuard Proteção de origem/JSON.
 * @param {Function} [options.routerFactory=defaultRouterFactory] Fábrica Router.
 * @returns {import('express').Router} Roteador configurado, ainda não montado.
 */
function createInitialSetupRouter({
    controller,
    initialSetupRateLimiter,
    initialSetupRequestGuard,
    routerFactory = defaultRouterFactory,
} = {}) {
    if (
        !controller
        || typeof controller !== 'object'
        || Array.isArray(controller)
        || typeof controller.getStatus !== 'function'
        || typeof controller.createAdmin !== 'function'
    ) {
        throw new TypeError(INITIAL_SETUP_ROUTE_ERRORS.INVALID_CONTROLLER);
    }
    if (typeof initialSetupRateLimiter !== 'function') {
        throw new TypeError(INITIAL_SETUP_ROUTE_ERRORS.INVALID_RATE_LIMITER);
    }
    if (typeof initialSetupRequestGuard !== 'function') {
        throw new TypeError(INITIAL_SETUP_ROUTE_ERRORS.INVALID_REQUEST_GUARD);
    }
    if (typeof routerFactory !== 'function') {
        throw new TypeError(INITIAL_SETUP_ROUTE_ERRORS.INVALID_ROUTER_FACTORY);
    }

    const router = routerFactory();
    if (
        !router
        || !['object', 'function'].includes(typeof router)
        || typeof router.get !== 'function'
        || typeof router.post !== 'function'
    ) {
        throw new TypeError(INITIAL_SETUP_ROUTE_ERRORS.INVALID_ROUTER);
    }

    router.get(INITIAL_SETUP_ROUTE_PATHS.STATUS, controller.getStatus);
    router.post(
        INITIAL_SETUP_ROUTE_PATHS.CREATE_ADMIN,
        initialSetupRateLimiter,
        initialSetupRequestGuard,
        controller.createAdmin,
    );
    return router;
}

module.exports = {
    INITIAL_SETUP_ROUTE_PATHS,
    INITIAL_SETUP_ROUTE_ERRORS,
    createInitialSetupRouter,
    defaultRouterFactory,
};
