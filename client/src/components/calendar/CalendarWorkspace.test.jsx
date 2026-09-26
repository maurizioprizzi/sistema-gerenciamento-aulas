import {
    cleanup,
    render,
    screen,
    waitFor,
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
    CALENDAR_WORKSPACE_IDS,
    CALENDAR_WORKSPACE_MESSAGES,
    CalendarWorkspace,
} from './CalendarWorkspace.jsx';
import {
    CALENDAR_DASHBOARD_MESSAGES,
} from './CalendarDashboard.jsx';
import {
    LESSON_MANAGEMENT_MESSAGES,
} from './LessonManagement.jsx';
import {
    LESSON_MATERIAL_MANAGEMENT_MESSAGES,
} from './LessonMaterialManagement.jsx';
import {
    MONTHLY_MATERIAL_MANAGEMENT_MESSAGES,
} from './MonthlyMaterialManagement.jsx';

afterEach(() => {
    cleanup();
});

/**
 * Cria o contrato de consulta, criação, edição e exclusão de aulas.
 *
 * @param {object} overrides Operações substituídas pelo cenário.
 * @returns {{ listLessons: ReturnType<typeof vi.fn>,
 * createLesson: ReturnType<typeof vi.fn>,
 * updateLesson: ReturnType<typeof vi.fn>,
 * deleteLesson: ReturnType<typeof vi.fn> }} Serviço controlado.
 */
function createLessonService(overrides = {}) {
    return {
        listLessons: vi.fn().mockResolvedValue([]),
        createLesson: vi.fn(),
        updateLesson: vi.fn(),
        deleteLesson: vi.fn(),
        ...overrides,
    };
}

/**
 * Cria o contrato completo dos materiais mensais.
 *
 * @param {object} overrides Operações substituídas pelo cenário.
 * @returns {object} Serviço mensal controlado.
 */
function createMonthlyMaterialService(overrides = {}) {
    return {
        listMonthlyMaterials: vi.fn().mockResolvedValue(
            Object.freeze([]),
        ),
        saveMonthlyMaterial: vi.fn(),
        deleteMonthlyMaterial: vi.fn(),
        ...overrides,
    };
}

/**
 * Monta a área autenticada com propriedades válidas que podem ser
 * substituídas por cada cenário.
 *
 * @param {object} overrides Propriedades específicas do teste.
 * @returns {{ onLogout: ReturnType<typeof vi.fn>,
 * lessonService: object, monthlyMaterialService: object }} Dependências.
 */
function renderWorkspace(overrides = {}) {
    const onLogout = overrides.onLogout ?? vi.fn();
    const lessonService = overrides.lessonService
        ?? createLessonService();
    const monthlyMaterialService = overrides.monthlyMaterialService
        ?? createMonthlyMaterialService();

    render(
        <CalendarWorkspace
            administratorName={
                Object.hasOwn(overrides, 'administratorName')
                    ? overrides.administratorName
                    : 'Dionísio Pereira'
            }
            onLogout={onLogout}
            isLoggingOut={overrides.isLoggingOut ?? false}
            logoutError={
                Object.hasOwn(overrides, 'logoutError')
                    ? overrides.logoutError
                    : null
            }
            lessonService={lessonService}
            monthlyMaterialService={monthlyMaterialService}
        />,
    );

    return {
        onLogout,
        lessonService,
        monthlyMaterialService,
    };
}

describe('configuração da área do calendário', () => {
    test('expõe identificadores e mensagens protegidos', () => {
        expect(Object.isFrozen(CALENDAR_WORKSPACE_IDS)).toBe(true);
        expect(Object.isFrozen(CALENDAR_WORKSPACE_MESSAGES)).toBe(
            true,
        );
        expect(CALENDAR_WORKSPACE_IDS).toEqual({
            TITLE: 'calendar-workspace-title',
            ACTIVE_SECTION: 'calendar-workspace-active-section',
            LOGOUT_ERROR: 'calendar-workspace-logout-error',
        });
        expect(CALENDAR_WORKSPACE_MESSAGES).toMatchObject({
            INVALID_LESSON_SERVICE:
                'A área do calendário exige um serviço de aulas válido.',
            INVALID_MONTHLY_MATERIAL_SERVICE:
                'A área do calendário exige um serviço de materiais mensais válido.',
        });
    });

    test('rejeita nomes administrativos inválidos', () => {
        const invalidNames = ['', '   ', 42, {}, []];

        for (const administratorName of invalidNames) {
            expect(() => render(
                <CalendarWorkspace
                    administratorName={administratorName}
                    onLogout={() => {}}
                />,
            )).toThrowError(
                CALENDAR_WORKSPACE_MESSAGES
                    .INVALID_ADMINISTRATOR_NAME,
            );
        }
    });

    test('aceita uma sessão sem nome público', () => {
        renderWorkspace({ administratorName: null });

        expect(
            screen.getByText('Sessão administrativa ativa'),
        ).toBeTruthy();
    });

    test('rejeita uma função de saída inválida', () => {
        expect(() => render(
            <CalendarWorkspace
                administratorName="Dionísio Pereira"
                onLogout={null}
            />,
        )).toThrowError(
            CALENDAR_WORKSPACE_MESSAGES.INVALID_LOGOUT_HANDLER,
        );
    });

    test('rejeita estados de saída que não sejam booleanos', () => {
        expect(() => render(
            <CalendarWorkspace
                administratorName="Dionísio Pereira"
                onLogout={() => {}}
                isLoggingOut="false"
            />,
        )).toThrowError(
            CALENDAR_WORKSPACE_MESSAGES.INVALID_LOGGING_OUT_STATE,
        );
    });

    test('rejeita erros de saída com estrutura inválida', () => {
        expect(() => render(
            <CalendarWorkspace
                administratorName="Dionísio Pereira"
                onLogout={() => {}}
                logoutError={{}}
            />,
        )).toThrowError(
            CALENDAR_WORKSPACE_MESSAGES.INVALID_LOGOUT_ERROR,
        );
    });

    test('rejeita serviços de aulas inválidos', () => {
        const invalidServices = [
            null,
            'lessons',
            42,
            {},
            [],
            { listLessons: true },
            { listLessons() {} },
            { createLesson() {} },
            { listLessons() {}, createLesson: true },
            {
                listLessons() {},
                createLesson() {},
                updateLesson() {},
            },
            {
                listLessons() {},
                createLesson() {},
                updateLesson() {},
                deleteLesson: true,
            },
        ];

        for (const lessonService of invalidServices) {
            expect(() => render(
                <CalendarWorkspace
                    administratorName="Dionísio Pereira"
                    onLogout={() => {}}
                    lessonService={lessonService}
                />,
            )).toThrowError(
                CALENDAR_WORKSPACE_MESSAGES.INVALID_LESSON_SERVICE,
            );

            cleanup();
        }
    });

    test('rejeita serviços mensais inválidos', () => {
        const invalidServices = [
            null,
            'materials',
            42,
            {},
            [],
            { listMonthlyMaterials() {} },
            {
                listMonthlyMaterials() {},
                saveMonthlyMaterial() {},
            },
            {
                listMonthlyMaterials() {},
                saveMonthlyMaterial() {},
                deleteMonthlyMaterial: true,
            },
        ];

        for (const monthlyMaterialService of invalidServices) {
            expect(() => render(
                <CalendarWorkspace
                    administratorName="Dionísio Pereira"
                    onLogout={() => {}}
                    monthlyMaterialService={monthlyMaterialService}
                />,
            )).toThrowError(
                CALENDAR_WORKSPACE_MESSAGES
                    .INVALID_MONTHLY_MATERIAL_SERVICE,
            );

            cleanup();
        }
    });
});

describe('painel geral da área autenticada', () => {
    test('apresenta a identidade original e a sessão normalizada', () => {
        renderWorkspace({
            administratorName: '  Dionísio Pereira  ',
        });

        expect(screen.getByRole('main')).toBeTruthy();
        expect(
            screen.getByRole('heading', {
                level: 1,
                name: 'Calendário de Aulas',
            }),
        ).toBeTruthy();
        expect(
            screen.getByText(
                'Prof. Dionísio Pereira — Senac Ceilândia',
            ),
        ).toBeTruthy();
        expect(
            screen.getByText('Sessão de Dionísio Pereira'),
        ).toBeTruthy();
    });

    test('consulta e apresenta o painel persistente inicialmente vazio', async () => {
        const {
            lessonService,
            monthlyMaterialService,
        } = renderWorkspace();

        expect(screen.getByText(
            CALENDAR_DASHBOARD_MESSAGES.LOADING,
        )).toBeTruthy();

        expect(await screen.findByRole('heading', {
                level: 2,
                name: 'Total de aulas registradas',
            })).toBeTruthy();
        expect(
            screen.getByLabelText(
                'Total de aulas registradas: 0',
            ).textContent,
        ).toBe('0');
        expect(
            screen.getByText(
                CALENDAR_DASHBOARD_MESSAGES.UPCOMING_EMPTY,
            ),
        ).toBeTruthy();
        expect(
            screen.getByText(
                CALENDAR_DASHBOARD_MESSAGES.REVIEW_EMPTY,
            ),
        ).toBeTruthy();
        expect(lessonService.listLessons).toHaveBeenCalledOnce();
        expect(lessonService.listLessons).toHaveBeenCalledWith({});
        expect(
            monthlyMaterialService.listMonthlyMaterials,
        ).toHaveBeenCalledOnce();
    });
});

describe('navegação da área autenticada', () => {
    test('troca entre as quatro seções originais', async () => {
        const user = userEvent.setup();

        renderWorkspace();

        await user.click(
            screen.getByRole('button', {
                name: 'Gerenciar aulas',
            }),
        );
        expect(
            screen.getByRole('heading', {
                level: 2,
                name: 'Gerenciar aulas',
            }),
        ).toBeTruthy();

        await user.click(
            screen.getByRole('button', { name: 'Materiais' }),
        );
        expect(
            screen.getByRole('heading', {
                level: 2,
                name: 'Links de Materiais',
            }),
        ).toBeTruthy();
        expect(screen.getByRole('heading', {
            level: 2,
            name: 'Por aula (data específica)',
        })).toBeTruthy();
        expect(screen.getByRole('heading', {
            level: 2,
            name: 'Materiais por mês',
        })).toBeTruthy();

        await user.click(
            screen.getByRole('button', {
                name: 'Calendário visual',
            }),
        );
        expect(
            screen.getByRole('heading', {
                level: 2,
                name: 'Calendário Visual',
            }),
        ).toBeTruthy();

        await user.click(
            screen.getByRole('button', {
                name: 'Painel geral',
            }),
        );
        expect(
            screen.getByRole('heading', {
                level: 2,
                name: 'Próximas aulas',
            }),
        ).toBeTruthy();
    });

    test('consulta novamente as aulas quando a seção é aberta', async () => {
        const user = userEvent.setup();
        const { lessonService } = renderWorkspace();

        await waitFor(() => {
            expect(lessonService.listLessons).toHaveBeenCalledTimes(1);
        });

        await user.click(
            screen.getByRole('button', {
                name: 'Gerenciar aulas',
            }),
        );

        expect(await screen.findByText(
            LESSON_MANAGEMENT_MESSAGES.EMPTY,
        )).toBeTruthy();
        await waitFor(() => {
            expect(lessonService.listLessons).toHaveBeenCalledTimes(2);
        });
        expect(lessonService.listLessons).toHaveBeenNthCalledWith(
            2,
            {},
        );
    });

    test('consulta as fontes necessárias ao abrir materiais', async () => {
        const user = userEvent.setup();
        const {
            lessonService,
            monthlyMaterialService,
        } = renderWorkspace();

        await waitFor(() => {
            expect(lessonService.listLessons).toHaveBeenCalledTimes(1);
            expect(
                monthlyMaterialService.listMonthlyMaterials,
            ).toHaveBeenCalledTimes(1);
        });

        await user.click(
            screen.getByRole('button', { name: 'Materiais' }),
        );

        expect(await screen.findByText(
            LESSON_MATERIAL_MANAGEMENT_MESSAGES.EMPTY,
        )).toBeTruthy();
        expect(await screen.findByText(
            MONTHLY_MATERIAL_MANAGEMENT_MESSAGES.EMPTY,
        )).toBeTruthy();
        expect(lessonService.listLessons).toHaveBeenCalledTimes(2);
        expect(lessonService.listLessons).toHaveBeenNthCalledWith(
            2,
            {},
        );
        expect(
            monthlyMaterialService.listMonthlyMaterials,
        ).toHaveBeenCalledTimes(3);
    });

    test('consulta as duas fontes somente ao abrir o calendário visual', async () => {
        const user = userEvent.setup();
        const {
            lessonService,
            monthlyMaterialService,
        } = renderWorkspace();

        await waitFor(() => {
            expect(lessonService.listLessons).toHaveBeenCalledTimes(1);
            expect(
                monthlyMaterialService.listMonthlyMaterials,
            ).toHaveBeenCalledTimes(1);
        });

        await user.click(
            screen.getByRole('button', {
                name: 'Calendário visual',
            }),
        );

        await waitFor(() => {
            expect(lessonService.listLessons).toHaveBeenCalledTimes(2);
            expect(
                monthlyMaterialService.listMonthlyMaterials,
            ).toHaveBeenCalledTimes(2);
        });
        expect(lessonService.listLessons).toHaveBeenNthCalledWith(
            2,
            {},
        );
        expect(screen.getByLabelText(/^Calendário de /)).toBeTruthy();
    });
});

describe('saída pela área autenticada', () => {
    test('encaminha a solicitação ao responsável pela sessão', async () => {
        const user = userEvent.setup();
        const { onLogout } = renderWorkspace();

        await user.click(
            screen.getByRole('button', { name: 'Sair' }),
        );

        expect(onLogout).toHaveBeenCalledTimes(1);
        expect(onLogout).toHaveBeenCalledWith();
    });

    test('representa uma saída em andamento', () => {
        renderWorkspace({ isLoggingOut: true });

        const button = screen.getByRole('button', {
            name: 'Saindo...',
        });

        expect(button.disabled).toBe(true);
        expect(button.getAttribute('aria-busy')).toBe('true');
    });

    test('apresenta somente um erro público visível', () => {
        const publicMessage =
            'Não foi possível sair agora. Tente novamente.';

        renderWorkspace({ logoutError: publicMessage });

        expect(screen.getByRole('alert').textContent).toBe(
            publicMessage,
        );
    });

    test('não cria um alerta para uma mensagem vazia', () => {
        renderWorkspace({ logoutError: '   ' });

        expect(screen.queryByRole('alert')).toBeNull();
    });
});
