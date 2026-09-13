import { useState } from 'react';

/**
 * Identificadores estáveis utilizados pelos elementos do formulário.
 *
 * Além de relacionar rótulos, campos e mensagens de forma acessível, essas
 * constantes evitam pequenas divergências entre os atributos do componente.
 */
const LOGIN_FORM_IDS = Object.freeze({
    FORM: 'administrative-login-form',
    EMAIL: 'administrative-login-email',
    PASSWORD: 'administrative-login-password',
    ERROR: 'administrative-login-error',
});

/**
 * Mensagens estáveis relacionadas à configuração do componente.
 */
const LOGIN_FORM_MESSAGES = Object.freeze({
    INVALID_SUBMIT_HANDLER:
        'O formulário de acesso exige uma função de envio válida.',
    INVALID_SUBMITTING_STATE:
        'O estado de envio do formulário deve ser booleano.',
    INVALID_ERROR_MESSAGE:
        'A mensagem de erro do formulário deve ser um texto ou nula.',
});

/**
 * Formulário de entrada da área administrativa.
 *
 * O componente mantém apenas os valores digitados e entrega uma cópia mínima
 * das credenciais ao responsável pelo fluxo de autenticação. Ele não conhece
 * caminhos HTTP, respostas do servidor, cookies ou detalhes da sessão.
 *
 * @param {object} props Propriedades do componente.
 * @param {Function} props.onSubmit Função que recebe e-mail e senha.
 * @param {boolean} [props.isSubmitting=false] Indica uma requisição em curso.
 * @param {string | null} [props.errorMessage=null] Erro público apresentado.
 * @returns {import('react').ReactElement} Formulário administrativo.
 */
function LoginForm({
    onSubmit,
    isSubmitting = false,
    errorMessage = null,
}) {
    if (typeof onSubmit !== 'function') {
        throw new TypeError(
            LOGIN_FORM_MESSAGES.INVALID_SUBMIT_HANDLER,
        );
    }

    if (typeof isSubmitting !== 'boolean') {
        throw new TypeError(
            LOGIN_FORM_MESSAGES.INVALID_SUBMITTING_STATE,
        );
    }

    if (
        errorMessage !== null
        && typeof errorMessage !== 'string'
    ) {
        throw new TypeError(
            LOGIN_FORM_MESSAGES.INVALID_ERROR_MESSAGE,
        );
    }

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');

    const normalizedEmail = email.trim();
    const hasVisibleError =
        typeof errorMessage === 'string'
        && errorMessage.trim().length > 0;

    const canSubmit =
        !isSubmitting
        && normalizedEmail.length > 0
        && password.length > 0;

    /**
     * Impede o recarregamento da página e entrega somente os dois campos
     * esperados. Os espaços externos do e-mail são removidos, enquanto a
     * senha permanece exatamente como foi digitada.
     *
     * @param {import('react').FormEvent<HTMLFormElement>} event Evento React.
     * @returns {void}
     */
    function handleSubmit(event) {
        event.preventDefault();

        if (!canSubmit) {
            return;
        }

        onSubmit(Object.freeze({
            email: normalizedEmail,
            password,
        }));
    }

    return (
        <form
            id={LOGIN_FORM_IDS.FORM}
            className="login-form"
            aria-label="Entrada administrativa"
            aria-busy={isSubmitting}
            noValidate
            onSubmit={handleSubmit}
        >
            <div className="login-form-field">
                <label htmlFor={LOGIN_FORM_IDS.EMAIL}>
                    E-mail
                </label>

                <input
                    id={LOGIN_FORM_IDS.EMAIL}
                    name="email"
                    type="email"
                    inputMode="email"
                    autoComplete="username"
                    maxLength={254}
                    required
                    disabled={isSubmitting}
                    aria-describedby={
                        hasVisibleError
                            ? LOGIN_FORM_IDS.ERROR
                            : undefined
                    }
                    value={email}
                    onChange={(event) => {
                        setEmail(event.target.value);
                    }}
                />
            </div>

            <div className="login-form-field">
                <label htmlFor={LOGIN_FORM_IDS.PASSWORD}>
                    Senha
                </label>

                <input
                    id={LOGIN_FORM_IDS.PASSWORD}
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    required
                    disabled={isSubmitting}
                    aria-describedby={
                        hasVisibleError
                            ? LOGIN_FORM_IDS.ERROR
                            : undefined
                    }
                    value={password}
                    onChange={(event) => {
                        setPassword(event.target.value);
                    }}
                />
            </div>

            {hasVisibleError && (
                <p
                    id={LOGIN_FORM_IDS.ERROR}
                    className="login-form-error"
                    role="alert"
                >
                    {errorMessage}
                </p>
            )}

            <button
                className="login-form-submit"
                type="submit"
                disabled={!canSubmit}
            >
                {isSubmitting ? 'Entrando...' : 'Entrar'}
            </button>
        </form>
    );
}

export {
    LOGIN_FORM_IDS,
    LOGIN_FORM_MESSAGES,
    LoginForm,
};
