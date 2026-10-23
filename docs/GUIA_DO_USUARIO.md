# Guia de uso do Sistema de Gerenciamento de Aulas

> Guia atualizado em 23 de outubro de 2026.
>
> Este documento foi escrito para explicar o uso da aplicação sem exigir
> conhecimento de programação.

## 1. Para que serve a aplicação

O Sistema de Gerenciamento de Aulas permite:

- criar sua conta na própria instalação;
- cadastrar cursos com nome e sigla personalizados;
- editar e desativar cursos, mantendo seus registros no catálogo;
- cadastrar aulas, atividades e avaliações;
- editar registros já cadastrados;
- consultar registros já cadastrados;
- localizar registros por curso, mês ou data;
- cadastrar links de materiais que valem para um mês inteiro;
- consultar quais materiais serão utilizados em cada aula;
- acompanhar as próximas aulas;
- identificar registros marcados para revisão;
- visualizar as aulas em um calendário mensal.

Cada professor utiliza sua própria cópia, com conta e banco de dados próprios.
As gravações confirmadas ficam no banco da instalação, mesmo depois de atualizar
a página ou sair da conta. O projeto não fornece hospedagem compartilhada para
terceiros.

Esta versão está em desenvolvimento. O catálogo personalizado de **Cursos** já
funciona, mas ainda não fornece as opções dos formulários e filtros de aulas.
Use dados fictícios nas verificações enquanto essa integração e as instruções
de instalação para iniciantes estiverem em preparação.

## 2. Antes do primeiro acesso

Sua cópia precisa estar instalada e em funcionamento no computador. As
instruções técnicas atuais estão no [README](../README.md); o guia de instalação
simplificada para iniciantes ainda está em preparação.

Para o primeiro cadastro, tenha em mãos:

1. o endereço da sua instalação;
2. o código de primeiro acesso gerado durante a preparação dessa instalação.

Na configuração local padrão, o endereço é:

```text
http://localhost:3000
```

Use exatamente o endereço configurado. `localhost` e `127.0.0.1` são tratados
como endereços diferentes na proteção do primeiro cadastro. Na verificação
temporária de desenvolvimento, use o endereço e o código mostrados no terminal
daquela execução.

O endereço local funciona no computador da instalação. Abrir a aplicação em
outro computador ou celular exige uma configuração adicional, ainda fora deste
guia.

### 2.1 Criar sua própria conta

Se aparecer **Crie sua conta**:

1. informe seu nome e e-mail;
2. escolha uma senha com pelo menos 12 caracteres;
3. repita a senha em **Confirme a senha**;
4. cole o código em **Código de primeiro acesso**;
5. clique em **Criar minha conta** e aguarde a confirmação;
6. entre com o e-mail e a senha que acabou de escolher.

A senha aceita até 72 bytes: acentos e emojis podem ocupar mais espaço que
letras comuns. Se o sistema indicar que a senha é longa demais, escolha uma
menor sem retirar a exigência de pelo menos 12 caracteres.

O cadastro não faz a entrada automaticamente. Depois da confirmação, utilize
**Entrar**. Existe uma única conta administrativa por instalação; o código não
abre um cadastro público para outras pessoas. Se a conta já tiver sido criada,
a tela apresentará o login.

### 2.2 Conta da aplicação e conta Google

O e-mail e a senha da aplicação são independentes da conta Google. Não é
necessário utilizar a senha do Google na aplicação.

Para organizar seus próprios documentos no Google Drive e criar arquivos no
Google Docs, você precisará de uma conta Google. A aplicação guarda os links
que você copiar e colar nos campos de materiais. Ela não entra na sua conta
Google nem envia arquivos ao Drive automaticamente.

As permissões para abrir cada arquivo são definidas no Google Drive. Colocar um
link na aplicação não concede acesso ao documento. Confira o compartilhamento
com as pessoas que deverão utilizar o material.

Para utilizar um material:

1. abra o documento na sua conta Google;
2. em **Compartilhar**, confira quem poderá abrir o arquivo;
3. use **Copiar link**;
4. cole o link no campo de Plano de Aula ou de Guia e Atividades, no registro
   específico ou nos materiais mensais;
5. salve e confira se o link abre com as permissões desejadas.


### 2.3 Cuidados com o acesso

- Guarde sua senha e o código de primeiro acesso em local reservado.
- Não envie sua senha por grupos de WhatsApp ou por e-mail.
- Não compartilhe a senha com alunos.
- Em computador compartilhado, sempre clique em **Sair** ao terminar.
- Se esquecer sua senha, procure orientação técnica: a recuperação automática
  de acesso ainda não está disponível nesta versão.

## 3. Como entrar

1. Abra o navegador no computador em que sua cópia está funcionando.
2. Digite o endereço da aplicação na barra de endereços.
3. Aguarde a tela de entrada aparecer.
4. No campo **E-mail**, digite seu e-mail de acesso.
5. No campo **Senha**, digite sua senha.
6. Clique em **Entrar**.
7. Aguarde até aparecer a tela **Calendário de Aulas**.

Enquanto a entrada estiver sendo verificada, o botão mostrará **Entrando...**.
Não é necessário clicar novamente.

Se o acesso for recusado:

1. confira se o e-mail foi digitado corretamente;
2. confira se a tecla de letras maiúsculas está ativada;
3. digite novamente a senha com atenção;
4. tente outra vez;
5. se o problema continuar, avise a pessoa responsável pelo sistema.

## 4. Conhecendo a tela principal

Depois da entrada, a parte superior mostra:

- o título **Calendário de Aulas**;
- o nome da sessão administrativa;
- o botão **Sair**;
- as cinco áreas da aplicação.

As cinco áreas são:

1. **Painel geral**;
2. **Cursos**;
3. **Gerenciar aulas**;
4. **Materiais**;
5. **Calendário visual**.

Para mudar de área, basta clicar ou tocar no nome correspondente.

## 5. Painel geral

O **Painel geral** é a primeira área apresentada depois da entrada.

Ele mostra três grupos de informações.

### 5.1 Total de aulas registradas

Apresenta a quantidade total de registros existentes no sistema. Quando houver
registros, também serão mostradas as quantidades separadas por curso.

### 5.2 Próximas aulas

Apresenta até cinco registros com data igual ou posterior ao dia atual.

Cada linha pode mostrar:

- data;
- curso;
- unidade curricular;
- tipo e número do registro;
- links de PA e GD+AD, quando disponíveis.

### 5.3 Aulas marcadas para revisão

Apresenta todos os registros que foram cadastrados com a opção
**Marcar para revisão**.

Essa lista pode incluir registros anteriores ao dia atual. Ela serve como um
lembrete do que ainda precisa ser conferido.

## 6. Cadastrar e gerenciar cursos

Abra **Cursos** para consultar o catálogo desta instalação. O filtro
**Situação dos cursos** permite escolher **Todos**, **Ativos** ou **Desativados**.
O botão **Atualizar lista** consulta novamente os dados salvos.

### 6.1 Cadastrar um curso

1. Clique em **Novo curso**.
2. Informe o **Nome do curso**, com 2 a 120 caracteres.
3. Informe a **Sigla**, com 1 a 20 caracteres.
4. Clique em **Cadastrar curso**.
5. Aguarde a mensagem **Curso cadastrado com sucesso.**

Exemplo: nome **Ciência de Dados**, sigla **CD**. As letras da sigla serão
convertidas para maiúsculas ao salvar. Cada sigla pode pertencer a apenas um
curso nesta instalação, incluindo os cursos desativados.

Se não quiser gravar, clique em **Cancelar**. Se houver uma recusa, os campos
permanecem preenchidos para você conferir e corrigir.

### 6.2 Editar nome e sigla

1. Localize o curso no catálogo.
2. Clique em **Editar**.
3. Confira e altere nome ou sigla.
4. Clique em **Salvar alterações** e aguarde a confirmação.

A alteração mantém o mesmo registro. Um curso desativado continua desativado
mesmo depois de editar seu nome ou sua sigla.

### 6.3 Desativar um curso

1. No curso ativo, clique em **Desativar**.
2. Leia a confirmação.
3. Para continuar, clique em **Confirmar desativação**.
4. Para desistir, clique em **Cancelar desativação**.

Desativar mantém o curso no catálogo e não exclui aulas. Para encontrá-lo depois,
selecione **Desativados** ou **Todos** no filtro. Sua sigla continua ocupada e
não pode ser usada em outro cadastro. A tela não oferece exclusão definitiva
nem reativação de cursos nesta versão.

### 6.4 Relação com as aulas nesta etapa

O catálogo personalizado ainda não fornece as opções dos campos de curso em
**Gerenciar aulas**, **Materiais**, **Painel geral** e **Calendário visual**.
Cadastrar um curso em **Cursos** ainda não faz com que ele apareça nessas áreas.
Essa ligação será implementada no próximo marco.

Turnos diurno ou noturno, turmas, salas e capacidade de alunos ainda não possuem
campos de cadastro. Essas informações serão tratadas em uma etapa posterior.

## 7. Cadastrar uma aula, atividade ou avaliação

1. Clique ou toque em **Gerenciar aulas**.
2. Localize a área **Cadastrar registro**.
3. Preencha os campos necessários.
4. Confira cuidadosamente as informações.
5. Clique em **Cadastrar registro**.
6. Aguarde a mensagem **Registro cadastrado com sucesso.**

Durante o envio, o botão mostrará **Cadastrando...**. Não clique novamente.

### 7.1 Campos do cadastro

#### Data

Escolha o dia da aula, atividade ou avaliação. Esse campo é obrigatório.

#### Curso

Escolha uma das opções disponíveis no formulário. Esse campo é obrigatório.

As opções ainda pertencem à versão anterior do cadastro de aulas e não são
alimentadas pelo catálogo personalizado. Consulte o limite descrito em
**Relação com as aulas nesta etapa**.

#### Unidade curricular

Digite o nome da unidade curricular. Esse campo é obrigatório.

Exemplo:

```text
Qualidade de Software
```

#### Tipo

Escolha uma das opções:

- Aula;
- Atividade;
- Avaliação.

#### Número da aula

Informe o número quando ele for necessário. Esse campo pode ficar vazio.

Exemplo:

```text
12
```

#### Link do Plano de Aula

Cole o endereço do Plano de Aula quando houver um link específico para esse
registro. O endereço deve começar com `https://` ou `http://`.

Esse campo pode ficar vazio.

#### Link do Guia e das Atividades

Cole o endereço do Guia e das Atividades do Discente quando houver um link
específico para esse registro. O endereço deve começar com `https://` ou
`http://`.

Esse campo pode ficar vazio.

#### Marcar para revisão

Ative essa opção quando o registro precisar ser conferido posteriormente. Ele
aparecerá na lista de revisão do painel geral e receberá destaque no calendário
visual.

### 7.2 Atenção antes de cadastrar

Confira principalmente a data, o curso, a unidade curricular, o tipo, o número e
os links antes de cadastrar. Se perceber um erro depois, utilize a edição descrita
na próxima seção em vez de criar outro registro igual.

## 8. Editar uma aula, atividade ou avaliação

1. Clique ou toque em **Gerenciar aulas**.
2. Localize o cartão do registro que precisa ser corrigido.
3. Clique ou toque em **Editar**.
4. Confira os dados carregados na área **Editar registro**.
5. Altere somente os campos necessários.
6. Clique ou toque em **Salvar alterações**.
7. Aguarde a lista ser atualizada.

Durante a gravação, o botão mostrará **Salvando...**. Não clique novamente.

Depois da confirmação, a alteração também será refletida no painel geral, nos
materiais por aula e no calendário visual quando for aplicável.

### 8.1 Cancelar uma edição

Se não quiser salvar as mudanças, clique ou toque em **Cancelar edição**. O
formulário voltará para **Cadastrar registro** e o registro continuará com os
dados anteriores.

## 9. Excluir uma aula, atividade ou avaliação

1. Clique ou toque em **Gerenciar aulas**.
2. Localize o cartão do registro que deseja remover.
3. Confira com atenção a data, o curso e a unidade curricular.
4. Clique ou toque em **Excluir**.
5. Leia o aviso apresentado no próprio cartão.
6. Se tiver certeza, clique ou toque em **Confirmar exclusão**.
7. Aguarde o registro desaparecer da lista.

Durante a operação, o botão mostrará **Excluindo...**. Não clique novamente.

Se desistir antes da confirmação, clique ou toque em **Cancelar**. O aviso será
fechado e o registro permanecerá sem alterações.

> Atenção: depois de clicar em **Confirmar exclusão**, a remoção é permanente e
> não pode ser desfeita pela aplicação. Em caso de dúvida, escolha **Cancelar**.

## 10. Consultar aulas cadastradas

Na área **Gerenciar aulas**, abaixo do cadastro, estão os filtros de consulta.

Você pode usar:

- **Curso**: mostra apenas o curso selecionado;
- **Mês**: mostra registros do mês escolhido;
- **A partir de**: mostra registros a partir da data escolhida.

Os filtros podem ser combinados.

Exemplo: para localizar registros de um curso em outubro de 2026:

1. escolha uma opção disponível em **Curso**;
2. escolha outubro de 2026 em **Mês**;
3. deixe **A partir de** vazio, se não precisar limitar o dia;
4. clique em **Aplicar filtros**.

Para voltar a mostrar todos os registros, clique em **Limpar filtros**.

O número apresentado próximo ao título informa quantos registros foram
encontrados.

## 11. Entendendo os materiais

Na aplicação existem dois tipos de organização dos materiais.

### 11.1 Material específico da aula

É o link informado diretamente no cadastro daquela aula, atividade ou
avaliação.

### 11.2 Material do mês

É um link geral que pode valer para os registros de um mês inteiro.

### 11.3 Qual material tem prioridade

O material específico tem prioridade.

- Se os dois links específicos estiverem vazios, o sistema poderá usar os
  links cadastrados para o mês.
- Se ao menos um link específico estiver preenchido, o sistema utilizará os
  campos específicos daquele registro.
- Nesse segundo caso, um link específico vazio não será completado
  automaticamente pelo link mensal.

Exemplo: se uma aula possui somente um PA específico e o GD+AD específico está
vazio, o sistema mostrará o PA específico e manterá o GD+AD vazio. Ele não
misturará esse PA com o GD+AD mensal.

Essa regra evita combinar materiais de origens diferentes sem confirmação.

## 12. Consultar materiais por aula

1. Clique ou toque em **Materiais**.
2. Localize a área **Por aula (data específica)**.
3. Use os filtros de curso e mês quando desejar.
4. Ative **Mostrar a partir de hoje** para limitar a consulta aos registros
   atuais e futuros, quando necessário.
5. Observe a tabela com os materiais aplicáveis.
6. Clique em **Abrir PA** ou **Abrir GD+AD** para acessar um material.

Quando aparecer um traço (`—`), não existe link disponível para aquele campo.

Os links são abertos em outra aba do navegador.

## 13. Cadastrar materiais para um mês inteiro

1. Na área **Materiais**, localize **Materiais por mês**.
2. Clique em **Adicionar link mensal**.
3. Escolha o mês.
4. Cole o **Link do Plano de Aula**, quando houver.
5. Cole o **Link do Guia e das Atividades**, quando houver.
6. Confira os dados.
7. Clique em **Salvar materiais**.

Para fechar sem salvar, clique em **Cancelar**.

### Atenção ao salvar novamente o mesmo mês

Existe somente um conjunto de materiais para cada mês. Salvar novamente um mês
substitui integralmente os links que estavam cadastrados naquele período.

Se um dos campos for deixado vazio ao salvar, o link correspondente daquele
mês será removido.

Antes de substituir um mês, confira os dois campos, mesmo quando desejar
alterar somente um dos links.

## 14. Excluir materiais mensais

1. Na tabela **Materiais por mês**, localize o período desejado.
2. Confira o mês e os links apresentados.
3. Clique ou toque em **Excluir**.
4. Leia a confirmação exibida pelo navegador.
5. Confirme somente se tiver certeza.

A exclusão remove apenas o conjunto de links daquele mês. Ela não exclui as
aulas cadastradas e não remove links específicos que já pertencem às aulas.

## 15. Usar o calendário visual

1. Clique ou toque em **Calendário visual**.
2. Aguarde a grade do mês atual aparecer.
3. Observe os registros dentro de cada dia.

Na parte superior estão os botões:

- **Anterior**: mostra o mês anterior;
- **Hoje**: retorna ao mês da data atual;
- **Próximo**: mostra o mês seguinte.

O campo **Curso** permite mostrar todos os cursos ou somente um curso.

### 15.1 Cores e destaques

Cada curso possui sua própria cor. A legenda abaixo da grade mostra a
correspondência.

O dia atual possui um destaque próprio. Um registro marcado para revisão
recebe uma borda adicional e é identificado pela estrela da legenda.

### 15.2 Ver os detalhes de um registro

1. Clique ou toque no registro dentro do dia.
2. Confira data, curso, unidade curricular, tipo, número e revisão.
3. Quando houver materiais, clique em **PA** ou **GD+AD**.
4. Para fechar os detalhes, clique no botão **Fechar detalhes da aula**,
   representado pelo símbolo `×`.

### 15.3 Uso no celular

No celular, a grade mantém as sete colunas da semana. Deslize a grade para os
lados quando todas as colunas não couberem na tela.

A rolagem acontece dentro do calendário. Os demais elementos da página
permanecem no lugar.

## 16. O que fazer quando aparecer um erro

Quando houver uma falha temporária, a tela poderá mostrar o botão
**Tentar novamente**.

Nesse caso:

1. confira se a aplicação e os serviços da instalação estão em funcionamento;
2. clique uma vez em **Tentar novamente**, ou use **Atualizar lista** em **Cursos**;
3. aguarde a resposta;
4. se o erro continuar, atualize a página uma vez;
5. entre novamente, caso a sessão tenha terminado;
6. se ainda não funcionar, anote a mensagem exibida e avise a pessoa
   responsável pelo sistema.

Ao pedir ajuda, informe:

- qual área estava utilizando;
- qual botão foi acionado;
- qual mensagem apareceu;
- aproximadamente que horas ocorreu o problema.

Para abrir documentos remotos, confira também a conexão com a internet e a
permissão de compartilhamento do arquivo. O acesso ao banco local e o acesso
aos documentos no Google Drive são operações diferentes.

Não envie sua senha ou o código de primeiro acesso junto com o pedido de ajuda.

## 17. Como sair com segurança

1. Localize o botão **Sair** na parte superior da tela.
2. Clique ou toque uma vez.
3. Aguarde o retorno à tela de entrada.

Durante o encerramento, o botão poderá mostrar **Saindo...**.

Em computador compartilhado, confirme que a tela de entrada apareceu antes de
fechar o navegador.

## 18. Boas práticas de uso

- Confira os dados antes de cadastrar.
- Evite clicar repetidamente enquanto aparecer uma mensagem de processamento.
- Utilize links completos iniciados por `https://` ou `http://`.
- Não compartilhe sua senha.
- Sempre saia da aplicação em aparelhos compartilhados.
- Utilize dados fictícios durante as verificações da versão em desenvolvimento.
- Em caso de dúvida sobre a exclusão de uma aula ou de um material, escolha
  **Cancelar** e peça orientação antes de confirmar.

## 19. Resumo rápido

### Para criar a conta da instalação

**Crie sua conta** → informar nome, e-mail e senha → confirmar a senha →
colar o código de primeiro acesso → **Criar minha conta** → entrar pelo login.

### Para cadastrar um curso

**Cursos** → **Novo curso** → nome e sigla → **Cadastrar curso**.

### Para editar ou desativar um curso

**Cursos** → localizar o curso → **Editar** → **Salvar alterações**; ou
**Desativar** → conferir → **Confirmar desativação**.

O curso desativado permanece disponível no filtro **Desativados**.

### Para cadastrar um registro

**Gerenciar aulas** → preencher **Cadastrar registro** → conferir →
**Cadastrar registro**.

### Para editar um registro

**Gerenciar aulas** → localizar o cartão → **Editar** → corrigir →
**Salvar alterações**.

### Para excluir um registro

**Gerenciar aulas** → localizar o cartão → **Excluir** → conferir →
**Confirmar exclusão**.

Se não tiver certeza, clique ou toque em **Cancelar**.

### Para localizar uma aula

**Gerenciar aulas** → escolher os filtros → **Aplicar filtros**.

### Para cadastrar links mensais

**Materiais** → **Adicionar link mensal** → preencher →
**Salvar materiais**.

### Para consultar o mês

**Calendário visual** → usar **Anterior**, **Hoje** ou **Próximo**.

### Para encerrar

Clique em **Sair** e aguarde a tela de entrada.

## 20. Suporte

Ao precisar de ajuda, informe a etapa, o botão utilizado e a mensagem exibida.
Se alguém ajudou a preparar sua instalação, procure essa pessoa para verificar
o funcionamento local. O projeto não fornece uma instância compartilhada nem
um serviço de suporte já configurado.

Ao solicitar ajuda, nunca envie sua senha, o código de primeiro acesso ou o
conteúdo do arquivo de configuração da instalação.
