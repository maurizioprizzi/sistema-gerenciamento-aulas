import { useEffect, useState } from 'react';

import {
    LESSON_API_COURSES,
    LESSON_API_TYPES,
    LessonApi,
    LessonApiError,
    lessonApi,
} from '../../services/LessonApi.js';

/**
 * Identificadores estáveis utilizados pelo formulário de aulas.
 */
const LESSON_FORM_IDS = Object.freeze({
    TITLE: 'lesson-form-title',
    ERROR: 'lesson-form-error',
    SUCCESS: 'lesson-form-success',
});

/**
 * Mensagens públicas e de configuração do formulário.
 */
const LESSON_FORM_MESSAGES = Object.freeze({
    INVALID_LESSON_SERVICE:
        'O formulário de aulas exige um serviço válido.',
    INVALID_CREATED_HANDLER:
        'O formulário de aulas exige uma confirmação de cadastro válida.',
    INVALID_UPDATED_HANDLER:
        'O formulário de aulas exige uma confirmação de edição válida.',
    INVALID_CANCEL_HANDLER:
        'O formulário de aulas exige uma função de cancelamento válida.',
    INVALID_EDITING_LESSON:
        'O formulário de aulas recebeu um registro inválido para edição.',
    UNEXPECTED_CREATE_ERROR:
        'Não foi possível cadastrar o registro agora. Tente novamente em instantes.',
    UNEXPECTED_UPDATE_ERROR:
        'Não foi possível salvar as alterações agora. Tente novamente em instantes.',
    CREATE_SUCCESS: 'Registro cadastrado com sucesso.',
    UPDATE_SUCCESS: 'Alterações salvas com sucesso.',
});

/**
 * Valores iniciais correspondentes aos oito campos do protótipo original.
 */
const INITIAL_LESSON_FORM_DATA = Object.freeze({
    date: '',
    course: '',
    curricularUnit: '',
    type: 'Aula',
    lessonNumber: '',
    needsReview: false,
    lessonPlanUrl: '',
    studentGuideUrl: '',
});

/**
 * Cria uma cópia editável dos valores iniciais.
 *
 * @returns {object} Estado independente para uma instância do formulário.
 */
function createInitialLessonFormData() {
    return { ...INITIAL_LESSON_FORM_DATA };
}

/**
 * Converte uma aula pública nos oito valores editáveis do formulário.
 *
 * A validação reaproveita o contrato do cliente HTTP. Valores opcionais
 * representados por null tornam-se textos vazios somente na interface.
 *
 * @param {unknown} lesson Aula pública recebida da listagem.
 * @returns {object} Estado independente pronto para os controles.
 * @throws {TypeError} Quando a aula não pode ser editada com segurança.
 */
function createEditingLessonFormData(lesson) {
    try {
        const publicLesson = LessonApi.createPublicLesson(lesson);
        const lessonId = LessonApi.createLessonId(publicLesson.id);

        return {
            lessonId,
            formData: {
                date: publicLesson.date,
                course: publicLesson.course,
                curricularUnit: publicLesson.curricularUnit,
                type: publicLesson.type,
                lessonNumber: publicLesson.lessonNumber ?? '',
                needsReview: publicLesson.needsReview,
                lessonPlanUrl: publicLesson.lessonPlanUrl ?? '',
                studentGuideUrl: publicLesson.studentGuideUrl ?? '',
            },
        };
    } catch {
        throw new TypeError(
            LESSON_FORM_MESSAGES.INVALID_EDITING_LESSON,
        );
    }
}

/**
 * Formulário administrativo para aulas, atividades e avaliações.
 *
 * O componente mantém somente o estado visual. A seleção estrutural dos
 * campos, a normalização e a comunicação HTTP continuam pertencendo ao
 * LessonApi. Depois de uma operação válida, a representação pública recebida
 * é entregue ao responsável pela seção para atualização da consulta.
 *
 * @param {object} props Propriedades do formulário.
 * @param {{ createLesson: Function, updateLesson?: Function }}
 * [props.lessonService=lessonApi] Serviço substituível nos testes.
 * @param {object | null} [props.lessonToEdit=null] Aula selecionada.
 * @param {Function} props.onLessonCreated Confirmação do cadastro.
 * @param {Function} [props.onLessonUpdated] Confirmação da edição.
 * @param {Function} [props.onEditCancelled] Cancelamento da edição.
 * @returns {import('react').ReactElement} Formulário administrativo.
 */
function LessonForm({
    lessonService = lessonApi,
    lessonToEdit = null,
    onLessonCreated,
    onLessonUpdated,
    onEditCancelled,
} = {}) {
    const isEditing = lessonToEdit !== null;
    const isValidLessonService =
        lessonService !== null
        && typeof lessonService === 'object'
        && !Array.isArray(lessonService)
        && typeof lessonService.createLesson === 'function'
        && (
            !isEditing
            || typeof lessonService.updateLesson === 'function'
        );

    if (!isValidLessonService) {
        throw new TypeError(
            LESSON_FORM_MESSAGES.INVALID_LESSON_SERVICE,
        );
    }

    if (typeof onLessonCreated !== 'function') {
        throw new TypeError(
            LESSON_FORM_MESSAGES.INVALID_CREATED_HANDLER,
        );
    }

    if (isEditing && typeof onLessonUpdated !== 'function') {
        throw new TypeError(
            LESSON_FORM_MESSAGES.INVALID_UPDATED_HANDLER,
        );
    }

    if (isEditing && typeof onEditCancelled !== 'function') {
        throw new TypeError(
            LESSON_FORM_MESSAGES.INVALID_CANCEL_HANDLER,
        );
    }

    const editingState = isEditing
        ? createEditingLessonFormData(lessonToEdit)
        : null;
    const [formData, setFormData] = useState(
        () => editingState?.formData
            ?? createInitialLessonFormData(),
    );
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [errorMessage, setErrorMessage] = useState(null);
    const [successMessage, setSuccessMessage] = useState(null);

    /**
     * Sincroniza os controles quando a seção escolhe outra aula ou encerra
     * a edição sem desmontar o formulário.
     */
    useEffect(() => {
        setFormData(
            lessonToEdit === null
                ? createInitialLessonFormData()
                : createEditingLessonFormData(lessonToEdit).formData,
        );
        setErrorMessage(null);
        setSuccessMessage(null);
    }, [lessonToEdit]);

    /**
     * Atualiza textos e seleções sem alterar os demais campos.
     *
     * @param {import('react').ChangeEvent<HTMLInputElement
     * | HTMLSelectElement>} event Alteração de um controle.
     */
    function handleChange(event) {
        const { name, type, value, checked } = event.target;

        setFormData((currentData) => ({
            ...currentData,
            [name]: type === 'checkbox' ? checked : value,
        }));

        if (errorMessage !== null) {
            setErrorMessage(null);
        }

        if (successMessage !== null) {
            setSuccessMessage(null);
        }
    }

    /**
     * Solicita o cadastro ou a substituição completa dos dados atuais.
     *
     * O cadastro limpa os controles somente depois da confirmação. A edição
     * mantém o estado confirmado até que a seção encerre ou troque o registro.
     *
     * @param {import('react').FormEvent<HTMLFormElement>} event Envio.
     * @returns {Promise<void>}
     */
    async function handleSubmit(event) {
        event.preventDefault();

        if (isSubmitting) {
            return;
        }

        setIsSubmitting(true);
        setErrorMessage(null);
        setSuccessMessage(null);

        try {
            if (isEditing) {
                const updatedLesson = await lessonService.updateLesson(
                    editingState.lessonId,
                    formData,
                );
                const confirmedState =
                    createEditingLessonFormData(updatedLesson);

                setFormData(confirmedState.formData);
                setSuccessMessage(
                    LESSON_FORM_MESSAGES.UPDATE_SUCCESS,
                );
                onLessonUpdated(updatedLesson);
            } else {
                const createdLesson =
                    await lessonService.createLesson(formData);

                setFormData(createInitialLessonFormData());
                setSuccessMessage(
                    LESSON_FORM_MESSAGES.CREATE_SUCCESS,
                );
                onLessonCreated(createdLesson);
            }
        } catch (error) {
            const publicMessage = error instanceof LessonApiError
                ? error.message
                : isEditing
                    ? LESSON_FORM_MESSAGES.UNEXPECTED_UPDATE_ERROR
                    : LESSON_FORM_MESSAGES.UNEXPECTED_CREATE_ERROR;

            setErrorMessage(publicMessage);
        } finally {
            setIsSubmitting(false);
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
                        name="course"
                        value={formData.course}
                        required
                        disabled={isSubmitting}
                        onChange={handleChange}
                    >
                        <option value="">Selecione um curso</option>
                        {LESSON_API_COURSES.map((course) => (
                            <option key={course} value={course}>
                                {course}
                            </option>
                        ))}
                    </select>
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

                    <button type="submit" disabled={isSubmitting}>
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
