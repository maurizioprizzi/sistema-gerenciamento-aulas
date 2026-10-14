'use strict';

const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const { describe, test, before, after } = require('node:test');
const { createApp } = require('../src/app');
const { AppError } = require('../src/errors/AppError');
const { InitialSetupController } = require('../src/controllers/InitialSetupController');
const { createInitialSetupRequestGuard } = require('../src/middlewares/initialSetupRequestGuard');
const { createInitialSetupRateLimiter } = require('../src/middlewares/initialSetupRateLimiter');
const {
    createInitialSetupRouter,
    defaultRouterFactory,
    INITIAL_SETUP_ROUTE_PATHS: PATHS,
    INITIAL_SETUP_ROUTE_ERRORS: ERRORS,
} = require('../src/routes/initialSetupRoutes');

function dependencies() {
    const registrations = [];
    const router = {
        get(...args) { registrations.push(['get', ...args]); },
        post(...args) { registrations.push(['post', ...args]); },
    };
    return {
        registrations, router,
        options: {
            controller: { getStatus() {}, createAdmin() {} },
            initialSetupRateLimiter() {},
            initialSetupRequestGuard() {},
            routerFactory: () => router,
        },
    };
}

function assertInvalid(overrides, message) {
    const { options } = dependencies();
    let factoryCalls = 0;
    assert.throws(() => createInitialSetupRouter({ ...options,
        routerFactory() { factoryCalls += 1; return {}; }, ...overrides }),
    { name: 'TypeError', message });
    assert.equal(factoryCalls, 0);
}

describe('configuração do roteador de primeiro cadastro', () => {
    test('rejeita controlador inválido antes de criar roteador', () => {
        for (const controller of [undefined, null, [], {},
            { getStatus() {} }, { createAdmin() {} }]) {
            assertInvalid({ controller }, ERRORS.INVALID_CONTROLLER);
        }
    });

    test('exige limitador de tentativas', () => {
        for (const initialSetupRateLimiter of [undefined, null, {}, 'texto']) {
            assertInvalid({ initialSetupRateLimiter }, ERRORS.INVALID_RATE_LIMITER);
        }
    });

    test('exige proteção de origem e JSON', () => {
        for (const initialSetupRequestGuard of [undefined, null, {}, 'texto']) {
            assertInvalid({ initialSetupRequestGuard }, ERRORS.INVALID_REQUEST_GUARD);
        }
    });

    test('exige fábrica de roteador válida', () => {
        for (const routerFactory of [null, {}, 'texto']) {
            assertInvalid({ routerFactory }, ERRORS.INVALID_ROUTER_FACTORY);
        }
    });

    test('recusa retorno sem as operações do roteador', () => {
        const { options } = dependencies();
        for (const router of [undefined, null, 123, {}, { get() {} }, { post() {} }]) {
            assert.throws(() => createInitialSetupRouter({ ...options, routerFactory: () => router }),
                { name: 'TypeError', message: ERRORS.INVALID_ROUTER });
        }
    });

    test('propaga falha da fábrica sem registrar rotas', () => {
        const { options, registrations } = dependencies();
        const expectedError = new Error('Falha controlada.');
        assert.throws(() => createInitialSetupRouter({ ...options,
            routerFactory() { throw expectedError; } }), error => error === expectedError);
        assert.deepEqual(registrations, []);
    });

    test('registra GET sem contador e POST com limitador antes da proteção e controlador', () => {
        const { options, router, registrations } = dependencies();
        assert.strictEqual(createInitialSetupRouter(options), router);
        assert.deepEqual(registrations, [
            ['get', PATHS.STATUS, options.controller.getStatus],
            ['post', PATHS.CREATE_ADMIN, options.initialSetupRateLimiter,
                options.initialSetupRequestGuard, options.controller.createAdmin],
        ]);
    });

    test('fábrica padrão compõe um Router Express sem abrir recursos', () => {
        const router = defaultRouterFactory();
        assert.equal(typeof router, 'function');
        assert.equal(typeof router.get, 'function');
        assert.equal(typeof router.post, 'function');
    });

    test('mantém caminhos e mensagens imutáveis', () => {
        assert.equal(Object.isFrozen(PATHS), true);
        assert.equal(Object.isFrozen(ERRORS), true);
    });
});

/**
 * API real em porta efêmera, com serviço de cadastro simulado.
 * Nenhuma conta é criada, e nenhum modelo MongoDB é consultado.
 */
describe('roteador de primeiro cadastro no Express', () => {
    const ORIGIN = 'http://localhost:3000';
    const INPUT = Object.freeze({ invitationToken: 'ab'.repeat(32),
        name: 'Ana Silva', email: 'ana@example.com', password: 'senha-ficticia-de-teste' });
    let server;
    let port;
    let statusCalls = 0;
    const creations = [];
    let limitedCreations = 0;

    before(async () => {
        const controller = new InitialSetupController({ initialSetupService: {
            async getStatus() { statusCalls += 1; return { available: true }; },
            async createAdmin(input) {
                creations.push(input);
                if (input.invitationToken !== INPUT.invitationToken) {
                    throw new AppError('Convite inválido.', {
                        statusCode: 403, code: 'INITIAL_SETUP_INVALID_INVITATION',
                    });
                }
                return { created: true };
            },
        } });
        const router = createInitialSetupRouter({
            controller,
            initialSetupRateLimiter: createInitialSetupRateLimiter({ maxAttempts: 100 }),
            initialSetupRequestGuard: createInitialSetupRequestGuard({ appOrigin: ORIGIN }),
        });
        const limitedController = new InitialSetupController({ initialSetupService: {
            async getStatus() { return { available: false }; },
            async createAdmin() { limitedCreations += 1; return { created: true }; },
        } });
        const limitedRouter = createInitialSetupRouter({
            controller: limitedController,
            initialSetupRateLimiter: createInitialSetupRateLimiter({ maxAttempts: 1 }),
            initialSetupRequestGuard: createInitialSetupRequestGuard({ appOrigin: ORIGIN }),
        });
        const app = createApp({ initialSetupRouter: router,
            logger: { error() {} } });
        // Aplicação secundária de teste para exercitar o roteador isoladamente.
        const limitedApp = express();
        limitedApp.use(express.json());
        limitedApp.use('/limited', limitedRouter);
        limitedApp.use((error, _request, response, _next) => {
            response.status(error.statusCode || 500).json({ error: { code: error.code || 'INTERNAL_ERROR' } });
        });
        // A montagem fica antes dos handlers 404 de createApp nesta composição.
        const outerApp = express();
        outerApp.use(limitedApp);
        outerApp.use(app);
        await new Promise((resolve, reject) => {
            server = outerApp.listen(0, '127.0.0.1', resolve);
            server.once('error', reject);
        });
        port = server.address().port;
    });

    after(async () => {
        if (server) await new Promise((resolve, reject) => {
            server.close(error => error ? reject(error) : resolve());
        });
    });

    function request(path, { method = 'GET', body, headers = {} } = {}) {
        return new Promise((resolve, reject) => {
            const text = body === undefined ? '' : JSON.stringify(body);
            const outgoing = http.request({ host: '127.0.0.1', port, path, method, agent: false,
                headers: { ...(text ? { 'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(text) } : {}), ...headers } }, response => {
                let responseText = '';
                response.setEncoding('utf8');
                response.on('data', chunk => { responseText += chunk; });
                response.on('end', () => resolve({ status: response.statusCode,
                    headers: response.headers, body: responseText ? JSON.parse(responseText) : null }));
                response.on('error', reject);
            });
            outgoing.on('error', reject);
            outgoing.end(text);
        });
    }

    test('GET sob /api/setup informa disponibilidade sem sessão ou Origin', async () => {
        const response = await request('/api/setup/status');
        assert.equal(response.status, 200);
        assert.deepEqual(response.body, { data: { available: true } });
        assert.equal(response.headers['cache-control'], 'no-store');
        assert.equal(response.headers['set-cookie'], undefined);
        assert.equal(response.headers.ratelimit, undefined);
        assert.equal(statusCalls, 1);
    });

    test('POST válido chega ao serviço e confirma 201 sem credenciais ou cookie', async () => {
        const response = await request('/api/setup/admin', { method: 'POST', body: INPUT,
            headers: { Origin: ORIGIN } });
        assert.equal(response.status, 201);
        assert.deepEqual(response.body, { data: { created: true } });
        assert.deepEqual(creations.at(-1), INPUT);
        assert.equal(response.headers['set-cookie'], undefined);
        assert.equal(response.headers['cache-control'], 'no-store');
    });

    test('origem inválida é recusada antes do serviço e consome contador', async () => {
        const beforeCalls = creations.length;
        const response = await request('/api/setup/admin', { method: 'POST', body: INPUT,
            headers: { Origin: 'https://outro.example.com' } });
        assert.equal(response.status, 403);
        assert.equal(response.body.error.code, 'INITIAL_SETUP_FORBIDDEN_ORIGIN');
        assert.ok(response.headers.ratelimit);
        assert.equal(creations.length, beforeCalls);
    });

    test('tipo não JSON é recusado antes do serviço', async () => {
        const beforeCalls = creations.length;
        const response = await request('/api/setup/admin', { method: 'POST', body: INPUT,
            headers: { Origin: ORIGIN, 'Content-Type': 'text/plain' } });
        assert.equal(response.status, 415);
        assert.equal(creations.length, beforeCalls);
    });

    test('recusa operacional do serviço mantém o envelope central de erro', async () => {
        const response = await request('/api/setup/admin', { method: 'POST',
            body: { ...INPUT, invitationToken: 'cd'.repeat(32) }, headers: { Origin: ORIGIN } });
        assert.equal(response.status, 403);
        assert.equal(response.body.error.code, 'INITIAL_SETUP_INVALID_INVITATION');
        assert.equal(JSON.stringify(response.body).includes('cd'.repeat(32)), false);
    });

    test('limitador bloqueia antes da proteção de origem e do controlador', async () => {
        const first = await request('/limited/admin', { method: 'POST', body: INPUT,
            headers: { Origin: 'https://outro.example.com' } });
        assert.equal(first.status, 403);
        const second = await request('/limited/admin', { method: 'POST', body: INPUT,
            headers: { Origin: 'https://outro.example.com' } });
        assert.equal(second.status, 429);
        assert.equal(second.body.error.code, 'INITIAL_SETUP_RATE_LIMITED');
        assert.equal(limitedCreations, 0);
        const status = await request('/limited/status');
        assert.equal(status.status, 200);
        assert.deepEqual(status.body, { data: { available: false } });
    });

    test('não expõe recuperação nem rotas fora do prefixo', async () => {
        for (const path of ['/status', '/admin', '/api/setup/recover']) {
            assert.equal((await request(path)).status, 404);
        }
    });
});
