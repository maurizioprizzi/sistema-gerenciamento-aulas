'use strict';

const {
    requireAdministrativeAuthentication,
} = require('../middlewares/administrativeAuthorization');

/**
 * Caminhos internos do roteador de aulas.
 *
 * O prefixo `/api/lessons` será aplicado posteriormente por `app.js`. Criação
 * e consulta permanecem na raiz interna. Edição e exclusão identificam um
 * único recurso pelo parâmetro de caminho 'id'.
 */
const LESSON_ROUTE_PATHS = Object.freeze({
    COLLECTION: '/',
    ITEM: '/:id',
});

/**
 * Mensagens estáveis relacionadas à configuração do roteador.
 */
const LESSON_ROUTE_ERRORS = Object.freeze({
    INVALID_CONTROLLER:
        'As rotas exigem um controlador de aulas válido.',
    INVALID_ADMINISTRATIVE_AUTHORIZATION:
        'As rotas de aulas exigem um middleware de autorização administrativa válido.',
    INVALID_ROUTER_FACTORY:
        'As rotas de aulas exigem uma fábrica de roteador válida.',
    INVALID_ROUTER:
        'A fábrica não retornou um roteador de aulas válido.',
});

/**
 * Cria o Router real somente quando a fábrica não é substituída.
 *
 * O carregamento tardio mantém os testes unitários independentes de uma
 * aplicação Express em execução.
 *
 * @returns {import('express').Router} Novo roteador Express.
 */
function defaultLessonRouterFactory() {
    const express = require('express');

    return express.Router();
}

/**
 * Valida o controlador exigido pelas rotas da coleção.
 *
 * @param {unknown} controller Controlador recebido.
 * @throws {TypeError} Quando algum handler exigido não está disponível.
 */
function validateLessonController(controller) {
    const isValid =
        controller !== null
        && typeof controller === 'object'
        && !Array.isArray(controller)
        && typeof controller.create === 'function'
        && typeof controller.update === 'function'
        && typeof controller.delete === 'function'
        && typeof controller.list === 'function';

    if (!isValid) {
        throw new TypeError(
            LESSON_ROUTE_ERRORS.INVALID_CONTROLLER,
        );
    }
}

/**
 * Cria as rotas administrativas de criação, edição, exclusão e consulta.
 *
 * O middleware de autorização aparece antes de cada handler. Assim, nenhuma
 * consulta ao calendário nem tentativa de persistência ocorre sem uma sessão
 * administrativa válida.
 *
 * A fábrica não instancia serviços nem acessa o MongoDB. Suas dependências são
 * recebidas prontas para preservar composição explícita e testes isolados.
 *
 * @param {object} options Configuração da fábrica.
 * @param {object} options.controller Controlador de aulas.
 * @param {Function} [options.administrativeAuthorizationMiddleware]
 * Middleware que protege todas as operações da coleção.
 * @param {Function} [options.routerFactory]
 * Fábrica do Router, substituível nos testes.
 * @returns {import('express').Router} Roteador configurado.
 */
function createLessonRouter({
    controller,
    administrativeAuthorizationMiddleware =
        requireAdministrativeAuthentication,
    routerFactory = defaultLessonRouterFactory,
} = {}) {
    validateLessonController(controller);

    if (
        typeof administrativeAuthorizationMiddleware
            !== 'function'
    ) {
        throw new TypeError(
            LESSON_ROUTE_ERRORS
                .INVALID_ADMINISTRATIVE_AUTHORIZATION,
        );
    }

    if (typeof routerFactory !== 'function') {
        throw new TypeError(
            LESSON_ROUTE_ERRORS.INVALID_ROUTER_FACTORY,
        );
    }

    const router = routerFactory();

    if (
        !router
        || (
            typeof router !== 'object'
            && typeof router !== 'function'
        )
        || typeof router.get !== 'function'
        || typeof router.post !== 'function'
        || typeof router.put !== 'function'
        || typeof router.delete !== 'function'
    ) {
        throw new TypeError(
            LESSON_ROUTE_ERRORS.INVALID_ROUTER,
        );
    }

    router.get(
        LESSON_ROUTE_PATHS.COLLECTION,
        administrativeAuthorizationMiddleware,
        controller.list,
    );

    router.post(
        LESSON_ROUTE_PATHS.COLLECTION,
        administrativeAuthorizationMiddleware,
        controller.create,
    );

    router.put(
        LESSON_ROUTE_PATHS.ITEM,
        administrativeAuthorizationMiddleware,
        controller.update,
    );

    router.delete(
        LESSON_ROUTE_PATHS.ITEM,
        administrativeAuthorizationMiddleware,
        controller.delete,
    );

    return router;
}

module.exports = {
    LESSON_ROUTE_ERRORS,
    LESSON_ROUTE_PATHS,
    createLessonRouter,
    defaultLessonRouterFactory,
};
