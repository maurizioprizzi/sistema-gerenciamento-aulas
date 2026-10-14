'use strict';

const assert = require('node:assert/strict');
const { describe, test } = require('node:test');

const {
    ADMIN_BOOTSTRAP_ERRORS,
    ADMIN_BOOTSTRAP_STATUS,
    AdminBootstrapper,
} = require('../src/services/AdminBootstrapper');

const { USER_ROLES } = require('../src/models/User');

/**
 * Dados fictícios utilizados em todos os testes.
 *
 * Nenhuma credencial real deve ser utilizada em testes automatizados.
 */
const VALID_ADMIN_CONFIGURATION = Object.freeze({
    name: 'Administrador de Teste',
    email: 'ADMIN@EXAMPLE.COM',
    password: 'senha-ficticia-de-teste',
});

/**
 * Cria um modelo de usuário controlado.
 *
 * findResults permite determinar o resultado de cada consulta. Isso é
 * especialmente útil para simular uma corrida:
 *
 * 1. primeira consulta não encontra o usuário;
 * 2. criação recebe conflito de unicidade;
 * 3. segunda consulta encontra o usuário criado por outra instância.
 *
 * @param {object} options Comportamento desejado.
 * @returns {{ UserModel: object, calls: object }}
 */
function createFakeUserModel({
    findResults = [null],
    findError = null,
    createResult = { id: 'usuario-criado' },
    createError = null,
} = {}) {
    const calls = {
        findOne: [],
        create: [],
    };

    let findIndex = 0;

    const UserModel = {
        async findOne(filter) {
            calls.findOne.push(filter);

            if (findError) {
                throw findError;
            }

            const resultIndex = Math.min(
                findIndex,
                findResults.length - 1,
            );

            findIndex += 1;

            return findResults[resultIndex];
        },

        async create(data) {
            calls.create.push(data);

            if (createError) {
                throw createError;
            }

            return createResult;
        },
    };

    return {
        UserModel,
        calls,
    };
}

/**
 * Cria um serviço de hashing controlado.
 *
 * @param {object} options Comportamento desejado.
 * @returns {{ passwordHasherService: object, calls: object }}
 */
function createFakePasswordHasher({
    hashResult = '$2b$12$hash-controlado-para-os-testes',
    hashError = null,
} = {}) {
    const calls = {
        hash: [],
    };

    const passwordHasherService = {
        async hash(password) {
            calls.hash.push(password);

            if (hashError) {
                throw hashError;
            }

            return hashResult;
        },
    };

    return {
        passwordHasherService,
        calls,
    };
}

/**
 * Cria um logger que registra somente as mensagens recebidas.
 *
 * @returns {{ logger: object, messages: string[] }}
 */
function createFakeLogger() {
    const messages = [];

    return {
        logger: {
            info(message) {
                messages.push(message);
            },
        },
        messages,
    };
}

/**
 * Monta o serviço com dependências controladas.
 *
 * @param {object} options Comportamentos das dependências.
 * @returns {object} Serviço, dependências e chamadas registradas.
 */
function createTestContext({
    userModelOptions,
    passwordHasherOptions,
} = {}) {
    const userModelContext =
        createFakeUserModel(userModelOptions);

    const passwordHasherContext =
        createFakePasswordHasher(passwordHasherOptions);

    const loggerContext = createFakeLogger();

    const service = new AdminBootstrapper({
        UserModel: userModelContext.UserModel,
        passwordHasherService:
            passwordHasherContext.passwordHasherService,
        logger: loggerContext.logger,
    });

    return {
        service,
        userModelCalls: userModelContext.calls,
        passwordHasherCalls: passwordHasherContext.calls,
        logMessages: loggerContext.messages,
    };
}

describe('configuração do AdminBootstrapper', () => {
    test('permite construir o serviço com as dependências padrão', () => {
        assert.doesNotThrow(
            () => new AdminBootstrapper(),
        );
    });

    for (const invalidModelCase of [
        {
            description: 'modelo ausente',
            value: null,
        },
        {
            description: 'modelo sem findOne',
            value: {
                create() {},
            },
        },
        {
            description: 'modelo sem create',
            value: {
                findOne() {},
            },
        },
    ]) {
        test(`rejeita ${invalidModelCase.description}`, () => {
            const { passwordHasherService } =
                createFakePasswordHasher();

            const { logger } = createFakeLogger();

            assert.throws(
                () => new AdminBootstrapper({
                    UserModel: invalidModelCase.value,
                    passwordHasherService,
                    logger,
                }),
                {
                    name: 'TypeError',
                    message:
                        ADMIN_BOOTSTRAP_ERRORS.INVALID_USER_MODEL,
                },
            );
        });
    }

    for (const invalidHasherCase of [
        {
            description: 'serviço de hashing ausente',
            value: null,
        },
        {
            description: 'serviço de hashing vazio',
            value: {},
        },
        {
            description: 'serviço sem função hash',
            value: {
                hash: 'não-é-uma-função',
            },
        },
    ]) {
        test(`rejeita ${invalidHasherCase.description}`, () => {
            const { UserModel } = createFakeUserModel();
            const { logger } = createFakeLogger();

            assert.throws(
                () => new AdminBootstrapper({
                    UserModel,
                    passwordHasherService:
                        invalidHasherCase.value,
                    logger,
                }),
                {
                    name: 'TypeError',
                    message:
                        ADMIN_BOOTSTRAP_ERRORS
                            .INVALID_PASSWORD_HASHER,
                },
            );
        });
    }

    for (const invalidLoggerCase of [
        {
            description: 'logger ausente',
            value: null,
        },
        {
            description: 'logger vazio',
            value: {},
        },
        {
            description: 'logger sem função info',
            value: {
                info: 'não-é-uma-função',
            },
        },
    ]) {
        test(`rejeita ${invalidLoggerCase.description}`, () => {
            const { UserModel } = createFakeUserModel();

            const { passwordHasherService } =
                createFakePasswordHasher();

            assert.throws(
                () => new AdminBootstrapper({
                    UserModel,
                    passwordHasherService,
                    logger: invalidLoggerCase.value,
                }),
                {
                    name: 'TypeError',
                    message:
                        ADMIN_BOOTSTRAP_ERRORS.INVALID_LOGGER,
                },
            );
        });
    }

    test('mantém códigos e mensagens protegidos contra alterações', () => {
        assert.equal(
            Object.isFrozen(ADMIN_BOOTSTRAP_ERRORS),
            true,
        );

        assert.equal(
            Object.isFrozen(ADMIN_BOOTSTRAP_STATUS),
            true,
        );
    });
});

describe('validação da configuração administrativa', () => {
    const invalidConfigurations = [
        {
            description: 'configuração ausente',
            value: undefined,
        },
        {
            description: 'configuração nula',
            value: null,
        },
        {
            description: 'configuração em formato de lista',
            value: [],
        },
        {
            description: 'configuração vazia',
            value: {},
        },
        {
            description: 'nome ausente',
            value: {
                email: 'admin@example.com',
                password: 'senha-ficticia',
            },
        },
        {
            description: 'nome formado somente por espaços',
            value: {
                name: '   ',
                email: 'admin@example.com',
                password: 'senha-ficticia',
            },
        },
        {
            description: 'e-mail ausente',
            value: {
                name: 'Administrador',
                password: 'senha-ficticia',
            },
        },
        {
            description: 'e-mail formado somente por espaços',
            value: {
                name: 'Administrador',
                email: '   ',
                password: 'senha-ficticia',
            },
        },
        {
            description: 'senha ausente',
            value: {
                name: 'Administrador',
                email: 'admin@example.com',
            },
        },
        {
            description: 'senha vazia',
            value: {
                name: 'Administrador',
                email: 'admin@example.com',
                password: '',
            },
        },
    ];

    for (const invalidCase of invalidConfigurations) {
        test(`rejeita ${invalidCase.description}`, async () => {
            const context = createTestContext();

            await assert.rejects(
                context.service.ensureAdmin(invalidCase.value),
                {
                    name: 'TypeError',
                    message:
                        ADMIN_BOOTSTRAP_ERRORS
                            .INVALID_CONFIGURATION,
                },
            );

            assert.equal(
                context.userModelCalls.findOne.length,
                0,
            );

            assert.equal(
                context.passwordHasherCalls.hash.length,
                0,
            );

            assert.equal(
                context.userModelCalls.create.length,
                0,
            );
        });
    }
});

describe('inicialização da conta administrativa', () => {
    test('não altera uma conta que já existe', async () => {
        const existingUser = {
            id: 'usuario-existente',
        };

        const context = createTestContext({
            userModelOptions: {
                findResults: [existingUser],
            },
        });

        const result = await context.service.ensureAdmin(
            VALID_ADMIN_CONFIGURATION,
        );

        assert.deepEqual(
            context.userModelCalls.findOne,
            [
                {
                    role: USER_ROLES.ADMIN,
                },
            ],
        );

        assert.equal(
            context.passwordHasherCalls.hash.length,
            0,
        );

        assert.equal(
            context.userModelCalls.create.length,
            0,
        );

        assert.deepEqual(result, {
            status: ADMIN_BOOTSTRAP_STATUS.ALREADY_EXISTS,
            created: false,
        });

        assert.equal(Object.isFrozen(result), true);
    });

    test('não registra dados confidenciais de uma conta existente', async () => {
        const context = createTestContext({
            userModelOptions: {
                findResults: [{ id: 'usuario-existente' }],
            },
        });

        await context.service.ensureAdmin(
            VALID_ADMIN_CONFIGURATION,
        );

        const serializedLogs =
            JSON.stringify(context.logMessages);

        assert.equal(
            serializedLogs.includes(
                VALID_ADMIN_CONFIGURATION.name,
            ),
            false,
        );

        assert.equal(
            serializedLogs.includes(
                VALID_ADMIN_CONFIGURATION.email,
            ),
            false,
        );

        assert.equal(
            serializedLogs.includes(
                VALID_ADMIN_CONFIGURATION.password,
            ),
            false,
        );
    });

    test('cria a conta quando ela ainda não existe', async () => {
        const passwordHash =
            '$2b$12$hash-ficticio-produzido-pelo-servico';

        const context = createTestContext({
            userModelOptions: {
                findResults: [null],
            },
            passwordHasherOptions: {
                hashResult: passwordHash,
            },
        });

        const result = await context.service.ensureAdmin(
            VALID_ADMIN_CONFIGURATION,
        );

        assert.deepEqual(
            context.passwordHasherCalls.hash,
            [VALID_ADMIN_CONFIGURATION.password],
        );

        assert.deepEqual(
            context.userModelCalls.create,
            [
                {
                    name: VALID_ADMIN_CONFIGURATION.name,
                    email: 'admin@example.com',
                    passwordHash,
                    role: USER_ROLES.ADMIN,
                    active: true,
                },
            ],
        );

        assert.deepEqual(result, {
            status: ADMIN_BOOTSTRAP_STATUS.CREATED,
            created: true,
        });

        assert.equal(Object.isFrozen(result), true);
        assert.deepEqual(
            Object.keys(result).sort(),
            ['created', 'status'],
        );
    });

    test('não registra senha ou hash durante a criação', async () => {
        const passwordHash =
            '$2b$12$hash-confidencial-do-teste';

        const context = createTestContext({
            passwordHasherOptions: {
                hashResult: passwordHash,
            },
        });

        await context.service.ensureAdmin(
            VALID_ADMIN_CONFIGURATION,
        );

        const serializedLogs =
            JSON.stringify(context.logMessages);

        assert.equal(
            serializedLogs.includes(
                VALID_ADMIN_CONFIGURATION.password,
            ),
            false,
        );

        assert.equal(
            serializedLogs.includes(passwordHash),
            false,
        );
    });

    test('propaga falha ocorrida na consulta inicial', async () => {
        const databaseError = new Error(
            'Falha controlada de consulta.',
        );

        const context = createTestContext({
            userModelOptions: {
                findError: databaseError,
            },
        });

        await assert.rejects(
            context.service.ensureAdmin(
                VALID_ADMIN_CONFIGURATION,
            ),
            (error) => {
                assert.strictEqual(error, databaseError);

                return true;
            },
        );

        assert.equal(
            context.passwordHasherCalls.hash.length,
            0,
        );

        assert.equal(
            context.userModelCalls.create.length,
            0,
        );
    });

    test('propaga falha ocorrida durante o hashing', async () => {
        const hashError = new Error(
            'Falha controlada de hashing.',
        );

        const context = createTestContext({
            passwordHasherOptions: {
                hashError,
            },
        });

        await assert.rejects(
            context.service.ensureAdmin(
                VALID_ADMIN_CONFIGURATION,
            ),
            (error) => {
                assert.strictEqual(error, hashError);

                return true;
            },
        );

        assert.equal(
            context.userModelCalls.create.length,
            0,
        );
    });

    test('propaga um erro comum ocorrido durante a criação', async () => {
        const creationError = new Error(
            'Falha controlada de criação.',
        );

        const context = createTestContext({
            userModelOptions: {
                createError: creationError,
            },
        });

        await assert.rejects(
            context.service.ensureAdmin(
                VALID_ADMIN_CONFIGURATION,
            ),
            (error) => {
                assert.strictEqual(error, creationError);

                return true;
            },
        );

        assert.equal(
            context.userModelCalls.findOne.length,
            1,
        );
    });
});

describe('conflitos de unicidade durante a inicialização', () => {
    test('reconhece conflitos de e-mail pelo keyPattern', () => {
        assert.equal(
            AdminBootstrapper.isDuplicateEmailError({
                code: 11000,
                keyPattern: {
                    email: 1,
                },
            }),
            true,
        );
    });

    test('reconhece conflitos de e-mail pelo keyValue', () => {
        assert.equal(
            AdminBootstrapper.isDuplicateEmailError({
                code: 11000,
                keyValue: {
                    email: 'admin@example.com',
                },
            }),
            true,
        );
    });

    test('não confunde outro índice único com o e-mail', () => {
        assert.equal(
            AdminBootstrapper.isDuplicateEmailError({
                code: 11000,
                keyPattern: {
                    externalId: 1,
                },
            }),
            false,
        );
    });

    test('não confunde um erro comum com conflito de unicidade', () => {
        assert.equal(
            AdminBootstrapper.isDuplicateEmailError(
                new Error('Falha comum.'),
            ),
            false,
        );
    });

    test('aceita a conta criada simultaneamente por outra instância', async () => {
        const duplicateEmailError = Object.assign(
            new Error('Conflito controlado.'),
            {
                code: 11000,
                keyPattern: {
                    email: 1,
                },
            },
        );

        const context = createTestContext({
            userModelOptions: {
                findResults: [
                    null,
                    {
                        id: 'usuario-criado-concorrentemente',
                    },
                ],
                createError: duplicateEmailError,
            },
        });

        const result = await context.service.ensureAdmin(
            VALID_ADMIN_CONFIGURATION,
        );

        assert.equal(
            context.userModelCalls.findOne.length,
            2,
        );

        assert.deepEqual(result, {
            status: ADMIN_BOOTSTRAP_STATUS.ALREADY_EXISTS,
            created: false,
        });
    });

    test('propaga conflito quando a conta não aparece na segunda consulta', async () => {
        const duplicateEmailError = Object.assign(
            new Error('Conflito sem usuário correspondente.'),
            {
                code: 11000,
                keyValue: {
                    email: 'admin@example.com',
                },
            },
        );

        const context = createTestContext({
            userModelOptions: {
                findResults: [
                    null,
                    null,
                ],
                createError: duplicateEmailError,
            },
        });

        await assert.rejects(
            context.service.ensureAdmin(
                VALID_ADMIN_CONFIGURATION,
            ),
            (error) => {
                assert.strictEqual(
                    error,
                    duplicateEmailError,
                );

                return true;
            },
        );

        assert.equal(
            context.userModelCalls.findOne.length,
            2,
        );
    });

    test('propaga conflito pertencente a outro campo', async () => {
        const otherDuplicateError = Object.assign(
            new Error('Outro campo duplicado.'),
            {
                code: 11000,
                keyPattern: {
                    externalId: 1,
                },
            },
        );

        const context = createTestContext({
            userModelOptions: {
                createError: otherDuplicateError,
            },
        });

        await assert.rejects(
            context.service.ensureAdmin(
                VALID_ADMIN_CONFIGURATION,
            ),
            (error) => {
                assert.strictEqual(
                    error,
                    otherDuplicateError,
                );

                return true;
            },
        );

        /**
         * Não deve realizar a segunda consulta, pois o conflito não pertence
         * aos índices de e-mail ou papel administrativo.
         */
        assert.equal(
            context.userModelCalls.findOne.length,
            1,
        );
    });
});

/**
 * Cada instalação preserva sua conta mesmo quando a configuração muda.
 * Os objetos congelados também tornam uma mutação indevida observável.
 */
describe('preservação do administrador por instalação', () => {
    for (const active of [true, false]) {
        test(`preserva conta ${active ? 'ativa' : 'desativada'} com outro e-mail`, async () => {
            const existingUser = Object.freeze({
                id: 'administrador-original',
                name: 'Nome Original',
                email: 'original@example.com',
                passwordHash: 'hash-original-preservado',
                role: USER_ROLES.ADMIN,
                active,
            });
            const context = createTestContext({
                userModelOptions: { findResults: [existingUser] },
            });
            const configuration = Object.freeze({
                name: 'Nome Novo',
                email: 'novo@example.com',
                password: 'outra-senha-ficticia',
            });

            const result = await context.service.ensureAdmin(configuration);
            assert.deepEqual(context.userModelCalls.findOne, [{ role: USER_ROLES.ADMIN }]);
            assert.deepEqual(context.passwordHasherCalls.hash, []);
            assert.deepEqual(context.userModelCalls.create, []);
            assert.deepEqual(result, {
                status: ADMIN_BOOTSTRAP_STATUS.ALREADY_EXISTS,
                created: false,
            });
            assert.equal(existingUser.email, 'original@example.com');
            assert.equal(existingUser.passwordHash, 'hash-original-preservado');
            assert.equal(existingUser.active, active);
            assert.equal(existingUser.name, 'Nome Original');
            assert.equal(Object.isFrozen(result), true);
            const logs = JSON.stringify(context.logMessages);
            for (const value of [existingUser.email, existingUser.passwordHash, configuration.password]) {
                assert.equal(logs.includes(value), false);
            }
        });
    }

    test('reconhece conflito administrativo pelo keyPattern', () => {
        assert.equal(AdminBootstrapper.isDuplicateAdminError({
            code: 11000, keyPattern: { role: 1 },
        }), true);
    });

    test('reconhece conflito administrativo pelo keyValue', () => {
        assert.equal(AdminBootstrapper.isDuplicateAdminError({
            code: 11000, keyValue: { role: USER_ROLES.ADMIN },
        }), true);
    });

    test('não confunde outros erros ou valores de papel com conflito administrativo', () => {
        for (const error of [
            null, undefined, new Error('Falha comum.'),
            { code: 13, keyPattern: { role: 1 } },
            { code: 11000, keyPattern: { email: 1 } },
            { code: 11000, keyValue: { role: 'outro-papel' } },
            { code: 11000 },
        ]) {
            assert.equal(AdminBootstrapper.isDuplicateAdminError(error), false);
        }
    });

    test('aceita administrador concorrente com e-mail diferente', async () => {
        const existingUser = Object.freeze({
            email: 'concorrente@example.com', role: USER_ROLES.ADMIN, active: false,
        });
        const context = createTestContext({
            userModelOptions: {
                findResults: [null, existingUser],
                createError: Object.assign(new Error('Conflito de papel.'), {
                    code: 11000, keyPattern: { role: 1 },
                }),
            },
        });

        const result = await context.service.ensureAdmin(VALID_ADMIN_CONFIGURATION);
        assert.deepEqual(context.userModelCalls.findOne, [
            { role: USER_ROLES.ADMIN }, { role: USER_ROLES.ADMIN },
        ]);
        assert.equal(context.userModelCalls.create.length, 1);
        assert.equal(result.status, ADMIN_BOOTSTRAP_STATUS.ALREADY_EXISTS);
        assert.equal(result.created, false);
        assert.equal(existingUser.email, 'concorrente@example.com');
        assert.equal(existingUser.active, false);
    });

    test('propaga conflito de papel se não encontrar administrador após a criação', async () => {
        const expectedError = Object.assign(new Error('Conflito sem administrador.'), {
            code: 11000, keyValue: { role: USER_ROLES.ADMIN },
        });
        const context = createTestContext({
            userModelOptions: {
                findResults: [null, null], createError: expectedError,
            },
        });
        await assert.rejects(
            context.service.ensureAdmin(VALID_ADMIN_CONFIGURATION),
            error => error === expectedError,
        );
        assert.deepEqual(context.userModelCalls.findOne, [
            { role: USER_ROLES.ADMIN }, { role: USER_ROLES.ADMIN },
        ]);
    });

    test('propaga falha da segunda consulta após conflito administrativo', async () => {
        const expectedError = new Error('Consulta de recuperação indisponível.');
        let queries = 0;
        const { passwordHasherService } = createFakePasswordHasher();
        const { logger } = createFakeLogger();
        const service = new AdminBootstrapper({
            UserModel: {
                async findOne(filter) {
                    assert.deepEqual(filter, { role: USER_ROLES.ADMIN });
                    queries += 1;
                    if (queries === 2) throw expectedError;
                    return null;
                },
                async create() {
                    throw Object.assign(new Error('Conflito de papel.'), {
                        code: 11000, keyPattern: { role: 1 },
                    });
                },
            },
            passwordHasherService,
            logger,
        });
        await assert.rejects(
            service.ensureAdmin(VALID_ADMIN_CONFIGURATION),
            error => error === expectedError,
        );
        assert.equal(queries, 2);
    });
});
