import { useState } from 'react';

import { lessonApi } from '../../services/LessonApi.js';
import {
    monthlyMaterialApi,
} from '../../services/MonthlyMaterialApi.js';
import {
    LessonMaterialManagement,
    defaultTodayProvider,
} from './LessonMaterialManagement.jsx';
import {
    MonthlyMaterialManagement,
    defaultConfirmDeletion,
} from './MonthlyMaterialManagement.jsx';

const MATERIAL_MANAGEMENT_IDS = Object.freeze({
    TITLE: 'material-management-title',
});

const MATERIAL_MANAGEMENT_MESSAGES = Object.freeze({
    INVALID_LESSON_SERVICE:
        'A área de materiais exige um serviço de aulas válido.',
    INVALID_MONTHLY_MATERIAL_SERVICE:
        'A área de materiais exige um serviço mensal completo válido.',
    INVALID_CONFIRMATION:
        'A área de materiais exige uma confirmação de exclusão válida.',
    INVALID_TODAY_PROVIDER:
        'A área de materiais exige um relógio civil válido.',
});

/**
 * Reúne as duas formas de organização previstas no protótipo original.
 *
 * A consulta por aula recebe uma chave de revisão. Sempre que o gerenciamento
 * mensal confirma uma gravação ou exclusão, essa chave muda e solicita uma
 * nova leitura das duas fontes. Assim, os links mensais herdados pelas aulas
 * são atualizados sem compartilhar coleções mutáveis entre os componentes.
 *
 * @param {object} props Dependências da área de materiais.
 * @param {{ listLessons: Function }} [props.lessonService=lessonApi]
 * Serviço utilizado para consultar as aulas.
 * @param {{ listMonthlyMaterials: Function,
 * saveMonthlyMaterial: Function, deleteMonthlyMaterial: Function }}
 * [props.monthlyMaterialService=monthlyMaterialApi]
 * Serviço utilizado para consultar e alterar materiais mensais.
 * @param {Function} [props.confirmDeletion=defaultConfirmDeletion]
 * Confirmação de exclusão substituível nos testes.
 * @param {Function} [props.todayProvider=defaultTodayProvider]
 * Relógio civil substituível nos testes.
 * @returns {import('react').ReactElement} Área completa de materiais.
 */
function MaterialManagement({
    lessonService = lessonApi,
    monthlyMaterialService = monthlyMaterialApi,
    confirmDeletion = defaultConfirmDeletion,
    todayProvider = defaultTodayProvider,
} = {}) {
    const isValidLessonService =
        lessonService !== null
        && typeof lessonService === 'object'
        && !Array.isArray(lessonService)
        && typeof lessonService.listLessons === 'function';

    if (!isValidLessonService) {
        throw new TypeError(
            MATERIAL_MANAGEMENT_MESSAGES.INVALID_LESSON_SERVICE,
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
            MATERIAL_MANAGEMENT_MESSAGES
                .INVALID_MONTHLY_MATERIAL_SERVICE,
        );
    }

    if (typeof confirmDeletion !== 'function') {
        throw new TypeError(
            MATERIAL_MANAGEMENT_MESSAGES.INVALID_CONFIRMATION,
        );
    }

    if (typeof todayProvider !== 'function') {
        throw new TypeError(
            MATERIAL_MANAGEMENT_MESSAGES.INVALID_TODAY_PROVIDER,
        );
    }

    const [monthlyMaterialRevision, setMonthlyMaterialRevision] =
        useState(0);

    /**
     * Sinaliza que a herança mensal das aulas precisa ser recalculada.
     *
     * O retorno a zero evita ultrapassar o maior inteiro seguro mesmo em uma
     * sessão administrativa excepcionalmente longa.
     */
    function handleMonthlyMaterialsChanged() {
        setMonthlyMaterialRevision((currentRevision) => (
            currentRevision === Number.MAX_SAFE_INTEGER
                ? 0
                : currentRevision + 1
        ));
    }

    return (
        <div className="material-management">
            <section
                className="material-management-introduction calendar-content-section"
                aria-labelledby={MATERIAL_MANAGEMENT_IDS.TITLE}
            >
                <h2 id={MATERIAL_MANAGEMENT_IDS.TITLE}>
                    Links de Materiais
                </h2>
                <p>
                    Cadastre os links do Plano de Aula (PA) e do Guia +
                    Atividades do Discente (GD+AD), organizados por aula ou
                    por mês.
                </p>
            </section>

            <LessonMaterialManagement
                lessonService={lessonService}
                monthlyMaterialService={monthlyMaterialService}
                todayProvider={todayProvider}
                refreshKey={monthlyMaterialRevision}
            />

            <MonthlyMaterialManagement
                monthlyMaterialService={monthlyMaterialService}
                confirmDeletion={confirmDeletion}
                onMaterialsChanged={handleMonthlyMaterialsChanged}
            />
        </div>
    );
}

export {
    MATERIAL_MANAGEMENT_IDS,
    MATERIAL_MANAGEMENT_MESSAGES,
    MaterialManagement,
};
