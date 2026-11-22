# Memórias: o Livro em PDF

O Livro das Memórias deixa de ser escrito por capítulos no formulário. Agora ele é um **PDF**: o miolo, já diagramado, como vai para a gráfica, mais três imagens opcionais (capa, lombada e contracapa). Na estante, o livro aparece com a lombada enviada. Clicar nele abre o **folheador**: o livro aberto, com as páginas do PDF, e as folhas viram como num AnyFlip. O **índice** fica fora do livro, preso à direita da tela, e o administrador o monta à mão, escolhendo a página e escrevendo o nome do capítulo.

Decisões de 22/11/2026:

- **As páginas:** o pdf.js desenha as páginas no navegador, como segunda exceção à regra de não ter bibliotecas. A outra opção era o servidor converter o PDF em imagens.
- **As imagens:** a capa, a lombada e a contracapa são três imagens separadas, cada uma opcional.
- **Os livros antigos**, escritos por capítulos, continuam legíveis como estão até receberem o PDF. Ninguém escreve capítulos novos.
- **Baixar:** cada livro tem a caixa "Deixar baixar o PDF", que começa desmarcada.

A leitura das outras classificações, a revelação e o resto da página continuam como em `memorias.md`, `memorias-biblioteca.md` e `memorias-arquivos.md`.

Feito direto, fora do roteiro de sessões, no branch `claude/livros-em-pdf`.

## 1. O pdf.js (a segunda exceção)

- **A versão:** `pdfjs-dist` **3.11.174**, os arquivos `build/pdf.min.js` (310 KB) e `build/pdf.worker.min.js` (1,1 MB), copiados sem mudança para `publico/memorias/`. A licença (Apache 2.0), a versão e o sha256 estão em `publico/memorias/LICENCA-pdfjs.txt`.
- **Por que a 3:** é a última com os arquivos clássicos. Da 4 em diante o pdf.js só vem em módulos (`.mjs`), que não abrem na prévia (o arquivo aberto direto no PC).
- **Quando carrega:** só na primeira vez que um livro abre (`carregarPdfJs()`, no `folheador.js`), ou quando o administrador escolhe um PDF no formulário. O resto da página não muda.
- **As opções** (`OPCOES_DO_PDF`):
  - `isEvalSupported: false`, para o pdf.js não montar código com `new Function`. A CSP do portal também não deixa, e é isso que fecha a falha conhecida das versões antigas (CVE-2024-4367);
  - `disableAutoFetch` e `disableStream`: num PDF grande, o pdf.js pede só os pedaços das páginas que vai mostrar (faixas, `Range`).
- **Na prévia:** o worker não abre num arquivo do PC; o pdf.js percebe e roda o worker na própria página, sozinho.
- **A CSP** não muda: o worker vem do mesmo endereço, e as fontes de dentro do PDF entram pelo `FontFace`, que não passa pelo `font-src`.

## 2. Os dados

Todo Livro tem `livro` (o antigo também, vazio até o PDF chegar):

| Campo | O que é |
| --- | --- |
| `miolo` | `{ arquivo, paginas, largura, altura, bytes }` ou `null`. A largura e a altura são as da página 1, em pontos |
| `capa`, `lombada`, `contracapa` | `{ arquivo, largura, altura }` (em pixels) ou `null` |
| `indice` | `[{ pagina, titulo }]`, em ordem de página; até 300 |
| `baixar` | quem pode ler também baixa o PDF |

- **Onde ficam:** os arquivos ficam em `/var/lib/portal/livros/<id da memória>/`, fora do `dados.json`.
  - O nome de cada arquivo é aleatório (`miolo-<16 hex>.pdf`, `capa-<16 hex>.jpg`…) e muda a cada envio.
  - Por isso o navegador guarda os arquivos para sempre (`Cache-Control: private, max-age=31536000, immutable`).
- **Ao ligar,** o portal confere os dados e arruma as pastas: tira a pasta de uma memória que não existe mais e, nas outras, os arquivos que nenhum livro usa (um envio interrompido).
- **Limites:**
  - o PDF até **200 MB** e 5.000 páginas;
  - cada imagem até 10 MB (PNG, JPG, WEBP, GIF ou AVIF);
  - o nome de cada capítulo do índice até 120 caracteres.

## 3. As rotas (`servidor/memorias.js`, com os arquivos no `servidor/livros.js`)

| Rota | Quem | O que faz |
| --- | --- | --- |
| `POST /api/memorias` e `PUT /api/memorias/<id>` | administrador | Como antes. No Livro, do formulário vem só `baixar` (sem texto e sem capítulos). O livro novo nasce sem o PDF |
| `PUT /api/memorias/<id>/livro/miolo?paginas=&largura=&altura=` | administrador | O PDF cru (`Content-Type: application/pdf`). As páginas e o tamanho vêm no endereço: o pdf.js do navegador do administrador leu antes de mandar |
| `PUT /api/memorias/<id>/livro/<capa, lombada ou contracapa>?largura=&altura=` | administrador | A imagem crua (`Content-Type` da imagem), com o tamanho dela em pixels |
| `DELETE /api/memorias/<id>/livro/<capa, lombada ou contracapa>` | administrador | Tira a imagem |
| `PUT /api/memorias/<id>/livro/indice` | administrador | `{ indice: [{ pagina, titulo }] }`, o índice inteiro de uma vez. Fica em ordem de página |
| `GET /api/memorias/<id>/livro/<arquivo>` | quem pode ler | O PDF ou uma imagem, com faixas (`Range`, `206`). Com `?baixar=1`, o PDF para salvar, com o título do livro no nome |

O que essas rotas fazem:

- **O miolo:**
  - o servidor confere o `%PDF-` no começo e para no limite enquanto o arquivo chega (o arquivo vai direto para o disco, sem passar pela memória);
  - com o PDF, um livro antigo deixa os capítulos;
  - o índice perde o que passou da última página;
  - o arquivo antigo sai.
- **Revelar** um livro sem o PDF: 400, "Mande o PDF do miolo antes de revelar o livro." (um livro antigo revela normalmente).
- **Baixar** sem poder: 403. Um arquivo que não é o atual do livro: 404. Um livro escondido continua não existindo (404) para quem não pode ler.
- **Trocar a classificação:**
  - de Livro para outra, o PDF e as imagens saem (a pasta inteira);
  - de outra para Livro, o texto sai.
- **Apagar a memória** apaga a pasta.
- **Na lista** (`GET /api/memorias`), cada Livro leva:
  - o antigo: `capitulos` (quantos);
  - o de PDF: `paginas` (0 sem o PDF), `formato` (`{ largura, altura }` da página) e `lombada` (`{ endereco, largura, altura }` ou `null`).
- **Na leitura** (`GET /api/memorias/<id>`), o Livro leva:
  - `livro`: o miolo com o `endereco`, as três imagens, o índice e o `baixar`;
  - o antigo, também os `capitulos`.

## 4. A estante

- **Com a imagem da lombada:** a lombada é a imagem inteira, na proporção dela. Um livro fino fica fino, de 0,9rem a 7rem de largura. A estante não desenha título, faixas nem ponteiras nele.
- **Sem a imagem:** o couro de hoje, com o título. A largura acompanha as páginas: `2,2rem + 0,0045rem × páginas`, contando até 800.
- **A altura** sai do tamanho da página (`9rem + altura em pontos ÷ 100`, de 13rem a 18rem): um A5 fica com uns 15rem, um A4 com 17,4rem.
- **A etiqueta e o nome do link:** "Livro: <título>, 240 páginas"; o livro antigo continua com "12 capítulos".
- **Para o administrador:**
  - um livro sem o PDF mostra "sem o PDF";
  - o véu e o estado continuam como antes, e a fita de "revelado há pouco" também.

## 5. O folheador (`publico/memorias/folheador.js` e `folheador.css`)

- **O endereço:** clicar no livro abre a leitura em `#memoria-<id>`, na capa. Cada página tem endereço próprio, `#memoria-<id>-pagina-<n>`:
  - virar a folha troca o endereço sem encher o histórico;
  - o "Copiar link" leva à página à vista;
  - abrir o link vai direto nela.
- **A ordem do livro:**
  1. a capa (a imagem enviada, ou o couro com o título e os cantos de ferro);
  2. a guarda (o papel marmorizado do verso da capa);
  3. as páginas do miolo, com a página 1 à direita, como num livro (as ímpares à direita, as pares à esquerda);
  4. a guarda de trás;
  5. a contracapa.

  Fechado, o livro fica no meio da tela, só com a capa (ou só com a contracapa).
- **Duas páginas ou uma:**
  - duas, quando cada uma fica com pelo menos 86% do tamanho que teria sozinha (numa tela deitada, a altura é que manda);
  - uma por vez no celular, na tela em pé e no PDF de página deitada;
  - trocar o tamanho da janela mantém a página à vista.
- **Virar:**
  - clicar na página da direita avança e na da esquerda volta (uma página por vez: o terço da esquerda volta);
  - puxar a página com o mouse ou o dedo vira a folha acompanhando a mão. Ela termina de virar se passar do meio, se for puxada depressa ou por um terço da página; senão, volta;
  - setas, PageUp e PageDown viram; Home vai à capa e End à contracapa;
  - a folha gira em 3D em volta da lombada, com a luz nela e a sombra na página de baixo.
- **Ir longe** (pelo índice, pelo número da página, pela capa ou pela contracapa): vira uma folha só, mais depressa, com a página de destino.
- **A barra embaixo do livro:**
  - capa, anterior, "Página [n] de N", próxima e contracapa;
  - diminuir e aumentar (1×, 1,5×, 2× e 3×; ampliado, o livro rola e se arrasta com o mouse);
  - tela cheia (o livro e o índice);
  - no celular, "Índice".
- **O desenho das páginas:**
  - as páginas à vista são desenhadas no tamanho da tela, já com a densidade de pixels;
  - as vizinhas são desenhadas antes, para a folha virar com a página pronta;
  - as últimas 14 ficam guardadas;
  - uma página ainda sendo desenhada mostra "…"; uma que falhou, "Esta página não abriu.".
- **Movimento reduzido** (`prefers-reduced-motion`): a folha troca sem girar.
- **Leitores de tela:** uma região "livro" com o título, e "Páginas 12 e 13 de 240" anunciado a cada virada.

## 6. O índice, preso à direita

- **Onde fica:** um painel preso à direita da tela, abaixo do topo, fora do livro. Ele mostra cada capítulo com o número da página.
  - Clicar num capítulo vira até a página dele.
  - O capítulo em que se está (o último que começa até a última página à vista) fica aceso, com a marca em brasa.
  - Sem capítulos: "Este livro não tem índice." Para o administrador: "Ainda sem capítulos. Use o Editar para marcar as páginas."
- **No celular** (até 900 px), o painel abre por cima do livro, pelo botão "Índice" da barra, e fecha no "×" ou ao escolher um capítulo.
- **O administrador** tem o "Editar":
  - cada página à vista ganha um "+ Capítulo aqui" no alto. Clicar nele põe um capítulo novo naquela página e leva o cursor ao nome dele;
  - no painel, cada capítulo tem a página (o número pode ser mudado), o nome, "Ir" e "Tirar". Há também "+ Capítulo nesta página";
  - "Cancelar" e "Salvar índice" ficam sempre à vista no pé do painel;
  - salvar confere a página (de 1 a N) e o nome de cada capítulo e manda o índice inteiro;
  - editando, o Esc não fecha o livro (para nada se perder sem querer).

## 7. O formulário (só o administrador)

No Livro, o texto (e a ajuda de formatação) dá lugar ao grupo "O livro":

- **PDF do miolo:**
  - "Escolher o PDF" (ou "Trocar o PDF");
  - o pdf.js lê o arquivo ali mesmo e mostra "grande.pdf: 65 páginas, 5,5 MB. Vai quando você salvar.";
  - um arquivo que não abre não fica: "O arquivo x.pdf não é um PDF que dê para ler." (ou "Esse PDF pede senha.");
  - um livro novo precisa do PDF: "Escolha o PDF do miolo do livro.".
- **Capa, lombada e contracapa:** a miniatura de cada uma, "Escolher" ou "Trocar", e "Tirar". Sem imagem, a miniatura diz o que aparece no lugar: "O couro, com o título", "A estante desenha uma" e "O couro".
- **"Deixar baixar o PDF":** uma caixa, com a ajuda: para mostrar as páginas, o PDF chega ao navegador de quem lê, então desmarcar tira o botão, mas não impede quem souber copiar o arquivo.
- **Salvar:**
  1. a memória (escrever ou alterar);
  2. o PDF, com o andamento ("Enviando o PDF do miolo: 45%", pelo `XMLHttpRequest`, que conta o que já subiu);
  3. cada imagem escolhida, e as tiradas.

  Se um arquivo falhar, o formulário continua aberto com o erro e passa a alterar o livro que já existe: salvar de novo manda só o que faltou.
- **Trocar a classificação** pergunta antes:
  - de outra para Livro, se houver texto ("o texto desta memória sai quando você salvar");
  - de um Livro com PDF ou imagens para outra ("o PDF, as imagens e o índice deste livro saem quando você salvar");
  - de um livro antigo para outra, os capítulos viram o texto, como antes.
- **O que saiu do formulário:** os capítulos, o "+ Capítulo" e o "Importar capítulos (.md)". O "Importar .md" do texto das outras classificações continua.

## 8. Os livros antigos

- Continuam com a capa de couro, o índice dos capítulos, a leitura de cada capítulo (`#memoria-<id>-capitulo-<n>`) e o "Baixar PDF" de um capítulo (pela impressão).
- No formulário, aparece: "Este livro foi escrito por capítulos e continua assim até você mandar o PDF do miolo. Quando o PDF chegar, os capítulos saem." Dá para mudar o título, a data e o resto sem mandar o PDF.

## 9. Baixar

- **O livro em PDF:**
  - o "Baixar PDF" da barra da leitura é um link para o próprio PDF do miolo (`?baixar=1`), com o título do livro no nome do arquivo;
  - aparece para o administrador sempre, e para quem pode ler só com "Deixar baixar o PDF" marcado.
- **As outras memórias e os capítulos dos livros antigos** continuam com o "Baixar PDF" pela impressão.

## 10. Prévia

- **Os exemplos:**
  - "Cantigas do caminho" virou um livro em PDF de 25 páginas, com capa, lombada e contracapa desenhadas (SVG), os 12 capítulos no índice e "Deixar baixar" marcado;
  - o "Tratado completo sobre as luas…" virou um PDF de 5 páginas, sem imagens (o couro);
  - a "Crônica dos Sete Invernos" continua como livro antigo, por capítulos.
- **Como os PDFs nascem:** a página monta cada PDF ali mesmo (`pdfDaPrevia`, um PDF pequeno escrito à mão, com a fonte Times), sem arquivo nenhum no repositório.
- **Na API de mentira:**
  - um PDF ou uma imagem escolhidos no formulário ficam só na memória da página, e o envio mostra o andamento;
  - o índice, o baixar e as regras do servidor valem igual.

## Atualizar o servidor

1. **O nginx:** no bloco do portal (o mesmo que hoje tem `client_max_body_size 32M`), trocar para `client_max_body_size 210M;`. Depois, `nginx -t && systemctl reload nginx`. Sem isso, um PDF acima de 32 MB volta com "O arquivo passou do tamanho que o servidor aceita.".
2. A atualização de sempre (`empacotar.cmd`, `unzip -o`, `systemctl restart portal`). Nenhum arquivo sai, e não há variável nova.
3. A pasta `/var/lib/portal/livros/` nasce sozinha no primeiro envio.

## Testar no servidor

- **Criar:** um livro com um PDF de verdade (um miolo exportado do editor de texto ou da diagramação) e a lombada. Ver o andamento do envio, o livro aberto na capa e as páginas iguais às do PDF.
- **Folhear:**
  - clicar, puxar a página e as setas;
  - no celular (ou no app), uma página por vez e o deslizar;
  - o zoom e a tela cheia.
- **O índice:** marcar capítulos pelo "+ Capítulo aqui", salvar e clicar neles. Depois, ver como jogador (sem o Editar).
- **Revelar e baixar:**
  - revelar para uma conta de teste: ela lê, mas não tem o "Baixar PDF";
  - marcar "Deixar baixar o PDF": agora tem.
- **Os livros antigos:** continuam abrindo na capa e nos capítulos.
- **Um PDF grande** (dezenas de MB): abre na primeira página sem esperar o arquivo inteiro.

## Fora desta versão

- buscar no texto do livro e selecionar o texto;
- os links de dentro do PDF (o sumário clicável do próprio PDF);
- o número de página impresso no PDF (romanos na abertura), em vez do número do arquivo;
- a grade de miniaturas das páginas;
- o som da folha;
- o pinçar para ampliar;
- capa em PDF.
