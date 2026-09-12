import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Endereço do backend utilizado somente durante o desenvolvimento.
 *
 * O navegador continuará fazendo requisições para caminhos relativos como
 * /api/auth/login. O servidor do Vite encaminhará essas chamadas ao Express,
 * evitando a necessidade de configurar CORS para o ambiente local.
 */
const DEVELOPMENT_API_TARGET = 'http://127.0.0.1:3000';

/**
 * Configuração da ferramenta de desenvolvimento e compilação do front-end.
 *
 * A porta é fixa e utiliza strictPort para que uma execução concorrente não
 * mude silenciosamente o endereço da interface. Em produção, o conteúdo de
 * dist será servido pelo próprio backend sob a mesma origem da API.
 */
export default defineConfig({
    plugins: [react()],

    /**
     * Os testes de componentes precisam das APIs básicas de um navegador.
     * O jsdom oferece esse ambiente sem abrir uma janela real.
     *
     * Os mocks são limpos e restaurados entre os testes para impedir que o
     * estado de um cenário altere silenciosamente o cenário seguinte.
     * globals permanece desativado: describe, test, expect e vi deverão ser
     * importados explicitamente em cada arquivo de teste.
     */
    test: {
        environment: 'jsdom',
        globals: false,
        clearMocks: true,
        mockReset: true,
        restoreMocks: true,
    },

    server: {
        host: '127.0.0.1',
        port: 5173,
        strictPort: true,

        proxy: {
            '/api': {
                target: DEVELOPMENT_API_TARGET,
                changeOrigin: false,
            },
        },
    },

    preview: {
        host: '127.0.0.1',
        port: 4173,
        strictPort: true,
    },

    build: {
        outDir: 'dist',
        emptyOutDir: true,
    },
});
