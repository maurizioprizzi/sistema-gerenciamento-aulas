'use strict';

const mongoose = require('mongoose');

/**
 * Nome utilizado pelo Mongoose para registrar o modelo.
 *
 * Manter o nome em uma constante evita pequenas diferenças de escrita
 * entre a criação e a recuperação de um modelo já registrado.
 */
const USER_MODEL_NAME = 'User';

/**
 * Papéis reconhecidos pelo sistema.
 *
 * Neste primeiro momento existe somente o administrador, pois a aplicação
 * será utilizada pelo Prof. Dionísio. A estrutura permite acrescentar novos
 * papéis futuramente sem espalhar textos soltos pelo código.
 */
const USER_ROLES = Object.freeze({
    ADMIN: 'admin',
});

/**
 * Expressão regular simples para validar a estrutura básica de um e-mail.
 *
 * A validação definitiva da existência do endereço não pertence ao modelo:
 * isso exigiria, por exemplo, uma confirmação enviada por e-mail.
 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Normaliza nomes antes de armazená-los.
 *
 * Além de remover espaços no início e no fim, a função transforma sequências
 * de espaços em apenas um. Assim, "Dionísio   Pereira" será armazenado como
 * "Dionísio Pereira".
 *
 * @param {unknown} value Valor recebido pelo Mongoose.
 * @returns {unknown} Valor normalizado ou o valor original, quando não é texto.
 */
function normalizeName(value) {
    if (typeof value !== 'string') {
        return value;
    }

    return value.trim().replace(/\s+/g, ' ');
}

/**
 * Normaliza endereços de e-mail.
 *
 * E-mails são convertidos para letras minúsculas e têm espaços externos
 * removidos. Isso evita que "Professor@Exemplo.com" e
 * "professor@exemplo.com" sejam tratados como contas diferentes.
 *
 * @param {unknown} value Valor recebido pelo Mongoose.
 * @returns {unknown} E-mail normalizado ou o valor original.
 */
function normalizeEmail(value) {
    if (typeof value !== 'string') {
        return value;
    }

    return value.trim().toLowerCase();
}

/**
 * Remove informações internas ou confidenciais durante a conversão para JSON.
 *
 * Essa proteção é uma segunda barreira. O campo passwordHash também utiliza
 * select: false, portanto ele não será carregado nas consultas comuns.
 *
 * @param {object} _document Documento original do Mongoose.
 * @param {object} returnedObject Objeto que será convertido para JSON.
 * @returns {object} Objeto público e seguro.
 */
function removePrivateFields(_document, returnedObject) {
    delete returnedObject.passwordHash;
    delete returnedObject.__v;

    return returnedObject;
}

/**
 * Cria o schema de usuários.
 *
 * A criação foi isolada em uma função para permitir testes com uma instância
 * independente do Mongoose, sem precisar conectar a um MongoDB real.
 *
 * @param {typeof mongoose} mongooseClient Instância compatível com o Mongoose.
 * @returns {mongoose.Schema} Schema configurado.
 */
function createUserSchema(mongooseClient = mongoose) {
    if (
        !mongooseClient ||
        typeof mongooseClient.Schema !== 'function'
    ) {
        throw new TypeError(
            'Uma instância válida do Mongoose é necessária para criar o schema de usuário.',
        );
    }

    const userSchema = new mongooseClient.Schema(
        {
            name: {
                type: String,
                required: [true, 'O nome do usuário é obrigatório.'],
                minlength: [2, 'O nome deve possuir pelo menos 2 caracteres.'],
                maxlength: [120, 'O nome deve possuir no máximo 120 caracteres.'],
                set: normalizeName,
            },

            email: {
                type: String,
                required: [true, 'O e-mail do usuário é obrigatório.'],
                maxlength: [254, 'O e-mail deve possuir no máximo 254 caracteres.'],
                match: [EMAIL_PATTERN, 'O e-mail informado é inválido.'],
                set: normalizeEmail,
            },

            /**
             * Somente o hash produzido pela futura camada de autenticação será
             * armazenado. A senha original jamais deverá chegar a este campo.
             *
             * select: false impede que o hash seja retornado automaticamente
             * pelas consultas. Uma operação de login precisará solicitá-lo de
             * maneira explícita.
             */
            passwordHash: {
                type: String,
                required: [true, 'O hash da senha é obrigatório.'],
                minlength: [
                    20,
                    'O hash da senha não possui um formato suficientemente seguro.',
                ],
                maxlength: [255, 'O hash da senha excede o tamanho permitido.'],
                select: false,
            },

            role: {
                type: String,
                enum: {
                    values: Object.values(USER_ROLES),
                    message: 'O papel de usuário informado é inválido.',
                },
                default: USER_ROLES.ADMIN,
                immutable: true,
            },

            active: {
                type: Boolean,
                default: true,
            },

            lastLoginAt: {
                type: Date,
                default: null,
            },
        },
        {
            timestamps: true,
            versionKey: false,
            toJSON: {
                transform: removePrivateFields,
            },
            toObject: {
                transform: removePrivateFields,
            },
        },
    );

    /**
     * O índice único é a proteção efetiva contra dois usuários com o mesmo
     * e-mail no MongoDB.
     *
     * A opção unique não funciona como uma validação comum do Mongoose:
     * ela instrui o banco de dados a criar uma restrição de unicidade.
     */
    userSchema.index(
        { email: 1 },
        {
            unique: true,
            name: 'users_email_unique',
        },
    );

    return userSchema;
}

/**
 * Cria ou recupera o modelo User.
 *
 * Esse comportamento corresponde a uma fábrica: centralizamos a criação do
 * modelo e evitamos o erro causado por tentar registrá-lo mais de uma vez,
 * algo comum durante testes e recarregamentos em desenvolvimento.
 *
 * @param {typeof mongoose} mongooseClient Instância compatível com o Mongoose.
 * @returns {mongoose.Model} Modelo de usuário.
 */
function createUserModel(mongooseClient = mongoose) {
    if (
        !mongooseClient ||
        typeof mongooseClient.model !== 'function' ||
        !mongooseClient.models
    ) {
        throw new TypeError(
            'Uma instância válida do Mongoose é necessária para criar o modelo de usuário.',
        );
    }

    const existingModel = mongooseClient.models[USER_MODEL_NAME];

    if (existingModel) {
        return existingModel;
    }

    const userSchema = createUserSchema(mongooseClient);

    return mongooseClient.model(USER_MODEL_NAME, userSchema);
}

/**
 * Modelo utilizado normalmente pela aplicação.
 *
 * Os testes poderão chamar createUserModel com uma instância isolada para não
 * alterar este registro global.
 */
const User = createUserModel();

module.exports = {
    EMAIL_PATTERN,
    USER_ROLES,
    User,
    createUserModel,
    createUserSchema,
    normalizeEmail,
    normalizeName,
};