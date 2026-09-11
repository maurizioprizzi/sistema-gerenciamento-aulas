'use strict';

const assert = require('node:assert/strict');
const { describe, test } = require('node:test');

const {
    BCRYPT_MAX_PASSWORD_BYTES,
    DEFAULT_PASSWORD_HASH_ROUNDS,
    MAX_PASSWORD_HASH_ROUNDS,
    MIN_PASSWORD_HASH_ROUNDS,
    PASSWORD_ERRORS,
    PasswordHasher,
    passwordHasher,
} = require('../src/services/PasswordHasher');

/**
 * Cria uma implementação controlada do bcrypt.
 *
 * Além de evitar cálculos criptográficos demorados na maioria dos testes,
 * essa implementação registra as chamadas realizadas pelo serviço.
 *
 * @param {object} options Comportamento desejado para a implementação.
 * @returns {{ bcryptClient: object, calls: object }}
 */
function createFakeBcrypt({
    hashResult = 'hash-controlado',
    compareResult = true,
    hashError = null,
    compareError = null,
} = {}) {
    const calls = {
        hash: [],
        compare: [],
    };

    const bcryptClient = {
        async hash(password, rounds) {
            calls.hash.push({
                password,
                rounds,
            });

            if (hashError) {
                throw hashError;
            }

            return hashResult;
        },

        async compare(password, passwordHash) {
            calls.compare.push({
                password,
                passwordHash,
            });

            if (compareError) {
                throw compareError;
            }

            return compareResult;
        },
    };

    return {
        bcryptClient,
        calls,
    };
}

describe('configuração do PasswordHasher', () => {
    test('utiliza o custo padrão esperado', () => {
        assert.equal(
            passwordHasher.rounds,
            DEFAULT_PASSWORD_HASH_ROUNDS,
        );
        assert.equal(DEFAULT_PASSWORD_HASH_ROUNDS, 12);
        assert.equal(BCRYPT_MAX_PASSWORD_BYTES, 72);
    });

    test('aceita os limites de custo permitidos', () => {
        const { bcryptClient } = createFakeBcrypt();

        const minimumHasher = new PasswordHasher({
            bcryptClient,
            rounds: MIN_PASSWORD_HASH_ROUNDS,
        });

        const maximumHasher = new PasswordHasher({
            bcryptClient,
            rounds: MAX_PASSWORD_HASH_ROUNDS,
        });

        assert.equal(minimumHasher.rounds, 10);
        assert.equal(maximumHasher.rounds, 15);
    });

    for (const invalidRounds of [
        9,
        16,
        10.5,
        '12',
        Number.NaN,
        Number.POSITIVE_INFINITY,
        null,
    ]) {
        test(`rejeita o custo inválido ${String(invalidRounds)}`, () => {
            const { bcryptClient } = createFakeBcrypt();

            assert.throws(
                () => new PasswordHasher({
                    bcryptClient,
                    rounds: invalidRounds,
                }),
                {
                    name: 'RangeError',
                    message: PASSWORD_ERRORS.INVALID_ROUNDS,
                },
            );
        });
    }

    for (const invalidClient of [
        null,
        {},
        {
            hash() {},
        },
        {
            compare() {},
        },
    ]) {
        test('rejeita um cliente bcrypt incompleto', () => {
            assert.throws(
                () => new PasswordHasher({
                    bcryptClient: invalidClient,
                }),
                {
                    name: 'TypeError',
                    message: PASSWORD_ERRORS.INVALID_CLIENT,
                },
            );
        });
    }

    test('aceita um cliente com somente hash e compare', () => {
        const { bcryptClient } = createFakeBcrypt();

        assert.doesNotThrow(
            () => new PasswordHasher({ bcryptClient }),
        );
        assert.deepEqual(
            Object.keys(bcryptClient).sort(),
            ['compare', 'hash'],
        );
    });

    test('não permite alterar o custo depois da construção', () => {
        const { bcryptClient } = createFakeBcrypt();
        const service = new PasswordHasher({
            bcryptClient,
            rounds: 12,
        });

        assert.throws(
            () => {
                service.rounds = 4;
            },
            TypeError,
        );

        assert.equal(service.rounds, 12);
        assert.equal(Object.hasOwn(service, 'rounds'), false);
        assert.equal(Object.hasOwn(service, 'bcryptClient'), false);
    });

    test('mantém as mensagens de erro protegidas contra alterações', () => {
        assert.equal(Object.isFrozen(PASSWORD_ERRORS), true);
    });
});

describe('PasswordHasher.hash', () => {
    test('envia a senha e o custo configurado ao bcrypt', async () => {
        const { bcryptClient, calls } = createFakeBcrypt({
            hashResult: 'hash-gerado',
        });

        const service = new PasswordHasher({
            bcryptClient,
            rounds: 11,
        });

        const result = await service.hash('Senha de teste 2026!');

        assert.equal(result, 'hash-gerado');
        assert.deepEqual(calls.hash, [
            {
                password: 'Senha de teste 2026!',
                rounds: 11,
            },
        ]);
    });

    for (const invalidPassword of [
        undefined,
        null,
        '',
        123,
        {},
    ]) {
        test(
            `rejeita senha inválida do tipo ${typeof invalidPassword}`,
            async () => {
                const { bcryptClient, calls } = createFakeBcrypt();
                const service = new PasswordHasher({ bcryptClient });

                await assert.rejects(
                    service.hash(invalidPassword),
                    {
                        name: 'TypeError',
                        message: PASSWORD_ERRORS.INVALID_PASSWORD,
                    },
                );

                assert.equal(calls.hash.length, 0);
            },
        );
    }

    test('preserva espaços que fazem parte da senha', async () => {
        const { bcryptClient, calls } = createFakeBcrypt();
        const service = new PasswordHasher({ bcryptClient });
        const password = '  senha com espaços  ';

        await service.hash(password);

        assert.equal(calls.hash[0].password, password);
    });

    test('aceita uma senha com exatamente 72 bytes', async () => {
        const { bcryptClient, calls } = createFakeBcrypt();
        const service = new PasswordHasher({ bcryptClient });
        const password = 'a'.repeat(72);

        await assert.doesNotReject(service.hash(password));

        assert.equal(Buffer.byteLength(password, 'utf8'), 72);
        assert.equal(calls.hash.length, 1);
    });

    test('rejeita uma senha maior que 72 bytes', async () => {
        const { bcryptClient, calls } = createFakeBcrypt();
        const service = new PasswordHasher({ bcryptClient });
        const password = 'a'.repeat(73);

        await assert.rejects(
            service.hash(password),
            {
                name: 'RangeError',
                message: PASSWORD_ERRORS.PASSWORD_TOO_LONG,
            },
        );

        assert.equal(calls.hash.length, 0);
    });

    test('mede em bytes uma senha que contém caracteres Unicode', async () => {
        const { bcryptClient, calls } = createFakeBcrypt();
        const service = new PasswordHasher({ bcryptClient });

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

        await assert.doesNotReject(
            service.hash(passwordWith72Bytes),
        );

        await assert.rejects(
            service.hash(passwordWith76Bytes),
            {
                name: 'RangeError',
                message: PASSWORD_ERRORS.PASSWORD_TOO_LONG,
            },
        );

        assert.equal(calls.hash.length, 1);
    });

    test('propaga uma falha da biblioteca sem expor a senha', async () => {
        const libraryError = new Error(
            'Falha controlada da biblioteca.',
        );

        const { bcryptClient } = createFakeBcrypt({
            hashError: libraryError,
        });

        const service = new PasswordHasher({ bcryptClient });
        const password = 'Segredo que não deve aparecer';

        await assert.rejects(
            service.hash(password),
            (error) => {
                assert.strictEqual(error, libraryError);
                assert.equal(error.message.includes(password), false);

                return true;
            },
        );
    });
});

describe('PasswordHasher.compare', () => {
    test('envia a senha e o hash para comparação', async () => {
        const { bcryptClient, calls } = createFakeBcrypt({
            compareResult: true,
        });

        const service = new PasswordHasher({ bcryptClient });

        const result = await service.compare(
            'Senha de teste',
            'hash-armazenado',
        );

        assert.equal(result, true);
        assert.deepEqual(calls.compare, [
            {
                password: 'Senha de teste',
                passwordHash: 'hash-armazenado',
            },
        ]);
    });

    test('retorna falso quando o bcrypt rejeita a senha', async () => {
        const { bcryptClient } = createFakeBcrypt({
            compareResult: false,
        });

        const service = new PasswordHasher({ bcryptClient });

        const result = await service.compare(
            'Senha incorreta',
            'hash-armazenado',
        );

        assert.equal(result, false);
    });

    test('valida a senha antes de realizar a comparação', async () => {
        const { bcryptClient, calls } = createFakeBcrypt();
        const service = new PasswordHasher({ bcryptClient });

        await assert.rejects(
            service.compare('', 'hash-armazenado'),
            {
                name: 'TypeError',
                message: PASSWORD_ERRORS.INVALID_PASSWORD,
            },
        );

        assert.equal(calls.compare.length, 0);
    });

    test(
        'rejeita senha maior que 72 bytes antes da comparação',
        async () => {
            const { bcryptClient, calls } = createFakeBcrypt();
            const service = new PasswordHasher({ bcryptClient });
            const password = 'a'.repeat(
                BCRYPT_MAX_PASSWORD_BYTES + 1,
            );

            await assert.rejects(
                service.compare(password, 'hash-armazenado'),
                {
                    name: 'RangeError',
                    message: PASSWORD_ERRORS.PASSWORD_TOO_LONG,
                },
            );

            assert.equal(calls.compare.length, 0);
        },
    );

    for (const invalidHash of [
        undefined,
        null,
        '',
        123,
    ]) {
        test(
            `rejeita hash inválido do tipo ${typeof invalidHash}`,
            async () => {
                const { bcryptClient, calls } = createFakeBcrypt();
                const service = new PasswordHasher({ bcryptClient });

                await assert.rejects(
                    service.compare('Senha válida', invalidHash),
                    {
                        name: 'TypeError',
                        message: PASSWORD_ERRORS.INVALID_HASH,
                    },
                );

                assert.equal(calls.compare.length, 0);
            },
        );
    }

    test('propaga uma falha ocorrida durante a comparação', async () => {
        const libraryError = new Error(
            'Falha controlada durante a comparação.',
        );

        const { bcryptClient } = createFakeBcrypt({
            compareError: libraryError,
        });

        const service = new PasswordHasher({ bcryptClient });

        await assert.rejects(
            service.compare('Senha válida', 'hash-armazenado'),
            (error) => {
                assert.strictEqual(error, libraryError);

                return true;
            },
        );
    });
});

describe('integração com bcryptjs', () => {
    test('gera um hash real e compara senhas corretamente', async () => {
        /**
         * O custo mínimo permitido é usado somente neste teste para manter a
         * suíte rápida. A instância normal da aplicação continua usando 12.
         */
        const service = new PasswordHasher({
            rounds: MIN_PASSWORD_HASH_ROUNDS,
        });

        const password = 'Senha fictícia para teste 2026!';
        const hash = await service.hash(password);

        assert.match(
            hash,
            /^\$2b\$10\$[./A-Za-z0-9]{53}$/,
        );
        assert.equal(hash.length, 60);
        assert.equal(await service.compare(password, hash), true);
        assert.equal(
            await service.compare('Senha diferente', hash),
            false,
        );
    });
});
