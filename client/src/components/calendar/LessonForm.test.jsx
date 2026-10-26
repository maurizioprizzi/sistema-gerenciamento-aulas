import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { LESSON_API_MESSAGES, LessonApiError } from '../../services/LessonApi.js';
import {
    INITIAL_LESSON_FORM_DATA, LESSON_FORM_MESSAGES, LessonForm,
    createEditingLessonFormData, createInitialLessonFormData,
} from './LessonForm.jsx';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const ID = '507f1f77bcf86cd799439011';
const COURSE_A = '507f1f77bcf86cd7994390ab';
const COURSE_B = '507f1f77bcf86cd7994390ac';
const COURSE_C = '507f1f77bcf86cd7994390ad';
const COURSES = Object.freeze([
    Object.freeze({ id: COURSE_A, name: 'Ciência de Dados', code: 'CD', active: true }),
    Object.freeze({ id: COURSE_B, name: 'Redes de Computadores', code: 'RC', active: true }),
    Object.freeze({ id: COURSE_C, name: 'Administração', code: 'ADM', active: false }),
]);

function lesson(overrides = {}) {
    return {
        id: ID, date: '2026-10-25', courseId: COURSE_A, course: 'CD',
        curricularUnit: 'Qualidade de Software', type: 'Aula', lessonNumber: '12',
        needsReview: false, lessonPlanUrl: null, studentGuideUrl: null, ...overrides,
    };
}
function service() {
    const representation = (data) => lesson({
        ...data, course: COURSES.find((course) => course.id === data.courseId)?.code,
        internalValue: 'não deve ser publicado',
    });
    return {
        createLesson: vi.fn(async (data) => representation(data)),
        updateLesson: vi.fn(async (_id, data) => representation(data)),
    };
}
function catalog(overrides = {}) {
    return { courses: COURSES, isLoading: false, errorMessage: null, reload: vi.fn(), ...overrides };
}
function mount(overrides = {}) {
    const props = {
        lessonService: service(), courseCatalog: catalog(),
        onLessonCreated: vi.fn(), onLessonUpdated: vi.fn(), onEditCancelled: vi.fn(),
        ...overrides,
    };
    const view = render(<LessonForm {...props} />);
    return { props, ...view };
}
async function fill(user) {
    fireEvent.change(screen.getByLabelText('Data'), { target: { value: '2026-10-25' } });
    await user.selectOptions(screen.getByLabelText('Curso'), COURSE_A);
    await user.type(screen.getByLabelText('Unidade curricular'), 'Qualidade de Software');
}
function deferred() {
    let resolve;
    const promise = new Promise((done) => { resolve = done; });
    return { promise, resolve };
}

describe('configuração e preenchimento do formulário por identidade', () => {
    test('valores iniciais são independentes e usam courseId em vez de sigla', () => {
        const first = createInitialLessonFormData();
        const second = createInitialLessonFormData();
        expect(first).toEqual(INITIAL_LESSON_FORM_DATA);
        expect(first).not.toBe(second);
        expect(first.courseId).toBe('');
        expect(Object.hasOwn(first, 'course')).toBe(false);
        expect(Object.isFrozen(INITIAL_LESSON_FORM_DATA)).toBe(true);
    });

    test('recusa dependências e confirmações inválidas', () => {
        for (const lessonService of [null, {}, [], { createLesson: true }]) {
            expect(() => mount({ lessonService })).toThrowError(LESSON_FORM_MESSAGES.INVALID_LESSON_SERVICE);
        }
        expect(() => mount({ onLessonCreated: null })).toThrowError(LESSON_FORM_MESSAGES.INVALID_CREATED_HANDLER);
        expect(() => mount({ lessonToEdit: lesson(), onLessonUpdated: null }))
            .toThrowError(LESSON_FORM_MESSAGES.INVALID_UPDATED_HANDLER);
        expect(() => mount({ lessonToEdit: lesson(), onEditCancelled: null }))
            .toThrowError(LESSON_FORM_MESSAGES.INVALID_CANCEL_HANDLER);
    });

    test('recusa aula ou estado de catálogo inconsistentes', () => {
        expect(() => mount({ lessonToEdit: {} })).toThrowError(LESSON_FORM_MESSAGES.INVALID_EDITING_LESSON);
        expect(() => mount({ courseCatalog: null })).toThrowError(LESSON_FORM_MESSAGES.INVALID_CATALOG);
        expect(() => mount({ courseCatalog: catalog({ isLoading: 'false' }) }))
            .toThrowError(LESSON_FORM_MESSAGES.INVALID_CATALOG);
    });

    test('apresenta oito campos acessíveis e os cursos ativos com nome e sigla', () => {
        const { props } = mount();
        for (const label of ['Data', 'Curso', 'Unidade curricular', 'Tipo', 'Número da aula',
            'Link do Plano de Aula', 'Link do Guia e das Atividades', 'Marcar para revisão']) {
            expect(screen.getByLabelText(label)).toBeTruthy();
        }
        expect(screen.getByRole('option', { name: 'CD — Ciência de Dados' }).value).toBe(COURSE_A);
        expect(screen.queryByRole('option', { name: /Administração/ })).toBeNull();
        expect(screen.queryByRole('option', { name: /APQSA|TECMKT|TECADM/ })).toBeNull();
        expect(props.lessonService.createLesson).not.toHaveBeenCalled();
    });

    test('catálogo compartilhado não provoca consulta HTTP adicional', () => {
        const fetchClient = vi.fn();
        vi.stubGlobal('fetch', fetchClient);
        mount();
        expect(fetchClient).not.toHaveBeenCalled();
    });

    test('consulta o catálogo quando o formulário é usado de forma independente', async () => {
        const courseService = { listCourses: vi.fn().mockResolvedValue(COURSES) };
        mount({ courseCatalog: undefined, courseService });
        expect(screen.getByText('Carregando cursos...')).toBeTruthy();
        await screen.findByRole('option', { name: 'CD — Ciência de Dados' });
        expect(courseService.listCourses).toHaveBeenCalledExactlyOnceWith({});
    });

    test('carregamento bloqueia curso e envio sem descartar os demais campos', () => {
        const { rerender, props } = mount({ courseCatalog: catalog({ courses: [], isLoading: true }) });
        fireEvent.change(screen.getByLabelText('Unidade curricular'), { target: { value: 'Rascunho' } });
        expect(screen.getByLabelText('Curso').disabled).toBe(true);
        expect(screen.getByRole('button', { name: 'Cadastrar registro' }).disabled).toBe(true);
        rerender(<LessonForm {...props} courseCatalog={catalog()} />);
        expect(screen.getByLabelText('Unidade curricular').value).toBe('Rascunho');
        expect(screen.getByLabelText('Curso').disabled).toBe(false);
    });

    test('catálogo vazio orienta cadastrar curso e não permite envio', () => {
        mount({ courseCatalog: catalog({ courses: [] }) });
        expect(screen.getByText(/Cadastre um curso ativo na seção Cursos/)).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Cadastrar registro' }).disabled).toBe(true);
    });

    test('falha no catálogo permite pedir nova consulta sem submeter uma aula', async () => {
        const user = userEvent.setup();
        const state = catalog({ courses: [], errorMessage: 'Falha pública do catálogo.' });
        const { props } = mount({ courseCatalog: state });
        expect(screen.getByRole('alert').textContent).toContain(state.errorMessage);
        await user.click(screen.getByRole('button', { name: 'Tentar carregar cursos novamente' }));
        expect(state.reload).toHaveBeenCalledOnce();
        expect(props.lessonService.createLesson).not.toHaveBeenCalled();
    });
});

describe('gravação de aulas com curso personalizado', () => {
    test('envio pelo teclado entrega os oito campos normalizados e confirma somente os públicos', async () => {
        const user = userEvent.setup();
        const { props } = mount();
        await fill(user);
        await user.keyboard('{Enter}');
        await waitFor(() => expect(props.onLessonCreated).toHaveBeenCalledOnce());
        expect(props.lessonService.createLesson).toHaveBeenCalledWith({
            date: '2026-10-25', courseId: COURSE_A, curricularUnit: 'Qualidade de Software',
            type: 'Aula', lessonNumber: null, needsReview: false,
            lessonPlanUrl: null, studentGuideUrl: null,
        });
        expect(props.onLessonCreated.mock.calls[0][0].courseId).toBe(COURSE_A);
        expect(Object.hasOwn(props.onLessonCreated.mock.calls[0][0], 'internalValue')).toBe(false);
        expect(screen.getByLabelText('Curso').value).toBe('');
        expect(screen.getByLabelText('Unidade curricular').value).toBe('');
        expect(screen.getByText(LESSON_FORM_MESSAGES.CREATE_SUCCESS)).toBeTruthy();
    });

    test('campos obrigatórios ausentes não permitem submissão', () => {
        const { props } = mount();
        fireEvent.submit(screen.getByRole('form', { name: 'Cadastro de aula' }));
        expect(props.lessonService.createLesson).not.toHaveBeenCalled();
    });

    test('operação pendente bloqueia todos os campos e impede outro envio', async () => {
        const user = userEvent.setup();
        const pending = deferred();
        const lessonService = service();
        lessonService.createLesson.mockReturnValue(pending.promise);
        const { props } = mount({ lessonService });
        await fill(user);
        await user.click(screen.getByRole('button', { name: 'Cadastrar registro' }));
        for (const field of screen.getByRole('form', { name: 'Cadastro de aula' }).elements) {
            expect(field.disabled).toBe(true);
        }
        fireEvent.submit(screen.getByRole('form', { name: 'Cadastro de aula' }));
        expect(lessonService.createLesson).toHaveBeenCalledOnce();
        await act(async () => pending.resolve(lesson()));
        expect(props.onLessonCreated).toHaveBeenCalledOnce();
    });

    test('recusa pública preserva os campos, limpa a mensagem ao corrigir e permite repetir', async () => {
        const user = userEvent.setup();
        const lessonService = service();
        lessonService.createLesson.mockRejectedValueOnce(new LessonApiError('Escolha um curso ativo.', {
            statusCode: 409, code: 'LESSON_COURSE_INACTIVE',
        }));
        mount({ lessonService });
        await fill(user);
        await user.click(screen.getByRole('button', { name: 'Cadastrar registro' }));
        expect(screen.getByRole('alert').textContent).toBe('Escolha um curso ativo.');
        expect(screen.getByLabelText('Curso').value).toBe(COURSE_A);
        await user.type(screen.getByLabelText('Unidade curricular'), ' revisada');
        expect(screen.queryByRole('alert')).toBeNull();
        await user.click(screen.getByRole('button', { name: 'Cadastrar registro' }));
        expect(lessonService.createLesson).toHaveBeenCalledTimes(2);
    });

    test('falha inesperada não revela detalhes nem limpa o preenchimento', async () => {
        const user = userEvent.setup();
        const lessonService = service();
        lessonService.createLesson.mockRejectedValue(new Error('detalhe privado'));
        mount({ lessonService });
        await fill(user);
        await user.click(screen.getByRole('button', { name: 'Cadastrar registro' }));
        expect(screen.getByRole('alert').textContent).toBe(LESSON_FORM_MESSAGES.UNEXPECTED_CREATE_ERROR);
        expect(screen.getByLabelText('Curso').value).toBe(COURSE_A);
    });

    test('confirmação ausente, incompleta ou de outro vínculo não produz sucesso', async () => {
        const user = userEvent.setup();
        for (const response of [null, { id: ID }, lesson({ courseId: COURSE_B, course: 'RC' })]) {
            const lessonService = service();
            lessonService.createLesson.mockResolvedValue(response);
            const { props, unmount } = mount({ lessonService });
            await fill(user);
            await user.click(screen.getByRole('button', { name: 'Cadastrar registro' }));
            expect(props.onLessonCreated).not.toHaveBeenCalled();
            expect(screen.getByLabelText('Curso').value).toBe(COURSE_A);
            expect(screen.getByRole('alert').textContent).toBe(response?.courseId === COURSE_B
                ? LESSON_FORM_MESSAGES.UNEXPECTED_CREATE_ERROR : LESSON_API_MESSAGES.INVALID_RESPONSE);
            unmount();
        }
    });
});

describe('edição e preservação do vínculo', () => {
    test('preenche a edição pelo ID e converte campos opcionais para os controles', () => {
        const state = createEditingLessonFormData(lesson());
        expect(state.originalCourseId).toBe(COURSE_A);
        expect(state.formData.courseId).toBe(COURSE_A);
        expect(state.formData.lessonPlanUrl).toBe('');
        expect(Object.hasOwn(state.formData, 'course')).toBe(false);
    });

    test('permite manter o curso desativado original e não oferece outros desativados', async () => {
        const user = userEvent.setup();
        const { props } = mount({ lessonToEdit: lesson({ courseId: COURSE_C, course: 'ADM' }) });
        expect(screen.getByLabelText('Curso').value).toBe(COURSE_C);
        expect(screen.getByRole('option', { name: /ADM — Administração.*desativado/ })).toBeTruthy();
        expect(screen.getByText(/Você pode mantê-lo nesta aula/)).toBeTruthy();
        await user.click(screen.getByRole('button', { name: 'Salvar alterações' }));
        expect(props.lessonService.updateLesson).toHaveBeenCalledWith(ID,
            expect.objectContaining({ courseId: COURSE_C }));
        expect(props.onLessonUpdated).toHaveBeenCalledOnce();
    });

    test('troca para curso ativo e atualiza quais vínculos podem ser mantidos após salvar', async () => {
        const user = userEvent.setup();
        mount({ lessonToEdit: lesson({ courseId: COURSE_C, course: 'ADM' }) });
        await user.selectOptions(screen.getByLabelText('Curso'), COURSE_B);
        await user.click(screen.getByRole('button', { name: 'Salvar alterações' }));
        await waitFor(() => expect(screen.queryByRole('option', { name: /Administração/ })).toBeNull());
        expect(screen.getByLabelText('Curso').value).toBe(COURSE_B);
    });

    test('registro antigo exige escolha explícita sem associar curso pela coincidência de sigla', async () => {
        const user = userEvent.setup();
        const legacy = lesson({ course: 'APQSA' });
        delete legacy.courseId;
        const { props } = mount({ lessonToEdit: legacy });
        expect(screen.getByLabelText('Curso').value).toBe('');
        expect(screen.getByText(/Este registro ainda usa um curso antigo/)).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Salvar alterações' }).disabled).toBe(true);
        await user.selectOptions(screen.getByLabelText('Curso'), COURSE_A);
        await user.click(screen.getByRole('button', { name: 'Salvar alterações' }));
        expect(props.lessonService.updateLesson).toHaveBeenCalledWith(ID,
            expect.objectContaining({ courseId: COURSE_A }));
    });

    test('curso vinculado ausente bloqueia a gravação até a escolha de um curso ativo', async () => {
        const user = userEvent.setup();
        mount({ lessonToEdit: lesson(), courseCatalog: catalog({ courses: [COURSES[1]] }) });
        expect(screen.getByRole('alert').textContent).toContain('O curso vinculado não foi encontrado');
        expect(screen.getByRole('button', { name: 'Salvar alterações' }).disabled).toBe(true);
        await user.selectOptions(screen.getByLabelText('Curso'), COURSE_B);
        expect(screen.getByRole('button', { name: 'Salvar alterações' }).disabled).toBe(false);
    });

    test('cancelar não grava; cancelamento fica bloqueado durante o envio', async () => {
        const user = userEvent.setup();
        const pending = deferred();
        const lessonService = service();
        lessonService.updateLesson.mockReturnValue(pending.promise);
        const { props } = mount({ lessonToEdit: lesson(), lessonService });
        await user.click(screen.getByRole('button', { name: 'Cancelar edição' }));
        expect(props.onEditCancelled).toHaveBeenCalledOnce();
        expect(lessonService.updateLesson).not.toHaveBeenCalled();
        await user.click(screen.getByRole('button', { name: 'Salvar alterações' }));
        expect(screen.getByRole('button', { name: 'Cancelar edição' }).disabled).toBe(true);
        await act(async () => pending.resolve(lesson()));
    });

    test('recusa de edição preserva dados e não anuncia atualização', async () => {
        const user = userEvent.setup();
        const lessonService = service();
        lessonService.updateLesson.mockRejectedValue(new LessonApiError('Atualize a lista.', {
            statusCode: 409, code: 'LESSON_CHANGED',
        }));
        const { props } = mount({ lessonToEdit: lesson(), lessonService });
        await user.click(screen.getByRole('button', { name: 'Salvar alterações' }));
        expect(screen.getByRole('alert').textContent).toBe('Atualize a lista.');
        expect(screen.getByLabelText('Curso').value).toBe(COURSE_A);
        expect(props.onLessonUpdated).not.toHaveBeenCalled();
    });

    test('resposta referente a outra aula não confirma edição', async () => {
        const user = userEvent.setup();
        const lessonService = service();
        lessonService.updateLesson.mockResolvedValue(lesson({ id: '507f1f77bcf86cd799439012' }));
        const { props } = mount({ lessonToEdit: lesson(), lessonService });
        await user.click(screen.getByRole('button', { name: 'Salvar alterações' }));
        expect(props.onLessonUpdated).not.toHaveBeenCalled();
        expect(screen.getByRole('alert').textContent).toBe(LESSON_FORM_MESSAGES.UNEXPECTED_UPDATE_ERROR);
    });
});

describe('proteção do preenchimento e das respostas anteriores', () => {
    test('reapresentar a mesma aula preserva o rascunho; selecionar outra aula reinicia os campos', async () => {
        const user = userEvent.setup();
        const { props, rerender } = mount({ lessonToEdit: lesson() });
        await user.type(screen.getByLabelText('Unidade curricular'), ' revisada');
        rerender(<LessonForm {...props} lessonToEdit={lesson()} />);
        expect(screen.getByLabelText('Unidade curricular').value).toBe('Qualidade de Software revisada');
        rerender(<LessonForm {...props} lessonToEdit={lesson({ id: '507f1f77bcf86cd799439012', curricularUnit: 'Outra unidade' })} />);
        expect(screen.getByLabelText('Unidade curricular').value).toBe('Outra unidade');
    });

    test('conclusão depois da desmontagem não dispara confirmação na seção', async () => {
        const user = userEvent.setup();
        const pending = deferred();
        const lessonService = service();
        lessonService.createLesson.mockReturnValue(pending.promise);
        const { props, unmount } = mount({ lessonService });
        await fill(user);
        await user.click(screen.getByRole('button', { name: 'Cadastrar registro' }));
        unmount();
        await act(async () => pending.resolve(lesson()));
        expect(props.onLessonCreated).not.toHaveBeenCalled();
    });

    test('trocar o serviço ignora a gravação pendente da dependência anterior', async () => {
        const user = userEvent.setup();
        const pending = deferred();
        const previousService = service();
        previousService.updateLesson.mockReturnValue(pending.promise);
        const { props, rerender } = mount({ lessonToEdit: lesson(), lessonService: previousService });
        await user.click(screen.getByRole('button', { name: 'Salvar alterações' }));
        rerender(<LessonForm {...props} lessonService={service()} />);
        await act(async () => pending.resolve(lesson()));
        expect(props.onLessonUpdated).not.toHaveBeenCalled();
        expect(screen.getByRole('button', { name: 'Salvar alterações' }).disabled).toBe(false);
    });
});
