import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, test, vi } from 'vitest';

import {
    INITIAL_SETUP_FORM_IDS,
    INITIAL_SETUP_FORM_MESSAGES,
    InitialSetupForm,
} from './InitialSetupForm.jsx';

// Dados fictícios; os testes não acessam banco, rede ou armazenamento.
function createFields(overrides = {}) {
    return {
        'Seu nome': 'Ana Silva',
        'E-mail': 'ana@example.com',
        Senha: 'senha fictícia de teste',
        'Confirme a senha': 'senha fictícia de teste',
        'Código de primeiro acesso': 'ab'.repeat(32),
        ...overrides,
    };
}

function fillForm(overrides = {}) {
    for (const [label, value] of Object.entries(createFields(overrides))) {
        fireEvent.change(screen.getByLabelText(label), { target: { value } });
    }
}

function submitForm() {
    fireEvent.submit(screen.getByRole('form', { name: 'Primeiro cadastro administrativo' }));
}

afterEach(cleanup);

describe('configuração do InitialSetupForm', () => {
    test('rejeita ausência ou tipo incorreto da função de envio', () => {
        for (const onSubmit of [undefined, null, 'enviar', 42, {}, []]) {
            expect(() => render(<InitialSetupForm onSubmit={onSubmit} />))
                .toThrowError(INITIAL_SETUP_FORM_MESSAGES.INVALID_SUBMIT_HANDLER);
        }
    });

    test('rejeita estado de envio incompatível', () => {
        for (const isSubmitting of [null, 'false', 0, {}, []]) {
            expect(() => render(
                <InitialSetupForm onSubmit={vi.fn()} isSubmitting={isSubmitting} />,
            )).toThrowError(INITIAL_SETUP_FORM_MESSAGES.INVALID_SUBMITTING_STATE);
        }
    });

    test('rejeita mensagem de erro que não seja texto ou nula', () => {
        for (const errorMessage of [42, false, {}, []]) {
            expect(() => render(
                <InitialSetupForm onSubmit={vi.fn()} errorMessage={errorMessage} />,
            )).toThrowError(INITIAL_SETUP_FORM_MESSAGES.INVALID_ERROR_MESSAGE);
        }
    });
});

describe('campos acessíveis do primeiro cadastro', () => {
    test('apresenta cinco campos rotulados e não envia ao montar', () => {
        const onSubmit = vi.fn();
        render(<InitialSetupForm onSubmit={onSubmit} />);
        const form = screen.getByRole('form', { name: 'Primeiro cadastro administrativo' });
        expect(form.id).toBe(INITIAL_SETUP_FORM_IDS.FORM);
        expect(form.getAttribute('aria-busy')).toBe('false');
        expect(form.querySelectorAll('input')).toHaveLength(5);

        for (const label of Object.keys(createFields())) {
            const input = screen.getByLabelText(label);
            expect(input.value).toBe('');
            expect(input.required).toBe(true);
            expect(input.disabled).toBe(false);
        }

        expect(screen.getByRole('button', { name: 'Criar minha conta' }).disabled).toBe(true);
        expect(screen.queryByRole('alert')).toBeNull();
        expect(onSubmit).not.toHaveBeenCalled();
    });

    test('orienta gerenciadores de senha e oculta senha, confirmação e convite', () => {
        render(<InitialSetupForm onSubmit={vi.fn()} />);
        expect(screen.getByLabelText('Seu nome').getAttribute('autocomplete')).toBe('name');
        expect(screen.getByLabelText('E-mail').getAttribute('autocomplete')).toBe('username');
        expect(screen.getByLabelText('E-mail').getAttribute('inputmode')).toBe('email');
        expect(screen.getByLabelText('E-mail').maxLength).toBe(254);
        for (const label of ['Senha', 'Confirme a senha']) {
            const input = screen.getByLabelText(label);
            expect(input.type).toBe('password');
            expect(input.getAttribute('autocomplete')).toBe('new-password');
            // O limite é medido em bytes, sem truncamento silencioso do campo.
            expect(input.hasAttribute('maxlength')).toBe(false);
        }
        const invitation = screen.getByLabelText('Código de primeiro acesso');
        expect(invitation.type).toBe('password');
        expect(invitation.getAttribute('autocomplete')).toBe('off');
        expect(invitation.hasAttribute('maxlength')).toBe(false);
    });

    test('relaciona as orientações aos campos de senha e convite', () => {
        render(<InitialSetupForm onSubmit={vi.fn()} />);
        const password = screen.getByLabelText('Senha');
        const invitation = screen.getByLabelText('Código de primeiro acesso');
        expect(password.getAttribute('aria-describedby')).toBe(INITIAL_SETUP_FORM_IDS.PASSWORD_HELP);
        expect(document.getElementById(INITIAL_SETUP_FORM_IDS.PASSWORD_HELP).textContent)
            .toContain('12 caracteres');
        expect(invitation.getAttribute('aria-describedby')).toBe(INITIAL_SETUP_FORM_IDS.INVITATION_HELP);
        expect(document.getElementById(INITIAL_SETUP_FORM_IDS.INVITATION_HELP).textContent)
            .toContain('instalação');
    });
});

describe('envio dos dados de primeiro cadastro', () => {
    test('digitação e envio pelo teclado entregam somente os quatro campos da API', async () => {
        const user = userEvent.setup();
        const onSubmit = vi.fn();
        const fields = createFields({
            'Seu nome': '  Ana   Silva  ',
            'E-mail': 'ANA@EXAMPLE.COM',
            Senha: '  senha com espaços  ',
            'Confirme a senha': '  senha com espaços  ',
            'Código de primeiro acesso': 'AB'.repeat(32),
        });
        render(<InitialSetupForm onSubmit={onSubmit} />);
        for (const [label, value] of Object.entries(fields)) {
            await user.type(screen.getByLabelText(label), value);
        }
        const button = screen.getByRole('button', { name: 'Criar minha conta' });
        expect(button.disabled).toBe(false);
        await user.tab();
        expect(document.activeElement).toBe(button);
        await user.keyboard('{Enter}');

        expect(onSubmit).toHaveBeenCalledExactlyOnceWith({
            invitationToken: 'AB'.repeat(32),
            name: 'Ana Silva',
            email: 'ana@example.com',
            password: '  senha com espaços  ',
        });
        expect(Object.isFrozen(onSubmit.mock.calls[0][0])).toBe(true);
        expect(onSubmit.mock.calls[0][0]).not.toHaveProperty('passwordConfirmation');
    });

    test.each(Object.keys(createFields()))('bloqueia envio com o campo %s ausente', (label) => {
        const onSubmit = vi.fn();
        render(<InitialSetupForm onSubmit={onSubmit} />);
        fillForm({ [label]: '' });
        expect(screen.getByRole('button', { name: 'Criar minha conta' }).disabled).toBe(true);
        submitForm();
        expect(onSubmit).not.toHaveBeenCalled();
    });

    test('campos contendo somente espaços não habilitam o envio', () => {
        const onSubmit = vi.fn();
        render(<InitialSetupForm onSubmit={onSubmit} />);
        for (const label of Object.keys(createFields())) {
            fillForm({ [label]: '   ' });
            expect(screen.getByRole('button', { name: 'Criar minha conta' }).disabled).toBe(true);
            submitForm();
        }
        expect(onSubmit).not.toHaveBeenCalled();
    });
});

describe('validação antes do envio', () => {
    const invalidCases = [
        { label: 'Seu nome', value: ' A ', message: 'INVALID_NAME' },
        { label: 'Seu nome', value: 'a'.repeat(121), message: 'INVALID_NAME' },
        { label: 'E-mail', value: 'sem-arroba', message: 'INVALID_EMAIL' },
        { label: 'E-mail', value: 'ana @example.com', message: 'INVALID_EMAIL' },
        { label: 'E-mail', value: `${'a'.repeat(243)}@example.com`, message: 'INVALID_EMAIL' },
        { label: 'Senha', value: 'curta', message: 'INVALID_PASSWORD' },
        { label: 'Senha', value: 'a'.repeat(73), message: 'PASSWORD_TOO_LONG' },
        { label: 'Senha', value: 'é'.repeat(37), message: 'PASSWORD_TOO_LONG' },
        { label: 'Senha', value: '🙂'.repeat(19), message: 'PASSWORD_TOO_LONG' },
        { label: 'Confirme a senha', value: 'outra senha de teste', message: 'PASSWORD_MISMATCH' },
        { label: 'Código de primeiro acesso', value: 'ab'.repeat(31), message: 'INVALID_INVITATION' },
        { label: 'Código de primeiro acesso', value: 'g'.repeat(64), message: 'INVALID_INVITATION' },
        { label: 'Código de primeiro acesso', value: ` ${'ab'.repeat(32)}`, message: 'INVALID_INVITATION' },
    ];

    test.each(invalidCases)('recusa $message no campo $label', ({ label, value, message }) => {
        const onSubmit = vi.fn();
        render(<InitialSetupForm onSubmit={onSubmit} />);
        fillForm({ [label]: value });
        submitForm();
        const input = screen.getByLabelText(label);
        const alert = screen.getByRole('alert');
        expect(alert.textContent).toBe(INITIAL_SETUP_FORM_MESSAGES[message]);
        expect(input.getAttribute('aria-invalid')).toBe('true');
        expect(input.getAttribute('aria-describedby').split(' ')).toContain(alert.id);
        expect(document.activeElement).toBe(input);
        expect(input.value).toBe(value);
        expect(onSubmit).not.toHaveBeenCalled();
    });

    test.each([
        { label: 'ASCII', password: 'a'.repeat(72) },
        { label: 'acentos', password: 'é'.repeat(36) },
        { label: 'emojis', password: '🙂'.repeat(18) },
    ])('aceita exatamente 72 bytes UTF-8 com $label', ({ password }) => {
        const onSubmit = vi.fn();
        render(<InitialSetupForm onSubmit={onSubmit} />);
        fillForm({ Senha: password, 'Confirme a senha': password });
        submitForm();
        expect(onSubmit).toHaveBeenCalledOnce();
        expect(onSubmit.mock.calls[0][0].password).toBe(password);
        expect(screen.queryByRole('alert')).toBeNull();
    });

    test('compara confirmação sem remover espaços da senha', () => {
        const onSubmit = vi.fn();
        render(<InitialSetupForm onSubmit={onSubmit} />);
        fillForm({ Senha: '  senha com espaços  ', 'Confirme a senha': 'senha com espaços' });
        submitForm();
        expect(screen.getByRole('alert').textContent).toBe(INITIAL_SETUP_FORM_MESSAGES.PASSWORD_MISMATCH);
        expect(onSubmit).not.toHaveBeenCalled();
    });

    test('permite corrigir o campo, limpa a indicação local e envia', () => {
        const onSubmit = vi.fn();
        render(<InitialSetupForm onSubmit={onSubmit} />);
        fillForm({ 'Confirme a senha': 'senha diferente' });
        submitForm();
        const confirmation = screen.getByLabelText('Confirme a senha');
        expect(confirmation.getAttribute('aria-invalid')).toBe('true');
        fireEvent.change(confirmation, { target: { value: 'senha fictícia de teste' } });
        expect(screen.queryByRole('alert')).toBeNull();
        expect(confirmation.hasAttribute('aria-invalid')).toBe(false);
        submitForm();
        expect(onSubmit).toHaveBeenCalledOnce();
    });
});

describe('estado de envio e mensagens da operação', () => {
    test('bloqueia todos os controles e novos envios enquanto a operação está pendente', () => {
        const onSubmit = vi.fn();
        const { rerender } = render(<InitialSetupForm onSubmit={onSubmit} />);
        fillForm();
        submitForm();
        expect(onSubmit).toHaveBeenCalledOnce();
        rerender(<InitialSetupForm onSubmit={onSubmit} isSubmitting />);
        expect(screen.getByRole('form').getAttribute('aria-busy')).toBe('true');
        expect(screen.getByRole('button', { name: 'Criando sua conta...' }).disabled).toBe(true);
        for (const [label, value] of Object.entries(createFields())) {
            const input = screen.getByLabelText(label);
            expect(input.disabled).toBe(true);
            fireEvent.change(input, { target: { value: 'alteração bloqueada' } });
            expect(input.value).toBe(value);
        }
        submitForm();
        expect(onSubmit).toHaveBeenCalledOnce();
    });

    test('preserva os campos após recusa pública e permite uma nova tentativa', () => {
        const onSubmit = vi.fn();
        const { rerender } = render(<InitialSetupForm onSubmit={onSubmit} />);
        fillForm();
        submitForm();
        rerender(<InitialSetupForm onSubmit={onSubmit} isSubmitting />);
        rerender(<InitialSetupForm onSubmit={onSubmit} errorMessage="Convite recusado." />);
        expect(screen.getByRole('alert').textContent).toBe('Convite recusado.');
        for (const [label, value] of Object.entries(createFields())) {
            const input = screen.getByLabelText(label);
            expect(input.disabled).toBe(false);
            expect(input.value).toBe(value);
            expect(input.getAttribute('aria-describedby').split(' '))
                .toContain(INITIAL_SETUP_FORM_IDS.ERROR);
        }
        submitForm();
        expect(onSubmit).toHaveBeenCalledTimes(2);
        expect(onSubmit.mock.calls[1][0]).toEqual(onSubmit.mock.calls[0][0]);
    });

    test('renderiza mensagem externa como texto, preservando as orientações acessíveis', () => {
        const errorMessage = '<img src=x onerror=alert(1)> Pedido recusado.';
        render(<InitialSetupForm onSubmit={vi.fn()} errorMessage={errorMessage} />);
        const alert = screen.getByRole('alert');
        expect(alert.textContent).toBe(errorMessage);
        expect(alert.querySelector('img')).toBeNull();
        expect(screen.getByLabelText('Senha').getAttribute('aria-describedby').split(' '))
            .toEqual([INITIAL_SETUP_FORM_IDS.PASSWORD_HELP, INITIAL_SETUP_FORM_IDS.ERROR]);
    });

    test('não cria alerta para mensagem vazia ou somente espaços', () => {
        const { rerender } = render(<InitialSetupForm onSubmit={vi.fn()} errorMessage="" />);
        expect(screen.queryByRole('alert')).toBeNull();
        rerender(<InitialSetupForm onSubmit={vi.fn()} errorMessage="   " />);
        expect(screen.queryByRole('alert')).toBeNull();
        expect(screen.getByLabelText('Seu nome').hasAttribute('aria-describedby')).toBe(false);
    });

    test('desmontar e montar novamente descarta os valores e erros locais', () => {
        const { unmount } = render(<InitialSetupForm onSubmit={vi.fn()} />);
        fillForm({ 'Confirme a senha': 'confirmação diferente' });
        submitForm();
        expect(screen.getByRole('alert')).toBeTruthy();
        unmount();
        render(<InitialSetupForm onSubmit={vi.fn()} />);
        for (const label of Object.keys(createFields())) {
            expect(screen.getByLabelText(label).value).toBe('');
        }
        expect(screen.queryByRole('alert')).toBeNull();
    });
});
