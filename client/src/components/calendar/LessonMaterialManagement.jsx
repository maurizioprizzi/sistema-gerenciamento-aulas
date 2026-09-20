import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';

import {
    LESSON_API_COURSES,
    LessonApiError,
    lessonApi,
} from '../../services/LessonApi.js';
import {
    MonthlyMaterialApiError,
    monthlyMaterialApi,
} from '../../services/MonthlyMaterialApi.js';
import { formatCalendarMonth } from './MonthlyMaterialManagement.jsx';

const LESSON_MATERIAL_MANAGEMENT_IDS = Object.freeze({
    TITLE: 'lesson-material-management-title',
    RESULTS: 'lesson-material-management-results',
});

const LESSON_MATERIAL_MANAGEMENT_MESSAGES = Object.freeze({
    INVALID_LESSON_SERVICE:
        'Os materiais por aula exigem um serviço de consulta de aulas válido.',
    INVALID_MONTHLY_MATERIAL_SERVICE:
        'Os materiais por aula exigem um serviço de consulta mensal válido.',
    INVALID_TODAY_PROVIDER:
        'Os materiais por aula exigem um relógio civil válido.',
    INVALID_REFRESH_KEY:
        'A atualização dos materiais por aula deve ser um número inteiro não negativo.',
    INVALID_TODAY:
        'O relógio devolveu uma data civil inválida.',
    LOADING: 'Carregando materiais das aulas...',
    EMPTY: 'Nenhuma aula encontrada.',
    UNEXPECTED_ERROR:
        'Não foi possível consultar os materiais agora. Tente novamente em instantes.',
});

const EMPTY_MATERIAL_FILTERS = Object.freeze({
    course: '',
    month: '',
    fromToday: false,
});

const CALENDAR_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function defaultTodayProvider() {
    return new Date().toISOString().slice(0, 10);
}

function isValidCivilDate(date) {
    if (
        typeof date !== 'string'
        || !CALENDAR_DATE_PATTERN.test(date)
    ) {
        return false;
    }

    const [year, month, day] = date.split('-').map(Number);
    const parsedDate = new Date(0);

    parsedDate.setUTCHours(0, 0, 0, 0);
    parsedDate.setUTCFullYear(year, month - 1, day);

    return (
        year >= 1
        && parsedDate.getUTCFullYear() === year
        && parsedDate.getUTCMonth() === month - 1
        && parsedDate.getUTCDate() === day
    );
}

function createEmptyMaterialFilters() {
    return { ...EMPTY_MATERIAL_FILTERS };
}

function createAvailableMonths(lessons) {
    return Object.freeze(
        [...new Set(lessons.map((lesson) => lesson.date.slice(0, 7)))]
            .sort((first, second) => second.localeCompare(first)),
    );
}

function filterMaterialLessons(lessons, filters, todayProvider) {
    let today = null;

    if (filters.fromToday) {
        today = todayProvider();

        if (!isValidCivilDate(today)) {
            throw new TypeError(
                LESSON_MATERIAL_MANAGEMENT_MESSAGES.INVALID_TODAY,
            );
        }
    }

    return Object.freeze(
        lessons.filter((lesson) => (
            (filters.course.length === 0
                || lesson.course === filters.course)
            && (filters.month.length === 0
                || lesson.date.startsWith(filters.month))
            && (!filters.fromToday || lesson.date >= today)
        )),
    );
}

function resolveLessonMaterials(lesson, monthlyMaterials) {
    const hasSpecificMaterial =
        lesson.lessonPlanUrl !== null
        || lesson.studentGuideUrl !== null;

    if (hasSpecificMaterial) {
        return Object.freeze({
            lessonPlanUrl: lesson.lessonPlanUrl,
            studentGuideUrl: lesson.studentGuideUrl,
        });
    }

    const month = lesson.date.slice(0, 7);
    const monthlyMaterial = monthlyMaterials.find(
        (material) => material.month === month,
    );

    return Object.freeze({
        lessonPlanUrl: monthlyMaterial?.lessonPlanUrl ?? null,
        studentGuideUrl: monthlyMaterial?.studentGuideUrl ?? null,
    });
}

function formatCivilDate(date) {
    const [year, month, day] = date.split('-');

    return `${day}/${month}/${year}`;
}

function formatLessonRecord(lesson) {
    if (lesson.type === 'Aula') {
        return lesson.lessonNumber
            ? `Aula ${lesson.lessonNumber}`
            : 'Aula';
    }

    return lesson.lessonNumber
        ? `${lesson.type} Aula ${lesson.lessonNumber}`
        : lesson.type;
}

function MaterialLink({ label, url }) {
    if (url === null) {
        return <span aria-label={`${label}: não informado`}>—</span>;
    }

    return (
        <a href={url} target="_blank" rel="noreferrer noopener">
            {label}
        </a>
    );
}

/**
 * Consulta todas as aulas e representa seus materiais próprios ou mensais.
 */
function LessonMaterialManagement({
    lessonService = lessonApi,
    monthlyMaterialService = monthlyMaterialApi,
    todayProvider = defaultTodayProvider,
    refreshKey = 0,
} = {}) {
    const isValidLessonService =
        lessonService !== null
        && typeof lessonService === 'object'
        && !Array.isArray(lessonService)
        && typeof lessonService.listLessons === 'function';

    if (!isValidLessonService) {
        throw new TypeError(
            LESSON_MATERIAL_MANAGEMENT_MESSAGES.INVALID_LESSON_SERVICE,
        );
    }

    const isValidMonthlyMaterialService =
        monthlyMaterialService !== null
        && typeof monthlyMaterialService === 'object'
        && !Array.isArray(monthlyMaterialService)
        && typeof monthlyMaterialService.listMonthlyMaterials
            === 'function';

    if (!isValidMonthlyMaterialService) {
        throw new TypeError(
            LESSON_MATERIAL_MANAGEMENT_MESSAGES
                .INVALID_MONTHLY_MATERIAL_SERVICE,
        );
    }

    if (typeof todayProvider !== 'function') {
        throw new TypeError(
            LESSON_MATERIAL_MANAGEMENT_MESSAGES
                .INVALID_TODAY_PROVIDER,
        );
    }

    if (!Number.isInteger(refreshKey) || refreshKey < 0) {
        throw new TypeError(
            LESSON_MATERIAL_MANAGEMENT_MESSAGES.INVALID_REFRESH_KEY,
        );
    }

    const [filters, setFilters] = useState(createEmptyMaterialFilters);
    const [lessons, setLessons] = useState(() => Object.freeze([]));
    const [monthlyMaterials, setMonthlyMaterials] = useState(
        () => Object.freeze([]),
    );
    const [isLoading, setIsLoading] = useState(true);
    const [errorMessage, setErrorMessage] = useState(null);
    const requestSequence = useRef(0);

    const loadMaterials = useCallback(async () => {
        const requestId = requestSequence.current + 1;

        requestSequence.current = requestId;
        setIsLoading(true);
        setErrorMessage(null);

        try {
            const [receivedLessons, receivedMonthlyMaterials] =
                await Promise.all([
                    lessonService.listLessons({}),
                    monthlyMaterialService.listMonthlyMaterials(),
                ]);

            if (requestSequence.current === requestId) {
                setLessons(receivedLessons);
                setMonthlyMaterials(receivedMonthlyMaterials);
            }
        } catch (error) {
            if (requestSequence.current === requestId) {
                const isPublicError =
                    error instanceof LessonApiError
                    || error instanceof MonthlyMaterialApiError;

                setErrorMessage(
                    isPublicError
                        ? error.message
                        : LESSON_MATERIAL_MANAGEMENT_MESSAGES
                            .UNEXPECTED_ERROR,
                );
            }
        } finally {
            if (requestSequence.current === requestId) {
                setIsLoading(false);
            }
        }
    }, [lessonService, monthlyMaterialService]);

    useEffect(() => {
        loadMaterials();

        return () => {
            requestSequence.current += 1;
        };
    }, [loadMaterials, refreshKey]);

    const availableMonths = useMemo(
        () => createAvailableMonths(lessons),
        [lessons],
    );
    const filteredLessons = useMemo(
        () => filterMaterialLessons(lessons, filters, todayProvider),
        [filters, lessons, todayProvider],
    );

    function handleFilterChange(event) {
        const { name, type, value, checked } = event.target;

        setFilters((currentFilters) => ({
            ...currentFilters,
            [name]: type === 'checkbox' ? checked : value,
        }));
    }

    return (
        <section
            className="lesson-material-management calendar-content-section"
            aria-labelledby={LESSON_MATERIAL_MANAGEMENT_IDS.TITLE}
        >
            <div className="lesson-material-management-heading">
                <h2 id={LESSON_MATERIAL_MANAGEMENT_IDS.TITLE}>
                    Por aula (data específica)
                </h2>
                <p>Consulte os links aplicáveis a cada data específica.</p>
            </div>

            <div
                className="lesson-material-filters"
                aria-label="Filtros dos materiais por aula"
                role="group"
            >
                <div className="lesson-material-field">
                    <label htmlFor="lesson-material-course">Curso</label>
                    <select
                        id="lesson-material-course"
                        name="course"
                        value={filters.course}
                        disabled={isLoading}
                        onChange={handleFilterChange}
                    >
                        <option value="">Todos os cursos</option>
                        {LESSON_API_COURSES.map((course) => (
                            <option key={course} value={course}>
                                {course}
                            </option>
                        ))}
                    </select>
                </div>

                <div className="lesson-material-field">
                    <label htmlFor="lesson-material-month">Mês</label>
                    <select
                        id="lesson-material-month"
                        name="month"
                        value={filters.month}
                        disabled={isLoading}
                        onChange={handleFilterChange}
                    >
                        <option value="">Todos os meses</option>
                        {availableMonths.map((month) => (
                            <option key={month} value={month}>
                                {formatCalendarMonth(month)}
                            </option>
                        ))}
                    </select>
                </div>

                <label className="lesson-material-checkbox">
                    <input
                        name="fromToday"
                        type="checkbox"
                        checked={filters.fromToday}
                        disabled={isLoading}
                        onChange={handleFilterChange}
                    />
                    <span>Mostrar a partir de hoje</span>
                </label>
            </div>

            <div
                id={LESSON_MATERIAL_MANAGEMENT_IDS.RESULTS}
                className="lesson-material-results"
                aria-live="polite"
                aria-busy={isLoading}
            >
                {isLoading && (
                    <p className="calendar-empty-state" role="status">
                        {LESSON_MATERIAL_MANAGEMENT_MESSAGES.LOADING}
                    </p>
                )}

                {!isLoading && errorMessage && (
                    <div className="lesson-material-error">
                        <p role="alert">{errorMessage}</p>
                        <button type="button" onClick={loadMaterials}>
                            Tentar novamente
                        </button>
                    </div>
                )}

                {!isLoading && !errorMessage
                    && filteredLessons.length === 0 && (
                    <p className="calendar-empty-state">
                        {LESSON_MATERIAL_MANAGEMENT_MESSAGES.EMPTY}
                    </p>
                )}

                {!isLoading && !errorMessage
                    && filteredLessons.length > 0 && (
                    <div className="lesson-material-table-wrapper">
                        <table className="lesson-material-table">
                            <caption className="visually-hidden">
                                Materiais aplicáveis a cada aula
                            </caption>
                            <thead>
                                <tr>
                                    <th scope="col">Data</th>
                                    <th scope="col">Curso</th>
                                    <th scope="col">UC</th>
                                    <th scope="col">Aula</th>
                                    <th scope="col">Link do PA</th>
                                    <th scope="col">Link do GD + AD</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredLessons.map((lesson) => {
                                    const material = resolveLessonMaterials(
                                        lesson,
                                        monthlyMaterials,
                                    );

                                    return (
                                        <tr key={lesson.id}>
                                            <td>
                                                <time dateTime={lesson.date}>
                                                    {formatCivilDate(
                                                        lesson.date,
                                                    )}
                                                </time>
                                            </td>
                                            <td>{lesson.course}</td>
                                            <td>{lesson.curricularUnit}</td>
                                            <td>{formatLessonRecord(lesson)}</td>
                                            <td>
                                                <MaterialLink
                                                    label="Abrir PA"
                                                    url={material.lessonPlanUrl}
                                                />
                                            </td>
                                            <td>
                                                <MaterialLink
                                                    label="Abrir GD+AD"
                                                    url={material.studentGuideUrl}
                                                />
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </section>
    );
}

export {
    EMPTY_MATERIAL_FILTERS,
    LESSON_MATERIAL_MANAGEMENT_IDS,
    LESSON_MATERIAL_MANAGEMENT_MESSAGES,
    LessonMaterialManagement,
    createAvailableMonths,
    createEmptyMaterialFilters,
    defaultTodayProvider,
    filterMaterialLessons,
    formatCivilDate,
    formatLessonRecord,
    resolveLessonMaterials,
};
