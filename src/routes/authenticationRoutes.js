'use strict';

/**
 * Caminhos internos do roteador de autenticação.
 *
 * O prefixo /api/auth será aplicado por app.js. Manter aqui somente os
 * caminhos relativos permite testar e reutilizar o roteador isoladamente.
 */
const AUTHENTICATION_ROUTE_PATHS = Object.freeze({
    LOGIN: '/login',
    LOGOUT: '/logout',
});

/**
 * Mensagens estáveis de configuração do roteador.
 */
const AUTHENTICATION_ROUTE_ERRORS = Object.freeze({
    INVALID_CONTROLLER:
        'As rotas exigem um controlador de autenticação válido.',
    INVALID_ROUTER_FACTORY:
        'As rotas exigem uma fábrica de roteador válida.',
    INVALID_ROUTER:
        'A fábrica não retornou um roteador válido.',
});

/**
 * Cria um Router real do Express somente quando necessário.
 *
 * A importação tardia mantém a fábrica principal facilmente testável com uma
 * implementação controlada, sem alterar o comportamento da aplicação real.
 *
 * @returns {import('express').Router} Roteador Express.
 */
function defaultRouterFactory() {
    const express = require('express');

    return express.Router();
}

/**
 * Verifica se o controlador oferece os handlers utilizados pelas rotas.
 *
 * @param {unknown} controller Controlador recebido.
 * @throws {TypeError} Quando login ou logout não são funções.
 */
function validateController(controller) {
    const isValid =
        controller !== null
        && typeof controller === 'object'
        && !Array.isArray(controller)
        && typeof controller.login === 'function'
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
 * O roteador não implementa autenticação, sessão ou respostas. Ele apenas
 * associa cada caminho ao handler correspondente do controlador.
 *
 * @param {object} options Configuração da fábrica.
 * @param {object} options.controller Controlador com login() e logout().
 * @param {Function} [options.routerFactory=defaultRouterFactory]
 * Fábrica do Router, substituível nos testes.
 * @returns {import('express').Router} Roteador configurado.
 */
function createAuthenticationRouter({
    controller,
    routerFactory = defaultRouterFactory,
} = {}) {
    validateController(controller);

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
    ) {
        throw new TypeError(
            AUTHENTICATION_ROUTE_ERRORS.INVALID_ROUTER,
        );
    }

    router.post(
        AUTHENTICATION_ROUTE_PATHS.LOGIN,
        controller.login,
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
