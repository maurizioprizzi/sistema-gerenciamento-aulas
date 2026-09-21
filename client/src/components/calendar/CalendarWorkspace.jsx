import { useState } from 'react';

import { lessonApi } from '../../services/LessonApi.js';
import {
    monthlyMaterialApi,
} from '../../services/MonthlyMaterialApi.js';
import { LogoutButton } from '../authentication/LogoutButton.jsx';
import {
    CALENDAR_SECTION_IDS,
    CalendarNavigation,
} from './CalendarNavigation.jsx';
import { CalendarDashboard } from './CalendarDashboard.jsx';
import { LessonManagement } from './LessonManagement.jsx';
import { MaterialManagement } from './MaterialManagement.jsx';

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
    INVALID_LESSON_SERVICE:
        'A área do calendário exige um serviço de aulas válido.',
    INVALID_MONTHLY_MATERIAL_SERVICE:
        'A área do calendário exige um serviço de materiais mensais válido.',
});

/**
 * Apresenta o título de uma seção cujo conteúdo ainda não foi implementado.
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
 * O componente coordena a navegação entre as quatro seções originais. As
 * operações persistentes permanecem encapsuladas nos componentes de aulas e
 * materiais, enquanto autenticação e encerramento de sessão continuam fora
 * desta camada.
 *
 * @param {object} props Propriedades da área autenticada.
 * @param {string | null} [props.administratorName=null]
 * Nome público do administrador autenticado.
 * @param {Function} props.onLogout Função que solicita a saída.
 * @param {boolean} [props.isLoggingOut=false] Indica saída em andamento.
 * @param {string | null} [props.logoutError=null] Erro público da saída.
 * @param {{ listLessons: Function, createLesson: Function }}
 * [props.lessonService=lessonApi]
 * Serviço de aulas substituível nos testes.
 * @param {{ listMonthlyMaterials: Function,
 * saveMonthlyMaterial: Function, deleteMonthlyMaterial: Function }}
 * [props.monthlyMaterialService=monthlyMaterialApi]
 * Serviço mensal substituível nos testes.
 * @returns {import('react').ReactElement} Área autenticada do calendário.
 */
function CalendarWorkspace({
    administratorName = null,
    onLogout,
    isLoggingOut = false,
    logoutError = null,
    lessonService = lessonApi,
    monthlyMaterialService = monthlyMaterialApi,
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

    const isValidLessonService =
        lessonService !== null
        && typeof lessonService === 'object'
        && !Array.isArray(lessonService)
        && typeof lessonService.listLessons === 'function'
        && typeof lessonService.createLesson === 'function';

    if (!isValidLessonService) {
        throw new TypeError(
            CALENDAR_WORKSPACE_MESSAGES.INVALID_LESSON_SERVICE,
        );
    }

    const isValidMonthlyMaterialService =
        monthlyMaterialService !== null
        && typeof monthlyMaterialService === 'object'
        && !Array.isArray(monthlyMaterialService)
        && typeof monthlyMaterialService.listMonthlyMaterials
            === 'function'
        && typeof monthlyMaterialService.saveMonthlyMaterial
            === 'function'
        && typeof monthlyMaterialService.deleteMonthlyMaterial
            === 'function';

    if (!isValidMonthlyMaterialService) {
        throw new TypeError(
            CALENDAR_WORKSPACE_MESSAGES
                .INVALID_MONTHLY_MATERIAL_SERVICE,
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

    let activeContent = (
        <CalendarDashboard
            lessonService={lessonService}
            monthlyMaterialService={monthlyMaterialService}
        />
    );

    if (activeSectionId === CALENDAR_SECTION_IDS.LESSONS) {
        activeContent = (
            <LessonManagement lessonService={lessonService} />
        );
    } else if (
        activeSectionId === CALENDAR_SECTION_IDS.MATERIALS
    ) {
        activeContent = (
            <MaterialManagement
                lessonService={lessonService}
                monthlyMaterialService={monthlyMaterialService}
            />
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

            <div className="calendar-workspace-content">
                {activeContent}
            </div>
        </main>
    );
}

export {
    CALENDAR_WORKSPACE_IDS,
    CALENDAR_WORKSPACE_MESSAGES,
    CalendarWorkspace,
};
