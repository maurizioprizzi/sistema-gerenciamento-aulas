'use strict';

/**
 * Chave reservada para a identidade autenticada dentro da sessão.
 *
 * O navegador recebe somente o identificador opaco da sessão. Este conteúdo
 * permanece no armazenamento MongoDB administrado pelo express-session.
 */
const SESSION_AUTHENTICATION_KEY = 'authentication';

/**
 * Mensagens estáveis utilizadas nas validações do serviço.
 *
 * Nenhuma mensagem contém identificadores de usuário, cookies ou dados da
 * sessão.
 */
const SESSION_MANAGER_ERRORS = Object.freeze({
    INVALID_REQUEST:
        'Uma requisição com sessão válida é necessária.',
    INVALID_IDENTITY:
        'Uma identidade autenticada válida é necessária.',
    INVALID_REGENERATED_SESSION:
        'A sessão regenerada não possui uma interface válida.',
});

/**
 * Verifica se o valor é um objeto comum utilizável pelo serviço.
 *
 * @param {unknown} value Valor recebido.
 * @returns {boolean} Verdadeiro quando o valor é um objeto não nulo e não é
 * uma lista.
 */
function isObject(value) {
    return (
        value !== null
        && typeof value === 'object'
        && !Array.isArray(value)
    );
}

/**
 * Executa uma operação assíncrona do express-session como Promise.
 *
 * Os métodos regenerate, save e destroy seguem o padrão de callback do
 * Node.js. A conversão permite que o restante do serviço utilize async/await
 * sem ignorar falhas do armazenamento.
 *
 * @param {object} session Sessão atual da requisição.
 * @param {'regenerate' | 'save' | 'destroy'} methodName Operação executada.
 * @returns {Promise<void>}
 */
function runSessionOperation(session, methodName) {
    return new Promise((resolve, reject) => {
        session[methodName]((error) => {
            if (error) {
                reject(error);
                return;
            }

            resolve();
        });
    });
}

/**
 * Gerencia o ciclo de vida de uma sessão autenticada.
 *
 * O serviço recebe a requisição porque regenerate() pode substituir
 * request.session por um novo objeto. Depois da regeneração, a referência
 * precisa ser obtida novamente antes de gravar a identidade.
 */
class SessionManager {
    /**
     * Valida a presença da sessão e das operações exigidas.
     *
     * @param {unknown} request Requisição que será validada.
     * @param {string[]} requiredMethods Métodos obrigatórios da sessão.
     * @param {string} errorMessage Mensagem usada em caso de falha.
     * @throws {TypeError} Quando a interface estiver incompleta.
     */
    static validateRequest(
        request,
        requiredMethods,
        errorMessage = SESSION_MANAGER_ERRORS.INVALID_REQUEST,
    ) {
        const session = isObject(request)
            ? request.session
            : null;

        const isValid =
            isObject(session)
            && requiredMethods.every(
                (methodName) =>
                    typeof session[methodName] === 'function',
            );

        if (!isValid) {
            throw new TypeError(errorMessage);
        }
    }

    /**
     * Produz a representação mínima que será persistida na sessão.
     *
     * Nome e e-mail não são necessários para autorização. Eles permanecem na
     * identidade devolvida pelo AuthenticationService, mas não são duplicados
     * no armazenamento de sessões.
     *
     * @param {unknown} identity Identidade autenticada.
     * @returns {Readonly<{ userId: string, role: string }>}
     * Identidade mínima e imutável.
     * @throws {TypeError} Quando faltam identificador ou papel.
     */
    static createSessionIdentity(identity) {
        const hasValidId =
            isObject(identity)
            && typeof identity.id === 'string'
            && identity.id.trim().length > 0;

        const hasValidRole =
            isObject(identity)
            && typeof identity.role === 'string'
            && identity.role.trim().length > 0;

        if (!hasValidId || !hasValidRole) {
            throw new TypeError(
                SESSION_MANAGER_ERRORS.INVALID_IDENTITY,
            );
        }

        return Object.freeze({
            userId: identity.id.trim(),
            role: identity.role.trim(),
        });
    }

    /**
     * Regenera e estabelece uma sessão autenticada.
     *
     * A regeneração acontece antes da gravação da identidade. Dessa forma, um
     * identificador de sessão fornecido antes do login não continua válido
     * depois da autenticação, reduzindo o risco de fixação de sessão.
     *
     * A sessão é salva explicitamente antes que o controlador envie a
     * resposta. Se a gravação falhar, a identidade é removida e uma tentativa
     * de destruição é realizada para impedir o reaproveitamento do estado.
     *
     * @param {object} request Requisição processada pelo express-session.
     * @param {object} identity Identidade criada pelo AuthenticationService.
     * @returns {Promise<Readonly<{ userId: string, role: string }>>}
     */
    async establish(request, identity) {
        const sessionIdentity =
            SessionManager.createSessionIdentity(identity);

        SessionManager.validateRequest(
            request,
            ['regenerate'],
        );

        const previousSession = request.session;

        await runSessionOperation(
            previousSession,
            'regenerate',
        );

        /**
         * O express-session substitui request.session depois da regeneração.
         * Validamos novamente a nova referência antes de utilizá-la.
         */
        SessionManager.validateRequest(
            request,
            ['save', 'destroy'],
            SESSION_MANAGER_ERRORS.INVALID_REGENERATED_SESSION,
        );

        const regeneratedSession = request.session;

        regeneratedSession[SESSION_AUTHENTICATION_KEY] =
            sessionIdentity;

        try {
            await runSessionOperation(
                regeneratedSession,
                'save',
            );
        } catch (error) {
            /**
             * A identidade é removida antes da propagação. Assim, o
             * express-session não poderá tentar persistir posteriormente um
             * estado autenticado cuja gravação explícita falhou.
             */
            delete regeneratedSession[
                SESSION_AUTHENTICATION_KEY
            ];

            try {
                await runSessionOperation(
                    regeneratedSession,
                    'destroy',
                );
            } catch {
                /**
                 * A falha original de gravação continua sendo a informação
                 * mais importante. O controlador e o tratamento central
                 * receberão esse erro sem substituí-lo por uma falha de
                 * limpeza posterior.
                 */
            }

            throw error;
        }

        return sessionIdentity;
    }

    /**
     * Destrói a sessão atual durante a saída administrativa.
     *
     * A remoção do cookie pertence ao controlador HTTP, pois exige acesso à
     * resposta e às opções do ambiente. Este serviço cuida somente do estado
     * armazenado no servidor.
     *
     * @param {object} request Requisição processada pelo express-session.
     * @returns {Promise<void>}
     */
    async destroy(request) {
        SessionManager.validateRequest(
            request,
            ['destroy'],
        );

        await runSessionOperation(
            request.session,
            'destroy',
        );
    }
}

/**
 * Instância padrão utilizada pelos futuros controladores HTTP.
 */
const sessionManager = new SessionManager();

module.exports = {
    SESSION_AUTHENTICATION_KEY,
    SESSION_MANAGER_ERRORS,
    SessionManager,
    sessionManager,
};
