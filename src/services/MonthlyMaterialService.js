'use strict';

const { AppError } = require('../errors/AppError');
const {
    MonthlyMaterial,
    isValidCalendarMonth,
} = require('../models/MonthlyMaterial');

/**
 * Códigos estáveis produzidos pelas regras de materiais mensais.
 *
 * O mês identifica o recurso, enquanto os dados representam somente os dois
 * links mantidos pelo formulário original. A separação permite que clientes
 * tratem erros sem depender do texto humano das mensagens.
 */
const MONTHLY_MATERIAL_SERVICE_CODES = Object.freeze({
    INVALID_MONTHLY_MATERIAL_MONTH:
        'INVALID_MONTHLY_MATERIAL_MONTH',
    INVALID_MONTHLY_MATERIAL_DATA:
        'INVALID_MONTHLY_MATERIAL_DATA',
});

/**
 * Mensagens públicas e internas do serviço.
 */
const MONTHLY_MATERIAL_SERVICE_MESSAGES = Object.freeze({
    INVALID_MONTHLY_MATERIAL_MODEL:
        'Um modelo de material mensal válido é necessário para gerenciar os materiais.',
    INVALID_MONTHLY_MATERIAL_MONTH:
        'O mês do material é inválido.',
    INVALID_MONTHLY_MATERIAL_DATA:
        'Os dados do material mensal são inválidos.',
    INVALID_MONTHLY_MATERIAL_DOCUMENT:
        'O modelo retornou um material mensal inválido.',
    INVALID_MONTHLY_MATERIAL_LIST:
        'O modelo retornou uma lista de materiais mensais inválida.',
});

/**
 * Campos aceitos no corpo da substituição mensal.
 *
 * `month` não pertence ao corpo porque identifica o recurso no caminho HTTP.
 * A lista explícita também impede a entrada de identificadores, timestamps e
 * propriedades internas do Mongoose.
 */
const MONTHLY_MATERIAL_DATA_FIELDS = Object.freeze([
    'lessonPlanUrl',
    'studentGuideUrl',
]);

/**
 * Opções utilizadas para substituir ou criar atomicamente o material do mês.
 *
 * - `returnDocument` devolve o estado posterior à operação;
 * - `upsert` cria o recurso quando ele ainda não existe;
 * - `runValidators` mantém o schema como fonte das regras dos links;
 * - `setDefaultsOnInsert` aplica os padrões durante a criação.
 */
const MONTHLY_MATERIAL_UPDATE_OPTIONS = Object.freeze({
    returnDocument: 'after',
    upsert: true,
    runValidators: true,
    setDefaultsOnInsert: true,
});

/**
 * Ordenação determinística da coleção mensal.
 *
 * O protótipo apresenta primeiro os períodos mais recentes. O identificador
 * forma o segundo critério apenas para manter a consulta estável mesmo diante
 * de dados legados inconsistentes.
 */
const MONTHLY_MATERIAL_SORT = Object.freeze({
    month: -1,
    _id: -1,
});

/**
 * Confirma que um valor pode representar dados recebidos pelo serviço.
 *
 * @param {unknown} value Valor candidato.
 * @returns {boolean} Verdadeiro somente para objetos não nulos e não listas.
 */
function isInputObject(value) {
    return (
        value !== null
        && typeof value === 'object'
        && !Array.isArray(value)
    );
}

/**
 * Cria um erro operacional seguro para um mês inválido.
 *
 * @returns {AppError} Erro público de cliente.
 */
function createInvalidMonthlyMaterialMonthError() {
    return new AppError(
        MONTHLY_MATERIAL_SERVICE_MESSAGES
            .INVALID_MONTHLY_MATERIAL_MONTH,
        {
            statusCode: 400,
            code:
                MONTHLY_MATERIAL_SERVICE_CODES
                    .INVALID_MONTHLY_MATERIAL_MONTH,
        },
    );
}

/**
 * Cria um erro operacional seguro para dados mensais inválidos.
 *
 * @returns {AppError} Erro público de cliente.
 */
function createInvalidMonthlyMaterialDataError() {
    return new AppError(
        MONTHLY_MATERIAL_SERVICE_MESSAGES
            .INVALID_MONTHLY_MATERIAL_DATA,
        {
            statusCode: 400,
            code:
                MONTHLY_MATERIAL_SERVICE_CODES
                    .INVALID_MONTHLY_MATERIAL_DATA,
        },
    );
}

/**
 * Coordena listagem, consulta, substituição e exclusão dos materiais mensais.
 *
 * O serviço não conhece HTTP, sessão ou componentes visuais. O modelo é
 * recebido por injeção para que as regras possam ser testadas sem conexão com
 * MongoDB.
 */
class MonthlyMaterialService {
    /**
     * Modelo utilizado para consultar e persistir materiais mensais.
     *
     * @type {object}
     */
    #MonthlyMaterialModel;

    /**
     * @param {object} dependencies Dependências do serviço.
     * @param {object} dependencies.MonthlyMaterialModel Modelo persistente.
     */
    constructor({
        MonthlyMaterialModel = MonthlyMaterial,
    } = {}) {
        MonthlyMaterialService.validateMonthlyMaterialModel(
            MonthlyMaterialModel,
        );

        this.#MonthlyMaterialModel = MonthlyMaterialModel;
    }

    /**
     * Verifica as operações exigidas do modelo persistente.
     *
     * @param {unknown} MonthlyMaterialModel Modelo candidato.
     * @throws {TypeError} Quando alguma operação necessária está ausente.
     */
    static validateMonthlyMaterialModel(MonthlyMaterialModel) {
        const isValid =
            MonthlyMaterialModel
            && typeof MonthlyMaterialModel.find === 'function'
            && typeof MonthlyMaterialModel.findOne === 'function'
            && typeof MonthlyMaterialModel.findOneAndUpdate
                === 'function'
            && typeof MonthlyMaterialModel.findOneAndDelete
                === 'function';

        if (!isValid) {
            throw new TypeError(
                MONTHLY_MATERIAL_SERVICE_MESSAGES
                    .INVALID_MONTHLY_MATERIAL_MODEL,
            );
        }
    }

    /**
     * Valida e preserva o mês civil utilizado como identidade do recurso.
     *
     * Espaços não são removidos silenciosamente. O valor precisa chegar no
     * mesmo formato produzido pelo campo HTML `month` do protótipo.
     *
     * @param {unknown} month Mês no formato YYYY-MM.
     * @returns {string} Mês validado.
     * @throws {AppError} Quando o mês não representa um período válido.
     */
    static prepareMonth(month) {
        if (!isValidCalendarMonth(month)) {
            throw createInvalidMonthlyMaterialMonthError();
        }

        return month;
    }

    /**
     * Mantém somente os dois links reconhecidos pelo protótipo.
     *
     * A operação HTTP correspondente será uma substituição completa. Por
     * isso, um campo ausente é convertido explicitamente em `null`, permitindo
     * remover um link anteriormente salvo sem criar uma rota adicional.
     * Valores presentes são preservados para normalização e validação pelo
     * schema, inclusive quando possuem um tipo inválido.
     *
     * @param {unknown} materialData Dados recebidos para o mês.
     * @returns {Readonly<object>} Dados estruturais entregues ao modelo.
     * @throws {AppError} Quando o corpo ou seus campos são inválidos.
     */
    static prepareMaterialData(materialData) {
        if (!isInputObject(materialData)) {
            throw createInvalidMonthlyMaterialDataError();
        }

        const receivedFields = Object.keys(materialData);
        const hasUnknownField = receivedFields.some(
            (field) => !MONTHLY_MATERIAL_DATA_FIELDS.includes(field),
        );

        if (hasUnknownField) {
            throw createInvalidMonthlyMaterialDataError();
        }

        return Object.freeze({
            lessonPlanUrl: Object.hasOwn(
                materialData,
                'lessonPlanUrl',
            )
                ? materialData.lessonPlanUrl
                : null,
            studentGuideUrl: Object.hasOwn(
                materialData,
                'studentGuideUrl',
            )
                ? materialData.studentGuideUrl
                : null,
        });
    }

    /**
     * Converte um documento em uma representação pública e imutável.
     *
     * Identificadores internos, timestamps, métodos e propriedades adicionais
     * do Mongoose não atravessam a camada de aplicação.
     *
     * @param {unknown} material Documento devolvido pelo modelo.
     * @returns {Readonly<object>} Material mensal público.
     * @throws {TypeError} Quando o modelo devolve um documento inconsistente.
     */
    static createMonthlyMaterialRepresentation(material) {
        const hasValidDocument =
            material
            && material._id !== undefined
            && material._id !== null
            && isValidCalendarMonth(material.month)
            && (
                material.lessonPlanUrl === null
                || typeof material.lessonPlanUrl === 'string'
            )
            && (
                material.studentGuideUrl === null
                || typeof material.studentGuideUrl === 'string'
            );

        if (!hasValidDocument) {
            throw new TypeError(
                MONTHLY_MATERIAL_SERVICE_MESSAGES
                    .INVALID_MONTHLY_MATERIAL_DOCUMENT,
            );
        }

        return Object.freeze({
            id: String(material._id),
            month: material.month,
            lessonPlanUrl: material.lessonPlanUrl,
            studentGuideUrl: material.studentGuideUrl,
        });
    }

    /**
     * Reconstrói e protege uma lista inteira devolvida pelo modelo.
     *
     * @param {unknown} materials Resultado da consulta persistente.
     * @returns {ReadonlyArray<Readonly<object>>} Materiais mensais públicos.
     * @throws {TypeError} Quando o resultado não é uma lista válida.
     */
    static createMonthlyMaterialListRepresentation(materials) {
        if (!Array.isArray(materials)) {
            throw new TypeError(
                MONTHLY_MATERIAL_SERVICE_MESSAGES
                    .INVALID_MONTHLY_MATERIAL_LIST,
            );
        }

        try {
            return Object.freeze(
                materials.map((material) => (
                    MonthlyMaterialService
                        .createMonthlyMaterialRepresentation(material)
                )),
            );
        } catch (error) {
            if (error instanceof TypeError) {
                throw new TypeError(
                    MONTHLY_MATERIAL_SERVICE_MESSAGES
                        .INVALID_MONTHLY_MATERIAL_LIST,
                );
            }

            throw error;
        }
    }

    /**
     * Identifica falhas de entrada produzidas pela adaptação do Mongoose.
     *
     * `ValidationError` representa regras do schema; `CastError` pode ocorrer
     * antes da validação quando um campo recebe um tipo incompatível. Ambos
     * devem se tornar o mesmo erro público, sem detalhes internos.
     *
     * @param {unknown} error Falha recebida do modelo.
     * @returns {boolean} Verdadeiro para falhas causadas pelos dados.
     */
    static isModelInputError(error) {
        return (
            error instanceof Error
            && (
                error.name === 'ValidationError'
                || error.name === 'CastError'
            )
        );
    }

    /**
     * Lista todos os materiais mensais na ordem apresentada pelo protótipo.
     *
     * @returns {Promise<ReadonlyArray<Readonly<object>>>} Coleção pública.
     */
    async listMonthlyMaterials() {
        const materials = await this.#MonthlyMaterialModel
            .find(Object.freeze({}))
            .sort(MONTHLY_MATERIAL_SORT);

        return MonthlyMaterialService
            .createMonthlyMaterialListRepresentation(materials);
    }

    /**
     * Consulta o conjunto de links registrado para um mês.
     *
     * A ausência é um estado normal no protótipo e, portanto, retorna `null`
     * em vez de produzir um erro de recurso inexistente.
     *
     * @param {unknown} month Identidade mensal no formato YYYY-MM.
     * @returns {Promise<Readonly<object>|null>} Material público ou ausência.
     */
    async getMonthlyMaterial(month) {
        const preparedMonth =
            MonthlyMaterialService.prepareMonth(month);

        const material = await this.#MonthlyMaterialModel.findOne(
            Object.freeze({ month: preparedMonth }),
        );

        if (material === null) {
            return null;
        }

        return MonthlyMaterialService
            .createMonthlyMaterialRepresentation(material);
    }

    /**
     * Substitui os links mensais ou cria o recurso quando ele ainda não existe.
     *
     * O filtro pelo índice único e o `upsert` formam uma operação atômica. A
     * repetição da mesma chamada mantém o mesmo estado, comportamento esperado
     * de uma futura rota PUT.
     *
     * @param {unknown} month Identidade mensal no formato YYYY-MM.
     * @param {unknown} materialData Dois links opcionais do protótipo.
     * @returns {Promise<Readonly<object>>} Estado público persistido.
     */
    async saveMonthlyMaterial(month, materialData) {
        const preparedMonth =
            MonthlyMaterialService.prepareMonth(month);
        const preparedData =
            MonthlyMaterialService.prepareMaterialData(materialData);

        let savedMaterial;

        try {
            savedMaterial = await this.#MonthlyMaterialModel
                .findOneAndUpdate(
                    Object.freeze({ month: preparedMonth }),
                    Object.freeze({
                        $set: preparedData,
                    }),
                    MONTHLY_MATERIAL_UPDATE_OPTIONS,
                );
        } catch (error) {
            if (MonthlyMaterialService.isModelInputError(error)) {
                throw createInvalidMonthlyMaterialDataError();
            }

            throw error;
        }

        return MonthlyMaterialService
            .createMonthlyMaterialRepresentation(savedMaterial);
    }

    /**
     * Remove o recurso identificado pelo mês.
     *
     * A ausência permanece um resultado normal para que repetir a mesma
     * exclusão não produza falha. Quando existe documento, sua representação
     * pública é devolvida apenas à camada controladora.
     *
     * @param {unknown} month Identidade mensal no formato YYYY-MM.
     * @returns {Promise<Readonly<object>|null>} Material removido ou ausência.
     */
    async deleteMonthlyMaterial(month) {
        const preparedMonth =
            MonthlyMaterialService.prepareMonth(month);

        const deletedMaterial = await this.#MonthlyMaterialModel
            .findOneAndDelete(
                Object.freeze({ month: preparedMonth }),
            );

        if (deletedMaterial === null) {
            return null;
        }

        return MonthlyMaterialService
            .createMonthlyMaterialRepresentation(deletedMaterial);
    }
}

/**
 * Instância padrão utilizada pela composição real da aplicação.
 */
const monthlyMaterialService = new MonthlyMaterialService();

module.exports = {
    MONTHLY_MATERIAL_DATA_FIELDS,
    MONTHLY_MATERIAL_SERVICE_CODES,
    MONTHLY_MATERIAL_SERVICE_MESSAGES,
    MONTHLY_MATERIAL_SORT,
    MONTHLY_MATERIAL_UPDATE_OPTIONS,
    MonthlyMaterialService,
    monthlyMaterialService,
};
