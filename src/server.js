'use strict';

const http = require('node:http');

const dotenv = require('dotenv');

const { createApp } = require('./app');
const { loadEnvironment } = require('./config/env');
const {
    databaseConnection,
} = require('./config/database');
const {
    createMongoSessionStore,
    createSessionMiddleware,
} = require('./config/session');
const {
    AdminBootstrapper,
} = require('./services/AdminBootstrapper');
const {
    PasswordHasher,
} = require('./services/PasswordHasher');

/**
 * Converte e valida o número da porta informado pelo ambiente.
 *
 * Embora env.js já exija somente algarismos, esta função preserva sua própria
 * proteção. Isso é defesa em profundidade: server.js não depende da suposição
 * de que sempre receberá valores previamente validados.
 *
 * @param {string | undefined} value Valor recebido da variável PORT.
 * @returns {number} Porta válida para o servidor HTTP.
 * @throws {RangeError} Quando o valor não representa uma porta válida.
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
            server.removeListener(
                'error',
                handleStartupError,
            );

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
 * Constrói os serviços responsáveis pela criação da conta administrativa.
 *
 * Essa função pertence ao ponto de composição da aplicação: é aqui que
 * implementações concretas são conectadas umas às outras.
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
 * Carrega a configuração e inicia todos os componentes da aplicação.
 *
 * A ordem de inicialização é intencional:
 *
 * 1. validar o ambiente;
 * 2. conectar o MongoDB;
 * 3. garantir a conta administrativa;
 * 4. obter o cliente MongoDB nativo;
 * 5. criar o armazenamento persistente de sessões;
 * 6. criar o middleware de sessão;
 * 7. construir o Express;
 * 8. abrir o servidor HTTP.
 *
 * A aplicação não anuncia disponibilidade enquanto qualquer dependência
 * obrigatória ainda estiver indisponível.
 *
 * @param {object} options Dependências de inicialização.
 * @param {object} [options.database=databaseConnection]
 * Gerenciador da conexão com o banco.
 * @param {Function} [options.appFactory=createApp]
 * Função responsável pela criação da aplicação Express.
 * @param {Function} [options.adminBootstrapperFactory=createAdminBootstrapper]
 * Função que cria o serviço de inicialização administrativa.
 * @param {Function} [options.sessionStoreFactory=createMongoSessionStore]
 * Função que cria o armazenamento persistente de sessões.
 * @param {Function} [options.sessionMiddlewareFactory=createSessionMiddleware]
 * Função que cria o middleware do express-session.
 * @param {{ log: Function, info: Function, error: Function }}
 * [options.logger=console] Serviço de registro operacional.
 *
 * @returns {Promise<import('node:http').Server>} Servidor iniciado.
 */
async function startServer({
    database = databaseConnection,
    appFactory = createApp,
    adminBootstrapperFactory = createAdminBootstrapper,
    sessionStoreFactory = createMongoSessionStore,
    sessionMiddlewareFactory = createSessionMiddleware,
    logger = console,
} = {}) {
    /**
     * O arquivo .env não substitui variáveis já fornecidas pela plataforma de
     * hospedagem ou pelo sistema operacional.
     */
    dotenv.config({ quiet: true });

    const environment = loadEnvironment();
    const port = resolvePort(environment.PORT);
    const host = environment.HOST;

    /**
     * As fábricas são validadas antes da conexão para impedir que uma
     * configuração estruturalmente inválida abra recursos desnecessários.
     */
    if (typeof adminBootstrapperFactory !== 'function') {
        throw new TypeError(
            'A fábrica de inicialização administrativa deve ser uma função.',
        );
    }

    if (typeof sessionStoreFactory !== 'function') {
        throw new TypeError(
            'A fábrica do armazenamento de sessões deve ser uma função.',
        );
    }

    if (typeof sessionMiddlewareFactory !== 'function') {
        throw new TypeError(
            'A fábrica do middleware de sessão deve ser uma função.',
        );
    }

    let server = null;

    try {
        /**
         * Índices automáticos são úteis durante o desenvolvimento.
         *
         * Em produção, eles permanecem desativados para evitar mudanças
         * inesperadas durante a abertura do processo.
         */
        await database.connect(
            environment.MONGODB_URI,
            {
                autoIndex: !environment.IS_PRODUCTION,
            },
        );

        const adminBootstrapper = adminBootstrapperFactory({
            passwordHashRounds:
                environment.PASSWORD_HASH_ROUNDS,
            logger,
        });

        if (
            !adminBootstrapper
            || typeof adminBootstrapper.ensureAdmin !== 'function'
        ) {
            throw new TypeError(
                'A fábrica administrativa deve retornar um serviço com ensureAdmin().',
            );
        }

        /**
         * A senha administrativa será utilizada somente pelo serviço de hash.
         * Ela não é registrada nem armazenada diretamente no MongoDB.
         */
        await adminBootstrapper.ensureAdmin({
            name: environment.ADMIN_NAME,
            email: environment.ADMIN_EMAIL,
            password: environment.ADMIN_PASSWORD,
        });

        /**
         * O connect-mongo recebe o mesmo MongoClient utilizado pelo Mongoose.
         *
         * Assim, a aplicação não cria um segundo conjunto independente de
         * conexões apenas para armazenar sessões.
         */
        const nativeClient = database.getNativeClient();

        const sessionStore = sessionStoreFactory({
            nativeClient,
            maxAgeMs: environment.SESSION_MAX_AGE_MS,
        });

        /**
         * Erros posteriores do armazenamento são registrados sem expor a URI,
         * o segredo da sessão ou o conteúdo das sessões.
         */
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

        /**
         * O Express recebe apenas o middleware pronto. Ele não conhece a URI,
         * o segredo, o cliente MongoDB nem a biblioteca connect-mongo.
         */
        const app = appFactory({
            logger,
            sessionMiddleware,
        });

        if (environment.TRUST_PROXY) {
            app.set('trust proxy', 1);
        }

        server = http.createServer(app);

        await listen(server, host, port);
    } catch (error) {
        /**
         * O armazenamento de sessões compartilha o cliente do Mongoose.
         * Portanto, o encerramento centralizado do banco também libera os
         * recursos utilizados pelas sessões.
         */
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

    logger.log(
        'Calendário do Prof. Dionísio iniciado com sucesso.',
    );
    logger.log(`Ambiente: ${environment.NODE_ENV}`);
    logger.log(`Endereço local: http://localhost:${port}`);

    /**
     * Evita que dois sinais iniciem encerramentos simultâneos.
     */
    let isShuttingDown = false;

    /**
     * Encerra primeiro o servidor HTTP e depois o MongoDB.
     *
     * @param {string} signal Sinal recebido do sistema operacional.
     * @returns {Promise<void>}
     */
    async function shutdown(signal) {
        if (isShuttingDown) {
            return;
        }

        isShuttingDown = true;

        logger.log(
            `\n${signal} recebido. Encerrando a aplicação...`,
        );

        try {
            await closeServer(server);
            await database.disconnect();

            logger.log(
                'Aplicação encerrada com segurança.',
            );
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

    process.once(
        'SIGINT',
        () => void shutdown('SIGINT'),
    );

    process.once(
        'SIGTERM',
        () => void shutdown('SIGTERM'),
    );

    /**
     * Eventos posteriores à inicialização são registrados sem expor dados da
     * requisição ou da configuração.
     */
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

/**
 * Inicia a aplicação somente quando este arquivo é executado diretamente.
 */
if (require.main === module) {
    startServer().catch((error) => {
        console.error(
            `Não foi possível iniciar a aplicação:\n${error.message}`,
        );

        process.exitCode = 1;
    });
}

module.exports = {
    createAdminBootstrapper,
    resolvePort,
    startServer,
};