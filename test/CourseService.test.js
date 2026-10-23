'use strict';

const assert = require('node:assert/strict');
const { describe, test } = require('node:test');
const mongoose = require('mongoose');
const { AppError } = require('../src/errors/AppError');
const {
    CourseService,
    courseService,
    COURSE_SERVICE_CODES,
    COURSE_SERVICE_MESSAGES,
} = require('../src/services/CourseService');

const COURSE_ID = '507f1f77bcf86cd799439011';
const OTHER_ID = '507f1f77bcf86cd799439012';
const VALID_DATA = Object.freeze({ name: 'Técnico em Administração', code: 'TECADM' });

function createDocument(overrides = {}) {
    return {
        _id: new mongoose.Types.ObjectId(COURSE_ID),
        ...VALID_DATA,
        active: true,
        createdAt: new Date('2026-10-21T12:00:00Z'),
        internalValue: 'campo interno',
        ...overrides,
    };
}

/** Modelo controlado: registra a fronteira de persistência sem abrir conexão. */
function createFixture({
    document = createDocument(),
    onCreate,
    onUpdate,
    onList,
} = {}) {
    const calls = { create: [], find: [], sort: [], update: [] };
    const CourseModel = {
        async create(data) {
            calls.create.push(data);
            return onCreate ? onCreate(data) : { ...document, ...data };
        },
        find(filter) {
            calls.find.push(filter);
            return {
                async sort(order) {
                    calls.sort.push(order);
                    return onList ? onList(filter) : [document];
                },
            };
        },
        async findByIdAndUpdate(id, update, options) {
            calls.update.push({ id, update, options });
            return onUpdate
                ? onUpdate(id, update, options)
                : { ...document, ...update.$set };
        },
    };
    return { CourseModel, calls, service: new CourseService({ CourseModel }) };
}

function assertPublicError(error, key) {
    assert.ok(error instanceof AppError);
    assert.equal(error.code, COURSE_SERVICE_CODES[key]);
    assert.equal(error.message, COURSE_SERVICE_MESSAGES[key]);
    assert.equal(error.statusCode, key === 'CODE_CONFLICT' ? 409 : 400);
    assert.equal(error.details, null);
    return true;
}

function assertNoCalls(calls) {
    for (const entries of Object.values(calls)) assert.equal(entries.length, 0);
}

describe('configuração do CourseService', () => {
    test('permite dependências padrão sem executar operações do serviço', () => {
        assert.ok(new CourseService() instanceof CourseService);
        assert.ok(courseService instanceof CourseService);
    });

    test('exige criação, consulta e atualização, sem exigir exclusão', () => {
        const { CourseModel } = createFixture();
        for (const model of [null, {}, ...Object.keys(CourseModel).map((key) => ({
            ...CourseModel, [key]: null,
        }))]) {
            assert.throws(() => new CourseService({ CourseModel: model }), {
                name: 'TypeError', message: COURSE_SERVICE_MESSAGES.INVALID_MODEL,
            });
        }
        assert.doesNotThrow(() => new CourseService({ CourseModel }));
    });

    test('a construção não consulta nem grava o modelo', () => {
        const { calls } = createFixture();
        assertNoCalls(calls);
    });
});

describe('validação dos dados antes da persistência', () => {
    test('normaliza os dois campos sem modificar a entrada', async () => {
        const { service, calls } = createFixture();
        const input = Object.freeze({ name: '  Técnico   em Administração ', code: ' tecadm ' });
        await service.createCourse(input);
        assert.deepEqual(calls.create, [{ ...VALID_DATA, active: true }]);
        assert.equal(input.name, '  Técnico   em Administração ');
        assert.equal(input.code, ' tecadm ');
    });

    test('recusa entradas ausentes, listas, classes e tipos não textuais', async () => {
        class Input { constructor() { Object.assign(this, VALID_DATA); } }
        const { service, calls } = createFixture();
        for (const input of [
            undefined, null, [], 'curso', 42, new Date(), new Input(), {},
            { name: VALID_DATA.name }, { code: VALID_DATA.code },
            { name: 123, code: 'ABC' }, { name: 'Curso', code: { $ne: null } },
        ]) {
            await assert.rejects(service.createCourse(input), (error) => assertPublicError(error, 'INVALID_DATA'));
        }
        assertNoCalls(calls);
    });

    test('recusa situação, identificadores, operadores e outros campos extras', async () => {
        const { service, calls } = createFixture();
        for (const field of ['active', '_id', 'createdAt', '$set', 'school', Symbol('extra')]) {
            await assert.rejects(
                service.createCourse({ ...VALID_DATA, [field]: 'extra' }),
                (error) => assertPublicError(error, 'INVALID_DATA'),
            );
        }
        assertNoCalls(calls);
    });

    test('recusa campos herdados e aceita objeto de dados sem protótipo', async () => {
        const { service, calls } = createFixture();
        await assert.rejects(
            service.createCourse(Object.create(VALID_DATA)),
            (error) => assertPublicError(error, 'INVALID_DATA'),
        );
        assertNoCalls(calls);
        await service.createCourse(Object.assign(Object.create(null), VALID_DATA));
        assert.equal(calls.create.length, 1);
    });

    test('recusa textos vazios, limites excedidos e expansão da sigla em maiúsculas', async () => {
        const { service, calls } = createFixture();
        for (const input of [
            { name: ' ', code: 'ABC' }, { name: ' A ', code: 'ABC' },
            { name: 'a'.repeat(121), code: 'ABC' }, { name: 'Curso', code: ' ' },
            { name: 'Curso', code: 'a'.repeat(21) }, { name: 'Curso', code: 'ß'.repeat(11) },
        ]) {
            await assert.rejects(service.createCourse(input), (error) => assertPublicError(error, 'INVALID_DATA'));
        }
        assertNoCalls(calls);
    });

    test('aceita os limites mínimo e máximo depois da normalização', async () => {
        const { service, calls } = createFixture();
        await service.createCourse({ name: 'TI', code: 't' });
        await service.createCourse({ name: 'a'.repeat(120), code: 'b'.repeat(20) });
        assert.equal(calls.create.length, 2);
        assert.equal(calls.create[1].code, 'B'.repeat(20));
    });

    test('edição e desativação recusam identificadores inválidos antes do modelo', async () => {
        const { service, calls } = createFixture();
        for (const id of [undefined, null, 42, '', 'a'.repeat(23), 'g'.repeat(24), ` ${COURSE_ID}`, { $ne: null }]) {
            await assert.rejects(service.updateCourse(id, VALID_DATA), (error) => assertPublicError(error, 'INVALID_ID'));
            await assert.rejects(service.deactivateCourse(id), (error) => assertPublicError(error, 'INVALID_ID'));
        }
        assertNoCalls(calls);
    });

    test('edição exige nome e sigla completos e não aceita reativação no corpo', async () => {
        const { service, calls } = createFixture();
        for (const input of [{ name: 'Curso' }, { code: 'ABC' }, { ...VALID_DATA, active: true }]) {
            await assert.rejects(service.updateCourse(COURSE_ID, input), (error) => assertPublicError(error, 'INVALID_DATA'));
        }
        assertNoCalls(calls);
    });
});

describe('listagem de cursos', () => {
    test('sem filtro consulta todas as situações com ordenação determinística', async () => {
        const documents = [createDocument(), createDocument({ _id: OTHER_ID, code: 'OUTRO', active: false })];
        const { service, calls } = createFixture({ onList: () => documents });
        const result = await service.listCourses();
        assert.deepEqual(calls.find, [{}]);
        assert.deepEqual(calls.sort, [{ name: 1, code: 1, _id: 1 }]);
        assert.equal(result.length, 2);
        assert.equal(result[1].active, false);
        assert.ok(Object.isFrozen(result));
        for (const course of result) {
            assert.ok(Object.isFrozen(course));
            assert.deepEqual(Object.keys(course), ['id', 'name', 'code', 'active']);
        }
    });

    test('distingue explicitamente o filtro ativo do filtro desativado', async () => {
        const { service, calls } = createFixture({ onList: () => [] });
        await service.listCourses({ active: true });
        await service.listCourses({ active: false });
        assert.deepEqual(calls.find, [{ active: true }, { active: false }]);
    });

    test('recusa filtros desconhecidos, valores textuais e operadores', async () => {
        const { service, calls } = createFixture();
        for (const filters of [null, [], 'active', { name: 'Curso' }, { active: 'true' }, { active: undefined }, { active: { $ne: false } }]) {
            await assert.rejects(service.listCourses(filters), (error) => assertPublicError(error, 'INVALID_FILTERS'));
        }
        assertNoCalls(calls);
    });

    test('lista vazia permanece um resultado válido e imutável', async () => {
        const { service } = createFixture({ onList: () => [] });
        const result = await service.listCourses();
        assert.deepEqual(result, []);
        assert.ok(Object.isFrozen(result));
    });

    test('recusa resultado não enumerável como lista ou item inconsistente', async () => {
        for (const documents of [null, undefined, {}, [createDocument(), { name: 'incompleto' }]]) {
            const { service } = createFixture({ onList: () => documents });
            await assert.rejects(service.listCourses(), TypeError);
        }
    });

    test('propaga falha síncrona da consulta sem convertê-la em lista vazia', async () => {
        const failure = new Error('falha da consulta');
        const { CourseModel } = createFixture();
        CourseModel.find = () => { throw failure; };
        const service = new CourseService({ CourseModel });
        await assert.rejects(service.listCourses(), (error) => error === failure);
    });

    test('propaga falha assíncrona da consulta ordenada', async () => {
        const failure = new Error('falha da leitura');
        const { service } = createFixture({ onList: async () => { throw failure; } });
        await assert.rejects(service.listCourses(), (error) => error === failure);
    });
});

describe('gravação e identidade do curso', () => {
    test('cria ativo e retorna somente os campos públicos imutáveis', async () => {
        const { service, calls } = createFixture();
        const result = await service.createCourse(VALID_DATA);
        assert.deepEqual(calls.create, [{ ...VALID_DATA, active: true }]);
        assert.deepEqual(result, { id: COURSE_ID, ...VALID_DATA, active: true });
        assert.ok(Object.isFrozen(result));
        assert.equal(Object.hasOwn(result, 'internalValue'), false);
        assert.equal(Object.hasOwn(result, 'createdAt'), false);
    });

    test('edita por identidade normalizada sem upsert ou alteração de situação', async () => {
        const { service, calls } = createFixture({ document: createDocument({ active: false }) });
        const result = await service.updateCourse(COURSE_ID.toUpperCase(), { name: ' Novo Curso ', code: ' nc ' });
        assert.deepEqual(calls.update, [{
            id: COURSE_ID,
            update: { $set: { name: 'Novo Curso', code: 'NC' } },
            options: { returnDocument: 'after', upsert: false, runValidators: true, context: 'query' },
        }]);
        assert.deepEqual(result, { id: COURSE_ID, name: 'Novo Curso', code: 'NC', active: false });
        assert.equal(calls.create.length, 0);
    });

    test('desativa alterando somente active, mantendo nome, sigla e identificador', async () => {
        const { service, calls } = createFixture();
        const result = await service.deactivateCourse(COURSE_ID);
        assert.deepEqual(result, { id: COURSE_ID, ...VALID_DATA, active: false });
        assert.deepEqual(calls.update[0].update, { $set: { active: false } });
        assert.equal(calls.update[0].options.upsert, false);
        assert.equal(calls.update[0].options.runValidators, true);
        assert.equal(calls.create.length, 0);
    });

    test('retorna ausência na edição e na desativação de recurso inexistente', async () => {
        const { service } = createFixture({ onUpdate: () => null });
        assert.equal(await service.updateCourse(COURSE_ID, VALID_DATA), null);
        assert.equal(await service.deactivateCourse(COURSE_ID), null);
    });

    test('repetir a desativação mantém o estado e editar não reativa o curso', async () => {
        let stored = createDocument();
        const { service } = createFixture({
            onCreate: (data) => { stored = { ...stored, ...data }; return stored; },
            onUpdate: (_id, update) => { stored = { ...stored, ...update.$set }; return stored; },
        });
        await service.createCourse(VALID_DATA);
        const first = await service.deactivateCourse(COURSE_ID);
        assert.deepEqual(await service.deactivateCourse(COURSE_ID), first);
        const edited = await service.updateCourse(COURSE_ID, { name: 'Curso Editado', code: 'CE' });
        assert.equal(edited.id, first.id);
        assert.equal(edited.active, false);
        assert.equal(edited.code, 'CE');
    });

    test('aguarda a escrita antes de confirmar a criação', async () => {
        let resolveWrite;
        const pendingWrite = new Promise((resolve) => { resolveWrite = resolve; });
        const { service } = createFixture({ onCreate: () => pendingWrite });
        let completed = false;
        const result = service.createCourse(VALID_DATA).then((course) => { completed = true; return course; });
        await Promise.resolve();
        assert.equal(completed, false);
        resolveWrite(createDocument());
        assert.equal((await result).id, COURSE_ID);
        assert.equal(completed, true);
    });

    test('não confirma criação com estado ou dados diferentes dos solicitados', async () => {
        for (const document of [undefined, null, createDocument({ active: false }), createDocument({ name: 'Outro Curso' }), createDocument({ code: 'OUTRO' })]) {
            const { service } = createFixture({ onCreate: () => document });
            await assert.rejects(service.createCourse(VALID_DATA), TypeError);
        }
    });

    test('não confirma edição de outra identidade ou com dados divergentes', async () => {
        for (const document of [undefined, createDocument({ _id: OTHER_ID }), createDocument({ name: 'Outro Curso' }), createDocument({ code: 'OUTRO' })]) {
            const { service } = createFixture({ onUpdate: () => document });
            await assert.rejects(service.updateCourse(COURSE_ID, VALID_DATA), TypeError);
        }
    });

    test('não confirma desativação de outra identidade ou de curso ainda ativo', async () => {
        for (const document of [undefined, createDocument(), createDocument({ _id: OTHER_ID, active: false })]) {
            const { service } = createFixture({ onUpdate: () => document });
            await assert.rejects(service.deactivateCourse(COURSE_ID), TypeError);
        }
    });
});

describe('representação pública dos cursos', () => {
    test('aceita ObjectId ou texto hexadecimal e seleciona somente campos públicos', () => {
        for (const id of [new mongoose.Types.ObjectId(COURSE_ID), COURSE_ID.toUpperCase()]) {
            const result = CourseService.createCourseRepresentation(createDocument({ _id: id }));
            assert.deepEqual(result, { id: COURSE_ID, ...VALID_DATA, active: true });
            assert.ok(Object.isFrozen(result));
        }
    });

    test('recusa documentos malformados ou não normalizados sem devolver sucesso', () => {
        for (const document of [
            undefined, null, [], {}, createDocument({ _id: 'inválido' }),
            createDocument({ name: ' Nome ' }), createDocument({ name: 'A' }),
            createDocument({ code: 'minuscula' }), createDocument({ code: 'A'.repeat(21) }),
            createDocument({ active: 'false' }),
        ]) {
            assert.throws(() => CourseService.createCourseRepresentation(document), TypeError);
        }
    });
});

describe('falhas de persistência e conflito de sigla', () => {
    const operations = [
        { label: 'criação', invoke: (service) => service.createCourse(VALID_DATA) },
        { label: 'edição', invoke: (service) => service.updateCourse(COURSE_ID, VALID_DATA) },
        { label: 'desativação', invoke: (service) => service.deactivateCourse(COURSE_ID) },
    ];

    for (const { label, invoke } of operations) {
        test(`${label}: converte conflitos de sigla sem expor metadados do banco`, async () => {
            for (const metadata of [{ keyPattern: { code: 1 } }, { keyValue: { code: 'SIGLA PRIVADA' } }]) {
                const failure = Object.assign(new Error('dados internos do banco'), { code: 11000, ...metadata });
                const fail = async () => { throw failure; };
                const { service } = createFixture({ onCreate: fail, onUpdate: fail });
                await assert.rejects(invoke(service), (error) => assertPublicError(error, 'CODE_CONFLICT'));
            }
        });

        test(`${label}: converte validação, conversão e campos desconhecidos em recusa pública`, async () => {
            for (const name of ['ValidationError', 'CastError', 'StrictModeError']) {
                const failure = Object.assign(new Error('conteúdo privado'), { name });
                const fail = async () => { throw failure; };
                const { service } = createFixture({ onCreate: fail, onUpdate: fail });
                await assert.rejects(invoke(service), (error) => assertPublicError(error, 'INVALID_DATA'));
            }
        });

        test(`${label}: preserva erros inesperados e conflitos de outros índices`, async () => {
            for (const failure of [
                new Error('falha inesperada'),
                Object.assign(new Error('outro índice'), { code: 11000, keyPattern: { externalId: 1 } }),
                Object.assign(new Error('índice composto'), { code: 11000, keyPattern: { code: 1, externalId: 1 } }),
            ]) {
                const fail = async () => { throw failure; };
                const { service } = createFixture({ onCreate: fail, onUpdate: fail });
                await assert.rejects(invoke(service), (error) => error === failure);
            }
        });
    }
});
