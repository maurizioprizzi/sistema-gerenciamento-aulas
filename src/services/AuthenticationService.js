'use strict';

const { AppError } = require('../errors/AppError');
const {
    EMAIL_PATTERN,
    User,
    normalizeEmail,
} = require('../models/User');
const {
    BCRYPT_MAX_PASSWORD_BYTES,
    passwordHasher,
} = require('./PasswordHasher');

/**
 * Códigos estáveis produzidos pela autenticação.
 *
 * O futuro controlador HTTP poderá reagir a esses códigos sem depender do
 * texto da mensagem.
 */
const AUTHENTICATION_CODES = Object.freeze({
    INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
});

/**
 * Mensagens utilizadas pelo serviço.
 *
 * A mensagem pública de credenciais é propositalmente genérica. Ela não
 * informa se:
 *
 * - o e-mail não existe;
 * - a senha está incorreta;
 * - a conta está desativada.
 *
 * Isso reduz a possibilidade de descobrir quais contas estão cadastradas.
 */
const AUTHENTICATION_MESSAGES = Object.freeze({
    INVALID_CREDENTIALS: 'E-mail ou senha inválidos.',
    INVALID_USER_MODEL:
        'Um modelo de usuário válido é necessário para autenticar.',
    INVALID_PASSWORD_HASHER:
        'Um serviço de comparação de senhas válido é necessário para autenticar.',
    INVALID_DUMMY_HASH:
        'Um hash substituto válido é necessário para autenticar.',
    INVALID_CLOCK:
        'Um relógio válido é necessário para registrar o último acesso.',
    INVALID_TIMESTAMP:
        'O relógio retornou um instante inválido para o último acesso.',
    INVALID_UPDATE_RESULT:
        'O modelo retornou um resultado inválido ao registrar o último acesso.',
    INVALID_USER_DOCUMENT:
        'O usuário autenticado não possui uma identidade válida.',
});

/**
 * Hash utilizado quando o e-mail consultado não existe.
 *
 * Ele foi produzido com bcrypt e custo 12 a partir de um texto que não é uma
 * credencial real.
 *
 * Mesmo quando não existe usuário, o serviço executa uma comparação bcrypt.
 * Isso reduz a diferença de tempo entre:
 *
 * - e-mail inexistente;
 * - e-mail existente com senha incorreta.
 *
 * O hash substituto não é confidencial e nunca permite autenticação.
 */
const DEFAULT_DUMMY_PASSWORD_HASH =
    '$2b$12$P7x42gin/EEPksihPyIIeOLmf/QzCDltzLyyFmwn7ga662jLoWELi';

/**
 * Limites que protegem a fronteira de autenticação.
 */
const MAX_EMAIL_LENGTH = 254;
const MAX_PASSWORD_BYTES = BCRYPT_MAX_PASSWORD_BYTES;

/**
 * Autentica uma conta administrativa sem conhecer HTTP ou sessões.
 *
 * O serviço recebe o modelo e o comparador de senhas por injeção. Assim, seus
 * testes não precisam acessar MongoDB nem executar bcrypt real.
 *
 * Responsabilidades:
 *
 * 1. validar o formato mínimo das credenciais;
 * 2. normalizar o e-mail;
 * 3. solicitar explicitamente o hash protegido;
 * 4. comparar a senha;
 * 5. recusar contas inexistentes ou inativas;
 * 6. registrar controladamente o instante do último acesso;
 * 7. retornar somente a identidade pública necessária para a sessão.
 */
class AuthenticationService {
    /**
     * Modelo utilizado para consultar usuários.
     *
     * @type {object}
     */
    #UserModel;

    /**
     * Serviço utilizado para comparar senhas.
     *
     * @type {object}
     */
    #passwordHasher;

    /**
     * Hash utilizado em comparações substitutas.
     *
     * @type {string}
     */
    #dummyPasswordHash;

    /**
     * Fonte de tempo substituível para testes determinísticos.
     *
     * @type {Function}
     */
    #clock;

    /**
     * @param {object} dependencies Dependências do serviço.
     * @param {object} dependencies.UserModel Modelo Mongoose de usuário.
     * @param {object} dependencies.passwordHasherService Comparador de senhas.
     * @param {string} dependencies.dummyPasswordHash Hash substituto.
     * @param {Function} dependencies.clock Fonte do horário atual.
     */
    constructor({
        UserModel = User,
        passwordHasherService = passwordHasher,
        dummyPasswordHash = DEFAULT_DUMMY_PASSWORD_HASH,
        clock = () => new Date(),
    } = {}) {
        AuthenticationService.validateUserModel(UserModel);
        AuthenticationService.validatePasswordHasher(
            passwordHasherService,
        );
        AuthenticationService.validateDummyPasswordHash(
            dummyPasswordHash,
        );
        AuthenticationService.validateClock(clock);

        this.#UserModel = UserModel;
        this.#passwordHasher = passwordHasherService;
        this.#dummyPasswordHash = dummyPasswordHash;
        this.#clock = clock;
    }

    /**
     * Verifica as operações exigidas do modelo.
     *
     * @param {object} UserModel Modelo que será validado.
     * @throws {TypeError} Quando o modelo não oferece as operações exigidas.
     */
    static validateUserModel(UserModel) {
        const isValid =
            UserModel &&
            typeof UserModel.findOne === 'function' &&
            typeof UserModel.updateOne === 'function';

        if (!isValid) {
            throw new TypeError(
                AUTHENTICATION_MESSAGES.INVALID_USER_MODEL,
            );
        }
    }

    /**
     * Verifica a operação exigida do serviço de senhas.
     *
     * @param {object} passwordHasherService Serviço que será validado.
     * @throws {TypeError} Quando o serviço não oferece compare().
     */
    static validatePasswordHasher(passwordHasherService) {
        const isValid =
            passwordHasherService &&
            typeof passwordHasherService.compare === 'function';

        if (!isValid) {
            throw new TypeError(
                AUTHENTICATION_MESSAGES.INVALID_PASSWORD_HASHER,
            );
        }
    }

    /**
     * Valida o hash utilizado nas comparações substitutas.
     *
     * Não tentamos interpretar toda a estrutura do bcrypt neste ponto. O
     * formato definitivo continuará sob responsabilidade da biblioteca.
     *
     * @param {unknown} dummyPasswordHash Hash que será validado.
     * @throws {TypeError} Quando o hash não é um texto não vazio.
     */
    static validateDummyPasswordHash(dummyPasswordHash) {
        const isValid =
            typeof dummyPasswordHash === 'string' &&
            dummyPasswordHash.length > 0;

        if (!isValid) {
            throw new TypeError(
                AUTHENTICATION_MESSAGES.INVALID_DUMMY_HASH,
            );
        }
    }

    /**
     * Verifica a fonte de tempo utilizada pelo serviço.
     *
     * @param {unknown} clock Função recebida.
     * @throws {TypeError} Quando o relógio não é uma função.
     */
    static validateClock(clock) {
        if (typeof clock !== 'function') {
            throw new TypeError(
                AUTHENTICATION_MESSAGES.INVALID_CLOCK,
            );
        }
    }

    /**
     * Cria uma cópia segura do instante fornecido pelo relógio.
     *
     * @param {unknown} value Valor produzido pela fonte de tempo.
     * @returns {Date} Data válida que poderá ser persistida.
     * @throws {TypeError} Quando o valor não representa uma data válida.
     */
    static createLoginTimestamp(value) {
        const isValidDate =
            value instanceof Date
            && !Number.isNaN(value.getTime());

        if (!isValidDate) {
            throw new TypeError(
                AUTHENTICATION_MESSAGES.INVALID_TIMESTAMP,
            );
        }

        return new Date(value.getTime());
    }

    /**
     * Verifica a confirmação devolvida pela atualização do MongoDB.
     *
     * @param {unknown} updateResult Resultado de updateOne().
     * @throws {TypeError} Quando o formato retornado é inesperado.
     */
    static validateUpdateResult(updateResult) {
        const isValid =
            updateResult
            && updateResult.acknowledged === true
            && Number.isInteger(updateResult.matchedCount)
            && updateResult.matchedCount >= 0;

        if (!isValid) {
            throw new TypeError(
                AUTHENTICATION_MESSAGES.INVALID_UPDATE_RESULT,
            );
        }
    }

    /**
     * Cria o erro público utilizado para qualquer credencial recusada.
     *
     * Uma nova instância é criada em cada chamada para preservar uma pilha de
     * execução coerente com a tentativa atual.
     *
     * @returns {AppError} Erro operacional seguro.
     */
    static createInvalidCredentialsError() {
        return new AppError(
            AUTHENTICATION_MESSAGES.INVALID_CREDENTIALS,
            {
                statusCode: 401,
                code:
                    AUTHENTICATION_CODES.INVALID_CREDENTIALS,
            },
        );
    }

    /**
     * Valida e normaliza as credenciais recebidas.
     *
     * A senha não recebe trim nem normalização. Espaços e caracteres Unicode
     * podem fazer parte de uma credencial legítima.
     *
     * Entradas inválidas recebem o mesmo erro utilizado para uma senha
     * incorreta. Dessa forma, detalhes das regras internas não são expostos
     * pela futura rota de login.
     *
     * @param {unknown} credentials Credenciais recebidas.
     * @returns {Readonly<{ email: string, password: string }>}
     * Credenciais preparadas para autenticação.
     * @throws {AppError} Quando a entrada não pode ser autenticada.
     */
    static prepareCredentials(credentials) {
        const isObject =
            credentials !== null &&
            typeof credentials === 'object' &&
            !Array.isArray(credentials);

        if (!isObject) {
            throw AuthenticationService
                .createInvalidCredentialsError();
        }

        const {
            email,
            password,
        } = credentials;

        const normalizedEmail = normalizeEmail(email);

        const hasValidEmail =
            typeof normalizedEmail === 'string' &&
            normalizedEmail.length > 0 &&
            normalizedEmail.length <= MAX_EMAIL_LENGTH &&
            EMAIL_PATTERN.test(normalizedEmail);

        const hasValidPassword =
            typeof password === 'string' &&
            password.length > 0 &&
            Buffer.byteLength(password, 'utf8') <=
                MAX_PASSWORD_BYTES;

        if (!hasValidEmail || !hasValidPassword) {
            throw AuthenticationService
                .createInvalidCredentialsError();
        }

        return Object.freeze({
            email: normalizedEmail,
            password,
        });
    }

    /**
     * Cria a identidade pública que poderá ser armazenada na sessão.
     *
     * O documento Mongoose não é retornado. Isso impede que o hash solicitado
     * para o login atravesse acidentalmente a fronteira do serviço.
     *
     * @param {object} user Documento autenticado.
     * @returns {Readonly<{
     * id: string,
     * name: string,
     * email: string,
     * role: string
     * }>} Identidade mínima e imutável.
     */
    static createIdentity(user) {
        const hasValidIdentity =
            user &&
            user._id !== undefined &&
            user._id !== null &&
            typeof user.name === 'string' &&
            typeof user.email === 'string' &&
            typeof user.role === 'string';

        if (!hasValidIdentity) {
            throw new TypeError(
                AUTHENTICATION_MESSAGES.INVALID_USER_DOCUMENT,
            );
        }

        return Object.freeze({
            id: String(user._id),
            name: user.name,
            email: user.email,
            role: user.role,
        });
    }

    /**
     * Autentica um usuário por e-mail e senha.
     *
     * Fluxo:
     *
     * 1. valida e normaliza as credenciais;
     * 2. consulta o usuário;
     * 3. inclui explicitamente passwordHash na consulta;
     * 4. executa uma comparação real ou substituta;
     * 5. verifica senha e estado da conta;
     * 6. valida a identidade autenticada;
     * 7. registra o horário do último acesso;
     * 8. retorna somente a identidade pública.
     *
     * Falhas reais do banco ou do bcrypt não são convertidas em credenciais
     * inválidas. Elas continuam sendo propagadas para o tratamento central,
     * pois representam indisponibilidade ou erro interno.
     *
     * @param {object} credentials Credenciais recebidas.
     * @param {string} credentials.email E-mail administrativo.
     * @param {string} credentials.password Senha original.
     * @returns {Promise<Readonly<object>>} Identidade autenticada.
     * @throws {AppError} Quando as credenciais são recusadas.
     */
    async authenticate(credentials) {
        const {
            email,
            password,
        } = AuthenticationService.prepareCredentials(
            credentials,
        );

        /**
         * passwordHash usa select: false no schema. O prefixo + solicita esse
         * único campo protegido sem alterar a segurança das demais consultas.
         */
        const query = this.#UserModel
            .findOne({ email })
            .select('+passwordHash');

        const user = await query;

        /**
         * Quando não existe usuário, ainda executamos uma comparação bcrypt
         * utilizando o hash substituto.
         */

        const passwordHash = user
            ? user.passwordHash
            : this.#dummyPasswordHash;

        const passwordMatches =
            await this.#passwordHasher.compare(
                password,
                passwordHash,
            );

        const canAuthenticate =
            user &&
            user.active === true &&
            passwordMatches;

        if (!canAuthenticate) {
            throw AuthenticationService
                .createInvalidCredentialsError();
        }

        /**
         * A identidade é validada antes de qualquer escrita. Um documento
         * inconsistente não pode alterar o banco nem estabelecer sessão.
         */
        const identity =
            AuthenticationService.createIdentity(user);

        const lastLoginAt =
            AuthenticationService.createLoginTimestamp(
                this.#clock(),
            );

        /**
         * O filtro confirma que a conta continua ativa no momento da
         * atualização. Isso cobre uma desativação ocorrida entre a consulta
         * inicial e a conclusão da comparação bcrypt.
         */
        const updateResult = await this.#UserModel.updateOne(
            {
                _id: user._id,
                active: true,
            },
            {
                $set: {
                    lastLoginAt,
                },
            },
            {
                runValidators: true,
            },
        );

        AuthenticationService.validateUpdateResult(
            updateResult,
        );

        if (updateResult.matchedCount !== 1) {
            throw AuthenticationService
                .createInvalidCredentialsError();
        }

        return identity;
    }
}

/**
 * Instância padrão utilizada pela aplicação real.
 *
 * A classe permanece exportada para permitir dependências controladas nos
 * testes e composição explícita no servidor.
 */
const authenticationService = new AuthenticationService();

module.exports = {
    AUTHENTICATION_CODES,
    AUTHENTICATION_MESSAGES,
    DEFAULT_DUMMY_PASSWORD_HASH,
    MAX_EMAIL_LENGTH,
    MAX_PASSWORD_BYTES,
    AuthenticationService,
    authenticationService,
};
