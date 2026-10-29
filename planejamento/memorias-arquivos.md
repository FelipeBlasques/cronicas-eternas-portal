# Memórias de Draevor: importar .md e baixar PDF

Duas coisas novas na página Memórias: o administrador **importa** o texto de um arquivo `.md` (no Livro, um arquivo por capítulo), e quem pode ler uma memória **baixa** ela em PDF (no Livro, um capítulo por vez). Decisões fechadas em 29/10/2026. Duas sessões: 8.1 importar e 8.2 PDF (veja "Sessões" no fim). O resto da página continua como em `memorias.md`.

## Os limites de hoje

O Fe aumentou os limites à mão: o texto de uma memória e cada capítulo vão até **100.000** caracteres, e o livro inteiro até **1.000.000** (`LIMITES` em `servidor/memorias.js`, `maxlength` no `index.html` e `area.maxLength` no `memorias.js`). Esses valores ficam.

Falta acompanhar o tamanho do envio: `LIMITE_JSON` (1 MB) não cabe um livro de 1.000.000 de caracteres com acentos. Na sessão 8.1, ele passa a **4 MB**. O nginx aceita até 32 MB, então não muda nada lá.

## 1. Importar .md (sessão 8.1)

Só o administrador, no formulário de escrever e alterar (só ele vê esse formulário). Tudo acontece no navegador: o arquivo é lido ali mesmo, convertido para o texto do portal e posto no formulário. Nada vai para o servidor até ele clicar em "Escrever" ou "Salvar", então dá para revisar antes.

### Onde ficam os botões

- **Memórias que não são Livro:** um botão leve "Importar .md", ao lado do "Citar", acima da área do texto.
- **Livro, em cada capítulo:** o mesmo "Importar .md" ao lado do "Citar" do capítulo. Ele preenche aquele capítulo.
- **Livro, vários de uma vez:** junto do "+ Capítulo", um botão "Importar capítulos (.md)" que aceita vários arquivos. Cada arquivo vira um capítulo novo, no fim da lista, na ordem dos nomes dos arquivos, com números em ordem natural ("2" antes de "10"; use `localeCompare` com `numeric: true`). Se o livro só tinha um capítulo vazio, ele dá lugar aos importados.

Cada botão abre um `<input type="file" accept=".md,.markdown,.txt,text/markdown,text/plain">` escondido. Funciona também na prévia.

### O que entra

- **No texto (ou no texto do capítulo):** o conteúdo convertido. Se já havia texto, pergunta antes com `perguntar()`: "Trocar o texto atual pelo do arquivo?". Na resposta "Não", nada muda.
- **No título:** se o arquivo começa com um título (`# Título` ou `## Título`), esse título sai do texto e vai para o título da memória (ou do capítulo), **só se o título ainda estiver vazio**. Sem título no arquivo, um capítulo vazio recebe o nome do arquivo sem a extensão e sem a numeração do começo ("03 - O cerco.md" vira "O cerco"; vale para "03 - ", "03_", "03. " e "3) ").
- Depois de importar, um `avisoRapido`: "Texto importado de <nome do arquivo>." (ou "3 capítulos importados.").

### Quando não importa

Nenhum desses casos muda nada no formulário, e cada um mostra a falha com `avisarFalha`:

- arquivo maior que 5 MB;
- texto convertido acima do limite (100.000 caracteres por texto): "O arquivo <nome> tem <n> caracteres; o limite é 100.000.";
- no Livro, passar de 80 capítulos ou de 1.000.000 de caracteres no total;
- arquivo vazio depois da conversão.

Na importação de vários arquivos, ou entram todos ou nenhum.

### A codificação

Leia como UTF-8, sem o BOM do começo. Se o resultado tiver o caractere de substituição (`�`), leia de novo como `windows-1252` (o Word às vezes salva assim) e use esse.

### A conversão (Markdown → texto do portal)

O texto do portal só conhece: `**negrito**`, `*itálico*`, linha em branco entre parágrafos, listas com "- " ou "1. ", e os links `[[evento:...|...]]` e `[[personagem:...|...]]`. A conversão leva o .md para isso, sem perder palavras. Os .md vêm do **Word ou do Google Docs exportado**, então:

| No .md | Vira |
| --- | --- |
| Linhas quebradas no meio de um parágrafo | **uma linha só** (as linhas se juntam com um espaço) |
| Quebra forçada (dois espaços ou `\` no fim da linha, ou `<br>`) | quebra de linha |
| Linha em branco (uma ou várias) | uma linha em branco, que separa parágrafos |
| **Poema ou canção** | aqui **toda** quebra de linha fica, porque cada linha é um verso |
| `# Título` a `###### Título` no meio do texto | um parágrafo em negrito (`**Título**`) |
| `**x**` ou `__x__` | `**x**` |
| `*x*` ou `_x_` (o `_` só quando cerca uma palavra inteira, não dentro de `nome_composto`) | `*x*` |
| `***x***` ou `___x___` | `**x**` |
| `~~x~~` (riscado) e `` `x` `` (código) | só `x` |
| `[texto](endereço)` e `[texto][ref]` | só `texto` |
| `![descrição](imagem)` e `![][image1]` | saem |
| Linhas de referência no fim (`[image1]: <data:...>`, `[ref]: endereço`) | saem |
| `<http://...>` | só o endereço |
| `- x`, `* x`, `+ x` (também com recuo, de listas dentro de listas) | `- x` |
| `1. x` ou `1) x` | `1. x` |
| Itens de lista seguidos | cada item na sua linha (não se juntam), e a lista fica num bloco só dela, com linha em branco antes e depois: o `paragrafosDe` só monta a lista se todas as linhas do bloco forem itens |
| `> x` (citação) | só `x` |
| `---`, `***` ou `___` sozinhos na linha | um parágrafo `⁂` (separador de cena) |
| Tabela | cada linha vira uma linha de texto, com as células separadas por " · "; a linha de traços sai |
| Outras marcas HTML (`<span>`, `<u>`...) | saem, o texto dentro fica |
| Escapes `\*`, `\_`, `\#`, `\-`, `\.`, `\[`, `\]` e os outros | o caractere sem a barra |
| `[[evento:id\|texto]]` e `[[personagem:id\|texto]]` | ficam como estão |
| Espaços repetidos e espaços no fim da linha | um espaço só; no fim, saem |
| Bloco de código (```` ``` ````) | o texto de dentro, como parágrafo |

A conversão é uma função só, `textoDoMarkdown(md, { versos })`, no `memorias.js`, sem bibliotecas. `versos` é true no Poema ou canção.

Para testar, há um arquivo de exemplo em `planejamento/referencias/exemplo-google-docs.md`, com o que o Google Docs costuma gerar (títulos, escapes, listas, imagem por referência, link, separador, tabela, linhas quebradas). O texto que a conversão precisa gerar está em `exemplo-google-docs.esperado.txt`, na mesma pasta, igual caractere por caractere; o título esperado é "Carta deixada na hospedaria".

## 2. Baixar PDF (sessão 8.2)

### Quem e onde

- **Quem pode ler a memória pode baixar.** O botão "Baixar PDF" fica na barra da leitura, ao lado do "Copiar link".
- **No Livro:** o botão aparece só na leitura de um **capítulo**, e baixa só aquele capítulo. Na capa e no índice não aparece.

### Como funciona

Sem bibliotecas, o PDF sai da **impressão do navegador**. O botão:

1. muda o título da aba para o nome do arquivo. Pode ser "Carta ao ferreiro" ou, num capítulo, "Crônica dos Sete Invernos - Capítulo 2 - O cerco". O navegador usa esse título como nome do PDF;
2. espera as fontes carregarem (`await document.fonts.ready`);
3. chama `window.print()`;
4. volta o título da aba quando a impressão termina (evento `afterprint`).

Na primeira vez, um `avisoRapido` explica: "Na janela que abrir, escolha Salvar como PDF." Use `localStorage` com `try/catch` para lembrar que o aviso já foi mostrado.

### O que sai no PDF: a cara da classificação

A impressão mostra **só a memória aberta**, com a mesma cara da leitura na tela. Tudo vai num `@media print` no `memorias.css`.

- **Some tudo o que não é a memória:** topo, barra lateral, cinzas do fundo, barra da leitura, painel da prévia, avisos e diálogos.
- **Folha A4 em pé** (`@page { size: A4; margin: 0 }`). Com a margem 0, o navegador não põe o cabeçalho e o rodapé dele (endereço, data). As margens ficam dentro da folha e se repetem em cada página (`box-decoration-break: clone`, com o prefixo `-webkit-`).
- **As cores e os fundos saem impressos** (`print-color-adjust: exact`, com o prefixo `-webkit-`).
- **O papel é a página.** A folha da classificação ocupa a página inteira, sem o fundo escuro do portal em volta e sem inclinação. A sombra também some. Nos textos longos, o papel continua nas páginas seguintes.
- **A classificação e a data** (a linha pequena acima da folha) vão para dentro do papel, no alto, em letra pequena.
- **Os links** saem como texto comum, sem sublinhado e sem endereço.
- **O que depende da altura da folha** (as dobras da carta, o número de página do trecho, o lacre no pé) fica só na **última** página, no fim do texto. As linhas do caderno do diário se repetem em todas as páginas, alinhadas com o texto.
- **Nada corta mal:** título nunca fica sozinho no fim de uma página (`break-after: avoid`), estrofe e item de lista não se partem (`break-inside: avoid`), e um parágrafo deixa pelo menos 2 linhas de cada lado da quebra (`orphans` e `widows`).

Por classificação:

| Classificação | No PDF |
| --- | --- |
| Carta, Diário, Trecho de livro, Poema, Documento | o papel da classificação na página inteira, com as fontes, a assinatura, o selo e o cabeçalho de sempre |
| Recorte | o papel de jornal na página inteira. As bordas irregulares ficam só nas laterais da primeira página; as duas colunas continuam |
| Conto e capítulo de livro | página de livro, com a capitular; no capítulo, "Capítulo n" e o título no alto e, no pé da última página, o nome do livro em versalete pequeno |
| Inscrição | página cinza-escura com a pedra centralizada no alto e o "Onde está gravada" abaixo dela, como na tela |

### Onde funciona

- **No computador** (Chrome, Edge, Firefox) e no **app dos jogadores** no Windows: abre a janela de impressão com "Salvar como PDF".
- **No celular:** o botão abre a impressão do sistema; no Android há "Salvar como PDF". No iPhone, salva-se pelo compartilhar.

A sessão não tem como conferir o PDF. Quem confere é o Fe, imprimindo na prévia e no app.

## Fora desta versão

Exportar .md; exportar o livro inteiro num PDF só; importar imagens do .md.

## Sessões

- **8.1 Importar .md:** a parte 1 inteira (botões, conversão, codificação, limites, título e nome do arquivo, vários capítulos) e o `LIMITE_JSON` de 4 MB em `servidor/memorias.js`. Testar a conversão com `node` em cima de `planejamento/referencias/exemplo-google-docs.md`, comparando com o resultado esperado. Testar também o envio de um livro grande com `curl`.
- **8.2 Baixar PDF:** a parte 2 inteira: o botão, o título do arquivo, o aviso, e o `@media print` com a cara de cada classificação. Use o modo de planejamento.
