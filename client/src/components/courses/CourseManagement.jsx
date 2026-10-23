import { useEffect, useId, useRef, useState } from 'react';
import { CourseApi, CourseApiError, courseApi } from '../../services/CourseApi.js';
import { CourseForm } from './CourseForm.jsx';

const COURSE_MANAGEMENT_MESSAGES = Object.freeze({
    INVALID_SERVICE: 'O gerenciamento de cursos exige um serviço válido.',
    LOAD_ERROR: 'Não foi possível consultar os cursos. Tente novamente.',
    SAVE_ERROR: 'Não foi possível salvar o curso agora. Tente novamente.',
    DEACTIVATE_ERROR: 'Não foi possível desativar o curso agora. Tente novamente.',
    CREATE_SUCCESS: 'Curso cadastrado com sucesso.',
    UPDATE_SUCCESS: 'Alterações do curso salvas com sucesso.',
    DEACTIVATE_SUCCESS: 'Curso desativado. O registro permanece no catálogo.',
});

/** Normaliza apenas a ordem visual; o conteúdo já deve respeitar o contrato. */
function sortCourses(courses) {
    return [...courses].sort((left, right) => (
        left.name.localeCompare(right.name, 'pt-BR')
        || left.code.localeCompare(right.code, 'pt-BR')
        || left.id.localeCompare(right.id)
    ));
}

/** Uma consulta malformada nunca é apresentada como um catálogo vazio. */
function readCourseList(value) {
    if (!Array.isArray(value)) throw new TypeError('Lista de cursos inválida.');
    const courses = value.map(course => CourseApi.createPublicCourse(course));
    if (new Set(courses.map(course => course.id)).size !== courses.length) {
        throw new TypeError('Lista de cursos com identidades repetidas.');
    }
    return sortCourses(courses);
}

function publicMessage(error, fallback) {
    return error instanceof CourseApiError ? error.message : fallback;
}

/**
 * Catálogo pessoal de cursos: consulta, cadastro, edição e desativação.
 *
 * A lista inicial inclui todas as situações; o filtro visual não faz novas
 * consultas. Após uma gravação confirmada, a resposta pública atualiza a lista
 * pelo identificador estável, preservando o filtro e a ordenação.
 *
 * Uma trava síncrona impede solicitações repetidas antes da atualização do
 * React. A versão do ciclo de vida descarta respostas de uma seção desmontada
 * ou de uma dependência substituída. Nenhuma escrita é repetida automaticamente.
 *
 * @param {object} props Dependências da seção.
 * @param {object} [props.courseService=courseApi] Cliente substituível nos testes.
 * @returns {import('react').ReactElement} Tela administrativa de cursos.
 */
function CourseManagement({ courseService = courseApi } = {}) {
    if (!courseService || typeof courseService !== 'object' || Array.isArray(courseService)
        || !['listCourses', 'createCourse', 'updateCourse', 'deactivateCourse']
            .every(method => typeof courseService[method] === 'function')) {
        throw new TypeError(COURSE_MANAGEMENT_MESSAGES.INVALID_SERVICE);
    }

    const prefix = useId();
    const lifecycle = useRef(0);
    const busy = useRef(false);
    const [courses, setCourses] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [hasLoaded, setHasLoaded] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [filter, setFilter] = useState('all');
    // null fecha o formulário; { course: null } representa um novo cadastro.
    const [editor, setEditor] = useState(null);
    const [deactivation, setDeactivation] = useState(null);
    const [errorMessage, setErrorMessage] = useState(null);
    const [successMessage, setSuccessMessage] = useState(null);

    async function loadCourses(version) {
        if (busy.current) return;
        busy.current = true;
        setIsLoading(true);
        setErrorMessage(null);
        setSuccessMessage(null);
        try {
            const received = await courseService.listCourses();
            if (version !== lifecycle.current) return;
            setCourses(readCourseList(received));
            setHasLoaded(true);
        } catch (error) {
            if (version !== lifecycle.current) return;
            setErrorMessage(publicMessage(error, COURSE_MANAGEMENT_MESSAGES.LOAD_ERROR));
        } finally {
            if (version === lifecycle.current) {
                busy.current = false;
                setIsLoading(false);
            }
        }
    }

    useEffect(() => {
        const version = ++lifecycle.current;
        busy.current = false;
        setCourses([]);
        setHasLoaded(false);
        setEditor(null);
        setDeactivation(null);
        setIsSubmitting(false);
        setFilter('all');
        void loadCourses(version);
        return () => {
            lifecycle.current += 1;
            busy.current = false;
        };
    }, [courseService]);

    function openEditor(course) {
        if (busy.current || !hasLoaded || editor !== null || deactivation !== null) return;
        setErrorMessage(null);
        setSuccessMessage(null);
        setEditor({ course });
    }

    function cancelEditor() {
        if (busy.current) return;
        setEditor(null);
        setErrorMessage(null);
    }

    async function saveCourse(data) {
        if (busy.current || editor === null) return;
        busy.current = true;
        const version = lifecycle.current;
        const selected = editor.course;
        setIsSubmitting(true);
        setErrorMessage(null);
        setSuccessMessage(null);
        try {
            const input = CourseApi.createCourseData(data);
            const received = selected
                ? await courseService.updateCourse(selected.id, input)
                : await courseService.createCourse(input);
            if (version !== lifecycle.current) return;
            const saved = CourseApi.createPublicCourse(received);
            if (saved.name !== input.name || saved.code !== input.code
                || (selected ? saved.id !== selected.id : saved.active !== true)
                || (!selected && courses.some(course => course.id === saved.id))) {
                throw new TypeError('Confirmação de gravação inconsistente.');
            }
            setCourses(previous => sortCourses([...previous.filter(course => course.id !== saved.id), saved]));
            setEditor(null);
            setSuccessMessage(selected
                ? COURSE_MANAGEMENT_MESSAGES.UPDATE_SUCCESS : COURSE_MANAGEMENT_MESSAGES.CREATE_SUCCESS);
        } catch (error) {
            if (version === lifecycle.current) {
                setErrorMessage(publicMessage(error, COURSE_MANAGEMENT_MESSAGES.SAVE_ERROR));
            }
        } finally {
            if (version === lifecycle.current) {
                busy.current = false;
                setIsSubmitting(false);
            }
        }
    }

    function requestDeactivation(course) {
        if (busy.current || editor !== null || deactivation !== null || !course.active) return;
        setErrorMessage(null);
        setSuccessMessage(null);
        setDeactivation(course);
    }

    async function confirmDeactivation() {
        if (busy.current || deactivation === null) return;
        busy.current = true;
        const version = lifecycle.current;
        const selected = deactivation;
        setIsSubmitting(true);
        setErrorMessage(null);
        setSuccessMessage(null);
        try {
            const received = await courseService.deactivateCourse(selected.id);
            if (version !== lifecycle.current) return;
            const saved = CourseApi.createPublicCourse(received);
            if (saved.id !== selected.id || saved.active !== false) {
                throw new TypeError('Confirmação de desativação inconsistente.');
            }
            setCourses(previous => sortCourses(previous.map(course => course.id === saved.id ? saved : course)));
            setDeactivation(null);
            setSuccessMessage(COURSE_MANAGEMENT_MESSAGES.DEACTIVATE_SUCCESS);
        } catch (error) {
            if (version === lifecycle.current) {
                setErrorMessage(publicMessage(error, COURSE_MANAGEMENT_MESSAGES.DEACTIVATE_ERROR));
            }
        } finally {
            if (version === lifecycle.current) {
                busy.current = false;
                setIsSubmitting(false);
            }
        }
    }

    const visibleCourses = courses.filter(course => filter === 'all'
        || course.active === (filter === 'active'));
    const controlsLocked = isLoading || isSubmitting || editor !== null || deactivation !== null;

    return (
        <section className="course-management" aria-labelledby={`${prefix}-title`}>
            <div className="course-management-heading">
                <div>
                    <h2 id={`${prefix}-title`}>Cursos</h2>
                    <p>Organize os cursos do seu catálogo com nome e sigla personalizados.</p>
                </div>
                <button type="button" disabled={controlsLocked || !hasLoaded} onClick={() => openEditor(null)}>
                    Novo curso
                </button>
            </div>
            <div className="course-management-toolbar">
                <label htmlFor={`${prefix}-filter`}>Situação dos cursos</label>
                <select id={`${prefix}-filter`} value={filter} disabled={controlsLocked}
                    onChange={event => { if (!busy.current) setFilter(event.target.value); }}>
                    <option value="all">Todos</option>
                    <option value="active">Ativos</option>
                    <option value="inactive">Desativados</option>
                </select>
                <button type="button" disabled={controlsLocked} onClick={() => {
                    if (!controlsLocked) void loadCourses(lifecycle.current);
                }}>Atualizar lista</button>
            </div>

            {isLoading && <p role="status">Carregando cursos...</p>}
            {errorMessage && editor === null && <p className="course-management-error" role="alert">{errorMessage}</p>}
            {successMessage && <p className="course-management-success" role="status">{successMessage}</p>}

            {editor !== null && <CourseForm
                courseToEdit={editor.course}
                onSubmit={saveCourse}
                onCancel={cancelEditor}
                isSubmitting={isSubmitting}
                errorMessage={errorMessage}
            />}

            {hasLoaded && <>
                <p className="course-management-count" aria-live="polite">
                    {visibleCourses.length} de {courses.length} cursos
                </p>
                {visibleCourses.length === 0 && <p className="course-management-empty">
                    {courses.length === 0 ? 'Nenhum curso cadastrado. Use Novo curso para começar.'
                        : 'Nenhum curso nesta situação.'}
                </p>}
                <ul className="course-list">
                    {visibleCourses.map(course => (
                        <li key={course.id}>
                            <article className="course-card" aria-labelledby={`${prefix}-${course.id}`}>
                                <h3 id={`${prefix}-${course.id}`}>{course.name}</h3>
                                <p>Sigla: <strong>{course.code}</strong></p>
                                <p className={course.active ? 'course-status-active' : 'course-status-inactive'}>
                                    {course.active ? 'Ativo' : 'Desativado'}
                                </p>
                                {deactivation?.id === course.id ? (
                                    <div className="course-deactivation-confirmation" role="group"
                                        aria-label={`Confirmação de desativação de ${course.code}`}>
                                        <p>Desativar este curso? Ele permanecerá no catálogo. Nenhuma aula será excluída.</p>
                                        <button type="button" disabled={isSubmitting} onClick={() => void confirmDeactivation()}>
                                            {isSubmitting ? 'Desativando...' : 'Confirmar desativação'}
                                        </button>
                                        <button type="button" disabled={isSubmitting} onClick={() => {
                                            if (busy.current) return;
                                            setDeactivation(null);
                                            setErrorMessage(null);
                                        }}>Cancelar desativação</button>
                                    </div>
                                ) : (
                                    <div className="course-card-actions">
                                        <button type="button" aria-label={`Editar curso ${course.code}`}
                                            disabled={controlsLocked} onClick={() => openEditor(course)}>Editar</button>
                                        {course.active && <button type="button" aria-label={`Desativar curso ${course.code}`}
                                            disabled={controlsLocked} onClick={() => requestDeactivation(course)}>Desativar</button>}
                                    </div>
                                )}
                            </article>
                        </li>
                    ))}
                </ul>
            </>}
        </section>
    );
}

export { CourseManagement, COURSE_MANAGEMENT_MESSAGES };
