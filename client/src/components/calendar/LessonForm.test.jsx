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
    createInitialLessonFormData,
} from './LessonForm.jsx';
import { LessonApiError } from '../../services/LessonApi.js';

afterEach(() => {
    cleanup();
});

/**
 * Cria o contrato mínimo de criação utilizado pelo formulário.
 *
 * @param {object} overrides Operações substituídas pelo cenário.
 * @returns {{ createLesson: ReturnType<typeof vi.fn> }} Serviço controlado.
 */
function createLessonService(overrides = {}) {
    return {
        createLesson: vi.fn().mockResolvedValue(
            Object.freeze({ id: 'lesson-123' }),
        ),
        ...overrides,
    };
}

/**
 * Monta o formulário com dependências válidas.
 *
 * @param {object} overrides Dependências específicas do cenário.
 * @returns {{ lessonService: object,
 * onLessonCreated: ReturnType<typeof vi.fn> }} Dependências utilizadas.
 */
function renderLessonForm(overrides = {}) {
    const lessonService = overrides.lessonService
        ?? createLessonService();
    const onLessonCreated = overrides.onLessonCreated ?? vi.fn();

    render(
        <LessonForm
            lessonService={lessonService}
            onLessonCreated={onLessonCreated}
        />,
    );

    return { lessonService, onLessonCreated };
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
            LESSON_FORM_MESSAGES.SUCCESS,
        );
    });

    test('limpa os campos somente depois de uma criação válida', async () => {
        const user = userEvent.setup();

        renderLessonForm();
        await fillRequiredFields(user);
        await user.click(
            screen.getByRole('button', { name: 'Cadastrar registro' }),
        );

        await screen.findByText(LESSON_FORM_MESSAGES.SUCCESS);
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
            LESSON_FORM_MESSAGES.UNEXPECTED_ERROR,
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
        await screen.findByText(LESSON_FORM_MESSAGES.SUCCESS);

        fireEvent.change(screen.getByLabelText('Data'), {
            target: { value: '2026-09-20' },
        });

        expect(
            screen.queryByText(LESSON_FORM_MESSAGES.SUCCESS),
        ).toBeNull();
    });
});
