'use strict';

const {
    requireAdministrativeAuthentication,
} = require('../middlewares/administrativeAuthorization');

/**
 * Caminhos internos do roteador de materiais mensais.
 *
 * O prefixo `/api/monthly-materials` será aplicado posteriormente pelo app.
 * O mês identifica diretamente o único recurso permitido para o período.
 */
const MONTHLY_MATERIAL_ROUTE_PATHS = Object.freeze({
    COLLECTION: '/',
    RESOURCE_BY_MONTH: '/:month',
});

/**
 * Mensagens estáveis relacionadas à configuração do roteador.
 */
const MONTHLY_MATERIAL_ROUTE_ERRORS = Object.freeze({
    INVALID_CONTROLLER:
        'As rotas exigem um controlador de materiais mensais válido.',
    INVALID_ADMINISTRATIVE_AUTHORIZATION:
        'As rotas de materiais mensais exigem um middleware de autorização administrativa válido.',
    INVALID_ROUTER_FACTORY:
        'As rotas de materiais mensais exigem uma fábrica de roteador válida.',
    INVALID_ROUTER:
        'A fábrica não retornou um roteador de materiais mensais válido.',
});

/**
 * Cria o Router real somente quando a fábrica não é substituída.
 *
 * O carregamento tardio mantém os testes unitários independentes de uma
 * aplicação Express em execução.
 *
 * @returns {import('express').Router} Novo roteador Express.
 */
function defaultMonthlyMaterialRouterFactory() {
    const express = require('express');

    return express.Router();
}

/**
 * Valida o controlador exigido pelas rotas mensais.
 *
 * @param {unknown} controller Controlador recebido.
 * @throws {TypeError} Quando os quatro handlers não estão disponíveis.
 */
function validateMonthlyMaterialController(controller) {
    const isValid =
        controller !== null
        && typeof controller === 'object'
        && !Array.isArray(controller)
        && typeof controller.list === 'function'
        && typeof controller.get === 'function'
        && typeof controller.save === 'function'
        && typeof controller.remove === 'function';

    if (!isValid) {
        throw new TypeError(
            MONTHLY_MATERIAL_ROUTE_ERRORS.INVALID_CONTROLLER,
        );
    }
}

/**
 * Cria as rotas administrativas da coleção e de cada recurso mensal.
 *
 * O middleware de autorização aparece antes de cada handler. Assim, nenhuma
 * operação alcança o serviço sem uma sessão administrativa válida.
 *
 * A fábrica recebe todas as dependências prontas, não instancia serviços e não
 * abre conexão com o MongoDB.
 *
 * @param {object} options Configuração da fábrica.
 * @param {object} options.controller Controlador mensal.
 * @param {Function} [options.administrativeAuthorizationMiddleware]
 * Middleware que protege listagem, consulta, gravação e exclusão.
 * @param {Function} [options.routerFactory]
 * Fábrica do Router, substituível nos testes.
 * @returns {import('express').Router} Roteador configurado.
 */
function createMonthlyMaterialRouter({
    controller,
    administrativeAuthorizationMiddleware =
        requireAdministrativeAuthentication,
    routerFactory = defaultMonthlyMaterialRouterFactory,
} = {}) {
    validateMonthlyMaterialController(controller);

    if (
        typeof administrativeAuthorizationMiddleware
            !== 'function'
    ) {
        throw new TypeError(
            MONTHLY_MATERIAL_ROUTE_ERRORS
                .INVALID_ADMINISTRATIVE_AUTHORIZATION,
        );
    }

    if (typeof routerFactory !== 'function') {
        throw new TypeError(
            MONTHLY_MATERIAL_ROUTE_ERRORS.INVALID_ROUTER_FACTORY,
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
        || typeof router.put !== 'function'
        || typeof router.delete !== 'function'
    ) {
        throw new TypeError(
            MONTHLY_MATERIAL_ROUTE_ERRORS.INVALID_ROUTER,
        );
    }

    router.get(
        MONTHLY_MATERIAL_ROUTE_PATHS.COLLECTION,
        administrativeAuthorizationMiddleware,
        controller.list,
    );

    router.get(
        MONTHLY_MATERIAL_ROUTE_PATHS.RESOURCE_BY_MONTH,
        administrativeAuthorizationMiddleware,
        controller.get,
    );

    router.put(
        MONTHLY_MATERIAL_ROUTE_PATHS.RESOURCE_BY_MONTH,
        administrativeAuthorizationMiddleware,
        controller.save,
    );

    router.delete(
        MONTHLY_MATERIAL_ROUTE_PATHS.RESOURCE_BY_MONTH,
        administrativeAuthorizationMiddleware,
        controller.remove,
    );

    return router;
}

module.exports = {
    MONTHLY_MATERIAL_ROUTE_ERRORS,
    MONTHLY_MATERIAL_ROUTE_PATHS,
    createMonthlyMaterialRouter,
    defaultMonthlyMaterialRouterFactory,
};
