'use strict';

const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const { rateLimit } = require('express-rate-limit');
const { describe, test, before, after } = require('node:test');
const {
    createInitialSetupRateLimiter,
    INITIAL_SETUP_RATE_LIMIT_CODES: CODES,
    INITIAL_SETUP_RATE_LIMIT_ERRORS: ERRORS,
    DEFAULT_INITIAL_SETUP_RATE_LIMIT_WINDOW_MS,
    DEFAULT_INITIAL_SETUP_RATE_LIMIT_MAX_ATTEMPTS,
    MIN_INITIAL_SETUP_RATE_LIMIT_WINDOW_MS,
    MAX_INITIAL_SETUP_RATE_LIMIT_WINDOW_MS,
    MIN_INITIAL_SETUP_RATE_LIMIT_MAX_ATTEMPTS,
    MAX_INITIAL_SETUP_RATE_LIMIT_MAX_ATTEMPTS,
} = require('../src/middlewares/initialSetupRateLimiter');

function capture(options = {}) {
    let configuration;
    let calls = 0;
    const middleware = () => {};
    const result = createInitialSetupRateLimiter({
        ...options,
        rateLimitFactory(config) {
            calls += 1;
            configuration = config;
            return middleware;
        },
    });
    return { configuration, calls, middleware, result };
}

describe('configuração do limitador de primeiro cadastro', () => {
    test('usa cinco tentativas em quinze minutos e retorna o middleware', () => {
        const ctx = capture();
        assert.equal(ctx.calls, 1);
        assert.strictEqual(ctx.result, ctx.middleware);
        assert.equal(ctx.configuration.windowMs, DEFAULT_INITIAL_SETUP_RATE_LIMIT_WINDOW_MS);
        assert.equal(ctx.configuration.limit, DEFAULT_INITIAL_SETUP_RATE_LIMIT_MAX_ATTEMPTS);
        assert.equal(ctx.configuration.windowMs, 900000);
        assert.equal(ctx.configuration.limit, 5);
    });

    test('conta sucessos e falhas e recusa falha do armazenamento', () => {
        const { configuration } = capture();
        assert.equal(configuration.skipSuccessfulRequests, false);
        assert.equal(configuration.skipFailedRequests, false);
        assert.equal(configuration.passOnStoreError, false);
        assert.equal(configuration.standardHeaders, 'draft-8');
        assert.equal(configuration.legacyHeaders, false);
        assert.equal(Object.hasOwn(configuration, 'keyGenerator'), false);
        assert.equal(Object.hasOwn(configuration, 'store'), false);
    });

    test('aceita os limites válidos de configuração', () => {
        for (const windowMs of [MIN_INITIAL_SETUP_RATE_LIMIT_WINDOW_MS,
            MAX_INITIAL_SETUP_RATE_LIMIT_WINDOW_MS]) {
            for (const maxAttempts of [MIN_INITIAL_SETUP_RATE_LIMIT_MAX_ATTEMPTS,
                MAX_INITIAL_SETUP_RATE_LIMIT_MAX_ATTEMPTS]) {
                const { configuration } = capture({ windowMs, maxAttempts });
                assert.equal(configuration.windowMs, windowMs);
                assert.equal(configuration.limit, maxAttempts);
            }
        }
    });

    test('recusa janelas inválidas antes de chamar a fábrica', () => {
        for (const windowMs of [null, '1000', NaN, Infinity, 999, 86400001, 1000.5]) {
            assert.throws(() => createInitialSetupRateLimiter({ windowMs,
                rateLimitFactory() { assert.fail('Fábrica não deve ser chamada.'); } }),
            { name: 'RangeError', message: ERRORS.INVALID_WINDOW });
        }
    });

    test('recusa quantidades inválidas antes de chamar a fábrica', () => {
        for (const maxAttempts of [null, '5', NaN, Infinity, 0, 101, 1.5]) {
            assert.throws(() => createInitialSetupRateLimiter({ maxAttempts,
                rateLimitFactory() { assert.fail('Fábrica não deve ser chamada.'); } }),
            { name: 'RangeError', message: ERRORS.INVALID_MAX_ATTEMPTS });
        }
    });

    test('recusa fábrica que não é função', () => {
        for (const rateLimitFactory of [null, {}, 123, 'texto']) {
            assert.throws(() => createInitialSetupRateLimiter({ rateLimitFactory }),
                { name: 'TypeError', message: ERRORS.INVALID_FACTORY });
        }
    });

    test('recusa retorno que não é middleware', () => {
        for (const value of [null, undefined, {}, 123]) {
            assert.throws(() => createInitialSetupRateLimiter({ rateLimitFactory: () => value }),
                { name: 'TypeError', message: ERRORS.INVALID_MIDDLEWARE });
        }
    });

    test('propaga falha da fábrica', () => {
        const expectedError = new Error('Falha controlada.');
        assert.throws(() => createInitialSetupRateLimiter({
            rateLimitFactory() { throw expectedError; },
        }), error => error === expectedError);
    });

    test('handler encaminha recusa operacional 429 sem escrever corpo', () => {
        const { configuration } = capture();
        const calls = { headers: [], errors: [] };
        configuration.handler({}, {
            set(name, value) { calls.headers.push({ name, value }); },
            status() { assert.fail('Resposta pertence ao tratamento central.'); },
        }, error => calls.errors.push(error));
        assert.deepEqual(calls.headers, [{ name: 'Cache-Control', value: 'no-store' }]);
        assert.equal(calls.errors.length, 1);
        assert.equal(calls.errors[0].code, CODES.TOO_MANY_ATTEMPTS);
        assert.equal(calls.errors[0].statusCode, 429);
        assert.equal(calls.errors[0].message, ERRORS.TOO_MANY_ATTEMPTS);
        assert.equal(calls.errors[0].isOperational, true);
        assert.equal(calls.errors[0].details, null);
    });

    test('mantém códigos e mensagens imutáveis', () => {
        assert.equal(Object.isFrozen(CODES), true);
        assert.equal(Object.isFrozen(ERRORS), true);
    });
});

describe('limitação com Express e biblioteca reais', () => {
    let server;
    let port;
    const calls = { success: 0, refusal: 0, independent: 0, brokenStore: 0 };
    const storeFailure = new Error('Contador indisponível.');

    before(async () => {
        const app = express();
        app.post('/success', createInitialSetupRateLimiter({ maxAttempts: 1 }),
            (_request, response) => { calls.success += 1; response.status(204).end(); });
        app.post('/refusal', createInitialSetupRateLimiter({ maxAttempts: 1 }),
            (_request, response) => { calls.refusal += 1; response.status(403).json({ code: 'REFUSED' }); });
        app.post('/independent', createInitialSetupRateLimiter({ maxAttempts: 1 }),
            (_request, response) => { calls.independent += 1; response.status(204).end(); });

        // Armazenamento controlado para provocar falha dentro da biblioteca.
        const brokenStore = {
            init() {},
            async increment() { throw storeFailure; },
            async decrement() {},
            async resetKey() {},
        };
        const brokenLimiter = createInitialSetupRateLimiter({
            rateLimitFactory: options => rateLimit({ ...options, store: brokenStore }),
        });
        app.post('/broken-store', brokenLimiter,
            (_request, response) => { calls.brokenStore += 1; response.status(204).end(); });
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

    function post(path) {
        return new Promise((resolve, reject) => {
            const request = http.request({ host: '127.0.0.1', port, path,
                method: 'POST', agent: false }, response => {
                let text = '';
                response.setEncoding('utf8');
                response.on('data', chunk => { text += chunk; });
                response.on('end', () => resolve({ status: response.statusCode,
                    headers: response.headers, body: text ? JSON.parse(text) : null }));
                response.on('error', reject);
            });
            request.on('error', reject);
            request.end();
        });
    }

    test('sucesso também conta e a tentativa excedente não chega ao handler', async () => {
        assert.equal((await post('/success')).status, 204);
        const blocked = await post('/success');
        assert.equal(blocked.status, 429);
        assert.equal(blocked.body.code, CODES.TOO_MANY_ATTEMPTS);
        assert.equal(blocked.headers['cache-control'], 'no-store');
        assert.ok(blocked.headers['retry-after']);
        assert.ok(blocked.headers.ratelimit);
        assert.equal(blocked.headers['x-ratelimit-limit'], undefined);
        assert.equal(calls.success, 1);
    });

    test('recusa também conta e a tentativa seguinte é limitada', async () => {
        assert.equal((await post('/refusal')).status, 403);
        assert.equal((await post('/refusal')).status, 429);
        assert.equal(calls.refusal, 1);
    });

    test('outra instância do limitador possui contador independente', async () => {
        assert.equal((await post('/independent')).status, 204);
        assert.equal((await post('/independent')).status, 429);
        assert.equal(calls.independent, 1);
        assert.equal(calls.success, 1);
    });

    test('falha do armazenamento impede execução do handler', async () => {
        const blocked = await post('/broken-store');
        assert.equal(blocked.status, 500);
        assert.equal(blocked.body.code, 'INTERNAL_ERROR');
        assert.equal(calls.brokenStore, 0);
    });
});
