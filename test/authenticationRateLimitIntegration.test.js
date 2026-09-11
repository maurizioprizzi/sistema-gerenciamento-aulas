'use strict';

const assert = require('node:assert/strict');
const http = require('node:http');
const {
    describe,
    test,
} = require('node:test');

const { createApp } = require('../src/app');
const {
    AUTHENTICATION_RATE_LIMIT_CODES,
    createAuthenticationRateLimiter,
} = require('../src/middlewares/authenticationRateLimiter');
const {
    createAuthenticationRouter,
} = require('../src/routes/authenticationRoutes');

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

describe('limitação integrada às rotas de autenticação', () => {
    test(
        'bloqueia novas entradas e preserva a saída',
        async () => {
            const calls = {
                login: 0,
                logout: 0,
            };

            const controller = {
                login(request, response) {
                    calls.login += 1;
                    response.status(401).json({
                        error: {
                            code: 'INVALID_CREDENTIALS',
                            message: 'E-mail ou senha inválidos.',
                        },
                    });
                },

                logout(request, response) {
                    calls.logout += 1;
                    response.status(204).end();
                },
            };

            const loginRateLimiter =
                createAuthenticationRateLimiter({
                    maxAttempts: 1,
                });

            const authenticationRouter =
                createAuthenticationRouter({
                    controller,
                    loginRateLimiter,
                });

            const app = createApp({
                authenticationRouter,
                logger: {
                    error() {},
                },
            });

            await listenTemporarily(app, async (baseUrl) => {
                const firstLogin = await fetch(
                    `${baseUrl}/api/auth/login`,
                    {
                        method: 'POST',
                    },
                );

                const blockedLogin = await fetch(
                    `${baseUrl}/api/auth/login`,
                    {
                        method: 'POST',
                    },
                );
                const blockedBody =
                    await blockedLogin.json();

                const logout = await fetch(
                    `${baseUrl}/api/auth/logout`,
                    {
                        method: 'POST',
                    },
                );

                assert.equal(firstLogin.status, 401);
                assert.equal(blockedLogin.status, 429);
                assert.equal(
                    blockedBody.error.code,
                    AUTHENTICATION_RATE_LIMIT_CODES
                        .TOO_MANY_ATTEMPTS,
                );
                assert.equal(logout.status, 204);
                assert.deepEqual(calls, {
                    login: 1,
                    logout: 1,
                });
            });
        },
    );
});
