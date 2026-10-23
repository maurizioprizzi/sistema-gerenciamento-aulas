'use strict';

const assert = require('node:assert/strict');
const http = require('node:http');
const { describe, test, before, after, beforeEach } = require('node:test');
const express = require('express');
const { AppError } = require('../src/errors/AppError');
const { CourseController } = require('../src/controllers/CourseController');
const { SESSION_AUTHENTICATION_KEY } = require('../src/services/SessionManager');
const { notFoundHandler, createErrorHandler } = require('../src/middlewares/errorHandler');
const {
    createCourseRouter,
    defaultCourseRouterFactory,
    COURSE_ROUTE_PATHS: PATHS,
    COURSE_ROUTE_ERRORS: ERRORS,
} = require('../src/routes/courseRoutes');

/** Dependências locais para verificar a composição sem abrir uma porta. */
function dependencies() {
    const registrations = [];
    const router = Object.fromEntries(['get', 'post', 'put', 'patch'].map(method => [
        method, (...args) => registrations.push([method, ...args]),
    ]));
    return {
        registrations,
        router,
        options: {
            controller: { list() {}, create() {}, update() {}, deactivate() {} },
            administrativeAuthorizationMiddleware(_request, _response, next) { next(); },
            routerFactory: () => router,
        },
    };
}

describe('configuração do roteador de cursos', () => {
    test('recusa controladores incompletos antes de chamar a fábrica', () => {
        const { options } = dependencies();
        let factoryCalls = 0;
        const valid = options.controller;
        const invalidControllers = [undefined, null, [], {}, ...Object.keys(valid).map(key => (
            { ...valid, [key]: null }
        ))];
        for (const controller of invalidControllers) {
            assert.throws(() => createCourseRouter({ ...options, controller,
                routerFactory() { factoryCalls += 1; return {}; } }),
            { name: 'TypeError', message: ERRORS.INVALID_CONTROLLER });
        }
        assert.equal(factoryCalls, 0);
    });

    test('recusa autorização inválida antes de chamar a fábrica', () => {
        const { options } = dependencies();
        let factoryCalls = 0;
        for (const middleware of [null, {}, 'texto', false]) {
            assert.throws(() => createCourseRouter({ ...options,
                administrativeAuthorizationMiddleware: middleware,
                routerFactory() { factoryCalls += 1; return {}; } }),
            { name: 'TypeError', message: ERRORS.INVALID_ADMINISTRATIVE_AUTHORIZATION });
        }
        assert.equal(factoryCalls, 0);
    });

    test('recusa fábrica inválida e roteadores sem as quatro operações', () => {
        const { options, router } = dependencies();
        for (const routerFactory of [null, {}, 'texto']) {
            assert.throws(() => createCourseRouter({ ...options, routerFactory }),
                { name: 'TypeError', message: ERRORS.INVALID_ROUTER_FACTORY });
        }
        for (const invalidRouter of [undefined, null, [], {}, 1,
            ...Object.keys(router).map(key => ({ ...router, [key]: null }))]) {
            assert.throws(() => createCourseRouter({ ...options,
                routerFactory: () => invalidRouter }),
            { name: 'TypeError', message: ERRORS.INVALID_ROUTER });
        }
    });

    test('propaga a falha da fábrica sem registrar rotas', () => {
        const { options, registrations } = dependencies();
        const failure = new Error('Falha controlada da fábrica.');
        assert.throws(() => createCourseRouter({ ...options,
            routerFactory() { throw failure; } }), error => error === failure);
        assert.deepEqual(registrations, []);
    });

    test('aplica autorização antes de cada uma das quatro operações', () => {
        const { options, router, registrations } = dependencies();
        const guard = options.administrativeAuthorizationMiddleware;
        assert.strictEqual(createCourseRouter(options), router);
        assert.deepEqual(registrations, [
            ['get', PATHS.COLLECTION, guard, options.controller.list],
            ['post', PATHS.COLLECTION, guard, options.controller.create],
            ['put', PATHS.ITEM, guard, options.controller.update],
            ['patch', PATHS.DEACTIVATION, guard, options.controller.deactivate],
        ]);
    });

    test('fábrica padrão cria um roteador Express sem iniciar servidor', () => {
        const router = defaultCourseRouterFactory();
        assert.equal(typeof router, 'function');
        for (const method of ['get', 'post', 'put', 'patch']) {
            assert.equal(typeof router[method], 'function');
        }
    });
});

/**
 * HTTP e autorização reais, com um serviço simulado no lugar do MongoDB.
 * A sessão abaixo existe somente neste teste; a aplicação real usa cookies
 * e seu armazenamento de sessões. Cabeçalhos de teste não autenticam usuários
 * no servidor real.
 */
describe('rotas de cursos com Express e autorização administrativa', () => {
    const ID = '507f1f77bcf86cd799439011';
    const COURSE = Object.freeze({ id: ID, name: 'Ciência de Dados', code: 'CD', active: true });
    const INPUT = Object.freeze({ name: COURSE.name, code: COURSE.code });
    const calls = [];
    const loggedErrors = [];
    let server;
    let port;
    let serviceError;
    let courseExists;

    before(async () => {
        const service = {
            async listCourses(filters) {
                calls.push(['list', filters]);
                if (serviceError) throw serviceError;
                return [COURSE];
            },
            async createCourse(input) {
                calls.push(['create', input]);
                if (serviceError) throw serviceError;
                return { ...COURSE, internalNote: 'não publicar' };
            },
            async updateCourse(id, input) {
                calls.push(['update', id, input]);
                if (serviceError) throw serviceError;
                return courseExists ? { ...COURSE, ...input } : null;
            },
            async deactivateCourse(id) {
                calls.push(['deactivate', id]);
                if (serviceError) throw serviceError;
                return courseExists ? { ...COURSE, active: false } : null;
            },
        };
        const app = express();
        app.use(express.json());
        app.use((request, _response, next) => {
            // Apenas a infraestrutura de teste fornece estas sessões fictícias.
            const role = request.get('X-Test-Session');
            if (role === 'admin' || role === 'other') {
                request.session = { [SESSION_AUTHENTICATION_KEY]: {
                    userId: 'test-user', role: role === 'admin' ? 'admin' : 'other',
                } };
            }
            next();
        });
        const router = createCourseRouter({ controller: new CourseController({ courseService: service }) });
        app.use('/api/courses', router);
        app.use('/alternate/courses', router);
        app.use(notFoundHandler);
        app.use(createErrorHandler({ logger: {
            error(...args) { loggedErrors.push(args); },
        } }));
        await new Promise((resolve, reject) => {
            server = app.listen(0, '127.0.0.1', resolve);
            server.once('error', reject);
        });
        port = server.address().port;
    });

    beforeEach(() => {
        calls.length = 0;
        loggedErrors.length = 0;
        serviceError = undefined;
        courseExists = true;
    });

    after(async () => {
        if (server) await new Promise((resolve, reject) => {
            server.close(error => error ? reject(error) : resolve());
        });
    });

    function request(path, { method = 'GET', session, body } = {}) {
        return new Promise((resolve, reject) => {
            const text = body === undefined ? '' : JSON.stringify(body);
            const outgoing = http.request({ host: '127.0.0.1', port, path, method, agent: false,
                headers: {
                    ...(session ? { 'X-Test-Session': session } : {}),
                    ...(text ? { 'Content-Type': 'application/json',
                        'Content-Length': Buffer.byteLength(text) } : {}),
                } }, response => {
                let content = '';
                response.setEncoding('utf8');
                response.on('data', chunk => { content += chunk; });
                response.on('error', reject);
                response.on('end', () => {
                    try {
                        resolve({ status: response.statusCode, headers: response.headers,
                            body: content ? JSON.parse(content) : null });
                    } catch (error) { reject(error); }
                });
            });
            outgoing.on('error', reject);
            outgoing.end(text);
        });
    }

    for (const [method, suffix] of [
        ['GET', ''], ['POST', ''], ['PUT', `/${ID}`], ['PATCH', `/${ID}/deactivate`],
    ]) {
        test(`${method}: sem sessão recusa antes de acessar o serviço`, async () => {
            const response = await request(`/api/courses${suffix}`, { method, body: INPUT });
            assert.equal(response.status, 401);
            assert.equal(response.body.error.code, 'AUTHENTICATION_REQUIRED');
            assert.deepEqual(calls, []);
        });
        test(`${method}: sessão sem papel administrativo recusa antes do serviço`, async () => {
            const response = await request(`/api/courses${suffix}`, {
                method, body: INPUT, session: 'other',
            });
            assert.equal(response.status, 403);
            assert.equal(response.body.error.code, 'ADMINISTRATIVE_ACCESS_REQUIRED');
            assert.deepEqual(calls, []);
        });
    }

    test('GET lista os cursos e traduz o filtro de situação para booleano', async () => {
        for (const [query, filters] of [['', {}], ['?active=true', { active: true }],
            ['?active=false', { active: false }]]) {
            const response = await request(`/api/courses${query}`, { session: 'admin' });
            assert.equal(response.status, 200);
            assert.equal(response.headers['cache-control'], 'no-store');
            assert.deepEqual(response.body, { data: { courses: [COURSE] } });
            assert.deepEqual(calls.at(-1), ['list', filters]);
        }
    });

    test('GET recusa filtros desconhecidos ou repetidos antes do serviço', async () => {
        for (const query of ['?unknown=1', '?active=1', '?active=true&active=false']) {
            const response = await request(`/api/courses${query}`, { session: 'admin' });
            assert.equal(response.status, 400);
            assert.equal(response.body.error.code, 'INVALID_COURSE_FILTERS');
        }
        assert.deepEqual(calls, []);
    });

    test('POST cadastra com HTTP 201 e devolve somente os campos públicos', async () => {
        const response = await request('/api/courses', { method: 'POST', session: 'admin', body: INPUT });
        assert.equal(response.status, 201);
        assert.deepEqual(response.body, { data: { course: COURSE } });
        assert.deepEqual(calls, [['create', INPUT]]);
        assert.equal(response.headers['cache-control'], 'no-store');
    });

    test('PUT encaminha o identificador e os novos dados do curso', async () => {
        const input = { name: 'Análise de Dados', code: 'AD' };
        const response = await request(`/api/courses/${ID}`, {
            method: 'PUT', session: 'admin', body: input,
        });
        assert.equal(response.status, 200);
        assert.deepEqual(response.body, { data: { course: { ...COURSE, ...input } } });
        assert.deepEqual(calls, [['update', ID, input]]);
    });

    test('PATCH desativa preservando a identidade e não repassa alterações do corpo', async () => {
        const response = await request(`/api/courses/${ID}/deactivate`, {
            method: 'PATCH', session: 'admin', body: { name: 'Ignorar', active: true },
        });
        assert.equal(response.status, 200);
        assert.deepEqual(response.body, { data: { course: { ...COURSE, active: false } } });
        assert.deepEqual(calls, [['deactivate', ID]]);
    });

    test('edição e desativação de curso ausente retornam 404', async () => {
        courseExists = false;
        for (const [method, suffix] of [['PUT', ''], ['PATCH', '/deactivate']]) {
            const response = await request(`/api/courses/${ID}${suffix}`, {
                method, session: 'admin', body: INPUT,
            });
            assert.equal(response.status, 404);
            assert.equal(response.body.error.code, 'COURSE_NOT_FOUND');
        }
    });

    test('conflito de sigla mantém o envelope público de erro', async () => {
        serviceError = new AppError('Esta sigla já está cadastrada.', {
            statusCode: 409, code: 'COURSE_CODE_CONFLICT',
        });
        const response = await request('/api/courses', { method: 'POST', session: 'admin', body: INPUT });
        assert.equal(response.status, 409);
        assert.equal(response.body.error.code, 'COURSE_CODE_CONFLICT');
        assert.equal(loggedErrors.length, 0);
    });

    test('falha inesperada é registrada e seus detalhes não chegam ao cliente', async () => {
        serviceError = new Error('Detalhe interno simulado.');
        const response = await request('/api/courses', { session: 'admin' });
        assert.equal(response.status, 500);
        assert.equal(response.body.error.code, 'INTERNAL_ERROR');
        assert.equal(JSON.stringify(response.body).includes(serviceError.message), false);
        assert.equal(loggedErrors.length, 1);
    });

    test('outro prefixo mantém a autorização obrigatória', async () => {
        const denied = await request('/alternate/courses');
        assert.equal(denied.status, 401);
        assert.deepEqual(calls, []);
        const allowed = await request('/alternate/courses', { session: 'admin' });
        assert.equal(allowed.status, 200);
        assert.deepEqual(calls, [['list', {}]]);
    });

    test('não oferece exclusão definitiva nem caminhos fora do prefixo', async () => {
        for (const [method, endpoint] of [
            ['DELETE', `/api/courses/${ID}`], ['GET', '/courses'],
            ['PATCH', `/api/courses/${ID}`], ['POST', `/api/courses/${ID}/deactivate`],
        ]) {
            const response = await request(endpoint, { method, session: 'admin' });
            assert.equal(response.status, 404);
            assert.equal(response.body.error.code, 'ROUTE_NOT_FOUND');
        }
        assert.deepEqual(calls, []);
    });
});
