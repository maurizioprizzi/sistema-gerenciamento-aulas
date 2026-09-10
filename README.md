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
primeira conta, sessões persistentes e autenticação administrativa integrada à
API HTTP.

O administrador é preparado depois da conexão com o banco e antes da abertura
da porta HTTP. O processo é idempotente: uma conta existente é preservada e
não é duplicada nem tem sua senha substituída.

As sessões autenticadas são armazenadas no MongoDB. O armazenamento reutiliza
o mesmo cliente mantido pelo Mongoose, enquanto o navegador recebe somente um
identificador opaco protegido por cookie.

O login localiza a conta pelo e-mail normalizado, recupera explicitamente o
hash protegido, compara a senha com bcrypt, regenera a sessão e persiste apenas
o identificador e o papel do administrador. O logout destrói a sessão no
servidor e invalida o cookie no navegador.

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
- identidade autenticada pública e imutável;
- regeneração da sessão depois do login;
- persistência somente do identificador e do papel;
- rotas `POST /api/auth/login` e `POST /api/auth/logout`;
- destruição da sessão e limpeza do cookie no logout;
- bloqueio do servidor HTTP quando a inicialização falha;
- validações reais com MongoDB local;
- testes HTTP, unitários e de integração controlada;
- documentação das decisões de engenharia.

### Ainda não implementado

- atualização do último acesso durante o login;
- limitação de tentativas repetidas de autenticação;
- autorização das futuras rotas administrativas;
- cabeçalhos adicionais de segurança;
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
271 testes
41 suítes
0 falhas
0 testes ignorados
```

Os testes verificam, entre outros comportamentos:

- fundação HTTP, erros e limites do corpo JSON;
- ambiente, porta e ciclo de vida do servidor;
- conexão, cliente nativo e encerramento do MongoDB;
- modelo administrativo e índice único do e-mail;
- proteção e comparação de senhas com bcrypt;
- inicialização idempotente do administrador;
- armazenamento persistente e cookies de sessão;
- autenticação com respostas genéricas;
- comparação substituta para usuários inexistentes;
- identidade pública e identidade mínima da sessão;
- regeneração, gravação e destruição de sessões;
- limpeza após falhas durante a persistência;
- handlers vinculados de login e logout;
- remoção de campos privados da resposta;
- limpeza coerente do cookie em desenvolvimento e produção;
- registro das rotas de entrada e saída;
- montagem do roteador sob `/api/auth`;
- execução do middleware de sessão antes da autenticação;
- composição das dependências antes da abertura HTTP;
- bloqueio da inicialização diante de fábricas inválidas;
- ausência de senhas, hashes, segredos e cookies nos logs.

Os testes automatizados utilizam dependências controladas sempre que possível
e não exigem um MongoDB externo.

Além da suíte automatizada, o fluxo HTTP completo foi validado manualmente com
MongoDB local. O login real retornou `200`, emitiu um cookie e criou uma única
sessão. O logout retornou `204`, invalidou o cookie e removeu a sessão.

Tentativas com senha incorreta e com e-mail inexistente retornaram a mesma
resposta `401`, não emitiram cookies e não criaram sessões.

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
│   ├── controllers/
│   │   └── AuthenticationController.js
│   ├── errors/
│   │   └── AppError.js
│   ├── middlewares/
│   │   └── errorHandler.js
│   ├── models/
│   │   └── User.js
│   ├── routes/
│   │   └── authenticationRoutes.js
│   ├── services/
│   │   ├── AdminBootstrapper.js
│   │   ├── AuthenticationService.js
│   │   ├── PasswordHasher.js
│   │   └── SessionManager.js
│   ├── app.js
│   └── server.js
├── test/
│   ├── AdminBootstrapper.test.js
│   ├── AppError.test.js
│   ├── AuthenticationController.test.js
│   ├── AuthenticationService.test.js
│   ├── PasswordHasher.test.js
│   ├── SessionManager.test.js
│   ├── app.test.js
│   ├── authenticationIntegration.test.js
│   ├── authenticationRoutes.test.js
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

Configura o Express, instala o middleware de sessão, monta as rotas de
autenticação sob `/api/auth` e mantém o tratamento de erros por último.

### `src/server.js`

Compõe banco, administrador, sessões, autenticação e Express. A porta HTTP
somente é aberta depois que todas as dependências obrigatórias estão prontas.

### `src/config/env.js`

Define, valida e normaliza as variáveis utilizadas pela aplicação sem incluir
valores confidenciais nas mensagens de erro.

### `src/config/database.js`

Encapsula o ciclo da conexão Mongoose e fornece de maneira controlada o cliente
MongoDB nativo utilizado pelo armazenamento de sessões.

### `src/config/session.js`

Cria o armazenamento connect-mongo e configura o express-session, a expiração
e os atributos de cookie apropriados ao ambiente.

### `src/controllers/AuthenticationController.js`

Coordena as operações HTTP de login e logout, limita a resposta aos campos
públicos autorizados e garante a limpeza coerente do cookie.

### `src/errors/AppError.js`

Representa erros operacionais conhecidos pela aplicação.

### `src/middlewares/errorHandler.js`

Converte erros conhecidos em respostas JSON seguras e oculta detalhes de
falhas inesperadas.

### `src/models/User.js`

Define o usuário administrativo e protege o hash contra exposição acidental.

### `src/routes/authenticationRoutes.js`

Registra as rotas `POST /login` e `POST /logout`, posteriormente montadas
pelo app sob o prefixo `/api/auth`.

### `src/services/AdminBootstrapper.js`

Garante a existência da conta administrativa sem substituir uma conta já
cadastrada e trata conflitos de criação simultânea.

### `src/services/AuthenticationService.js`

Normaliza credenciais, recupera explicitamente o hash, compara senhas e devolve
somente uma identidade pública mínima e imutável.

### `src/services/PasswordHasher.js`

Gera e compara hashes bcrypt, valida o custo e impede o truncamento silencioso
de senhas acima de 72 bytes.

### `src/services/SessionManager.js`

Regenera, grava e destrói sessões autenticadas. Somente o identificador e o
papel do usuário são persistidos.

### `test/`

Contém os testes unitários, HTTP e de integração controlada correspondentes.

### `DEVLOG.md`

Registra cronologicamente os marcos, decisões e verificações do desenvolvimento.

## API atual

### Diagnóstico

```http
GET /api/health
```

### Entrada administrativa

```http
POST /api/auth/login
Content-Type: application/json
```

Corpo esperado:

```json
{
  "email": "administrador@example.com",
  "password": "senha-informada-pelo-administrador"
}
```

Em caso de sucesso, a resposta possui código `200`, cria a sessão e devolve
somente os campos públicos do usuário:

```json
{
  "data": {
    "user": {
      "id": "identificador-do-usuario",
      "name": "Nome do Administrador",
      "email": "administrador@example.com",
      "role": "admin"
    }
  }
}
```

Credenciais recusadas retornam `401` com uma mensagem genérica:

```json
{
  "error": {
    "code": "INVALID_CREDENTIALS",
    "message": "E-mail ou senha inválidos."
  }
}
```

### Saída administrativa

```http
POST /api/auth/logout
```

O logout destrói a sessão, limpa o cookie e retorna `204 No Content`.

### Rota inexistente

Uma rota desconhecida retorna `404` com o código `ROUTE_NOT_FOUND`.

### Requisições inválidas

JSON malformado retorna `400` com o código `INVALID_JSON`. Corpos acima de
100 KB retornam `413` com o código `PAYLOAD_TOO_LARGE`.

## Segurança implementada

- variáveis de ambiente validadas antes da inicialização;
- segredos excluídos do Git e ausentes das mensagens de erro;
- cabeçalho `X-Powered-By` removido;
- limite de `100kb` para corpos JSON;
- erros inesperados ocultados das respostas;
- logs sem corpo, cookies ou cabeçalhos da requisição;
- servidor HTTP bloqueado quando preparações obrigatórias falham;
- senha original ausente do modelo e do banco;
- hash oculto e selecionado somente durante a autenticação;
- hashing assíncrono com salt bcrypt e custo controlado;
- limite de senha medido em bytes UTF-8;
- criação administrativa idempotente;
- sessões armazenadas no servidor com expiração controlada;
- cookies `HttpOnly`, `SameSite=Lax` e `Secure` em produção;
- ausência de sessões vazias para visitantes anônimos;
- comparação substituta para contas inexistentes;
- mensagem genérica para senha incorreta, conta inexistente ou inativa;
- regeneração da sessão depois da autenticação;
- persistência somente do identificador e do papel;
- destruição da sessão e limpeza do cookie durante o logout;
- limpeza do banco após falhas de inicialização;
- auditoria periódica das dependências.

Essas medidas ainda não tornam a aplicação pronta para produção. Limitação de
tentativas, autorização, cabeçalhos adicionais, HTTPS e implantação segura
ainda serão implementados.

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

1. limitar tentativas repetidas de autenticação;
2. atualizar controladamente o último acesso;
3. criar o middleware de autorização administrativa;
4. proteger as futuras rotas administrativas;
5. adicionar cabeçalhos HTTP de segurança;
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
