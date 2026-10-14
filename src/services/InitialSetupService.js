'use strict';

const { createHash, timingSafeEqual } = require('node:crypto');
const { Types } = require('mongoose');
const { AppError } = require('../errors/AppError');
const {
    User,
    USER_ROLES,
    EMAIL_PATTERN,
    normalizeName,
    normalizeEmail,
} = require('../models/User');
const {
    InitialSetupState,
    INITIAL_SETUP_STATE_ID,
    INITIAL_SETUP_STATE_STATUS,
} = require('../models/InitialSetupState');
const {
    BCRYPT_MAX_PASSWORD_BYTES,
    passwordHasher,
} = require('./PasswordHasher');

const INITIAL_SETUP_CODES = Object.freeze({
    UNAVAILABLE: 'INITIAL_SETUP_UNAVAILABLE',
    INVALID_INVITATION: 'INITIAL_SETUP_INVALID_INVITATION',
    INVALID_DATA: 'INITIAL_SETUP_INVALID_DATA',
});

/**
 * As mensagens nunca repetem valores recebidos ou informações do banco.
 */
const INITIAL_SETUP_MESSAGES = Object.freeze({
    INVALID_MODEL:
        'O primeiro cadastro exige um modelo de usuário válido.',
    INVALID_STATE_MODEL:
        'O primeiro cadastro exige um modelo de estado persistente válido.',
    INVALID_COMPLETION_RESULT:
        'Não foi possível confirmar a conclusão do primeiro cadastro. O cadastro permanece bloqueado e requer verificação.',
    INVALID_HASHER:
        'O primeiro cadastro exige um serviço de proteção de senhas válido.',
    INVALID_TOKEN_CONFIGURATION:
        'O convite configurado deve conter 64 caracteres hexadecimais.',
    INVALID_HASH_RESULT:
        'O serviço de proteção de senhas retornou um hash inválido.',
    UNAVAILABLE:
        'O cadastro inicial não está disponível nesta instalação.',
    INVALID_INVITATION:
        'O convite de primeiro acesso é inválido.',
    INVALID_DATA:
        'Informe nome, e-mail e senha válidos para o cadastro inicial.',
    INVALID_NAME:
        'O nome deve possuir entre 2 e 120 caracteres.',
    INVALID_EMAIL:
        'Informe um e-mail válido com no máximo 254 caracteres.',
    INVALID_PASSWORD:
        'A senha deve possuir pelo menos 12 caracteres, não conter somente espaços e ter no máximo 72 bytes em UTF-8.',
});

const INVITATION_PATTERN = /^[a-fA-F0-9]{64}$/;

function setupError(message, code, statusCode) {
    return new AppError(message, { code, statusCode });
}

/**
 * Compara convites como bytes, permitindo maiúsculas ou minúsculas no hex.
 * Só guardamos o digest privado do convite na instância do serviço.
 */
function invitationDigest(token) {
    return createHash('sha256').update(Buffer.from(token, 'hex')).digest();
}

/**
 * Regra de primeiro cadastro, independente de HTTP e sessões.
 *
 * Pré-condição: o servidor deve aguardar a preparação dos índices de User.
 * A consulta prévia oferece uma recusa antecipada; o índice de administrador
 * único é a proteção final contra dois cadastros simultâneos.
 *
 * Um registro com id fixo é reservado antes da criação da conta. Qualquer
 * registro existente, reservado ou concluído, bloqueia novas tentativas,
 * inclusive após reiniciar o processo ou remover manualmente o usuário.
 *
 * Não há transação entre as duas coleções: o fluxo admite MongoDB local
 * standalone. Uma falha após a reserva mantém o bloqueio. A recuperação
 * controlada de tentativas interrompidas ainda deverá ser implementada antes
 * de disponibilizar o fluxo completo. Nunca removemos a reserva em um catch.
 * Este arquivo, isoladamente, não ativa nenhuma rota nem muda o bootstrap.
 */
class InitialSetupService {
    #UserModel;
    #SetupStateModel;
    #passwordHasher;
    #invitationDigest;

    /**
     * @param {object} options Dependências e configuração já validadas.
     * @param {object} [options.UserModel=User] Modelo de usuário.
     * @param {object} [options.SetupStateModel=InitialSetupState] Estado persistente.
     * @param {object} [options.passwordHasherService=passwordHasher] Hashing.
     * @param {string} [options.initialSetupToken] Convite da instalação.
     */
    constructor({
        UserModel = User,
        SetupStateModel = InitialSetupState,
        passwordHasherService = passwordHasher,
        initialSetupToken,
    } = {}) {
        if (
            !UserModel
            || typeof UserModel.findOne !== 'function'
            || typeof UserModel.create !== 'function'
        ) {
            throw new TypeError(INITIAL_SETUP_MESSAGES.INVALID_MODEL);
        }

        if (
            !SetupStateModel
            || typeof SetupStateModel.findOne !== 'function'
            || typeof SetupStateModel.create !== 'function'
            || typeof SetupStateModel.updateOne !== 'function'
        ) {
            throw new TypeError(INITIAL_SETUP_MESSAGES.INVALID_STATE_MODEL);
        }

        if (
            !passwordHasherService
            || typeof passwordHasherService.hash !== 'function'
        ) {
            throw new TypeError(INITIAL_SETUP_MESSAGES.INVALID_HASHER);
        }

        if (
            initialSetupToken !== undefined
            && (
                typeof initialSetupToken !== 'string'
                || !INVITATION_PATTERN.test(initialSetupToken)
            )
        ) {
            throw new TypeError(INITIAL_SETUP_MESSAGES.INVALID_TOKEN_CONFIGURATION);
        }

        this.#UserModel = UserModel;
        this.#SetupStateModel = SetupStateModel;
        this.#passwordHasher = passwordHasherService;
        this.#invitationDigest = initialSetupToken === undefined
            ? null : invitationDigest(initialSetupToken);
    }

    /**
     * Informa somente a disponibilidade, sem devolver o convite ou a conta.
     * A interface poderá orientar primeiro cadastro ou login com esse estado.
     *
     * @returns {Promise<Readonly<{ available: boolean }>>}
     */
    async getStatus() {
        if (!this.#invitationDigest) {
            return Object.freeze({ available: false });
        }

        const setupState = await this.#SetupStateModel.findOne({
            _id: INITIAL_SETUP_STATE_ID,
        });
        if (setupState) return Object.freeze({ available: false });

        const administrator = await this.#UserModel.findOne({
            role: USER_ROLES.ADMIN,
        });
        return Object.freeze({ available: !administrator });
    }

    /**
     * Valida os dados antes de gerar hash ou acessar a criação persistente.
     * Espaços e Unicode da senha são preservados; apenas o nome e o e-mail
     * são normalizados. Nenhum campo extra será enviado ao modelo.
     *
     * @param {object} input Entrada do futuro formulário.
     * @returns {{ name: string, email: string, password: string }} Dados seguros.
     */
    static validateAccountData(input) {
        if (!input || typeof input !== 'object' || Array.isArray(input)) {
            throw setupError(
                INITIAL_SETUP_MESSAGES.INVALID_DATA,
                INITIAL_SETUP_CODES.INVALID_DATA,
                400,
            );
        }

        const name = normalizeName(input.name);
        const email = normalizeEmail(input.email);
        const password = input.password;
        let message = null;

        if (typeof name !== 'string' || name.length < 2 || name.length > 120) {
            message = INITIAL_SETUP_MESSAGES.INVALID_NAME;
        } else if (
            typeof email !== 'string'
            || email.length > 254
            || !EMAIL_PATTERN.test(email)
        ) {
            message = INITIAL_SETUP_MESSAGES.INVALID_EMAIL;
        } else if (
            typeof password !== 'string'
            || password.length < 12
            || password.trim().length === 0
            || Buffer.byteLength(password, 'utf8') > BCRYPT_MAX_PASSWORD_BYTES
        ) {
            message = INITIAL_SETUP_MESSAGES.INVALID_PASSWORD;
        }

        if (message) {
            throw setupError(message, INITIAL_SETUP_CODES.INVALID_DATA, 400);
        }

        return { name, email, password };
    }

    /**
     * Cria a primeira conta somente com convite válido e ausência de admin.
     * O resultado não contém documento, hash, senha ou convite. A criação não
     * autentica automaticamente: login e sessão continuam responsabilidades
     * separadas. Falhas inesperadas são encaminhadas ao tratamento central.
     *
     * @param {object} input Nome, e-mail, senha e campo invitationToken.
     * @returns {Promise<Readonly<{ created: boolean }>>}
     */
    async createAdmin(input) {
        if (!this.#invitationDigest) {
            throw setupError(
                INITIAL_SETUP_MESSAGES.UNAVAILABLE,
                INITIAL_SETUP_CODES.UNAVAILABLE,
                409,
            );
        }

        const token = input?.invitationToken;
        if (
            typeof token !== 'string'
            || !INVITATION_PATTERN.test(token)
            || !timingSafeEqual(invitationDigest(token), this.#invitationDigest)
        ) {
            throw setupError(
                INITIAL_SETUP_MESSAGES.INVALID_INVITATION,
                INITIAL_SETUP_CODES.INVALID_INVITATION,
                403,
            );
        }

        const data = InitialSetupService.validateAccountData(input);
        const setupState = await this.#SetupStateModel.findOne({
            _id: INITIAL_SETUP_STATE_ID,
        });
        if (setupState) {
            throw setupError(
                INITIAL_SETUP_MESSAGES.UNAVAILABLE,
                INITIAL_SETUP_CODES.UNAVAILABLE,
                409,
            );
        }

        const administrator = await this.#UserModel.findOne({
            role: USER_ROLES.ADMIN,
        });
        if (administrator) {
            throw setupError(
                INITIAL_SETUP_MESSAGES.UNAVAILABLE,
                INITIAL_SETUP_CODES.UNAVAILABLE,
                409,
            );
        }

        const passwordHash = await this.#passwordHasher.hash(data.password);
        if (typeof passwordHash !== 'string' || passwordHash.length === 0) {
            throw new TypeError(INITIAL_SETUP_MESSAGES.INVALID_HASH_RESULT);
        }

        const administratorId = new Types.ObjectId();

        try {
            // O índice nativo de _id arbitra duas reservas simultâneas, sem
            // depender de autoIndex ou de uma transação multi-documento.
            await this.#SetupStateModel.create({
                _id: INITIAL_SETUP_STATE_ID,
                administratorId,
                status: INITIAL_SETUP_STATE_STATUS.RESERVED,
                completedAt: null,
            });
        } catch (error) {
            if (error?.code === 11000) {
                throw setupError(
                    INITIAL_SETUP_MESSAGES.UNAVAILABLE,
                    INITIAL_SETUP_CODES.UNAVAILABLE,
                    409,
                );
            }
            throw error;
        }

        try {
            await this.#UserModel.create({
                _id: administratorId,
                name: data.name,
                email: data.email,
                passwordHash,
                role: USER_ROLES.ADMIN,
                active: true,
            });
        } catch (error) {
            // Um conflito na criação é recusado; não produz falso sucesso e
            // não devolve valores do erro MongoDB ao futuro controlador.
            if (error?.code === 11000) {
                throw setupError(
                    INITIAL_SETUP_MESSAGES.UNAVAILABLE,
                    INITIAL_SETUP_CODES.UNAVAILABLE,
                    409,
                );
            }
            throw error;
        }

        // A atualização usa filtro de estado e identidade: ela não modifica
        // outra reserva. runValidators não executa o middleware de documento;
        // por isso informamos explicitamente estado e data coerentes.
        const completionResult = await this.#SetupStateModel.updateOne({
            _id: INITIAL_SETUP_STATE_ID,
            administratorId,
            status: INITIAL_SETUP_STATE_STATUS.RESERVED,
        }, {
            $set: {
                status: INITIAL_SETUP_STATE_STATUS.COMPLETED,
                completedAt: new Date(),
            },
        }, {
            runValidators: true,
        });

        if (
            !completionResult
            || completionResult.acknowledged !== true
            || completionResult.matchedCount !== 1
            || completionResult.modifiedCount !== 1
        ) {
            throw new Error(INITIAL_SETUP_MESSAGES.INVALID_COMPLETION_RESULT);
        }

        return Object.freeze({ created: true });
    }
}

module.exports = {
    INITIAL_SETUP_CODES,
    INITIAL_SETUP_MESSAGES,
    InitialSetupService,
};
