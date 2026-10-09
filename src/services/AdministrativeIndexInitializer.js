'use strict';

const { User, USER_ROLES } = require('../models/User');

/**
 * Mensagens operacionais sem nomes, e-mails, senhas ou dados do banco.
 */
const ADMINISTRATIVE_INDEX_ERRORS = Object.freeze({
    INVALID_USER_MODEL:
        'A preparação dos índices exige um modelo de usuário válido.',
    INVALID_ADMIN_COUNT:
        'O banco retornou uma contagem administrativa inválida.',
    MULTIPLE_ADMINS:
        'A instalação possui mais de uma conta administrativa. A inicialização foi interrompida; nenhuma conta foi excluída. Revise as contas existentes antes de tentar novamente.',
    DUPLICATE_DATA:
        'Os índices de usuário não puderam ser criados porque existem dados duplicados. A inicialização foi interrompida; nenhuma conta foi excluída. Revise os dados existentes antes de tentar novamente.',
});

/**
 * Prepara as restrições persistentes antes da criação da conta e da abertura
 * do servidor HTTP, inclusive quando autoIndex está desativado.
 *
 * Receber o modelo por injeção permite testar a ordem das operações e as
 * falhas sem conectar ao banco real. Construir este serviço não abre recursos
 * nem executa consultas. O servidor deverá chamar e aguardar initialize().
 */
class AdministrativeIndexInitializer {
    #UserModel;

    /**
     * @param {object} options Dependências do serviço.
     * @param {object} [options.UserModel=User] Modelo Mongoose de usuário.
     */
    constructor({ UserModel = User } = {}) {
        if (
            !UserModel
            || typeof UserModel.countDocuments !== 'function'
            || typeof UserModel.createIndexes !== 'function'
        ) {
            throw new TypeError(
                ADMINISTRATIVE_INDEX_ERRORS.INVALID_USER_MODEL,
            );
        }

        this.#UserModel = UserModel;
    }

    /**
     * Confere as contas existentes e aguarda a criação dos índices do modelo.
     *
     * A contagem inclui contas desativadas. Ela oferece um diagnóstico claro,
     * mas não substitui o índice único: uma escrita concorrente pode ocorrer
     * entre a consulta e a criação. A restrição final pertence ao MongoDB.
     *
     * createIndexes preserva documentos e não remove índices existentes.
     * Não utilizamos syncIndexes, que poderia remover índices do banco.
     * A operação prepara os dois índices declarados em User: e-mail único e
     * administrador único. Índices já existentes e compatíveis são reutilizados.
     *
     * @returns {Promise<void>}
     * @throws {Error} Quando os dados ou o banco impedem a preparação.
     */
    async initialize() {
        const adminCount = await this.#UserModel.countDocuments({
            role: USER_ROLES.ADMIN,
        });

        if (!Number.isSafeInteger(adminCount) || adminCount < 0) {
            throw new TypeError(
                ADMINISTRATIVE_INDEX_ERRORS.INVALID_ADMIN_COUNT,
            );
        }

        if (adminCount > 1) {
            throw new Error(
                ADMINISTRATIVE_INDEX_ERRORS.MULTIPLE_ADMINS,
            );
        }

        try {
            await this.#UserModel.createIndexes();
        } catch (error) {
            /**
             * Um conflito pode envolver e-mail duplicado ou uma nova conta
             * inserida durante a preparação. Não atribuímos todo erro 11000
             * à contagem administrativa, nem expomos valores do erro original.
             * Outras falhas permanecem disponíveis ao tratamento do servidor.
             */
            if (error?.code === 11000) {
                throw new Error(
                    ADMINISTRATIVE_INDEX_ERRORS.DUPLICATE_DATA,
                );
            }

            throw error;
        }
    }
}

module.exports = {
    ADMINISTRATIVE_INDEX_ERRORS,
    AdministrativeIndexInitializer,
};
