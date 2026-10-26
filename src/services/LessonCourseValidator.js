'use strict';

const { AppError } = require('../errors/AppError');
const { Course } = require('../models/Course');
const {
    COURSE_ID_PATTERN,
    CourseService,
} = require('./CourseService');

/** Códigos da escolha de um curso para uma aula, distintos dos do catálogo. */
const LESSON_COURSE_CODES = Object.freeze({
    INVALID_ID: 'INVALID_LESSON_COURSE_ID',
    NOT_FOUND: 'LESSON_COURSE_NOT_FOUND',
    INACTIVE: 'LESSON_COURSE_INACTIVE',
});

/** Mensagens públicas não incluem identificadores ou detalhes do banco. */
const LESSON_COURSE_MESSAGES = Object.freeze({
    INVALID_MODEL:
        'Um modelo de curso com consulta por identificador é necessário para validar a aula.',
    INVALID_ID:
        'Selecione um curso válido para a aula.',
    NOT_FOUND:
        'O curso selecionado não foi encontrado. Atualize a lista de cursos.',
    INACTIVE:
        'O curso selecionado está desativado. Escolha um curso ativo.',
    INVALID_PREVIOUS_ID:
        'O vínculo anterior da aula possui um identificador de curso inválido.',
    INVALID_DOCUMENT:
        'O modelo retornou um curso incompatível com a consulta da aula.',
});

/**
 * Valida o identificador recebido do formulário antes de consultar o banco.
 * Não aceita objetos, operadores, siglas ou espaços ao redor do identificador.
 * @param {unknown} value Identificador textual do curso escolhido.
 * @returns {string} Identificador hexadecimal em letras minúsculas.
 */
function prepareSelectedCourseId(value) {
    if (typeof value !== 'string' || !COURSE_ID_PATTERN.test(value)) {
        throw new AppError(LESSON_COURSE_MESSAGES.INVALID_ID, {
            statusCode: 400,
            code: LESSON_COURSE_CODES.INVALID_ID,
        });
    }
    return value.toLowerCase();
}

/**
 * Decide se o curso pode ser associado a uma aula.
 *
 * Uma aula nova exige curso ativo. Uma edição pode manter o curso desativado
 * que já estava vinculado àquela aula, mas não pode selecionar outro curso
 * desativado. Nome e sigla são lidos do catálogo e não definem a identidade.
 *
 * Esta classe consulta somente o modelo de cursos. Não grava aulas, não altera
 * a situação dos cursos e não exclui dados. A construção não executa consultas
 * nem abre conexão. O serviço de aulas será responsável por chamá-la antes de
 * gravar e por entregar o vínculo anterior obtido do próprio banco.
 *
 * A decisão corresponde ao estado lido na consulta. Sua integração à escrita
 * deverá tratar alterações concorrentes da aula; esta validação isolada não
 * constitui uma transação entre os documentos de curso e de aula.
 */
class LessonCourseValidator {
    #CourseModel;

    /**
     * @param {object} [dependencies={}] Dependências para consulta.
     * @param {object} [dependencies.CourseModel=Course] Modelo com findById.
     */
    constructor({ CourseModel = Course } = {}) {
        if (!CourseModel || typeof CourseModel.findById !== 'function') {
            throw new TypeError(LESSON_COURSE_MESSAGES.INVALID_MODEL);
        }

        this.#CourseModel = CourseModel;
        this.validateForCreation = this.validateForCreation.bind(this);
        this.validateForUpdate = this.validateForUpdate.bind(this);
        Object.freeze(this);
    }

    /**
     * Consulta novamente em cada operação, sem guardar situação ou sigla.
     * Falhas de conexão e de programação seguem para o tratamento central.
     * Somente null representa ausência; uma resposta inconsistente não deve
     * produzir uma decisão de sucesso nem ser confundida com curso ausente.
     * @param {string} preparedId Identificador já validado.
     * @returns {Promise<Readonly<object>>} id, name, code e active do catálogo.
     */
    async #readCourse(preparedId) {
        const document = await this.#CourseModel.findById(preparedId);

        if (document === null) {
            throw new AppError(LESSON_COURSE_MESSAGES.NOT_FOUND, {
                statusCode: 404,
                code: LESSON_COURSE_CODES.NOT_FOUND,
            });
        }

        // Reutiliza o contrato público do catálogo, sem duplicar seus limites.
        const course = CourseService.createCourseRepresentation(document);
        if (course.id !== preparedId) {
            throw new TypeError(LESSON_COURSE_MESSAGES.INVALID_DOCUMENT);
        }
        return course;
    }

    /**
     * @param {unknown} courseId Identificador selecionado para uma nova aula.
     * @returns {Promise<Readonly<object>>} Curso ativo validado para associação.
     */
    async validateForCreation(courseId) {
        const preparedId = prepareSelectedCourseId(courseId);
        const course = await this.#readCourse(preparedId);

        if (!course.active) {
            throw new AppError(LESSON_COURSE_MESSAGES.INACTIVE, {
                statusCode: 409,
                code: LESSON_COURSE_CODES.INACTIVE,
            });
        }
        return course;
    }

    /**
     * Valida uma manutenção ou troca de curso durante a edição da aula.
     *
     * previousCourseId é interno: o serviço deve obtê-lo da aula persistida,
     * convertendo ObjectId para texto. Nunca deve usar um valor enviado pelo
     * navegador como prova de que a aula já pertencia a um curso desativado.
     * null ou undefined representam uma aula ainda sem vínculo pelo catálogo;
     * nesse caso, a associação exige curso ativo, como em uma criação.
     *
     * @param {unknown} courseId Identificador escolhido para a edição.
     * @param {string|null} [previousCourseId=null] Identidade anteriormente salva.
     * @returns {Promise<Readonly<object>>} Curso validado para essa edição.
     */
    async validateForUpdate(courseId, previousCourseId = null) {
        const preparedId = prepareSelectedCourseId(courseId);
        let previousId = null;

        if (previousCourseId !== null) {
            if (
                typeof previousCourseId !== 'string'
                || !COURSE_ID_PATTERN.test(previousCourseId)
            ) {
                throw new TypeError(LESSON_COURSE_MESSAGES.INVALID_PREVIOUS_ID);
            }
            previousId = previousCourseId.toLowerCase();
        }

        const course = await this.#readCourse(preparedId);
        if (!course.active && course.id !== previousId) {
            throw new AppError(LESSON_COURSE_MESSAGES.INACTIVE, {
                statusCode: 409,
                code: LESSON_COURSE_CODES.INACTIVE,
            });
        }
        return course;
    }
}

module.exports = {
    LESSON_COURSE_CODES,
    LESSON_COURSE_MESSAGES,
    LessonCourseValidator,
};
