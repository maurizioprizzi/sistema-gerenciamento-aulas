const assert = require('node:assert/strict');
const {
    describe,
    test
} = require('node:test');

const { loadEnvironment } = require('../src/config/env');

/**
 * Cria um conjunto completo de variáveis válidas.
 *
 * Cada teste pode sobrescrever somente o campo que deseja analisar, evitando
 * repetição e mantendo clara a causa de uma eventual falha.
 *
 * @param {Record<string, string>} overrides Campos que serão substituídos.
 * @returns {Record<string, string>} Ambiente de teste completo.
 */
function createValidEnvironment(overrides = {}) {
    return {
        NODE_ENV: 'development',
        HOST: '0.0.0.0',
        PORT: '3000',
        MONGODB_URI:
            'mongodb://127.0.0.1:27017/calendario_dionisio',
        SESSION_SECRET:
            'segredo-de-teste-com-mais-de-trinta-e-dois-caracteres',
        ADMIN_NAME: 'Dionísio Pereira',
        ADMIN_EMAIL: 'DIONISIO@EXAMPLE.COM',
        ADMIN_PASSWORD: 'senha-forte-de-teste',
        SESSION_HOURS: '8',
        APP_ORIGIN: 'http://localhost:3000',
        TRUST_PROXY: '0',
        ...overrides
    };
}

describe('loadEnvironment', () => {
    test('carrega e normaliza uma configuração válida', () => {
        const environment = loadEnvironment(
            createValidEnvironment()
        );

        assert.equal(environment.NODE_ENV, 'development');
        assert.equal(environment.HOST, '0.0.0.0');
        assert.equal(environment.PORT, '3000');
        assert.equal(
            environment.MONGODB_URI,
            'mongodb://127.0.0.1:27017/calendario_dionisio'
        );
        assert.equal(environment.ADMIN_NAME, 'Dionísio Pereira');

        /**
         * O e-mail deve ser normalizado para evitar contas duplicadas apenas
         * por diferença entre letras maiúsculas e minúsculas.
         */
        assert.equal(
            environment.ADMIN_EMAIL,
            'dionisio@example.com'
        );

        /**
         * Valores numéricos e booleanos chegam como texto pelo ambiente, mas
         * são convertidos para tipos apropriados.
         */
        assert.equal(environment.SESSION_HOURS, 8);
        assert.equal(environment.TRUST_PROXY, false);
        assert.equal(environment.IS_PRODUCTION, false);
        assert.equal(
            environment.SESSION_MAX_AGE_MS,
            8 * 60 * 60 * 1000
        );
    });

    test('aplica os valores padrão aos campos opcionais', () => {
        const source = createValidEnvironment();

        delete source.NODE_ENV;
        delete source.HOST;
        delete source.PORT;
        delete source.SESSION_HOURS;
        delete source.TRUST_PROXY;

        const environment = loadEnvironment(source);

        assert.equal(environment.NODE_ENV, 'development');
        assert.equal(environment.HOST, '0.0.0.0');
        assert.equal(environment.PORT, '3000');
        assert.equal(environment.SESSION_HOURS, 8);
        assert.equal(environment.TRUST_PROXY, false);
    });

    test('identifica corretamente uma configuração de produção', () => {
        const environment = loadEnvironment(
            createValidEnvironment({
                NODE_ENV: 'production',
                APP_ORIGIN: 'https://calendario.example.com',
                TRUST_PROXY: '1'
            })
        );

        assert.equal(environment.IS_PRODUCTION, true);
        assert.equal(environment.TRUST_PROXY, true);
    });

    test('retorna um objeto que não pode ser ampliado ou reconfigurado', () => {
        const environment = loadEnvironment(
            createValidEnvironment()
        );

        assert.equal(Object.isFrozen(environment), true);
    });

    /**
     * Cada item contém:
     * - o campo que será substituído;
     * - o valor inválido;
     * - o nome que deve aparecer na mensagem de erro.
     */
    const invalidCases = [
        {
            field: 'NODE_ENV',
            value: 'staging',
            expectedField: 'NODE_ENV'
        },
        {
            field: 'PORT',
            value: '3000abc',
            expectedField: 'PORT'
        },
        {
            field: 'PORT',
            value: '3.14',
            expectedField: 'PORT'
        },
        {
            field: 'MONGODB_URI',
            value: 'https://example.com/database',
            expectedField: 'MONGODB_URI'
        },
        {
            field: 'SESSION_SECRET',
            value: 'segredo-curto',
            expectedField: 'SESSION_SECRET'
        },
        {
            field: 'ADMIN_NAME',
            value: 'D',
            expectedField: 'ADMIN_NAME'
        },
        {
            field: 'ADMIN_EMAIL',
            value: 'email-invalido',
            expectedField: 'ADMIN_EMAIL'
        },
        {
            field: 'ADMIN_PASSWORD',
            value: 'curta',
            expectedField: 'ADMIN_PASSWORD'
        },
        {
            field: 'SESSION_HOURS',
            value: '0',
            expectedField: 'SESSION_HOURS'
        },
        {
            field: 'SESSION_HOURS',
            value: '169',
            expectedField: 'SESSION_HOURS'
        },
        {
            field: 'SESSION_HOURS',
            value: '3.5',
            expectedField: 'SESSION_HOURS'
        },
        {
            field: 'APP_ORIGIN',
            value: 'ftp://example.com',
            expectedField: 'APP_ORIGIN'
        },
        {
            field: 'TRUST_PROXY',
            value: 'yes',
            expectedField: 'TRUST_PROXY'
        }
    ];

    for (const invalidCase of invalidCases) {
        test(
            `rejeita ${invalidCase.field} com valor inválido`,
            () => {
                const source = createValidEnvironment({
                    [invalidCase.field]: invalidCase.value
                });

                assert.throws(
                    () => loadEnvironment(source),
                    (error) => {
                        assert.equal(error instanceof Error, true);
                        assert.match(
                            error.message,
                            new RegExp(invalidCase.expectedField)
                        );

                        return true;
                    }
                );
            }
        );
    }

    test('não inclui senhas recebidas na mensagem de erro', () => {
        const confidentialPassword =
            'esta-senha-nao-pode-aparecer-na-mensagem';

        const source = createValidEnvironment({
            ADMIN_PASSWORD: confidentialPassword,
            APP_ORIGIN: 'endereco-invalido'
        });

        assert.throws(
            () => loadEnvironment(source),
            (error) => {
                assert.doesNotMatch(
                    error.message,
                    new RegExp(confidentialPassword)
                );

                return true;
            }
        );
    });
});