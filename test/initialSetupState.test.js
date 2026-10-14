'use strict';

const assert = require('node:assert/strict');
const { describe, test } = require('node:test');
const mongoose = require('mongoose');
const {
    INITIAL_SETUP_STATE_MODEL_NAME,
    INITIAL_SETUP_STATE_COLLECTION,
    INITIAL_SETUP_STATE_ID,
    INITIAL_SETUP_STATE_STATUS: STATUS,
    INITIAL_SETUP_STATE_ERRORS: ERRORS,
    createInitialSetupStateSchema,
    createInitialSetupStateModel,
} = require('../src/models/InitialSetupState');

/**
 * Cada cenário usa uma instância isolada do Mongoose. Nenhum teste conecta
 * ao MongoDB. A exclusividade persistente será verificada no banco real.
 */
function context() {
    const client = new mongoose.Mongoose();
    return {
        client,
        Model: createInitialSetupStateModel(client),
        administratorId: new client.Types.ObjectId(),
    };
}

function hasFieldError(field, expectedMessage) {
    return error => {
        assert.equal(error.name, 'ValidationError');
        assert.ok(error.errors[field]);
        if (expectedMessage) {
            assert.equal(error.errors[field].message, expectedMessage);
        }
        return true;
    };
}

describe('schema do registro de primeiro cadastro', () => {
    test('exige cliente com Schema e tipo ObjectId', () => {
        for (const client of [null, {}, { Schema() {} }]) {
            assert.throws(() => createInitialSetupStateSchema(client), {
                name: 'TypeError', message: ERRORS.INVALID_MONGOOSE,
            });
        }
    });

    test('define coleção própria, timestamps e ausência de versionKey', () => {
        const schema = createInitialSetupStateSchema(new mongoose.Mongoose());
        assert.equal(schema.options.collection, INITIAL_SETUP_STATE_COLLECTION);
        assert.equal(schema.options.timestamps, true);
        assert.equal(schema.options.versionKey, false);
        assert.equal(schema.options.strict, 'throw');
    });

    test('define id fixo e identidade administrativa imutáveis', () => {
        const schema = createInitialSetupStateSchema(new mongoose.Mongoose());
        assert.equal(schema.path('_id').instance, 'String');
        assert.equal(schema.path('_id').options.default, INITIAL_SETUP_STATE_ID);
        assert.equal(schema.path('_id').options.immutable, true);
        assert.deepEqual(schema.path('_id').options.enum.values, [INITIAL_SETUP_STATE_ID]);
        assert.equal(schema.path('administratorId').instance, 'ObjectId');
        assert.equal(schema.path('administratorId').options.immutable, true);
    });

    test('não declara campos de senha, hash, convite ou e-mail', () => {
        const schema = createInitialSetupStateSchema(new mongoose.Mongoose());
        for (const field of ['password', 'passwordHash', 'invitationToken', 'email']) {
            assert.equal(schema.path(field), undefined);
        }
    });

    test('não declara TTL ou índice de expiração', () => {
        const schema = createInitialSetupStateSchema(new mongoose.Mongoose());
        for (const [, options] of schema.indexes()) {
            assert.equal(options.expireAfterSeconds, undefined);
        }
        assert.equal(schema.path('createdAt').options.expires, undefined);
        assert.equal(schema.path('completedAt').options.expires, undefined);
    });

    test('mantém estados e mensagens imutáveis', () => {
        assert.equal(Object.isFrozen(STATUS), true);
        assert.equal(Object.isFrozen(ERRORS), true);
    });
});

describe('fábrica do modelo de primeiro cadastro', () => {
    test('exige cliente com model e registro de modelos', () => {
        for (const client of [null, {}, { model() {} }]) {
            assert.throws(() => createInitialSetupStateModel(client), {
                name: 'TypeError', message: ERRORS.INVALID_MONGOOSE,
            });
        }
    });

    test('cria modelo sem conexão e reutiliza o registro', () => {
        const { client, Model } = context();
        assert.equal(client.connection.readyState, 0);
        assert.equal(Model.modelName, INITIAL_SETUP_STATE_MODEL_NAME);
        assert.equal(Model.collection.name, INITIAL_SETUP_STATE_COLLECTION);
        assert.strictEqual(createInitialSetupStateModel(client), Model);
    });

    test('mantém modelos independentes entre instâncias', () => {
        const first = context();
        const second = context();
        assert.notStrictEqual(first.Model, second.Model);
        assert.equal(first.client.connection.readyState, 0);
        assert.equal(second.client.connection.readyState, 0);
    });
});

describe('documento do registro de primeiro cadastro', () => {
    test('valida reserva com id fixo e sem data de conclusão', async () => {
        const { Model, administratorId } = context();
        const record = new Model({ administratorId });
        await record.validate();
        assert.equal(record._id, INITIAL_SETUP_STATE_ID);
        assert.equal(record.status, STATUS.RESERVED);
        assert.equal(record.completedAt, null);
        assert.equal(record.administratorId.toString(), administratorId.toString());
    });

    test('exige identificador da conta administrativa', async () => {
        const { Model } = context();
        await assert.rejects(new Model({}).validate(),
            hasFieldError('administratorId', ERRORS.REQUIRED_ADMINISTRATOR_ID));
    });

    test('rejeita identificador administrativo malformado', async () => {
        const { Model } = context();
        await assert.rejects(new Model({ administratorId: 'id-invalido' }).validate(),
            hasFieldError('administratorId'));
    });

    test('recusa identificador de registro diferente do fixo', async () => {
        const { Model, administratorId } = context();
        await assert.rejects(new Model({ _id: 'outro-registro', administratorId }).validate(),
            hasFieldError('_id', ERRORS.INVALID_ID));
    });

    test('recusa id nulo e estado nulo', async () => {
        const { Model, administratorId } = context();
        await assert.rejects(new Model({ _id: null, administratorId }).validate(),
            hasFieldError('_id'));
        await assert.rejects(new Model({ administratorId, status: null }).validate(),
            hasFieldError('status'));
    });

    test('recusa estado desconhecido', async () => {
        const { Model, administratorId } = context();
        await assert.rejects(new Model({ administratorId, status: 'aberto' }).validate(),
            hasFieldError('status', ERRORS.INVALID_STATUS));
    });

    test('aceita conclusão com data válida', async () => {
        const { Model, administratorId } = context();
        const completedAt = new Date('2026-10-14T16:00:00.000Z');
        const record = new Model({ administratorId, status: STATUS.COMPLETED, completedAt });
        await record.validate();
        assert.equal(record.completedAt.toISOString(), completedAt.toISOString());
    });

    test('recusa conclusão sem data', async () => {
        const { Model, administratorId } = context();
        await assert.rejects(new Model({ administratorId, status: STATUS.COMPLETED }).validate(),
            hasFieldError('completedAt', ERRORS.REQUIRED_COMPLETION_DATE));
    });

    test('recusa data malformada na conclusão', async () => {
        const { Model, administratorId } = context();
        await assert.rejects(new Model({ administratorId, status: STATUS.COMPLETED,
            completedAt: 'data-invalida' }).validate(), hasFieldError('completedAt'));
    });

    test('recusa data de conclusão em reserva', async () => {
        const { Model, administratorId } = context();
        await assert.rejects(new Model({ administratorId, completedAt: new Date() }).validate(),
            hasFieldError('completedAt', ERRORS.UNEXPECTED_COMPLETION_DATE));
    });

    test('recusa campos extras em vez de descartá-los silenciosamente', () => {
        const { Model, administratorId } = context();
        for (const field of ['password', 'passwordHash', 'invitationToken', 'email', 'extra']) {
            assert.throws(() => new Model({ administratorId, [field]: 'valor-ficticio' }),
                { name: 'StrictModeError' });
        }
    });

    test('serializa apenas os campos do estado, sem versionKey', async () => {
        const { Model, administratorId } = context();
        const record = new Model({ administratorId });
        await record.validate();
        assert.deepEqual(Object.keys(record.toJSON()).sort(),
            ['_id', 'administratorId', 'completedAt', 'status']);
        // Datas automáticas serão preenchidas ao persistir, não ao construir.
        assert.equal(record.createdAt, undefined);
    });
});
