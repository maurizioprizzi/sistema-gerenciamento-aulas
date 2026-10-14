'use strict';

const assert = require('node:assert/strict');
const { describe, test } = require('node:test');
const { Types } = require('mongoose');
const {
    InitialSetupRecoveryService,
    INITIAL_SETUP_RECOVERY_STATUS: STATUS,
    INITIAL_SETUP_RECOVERY_ERRORS: ERRORS,
} = require('../src/services/InitialSetupRecoveryService');
const { INITIAL_SETUP_STATE_ID: STATE_ID } = require('../src/models/InitialSetupState');

const ADMIN_ID = '1234567890abcdef12345678';
const OTHER_ID = 'abcdef123456789012345678';
const NOW = new Date('2026-10-14T17:00:00.000Z');
const RESERVED = Object.freeze({
    _id: STATE_ID, administratorId: ADMIN_ID, status: 'reserved', completedAt: null,
});
const COMPLETED = Object.freeze({ ...RESERVED, status: 'completed', completedAt: NOW });

/**
 * Modelos controlados. Não possuem operações de criar/remover usuário ou
 * registro: qualquer tentativa indevida dessas operações falharia no teste.
 */
function context({ states = [RESERVED], user = { _id: ADMIN_ID, role: 'admin', active: true },
    stateError, userError, updateError, clock = () => NOW,
    updateResult = { acknowledged: true, matchedCount: 1, modifiedCount: 1 },
} = {}) {
    const calls = { stateFind: [], userFind: [], updates: [], clock: 0, order: [] };
    let queryNumber = 0;
    const UserModel = {
        async findOne(filter) {
            calls.order.push('user');
            calls.userFind.push(filter);
            if (userError) throw userError;
            return user;
        },
    };
    const SetupStateModel = {
        async findOne(filter) {
            calls.order.push('state');
            calls.stateFind.push(filter);
            if (stateError) throw stateError;
            return states[Math.min(queryNumber++, states.length - 1)];
        },
        async updateOne(filter, update, options) {
            calls.order.push('update');
            calls.updates.push({ filter, update, options });
            if (updateError) throw updateError;
            return updateResult;
        },
    };
    const dependencies = {
        UserModel, SetupStateModel,
        clock() { calls.clock += 1; return clock(); },
    };
    return { calls, dependencies, service: new InitialSetupRecoveryService(dependencies) };
}

function assertNoUpdate(calls) {
    assert.deepEqual(calls.updates, []);
    assert.equal(calls.clock, 0);
}

function assertResult(result, status) {
    assert.deepEqual(result, { status });
    assert.equal(Object.isFrozen(result), true);
}

describe('configuração da recuperação de primeiro cadastro', () => {
    test('permite construir com dependências padrão sem acessar recursos', () => {
        assert.doesNotThrow(() => new InitialSetupRecoveryService());
    });

    test('rejeita modelo de usuário inválido', () => {
        for (const UserModel of [null, {}, { findOne: 'texto' }]) {
            assert.throws(() => new InitialSetupRecoveryService({ UserModel }), {
                name: 'TypeError', message: ERRORS.INVALID_USER_MODEL,
            });
        }
    });

    test('rejeita modelo de estado sem as operações exigidas', () => {
        for (const SetupStateModel of [null, {}, { findOne() {} }, { updateOne() {} }]) {
            assert.throws(() => new InitialSetupRecoveryService({ SetupStateModel }), {
                name: 'TypeError', message: ERRORS.INVALID_STATE_MODEL,
            });
        }
    });

    test('rejeita relógio que não é função', () => {
        for (const clock of [null, 123, NOW]) {
            assert.throws(() => new InitialSetupRecoveryService({ clock }), {
                name: 'TypeError', message: ERRORS.INVALID_CLOCK,
            });
        }
    });

    test('construção não consulta modelos ou relógio', () => {
        const ctx = context();
        assert.deepEqual(ctx.calls.order, []);
        assert.equal(ctx.calls.clock, 0);
    });

    test('mantém estados e mensagens imutáveis', () => {
        assert.equal(Object.isFrozen(STATUS), true);
        assert.equal(Object.isFrozen(ERRORS), true);
    });
});

describe('decisões da recuperação', () => {
    test('ausência de registro não cria reserva nem consulta usuário', async () => {
        const { service, calls } = context({ states: [null] });
        assertResult(await service.recover(), STATUS.NO_RECORD);
        assert.deepEqual(calls.stateFind, [{ _id: STATE_ID }]);
        assert.deepEqual(calls.userFind, []);
        assertNoUpdate(calls);
    });

    test('registro concluído permanece fechado mesmo sem conta', async () => {
        const { service, calls } = context({ states: [COMPLETED], user: null });
        assertResult(await service.recover(), STATUS.ALREADY_COMPLETED);
        assert.deepEqual(calls.userFind, []);
        assertNoUpdate(calls);
    });

    test('reserva sem conta exige verificação e não atualiza o registro', async () => {
        const { service, calls } = context({ user: null });
        assertResult(await service.recover(), STATUS.NEEDS_REVIEW);
        assert.deepEqual(calls.userFind, [{ _id: ADMIN_ID, role: 'admin' }]);
        assertNoUpdate(calls);
    });

    for (const active of [true, false]) {
        test(`conclui reserva com conta ${active ? 'ativa' : 'desativada'} sem modificá-la`, async () => {
            const user = Object.freeze({ _id: ADMIN_ID, role: 'admin', active,
                email: 'original@example.com', passwordHash: 'hash-original' });
            const { service, calls } = context({ user });
            assertResult(await service.recover(), STATUS.COMPLETED);
            assert.deepEqual(calls.order, ['state', 'user', 'update']);
            assert.deepEqual(calls.updates, [{
                filter: { _id: STATE_ID, administratorId: ADMIN_ID, status: 'reserved' },
                update: { $set: { status: 'completed', completedAt: NOW } },
                options: { runValidators: true },
            }]);
            assert.notStrictEqual(calls.updates[0].update.$set.completedAt, NOW);
            assert.equal(user.active, active);
            assert.equal(user.email, 'original@example.com');
            assert.equal(user.passwordHash, 'hash-original');
        });
    }

    test('aceita ObjectId e sua representação hexadecimal equivalente', async () => {
        const administratorId = new Types.ObjectId(ADMIN_ID);
        const { service, calls } = context({
            states: [{ ...RESERVED, administratorId }],
            user: { _id: ADMIN_ID.toUpperCase(), role: 'admin' },
        });
        assertResult(await service.recover(), STATUS.COMPLETED);
        assert.strictEqual(calls.userFind[0]._id, administratorId);
    });

    test('recusa estados inconsistentes antes de consultar usuário', async () => {
        for (const state of [
            { ...RESERVED, _id: 'outro-registro' },
            { ...RESERVED, administratorId: 'invalido' },
            { ...RESERVED, administratorId: null },
            { ...RESERVED, status: 'aberto' },
            { ...RESERVED, completedAt: NOW },
            { ...COMPLETED, completedAt: null },
            { ...COMPLETED, completedAt: new Date(NaN) },
            { ...COMPLETED, completedAt: NOW.toISOString() },
        ]) {
            const { service, calls } = context({ states: [state] });
            await assert.rejects(service.recover(), { message: ERRORS.INVALID_STATE });
            assert.deepEqual(calls.userFind, []);
            assertNoUpdate(calls);
        }
    });

    test('recusa usuário com id ou papel diferente da reserva', async () => {
        for (const user of [{ _id: OTHER_ID, role: 'admin' },
            { _id: ADMIN_ID, role: 'outro' }, {}, { _id: 'invalido', role: 'admin' }]) {
            const { service, calls } = context({ user });
            await assert.rejects(service.recover(), { message: ERRORS.INVALID_USER });
            assertNoUpdate(calls);
        }
    });

    test('recusa data inválida antes da atualização', async () => {
        for (const timestamp of [null, undefined, 123, 'data', new Date(NaN)]) {
            const { service, calls } = context({ clock: () => timestamp });
            await assert.rejects(service.recover(), {
                name: 'TypeError', message: ERRORS.INVALID_TIMESTAMP,
            });
            assert.deepEqual(calls.updates, []);
        }
    });
});

describe('falhas e concorrência na recuperação', () => {
    test('propaga falha de leitura do estado sem consultar usuário', async () => {
        const stateError = new Error('Estado indisponível.');
        const { service, calls } = context({ stateError });
        await assert.rejects(service.recover(), error => error === stateError);
        assert.deepEqual(calls.userFind, []);
        assertNoUpdate(calls);
    });

    test('propaga falha de leitura da conta sem atualizar reserva', async () => {
        const userError = new Error('Consulta indisponível.');
        const { service, calls } = context({ userError });
        await assert.rejects(service.recover(), error => error === userError);
        assertNoUpdate(calls);
    });

    test('propaga falha do relógio sem atualizar reserva', async () => {
        const clockError = new Error('Relógio indisponível.');
        const { service, calls } = context({ clock() { throw clockError; } });
        await assert.rejects(service.recover(), error => error === clockError);
        assert.deepEqual(calls.updates, []);
    });

    test('propaga falha de escrita sem produzir resultado de sucesso', async () => {
        const updateError = new Error('Escrita indisponível.');
        const { service, calls } = context({ updateError });
        await assert.rejects(service.recover(), error => error === updateError);
        assert.equal(calls.updates.length, 1);
        assert.equal(calls.stateFind.length, 1);
    });

    test('recusa respostas de atualização inconsistentes', async () => {
        for (const updateResult of [null, {},
            { acknowledged: false, matchedCount: 1, modifiedCount: 1 },
            { acknowledged: true, matchedCount: 1, modifiedCount: 0 },
            { acknowledged: true, matchedCount: 2, modifiedCount: 1 },
            { acknowledged: true, matchedCount: 0, modifiedCount: 1 }]) {
            const { service, calls } = context({ updateResult });
            await assert.rejects(service.recover(), { message: ERRORS.INVALID_UPDATE });
            assert.equal(calls.stateFind.length, 1);
        }
    });

    test('confirma conclusão concorrente da mesma identidade', async () => {
        const { service, calls } = context({
            states: [RESERVED, COMPLETED],
            updateResult: { acknowledged: true, matchedCount: 0, modifiedCount: 0 },
        });
        assertResult(await service.recover(), STATUS.ALREADY_COMPLETED);
        assert.deepEqual(calls.stateFind, [{ _id: STATE_ID }, { _id: STATE_ID }]);
        assert.equal(calls.updates.length, 1);
    });

    test('não aceita corrida como concluída se a reserva continua pendente', async () => {
        const { service } = context({
            updateResult: { acknowledged: true, matchedCount: 0, modifiedCount: 0 },
        });
        await assert.rejects(service.recover(), { message: ERRORS.INVALID_UPDATE });
    });

    test('não aceita conclusão concorrente de outra identidade', async () => {
        const { service } = context({
            states: [RESERVED, { ...COMPLETED, administratorId: OTHER_ID }],
            updateResult: { acknowledged: true, matchedCount: 0, modifiedCount: 0 },
        });
        await assert.rejects(service.recover(), { message: ERRORS.INVALID_UPDATE });
    });

    test('recusa desaparecimento do registro na consulta de confirmação', async () => {
        const { service } = context({
            states: [RESERVED, null],
            updateResult: { acknowledged: true, matchedCount: 0, modifiedCount: 0 },
        });
        await assert.rejects(service.recover(), { message: ERRORS.INVALID_STATE });
    });
});
