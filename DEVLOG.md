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

### Próximo marco

Criar de forma controlada a primeira conta administrativa:

1. implementar um serviço de inicialização do administrador;
2. consultar o usuário pelo e-mail normalizado;
3. evitar a recriação de uma conta existente;
4. gerar o hash somente quando a conta precisar ser criada;
5. tratar conflitos de unicidade;
6. integrar a inicialização ao ciclo de abertura da aplicação;
7. testar o fluxo sem depender de um MongoDB externo.
