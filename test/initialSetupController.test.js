'use strict';

const assert = require('node:assert/strict');
const { describe, test } = require('node:test');
const { AppError } = require('../src/errors/AppError');
const {
    InitialSetupController,
    INITIAL_SETUP_CONTROLLER_ERRORS: ERRORS,
} = require('../src/controllers/InitialSetupController');

/**
 * Resposta e serviço controlados: nenhum teste abre HTTP ou consulta banco.
 */
function context({ status = { available: true }, creation = { created: true },
    statusError, creationError } = {}) {
    const calls = { status: 0, create: [], headers: [], codes: [], bodies: [], errors: [] };
    const controller = new InitialSetupController({
        initialSetupService: {
            async getStatus() {
                calls.status += 1;
                if (statusError) throw statusError;
                return status;
            },
            async createAdmin(input) {
                calls.create.push(input);
                if (creationError) throw creationError;
                return creation;
            },
        },
    });
    const response = {
        set(name, value) { calls.headers.push({ name, value }); return this; },
        status(code) { calls.codes.push(code); return this; },
        json(body) { calls.bodies.push(body); return this; },
    };
    const next = error => calls.errors.push(error);
    return { controller, response, next, calls };
}

const INPUT = Object.freeze({
    invitationToken: 'ab'.repeat(32), name: '  Ana   Silva  ',
    email: ' ANA@EXAMPLE.COM ', password: '  senha-ficticia  ',
});

function assertNoResponse(calls) {
    assert.deepEqual(calls.codes, []);
    assert.deepEqual(calls.bodies, []);
}

function assertNoCache(calls) {
    assert.deepEqual(calls.headers, [{ name: 'Cache-Control', value: 'no-store' }]);
}

describe('configuração de InitialSetupController', () => {
    test('exige serviço com consulta e criação', () => {
        for (const initialSetupService of [undefined, null, [], {},
            { getStatus() {} }, { createAdmin() {} },
            { getStatus: 'texto', createAdmin() {} }]) {
            assert.throws(() => new InitialSetupController({ initialSetupService }), {
                name: 'TypeError', message: ERRORS.INVALID_SERVICE,
            });
        }
    });

    test('construção não chama o serviço e mantém a instância imutável', () => {
        const { controller, calls } = context();
        assert.equal(Object.isFrozen(controller), true);
        assert.equal(calls.status, 0);
        assert.deepEqual(calls.create, []);
        assert.deepEqual(calls.headers, []);
    });

    test('mantém mensagens estáveis e imutáveis', () => {
        assert.equal(Object.isFrozen(ERRORS), true);
    });
});

describe('consulta HTTP de disponibilidade', () => {
    for (const available of [true, false]) {
        test(`responde 200 com disponibilidade ${available} e sem campos extras`, async () => {
            const { controller, response, next, calls } = context({
                status: { available, invitationToken: INPUT.invitationToken,
                    email: INPUT.email, passwordHash: 'hash-privado' },
            });
            // Desestruturação representa registro direto do handler no Router.
            const { getStatus } = controller;
            await getStatus({}, response, next);
            assert.equal(calls.status, 1);
            assertNoCache(calls);
            assert.deepEqual(calls.codes, [200]);
            assert.deepEqual(calls.bodies, [{ data: { available } }]);
            assert.equal(Object.isFrozen(calls.bodies[0].data), true);
            assert.deepEqual(calls.errors, []);
            assert.deepEqual(calls.create, []);
        });
    }

    test('encaminha resposta inconsistente ao tratamento de erros', async () => {
        for (const status of [null, [], {}, { available: 'true' }, { available: 1 }]) {
            const { controller, response, next, calls } = context({ status });
            await controller.getStatus({}, response, next);
            assertNoResponse(calls);
            assert.equal(calls.errors.length, 1);
            assert.equal(calls.errors[0].message, ERRORS.INVALID_STATUS_RESPONSE);
            assertNoCache(calls);
        }
    });

    test('preserva erro inesperado sem responder ou expor detalhes', async () => {
        const statusError = new Error('Detalhe privado de infraestrutura.');
        const { controller, response, next, calls } = context({ statusError });
        await controller.getStatus({}, response, next);
        assert.deepEqual(calls.errors, [statusError]);
        assertNoResponse(calls);
        assertNoCache(calls);
    });
});

describe('criação HTTP do primeiro administrador', () => {
    test('seleciona somente os quatro campos e preserva os valores originais', async () => {
        const { controller, response, next, calls } = context();
        const body = Object.freeze({ ...INPUT, role: 'outro', active: false,
            passwordHash: 'hash-do-cliente', extra: 'ignorar' });
        const { createAdmin } = controller;
        await createAdmin({ body }, response, next);
        assert.deepEqual(calls.create, [INPUT]);
        assert.deepEqual(calls.codes, [201]);
        assert.deepEqual(calls.bodies, [{ data: { created: true } }]);
        assert.equal(Object.isFrozen(calls.bodies[0].data), true);
        assert.deepEqual(calls.errors, []);
        assertNoCache(calls);
        assert.equal(calls.status, 0);
    });

    test('descarta dados privados acrescentados à confirmação pelo serviço', async () => {
        const { controller, response, next, calls } = context({
            creation: { created: true, user: { passwordHash: 'privado' },
                password: INPUT.password, invitationToken: INPUT.invitationToken },
        });
        await controller.createAdmin({ body: INPUT }, response, next);
        assert.deepEqual(calls.bodies, [{ data: { created: true } }]);
        const serialized = JSON.stringify(calls.bodies);
        assert.equal(serialized.includes(INPUT.password), false);
        assert.equal(serialized.includes(INPUT.invitationToken), false);
        assert.equal(serialized.includes('passwordHash'), false);
    });

    test('não usa convite ou dados presentes na URL', async () => {
        const { controller, response, next, calls } = context();
        await controller.createAdmin({ body: {}, query: INPUT, params: INPUT }, response, next);
        assert.deepEqual(calls.create, [{ invitationToken: undefined,
            name: undefined, email: undefined, password: undefined }]);
    });

    test('encaminha corpos de outro tipo para a validação do serviço', async () => {
        for (const body of [undefined, null, [], 'texto', 123]) {
            const creationError = new AppError('Entrada recusada.', {
                code: 'INITIAL_SETUP_INVALID_INVITATION', statusCode: 403,
            });
            const { controller, response, next, calls } = context({ creationError });
            await controller.createAdmin({ body }, response, next);
            assert.strictEqual(calls.create[0], body);
            assert.deepEqual(calls.errors, [creationError]);
            assertNoResponse(calls);
        }
    });

    test('requisição ausente não provoca acesso indevido a propriedades', async () => {
        const { controller, response, next, calls } = context();
        await controller.createAdmin(undefined, response, next);
        assert.deepEqual(calls.create, [undefined]);
    });

    test('não transforma confirmação inválida em sucesso HTTP', async () => {
        for (const creation of [null, [], {}, { created: false }, { created: 1 }, { created: 'true' }]) {
            const { controller, response, next, calls } = context({ creation });
            await controller.createAdmin({ body: INPUT }, response, next);
            assertNoResponse(calls);
            assert.equal(calls.errors.length, 1);
            assert.equal(calls.errors[0].message, ERRORS.INVALID_CREATION_RESPONSE);
        }
    });

    test('preserva recusas operacionais do serviço sem devolver sucesso', async () => {
        for (const [code, statusCode] of [
            ['INITIAL_SETUP_INVALID_INVITATION', 403],
            ['INITIAL_SETUP_INVALID_DATA', 400],
            ['INITIAL_SETUP_UNAVAILABLE', 409],
        ]) {
            const creationError = new AppError('Recusa segura.', { code, statusCode });
            const { controller, response, next, calls } = context({ creationError });
            await controller.createAdmin({ body: INPUT }, response, next);
            assert.deepEqual(calls.errors, [creationError]);
            assertNoResponse(calls);
            assertNoCache(calls);
        }
    });

    test('preserva falha inesperada para tratamento centralizado', async () => {
        const creationError = new Error('Detalhe privado de escrita.');
        const { controller, response, next, calls } = context({ creationError });
        await controller.createAdmin({ body: INPUT }, response, next);
        assert.deepEqual(calls.errors, [creationError]);
        assertNoResponse(calls);
    });

    test('aguarda o serviço antes de confirmar criação', async () => {
        let resolveCreation;
        const pendingCreation = new Promise(resolve => { resolveCreation = resolve; });
        const ctx = context();
        const controller = new InitialSetupController({
            initialSetupService: {
                async getStatus() { return { available: true }; },
                createAdmin() { return pendingCreation; },
            },
        });
        const pending = controller.createAdmin({ body: INPUT }, ctx.response, ctx.next);
        try {
            await new Promise(resolve => setImmediate(resolve));
            assertNoResponse(ctx.calls);
        } finally {
            resolveCreation({ created: true });
            await pending;
        }
        assert.deepEqual(ctx.calls.codes, [201]);
        assert.deepEqual(ctx.calls.errors, []);
    });
});
