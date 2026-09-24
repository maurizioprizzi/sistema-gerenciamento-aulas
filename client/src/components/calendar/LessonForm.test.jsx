import {
    cleanup,
    fireEvent,
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
    INITIAL_LESSON_FORM_DATA,
    LESSON_FORM_IDS,
    LESSON_FORM_MESSAGES,
    LessonForm,
    createEditingLessonFormData,
    createInitialLessonFormData,
} from './LessonForm.jsx';
import { LessonApiError } from '../../services/LessonApi.js';

afterEach(() => {
    cleanup();
});

/**
 * Cria uma aula pública válida para os cenários de edição.
 *
 * @param {object} overrides Valores específicos do cenário.
 * @returns {Readonly<object>} Aula controlada.
 */
function createEditableLesson(overrides = {}) {
    return Object.freeze({
        id: '64f000000000000000000001',
        date: '2026-09-18',
        course: 'APQSA',
        curricularUnit: 'Qualidade de Software',
        type: 'Aula',
        lessonNumber: '12',
        needsReview: false,
        lessonPlanUrl: 'https://example.com/plano',
        studentGuideUrl: 'https://example.com/guia',
        ...overrides,
    });
}

/**
 * Cria o contrato mínimo utilizado pelo formulário.
 *
 * @param {object} overrides Operações substituídas pelo cenário.
 * @returns {{ createLesson: ReturnType<typeof vi.fn>,
 * updateLesson: ReturnType<typeof vi.fn> }} Serviço controlado.
 */
function createLessonService(overrides = {}) {
    return {
        createLesson: vi.fn().mockResolvedValue(
            Object.freeze({ id: 'lesson-created' }),
        ),
        updateLesson: vi.fn().mockResolvedValue(
            createEditableLesson(),
        ),
        ...overrides,
    };
}

/**
 * Monta o formulário com dependências válidas.
 *
 * @param {object} overrides Dependências específicas do cenário.
 * @returns {{ lessonService: object,
 * onLessonCreated: ReturnType<typeof vi.fn>,
 * onLessonUpdated: ReturnType<typeof vi.fn>,
 * onEditCancelled: ReturnType<typeof vi.fn> }} Dependências utilizadas.
 */
function renderLessonForm(overrides = {}) {
    const lessonService = overrides.lessonService
        ?? createLessonService();
    const lessonToEdit = overrides.lessonToEdit ?? null;
    const onLessonCreated = overrides.onLessonCreated ?? vi.fn();
    const onLessonUpdated = overrides.onLessonUpdated ?? vi.fn();
    const onEditCancelled = overrides.onEditCancelled ?? vi.fn();

    render(
        <LessonForm
            lessonService={lessonService}
            lessonToEdit={lessonToEdit}
            onLessonCreated={onLessonCreated}
            onLessonUpdated={onLessonUpdated}
            onEditCancelled={onEditCancelled}
        />,
    );

    return {
        lessonService,
        onLessonCreated,
        onLessonUpdated,
        onEditCancelled,
    };
}

/**
 * Preenche os três campos obrigatórios.
 *
 * @param {ReturnType<typeof userEvent.setup>} user Usuário simulado.
 * @returns {Promise<void>}
 */
async function fillRequiredFields(user) {
    fireEvent.change(screen.getByLabelText('Data'), {
        target: { value: '2026-09-19' },
    });
    await user.selectOptions(
        screen.getByLabelText('Curso'),
        'APQSA',
    );
    await user.type(
        screen.getByLabelText('Unidade curricular'),
        'Qualidade de Software',
    );
}

describe('configuração do formulário de aulas', () => {
    test('expõe contratos estáveis e protegidos', () => {
        expect(LESSON_FORM_IDS).toEqual({
            TITLE: 'lesson-form-title',
            ERROR: 'lesson-form-error',
            SUCCESS: 'lesson-form-success',
        });
        expect(INITIAL_LESSON_FORM_DATA).toEqual({
            date: '',
            course: '',
            curricularUnit: '',
            type: 'Aula',
            lessonNumber: '',
            needsReview: false,
            lessonPlanUrl: '',
            studentGuideUrl: '',
        });
        expect(Object.isFrozen(LESSON_FORM_IDS)).toBe(true);
        expect(Object.isFrozen(LESSON_FORM_MESSAGES)).toBe(true);
        expect(Object.isFrozen(INITIAL_LESSON_FORM_DATA)).toBe(true);

        const firstCopy = createInitialLessonFormData();
        const secondCopy = createInitialLessonFormData();

        expect(firstCopy).not.toBe(secondCopy);
        expect(firstCopy).toEqual(INITIAL_LESSON_FORM_DATA);
    });

    test('rejeita serviços de criação inválidos', () => {
        const invalidServices = [
            null,
            'lessons',
            42,
            {},
            [],
            { createLesson: true },
        ];

        for (const lessonService of invalidServices) {
            expect(() => render(
                <LessonForm
                    lessonService={lessonService}
                    onLessonCreated={() => {}}
                />,
            )).toThrowError(
                LESSON_FORM_MESSAGES.INVALID_LESSON_SERVICE,
            );

            cleanup();
        }
    });

    test('rejeita serviços sem edição no modo correspondente', () => {
        expect(() => render(
            <LessonForm
                lessonService={{ createLesson() {} }}
                lessonToEdit={createEditableLesson()}
                onLessonCreated={() => {}}
                onLessonUpdated={() => {}}
                onEditCancelled={() => {}}
            />,
        )).toThrowError(
            LESSON_FORM_MESSAGES.INVALID_LESSON_SERVICE,
        );
    });

    test('rejeita confirmações de criação inválidas', () => {
        const invalidHandlers = [
            undefined,
            null,
            'created',
            42,
            {},
        ];

        for (const onLessonCreated of invalidHandlers) {
            expect(() => render(
                <LessonForm
                    lessonService={createLessonService()}
                    onLessonCreated={onLessonCreated}
                />,
            )).toThrowError(
                LESSON_FORM_MESSAGES.INVALID_CREATED_HANDLER,
            );

            cleanup();
        }
    });

    test('rejeita confirmações e cancelamentos de edição inválidos', () => {
        const commonProps = {
            lessonService: createLessonService(),
            lessonToEdit: createEditableLesson(),
            onLessonCreated() {},
        };

        expect(() => render(
            <LessonForm
                {...commonProps}
                onLessonUpdated={null}
                onEditCancelled={() => {}}
            />,
        )).toThrowError(
            LESSON_FORM_MESSAGES.INVALID_UPDATED_HANDLER,
        );
        cleanup();

        expect(() => render(
            <LessonForm
                {...commonProps}
                onLessonUpdated={() => {}}
                onEditCancelled={null}
            />,
        )).toThrowError(
            LESSON_FORM_MESSAGES.INVALID_CANCEL_HANDLER,
        );
    });

    test('rejeita aulas inválidas antes de iniciar a edição', () => {
        expect(() => render(
            <LessonForm
                lessonService={createLessonService()}
                lessonToEdit={{ id: 'invalido' }}
                onLessonCreated={() => {}}
                onLessonUpdated={() => {}}
                onEditCancelled={() => {}}
            />,
        )).toThrowError(
            LESSON_FORM_MESSAGES.INVALID_EDITING_LESSON,
        );
    });
});

describe('estrutura do formulário de aulas', () => {
    test('apresenta os oito campos do contrato original', () => {
        renderLessonForm();

        expect(screen.getByRole('form', {
            name: 'Cadastro de aula',
        })).toBeTruthy();
        expect(screen.getByLabelText('Data').required).toBe(true);
        expect(screen.getByLabelText('Curso').required).toBe(true);
        expect(
            screen.getByLabelText('Unidade curricular').required,
        ).toBe(true);
        expect(screen.getByLabelText('Tipo').value).toBe('Aula');
        expect(screen.getByLabelText('Número da aula').value).toBe('');
        expect(
            screen.getByLabelText('Marcar para revisão').checked,
        ).toBe(false);
        expect(screen.getByLabelText('Link do Plano de Aula').value).toBe(
            '',
        );
        expect(
            screen.getByLabelText('Link do Guia e das Atividades').value,
        ).toBe('');
    });

    test('oferece somente cursos e tipos pertencentes ao contrato', () => {
        renderLessonForm();

        expect(
            Array.from(screen.getByLabelText('Curso').options)
                .map((option) => option.value),
        ).toEqual(['', 'APQSA', 'TECMKT', 'TECADM']);
        expect(
            Array.from(screen.getByLabelText('Tipo').options)
                .map((option) => option.value),
        ).toEqual(['Aula', 'Atividade', 'Avaliação']);
    });
});

describe('edição de aulas', () => {
    test('prepara os oito controles a partir da aula pública', () => {
        const editingState = createEditingLessonFormData(
            createEditableLesson({
                lessonNumber: null,
                lessonPlanUrl: null,
                studentGuideUrl: null,
            }),
        );

        expect(editingState).toEqual({
            lessonId: '64f000000000000000000001',
            formData: {
                date: '2026-09-18',
                course: 'APQSA',
                curricularUnit: 'Qualidade de Software',
                type: 'Aula',
                lessonNumber: '',
                needsReview: false,
                lessonPlanUrl: '',
                studentGuideUrl: '',
            },
        });
    });

    test('apresenta os valores atuais e ações de edição', () => {
        renderLessonForm({
            lessonToEdit: createEditableLesson({
                type: 'Avaliação',
                needsReview: true,
            }),
        });

        expect(screen.getByRole('form', {
            name: 'Edição de aula',
        })).toBeTruthy();
        expect(screen.getByRole('heading', {
            name: 'Editar registro',
        })).toBeTruthy();
        expect(screen.getByLabelText('Data').value).toBe('2026-09-18');
        expect(screen.getByLabelText('Curso').value).toBe('APQSA');
        expect(screen.getByLabelText('Unidade curricular').value).toBe(
            'Qualidade de Software',
        );
        expect(screen.getByLabelText('Tipo').value).toBe('Avaliação');
        expect(screen.getByLabelText('Número da aula').value).toBe('12');
        expect(
            screen.getByLabelText('Marcar para revisão').checked,
        ).toBe(true);
        expect(screen.getByRole('button', {
            name: 'Salvar alterações',
        })).toBeTruthy();
        expect(screen.getByRole('button', {
            name: 'Cancelar edição',
        })).toBeTruthy();
    });

    test('cancela sem enviar alterações', async () => {
        const user = userEvent.setup();
        const {
            lessonService,
            onEditCancelled,
        } = renderLessonForm({
            lessonToEdit: createEditableLesson(),
        });

        await user.click(screen.getByRole('button', {
            name: 'Cancelar edição',
        }));

        expect(onEditCancelled).toHaveBeenCalledOnce();
        expect(lessonService.updateLesson).not.toHaveBeenCalled();
    });

    test('envia os oito campos e confirma a representação editada', async () => {
        const user = userEvent.setup();
        const updatedLesson = createEditableLesson({
            curricularUnit: 'Testes Automatizados',
            lessonNumber: null,
            needsReview: true,
        });
        const lessonService = createLessonService({
            updateLesson: vi.fn().mockResolvedValue(updatedLesson),
        });
        const {
            onLessonCreated,
            onLessonUpdated,
        } = renderLessonForm({
            lessonService,
            lessonToEdit: createEditableLesson(),
        });

        await user.clear(
            screen.getByLabelText('Unidade curricular'),
        );
        await user.type(
            screen.getByLabelText('Unidade curricular'),
            'Testes Automatizados',
        );
        await user.clear(screen.getByLabelText('Número da aula'));
        await user.click(
            screen.getByLabelText('Marcar para revisão'),
        );
        await user.click(screen.getByRole('button', {
            name: 'Salvar alterações',
        }));

        await waitFor(() => {
            expect(lessonService.updateLesson).toHaveBeenCalledTimes(1);
        });
        expect(lessonService.updateLesson).toHaveBeenCalledWith(
            '64f000000000000000000001',
            {
                date: '2026-09-18',
                course: 'APQSA',
                curricularUnit: 'Testes Automatizados',
                type: 'Aula',
                lessonNumber: '',
                needsReview: true,
                lessonPlanUrl: 'https://example.com/plano',
                studentGuideUrl: 'https://example.com/guia',
            },
        );
        expect(onLessonUpdated).toHaveBeenCalledWith(updatedLesson);
        expect(onLessonCreated).not.toHaveBeenCalled();
        expect(screen.getByRole('status').textContent).toBe(
            LESSON_FORM_MESSAGES.UPDATE_SUCCESS,
        );
        expect(screen.getByLabelText('Número da aula').value).toBe('');
    });

    test('mantém os campos durante uma recusa conhecida', async () => {
        const user = userEvent.setup();
        const publicMessage = 'A alteração foi recusada.';
        const lessonService = createLessonService({
            updateLesson: vi.fn().mockRejectedValue(
                new LessonApiError(publicMessage, {
                    statusCode: 400,
                    code: 'INVALID_LESSON_DATA',
                }),
            ),
        });

        renderLessonForm({
            lessonService,
            lessonToEdit: createEditableLesson(),
        });
        await user.clear(
            screen.getByLabelText('Unidade curricular'),
        );
        await user.type(
            screen.getByLabelText('Unidade curricular'),
            'Alteração local',
        );
        await user.click(screen.getByRole('button', {
            name: 'Salvar alterações',
        }));

        expect((await screen.findByRole('alert')).textContent).toBe(
            publicMessage,
        );
        expect(screen.getByLabelText('Unidade curricular').value).toBe(
            'Alteração local',
        );
    });

    test('oculta detalhes de uma falha inesperada', async () => {
        const user = userEvent.setup();
        const technicalMessage = 'Falha interna durante a edição.';
        const lessonService = createLessonService({
            updateLesson: vi.fn().mockRejectedValue(
                new Error(technicalMessage),
            ),
        });

        renderLessonForm({
            lessonService,
            lessonToEdit: createEditableLesson(),
        });
        await user.click(screen.getByRole('button', {
            name: 'Salvar alterações',
        }));

        expect((await screen.findByRole('alert')).textContent).toBe(
            LESSON_FORM_MESSAGES.UNEXPECTED_UPDATE_ERROR,
        );
        expect(document.body.textContent).not.toContain(
            technicalMessage,
        );
    });

    test('bloqueia controles e cancelamento durante o salvamento', async () => {
        const user = userEvent.setup();
        const lessonService = createLessonService({
            updateLesson: vi.fn().mockReturnValue(
                new Promise(() => {}),
            ),
        });

        renderLessonForm({
            lessonService,
            lessonToEdit: createEditableLesson(),
        });
        await user.click(screen.getByRole('button', {
            name: 'Salvar alterações',
        }));

        const form = screen.getByRole('form', {
            name: 'Edição de aula',
        });
        const controls = form.querySelectorAll(
            'input, select, button',
        );

        expect(screen.getByRole('button', {
            name: 'Salvando...',
        })).toBeTruthy();
        expect(
            Array.from(controls).every((control) => control.disabled),
        ).toBe(true);
        expect(lessonService.updateLesson).toHaveBeenCalledOnce();
    });
});

describe('cadastro de aulas', () => {
    test('envia os oito campos e confirma a representação criada', async () => {
        const user = userEvent.setup();
        const createdLesson = Object.freeze({
            id: 'lesson-created',
            date: '2026-09-19',
        });
        const lessonService = createLessonService({
            createLesson: vi.fn().mockResolvedValue(createdLesson),
        });
        const { onLessonCreated } = renderLessonForm({
            lessonService,
        });

        await fillRequiredFields(user);
        await user.selectOptions(
            screen.getByLabelText('Tipo'),
            'Atividade',
        );
        await user.type(
            screen.getByLabelText('Número da aula'),
            '12',
        );
        await user.click(
            screen.getByLabelText('Marcar para revisão'),
        );
        await user.type(
            screen.getByLabelText('Link do Plano de Aula'),
            'https://example.com/plano',
        );
        await user.type(
            screen.getByLabelText('Link do Guia e das Atividades'),
            'https://example.com/guia',
        );
        await user.click(
            screen.getByRole('button', { name: 'Cadastrar registro' }),
        );

        await waitFor(() => {
            expect(lessonService.createLesson).toHaveBeenCalledTimes(1);
        });
        expect(lessonService.createLesson).toHaveBeenCalledWith({
            date: '2026-09-19',
            course: 'APQSA',
            curricularUnit: 'Qualidade de Software',
            type: 'Atividade',
            lessonNumber: '12',
            needsReview: true,
            lessonPlanUrl: 'https://example.com/plano',
            studentGuideUrl: 'https://example.com/guia',
        });
        expect(onLessonCreated).toHaveBeenCalledWith(createdLesson);
        expect(screen.getByRole('status').textContent).toBe(
            LESSON_FORM_MESSAGES.CREATE_SUCCESS,
        );
    });

    test('limpa os campos somente depois de uma criação válida', async () => {
        const user = userEvent.setup();

        renderLessonForm();
        await fillRequiredFields(user);
        await user.click(
            screen.getByRole('button', { name: 'Cadastrar registro' }),
        );

        await screen.findByText(LESSON_FORM_MESSAGES.CREATE_SUCCESS);
        expect(screen.getByLabelText('Data').value).toBe('');
        expect(screen.getByLabelText('Curso').value).toBe('');
        expect(screen.getByLabelText('Unidade curricular').value).toBe('');
        expect(screen.getByLabelText('Tipo').value).toBe('Aula');
        expect(
            screen.getByLabelText('Marcar para revisão').checked,
        ).toBe(false);
    });

    test('mantém os campos durante uma recusa conhecida', async () => {
        const user = userEvent.setup();
        const publicMessage = 'Os dados informados são inválidos.';
        const lessonService = createLessonService({
            createLesson: vi.fn().mockRejectedValue(
                new LessonApiError(publicMessage, {
                    statusCode: 400,
                    code: 'INVALID_LESSON_DATA',
                }),
            ),
        });

        renderLessonForm({ lessonService });
        await fillRequiredFields(user);
        await user.click(
            screen.getByRole('button', { name: 'Cadastrar registro' }),
        );

        expect((await screen.findByRole('alert')).textContent).toBe(
            publicMessage,
        );
        expect(screen.getByLabelText('Data').value).toBe('2026-09-19');
        expect(screen.getByLabelText('Curso').value).toBe('APQSA');
        expect(screen.getByLabelText('Unidade curricular').value).toBe(
            'Qualidade de Software',
        );
    });

    test('oculta detalhes de uma falha inesperada', async () => {
        const user = userEvent.setup();
        const technicalMessage =
            'Falha técnica controlada contendo dados internos.';
        const lessonService = createLessonService({
            createLesson: vi.fn().mockRejectedValue(
                new Error(technicalMessage),
            ),
        });

        renderLessonForm({ lessonService });
        await fillRequiredFields(user);
        await user.click(
            screen.getByRole('button', { name: 'Cadastrar registro' }),
        );

        expect((await screen.findByRole('alert')).textContent).toBe(
            LESSON_FORM_MESSAGES.UNEXPECTED_CREATE_ERROR,
        );
        expect(document.body.textContent).not.toContain(
            technicalMessage,
        );
    });

    test('bloqueia todos os controles enquanto o envio está pendente', async () => {
        const user = userEvent.setup();
        const lessonService = createLessonService({
            createLesson: vi.fn().mockReturnValue(
                new Promise(() => {}),
            ),
        });

        renderLessonForm({ lessonService });
        await fillRequiredFields(user);
        await user.click(
            screen.getByRole('button', { name: 'Cadastrar registro' }),
        );

        const form = screen.getByRole('form', {
            name: 'Cadastro de aula',
        });
        const controls = form.querySelectorAll(
            'input, select, button',
        );

        expect(screen.getByRole('button', {
            name: 'Cadastrando...',
        })).toBeTruthy();
        expect(
            Array.from(controls).every((control) => control.disabled),
        ).toBe(true);
        expect(lessonService.createLesson).toHaveBeenCalledTimes(1);
    });

    test('remove mensagens anteriores quando um campo é alterado', async () => {
        const user = userEvent.setup();

        renderLessonForm();
        await fillRequiredFields(user);
        await user.click(
            screen.getByRole('button', { name: 'Cadastrar registro' }),
        );
        await screen.findByText(LESSON_FORM_MESSAGES.CREATE_SUCCESS);

        fireEvent.change(screen.getByLabelText('Data'), {
            target: { value: '2026-09-20' },
        });

        expect(
            screen.queryByText(LESSON_FORM_MESSAGES.CREATE_SUCCESS),
        ).toBeNull();
    });
});
