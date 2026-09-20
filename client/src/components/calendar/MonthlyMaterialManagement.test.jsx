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
    MonthlyMaterialApiError,
} from '../../services/MonthlyMaterialApi.js';
import {
    MONTHLY_MATERIAL_MANAGEMENT_IDS,
    MONTHLY_MATERIAL_MANAGEMENT_MESSAGES,
    MONTH_NAMES,
    MonthlyMaterialManagement,
    defaultMaterialsChangedHandler,
    formatCalendarMonth,
    mergeSavedMonthlyMaterial,
} from './MonthlyMaterialManagement.jsx';

afterEach(() => {
    cleanup();
});

function createMaterial(overrides = {}) {
    return Object.freeze({
        id: 'monthly-material-123',
        month: '2026-09',
        lessonPlanUrl: 'https://example.com/pa-setembro',
        studentGuideUrl: 'https://example.com/gd-ad-setembro',
        ...overrides,
    });
}

function createService(overrides = {}) {
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
    const monthlyMaterialService = overrides.monthlyMaterialService
        ?? createService();
    const confirmDeletion = overrides.confirmDeletion ?? vi.fn(() => true);
    const onMaterialsChanged = overrides.onMaterialsChanged ?? vi.fn();

    const rendered = render(
        <MonthlyMaterialManagement
            monthlyMaterialService={monthlyMaterialService}
            confirmDeletion={confirmDeletion}
            onMaterialsChanged={onMaterialsChanged}
        />,
    );

    return {
        ...rendered,
        monthlyMaterialService,
        confirmDeletion,
        onMaterialsChanged,
    };
}

function createDeferredPromise() {
    let resolve;
    let reject;
    const promise = new Promise((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
    });

    return { promise, resolve, reject };
}

describe('configuração do gerenciamento mensal', () => {
    test('expõe contratos estáveis e formata os meses originais', () => {
        expect(MONTHLY_MATERIAL_MANAGEMENT_IDS).toEqual({
            TITLE: 'monthly-material-management-title',
            RESULTS: 'monthly-material-management-results',
            ERROR: 'monthly-material-management-error',
        });
        expect(MONTH_NAMES).toHaveLength(12);
        expect(formatCalendarMonth('2026-01')).toBe('Janeiro 2026');
        expect(formatCalendarMonth('2026-12')).toBe('Dezembro 2026');
        expect(defaultMaterialsChangedHandler()).toBeUndefined();

        for (const contract of [
            MONTHLY_MATERIAL_MANAGEMENT_IDS,
            MONTHLY_MATERIAL_MANAGEMENT_MESSAGES,
            MONTH_NAMES,
        ]) {
            expect(Object.isFrozen(contract)).toBe(true);
        }
    });

    test('rejeita meses, serviços e confirmações inválidos', () => {
        expect(() => formatCalendarMonth('2026-13')).toThrowError(
            MONTHLY_MATERIAL_MANAGEMENT_MESSAGES.INVALID_MONTH,
        );

        for (const monthlyMaterialService of [
            null,
            {},
            [],
            { listMonthlyMaterials() {} },
            {
                listMonthlyMaterials() {},
                saveMonthlyMaterial() {},
            },
        ]) {
            expect(() => render(
                <MonthlyMaterialManagement
                    monthlyMaterialService={monthlyMaterialService}
                />,
            )).toThrowError(
                MONTHLY_MATERIAL_MANAGEMENT_MESSAGES
                    .INVALID_MATERIAL_SERVICE,
            );
            cleanup();
        }

        expect(() => render(
            <MonthlyMaterialManagement
                monthlyMaterialService={createService()}
                confirmDeletion={null}
            />,
        )).toThrowError(
            MONTHLY_MATERIAL_MANAGEMENT_MESSAGES
                .INVALID_CONFIRMATION,
        );

        expect(() => render(
            <MonthlyMaterialManagement
                monthlyMaterialService={createService()}
                onMaterialsChanged="changed"
            />,
        )).toThrowError(
            MONTHLY_MATERIAL_MANAGEMENT_MESSAGES
                .INVALID_CHANGED_HANDLER,
        );
    });

    test('substitui o mesmo mês e preserva a ordem decrescente', () => {
        const currentMaterials = Object.freeze([
            createMaterial({ id: 'october', month: '2026-10' }),
            createMaterial({ id: 'september' }),
        ]);
        const savedMaterial = createMaterial({
            id: 'september-updated',
            lessonPlanUrl: null,
        });

        const result = mergeSavedMonthlyMaterial(
            currentMaterials,
            savedMaterial,
        );

        expect(result.map((material) => material.id)).toEqual([
            'october',
            'september-updated',
        ]);
        expect(Object.isFrozen(result)).toBe(true);
    });
});

describe('consulta e apresentação dos materiais mensais', () => {
    test('consulta ao montar e apresenta o estado vazio', async () => {
        const { monthlyMaterialService } = renderManagement();

        expect(screen.getByText(
            MONTHLY_MATERIAL_MANAGEMENT_MESSAGES.LOADING,
        )).toBeTruthy();
        expect(await screen.findByText(
            MONTHLY_MATERIAL_MANAGEMENT_MESSAGES.EMPTY,
        )).toBeTruthy();
        expect(
            monthlyMaterialService.listMonthlyMaterials,
        ).toHaveBeenCalledTimes(1);
    });

    test('apresenta mês, links públicos e ausências', async () => {
        const materials = Object.freeze([
            createMaterial(),
            createMaterial({
                id: 'monthly-material-august',
                month: '2026-08',
                lessonPlanUrl: null,
                studentGuideUrl: null,
            }),
        ]);

        renderManagement({
            monthlyMaterialService: createService({
                listMonthlyMaterials: vi.fn().mockResolvedValue(
                    materials,
                ),
            }),
        });

        const table = await screen.findByRole('table', {
            name: 'Materiais mensais cadastrados',
        });

        expect(within(table).getByText('Setembro 2026')).toBeTruthy();
        expect(within(table).getByText('Agosto 2026')).toBeTruthy();
        expect(within(table).getByRole('link', {
            name: 'Abrir PA',
        }).getAttribute('href')).toBe(
            'https://example.com/pa-setembro',
        );
        expect(within(table).getAllByText('—')).toHaveLength(2);
    });

    test('apresenta erro público e permite repetir a consulta', async () => {
        const publicMessage = 'A sessão administrativa expirou.';
        const listMonthlyMaterials = vi.fn()
            .mockRejectedValueOnce(
                new MonthlyMaterialApiError(publicMessage, {
                    statusCode: 401,
                    code: 'AUTHENTICATION_REQUIRED',
                }),
            )
            .mockResolvedValueOnce(Object.freeze([]));
        const user = userEvent.setup();

        renderManagement({
            monthlyMaterialService: createService({
                listMonthlyMaterials,
            }),
        });

        expect((await screen.findByRole('alert')).textContent)
            .toContain(publicMessage);
        await user.click(screen.getByRole('button', {
            name: 'Tentar novamente',
        }));

        expect(await screen.findByText(
            MONTHLY_MATERIAL_MANAGEMENT_MESSAGES.EMPTY,
        )).toBeTruthy();
        expect(listMonthlyMaterials).toHaveBeenCalledTimes(2);
    });

    test('oculta detalhes de uma falha inesperada', async () => {
        const internalMessage = 'MongoDB em endereço interno indisponível.';

        renderManagement({
            monthlyMaterialService: createService({
                listMonthlyMaterials: vi.fn().mockRejectedValue(
                    new Error(internalMessage),
                ),
            }),
        });

        const alert = await screen.findByRole('alert');

        expect(alert.textContent).toContain(
            MONTHLY_MATERIAL_MANAGEMENT_MESSAGES
                .UNEXPECTED_LIST_ERROR,
        );
        expect(alert.textContent).not.toContain(internalMessage);
    });
});

describe('formulário dentro do gerenciamento mensal', () => {
    test('abre e cancela o formulário sem gravar', async () => {
        const user = userEvent.setup();
        const { monthlyMaterialService } = renderManagement();

        await screen.findByText(
            MONTHLY_MATERIAL_MANAGEMENT_MESSAGES.EMPTY,
        );
        await user.click(screen.getByRole('button', {
            name: 'Adicionar link mensal',
        }));
        expect(screen.getByRole('dialog')).toBeTruthy();

        await user.click(screen.getByRole('button', {
            name: 'Cancelar',
        }));

        expect(screen.queryByRole('dialog')).toBeNull();
        expect(
            monthlyMaterialService.saveMonthlyMaterial,
        ).not.toHaveBeenCalled();
    });

    test('insere o estado salvo, fecha o formulário e mantém a ordem', async () => {
        const user = userEvent.setup();
        const savedMaterial = createMaterial({
            id: 'monthly-material-october',
            month: '2026-10',
        });
        const monthlyMaterialService = createService({
            listMonthlyMaterials: vi.fn().mockResolvedValue(
                Object.freeze([createMaterial()]),
            ),
            saveMonthlyMaterial: vi.fn().mockResolvedValue(
                savedMaterial,
            ),
        });

        const onMaterialsChanged = vi.fn();

        renderManagement({
            monthlyMaterialService,
            onMaterialsChanged,
        });
        await screen.findByText('Setembro 2026');
        await user.click(screen.getByRole('button', {
            name: 'Adicionar link mensal',
        }));
        await user.type(screen.getByLabelText('Mês'), '2026-10');
        await user.click(screen.getByRole('button', {
            name: 'Salvar materiais',
        }));

        await waitFor(() => {
            expect(screen.queryByRole('dialog')).toBeNull();
        });
        const rows = screen.getAllByRole('row');

        expect(rows[1].textContent).toContain('Outubro 2026');
        expect(rows[2].textContent).toContain('Setembro 2026');
        expect(onMaterialsChanged).toHaveBeenCalledTimes(1);
        expect(onMaterialsChanged).toHaveBeenCalledWith();
    });

    test('ignora uma consulta antiga concluída depois da gravação', async () => {
        const user = userEvent.setup();
        const deferredList = createDeferredPromise();
        const savedMaterial = createMaterial({ month: '2026-10' });
        const monthlyMaterialService = createService({
            listMonthlyMaterials: vi.fn().mockReturnValue(
                deferredList.promise,
            ),
            saveMonthlyMaterial: vi.fn().mockResolvedValue(
                savedMaterial,
            ),
        });

        const onMaterialsChanged = vi.fn();

        renderManagement({
            monthlyMaterialService,
            onMaterialsChanged,
        });
        await user.click(screen.getByRole('button', {
            name: 'Adicionar link mensal',
        }));
        await user.type(screen.getByLabelText('Mês'), '2026-10');
        await user.click(screen.getByRole('button', {
            name: 'Salvar materiais',
        }));
        expect(await screen.findByText('Outubro 2026')).toBeTruthy();

        deferredList.resolve(Object.freeze([createMaterial()]));

        await waitFor(() => {
            expect(screen.getByText('Outubro 2026')).toBeTruthy();
        });
        expect(screen.queryByText('Setembro 2026')).toBeNull();
    });
});

describe('exclusão dos materiais mensais', () => {
    test('preserva o material quando a confirmação é recusada', async () => {
        const user = userEvent.setup();
        const confirmDeletion = vi.fn(() => false);
        const monthlyMaterialService = createService({
            listMonthlyMaterials: vi.fn().mockResolvedValue(
                Object.freeze([createMaterial()]),
            ),
        });

        renderManagement({
            monthlyMaterialService,
            confirmDeletion,
        });
        await screen.findByText('Setembro 2026');
        await user.click(screen.getByRole('button', {
            name: 'Excluir',
        }));

        expect(confirmDeletion).toHaveBeenCalledTimes(1);
        expect(
            monthlyMaterialService.deleteMonthlyMaterial,
        ).not.toHaveBeenCalled();
        expect(screen.getByText('Setembro 2026')).toBeTruthy();
    });

    test('exclui o mês confirmado e apresenta o estado vazio', async () => {
        const user = userEvent.setup();
        const onMaterialsChanged = vi.fn();
        const monthlyMaterialService = createService({
            listMonthlyMaterials: vi.fn().mockResolvedValue(
                Object.freeze([createMaterial()]),
            ),
        });

        renderManagement({
            monthlyMaterialService,
            onMaterialsChanged,
        });
        await screen.findByText('Setembro 2026');
        await user.click(screen.getByRole('button', {
            name: 'Excluir',
        }));

        expect(await screen.findByText(
            MONTHLY_MATERIAL_MANAGEMENT_MESSAGES.EMPTY,
        )).toBeTruthy();
        expect(
            monthlyMaterialService.deleteMonthlyMaterial,
        ).toHaveBeenCalledWith('2026-09');
        expect(onMaterialsChanged).toHaveBeenCalledTimes(1);
        expect(onMaterialsChanged).toHaveBeenCalledWith();
    });

    test('mantém o material e oculta uma falha inesperada', async () => {
        const user = userEvent.setup();
        const internalMessage = 'Falha interna com dados do banco.';
        const monthlyMaterialService = createService({
            listMonthlyMaterials: vi.fn().mockResolvedValue(
                Object.freeze([createMaterial()]),
            ),
            deleteMonthlyMaterial: vi.fn().mockRejectedValue(
                new Error(internalMessage),
            ),
        });

        renderManagement({ monthlyMaterialService });
        await screen.findByText('Setembro 2026');
        await user.click(screen.getByRole('button', {
            name: 'Excluir',
        }));

        const alert = await screen.findByRole('alert');

        expect(alert.textContent).toContain(
            MONTHLY_MATERIAL_MANAGEMENT_MESSAGES
                .UNEXPECTED_DELETE_ERROR,
        );
        expect(alert.textContent).not.toContain(internalMessage);
        expect(screen.getByText('Setembro 2026')).toBeTruthy();
    });
});
