'use strict';

const assert = require('node:assert/strict');
const { describe, test } = require('node:test');
const {
    InitialSetupService,
    INITIAL_SETUP_CODES: CODES,
    INITIAL_SETUP_MESSAGES: MESSAGES,
} = require('../src/services/InitialSetupService');
const {
    INITIAL_SETUP_STATE_ID: STATE_ID,
    INITIAL_SETUP_STATE_STATUS: STATUS,
} = require('../src/models/InitialSetupState');

// Convite fictício. Nenhuma credencial real é utilizada neste arquivo.
const TOKEN = 'ab'.repeat(32);
const INPUT = Object.freeze({
    invitationToken: TOKEN,
    name: '  Ana   Silva  ',
    email: ' ANA@EXAMPLE.COM ',
    password: '  senha-ficticia  ',
});

/**
 * Dependências controladas, sem MongoDB ou cálculos bcrypt reais.
 * A inspeção das chamadas verifica que recusas antecedem hashing e criação.
 */
function context({ token = TOKEN, existing = null, queryError, hashError,
    createError, hashResult = 'hash-ficticio-controlado', state = null,
    stateQueryError, reservationError, completionError,
    completionResult = { acknowledged: true, matchedCount: 1, modifiedCount: 1 },
} = {}) {
    const calls = { find: [], hash: [], create: [], stateFind: [], reserve: [], complete: [], order: [] };
    const storage = { state, user: existing };
    const UserModel = {
        async findOne(filter) {
            calls.order.push('user.find');
            calls.find.push(filter);
            if (queryError) throw queryError;
            return storage.user;
        },
        async create(data) {
            calls.order.push('user.create');
            calls.create.push(data);
            if (createError) throw createError;
            storage.user = { ...data };
            return storage.user;
        },
    };
    const SetupStateModel = {
        async findOne(filter) {
            calls.order.push('state.find');
            calls.stateFind.push(filter);
            if (stateQueryError) throw stateQueryError;
            return storage.state;
        },
        async create(data) {
            calls.order.push('state.reserve');
            calls.reserve.push(data);
            if (reservationError) throw reservationError;
            if (storage.state) {
                throw Object.assign(new Error('Reserva duplicada simulada.'), { code: 11000 });
            }
            storage.state = { ...data };
            return storage.state;
        },
        async updateOne(filter, update, options) {
            calls.order.push('state.complete');
            calls.complete.push({ filter, update, options });
            if (completionError) throw completionError;
            if (completionResult?.acknowledged === true
                && completionResult.matchedCount === 1
                && completionResult.modifiedCount === 1) {
                Object.assign(storage.state, update.$set);
            }
            return completionResult;
        },
    };
    const passwordHasherService = {
        async hash(password) {
            calls.order.push('hash');
            calls.hash.push(password);
            if (hashError) throw hashError;
            return hashResult;
        },
    };
    const dependencies = {
        UserModel, SetupStateModel, passwordHasherService, initialSetupToken: token,
    };
    return { calls, storage, dependencies, service: new InitialSetupService(dependencies) };
}

function assertNoCreation(calls) {
    assert.deepEqual(calls.hash, []);
    assert.deepEqual(calls.create, []);
}

function operational(code, statusCode) {
    return error => {
        assert.equal(error.name, 'AppError');
        assert.equal(error.code, code);
        assert.equal(error.statusCode, statusCode);
        assert.equal(error.isOperational, true);
        assert.equal(error.details, null);
        return true;
    };
}

describe('configuração de InitialSetupService', () => {
    test('permite construir o serviço padrão sem convite', () => {
        assert.doesNotThrow(() => new InitialSetupService());
    });

    test('rejeita modelos sem operações necessárias', () => {
        for (const UserModel of [null, {}, { findOne() {} }, { create() {} }]) {
            assert.throws(() => new InitialSetupService({ UserModel }), {
                name: 'TypeError', message: MESSAGES.INVALID_MODEL,
            });
        }
    });

    test('rejeita serviço de hashing inválido', () => {
        for (const passwordHasherService of [null, {}, { hash: 'texto' }]) {
            assert.throws(() => new InitialSetupService({ passwordHasherService }), {
                name: 'TypeError', message: MESSAGES.INVALID_HASHER,
            });
        }
    });

    test('rejeita convite configurado inválido sem expor seu valor', () => {
        for (const initialSetupToken of [null, '', 123, 'segredo-curto', 'g'.repeat(64)]) {
            assert.throws(() => new InitialSetupService({ initialSetupToken }), {
                name: 'TypeError', message: MESSAGES.INVALID_TOKEN_CONFIGURATION,
            });
        }
    });

    test('mantém códigos e mensagens imutáveis', () => {
        assert.equal(Object.isFrozen(CODES), true);
        assert.equal(Object.isFrozen(MESSAGES), true);
    });
});

describe('disponibilidade do primeiro cadastro', () => {
    test('sem convite, informa indisponibilidade e não consulta o banco', async () => {
        // undefined desativa o serviço; não há fallback para token fictício.
        const service = new InitialSetupService({
            UserModel: {
                async findOne() { assert.fail('Consulta indevida.'); },
                async create() { assert.fail('Criação indevida.'); },
            },
        });
        const status = await service.getStatus();
        assert.deepEqual(status, { available: false });
        assert.equal(Object.isFrozen(status), true);
        await assert.rejects(service.createAdmin(INPUT), operational(CODES.UNAVAILABLE, 409));
    });

    test('convite configurado e ausência de admin permitem disponibilidade', async () => {
        const { service, calls } = context();
        const status = await service.getStatus();
        assert.deepEqual(status, { available: true });
        assert.equal(Object.isFrozen(status), true);
        assert.deepEqual(calls.find, [{ role: 'admin' }]);
        assertNoCreation(calls);
    });

    for (const active of [true, false]) {
        test(`admin ${active ? 'ativo' : 'inativo'} bloqueia estado e criação`, async () => {
            const existing = Object.freeze({ role: 'admin', active, email: 'original@example.com' });
            const { service, calls } = context({ existing });
            assert.deepEqual(await service.getStatus(), { available: false });
            await assert.rejects(service.createAdmin(INPUT), operational(CODES.UNAVAILABLE, 409));
            assert.deepEqual(calls.find, [{ role: 'admin' }, { role: 'admin' }]);
            assertNoCreation(calls);
            assert.equal(existing.active, active);
            assert.equal(existing.email, 'original@example.com');
        });
    }

    test('propaga falha da consulta de disponibilidade', async () => {
        const queryError = new Error('Falha de consulta.');
        const { service } = context({ queryError });
        await assert.rejects(service.getStatus(), error => error === queryError);
    });
});

describe('convite recebido no primeiro cadastro', () => {
    test('recusa convites ausentes, malformados ou diferentes antes do banco', async () => {
        for (const invitationToken of [undefined, null, 1, '', 'g'.repeat(64), 'cd'.repeat(32)]) {
            const { service, calls } = context();
            await assert.rejects(service.createAdmin({ ...INPUT, invitationToken }),
                operational(CODES.INVALID_INVITATION, 403));
            assert.deepEqual(calls.find, []);
            assertNoCreation(calls);
        }
    });

    test('aceita representações hexadecimais equivalentes em maiúsculas', async () => {
        const { service } = context({ token: TOKEN.toUpperCase() });
        assert.deepEqual(await service.createAdmin(INPUT), { created: true });
    });
});

describe('validação de dados do primeiro cadastro', () => {
    const cases = [
        ['nome ausente', { name: undefined }],
        ['nome curto depois da normalização', { name: '  a  ' }],
        ['nome maior que 120 caracteres', { name: 'a'.repeat(121) }],
        ['e-mail inválido', { email: 'endereco-invalido' }],
        ['e-mail maior que 254 caracteres', { email: `${'a'.repeat(250)}@example.com` }],
        ['senha ausente', { password: undefined }],
        ['senha curta', { password: '12345678901' }],
        ['senha somente com espaços', { password: ' '.repeat(12) }],
        ['senha maior que 72 bytes', { password: 'a'.repeat(73) }],
        ['senha Unicode maior que 72 bytes', { password: 'é'.repeat(37) }],
    ];
    for (const [description, changes] of cases) {
        test(`recusa ${description} antes do banco e do hashing`, async () => {
            const { service, calls } = context();
            await assert.rejects(service.createAdmin({ ...INPUT, ...changes }),
                operational(CODES.INVALID_DATA, 400));
            assert.deepEqual(calls.find, []);
            assertNoCreation(calls);
        });
    }

    test('rejeita entradas que não são objetos de dados', () => {
        for (const input of [null, undefined, [], 'texto', 123]) {
            assert.throws(() => InitialSetupService.validateAccountData(input),
                operational(CODES.INVALID_DATA, 400));
        }
    });

    test('aceita senha com exatamente 72 bytes UTF-8', async () => {
        const { service, calls } = context();
        const password = 'é'.repeat(36);
        await service.createAdmin({ ...INPUT, password });
        assert.deepEqual(calls.hash, [password]);
    });
});

describe('criação da primeira conta', () => {
    test('normaliza nome/e-mail, preserva senha e seleciona campos persistidos', async () => {
        const { service, calls } = context();
        const input = Object.freeze({ ...INPUT, role: 'outro', active: false,
            passwordHash: 'hash-do-cliente', extra: 'ignorar' });
        const result = await service.createAdmin(input);
        assert.deepEqual(calls.find, [{ role: 'admin' }]);
        assert.deepEqual(calls.hash, [INPUT.password]);
        assert.equal(calls.create.length, 1);
        const { _id, ...accountFields } = calls.create[0];
        assert.match(_id.toString(), /^[a-f0-9]{24}$/);
        assert.deepEqual([accountFields], [{ name: 'Ana Silva', email: 'ana@example.com',
            passwordHash: 'hash-ficticio-controlado', role: 'admin', active: true }]);
        assert.deepEqual(result, { created: true });
        assert.equal(Object.isFrozen(result), true);
        assert.equal(JSON.stringify(result).includes(TOKEN), false);
        assert.equal(JSON.stringify(result).includes(INPUT.password), false);
    });

    test('propaga falha de consulta sem gerar hash nem criar conta', async () => {
        const queryError = new Error('Banco indisponível.');
        const { service, calls } = context({ queryError });
        await assert.rejects(service.createAdmin(INPUT), error => error === queryError);
        assertNoCreation(calls);
    });

    test('propaga falha de hashing sem criar conta', async () => {
        const hashError = new Error('Hash indisponível.');
        const { service, calls } = context({ hashError });
        await assert.rejects(service.createAdmin(INPUT), error => error === hashError);
        assert.deepEqual(calls.create, []);
    });

    test('recusa resultado inválido do hashing antes da persistência', async () => {
        for (const hashResult of [null, 123, '']) {
            const { service, calls } = context({ hashResult });
            await assert.rejects(service.createAdmin(INPUT), {
                name: 'TypeError', message: MESSAGES.INVALID_HASH_RESULT,
            });
            assert.deepEqual(calls.create, []);
        }
    });

    test('conflito de unicidade não retorna sucesso nem dados internos', async () => {
        const privateValue = 'email-privado@example.com';
        const createError = Object.assign(new Error(privateValue), {
            code: 11000, keyValue: { email: privateValue },
        });
        const { service } = context({ createError });
        await assert.rejects(service.createAdmin(INPUT), error => {
            operational(CODES.UNAVAILABLE, 409)(error);
            assert.equal(error.message, MESSAGES.UNAVAILABLE);
            assert.equal(error.message.includes(privateValue), false);
            assert.equal(error.cause, undefined);
            return true;
        });
    });

    test('propaga outras falhas persistentes', async () => {
        const createError = new Error('Falha de escrita.');
        const { service } = context({ createError });
        await assert.rejects(service.createAdmin(INPUT), error => error === createError);
    });
});


/**
 * Este modelo simulado representa a unicidade da reserva, mas não prova
 * atomicidade do MongoDB. A corrida também será exercitada no banco real.
 */
describe('reserva persistente do primeiro cadastro', () => {
    test('exige modelo de estado com consulta, criação e atualização', () => {
        for (const SetupStateModel of [null, {}, { findOne() {}, create() {} },
            { findOne() {}, updateOne() {} }, { create() {}, updateOne() {} }]) {
            assert.throws(() => new InitialSetupService({ SetupStateModel }), {
                name: 'TypeError', message: MESSAGES.INVALID_STATE_MODEL,
            });
        }
    });

    for (const status of [STATUS.RESERVED, STATUS.COMPLETED]) {
        test(`registro ${status} bloqueia sem consultar usuário nem gerar hash`, async () => {
            const ctx = context({ state: { _id: STATE_ID, status } });
            assert.deepEqual(await ctx.service.getStatus(), { available: false });
            await assert.rejects(ctx.service.createAdmin(INPUT), operational(CODES.UNAVAILABLE, 409));
            assert.deepEqual(ctx.calls.find, []);
            assertNoCreation(ctx.calls);
            assert.deepEqual(ctx.calls.reserve, []);
            assert.deepEqual(ctx.calls.complete, []);
            assert.deepEqual(ctx.calls.stateFind, [{ _id: STATE_ID }, { _id: STATE_ID }]);
        });
    }

    test('consulta de estado com falha não libera cadastro', async () => {
        const stateQueryError = new Error('Estado indisponível.');
        const ctx = context({ stateQueryError });
        await assert.rejects(ctx.service.getStatus(), error => error === stateQueryError);
        await assert.rejects(ctx.service.createAdmin(INPUT), error => error === stateQueryError);
        assert.deepEqual(ctx.calls.find, []);
        assertNoCreation(ctx.calls);
    });

    test('validação inválida e hashing com falha não reservam o convite', async () => {
        const invalid = context();
        await assert.rejects(invalid.service.createAdmin({ ...INPUT, password: 'curta' }),
            operational(CODES.INVALID_DATA, 400));
        assert.deepEqual(invalid.calls.stateFind, []);
        assert.deepEqual(invalid.calls.reserve, []);
        const hashing = context({ hashError: new Error('Falha de hashing.') });
        await assert.rejects(hashing.service.createAdmin(INPUT));
        assert.deepEqual(hashing.calls.reserve, []);
        assert.equal(hashing.storage.state, null);
    });

    test('reserva antes da conta e conclui com o mesmo identificador', async () => {
        const ctx = context();
        await ctx.service.createAdmin(INPUT);
        assert.deepEqual(ctx.calls.order, [
            'state.find', 'user.find', 'hash', 'state.reserve', 'user.create', 'state.complete',
        ]);
        assert.equal(ctx.calls.reserve.length, 1);
        const reservation = ctx.calls.reserve[0];
        assert.equal(reservation._id, STATE_ID);
        assert.equal(reservation.status, STATUS.RESERVED);
        assert.equal(reservation.completedAt, null);
        assert.equal(reservation.administratorId.toString(), ctx.calls.create[0]._id.toString());
        assert.deepEqual(Object.keys(reservation).sort(),
            ['_id', 'administratorId', 'completedAt', 'status']);
        const completion = ctx.calls.complete[0];
        assert.deepEqual(completion.filter, {
            _id: STATE_ID, administratorId: reservation.administratorId, status: STATUS.RESERVED,
        });
        assert.equal(completion.update.$set.status, STATUS.COMPLETED);
        assert.ok(completion.update.$set.completedAt instanceof Date);
        assert.equal(Number.isFinite(completion.update.$set.completedAt.getTime()), true);
        assert.deepEqual(completion.options, { runValidators: true });
    });

    test('conflito de reserva impede criação da conta', async () => {
        const ctx = context({ reservationError: Object.assign(new Error('Conflito.'), { code: 11000 }) });
        await assert.rejects(ctx.service.createAdmin(INPUT), operational(CODES.UNAVAILABLE, 409));
        assert.deepEqual(ctx.calls.create, []);
        assert.deepEqual(ctx.calls.complete, []);
    });

    test('falha comum da reserva é propagada sem criar conta', async () => {
        const reservationError = new Error('Reserva indisponível.');
        const ctx = context({ reservationError });
        await assert.rejects(ctx.service.createAdmin(INPUT), error => error === reservationError);
        assert.deepEqual(ctx.calls.create, []);
        assert.deepEqual(ctx.calls.complete, []);
    });

    test('falha de criação preserva reserva e bloqueia após reiniciar o serviço', async () => {
        const createError = new Error('Conta não pôde ser criada.');
        const ctx = context({ createError });
        await assert.rejects(ctx.service.createAdmin(INPUT), error => error === createError);
        assert.equal(ctx.storage.state.status, STATUS.RESERVED);
        assert.deepEqual(ctx.calls.complete, []);
        const restarted = new InitialSetupService(ctx.dependencies);
        assert.deepEqual(await restarted.getStatus(), { available: false });
        await assert.rejects(restarted.createAdmin(INPUT), operational(CODES.UNAVAILABLE, 409));
        assert.equal(ctx.calls.create.length, 1);
    });

    test('falha de conclusão preserva conta e reserva sem devolver sucesso', async () => {
        const completionError = new Error('Conclusão indisponível.');
        const ctx = context({ completionError });
        await assert.rejects(ctx.service.createAdmin(INPUT), error => error === completionError);
        assert.ok(ctx.storage.user);
        assert.equal(ctx.storage.state.status, STATUS.RESERVED);
        assert.deepEqual(await new InitialSetupService(ctx.dependencies).getStatus(), { available: false });
    });

    test('recusa confirmações de atualização ausentes ou inconsistentes', async () => {
        for (const completionResult of [null, {},
            { acknowledged: false, matchedCount: 1, modifiedCount: 1 },
            { acknowledged: true, matchedCount: 0, modifiedCount: 0 },
            { acknowledged: true, matchedCount: 1, modifiedCount: 0 },
            { acknowledged: true, matchedCount: 2, modifiedCount: 1 }]) {
            const ctx = context({ completionResult });
            await assert.rejects(ctx.service.createAdmin(INPUT), {
                message: MESSAGES.INVALID_COMPLETION_RESULT,
            });
            assert.equal(ctx.storage.state.status, STATUS.RESERVED);
            assert.ok(ctx.storage.user);
        }
    });

    test('conclusão bloqueia outro cadastro mesmo após remover a conta', async () => {
        const ctx = context();
        await ctx.service.createAdmin(INPUT);
        ctx.storage.user = null;
        const restarted = new InitialSetupService(ctx.dependencies);
        assert.deepEqual(await restarted.getStatus(), { available: false });
        await assert.rejects(restarted.createAdmin(INPUT), operational(CODES.UNAVAILABLE, 409));
        assert.equal(ctx.calls.create.length, 1);
        assert.equal(ctx.storage.state.status, STATUS.COMPLETED);
    });

    test('duas tentativas concorrentes permitem somente uma reserva e conta', async () => {
        const ctx = context();
        let hashArrivals = 0;
        let release;
        let rejectBarrier;
        const barrier = new Promise((resolve, reject) => { release = resolve; rejectBarrier = reject; });
        const timeout = setTimeout(() => rejectBarrier(new Error('Barreira não atingida.')), 2000);
        const dependencies = {
            ...ctx.dependencies,
            passwordHasherService: {
                async hash() {
                    hashArrivals += 1;
                    if (hashArrivals === 2) release();
                    await barrier;
                    return 'hash-controlado';
                },
            },
        };
        let results;
        try {
            results = await Promise.allSettled([
                new InitialSetupService(dependencies).createAdmin(INPUT),
                new InitialSetupService(dependencies).createAdmin({ ...INPUT, email: 'outro@example.com' }),
            ]);
        } finally {
            clearTimeout(timeout);
        }
        const accepted = results.filter(result => result.status === 'fulfilled');
        const refused = results.filter(result => result.status === 'rejected');
        assert.equal(hashArrivals, 2);
        assert.equal(accepted.length, 1);
        assert.equal(refused.length, 1);
        operational(CODES.UNAVAILABLE, 409)(refused[0].reason);
        assert.equal(ctx.calls.reserve.length, 2);
        assert.equal(ctx.calls.create.length, 1);
        assert.equal(ctx.calls.complete.length, 1);
        assert.equal(ctx.storage.state.status, STATUS.COMPLETED);
    });
});
