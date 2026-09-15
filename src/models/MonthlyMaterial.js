'use strict';

const mongoose = require('mongoose');

const {
    isValidOptionalMaterialUrl,
} = require('./Lesson');

/**
 * Nome utilizado pelo Mongoose para registrar o modelo.
 */
const MONTHLY_MATERIAL_MODEL_NAME = 'MonthlyMaterial';

/**
 * Formato textual produzido pelo campo HTML `month` do protótipo.
 */
const CALENDAR_MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

/**
 * Normaliza um endereço opcional de material.
 *
 * Somente espaços externos são removidos. Um endereço vazio é transformado
 * em null para que a ausência tenha uma representação única no banco.
 * Caracteres internos não são alterados silenciosamente: a validação seguinte
 * decidirá se o endereço resultante é aceitável.
 *
 * @param {unknown} value Endereço recebido pelo Mongoose.
 * @returns {unknown} Endereço normalizado, null ou o valor original.
 */
function normalizeOptionalMaterialUrl(value) {
    if (typeof value !== 'string') {
        return value;
    }

    const normalizedValue = value.trim();

    return normalizedValue.length > 0
        ? normalizedValue
        : null;
}

/**
 * Confirma que o valor representa um mês civil existente.
 *
 * O padrão já restringe o mês ao intervalo entre 01 e 12. A verificação do
 * ano impede que `0000` seja aceito como um período real do calendário.
 *
 * @param {unknown} value Mês candidato no formato YYYY-MM.
 * @returns {boolean} Verdadeiro somente para um mês civil válido.
 */
function isValidCalendarMonth(value) {
    if (
        typeof value !== 'string'
        || !CALENDAR_MONTH_PATTERN.test(value)
    ) {
        return false;
    }

    const year = Number(value.slice(0, 4));

    return year >= 1;
}

/**
 * Cria o schema dos materiais aplicáveis a um mês inteiro.
 *
 * O protótipo mantém somente o mês e os links do Plano de Aula (PA) e do Guia
 * com Atividades do Discente (GD+AD). Os dois links permanecem opcionais para
 * conservar o mesmo contrato do formulário original.
 *
 * @param {typeof mongoose} mongooseClient Instância compatível com Mongoose.
 * @returns {mongoose.Schema} Schema configurado para materiais mensais.
 */
function createMonthlyMaterialSchema(mongooseClient = mongoose) {
    if (
        !mongooseClient
        || typeof mongooseClient.Schema !== 'function'
    ) {
        throw new TypeError(
            'Uma instância válida do Mongoose é necessária para criar o schema de material mensal.',
        );
    }

    const monthlyMaterialSchema = new mongooseClient.Schema(
        {
            month: {
                type: String,
                required: [
                    true,
                    'O mês do material é obrigatório.',
                ],
                validate: {
                    validator: isValidCalendarMonth,
                    message:
                        'O mês do material deve utilizar o formato YYYY-MM.',
                },
            },

            lessonPlanUrl: {
                type: String,
                maxlength: [
                    2048,
                    'O link mensal do plano de aula deve possuir no máximo 2048 caracteres.',
                ],
                default: null,
                set: normalizeOptionalMaterialUrl,
                validate: {
                    validator: isValidOptionalMaterialUrl,
                    message:
                        'O link mensal do plano de aula deve utilizar HTTP ou HTTPS.',
                },
            },

            studentGuideUrl: {
                type: String,
                maxlength: [
                    2048,
                    'O link mensal do guia e das atividades deve possuir no máximo 2048 caracteres.',
                ],
                default: null,
                set: normalizeOptionalMaterialUrl,
                validate: {
                    validator: isValidOptionalMaterialUrl,
                    message:
                        'O link mensal do guia e das atividades deve utilizar HTTP ou HTTPS.',
                },
            },
        },
        {
            timestamps: true,
            versionKey: false,
        },
    );

    /**
     * A busca do protótipo escolhe um material pelo mês da aula. Permitir dois
     * documentos para o mesmo período tornaria essa escolha ambígua. O índice
     * único transfere ao banco a garantia de um conjunto mensal determinístico.
     */
    monthlyMaterialSchema.index(
        { month: 1 },
        {
            unique: true,
            name: 'monthly_materials_month_unique',
        },
    );

    return monthlyMaterialSchema;
}

/**
 * Cria ou recupera o modelo MonthlyMaterial.
 *
 * A fábrica permite validar o modelo em uma instância isolada do Mongoose e
 * evita registrar o mesmo nome mais de uma vez durante reinicializações.
 *
 * @param {typeof mongoose} mongooseClient Instância compatível com Mongoose.
 * @returns {mongoose.Model} Modelo de material mensal.
 */
function createMonthlyMaterialModel(mongooseClient = mongoose) {
    if (
        !mongooseClient
        || typeof mongooseClient.model !== 'function'
        || !mongooseClient.models
    ) {
        throw new TypeError(
            'Uma instância válida do Mongoose é necessária para criar o modelo de material mensal.',
        );
    }

    const existingModel =
        mongooseClient.models[MONTHLY_MATERIAL_MODEL_NAME];

    if (existingModel) {
        return existingModel;
    }

    const monthlyMaterialSchema =
        createMonthlyMaterialSchema(mongooseClient);

    return mongooseClient.model(
        MONTHLY_MATERIAL_MODEL_NAME,
        monthlyMaterialSchema,
    );
}

/**
 * Modelo utilizado normalmente pela aplicação.
 */
const MonthlyMaterial = createMonthlyMaterialModel();

module.exports = {
    CALENDAR_MONTH_PATTERN,
    MonthlyMaterial,
    createMonthlyMaterialModel,
    createMonthlyMaterialSchema,
    isValidCalendarMonth,
    normalizeOptionalMaterialUrl,
};
