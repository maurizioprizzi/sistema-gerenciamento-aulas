import { useState } from 'react';

const INITIAL_SETUP_FORM_IDS = Object.freeze({
    FORM: 'initial-setup-form',
    NAME: 'initial-setup-name',
    EMAIL: 'initial-setup-email',
    PASSWORD: 'initial-setup-password',
    PASSWORD_CONFIRMATION: 'initial-setup-password-confirmation',
    INVITATION: 'initial-setup-invitation',
    PASSWORD_HELP: 'initial-setup-password-help',
    INVITATION_HELP: 'initial-setup-invitation-help',
    ERROR: 'initial-setup-error',
});

const INITIAL_SETUP_FORM_MESSAGES = Object.freeze({
    INVALID_SUBMIT_HANDLER:
        'O formulário de primeiro cadastro exige uma função de envio válida.',
    INVALID_SUBMITTING_STATE:
        'O estado de envio do formulário deve ser booleano.',
    INVALID_ERROR_MESSAGE:
        'A mensagem de erro do formulário deve ser um texto ou nula.',
    INVALID_NAME:
        'Informe seu nome com 2 a 120 caracteres.',
    INVALID_EMAIL:
        'Informe um e-mail válido com no máximo 254 caracteres.',
    INVALID_PASSWORD:
        'Use uma senha com pelo menos 12 caracteres, que não contenha somente espaços.',
    PASSWORD_TOO_LONG:
        'A senha ultrapassa o tamanho máximo permitido. Use uma senha mais curta.',
    PASSWORD_MISMATCH:
        'A confirmação deve ser igual à senha digitada.',
    INVALID_INVITATION:
        'Informe o código de primeiro acesso completo, com 64 letras de A a F ou algarismos.',
});

const INITIAL_FIELDS = Object.freeze({
    name: '',
    email: '',
    password: '',
    passwordConfirmation: '',
    invitationToken: '',
});

/**
 * O formulário conhece os campos e suas orientações de preenchimento.
 * Não importa o cliente HTTP nem acessa sessão, links ou armazenamento.
 */
const FIELD_DEFINITIONS = Object.freeze([
    Object.freeze({
        name: 'name', id: INITIAL_SETUP_FORM_IDS.NAME,
        label: 'Seu nome', type: 'text', autoComplete: 'name', maxLength: 120,
    }),
    Object.freeze({
        name: 'email', id: INITIAL_SETUP_FORM_IDS.EMAIL,
        label: 'E-mail', type: 'email', autoComplete: 'username',
        inputMode: 'email', maxLength: 254,
    }),
    Object.freeze({
        name: 'password', id: INITIAL_SETUP_FORM_IDS.PASSWORD,
        label: 'Senha', type: 'password', autoComplete: 'new-password',
        helpId: INITIAL_SETUP_FORM_IDS.PASSWORD_HELP,
        help: 'Use pelo menos 12 caracteres. Espaços fazem parte da sua senha.',
    }),
    Object.freeze({
        name: 'passwordConfirmation', id: INITIAL_SETUP_FORM_IDS.PASSWORD_CONFIRMATION,
        label: 'Confirme a senha', type: 'password', autoComplete: 'new-password',
    }),
    Object.freeze({
        name: 'invitationToken', id: INITIAL_SETUP_FORM_IDS.INVITATION,
        label: 'Código de primeiro acesso', type: 'password', autoComplete: 'off',
        helpId: INITIAL_SETUP_FORM_IDS.INVITATION_HELP,
        help: 'Cole o código gerado durante a instalação desta cópia da aplicação.',
    }),
]);

/**
 * Valida antes de encaminhar o pedido. O servidor continua responsável pela
 * disponibilidade do cadastro, autenticidade do convite e regras da conta.
 * Nenhuma mensagem de validação incorpora o conteúdo digitado.
 */
function validateFields(fields) {
    const name = fields.name.trim().replace(/\s+/g, ' ');
    const email = fields.email.trim().toLowerCase();

    if (name.length < 2 || name.length > 120) {
        return { field: 'name', message: INITIAL_SETUP_FORM_MESSAGES.INVALID_NAME };
    }
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return { field: 'email', message: INITIAL_SETUP_FORM_MESSAGES.INVALID_EMAIL };
    }
    if (fields.password.length < 12 || fields.password.trim().length === 0) {
        return { field: 'password', message: INITIAL_SETUP_FORM_MESSAGES.INVALID_PASSWORD };
    }
    // Conta bytes UTF-8 sem truncar a senha, inclusive quando há emojis.
    if (new TextEncoder().encode(fields.password).byteLength > 72) {
        return { field: 'password', message: INITIAL_SETUP_FORM_MESSAGES.PASSWORD_TOO_LONG };
    }
    if (fields.passwordConfirmation !== fields.password) {
        return {
            field: 'passwordConfirmation',
            message: INITIAL_SETUP_FORM_MESSAGES.PASSWORD_MISMATCH,
        };
    }
    if (!/^[a-fA-F0-9]{64}$/.test(fields.invitationToken)) {
        return { field: 'invitationToken', message: INITIAL_SETUP_FORM_MESSAGES.INVALID_INVITATION };
    }
    return null;
}

/**
 * Campos do primeiro cadastro de uma instalação independente.
 *
 * A camada que montar o formulário será responsável por consultar a API,
 * controlar o envio, tratar as recusas e trocar para a tela de login após
 * sucesso. Os campos são preservados durante uma recusa, permitindo corrigir
 * o preenchimento. Desmontar o formulário descarta seu estado local.
 *
 * @param {object} props Propriedades do componente.
 * @param {Function} props.onSubmit Recebe convite, nome, e-mail e senha.
 * @param {boolean} [props.isSubmitting=false] Indica um envio em andamento.
 * @param {string | null} [props.errorMessage=null] Mensagem pública da operação.
 * @returns {import('react').ReactElement} Formulário de primeiro cadastro.
 */
function InitialSetupForm({
    onSubmit,
    isSubmitting = false,
    errorMessage = null,
}) {
    if (typeof onSubmit !== 'function') {
        throw new TypeError(INITIAL_SETUP_FORM_MESSAGES.INVALID_SUBMIT_HANDLER);
    }
    if (typeof isSubmitting !== 'boolean') {
        throw new TypeError(INITIAL_SETUP_FORM_MESSAGES.INVALID_SUBMITTING_STATE);
    }
    if (errorMessage !== null && typeof errorMessage !== 'string') {
        throw new TypeError(INITIAL_SETUP_FORM_MESSAGES.INVALID_ERROR_MESSAGE);
    }

    const [fields, setFields] = useState(INITIAL_FIELDS);
    const [validationError, setValidationError] = useState(null);

    const visibleError = validationError?.message
        || (errorMessage?.trim() ? errorMessage : null);
    const canSubmit = !isSubmitting
        && Object.values(fields).every((value) => value.trim().length > 0);

    function handleChange(field, value) {
        if (isSubmitting) return;
        setFields((previous) => ({ ...previous, [field]: value }));
        setValidationError(null);
    }

    function handleSubmit(event) {
        event.preventDefault();
        if (!canSubmit) return;

        const error = validateFields(fields);
        setValidationError(error);
        if (error) {
            event.currentTarget.elements.namedItem(error.field)?.focus();
            return;
        }

        // A confirmação é um auxílio de digitação e não faz parte da API.
        onSubmit(Object.freeze({
            invitationToken: fields.invitationToken,
            name: fields.name.trim().replace(/\s+/g, ' '),
            email: fields.email.trim().toLowerCase(),
            password: fields.password,
        }));
    }

    return (
        <form
            id={INITIAL_SETUP_FORM_IDS.FORM}
            className="login-form"
            aria-label="Primeiro cadastro administrativo"
            aria-busy={isSubmitting}
            noValidate
            onSubmit={handleSubmit}
        >
            {FIELD_DEFINITIONS.map((field) => {
                const describedBy = [
                    field.helpId,
                    visibleError ? INITIAL_SETUP_FORM_IDS.ERROR : null,
                ].filter(Boolean).join(' ') || undefined;

                return (
                    <div className="login-form-field" key={field.name}>
                        <label htmlFor={field.id}>{field.label}</label>
                        <input
                            id={field.id}
                            name={field.name}
                            type={field.type}
                            autoComplete={field.autoComplete}
                            inputMode={field.inputMode}
                            maxLength={field.maxLength}
                            autoCapitalize="none"
                            spellCheck={false}
                            required
                            disabled={isSubmitting}
                            aria-describedby={describedBy}
                            aria-invalid={validationError?.field === field.name || undefined}
                            value={fields[field.name]}
                            onChange={(event) => handleChange(field.name, event.target.value)}
                        />
                        {field.help && <p id={field.helpId}>{field.help}</p>}
                    </div>
                );
            })}

            {visibleError && (
                <p
                    id={INITIAL_SETUP_FORM_IDS.ERROR}
                    className="login-form-error"
                    role="alert"
                >
                    {visibleError}
                </p>
            )}

            <button className="login-form-submit" type="submit" disabled={!canSubmit}>
                {isSubmitting ? 'Criando sua conta...' : 'Criar minha conta'}
            </button>
        </form>
    );
}

export {
    INITIAL_SETUP_FORM_IDS,
    INITIAL_SETUP_FORM_MESSAGES,
    InitialSetupForm,
};
