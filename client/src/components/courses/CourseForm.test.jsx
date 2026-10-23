import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CourseForm, COURSE_FORM_MESSAGES as MESSAGES } from './CourseForm.jsx';

const COURSE = Object.freeze({ id: '507f1f77bcf86cd799439011', name: 'Ciência de Dados', code: 'CD', active: true });
function setup(overrides = {}) {
    const props = { onSubmit: vi.fn(), onCancel: vi.fn(), ...overrides };
    return { props, ...render(<CourseForm {...props} />) };
}
function fill(name = 'Ciência de Dados', code = 'CD') {
    fireEvent.change(screen.getByLabelText('Nome do curso'), { target: { value: name } });
    fireEvent.change(screen.getByLabelText('Sigla'), { target: { value: code } });
}
function submit() {
    fireEvent.submit(screen.getByRole('form'));
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('configuração do formulário de cursos', () => {
    it('recusa propriedades incompatíveis antes de apresentar o formulário', () => {
        for (const overrides of [
            { onSubmit: null }, { onCancel: null }, { isSubmitting: 'true' },
            { errorMessage: {} }, { courseToEdit: {} }, { courseToEdit: [] },
        ]) {
            expect(() => setup(overrides)).toThrow(TypeError);
        }
    });
    it('apresenta nome e sigla vazios com rótulos, orientações e cancelamento', () => {
        const { props } = setup();
        expect(screen.getByRole('heading', { name: 'Novo curso' })).toBeTruthy();
        expect(screen.getAllByRole('textbox')).toHaveLength(2);
        for (const label of ['Nome do curso', 'Sigla']) {
            const field = screen.getByLabelText(label);
            expect(field.value).toBe('');
            expect(field.required).toBe(true);
            expect(document.getElementById(field.getAttribute('aria-describedby'))).toBeTruthy();
        }
        expect(screen.getByRole('button', { name: 'Cadastrar curso' }).disabled).toBe(true);
        expect(screen.getByRole('button', { name: 'Cancelar' }).disabled).toBe(false);
        expect(props.onSubmit).not.toHaveBeenCalled();
    });
    it('não repete identificadores quando existem duas instâncias', () => {
        setup(); setup();
        const ids = [...document.querySelectorAll('[id]')].map(element => element.id);
        expect(new Set(ids).size).toBe(ids.length);
    });
});

describe('cadastro e validação dos campos', () => {
    it('digitação e envio pelo teclado entregam somente nome e sigla normalizados', async () => {
        const user = userEvent.setup();
        const { props } = setup();
        await user.type(screen.getByLabelText('Nome do curso'), '  Ciência   de Dados  ');
        await user.type(screen.getByLabelText('Sigla'), ' cd ');
        await user.keyboard('{Enter}');
        expect(props.onSubmit).toHaveBeenCalledExactlyOnceWith({ name: 'Ciência de Dados', code: 'CD' });
        expect(Object.isFrozen(props.onSubmit.mock.calls[0][0])).toBe(true);
    });
    it.each([['', 'CD'], ['Curso', ''], ['   ', 'CD'], ['Curso', '  ']])(
        'bloqueia envio com campo vazio: nome=%j, sigla=%j', (name, code) => {
            const { props } = setup();
            fill(name, code); submit();
            expect(screen.getByRole('button', { name: 'Cadastrar curso' }).disabled).toBe(true);
            expect(props.onSubmit).not.toHaveBeenCalled();
        },
    );
    it.each([
        ['A', 'CD', 'Nome do curso', MESSAGES.INVALID_NAME],
        ['A'.repeat(121), 'CD', 'Nome do curso', MESSAGES.INVALID_NAME],
        ['Curso', 'A'.repeat(21), 'Sigla', MESSAGES.INVALID_CODE],
        ['Curso', 'ß'.repeat(11), 'Sigla', MESSAGES.INVALID_CODE],
    ])('recusa limites inválidos e foca %s / %s', (name, code, label, message) => {
        const { props } = setup();
        fill(name, code); submit();
        const field = screen.getByLabelText(label);
        const alert = screen.getByRole('alert');
        expect(alert.textContent).toBe(message);
        expect(field.getAttribute('aria-invalid')).toBe('true');
        expect(field.getAttribute('aria-describedby').split(' ')).toContain(alert.id);
        expect(document.activeElement).toBe(field);
        expect(props.onSubmit).not.toHaveBeenCalled();
    });
    it('aplica o limite após normalizar Unicode sem truncar o texto', () => {
        const { props } = setup();
        fill('e\u0301'.repeat(120), 'a'.repeat(20)); submit();
        expect(props.onSubmit).toHaveBeenCalledExactlyOnceWith({ name: 'é'.repeat(120), code: 'A'.repeat(20) });
    });
    it('aceita sinais, acentos e espaços na sigla', () => {
        const { props } = setup();
        fill('Curso Livre', '  pós - b  '); submit();
        expect(props.onSubmit).toHaveBeenCalledExactlyOnceWith({ name: 'Curso Livre', code: 'PÓS - B' });
    });
    it('correção remove indicação local e permite novo envio', () => {
        const { props } = setup();
        fill('A', 'CD'); submit();
        expect(screen.getByRole('alert')).toBeTruthy();
        fill();
        expect(screen.queryByRole('alert')).toBeNull();
        expect(screen.getByLabelText('Nome do curso').getAttribute('aria-invalid')).toBeNull();
        submit();
        expect(props.onSubmit).toHaveBeenCalledOnce();
    });
    it('cancelar pede fechamento sem enviar dados nem acessar a rede', async () => {
        const user = userEvent.setup();
        const fetchClient = vi.fn();
        vi.stubGlobal('fetch', fetchClient);
        const { props } = setup();
        fill();
        await user.click(screen.getByRole('button', { name: 'Cancelar' }));
        expect(props.onCancel).toHaveBeenCalledOnce();
        expect(props.onSubmit).not.toHaveBeenCalled();
        expect(fetchClient).not.toHaveBeenCalled();
    });
});

describe('edição, estado de envio e mensagens', () => {
    it('preenche a edição e envia somente os dois campos editáveis', () => {
        const { props } = setup({ courseToEdit: COURSE });
        expect(screen.getByRole('heading', { name: 'Editar curso' })).toBeTruthy();
        expect(screen.getByLabelText('Nome do curso').value).toBe(COURSE.name);
        expect(screen.getByLabelText('Sigla').value).toBe(COURSE.code);
        fill('Análise de Dados', ' ad '); submit();
        expect(props.onSubmit).toHaveBeenCalledExactlyOnceWith({ name: 'Análise de Dados', code: 'AD' });
        expect(screen.getByRole('button', { name: 'Salvar alterações' })).toBeTruthy();
        expect(screen.queryByRole('checkbox')).toBeNull();
    });
    it('permite editar curso desativado com orientação explícita e sem reativação', () => {
        const { props } = setup({ courseToEdit: { ...COURSE, active: false } });
        expect(screen.getByText('Este curso está desativado. Editar nome e sigla não o reativa.')).toBeTruthy();
        submit();
        expect(props.onSubmit).toHaveBeenCalledExactlyOnceWith({ name: COURSE.name, code: COURSE.code });
    });
    it('bloqueia todos os controles e novos envios enquanto a gravação está pendente', () => {
        const { props, rerender } = setup();
        fill();
        rerender(<CourseForm {...props} isSubmitting />);
        expect(screen.getByRole('form').getAttribute('aria-busy')).toBe('true');
        for (const field of screen.getAllByRole('textbox')) expect(field.disabled).toBe(true);
        for (const button of screen.getAllByRole('button')) expect(button.disabled).toBe(true);
        expect(screen.getByRole('button', { name: 'Salvando...' })).toBeTruthy();
        fireEvent.change(screen.getByLabelText('Sigla'), { target: { value: 'IGNORAR' } });
        submit();
        fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
        expect(props.onSubmit).not.toHaveBeenCalled();
        expect(props.onCancel).not.toHaveBeenCalled();
        expect(screen.getByLabelText('Sigla').value).toBe('CD');
    });
    it('mantém os campos após recusa pública e permite tentar novamente', () => {
        const { props, rerender } = setup();
        fill(); submit();
        rerender(<CourseForm {...props} errorMessage="Esta sigla já existe." />);
        expect(screen.getByRole('alert').textContent).toBe('Esta sigla já existe.');
        expect(screen.getByLabelText('Nome do curso').value).toBe(COURSE.name);
        expect(screen.getByLabelText('Sigla').value).toBe(COURSE.code);
        submit();
        expect(props.onSubmit).toHaveBeenCalledTimes(2);
    });
    it('renderiza mensagem como texto e não cria alerta para mensagem vazia', () => {
        const { props, container, rerender } = setup({ errorMessage: '<img src=x onerror=alert(1)>' });
        expect(screen.getByRole('alert').textContent).toBe('<img src=x onerror=alert(1)>');
        expect(container.querySelector('img')).toBeNull();
        rerender(<CourseForm {...props} errorMessage="   " />);
        expect(screen.queryByRole('alert')).toBeNull();
    });
    it('reapresentar a mesma identidade preserva a edição não enviada', () => {
        const { props, rerender } = setup({ courseToEdit: COURSE });
        fill('Rascunho local', 'RL');
        rerender(<CourseForm {...props} courseToEdit={{ ...COURSE }} />);
        expect(screen.getByLabelText('Nome do curso').value).toBe('Rascunho local');
        expect(screen.getByLabelText('Sigla').value).toBe('RL');
    });
    it('trocar o curso selecionado descarta campos e validação da seleção anterior', () => {
        const { props, rerender } = setup({ courseToEdit: COURSE });
        fill('A', 'CD'); submit();
        expect(screen.getByRole('alert')).toBeTruthy();
        const other = { ...COURSE, id: '507f1f77bcf86cd799439012', name: 'Curso Livre', code: 'CL' };
        rerender(<CourseForm {...props} courseToEdit={other} />);
        expect(screen.getByLabelText('Nome do curso').value).toBe('Curso Livre');
        expect(screen.queryByRole('alert')).toBeNull();
        rerender(<CourseForm {...props} courseToEdit={null} />);
        expect(screen.getByLabelText('Nome do curso').value).toBe('');
        expect(screen.getByLabelText('Sigla').value).toBe('');
    });
    it('desmontar e montar novamente descarta o preenchimento', () => {
        const { unmount } = setup();
        fill(); unmount(); setup();
        const form = screen.getByRole('form');
        expect(within(form).getByLabelText('Nome do curso').value).toBe('');
        expect(within(form).getByLabelText('Sigla').value).toBe('');
    });
});
