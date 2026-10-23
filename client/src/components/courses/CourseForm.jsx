import { useId, useState } from 'react';
import { CourseApi, COURSE_API_FIELD_LIMITS } from '../../services/CourseApi.js';

const COURSE_FORM_MESSAGES = Object.freeze({
    INVALID_SUBMIT_HANDLER: 'O formulário de cursos exige uma função de envio válida.',
    INVALID_CANCEL_HANDLER: 'O formulário de cursos exige uma função de cancelamento válida.',
    INVALID_SUBMITTING_STATE: 'O estado de envio do formulário deve ser booleano.',
    INVALID_ERROR_MESSAGE: 'A mensagem de erro do formulário deve ser um texto ou nula.',
    INVALID_EDITING_COURSE: 'O formulário recebeu um curso inválido para edição.',
    INVALID_NAME: 'Informe um nome com 2 a 120 caracteres.',
    INVALID_CODE: 'Informe uma sigla com 1 a 20 caracteres.',
});

/**
 * Aponta o primeiro campo inválido para apresentar uma orientação e focá-lo.
 * Os limites são aplicados depois da mesma normalização usada pela API.
 * Siglas com sinais, espaços internos ou acentos continuam permitidas.
 */
function validateCourseFields(fields) {
    const name = fields.name.normalize('NFC').trim().replace(/\s+/g, ' ');
    const code = fields.code.normalize('NFC').trim().replace(/\s+/g, ' ').toUpperCase();
    if (name.length < COURSE_API_FIELD_LIMITS.MIN_NAME_LENGTH
        || name.length > COURSE_API_FIELD_LIMITS.MAX_NAME_LENGTH) {
        return { field: 'name', message: COURSE_FORM_MESSAGES.INVALID_NAME };
    }
    if (code.length < COURSE_API_FIELD_LIMITS.MIN_CODE_LENGTH
        || code.length > COURSE_API_FIELD_LIMITS.MAX_CODE_LENGTH) {
        return { field: 'code', message: COURSE_FORM_MESSAGES.INVALID_CODE };
    }
    return null;
}

/**
 * Mantém somente os campos e a validação visual. A tela que montar este
 * componente controla a operação HTTP, o erro público e o estado de envio.
 */
function CourseFormFields({ course, onSubmit, onCancel, isSubmitting, errorMessage }) {
    const prefix = useId();
    const [fields, setFields] = useState(() => ({ name: course?.name ?? '', code: course?.code ?? '' }));
    const [validationError, setValidationError] = useState(null);
    const isEditing = course !== null;
    const visibleError = validationError?.message || (errorMessage?.trim() ? errorMessage : null);
    const errorId = `${prefix}-error`;
    const titleId = `${prefix}-title`;
    const canSubmit = !isSubmitting && fields.name.trim().length > 0 && fields.code.trim().length > 0;

    function handleChange(event) {
        if (isSubmitting) return;
        const { name, value } = event.target;
        setFields(previous => ({ ...previous, [name]: value }));
        setValidationError(null);
    }

    function handleSubmit(event) {
        event.preventDefault();
        if (!canSubmit) return;
        const error = validateCourseFields(fields);
        setValidationError(error);
        if (error) {
            event.currentTarget.elements.namedItem(error.field)?.focus();
            return;
        }
        // Identificador e situação pertencem à tela/API, não ao corpo editável.
        onSubmit(CourseApi.createCourseData(fields));
    }

    return (
        <section className="course-form-section" aria-labelledby={titleId}>
            <h3 id={titleId}>{isEditing ? 'Editar curso' : 'Novo curso'}</h3>
            <p className="course-form-description">
                {course?.active === false
                    ? 'Este curso está desativado. Editar nome e sigla não o reativa.'
                    : 'Informe o nome e a sigla que identificarão o curso no seu catálogo.'}
            </p>
            <form
                className="course-form"
                aria-label={isEditing ? 'Edição de curso' : 'Cadastro de curso'}
                aria-busy={isSubmitting}
                aria-describedby={visibleError ? errorId : undefined}
                noValidate
                onSubmit={handleSubmit}
            >
                <div className="course-form-field">
                    <label htmlFor={`${prefix}-name`}>Nome do curso</label>
                    <input
                        id={`${prefix}-name`}
                        name="name"
                        type="text"
                        autoComplete="off"
                        value={fields.name}
                        required
                        disabled={isSubmitting}
                        aria-invalid={validationError?.field === 'name' || undefined}
                        aria-describedby={`${prefix}-name-help${validationError?.field === 'name' ? ` ${errorId}` : ''}`}
                        onChange={handleChange}
                    />
                    <p id={`${prefix}-name-help`} className="course-form-help">
                        Use de 2 a 120 caracteres.
                    </p>
                </div>
                <div className="course-form-field">
                    <label htmlFor={`${prefix}-code`}>Sigla</label>
                    <input
                        id={`${prefix}-code`}
                        name="code"
                        type="text"
                        autoComplete="off"
                        value={fields.code}
                        required
                        disabled={isSubmitting}
                        aria-invalid={validationError?.field === 'code' || undefined}
                        aria-describedby={`${prefix}-code-help${validationError?.field === 'code' ? ` ${errorId}` : ''}`}
                        onChange={handleChange}
                    />
                    <p id={`${prefix}-code-help`} className="course-form-help">
                        Use de 1 a 20 caracteres. Ao salvar, as letras serão convertidas para maiúsculas.
                    </p>
                </div>
                {visibleError && <p id={errorId} className="course-form-error" role="alert">{visibleError}</p>}
                <div className="course-form-actions">
                    <button type="button" disabled={isSubmitting} onClick={() => {
                        if (!isSubmitting) onCancel();
                    }}>Cancelar</button>
                    <button type="submit" disabled={!canSubmit}>
                        {isSubmitting ? 'Salvando...' : isEditing ? 'Salvar alterações' : 'Cadastrar curso'}
                    </button>
                </div>
            </form>
        </section>
    );
}

/**
 * Formulário reutilizável para criar e editar cursos de uma instalação.
 *
 * A identidade selecionada funciona como chave do estado interno: escolher
 * outro curso ou voltar ao cadastro limpa os campos e erros anteriores.
 * Reapresentar o mesmo curso não apaga uma edição ainda não enviada.
 * A tela deverá fechar ou remontar o formulário depois de salvar com sucesso.
 *
 * @param {object} props Propriedades do formulário.
 * @param {Function} props.onSubmit Recebe somente nome e sigla normalizados.
 * @param {Function} props.onCancel Solicita o fechamento sem gravar.
 * @param {object | null} [props.courseToEdit=null] Curso público selecionado.
 * @param {boolean} [props.isSubmitting=false] Gravação controlada pela tela.
 * @param {string | null} [props.errorMessage=null] Mensagem pública da operação.
 * @returns {import('react').ReactElement} Formulário acessível de cursos.
 */
function CourseForm({
    onSubmit,
    onCancel,
    courseToEdit = null,
    isSubmitting = false,
    errorMessage = null,
} = {}) {
    if (typeof onSubmit !== 'function') throw new TypeError(COURSE_FORM_MESSAGES.INVALID_SUBMIT_HANDLER);
    if (typeof onCancel !== 'function') throw new TypeError(COURSE_FORM_MESSAGES.INVALID_CANCEL_HANDLER);
    if (typeof isSubmitting !== 'boolean') throw new TypeError(COURSE_FORM_MESSAGES.INVALID_SUBMITTING_STATE);
    if (errorMessage !== null && typeof errorMessage !== 'string') {
        throw new TypeError(COURSE_FORM_MESSAGES.INVALID_ERROR_MESSAGE);
    }
    let course = null;
    if (courseToEdit !== null) {
        try { course = CourseApi.createPublicCourse(courseToEdit); } catch {
            throw new TypeError(COURSE_FORM_MESSAGES.INVALID_EDITING_COURSE);
        }
    }
    return (
        <CourseFormFields
            key={course?.id ?? 'new-course'}
            course={course}
            onSubmit={onSubmit}
            onCancel={onCancel}
            isSubmitting={isSubmitting}
            errorMessage={errorMessage}
        />
    );
}

export { CourseForm, COURSE_FORM_MESSAGES };
