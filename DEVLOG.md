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
