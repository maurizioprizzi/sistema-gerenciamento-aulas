const assert = require('node:assert/strict');
const http = require('node:http');
const {
    after,
    before,
    describe,
    test
} = require('node:test');

const { createApp } = require('../src/app');

/**
 * Testes de integração da aplicação HTTP.
 *
 * Estes testes usam apenas recursos nativos do Node.js:
 * - node:test para organizar e executar os testes;
 * - node:assert para realizar as verificações;
 * - node:http para iniciar um servidor temporário.
 *
 * Não precisamos instalar uma biblioteca de testes neste momento.
 */
describe('Aplicação HTTP', () => {
    let server;
    let baseUrl;

    /**
     * Antes dos testes, cria uma instância real da aplicação e solicita ao
     * sistema operacional uma porta livre.
     *
     * A porta 0 não significa que o servidor ficará na porta zero. Ela pede
     * ao sistema operacional que selecione automaticamente uma porta
     * disponível, evitando conflitos com o servidor de desenvolvimento.
     */
    before(async () => {
        const app = createApp();

        server = http.createServer(app);

        await new Promise((resolve, reject) => {
            server.once('error', reject);
            server.listen(0, '127.0.0.1', resolve);
        });

        const address = server.address();

        baseUrl = `http://127.0.0.1:${address.port}`;
    });

    /**
     * Depois dos testes, encerra o servidor temporário.
     *
     * Essa limpeza evita que o processo de testes permaneça aberto.
     */
    after(async () => {
        await new Promise((resolve, reject) => {
            server.close((error) => {
                if (error) {
                    reject(error);
                    return;
                }

                resolve();
            });
        });
    });

    test('GET /api/health retorna o estado da aplicação', async () => {
        const response = await fetch(`${baseUrl}/api/health`);
        const body = await response.json();

        assert.equal(response.status, 200);
        assert.equal(body.status, 'ok');
        assert.equal(
            body.application,
            'Calendário do Prof. Dionísio'
        );
        assert.equal(body.version, '0.1.0');

        /**
         * O horário muda em cada requisição. Em vez de comparar um valor
         * fixo, verificamos se ele pode ser interpretado como uma data válida.
         */
        assert.equal(
            Number.isNaN(Date.parse(body.timestamp)),
            false
        );
    });

    test('a aplicação não revela o uso do Express no cabeçalho', async () => {
        const response = await fetch(`${baseUrl}/api/health`);

        assert.equal(response.headers.get('x-powered-by'), null);
    });

    test('uma rota inexistente retorna erro JSON padronizado', async () => {
        const response = await fetch(`${baseUrl}/api/inexistente`);
        const body = await response.json();

        assert.equal(response.status, 404);
        assert.equal(
            response.headers.get('content-type'),
            'application/json; charset=utf-8'
        );
        assert.deepEqual(body, {
            error: {
                code: 'ROUTE_NOT_FOUND',
                message: 'O endereço solicitado não existe.'
            }
        });
    });
});