'use strict';

const assert = require('node:assert/strict');
const { describe, test } = require('node:test');

const { loadEnvironment } = require('../src/config/env');

/**
 * Configuração fictícia e completa para testar apenas o convite inicial.
 * Nenhum valor deste arquivo é usado na aplicação real.
 */
function createEnvironment(overrides = {}) {
    return {
        NODE_ENV: 'test',
        HOST: '127.0.0.1',
        PORT: '3000',
        MONGODB_URI: 'mongodb://127.0.0.1:27017/teste',
        SESSION_SECRET: 'segredo-ficticio-de-teste-com-tamanho-suficiente',
        ADMIN_NAME: 'Administrador de Teste',
        ADMIN_EMAIL: 'admin@example.com',
        ADMIN_PASSWORD: 'senha-ficticia-de-teste',
        SESSION_HOURS: '8',
        APP_ORIGIN: 'http://localhost:3000',
        TRUST_PROXY: '0',
        ...overrides,
    };
}

describe('configuração do convite inicial', () => {
    test('permite que o convite ainda não esteja configurado', () => {
        const environment = loadEnvironment(createEnvironment());

        assert.equal(environment.INITIAL_SETUP_TOKEN, undefined);
    });

    test('aceita um convite com 64 caracteres hexadecimais', () => {
        const token = 'aB'.repeat(32);
        const environment = loadEnvironment(
            createEnvironment({ INITIAL_SETUP_TOKEN: token }),
        );

        assert.equal(environment.INITIAL_SETUP_TOKEN, token);
        assert.equal(Object.isFrozen(environment), true);
    });

    test('rejeita um convite curto', () => {
        assert.throws(
            () => loadEnvironment(
                createEnvironment({ INITIAL_SETUP_TOKEN: 'a'.repeat(63) }),
            ),
            /INITIAL_SETUP_TOKEN/,
        );
    });

    test('rejeita caracteres que não são hexadecimais sem revelar o valor', () => {
        const invalidToken = 'g'.repeat(64);

        assert.throws(
            () => loadEnvironment(
                createEnvironment({
                    INITIAL_SETUP_TOKEN: invalidToken,
                }),
            ),
            (error) => {
                assert.match(error.message, /INITIAL_SETUP_TOKEN/);
                assert.equal(error.message.includes(invalidToken), false);
                return true;
            },
        );
    });
});