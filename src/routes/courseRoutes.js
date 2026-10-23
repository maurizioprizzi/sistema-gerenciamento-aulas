'use strict';

const {
    requireAdministrativeAuthentication,
} = require('../middlewares/administrativeAuthorization');

/** O prefixo /api/courses será aplicado pela composição da aplicação. */
const COURSE_ROUTE_PATHS = Object.freeze({
    COLLECTION: '/',
    ITEM: '/:id',
    DEACTIVATION: '/:id/deactivate',
});

const COURSE_ROUTE_ERRORS = Object.freeze({
    INVALID_CONTROLLER:
        'As rotas exigem um controlador de cursos válido.',
    INVALID_ADMINISTRATIVE_AUTHORIZATION:
        'As rotas de cursos exigem um middleware de autorização administrativa válido.',
    INVALID_ROUTER_FACTORY:
        'As rotas de cursos exigem uma fábrica de roteador válida.',
    INVALID_ROUTER:
        'A fábrica não retornou um roteador de cursos válido.',
});

function defaultCourseRouterFactory() {
    const express = require('express');
    return express.Router();
}

/**
 * Compõe as quatro operações do cadastro de cursos:
 *
 * - `GET /`: lista, com filtro active opcional;
 * - `POST /`: cadastra nome e sigla;
 * - `PUT /:id`: edita nome e sigla;
 * - `PATCH /:id/deactivate`: desativa o curso, preservando o registro.
 *
 * A autorização antecede cada controlador, inclusive na listagem. O roteador
 * continua protegido se montado em outro contexto. Não há rota de exclusão.
 * A fábrica recebe dependências prontas e não acessa banco, índices ou sessões.
 * Importar este arquivo não monta rotas no servidor real.
 *
 * @param {object} options Dependências HTTP.
 * @param {object} options.controller Controlador de cursos.
 * @param {Function} [options.administrativeAuthorizationMiddleware]
 * Middleware administrativo, substituível nos testes.
 * @param {Function} [options.routerFactory] Fábrica do Router.
 * @returns {import('express').Router} Roteador configurado.
 */
function createCourseRouter({
    controller,
    administrativeAuthorizationMiddleware = requireAdministrativeAuthentication,
    routerFactory = defaultCourseRouterFactory,
} = {}) {
    if (
        !controller
        || typeof controller !== 'object'
        || Array.isArray(controller)
        || !['list', 'create', 'update', 'deactivate']
            .every((method) => typeof controller[method] === 'function')
    ) {
        throw new TypeError(COURSE_ROUTE_ERRORS.INVALID_CONTROLLER);
    }

    if (typeof administrativeAuthorizationMiddleware !== 'function') {
        throw new TypeError(COURSE_ROUTE_ERRORS.INVALID_ADMINISTRATIVE_AUTHORIZATION);
    }
    if (typeof routerFactory !== 'function') {
        throw new TypeError(COURSE_ROUTE_ERRORS.INVALID_ROUTER_FACTORY);
    }

    const router = routerFactory();
    if (
        !router
        || !['object', 'function'].includes(typeof router)
        || Array.isArray(router)
        || !['get', 'post', 'put', 'patch']
            .every((method) => typeof router[method] === 'function')
    ) {
        throw new TypeError(COURSE_ROUTE_ERRORS.INVALID_ROUTER);
    }

    router.get(
        COURSE_ROUTE_PATHS.COLLECTION,
        administrativeAuthorizationMiddleware,
        controller.list,
    );
    router.post(
        COURSE_ROUTE_PATHS.COLLECTION,
        administrativeAuthorizationMiddleware,
        controller.create,
    );
    router.put(
        COURSE_ROUTE_PATHS.ITEM,
        administrativeAuthorizationMiddleware,
        controller.update,
    );
    router.patch(
        COURSE_ROUTE_PATHS.DEACTIVATION,
        administrativeAuthorizationMiddleware,
        controller.deactivate,
    );

    return router;
}

module.exports = {
    COURSE_ROUTE_PATHS,
    COURSE_ROUTE_ERRORS,
    createCourseRouter,
    defaultCourseRouterFactory,
};
