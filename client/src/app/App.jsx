import {
    useEffect,
    useState,
} from 'react';

import {
    AuthenticationApiError,
    authenticationApi,
} from '../services/AuthenticationApi.js';
import { LoginForm } from '../components/authentication/LoginForm.jsx';
import { CalendarWorkspace } from '../components/calendar/CalendarWorkspace.jsx';

const DATE_LOCALE = 'pt-BR';
const AUTHENTICATION_REQUIRED_CODE = 'AUTHENTICATION_REQUIRED';

/**
 * Mensagens estáveis relacionadas à composição principal da interface.
 */
const APP_MESSAGES = Object.freeze({
    INVALID_AUTHENTICATION_SERVICE:
        'A aplicação exige um serviço de autenticação válido.',
    CHECKING_SESSION:
        'Verificando sua sessão...',
    SESSION_CHECK_FAILED:
        'Não foi possível verificar a sessão anterior. Você ainda pode entrar novamente.',
    UNEXPECTED_LOGIN_ERROR:
        'Não foi possível entrar agora. Tente novamente em instantes.',
    UNEXPECTED_LOGOUT_ERROR:
        'Não foi possível sair agora. Tente novamente em instantes.',
});

/**
 * Produz os textos exibidos pelo pequeno calendário da tela de acesso.
 *
 * A data é lida no navegador para respeitar o dia local do usuário. A parte
 * utilizada pelo atributo dateTime também é montada com valores locais; usar
 * toISOString() poderia deslocar o dia em alguns fusos horários.
 *
 * @param {Date} date Data que será apresentada.
 * @returns {{ month: string, day: string, machineDate: string,
 * accessibleLabel: string }} Valores prontos para a interface.
 */
function createCurrentDatePresentation(date = new Date()) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
        throw new TypeError(
            'Uma data válida é necessária para montar o calendário.',
        );
    }

    const month = new Intl.DateTimeFormat(
        DATE_LOCALE,
        { month: 'long' },
    ).format(date);

    const day = new Intl.DateTimeFormat(
        DATE_LOCALE,
        { day: '2-digit' },
    ).format(date);

    const accessibleDate = new Intl.DateTimeFormat(
        DATE_LOCALE,
        { dateStyle: 'long' },
    ).format(date);

    const machineDate = [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, '0'),
        String(date.getDate()).padStart(2, '0'),
    ].join('-');

    return {
        month,
        day,
        machineDate,
        accessibleLabel: 'Hoje, ' + accessibleDate + '.',
    };
}

/**
 * Verifica se a consulta encontrou apenas a ausência normal de autenticação.
 *
 * Uma resposta 401 com o código documentado significa que o visitante pode
 * receber o formulário. Outros problemas continuam sendo tratados como falha
 * de verificação, sem exposição de detalhes técnicos.
 *
 * @param {unknown} error Falha recebida da API.
 * @returns {boolean} Verdadeiro apenas para ausência de sessão válida.
 */
function isAuthenticationRequiredError(error) {
    return (
        error instanceof AuthenticationApiError
        && error.statusCode === 401
        && error.code === AUTHENTICATION_REQUIRED_CODE
    );
}

/**
 * Composição principal da interface administrativa.
 *
 * App consulta a sessão existente e coordena a entrada administrativa. A
 * comunicação HTTP permanece encapsulada em AuthenticationApi e os campos
 * continuam isolados em LoginForm.
 *
 * @param {object} props Propriedades da aplicação.
 * @param {{ login: Function, getSession: Function, logout: Function }}
 * [props.authenticationService] Serviço substituível nos testes.
 * @returns {import('react').ReactElement} Estrutura principal da aplicação.
 */
function App({
    authenticationService = authenticationApi,
} = {}) {
    const isValidAuthenticationService =
        authenticationService !== null
        && typeof authenticationService === 'object'
        && !Array.isArray(authenticationService)
        && typeof authenticationService.login === 'function'
        && typeof authenticationService.getSession === 'function'
        && typeof authenticationService.logout === 'function';

    if (!isValidAuthenticationService) {
        throw new TypeError(
            APP_MESSAGES.INVALID_AUTHENTICATION_SERVICE,
        );
    }

    const [isCheckingSession, setIsCheckingSession] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isLoggingOut, setIsLoggingOut] = useState(false);
    const [errorMessage, setErrorMessage] = useState(null);
    const [authenticatedUser, setAuthenticatedUser] = useState(null);

    const currentDate = createCurrentDatePresentation();

    /**
     * Verifica uma sessão persistida antes de apresentar o formulário.
     *
     * A função de limpeza impede que uma resposta tardia altere uma instância
     * do componente que já tenha sido desmontada. Isso também mantém o efeito
     * seguro durante as verificações adicionais do StrictMode.
     */
    useEffect(() => {
        let isCurrentInstance = true;

        async function restoreSession() {
            try {
                const session =
                    await authenticationService.getSession();

                if (isCurrentInstance) {
                    setAuthenticatedUser(session.user);
                }
            } catch (error) {
                if (
                    isCurrentInstance
                    && !isAuthenticationRequiredError(error)
                ) {
                    setErrorMessage(
                        APP_MESSAGES.SESSION_CHECK_FAILED,
                    );
                }
            } finally {
                if (isCurrentInstance) {
                    setIsCheckingSession(false);
                }
            }
        }

        restoreSession();

        return () => {
            isCurrentInstance = false;
        };
    }, [authenticationService]);

    /**
     * Solicita a autenticação sem armazenar as credenciais no estado de App.
     *
     * Erros reconhecidos pelo serviço já possuem mensagens públicas seguras.
     * Uma falha inesperada recebe texto genérico e não expõe detalhes técnicos
     * ao navegador.
     *
     * @param {Readonly<{ email: string, password: string }>} credentials
     * Credenciais preparadas pelo formulário.
     * @returns {Promise<void>}
     */
    async function handleLogin(credentials) {
        if (isSubmitting) {
            return;
        }

        setIsSubmitting(true);
        setErrorMessage(null);

        try {
            const user = await authenticationService.login(
                credentials,
            );

            setAuthenticatedUser(user);
        } catch (error) {
            const publicMessage =
                error instanceof AuthenticationApiError
                    ? error.message
                    : APP_MESSAGES.UNEXPECTED_LOGIN_ERROR;

            setErrorMessage(publicMessage);
        } finally {
            setIsSubmitting(false);
        }
    }

    /**
     * Encerra a sessão no servidor antes de remover o acesso da interface.
     *
     * Uma falha mantém o estado autenticado e permite uma nova tentativa. A
     * mensagem técnica nunca é apresentada diretamente ao usuário.
     *
     * @returns {Promise<void>}
     */
    async function handleLogout() {
        if (isLoggingOut) {
            return;
        }

        setIsLoggingOut(true);
        setErrorMessage(null);

        try {
            await authenticationService.logout();
            setAuthenticatedUser(null);
        } catch (error) {
            const publicMessage =
                error instanceof AuthenticationApiError
                    ? error.message
                    : APP_MESSAGES.UNEXPECTED_LOGOUT_ERROR;

            setErrorMessage(publicMessage);
        } finally {
            setIsLoggingOut(false);
        }
    }

    const authenticatedUserName =
        typeof authenticatedUser?.name === 'string'
            ? authenticatedUser.name.trim()
            : '';

    /**
     * Depois da autenticação, App deixa a apresentação do calendário sob a
     * responsabilidade do componente específico. O serviço e o estado da
     * sessão continuam coordenados nesta camada.
     */
    if (!isCheckingSession && authenticatedUser) {
        return (
            <CalendarWorkspace
                administratorName={authenticatedUserName || null}
                onLogout={handleLogout}
                isLoggingOut={isLoggingOut}
                logoutError={errorMessage}
            />
        );
    }

    const authenticationTitle = isCheckingSession
        ? 'Verificando acesso'
        : 'Acesso ao calendário';

    return (
        <main className="app-shell">
            <section
                className="app-introduction"
                aria-labelledby="application-title"
            >
                <time
                    className="app-symbol"
                    dateTime={currentDate.machineDate}
                    aria-label={currentDate.accessibleLabel}
                >
                    <span
                        className="app-symbol-month"
                        aria-hidden="true"
                    >
                        {currentDate.month}
                    </span>

                    <span
                        className="app-symbol-day"
                        aria-hidden="true"
                    >
                        {currentDate.day}
                    </span>
                </time>

                <p className="app-context">
                    Senac Ceilândia
                </p>

                <h1 id="application-title">
                    Calendário de Aulas
                </h1>

                <p className="app-owner">
                    Prof. Dionísio Pereira
                </p>
            </section>

            <section
                className="authentication-panel"
                aria-labelledby="authentication-title"
            >
                <p className="authentication-label">
                    Área administrativa
                </p>

                <h2 id="authentication-title">
                    {authenticationTitle}
                </h2>

                {isCheckingSession ? (
                    <p
                        className="authentication-description"
                        role="status"
                    >
                        {APP_MESSAGES.CHECKING_SESSION}
                    </p>
                ) : (
                    <>
                        <p className="authentication-description">
                            Entre com sua conta para consultar e organizar
                            as aulas.
                        </p>

                        <LoginForm
                            onSubmit={handleLogin}
                            isSubmitting={isSubmitting}
                            errorMessage={errorMessage}
                        />
                    </>
                )}
            </section>
        </main>
    );
}

export {
    APP_MESSAGES,
    App,
    createCurrentDatePresentation,
};
