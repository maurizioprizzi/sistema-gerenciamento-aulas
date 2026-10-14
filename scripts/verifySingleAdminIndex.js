'use strict';

const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const mongoose = require('mongoose');

const {
    USER_ROLES,
    createUserModel,
} = require('../src/models/User');
const {
    ADMINISTRATIVE_INDEX_ERRORS,
    AdministrativeIndexInitializer,
} = require('../src/services/AdministrativeIndexInitializer');
const {
    AdminBootstrapper,
    ADMIN_BOOTSTRAP_STATUS,
} = require('../src/services/AdminBootstrapper');

/**
 * Verificação manual e reproduzível do índice administrativo no MongoDB real.
 *
 * Execute, a partir da raiz do projeto:
 *     node scripts/verifySingleAdminIndex.js
 *
 * Este script não carrega dotenv nem lê MONGODB_URI. O endereço é fixo e
 * local, e os bancos possuem nomes exclusivos gerados nesta execução.
 * Nenhum dado do banco normal da aplicação é utilizado.
 */
const LOCAL_MONGODB_URI = 'mongodb://127.0.0.1:27017';
const TEMPORARY_DATABASE_PREFIX = 'single_admin_check_';
const SINGLE_ADMIN_INDEX_NAME = 'users_single_admin_unique';

/**
 * Valor fictício com comprimento de hash bcrypt, aceito pelo modelo.
 *
 * Aqui verificamos persistência e unicidade, não autenticação. Nenhuma senha
 * real é recebida, e nenhum desses dados será utilizado pela aplicação.
 */
const TEST_PASSWORD_HASH = `$2b$12$${'a'.repeat(53)}`;

/**
 * Dados fictícios para uma conta administrativa.
 *
 * @param {string} email E-mail demonstrativo exclusivo do cenário.
 * @param {object} overrides Campos que serão substituídos no cenário.
 * @returns {object} Dados válidos para o modelo.
 */
function createAdministrativeData(email, overrides = {}) {
    return {
        name: 'Administrador de Teste',
        email,
        passwordHash: TEST_PASSWORD_HASH,
        role: USER_ROLES.ADMIN,
        active: true,
        ...overrides,
    };
}

/**
 * Confirma que o MongoDB recusou a gravação pelo índice de papel.
 *
 * O código 11000 também pode indicar e-mail duplicado. Conferir keyPattern
 * evita aceitar um conflito de outro índice como prova da nova restrição.
 *
 * @param {object} error Erro recebido durante a gravação.
 * @returns {true} Confirmação exigida por assert.rejects().
 */
function assertAdministrativeConflict(error) {
    assert.equal(error.code, 11000);
    assert.deepEqual(error.keyPattern, { role: 1 });

    return true;
}

/**
 * Executa os cenários em bancos descartáveis e encerra todas as conexões.
 *
 * autoIndex: false é proposital: demonstramos que a restrição depende de
 * criação explícita dos índices, como será necessário na instalação real.
 * O serviço utilizado pelo servidor realiza essa preparação antes da conta.
 *
 * @returns {Promise<void>}
 */
async function main() {
    const executionId = randomBytes(8).toString('hex');
    const temporaryConnections = [];
    let completedScenarios = 0;
    let currentScenario = 'conexão com o MongoDB local';

    /**
     * Cria um cliente Mongoose isolado e registra seu banco para limpeza.
     *
     * @param {string} suffix Identificação curta do cenário.
     * @returns {Promise<mongoose.Model>} Modelo ligado somente ao banco temporário.
     */
    async function createTemporaryUserModel(suffix) {
        const dbName = `${TEMPORARY_DATABASE_PREFIX}${executionId}_${suffix}`;
        const mongooseClient = new mongoose.Mongoose();

        temporaryConnections.push({ mongooseClient, dbName });

        await mongooseClient.connect(LOCAL_MONGODB_URI, {
            dbName,
            autoIndex: false,
            serverSelectionTimeoutMS: 5000,
            maxPoolSize: 2,
            minPoolSize: 0,
        });

        const UserModel = createUserModel(mongooseClient);

        await UserModel.createCollection();

        return UserModel;
    }

    /**
     * Registra um cenário somente depois que todas as suas asserções passam.
     *
     * @param {string} description Nome público do cenário validado.
     */
    function completeScenario(description) {
        completedScenarios += 1;
        console.info(`OK ${completedScenarios}: ${description}`);
    }

    try {
        currentScenario = 'criação explícita do índice no MongoDB';
        const UserModel = await createTemporaryUserModel('principal');

        const initializer = new AdministrativeIndexInitializer({ UserModel });
        await initializer.initialize();

        const indexes = await UserModel.collection.indexes();
        const administrativeIndex = indexes.find(
            (index) => index.name === SINGLE_ADMIN_INDEX_NAME,
        );

        assert.ok(administrativeIndex);
        assert.deepEqual(administrativeIndex.key, { role: 1 });
        assert.equal(administrativeIndex.unique, true);
        assert.deepEqual(
            administrativeIndex.partialFilterExpression,
            { role: USER_ROLES.ADMIN },
        );

        completeScenario('serviço cria o índice administrativo e configuração é confirmada no banco');

        currentScenario = 'recusa de um segundo administrador com outro e-mail';
        const originalUser = await UserModel.create(
            createAdministrativeData('primeiro@example.com'),
        );

        await assert.rejects(
            UserModel.create(
                createAdministrativeData('segundo@example.com'),
            ),
            assertAdministrativeConflict,
        );

        assert.equal(await UserModel.countDocuments({}), 1);

        const preservedUser = await UserModel.findById(originalUser._id)
            .select('+passwordHash');

        assert.ok(preservedUser);
        assert.equal(preservedUser.name, originalUser.name);
        assert.equal(preservedUser.email, originalUser.email);
        assert.equal(preservedUser.passwordHash, originalUser.passwordHash);
        assert.equal(preservedUser.active, true);

        completeScenario('segundo e-mail recusado e conta original preservada');

        currentScenario = 'preservação da restrição depois da desativação';

        await UserModel.updateOne(
            { _id: originalUser._id },
            { $set: { active: false } },
        );

        await assert.rejects(
            UserModel.create(
                createAdministrativeData('terceiro@example.com'),
            ),
            assertAdministrativeConflict,
        );

        assert.equal(await UserModel.countDocuments({}), 1);
        assert.equal(
            (await UserModel.findById(originalUser._id)).active,
            false,
        );

        completeScenario('conta desativada continua impedindo novo administrador');

        currentScenario = 'preparação repetida com uma conta desativada';
        // Remove apenas o índice administrativo do banco temporário para
        // confirmar que o serviço o recria, mesmo com uma conta inativa.
        await UserModel.collection.dropIndex(SINGLE_ADMIN_INDEX_NAME);
        await initializer.initialize();
        await initializer.initialize();
        const recreatedIndexes = await UserModel.collection.indexes();
        assert.ok(recreatedIndexes.some(index => index.name === SINGLE_ADMIN_INDEX_NAME));
        const inactiveUser = await UserModel.findById(originalUser._id)
            .select('+passwordHash');
        assert.ok(inactiveUser);
        assert.equal(inactiveUser.active, false);
        assert.equal(inactiveUser.email, originalUser.email);
        assert.equal(inactiveUser.passwordHash, originalUser.passwordHash);
        assert.equal(await UserModel.countDocuments({}), 1);
        await assert.rejects(
            UserModel.create(createAdministrativeData('apos-preparacao@example.com')),
            assertAdministrativeConflict,
        );
        completeScenario('serviço recria índices e permite repetição sem alterar a conta inativa');


        currentScenario = 'duas criações administrativas concorrentes';

        // A remoção abaixo afeta somente a coleção do banco temporário.
        await UserModel.deleteMany({});

        const concurrentResults = await Promise.allSettled([
            UserModel.create(
                createAdministrativeData('concorrente1@example.com'),
            ),
            UserModel.create(
                createAdministrativeData('concorrente2@example.com'),
            ),
        ]);

        const accepted = concurrentResults.filter(
            (result) => result.status === 'fulfilled',
        );
        const refused = concurrentResults.filter(
            (result) => result.status === 'rejected',
        );

        assert.equal(accepted.length, 1);
        assert.equal(refused.length, 1);
        assertAdministrativeConflict(refused[0].reason);
        assert.equal(await UserModel.countDocuments({ role: USER_ROLES.ADMIN }), 1);

        completeScenario('criações concorrentes resultam em apenas uma conta');

        currentScenario = 'independência entre duas instalações';
        const AnotherInstallation = await createTemporaryUserModel('outra');

        await new AdministrativeIndexInitializer({
            UserModel: AnotherInstallation,
        }).initialize();
        await AnotherInstallation.create(
            createAdministrativeData(accepted[0].value.email),
        );

        assert.equal(await UserModel.countDocuments({}), 1);
        assert.equal(await AnotherInstallation.countDocuments({}), 1);

        completeScenario('duas instalações mantêm contas independentes');

        currentScenario = 'banco anterior com dois administradores';
        const LegacyUserModel = await createTemporaryUserModel('legado');

        // Estes documentos fictícios representam um banco antes do novo índice.
        await LegacyUserModel.collection.insertMany([
            createAdministrativeData('legado1@example.com'),
            createAdministrativeData('legado2@example.com'),
        ]);

        await assert.rejects(
            LegacyUserModel.createIndexes(),
            (error) => error.code === 11000,
        );

        assert.equal(await LegacyUserModel.countDocuments({}), 2);

        const preservedEmails = (await LegacyUserModel.find({}).sort({ email: 1 }))
            .map((user) => user.email);

        assert.deepEqual(preservedEmails, [
            'legado1@example.com',
            'legado2@example.com',
        ]);

        completeScenario('banco com dois administradores recusa o índice sem excluir contas');

        currentScenario = 'diagnóstico do serviço para dois administradores existentes';
        await assert.rejects(
            new AdministrativeIndexInitializer({ UserModel: LegacyUserModel }).initialize(),
            { message: ADMINISTRATIVE_INDEX_ERRORS.MULTIPLE_ADMINS },
        );
        assert.equal(await LegacyUserModel.countDocuments({}), 2);
        const legacyAfterPreparation = (await LegacyUserModel.find({}).sort({ email: 1 }))
            .map(user => user.email);
        assert.deepEqual(legacyAfterPreparation, preservedEmails);
        completeScenario('serviço recusa múltiplos administradores com mensagem clara e preserva contas');

        currentScenario = 'preservação da conta ativa com nova configuração';
        const beforeBootstrap = await UserModel.findOne({ role: USER_ROLES.ADMIN })
            .select('+passwordHash').lean();
        assert.ok(beforeBootstrap);
        const changedConfiguration = {
            name: 'Outro Nome de Teste',
            email: 'configuracao-alterada@example.com',
            password: 'outra-senha-ficticia-de-teste',
        };
        const preservingBootstrapper = new AdminBootstrapper({
            UserModel,
            passwordHasherService: {
                async hash() {
                    assert.fail('Não deve gerar hash para uma conta existente.');
                },
            },
            logger: { info() {} },
        });
        const preservedActiveResult = await preservingBootstrapper.ensureAdmin(changedConfiguration);
        assert.equal(preservedActiveResult.status, ADMIN_BOOTSTRAP_STATUS.ALREADY_EXISTS);
        assert.deepEqual(
            await UserModel.findOne({ role: USER_ROLES.ADMIN }).select('+passwordHash').lean(),
            beforeBootstrap,
        );
        assert.equal(await UserModel.countDocuments({}), 1);
        completeScenario('nova configuração preserva integralmente a conta ativa sem gerar hash');

        currentScenario = 'preservação da conta desativada com nova configuração';
        await UserModel.updateOne({ _id: beforeBootstrap._id }, { $set: { active: false } });
        const beforeInactiveBootstrap = await UserModel.findById(beforeBootstrap._id)
            .select('+passwordHash').lean();
        const preservedInactiveResult = await preservingBootstrapper.ensureAdmin(changedConfiguration);
        assert.equal(preservedInactiveResult.status, ADMIN_BOOTSTRAP_STATUS.ALREADY_EXISTS);
        assert.deepEqual(
            await UserModel.findById(beforeBootstrap._id).select('+passwordHash').lean(),
            beforeInactiveBootstrap,
        );
        assert.equal(await UserModel.countDocuments({}), 1);
        completeScenario('nova configuração preserva a conta desativada sem reativar ou substituir dados');

        currentScenario = 'duas inicializações administrativas com e-mails diferentes';
        // Somente a coleção temporária é esvaziada para exercitar a corrida.
        await UserModel.deleteMany({});
        let hashArrivals = 0;
        let releaseHashes;
        let rejectHashes;
        const bothReachedHash = new Promise((resolve, reject) => {
            releaseHashes = resolve;
            rejectHashes = reject;
        });
        const barrierTimeout = setTimeout(() => {
            rejectHashes(new Error('As duas inicializações não chegaram ao hashing no prazo.'));
        }, 5000);
        const concurrentBootstrapper = new AdminBootstrapper({
            UserModel,
            passwordHasherService: {
                async hash() {
                    // Duas consultas vazias devem terminar antes das gravações.
                    hashArrivals += 1;
                    if (hashArrivals === 2) releaseHashes();
                    await bothReachedHash;
                    return TEST_PASSWORD_HASH;
                },
            },
            logger: { info() {} },
        });
        let bootstrapResults;
        try {
            bootstrapResults = await Promise.allSettled([
                concurrentBootstrapper.ensureAdmin({
                    name: 'Primeira Instância', email: 'instancia1@example.com',
                    password: 'senha-ficticia-instancia1',
                }),
                concurrentBootstrapper.ensureAdmin({
                    name: 'Segunda Instância', email: 'instancia2@example.com',
                    password: 'senha-ficticia-instancia2',
                }),
            ]);
        } finally {
            clearTimeout(barrierTimeout);
        }
        assert.equal(hashArrivals, 2);
        for (const result of bootstrapResults) {
            if (result.status === 'rejected') throw result.reason;
        }
        assert.deepEqual(
            bootstrapResults.map(result => result.value.status).sort(),
            [ADMIN_BOOTSTRAP_STATUS.ALREADY_EXISTS, ADMIN_BOOTSTRAP_STATUS.CREATED].sort(),
        );
        assert.equal(await UserModel.countDocuments({ role: USER_ROLES.ADMIN }), 1);
        completeScenario('inicializações concorrentes criam uma conta e reconhecem a vencedora');


    } catch (error) {
        console.error(`Falha no cenário: ${currentScenario}.`);
        throw error;
    } finally {
        const cleanupErrors = [];

        for (const { mongooseClient, dbName } of temporaryConnections) {
            try {
                if (mongooseClient.connection.readyState === 1) {
                    // A limpeza exige exatamente o nome gerado para esta conexão.
                    assert.equal(mongooseClient.connection.name, dbName);
                    assert.ok(dbName.startsWith(
                        `${TEMPORARY_DATABASE_PREFIX}${executionId}_`,
                    ));

                    await mongooseClient.connection.db.dropDatabase();
                    console.info(`Banco temporário removido: ${dbName}`);
                }
            } catch (error) {
                cleanupErrors.push(error);
                console.error(`Não foi possível remover o banco temporário: ${dbName}`);
            } finally {
                try {
                    await mongooseClient.disconnect();
                } catch (error) {
                    cleanupErrors.push(error);
                }
            }
        }

        if (cleanupErrors.length > 0) {
            throw new AggregateError(
                cleanupErrors,
                'A limpeza dos bancos temporários não foi concluída.',
            );
        }
    }

    console.info(`Verificação concluída: ${completedScenarios} cenários aprovados.`);
}

main().catch((error) => {
    console.error('Verificação interrompida.', {
        errorName: error.name,
        errorCode: error.code ?? null,
        message: error.message,
    });

    process.exitCode = 1;
});
