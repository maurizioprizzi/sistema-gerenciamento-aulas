import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './app/App.jsx';
import './styles/global.css';

/**
 * Identificador do ponto de montagem declarado em index.html.
 *
 * Manter o valor em uma constante evita diferenças silenciosas entre o HTML
 * e a inicialização do React.
 */
const ROOT_ELEMENT_ID = 'root';

const rootElement = document.getElementById(ROOT_ELEMENT_ID);

/**
 * Uma página sem o ponto de montagem representa uma falha estrutural. Nesse
 * caso, interrompemos a inicialização com uma mensagem que não contém dados
 * do usuário nem informações confidenciais.
 */
if (!rootElement) {
    throw new Error(
        'Não foi possível iniciar a interface da aplicação.',
    );
}

/**
 * StrictMode ajuda a identificar efeitos colaterais inesperados durante o
 * desenvolvimento. Ele não acrescenta elementos ao HTML de produção.
 */
createRoot(rootElement).render(
    <StrictMode>
        <App />
    </StrictMode>,
);