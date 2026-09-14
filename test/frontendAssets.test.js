'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

const express = require('express');

const {
    after,
    before,
    describe,
    test,
} = require('node:test');

const {
    API_PATH_PREFIX,
    FRONTEND_ASSETS_ERROR_MESSAGES,
    FRONTEND_INDEX_FILE_NAME,
    createFrontendAssetsMiddleware,
    isApiPath,
    validateFrontendBuild,
} = require('../src/middlewares/frontendAssets');

const INDEX_CONTENT = [
    '<!doctype html>',
    '<html lang="pt-BR">',
    '<head>',
    '    <meta charset="UTF-8">',
    '    <title>Frontend de teste</title>',
    '</head>',
    '<body>',
    '    <div id="root"></div>',
    '</body>',
    '</html>',
].join('\n');

const SCRIPT_CONTENT =
    'globalThis.frontendAssetsTest = true;';

let temporaryRoot;
let validBuildDirectory;

/**
 * Inicia uma aplicação Express temporária com o middleware real.
 *
 * O fallback JSON permite observar quando uma requisição não foi atendida
 * pelos arquivos estáticos nem pelo documento principal do frontend.
 *
 * @param {Function} callback Operação executada com o endereço temporário.
 * @returns {Promise<void>}
 */
async function withTemporaryFrontendServer(callback) {
    const frontendAssetsMiddleware =
        createFrontendAssetsMiddleware({
            directory: validBuildDirectory,
        });

    const app = express();

    app.use(frontendAssetsMiddleware);

    app.use((request, response) => {
        response.status(404).json({
            error: {
                code: 'TEST_ROUTE_NOT_FOUND',
            },
        });
    });

    const server = http.createServer(app);

    await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
    });

    try {
        const address = server.address();

        await callback(
            `http://127.0.0.1:${address.port}`,
        );
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

before(() => {
    temporaryRoot = fs.mkdtempSync(
        path.join(
            os.tmpdir(),
            'dionisio-frontend-assets-',
        ),
    );

    validBuildDirectory = path.join(
        temporaryRoot,
        'valid-build',
    );

    const assetsDirectory = path.join(
        validBuildDirectory,
        'assets',
    );

    fs.mkdirSync(
        assetsDirectory,
        { recursive: true },
    );

    fs.writeFileSync(
        path.join(
            validBuildDirectory,
            FRONTEND_INDEX_FILE_NAME,
        ),
        INDEX_CONTENT,
        'utf8',
    );

    fs.writeFileSync(
        path.join(
            assetsDirectory,
            'application.js',
        ),
        SCRIPT_CONTENT,
        'utf8',
    );
});

after(() => {
    fs.rmSync(
        temporaryRoot,
        {
            recursive: true,
            force: true,
        },
    );
});

describe('configuração dos arquivos do frontend', () => {
    test('expõe constantes estáveis e protegidas', () => {
        assert.equal(API_PATH_PREFIX, '/api');
        assert.equal(
            FRONTEND_INDEX_FILE_NAME,
            'index.html',
        );

        assert.equal(
            Object.isFrozen(
                FRONTEND_ASSETS_ERROR_MESSAGES,
            ),
            true,
        );
    });

    test('identifica somente caminhos reservados da API', () => {
        const apiPaths = [
            '/api',
            '/api/',
            '/api/health',
            '/api/auth/session',
        ];

        const visualPaths = [
            '/',
            '/calendario',
            '/apiario',
            '/area/api',
        ];

        for (const requestPath of apiPaths) {
            assert.equal(
                isApiPath(requestPath),
                true,
            );
        }

        for (const requestPath of visualPaths) {
            assert.equal(
                isApiPath(requestPath),
                false,
            );
        }
    });

    test('rejeita diretórios inválidos', () => {
        const invalidDirectories = [
            undefined,
            null,
            '',
            '   ',
            'client/dist',
            42,
            {},
            [],
        ];

        for (const directory of invalidDirectories) {
            assert.throws(
                () => validateFrontendBuild({
                    directory,
                    fileSystem: fs,
                }),
                {
                    name: 'TypeError',
                    message:
                        FRONTEND_ASSETS_ERROR_MESSAGES
                            .INVALID_DIRECTORY,
                },
            );
        }
    });

    test('rejeita sistemas de arquivos inválidos', () => {
        const invalidFileSystems = [
            null,
            {},
            {
                statSync: 'statSync',
            },
        ];

        for (const fileSystem of invalidFileSystems) {
            assert.throws(
                () => validateFrontendBuild({
                    directory: validBuildDirectory,
                    fileSystem,
                }),
                {
                    name: 'TypeError',
                    message:
                        FRONTEND_ASSETS_ERROR_MESSAGES
                            .INVALID_FILE_SYSTEM,
                },
            );
        }
    });

    test('rejeita uma compilação inexistente', () => {
        const missingDirectory = path.join(
            temporaryRoot,
            'missing-build',
        );

        assert.throws(
            () => validateFrontendBuild({
                directory: missingDirectory,
                fileSystem: fs,
            }),
            {
                name: 'Error',
                message:
                    FRONTEND_ASSETS_ERROR_MESSAGES
                        .BUILD_DIRECTORY_NOT_FOUND,
            },
        );
    });

    test('rejeita um arquivo usado como diretório', () => {
        const filePath = path.join(
            temporaryRoot,
            'not-a-directory',
        );

        fs.writeFileSync(
            filePath,
            'arquivo',
            'utf8',
        );

        assert.throws(
            () => validateFrontendBuild({
                directory: filePath,
                fileSystem: fs,
            }),
            {
                name: 'Error',
                message:
                    FRONTEND_ASSETS_ERROR_MESSAGES
                        .BUILD_DIRECTORY_NOT_FOUND,
            },
        );
    });

    test('rejeita uma compilação sem index.html', () => {
        const buildWithoutIndex = path.join(
            temporaryRoot,
            'build-without-index',
        );

        fs.mkdirSync(buildWithoutIndex);

        assert.throws(
            () => validateFrontendBuild({
                directory: buildWithoutIndex,
                fileSystem: fs,
            }),
            {
                name: 'Error',
                message:
                    FRONTEND_ASSETS_ERROR_MESSAGES
                        .INDEX_FILE_NOT_FOUND,
            },
        );
    });

    test('rejeita um diretório chamado index.html', () => {
        const buildWithInvalidIndex = path.join(
            temporaryRoot,
            'build-with-invalid-index',
        );

        fs.mkdirSync(
            path.join(
                buildWithInvalidIndex,
                FRONTEND_INDEX_FILE_NAME,
            ),
            { recursive: true },
        );

        assert.throws(
            () => validateFrontendBuild({
                directory: buildWithInvalidIndex,
                fileSystem: fs,
            }),
            {
                name: 'Error',
                message:
                    FRONTEND_ASSETS_ERROR_MESSAGES
                        .INDEX_FILE_NOT_FOUND,
            },
        );
    });

    test('devolve caminhos normalizados e protegidos', () => {
        const result = validateFrontendBuild({
            directory: validBuildDirectory,
            fileSystem: fs,
        });

        assert.deepEqual(result, {
            directory:
                path.normalize(validBuildDirectory),
            indexFilePath: path.join(
                validBuildDirectory,
                FRONTEND_INDEX_FILE_NAME,
            ),
        });

        assert.equal(
            Object.isFrozen(result),
            true,
        );
    });

    test('rejeita implementações Express inválidas', () => {
        const invalidExpressModules = [
            null,
            {},
            {
                Router() {},
            },
            {
                static() {},
            },
            {
                Router: 'Router',
                static() {},
            },
        ];

        for (
            const expressModule
            of invalidExpressModules
        ) {
            assert.throws(
                () => createFrontendAssetsMiddleware({
                    directory: validBuildDirectory,
                    expressModule,
                }),
                {
                    name: 'TypeError',
                    message:
                        FRONTEND_ASSETS_ERROR_MESSAGES
                            .INVALID_EXPRESS_MODULE,
                },
            );
        }
    });

    test('rejeita roteadores inválidos', () => {
        const expressModule = {
            Router() {
                return {};
            },

            static() {
                return () => {};
            },
        };

        assert.throws(
            () => createFrontendAssetsMiddleware({
                directory: validBuildDirectory,
                expressModule,
            }),
            {
                name: 'TypeError',
                message:
                    FRONTEND_ASSETS_ERROR_MESSAGES
                        .INVALID_ROUTER,
            },
        );
    });

    test('rejeita middlewares estáticos inválidos', () => {
        function router() {}

        router.use = () => {};

        const expressModule = {
            Router() {
                return router;
            },

            static() {
                return {};
            },
        };

        assert.throws(
            () => createFrontendAssetsMiddleware({
                directory: validBuildDirectory,
                expressModule,
            }),
            {
                name: 'TypeError',
                message:
                    FRONTEND_ASSETS_ERROR_MESSAGES
                        .INVALID_STATIC_MIDDLEWARE,
            },
        );
    });

    test(
        'instala arquivos estáticos antes do fallback visual',
        () => {
            const installedMiddlewares = [];

            function router() {}

            router.use = (middleware) => {
                installedMiddlewares.push(middleware);
            };

            function staticMiddleware() {}

            const expressModule = {
                Router() {
                    return router;
                },

                static(directory, options) {
                    assert.equal(
                        directory,
                        path.normalize(
                            validBuildDirectory,
                        ),
                    );

                    assert.deepEqual(options, {
                        dotfiles: 'deny',
                        etag: true,
                        fallthrough: true,
                        index: false,
                        redirect: false,
                    });

                    return staticMiddleware;
                },
            };

            const result =
                createFrontendAssetsMiddleware({
                    directory: validBuildDirectory,
                    expressModule,
                });

            assert.strictEqual(result, router);
            assert.equal(
                installedMiddlewares.length,
                2,
            );
            assert.strictEqual(
                installedMiddlewares[0],
                staticMiddleware,
            );
            assert.equal(
                typeof installedMiddlewares[1],
                'function',
            );
        },
    );
});

describe('respostas HTTP dos arquivos do frontend', () => {
    test('entrega index.html na raiz', async () => {
        await withTemporaryFrontendServer(
            async (baseUrl) => {
                const response = await fetch(
                    `${baseUrl}/`,
                    {
                        headers: {
                            accept: 'text/html',
                        },
                    },
                );

                const body = await response.text();

                assert.equal(response.status, 200);
                assert.match(
                    response.headers.get(
                        'content-type',
                    ),
                    /^text\/html\b/,
                );
                assert.equal(
                    response.headers.get(
                        'cache-control',
                    ),
                    'no-cache',
                );
                assert.equal(body, INDEX_CONTENT);
            },
        );
    });

    test('entrega um arquivo estático real', async () => {
        await withTemporaryFrontendServer(
            async (baseUrl) => {
                const response = await fetch(
                    `${baseUrl}/assets/application.js`,
                );

                const body = await response.text();

                assert.equal(response.status, 200);
                assert.match(
                    response.headers.get(
                        'content-type',
                    ),
                    /javascript/,
                );
                assert.equal(body, SCRIPT_CONTENT);
            },
        );
    });

    test(
        'entrega index.html para uma rota visual',
        async () => {
            await withTemporaryFrontendServer(
                async (baseUrl) => {
                    const response = await fetch(
                        `${baseUrl}/calendario/aulas`,
                        {
                            headers: {
                                accept: 'text/html',
                            },
                        },
                    );

                    const body =
                        await response.text();

                    assert.equal(
                        response.status,
                        200,
                    );
                    assert.equal(
                        body,
                        INDEX_CONTENT,
                    );
                },
            );
        },
    );

    test(
        'não transforma uma rota desconhecida da API em HTML',
        async () => {
            await withTemporaryFrontendServer(
                async (baseUrl) => {
                    const response = await fetch(
                        `${baseUrl}/api/inexistente`,
                        {
                            headers: {
                                accept: 'text/html',
                            },
                        },
                    );

                    const body =
                        await response.json();

                    assert.equal(
                        response.status,
                        404,
                    );
                    assert.deepEqual(body, {
                        error: {
                            code:
                                'TEST_ROUTE_NOT_FOUND',
                        },
                    });
                },
            );
        },
    );

    test(
        'não devolve index.html para um arquivo inexistente',
        async () => {
            await withTemporaryFrontendServer(
                async (baseUrl) => {
                    const response = await fetch(
                        `${baseUrl}/assets/inexistente.js`,
                        {
                            headers: {
                                accept: 'text/html',
                            },
                        },
                    );

                    const body =
                        await response.json();

                    assert.equal(
                        response.status,
                        404,
                    );
                    assert.deepEqual(body, {
                        error: {
                            code:
                                'TEST_ROUTE_NOT_FOUND',
                        },
                    });
                },
            );
        },
    );

    test(
        'não devolve HTML quando a requisição aceita somente JSON',
        async () => {
            await withTemporaryFrontendServer(
                async (baseUrl) => {
                    const response = await fetch(
                        `${baseUrl}/calendario`,
                        {
                            headers: {
                                accept:
                                    'application/json',
                            },
                        },
                    );

                    assert.equal(
                        response.status,
                        404,
                    );
                },
            );
        },
    );

    test(
        'não utiliza o fallback visual para requisições POST',
        async () => {
            await withTemporaryFrontendServer(
                async (baseUrl) => {
                    const response = await fetch(
                        `${baseUrl}/calendario`,
                        {
                            method: 'POST',
                            headers: {
                                accept: 'text/html',
                            },
                        },
                    );

                    assert.equal(
                        response.status,
                        404,
                    );
                },
            );
        },
    );

    test('atende requisições HEAD sem corpo', async () => {
        await withTemporaryFrontendServer(
            async (baseUrl) => {
                const response = await fetch(
                    `${baseUrl}/calendario`,
                    {
                        method: 'HEAD',
                        headers: {
                            accept: 'text/html',
                        },
                    },
                );

                const body = await response.text();

                assert.equal(response.status, 200);
                assert.equal(body, '');
            },
        );
    });
});