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
import {
    formatCivilDate,
    formatLessonRecord,
    resolveLessonMaterials,
} from './LessonMaterialManagement.jsx';

/**
 * Identificadores estáveis utilizados pela grade e pelo diálogo de detalhes.
 */
const CALENDAR_VISUAL_IDS = Object.freeze({
    TITLE: 'calendar-visual-title',
    RESULTS: 'calendar-visual-results',
    COURSE_FILTER: 'calendar-visual-course-filter',
    DETAILS_TITLE: 'calendar-visual-details-title',
    DETAILS_DESCRIPTION: 'calendar-visual-details-description',
});

/**
 * Mensagens públicas e erros de configuração do calendário visual.
 */
const CALENDAR_VISUAL_MESSAGES = Object.freeze({
    INVALID_LESSON_SERVICE:
        'O calendário visual exige um serviço de consulta de aulas válido.',
    INVALID_MONTHLY_MATERIAL_SERVICE:
        'O calendário visual exige um serviço de consulta mensal válido.',
    INVALID_TODAY_PROVIDER:
        'O calendário visual exige um relógio civil válido.',
    INVALID_TODAY:
        'O relógio do calendário visual devolveu uma data civil inválida.',
    INVALID_PERIOD:
        'O período do calendário visual é inválido.',
    INVALID_DIRECTION:
        'A navegação do calendário visual exige uma direção válida.',
    INVALID_LESSONS:
        'As aulas do calendário visual devem formar uma lista.',
    INVALID_COURSE:
        'O filtro de curso do calendário visual é inválido.',
    LOADING: 'Carregando o calendário visual...',
    UNEXPECTED_ERROR:
        'Não foi possível carregar o calendário agora. Tente novamente em instantes.',
});

const CALENDAR_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Nomes e cabeçalhos mantidos na mesma ordem do protótipo original.
 */
const CALENDAR_MONTH_NAMES = Object.freeze([
    'Janeiro',
    'Fevereiro',
    'Março',
    'Abril',
    'Maio',
    'Junho',
    'Julho',
    'Agosto',
    'Setembro',
    'Outubro',
    'Novembro',
    'Dezembro',
]);

const CALENDAR_WEEKDAYS = Object.freeze([
    'Dom',
    'Seg',
    'Ter',
    'Qua',
    'Qui',
    'Sex',
    'Sáb',
]);

/**
 * Monta a data atual com valores locais, sem conversão para UTC.
 *
 * @returns {string} Data civil local no formato YYYY-MM-DD.
 */
function defaultCalendarTodayProvider() {
    const today = new Date();
    const year = String(today.getFullYear()).padStart(4, '0');
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
}

/**
 * Confirma que uma data textual representa um dia civil existente.
 *
 * @param {unknown} value Data candidata.
 * @returns {boolean} Verdadeiro somente para uma data civil válida.
 */
function isValidCalendarVisualDate(value) {
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
 * Constrói uma data local preservando integralmente o ano recebido.
 *
 * O construtor direto de Date interpreta anos entre zero e 99 como anos do
 * século XX. setFullYear() evita essa regra histórica e mantém o calendário
 * civil correto para todo o intervalo aceito pelo contrato.
 *
 * @param {number} year Ano civil.
 * @param {number} month Índice do mês entre zero e onze.
 * @param {number} day Dia, inclusive zero para o último dia do mês anterior.
 * @returns {Date} Data local preparada.
 */
function createLocalCalendarDate(year, month, day) {
    const date = new Date(0);

    date.setHours(0, 0, 0, 0);
    date.setFullYear(year, month, day);

    return date;
}

/**
 * Valida o relógio e devolve sua data civil.
 *
 * @param {Function} todayProvider Relógio injetável.
 * @returns {string} Data civil validada.
 * @throws {TypeError} Quando o relógio devolve uma data inválida.
 */
function readCalendarToday(todayProvider) {
    const today = todayProvider();

    if (!isValidCalendarVisualDate(today)) {
        throw new TypeError(CALENDAR_VISUAL_MESSAGES.INVALID_TODAY);
    }

    return today;
}

/**
 * Cria um período mensal imutável a partir de uma data civil.
 *
 * @param {string} date Data no formato YYYY-MM-DD.
 * @returns {Readonly<{year: number, month: number}>} Ano e índice do mês.
 */
function createCalendarPeriodFromDate(date) {
    if (!isValidCalendarVisualDate(date)) {
        throw new TypeError(CALENDAR_VISUAL_MESSAGES.INVALID_TODAY);
    }

    return Object.freeze({
        year: Number(date.slice(0, 4)),
        month: Number(date.slice(5, 7)) - 1,
    });
}

/**
 * Confirma o formato interno utilizado para navegar entre meses.
 *
 * @param {unknown} period Período candidato.
 * @returns {boolean} Verdadeiro para ano positivo e mês entre zero e onze.
 */
function isValidCalendarPeriod(period) {
    return (
        period !== null
        && typeof period === 'object'
        && !Array.isArray(period)
        && Number.isInteger(period.year)
        && period.year >= 1
        && Number.isInteger(period.month)
        && period.month >= 0
        && period.month <= 11
    );
}

/**
 * Move o período em um mês, inclusive na passagem entre anos.
 *
 * @param {unknown} period Período atual.
 * @param {unknown} direction -1 para anterior ou 1 para próximo.
 * @returns {Readonly<{year: number, month: number}>} Novo período.
 */
function shiftCalendarPeriod(period, direction) {
    if (!isValidCalendarPeriod(period)) {
        throw new TypeError(CALENDAR_VISUAL_MESSAGES.INVALID_PERIOD);
    }

    if (direction !== -1 && direction !== 1) {
        throw new TypeError(CALENDAR_VISUAL_MESSAGES.INVALID_DIRECTION);
    }

    let year = period.year;
    let month = period.month + direction;

    if (month > 11) {
        year += 1;
        month = 0;
    } else if (month < 0) {
        year -= 1;
        month = 11;
    }

    if (year < 1) {
        throw new TypeError(CALENDAR_VISUAL_MESSAGES.INVALID_PERIOD);
    }

    return Object.freeze({ year, month });
}

/**
 * Apresenta o título mensal com a capitalização do protótipo.
 *
 * @param {unknown} period Período interno.
 * @returns {string} Mês e ano para o cabeçalho.
 */
function formatCalendarPeriod(period) {
    if (!isValidCalendarPeriod(period)) {
        throw new TypeError(CALENDAR_VISUAL_MESSAGES.INVALID_PERIOD);
    }

    return `${CALENDAR_MONTH_NAMES[period.month]} ${period.year}`;
}

/**
 * Prepara as células da grade mensal.
 *
 * A semana começa no domingo, como no HTML original. Somente células vazias
 * anteriores ao primeiro dia são criadas; o protótipo não completava a última
 * semana com células posteriores ao fim do mês.
 *
 * @param {unknown} period Período exibido.
 * @param {unknown} lessons Aulas públicas recebidas da API.
 * @param {unknown} course Curso selecionado ou texto vazio.
 * @param {unknown} today Data civil usada para destacar o dia atual.
 * @returns {ReadonlyArray<Readonly<object>>} Células vazias e dias do mês.
 */
function createCalendarCells(period, lessons, course, today) {
    if (!isValidCalendarPeriod(period)) {
        throw new TypeError(CALENDAR_VISUAL_MESSAGES.INVALID_PERIOD);
    }

    if (!Array.isArray(lessons)) {
        throw new TypeError(CALENDAR_VISUAL_MESSAGES.INVALID_LESSONS);
    }

    if (
        typeof course !== 'string'
        || (course.length > 0 && !LESSON_API_COURSES.includes(course))
    ) {
        throw new TypeError(CALENDAR_VISUAL_MESSAGES.INVALID_COURSE);
    }

    if (!isValidCalendarVisualDate(today)) {
        throw new TypeError(CALENDAR_VISUAL_MESSAGES.INVALID_TODAY);
    }

    const firstWeekday = createLocalCalendarDate(
        period.year,
        period.month,
        1,
    ).getDay();
    const totalDays = createLocalCalendarDate(
        period.year,
        period.month + 1,
        0,
    ).getDate();
    const monthPrefix = [
        String(period.year).padStart(4, '0'),
        String(period.month + 1).padStart(2, '0'),
    ].join('-');
    const lessonsByDay = new Map();

    lessons
        .filter((lesson) => (
            lesson.date.startsWith(`${monthPrefix}-`)
            && (course.length === 0 || lesson.course === course)
        ))
        .forEach((lesson) => {
            const day = Number(lesson.date.slice(8, 10));
            const currentLessons = lessonsByDay.get(day) ?? [];

            lessonsByDay.set(day, [...currentLessons, lesson]);
        });

    const cells = Array.from(
        { length: firstWeekday },
        (_, index) => Object.freeze({
            key: `empty-${index}`,
            isEmpty: true,
        }),
    );

    for (let day = 1; day <= totalDays; day += 1) {
        const date = `${monthPrefix}-${String(day).padStart(2, '0')}`;
        const weekday = createLocalCalendarDate(
            period.year,
            period.month,
            day,
        ).getDay();

        cells.push(Object.freeze({
            key: date,
            isEmpty: false,
            date,
            day,
            weekday,
            isToday: date === today,
            isWeekend: weekday === 0 || weekday === 6,
            lessons: Object.freeze(lessonsByDay.get(day) ?? []),
        }));
    }

    return Object.freeze(cells);
}

/**
 * Link apresentado no diálogo de detalhes.
 *
 * @param {object} props Propriedades do link.
 * @param {string} props.label Nome público do material.
 * @param {string|null} props.url Endereço validado pela API.
 * @returns {import('react').ReactElement|null} Link externo ou ausência.
 */
function CalendarDetailLink({ label, url }) {
    if (url === null) {
        return null;
    }

    return (
        <li>
            <a href={url} target="_blank" rel="noreferrer noopener">
                {label}
            </a>
        </li>
    );
}

/**
 * Diálogo acessível que substitui o alert() bloqueante do protótipo.
 *
 * @param {object} props Propriedades do diálogo.
 * @param {object} props.lesson Aula selecionada.
 * @param {ReadonlyArray<object>} props.monthlyMaterials Materiais mensais.
 * @param {Function} props.onClose Solicitação de fechamento.
 * @returns {import('react').ReactElement} Detalhes públicos da aula.
 */
function CalendarLessonDetails({
    lesson,
    monthlyMaterials,
    onClose,
}) {
    const materials = resolveLessonMaterials(
        lesson,
        monthlyMaterials,
    );
    const hasMaterials =
        materials.lessonPlanUrl !== null
        || materials.studentGuideUrl !== null;

    return (
        <div className="calendar-visual-dialog-backdrop">
            <section
                className="calendar-visual-dialog"
                role="dialog"
                aria-modal="true"
                aria-labelledby={CALENDAR_VISUAL_IDS.DETAILS_TITLE}
                aria-describedby={CALENDAR_VISUAL_IDS.DETAILS_DESCRIPTION}
            >
                <div className="calendar-visual-dialog-heading">
                    <h3 id={CALENDAR_VISUAL_IDS.DETAILS_TITLE}>
                        Detalhes da aula
                    </h3>
                    <button
                        type="button"
                        aria-label="Fechar detalhes da aula"
                        onClick={onClose}
                    >
                        ×
                    </button>
                </div>

                <dl id={CALENDAR_VISUAL_IDS.DETAILS_DESCRIPTION}>
                    <div>
                        <dt>Data</dt>
                        <dd>
                            <time dateTime={lesson.date}>
                                {formatCivilDate(lesson.date)}
                            </time>
                        </dd>
                    </div>
                    <div>
                        <dt>Curso</dt>
                        <dd>{lesson.course}</dd>
                    </div>
                    <div>
                        <dt>Unidade curricular</dt>
                        <dd>{lesson.curricularUnit}</dd>
                    </div>
                    <div>
                        <dt>Registro</dt>
                        <dd>{formatLessonRecord(lesson)}</dd>
                    </div>
                    {lesson.needsReview && (
                        <div>
                            <dt>Revisão</dt>
                            <dd>Marcada para revisão</dd>
                        </div>
                    )}
                </dl>

                <div className="calendar-visual-dialog-materials">
                    <h4>Materiais</h4>
                    {hasMaterials
                        ? (
                            <ul>
                                <CalendarDetailLink
                                    label="PA"
                                    url={materials.lessonPlanUrl}
                                />
                                <CalendarDetailLink
                                    label="GD+AD"
                                    url={materials.studentGuideUrl}
                                />
                            </ul>
                        )
                        : <p>Nenhum material informado.</p>}
                </div>
            </section>
        </div>
    );
}

/**
 * Calendário mensal persistente correspondente à quarta seção do protótipo.
 *
 * As duas fontes são consultadas uma vez durante a montagem. Mudanças de mês
 * e curso são inteiramente locais e não provocam novas requisições.
 *
 * @param {object} props Dependências substituíveis.
 * @param {{listLessons: Function}} [props.lessonService=lessonApi]
 * Serviço de consulta de aulas.
 * @param {{listMonthlyMaterials: Function}}
 * [props.monthlyMaterialService=monthlyMaterialApi]
 * Serviço de consulta dos materiais mensais.
 * @param {Function} [props.todayProvider=defaultCalendarTodayProvider]
 * Relógio civil substituível nos testes.
 * @returns {import('react').ReactElement} Calendário visual mensal.
 */
function CalendarVisual({
    lessonService = lessonApi,
    monthlyMaterialService = monthlyMaterialApi,
    todayProvider = defaultCalendarTodayProvider,
} = {}) {
    const isValidLessonService =
        lessonService !== null
        && typeof lessonService === 'object'
        && !Array.isArray(lessonService)
        && typeof lessonService.listLessons === 'function';

    if (!isValidLessonService) {
        throw new TypeError(
            CALENDAR_VISUAL_MESSAGES.INVALID_LESSON_SERVICE,
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
            CALENDAR_VISUAL_MESSAGES
                .INVALID_MONTHLY_MATERIAL_SERVICE,
        );
    }

    if (typeof todayProvider !== 'function') {
        throw new TypeError(
            CALENDAR_VISUAL_MESSAGES.INVALID_TODAY_PROVIDER,
        );
    }

    const initialToday = useRef(null);

    if (initialToday.current === null) {
        initialToday.current = readCalendarToday(todayProvider);
    }

    const [today, setToday] = useState(initialToday.current);
    const [period, setPeriod] = useState(
        () => createCalendarPeriodFromDate(initialToday.current),
    );
    const [course, setCourse] = useState('');
    const [lessons, setLessons] = useState(() => Object.freeze([]));
    const [monthlyMaterials, setMonthlyMaterials] = useState(
        () => Object.freeze([]),
    );
    const [selectedLesson, setSelectedLesson] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [errorMessage, setErrorMessage] = useState(null);
    const requestSequence = useRef(0);

    const loadCalendar = useCallback(async () => {
        const requestId = requestSequence.current + 1;

        requestSequence.current = requestId;
        setIsLoading(true);
        setErrorMessage(null);
        setSelectedLesson(null);

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
                        : CALENDAR_VISUAL_MESSAGES.UNEXPECTED_ERROR,
                );
            }
        } finally {
            if (requestSequence.current === requestId) {
                setIsLoading(false);
            }
        }
    }, [lessonService, monthlyMaterialService]);

    useEffect(() => {
        loadCalendar();

        return () => {
            requestSequence.current += 1;
        };
    }, [loadCalendar]);

    const cells = useMemo(
        () => createCalendarCells(
            period,
            lessons,
            course,
            today,
        ),
        [course, lessons, period, today],
    );

    function moveMonth(direction) {
        setSelectedLesson(null);
        setPeriod((currentPeriod) => shiftCalendarPeriod(
            currentPeriod,
            direction,
        ));
    }

    function goToToday() {
        const currentToday = readCalendarToday(todayProvider);

        setSelectedLesson(null);
        setToday(currentToday);
        setPeriod(createCalendarPeriodFromDate(currentToday));
    }

    function handleCourseChange(event) {
        setSelectedLesson(null);
        setCourse(event.target.value);
    }

    return (
        <section
            className="calendar-visual calendar-content-section"
            aria-labelledby={CALENDAR_VISUAL_IDS.TITLE}
        >
            <h2 id={CALENDAR_VISUAL_IDS.TITLE}>
                Calendário Visual
            </h2>

            <div className="calendar-visual-filter">
                <label htmlFor={CALENDAR_VISUAL_IDS.COURSE_FILTER}>
                    Curso
                </label>
                <select
                    id={CALENDAR_VISUAL_IDS.COURSE_FILTER}
                    value={course}
                    disabled={isLoading}
                    onChange={handleCourseChange}
                >
                    <option value="">Todos os cursos</option>
                    {LESSON_API_COURSES.map((availableCourse) => (
                        <option
                            key={availableCourse}
                            value={availableCourse}
                        >
                            {availableCourse}
                        </option>
                    ))}
                </select>
            </div>

            <div
                id={CALENDAR_VISUAL_IDS.RESULTS}
                className="calendar-visual-results"
                aria-live="polite"
                aria-busy={isLoading}
            >
                {isLoading && (
                    <p className="calendar-empty-state" role="status">
                        {CALENDAR_VISUAL_MESSAGES.LOADING}
                    </p>
                )}

                {!isLoading && errorMessage && (
                    <div className="calendar-visual-error">
                        <p role="alert">{errorMessage}</p>
                        <button type="button" onClick={loadCalendar}>
                            Tentar novamente
                        </button>
                    </div>
                )}

                {!isLoading && !errorMessage && (
                    <>
                        <header className="calendar-visual-header">
                            <div className="calendar-visual-navigation">
                                <button
                                    type="button"
                                    title="Mês anterior"
                                    onClick={() => moveMonth(-1)}
                                >
                                    <span aria-hidden="true">◀</span>
                                    {' '}Anterior
                                </button>
                                <button
                                    type="button"
                                    className="calendar-visual-today-button"
                                    onClick={goToToday}
                                >
                                    Hoje
                                </button>
                                <button
                                    type="button"
                                    title="Próximo mês"
                                    onClick={() => moveMonth(1)}
                                >
                                    Próximo{' '}
                                    <span aria-hidden="true">▶</span>
                                </button>
                            </div>

                            <h3 aria-live="polite">
                                {formatCalendarPeriod(period)}
                            </h3>
                        </header>

                        <div
                            className="calendar-visual-grid"
                            aria-label={
                                'Calendário de '
                                + formatCalendarPeriod(period)
                            }
                        >
                            {CALENDAR_WEEKDAYS.map((weekday) => (
                                <div
                                    key={weekday}
                                    className="calendar-visual-weekday"
                                >
                                    {weekday}
                                </div>
                            ))}

                            {cells.map((cell) => {
                                if (cell.isEmpty) {
                                    return (
                                        <div
                                            key={cell.key}
                                            className="calendar-visual-day is-empty"
                                            aria-hidden="true"
                                        />
                                    );
                                }

                                const classNames = [
                                    'calendar-visual-day',
                                    cell.isToday ? 'is-today' : '',
                                    cell.isWeekend ? 'is-weekend' : '',
                                ].filter(Boolean).join(' ');

                                return (
                                    <div
                                        key={cell.key}
                                        className={classNames}
                                        role="group"
                                        aria-label={
                                            `${formatCivilDate(cell.date)}: `
                                            + `${cell.lessons.length} `
                                            + (cell.lessons.length === 1
                                                ? 'registro'
                                                : 'registros')
                                        }
                                    >
                                        <time
                                            className="calendar-visual-day-number"
                                            dateTime={cell.date}
                                        >
                                            {cell.day}
                                        </time>

                                        <div className="calendar-visual-events">
                                            {cell.lessons.map((lesson) => (
                                                <button
                                                    key={lesson.id}
                                                    type="button"
                                                    className={[
                                                        'calendar-visual-event',
                                                        `course-${lesson.course}`,
                                                        lesson.needsReview
                                                            ? 'needs-review'
                                                            : '',
                                                    ].filter(Boolean).join(' ')}
                                                    title={
                                                        `${lesson.course} - UC `
                                                        + lesson.curricularUnit
                                                        + '\n'
                                                        + formatLessonRecord(
                                                            lesson,
                                                        )
                                                        + (lesson.needsReview
                                                            ? ' ★ Revisão'
                                                            : '')
                                                    }
                                                    aria-label={
                                                        'Ver detalhes: '
                                                        + lesson.course
                                                        + ', '
                                                        + lesson.curricularUnit
                                                        + ', '
                                                        + formatLessonRecord(
                                                            lesson,
                                                        )
                                                        + (lesson.needsReview
                                                            ? ', marcada para revisão'
                                                            : '')
                                                    }
                                                    onClick={() => {
                                                        setSelectedLesson(
                                                            lesson,
                                                        );
                                                    }}
                                                >
                                                    <strong>
                                                        {lesson.course}
                                                    </strong>
                                                    <span>
                                                        UC{' '}
                                                        {lesson.curricularUnit}
                                                        {' '}
                                                        {formatLessonRecord(
                                                            lesson,
                                                        )}
                                                    </span>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        <div
                            className="calendar-visual-legend"
                            aria-label="Legenda do calendário"
                        >
                            {LESSON_API_COURSES.map((availableCourse) => (
                                <div
                                    key={availableCourse}
                                    className="calendar-visual-legend-item"
                                >
                                    <span
                                        className={
                                            'calendar-visual-legend-color '
                                            + `course-${availableCourse}`
                                        }
                                        aria-hidden="true"
                                    />
                                    <span>{availableCourse}</span>
                                </div>
                            ))}
                            <div className="calendar-visual-legend-item">
                                <span
                                    className="calendar-visual-legend-color is-today"
                                    aria-hidden="true"
                                />
                                <span>Hoje</span>
                            </div>
                            <div className="calendar-visual-legend-item">
                                <span aria-hidden="true">★</span>
                                <span>Marcada para revisão</span>
                            </div>
                        </div>
                    </>
                )}
            </div>

            {selectedLesson && (
                <CalendarLessonDetails
                    lesson={selectedLesson}
                    monthlyMaterials={monthlyMaterials}
                    onClose={() => setSelectedLesson(null)}
                />
            )}
        </section>
    );
}

export {
    CALENDAR_MONTH_NAMES,
    CALENDAR_VISUAL_IDS,
    CALENDAR_VISUAL_MESSAGES,
    CALENDAR_WEEKDAYS,
    CalendarVisual,
    createCalendarCells,
    createCalendarPeriodFromDate,
    defaultCalendarTodayProvider,
    formatCalendarPeriod,
    isValidCalendarPeriod,
    isValidCalendarVisualDate,
    readCalendarToday,
    shiftCalendarPeriod,
};
