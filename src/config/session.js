'use strict';

const session = require('express-session');
const {
    MongoStore
} = require('connect-mongo');

/**
 * Uma sessão pode durar entre uma hora e sete dias.
 *
 * Esses limites repetem, em milissegundos, as regras já aplicadas a
 * SESSION_HOURS. A validação duplicada é intencional: este módulo continua
 * seguro mesmo quando utilizado fora do ciclo normal da aplicação.
 */
const MIN_SESSION_MAX_AGE_MS = 1 * 60 * 60 * 1000;
const MAX_SESSION_MAX_AGE_MS = 168 * 60 * 60 * 1000;

/**
 * Nome dedicado da coleção que armazenará as sessões.
 */
const SESSION_COLLECTION_NAME = 'sessions';

/**
 * Evita atualizar o documento da sessão a cada requisição.
 *
 * O connect-mongo poderá atualizar a expiração no máximo uma vez dentro deste
 * intervalo, reduzindo escritas desnecessárias no banco.
 */
const SESSION_TOUCH_AFTER_SECONDS = 5 * 60;

/**
 * O prefixo __Host- é utilizado somente em produção.
 *
 * Navegadores aceitam esse prefixo apenas quando o cookie:
 * - possui o atributo Secure;
 * - utiliza Path=/;
 * - não declara Domain.
 */
const SESSION_COOKIE_NAMES = Object.freeze({
    DEVELOPMENT: 'calendario.sid',
    PRODUCTION: '__Host-calendario.sid'
});

/**
 * Mensagens centralizadas e imutáveis.
 *
 * Nenhuma mensagem inclui valores recebidos, impedindo exposição acidental
 * de segredos nos logs.
 */
const SESSION_ERROR_MESSAGES = Object.freeze({
    INVALID_CLIENT:
        'A configuração de sessão exige um cliente MongoDB válido.',

    INVALID_MAX_AGE:
        'A duração da sessão deve ser um número inteiro entre uma hora e sete dias.',

    INVALID_STORE_FACTORY:
        'A configuração de sessão exige uma fábrica de armazenamento válida.',

    INVALID_STORE:
        'A configuração de sessão exige um armazenamento persistente válido.',

    INVALID_SECRET:
        'O segredo da sessão deve possuir pelo menos 32 bytes.',

    INVALID_PRODUCTION_FLAG:
        'A indicação de ambiente de produção deve ser booleana.',

    INVALID_SESSION_FACTORY:
        'A configuração de sessão exige uma fábrica de middleware válida.',

    INVALID_MIDDLEWARE:
        'A fábrica de sessão não retornou um middleware válido.'
});

/**
 * Fábrica padrão do armazenamento MongoDB.
 *
 * A função intermediária preserva corretamente o contexto do método estático
 * e facilita a substituição por uma implementação simulada nos testes.
 *
 * @param {object} options Opções do connect-mongo.
 * @returns {object} Armazenamento de sessões.
 */
function defaultMongoStoreFactory(options) {
    return MongoStore.create(options);
}

/**
 * Verifica a duração máxima da sessão.
 *
 * @param {number} maxAgeMs Duração em milissegundos.
 * @throws {RangeError} Quando a duração estiver fora dos limites.
 */
function validateMaxAge(maxAgeMs) {
    if (
        !Number.isSafeInteger(maxAgeMs)
        || maxAgeMs < MIN_SESSION_MAX_AGE_MS
        || maxAgeMs > MAX_SESSION_MAX_AGE_MS
    ) {
        throw new RangeError(
            SESSION_ERROR_MESSAGES.INVALID_MAX_AGE
        );
    }
}

/**
 * Verifica a interface mínima de um armazenamento do express-session.
 *
 * Não aceitamos armazenamento ausente. Dessa forma, a aplicação nunca volta
 * silenciosamente ao MemoryStore, que não é adequado para produção.
 *
 * @param {object} store Armazenamento que será validado.
 * @throws {TypeError} Quando a interface estiver incompleta.
 */
function validateSessionStore(store) {
    const requiredMethods = [
        'on',
        'get',
        'set',
        'destroy'
    ];

    const isValid = Boolean(store)
        && typeof store === 'object'
        && requiredMethods.every(
            (methodName) =>
                typeof store[methodName] === 'function'
        );

    if (!isValid) {
        throw new TypeError(
            SESSION_ERROR_MESSAGES.INVALID_STORE
        );
    }
}

/**
 * Cria o armazenamento persistente das sessões.
 *
 * O MongoClient recebido é o mesmo utilizado pelo Mongoose. Assim, modelos e
 * sessões compartilham o pool já administrado por DatabaseConnection.
 *
 * @param {object} options Configuração do armazenamento.
 * @param {import('mongodb').MongoClient} options.nativeClient
 * Cliente nativo já conectado.
 * @param {number} options.maxAgeMs Duração máxima da sessão.
 * @param {Function} [options.storeFactory=defaultMongoStoreFactory]
 * Fábrica substituível para testes.
 *
 * @returns {object} Armazenamento compatível com express-session.
 */
function createMongoSessionStore({
    nativeClient,
    maxAgeMs,
    storeFactory = defaultMongoStoreFactory
} = {}) {
    if (
        !nativeClient
        || typeof nativeClient !== 'object'
        || typeof nativeClient.db !== 'function'
    ) {
        throw new TypeError(
            SESSION_ERROR_MESSAGES.INVALID_CLIENT
        );
    }

    validateMaxAge(maxAgeMs);

    if (typeof storeFactory !== 'function') {
        throw new TypeError(
            SESSION_ERROR_MESSAGES.INVALID_STORE_FACTORY
        );
    }

    /**
     * connect-mongo utiliza segundos em sua configuração de TTL.
     *
     * Math.ceil garante que uma eventual fração de segundo nunca faça a
     * sessão expirar antes do cookie correspondente.
     */
    const ttlSeconds = Math.ceil(maxAgeMs / 1000);

    const store = storeFactory({
        client: nativeClient,
        collectionName: SESSION_COLLECTION_NAME,
        ttl: ttlSeconds,
        autoRemove: 'native',
        touchAfter: SESSION_TOUCH_AFTER_SECONDS,
        stringify: true,
        timestamps: true
    });

    validateSessionStore(store);

    return store;
}

/**
 * Cria o middleware de sessões HTTP.
 *
 * O navegador recebe apenas um identificador assinado. Os dados da sessão
 * permanecem no armazenamento MongoDB.
 *
 * @param {object} options Configuração do middleware.
 * @param {object} options.store Armazenamento persistente.
 * @param {string} options.secret Segredo usado para assinar o cookie.
 * @param {number} options.maxAgeMs Duração máxima da sessão.
 * @param {boolean} options.isProduction Indica uso de HTTPS em produção.
 * @param {Function} [options.sessionFactory=session]
 * Fábrica do express-session, substituível nos testes.
 *
 * @returns {Function} Middleware Express configurado.
 */
function createSessionMiddleware({
    store,
    secret,
    maxAgeMs,
    isProduction,
    sessionFactory = session
} = {}) {
    /**
     * O tamanho é medido em bytes porque caracteres Unicode podem utilizar
     * mais de um byte.
     *
     * trim() é utilizado apenas para detectar um valor formado totalmente
     * por espaços. O segredo original não é alterado nem normalizado.
     */
    if (
        typeof secret !== 'string'
        || secret.trim().length === 0
        || Buffer.byteLength(secret, 'utf8') < 32
    ) {
        throw new TypeError(
            SESSION_ERROR_MESSAGES.INVALID_SECRET
        );
    }

    validateMaxAge(maxAgeMs);

    if (typeof isProduction !== 'boolean') {
        throw new TypeError(
            SESSION_ERROR_MESSAGES.INVALID_PRODUCTION_FLAG
        );
    }

    validateSessionStore(store);

    if (typeof sessionFactory !== 'function') {
        throw new TypeError(
            SESSION_ERROR_MESSAGES.INVALID_SESSION_FACTORY
        );
    }

    const cookieName = isProduction
        ? SESSION_COOKIE_NAMES.PRODUCTION
        : SESSION_COOKIE_NAMES.DEVELOPMENT;

    const middleware = sessionFactory({
        name: cookieName,
        secret,
        store,

        /**
         * Uma sessão não modificada não precisa ser regravada.
         */
        resave: false,

        /**
         * Visitantes anônimos não geram documentos no banco.
         */
        saveUninitialized: false,

        /**
         * A sessão não é prolongada indefinidamente a cada resposta.
         */
        rolling: false,

        /**
         * Quando req.session for removida, o armazenamento também deverá
         * destruir seu registro.
         */
        unset: 'destroy',

        cookie: {
            httpOnly: true,
            secure: isProduction,
            sameSite: 'lax',
            path: '/',
            maxAge: maxAgeMs,
            priority: 'high'
        }
    });

    if (typeof middleware !== 'function') {
        throw new TypeError(
            SESSION_ERROR_MESSAGES.INVALID_MIDDLEWARE
        );
    }

    return middleware;
}

module.exports = {
    MAX_SESSION_MAX_AGE_MS,
    MIN_SESSION_MAX_AGE_MS,
    SESSION_COLLECTION_NAME,
    SESSION_COOKIE_NAMES,
    SESSION_ERROR_MESSAGES,
    SESSION_TOUCH_AFTER_SECONDS,
    createMongoSessionStore,
    createSessionMiddleware
};