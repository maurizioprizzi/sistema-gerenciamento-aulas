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

---

## 8 de setembro de 2026 — Modelo de usuário administrativo

### Objetivo

Criar uma representação segura e testável do usuário administrativo que
acessará o sistema do Prof. Dionísio.

### Implementado

- criado o modelo `User` com Mongoose;
- criada uma fábrica para construir o modelo de forma isolada;
- definidos nome, e-mail, hash da senha, papel, estado da conta e último acesso;
- implementada normalização de nomes;
- implementada normalização de endereços de e-mail;
- definido índice único para impedir contas com o mesmo e-mail;
- configurado o papel administrativo como valor padrão;
- protegido o campo `passwordHash` nas consultas comuns;
- removido o hash da senha das representações JSON e de objeto;
- habilitadas datas automáticas de criação e atualização;
- evitado qualquer campo destinado ao armazenamento da senha original;
- criada uma suíte de testes sem dependência de MongoDB externo;
- utilizadas validações assíncronas compatíveis com futuras versões do
  Mongoose.

### Decisões de engenharia

#### Fábrica de modelos

A criação do modelo foi centralizada em `createUserModel`.

Essa abordagem:

- evita registrar o mesmo modelo mais de uma vez;
- facilita testes com instâncias isoladas do Mongoose;
- não abre uma conexão com o banco ao importar o arquivo;
- mantém a criação do schema em um único lugar.

#### Proteção do hash da senha

O campo `passwordHash` utiliza `select: false`.

Isso significa que consultas comuns não recuperam o hash automaticamente.
Uma futura operação de autenticação deverá solicitar esse campo de maneira
explícita e controlada.

O hash também é removido durante conversões para JSON e para objetos comuns,
criando uma segunda camada de proteção contra exposição acidental.

#### Normalização do e-mail

Antes do armazenamento, o e-mail:

- tem espaços externos removidos;
- é convertido para letras minúsculas.

A restrição efetiva de unicidade será mantida pelo índice do MongoDB. A opção
`unique` não foi tratada incorretamente como se fosse uma validação comum do
Mongoose.

#### Senha original

O schema não possui um campo chamado `password`.

A senha original será recebida somente pela futura camada de autenticação,
transformada em hash e descartada antes da persistência.

### Verificação

- 78 testes aprovados;
- zero falhas;
- zero testes ignorados;
- nenhum aviso de API obsoleta;
- modelo criado sem abrir conexão com o MongoDB;
- validações executadas inteiramente em memória;
- índice único do e-mail verificado;
- hash ausente das representações públicas;
- senha original ausente do schema.

---

## 8 de setembro de 2026 — Proteção de senhas com bcrypt

### Objetivo

Criar uma camada isolada e segura para transformar senhas em hashes e comparar
credenciais, sem armazenar ou registrar a senha original.

### Implementado

- adicionada a dependência `bcryptjs` na versão 3.0.3;
- criada a classe `PasswordHasher`;
- implementado hashing assíncrono de senhas;
- implementada comparação assíncrona entre senha e hash;
- configurado custo padrão 12;
- definidos limites operacionais entre 10 e 15;
- protegido o custo contra alterações depois da construção;
- protegido o cliente bcrypt com campo privado;
- rejeitadas senhas vazias ou de tipo incorreto;
- rejeitados hashes vazios ou de tipo incorreto;
- rejeitadas senhas maiores que 72 bytes;
- preservados espaços e caracteres Unicode das senhas;
- adicionada a variável `PASSWORD_HASH_ROUNDS`;
- documentada a variável em `.env.example`;
- validado o custo durante o carregamento do ambiente;
- validado o limite da senha administrativa em bytes UTF-8;
- mantidas senhas confidenciais fora das mensagens de erro;
- criado teste de integração com a implementação real do bcrypt.

### Decisões de engenharia

#### Biblioteca utilizada

Foi escolhido o pacote oficial `bcryptjs`, versão 3.0.3.

A implementação:

- não possui dependências transitivas;
- não exige compilação de módulos nativos;
- facilita a execução em serviços de hospedagem;
- oferece API assíncrona;
- produz hashes bcrypt compatíveis com o prefixo `$2b$`.

Pacotes com nomes semelhantes não devem ser utilizados, pois existem casos
documentados de pacotes maliciosos que tentam se passar pelo projeto oficial.

#### Operações assíncronas

As operações `hash` e `compare` utilizam a API assíncrona.

O hashing é propositalmente custoso. A versão assíncrona permite que a
biblioteca devolva periodicamente o controle ao event loop do Node.js,
reduzindo o bloqueio das demais operações da aplicação.

#### Limite de 72 bytes

O bcrypt considera no máximo 72 bytes da senha.

A aplicação rejeita entradas maiores em vez de permitir truncamento
silencioso. A medição utiliza bytes UTF-8, pois caracteres acentuados e emojis
podem ocupar mais de um byte.

A senha não recebe `trim` nem normalização, porque espaços e caracteres
Unicode podem fazer parte de uma credencial legítima.

#### Custo computacional

O custo padrão é 12, com valores permitidos entre 10 e 15.

A configuração é validada na fronteira das variáveis de ambiente e novamente
no construtor de `PasswordHasher`. Essa defesa em profundidade impede custos
fracos ou excessivos mesmo quando o serviço é utilizado isoladamente.

### Verificação

- 121 testes aprovados;
- 16 suítes aprovadas;
- zero falhas;
- zero testes ignorados;
- zero vulnerabilidades conhecidas;
- hash real com 60 caracteres gerado;
- senha correta reconhecida;
- senha incorreta rejeitada;
- custo protegido contra alteração externa;
- limite exato de 72 bytes aceito;
- entrada acima de 72 bytes rejeitada;
- comportamento Unicode validado;
- arquivo `.env.example` validado pelo schema real.

---

## 9 de setembro de 2026 — Inicialização da conta administrativa

### Objetivo

Integrar ao ciclo de inicialização da aplicação a criação controlada da
primeira conta administrativa.

A aplicação agora prepara o administrador depois de estabelecer a conexão com
o MongoDB e antes de disponibilizar o servidor HTTP.

### Serviço de inicialização

Foi criado o serviço `AdminBootstrapper`, responsável por:

- normalizar o e-mail administrativo;
- consultar a existência da conta;
- preservar uma conta já cadastrada;
- gerar o hash somente quando a criação for necessária;
- criar o usuário com papel administrativo;
- tratar conflitos de unicidade provocados por inicializações simultâneas;
- evitar o retorno ou registro de credenciais;
- permitir testes por meio da injeção de dependências.

O serviço retorna somente o estado da operação. O documento do usuário, a
senha e o hash não fazem parte do resultado público.

### Tratamento de concorrência

Duas instâncias da aplicação podem tentar criar o primeiro administrador ao
mesmo tempo.

O índice único do e-mail continua sendo a proteção definitiva do banco de
dados. Quando o MongoDB informa um conflito nesse índice, o serviço realiza
uma nova consulta:

- se a conta passou a existir, a inicialização é considerada bem-sucedida;
- se a conta não for encontrada, o erro original é propagado;
- conflitos pertencentes a outros campos não são ocultados.

### Integração com o servidor

O `server.js` passou a executar a seguinte ordem:

1. carregar e validar as variáveis de ambiente;
2. validar as dependências de inicialização;
3. conectar ao MongoDB;
4. construir o serviço de proteção de senhas;
5. construir o serviço de inicialização administrativa;
6. garantir a existência da conta administrativa;
7. criar a aplicação Express;
8. abrir o servidor HTTP.

Essa ordem impede que a aplicação aceite requisições antes de possuir banco de
dados e conta administrativa disponíveis.

Se qualquer etapa posterior à conexão falhar, o MongoDB é encerrado antes de
o erro ser propagado.

### Configuração do hash

O custo do bcrypt é recebido de `PASSWORD_HASH_ROUNDS`, já validado pelo
módulo de ambiente.

O servidor cria uma instância de `PasswordHasher` com esse custo e a entrega
ao `AdminBootstrapper`. Dessa forma, a composição das dependências permanece
explícita e testável.

### Segurança

A integração garante que:

- a senha original não seja armazenada no MongoDB;
- o hash não apareça nas representações públicas do usuário;
- a senha e o hash não sejam escritos nos logs;
- uma conta existente não tenha sua senha substituída;
- o hash não seja recalculado desnecessariamente;
- falhas administrativas impeçam a abertura do servidor HTTP;
- configurações criptográficas inválidas sejam rejeitadas;
- conflitos legítimos de unicidade não sejam ignorados.

### Testes automatizados

Os testes isolados do `AdminBootstrapper` verificam:

- validação das dependências;
- validação da configuração administrativa;
- preservação de contas existentes;
- criação de uma conta inexistente;
- geração do hash somente quando necessária;
- ausência de credenciais nos logs;
- propagação de falhas de consulta, hashing e criação;
- identificação correta de conflitos do índice de e-mail;
- recuperação segura de inicializações simultâneas.

Os testes de `server.js` verificam:

- construção do serviço com o custo configurado;
- rejeição de custos inválidos;
- validação da fábrica administrativa;
- bloqueio do HTTP quando o MongoDB falha;
- bloqueio do HTTP quando a inicialização administrativa falha;
- encerramento do banco depois de falhas;
- envio correto dos dados administrativos ao serviço;
- ausência da senha nos registros operacionais;
- ordem completa da inicialização;
- desativação de índices automáticos em produção.

Nenhum desses testes depende de conexão com um MongoDB externo.

### Validação com MongoDB local

Também foi executada uma validação real com o MongoDB local.

Na primeira inicialização:

- a conexão com o banco foi estabelecida;
- a conta administrativa foi criada;
- o servidor HTTP foi disponibilizado;
- o encerramento ocorreu de maneira segura.

A inspeção segura do documento confirmou:

- exatamente um usuário cadastrado;
- papel `admin`;
- conta ativa;
- hash bcrypt presente com 60 caracteres;
- ausência de um campo contendo a senha original.

Na segunda inicialização:

- a conta existente foi reconhecida;
- nenhuma nova conta foi criada;
- a quantidade de usuários permaneceu igual a um;
- o servidor iniciou e encerrou normalmente.

Esse resultado confirma a idempotência do processo.

### Verificação

- 163 testes aprovados;
- 21 suítes aprovadas;
- zero falhas;
- zero testes ignorados;
- zero vulnerabilidades conhecidas;
- inicialização isolada coberta por testes;
- integração real com MongoDB validada;
- senha original ausente do banco;
- hash protegido;
- conta duplicada não criada;
- encerramento seguro confirmado.

---

## 9 de setembro de 2026 — Fundação de sessões persistentes

### Objetivo

Preparar a infraestrutura necessária para autenticação administrativa com
sessões armazenadas no servidor.

A fundação deveria impedir que informações de autenticação fossem mantidas
diretamente no navegador e reutilizar a conexão MongoDB já administrada pelo
Mongoose.

### Dependências adicionadas

Foram adicionadas:

- `express-session` 1.19.0;
- `connect-mongo` 6.0.0.

O `express-session` gerencia o identificador da sessão e o cookie enviado ao
navegador.

O `connect-mongo` armazena o conteúdo da sessão no MongoDB. Dessa forma, o
navegador recebe somente um identificador opaco, enquanto os dados efetivos
permanecem no servidor.

A instalação manteve zero vulnerabilidades conhecidas pelo `npm audit`.

### Acesso controlado ao cliente MongoDB

O módulo `src/config/database.js` passou a fornecer `getNativeClient()`.

Esse método:

- somente funciona depois que a conexão foi estabelecida;
- obtém o cliente nativo mantido pelo Mongoose;
- valida o formato do cliente antes de retorná-lo;
- não cria uma conexão MongoDB adicional;
- não expõe a URI do banco.

O armazenamento de sessões e os modelos Mongoose passam, portanto, a
compartilhar o mesmo conjunto de conexões.

### Configuração das sessões

Foi criado `src/config/session.js`, responsável por construir:

1. o armazenamento persistente no MongoDB;
2. o middleware do `express-session`.

O módulo mantém essas responsabilidades fora de `app.js` e permite que todas
as dependências sejam substituídas por implementações controladas nos testes.

### Armazenamento persistente

O armazenamento utiliza:

- a coleção `sessions`;
- expiração baseada na duração validada da sessão;
- remoção nativa por índice TTL do MongoDB;
- atualização periódica da atividade da sessão;
- serialização explícita;
- datas de criação e atualização;
- o mesmo `MongoClient` utilizado pelo Mongoose.

O TTL é arredondado para cima quando necessário, impedindo que uma sessão
expire antes do período configurado.

### Cookies de sessão

A configuração dos cookies utiliza:

- `httpOnly: true`;
- `sameSite: 'lax'`;
- `path: '/'`;
- prioridade alta;
- duração correspondente a `SESSION_HOURS`;
- ausência do atributo `domain`;
- `secure: true` em produção;
- `secure: false` no ambiente local.

Em desenvolvimento, o cookie utiliza o nome:

```text
calendario.sid
```

Em produção, utiliza:

```text
__Host-calendario.sid
```

O prefixo `__Host-` exige conexão HTTPS, caminho raiz e ausência de domínio
explícito, reduzindo o risco de cookies concorrentes criados por subdomínios.

### Comportamento das sessões

O middleware foi configurado com:

- `resave: false`;
- `saveUninitialized: false`;
- `rolling: false`;
- `unset: 'destroy'`.

Com `saveUninitialized: false`, visitantes anônimos de rotas públicas não
recebem cookies e não criam documentos vazios no MongoDB.

Uma sessão somente será persistida quando a futura autenticação adicionar
dados relevantes a ela.

### Validação do segredo

O segredo de sessão continua vindo exclusivamente de `SESSION_SECRET`.

A validação agora também rejeita valores formados somente por espaços. O
segredo precisa:

- ser um texto;
- possuir conteúdo significativo;
- possuir pelo menos 32 bytes UTF-8;
- permanecer ausente das mensagens de erro e dos logs.

O valor não recebe `trim` nem normalização, pois qualquer alteração modificaria
o segredo criptográfico efetivamente utilizado.

### Integração com o Express

`src/app.js` passou a aceitar um middleware de sessão por injeção.

Quando fornecido, o middleware é instalado:

1. depois da interpretação do corpo JSON;
2. antes das rotas;
3. antes dos tratamentos de rota inexistente e de erro.

A aplicação Express não conhece:

- o segredo da sessão;
- a URI do MongoDB;
- o cliente nativo;
- a biblioteca `connect-mongo`;
- os detalhes do armazenamento.

Essa separação mantém o módulo HTTP isolado e testável.

### Integração ao ciclo de abertura

`src/server.js` passou a inicializar a aplicação nesta ordem:

1. carregar e validar o ambiente;
2. conectar o MongoDB;
3. garantir a conta administrativa;
4. obter o cliente MongoDB nativo;
5. criar o armazenamento persistente de sessões;
6. registrar o tratamento de erros do armazenamento;
7. criar o middleware de sessão;
8. entregar o middleware ao Express;
9. abrir o servidor HTTP.

Qualquer falha anterior à abertura HTTP impede que a aplicação anuncie
disponibilidade.

Se uma falha ocorrer depois da conexão, o MongoDB é encerrado antes de o erro
ser propagado.

### Tratamento de erros do armazenamento

Erros emitidos posteriormente pelo armazenamento de sessões recebem um
listener operacional.

O registro contém somente:

- o nome do erro;
- a mensagem técnica.

A URI do banco, o segredo da sessão, a senha administrativa e o conteúdo das
sessões não são incluídos.

### Testes automatizados

Foram adicionados testes para verificar:

- constantes e mensagens imutáveis;
- configuração completa do armazenamento;
- arredondamento seguro do TTL;
- rejeição de clientes MongoDB inválidos;
- rejeição de durações inválidas;
- validação das fábricas injetadas;
- validação do armazenamento retornado;
- configuração dos cookies em desenvolvimento;
- configuração protegida dos cookies em produção;
- construção de um middleware real;
- rejeição de segredos inválidos;
- rejeição de segredos formados somente por espaços;
- ausência do segredo nas mensagens de erro;
- execução do middleware antes das rotas;
- funcionamento do Express sem sessão nos testes isolados;
- reutilização do cliente MongoDB mantido pelo Mongoose;
- ordem completa da inicialização;
- limpeza da conexão após falhas;
- bloqueio do Express quando a sessão não pode ser construída;
- ausência de senha e segredo nos logs de falha.

Nenhum teste automatizado depende de um MongoDB externo.

### Validação com MongoDB local

A aplicação completa também foi executada com o MongoDB local.

A validação confirmou:

- conexão real com o MongoDB;
- reconhecimento da conta administrativa existente;
- construção real do armazenamento de sessões;
- criação real do middleware;
- abertura normal do servidor HTTP;
- resposta `200 OK` em `/api/health`;
- ausência do cabeçalho `Set-Cookie` na rota pública;
- zero sessões anônimas gravadas no MongoDB;
- encerramento seguro por `SIGINT`.

A ausência de uma sessão após o diagnóstico público confirma o funcionamento
de `saveUninitialized: false`.

### Verificação

- 195 testes aprovados;
- 25 suítes aprovadas;
- zero falhas;
- zero testes ignorados;
- zero vulnerabilidades conhecidas;
- integração isolada coberta;
- inicialização real com MongoDB validada;
- cliente MongoDB compartilhado;
- cookies anônimos não emitidos;
- sessões anônimas não persistidas;
- segredo e credenciais ausentes dos logs;
- encerramento seguro confirmado.

---

## 10 de setembro de 2026 — Serviço de autenticação administrativa

### Objetivo

Implementar a camada responsável por verificar as credenciais da conta
administrativa sem depender das futuras rotas HTTP ou do gerenciamento de
sessões.

O serviço deveria:

- receber e validar as credenciais;
- normalizar o endereço de e-mail;
- localizar explicitamente o hash protegido;
- comparar a senha utilizando bcrypt;
- recusar contas inexistentes, inativas ou com senha incorreta;
- evitar revelar se determinado e-mail está cadastrado;
- devolver somente a identidade mínima necessária;
- permanecer isolado e testável.

### Implementação

Foi criado o módulo:

```text
src/services/AuthenticationService.js
```

A classe `AuthenticationService` recebe por injeção:

- o modelo de usuário;
- o serviço responsável pela comparação de senhas;
- um hash bcrypt substituto.

Essa composição permite testar o comportamento sem conexão externa e mantém as
responsabilidades separadas.

### Preparação das credenciais

Antes da consulta, o serviço:

- exige um objeto de credenciais válido;
- normaliza espaços externos e letras maiúsculas do e-mail;
- verifica a estrutura básica do endereço;
- limita o e-mail a 254 caracteres;
- preserva integralmente os caracteres da senha;
- aceita senhas com até 72 bytes;
- considera corretamente caracteres Unicode;
- transforma entradas inválidas em uma resposta pública genérica.

A senha não recebe `trim` nem normalização, pois espaços podem fazer parte de
uma credencial legítima.

### Consulta protegida

O campo `passwordHash` utiliza `select: false` no modelo de usuário.

Por isso, a autenticação solicita o hash de maneira explícita:

```text
select('+passwordHash')
```

Essa seleção ocorre somente dentro do fluxo que realmente precisa comparar a
senha.

### Proteção contra descoberta de contas

Uma tentativa com usuário inexistente também executa uma comparação bcrypt
utilizando um hash substituto válido.

Essa estratégia reduz a diferença observável entre:

- e-mail inexistente;
- senha incorreta;
- conta inativa.

Todas essas situações retornam o mesmo erro operacional:

```text
401 INVALID_CREDENTIALS
E-mail ou senha inválidos.
```

A aplicação não informa publicamente se o endereço consultado está cadastrado.

### Contas inativas

A senha é comparada antes da verificação do estado da conta.

Mesmo que a senha esteja correta, uma conta com `active: false` recebe a mesma
resposta genérica utilizada pelas demais credenciais recusadas.

### Identidade autenticada

Uma autenticação bem-sucedida não devolve o documento completo do Mongoose.

O resultado contém somente:

- `id`;
- `name`;
- `email`;
- `role`.

A identidade retornada é congelada com `Object.freeze` e não inclui:

- senha;
- hash da senha;
- estado interno do Mongoose;
- metadados desnecessários.

### Tratamento de falhas

Erros de credenciais são representados por `AppError` com código HTTP `401`.

Falhas reais de infraestrutura ou inconsistências internas não são
transformadas silenciosamente em erros de credenciais. Elas são propagadas
para o tratamento centralizado, permitindo diagnóstico operacional correto.

### Testes automatizados

Foi criado o arquivo:

```text
test/AuthenticationService.test.js
```

Os 23 novos testes verificam:

- constantes e mensagens imutáveis;
- construção com dependências padrão;
- rejeição de dependências inválidas;
- validação do hash substituto;
- normalização do e-mail;
- preservação dos espaços da senha;
- limite exato de 72 bytes;
- medição de caracteres Unicode em UTF-8;
- rejeição segura de credenciais inválidas;
- seleção explícita do hash;
- autenticação de conta ativa;
- comparação substituta para usuário inexistente;
- recusa de senha incorreta;
- recusa de conta inativa;
- identidade pública mínima;
- imutabilidade da identidade;
- propagação de falhas do banco;
- propagação de falhas do bcrypt;
- detecção de documentos inconsistentes;
- ausência de uso incorreto do hash substituto para contas existentes.

### Validação com MongoDB local

O serviço também foi validado contra a conta administrativa real armazenada
no MongoDB local.

A autenticação correta confirmou:

- conexão real com o banco;
- localização da conta administrativa;
- recuperação explícita do hash;
- comparação real com bcrypt;
- retorno do papel `admin`;
- identidade limitada aos quatro campos públicos;
- resultado imutável;
- encerramento correto da conexão.

Também foram executadas duas tentativas negativas:

1. e-mail existente com senha incorreta;
2. e-mail inexistente com senha incorreta.

As duas retornaram exatamente:

```text
AppError
401
INVALID_CREDENTIALS
E-mail ou senha inválidos.
```

A igualdade das respostas confirma que o serviço não revela a existência da
conta por meio da mensagem pública.

### Verificação

- 218 testes aprovados;
- 29 suítes aprovadas;
- zero falhas;
- zero testes ignorados;
- zero vulnerabilidades conhecidas;
- sintaxe dos novos arquivos validada;
- integração real com MongoDB confirmada;
- comparação bcrypt real confirmada;
- usuário inexistente protegido por comparação substituta;
- conta inativa tratada de maneira genérica;
- senha e hash ausentes dos resultados;
- identidade mínima e imutável;
- erros públicos equivalentes para credenciais recusadas.

### Próximo marco

Integrar a autenticação às sessões e à API:

1. criar as rotas de entrada e saída;
2. validar os corpos das requisições;
3. regenerar a sessão depois da autenticação;
4. armazenar somente a identidade mínima na sessão;
5. atualizar controladamente o último acesso;
6. destruir a sessão durante a saída;
7. limpar o cookie de sessão;
8. limitar tentativas repetidas de autenticação;
9. criar middleware de autorização;
10. proteger as futuras rotas administrativas;
11. testar os fluxos HTTP completos;
12. validar o armazenamento real da sessão.

## 10 de setembro de 2026 — Autenticação HTTP e ciclo de sessão

### Objetivo

Integrar o serviço de autenticação à API e ao armazenamento persistente de
sessões, mantendo credenciais e dados internos fora das respostas e dos logs.

### Implementação

Foi criado o `SessionManager`, responsável por:

- validar e reduzir a identidade persistida;
- regenerar a sessão depois da autenticação;
- armazenar somente o identificador e o papel;
- salvar explicitamente a sessão antes da resposta;
- remover a identidade e destruir a sessão quando a gravação falha;
- destruir a sessão durante a saída.

O `AuthenticationController` passou a coordenar os fluxos HTTP:

- autentica as credenciais recebidas;
- remove campos que não pertencem à resposta pública;
- estabelece a sessão regenerada;
- responde ao login com código `200`;
- destrói a sessão durante o logout;
- limpa o cookie com opções coerentes com o ambiente;
- responde ao logout com código `204`.

O roteador de autenticação registra:

- `POST /api/auth/login`;
- `POST /api/auth/logout`.

O servidor agora compõe explicitamente o serviço de senha, o serviço de
autenticação, o gerenciador de sessão, o controlador e o roteador antes de
entregar a aplicação ao servidor HTTP.

### Ordem de inicialização

1. validar o ambiente;
2. conectar o MongoDB;
3. garantir a conta administrativa;
4. obter o cliente MongoDB nativo;
5. criar o armazenamento de sessões;
6. criar o middleware de sessão;
7. compor a autenticação administrativa;
8. montar as rotas no Express;
9. abrir a porta HTTP.

### Segurança

- a senha e o hash não são incluídos na sessão;
- somente identificador e papel são persistidos;
- a sessão é regenerada depois do login;
- contas inexistentes executam comparação bcrypt substituta;
- credenciais incorretas e contas inexistentes produzem a mesma resposta;
- falhas de autenticação não emitem cookie nem criam sessão;
- o logout destrói o documento da sessão;
- o cookie é limpo com o mesmo nome e escopo utilizados na criação;
- configurações inválidas impedem a abertura do servidor;
- logs não recebem senha, hash, segredo ou identificador do cookie.

### Testes automatizados

Foram acrescentados testes para:

- identidade mínima da sessão;
- regeneração, gravação e destruição;
- limpeza depois de falhas de persistência;
- login e logout no controlador;
- seleção dos campos públicos;
- opções de limpeza do cookie;
- registro das rotas;
- montagem sob `/api/auth`;
- ordem entre sessão e autenticação;
- composição no ciclo de inicialização;
- bloqueio diante de fábricas inválidas.

### Validação real com MongoDB

O fluxo completo foi executado contra o MongoDB local.

No login:

- a resposta foi `200`;
- somente `email`, `id`, `name` e `role` foram devolvidos;
- um cookie foi emitido;
- exatamente uma sessão foi criada no MongoDB.

No logout:

- a resposta foi `204`;
- o cookie foi invalidado;
- a sessão foi removida do MongoDB.

Também foram testadas uma senha incorreta e uma conta inexistente. Ambas
retornaram `401`, produziram respostas públicas equivalentes, não emitiram
cookie e não criaram sessão.

### Verificação

- 271 testes aprovados;
- 41 suítes aprovadas;
- zero falhas;
- zero testes ignorados;
- zero vulnerabilidades conhecidas;
- sintaxe validada;
- integração HTTP confirmada;
- sessão persistente criada e removida;
- encerramento seguro confirmado.

### Próximo marco

Limitar tentativas repetidas de autenticação, atualizar o último acesso e criar
o middleware de autorização das futuras rotas administrativas.

## 11 de setembro de 2026 — Limitação de tentativas de autenticação

### Objetivo

Reduzir tentativas automatizadas contra a conta administrativa sem revelar
credenciais, bloquear o logout ou espalhar regras de segurança pelas rotas.

### Implementação

Foi adicionada a dependência `express-rate-limit` na versão 8.7.0.

O novo módulo `authenticationRateLimiter.js` centraliza:

- janela padrão de quinze minutos;
- máximo de cinco tentativas recusadas;
- validação defensiva das configurações;
- cabeçalhos modernos `RateLimit`;
- desativação dos cabeçalhos antigos `X-RateLimit-*`;
- remoção das respostas bem-sucedidas da contagem;
- comportamento fechado diante de falha do armazenamento;
- resposta operacional encaminhada ao tratamento central de erros.

O roteador recebe o limitador por dependência e o coloca antes do controlador
de login. Uma requisição bloqueada não consulta o usuário e não executa bcrypt.

O logout não utiliza o limitador. Assim, uma sessão existente pode ser
encerrada mesmo durante o bloqueio temporário de novas entradas.

### Decisão sobre armazenamento

O contador utiliza o armazenamento em memória fornecido pela biblioteca neste
estágio. Essa configuração é adequada enquanto a aplicação executar em uma
única instância.

Antes de utilizar múltiplas instâncias, o contador deverá migrar para um
armazenamento compartilhado. Essa limitação está documentada e não impede o
desenvolvimento local nem a futura primeira implantação controlada.

### Segurança

- o endereço de origem é tratado pela implementação segura da biblioteca;
- nenhum gerador manual de chave enfraquece o suporte a IPv6;
- e-mail, senha, cookie e endereço não aparecem na resposta;
- as tentativas recusadas continuam produzindo a mensagem genérica;
- o bloqueio utiliza código estável e status `429`;
- nenhum cookie ou documento de sessão é criado durante as recusas;
- o logout permanece disponível.

### Testes automatizados

Os testes verificam:

- constantes e mensagens imutáveis;
- valores padrão;
- limites mínimos e máximos;
- rejeição de configurações inválidas;
- contrato da fábrica do middleware;
- ausência de um gerador de chave personalizado;
- criação segura do `AppError`;
- bloqueio da sexta tentativa recusada;
- remoção de respostas bem-sucedidas da contagem;
- cabeçalho moderno e ausência do legado;
- posição do limitador antes do controlador;
- ausência do limitador no logout;
- comportamento HTTP integrado sob `/api/auth`.

### Validação real

A aplicação foi iniciada com MongoDB local e conta administrativa real.

O teste confirmou:

- tentativas 1 a 5 com resposta `401 INVALID_CREDENTIALS`;
- tentativa 6 com resposta `429 AUTHENTICATION_RATE_LIMITED`;
- cabeçalho `RateLimit` presente;
- nenhum cookie emitido;
- zero sessões criadas;
- logout disponível com resposta `204`;
- inicialização e encerramento seguros.

### Verificação

- 282 testes aprovados;
- 44 suítes aprovadas;
- zero falhas;
- zero testes ignorados;
- zero vulnerabilidades conhecidas;
- integração isolada e HTTP confirmada;
- validação real concluída.

### Próximo marco

Atualizar controladamente o último acesso do administrador e criar o middleware
de autorização das futuras rotas administrativas.

## 11 de setembro de 2026 — Registro controlado do último acesso

### Objetivo

Registrar o instante da última autenticação administrativa válida sem alterar
o banco em tentativas recusadas, expor informações internas ou permitir uma
sessão quando a persistência falhar.

### Implementação

O `AuthenticationService` passou a receber uma fonte de tempo injetável. A
aplicação real utiliza a data atual e os testes fornecem datas determinísticas.

Depois de validar credenciais, estado e identidade, o serviço executa uma
atualização específica que:

- filtra pelo identificador interno do usuário;
- exige que a conta continue ativa;
- altera somente `lastLoginAt`;
- executa as validações do Mongoose;
- confirma o resultado devolvido pelo MongoDB.

A data é validada e copiada antes da persistência, impedindo alterações por
uma referência externa.

### Ordem e segurança

O registro ocorre depois da confirmação das credenciais e antes da sessão.
Assim:

- credenciais recusadas não modificam `lastLoginAt`;
- falhas de atualização impedem o estabelecimento da sessão;
- uma desativação concorrente produz o mesmo erro genérico;
- documentos inconsistentes não produzem escrita;
- senha, hash e horário não entram na sessão nem na resposta pública.

O campo representa o instante em que as credenciais válidas foram aceitas. Se
a criação posterior da sessão falhar, o acesso não será concedido, embora a
autenticação válida já tenha sido registrada.

### Testes automatizados

Os testes cobrem o contrato de `findOne` e `updateOne`, a fonte de tempo, a
cópia defensiva da data, o filtro pela conta ativa, a escrita exclusiva de
`lastLoginAt`, a ausência de escrita em recusas, falhas reais do banco,
resultados inconsistentes e desativação concorrente.

### Validação real

A aplicação foi iniciada com MongoDB local e a conta administrativa existente.
O teste confirmou login `200`, data válida atualizada, campo ausente da
resposta, sessão persistida, recusa posterior com `401`, horário inalterado,
nenhum cookie na recusa, logout `204` e remoção da sessão.

### Verificação

- 289 testes aprovados;
- 45 suítes aprovadas;
- zero falhas;
- zero testes ignorados;
- zero vulnerabilidades conhecidas;
- sintaxe validada;
- integração real com MongoDB confirmada;
- inicialização e encerramento seguros.

### Próximo marco

Criar o middleware de autorização administrativa e preparar uma rota protegida
de diagnóstico da sessão antes das futuras APIs do calendário.

## 11 de setembro de 2026 — Autorização administrativa e consulta de sessão

### Objetivo

Impedir que rotas administrativas sejam acessadas sem uma sessão válida e
disponibilizar uma consulta protegida que permita à futura interface confirmar
o estado da autenticação sem expor dados desnecessários.

### Implementação

Foi criado o middleware `administrativeAuthorization.js`. Ele lê somente a
identidade mínima persistida pelo `SessionManager`, valida o identificador e o
papel e exige explicitamente o papel `admin`.

Quando a autorização é aceita, o middleware anexa à requisição um objeto
congelado contendo somente `id` e `role`. A propriedade não pode ser
enumerada, substituída ou reconfigurada.

O `AuthenticationController` recebeu a operação `getSession`, e o roteador
passou a registrar:

```http
GET /api/auth/session
```

A autorização é executada antes do controlador. Login continua protegido pelo
limitador de tentativas, enquanto logout permanece disponível para encerrar uma
sessão existente.

### Respostas seguras

Uma requisição sem identidade válida recebe `401` com o código
`AUTHENTICATION_REQUIRED`. Uma identidade válida sem papel administrativo
recebe `403` com o código `ADMINISTRATIVE_ACCESS_REQUIRED`.

Uma sessão administrativa válida recebe `200` e somente:

```json
{
  "data": {
    "authenticated": true,
    "user": {
      "id": "identificador-do-usuario",
      "role": "admin"
    }
  }
}
```

Nome, e-mail, senha, hash, cookie e identificador interno da sessão não são
copiados para a identidade autorizada.

### Testes automatizados

Os testes verificam a criação dos erros operacionais, identidades ausentes ou
malformadas, recusa de papéis não administrativos, proteção da propriedade da
requisição, vinculação do controlador, ordem dos middlewares, contratos do
roteador e respostas HTTP completas para `401`, `403` e `200`.

O teste HTTP utiliza sessão controlada e componentes reais de roteamento,
autorização e tratamento de erros, sem depender de MongoDB ou bcrypt.

### Validação real

A aplicação foi iniciada com MongoDB local e a conta administrativa existente.
A consulta anônima retornou `401` sem emitir cookie. O login retornou `200` e
criou exatamente uma sessão. A consulta autenticada retornou `200` com apenas
`id` e `role`. O logout retornou `204`, removeu a sessão e tornou o cookie
anterior inválido para uma nova consulta, que voltou a retornar `401`.

### Verificação

- 311 testes aprovados;
- 50 suítes aprovadas;
- zero falhas;
- zero testes ignorados;
- zero vulnerabilidades conhecidas;
- sintaxe validada;
- integração isolada e HTTP confirmada;
- validação real com MongoDB confirmada;
- inicialização e encerramento seguros.

### Próximo marco

Adicionar cabeçalhos HTTP de segurança e iniciar a primeira interface visual
com uma tela administrativa de login.

## 11 de setembro de 2026 — Validação independente do limite bcrypt

### Objetivo

Reduzir o acoplamento do `PasswordHasher` à API específica do bcryptjs sem
alterar a proteção contra o truncamento silencioso de senhas acima de 72 bytes.

### Implementação

O limite técnico passou a ser representado pela constante exportada
`BCRYPT_MAX_PASSWORD_BYTES`. O tamanho da senha agora é calculado diretamente
com `Buffer.byteLength(password, 'utf8')` antes de qualquer operação bcrypt.

Com isso, o cliente criptográfico injetado precisa oferecer somente `hash()` e
`compare()`. O serviço não depende mais do método auxiliar `truncates()` do
bcryptjs.

O `AuthenticationService` reutiliza a nova constante, mas preserva o export
`MAX_PASSWORD_BYTES`, evitando quebra do contrato existente. A configuração
de ambiente mantém sua validação independente como defesa em profundidade.

### Testes automatizados

Os simuladores foram simplificados para o novo contrato mínimo. Os testes
confirmam a aceitação de um cliente com somente `hash()` e `compare()`, o
limite exato de 72 bytes, a medição de caracteres Unicode e a rejeição de uma
senha maior que o limite antes de gerar ou comparar hashes.

### Verificação

- 313 testes aprovados;
- 50 suítes aprovadas;
- zero falhas;
- zero testes ignorados;
- zero vulnerabilidades conhecidas;
- sintaxe validada;
- contrato público da autenticação preservado.

### Próximo marco

Adicionar cabeçalhos HTTP de segurança e iniciar a primeira interface visual
com uma tela administrativa de login.

## 12 de setembro de 2026 — Cabeçalhos HTTP de segurança

### Objetivo

Reduzir a exposição da aplicação a comportamentos inseguros do navegador por
meio de cabeçalhos HTTP centralizados, testáveis e apropriados para os
ambientes de desenvolvimento e produção.

### Implementação

Foi adicionada a dependência `helmet` 8.3.0 e criado o middleware
`securityHeaders.js`. Sua fábrica recebe a indicação validada do ambiente e
encapsula a configuração do Helmet, preservando a possibilidade de usar uma
fábrica controlada nos testes.

O middleware é construído no ciclo de abertura antes da conexão com o banco.
Uma fábrica inválida ou um retorno que não seja função impede a inicialização
antes que recursos externos sejam abertos. A instância validada é entregue ao
`createApp` e executada antes do parser JSON, das sessões e das rotas.

### Políticas por ambiente

Nos dois ambientes, o Helmet aplica CSP, isolamento de origem, política de
referência, proteção contra enquadramento e interpretação incorreta de
conteúdo, além dos demais cabeçalhos padrão compatíveis.

Em desenvolvimento, HSTS e a diretiva `upgrade-insecure-requests` ficam
desativados. Isso evita que o navegador tente transformar o endereço local em
HTTPS. Em produção, HSTS utiliza duração de um ano e inclui subdomínios, sem
solicitar preload; a atualização de recursos inseguros também é ativada.

### Testes automatizados

Os testes verificam constantes imutáveis, configurações de desenvolvimento e
produção, criação real do middleware, dependências inválidas, propagação de
falhas, posição anterior às sessões e rotas e integração completa ao ciclo de
abertura do servidor.

A suíte completa passou a possuir 327 testes distribuídos em 53 suítes.

### Validação real

A aplicação foi iniciada com o MongoDB local e a conta administrativa
existente. Uma requisição real a `GET /api/health` retornou `200` e confirmou
CSP, políticas de isolamento, referência, conteúdo e enquadramento.

No ambiente de desenvolvimento, a resposta não apresentou HSTS nem a diretiva
`upgrade-insecure-requests`, confirmando que o acesso local não será forçado
para HTTPS. O cabeçalho `X-Powered-By` continuou ausente.

O processo também foi encerrado por `SIGINT`, com fechamento seguro da
conexão MongoDB.

### Verificação

- 327 testes aprovados;
- 53 suítes aprovadas;
- zero falhas;
- zero testes ignorados;
- zero vulnerabilidades conhecidas;
- sintaxe validada;
- integração isolada, HTTP e de inicialização confirmada;
- cabeçalhos reais confirmados em desenvolvimento;
- inicialização e encerramento seguros.

### Próximo marco

Criar a primeira interface visual responsiva e a tela administrativa de login,
revisando a política CSP conforme os recursos locais efetivamente utilizados.

## 12 de setembro de 2026 — Fundação visual com React e Vite

### Objetivo

Iniciar a reconstrução da interface do protótipo original em uma base
modular, responsiva, testável e preparada para consumir a API já existente.

O escopo funcional permanece limitado ao que foi previsto no HTML entregue
pelo Prof. Dionísio. Funcionalidades destinadas a um futuro produto comercial
não fazem parte deste marco.

### Workspace do frontend

Foi criado o diretório `client/` como workspace independente. Ele utiliza
React 19.3.0, React DOM 19.3.0 e Vite 8.3.0, com arquivos próprios de
dependências e comandos para desenvolvimento, compilação e preview.

Durante o desenvolvimento, o Vite utiliza a porta 5173 e encaminha caminhos
iniciados por `/api` ao backend na porta 3000. A compilação é produzida em
`client/dist`, diretório explicitamente excluído do Git junto com
`node_modules` e os caches locais.

### Primeira estrutura visual

A aplicação React possui um ponto de montagem explícito, utiliza `StrictMode`
e apresenta uma tela inicial responsiva para a futura entrada administrativa.
A identidade visual informa o Senac Ceilândia, o calendário de aulas e o Prof.
Dionísio Pereira.

O símbolo genérico de calendário foi substituído por um elemento semântico
`time`, que apresenta o mês e o dia reais no idioma português. A data é
montada no fuso local do navegador, evitando deslocamentos causados por uma
conversão antecipada para UTC.

### Testes do frontend

Foram adicionados Vitest 4.1.11, jsdom 27.4.0 e Testing Library. O ambiente de
teste mantém globais desativados e restaura mocks entre os cenários.

Os dois primeiros testes verificam a estrutura semântica, os textos da
identidade visual e a apresentação determinística de 12 de setembro de 2026.
A compilação de produção processou 16 módulos e gerou HTML, CSS e JavaScript
sem erros.

### Verificação

- 327 testes do backend aprovados em 53 suítes;
- 2 testes do frontend aprovados em 1 suíte;
- 329 testes aprovados em 54 suítes no total;
- zero falhas;
- zero testes ignorados;
- zero vulnerabilidades conhecidas nos dois workspaces;
- compilação e preview de produção confirmados;
- atualização automática durante o desenvolvimento confirmada;
- `node_modules` e `dist` ausentes do controle de versão.

### Próximo marco

Construir o formulário administrativo de login, testá-lo isoladamente e
integrá-lo às rotas de autenticação já disponíveis no backend.

## 13 de setembro de 2026 — Autenticação administrativa no frontend

### Objetivo

Conectar a primeira interface React às rotas administrativas já existentes,
sem ampliar o escopo funcional definido no HTML original do Prof. Dionísio.

### Serviço de comunicação

Foi criado o `AuthenticationApi`, responsável exclusivamente pelos contratos
HTTP de entrada, consulta da sessão e saída. O serviço utiliza caminhos
relativos, envia cookies pela mesma origem, impede cache das respostas e
seleciona somente os campos públicos esperados.

Falhas conhecidas preservam o código e a mensagem segura enviados pelo
backend. Respostas malformadas, falhas de rede e erros inesperados são
convertidos em mensagens genéricas, sem incorporar credenciais ou causas
técnicas à interface.

### Formulário administrativo

O `LoginForm` mantém e-mail e senha em estado local, normaliza apenas os
espaços externos do e-mail e preserva integralmente a senha. O envio permanece
bloqueado enquanto os campos estão incompletos ou uma requisição está em
andamento.

Rótulos, autocompletar, estados de ocupação, mensagens com função de alerta e
foco visível foram implementados para manter o formulário acessível. Os
estilos respeitam a estrutura responsiva iniciada no marco anterior.

### Ciclo da sessão

Ao iniciar, `App` consulta `GET /api/auth/session` antes de decidir qual
conteúdo apresentar. Uma sessão válida restaura o acesso depois de atualizar
a página. A ausência de autenticação apresenta o formulário normalmente e
outras falhas recebem uma mensagem pública sem impedir uma nova tentativa.

Depois do login, a tela confirma a entrada. O `LogoutButton` solicita o
encerramento ao backend e remove o acesso visual somente depois da resposta
`204`. Se a operação falhar, a sessão permanece representada e o usuário pode
tentar novamente.

### Testes automatizados

O frontend passou a possuir 58 testes em quatro arquivos. Eles cobrem o
serviço HTTP, os contratos das respostas, o formulário, o botão de saída, os
estados pendentes, as mensagens seguras, a restauração da sessão e os fluxos
completos de login e logout dentro da aplicação.

O comando de testes do projeto principal foi restringido a
`test/*.test.js`. Essa fronteira impede que o test runner nativo do Node.js
tente interpretar arquivos do Vitest encontrados no workspace `client/`.

### Validação real

O frontend foi executado pelo Vite enquanto o backend utilizava o MongoDB
local. Credenciais diferentes das configuradas foram recusadas e a conta
administrativa do `.env` entrou normalmente.

Depois da autenticação, uma atualização da página restaurou a sessão e exibiu
que o acesso permanecia ativo. O botão de saída devolveu o formulário e uma
nova atualização confirmou que a sessão também havia sido removida do
servidor.

### Verificação

- 327 testes do backend aprovados em 53 suítes;
- 58 testes do frontend aprovados em quatro arquivos;
- 385 testes aprovados em 57 suítes no total;
- zero falhas;
- zero testes ignorados;
- zero vulnerabilidades conhecidas nos dois workspaces;
- compilação de produção concluída com 19 módulos;
- login, restauração por atualização e logout confirmados no navegador;
- contrato original do Prof. Dionísio preservado sem funcionalidades extras.

### Próximo marco

Disponibilizar pelo Express a compilação de produção do frontend e preparar a
estrutura inicial da área autenticada conforme o HTML original.

## 14 de setembro de 2026 — Frontend de produção servido pelo Express

### Objetivo

Disponibilizar a compilação React pelo próprio servidor Express, mantendo
interface e API na mesma origem e preservando o escopo funcional definido
no HTML original do Prof. Dionísio.

### Middleware dos arquivos do frontend

Foi criado o `frontendAssets.js`, responsável por validar o diretório
absoluto da compilação e confirmar que `index.html` existe como arquivo
antes da abertura dos recursos externos da aplicação.

O middleware entrega HTML, CSS e JavaScript compilados. O fallback da
interface aceita somente requisições `GET` e `HEAD` compatíveis com HTML,
sem interceptar caminhos iniciados por `/api`, arquivos inexistentes ou
requisições destinadas exclusivamente a JSON.

Dessa forma, uma rota visual pode receber o `index.html`, enquanto rotas
desconhecidas da API e arquivos ausentes continuam chegando ao tratamento
padronizado de erros do Express.

### Integração ao ciclo do servidor

O `createApp` passou a receber o middleware do frontend por injeção de
dependência. Ele é instalado depois das rotas da API e do diagnóstico, mas
antes dos middlewares de rota inexistente e tratamento final de erros.

O ponto de composição resolve `client/dist` a partir da localização de
`src/server.js`, cria o middleware antes de conectar o MongoDB e entrega o
resultado validado ao Express.

O projeto principal também recebeu o script `npm run build`. O ciclo
`prestart` executa essa compilação automaticamente antes de `npm start`,
evitando que o servidor utilize uma versão ausente ou desatualizada do
frontend.

### Testes automatizados

Os testes isolados validam diretórios, sistemas de arquivos, `index.html`,
implementações Express, roteadores, middlewares estáticos e a ordem de
instalação.

Os cenários HTTP confirmam a entrega da raiz, de um arquivo estático real,
de rotas visuais e de requisições `HEAD`. Também comprovam que API, JSON,
arquivos inexistentes e métodos diferentes dos permitidos não recebem o
fallback visual.

A integração ao `createApp` verifica a ordem entre segurança, sessão, API
e frontend. O ciclo do servidor rejeita fábricas e resultados inválidos
antes da conexão com o MongoDB.

O backend passou de 327 para 353 testes, distribuídos em 57 suítes. Os 58
testes do frontend permaneceram aprovados em quatro arquivos.

### Validação real

A aplicação foi iniciada com `npm start`. O `prestart` compilou 19 módulos
do frontend e somente depois abriu o Express e a conexão com o MongoDB.

Na porta `3000`, a raiz retornou HTML com os cabeçalhos de segurança, os
arquivos CSS e JavaScript retornaram `200` e uma rota visual recebeu o
`index.html`. Uma rota desconhecida da API e um arquivo inexistente
permaneceram respostas JSON `404`.

No navegador, login, restauração da sessão depois de `F5` e logout
funcionaram utilizando a mesma origem. Uma atualização posterior ao logout
manteve o formulário administrativo, confirmando o encerramento da sessão.

O processo foi encerrado por `SIGINT`, com fechamento seguro da conexão
MongoDB.

### Verificação

- 353 testes do backend aprovados em 57 suítes;
- 58 testes do frontend aprovados em quatro arquivos;
- 411 testes aprovados em 61 suítes no total;
- zero falhas;
- zero testes ignorados;
- zero vulnerabilidades conhecidas nos dois workspaces;
- sintaxe validada;
- compilação de produção concluída com 19 módulos;
- HTML, CSS, JavaScript, fallback visual e API confirmados na porta 3000;
- login, restauração da sessão e logout confirmados na mesma origem;
- inicialização e encerramento seguros;
- contrato original do Prof. Dionísio preservado sem funcionalidades extras.

### Próximo marco

Reconstruir a estrutura inicial da área autenticada conforme o HTML original,
sem acrescentar funcionalidades que não tenham sido solicitadas pelo Prof.
Dionísio.

## 15 de setembro de 2026 — Estrutura inicial da área autenticada

### Objetivo

Substituir a confirmação temporária apresentada depois do login pela estrutura
inicial da área autenticada prevista no HTML original do Prof. Dionísio, sem
simular dados ou disponibilizar operações que ainda não foram implementadas.

### Navegação do calendário

Foi criado o componente `CalendarNavigation`, que mantém um contrato estável
para as quatro seções originais: Painel geral, Gerenciar aulas, Materiais e
Calendário visual.

A navegação utiliza botões nativos, identifica a seção atual com
`aria-current` e comunica somente o identificador selecionado ao componente
responsável pelo estado. Identificadores, definições e mensagens públicas foram
protegidos contra alterações acidentais.

### Área autenticada

O componente `CalendarWorkspace` passou a compor o cabeçalho, a identificação
da sessão, a saída, a navegação e o conteúdo da seção ativa. O painel geral
apresenta o total inicial igual a zero e os textos `Nenhuma aula próxima` e
`Nenhuma aula marcada para revisão`, preservando o estado vazio do protótipo.

As demais seções apresentam somente seus títulos neste marco. Nenhum formulário,
filtro, material, aula demonstrativa, armazenamento local ou chamada de API foi
adicionado antes da implementação dos modelos e contratos reais.

### Integração ao ciclo da interface

O `App` continua responsável pela consulta da sessão, login e logout. Depois
da autenticação, ele entrega a apresentação ao `CalendarWorkspace`, mantendo
as credenciais fora do estado principal e preservando a confirmação do backend
antes de remover visualmente o acesso.

Os testes existentes do `App` foram atualizados para reconhecer a nova área
pela navegação acessível, em lugar do título temporário `Acesso confirmado`.
Também passaram a consultar diretamente os textos da sessão, evitando
ambiguidade entre os elementos que possuem papel de estado.

### Apresentação responsiva

Os estilos globais receberam uma composição própria para cabeçalho, sessão,
navegação, painel, cartões e estados vazios. As cores e variáveis existentes
foram reutilizadas, assim como o foco visível e os estados de interação.

Em larguras menores, o cabeçalho é empilhado, a saída ocupa a largura
disponível, a navegação utiliza duas colunas e os cartões passam para uma única
coluna. Uma duplicação do bloco CSS identificada durante a inspeção do diff foi
removida antes da validação final.

### Testes automatizados

Foram adicionados sete testes para a navegação e treze testes para o workspace.
Eles cobrem contratos imutáveis, propriedades inválidas, seleção ativa, troca
entre seções, estrutura vazia do painel e estados de saída.

Os dezesseis testes do `App` continuaram cobrindo verificação inicial, login,
restauração, falhas públicas e logout depois da atualização das expectativas.
O frontend passou de 58 para 78 testes, distribuídos em seis arquivos.

### Validação real

A aplicação foi iniciada com `npm start` e o MongoDB local. Depois do login, o
painel geral apresentou a contagem e os estados vazios previstos. As quatro
seções responderam à navegação, a sessão permaneceu ativa depois de atualizar a
página e o layout se adaptou à redução da janela.

O logout retornou ao formulário normalmente. O processo também foi encerrado
por `SIGINT`, com fechamento seguro da conexão MongoDB.

### Verificação

- 353 testes do backend aprovados em 57 suítes;
- 78 testes do frontend aprovados em seis arquivos;
- 431 testes aprovados em 63 suítes no total;
- zero falhas;
- zero testes ignorados;
- zero vulnerabilidades conhecidas nos dois workspaces;
- compilação de produção concluída com 21 módulos;
- integração de login, restauração e logout preservada;
- navegação e layout responsivo confirmados no navegador;
- duplicação de estilos removida e diff validado;
- contrato original do Prof. Dionísio preservado sem funcionalidades extras.

### Próximo marco

Criar os modelos persistentes necessários ao calendário, definindo os dados e
as regras de aulas, atividades e materiais antes de implementar suas APIs.

## 15 de setembro de 2026 — Modelos persistentes do calendário

### Objetivo

Definir no Mongoose os dados e as regras persistentes presentes no protótipo
original antes de criar APIs, formulários funcionais ou migração de conteúdo.

### Análise do protótipo

O armazenamento local original possui duas coleções: aulas e materiais
mensais. Cada aula contém data, curso, UC, tipo, número, indicação de revisão e
links específicos de PA e GD+AD. O material mensal contém somente mês e os dois
links aplicáveis ao período inteiro.

Atividade e avaliação foram mantidas como tipos do registro de aula, em vez de
modelos separados. A UC também permanece um campo da aula. Dessa forma, a
modelagem conserva a estrutura funcional existente sem criar entidades que o
Prof. Dionísio não solicitou.

### Modelo de aula

Foi criado o `Lesson`, com fábricas independentes para schema e modelo. Os
nomes internos `date`, `course`, `curricularUnit`, `type`,
`lessonNumber`, `needsReview`, `lessonPlanUrl` e `studentGuideUrl`
correspondem diretamente aos oito campos do protótipo.

Os cursos APQSA, TECMKT e TECADM e os tipos Aula, Atividade e Avaliação foram
reunidos em contratos imutáveis. A data é armazenada como texto `YYYY-MM-DD`
e validada como dia civil existente, inclusive quanto a anos bissextos. Isso
evita que uma conversão de fuso horário altere o dia apresentado.

Textos são normalizados, campos opcionais utilizam `null` e os links aceitam
somente HTTP ou HTTPS sem credenciais incorporadas. Um índice não exclusivo
por data e curso atende às consultas esperadas sem impedir vários registros do
mesmo curso no mesmo dia.

### Modelo de material mensal

Foi criado o `MonthlyMaterial`, limitado a `month`, `lessonPlanUrl` e
`studentGuideUrl`. O mês permanece no formato civil `YYYY-MM`, e os links
seguem a mesma política do modelo de aula.

O protótipo procura apenas um material para o mês da aula. Para impedir uma
escolha ambígua, o schema declara um índice único por período. Os dois links
continuam opcionais, preservando o contrato do formulário original.

### Isolamento e segurança

As fábricas seguem o padrão estabelecido no modelo de usuário: validam a
instância do Mongoose, reutilizam modelos registrados e permitem construir
documentos inteiramente em memória. Importar ou testar os módulos não abre
conexão com o MongoDB.

Limites de tamanho impedem documentos descontrolados. Protocolos locais,
executáveis ou de transferência de arquivos são recusados, assim como
endereços que incluam usuário ou senha. Nenhum segredo ou dado administrativo
foi acrescentado aos registros do calendário.

### Testes automatizados

O modelo de aula recebeu 31 testes em sete suítes. Eles cobrem contratos,
normalização, datas civis, URLs, campos exatos, índice, timestamps, fábricas,
valores padrão, cursos, tipos e limites.

O material mensal recebeu 21 testes em cinco suítes. Eles validam o mês, a
normalização, os três campos funcionais, a unicidade declarada, os links
opcionais, as fábricas e os limites. Todos os testes utilizam instâncias
isoladas e dispensam MongoDB externo.

### Verificação

- 405 testes do backend aprovados em 69 suítes;
- 78 testes do frontend aprovados em seis arquivos;
- 483 testes aprovados em 75 suítes no total;
- zero falhas;
- zero testes ignorados;
- zero vulnerabilidades conhecidas nos dois workspaces;
- sintaxe dos dois modelos e dos dois testes validada;
- compilação de produção concluída com 21 módulos;
- nenhuma conexão externa exigida pelos novos testes;
- contrato original preservado sem entidades ou funcionalidades adicionais.

### Próximo marco

Implementar progressivamente as APIs administrativas do calendário, começando
pelas regras de aplicação e pelos contratos de criação e consulta das aulas.
