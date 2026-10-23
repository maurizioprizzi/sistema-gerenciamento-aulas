import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CourseApiError } from '../../services/CourseApi.js';
import { CourseManagement, COURSE_MANAGEMENT_MESSAGES as MESSAGES } from './CourseManagement.jsx';

const FIRST = Object.freeze({ id: '507f1f77bcf86cd799439011', name: 'Ciência de Dados', code: 'CD', active: true });
const SECOND = Object.freeze({ id: '507f1f77bcf86cd799439012', name: 'Artes Visuais', code: 'AV', active: false });
const NEW_ID = '507f1f77bcf86cd799439013';
function service(courses = [FIRST, SECOND]) {
    return {
        listCourses: vi.fn().mockResolvedValue(courses),
        createCourse: vi.fn(async input => ({ id: NEW_ID, ...input, active: true })),
        updateCourse: vi.fn(async (id, input) => ({ id, ...input, active: id === FIRST.id })),
        deactivateCourse: vi.fn(async id => ({ ...FIRST, id, active: false })),
    };
}
function setup(courseService = service()) {
    return { courseService, ...render(<CourseManagement courseService={courseService} />) };
}
async function ready() {
    await waitFor(() => expect(screen.queryByText('Carregando cursos...')).toBeNull());
}
function fill(name = 'Biologia Aplicada', code = ' ba ') {
    fireEvent.change(screen.getByLabelText('Nome do curso'), { target: { value: name } });
    fireEvent.change(screen.getByLabelText('Sigla'), { target: { value: code } });
}
function deferred() {
    let resolve;
    const promise = new Promise(release => { resolve = release; });
    return { promise, resolve };
}
function form() { return screen.getByRole('form'); }
function submit() { fireEvent.submit(form()); }
const user = () => userEvent.setup();
afterEach(() => cleanup());

describe('consulta e apresentação do catálogo', () => {
    it('recusa serviço incompleto sem abrir recursos', () => {
        for (const invalid of [null, [], {}, ...Object.keys(service()).map(key => ({ ...service(), [key]: null }))]) {
            expect(() => setup(invalid)).toThrow(MESSAGES.INVALID_SERVICE);
        }
    });
    it('consulta todas as situações uma vez e apresenta o catálogo vazio', async () => {
        const { courseService } = setup(service([]));
        expect(screen.getByText('Carregando cursos...')).toBeTruthy();
        await ready();
        expect(courseService.listCourses).toHaveBeenCalledExactlyOnceWith();
        expect(screen.getByText('Nenhum curso cadastrado. Use Novo curso para começar.')).toBeTruthy();
        expect(screen.queryByRole('form')).toBeNull();
        expect(screen.getByRole('button', { name: 'Novo curso' }).disabled).toBe(false);
    });
    it('ordena e apresenta somente nome, sigla e situação dos cursos', async () => {
        setup(service([{ ...FIRST, internalNote: 'DADO-INTERNO' }, SECOND]));
        await ready();
        expect(screen.getAllByRole('article').map(card => within(card).getByRole('heading').textContent))
            .toEqual([SECOND.name, FIRST.name]);
        expect(screen.getByText('2 de 2 cursos')).toBeTruthy();
        expect(screen.queryByText('DADO-INTERNO')).toBeNull();
        expect(screen.getByRole('button', { name: 'Editar curso AV' })).toBeTruthy();
        expect(screen.queryByRole('button', { name: 'Desativar curso AV' })).toBeNull();
    });
    it('filtra ativos e desativados sem consultar novamente', async () => {
        const { courseService } = setup(); await ready();
        await user().selectOptions(screen.getByLabelText('Situação dos cursos'), 'active');
        expect(screen.getAllByRole('article')).toHaveLength(1);
        expect(screen.getByRole('article', { name: FIRST.name })).toBeTruthy();
        await user().selectOptions(screen.getByLabelText('Situação dos cursos'), 'inactive');
        expect(screen.getByRole('article', { name: SECOND.name })).toBeTruthy();
        expect(screen.queryByRole('article', { name: FIRST.name })).toBeNull();
        expect(courseService.listCourses).toHaveBeenCalledOnce();
    });
    it('erro inicial permite repetir a consulta sem apresentar um falso catálogo vazio', async () => {
        const api = service([]);
        api.listCourses.mockRejectedValueOnce(new Error('detalhe privado'));
        setup(api); await ready();
        expect(screen.getByRole('alert').textContent).toBe(MESSAGES.LOAD_ERROR);
        expect(screen.queryByText('Nenhum curso cadastrado. Use Novo curso para começar.')).toBeNull();
        expect(screen.getByRole('button', { name: 'Novo curso' }).disabled).toBe(true);
        await user().click(screen.getByRole('button', { name: 'Atualizar lista' }));
        await waitFor(() => expect(screen.getByText('0 de 0 cursos')).toBeTruthy());
        expect(api.listCourses).toHaveBeenCalledTimes(2);
    });
    it.each([undefined, null, {}, [FIRST, FIRST], [{ ...FIRST, active: 'true' }]])(
        'resposta de listagem inválida não se torna estado vazio %#', async received => {
            const api = service(); api.listCourses.mockResolvedValue(received);
            setup(api); await ready();
            expect(screen.getByRole('alert')).toBeTruthy();
            expect(screen.queryByText('0 de 0 cursos')).toBeNull();
        },
    );
    it('atualização da lista mantém o filtro e preserva os dados se a consulta falhar', async () => {
        const { courseService } = setup(); await ready();
        await user().selectOptions(screen.getByLabelText('Situação dos cursos'), 'inactive');
        courseService.listCourses.mockRejectedValueOnce(new Error('falha técnica'));
        await user().click(screen.getByRole('button', { name: 'Atualizar lista' }));
        await ready();
        expect(screen.getByRole('alert').textContent).toBe(MESSAGES.LOAD_ERROR);
        expect(screen.getByLabelText('Situação dos cursos').value).toBe('inactive');
        expect(screen.getByRole('article', { name: SECOND.name })).toBeTruthy();
    });
});

describe('cadastro e edição a partir da tela', () => {
    it('abre e cancela cadastro sem gravar', async () => {
        const { courseService } = setup(); await ready();
        await user().click(screen.getByRole('button', { name: 'Novo curso' }));
        fill();
        await user().click(screen.getByRole('button', { name: 'Cancelar', exact: true }));
        expect(screen.queryByRole('form')).toBeNull();
        expect(courseService.createCourse).not.toHaveBeenCalled();
    });
    it('cadastra, fecha o formulário e insere a confirmação na ordem do catálogo', async () => {
        const { courseService } = setup(); await ready();
        await user().click(screen.getByRole('button', { name: 'Novo curso' }));
        fill(); submit();
        await waitFor(() => expect(screen.getByText(MESSAGES.CREATE_SUCCESS)).toBeTruthy());
        expect(courseService.createCourse).toHaveBeenCalledExactlyOnceWith({ name: 'Biologia Aplicada', code: 'BA' });
        expect(screen.queryByRole('form')).toBeNull();
        expect(screen.getAllByRole('article').map(card => within(card).getByRole('heading').textContent))
            .toEqual([SECOND.name, 'Biologia Aplicada', FIRST.name]);
        expect(courseService.listCourses).toHaveBeenCalledOnce();
    });
    it('gravação pendente bloqueia controles e uma segunda solicitação', async () => {
        const gate = deferred(); const api = service(); api.createCourse.mockReturnValue(gate.promise);
        setup(api); await ready();
        await user().click(screen.getByRole('button', { name: 'Novo curso' }));
        fill(); submit(); submit();
        expect(api.createCourse).toHaveBeenCalledOnce();
        expect(screen.getByRole('button', { name: 'Salvando...' }).disabled).toBe(true);
        expect(screen.getByRole('button', { name: 'Cancelar', exact: true }).disabled).toBe(true);
        expect(screen.getByLabelText('Situação dos cursos').disabled).toBe(true);
        expect(screen.getByRole('button', { name: 'Atualizar lista' }).disabled).toBe(true);
        await act(async () => gate.resolve({ id: NEW_ID, name: 'Biologia Aplicada', code: 'BA', active: true }));
        expect(screen.queryByRole('form')).toBeNull();
    });
    it('recusa pública preserva os campos e permite corrigir e repetir', async () => {
        const api = service();
        api.createCourse.mockRejectedValueOnce(new CourseApiError('Esta sigla já existe.', {
            statusCode: 409, code: 'COURSE_CODE_CONFLICT',
        }));
        setup(api); await ready();
        await user().click(screen.getByRole('button', { name: 'Novo curso' }));
        fill(); submit();
        await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Esta sigla já existe.'));
        expect(screen.getByLabelText('Nome do curso').value).toBe('Biologia Aplicada');
        expect(screen.getByLabelText('Sigla').value).toBe(' ba ');
        fill('Curso Livre', 'CL'); submit();
        await waitFor(() => expect(screen.getByText(MESSAGES.CREATE_SUCCESS)).toBeTruthy());
        expect(api.createCourse).toHaveBeenCalledTimes(2);
    });
    it('falha inesperada não expõe detalhes nem fecha o formulário', async () => {
        const api = service(); api.createCourse.mockRejectedValue(new Error('senha-interna-teste'));
        setup(api); await ready();
        await user().click(screen.getByRole('button', { name: 'Novo curso' }));
        fill(); submit();
        await waitFor(() => expect(screen.getByRole('alert').textContent).toBe(MESSAGES.SAVE_ERROR));
        expect(screen.queryByText('senha-interna-teste')).toBeNull();
        expect(screen.getByRole('form')).toBeTruthy();
        expect(screen.getAllByRole('article')).toHaveLength(2);
    });
    it.each([
        { id: NEW_ID, name: 'Outro Nome', code: 'BA', active: true },
        { id: NEW_ID, name: 'Biologia Aplicada', code: 'BA', active: false },
        { ...FIRST, name: 'Biologia Aplicada', code: 'BA' },
    ])('confirmação inconsistente não altera o catálogo nem anuncia sucesso %#', async received => {
        const api = service(); api.createCourse.mockResolvedValue(received);
        setup(api); await ready();
        await user().click(screen.getByRole('button', { name: 'Novo curso' }));
        fill(); submit();
        await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
        expect(screen.queryByText(MESSAGES.CREATE_SUCCESS)).toBeNull();
        expect(screen.getAllByRole('article')).toHaveLength(2);
    });
    it('cancela edição sem acessar a escrita e impede desativação durante a edição', async () => {
        const { courseService } = setup(); await ready();
        await user().click(screen.getByRole('button', { name: 'Editar curso CD' }));
        expect(screen.getByLabelText('Nome do curso').value).toBe(FIRST.name);
        expect(screen.getByRole('button', { name: 'Desativar curso CD' }).disabled).toBe(true);
        await user().click(screen.getByRole('button', { name: 'Cancelar', exact: true }));
        expect(courseService.updateCourse).not.toHaveBeenCalled();
    });
    it('edita pela identidade e preserva o filtro depois de salvar', async () => {
        const { courseService } = setup(); await ready();
        await user().selectOptions(screen.getByLabelText('Situação dos cursos'), 'active');
        await user().click(screen.getByRole('button', { name: 'Editar curso CD' }));
        fill('Análise de Dados', 'AD'); submit();
        await waitFor(() => expect(screen.getByText(MESSAGES.UPDATE_SUCCESS)).toBeTruthy());
        expect(courseService.updateCourse).toHaveBeenCalledExactlyOnceWith(FIRST.id, { name: 'Análise de Dados', code: 'AD' });
        expect(screen.getByLabelText('Situação dos cursos').value).toBe('active');
        expect(screen.getByRole('article', { name: 'Análise de Dados' })).toBeTruthy();
        expect(screen.queryByRole('article', { name: SECOND.name })).toBeNull();
    });
    it('editar um curso desativado preserva sua situação', async () => {
        setup(); await ready();
        await user().click(screen.getByRole('button', { name: 'Editar curso AV' }));
        fill('Artes e Cultura', 'AC'); submit();
        const card = await screen.findByRole('article', { name: 'Artes e Cultura' });
        expect(within(card).getByText('Desativado')).toBeTruthy();
        expect(within(card).queryByRole('button', { name: /Desativar curso/ })).toBeNull();
    });
});

describe('desativação confirmada', () => {
    it('abrir e cancelar a confirmação não altera o curso', async () => {
        const { courseService } = setup(); await ready();
        await user().click(screen.getByRole('button', { name: 'Desativar curso CD' }));
        expect(screen.getByRole('group', { name: 'Confirmação de desativação de CD' })).toBeTruthy();
        expect(courseService.deactivateCourse).not.toHaveBeenCalled();
        await user().click(screen.getByRole('button', { name: 'Cancelar desativação' }));
        expect(screen.queryByRole('group')).toBeNull();
        expect(courseService.deactivateCourse).not.toHaveBeenCalled();
    });
    it('desativa e mantém o registro na lista com sua situação atualizada', async () => {
        const { courseService } = setup(); await ready();
        await user().click(screen.getByRole('button', { name: 'Desativar curso CD' }));
        await user().click(screen.getByRole('button', { name: 'Confirmar desativação' }));
        await waitFor(() => expect(screen.getByText(MESSAGES.DEACTIVATE_SUCCESS)).toBeTruthy());
        expect(courseService.deactivateCourse).toHaveBeenCalledExactlyOnceWith(FIRST.id);
        const card = screen.getByRole('article', { name: FIRST.name });
        expect(within(card).getByText('Desativado')).toBeTruthy();
        expect(screen.getAllByRole('article')).toHaveLength(2);
    });
    it('mantém o filtro de ativos depois de desativar e permite encontrar o registro em Todos', async () => {
        setup(); await ready();
        await user().selectOptions(screen.getByLabelText('Situação dos cursos'), 'active');
        await user().click(screen.getByRole('button', { name: 'Desativar curso CD' }));
        await user().click(screen.getByRole('button', { name: 'Confirmar desativação' }));
        await waitFor(() => expect(screen.getByText('Nenhum curso nesta situação.')).toBeTruthy());
        expect(screen.getByText('0 de 2 cursos')).toBeTruthy();
        await user().selectOptions(screen.getByLabelText('Situação dos cursos'), 'all');
        expect(screen.getByRole('article', { name: FIRST.name })).toBeTruthy();
    });
    it('bloqueia repetição e cancelamento durante a operação', async () => {
        const gate = deferred(); const api = service(); api.deactivateCourse.mockReturnValue(gate.promise);
        setup(api); await ready();
        await user().click(screen.getByRole('button', { name: 'Desativar curso CD' }));
        const confirm = screen.getByRole('button', { name: 'Confirmar desativação' });
        fireEvent.click(confirm); fireEvent.click(confirm);
        expect(api.deactivateCourse).toHaveBeenCalledOnce();
        expect(screen.getByRole('button', { name: 'Desativando...' }).disabled).toBe(true);
        expect(screen.getByRole('button', { name: 'Cancelar desativação' }).disabled).toBe(true);
        await act(async () => gate.resolve({ ...FIRST, active: false }));
        expect(screen.queryByRole('group')).toBeNull();
    });
    it('recusa pública mantém confirmação e permite repetir', async () => {
        const api = service(); api.deactivateCourse.mockRejectedValueOnce(new CourseApiError('Tente novamente.', {
            statusCode: 500, code: 'COURSE_REQUEST_FAILED',
        }));
        setup(api); await ready();
        await user().click(screen.getByRole('button', { name: 'Desativar curso CD' }));
        await user().click(screen.getByRole('button', { name: 'Confirmar desativação' }));
        await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Tente novamente.'));
        await user().click(screen.getByRole('button', { name: 'Confirmar desativação' }));
        await waitFor(() => expect(screen.getByText(MESSAGES.DEACTIVATE_SUCCESS)).toBeTruthy());
        expect(api.deactivateCourse).toHaveBeenCalledTimes(2);
    });
    it('não confirma resposta de desativação que mantém o curso ativo', async () => {
        const api = service(); api.deactivateCourse.mockResolvedValue(FIRST);
        setup(api); await ready();
        await user().click(screen.getByRole('button', { name: 'Desativar curso CD' }));
        await user().click(screen.getByRole('button', { name: 'Confirmar desativação' }));
        await waitFor(() => expect(screen.getByRole('alert').textContent).toBe(MESSAGES.DEACTIVATE_ERROR));
        expect(screen.queryByText(MESSAGES.DEACTIVATE_SUCCESS)).toBeNull();
        expect(screen.getByRole('group')).toBeTruthy();
    });
});

describe('respostas de operações anteriores', () => {
    it('trocar o serviço ignora a consulta anterior que termina depois da nova', async () => {
        const gate = deferred(); const previous = service(); previous.listCourses.mockReturnValue(gate.promise);
        const { rerender } = setup(previous);
        const current = service([SECOND]);
        rerender(<CourseManagement courseService={current} />);
        await ready();
        await act(async () => gate.resolve([FIRST]));
        expect(screen.getByRole('article', { name: SECOND.name })).toBeTruthy();
        expect(screen.queryByRole('article', { name: FIRST.name })).toBeNull();
    });
    it('gravação que termina após desmontagem não altera a nova instância', async () => {
        const gate = deferred(); const previous = service(); previous.createCourse.mockReturnValue(gate.promise);
        const { unmount } = setup(previous); await ready();
        await user().click(screen.getByRole('button', { name: 'Novo curso' }));
        fill(); submit(); unmount();
        setup(service([SECOND])); await ready();
        await act(async () => gate.resolve({ id: NEW_ID, name: 'Biologia Aplicada', code: 'BA', active: true }));
        expect(screen.getByText('1 de 1 cursos')).toBeTruthy();
        expect(screen.queryByText(MESSAGES.CREATE_SUCCESS)).toBeNull();
        expect(screen.queryByRole('article', { name: 'Biologia Aplicada' })).toBeNull();
    });
});
