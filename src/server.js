const http = require('node:http');

const { createApp } = require('./app');

/**
 * Converte e valida o número da porta informado pelo ambiente.
 *
 * Provedores de hospedagem normalmente entregam a porta por meio da variável
 * PORT. Durante o desenvolvimento local, usamos a porta 3000 como padrão.
 *
 * A expressão regular exige que todo o conteúdo seja formado por algarismos.
 * Isso impede que valores parcialmente numéricos, como "3000abc", "3.14" ou
 * "3e3", sejam silenciosamente aceitos.
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
 * Cria e inicia o servidor HTTP.
 *
 * Manter a inicialização dentro de uma função permite testar a configuração
 * sem abrir uma porta automaticamente quando este arquivo é importado.
 *
 * @returns {import('node:http').Server} Servidor HTTP iniciado.
 */
function startServer() {
    const port = resolvePort(process.env.PORT);
    const host = process.env.HOST ?? '0.0.0.0';

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
     * O endereço 0.0.0.0 permite que a aplicação funcione tanto localmente
     * quanto em contêineres e provedores de hospedagem.
     */
    server.listen(port, host, () => {
        console.log('Calendário do Prof. Dionísio iniciado com sucesso.');
        console.log(`Ambiente: ${process.env.NODE_ENV ?? 'development'}`);
        console.log(`Endereço local: http://localhost:${port}`);
    });

    /**
     * Encerra o servidor sem interromper requisições que já estejam sendo
     * processadas. Mais adiante também fecharemos aqui a conexão com o banco.
     *
     * @param {string} signal Sinal recebido do sistema operacional.
     */
    function shutdown(signal) {
        console.log(`\n${signal} recebido. Encerrando o servidor...`);

        server.close((error) => {
            if (error) {
                console.error('Erro durante o encerramento:', error);
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
 * Se um teste importar server.js, a porta não será aberta automaticamente.
 */
if (require.main === module) {
    startServer();
}

module.exports = {
    resolvePort,
    startServer
};