'use strict';

const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const {
    ADMINISTRATIVE_INDEX_ERRORS,
    AdministrativeIndexInitializer,
} = require('../src/services/AdministrativeIndexInitializer');

/**
 * Modelo controlado: nenhuma operação deste arquivo acessa MongoDB.
 * Os testes verificam decisões, ordem, espera e tratamento de falhas.
 */
function createModel(overrides = {}) {
    return {
        async countDocuments() {
            return 0;
        },
        async createIndexes() {},
        ...overrides,
    };
}

function createDeferred() {
    let resolve;
    let reject;
    const promise = new Promise((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
    });

    return { promise, resolve, reject };
}

const ERRORS = ADMINISTRATIVE_INDEX_ERRORS;

describe('configuração de AdministrativeIndexInitializer', () => {
    it('permite construir o serviço com o modelo padrão', () => {
        assert.doesNotThrow(() => new AdministrativeIndexInitializer());
    });

    it('rejeita modelos sem as operações exigidas', () => {
        for (const UserModel of [
            null,
            {},
            createModel({ countDocuments: null }),
            createModel({ createIndexes: null }),
        ]) {
            assert.throws(
                () => new AdministrativeIndexInitializer({ UserModel }),
                { name: 'TypeError', message: ERRORS.INVALID_USER_MODEL },
            );
        }
    });

    it('não consulta nem cria índices durante a construção', () => {
        new AdministrativeIndexInitializer({
            UserModel: createModel({
                countDocuments() {
                    assert.fail('Consulta antecipada.');
                },
                createIndexes() {
                    assert.fail('Criação antecipada.');
                },
            }),
        });
    });
});

describe('preparação dos índices administrativos', () => {
    for (const count of [0, 1]) {
        it(`prepara índices com ${count} administrador existente`, async () => {
            const calls = [];
            const service = new AdministrativeIndexInitializer({
                UserModel: createModel({
                    async countDocuments(filter) {
                        // Sem filtro de e-mail ou active: inclui contas inativas.
                        assert.deepEqual(filter, { role: 'admin' });
                        calls.push('count');
                        return count;
                    },
                    async createIndexes() {
                        calls.push('indexes');
                    },
                }),
            });

            assert.equal(await service.initialize(), undefined);
            assert.deepEqual(calls, ['count', 'indexes']);
        });
    }

    it('recusa múltiplos administradores antes de criar índices', async () => {
        const service = new AdministrativeIndexInitializer({
            UserModel: createModel({
                async countDocuments() {
                    return 2;
                },
                async createIndexes() {
                    assert.fail('Não deve criar índices após a recusa.');
                },
            }),
        });

        await assert.rejects(service.initialize(), {
            message: ERRORS.MULTIPLE_ADMINS,
        });
    });

    it('recusa contagens inválidas antes de criar índices', async () => {
        for (const count of [
            -1, 0.5, null, undefined, '1', NaN, Infinity,
            Number.MAX_SAFE_INTEGER + 1,
        ]) {
            const service = new AdministrativeIndexInitializer({
                UserModel: createModel({
                    async countDocuments() {
                        return count;
                    },
                    async createIndexes() {
                        assert.fail('Não deve criar índices com contagem inválida.');
                    },
                }),
            });

            await assert.rejects(service.initialize(), {
                name: 'TypeError', message: ERRORS.INVALID_ADMIN_COUNT,
            });
        }
    });

    it('preserva falha da consulta e não tenta criar índices', async () => {
        const originalError = new Error('Consulta indisponível.');
        const service = new AdministrativeIndexInitializer({
            UserModel: createModel({
                async countDocuments() {
                    throw originalError;
                },
                async createIndexes() {
                    assert.fail('Não deve criar índices após falha da consulta.');
                },
            }),
        });

        await assert.rejects(service.initialize(), error => error === originalError);
    });

    it('aguarda a consulta antes de solicitar os índices', async () => {
        const count = createDeferred();
        let indexesRequested = false;
        const service = new AdministrativeIndexInitializer({
            UserModel: createModel({
                countDocuments() {
                    return count.promise;
                },
                async createIndexes() {
                    indexesRequested = true;
                },
            }),
        });

        const pending = service.initialize();
        try {
            await new Promise(resolve => setImmediate(resolve));
            assert.equal(indexesRequested, false);
        } finally {
            count.resolve(0);
            await pending;
        }
        assert.equal(indexesRequested, true);
    });

    it('não conclui enquanto a criação dos índices está pendente', async () => {
        const indexes = createDeferred();
        let completed = false;
        const service = new AdministrativeIndexInitializer({
            UserModel: createModel({ createIndexes: () => indexes.promise }),
        });

        const pending = service.initialize().then(() => {
            completed = true;
        });
        try {
            await new Promise(resolve => setImmediate(resolve));
            assert.equal(completed, false);
        } finally {
            indexes.resolve();
            await pending;
        }
        assert.equal(completed, true);
    });

    it('converte conflito de unicidade em mensagem sem valores privados', async () => {
        const privateValue = 'conta-privada@example.com';
        const originalError = Object.assign(new Error(privateValue), {
            code: 11000,
            keyValue: { email: privateValue },
        });
        const service = new AdministrativeIndexInitializer({
            UserModel: createModel({
                async createIndexes() {
                    throw originalError;
                },
            }),
        });

        await assert.rejects(service.initialize(), error => {
            assert.equal(error.message, ERRORS.DUPLICATE_DATA);
            assert.equal(error.message.includes(privateValue), false);
            assert.equal(error.cause, undefined);
            assert.equal(error.keyValue, undefined);
            return true;
        });
    });

    it('preserva outras falhas na criação dos índices', async () => {
        const originalError = Object.assign(new Error('Permissão insuficiente.'), {
            code: 13,
        });
        const service = new AdministrativeIndexInitializer({
            UserModel: createModel({
                async createIndexes() {
                    throw originalError;
                },
            }),
        });

        await assert.rejects(service.initialize(), error => error === originalError);
    });

    it('permite repetir a preparação e aguarda ambas as execuções', async () => {
        let calls = 0;
        const service = new AdministrativeIndexInitializer({
            UserModel: createModel({
                async createIndexes() {
                    calls += 1;
                },
            }),
        });

        await service.initialize();
        await service.initialize();
        assert.equal(calls, 2);
    });
});
