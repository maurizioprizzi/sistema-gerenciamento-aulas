/**
 * Composição principal da interface administrativa.
 *
 * Neste primeiro incremento, o componente estabelece somente a estrutura
 * semântica da tela de acesso. A autenticação será adicionada por componentes
 * próprios, mantendo App livre de detalhes de formulário e comunicação HTTP.
 *
 * @returns {import('react').ReactElement} Estrutura principal da aplicação.
 */
const DATE_LOCALE = 'pt-BR';

/**
 * Produz os textos exibidos pelo pequeno calendário da tela de acesso.
 *
 * A data é lida no navegador para respeitar o dia local do usuário. A parte
 * utilizada pelo atributo dateTime também é montada com valores locais; usar
 * toISOString() poderia deslocar o dia em alguns fusos horários.
 *
 * @param {Date} date Data que será apresentada.
 * @returns {{ month: string, day: string, machineDate: string,
 * accessibleLabel: string }} Valores prontos para a interface.
 */
function createCurrentDatePresentation(date = new Date()) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
        throw new TypeError(
            'Uma data válida é necessária para montar o calendário.',
        );
    }

    const month = new Intl.DateTimeFormat(
        DATE_LOCALE,
        { month: 'long' },
    ).format(date);

    const day = new Intl.DateTimeFormat(
        DATE_LOCALE,
        { day: '2-digit' },
    ).format(date);

    const accessibleDate = new Intl.DateTimeFormat(
        DATE_LOCALE,
        { dateStyle: 'long' },
    ).format(date);

    const machineDate = [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, '0'),
        String(date.getDate()).padStart(2, '0'),
    ].join('-');

    return {
        month,
        day,
        machineDate,
        accessibleLabel: 'Hoje, ' + accessibleDate + '.',
    };
}

function App() {
    const currentDate = createCurrentDatePresentation();

    return (
        <main className="app-shell">
            <section
                className="app-introduction"
                aria-labelledby="application-title"
            >
                <time
                    className="app-symbol"
                    dateTime={currentDate.machineDate}
                    aria-label={currentDate.accessibleLabel}
                >
                    <span
                        className="app-symbol-month"
                        aria-hidden="true"
                    >
                        {currentDate.month}
                    </span>

                    <span
                        className="app-symbol-day"
                        aria-hidden="true"
                    >
                        {currentDate.day}
                    </span>
                </time>

                <p className="app-context">
                    Senac Ceilândia
                </p>

                <h1 id="application-title">
                    Calendário de Aulas
                </h1>

                <p className="app-owner">
                    Prof. Dionísio Pereira
                </p>
            </section>

            <section
                className="authentication-panel"
                aria-labelledby="authentication-title"
            >
                <p className="authentication-label">
                    Área administrativa
                </p>

                <h2 id="authentication-title">
                    Acesso ao calendário
                </h2>

                <p className="authentication-description">
                    Entre com sua conta para consultar e organizar as aulas.
                </p>
            </section>
        </main>
    );
}

export { App };
