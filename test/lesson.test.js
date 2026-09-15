'use strict';

const assert = require('node:assert/strict');
const { describe, test } = require('node:test');
const mongoose = require('mongoose');

const {
    CALENDAR_DATE_PATTERN,
    LESSON_COURSES,
    LESSON_TYPES,
    createLessonModel,
    createLessonSchema,
    isValidCalendarDate,
    isValidOptionalMaterialUrl,
    normalizeLessonText,
    normalizeOptionalLessonText,
} = require('../src/models/Lesson');

/**
 * Cria uma instância isolada do Mongoose para cada cenário.
 *
 * O modelo pode ser construído e validado inteiramente em memória. Nenhum
 * teste desta unidade abre conexão com o MongoDB local.
 *
 * @returns {{ mongooseClient: mongoose.Mongoose,
 * LessonModel: mongoose.Model }} Dependências isoladas.
 */
function createIsolatedLessonModel() {
    const mongooseClient = new mongoose.Mongoose();
    const LessonModel = createLessonModel(mongooseClient);

    return {
        mongooseClient,
        LessonModel,
    };
}

/**
 * Produz os dados mínimos de uma aula válida.
 *
 * @param {object} overrides Campos que substituirão os valores padrão.
 * @returns {object} Dados apropriados para construir uma aula.
 */
function createValidLessonData(overrides = {}) {
    return {
        date: '2026-09-15',
        course: LESSON_COURSES.APQSA,
        curricularUnit: '5',
        ...overrides,
    };
}

/**
 * Executa a validação e devolve o erro esperado.
 *
 * @param {mongoose.Document} document Documento que deve ser recusado.
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

describe('contratos do calendário de aulas', () => {
    test('expõe cursos e tipos originais protegidos', () => {
        assert.equal(Object.isFrozen(LESSON_COURSES), true);
        assert.equal(Object.isFrozen(LESSON_TYPES), true);

        assert.deepEqual(LESSON_COURSES, {
            APQSA: 'APQSA',
            TECMKT: 'TECMKT',
            TECADM: 'TECADM',
        });
        assert.deepEqual(LESSON_TYPES, {
            LESSON: 'Aula',
            ACTIVITY: 'Atividade',
            ASSESSMENT: 'Avaliação',
        });
    });

    test('mantém o formato textual esperado para datas', () => {
        assert.equal(CALENDAR_DATE_PATTERN.test('2026-09-15'), true);
        assert.equal(CALENDAR_DATE_PATTERN.test('15/09/2026'), false);
    });
});

describe('normalização dos campos de aula', () => {
    test('normaliza espaços de textos obrigatórios', () => {
        assert.equal(
            normalizeLessonText('  UC   5  '),
            'UC 5',
        );
    });

    test('normaliza textos opcionais e unifica sua ausência', () => {
        assert.equal(
            normalizeOptionalLessonText('  Aula   12  '),
            'Aula 12',
        );
        assert.equal(normalizeOptionalLessonText('   '), null);
        assert.equal(normalizeOptionalLessonText(''), null);
    });

    test('preserva valores não textuais para validação posterior', () => {
        for (const value of [undefined, null, 42, {}, []]) {
            assert.strictEqual(normalizeLessonText(value), value);
            assert.strictEqual(
                normalizeOptionalLessonText(value),
                value,
            );
        }
    });
});

describe('validação de datas do calendário', () => {
    test('aceita datas civis existentes, inclusive ano bissexto', () => {
        for (const value of [
            '2026-01-01',
            '2026-09-15',
            '2024-02-29',
            '9999-12-31',
        ]) {
            assert.equal(isValidCalendarDate(value), true);
        }
    });

    test('rejeita formatos e datas civis impossíveis', () => {
        for (const value of [
            undefined,
            null,
            20260915,
            '',
            '2026-9-15',
            '15/09/2026',
            '0000-01-01',
            '2026-00-10',
            '2026-13-10',
            '2026-02-29',
            '2026-04-31',
            '2026-09-00',
        ]) {
            assert.equal(isValidCalendarDate(value), false);
        }
    });
});

describe('validação dos links de materiais', () => {
    test('aceita ausência e endereços HTTP ou HTTPS', () => {
        for (const value of [
            undefined,
            null,
            'http://example.com/plano',
            'https://example.com/guia?turma=APQSA',
        ]) {
            assert.equal(isValidOptionalMaterialUrl(value), true);
        }
    });

    test('rejeita endereços inválidos e protocolos não web', () => {
        for (const value of [
            '',
            'material',
            '/material/local',
            'ftp://example.com/material',
            'file:///tmp/material.pdf',
            'javascript:alert(1)',
            42,
            {},
        ]) {
            assert.equal(isValidOptionalMaterialUrl(value), false);
        }
    });

    test('rejeita credenciais incorporadas ao endereço', () => {
        assert.equal(
            isValidOptionalMaterialUrl(
                'https://usuario:segredo@example.com/material',
            ),
            false,
        );
    });
});

describe('createLessonSchema', () => {
    test('exige uma instância válida do Mongoose', () => {
        assert.throws(
            () => createLessonSchema(null),
            {
                name: 'TypeError',
                message:
                    'Uma instância válida do Mongoose é necessária para criar o schema de aula.',
            },
        );
    });

    test('define somente os oito campos funcionais do protótipo', () => {
        const mongooseClient = new mongoose.Mongoose();
        const schema = createLessonSchema(mongooseClient);

        const functionalPaths = Object.keys(schema.paths)
            .filter((path) => ![
                '_id',
                'createdAt',
                'updatedAt',
            ].includes(path));

        assert.deepEqual(functionalPaths, [
            'date',
            'course',
            'curricularUnit',
            'type',
            'lessonNumber',
            'needsReview',
            'lessonPlanUrl',
            'studentGuideUrl',
        ]);
    });

    test('cria o índice de consulta sem impor unicidade', () => {
        const mongooseClient = new mongoose.Mongoose();
        const schema = createLessonSchema(mongooseClient);

        const lessonIndex = schema.indexes().find(
            ([fields]) => (
                fields.date === 1
                && fields.course === 1
            ),
        );

        assert.ok(lessonIndex);
        assert.equal(lessonIndex[1].name, 'lessons_date_course');
        assert.notEqual(lessonIndex[1].unique, true);
    });

    test('habilita datas automáticas sem chave de versão', () => {
        const mongooseClient = new mongoose.Mongoose();
        const schema = createLessonSchema(mongooseClient);

        assert.equal(schema.options.timestamps, true);
        assert.equal(schema.options.versionKey, false);
    });
});

describe('createLessonModel', () => {
    test('exige uma instância válida do Mongoose', () => {
        assert.throws(
            () => createLessonModel({}),
            {
                name: 'TypeError',
                message:
                    'Uma instância válida do Mongoose é necessária para criar o modelo de aula.',
            },
        );
    });

    test('cria o modelo sem abrir conexão com o banco', () => {
        const { mongooseClient, LessonModel } =
            createIsolatedLessonModel();

        assert.equal(LessonModel.modelName, 'Lesson');
        assert.equal(mongooseClient.connection.readyState, 0);
    });

    test('reutiliza um modelo que já está registrado', () => {
        const mongooseClient = new mongoose.Mongoose();

        const firstModel = createLessonModel(mongooseClient);
        const secondModel = createLessonModel(mongooseClient);

        assert.strictEqual(secondModel, firstModel);
    });
});

describe('modelo Lesson', () => {
    test('cria em memória uma aula válida com valores padrão', async () => {
        const { LessonModel } = createIsolatedLessonModel();
        const lesson = new LessonModel(createValidLessonData());

        await assert.doesNotReject(lesson.validate());

        assert.equal(lesson.date, '2026-09-15');
        assert.equal(lesson.course, LESSON_COURSES.APQSA);
        assert.equal(lesson.curricularUnit, '5');
        assert.equal(lesson.type, LESSON_TYPES.LESSON);
        assert.equal(lesson.lessonNumber, null);
        assert.equal(lesson.needsReview, false);
        assert.equal(lesson.lessonPlanUrl, null);
        assert.equal(lesson.studentGuideUrl, null);
    });

    test('normaliza textos recebidos do formulário original', async () => {
        const { LessonModel } = createIsolatedLessonModel();
        const lesson = new LessonModel(
            createValidLessonData({
                curricularUnit: '  UC   5  ',
                lessonNumber: '  12   A  ',
                lessonPlanUrl: '  https://example.com/pa  ',
                studentGuideUrl: '   ',
            }),
        );

        await assert.doesNotReject(lesson.validate());

        assert.equal(lesson.curricularUnit, 'UC 5');
        assert.equal(lesson.lessonNumber, '12 A');
        assert.equal(
            lesson.lessonPlanUrl,
            'https://example.com/pa',
        );
        assert.equal(lesson.studentGuideUrl, null);
    });

    test('aceita todos os cursos e tipos do protótipo', async () => {
        const { LessonModel } = createIsolatedLessonModel();

        for (const course of Object.values(LESSON_COURSES)) {
            for (const type of Object.values(LESSON_TYPES)) {
                const lesson = new LessonModel(
                    createValidLessonData({ course, type }),
                );

                await assert.doesNotReject(lesson.validate());
            }
        }
    });

    test('rejeita os campos obrigatórios ausentes', async () => {
        const { LessonModel } = createIsolatedLessonModel();
        const lesson = new LessonModel();

        const validationError = await captureValidationError(
            lesson,
        );

        assert.equal(
            validationError.errors.date.message,
            'A data da aula é obrigatória.',
        );
        assert.equal(
            validationError.errors.course.message,
            'O curso da aula é obrigatório.',
        );
        assert.equal(
            validationError.errors.curricularUnit.message,
            'A unidade curricular da aula é obrigatória.',
        );
    });

    test('rejeita uma unidade curricular formada por espaços', async () => {
        const { LessonModel } = createIsolatedLessonModel();
        const lesson = new LessonModel(
            createValidLessonData({ curricularUnit: '   ' }),
        );

        const validationError = await captureValidationError(
            lesson,
        );

        assert.equal(
            validationError.errors.curricularUnit.message,
            'A unidade curricular da aula é obrigatória.',
        );
    });

    test('rejeita datas inválidas sem convertê-las', async () => {
        const { LessonModel } = createIsolatedLessonModel();

        for (const date of [
            '15/09/2026',
            '2026-02-29',
            '2026-04-31',
        ]) {
            const lesson = new LessonModel(
                createValidLessonData({ date }),
            );

            const validationError = await captureValidationError(
                lesson,
            );

            assert.equal(
                validationError.errors.date.message,
                'A data da aula deve ser uma data válida no formato YYYY-MM-DD.',
            );
            assert.equal(lesson.date, date);
        }
    });

    test('rejeita um curso que não pertence ao protótipo', async () => {
        const { LessonModel } = createIsolatedLessonModel();
        const lesson = new LessonModel(
            createValidLessonData({ course: 'CURSO-NOVO' }),
        );

        const validationError = await captureValidationError(
            lesson,
        );

        assert.equal(
            validationError.errors.course.message,
            'O curso informado não pertence ao calendário.',
        );
    });

    test('rejeita um tipo que não pertence ao protótipo', async () => {
        const { LessonModel } = createIsolatedLessonModel();
        const lesson = new LessonModel(
            createValidLessonData({ type: 'Reunião' }),
        );

        const validationError = await captureValidationError(
            lesson,
        );

        assert.equal(
            validationError.errors.type.message,
            'O tipo de registro da aula é inválido.',
        );
    });

    test('limita o tamanho da unidade curricular', async () => {
        const { LessonModel } = createIsolatedLessonModel();
        const lesson = new LessonModel(
            createValidLessonData({
                curricularUnit: 'a'.repeat(121),
            }),
        );

        const validationError = await captureValidationError(
            lesson,
        );

        assert.equal(
            validationError.errors.curricularUnit.message,
            'A unidade curricular deve possuir no máximo 120 caracteres.',
        );
    });

    test('limita o tamanho do número da aula', async () => {
        const { LessonModel } = createIsolatedLessonModel();
        const lesson = new LessonModel(
            createValidLessonData({
                lessonNumber: 'a'.repeat(61),
            }),
        );

        const validationError = await captureValidationError(
            lesson,
        );

        assert.equal(
            validationError.errors.lessonNumber.message,
            'O número da aula deve possuir no máximo 60 caracteres.',
        );
    });

    test('aceita os dois links específicos da aula', async () => {
        const { LessonModel } = createIsolatedLessonModel();
        const lesson = new LessonModel(
            createValidLessonData({
                lessonPlanUrl: 'https://example.com/pa',
                studentGuideUrl: 'http://example.com/gd-ad',
            }),
        );

        await assert.doesNotReject(lesson.validate());
    });

    test('rejeita link inválido do plano de aula', async () => {
        const { LessonModel } = createIsolatedLessonModel();
        const lesson = new LessonModel(
            createValidLessonData({
                lessonPlanUrl: 'ftp://example.com/pa',
            }),
        );

        const validationError = await captureValidationError(
            lesson,
        );

        assert.equal(
            validationError.errors.lessonPlanUrl.message,
            'O link do plano de aula deve utilizar HTTP ou HTTPS.',
        );
    });

    test('rejeita link inválido do guia e das atividades', async () => {
        const { LessonModel } = createIsolatedLessonModel();
        const lesson = new LessonModel(
            createValidLessonData({
                studentGuideUrl:
                    'https://usuario:segredo@example.com/gd-ad',
            }),
        );

        const validationError = await captureValidationError(
            lesson,
        );

        assert.equal(
            validationError.errors.studentGuideUrl.message,
            'O link do guia e das atividades deve utilizar HTTP ou HTTPS.',
        );
    });

    test('limita o tamanho dos links de materiais', async () => {
        const { LessonModel } = createIsolatedLessonModel();
        const oversizedUrl =
            'https://example.com/' + 'a'.repeat(2030);
        const lesson = new LessonModel(
            createValidLessonData({
                lessonPlanUrl: oversizedUrl,
                studentGuideUrl: oversizedUrl,
            }),
        );

        const validationError = await captureValidationError(
            lesson,
        );

        assert.equal(
            validationError.errors.lessonPlanUrl.message,
            'O link do plano de aula deve possuir no máximo 2048 caracteres.',
        );
        assert.equal(
            validationError.errors.studentGuideUrl.message,
            'O link do guia e das atividades deve possuir no máximo 2048 caracteres.',
        );
    });
});
