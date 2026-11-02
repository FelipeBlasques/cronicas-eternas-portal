# Caderno

Uma página nova: o caderno pessoal de cada conta, com pastas e notas, no espírito do Obsidian. A nota tem texto com marcas tipo Markdown, imagens, tabelas, tarefas, etiquetas e links `[[...]]` para outras notas e para coisas do portal; uma nota também pode embutir outra. Cada conta só vê o próprio caderno e o que compartilharam com ela. Uma nota pode ter um link público, que qualquer pessoa lê, mesmo sem conta. O administrador não tem caderno: ele lê o de todas as contas, sem alterar. Decisões fechadas em 02/11/2026.

Cinco sessões: 10.1 e 10.2 servidor, 10.3 a 10.5 página (veja "Sessões" no fim). Vai para o servidor numa atualização só, depois das cinco juntas na `main`.

Em toda sessão: ao criar um arquivo novo, acrescente-o ao "Mapa do código" do `CLAUDE.md`.

## Na barra lateral

Uma entrada nova no fim da lista `PAGINAS` do `comum.js`, depois de Regras:

```js
{
  id: "caderno",
  nome: "Caderno",
  curto: "Caderno",
  caminho: "caderno/",
  pronta: false, // true só na sessão 10.5
  icone: "M5 2.5h12a1.5 1.5 0 0 1 1.5 1.5v16a1.5 1.5 0 0 1-1.5 1.5H5ZM8.5 2.5v19M14.5 2.5v6l-1.5-1.2-1.5 1.2v-6M18.5 11h2.5v3h-2.5", // caderno com fita e fecho
},
```

Sem número aceso na barra.

## Quem tem caderno

- Toda conta que não é administrador tem um caderno, com o título **"Caderno de <nome da conta>"** (o `nome`, que a conta pode mudar). Ele nasce vazio, e o arquivo dele só é criado na primeira mudança.
- A dona lê e escreve no próprio caderno. Ninguém mais chega nele, a não ser pelo que ela compartilhar (parte "Compartilhar").
- O **administrador** não tem caderno. Na página, ele escolhe uma conta e lê o caderno dela inteiro, só para ler: não altera, não cria, não apaga, não marca tarefas, não fixa e não compartilha. A página não mostra aviso disso para os jogadores.

## Onde os dados ficam

Fora do `dados.json`, porque o caderno salva sozinho enquanto se escreve e o `dados.json` é regravado inteiro a cada mudança:

```
/var/lib/portal/cadernos/<usuario>/caderno.json
/var/lib/portal/cadernos/<usuario>/imagens/<id>.<ext>
```

(`/var/lib/portal` é o `CONFIG.pastaDados`.)

- O `iniciar()` do `servidor/caderno.js` cria a pasta `cadernos/` e lê todos os cadernos para a memória (são poucas contas). Ele devolve `false`, porque não muda nada no `dados.json`.
- Cada caderno é gravado sozinho, como o `dados.json`: arquivo temporário, troca de nome, modo 0600. As gravações de um caderno ficam em fila, e uma mudança que chega enquanto outra espera vai junto com ela (no máximo uma gravação esperando por caderno). A rota responde depois da gravação que leva a mudança dela.
- Se um `caderno.json` não puder ser lido (arquivo corrompido), o portal registra o erro, **nunca grava por cima** e responde às mudanças daquele caderno com erro 500 e uma mensagem clara. A leitura dos outros cadernos continua.

### O caderno.json

```json
{
  "formato": 1,
  "pastas": [
    { "id": "pasta-…", "nome": "Sessões", "pasta": null, "compartilhada": {}, "criadaEm": "…", "criadaPor": "neia" }
  ],
  "notas": [
    {
      "id": "nota-…",
      "titulo": "Sessão 12",
      "pasta": "pasta-…",
      "texto": "…",
      "versao": 7,
      "criadaEm": "…",
      "criadaPor": "neia",
      "alteradaEm": "…",
      "alteradaPor": "takezo",
      "compartilhada": { "takezo": "editar" },
      "link": null
    }
  ],
  "fixadas": ["nota-…"],
  "imagens": [{ "id": "…", "arquivo": "….png", "tamanho": 183022, "criadaEm": "…", "orfaDesde": null }]
}
```

- `id`: `nota-` ou `pasta-` mais 12 caracteres hexadecimais; a imagem, 24. Os ids são únicos entre **todos** os cadernos: o servidor guarda na memória em que caderno está cada id.
- `pasta`: o id da pasta em que o item está; `null` é a raiz.
- `compartilhada`: as contas e o que cada uma pode, `"ver"` ou `"editar"`. Os usuários são chaves: confira sempre com `Object.hasOwn`, como em `memorias.js`.
- `link`: o link público da nota, `{ token, criadoEm }`, ou `null`. O token tem 24 bytes aleatórios em base64url.
- `versao`: sobe a cada mudança do texto ou do título. Serve para descobrir quando duas pessoas salvaram a mesma nota (parte "Edição").
- `fixadas`: as notas que a conta fixou, do próprio caderno ou compartilhadas com ela.
- `criadaPor` e `alteradaPor`: o usuário de quem criou e de quem mudou por último. Pode ser uma conta com quem a nota foi compartilhada para editar.

### Limites

Num objeto `LIMITES` no alto do `servidor/caderno.js`, cada um com um comentário, para o Fe poder mudar:

| O quê | Limite |
| --- | --- |
| Título da nota | 120 caracteres, numa linha. Vazio vira "Sem título" |
| Nome da pasta | 80 caracteres, numa linha; obrigatório |
| Texto da nota | 100.000 caracteres |
| Texto do caderno inteiro | 10.000.000 de caracteres |
| Notas por caderno | 2.000 |
| Pastas por caderno | 500 |
| Pastas dentro de pastas | 8 níveis |
| Imagem | 10 MB (`CONFIG.maxImagem`); PNG, JPG, WEBP, GIF ou AVIF (`TIPOS_IMAGEM`) |
| Imagens do caderno inteiro | 1 GB |
| Fixadas | 30 por conta |

Mensagens de erro com o nome do campo, como nas outras páginas (ex.: "O texto da nota pode ter no máximo 100.000 caracteres.").

### Contas

- **Usuário renomeado** (`ganchos.renomearConta`): a pasta `cadernos/<antigo>` vira `cadernos/<novo>`, e o usuário muda em `compartilhada`, `criadaPor` e `alteradaPor` de todos os cadernos.
- **Conta excluída** (`ganchos.excluirConta`): o caderno dela é apagado, com as imagens, e ela sai do `compartilhada` dos outros cadernos. O que ela escreveu nos cadernos dos outros fica, com o usuário dela em `criadaPor` e `alteradaPor` (a página mostra o usuário quando a conta não existe mais).
- Os ganchos podem usar as funções síncronas do `fs` (são raros) e mandar gravar os cadernos que mudaram.

## O texto da nota

### As marcas

| Escrito | Vira |
| --- | --- |
| `# Título`, `## Título`, `### Título` no começo da linha | título de nível 1, 2 ou 3 (`####` ou mais viram nível 3) |
| `**negrito**`, `*itálico*`, `~~riscado~~` | negrito, itálico, riscado. Podem se combinar: `**negrito com *itálico* dentro**` |
| `- item` ou `* item` | lista. Com 2 espaços (ou um Tab) a mais no começo, item dentro de item, até 3 níveis |
| `1. item` | lista numerada, a partir do primeiro número |
| `- [ ] tarefa` e `- [x] feita` | tarefa com caixinha |
| `> texto` | citação; linhas seguidas formam uma citação só |
| `---`, `***` ou `___` sozinhos na linha | separador |
| linhas com as células separadas por barras verticais | tabela (abaixo) |
| `#etiqueta` | etiqueta (parte "Etiquetas") |
| `https://…` solto, ou `[texto](https://…)` | link para fora do portal, que abre em outra aba, com `rel="noopener noreferrer"`. Só `http` e `https`; o resto fica como texto |

E os códigos do portal (fora da tabela por causa da barra vertical):

- `![[imagem:<id>|legenda]]`: imagem (parte "Imagens");
- `[[tipo:<id>|o que aparece]]`: link (parte "Links");
- `![[nota:<id>|o que aparece]]` sozinho na linha: a outra nota embutida (parte "Links").

Uma barra invertida antes de `*`, `~`, `#`, `[`, `]`, `|`, `-`, `>` ou `\` mostra o caractere sem a barra (ex.: `\*` vira `*`).

- Linha em branco separa blocos. Dentro de um parágrafo, a quebra de linha fica.
- Uma lista começa na primeira linha de item, mesmo logo abaixo de um parágrafo ("Leva sempre:" na linha de cima vira parágrafo e lista). Uma linha que não é item termina a lista.
- **Tabela:** uma linha com as células entre `|`, depois a linha de traços (`| --- | :---: | ---: |`, que também diz o alinhamento: esquerda, centro, direita) e as linhas seguintes que começam com `|`. A primeira linha é o cabeçalho. Nas células valem as marcas de linha e os links. Sem a linha de traços, não é tabela.
- Sem blocos de código (as crases ficam como estão) e sem HTML: o texto **nunca** vira HTML. Tudo é montado com `criar()` e `textContent`, e os endereços dos links são feitos pela página a partir do id.

O desenho das marcas fica num arquivo só, `publico/marcas.js`, com o estilo em `publico/marcas.css`. Os dois são usados pela página do Caderno e pela leitura pública. A função principal recebe o texto e o que o servidor mandou (`links`, `embutidas`, `imagens`) e devolve os elementos. Cada tarefa leva o número da linha dela no texto, para a página poder marcar a caixinha (parte "Edição").

### Links

São os links das Memórias, `[[<tipo>:<id>|o que aparece]]`, com mais tipos:

| Tipo e id | Leva a | A conta vê o link quando |
| --- | --- | --- |
| `nota:<id>` | a nota, na página do Caderno (`#nota-<id>`) | pode ler aquela nota |
| `personagem:<id>` | `../personagens/#personagem-<id>` | vê o personagem na galeria |
| `evento:<id>` | `../linha-do-tempo/#evento-<id>` | vê o acontecimento na Linha (`podeVer` do `linha.js`) |
| `mesa:<id>` | a galeria de Personagens filtrada pela mesa: `../personagens/#mesa-<id>` | a mesa existe |
| `memoria:<id>` | `../memorias/#memoria-<id>` | pode ler a memória (`podeLer` do `memorias.js`, que passa a ser exportado) |
| `lugar:<mapa>/<marca>` | `../mapas/#<mapa>/<marca>` (ex.: `#mapa-1a2b3c4d/marca-5e6f7a8b`) | vê o mapa e o lugar: nenhum dos dois é "só o administrador", ou a conta é o administrador |

- O servidor resolve os links para quem está lendo e manda só os alvos que a conta vê, como nas Memórias. Os outros, e os apagados, aparecem **só como texto**.
- O "o que aparece" tem até 120 caracteres e não pode ficar vazio, com as mesmas mensagens do `conferirLinks` das Memórias. Aquele só conhece `evento` e `personagem`: o Caderno usa um padrão próprio, com todos os tipos daqui.
- O link de nota abre a nota ali mesmo, sem recarregar a página. Com Ctrl, Shift e afins, o navegador faz o de sempre.
- Os outros links usam `enderecoDaPagina()`, como os das Memórias.

**Nota embutida** (`![[nota:<id>|…]]` sozinho na linha): mostra, numa moldura, o título da outra nota (com link para abri-la) e o texto dela inteiro, com as marcas. Só um nível: uma nota embutida dentro da embutida aparece como link. Quem não pode ler a nota embutida vê só o "o que aparece", como texto. Uma nota que embute a si mesma mostra só o link.

**Citada em:** no pé da nota, a lista das notas que têm link para ela ou a embutem, só as que quem está lendo pode ler.

### Etiquetas

- `#` seguido de letras, números, `_`, `-` ou `/`, com pelo menos uma letra, até 60 caracteres, no começo da linha ou depois de um espaço ou de um parêntese.
- Não são etiqueta: um título (`# ` com espaço), um `#` dentro de um link ou de um endereço da web.
- Na leitura, a etiqueta vira uma plaquinha. Clicar nela busca as notas com a mesma etiqueta.
- As etiquetas são comparadas sem diferença de maiúsculas e acentos. Na lista, aparecem em minúsculas.

### Imagens

- A imagem é enviada ao servidor e entra no texto onde estava o cursor, como `![[imagem:<id>|legenda]]`. A legenda começa com o nome do arquivo sem a extensão e pode ser mudada (ou apagada, junto com a barra: `![[imagem:<id>]]`).
- Na leitura, a imagem ocupa a largura da nota sem passar do próprio tamanho, com a legenda embaixo, em itálico pequeno. Clicar abre a imagem inteira em outra aba.
- Uma nota só mostra imagens do próprio caderno. A imagem de outro caderno aparece só com a legenda.
- As imagens ficam **protegidas**. A rota delas confere se quem pede pode ler alguma nota daquele caderno que cite a imagem (o administrador sempre pode). Na leitura pública, vale a imagem citada na nota do link ou numa nota embutida nela que também tenha o link público ligado.
- A imagem que nenhuma nota cita mais (órfã) não some na hora, para um recortar e colar não perder a imagem. O servidor marca `orfaDesde` e apaga o arquivo depois de **7 dias** órfã; se ela voltar a ser citada antes, `orfaDesde` volta a `null`. A conferência roda ao ligar e uma vez por dia. Apagar uma nota segue a mesma regra.
- O espaço usado soma todas as imagens do caderno, as órfãs também. A imagem enviada por quem pode editar uma nota compartilhada vai para o caderno da dona e conta no espaço dela.

## Compartilhar

### Com contas (notas e pastas)

- A dona escolhe, entre as contas que existem (menos ela e o administrador, que já lê tudo), quem pode **ver** e quem pode **editar** uma nota ou uma pasta.
- Uma pasta compartilhada leva tudo o que está dentro dela, **também o que for criado depois**. Se um item estiver compartilhado por mais de um caminho (a pasta e a própria nota), vale o mais forte.
- Para quem recebe, cada conta que compartilhou algo aparece numa seção própria na lateral da página, **"Compartilhadas por <nome>"**, com as notas e pastas. Uma pasta mostra o que tem dentro.
- Para quem não pode ver um item, ele não existe: as rotas respondem 404, como nas Memórias.

### O que cada um pode

| | Dona | Pode editar | Pode ver | Administrador | Link público |
| --- | --- | --- | --- | --- | --- |
| Ler a nota (texto, imagens, links, embutidas) | sim | sim | sim | sim | sim |
| Mudar texto e título, marcar tarefas, pôr imagens | sim | sim | não | não | não |
| Criar nota ou pasta dentro de uma pasta | sim | só numa pasta compartilhada para editar | não | não | não |
| Renomear pasta | sim | só numa pasta compartilhada para editar | não | não | não |
| Mover e apagar | sim | não | não | não | não |
| Compartilhar e ligar o link público | sim | não | não | não | não |
| Fixar na própria lista | sim | sim | sim | não | não |

O que uma conta com "editar" cria fica no caderno da dona. Se a dona deixar de compartilhar, a conta perde o acesso a isso também.

### O link público (só notas)

- A dona liga o link público de uma nota. O endereço fica `https://cronicaseternas.com/ler/#<token>`.
- **Qualquer pessoa** com o link lê a nota, **sem precisar de conta**. Ninguém altera por ele.
- A dona pode desligar o link (ele para de funcionar na hora) ou gerar outro (o antigo para de funcionar).
- Pasta não tem link público.
- Na leitura pública:
  - sem login, os links para coisas do portal aparecem **só como texto**; logada, a pessoa vê os links que a conta dela vê;
  - um link para outra nota leva à leitura pública dela, se ela também tiver o link ligado; para quem está logado e pode ler a nota, leva à página do Caderno; senão, fica só texto;
  - uma nota embutida aparece se também tiver o link ligado, ou se quem está logado puder lê-la; senão, só o "o que aparece";
  - não aparecem "Citada em" e a busca das etiquetas.

## Rotas (`servidor/caderno.js`, prefixo `/api/caderno`)

| Rota | Quem | O que faz |
| --- | --- | --- |
| `GET /api/caderno` | qualquer conta | os dados da página (veja "Formatos") |
| `GET /api/caderno/contas/:usuario` | admin | o caderno daquela conta: `{ dono: { usuario, nome }, caderno: Arvore, etiquetas, imagens: { usado, limite } }` |
| `GET /api/caderno/notas/:id` | quem pode ler | a nota inteira, com os links, as embutidas, as imagens e "Citada em" |
| `POST /api/caderno/notas` | dona; "editar" na pasta | `{ titulo, pasta, texto? }`. O caderno é o da pasta (raiz: o da própria conta). Responde 201 com `{ nota: { id } }` |
| `PUT /api/caderno/notas/:id` | dona; "editar" | `{ titulo?, texto?, versao }` e, só da dona, `pasta` (mover). Responde `{ nota: { versao, alteradaEm } }`; 409 no conflito |
| `DELETE /api/caderno/notas/:id` | dona | apaga a nota |
| `POST /api/caderno/pastas` | dona; "editar" na pasta de cima | `{ nome, pasta }`. Responde 201 com `{ pasta: { id } }` |
| `PUT /api/caderno/pastas/:id` | dona; "editar" só o nome | `{ nome?, pasta? }`. Não deixa pôr uma pasta dentro dela mesma nem passar dos 8 níveis |
| `DELETE /api/caderno/pastas/:id` | dona | apaga a pasta e tudo dentro dela |
| `PUT /api/caderno/notas/:id/compartilhada` e `PUT /api/caderno/pastas/:id/compartilhada` | dona | `{ contas: { "neia": "ver", "takezo": "editar" } }`, que substitui o que havia. Só contas que existem e não são administrador |
| `POST /api/caderno/notas/:id/link` | dona | liga o link público ou gera outro. Responde `{ link: { endereco } }` |
| `DELETE /api/caderno/notas/:id/link` | dona | desliga o link público |
| `PUT /api/caderno/fixadas` | conta com caderno | `{ notas: [ids] }`, só notas que ela pode ler, até 30 |
| `POST /api/caderno/imagens` | dona; "editar" | formulário com `imagem` e `nota` (a nota sendo escrita, que diz o caderno). Confere tipo, tamanho e espaço. Responde 201 com `{ imagem: { id, endereco } }` |
| `GET /api/caderno/imagens/:arquivo` | quem pode ler uma nota que cita a imagem | a imagem, com `Cache-Control: private, max-age=31536000, immutable` |
| `GET /api/caderno/busca?q=…` | qualquer conta | as notas que a conta pode ler. O administrador manda também `&conta=<usuario>` e busca naquele caderno |
| `GET /api/caderno/citaveis` | conta com caderno | o que o "Citar" oferece |
| `GET /api/caderno/publico/:token` | qualquer pessoa, sem login | a nota do link público |
| `GET /api/caderno/publico/:token/imagens/:arquivo` | qualquer pessoa, sem login | uma imagem citada na nota do link |

- As rotas de escrita leem o JSON com `lerJson(req, limite)` de 1 MB; a imagem, com `lerFormulario(req, CONFIG.maxImagem + CONFIG.maxJson)`.
- O administrador recebe 403 em todas as rotas de escrita e nos citáveis.
- O servidor manda os endereços do link público sem o domínio (`/ler/#<token>`); a página põe o `location.origin` na frente.
- **As rotas públicas** são respondidas pelo `servidor.js` **antes** da conferência da sessão, só para `GET`: o módulo exporta também `tratarPublico(req, res, rota, metodo, conta)`, e o `servidor.js` passa a conta da sessão, se houver, ou `null`. As respostas delas levam o cabeçalho `X-Robots-Tag: noindex`. Link desligado ou que não existe: 404 com "Este link não está mais ativo."

### Formatos

`Arvore` é `{ pastas, notas }`:

- pasta: `{ id, nome, pasta }`;
- nota: `{ id, titulo, pasta, alteradaEm, etiquetas }`;
- só para a dona: `compartilhada` (a do próprio item, não a herdada da pasta) e, na nota, `link: true` quando o link público está ligado;
- nas `compartilhadas`, cada item traz `nivel` (`"ver"` ou `"editar"`), e os do alto (os que não estão numa pasta também compartilhada com a conta) vêm com `pasta: null`.

`GET /api/caderno` para uma conta com caderno:

```
{
  conta: { usuario, nome, cargo },
  caderno: Arvore,
  compartilhadas: [{ dono: { usuario, nome }, caderno: Arvore }],
  fixadas: [{ id, titulo, dono: { usuario, nome } }],
  etiquetas: [{ nome, quantas }],          // das notas que a conta pode ler
  imagens: { usado, limite },              // em bytes, do caderno dela
  contas: [{ usuario, nome }]              // para o Compartilhar: as outras contas, sem o administrador
}
```

Para o administrador: `{ conta, cadernos: [{ usuario, nome, notas }] }`, com todas as contas que não são administrador e quantas notas cada uma tem.

`GET /api/caderno/notas/:id`:

```
{
  nota: {
    id, titulo, texto, pasta, versao, criadaEm, alteradaEm,
    alteradaPor: { usuario, nome } ou null,
    dono: { usuario, nome },
    nivel: "dona" | "editar" | "ver" | "admin",
    compartilhada, link: { endereco } ou null           // os dois só para a dona
  },
  caminho: [{ id, nome }],                              // as pastas acima, da raiz para dentro, só as que a conta vê
  links: { "personagem:<id>": { nome }, "evento:<id>": { titulo }, "mesa:<id>": { nome },
           "memoria:<id>": { titulo }, "lugar:<mapa>/<marca>": { nome, mapa }, "nota:<id>": { titulo } },
  embutidas: { "<id>": { titulo, texto, dono: { usuario, nome } } },
  imagens: { "<id>": "/api/caderno/imagens/<arquivo>" },
  citadaEm: [{ id, titulo, dono: { usuario, nome } }]
}
```

`links` e `imagens` incluem os das embutidas.

A rota pública devolve `{ nota: { id, titulo, texto, alteradaEm, dono: { nome } }, links, embutidas, imagens }`, com as regras do link público:

- o link de nota pode vir com `publico: "/ler/#<token>"`, a leitura pública dela;
- as imagens da nota do link e das embutidas com link público apontam para `/api/caderno/publico/<token>/imagens/<arquivo>`;
- as de uma embutida que a pessoa logada pode ler apontam para a rota de sempre.

O conflito (409) responde `{ erro: "Esta nota mudou enquanto você escrevia.", codigo: "conflito", nota: { titulo, texto, versao, alteradaEm, alteradaPor } }`.

A busca: `q` com pelo menos 2 caracteres, sem diferença de maiúsculas e acentos, no título e no texto (os links contam pelo que aparece). Começando com `#`, busca a etiqueta. Responde `{ resultados: [{ id, titulo, dono: { usuario, nome }, caminho, trecho }] }`, até 50, primeiro os achados no título e depois os mais recentes. O `trecho` tem uns 120 caracteres em volta do primeiro achado, sem as marcas.

Os citáveis: `{ notas: [{ id, titulo, caminho, dono: { usuario, nome } }], personagens: [{ id, nome }], acontecimentos: [{ id, titulo, ano }], mesas: [{ id, nome }], memorias: [{ id, titulo }], lugares: [{ id: "<mapa>/<marca>", nome, mapa }] }`, só com o que a conta vê. As notas são as do caderno dela e as compartilhadas com ela.

## A página (`publico/caderno/`)

Esqueleto de `linha-do-tempo/index.html`, com `<body class="com-barra" data-pagina="caderno" data-raiz="../">`, `iniciarCinzas(30)`, modo prévia e o painel `#simulacao`. Carrega `../style.css`, `../marcas.css` e `caderno.css`; e os scripts `../comum.js`, `../marcas.js` e `caderno.js`, com `defer`.

### O desenho e a leitura (sessão 10.3)

**Duas colunas.** À esquerda fica a lateral do caderno (cerca de 19rem, presa à altura da tela, com rolagem própria); à direita, a nota aberta.

**A lateral**, de cima para baixo:

- o título "Caderno de <nome>", em Grenze Gotisch. Para o administrador, "Cadernos" e uma lista de escolha "Caderno de: …" (a última escolhida fica guardada no navegador);
- os botões "+ Nota", "+ Pasta" e "Nota de hoje" (só quem tem caderno) e o campo da busca;
- **Fixadas**, se houver;
- a árvore do caderno;
- uma seção **"Compartilhadas por <nome>"** para cada conta que compartilhou algo, em ordem de nome;
- **Etiquetas**, recolhida, com as plaquinhas e quantas notas tem cada uma;
- no pé, só para a dona, "Imagens: 120 MB de 1 GB".

**A árvore:**

- pastas primeiro, depois as notas, em ordem de nome, com números em ordem natural (`localeCompare` com `numeric: true`);
- a pasta abre e fecha com um clique; as pastas abertas ficam guardadas no navegador (`localStorage`, com `try/catch`);
- a nota aberta fica marcada com a brasa;
- ícones pequenos: pessoas (compartilhada com contas) e elo (link público), só para a dona; olho ou lápis nas compartilhadas, conforme "ver" ou "editar";
- no teclado: `role="tree"` e `treeitem`; as setas andam, → abre a pasta, ← fecha, Enter abre a nota.

**A nota aberta:**

- no alto, o caminho das pastas, em letra pequena; nas compartilhadas, também "Do caderno de <nome>";
- o título, em Grenze Gotisch;
- uma linha pequena: "Alterada em 2 de novembro de 2026, 14:30", com "por Takezo" quando quem mudou não foi a dona;
- a barra da nota: "Editar" (quem pode alterar), "Compartilhar" (a dona) e o menu "⋯";
- o texto com as marcas (`marcas.js`), com as imagens, os links e as notas embutidas;
- "Citada em", quando houver.

**O endereço.** Cada nota tem o endereço `#nota-<id>`. Abrir uma nota põe esse endereço com `history.pushState`, para o "voltar" do navegador voltar à nota anterior; o `popstate` abre a nota do endereço. Abrir a página com `#nota-<id>` abre a nota; para o administrador, também escolhe o caderno dela. Nota que a conta não pode ler: "Essa nota não existe ou não foi compartilhada com você."

**Sem nota aberta:** um texto curto no meio ("Escolha uma nota ou comece uma nova.") com "+ Nota" e "Nota de hoje".

**Compartilhadas por:** as seções da lateral, com o olho ou o lápis em cada item. A nota abre na mesma área, com "Do caderno de <nome>" no alto, e o que aparece segue a tabela "O que cada um pode".

**O administrador:**

- o título "Cadernos" e a escolha da conta, com quantas notas cada uma tem;
- a árvore e as notas da conta escolhida, só para ler: sem "Editar", sem botões de criar, sem "⋯" (menos Baixar .md e Copiar link), sem Fixadas e sem Nota de hoje;
- a busca e as etiquetas valem para o caderno escolhido;
- sem a seção "Compartilhadas por" (ele já vê tudo) e sem o pé com o espaço das imagens.

**O visual ("Cinza e centelha"):**

- a nota numa folha escura (fuligem), com a borda de ferro, como a ficha dos Personagens;
- o texto em Alegreya; o título de nível 1 em Grenze Gotisch; os de nível 2 e 3 em Alegreya, com versalete;
- a citação com um filete de ferro à esquerda e em itálico;
- a tabela com linhas finas de ferro;
- as plaquinhas das etiquetas em ferro;
- a moldura da nota embutida em ferro mais claro;
- as caixinhas das tarefas no estilo das caixas do portal;
- a brasa só na nota marcada na árvore e no botão principal.

### Edição (sessão 10.4)

**Ler e editar.** A nota abre para ler. "Editar" (ou Ctrl+E) troca a leitura pela edição, no mesmo lugar:

- o título num campo de texto;
- a barra de botões;
- uma área de texto grande, com as marcas à mostra, que cresce com o texto.

"Ler" (ou Ctrl+E de novo) volta para a leitura, já com o que foi escrito. Uma nota nova abre na edição, com o título selecionado.

**A barra de botões:**

- **Negrito** (Ctrl+B), **Itálico** (Ctrl+I) e **Riscado**: envolvem o que está selecionado, ou põem as marcas e o cursor no meio;
- **Título**: um menu com "Título 1", "Título 2", "Título 3" e "Texto", que troca o começo das linhas selecionadas;
- **Lista**, **Lista numerada**, **Tarefa** e **Citação**: põem ou tiram a marca no começo das linhas selecionadas;
- **Tabela**: põe uma tabela pequena para preencher (cabeçalho e duas linhas, duas colunas);
- **Separador**: põe `---` numa linha só dele;
- **Imagem**: escolhe arquivos, um ou vários;
- **Link**: abre o Citar;
- **Embutir nota**: abre o Citar só com as notas.

Cada botão tem `title` e `aria-label`. Use `document.execCommand("insertText")` quando o navegador aceitar, para o Ctrl+Z desfazer o que os botões fizeram; senão, `setRangeText`.

**Enter numa lista** continua a lista com a mesma marca ("- ", o próximo número, "- [ ] "). Enter num item vazio termina a lista.

**Salvar sozinho:**

- quando:
  - 1,5 segundo depois da última mudança, e no máximo a cada 10 segundos enquanto se escreve sem parar;
  - ao trocar de nota e ao voltar para a leitura.
- ao lado do título, "Salvando…", "Salvo" ou "Não salvou: <motivo>. Tentando de novo…". Tenta de novo até 3 vezes; depois mostra o erro e deixa o texto na tela.
- com mudança por salvar, fechar a página pede confirmação (`beforeunload`).
- se a nota foi apagada por outra pessoa (404): "Esta nota não existe mais." O texto fica na tela, para copiar.

**Conflito.** Se outra pessoa salvou a nota enquanto você escrevia (409), um diálogo:

- "Esta nota mudou enquanto você escrevia (Takezo, às 14:32).";
- "Usar a versão nova" troca o texto pelo novo;
- "Manter a minha" salva a sua por cima, com a versão nova.

**Citar e `[[`.** O diálogo de busca das Memórias, com os grupos Notas, Personagens, Acontecimentos, Mesas, Memórias e Lugares, vindos de `citaveis`.

- A busca é sem acentos e sem diferença de maiúsculas.
- As notas mostram o caminho e, nas compartilhadas, de quem são.
- Escolher um item põe `[[tipo:<id>|nome ou título]]` onde estava o cursor.
- Digitar `[[` na área de texto abre o Citar. Digitar `![[` o abre só com as notas, para embutir. Escolher troca o `[[` ou `![[` pelo link inteiro; Esc fecha e deixa o que foi digitado.
- Um colchete no nome vira parêntese, como nas Memórias.

**Imagens:**

- entram pelo botão Imagem, por colar (Ctrl+V com imagem na área de transferência) e por arrastar o arquivo para a área de texto;
- cada uma é enviada e entra onde estava o cursor; enquanto isso, o aviso "Enviando imagem…";
- uma falha (tipo, tamanho, espaço) vai para `avisarFalha`.

**Tarefas na leitura.** Quem pode alterar marca e desmarca a caixinha ali mesmo. A página troca `[ ]` por `[x]` na linha da tarefa e salva, com a versão. Para os outros, a caixinha fica só para ver.

**A árvore:**

- "+ Nota" e "+ Pasta" criam dentro da pasta escolhida na árvore (ou da pasta da nota aberta), ou na raiz;
- nas pastas compartilhadas para editar, o menu do item tem "Nova nota aqui" e "Nova pasta aqui";
- cada item tem um botão "⋯" com: Renomear, Mover para…, Compartilhar…, Fixar ou Desafixar (notas), Baixar .md (notas), Copiar link (notas) e Apagar. Cada opção aparece só para quem pode;
- **Renomear** é ali mesmo, na árvore: Enter salva, Esc desiste. F2 renomeia o item com o foco;
- **Arrastar** (computador, só a dona): solta uma nota ou pasta numa pasta, ou no título do caderno para ir à raiz. A pasta de destino fica marcada enquanto se arrasta. Não deixa pôr uma pasta dentro dela mesma nem passar dos 8 níveis;
- **Mover para…**: um diálogo com as pastas para escolher. Serve no teclado e no celular;
- **Apagar**: confirma com `perguntar()`. Na pasta: "A pasta "Sessões" e as 12 notas dentro dela saem de vez."

**Fixar:**

- as notas fixadas aparecem em "Fixadas", no alto da lateral, na ordem em que foram fixadas;
- valem notas do caderno e compartilhadas; nas compartilhadas, com o nome de quem compartilhou.

**Nota de hoje:**

- abre a nota com a data de hoje no título, no formato `AAAA-MM-DD` (para ficarem em ordem). A data é a do navegador, no calendário de verdade;
- a nota fica na pasta **"Diário"**, na raiz do caderno, achada pelo nome sem diferença de maiúsculas e acentos e criada se não existir;
- se a nota do dia não existir, ela nasce vazia e abre na edição.

**Baixar .md:**

- baixa o texto como foi escrito, com estas trocas:
  - `[[tipo:<id>|texto]]` e `![[nota:<id>|texto]]` viram só `texto`;
  - a imagem vira `![legenda](<endereço completo da imagem no portal>)` (o endereço só abre para quem pode ler a nota);
- o arquivo tem o título como nome (sem os caracteres que o Windows não aceita) e `.md` no fim, em UTF-8.

**Copiar link:** copia o endereço da página com `#nota-<id>` (no portal, `https://cronicaseternas.com/caderno/#nota-<id>`), com o aviso "Link copiado. Quem pode ler a nota abre direto nela."

### Compartilhar e busca (sessão 10.5)

**O diálogo Compartilhar** (da dona, pela barra da nota ou pelo menu "⋯"):

- **Contas:** cada conta que não é a dona nem administrador, com a escolha "Não", "Ver" ou "Editar". A ajuda: "Quem pode ver só lê. Quem pode editar muda o texto, o título e as imagens, e cria notas dentro da pasta. Mover, apagar e compartilhar ficam com você."
- Numa pasta, também: "Tudo o que está na pasta, e o que for criado nela depois, fica compartilhado."
- **Link público** (só na nota): um botão para ligar. Ligado, mostra:
  - o endereço num campo só para ler, com "Copiar";
  - "Gerar outro link", que pede confirmação ("O link antigo para de funcionar.");
  - "Desligar".

  A ajuda: "Qualquer pessoa com o link lê esta nota, mesmo sem conta no portal. Ninguém altera por ele."
- "Salvar" grava as contas. O link público liga e desliga na hora.

**Busca e etiquetas:**

- digitar na busca (a partir de 2 caracteres, esperando 300 ms) troca a árvore pelos resultados;
- cada resultado mostra o título, onde a nota está (o caminho e, nas compartilhadas, de quem é) e o trecho, com o achado destacado (montado com `criar()`);
- um "×" no campo volta para a árvore;
- clicar numa etiqueta (na nota ou na lista de Etiquetas) põe `#etiqueta` na busca.

### Celular (até 760 px)

- Uma coluna. A lateral ocupa a tela. Abrir uma nota mostra só a nota, com "‹ Caderno" no alto para voltar; o "voltar" do navegador também volta.
- A barra de botões da edição rola de lado.
- Sem arrastar: mover pelo "Mover para…".
- Sem rolagem lateral da página.

### Prévia

`criarApiDePrevia()` com os mesmos nomes do `apiDoServidor` e as mesmas regras, guardando tudo só na memória do navegador. As imagens da prévia são desenhos SVG em `data:`; a imagem enviada vira `URL.createObjectURL`. "Ver a página como": Neia (jogadora), Takezo (editor) ou Mestre (administrador), e "Restaurar os exemplos".

Exemplos, curtos e neutros:

- **Caderno de Neia:**
  - "Guia das marcas", na raiz e fixada: todas as marcas, cada uma com uma linha explicando. Tem títulos, listas com item dentro de item, tarefas, citação, tabela, separador, imagem com legenda, etiquetas, um endereço da web e links de cada tipo (um para um NPC oculto, para mostrar o texto sem link para quem não é administrador), e uma nota embutida;
  - a pasta "Sessões", com duas notas que se citam ("Citada em") e a etiqueta `#pistas`. Uma delas está compartilhada com Takezo para editar;
  - a pasta "Diário", com duas notas de dias;
  - a pasta "Personagens", compartilhada com Frati para ver;
  - uma nota com link público.
- **Caderno de Takezo:** a pasta "Teorias", compartilhada com Neia para editar, com duas notas; e uma nota compartilhada com Neia para ver.
- Na prévia, os personagens, acontecimentos, mesas, memórias e lugares dos links são poucos exemplos com os nomes das outras prévias.

## A leitura pública (`publico/ler/`, sessão 10.5)

- `index.html`, `ler.js` e `ler.css`, com `<body data-pagina="ler" data-raiz="../">`, **sem** a barra lateral, a conta e o status do Foundry. No alto, só "Crônicas Eternas", com link para o portal.
- Carrega `../style.css`, `../marcas.css` e `ler.css`; `../comum.js`, `../marcas.js` e `ler.js`. No `<head>`, `<meta name="robots" content="noindex">`.
- Lê o token do endereço (`#<token>`) e pede `GET /api/caderno/publico/<token>`. Mostra:
  - o título da nota;
  - "Do caderno de <nome>" e "Alterada em <data>";
  - o texto com as marcas, as imagens e as embutidas que vierem.
- O título da aba do navegador é o título da nota.
- Link desligado ou errado: "Este link não está mais ativo.", com o link para o portal.
- **Sem login não manda para a entrada.** Ao carregar, o `comum.js` chama `atualizarBarra()`; mude essa função para não pedir `/api/barra` quando a página não tem `.barra-lateral`, para a leitura pública não gerar um pedido negado.
- Na prévia (fora do servidor), mostra a nota "Guia das marcas" de exemplo.

## Na galeria de Personagens (sessão 10.5)

O link de mesa abre `../personagens/#mesa-<id>`. No `iniciar()` do `personagens.js`, um endereço `#mesa-<id>` de uma mesa que existe liga o filtro daquela mesa (`estado.filtros.mesas`) antes de desenhar a galeria. Uma mesa que não existe é ignorada.

## No CLAUDE.md (sessão 10.5)

- Em "Sem login, nenhuma página abre", a exceção: a leitura pública de uma nota do Caderno (`/ler/#<token>`), que abre com o link.
- Em "Cargos": toda conta que não é administrador tem um Caderno; o administrador lê todos e não altera.
- Em "Onde roda": os cadernos ficam em `/var/lib/portal/cadernos/`, fora do `dados.json`.

## Fora desta versão

- lixeira e histórico de versões da nota;
- duas pessoas escrevendo ao mesmo tempo com o texto da outra aparecendo na hora;
- grafo das notas;
- modelos de nota;
- links pelo nome (`[[Nome da nota]]`);
- importar .md ou uma pasta do Obsidian;
- link público de pasta;
- comentários;
- embutir só um trecho de uma nota;
- tamanho da imagem no texto.

## Sessões

- **10.1 Servidor, notas e pastas:** `servidor/caderno.js`, registrado em `PAGINAS` do `servidor.js`. Inclui:
  - a pasta `cadernos/`, ler e gravar, os ids, os limites e o caderno corrompido;
  - notas e pastas: criar, ler, alterar com `versao` e conflito, mover, apagar;
  - quem pode o quê;
  - compartilhar com contas e as "Compartilhadas por";
  - as fixadas;
  - a visão do administrador;
  - os ganchos de conta;
  - `GET /api/caderno` e `GET /api/caderno/contas/:usuario`.

  Os links e as imagens ficam para a 10.2: na 10.1, `links`, `embutidas`, `imagens`, `citadaEm` e as `etiquetas` vêm vazios, já no formato certo. Testar com o servidor e `curl`:
  - duas contas compartilhando "ver" e "editar", numa pasta e numa nota, com o que é criado na pasta depois;
  - quem pode editar não apaga nem move;
  - o administrador lê e não muda nada;
  - o conflito (409);
  - os limites;
  - renomear e excluir conta;
  - um `caderno.json` corrompido não é regravado.
- **10.2 Servidor, links, imagens e link público:**
  - as imagens: envio, espaço, rota protegida e limpeza das órfãs;
  - os links de cada tipo (exporte `podeLer` do `memorias.js` e uma função do `mapas.js` que diga se a conta vê um lugar);
  - as embutidas, "Citada em", as etiquetas, a busca e os citáveis;
  - o link público, com as rotas antes da sessão no `servidor.js`.

  Testar com `curl`:
  - a imagem para a dona, para a conta compartilhada, para outra conta (404) e para o administrador;
  - o espaço cheio;
  - a órfã (mudando o `orfaDesde` à mão);
  - links com alvo oculto e as embutidas;
  - a busca por texto e por etiqueta;
  - o link público sem cookie: a nota, a imagem, o link desligado e o gerado de novo.
- **10.3 Página, desenho e leitura:** use o modo de planejamento. Inclui:
  - `publico/marcas.js` e `publico/marcas.css`, com todas as marcas;
  - a pasta `publico/caderno/` com as duas colunas e a lateral inteira: a árvore, as Fixadas, as "Compartilhadas por", as Etiquetas (a busca por elas fica para a 10.5) e a escolha da conta do administrador, tudo só para mostrar e navegar;
  - a nota em leitura, com os links, as embutidas, as imagens e "Citada em";
  - o endereço `#nota-<id>` e o celular;
  - a entrada em `PAGINAS`, ainda com `pronta: false`;
  - a prévia com os exemplos.
- **10.4 Página, edição:** use o modo de planejamento. Inclui:
  - Editar e Ler, a barra de botões e os atalhos;
  - Enter nas listas, salvar sozinho e o conflito;
  - as imagens (botão, colar e arrastar);
  - o Citar com `[[` e `![[`;
  - as tarefas na leitura;
  - a árvore: criar, renomear, arrastar, "Mover para…" e apagar;
  - Fixar, Nota de hoje, Baixar .md e Copiar link.
- **10.5 Página, compartilhar, busca e leitura pública:**
  - o diálogo Compartilhar;
  - a busca e o clique nas etiquetas;
  - `publico/ler/` e o ajuste do `atualizarBarra()` no `comum.js`;
  - o `#mesa-` na galeria de Personagens;
  - o `CLAUDE.md`;
  - `pronta: true`.
