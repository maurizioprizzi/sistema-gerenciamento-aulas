/**
 * Representa um erro conhecido e controlado pela aplicação.
 *
 * Exemplos futuros:
 * - aula não encontrada;
 * - credenciais inválidas;
 * - dados do formulário inválidos;
 * - acesso não autorizado.
 *
 * Erros inesperados de programação continuarão utilizando Error. Essa
 * distinção permitirá ao middleware decidir o que pode ser apresentado ao
 * usuário sem revelar detalhes internos.
 */
class AppError extends Error {
    /**
     * @param {string} message Mensagem segura para apresentar ao usuário.
     * @param {object} options Configurações adicionais do erro.
     * @param {number} [options.statusCode=500] Código HTTP da resposta.
     * @param {string} [options.code='INTERNAL_ERROR'] Código estável do erro.
     * @param {object[] | object | null} [options.details=null]
     * Detalhes seguros, normalmente produzidos por uma validação.
     */
    constructor(
        message,
        {
            statusCode = 500,
            code = 'INTERNAL_ERROR',
            details = null
        } = {}
    ) {
        /**
         * As verificações abaixo evitam a criação de erros inconsistentes.
         */
        if (typeof message !== 'string' || message.trim() === '') {
            throw new TypeError(
                'AppError exige uma mensagem não vazia.'
            );
        }

        if (
            !Number.isInteger(statusCode)
            || statusCode < 400
            || statusCode > 599
        ) {
            throw new RangeError(
                'statusCode deve ser um código HTTP entre 400 e 599.'
            );
        }

        if (
            typeof code !== 'string'
            || !/^[A-Z][A-Z0-9_]*$/.test(code)
        ) {
            throw new TypeError(
                'code deve utilizar letras maiúsculas, números e sublinhados.'
            );
        }

        super(message);

        this.name = 'AppError';
        this.statusCode = statusCode;
        this.code = code;
        this.details = details;

        /**
         * Erros desta classe são operacionais: representam situações
         * previstas e podem ser convertidos em uma resposta controlada.
         */
        this.isOperational = true;

        /**
         * Remove o próprio construtor do início da pilha de chamadas,
         * facilitando o diagnóstico durante o desenvolvimento.
         */
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, AppError);
        }
    }
}

module.exports = { AppError };