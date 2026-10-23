'use strict';

const mongoose = require('mongoose');

const COURSE_MODEL_NAME = 'Course';

/**
 * Limites do cadastro de cursos. A sigla pode conter espaços ou sinais usados
 * pela instituição; ela não funciona como identificador técnico da relação.
 */
const COURSE_FIELD_LIMITS = Object.freeze({
    MIN_NAME_LENGTH: 2,
    MAX_NAME_LENGTH: 120,
    MIN_CODE_LENGTH: 1,
    MAX_CODE_LENGTH: 20,
});

/**
 * Normaliza o nome exibido, preservando acentos e a capitalização escolhida.
 * @param {unknown} value Valor recebido pelo Mongoose.
 * @returns {unknown} Nome normalizado ou valor original quando não for texto.
 */
function normalizeCourseName(value) {
    if (typeof value !== 'string') return value;

    return value.normalize('NFC').trim().replace(/\s+/g, ' ');
}

/**
 * Padroniza a sigla para evitar variações por caixa ou espaços repetidos.
 * NFC também torna equivalentes as representações Unicode do mesmo acento.
 * @param {unknown} value Valor recebido pelo Mongoose.
 * @returns {unknown} Sigla normalizada ou valor original.
 */
function normalizeCourseCode(value) {
    if (typeof value !== 'string') return value;

    return value.normalize('NFC').trim().replace(/\s+/g, ' ').toUpperCase();
}

/**
 * Define os cursos próprios de uma instalação individual.
 *
 * Cada curso possui identidade estável pelo _id. Nome e sigla poderão ser
 * editados; os futuros vínculos das aulas e turmas deverão usar essa identidade
 * para que uma edição não rompa o histórico. Turmas definirão turno e alunos;
 * salas e horários terão seus próprios dados nas etapas correspondentes.
 *
 * O estado active representa disponibilidade para novos registros. Desativar
 * um curso deverá mantê-lo no banco e preservar as aulas já vinculadas. Essa
 * regra será aplicada pelo serviço e pela API; um schema isolado não impede
 * exclusões diretas no banco nem altera o modelo de aulas existente.
 *
 * @param {typeof mongoose} mongooseClient Instância compatível com Mongoose.
 * @returns {mongoose.Schema} Schema do cadastro de cursos.
 */
function createCourseSchema(mongooseClient = mongoose) {
    if (!mongooseClient || typeof mongooseClient.Schema !== 'function') {
        throw new TypeError(
            'Uma instância válida do Mongoose é necessária para criar o schema de curso.',
        );
    }

    const courseSchema = new mongooseClient.Schema(
        {
            name: {
                type: String,
                required: [true, 'O nome do curso é obrigatório.'],
                minlength: [
                    COURSE_FIELD_LIMITS.MIN_NAME_LENGTH,
                    'O nome do curso deve possuir pelo menos 2 caracteres.',
                ],
                maxlength: [
                    COURSE_FIELD_LIMITS.MAX_NAME_LENGTH,
                    'O nome do curso deve possuir no máximo 120 caracteres.',
                ],
                set: normalizeCourseName,
            },

            code: {
                type: String,
                required: [true, 'A sigla do curso é obrigatória.'],
                minlength: [
                    COURSE_FIELD_LIMITS.MIN_CODE_LENGTH,
                    'A sigla do curso deve possuir pelo menos 1 caractere.',
                ],
                maxlength: [
                    COURSE_FIELD_LIMITS.MAX_CODE_LENGTH,
                    'A sigla do curso deve possuir no máximo 20 caracteres.',
                ],
                set: normalizeCourseCode,
            },

            active: {
                type: Boolean,
                required: [true, 'A situação do curso é obrigatória.'],
                default: true,
            },
        },
        {
            timestamps: true,
            versionKey: false,
            strict: 'throw',
        },
    );

    /**
     * A sigla identifica o curso na apresentação dessa instalação. O índice
     * inclui cursos desativados, evitando duplicação ao cadastrá-los de novo.
     * A restrição passa a valer quando o índice é criado no MongoDB; declarar
     * unique não substitui a preparação do banco nem a conversão de conflitos
     * em mensagens públicas pelo futuro serviço de cursos.
     */
    courseSchema.index(
        { code: 1 },
        { unique: true, name: 'courses_code_unique' },
    );

    return courseSchema;
}

/**
 * Cria ou reutiliza o modelo sem abrir conexão com recursos externos.
 * A injeção permite testar o contrato em uma instância isolada do Mongoose.
 * @param {typeof mongoose} mongooseClient Instância compatível com Mongoose.
 * @returns {mongoose.Model} Modelo de curso.
 */
function createCourseModel(mongooseClient = mongoose) {
    if (
        !mongooseClient
        || typeof mongooseClient.model !== 'function'
        || !mongooseClient.models
    ) {
        throw new TypeError(
            'Uma instância válida do Mongoose é necessária para criar o modelo de curso.',
        );
    }

    const existingModel = mongooseClient.models[COURSE_MODEL_NAME];
    if (existingModel) return existingModel;

    return mongooseClient.model(
        COURSE_MODEL_NAME,
        createCourseSchema(mongooseClient),
    );
}

const Course = createCourseModel();

module.exports = {
    COURSE_MODEL_NAME,
    COURSE_FIELD_LIMITS,
    Course,
    createCourseModel,
    createCourseSchema,
    normalizeCourseName,
    normalizeCourseCode,
};
