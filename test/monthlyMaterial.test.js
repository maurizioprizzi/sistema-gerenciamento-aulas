'use strict';

const assert = require('node:assert/strict');
const { describe, test } = require('node:test');
const mongoose = require('mongoose');

const {
    CALENDAR_MONTH_PATTERN,
    createMonthlyMaterialModel,
    createMonthlyMaterialSchema,
    isValidCalendarMonth,
    normalizeOptionalMaterialUrl,
} = require('../src/models/MonthlyMaterial');

/**
 * Cria um modelo mensal em uma instância isolada do Mongoose.
 *
 * @returns {{ mongooseClient: mongoose.Mongoose,
 * MonthlyMaterialModel: mongoose.Model }} Dependências isoladas.
 */
function createIsolatedMonthlyMaterialModel() {
    const mongooseClient = new mongoose.Mongoose();
    const MonthlyMaterialModel =
        createMonthlyMaterialModel(mongooseClient);

    return {
        mongooseClient,
        MonthlyMaterialModel,
    };
}

/**
 * Cria os dados mínimos de um material mensal válido.
 *
 * Os links são opcionais no formulário original. Por isso, somente o mês é
 * necessário para construir um documento válido nesta unidade.
 *
 * @param {object} overrides Campos que substituirão os valores padrão.
 * @returns {object} Dados apropriados para o modelo.
 */
function createValidMonthlyMaterialData(overrides = {}) {
    return {
        month: '2026-09',
        ...overrides,
    };
}

/**
 * Valida um documento que deve ser recusado e devolve a falha encontrada.
 *
 * @param {mongoose.Document} document Documento inválido.
 * @returns {Promise<mongoose.Error.ValidationError>} Falha do Mongoose.
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

describe('contrato dos materiais mensais', () => {
    test('mantém o formato textual esperado para o mês', () => {
        assert.equal(CALENDAR_MONTH_PATTERN.test('2026-09'), true);
        assert.equal(CALENDAR_MONTH_PATTERN.test('09/2026'), false);
    });

    test('aceita meses civis existentes', () => {
        for (const value of [
            '0001-01',
            '2026-09',
            '2026-12',
            '9999-12',
        ]) {
            assert.equal(isValidCalendarMonth(value), true);
        }
    });

    test('rejeita formatos e meses impossíveis', () => {
        for (const value of [
            undefined,
            null,
            202609,
            '',
            '0000-01',
            '2026-00',
            '2026-13',
            '2026-9',
            '09/2026',
            ' 2026-09 ',
        ]) {
            assert.equal(isValidCalendarMonth(value), false);
        }
    });
});

describe('normalização dos links mensais', () => {
    test('remove somente os espaços externos do endereço', () => {
        assert.equal(
            normalizeOptionalMaterialUrl(
                '  https://example.com/material  ',
            ),
            'https://example.com/material',
        );
    });

    test('representa links vazios com null', () => {
        assert.equal(normalizeOptionalMaterialUrl(''), null);
        assert.equal(normalizeOptionalMaterialUrl('   '), null);
    });

    test('preserva valores não textuais para validação posterior', () => {
        for (const value of [undefined, null, 42, {}, []]) {
            assert.strictEqual(
                normalizeOptionalMaterialUrl(value),
                value,
            );
        }
    });
});

describe('createMonthlyMaterialSchema', () => {
    test('exige uma instância válida do Mongoose', () => {
        assert.throws(
            () => createMonthlyMaterialSchema(null),
            {
                name: 'TypeError',
                message:
                    'Uma instância válida do Mongoose é necessária para criar o schema de material mensal.',
            },
        );
    });

    test('define somente os três campos funcionais do protótipo', () => {
        const mongooseClient = new mongoose.Mongoose();
        const schema = createMonthlyMaterialSchema(
            mongooseClient,
        );

        const functionalPaths = Object.keys(schema.paths)
            .filter((path) => ![
                '_id',
                'createdAt',
                'updatedAt',
            ].includes(path));

        assert.deepEqual(functionalPaths, [
            'month',
            'lessonPlanUrl',
            'studentGuideUrl',
        ]);
    });

    test('garante um único conjunto de materiais por mês', () => {
        const mongooseClient = new mongoose.Mongoose();
        const schema = createMonthlyMaterialSchema(
            mongooseClient,
        );

        const monthIndex = schema.indexes().find(
            ([fields]) => fields.month === 1,
        );

        assert.ok(monthIndex);
        assert.equal(monthIndex[1].unique, true);
        assert.equal(
            monthIndex[1].name,
            'monthly_materials_month_unique',
        );
    });

    test('habilita datas automáticas sem chave de versão', () => {
        const mongooseClient = new mongoose.Mongoose();
        const schema = createMonthlyMaterialSchema(
            mongooseClient,
        );

        assert.equal(schema.options.timestamps, true);
        assert.equal(schema.options.versionKey, false);
    });
});

describe('createMonthlyMaterialModel', () => {
    test('exige uma instância válida do Mongoose', () => {
        assert.throws(
            () => createMonthlyMaterialModel({}),
            {
                name: 'TypeError',
                message:
                    'Uma instância válida do Mongoose é necessária para criar o modelo de material mensal.',
            },
        );
    });

    test('cria o modelo sem abrir conexão com o banco', () => {
        const {
            mongooseClient,
            MonthlyMaterialModel,
        } = createIsolatedMonthlyMaterialModel();

        assert.equal(
            MonthlyMaterialModel.modelName,
            'MonthlyMaterial',
        );
        assert.equal(mongooseClient.connection.readyState, 0);
    });

    test('reutiliza um modelo que já está registrado', () => {
        const mongooseClient = new mongoose.Mongoose();

        const firstModel =
            createMonthlyMaterialModel(mongooseClient);
        const secondModel =
            createMonthlyMaterialModel(mongooseClient);

        assert.strictEqual(secondModel, firstModel);
    });
});

describe('modelo MonthlyMaterial', () => {
    test('cria um material válido com os links ausentes', async () => {
        const { MonthlyMaterialModel } =
            createIsolatedMonthlyMaterialModel();
        const material = new MonthlyMaterialModel(
            createValidMonthlyMaterialData(),
        );

        await assert.doesNotReject(material.validate());

        assert.equal(material.month, '2026-09');
        assert.equal(material.lessonPlanUrl, null);
        assert.equal(material.studentGuideUrl, null);
    });

    test('normaliza os dois links recebidos do formulário', async () => {
        const { MonthlyMaterialModel } =
            createIsolatedMonthlyMaterialModel();
        const material = new MonthlyMaterialModel(
            createValidMonthlyMaterialData({
                lessonPlanUrl:
                    '  https://example.com/pa-setembro  ',
                studentGuideUrl: '   ',
            }),
        );

        await assert.doesNotReject(material.validate());

        assert.equal(
            material.lessonPlanUrl,
            'https://example.com/pa-setembro',
        );
        assert.equal(material.studentGuideUrl, null);
    });

    test('aceita os dois links mensais em HTTP ou HTTPS', async () => {
        const { MonthlyMaterialModel } =
            createIsolatedMonthlyMaterialModel();
        const material = new MonthlyMaterialModel(
            createValidMonthlyMaterialData({
                lessonPlanUrl: 'https://example.com/pa',
                studentGuideUrl: 'http://example.com/gd-ad',
            }),
        );

        await assert.doesNotReject(material.validate());
    });

    test('rejeita o mês ausente', async () => {
        const { MonthlyMaterialModel } =
            createIsolatedMonthlyMaterialModel();
        const material = new MonthlyMaterialModel();

        const validationError = await captureValidationError(
            material,
        );

        assert.equal(
            validationError.errors.month.message,
            'O mês do material é obrigatório.',
        );
    });

    test('rejeita meses inválidos sem convertê-los', async () => {
        const { MonthlyMaterialModel } =
            createIsolatedMonthlyMaterialModel();

        for (const month of [
            '09/2026',
            '2026-00',
            '2026-13',
            '2026-9',
        ]) {
            const material = new MonthlyMaterialModel(
                createValidMonthlyMaterialData({ month }),
            );

            const validationError = await captureValidationError(
                material,
            );

            assert.equal(
                validationError.errors.month.message,
                'O mês do material deve utilizar o formato YYYY-MM.',
            );
            assert.equal(material.month, month);
        }
    });

    test('rejeita link mensal inválido do plano de aula', async () => {
        const { MonthlyMaterialModel } =
            createIsolatedMonthlyMaterialModel();
        const material = new MonthlyMaterialModel(
            createValidMonthlyMaterialData({
                lessonPlanUrl: 'ftp://example.com/pa',
            }),
        );

        const validationError = await captureValidationError(
            material,
        );

        assert.equal(
            validationError.errors.lessonPlanUrl.message,
            'O link mensal do plano de aula deve utilizar HTTP ou HTTPS.',
        );
    });

    test('rejeita credenciais no link mensal do guia', async () => {
        const { MonthlyMaterialModel } =
            createIsolatedMonthlyMaterialModel();
        const material = new MonthlyMaterialModel(
            createValidMonthlyMaterialData({
                studentGuideUrl:
                    'https://usuario:segredo@example.com/gd-ad',
            }),
        );

        const validationError = await captureValidationError(
            material,
        );

        assert.equal(
            validationError.errors.studentGuideUrl.message,
            'O link mensal do guia e das atividades deve utilizar HTTP ou HTTPS.',
        );
    });

    test('limita o tamanho dos links mensais', async () => {
        const { MonthlyMaterialModel } =
            createIsolatedMonthlyMaterialModel();
        const oversizedUrl =
            'https://example.com/' + 'a'.repeat(2030);
        const material = new MonthlyMaterialModel(
            createValidMonthlyMaterialData({
                lessonPlanUrl: oversizedUrl,
                studentGuideUrl: oversizedUrl,
            }),
        );

        const validationError = await captureValidationError(
            material,
        );

        assert.equal(
            validationError.errors.lessonPlanUrl.message,
            'O link mensal do plano de aula deve possuir no máximo 2048 caracteres.',
        );
        assert.equal(
            validationError.errors.studentGuideUrl.message,
            'O link mensal do guia e das atividades deve possuir no máximo 2048 caracteres.',
        );
    });
});
