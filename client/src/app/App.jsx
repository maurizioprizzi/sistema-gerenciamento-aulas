import {
    useEffect,
    useRef,
    useState,
} from 'react';

import {
    AuthenticationApiError,
    authenticationApi,
} from '../services/AuthenticationApi.js';
import {
    InitialSetupApiError,
    initialSetupApi,
} from '../services/InitialSetupApi.js';
import { LoginForm } from '../components/authentication/LoginForm.jsx';
import { InitialSetupForm } from '../components/authentication/InitialSetupForm.jsx';
import { CalendarWorkspace } from '../components/calendar/CalendarWorkspace.jsx';

const DATE_LOCALE = 'pt-BR';
const AUTHENTICATION_REQUIRED_CODE = 'AUTHENTICATION_REQUIRED';

/**
 * Mensagens estáveis relacionadas à composição principal da interface.
 */
const APP_MESSAGES = Object.freeze({
    INVALID_AUTHENTICATION_SERVICE:
        'A aplicação exige um serviço de autenticação válido.',
    INVALID_INITIAL_SETUP_SERVICE:
        'A aplicação exige um serviço de primeiro cadastro válido.',
    CHECKING_SESSION:
        'Verificando sua sessão...',
    CHECKING_SETUP:
        'Verificando o primeiro acesso desta instalação...',
    SETUP_CHECK_FAILED:
        'Não foi possível verificar o primeiro cadastro. Se já possui uma conta, você pode entrar.',
    SETUP_CREATED:
        'Sua conta foi criada. Entre com o e-mail e a senha que você escolheu.',
    SETUP_UNAVAILABLE:
        'O cadastro inicial não está disponível nesta instalação. Se já criou sua conta, entre com seu e-mail e senha.',
    UNEXPECTED_SETUP_ERROR:
        'Não foi possível confirmar a criação da conta. Se ela já foi criada, tente entrar com os dados informados.',
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
 * App restaura a sessão ou consulta qual formulário a instalação permite.
 * Os serviços cuidam da comunicação HTTP; os formulários cuidam dos campos.
 * As credenciais do primeiro cadastro não são guardadas no estado de App.
 *
 * @param {object} props Propriedades da aplicação.
 * @param {{ login: Function, getSession: Function, logout: Function }}
 * [props.authenticationService] Serviço substituível nos testes.
 * @param {{ getStatus: Function, createAdmin: Function }}
 * [props.initialSetupService] Serviço de primeiro cadastro substituível.
 * @returns {import('react').ReactElement} Estrutura principal da aplicação.
 */
function App({
    authenticationService = authenticationApi,
    initialSetupService = initialSetupApi,
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

    if (
        !initialSetupService
        || typeof initialSetupService !== 'object'
        || Array.isArray(initialSetupService)
        || typeof initialSetupService.getStatus !== 'function'
        || typeof initialSetupService.createAdmin !== 'function'
    ) {
        throw new TypeError(APP_MESSAGES.INVALID_INITIAL_SETUP_SERVICE);
    }

    const [accessMode, setAccessMode] = useState('checking-session');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isLoggingOut, setIsLoggingOut] = useState(false);
    const [errorMessage, setErrorMessage] = useState(null);
    const [authenticatedUser, setAuthenticatedUser] = useState(null);
    const [successMessage, setSuccessMessage] = useState(null);
    const [canCheckSetup, setCanCheckSetup] = useState(false);
    const lifecycleRef = useRef(null);

    const isCheckingAccess = accessMode === 'checking-session'
        || accessMode === 'checking-setup';

    const currentDate = createCurrentDatePresentation();

    /**
     * Cada composição possui sua própria marca de atividade. Respostas de
     * serviços antigos ou de uma instância desmontada são ignoradas, incluindo
     * envios. O bloqueio síncrono evita duas operações antes do próximo render.
     */
    useEffect(() => {
        const lifecycle = { active: true, pending: true };
        lifecycleRef.current = lifecycle;
        setAccessMode('checking-session');
        setAuthenticatedUser(null);
        setErrorMessage(null);
        setSuccessMessage(null);
        setCanCheckSetup(false);
        setIsSubmitting(false);
        setIsLoggingOut(false);

        async function restoreSession() {
            let sessionWarning = null;
            try {
                const session = await authenticationService.getSession();
                if (!isCurrent(lifecycle)) return;
                if (!session?.authenticated || !session.user) {
                    throw new TypeError('Confirmação de sessão inválida.');
                }
                setAuthenticatedUser(session.user);
                setAccessMode('login');
            } catch (error) {
                if (!isCurrent(lifecycle)) return;
                if (!isAuthenticationRequiredError(error)) {
                    sessionWarning = APP_MESSAGES.SESSION_CHECK_FAILED;
                }
                await checkInitialSetup(lifecycle, sessionWarning);
            } finally {
                if (isCurrent(lifecycle)) lifecycle.pending = false;
            }
        }

        restoreSession();

        return () => {
            lifecycle.active = false;
        };
    }, [authenticationService, initialSetupService]);

    function isCurrent(lifecycle) {
        return lifecycle?.active && lifecycleRef.current === lifecycle;
    }

    /** Uma consulta malsucedida nunca é interpretada como cadastro liberado. */
    async function checkInitialSetup(lifecycle, sessionWarning = null) {
        if (!isCurrent(lifecycle)) return;
        setAccessMode('checking-setup');
        try {
            const status = await initialSetupService.getStatus();
            if (!isCurrent(lifecycle)) return;
            if (
                !status || typeof status !== 'object' || Array.isArray(status)
                || typeof status.available !== 'boolean'
            ) {
                throw new TypeError('Disponibilidade de cadastro inválida.');
            }
            setAccessMode(status.available ? 'setup' : 'login');
            setCanCheckSetup(status.available);
            setErrorMessage(status.available ? null : sessionWarning);
        } catch {
            if (!isCurrent(lifecycle)) return;
            setAccessMode('login');
            setCanCheckSetup(true);
            setErrorMessage(APP_MESSAGES.SETUP_CHECK_FAILED);
        }
    }

    async function handleCheckSetup() {
        const lifecycle = lifecycleRef.current;
        if (!isCurrent(lifecycle) || lifecycle.pending) return;
        lifecycle.pending = true;
        setErrorMessage(null);
        setSuccessMessage(null);
        try {
            await checkInitialSetup(lifecycle);
        } finally {
            if (isCurrent(lifecycle)) lifecycle.pending = false;
        }
    }

    async function handleInitialSetup(data) {
        const lifecycle = lifecycleRef.current;
        if (!isCurrent(lifecycle) || lifecycle.pending || accessMode !== 'setup') return;
        lifecycle.pending = true;
        setIsSubmitting(true);
        setErrorMessage(null);
        setSuccessMessage(null);
        try {
            const creation = await initialSetupService.createAdmin(data);
            if (!isCurrent(lifecycle)) return;
            if (
                !creation || typeof creation !== 'object' || Array.isArray(creation)
                || creation.created !== true
            ) {
                throw new TypeError('Confirmação de cadastro inválida.');
            }
            // Desmontar o formulário descarta senha, confirmação e convite.
            setAccessMode('login');
            setCanCheckSetup(false);
            setSuccessMessage(APP_MESSAGES.SETUP_CREATED);
        } catch (error) {
            if (!isCurrent(lifecycle)) return;
            if (
                error instanceof InitialSetupApiError
                && error.statusCode === 409
                && error.code === 'INITIAL_SETUP_UNAVAILABLE'
            ) {
                setAccessMode('login');
                setCanCheckSetup(false);
                setErrorMessage(APP_MESSAGES.SETUP_UNAVAILABLE);
            } else {
                setErrorMessage(error instanceof InitialSetupApiError
                    ? error.message : APP_MESSAGES.UNEXPECTED_SETUP_ERROR);
            }
        } finally {
            if (isCurrent(lifecycle)) {
                lifecycle.pending = false;
                setIsSubmitting(false);
            }
        }
    }

    function handleShowLogin() {
        const lifecycle = lifecycleRef.current;
        if (!isCurrent(lifecycle) || lifecycle.pending) return;
        setAccessMode('login');
        setErrorMessage(null);
        setSuccessMessage(null);
    }

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
        const lifecycle = lifecycleRef.current;
        if (!isCurrent(lifecycle) || lifecycle.pending || accessMode !== 'login') return;
        lifecycle.pending = true;
        setIsSubmitting(true);
        setErrorMessage(null);
        setSuccessMessage(null);

        try {
            const user = await authenticationService.login(
                credentials,
            );

            if (isCurrent(lifecycle)) setAuthenticatedUser(user);
        } catch (error) {
            if (!isCurrent(lifecycle)) return;
            const publicMessage =
                error instanceof AuthenticationApiError
                    ? error.message
                    : APP_MESSAGES.UNEXPECTED_LOGIN_ERROR;

            setErrorMessage(publicMessage);
        } finally {
            if (isCurrent(lifecycle)) {
                lifecycle.pending = false;
                setIsSubmitting(false);
            }
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
        const lifecycle = lifecycleRef.current;
        if (!isCurrent(lifecycle) || lifecycle.pending) return;
        lifecycle.pending = true;
        setIsLoggingOut(true);
        setErrorMessage(null);

        try {
            await authenticationService.logout();
            if (!isCurrent(lifecycle)) return;
            setAuthenticatedUser(null);
            setAccessMode('login');
            setCanCheckSetup(false);
        } catch (error) {
            if (!isCurrent(lifecycle)) return;
            const publicMessage =
                error instanceof AuthenticationApiError
                    ? error.message
                    : APP_MESSAGES.UNEXPECTED_LOGOUT_ERROR;

            setErrorMessage(publicMessage);
        } finally {
            if (isCurrent(lifecycle)) {
                lifecycle.pending = false;
                setIsLoggingOut(false);
            }
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
    if (!isCheckingAccess && authenticatedUser) {
        return (
            <CalendarWorkspace
                administratorName={authenticatedUserName || null}
                onLogout={handleLogout}
                isLoggingOut={isLoggingOut}
                logoutError={errorMessage}
            />
        );
    }

    const authenticationTitle = isCheckingAccess
        ? 'Verificando acesso'
        : accessMode === 'setup' ? 'Crie sua conta' : 'Acesso ao calendário';

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
                    Planejamento de aulas
                </p>

                <h1 id="application-title">
                    Calendário de Aulas
                </h1>

                <p className="app-owner">
                    Organize seus cursos, atividades e materiais.
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

                {isCheckingAccess ? (
                    <p
                        className="authentication-description"
                        role="status"
                    >
                        {accessMode === 'checking-session'
                            ? APP_MESSAGES.CHECKING_SESSION
                            : APP_MESSAGES.CHECKING_SETUP}
                    </p>
                ) : (
                    <>
                        <p className="authentication-description">
                            {accessMode === 'setup'
                                ? 'Defina sua conta para começar a usar esta instalação. Depois, entre com seu e-mail e senha.'
                                : 'Entre com sua conta para consultar e organizar as aulas.'}
                        </p>

                        {successMessage && (
                            <p className="authentication-success" role="status">
                                {successMessage}
                            </p>
                        )}

                        {accessMode === 'setup' ? (
                            <>
                                <InitialSetupForm
                                    onSubmit={handleInitialSetup}
                                    isSubmitting={isSubmitting}
                                    errorMessage={errorMessage}
                                />
                                <button
                                    className="authentication-logout"
                                    type="button"
                                    disabled={isSubmitting}
                                    onClick={handleShowLogin}
                                >
                                    Já tenho uma conta
                                </button>
                            </>
                        ) : (
                            <>
                                <LoginForm
                                    onSubmit={handleLogin}
                                    isSubmitting={isSubmitting}
                                    errorMessage={errorMessage}
                                />
                                {canCheckSetup && (
                                    <button
                                        className="authentication-logout"
                                        type="button"
                                        disabled={isSubmitting}
                                        onClick={handleCheckSetup}
                                    >
                                        Verificar primeiro cadastro
                                    </button>
                                )}
                            </>
                        )}
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
