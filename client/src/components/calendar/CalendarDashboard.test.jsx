import {
    cleanup,
    render,
    screen,
    waitFor,
    within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
    afterEach,
    describe,
    expect,
    test,
    vi,
} from 'vitest';

import { LessonApiError } from '../../services/LessonApi.js';
import {
    MonthlyMaterialApiError,
} from '../../services/MonthlyMaterialApi.js';
import {
    CALENDAR_DASHBOARD_IDS,
    CALENDAR_DASHBOARD_MESSAGES,
    UPCOMING_LESSON_LIMIT,
    CalendarDashboard,
    compareLessons,
    createCalendarDashboardData,
    createCourseBreakdown,
    isValidDashboardDate,
} from './CalendarDashboard.jsx';

afterEach(() => {
    cleanup();
});

/**
 * Cria uma aula pública completa sem compartilhar estado entre cenários.
 *
 * @param {object} overrides Campos específicos do teste.
 * @returns {Readonly<object>} Aula controlada.
 */
function createLesson(overrides = {}) {
    return Object.freeze({
        id: 'lesson-1',
        date: '2026-09-21',
        course: 'APQSA',
        curricularUnit: 'Qualidade de Software',
        type: 'Aula',
        lessonNumber: '12',
        needsReview: false,
        lessonPlanUrl: null,
        studentGuideUrl: null,
        ...overrides,
    });
}

/**
 * Cria um material mensal público.
 *
 * @param {object} overrides Campos específicos do teste.
 * @returns {Readonly<object>} Material controlado.
 */
function createMonthlyMaterial(overrides = {}) {
    return Object.freeze({
        id: 'material-1',
        month: '2026-09',
        lessonPlanUrl: 'https://example.com/pa-mensal',
        studentGuideUrl: 'https://example.com/gd-ad-mensal',
        ...overrides,
    });
}

function createLessonService(lessons = []) {
    return {
        listLessons: vi.fn().mockResolvedValue(
            Object.freeze([...lessons]),
        ),
    };
}

function createMonthlyMaterialService(materials = []) {
    return {
        listMonthlyMaterials: vi.fn().mockResolvedValue(
            Object.freeze([...materials]),
        ),
    };
}

function createDeferredPromise() {
    let resolve;
    let reject;

    const promise = new Promise((promiseResolve, promiseReject) => {
        resolve = promiseResolve;
        reject = promiseReject;
    });

    return { promise, reject, resolve };
}

function renderDashboard({
    lessons = [],
    materials = [],
    lessonService = createLessonService(lessons),
    monthlyMaterialService = createMonthlyMaterialService(materials),
    todayProvider = () => '2026-09-21',
} = {}) {
    const view = render(
        <CalendarDashboard
            lessonService={lessonService}
            monthlyMaterialService={monthlyMaterialService}
            todayProvider={todayProvider}
        />,
    );

    return {
        lessonService,
        monthlyMaterialService,
        todayProvider,
        view,
    };
}

describe('configuração do painel geral', () => {
    test('expõe contratos estáveis e protegidos', () => {
        expect(CALENDAR_DASHBOARD_IDS).toEqual({
            TOTAL: 'calendar-dashboard-total',
            UPCOMING: 'calendar-dashboard-upcoming',
            REVIEW: 'calendar-dashboard-review',
            RESULTS: 'calendar-dashboard-results',
        });
        expect(UPCOMING_LESSON_LIMIT).toBe(5);
        expect(Object.isFrozen(CALENDAR_DASHBOARD_IDS)).toBe(true);
        expect(Object.isFrozen(CALENDAR_DASHBOARD_MESSAGES)).toBe(
            true,
        );
    });

    test('rejeita serviços e relógios inválidos', () => {
        const lessonService = createLessonService();
        const monthlyMaterialService = createMonthlyMaterialService();

        for (const invalidLessonService of [
            null,
            [],
            {},
            { listLessons: true },
        ]) {
            expect(() => render(
                <CalendarDashboard
                    lessonService={invalidLessonService}
                    monthlyMaterialService={monthlyMaterialService}
                />,
            )).toThrowError(
                CALENDAR_DASHBOARD_MESSAGES.INVALID_LESSON_SERVICE,
            );
            cleanup();
        }

        for (const invalidMonthlyService of [
            null,
            [],
            {},
            { listMonthlyMaterials: true },
        ]) {
            expect(() => render(
                <CalendarDashboard
                    lessonService={lessonService}
                    monthlyMaterialService={invalidMonthlyService}
                />,
            )).toThrowError(
                CALENDAR_DASHBOARD_MESSAGES
                    .INVALID_MONTHLY_MATERIAL_SERVICE,
            );
            cleanup();
        }

        expect(() => render(
            <CalendarDashboard
                lessonService={lessonService}
                monthlyMaterialService={monthlyMaterialService}
                todayProvider="2026-09-21"
            />,
        )).toThrowError(
            CALENDAR_DASHBOARD_MESSAGES.INVALID_TODAY_PROVIDER,
        );
    });
});

describe('preparação dos dados do painel', () => {
    test('reconhece somente datas civis existentes', () => {
        expect(isValidDashboardDate('2026-09-21')).toBe(true);
        expect(isValidDashboardDate('2024-02-29')).toBe(true);

        for (const value of [
            '2026-02-29',
            '2026-13-01',
            '0000-01-01',
            '21/09/2026',
            '',
            null,
        ]) {
            expect(isValidDashboardDate(value)).toBe(false);
        }
    });

    test('ordena por data e identificador sem alterar as fontes', () => {
        const first = createLesson({
            id: 'b',
            date: '2026-09-21',
        });
        const second = createLesson({
            id: 'a',
            date: '2026-09-21',
        });
        const third = createLesson({
            id: 'c',
            date: '2026-09-22',
        });
        const source = Object.freeze([third, first, second]);
        const sorted = [...source].sort(compareLessons);

        expect(sorted.map((lesson) => lesson.id)).toEqual([
            'a',
            'b',
            'c',
        ]);
        expect(source.map((lesson) => lesson.id)).toEqual([
            'c',
            'b',
            'a',
        ]);
    });

    test('conta somente cursos presentes em ordem pública', () => {
        const breakdown = createCourseBreakdown([
            createLesson({ id: 'marketing', course: 'TECMKT' }),
            createLesson({ id: 'quality-1' }),
            createLesson({ id: 'quality-2' }),
        ]);

        expect(breakdown).toEqual([
            { course: 'APQSA', count: 2 },
            { course: 'TECMKT', count: 1 },
        ]);
        expect(Object.isFrozen(breakdown)).toBe(true);
        expect(Object.isFrozen(breakdown[0])).toBe(true);
    });

    test('limita próximas aulas e mantém todas as revisões', () => {
        const lessons = Object.freeze([
            createLesson({
                id: 'past-review',
                date: '2026-09-20',
                needsReview: true,
            }),
            ...Array.from({ length: 6 }, (_, index) => createLesson({
                id: `future-${index + 1}`,
                date: `2026-09-${String(21 + index).padStart(2, '0')}`,
                needsReview: index === 5,
            })),
        ]);
        const monthlyMaterials = Object.freeze([
            createMonthlyMaterial(),
        ]);
        const dashboard = createCalendarDashboardData(
            lessons,
            monthlyMaterials,
            () => '2026-09-21',
        );

        expect(dashboard.totalLessons).toBe(7);
        expect(dashboard.upcomingLessons).toHaveLength(5);
        expect(dashboard.upcomingLessons.map((lesson) => lesson.id))
            .toEqual([
                'future-1',
                'future-2',
                'future-3',
                'future-4',
                'future-5',
            ]);
        expect(dashboard.reviewLessons.map((lesson) => lesson.id))
            .toEqual(['past-review', 'future-6']);
        expect(dashboard.monthlyMaterials).toBe(monthlyMaterials);
        expect(Object.isFrozen(dashboard)).toBe(true);
        expect(Object.isFrozen(dashboard.upcomingLessons)).toBe(true);
        expect(Object.isFrozen(dashboard.reviewLessons)).toBe(true);
    });

    test('rejeita uma data inválida produzida pelo relógio', () => {
        expect(() => createCalendarDashboardData(
            [],
            [],
            () => '2026-02-30',
        )).toThrowError(
            CALENDAR_DASHBOARD_MESSAGES.INVALID_TODAY,
        );
    });
});

describe('consulta e apresentação do painel geral', () => {
    test('consulta as duas fontes e apresenta os estados vazios', async () => {
        const { lessonService, monthlyMaterialService } =
            renderDashboard();

        expect(screen.getByText(
            CALENDAR_DASHBOARD_MESSAGES.LOADING,
        )).toBeTruthy();
        expect(await screen.findByText(
            CALENDAR_DASHBOARD_MESSAGES.UPCOMING_EMPTY,
        )).toBeTruthy();
        expect(screen.getByText(
            CALENDAR_DASHBOARD_MESSAGES.REVIEW_EMPTY,
        )).toBeTruthy();
        expect(screen.getByLabelText(
            'Total de aulas registradas: 0',
        ).textContent).toBe('0');
        expect(lessonService.listLessons).toHaveBeenCalledOnce();
        expect(lessonService.listLessons).toHaveBeenCalledWith({});
        expect(
            monthlyMaterialService.listMonthlyMaterials,
        ).toHaveBeenCalledOnce();
        expect(
            monthlyMaterialService.listMonthlyMaterials,
        ).toHaveBeenCalledWith();
    });

    test('apresenta total, quantidades, próximas aulas e revisões', async () => {
        renderDashboard({
            lessons: [
                createLesson({
                    id: 'past-review',
                    date: '2026-09-20',
                    course: 'TECMKT',
                    curricularUnit: 'Marketing',
                    type: 'Atividade',
                    lessonNumber: '4',
                    needsReview: true,
                }),
                createLesson({
                    id: 'today',
                    needsReview: true,
                }),
                createLesson({
                    id: 'future',
                    date: '2026-09-22',
                    course: 'TECADM',
                    curricularUnit: 'Administração',
                    lessonNumber: null,
                }),
            ],
        });

        expect((await screen.findByLabelText(
            'Total de aulas registradas: 3',
        )).textContent).toBe('3');

        const breakdown = screen.getByRole('list', {
            name: 'Quantidade por curso',
        });

        expect(within(breakdown).getByText('APQSA: 1')).toBeTruthy();
        expect(within(breakdown).getByText('TECMKT: 1')).toBeTruthy();
        expect(within(breakdown).getByText('TECADM: 1')).toBeTruthy();

        const upcomingTable = screen.getByRole('table', {
            name: 'Próximas cinco aulas',
        });
        const reviewTable = screen.getByRole('table', {
            name: 'Aulas marcadas para revisão',
        });

        expect(within(upcomingTable).getByText('21/09/2026'))
            .toBeTruthy();
        expect(within(upcomingTable).getByText('22/09/2026'))
            .toBeTruthy();
        expect(within(upcomingTable).queryByText('20/09/2026'))
            .toBeNull();
        expect(within(reviewTable).getByText('20/09/2026'))
            .toBeTruthy();
        expect(within(reviewTable).getByText('21/09/2026'))
            .toBeTruthy();
        expect(within(reviewTable).getByText('Atividade Aula 4'))
            .toBeTruthy();
        expect(within(reviewTable).getAllByLabelText(
            'Marcada para revisão',
        )).toHaveLength(2);
    });

    test('aplica a precedência específica e o fallback mensal', async () => {
        renderDashboard({
            lessons: [
                createLesson({
                    id: 'specific',
                    curricularUnit: 'Material específico',
                    lessonPlanUrl: 'https://example.com/pa-aula',
                }),
                createLesson({
                    id: 'monthly',
                    date: '2026-09-22',
                    curricularUnit: 'Material mensal',
                }),
                createLesson({
                    id: 'missing',
                    date: '2026-10-01',
                    curricularUnit: 'Sem material',
                }),
            ],
            materials: [createMonthlyMaterial()],
        });

        const table = await screen.findByRole('table', {
            name: 'Próximas cinco aulas',
        });
        const rows = within(table).getAllByRole('row');
        const specificRow = rows.find(
            (row) => row.textContent.includes('Material específico'),
        );
        const monthlyRow = rows.find(
            (row) => row.textContent.includes('Material mensal'),
        );
        const missingRow = rows.find(
            (row) => row.textContent.includes('Sem material'),
        );

        expect(within(specificRow).getByRole('link', {
            name: 'PA',
        }).getAttribute('href')).toBe('https://example.com/pa-aula');
        expect(within(specificRow).queryByRole('link', {
            name: 'GD+AD',
        })).toBeNull();
        expect(within(monthlyRow).getByRole('link', {
            name: 'PA',
        }).getAttribute('href')).toBe(
            'https://example.com/pa-mensal',
        );
        expect(within(monthlyRow).getByRole('link', {
            name: 'GD+AD',
        }).getAttribute('href')).toBe(
            'https://example.com/gd-ad-mensal',
        );
        expect(within(missingRow).getByText('—')).toBeTruthy();
    });

    test('preserva uma falha pública e permite repetir', async () => {
        const user = userEvent.setup();
        const publicMessage = 'A sessão administrativa expirou.';
        const lessonService = createLessonService();

        lessonService.listLessons
            .mockRejectedValueOnce(new LessonApiError(
                publicMessage,
                { statusCode: 401, code: 'AUTHENTICATION_REQUIRED' },
            ))
            .mockResolvedValueOnce(Object.freeze([]));

        renderDashboard({ lessonService });

        expect((await screen.findByRole('alert')).textContent).toBe(
            publicMessage,
        );
        await user.click(screen.getByRole('button', {
            name: 'Tentar novamente',
        }));

        expect(await screen.findByText(
            CALENDAR_DASHBOARD_MESSAGES.UPCOMING_EMPTY,
        )).toBeTruthy();
        expect(lessonService.listLessons).toHaveBeenCalledTimes(2);
    });

    test('preserva também uma falha pública dos materiais mensais', async () => {
        const publicMessage = 'A consulta mensal foi recusada.';
        const monthlyMaterialService = createMonthlyMaterialService();

        monthlyMaterialService.listMonthlyMaterials.mockRejectedValue(
            new MonthlyMaterialApiError(publicMessage, {
                statusCode: 503,
                code: 'SERVICE_UNAVAILABLE',
            }),
        );

        renderDashboard({ monthlyMaterialService });

        expect((await screen.findByRole('alert')).textContent).toBe(
            publicMessage,
        );
    });

    test('oculta detalhes de uma falha inesperada', async () => {
        const lessonService = createLessonService();

        lessonService.listLessons.mockRejectedValue(
            new Error('Falha interna com endereço do banco.'),
        );

        renderDashboard({ lessonService });

        expect((await screen.findByRole('alert')).textContent).toBe(
            CALENDAR_DASHBOARD_MESSAGES.UNEXPECTED_ERROR,
        );
        expect(screen.queryByText(/endereço do banco/)).toBeNull();
    });

    test('ignora uma consulta anterior concluída por último', async () => {
        const firstRequest = createDeferredPromise();
        const firstLessonService = {
            listLessons: vi.fn().mockReturnValue(firstRequest.promise),
        };
        const secondLessonService = createLessonService([
            createLesson({
                id: 'current',
                curricularUnit: 'Estado atual',
            }),
        ]);
        const monthlyMaterialService =
            createMonthlyMaterialService();
        const todayProvider = () => '2026-09-21';
        const { view } = renderDashboard({
            lessonService: firstLessonService,
            monthlyMaterialService,
            todayProvider,
        });

        view.rerender(
            <CalendarDashboard
                lessonService={secondLessonService}
                monthlyMaterialService={monthlyMaterialService}
                todayProvider={todayProvider}
            />,
        );

        expect(await screen.findByText('Estado atual')).toBeTruthy();

        firstRequest.resolve(Object.freeze([
            createLesson({
                id: 'old',
                curricularUnit: 'Estado antigo',
            }),
        ]));

        await waitFor(() => {
            expect(secondLessonService.listLessons)
                .toHaveBeenCalledOnce();
        });
        expect(screen.queryByText('Estado antigo')).toBeNull();
        expect(screen.getByText('Estado atual')).toBeTruthy();
    });

    test('não atualiza a interface depois da desmontagem', async () => {
        const deferredLessons = createDeferredPromise();
        const lessonService = {
            listLessons: vi.fn().mockReturnValue(
                deferredLessons.promise,
            ),
        };
        const { view } = renderDashboard({ lessonService });

        expect(screen.getByText(
            CALENDAR_DASHBOARD_MESSAGES.LOADING,
        )).toBeTruthy();
        view.unmount();
        deferredLessons.resolve(Object.freeze([createLesson()]));

        await Promise.resolve();
        await Promise.resolve();

        expect(screen.queryByText('Qualidade de Software')).toBeNull();
    });
});
