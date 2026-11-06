# Chat: atualização 2

A segunda rodada de mudanças do chat (`chat.md` e `chat-atualizacao-1.md`). São quatro:

- o botão de configurações vira uma engrenagem de verdade;
- na lista da esquerda, durante a chamada, quem fala ganha um brilho redondo em volta da imagem;
- na sala de voz aberta no centro, as imagens ficam grandes (hoje são um círculo pequeno no meio do quadro);
- os emojis ganham um desenho melhor (o Noto Color Emoji), os mais novos, os tons de pele e um seletor novo.

Decisões de 06/11/2026. Duas sessões: 16.1 (engrenagem, brilho e retratos) e 16.2 (emojis). Veja "Sessões" no fim. Cada sessão pode ir para o servidor sozinha.

Em toda sessão: ao criar um arquivo novo, acrescente-o ao "Mapa do código" do `CLAUDE.md`.

## 1. A engrenagem (sessão 16.1)

O desenho de hoje (`icone-engrenagem`, um círculo com oito raios) parece um sol. Ele passa a ser uma engrenagem de oito dentes, no mesmo traço dos outros ícones. No `chat/index.html`, o `<symbol>` fica assim:

```html
<symbol id="icone-engrenagem" viewBox="0 0 24 24"><path d="M10.32 5L10.51 2.62A9.5 9.5 0 0 1 13.49 2.62L13.68 5A7.2 7.2 0 0 1 15.76 5.86L17.58 4.31A9.5 9.5 0 0 1 19.69 6.42L18.14 8.24A7.2 7.2 0 0 1 19 10.32L21.38 10.51A9.5 9.5 0 0 1 21.38 13.49L19 13.68A7.2 7.2 0 0 1 18.14 15.76L19.69 17.58A9.5 9.5 0 0 1 17.58 19.69L15.76 18.14A7.2 7.2 0 0 1 13.68 19L13.49 21.38A9.5 9.5 0 0 1 10.51 21.38L10.32 19A7.2 7.2 0 0 1 8.24 18.14L6.42 19.69A9.5 9.5 0 0 1 4.31 17.58L5.86 15.76A7.2 7.2 0 0 1 5 13.68L2.62 13.49A9.5 9.5 0 0 1 2.62 10.51L5 10.32A7.2 7.2 0 0 1 5.86 8.24L4.31 6.42A9.5 9.5 0 0 1 6.42 4.31L8.24 5.86A7.2 7.2 0 0 1 10.32 5Z"/><circle cx="12" cy="12" r="3"/></symbol>
```

Ela já é usada nos dois lugares: a faixa da conta, embaixo à esquerda (`index.html`), e o painel de voz (`voz.js`). Nada mais muda.

## 2. O brilho de quem fala, na lista da esquerda (sessão 16.1)

- **Quando:** só quando você está numa chamada, e só na sala em que você está. Das outras salas, o chat não sabe quem fala.
- **Quem fala:** o mesmo sinal da moldura do quadro (`quadro--falando`), ou seja, o `falando` das pessoas do motor (o `isSpeaking` do LiveKit) sem o `mudo`. Vale para você também.
- **O desenho:** um anel em brasa com brilho, redondo, em volta da imagem de 20 px, com uma transição de 0,12 s (sem transição com `prefers-reduced-motion`):

  ```css
  box-shadow: 0 0 0 2px var(--brasa), 0 0 9px 2px var(--brasa-brilho);
  ```

**Como fazer:**

- **No `chat.js`**, em `itemDoCanal`, a imagem de cada pessoa da sala passa a ficar dentro de um `span.item-canal__voz`: um círculo de 20 px, com `display: inline-grid` e `place-items: center`.
  - O brilho é desse círculo. Assim ele fica redondo também no logo do Mestre, que é um quadrado de cantos arredondados.
- **No `voz.js`**, uma função nova, `marcarQuemFalaNaLista()`.
  - Para cada `#lista .item-canal__sala li`, ela liga a classe `item-canal__falando` quando o `data-sala` é o da sala conectada e a pessoa do `data-usuario` está falando. Nos outros, desliga.
  - **Chamada no fim do `desenharTudo()`**, que já roda a cada troca de quem fala (`ActiveSpeakersChanged`).
  - **Chamada também depois de todo `desenharLista()`:** o `desenharLista()` do `chat.js` termina com `ganchosDaVoz.depoisDaLista?.()`, e o `voz.js` põe ali a função nova.
- A lista continua sem ser redesenhada quando muda quem fala (como hoje, pela `assinaturaDaLista`): só a classe liga e desliga.
- Na prévia, o "falando" simulado já alterna entre as pessoas, então o brilho alterna junto.

## 3. Os retratos grandes na sala de voz (sessão 16.1)

Hoje, sem câmera, cada quadro mostra a imagem num círculo de no máximo 96 px (`.quadro__retrato`, `min(96px, 45%)`). Passa a mostrar a imagem do tamanho que o quadro deixa, de um jeito para cada persona:

| Persona | No quadro, sem câmera |
| --- | --- |
| **Personagem e outro personagem, com retrato** | O retrato em 2:3, como o card da galeria, com a altura do quadro menos uma folga de 1rem. Fica cortado como na galeria (`object-fit: cover`, `object-position: center top`), com os cantos em `--raio`, uma moldura fina de ferro e sombra |
| **Conta com foto** | Um círculo grande: `min(62cqmin, 260px)` |
| **Mestre, com o logo da mesa** | O logo inteiro (`object-fit: contain`), com até 70% da largura e 55% da altura do quadro |
| **Sem imagem (o selo com a inicial)** | Um círculo grande: `min(50cqmin, 200px)`, com a letra em 42% do círculo |

- **Atrás do retrato e da foto**, a mesma imagem cobre o quadro, desfocada e escura, para o quadro não ficar vazio em volta de um retrato estreito:

  ```css
  filter: blur(20px) brightness(0.4) saturate(1.1);
  transform: scale(1.2);
  ```

  Ela é um segundo `<img>` (`quadro__fundo`, `alt=""` e `aria-hidden`). Se ele falhar, sai. No logo do Mestre e no selo, não há fundo.
- **As medidas acompanham o quadro:** o `.quadro__midia` ganha `container-type: size`, e os tamanhos usam `cqh`, `cqw` e `cqmin`. Assim o mesmo CSS serve para a grade, para o quadro grande e para a faixa de baixo (os quadros de 200 × 120 quando há uma tela compartilhada).
  - Na faixa, o retrato fica pequeno, mas inteiro.
  - A regra `.sala__chamada--destaque .sala__grade .quadro__retrato` de hoje sai.
- **O rótulo** (o nome e os ícones) continua embaixo, à esquerda, por cima da imagem. A moldura de quem fala (`quadro--falando`) também fica.
- **Câmera, tela e a prévia simulada** não mudam.
- **No código:** em `atualizarQuadro`, no modo retrato, a mídia recebe o fundo (quando há) e o `retratoDe(...)` com uma classe pelo tipo:
  - `quadro__retrato--corpo` (personagem ou outro, com imagem);
  - `quadro__retrato--foto` (conta com imagem);
  - o logo e o selo já têm `retrato--logo` e `retrato--selo`.

  A classe do tipo vai só no `<img>`, depois do `retratoDe`. Se a imagem falhar, o `retratoDe` troca ela pelo selo com a classe que recebeu, e o selo tem que ficar com a cara de selo (redondo), e não de retrato 2:3. Nesse caso, o fundo desfocado sai junto.

## 4. Os emojis (sessão 16.2)

### 4.1 O desenho: Noto Color Emoji

Hoje o chat mostra os emojis do sistema. No Windows, é o Segoe UI Emoji:

- o traço é grosso;
- no Windows 10, faltam os emojis dos últimos anos;
- as bandeiras aparecem como duas letras ("BR").

O chat passa a usar o **Noto Color Emoji**, do Google: o mesmo desenho do Android e do Gmail, igual em todo computador e no app.

- **Vem do Google Fonts, como as outras fontes do portal.** O `<link>` do `chat/index.html` ganha `&family=Noto+Color+Emoji`.
  - O Google Fonts manda só os pedaços da fonte que a página usa (por `unicode-range`).
  - A CSP do chat já deixa (`fonts.googleapis.com` e `fonts.gstatic.com`).
  - A licença é a OFL, sem nada para acrescentar no repositório.
- **No `chat.css`**, as duas fontes do portal ganham o Noto logo depois da primeira. Só no chat: o resto do portal não muda.

  ```css
  :root {
    --fonte-texto: "Alegreya", "Noto Color Emoji", "Palatino Linotype", Georgia, serif;
    --fonte-gotica: "Grenze Gotisch", "Noto Color Emoji", "UnifrakturMaguntia", "Palatino Linotype", Georgia, serif;
  }
  ```

  - O `aplicarFonte()` das personas termina em `var(--fonte-gotica)`, então os nomes nas fontes dos personagens também ganham o Noto.
  - Nos blocos de código: `Consolas, "Courier New", "Noto Color Emoji", monospace`.
  - Números, `#`, `*`, `©`, `®` e `™` continuam na Alegreya, porque o Noto vem depois dela.
- **O que é só emoji:** a grade do seletor, a barra de baixo dele, as sugestões do `:`, as reações e a mensagem só de emojis. Esses elementos ficam com `font-family: "Noto Color Emoji", var(--fonte-texto)` e `font-variant-emoji: emoji`.
- **Sem acesso ao Google Fonts**, aparecem os emojis do sistema, como hoje.
- **Os avisos do navegador e do app** usam a fonte do sistema. Lá não muda nada.

### 4.2 A lista: até o Emoji 17.0, com os tons de pele

O `planejamento/ferramentas/gerar-emojis.mjs` passa a usar o pacote **`emojibase-data`** (hoje na versão 18.0.0), arquivo `pt/data.json`. Num lugar só, ele tem:

- a lista, os grupos e a ordem;
- os nomes e as palavras em português (do CLDR);
- as variações de tom de pele.

O `unicode-emoji-json` e os dois `cldr-annotations-*` deixam de ser usados. Os pacotes continuam instalados só para gerar, fora de `portal/`.

**Até o Emoji 17.0**, a versão que o Noto Color Emoji tem. A 18.0 é de setembro de 2026 e ainda não chegou à fonte. O limite fica numa constante do script (`VERSAO_MAXIMA = 17`).

**Os grupos** são os oito de hoje, com os mesmos ids e nomes. O grupo `component` (os tons e os cabelos soltos) fica de fora. Do `group` do emojibase para o nosso:

| emojibase | id |
| --- | --- |
| 0 smileys-emotion e 1 people-body | `pessoas` |
| 3 animals-nature | `natureza` |
| 4 food-drink | `comida` |
| 5 travel-places | `viagens` |
| 6 activities | `atividades` |
| 7 objects | `objetos` |
| 8 symbols | `simbolos` |
| 9 flags | `bandeiras` |

Entra só o que tem um desses grupos: as letras soltas dos indicadores regionais (🇦 a 🇿), que vêm sem `group`, ficam de fora. A ordem dentro de cada grupo é o `order` do emojibase. O `icone` dos grupos sai dos dados: a coluna do seletor passa a usar desenhos (veja 4.4).

Com o `emojibase-data` 18.0.0 e o limite de 17, isso dá 1.914 emojis, 330 deles com os cinco tons.

**Cada emoji:** `{ e, n, p, t? }`.

- `e` é o emoji (o campo `emoji`).
- `n` é o nome (`label`).
- `p` são as palavras (`tags`, sem a que for igual ao nome).
- **`t` são os cinco tons**, do 1 ao 5, tirados de `skins`. Entram só os de um tom (o `tone` é um número). As combinações de dois tons diferentes, como o aperto de mãos de duas cores, ficam de fora.
- Saem os emojis e os tons com `version` acima de 17.

**O resto do script:**

- o comentário do alto do `emojis.js` diz a fonte e a versão;
- o `LICENCA-emojis.txt` passa a ter a licença MIT do `emojibase-data` e a licença Unicode dos dados do CLDR, que vêm dentro dele. A do `unicode-emoji-json` sai;
- no fim, o script confere com o `node` que cada `e` e cada tom de `t` passam no `REGEX_EMOJI` do servidor (copie a expressão de `servidor/chat.js`, já com a mudança de 4.3). Ele mostra quantos falharam, e o número tem que ser 0. Assim, todo emoji do seletor pode ser uma reação.

### 4.3 As bandeiras da Inglaterra, da Escócia e do País de Gales

Essas bandeiras são sequências de etiqueta: 🏴, depois os caracteres de U+E0020 a U+E007E e, no fim, U+E007F. Hoje o servidor recusa essas bandeiras como reação, e a página não conta uma mensagem só com elas como "só emojis".

- **`servidor/chat.js`:** o `REGEX_EMOJI` ganha a alternativa `\u{1F3F4}[\u{E0020}-\u{E007E}]+\u{E007F}`.
- **`extras.js`:** a classe de caracteres do `REGEX_SO_EMOJIS` ganha `\u{E0020}-\u{E007F}`.

### 4.4 O seletor novo

**O tamanho e as partes:**

- O painel passa a ter 400 × 440 px. O `max-width` e o `max-height` de hoje continuam valendo.
- **No alto**, a busca e, à direita dela, o botão do tom de pele.
- **À esquerda**, uma coluna estreita (44 px) com os grupos, em desenhos no traço dos ícones do chat (`<symbol>` novos no `index.html`):

  | Grupo | Desenho |
  | --- | --- |
  | Usados com frequência | relógio |
  | Rostos e pessoas | rosto sorrindo |
  | Animais e natureza | folha |
  | Comida e bebida | caneca |
  | Atividades | um dado de 20 faces |
  | Viagens e lugares | torre de castelo |
  | Objetos | vela |
  | Símbolos | coração |
  | Bandeiras | bandeira |

  - O grupo onde a grade está fica marcado com um filete de brasa à esquerda, em vez do sublinhado de hoje.
  - "Usados com frequência" some enquanto não houver nenhum.
- **A grade:** 9 colunas, com casas de 36 px e o emoji em 1,6rem. Os títulos dos grupos continuam grudados no alto ao rolar.
- **A barra de baixo** fica mais alta (2,6rem).
  - Ela mostra o emoji sob o mouse (ou com o foco) grande, em 1,9rem, e o nome.
  - Sem nenhum, a frase de hoje: "Shift + clique escolhe mais de um" ou "Escolha a reação".

**O teclado:**

- da busca, ↓ desce para a grade;
- na grade, as setas andam de casa em casa (9 por linha);
- Enter ou espaço escolhem, e Shift + Enter escolhe sem fechar;
- Esc fecha;
- Enter na busca continua escolhendo o primeiro achado.

**O tom de pele:**

- O botão mostra ✋ no tom escolhido. Clicar abre, ali mesmo, uma fileira com as seis opções: a amarela, sem tom, e os cinco tons. Escolher fecha a fileira e aplica.
- A escolha fica em `chat:emojis:tom` (0 = sem tom, e de 1 a 5), no `localStorage`, com `try/catch`.
- Com um tom escolhido, todo emoji que tem `t` aparece e entra com o tom (`t[tom - 1]`): na grade, na busca, em "Usados com frequência", nas sugestões do `:` e na reação escolhida pelo seletor.
- Os usados ficam guardados **sem o tom**, para mudar junto quando o tom muda. A busca e o nome da barra de baixo usam o nome sem tom ("mão acenando").

**Usados com frequência** (no lugar dos "Recentes"):

- São os 27 mais usados (3 linhas de 9), na ordem de `vezes / (1 + dias desde o último uso / 7)`.
- Ficam em `chat:emojis:usados`, como `{ "<emoji>": { vezes, em } }` (`em` = `Date.now()`), com no máximo 200. Passando disso, sai o de menor conta.
- Contam como uso escolher no seletor e escolher uma sugestão do `:`.
- **Da lista antiga:** se `chat:emojis:usados` não existe e `chat:emojis:recentes` existe, cada recente entra com `vezes: 1`, do mais novo para o mais antigo, com um minuto de diferença no `em`. A chave antiga fica onde está.

**O `:` no campo de escrever:** continua igual (até 8 sugestões), com os emojis no tom escolhido.

### Prévia

O seletor novo, os tons e os usados funcionam na prévia. O Noto vem do Google Fonts quando há internet.

## Fora desta versão

- os emojis próprios do grupo e as figurinhas;
- as reações rápidas (os emojis mais usados direto nas ações da mensagem);
- o brilho de quem fala nas salas em que você não está.

## Testar no servidor (depois da atualização)

- **A engrenagem:** na faixa da conta e no painel de voz.
- **O brilho:**
  - numa sala com duas pessoas, o anel acendendo em quem fala, você incluído;
  - mudo, sem anel;
  - nas outras salas da lista, nada.
- **Os retratos:**
  - numa sala de mesa, o retrato do personagem grande;
  - na Sala comum, a foto do perfil num círculo grande;
  - com uma tela compartilhada, a faixa de baixo com os retratos inteiros.
- **Os emojis, no Windows (no navegador e no app):**
  - o desenho do Noto nas mensagens, no campo de escrever, nas reações e no seletor;
  - as bandeiras (🇧🇷, 🏴󠁧󠁢󠁥󠁮󠁧󠁿) como bandeiras, e uma reação com a da Inglaterra;
  - os emojis novos: 🪉 harpa, 🐦‍🔥 fênix e 🪎 baú do tesouro;
  - o tom de pele mudando a grade, e uma reação com 👍🏽;
  - "Usados com frequência" depois de usar alguns.

## Sessões

- **16.1 A engrenagem, o brilho e os retratos.** Inclui as partes 1, 2 e 3.

  **Testar (exceção ao CLAUDE.md):** meça com o Playwright na prévia, sem tirar prints, em 1366 × 768.
  - **Na Sala comum, conectado:**
    - só o `li` de quem fala tem `item-canal__falando`, e isso troca quando o falando simulado troca;
    - o `box-shadow` do `.item-canal__voz` dele não é `none`, e o `border-radius` é 50%.
  - **Na Sessão de Ode to Sleep, conectado:**
    - o retrato de um personagem com imagem tem pelo menos 70% da altura do quadro e a proporção 2:3, com 1% de folga;
    - o selo tem pelo menos 40% do lado menor do quadro.
  - **Com a tela simulada ligada:** na faixa de baixo, a imagem de cada quadro cabe inteira dentro dele.
- **16.2 Os emojis.** Use o modo de planejamento. Inclui a parte 4 inteira:
  - o script novo e o `emojis.js` gerado de novo, com a conferência das reações;
  - as licenças;
  - a fonte e o CSS;
  - o `REGEX_EMOJI` do servidor e o `REGEX_SO_EMOJIS`;
  - o seletor novo, os tons e os usados;
  - o `CLAUDE.md`: na linha do `emojis.js` e do `gerar-emojis.mjs`, que os dados vêm do `emojibase-data`; no "Onde roda" ou nas regras, que o chat usa o Noto Color Emoji pelo Google Fonts.

  Testar com o servidor e `curl` a reação com a bandeira da Inglaterra (200) e uma reação que não é emoji (400).
