import {
    act,
    cleanup,
    fireEvent,
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
    EMPTY_LESSON_FILTERS,
    LESSON_MANAGEMENT_IDS,
    LESSON_MANAGEMENT_MESSAGES,
    LessonManagement,
    createSubmittedFilters,
    formatCivilDate,
} from './LessonManagement.jsx';
import { LessonApiError } from '../../services/LessonApi.js';

afterEach(() => {
    cleanup();
});

/**
 * Cria uma aula pública compatível com o contrato do LessonApi.
 *
 * @param {object} overrides Campos substituídos pelo cenário.
 * @returns {Readonly<object>} Aula controlada.
 */
function createLesson(overrides = {}) {
    return Object.freeze({
        id: '64f000000000000000000123',
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
 * Cria o contrato mínimo injetado no componente.
 *
 * @param {object} overrides Operações substituídas.
 * @returns {{
 *     listLessons: ReturnType<typeof vi.fn>,
 *     createLesson: ReturnType<typeof vi.fn>,
 *     updateLesson: ReturnType<typeof vi.fn>,
 * }} Serviço controlado.
 */
function createLessonService(overrides = {}) {
    return {
        listLessons: vi.fn().mockResolvedValue([]),
        createLesson: vi.fn().mockResolvedValue(createLesson()),
        updateLesson: vi.fn().mockResolvedValue(createLesson()),
        ...overrides,
    };
}

/**
 * Cria uma promessa cujo término é controlado pelo teste.
 *
 * @returns {{ promise: Promise<unknown>, resolve: Function,
 * reject: Function }} Promessa controlável.
 */
function createDeferredPromise() {
    let resolve;
    let reject;
    const promise = new Promise((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
    });

    return { promise, resolve, reject };
}

describe('configuração do gerenciamento de aulas', () => {
    test('expõe contratos estáveis e protegidos', () => {
        expect(LESSON_MANAGEMENT_IDS).toEqual({
            TITLE: 'lesson-management-title',
            FILTERS: 'lesson-management-filters',
            RESULTS: 'lesson-management-results',
        });
        expect(EMPTY_LESSON_FILTERS).toEqual({
            course: '',
            month: '',
            fromDate: '',
        });
        expect(Object.isFrozen(LESSON_MANAGEMENT_IDS)).toBe(true);
        expect(Object.isFrozen(LESSON_MANAGEMENT_MESSAGES)).toBe(true);
        expect(Object.isFrozen(EMPTY_LESSON_FILTERS)).toBe(true);
    });

    test('rejeita serviços de aulas inválidos', () => {
        const invalidServices = [
            null,
            'lessons',
            42,
            {},
            [],
            { listLessons: true },
            { listLessons() {} },
            { createLesson() {} },
            { updateLesson() {} },
            {
                listLessons() {},
                createLesson() {},
            },
        ];

        for (const lessonService of invalidServices) {
            expect(() => render(
                <LessonManagement lessonService={lessonService} />,
            )).toThrowError(
                LESSON_MANAGEMENT_MESSAGES.INVALID_LESSON_SERVICE,
            );

            cleanup();
        }
    });
});

describe('preparação visual dos filtros e datas', () => {
    test('remove filtros vazios e preserva a ordem pública', () => {
        const filters = createSubmittedFilters({
            course: 'APQSA',
            month: '',
            fromDate: '2026-09-18',
        });

        expect(filters).toEqual({
            course: 'APQSA',
            fromDate: '2026-09-18',
        });
        expect(Object.keys(filters)).toEqual([
            'course',
            'fromDate',
        ]);
        expect(Object.isFrozen(filters)).toBe(true);
    });

    test('formata datas civis sem conversão de fuso horário', () => {
        expect(formatCivilDate('2026-09-18')).toBe('18/09/2026');
    });
});

describe('consulta inicial de aulas', () => {
    test('consulta sem filtros e apresenta o estado vazio', async () => {
        const lessonService = createLessonService();

        render(
            <LessonManagement lessonService={lessonService} />,
        );

        expect(screen.getByText(
            LESSON_MANAGEMENT_MESSAGES.LOADING,
        )).toBeTruthy();
        expect(
            screen.getByRole('button', { name: 'Consultando...' })
                .disabled,
        ).toBe(true);

        expect(await screen.findByText(
            LESSON_MANAGEMENT_MESSAGES.EMPTY,
        )).toBeTruthy();
        expect(lessonService.listLessons).toHaveBeenCalledTimes(1);
        expect(lessonService.listLessons).toHaveBeenCalledWith({});
        expect(
            screen.getByLabelText('Aulas encontradas: 0').textContent,
        ).toBe('0');
    });

    test('apresenta somente os dados públicos recebidos', async () => {
        const lesson = createLesson({
            passwordHash: 'campo adicional controlado',
        });
        const lessonService = createLessonService({
            listLessons: vi.fn().mockResolvedValue([lesson]),
        });

        render(
            <LessonManagement lessonService={lessonService} />,
        );

        expect(await screen.findByRole('heading', {
            level: 3,
            name: 'Qualidade de Software',
        })).toBeTruthy();
        expect(screen.getByText('18/09/2026')).toBeTruthy();
        const lessonList = screen.getByRole('list', {
            name: 'Aulas encontradas',
        });

        expect(within(lessonList).getByText('APQSA')).toBeTruthy();
        expect(within(lessonList).getByText('Aula')).toBeTruthy();
        expect(within(lessonList).getByText('12')).toBeTruthy();
        expect(
            within(lessonList).getByText('Não necessária'),
        ).toBeTruthy();
        expect(
            screen.getByRole('link', { name: 'Plano de aula' })
                .getAttribute('href'),
        ).toBe('https://example.com/plano');
        expect(
            screen.getByRole('link', { name: 'Guia e atividades' })
                .getAttribute('rel'),
        ).toBe('noreferrer noopener');
        expect(document.body.textContent).not.toContain(
            'campo adicional controlado',
        );
        expect(
            screen.getByLabelText('Aulas encontradas: 1').textContent,
        ).toBe('1');
    });

    test('representa materiais e número ausentes', async () => {
        const lessonService = createLessonService({
            listLessons: vi.fn().mockResolvedValue([
                createLesson({
                    lessonNumber: null,
                    lessonPlanUrl: null,
                    studentGuideUrl: null,
                }),
            ]),
        });

        render(
            <LessonManagement lessonService={lessonService} />,
        );

        expect(await screen.findByText('Não informado')).toBeTruthy();
        expect(
            screen.getByText('Plano de aula: não informado'),
        ).toBeTruthy();
        expect(
            screen.getByText('Guia e atividades: não informado'),
        ).toBeTruthy();
        expect(screen.queryByRole('link')).toBeNull();
    });
});

describe('interação com os filtros', () => {
    test('aplica somente os três filtros preenchidos', async () => {
        const user = userEvent.setup();
        const lessonService = createLessonService();

        render(
            <LessonManagement lessonService={lessonService} />,
        );

        await screen.findByText(LESSON_MANAGEMENT_MESSAGES.EMPTY);

        const filterForm = screen.getByRole('form', {
            name: 'Filtros de aulas',
        });

        await user.selectOptions(
            within(filterForm).getByLabelText('Curso'),
            'TECMKT',
        );
        fireEvent.change(within(filterForm).getByLabelText('Mês'), {
            target: { value: '2026-09' },
        });
        fireEvent.change(
            within(filterForm).getByLabelText('A partir de'),
            { target: { value: '2026-09-18' } },
        );
        await user.click(
            screen.getByRole('button', { name: 'Aplicar filtros' }),
        );

        await waitFor(() => {
            expect(lessonService.listLessons).toHaveBeenCalledTimes(2);
        });
        expect(lessonService.listLessons).toHaveBeenLastCalledWith({
            course: 'TECMKT',
            month: '2026-09',
            fromDate: '2026-09-18',
        });
    });

    test('limpa os controles e consulta novamente sem filtros', async () => {
        const user = userEvent.setup();
        const lessonService = createLessonService();

        render(
            <LessonManagement lessonService={lessonService} />,
        );

        await screen.findByText(LESSON_MANAGEMENT_MESSAGES.EMPTY);

        const filterForm = screen.getByRole('form', {
            name: 'Filtros de aulas',
        });

        await user.selectOptions(
            within(filterForm).getByLabelText('Curso'),
            'TECADM',
        );
        await user.click(
            screen.getByRole('button', { name: 'Aplicar filtros' }),
        );
        await waitFor(() => {
            expect(lessonService.listLessons).toHaveBeenCalledTimes(2);
        });

        await user.click(
            screen.getByRole('button', { name: 'Limpar filtros' }),
        );

        await waitFor(() => {
            expect(lessonService.listLessons).toHaveBeenCalledTimes(3);
        });
        expect(lessonService.listLessons).toHaveBeenLastCalledWith({});
        expect(within(filterForm).getByLabelText('Curso').value).toBe('');
        expect(within(filterForm).getByLabelText('Mês').value).toBe('');
        expect(
            within(filterForm).getByLabelText('A partir de').value,
        ).toBe('');
    });
});

describe('integração do cadastro com a consulta', () => {
    test('atualiza a lista preservando os filtros aplicados', async () => {
        const user = userEvent.setup();
        const createdLesson = createLesson({
            id: 'lesson-created',
            course: 'TECMKT',
            curricularUnit: 'Marketing Digital',
        });
        const lessonService = createLessonService({
            listLessons: vi.fn()
                .mockResolvedValueOnce([])
                .mockResolvedValueOnce([])
                .mockResolvedValueOnce([createdLesson]),
            createLesson: vi.fn().mockResolvedValue(createdLesson),
        });

        render(
            <LessonManagement lessonService={lessonService} />,
        );

        await screen.findByText(LESSON_MANAGEMENT_MESSAGES.EMPTY);

        const filterForm = screen.getByRole('form', {
            name: 'Filtros de aulas',
        });
        const creationForm = screen.getByRole('form', {
            name: 'Cadastro de aula',
        });

        await user.selectOptions(
            within(filterForm).getByLabelText('Curso'),
            'TECMKT',
        );
        await user.click(
            screen.getByRole('button', { name: 'Aplicar filtros' }),
        );
        await waitFor(() => {
            expect(lessonService.listLessons).toHaveBeenCalledTimes(2);
        });

        fireEvent.change(within(creationForm).getByLabelText('Data'), {
            target: { value: '2026-09-19' },
        });
        await user.selectOptions(
            within(creationForm).getByLabelText('Curso'),
            'TECMKT',
        );
        await user.type(
            within(creationForm).getByLabelText('Unidade curricular'),
            'Marketing Digital',
        );
        await user.click(
            screen.getByRole('button', { name: 'Cadastrar registro' }),
        );

        expect(await screen.findByRole('heading', {
            level: 3,
            name: 'Marketing Digital',
        })).toBeTruthy();
        expect(lessonService.createLesson).toHaveBeenCalledTimes(1);
        expect(lessonService.listLessons).toHaveBeenCalledTimes(3);
        expect(lessonService.listLessons).toHaveBeenLastCalledWith({
            course: 'TECMKT',
        });
    });
});

describe('integração da edição com a consulta', () => {
    test('abre e cancela a edição sem acessar a API', async () => {
        const user = userEvent.setup();
        const lesson = createLesson();
        const lessonService = createLessonService({
            listLessons: vi.fn().mockResolvedValue([lesson]),
        });

        render(
            <LessonManagement lessonService={lessonService} />,
        );

        await screen.findByRole('heading', {
            level: 3,
            name: 'Qualidade de Software',
        });

        const editButton = screen.getByRole('button', {
            name: 'Editar Aula de APQSA em 18/09/2026',
        });

        await user.click(editButton);

        const editingForm = screen.getByRole('form', {
            name: 'Edição de aula',
        });

        expect(
            within(editingForm).getByLabelText('Data').value,
        ).toBe('2026-09-18');
        expect(
            within(editingForm).getByLabelText('Curso').value,
        ).toBe('APQSA');
        expect(
            within(editingForm).getByLabelText('Unidade curricular').value,
        ).toBe('Qualidade de Software');
        expect(screen.getByText('Editando')).toBeTruthy();
        expect(editButton.disabled).toBe(true);

        await user.click(screen.getByRole('button', {
            name: 'Cancelar edição',
        }));

        expect(screen.getByRole('form', {
            name: 'Cadastro de aula',
        })).toBeTruthy();
        expect(editButton.disabled).toBe(false);
        expect(lessonService.updateLesson).not.toHaveBeenCalled();
        expect(lessonService.listLessons).toHaveBeenCalledTimes(1);
    });

    test('troca os controles para outra aula selecionada', async () => {
        const user = userEvent.setup();
        const firstLesson = createLesson();
        const secondLesson = createLesson({
            id: '64f000000000000000000124',
            date: '2026-09-19',
            course: 'TECMKT',
            curricularUnit: 'Marketing Digital',
            type: 'Atividade',
            lessonNumber: '4',
        });
        const lessonService = createLessonService({
            listLessons: vi.fn().mockResolvedValue([
                firstLesson,
                secondLesson,
            ]),
        });

        render(
            <LessonManagement lessonService={lessonService} />,
        );

        await screen.findByRole('heading', {
            level: 3,
            name: 'Marketing Digital',
        });

        await user.click(screen.getByRole('button', {
            name: 'Editar Aula de APQSA em 18/09/2026',
        }));
        await user.click(screen.getByRole('button', {
            name: 'Editar Atividade de TECMKT em 19/09/2026',
        }));

        const editingForm = screen.getByRole('form', {
            name: 'Edição de aula',
        });

        expect(
            within(editingForm).getByLabelText('Data').value,
        ).toBe('2026-09-19');
        expect(
            within(editingForm).getByLabelText('Curso').value,
        ).toBe('TECMKT');
        expect(
            within(editingForm).getByLabelText('Unidade curricular').value,
        ).toBe('Marketing Digital');
        expect(
            within(editingForm).getByLabelText('Tipo').value,
        ).toBe('Atividade');
    });

    test('salva a edição e atualiza o recorte aplicado', async () => {
        const user = userEvent.setup();
        const lesson = createLesson({
            course: 'TECMKT',
            curricularUnit: 'Marketing Digital',
        });
        const updatedLesson = createLesson({
            course: 'TECMKT',
            curricularUnit: 'Marketing Digital Aplicado',
        });
        const lessonService = createLessonService({
            listLessons: vi.fn()
                .mockResolvedValueOnce([lesson])
                .mockResolvedValueOnce([lesson])
                .mockResolvedValueOnce([updatedLesson]),
            updateLesson: vi.fn().mockResolvedValue(updatedLesson),
        });

        render(
            <LessonManagement lessonService={lessonService} />,
        );

        await screen.findByRole('heading', {
            level: 3,
            name: 'Marketing Digital',
        });

        const filterForm = screen.getByRole('form', {
            name: 'Filtros de aulas',
        });

        await user.selectOptions(
            within(filterForm).getByLabelText('Curso'),
            'TECMKT',
        );
        await user.click(screen.getByRole('button', {
            name: 'Aplicar filtros',
        }));
        await waitFor(() => {
            expect(lessonService.listLessons).toHaveBeenCalledTimes(2);
        });

        await user.click(screen.getByRole('button', {
            name: 'Editar Aula de TECMKT em 18/09/2026',
        }));

        const editingForm = screen.getByRole('form', {
            name: 'Edição de aula',
        });
        const curricularUnitField = within(editingForm)
            .getByLabelText('Unidade curricular');

        await user.clear(curricularUnitField);
        await user.type(
            curricularUnitField,
            'Marketing Digital Aplicado',
        );
        await user.click(within(editingForm).getByRole('button', {
            name: 'Salvar alterações',
        }));

        expect(await screen.findByRole('heading', {
            level: 3,
            name: 'Marketing Digital Aplicado',
        })).toBeTruthy();
        expect(lessonService.updateLesson).toHaveBeenCalledTimes(1);
        expect(lessonService.updateLesson).toHaveBeenCalledWith(
            '64f000000000000000000123',
            {
                date: '2026-09-18',
                course: 'TECMKT',
                curricularUnit: 'Marketing Digital Aplicado',
                type: 'Aula',
                lessonNumber: '12',
                needsReview: false,
                lessonPlanUrl: 'https://example.com/plano',
                studentGuideUrl: 'https://example.com/guia',
            },
        );
        expect(lessonService.listLessons).toHaveBeenCalledTimes(3);
        expect(lessonService.listLessons).toHaveBeenLastCalledWith({
            course: 'TECMKT',
        });
        expect(screen.getByRole('form', {
            name: 'Cadastro de aula',
        })).toBeTruthy();
    });
});

describe('falhas durante a consulta', () => {
    test('apresenta uma mensagem pública conhecida e permite repetir', async () => {
        const user = userEvent.setup();
        const publicMessage = 'A consulta informada é inválida.';
        const lessonService = createLessonService({
            listLessons: vi.fn()
                .mockRejectedValueOnce(new LessonApiError(
                    publicMessage,
                    {
                        statusCode: 400,
                        code: 'INVALID_LESSON_FILTERS',
                    },
                ))
                .mockResolvedValueOnce([]),
        });

        render(
            <LessonManagement lessonService={lessonService} />,
        );

        expect((await screen.findByRole('alert')).textContent).toBe(
            publicMessage,
        );
        await user.click(
            screen.getByRole('button', { name: 'Tentar novamente' }),
        );

        expect(await screen.findByText(
            LESSON_MANAGEMENT_MESSAGES.EMPTY,
        )).toBeTruthy();
        expect(lessonService.listLessons).toHaveBeenCalledTimes(2);
        expect(lessonService.listLessons).toHaveBeenLastCalledWith({});
    });

    test('oculta detalhes de uma falha inesperada', async () => {
        const technicalMessage =
            'Falha técnica controlada com conteúdo interno.';
        const lessonService = createLessonService({
            listLessons: vi.fn().mockRejectedValue(
                new Error(technicalMessage),
            ),
        });

        render(
            <LessonManagement lessonService={lessonService} />,
        );

        expect((await screen.findByRole('alert')).textContent).toBe(
            LESSON_MANAGEMENT_MESSAGES.UNEXPECTED_ERROR,
        );
        expect(document.body.textContent).not.toContain(
            technicalMessage,
        );
    });
});

describe('concorrência e ciclo de vida da consulta', () => {
    test('ignora uma resposta anterior que termina por último', async () => {
        const previousRequest = createDeferredPromise();
        const previousService = createLessonService({
            listLessons: vi.fn().mockReturnValue(
                previousRequest.promise,
            ),
        });
        const currentService = createLessonService({
            listLessons: vi.fn().mockResolvedValue([
                createLesson({
                    id: 'lesson-current',
                    course: 'TECMKT',
                    curricularUnit: 'Resultado mais recente',
                }),
            ]),
        });

        const view = render(
            <LessonManagement lessonService={previousService} />,
        );

        view.rerender(
            <LessonManagement lessonService={currentService} />,
        );

        expect(await screen.findByRole('heading', {
            level: 3,
            name: 'Resultado mais recente',
        })).toBeTruthy();

        await act(async () => {
            previousRequest.resolve([createLesson({
                id: 'lesson-previous',
                curricularUnit: 'Resultado anterior',
            })]);
            await previousRequest.promise;
        });

        expect(screen.queryByText('Resultado anterior')).toBeNull();
        expect(screen.getByText('Resultado mais recente')).toBeTruthy();
    });

    test('não atualiza a interface depois da desmontagem', async () => {
        const request = createDeferredPromise();
        const lessonService = createLessonService({
            listLessons: vi.fn().mockReturnValue(request.promise),
        });
        const view = render(
            <LessonManagement lessonService={lessonService} />,
        );

        view.unmount();
        request.resolve([createLesson()]);

        await request.promise;

        expect(screen.queryByText('Qualidade de Software')).toBeNull();
    });
});
