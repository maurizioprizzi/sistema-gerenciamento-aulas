import { useState } from 'react';

import {
    MonthlyMaterialApiError,
    monthlyMaterialApi,
} from '../../services/MonthlyMaterialApi.js';

/**
 * Identificadores estáveis utilizados pelo formulário mensal.
 */
const MONTHLY_MATERIAL_FORM_IDS = Object.freeze({
    TITLE: 'monthly-material-form-title',
    ERROR: 'monthly-material-form-error',
});

/**
 * Mensagens públicas e de configuração do formulário.
 */
const MONTHLY_MATERIAL_FORM_MESSAGES = Object.freeze({
    INVALID_MATERIAL_SERVICE:
        'O formulário mensal exige um serviço de gravação válido.',
    INVALID_SAVED_HANDLER:
        'O formulário mensal exige uma confirmação de gravação válida.',
    INVALID_CANCEL_HANDLER:
        'O formulário mensal exige uma função de cancelamento válida.',
    UNEXPECTED_ERROR:
        'Não foi possível salvar os materiais agora. Tente novamente em instantes.',
});

/**
 * Estado inicial correspondente aos três controles do modal original.
 */
const INITIAL_MONTHLY_MATERIAL_FORM_DATA = Object.freeze({
    month: '',
    lessonPlanUrl: '',
    studentGuideUrl: '',
});

/**
 * Cria uma cópia editável dos valores iniciais.
 *
 * @returns {object} Estado independente para uma instância do formulário.
 */
function createInitialMonthlyMaterialFormData() {
    return { ...INITIAL_MONTHLY_MATERIAL_FORM_DATA };
}

/**
 * Formulário do modal de materiais aplicáveis a um mês inteiro.
 *
 * O mês identifica o recurso e não integra o corpo enviado à API. Os dois
 * links permanecem opcionais, reproduzindo o contrato do protótipo original.
 * Normalização, validação estrutural e comunicação HTTP continuam isoladas
 * no MonthlyMaterialApi.
 *
 * @param {object} props Propriedades do formulário.
 * @param {{ saveMonthlyMaterial: Function }}
 * [props.monthlyMaterialService=monthlyMaterialApi] Serviço substituível.
 * @param {Function} props.onMaterialSaved Confirmação da gravação.
 * @param {Function} props.onCancel Solicitação de fechamento sem gravação.
 * @returns {import('react').ReactElement} Formulário administrativo.
 */
function MonthlyMaterialForm({
    monthlyMaterialService = monthlyMaterialApi,
    onMaterialSaved,
    onCancel,
} = {}) {
    const isValidMaterialService =
        monthlyMaterialService !== null
        && typeof monthlyMaterialService === 'object'
        && !Array.isArray(monthlyMaterialService)
        && typeof monthlyMaterialService.saveMonthlyMaterial
            === 'function';

    if (!isValidMaterialService) {
        throw new TypeError(
            MONTHLY_MATERIAL_FORM_MESSAGES.INVALID_MATERIAL_SERVICE,
        );
    }

    if (typeof onMaterialSaved !== 'function') {
        throw new TypeError(
            MONTHLY_MATERIAL_FORM_MESSAGES.INVALID_SAVED_HANDLER,
        );
    }

    if (typeof onCancel !== 'function') {
        throw new TypeError(
            MONTHLY_MATERIAL_FORM_MESSAGES.INVALID_CANCEL_HANDLER,
        );
    }

    const [formData, setFormData] = useState(
        createInitialMonthlyMaterialFormData,
    );
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [errorMessage, setErrorMessage] = useState(null);

    /**
     * Atualiza somente o controle alterado e remove a mensagem anterior.
     *
     * @param {import('react').ChangeEvent<HTMLInputElement>} event Alteração.
     */
    function handleChange(event) {
        const { name, value } = event.target;

        setFormData((currentData) => ({
            ...currentData,
            [name]: value,
        }));

        if (errorMessage !== null) {
            setErrorMessage(null);
        }
    }

    /**
     * Solicita a substituição mensal e confirma somente o estado validado.
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

        try {
            const savedMaterial = await monthlyMaterialService
                .saveMonthlyMaterial(
                    formData.month,
                    {
                        lessonPlanUrl: formData.lessonPlanUrl,
                        studentGuideUrl: formData.studentGuideUrl,
                    },
                );

            onMaterialSaved(savedMaterial);
        } catch (error) {
            const publicMessage =
                error instanceof MonthlyMaterialApiError
                    ? error.message
                    : MONTHLY_MATERIAL_FORM_MESSAGES.UNEXPECTED_ERROR;

            setErrorMessage(publicMessage);
        } finally {
            setIsSubmitting(false);
        }
    }

    return (
        <section
            className="monthly-material-form-section"
            aria-labelledby={MONTHLY_MATERIAL_FORM_IDS.TITLE}
        >
            <h3 id={MONTHLY_MATERIAL_FORM_IDS.TITLE}>
                Adicionar materiais do mês
            </h3>

            <form
                className="monthly-material-form"
                aria-label="Materiais do mês"
                aria-describedby={
                    errorMessage
                        ? MONTHLY_MATERIAL_FORM_IDS.ERROR
                        : undefined
                }
                onSubmit={handleSubmit}
            >
                <div className="monthly-material-form-field">
                    <label htmlFor="monthly-material-month">
                        Mês
                    </label>
                    <input
                        id="monthly-material-month"
                        name="month"
                        type="month"
                        value={formData.month}
                        required
                        disabled={isSubmitting}
                        onChange={handleChange}
                    />
                </div>

                <div className="monthly-material-form-field">
                    <label htmlFor="monthly-material-lesson-plan-url">
                        Link do Plano de Aula
                    </label>
                    <input
                        id="monthly-material-lesson-plan-url"
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

                <div className="monthly-material-form-field">
                    <label htmlFor="monthly-material-student-guide-url">
                        Link do Guia e das Atividades
                    </label>
                    <input
                        id="monthly-material-student-guide-url"
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

                {errorMessage && (
                    <p
                        id={MONTHLY_MATERIAL_FORM_IDS.ERROR}
                        className="monthly-material-form-error"
                        role="alert"
                    >
                        {errorMessage}
                    </p>
                )}

                <div className="monthly-material-form-actions">
                    <button
                        type="button"
                        disabled={isSubmitting}
                        onClick={onCancel}
                    >
                        Cancelar
                    </button>
                    <button type="submit" disabled={isSubmitting}>
                        {isSubmitting
                            ? 'Salvando...'
                            : 'Salvar materiais'}
                    </button>
                </div>
            </form>
        </section>
    );
}

export {
    INITIAL_MONTHLY_MATERIAL_FORM_DATA,
    MONTHLY_MATERIAL_FORM_IDS,
    MONTHLY_MATERIAL_FORM_MESSAGES,
    MonthlyMaterialForm,
    createInitialMonthlyMaterialFormData,
};
