# Chat: atualização 3

A terceira rodada do chat (depois de `chat.md`, `chat-atualizacao-1.md` e `chat-atualizacao-2.md`). São duas mudanças:

- **um atalho de teclado para ligar e desligar o microfone**, escolhido nas configurações. No app, ele vale em qualquer janela durante a chamada (na do Foundry também);
- **a tela compartilhada melhor:**
  - sem o eco das vozes da chamada no som da tela;
  - com a escolha entre nítida e fluida (hoje ela fica presa em 15 quadros por segundo);
  - com o som em estéreo;
  - com tela cheia para quem assiste.

Decisões de 11/11/2026. Duas sessões no portal: 19.1 (o atalho) e 19.2 (a tela). Uma sessão no repositório do app: a 1.4.0, com o atalho fora do chat, em `cronicas-eternas-app/planejamento/atalho-do-microfone.md`. As três são independentes. Sem o app novo, o atalho vale só com o chat na frente. As duas do portal mexem no `voz.js`: faça uma depois da outra. Veja "Sessões" no fim.

Em toda sessão: ao criar um arquivo novo, acrescente-o ao "Mapa do código" do `CLAUDE.md`.

## 1. O atalho do microfone (sessão 19.1)

### 1.1 Onde se escolhe

- **Nas Configurações de voz** (`#dialogo-voz`), um grupo novo, "Atalho do microfone", logo depois de "Sons da chamada":
  - o atalho de agora em teclas (`<kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>M</kbd>`), ou "Nenhum";
  - os botões "Gravar atalho" e "Tirar" (este só com atalho);
  - uma dica, que muda conforme o lugar:
    - **no app** (com `window.cronicasEternasApp?.atalhoDoMicrofone`): "Vale em qualquer janela enquanto você está numa chamada. Nesse tempo, os outros programas não recebem essas teclas.";
    - **no app antigo ou no navegador:** "Vale com o chat na frente. No app atualizado, vale em qualquer janela.".
- **A engrenagem da faixa da conta** (`abrirConfiguracoes()` no `chat.js`) ganha a seção "Voz", com "Configurações de voz". Assim dá para escolher o atalho fora de uma chamada. O `chat.js` chama o `voz.js` pelo `ganchosDaVoz` (`ganchosDaVoz.abrirConfiguracoes`), como já faz com o resto.

### 1.2 Gravar o atalho

- **"Gravar atalho"** vira "Aperte as teclas…" (com `aria-live`). A próxima tecla que não for só Ctrl, Alt, Shift ou Win fecha o atalho, com os modificadores apertados junto.
  - Esc cancela e deixa o atalho de antes.
  - Sair do diálogo também cancela.
- **O que vale:**
  - uma tecla com Ctrl ou Alt (o Shift e o Win podem ir junto);
  - ou, sozinhas, F1 a F24, Pause e Scroll Lock.

  Fora disso: "Use Ctrl ou Alt junto com a tecla, ou uma tecla de F1 a F24, Pause ou Scroll Lock sozinha." Assim o atalho nunca atrapalha a escrita, e no app ele não prende uma letra no computador inteiro durante a chamada.
- **Fica guardado** em `chat:voz:atalho` (`localStorage`, com `try/catch`), como `{ codigo, ctrl, alt, shift, meta, rotulo }`.
  - **`codigo`** é o `evento.code` (ex.: `"KeyM"`). Assim o atalho não depende do idioma do teclado.
  - **`rotulo`** é o texto para mostrar: "Ctrl + Shift + M".

  | `codigo` | No rótulo |
  | --- | --- |
  | `KeyM` | M |
  | `Digit1` | 1 |
  | `F8` | F8 |
  | `Numpad1` | Num 1 |
  | `Backquote` | o `evento.key` |
  | `ScrollLock` | Scroll Lock |
  | qualquer outro | o `evento.key` em maiúsculas |

### 1.3 O que ele faz

- **Só numa chamada** (conectado): faz o mesmo que o botão do microfone, o `alternarMicrofone()`. Ensurdecido, ligar o microfone também tira o ensurdecido, como no botão.
- **Fora de chamada:** nada, e a tecla segue para a página.
- **Dois sons novos** em `SONS_DA_CHAMADA`, curtos (0,09 s), no mesmo jeito dos outros:
  - **`mudo`:** de 700 a 500 Hz;
  - **`fala`:** de 500 a 700 Hz.

  Eles tocam em toda troca do microfone, pelo botão ou pelo atalho, quando "Sons da chamada" está ligado. Com o atalho você não está olhando para o chat: o som é o aviso.
- **Pelo atalho**, também o `avisoRapido("Microfone desligado.")` ou `"Microfone ligado."`.

### 1.4 Com o chat na frente

- Um `keydown` no `document`, na captura (`true`).
  - Quando o atalho casa, sem `evento.repeat`, numa chamada e sem o atalho do app ligado (1.5): `preventDefault()` e a troca.
  - Os modificadores precisam casar exatos: Ctrl + M não dispara o Ctrl + Shift + M.
- Vale no navegador e no app antigo, com o chat na frente.

### 1.5 No app (1.4.0)

O app novo oferece, só na janela do chat:

```js
window.cronicasEternasApp.atalhoDoMicrofone(acelerador) // Promise; null tira o atalho
```

E, a cada aperto, dispara na página:

```js
window.dispatchEvent(new CustomEvent("cronicas-eternas:atalho", { detail: { estado: "apertou" } }))
```

O app também manda `"soltou"`, quando a tecla sobe. Por enquanto a página ignora.

**O `acelerador`:** os modificadores e o `codigo`, separados por `+`, nesta ordem: `Control`, `Alt`, `Shift`, `Super`. Exemplo: `"Control+Shift+KeyM"`. O app entende os nomes do `evento.code`.

**Na página:**

- **Ao conectar numa chamada,** e ao gravar ou tirar o atalho durante uma: `atalhoDoMicrofone(acelerador)`. Deu certo: o "atalho do app" fica ligado, e o `keydown` de 1.4 para de trocar (o Windows já entrega o atalho ao app, e os dois juntos trocariam duas vezes).
- **Ao sair da chamada** (sair, cair ou fechar) **e ao abrir a página:** `atalhoDoMicrofone(null)`. Assim nada sobra preso de uma página anterior.
- **Se o app recusar** (a promessa rejeita, por exemplo porque outro programa já usa as teclas):
  - `avisoRapido('O atalho Ctrl + Shift + M não ficou valendo fora do chat: <mensagem do app>')`;
  - o atalho continua valendo com o chat na frente.
- **O `cronicas-eternas:atalho` com `"apertou"`,** numa chamada: a troca de 1.3.
- **No app antigo** (sem `atalhoDoMicrofone`): só 1.4.

### Prévia

Funciona com o motor simulado: gravar, tirar, o atalho trocando o microfone simulado e os sons. Sem o app, a dica do navegador.

## 2. A tela compartilhada (sessão 19.2)

### 2.1 Por que há eco hoje

Com a tela inteira e "Compartilhar áudio do sistema", o navegador grava tudo o que sai no som do computador. Isso inclui as vozes da chamada, que o próprio chat está tocando. Quem fala se ouve de volta no som da tela.

O chat já pede `restrictOwnAudio: true`, que manda tirar o som da própria página. O que se sabe:

- **Chrome e Edge, versão 141 em diante:** entendem o pedido. O app usa o WebView2, que é o Edge.
- **O Windows só deixa tirar o som de um programa de uma gravação a partir do Windows 11.** No Windows 10, o pedido provavelmente não tem como ser cumprido: o navegador aceita e grava tudo. É o motivo mais provável do eco de hoje. O teste do fim deste arquivo confirma.
- **O aviso de hoje** ("O som do chat pode ir junto") só aparece quando o navegador não conhece o pedido. Num Windows 10 com navegador novo, ele não aparece.

A saída tem três partes:

1. **Continuar pedindo `restrictOwnAudio`.** Deve resolver no Windows 11 e no Mac.
2. **Oferecer o som de uma janela só** (`windowAudio: "window"`, também do Chrome/Edge 141). Ao escolher uma janela, o navegador pode oferecer o som só dela. Não leva as vozes nem os avisos de outros programas. É o melhor para um jogo, mas, pelo mesmo motivo, deve funcionar só no Windows 11.
3. **Onde o sistema não tira as vozes, ligar o cancelamento de eco no som da tela:** `echoCancellation: "remote-only"`.
   - O Chrome aceita o cancelamento de eco também no som da tela. Com `"remote-only"`, ele tira só o que chega pela conexão: as vozes da chamada e o som das telas dos outros.
   - Navegadores antes do 141 devem entender o texto como `true`, o cancelamento comum.
   - **O custo:** quando alguém fala, o som da tela pode abafar um pouco.

### 2.2 A captura nova

O LiveKit não repassa o `windowAudio`. Por isso, o `definirTela` do motor do LiveKit passa a pedir a tela ele mesmo e publicar as trilhas, sem o `setScreenShareEnabled(true, ...)`:

```js
const fluxo = await navigator.mediaDevices.getDisplayMedia({
  video: { width: { ideal: q.largura }, height: { ideal: q.altura }, frameRate: { ideal: q.quadros } },
  audio: {
    restrictOwnAudio: true,
    echoCancellation: tirarAsVozes ? "remote-only" : false,
    noiseSuppression: false,
    autoGainControl: false,
    channelCount: 2,
  },
  systemAudio: "include",
  windowAudio: "window",
  selfBrowserSurface: "exclude",
  surfaceSwitching: "include",
});
const [video] = fluxo.getVideoTracks();
video.contentHint = q.dica;
await sala.localParticipant.publishTrack(video, {
  source: Track.Source.ScreenShare,
  name: "tela",
  screenShareEncoding: { maxBitrate: q.bitrate, maxFramerate: q.quadros },
  degradationPreference: q.preferencia,
});
const [som] = fluxo.getAudioTracks();
if (som) {
  await sala.localParticipant.publishTrack(som, {
    source: Track.Source.ScreenShareAudio,
    name: "som-da-tela",
    audioPreset: { maxBitrate: 128_000 },
    dtx: false,
    red: false,
    forceStereo: true,
  });
}
```

- **O `q`** é a qualidade escolhida (2.4), e `tirarAsVozes` vem de 2.3.
- **Se uma das publicações falhar,** pare todas as trilhas do `fluxo` e avise como hoje (`textoDaFalhaDeAparelho`). Fechar a janela de escolha continua não sendo erro.
- **Parar continua com `setScreenShareEnabled(false)`.** No LiveKit 2.23, ele tira a publicação da tela e a do som juntas.
- **O "Parar de compartilhar" do navegador** também continua funcionando. O LiveKit tira as trilhas de tela que terminam (`handleTrackEnded`), também as publicadas assim.
- **Confira no `livekit-client.js`** se o `publishTrack` 2.23 aceita `degradationPreference` nas opções. Se não aceitar, depois de publicar use o `setDegradationPreference(...)` da trilha local de vídeo.
- **O motor simulado** recebe a qualidade e não faz nada com ela.

### 2.3 Tirar as vozes

**Uma escolha nova nas Configurações de voz**, "Som da tela compartilhada", depois do atalho:

| Opção | Valor |
| --- | --- |
| Automático (recomendado) | `auto`, o padrão |
| Sempre tirar as vozes da chamada | `sempre` |
| Nunca: o som da tela sai puro | `nunca` |

- Fica em `chat:voz:tela:vozes`.
- **Embaixo, uma dica do que o Automático faz neste computador:**
  - **Windows 11 ou Mac:** "Neste computador, o Automático deixa o sistema tirar as vozes da chamada."
  - **Outros:** "Neste computador, o Automático usa o cancelamento de eco: o som da tela pode abafar um pouco quando alguém fala."

**O Automático:**

- Lê o sistema uma vez por página, com `navigator.userAgentData?.getHighEntropyValues(["platformVersion"])`, dentro de `try/catch`.
  - O sistema vem de `userAgentData.platform`.
  - **Windows com o primeiro número de `platformVersion` 13 ou mais** é Windows 11.
- **Windows 11 e macOS:** sem cancelamento (`echoCancellation: false`). O `restrictOwnAudio` resolve.
- **Qualquer outro caso** (Windows 10, Linux, sem `userAgentData`): com cancelamento.

**Depois de começar, com som:**

- Leia `som.getSettings()` e `video.getSettings().displaySurface`, e escreva no console: `console.info("Som da tela:", ajustes, superficie)`. Ajuda a testar.
- **O som está limpo** quando vale qualquer um destes:
  - a superfície não é a tela inteira (`displaySurface !== "monitor"`): uma aba ou uma janela só levam o som delas;
  - o `restrictOwnAudio` dos ajustes é `true` num Windows 11 ou Mac;
  - o `echoCancellation` dos ajustes não é falso.
- **Se não estiver limpo,** pergunte com o `perguntar()`:
  - título: "As vozes da chamada vão junto";
  - texto: "Quem fala vai se ouvir de volta no som da sua tela. Dá para tirar o som da tela agora, ou escolher 'Sempre tirar as vozes da chamada' nas Configurações de voz.";
  - botões: "Tirar o som da tela" (tira a publicação do som e para a trilha; a imagem continua) e "Manter assim".
- **O aviso de hoje** (`navegadorTiraOSomDoChat` e `avisouDoSomDaTela`) sai: esta pergunta fica no lugar dele.

### 2.4 A qualidade

**O botão "Compartilhar a tela"**, quando você não está compartilhando, abre um menu (o `abrirMenu` do `chat.js`, com o título "Compartilhar a tela"). Compartilhando, ele só para, como hoje.

| Item do menu | Captura | Envio | `contentHint` | `degradationPreference` |
| --- | --- | --- | --- | --- |
| **Nítida**, para texto e mapas | até 1920 × 1080, 15 quadros | 2,5 Mbps, 15 quadros | `detail` | `maintain-resolution` |
| **Fluida**, para vídeos e jogos | até 1280 × 720, 30 quadros | 2,5 Mbps, 30 quadros | `motion` | `maintain-framerate` |
| **Máxima**: 1080p a 30 quadros, pede uma internet boa | até 1920 × 1080, 30 quadros | 5 Mbps, 30 quadros | `motion` | `maintain-framerate` |

- Cada item tem o nome em negrito e a explicação em letra menor, na mesma linha ou embaixo. Use o `conteudo` do item do menu.
- **A última escolha** fica marcada (`atual`) e guardada em `chat:voz:tela:qualidade`. O padrão é a Nítida, como hoje.
- **O simulcast** fica como está no LiveKit (ligado): quem tem internet fraca recebe uma camada menor.

### 2.5 O som da tela

- Em estéreo, 128 kbps, sem DTX e sem RED. O DTX corta os trechos baixos, bom para voz e ruim para música.
- O volume da tela de cada pessoa (clique direito) continua igual.

### 2.6 Tela cheia, para quem assiste

- **Num quadro de tela** (`quadro--tela`), um botão pequeno no canto de cima, à direita: "Tela cheia" (um desenho novo, `icone-tela-cheia`, de quatro cantos).
- **Ele pede `requestFullscreen()` no `figure` do quadro.**
  - Em tela cheia, o vídeo fica com `object-fit: contain` num fundo preto, e o rótulo continua embaixo.
  - O botão vira "Sair da tela cheia". Esc também sai.
- **No app,** ocupa a janela do chat inteira.
- **O clique no resto do quadro** continua ampliando e soltando, como hoje. O clique no botão não amplia nem solta (`stopPropagation`).

### 2.7 A dica do botão

O `DICA_DA_TELA` passa a ser: "Para levar o som: a tela inteira (marque 'Compartilhar áudio do sistema'), uma aba ou, no Windows 11, uma janela com o áudio dela."

### Prévia

Funcionam na prévia:

- o menu da qualidade;
- a escolha do som da tela e a dica (vale o que o navegador da prévia disser);
- o botão de tela cheia na tela simulada.

A captura de verdade não roda na prévia.

## Fora desta versão

- **"Segurar para falar":** o app já manda o `"soltou"`.
- **Capturar pelo app o som de um programa escolhido.** É como o Discord faz no Windows 11. Fica para depois, se o eco continuar no app mesmo com o cancelamento.
- **VP9 ou AV1 na tela.**
- **Trocar a qualidade sem parar a transmissão.**

## Testar no servidor (depois da atualização)

- **O atalho, no navegador:**
  - grave Ctrl + Shift + M;
  - numa chamada, com o chat na frente, ele troca o microfone, com o som e o aviso;
  - fora da chamada, nada;
  - escrevendo uma mensagem, Ctrl + Shift + M troca e não escreve nada.
- **O atalho, no app 1.4.0:**
  - numa chamada, com a janela do Foundry na frente, ele troca o microfone, e o som avisa;
  - fora da chamada, o Ctrl + Shift + M volta a funcionar nos outros programas;
  - com o app antigo, vale só com o chat na frente.
- **O eco.** Duas pessoas numa sala.
  - **Como testar:** A compartilha a tela inteira com o som do sistema, com um vídeo tocando. B fala. B não pode se ouvir no som da tela de A.
  - **Em quais casos:**
    - A no app e A no Chrome;
    - A num Windows 10 e num Windows 11 (se houver);
    - A compartilhando uma janela com o som dela (Windows 11).
  - **O que anotar:** em cada caso, se apareceu a pergunta "As vozes da chamada vão junto" e se houve eco.
  - **Se no Windows 11, no app, ainda houver eco no Automático,** o WebView2 não está cumprindo o `restrictOwnAudio`. Aí o Automático passa a ligar o cancelamento também no app (`window.cronicasEternasApp` presente): é uma linha na escolha do Automático.
- **A qualidade:**
  - a Fluida com um vídeo, e quem assiste vê sem travar a cada 15 quadros;
  - a Nítida com um mapa, e o texto legível.
- **A tela cheia:** num quadro de tela, o botão; Esc sai.

## Sessões

- **19.1 O atalho do microfone.** Inclui a parte 1 inteira. O `CLAUDE.md`, na linha do `voz.js`: o atalho do microfone (com o do app) e os sons de mudo e fala.

  **Testar (exceção ao CLAUDE.md):** com o Playwright na prévia, sem tirar prints, em 1366 × 768:
  - **gravar:**
    - Ctrl + Shift + M grava;
    - só M recusa com a mensagem;
    - F8 sozinho grava;
  - **numa sala de voz da prévia:** Ctrl + Shift + M troca o microfone simulado, e Ctrl + M não;
  - **com um `window.cronicasEternasApp` de mentira, posto antes da página:**
    - ao conectar, o `atalhoDoMicrofone` recebe `"Control+Shift+KeyM"`;
    - ao sair, recebe `null`;
    - o evento `cronicas-eternas:atalho` troca o microfone;
    - o `keydown` não troca de novo;
  - **com o `atalhoDoMicrofone` rejeitando:** o aviso, e o `keydown` volta a valer.
- **19.2 A tela compartilhada.** Use o modo de planejamento. Inclui a parte 2 inteira. O `CLAUDE.md`, na linha do `voz.js`: a captura própria da tela (qualidade, som sem as vozes e a pergunta) e a tela cheia.

  **Separe em funções soltas do `voz.js`:**
  - a montagem das opções do `getDisplayMedia` e das publicações, `opcoesDaTela(qualidade, tirarAsVozes)`;
  - a decisão do Automático, `tirarAsVozesNoAutomatico(plataforma, versao)`.

  **Testar (exceção ao CLAUDE.md):** com o Playwright na prévia, sem tirar prints, chamando essas funções pelo `page.evaluate`:
  - **as opções** para cada qualidade, com e sem tirar as vozes;
  - **o Automático** para Windows 10 (`"10.0.0"`), Windows 11 (`"15.0.0"`), macOS, Linux e sem `userAgentData`.

  **Também na prévia:**
  - o menu com as três qualidades e a marca na última;
  - a escolha do som e a dica;
  - o botão de tela cheia no quadro da tela simulada.
