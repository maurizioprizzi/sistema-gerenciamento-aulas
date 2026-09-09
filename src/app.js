'use strict';

const express = require('express');

const {
    notFoundHandler,
    createErrorHandler
} = require('./middlewares/errorHandler');

/**
 * Mensagens relacionadas à configuração da aplicação.
 */
const APP_ERROR_MESSAGES = Object.freeze({
    INVALID_SESSION_MIDDLEWARE:
        'A aplicação exige um middleware de sessão válido quando ele é informado.'
});

/**
 * Cria e configura a aplicação Express.
 *
 * A aplicação é construída dentro de uma função para que cada teste possa
 * receber uma instância nova e isolada. Isso também evita que o servidor
 * comece a escutar uma porta simplesmente porque este arquivo foi importado.
 *
 * O app recebe somente o middleware de sessão já construído. Ele não conhece:
 * - o segredo utilizado para assinar cookies;
 * - o MongoClient;
 * - o connect-mongo;
 * - as regras de criação do armazenamento.
 *
 * Essa separação mantém a infraestrutura fora da camada HTTP.
 *
 * @param {object} options Opções da aplicação.
 * @param {{ error: Function }} [options.logger=console]
 * Serviço utilizado para registrar erros inesperados.
 * @param {Function | null} [options.sessionMiddleware=null]
 * Middleware de sessão previamente configurado.
 *
 * @returns {import('express').Express} Aplicação Express configurada.
 */
function createApp({
    logger = console,
    sessionMiddleware = null
} = {}) {
    if (
        sessionMiddleware !== null
        && typeof sessionMiddleware !== 'function'
    ) {
        throw new TypeError(
            APP_ERROR_MESSAGES.INVALID_SESSION_MIDDLEWARE
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
     * Permite que a aplicação receba corpos de requisição no formato JSON.
     *
     * O limite evita que uma requisição excessivamente grande consuma
     * memória desnecessária. Neste projeto, 100 KB é mais do que suficiente
     * para os futuros cadastros de aulas e materiais.
     */
    app.use(express.json({
        limit: '100kb'
    }));

    /**
     * O middleware de sessão deve ser instalado antes das rotas que poderão
     * utilizar request.session.
     *
     * Neste estágio ele permanece opcional para que a fundação HTTP também
     * possa ser criada isoladamente. O ciclo real do servidor fornecerá esse
     * middleware antes da abertura da porta.
     */
    if (sessionMiddleware) {
        app.use(sessionMiddleware);
    }

    /**
     * Rota pública de diagnóstico.
     *
     * Ela será usada para confirmar que:
     * - o processo Node está funcionando;
     * - o Express respondeu à requisição;
     * - a aplicação está acessível pela rede.
     */
    app.get('/api/health', (request, response) => {
        response.status(200).json({
            status: 'ok',
            application: 'Calendário do Prof. Dionísio',
            version: '0.1.0',
            timestamp: new Date().toISOString()
        });
    });

    /**
     * Este middleware deve permanecer depois de todas as rotas válidas.
     *
     * Se nenhuma rota anterior atender a requisição, ele cria um AppError
     * com o código ROUTE_NOT_FOUND e o encaminha ao tratamento central.
     */
    app.use(notFoundHandler);

    /**
     * O middleware de erro deve ser sempre o último da aplicação.
     *
     * Ele transforma erros operacionais em respostas conhecidas e impede que
     * falhas inesperadas exponham informações internas ao navegador.
     */
    app.use(createErrorHandler({
        logger
    }));

    return app;
}

module.exports = {
    APP_ERROR_MESSAGES,
    createApp
};