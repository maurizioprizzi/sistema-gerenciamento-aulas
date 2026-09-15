import {
    act,
    cleanup,
    render,
    screen,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
    afterEach,
    describe,
    expect,
    test,
    vi,
} from 'vitest';

import {
    APP_MESSAGES,
    App,
} from './App.jsx';
import {
    AuthenticationApiError,
} from '../services/AuthenticationApi.js';

afterEach(() => {
    cleanup();
    vi.useRealTimers();
});

/**
 * Cria o erro esperado quando o visitante ainda não possui sessão válida.
 *
 * @returns {AuthenticationApiError} Ausência normal de autenticação.
 */
function createAuthenticationRequiredError() {
    return new AuthenticationApiError(
        'É necessário entrar com uma conta válida para acessar este endereço.',
        {
            statusCode: 401,
            code: 'AUTHENTICATION_REQUIRED',
        },
    );
}

/**
 * Cria um serviço controlado que considera o visitante anônimo por padrão.
 *
 * Cada teste pode substituir login() ou getSession() sem realizar chamadas
 * HTTP reais.
 *
 * @param {object} overrides Operações substituídas pelo cenário.
 * @returns {{ login: Function, getSession: Function, logout: Function }}
 * Serviço simulado.
 */
function createAuthenticationService(overrides = {}) {
    return {
        login: vi.fn(),
        getSession: vi.fn().mockRejectedValue(
            createAuthenticationRequiredError(),
        ),
        logout: vi.fn(),
        ...overrides,
    };
}

/**
 * Cria a identidade pública devolvida por um login válido.
 *
 * @param {object} overrides Campos que serão substituídos.
 * @returns {Readonly<object>} Usuário público controlado pelo teste.
 */
function createAuthenticatedUser(overrides = {}) {
    return Object.freeze({
        id: '507f1f77bcf86cd799439011',
        name: 'Dionísio Pereira',
        email: 'dionisio@example.com',
        role: 'admin',
        ...overrides,
    });
}

/**
 * Cria a representação mínima devolvida pela consulta da sessão.
 *
 * @returns {Readonly<object>} Sessão administrativa confirmada.
 */
function createAuthenticatedSession() {
    return Object.freeze({
        authenticated: true,
        user: Object.freeze({
            id: '507f1f77bcf86cd799439011',
            role: 'admin',
        }),
    });
}

/**
 * Aguarda o formulário apresentado depois da consulta inicial.
 *
 * @returns {Promise<HTMLElement>} Formulário administrativo.
 */
async function findLoginForm() {
    return screen.findByRole('form', {
        name: 'Entrada administrativa',
    });
}

/**
 * Aguarda a navegação que identifica a área autenticada do calendário.
 *
 * O componente substituiu a antiga confirmação intermediária de acesso. A
 * presença da navegação comprova que App entregou o fluxo ao workspace sem
 * depender de classes CSS ou de detalhes internos do componente.
 *
 * @returns {Promise<HTMLElement>} Navegação principal do calendário.
 */
async function findCalendarWorkspace() {
    return screen.findByRole('navigation', {
        name: 'Seções do calendário',
    });
}

/**
 * Preenche e envia o formulário administrativo.
 *
 * @param {ReturnType<typeof userEvent.setup>} user Usuário simulado.
 * @param {object} options Valores utilizados no formulário.
 * @param {string} options.email E-mail digitado.
 * @param {string} options.password Senha digitada.
 * @returns {Promise<void>}
 */
async function submitLogin(
    user,
    {
        email = 'dionisio@example.com',
        password = 'senha administrativa',
    } = {},
) {
    await findLoginForm();

    await user.type(
        screen.getByRole('textbox', { name: 'E-mail' }),
        email,
    );
    await user.type(
        screen.getByLabelText('Senha'),
        password,
    );
    await user.click(
        screen.getByRole('button', { name: 'Entrar' }),
    );
}

describe('configuração da aplicação', () => {
    test('expõe mensagens estáveis e protegidas', () => {
        expect(APP_MESSAGES).toEqual({
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
        expect(Object.isFrozen(APP_MESSAGES)).toBe(true);
    });

    test('rejeita serviços de autenticação inválidos', () => {
        const invalidServices = [
            null,
            'authentication',
            42,
            {},
            [],
            { login() {} },
            { getSession() {} },
            { login: true, getSession() {} },
            { login() {}, getSession: true },
            { login() {}, getSession() {} },
            { login() {}, getSession() {}, logout: true },
        ];

        for (const authenticationService of invalidServices) {
            expect(() => render(
                <App
                    authenticationService={authenticationService}
                />,
            )).toThrowError(
                APP_MESSAGES.INVALID_AUTHENTICATION_SERVICE,
            );

            cleanup();
        }
    });
});

describe('estrutura inicial da aplicação', () => {
    test('apresenta a identidade e o formulário administrativo', async () => {
        const authenticationService =
            createAuthenticationService();

        render(
            <App authenticationService={authenticationService} />,
        );

        expect(screen.getByRole('main')).toBeTruthy();
        expect(
            screen.getByRole('heading', {
                level: 1,
                name: 'Calendário de Aulas',
            }),
        ).toBeTruthy();
        expect(
            screen.getByText('Senac Ceilândia'),
        ).toBeTruthy();
        expect(
            screen.getByText('Prof. Dionísio Pereira'),
        ).toBeTruthy();
        expect(
            screen.getByText('Área administrativa'),
        ).toBeTruthy();

        expect(await screen.findByRole('heading', {
            level: 2,
            name: 'Acesso ao calendário',
        })).toBeTruthy();
        expect(await findLoginForm()).toBeTruthy();
    });

    test('apresenta a data local em português', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date(2026, 8, 13, 12, 0, 0));

        const authenticationService =
            createAuthenticationService({
                getSession: vi.fn().mockReturnValue(
                    new Promise(() => {}),
                ),
            });

        render(
            <App authenticationService={authenticationService} />,
        );

        const calendar = screen.getByLabelText(
            'Hoje, 13 de setembro de 2026.',
        );

        expect(calendar.tagName).toBe('TIME');
        expect(calendar.getAttribute('datetime')).toBe(
            '2026-09-13',
        );
        expect(calendar.textContent).toContain('setembro');
        expect(calendar.textContent).toContain('13');
    });

    test('informa a verificação antes de decidir o acesso', () => {
        const authenticationService =
            createAuthenticationService({
                getSession: vi.fn().mockReturnValue(
                    new Promise(() => {}),
                ),
            });

        render(
            <App authenticationService={authenticationService} />,
        );

        expect(screen.getByRole('heading', {
            level: 2,
            name: 'Verificando acesso',
        })).toBeTruthy();
        expect(screen.getByRole('status').textContent).toBe(
            APP_MESSAGES.CHECKING_SESSION,
        );
        expect(screen.queryByRole('form')).toBeNull();
    });
});

describe('restauração da sessão administrativa', () => {
    test('mantém o acesso quando existe uma sessão válida', async () => {
        const session = createAuthenticatedSession();
        const authenticationService =
            createAuthenticationService({
                getSession: vi.fn().mockResolvedValue(session),
            });

        render(
            <App authenticationService={authenticationService} />,
        );

        expect(await findCalendarWorkspace()).toBeTruthy();
        expect(
            screen.getByText('Sessão administrativa ativa'),
        ).toBeTruthy();
        expect(screen.queryByRole('form')).toBeNull();
        expect(authenticationService.getSession).toHaveBeenCalledTimes(1);
    });

    test('apresenta o formulário para um visitante anônimo', async () => {
        const authenticationService =
            createAuthenticationService();

        render(
            <App authenticationService={authenticationService} />,
        );

        expect(await findLoginForm()).toBeTruthy();
        expect(screen.queryByRole('alert')).toBeNull();
        expect(authenticationService.getSession).toHaveBeenCalledTimes(1);
    });

    test('permite entrar novamente quando a consulta falha', async () => {
        const technicalMessage =
            'Falha técnica ao consultar o armazenamento.';
        const authenticationService =
            createAuthenticationService({
                getSession: vi.fn().mockRejectedValue(
                    new Error(technicalMessage),
                ),
            });

        render(
            <App authenticationService={authenticationService} />,
        );

        expect(await findLoginForm()).toBeTruthy();
        expect(screen.getByRole('alert').textContent).toBe(
            APP_MESSAGES.SESSION_CHECK_FAILED,
        );
        expect(document.body.textContent).not.toContain(
            technicalMessage,
        );
    });
});

describe('entrada administrativa pela aplicação', () => {
    test('envia as credenciais e confirma o usuário autenticado', async () => {
        const user = userEvent.setup();
        const authenticatedUser = createAuthenticatedUser();
        const authenticationService =
            createAuthenticationService({
                login: vi.fn().mockResolvedValue(authenticatedUser),
            });

        render(
            <App authenticationService={authenticationService} />,
        );

        await submitLogin(user, {
            email: '  dionisio@example.com  ',
            password: '  senha preservada  ',
        });

        expect(authenticationService.login).toHaveBeenCalledTimes(1);

        const credentials =
            authenticationService.login.mock.calls[0][0];

        expect(credentials).toEqual({
            email: 'dionisio@example.com',
            password: '  senha preservada  ',
        });
        expect(Object.isFrozen(credentials)).toBe(true);

        expect(await findCalendarWorkspace()).toBeTruthy();
        expect(
            screen.getByText(
                'Sessão de ' + authenticatedUser.name,
            ),
        ).toBeTruthy();
        expect(screen.queryByRole('form')).toBeNull();
    });

    test('bloqueia o formulário enquanto o login está pendente', async () => {
        const user = userEvent.setup();
        let resolveLogin;

        const pendingLogin = new Promise((resolve) => {
            resolveLogin = resolve;
        });

        const authenticationService =
            createAuthenticationService({
                login: vi.fn().mockReturnValue(pendingLogin),
            });

        render(
            <App authenticationService={authenticationService} />,
        );

        await submitLogin(user);

        expect(
            screen.getByRole('textbox', { name: 'E-mail' }).disabled,
        ).toBe(true);
        expect(screen.getByLabelText('Senha').disabled).toBe(true);
        expect(
            screen.getByRole('button', {
                name: 'Entrando...',
            }).disabled,
        ).toBe(true);

        await act(async () => {
            resolveLogin(createAuthenticatedUser());
            await pendingLogin;
        });

        expect(await findCalendarWorkspace()).toBeTruthy();
    });

    test('apresenta a mensagem pública de uma recusa conhecida', async () => {
        const user = userEvent.setup();
        const publicMessage = 'E-mail ou senha inválidos.';
        const authenticationService =
            createAuthenticationService({
                login: vi.fn().mockRejectedValue(
                    new AuthenticationApiError(publicMessage, {
                        statusCode: 401,
                        code: 'INVALID_CREDENTIALS',
                    }),
                ),
            });

        render(
            <App authenticationService={authenticationService} />,
        );

        await submitLogin(user);

        const alert = await screen.findByRole('alert');

        expect(alert.textContent).toBe(publicMessage);
        expect(
            screen.getByRole('button', { name: 'Entrar' }).disabled,
        ).toBe(false);
        expect(await findLoginForm()).toBeTruthy();
    });

    test('não expõe detalhes de uma falha inesperada', async () => {
        const user = userEvent.setup();
        const technicalMessage =
            'Falha interna contendo detalhes do banco.';
        const authenticationService =
            createAuthenticationService({
                login: vi.fn().mockRejectedValue(
                    new Error(technicalMessage),
                ),
            });

        render(
            <App authenticationService={authenticationService} />,
        );

        await submitLogin(user);

        const alert = await screen.findByRole('alert');

        expect(alert.textContent).toBe(
            APP_MESSAGES.UNEXPECTED_LOGIN_ERROR,
        );
        expect(document.body.textContent).not.toContain(
            technicalMessage,
        );
    });
});


describe('encerramento da sessão pela aplicação', () => {
    test('remove o acesso somente depois da saída confirmada', async () => {
        const user = userEvent.setup();
        const authenticationService =
            createAuthenticationService({
                getSession: vi.fn().mockResolvedValue(
                    createAuthenticatedSession(),
                ),
                logout: vi.fn().mockResolvedValue(undefined),
            });

        render(
            <App authenticationService={authenticationService} />,
        );

        const logoutButton = await screen.findByRole('button', {
            name: 'Sair',
        });

        await user.click(logoutButton);

        expect(authenticationService.logout).toHaveBeenCalledTimes(1);
        expect(await findLoginForm()).toBeTruthy();
        expect(screen.getByRole('heading', {
            level: 2,
            name: 'Acesso ao calendário',
        })).toBeTruthy();
        expect(screen.queryByRole('status')).toBeNull();
    });

    test('mantém o acesso enquanto a saída está pendente', async () => {
        const user = userEvent.setup();
        let resolveLogout;

        const pendingLogout = new Promise((resolve) => {
            resolveLogout = resolve;
        });

        const authenticationService =
            createAuthenticationService({
                getSession: vi.fn().mockResolvedValue(
                    createAuthenticatedSession(),
                ),
                logout: vi.fn().mockReturnValue(pendingLogout),
            });

        render(
            <App authenticationService={authenticationService} />,
        );

        await user.click(await screen.findByRole('button', {
            name: 'Sair',
        }));

        const pendingButton = screen.getByRole('button', {
            name: 'Saindo...',
        });

        expect(pendingButton.disabled).toBe(true);
        expect(await findCalendarWorkspace()).toBeTruthy();

        await act(async () => {
            resolveLogout();
            await pendingLogout;
        });

        expect(await findLoginForm()).toBeTruthy();
    });

    test('mantém a sessão e apresenta uma falha pública conhecida', async () => {
        const user = userEvent.setup();
        const publicMessage =
            'Não foi possível encerrar a sessão administrativa.';
        const authenticationService =
            createAuthenticationService({
                getSession: vi.fn().mockResolvedValue(
                    createAuthenticatedSession(),
                ),
                logout: vi.fn().mockRejectedValue(
                    new AuthenticationApiError(publicMessage, {
                        statusCode: 500,
                        code: 'SESSION_DESTRUCTION_FAILED',
                    }),
                ),
            });

        render(
            <App authenticationService={authenticationService} />,
        );

        await user.click(await screen.findByRole('button', {
            name: 'Sair',
        }));

        expect((await screen.findByRole('alert')).textContent).toBe(
            publicMessage,
        );
        expect(await findCalendarWorkspace()).toBeTruthy();
        expect(
            screen.getByRole('button', { name: 'Sair' }).disabled,
        ).toBe(false);
        expect(screen.queryByRole('form')).toBeNull();
    });

    test('não expõe detalhes de uma falha inesperada na saída', async () => {
        const user = userEvent.setup();
        const technicalMessage =
            'Falha interna ao remover a sessão do armazenamento.';
        const authenticationService =
            createAuthenticationService({
                getSession: vi.fn().mockResolvedValue(
                    createAuthenticatedSession(),
                ),
                logout: vi.fn().mockRejectedValue(
                    new Error(technicalMessage),
                ),
            });

        render(
            <App authenticationService={authenticationService} />,
        );

        await user.click(await screen.findByRole('button', {
            name: 'Sair',
        }));

        expect((await screen.findByRole('alert')).textContent).toBe(
            APP_MESSAGES.UNEXPECTED_LOGOUT_ERROR,
        );
        expect(document.body.textContent).not.toContain(
            technicalMessage,
        );
        expect(await findCalendarWorkspace()).toBeTruthy();
    });
});
