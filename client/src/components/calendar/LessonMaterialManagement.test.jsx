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
    EMPTY_MATERIAL_FILTERS,
    LESSON_MATERIAL_MANAGEMENT_IDS,
    LESSON_MATERIAL_MANAGEMENT_MESSAGES,
    LessonMaterialManagement,
    createAvailableMonths,
    createEmptyMaterialFilters,
    filterMaterialLessons,
    formatCivilDate,
    formatLessonRecord,
    resolveLessonMaterials,
} from './LessonMaterialManagement.jsx';

afterEach(() => {
    cleanup();
});

function createLesson(overrides = {}) {
    return Object.freeze({
        id: 'lesson-1',
        date: '2026-09-18',
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

function renderManagement({
    lessons = [],
    materials = [],
    lessonService = createLessonService(lessons),
    monthlyMaterialService = createMonthlyMaterialService(materials),
    todayProvider = () => '2026-09-18',
    refreshKey = 0,
} = {}) {
    const view = render(
        <LessonMaterialManagement
            lessonService={lessonService}
            monthlyMaterialService={monthlyMaterialService}
            todayProvider={todayProvider}
            refreshKey={refreshKey}
        />,
    );

    return { lessonService, monthlyMaterialService, view };
}

describe('configuracao dos materiais por aula', () => {
    test('expoe contratos estaveis e cria filtros independentes', () => {
        expect(Object.isFrozen(LESSON_MATERIAL_MANAGEMENT_IDS)).toBe(
            true,
        );
        expect(
            Object.isFrozen(LESSON_MATERIAL_MANAGEMENT_MESSAGES),
        ).toBe(true);
        expect(Object.isFrozen(EMPTY_MATERIAL_FILTERS)).toBe(true);
        expect(LESSON_MATERIAL_MANAGEMENT_IDS).toEqual({
            TITLE: 'lesson-material-management-title',
            RESULTS: 'lesson-material-management-results',
        });

        const firstFilters = createEmptyMaterialFilters();
        const secondFilters = createEmptyMaterialFilters();

        expect(firstFilters).toEqual({
            course: '',
            month: '',
            fromToday: false,
        });
        expect(firstFilters).not.toBe(secondFilters);
    });

    test('rejeita dependencias e chaves de atualizacao invalidas', () => {
        const validLessonService = createLessonService();
        const validMonthlyService = createMonthlyMaterialService();

        for (const lessonService of [null, [], {}, { listLessons: true }]) {
            expect(() => render(
                <LessonMaterialManagement
                    lessonService={lessonService}
                    monthlyMaterialService={validMonthlyService}
                />,
            )).toThrowError(
                LESSON_MATERIAL_MANAGEMENT_MESSAGES
                    .INVALID_LESSON_SERVICE,
            );
            cleanup();
        }

        for (const monthlyMaterialService of [
            null,
            [],
            {},
            { listMonthlyMaterials: true },
        ]) {
            expect(() => render(
                <LessonMaterialManagement
                    lessonService={validLessonService}
                    monthlyMaterialService={monthlyMaterialService}
                />,
            )).toThrowError(
                LESSON_MATERIAL_MANAGEMENT_MESSAGES
                    .INVALID_MONTHLY_MATERIAL_SERVICE,
            );
            cleanup();
        }

        expect(() => render(
            <LessonMaterialManagement
                lessonService={validLessonService}
                monthlyMaterialService={validMonthlyService}
                todayProvider="2026-09-18"
            />,
        )).toThrowError(
            LESSON_MATERIAL_MANAGEMENT_MESSAGES.INVALID_TODAY_PROVIDER,
        );

        for (const refreshKey of [-1, 1.5, '1', null]) {
            expect(() => render(
                <LessonMaterialManagement
                    lessonService={validLessonService}
                    monthlyMaterialService={validMonthlyService}
                    refreshKey={refreshKey}
                />,
            )).toThrowError(
                LESSON_MATERIAL_MANAGEMENT_MESSAGES
                    .INVALID_REFRESH_KEY,
            );
            cleanup();
        }
    });
});

describe('preparacao dos materiais por aula', () => {
    test('organiza os meses disponiveis sem duplicacoes', () => {
        const months = createAvailableMonths([
            createLesson({ date: '2026-09-18' }),
            createLesson({ id: 'lesson-2', date: '2026-10-02' }),
            createLesson({ id: 'lesson-3', date: '2026-09-25' }),
        ]);

        expect(months).toEqual(['2026-10', '2026-09']);
        expect(Object.isFrozen(months)).toBe(true);
    });

    test('combina curso, mes e data atual somente no navegador', () => {
        const lessons = [
            createLesson({ id: 'past', date: '2026-09-17' }),
            createLesson({ id: 'today', date: '2026-09-18' }),
            createLesson({
                id: 'other-course',
                date: '2026-09-20',
                course: 'TECMKT',
            }),
            createLesson({ id: 'other-month', date: '2026-10-01' }),
        ];

        const filteredLessons = filterMaterialLessons(
            lessons,
            {
                course: 'APQSA',
                month: '2026-09',
                fromToday: true,
            },
            () => '2026-09-18',
        );

        expect(filteredLessons.map((lesson) => lesson.id)).toEqual([
            'today',
        ]);
        expect(Object.isFrozen(filteredLessons)).toBe(true);
        expect(() => filterMaterialLessons(
            lessons,
            { course: '', month: '', fromToday: true },
            () => '2026-02-30',
        )).toThrowError(
            LESSON_MATERIAL_MANAGEMENT_MESSAGES.INVALID_TODAY,
        );
    });

    test('prioriza os links especificos sem completar o link ausente', () => {
        const material = resolveLessonMaterials(
            createLesson({
                lessonPlanUrl: 'https://example.com/pa-aula',
                studentGuideUrl: null,
            }),
            [createMonthlyMaterial()],
        );

        expect(material).toEqual({
            lessonPlanUrl: 'https://example.com/pa-aula',
            studentGuideUrl: null,
        });
        expect(Object.isFrozen(material)).toBe(true);
    });

    test('usa o material mensal somente sem links especificos', () => {
        const monthlyMaterial = createMonthlyMaterial();

        expect(resolveLessonMaterials(
            createLesson(),
            [monthlyMaterial],
        )).toEqual({
            lessonPlanUrl: monthlyMaterial.lessonPlanUrl,
            studentGuideUrl: monthlyMaterial.studentGuideUrl,
        });
        expect(resolveLessonMaterials(
            createLesson({ date: '2026-10-01' }),
            [monthlyMaterial],
        )).toEqual({
            lessonPlanUrl: null,
            studentGuideUrl: null,
        });
    });

    test('formata datas e identificacoes como no prototipo', () => {
        expect(formatCivilDate('2026-09-18')).toBe('18/09/2026');
        expect(formatLessonRecord(createLesson())).toBe('Aula 12');
        expect(formatLessonRecord(createLesson({ lessonNumber: null })))
            .toBe('Aula');
        expect(formatLessonRecord(createLesson({
            type: 'Atividade',
            lessonNumber: '7',
        }))).toBe('Atividade Aula 7');
        expect(formatLessonRecord(createLesson({
            type: 'Avaliação',
            lessonNumber: null,
        }))).toBe('Avaliação');
    });
});

describe('consulta visual dos materiais por aula', () => {
    test('consulta as duas fontes uma vez e apresenta o estado vazio', async () => {
        const { lessonService, monthlyMaterialService } =
            renderManagement();

        expect(screen.getByRole('heading', {
            level: 2,
            name: 'Por aula (data específica)',
        })).toBeTruthy();
        expect(await screen.findByText(
            LESSON_MATERIAL_MANAGEMENT_MESSAGES.EMPTY,
        )).toBeTruthy();
        expect(lessonService.listLessons).toHaveBeenCalledOnce();
        expect(lessonService.listLessons).toHaveBeenCalledWith({});
        expect(
            monthlyMaterialService.listMonthlyMaterials,
        ).toHaveBeenCalledOnce();
        expect(
            monthlyMaterialService.listMonthlyMaterials,
        ).toHaveBeenCalledWith();
    });

    test('apresenta a tabela com os links mensais aplicaveis', async () => {
        renderManagement({
            lessons: [createLesson()],
            materials: [createMonthlyMaterial()],
        });

        const table = await screen.findByRole('table', {
            name: 'Materiais aplicáveis a cada aula',
        });
        const row = within(table).getAllByRole('row')[1];

        expect(within(row).getByText('18/09/2026')).toBeTruthy();
        expect(within(row).getByText('APQSA')).toBeTruthy();
        expect(within(row).getByText('Qualidade de Software')).toBeTruthy();
        expect(within(row).getByText('Aula 12')).toBeTruthy();

        const lessonPlanLink = within(row).getByRole('link', {
            name: 'Abrir PA',
        });
        const studentGuideLink = within(row).getByRole('link', {
            name: 'Abrir GD+AD',
        });

        expect(lessonPlanLink.getAttribute('href')).toBe(
            'https://example.com/pa-mensal',
        );
        expect(studentGuideLink.getAttribute('href')).toBe(
            'https://example.com/gd-ad-mensal',
        );
        expect(lessonPlanLink.getAttribute('target')).toBe('_blank');
        expect(lessonPlanLink.getAttribute('rel')).toBe(
            'noreferrer noopener',
        );
    });

    test('mantem a precedencia especifica e representa ausencias', async () => {
        renderManagement({
            lessons: [createLesson({
                lessonPlanUrl: 'https://example.com/pa-aula',
            })],
            materials: [createMonthlyMaterial()],
        });

        const row = within(await screen.findByRole('table'))
            .getAllByRole('row')[1];

        expect(within(row).getByRole('link', {
            name: 'Abrir PA',
        }).getAttribute('href')).toBe('https://example.com/pa-aula');
        expect(within(row).queryByRole('link', {
            name: 'Abrir GD+AD',
        })).toBeNull();
        expect(within(row).getByLabelText(
            'Abrir GD+AD: não informado',
        )).toBeTruthy();
    });

    test('aplica imediatamente os tres filtros originais', async () => {
        const user = userEvent.setup();

        renderManagement({
            lessons: [
                createLesson({ id: 'past', date: '2026-09-17' }),
                createLesson({ id: 'today', date: '2026-09-18' }),
                createLesson({
                    id: 'marketing',
                    date: '2026-09-20',
                    course: 'TECMKT',
                    curricularUnit: 'Marketing Digital',
                }),
                createLesson({
                    id: 'october',
                    date: '2026-10-02',
                    curricularUnit: 'Processos',
                }),
            ],
        });

        await screen.findByRole('table');
        const monthSelect = screen.getByLabelText('Mês');

        expect(within(monthSelect).getAllByRole('option').map(
            (option) => option.textContent,
        )).toEqual([
            'Todos os meses',
            'Outubro 2026',
            'Setembro 2026',
        ]);

        await user.selectOptions(screen.getByLabelText('Curso'), 'APQSA');
        await user.selectOptions(monthSelect, '2026-09');
        await user.click(screen.getByRole('checkbox', {
            name: 'Mostrar a partir de hoje',
        }));

        expect(screen.getByText('18/09/2026')).toBeTruthy();
        expect(screen.queryByText('17/09/2026')).toBeNull();
        expect(screen.queryByText('Marketing Digital')).toBeNull();
        expect(screen.queryByText('Processos')).toBeNull();
    });

    test('apresenta falha publica conhecida e permite repetir', async () => {
        const user = userEvent.setup();
        const publicMessage = 'A consulta mensal foi recusada.';
        const monthlyMaterialService = createMonthlyMaterialService();

        monthlyMaterialService.listMonthlyMaterials
            .mockRejectedValueOnce(new MonthlyMaterialApiError(
                publicMessage,
                { statusCode: 503, code: 'SERVICE_UNAVAILABLE' },
            ))
            .mockResolvedValueOnce(Object.freeze([]));

        renderManagement({ monthlyMaterialService });

        expect((await screen.findByRole('alert')).textContent).toBe(
            publicMessage,
        );
        await user.click(screen.getByRole('button', {
            name: 'Tentar novamente',
        }));

        expect(await screen.findByText(
            LESSON_MATERIAL_MANAGEMENT_MESSAGES.EMPTY,
        )).toBeTruthy();
        expect(
            monthlyMaterialService.listMonthlyMaterials,
        ).toHaveBeenCalledTimes(2);
    });

    test('oculta detalhes de uma falha inesperada', async () => {
        const lessonService = createLessonService();

        lessonService.listLessons.mockRejectedValue(
            new Error('MongoDB interno e caminho reservado.'),
        );

        renderManagement({ lessonService });

        expect((await screen.findByRole('alert')).textContent).toBe(
            LESSON_MATERIAL_MANAGEMENT_MESSAGES.UNEXPECTED_ERROR,
        );
        expect(screen.queryByText(/MongoDB interno/)).toBeNull();
    });

    test('recarrega pela chave e ignora uma resposta anterior', async () => {
        const firstRequest = createDeferredPromise();
        const lessonService = createLessonService();
        const monthlyMaterialService = createMonthlyMaterialService();

        lessonService.listLessons
            .mockReturnValueOnce(firstRequest.promise)
            .mockResolvedValueOnce(Object.freeze([
                createLesson({
                    id: 'new',
                    curricularUnit: 'Estado atual',
                }),
            ]));

        const { view } = renderManagement({
            lessonService,
            monthlyMaterialService,
        });

        view.rerender(
            <LessonMaterialManagement
                lessonService={lessonService}
                monthlyMaterialService={monthlyMaterialService}
                todayProvider={() => '2026-09-18'}
                refreshKey={1}
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
            expect(lessonService.listLessons).toHaveBeenCalledTimes(2);
        });
        expect(screen.queryByText('Estado antigo')).toBeNull();
        expect(screen.getByText('Estado atual')).toBeTruthy();
    });

    test('preserva mensagens publicas da API de aulas', async () => {
        const lessonService = createLessonService();
        const publicMessage = 'A consulta das aulas foi recusada.';

        lessonService.listLessons.mockRejectedValue(
            new LessonApiError(publicMessage, {
                statusCode: 400,
                code: 'INVALID_LESSON_FILTERS',
            }),
        );

        renderManagement({ lessonService });

        expect((await screen.findByRole('alert')).textContent).toBe(
            publicMessage,
        );
    });
});
