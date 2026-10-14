'use strict';

const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const mongoose = require('mongoose');
const { createUserModel } = require('../src/models/User');
const {
    createInitialSetupStateModel,
    INITIAL_SETUP_STATE_ID: STATE_ID,
    INITIAL_SETUP_STATE_STATUS: STATUS,
} = require('../src/models/InitialSetupState');
const { AdministrativeIndexInitializer } = require('../src/services/AdministrativeIndexInitializer');
const { PasswordHasher } = require('../src/services/PasswordHasher');
const { InitialSetupService, INITIAL_SETUP_CODES: CODES } = require('../src/services/InitialSetupService');
const {
    InitialSetupRecoveryService,
    INITIAL_SETUP_RECOVERY_STATUS: RECOVERY_STATUS,
} = require('../src/services/InitialSetupRecoveryService');

/**
 * Execute: node scripts/verifyInitialSetup.js
 *
 * Não carrega dotenv nem lê a URI da aplicação. Todos os modelos apontam
 * para bancos locais temporários com nomes exclusivos desta execução.
 * O cenário normal usa bcrypt real; falhas e concorrência usam dependências
 * controladas para atingir deliberadamente os intervalos entre gravações.
 */
const LOCAL_URI = 'mongodb://127.0.0.1:27017';
const PREFIX = 'initial_setup_check_';
const TOKEN = 'ab'.repeat(32); // Convite fictício, sem uso fora destes testes.
const INPUT = Object.freeze({
    invitationToken: TOKEN,
    name: '  Ana   Silva  ',
    email: ' ANA@EXAMPLE.COM ',
    password: '  senha-ficticia-de-teste  ',
});
const FAKE_HASH = `$2b$10$${'a'.repeat(53)}`;

async function main() {
    const executionId = randomBytes(8).toString('hex');
    const connections = [];
    let scenarios = 0;
    let currentScenario = 'conexão';

    function passed(description) {
        scenarios += 1;
        console.info(`OK ${scenarios}: ${description}`);
    }

    async function installation(suffix) {
        const dbName = `${PREFIX}${executionId}_${suffix}`;
        const client = new mongoose.Mongoose();
        connections.push({ client, dbName });
        client.set('strictQuery', true);
        client.set('sanitizeFilter', true);
        await client.connect(LOCAL_URI, {
            dbName, autoIndex: false, serverSelectionTimeoutMS: 5000,
            maxPoolSize: 2, minPoolSize: 0,
        });
        const UserModel = createUserModel(client);
        const SetupStateModel = createInitialSetupStateModel(client);
        await UserModel.createCollection();
        await SetupStateModel.createCollection();
        await new AdministrativeIndexInitializer({ UserModel }).initialize();
        const dependencies = {
            UserModel, SetupStateModel, initialSetupToken: TOKEN,
            passwordHasherService: new PasswordHasher({ rounds: 10 }),
        };
        return { ...dependencies, dependencies,
            service: new InitialSetupService(dependencies) };
    }

    async function assertBlocked(service) {
        assert.deepEqual(await service.getStatus(), { available: false });
        await assert.rejects(service.createAdmin(INPUT), {
            code: CODES.UNAVAILABLE, statusCode: 409,
        });
    }

    try {
        const normal = await installation('principal');
        currentScenario = 'recusa de convite inválido';
        await assert.rejects(normal.service.createAdmin({
            ...INPUT, invitationToken: 'cd'.repeat(32),
        }), { code: CODES.INVALID_INVITATION, statusCode: 403 });
        assert.equal(await normal.UserModel.countDocuments({}), 0);
        assert.equal(await normal.SetupStateModel.countDocuments({}), 0);
        passed('convite inválido não reserva nem cria conta');

        currentScenario = 'cadastro com hashing e persistência reais';
        assert.deepEqual(await normal.service.getStatus(), { available: true });
        assert.deepEqual(await normal.service.createAdmin(INPUT), { created: true });
        const user = await normal.UserModel.findOne({ role: 'admin' }).select('+passwordHash');
        const state = await normal.SetupStateModel.findById(STATE_ID).lean();
        assert.ok(user);
        assert.equal(user.name, 'Ana Silva');
        assert.equal(user.email, 'ana@example.com');
        assert.equal(user.active, true);
        assert.notEqual(user.passwordHash, INPUT.password);
        assert.equal(await normal.passwordHasherService.compare(INPUT.password, user.passwordHash), true);
        assert.equal(state.status, STATUS.COMPLETED);
        assert.equal(state.administratorId.toString(), user._id.toString());
        assert.ok(state.completedAt instanceof Date);
        assert.ok(state.createdAt instanceof Date);
        assert.ok(state.updatedAt instanceof Date);
        assert.equal(await normal.SetupStateModel.countDocuments({}), 1);
        assert.equal(await normal.UserModel.countDocuments({}), 1);
        for (const field of ['password', 'passwordHash', 'invitationToken', 'email']) {
            assert.equal(Object.hasOwn(state, field), false);
        }
        passed('cadastro cria conta com bcrypt real e conclui o registro persistente');

        currentScenario = 'reinício, mudança do convite e remoção da conta';
        await assertBlocked(new InitialSetupService(normal.dependencies));
        // Só a conta fictícia deste banco temporário é removida.
        await normal.UserModel.deleteOne({ _id: user._id });
        await assertBlocked(new InitialSetupService(normal.dependencies));
        const changedTokenService = new InitialSetupService({
            ...normal.dependencies, initialSetupToken: 'cd'.repeat(32),
        });
        assert.deepEqual(await changedTokenService.getStatus(), { available: false });
        await assert.rejects(changedTokenService.createAdmin({
            ...INPUT, invitationToken: 'cd'.repeat(32),
        }), { code: CODES.UNAVAILABLE });
        assert.deepEqual(await normal.SetupStateModel.findById(STATE_ID).lean(), state);
        assert.equal(await normal.UserModel.countDocuments({}), 0);
        passed('registro concluído bloqueia após reinício, outro convite e remoção do usuário');

        currentScenario = 'falha depois da reserva e antes da conta';
        const beforeUser = await installation('antes_conta');
        const creationFailure = new Error('Falha controlada antes da conta.');
        const failingUserService = new InitialSetupService({
            ...beforeUser.dependencies,
            UserModel: {
                findOne: filter => beforeUser.UserModel.findOne(filter),
                async create() { throw creationFailure; },
            },
        });
        await assert.rejects(failingUserService.createAdmin(INPUT), error => error === creationFailure);
        const reserved = await beforeUser.SetupStateModel.findById(STATE_ID).lean();
        assert.equal(reserved.status, STATUS.RESERVED);
        assert.equal(reserved.completedAt, null);
        assert.equal(await beforeUser.UserModel.countDocuments({}), 0);
        await assertBlocked(new InitialSetupService(beforeUser.dependencies));
        assert.deepEqual(await beforeUser.SetupStateModel.findById(STATE_ID).lean(), reserved);
        passed('falha antes da conta preserva reserva e impede nova tentativa');

        currentScenario = 'falha depois da conta e antes da conclusão';
        const afterUser = await installation('depois_conta');
        const completionFailure = new Error('Falha controlada de conclusão.');
        const failingCompletionService = new InitialSetupService({
            ...afterUser.dependencies,
            SetupStateModel: {
                findOne: filter => afterUser.SetupStateModel.findOne(filter),
                create: data => afterUser.SetupStateModel.create(data),
                async updateOne() { throw completionFailure; },
            },
        });
        await assert.rejects(failingCompletionService.createAdmin(INPUT), error => error === completionFailure);
        const pending = await afterUser.SetupStateModel.findById(STATE_ID).lean();
        const savedUser = await afterUser.UserModel.findOne({ role: 'admin' }).select('+passwordHash');
        assert.equal(pending.status, STATUS.RESERVED);
        assert.equal(pending.completedAt, null);
        assert.equal(pending.administratorId.toString(), savedUser._id.toString());
        assert.equal(await afterUser.passwordHasherService.compare(INPUT.password, savedUser.passwordHash), true);
        await assertBlocked(new InitialSetupService(afterUser.dependencies));
        assert.equal(await afterUser.UserModel.countDocuments({}), 1);
        passed('falha de conclusão preserva conta e reserva e não devolve falso sucesso');

        currentScenario = 'unicidade nativa da reserva';
        await assert.rejects(beforeUser.SetupStateModel.create({
            _id: STATE_ID,
            administratorId: new mongoose.Types.ObjectId(),
            status: STATUS.RESERVED,
        }), error => {
            assert.equal(error.code, 11000);
            assert.deepEqual(error.keyPattern, { _id: 1 });
            return true;
        });
        assert.equal(await beforeUser.SetupStateModel.countDocuments({}), 1);
        passed('índice nativo de _id recusa uma segunda reserva com autoIndex desativado');

        currentScenario = 'dois cadastros concorrentes';
        const concurrent = await installation('concorrente');
        let arrivals = 0;
        let release;
        let rejectBarrier;
        const barrier = new Promise((resolve, reject) => { release = resolve; rejectBarrier = reject; });
        const timeout = setTimeout(() => rejectBarrier(new Error('Cadastros não atingiram a barreira.')), 5000);
        const dependencies = {
            ...concurrent.dependencies,
            passwordHasherService: {
                async hash() {
                    arrivals += 1;
                    if (arrivals === 2) release();
                    await barrier;
                    return FAKE_HASH;
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
        assert.equal(arrivals, 2);
        assert.equal(accepted.length, 1);
        assert.equal(refused.length, 1);
        assert.equal(refused[0].reason.code, CODES.UNAVAILABLE);
        assert.equal(await concurrent.UserModel.countDocuments({}), 1);
        assert.equal(await concurrent.SetupStateModel.countDocuments({}), 1);
        const winner = await concurrent.UserModel.findOne({ role: 'admin' });
        const finalState = await concurrent.SetupStateModel.findById(STATE_ID);
        assert.equal(finalState.status, STATUS.COMPLETED);
        assert.equal(finalState.administratorId.toString(), winner._id.toString());
        passed('dois cadastros concorrentes persistem uma reserva e uma conta');

        currentScenario = 'recuperação de reserva sem conta';
        const missingAccountRecovery = new InitialSetupRecoveryService({
            UserModel: beforeUser.UserModel,
            SetupStateModel: beforeUser.SetupStateModel,
        });
        assert.deepEqual(await missingAccountRecovery.recover(), {
            status: RECOVERY_STATUS.NEEDS_REVIEW,
        });
        assert.deepEqual(await beforeUser.SetupStateModel.findById(STATE_ID).lean(), reserved);
        assert.equal(await beforeUser.UserModel.countDocuments({}), 0);
        await assertBlocked(new InitialSetupService(beforeUser.dependencies));
        passed('reserva sem conta exige verificação e permanece bloqueada sem alterações');

        currentScenario = 'recuperação com conta desativada';
        await afterUser.UserModel.updateOne({ _id: savedUser._id }, { $set: { active: false } });
        const accountBeforeRecovery = await afterUser.UserModel.findById(savedUser._id)
            .select('+passwordHash').lean();
        const existingAccountRecovery = new InitialSetupRecoveryService({
            UserModel: afterUser.UserModel,
            SetupStateModel: afterUser.SetupStateModel,
        });
        assert.deepEqual(await existingAccountRecovery.recover(), {
            status: RECOVERY_STATUS.COMPLETED,
        });
        const recoveredState = await afterUser.SetupStateModel.findById(STATE_ID).lean();
        assert.equal(recoveredState.status, STATUS.COMPLETED);
        assert.ok(recoveredState.completedAt instanceof Date);
        assert.equal(recoveredState.administratorId.toString(), savedUser._id.toString());
        assert.deepEqual(await afterUser.UserModel.findById(savedUser._id)
            .select('+passwordHash').lean(), accountBeforeRecovery);
        await assertBlocked(new InitialSetupService(afterUser.dependencies));
        passed('recuperação conclui reserva preservando integralmente a conta desativada');

        currentScenario = 'recuperação repetida e registro concluído sem usuário';
        assert.deepEqual(await existingAccountRecovery.recover(), {
            status: RECOVERY_STATUS.ALREADY_COMPLETED,
        });
        assert.deepEqual(await afterUser.SetupStateModel.findById(STATE_ID).lean(), recoveredState);
        assert.deepEqual(await new InitialSetupRecoveryService({
            UserModel: normal.UserModel, SetupStateModel: normal.SetupStateModel,
        }).recover(), { status: RECOVERY_STATUS.ALREADY_COMPLETED });
        assert.equal(await normal.UserModel.countDocuments({}), 0);
        assert.deepEqual(await normal.SetupStateModel.findById(STATE_ID).lean(), state);
        await assertBlocked(new InitialSetupService(normal.dependencies));
        passed('recuperação repetida ou sem usuário não altera conclusão nem libera cadastro');

        currentScenario = 'duas recuperações concorrentes';
        const recoveryRace = await installation('recuperacao_concorrente');
        const recoveryDependencies = {
            UserModel: recoveryRace.UserModel,
            SetupStateModel: recoveryRace.SetupStateModel,
        };
        assert.deepEqual(await new InitialSetupRecoveryService(recoveryDependencies).recover(), {
            status: RECOVERY_STATUS.NO_RECORD,
        });
        assert.equal(await recoveryRace.SetupStateModel.countDocuments({}), 0);
        const recoveryAdministratorId = new mongoose.Types.ObjectId();
        await recoveryRace.SetupStateModel.create({
            _id: STATE_ID, administratorId: recoveryAdministratorId,
            status: STATUS.RESERVED,
        });
        await recoveryRace.UserModel.create({
            _id: recoveryAdministratorId, name: 'Conta de Recuperação',
            email: 'recuperacao@example.com', passwordHash: FAKE_HASH,
            role: 'admin', active: true,
        });
        const raceUserBefore = await recoveryRace.UserModel.findById(recoveryAdministratorId)
            .select('+passwordHash').lean();
        let recoveryArrivals = 0;
        let releaseRecovery;
        let rejectRecovery;
        const recoveryBarrier = new Promise((resolve, reject) => {
            releaseRecovery = resolve; rejectRecovery = reject;
        });
        const recoveryTimeout = setTimeout(() => {
            rejectRecovery(new Error('Recuperações não atingiram a barreira.'));
        }, 5000);
        const controlledUserModel = {
            async findOne(filter) {
                const found = await recoveryRace.UserModel.findOne(filter);
                recoveryArrivals += 1;
                if (recoveryArrivals === 2) releaseRecovery();
                await recoveryBarrier;
                return found;
            },
        };
        let recoveryResults;
        try {
            const raceDependencies = { ...recoveryDependencies, UserModel: controlledUserModel };
            recoveryResults = await Promise.allSettled([
                new InitialSetupRecoveryService(raceDependencies).recover(),
                new InitialSetupRecoveryService(raceDependencies).recover(),
            ]);
        } finally {
            clearTimeout(recoveryTimeout);
        }
        for (const recoveryResult of recoveryResults) {
            if (recoveryResult.status === 'rejected') throw recoveryResult.reason;
        }
        assert.equal(recoveryArrivals, 2);
        assert.deepEqual(recoveryResults.map(item => item.value.status).sort(),
            [RECOVERY_STATUS.COMPLETED, RECOVERY_STATUS.ALREADY_COMPLETED].sort());
        const raceState = await recoveryRace.SetupStateModel.findById(STATE_ID);
        assert.equal(raceState.status, STATUS.COMPLETED);
        assert.equal(raceState.administratorId.toString(), recoveryAdministratorId.toString());
        assert.deepEqual(await recoveryRace.UserModel.findById(recoveryAdministratorId)
            .select('+passwordHash').lean(), raceUserBefore);
        assert.equal(await recoveryRace.SetupStateModel.countDocuments({}), 1);
        assert.equal(await recoveryRace.UserModel.countDocuments({}), 1);
        passed('duas recuperações concorrentes concluem uma vez e confirmam a mesma identidade');

    } catch (error) {
        console.error(`Falha no cenário: ${currentScenario}.`);
        throw error;
    } finally {
        const cleanupErrors = [];
        for (const { client, dbName } of connections) {
            try {
                if (client.connection.readyState === 1) {
                    // Confere o nome gerado antes de remover qualquer banco.
                    assert.equal(client.connection.name, dbName);
                    assert.ok(dbName.startsWith(`${PREFIX}${executionId}_`));
                    await client.connection.db.dropDatabase();
                    console.info(`Banco temporário removido: ${dbName}`);
                }
            } catch (error) {
                cleanupErrors.push(error);
                console.error(`Não foi possível remover o banco temporário: ${dbName}`);
            } finally {
                try { await client.disconnect(); }
                catch (error) { cleanupErrors.push(error); }
            }
        }
        if (cleanupErrors.length) {
            throw new AggregateError(cleanupErrors, 'Limpeza dos bancos temporários não concluída.');
        }
    }
    console.info(`Verificação concluída: ${scenarios} cenários aprovados.`);
}

main().catch(error => {
    console.error('Verificação interrompida.', {
        errorName: error.name,
        errorCode: error.code ?? null,
        message: error.message,
    });
    process.exitCode = 1;
});
