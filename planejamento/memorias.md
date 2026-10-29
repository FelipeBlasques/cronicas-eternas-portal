# Memórias de Draevor

Uma página com os textos do cenário: cartas, contos, recortes, trechos de livros, livros inteiros e outros escritos que os personagens encontram em Draevor. Só o administrador escreve. Toda memória nasce **escondida** e só aparece para quem o administrador revelar. Sem login, a página manda para a entrada. Decisões fechadas em 24/10/2026.

> **Depois:** importar .md, baixar PDF e os limites de hoje (100.000 por texto, 1.000.000 no livro) estão em `memorias-arquivos.md`.

Sessões: 7.1 servidor · 7.2 lista e leitura · 7.3 a cara de cada classificação · 7.4 edição, revelar e acender o botão (veja "Sessões" no fim).

## Na barra lateral

Uma entrada nova na lista `PAGINAS` do `comum.js`, entre Mapas e Regras:

```js
{
  id: "memorias",
  nome: "Memórias de Draevor",
  curto: "Memórias",
  caminho: "memorias/",
  pronta: false, // true só na sessão 7.4
  icone: "M2.5 21.5h12M4 21.5c0-3 1.6-4.5 4.5-4.5s4.5 1.5 4.5 4.5M7 17v-2h3v2M8.5 15 14 9.5M14 9.5c1-4 4-6.5 7.5-7-.5 3.5-3 6.5-7 7.5ZM16.5 7.5l-1.5 1.5", // pena e tinteiro
},
```

Sem número aceso na barra: revelar uma memória não acende nada.

## A memória

| Campo | O que é |
| --- | --- |
| `id` | `mem-` mais 8 caracteres hexadecimais |
| `titulo` | até 120, obrigatório. É o que aparece na lista |
| `tipo` | a classificação, da lista fixa abaixo |
| `data` | opcional. No Ciclo de Sylara, no formato e com as regras da Linha do Tempo (`{ ano, mes, dia, aprox }`, só o ano obrigatório, de 0 ao ano atual). Use `lerDataDaLinha` e `dataPublica` do `servidor/linha.js` |
| `detalhe` | opcional, até 120. Um campo a mais que só alguns tipos têm (veja a tabela abaixo); nos outros fica vazio |
| `texto` | até 40.000. Em todos os tipos menos o Livro |
| `capitulos` | só no Livro: de 1 a 80 capítulos `{ titulo, texto }`, título até 120 (obrigatório) e texto até 40.000. O livro inteiro, até 400.000 |
| `revelacao` | `{ todos: data ISO ou null, contas: { usuario: data ISO } }`. Veja "Revelar" |
| `criadoEm`, `alteradoEm` | datas ISO |

Ficam em `dados.memorias`, no mesmo `dados.json`. Limite: 500 memórias.

Não há narrador, imagem, mesas nem personagens citados como campos. O texto pode **mencionar** acontecimentos e personagens com links (veja "Links no texto").

### As classificações (lista fixa)

| `tipo` | Nome na página | Campo `detalhe` |
| --- | --- | --- |
| `carta` | Carta | "Assinatura" (aparece no fim da carta) |
| `conto` | Conto | não tem |
| `diario` | Diário | não tem |
| `recorte` | Recorte | "Recortado de" (ex.: "Gazeta de Westna") |
| `trecho` | Trecho de livro | "Do livro" (o nome da obra) |
| `livro` | Livro | não tem |
| `poema` | Poema ou canção | não tem |
| `documento` | Documento | "Emitido por" (ex.: "Conselho de Westna") |
| `inscricao` | Inscrição | "Onde está gravada" (ex.: "Lápide no cemitério de Hando") |

### O texto

Como no resto do portal: `**negrito**`, `*itálico*`, linha em branco separa parágrafos, linhas que começam com "- " ou "1. " viram lista. No Poema, cada quebra de linha é um verso e a linha em branco separa estrofes.

### Links no texto

Uma menção é um link escrito assim no texto:

- `[[evento:<id>|o que aparece]]`: leva a `../linha-do-tempo/#evento-<id>`;
- `[[personagem:<id>|o que aparece]]`: leva a `../personagens/#personagem-<id>`.

O que aparece tem até 120 caracteres. O servidor confere, para quem está lendo, quais alvos essa conta pode ver: o acontecimento que ela vê na Linha (`podeVer` do `linha.js`; um selado "revelar depois" não conta) e o personagem que ela vê na galeria (personagens do portal sempre; os outros, se não forem "só o administrador"). Esses alvos vêm junto da memória. Os outros, e os que foram apagados, aparecem **só como texto**, sem link. O texto nunca vira HTML: os links são montados com `criar()`, com o endereço feito pela página a partir do id.

## Quem faz o quê

| Ação | Administrador | Editor e jogador |
| --- | --- | --- |
| Escrever, alterar e apagar memórias | Sim | Não |
| Revelar e esconder | Sim | Não |
| Ver memórias escondidas | Sim | Não |
| Ler uma memória | Todas | Só as reveladas para todos ou para a própria conta |

Para quem não pode ver, a memória escondida **não existe**: ela não aparece na lista, e o link direto dá "Essa memória não existe." (404).

## Revelar

Toda memória nasce escondida (`revelacao: { todos: null, contas: {} }`). O administrador escolhe, a qualquer momento, um destes três:

- **Ninguém:** escondida de novo. `todos` volta a `null` e `contas` fica vazia.
- **Todos:** `todos` recebe a data de agora (ou fica a que já tinha). As datas em `contas` ficam como estão.
- **Algumas contas:** `todos` volta a `null`. Cada conta marcada fica com a data em que foi revelada para ela (a que já tinha, ou a de agora). As desmarcadas saem.

As contas que aparecem para marcar são todas, menos as de administrador, que já veem tudo. Uma conta que não existe dá 400.

**A data de revelação** de uma memória para quem lê é a mais antiga entre `todos` e `contas[usuario]`. É ela que ordena a lista.

Ganchos: `renomearConta` passa a data para o usuário novo; `excluirConta` tira a conta de `contas`.

## Rotas (`servidor/memorias.js`, prefixo `/api/memorias`)

| Rota | Quem | O que faz |
| --- | --- | --- |
| `GET /api/memorias` | qualquer conta | `{ conta: { usuario, nome, cargo }, memorias }`. A lista **sem os textos**, só o que a lista precisa: `{ id, titulo, reveladaEm }`, da revelada mais recentemente para a mais antiga. Para o administrador vêm todas, cada uma com `tipo`, `alteradoEm` e `revelacao: { para: "ninguem" \| "todos" \| "contas", contas: [usuarios] }`: primeiro as escondidas (da alterada mais recentemente para a mais antiga), depois as outras, da revelada mais recentemente. Só para o administrador vêm também `contas` (`[{ usuario, nome }]`, sem administradores) e `citaveis` (`{ acontecimentos: [{ id, titulo, ano }], personagens: [{ id, nome }] }`, para o "Citar" do formulário) |
| `GET /api/memorias/:id` | quem pode ver | `{ memoria: { id, titulo, tipo, data, detalhe, texto ou capitulos, reveladaEm }, links: { "evento:<id>": { titulo }, "personagem:<id>": { nome } } }`, com só os alvos que a conta vê. Para o administrador, a memória traz também a `revelacao` |
| `POST /api/memorias` | admin | JSON com `titulo`, `tipo`, `data`, `detalhe`, `texto` ou `capitulos`. Nasce escondida. Responde 201 com `{ memoria: { id } }` |
| `PUT /api/memorias/:id` | admin | o mesmo JSON. Não mexe na revelação |
| `DELETE /api/memorias/:id` | admin | apaga |
| `PUT /api/memorias/:id/revelacao` | admin | `{ para: "ninguem" }`, `{ para: "todos" }` ou `{ para: "contas", contas: ["neia", "takezo"] }` |

- As rotas de escrita leem o JSON com `lerJson(req, limite)` de 1 MB (o padrão de 64 KB não cabe um livro).
- No Livro vale `capitulos` e o `texto` fica vazio; nos outros, o contrário. O `detalhe` só fica nos tipos que têm o campo.

## A página (`publico/memorias/`)

Esqueleto de `linha-do-tempo/index.html`, com `<body class="com-barra" data-pagina="memorias" data-raiz="../">`, `iniciarCinzas(30)`, modo prévia e o painel `#simulacao` ("Ver a página como" Administrador, Editor ou Jogador, e "Restaurar os exemplos").

### A lista (sessão 7.2)

- No alto, o título **"Memórias de Draevor"** e a frase: "O que ficou escrito em Draevor: cartas, contos, recortes e livros que os personagens encontraram." Para o administrador, o botão "+ Memória" (botão principal, em brasa).
- Abaixo, a lista numa coluna só: **só o nome** de cada memória, na ordem da rota. Passar o mouse destaca o nome. Cada nome é um link para a leitura.
- Para o administrador, cada nome leva também, discreto, o estado: "Escondida" (com o olho riscado, como o "Só o administrador" da galeria) ou "Só para Neia e Takezo". As reveladas para todos não levam nada.
- Lista vazia: para o jogador, "Nenhuma memória foi revelada ainda."; para o administrador, "Nenhuma memória escrita ainda."

### A leitura (sessão 7.2)

- Clicar num nome troca a lista pela leitura, na mesma página, com endereço próprio: `#memoria-<id>`. O título da aba do navegador passa a ser o nome da memória. Abrir o link direto (ou depois de entrar no portal) já mostra a leitura.
- No alto: "← Memórias" (volta para a lista; se a pessoa veio da lista, usa o Voltar do navegador) e "Copiar link". Para o administrador, também "Alterar" e "Revelar…", com o estado atual ao lado.
- Acima do texto, pequeno e em itálico: a classificação e, se houver, a data por extenso (`textoDaData` do `calendario.js`). Ex.: "Carta · 12 de Solcanis de 365 ED".
- Depois, o título e o texto, com os links montados.
- **Livro:** primeiro a capa, com o título, e abaixo dela o índice dos capítulos. Clicar num capítulo abre a leitura dele em `#memoria-<id>-capitulo-<n>` (o n começa em 1), com "Capítulo n" e o título do capítulo no alto, e no fim "← Capítulo anterior", "Índice" e "Próximo capítulo →". Trocar de capítulo volta ao alto da página. Todos os capítulos aparecem de uma vez quando o livro é revelado.
- `Esc` fecha a leitura e volta para a lista.

Na 7.2 a leitura usa uma cara só, simples: o texto numa folha de pergaminho. As caras de cada classificação vêm na 7.3.

### A cara de cada classificação (sessão 7.3)

Cada classificação tem a própria cara, feita **só com CSS** (gradientes, sombras, bordas, `clip-path`) e com as fontes que o portal já tem (`FONTES` e `carregarFontes()` do `comum.js`). Nada de imagens novas. As folhas são claras (papel), com tinta escura, para ler bem em cima do fundo escuro do portal; a pedra da Inscrição é a exceção. O lacre de cera é vermelho-escuro, não a brasa (que continua só para destaque).

| Classificação | A cara |
| --- | --- |
| **Carta** | Uma folha de papel creme, levemente inclinada, com duas marcas de dobra na horizontal. Letra de caligrafia (fonte "caligrafia", Fondamento) em tinta sépia. A data, se houver, no alto à direita. A assinatura (`detalhe`) no fim, à direita, maior, na fonte "pena" (Great Vibes). Um lacre de cera no canto de baixo |
| **Conto** | Uma página de livro limpa, em Alegreya, com a primeira letra em capitular grande (Grenze Gotisch, três linhas de altura). Um ornamento pequeno no fim |
| **Diário** | Um caderno pautado (linhas que acompanham o texto) com a margem vermelha apagada à esquerda e os cantos gastos. Letra de caligrafia. A data, se houver, no alto, sublinhada, como o cabeçalho de uma entrada |
| **Recorte** | Papel de jornal amarelado e acinzentado, com as bordas irregulares de um recorte e levemente torto. No alto, o nome do jornal (`detalhe`) em letra gótica de jornal (fonte "fraktur") com fio duplo embaixo. O título em versalete ("tinta", IM Fell English SC). O texto justificado em duas colunas no computador e uma no celular |
| **Trecho de livro** | Uma página amarelada de livro velho. No alto, o nome da obra (`detalhe`) em versalete pequeno, como cabeçalho corrido. "…" antes do começo e depois do fim do texto. No rodapé, um número de página de mentira (tirado do id, sempre o mesmo para a mesma memória) |
| **Livro** | A capa: couro escuro, com cantos de ferro (os mesmos da moldura dos cards, `--moldura-card`) e o título grande em Grenze Gotisch, cor de pergaminho. Abaixo, o índice num pergaminho. Cada capítulo é lido numa página como a do Conto, com capitular |
| **Poema ou canção** | Um pergaminho com os versos centralizados, em itálico leve. As estrofes separadas por um ornamento pequeno |
| **Documento** | Um papel oficial claro com borda dupla. O título centralizado, em caixa alta (fonte "romana", Cinzel Decorative). A data embaixo do título. O texto justificado. No fim, centralizado, o "Emitido por" (`detalhe`) e um selo de cera |
| **Inscrição** | Uma pedra cinza-escura com as bordas lascadas e textura de pedra. O texto centralizado, em caixa alta espaçada (fonte "romana"), cor de pedra clara, com efeito de letra gravada (sombra clara embaixo e escura em cima). O "Onde está gravada" (`detalhe`) abaixo da pedra, fora dela, em itálico |

Tudo precisa funcionar no celular (390 px de largura, sem rolagem para o lado): as inclinações e as colunas somem ali, e as margens diminuem.

### Edição (sessão 7.4)

Um diálogo de formulário, só do administrador, aberto pelo "+ Memória" ou pelo "Alterar":

- título;
- classificação (uma lista com as nove);
- data opcional (ano, mês e dia em campos simples, mais "aproximada", como o formulário da Linha);
- o campo `detalhe`, com o rótulo da classificação escolhida, e escondido nas que não têm;
- o texto (uma área grande) ou, no Livro, os capítulos: uma lista com título e texto de cada um, "+ Capítulo", "Remover" e as setas para subir e descer;
- o botão **"Citar"**, acima da área do texto (e de cada capítulo): abre uma busca pelos acontecimentos e personagens (`citaveis`), sem acentos e sem diferença de maiúsculas. Escolher um põe `[[evento:<id>|título]]` ou `[[personagem:<id>|nome]]` onde estava o cursor; o "o que aparece" pode ser mudado depois no próprio texto;
- a ajuda de formatação abaixo do texto, como nas outras páginas, explicando também os links.

Trocar a classificação de Livro para outra junta os capítulos num texto só (o título de cada um vira uma linha em negrito); de outra para Livro, o texto vira o capítulo 1, com o título "Capítulo 1". Nada se perde.

"Apagar" fica no formulário, com confirmação por `perguntar()`.

**Revelar…** abre um diálogo pequeno com as três escolhas ("Ninguém, fica escondida", "Todos", "Só algumas contas"). A terceira mostra as contas para marcar. Salvar chama a rota de revelação e recarrega.

Por fim, `pronta: true` para `memorias` na lista `PAGINAS`.

### Prévia

`criarApiDePrevia()` com os mesmos nomes do `apiDoServidor` e as mesmas regras. Exemplos de mentira: uma memória de cada classificação, com textos curtos e neutros (o Livro com três capítulos curtos), algumas com data, uma carta com links para um acontecimento e um personagem (um deles oculto, para mostrar o texto sem link), duas escondidas e uma revelada só para a Neia.

## Fora desta versão

Aviso de memória nova na barra lateral; imagens nas memórias; comentários; revelar capítulo por capítulo.

## Sessões

- **7.1 Servidor:** `servidor/memorias.js` com dados, rotas, revelação, links e ganchos; registrar em `PAGINAS` do `servidor.js`. Testar com o servidor e `curl`: o jogador não vê a escondida nem pelo link; revelar para uma conta; os links de um alvo oculto não vêm; ordem da lista.
- **7.2 Lista e leitura:** a pasta `publico/memorias/`, a entrada em `PAGINAS` do `comum.js` (ainda com `pronta: false`), a lista, a leitura com endereço próprio, os links, o livro com capa, índice e capítulos, e a prévia com os exemplos. A cara simples, de pergaminho.
- **7.3 A cara de cada classificação:** só a parte "A cara de cada classificação", no CSS e no que o `memorias.js` precisar montar (assinatura, lacre, cabeçalho do jornal, número da página, capa). Use o modo de planejamento.
- **7.4 Edição e revelar:** o formulário com "Citar" e os capítulos, apagar, o diálogo de revelar e `pronta: true`.
