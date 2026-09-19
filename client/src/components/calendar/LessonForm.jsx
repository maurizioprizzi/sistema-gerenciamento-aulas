import { useState } from 'react';

import {
    LESSON_API_COURSES,
    LESSON_API_TYPES,
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
        'O formulário de aulas exige um serviço de criação válido.',
    INVALID_CREATED_HANDLER:
        'O formulário de aulas exige uma função de confirmação válida.',
    UNEXPECTED_ERROR:
        'Não foi possível cadastrar o registro agora. Tente novamente em instantes.',
    SUCCESS: 'Registro cadastrado com sucesso.',
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
 * Formulário administrativo para aulas, atividades e avaliações.
 *
 * O componente mantém somente o estado visual. A seleção estrutural dos
 * campos, a normalização e a comunicação HTTP continuam pertencendo ao
 * LessonApi. Depois de uma criação válida, a representação pública recebida
 * é entregue ao responsável pela seção para atualização da consulta.
 *
 * @param {object} props Propriedades do formulário.
 * @param {{ createLesson: Function }} [props.lessonService=lessonApi]
 * Serviço substituível nos testes.
 * @param {Function} props.onLessonCreated Confirmação da aula criada.
 * @returns {import('react').ReactElement} Formulário administrativo.
 */
function LessonForm({
    lessonService = lessonApi,
    onLessonCreated,
} = {}) {
    const isValidLessonService =
        lessonService !== null
        && typeof lessonService === 'object'
        && !Array.isArray(lessonService)
        && typeof lessonService.createLesson === 'function';

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

    const [formData, setFormData] = useState(
        createInitialLessonFormData,
    );
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [errorMessage, setErrorMessage] = useState(null);
    const [successMessage, setSuccessMessage] = useState(null);

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
     * Solicita a criação e só limpa os campos depois da confirmação da API.
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
            const createdLesson = await lessonService.createLesson(
                formData,
            );

            setFormData(createInitialLessonFormData());
            setSuccessMessage(LESSON_FORM_MESSAGES.SUCCESS);
            onLessonCreated(createdLesson);
        } catch (error) {
            const publicMessage = error instanceof LessonApiError
                ? error.message
                : LESSON_FORM_MESSAGES.UNEXPECTED_ERROR;

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
                    Cadastrar registro
                </h3>
                <p>
                    Inclua uma aula, atividade ou avaliação no calendário.
                </p>
            </div>

            <form
                className="lesson-form"
                aria-label="Cadastro de aula"
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
                    <button type="submit" disabled={isSubmitting}>
                        {isSubmitting
                            ? 'Cadastrando...'
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
    createInitialLessonFormData,
};
