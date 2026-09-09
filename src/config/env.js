'use strict';

const { z } = require('zod');

/**
 * Limites aceitos para o custo computacional do bcrypt.
 *
 * O serviço PasswordHasher realiza sua própria validação novamente. Essa
 * duplicação intencional cria duas fronteiras:
 *
 * 1. a configuração inválida impede a inicialização da aplicação;
 * 2. o serviço rejeita um custo inseguro mesmo quando utilizado isoladamente.
 */
const MIN_PASSWORD_HASH_ROUNDS = 10;
const MAX_PASSWORD_HASH_ROUNDS = 15;
const DEFAULT_PASSWORD_HASH_ROUNDS = 12;

/**
 * Limite técnico do bcrypt.
 *
 * O bcrypt utiliza somente os primeiros 72 bytes da senha. Como caracteres
 * Unicode podem ocupar mais de um byte, não é suficiente contar caracteres.
 */
const BCRYPT_MAX_PASSWORD_BYTES = 72;

/**
 * Esquema das variáveis de ambiente.
 *
 * O esquema funciona como uma fronteira de segurança: nenhuma configuração
 * será utilizada pelo restante do sistema antes de passar por estas regras.
 *
 * Valores confidenciais nunca são definidos neste arquivo. Eles serão
 * recebidos por parâmetro e, na aplicação real, virão de process.env.
 */
const environmentSchema = z.object({
    /**
     * Identifica o contexto em que a aplicação está sendo executada.
     */
    NODE_ENV: z
        .enum(['development', 'test', 'production'])
        .default('development'),

    /**
     * Interface de rede em que o servidor aceitará conexões.
     */
    HOST: z
        .string()
        .trim()
        .min(1, 'HOST não pode estar vazio.')
        .default('0.0.0.0'),

    /**
     * Mantemos a porta como texto neste módulo.
     *
     * A conversão final continua sob responsabilidade de resolvePort, cuja
     * validação já está coberta pelos testes de server.js.
     */
    PORT: z
        .string()
        .regex(/^\d+$/, 'PORT deve conter somente algarismos.')
        .default('3000'),

    /**
     * Aceita endereços locais do MongoDB e conexões MongoDB Atlas.
     */
    MONGODB_URI: z
        .string()
        .trim()
        .regex(
            /^mongodb(\+srv)?:\/\//,
            'MONGODB_URI deve começar com mongodb:// ou mongodb+srv://.',
        ),

    /**
     * Exige um segredo longo para dificultar falsificação de sessões.
     */
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

    /**
     * Custo computacional utilizado na criação de hashes bcrypt.
     *
     * O valor chega como texto pelas variáveis de ambiente e é convertido
     * para número somente depois de passar pelas regras abaixo.
     */
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
     * Dados utilizados futuramente para criar a primeira conta administrativa.
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

    /**
     * A senha não utiliza trim ou qualquer transformação.
     *
     * Espaços podem fazer parte de uma senha legítima. O limite de 200
     * caracteres protege a entrada geral, enquanto a regra de 72 bytes trata
     * especificamente o limite técnico do bcrypt.
     */
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
     * Converte o texto do ambiente em número após validar seus limites.
     */
    SESSION_HOURS: z.coerce
        .number()
        .int('SESSION_HOURS deve ser um número inteiro.')
        .min(1, 'SESSION_HOURS deve ser no mínimo 1.')
        .max(168, 'SESSION_HOURS deve ser no máximo 168.')
        .default(8),

    /**
     * Endereço autorizado a executar o frontend.
     */
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

    /**
     * O valor permanece explícito como 0 ou 1 no arquivo de ambiente e é
     * convertido em booleano depois da validação.
     */
    TRUST_PROXY: z
        .enum(['0', '1'])
        .default('0'),
});

/**
 * Valida e normaliza as variáveis utilizadas pela aplicação.
 *
 * A função recebe a origem dos dados por parâmetro para facilitar testes.
 * Por padrão, ela utiliza process.env.
 *
 * @param {NodeJS.ProcessEnv | Record<string, string>} source
 * Variáveis que serão analisadas.
 *
 * @returns {Readonly<object>} Configuração validada e imutável.
 *
 * @throws {Error} Quando uma ou mais variáveis são inválidas.
 */
function loadEnvironment(source = process.env) {
    const result = environmentSchema.safeParse(source);

    if (!result.success) {
        /**
         * Não incluímos os valores recebidos na mensagem.
         *
         * Isso evita que senhas, tokens ou endereços confidenciais sejam
         * acidentalmente registrados nos logs.
         */
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

    /**
     * Object.freeze evita alterações acidentais da configuração durante a
     * execução do processo.
     */
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
