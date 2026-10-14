'use strict';

const INITIAL_SETUP_CONTROLLER_ERRORS = Object.freeze({
    INVALID_SERVICE:
        'O controlador exige um serviço de primeiro cadastro válido.',
    INVALID_STATUS_RESPONSE:
        'O serviço retornou um estado de primeiro cadastro inválido.',
    INVALID_CREATION_RESPONSE:
        'O serviço retornou uma confirmação de primeiro cadastro inválida.',
});

function isObject(value) {
    return value !== null
        && typeof value === 'object'
        && !Array.isArray(value);
}

/**
 * Traduz HTTP para o serviço sem conhecer MongoDB, bcrypt ou recuperação.
 *
 * A consulta informa apenas a disponibilidade. A criação confirma somente
 * que a conta foi criada; não retorna documento, convite ou credenciais,
 * nem autentica automaticamente o usuário.
 *
 * Nenhuma rota é ativada pela importação deste arquivo. O futuro roteador
 * deverá aplicar proteção da origem e limitação de tentativas antes de chamar
 * os handlers. Validação do convite e da conta pertence ao serviço.
 */
class InitialSetupController {
    #initialSetupService;

    /**
     * @param {object} options Dependências do controlador.
     * @param {object} options.initialSetupService Serviço de primeiro cadastro.
     */
    constructor({ initialSetupService } = {}) {
        if (
            !isObject(initialSetupService)
            || typeof initialSetupService.getStatus !== 'function'
            || typeof initialSetupService.createAdmin !== 'function'
        ) {
            throw new TypeError(INITIAL_SETUP_CONTROLLER_ERRORS.INVALID_SERVICE);
        }
        this.#initialSetupService = initialSetupService;
        this.getStatus = this.getStatus.bind(this);
        this.createAdmin = this.createAdmin.bind(this);
        Object.freeze(this);
    }

    /**
     * Seleciona novamente os campos públicos: uma implementação incorreta do
     * serviço não pode acrescentar dados privados à resposta HTTP.
     * @param {unknown} status Resultado do serviço.
     * @returns {Readonly<{ available: boolean }>} Estado público.
     */
    static createPublicStatus(status) {
        if (!isObject(status) || typeof status.available !== 'boolean') {
            throw new TypeError(INITIAL_SETUP_CONTROLLER_ERRORS.INVALID_STATUS_RESPONSE);
        }
        return Object.freeze({ available: status.available });
    }

    /**
     * Um resultado falso ou ausente nunca é convertido em sucesso HTTP.
     * @param {unknown} creation Resultado do serviço.
     * @returns {Readonly<{ created: boolean }>} Confirmação pública.
     */
    static createPublicCreation(creation) {
        if (!isObject(creation) || creation.created !== true) {
            throw new TypeError(INITIAL_SETUP_CONTROLLER_ERRORS.INVALID_CREATION_RESPONSE);
        }
        return Object.freeze({ created: true });
    }

    /**
     * Consulta o estado para orientar a futura interface entre cadastro/login.
     * Impede armazenamento da resposta em cache: o estado muda após a reserva.
     * @param {import('express').Request} request Requisição.
     * @param {import('express').Response} response Resposta.
     * @param {import('express').NextFunction} next Tratamento de erros.
     * @returns {Promise<void>}
     */
    async getStatus(request, response, next) {
        try {
            response.set('Cache-Control', 'no-store');
            const status = await this.#initialSetupService.getStatus();
            const publicStatus = InitialSetupController.createPublicStatus(status);
            response.status(200).json({ data: publicStatus });
        } catch (error) {
            next(error);
        }
    }

    /**
     * Recebe convite somente no corpo da requisição, nunca pela URL.
     * Campos extras não são encaminhados quando o corpo é um objeto válido.
     * Entradas de outro tipo seguem para a recusa do serviço.
     * Erros conhecidos e inesperados seguem ao middleware centralizado.
     * @param {import('express').Request} request Requisição.
     * @param {import('express').Response} response Resposta.
     * @param {import('express').NextFunction} next Tratamento de erros.
     * @returns {Promise<void>}
     */
    async createAdmin(request, response, next) {
        try {
            response.set('Cache-Control', 'no-store');
            const body = request?.body;
            const input = isObject(body) ? {
                invitationToken: body.invitationToken,
                name: body.name,
                email: body.email,
                password: body.password,
            } : body;
            const creation = await this.#initialSetupService.createAdmin(input);
            const publicCreation = InitialSetupController.createPublicCreation(creation);
            response.status(201).json({ data: publicCreation });
        } catch (error) {
            next(error);
        }
    }
}

module.exports = {
    INITIAL_SETUP_CONTROLLER_ERRORS,
    InitialSetupController,
};
