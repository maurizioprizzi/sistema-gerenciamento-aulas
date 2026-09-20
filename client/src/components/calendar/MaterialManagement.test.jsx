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

function renderManagement(overrides = {}) {
    const lessonService = overrides.lessonService
        ?? createLessonService();
    const monthlyMaterialService = overrides.monthlyMaterialService
        ?? createMonthlyMaterialService();
    const confirmDeletion = overrides.confirmDeletion
        ?? vi.fn(() => true);
    const todayProvider = overrides.todayProvider
        ?? (() => '2026-09-20');

    render(
        <MaterialManagement
            lessonService={lessonService}
            monthlyMaterialService={monthlyMaterialService}
            confirmDeletion={confirmDeletion}
            todayProvider={todayProvider}
        />,
    );

    return {
        confirmDeletion,
        lessonService,
        monthlyMaterialService,
        todayProvider,
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
