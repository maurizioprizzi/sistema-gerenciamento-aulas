'use strict';

const assert = require('node:assert/strict');
const { describe, test } = require('node:test');
const mongoose = require('mongoose');

const {
    USER_ROLES,
    createUserModel,
    createUserSchema,
    normalizeEmail,
    normalizeName,
} = require('../src/models/User');

/**
 * Exemplo de hash com o mesmo comprimento de um hash bcrypt.
 *
 * Os testes do modelo não precisam produzir hashes reais. A responsabilidade
 * de transformar uma senha em hash pertencerá ao serviço de autenticação,
 * criado em uma etapa posterior.
 */
const VALID_PASSWORD_HASH = `$2b$12$${'a'.repeat(53)}`;

/**
 * Cria uma instância isolada do Mongoose para cada teste.
 *
 * Dessa forma, os testes não compartilham modelos e não precisam abrir uma
 * conexão com o MongoDB instalado na máquina.
 *
 * @returns {{ mongooseClient: mongoose.Mongoose, UserModel: mongoose.Model }}
 */
function createIsolatedUserModel() {
    const mongooseClient = new mongoose.Mongoose();
    const UserModel = createUserModel(mongooseClient);

    return {
        mongooseClient,
        UserModel,
    };
}

/**
 * Cria os dados mínimos de um usuário válido.
 *
 * @param {object} overrides Campos que devem substituir os valores padrão.
 * @returns {object} Dados de usuário apropriados para os testes.
 */
function createValidUserData(overrides = {}) {
    return {
        name: 'Dionísio Pereira',
        email: 'dionisio@example.com',
        passwordHash: VALID_PASSWORD_HASH,
        ...overrides,
    };
}

/**
 * Executa a validação assíncrona e devolve o erro encontrado.
 *
 * O Mongoose 9 marcou validateSync() como obsoleto. Por isso, utilizamos
 * validate(), que também mantém os testes compatíveis com versões futuras.
 *
 * @param {mongoose.Document} document Documento que será validado.
 * @returns {Promise<mongoose.Error.ValidationError>} Erro de validação.
 */
async function captureValidationError(document) {
    try {
        await document.validate();
    } catch (error) {
        assert.ok(
            error instanceof mongoose.Error.ValidationError,
            'Era esperado um erro de validação do Mongoose.',
        );

        return error;
    }

    assert.fail('Era esperado que a validação do documento falhasse.');
}

describe('normalização dos dados de usuário', () => {
    test('normaliza espaços presentes no nome', () => {
        assert.equal(
            normalizeName('  Dionísio    Pereira  '),
            'Dionísio Pereira',
        );
    });

    test('mantém valores que não sejam texto para posterior validação', () => {
        assert.equal(normalizeName(undefined), undefined);
        assert.equal(normalizeName(null), null);
        assert.equal(normalizeName(42), 42);
    });

    test('normaliza espaços e letras maiúsculas do e-mail', () => {
        assert.equal(
            normalizeEmail('  Dionisio.Pereira@EXAMPLE.COM  '),
            'dionisio.pereira@example.com',
        );
    });

    test('mantém valores que não sejam texto para posterior validação', () => {
        assert.equal(normalizeEmail(undefined), undefined);
        assert.equal(normalizeEmail(null), null);
        assert.equal(normalizeEmail(42), 42);
    });
});

describe('createUserSchema', () => {
    test('exige uma instância válida do Mongoose', () => {
        assert.throws(
            () => createUserSchema(null),
            {
                name: 'TypeError',
                message:
                    'Uma instância válida do Mongoose é necessária para criar o schema de usuário.',
            },
        );
    });

    test('define um índice único para o e-mail', () => {
        const mongooseClient = new mongoose.Mongoose();
        const schema = createUserSchema(mongooseClient);

        const emailIndex = schema.indexes().find(
            ([fields]) => fields.email === 1,
        );

        assert.ok(emailIndex);
        assert.equal(emailIndex[1].unique, true);
        assert.equal(emailIndex[1].name, 'users_email_unique');
    });

    test('oculta o hash da senha nas consultas comuns', () => {
        const mongooseClient = new mongoose.Mongoose();
        const schema = createUserSchema(mongooseClient);
        const passwordHashPath = schema.path('passwordHash');

        assert.equal(passwordHashPath.options.select, false);
    });

    test('não possui um campo destinado à senha original', () => {
        const mongooseClient = new mongoose.Mongoose();
        const schema = createUserSchema(mongooseClient);

        assert.equal(schema.path('password'), undefined);
        assert.ok(schema.path('passwordHash'));
    });

    test('habilita datas automáticas de criação e atualização', () => {
        const mongooseClient = new mongoose.Mongoose();
        const schema = createUserSchema(mongooseClient);

        assert.equal(schema.options.timestamps, true);
        assert.equal(schema.options.versionKey, false);
    });
});

describe('createUserModel', () => {
    test('exige uma instância válida do Mongoose', () => {
        assert.throws(
            () => createUserModel({}),
            {
                name: 'TypeError',
                message:
                    'Uma instância válida do Mongoose é necessária para criar o modelo de usuário.',
            },
        );
    });

    test('cria o modelo sem abrir conexão com o banco de dados', () => {
        const { mongooseClient, UserModel } = createIsolatedUserModel();

        assert.equal(UserModel.modelName, 'User');
        assert.equal(mongooseClient.connection.readyState, 0);
    });

    test('reutiliza um modelo que já está registrado', () => {
        const mongooseClient = new mongoose.Mongoose();

        const firstModel = createUserModel(mongooseClient);
        const secondModel = createUserModel(mongooseClient);

        assert.strictEqual(secondModel, firstModel);
    });
});

describe('modelo User', () => {
    test('cria em memória um usuário válido com valores padrão', async () => {
        const { UserModel } = createIsolatedUserModel();
        const user = new UserModel(createValidUserData());

        await assert.doesNotReject(user.validate());

        assert.equal(user.name, 'Dionísio Pereira');
        assert.equal(user.email, 'dionisio@example.com');
        assert.equal(user.role, USER_ROLES.ADMIN);
        assert.equal(user.active, true);
        assert.equal(user.lastLoginAt, null);
    });

    test('normaliza nome e e-mail antes da validação', async () => {
        const { UserModel } = createIsolatedUserModel();
        const user = new UserModel(
            createValidUserData({
                name: '  Dionísio    Pereira  ',
                email: '  DIONISIO@EXAMPLE.COM  ',
            }),
        );

        assert.equal(user.name, 'Dionísio Pereira');
        assert.equal(user.email, 'dionisio@example.com');

        await assert.doesNotReject(user.validate());
    });

    test('rejeita os campos obrigatórios ausentes', async () => {
        const { UserModel } = createIsolatedUserModel();
        const user = new UserModel();

        const validationError = await captureValidationError(user);

        assert.equal(
            validationError.errors.name.message,
            'O nome do usuário é obrigatório.',
        );
        assert.equal(
            validationError.errors.email.message,
            'O e-mail do usuário é obrigatório.',
        );
        assert.equal(
            validationError.errors.passwordHash.message,
            'O hash da senha é obrigatório.',
        );
    });

    test('rejeita um nome muito curto', async () => {
        const { UserModel } = createIsolatedUserModel();
        const user = new UserModel(
            createValidUserData({
                name: 'D',
            }),
        );

        const validationError = await captureValidationError(user);

        assert.equal(
            validationError.errors.name.message,
            'O nome deve possuir pelo menos 2 caracteres.',
        );
    });

    test('rejeita um nome maior que o limite permitido', async () => {
        const { UserModel } = createIsolatedUserModel();
        const user = new UserModel(
            createValidUserData({
                name: 'a'.repeat(121),
            }),
        );

        const validationError = await captureValidationError(user);

        assert.equal(
            validationError.errors.name.message,
            'O nome deve possuir no máximo 120 caracteres.',
        );
    });

    test('rejeita um endereço de e-mail inválido', async () => {
        const { UserModel } = createIsolatedUserModel();
        const user = new UserModel(
            createValidUserData({
                email: 'email-invalido',
            }),
        );

        const validationError = await captureValidationError(user);

        assert.equal(
            validationError.errors.email.message,
            'O e-mail informado é inválido.',
        );
    });

    test('rejeita um hash de senha muito curto', async () => {
        const { UserModel } = createIsolatedUserModel();
        const user = new UserModel(
            createValidUserData({
                passwordHash: 'hash-curto',
            }),
        );

        const validationError = await captureValidationError(user);

        assert.equal(
            validationError.errors.passwordHash.message,
            'O hash da senha não possui um formato suficientemente seguro.',
        );
    });

    test('rejeita um papel de usuário desconhecido', async () => {
        const { UserModel } = createIsolatedUserModel();
        const user = new UserModel(
            createValidUserData({
                role: 'superusuario',
            }),
        );

        const validationError = await captureValidationError(user);

        assert.equal(
            validationError.errors.role.message,
            'O papel de usuário informado é inválido.',
        );
    });

    test('não inclui o hash da senha na representação JSON', () => {
        const { UserModel } = createIsolatedUserModel();
        const user = new UserModel(createValidUserData());

        assert.equal(user.get('passwordHash'), VALID_PASSWORD_HASH);

        const publicUser = user.toJSON();

        assert.equal(
            Object.hasOwn(publicUser, 'passwordHash'),
            false,
        );
        assert.equal(Object.hasOwn(publicUser, '__v'), false);
        assert.equal(publicUser.email, 'dionisio@example.com');
    });

    test('não inclui o hash da senha na representação de objeto', () => {
        const { UserModel } = createIsolatedUserModel();
        const user = new UserModel(createValidUserData());

        const publicUser = user.toObject();

        assert.equal(
            Object.hasOwn(publicUser, 'passwordHash'),
            false,
        );
        assert.equal(Object.hasOwn(publicUser, '__v'), false);
    });
});