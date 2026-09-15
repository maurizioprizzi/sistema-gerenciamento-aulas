'use strict';

const http = require('node:http');
const path = require('node:path');
const dotenv = require('dotenv');

const { createApp } = require('./app');
const { databaseConnection } = require('./config/database');
const { loadEnvironment } = require('./config/env');
const {
    SESSION_COOKIE_NAMES,
    createMongoSessionStore,
    createSessionMiddleware,
} = require('./config/session');
const {
    AuthenticationController,
} = require('./controllers/AuthenticationController');
const {
    LessonController,
} = require('./controllers/LessonController');
const { Lesson } = require('./models/Lesson');
const { User } = require('./models/User');
const {
    createAuthenticationRateLimiter,
} = require('./middlewares/authenticationRateLimiter');
const {
    createFrontendAssetsMiddleware,
} = require('./middlewares/frontendAssets');
const {
    createSecurityHeadersMiddleware,
} = require('./middlewares/securityHeaders');
const {
    createAuthenticationRouter,
} = require('./routes/authenticationRoutes');
const {
    createLessonRouter,
} = require('./routes/lessonRoutes');
const {
    AdminBootstrapper,
} = require('./services/AdminBootstrapper');
const {
    AuthenticationService,
} = require('./services/AuthenticationService');
const {
    LessonService,
} = require('./services/LessonService');
const {
    PasswordHasher,
} = require('./services/PasswordHasher');
const {
    SessionManager,
} = require('./services/SessionManager');

/**
 * Caminho absoluto da compilação produzida pelo Vite.
 *
 * A resolução utiliza __dirname para não depender do diretório em que o
 * comando de inicialização foi executado.
 */
const FRONTEND_BUILD_DIRECTORY = path.resolve(
    __dirname,
    '..',
    'client',
    'dist',
);

/**
 * Mensagens estáveis relacionadas ao ponto de composição.
 */
const SERVER_ERROR_MESSAGES = Object.freeze({
    INVALID_ADMIN_FACTORY:
        'A fábrica de inicialização administrativa deve ser uma função.',
    INVALID_ADMIN_SERVICE:
        'A fábrica administrativa deve retornar um serviço com ensureAdmin().',
    INVALID_SESSION_STORE_FACTORY:
        'A fábrica do armazenamento de sessões deve ser uma função.',
    INVALID_SESSION_MIDDLEWARE_FACTORY:
        'A fábrica do middleware de sessão deve ser uma função.',
    INVALID_AUTHENTICATION_ROUTER_FACTORY:
        'A fábrica do roteador de autenticação deve ser uma função.',
    INVALID_AUTHENTICATION_ROUTER:
        'A fábrica de autenticação deve retornar um roteador válido.',
    INVALID_LESSON_ROUTER_FACTORY:
        'A fábrica do roteador de aulas deve ser uma função.',
    INVALID_LESSON_ROUTER:
        'A fábrica de aulas deve retornar um roteador válido.',
    INVALID_SECURITY_HEADERS_MIDDLEWARE_FACTORY:
        'A fábrica dos cabeçalhos de segurança deve ser uma função.',
    INVALID_SECURITY_HEADERS_MIDDLEWARE:
        'A fábrica de segurança deve retornar um middleware válido.',
    INVALID_FRONTEND_ASSETS_MIDDLEWARE_FACTORY:
        'A fábrica dos arquivos do frontend deve ser uma função.',
    INVALID_FRONTEND_ASSETS_MIDDLEWARE:
        'A fábrica do frontend deve retornar um middleware válido.',
});

/**
 * Converte e valida o número da porta informado pelo ambiente.
 *
 * @param {string | undefined} value Valor recebido da variável PORT.
 * @returns {number} Porta válida para o servidor HTTP.
 */
function resolvePort(value) {
    const rawValue = value ?? '3000';
    const containsOnlyDigits = /^\d+$/.test(rawValue);

    if (!containsOnlyDigits) {
        throw new RangeError(
            'A variável PORT deve conter um número inteiro entre 1 e 65535.',
        );
    }

    const port = Number(rawValue);

    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new RangeError(
            'A variável PORT deve conter um número inteiro entre 1 e 65535.',
        );
    }

    return port;
}

/**
 * Aguarda o servidor HTTP começar a aceitar conexões.
 *
 * @param {import('node:http').Server} server Servidor HTTP.
 * @param {string} host Interface de rede.
 * @param {number} port Porta HTTP.
 * @returns {Promise<void>}
 */
function listen(server, host, port) {
    return new Promise((resolve, reject) => {
        function handleStartupError(error) {
            reject(error);
        }

        server.once('error', handleStartupError);
        server.listen(port, host, () => {
            server.removeListener('error', handleStartupError);
            resolve();
        });
    });
}

/**
 * Aguarda o encerramento das conexões HTTP existentes.
 *
 * @param {import('node:http').Server} server Servidor HTTP.
 * @returns {Promise<void>}
 */
function closeServer(server) {
    return new Promise((resolve, reject) => {
        server.close((error) => {
            if (error) {
                reject(error);
                return;
            }

            resolve();
        });
    });
}

/**
 * Constrói o serviço responsável pela conta administrativa inicial.
 *
 * @param {object} options Configurações da composição.
 * @param {number} options.passwordHashRounds Custo validado do bcrypt.
 * @param {object} options.logger Logger operacional.
 * @returns {AdminBootstrapper} Serviço administrativo configurado.
 */
function createAdminBootstrapper({
    passwordHashRounds,
    logger,
}) {
    const passwordHasherService = new PasswordHasher({
        rounds: passwordHashRounds,
    });

    return new AdminBootstrapper({
        passwordHasherService,
        logger,
    });
}

/**
 * Compõe os serviços e a camada HTTP da autenticação administrativa.
 *
 * O nome do cookie é escolhido pela mesma constante utilizada na criação do
 * middleware de sessão. Isso garante que o logout apague exatamente o cookie
 * emitido pelo express-session em desenvolvimento ou produção.
 *
 * @param {object} options Configurações da composição.
 * @param {number} options.passwordHashRounds Custo validado do bcrypt.
 * @param {boolean} options.isProduction Indicação validada do ambiente.
 * @returns {Function} Roteador Express de autenticação.
 */
function createAdministrativeAuthenticationRouter({
    passwordHashRounds,
    isProduction,
}) {
    const passwordHasherService = new PasswordHasher({
        rounds: passwordHashRounds,
    });

    const authenticationService = new AuthenticationService({
        UserModel: User,
        passwordHasherService,
    });

    const sessionManagerService = new SessionManager();
    const cookieName = isProduction
        ? SESSION_COOKIE_NAMES.PRODUCTION
        : SESSION_COOKIE_NAMES.DEVELOPMENT;

    const controller = new AuthenticationController({
        authenticationService,
        sessionManager: sessionManagerService,
        cookieName,
        isProduction,
    });

    /**
     * O limitador é construído no ponto de composição e aplicado somente ao
     * login. O logout permanece disponível mesmo quando novas tentativas de
     * entrada estiverem temporariamente bloqueadas.
     */
    const loginRateLimiter = createAuthenticationRateLimiter();

    return createAuthenticationRouter({
        controller,
        loginRateLimiter,
    });
}

/**
 * Compõe as regras e a camada HTTP inicial das aulas.
 *
 * A composição utiliza o modelo persistente real, mas sua construção não abre
 * conexão com o MongoDB. Serviço, controlador e roteador permanecem separados
 * e recebem suas dependências explicitamente.
 *
 * @returns {Function} Roteador Express administrativo de aulas.
 */
function createAdministrativeLessonRouter() {
    const lessonService = new LessonService({
        LessonModel: Lesson,
    });

    const controller = new LessonController({
        lessonService,
    });

    return createLessonRouter({
        controller,
    });
}

/**
 * Carrega a configuração e inicia todos os componentes da aplicação.
 *
 * A ordem é intencional: ambiente, segurança, frontend, MongoDB,
 * administrador, armazenamento de sessões, middleware, autenticação,
 * aulas, Express e servidor HTTP.
 *
 * @param {object} options Dependências de inicialização.
 * @param {object} [options.database=databaseConnection] Banco de dados.
 * @param {Function} [options.appFactory=createApp] Fábrica do Express.
 * @param {Function} [options.adminBootstrapperFactory]
 * Fábrica da inicialização administrativa.
 * @param {Function} [options.sessionStoreFactory]
 * Fábrica do armazenamento de sessões.
 * @param {Function} [options.sessionMiddlewareFactory]
 * Fábrica do middleware de sessão.
 * @param {Function} [options.authenticationRouterFactory]
 * Fábrica da composição de autenticação.
 * @param {Function} [options.lessonRouterFactory]
 * Fábrica da composição administrativa das aulas.
 * @param {Function} [options.securityHeadersMiddlewareFactory]
 * Fábrica dos cabeçalhos HTTP de segurança.
 * @param {Function} [options.frontendAssetsMiddlewareFactory]
 * Fábrica dos arquivos compilados do frontend.
 * @param {object} [options.logger=console] Logger operacional.
 * @returns {Promise<import('node:http').Server>} Servidor iniciado.
 */
async function startServer({
    database = databaseConnection,
    appFactory = createApp,
    adminBootstrapperFactory = createAdminBootstrapper,
    sessionStoreFactory = createMongoSessionStore,
    sessionMiddlewareFactory = createSessionMiddleware,
    authenticationRouterFactory =
        createAdministrativeAuthenticationRouter,
    lessonRouterFactory = createAdministrativeLessonRouter,
    securityHeadersMiddlewareFactory =
        createSecurityHeadersMiddleware,
    frontendAssetsMiddlewareFactory =
        createFrontendAssetsMiddleware,
    logger = console,
} = {}) {
    dotenv.config({ quiet: true });

    const environment = loadEnvironment();
    const port = resolvePort(environment.PORT);
    const host = environment.HOST;

    /**
     * Falhas estruturais são detectadas antes de abrir recursos externos.
     */
    if (typeof adminBootstrapperFactory !== 'function') {
        throw new TypeError(SERVER_ERROR_MESSAGES.INVALID_ADMIN_FACTORY);
    }

    if (typeof sessionStoreFactory !== 'function') {
        throw new TypeError(
            SERVER_ERROR_MESSAGES.INVALID_SESSION_STORE_FACTORY,
        );
    }

    if (typeof sessionMiddlewareFactory !== 'function') {
        throw new TypeError(
            SERVER_ERROR_MESSAGES.INVALID_SESSION_MIDDLEWARE_FACTORY,
        );
    }

    if (typeof authenticationRouterFactory !== 'function') {
        throw new TypeError(
            SERVER_ERROR_MESSAGES.INVALID_AUTHENTICATION_ROUTER_FACTORY,
        );
    }

    if (typeof lessonRouterFactory !== 'function') {
        throw new TypeError(
            SERVER_ERROR_MESSAGES.INVALID_LESSON_ROUTER_FACTORY,
        );
    }

    if (typeof securityHeadersMiddlewareFactory !== 'function') {
        throw new TypeError(
            SERVER_ERROR_MESSAGES
                .INVALID_SECURITY_HEADERS_MIDDLEWARE_FACTORY,
        );
    }

    if (typeof frontendAssetsMiddlewareFactory !== 'function') {
        throw new TypeError(
            SERVER_ERROR_MESSAGES
                .INVALID_FRONTEND_ASSETS_MIDDLEWARE_FACTORY,
        );
    }

    /**
     * Estas fábricas não abrem recursos externos. Sua execução antecipada
     * permite rejeitar uma configuração inválida antes de conectar o banco.
     */
    const securityHeadersMiddleware =
        securityHeadersMiddlewareFactory({
            isProduction: environment.IS_PRODUCTION,
        });

    if (typeof securityHeadersMiddleware !== 'function') {
        throw new TypeError(
            SERVER_ERROR_MESSAGES
                .INVALID_SECURITY_HEADERS_MIDDLEWARE,
        );
    }

    const frontendAssetsMiddleware =
        frontendAssetsMiddlewareFactory({
            directory: FRONTEND_BUILD_DIRECTORY,
        });

    if (typeof frontendAssetsMiddleware !== 'function') {
        throw new TypeError(
            SERVER_ERROR_MESSAGES
                .INVALID_FRONTEND_ASSETS_MIDDLEWARE,
        );
    }

    let server = null;

    try {
        await database.connect(
            environment.MONGODB_URI,
            {
                autoIndex: !environment.IS_PRODUCTION,
            },
        );

        const adminBootstrapper = adminBootstrapperFactory({
            passwordHashRounds: environment.PASSWORD_HASH_ROUNDS,
            logger,
        });

        if (
            !adminBootstrapper
            || typeof adminBootstrapper.ensureAdmin !== 'function'
        ) {
            throw new TypeError(
                SERVER_ERROR_MESSAGES.INVALID_ADMIN_SERVICE,
            );
        }

        await adminBootstrapper.ensureAdmin({
            name: environment.ADMIN_NAME,
            email: environment.ADMIN_EMAIL,
            password: environment.ADMIN_PASSWORD,
        });

        const nativeClient = database.getNativeClient();
        const sessionStore = sessionStoreFactory({
            nativeClient,
            maxAgeMs: environment.SESSION_MAX_AGE_MS,
        });

        sessionStore.on('error', (error) => {
            logger.error(
                'Erro no armazenamento persistente de sessões.',
                {
                    errorName: error.name,
                    message: error.message,
                },
            );

            process.exitCode = 1;
        });

        const sessionMiddleware = sessionMiddlewareFactory({
            store: sessionStore,
            secret: environment.SESSION_SECRET,
            maxAgeMs: environment.SESSION_MAX_AGE_MS,
            isProduction: environment.IS_PRODUCTION,
        });

        const authenticationRouter =
            authenticationRouterFactory({
                passwordHashRounds:
                    environment.PASSWORD_HASH_ROUNDS,
                isProduction: environment.IS_PRODUCTION,
            });

        if (typeof authenticationRouter !== 'function') {
            throw new TypeError(
                SERVER_ERROR_MESSAGES.INVALID_AUTHENTICATION_ROUTER,
            );
        }

        const lessonRouter = lessonRouterFactory();

        if (typeof lessonRouter !== 'function') {
            throw new TypeError(
                SERVER_ERROR_MESSAGES.INVALID_LESSON_ROUTER,
            );
        }

        const app = appFactory({
            logger,
            securityHeadersMiddleware,
            sessionMiddleware,
            authenticationRouter,
            lessonRouter,
            frontendAssetsMiddleware,
        });

        if (environment.TRUST_PROXY) {
            app.set('trust proxy', 1);
        }

        server = http.createServer(app);
        await listen(server, host, port);
    } catch (error) {
        try {
            await database.disconnect();
        } catch (disconnectError) {
            logger.error(
                'Falha ao encerrar o MongoDB após erro de inicialização.',
                {
                    errorName: disconnectError.name,
                    message: disconnectError.message,
                },
            );
        }

        throw error;
    }

    logger.log('Calendário do Prof. Dionísio iniciado com sucesso.');
    logger.log(`Ambiente: ${environment.NODE_ENV}`);
    logger.log(`Endereço local: http://localhost:${port}`);

    let isShuttingDown = false;

    async function shutdown(signal) {
        if (isShuttingDown) {
            return;
        }

        isShuttingDown = true;
        logger.log(`\n${signal} recebido. Encerrando a aplicação...`);

        try {
            await closeServer(server);
            await database.disconnect();
            logger.log('Aplicação encerrada com segurança.');
        } catch (error) {
            logger.error(
                'Erro durante o encerramento da aplicação.',
                {
                    errorName: error.name,
                    message: error.message,
                },
            );

            process.exitCode = 1;
        }
    }

    process.once('SIGINT', () => void shutdown('SIGINT'));
    process.once('SIGTERM', () => void shutdown('SIGTERM'));

    server.on('error', (error) => {
        logger.error(
            'Erro no servidor HTTP.',
            {
                errorName: error.name,
                message: error.message,
            },
        );

        process.exitCode = 1;
    });

    return server;
}

if (require.main === module) {
    startServer().catch((error) => {
        console.error(
            `Não foi possível iniciar a aplicação:\n${error.message}`,
        );

        process.exitCode = 1;
    });
}

module.exports = {
    FRONTEND_BUILD_DIRECTORY,
    SERVER_ERROR_MESSAGES,
    createAdminBootstrapper,
    createAdministrativeAuthenticationRouter,
    createAdministrativeLessonRouter,
    resolvePort,
    startServer,
};
