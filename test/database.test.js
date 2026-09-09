'use strict';

const assert = require('node:assert/strict');
const {
    describe,
    test
} = require('node:test');

const {
    DatabaseConnection
} = require('../src/config/database');

/**
 * Cria um logger que armazena as mensagens recebidas.
 *
 * Isso evita saída no terminal e permite verificar os registros.
 *
 * @returns {object} Logger controlado para os testes.
 */
function createLogger() {
    return {
        infoCalls: [],
        errorCalls: [],

        info(...argumentsReceived) {
            this.infoCalls.push(argumentsReceived);
        },

        error(...argumentsReceived) {
            this.errorCalls.push(argumentsReceived);
        }
    };
}

/**
 * Cria uma implementação simulada do Mongoose.
 *
 * O objeto possui apenas os recursos utilizados por DatabaseConnection.
 * Nenhuma conexão de rede é realizada.
 *
 * @param {number} initialReadyState Estado inicial da conexão.
 * @returns {object} Cliente, chamadas e controles do teste.
 */
function createFakeMongoose(initialReadyState = 0) {
    const calls = {
        connect: [],
        disconnect: 0,
        getClient: 0,
        set: []
    };

    /**
     * Representa o MongoClient que, na aplicação real, pertence ao driver
     * oficial do MongoDB e é administrado pelo Mongoose.
     */
    const nativeClient = {
        db() {
            return {};
        }
    };

    let connectImplementation = null;

    const client = {
        connection: {
            readyState: initialReadyState,

            getClient() {
                calls.getClient += 1;

                return nativeClient;
            }
        },

        set(name, value) {
            calls.set.push([name, value]);
        },

        async connect(uri, options) {
            calls.connect.push({ uri, options });

            if (connectImplementation) {
                return connectImplementation();
            }

            client.connection.readyState = 1;

            return client;
        },

        async disconnect() {
            calls.disconnect += 1;
            client.connection.readyState = 0;
        }
    };

    return {
        client,
        calls,
        nativeClient,

        setConnectImplementation(implementation) {
            connectImplementation = implementation;
        }
    };
}

describe('DatabaseConnection', () => {
    test('exige um cliente Mongoose válido', () => {
        assert.throws(
            () => new DatabaseConnection({
                mongooseClient: null
            }),
            {
                name: 'TypeError',
                message:
                    'DatabaseConnection exige um cliente Mongoose válido.'
            }
        );

        assert.throws(
            () => new DatabaseConnection({
                mongooseClient: {
                    connect() {}
                }
            }),
            {
                name: 'TypeError',
                message:
                    'DatabaseConnection exige um cliente Mongoose válido.'
            }
        );
    });

    test('exige um logger válido quando ele é informado', () => {
        const { client } = createFakeMongoose();

        assert.throws(
            () => new DatabaseConnection({
                mongooseClient: client,
                logger: {
                    info() {}
                }
            }),
            {
                name: 'TypeError',
                message:
                    'DatabaseConnection exige um logger válido.'
            }
        );
    });

    test('traduz os estados internos do Mongoose', () => {
        const { client } = createFakeMongoose();
        const database = new DatabaseConnection({
            mongooseClient: client,
            logger: createLogger()
        });

        const expectedStates = [
            [0, 'disconnected'],
            [1, 'connected'],
            [2, 'connecting'],
            [3, 'disconnecting'],
            [99, 'unknown']
        ];

        for (const [readyState, expectedState] of expectedStates) {
            client.connection.readyState = readyState;

            assert.equal(
                database.getState(),
                expectedState
            );
        }
    });

    test('informa quando a conexão está ativa', () => {
        const { client } = createFakeMongoose(1);
        const database = new DatabaseConnection({
            mongooseClient: client,
            logger: createLogger()
        });

        assert.equal(database.isConnected(), true);

        client.connection.readyState = 0;

        assert.equal(database.isConnected(), false);
    });

    test(
        'impede obter o cliente nativo antes da conexão',
        () => {
            const {
                client,
                calls
            } = createFakeMongoose(0);

            const database = new DatabaseConnection({
                mongooseClient: client,
                logger: createLogger()
            });

            assert.throws(
                () => database.getNativeClient(),
                {
                    name: 'Error',
                    message:
                        'O cliente MongoDB somente está disponível após a conexão.'
                }
            );

            /**
             * A implementação nem tenta acessar o cliente nativo quando o
             * estado da conexão informa que o banco está indisponível.
             */
            assert.equal(calls.getClient, 0);
        }
    );

    test(
        'rejeita conexão sem acesso ao cliente nativo',
        () => {
            const { client } = createFakeMongoose(1);

            delete client.connection.getClient;

            const database = new DatabaseConnection({
                mongooseClient: client,
                logger: createLogger()
            });

            assert.throws(
                () => database.getNativeClient(),
                {
                    name: 'TypeError',
                    message:
                        'A conexão Mongoose não fornece um cliente MongoDB válido.'
                }
            );
        }
    );

    test(
        'rejeita um cliente nativo com formato inválido',
        () => {
            const invalidClients = [
                null,
                {},
                {
                    db: 'não é uma função'
                }
            ];

            for (const invalidClient of invalidClients) {
                const { client } = createFakeMongoose(1);

                client.connection.getClient = () => invalidClient;

                const database = new DatabaseConnection({
                    mongooseClient: client,
                    logger: createLogger()
                });

                assert.throws(
                    () => database.getNativeClient(),
                    {
                        name: 'TypeError',
                        message:
                            'A conexão Mongoose não fornece um cliente MongoDB válido.'
                    }
                );
            }
        }
    );

    test(
        'entrega o mesmo cliente nativo mantido pelo Mongoose',
        () => {
            const {
                client,
                calls,
                nativeClient
            } = createFakeMongoose(1);

            const database = new DatabaseConnection({
                mongooseClient: client,
                logger: createLogger()
            });

            const result = database.getNativeClient();

            assert.equal(result, nativeClient);
            assert.equal(calls.getClient, 1);
        }
    );

    test('estabelece a conexão com opções seguras', async () => {
        const uri =
            'mongodb://127.0.0.1:27017/calendario_teste';

        const { client, calls } = createFakeMongoose();
        const logger = createLogger();

        const database = new DatabaseConnection({
            mongooseClient: client,
            logger
        });

        const result = await database.connect(uri, {
            autoIndex: false
        });

        assert.equal(result, client.connection);
        assert.equal(database.isConnected(), true);
        assert.equal(calls.connect.length, 1);
        assert.equal(calls.connect[0].uri, uri);
        assert.deepEqual(calls.connect[0].options, {
            serverSelectionTimeoutMS: 10000,
            maxPoolSize: 10,
            minPoolSize: 0,
            autoIndex: false
        });

        assert.deepEqual(calls.set, [
            ['strictQuery', true],
            ['sanitizeFilter', true]
        ]);

        assert.deepEqual(logger.infoCalls, [
            ['Conexão com MongoDB estabelecida.']
        ]);

        assert.equal(logger.errorCalls.length, 0);
    });

    test('reutiliza uma conexão que já está ativa', async () => {
        const { client, calls } = createFakeMongoose(1);

        const database = new DatabaseConnection({
            mongooseClient: client,
            logger: createLogger()
        });

        const result = await database.connect(
            'mongodb://127.0.0.1:27017/teste'
        );

        assert.equal(result, client.connection);
        assert.equal(calls.connect.length, 0);
    });

    test('evita tentativas simultâneas de conexão', async () => {
        const {
            client,
            calls,
            setConnectImplementation
        } = createFakeMongoose();

        let completeConnection;

        const pendingConnection = new Promise((resolve) => {
            completeConnection = () => {
                client.connection.readyState = 1;
                resolve(client);
            };
        });

        setConnectImplementation(
            () => pendingConnection
        );

        const database = new DatabaseConnection({
            mongooseClient: client,
            logger: createLogger()
        });

        const firstAttempt = database.connect(
            'mongodb://127.0.0.1:27017/teste'
        );

        const secondAttempt = database.connect(
            'mongodb://127.0.0.1:27017/teste'
        );

        assert.equal(calls.connect.length, 1);

        completeConnection();

        const [firstResult, secondResult] = await Promise.all([
            firstAttempt,
            secondAttempt
        ]);

        assert.equal(firstResult, client.connection);
        assert.equal(secondResult, client.connection);
        assert.equal(calls.connect.length, 1);
    });

    test('registra uma falha sem incluir a URI', async () => {
        const confidentialUri =
            'mongodb://usuario:senha@localhost:27017/teste';

        const {
            client,
            setConnectImplementation
        } = createFakeMongoose();

        const logger = createLogger();
        const connectionError = new Error(
            'Servidor de banco indisponível.'
        );

        setConnectImplementation(
            async () => {
                throw connectionError;
            }
        );

        const database = new DatabaseConnection({
            mongooseClient: client,
            logger
        });

        await assert.rejects(
            database.connect(confidentialUri),
            connectionError
        );

        assert.equal(logger.errorCalls.length, 1);

        assert.equal(
            JSON.stringify(logger.errorCalls).includes(
                confidentialUri
            ),
            false
        );
    });

    test('permite tentar novamente depois de uma falha', async () => {
        const {
            client,
            calls,
            setConnectImplementation
        } = createFakeMongoose();

        let attempt = 0;

        setConnectImplementation(
            async () => {
                attempt += 1;

                if (attempt === 1) {
                    throw new Error('Falha temporária.');
                }

                client.connection.readyState = 1;

                return client;
            }
        );

        const database = new DatabaseConnection({
            mongooseClient: client,
            logger: createLogger()
        });

        await assert.rejects(
            database.connect(
                'mongodb://127.0.0.1:27017/teste'
            )
        );

        const result = await database.connect(
            'mongodb://127.0.0.1:27017/teste'
        );

        assert.equal(result, client.connection);
        assert.equal(calls.connect.length, 2);
    });

    test(
        'não desconecta novamente quando já está desconectado',
        async () => {
            const {
                client,
                calls
            } = createFakeMongoose(0);

            const logger = createLogger();

            const database = new DatabaseConnection({
                mongooseClient: client,
                logger
            });

            await database.disconnect();

            assert.equal(calls.disconnect, 0);
            assert.equal(logger.infoCalls.length, 0);
        }
    );

    test('encerra uma conexão ativa', async () => {
        const {
            client,
            calls
        } = createFakeMongoose(1);

        const logger = createLogger();

        const database = new DatabaseConnection({
            mongooseClient: client,
            logger
        });

        await database.disconnect();

        assert.equal(calls.disconnect, 1);
        assert.equal(database.getState(), 'disconnected');

        assert.deepEqual(logger.infoCalls, [
            ['Conexão com MongoDB encerrada.']
        ]);
    });
});