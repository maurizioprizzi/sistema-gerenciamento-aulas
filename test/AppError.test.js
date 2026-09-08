const assert = require('node:assert/strict');
const {
    describe,
    test
} = require('node:test');

const { AppError } = require('../src/errors/AppError');

describe('AppError', () => {
    test('é uma especialização da classe Error', () => {
        const error = new AppError('Ocorreu um erro conhecido.');

        assert.equal(error instanceof Error, true);
        assert.equal(error instanceof AppError, true);
        assert.equal(error.name, 'AppError');
    });

    test('utiliza valores padrão seguros', () => {
        const error = new AppError(
            'Não foi possível concluir a operação.'
        );

        assert.equal(error.message, 'Não foi possível concluir a operação.');
        assert.equal(error.statusCode, 500);
        assert.equal(error.code, 'INTERNAL_ERROR');
        assert.equal(error.details, null);
        assert.equal(error.isOperational, true);
    });

    test('preserva código, estado HTTP e detalhes informados', () => {
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

        assert.equal(error.statusCode, 422);
        assert.equal(error.code, 'VALIDATION_ERROR');
        assert.deepEqual(error.details, details);
    });

    test('rejeita mensagens vazias ou que não sejam texto', () => {
        const invalidMessages = [
            '',
            '   ',
            null,
            undefined,
            123
        ];

        for (const message of invalidMessages) {
            assert.throws(
                () => new AppError(message),
                {
                    name: 'TypeError',
                    message: 'AppError exige uma mensagem não vazia.'
                }
            );
        }
    });

    test('rejeita códigos HTTP fora do intervalo de erros', () => {
        const invalidStatusCodes = [
            200,
            399,
            600,
            401.5,
            '404'
        ];

        for (const statusCode of invalidStatusCodes) {
            assert.throws(
                () => new AppError(
                    'Erro de teste.',
                    { statusCode }
                ),
                {
                    name: 'RangeError',
                    message:
                        'statusCode deve ser um código HTTP entre 400 e 599.'
                }
            );
        }
    });

    test('rejeita códigos internos fora do padrão estabelecido', () => {
        const invalidCodes = [
            '',
            'not_found',
            'NOT-FOUND',
            '1_INVALID',
            'ERRO COM ESPAÇO'
        ];

        for (const code of invalidCodes) {
            assert.throws(
                () => new AppError(
                    'Erro de teste.',
                    { code }
                ),
                {
                    name: 'TypeError',
                    message:
                        'code deve utilizar letras maiúsculas, números e sublinhados.'
                }
            );
        }
    });
});