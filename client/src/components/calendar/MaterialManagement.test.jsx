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

import {
    MATERIAL_MANAGEMENT_IDS,
    MATERIAL_MANAGEMENT_MESSAGES,
    MaterialManagement,
} from './MaterialManagement.jsx';

afterEach(() => {
    cleanup();
});

function createMaterial(overrides = {}) {
    return Object.freeze({
        id: 'material-1',
        month: '2026-09',
        lessonPlanUrl: 'https://example.com/pa-setembro',
        studentGuideUrl: 'https://example.com/gd-ad-setembro',
        ...overrides,
    });
}

function createLessonService(overrides = {}) {
    return {
        listLessons: vi.fn().mockResolvedValue(Object.freeze([])),
        ...overrides,
    };
}

function createMonthlyMaterialService(overrides = {}) {
    return {
        listMonthlyMaterials: vi.fn().mockResolvedValue(
            Object.freeze([]),
        ),
        saveMonthlyMaterial: vi.fn().mockResolvedValue(
            createMaterial(),
        ),
        deleteMonthlyMaterial: vi.fn().mockResolvedValue(undefined),
        ...overrides,
    };
}

function createCourseService() {
    return { listCourses: vi.fn().mockResolvedValue([]) };
}

function renderManagement(overrides = {}) {
    const lessonService = overrides.lessonService
        ?? createLessonService();
    const monthlyMaterialService = overrides.monthlyMaterialService
        ?? createMonthlyMaterialService();
    const confirmDeletion = overrides.confirmDeletion
        ?? vi.fn(() => true);
    const todayProvider = overrides.todayProvider
        ?? (() => '2026-09-20');
    const courseService = overrides.courseService ?? createCourseService();

    render(
        <MaterialManagement
            lessonService={lessonService}
            monthlyMaterialService={monthlyMaterialService}
            courseService={courseService}
            confirmDeletion={confirmDeletion}
            todayProvider={todayProvider}
        />,
    );

    return {
        confirmDeletion,
        lessonService,
        monthlyMaterialService,
        todayProvider,
        courseService,
    };
}

describe('configuração da área de materiais', () => {
    test('expõe contratos estáveis e protegidos', () => {
        expect(MATERIAL_MANAGEMENT_IDS).toEqual({
            TITLE: 'material-management-title',
        });
        expect(Object.isFrozen(MATERIAL_MANAGEMENT_IDS)).toBe(true);
        expect(Object.isFrozen(MATERIAL_MANAGEMENT_MESSAGES)).toBe(
            true,
        );
    });

    test('rejeita dependências inválidas antes de montar as seções', () => {
        const lessonService = createLessonService();
        const monthlyMaterialService = createMonthlyMaterialService();

        for (const invalidLessonService of [null, [], {}, {
            listLessons: true,
        }]) {
            expect(() => render(
                <MaterialManagement
                    lessonService={invalidLessonService}
                    monthlyMaterialService={monthlyMaterialService}
                />,
            )).toThrowError(
                MATERIAL_MANAGEMENT_MESSAGES.INVALID_LESSON_SERVICE,
            );
            cleanup();
        }

        for (const invalidMonthlyService of [
            null,
            [],
            {},
            { listMonthlyMaterials() {} },
            {
                listMonthlyMaterials() {},
                saveMonthlyMaterial() {},
            },
        ]) {
            expect(() => render(
                <MaterialManagement
                    lessonService={lessonService}
                    monthlyMaterialService={invalidMonthlyService}
                />,
            )).toThrowError(
                MATERIAL_MANAGEMENT_MESSAGES
                    .INVALID_MONTHLY_MATERIAL_SERVICE,
            );
            cleanup();
        }

        expect(() => render(
            <MaterialManagement
                lessonService={lessonService}
                monthlyMaterialService={monthlyMaterialService}
                confirmDeletion={false}
            />,
        )).toThrowError(
            MATERIAL_MANAGEMENT_MESSAGES.INVALID_CONFIRMATION,
        );
        cleanup();

        expect(() => render(
            <MaterialManagement
                lessonService={lessonService}
                monthlyMaterialService={monthlyMaterialService}
                todayProvider="2026-09-20"
            />,
        )).toThrowError(
            MATERIAL_MANAGEMENT_MESSAGES.INVALID_TODAY_PROVIDER,
        );
    });
});

describe('composição das formas de organização', () => {
    test('apresenta a introdução e as duas seções originais', async () => {
        const { lessonService, monthlyMaterialService } =
            renderManagement();

        expect(screen.getByRole('heading', {
            level: 2,
            name: 'Links de Materiais',
        })).toBeTruthy();
        expect(screen.getByText(/Plano de Aula \(PA\)/)).toBeTruthy();
        expect(screen.getByRole('heading', {
            level: 2,
            name: 'Por aula (data específica)',
        })).toBeTruthy();
        expect(screen.getByRole('heading', {
            level: 2,
            name: 'Materiais por mês',
        })).toBeTruthy();

        await waitFor(() => {
            expect(lessonService.listLessons).toHaveBeenCalledTimes(1);
            expect(
                monthlyMaterialService.listMonthlyMaterials,
            ).toHaveBeenCalledTimes(2);
        });
    });

    test('atualiza a herança por aula depois de salvar um mês', async () => {
        const user = userEvent.setup();
        const lessonService = createLessonService();
        const monthlyMaterialService = createMonthlyMaterialService({
            saveMonthlyMaterial: vi.fn().mockResolvedValue(
                createMaterial({ month: '2026-10' }),
            ),
        });

        renderManagement({
            lessonService,
            monthlyMaterialService,
        });

        await waitFor(() => {
            expect(lessonService.listLessons).toHaveBeenCalledTimes(1);
            expect(
                monthlyMaterialService.listMonthlyMaterials,
            ).toHaveBeenCalledTimes(2);
        });

        await user.click(screen.getByRole('button', {
            name: 'Adicionar link mensal',
        }));
        const dialog = screen.getByRole('dialog');

        await user.type(
            within(dialog).getByLabelText('Mês'),
            '2026-10',
        );
        await user.click(screen.getByRole('button', {
            name: 'Salvar materiais',
        }));

        expect(await screen.findByText('Outubro 2026')).toBeTruthy();
        await waitFor(() => {
            expect(lessonService.listLessons).toHaveBeenCalledTimes(2);
            expect(
                monthlyMaterialService.listMonthlyMaterials,
            ).toHaveBeenCalledTimes(3);
        });
    });
});


describe('catálogo na composição da área de materiais', () => {
    const courseId = '507f1f77bcf86cd7994390ab';
    const course = { id: courseId, name: 'Ciência de Dados', code: 'CD', active: true };
    function linkedLesson() {
        return { id: '507f1f77bcf86cd799439011', courseId, course: 'CD', date: '2026-10-25',
            curricularUnit: 'Introdução aos dados', type: 'Aula', lessonNumber: null,
            needsReview: false, lessonPlanUrl: null, studentGuideUrl: null };
    }

    test('recusa serviço de cursos inválido antes de montar as consultas', () => {
        const lessonService = createLessonService();
        const monthlyMaterialService = createMonthlyMaterialService();
        for (const courseService of [null, {}, [], { listCourses: true }]) {
            expect(() => render(<MaterialManagement lessonService={lessonService}
                monthlyMaterialService={monthlyMaterialService} courseService={courseService} />))
                .toThrowError(MATERIAL_MANAGEMENT_MESSAGES.INVALID_COURSE_SERVICE);
            cleanup();
        }
        expect(lessonService.listLessons).not.toHaveBeenCalled();
        expect(monthlyMaterialService.listMonthlyMaterials).not.toHaveBeenCalled();
    });

    test('filtro usa somente o serviço de cursos recebido na composição', async () => {
        const user = userEvent.setup();
        const courseService = { listCourses: vi.fn().mockResolvedValue([course]) };
        const lessonService = createLessonService({ listLessons: vi.fn().mockResolvedValue([linkedLesson()]) });
        renderManagement({ courseService, lessonService });
        await screen.findByRole('option', { name: 'CD — Ciência de Dados' });
        await user.selectOptions(screen.getByLabelText('Curso'), courseId);
        expect(await screen.findByText('Introdução aos dados')).toBeTruthy();
        expect(courseService.listCourses).toHaveBeenCalledExactlyOnceWith({});
        expect(lessonService.listLessons).toHaveBeenCalledOnce();
    });

    test('gravar material mensal atualiza os links herdados sem perder o filtro ou reler o catálogo', async () => {
        const user = userEvent.setup();
        const records = [];
        const courseService = { listCourses: vi.fn().mockResolvedValue([course]) };
        const lessonService = createLessonService({ listLessons: vi.fn().mockResolvedValue([linkedLesson()]) });
        const monthlyMaterialService = createMonthlyMaterialService({
            listMonthlyMaterials: vi.fn(async () => [...records]),
            saveMonthlyMaterial: vi.fn(async (month, input) => {
                const material = createMaterial({ month,
                    lessonPlanUrl: input.lessonPlanUrl || null, studentGuideUrl: input.studentGuideUrl || null });
                records.push(material);
                return material;
            }),
        });
        renderManagement({ courseService, lessonService, monthlyMaterialService });
        await screen.findByRole('option', { name: 'CD — Ciência de Dados' });
        await screen.findByRole('table', { name: 'Materiais aplicáveis a cada aula' });
        await user.selectOptions(screen.getByLabelText('Curso'), courseId);
        await user.click(screen.getByRole('button', { name: 'Adicionar link mensal' }));
        const dialog = screen.getByRole('dialog');
        await user.type(within(dialog).getByLabelText('Mês'), '2026-10');
        await user.type(within(dialog).getByLabelText('Link do Plano de Aula'), 'https://example.com/plano-outubro');
        await user.click(screen.getByRole('button', { name: 'Salvar materiais' }));
        await waitFor(() => {
            const table = screen.getByRole('table', { name: 'Materiais aplicáveis a cada aula' });
            expect(within(table).getByRole('link', { name: 'Abrir PA' }).getAttribute('href'))
                .toBe('https://example.com/plano-outubro');
        });
        expect(screen.getByLabelText('Curso').value).toBe(courseId);
        expect(courseService.listCourses).toHaveBeenCalledOnce();
        expect(lessonService.listLessons).toHaveBeenCalledTimes(2);
    });
});
