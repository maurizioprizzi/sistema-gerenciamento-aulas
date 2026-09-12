import {
    cleanup,
    render,
    screen,
} from '@testing-library/react';
import {
    afterEach,
    describe,
    expect,
    test,
    vi,
} from 'vitest';

import { App } from './App.jsx';

/**
 * Como os recursos globais do Vitest estão desativados, a limpeza é
 * registrada explicitamente. Isso garante que cada teste receba um documento
 * vazio e que relógios simulados não afetem o cenário seguinte.
 */
afterEach(() => {
    cleanup();
    vi.useRealTimers();
});

describe('estrutura inicial da aplicação', () => {
    test('apresenta a identidade e o contexto administrativo', () => {
        render(<App />);

        expect(screen.getByRole('main')).toBeTruthy();
        expect(
            screen.getByRole('heading', {
                level: 1,
                name: 'Calendário de Aulas',
            }),
        ).toBeTruthy();
        expect(
            screen.getByRole('heading', {
                level: 2,
                name: 'Acesso ao calendário',
            }),
        ).toBeTruthy();
        expect(
            screen.getByText('Senac Ceilândia'),
        ).toBeTruthy();
        expect(
            screen.getByText('Prof. Dionísio Pereira'),
        ).toBeTruthy();
        expect(
            screen.getByText('Área administrativa'),
        ).toBeTruthy();
    });

    test('apresenta a data local em português', () => {
        /**
         * O horário do meio-dia evita qualquer ambiguidade perto da mudança
         * do dia. O construtor utiliza o fuso local, como acontece no
         * navegador real.
         */
        vi.useFakeTimers();
        vi.setSystemTime(new Date(2026, 8, 12, 12, 0, 0));

        render(<App />);

        const calendar = screen.getByLabelText(
            'Hoje, 12 de setembro de 2026.',
        );

        expect(calendar.tagName).toBe('TIME');
        expect(calendar.getAttribute('datetime')).toBe(
            '2026-09-12',
        );
        expect(calendar.textContent).toContain('setembro');
        expect(calendar.textContent).toContain('12');
    });
});
