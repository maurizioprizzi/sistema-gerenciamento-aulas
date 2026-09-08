const express = require('express');

/**
 * Cria e configura a aplicação Express.
 *
 * A aplicação é construída dentro de uma função para que cada teste possa
 * receber uma instância nova e isolada. Isso também evita que o servidor
 * comece a escutar uma porta simplesmente porque este arquivo foi importado.
 *
 * @returns {import('express').Express} Aplicação Express configurada.
 */
function createApp() {
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
    app.use(express.json({ limit: '100kb' }));

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
     * Resposta padronizada para endereços inexistentes.
     *
     * Este middleware deve permanecer depois das rotas válidas. O Express
     * chega até ele somente quando nenhuma rota anterior atendeu a requisição.
     */
    app.use((request, response) => {
        response.status(404).json({
            error: {
                code: 'ROUTE_NOT_FOUND',
                message: 'O endereço solicitado não existe.'
            }
        });
    });

    return app;
}

module.exports = { createApp };