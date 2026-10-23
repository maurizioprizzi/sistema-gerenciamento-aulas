import { describe, it, expect, vi, afterEach } from 'vitest';
import {
    CourseApi, CourseApiError, courseApi, defaultFetchClient,
    COURSE_API_PATHS as PATHS, COURSE_API_CODES as CODES,
    COURSE_API_MESSAGES as MESSAGES, COURSE_API_FIELD_LIMITS as LIMITS,
} from './CourseApi';

const ID = '507f1f77bcf86cd799439011';
const SECOND_ID = '507f1f77bcf86cd799439012';
const COURSE = Object.freeze({ id: ID, name: 'Ciência de Dados', code: 'CD', active: true });
const INPUT = Object.freeze({ name: COURSE.name, code: COURSE.code });
const result = course => ({ data: { course } });
const list = courses => ({ data: { courses } });
function response(status, payload) {
    return { status, ok: status >= 200 && status <= 299, json: vi.fn().mockResolvedValue(payload) };
}
function setup(status = 200, payload = list([COURSE])) {
    const fetchClient = vi.fn().mockResolvedValue(response(status, payload));
    return { api: new CourseApi({ fetchClient }), fetchClient };
}
const operations = {
    list: api => api.listCourses(),
    create: api => api.createCourse(INPUT),
    update: api => api.updateCourse(ID, INPUT),
    deactivate: api => api.deactivateCourse(ID),
};

afterEach(() => { vi.unstubAllGlobals(); });

describe('configuração de CourseApi', () => {
    it('constrói sem enviar pedidos e mantém os métodos vinculados', async () => {
        const { api, fetchClient } = setup();
        expect(fetchClient).not.toHaveBeenCalled();
        expect(Object.isFrozen(api)).toBe(true);
        expect(courseApi).toBeInstanceOf(CourseApi);
        const { listCourses } = api;
        expect(await listCourses()).toEqual([COURSE]);
    });
    it('recusa clientes incompatíveis', () => {
        for (const fetchClient of [null, {}, [], 1, 'fetch']) {
            expect(() => new CourseApi({ fetchClient })).toThrow(MESSAGES.INVALID_FETCH_CLIENT);
        }
    });
    it('utiliza fetch do navegador sem enviar durante a construção', async () => {
        const fetchClient = vi.fn().mockResolvedValue(response(200, list([])));
        vi.stubGlobal('fetch', fetchClient);
        const api = new CourseApi();
        expect(fetchClient).not.toHaveBeenCalled();
        await api.listCourses();
        expect(fetchClient).toHaveBeenCalledOnce();
        await defaultFetchClient('/example', { method: 'GET' });
        expect(fetchClient).toHaveBeenLastCalledWith('/example', { method: 'GET' });
    });
    it('expõe limites e constantes imutáveis', () => {
        for (const value of [PATHS, CODES, MESSAGES, LIMITS]) expect(Object.isFrozen(value)).toBe(true);
    });
    it('mantém metadados dos erros imutáveis e valida sua construção', () => {
        const error = new CourseApiError('Mensagem segura.', { statusCode: 409, code: 'COURSE_CODE_CONFLICT' });
        expect(error.name).toBe('CourseApiError');
        expect(() => { error.code = 'OTHER'; }).toThrow();
        expect(() => { error.statusCode = 200; }).toThrow();
        expect(() => new CourseApiError(' ')).toThrow(MESSAGES.INVALID_ERROR_MESSAGE);
        expect(() => new CourseApiError('Erro', { statusCode: 600 })).toThrow(MESSAGES.INVALID_ERROR_STATUS);
        expect(() => new CourseApiError('Erro', { code: '__proto__' })).toThrow(MESSAGES.INVALID_ERROR_CODE);
    });
});

describe('contrato das operações de cursos', () => {
    it('consulta novamente, preserva ordem e devolve cópias públicas imutáveis', async () => {
        const second = { ...COURSE, id: SECOND_ID, active: false };
        const { api, fetchClient } = setup(200, list([{ ...second, privateNote: 'ocultar' }, COURSE]));
        const courses = await api.listCourses();
        expect(courses).toEqual([second, COURSE]);
        expect(Object.isFrozen(courses)).toBe(true);
        expect(Object.isFrozen(courses[0])).toBe(true);
        expect(courses[1]).not.toBe(COURSE);
        await api.listCourses();
        expect(fetchClient).toHaveBeenCalledTimes(2);
        expect(fetchClient).toHaveBeenLastCalledWith('/api/courses', {
            method: 'GET', headers: { Accept: 'application/json' }, credentials: 'same-origin',
            mode: 'same-origin', cache: 'no-store', redirect: 'error',
        });
    });
    it.each([true, false])('traduz filtro booleano active=%s sem perder false', async active => {
        const { api, fetchClient } = setup(200, list([]));
        expect(await api.listCourses({ active })).toEqual([]);
        expect(fetchClient.mock.calls[0][0]).toBe(`/api/courses?active=${active}`);
    });
    it('normaliza nome e sigla antes do POST sem alterar a entrada', async () => {
        const { api, fetchClient } = setup(201, result({ ...COURSE, internalNote: 'ocultar' }));
        const input = { name: '  Cie\u0302ncia   de Dados  ', code: ' cd ' };
        const original = { ...input };
        expect(await api.createCourse(input)).toEqual(COURSE);
        expect(input).toEqual(original);
        expect(fetchClient).toHaveBeenCalledWith('/api/courses', expect.objectContaining({
            method: 'POST', body: JSON.stringify(INPUT),
            headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        }));
    });
    it('PUT usa identificador estável e permite editar curso desativado', async () => {
        const { api, fetchClient } = setup(200, result({ ...COURSE, active: false }));
        expect(await api.updateCourse(ID.toUpperCase(), INPUT)).toEqual({ ...COURSE, active: false });
        expect(fetchClient).toHaveBeenCalledWith(`/api/courses/${ID}`, expect.objectContaining({
            method: 'PUT', body: JSON.stringify(INPUT),
        }));
    });
    it('PATCH confirma desativação sem corpo nem Content-Type', async () => {
        const { api, fetchClient } = setup(200, result({ ...COURSE, active: false }));
        expect(await api.deactivateCourse(ID)).toEqual({ ...COURSE, active: false });
        const [path, options] = fetchClient.mock.calls[0];
        expect(path).toBe(`/api/courses/${ID}/deactivate`);
        expect(options.method).toBe('PATCH');
        expect(options).not.toHaveProperty('body');
        expect(options.headers).not.toHaveProperty('Content-Type');
    });
    it('aguarda a resposta antes de confirmar criação', async () => {
        let release;
        const gate = new Promise(resolve => { release = resolve; });
        const api = new CourseApi({ fetchClient: () => gate });
        let completed = false;
        const pending = api.createCourse(INPUT).then(value => { completed = true; return value; });
        expect(completed).toBe(false);
        release(response(201, result(COURSE)));
        expect(await pending).toEqual(COURSE);
    });
});

describe('validação antes de acessar a rede', () => {
    it('recusa estruturas, campos extras, dados herdados e limites inválidos', async () => {
        const { api, fetchClient } = setup();
        const invalid = [undefined, null, [], new Date(), {},
            { name: 'A', code: 'CD' }, { name: 'x'.repeat(121), code: 'CD' },
            { name: 'Curso', code: ' ' }, { name: 'Curso', code: 'x'.repeat(21) },
            { name: 'Curso', code: 'ß'.repeat(11) }, { name: 12, code: 'CD' },
            { ...INPUT, active: true }, { ...INPUT, _id: ID }, { ...INPUT, [Symbol('extra')]: true },
            Object.create(INPUT)];
        for (const input of invalid) {
            await expect(api.createCourse(input)).rejects.toThrow(MESSAGES.INVALID_DATA);
            await expect(api.updateCourse(ID, input)).rejects.toThrow(MESSAGES.INVALID_DATA);
        }
        expect(fetchClient).not.toHaveBeenCalled();
    });
    it('aceita os limites depois da normalização e objetos sem protótipo', async () => {
        const input = Object.assign(Object.create(null), { name: 'X'.repeat(120), code: 'Y'.repeat(20) });
        const { api } = setup(201, result({ ...COURSE, ...input }));
        expect(await api.createCourse(input)).toEqual({ ...COURSE, ...input });
        expect(CourseApi.createCourseData({ name: 'AB', code: 'a' })).toEqual({ name: 'AB', code: 'A' });
    });
    it('recusa filtros ambíguos e propriedades desconhecidas', async () => {
        const { api, fetchClient } = setup();
        for (const filters of [null, [], 'active', { active: 'true' }, { active: undefined },
            { active: 1 }, { code: 'CD' }, { [Symbol('extra')]: true }]) {
            await expect(api.listCourses(filters)).rejects.toThrow(MESSAGES.INVALID_FILTERS);
        }
        expect(fetchClient).not.toHaveBeenCalled();
    });
    it('recusa identificadores inválidos antes de editar ou desativar', async () => {
        const { api, fetchClient } = setup();
        for (const id of [undefined, null, 1, {}, '', 'invalid', ` ${ID}`, `${ID}/deactivate`]) {
            await expect(api.updateCourse(id, INPUT)).rejects.toThrow(MESSAGES.INVALID_ID);
            await expect(api.deactivateCourse(id)).rejects.toThrow(MESSAGES.INVALID_ID);
        }
        expect(fetchClient).not.toHaveBeenCalled();
    });
});

describe('respostas que não podem confirmar sucesso', () => {
    it.each([
        null, {}, { data: [] }, { data: {} }, list(null), list([null]),
        list([{ ...COURSE, id: 'invalid' }]), list([{ ...COURSE, active: 'true' }]),
        list([{ ...COURSE, code: 'cd' }]), list([{ ...COURSE, name: '  Curso' }]),
        list([COURSE, COURSE]),
    ])('recusa listagem inconsistente %#', async payload => {
        const { api } = setup(200, payload);
        await expect(api.listCourses()).rejects.toMatchObject({ code: CODES.INVALID_RESPONSE, statusCode: 200 });
    });
    it.each([
        ['create', 200, result(COURSE)], ['create', 201, result({ ...COURSE, active: false })],
        ['create', 201, result({ ...COURSE, name: 'Outro Curso' })],
        ['update', 200, result({ ...COURSE, id: SECOND_ID })],
        ['update', 200, result({ ...COURSE, code: 'OUTRO' })],
        ['deactivate', 204, null], ['deactivate', 200, result(COURSE)],
        ['deactivate', 200, result({ ...COURSE, id: SECOND_ID, active: false })],
        ['update', 200, result(null)],
    ])('recusa confirmação inconsistente de %s, caso %#', async (operation, status, payload) => {
        const { api } = setup(status, payload);
        await expect(operations[operation](api)).rejects.toMatchObject({ code: CODES.INVALID_RESPONSE });
    });
    it.each([null, {}, { status: '200', ok: true }, { status: 0, ok: false },
        { status: 200, ok: false }, { status: 403, ok: true }, { status: 600, ok: false }])(
        'recusa metadados HTTP incompatíveis %#', async metadata => {
            const api = new CourseApi({ fetchClient: vi.fn().mockResolvedValue(metadata) });
            await expect(api.listCourses()).rejects.toMatchObject({ code: CODES.INVALID_RESPONSE });
        },
    );
    it('sucesso sem leitura JSON ou com leitura que falha é recusado', async () => {
        for (const received of [{ status: 200, ok: true },
            { status: 200, ok: true, json: async () => { throw new Error('detalhe interno'); } }]) {
            const api = new CourseApi({ fetchClient: vi.fn().mockResolvedValue(received) });
            await expect(api.listCourses()).rejects.toMatchObject({ code: CODES.INVALID_RESPONSE });
        }
    });
});

describe('recusas públicas e falhas de comunicação', () => {
    it.each([
        ['list', 401, 'AUTHENTICATION_REQUIRED', MESSAGES.AUTHENTICATION_REQUIRED],
        ['list', 403, 'ADMINISTRATIVE_ACCESS_REQUIRED', MESSAGES.ADMINISTRATIVE_ACCESS_REQUIRED],
        ['list', 400, 'INVALID_COURSE_FILTERS', MESSAGES.INVALID_FILTERS],
        ['create', 400, 'INVALID_COURSE_DATA', MESSAGES.INVALID_DATA],
        ['create', 409, 'COURSE_CODE_CONFLICT', MESSAGES.CODE_CONFLICT],
        ['update', 400, 'INVALID_COURSE_ID', MESSAGES.INVALID_ID],
        ['update', 404, 'COURSE_NOT_FOUND', MESSAGES.NOT_FOUND],
        ['deactivate', 404, 'COURSE_NOT_FOUND', MESSAGES.NOT_FOUND],
    ])('reconhece %s HTTP %s / %s com mensagem local', async (operation, status, code, message) => {
        const { api } = setup(status, { error: { code, message: 'detalhe privado recebido' } });
        await expect(operations[operation](api)).rejects.toMatchObject({ code, statusCode: status, message });
    });
    it.each([
        ['list', 409, 'COURSE_CODE_CONFLICT'], ['create', 403, 'COURSE_NOT_FOUND'],
        ['list', 400, '__proto__'], ['list', 500, 'AUTHENTICATION_REQUIRED'],
        ['create', 400, 'UNKNOWN_ERROR'],
    ])('combinação desconhecida de %s HTTP %s / %s usa erro genérico', async (operation, status, code) => {
        const { api } = setup(status, { error: { code, message: 'detalhe privado' } });
        await expect(operations[operation](api)).rejects.toMatchObject({
            code: CODES.REQUEST_FAILED, message: MESSAGES.REQUEST_FAILED, statusCode: status,
        });
    });
    it('recusa HTTP sem JSON legível continua sendo falha', async () => {
        const api = new CourseApi({ fetchClient: vi.fn().mockResolvedValue({ status: 500, ok: false,
            json: async () => { throw new Error('detalhe privado'); } }) });
        await expect(api.listCourses()).rejects.toMatchObject({ code: CODES.REQUEST_FAILED, statusCode: 500 });
    });
    it.each(Object.keys(operations))('falha de rede em %s não expõe a causa nem repete o pedido', async operation => {
        const fetchClient = vi.fn().mockRejectedValue(new Error('token privado de teste'));
        const api = new CourseApi({ fetchClient });
        const error = await operations[operation](api).catch(value => value);
        expect(error).toBeInstanceOf(CourseApiError);
        expect(error.code).toBe(CODES.NETWORK_ERROR);
        expect(error.message).toBe(MESSAGES.NETWORK_ERROR);
        expect(error).not.toHaveProperty('cause');
        expect(fetchClient).toHaveBeenCalledOnce();
    });
});
