'use strict';

/**
 * Mensagens relacionadas à configuração e às respostas do controlador.
 *
 * Elas descrevem contratos internos sem incluir detalhes do banco, documentos
 * Mongoose ou valores recebidos pelo administrador.
 */
const MONTHLY_MATERIAL_CONTROLLER_ERRORS = Object.freeze({
    INVALID_MONTHLY_MATERIAL_SERVICE:
        'O controlador exige um serviço de materiais mensais válido.',
    INVALID_MONTHLY_MATERIAL_RESPONSE:
        'O serviço retornou um material mensal inválido.',
    INVALID_MONTHLY_MATERIAL_LIST_RESPONSE:
        'O serviço retornou uma lista de materiais mensais inválida.',
});

/**
 * Verifica se um valor é um objeto não nulo e não é uma lista.
 *
 * @param {unknown} value Valor recebido.
 * @returns {boolean} Verdadeiro somente para objetos apropriados.
 */
function isObject(value) {
    return (
        value !== null
        && typeof value === 'object'
        && !Array.isArray(value)
    );
}

/**
 * Coordena as requisições HTTP dos materiais aplicáveis a um mês inteiro.
 *
 * O controlador desconhece Mongoose e as regras de persistência. Ele apenas
 * traduz a entrada HTTP, delega ao serviço e limita novamente os campos que
 * podem aparecer na resposta.
 */
class MonthlyMaterialController {
    /**
     * Serviço responsável pelas regras de materiais mensais.
     *
     * @type {object}
     */
    #monthlyMaterialService;

    /**
     * @param {object} dependencies Dependências do controlador.
     * @param {object} dependencies.monthlyMaterialService
     * Serviço com listagem, consulta, gravação e exclusão mensal.
     */
    constructor({ monthlyMaterialService } = {}) {
        MonthlyMaterialController.validateMonthlyMaterialService(
            monthlyMaterialService,
        );

        this.#monthlyMaterialService = monthlyMaterialService;

        /**
         * Os handlers são vinculados para poderem ser registrados diretamente
         * no Router sem perder o acesso ao campo privado da instância.
         */
        this.list = this.list.bind(this);
        this.get = this.get.bind(this);
        this.save = this.save.bind(this);
        this.remove = this.remove.bind(this);

        Object.freeze(this);
    }

    /**
     * Valida o serviço utilizado pelo controlador.
     *
     * @param {unknown} service Dependência recebida.
     * @throws {TypeError} Quando as quatro operações necessárias não existem.
     */
    static validateMonthlyMaterialService(service) {
        if (
            !isObject(service)
            || typeof service.listMonthlyMaterials !== 'function'
            || typeof service.getMonthlyMaterial !== 'function'
            || typeof service.saveMonthlyMaterial !== 'function'
            || typeof service.deleteMonthlyMaterial !== 'function'
        ) {
            throw new TypeError(
                MONTHLY_MATERIAL_CONTROLLER_ERRORS
                    .INVALID_MONTHLY_MATERIAL_SERVICE,
            );
        }
    }

    /**
     * Cria a representação pública de um material mensal.
     *
     * Mesmo que uma implementação incorreta do serviço acrescente timestamps,
     * métodos ou campos internos, somente o identificador, o mês e os dois
     * links reconhecidos são selecionados para o cliente.
     *
     * @param {unknown} material Material recebido do serviço.
     * @returns {Readonly<object>} Material seguro para a resposta HTTP.
     * @throws {TypeError} Quando a representação estiver inconsistente.
     */
    static createPublicMonthlyMaterial(material) {
        const hasRequiredStrings =
            isObject(material)
            && typeof material.id === 'string'
            && material.id.trim().length > 0
            && typeof material.month === 'string'
            && material.month.trim().length > 0;

        const hasValidLinks =
            hasRequiredStrings
            && (
                material.lessonPlanUrl === null
                || typeof material.lessonPlanUrl === 'string'
            )
            && (
                material.studentGuideUrl === null
                || typeof material.studentGuideUrl === 'string'
            );

        if (!hasValidLinks) {
            throw new TypeError(
                MONTHLY_MATERIAL_CONTROLLER_ERRORS
                    .INVALID_MONTHLY_MATERIAL_RESPONSE,
            );
        }

        return Object.freeze({
            id: material.id,
            month: material.month,
            lessonPlanUrl: material.lessonPlanUrl,
            studentGuideUrl: material.studentGuideUrl,
        });
    }

    /**
     * Cria uma lista pública, imutável e independente dos itens do serviço.
     *
     * @param {unknown} materials Materiais recebidos do serviço.
     * @returns {ReadonlyArray<Readonly<object>>} Lista segura para a resposta.
     * @throws {TypeError} Quando a coleção estiver inconsistente.
     */
    static createPublicMonthlyMaterialList(materials) {
        if (!Array.isArray(materials)) {
            throw new TypeError(
                MONTHLY_MATERIAL_CONTROLLER_ERRORS
                    .INVALID_MONTHLY_MATERIAL_LIST_RESPONSE,
            );
        }

        try {
            return Object.freeze(
                materials.map((material) => (
                    MonthlyMaterialController
                        .createPublicMonthlyMaterial(material)
                )),
            );
        } catch (error) {
            if (error instanceof TypeError) {
                throw new TypeError(
                    MONTHLY_MATERIAL_CONTROLLER_ERRORS
                        .INVALID_MONTHLY_MATERIAL_LIST_RESPONSE,
                );
            }

            throw error;
        }
    }

    /**
     * Lista todos os materiais mensais para a tabela administrativa.
     *
     * @param {import('express').Request} request Requisição HTTP.
     * @param {import('express').Response} response Resposta HTTP.
     * @param {import('express').NextFunction} next Tratamento seguinte.
     * @returns {Promise<void>}
     */
    async list(request, response, next) {
        try {
            const materials = await this.#monthlyMaterialService
                .listMonthlyMaterials();
            const publicMaterials = MonthlyMaterialController
                .createPublicMonthlyMaterialList(materials);

            response.status(200).json({
                data: {
                    materials: publicMaterials,
                },
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * Consulta o material correspondente ao mês presente no caminho.
     *
     * Quando o serviço devolve `null`, a resposta preserva essa ausência sob o
     * envelope normal. Não possuir links cadastrados ainda é um estado válido
     * e não uma rota inexistente.
     *
     * @param {import('express').Request} request Requisição HTTP.
     * @param {import('express').Response} response Resposta HTTP.
     * @param {import('express').NextFunction} next Tratamento seguinte.
     * @returns {Promise<void>}
     */
    async get(request, response, next) {
        try {
            const material = await this.#monthlyMaterialService
                .getMonthlyMaterial(request?.params?.month);

            const publicMaterial = material === null
                ? null
                : MonthlyMaterialController
                    .createPublicMonthlyMaterial(material);

            response.status(200).json({
                data: {
                    material: publicMaterial,
                },
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * Substitui os links do mês presente no caminho.
     *
     * A resposta utiliza 200 tanto na primeira gravação quanto nas seguintes.
     * O endereço identifica previamente o recurso mensal, e repetir a mesma
     * chamada PUT preserva o mesmo estado.
     *
     * @param {import('express').Request} request Requisição HTTP.
     * @param {import('express').Response} response Resposta HTTP.
     * @param {import('express').NextFunction} next Tratamento seguinte.
     * @returns {Promise<void>}
     */
    async save(request, response, next) {
        try {
            const material = await this.#monthlyMaterialService
                .saveMonthlyMaterial(
                    request?.params?.month,
                    request?.body,
                );

            const publicMaterial = MonthlyMaterialController
                .createPublicMonthlyMaterial(material);

            response.status(200).json({
                data: {
                    material: publicMaterial,
                },
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * Exclui o material do mês e responde sem corpo.
     *
     * O mesmo resultado é utilizado quando o mês já não existe, preservando
     * a natureza idempotente da operação DELETE.
     *
     * @param {import('express').Request} request Requisição HTTP.
     * @param {import('express').Response} response Resposta HTTP.
     * @param {import('express').NextFunction} next Tratamento seguinte.
     * @returns {Promise<void>}
     */
    async remove(request, response, next) {
        try {
            await this.#monthlyMaterialService.deleteMonthlyMaterial(
                request?.params?.month,
            );

            response.status(204).end();
        } catch (error) {
            next(error);
        }
    }
}

module.exports = {
    MONTHLY_MATERIAL_CONTROLLER_ERRORS,
    MonthlyMaterialController,
};
