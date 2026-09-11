'use strict';

const assert = require('node:assert/strict');
const {
    describe,
    test,
} = require('node:test');

const {
    AUTHENTICATION_CONTROLLER_ERRORS,
    AuthenticationController,
} = require('../src/controllers/AuthenticationController');

function createController() {
    return new AuthenticationController({
        authenticationService: {
            async authenticate() {
                return {};
            },
        },
        sessionManager: {
            async establish() {},
            async destroy() {},
        },
        cookieName: 'calendario.sid',
        isProduction: false,
    });
}

function createResponse() {
    const calls = [];

    return {
        calls,
        response: {
            status(statusCode) {
                calls.push({ method: 'status', statusCode });
                return this;
            },
            json(body) {
                calls.push({ method: 'json', body });
                return this;
            },
        },
    };
}

describe('consulta da sessão administrativa', () => {
    test('retorna somente a identidade mínima autorizada', () => {
        const controller = createController();
        const { response, calls } = createResponse();
        const forwardedErrors = [];

        controller.getSession(
            {
                authenticatedUser: {
                    id: '  usuario-123  ',
                    role: '  admin  ',
                    email: 'nao-deve-aparecer@example.com',
                    passwordHash: 'não deve aparecer',
                },
            },
            response,
            (error) => forwardedErrors.push(error),
        );

        assert.deepEqual(forwardedErrors, []);
        assert.deepEqual(calls, [
            {
                method: 'status',
                statusCode: 200,
            },
            {
                method: 'json',
                body: {
                    data: {
                        authenticated: true,
                        user: {
                            id: 'usuario-123',
                            role: 'admin',
                        },
                    },
                },
            },
        ]);
        assert.equal(
            Object.isFrozen(
                calls[1].body.data.user,
            ),
            true,
        );
    });

    test('mantém o contexto quando o handler é extraído', () => {
        const { getSession } = createController();
        const { response, calls } = createResponse();

        assert.doesNotThrow(() => getSession(
            {
                authenticatedUser: {
                    id: 'usuario-123',
                    role: 'admin',
                },
            },
            response,
            () => {},
        ));

        assert.equal(calls[0].statusCode, 200);
    });

    test('encaminha identidades autorizadas inválidas', () => {
        const invalidIdentities = [
            undefined,
            null,
            {},
            { id: 'usuario-123' },
            { role: 'admin' },
            { id: '', role: 'admin' },
            { id: 'usuario-123', role: '' },
        ];

        for (const authenticatedUser of invalidIdentities) {
            const controller = createController();
            const { response, calls } = createResponse();
            const forwardedErrors = [];

            controller.getSession(
                { authenticatedUser },
                response,
                (error) => forwardedErrors.push(error),
            );

            assert.deepEqual(calls, []);
            assert.equal(forwardedErrors.length, 1);
            assert.equal(
                forwardedErrors[0].name,
                'TypeError',
            );
            assert.equal(
                forwardedErrors[0].message,
                AUTHENTICATION_CONTROLLER_ERRORS
                    .INVALID_AUTHENTICATED_USER,
            );
        }
    });

    test('não altera a identidade recebida', () => {
        const authenticatedUser = Object.freeze({
            id: 'usuario-123',
            role: 'admin',
        });
        const controller = createController();
        const { response } = createResponse();

        controller.getSession(
            { authenticatedUser },
            response,
            () => {},
        );

        assert.deepEqual(authenticatedUser, {
            id: 'usuario-123',
            role: 'admin',
        });
    });
});
