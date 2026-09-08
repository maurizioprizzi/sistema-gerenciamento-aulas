const assert = require('node:assert/strict');
const {
    describe,
    test
} = require('node:test');

const { resolvePort } = require('../src/server');

/**
 * Testes unitários da configuração do servidor.
 *
 * Diferentemente de app.test.js, estes testes não fazem requisições HTTP.
 * Eles exercitam diretamente uma função pequena e isolada.
 */
describe('resolvePort', () => {
    test('usa a porta 3000 quando PORT não foi informada', () => {
        const port = resolvePort(undefined);

        assert.equal(port, 3000);
    });

    test('converte uma porta válida recebida como texto', () => {
        const port = resolvePort('8080');

        assert.equal(port, 8080);
    });

    test('aceita os limites válidos de uma porta TCP', () => {
        assert.equal(resolvePort('1'), 1);
        assert.equal(resolvePort('65535'), 65535);
    });

    /**
     * Criamos um teste independente para cada entrada inválida.
     *
     * Dessa forma, o relatório mostra exatamente quais casos falharam em vez
     * de interromper toda a verificação no primeiro valor problemático.
     */
    const invalidValues = [
        '0',
        '-1',
        '65536',
        '',
        'abc',
        '3000abc',
        '3.14'
    ];

    for (const value of invalidValues) {
        test(`rejeita a porta inválida ${JSON.stringify(value)}`, () => {
            assert.throws(
                () => resolvePort(value),
                {
                    name: 'RangeError',
                    message:
                        'A variável PORT deve conter um número inteiro entre 1 e 65535.'
                }
            );
        });
    }
});