'use strict';

const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const { describe, test, before, after } = require('node:test');
const {
    createInitialSetupRequestGuard,
    INITIAL_SETUP_REQUEST_GUARD_CODES: CODES,
    INITIAL_SETUP_REQUEST_GUARD_ERRORS: ERRORS,
} = require('../src/middlewares/initialSetupRequestGuard');

const ORIGIN = 'http://localhost:3000';

/**
 * O mock observa decisões do middleware sem abrir portas.
 * A seção HTTP abaixo verifica o request.is real do Express.
 */
function invoke({ origin = ORIGIN, json = true, appOrigin = ORIGIN,
    headers = {}, typeError, headerError } = {}) {
    const calls = { next: [], headers: [], types: [] };
    const middleware = createInitialSetupRequestGuard({ appOrigin });
    middleware({
        headers: { ...headers, origin },
        is(type) {
            calls.types.push(type);
            if (typeError) throw typeError;
            return json;
        },
    }, {
        set(name, value) {
            if (headerError) throw headerError;
            calls.headers.push({ name, value });
        },
    }, error => calls.next.push(error));
    return calls;
}

function assertRefusal(calls, code, statusCode) {
    assert.equal(calls.next.length, 1);
    assert.equal(calls.next[0].name, 'AppError');
    assert.equal(calls.next[0].code, code);
    assert.equal(calls.next[0].statusCode, statusCode);
    assert.equal(calls.next[0].isOperational, true);
    assert.deepEqual(calls.headers, [{ name: 'Cache-Control', value: 'no-store' }]);
}

describe('configuração da proteção de primeiro cadastro', () => {
    test('exige origem configurada HTTP ou HTTPS', () => {
        for (const appOrigin of [undefined, null, 123, '', '   ', 'texto',
            '/relativo', 'ftp://example.com', 'file:///arquivo']) {
            assert.throws(() => createInitialSetupRequestGuard({ appOrigin }), {
                name: 'TypeError', message: ERRORS.INVALID_APP_ORIGIN,
            });
        }
    });

    test('recusa caminho, credenciais, consulta e fragmento na configuração', () => {
        for (const appOrigin of [
            `${ORIGIN}/api`, `${ORIGIN}/?x=1`, `${ORIGIN}/#x`,
            'http://usuario:senha@localhost:3000',
        ]) {
            assert.throws(() => createInitialSetupRequestGuard({ appOrigin }), {
                name: 'TypeError', message: ERRORS.INVALID_APP_ORIGIN,
            });
        }
    });

    test('normaliza barra final e espaços externos da configuração', () => {
        assert.deepEqual(invoke({ appOrigin: `  ${ORIGIN}/  ` }).next, [undefined]);
    });

    test('normaliza nome do host e porta padrão da configuração', () => {
        assert.deepEqual(invoke({ appOrigin: 'https://EXAMPLE.COM:443/',
            origin: 'https://example.com' }).next, [undefined]);
    });

    test('mantém códigos e mensagens imutáveis', () => {
        assert.equal(Object.isFrozen(CODES), true);
        assert.equal(Object.isFrozen(ERRORS), true);
    });
});

describe('decisões da proteção do primeiro cadastro', () => {
    test('permite JSON com origem exatamente correspondente', () => {
        const calls = invoke();
        assert.deepEqual(calls.next, [undefined]);
        assert.deepEqual(calls.types, ['application/json']);
        assert.deepEqual(calls.headers, [{ name: 'Cache-Control', value: 'no-store' }]);
    });

    test('recusa origem ausente, opaca, múltipla ou de tipo incorreto', () => {
        // Undefined do helper aplicaria o padrão; a ausência real é testada no HTTP.
        for (const origin of [null, '', 'null', 123, [ORIGIN], `${ORIGIN}, ${ORIGIN}`]) {
            const calls = invoke({ origin });
            assertRefusal(calls, CODES.FORBIDDEN_ORIGIN, 403);
            assert.deepEqual(calls.types, []);
        }
    });

    test('recusa variações de protocolo, host, porta e caminho na origem recebida', () => {
        for (const origin of ['https://localhost:3000', 'http://127.0.0.1:3000',
            'http://localhost:3001', `${ORIGIN}/`, `${ORIGIN}/api`,
            'http://localhost:3000.outro.example.com', ` ${ORIGIN}`]) {
            const calls = invoke({ origin });
            assertRefusal(calls, CODES.FORBIDDEN_ORIGIN, 403);
            assert.deepEqual(calls.types, []);
        }
    });

    test('Host e cabeçalhos de proxy não autorizam origem diferente', () => {
        const calls = invoke({ origin: 'http://outro.example.com', headers: {
            host: 'localhost:3000', 'x-forwarded-host': 'localhost:3000',
            'x-forwarded-proto': 'http',
        } });
        assertRefusal(calls, CODES.FORBIDDEN_ORIGIN, 403);
    });

    test('origem válida com tipo não JSON é recusada', () => {
        for (const json of [false, null]) {
            assertRefusal(invoke({ json }), CODES.UNSUPPORTED_MEDIA_TYPE, 415);
        }
    });

    test('recusas não repetem a origem recebida na mensagem', () => {
        const origin = 'https://origem-privada.example.com';
        const calls = invoke({ origin });
        assert.equal(calls.next[0].message, ERRORS.FORBIDDEN_ORIGIN);
        assert.equal(calls.next[0].message.includes(origin), false);
    });

    test('propaga falha inesperada ao verificar o tipo de conteúdo', () => {
        const typeError = new Error('Falha controlada.');
        assert.deepEqual(invoke({ typeError }).next, [typeError]);
    });

    test('propaga falha ao definir cabeçalho sem continuar validações', () => {
        const headerError = new Error('Cabeçalho indisponível.');
        const calls = invoke({ headerError });
        assert.deepEqual(calls.next, [headerError]);
        assert.deepEqual(calls.types, []);
    });
});

describe('proteção de primeiro cadastro com Express real', () => {
    let server;
    let port;
    let handlerCalls = 0;

    before(async () => {
        const app = express();
        // A rota de teste não monta a API real nem chama cadastro/persistência.
        app.post('/setup', createInitialSetupRequestGuard({ appOrigin: ORIGIN }),
            (_request, response) => {
                handlerCalls += 1;
                response.status(204).end();
            });
        app.use((error, _request, response, _next) => {
            response.status(error.statusCode || 500).json({ code: error.code || 'INTERNAL_ERROR' });
        });
        await new Promise((resolve, reject) => {
            server = app.listen(0, '127.0.0.1', resolve);
            server.once('error', reject);
        });
        port = server.address().port;
    });

    after(async () => {
        if (server) await new Promise((resolve, reject) => {
            server.close(error => error ? reject(error) : resolve());
        });
    });

    function post(headers) {
        return new Promise((resolve, reject) => {
            const body = '{}';
            const request = http.request({
                host: '127.0.0.1', port, path: '/setup', method: 'POST', agent: false,
                headers: { 'Content-Length': Buffer.byteLength(body), ...headers },
            }, response => {
                let text = '';
                response.setEncoding('utf8');
                response.on('data', chunk => { text += chunk; });
                response.on('end', () => resolve({ status: response.statusCode,
                    headers: response.headers, body: text ? JSON.parse(text) : null }));
                response.on('error', reject);
            });
            request.on('error', reject);
            request.end(body);
        });
    }

    test('aceita application/json com charset na origem correta', async () => {
        const beforeCalls = handlerCalls;
        const response = await post({ Origin: ORIGIN, 'Content-Type': 'application/json; charset=utf-8' });
        assert.equal(response.status, 204);
        assert.equal(response.headers['cache-control'], 'no-store');
        assert.equal(handlerCalls, beforeCalls + 1);
    });

    test('recusa POST sem Origin antes do handler', async () => {
        const beforeCalls = handlerCalls;
        const response = await post({ 'Content-Type': 'application/json' });
        assert.equal(response.status, 403);
        assert.equal(response.body.code, CODES.FORBIDDEN_ORIGIN);
        assert.equal(response.headers['cache-control'], 'no-store');
        assert.equal(handlerCalls, beforeCalls);
    });

    test('recusa JSON de outro site antes do handler', async () => {
        const beforeCalls = handlerCalls;
        const response = await post({ Origin: 'https://outro.example.com', 'Content-Type': 'application/json' });
        assert.equal(response.status, 403);
        assert.equal(handlerCalls, beforeCalls);
    });

    test('recusa formulário, texto, tipo ausente e JSON de outro subtipo', async () => {
        for (const contentType of [undefined, 'text/plain', 'application/x-www-form-urlencoded', 'application/problem+json']) {
            const beforeCalls = handlerCalls;
            const headers = { Origin: ORIGIN };
            if (contentType) headers['Content-Type'] = contentType;
            const response = await post(headers);
            assert.equal(response.status, 415);
            assert.equal(response.body.code, CODES.UNSUPPORTED_MEDIA_TYPE);
            assert.equal(handlerCalls, beforeCalls);
        }
    });
});
