# Calendário do Prof. Dionísio

Aplicação web para organizar aulas, unidades curriculares e materiais didáticos
do Prof. Dionísio Pereira, do Senac Ceilândia.

O projeto está sendo reconstruído a partir de um protótipo HTML que armazenava
os dados somente no navegador. A nova aplicação utilizará Node.js, Express e
MongoDB para permitir armazenamento centralizado e acesso seguro por
computadores e celulares.

## Estado atual

A fundação HTTP e a configuração de ambiente estão concluídas.

Funcionalidades disponíveis neste momento:

- servidor Node.js com Express;
- rota pública de diagnóstico;
- resposta JSON padronizada para rotas inexistentes;
- validação rigorosa da porta HTTP;
- inicialização e encerramento controlados;
- carregamento de variáveis pelo arquivo `.env`;
- validação e normalização das configurações;
- proteção do arquivo `.env` contra inclusão no Git;
- testes HTTP, unitários e de configuração;
- scripts de desenvolvimento, produção e verificação.

Ainda não estão implementados:

- interface visual;
- conexão com o banco de dados;
- cadastro de aulas;
- autenticação;
- armazenamento de materiais;
- acesso externo pela internet.

O projeto ainda não deve ser publicado em ambiente de produção.

## Tecnologias

- Node.js 20;
- npm 10;
- Express 5;
- dotenv;
- Zod;
- test runner nativo do Node.js;
- Git;
- MongoDB será introduzido no próximo marco.

## Requisitos locais

Para executar o estado atual do projeto:

- Node.js 20.20.0 ou superior;
- npm 10 ou superior;
- Git.

Versões utilizadas durante o desenvolvimento inicial:

```text
Node.js 20.20.1
npm 10.8.2
Git 2.43.0
```

## Instalação local

Entre no diretório do projeto:

```bash
cd /home/maurizio/eclipse-workspace/dionisio
```

Instale as dependências:

```bash
npm install
```

Quando for necessário reproduzir exatamente as versões registradas no
`package-lock.json`, utilize:

```bash
npm ci
```

Durante o desenvolvimento cotidiano, não é necessário executar `npm ci` e
`npm install` em sequência. Basta utilizar um deles conforme a finalidade.

## Configuração local

Crie o arquivo local de configuração a partir do exemplo:

```bash
cp .env.example .env
```

Abra `.env` no editor e configure os valores locais.

Gere um segredo de sessão com:

```bash
node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"
```

Utilize o resultado em `SESSION_SECRET`.

Também substitua:

- `ADMIN_EMAIL` pelo e-mail administrativo;
- `ADMIN_PASSWORD` por uma senha forte com no mínimo 12 caracteres.

Nunca envie o conteúdo do `.env` e nunca adicione esse arquivo ao Git.

### Variáveis disponíveis

| Variável | Finalidade |
| --- | --- |
| `NODE_ENV` | Define o ambiente de execução |
| `HOST` | Define a interface de rede |
| `PORT` | Define a porta HTTP |
| `MONGODB_URI` | Informa o endereço do banco |
| `SESSION_SECRET` | Protege as futuras sessões |
| `ADMIN_NAME` | Nome do administrador inicial |
| `ADMIN_EMAIL` | E-mail do administrador inicial |
| `ADMIN_PASSWORD` | Senha do administrador inicial |
| `SESSION_HOURS` | Duração máxima da sessão |
| `APP_ORIGIN` | Origem autorizada da aplicação |
| `TRUST_PROXY` | Informa o uso de proxy reverso |

## Executar em desenvolvimento

```bash
npm run dev
```

Esse comando inicia o servidor e reinicia o processo automaticamente quando
um arquivo JavaScript monitorado é alterado.

O endereço local do servidor é:

```text
http://localhost:3000
```

Neste estágio, ainda não existe uma página visual na rota principal. A rota
disponível é:

```text
http://localhost:3000/api/health
```

Ela também pode ser consultada pelo terminal:

```bash
curl -i http://localhost:3000/api/health
```

Para encerrar o servidor, pressione `Ctrl+C`.

## Executar sem monitoramento

```bash
npm start
```

Esse comando será usado como base para a futura execução em produção.

A aplicação valida todas as variáveis obrigatórias antes de abrir a porta.
Uma configuração ausente ou inválida impede a inicialização.

## Testes automatizados

Execute todos os testes:

```bash
npm test
```

Os testes atuais verificam:

- resposta da rota `/api/health`;
- conteúdo retornado pelo diagnóstico;
- formato JSON do erro para uma rota inexistente;
- remoção do cabeçalho que expõe o Express;
- aplicação da porta padrão;
- conversão de portas válidas;
- rejeição de portas inválidas;
- valores padrão do ambiente;
- normalização do e-mail administrativo;
- conversão de configurações numéricas e booleanas;
- rejeição de configurações inseguras;
- ausência de senhas nas mensagens de erro.

## Verificação de sintaxe

```bash
npm run check
```

## Estrutura atual

```text
dionisio/
├── src/
│   ├── config/
│   │   └── env.js
│   ├── app.js
│   └── server.js
├── test/
│   ├── app.test.js
│   ├── env.test.js
│   └── server.test.js
├── .env.example
├── .gitignore
├── package-lock.json
├── package.json
└── README.md
```

### `src/app.js`

Configura a aplicação Express, os middlewares e as rotas HTTP.

Esse módulo não abre uma porta diretamente. Isso permite que os testes criem
instâncias isoladas da aplicação.

### `src/server.js`

Carrega e valida o ambiente, cria o servidor HTTP e controla sua inicialização
e seu encerramento.

### `src/config/env.js`

Define, valida e normaliza todas as variáveis utilizadas pela aplicação.

Valores confidenciais não são incluídos nas mensagens de erro.

### `test/app.test.js`

Executa testes de integração HTTP utilizando uma porta temporária.

### `test/server.test.js`

Executa testes unitários da validação da porta.

### `test/env.test.js`

Executa testes unitários da configuração e de suas regras de segurança.

## API atual

### Diagnóstico

```http
GET /api/health
```

Exemplo de resposta:

```json
{
  "status": "ok",
  "application": "Calendário do Prof. Dionísio",
  "version": "0.1.0",
  "timestamp": "2026-09-08T14:14:17.329Z"
}
```

### Rota inexistente

Uma rota desconhecida retorna o código HTTP `404` e o corpo:

```json
{
  "error": {
    "code": "ROUTE_NOT_FOUND",
    "message": "O endereço solicitado não existe."
  }
}
```

## Princípios de desenvolvimento

O projeto seguirá estes princípios:

1. cada marco deve permanecer executável;
2. regras importantes devem possuir testes;
3. configurações confidenciais não devem entrar no Git;
4. erros devem possuir formato padronizado;
5. cada arquivo deve ter uma responsabilidade clara;
6. decisões técnicas devem ser documentadas;
7. segurança deve fazer parte da implementação desde o início;
8. a interface deve funcionar em computador e celular;
9. nenhuma etapa deve avançar com testes conhecidos em falha.

## Próximos marcos

1. tratamento centralizado de erros;
2. conexão com MongoDB;
3. modelo de usuário;
4. autenticação administrativa;
5. modelo e API de aulas;
6. modelo e API de materiais;
7. migração segura dos dados do protótipo;
8. reconstrução da interface;
9. testes completos de integração;
10. documentação de implantação e acesso remoto.

## Segurança

Nunca devem ser adicionados ao repositório:

- senhas;
- tokens;
- chaves privadas;
- credenciais do banco de dados;
- conteúdo real do arquivo `.env`.

Essas informações são armazenadas em variáveis de ambiente. O repositório
contém apenas `.env.example`, com nomes e valores demonstrativos.

## Licença

Projeto privado. Todos os direitos reservados.
