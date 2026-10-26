import { useEffect, useRef, useState } from 'react';

import {
    LESSON_API_TYPES, LessonApi, LessonApiError, lessonApi,
} from '../../services/LessonApi.js';
import { courseApi } from '../../services/CourseApi.js';
import { prepareCourseCatalog, useCourseCatalog } from '../../hooks/useCourseCatalog.js';

const LESSON_FORM_IDS = Object.freeze({
    TITLE: 'lesson-form-title', ERROR: 'lesson-form-error', SUCCESS: 'lesson-form-success',
});

const LESSON_FORM_MESSAGES = Object.freeze({
    INVALID_LESSON_SERVICE: 'O formulário de aulas exige um serviço válido.',
    INVALID_CREATED_HANDLER: 'O formulário de aulas exige uma confirmação de cadastro válida.',
    INVALID_UPDATED_HANDLER: 'O formulário de aulas exige uma confirmação de edição válida.',
    INVALID_CANCEL_HANDLER: 'O formulário de aulas exige uma função de cancelamento válida.',
    INVALID_EDITING_LESSON: 'O formulário de aulas recebeu um registro inválido para edição.',
    INVALID_CATALOG: 'O formulário de aulas exige um estado válido do catálogo de cursos.',
    INVALID_FORM_DATA: 'Confira a data, o curso e a unidade curricular antes de salvar.',
    UNEXPECTED_CREATE_ERROR: 'Não foi possível cadastrar o registro agora. Tente novamente em instantes.',
    UNEXPECTED_UPDATE_ERROR: 'Não foi possível salvar as alterações agora. Tente novamente em instantes.',
    CREATE_SUCCESS: 'Registro cadastrado com sucesso.',
    UPDATE_SUCCESS: 'Alterações salvas com sucesso.',
});

/** A sigla é apresentação; somente courseId é enviado como vínculo do curso. */
const INITIAL_LESSON_FORM_DATA = Object.freeze({
    date: '', courseId: '', curricularUnit: '', type: 'Aula', lessonNumber: '',
    needsReview: false, lessonPlanUrl: '', studentGuideUrl: '',
});

/** @returns {object} Valores editáveis independentes. */
function createInitialLessonFormData() {
    return { ...INITIAL_LESSON_FORM_DATA };
}

/**
 * Preenche a edição pelo ID já persistido. Não tenta inferir um vínculo pela
 * sigla. Aulas anteriores ao catálogo exigirão uma escolha explícita de curso.
 * @param {unknown} lesson Aula pública recebida da listagem.
 * @returns {object} Identidade da aula, vínculo original e valores editáveis.
 */
function createEditingLessonFormData(lesson) {
    try {
        const publicLesson = LessonApi.createPublicLesson(lesson);
        const lessonId = LessonApi.createLessonId(publicLesson.id);
        return {
            lessonId,
            originalCourseId: publicLesson.courseId ?? null,
            formData: {
                date: publicLesson.date,
                courseId: publicLesson.courseId ?? '',
                curricularUnit: publicLesson.curricularUnit,
                type: publicLesson.type,
                lessonNumber: publicLesson.lessonNumber ?? '',
                needsReview: publicLesson.needsReview,
                lessonPlanUrl: publicLesson.lessonPlanUrl ?? '',
                studentGuideUrl: publicLesson.studentGuideUrl ?? '',
            },
        };
    } catch {
        throw new TypeError(LESSON_FORM_MESSAGES.INVALID_EDITING_LESSON);
    }
}

/**
 * Formulário para criar ou editar registros com cursos do catálogo.
 *
 * A seção poderá fornecer courseCatalog, compartilhando a consulta com seus
 * filtros. Enquanto esse estado não for fornecido, o formulário consulta o
 * serviço de cursos por conta própria. Em ambos os casos a seleção usa IDs.
 * A validação definitiva da associação permanece no serviço do backend.
 *
 * @param {object} props Dependências e confirmações do formulário.
 * @param {object} [props.lessonService=lessonApi] Criação e edição de aulas.
 * @param {object} [props.courseService=courseApi] Consulta quando não há catálogo compartilhado.
 * @param {object} [props.courseCatalog] Resultado de useCourseCatalog na seção.
 * @param {object|null} [props.lessonToEdit=null] Aula selecionada.
 * @param {Function} props.onLessonCreated Confirmação de criação válida.
 * @param {Function} [props.onLessonUpdated] Confirmação de edição válida.
 * @param {Function} [props.onEditCancelled] Pedido de cancelamento da edição.
 * @returns {import('react').ReactElement} Formulário administrativo.
 */
function LessonForm({
    lessonService = lessonApi,
    courseService = courseApi,
    courseCatalog,
    lessonToEdit = null,
    onLessonCreated,
    onLessonUpdated,
    onEditCancelled,
} = {}) {
    const isEditing = lessonToEdit !== null;
    if (!lessonService || typeof lessonService !== 'object' || Array.isArray(lessonService)
        || typeof lessonService.createLesson !== 'function'
        || (isEditing && typeof lessonService.updateLesson !== 'function')) {
        throw new TypeError(LESSON_FORM_MESSAGES.INVALID_LESSON_SERVICE);
    }
    if (typeof onLessonCreated !== 'function') {
        throw new TypeError(LESSON_FORM_MESSAGES.INVALID_CREATED_HANDLER);
    }
    if (isEditing && typeof onLessonUpdated !== 'function') {
        throw new TypeError(LESSON_FORM_MESSAGES.INVALID_UPDATED_HANDLER);
    }
    if (isEditing && typeof onEditCancelled !== 'function') {
        throw new TypeError(LESSON_FORM_MESSAGES.INVALID_CANCEL_HANDLER);
    }
    const editingState = isEditing ? createEditingLessonFormData(lessonToEdit) : null;
    const props = { lessonService, catalogSource: courseService, editingState, isEditing,
        onLessonCreated, onLessonUpdated, onEditCancelled };
    const key = editingState?.lessonId ?? 'new-lesson';

    // Os componentes separados mantêm a ordem dos hooks estável. Quando a seção
    // fornece o catálogo, nenhum hook de consulta é montado neste formulário.
    return courseCatalog === undefined
        ? <StandaloneLessonForm key={key} {...props} courseService={courseService} />
        : <LessonFormFields key={key} {...props} courseCatalog={courseCatalog} />;
}

/** Consulta própria para uso independente ou durante a transição da seção. */
function StandaloneLessonForm({ courseService, ...props }) {
    const courseCatalog = useCourseCatalog({ courseService });
    return <LessonFormFields {...props} courseCatalog={courseCatalog} />;
}

/** Mantém somente o preenchimento e o estado da gravação. */
function LessonFormFields({
    lessonService, catalogSource, courseCatalog, editingState, isEditing,
    onLessonCreated, onLessonUpdated, onEditCancelled,
}) {
    if (!courseCatalog || typeof courseCatalog.isLoading !== 'boolean'
        || (courseCatalog.errorMessage !== null && typeof courseCatalog.errorMessage !== 'string')
        || typeof courseCatalog.reload !== 'function') {
        throw new TypeError(LESSON_FORM_MESSAGES.INVALID_CATALOG);
    }
    const courses = prepareCourseCatalog(courseCatalog.courses);
    const [originalCourseId, setOriginalCourseId] = useState(
        () => editingState?.originalCourseId ?? null,
    );
    const availableCourses = courses.filter((course) => course.active
        || (isEditing && course.id === originalCourseId));
    const missingOriginalCourse = isEditing && originalCourseId !== null
        && !courses.some((course) => course.id === originalCourseId);
    const [formData, setFormData] = useState(() => editingState?.formData
        ?? createInitialLessonFormData());
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [errorMessage, setErrorMessage] = useState(null);
    const [successMessage, setSuccessMessage] = useState(null);
    const busy = useRef(false);
    const generation = useRef(0);

    useEffect(() => {
        generation.current += 1;
        busy.current = false;
        setIsSubmitting(false);
        return () => { generation.current += 1; };
    }, [lessonService, catalogSource]);

    const selectedCourse = availableCourses.find((course) => course.id === formData.courseId);
    const canSubmit = !isSubmitting && !courseCatalog.isLoading && !courseCatalog.errorMessage
        && Boolean(selectedCourse) && Boolean(formData.date.trim())
        && Boolean(formData.curricularUnit.trim());

    function handleChange(event) {
        const { name, type, value, checked } = event.target;
        setFormData((current) => ({ ...current, [name]: type === 'checkbox' ? checked : value }));
        setErrorMessage(null);
        setSuccessMessage(null);
    }

    /** Grava somente depois de validar o preenchimento e a seleção disponível. */
    async function handleSubmit(event) {
        event.preventDefault();
        if (busy.current || !canSubmit) return;
        let prepared;
        try {
            prepared = isEditing ? LessonApi.createLessonUpdateData(formData)
                : LessonApi.createLessonData(formData);
        } catch {
            setErrorMessage(LESSON_FORM_MESSAGES.INVALID_FORM_DATA);
            return;
        }
        busy.current = true;
        setIsSubmitting(true);
        setErrorMessage(null);
        setSuccessMessage(null);
        const operation = generation.current;
        let confirmed = null;
        try {
            const received = isEditing
                ? await lessonService.updateLesson(editingState.lessonId, prepared)
                : await lessonService.createLesson(prepared);
            if (generation.current !== operation) return;
            const publicLesson = LessonApi.createPublicLesson(received);
            if (publicLesson.courseId !== prepared.courseId
                || (isEditing && publicLesson.id !== editingState.lessonId.toLowerCase())) {
                throw new TypeError('A confirmação da aula não corresponde à gravação solicitada.');
            }
            confirmed = publicLesson;
            if (isEditing) setOriginalCourseId(publicLesson.courseId);
            setFormData(isEditing ? createEditingLessonFormData(publicLesson).formData
                : createInitialLessonFormData());
            setSuccessMessage(isEditing ? LESSON_FORM_MESSAGES.UPDATE_SUCCESS
                : LESSON_FORM_MESSAGES.CREATE_SUCCESS);
        } catch (error) {
            if (generation.current !== operation) return;
            setErrorMessage(error instanceof LessonApiError ? error.message
                : isEditing ? LESSON_FORM_MESSAGES.UNEXPECTED_UPDATE_ERROR
                    : LESSON_FORM_MESSAGES.UNEXPECTED_CREATE_ERROR);
        } finally {
            if (generation.current === operation) {
                busy.current = false;
                setIsSubmitting(false);
            }
        }
        if (confirmed !== null && generation.current === operation) {
            if (isEditing) onLessonUpdated(confirmed);
            else onLessonCreated(confirmed);
        }
    }

    return (
        <section
            className="lesson-form-section"
            aria-labelledby={LESSON_FORM_IDS.TITLE}
        >
            <div className="lesson-form-heading">
                <h3 id={LESSON_FORM_IDS.TITLE}>
                    {isEditing
                        ? 'Editar registro'
                        : 'Cadastrar registro'}
                </h3>
                <p>
                    {isEditing
                        ? 'Revise os campos e salve somente as alterações desejadas.'
                        : 'Inclua uma aula, atividade ou avaliação no calendário.'}
                </p>
            </div>

            <form
                className="lesson-form"
                aria-label={
                    isEditing
                        ? 'Edição de aula'
                        : 'Cadastro de aula'
                }
                aria-describedby={
                    errorMessage
                        ? LESSON_FORM_IDS.ERROR
                        : successMessage
                            ? LESSON_FORM_IDS.SUCCESS
                            : undefined
                }
                onSubmit={handleSubmit}
            >
                <div className="lesson-form-field">
                    <label htmlFor="lesson-date">Data</label>
                    <input
                        id="lesson-date"
                        name="date"
                        type="date"
                        value={formData.date}
                        required
                        disabled={isSubmitting}
                        onChange={handleChange}
                    />
                </div>

                <div className="lesson-form-field">
                    <label htmlFor="lesson-course">Curso</label>
                    <select
                        id="lesson-course"
                        name="courseId"
                        value={formData.courseId}
                        required
                        aria-describedby="lesson-course-help"
                        disabled={isSubmitting || courseCatalog.isLoading
                            || Boolean(courseCatalog.errorMessage) || availableCourses.length === 0}
                        onChange={handleChange}
                    >
                        <option value="">Selecione um curso</option>
                        {missingOriginalCourse && (
                            <option value={originalCourseId} disabled>
                                Curso vinculado indisponível
                            </option>
                        )}
                        {availableCourses.map((course) => (
                            <option key={course.id} value={course.id}>
                                {course.code} — {course.name}
                                {!course.active ? ' (desativado)' : ''}
                            </option>
                        ))}
                    </select>
                    <p id="lesson-course-help">
                        {courseCatalog.isLoading ? 'Carregando cursos...'
                            : courseCatalog.errorMessage ? 'Aguarde a consulta do catálogo antes de salvar.'
                                : availableCourses.length === 0
                                    ? 'Cadastre um curso ativo na seção Cursos antes de registrar a aula.'
                                    : 'Selecione o curso pelo nome e pela sigla. O vínculo usa sua identidade.'}
                    </p>
                    {courseCatalog.errorMessage && (
                        <div className="lesson-form-message lesson-form-message-error" role="alert">
                            <p>{courseCatalog.errorMessage}</p>
                            <button type="button" disabled={isSubmitting}
                                onClick={courseCatalog.reload}>Tentar carregar cursos novamente</button>
                        </div>
                    )}
                    {isEditing && originalCourseId === null && (
                        <p>Este registro ainda usa um curso antigo. Selecione um curso ativo
                            para vinculá-lo ao catálogo ao salvar.</p>
                    )}
                    {missingOriginalCourse && formData.courseId === originalCourseId
                        && !courseCatalog.isLoading && !courseCatalog.errorMessage && (
                        <p role="alert">O curso vinculado não foi encontrado. Selecione um curso ativo.</p>
                    )}
                    {selectedCourse && !selectedCourse.active && (
                        <p>Este curso está desativado. Você pode mantê-lo nesta aula
                            ou selecionar outro curso ativo.</p>
                    )}
                </div>

                <div className="lesson-form-field lesson-form-field-wide">
                    <label htmlFor="lesson-curricular-unit">
                        Unidade curricular
                    </label>
                    <input
                        id="lesson-curricular-unit"
                        name="curricularUnit"
                        type="text"
                        value={formData.curricularUnit}
                        maxLength={120}
                        required
                        disabled={isSubmitting}
                        autoComplete="off"
                        onChange={handleChange}
                    />
                </div>

                <div className="lesson-form-field">
                    <label htmlFor="lesson-type">Tipo</label>
                    <select
                        id="lesson-type"
                        name="type"
                        value={formData.type}
                        required
                        disabled={isSubmitting}
                        onChange={handleChange}
                    >
                        {LESSON_API_TYPES.map((lessonType) => (
                            <option key={lessonType} value={lessonType}>
                                {lessonType}
                            </option>
                        ))}
                    </select>
                </div>

                <div className="lesson-form-field">
                    <label htmlFor="lesson-number">
                        Número da aula
                    </label>
                    <input
                        id="lesson-number"
                        name="lessonNumber"
                        type="text"
                        value={formData.lessonNumber}
                        maxLength={60}
                        disabled={isSubmitting}
                        autoComplete="off"
                        onChange={handleChange}
                    />
                </div>

                <div className="lesson-form-field lesson-form-field-wide">
                    <label htmlFor="lesson-plan-url">
                        Link do Plano de Aula
                    </label>
                    <input
                        id="lesson-plan-url"
                        name="lessonPlanUrl"
                        type="url"
                        value={formData.lessonPlanUrl}
                        maxLength={2048}
                        placeholder="https://"
                        disabled={isSubmitting}
                        autoComplete="url"
                        onChange={handleChange}
                    />
                </div>

                <div className="lesson-form-field lesson-form-field-wide">
                    <label htmlFor="lesson-student-guide-url">
                        Link do Guia e das Atividades
                    </label>
                    <input
                        id="lesson-student-guide-url"
                        name="studentGuideUrl"
                        type="url"
                        value={formData.studentGuideUrl}
                        maxLength={2048}
                        placeholder="https://"
                        disabled={isSubmitting}
                        autoComplete="url"
                        onChange={handleChange}
                    />
                </div>

                <label className="lesson-form-checkbox">
                    <input
                        name="needsReview"
                        type="checkbox"
                        checked={formData.needsReview}
                        disabled={isSubmitting}
                        onChange={handleChange}
                    />
                    <span>Marcar para revisão</span>
                </label>

                {errorMessage && (
                    <p
                        id={LESSON_FORM_IDS.ERROR}
                        className="lesson-form-message lesson-form-message-error"
                        role="alert"
                    >
                        {errorMessage}
                    </p>
                )}

                {successMessage && (
                    <p
                        id={LESSON_FORM_IDS.SUCCESS}
                        className="lesson-form-message lesson-form-message-success"
                        role="status"
                    >
                        {successMessage}
                    </p>
                )}

                <div className="lesson-form-actions">
                    {isEditing && (
                        <button
                            type="button"
                            className="lesson-form-secondary-action"
                            disabled={isSubmitting}
                            onClick={onEditCancelled}
                        >
                            Cancelar edição
                        </button>
                    )}

                    <button type="submit" disabled={!canSubmit}>
                        {isSubmitting
                            ? isEditing
                                ? 'Salvando...'
                                : 'Cadastrando...'
                            : isEditing
                                ? 'Salvar alterações'
                                : 'Cadastrar registro'}
                    </button>
                </div>
            </form>
        </section>
    );
}

export {
    INITIAL_LESSON_FORM_DATA,
    LESSON_FORM_IDS,
    LESSON_FORM_MESSAGES,
    LessonForm,
    createEditingLessonFormData,
    createInitialLessonFormData,
};
