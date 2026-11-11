# A data de hoje em Draevor e a idade dos personagens

Duas mudanças ligadas:

- **A Linha do Tempo passa a ter a data de hoje inteira** (dia, mês e ano no Ciclo de Sylara), e não só o ano. Ela anda sozinha: **um dia em Draevor a cada 3 dias reais**. O administrador continua podendo trocar a data à mão.
- **Nos Personagens, o campo "Idade" sai.** A idade passa a ser contada da data de nascimento até hoje em Draevor (ou até a morte, para quem caiu).

Decisões de 11/11/2026. Duas sessões: 18.1 (a data de hoje) e 18.2 (a idade). A 18.2 depende da 18.1. Veja "Sessões" no fim.

Em toda sessão: ao criar um arquivo novo, acrescente-o ao "Mapa do código" do `CLAUDE.md`.

## 1. A data de hoje (sessão 18.1)

### 1.1 O que fica guardado

Hoje, `dados.linha.anoAtual` guarda só um número. Ele dá lugar a:

```js
dados.linha.hoje = { ano: 366, mes: 2, dia: 14, desde: "2026-11-11" }
```

- `ano`, `mes` (1 a 10) e `dia` (1 a 30) são a data em Draevor no dia real `desde`.
- `desde` é um dia real, no horário de Brasília, no formato `AAAA-MM-DD`. É de onde a contagem dos 3 dias parte.
- **Migração, no `garantirLinha()`:** sem um `hoje` válido, ele nasce de `{ ano: anoAtual, mes: 1, dia: 1, desde: <hoje real> }` (1 de Auralis do ano atual), e o `anoAtual` sai. Sem `anoAtual` válido, usa o `ANO_INICIAL_DA_LINHA`, como hoje.
- **Conferência ao ligar:** `ano` inteiro de 0 a `ANO_MAXIMO_DA_LINHA`, `mes` de 1 a 10, `dia` de 1 a 30 e `desde` no formato certo. Um `desde` no futuro vira o dia real de hoje.

### 1.2 O relógio

- **A conta:** quantos dias reais inteiros se passaram desde `desde`, dividido por 3, arredondado para baixo. Esse é o número de dias somados à data guardada.
- **O dia vira à meia-noite, no horário de Brasília.** Com `desde` numa quarta, o próximo dia de Draevor começa à 0h do sábado; o outro, à 0h da terça; e assim por diante.
- **Nada é gravado enquanto o relógio anda.** A data de hoje é calculada a cada pedido, a partir do que está guardado.
- **O fuso:** `America/Sao_Paulo`, pelo `Intl.DateTimeFormat` do Node (o Node 24 tem os fusos). Com `en-CA`, ele já escreve `AAAA-MM-DD`.
- **Somar dias no Ciclo de Sylara** é fácil, porque todo mês tem 30 dias e todo ano tem 300:

  ```js
  function somarDias(data, dias) {
    const total = data.ano * 300 + (data.mes - 1) * 30 + (data.dia - 1) + dias;
    return { ano: Math.floor(total / 300), mes: Math.floor((total % 300) / 30) + 1, dia: (total % 30) + 1 };
  }
  ```

  Exemplos: 30 de Tervalith de 366 mais 1 é 1 de Auralis de 367; 15 de Florentis mais 45 é 30 de Ignarion.
- **Mudar a data à mão recomeça a contagem:** a data escolhida vale a partir de hoje (o `desde` vira o dia real de hoje), e o próximo dia vem daqui a 3 dias.

### 1.3 No servidor (`servidor/linha.js`)

**As funções novas**, exportadas para os outros módulos. Cada uma recebe um `agora` opcional, para os testes:

| Função | Devolve |
| --- | --- |
| `diaRealDeHoje(agora)` | o dia real em Brasília, `"2026-11-11"` |
| `dataDeHoje(agora)` | `{ ano, mes, dia }` em Draevor |
| `anoDeHoje(agora)` | só o ano |
| `proximaVirada(agora)` | o dia real em que começa o próximo dia de Draevor, `"2026-11-14"` |

Mais as constantes `DIAS_REAIS_POR_DIA = 3` e `FUSO_DO_RELOGIO = "America/Sao_Paulo"`.

**Onde o `anoAtual` era usado**, passa a valer o `anoDeHoje()`:

- `servidor/linha.js`: o registro e a alteração de acontecimentos, a aprovação dos pedidos (o 409 "O pedido usa … ED") e a troca da data (abaixo);
- `servidor/personagens.js`: o `dataDoDetalhe`;
- `servidor/memorias.js`: a data de uma memória.

As regras continuam por ano, como hoje: um acontecimento, uma data de personagem ou de memória pode ser de qualquer dia do ano de hoje. Assim, nada do que já está registrado deixa de valer.

**O `GET /api/linha`** manda:

- `hoje: { ano, mes, dia }`;
- `proximaVirada: "AAAA-MM-DD"`;
- e continua mandando `anoAtual` (o `hoje.ano`), porque a página usa o ano em vários lugares.

**A troca da data:** `PUT /api/linha/hoje`, só para o administrador, com `{ ano, mes, dia }`. Ela substitui o `PUT /api/linha/ano-atual`, que sai.

- O ano é um inteiro de 0 a `ANO_MAXIMO_DA_LINHA`, o mês vai de 1 a 10 e o dia de 1 a 30. Fora disso, 400 com a mensagem do campo.
- O ano não pode ficar antes do acontecimento mais recente, como hoje: "Há acontecimentos registrados até 367 ED. A data de hoje não pode ficar antes deles."
- Grava `{ ano, mes, dia, desde: diaRealDeHoje() }`.

### 1.4 Na página da Linha do Tempo

- **O estado:** `estado.hoje` vem do servidor, e `estado.anoAtual` passa a ser o `hoje.ano`. O resto da página continua usando o ano.
- **O marcador "Hoje em Draevor"** (`marcadorHoje()`) passa a mostrar:
  - a data por extenso, com o `textoDaData(estado.hoje, { extenso: true })`: "Quartis, 14 de Florentis de 366 ED";
  - embaixo, menor, a estação e a lua, do `calendario.js`: "Primavera · Quarto Crescente" (`ESTACOES[mes - 1]` e `FASES[faseDaLua(dia)]`);
  - para o administrador, o botão "Alterar a data de hoje" no lugar de "Alterar o ano atual".
- **O painel do administrador** (`abrirAnoAtual()` vira `abrirDataDeHoje()`), com o título "Data de hoje em Draevor":
  - três campos lado a lado: Dia (de 1 a 30), Mês (os `MESES`) e Ano (número);
  - a ajuda de hoje sobre o registro mais recente continua;
  - o texto do relógio: "O mundo anda sozinho: um dia em Draevor a cada 3 dias reais, virando à meia-noite (horário de Brasília). O próximo dia começa em 14/11/2026. Mudar a data aqui recomeça a contagem a partir de hoje.";
  - ao salvar, recarrega e avisa: "Hoje em Draevor: 14 de Florentis de 366 ED."
- **O `calendario.js`** ganha o `somarDias(data, dias)` (o mesmo do servidor). A prévia usa.
- **Prévia:** o banco da prévia passa a ter `hoje` e `proximaVirada`. A troca da data confere as mesmas regras do servidor.

## 2. A idade dos personagens (sessão 18.2)

### 2.1 A conta

A idade sai da data de nascimento (o marco "Nascimento", aba Detalhes) e de uma data final:

| Situação | Data final |
| --- | --- |
| Caído, com a data da Morte | a Morte |
| Caído, sem a Morte e com a data de Destruído | Destruído |
| Caído, sem nenhuma das duas | sem idade |
| Vivo, desaparecido ou aposentado | hoje em Draevor |

- **Sem data de nascimento, ou com o nascimento depois da data final**, não há idade.
- **Anos completos:** a diferença dos anos, menos 1 se o aniversário ainda não chegou na data final.
  - Com o dia e o mês do nascimento, o aniversário é esse dia.
  - Só com o mês, conta como feito a partir do dia 1 desse mês.
  - Só com o ano, a idade é a diferença dos anos, e fica aproximada.
- **Aproximada ("c.")** quando o nascimento é aproximado ("c.") ou não tem mês, ou quando a data final é a Morte ou Destruído aproximados ou sem mês.
- O Transformado não muda a conta: um vampiro transformado aos 30 e de pé há 200 anos tem 230.

### 2.2 O texto

| Caso | Texto |
| --- | --- |
| 27 anos completos | "27 anos" |
| 1 ano | "1 ano" |
| 0 anos | "menos de 1 ano" |
| aproximada | "c. 27 anos" (com 0, "menos de 1 ano" do mesmo jeito) |
| caído, até a Morte | "35 anos ao morrer" |
| caído, até Destruído | "35 anos ao ser destruído" |

### 2.3 Na página dos Personagens

- **O `calendario.js`** ganha:
  - `idadeEntre(nascimento, fim)`, que devolve `{ anos, aprox }` ou `null`;
  - `textoDaIdade(idade, motivo)`, com `motivo` igual a `"hoje"`, `"morte"` ou `"destruido"`.
- **O estado:** `estado.hoje` vem do `GET /api/galeria` (veja 2.4).
- **Na ficha, aba Detalhes:** a linha "Idade" aparece no mesmo lugar de hoje, entre Ocupação e Religião, com o texto de 2.2. Sem idade, a linha não aparece.
- **No formulário:**
  - o campo "Idade" sai do grupo "Origem";
  - no grupo "Vida", depois do Nascimento, uma linha só para ler: "Idade hoje: 27 anos". Ela muda na hora, conforme o nascimento, a situação, a Morte e o Destruído mudam. Sem nascimento: "Com a data de nascimento, a idade aparece sozinha."
- **As idades escritas antes:**
  - **na ficha,** um personagem sem data de nascimento que tinha o campo preenchido continua mostrando o texto antigo na linha "Idade", como hoje;
  - **no formulário,** esse texto aparece embaixo do Nascimento: "Antes estava escrito: "35 anos quando sumiu". Com a data de nascimento, a idade passa a ser contada e esse texto sai.";
  - **ao salvar** com o ano de nascimento preenchido, o texto antigo some.
- **O que já existe e usa `CAMPOS_DOS_DETALHES` e `GRUPOS_DOS_DETALHES`** (a ficha, o formulário, as mensagens de erro) acompanha a mudança. Confira com grep que o "idade" não ficou em lugar nenhum.
- **Prévia:**
  - o banco ganha `hoje`;
  - os exemplos de hoje com idade escrita mudam: um vivo com o nascimento completo, um caído com a Morte e um só com o ano de nascimento ("c.");
  - um personagem sem nascimento fica com a idade antiga, "c. 50 anos", para ver o texto antigo.

### 2.4 No servidor (`servidor/personagens.js`)

- **Os campos:** o `idade` sai de `CAMPOS_DOS_DETALHES`. O servidor nunca mais lê a idade do que a página manda.
- **O texto antigo fica guardado** em `detalhes.idade`, enquanto o personagem não tiver ano de nascimento.
  - Ao salvar, com o ano de nascimento, ele sai. Sem o ano, fica o que estava.
  - A conferência dos dados ao ligar não pode apagar essa chave.
  - O formato enviado à página manda esse texto como `detalhes.idadeAnotada`, ou `""`.
- **O `GET /api/galeria`** ganha `hoje: { ano, mes, dia }`, do `dataDeHoje()` da Linha.
- A idade não é calculada no servidor: só na página.

## Fora desta versão

- pausar o relógio;
- a data de hoje no topo de todas as páginas;
- aviso de aniversário de personagem;
- a idade em outras páginas (o chat, os cards da galeria).

## Testar no servidor (depois da atualização)

- **Logo depois de atualizar,** a data de hoje começa em 1 de Auralis do ano atual. Acerte no painel: Linha do Tempo, "Alterar a data de hoje".
- **Na Linha do Tempo:**
  - o marcador com a data por extenso, a estação e a lua;
  - o painel com a data do próximo dia;
  - com uma data antes do ano do acontecimento mais recente, a mensagem de erro.
- **Daqui a 3 dias,** a data andou um dia.
- **Nos Personagens:**
  - a idade de um personagem com nascimento;
  - a de um caído com a Morte ("ao morrer");
  - a de um só com o ano ("c.");
  - um personagem sem nascimento com a idade escrita antes;
  - no formulário, a "Idade hoje" mudando ao trocar o nascimento.

## Sessões

- **18.1 A data de hoje.** Inclui a parte 1 inteira.
  - **O `CLAUDE.md`**, no "Mapa do código":
    - na linha do `linha.js`, os exports novos (`dataDeHoje`, `anoDeHoje`);
    - na linha do `calendario.js`, o `somarDias`.

  **Testar:**
  - **Com `node`, as funções do relógio,** passando o `agora`:
    - `desde` há 2 dias: a mesma data;
    - há 3 dias: um dia a mais;
    - há 7 dias: dois a mais;
    - a virada do ano (30 de Tervalith + 1);
    - a meia-noite de Brasília: 02:59 UTC ainda é o dia anterior, 03:00 UTC já é o dia novo.
  - **Com o servidor e `curl`:**
    - um `dados.json` com `anoAtual: 366` sai com o `hoje` e sem o `anoAtual`;
    - o `GET /api/linha` com `hoje`, `proximaVirada` e `anoAtual`;
    - `PUT /api/linha/hoje`: 200 do administrador, 403 de um editor, 400 com mês 11 e com o ano antes do acontecimento mais recente;
    - o `PUT /api/linha/ano-atual` dá 404;
    - um acontecimento no ano de hoje continua passando.
- **18.2 A idade.** Inclui a parte 2 inteira. O `CLAUDE.md`: na linha do `calendario.js`, o `idadeEntre` e o `textoDaIdade`.

  **Testar:**
  - **Com `node`, o `idadeEntre` e o `textoDaIdade`** (carregue o `calendario.js` com `vm`), cobrindo:
    - o aniversário no dia, um dia antes e um dia depois;
    - só o mês;
    - só o ano;
    - o aproximado;
    - caído com Morte, com só Destruído e sem nenhum;
    - o nascimento depois de hoje.
  - **Com o servidor e `curl`:**
    - o `GET /api/galeria` com `hoje`;
    - um personagem salvo com `idade` no corpo continua sem ela;
    - um personagem antigo sem nascimento mantém o texto, e perde ao salvar com o ano de nascimento.
