'use strict';

const assert = require('node:assert/strict');
const { describe, test } = require('node:test');
const { loadEnvironment } = require('../src/config/env');

/**
 * Configuração fictícia, sem leitura do .env e sem conexão ao banco.
 * A disponibilidade efetiva do cadastro não é decidida neste módulo.
 */
function configuration(overrides = {}) {
    return {
        NODE_ENV: 'test',
        MONGODB_URI: 'mongodb://127.0.0.1:27017/teste_configuracao',
        SESSION_SECRET: 'segredo-ficticio-de-configuracao-com-tamanho-suficiente',
        APP_ORIGIN: 'http://localhost:3000',
        ...overrides,
    };
}

const ADMIN_FIELDS = Object.freeze(['ADMIN_NAME', 'ADMIN_EMAIL', 'ADMIN_PASSWORD']);
const ADMIN = Object.freeze({
    ADMIN_NAME: '  Ana Silva  ',
    ADMIN_EMAIL: ' ANA@EXAMPLE.COM ',
    ADMIN_PASSWORD: '  senha-ficticia-de-teste  ',
});
const TOKEN = 'ab'.repeat(32);

describe('grupo opcional de credenciais administrativas', () => {
    test('aceita ausência dos três campos sem preencher credenciais padrão', () => {
        const environment = loadEnvironment(configuration());
        for (const field of ADMIN_FIELDS) assert.equal(environment[field], undefined);
        assert.equal(environment.HAS_ADMIN_BOOTSTRAP_CREDENTIALS, false);
        assert.equal(environment.INITIAL_SETUP_TOKEN, undefined);
        assert.equal(Object.isFrozen(environment), true);
    });

    test('aceita convite sem credenciais administrativas predefinidas', () => {
        const environment = loadEnvironment(configuration({ INITIAL_SETUP_TOKEN: TOKEN }));
        assert.equal(environment.HAS_ADMIN_BOOTSTRAP_CREDENTIALS, false);
        assert.equal(environment.INITIAL_SETUP_TOKEN, TOKEN);
        for (const field of ADMIN_FIELDS) assert.equal(environment[field], undefined);
    });

    test('mantém normalização e preserva integralmente a senha do grupo completo', () => {
        const environment = loadEnvironment(configuration(ADMIN));
        assert.equal(environment.HAS_ADMIN_BOOTSTRAP_CREDENTIALS, true);
        assert.equal(environment.ADMIN_NAME, 'Ana Silva');
        assert.equal(environment.ADMIN_EMAIL, 'ana@example.com');
        assert.equal(environment.ADMIN_PASSWORD, ADMIN.ADMIN_PASSWORD);
    });

    test('permite coexistência do grupo completo e convite sem escolher um fluxo', () => {
        const environment = loadEnvironment(configuration({ ...ADMIN, INITIAL_SETUP_TOKEN: TOKEN }));
        assert.equal(environment.HAS_ADMIN_BOOTSTRAP_CREDENTIALS, true);
        assert.equal(environment.INITIAL_SETUP_TOKEN, TOKEN);
        assert.equal(environment.ADMIN_PASSWORD, ADMIN.ADMIN_PASSWORD);
        // A composição e o estado persistente ainda decidirão o comportamento.
    });

    // Todas as seis combinações parciais dos três campos são recusadas.
    for (const mask of [1, 2, 3, 4, 5, 6]) {
        const selectedFields = ADMIN_FIELDS.filter((_field, index) => mask & (1 << index));
        test(`recusa grupo contendo somente ${selectedFields.join(' e ')}`, () => {
            const partial = Object.fromEntries(selectedFields.map(field => [field, ADMIN[field]]));
            assert.throws(() => loadEnvironment(configuration(partial)), error => {
                for (const field of ADMIN_FIELDS.filter(field => !selectedFields.includes(field))) {
                    assert.ok(error.message.includes(`- ${field}:`));
                }
                assert.ok(error.message.includes('juntos ou remova os três campos'));
                return true;
            });
        });
    }

    test('convite não torna válido um grupo incompleto', () => {
        assert.throws(() => loadEnvironment(configuration({
            ADMIN_NAME: ADMIN.ADMIN_NAME, INITIAL_SETUP_TOKEN: TOKEN,
        })), error => {
            assert.ok(error.message.includes('- ADMIN_EMAIL:'));
            assert.ok(error.message.includes('- ADMIN_PASSWORD:'));
            return true;
        });
    });

    test('campos com undefined equivalem a campos ausentes', () => {
        const environment = loadEnvironment(configuration({
            ADMIN_NAME: undefined, ADMIN_EMAIL: undefined, ADMIN_PASSWORD: undefined,
        }));
        assert.equal(environment.HAS_ADMIN_BOOTSTRAP_CREDENTIALS, false);
    });

    test('campos vazios ou nulos não são convertidos em ausência', () => {
        for (const value of ['', '   ', null]) {
            for (const field of ADMIN_FIELDS) {
                assert.throws(() => loadEnvironment(configuration({ ...ADMIN, [field]: value })),
                    error => error.message.includes(`- ${field}:`));
            }
        }
        assert.throws(() => loadEnvironment(configuration({
            ADMIN_NAME: '', ADMIN_EMAIL: '', ADMIN_PASSWORD: '',
        })));
    });
});

describe('integridade e confidencialidade da configuração administrativa', () => {
    test('deriva o indicador sem aceitar substituição externa', () => {
        for (const injectedValue of [true, false, 'true', 'false']) {
            assert.equal(loadEnvironment(configuration({
                HAS_ADMIN_BOOTSTRAP_CREDENTIALS: injectedValue,
            })).HAS_ADMIN_BOOTSTRAP_CREDENTIALS, false);
            assert.equal(loadEnvironment(configuration({
                ...ADMIN, HAS_ADMIN_BOOTSTRAP_CREDENTIALS: injectedValue,
            })).HAS_ADMIN_BOOTSTRAP_CREDENTIALS, true);
        }
    });

    test('não modifica a origem dos dados ou preenche valores nela', () => {
        const source = Object.freeze(configuration(ADMIN));
        const snapshot = { ...source };
        loadEnvironment(source);
        assert.deepEqual(source, snapshot);
        assert.equal(Object.hasOwn(source, 'HAS_ADMIN_BOOTSTRAP_CREDENTIALS'), false);
    });

    test('mensagem de grupo incompleto não revela senha ou convite', () => {
        const password = 'senha-ficticia-privada-do-cenario';
        assert.throws(() => loadEnvironment(configuration({
            ADMIN_PASSWORD: password, INITIAL_SETUP_TOKEN: TOKEN,
        })), error => {
            assert.equal(error.message.includes(password), false);
            assert.equal(error.message.includes(TOKEN), false);
            assert.ok(error.message.includes('- ADMIN_NAME:'));
            assert.ok(error.message.includes('- ADMIN_EMAIL:'));
            return true;
        });
    });

    test('demais requisitos continuam obrigatórios sem credenciais administrativas', () => {
        for (const field of ['MONGODB_URI', 'SESSION_SECRET', 'APP_ORIGIN']) {
            const source = configuration();
            delete source[field];
            assert.throws(() => loadEnvironment(source),
                error => error.message.includes(`- ${field}:`));
        }
    });
});
