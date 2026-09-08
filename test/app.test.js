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
 * Estes testes utilizam somente recursos nativos do Node.js:
 * - node:test para organizar e executar os testes;
 * - node:assert para realizar as verificações;
 * - node:http para iniciar um servidor temporário;
 * - fetch para enviar requisições HTTP reais.
 */
describe('Aplicação HTTP', () => {
    let server;
    let baseUrl;

    /**
     * O logger de teste impede que erros intencionais poluam o terminal.
     */
    const logger = {
        calls: [],

        error(...argumentsReceived) {
            this.calls.push(argumentsReceived);
        }
    };

    /**
     * Antes dos testes, cria uma instância real da aplicação e solicita ao
     * sistema operacional uma porta livre.
     *
     * A porta 0 pede ao sistema operacional que selecione automaticamente
     * uma porta disponível.
     */
    before(async () => {
        const app = createApp({ logger });

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

        assert.equal(
            response.headers.get('x-powered-by'),
            null
        );
    });

    test('uma rota inexistente retorna erro JSON padronizado', async () => {
        const response = await fetch(
            `${baseUrl}/api/inexistente`
        );
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

    test('JSON malformado retorna um erro seguro de cliente', async () => {
        const invalidJson = '{"date": "2026-09-08"';

        const response = await fetch(
            `${baseUrl}/api/health`,
            {
                method: 'POST',
                headers: {
                    'content-type': 'application/json'
                },
                body: invalidJson
            }
        );

        const body = await response.json();

        assert.equal(response.status, 400);
        assert.deepEqual(body, {
            error: {
                code: 'INVALID_JSON',
                message:
                    'O corpo da requisição contém um JSON inválido.'
            }
        });

        /**
         * A resposta pública não deve apresentar a mensagem técnica produzida
         * pelo interpretador de JSON.
         */
        assert.equal(
            JSON.stringify(body).includes('SyntaxError'),
            false
        );
    });

    test('corpo excessivamente grande retorna o código 413', async () => {
        /**
         * O limite configurado em app.js é 100 KB. Este conteúdo ultrapassa
         * deliberadamente o limite para comprovar a proteção.
         */
        const largePayload = JSON.stringify({
            content: 'a'.repeat(101 * 1024)
        });

        const response = await fetch(
            `${baseUrl}/api/health`,
            {
                method: 'POST',
                headers: {
                    'content-type': 'application/json'
                },
                body: largePayload
            }
        );

        const body = await response.json();

        assert.equal(response.status, 413);
        assert.deepEqual(body, {
            error: {
                code: 'PAYLOAD_TOO_LARGE',
                message:
                    'O corpo da requisição ultrapassa o limite permitido.'
            }
        });
    });
});