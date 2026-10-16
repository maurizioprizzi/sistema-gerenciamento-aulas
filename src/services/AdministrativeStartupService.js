'use strict';

const { User, USER_ROLES } = require('../models/User');
const { AdminBootstrapper, ADMIN_BOOTSTRAP_STATUS } = require('./AdminBootstrapper');
const {
    InitialSetupRecoveryService,
    INITIAL_SETUP_RECOVERY_STATUS,
} = require('./InitialSetupRecoveryService');

const ADMINISTRATIVE_STARTUP_STATUS = Object.freeze({
    EXISTING_ADMIN: 'existing_admin',
    CREATED_ADMIN: 'created_admin',
    SETUP_REQUIRED: 'setup_required',
});

const ADMINISTRATIVE_STARTUP_ERRORS = Object.freeze({
    INVALID_USER_MODEL: 'A preparação administrativa exige um modelo de usuário válido.',
    INVALID_RECOVERY_SERVICE: 'A preparação administrativa exige um serviço de recuperação válido.',
    INVALID_BOOTSTRAPPER: 'A preparação administrativa exige um serviço de criação administrativa válido.',
    INVALID_INVITATION: 'O convite inicial deve conter 64 caracteres hexadecimais.',
    INVALID_RECOVERY_RESULT: 'A recuperação retornou um resultado administrativo inválido.',
    INVALID_USER: 'A consulta administrativa retornou uma conta inválida.',
    INVALID_BOOTSTRAP_RESULT: 'A criação administrativa retornou um resultado inválido.',
    RESERVATION_NEEDS_REVIEW:
        'Existe uma reserva de primeiro cadastro sem a conta correspondente. A inicialização foi interrompida; preserve a reserva e verifique a recuperação da instalação.',
    COMPLETED_WITHOUT_ADMIN:
        'O primeiro cadastro já foi concluído, mas a conta administrativa não foi encontrada. A inicialização foi interrompida; restaure a conta sem remover o registro de cadastro.',
    CONFIGURATION_REQUIRED:
        'Nenhum administrador foi encontrado. Configure um convite inicial ou o grupo completo de credenciais administrativas antes de iniciar a instalação.',
});

function result(status) {
    return Object.freeze({ status });
}

/**
 * Decide como preparar a administração sem abrir HTTP ou acessar process.env.
 * O servidor deverá aguardar os índices de usuário antes de initialize().
 *
 * Conta existente, inclusive desativada, é preservada sem hashing ou bootstrap.
 * Reserva pendente sem conta e conclusão sem conta interrompem a preparação,
 * mesmo com convite ou credenciais disponíveis: não reabrem o cadastro.
 *
 * Sem registro e sem conta, convite tem prioridade sobre credenciais antigas.
 * Sem convite, o grupo predefinido mantém o fluxo de criação legado.
 * Sem ambos, a instalação não pode iniciar sem um meio de acesso configurado.
 *
 * Este serviço ainda não é chamado pelo servidor. Seu resultado setup_required
 * indica a necessidade de compor o roteador de cadastro, não ativa nenhuma rota.
 */
class AdministrativeStartupService {
    #UserModel;
    #recoveryService;
    #adminBootstrapper;

    /**
     * @param {object} options Dependências substituíveis nos testes.
     * @param {object} [options.UserModel=User] Modelo de usuário.
     * @param {object} [options.recoveryService] Recuperação com recover().
     * @param {object} [options.adminBootstrapper] Criação com ensureAdmin().
     */
    constructor({
        UserModel = User,
        recoveryService,
        adminBootstrapper,
    } = {}) {
        if (!UserModel || typeof UserModel.findOne !== 'function') {
            throw new TypeError(ADMINISTRATIVE_STARTUP_ERRORS.INVALID_USER_MODEL);
        }
        if (recoveryService === undefined) {
            recoveryService = new InitialSetupRecoveryService({ UserModel });
        }
        if (adminBootstrapper === undefined) {
            adminBootstrapper = new AdminBootstrapper({ UserModel });
        }
        if (!recoveryService || typeof recoveryService.recover !== 'function') {
            throw new TypeError(ADMINISTRATIVE_STARTUP_ERRORS.INVALID_RECOVERY_SERVICE);
        }
        if (!adminBootstrapper || typeof adminBootstrapper.ensureAdmin !== 'function') {
            throw new TypeError(ADMINISTRATIVE_STARTUP_ERRORS.INVALID_BOOTSTRAPPER);
        }
        this.#UserModel = UserModel;
        this.#recoveryService = recoveryService;
        this.#adminBootstrapper = adminBootstrapper;
    }

    /**
     * @param {object} configuration Configuração recebida da composição.
     * @param {object} [configuration.adminCredentials] Grupo completo ou ausente.
     * @param {string} [configuration.initialSetupToken] Convite ou ausente.
     * @returns {Promise<Readonly<{ status: string }>>} Decisão sem credenciais.
     */
    async initialize({ adminCredentials, initialSetupToken } = {}) {
        // Falhas de configuração são recusadas antes de consultar o banco.
        if (adminCredentials !== undefined) {
            AdminBootstrapper.validateConfiguration(adminCredentials);
        }
        if (initialSetupToken !== undefined && (
            typeof initialSetupToken !== 'string'
            || !/^[a-fA-F0-9]{64}$/.test(initialSetupToken)
        )) {
            throw new TypeError(ADMINISTRATIVE_STARTUP_ERRORS.INVALID_INVITATION);
        }

        const recovery = await this.#recoveryService.recover();
        if (!recovery || !Object.values(INITIAL_SETUP_RECOVERY_STATUS).includes(recovery.status)) {
            throw new TypeError(ADMINISTRATIVE_STARTUP_ERRORS.INVALID_RECOVERY_RESULT);
        }
        if (recovery.status === INITIAL_SETUP_RECOVERY_STATUS.NEEDS_REVIEW) {
            throw new Error(ADMINISTRATIVE_STARTUP_ERRORS.RESERVATION_NEEDS_REVIEW);
        }

        const administrator = await this.#UserModel.findOne({ role: USER_ROLES.ADMIN });
        if (administrator) {
            if (administrator.role !== USER_ROLES.ADMIN) {
                throw new TypeError(ADMINISTRATIVE_STARTUP_ERRORS.INVALID_USER);
            }
            return result(ADMINISTRATIVE_STARTUP_STATUS.EXISTING_ADMIN);
        }

        if (recovery.status !== INITIAL_SETUP_RECOVERY_STATUS.NO_RECORD) {
            throw new Error(ADMINISTRATIVE_STARTUP_ERRORS.COMPLETED_WITHOUT_ADMIN);
        }
        if (initialSetupToken !== undefined) {
            return result(ADMINISTRATIVE_STARTUP_STATUS.SETUP_REQUIRED);
        }
        if (adminCredentials === undefined) {
            throw new Error(ADMINISTRATIVE_STARTUP_ERRORS.CONFIGURATION_REQUIRED);
        }

        const bootstrap = await this.#adminBootstrapper.ensureAdmin(adminCredentials);
        if (bootstrap?.status === ADMIN_BOOTSTRAP_STATUS.CREATED && bootstrap.created === true) {
            return result(ADMINISTRATIVE_STARTUP_STATUS.CREATED_ADMIN);
        }
        if (bootstrap?.status === ADMIN_BOOTSTRAP_STATUS.ALREADY_EXISTS && bootstrap.created === false) {
            return result(ADMINISTRATIVE_STARTUP_STATUS.EXISTING_ADMIN);
        }
        throw new TypeError(ADMINISTRATIVE_STARTUP_ERRORS.INVALID_BOOTSTRAP_RESULT);
    }
}

module.exports = {
    ADMINISTRATIVE_STARTUP_STATUS,
    ADMINISTRATIVE_STARTUP_ERRORS,
    AdministrativeStartupService,
};
