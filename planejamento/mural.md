# Mural

Uma página nova, o **Mural**, com duas coisas:

- **as notas que o grupo prega para todos lerem.** Cada conta escolhe notas do próprio Caderno e põe no mural. Toda conta lê;
- **o tempo no portal de cada conta**, num painel ao lado.

Decisões de 11/11/2026. Duas sessões: 20.1 (o mural) e 20.2 (o tempo no portal). A 20.2 depende da 20.1. Veja "Sessões" no fim.

Em toda sessão: ao criar um arquivo novo, acrescente-o ao "Mapa do código" do `CLAUDE.md`.

## 1. A página (sessão 20.1)

### 1.1 Na barra

- **Na lista `PAGINAS` do `comum.js`, depois do Caderno:**

  ```js
  {
    id: "mural",
    nome: "Mural",
    curto: "Mural",
    caminho: "mural/",
    pronta: true,
    icone: "M3 4h18v12H3ZM7 20.5 8.3 16M17 20.5 15.7 16M6.5 7h5v6h-5ZM9 5.5v1.5M14 7.5h4M14 10h4M14 12.5h2.5", // quadro com um papel pregado
  }
  ```

  Ajuste o desenho se precisar, no traço dos outros: um quadro num cavalete com um papel pregado e linhas de outros avisos.
- **No celular,** a barra de baixo passa a ter oito botões. O comentário do `style.css` ("os sete cabem num celular de 360 px") vira "os oito". Confira que cabem em 360 px (veja os testes).

### 1.2 O jeito

O mural é um **quadro de avisos de taverna**: tábuas escuras, e os papéis de pergaminho pregados com um prego de ferro.

- **A página:** o esqueleto de sempre (`linha-do-tempo/index.html`), com `data-pagina="mural"`. Carrega `../marcas.js` e `../marcas.css` depois do `comum.js`, como a leitura pública.
- **O cabeçalho:**
  - à esquerda, o título "Mural" (Grenze Gotisch) e a frase "As notas que o grupo pregou para todos lerem.";
  - à direita, para quem tem caderno (toda conta menos o administrador), o botão principal "Pregar uma nota" e, embaixo dele, "2 de 5 suas no mural".
- **O quadro** (`.quadro-de-avisos`):
  - **o fundo de tábuas,** feito só com CSS:
    - um `linear-gradient` de marrons escuros;
    - um `repeating-linear-gradient` vertical para as juntas das tábuas, a cada 9 a 10rem;
    - outro bem fraco para os veios;
  - uma moldura de ferro escuro de 0,6rem;
  - sombra para dentro;
  - os cantos em `--raio`.
- **Cada papel** (`.aviso`):
  - **o desenho:**
    - pergaminho claro em degradê;
    - tinta escura;
    - uma sombra embaixo;
    - **o prego** no alto, no meio: um `::before` redondo, de ferro, com `radial-gradient` e sombra;
    - **um giro pequeno,** de −1,5° a 1,5°, tirado do id da nota (sempre o mesmo para a mesma nota), com `style.setProperty("--giro", ...)`. Com `prefers-reduced-motion`, o giro fica, sem animação ao passar o mouse.
  - **o conteúdo:**
    - o título (Grenze Gotisch, 1,3rem);
    - o começo do texto, desenhado com o `desenharMarcas`, numa altura máxima de 14rem que some embaixo (`mask-image`, como os papéis das Memórias). Esse trecho fica `inert`: os links dele não recebem foco nem clique, e o clique vai para o papel;
    - no rodapé, o selo de quem pregou: a foto do perfil do chat, ou a inicial na cor do perfil. Ao lado, o nome e "pregada em 11 de novembro" (a data real).
  - **ao passar o mouse,** o papel sobe um pouco e endireita.
  - **o clique** em qualquer lugar do papel abre a leitura.
  - **no teclado,** o título é um botão dentro do `h2`, e Enter ou espaço abrem.
- **A arrumação:**
  - colunas de CSS (`columns: 17rem auto`, com `break-inside: avoid`);
  - as pregadas por último primeiro;
  - no celular, uma coluna, sem rolagem de lado.
- **Sem nenhuma nota:**
  - "Ninguém pregou nada ainda.";
  - para quem tem caderno, também o botão "Pregar uma nota".

### 1.3 A leitura

- **Clicar num papel** abre o diálogo de leitura (largo):
  - o título;
  - a linha de quem pregou: "Fe · pregada em 11 de novembro · alterada em 12 de novembro";
  - o texto inteiro, com `desenharMarcas(texto, { links, embutidas, imagens }, { idDaNota })`, dentro de um `.marcas`.
- **Os botões:**
  - **"Abrir no Caderno",** só quando a conta lê a nota no Caderno (é dela ou foi compartilhada com ela);
  - **"Tirar do mural",** para quem pregou e para o administrador. Para o administrador, com a pergunta "Tirar do mural a nota de Fe?";
  - **"Fechar".**
- **O endereço `#nota-<id>`** abre a leitura direto, ao carregar a página e quando o endereço muda. É o destino dos links para notas do mural (veja 2).
  - Fechar o diálogo tira o `#` do endereço (`history.replaceState`).
  - Uma nota que não está mais no mural: "Essa nota não está mais no mural."
- **A página recarrega o mural** quando volta a ficar à vista, se passou mais de um minuto.

### 1.4 Pregar uma nota

**Pelo mural:** "Pregar uma nota" abre um diálogo com as notas da conta (`GET /api/mural/minhas`):

- no alto, o aviso: "Toda conta do portal vai poder ler a nota no mural, com as imagens dela. Só você altera, no Caderno, e pode tirar quando quiser.";
- **um campo de busca** que filtra pelo título, sem diferença de acentos e maiúsculas (o `normalizar()` do `comum.js`);
- **cada linha:** o título e, menor, as pastas ("Sessões / Ode to Sleep");
- as que já estão no mural aparecem com "no mural" e sem clique;
- com 5 no mural, a lista fica sem clique e aparece "Você já tem 5 notas no mural. Tire uma antes de pregar outra.";
- **escolher uma nota prega na hora:**
  - o diálogo fecha;
  - o mural recarrega;
  - aparece "Nota pregada no mural.";
  - o papel novo ganha o foco.

**Pelo Caderno**, no "⋯" de uma nota da conta (`opcoesDe`, só com `nivel === "dona"`):

- **"Pregar no mural",** com o mesmo aviso numa pergunta (`perguntar`, "Pregar" e "Cancelar");
- **ou "Tirar do mural",** sem pergunta (é fácil pregar de novo).

Na barra da nota aberta, para quem lê uma nota pregada, uma marca pequena "No mural", que leva a `../mural/#nota-<id>`.

## 2. Quem lê o quê (sessão 20.1)

- **Uma nota pregada pode ser lida por toda conta.** O lugar dela é o mural.
- **No Caderno, ela não entra nas listas** de quem não a recebeu pelo Compartilhar:
  - na árvore;
  - na busca;
  - no grafo;
  - no Citar.

  O administrador já lê tudo.
- **Os links:** os de uma nota (no mural ou no Caderno) são os que a conta que lê vê, como em todo lugar. O resto fica só como texto.
- **Um link para outra nota** passa a valer assim, em todo lugar:
  - leva ao Caderno, para quem pode lê-la lá;
  - se não pode, mas ela está no mural, leva ao papel dela no mural;
  - senão, fica só como texto.
- **As notas embutidas** aparecem quando a conta pode lê-las no Caderno ou quando elas estão no mural.
- **As imagens** são as do caderno da própria nota, como hoje. A rota protegida passa a servir a imagem a qualquer conta enquanto uma nota pregada a citar.
- **Uma nota apagada** sai do mural junto, porque a marca fica na própria nota. A conta apagada leva o caderno junto, e a renomeada também (os ganchos do caderno já cuidam).

## 3. No servidor (sessão 20.1)

### 3.1 No `servidor/caderno.js`

- **A marca:** `nota.mural = { desde: "<ISO>" }`, ou `null`. O `conferirCaderno` conserta o formato (o que não for um objeto com `desde` de texto vira `null`).
- **As rotas:**

  | Rota | Quem | O que faz |
  | --- | --- | --- |
  | `POST /api/caderno/notas/<id>/mural` | só a dona | prega |
  | `DELETE /api/caderno/notas/<id>/mural` | a dona ou o administrador | tira |

  - **Pregar:**
    - `exigirQuemEscreve`;
    - `soADona(c, "pregar esta nota no mural")`;
    - `exigirGravavel`;
    - **no máximo `LIMITE_NO_MURAL = 5` por caderno.** Passando, 409: "Você já tem 5 notas no mural. Tire uma antes de pregar outra.";
    - já pregada, responde sem mudar nada.
  - **Tirar:**
    - o administrador pode, como exceção ao "só lê os cadernos": ele modera o mural;
    - `exigirGravavel`.
  - **As duas** gravam o caderno e respondem `{ mural: true }` ou `{ mural: false }`.
- **A marca vai para a página:**
  - o `notaDaArvore` manda `mural` (para o "⋯" da dona);
  - o `notaPublica` manda `mural: Boolean(nota.mural)` (para a marca "No mural").
- **Os links:** no `alvoDeNota`, depois da conferência de quem pode ler e só com uma conta (`leitor`), uma nota pregada responde:

  ```js
  { titulo, publico: enderecoNoMural(nota) } // enderecoNoMural = (nota) => `/mural/#nota-${encodeURIComponent(nota.id)}`
  ```

  O `marcas.js` já usa o `publico` como endereço do link. Na leitura pública sem login, nada muda.
- **As embutidas:** no `conteudoLido`, uma nota embutida entra também quando `leitor && outra.mural`.
- **As imagens:** no `verImagem`, a imagem também vale quando uma nota pregada do mesmo caderno a cita:

  ```js
  c.dados.notas.some((n) => n.mural && analisar(n).imagens.has(imagem.id))
  ```
- **Para o `mural.js`, os exports novos:**
  - `notasDoMural(leitor)` e `notasParaPregar(conta)` (veja 3.2);
  - `LIMITE_NO_MURAL`.

### 3.2 O `servidor/mural.js` (novo)

- **O módulo:** `prefixo: "/api/mural"`. Fica na lista `PAGINAS` do `servidor.js`, depois do caderno. O `iniciar()` devolve `false`.
- **O `GET /api/mural`:**

  ```js
  {
    conta: { usuario, cargo, temCaderno },
    limite: 5,
    notas: [{
      id, titulo, texto, desde, alteradaEm,
      dono: { usuario, nome },
      minha,      // a conta é a dona
      podeTirar,  // a dona ou o administrador
      noCaderno,  // a conta lê esta nota no Caderno
      links, embutidas, imagens, // do conteudoLido, para a conta que lê
    }],
    perfis: { "<usuario>": { cor, foto } }, // dos donos, do perfil do chat
  }
  ```

  - As notas vêm das pregadas por último primeiro.
  - Os `perfis` vêm do `perfilPublico` do `servidor/chat.js`, que passa a ser exportado. Só a `cor` e a `foto`.
- **O `GET /api/mural/minhas`:** `{ notas: [{ id, titulo, caminho, noMural }], noMural, limite }`.
  - `caminho` são os nomes das pastas, juntos com " / ".
  - As notas vêm em ordem de título.
  - Para o administrador, 403: "O administrador não tem caderno."
- **Pregar e tirar** passam pelas rotas do caderno (3.1).

## 4. O tempo no portal (sessão 20.2)

### 4.1 O que conta

- **Conta o tempo** em que a conta está com alguma página do portal:
  - **aberta, à vista e em uso:** `document.visibilityState === "visible"`, e mexeu no mouse, no teclado, rolou ou tocou nos últimos 5 minutos;
  - **ou numa chamada do chat:** conectado numa sala de voz, mesmo com o chat escondido e sem mexer.
- **Duas janelas abertas** não contam em dobro.
- **Onde conta:** no navegador e no app (o portal e o chat). A janela do Foundry não conta: o Foundry não fala com o portal.
- **Começa a contar na atualização.** O painel diz desde quando.

### 4.2 Na página

- **No `comum.js`:**
  - **`const ganchosDoUso = { emChamada: () => false };`.** O `voz.js` troca o `emChamada` por uma função que diz se a conta está conectada numa sala.
  - **a última ação:** `pointerdown`, `keydown`, `wheel` e `touchstart` guardam a hora. O `pointermove` também, no máximo a cada 10 segundos.
  - **o pulso:** a cada 30 segundos, se a página está à vista e em uso, ou numa chamada, ela manda:

    ```js
    pedir("POST", "/api/uso/pulso", { pagina: PAGINA_ATUAL, voz: ganchosDoUso.emChamada() }, { silencioso: true })
    ```

    Manda também um pulso 3 segundos depois de abrir e outro ao voltar a ficar à vista, nas mesmas condições.
  - **Quais páginas pulsam:** as que têm a barra lateral e o chat. A leitura pública (`ler`) não pulsa, e a prévia também não.
  - **As falhas** são ignoradas. Um 401 (sem sessão, como na tela de entrada) para os pulsos por 5 minutos.
- **No `voz.js`:** o `ganchosDoUso.emChamada`.

### 4.3 O `servidor/uso.js` (novo)

**Os dados** ficam em `uso.json`, na pasta dos dados (`CONFIG.pastaDados`, ao lado do `dados.json`), fora do `dados.json`, como os cadernos e o chat:

```json
{
  "formato": 1,
  "desde": "2026-11-12",
  "contas": {
    "fe": {
      "total": { "s": 5400, "voz": 1800, "paginas": { "chat": 3600, "caderno": 1800 } },
      "dias": { "2026-11-12": { "s": 5400, "voz": 1800, "paginas": { "chat": 3600, "caderno": 1800 } } }
    }
  }
}
```

- Tudo em segundos.
- `dias` usa o dia de Brasília (`America/Sao_Paulo`, com o `Intl.DateTimeFormat`). Uma função curta no próprio `uso.js`.
- `desde` é o primeiro dia, gravado na primeira vez.

**O pulso:** `POST /api/uso/pulso`, com `{ pagina, voz }`.

- **A `pagina`** precisa ser uma de `mesas`, `linha`, `personagens`, `mapas`, `memorias`, `regras`, `caderno`, `mural` ou `chat`. Senão, 400.
- **O `voz`** é `true` ou `false`.
- **A conta do tempo,** com o último pulso de cada conta guardado só na memória:
  - pulso até 90 segundos depois do anterior (de qualquer janela): soma o tempo desde ele;
  - primeiro pulso, ou depois de mais de 90 segundos: soma 30 segundos.

  Assim duas janelas pulsando juntas somam o tempo do relógio, e não o dobro. Num chat escondido, o navegador pode atrasar os pulsos até um por minuto, e isso continua contando.
- **Onde a soma entra:**
  - no total e no dia;
  - na página do pulso;
  - em `voz`, quando `voz` é `true`.
- **Responde 204.**

**Gravar:**

- uma vez por minuto, se mudou (`setInterval` com `.unref()`);
- num arquivo temporário e depois `rename`, como o `salvarDados`;
- os dias com mais de 400 dias saem ao gravar. O `total` fica.

**O `GET /api/uso`:**

```js
{
  desde: "2026-11-12",
  contas: [{
    usuario, nome, cor, foto, // a cor e a foto do perfil do chat
    agora,                    // pulso nos últimos 2 minutos
    semana, mes, sempre,      // { s, voz, paginas } de cada período
  }],
}
```

- Vêm todas as contas de `dados.contas`, o administrador também.
- `semana` são os últimos 7 dias, com hoje. `mes` são os últimos 30.
- **Ganchos:** o `ganchos.renomearConta` muda a chave, e o `ganchos.excluirConta` tira a conta.
- **O módulo:** `prefixo: "/api/uso"`, na lista `PAGINAS`.

### 4.4 O painel no mural

- **Onde:**
  - a partir de 1100 px de largura, uma coluna de 20rem à direita do quadro, que fica no lugar ao rolar (`position: sticky`);
  - abaixo disso, depois do quadro, na largura toda.
- **O jeito:** uma folha de livro de registro, em pergaminho escuro, com o título "Tempo no portal".
- **Os períodos:** três botões, "7 dias", "30 dias" e "Sempre", com `aria-pressed`.
  - O escolhido fica em `mural:periodo` (`localStorage`, com `try/catch`).
  - O padrão é 7 dias.
- **Uma linha por conta**, em ordem do tempo no período, do maior para o menor, e pelo nome no empate:
  - o selo (a foto do perfil, ou a inicial na cor do perfil) e o nome;
  - um ponto de brasa pequeno, com o título "No portal agora", para quem está `agora`;
  - uma barra do tamanho do tempo, comparada ao maior;
  - o tempo: "12 h 05 min", "45 min", "menos de 1 min", ou "—" sem nada.
- **Clicar numa linha** (um botão com `aria-expanded`) abre o detalhe:
  - o tempo em cada página, do maior para o menor, com os nomes da barra ("Chat 7 h 10 min", "Caderno 3 h"), cada um com uma barra fina;
  - e "Em chamada: 5 h 20 min".
- **No pé:** "Conta o tempo com o portal aberto e em uso, ou numa chamada do chat. Desde 12 de novembro de 2026."
- **Com a página à vista,** o painel pede o `GET /api/uso` de novo a cada minuto, para o ponto de "agora".

### 4.5 O multiplicador secreto (depois da 20.2)

O administrador põe um multiplicador no tempo de cada conta: umas contam ×3, outras ×1. Só ele sabe.

- **O que muda:** o painel mostra o tempo da conta vezes o multiplicador, de 0 a 10 (com até duas casas). Sem multiplicador, é ×1.
- **De hoje em diante:** a troca vale a partir do dia de Brasília em que foi feita. Cada dia guardado conta com o multiplicador que valia nele; os dias de antes não mudam, e o painel não dá um salto que entregue o segredo.
  - Trocar de novo no mesmo dia só corrige o de hoje.
  - Voltar ao que valia ontem tira o de hoje da lista.
- **Segredo:**
  - o `GET /api/uso` de quem não é administrador traz só o tempo já multiplicado, sem nenhum campo do multiplicador;
  - o do administrador traz também, em cada conta, `multiplicador` (o de hoje) e `real: { semana, mes, sempre }` (o tempo de verdade).
- **No `uso.json`:**
  - a conta continua com o tempo de verdade;
  - `multiplicadores: { "<usuario>": [{ desde: "AAAA-MM-DD", vezes: 3 }] }`, em ordem de dia;
  - quando um dia com multiplicador sai (mais de 400 dias), o que ele somou a mais (ou a menos) passa para `ajuste` na conta, e o "Sempre" não muda.
- **A rota:** `PUT /api/uso/multiplicadores/<usuario>` com `{ vezes }`.
  - 403 para quem não é administrador (antes de olhar a conta), 404 para uma conta que não existe, 400 fora de 0 a 10;
  - grava na hora e responde `{ usuario, multiplicador }`.
- **Ganchos:** renomear leva o multiplicador junto; apagar a conta tira.
- **No painel, só para o administrador:**
  - ao lado de cada linha, o selo "×3" (o ×1 apagado, os outros acesos), que abre o diálogo "Multiplicador do tempo": as escolhas rápidas ×1, ×1,5, ×2 e ×3, o campo de 0 a 10, Cancelar e Salvar;
  - no detalhe aberto, quando o multiplicador mudou o tempo do período, "Sem o multiplicador: 45 min";
  - no pé, "Os multiplicadores (×) só você vê."
- **O limite do segredo:** o código da página (que qualquer conta pode abrir) mostra que a opção existe, mas nunca os números.

## Prévia

- **O mural:**
  - quatro notas de exemplo, de três contas: uma com imagem (um desenho em `data:`, como na prévia do Caderno), uma com uma nota embutida, e links;
  - as "minhas" com algumas notas, uma já no mural;
  - pregar e tirar funcionam na memória.
- **A caixa da prévia** troca entre "jogador" (com caderno) e "administrador".
- **Na prévia do Caderno:**
  - o banco de exemplo ganha uma nota pregada;
  - o "⋯" com "Pregar no mural" e "Tirar do mural" funciona;
  - a marca "No mural" aparece;
  - os links para notas do mural usam `enderecoDaPagina("mural")` mais `#nota-<id>`.
- **O painel do tempo,** com números de exemplo: uma conta "agora" e uma sem tempo nenhum.
- **O multiplicador:** o Takezo começa com ×3. Como administrador, o selo e o diálogo funcionam na memória; na prévia o multiplicador vale para todo o período de exemplo.

## Fora desta versão

- comentários e reações nos papéis;
- arrumar os papéis à mão no quadro;
- marca na barra lateral quando há nota nova no mural;
- aviso no chat quando alguém prega uma nota;
- o tempo na janela do Foundry;
- esconder a própria conta do painel.

## Testar no servidor (depois da atualização)

- **O mural:**
  - pregue uma nota com uma imagem e um link para um personagem;
  - com outra conta, leia no mural: a imagem aparece, e o link vira link só se essa conta vê o personagem;
  - essa conta não acha a nota na busca nem no grafo do Caderno;
  - tire a nota: ela some do mural, e o endereço da imagem para de abrir para a outra conta;
  - o administrador tira uma nota de outra conta;
  - uma sexta nota mostra a mensagem do limite;
  - no celular, a barra de baixo com oito botões.
- **O tempo:**
  - depois de uns minutos usando, a sua linha no painel;
  - duas abas abertas juntas não contam em dobro;
  - numa chamada, com o chat minimizado, o tempo continua contando;
  - depois de `systemctl restart portal`, o tempo de antes continua lá (perde no máximo o último minuto).
- **O multiplicador:**
  - como administrador, ponha ×3 numa conta: o selo acende e o tempo de hoje dela triplica; os dias de antes ficam iguais;
  - com outra conta, o painel mostra o tempo triplicado, sem selo, sem "Sem o multiplicador" e sem o aviso no pé;
  - depois de `systemctl restart portal`, o ×3 continua.

## Sessões

- **20.1 O mural.** Inclui as partes 1, 2 e 3.
  - **O `CLAUDE.md`:**
    - no "Mapa do código":
      - o `servidor/mural.js` e a pasta `publico/mural/`;
      - na linha do `caderno.js`, a marca `mural` das notas e os exports novos;
      - na do `chat.js`, o export do `perfilPublico`;
      - na do `comum.js`, a página nova;
    - em "Cargos":
      - toda conta com caderno prega até 5 notas no mural;
      - o administrador tira qualquer nota do mural;
    - na primeira linha do arquivo, o Mural entre as páginas.

  **Testar:**
  - **Com o servidor e `curl`,** com duas contas de jogador e o administrador:
    - **pregar:** 200 para a dona; 404 para quem não lê a nota; 403 para quem só pode ver e para o administrador; a sexta nota dá 409;
    - **o `GET /api/mural` da outra conta:**
      - o texto;
      - os links filtrados;
      - a embutida só quando ela pode ler ou quando também está no mural;
      - o link para uma nota pregada com o `publico` do mural;
    - **a imagem da nota pregada:** a outra conta abre por `/api/caderno/imagens/<arquivo>` enquanto a nota está no mural, e recebe 404 depois de tirar;
    - **tirar:** 200 da dona e do administrador; 403 de quem só pode ver; 404 de quem não lê a nota;
    - **apagar a nota pregada** a tira do mural;
    - **a busca e o grafo da outra conta** não trazem a nota;
    - **o `GET /api/mural/minhas`** com o `caminho`, e 403 para o administrador.
  - **Com o Playwright na prévia (exceção ao CLAUDE.md), sem tirar prints:**
    - em 360 px, os oito botões da barra de baixo dentro da tela;
    - o mural em 1366 e em 390 px sem rolagem de lado;
    - `#nota-<id>` abre a leitura;
    - pregar pelo diálogo põe o papel no alto.
- **20.2 O tempo no portal.** Inclui a parte 4.
  - **O `CLAUDE.md`:**
    - em "Onde roda", o `uso.json` em `/var/lib/portal`;
    - no "Mapa do código":
      - o `servidor/uso.js`;
      - na linha do `comum.js`, o pulso e o `ganchosDoUso`;
      - na do `voz.js`, o `emChamada`.

  **Testar:**
  - **Com `node`, a conta do tempo,** com horas de mentira:
    - duas janelas alternando pulsos somam o tempo do relógio;
    - mais de 90 segundos sem pulso soma 30 segundos;
    - a virada do dia à meia-noite de Brasília.
  - **Com o servidor e `curl`:**
    - os pulsos;
    - 400 para uma página que não existe;
    - o `GET /api/uso`;
    - o `uso.json` gravado depois de um minuto (ou por uma função de teste);
    - renomear e apagar uma conta.
  - **Com o Playwright na prévia, sem tirar prints:** os três períodos e o detalhe de uma linha.
- **O multiplicador secreto.** A parte 4.5, feita direto, fora do roteiro.
