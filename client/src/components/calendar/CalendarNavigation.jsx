/**
 * Identificadores estáveis das seções previstas no calendário original.
 *
 * Os valores também serão utilizados pelos futuros painéis para relacionar
 * cada controle de navegação ao conteúdo correspondente.
 */
const CALENDAR_SECTION_IDS = Object.freeze({
    DASHBOARD: 'dashboard',
    LESSONS: 'lessons',
    MATERIALS: 'materials',
    CALENDAR: 'calendar',
});

/**
 * Seções apresentadas no HTML original do Prof. Dionísio.
 *
 * Tanto a coleção quanto cada item são protegidos contra alterações para que
 * a navegação mantenha um contrato previsível em toda a interface.
 */
const CALENDAR_SECTIONS = Object.freeze([
    Object.freeze({
        id: CALENDAR_SECTION_IDS.DASHBOARD,
        label: 'Painel geral',
        symbol: '📊',
    }),
    Object.freeze({
        id: CALENDAR_SECTION_IDS.LESSONS,
        label: 'Gerenciar aulas',
        symbol: '📝',
    }),
    Object.freeze({
        id: CALENDAR_SECTION_IDS.MATERIALS,
        label: 'Materiais',
        symbol: '📚',
    }),
    Object.freeze({
        id: CALENDAR_SECTION_IDS.CALENDAR,
        label: 'Calendário visual',
        symbol: '📆',
    }),
]);

/**
 * Mensagens estáveis relacionadas à configuração da navegação.
 */
const CALENDAR_NAVIGATION_MESSAGES = Object.freeze({
    INVALID_ACTIVE_SECTION:
        'A navegação exige uma seção ativa válida.',
    INVALID_SECTION_CHANGE_HANDLER:
        'A navegação exige uma função válida para trocar de seção.',
});

/**
 * Verifica se um identificador pertence às seções originais do calendário.
 *
 * @param {unknown} sectionId Identificador recebido pela interface.
 * @returns {boolean} Verdadeiro quando a seção está cadastrada.
 */
function isCalendarSectionId(sectionId) {
    return (
        typeof sectionId === 'string'
        && CALENDAR_SECTIONS.some(
            (section) => section.id === sectionId,
        )
    );
}

/**
 * Navegação principal da área autenticada do calendário.
 *
 * O componente é controlado: ele apresenta a seção recebida e comunica a
 * intenção de mudança ao componente responsável pelo estado. Nenhum dado do
 * calendário é carregado ou alterado nesta camada.
 *
 * @param {object} props Propriedades da navegação.
 * @param {string} props.activeSectionId Seção atualmente apresentada.
 * @param {Function} props.onSectionChange Função que recebe a nova seção.
 * @returns {import('react').ReactElement} Navegação entre as quatro seções.
 */
function CalendarNavigation({
    activeSectionId,
    onSectionChange,
}) {
    if (!isCalendarSectionId(activeSectionId)) {
        throw new TypeError(
            CALENDAR_NAVIGATION_MESSAGES.INVALID_ACTIVE_SECTION,
        );
    }

    if (typeof onSectionChange !== 'function') {
        throw new TypeError(
            CALENDAR_NAVIGATION_MESSAGES
                .INVALID_SECTION_CHANGE_HANDLER,
        );
    }

    return (
        <nav
            className="calendar-navigation"
            aria-label="Seções do calendário"
        >
            <ul className="calendar-navigation-list">
                {CALENDAR_SECTIONS.map((section) => {
                    const isActive =
                        section.id === activeSectionId;

                    return (
                        <li key={section.id}>
                            <button
                                className={
                                    'calendar-navigation-button'
                                    + (isActive ? ' is-active' : '')
                                }
                                type="button"
                                aria-current={
                                    isActive ? 'page' : undefined
                                }
                                onClick={() => {
                                    onSectionChange(section.id);
                                }}
                            >
                                <span aria-hidden="true">
                                    {section.symbol}
                                </span>

                                <span>{section.label}</span>
                            </button>
                        </li>
                    );
                })}
            </ul>
        </nav>
    );
}

export {
    CALENDAR_NAVIGATION_MESSAGES,
    CALENDAR_SECTIONS,
    CALENDAR_SECTION_IDS,
    CalendarNavigation,
    isCalendarSectionId,
};
