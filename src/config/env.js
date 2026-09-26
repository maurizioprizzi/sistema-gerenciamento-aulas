'use strict';

const { z } = require('zod');

/**
 * Limites aceitos para o custo computacional do bcrypt.
 *
 * PasswordHasher valida esses limites novamente quando usado isoladamente.
 */
const MIN_PASSWORD_HASH_ROUNDS = 10;
const MAX_PASSWORD_HASH_ROUNDS = 15;
const DEFAULT_PASSWORD_HASH_ROUNDS = 12;

/**
 * O bcrypt considera somente os primeiros 72 bytes da senha.
 */
const BCRYPT_MAX_PASSWORD_BYTES = 72;

/**
 * O futuro convite inicial será gerado com 32 bytes aleatórios e representado
 * por 64 caracteres hexadecimais.
 *
 * Neste marco, a configuração é opcional e ainda não é utilizada por uma rota.
 */
const INITIAL_SETUP_TOKEN_PATTERN = /^[a-fA-F0-9]{64}$/;

const environmentSchema = z.object({
    NODE_ENV: z
        .enum(['development', 'test', 'production'])
        .default('development'),

    HOST: z
        .string()
        .trim()
        .min(1, 'HOST não pode estar vazio.')
        .default('0.0.0.0'),

    /**
     * A conversão e a validação final da porta pertencem a resolvePort.
     */
    PORT: z
        .string()
        .regex(/^\d+$/, 'PORT deve conter somente algarismos.')
        .default('3000'),

    MONGODB_URI: z
        .string()
        .trim()
        .regex(
            /^mongodb(\+srv)?:\/\//,
            'MONGODB_URI deve começar com mongodb:// ou mongodb+srv://.',
        ),

    SESSION_SECRET: z
        .string()
        .refine(
            (secret) => secret.trim().length > 0,
            'SESSION_SECRET não pode conter somente espaços.',
        )
        .min(
            32,
            'SESSION_SECRET deve possuir pelo menos 32 caracteres.',
        ),

    PASSWORD_HASH_ROUNDS: z.coerce
        .number()
        .int('PASSWORD_HASH_ROUNDS deve ser um número inteiro.')
        .min(
            MIN_PASSWORD_HASH_ROUNDS,
            'PASSWORD_HASH_ROUNDS deve ser no mínimo 10.',
        )
        .max(
            MAX_PASSWORD_HASH_ROUNDS,
            'PASSWORD_HASH_ROUNDS deve ser no máximo 15.',
        )
        .default(DEFAULT_PASSWORD_HASH_ROUNDS),

    /**
     * Estes campos continuam obrigatórios no fluxo administrativo atual.
     * Só serão revistos quando o novo fluxo de primeiro acesso estiver
     * implementado e testado.
     */
    ADMIN_NAME: z
        .string()
        .trim()
        .min(2, 'ADMIN_NAME deve possuir pelo menos 2 caracteres.')
        .max(100, 'ADMIN_NAME deve possuir no máximo 100 caracteres.'),

    ADMIN_EMAIL: z
        .string()
        .trim()
        .email('ADMIN_EMAIL deve conter um e-mail válido.')
        .transform((email) => email.toLowerCase()),

    ADMIN_PASSWORD: z
        .string()
        .min(
            12,
            'ADMIN_PASSWORD deve possuir pelo menos 12 caracteres.',
        )
        .max(
            200,
            'ADMIN_PASSWORD deve possuir no máximo 200 caracteres.',
        )
        .refine(
            (password) => (
                Buffer.byteLength(password, 'utf8') <=
                BCRYPT_MAX_PASSWORD_BYTES
            ),
            'ADMIN_PASSWORD deve possuir no máximo 72 bytes em UTF-8.',
        ),

    /**
     * Reservado para o convite de primeiro acesso.
     *
     * Nenhum valor é definido no código. O campo pode ficar ausente enquanto
     * as demais partes do fluxo ainda não foram construídas.
     */
    INITIAL_SETUP_TOKEN: z
        .string()
        .regex(
            INITIAL_SETUP_TOKEN_PATTERN,
            'INITIAL_SETUP_TOKEN deve conter 64 caracteres hexadecimais.',
        )
        .optional(),

    SESSION_HOURS: z.coerce
        .number()
        .int('SESSION_HOURS deve ser um número inteiro.')
        .min(1, 'SESSION_HOURS deve ser no mínimo 1.')
        .max(168, 'SESSION_HOURS deve ser no máximo 168.')
        .default(8),

    APP_ORIGIN: z
        .string()
        .url('APP_ORIGIN deve conter uma URL válida.')
        .refine(
            (value) => {
                const protocol = new URL(value).protocol;

                return protocol === 'http:' || protocol === 'https:';
            },
            'APP_ORIGIN deve utilizar http:// ou https://.',
        ),

    TRUST_PROXY: z
        .enum(['0', '1'])
        .default('0'),
});

/**
 * Valida e normaliza a configuração da aplicação.
 *
 * As mensagens de erro identificam campos, sem repetir os valores recebidos.
 *
 * @param {NodeJS.ProcessEnv | Record<string, string>} source
 * Variáveis de ambiente a validar.
 * @returns {Readonly<object>} Configuração imutável.
 */
function loadEnvironment(source = process.env) {
    const result = environmentSchema.safeParse(source);

    if (!result.success) {
        const details = result.error.issues
            .map((issue) => {
                const field = issue.path.join('.') || 'configuração';

                return `- ${field}: ${issue.message}`;
            })
            .join('\n');

        throw new Error(
            `As variáveis de ambiente são inválidas:\n${details}`,
        );
    }

    const environment = result.data;

    return Object.freeze({
        ...environment,
        TRUST_PROXY: environment.TRUST_PROXY === '1',
        IS_PRODUCTION: environment.NODE_ENV === 'production',
        SESSION_MAX_AGE_MS:
            environment.SESSION_HOURS * 60 * 60 * 1000,
    });
}

module.exports = {
    loadEnvironment,
};