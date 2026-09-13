import {
    cleanup,
    fireEvent,
    render,
    screen,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
    afterEach,
    describe,
    expect,
    test,
    vi,
} from 'vitest';

import {
    LOGIN_FORM_IDS,
    LOGIN_FORM_MESSAGES,
    LoginForm,
} from './LoginForm.jsx';

afterEach(() => {
    cleanup();
});

describe('configuração do LoginForm', () => {
    test('expõe identificadores e mensagens protegidos', () => {
        expect(LOGIN_FORM_IDS).toEqual({
            FORM: 'administrative-login-form',
            EMAIL: 'administrative-login-email',
            PASSWORD: 'administrative-login-password',
            ERROR: 'administrative-login-error',
        });

        expect(Object.isFrozen(LOGIN_FORM_IDS)).toBe(true);
        expect(Object.isFrozen(LOGIN_FORM_MESSAGES)).toBe(true);
    });

    test('rejeita uma função de envio inválida', () => {
        const invalidHandlers = [
            undefined,
            null,
            'submit',
            42,
            {},
            [],
        ];

        for (const onSubmit of invalidHandlers) {
            expect(() => render(
                <LoginForm onSubmit={onSubmit} />,
            )).toThrowError(
                LOGIN_FORM_MESSAGES.INVALID_SUBMIT_HANDLER,
            );
        }
    });

    test('rejeita estados de envio que não sejam booleanos', () => {
        const invalidStates = [
            null,
            'false',
            0,
            {},
            [],
        ];

        for (const isSubmitting of invalidStates) {
            expect(() => render(
                <LoginForm
                    onSubmit={() => {}}
                    isSubmitting={isSubmitting}
                />,
            )).toThrowError(
                LOGIN_FORM_MESSAGES.INVALID_SUBMITTING_STATE,
            );
        }
    });

    test('rejeita mensagens de erro com estrutura inválida', () => {
        const invalidMessages = [
            42,
            false,
            {},
            [],
        ];

        for (const errorMessage of invalidMessages) {
            expect(() => render(
                <LoginForm
                    onSubmit={() => {}}
                    errorMessage={errorMessage}
                />,
            )).toThrowError(
                LOGIN_FORM_MESSAGES.INVALID_ERROR_MESSAGE,
            );
        }
    });
});

describe('campos do LoginForm', () => {
    test('apresenta os controles administrativos acessíveis', () => {
        render(<LoginForm onSubmit={() => {}} />);

        const form = screen.getByRole('form', {
            name: 'Entrada administrativa',
        });
        const emailInput = screen.getByRole('textbox', {
            name: 'E-mail',
        });
        const passwordInput = screen.getByLabelText('Senha');
        const submitButton = screen.getByRole('button', {
            name: 'Entrar',
        });

        expect(form.id).toBe(LOGIN_FORM_IDS.FORM);
        expect(form.getAttribute('aria-busy')).toBe('false');

        expect(emailInput.id).toBe(LOGIN_FORM_IDS.EMAIL);
        expect(emailInput.getAttribute('type')).toBe('email');
        expect(emailInput.getAttribute('name')).toBe('email');
        expect(emailInput.getAttribute('inputmode')).toBe('email');
        expect(emailInput.getAttribute('autocomplete')).toBe(
            'username',
        );
        expect(emailInput.getAttribute('maxlength')).toBe('254');
        expect(emailInput.required).toBe(true);

        expect(passwordInput.id).toBe(LOGIN_FORM_IDS.PASSWORD);
        expect(passwordInput.getAttribute('type')).toBe('password');
        expect(passwordInput.getAttribute('name')).toBe('password');
        expect(passwordInput.getAttribute('autocomplete')).toBe(
            'current-password',
        );
        expect(passwordInput.required).toBe(true);
        expect(submitButton.disabled).toBe(true);
    });

    test('habilita o envio somente depois dos dois campos', async () => {
        const user = userEvent.setup();

        render(<LoginForm onSubmit={() => {}} />);

        const emailInput = screen.getByRole('textbox', {
            name: 'E-mail',
        });
        const passwordInput = screen.getByLabelText('Senha');
        const submitButton = screen.getByRole('button', {
            name: 'Entrar',
        });

        await user.type(emailInput, 'admin@example.com');
        expect(submitButton.disabled).toBe(true);

        await user.type(passwordInput, 'senha administrativa');
        expect(submitButton.disabled).toBe(false);

        await user.clear(emailInput);
        expect(submitButton.disabled).toBe(true);
    });

    test('não considera espaços externos como um e-mail', async () => {
        const user = userEvent.setup();

        render(<LoginForm onSubmit={() => {}} />);

        await user.type(
            screen.getByRole('textbox', { name: 'E-mail' }),
            '   ',
        );
        await user.type(
            screen.getByLabelText('Senha'),
            'senha',
        );

        expect(
            screen.getByRole('button', { name: 'Entrar' }).disabled,
        ).toBe(true);
    });
});

describe('envio do LoginForm', () => {
    test('normaliza o e-mail e preserva integralmente a senha', async () => {
        const user = userEvent.setup();
        const onSubmit = vi.fn();

        render(<LoginForm onSubmit={onSubmit} />);

        await user.type(
            screen.getByRole('textbox', { name: 'E-mail' }),
            '  ADMIN@EXAMPLE.COM  ',
        );
        await user.type(
            screen.getByLabelText('Senha'),
            '  senha com espaços  ',
        );
        await user.click(
            screen.getByRole('button', { name: 'Entrar' }),
        );

        expect(onSubmit).toHaveBeenCalledTimes(1);

        const credentials = onSubmit.mock.calls[0][0];

        expect(credentials).toEqual({
            email: 'ADMIN@EXAMPLE.COM',
            password: '  senha com espaços  ',
        });
        expect(Object.isFrozen(credentials)).toBe(true);
        expect(Object.keys(credentials)).toEqual([
            'email',
            'password',
        ]);
    });

    test('não envia o formulário quando os dados estão incompletos', () => {
        const onSubmit = vi.fn();

        render(<LoginForm onSubmit={onSubmit} />);

        const form = screen.getByRole('form', {
            name: 'Entrada administrativa',
        });

        fireEvent.submit(form);

        expect(onSubmit).not.toHaveBeenCalled();
    });

    test('bloqueia alterações e novos envios durante a requisição', () => {
        const onSubmit = vi.fn();

        render(
            <LoginForm
                onSubmit={onSubmit}
                isSubmitting
            />,
        );

        const form = screen.getByRole('form', {
            name: 'Entrada administrativa',
        });
        const emailInput = screen.getByRole('textbox', {
            name: 'E-mail',
        });
        const passwordInput = screen.getByLabelText('Senha');
        const submitButton = screen.getByRole('button', {
            name: 'Entrando...',
        });

        expect(form.getAttribute('aria-busy')).toBe('true');
        expect(emailInput.disabled).toBe(true);
        expect(passwordInput.disabled).toBe(true);
        expect(submitButton.disabled).toBe(true);

        fireEvent.submit(form);

        expect(onSubmit).not.toHaveBeenCalled();
    });
});

describe('mensagem do LoginForm', () => {
    test('apresenta um erro público relacionado aos dois campos', () => {
        const errorMessage = 'E-mail ou senha inválidos.';

        render(
            <LoginForm
                onSubmit={() => {}}
                errorMessage={errorMessage}
            />,
        );

        const alert = screen.getByRole('alert');
        const emailInput = screen.getByRole('textbox', {
            name: 'E-mail',
        });
        const passwordInput = screen.getByLabelText('Senha');

        expect(alert.id).toBe(LOGIN_FORM_IDS.ERROR);
        expect(alert.textContent).toBe(errorMessage);
        expect(emailInput.getAttribute('aria-describedby')).toBe(
            LOGIN_FORM_IDS.ERROR,
        );
        expect(passwordInput.getAttribute('aria-describedby')).toBe(
            LOGIN_FORM_IDS.ERROR,
        );
    });

    test('não cria um alerta para uma mensagem vazia', () => {
        render(
            <LoginForm
                onSubmit={() => {}}
                errorMessage="   "
            />,
        );

        expect(screen.queryByRole('alert')).toBeNull();
        expect(
            screen
                .getByRole('textbox', { name: 'E-mail' })
                .hasAttribute('aria-describedby'),
        ).toBe(false);
        expect(
            screen
                .getByLabelText('Senha')
                .hasAttribute('aria-describedby'),
        ).toBe(false);
    });
});
