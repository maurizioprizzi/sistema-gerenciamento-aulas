'use strict';

const {
    USER_ROLES,
    User,
    normalizeEmail,
} = require('../models/User');

const {
    passwordHasher,
} = require('./PasswordHasher');

/**
 * Mensagens estáveis utilizadas pelo serviço.
 *
 * Nenhuma delas inclui nome, e-mail, senha ou hash.
 */
const ADMIN_BOOTSTRAP_ERRORS = Object.freeze({
    INVALID_USER_MODEL:
        'Um modelo de usuário válido é necessário para criar o administrador.',
    INVALID_PASSWORD_HASHER:
        'Um serviço de proteção de senhas válido é necessário para criar o administrador.',
    INVALID_LOGGER:
        'Um logger válido é necessário para inicializar o administrador.',
    INVALID_CONFIGURATION:
        'Os dados iniciais do administrador são inválidos.',
});

/**
 * Resultados possíveis da inicialização.
 */
const ADMIN_BOOTSTRAP_STATUS = Object.freeze({
    CREATED: 'created',
    ALREADY_EXISTS: 'already_exists',
});

/**
 * Garante a existência da primeira conta administrativa da aplicação.
 *
 * O termo bootstrap representa uma operação de preparação executada durante
 * a inicialização do sistema.
 *
 * Esta classe não substitui dados de uma conta existente. As variáveis
 * ADMIN_NAME, ADMIN_EMAIL e ADMIN_PASSWORD são utilizadas somente quando
 * ainda não existe uma conta com o e-mail administrativo configurado.
 */
class AdminBootstrapper {
    /**
     * Modelo de usuário utilizado para consultar e criar a conta.
     *
     * @type {object}
     */
    #UserModel;

    /**
     * Serviço responsável por gerar o hash da senha.
     *
     * @type {object}
     */
    #passwordHasher;

    /**
     * Logger utilizado para registrar somente eventos não confidenciais.
     *
     * @type {object}
     */
    #logger;

    /**
     * @param {object} dependencies Dependências do serviço.
     * @param {object} dependencies.UserModel Modelo Mongoose de usuário.
     * @param {object} dependencies.passwordHasherService Serviço de hashing.
     * @param {object} dependencies.logger Logger da aplicação.
     */
    constructor({
        UserModel = User,
        passwordHasherService = passwordHasher,
        logger = console,
    } = {}) {
        AdminBootstrapper.validateUserModel(UserModel);
        AdminBootstrapper.validatePasswordHasher(
            passwordHasherService,
        );
        AdminBootstrapper.validateLogger(logger);

        this.#UserModel = UserModel;
        this.#passwordHasher = passwordHasherService;
        this.#logger = logger;
    }

    /**
     * Verifica as operações exigidas do modelo.
     *
     * @param {object} UserModel Modelo que será validado.
     * @throws {TypeError} Quando o modelo não oferece a interface esperada.
     */
    static validateUserModel(UserModel) {
        const isValid =
            UserModel &&
            typeof UserModel.findOne === 'function' &&
            typeof UserModel.create === 'function';

        if (!isValid) {
            throw new TypeError(
                ADMIN_BOOTSTRAP_ERRORS.INVALID_USER_MODEL,
            );
        }
    }

    /**
     * Verifica a operação exigida do serviço de hashing.
     *
     * @param {object} passwordHasherService Serviço que será validado.
     * @throws {TypeError} Quando o serviço não oferece hash().
     */
    static validatePasswordHasher(passwordHasherService) {
        const isValid =
            passwordHasherService &&
            typeof passwordHasherService.hash === 'function';

        if (!isValid) {
            throw new TypeError(
                ADMIN_BOOTSTRAP_ERRORS.INVALID_PASSWORD_HASHER,
            );
        }
    }

    /**
     * Verifica as operações de log utilizadas pelo serviço.
     *
     * @param {object} logger Logger que será validado.
     * @throws {TypeError} Quando o logger é incompatível.
     */
    static validateLogger(logger) {
        const isValid =
            logger &&
            typeof logger.info === 'function';

        if (!isValid) {
            throw new TypeError(
                ADMIN_BOOTSTRAP_ERRORS.INVALID_LOGGER,
            );
        }
    }

    /**
     * Valida os dados mínimos recebidos da configuração.
     *
     * As validações completas continuam nas fronteiras especializadas:
     *
     * - env.js valida as variáveis de ambiente;
     * - PasswordHasher valida os limites técnicos da senha;
     * - User valida os dados persistidos.
     *
     * @param {unknown} configuration Configuração recebida.
     * @throws {TypeError} Quando faltam dados obrigatórios.
     */
    static validateConfiguration(configuration) {
        const isObject =
            configuration !== null &&
            typeof configuration === 'object' &&
            !Array.isArray(configuration);

        if (!isObject) {
            throw new TypeError(
                ADMIN_BOOTSTRAP_ERRORS.INVALID_CONFIGURATION,
            );
        }

        const {
            name,
            email,
            password,
        } = configuration;

        const hasValidName =
            typeof name === 'string' &&
            name.trim().length > 0;

        const hasValidEmail =
            typeof email === 'string' &&
            email.trim().length > 0;

        /**
         * A senha não utiliza trim. Uma senha formada por espaços ainda será
         * analisada pelas regras das camadas responsáveis.
         */
        const hasValidPassword =
            typeof password === 'string' &&
            password.length > 0;

        if (
            !hasValidName ||
            !hasValidEmail ||
            !hasValidPassword
        ) {
            throw new TypeError(
                ADMIN_BOOTSTRAP_ERRORS.INVALID_CONFIGURATION,
            );
        }
    }

    /**
     * Identifica um conflito de unicidade especificamente no campo e-mail.
     *
     * Essa situação pode acontecer quando duas instâncias da aplicação são
     * iniciadas simultaneamente. Ambas podem consultar antes que uma delas
     * termine a criação, mas o índice único do MongoDB permitirá somente uma.
     *
     * @param {unknown} error Erro retornado pelo banco.
     * @returns {boolean} Verdadeiro somente para e-mail duplicado.
     */
    static isDuplicateEmailError(error) {
        if (!error || error.code !== 11000) {
            return false;
        }

        const hasEmailKeyPattern =
            error.keyPattern?.email === 1;

        const hasEmailKeyValue =
            error.keyValue &&
            Object.hasOwn(error.keyValue, 'email');

        return Boolean(
            hasEmailKeyPattern ||
            hasEmailKeyValue,
        );
    }

    /**
     * Retorna um resultado imutável sem expor o documento do usuário.
     *
     * O documento recém-criado contém o hash em memória, mesmo que sua
     * serialização seja protegida. Como a inicialização precisa apenas saber
     * o resultado da operação, o usuário não é devolvido ao chamador.
     *
     * @param {string} status Estado final da inicialização.
     * @returns {Readonly<{ status: string, created: boolean }>}
     */
    static createResult(status) {
        return Object.freeze({
            status,
            created:
                status === ADMIN_BOOTSTRAP_STATUS.CREATED,
        });
    }

    /**
     * Garante que a conta administrativa exista.
     *
     * Fluxo:
     *
     * 1. normaliza o e-mail;
     * 2. consulta uma conta existente;
     * 3. gera o hash somente quando necessário;
     * 4. cria a conta administrativa;
     * 5. trata uma possível corrida de unicidade.
     *
     * @param {object} configuration Dados administrativos validados.
     * @param {string} configuration.name Nome do administrador.
     * @param {string} configuration.email E-mail do administrador.
     * @param {string} configuration.password Senha original.
     * @returns {Promise<Readonly<{ status: string, created: boolean }>>}
     */
    async ensureAdmin(configuration) {
        AdminBootstrapper.validateConfiguration(configuration);

        const {
            name,
            email,
            password,
        } = configuration;

        const normalizedEmail = normalizeEmail(email);

        const existingUser = await this.#UserModel.findOne({
            email: normalizedEmail,
        });

        if (existingUser) {
            this.#logger.info(
                'A conta administrativa inicial já existe.',
            );

            return AdminBootstrapper.createResult(
                ADMIN_BOOTSTRAP_STATUS.ALREADY_EXISTS,
            );
        }

        const passwordHash =
            await this.#passwordHasher.hash(password);

        try {
            await this.#UserModel.create({
                name,
                email: normalizedEmail,
                passwordHash,
                role: USER_ROLES.ADMIN,
                active: true,
            });
        } catch (error) {
            /**
             * Em uma inicialização concorrente, outra instância pode ter
             * criado a mesma conta depois da primeira consulta.
             */
            if (AdminBootstrapper.isDuplicateEmailError(error)) {
                const concurrentlyCreatedUser =
                    await this.#UserModel.findOne({
                        email: normalizedEmail,
                    });

                if (concurrentlyCreatedUser) {
                    this.#logger.info(
                        'A conta administrativa inicial já existe.',
                    );

                    return AdminBootstrapper.createResult(
                        ADMIN_BOOTSTRAP_STATUS.ALREADY_EXISTS,
                    );
                }
            }

            throw error;
        }

        this.#logger.info(
            'Conta administrativa inicial criada com segurança.',
        );

        return AdminBootstrapper.createResult(
            ADMIN_BOOTSTRAP_STATUS.CREATED,
        );
    }
}

module.exports = {
    ADMIN_BOOTSTRAP_ERRORS,
    ADMIN_BOOTSTRAP_STATUS,
    AdminBootstrapper,
};