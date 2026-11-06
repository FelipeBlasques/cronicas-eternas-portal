# Caderno: o grafo

Uma vista nova no Caderno: o **grafo**, como o do Obsidian.

- Cada nota é um ponto, e cada link entre duas notas é uma linha.
- Os personagens, acontecimentos, lugares, memórias e mesas citados nas notas também entram, como pontos de outras cores. É o que liga, por exemplo, duas sessões que falam do mesmo personagem.
- Dá para ver o caderno inteiro ou só a vizinhança de uma nota (o "grafo local").

O resto do Caderno continua como em `caderno.md`.

Decisões de 06/11/2026. Uma sessão, a 17.1, com o servidor e a página (veja "Sessão" no fim).

## 1. O que entra

**As notas** são as que a conta lê na vista de agora, as mesmas da busca:

- numa conta, as notas do caderno dela e as compartilhadas com ela (`notasLegiveis(conta)`);
- no administrador, as notas do caderno da conta escolhida em "Caderno de:" (`notasLegiveis(conta, [c])`).

**As linhas:**

- **De nota para nota:** os links `[[nota:…]]` e as embutidas `![[nota:…]]`, só entre notas da lista.
  - Uma linha só por par, mesmo com vários links.
  - A linha que só tem embutida é tracejada.
- **De nota para o portal:** os links `[[personagem:…]]`, `[[evento:…]]`, `[[mesa:…]]`, `[[memoria:…]]` e `[[lugar:…]]` cujo alvo a conta vê, pelas mesmas regras da leitura.
- O que a conta não lê nem vê (uma nota de fora, um personagem oculto, um alvo apagado) fica de fora. Nada no grafo conta que aquilo existe.
- A nota com link para ela mesma não ganha linha.

**Os pontos do portal** aparecem só quando alguma nota da lista cita aquele alvo.

**As etiquetas** (`#nome`) podem aparecer como pontos, ligados às notas que as têm. Começam escondidas (veja "O painel").

**As notas sem linha nenhuma** aparecem soltas, e dá para esconder.

## 2. No servidor (`servidor/caderno.js`)

| Rota | Quem | O que faz |
| --- | --- | --- |
| `GET /api/caderno/grafo` | quem tem caderno | o grafo das notas que a conta lê |
| `GET /api/caderno/contas/:usuario/grafo` | administrador | o grafo do caderno daquela conta. Conta que não existe, ou que não tem caderno: 404, como no `verCadernoDaConta` |

A resposta:

```json
{
  "notas": [{ "id": "nota-…", "titulo": "…", "dono": { "usuario": "neia", "nome": "Neia" }, "etiquetas": ["pistas"] }],
  "ligacoes": [
    { "de": "nota-…", "para": "nota:nota-…", "embutida": false },
    { "de": "nota-…", "para": "personagem:p1", "embutida": false }
  ],
  "alvos": {
    "personagem:p1": { "nome": "Venti" },
    "evento:e10": { "titulo": "A queda de Hando" },
    "mesa:ode-to-sleep": { "nome": "Ode to Sleep", "cor": "#2e3756" },
    "lugar:mapa-…/marca-…": { "nome": "Hando", "mapa": "Tyrenar" }
  }
}
```

- `de` é sempre o id de uma nota da lista. `para` é `nota:<id>` ou a chave do alvo no portal.
- `embutida` é `true` quando o par só tem embutida.
- Cada par `de`–`para` aparece uma vez só. O par A–B e o par B–A são dois.
- `alvos` vem do `alvosDosLinks(conta, chaves)`, com as chaves que não são de nota. Cada mesa ganha a `cor` de `dados.campanhas`.
- `etiquetas` são os nomes das etiquetas de cada nota: os valores de `analisar(nota).etiquetas`.
- Tudo vem do que o servidor já lê das notas (`notasLegiveis` e `analisar`). Nenhum dado novo é guardado.

## 3. Na página

### Onde abre

- **Um botão "Grafo"** no alto da lateral, ao lado do título, para todos (o administrador vê o grafo da conta escolhida). O ícone são três círculos ligados. O botão abre `#grafo`.
- **"Ver no grafo"** no menu "⋯" de cada nota, na árvore e na barra da nota. Abre `#grafo-<id>`, o grafo local daquela nota.
- **O endereço:**
  - `#grafo` e `#grafo-<id>` são endereços como `#nota-<id>`, e o Voltar do navegador volta;
  - o `aoMudarOEndereco` passa a separar os três;
  - abrir o grafo sai da nota em edição do mesmo jeito que abrir outra nota: salva antes o que falta.
- **Onde fica:** o grafo ocupa a `#area-nota`, à direita. No celular, abre como uma nota, na tela inteira, com o "‹ Caderno". O título da aba é "Grafo · Caderno".

### O desenho

Um `<canvas>` que ocupa a área, nítido (com o `devicePixelRatio`) e redesenhado quando a área muda de tamanho.

**Os pontos:**

| O quê | Cor |
| --- | --- |
| nota | pergaminho apagado (`--pergaminho-apagado`) |
| nota de outra conta (compartilhada com você) | a mesma, com um anel fino em volta |
| personagem | ouro velho `#c9a66b` |
| acontecimento | terracota `#b8735a` |
| lugar | musgo `#8a9f73` |
| memória | lavanda apagada `#9a8bb5` |
| mesa | a cor da mesa, clareada pelo `corVisivel()` do `comum.js` |
| etiqueta | verde-água apagado `#6f9690`, num ponto menor |

- **O tamanho** cresce com as linhas: o raio é 4 + 1,6 × √(número de linhas), até 14, nas medidas do grafo (o zoom aumenta junto).
- **As linhas:** `rgba(181, 154, 118, 0.22)`, de 1 px. As de embutida são tracejadas.
- **Os nomes** ficam embaixo de cada ponto, em Alegreya de 12 px, em pergaminho apagado.
  - Aparecem com o zoom a partir de 1 e somem aos poucos entre 1 e 0,6.
  - Aparecem sempre no ponto sob o mouse e nos vizinhos dele.
- **Sob o mouse:**
  - o ponto e os vizinhos continuam inteiros, e o resto fica apagado (15%);
  - as linhas do ponto ficam em pergaminho;
  - o ponto ganha um anel em brasa;
  - um rótulo pequeno mostra o nome inteiro, com "de Takezo" nas notas de outra conta e "Personagem · Venti" (o tipo e o nome) nos pontos do portal.
- **A nota do grafo local** tem o anel em brasa o tempo todo.
- **A legenda**, embaixo à esquerda, mostra as cores que estão no grafo, com o nome de cada tipo.
- **O fundo** é o da própria área.

### Mexer

- **A roda do mouse** dá zoom no ponto do cursor, de 0,2 a 4. A pinça do touchpad e o Ctrl + roda também, como no visor dos mapas (`preventDefault` num `wheel` com `passive: false`).
- **Arrastar o fundo** move o grafo.
- **Arrastar um ponto** leva o ponto junto. Os outros se acomodam (a simulação esquenta de novo), e ao soltar ele volta a obedecer a simulação.
- **Clicar:**
  - numa nota, ela abre (`abrirNota(id)`);
  - num ponto do portal, vai para a página dele, no mesmo endereço dos links do texto. Com Ctrl ou ⌘, abre noutra aba;
  - numa etiqueta, faz a busca da etiqueta (`buscarEtiqueta(nome)`), como clicar nela na lateral.
- **No celular:** um dedo move, a pinça dá zoom e o toque abre.
- **Teclado:**
  - o canvas tem `tabindex="0"`, `role="img"` e um `aria-label` com os números ("Grafo do caderno: 38 notas e 61 ligações");
  - as setas movem, + e − dão zoom, e 0 mostra tudo;
  - quem não usa o grafo tem a mesma lista de notas na lateral.

### O painel do grafo

Um painel pequeno no canto de cima, à direita, por cima do canvas:

- **"Grafo"** e os números: "38 notas · 61 ligações".
- **"Procurar":** os pontos cujo nome tem o termo (sem acentos e sem diferença de maiúsculas) ficam inteiros, e o resto apaga. Enter centraliza o primeiro.
- **"Mostrar":** caixas de marcar para Personagens, Acontecimentos, Lugares, Memórias e Mesas (ligadas), Etiquetas (desligada) e "Notas sem ligação" (ligada).
- **"Grafo local"**, só em `#grafo-<id>`:
  - liga e desliga, e começa ligado;
  - "Profundidade": 1, 2 ou 3, com padrão 1. São os passos a partir da nota, contando também as linhas que passam por um ponto do portal (duas notas que citam o mesmo personagem ficam a 2 passos);
  - desligado, mostra o grafo inteiro, com a nota marcada.
- **Os botões:** "Centralizar" (mostra tudo na tela), "+" e "−".
- **Recolher:** um botão pequeno recolhe o painel. No celular, ele começa recolhido.
- **O que fica guardado:** as escolhas, menos a busca, ficam em `caderno:grafo` (no `localStorage`, com `try/catch`).

### A simulação

Um desenho por forças, escrito no `grafo.js`, sem bibliotecas:

- **Repulsão** entre todos os pontos. Com mais de 300 pontos, use uma quadtree (Barnes-Hut, θ = 0,9), para continuar rápido com até 2.000 notas.
- **Molas** nas linhas: comprimento de 70 e força de 0,06.
- **Gravidade** fraca para o centro: 0,012.
- **Colisão:** os pontos não se sobrepõem. A distância mínima é a soma dos raios mais 4.
- **O passo:** a velocidade é amortecida em 0,6 a cada passo. O "calor" começa em 1, é multiplicado por 0,985 a cada passo e para abaixo de 0,005. Arrastar um ponto põe o calor em 0,3.
- **O começo:** os pontos começam numa espiral (filotaxia), na ordem dos ids. Assim o desenho sai igual toda vez.
- **Desenhar:** com `requestAnimationFrame`, só enquanto algo mexe (a simulação, o arraste, o zoom ou o ponto sob o mouse).
- **Movimento reduzido** (`prefers-reduced-motion`): calcula 300 passos antes e desenha só o fim.
- **A primeira vista:** ao abrir, o grafo se ajusta para caber na tela (o mesmo "Centralizar").
- **O grafo local** usa a mesma simulação, só com os pontos que aparecem.

### Os arquivos

- **`publico/caderno/grafo.js` (novo)**, carregado depois do `caderno.js` (`defer`): o canvas, a simulação e o painel.
  - Ele usa do `caderno.js` o `estado`, a `api`, o `abrirNota` e o `buscarEtiqueta`.
  - Ele preenche os `ganchosDoGrafo`, que o `caderno.js` declara vazios, como os `ganchosDaVoz` do chat: `ganchosDoGrafo.mostrar(id ou null)` e `ganchosDoGrafo.fechar()`.
- **O CSS** fica no `caderno.css`, numa parte nova, "O grafo".
- **O `index.html`** ganha o `<script>`, o botão "Grafo" e o `<symbol>` do ícone.
- **O endereço dos pontos do portal:** o `marcas.js` passa a expor, como propriedade da função que ele já declara, `desenharMarcas.enderecoDoPortal(tipo, id)`.
  - É o endereço de um personagem, acontecimento, mesa, memória ou lugar, o mesmo que os links usam hoje.
  - O `linkDoPortal` passa a usar essa função, e o `grafo.js` também.
  - Nenhum nome novo é declarado.

## 4. Prévia

- A API de mentira ganha `grafo()` e `grafoDaConta(usuario)`, com as mesmas regras, a partir dos cadernos de exemplo.
- O caderno da Neia ganha mais cinco notas curtas com links entre elas e para personagens e lugares de exemplo, para o grafo ter forma.

## Fora desta versão

- cores por pasta ou por etiqueta (os "grupos" do Obsidian);
- guardar onde cada ponto ficou;
- linhas entre as páginas do portal (de um personagem para outro, por exemplo).

## Testar no servidor (depois da atualização)

- **O grafo de uma conta:** com notas próprias e compartilhadas; uma nota compartilhada por outra conta com o anel.
- **O que não aparece:** um link para uma nota que a conta não lê e um personagem oculto.
- **O administrador:** trocando de conta em "Caderno de:".
- **Ver no grafo:** a profundidade 1 e 2.
- **Mexer:** clicar numa nota, num personagem e numa etiqueta; o zoom, o arraste e "Centralizar".
- **No celular:** o grafo na tela inteira, com o "‹ Caderno".

## Sessão

- **17.1 O grafo.** Use o modo de planejamento. Inclui:
  - a parte 2 no servidor;
  - as partes 3 e 4 na página (`grafo.js`, `caderno.js`, `caderno.css`, `index.html` e o `enderecoDoPortal` no `marcas.js`);
  - o `CLAUDE.md`: o `grafo.js` no "Mapa do código" e a rota do grafo na linha do `caderno.js` do servidor.

  Testar a parte 2 com o servidor e `curl`:
  - uma conta com uma nota compartilhada por outra, e as linhas entre as duas;
  - o link para uma nota que a conta não lê não aparece;
  - o personagem oculto não aparece para o jogador e aparece para o administrador;
  - o par com só embutida (`embutida: true`);
  - o administrador com a conta escolhida, e a conta que não existe (404);
  - o jogador pedindo o grafo de outra conta (403).
