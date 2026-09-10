'use strict';

const { AppError } = require('../errors/AppError');
const {
    EMAIL_PATTERN,
    User,
    normalizeEmail,
} = require('../models/User');
const {
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
const MAX_PASSWORD_BYTES = 72;

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
 * 6. retornar somente a identidade pública necessária para a sessão.
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
     * @param {object} dependencies Dependências do serviço.
     * @param {object} dependencies.UserModel Modelo Mongoose de usuário.
     * @param {object} dependencies.passwordHasherService Comparador de senhas.
     * @param {string} dependencies.dummyPasswordHash Hash substituto.
     */
    constructor({
        UserModel = User,
        passwordHasherService = passwordHasher,
        dummyPasswordHash = DEFAULT_DUMMY_PASSWORD_HASH,
    } = {}) {
        AuthenticationService.validateUserModel(UserModel);
        AuthenticationService.validatePasswordHasher(
            passwordHasherService,
        );
        AuthenticationService.validateDummyPasswordHash(
            dummyPasswordHash,
        );

        this.#UserModel = UserModel;
        this.#passwordHasher = passwordHasherService;
        this.#dummyPasswordHash = dummyPasswordHash;
    }

    /**
     * Verifica as operações exigidas do modelo.
     *
     * @param {object} UserModel Modelo que será validado.
     * @throws {TypeError} Quando o modelo não oferece findOne().
     */
    static validateUserModel(UserModel) {
        const isValid =
            UserModel &&
            typeof UserModel.findOne === 'function';

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
     * 6. retorna somente a identidade pública.
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

        return AuthenticationService.createIdentity(user);
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