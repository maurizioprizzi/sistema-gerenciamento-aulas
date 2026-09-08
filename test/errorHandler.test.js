const assert = require('node:assert/strict');
const {
    describe,
    test
} = require('node:test');

const { AppError } = require('../src/errors/AppError');
const {
    notFoundHandler,
    createErrorHandler
} = require('../src/middlewares/errorHandler');

/**
 * Cria uma resposta Express simplificada para os testes unitários.
 *
 * Implementamos somente os recursos utilizados pelo middleware:
 * - headersSent;
 * - status();
 * - json().
 *
 * @param {object} options Configuração da resposta simulada.
 * @param {boolean} [options.headersSent=false]
 * Indica se a resposta já começou a ser enviada.
 *
 * @returns {object} Resposta simulada.
 */
function createResponse({ headersSent = false } = {}) {
    return {
        headersSent,
        statusCode: null,
        body: null,

        status(statusCode) {
            this.statusCode = statusCode;
            return this;
        },

        json(body) {
            this.body = body;
            return this;
        }
    };
}

/**
 * Cria um logger controlado pelo teste.
 *
 * Em vez de escrever no terminal, ele guarda as chamadas recebidas.
 *
 * @returns {{ calls: Array, error: Function }} Logger simulado.
 */
function createLogger() {
    return {
        calls: [],

        error(...argumentsReceived) {
            this.calls.push(argumentsReceived);
        }
    };
}

/**
 * Informações mínimas de uma requisição utilizadas nos registros internos.
 */
function createRequest() {
    return {
        method: 'GET',
        originalUrl: '/api/teste'
    };
}

describe('notFoundHandler', () => {
    test('encaminha um AppError de rota inexistente', () => {
        let capturedError = null;

        notFoundHandler(
            createRequest(),
            createResponse(),
            (error) => {
                capturedError = error;
            }
        );

        assert.equal(capturedError instanceof AppError, true);
        assert.equal(capturedError.statusCode, 404);
        assert.equal(capturedError.code, 'ROUTE_NOT_FOUND');
        assert.equal(
            capturedError.message,
            'O endereço solicitado não existe.'
        );
    });
});

describe('createErrorHandler', () => {
    test('transforma um AppError em resposta JSON', () => {
        const logger = createLogger();
        const response = createResponse();
        const middleware = createErrorHandler({ logger });

        const error = new AppError(
            'Aula não encontrada.',
            {
                statusCode: 404,
                code: 'LESSON_NOT_FOUND'
            }
        );

        middleware(
            error,
            createRequest(),
            response,
            () => {}
        );

        assert.equal(response.statusCode, 404);
        assert.deepEqual(response.body, {
            error: {
                code: 'LESSON_NOT_FOUND',
                message: 'Aula não encontrada.'
            }
        });

        /**
         * Situações operacionais já são conhecidas e não precisam poluir o
         * registro de falhas inesperadas.
         */
        assert.equal(logger.calls.length, 0);
    });

    test('inclui detalhes explicitamente seguros', () => {
        const response = createResponse();
        const middleware = createErrorHandler({
            logger: createLogger()
        });

        const details = [
            {
                field: 'date',
                message: 'Informe uma data válida.'
            }
        ];

        const error = new AppError(
            'Revise os campos informados.',
            {
                statusCode: 422,
                code: 'VALIDATION_ERROR',
                details
            }
        );

        middleware(
            error,
            createRequest(),
            response,
            () => {}
        );

        assert.equal(response.statusCode, 422);
        assert.deepEqual(response.body, {
            error: {
                code: 'VALIDATION_ERROR',
                message: 'Revise os campos informados.',
                details
            }
        });
    });

    test('oculta a mensagem de um erro inesperado', () => {
        const logger = createLogger();
        const response = createResponse();
        const middleware = createErrorHandler({ logger });

        const confidentialMessage =
            'Falha interna contendo informação confidencial';

        middleware(
            new Error(confidentialMessage),
            createRequest(),
            response,
            () => {}
        );

        assert.equal(response.statusCode, 500);
        assert.deepEqual(response.body, {
            error: {
                code: 'INTERNAL_ERROR',
                message: 'Não foi possível concluir a operação.'
            }
        });

        /**
         * O navegador recebe uma mensagem genérica.
         */
        assert.equal(
            JSON.stringify(response.body).includes(
                confidentialMessage
            ),
            false
        );

        /**
         * O servidor ainda registra a falha para permitir diagnóstico.
         */
        assert.equal(logger.calls.length, 1);
        assert.equal(
            logger.calls[0][0],
            'Erro inesperado na aplicação.'
        );
        assert.equal(
            logger.calls[0][1].message,
            confidentialMessage
        );
    });

    test('delega ao Express quando os cabeçalhos já foram enviados', () => {
        const logger = createLogger();
        const response = createResponse({
            headersSent: true
        });
        const middleware = createErrorHandler({ logger });
        const originalError = new Error('Conexão interrompida');

        let delegatedError = null;

        middleware(
            originalError,
            createRequest(),
            response,
            (error) => {
                delegatedError = error;
            }
        );

        assert.equal(delegatedError, originalError);
        assert.equal(response.statusCode, null);
        assert.equal(response.body, null);
        assert.equal(logger.calls.length, 0);
    });
});