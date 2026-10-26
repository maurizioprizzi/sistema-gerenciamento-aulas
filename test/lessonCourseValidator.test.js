'use strict';

const assert = require('node:assert/strict');
const { describe, test } = require('node:test');
const mongoose = require('mongoose');
const { AppError } = require('../src/errors/AppError');
const {
    LESSON_COURSE_CODES,
    LESSON_COURSE_MESSAGES,
    LessonCourseValidator,
} = require('../src/services/LessonCourseValidator');

const COURSE_ID = '507f1f77bcf86cd7994390ab';
const OTHER_COURSE_ID = '507f1f77bcf86cd7994390ac';

/** Documento controlado; propriedades internas não devem sair da validação. */
function createCourse(overrides = {}) {
    return {
        _id: new mongoose.Types.ObjectId(COURSE_ID),
        name: 'Ciência de Dados',
        code: 'CD',
        active: true,
        internalValue: 'detalhe privado',
        ...overrides,
    };
}

/** Consulta substituível para simular renomeações e desativações entre usos. */
function createFixture(document = createCourse()) {
    const calls = [];
    const state = { document };
    const CourseModel = {
        async findById(id) {
            calls.push(id);
            return state.document;
        },
    };
    return {
        calls,
        state,
        CourseModel,
        validator: new LessonCourseValidator({ CourseModel }),
    };
}

function isPublicError(code, statusCode) {
    return (error) => {
        assert.ok(error instanceof AppError);
        assert.equal(error.code, code);
        assert.equal(error.statusCode, statusCode);
        assert.equal(error.details, null);
        assert.equal(error.message.includes(COURSE_ID), false);
        return true;
    };
}

describe('configuração da validação do curso da aula', () => {
    test('constrói com dependências padrão sem abrir conexão', () => {
        const previousState = mongoose.connection.readyState;
        const validator = new LessonCourseValidator();
        assert.ok(validator);
        assert.equal(mongoose.connection.readyState, previousState);
    });

    test('exige apenas consulta por identificador e não consulta ao construir', () => {
        for (const CourseModel of [null, {}, { findById: true }]) {
            assert.throws(() => new LessonCourseValidator({ CourseModel }), {
                name: 'TypeError',
                message: LESSON_COURSE_MESSAGES.INVALID_MODEL,
            });
        }
        const { calls } = createFixture();
        assert.deepEqual(calls, []);
    });
});

describe('seleção de curso para uma aula nova', () => {
    test('recusa identificadores inválidos antes de consultar o catálogo', async () => {
        const { validator, calls } = createFixture();
        for (const id of [
            undefined, null, '', 'CD', ` ${COURSE_ID}`, `${COURSE_ID} `,
            'a'.repeat(23), 'g'.repeat(24), 42, [], { $ne: null },
        ]) {
            await assert.rejects(validator.validateForCreation(id),
                isPublicError(LESSON_COURSE_CODES.INVALID_ID, 400));
        }
        assert.deepEqual(calls, []);
    });

    test('normaliza a identidade e devolve somente os dados públicos do curso ativo', async () => {
        const { validator, calls } = createFixture();
        const { validateForCreation } = validator;
        const course = await validateForCreation(COURSE_ID.toUpperCase());
        assert.deepEqual(calls, [COURSE_ID]);
        assert.deepEqual(course, {
            id: COURSE_ID, name: 'Ciência de Dados', code: 'CD', active: true,
        });
        assert.equal(Object.isFrozen(course), true);
    });

    test('recusa curso ausente com erro público sem identificadores privados', async () => {
        const { validator } = createFixture(null);
        await assert.rejects(validator.validateForCreation(COURSE_ID),
            isPublicError(LESSON_COURSE_CODES.NOT_FOUND, 404));
    });

    test('não permite criar uma aula com curso desativado', async () => {
        const { validator } = createFixture(createCourse({ active: false }));
        await assert.rejects(validator.validateForCreation(COURSE_ID),
            isPublicError(LESSON_COURSE_CODES.INACTIVE, 409));
    });

    test('relê nome, sigla e situação a cada tentativa sem reutilizar decisão antiga', async () => {
        const { validator, state, calls } = createFixture();
        const first = await validator.validateForCreation(COURSE_ID);
        state.document = createCourse({ name: 'Análise de Dados', code: 'AD' });
        const renamed = await validator.validateForCreation(COURSE_ID);
        assert.equal(first.code, 'CD');
        assert.equal(renamed.code, 'AD');
        assert.equal(renamed.name, 'Análise de Dados');
        assert.equal(renamed.id, first.id);
        state.document.active = false;
        await assert.rejects(validator.validateForCreation(COURSE_ID),
            isPublicError(LESSON_COURSE_CODES.INACTIVE, 409));
        assert.deepEqual(calls, [COURSE_ID, COURSE_ID, COURSE_ID]);
    });
});

describe('preservação do curso durante a edição da aula', () => {
    test('permite manter o mesmo curso desativado mesmo após mudar nome ou sigla', async () => {
        const { validator, state } = createFixture(createCourse({ active: false }));
        const { validateForUpdate } = validator;
        state.document.name = 'Análise de Dados';
        state.document.code = 'AD';
        const course = await validateForUpdate(COURSE_ID, COURSE_ID.toUpperCase());
        assert.equal(course.id, COURSE_ID);
        assert.equal(course.active, false);
        assert.equal(course.code, 'AD');
        assert.equal(state.document.active, false);
    });

    test('permite trocar para outro curso ativo', async () => {
        const { validator } = createFixture();
        const course = await validator.validateForUpdate(COURSE_ID, OTHER_COURSE_ID);
        assert.equal(course.id, COURSE_ID);
        assert.equal(course.active, true);
    });

    test('não permite trocar para outro curso desativado', async () => {
        const { validator } = createFixture(createCourse({ active: false }));
        await assert.rejects(validator.validateForUpdate(COURSE_ID, OTHER_COURSE_ID),
            isPublicError(LESSON_COURSE_CODES.INACTIVE, 409));
    });

    test('sem vínculo anterior exige curso ativo e não presume identidade pela sigla', async () => {
        const { validator, state } = createFixture();
        for (const previous of [null, undefined]) {
            state.document.active = true;
            await assert.doesNotReject(validator.validateForUpdate(COURSE_ID, previous));
            state.document.active = false;
            await assert.rejects(validator.validateForUpdate(COURSE_ID, previous),
                isPublicError(LESSON_COURSE_CODES.INACTIVE, 409));
        }
    });

    test('recusa vínculo anterior inconsistente antes de consultar', async () => {
        const { validator, calls } = createFixture();
        for (const previous of ['CD', {}, 42, [], ` ${COURSE_ID}`]) {
            await assert.rejects(validator.validateForUpdate(COURSE_ID, previous), {
                name: 'TypeError', message: LESSON_COURSE_MESSAGES.INVALID_PREVIOUS_ID,
            });
        }
        await assert.rejects(validator.validateForUpdate('CD', COURSE_ID),
            isPublicError(LESSON_COURSE_CODES.INVALID_ID, 400));
        assert.deepEqual(calls, []);
    });
});

describe('falhas e espera da consulta ao catálogo', () => {
    for (const method of ['validateForCreation', 'validateForUpdate']) {
        test(`${method}: não aceita ausência ou documento inconsistente como sucesso`, async () => {
            const { validator, state } = createFixture();
            for (const document of [
                undefined, [], {}, createCourse({ active: 'true' }),
                createCourse({ code: 'cd' }), createCourse({ _id: OTHER_COURSE_ID }),
            ]) {
                state.document = document;
                await assert.rejects(validator[method](COURSE_ID, COURSE_ID), TypeError);
            }
            state.document = null;
            await assert.rejects(validator[method](COURSE_ID, COURSE_ID),
                isPublicError(LESSON_COURSE_CODES.NOT_FOUND, 404));
        });

        test(`${method}: propaga a falha original da consulta sem produzir uma decisão`, async () => {
            const failure = new Error('falha de conexão controlada');
            const validator = new LessonCourseValidator({
                CourseModel: { findById() { throw failure; } },
            });
            await assert.rejects(validator[method](COURSE_ID, COURSE_ID),
                (error) => error === failure);
        });
    }

    test('aguarda a consulta antes de confirmar a seleção do curso', async () => {
        let resolveQuery;
        const query = new Promise((resolve) => { resolveQuery = resolve; });
        const validator = new LessonCourseValidator({
            CourseModel: { findById() { return query; } },
        });
        let settled = false;
        const pending = validator.validateForCreation(COURSE_ID).then((course) => {
            settled = true;
            return course;
        });
        await Promise.resolve();
        assert.equal(settled, false);
        resolveQuery(createCourse());
        assert.equal((await pending).id, COURSE_ID);
    });
});
