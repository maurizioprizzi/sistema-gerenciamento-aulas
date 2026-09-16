const assert = require('node:assert/strict');
const http = require('node:http');
const {
    after,
    before,
    describe,
    test
} = require('node:test');

const {
    APP_ERROR_MESSAGES,
    createApp
} = require('../src/app');

describe('configuração dos cabeçalhos de segurança no app', () => {
    test('permite criar a aplicação sem middleware de segurança', () => {
        assert.doesNotThrow(() => createApp());
    });

    test('rejeita um middleware de segurança inválido', () => {
        const invalidMiddlewares = [
            'middleware',
            42,
            {},
            []
        ];

        for (const securityHeadersMiddleware of invalidMiddlewares) {
            assert.throws(
                () => createApp({ securityHeadersMiddleware }),
                {
                    name: 'TypeError',
                    message:
                        APP_ERROR_MESSAGES
                            .INVALID_SECURITY_HEADERS_MIDDLEWARE
                }
            );
        }
    });

    test(
        'executa a segurança antes da sessão e das rotas',
        async () => {
            const order = [];

            function securityHeadersMiddleware(
                request,
                response,
                next
            ) {
                order.push('security');
                response.setHeader(
                    'x-security-middleware',
                    'active'
                );
                next();
            }

            function sessionMiddleware(request, response, next) {
                order.push('session');
                next();
            }

            function authenticationRouter(request, response) {
                order.push('authentication');
                response.status(204).end();
            }

            const app = createApp({
                securityHeadersMiddleware,
                sessionMiddleware,
                authenticationRouter
            });
            const temporaryServer = http.createServer(app);

            await new Promise((resolve, reject) => {
                temporaryServer.once('error', reject);
                temporaryServer.listen(
                    0,
                    '127.0.0.1',
                    resolve
                );
            });

            try {
                const address = temporaryServer.address();
                const response = await fetch(
                    `http://127.0.0.1:${address.port}/api/auth/test`
                );

                assert.equal(response.status, 204);
                assert.equal(
                    response.headers.get(
                        'x-security-middleware'
                    ),
                    'active'
                );
                assert.deepEqual(order, [
                    'security',
                    'session',
                    'authentication'
                ]);
            } finally {
                await new Promise((resolve, reject) => {
                    temporaryServer.close((error) => {
                        if (error) {
                            reject(error);
                            return;
                        }

                        resolve();
                    });
                });
            }
        }
    );
});

describe('configuração das rotas de aulas no app', () => {
    test('permite criar a aplicação sem roteador de aulas', () => {
        assert.doesNotThrow(() => createApp());
    });

    test('rejeita um roteador de aulas inválido', () => {
        const invalidRouters = [
            'roteador',
            42,
            {},
            []
        ];

        for (const lessonRouter of invalidRouters) {
            assert.throws(
                () => createApp({ lessonRouter }),
                {
                    name: 'TypeError',
                    message:
                        APP_ERROR_MESSAGES.INVALID_LESSON_ROUTER
                }
            );
        }
    });

    test(
        'executa as aulas depois da segurança e da sessão, antes do frontend',
        async () => {
            const order = [];

            function securityHeadersMiddleware(
                request,
                response,
                next
            ) {
                order.push('security');
                next();
            }

            function sessionMiddleware(
                request,
                response,
                next
            ) {
                order.push('session');
                next();
            }

            function lessonRouter(
                request,
                response,
                next
            ) {
                order.push('lessons');
                next();
            }

            function frontendAssetsMiddleware(
                request,
                response
            ) {
                order.push('frontend');

                response.status(200).json({
                    order
                });
            }

            const app = createApp({
                securityHeadersMiddleware,
                sessionMiddleware,
                lessonRouter,
                frontendAssetsMiddleware
            });

            const temporaryServer = http.createServer(app);

            await new Promise((resolve, reject) => {
                temporaryServer.once('error', reject);
                temporaryServer.listen(
                    0,
                    '127.0.0.1',
                    resolve
                );
            });

            try {
                const address = temporaryServer.address();
                const response = await fetch(
                    'http://127.0.0.1:'
                        + address.port
                        + '/api/lessons/test'
                );
                const body = await response.json();

                assert.equal(response.status, 200);
                assert.deepEqual(body.order, [
                    'security',
                    'session',
                    'lessons',
                    'frontend'
                ]);
                assert.deepEqual(order, body.order);
            } finally {
                await new Promise((resolve, reject) => {
                    temporaryServer.close((error) => {
                        if (error) {
                            reject(error);
                            return;
                        }

                        resolve();
                    });
                });
            }
        }
    );
});

describe('configuração das rotas de materiais mensais no app', () => {
    test('permite criar a aplicação sem roteador mensal', () => {
        assert.doesNotThrow(() => createApp());
    });

    test('rejeita um roteador mensal inválido', () => {
        const invalidRouters = [
            'roteador',
            42,
            {},
            []
        ];

        for (const monthlyMaterialRouter of invalidRouters) {
            assert.throws(
                () => createApp({ monthlyMaterialRouter }),
                {
                    name: 'TypeError',
                    message:
                        APP_ERROR_MESSAGES
                            .INVALID_MONTHLY_MATERIAL_ROUTER
                }
            );
        }
    });

    test(
        'executa os materiais depois da segurança e da sessão, antes do frontend',
        async () => {
            const order = [];

            function securityHeadersMiddleware(
                request,
                response,
                next
            ) {
                order.push('security');
                next();
            }

            function sessionMiddleware(
                request,
                response,
                next
            ) {
                order.push('session');
                next();
            }

            function monthlyMaterialRouter(
                request,
                response,
                next
            ) {
                order.push('monthly-materials');
                next();
            }

            function frontendAssetsMiddleware(
                request,
                response
            ) {
                order.push('frontend');

                response.status(200).json({
                    order
                });
            }

            const app = createApp({
                securityHeadersMiddleware,
                sessionMiddleware,
                monthlyMaterialRouter,
                frontendAssetsMiddleware
            });

            const temporaryServer = http.createServer(app);

            await new Promise((resolve, reject) => {
                temporaryServer.once('error', reject);
                temporaryServer.listen(
                    0,
                    '127.0.0.1',
                    resolve
                );
            });

            try {
                const address = temporaryServer.address();
                const response = await fetch(
                    'http://127.0.0.1:'
                        + address.port
                        + '/api/monthly-materials/2026-09/test'
                );
                const body = await response.json();

                assert.equal(response.status, 200);
                assert.deepEqual(body.order, [
                    'security',
                    'session',
                    'monthly-materials',
                    'frontend'
                ]);
                assert.deepEqual(order, body.order);
            } finally {
                await new Promise((resolve, reject) => {
                    temporaryServer.close((error) => {
                        if (error) {
                            reject(error);
                            return;
                        }

                        resolve();
                    });
                });
            }
        }
    );
});

describe('configuração dos arquivos do frontend no app', () => {
    test('permite criar a aplicação sem middleware de frontend', () => {
        assert.doesNotThrow(() => createApp());
    });

    test('rejeita um middleware de frontend inválido', () => {
        const invalidMiddlewares = [
            'middleware',
            42,
            {},
            []
        ];

        for (const frontendAssetsMiddleware of invalidMiddlewares) {
            assert.throws(
                () => createApp({ frontendAssetsMiddleware }),
                {
                    name: 'TypeError',
                    message:
                        APP_ERROR_MESSAGES
                            .INVALID_FRONTEND_ASSETS_MIDDLEWARE
                }
            );
        }
    });

    test(
        'executa o frontend depois da segurança, sessão e API',
        async () => {
            const order = [];

            function securityHeadersMiddleware(
                request,
                response,
                next
            ) {
                order.push('security');
                next();
            }

            function sessionMiddleware(
                request,
                response,
                next
            ) {
                order.push('session');
                next();
            }

            function authenticationRouter(
                request,
                response,
                next
            ) {
                order.push('authentication');
                next();
            }

            function frontendAssetsMiddleware(
                request,
                response
            ) {
                order.push('frontend');

                response.status(200).json({
                    order
                });
            }

            const app = createApp({
                securityHeadersMiddleware,
                sessionMiddleware,
                authenticationRouter,
                frontendAssetsMiddleware
            });

            const temporaryServer = http.createServer(app);

            await new Promise((resolve, reject) => {
                temporaryServer.once('error', reject);
                temporaryServer.listen(
                    0,
                    '127.0.0.1',
                    resolve
                );
            });

            try {
                const address = temporaryServer.address();

                const response = await fetch(
                    `http://127.0.0.1:${address.port}/api/auth/test`
                );

                const body = await response.json();

                assert.equal(response.status, 200);
                assert.deepEqual(body.order, [
                    'security',
                    'session',
                    'authentication',
                    'frontend'
                ]);
                assert.deepEqual(order, body.order);
            } finally {
                await new Promise((resolve, reject) => {
                    temporaryServer.close((error) => {
                        if (error) {
                            reject(error);
                            return;
                        }

                        resolve();
                    });
                });
            }
        }
    );
});

describe('configuração do middleware de sessão', () => {
    test('permite criar a aplicação sem middleware de sessão', () => {
        assert.doesNotThrow(() => createApp());
    });

    test('rejeita um middleware de sessão inválido', () => {
        const invalidMiddlewares = [
            'middleware',
            42,
            {},
            []
        ];

        for (const sessionMiddleware of invalidMiddlewares) {
            assert.throws(
                () => createApp({ sessionMiddleware }),
                {
                    name: 'TypeError',
                    message:
                        APP_ERROR_MESSAGES
                            .INVALID_SESSION_MIDDLEWARE
                }
            );
        }
    });

    test(
        'executa o middleware de sessão antes da rota',
        async () => {
            let middlewareCalls = 0;

            function sessionMiddleware(
                request,
                response,
                next
            ) {
                middlewareCalls += 1;

                /**
                 * O cabeçalho permite observar pelo teste HTTP que este
                 * middleware foi executado antes da resposta da rota.
                 */
                response.setHeader(
                    'x-session-middleware',
                    'active'
                );

                next();
            }

            const app = createApp({ sessionMiddleware });
            const temporaryServer = http.createServer(app);

            await new Promise((resolve, reject) => {
                temporaryServer.once('error', reject);
                temporaryServer.listen(
                    0,
                    '127.0.0.1',
                    resolve
                );
            });

            try {
                const address = temporaryServer.address();
                const response = await fetch(
                    `http://127.0.0.1:${address.port}/api/health`
                );

                assert.equal(response.status, 200);
                assert.equal(
                    response.headers.get(
                        'x-session-middleware'
                    ),
                    'active'
                );
                assert.equal(middlewareCalls, 1);
            } finally {
                await new Promise((resolve, reject) => {
                    temporaryServer.close((error) => {
                        if (error) {
                            reject(error);
                            return;
                        }

                        resolve();
                    });
                });
            }
        }
    );
});

/**
 * Testes de integração da aplicação HTTP.
 *
 * Estes testes utilizam somente recursos nativos do Node.js:
 * - node:test para organizar e executar os testes;
 * - node:assert para realizar as verificações;
 * - node:http para iniciar um servidor temporário;
 * - fetch para enviar requisições HTTP reais.
 */
describe('Aplicação HTTP', () => {
    let server;
    let baseUrl;

    /**
     * O logger de teste impede que erros intencionais poluam o terminal.
     */
    const logger = {
        calls: [],

        error(...argumentsReceived) {
            this.calls.push(argumentsReceived);
        }
    };

    /**
     * Antes dos testes, cria uma instância real da aplicação e solicita ao
     * sistema operacional uma porta livre.
     *
     * A porta 0 pede ao sistema operacional que selecione automaticamente
     * uma porta disponível.
     */
    before(async () => {
        const app = createApp({ logger });

        server = http.createServer(app);

        await new Promise((resolve, reject) => {
            server.once('error', reject);
            server.listen(0, '127.0.0.1', resolve);
        });

        const address = server.address();

        baseUrl = `http://127.0.0.1:${address.port}`;
    });

    /**
     * Depois dos testes, encerra o servidor temporário.
     */
    after(async () => {
        await new Promise((resolve, reject) => {
            server.close((error) => {
                if (error) {
                    reject(error);
                    return;
                }

                resolve();
            });
        });
    });

    test('GET /api/health retorna o estado da aplicação', async () => {
        const response = await fetch(`${baseUrl}/api/health`);
        const body = await response.json();

        assert.equal(response.status, 200);
        assert.equal(body.status, 'ok');
        assert.equal(
            body.application,
            'Calendário do Prof. Dionísio'
        );
        assert.equal(body.version, '0.1.0');

        /**
         * O horário muda em cada requisição. Em vez de comparar um valor
         * fixo, verificamos se ele pode ser interpretado como uma data válida.
         */
        assert.equal(
            Number.isNaN(Date.parse(body.timestamp)),
            false
        );
    });

    test('a aplicação não revela o uso do Express no cabeçalho', async () => {
        const response = await fetch(`${baseUrl}/api/health`);

        assert.equal(
            response.headers.get('x-powered-by'),
            null
        );
    });

    test('uma rota inexistente retorna erro JSON padronizado', async () => {
        const response = await fetch(
            `${baseUrl}/api/inexistente`
        );
        const body = await response.json();

        assert.equal(response.status, 404);
        assert.equal(
            response.headers.get('content-type'),
            'application/json; charset=utf-8'
        );
        assert.deepEqual(body, {
            error: {
                code: 'ROUTE_NOT_FOUND',
                message: 'O endereço solicitado não existe.'
            }
        });
    });

    test('JSON malformado retorna um erro seguro de cliente', async () => {
        const invalidJson = '{"date": "2026-09-08"';

        const response = await fetch(
            `${baseUrl}/api/health`,
            {
                method: 'POST',
                headers: {
                    'content-type': 'application/json'
                },
                body: invalidJson
            }
        );

        const body = await response.json();

        assert.equal(response.status, 400);
        assert.deepEqual(body, {
            error: {
                code: 'INVALID_JSON',
                message:
                    'O corpo da requisição contém um JSON inválido.'
            }
        });

        /**
         * A resposta pública não deve apresentar a mensagem técnica produzida
         * pelo interpretador de JSON.
         */
        assert.equal(
            JSON.stringify(body).includes('SyntaxError'),
            false
        );
    });

    test('corpo excessivamente grande retorna o código 413', async () => {
        /**
         * O limite configurado em app.js é 100 KB. Este conteúdo ultrapassa
         * deliberadamente o limite para comprovar a proteção.
         */
        const largePayload = JSON.stringify({
            content: 'a'.repeat(101 * 1024)
        });

        const response = await fetch(
            `${baseUrl}/api/health`,
            {
                method: 'POST',
                headers: {
                    'content-type': 'application/json'
                },
                body: largePayload
            }
        );

        const body = await response.json();

        assert.equal(response.status, 413);
        assert.deepEqual(body, {
            error: {
                code: 'PAYLOAD_TOO_LARGE',
                message:
                    'O corpo da requisição ultrapassa o limite permitido.'
            }
        });
    });
});
