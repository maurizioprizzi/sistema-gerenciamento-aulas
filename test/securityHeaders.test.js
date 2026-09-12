'use strict';

const assert = require('node:assert/strict');
const {
    describe,
    test,
} = require('node:test');

const {
    HSTS_MAX_AGE_SECONDS,
    SECURITY_HEADERS_ERROR_MESSAGES,
    createSecurityHeadersMiddleware,
} = require('../src/middlewares/securityHeaders');

/**
 * Cria uma fábrica controlada que registra as opções recebidas.
 *
 * @param {object} options Comportamento da fábrica.
 * @returns {{ calls: object[], helmetFactory: Function, middleware: Function }}
 */
function createHelmetFactory({
    result,
    error = null,
} = {}) {
    const calls = [];
    const middleware = result === undefined
        ? (request, response, next) => next()
        : result;

    function helmetFactory(options) {
        calls.push(options);

        if (error) {
            throw error;
        }

        return middleware;
    }

    return {
        calls,
        helmetFactory,
        middleware,
    };
}

describe('configuração dos cabeçalhos de segurança', () => {
    test('expõe constantes estáveis e protegidas', () => {
        assert.equal(HSTS_MAX_AGE_SECONDS, 31536000);
        assert.equal(
            Object.isFrozen(SECURITY_HEADERS_ERROR_MESSAGES),
            true,
        );
    });

    test('configura o desenvolvimento sem exigir HTTPS', () => {
        const {
            calls,
            helmetFactory,
            middleware,
        } = createHelmetFactory();

        const result = createSecurityHeadersMiddleware({
            isProduction: false,
            helmetFactory,
        });

        assert.strictEqual(result, middleware);
        assert.deepEqual(calls, [
            {
                contentSecurityPolicy: {
                    directives: {
                        upgradeInsecureRequests: null,
                    },
                },
                strictTransportSecurity: false,
            },
        ]);
    });

    test('ativa as políticas HTTPS em produção', () => {
        const {
            calls,
            helmetFactory,
        } = createHelmetFactory();

        createSecurityHeadersMiddleware({
            isProduction: true,
            helmetFactory,
        });

        assert.deepEqual(calls, [
            {
                contentSecurityPolicy: {
                    directives: {
                        upgradeInsecureRequests: [],
                    },
                },
                strictTransportSecurity: {
                    maxAge: HSTS_MAX_AGE_SECONDS,
                    includeSubDomains: true,
                    preload: false,
                },
            },
        ]);
    });

    test('cria um middleware real do Helmet', () => {
        const middleware = createSecurityHeadersMiddleware({
            isProduction: false,
        });

        assert.equal(typeof middleware, 'function');
    });

    test('rejeita indicações de produção inválidas', () => {
        for (const isProduction of [
            undefined,
            null,
            0,
            1,
            'false',
            {},
            [],
        ]) {
            if (isProduction === undefined) {
                continue;
            }

            assert.throws(
                () => createSecurityHeadersMiddleware({
                    isProduction,
                    helmetFactory() {
                        return () => {};
                    },
                }),
                {
                    name: 'TypeError',
                    message:
                        SECURITY_HEADERS_ERROR_MESSAGES
                            .INVALID_PRODUCTION_FLAG,
                },
            );
        }
    });

    test('rejeita fábricas Helmet inválidas', () => {
        for (const helmetFactory of [
            null,
            42,
            'helmet',
            {},
            [],
        ]) {
            assert.throws(
                () => createSecurityHeadersMiddleware({
                    helmetFactory,
                }),
                {
                    name: 'TypeError',
                    message:
                        SECURITY_HEADERS_ERROR_MESSAGES
                            .INVALID_HELMET_FACTORY,
                },
            );
        }
    });

    test('rejeita resultados que não sejam middleware', () => {
        for (const result of [
            null,
            42,
            'middleware',
            {},
            [],
        ]) {
            const { helmetFactory } = createHelmetFactory({
                result,
            });

            assert.throws(
                () => createSecurityHeadersMiddleware({
                    helmetFactory,
                }),
                {
                    name: 'TypeError',
                    message:
                        SECURITY_HEADERS_ERROR_MESSAGES
                            .INVALID_MIDDLEWARE,
                },
            );
        }
    });

    test('propaga uma falha real da fábrica Helmet', () => {
        const expectedError = new Error(
            'Falha controlada da fábrica Helmet.',
        );
        const { helmetFactory } = createHelmetFactory({
            error: expectedError,
        });

        assert.throws(
            () => createSecurityHeadersMiddleware({
                helmetFactory,
            }),
            expectedError,
        );
    });
});
