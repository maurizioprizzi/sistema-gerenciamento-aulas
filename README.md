# Calendário do Prof. Dionísio

Aplicação web para organizar aulas, unidades curriculares, atividades e
materiais didáticos do Prof. Dionísio Pereira, do Senac Ceilândia.

O projeto está sendo reconstruído a partir de um protótipo HTML que armazenava
os dados somente no navegador. A nova aplicação utiliza Node.js, Express e
MongoDB para oferecer armazenamento centralizado e, futuramente, acesso seguro
por computadores e celulares.

> Última atualização desta documentação: 10 de setembro de 2026.

## Estado atual

A fundação técnica do backend está concluída. O projeto já possui servidor
HTTP, conexão com MongoDB, validação de ambiente, tratamento centralizado de
erros, modelo administrativo, proteção de senhas, inicialização controlada da
primeira conta, sessões persistentes e um serviço isolado de autenticação
administrativa.

O administrador é preparado depois da conexão com o banco e antes da abertura
da porta HTTP. O processo é idempotente: uma conta existente é preservada e
não é duplicada nem tem sua senha substituída.

As futuras sessões autenticadas serão armazenadas no MongoDB. O armazenamento
reutiliza o mesmo cliente mantido pelo Mongoose, enquanto o navegador receberá
somente um identificador opaco protegido por cookie.

O serviço de autenticação já localiza a conta pelo e-mail normalizado, recupera
explicitamente o hash protegido, compara a senha com bcrypt e devolve somente
a identidade mínima. Ele ainda não está ligado a rotas HTTP de entrada e saída.

### Funcionalidades concluídas

- servidor Node.js com Express;
- rota pública de diagnóstico;
- resposta JSON padronizada para erros;
- limite para corpos JSON recebidos;
- validação rigorosa da porta HTTP;
- inicialização e encerramento controlados;
- conexão encapsulada com MongoDB;
- prevenção de tentativas simultâneas de conexão;
- acesso controlado ao cliente MongoDB nativo;
- reutilização da conexão Mongoose pelo armazenamento de sessões;
- encerramento ordenado do servidor e do banco;
- carregamento de variáveis com dotenv;
- validação e normalização das configurações com Zod;
- proteção do arquivo `.env` contra inclusão no Git;
- modelo Mongoose para o usuário administrativo;
- normalização e índice único para o e-mail;
- ocultação do hash da senha em consultas e serializações;
- hashing assíncrono de senhas com bcrypt;
- validação do limite de 72 bytes do bcrypt;
- configuração segura do custo computacional do hash;
- serviço idempotente para criação do primeiro administrador;
- tratamento de conflitos concorrentes de e-mail;
- integração do administrador ao ciclo de abertura do servidor;
- armazenamento persistente de sessões com connect-mongo;
- middleware de sessões com express-session;
- cookies `HttpOnly` e `SameSite=Lax`;
- cookie `Secure` com prefixo `__Host-` em produção;
- prevenção de cookies e sessões vazias para visitantes anônimos;
- integração das sessões ao ciclo de abertura do servidor;
- serviço isolado de autenticação administrativa;
- seleção explícita do hash somente durante a autenticação;
- comparação bcrypt substituta para contas inexistentes;
- resposta genérica para credenciais recusadas;
- rejeição de contas administrativas inativas;
- identidade autenticada mínima e imutável;
- bloqueio do servidor HTTP quando a inicialização falha;
- validações reais com MongoDB local;
- testes HTTP, unitários e de integração controlada;
- documentação das decisões de engenharia.

### Ainda não implementado

- rotas administrativas de entrada e saída;
- criação e encerramento de sessões autenticadas;
- atualização do último acesso durante o login;
- limitação de tentativas de autenticação;
- autorização das rotas administrativas;
- interface visual;
- cadastro de aulas e atividades;
- cadastro de unidades curriculares;
- armazenamento de materiais;
- migração dos dados do protótipo;
- acesso externo à aplicação;
- implantação em ambiente de produção.

A publicação do código em um repositório privado não significa que a aplicação
esteja implantada. O sistema ainda não deve ser utilizado em produção.

## Repositório

O código-fonte está armazenado em um repositório privado:

[github.com/maurizioprizzi/calendario-dionisio](https://github.com/maurizioprizzi/calendario-dionisio)

Somente pessoas convidadas e autenticadas no GitHub conseguem visualizar o
conteúdo.

## Tecnologias

- Node.js 20;
- npm 10;
- Express 5;
- MongoDB 7;
- Mongoose 9;
- bcryptjs 3;
- express-session 1;
- connect-mongo 6;
- dotenv 17;
- Zod 4;
- test runner nativo do Node.js;
- Git e GitHub.

Versões utilizadas no ambiente inicial de desenvolvimento:

```text
Node.js 20.20.1
npm 10.8.2
Git 2.43.0
MongoDB Server 7.0.42
MongoDB Shell 2.10.0
Express 5.2.1
Mongoose 9.9.4
bcryptjs 3.0.3
express-session 1.19.0
connect-mongo 6.0.0
dotenv 17.3.1
Zod 4.5.4
```

## Requisitos locais

Para executar o estágio atual do projeto:

- Node.js 20.20.0 ou superior;
- npm 10 ou superior;
- Git;
- MongoDB;
- acesso ao repositório privado, quando a instalação for feita pelo GitHub.

## Obter o projeto

Quem possuir acesso ao repositório poderá cloná-lo por SSH:

```bash
git clone git@github.com:maurizioprizzi/calendario-dionisio.git
cd calendario-dionisio
```

Na máquina utilizada para o desenvolvimento inicial, o projeto está em:

```bash
cd /home/maurizio/eclipse-workspace/dionisio
```

## Instalar as dependências

Para reproduzir exatamente as versões registradas no `package-lock.json`:

```bash
npm ci
```

Durante o desenvolvimento, quando for necessário adicionar ou atualizar uma
dependência:

```bash
npm install
```

Não é necessário executar `npm ci` e `npm install` em sequência. Utilize apenas
o comando apropriado para a finalidade desejada.

## Configuração local

Crie o arquivo local de configuração a partir do exemplo:

```bash
cp .env.example .env
```

Abra `.env` no editor e substitua os valores demonstrativos.

Gere um segredo de sessão com:

```bash
node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"
```

Utilize o resultado em `SESSION_SECRET`.

Também configure:

- `ADMIN_NAME` com o nome do administrador;
- `ADMIN_EMAIL` com o e-mail administrativo;
- `ADMIN_PASSWORD` com uma senha exclusiva e forte;
- `MONGODB_URI` com o endereço do banco de dados.

A senha administrativa deve:

- possuir pelo menos 12 caracteres;
- possuir no máximo 72 bytes em UTF-8;
- não ser reutilizada em outro serviço;
- existir somente no arquivo `.env` ou no ambiente seguro da hospedagem.

Nunca envie o conteúdo de `.env` por e-mail, mensagem ou commit.

### Variáveis disponíveis

| Variável | Obrigatória | Padrão | Finalidade |
| --- | --- | --- | --- |
| `NODE_ENV` | Não | `development` | Ambiente de execução |
| `HOST` | Não | `0.0.0.0` | Interface de rede do servidor |
| `PORT` | Não | `3000` | Porta HTTP |
| `MONGODB_URI` | Sim | — | Endereço do MongoDB |
| `SESSION_SECRET` | Sim | — | Proteção das sessões |
| `PASSWORD_HASH_ROUNDS` | Não | `12` | Custo computacional do bcrypt |
| `ADMIN_NAME` | Sim | — | Nome do administrador inicial |
| `ADMIN_EMAIL` | Sim | — | E-mail do administrador inicial |
| `ADMIN_PASSWORD` | Sim | — | Senha inicial do administrador |
| `SESSION_HOURS` | Não | `8` | Duração máxima da sessão |
| `APP_ORIGIN` | Sim | — | Origem autorizada da aplicação |
| `TRUST_PROXY` | Não | `0` | Uso de proxy reverso |

`PASSWORD_HASH_ROUNDS` aceita somente números inteiros entre 10 e 15. O valor
recomendado para o projeto é 12.

## Preparar o MongoDB local

Em uma instalação do MongoDB gerenciada pelo systemd:

```bash
sudo systemctl start mongod
```

Confirme que o serviço está ativo:

```bash
systemctl is-active mongod
```

Teste a comunicação com o banco:

```bash
mongosh --quiet --eval 'db.adminCommand({ ping: 1 })'
```

A resposta esperada contém:

```text
{ ok: 1 }
```

## Executar em desenvolvimento

```bash
npm run dev
```

Esse comando utiliza o modo de observação do Node.js e reinicia o processo
quando um arquivo JavaScript monitorado é alterado.

O endereço local do servidor é:

```text
http://localhost:3000
```

Neste estágio, ainda não existe uma interface visual na rota principal. O
endereço disponível para diagnóstico é:

```text
http://localhost:3000/api/health
```

Também é possível consultá-lo pelo terminal:

```bash
curl -i http://localhost:3000/api/health
```

Para encerrar o servidor, pressione `Ctrl+C`.

## Executar sem monitoramento

```bash
npm start
```

A aplicação valida o ambiente e estabelece a conexão com o MongoDB antes de
abrir a porta HTTP.

Se a configuração, o banco, a conta administrativa ou a infraestrutura de
sessões falhar, o servidor não será disponibilizado.

## Scripts disponíveis

| Comando | Finalidade |
| --- | --- |
| `npm start` | Inicia a aplicação sem monitoramento |
| `npm run dev` | Inicia com reinicialização automática |
| `npm test` | Executa todos os testes |
| `npm run check` | Verifica a sintaxe da entrada do servidor |

## Testes automatizados

Execute todos os testes:

```bash
npm test
```

No marco atual, a suíte possui:

```text
218 testes
29 suítes
0 falhas
0 testes ignorados
```

Os testes verificam, entre outros comportamentos:

- resposta da rota `/api/health`;
- remoção do cabeçalho que identifica o Express;
- formato seguro de erros HTTP;
- JSON malformado e corpos excessivamente grandes;
- portas válidas e inválidas;
- validação das variáveis de ambiente;
- ausência de senhas nas mensagens de erro;
- conexão, reutilização e desconexão do MongoDB;
- acesso seguro ao cliente MongoDB nativo;
- bloqueio do HTTP quando alguma preparação falha;
- validações e índice único do modelo de usuário;
- ocultação do hash da senha;
- geração e comparação de hashes bcrypt;
- custo computacional e limite de 72 bytes das senhas;
- comportamento com caracteres Unicode;
- criação controlada e idempotente do administrador;
- conflitos concorrentes de e-mail;
- armazenamento persistente de sessões;
- expiração e atualização controladas das sessões;
- cookies seguros para desenvolvimento e produção;
- prevenção de sessões anônimas vazias;
- execução do middleware de sessão antes das rotas;
- validação das fábricas e da ordem de inicialização;
- configuração controlada dos índices em produção;
- validação das dependências do serviço de autenticação;
- normalização das credenciais;
- recuperação explícita do hash protegido;
- autenticação de uma conta administrativa ativa;
- comparação substituta para usuário inexistente;
- resposta pública genérica para credenciais recusadas;
- recusa de contas inativas;
- identidade autenticada mínima e imutável;
- propagação de falhas reais do banco e do bcrypt.

Os testes automatizados utilizam dependências controladas sempre que possível
e não exigem um MongoDB externo.

Além da suíte automatizada, os fluxos administrativo, de sessões e de
autenticação foram validados manualmente com MongoDB local.

A primeira execução administrativa criou uma única conta com hash bcrypt, e a
segunda execução preservou a mesma conta sem duplicação. A rota pública
`/api/health` respondeu sem emitir `Set-Cookie` e sem criar uma sessão anônima,
confirmando a configuração `saveUninitialized: false`.

A autenticação real reconheceu a senha correta e devolveu somente `id`, `name`,
`email` e `role`. Tentativas com senha incorreta e com e-mail inexistente
retornaram o mesmo erro público `401 INVALID_CREDENTIALS`.

## Auditoria das dependências

Execute:

```bash
npm audit
```

No marco documentado, a auditoria apresentou:

```text
found 0 vulnerabilities
```

Esse resultado representa o momento da verificação. A auditoria deve ser
executada novamente após alterações nas dependências e antes da implantação.

## Estrutura atual

```text
dionisio/
├── src/
│   ├── config/
│   │   ├── database.js
│   │   ├── env.js
│   │   └── session.js
│   ├── errors/
│   │   └── AppError.js
│   ├── middlewares/
│   │   └── errorHandler.js
│   ├── models/
│   │   └── User.js
│   ├── services/
│   │   ├── AdminBootstrapper.js
│   │   ├── AuthenticationService.js
│   │   └── PasswordHasher.js
│   ├── app.js
│   └── server.js
├── test/
│   ├── AdminBootstrapper.test.js
│   ├── AppError.test.js
│   ├── AuthenticationService.test.js
│   ├── PasswordHasher.test.js
│   ├── app.test.js
│   ├── database.test.js
│   ├── env.test.js
│   ├── errorHandler.test.js
│   ├── server.test.js
│   ├── session.test.js
│   └── user.test.js
├── .editorconfig
├── .env.example
├── .gitignore
├── DEVLOG.md
├── package-lock.json
├── package.json
└── README.md
```

## Responsabilidades dos módulos

### `src/app.js`

Configura a aplicação Express, os middlewares e as rotas HTTP.

Esse módulo não abre uma porta diretamente, permitindo que testes criem
instâncias isoladas da aplicação. O middleware de sessão é recebido pronto por
injeção e instalado antes das rotas.

### `src/server.js`

Carrega e valida o ambiente, conecta o MongoDB, garante a existência da conta
administrativa, constrói a infraestrutura de sessões, cria o servidor HTTP e
controla sua inicialização e seu encerramento.

A porta HTTP somente é aberta depois que o banco, a conta administrativa e as
sessões estão disponíveis.

### `src/config/env.js`

Define, valida e normaliza as variáveis utilizadas pela aplicação. Valores
confidenciais não são incluídos nas mensagens de erro.

### `src/config/database.js`

Encapsula o ciclo de conexão com o MongoDB por meio do Mongoose. Também fornece
acesso validado ao cliente MongoDB nativo, reutilizado pelo armazenamento de
sessões.

### `src/config/session.js`

Constrói o armazenamento persistente com connect-mongo e configura o
middleware do express-session. Centraliza duração, cookies, nomes, expiração e
validações de segurança.

### `src/errors/AppError.js`

Representa erros operacionais conhecidos pela aplicação.

### `src/middlewares/errorHandler.js`

Converte erros conhecidos em respostas JSON seguras e oculta detalhes de
falhas inesperadas.

### `src/models/User.js`

Define o usuário administrativo e protege o hash da senha contra exposição
acidental.

### `src/services/PasswordHasher.js`

Gera e compara hashes bcrypt, valida o custo computacional e impede o
truncamento silencioso de senhas.

### `src/services/AdminBootstrapper.js`

Garante a existência da primeira conta administrativa sem substituir uma conta
já cadastrada. Também trata conflitos de criação simultânea e evita que
credenciais sejam incluídas nos resultados ou nos logs.

### `src/services/AuthenticationService.js`

Valida e normaliza credenciais, recupera explicitamente o hash protegido,
compara a senha com bcrypt e devolve somente uma identidade pública mínima e
imutável. Utiliza uma comparação substituta para reduzir a possibilidade de
descobrir contas cadastradas por diferenças no fluxo de autenticação.

### `test/`

Contém os testes automatizados correspondentes aos módulos da aplicação.

### `DEVLOG.md`

Registra cronologicamente os marcos, decisões e verificações realizadas durante
o desenvolvimento.

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

O campo `timestamp` é gerado no momento da requisição.

### Rota inexistente

Uma rota desconhecida retorna o código HTTP `404`:

```json
{
  "error": {
    "code": "ROUTE_NOT_FOUND",
    "message": "O endereço solicitado não existe."
  }
}
```

### JSON inválido

Um corpo JSON malformado retorna o código HTTP `400`:

```json
{
  "error": {
    "code": "INVALID_JSON",
    "message": "O corpo da requisição contém um JSON inválido."
  }
}
```

### Corpo excessivamente grande

Um corpo superior ao limite configurado retorna o código HTTP `413`:

```json
{
  "error": {
    "code": "PAYLOAD_TOO_LARGE",
    "message": "O corpo da requisição excede o limite permitido."
  }
}
```

As rotas de autenticação ainda não fazem parte da API pública.

## Segurança implementada

- variáveis de ambiente validadas antes da inicialização;
- segredos excluídos do Git;
- mensagens de configuração sem valores confidenciais;
- cabeçalho `X-Powered-By` removido;
- limite de `100kb` para corpos JSON;
- erros inesperados ocultados das respostas;
- logs de erro sem corpo, cookies ou cabeçalhos da requisição;
- servidor HTTP bloqueado quando preparações obrigatórias falham;
- hash de senha oculto nas consultas comuns e representações JSON;
- senha original ausente do modelo e do banco;
- hashing assíncrono com salt bcrypt;
- custo mínimo e máximo do hash;
- limite de senha medido em bytes UTF-8;
- criação administrativa idempotente e sem substituição automática;
- conflitos concorrentes de e-mail tratados;
- sessões armazenadas no servidor com expiração controlada;
- cookies `HttpOnly`, `SameSite=Lax` e `Secure` em produção;
- ausência de sessões vazias para visitantes anônimos;
- seleção do hash somente no fluxo de autenticação;
- comparação bcrypt substituta para contas inexistentes;
- mensagem genérica para senha incorreta, conta inexistente ou inativa;
- identidade autenticada sem senha, hash ou documento interno;
- limpeza do banco após falhas de inicialização;
- auditoria periódica das dependências.

Essas medidas ainda não tornam a aplicação pronta para produção. Rotas de
entrada e saída, regeneração da sessão, limitação de tentativas, autorização,
cabeçalhos adicionais de segurança e implantação HTTPS ainda serão
implementados.

## Princípios de desenvolvimento

1. Cada marco deve permanecer executável.
2. Regras importantes devem possuir testes.
3. Configurações confidenciais não devem entrar no Git.
4. Erros devem possuir formato padronizado.
5. Cada arquivo deve ter uma responsabilidade clara.
6. Dependências externas devem permanecer encapsuladas.
7. Decisões técnicas devem ser documentadas.
8. Segurança deve fazer parte da implementação desde o início.
9. A interface deverá funcionar em computador e celular.
10. Nenhuma etapa avançará com testes conhecidos em falha.

## Próximos marcos

1. integrar a autenticação às rotas de entrada e saída;
2. regenerar e encerrar sessões autenticadas com segurança;
3. atualizar controladamente o último acesso;
4. limitar tentativas repetidas de autenticação;
5. proteger as rotas administrativas;
6. criar os modelos do calendário;
7. implementar as APIs de aulas, atividades e materiais;
8. migrar com segurança os dados do protótipo;
9. reconstruir a interface visual responsiva;
10. realizar testes completos de integração e interface;
11. preparar os guias técnico e didático;
12. publicar e validar a aplicação em computador e celular.

## Fluxo de atualização pelo Git

Antes de iniciar um novo período de trabalho:

```bash
git pull --ff-only
git status
```

Depois de um marco aprovado:

```bash
git add <arquivos-do-marco>
git commit
git push
```

Evite adicionar todos os arquivos indiscriminadamente. Prefira informar
explicitamente quais arquivos pertencem ao commit.

## Documentação de desenvolvimento

O histórico técnico detalhado está disponível em:

```text
DEVLOG.md
```

O diário registra objetivos, decisões, testes e próximos passos de cada marco.

## Licença

Projeto privado. Todos os direitos reservados.
