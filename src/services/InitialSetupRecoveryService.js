'use strict';

const { User, USER_ROLES } = require('../models/User');
const {
    InitialSetupState,
    INITIAL_SETUP_STATE_ID,
    INITIAL_SETUP_STATE_STATUS,
} = require('../models/InitialSetupState');

const INITIAL_SETUP_RECOVERY_STATUS = Object.freeze({
    NO_RECORD: 'no_record',
    ALREADY_COMPLETED: 'already_completed',
    COMPLETED: 'completed',
    NEEDS_REVIEW: 'needs_review',
});

const INITIAL_SETUP_RECOVERY_ERRORS = Object.freeze({
    INVALID_USER_MODEL:
        'A recuperação do primeiro cadastro exige um modelo de usuário válido.',
    INVALID_STATE_MODEL:
        'A recuperação do primeiro cadastro exige um modelo de estado válido.',
    INVALID_CLOCK:
        'A recuperação do primeiro cadastro exige um relógio válido.',
    INVALID_TIMESTAMP:
        'O relógio retornou uma data inválida para a recuperação.',
    INVALID_STATE:
        'O registro do primeiro cadastro é inconsistente. O cadastro permanece bloqueado e requer verificação.',
    INVALID_USER:
        'A conta retornada não corresponde à reserva administrativa. O cadastro permanece bloqueado.',
    INVALID_UPDATE:
        'Não foi possível confirmar a recuperação do primeiro cadastro. O cadastro permanece bloqueado e requer verificação.',
});

/**
 * Aceita ObjectId do Mongoose ou sua representação hexadecimal completa.
 * Nenhum identificador é incluído em mensagens ou resultados do serviço.
 */
function identifierText(value) {
    if (typeof value === 'string' && /^[a-fA-F0-9]{24}$/.test(value)) {
        return value.toLowerCase();
    }
    if (value && typeof value.toHexString === 'function') {
        const text = value.toHexString();
        if (typeof text === 'string' && /^[a-fA-F0-9]{24}$/.test(text)) {
            return text.toLowerCase();
        }
    }
    return null;
}

function result(status) {
    return Object.freeze({ status });
}

/**
 * Reconcilia uma reserva cujo usuário já foi persistido, sem usar senha,
 * convite ou e-mail. Não cria contas, não remove registros e não reabre o
 * cadastro. Uma reserva sem a conta correspondente exige intervenção futura.
 *
 * Construir o serviço não consulta o banco. A futura inicialização deverá
 * aguardar recover() antes de disponibilizar o cadastro HTTP. Este arquivo
 * ainda não modifica a inicialização nem ativa rotas de recuperação.
 */
class InitialSetupRecoveryService {
    #UserModel;
    #SetupStateModel;
    #clock;

    /**
     * @param {object} options Dependências substituíveis nos testes.
     * @param {object} [options.UserModel=User] Modelo de usuário.
     * @param {object} [options.SetupStateModel=InitialSetupState] Estado persistente.
     * @param {Function} [options.clock] Relógio que retorna Date.
     */
    constructor({
        UserModel = User,
        SetupStateModel = InitialSetupState,
        clock = () => new Date(),
    } = {}) {
        if (!UserModel || typeof UserModel.findOne !== 'function') {
            throw new TypeError(INITIAL_SETUP_RECOVERY_ERRORS.INVALID_USER_MODEL);
        }
        if (
            !SetupStateModel
            || typeof SetupStateModel.findOne !== 'function'
            || typeof SetupStateModel.updateOne !== 'function'
        ) {
            throw new TypeError(INITIAL_SETUP_RECOVERY_ERRORS.INVALID_STATE_MODEL);
        }
        if (typeof clock !== 'function') {
            throw new TypeError(INITIAL_SETUP_RECOVERY_ERRORS.INVALID_CLOCK);
        }
        this.#UserModel = UserModel;
        this.#SetupStateModel = SetupStateModel;
        this.#clock = clock;
    }

    /**
     * Valida o estado antes de decidir por uma atualização.
     * @param {object} state Documento ou objeto retornado pelo modelo.
     * @returns {string} Identificador administrativo normalizado.
     */
    static validateState(state) {
        const administratorId = identifierText(state?.administratorId);
        const knownStatus = Object.values(INITIAL_SETUP_STATE_STATUS)
            .includes(state?.status);
        const validDate = state?.completedAt instanceof Date
            && Number.isFinite(state.completedAt.getTime());
        if (
            !state
            || state._id !== INITIAL_SETUP_STATE_ID
            || !administratorId
            || !knownStatus
            || (state.status === INITIAL_SETUP_STATE_STATUS.RESERVED && state.completedAt != null)
            || (state.status === INITIAL_SETUP_STATE_STATUS.COMPLETED && !validDate)
        ) {
            throw new Error(INITIAL_SETUP_RECOVERY_ERRORS.INVALID_STATE);
        }
        return administratorId;
    }

    /**
     * Conclui exclusivamente a reserva com conta de id e papel correspondentes.
     * Uma conta desativada pode confirmar a reserva, mas permanece desativada.
     * Um registro já concluído permanece assim, mesmo se a conta foi removida.
     *
     * A atualização compara o estado anterior e a identidade reservada. Se
     * outra instância concluir primeiro, uma nova consulta confirma o resultado
     * antes de considerar a corrida resolvida. Falhas do banco são propagadas.
     *
     * @returns {Promise<Readonly<{ status: string }>>} Resultado sem dados privados.
     */
    async recover() {
        const state = await this.#SetupStateModel.findOne({
            _id: INITIAL_SETUP_STATE_ID,
        });
        if (!state) return result(INITIAL_SETUP_RECOVERY_STATUS.NO_RECORD);

        const administratorId = InitialSetupRecoveryService.validateState(state);
        if (state.status === INITIAL_SETUP_STATE_STATUS.COMPLETED) {
            return result(INITIAL_SETUP_RECOVERY_STATUS.ALREADY_COMPLETED);
        }

        const user = await this.#UserModel.findOne({
            _id: state.administratorId,
            role: USER_ROLES.ADMIN,
        });
        if (!user) return result(INITIAL_SETUP_RECOVERY_STATUS.NEEDS_REVIEW);
        if (identifierText(user._id) !== administratorId || user.role !== USER_ROLES.ADMIN) {
            throw new Error(INITIAL_SETUP_RECOVERY_ERRORS.INVALID_USER);
        }

        const timestamp = this.#clock();
        if (!(timestamp instanceof Date) || !Number.isFinite(timestamp.getTime())) {
            throw new TypeError(INITIAL_SETUP_RECOVERY_ERRORS.INVALID_TIMESTAMP);
        }
        const update = await this.#SetupStateModel.updateOne({
            _id: INITIAL_SETUP_STATE_ID,
            administratorId: state.administratorId,
            status: INITIAL_SETUP_STATE_STATUS.RESERVED,
        }, {
            $set: {
                status: INITIAL_SETUP_STATE_STATUS.COMPLETED,
                completedAt: new Date(timestamp.getTime()),
            },
        }, { runValidators: true });

        if (update?.acknowledged === true && update.matchedCount === 1 && update.modifiedCount === 1) {
            return result(INITIAL_SETUP_RECOVERY_STATUS.COMPLETED);
        }

        if (update?.acknowledged === true && update.matchedCount === 0 && update.modifiedCount === 0) {
            const concurrentState = await this.#SetupStateModel.findOne({
                _id: INITIAL_SETUP_STATE_ID,
            });
            const concurrentId = InitialSetupRecoveryService.validateState(concurrentState);
            if (concurrentId === administratorId
                && concurrentState.status === INITIAL_SETUP_STATE_STATUS.COMPLETED) {
                return result(INITIAL_SETUP_RECOVERY_STATUS.ALREADY_COMPLETED);
            }
        }
        throw new Error(INITIAL_SETUP_RECOVERY_ERRORS.INVALID_UPDATE);
    }
}

module.exports = {
    INITIAL_SETUP_RECOVERY_STATUS,
    INITIAL_SETUP_RECOVERY_ERRORS,
    InitialSetupRecoveryService,
};
