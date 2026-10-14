'use strict';

const mongoose = require('mongoose');

const INITIAL_SETUP_STATE_MODEL_NAME = 'InitialSetupState';
const INITIAL_SETUP_STATE_COLLECTION = 'initial_setup_states';

/**
 * Todas as operações futuras devem utilizar este identificador fixo.
 * O índice obrigatório de _id no MongoDB impede duas reservas com esse id,
 * mesmo quando autoIndex está desativado. O schema também recusa outro valor.
 */
const INITIAL_SETUP_STATE_ID = 'initial-administrative-setup';

const INITIAL_SETUP_STATE_STATUS = Object.freeze({
    RESERVED: 'reserved',
    COMPLETED: 'completed',
});

const INITIAL_SETUP_STATE_ERRORS = Object.freeze({
    INVALID_MONGOOSE:
        'Uma instância válida do Mongoose é necessária para o registro de primeiro cadastro.',
    INVALID_ID:
        'O identificador do registro de primeiro cadastro é inválido.',
    REQUIRED_ADMINISTRATOR_ID:
        'O registro exige o identificador da conta administrativa reservada.',
    INVALID_STATUS:
        'O estado do primeiro cadastro é inválido.',
    REQUIRED_COMPLETION_DATE:
        'O cadastro concluído exige uma data válida de conclusão.',
    UNEXPECTED_COMPLETION_DATE:
        'Um cadastro reservado ainda não deve possuir data de conclusão.',
});

/**
 * Constrói o schema sem abrir conexão ou criar registros no banco.
 *
 * RESERVED representa uma tentativa admitida que ainda precisa ser concluída.
 * COMPLETED representa a conclusão permanente do primeiro cadastro.
 * Ambos deverão bloquear uma nova reserva na futura integração do serviço.
 *
 * O administratorId é escolhido antes da criação da conta. Assim, uma
 * interrupção pode ser investigada usando a identidade reservada, sem
 * depender de e-mail, senha ou convite persistidos neste registro.
 *
 * Não existe TTL: reiniciar a aplicação ou remover manualmente o usuário
 * não deve apagar este registro nem liberar automaticamente outro cadastro.
 * A recuperação de uma reserva interrompida será responsabilidade do serviço,
 * que deverá preservar a reserva e verificar a conta correspondente.
 *
 * @param {typeof mongoose} [mongooseClient=mongoose] Instância Mongoose.
 * @returns {mongoose.Schema} Schema do estado de primeiro cadastro.
 */
function createInitialSetupStateSchema(mongooseClient = mongoose) {
    if (
        !mongooseClient
        || typeof mongooseClient.Schema !== 'function'
        || !mongooseClient.Schema.Types?.ObjectId
    ) {
        throw new TypeError(INITIAL_SETUP_STATE_ERRORS.INVALID_MONGOOSE);
    }

    const schema = new mongooseClient.Schema({
        _id: {
            type: String,
            required: true,
            default: INITIAL_SETUP_STATE_ID,
            enum: {
                values: [INITIAL_SETUP_STATE_ID],
                message: INITIAL_SETUP_STATE_ERRORS.INVALID_ID,
            },
            immutable: true,
        },
        administratorId: {
            type: mongooseClient.Schema.Types.ObjectId,
            required: [true, INITIAL_SETUP_STATE_ERRORS.REQUIRED_ADMINISTRATOR_ID],
            immutable: true,
        },
        status: {
            type: String,
            required: true,
            enum: {
                values: Object.values(INITIAL_SETUP_STATE_STATUS),
                message: INITIAL_SETUP_STATE_ERRORS.INVALID_STATUS,
            },
            default: INITIAL_SETUP_STATE_STATUS.RESERVED,
        },
        completedAt: {
            type: Date,
            default: null,
        },
    }, {
        collection: INITIAL_SETUP_STATE_COLLECTION,
        timestamps: true,
        versionKey: false,
        // Erros de escrita de campo não devem ser silenciosamente ignorados.
        strict: 'throw',
    });

    /**
     * Validação cruzada para documentos criados ou salvos pelo modelo.
     * Atualizações atômicas futuras precisarão usar filtros e valores
     * explícitos; middleware de documento não valida findOneAndUpdate.
     * O schema não implementa sozinho transições irreversíveis de estado.
     */
    schema.pre('validate', function validateCompletionDate() {
        const hasValidDate = this.completedAt instanceof Date
            && Number.isFinite(this.completedAt.getTime());

        if (
            this.status === INITIAL_SETUP_STATE_STATUS.COMPLETED
            && !hasValidDate
        ) {
            this.invalidate('completedAt',
                INITIAL_SETUP_STATE_ERRORS.REQUIRED_COMPLETION_DATE);
        }

        if (
            this.status === INITIAL_SETUP_STATE_STATUS.RESERVED
            && this.completedAt != null
        ) {
            this.invalidate('completedAt',
                INITIAL_SETUP_STATE_ERRORS.UNEXPECTED_COMPLETION_DATE);
        }
    });

    return schema;
}

/**
 * Cria ou reutiliza o modelo registrado na instância recebida.
 * Não abre recursos externos. Instâncias isoladas poderão ser usadas em teste.
 *
 * @param {typeof mongoose} [mongooseClient=mongoose] Instância Mongoose.
 * @returns {mongoose.Model} Modelo do registro de primeiro cadastro.
 */
function createInitialSetupStateModel(mongooseClient = mongoose) {
    if (
        !mongooseClient
        || typeof mongooseClient.model !== 'function'
        || !mongooseClient.models
    ) {
        throw new TypeError(INITIAL_SETUP_STATE_ERRORS.INVALID_MONGOOSE);
    }

    const existingModel = mongooseClient.models[INITIAL_SETUP_STATE_MODEL_NAME];
    if (existingModel) return existingModel;

    return mongooseClient.model(
        INITIAL_SETUP_STATE_MODEL_NAME,
        createInitialSetupStateSchema(mongooseClient),
    );
}

const InitialSetupState = createInitialSetupStateModel();

module.exports = {
    INITIAL_SETUP_STATE_MODEL_NAME,
    INITIAL_SETUP_STATE_COLLECTION,
    INITIAL_SETUP_STATE_ID,
    INITIAL_SETUP_STATE_STATUS,
    INITIAL_SETUP_STATE_ERRORS,
    InitialSetupState,
    createInitialSetupStateSchema,
    createInitialSetupStateModel,
};
