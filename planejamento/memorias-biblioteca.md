# Memórias: a biblioteca

A entrada da página Memórias deixa de ser uma lista de nomes e vira uma **biblioteca**, em duas partes:

- **a estante dos Livros**: as lombadas em pé numa prateleira;
- **a mesa dos Escritos**: as outras classificações (cartas, contos, diários, recortes, trechos, poemas, documentos e inscrições), cada uma como um papel em miniatura com a cara que ela tem na leitura.

A leitura de cada memória, a edição e o "Revelar…" continuam como em `memorias.md` e `memorias-arquivos.md`.

Decisões de 06/11/2026. Uma sessão, a 15.1 (veja "Sessão" no fim).

## 1. O que a lista traz a mais (`GET /api/memorias`)

Hoje a lista leva, para quem não é administrador, só `{ id, titulo, reveladaEm }`. Cada item passa a levar também, para todos:

| Campo | O que é |
| --- | --- |
| `tipo` | a classificação (hoje só o administrador recebe) |
| `data` | a data no Ciclo de Sylara, como na leitura (`dataPublica(m.data, true)`), ou `null` |
| `detalhe` | o campo a mais (a assinatura, o "Recortado de"…), só nos tipos que têm. Nos outros, `""` |
| `capitulos` | só no Livro: quantos capítulos ele tem |
| `inicio` | menos no Livro: o começo do texto, sem marcas, com até 160 caracteres |

**O `inicio`:**

- os links `[[tipo:id|o que aparece]]` viram o que aparece;
- `**` e `*` saem, e saem também o "- " e o "1. " do começo das linhas;
- as linhas se juntam com um espaço. No Poema, com " / ", para a página pôr os versos de volta;
- os espaços repetidos viram um só;
- passando de 160 caracteres, ele corta no último espaço antes dos 160 e põe "…".

A ordem da lista não muda. Para o administrador, os campos de hoje continuam (`alteradoEm` e `revelacao`). A lista fica mais pesada, mas o limite é de 500 memórias.

## 2. A biblioteca (a página)

O alto continua igual: o título, a frase e o "+ Memória" do administrador.

Logo abaixo vem um campo **"Procurar pelo título"**. Ele filtra as duas partes enquanto se escreve, sem acentos e sem diferença de maiúsculas (`normalizar`). Sem nada achado: "Nenhuma memória com esse nome.".

### 2.1 A estante (Livros)

- **O título da seção:** "Livros", em Grenze Gotisch, com o número ao lado, pequeno.
- **Cada livro é uma lombada** em pé numa prateleira, um link para a leitura (a capa e o índice, `#memoria-<id>`, como hoje).
  - **A largura** acompanha os capítulos: `2,6rem + 0,06rem × capítulos` (contando no máximo 40 capítulos).
  - **A altura** vai de 14rem a 17rem e **a cor do couro** é um de seis tons: vinho, musgo, azul-noite, castanho, fuligem e ocre escuro. As duas saem de um número tirado do id, sempre o mesmo para o mesmo livro (some os códigos dos caracteres do id, como o `numeroDaPagina` da leitura).
  - **O couro** usa o mesmo gradiente e a mesma textura da capa da leitura (`.capa`).
  - **O título** corre pela lombada de cima para baixo (`writing-mode: vertical-rl`), em Grenze Gotisch, na cor pergaminho. Se não couber, termina em "…".
  - **Perto do alto e do pé**, duas faixas finas douradas (um ouro velho, perto do `#c9ab80` da moldura dos cards) e uma ponteira de ferro em cada ponta, como os cantos da capa.
- **A prateleira:** uma tábua de madeira escura embaixo dos livros, com sombra e um suporte de ferro em cada ponta. Os livros projetam uma sombra curta na tábua.
- **Muitos livros:** eles passam para a prateleira de baixo, e cada fileira tem a sua tábua. Para isso, cada livro fica numa vaga de mesma altura, e a tábua é um fundo que se repete na altura de cada fileira.
- **Ao passar o mouse, ou com o foco:**
  - o livro sobe um pouco (`translateY(-0.6rem)`) e se inclina de leve, com um brilho quente na borda;
  - acima dele aparece uma etiqueta de pergaminho com o título inteiro, "12 capítulos" e a data, se houver.
- **O administrador:**
  - os livros escondidos aparecem cobertos por um véu de névoa, com o olho riscado no pé;
  - a etiqueta leva o estado: "Escondida" ou "Só para Neia e Takezo", como o sinal de hoje (`sinalDaRevelacao`).
- **Revelado há pouco:** um livro revelado para a conta nos últimos 7 dias (pelo `reveladaEm`) tem uma fita marcadora em brasa pendurada no alto da lombada. O administrador não vê fitas.
- **No celular:** uma prateleira só, que rola de lado (com `scroll-snap`), com os livros um pouco menores.
- **Sem livros:** a seção não aparece, nem para o administrador.

### 2.2 A mesa (Escritos)

- **O título da seção:** "Escritos", com o número ao lado.
- **Embaixo, as classificações:** "Todos" e cada uma que existe na lista, com o número ("Cartas 3", "Diários 2"…).
  - É um grupo de botões de ligar (`aria-pressed`), com "Todos" ligado no começo.
  - A escolha não fica guardada.
- **A mesa:** os papéis numa grade (`auto-fill`, com no mínimo 12,5rem), sobre uma superfície de madeira escura, feita com gradientes, com veios suaves e as bordas mais escuras.
  - Cada papel tem uns 12,5rem × 16rem e uma inclinação pequena (de −2° a 2°, tirada do id), como papéis espalhados numa mesa.
- **Cada papel** é um link para a leitura e mostra:
  - a classificação, pequena, em versalete;
  - o título, na fonte da classificação;
  - o `inicio` em 3 ou 4 linhas, sumindo embaixo;
  - a data, se houver.
- **A cara de cada papel:** é a cara da classificação na leitura (`memorias.md`, "A cara de cada classificação"), em miniatura, com as mesmas cores e fontes. Use as regras de `.folha--<tipo>` do `memorias.css` como base, numa classe nova `.papel--<tipo>`, sem mudar as da leitura.

  | Classificação | O papel |
  | --- | --- |
  | Carta | Creme, com uma dobra na horizontal. Título e texto em caligrafia. Embaixo, à direita, um lacre de cera pequeno e a assinatura (`detalhe`) na fonte "pena" |
  | Conto | Página limpa, com a primeira letra do título em capitular (Grenze Gotisch) e um ornamento pequeno no pé |
  | Diário | Pautado, com a margem vermelha apagada. A data no alto, sublinhada |
  | Recorte | Jornal amarelado, de bordas irregulares (`clip-path`). No alto, o "Recortado de" em fraktur, com fio duplo embaixo, e o título em "tinta" |
  | Trecho de livro | Página velha. No alto, o "Do livro" em versalete pequeno, "…" antes do texto e o número de página de mentira no pé (o mesmo da leitura) |
  | Poema ou canção | Pergaminho, com os versos do `inicio` centralizados e em itálico (cada " / " vira uma quebra de linha) |
  | Documento | Papel oficial de borda dupla, com o título centralizado em caixa alta ("romana"), o "Emitido por" pequeno e um selo de cera no pé |
  | Inscrição | Pedra cinza-escura de bordas lascadas, com o título e o texto gravados ("romana", caixa alta espaçada). O "Onde está gravada" fica abaixo da pedra, em itálico |

- **Ao passar o mouse, ou com o foco:**
  - o papel se endireita (sem inclinação), sobe um pouco (`translateY(-4px)` e `scale(1.02)`) e fica por cima dos outros, com a sombra maior;
  - o foco do teclado tem o contorno em brasa.
- **O administrador:** os escondidos levam o véu e o selo do estado no pé ("Escondida" com o olho riscado, ou "Só para Neia e Takezo").
- **Revelado há pouco** (7 dias, como na estante): um lacre pequeno em brasa num canto, escrito "Nova". O administrador não vê.
- **No celular:** duas colunas de papéis menores (uns 12rem de altura) e sem inclinação.
- **Sem escritos:** "Nenhum escrito revelado ainda." Para o administrador: "Nenhum escrito ainda.".

Se a lista inteira estiver vazia, continua a mensagem de hoje, e as duas seções não aparecem.

### 2.3 O resto

- **As fontes:** ao desenhar, `carregarFontes()` com as fontes das classificações que estão na lista (`TIPOS_DE_MEMORIA[].fontes`).
- **Acessibilidade:**
  - os livros e os papéis são `<a>` dentro de `<ul>` e `<li>`;
  - o nome do link é "Livro: <título>, 12 capítulos" ou "Carta: <título>", e para o administrador vem também o estado;
  - a etiqueta que aparece no livro é só visual (`aria-hidden`), porque o nome do link já diz tudo.
- **O foco ao voltar da leitura:** o `mostrarLista()` hoje procura `.memoria-item__link` com o `data-id`. Os livros e os papéis guardam o `data-id`, e o seletor muda para eles.
- **Movimento reduzido** (`prefers-reduced-motion`): sem as transições de subir e endireitar.
- **Sem imagens novas:** tudo é feito com CSS (gradientes, sombras, `clip-path`) e com as fontes do portal, como a cara das classificações.

## 3. Prévia

Os exemplos ganham:

- mais dois livros: um com 12 capítulos curtos e um com título comprido, para a estante ter três;
- mais uma carta e mais um diário, para as classificações terem números maiores que 1;
- uma memória revelada para a Neia há dois dias, para aparecer a fita e o lacre "Nova".

## Testar no servidor (depois da atualização)

- **A estante:** os livros de tamanhos e cores diferentes, a etiqueta ao passar o mouse e o livro abrindo na capa.
- **A mesa:**
  - cada classificação com a sua cara;
  - as classificações filtrando;
  - a busca pelo título.
- **O administrador:** os escondidos com o véu e o estado.
- **A revelação:** revelar uma carta para uma conta de teste e ver o lacre "Nova".
- **No celular:** a prateleira rolando de lado e as duas colunas.

## Sessão

- **15.1 A biblioteca.** Use o modo de planejamento. Inclui:
  - a parte 1 no `servidor/memorias.js`;
  - as partes 2 e 3 em `memorias/` (`index.html`, `memorias.js` e `memorias.css`).

  Testar a parte 1 com o servidor e `curl`:
  - o jogador recebe `tipo`, `data`, `detalhe`, `capitulos` e `inicio`;
  - o `inicio` vem sem marcas e sem os códigos dos links;
  - o corte no fim de uma palavra;
  - o Poema com " / ";
  - o Livro sem `inicio`.
