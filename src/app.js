'use strict';

const express = require('express');

const {
    notFoundHandler,
    createErrorHandler,
} = require('./middlewares/errorHandler');

/**
 * Mensagens relacionadas à configuração da aplicação.
 */
const APP_ERROR_MESSAGES = Object.freeze({
    INVALID_SECURITY_HEADERS_MIDDLEWARE:
        'A aplicação exige um middleware de segurança válido quando ele é informado.',
    INVALID_SESSION_MIDDLEWARE:
        'A aplicação exige um middleware de sessão válido quando ele é informado.',
    INVALID_INITIAL_SETUP_ROUTER:
        'A aplicação exige um roteador de primeiro acesso válido quando ele é informado.',
    INVALID_AUTHENTICATION_ROUTER:
        'A aplicação exige um roteador de autenticação válido quando ele é informado.',
    INVALID_LESSON_ROUTER:
        'A aplicação exige um roteador de aulas válido quando ele é informado.',
    INVALID_MONTHLY_MATERIAL_ROUTER:
        'A aplicação exige um roteador de materiais mensais válido quando ele é informado.',
    INVALID_FRONTEND_ASSETS_MIDDLEWARE:
        'A aplicação exige um middleware de frontend válido quando ele é informado.',
});

/**
 * Cria e configura a aplicação Express.
 *
 * A aplicação é construída dentro de uma função para que cada teste possa
 * receber uma instância nova e isolada. Importar este arquivo não abre uma
 * porta HTTP.
 *
 * Os componentes são construídos fora daqui. Esta função apenas valida sua
 * presença e determina a ordem dos middlewares e das rotas.
 *
 * @param {object} options Opções da aplicação.
 * @param {{ error: Function }} [options.logger=console]
 * Serviço utilizado para registrar erros inesperados.
 * @param {Function | null} [options.securityHeadersMiddleware=null]
 * Middleware de cabeçalhos HTTP previamente configurado.
 * @param {Function | null} [options.sessionMiddleware=null]
 * Middleware de sessão previamente configurado.
 * @param {Function | null} [options.initialSetupRouter=null]
 * Roteador futuro para o primeiro cadastro com convite.
 * @param {Function | null} [options.authenticationRouter=null]
 * Roteador responsável pela entrada e saída administrativas.
 * @param {Function | null} [options.lessonRouter=null]
 * Roteador responsável pelas operações administrativas de aulas.
 * @param {Function | null} [options.monthlyMaterialRouter=null]
 * Roteador responsável pelos materiais aplicáveis a cada mês.
 * @param {Function | null} [options.frontendAssetsMiddleware=null]
 * Middleware responsável pela compilação do frontend.
 *
 * @returns {import('express').Express} Aplicação Express configurada.
 */
function createApp({
    logger = console,
    securityHeadersMiddleware = null,
    sessionMiddleware = null,
    initialSetupRouter = null,
    authenticationRouter = null,
    lessonRouter = null,
    monthlyMaterialRouter = null,
    frontendAssetsMiddleware = null,
} = {}) {
    if (
        securityHeadersMiddleware !== null
        && typeof securityHeadersMiddleware !== 'function'
    ) {
        throw new TypeError(
            APP_ERROR_MESSAGES
                .INVALID_SECURITY_HEADERS_MIDDLEWARE,
        );
    }

    if (
        sessionMiddleware !== null
        && typeof sessionMiddleware !== 'function'
    ) {
        throw new TypeError(
            APP_ERROR_MESSAGES.INVALID_SESSION_MIDDLEWARE,
        );
    }

    if (
        initialSetupRouter !== null
        && typeof initialSetupRouter !== 'function'
    ) {
        throw new TypeError(
            APP_ERROR_MESSAGES.INVALID_INITIAL_SETUP_ROUTER,
        );
    }

    if (
        authenticationRouter !== null
        && typeof authenticationRouter !== 'function'
    ) {
        throw new TypeError(
            APP_ERROR_MESSAGES.INVALID_AUTHENTICATION_ROUTER,
        );
    }

    if (
        lessonRouter !== null
        && typeof lessonRouter !== 'function'
    ) {
        throw new TypeError(
            APP_ERROR_MESSAGES.INVALID_LESSON_ROUTER,
        );
    }

    if (
        monthlyMaterialRouter !== null
        && typeof monthlyMaterialRouter !== 'function'
    ) {
        throw new TypeError(
            APP_ERROR_MESSAGES
                .INVALID_MONTHLY_MATERIAL_ROUTER,
        );
    }

    if (
        frontendAssetsMiddleware !== null
        && typeof frontendAssetsMiddleware !== 'function'
    ) {
        throw new TypeError(
            APP_ERROR_MESSAGES
                .INVALID_FRONTEND_ASSETS_MIDDLEWARE,
        );
    }

    const app = express();

    /**
     * Evita divulgar desnecessariamente que o servidor utiliza Express.
     */
    app.disable('x-powered-by');

    /**
     * Os cabeçalhos de segurança protegem também erros e rotas públicas.
     */
    if (securityHeadersMiddleware) {
        app.use(securityHeadersMiddleware);
    }

    /**
     * Limita o tamanho dos corpos JSON recebidos.
     */
    app.use(express.json({
        limit: '100kb',
    }));

    /**
     * Login e rotas administrativas utilizam a sessão. O primeiro cadastro
     * poderá ser montado aqui sem criar uma sessão para visitantes anônimos,
     * pois o middleware de sessão usa saveUninitialized: false.
     */
    if (sessionMiddleware) {
        app.use(sessionMiddleware);
    }

    /**
     * Este ponto fica inativo enquanto server.js não fornecer o roteador.
     *
     * Quando o fluxo estiver completo, o roteador ficará responsável por
     * validar o convite e impedir um segundo cadastro inicial.
     */
    if (initialSetupRouter) {
        app.use('/api/setup', initialSetupRouter);
    }

    /**
     * Rotas administrativas de entrada, consulta de sessão e saída.
     */
    if (authenticationRouter) {
        app.use('/api/auth', authenticationRouter);
    }

    /**
     * O próprio roteador exige autorização administrativa antes das
     * operações de consulta, criação, edição e exclusão de aulas.
     */
    if (lessonRouter) {
        app.use('/api/lessons', lessonRouter);
    }

    /**
     * A autorização das operações mensais pertence ao próprio roteador.
     */
    if (monthlyMaterialRouter) {
        app.use(
            '/api/monthly-materials',
            monthlyMaterialRouter,
        );
    }

    /**
     * Rota pública de diagnóstico.
     */
    app.get('/api/health', (request, response) => {
        response.status(200).json({
            status: 'ok',
            application: 'Calendário do Prof. Dionísio',
            version: '0.1.0',
            timestamp: new Date().toISOString(),
        });
    });

    /**
     * Os arquivos do frontend são oferecidos depois das rotas da API.
     */
    if (frontendAssetsMiddleware) {
        app.use(frontendAssetsMiddleware);
    }

    /**
     * Uma rota desconhecida recebe a resposta JSON padronizada.
     */
    app.use(notFoundHandler);

    /**
     * O tratamento centralizado de erros permanece por último.
     */
    app.use(createErrorHandler({
        logger,
    }));

    return app;
}

module.exports = {
    APP_ERROR_MESSAGES,
    createApp,
};