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
    LessonMaterialManagement as RealLessonMaterialManagement,
    createAvailableMonths,
    createEmptyMaterialFilters,
    defaultTodayProvider,
    filterMaterialLessons,
    formatCivilDate,
    formatLessonRecord,
    resolveLessonMaterials,
} from './LessonMaterialManagement.jsx';

const COURSE_IDS = Object.freeze({
    CD: '507f1f77bcf86cd7994390ab', RC: '507f1f77bcf86cd7994390ac',
});
const TEST_COURSES = Object.freeze([
    { id: COURSE_IDS.CD, name: 'Ciência de Dados', code: 'CD', active: true },
    { id: COURSE_IDS.RC, name: 'Redes de Computadores', code: 'RC', active: false },
]);
const TEST_COURSE_SERVICE = { async listCourses() { return TEST_COURSES; } };
function LessonMaterialManagement(props) {
    return <RealLessonMaterialManagement courseService={TEST_COURSE_SERVICE} {...props} />;
}

afterEach(() => {
    cleanup();
});

function createLesson(overrides = {}) {
    return Object.freeze({
        id: '507f1f77bcf86cd799439011',
        date: '2026-09-18',
        course: 'CD',
        courseId: COURSE_IDS[overrides.course ?? 'CD'],
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
    courseService = TEST_COURSE_SERVICE,
    todayProvider = () => '2026-09-18',
    refreshKey = 0,
} = {}) {
    const view = render(
        <LessonMaterialManagement
            lessonService={lessonService}
            monthlyMaterialService={monthlyMaterialService}
            courseService={courseService}
            todayProvider={todayProvider}
            refreshKey={refreshKey}
        />,
    );

    return { lessonService, monthlyMaterialService, courseService, view };
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
            courseId: '',
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
            createLesson({ id: '000000000000000000000002', date: '2026-10-02' }),
            createLesson({ id: '000000000000000000000003', date: '2026-09-25' }),
        ]);

        expect(months).toEqual(['2026-10', '2026-09']);
        expect(Object.isFrozen(months)).toBe(true);
    });

    test('combina curso, mes e data atual somente no navegador', () => {
        const lessons = [
            createLesson({ id: '000000000000000000000004', date: '2026-09-17' }),
            createLesson({ id: '000000000000000000000005', date: '2026-09-18' }),
            createLesson({
                id: '000000000000000000000006',
                date: '2026-09-20',
                course: 'RC',
            }),
            createLesson({ id: '000000000000000000000007', date: '2026-10-01' }),
        ];

        const filteredLessons = filterMaterialLessons(
            lessons,
            {
                courseId: COURSE_IDS.CD,
                month: '2026-09',
                fromToday: true,
            },
            () => '2026-09-18',
        );

        expect(filteredLessons.map((lesson) => lesson.id)).toEqual([
            '000000000000000000000005',
        ]);
        expect(Object.isFrozen(filteredLessons)).toBe(true);
        expect(() => filterMaterialLessons(
            lessons,
            { courseId: '', month: '', fromToday: true },
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
        expect(within(row).getByText('CD')).toBeTruthy();
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
                createLesson({ id: '000000000000000000000004', date: '2026-09-17' }),
                createLesson({ id: '000000000000000000000005', date: '2026-09-18' }),
                createLesson({
                    id: '000000000000000000000008',
                    date: '2026-09-20',
                    course: 'RC',
                    curricularUnit: 'Marketing Digital',
                }),
                createLesson({
                    id: '000000000000000000000009',
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

        await user.selectOptions(screen.getByLabelText('Curso'), COURSE_IDS.CD);
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
                    id: '00000000000000000000000a',
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
                id: '00000000000000000000000b',
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


describe('cursos personalizados nos materiais por aula', () => {
    test('relógio padrão usa o dia local, mesmo quando o dia UTC seria outro', () => {
        class LocalClock {
            getFullYear() { return 2026; }
            getMonth() { return 9; }
            getDate() { return 25; }
            toISOString() { return '2026-10-26T01:30:00.000Z'; }
        }
        vi.stubGlobal('Date', LocalClock);
        try { expect(defaultTodayProvider()).toBe('2026-10-25'); }
        finally { vi.unstubAllGlobals(); }
    });

    test('recusa siglas, operadores e campos desconhecidos no filtro por identidade', () => {
        for (const extra of [
            { courseId: 'CD' }, { courseId: { $ne: null } }, { course: 'CD' },
            { fromToday: 'true' }, { month: '2026-99' },
        ]) {
            expect(() => filterMaterialLessons([], { ...EMPTY_MATERIAL_FILTERS, ...extra },
                () => '2026-10-25')).toThrowError(LESSON_MATERIAL_MANAGEMENT_MESSAGES.INVALID_FILTERS);
        }
    });

    test('consulta o catálogo uma vez e aplica filtros por ID sem repetir as fontes', async () => {
        const user = userEvent.setup();
        const courseService = { listCourses: vi.fn().mockResolvedValue(TEST_COURSES) };
        const ctx = renderManagement({ courseService, lessons: [createLesson()] });
        await screen.findByRole('table');
        await screen.findByRole('option', { name: 'CD — Ciência de Dados' });
        await user.selectOptions(screen.getByLabelText('Curso'), COURSE_IDS.CD);
        expect(screen.getByText('Qualidade de Software')).toBeTruthy();
        expect(courseService.listCourses).toHaveBeenCalledExactlyOnceWith({});
        expect(ctx.lessonService.listLessons).toHaveBeenCalledOnce();
        expect(ctx.monthlyMaterialService.listMonthlyMaterials).toHaveBeenCalledOnce();
    });

    test('curso desativado continua no filtro e mantém acesso aos materiais históricos', async () => {
        const user = userEvent.setup();
        renderManagement({ lessons: [createLesson({ course: 'RC' })], materials: [createMonthlyMaterial()] });
        await screen.findByRole('table');
        expect(screen.getByRole('option', { name: /RC — Redes de Computadores.*desativado/ })).toBeTruthy();
        await user.selectOptions(screen.getByLabelText('Curso'), COURSE_IDS.RC);
        expect(screen.getByRole('link', { name: 'Abrir PA' }).getAttribute('href'))
            .toBe('https://example.com/pa-mensal');
        expect(screen.getByRole('link', { name: 'Abrir GD+AD' }).getAttribute('href'))
            .toBe('https://example.com/gd-ad-mensal');
    });

    test('nome e sigla atualizados no catálogo não rompem a seleção pelo vínculo salvo', async () => {
        const user = userEvent.setup();
        const renamed = TEST_COURSES.map((course) => course.id === COURSE_IDS.CD
            ? { ...course, code: 'AD', name: 'Análise de Dados' } : course);
        renderManagement({ lessons: [createLesson()],
            courseService: { listCourses: vi.fn().mockResolvedValue(renamed) } });
        await screen.findByRole('option', { name: 'AD — Análise de Dados' });
        await user.selectOptions(screen.getByLabelText('Curso'), COURSE_IDS.CD);
        expect(screen.getByText('Qualidade de Software')).toBeTruthy();
    });

    test('falha do catálogo permite nova tentativa sem ocultar dados nem reler aulas e materiais', async () => {
        const user = userEvent.setup();
        const courseService = { listCourses: vi.fn().mockRejectedValueOnce(new Error('detalhe privado'))
            .mockResolvedValueOnce(TEST_COURSES) };
        const ctx = renderManagement({ lessons: [createLesson()], courseService });
        await screen.findByRole('table');
        const retry = await screen.findByRole('button', { name: 'Tentar carregar cursos novamente' });
        expect(screen.getByRole('alert').textContent).not.toContain('detalhe privado');
        await user.click(retry);
        await screen.findByRole('option', { name: 'CD — Ciência de Dados' });
        expect(courseService.listCourses).toHaveBeenCalledTimes(2);
        expect(ctx.lessonService.listLessons).toHaveBeenCalledOnce();
        expect(ctx.monthlyMaterialService.listMonthlyMaterials).toHaveBeenCalledOnce();
    });

    test('atualização dos materiais preserva o curso selecionado e não repete o catálogo', async () => {
        const user = userEvent.setup();
        const courseService = { listCourses: vi.fn().mockResolvedValue(TEST_COURSES) };
        const clock = () => '2026-09-18';
        const ctx = renderManagement({ lessons: [createLesson()], courseService, todayProvider: clock });
        await screen.findByRole('table');
        await user.selectOptions(screen.getByLabelText('Curso'), COURSE_IDS.CD);
        ctx.view.rerender(<LessonMaterialManagement lessonService={ctx.lessonService}
            monthlyMaterialService={ctx.monthlyMaterialService} courseService={courseService}
            todayProvider={clock} refreshKey={1} />);
        await waitFor(() => expect(ctx.lessonService.listLessons).toHaveBeenCalledTimes(2));
        expect(screen.getByLabelText('Curso').value).toBe(COURSE_IDS.CD);
        expect(courseService.listCourses).toHaveBeenCalledOnce();
        expect(ctx.monthlyMaterialService.listMonthlyMaterials).toHaveBeenCalledTimes(2);
    });

    test('lista inválida de aulas gera falha sem apresentar falso estado vazio', async () => {
        renderManagement({ lessonService: { listLessons: vi.fn().mockResolvedValue(null) } });
        expect(await screen.findByRole('alert')).toBeTruthy();
        expect(screen.queryByText(LESSON_MATERIAL_MANAGEMENT_MESSAGES.EMPTY)).toBeNull();
    });
});
