const mongoose = require('mongoose');

/**
 * Nomes legíveis dos estados internos utilizados pelo Mongoose.
 *
 * O driver representa os estados com números:
 * 0 = desconectado;
 * 1 = conectado;
 * 2 = conectando;
 * 3 = desconectando.
 */
const CONNECTION_STATES = Object.freeze({
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnecting'
});

/**
 * Gerencia o ciclo de vida da conexão com MongoDB.
 *
 * A classe recebe o cliente Mongoose e o logger como dependências. Isso
 * permite testar toda a lógica sem instalar ou acessar um banco real.
 */
class DatabaseConnection {
    /**
     * @param {object} options Dependências da conexão.
     * @param {typeof mongoose} options.mongooseClient Cliente Mongoose.
     * @param {{ info: Function, error: Function }} [options.logger=console]
     * Serviço responsável pelos registros operacionais.
     */
    constructor({
        mongooseClient,
        logger = console
    }) {
        if (
            !mongooseClient
            || typeof mongooseClient.connect !== 'function'
            || typeof mongooseClient.disconnect !== 'function'
        ) {
            throw new TypeError(
                'DatabaseConnection exige um cliente Mongoose válido.'
            );
        }

        if (
            !logger
            || typeof logger.info !== 'function'
            || typeof logger.error !== 'function'
        ) {
            throw new TypeError(
                'DatabaseConnection exige um logger válido.'
            );
        }

        this.mongooseClient = mongooseClient;
        this.logger = logger;

        /**
         * Guarda uma conexão que ainda está sendo estabelecida.
         *
         * Se duas partes da aplicação chamarem connect() simultaneamente,
         * ambas aguardarão a mesma operação em vez de abrir conexões
         * concorrentes.
         */
        this.connectionPromise = null;
    }

    /**
     * Retorna o estado atual em formato legível.
     *
     * @returns {string} Estado atual da conexão.
     */
    getState() {
        const readyState =
            this.mongooseClient.connection?.readyState ?? 0;

        return CONNECTION_STATES[readyState] ?? 'unknown';
    }

    /**
     * Informa se o banco está pronto para receber operações.
     *
     * @returns {boolean} Verdadeiro quando a conexão está estabelecida.
     */
    isConnected() {
        return this.getState() === 'connected';
    }

    /**
     * Estabelece a conexão com MongoDB.
     *
     * @param {string} uri URI validada do MongoDB.
     * @param {object} options Opções da conexão.
     * @param {boolean} [options.autoIndex=true]
     * Permite criação automática de índices.
     *
     * @returns {Promise<object>} Conexão ativa do Mongoose.
     */
    async connect(
        uri,
        {
            autoIndex = true
        } = {}
    ) {
        /**
         * Reutiliza imediatamente uma conexão já estabelecida.
         */
        if (this.isConnected()) {
            return this.mongooseClient.connection;
        }

        /**
         * Reutiliza uma tentativa de conexão que ainda esteja em andamento.
         */
        if (this.connectionPromise) {
            return this.connectionPromise;
        }

        /**
         * As opções limitam o tempo de espera e o tamanho do pool.
         *
         * autoIndex será desativado em produção mais adiante, evitando que
         * alterações de índice ocorram automaticamente durante a partida.
         */
        const connectionOptions = {
            serverSelectionTimeoutMS: 10000,
            maxPoolSize: 10,
            minPoolSize: 0,
            autoIndex
        };

        /**
         * strictQuery impede que campos desconhecidos sejam considerados
         * silenciosamente em filtros.
         *
         * sanitizeFilter adiciona proteção aos filtros recebidos pela
         * aplicação antes de enviá-los ao MongoDB.
         */
        this.mongooseClient.set('strictQuery', true);
        this.mongooseClient.set('sanitizeFilter', true);

        this.connectionPromise = this.mongooseClient
            .connect(uri, connectionOptions)
            .then(() => {
                this.logger.info(
                    'Conexão com MongoDB estabelecida.'
                );

                return this.mongooseClient.connection;
            })
            .catch((error) => {
                /**
                 * A URI não é registrada, pois pode conter usuário e senha.
                 */
                this.logger.error(
                    'Falha ao estabelecer conexão com MongoDB.',
                    {
                        errorName: error.name,
                        message: error.message
                    }
                );

                throw error;
            })
            .finally(() => {
                this.connectionPromise = null;
            });

        return this.connectionPromise;
    }

    /**
     * Encerra a conexão ativa.
     *
     * Chamadas repetidas são seguras. Se o banco já estiver desconectado,
     * nenhuma nova operação será executada.
     *
     * @returns {Promise<void>}
     */
    async disconnect() {
        if (this.getState() === 'disconnected') {
            return;
        }

        await this.mongooseClient.disconnect();

        this.logger.info(
            'Conexão com MongoDB encerrada.'
        );
    }
}

/**
 * Instância utilizada pela aplicação real.
 *
 * Os testes criarão instâncias próprias com dependências simuladas.
 */
const databaseConnection = new DatabaseConnection({
    mongooseClient: mongoose
});

module.exports = {
    DatabaseConnection,
    databaseConnection
};