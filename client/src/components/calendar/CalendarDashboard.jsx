import {
    useCallback,
    useEffect,
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
import {
    formatCivilDate,
    formatLessonRecord,
    resolveLessonMaterials,
} from './LessonMaterialManagement.jsx';

/**
 * Identificadores estáveis utilizados pelo painel geral.
 */
const CALENDAR_DASHBOARD_IDS = Object.freeze({
    TOTAL: 'calendar-dashboard-total',
    UPCOMING: 'calendar-dashboard-upcoming',
    REVIEW: 'calendar-dashboard-review',
    RESULTS: 'calendar-dashboard-results',
});

/**
 * Mensagens públicas e de configuração do painel.
 */
const CALENDAR_DASHBOARD_MESSAGES = Object.freeze({
    INVALID_LESSON_SERVICE:
        'O painel geral exige um serviço de consulta de aulas válido.',
    INVALID_MONTHLY_MATERIAL_SERVICE:
        'O painel geral exige um serviço de consulta mensal válido.',
    INVALID_TODAY_PROVIDER:
        'O painel geral exige um relógio civil válido.',
    INVALID_TODAY:
        'O relógio do painel devolveu uma data civil inválida.',
    LOADING: 'Carregando o painel geral...',
    UPCOMING_EMPTY: 'Nenhuma aula próxima',
    REVIEW_EMPTY: 'Nenhuma aula marcada para revisão',
    UNEXPECTED_ERROR:
        'Não foi possível carregar o painel agora. Tente novamente em instantes.',
});

const CALENDAR_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const UPCOMING_LESSON_LIMIT = 5;

/**
 * Obtém a data civil local utilizada pelo navegador.
 *
 * A montagem manual evita que a conversão para UTC altere o dia perto da
 * meia-noite em fusos diferentes.
 *
 * @returns {string} Data atual no formato YYYY-MM-DD.
 */
function defaultDashboardTodayProvider() {
    const today = new Date();
    const year = String(today.getFullYear()).padStart(4, '0');
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
}

/**
 * Confirma que o valor representa uma data civil existente.
 *
 * @param {unknown} value Data candidata.
 * @returns {boolean} Verdadeiro somente para uma data YYYY-MM-DD válida.
 */
function isValidDashboardDate(value) {
    if (
        typeof value !== 'string'
        || !CALENDAR_DATE_PATTERN.test(value)
    ) {
        return false;
    }

    const [year, month, day] = value.split('-').map(Number);
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

/**
 * Ordena registros por data civil e utiliza o identificador como desempate.
 *
 * @param {object} first Primeiro registro.
 * @param {object} second Segundo registro.
 * @returns {number} Resultado compatível com Array.prototype.sort().
 */
function compareLessons(first, second) {
    const dateComparison = first.date.localeCompare(second.date);

    return dateComparison !== 0
        ? dateComparison
        : first.id.localeCompare(second.id);
}

/**
 * Conta somente os cursos pertencentes ao contrato público.
 *
 * Cursos sem registros não são apresentados, reproduzindo o painel original.
 * A ordem pública permanece estável mesmo quando os documentos chegam em uma
 * ordem diferente.
 *
 * @param {ReadonlyArray<object>} lessons Aulas públicas.
 * @returns {ReadonlyArray<Readonly<object>>} Quantidades por curso.
 */
function createCourseBreakdown(lessons) {
    return Object.freeze(
        LESSON_API_COURSES
            .map((course) => Object.freeze({
                course,
                count: lessons.filter(
                    (lesson) => lesson.course === course,
                ).length,
            }))
            .filter((item) => item.count > 0),
    );
}

/**
 * Prepara uma fotografia imutável do painel a partir das duas APIs.
 *
 * As próximas aulas seguem exatamente o protótipo: data igual ou posterior a
 * hoje, ordem crescente e limite de cinco registros. A revisão não possui
 * corte por data e inclui todos os registros marcados.
 *
 * @param {ReadonlyArray<object>} lessons Aulas públicas.
 * @param {ReadonlyArray<object>} monthlyMaterials Materiais mensais públicos.
 * @param {Function} todayProvider Relógio civil injetável.
 * @returns {Readonly<object>} Estado preparado para apresentação.
 * @throws {TypeError} Quando o relógio devolve uma data inválida.
 */
function createCalendarDashboardData(
    lessons,
    monthlyMaterials,
    todayProvider,
) {
    const today = todayProvider();

    if (!isValidDashboardDate(today)) {
        throw new TypeError(
            CALENDAR_DASHBOARD_MESSAGES.INVALID_TODAY,
        );
    }

    const upcomingLessons = Object.freeze(
        lessons
            .filter((lesson) => lesson.date >= today)
            .sort(compareLessons)
            .slice(0, UPCOMING_LESSON_LIMIT),
    );
    const reviewLessons = Object.freeze(
        lessons
            .filter((lesson) => lesson.needsReview)
            .sort(compareLessons),
    );

    return Object.freeze({
        totalLessons: lessons.length,
        courseBreakdown: createCourseBreakdown(lessons),
        upcomingLessons,
        reviewLessons,
        monthlyMaterials,
    });
}

/**
 * Representa um único link de material ou sua ausência.
 *
 * @param {object} props Propriedades do link.
 * @param {string} props.label Texto público.
 * @param {string|null} props.url Endereço seguro validado pela API.
 * @returns {import('react').ReactElement} Link ou marcador de ausência.
 */
function DashboardMaterialLink({ label, url }) {
    if (url === null) {
        return null;
    }

    return (
        <a href={url} target="_blank" rel="noreferrer noopener">
            {label}
        </a>
    );
}

/**
 * Apresenta o registro da aula e a estrela prevista no protótipo.
 *
 * @param {object} props Propriedades da apresentação.
 * @param {object} props.lesson Aula pública.
 * @returns {import('react').ReactElement} Identificação visual do registro.
 */
function DashboardLessonRecord({ lesson }) {
    return (
        <span className="calendar-dashboard-record">
            {formatLessonRecord(lesson)}
            {lesson.needsReview && (
                <span
                    className="calendar-dashboard-review-star"
                    aria-label="Marcada para revisão"
                    title="Marcada para revisão"
                >
                    ★
                </span>
            )}
        </span>
    );
}

/**
 * Painel geral persistente do calendário.
 *
 * O componente consulta as duas fontes somente durante sua montagem. Aulas e
 * materiais são preparados juntos para que as próximas aulas apresentem os
 * mesmos links efetivos usados na seção de materiais.
 *
 * @param {object} props Dependências substituíveis.
 * @param {{ listLessons: Function }} [props.lessonService=lessonApi]
 * Serviço de consulta de aulas.
 * @param {{ listMonthlyMaterials: Function }}
 * [props.monthlyMaterialService=monthlyMaterialApi]
 * Serviço de consulta dos materiais mensais.
 * @param {Function} [props.todayProvider=defaultDashboardTodayProvider]
 * Relógio civil substituível nos testes.
 * @returns {import('react').ReactElement} Painel geral.
 */
function CalendarDashboard({
    lessonService = lessonApi,
    monthlyMaterialService = monthlyMaterialApi,
    todayProvider = defaultDashboardTodayProvider,
} = {}) {
    const isValidLessonService =
        lessonService !== null
        && typeof lessonService === 'object'
        && !Array.isArray(lessonService)
        && typeof lessonService.listLessons === 'function';

    if (!isValidLessonService) {
        throw new TypeError(
            CALENDAR_DASHBOARD_MESSAGES.INVALID_LESSON_SERVICE,
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
            CALENDAR_DASHBOARD_MESSAGES
                .INVALID_MONTHLY_MATERIAL_SERVICE,
        );
    }

    if (typeof todayProvider !== 'function') {
        throw new TypeError(
            CALENDAR_DASHBOARD_MESSAGES.INVALID_TODAY_PROVIDER,
        );
    }

    const [dashboardData, setDashboardData] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [errorMessage, setErrorMessage] = useState(null);
    const requestSequence = useRef(0);

    const loadDashboard = useCallback(async () => {
        const requestId = requestSequence.current + 1;

        requestSequence.current = requestId;
        setIsLoading(true);
        setErrorMessage(null);

        try {
            const [lessons, monthlyMaterials] = await Promise.all([
                lessonService.listLessons({}),
                monthlyMaterialService.listMonthlyMaterials(),
            ]);
            const preparedDashboard = createCalendarDashboardData(
                lessons,
                monthlyMaterials,
                todayProvider,
            );

            if (requestSequence.current === requestId) {
                setDashboardData(preparedDashboard);
            }
        } catch (error) {
            if (requestSequence.current === requestId) {
                const isPublicError =
                    error instanceof LessonApiError
                    || error instanceof MonthlyMaterialApiError;

                setErrorMessage(
                    isPublicError
                        ? error.message
                        : CALENDAR_DASHBOARD_MESSAGES
                            .UNEXPECTED_ERROR,
                );
            }
        } finally {
            if (requestSequence.current === requestId) {
                setIsLoading(false);
            }
        }
    }, [lessonService, monthlyMaterialService, todayProvider]);

    useEffect(() => {
        loadDashboard();

        return () => {
            requestSequence.current += 1;
        };
    }, [loadDashboard]);

    return (
        <div
            id={CALENDAR_DASHBOARD_IDS.RESULTS}
            className="calendar-dashboard"
            aria-live="polite"
            aria-busy={isLoading}
        >
            {isLoading && (
                <section className="calendar-content-section">
                    <p className="calendar-empty-state" role="status">
                        {CALENDAR_DASHBOARD_MESSAGES.LOADING}
                    </p>
                </section>
            )}

            {!isLoading && errorMessage && (
                <section className="calendar-content-section">
                    <div className="calendar-dashboard-error">
                        <p role="alert">{errorMessage}</p>
                        <button type="button" onClick={loadDashboard}>
                            Tentar novamente
                        </button>
                    </div>
                </section>
            )}

            {!isLoading && !errorMessage && dashboardData && (
                <>
                    <section
                        className="calendar-stat-card"
                        aria-labelledby={CALENDAR_DASHBOARD_IDS.TOTAL}
                    >
                        <h2 id={CALENDAR_DASHBOARD_IDS.TOTAL}>
                            Total de aulas registradas
                        </h2>

                        <output
                            className="calendar-stat-number"
                            aria-label={
                                'Total de aulas registradas: '
                                + dashboardData.totalLessons
                            }
                        >
                            {dashboardData.totalLessons}
                        </output>

                        {dashboardData.courseBreakdown.length > 0 && (
                            <ul
                                className="calendar-course-breakdown"
                                aria-label="Quantidade por curso"
                            >
                                {dashboardData.courseBreakdown.map((item) => (
                                    <li key={item.course}>
                                        {item.course}: {item.count}
                                    </li>
                                ))}
                            </ul>
                        )}
                    </section>

                    <section
                        className="calendar-content-section"
                        aria-labelledby={CALENDAR_DASHBOARD_IDS.UPCOMING}
                    >
                        <h2 id={CALENDAR_DASHBOARD_IDS.UPCOMING}>
                            Próximas aulas
                        </h2>

                        {dashboardData.upcomingLessons.length === 0
                            ? (
                                <p className="calendar-empty-state">
                                    {
                                        CALENDAR_DASHBOARD_MESSAGES
                                            .UPCOMING_EMPTY
                                    }
                                </p>
                            )
                            : (
                                <div className="calendar-dashboard-table-wrapper">
                                    <table className="calendar-dashboard-table">
                                        <caption className="visually-hidden">
                                            Próximas cinco aulas
                                        </caption>
                                        <thead>
                                            <tr>
                                                <th scope="col">Data</th>
                                                <th scope="col">Curso</th>
                                                <th scope="col">UC</th>
                                                <th scope="col">Registro</th>
                                                <th scope="col">Materiais</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {dashboardData.upcomingLessons
                                                .map((lesson) => {
                                                    const materials =
                                                        resolveLessonMaterials(
                                                            lesson,
                                                            dashboardData
                                                                .monthlyMaterials,
                                                        );
                                                    const hasMaterials =
                                                        materials.lessonPlanUrl
                                                            !== null
                                                        || materials
                                                            .studentGuideUrl
                                                            !== null;

                                                    return (
                                                        <tr key={lesson.id}>
                                                            <td>
                                                                <time
                                                                    dateTime={lesson.date}
                                                                >
                                                                    {
                                                                        formatCivilDate(
                                                                            lesson.date,
                                                                        )
                                                                    }
                                                                </time>
                                                            </td>
                                                            <td>
                                                                {lesson.course}
                                                            </td>
                                                            <td>
                                                                {
                                                                    lesson
                                                                        .curricularUnit
                                                                }
                                                            </td>
                                                            <td>
                                                                <DashboardLessonRecord
                                                                    lesson={lesson}
                                                                />
                                                            </td>
                                                            <td>
                                                                <span className="calendar-dashboard-materials">
                                                                    <DashboardMaterialLink
                                                                        label="PA"
                                                                        url={
                                                                            materials
                                                                                .lessonPlanUrl
                                                                        }
                                                                    />
                                                                    <DashboardMaterialLink
                                                                        label="GD+AD"
                                                                        url={
                                                                            materials
                                                                                .studentGuideUrl
                                                                        }
                                                                    />
                                                                    {!hasMaterials && '—'}
                                                                </span>
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                    </section>

                    <section
                        className="calendar-content-section"
                        aria-labelledby={CALENDAR_DASHBOARD_IDS.REVIEW}
                    >
                        <h2 id={CALENDAR_DASHBOARD_IDS.REVIEW}>
                            Aulas marcadas para revisão
                        </h2>

                        {dashboardData.reviewLessons.length === 0
                            ? (
                                <p className="calendar-empty-state">
                                    {
                                        CALENDAR_DASHBOARD_MESSAGES
                                            .REVIEW_EMPTY
                                    }
                                </p>
                            )
                            : (
                                <div className="calendar-dashboard-table-wrapper">
                                    <table className="calendar-dashboard-table">
                                        <caption className="visually-hidden">
                                            Aulas marcadas para revisão
                                        </caption>
                                        <thead>
                                            <tr>
                                                <th scope="col">Data</th>
                                                <th scope="col">Curso</th>
                                                <th scope="col">UC</th>
                                                <th scope="col">Registro</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {dashboardData.reviewLessons
                                                .map((lesson) => (
                                                    <tr key={lesson.id}>
                                                        <td>
                                                            <time
                                                                dateTime={lesson.date}
                                                            >
                                                                {
                                                                    formatCivilDate(
                                                                        lesson.date,
                                                                    )
                                                                }
                                                            </time>
                                                        </td>
                                                        <td>{lesson.course}</td>
                                                        <td>
                                                            {
                                                                lesson
                                                                    .curricularUnit
                                                            }
                                                        </td>
                                                        <td>
                                                            <DashboardLessonRecord
                                                                lesson={lesson}
                                                            />
                                                        </td>
                                                    </tr>
                                                ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                    </section>
                </>
            )}
        </div>
    );
}

export {
    CALENDAR_DASHBOARD_IDS,
    CALENDAR_DASHBOARD_MESSAGES,
    UPCOMING_LESSON_LIMIT,
    CalendarDashboard,
    compareLessons,
    createCalendarDashboardData,
    createCourseBreakdown,
    defaultDashboardTodayProvider,
    isValidDashboardDate,
};
