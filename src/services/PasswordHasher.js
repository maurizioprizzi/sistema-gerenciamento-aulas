'use strict';

const bcrypt = require('bcryptjs');

/**
 * Custo padrão utilizado pelo bcrypt.
 *
 * O custo 12 oferece uma proteção adequada para uma aplicação administrativa
 * pequena. A inicialização pode substituí-lo por PASSWORD_HASH_ROUNDS.
 */
const DEFAULT_PASSWORD_HASH_ROUNDS = 12;

/**
 * Limites operacionais aceitos pela aplicação.
 *
 * Custos muito baixos reduzem a resistência contra tentativas de descoberta
 * da senha. Custos excessivamente altos podem consumir recursos demais do
 * servidor e facilitar negação de serviço.
 */
const MIN_PASSWORD_HASH_ROUNDS = 10;
const MAX_PASSWORD_HASH_ROUNDS = 15;

/**
 * Limite técnico do algoritmo bcrypt em bytes UTF-8.
 *
 * O bcrypt considera exclusivamente os primeiros 72 bytes. Caracteres Unicode
 * podem ocupar múltiplos bytes, portanto a validação deve medir o tamanho do
 * buffer em UTF-8 e não a contagem de caracteres da string.
 */
const BCRYPT_MAX_PASSWORD_BYTES = 72;

/**
 * Mensagens públicas e estáveis utilizadas nas validações.
 *
 * Nenhuma mensagem inclui a senha recebida.
 */
const PASSWORD_ERRORS = Object.freeze({
    INVALID_PASSWORD: 'A senha deve ser um texto não vazio.',
    PASSWORD_TOO_LONG:
        'A senha excede o limite seguro de 72 bytes suportado pelo bcrypt.',
    INVALID_HASH: 'O hash da senha deve ser um texto não vazio.',
    INVALID_ROUNDS:
        'O custo do hash deve ser um número inteiro entre 10 e 15.',
    INVALID_CLIENT:
        'Um cliente bcrypt válido é necessário para proteger as senhas.',
});

/**
 * Serviço responsável exclusivamente pela proteção e comparação de senhas.
 *
 * A classe recebe o cliente bcrypt por injeção de dependência. Nos testes,
 * poderemos utilizar uma implementação controlada sem executar cálculos
 * criptográficos demorados.
 */
class PasswordHasher {
    /**
     * Cliente criptográfico protegido contra alterações externas.
     *
     * @type {object}
     */
    #bcryptClient;

    /**
     * Custo do hash protegido contra alterações depois da construção.
     *
     * @type {number}
     */
    #rounds;

    /**
     * @param {object} options Configurações do serviço.
     * @param {object} options.bcryptClient Implementação compatível com bcrypt.
     * @param {number} options.rounds Custo computacional aplicado ao hash.
     */
    constructor({
        bcryptClient = bcrypt,
        rounds = DEFAULT_PASSWORD_HASH_ROUNDS,
    } = {}) {
        PasswordHasher.validateBcryptClient(bcryptClient);
        PasswordHasher.validateRounds(rounds);

        this.#bcryptClient = bcryptClient;
        this.#rounds = rounds;
    }

    /**
     * Permite consultar o custo configurado sem permitir sua alteração.
     *
     * @returns {number} Custo utilizado nos novos hashes.
     */
    get rounds() {
        return this.#rounds;
    }

    /**
     * Verifica se o cliente recebido oferece todas as operações necessárias.
     *
     * @param {object} bcryptClient Cliente que será validado.
     * @throws {TypeError} Quando o cliente não é compatível.
     */
    static validateBcryptClient(bcryptClient) {
        const isValid =
            bcryptClient &&
            typeof bcryptClient.hash === 'function' &&
            typeof bcryptClient.compare === 'function';

        if (!isValid) {
            throw new TypeError(PASSWORD_ERRORS.INVALID_CLIENT);
        }
    }

    /**
     * Impede custos inseguros ou perigosamente altos.
     *
     * @param {number} rounds Custo que será validado.
     * @throws {RangeError} Quando o custo está fora do intervalo permitido.
     */
    static validateRounds(rounds) {
        const isValid =
            Number.isInteger(rounds) &&
            rounds >= MIN_PASSWORD_HASH_ROUNDS &&
            rounds <= MAX_PASSWORD_HASH_ROUNDS;

        if (!isValid) {
            throw new RangeError(PASSWORD_ERRORS.INVALID_ROUNDS);
        }
    }

    /**
     * Valida uma senha antes de enviá-la ao bcrypt.
     *
     * A senha não é alterada, aparada ou normalizada. Espaços e caracteres
     * Unicode podem fazer parte de uma senha válida.
     *
     * O bcrypt considera somente os primeiros 72 bytes. Rejeitar entradas que
     * ultrapassam esse limite evita que duas senhas diferentes produzam o
     * mesmo resultado por truncamento silencioso.
     *
     * @param {unknown} password Senha original recebida.
     * @throws {TypeError|RangeError} Quando a senha não pode ser processada.
     */
    validatePassword(password) {
        if (typeof password !== 'string' || password.length === 0) {
            throw new TypeError(PASSWORD_ERRORS.INVALID_PASSWORD);
        }

        const passwordBytes = Buffer.byteLength(
            password,
            'utf8',
        );

        if (passwordBytes > BCRYPT_MAX_PASSWORD_BYTES) {
            throw new RangeError(
                PASSWORD_ERRORS.PASSWORD_TOO_LONG,
            );
        }
    }

    /**
     * Valida um hash antes de realizar uma comparação.
     *
     * A validação detalhada do formato permanece sob responsabilidade do
     * bcrypt. Aqui impedimos apenas valores ausentes ou de tipo incorreto.
     *
     * @param {unknown} passwordHash Hash armazenado.
     * @throws {TypeError} Quando o hash não é um texto válido.
     */
    validateHash(passwordHash) {
        if (
            typeof passwordHash !== 'string' ||
            passwordHash.length === 0
        ) {
            throw new TypeError(PASSWORD_ERRORS.INVALID_HASH);
        }
    }

    /**
     * Transforma uma senha original em um hash bcrypt.
     *
     * A versão assíncrona é utilizada para que o bcrypt possa devolver
     * periodicamente o controle ao event loop do Node.js.
     *
     * @param {string} password Senha original.
     * @returns {Promise<string>} Hash que poderá ser armazenado no banco.
     */
    async hash(password) {
        this.validatePassword(password);

        return this.#bcryptClient.hash(password, this.#rounds);
    }

    /**
     * Compara uma senha recebida com o hash armazenado.
     *
     * @param {string} password Senha original informada no login.
     * @param {string} passwordHash Hash recuperado de forma controlada.
     * @returns {Promise<boolean>} Verdadeiro somente quando correspondem.
     */
    async compare(password, passwordHash) {
        this.validatePassword(password);
        this.validateHash(passwordHash);

        return this.#bcryptClient.compare(password, passwordHash);
    }
}

/**
 * Instância padrão utilizada pela aplicação.
 *
 * Manter também a classe exportada permite injetar implementações controladas
 * nos testes e alterar a configuração durante a inicialização futura.
 */
const passwordHasher = new PasswordHasher();

module.exports = {
    BCRYPT_MAX_PASSWORD_BYTES,
    DEFAULT_PASSWORD_HASH_ROUNDS,
    MAX_PASSWORD_HASH_ROUNDS,
    MIN_PASSWORD_HASH_ROUNDS,
    PASSWORD_ERRORS,
    PasswordHasher,
    passwordHasher,
};
