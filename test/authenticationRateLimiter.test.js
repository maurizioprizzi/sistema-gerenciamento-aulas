'use strict';

const assert = require('node:assert/strict');
const http = require('node:http');
const {
    describe,
    test,
} = require('node:test');

const express = require('express');

const {
    AUTHENTICATION_RATE_LIMIT_CODES,
    AUTHENTICATION_RATE_LIMIT_ERRORS,
    DEFAULT_LOGIN_RATE_LIMIT_MAX_ATTEMPTS,
    DEFAULT_LOGIN_RATE_LIMIT_WINDOW_MS,
    MAX_LOGIN_RATE_LIMIT_MAX_ATTEMPTS,
    MAX_LOGIN_RATE_LIMIT_WINDOW_MS,
    MIN_LOGIN_RATE_LIMIT_MAX_ATTEMPTS,
    MIN_LOGIN_RATE_LIMIT_WINDOW_MS,
    createAuthenticationRateLimiter,
} = require('../src/middlewares/authenticationRateLimiter');
const {
    createErrorHandler,
} = require('../src/middlewares/errorHandler');

async function listenTemporarily(app, callback) {
    const server = http.createServer(app);

    await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
    });

    try {
        const address = server.address();
        await callback(`http://127.0.0.1:${address.port}`);
    } finally {
        await new Promise((resolve, reject) => {
            server.close((error) => {
                if (error) {
                    reject(error);
                    return;
                }

                resolve();
            });
        });
    }
}

function createSilentLogger() {
    return {
        error() {},
    };
}

describe('configuração do limitador de autenticação', () => {
    test('expõe constantes estáveis e protegidas', () => {
        assert.equal(
            DEFAULT_LOGIN_RATE_LIMIT_WINDOW_MS,
            15 * 60 * 1000,
        );
        assert.equal(
            DEFAULT_LOGIN_RATE_LIMIT_MAX_ATTEMPTS,
            5,
        );
        assert.equal(
            AUTHENTICATION_RATE_LIMIT_CODES
                .TOO_MANY_ATTEMPTS,
            'AUTHENTICATION_RATE_LIMITED',
        );
        assert.equal(
            Object.isFrozen(AUTHENTICATION_RATE_LIMIT_CODES),
            true,
        );
        assert.equal(
            Object.isFrozen(AUTHENTICATION_RATE_LIMIT_ERRORS),
            true,
        );
    });

    test('entrega opções seguras à biblioteca', () => {
        const expectedMiddleware = (
            request,
            response,
            next,
        ) => next();
        let receivedOptions;

        function rateLimitFactory(options) {
            receivedOptions = options;
            return expectedMiddleware;
        }

        const result = createAuthenticationRateLimiter({
            rateLimitFactory,
        });

        assert.strictEqual(result, expectedMiddleware);
        assert.equal(
            receivedOptions.windowMs,
            DEFAULT_LOGIN_RATE_LIMIT_WINDOW_MS,
        );
        assert.equal(
            receivedOptions.limit,
            DEFAULT_LOGIN_RATE_LIMIT_MAX_ATTEMPTS,
        );
        assert.equal(receivedOptions.standardHeaders, 'draft-8');
        assert.equal(receivedOptions.legacyHeaders, false);
        assert.equal(receivedOptions.skipSuccessfulRequests, true);
        assert.equal(receivedOptions.passOnStoreError, false);
        assert.equal(typeof receivedOptions.handler, 'function');
        assert.equal(
            Object.hasOwn(receivedOptions, 'keyGenerator'),
            false,
        );
    });

    test('produz um AppError seguro ao atingir o limite', () => {
        let receivedOptions;

        createAuthenticationRateLimiter({
            rateLimitFactory(options) {
                receivedOptions = options;
                return () => {};
            },
        });

        let forwardedError;
        const request = {
            body: {
                email: 'nao-deve-aparecer@example.com',
                password: 'nao-deve-aparecer',
            },
        };

        receivedOptions.handler(
            request,
            {},
            (error) => {
                forwardedError = error;
            },
        );

        assert.equal(forwardedError.name, 'AppError');
        assert.equal(forwardedError.statusCode, 429);
        assert.equal(
            forwardedError.code,
            AUTHENTICATION_RATE_LIMIT_CODES
                .TOO_MANY_ATTEMPTS,
        );
        assert.equal(
            forwardedError.message,
            AUTHENTICATION_RATE_LIMIT_ERRORS
                .TOO_MANY_ATTEMPTS,
        );

        const serializedError = JSON.stringify(forwardedError);

        assert.equal(
            serializedError.includes(request.body.email),
            false,
        );
        assert.equal(
            serializedError.includes(request.body.password),
            false,
        );
    });

    test('aceita os limites operacionais permitidos', () => {
        const middlewareFactory = () => () => {};

        assert.doesNotThrow(
            () => createAuthenticationRateLimiter({
                windowMs: MIN_LOGIN_RATE_LIMIT_WINDOW_MS,
                maxAttempts:
                    MIN_LOGIN_RATE_LIMIT_MAX_ATTEMPTS,
                rateLimitFactory: middlewareFactory,
            }),
        );

        assert.doesNotThrow(
            () => createAuthenticationRateLimiter({
                windowMs: MAX_LOGIN_RATE_LIMIT_WINDOW_MS,
                maxAttempts:
                    MAX_LOGIN_RATE_LIMIT_MAX_ATTEMPTS,
                rateLimitFactory: middlewareFactory,
            }),
        );
    });

    test('rejeita janelas inválidas', () => {
        const invalidWindows = [
            null,
            999,
            MAX_LOGIN_RATE_LIMIT_WINDOW_MS + 1,
            1500.5,
            '900000',
            Number.NaN,
            Number.POSITIVE_INFINITY,
        ];

        for (const windowMs of invalidWindows) {
            assert.throws(
                () => createAuthenticationRateLimiter({
                    windowMs,
                }),
                {
                    name: 'RangeError',
                    message:
                        AUTHENTICATION_RATE_LIMIT_ERRORS
                            .INVALID_WINDOW,
                },
            );
        }
    });

    test('rejeita quantidades inválidas de tentativas', () => {
        const invalidLimits = [
            0,
            MAX_LOGIN_RATE_LIMIT_MAX_ATTEMPTS + 1,
            5.5,
            '5',
            null,
            Number.NaN,
            Number.POSITIVE_INFINITY,
        ];

        for (const maxAttempts of invalidLimits) {
            assert.throws(
                () => createAuthenticationRateLimiter({
                    maxAttempts,
                }),
                {
                    name: 'RangeError',
                    message:
                        AUTHENTICATION_RATE_LIMIT_ERRORS
                            .INVALID_MAX_ATTEMPTS,
                },
            );
        }
    });

    test('rejeita fábricas e retornos inválidos', () => {
        const invalidFactories = [
            null,
            {},
            [],
            'factory',
        ];

        for (const rateLimitFactory of invalidFactories) {
            assert.throws(
                () => createAuthenticationRateLimiter({
                    rateLimitFactory,
                }),
                {
                    name: 'TypeError',
                    message:
                        AUTHENTICATION_RATE_LIMIT_ERRORS
                            .INVALID_FACTORY,
                },
            );
        }

        assert.throws(
            () => createAuthenticationRateLimiter({
                rateLimitFactory() {
                    return {};
                },
            }),
            {
                name: 'TypeError',
                message:
                    AUTHENTICATION_RATE_LIMIT_ERRORS
                        .INVALID_MIDDLEWARE,
            },
        );
    });
});

describe('comportamento HTTP do limitador', () => {
    test('bloqueia a sexta tentativa recusada', async () => {
        const app = express();
        const limiter = createAuthenticationRateLimiter();

        app.post('/login', limiter, (request, response) => {
            response.status(401).json({
                error: {
                    code: 'INVALID_CREDENTIALS',
                    message: 'E-mail ou senha inválidos.',
                },
            });
        });

        app.use(createErrorHandler({
            logger: createSilentLogger(),
        }));

        await listenTemporarily(app, async (baseUrl) => {
            for (
                let attempt = 1;
                attempt <= DEFAULT_LOGIN_RATE_LIMIT_MAX_ATTEMPTS;
                attempt += 1
            ) {
                const response = await fetch(`${baseUrl}/login`, {
                    method: 'POST',
                });

                assert.equal(response.status, 401);
            }

            const blockedResponse = await fetch(
                `${baseUrl}/login`,
                {
                    method: 'POST',
                },
            );
            const body = await blockedResponse.json();

            assert.equal(blockedResponse.status, 429);
            assert.deepEqual(body, {
                error: {
                    code:
                        AUTHENTICATION_RATE_LIMIT_CODES
                            .TOO_MANY_ATTEMPTS,
                    message:
                        AUTHENTICATION_RATE_LIMIT_ERRORS
                            .TOO_MANY_ATTEMPTS,
                },
            });
            assert.notEqual(
                blockedResponse.headers.get('ratelimit'),
                null,
            );
            assert.equal(
                blockedResponse.headers.get('x-ratelimit-limit'),
                null,
            );
        });
    });

    test('não mantém respostas bem-sucedidas na contagem', async () => {
        const app = express();
        const limiter = createAuthenticationRateLimiter({
            maxAttempts: 1,
        });

        app.post('/login', limiter, (request, response) => {
            response.status(200).json({ accepted: true });
        });

        app.use(createErrorHandler({
            logger: createSilentLogger(),
        }));

        await listenTemporarily(app, async (baseUrl) => {
            const firstResponse = await fetch(`${baseUrl}/login`, {
                method: 'POST',
            });

            /**
             * A remoção da tentativa ocorre quando a resposta termina.
             */
            await new Promise((resolve) => setImmediate(resolve));

            const secondResponse = await fetch(`${baseUrl}/login`, {
                method: 'POST',
            });

            assert.equal(firstResponse.status, 200);
            assert.equal(secondResponse.status, 200);
        });
    });
});
