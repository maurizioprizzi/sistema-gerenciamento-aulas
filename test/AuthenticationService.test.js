'use strict';

const assert = require('node:assert/strict');
const {
    describe,
    test,
} = require('node:test');

const { AppError } = require('../src/errors/AppError');
const {
    AUTHENTICATION_CODES,
    AUTHENTICATION_MESSAGES,
    DEFAULT_DUMMY_PASSWORD_HASH,
    MAX_EMAIL_LENGTH,
    MAX_PASSWORD_BYTES,
    AuthenticationService,
} = require('../src/services/AuthenticationService');

/**
 * Credenciais fictícias utilizadas exclusivamente nos testes.
 */
const VALID_CREDENTIALS = Object.freeze({
    email: 'ADMIN@EXAMPLE.COM',
    password: 'senha-de-teste-segura',
});

/**
 * Hash fictício. Os testes deste arquivo utilizam um comparador controlado,
 * portanto não precisam executar bcrypt nem acessar credenciais reais.
 */
const STORED_PASSWORD_HASH = 'hash-armazenado-para-teste';

/**
 * Cria um documento de usuário semelhante ao retornado pelo Mongoose.
 *
 * @param {object} overrides Campos que serão substituídos.
 * @returns {object} Usuário de teste.
 */
function createUser(overrides = {}) {
    return {
        _id: 'usuario-123',
        name: 'Administrador de Teste',
        email: 'admin@example.com',
        passwordHash: STORED_PASSWORD_HASH,
        role: 'admin',
        active: true,
        lastLoginAt: null,
        ...overrides,
    };
}

/**
 * Cria um modelo Mongoose controlado.
 *
 * A consulta registra o filtro e a seleção recebidos. O objeto retornado por
 * select() é uma Promise, reproduzindo o comportamento aguardável das queries
 * do Mongoose sem abrir conexão com o MongoDB.
 *
 * @param {object} options Comportamento da consulta.
 * @param {object|null} options.user Usuário que será retornado.
 * @param {Error|null} options.findOneError Falha síncrona opcional.
 * @param {Error|null} options.queryError Falha assíncrona opcional.
 * @returns {{ UserModel: object, calls: object }} Modelo e chamadas registradas.
 */
function createFakeUserModel({
    user = createUser(),
    findOneError = null,
    queryError = null,
} = {}) {
    const calls = {
        findOne: [],
        select: [],
    };

    const UserModel = {
        findOne(filter) {
            calls.findOne.push(filter);

            if (findOneError) {
                throw findOneError;
            }

            return {
                select(selection) {
                    calls.select.push(selection);

                    if (queryError) {
                        return Promise.reject(queryError);
                    }

                    return Promise.resolve(user);
                },
            };
        },
    };

    return {
        UserModel,
        calls,
    };
}

/**
 * Cria um comparador de senhas controlado.
 *
 * @param {object} options Comportamento da comparação.
 * @param {boolean} options.matches Resultado devolvido por compare().
 * @param {Error|null} options.error Falha opcional da comparação.
 * @returns {{ passwordHasherService: object, calls: object }}
 */
function createFakePasswordHasher({
    matches = true,
    error = null,
} = {}) {
    const calls = {
        compare: [],
    };

    const passwordHasherService = {
        async compare(password, passwordHash) {
            calls.compare.push({
                password,
                passwordHash,
            });

            if (error) {
                throw error;
            }

            return matches;
        },
    };

    return {
        passwordHasherService,
        calls,
    };
}

/**
 * Confirma que uma operação foi recusada com o erro público genérico.
 *
 * @param {Promise<unknown>} operation Operação de autenticação.
 * @returns {Promise<void>}
 */
async function assertInvalidCredentials(operation) {
    await assert.rejects(
        operation,
        (error) => {
            assert.equal(error instanceof AppError, true);
            assert.equal(error.statusCode, 401);
            assert.equal(
                error.code,
                AUTHENTICATION_CODES.INVALID_CREDENTIALS,
            );
            assert.equal(
                error.message,
                AUTHENTICATION_MESSAGES.INVALID_CREDENTIALS,
            );
            assert.equal(error.isOperational, true);

            return true;
        },
    );
}

describe('configuração do AuthenticationService', () => {
    test('expõe constantes de autenticação seguras', () => {
        assert.equal(
            AUTHENTICATION_CODES.INVALID_CREDENTIALS,
            'INVALID_CREDENTIALS',
        );
        assert.equal(
            AUTHENTICATION_MESSAGES.INVALID_CREDENTIALS,
            'E-mail ou senha inválidos.',
        );
        assert.equal(DEFAULT_DUMMY_PASSWORD_HASH.length, 60);
        assert.match(
            DEFAULT_DUMMY_PASSWORD_HASH,
            /^\$2[aby]\$12\$/,
        );
        assert.equal(MAX_EMAIL_LENGTH, 254);
        assert.equal(MAX_PASSWORD_BYTES, 72);
    });

    test('protege códigos e mensagens contra alterações', () => {
        assert.equal(
            Object.isFrozen(AUTHENTICATION_CODES),
            true,
        );
        assert.equal(
            Object.isFrozen(AUTHENTICATION_MESSAGES),
            true,
        );
    });

    test('permite construir o serviço com dependências padrão', () => {
        const service = new AuthenticationService();

        assert.equal(typeof service.authenticate, 'function');
    });

    test('rejeita modelos de usuário inválidos', () => {
        const invalidModels = [
            null,
            false,
            {},
            { findOne: 'não é função' },
        ];

        for (const UserModel of invalidModels) {
            assert.throws(
                () => new AuthenticationService({ UserModel }),
                {
                    name: 'TypeError',
                    message:
                        AUTHENTICATION_MESSAGES.INVALID_USER_MODEL,
                },
            );
        }
    });

    test('rejeita comparadores de senha inválidos', () => {
        const invalidHashers = [
            null,
            false,
            {},
            { compare: 'não é função' },
        ];

        for (const passwordHasherService of invalidHashers) {
            assert.throws(
                () => new AuthenticationService({
                    passwordHasherService,
                }),
                {
                    name: 'TypeError',
                    message:
                        AUTHENTICATION_MESSAGES
                            .INVALID_PASSWORD_HASHER,
                },
            );
        }
    });

    test('rejeita hashes substitutos inválidos', () => {
        const invalidHashes = [
            null,
            '',
            42,
            {},
            [],
        ];

        for (const dummyPasswordHash of invalidHashes) {
            assert.throws(
                () => new AuthenticationService({
                    dummyPasswordHash,
                }),
                {
                    name: 'TypeError',
                    message:
                        AUTHENTICATION_MESSAGES.INVALID_DUMMY_HASH,
                },
            );
        }
    });
});

describe('preparação das credenciais', () => {
    test('normaliza o e-mail antes da autenticação', () => {
        const result = AuthenticationService.prepareCredentials({
            email: '  ADMIN@EXAMPLE.COM  ',
            password: VALID_CREDENTIALS.password,
        });

        assert.deepEqual(result, {
            email: 'admin@example.com',
            password: VALID_CREDENTIALS.password,
        });
        assert.equal(Object.isFrozen(result), true);
    });

    test('preserva espaços que pertencem à senha', () => {
        const password = '  senha com espaços  ';

        const result = AuthenticationService.prepareCredentials({
            email: VALID_CREDENTIALS.email,
            password,
        });

        assert.equal(result.password, password);
    });

    test('aceita uma senha com exatamente 72 bytes', () => {
        const password = 'a'.repeat(72);

        const result = AuthenticationService.prepareCredentials({
            email: VALID_CREDENTIALS.email,
            password,
        });

        assert.equal(result.password, password);
        assert.equal(
            Buffer.byteLength(result.password, 'utf8'),
            72,
        );
    });

    test('considera bytes UTF-8 ao aceitar o limite', () => {
        const password = '😀'.repeat(18);

        const result = AuthenticationService.prepareCredentials({
            email: VALID_CREDENTIALS.email,
            password,
        });

        assert.equal(
            Buffer.byteLength(result.password, 'utf8'),
            72,
        );
    });

    test('rejeita estruturas de credenciais inválidas', () => {
        const invalidCredentials = [
            undefined,
            null,
            [],
            'credenciais',
            42,
            {},
        ];

        for (const credentials of invalidCredentials) {
            assert.throws(
                () => AuthenticationService
                    .prepareCredentials(credentials),
                (error) => {
                    assert.equal(error instanceof AppError, true);
                    assert.equal(error.statusCode, 401);
                    assert.equal(
                        error.code,
                        AUTHENTICATION_CODES.INVALID_CREDENTIALS,
                    );

                    return true;
                },
            );
        }
    });

    test('rejeita endereços de e-mail inválidos', () => {
        const invalidEmails = [
            undefined,
            null,
            '',
            '   ',
            'email-invalido',
            42,
            `${'a'.repeat(250)}@example.com`,
        ];

        for (const email of invalidEmails) {
            assert.throws(
                () => AuthenticationService.prepareCredentials({
                    email,
                    password: VALID_CREDENTIALS.password,
                }),
                {
                    name: 'AppError',
                    message:
                        AUTHENTICATION_MESSAGES.INVALID_CREDENTIALS,
                },
            );
        }
    });

    test('rejeita senhas inválidas sem revelar a regra interna', () => {
        const invalidPasswords = [
            undefined,
            null,
            '',
            42,
            {},
            [],
            'a'.repeat(73),
            '😀'.repeat(19),
        ];

        for (const password of invalidPasswords) {
            assert.throws(
                () => AuthenticationService.prepareCredentials({
                    email: VALID_CREDENTIALS.email,
                    password,
                }),
                (error) => {
                    assert.equal(error instanceof AppError, true);
                    assert.equal(error.statusCode, 401);
                    assert.equal(
                        error.message,
                        AUTHENTICATION_MESSAGES.INVALID_CREDENTIALS,
                    );
                    assert.equal(
                        error.message.includes('72'),
                        false,
                    );

                    return true;
                },
            );
        }
    });
});

describe('identidade autenticada', () => {
    test('retorna somente os campos públicos necessários', () => {
        const user = createUser();

        const identity = AuthenticationService.createIdentity(user);

        assert.deepEqual(identity, {
            id: 'usuario-123',
            name: 'Administrador de Teste',
            email: 'admin@example.com',
            role: 'admin',
        });
        assert.equal(Object.isFrozen(identity), true);
        assert.equal(
            Object.hasOwn(identity, 'passwordHash'),
            false,
        );
        assert.equal(Object.hasOwn(identity, 'active'), false);
        assert.equal(
            Object.hasOwn(identity, 'lastLoginAt'),
            false,
        );
    });

    test('rejeita documentos sem identidade completa', () => {
        const invalidUsers = [
            undefined,
            null,
            {},
            createUser({ _id: null }),
            createUser({ name: undefined }),
            createUser({ email: undefined }),
            createUser({ role: undefined }),
        ];

        for (const user of invalidUsers) {
            assert.throws(
                () => AuthenticationService.createIdentity(user),
                {
                    name: 'TypeError',
                    message:
                        AUTHENTICATION_MESSAGES.INVALID_USER_DOCUMENT,
                },
            );
        }
    });
});

describe('autenticação administrativa', () => {
    test('autentica uma conta ativa com a senha correta', async () => {
        const user = createUser();
        const {
            UserModel,
            calls: userCalls,
        } = createFakeUserModel({ user });
        const {
            passwordHasherService,
            calls: passwordCalls,
        } = createFakePasswordHasher({ matches: true });

        const service = new AuthenticationService({
            UserModel,
            passwordHasherService,
        });

        const identity = await service.authenticate(
            VALID_CREDENTIALS,
        );

        assert.deepEqual(userCalls.findOne, [
            {
                email: 'admin@example.com',
            },
        ]);
        assert.deepEqual(userCalls.select, [
            '+passwordHash',
        ]);
        assert.deepEqual(passwordCalls.compare, [
            {
                password: VALID_CREDENTIALS.password,
                passwordHash: STORED_PASSWORD_HASH,
            },
        ]);
        assert.deepEqual(identity, {
            id: 'usuario-123',
            name: 'Administrador de Teste',
            email: 'admin@example.com',
            role: 'admin',
        });
        assert.equal(
            Object.hasOwn(identity, 'passwordHash'),
            false,
        );
    });

    test('executa comparação substituta quando o usuário não existe', async () => {
        const {
            UserModel,
            calls: userCalls,
        } = createFakeUserModel({ user: null });
        const {
            passwordHasherService,
            calls: passwordCalls,
        } = createFakePasswordHasher({
            /**
             * Mesmo que um comparador defeituoso retorne true para o hash
             * substituto, a ausência do usuário jamais permite autenticação.
             */
            matches: true,
        });

        const service = new AuthenticationService({
            UserModel,
            passwordHasherService,
        });

        await assertInvalidCredentials(
            service.authenticate(VALID_CREDENTIALS),
        );

        assert.deepEqual(userCalls.select, [
            '+passwordHash',
        ]);
        assert.deepEqual(passwordCalls.compare, [
            {
                password: VALID_CREDENTIALS.password,
                passwordHash: DEFAULT_DUMMY_PASSWORD_HASH,
            },
        ]);
    });

    test('recusa uma senha incorreta com erro genérico', async () => {
        const { UserModel } = createFakeUserModel();
        const {
            passwordHasherService,
            calls,
        } = createFakePasswordHasher({ matches: false });

        const service = new AuthenticationService({
            UserModel,
            passwordHasherService,
        });

        await assertInvalidCredentials(
            service.authenticate(VALID_CREDENTIALS),
        );

        assert.equal(calls.compare.length, 1);
        assert.equal(
            calls.compare[0].passwordHash,
            STORED_PASSWORD_HASH,
        );
    });

    test('recusa uma conta inativa depois de comparar a senha', async () => {
        const { UserModel } = createFakeUserModel({
            user: createUser({ active: false }),
        });
        const {
            passwordHasherService,
            calls,
        } = createFakePasswordHasher({ matches: true });

        const service = new AuthenticationService({
            UserModel,
            passwordHasherService,
        });

        await assertInvalidCredentials(
            service.authenticate(VALID_CREDENTIALS),
        );

        assert.deepEqual(calls.compare, [
            {
                password: VALID_CREDENTIALS.password,
                passwordHash: STORED_PASSWORD_HASH,
            },
        ]);
    });

    test('propaga uma falha real da consulta ao banco', async () => {
        const expectedError = new Error(
            'Falha controlada na consulta ao usuário.',
        );

        const { UserModel } = createFakeUserModel({
            queryError: expectedError,
        });
        const { passwordHasherService } =
            createFakePasswordHasher();

        const service = new AuthenticationService({
            UserModel,
            passwordHasherService,
        });

        await assert.rejects(
            service.authenticate(VALID_CREDENTIALS),
            (error) => {
                assert.strictEqual(error, expectedError);

                return true;
            },
        );
    });

    test('propaga uma falha real do comparador de senhas', async () => {
        const expectedError = new Error(
            'Falha controlada no comparador.',
        );

        const { UserModel } = createFakeUserModel();
        const { passwordHasherService } =
            createFakePasswordHasher({
                error: expectedError,
            });

        const service = new AuthenticationService({
            UserModel,
            passwordHasherService,
        });

        await assert.rejects(
            service.authenticate(VALID_CREDENTIALS),
            (error) => {
                assert.strictEqual(error, expectedError);

                return true;
            },
        );
    });

    test('não usa o hash substituto para um usuário existente sem hash', async () => {
        const expectedError = new TypeError(
            'Documento existente sem hash.',
        );

        const { UserModel } = createFakeUserModel({
            user: createUser({ passwordHash: undefined }),
        });

        const calls = [];

        const passwordHasherService = {
            async compare(password, passwordHash) {
                calls.push({
                    password,
                    passwordHash,
                });

                if (passwordHash === undefined) {
                    throw expectedError;
                }

                return false;
            },
        };

        const service = new AuthenticationService({
            UserModel,
            passwordHasherService,
        });

        await assert.rejects(
            service.authenticate(VALID_CREDENTIALS),
            (error) => {
                assert.strictEqual(error, expectedError);

                return true;
            },
        );

        assert.deepEqual(calls, [
            {
                password: VALID_CREDENTIALS.password,
                passwordHash: undefined,
            },
        ]);
    });

    test('propaga inconsistência na identidade do documento', async () => {
        const { UserModel } = createFakeUserModel({
            user: createUser({ name: undefined }),
        });
        const { passwordHasherService } =
            createFakePasswordHasher({ matches: true });

        const service = new AuthenticationService({
            UserModel,
            passwordHasherService,
        });

        await assert.rejects(
            service.authenticate(VALID_CREDENTIALS),
            {
                name: 'TypeError',
                message:
                    AUTHENTICATION_MESSAGES.INVALID_USER_DOCUMENT,
            },
        );
    });
});
