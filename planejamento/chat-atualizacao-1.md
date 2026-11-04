# Chat: atualização 1

A primeira rodada de mudanças do chat (`planejamento/chat.md`): a caixa de escrever que sai da tela, perfil e card de quem fala, emojis, reações, GIFs, mensagens fixadas, áudio melhor com noise gate, sons da chamada, tela com áudio, mover pessoas entre salas e os avisos bloqueados. Decisões fechadas em 04/11/2026:

- todo mundo pode fixar mensagens;
- GIFs sem filtro de classificação;
- o noise gate começa ligado;
- nos canais de mesa, o card é o do personagem, com "jogado por".

Quatro sessões no portal: 12.1 servidor, 12.2 layout + perfil + card + avisos, 12.3 emojis + reações + GIFs + fixar, 12.4 voz. Veja "Sessões" no fim. Há também uma sessão no app, à parte (os avisos nativos). Vai para o servidor numa atualização só, depois das quatro juntas na `main`.

Em toda sessão: ao criar um arquivo novo, acrescente-o ao "Mapa do código" do `CLAUDE.md`.

## 1. A caixa de escrever fora da tela (correção)

**A causa:** `body.chat` tem `min-height: 640px` e `.chat-tela` tem `height: max(100vh, 640px)`. Com a janela mais baixa que 640 px (Windows com escala de 125% a 150%, barra de favoritos aberta), a página inteira rola, e ao focar ou clicar em algo a rolagem muda: às vezes some o topo, às vezes a caixa de escrever.

- **A página do chat nunca rola.** `html` e `body` do chat com `overflow: hidden`. `.chat-tela` e `.entrada` com `height: 100vh` e, logo depois, `height: 100dvh`. Sem altura mínima: o que não cabe rola dentro da própria coluna (lista, mensagens, membros) e dos diálogos.
- **Largura:**
  - sai o `min-width: 1100px`;
  - abaixo de 1100 px de largura, a coluna da direita some, e o botão de membros do cabeçalho abre ela por cima do centro (fecha ao clicar fora ou com Esc);
  - abaixo de 760 px, a página pode rolar de lado (`min-width: 760px`).

  Assim dá para deixar o chat ao lado do Foundry, com a tela dividida.
- **Exceção ao `CLAUDE.md` nesta correção:** meça com o Playwright na prévia, sem tirar prints. Nos tamanhos 1366 × 768, 1280 × 600, 1280 × 480, 1000 × 700 e 760 × 500:
  - `document.scrollingElement.scrollHeight === innerHeight`;
  - o fundo de `#escrever` fica dentro da janela;
  - o mesmo vale depois de abrir um canal com "Novas", de pular para uma mensagem respondida e de focar o campo.

## 2. Perfil (Geral e privadas)

Cada conta tem um perfil do chat. Ele vale só fora das mesas. Nas mesas, quem fala continua sendo o personagem. O portal (Mesas, Personagens...) não muda: lá continua o `conta.nome`.

### Os campos

| Campo | Regra |
| --- | --- |
| `apelido` | até 32 caracteres; vazio = o nome da conta |
| `foto` | imagem (`TIPOS_IMAGEM`, 10 MB), em `uploads/` com `guardarImagem`; aparece em círculo, cortada no centro |
| `faixa` | imagem (mesmas regras), a faixa do topo do card, cortada em 3:1; sem imagem, a faixa é a `cor` |
| `cor` | `#rrggbb` (o seletor de cor do navegador); a moldura do card e a faixa sem imagem. Padrão: a cor do selo da conta |
| `frase` | até 80 caracteres, uma linha; aparece embaixo do nome na coluna da direita e no card |
| `sobre` | "Sobre mim", até 300 caracteres, com quebras de linha e as marcas das mensagens (sem menções nem imagens) |

Trocar ou remover uma imagem apaga a anterior.

### No servidor

- Os perfis ficam em `dados.chat.perfis[usuario]`, no `dados.json`, porque mudam pouco. Cada um tem os campos acima e `alteradoEm`.
- **A persona da conta muda:** `nome` = `apelido` ou `conta.nome`, e `imagem` = `foto` ou `null`. Isso vale em todo lugar onde ela já aparece:
  - mensagens da Geral e das privadas, inclusive as antigas, pelo `personaAtual`;
  - menções e `personasDosMembros`;
  - lista de privadas e "Nova conversa", com o apelido grande e o nome da conta pequeno;
  - salas de voz da Geral, porque o passe já leva a persona;
  - avisos.
- **`PUT /api/chat/perfil`** recebe um formulário com `apelido`, `cor`, `frase`, `sobre`, `foto`, `faixa`, `remover_foto` e `remover_faixa`, e responde `{ perfil }`. Dispara o evento `perfil` com `{ usuario, perfil }`, para todos.
- **`GET /api/chat`** ganha `perfis`: `{ usuario: perfil }` de todas as contas.
- **Ganchos:** `renomearConta` move a chave do perfil; `excluirConta` apaga o perfil e as imagens.

### Na página

- **Configurações → "Seu perfil"** (o primeiro item da engrenagem) abre um diálogo com os campos à esquerda e a prévia do card à direita. A prévia acompanha o que você digita.

## 3. O card de quem fala

**Onde abre:** ao clicar no nome ou na imagem de alguém na coluna da direita, numa mensagem ou nas salas de voz (lista e quadros). O card aparece ao lado do que foi clicado, com uns 300 px de largura. Fecha ao clicar fora ou com Esc.

**Persona conta** (Geral e privadas):
- a faixa (imagem ou cor), com a foto grande sobre a borda;
- o apelido, e o nome da conta pequeno quando for diferente;
- a frase e o "Sobre mim";
- "No chat agora" e a sala de voz em que a pessoa está, se você vê essa sala;
- o botão "Mensagem privada" (outra pessoa) ou "Editar perfil" (você);
- a moldura na cor do perfil.

**Persona personagem** (mesas):
- o retrato grande e o nome na fonte do personagem;
- a mesa, com a cor dela;
- "jogado por", com a foto pequena e o apelido do dono; clicar nisso abre o card do perfil dele;
- o link "Ver ficha", que leva a `https://<domínio do portal>/personagens/#personagem-<id>`, o endereço que a galeria já abre:
  - no navegador, com `target="cronicas-portal"`;
  - no app (`window.cronicasEternasApp` existe), sem `target`, e o app leva para a janela principal.

**Mestre:** o logo da mesa (ou o selo "M"), "Mestre", a mesa e "jogado por" com o apelido do administrador.

**Outro personagem** (NPC):
- o retrato, o nome e a mesa;
- "interpretado por" com o apelido do administrador;
- "Ver ficha", se a galeria abrir outros personagens pelo mesmo endereço.

## 4. Avisos bloqueados

- **No navegador**, com a permissão `denied`, o item da engrenagem explica: "Os avisos estão bloqueados neste navegador. Clique no cadeado à esquerda do endereço, ponha Notificações em Permitir e recarregue a página." O site não consegue desbloquear sozinho.
- **No app**, o navegador embutido do Windows recusa os avisos. O app novo (sessão à parte) vai ter `window.cronicasEternasApp.avisar(titulo, corpo)`, que mostra uma notificação do Windows.
  - Quando `avisar` existir, a página usa ela no lugar do `Notification`, sem pedir permissão.
  - O item da engrenagem vira "Avisos do app: ligados" ou "desligados", guardado em `chat:avisos-app` (padrão ligado).
  - As regras de quando avisar não mudam (o nível de cada canal, o canal aberto com a janela em foco...).
- **App antigo** (sem `avisar`): continua como hoje. No bloqueado, o texto diz: "Atualize o app para receber avisos."

## 5. Emojis

### Os dados

- `publico/chat/emojis.js` é um arquivo só de dados. Ele declara `EMOJIS`, uma lista de grupos `{ id, nome, icone, emojis: [{ e: "😀", n: "rosto risonho", p: ["feliz", "sorriso"] }] }`.
- Ele é gerado nesta sessão por `planejamento/ferramentas/gerar-emojis.mjs`, a partir dos pacotes npm `unicode-emoji-json` (a lista, os grupos e a ordem) e `cldr-annotations-full` (os nomes e as palavras em português, `pt`).
- Os pacotes são instalados só para gerar, fora de `portal/`, e o portal continua sem dependências.
- Até a versão 15.0 do Emoji (o Windows mostra todos) e sem tons de pele.
- As licenças vão em `publico/chat/LICENCA-emojis.txt`.
- Grupos: Rostos e pessoas, Animais e natureza, Comida e bebida, Atividades, Viagens e lugares, Objetos, Símbolos e Bandeiras. Antes deles, os Recentes: os últimos 24 usados, em `chat:emojis:recentes`.

### Na página

- **O seletor:** um botão de emoji no campo de escrever, ao lado do de imagem, abre um painel de uns 360 × 400 px com:
  - a busca no topo, pelo nome e pelas palavras, sem acento e sem diferença entre maiúscula e minúscula;
  - as abas dos grupos;
  - a grade.

  Clicar insere no cursor e fecha. Shift + clique insere e deixa aberto.
- **`:` + duas letras** (sem espaço) mostra até 8 sugestões acima do campo. ↑ e ↓ escolhem, Enter ou Tab inserem e Esc fecha.
- **Mensagem só de emojis** (até 27, ignorando espaços, sem nada mais) aparece com o dobro do tamanho.

## 6. Reações

- **Ao passar o mouse**, o primeiro botão das ações da mensagem é "Reagir" e abre o mesmo seletor.
- **Embaixo da mensagem** ficam as reações, como "😂 3", na ordem em que apareceram.
  - A sua tem a borda em `--brasa`, e clicar põe ou tira a sua.
  - Um `+` no fim abre o seletor.
  - Passar o mouse mostra "Neia, Takezo e Frati reagiram com 😂", com o nome da persona de cada um naquele canal. Com mais de 10 pessoas, termina em "e mais 3".
- **Limites:**
  - até 20 emojis diferentes por mensagem;
  - o servidor aceita só um texto que seja um emoji: `\p{Extended_Pictographic}`, `\p{Regional_Indicator}`, `\p{Emoji_Modifier}`, U+200D, U+FE0F, U+20E3 e os keycaps, com até 32 unidades de código.
- **Também nas privadas.** Na privada com uma conta excluída, não.
- **Dados:** ficam em `chat/reacoes.json` (`{ idMensagem: { emoji: [usuarios] } }`), gravado como o `estado.json`: no máximo a cada 2 segundos, com arquivo temporário e troca de nome.
  - Apagar uma mensagem, um canal ou uma mesa tira as reações.
  - Renomear uma conta troca o usuário.
  - Excluir uma conta tira as reações dela.
- **`PUT /api/chat/mensagens/:id/reacoes`** recebe `{ emoji, ligado }` e responde `{ reacoes }`. Dispara o evento `reacoes` com `{ id, canal, reacoes }`, para quem vê.
- **A mensagem pública** ganha `reacoes: [{ emoji, usuarios: [...] }]`.

## 7. GIFs (Klipy)

### Configuração

| Campo | Variável | Padrão |
| --- | --- | --- |
| `klipyChave` | `KLIPY_CHAVE` | `""` |
| `klipyBase` | `KLIPY_BASE` | `https://api.klipy.com/api/v1` (outro só para teste) |
| `klipyMidia` | `KLIPY_MIDIA` | o host (ou os hosts, separados por vírgula) das mídias da Klipy: confira numa resposta real e ponha o padrão |

Sem chave, o `GET /api/chat` traz `gifs: false` e o botão de GIF não aparece.

**Antes de escrever**, leia na documentação da Klipy (docs.klipy.com):
- os nomes exatos dos parâmetros e o formato de cada item;
- como vêm os anúncios;
- as regras de atribuição ("API Usage & Attribution Guidelines").

### No servidor

- **`GET /api/chat/gifs?q=<texto>&pagina=<n>`**: sem `q`, os em alta.
  - O portal chama a Klipy (`<base>/<chave>/gifs/search` ou `/trending`) com 24 por página, a página pedida, `locale` de português do Brasil e `rating=r` (sem filtro).
  - O `customer_id` é um código curto e fixo por conta: os 16 primeiros caracteres do HMAC-SHA256 do usuário com o segredo do portal. Nunca vai o usuário.
- **Resposta:** `{ gifs: [{ id, titulo, previa: { url, largura, altura }, url, largura, altura }], maisPaginas }`.
  - Só entram os itens que são GIF: anúncios e outros tipos saem.
  - `previa` é o tamanho pequeno (WebP, se houver); `url` é o médio.
- **Cache na memória:** 15 minutos por busca (texto normalizado + página), até 300 buscas guardadas. A chave de teste da Klipy aceita poucos pedidos por hora.
- **Limites:**
  - até 20 buscas por minuto por conta (429);
  - Klipy fora do ar ou limite esgotado: 503 "Os GIFs não estão disponíveis agora."
- **Envio:** o `POST .../mensagens` aceita `gif: "<id>"` (em JSON). O servidor procura o id no que ele mesmo entregou (o cache) ou, se não achar, pede o item à Klipy.
  - A mensagem ganha `gif: { id, url, largura, altura, titulo }` e pode ficar sem texto.
  - O servidor aceita só um `url` https de um host de `klipyMidia`. A página nunca manda um endereço.
  - `conferirMensagem` passa a aceitar o campo `gif`.
  - Editar uma mensagem com GIF muda só o texto.
- **A CSP do chat:** `img-src` ganha os hosts de `klipyMidia`.

### Na página

- **O painel:** um botão "GIF" ao lado do de emoji abre um painel de uns 420 × 460 px:
  - a busca espera 400 ms depois de você parar de digitar;
  - grade de duas colunas;
  - mais resultados ao rolar até o fim;
  - os créditos da Klipy como as regras dela pedem (por exemplo, "Pesquisar na KLIPY" e "Powered by KLIPY").
- **Clicar num GIF** envia na hora uma mensagem só com ele. Se você estava respondendo, vai como resposta. O texto do campo fica no campo.
- **Na mensagem:**
  - `<img>` com largura máxima de 360 px, na proporção do GIF, com a altura reservada antes de carregar, para a rolagem não pular;
  - clicar abre grande, como as imagens;
  - nos avisos, nos trechos de resposta e nas fixadas, a mensagem só com GIF aparece como "(GIF)".

## 8. Fixar mensagens

- **Quem fixa:** todo mundo que vê o canal fixa e desafixa qualquer mensagem. Nas privadas, as duas pessoas. Até 50 por canal: na 51ª, "Desafixe uma antes."
- **Na mensagem:** "Fixar" e "Desafixar" (ícone de alfinete) nas ações. A mensagem fixada ganha um alfinete pequeno ao lado da hora.
- **No cabeçalho do canal**, um botão de alfinete com o número de fixadas abre um painel. Nele, as fixadas aparecem da mais recente para a mais antiga. Cada uma traz:
  - a mensagem resumida;
  - "fixada por <persona> em <data>";
  - "Ir até", que carrega o histórico até ela, se precisar;
  - "Desafixar".
- **Dados:** ficam em `chat/fixadas.json` (`{ chave: [{ id, por, em }] }`), gravado como o `reacoes.json`. Apagar uma mensagem desafixa ela; apagar um canal tira tudo dele.
- **Rotas:**
  - `GET /api/chat/canais/:id/fixadas` e `GET /api/chat/privadas/:usuario/fixadas` respondem `{ fixadas: [{ mensagem, por, em }] }`, com a mensagem completa, mesmo fora do histórico carregado;
  - `PUT /api/chat/mensagens/:id/fixada` recebe `{ fixada }`.

  Dispara o evento `fixadas` com `{ canal, quantas }`.
- **Formatos:** `GET /api/chat` ganha `fixadas`: `{ chave: quantas }`. A mensagem pública ganha `fixada`.

## 9. Voz

### 9.1 O áudio

- **Novos padrões:** cancelamento de eco desligado, supressão de ruído desligada, ganho automático ligado (agora com opção).
- **Taxa:** 96 kbps em vez de 48 (`publishDefaults.audioPreset = AudioPresets.musicHighQuality`), em mono. DTX e RED continuam como estão.
- **As escolhas antigas de eco e ruído não valem mais.** A chave passa a ser `chat:voz:aparelhos:2`; da antiga, copie só o microfone, a saída e a câmera escolhidos.
- **Nas configurações de voz:** "Cancelamento de eco", "Supressão de ruído do navegador" e "Ganho automático", com a frase: "Sem fone, ligue o cancelamento de eco: senão os outros ouvem a própria voz de volta."

### 9.2 Noise gate

- **Nas configurações de voz**, um bloco "Sensibilidade do microfone":
  - liga e desliga (padrão ligado);
  - o ponto de corte vai de −80 a 0 dB (padrão −50 dB) e é uma linha arrastável sobre a barra de nível do teste do microfone (a que já existe);
  - a barra acende verde acima do corte.

  Fica guardado em `chat:voz:portao`.
- **Como funciona:** um AudioWorklet em `publico/chat/portao-de-ruido.js` (arquivo próprio, carregado com `audioWorklet.addModule`), aplicado ao microfone como processador do LiveKit (`setProcessor` na trilha local).
  - Abre quando o nível (RMS em janelas de 10 ms) passa do corte.
  - Ataque de 5 ms, segura 250 ms e solta em 120 ms.
  - Mudar o corte vale na hora, por mensagem ao worklet.
- **Desligado:** sem processador.
- **Se o processador falhar** (navegador sem AudioWorklet), segue sem o gate e avisa uma vez.

### 9.3 Sons da chamada

- Feitos com Web Audio, sem arquivo, em volume baixo:
  - você entrou: duas notas subindo;
  - você saiu: duas notas descendo;
  - alguém entrou na sua sala: uma nota curta subindo;
  - alguém saiu da sua sala: uma nota curta descendo.
- Trocar de sala toca só o "entrou".
- "Sons da chamada" nas configurações de voz (padrão ligado), à parte do "Som dos avisos".

### 9.4 Tela com áudio

- **Compartilhar pede o som:** `audio: true`, `systemAudio: "include"`, `selfBrowserSurface: "exclude"`, e `restrictOwnAudio: true` nas restrições do áudio, para o som do próprio chat (as vozes da chamada) não ir junto. Se o LiveKit não repassar `restrictOwnAudio` ao `getDisplayMedia`, capture com o `getDisplayMedia` direto e publique as trilhas com as fontes `ScreenShare` e `ScreenShareAudio`.
- **Navegador sem `restrictOwnAudio`** (`getSupportedConstraints().restrictOwnAudio` falso): antes de compartilhar, avisa: "Seu navegador não consegue tirar o som do chat da transmissão. Compartilhe só uma aba, ou desmarque 'Compartilhar áudio'."
- **Dica no botão Tela** (no `title`): "Para levar o som, escolha a tela inteira (com 'Compartilhar áudio do sistema') ou uma aba. Uma janela sozinha não leva som."
- **Para quem assiste:**
  - o som da tela tem volume próprio no menu de volume da pessoa ("Volume da tela"), num campo novo em `chat:voz:volumes`;
  - o quadro da tela mostra um ícone de som quando há áudio.

### 9.5 Mover pessoas (administrador)

- **Arrastar:** só para o administrador, as pessoas embaixo das salas de voz, na lista da esquerda, ficam arrastáveis. Soltar sobre outra sala de voz move a pessoa.
- **Clique direito** numa pessoa (na lista ou no quadro) mostra "Mover para…", com as salas de voz que ela vê.
- **`POST /api/chat/voz/mover`** recebe `{ usuario, canal }` (só o administrador). O servidor confere:
  - que a pessoa está numa sala, pelo que o LiveKit disse por último;
  - que o destino é uma sala de voz;
  - que ela vê esse destino.

  Depois, manda o evento `mover` com `{ canal }` só para as conexões dela. Sem conexão aberta: 409 "Essa pessoa não está com o chat aberto."
- **A página que recebe `mover`:**
  - se estiver numa sala, troca de sala (`entrarNaSala`), mantendo o mudo e o ensurdecido, e mostra "Você foi movido para <sala>.";
  - fora de sala, ignora.

  Numa sala de mesa, a pessoa entra como o personagem dela, pela persona escolhida.
- Soltar na sala em que a pessoa já está não faz nada.

## Resumo dos formatos novos

- **`GET /api/chat`:** `perfis`, `gifs` (verdadeiro ou falso), `fixadas`.
- **Mensagem pública:** `gif`, `reacoes`, `fixada`.
- **Eventos novos:** `perfil`, `reacoes`, `fixadas`, `mover`.
- **Arquivos novos em `/var/lib/portal/chat/`:** `reacoes.json`, `fixadas.json`.

## Prévia

A API de mentira ganha:
- perfis com foto e faixa;
- reações e fixadas;
- uns 12 GIFs de exemplo, com imagens geradas na própria página (um canvas, sem rede);
- na voz simulada, os sons e o "mover".

## Na VPS (comigo)

- Criar a chave da Klipy e pôr `KLIPY_CHAVE` no override do `portal.service`.
- O nginx não muda.

## Fora desta versão

- emojis próprios do grupo e figurinhas;
- tons de pele;
- GIFs favoritos;
- busca nas fixadas;
- perfil nas mesas: lá, o personagem é o perfil;
- avisos com o chat fechado;
- clicar no aviso do app e abrir o canal;
- supressão de ruído por IA (como a Krisp do Discord).

## Testar no servidor (depois da atualização)

- **A janela:**
  - o chat numa janela baixa e estreita, e lado a lado com o Foundry;
  - a caixa de escrever sempre visível.
- **Perfil:**
  - mudar foto, apelido, faixa, cor, frase e "Sobre mim";
  - o apelido na Geral, nas privadas e nas menções;
  - nas mesas, continua o personagem.
- **Card:**
  - o do perfil na Geral;
  - o do personagem, com "jogado por" e "Ver ficha", numa mesa.
- **Emojis, reações e GIFs:**
  - o seletor e o `:`;
  - reações com o nome de quem reagiu;
  - GIFs em alta e na busca.
- **Fixar:** fixar e desafixar, por duas contas.
- **Voz:**
  - o som novo, sem eco nem supressão (e as escolhas de microfone, saída e câmera mantidas);
  - o noise gate cortando o barulho de fundo, arrastando a linha com o teste do microfone ligado;
  - os sons de entrar e sair, e de alguém entrar e sair da sua sala (trocar de sala toca só o de entrar);
  - a tela inteira com som do sistema, sem a voz de ninguém voltar; o ícone de som no quadro e o "Volume da tela";
  - num navegador sem `restrictOwnAudio`, o aviso antes de compartilhar;
  - mover alguém arrastando e pelo clique direito, mudo e ensurdecido, e numa sala de mesa (entra como o personagem).
- **Avisos:**
  - no navegador, o texto do bloqueado;
  - no app novo, a notificação do Windows.

## Sessões

- **12.1 Servidor:**
  - o que muda:
    - perfis (rota, persona da conta, ganchos);
    - reações e fixadas (os arquivos, as rotas e os eventos);
    - GIFs (configuração, a rota com cache e limites, o envio com `gif` e a CSP do chat);
    - o `voz/mover`;
    - os formatos novos;
    - o `CLAUDE.md` (as variáveis da Klipy e os arquivos novos).
  - testar com `curl`:
    - perfil com foto, o apelido nas mensagens antigas e novas, renomear e excluir conta;
    - reações e fixadas por duas contas e numa privada, e o administrador fora da privada dos outros;
    - os limites (21º emoji, 51ª fixada, texto que não é emoji);
    - GIFs contra um servidor de mentira local no lugar da Klipy (`KLIPY_BASE=http://127.0.0.1:<porta>`), com respostas no formato real da documentação: o cache, o 429, o 503, o envio por id e um id desconhecido;
    - o `mover` com duas contas ouvindo os eventos.
- **12.2 Página, layout, perfil, card e avisos.** Use o modo de planejamento.
  - o que muda:
    - a correção do layout, com as medições do item 1;
    - "Seu perfil" com a prévia;
    - o card nos três lugares, nas quatro personas;
    - os avisos (texto do bloqueado e a ponte do app);
    - a prévia.
- **12.3 Página, emojis, reações, GIFs e fixar.** Use o modo de planejamento.
  - o que muda:
    - gerar `emojis.js` (o script e as licenças);
    - o seletor, o `:` e a mensagem só de emojis;
    - as reações;
    - o painel de GIFs e o GIF na mensagem;
    - fixar, o alfinete e o painel;
    - a prévia.
- **12.4 Voz.** Use o modo de planejamento.
  - o que muda:
    - os padrões e a taxa do áudio, com a chave nova;
    - o noise gate (o worklet, o bloco nas configurações e a barra com o corte);
    - os sons da chamada;
    - a tela com áudio e o volume da tela;
    - mover (arrastar, clique direito e receber `mover`);
    - a voz simulada da prévia;
    - revisar a lista "Testar no servidor".
