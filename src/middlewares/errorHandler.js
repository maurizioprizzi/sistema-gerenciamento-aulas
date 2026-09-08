const { AppError } = require('../errors/AppError');

/**
 * Converte erros conhecidos produzidos pelos middlewares do Express em
 * AppError.
 *
 * O parser JSON atribui uma propriedade "type" aos erros. Utilizamos esses
 * identificadores estáveis em vez de comparar mensagens internas, que podem
 * mudar entre versões ou estar em outro idioma.
 *
 * @param {Error} error Erro recebido pelo Express.
 * @returns {Error | AppError} Erro original ou sua versão normalizada.
 */
function normalizeExpressError(error) {
    /**
     * O corpo declarou application/json, mas não contém JSON válido.
     */
    if (error?.type === 'entity.parse.failed') {
        return new AppError(
            'O corpo da requisição contém um JSON inválido.',
            {
                statusCode: 400,
                code: 'INVALID_JSON'
            }
        );
    }

    /**
     * O corpo ultrapassou o limite definido no express.json().
     */
    if (error?.type === 'entity.too.large') {
        return new AppError(
            'O corpo da requisição ultrapassa o limite permitido.',
            {
                statusCode: 413,
                code: 'PAYLOAD_TOO_LARGE'
            }
        );
    }

    return error;
}

/**
 * Cria um erro padronizado quando nenhuma rota atende a requisição.
 *
 * Este middleware não envia a resposta diretamente. Ele encaminha um
 * AppError para que toda resposta de erro seja produzida no mesmo lugar.
 *
 * @param {import('express').Request} request Requisição recebida.
 * @param {import('express').Response} response Resposta HTTP.
 * @param {import('express').NextFunction} next Próximo middleware.
 */
function notFoundHandler(request, response, next) {
    const error = new AppError(
        'O endereço solicitado não existe.',
        {
            statusCode: 404,
            code: 'ROUTE_NOT_FOUND'
        }
    );

    next(error);
}

/**
 * Cria o middleware responsável pela resposta final de erros.
 *
 * A função externa permite injetar um logger durante os testes. Essa é uma
 * aplicação simples de injeção de dependência: o middleware não fica
 * rigidamente preso ao console.
 *
 * @param {object} options Opções do middleware.
 * @param {{ error: Function }} [options.logger=console]
 * Serviço utilizado para registrar falhas inesperadas.
 *
 * @returns {import('express').ErrorRequestHandler}
 * Middleware de erro configurado.
 */
function createErrorHandler({ logger = console } = {}) {
    /**
     * O Express identifica um middleware de erro pela presença dos quatro
     * parâmetros. Mesmo que next não seja usado em todos os caminhos, ele não
     * deve ser removido da assinatura.
     */
    return function errorHandler(
        error,
        request,
        response,
        next
    ) {
        /**
         * Se outra parte da aplicação já começou a enviar a resposta, o
         * Express deve concluir seu tratamento padrão.
         *
         * Nesse caso, encaminhamos o erro original porque a normalização não
         * poderá mais alterar uma resposta que já começou.
         */
        if (response.headersSent) {
            next(error);
            return;
        }

        const normalizedError = normalizeExpressError(error);

        /**
         * AppError representa uma falha prevista e possui mensagem segura.
         * Qualquer outro Error é considerado inesperado.
         */
        if (
            normalizedError instanceof AppError
            && normalizedError.isOperational
        ) {
            const responseBody = {
                error: {
                    code: normalizedError.code,
                    message: normalizedError.message
                }
            };

            /**
             * Detalhes são incluídos somente quando foram explicitamente
             * definidos como seguros pela regra que criou o AppError.
             */
            if (normalizedError.details !== null) {
                responseBody.error.details =
                    normalizedError.details;
            }

            response
                .status(normalizedError.statusCode)
                .json(responseBody);

            return;
        }

        /**
         * O erro inesperado é registrado apenas no servidor.
         *
         * Não registramos corpo, cookies ou cabeçalhos da requisição para
         * reduzir o risco de gravar senhas ou outras informações privadas.
         */
        logger.error('Erro inesperado na aplicação.', {
            method: request.method,
            path: request.originalUrl,
            errorName:
                normalizedError?.name ?? 'UnknownError',
            message:
                normalizedError?.message ?? 'Erro sem mensagem',
            stack: normalizedError?.stack
        });

        /**
         * A resposta pública é propositalmente genérica. Stack trace, nome da
         * classe e mensagem técnica nunca são enviados ao navegador.
         */
        response.status(500).json({
            error: {
                code: 'INTERNAL_ERROR',
                message:
                    'Não foi possível concluir a operação.'
            }
        });
    };
}

module.exports = {
    notFoundHandler,
    createErrorHandler
};