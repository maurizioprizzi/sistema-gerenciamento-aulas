'use strict';

const {
    requireAdministrativeAuthentication,
} = require('../middlewares/administrativeAuthorization');

/**
 * Caminhos internos do roteador de autenticação.
 *
 * O prefixo /api/auth será aplicado por app.js.
 */
const AUTHENTICATION_ROUTE_PATHS = Object.freeze({
    LOGIN: '/login',
    SESSION: '/session',
    LOGOUT: '/logout',
});

/**
 * Mensagens estáveis de configuração do roteador.
 */
const AUTHENTICATION_ROUTE_ERRORS = Object.freeze({
    INVALID_CONTROLLER:
        'As rotas exigem um controlador de autenticação válido.',
    INVALID_LOGIN_RATE_LIMITER:
        'A rota de login exige um middleware de limitação válido.',
    INVALID_ADMINISTRATIVE_AUTHORIZATION:
        'A consulta de sessão exige um middleware de autorização válido.',
    INVALID_ROUTER_FACTORY:
        'As rotas exigem uma fábrica de roteador válida.',
    INVALID_ROUTER:
        'A fábrica não retornou um roteador válido.',
});

function defaultRouterFactory() {
    const express = require('express');

    return express.Router();
}

function validateController(controller) {
    const isValid =
        controller !== null
        && typeof controller === 'object'
        && !Array.isArray(controller)
        && typeof controller.login === 'function'
        && typeof controller.getSession === 'function'
        && typeof controller.logout === 'function';

    if (!isValid) {
        throw new TypeError(
            AUTHENTICATION_ROUTE_ERRORS.INVALID_CONTROLLER,
        );
    }
}

/**
 * Cria as rotas públicas de entrada e saída.
 *
 * O limitador aparece antes do controlador de login. Dessa forma, uma
 * requisição bloqueada não chega à consulta do usuário nem ao bcrypt.
 *
 * O logout não utiliza o limitador. Uma sessão existente deve poder ser
 * encerrada mesmo quando novas tentativas de entrada estiverem bloqueadas.
 *
 * @param {object} options Configuração da fábrica.
 * @param {object} options.controller Controlador de autenticação.
 * @param {Function} options.loginRateLimiter Middleware exclusivo do login.
 * @param {Function} [options.administrativeAuthorizationMiddleware]
 * Middleware que protege a consulta da sessão.
 * @param {Function} [options.routerFactory=defaultRouterFactory]
 * Fábrica do Router, substituível nos testes.
 * @returns {import('express').Router} Roteador configurado.
 */
function createAuthenticationRouter({
    controller,
    loginRateLimiter,
    administrativeAuthorizationMiddleware =
        requireAdministrativeAuthentication,
    routerFactory = defaultRouterFactory,
} = {}) {
    validateController(controller);

    if (typeof loginRateLimiter !== 'function') {
        throw new TypeError(
            AUTHENTICATION_ROUTE_ERRORS
                .INVALID_LOGIN_RATE_LIMITER,
        );
    }

    if (
        typeof administrativeAuthorizationMiddleware
            !== 'function'
    ) {
        throw new TypeError(
            AUTHENTICATION_ROUTE_ERRORS
                .INVALID_ADMINISTRATIVE_AUTHORIZATION,
        );
    }

    if (typeof routerFactory !== 'function') {
        throw new TypeError(
            AUTHENTICATION_ROUTE_ERRORS.INVALID_ROUTER_FACTORY,
        );
    }

    const router = routerFactory();

    if (
        !router
        || (
            typeof router !== 'object'
            && typeof router !== 'function'
        )
        || typeof router.post !== 'function'
        || typeof router.get !== 'function'
    ) {
        throw new TypeError(
            AUTHENTICATION_ROUTE_ERRORS.INVALID_ROUTER,
        );
    }

    router.post(
        AUTHENTICATION_ROUTE_PATHS.LOGIN,
        loginRateLimiter,
        controller.login,
    );

    router.get(
        AUTHENTICATION_ROUTE_PATHS.SESSION,
        administrativeAuthorizationMiddleware,
        controller.getSession,
    );

    router.post(
        AUTHENTICATION_ROUTE_PATHS.LOGOUT,
        controller.logout,
    );

    return router;
}

module.exports = {
    AUTHENTICATION_ROUTE_ERRORS,
    AUTHENTICATION_ROUTE_PATHS,
    createAuthenticationRouter,
    defaultRouterFactory,
};
