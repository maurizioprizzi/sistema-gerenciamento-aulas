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
    CALENDAR_MONTH_NAMES,
    CALENDAR_VISUAL_IDS,
    CALENDAR_VISUAL_MESSAGES,
    CALENDAR_WEEKDAYS,
    CalendarVisual,
    createCalendarCells,
    createCalendarPeriodFromDate,
    formatCalendarPeriod,
    isValidCalendarPeriod,
    isValidCalendarVisualDate,
    readCalendarToday,
    shiftCalendarPeriod,
} from './CalendarVisual.jsx';

afterEach(() => {
    cleanup();
});

/**
 * Cria uma aula pública completa e independente.
 *
 * @param {object} overrides Campos específicos do cenário.
 * @returns {Readonly<object>} Aula controlada.
 */
function createLesson(overrides = {}) {
    return Object.freeze({
        id: 'lesson-1',
        date: '2026-09-22',
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
 * Cria um material mensal público e independente.
 *
 * @param {object} overrides Campos específicos do cenário.
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

function renderCalendar({
    lessons = [],
    materials = [],
    lessonService = createLessonService(lessons),
    monthlyMaterialService = createMonthlyMaterialService(materials),
    todayProvider = () => '2026-09-22',
} = {}) {
    const view = render(
        <CalendarVisual
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

describe('configuração do calendário visual', () => {
    test('expõe contratos estáveis e protegidos', () => {
        expect(CALENDAR_VISUAL_IDS).toEqual({
            TITLE: 'calendar-visual-title',
            RESULTS: 'calendar-visual-results',
            COURSE_FILTER: 'calendar-visual-course-filter',
            DETAILS_TITLE: 'calendar-visual-details-title',
            DETAILS_DESCRIPTION:
                'calendar-visual-details-description',
        });
        expect(CALENDAR_MONTH_NAMES).toEqual([
            'Janeiro',
            'Fevereiro',
            'Março',
            'Abril',
            'Maio',
            'Junho',
            'Julho',
            'Agosto',
            'Setembro',
            'Outubro',
            'Novembro',
            'Dezembro',
        ]);
        expect(CALENDAR_WEEKDAYS).toEqual([
            'Dom',
            'Seg',
            'Ter',
            'Qua',
            'Qui',
            'Sex',
            'Sáb',
        ]);
        expect(Object.isFrozen(CALENDAR_VISUAL_IDS)).toBe(true);
        expect(Object.isFrozen(CALENDAR_VISUAL_MESSAGES)).toBe(true);
        expect(Object.isFrozen(CALENDAR_MONTH_NAMES)).toBe(true);
        expect(Object.isFrozen(CALENDAR_WEEKDAYS)).toBe(true);
    });

    test('rejeita serviços, relógios e datas atuais inválidos', () => {
        const lessonService = createLessonService();
        const monthlyMaterialService = createMonthlyMaterialService();

        for (const invalidLessonService of [
            null,
            [],
            {},
            { listLessons: true },
        ]) {
            expect(() => render(
                <CalendarVisual
                    lessonService={invalidLessonService}
                    monthlyMaterialService={monthlyMaterialService}
                />,
            )).toThrowError(
                CALENDAR_VISUAL_MESSAGES.INVALID_LESSON_SERVICE,
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
                <CalendarVisual
                    lessonService={lessonService}
                    monthlyMaterialService={invalidMonthlyService}
                />,
            )).toThrowError(
                CALENDAR_VISUAL_MESSAGES
                    .INVALID_MONTHLY_MATERIAL_SERVICE,
            );
            cleanup();
        }

        expect(() => render(
            <CalendarVisual
                lessonService={lessonService}
                monthlyMaterialService={monthlyMaterialService}
                todayProvider="2026-09-22"
            />,
        )).toThrowError(
            CALENDAR_VISUAL_MESSAGES.INVALID_TODAY_PROVIDER,
        );

        expect(() => render(
            <CalendarVisual
                lessonService={lessonService}
                monthlyMaterialService={monthlyMaterialService}
                todayProvider={() => '2026-02-30'}
            />,
        )).toThrowError(CALENDAR_VISUAL_MESSAGES.INVALID_TODAY);
    });
});

describe('preparação civil da grade mensal', () => {
    test('reconhece somente datas civis existentes', () => {
        expect(isValidCalendarVisualDate('2026-09-22')).toBe(true);
        expect(isValidCalendarVisualDate('2024-02-29')).toBe(true);

        for (const value of [
            '2026-02-29',
            '2026-13-01',
            '0000-01-01',
            '22/09/2026',
            '',
            null,
        ]) {
            expect(isValidCalendarVisualDate(value)).toBe(false);
        }
    });

    test('valida o relógio e cria um período mensal imutável', () => {
        const todayProvider = vi.fn(() => '2026-09-22');
        const today = readCalendarToday(todayProvider);
        const period = createCalendarPeriodFromDate(today);

        expect(todayProvider).toHaveBeenCalledOnce();
        expect(period).toEqual({ year: 2026, month: 8 });
        expect(Object.isFrozen(period)).toBe(true);
        expect(isValidCalendarPeriod(period)).toBe(true);
        expect(formatCalendarPeriod(period)).toBe('Setembro 2026');

        for (const invalidPeriod of [
            null,
            [],
            {},
            { year: 0, month: 0 },
            { year: 2026, month: 12 },
            { year: 2026.5, month: 8 },
        ]) {
            expect(isValidCalendarPeriod(invalidPeriod)).toBe(false);
            expect(
                () => formatCalendarPeriod(invalidPeriod),
            ).toThrowError(CALENDAR_VISUAL_MESSAGES.INVALID_PERIOD);
        }
    });

    test('navega entre anos sem alterar o período recebido', () => {
        const december = Object.freeze({ year: 2026, month: 11 });
        const january = shiftCalendarPeriod(december, 1);
        const previousDecember = shiftCalendarPeriod(january, -1);

        expect(january).toEqual({ year: 2027, month: 0 });
        expect(previousDecember).toEqual(december);
        expect(december).toEqual({ year: 2026, month: 11 });
        expect(Object.isFrozen(january)).toBe(true);

        expect(
            () => shiftCalendarPeriod(december, 0),
        ).toThrowError(CALENDAR_VISUAL_MESSAGES.INVALID_DIRECTION);
        expect(
            () => shiftCalendarPeriod({ year: 1, month: 0 }, -1),
        ).toThrowError(CALENDAR_VISUAL_MESSAGES.INVALID_PERIOD);
    });

    test('cria as células do mês na ordem original', () => {
        const lessons = Object.freeze([
            createLesson(),
            createLesson({
                id: 'lesson-2',
                date: '2026-09-05',
                course: 'TECMKT',
            }),
            createLesson({
                id: 'outside',
                date: '2026-10-01',
            }),
        ]);
        const cells = createCalendarCells(
            { year: 2026, month: 8 },
            lessons,
            '',
            '2026-09-22',
        );
        const days = cells.filter((cell) => !cell.isEmpty);
        const today = days.find((cell) => cell.day === 22);
        const saturday = days.find((cell) => cell.day === 5);

        expect(cells).toHaveLength(32);
        expect(cells.slice(0, 2).every((cell) => cell.isEmpty))
            .toBe(true);
        expect(days).toHaveLength(30);
        expect(days[0].date).toBe('2026-09-01');
        expect(days.at(-1).date).toBe('2026-09-30');
        expect(today.isToday).toBe(true);
        expect(today.lessons).toEqual([lessons[0]]);
        expect(saturday.isWeekend).toBe(true);
        expect(saturday.lessons).toEqual([lessons[1]]);
        expect(Object.isFrozen(cells)).toBe(true);
        expect(Object.isFrozen(today)).toBe(true);
        expect(Object.isFrozen(today.lessons)).toBe(true);
        expect(lessons).toHaveLength(3);
    });

    test('filtra os registros pelo curso sem alterar a grade', () => {
        const lessons = [
            createLesson(),
            createLesson({ id: 'lesson-2', course: 'TECMKT' }),
        ];
        const cells = createCalendarCells(
            { year: 2026, month: 8 },
            lessons,
            'TECMKT',
            '2026-09-22',
        );
        const day = cells.find((cell) => cell.day === 22);

        expect(day.lessons).toEqual([lessons[1]]);
        expect(lessons).toHaveLength(2);

        for (const invalidCourse of [null, 'OUTRO', 42]) {
            expect(() => createCalendarCells(
                { year: 2026, month: 8 },
                lessons,
                invalidCourse,
                '2026-09-22',
            )).toThrowError(CALENDAR_VISUAL_MESSAGES.INVALID_COURSE);
        }
    });
});

describe('consulta e apresentação do calendário visual', () => {
    test('consulta as duas fontes e apresenta o mês civil atual', async () => {
        const todayProvider = vi.fn(() => '2026-09-22');
        const { lessonService, monthlyMaterialService } =
            renderCalendar({ todayProvider });

        expect(screen.getByText(
            CALENDAR_VISUAL_MESSAGES.LOADING,
        )).toBeTruthy();

        expect(await screen.findByRole('heading', {
            level: 3,
            name: 'Setembro 2026',
        })).toBeTruthy();
        expect(lessonService.listLessons).toHaveBeenCalledOnce();
        expect(lessonService.listLessons).toHaveBeenCalledWith({});
        expect(monthlyMaterialService.listMonthlyMaterials)
            .toHaveBeenCalledOnce();
        expect(todayProvider).toHaveBeenCalledOnce();

        const grid = screen.getByLabelText(
            'Calendário de Setembro 2026',
        );

        for (const weekday of CALENDAR_WEEKDAYS) {
            expect(within(grid).getByText(weekday)).toBeTruthy();
        }

        const today = screen.getByRole('group', {
            name: '22/09/2026: 0 registros',
        });

        expect(today.classList.contains('is-today')).toBe(true);
        expect(today.querySelector('time').textContent).toBe('22');
        expect(screen.queryByRole('dialog')).toBeNull();
    });

    test('navega entre meses e retorna à data atual sem consultar novamente', async () => {
        const user = userEvent.setup();
        const todayProvider = vi.fn()
            .mockReturnValueOnce('2026-12-15')
            .mockReturnValueOnce('2026-12-15');
        const { lessonService, monthlyMaterialService } =
            renderCalendar({ todayProvider });

        expect(await screen.findByText('Dezembro 2026')).toBeTruthy();

        await user.click(screen.getByRole('button', {
            name: 'Próximo',
        }));
        expect(screen.getByText('Janeiro 2027')).toBeTruthy();

        await user.click(screen.getByRole('button', {
            name: 'Anterior',
        }));
        await user.click(screen.getByRole('button', {
            name: 'Anterior',
        }));
        expect(screen.getByText('Novembro 2026')).toBeTruthy();

        await user.click(screen.getByRole('button', { name: 'Hoje' }));
        expect(screen.getByText('Dezembro 2026')).toBeTruthy();
        expect(todayProvider).toHaveBeenCalledTimes(2);
        expect(lessonService.listLessons).toHaveBeenCalledOnce();
        expect(monthlyMaterialService.listMonthlyMaterials)
            .toHaveBeenCalledOnce();
    });

    test('aplica o curso localmente sem repetir as consultas', async () => {
        const user = userEvent.setup();
        const { lessonService, monthlyMaterialService } =
            renderCalendar({
                lessons: [
                    createLesson(),
                    createLesson({
                        id: 'lesson-2',
                        course: 'TECMKT',
                        curricularUnit: 'Marketing Digital',
                    }),
                ],
            });

        const apqsaEvent = await screen.findByRole('button', {
            name: /Ver detalhes: APQSA, Qualidade de Software/,
        });
        expect(apqsaEvent).toBeTruthy();
        expect(screen.getByRole('button', {
            name: /Ver detalhes: TECMKT, Marketing Digital/,
        })).toBeTruthy();

        await user.selectOptions(
            screen.getByLabelText('Curso'),
            'TECMKT',
        );

        expect(screen.queryByRole('button', {
            name: /Ver detalhes: APQSA, Qualidade de Software/,
        })).toBeNull();
        expect(screen.getByRole('button', {
            name: /Ver detalhes: TECMKT, Marketing Digital/,
        })).toBeTruthy();
        expect(lessonService.listLessons).toHaveBeenCalledOnce();
        expect(monthlyMaterialService.listMonthlyMaterials)
            .toHaveBeenCalledOnce();
    });

    test('representa curso, tipo, número e marcação para revisão', async () => {
        const lesson = createLesson({
            course: 'TECADM',
            type: 'Avaliação',
            lessonNumber: '2',
            needsReview: true,
        });

        renderCalendar({ lessons: [lesson] });

        const event = await screen.findByRole('button', {
            name:
                'Ver detalhes: TECADM, Qualidade de Software, '
                + 'Avaliação Aula 2, marcada para revisão',
        });

        expect(event.classList.contains('course-TECADM')).toBe(true);
        expect(event.classList.contains('needs-review')).toBe(true);
        expect(event.title).toContain('★ Revisão');
        expect(event.textContent).toContain(
            'UC Qualidade de Software Avaliação Aula 2',
        );
    });

    test('abre e fecha detalhes com o material mensal aplicável', async () => {
        const user = userEvent.setup();

        renderCalendar({
            lessons: [createLesson({ needsReview: true })],
            materials: [createMonthlyMaterial()],
        });

        await user.click(await screen.findByRole('button', {
            name: /Ver detalhes: APQSA, Qualidade de Software/,
        }));

        const dialog = screen.getByRole('dialog', {
            name: 'Detalhes da aula',
        });

        expect(within(dialog).getByText('22/09/2026')).toBeTruthy();
        expect(within(dialog).getByText('APQSA')).toBeTruthy();
        expect(within(dialog).getByText('Qualidade de Software'))
            .toBeTruthy();
        expect(within(dialog).getByText('Aula 12')).toBeTruthy();
        expect(within(dialog).getByText('Marcada para revisão'))
            .toBeTruthy();
        expect(within(dialog).getByRole('link', { name: 'PA' })
            .getAttribute('href')).toBe(
            'https://example.com/pa-mensal',
        );
        expect(within(dialog).getByRole('link', { name: 'GD+AD' })
            .getAttribute('href')).toBe(
            'https://example.com/gd-ad-mensal',
        );

        await user.click(within(dialog).getByRole('button', {
            name: 'Fechar detalhes da aula',
        }));
        expect(screen.queryByRole('dialog')).toBeNull();
    });

    test('prioriza materiais específicos sem completar o link ausente', async () => {
        const user = userEvent.setup();

        renderCalendar({
            lessons: [createLesson({
                lessonPlanUrl: 'https://example.com/pa-especifico',
                studentGuideUrl: null,
            })],
            materials: [createMonthlyMaterial()],
        });

        await user.click(await screen.findByRole('button', {
            name: /Ver detalhes: APQSA, Qualidade de Software/,
        }));

        const dialog = screen.getByRole('dialog');

        expect(within(dialog).getByRole('link', { name: 'PA' })
            .getAttribute('href')).toBe(
            'https://example.com/pa-especifico',
        );
        expect(within(dialog).queryByRole('link', { name: 'GD+AD' }))
            .toBeNull();
        expect(dialog.textContent).not.toContain('pa-mensal');
    });

    test('preserva falhas públicas e permite repetir a consulta', async () => {
        const user = userEvent.setup();
        const lessonMessage = 'A consulta das aulas foi recusada.';
        const lessonService = createLessonService([createLesson()]);
        const monthlyMaterialService =
            createMonthlyMaterialService();

        lessonService.listLessons
            .mockRejectedValueOnce(new LessonApiError(
                lessonMessage,
                {
                    statusCode: 503,
                    code: 'SERVICE_UNAVAILABLE',
                },
            ));

        renderCalendar({ lessonService, monthlyMaterialService });

        expect((await screen.findByRole('alert')).textContent).toBe(
            lessonMessage,
        );

        await user.click(screen.getByRole('button', {
            name: 'Tentar novamente',
        }));

        expect(await screen.findByRole('button', {
            name: /Ver detalhes: APQSA, Qualidade de Software/,
        })).toBeTruthy();
        expect(lessonService.listLessons).toHaveBeenCalledTimes(2);
        expect(monthlyMaterialService.listMonthlyMaterials)
            .toHaveBeenCalledTimes(2);
    });

    test('preserva também falhas públicas dos materiais mensais', async () => {
        const publicMessage = 'A consulta mensal foi recusada.';
        const monthlyMaterialService = createMonthlyMaterialService();

        monthlyMaterialService.listMonthlyMaterials.mockRejectedValue(
            new MonthlyMaterialApiError(publicMessage, {
                statusCode: 503,
                code: 'SERVICE_UNAVAILABLE',
            }),
        );

        renderCalendar({ monthlyMaterialService });

        expect((await screen.findByRole('alert')).textContent).toBe(
            publicMessage,
        );
    });

    test('oculta detalhes de uma falha inesperada', async () => {
        const lessonService = createLessonService();

        lessonService.listLessons.mockRejectedValue(
            new Error('Falha interna contendo endereço do banco.'),
        );

        renderCalendar({ lessonService });

        expect((await screen.findByRole('alert')).textContent).toBe(
            CALENDAR_VISUAL_MESSAGES.UNEXPECTED_ERROR,
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
        const todayProvider = () => '2026-09-22';
        const { view } = renderCalendar({
            lessonService: firstLessonService,
            monthlyMaterialService,
            todayProvider,
        });

        view.rerender(
            <CalendarVisual
                lessonService={secondLessonService}
                monthlyMaterialService={monthlyMaterialService}
                todayProvider={todayProvider}
            />,
        );

        expect(await screen.findByRole('button', {
            name: /Estado atual/,
        })).toBeTruthy();

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
        expect(screen.queryByRole('button', {
            name: /Estado antigo/,
        })).toBeNull();
        expect(screen.getByRole('button', {
            name: /Estado atual/,
        })).toBeTruthy();
    });

    test('não atualiza a interface depois da desmontagem', async () => {
        const deferredLessons = createDeferredPromise();
        const lessonService = {
            listLessons: vi.fn().mockReturnValue(
                deferredLessons.promise,
            ),
        };
        const { view } = renderCalendar({ lessonService });

        expect(screen.getByText(
            CALENDAR_VISUAL_MESSAGES.LOADING,
        )).toBeTruthy();
        view.unmount();
        deferredLessons.resolve(Object.freeze([createLesson()]));

        await Promise.resolve();
        await Promise.resolve();

        expect(screen.queryByText('Qualidade de Software')).toBeNull();
    });
});
