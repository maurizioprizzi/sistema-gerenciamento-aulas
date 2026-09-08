const http = require('node:http');

const dotenv = require('dotenv');

const { createApp } = require('./app');
const { loadEnvironment } = require('./config/env');

/**
 * Converte e valida o número da porta informado pelo ambiente.
 *
 * Embora env.js já exija somente algarismos, esta função preserva sua própria
 * proteção. Isso é defesa em profundidade: server.js não depende da suposição
 * de que sempre receberá valores previamente validados.
 *
 * @param {string | undefined} value Valor recebido da variável PORT.
 * @returns {number} Porta válida para o servidor HTTP.
 * @throws {RangeError} Quando o valor não representa uma porta válida.
 */
function resolvePort(value) {
    const rawValue = value ?? '3000';
    const containsOnlyDigits = /^\d+$/.test(rawValue);

    if (!containsOnlyDigits) {
        throw new RangeError(
            'A variável PORT deve conter um número inteiro entre 1 e 65535.'
        );
    }

    const port = Number(rawValue);

    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new RangeError(
            'A variável PORT deve conter um número inteiro entre 1 e 65535.'
        );
    }

    return port;
}

/**
 * Carrega a configuração e inicia o servidor HTTP.
 *
 * A configuração é validada antes da abertura da porta. Se uma variável
 * obrigatória estiver ausente ou inválida, o processo será interrompido sem
 * iniciar parcialmente a aplicação.
 *
 * @returns {import('node:http').Server} Servidor HTTP iniciado.
 */
function startServer() {
    /**
     * Carrega o arquivo .env quando ele existir.
     *
     * Por padrão, dotenv não substitui variáveis já fornecidas pelo sistema
     * operacional ou pela plataforma de hospedagem.
     */
    dotenv.config({ quiet: true });

    const environment = loadEnvironment();
    const port = resolvePort(environment.PORT);
    const host = environment.HOST;

    const app = createApp();
    const server = http.createServer(app);

    /**
     * Captura falhas ocorridas durante a abertura da porta.
     */
    server.on('error', (error) => {
        if (error.code === 'EADDRINUSE') {
            console.error(`A porta ${port} já está sendo utilizada.`);
        } else {
            console.error('Erro ao iniciar o servidor:', error);
        }

        process.exitCode = 1;
    });

    /**
     * Inicia o recebimento de conexões.
     *
     * O endereço 0.0.0.0 permite que a aplicação funcione localmente, em
     * contêineres e em plataformas de hospedagem.
     */
    server.listen(port, host, () => {
        console.log(
            'Calendário do Prof. Dionísio iniciado com sucesso.'
        );
        console.log(`Ambiente: ${environment.NODE_ENV}`);
        console.log(`Endereço local: http://localhost:${port}`);
    });

    /**
     * Encerra o servidor sem interromper requisições que já estejam sendo
     * processadas.
     *
     * Quando o MongoDB for adicionado, esta rotina também encerrará a conexão
     * com o banco antes de finalizar o processo.
     *
     * @param {string} signal Sinal recebido do sistema operacional.
     */
    function shutdown(signal) {
        console.log(
            `\n${signal} recebido. Encerrando o servidor...`
        );

        server.close((error) => {
            if (error) {
                console.error(
                    'Erro durante o encerramento:',
                    error
                );
                process.exitCode = 1;
                return;
            }

            console.log('Servidor encerrado com segurança.');
        });
    }

    process.once('SIGINT', () => shutdown('SIGINT'));
    process.once('SIGTERM', () => shutdown('SIGTERM'));

    return server;
}

/**
 * Inicia o servidor somente quando este arquivo é executado diretamente.
 *
 * Erros de configuração são apresentados de forma clara, sem abrir a porta e
 * sem despejar valores confidenciais no terminal.
 */
if (require.main === module) {
    try {
        startServer();
    } catch (error) {
        console.error(
            `Não foi possível iniciar a aplicação:\n${error.message}`
        );
        process.exitCode = 1;
    }
}

module.exports = {
    resolvePort,
    startServer
};