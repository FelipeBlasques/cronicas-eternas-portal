# Mapas: atualização 1 (a página do lugar, a escala e as distâncias)

Duas coisas novas nos Mapas (`mapas.md`):

- **A página do lugar.** Cada lugar pode ganhar uma página com o texto completo, além do resumo que o painel já mostra. Ela tem as marcas do Caderno (títulos, listas, tabelas, imagens e links para personagens, acontecimentos, memórias e outros lugares). O administrador e os editores escrevem.
- **A escala.** O administrador marca a escala de cada mapa. Com ela vêm a régua no canto do mapa, o "Medir distância" de um ponto a outro (ou por um caminho com paradas) e os tempos de viagem do Pathfinder 2e.

Decisões de 06/11/2026. Quatro sessões (veja "Sessões" no fim):

- 14.1: o servidor;
- 14.2: o editor das marcas sai do Caderno para um arquivo comum, sem mudar o Caderno;
- 14.3: a página do lugar;
- 14.4: a escala, a régua, o medir e a viagem.

Vai para o servidor numa atualização só, depois das quatro juntas na `main`.

Em toda sessão: ao criar um arquivo novo, acrescente-o ao "Mapa do código" do `CLAUDE.md`.

## 1. A página do lugar

### Quem faz o quê

| Ação | Administrador | Editor | Jogador |
| --- | --- | --- | --- |
| Ler a página de um lugar que vê | Sim | Sim | Sim |
| Criar a página e alterar o texto e as imagens | Qualquer lugar | Qualquer lugar que vê | Não |
| Deixar a página "só o administrador" e ver essas | Sim | Não | Não |
| Apagar a página | Sim | Não | Não |

- O editor escreve a página de **qualquer lugar que vê**, também dos impressos e dos marcados por outras contas. É diferente do marcador, que ele só altera se foi ele quem marcou, e é como nos Personagens.
- A página "só o administrador" não existe para quem não a vê. O botão não aparece e a rota dá 404. Nesse lugar, o editor também não ganha o "+ Página": ele não fica sabendo que existe uma página escondida.
- O que um editor cria entra sempre como "todos", como na Linha do Tempo.

### Os dados (no marcador)

```js
pagina: {                        // ausente ou null: o lugar não tem página
  texto,                         // de 1 a 30.000 caracteres, com as marcas do Caderno
  visibilidade,                  // "todos" ou "admin"
  versao,                        // 1 ao criar; mais 1 a cada gravação
  criadaPor, criadaNome, criadaEm,       // como registradoPor e registradoNome
  alteradaPor, alteradaNome, alteradaEm,
},
imagensDaPagina: [               // as imagens enviadas para a página, guardadas em uploads/
  { id, arquivo, tamanho, enviadaEm, enviadaPor },   // id: "img-" e 8 caracteres hexadecimais
],
```

- **As imagens ficam no marcador, e não dentro de `pagina`.** Assim dá para enviar uma imagem antes de a página existir: a página nova só é criada no primeiro "Salvar".
- **Limites:** 30 imagens por lugar, de 10 MB cada (`CONFIG.maxImagem` e `TIPOS_IMAGEM`).
- Sem migração. Sem `pagina` e sem `imagensDaPagina`, o lugar não tem página. O `iniciar()` não muda.

### O texto

- As marcas são as do Caderno, desenhadas pelo `marcas.js` (`desenharMarcas`) dentro de um elemento com a classe `marcas`.
- **Links:** `[[personagem:…|…]]`, `[[evento:…|…]]`, `[[mesa:…|…]]`, `[[memoria:…|…]]` e `[[lugar:<mapa>/<marca>|…]]`.
  - Para quem lê, só viram link os alvos que a conta vê. O resto fica só como texto, como no Caderno.
  - As regras do "o que aparece" são as do Caderno: obrigatório e com no máximo 120 caracteres.
- **As notas do Caderno não entram.** `[[nota:…]]` e `![[nota:…]]` ficam só como texto para todos, e o Citar daqui não oferece notas.
- **Imagens:** `![[imagem:<id>|legenda]]`, com o id de uma imagem de `imagensDaPagina`. Um id que não é do lugar mostra só a legenda.
- Etiquetas (`#nome`) e tarefas aparecem só para ler: a etiqueta não busca nada, e a caixinha não marca.

### As imagens que sobram

- Ao gravar a página, saem as imagens do lugar que o texto gravado não cita e que foram enviadas **há mais de 24 horas**. Os arquivos saem também.
- As de menos de 24 horas ficam, porque podem ser de alguém que ainda está escrevendo.
- Apagar a página, o lugar ou o mapa apaga todas as imagens das páginas.

### Duas pessoas escrevendo ao mesmo tempo

- Cada gravação manda a `versao` que leu. Para criar, manda `0`.
- Se a versão do servidor for outra, nada é gravado, e ele responde **409**, como o conflito das notas do Caderno: `throw new ErroHttp(409, "Alguém salvou esta página enquanto você escrevia.", "conflito", { pagina: { versao, alteradaPor, alteradaEm } })`. O `alteradaPor` vai como nome. O corpo sai assim:

  ```json
  { "erro": "Alguém salvou esta página enquanto você escrevia.", "codigo": "conflito", "pagina": { "versao": 4, "alteradaPor": "Takezo", "alteradaEm": "…" } }
  ```

- A página pergunta: "Takezo salvou esta página enquanto você escrevia. Salvar a sua por cima?" ("Salvar a minha" ou "Cancelar"). Com "Salvar a minha", ela manda de novo com a versão nova. Com "Cancelar", continua na edição.

### No servidor (sessão 14.1)

#### Rotas (`servidor/mapas.js`)

| Rota | Quem | O que faz |
| --- | --- | --- |
| `GET /api/mapas` | todos | Como hoje, e cada marcador ganha `temPagina` (true quando o lugar tem uma página que a conta vê) e `podeCriarPagina` (true para o administrador e os editores num lugar sem página nenhuma). Cada mapa ganha `escala` (veja a parte 3). **Os textos das páginas não vêm aqui.** |
| `GET /api/mapas/citaveis` | admin e editor | O Citar da página: `{ personagens, acontecimentos, mesas, memorias, lugares }`, nos mesmos formatos do Citar do Caderno, sem as notas |
| `GET /api/mapas/:id/marcadores/:marca/pagina` | quem vê o lugar e a página | `{ pagina, links, imagens, podeEditar, podeApagar }`. Sem página (ou escondida para a conta): 404 "Esse lugar não tem página." |
| `PUT /api/mapas/:id/marcadores/:marca/pagina` | admin e editor | Cria ou altera, com JSON `{ texto, versao, visibilidade? }`. Responde `{ pagina: { versao, alteradaEm } }` (201 ao criar) |
| `DELETE /api/mapas/:id/marcadores/:marca/pagina` | admin | Apaga a página e as imagens dela |
| `POST /api/mapas/:id/marcadores/:marca/pagina/imagens` | admin e editor | Formulário com `imagem`. Responde 201 com `{ imagem: { id, endereco } }` |
| `PUT /api/mapas/:id/escala` | admin | Veja a parte 3 |

- O `tratarMapas` lê hoje `[id, recurso, marca, ...resto]` e só aceita `resto` vazio. Passa a ler também o quarto e o quinto pedaço (`pagina` e `imagens`).
- O `citaveis` vem antes das rotas de um mapa: os ids de mapa começam sempre com `mapa-`.

#### O formato da página

`GET .../pagina`:

```json
{
  "pagina": {
    "texto": "…",
    "visibilidade": "todos",
    "versao": 3,
    "criadaPor": "Neia", "criadaEm": "…",
    "alteradaPor": "Takezo", "alteradaEm": "…"
  },
  "links": { "personagem:p1": { "nome": "Venti" }, "lugar:mapa-…/marca-…": { "nome": "Hando", "mapa": "Tyrenar" } },
  "imagens": { "img-1a2b3c4d": "/uploads/….webp" },
  "podeEditar": true,
  "podeApagar": false
}
```

- `visibilidade` só vem para o administrador.
- `criadaPor` e `alteradaPor` são **nomes**, feitos com o `nomeDaConta(usuario, reserva)` de hoje, como o `registradoPor` do marcador.
- `podeEditar`: administrador sempre; editor, só se a página é "todos". `podeApagar`: só o administrador.

#### O `PUT` da página

- `texto`:
  - troca `\r\n` por `\n`;
  - não pode ficar vazio sem os espaços: "Escreva o texto da página.";
  - até 30.000 caracteres: "O texto da página pode ter no máximo 30.000 caracteres.";
  - passa pelo `conferirLinks` do Caderno.
- `visibilidade`: só o administrador manda. O editor que manda leva 403. Quando o editor cria, entra "todos". Quando o editor altera, fica a que estava.
- O editor não altera uma página "admin". Ele nem a vê: 404.
- Na criação, `criadaPor` e `alteradaPor` recebem a conta, e `versao` fica 1. Na alteração, `alteradaPor` recebe a conta e `versao` sobe 1.
- Depois de gravar, as imagens que sobram saem (veja acima).
- No log: `<usuario> escreveu a página de <lugar> no mapa <mapa>`.

#### As imagens

- Use `lerFormulario(req, CONFIG.maxImagem + 4096)`, `arquivoEnviado`, `TIPOS_IMAGEM` e `guardarImagem`, como no envio do mapa.
- 31ª imagem: 400 "Um lugar pode ter no máximo 30 imagens na página.".
- O `endereco` é o caminho em `uploads/` que o `guardarImagem` devolve.
- `apagarMarcador` e `apagarMapa` passam a apagar também os arquivos de `imagensDaPagina`, com `apagarImagens`.

#### Os links e o Citar: as funções do Caderno

O `servidor/caderno.js` já lê e confere os links. Ele passa a exportar quatro funções, sem mudar o que elas fazem:

- `lerCodigos(texto)`: os links, as embutidas, as imagens e as etiquetas de um texto;
- `alvosDosLinks(leitor, chaves)`: o que cada link mostra para quem lê;
- `conferirLinks(texto)`;
- **`citaveisDoPortal(conta)` (nova):** o que o `citaveis(conta)` de hoje devolve, menos as notas e sem o `exigirQuemEscreve`. O `citaveis(conta)` passa a ser `{ notas, ...citaveisDoPortal(conta) }`, igual ao de hoje.

**O `mapas.js` pede o `caderno.js` só dentro das funções**, assim: `const caderno = () => require("./caderno");`. Não use `require("./caderno")` no alto do arquivo. O `servidor.js` carrega o `mapas.js` antes do `caderno.js`, e o `caderno.js` pede o `mapas.js` (o `podeVerLugar`). Um pedido no alto faria o `caderno.js` receber um `mapas.js` ainda vazio.

Na leitura (`GET .../pagina`):

- as chaves que começam com `nota:` saem antes do `alvosDosLinks(conta, chaves)`;
- as `imagens` são as de `lerCodigos(texto).imagens` que estão em `imagensDaPagina`, cada uma com o endereço em `uploads/`.

#### Os ganchos

- `renomearConta`: além do `registradoPor`, trocam `pagina.criadaPor`, `pagina.alteradaPor` e o `enviadaPor` das imagens.
- `excluirConta`: como o `registradoPor` de hoje. O usuário vira `null` e o nome fica guardado em `criadaNome` e `alteradaNome`. No `enviadaPor`, só `null`.

### Na página (sessão 14.3)

A página carrega também, nesta ordem:

- `../marcas.css` e `../editor-de-marcas.css` (da sessão 14.2), depois do `../style.css` e antes do `mapas.css`;
- `../marcas.js` e `../editor-de-marcas.js`, depois do `comum.js` e antes do `visor.js`.

#### No painel do lugar (o anexo 2: "← Índice", o nome, o tipo, o resumo, "Centralizar" e "Copiar link")

- Lugar com página (`m.temPagina`): um botão principal **"Ler a página"**, com um ícone de livro aberto, entre o resumo e as ações.
- Lugar sem página, para quem pode criar (`m.podeCriarPagina`) **e com "Editar lugares" ligado**: um botão leve **"+ Página"** no mesmo lugar. Ele abre o diálogo já na edição, com o texto vazio. Com a edição desligada, ele some, como o lápis do lugar, para não encher o painel de quem só está lendo.

#### O diálogo da página

Um `<dialog id="dialogo-pagina">` no `index.html`, largo (`min(54rem, 100vw - 2rem)`) e alto (até `100dvh - 2rem`). O corpo rola por dentro. No celular, ocupa a tela.

**Lendo:**

- No alto:
  - pequeno, em versalete: o mapa e o tipo ("Tyrenar · Cidade");
  - o nome do lugar em Grenze Gotisch, com o ícone do lugar (o mesmo do painel, `iconeDoLugar`);
  - o apelido em itálico, se houver;
  - para o administrador, o selo "Só o administrador" quando a página é escondida.
- O texto, numa coluna de leitura de até 44rem: `desenharMarcas(pagina.texto, { links, embutidas: {}, imagens }, {})` dentro de um elemento `marcas`.
- Embaixo, pequeno: "Escrita por Neia em 12 de novembro de 2026 · alterada por Takezo em 14 de novembro de 2026". A segunda parte só aparece quando muda a pessoa ou o dia. As datas são as reais, não o Ciclo de Sylara.
- Ações:
  - "Ver no mapa" fecha o diálogo e centraliza o lugar;
  - "Copiar link";
  - "Editar", para quem pode;
  - "Fechar".
- Enquanto carrega, "Carregando…". Falhou: o aviso com `avisarFalha` e o diálogo fecha.

**Editando:**

- No lugar do texto:
  - a barra de botões do editor das marcas (sem "Tarefa" e sem "Embutir nota", veja a parte 2);
  - a área de texto, que ocupa o que sobra do diálogo e rola por dentro (no mínimo 16rem).
- **"Ver como fica"** (um botão de ligar e desligar) troca a área pelo texto desenhado.
  - Os links que a leitura já conhecia usam o `links` dela.
  - Os novos usam o nome da lista do Citar.
  - As imagens enviadas nesta edição já aparecem.
- Para o administrador: "Quem vê a página": "Todos" ou "Só o administrador".
- **Imagens:** pelo botão Imagem, por colar e por arrastar para a área, como no Caderno.
  - Uma por vez, na ordem, com "Enviando imagem…" ao lado do "Salvar".
  - Cada uma que chega entra no texto pelo `editor.porImagem(id, nomeDoArquivo)`.
- Ações:
  - "Salvar" (principal), também com Ctrl+S ou Ctrl+Enter;
  - "Cancelar";
  - para o administrador, numa página que já existe, "Apagar a página" à esquerda, com `perguntar()` antes.
- Depois de salvar:
  - pede a página de novo (para os links e as imagens) e volta para a leitura;
  - no painel, o lugar passa a mostrar "Ler a página";
  - um `avisoRapido` diz "Página salva.".
- **Sair com mudança não salva:** Esc, "Cancelar", "Fechar" e o clique fora perguntam "Sair sem salvar o que mudou?". Fechar a aba também pede confirmação (`beforeunload`).
- **O Voltar do navegador** fecha o diálogo sem perguntar. O texto não salvo fica guardado na memória da página, por lugar, até recarregar. Abrir a edição daquele lugar de novo recupera o texto, com o aviso "Recuperado o texto que você não salvou.".
- **Apagar:** a página some do painel ("Ler a página" vira "+ Página" na edição), e o diálogo fecha.

#### O endereço

- A página aberta é `#<mapa>/<marca>/pagina` (por exemplo, `#mapa-1a2b3c4d/marca-5e6f7a8b/pagina`).
- Abrir pelo painel põe esse endereço no histórico (`pushState`). Fechar volta (`history.back()`) quando foi assim; senão, troca o endereço pelo do lugar (`#<mapa>/<marca>`).
- O endereço é lido também ao carregar a página: o mapa abre, o lugar fica escolhido e a página abre.
- Link de outro lugar dentro da página (`[[lugar:…]]`): o diálogo fecha e o outro lugar abre, pelo `hashchange` de hoje.
- "Copiar link" copia esse endereço, com o aviso de hoje ("Link copiado…").
- Os links de lugar do Caderno e das outras páginas continuam levando ao lugar. A página abre pelo botão do painel.

## 2. O editor das marcas, comum ao Caderno e aos Mapas (sessão 14.2)

Hoje, a barra de botões, as teclas, o Citar e o "pôr a imagem no texto" da edição ficam dentro do `caderno/caderno.js`. A página do lugar precisa do mesmo editor.

Na 14.2, eles saem para dois arquivos comuns, **`publico/editor-de-marcas.js`** e **`publico/editor-de-marcas.css`**, e o Caderno passa a usá-los **sem mudar nada do que a pessoa vê e faz**. Essa sessão não mexe nos Mapas.

### O arquivo comum

Declara um nome só, `criarEditorDeMarcas`, como o `marcas.js` declara só `desenharMarcas`. É carregado depois do `comum.js`, porque usa `criar()`, `simbolo()`, `normalizar()` e `fecharAoClicarFora()`. No `caderno/index.html`, o `../editor-de-marcas.css` entra depois do `../marcas.css`, e o `../editor-de-marcas.js` depois do `../marcas.js`, antes do `caderno.js`.

```js
const editor = criarEditorDeMarcas({
  area: () => elemento,          // a área de texto em edição, ou null
  citaveis: () => promessa,      // a lista do Citar ({ notas?, personagens, acontecimentos, mesas, memorias, lugares }),
                                 // pedida a cada vez que o Citar abre (enquanto chega, fica a última)
  notas: {                       // opcional. Com ele, o grupo Notas no Citar, o botão "Embutir nota" e o ![[ digitado
    atual: () => id ou null,     //   a nota em edição, que não aparece no Citar
    extra: (nota) => texto,      //   o texto pequeno ao lado de cada nota no Citar (hoje: o caminho e "de <nome>")
  },
  tarefas: true,                 // o botão Tarefa (o Caderno sim; a página do lugar não)
  imagens: {                     // opcional. Com ele, o botão Imagem
    escolher: () => {},          //   o que o botão faz (o Caderno clica no #campo-imagens)
  },
});

editor.barra();                  // cria a barra de botões, igual à de hoje
editor.tecla(evento);            // o keydown da área: Ctrl+B, Ctrl+I e o Enter das listas
editor.digitou(evento);          // o input da área: [[ abre o Citar; ![[, o Citar só com as notas (com "notas")
editor.abrirCitar(area, opcoes); // o abrirCitar de hoje, com as mesmas opções
editor.porImagem(id, nome);      // põe ![[imagem:<id>|legenda]] numa linha só dela, onde está o cursor
editor.conferirImagem(arquivo);  // lança o erro de tipo ou de tamanho, com as mensagens de hoje
editor.textoDoLink(texto);       // o "o que aparece" limpo, se o Caderno ainda usar fora do editor
editor.fechar();                 // fecha o menu do Título e o Citar, se estiverem abertos
```

**Sai do `caderno.js` para o arquivo comum** (pode mudar o nome por dentro, mas não o que faz):

- `barraDeFerramentas` e `envolver`;
- todas as trocas: `aplicarTroca`, `linhasDaSelecao`, `mapaDaLinha`, `trocaDasLinhas`, `trocaDeEnvolver`, `lerItem`, `trocaDeLinhas`, `trocaDeTitulo`, `trocaDeBloco` e `trocaDoEnter`;
- `teclaNoTexto` e `aoDigitarColchete`;
- o Citar inteiro: `citacao`, `abrirCitar`, `carregarCitaveis`, `itemCitavel`, `grupoCitavel`, `textoDoLink`, `renderizarCitaveis`, `inserirCitacao` e `configurarCitar`;
- `conferirImagem` e `porImagemNoTexto` (que vira `porImagem`);
- `TABELA_NOVA`, o limite de 120 caracteres do link e os tipos e o tamanho das imagens.

**O menu do botão Título:** hoje ele usa o `#menu` do Caderno, o mesmo do "⋯". O arquivo comum passa a ter um menu próprio, só para o Título, com o mesmo comportamento e a mesma cara:

- quatro opções;
- as setas andam, e Home e End vão às pontas;
- Esc e Tab fecham e devolvem o foco ao botão;
- o clique fora fecha.

O `#menu` do "⋯" continua no Caderno.

**O diálogo do Citar** passa a ser criado pelo arquivo comum, na primeira vez que abre, com os mesmos ids e as mesmas classes de hoje (`dialogo-citar`, `citar-titulo`, `citar-rotulo`, `citar-busca`, `citar-resultados` e `citar-cancelar`). Ele sai do `caderno/index.html`. Sem notas, o rótulo da busca é "Buscar um personagem, acontecimento, mesa, memória ou lugar".

**O CSS** da barra (`.ferramentas`, `.ferramenta…`), do Citar (`.dialogo--citar`, `.citar__…`) e do menu do Título sai do `caderno.css` para o `editor-de-marcas.css`. As regras do celular vão junto (a barra que rola de lado).

**Os ícones da barra** continuam como `<symbol>` no HTML de cada página. A 14.3 copia para o `mapas/index.html` os que a página do lugar usa.

**Fica no Caderno:**

- o envio das imagens (a fila, a sessão da edição e o "Enviando imagem…");
- o colar e o arrastar, que agora chamam `editor.conferirImagem` e `editor.porImagem`;
- o salvar sozinho e o conflito;
- o `#menu` do "⋯";
- os eventos da `#area-nota`, que passam a chamar `editor.tecla` e `editor.digitou`.

O Caderno cria o editor uma vez, no início, com `area: campoDoTexto`, `citaveis: api.citaveis`, `notas` e `tarefas: true`. Ele monta a barra com `editor.barra()` no lugar do `barraDeFerramentas()`.

**Testar (exceção ao CLAUDE.md):** na prévia do Caderno, com o Playwright e sem tirar prints, confira que continua igual:

- Negrito envolve a seleção, e Ctrl+Z desfaz;
- Ctrl+I;
- Enter continua a lista, e Enter no item vazio termina;
- o menu Título, com quatro opções (e as setas, e o Esc);
- Tabela e Separador;
- `[[` abre o Citar com os seis grupos, e escolher troca o `[[` pelo link;
- `![[` abre só com as notas;
- Esc no Citar deixa o que foi digitado;
- o botão Imagem e o colar põem o código da imagem;
- no celular (390 px), a barra rola de lado.

## 3. A escala do mapa

### Os dados (no mapa)

```js
escala: {                        // ausente ou null: o mapa não tem escala
  distancia,                     // o tamanho real da linha medida: maior que 0, até 100.000, com até 2 casas
  unidade,                       // "km" ou "mi" (milhas)
  de: { x, y }, ate: { x, y },   // as pontas da linha, em proporção da imagem (de 0 a 1, como os lugares)
  alteradaEm,
}
```

- A conta é esta. O comprimento da linha, em pixels da imagem, é `hypot((ate.x - de.x) * largura, (ate.y - de.y) * altura)`. As unidades por pixel são `distancia / comprimento`.
- Trocar a imagem do mapa mantém a escala, porque as pontas são proporções. Se o desenho novo tiver outro enquadramento, o administrador marca a escala de novo. O formulário do mapa diz isso embaixo do campo da imagem, quando o mapa tem escala.

### A rota (sessão 14.1)

**`PUT /api/mapas/:id/escala`**, só do administrador, com `{ escala }` ou `{ escala: null }`. Responde `{ escala }`. O servidor confere:

- `distancia`: número maior que 0 e até 100.000: "A distância precisa ser um número maior que zero e de no máximo 100.000.";
- `unidade`: `"km"` ou `"mi"`;
- `de` e `ate`: números de 0 a 1;
- a linha com pelo menos 20 pixels da imagem: "A linha da escala precisa ser mais comprida.".

O `GET /api/mapas` traz `escala` (o objeto ou `null`) em cada mapa, para todos.

### Marcar a escala (administrador, sessão 14.4)

- Uma ferramenta nova na coluna do visor, só para o administrador: **"Escala do mapa"** (`#visor-escala`, com o ícone da régua dos mapas: uma barra com as divisões), logo abaixo do "Importar lugares".
- Clicar liga o modo de marcar, com o aviso: "Clique no começo e no fim de uma distância que você conhece, como a régua desenhada no mapa."
  - O primeiro clique marca uma ponta.
  - A linha acompanha o mouse até o segundo clique.
  - O segundo clique fecha a linha e abre um diálogo pequeno: "Essa linha mede [   ] [km ▾]", com "Salvar", "Marcar de novo", "Cancelar" e, se o mapa já tem escala, "Tirar a escala".
  - Com escala, o diálogo já vem com a distância e a unidade de agora, e a linha guardada aparece no mapa enquanto ele está aberto.
- Esc, ou clicar no botão de novo, sai do modo sem mudar nada.

### A régua no mapa

- Com escala, uma régua no canto de baixo do espaço livre do mapa, à esquerda da coluna de ferramentas. O espaço livre é o do `espacoDoPainel()`, que já desconta o painel.
- **O desenho:** uma barra de ferro e pergaminho em dois trechos alternados, como nas réguas dos mapas antigos. Embaixo, "0", o meio e o fim, em Alegreya pequena: "0 · 25 · 50 km".
- **O tamanho:** acompanha o zoom (no `aoMudar` do visor). O fim é sempre um número redondo (1, 2 ou 5 vezes uma potência de 10), com a barra entre 80 e 160 px na tela.
- **Clicar na régua** troca entre km e milhas, só para quem clicou. A escolha fica guardada em `mapas:unidade` (no `localStorage`, com `try/catch`). Sem escolha, vale a unidade do mapa. A mesma escolha vale para o "Medir distância".
- Sem escala, sem régua.

## 4. Medir distância e a viagem (sessão 14.4)

### Medir

- Uma ferramenta nova na coluna do visor, para todos: **"Medir distância"** (`#visor-medir`, com o ícone de um compasso de pontas secas, o de medir em mapa), logo abaixo do "Destacar lugares".
  - Sem escala: o botão fica apagado, com a dica "Este mapa ainda não tem escala.". Para o administrador, a dica é "Marque a escala do mapa para medir.".
- **Ligado (o modo de medir):**
  - o cursor vira mira;
  - cada clique no mapa põe um ponto do caminho;
  - **clicar num lugar** (na área clicável dele) põe o ponto no centro do lugar e guarda o lugar, para o nome aparecer nos trechos (no modo de medir, clicar num lugar não abre o detalhe dele);
  - no computador, um trecho fino acompanha o mouse desde o último ponto, com a distância total até ali num rótulo pequeno perto do cursor;
  - os pontos podem ser arrastados, como os marcadores visíveis (sem arrastar o mapa junto);
  - Backspace ou "Desfazer" tira o último ponto.
- **Esc, ou clicar no botão de novo,** sai do modo. A linha e o painel ficam, para ler e copiar. Ligar de novo continua do último ponto.
- **"Medir daqui"**, no painel de um lugar (com escala): liga o modo com o primeiro ponto naquele lugar.
- Trocar de mapa ou fechar o visor apaga a medição. Ela não fica guardada em lugar nenhum.

**O desenho:**

- Fica numa camada SVG dentro da camada dos lugares, em pixels da imagem.
- A linha é pergaminho, com um contorno escuro por baixo, para aparecer em qualquer mapa. Os pontos são círculos pequenos em brasa.
- Cada trecho mostra a distância dele num rótulo no meio, como o rótulo dos lugares (`.rotulo-lugar`).
- Trecho em terreno difícil: tracejado. Em terreno difícil maior: pontilhado.
- As medidas de tela (a espessura e o raio) não mudam com o zoom. O desenho é refeito no `aoMudar` do visor, como o halo (`desenharHalo`), com as medidas divididas pela escala do zoom.

### O painel da medição

Fica no painel lateral, no lugar do índice e do detalhe, numa seção nova (`#medicao`). No celular, abre a gaveta.

- "Medir distância" no alto, e "Fechar" (apaga tudo e volta ao índice).
- Com menos de dois pontos, a explicação: "Clique no mapa para marcar o caminho. Clique num lugar para começar ou passar por ele."
- **A distância total**, grande: "126 km", e a outra unidade pequena ao lado: "(78,3 milhas)".
- **Os trechos**, numerados:
  - cada um com o começo e o fim (o nome do lugar, ou "ponto 3"), a distância e uma lista de terreno: "Normal", "Difícil" ou "Difícil maior";
  - o terreno muda o tempo e o desenho do trecho.
- **A viagem no Pathfinder 2e** (a próxima parte).
- Botões: "Desfazer", "Limpar" e "Copiar".
  - "Copiar" copia um resumo em texto: os trechos, o total e o tempo, com o deslocamento escolhido.

### A viagem no Pathfinder 2e

A tabela de viagem do Pathfinder 2e (Player Core, p. 438; a mesma do GM Core, p. 36) é feita para terreno plano e limpo, num ritmo que não cansa:

| Deslocamento | Milhas por hora | Milhas por dia |
| --- | --- | --- |
| 10 pés | 1 | 8 |
| 15 pés | 1½ | 12 |
| 20 pés | 2 | 16 |
| 25 pés | 2½ | 20 |
| 30 pés | 3 | 24 |
| 35 pés | 3½ | 28 |
| 40 pés | 4 | 32 |
| 50 pés | 5 | 40 |
| 60 pés | 6 | 48 |

Regras da mesma página:

- **Terreno difícil** corta a velocidade pela metade.
- **Terreno difícil maior** deixa um terço.
- **As atividades de exploração** Evitar ser Notado (Avoid Notice), Defender (Defend), Investigar (Investigate), Procurar (Search), Explorar (Scout), Detectar Magia (Detect Magic) e Repetir uma Magia (Repeat a Spell) viajam à metade da velocidade.
- As milhas por dia da tabela são 8 horas de viagem: o deslocamento × 0,8.

**No painel:**

- **"Deslocamento":** uma lista com os nove da tabela, de "10 pés" a "60 pés". O padrão é **25 pés**, o da maioria das ancestralidades. Ao lado, pequeno, a mesma velocidade em km/h: "25 pés · 4 km/h".
- **"Metade da velocidade (atividade de exploração)":** uma caixa de marcar.
- **"Horas de viagem por dia":** um número de 1 a 24, padrão 8. Um barco com tripulação em turnos, por exemplo, viaja 24.
- As três escolhas ficam guardadas em `mapas:viagem` (no `localStorage`, com `try/catch`).

**A conta:**

- A velocidade em milhas por hora é o deslocamento ÷ 10 (a tabela).
- Cada trecho leva `milhas do trecho ÷ (milhas por hora × terreno × metade)` horas:
  - o terreno vale 1 no Normal, ½ no Difícil e ⅓ no Difícil maior;
  - a metade vale ½ com a caixa marcada e 1 sem ela.
- A soma dos trechos dá as horas de viagem. Em km, 1 milha = 1,609344 km.
- O resultado, grande: "**3 dias e 7 h** de viagem".
  - Os dias são as horas ÷ horas por dia, para baixo. As horas que sobram são arredondadas para 5 minutos: "7 h", "7 h 20 min" ou "45 min".
  - Sem dia inteiro, só as horas.
  - Embaixo, pequeno: "31 h de viagem a 2,5 milhas por hora".
- **"Tabela de viagem"** (um `<details>` fechado): as nove linhas da tabela, com uma coluna a mais, "Este caminho". Ela traz o tempo deste caminho em cada deslocamento, com os mesmos terrenos, metade e horas por dia. A linha do deslocamento escolhido fica destacada.
- No pé, pequeno: "Tabela de viagem do Pathfinder 2e (Player Core, p. 438). Terreno difícil: metade da velocidade; difícil maior: um terço."

Os números aparecem em português: vírgula decimal e uma casa abaixo de 100 ("78,3"), sem casas de 100 para cima ("126").

## 5. Prévia

A API de mentira ganha as mesmas rotas, com as mesmas regras e os mesmos erros:

- a página do lugar (ler, criar, alterar com as versões e o conflito, apagar), as imagens (feitas num canvas, sem rede) e o Citar;
- a escala.

**Os exemplos:**

- o mapa de exemplo com escala;
- três lugares com página:
  - uma com título, lista, tabela, imagem e links (um deles para um personagem oculto, que fica só como texto para o jogador);
  - uma curta;
  - uma "só o administrador".

**"Restaurar os exemplos"** volta tudo. No painel da prévia, "Ver a página como" administrador, editor e jogador mostra as diferenças: o "+ Página", o "Editar" e a escondida.

## 6. No CLAUDE.md

- **Sessão 14.1:** no `mapas.js` do "Mapa do código", as páginas dos lugares (com as imagens em `uploads/`) e a escala. No `caderno.js`, as funções que ele exporta para os Mapas.
- **Sessão 14.2:** os dois arquivos novos no "Mapa do código". Na linha do `caderno/`, que ele carrega também o `editor-de-marcas.js` e o `.css`.
- **Sessão 14.4:** em "Cargos", que o editor escreve a página de qualquer lugar que vê e que o administrador marca a escala dos mapas.

## Fora desta versão

- grade de hexágonos (hexploração);
- rotas guardadas no mapa;
- distância por estradas;
- "Citado em" na página do lugar (as notas e as páginas que citam o lugar);
- histórico das versões da página;
- página para o mapa inteiro.

## Testar no servidor (depois da atualização)

- **Página do lugar:**
  - com o administrador, criar uma página com imagem, links e tabela; ler com um jogador;
  - um editor criando a página de um lugar impresso e alterando a de outro;
  - a página "só o administrador": o jogador não vê o botão, e o link direto dá "Esse lugar não tem página.";
  - duas abas alterando a mesma página: a pergunta do conflito;
  - o link `#…/pagina` copiado, aberto noutra aba e depois de entrar no portal;
  - apagar a página, e as imagens saindo de `uploads/`.
- **O Caderno depois da 14.2:** escrever uma nota com os botões, o Citar, a imagem colada e o Enter nas listas.
- **Escala e distâncias:**
  - marcar a escala no Tyrenar pela régua desenhada no mapa, e depois "Marcar de novo" (a linha guardada aparece apagada) e "Tirar a escala";
  - o editor e o jogador sem o botão "Escala do mapa"; num mapa sem escala, o "Medir distância" apagado com a dica de cada um;
  - o formulário do mapa com escala, com o aviso embaixo da imagem;
  - a régua acompanhando o zoom, e o clique trocando km e milhas;
  - medir de uma cidade a outra passando por uma terceira, com um trecho em terreno difícil;
  - conferir o tempo com a tabela;
  - arrastar um ponto, o Backspace, o Esc (a linha fica) e ligar de novo continuando do último ponto;
  - "Medir daqui";
  - "Copiar";
  - o deslocamento, a metade e as horas por dia continuando escolhidos depois de recarregar;
  - no celular, a gaveta com a medição.

## Sessões

- **14.1 Servidor.** Inclui:
  - a página do lugar: os dados, as rotas, as versões, as imagens com o limite e as sobras, os links pelas funções do Caderno (com o `require` dentro das funções), o Citar e os ganchos;
  - o `apagarMarcador` e o `apagarMapa` apagando as imagens;
  - a escala: a rota e o `GET /api/mapas`;
  - as quatro funções exportadas pelo `caderno.js`;
  - o `CLAUDE.md` da 14.1.

  Testar com o servidor e `curl`:
  - criar como editor (entra "todos"), e o editor mandando `visibilidade` (403);
  - o jogador escrevendo (403);
  - a página "admin" para o jogador e para o editor (404 nos dois, e sem `podeCriarPagina` para o editor);
  - o conflito (409, com a versão);
  - os links de um personagem oculto, e uma nota no texto;
  - uma imagem de mais, e as sobras de mais de 24 horas (com o servidor parado, mude o `enviadaEm` à mão no `dados.json` de teste);
  - apagar a página, o lugar e o mapa, conferindo os arquivos em `uploads/`;
  - renomear e excluir conta;
  - a escala certa, curta, com unidade errada e tirada.
- **14.2 O editor das marcas.** Use o modo de planejamento. Inclui:
  - a parte 2 inteira: os dois arquivos comuns e o Caderno usando eles;
  - o teste da parte 2 na prévia do Caderno.
- **14.3 A página do lugar.** Use o modo de planejamento. Inclui:
  - a parte 1, "Na página": o botão no painel, o diálogo lendo e editando, as imagens, o conflito, o endereço e o rascunho do Voltar;
  - a prévia da parte 5 que trata das páginas.
- **14.4 Escala, régua, medir e viagem.** Use o modo de planejamento. Inclui:
  - na parte 3, "Marcar a escala", "A régua no mapa" e o aviso do formulário do mapa sobre trocar a imagem;
  - a parte 4 inteira;
  - a prévia da parte 5 que trata da escala;
  - o `CLAUDE.md` da 14.4;
  - revisar a lista "Testar no servidor".
