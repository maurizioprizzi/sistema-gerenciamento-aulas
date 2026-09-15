import { useState } from 'react';

import { LogoutButton } from '../authentication/LogoutButton.jsx';
import {
    CALENDAR_SECTION_IDS,
    CalendarNavigation,
} from './CalendarNavigation.jsx';

/**
 * Identificadores estáveis utilizados pela área autenticada.
 */
const CALENDAR_WORKSPACE_IDS = Object.freeze({
    TITLE: 'calendar-workspace-title',
    ACTIVE_SECTION: 'calendar-workspace-active-section',
    LOGOUT_ERROR: 'calendar-workspace-logout-error',
});

/**
 * Mensagens estáveis relacionadas à configuração do componente.
 */
const CALENDAR_WORKSPACE_MESSAGES = Object.freeze({
    INVALID_ADMINISTRATOR_NAME:
        'A área do calendário exige um nome administrativo válido ou nulo.',
    INVALID_LOGOUT_HANDLER:
        'A área do calendário exige uma função de saída válida.',
    INVALID_LOGGING_OUT_STATE:
        'O estado de saída da área do calendário deve ser booleano.',
    INVALID_LOGOUT_ERROR:
        'O erro de saída da área do calendário deve ser um texto ou nulo.',
});

/**
 * Textos de estado vazio presentes no painel geral do HTML original.
 */
const CALENDAR_DASHBOARD_EMPTY_MESSAGES = Object.freeze({
    UPCOMING_LESSONS: 'Nenhuma aula próxima',
    REVIEW_LESSONS: 'Nenhuma aula marcada para revisão',
});

/**
 * Estrutura inicial do painel geral para uma coleção ainda vazia.
 *
 * A contagem e os estados vazios correspondem ao comportamento inicial do
 * protótipo. Dados reais serão recebidos somente quando a API de aulas for
 * implementada.
 *
 * @returns {import('react').ReactElement} Painel geral vazio.
 */
function EmptyCalendarDashboard() {
    return (
        <div className="calendar-dashboard">
            <section
                className="calendar-stat-card"
                aria-labelledby="registered-lessons-title"
            >
                <h2 id="registered-lessons-title">
                    Total de aulas registradas
                </h2>

                <output
                    className="calendar-stat-number"
                    aria-label="Total de aulas registradas: 0"
                >
                    0
                </output>
            </section>

            <section
                className="calendar-content-section"
                aria-labelledby="upcoming-lessons-title"
            >
                <h2 id="upcoming-lessons-title">
                    Próximas aulas
                </h2>

                <p className="calendar-empty-state">
                    {
                        CALENDAR_DASHBOARD_EMPTY_MESSAGES
                            .UPCOMING_LESSONS
                    }
                </p>
            </section>

            <section
                className="calendar-content-section"
                aria-labelledby="review-lessons-title"
            >
                <h2 id="review-lessons-title">
                    Aulas marcadas para revisão
                </h2>

                <p className="calendar-empty-state">
                    {
                        CALENDAR_DASHBOARD_EMPTY_MESSAGES
                            .REVIEW_LESSONS
                    }
                </p>
            </section>
        </div>
    );
}

/**
 * Apresenta o título da seção escolhida enquanto seu conteúdo específico
 * ainda não foi implementado.
 *
 * Não é exibida nenhuma promessa de funcionalidade ou ação inexistente. Cada
 * seção será substituída pelo componente correspondente em seu próprio marco.
 *
 * @param {object} props Propriedades da seção.
 * @param {string} props.title Título previsto no protótipo original.
 * @returns {import('react').ReactElement} Estrutura mínima da seção.
 */
function EmptyCalendarSection({ title }) {
    return (
        <section
            className="calendar-content-section"
            aria-labelledby={CALENDAR_WORKSPACE_IDS.ACTIVE_SECTION}
        >
            <h2 id={CALENDAR_WORKSPACE_IDS.ACTIVE_SECTION}>
                {title}
            </h2>
        </section>
    );
}

/**
 * Área principal apresentada depois da autenticação administrativa.
 *
 * O componente coordena apenas a navegação visual entre as seções originais.
 * Autenticação, requisições HTTP e persistência permanecem fora desta camada.
 *
 * @param {object} props Propriedades da área autenticada.
 * @param {string | null} [props.administratorName=null]
 * Nome público do administrador autenticado.
 * @param {Function} props.onLogout Função que solicita a saída.
 * @param {boolean} [props.isLoggingOut=false] Indica saída em andamento.
 * @param {string | null} [props.logoutError=null] Erro público da saída.
 * @returns {import('react').ReactElement} Área autenticada do calendário.
 */
function CalendarWorkspace({
    administratorName = null,
    onLogout,
    isLoggingOut = false,
    logoutError = null,
}) {
    const hasValidAdministratorName =
        administratorName === null
        || (
            typeof administratorName === 'string'
            && administratorName.trim().length > 0
        );

    if (!hasValidAdministratorName) {
        throw new TypeError(
            CALENDAR_WORKSPACE_MESSAGES
                .INVALID_ADMINISTRATOR_NAME,
        );
    }

    if (typeof onLogout !== 'function') {
        throw new TypeError(
            CALENDAR_WORKSPACE_MESSAGES.INVALID_LOGOUT_HANDLER,
        );
    }

    if (typeof isLoggingOut !== 'boolean') {
        throw new TypeError(
            CALENDAR_WORKSPACE_MESSAGES
                .INVALID_LOGGING_OUT_STATE,
        );
    }

    if (
        logoutError !== null
        && typeof logoutError !== 'string'
    ) {
        throw new TypeError(
            CALENDAR_WORKSPACE_MESSAGES.INVALID_LOGOUT_ERROR,
        );
    }

    const [activeSectionId, setActiveSectionId] = useState(
        CALENDAR_SECTION_IDS.DASHBOARD,
    );

    const normalizedAdministratorName =
        administratorName?.trim() ?? '';
    const hasVisibleLogoutError =
        typeof logoutError === 'string'
        && logoutError.trim().length > 0;

    let activeContent = <EmptyCalendarDashboard />;

    if (activeSectionId === CALENDAR_SECTION_IDS.LESSONS) {
        activeContent = (
            <EmptyCalendarSection title="Gerenciar aulas" />
        );
    } else if (
        activeSectionId === CALENDAR_SECTION_IDS.MATERIALS
    ) {
        activeContent = (
            <EmptyCalendarSection title="Links de Materiais" />
        );
    } else if (
        activeSectionId === CALENDAR_SECTION_IDS.CALENDAR
    ) {
        activeContent = (
            <EmptyCalendarSection title="Calendário Visual" />
        );
    }

    return (
        <main className="calendar-workspace">
            <header className="calendar-workspace-header">
                <div>
                    <h1 id={CALENDAR_WORKSPACE_IDS.TITLE}>
                        Calendário de Aulas
                    </h1>

                    <p className="calendar-workspace-owner">
                        Prof. Dionísio Pereira — Senac Ceilândia
                    </p>
                </div>

                <div className="calendar-workspace-session">
                    <p role="status">
                        {normalizedAdministratorName
                            ? 'Sessão de '
                                + normalizedAdministratorName
                            : 'Sessão administrativa ativa'}
                    </p>

                    {hasVisibleLogoutError && (
                        <p
                            id={CALENDAR_WORKSPACE_IDS.LOGOUT_ERROR}
                            className="login-form-error"
                            role="alert"
                        >
                            {logoutError}
                        </p>
                    )}

                    <LogoutButton
                        onLogout={onLogout}
                        isSubmitting={isLoggingOut}
                    />
                </div>
            </header>

            <CalendarNavigation
                activeSectionId={activeSectionId}
                onSectionChange={setActiveSectionId}
            />

            <div
                className="calendar-workspace-content"
                aria-live="polite"
            >
                {activeContent}
            </div>
        </main>
    );
}

export {
    CALENDAR_DASHBOARD_EMPTY_MESSAGES,
    CALENDAR_WORKSPACE_IDS,
    CALENDAR_WORKSPACE_MESSAGES,
    CalendarWorkspace,
};
