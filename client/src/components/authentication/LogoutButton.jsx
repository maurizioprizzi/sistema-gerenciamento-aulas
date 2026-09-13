/**
 * Identificador estável do controle utilizado para encerrar a sessão.
 */
const LOGOUT_BUTTON_ID = 'administrative-logout-button';

/**
 * Mensagens estáveis relacionadas à configuração do componente.
 */
const LOGOUT_BUTTON_MESSAGES = Object.freeze({
    INVALID_LOGOUT_HANDLER:
        'O botão de saída exige uma função válida.',
    INVALID_SUBMITTING_STATE:
        'O estado de saída deve ser booleano.',
});

/**
 * Controle responsável por solicitar o encerramento da sessão.
 *
 * O componente não conhece caminhos HTTP, cookies ou respostas do servidor.
 * Ele apenas informa a intenção de saída e representa visualmente quando essa
 * operação está em andamento.
 *
 * @param {object} props Propriedades do componente.
 * @param {Function} props.onLogout Função chamada para encerrar a sessão.
 * @param {boolean} [props.isSubmitting=false] Indica uma saída em curso.
 * @returns {import('react').ReactElement} Botão de encerramento da sessão.
 */
function LogoutButton({
    onLogout,
    isSubmitting = false,
}) {
    if (typeof onLogout !== 'function') {
        throw new TypeError(
            LOGOUT_BUTTON_MESSAGES.INVALID_LOGOUT_HANDLER,
        );
    }

    if (typeof isSubmitting !== 'boolean') {
        throw new TypeError(
            LOGOUT_BUTTON_MESSAGES.INVALID_SUBMITTING_STATE,
        );
    }

    /**
     * Evita uma nova solicitação enquanto a anterior estiver pendente.
     *
     * @returns {void}
     */
    function handleClick() {
        if (isSubmitting) {
            return;
        }

        onLogout();
    }

    return (
        <button
            id={LOGOUT_BUTTON_ID}
            className="authentication-logout"
            type="button"
            disabled={isSubmitting}
            aria-busy={isSubmitting}
            onClick={handleClick}
        >
            {isSubmitting ? 'Saindo...' : 'Sair'}
        </button>
    );
}

export {
    LOGOUT_BUTTON_ID,
    LOGOUT_BUTTON_MESSAGES,
    LogoutButton,
};
