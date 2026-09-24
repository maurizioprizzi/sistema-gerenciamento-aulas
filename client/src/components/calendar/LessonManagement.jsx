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
import { LessonForm } from './LessonForm.jsx';

/**
 * Identificadores estáveis utilizados pela seção de aulas.
 */
const LESSON_MANAGEMENT_IDS = Object.freeze({
    TITLE: 'lesson-management-title',
    FILTERS: 'lesson-management-filters',
    RESULTS: 'lesson-management-results',
});

/**
 * Mensagens públicas e de configuração do componente.
 */
const LESSON_MANAGEMENT_MESSAGES = Object.freeze({
    INVALID_LESSON_SERVICE:
        'O gerenciamento de aulas exige um serviço de consulta, criação e edição válido.',
    LOADING: 'Carregando aulas...',
    EMPTY: 'Nenhuma aula encontrada para os filtros selecionados.',
    UNEXPECTED_ERROR:
        'Não foi possível carregar as aulas agora. Tente novamente em instantes.',
});

/**
 * Estado inicial editável dos três filtros públicos da API.
 */
const EMPTY_LESSON_FILTERS = Object.freeze({
    course: '',
    month: '',
    fromDate: '',
});

/**
 * Cria uma nova cópia do estado vazio para uso pelos controles React.
 *
 * @returns {{ course: string, month: string, fromDate: string }} Filtros vazios.
 */
function createEmptyFilters() {
    return { ...EMPTY_LESSON_FILTERS };
}

/**
 * Remove valores vazios antes de entregar os filtros ao cliente HTTP.
 *
 * A ordem explícita corresponde ao contrato determinístico do LessonApi.
 *
 * @param {{ course: string, month: string, fromDate: string }} filters
 * Estado atual do formulário.
 * @returns {Readonly<object>} Filtros prontos para consulta.
 */
function createSubmittedFilters(filters) {
    const submittedFilters = {};

    if (filters.course.length > 0) {
        submittedFilters.course = filters.course;
    }

    if (filters.month.length > 0) {
        submittedFilters.month = filters.month;
    }

    if (filters.fromDate.length > 0) {
        submittedFilters.fromDate = filters.fromDate;
    }

    return Object.freeze(submittedFilters);
}

/**
 * Formata uma data civil sem criar Date e sem introduzir conversão de fuso.
 *
 * @param {string} date Data no formato YYYY-MM-DD.
 * @returns {string} Data apresentada no formato DD/MM/YYYY.
 */
function formatCivilDate(date) {
    const [year, month, day] = date.split('-');

    return `${day}/${month}/${year}`;
}

/**
 * Representa um link opcional de material da aula.
 *
 * @param {object} props Propriedades do link.
 * @param {string} props.label Nome público do material.
 * @param {string | null} props.url Endereço autorizado ou ausência.
 * @returns {import('react').ReactElement} Link ou estado ausente.
 */
function LessonMaterialLink({ label, url }) {
    if (url === null) {
        return (
            <span className="lesson-management-material-missing">
                {label}: não informado
            </span>
        );
    }

    return (
        <a
            href={url}
            target="_blank"
            rel="noreferrer noopener"
        >
            {label}
        </a>
    );
}

/**
 * Apresenta a consulta administrativa de aulas e seus filtros.
 *
 * O componente não conhece fetch nem os envelopes HTTP. Toda comunicação
 * permanece encapsulada no serviço recebido. Um contador de requisições
 * impede que respostas antigas ou posteriores à desmontagem substituam o
 * estado mais recente da interface.
 *
 * @param {object} props Propriedades da seção.
 * @param {{
 *     listLessons: Function,
 *     createLesson: Function,
 *     updateLesson: Function,
 * }} [props.lessonService=lessonApi]
 * Serviço substituível nos testes.
 * @returns {import('react').ReactElement} Consulta visual das aulas.
 */
function LessonManagement({ lessonService = lessonApi } = {}) {
    const isValidLessonService =
        lessonService !== null
        && typeof lessonService === 'object'
        && !Array.isArray(lessonService)
        && typeof lessonService.listLessons === 'function'
        && typeof lessonService.createLesson === 'function'
        && typeof lessonService.updateLesson === 'function';

    if (!isValidLessonService) {
        throw new TypeError(
            LESSON_MANAGEMENT_MESSAGES.INVALID_LESSON_SERVICE,
        );
    }

    const [filters, setFilters] = useState(createEmptyFilters);
    const [appliedFilters, setAppliedFilters] = useState(
        Object.freeze({}),
    );
    const [lessons, setLessons] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [errorMessage, setErrorMessage] = useState(null);
    const [lessonToEdit, setLessonToEdit] = useState(null);
    const requestSequence = useRef(0);

    /**
     * Executa uma consulta e aceita seu resultado somente enquanto ela for a
     * solicitação mais recente desta instância.
     */
    const loadLessons = useCallback(async (requestedFilters) => {
        const requestId = requestSequence.current + 1;

        requestSequence.current = requestId;
        setIsLoading(true);
        setErrorMessage(null);
        setAppliedFilters(requestedFilters);

        try {
            const receivedLessons =
                await lessonService.listLessons(requestedFilters);

            if (requestSequence.current === requestId) {
                setLessons(receivedLessons);
            }
        } catch (error) {
            if (requestSequence.current === requestId) {
                const publicMessage = error instanceof LessonApiError
                    ? error.message
                    : LESSON_MANAGEMENT_MESSAGES.UNEXPECTED_ERROR;

                setErrorMessage(publicMessage);
            }
        } finally {
            if (requestSequence.current === requestId) {
                setIsLoading(false);
            }
        }
    }, [lessonService]);

    /**
     * A primeira montagem consulta a coleção completa. A limpeza invalida
     * qualquer resposta que chegue depois da desmontagem.
     */
    useEffect(() => {
        loadLessons(Object.freeze({}));

        return () => {
            requestSequence.current += 1;
        };
    }, [loadLessons]);

    /**
     * Atualiza a consulta depois que o backend confirma um novo registro.
     *
     * Os filtros efetivamente aplicados são preservados. Assim, um registro
     * recém-criado aparece somente quando pertence ao recorte atual, sem
     * alterar silenciosamente a escolha do administrador.
     */
    const handleLessonCreated = useCallback(() => {
        loadLessons(appliedFilters);
    }, [appliedFilters, loadLessons]);

    /**
     * Abre o formulário com uma cópia pública da aula escolhida.
     *
     * @param {object} lesson Registro selecionado na lista.
     */
    function handleLessonEditRequested(lesson) {
        setLessonToEdit(lesson);
    }

    /**
     * Retorna o formulário ao modo de cadastro sem acessar a API.
     */
    function handleLessonEditCancelled() {
        setLessonToEdit(null);
    }

    /**
     * Encerra o modo de edição e consulta novamente o recorte atual.
     *
     * A nova consulta é importante porque uma alteração de data ou curso pode
     * incluir ou retirar o registro dos filtros que continuam aplicados.
     */
    const handleLessonUpdated = useCallback(() => {
        setLessonToEdit(null);
        loadLessons(appliedFilters);
    }, [appliedFilters, loadLessons]);

    /**
     * Atualiza somente o controle que originou o evento.
     *
     * @param {import('react').ChangeEvent<HTMLInputElement
     * | HTMLSelectElement>} event Alteração do formulário.
     */
    function handleFilterChange(event) {
        const { name, value } = event.target;

        setFilters((currentFilters) => ({
            ...currentFilters,
            [name]: value,
        }));
    }

    /**
     * Consulta a API com os filtros não vazios do formulário.
     *
     * @param {import('react').FormEvent<HTMLFormElement>} event Envio.
     */
    function handleSubmit(event) {
        event.preventDefault();

        if (isLoading) {
            return;
        }

        loadLessons(createSubmittedFilters(filters));
    }

    /**
     * Restaura o formulário e consulta novamente a coleção completa.
     */
    function handleClearFilters() {
        if (isLoading) {
            return;
        }

        setFilters(createEmptyFilters());
        loadLessons(Object.freeze({}));
    }

    return (
        <section
            className="lesson-management calendar-content-section"
            aria-labelledby={LESSON_MANAGEMENT_IDS.TITLE}
        >
            <div className="lesson-management-heading">
                <div>
                    <h2 id={LESSON_MANAGEMENT_IDS.TITLE}>
                        Gerenciar aulas
                    </h2>

                    <p>
                        Consulte aulas, atividades e avaliações já
                        registradas.
                    </p>
                </div>

                <output
                    className="lesson-management-count"
                    aria-label={
                        `Aulas encontradas: ${lessons.length}`
                    }
                >
                    {lessons.length}
                </output>
            </div>

            <LessonForm
                lessonService={lessonService}
                lessonToEdit={lessonToEdit}
                onLessonCreated={handleLessonCreated}
                onLessonUpdated={handleLessonUpdated}
                onEditCancelled={handleLessonEditCancelled}
            />

            <form
                id={LESSON_MANAGEMENT_IDS.FILTERS}
                className="lesson-management-filters"
                aria-label="Filtros de aulas"
                onSubmit={handleSubmit}
            >
                <div className="lesson-management-field">
                    <label htmlFor="lesson-filter-course">
                        Curso
                    </label>
                    <select
                        id="lesson-filter-course"
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

                <div className="lesson-management-field">
                    <label htmlFor="lesson-filter-month">
                        Mês
                    </label>
                    <input
                        id="lesson-filter-month"
                        name="month"
                        type="month"
                        value={filters.month}
                        disabled={isLoading}
                        onChange={handleFilterChange}
                    />
                </div>

                <div className="lesson-management-field">
                    <label htmlFor="lesson-filter-from-date">
                        A partir de
                    </label>
                    <input
                        id="lesson-filter-from-date"
                        name="fromDate"
                        type="date"
                        value={filters.fromDate}
                        disabled={isLoading}
                        onChange={handleFilterChange}
                    />
                </div>

                <div className="lesson-management-actions">
                    <button type="submit" disabled={isLoading}>
                        {isLoading ? 'Consultando...' : 'Aplicar filtros'}
                    </button>

                    <button
                        type="button"
                        disabled={isLoading}
                        onClick={handleClearFilters}
                    >
                        Limpar filtros
                    </button>
                </div>
            </form>

            <div
                id={LESSON_MANAGEMENT_IDS.RESULTS}
                className="lesson-management-results"
                aria-live="polite"
                aria-busy={isLoading}
            >
                {isLoading && (
                    <p className="calendar-empty-state" role="status">
                        {LESSON_MANAGEMENT_MESSAGES.LOADING}
                    </p>
                )}

                {!isLoading && errorMessage && (
                    <div className="lesson-management-error">
                        <p role="alert">{errorMessage}</p>
                        <button
                            type="button"
                            onClick={() => loadLessons(appliedFilters)}
                        >
                            Tentar novamente
                        </button>
                    </div>
                )}

                {!isLoading
                    && !errorMessage
                    && lessons.length === 0 && (
                    <p className="calendar-empty-state">
                        {LESSON_MANAGEMENT_MESSAGES.EMPTY}
                    </p>
                )}

                {!isLoading
                    && !errorMessage
                    && lessons.length > 0 && (
                    <ul
                        className="lesson-management-list"
                        aria-label="Aulas encontradas"
                    >
                        {lessons.map((lesson) => (
                            <li key={lesson.id}>
                                <article className="lesson-management-card">
                                    <header>
                                        <div>
                                            <p>{lesson.course}</p>
                                            <h3>{lesson.curricularUnit}</h3>
                                        </div>

                                        <time dateTime={lesson.date}>
                                            {formatCivilDate(lesson.date)}
                                        </time>
                                    </header>

                                    <dl>
                                        <div>
                                            <dt>Tipo</dt>
                                            <dd>{lesson.type}</dd>
                                        </div>
                                        <div>
                                            <dt>Número</dt>
                                            <dd>
                                                {lesson.lessonNumber
                                                    ?? 'Não informado'}
                                            </dd>
                                        </div>
                                        <div>
                                            <dt>Revisão</dt>
                                            <dd>
                                                {lesson.needsReview
                                                    ? 'Necessária'
                                                    : 'Não necessária'}
                                            </dd>
                                        </div>
                                    </dl>

                                    <div className="lesson-management-materials">
                                        <LessonMaterialLink
                                            label="Plano de aula"
                                            url={lesson.lessonPlanUrl}
                                        />
                                        <LessonMaterialLink
                                            label="Guia e atividades"
                                            url={lesson.studentGuideUrl}
                                        />
                                    </div>

                                    <div className="lesson-management-card-actions">
                                        <button
                                            type="button"
                                            disabled={lessonToEdit?.id === lesson.id}
                                            aria-label={
                                                'Editar '
                                                + lesson.type
                                                + ' de '
                                                + lesson.course
                                                + ' em '
                                                + formatCivilDate(lesson.date)
                                            }
                                            onClick={() => {
                                                handleLessonEditRequested(lesson);
                                            }}
                                        >
                                            {lessonToEdit?.id === lesson.id
                                                ? 'Editando'
                                                : 'Editar'}
                                        </button>
                                    </div>
                                </article>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </section>
    );
}

export {
    EMPTY_LESSON_FILTERS,
    LESSON_MANAGEMENT_IDS,
    LESSON_MANAGEMENT_MESSAGES,
    LessonManagement,
    createSubmittedFilters,
    formatCivilDate,
};
