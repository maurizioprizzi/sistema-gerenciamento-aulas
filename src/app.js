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
 * receber uma instância nova e isolada. Isso também evita que o servidor
 * comece a escutar uma porta simplesmente porque este arquivo foi importado.
 *
 * O app recebe componentes HTTP já construídos. Ele não conhece:
 * - o segredo utilizado para assinar cookies;
 * - o MongoClient;
 * - o connect-mongo;
 * - as regras de autenticação;
 * - as regras de persistência das aulas e dos materiais mensais;
 * - o serviço de proteção de senhas;
 * - o caminho físico da compilação do frontend.
 *
 * Essa separação mantém a infraestrutura e as regras de negócio fora da
 * camada responsável por organizar os middlewares e as rotas.
 *
 * @param {object} options Opções da aplicação.
 * @param {{ error: Function }} [options.logger=console]
 * Serviço utilizado para registrar erros inesperados.
 * @param {Function | null} [options.securityHeadersMiddleware=null]
 * Middleware de cabeçalhos HTTP previamente configurado.
 * @param {Function | null} [options.sessionMiddleware=null]
 * Middleware de sessão previamente configurado.
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
     * Remove o cabeçalho "X-Powered-By".
     *
     * Esse cabeçalho revelaria desnecessariamente que o servidor utiliza
     * Express. Sua remoção é uma pequena medida de redução de exposição.
     */
    app.disable('x-powered-by');

    /**
     * Os cabeçalhos de segurança devem proteger todas as respostas, inclusive
     * diagnóstico, autenticação, erros de validação e rotas inexistentes.
     *
     * Eles são instalados antes de qualquer parser, sessão ou rota.
     */
    if (securityHeadersMiddleware) {
        app.use(securityHeadersMiddleware);
    }

    /**
     * Permite que a aplicação receba corpos de requisição no formato JSON.
     *
     * O limite evita que uma requisição excessivamente grande consuma
     * memória desnecessária. Neste projeto, 100 KB é mais do que suficiente
     * para os cadastros de aulas e materiais previstos.
     */
    app.use(express.json({
        limit: '100kb',
    }));

    /**
     * O middleware de sessão deve ser instalado antes das rotas de
     * autenticação e de calendário. Login e logout utilizam request.session,
     * enquanto aulas e materiais dependem da identidade validada a partir dela.
     *
     * Ele permanece opcional para permitir testes isolados da fundação HTTP.
     * O ciclo real do servidor sempre fornece o middleware configurado.
     */
    if (sessionMiddleware) {
        app.use(sessionMiddleware);
    }

    /**
     * As rotas administrativas de autenticação ficam sob um prefixo estável.
     *
     * Endereços resultantes:
     * - POST /api/auth/login;
     * - GET /api/auth/session;
     * - POST /api/auth/logout.
     */
    if (authenticationRouter) {
        app.use('/api/auth', authenticationRouter);
    }

    /**
     * As primeiras operações do calendário compartilham o prefixo de aulas.
     *
     * Endereços resultantes:
     * - GET /api/lessons;
     * - POST /api/lessons.
     *
     * A proteção administrativa pertence ao próprio roteador, mantendo sua
     * aplicação obrigatória mesmo se ele for montado em outro contexto.
     */
    if (lessonRouter) {
        app.use('/api/lessons', lessonRouter);
    }

    /**
     * Cada conjunto mensal possui um endereço determinado pelo próprio mês.
     *
     * Endereços resultantes:
     * - GET /api/monthly-materials/:month;
     * - PUT /api/monthly-materials/:month.
     *
     * A autorização administrativa permanece dentro do roteador para proteger
     * as operações mesmo quando ele for montado em outro contexto.
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
     * O frontend é instalado somente depois de todas as rotas da API.
     *
     * O middleware recebido também preserva caminhos desconhecidos sob
     * `/api`, permitindo que eles cheguem ao tratamento JSON de rota ausente.
     * Arquivos reais e navegações visuais são atendidos antes do 404.
     */
    if (frontendAssetsMiddleware) {
        app.use(frontendAssetsMiddleware);
    }

    /**
     * Este middleware deve permanecer depois de todas as rotas válidas.
     */
    app.use(notFoundHandler);

    /**
     * O middleware de erro deve ser sempre o último da aplicação.
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
