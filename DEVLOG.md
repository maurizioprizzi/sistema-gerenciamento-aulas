# Diário de Desenvolvimento

Este documento registra os marcos, decisões de engenharia, verificações e
próximos passos do Calendário do Prof. Dionísio.

O README explica como utilizar o projeto. Este diário explica como e por que
ele está sendo construído.

---

## 8 de setembro de 2026 — Fundação HTTP

### Objetivo

Criar uma base Node.js pequena, executável e testável antes de introduzir
banco de dados ou interface visual.

### Implementado

- inicialização do projeto npm;
- repositório Git na branch `main`;
- aplicação Express criada por uma função;
- servidor HTTP separado da aplicação;
- rota pública `GET /api/health`;
- resposta JSON para rotas inexistentes;
- remoção do cabeçalho `X-Powered-By`;
- limite inicial de 100 KB para corpos JSON;
- encerramento controlado por `SIGINT` e `SIGTERM`;
- validação rigorosa da porta HTTP;
- testes com o test runner nativo do Node.js.

### Decisões

#### Separar `app.js` de `server.js`

`app.js` configura o Express, enquanto `server.js` abre a porta HTTP.

Essa separação permite testar a aplicação em uma porta temporária sem iniciar
automaticamente o servidor de desenvolvimento.

#### Utilizar o test runner nativo

A fundação utiliza `node:test` e `node:assert`. Isso reduz dependências e atende
aos testes necessários neste estágio.

#### Validar toda a porta

A primeira implementação utilizava `Number.parseInt()`. Os testes demonstraram
que valores como `3000abc` e `3.14` seriam aceitos parcialmente.

A implementação passou a exigir somente algarismos e a validar o intervalo
entre 1 e 65535.

### Verificação

- 13 testes aprovados;
- zero falhas;
- servidor validado pelo navegador e pelo `curl`.

### Commit

`58af2a2 chore: initialize Express application`

---

## 8 de setembro de 2026 — Configuração de ambiente

### Objetivo

Impedir que a aplicação inicie com configurações ausentes, inválidas ou
inseguras.

### Implementado

- arquivo público `.env.example`;
- arquivo local `.env` protegido pelo `.gitignore`;
- carregamento das variáveis com dotenv;
- validação e normalização com Zod;
- valores padrão para desenvolvimento;
- validação da URI do MongoDB;
- exigência de segredo de sessão com tamanho mínimo;
- normalização do e-mail administrativo;
- validação da duração da sessão;
- validação da origem pública;
- conversão segura de configurações booleanas e numéricas;
- interrupção da inicialização quando a configuração é inválida.

### Decisões

#### Não versionar o `.env`

O arquivo `.env` pode conter senha administrativa, segredo de sessão e
credenciais do banco. Somente `.env.example`, com valores demonstrativos,
pode entrar no Git.

#### Não mostrar valores em mensagens de erro

As mensagens identificam o campo inválido, mas não repetem seu conteúdo. Isso
reduz o risco de senhas ou credenciais aparecerem nos logs.

#### Manter a configuração imutável

O objeto retornado por `loadEnvironment()` utiliza `Object.freeze()`, evitando
alterações acidentais durante a execução.

### Verificação

- 31 testes aprovados;
- configuração inválida recusada antes da abertura da porta;
- configuração válida executada normalmente;
- zero vulnerabilidades informadas pelo npm.

### Commit

`2960b8a feat: validate application environment`

---

## 8 de setembro de 2026 — Tratamento centralizado de erros

### Objetivo

Criar uma fronteira única para respostas de erro, preservando mensagens úteis
sem expor detalhes internos ao navegador.

### Implementado

- classe `AppError`;
- validação dos códigos HTTP de erro;
- códigos internos padronizados;
- suporte a detalhes seguros de validação;
- middleware para rotas inexistentes;
- middleware central de erros;
- injeção do serviço de log;
- ocultação de falhas inesperadas;
- normalização de JSON malformado;
- normalização de corpos maiores que 100 KB;
- integração do tratamento ao fluxo real do Express.

### Decisões

#### Separar erros previstos e inesperados

`AppError` representa situações conhecidas, como recurso inexistente ou dados
inválidos. Sua mensagem pode ser apresentada ao usuário.

Erros comuns de programação continuam usando `Error`. Nesse caso, a mensagem
técnica fica apenas no servidor e o navegador recebe uma resposta genérica.

#### Usar códigos estáveis

Além do estado HTTP, cada resposta possui um código estável, como:

- `ROUTE_NOT_FOUND`;
- `INVALID_JSON`;
- `PAYLOAD_TOO_LARGE`;
- `INTERNAL_ERROR`.

O futuro frontend poderá reagir aos códigos sem depender do texto das
mensagens.

#### Injetar o serviço de log

O middleware recebe seu logger como dependência. Em execução normal utiliza o
console; nos testes utiliza um objeto controlado que não polui o terminal.

Essa decisão reduz acoplamento e torna o comportamento verificável.

#### Não registrar o conteúdo da requisição

O log de falhas inesperadas registra método, caminho e informações do erro,
mas não registra corpo, cookies ou cabeçalhos. Isso reduz o risco de armazenar
dados confidenciais.

#### Normalizar erros do framework

O parser JSON do Express utiliza identificadores técnicos para JSON malformado
e corpo excessivamente grande.

Esses erros são convertidos em `AppError` antes da resposta final, produzindo
códigos HTTP corretos sem revelar mensagens internas.

### Respostas padronizadas

JSON malformado:

- estado HTTP: `400`;
- código: `INVALID_JSON`;
- mensagem pública: `O corpo da requisição contém um JSON inválido.`

Corpo excessivamente grande:

- estado HTTP: `413`;
- código: `PAYLOAD_TOO_LARGE`;
- mensagem pública: `O corpo da requisição ultrapassa o limite permitido.`

Erro inesperado:

- estado HTTP: `500`;
- código: `INTERNAL_ERROR`;
- mensagem pública: `Não foi possível concluir a operação.`

### Verificação

- 44 testes aprovados;
- zero falhas;
- JSON malformado retorna `400`;
- corpo excessivo retorna `413`;
- erros inesperados retornam mensagem pública genérica;
- detalhes técnicos permanecem somente no log do servidor;
- respostas iniciadas são devolvidas ao tratamento padrão do Express.

---

## 8 de setembro de 2026 — Conexão com MongoDB

### Objetivo

Adicionar armazenamento persistente sem acoplar as regras da aplicação
diretamente ao Mongoose ou exigir um banco externo nos testes unitários.

### Implementado

- Mongoose como ODM do MongoDB;
- atualização controlada para uma versão sem vulnerabilidades conhecidas;
- classe `DatabaseConnection`;
- tradução dos estados internos da conexão;
- reutilização de conexões já estabelecidas;
- prevenção de tentativas simultâneas;
- configuração do pool de conexões;
- tempo limite para seleção do servidor;
- tratamento seguro de falhas;
- encerramento idempotente;
- integração do MongoDB ao ciclo de vida HTTP;
- encerramento ordenado do servidor e do banco;
- teste de falha do banco antes da abertura HTTP.

### Decisões

#### Utilizar Mongoose 9.9.4

A versão 9.2.4 inicialmente instalada apresentou uma vulnerabilidade moderada
no relatório do npm.

A dependência foi atualizada explicitamente para 9.9.4. Não foi utilizado
`npm audit fix` de forma automática, evitando alterações não revisadas.

#### Encapsular o Mongoose

O restante da aplicação não controlará diretamente `mongoose.connect()` ou
`mongoose.disconnect()`.

A classe `DatabaseConnection` concentra o ciclo de vida do banco e recebe suas
dependências pelo construtor, permitindo testes sem conexão externa.

#### Conectar antes de abrir a porta HTTP

O servidor somente começa a aceitar requisições depois que o MongoDB está
disponível.

Se o banco falhar, a aplicação encerra a tentativa e não apresenta um servidor
parcialmente funcional.

#### Não registrar a URI

A URI do MongoDB pode conter usuário e senha. Por isso, ela nunca é incluída
nos registros produzidos pela classe de conexão.

#### Índices automáticos somente fora de produção

A criação automática de índices permanece ativa durante desenvolvimento e
testes.

Em produção, essa função será desativada para que alterações de índices sejam
realizadas de maneira controlada.

### Ambiente local validado

- MongoDB Server 7.0.42;
- MongoDB Shell 2.10.0;
- serviço `mongod` ativo;
- comando de ping retornando `{ ok: 1 }`;
- conexão real da aplicação concluída;
- encerramento real da conexão concluído.

### Verificação

- 56 testes aprovados;
- zero falhas;
- zero vulnerabilidades informadas pelo npm;
- conexão simultânea protegida;
- nova tentativa permitida após falha;
- servidor HTTP bloqueado quando o banco está indisponível;
- nenhum teste unitário depende de MongoDB real.

### Próximo marco

Criar o modelo de usuário administrativo, incluindo:

1. definição segura do schema;
2. normalização e unicidade do e-mail;
3. proteção do hash da senha;
4. validações do domínio;
5. testes do modelo;
6. preparação para autenticação.
