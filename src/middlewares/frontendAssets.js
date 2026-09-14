'use strict';

const fs = require('node:fs');
const path = require('node:path');
const express = require('express');

/**
 * Nome do documento principal produzido pelo Vite.
 */
const FRONTEND_INDEX_FILE_NAME = 'index.html';

/**
 * Prefixo reservado para as rotas HTTP do backend.
 *
 * Uma rota desconhecida sob esse prefixo deve continuar chegando ao
 * notFoundHandler e produzir um erro JSON, nunca o HTML do React.
 */
const API_PATH_PREFIX = '/api';

/**
 * Mensagens estáveis utilizadas durante a configuração do frontend.
 */
const FRONTEND_ASSETS_ERROR_MESSAGES = Object.freeze({
    INVALID_DIRECTORY:
        'A configuração do frontend exige um diretório absoluto válido.',
    INVALID_FILE_SYSTEM:
        'A configuração do frontend exige um sistema de arquivos válido.',
    INVALID_EXPRESS_MODULE:
        'A configuração do frontend exige uma implementação Express válida.',
    BUILD_DIRECTORY_NOT_FOUND:
        'A compilação do frontend não foi encontrada. Execute o build antes de iniciar o servidor.',
    INDEX_FILE_NOT_FOUND:
        'A compilação do frontend não possui um arquivo index.html válido.',
    INVALID_ROUTER:
        'A fábrica do Express não retornou um roteador válido.',
    INVALID_STATIC_MIDDLEWARE:
        'A fábrica de arquivos estáticos não retornou um middleware válido.',
});

/**
 * Verifica se um caminho representa o prefixo reservado da API.
 *
 * A comparação diferencia `/api` e `/api/...` de caminhos visuais como
 * `/apiario`, que não pertencem ao backend.
 *
 * @param {string} requestPath Caminho da requisição.
 * @returns {boolean} Verdadeiro quando o caminho pertence à API.
 */
function isApiPath(requestPath) {
    return (
        requestPath === API_PATH_PREFIX
        || requestPath.startsWith(`${API_PATH_PREFIX}/`)
    );
}

/**
 * Consulta um caminho sem expor detalhes técnicos da falha.
 *
 * Erros como arquivo ausente, permissão recusada ou caminho inválido são
 * representados igualmente. A inicialização emitirá depois uma mensagem
 * estável e segura.
 *
 * @param {object} fileSystem Implementação compatível com node:fs.
 * @param {string} targetPath Caminho consultado.
 * @returns {import('node:fs').Stats | null} Metadados ou null.
 */
function readPathStats(fileSystem, targetPath) {
    try {
        return fileSystem.statSync(targetPath);
    } catch {
        return null;
    }
}

/**
 * Valida a compilação produzida pelo Vite.
 *
 * A validação acontece durante a criação do middleware. Dessa forma, o
 * servidor pode recusar uma implantação incompleta antes de abrir MongoDB ou
 * a porta HTTP.
 *
 * @param {object} options Opções da validação.
 * @param {string} options.directory Diretório absoluto da compilação.
 * @param {object} options.fileSystem Sistema de arquivos utilizado.
 * @returns {Readonly<{ directory: string, indexFilePath: string }>}
 * Caminhos validados.
 */
function validateFrontendBuild({
    directory,
    fileSystem,
}) {
    if (
        typeof directory !== 'string'
        || directory.trim().length === 0
        || !path.isAbsolute(directory)
    ) {
        throw new TypeError(
            FRONTEND_ASSETS_ERROR_MESSAGES.INVALID_DIRECTORY,
        );
    }

    if (
        fileSystem === null
        || typeof fileSystem !== 'object'
        || typeof fileSystem.statSync !== 'function'
    ) {
        throw new TypeError(
            FRONTEND_ASSETS_ERROR_MESSAGES.INVALID_FILE_SYSTEM,
        );
    }

    const normalizedDirectory = path.normalize(directory);
    const directoryStats = readPathStats(
        fileSystem,
        normalizedDirectory,
    );

    if (
        directoryStats === null
        || typeof directoryStats.isDirectory !== 'function'
        || !directoryStats.isDirectory()
    ) {
        throw new Error(
            FRONTEND_ASSETS_ERROR_MESSAGES
                .BUILD_DIRECTORY_NOT_FOUND,
        );
    }

    const indexFilePath = path.join(
        normalizedDirectory,
        FRONTEND_INDEX_FILE_NAME,
    );

    const indexStats = readPathStats(
        fileSystem,
        indexFilePath,
    );

    if (
        indexStats === null
        || typeof indexStats.isFile !== 'function'
        || !indexStats.isFile()
    ) {
        throw new Error(
            FRONTEND_ASSETS_ERROR_MESSAGES.INDEX_FILE_NOT_FOUND,
        );
    }

    return Object.freeze({
        directory: normalizedDirectory,
        indexFilePath,
    });
}

/**
 * Cria o middleware que disponibiliza a compilação do React.
 *
 * Primeiro, `express.static()` atende arquivos reais, como JavaScript e CSS.
 * Depois, o fallback entrega `index.html` somente para navegações visuais.
 *
 * O fallback não atende:
 *
 * - caminhos reservados da API;
 * - métodos diferentes de GET e HEAD;
 * - requisições que não aceitam HTML;
 * - caminhos com extensão de arquivo.
 *
 * A última regra impede que um JavaScript ou CSS inexistente receba HTML com
 * estado 200, o que produziria erros confusos no navegador.
 *
 * @param {object} options Configuração do middleware.
 * @param {string} options.directory Diretório absoluto de `client/dist`.
 * @param {object} [options.fileSystem=fs]
 * Implementação de sistema de arquivos substituível nos testes.
 * @param {Function | object} [options.expressModule=express]
 * Implementação Express substituível nos testes.
 * @returns {Function} Roteador Express com arquivos e fallback visual.
 */
function createFrontendAssetsMiddleware({
    directory,
    fileSystem = fs,
    expressModule = express,
} = {}) {
    const isValidExpressModule =
        expressModule !== null
        && (
            typeof expressModule === 'function'
            || typeof expressModule === 'object'
        )
        && typeof expressModule.Router === 'function'
        && typeof expressModule.static === 'function';

    if (!isValidExpressModule) {
        throw new TypeError(
            FRONTEND_ASSETS_ERROR_MESSAGES
                .INVALID_EXPRESS_MODULE,
        );
    }

    const frontendBuild = validateFrontendBuild({
        directory,
        fileSystem,
    });

    const router = expressModule.Router();

    if (
        typeof router !== 'function'
        || typeof router.use !== 'function'
    ) {
        throw new TypeError(
            FRONTEND_ASSETS_ERROR_MESSAGES.INVALID_ROUTER,
        );
    }

    const staticMiddleware = expressModule.static(
        frontendBuild.directory,
        {
            dotfiles: 'deny',
            etag: true,
            fallthrough: true,
            index: false,
            redirect: false,
        },
    );

    if (typeof staticMiddleware !== 'function') {
        throw new TypeError(
            FRONTEND_ASSETS_ERROR_MESSAGES
                .INVALID_STATIC_MIDDLEWARE,
        );
    }

    router.use(staticMiddleware);

    router.use((request, response, next) => {
        const acceptsHtml =
            request.accepts('html') === 'html';

        const isSupportedMethod =
            request.method === 'GET'
            || request.method === 'HEAD';

        const hasFileExtension =
            path.extname(request.path).length > 0;

        if (
            !isSupportedMethod
            || !acceptsHtml
            || isApiPath(request.path)
            || hasFileExtension
        ) {
            next();
            return;
        }

        /**
         * O documento principal não deve ficar preso em cache, pois ele
         * referencia os nomes versionados gerados em cada novo build.
         */
        response.setHeader(
            'Cache-Control',
            'no-cache',
        );

        response.sendFile(frontendBuild.indexFilePath);
    });

    return router;
}

module.exports = {
    API_PATH_PREFIX,
    FRONTEND_ASSETS_ERROR_MESSAGES,
    FRONTEND_INDEX_FILE_NAME,
    createFrontendAssetsMiddleware,
    isApiPath,
    validateFrontendBuild,
};