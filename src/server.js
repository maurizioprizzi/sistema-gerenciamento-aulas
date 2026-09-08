const http = require('node:http');

const dotenv = require('dotenv');

const { createApp } = require('./app');
const { loadEnvironment } = require('./config/env');
const {
    databaseConnection
} = require('./config/database');

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
            'A variável PORT deve conter um número inteiro entre 1 e 65535.'
        );
    }

    const port = Number(rawValue);

    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new RangeError(
            'A variável PORT deve conter um número inteiro entre 1 e 65535.'
        );
    }

    return port;
}

/**
 * Aguarda o servidor HTTP começar a aceitar conexões.
 *
 * A função converte o modelo baseado em eventos do Node.js em uma Promise,
 * permitindo que a sequência de inicialização utilize async/await.
 *
 * @param {import('node:http').Server} server Servidor HTTP.
 * @param {string} host Interface de rede.
 * @param {number} port Porta HTTP.
 * @returns {Promise<void>}
 */
function listen(server, host, port) {
    return new Promise((resolve, reject) => {
        /**
         * Este listener trata somente erros ocorridos durante a abertura.
         */
        function handleStartupError(error) {
            reject(error);
        }

        server.once('error', handleStartupError);

        server.listen(port, host, () => {
            server.removeListener(
                'error',
                handleStartupError
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
 * Carrega a configuração, conecta o banco e inicia o servidor HTTP.
 *
 * A conexão com MongoDB acontece antes da abertura da porta. Dessa forma, a
 * aplicação nunca anuncia que está disponível enquanto seu armazenamento
 * principal estiver inacessível.
 *
 * As dependências opcionais permitem testar o ciclo de vida sem acessar rede
 * ou banco reais.
 *
 * @param {object} options Dependências de inicialização.
 * @param {object} [options.database=databaseConnection]
 * Gerenciador da conexão com o banco.
 * @param {Function} [options.appFactory=createApp]
 * Função responsável pela criação da aplicação Express.
 * @param {{ log: Function, error: Function }} [options.logger=console]
 * Serviço de registro operacional.
 *
 * @returns {Promise<import('node:http').Server>} Servidor iniciado.
 */
async function startServer({
    database = databaseConnection,
    appFactory = createApp,
    logger = console
} = {}) {
    /**
     * Carrega o arquivo .env sem substituir variáveis fornecidas pelo sistema
     * operacional ou pela futura plataforma de hospedagem.
     */
    dotenv.config({ quiet: true });

    const environment = loadEnvironment();
    const port = resolvePort(environment.PORT);
    const host = environment.HOST;

    let server = null;

    try {
        /**
         * Índices automáticos são úteis durante o desenvolvimento.
         *
         * Em produção, os índices serão administrados de forma controlada
         * para evitar mudanças inesperadas durante a inicialização.
         */
        await database.connect(
            environment.MONGODB_URI,
            {
                autoIndex: !environment.IS_PRODUCTION
            }
        );

        const app = appFactory({ logger });

        /**
         * A configuração de proxy pertence ao Express.
         *
         * Ela só é ativada quando explicitamente autorizada no ambiente.
         */
        if (environment.TRUST_PROXY) {
            app.set('trust proxy', 1);
        }

        server = http.createServer(app);

        await listen(server, host, port);
    } catch (error) {
        /**
         * Se o banco conectou, mas a abertura HTTP falhou, a conexão precisa
         * ser encerrada antes de propagar o erro.
         */
        try {
            await database.disconnect();
        } catch (disconnectError) {
            logger.error(
                'Falha ao encerrar o MongoDB após erro de inicialização.',
                {
                    errorName: disconnectError.name,
                    message: disconnectError.message
                }
            );
        }

        throw error;
    }

    logger.log(
        'Calendário do Prof. Dionísio iniciado com sucesso.'
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
            `\n${signal} recebido. Encerrando a aplicação...`
        );

        try {
            await closeServer(server);
            await database.disconnect();

            logger.log(
                'Aplicação encerrada com segurança.'
            );
        } catch (error) {
            logger.error(
                'Erro durante o encerramento da aplicação.',
                {
                    errorName: error.name,
                    message: error.message
                }
            );

            process.exitCode = 1;
        }
    }

    process.once(
        'SIGINT',
        () => void shutdown('SIGINT')
    );

    process.once(
        'SIGTERM',
        () => void shutdown('SIGTERM')
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
                message: error.message
            }
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
            `Não foi possível iniciar a aplicação:\n${error.message}`
        );

        process.exitCode = 1;
    });
}

module.exports = {
    resolvePort,
    startServer
};