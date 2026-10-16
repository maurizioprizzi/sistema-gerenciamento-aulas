'use strict';

const assert = require('node:assert/strict');
const { describe, test } = require('node:test');
const {
    AdministrativeStartupService,
    ADMINISTRATIVE_STARTUP_STATUS: STATUS,
    ADMINISTRATIVE_STARTUP_ERRORS: ERRORS,
} = require('../src/services/AdministrativeStartupService');

const TOKEN = 'ab'.repeat(32);
const CREDENTIALS = Object.freeze({
    name: 'Ana Silva', email: 'ana@example.com', password: 'senha-ficticia-de-teste',
});

/**
 * Nenhuma operação acessa MongoDB ou executa bcrypt. A decisão é verificada
 * separadamente da persistência e da futura composição do servidor.
 */
function context({ recovery = { status: 'no_record' }, user = null,
    bootstrap = { status: 'created', created: true },
    recoveryError, queryError, bootstrapError } = {}) {
    const calls = { order: [], queries: [], credentials: [] };
    const dependencies = {
        UserModel: {
            async findOne(filter) {
                calls.order.push('query');
                calls.queries.push(filter);
                if (queryError) throw queryError;
                return user;
            },
        },
        recoveryService: {
            async recover() {
                calls.order.push('recovery');
                if (recoveryError) throw recoveryError;
                return recovery;
            },
        },
        adminBootstrapper: {
            async ensureAdmin(credentials) {
                calls.order.push('bootstrap');
                calls.credentials.push(credentials);
                if (bootstrapError) throw bootstrapError;
                return bootstrap;
            },
        },
    };
    return { calls, dependencies, service: new AdministrativeStartupService(dependencies) };
}

function assertResult(value, status) {
    assert.deepEqual(value, { status });
    assert.equal(Object.isFrozen(value), true);
}

function assertNoBootstrap(calls) {
    assert.deepEqual(calls.credentials, []);
}

describe('configuração de AdministrativeStartupService', () => {
    test('compõe dependências padrão sem abrir conexão', () => {
        assert.doesNotThrow(() => new AdministrativeStartupService());
    });

    test('recusa modelo de usuário inválido', () => {
        const { dependencies } = context();
        for (const UserModel of [null, {}, { findOne: 'texto' }]) {
            assert.throws(() => new AdministrativeStartupService({ ...dependencies, UserModel }),
                { name: 'TypeError', message: ERRORS.INVALID_USER_MODEL });
        }
    });

    test('recusa serviço de recuperação inválido', () => {
        const { dependencies } = context();
        for (const recoveryService of [null, {}, { recover: 'texto' }]) {
            assert.throws(() => new AdministrativeStartupService({ ...dependencies, recoveryService }),
                { name: 'TypeError', message: ERRORS.INVALID_RECOVERY_SERVICE });
        }
    });

    test('recusa serviço de bootstrap inválido', () => {
        const { dependencies } = context();
        for (const adminBootstrapper of [null, {}, { ensureAdmin: 'texto' }]) {
            assert.throws(() => new AdministrativeStartupService({ ...dependencies, adminBootstrapper }),
                { name: 'TypeError', message: ERRORS.INVALID_BOOTSTRAPPER });
        }
    });

    test('construção não executa operações das dependências', () => {
        const { calls } = context();
        assert.deepEqual(calls.order, []);
    });

    test('mantém estados e mensagens imutáveis', () => {
        assert.equal(Object.isFrozen(STATUS), true);
        assert.equal(Object.isFrozen(ERRORS), true);
    });
});

describe('decisões de preparação administrativa', () => {
    for (const active of [true, false]) {
        test(`preserva conta ${active ? 'ativa' : 'desativada'} sem credenciais configuradas`, async () => {
            const user = Object.freeze({ role: 'admin', active, email: 'original@example.com' });
            const { service, calls } = context({ user });
            assertResult(await service.initialize(), STATUS.EXISTING_ADMIN);
            assert.deepEqual(calls.order, ['recovery', 'query']);
            assert.deepEqual(calls.queries, [{ role: 'admin' }]);
            assertNoBootstrap(calls);
            assert.equal(user.active, active);
            assert.equal(user.email, 'original@example.com');
        });
    }

    for (const recoveryStatus of ['completed', 'already_completed']) {
        test(`preserva a conta após recuperação ${recoveryStatus}`, async () => {
            const { service, calls } = context({ recovery: { status: recoveryStatus },
                user: { role: 'admin', active: true } });
            assertResult(await service.initialize({ initialSetupToken: TOKEN,
                adminCredentials: CREDENTIALS }), STATUS.EXISTING_ADMIN);
            assertNoBootstrap(calls);
        });
    }

    test('reserva sem conta interrompe antes da consulta e do bootstrap', async () => {
        const { service, calls } = context({ recovery: { status: 'needs_review' } });
        await assert.rejects(service.initialize({ initialSetupToken: TOKEN,
            adminCredentials: CREDENTIALS }), { message: ERRORS.RESERVATION_NEEDS_REVIEW });
        assert.deepEqual(calls.order, ['recovery']);
        assertNoBootstrap(calls);
    });

    for (const recoveryStatus of ['completed', 'already_completed']) {
        test(`conclusão ${recoveryStatus} sem conta não reabre cadastro nem recria usuário`, async () => {
            const { service, calls } = context({ recovery: { status: recoveryStatus } });
            await assert.rejects(service.initialize({ initialSetupToken: TOKEN,
                adminCredentials: CREDENTIALS }), { message: ERRORS.COMPLETED_WITHOUT_ADMIN });
            assert.deepEqual(calls.order, ['recovery', 'query']);
            assertNoBootstrap(calls);
        });
    }

    test('instalação vazia com convite aguarda o primeiro cadastro', async () => {
        const { service, calls } = context();
        assertResult(await service.initialize({ initialSetupToken: TOKEN }), STATUS.SETUP_REQUIRED);
        assertNoBootstrap(calls);
    });

    test('convite tem prioridade sobre credenciais predefinidas na instalação vazia', async () => {
        const { service, calls } = context();
        assertResult(await service.initialize({ initialSetupToken: TOKEN,
            adminCredentials: CREDENTIALS }), STATUS.SETUP_REQUIRED);
        assertNoBootstrap(calls);
    });

    test('sem convite mantém a criação pelo grupo completo de credenciais', async () => {
        const { service, calls } = context();
        assertResult(await service.initialize({ adminCredentials: CREDENTIALS }), STATUS.CREATED_ADMIN);
        assert.deepEqual(calls.order, ['recovery', 'query', 'bootstrap']);
        assert.deepEqual(calls.credentials, [CREDENTIALS]);
        assert.strictEqual(calls.credentials[0], CREDENTIALS);
    });

    test('reconhece conta criada concorrentemente pelo fluxo antigo', async () => {
        const { service } = context({ bootstrap: { status: 'already_exists', created: false } });
        assertResult(await service.initialize({ adminCredentials: CREDENTIALS }), STATUS.EXISTING_ADMIN);
    });

    test('instalação vazia sem convite ou credenciais exige configuração', async () => {
        const { service, calls } = context();
        await assert.rejects(service.initialize(), { message: ERRORS.CONFIGURATION_REQUIRED });
        assertNoBootstrap(calls);
    });
});

describe('validações e falhas da preparação administrativa', () => {
    test('recusa convite inválido antes das operações do banco', async () => {
        for (const initialSetupToken of [null, '', 123, 'a'.repeat(63), 'g'.repeat(64)]) {
            const { service, calls } = context();
            await assert.rejects(service.initialize({ initialSetupToken }),
                { name: 'TypeError', message: ERRORS.INVALID_INVITATION });
            assert.deepEqual(calls.order, []);
        }
    });

    test('recusa credenciais incompletas antes de recuperar mesmo com convite', async () => {
        for (const adminCredentials of [null, {}, { name: 'Ana Silva' },
            { name: 'Ana Silva', email: 'ana@example.com' }]) {
            const { service, calls } = context();
            await assert.rejects(service.initialize({ adminCredentials, initialSetupToken: TOKEN }),
                { name: 'TypeError' });
            assert.deepEqual(calls.order, []);
        }
    });

    test('recusa resultado desconhecido da recuperação antes da consulta', async () => {
        for (const recovery of [null, {}, [], { status: 'aberto' }]) {
            const { service, calls } = context({ recovery });
            await assert.rejects(service.initialize(),
                { name: 'TypeError', message: ERRORS.INVALID_RECOVERY_RESULT });
            assert.deepEqual(calls.order, ['recovery']);
        }
    });

    test('recusa usuário com papel inconsistente sem executar bootstrap', async () => {
        const { service, calls } = context({ user: { role: 'outro' } });
        await assert.rejects(service.initialize({ adminCredentials: CREDENTIALS }),
            { name: 'TypeError', message: ERRORS.INVALID_USER });
        assertNoBootstrap(calls);
    });

    test('recusa confirmações de bootstrap inconsistentes', async () => {
        for (const bootstrap of [null, {}, { status: 'created', created: false },
            { status: 'already_exists', created: true }, { status: 'outro', created: true }]) {
            const { service } = context({ bootstrap });
            await assert.rejects(service.initialize({ adminCredentials: CREDENTIALS }),
                { name: 'TypeError', message: ERRORS.INVALID_BOOTSTRAP_RESULT });
        }
    });

    test('propaga falha de recuperação sem consultar a conta', async () => {
        const recoveryError = new Error('Falha controlada.');
        const { service, calls } = context({ recoveryError });
        await assert.rejects(service.initialize(), error => error === recoveryError);
        assert.deepEqual(calls.order, ['recovery']);
    });

    test('propaga falha da consulta sem executar bootstrap', async () => {
        const queryError = new Error('Consulta indisponível.');
        const { service, calls } = context({ queryError });
        await assert.rejects(service.initialize({ adminCredentials: CREDENTIALS }),
            error => error === queryError);
        assertNoBootstrap(calls);
    });

    test('propaga falha do bootstrap sem devolver sucesso', async () => {
        const bootstrapError = new Error('Criação indisponível.');
        const { service } = context({ bootstrapError });
        await assert.rejects(service.initialize({ adminCredentials: CREDENTIALS }),
            error => error === bootstrapError);
    });

    test('aguarda a recuperação antes de consultar a conta', async () => {
        const ctx = context({ user: { role: 'admin' } });
        let release;
        const pendingRecovery = new Promise(resolve => { release = resolve; });
        const service = new AdministrativeStartupService({ ...ctx.dependencies,
            recoveryService: { recover: () => pendingRecovery } });
        const pending = service.initialize();
        try {
            await new Promise(resolve => setImmediate(resolve));
            assert.deepEqual(ctx.calls.queries, []);
            assertNoBootstrap(ctx.calls);
        } finally {
            release({ status: 'no_record' });
            await pending;
        }
    });

    test('aguarda o bootstrap antes de confirmar criação', async () => {
        const ctx = context();
        let release;
        let completed = false;
        const pendingBootstrap = new Promise(resolve => { release = resolve; });
        const service = new AdministrativeStartupService({ ...ctx.dependencies,
            adminBootstrapper: { ensureAdmin: () => pendingBootstrap } });
        const pending = service.initialize({ adminCredentials: CREDENTIALS }).then(value => {
            completed = true; return value;
        });
        try {
            await new Promise(resolve => setImmediate(resolve));
            assert.equal(completed, false);
        } finally {
            release({ status: 'created', created: true });
            assertResult(await pending, STATUS.CREATED_ADMIN);
        }
    });
});
