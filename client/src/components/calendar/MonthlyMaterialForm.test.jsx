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
    MonthlyMaterialApiError,
} from '../../services/MonthlyMaterialApi.js';
import {
    INITIAL_MONTHLY_MATERIAL_FORM_DATA,
    MONTHLY_MATERIAL_FORM_IDS,
    MONTHLY_MATERIAL_FORM_MESSAGES,
    MonthlyMaterialForm,
    createInitialMonthlyMaterialFormData,
} from './MonthlyMaterialForm.jsx';

afterEach(() => {
    cleanup();
});

/**
 * Cria a representação pública confirmada pela API.
 *
 * @returns {Readonly<object>} Material mensal controlado.
 */
function createSavedMaterial() {
    return Object.freeze({
        id: 'monthly-material-123',
        month: '2026-09',
        lessonPlanUrl: 'https://example.com/pa-setembro',
        studentGuideUrl: 'https://example.com/gd-ad-setembro',
    });
}

/**
 * Monta o formulário com dependências válidas e substituíveis.
 *
 * @param {object} overrides Dependências específicas do cenário.
 * @returns {object} Funções observáveis utilizadas pelo componente.
 */
function renderMonthlyMaterialForm(overrides = {}) {
    const monthlyMaterialService = overrides.monthlyMaterialService
        ?? {
            saveMonthlyMaterial: vi.fn().mockResolvedValue(
                createSavedMaterial(),
            ),
        };
    const onMaterialSaved = overrides.onMaterialSaved ?? vi.fn();
    const onCancel = overrides.onCancel ?? vi.fn();

    render(
        <MonthlyMaterialForm
            monthlyMaterialService={monthlyMaterialService}
            onMaterialSaved={onMaterialSaved}
            onCancel={onCancel}
        />,
    );

    return {
        monthlyMaterialService,
        onMaterialSaved,
        onCancel,
    };
}

/**
 * Preenche os três controles do formulário.
 *
 * @param {ReturnType<typeof userEvent.setup>} user Usuário simulado.
 * @returns {Promise<void>}
 */
async function fillForm(user) {
    await user.type(screen.getByLabelText('Mês'), '2026-09');
    await user.type(
        screen.getByLabelText('Link do Plano de Aula'),
        'https://example.com/pa-setembro',
    );
    await user.type(
        screen.getByLabelText('Link do Guia e das Atividades'),
        'https://example.com/gd-ad-setembro',
    );
}

describe('configuração do formulário mensal', () => {
    test('expõe contratos estáveis e protegidos', () => {
        expect(MONTHLY_MATERIAL_FORM_IDS).toEqual({
            TITLE: 'monthly-material-form-title',
            ERROR: 'monthly-material-form-error',
        });
        expect(INITIAL_MONTHLY_MATERIAL_FORM_DATA).toEqual({
            month: '',
            lessonPlanUrl: '',
            studentGuideUrl: '',
        });

        for (const contract of [
            MONTHLY_MATERIAL_FORM_IDS,
            MONTHLY_MATERIAL_FORM_MESSAGES,
            INITIAL_MONTHLY_MATERIAL_FORM_DATA,
        ]) {
            expect(Object.isFrozen(contract)).toBe(true);
        }

        const first = createInitialMonthlyMaterialFormData();
        const second = createInitialMonthlyMaterialFormData();

        expect(first).toEqual(INITIAL_MONTHLY_MATERIAL_FORM_DATA);
        expect(first).not.toBe(second);
    });

    test('rejeita serviços de gravação inválidos', () => {
        for (const monthlyMaterialService of [
            null,
            'materiais',
            42,
            {},
            [],
            { saveMonthlyMaterial: true },
        ]) {
            expect(() => render(
                <MonthlyMaterialForm
                    monthlyMaterialService={monthlyMaterialService}
                    onMaterialSaved={() => {}}
                    onCancel={() => {}}
                />,
            )).toThrowError(
                MONTHLY_MATERIAL_FORM_MESSAGES
                    .INVALID_MATERIAL_SERVICE,
            );

            cleanup();
        }
    });

    test('rejeita callbacks obrigatórios inválidos', () => {
        const monthlyMaterialService = {
            saveMonthlyMaterial() {},
        };

        expect(() => render(
            <MonthlyMaterialForm
                monthlyMaterialService={monthlyMaterialService}
                onMaterialSaved={null}
                onCancel={() => {}}
            />,
        )).toThrowError(
            MONTHLY_MATERIAL_FORM_MESSAGES.INVALID_SAVED_HANDLER,
        );

        cleanup();

        expect(() => render(
            <MonthlyMaterialForm
                monthlyMaterialService={monthlyMaterialService}
                onMaterialSaved={() => {}}
                onCancel={null}
            />,
        )).toThrowError(
            MONTHLY_MATERIAL_FORM_MESSAGES.INVALID_CANCEL_HANDLER,
        );
    });
});

describe('estrutura do formulário mensal', () => {
    test('apresenta os três campos do modal original', () => {
        renderMonthlyMaterialForm();

        expect(screen.getByRole('heading', {
            level: 3,
            name: 'Adicionar materiais do mês',
        })).toBeTruthy();
        expect(screen.getByLabelText('Mês').required).toBe(true);
        expect(
            screen.getByLabelText('Link do Plano de Aula').required,
        ).toBe(false);
        expect(
            screen.getByLabelText(
                'Link do Guia e das Atividades',
            ).required,
        ).toBe(false);
        expect(screen.getByRole('button', {
            name: 'Cancelar',
        }).type).toBe('button');
        expect(screen.getByRole('button', {
            name: 'Salvar materiais',
        }).type).toBe('submit');
    });
});

describe('gravação pelo formulário mensal', () => {
    test('envia mês e links e confirma o material salvo', async () => {
        const user = userEvent.setup();
        const {
            monthlyMaterialService,
            onMaterialSaved,
        } = renderMonthlyMaterialForm();

        await fillForm(user);
        await user.click(screen.getByRole('button', {
            name: 'Salvar materiais',
        }));

        await waitFor(() => {
            expect(
                monthlyMaterialService.saveMonthlyMaterial,
            ).toHaveBeenCalledWith(
                '2026-09',
                {
                    lessonPlanUrl:
                        'https://example.com/pa-setembro',
                    studentGuideUrl:
                        'https://example.com/gd-ad-setembro',
                },
            );
        });
        expect(onMaterialSaved).toHaveBeenCalledWith(
            createSavedMaterial(),
        );
    });

    test('envia os dois links vazios para normalização pela API', async () => {
        const user = userEvent.setup();
        const { monthlyMaterialService } =
            renderMonthlyMaterialForm();

        await user.type(screen.getByLabelText('Mês'), '2026-09');
        await user.click(screen.getByRole('button', {
            name: 'Salvar materiais',
        }));

        await waitFor(() => {
            expect(
                monthlyMaterialService.saveMonthlyMaterial,
            ).toHaveBeenCalledWith(
                '2026-09',
                {
                    lessonPlanUrl: '',
                    studentGuideUrl: '',
                },
            );
        });
    });

    test('comunica o cancelamento sem realizar gravação', async () => {
        const user = userEvent.setup();
        const {
            monthlyMaterialService,
            onCancel,
        } = renderMonthlyMaterialForm();

        await user.click(screen.getByRole('button', {
            name: 'Cancelar',
        }));

        expect(onCancel).toHaveBeenCalledTimes(1);
        expect(
            monthlyMaterialService.saveMonthlyMaterial,
        ).not.toHaveBeenCalled();
    });

    test('mantém os campos durante uma recusa conhecida', async () => {
        const user = userEvent.setup();
        const publicMessage = 'Os links informados são inválidos.';
        const monthlyMaterialService = {
            saveMonthlyMaterial: vi.fn().mockRejectedValue(
                new MonthlyMaterialApiError(publicMessage, {
                    statusCode: 400,
                    code: 'INVALID_MONTHLY_MATERIAL_DATA',
                }),
            ),
        };

        renderMonthlyMaterialForm({ monthlyMaterialService });
        await fillForm(user);
        await user.click(screen.getByRole('button', {
            name: 'Salvar materiais',
        }));

        expect((await screen.findByRole('alert')).textContent).toBe(
            publicMessage,
        );
        expect(screen.getByLabelText('Mês').value).toBe('2026-09');
        expect(screen.getByLabelText('Link do Plano de Aula').value)
            .toBe('https://example.com/pa-setembro');
    });

    test('oculta detalhes de uma falha inesperada', async () => {
        const user = userEvent.setup();
        const internalMessage = 'MongoDB indisponível em host interno.';
        const monthlyMaterialService = {
            saveMonthlyMaterial: vi.fn().mockRejectedValue(
                new Error(internalMessage),
            ),
        };

        renderMonthlyMaterialForm({ monthlyMaterialService });
        await user.type(screen.getByLabelText('Mês'), '2026-09');
        await user.click(screen.getByRole('button', {
            name: 'Salvar materiais',
        }));

        const alert = await screen.findByRole('alert');

        expect(alert.textContent).toBe(
            MONTHLY_MATERIAL_FORM_MESSAGES.UNEXPECTED_ERROR,
        );
        expect(alert.textContent).not.toContain(internalMessage);
    });

    test('bloqueia todos os controles durante o envio', async () => {
        const user = userEvent.setup();
        let resolveSave;
        const pendingSave = new Promise((resolve) => {
            resolveSave = resolve;
        });
        const monthlyMaterialService = {
            saveMonthlyMaterial: vi.fn().mockReturnValue(pendingSave),
        };

        renderMonthlyMaterialForm({ monthlyMaterialService });
        await fillForm(user);
        await user.click(screen.getByRole('button', {
            name: 'Salvar materiais',
        }));

        const form = screen.getByRole('form', {
            name: 'Materiais do mês',
        });

        for (const control of form.elements) {
            expect(control.disabled).toBe(true);
        }
        expect(screen.getByRole('button', {
            name: 'Salvando...',
        })).toBeTruthy();

        resolveSave(createSavedMaterial());

        await waitFor(() => {
            expect(screen.getByRole('button', {
                name: 'Salvar materiais',
            }).disabled).toBe(false);
        });
    });

    test('remove a mensagem anterior quando um campo é alterado', async () => {
        const user = userEvent.setup();
        const monthlyMaterialService = {
            saveMonthlyMaterial: vi.fn().mockRejectedValue(
                new Error('Falha controlada.'),
            ),
        };

        renderMonthlyMaterialForm({ monthlyMaterialService });
        await user.type(screen.getByLabelText('Mês'), '2026-09');
        await user.click(screen.getByRole('button', {
            name: 'Salvar materiais',
        }));

        expect(await screen.findByRole('alert')).toBeTruthy();
        await user.type(
            screen.getByLabelText('Link do Plano de Aula'),
            'https://example.com/pa',
        );

        expect(screen.queryByRole('alert')).toBeNull();
    });
});
