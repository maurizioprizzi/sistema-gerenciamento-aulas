import {
    act,
    cleanup,
    fireEvent,
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
import { InitialSetupApiError } from '../services/InitialSetupApi.js';

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
        expect(APP_MESSAGES).toMatchObject({
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
                    authenticationService={authenticationService} initialSetupService={createInitialSetupService()}
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
            <App
                authenticationService={authenticationService}
                initialSetupService={createInitialSetupService()}
            />,
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
            <App
                authenticationService={authenticationService}
                initialSetupService={createInitialSetupService()}
            />,
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
            <App
                authenticationService={authenticationService}
                initialSetupService={createInitialSetupService()}
            />,
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
            <App
                authenticationService={authenticationService}
                initialSetupService={createInitialSetupService()}
            />,
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
            <App
                authenticationService={authenticationService}
                initialSetupService={createInitialSetupService()}
            />,
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
            <App
                authenticationService={authenticationService}
                initialSetupService={createInitialSetupService()}
            />,
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
            <App
                authenticationService={authenticationService}
                initialSetupService={createInitialSetupService()}
            />,
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
            <App
                authenticationService={authenticationService}
                initialSetupService={createInitialSetupService()}
            />,
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
            <App
                authenticationService={authenticationService}
                initialSetupService={createInitialSetupService()}
            />,
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
            <App
                authenticationService={authenticationService}
                initialSetupService={createInitialSetupService()}
            />,
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
            <App
                authenticationService={authenticationService}
                initialSetupService={createInitialSetupService()}
            />,
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
            <App
                authenticationService={authenticationService}
                initialSetupService={createInitialSetupService()}
            />,
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
            <App
                authenticationService={authenticationService}
                initialSetupService={createInitialSetupService()}
            />,
        );

        await user.click(await screen.findByRole('button', {
            name: 'Sair',
        }));

        const logoutAlert = await screen.findByText(
            publicMessage,
        );

        expect(logoutAlert.getAttribute('role')).toBe('alert');
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
            <App
                authenticationService={authenticationService}
                initialSetupService={createInitialSetupService()}
            />,
        );

        await user.click(await screen.findByRole('button', {
            name: 'Sair',
        }));

        const logoutAlert = await screen.findByText(
            APP_MESSAGES.UNEXPECTED_LOGOUT_ERROR,
        );

        expect(logoutAlert.getAttribute('role')).toBe('alert');
        expect(document.body.textContent).not.toContain(
            technicalMessage,
        );
        expect(await findCalendarWorkspace()).toBeTruthy();
    });
});


/**
 * Simula uma instalação já configurada. Cada cenário pode liberar o primeiro
 * cadastro ou controlar sua resposta, sem chamar a API real.
 */
function createInitialSetupService(overrides = {}) {
    return {
        getStatus: vi.fn().mockResolvedValue({ available: false }),
        createAdmin: vi.fn().mockResolvedValue({ created: true }),
        ...overrides,
    };
}

/** Preenche exclusivamente dados fictícios do formulário de primeiro acesso. */
function fillInitialSetup() {
    for (const [label, value] of Object.entries({
        'Seu nome': 'Ana Silva',
        'E-mail': 'ana@example.com',
        Senha: 'senha fictícia de teste',
        'Confirme a senha': 'senha fictícia de teste',
        'Código de primeiro acesso': 'ab'.repeat(32),
    })) {
        fireEvent.change(screen.getByLabelText(label), { target: { value } });
    }
}

async function findInitialSetupForm() {
    return screen.findByRole('form', { name: 'Primeiro cadastro administrativo' });
}

/** Permite resolver ou recusar uma operação no momento escolhido pelo teste. */
function deferred() {
    let resolve;
    let reject;
    const promise = new Promise((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
    });
    return { promise, resolve, reject };
}

describe('decisão entre primeiro cadastro e login', () => {
    test('recusa serviço de primeiro cadastro incompleto', () => {
        for (const initialSetupService of [null, [], {}, { getStatus() {} }, { getStatus() {}, createAdmin: true }]) {
            expect(() => render(<App authenticationService={createAuthenticationService()} initialSetupService={initialSetupService} />))
                .toThrow(APP_MESSAGES.INVALID_INITIAL_SETUP_SERVICE);
        }
    });

    test('sessão válida entra diretamente sem consultar cadastro', async () => {
        const initialSetupService = createInitialSetupService();
        render(<App authenticationService={createAuthenticationService({ getSession: vi.fn().mockResolvedValue(createAuthenticatedSession()) })} initialSetupService={initialSetupService} />);
        await findCalendarWorkspace();
        expect(initialSetupService.getStatus).not.toHaveBeenCalled();
    });

    test('aguarda disponibilidade antes de mostrar qualquer formulário', async () => {
        const pending = deferred();
        const initialSetupService = createInitialSetupService({ getStatus: vi.fn().mockReturnValue(pending.promise) });
        render(<App authenticationService={createAuthenticationService()} initialSetupService={initialSetupService} />);
        expect(await screen.findByText(APP_MESSAGES.CHECKING_SETUP)).toBeTruthy();
        expect(screen.queryByRole('form')).toBeNull();
        await act(async () => { pending.resolve({ available: true }); await pending.promise; });
        await findInitialSetupForm();
        expect(screen.queryByRole('form', { name: 'Entrada administrativa' })).toBeNull();
    });

    test('falha da consulta mantém login e permite consultar novamente', async () => {
        const initialSetupService = createInitialSetupService({ getStatus: vi.fn()
            .mockRejectedValueOnce(new Error('detalhe privado'))
            .mockResolvedValueOnce({ available: true }) });
        render(<App authenticationService={createAuthenticationService()} initialSetupService={initialSetupService} />);
        await findLoginForm();
        expect(screen.getByRole('alert').textContent).toBe(APP_MESSAGES.SETUP_CHECK_FAILED);
        expect(document.body.textContent).not.toContain('detalhe privado');
        fireEvent.click(screen.getByRole('button', { name: 'Verificar primeiro cadastro' }));
        await findInitialSetupForm();
        expect(initialSetupService.getStatus).toHaveBeenCalledTimes(2);
    });

    test.each([{ label: 'ausente', status: undefined }, { label: 'texto', status: { available: 'true' } }, { label: 'lista', status: [] }])('disponibilidade $label não libera cadastro', async ({ status }) => {
        const initialSetupService = createInitialSetupService({ getStatus: vi.fn().mockResolvedValue(status) });
        render(<App authenticationService={createAuthenticationService()} initialSetupService={initialSetupService} />);
        await findLoginForm();
        expect(screen.getByRole('alert').textContent).toBe(APP_MESSAGES.SETUP_CHECK_FAILED);
        expect(screen.queryByRole('form', { name: 'Primeiro cadastro administrativo' })).toBeNull();
    });

    test('quem já tem conta pode ir ao login e voltar mediante nova consulta', async () => {
        const initialSetupService = createInitialSetupService({ getStatus: vi.fn().mockResolvedValue({ available: true }) });
        render(<App authenticationService={createAuthenticationService()} initialSetupService={initialSetupService} />);
        await findInitialSetupForm();
        fillInitialSetup();
        fireEvent.click(screen.getByRole('button', { name: 'Já tenho uma conta' }));
        await findLoginForm();
        expect(screen.getByLabelText('Senha').value).toBe('');
        fireEvent.click(screen.getByRole('button', { name: 'Verificar primeiro cadastro' }));
        await findInitialSetupForm();
        expect(initialSetupService.getStatus).toHaveBeenCalledTimes(2);
        expect(screen.getByLabelText('Código de primeiro acesso').value).toBe('');
    });
});

describe('criação da conta pela tela principal', () => {
    test('confirma criação, descarta os campos e solicita login sem autenticar automaticamente', async () => {
        const authenticationService = createAuthenticationService();
        const initialSetupService = createInitialSetupService({ getStatus: vi.fn().mockResolvedValue({ available: true }) });
        render(<App authenticationService={authenticationService} initialSetupService={initialSetupService} />);
        await findInitialSetupForm();
        fillInitialSetup();
        fireEvent.submit(screen.getByRole('form'));
        await findLoginForm();
        expect(initialSetupService.createAdmin).toHaveBeenCalledExactlyOnceWith({ invitationToken: 'ab'.repeat(32), name: 'Ana Silva', email: 'ana@example.com', password: 'senha fictícia de teste' });
        expect(screen.getByRole('status').textContent).toBe(APP_MESSAGES.SETUP_CREATED);
        expect(screen.getByLabelText('E-mail').value).toBe('');
        expect(screen.getByLabelText('Senha').value).toBe('');
        expect(screen.queryByLabelText('Código de primeiro acesso')).toBeNull();
        expect(authenticationService.login).not.toHaveBeenCalled();
        expect(authenticationService.getSession).toHaveBeenCalledOnce();
        expect(screen.queryByRole('navigation', { name: 'Seções do calendário' })).toBeNull();
    });

    test('bloqueia campos, navegação e novo envio enquanto cria a conta', async () => {
        const pending = deferred();
        const initialSetupService = createInitialSetupService({ getStatus: vi.fn().mockResolvedValue({ available: true }), createAdmin: vi.fn().mockReturnValue(pending.promise) });
        render(<App authenticationService={createAuthenticationService()} initialSetupService={initialSetupService} />);
        await findInitialSetupForm();
        fillInitialSetup();
        fireEvent.submit(screen.getByRole('form'));
        expect(screen.getByRole('button', { name: 'Criando sua conta...' }).disabled).toBe(true);
        expect(screen.getByRole('button', { name: 'Já tenho uma conta' }).disabled).toBe(true);
        for (const input of screen.getByRole('form').querySelectorAll('input')) expect(input.disabled).toBe(true);
        fireEvent.submit(screen.getByRole('form'));
        expect(initialSetupService.createAdmin).toHaveBeenCalledOnce();
        await act(async () => { pending.resolve({ created: true }); await pending.promise; });
        await findLoginForm();
    });

    test('recusa pública preserva os dados para correção', async () => {
        const initialSetupService = createInitialSetupService({ getStatus: vi.fn().mockResolvedValue({ available: true }), createAdmin: vi.fn().mockRejectedValue(new InitialSetupApiError('Convite inválido.', { statusCode: 403, code: 'INITIAL_SETUP_INVALID_INVITATION' })) });
        render(<App authenticationService={createAuthenticationService()} initialSetupService={initialSetupService} />);
        await findInitialSetupForm();
        fillInitialSetup();
        fireEvent.submit(screen.getByRole('form'));
        expect((await screen.findByRole('alert')).textContent).toBe('Convite inválido.');
        expect(screen.getByLabelText('Senha').value).toBe('senha fictícia de teste');
        expect(screen.getByRole('button', { name: 'Criar minha conta' }).disabled).toBe(false);
    });

    test('cadastro indisponível encaminha ao login sem repetir a criação', async () => {
        const initialSetupService = createInitialSetupService({ getStatus: vi.fn().mockResolvedValue({ available: true }), createAdmin: vi.fn().mockRejectedValue(new InitialSetupApiError('Indisponível.', { statusCode: 409, code: 'INITIAL_SETUP_UNAVAILABLE' })) });
        render(<App authenticationService={createAuthenticationService()} initialSetupService={initialSetupService} />);
        await findInitialSetupForm();
        fillInitialSetup();
        fireEvent.submit(screen.getByRole('form'));
        await findLoginForm();
        expect(screen.getByRole('alert').textContent).toBe(APP_MESSAGES.SETUP_UNAVAILABLE);
        expect(initialSetupService.createAdmin).toHaveBeenCalledOnce();
        expect(screen.queryByLabelText('Código de primeiro acesso')).toBeNull();
    });

    test.each([{ label: 'falha técnica', outcome: new Error('senha e convite privados') }, { label: 'confirmação falsa', outcome: { created: false } }, { label: 'confirmação ausente', outcome: undefined }])('não confirma sucesso com $label', async ({ outcome }) => {
        const createAdmin = outcome instanceof Error ? vi.fn().mockRejectedValue(outcome) : vi.fn().mockResolvedValue(outcome);
        const initialSetupService = createInitialSetupService({ getStatus: vi.fn().mockResolvedValue({ available: true }), createAdmin });
        render(<App authenticationService={createAuthenticationService()} initialSetupService={initialSetupService} />);
        await findInitialSetupForm();
        fillInitialSetup();
        fireEvent.submit(screen.getByRole('form'));
        expect((await screen.findByRole('alert')).textContent).toBe(APP_MESSAGES.UNEXPECTED_SETUP_ERROR);
        expect(screen.queryByText(APP_MESSAGES.SETUP_CREATED)).toBeNull();
        expect(document.body.textContent).not.toContain('senha e convite privados');
    });
});

describe('respostas tardias do fluxo de acesso', () => {
    test('não consulta cadastro depois de desmontar durante a consulta da sessão', async () => {
        const pending = deferred();
        const initialSetupService = createInitialSetupService();
        const { unmount } = render(<App authenticationService={createAuthenticationService({ getSession: vi.fn().mockReturnValue(pending.promise) })} initialSetupService={initialSetupService} />);
        unmount();
        await act(async () => { pending.reject(createAuthenticationRequiredError()); await pending.promise.catch(() => {}); });
        expect(initialSetupService.getStatus).not.toHaveBeenCalled();
    });

    test('ignora criação pendente quando os serviços são substituídos', async () => {
        const pending = deferred();
        const authenticationService = createAuthenticationService();
        const firstService = createInitialSetupService({ getStatus: vi.fn().mockResolvedValue({ available: true }), createAdmin: vi.fn().mockReturnValue(pending.promise) });
        const { rerender } = render(<App authenticationService={authenticationService} initialSetupService={firstService} />);
        await findInitialSetupForm();
        fillInitialSetup();
        fireEvent.submit(screen.getByRole('form'));
        rerender(<App
                authenticationService={authenticationService}
                initialSetupService={createInitialSetupService()}
            />);
        await findLoginForm();
        await act(async () => { pending.resolve({ created: true }); await pending.promise; });
        expect(screen.queryByText(APP_MESSAGES.SETUP_CREATED)).toBeNull();
        expect(screen.getByRole('button', { name: 'Entrar' }).disabled).toBe(true);
    });
});
