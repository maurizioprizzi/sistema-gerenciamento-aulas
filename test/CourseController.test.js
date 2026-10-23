'use strict';

const assert = require('node:assert/strict');
const { describe, test } = require('node:test');
const { AppError } = require('../src/errors/AppError');
const {
    CourseController,
    COURSE_CONTROLLER_CODES,
    COURSE_CONTROLLER_ERRORS,
} = require('../src/controllers/CourseController');

const COURSE_ID = '507f1f77bcf86cd799439011';
const INPUT = Object.freeze({ name: 'Ciência de Dados', code: 'CD' });

function createCourse(overrides = {}) {
    return { id: COURSE_ID, ...INPUT, active: true, ...overrides };
}

/** Serviço e resposta controlados: nenhum teste abre HTTP ou conecta ao banco. */
function context(overrides = {}) {
    const calls = {
        createCourse: [], listCourses: [], updateCourse: [], deactivateCourse: [],
        headers: [], statuses: [], bodies: [], errors: [],
    };
    const defaults = {
        createCourse: () => createCourse(),
        listCourses: () => [createCourse()],
        updateCourse: () => createCourse(),
        deactivateCourse: () => createCourse({ active: false }),
    };
    const service = {};
    for (const [method, fallback] of Object.entries(defaults)) {
        service[method] = async (...args) => {
            calls[method].push(args);
            return (overrides[method] || fallback)(...args);
        };
    }
    const controller = new CourseController({ courseService: service });
    const response = {
        set(name, value) { calls.headers.push({ name, value }); return this; },
        status(code) { calls.statuses.push(code); return this; },
        json(body) { calls.bodies.push(body); return this; },
    };
    return { controller, service, response, calls, next: (error) => calls.errors.push(error) };
}

function assertNoResponse(calls) {
    assert.deepEqual(calls.statuses, []);
    assert.deepEqual(calls.bodies, []);
}

function assertNoServiceCalls(calls) {
    for (const method of ['createCourse', 'listCourses', 'updateCourse', 'deactivateCourse']) {
        assert.deepEqual(calls[method], []);
    }
}

function assertNoCache(calls) {
    assert.deepEqual(calls.headers, [{ name: 'Cache-Control', value: 'no-store' }]);
}

const OPERATIONS = [
    { handler: 'create', serviceMethod: 'createCourse', result: () => createCourse() },
    { handler: 'list', serviceMethod: 'listCourses', result: () => [createCourse()] },
    { handler: 'update', serviceMethod: 'updateCourse', result: () => createCourse() },
    { handler: 'deactivate', serviceMethod: 'deactivateCourse', result: () => createCourse({ active: false }) },
];

describe('configuração de CourseController', () => {
    test('exige as quatro operações do serviço', () => {
        const { service } = context();
        for (const courseService of [
            undefined, null, [], 'serviço', {},
            ...Object.keys(service).map((method) => ({ ...service, [method]: false })),
        ]) {
            assert.throws(() => new CourseController({ courseService }), {
                name: 'TypeError', message: COURSE_CONTROLLER_ERRORS.INVALID_SERVICE,
            });
        }
    });

    test('a construção mantém a instância imutável e não executa operações', () => {
        const { controller, calls } = context();
        assert.ok(Object.isFrozen(controller));
        assertNoServiceCalls(calls);
        assertNoResponse(calls);
        assert.deepEqual(calls.headers, []);
        assert.deepEqual(calls.errors, []);
    });
});

describe('consulta HTTP de cursos', () => {
    test('lista todas as situações quando não recebe filtro', async () => {
        const { controller, response, next, calls } = context({
            listCourses: () => [createCourse(), createCourse({ id: '507f1f77bcf86cd799439012', active: false })],
        });
        const { list } = controller;
        await list({ query: {} }, response, next);
        assert.deepEqual(calls.listCourses, [[{}]]);
        assert.deepEqual(calls.statuses, [200]);
        assert.equal(calls.bodies[0].data.courses.length, 2);
        assert.equal(calls.bodies[0].data.courses[1].active, false);
        assert.ok(Object.isFrozen(calls.bodies[0].data.courses));
        assertNoCache(calls);
        assert.deepEqual(calls.errors, []);
    });

    for (const [text, expected] of [['true', true], ['false', false]]) {
        test(`traduz active=${text} para booleano antes do serviço`, async () => {
            const { controller, response, next, calls } = context();
            await controller.list({ query: Object.assign(Object.create(null), { active: text }) }, response, next);
            assert.deepEqual(calls.listCourses, [[{ active: expected }]]);
            assert.ok(Object.isFrozen(calls.listCourses[0][0]));
            assert.deepEqual(calls.statuses, [200]);
            assert.deepEqual(calls.errors, []);
        });
    }

    test('trata requisição ou query ausente como consulta sem filtro', async () => {
        for (const request of [undefined, {}, { query: undefined }]) {
            const { controller, response, next, calls } = context();
            await controller.list(request, response, next);
            assert.deepEqual(calls.listCourses, [[{}]]);
            assert.deepEqual(calls.errors, []);
        }
    });

    test('recusa filtros desconhecidos, múltiplos valores e coerções ambíguas antes do serviço', async () => {
        for (const query of [
            null, [], 'active=true', { name: 'Curso' }, { active: undefined },
            { active: '' }, { active: true }, { active: 0 }, { active: 'TRUE' },
            { active: ' true ' }, { active: ['true', 'false'] },
            { active: { $ne: 'false' } }, { [Symbol('extra')]: 'x' },
        ]) {
            const { controller, response, next, calls } = context();
            await controller.list({ query }, response, next);
            assertNoServiceCalls(calls);
            assertNoResponse(calls);
            assert.equal(calls.errors.length, 1);
            assert.ok(calls.errors[0] instanceof AppError);
            assert.equal(calls.errors[0].statusCode, 400);
            assert.equal(calls.errors[0].code, COURSE_CONTROLLER_CODES.INVALID_FILTERS);
            assertNoCache(calls);
        }
    });

    test('retorna lista vazia dentro do envelope normal', async () => {
        const { controller, response, next, calls } = context({ listCourses: () => [] });
        await controller.list({}, response, next);
        assert.deepEqual(calls.statuses, [200]);
        assert.deepEqual(calls.bodies, [{ data: { courses: [] } }]);
        assert.deepEqual(calls.errors, []);
    });

    test('não responde sucesso quando a lista ou um de seus itens é inválido', async () => {
        for (const result of [undefined, null, {}, [createCourse(), { id: COURSE_ID }]]) {
            const { controller, response, next, calls } = context({ listCourses: () => result });
            await controller.list({}, response, next);
            assertNoResponse(calls);
            assert.equal(calls.errors.length, 1);
            assert.ok(calls.errors[0] instanceof TypeError);
        }
    });
});

describe('criação HTTP do curso', () => {
    test('encaminha o corpo completo para validação e responde 201 com campos públicos', async () => {
        const input = Object.freeze({ name: ' Ciência de Dados ', code: 'cd', extra: 'deve ser validado pelo serviço' });
        const { controller, response, next, calls } = context({
            createCourse: () => createCourse({ createdAt: 'interno', passwordHash: 'não enviar' }),
        });
        const { create } = controller;
        await create({ body: input }, response, next);
        assert.equal(calls.createCourse[0][0], input);
        assert.deepEqual(calls.statuses, [201]);
        assert.deepEqual(calls.bodies, [{ data: { course: createCourse() } }]);
        assert.ok(Object.isFrozen(calls.bodies[0].data.course));
        assertNoCache(calls);
        assert.deepEqual(calls.errors, []);
    });

    test('não procura dados do cadastro na query ou no caminho', async () => {
        const { controller, response, next, calls } = context();
        await controller.create({ params: INPUT, query: INPUT, body: INPUT }, response, next);
        assert.deepEqual(calls.createCourse, [[INPUT]]);
    });

    test('não transforma resultado ausente ou curso inativo em criação confirmada', async () => {
        for (const result of [null, undefined, {}, createCourse({ active: false })]) {
            const { controller, response, next, calls } = context({ createCourse: () => result });
            await controller.create({ body: INPUT }, response, next);
            assertNoResponse(calls);
            assert.ok(calls.errors[0] instanceof TypeError);
        }
    });
});

describe('edição e desativação HTTP do curso', () => {
    test('edita usando somente o id do caminho e encaminha o corpo original', async () => {
        const input = Object.freeze({ ...INPUT, active: true });
        const { controller, response, next, calls } = context({
            updateCourse: () => createCourse({ active: false }),
        });
        const { update } = controller;
        await update({ params: { id: COURSE_ID }, query: { id: 'outro' }, body: input }, response, next);
        assert.deepEqual(calls.updateCourse, [[COURSE_ID, input]]);
        assert.equal(calls.updateCourse[0][1], input);
        assert.deepEqual(calls.statuses, [200]);
        assert.deepEqual(calls.bodies, [{ data: { course: createCourse({ active: false }) } }]);
        assertNoCache(calls);
        assert.deepEqual(calls.errors, []);
    });

    test('desativa usando somente o id do caminho, sem encaminhar alterações no corpo', async () => {
        const { controller, response, next, calls } = context();
        const { deactivate } = controller;
        await deactivate({ params: { id: COURSE_ID }, query: { active: 'true' }, body: { active: true, ...INPUT } }, response, next);
        assert.deepEqual(calls.deactivateCourse, [[COURSE_ID]]);
        assert.deepEqual(calls.statuses, [200]);
        assert.deepEqual(calls.bodies, [{ data: { course: createCourse({ active: false }) } }]);
        assertNoCache(calls);
        assert.deepEqual(calls.errors, []);
    });

    for (const { handler, serviceMethod } of OPERATIONS.filter(({ handler }) => ['update', 'deactivate'].includes(handler))) {
        test(`${handler}: ausência do curso produz 404 sem corpo de sucesso`, async () => {
            const { controller, response, next, calls } = context({ [serviceMethod]: () => null });
            await controller[handler]({ params: { id: COURSE_ID }, body: INPUT }, response, next);
            assertNoResponse(calls);
            assert.equal(calls.errors.length, 1);
            const error = calls.errors[0];
            assert.ok(error instanceof AppError);
            assert.equal(error.code, COURSE_CONTROLLER_CODES.NOT_FOUND);
            assert.equal(error.statusCode, 404);
            assert.equal(error.message, COURSE_CONTROLLER_ERRORS.NOT_FOUND);
            assert.equal(error.details, null);
        });
    }

    test('recusa desativação que devolve um curso ainda ativo', async () => {
        const { controller, response, next, calls } = context({ deactivateCourse: () => createCourse() });
        await controller.deactivate({ params: { id: COURSE_ID } }, response, next);
        assertNoResponse(calls);
        assert.equal(calls.errors.length, 1);
        assert.ok(calls.errors[0] instanceof TypeError);
    });

    test('não trata resposta ausente da edição como curso inexistente', async () => {
        const { controller, response, next, calls } = context({ updateCourse: () => undefined });
        await controller.update({ params: { id: COURSE_ID }, body: INPUT }, response, next);
        assertNoResponse(calls);
        assert.ok(calls.errors[0] instanceof TypeError);
    });

    test('requisição ausente é encaminhada para validação do serviço sem acesso indevido a propriedades', async () => {
        const failure = new AppError('Dados inválidos.', { statusCode: 400, code: 'INVALID_COURSE_DATA' });
        for (const { handler, serviceMethod } of OPERATIONS.filter(({ handler }) => handler !== 'list')) {
            const { controller, response, next, calls } = context({ [serviceMethod]: () => { throw failure; } });
            await controller[handler](undefined, response, next);
            assert.ok(calls[serviceMethod][0].every((argument) => argument === undefined));
            assert.deepEqual(calls.errors, [failure]);
            assertNoResponse(calls);
        }
    });
});

describe('contrato público do controlador de cursos', () => {
    test('normaliza a identidade e produz uma cópia imutável dos campos públicos', () => {
        const input = createCourse({ id: COURSE_ID.toUpperCase(), createdAt: 'interno' });
        const output = CourseController.createPublicCourse(input);
        input.name = 'Alteração posterior';
        assert.deepEqual(output, createCourse());
        assert.ok(Object.isFrozen(output));
        assert.equal(Object.hasOwn(output, 'createdAt'), false);
    });

    test('recusa campos públicos ausentes ou com tipos inválidos', () => {
        for (const result of [
            undefined, null, [], {}, createCourse({ id: 'inválido' }),
            createCourse({ id: 42 }), createCourse({ name: ' ' }),
            createCourse({ code: null }), createCourse({ active: 'false' }),
        ]) {
            assert.throws(() => CourseController.createPublicCourse(result), {
                name: 'TypeError', message: COURSE_CONTROLLER_ERRORS.INVALID_RESPONSE,
            });
        }
    });
});

describe('espera das operações e encaminhamento de erros', () => {
    for (const { handler, serviceMethod, result } of OPERATIONS) {
        test(`${handler}: aguarda o serviço antes de escrever a resposta`, async () => {
            let resolveService;
            const pendingService = new Promise((resolve) => { resolveService = resolve; });
            const { controller, response, next, calls } = context({ [serviceMethod]: () => pendingService });
            const pendingHandler = controller[handler]({ params: { id: COURSE_ID }, body: INPUT }, response, next);
            await Promise.resolve();
            assertNoResponse(calls);
            resolveService(result());
            await pendingHandler;
            assert.equal(calls.statuses.length, 1);
            assert.equal(calls.bodies.length, 1);
            assert.deepEqual(calls.errors, []);
        });

        test(`${handler}: preserva recusas operacionais e falhas inesperadas`, async () => {
            for (const failure of [
                new AppError('Recusa pública.', { statusCode: 409, code: 'COURSE_CODE_CONFLICT' }),
                new Error('Detalhes privados da infraestrutura.'),
            ]) {
                const { controller, response, next, calls } = context({ [serviceMethod]: () => { throw failure; } });
                await controller[handler]({ params: { id: COURSE_ID }, body: INPUT }, response, next);
                assert.deepEqual(calls.errors, [failure]);
                assertNoResponse(calls);
                assertNoCache(calls);
            }
        });
    }

    test('falha ao definir o cabeçalho interrompe antes do serviço', async () => {
        const failure = new Error('Falha de escrita na resposta.');
        for (const { handler } of OPERATIONS) {
            const { controller, response, next, calls } = context();
            response.set = () => { throw failure; };
            await controller[handler]({ params: { id: COURSE_ID }, body: INPUT }, response, next);
            assertNoServiceCalls(calls);
            assertNoResponse(calls);
            assert.deepEqual(calls.errors, [failure]);
        }
    });
});
