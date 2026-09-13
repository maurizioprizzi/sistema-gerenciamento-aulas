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
    LOGOUT_BUTTON_ID,
    LOGOUT_BUTTON_MESSAGES,
    LogoutButton,
} from './LogoutButton.jsx';

afterEach(() => {
    cleanup();
});

describe('configuração do LogoutButton', () => {
    test('expõe identificador e mensagens estáveis', () => {
        expect(LOGOUT_BUTTON_ID).toBe(
            'administrative-logout-button',
        );
        expect(LOGOUT_BUTTON_MESSAGES).toEqual({
            INVALID_LOGOUT_HANDLER:
                'O botão de saída exige uma função válida.',
            INVALID_SUBMITTING_STATE:
                'O estado de saída deve ser booleano.',
        });
        expect(Object.isFrozen(LOGOUT_BUTTON_MESSAGES)).toBe(true);
    });

    test('rejeita funções de saída inválidas', () => {
        const invalidHandlers = [
            undefined,
            null,
            'logout',
            42,
            {},
            [],
        ];

        for (const onLogout of invalidHandlers) {
            expect(() => render(
                <LogoutButton onLogout={onLogout} />,
            )).toThrowError(
                LOGOUT_BUTTON_MESSAGES.INVALID_LOGOUT_HANDLER,
            );

            cleanup();
        }
    });

    test('rejeita estados de saída que não sejam booleanos', () => {
        const invalidStates = [
            null,
            'false',
            0,
            {},
            [],
        ];

        for (const isSubmitting of invalidStates) {
            expect(() => render(
                <LogoutButton
                    onLogout={() => {}}
                    isSubmitting={isSubmitting}
                />,
            )).toThrowError(
                LOGOUT_BUTTON_MESSAGES.INVALID_SUBMITTING_STATE,
            );

            cleanup();
        }
    });
});

describe('interação do LogoutButton', () => {
    test('apresenta um botão acessível sem enviar formulários', () => {
        render(<LogoutButton onLogout={() => {}} />);

        const button = screen.getByRole('button', {
            name: 'Sair',
        });

        expect(button.id).toBe(LOGOUT_BUTTON_ID);
        expect(button.getAttribute('type')).toBe('button');
        expect(button.getAttribute('aria-busy')).toBe('false');
        expect(button.disabled).toBe(false);
    });

    test('solicita a saída uma vez por clique', async () => {
        const user = userEvent.setup();
        const onLogout = vi.fn();

        render(<LogoutButton onLogout={onLogout} />);

        await user.click(
            screen.getByRole('button', { name: 'Sair' }),
        );

        expect(onLogout).toHaveBeenCalledTimes(1);
        expect(onLogout).toHaveBeenCalledWith();
    });

    test('bloqueia novas solicitações durante a saída', () => {
        const onLogout = vi.fn();

        render(
            <LogoutButton
                onLogout={onLogout}
                isSubmitting
            />,
        );

        const button = screen.getByRole('button', {
            name: 'Saindo...',
        });

        expect(button.getAttribute('aria-busy')).toBe('true');
        expect(button.disabled).toBe(true);

        fireEvent.click(button);

        expect(onLogout).not.toHaveBeenCalled();
    });
});
