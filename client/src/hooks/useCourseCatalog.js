import { useCallback, useEffect, useState } from 'react';

import {
    CourseApi,
    CourseApiError,
    courseApi,
} from '../services/CourseApi.js';

const COURSE_CATALOG_MESSAGES = Object.freeze({
    INVALID_SERVICE: 'A consulta do catálogo exige um serviço de cursos válido.',
    LOAD_ERROR: 'Não foi possível carregar os cursos. Tente novamente.',
    INVALID_RESULT: 'O serviço retornou um catálogo de cursos inválido.',
});

/**
 * Seleciona os campos públicos e ordena uma cópia independente do resultado.
 *
 * A validação também se aplica a serviços injetados: uma resposta inconsistente
 * não pode oferecer uma identidade incorreta nos formulários ou filtros.
 * @param {unknown} result Resultado da consulta, incluindo cursos desativados.
 * @returns {ReadonlyArray<Readonly<object>>} Catálogo público ordenado.
 */
function prepareCourseCatalog(result) {
    if (!Array.isArray(result)) {
        throw new TypeError(COURSE_CATALOG_MESSAGES.INVALID_RESULT);
    }
    const identities = new Set();
    const courses = result.map((item) => {
        const course = CourseApi.createPublicCourse(item);
        if (identities.has(course.id)) {
            throw new TypeError(COURSE_CATALOG_MESSAGES.INVALID_RESULT);
        }
        identities.add(course.id);
        return course;
    });

    courses.sort((first, second) => (
        first.name.localeCompare(second.name, 'pt-BR')
        || first.code.localeCompare(second.code, 'pt-BR')
        || first.id.localeCompare(second.id)
    ));
    return Object.freeze(courses);
}

/**
 * Consulta o catálogo para formulários e filtros da área individual.
 *
 * Uma seção poderá executar este hook uma vez e entregar a mesma lista aos
 * seus controles. Não filtra active aqui: a criação precisará dos cursos
 * ativos, enquanto a edição e os filtros também precisarão dos desativados.
 * As regras de associação continuam obrigatórias no backend.
 *
 * Somente uma consulta é feita ao montar, trocar o serviço ou chamar reload.
 * Não há repetição automática. A resposta de uma consulta antiga não substitui
 * a atual, e respostas concluídas após desmontagem são ignoradas. O resultado
 * anterior também deixa de ser exposto imediatamente quando a fonte muda.
 *
 * @param {object} [options={}] Dependência de leitura do catálogo.
 * @param {{ listCourses: Function }} [options.courseService=courseApi]
 * @returns {{ courses: ReadonlyArray<Readonly<object>>, isLoading: boolean,
 * errorMessage: string|null, reload: Function }} Estado da consulta.
 */
function useCourseCatalog({ courseService = courseApi } = {}) {
    if (!courseService || typeof courseService.listCourses !== 'function') {
        throw new TypeError(COURSE_CATALOG_MESSAGES.INVALID_SERVICE);
    }

    const [version, setVersion] = useState(0);
    const [result, setResult] = useState(null);
    const reload = useCallback(() => setVersion((current) => current + 1), []);

    useEffect(() => {
        let cancelled = false;

        async function load() {
            try {
                const received = await courseService.listCourses({});
                if (cancelled) return;
                const courses = prepareCourseCatalog(received);
                setResult({ courseService, version, courses, errorMessage: null });
            } catch (error) {
                if (cancelled) return;
                const errorMessage = error instanceof CourseApiError
                    && typeof error.message === 'string' && error.message.trim()
                    ? error.message : COURSE_CATALOG_MESSAGES.LOAD_ERROR;
                setResult({ courseService, version, courses: null, errorMessage });
            }
        }

        load();
        return () => { cancelled = true; };
    }, [courseService, version]);

    // Metadados da consulta impedem que um render entre a troca da fonte e o
    // início do efeito apresente cursos pertencentes à fonte anterior.
    const isCurrent = result !== null
        && result.courseService === courseService && result.version === version;

    return Object.freeze({
        courses: isCurrent && result.courses !== null ? result.courses : EMPTY_CATALOG,
        isLoading: !isCurrent,
        errorMessage: isCurrent ? result.errorMessage : null,
        reload,
    });
}

const EMPTY_CATALOG = Object.freeze([]);

export {
    COURSE_CATALOG_MESSAGES,
    prepareCourseCatalog,
    useCourseCatalog,
};
