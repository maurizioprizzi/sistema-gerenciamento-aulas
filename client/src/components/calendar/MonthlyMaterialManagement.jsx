import {
    useCallback,
    useEffect,
    useRef,
    useState,
} from 'react';

import {
    MonthlyMaterialApiError,
    monthlyMaterialApi,
} from '../../services/MonthlyMaterialApi.js';
import { MonthlyMaterialForm } from './MonthlyMaterialForm.jsx';

const MONTHLY_MATERIAL_MANAGEMENT_IDS = Object.freeze({
    TITLE: 'monthly-material-management-title',
    RESULTS: 'monthly-material-management-results',
    ERROR: 'monthly-material-management-error',
});

const MONTHLY_MATERIAL_MANAGEMENT_MESSAGES = Object.freeze({
    INVALID_MATERIAL_SERVICE:
        'O gerenciamento mensal exige um serviço completo de materiais válido.',
    INVALID_CONFIRMATION:
        'O gerenciamento mensal exige uma confirmação de exclusão válida.',
    INVALID_CHANGED_HANDLER:
        'O gerenciamento mensal exige uma função de atualização válida.',
    INVALID_MONTH:
        'O gerenciamento mensal recebeu um mês inválido.',
    EMPTY: 'Nenhum material mensal cadastrado.',
    LOADING: 'Carregando materiais mensais...',
    CONFIRM_DELETE:
        'Tem certeza que deseja excluir este material mensal?',
    UNEXPECTED_LIST_ERROR:
        'Não foi possível consultar os materiais agora. Tente novamente em instantes.',
    UNEXPECTED_DELETE_ERROR:
        'Não foi possível excluir o material agora. Tente novamente em instantes.',
});

const CALENDAR_MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
const MONTH_NAMES = Object.freeze([
    'Janeiro',
    'Fevereiro',
    'Março',
    'Abril',
    'Maio',
    'Junho',
    'Julho',
    'Agosto',
    'Setembro',
    'Outubro',
    'Novembro',
    'Dezembro',
]);

/**
 * Formata YYYY-MM da mesma maneira utilizada pelo protótipo original.
 *
 * @param {unknown} month Mês civil recebido.
 * @returns {string} Mês e ano para apresentação.
 */
function formatCalendarMonth(month) {
    if (
        typeof month !== 'string'
        || !CALENDAR_MONTH_PATTERN.test(month)
        || Number(month.slice(0, 4)) < 1
    ) {
        throw new TypeError(
            MONTHLY_MATERIAL_MANAGEMENT_MESSAGES.INVALID_MONTH,
        );
    }

    const [year, monthNumber] = month.split('-');

    return `${MONTH_NAMES[Number(monthNumber) - 1]} ${year}`;
}

/**
 * Confirmação padrão utilizada somente no navegador real.
 *
 * @returns {boolean} Decisão do administrador.
 */
function defaultConfirmDeletion() {
    return globalThis.confirm(
        MONTHLY_MATERIAL_MANAGEMENT_MESSAGES.CONFIRM_DELETE,
    );
}

/**
 * Mantém o componente utilizável isoladamente quando nenhuma área externa
 * precisa reagir às alterações mensais.
 *
 * @returns {void}
 */
function defaultMaterialsChangedHandler() {}

/**
 * Mantém uma coleção mensal em ordem decrescente e sem meses duplicados.
 *
 * @param {ReadonlyArray<object>} currentMaterials Coleção atual.
 * @param {object} savedMaterial Estado confirmado pela API.
 * @returns {ReadonlyArray<object>} Nova coleção protegida.
 */
function mergeSavedMonthlyMaterial(currentMaterials, savedMaterial) {
    return Object.freeze([
        savedMaterial,
        ...currentMaterials.filter(
            (material) => material.month !== savedMaterial.month,
        ),
    ].sort((first, second) => (
        second.month.localeCompare(first.month)
    )));
}

/**
 * Lista, cadastra e exclui os links aplicáveis a um mês inteiro.
 *
 * @param {object} props Propriedades do componente.
 * @param {{ listMonthlyMaterials: Function,
 * saveMonthlyMaterial: Function, deleteMonthlyMaterial: Function }}
 * [props.monthlyMaterialService=monthlyMaterialApi] Serviço HTTP.
 * @param {Function} [props.confirmDeletion=defaultConfirmDeletion]
 * Confirmação substituível para testes.
 * @param {Function} [props.onMaterialsChanged]
 * Notificação executada depois de uma gravação ou exclusão confirmada.
 * @returns {import('react').ReactElement} Gerenciamento mensal.
 */
function MonthlyMaterialManagement({
    monthlyMaterialService = monthlyMaterialApi,
    confirmDeletion = defaultConfirmDeletion,
    onMaterialsChanged = defaultMaterialsChangedHandler,
} = {}) {
    const isValidMaterialService =
        monthlyMaterialService !== null
        && typeof monthlyMaterialService === 'object'
        && !Array.isArray(monthlyMaterialService)
        && typeof monthlyMaterialService.listMonthlyMaterials
            === 'function'
        && typeof monthlyMaterialService.saveMonthlyMaterial
            === 'function'
        && typeof monthlyMaterialService.deleteMonthlyMaterial
            === 'function';

    if (!isValidMaterialService) {
        throw new TypeError(
            MONTHLY_MATERIAL_MANAGEMENT_MESSAGES
                .INVALID_MATERIAL_SERVICE,
        );
    }

    if (typeof confirmDeletion !== 'function') {
        throw new TypeError(
            MONTHLY_MATERIAL_MANAGEMENT_MESSAGES
                .INVALID_CONFIRMATION,
        );
    }

    if (typeof onMaterialsChanged !== 'function') {
        throw new TypeError(
            MONTHLY_MATERIAL_MANAGEMENT_MESSAGES
                .INVALID_CHANGED_HANDLER,
        );
    }

    const [materials, setMaterials] = useState(
        () => Object.freeze([]),
    );
    const [isLoading, setIsLoading] = useState(true);
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [deletingMonth, setDeletingMonth] = useState(null);
    const [errorMessage, setErrorMessage] = useState(null);
    const isMountedRef = useRef(false);
    const requestIdRef = useRef(0);

    const loadMaterials = useCallback(async () => {
        const requestId = requestIdRef.current + 1;

        requestIdRef.current = requestId;
        setIsLoading(true);
        setErrorMessage(null);

        try {
            const receivedMaterials = await monthlyMaterialService
                .listMonthlyMaterials();

            if (
                isMountedRef.current
                && requestId === requestIdRef.current
            ) {
                setMaterials(receivedMaterials);
            }
        } catch (error) {
            if (
                isMountedRef.current
                && requestId === requestIdRef.current
            ) {
                setErrorMessage(
                    error instanceof MonthlyMaterialApiError
                        ? error.message
                        : MONTHLY_MATERIAL_MANAGEMENT_MESSAGES
                            .UNEXPECTED_LIST_ERROR,
                );
            }
        } finally {
            if (
                isMountedRef.current
                && requestId === requestIdRef.current
            ) {
                setIsLoading(false);
            }
        }
    }, [monthlyMaterialService]);

    useEffect(() => {
        isMountedRef.current = true;
        loadMaterials();

        return () => {
            isMountedRef.current = false;
            requestIdRef.current += 1;
        };
    }, [loadMaterials]);

    function handleMaterialSaved(savedMaterial) {
        requestIdRef.current += 1;
        setMaterials((currentMaterials) => (
            mergeSavedMonthlyMaterial(
                currentMaterials,
                savedMaterial,
            )
        ));
        setIsLoading(false);
        setErrorMessage(null);
        setIsFormOpen(false);
        onMaterialsChanged();
    }

    async function handleDelete(material) {
        if (!confirmDeletion()) {
            return;
        }

        const requestId = requestIdRef.current + 1;

        requestIdRef.current = requestId;
        setDeletingMonth(material.month);
        setErrorMessage(null);

        try {
            await monthlyMaterialService.deleteMonthlyMaterial(
                material.month,
            );

            if (
                isMountedRef.current
                && requestId === requestIdRef.current
            ) {
                setMaterials((currentMaterials) => Object.freeze(
                    currentMaterials.filter(
                        (currentMaterial) => (
                            currentMaterial.month !== material.month
                        ),
                    ),
                ));
                onMaterialsChanged();
            }
        } catch (error) {
            if (
                isMountedRef.current
                && requestId === requestIdRef.current
            ) {
                setErrorMessage(
                    error instanceof MonthlyMaterialApiError
                        ? error.message
                        : MONTHLY_MATERIAL_MANAGEMENT_MESSAGES
                            .UNEXPECTED_DELETE_ERROR,
                );
            }
        } finally {
            if (
                isMountedRef.current
                && requestId === requestIdRef.current
            ) {
                setDeletingMonth(null);
            }
        }
    }

    return (
        <section
            className="monthly-material-management calendar-content-section"
            aria-labelledby={MONTHLY_MATERIAL_MANAGEMENT_IDS.TITLE}
        >
            <div className="monthly-material-management-heading">
                <div>
                    <h2 id={MONTHLY_MATERIAL_MANAGEMENT_IDS.TITLE}>
                        Materiais por mês
                    </h2>
                    <p>
                        Cadastre links que valem para o mês inteiro.
                    </p>
                </div>

                <button
                    type="button"
                    onClick={() => setIsFormOpen(true)}
                >
                    Adicionar link mensal
                </button>
            </div>

            {isFormOpen && (
                <div
                    className="monthly-material-dialog"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="monthly-material-form-title"
                >
                    <MonthlyMaterialForm
                        monthlyMaterialService={monthlyMaterialService}
                        onMaterialSaved={handleMaterialSaved}
                        onCancel={() => setIsFormOpen(false)}
                    />
                </div>
            )}

            <div
                id={MONTHLY_MATERIAL_MANAGEMENT_IDS.RESULTS}
                className="monthly-material-management-results"
                aria-live="polite"
                aria-busy={isLoading}
            >
                {isLoading && (
                    <p>{MONTHLY_MATERIAL_MANAGEMENT_MESSAGES.LOADING}</p>
                )}

                {!isLoading && errorMessage && (
                    <div
                        id={MONTHLY_MATERIAL_MANAGEMENT_IDS.ERROR}
                        className="monthly-material-management-error"
                        role="alert"
                    >
                        <p>{errorMessage}</p>
                        <button type="button" onClick={loadMaterials}>
                            Tentar novamente
                        </button>
                    </div>
                )}

                {!isLoading && !errorMessage && materials.length === 0 && (
                    <p className="calendar-empty-state">
                        {MONTHLY_MATERIAL_MANAGEMENT_MESSAGES.EMPTY}
                    </p>
                )}

                {!isLoading && materials.length > 0 && (
                    <div className="monthly-material-table-wrapper">
                        <table className="monthly-material-table">
                            <caption className="visually-hidden">
                                Materiais mensais cadastrados
                            </caption>
                            <thead>
                                <tr>
                                    <th scope="col">Mês</th>
                                    <th scope="col">Link do PA</th>
                                    <th scope="col">Link do GD + AD</th>
                                    <th scope="col">Ações</th>
                                </tr>
                            </thead>
                            <tbody>
                                {materials.map((material) => (
                                    <tr key={material.id}>
                                        <th scope="row">
                                            {formatCalendarMonth(
                                                material.month,
                                            )}
                                        </th>
                                        <td>
                                            {material.lessonPlanUrl
                                                ? (
                                                    <a
                                                        href={material.lessonPlanUrl}
                                                        target="_blank"
                                                        rel="noreferrer noopener"
                                                    >
                                                        Abrir PA
                                                    </a>
                                                )
                                                : '—'}
                                        </td>
                                        <td>
                                            {material.studentGuideUrl
                                                ? (
                                                    <a
                                                        href={material.studentGuideUrl}
                                                        target="_blank"
                                                        rel="noreferrer noopener"
                                                    >
                                                        Abrir GD+AD
                                                    </a>
                                                )
                                                : '—'}
                                        </td>
                                        <td>
                                            <button
                                                type="button"
                                                disabled={
                                                    deletingMonth !== null
                                                }
                                                onClick={() => (
                                                    handleDelete(material)
                                                )}
                                            >
                                                {deletingMonth
                                                    === material.month
                                                    ? 'Excluindo...'
                                                    : 'Excluir'}
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </section>
    );
}

export {
    MONTHLY_MATERIAL_MANAGEMENT_IDS,
    MONTHLY_MATERIAL_MANAGEMENT_MESSAGES,
    MONTH_NAMES,
    MonthlyMaterialManagement,
    defaultConfirmDeletion,
    defaultMaterialsChangedHandler,
    formatCalendarMonth,
    mergeSavedMonthlyMaterial,
};
