import {
    cleanup,
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
    CALENDAR_NAVIGATION_MESSAGES,
    CALENDAR_SECTIONS,
    CALENDAR_SECTION_IDS,
    CalendarNavigation,
    isCalendarSectionId,
} from './CalendarNavigation.jsx';

afterEach(() => {
    cleanup();
});

/**
 * Monta a navegação com valores válidos que podem ser substituídos em cada
 * cenário.
 *
 * @param {object} overrides Propriedades específicas do teste.
 * @returns {{ onSectionChange: ReturnType<typeof vi.fn> }} Dependências.
 */
function renderNavigation(overrides = {}) {
    const onSectionChange =
        overrides.onSectionChange ?? vi.fn();

    render(
        <CalendarNavigation
            activeSectionId={
                overrides.activeSectionId
                ?? CALENDAR_SECTION_IDS.DASHBOARD
            }
            onSectionChange={onSectionChange}
        />,
    );

    return { onSectionChange };
}

describe('configuração da navegação do calendário', () => {
    test('expõe identificadores, seções e mensagens protegidos', () => {
        expect(Object.isFrozen(CALENDAR_SECTION_IDS)).toBe(true);
        expect(Object.isFrozen(CALENDAR_SECTIONS)).toBe(true);
        expect(Object.isFrozen(CALENDAR_NAVIGATION_MESSAGES)).toBe(
            true,
        );

        for (const section of CALENDAR_SECTIONS) {
            expect(Object.isFrozen(section)).toBe(true);
        }

        expect(CALENDAR_SECTION_IDS).toEqual({
            DASHBOARD: 'dashboard',
            LESSONS: 'lessons',
            MATERIALS: 'materials',
            CALENDAR: 'calendar',
        });

        expect(
            CALENDAR_SECTIONS.map(({ id, label }) => ({
                id,
                label,
            })),
        ).toEqual([
            { id: 'dashboard', label: 'Painel geral' },
            { id: 'lessons', label: 'Gerenciar aulas' },
            { id: 'materials', label: 'Materiais' },
            { id: 'calendar', label: 'Calendário visual' },
        ]);
    });

    test('reconhece somente as quatro seções cadastradas', () => {
        for (const section of CALENDAR_SECTIONS) {
            expect(isCalendarSectionId(section.id)).toBe(true);
        }

        const invalidSectionIds = [
            undefined,
            null,
            '',
            'dashboard ',
            'relatorios',
            42,
            {},
            [],
        ];

        for (const sectionId of invalidSectionIds) {
            expect(isCalendarSectionId(sectionId)).toBe(false);
        }
    });

    test('rejeita uma seção ativa inválida', () => {
        expect(() => render(
            <CalendarNavigation
                activeSectionId="relatorios"
                onSectionChange={() => {}}
            />,
        )).toThrowError(
            CALENDAR_NAVIGATION_MESSAGES.INVALID_ACTIVE_SECTION,
        );
    });

    test('rejeita uma função de mudança inválida', () => {
        expect(() => render(
            <CalendarNavigation
                activeSectionId={CALENDAR_SECTION_IDS.DASHBOARD}
                onSectionChange={null}
            />,
        )).toThrowError(
            CALENDAR_NAVIGATION_MESSAGES
                .INVALID_SECTION_CHANGE_HANDLER,
        );
    });
});

describe('apresentação da navegação do calendário', () => {
    test('apresenta as quatro seções originais como botões', () => {
        renderNavigation();

        expect(
            screen.getByRole('navigation', {
                name: 'Seções do calendário',
            }),
        ).toBeTruthy();

        const buttons = screen.getAllByRole('button');

        expect(buttons).toHaveLength(4);

        for (const section of CALENDAR_SECTIONS) {
            const button = screen.getByRole('button', {
                name: section.label,
            });

            expect(button.getAttribute('type')).toBe('button');
        }
    });

    test('identifica somente a seção atualmente ativa', () => {
        renderNavigation({
            activeSectionId: CALENDAR_SECTION_IDS.MATERIALS,
        });

        const activeButton = screen.getByRole('button', {
            name: 'Materiais',
        });

        expect(activeButton.getAttribute('aria-current')).toBe(
            'page',
        );

        for (const label of [
            'Painel geral',
            'Gerenciar aulas',
            'Calendário visual',
        ]) {
            expect(
                screen
                    .getByRole('button', { name: label })
                    .hasAttribute('aria-current'),
            ).toBe(false);
        }
    });

    test('comunica o identificador exato da seção escolhida', async () => {
        const user = userEvent.setup();
        const { onSectionChange } = renderNavigation();

        await user.click(
            screen.getByRole('button', {
                name: 'Calendário visual',
            }),
        );

        expect(onSectionChange).toHaveBeenCalledTimes(1);
        expect(onSectionChange).toHaveBeenCalledWith(
            CALENDAR_SECTION_IDS.CALENDAR,
        );
    });
});
