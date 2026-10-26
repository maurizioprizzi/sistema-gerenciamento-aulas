'use strict';

const mongoose = require('mongoose');

/**
 * Nome utilizado pelo Mongoose para registrar o modelo.
 */
const LESSON_MODEL_NAME = 'Lesson';

/**
 * Opções legadas de curso aceitas pelo contrato atual das aulas.
 *
 * Esta lista permanece durante a transição. O próximo marco substituirá
 * essas opções pelo vínculo com os identificadores do catálogo de cursos.
 */
const LESSON_COURSES = Object.freeze({
    APQSA: 'APQSA',
    TECMKT: 'TECMKT',
    TECADM: 'TECADM',
});

/**
 * Tipos de registro oferecidos pelo formulário original.
 *
 * Atividade e avaliação pertencem ao mesmo calendário das aulas. Por isso,
 * são representadas como tipos do registro em vez de modelos independentes.
 */
const LESSON_TYPES = Object.freeze({
    LESSON: 'Aula',
    ACTIVITY: 'Atividade',
    ASSESSMENT: 'Avaliação',
});

/**
 * Formato textual de uma data civil utilizado pelo campo HTML `date`.
 *
 * O valor permanece como texto para que 15 de setembro continue sendo o
 * mesmo dia em qualquer fuso horário utilizado pelo navegador ou servidor.
 */
const CALENDAR_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Normaliza textos obrigatórios do calendário.
 *
 * Espaços externos são removidos e sequências internas são reduzidas a um
 * espaço. Valores que não sejam texto seguem intactos para que o Mongoose
 * aplique sua própria validação de tipo.
 *
 * @param {unknown} value Valor recebido pelo schema.
 * @returns {unknown} Texto normalizado ou o valor original.
 */
function normalizeLessonText(value) {
    if (typeof value !== 'string') {
        return value;
    }

    return value.trim().replace(/\s+/g, ' ');
}

/**
 * Normaliza textos opcionais e representa a ausência com `null`.
 *
 * Essa convenção evita armazenar diferentes formas de ausência, como texto
 * vazio ou composto somente por espaços.
 *
 * @param {unknown} value Valor recebido pelo schema.
 * @returns {unknown} Texto normalizado, null ou o valor original.
 */
function normalizeOptionalLessonText(value) {
    if (typeof value !== 'string') {
        return value;
    }

    const normalizedValue = value.trim().replace(/\s+/g, ' ');

    return normalizedValue.length > 0
        ? normalizedValue
        : null;
}

/**
 * Confirma que o texto representa uma data civil existente.
 *
 * A expressão regular verifica o formato e a comparação dos componentes
 * rejeita datas impossíveis, como 31 de fevereiro. A construção em UTC é
 * usada somente para validar os componentes, sem alterar o valor armazenado.
 *
 * @param {unknown} value Data candidata no formato YYYY-MM-DD.
 * @returns {boolean} Verdadeiro somente para uma data civil válida.
 */
function isValidCalendarDate(value) {
    if (
        typeof value !== 'string'
        || !CALENDAR_DATE_PATTERN.test(value)
    ) {
        return false;
    }

    const [year, month, day] = value
        .split('-')
        .map(Number);

    if (year < 1 || month < 1 || month > 12 || day < 1) {
        return false;
    }

    const parsedDate = new Date(0);

    parsedDate.setUTCHours(0, 0, 0, 0);
    parsedDate.setUTCFullYear(year, month - 1, day);

    return (
        parsedDate.getUTCFullYear() === year
        && parsedDate.getUTCMonth() === month - 1
        && parsedDate.getUTCDate() === day
    );
}

/**
 * Valida os endereços dos materiais vinculados a uma aula.
 *
 * Somente HTTP e HTTPS são aceitos. Credenciais incorporadas ao endereço são
 * recusadas para evitar o armazenamento acidental de informações sensíveis.
 * Ausência de link continua válida porque os dois materiais são opcionais no
 * formulário original.
 *
 * @param {unknown} value Endereço candidato ou ausência de endereço.
 * @returns {boolean} Verdadeiro para ausência ou URL web segura.
 */
function isValidOptionalMaterialUrl(value) {
    if (value === null || value === undefined) {
        return true;
    }

    if (typeof value !== 'string' || value.length === 0) {
        return false;
    }

    try {
        const parsedUrl = new URL(value);

        return (
            ['http:', 'https:'].includes(parsedUrl.protocol)
            && parsedUrl.username === ''
            && parsedUrl.password === ''
        );
    } catch {
        return false;
    }
}

/**
 * Cria o schema de aulas e demais registros do calendário.
 *
 * Os nomes internos correspondem aos campos do protótipo da seguinte forma:
 * data/date, curso/course, uc/curricularUnit, tipo/type,
 * numero/lessonNumber, revisao/needsReview, linkPA/lessonPlanUrl e
 * linkGD/studentGuideUrl.
 *
 * Durante a integração com o catálogo, courseId recebe a identidade estável
 * do curso. O campo course ainda atende ao contrato anterior. A referência
 * permanece opcional nesta etapa para não interromper a aplicação antes da
 * atualização do serviço, da API e dos formulários. Quando courseId é informado,
 * a sigla antiga deixa de ser obrigatória: ela será lida do catálogo pelo
 * serviço. Ao concluir a integração, novas aulas deverão exigir courseId.
 *
 * O ref informa qual modelo poderá ser usado para carregar o curso; ele não
 * verifica sua existência nem sua situação ativa. Essas regras pertencem ao
 * serviço de aulas e serão aplicadas antes das gravações. Nenhuma consulta ou
 * alteração de banco ocorre apenas ao importar este arquivo.
 *
 * @param {typeof mongoose} mongooseClient Instância compatível com Mongoose.
 * @returns {mongoose.Schema} Schema configurado para o calendário.
 */
function createLessonSchema(mongooseClient = mongoose) {
    if (
        !mongooseClient
        || typeof mongooseClient.Schema !== 'function'
        || !mongooseClient.Schema.Types
        || !mongooseClient.Schema.Types.ObjectId
    ) {
        throw new TypeError(
            'Uma instância válida do Mongoose é necessária para criar o schema de aula.',
        );
    }

    const lessonSchema = new mongooseClient.Schema(
        {
            date: {
                type: String,
                required: [true, 'A data da aula é obrigatória.'],
                validate: {
                    validator: isValidCalendarDate,
                    message: 'A data da aula deve ser uma data válida no formato YYYY-MM-DD.',
                },
            },

            course: {
                type: String,
                required: [
                    function requiresLegacyCourse() {
                        /**
                         * Document e Query oferecem get(). Na atualização,
                         * ele lê courseId do $set; na criação, do documento.
                         * Assim, remover a sigla antiga exige um vínculo por
                         * identidade no estado novo enviado pelo serviço.
                         */
                        const courseId = this.get('courseId');
                        return courseId === undefined || courseId === null;
                    },
                    'O curso da aula é obrigatório.',
                ],
                enum: {
                    values: Object.values(LESSON_COURSES),
                    message: 'O curso informado não pertence ao calendário.',
                },
            },

            /**
             * Identidade do curso no catálogo da própria instalação.
             *
             * ObjectId pode receber sua representação hexadecimal textual.
             * Uma sigla não deve ser convertida em um curso automaticamente:
             * somente o identificador escolhido no catálogo poderá ser usado.
             * Editar nome ou sigla do curso preserva este vínculo; desativá-lo
             * também não remove nem modifica as aulas já registradas.
             */
            courseId: {
                type: mongooseClient.Schema.Types.ObjectId,
                ref: 'Course',
            },

            curricularUnit: {
                type: String,
                required: [true, 'A unidade curricular da aula é obrigatória.'],
                maxlength: [
                    120,
                    'A unidade curricular deve possuir no máximo 120 caracteres.',
                ],
                set: normalizeLessonText,
            },

            type: {
                type: String,
                enum: {
                    values: Object.values(LESSON_TYPES),
                    message: 'O tipo de registro da aula é inválido.',
                },
                default: LESSON_TYPES.LESSON,
            },

            lessonNumber: {
                type: String,
                maxlength: [
                    60,
                    'O número da aula deve possuir no máximo 60 caracteres.',
                ],
                default: null,
                set: normalizeOptionalLessonText,
            },

            needsReview: {
                type: Boolean,
                default: false,
            },

            lessonPlanUrl: {
                type: String,
                maxlength: [
                    2048,
                    'O link do plano de aula deve possuir no máximo 2048 caracteres.',
                ],
                default: null,
                set: normalizeOptionalLessonText,
                validate: {
                    validator: isValidOptionalMaterialUrl,
                    message: 'O link do plano de aula deve utilizar HTTP ou HTTPS.',
                },
            },

            studentGuideUrl: {
                type: String,
                maxlength: [
                    2048,
                    'O link do guia e das atividades deve possuir no máximo 2048 caracteres.',
                ],
                default: null,
                set: normalizeOptionalLessonText,
                validate: {
                    validator: isValidOptionalMaterialUrl,
                    message: 'O link do guia e das atividades deve utilizar HTTP ou HTTPS.',
                },
            },
        },
        {
            timestamps: true,
            versionKey: false,
        },
    );

    /**
     * O calendário consulta principalmente por data e curso. O índice mantém
     * essa leitura eficiente sem impor uma unicidade inexistente no protótipo:
     * o mesmo curso pode possuir mais de um registro no mesmo dia.
     */
    lessonSchema.index(
        {
            date: 1,
            course: 1,
        },
        {
            name: 'lessons_date_course',
        },
    );

    /**
     * Prepara a consulta das aulas de um curso por identidade e data.
     * O índice não é único: podem existir várias aulas do curso no mesmo dia.
     * Sua criação real no MongoDB será integrada ao ciclo do servidor; esta
     * declaração, isoladamente, não confirma que o índice já existe no banco.
     */
    lessonSchema.index(
        {
            courseId: 1,
            date: 1,
        },
        {
            name: 'lessons_course_id_date',
        },
    );

    return lessonSchema;
}

/**
 * Cria ou recupera o modelo Lesson.
 *
 * A fábrica evita registrar o mesmo modelo duas vezes e permite que os testes
 * utilizem instâncias isoladas do Mongoose sem conexão com o MongoDB.
 *
 * @param {typeof mongoose} mongooseClient Instância compatível com Mongoose.
 * @returns {mongoose.Model} Modelo de aula.
 */
function createLessonModel(mongooseClient = mongoose) {
    if (
        !mongooseClient
        || typeof mongooseClient.model !== 'function'
        || !mongooseClient.models
    ) {
        throw new TypeError(
            'Uma instância válida do Mongoose é necessária para criar o modelo de aula.',
        );
    }

    const existingModel = mongooseClient.models[LESSON_MODEL_NAME];

    if (existingModel) {
        return existingModel;
    }

    const lessonSchema = createLessonSchema(mongooseClient);

    return mongooseClient.model(
        LESSON_MODEL_NAME,
        lessonSchema,
    );
}

/**
 * Modelo utilizado pela aplicação quando não é necessária uma instância
 * isolada do Mongoose.
 */
const Lesson = createLessonModel();

module.exports = {
    CALENDAR_DATE_PATTERN,
    LESSON_COURSES,
    LESSON_TYPES,
    Lesson,
    createLessonModel,
    createLessonSchema,
    isValidCalendarDate,
    isValidOptionalMaterialUrl,
    normalizeLessonText,
    normalizeOptionalLessonText,
};
