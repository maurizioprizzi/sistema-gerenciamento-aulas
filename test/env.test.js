'use strict';

const assert = require('node:assert/strict');
const {
    describe,
    test,
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
        PASSWORD_HASH_ROUNDS: '12',
        ADMIN_NAME: 'Dionísio Pereira',
        ADMIN_EMAIL: 'DIONISIO@EXAMPLE.COM',
        ADMIN_PASSWORD: 'senha-forte-de-teste',
        SESSION_HOURS: '8',
        APP_ORIGIN: 'http://localhost:3000',
        TRUST_PROXY: '0',
        ...overrides,
    };
}

describe('loadEnvironment', () => {
    test('carrega e normaliza uma configuração válida', () => {
        const environment = loadEnvironment(
            createValidEnvironment(),
        );

        assert.equal(environment.NODE_ENV, 'development');
        assert.equal(environment.HOST, '0.0.0.0');
        assert.equal(environment.PORT, '3000');
        assert.equal(
            environment.MONGODB_URI,
            'mongodb://127.0.0.1:27017/calendario_dionisio',
        );
        assert.equal(environment.ADMIN_NAME, 'Dionísio Pereira');

        /**
         * O e-mail deve ser normalizado para evitar contas duplicadas apenas
         * por diferença entre letras maiúsculas e minúsculas.
         */
        assert.equal(
            environment.ADMIN_EMAIL,
            'dionisio@example.com',
        );

        /**
         * Valores numéricos e booleanos chegam como texto pelo ambiente, mas
         * são convertidos para tipos apropriados.
         */
        assert.equal(environment.PASSWORD_HASH_ROUNDS, 12);
        assert.equal(environment.SESSION_HOURS, 8);
        assert.equal(environment.TRUST_PROXY, false);
        assert.equal(environment.IS_PRODUCTION, false);
        assert.equal(
            environment.SESSION_MAX_AGE_MS,
            8 * 60 * 60 * 1000,
        );
    });

    test('aplica os valores padrão aos campos opcionais', () => {
        const source = createValidEnvironment();

        delete source.NODE_ENV;
        delete source.HOST;
        delete source.PORT;
        delete source.PASSWORD_HASH_ROUNDS;
        delete source.SESSION_HOURS;
        delete source.TRUST_PROXY;

        const environment = loadEnvironment(source);

        assert.equal(environment.NODE_ENV, 'development');
        assert.equal(environment.HOST, '0.0.0.0');
        assert.equal(environment.PORT, '3000');
        assert.equal(environment.PASSWORD_HASH_ROUNDS, 12);
        assert.equal(environment.SESSION_HOURS, 8);
        assert.equal(environment.TRUST_PROXY, false);
    });

    test('identifica corretamente uma configuração de produção', () => {
        const environment = loadEnvironment(
            createValidEnvironment({
                NODE_ENV: 'production',
                APP_ORIGIN: 'https://calendario.example.com',
                TRUST_PROXY: '1',
            }),
        );

        assert.equal(environment.IS_PRODUCTION, true);
        assert.equal(environment.TRUST_PROXY, true);
    });

    test('retorna um objeto que não pode ser ampliado ou reconfigurado', () => {
        const environment = loadEnvironment(
            createValidEnvironment(),
        );

        assert.equal(Object.isFrozen(environment), true);
    });

    /**
     * Cada item contém:
     * - uma descrição clara do cenário;
     * - o campo que será substituído;
     * - o valor inválido;
     * - o nome que deve aparecer na mensagem de erro.
     */
    const invalidCases = [
        {
            description: 'NODE_ENV desconhecido',
            field: 'NODE_ENV',
            value: 'staging',
            expectedField: 'NODE_ENV',
        },
        {
            description: 'PORT com letras adicionais',
            field: 'PORT',
            value: '3000abc',
            expectedField: 'PORT',
        },
        {
            description: 'PORT com número fracionário',
            field: 'PORT',
            value: '3.14',
            expectedField: 'PORT',
        },
        {
            description: 'MONGODB_URI com protocolo incorreto',
            field: 'MONGODB_URI',
            value: 'https://example.com/database',
            expectedField: 'MONGODB_URI',
        },
        {
            description: 'SESSION_SECRET muito curto',
            field: 'SESSION_SECRET',
            value: 'segredo-curto',
            expectedField: 'SESSION_SECRET',
        },
        {
            description: 'PASSWORD_HASH_ROUNDS abaixo do mínimo',
            field: 'PASSWORD_HASH_ROUNDS',
            value: '9',
            expectedField: 'PASSWORD_HASH_ROUNDS',
        },
        {
            description: 'PASSWORD_HASH_ROUNDS acima do máximo',
            field: 'PASSWORD_HASH_ROUNDS',
            value: '16',
            expectedField: 'PASSWORD_HASH_ROUNDS',
        },
        {
            description: 'PASSWORD_HASH_ROUNDS fracionário',
            field: 'PASSWORD_HASH_ROUNDS',
            value: '10.5',
            expectedField: 'PASSWORD_HASH_ROUNDS',
        },
        {
            description: 'PASSWORD_HASH_ROUNDS não numérico',
            field: 'PASSWORD_HASH_ROUNDS',
            value: 'abc',
            expectedField: 'PASSWORD_HASH_ROUNDS',
        },
        {
            description: 'ADMIN_NAME muito curto',
            field: 'ADMIN_NAME',
            value: 'D',
            expectedField: 'ADMIN_NAME',
        },
        {
            description: 'ADMIN_EMAIL inválido',
            field: 'ADMIN_EMAIL',
            value: 'email-invalido',
            expectedField: 'ADMIN_EMAIL',
        },
        {
            description: 'ADMIN_PASSWORD muito curta',
            field: 'ADMIN_PASSWORD',
            value: 'curta',
            expectedField: 'ADMIN_PASSWORD',
        },
        {
            description: 'SESSION_HOURS abaixo do mínimo',
            field: 'SESSION_HOURS',
            value: '0',
            expectedField: 'SESSION_HOURS',
        },
        {
            description: 'SESSION_HOURS acima do máximo',
            field: 'SESSION_HOURS',
            value: '169',
            expectedField: 'SESSION_HOURS',
        },
        {
            description: 'SESSION_HOURS fracionário',
            field: 'SESSION_HOURS',
            value: '3.5',
            expectedField: 'SESSION_HOURS',
        },
        {
            description: 'APP_ORIGIN com protocolo não permitido',
            field: 'APP_ORIGIN',
            value: 'ftp://example.com',
            expectedField: 'APP_ORIGIN',
        },
        {
            description: 'TRUST_PROXY diferente de zero ou um',
            field: 'TRUST_PROXY',
            value: 'yes',
            expectedField: 'TRUST_PROXY',
        },
    ];

    for (const invalidCase of invalidCases) {
        test(`rejeita ${invalidCase.description}`, () => {
            const source = createValidEnvironment({
                [invalidCase.field]: invalidCase.value,
            });

            assert.throws(
                () => loadEnvironment(source),
                (error) => {
                    assert.equal(error instanceof Error, true);
                    assert.match(
                        error.message,
                        new RegExp(invalidCase.expectedField),
                    );

                    return true;
                },
            );
        });
    }

    test('aceita ADMIN_PASSWORD com exatamente 72 bytes', () => {
        const password = 'a'.repeat(72);

        assert.equal(Buffer.byteLength(password, 'utf8'), 72);

        const environment = loadEnvironment(
            createValidEnvironment({
                ADMIN_PASSWORD: password,
            }),
        );

        assert.equal(environment.ADMIN_PASSWORD, password);
    });

    test('rejeita ADMIN_PASSWORD maior que 72 bytes', () => {
        const password = 'a'.repeat(73);

        assert.equal(Buffer.byteLength(password, 'utf8'), 73);

        assert.throws(
            () => loadEnvironment(
                createValidEnvironment({
                    ADMIN_PASSWORD: password,
                }),
            ),
            (error) => {
                assert.match(error.message, /ADMIN_PASSWORD/);
                assert.match(error.message, /72 bytes/);

                return true;
            },
        );
    });

    test('considera bytes UTF-8 ao validar ADMIN_PASSWORD', () => {
        const passwordWith72Bytes = '🔐'.repeat(18);
        const passwordWith76Bytes = '🔐'.repeat(19);

        assert.equal(
            Buffer.byteLength(passwordWith72Bytes, 'utf8'),
            72,
        );
        assert.equal(
            Buffer.byteLength(passwordWith76Bytes, 'utf8'),
            76,
        );

        assert.doesNotThrow(
            () => loadEnvironment(
                createValidEnvironment({
                    ADMIN_PASSWORD: passwordWith72Bytes,
                }),
            ),
        );

        assert.throws(
            () => loadEnvironment(
                createValidEnvironment({
                    ADMIN_PASSWORD: passwordWith76Bytes,
                }),
            ),
            (error) => {
                assert.match(error.message, /ADMIN_PASSWORD/);
                assert.match(error.message, /72 bytes/);

                return true;
            },
        );
    });

    test('não inclui senhas recebidas na mensagem de erro', () => {
        const confidentialPassword =
            'esta-senha-nao-pode-aparecer-na-mensagem';

        const source = createValidEnvironment({
            ADMIN_PASSWORD: confidentialPassword,
            APP_ORIGIN: 'endereco-invalido',
        });

        assert.throws(
            () => loadEnvironment(source),
            (error) => {
                assert.doesNotMatch(
                    error.message,
                    new RegExp(confidentialPassword),
                );

                return true;
            },
        );
    });

    test('não revela uma senha que ultrapassa o limite do bcrypt', () => {
        const confidentialPassword =
            `segredo-confidencial-${'x'.repeat(80)}`;

        const source = createValidEnvironment({
            ADMIN_PASSWORD: confidentialPassword,
        });

        assert.throws(
            () => loadEnvironment(source),
            (error) => {
                assert.match(error.message, /ADMIN_PASSWORD/);
                assert.equal(
                    error.message.includes(confidentialPassword),
                    false,
                );

                return true;
            },
        );
    });
});