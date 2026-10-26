import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { CourseApiError } from '../services/CourseApi.js';
import {
    COURSE_CATALOG_MESSAGES,
    prepareCourseCatalog,
    useCourseCatalog,
} from './useCourseCatalog.js';

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function course(overrides = {}) {
    return {
        id: '507f1f77bcf86cd7994390ab', name: 'Ciência de Dados', code: 'CD',
        active: true, internalValue: 'não deve ser publicado', ...overrides,
    };
}

function deferred() {
    let resolve;
    const promise = new Promise((done) => { resolve = done; });
    return { promise, resolve };
}

describe('consulta reutilizável do catálogo', () => {
    test('exige serviço com consulta sem executar nenhuma gravação', () => {
        for (const courseService of [null, {}, { listCourses: true }]) {
            expect(() => renderHook(() => useCourseCatalog({ courseService })))
                .toThrowError(COURSE_CATALOG_MESSAGES.INVALID_SERVICE);
        }
    });

    test('consulta todas as situações uma vez e seleciona os campos públicos em ordem', async () => {
        const input = [course(), course({ id: '507f1f77bcf86cd7994390ac',
            name: 'Administração', code: 'ADM', active: false })];
        const courseService = { listCourses: vi.fn().mockResolvedValue(input) };
        const { result, rerender } = renderHook(() => useCourseCatalog({ courseService }));
        expect(result.current.isLoading).toBe(true);
        await waitFor(() => expect(result.current.isLoading).toBe(false));
        expect(courseService.listCourses).toHaveBeenCalledExactlyOnceWith({});
        expect(result.current.courses.map((item) => item.code)).toEqual(['ADM', 'CD']);
        expect(result.current.courses[0].active).toBe(false);
        expect(Object.hasOwn(result.current.courses[0], 'internalValue')).toBe(false);
        expect(Object.isFrozen(result.current.courses)).toBe(true);
        expect(Object.isFrozen(result.current.courses[0])).toBe(true);
        expect(input[0].code).toBe('CD');
        rerender();
        expect(courseService.listCourses).toHaveBeenCalledOnce();
    });

    test('catálogo vazio é válido somente quando a consulta confirma a lista', async () => {
        const courseService = { listCourses: vi.fn().mockResolvedValue([]) };
        const { result } = renderHook(() => useCourseCatalog({ courseService }));
        await waitFor(() => expect(result.current.isLoading).toBe(false));
        expect(result.current.courses).toEqual([]);
        expect(result.current.errorMessage).toBeNull();
    });

    test('recusa lista malformada, curso inconsistente e identidade duplicada', () => {
        for (const input of [undefined, null, {}, [null], [course(), course()],
            [course({ active: 'true' })], [course({ id: 'SIGLA' })]]) {
            expect(() => prepareCourseCatalog(input)).toThrow();
        }
    });

    test('lista malformada gera falha visível e não um catálogo vazio de sucesso', async () => {
        const courseService = { listCourses: vi.fn().mockResolvedValue({ courses: [] }) };
        const { result } = renderHook(() => useCourseCatalog({ courseService }));
        await waitFor(() => expect(result.current.isLoading).toBe(false));
        expect(result.current.courses).toEqual([]);
        expect(result.current.errorMessage).toBe(COURSE_CATALOG_MESSAGES.LOAD_ERROR);
    });

    test('falha inesperada não expõe detalhes internos nem repete automaticamente', async () => {
        const courseService = { listCourses: vi.fn().mockRejectedValue(new Error('detalhe privado')) };
        const { result } = renderHook(() => useCourseCatalog({ courseService }));
        await waitFor(() => expect(result.current.errorMessage).toBe(COURSE_CATALOG_MESSAGES.LOAD_ERROR));
        expect(courseService.listCourses).toHaveBeenCalledOnce();
    });

    test('preserva mensagem pública segura produzida pela API de cursos', async () => {
        const failure = new CourseApiError('Sua sessão terminou. Entre novamente.', {
            statusCode: 401, code: 'AUTHENTICATION_REQUIRED',
        });
        const courseService = { listCourses: vi.fn().mockRejectedValue(failure) };
        const { result } = renderHook(() => useCourseCatalog({ courseService }));
        await waitFor(() => expect(result.current.errorMessage).toBe(failure.message));
    });

    test('falha síncrona do serviço é apresentada com mensagem genérica', async () => {
        const courseService = { listCourses() { throw new Error('detalhe privado'); } };
        const { result } = renderHook(() => useCourseCatalog({ courseService }));
        await waitFor(() => expect(result.current.errorMessage).toBe(COURSE_CATALOG_MESSAGES.LOAD_ERROR));
    });

    test('nova tentativa limpa a falha e publica a consulta concluída', async () => {
        const pending = deferred();
        const courseService = { listCourses: vi.fn()
            .mockRejectedValueOnce(new Error('falha'))
            .mockReturnValueOnce(pending.promise) };
        const { result } = renderHook(() => useCourseCatalog({ courseService }));
        await waitFor(() => expect(result.current.errorMessage).not.toBeNull());
        act(() => result.current.reload());
        expect(result.current.isLoading).toBe(true);
        expect(result.current.errorMessage).toBeNull();
        await act(async () => pending.resolve([course()]));
        expect(result.current.courses).toHaveLength(1);
        expect(result.current.errorMessage).toBeNull();
        expect(courseService.listCourses).toHaveBeenCalledTimes(2);
    });

    test('nova consulta reflete nome, sigla e situação atuais sem alterar a identidade', async () => {
        const courseService = { listCourses: vi.fn()
            .mockResolvedValueOnce([course()])
            .mockResolvedValueOnce([course({ name: 'Análise de Dados', code: 'AD', active: false })]) };
        const { result } = renderHook(() => useCourseCatalog({ courseService }));
        await waitFor(() => expect(result.current.isLoading).toBe(false));
        const first = result.current.courses[0];
        act(() => result.current.reload());
        await waitFor(() => expect(result.current.courses[0]?.code).toBe('AD'));
        expect(result.current.courses[0].id).toBe(first.id);
        expect(result.current.courses[0].active).toBe(false);
        expect(first.code).toBe('CD');
    });

    test('resposta antiga de outra tentativa não substitui o catálogo mais recente', async () => {
        const old = deferred();
        const courseService = { listCourses: vi.fn()
            .mockReturnValueOnce(old.promise)
            .mockResolvedValueOnce([course({ code: 'AD' })]) };
        const { result } = renderHook(() => useCourseCatalog({ courseService }));
        act(() => result.current.reload());
        await waitFor(() => expect(result.current.courses[0]?.code).toBe('AD'));
        await act(async () => old.resolve([course()]));
        expect(result.current.courses[0].code).toBe('AD');
    });

    test('trocar o serviço retira os dados antigos enquanto a nova consulta está pendente', async () => {
        const first = { listCourses: vi.fn().mockResolvedValue([course()]) };
        const pending = deferred();
        const second = { listCourses: vi.fn().mockReturnValue(pending.promise) };
        const { result, rerender } = renderHook(
            ({ courseService }) => useCourseCatalog({ courseService }),
            { initialProps: { courseService: first } },
        );
        await waitFor(() => expect(result.current.courses).toHaveLength(1));
        rerender({ courseService: second });
        expect(result.current.courses).toEqual([]);
        expect(result.current.isLoading).toBe(true);
        await act(async () => pending.resolve([course({ code: 'AD' })]));
        expect(result.current.courses[0].code).toBe('AD');
    });

    test('resposta da fonte anterior não substitui o resultado da nova fonte', async () => {
        const old = deferred();
        const first = { listCourses: vi.fn().mockReturnValue(old.promise) };
        const second = { listCourses: vi.fn().mockResolvedValue([course({ code: 'AD' })]) };
        const { result, rerender } = renderHook(
            ({ courseService }) => useCourseCatalog({ courseService }),
            { initialProps: { courseService: first } },
        );
        rerender({ courseService: second });
        await waitFor(() => expect(result.current.courses[0]?.code).toBe('AD'));
        await act(async () => old.resolve([course()]));
        expect(result.current.courses[0].code).toBe('AD');
    });

    test('usa a API padrão quando nenhuma dependência é fornecida', async () => {
        const fetchClient = vi.fn().mockResolvedValue({
            status: 200, ok: true, async json() { return { data: { courses: [] } }; },
        });
        vi.stubGlobal('fetch', fetchClient);
        const { result } = renderHook(() => useCourseCatalog());
        await waitFor(() => expect(result.current.isLoading).toBe(false));
        expect(fetchClient).toHaveBeenCalledExactlyOnceWith('/api/courses',
            expect.objectContaining({ method: 'GET' }));
    });
});
