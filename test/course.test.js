'use strict';

const assert = require('node:assert/strict');
const { describe, test } = require('node:test');
const mongoose = require('mongoose');

const {
    COURSE_MODEL_NAME,
    Course,
    createCourseModel,
    createCourseSchema,
    normalizeCourseName,
    normalizeCourseCode,
} = require('../src/models/Course');

/** Cada teste utiliza um registro de modelos próprio, sem conectar ao MongoDB. */
function createIsolatedCourseModel() {
    const mongooseClient = new mongoose.Mongoose();
    return {
        mongooseClient,
        CourseModel: createCourseModel(mongooseClient),
    };
}

function createValidCourseData(overrides = {}) {
    return {
        name: 'Técnico em Administração',
        code: 'TECADM',
        ...overrides,
    };
}

/** Confirma quais campos foram recusados, sem depender do texto do Mongoose. */
async function assertInvalidFields(document, fields) {
    await assert.rejects(document.validate(), (error) => {
        assert.ok(error instanceof mongoose.Error.ValidationError);
        for (const field of fields) assert.ok(error.errors[field], field);
        return true;
    });
}

describe('normalização dos dados do curso', () => {
    test('normaliza espaços do nome preservando acentos e capitalização', () => {
        assert.equal(
            normalizeCourseName('  Técnico \t em   Administração  '),
            'Técnico em Administração',
        );
    });

    test('normaliza espaços da sigla e converte para maiúsculas', () => {
        assert.equal(normalizeCourseCode('  tec \t adm  '), 'TEC ADM');
    });

    test('unifica representações Unicode equivalentes de nome e sigla', () => {
        assert.equal(normalizeCourseName('Po\u0301s graduação'), 'Pós graduação');
        assert.equal(normalizeCourseCode('po\u0301s'), 'PÓS');
        assert.equal(normalizeCourseCode('pós'), 'PÓS');
    });

    test('preserva sinais utilizados nas siglas de cursos', () => {
        assert.equal(normalizeCourseCode(' c++ '), 'C++');
        assert.equal(normalizeCourseCode(' pós-ia '), 'PÓS-IA');
        assert.equal(normalizeCourseCode(' tec.adm/1 '), 'TEC.ADM/1');
    });

    test('devolve valores não textuais sem transformá-los', () => {
        for (const value of [undefined, null, 42, false, {}, []]) {
            assert.equal(normalizeCourseName(value), value);
            assert.equal(normalizeCourseCode(value), value);
        }
    });
});

describe('schema do curso', () => {
    test('exige cliente com construtor de Schema', () => {
        for (const client of [null, {}, { Schema: true }]) {
            assert.throws(() => createCourseSchema(client), TypeError);
        }
    });

    test('configura datas automáticas, ausência de versão e recusa de campos extras', () => {
        const schema = createCourseSchema(new mongoose.Mongoose());
        assert.equal(schema.options.timestamps, true);
        assert.equal(schema.options.versionKey, false);
        assert.equal(schema.options.strict, 'throw');
    });

    test('declara sigla única incluindo cursos desativados', () => {
        const schema = createCourseSchema(new mongoose.Mongoose());
        const index = schema.indexes().find(([fields]) => fields.code === 1);
        assert.ok(index);
        assert.deepEqual(index[0], { code: 1 });
        assert.equal(index[1].unique, true);
        assert.equal(index[1].name, 'courses_code_unique');
        assert.equal(index[1].partialFilterExpression, undefined);
        assert.equal(index[1].sparse, undefined);
        // Trata-se da declaração. A restrição efetiva será verificada no banco.
    });

    test('permite nome e sigla editáveis, sem lista fechada de cursos', () => {
        const schema = createCourseSchema(new mongoose.Mongoose());
        assert.equal(schema.path('name').options.immutable, undefined);
        assert.equal(schema.path('code').options.immutable, undefined);
        assert.equal(schema.path('code').options.enum, undefined);
    });
});

describe('fábrica do modelo Course', () => {
    test('exige cliente com registro e fábrica de modelos', () => {
        for (const client of [null, {}, { models: {} }, { model() {} }, { model: true, models: {} }]) {
            assert.throws(() => createCourseModel(client), TypeError);
        }
    });

    test('cria e reutiliza o modelo sem abrir conexão', () => {
        const { mongooseClient, CourseModel } = createIsolatedCourseModel();
        assert.equal(CourseModel.modelName, COURSE_MODEL_NAME);
        assert.equal(mongooseClient.models.Course, CourseModel);
        assert.equal(createCourseModel(mongooseClient), CourseModel);
        assert.equal(mongooseClient.connection.readyState, 0);
    });

    test('mantém registros independentes entre instâncias do Mongoose', () => {
        const first = createIsolatedCourseModel();
        const second = createIsolatedCourseModel();
        assert.notEqual(first.CourseModel, second.CourseModel);
        assert.notEqual(first.CourseModel, Course);
        assert.equal(first.CourseModel.db, first.mongooseClient.connection);
        assert.equal(second.CourseModel.db, second.mongooseClient.connection);
    });
});

describe('validação do documento de curso', () => {
    test('aceita nome e sigla e inicia o curso como ativo', async () => {
        const { CourseModel } = createIsolatedCourseModel();
        const document = new CourseModel(createValidCourseData());
        await document.validate();
        assert.equal(document.name, 'Técnico em Administração');
        assert.equal(document.code, 'TECADM');
        assert.equal(document.active, true);
        assert.ok(document._id instanceof mongoose.Types.ObjectId);
    });

    test('normaliza os campos antes da validação', async () => {
        const { CourseModel } = createIsolatedCourseModel();
        const document = new CourseModel(createValidCourseData({
            name: '  Análise   e Desenvolvimento de Sistemas  ',
            code: ' ads ',
        }));
        await document.validate();
        assert.equal(document.name, 'Análise e Desenvolvimento de Sistemas');
        assert.equal(document.code, 'ADS');
    });

    test('aceita cursos diferentes das opções do protótipo original', async () => {
        const { CourseModel } = createIsolatedCourseModel();
        const document = new CourseModel({ name: 'Ciência de Dados', code: 'CD' });
        await document.validate();
        assert.equal(document.code, 'CD');
    });

    test('exige nome e sigla', async () => {
        const { CourseModel } = createIsolatedCourseModel();
        await assertInvalidFields(new CourseModel({}), ['name', 'code']);
    });

    test('recusa nome e sigla vazios após a normalização', async () => {
        const { CourseModel } = createIsolatedCourseModel();
        await assertInvalidFields(new CourseModel({ name: ' \t ', code: ' \n ' }), ['name', 'code']);
    });

    test('recusa nome menor que dois caracteres após normalização', async () => {
        const { CourseModel } = createIsolatedCourseModel();
        await assertInvalidFields(new CourseModel(createValidCourseData({ name: ' A ' })), ['name']);
    });

    test('recusa nome acima de 120 caracteres', async () => {
        const { CourseModel } = createIsolatedCourseModel();
        await assertInvalidFields(new CourseModel(createValidCourseData({ name: 'a'.repeat(121) })), ['name']);
    });

    test('recusa sigla acima de 20 caracteres', async () => {
        const { CourseModel } = createIsolatedCourseModel();
        await assertInvalidFields(new CourseModel(createValidCourseData({ code: 'a'.repeat(21) })), ['code']);
    });

    test('aplica o limite depois de converter a sigla para maiúsculas', async () => {
        const { CourseModel } = createIsolatedCourseModel();
        // Cada ß é convertido para SS. O limite incide sobre o texto final.
        await assertInvalidFields(new CourseModel(createValidCourseData({ code: 'ß'.repeat(11) })), ['code']);
    });

    test('aceita os limites mínimo e máximo dos textos', async () => {
        const { CourseModel } = createIsolatedCourseModel();
        for (const data of [
            { name: 'TI', code: 'T' },
            { name: 'a'.repeat(120), code: 'b'.repeat(20) },
        ]) {
            const document = new CourseModel(data);
            await document.validate();
            assert.equal(document.name, data.name);
            assert.equal(document.code, data.code.toUpperCase());
        }
    });

    test('recusa situação nula ou impossível de converter em booleano', async () => {
        const { CourseModel } = createIsolatedCourseModel();
        for (const active of [null, 'situação desconhecida', {}]) {
            await assertInvalidFields(new CourseModel(createValidCourseData({ active })), ['active']);
        }
    });

    test('recusa campos não previstos em vez de descartá-los', () => {
        const { CourseModel } = createIsolatedCourseModel();
        for (const field of ['school', 'teacher', 'shift', 'capacity']) {
            assert.throws(
                () => new CourseModel({ ...createValidCourseData(), [field]: 'extra' }),
                (error) => error instanceof mongoose.Error.StrictModeError && error.path === field,
            );
        }
    });
});

describe('identidade e desativação do curso em memória', () => {
    test('permite editar nome e sigla preservando o identificador', async () => {
        const { CourseModel } = createIsolatedCourseModel();
        const document = new CourseModel(createValidCourseData());
        const originalId = document._id.toString();
        document.name = '  Gestão   Comercial  ';
        document.code = ' gc ';
        await document.validate();
        assert.equal(document._id.toString(), originalId);
        assert.equal(document.name, 'Gestão Comercial');
        assert.equal(document.code, 'GC');
    });

    test('permite desativar mantendo identificador, nome e sigla', async () => {
        const { CourseModel } = createIsolatedCourseModel();
        const document = new CourseModel(createValidCourseData());
        const original = { id: document._id.toString(), name: document.name, code: document.code };
        document.active = false;
        await document.validate();
        assert.equal(document.active, false);
        assert.equal(document._id.toString(), original.id);
        assert.equal(document.name, original.name);
        assert.equal(document.code, original.code);
    });

    test('aceita e serializa um curso já desativado', async () => {
        const { CourseModel } = createIsolatedCourseModel();
        const document = new CourseModel(createValidCourseData({ active: false }));
        await document.validate();
        const json = document.toJSON();
        assert.equal(json.active, false);
        assert.equal(json.name, document.name);
        assert.equal(json.code, document.code);
        assert.equal(json._id.toString(), document._id.toString());
        assert.equal(Object.hasOwn(json, '__v'), false);
    });
});
