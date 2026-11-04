# Chat

Um Discord simplificado do grupo, em **chat.cronicaseternas.com**: canais de texto, salas de voz e vídeo e mensagens privadas, com as contas do portal. Só para computador. Decisões fechadas em 03/11/2026.

Cinco sessões no portal (11.1 e 11.2 servidor, 11.3 a 11.5 página) e uma no app, noutro repositório (`janela-do-chat.md`). Veja "Sessões" no fim. Vai para o servidor numa atualização só, depois das cinco juntas na `main`. A VPS (LiveKit, nginx, DNS, variáveis) é preparada à parte, por um tutorial meu, e nada disso fica neste repositório.

Em toda sessão: ao criar um arquivo novo, acrescente-o ao "Mapa do código" do `CLAUDE.md`.

## O que muda nas regras do código

- **Voz e vídeo usam o LiveKit**, um servidor de mídia que roda na VPS como serviço próprio (`livekit.service`), fora do portal, como o Foundry. O portal só conversa com ele.
- **No servidor do portal, a regra continua: nenhuma biblioteca.** O passe de entrada numa sala é um JWT HS256 feito com `node:crypto`, e as consultas ao LiveKit usam `fetch`.
- **Na página, uma exceção só:** `publico/chat/livekit-client.js`, cópia do arquivo UMD do pacote npm `livekit-client` (licença Apache 2.0), numa versão fixa. Ele fica no repositório e é servido pelo próprio portal, sem CDN. Ao lado, `publico/chat/LICENCA-livekit.txt`, com a licença e a versão. Ninguém atualiza esse arquivo de passagem: só numa sessão que peça isso.
- WebRTC direto do navegador, sem o LiveKit, foi descartado: com 8 pessoas, cada uma mandaria o vídeo 7 vezes, e a tela compartilhada pesaria demais na internet de quem compartilha.

## Endereços

- **chat.cronicaseternas.com**: a página do chat, servida pelo mesmo portal (porta 3000), num bloco novo do nginx.
- **voz.cronicaseternas.com**: o LiveKit. A sinalização passa pelo nginx (wss); o áudio e o vídeo vão direto às portas 7881/tcp e 7882/udp.
- Em localhost e na prévia, o chat é a pasta `/chat/` como qualquer página.

### Configuração (`servidor/base.js`, no `CONFIG`)

| Campo | Variável | Padrão | Para quê |
| --- | --- | --- | --- |
| `hostChat` | `HOST_CHAT` | `""` | o endereço do chat; vazio = nada muda |
| `dominioCookie` | `DOMINIO_COOKIE` | `""` | o login vale no domínio e nos subdomínios |
| `livekitUrl` | `LIVEKIT_URL` | `""` | o endereço público da voz (`wss://voz.cronicaseternas.com`) |
| `livekitInterno` | `LIVEKIT_INTERNO` | `http://127.0.0.1:7880` | onde o portal consulta o LiveKit |
| `livekitChave` | `LIVEKIT_CHAVE` | `""` | a chave do LiveKit |
| `livekitSegredo` | `LIVEKIT_SEGREDO` | `""` | o segredo do LiveKit |

Sem `livekitUrl`, chave ou segredo, a voz responde **503** "A voz ainda não está configurada no servidor." e o texto funciona normal.

### O endereço do chat no `servidor.js`

- Pedido com `Host` igual a `CONFIG.hostChat` (sem a porta) e caminho `/` → serve `publico/chat/index.html`.
- No endereço do chat, outro caminho que termina em `/` (uma página do portal) → **302** para `https://<domínio principal><caminho>`. O domínio principal é o `hostChat` sem o primeiro rótulo (`chat.`).
- Com `hostChat` configurado, `/chat/` no domínio principal → **302** para `https://<hostChat>/`. Assim o chat tem uma origem só (avisos do navegador e permissões de microfone valem por origem).
- O resto (`/api/...`, `/uploads/...`, `style.css`, `comum.js`, os arquivos de `chat/`) é servido igual nos dois endereços.
- **A CSP do chat** é a mesma de hoje com duas mudanças, só no html do chat:
  - `connect-src 'self'` mais `wss://` e `https://` do host de `livekitUrl`;
  - `media-src 'self' blob: mediastream:`.

### Login compartilhado (`servidor/base.js`)

Hoje o cookie `sessao` vale só em cronicaseternas.com. O chat precisa do mesmo login em chat.cronicaseternas.com.

- Com `dominioCookie` configurado, o cookie da sessão passa a se chamar **`ce_sessao`** e leva `Domain=<dominioCookie>`. O conteúdo (o token) é o mesmo de hoje. Sem `dominioCookie` (no PC), nada muda: continua `sessao`, sem `Domain`.
- Crie `tokenDaSessao(req)`, que lê `ce_sessao` e, se não houver, `sessao`. Use-a no `servidor.js` nos dois lugares que hoje leem `lerCookies(req).sessao` (a rota pública e a sessão).
- **Migração sozinha:** quando a sessão válida veio do cookie antigo `sessao` e `dominioCookie` está configurado, a resposta leva também `cookieDaConta(conta, lembrar)` com o nome novo e um `Set-Cookie` que apaga o `sessao` antigo (`Max-Age=0`, sem `Domain`). Assim quem já estava logado no portal passa a abrir o chat logado depois de usar qualquer página do portal uma vez.
- `/api/entrar` cria `ce_sessao` e apaga `sessao`. `/api/sair` apaga os dois.
- O Foundry (vtt.cronicaseternas.com) passa a receber esse cookie também. Não faz diferença: ele não usa esse nome.

## Na barra de cima do portal (sessão 11.5)

- Um botão **Chat** (ícone de balão de fala, traço 24 × 24 como os da barra lateral) no `.topo__conta`, **à esquerda do `#nome-conta`**, em todas as páginas que têm `#nome-conta`. O `comum.js` cria o botão sozinho. Não aparece na página do chat nem em `ler/`.
- Endereço: no servidor, `https://chat.<domínio da página>/`; em localhost, `${RAIZ}chat/`; na prévia como arquivo, `${RAIZ}chat/index.html`.
- No navegador, abre com `target="cronicas-chat"`: clicar de novo volta para a mesma aba em vez de abrir outra. No app (`window.cronicasEternasApp` existe), abre na mesma janela: o app intercepta o endereço e abre a janela do chat.
- **A marca de não lidas:** `/api/barra` ganha `chat: { naoLidas, mencoes }` (veja "Não lidas"). Com `naoLidas > 0`, um ponto na cor `--brasa` no botão. Com `mencoes > 0`, o número no lugar do ponto. O `atualizarBarra()` já roda em toda página com barra lateral: ele acende o botão também.

## Estrutura

Um espaço só, o do grupo. Na lista da esquerda:

1. **Geral**: todo mundo vê. Nasce com o canal de texto "geral" e a sala de voz "Sala comum".
2. **Uma categoria por mesa**: o nome e a cor são os da mesa (`dados.campanhas`), lidos na hora, sem cópia. Nasce com o canal de texto "conversa" e a sala de voz "Sessão".
3. **Mensagens privadas**, com o botão de nova conversa.

### Quem vê uma categoria de mesa

- O **administrador** vê todas.
- Qualquer outra conta (editor ou jogador) vê a categoria de uma mesa **só se for dona de pelo menos um personagem do portal daquela mesa** (`dados.personagens` com `dono` igual ao usuário e `campanha` igual ao id da mesa).
- A conta é conferida a cada pedido. Um personagem novo numa mesa faz a categoria aparecer na hora, e quem perde o último personagem da mesa deixa de ver os canais dela. O histórico continua lá.

### Os canais

- Dois tipos: **texto** e **voz**. Nome até 40 caracteres, livre (acentos e espaços valem). Até 20 canais por categoria.
- **Só o administrador** cria, renomeia, muda a ordem e apaga canais, e escolhe quais mesas têm categoria e em que ordem elas aparecem.
- Na primeira vez, o `iniciar()` cria a Geral e uma categoria para cada mesa com `naPaginaMesas !== false` e pelo menos um personagem do portal.
- Uma mesa excluída leva junto a categoria, os canais e o histórico deles (gancho `excluirMesa`).
- A Geral não pode ser apagada nem renomeada.

### Em `dados.chat` (no `dados.json`)

Só a estrutura fica no `dados.json`, porque quase não muda:

```json
{
  "formato": 1,
  "categorias": [
    { "id": "geral", "mesa": null, "ordem": 0 },
    { "id": "mesa-ode-to-sleep", "mesa": "ode-to-sleep", "ordem": 1 }
  ],
  "canais": [
    { "id": "canal-…", "categoria": "geral", "tipo": "texto", "nome": "geral", "ordem": 0, "criadoEm": "…" },
    { "id": "canal-…", "categoria": "geral", "tipo": "voz", "nome": "Sala comum", "ordem": 1, "criadoEm": "…" }
  ]
}
```

## Quem fala: a persona

Toda mensagem e toda entrada numa sala têm uma **persona**: o nome e a imagem que aparecem.

- **Na Geral e nas privadas:** a conta. Nome = `conta.nome`. Imagem = um selo com a inicial do nome, numa cor tirada do usuário (uma lista curta de tons do visual, escolhida por um cálculo simples sobre o usuário, sempre a mesma para a mesma conta).
- **Nos canais de uma mesa (texto e voz): obrigatoriamente um personagem do portal daquela mesa.** Nome = `personagem.nome`, escrito na fonte do personagem (`fonte`, com o `aplicarFonte()` do `comum.js`). Imagem = `personagem.retrato`; sem retrato, o selo com a inicial na cor da mesa.
  - Com um personagem só na mesa, é ele, sem escolha.
  - Com mais de um, a pessoa escolhe num seletor (retrato + nome) no campo de escrever. A escolha fica guardada por mesa, no servidor, e vale para o texto e para a próxima entrada na voz. Trocar de personagem dentro da sala vale só ao sair e entrar de novo.
- **O administrador nos canais de uma mesa** escolhe, no mesmo seletor, entre **Mestre** (imagem = o logo da mesa, `titulo`, ou o selo "M" na cor da mesa) e qualquer outro personagem (`dados.outrosPersonagens`) que tenha a mesa em `mesas`. O padrão é Mestre.
- Passando o mouse no nome de uma persona aparece "por <nome da conta>".
- O servidor confere a persona de cada mensagem e de cada entrada na voz. Persona que a conta não pode usar ali → **403**.
- A mensagem guarda o `tipo` e o `id` da persona e uma cópia do nome, da imagem e da fonte. Na tela vale o nome e a imagem de agora, se o personagem ainda existe; senão, a cópia.

## Mensagens

- Texto até **4.000** caracteres e até **4 imagens** (`TIPOS_IMAGEM`, 10 MB cada). Mensagem vazia sem imagem não vale.
- **Formatação** (só estas): `**negrito**`, `*itálico*`, `~~riscado~~`, `||spoiler||` (escondido até clicar), `` `código` ``, bloco entre ```` ``` ````, linha começando com `> ` (citação) e links `http(s)://` clicáveis, que abrem em outra aba com `rel="noopener"`. A página monta tudo com elementos e `textContent`, **nunca `innerHTML`**.
- **Responder:** a mensagem mostra em cima um trecho da original, com a persona; clicar no trecho rola até ela.
- **Editar:** só o autor. A mensagem ganha "(editada)".
- **Apagar:** o autor ou o administrador. A mensagem some para todos, com as imagens.
- **Menções:** `@` no campo abre a lista de quem pode ver o canal, mais `@todos`. No texto guardado vira `<@usuario>` ou `<@todos>`. Na tela aparece como `@` + o nome da persona daquela pessoa naquele canal (na mesa, o personagem escolhido por ela; o administrador como Mestre; na Geral, o nome da conta). Menção a você fica com fundo realçado.
- **Agrupamento:** mensagens seguidas da mesma persona, com até 5 minutos entre elas, ficam sob um cabeçalho só (imagem, nome e hora na primeira).
- **Datas:** hora real, não o Ciclo de Sylara. Entre dias, uma linha "3 de novembro de 2026". Onde começam as não lidas, uma linha "Novas".
- **Histórico:** 50 mensagens por vez, mais 50 ao rolar até o topo.
- **Imagens:** miniatura na mensagem; clique abre grande num diálogo. Entram por botão, Ctrl+V ou arrastando para o campo.
- **Limite:** 10 mensagens em 10 segundos por conta. Acima disso, **429** "Calma: espere alguns segundos."

## Mensagens privadas

- Entre duas contas, qualquer uma (o administrador também). Sem grupos.
- **Só as duas leem. O administrador não lê as privadas dos outros.** É a exceção a "o administrador faz tudo".
- A persona é sempre a conta. Formatação, imagens, responder, editar e apagar, como nos canais (apagar: só o autor).
- "Nova conversa" lista as contas. A conversa entra na lista com a primeira mensagem. Dá para ocultar uma conversa da lista; ela volta quando chega mensagem nova.
- Conversa com uma conta excluída: o histórico fica, com os nomes guardados, e o campo de escrever fica desligado.

## Não lidas

- O servidor guarda, por conta e por canal (ou privada), a última mensagem vista. Por isso o app e o navegador ficam iguais.
- A página manda "lida até" quando o canal está aberto e a janela tem foco, no máximo uma vez por segundo.
- Na lista: canal com não lidas fica com o nome mais claro; com menção a você, um número na cor `--brasa`. Privada não lida conta como menção.
- O título da aba: `(3) Chat · Crônicas Eternas`, em que 3 = menções + privadas não lidas.
- `naoLidas` (para o botão do portal) = mensagens não lidas, de outras pessoas, nos canais com aviso "Tudo" + privadas não lidas. `mencoes` = menções não lidas + privadas não lidas.

## Avisos (sessão 11.5)

- Avisos do navegador (API `Notification`) enquanto o chat está aberto, mesmo noutra aba ou com a janela minimizada. A permissão é pedida por um botão "Ativar avisos" nas configurações, nunca sozinha ao abrir.
- **Por canal**, no menu do canal: **Tudo**, **Só menções** ou **Nada**. Padrão: Tudo. Privadas: sempre Tudo.
- Sem aviso para mensagens suas, nem para o canal que está aberto com a janela em foco.
- O aviso: título "<persona> em #<canal>" (privada: "<nome> (privada)"), texto com até 120 caracteres, spoilers trocados por "▒▒▒". Clicar traz a janela para a frente e abre o canal.
- **Som:** um toque curto feito com Web Audio (sem arquivo), junto com o aviso. Liga e desliga nas configurações.
- Com o chat fechado, nenhum aviso. Quem está no portal vê a marca no botão Chat.

## Voz e vídeo

### Na página

- **Salas fixas:** clicar numa sala entra nela; estando numa, clicar noutra troca. Uma sala por vez. Entra com o microfone ligado e a câmera desligada.
- **Quem está em cada sala** aparece embaixo do nome dela, para todos que veem o canal, mesmo sem entrar: imagem e nome da persona, com ícones de mudo, ensurdecido, câmera e tela.
- **Painel de voz**, fixo embaixo da lista da esquerda enquanto conectado: o nome da sala, o estado ("Conectado", "Reconectando…") e os botões **Microfone**, **Ensurdecer**, **Câmera**, **Tela** e **Sair**. Continua conectado ao navegar pelos canais de texto e pelas privadas.
- **A sala aberta no centro:** uma grade de quadros, um por pessoa. Com câmera, o vídeo; sem, a imagem da persona. A moldura de quem fala acende em `--brasa`. Uma tela compartilhada ocupa o quadro grande e os outros vão para uma faixa embaixo. Clicar num quadro amplia.
- **Configurações de voz** (engrenagem no painel): microfone, saída de som e câmera (listas dos aparelhos), teste do microfone com uma barra de nível, e supressão de ruído e cancelamento de eco (ligados no padrão). As escolhas ficam no `localStorage`, sempre com `try/catch`.
- **Volume por pessoa:** clique direito no quadro ou no nome na lista abre uma barra de 0 a 100% e "Silenciar só para mim". Fica no `localStorage`, por usuário.
- **Ensurdecer** também desliga o microfone; sair do ensurdecido volta o microfone como estava.
- Qualidade: `adaptiveStream` e `dynacast` ligados; câmera em 360p; a tela no padrão do LiveKit.
- Internet caiu: o LiveKit tenta reconectar sozinho, e o painel mostra "Reconectando…". Desistiu: "A conexão de voz caiu." com o botão "Entrar de novo".
- Mesma conta entrando numa sala por outra janela: o LiveKit tira a primeira. A primeira mostra "Você entrou por outra janela."

### No servidor

- **`POST /api/chat/voz/entrar`** `{ canal, persona? }`: confere se a conta vê o canal, se o canal é de voz e a persona. Responde `{ url: CONFIG.livekitUrl, token }`.
- **O token:** JWT com cabeçalho `{"alg":"HS256","typ":"JWT"}`, assinado com o segredo, e estes campos:

```json
{
  "iss": "<livekitChave>",
  "sub": "<usuario>",
  "nbf": "<agora - 10 s>",
  "exp": "<agora + 6 h>",
  "name": "<nome da persona>",
  "metadata": "{\"usuario\":\"…\",\"persona\":{\"tipo\":\"…\",\"id\":\"…\",\"nome\":\"…\",\"imagem\":\"…\",\"fonte\":\"…\"}}",
  "video": {
    "room": "ce-<id do canal>",
    "roomJoin": true,
    "canPublish": true,
    "canSubscribe": true,
    "canPublishData": false,
    "canUpdateOwnMetadata": false
  }
}
```

  (`nbf` e `exp` em segundos, como números.)
- **Quem está nas salas:** a cada 3 segundos, **só enquanto alguém tiver o chat aberto**, o portal chama no `livekitInterno` o `POST /twirp/livekit.RoomService/ListRooms` e, para cada sala com gente, o `ListParticipants`. Cada chamada leva `Authorization: Bearer <JWT>` com `video: { roomList: true }` (para a lista) ou `video: { roomAdmin: true, room: "<sala>" }` (para os participantes), válido por 1 minuto. Dos participantes, o portal tira usuário e persona do `metadata`, mudo pelo estado da faixa de microfone, câmera e tela pelas faixas publicadas. Leia os campos da resposta aceitando os dois jeitos de escrever os nomes (`num_participants` e `numParticipants`), porque o JSON do Twirp pode vir em qualquer um. Se mudou, manda o evento `voz`, para cada conexão só com as salas que aquela conta vê.
- **Ensurdecido** o LiveKit não sabe: a página manda `POST /api/chat/voz/estado { ensurdecido }`, o portal guarda na memória e junta à presença.
- LiveKit fora do ar: a presença fica vazia, sem erro na tela, e o portal registra o problema no log uma vez (não a cada 3 segundos).
- Sala de voz apagada com gente dentro: o portal chama `DeleteRoom` e todos saem.

## Tempo real

- **`GET /api/chat/eventos`**, por Server-Sent Events (`EventSource`, que o navegador já tem). Cabeçalhos: `Content-Type: text/event-stream`, `Cache-Control: no-store` e `X-Accel-Buffering: no` (para o nginx não segurar). Um comentário `: ping` a cada 25 segundos.
- Eventos: `mensagem`, `editada`, `apagada`, `lida` (sincroniza outras janelas da mesma conta), `canais` (a estrutura mudou: a página pede `GET /api/chat` de novo), `voz`, `presenca` (as contas com o chat aberto) e `recarregar`.
- Cada evento sai só para as conexões cujas contas podem ver aquilo, conferido no envio.
- Cada evento tem id `<época>-<número>`. A época é sorteada quando o portal liga. O portal guarda os últimos 500 eventos. Quando o `EventSource` reconecta com `Last-Event-ID` da mesma época e ainda na memória, o portal reenvia o que faltou; senão, manda `recarregar`, e a página pede tudo de novo.
- Até 5 conexões por conta. Na sexta, a mais antiga é fechada.
- **Presença:** conta com pelo menos uma conexão aberta está "no chat agora" (um ponto na lista de membros e nas privadas).

## Onde os dados ficam

Fora do `dados.json`, porque mensagem chega toda hora e o `dados.json` é regravado inteiro a cada mudança:

```
/var/lib/portal/chat/canais/<id do canal>.jsonl
/var/lib/portal/chat/privadas/<usuarioA>~<usuarioB>.jsonl   (os dois em ordem alfabética)
/var/lib/portal/chat/estado.json
/var/lib/portal/chat/imagens/<id>.<ext>
```

- **Os `.jsonl`:** uma mensagem por linha, na ordem em que chegaram:

```json
{"id":"m-…","em":"2026-11-03T22:10:00.000Z","editadaEm":null,"autor":"neia","persona":{"tipo":"personagem","id":"…","nome":"Neia","imagem":"/uploads/….webp","fonte":"…"},"texto":"…","imagens":["img-….webp"],"resposta":"m-…"}
```

  `persona.tipo` é `conta`, `personagem`, `outro` ou `mestre`.
- **Enviar só acrescenta uma linha** (`appendFile`). **Editar e apagar regravam o arquivo inteiro**, para o texto antigo não ficar no disco: arquivo temporário, troca de nome, modo 0600. As gravações de cada arquivo ficam em fila, e a rota responde depois da gravação que leva a mudança dela.
- O `iniciar()` cria as pastas e lê tudo para a memória (são poucas contas). Devolve `true` só quando criou ou mudou `dados.chat`.
- Uma linha que não dá para ler é pulada e registrada no log. O resto do arquivo vale. Esse arquivo só é regravado por uma edição ou exclusão que alguém pediu.
- **`estado.json`**, gravado no máximo a cada 2 segundos (temporário, troca de nome, 0600):

```json
{
  "neia": {
    "lidas": { "canal-…": "m-…", "privada:mestre~neia": "m-…" },
    "avisos": { "canal-…": "mencoes" },
    "personas": { "<id da mesa>": { "tipo": "personagem", "id": "…" } },
    "ocultas": ["privada:fulano~neia"]
  }
}
```

- **Imagens do chat** ficam fora de `uploads/`, porque os canais das mesas e as privadas são restritos. Saem por `GET /api/chat/imagens/<arquivo>`, que confere se a conta vê a mensagem dona da imagem (404 se não vê), com `Cache-Control: private, max-age=31536000, immutable`. Apagar a mensagem apaga os arquivos.
- **Ganchos:**
  - `renomearConta`: regrava os `.jsonl` trocando `autor` e `<@antigo>`, renomeia os arquivos de privadas e as chaves do `estado.json`.
  - `excluirConta`: as mensagens ficam, com a persona guardada; a chave dela sai do `estado.json`.
  - `excluirMesa`: apaga a categoria, os canais, os `.jsonl` deles e as imagens.

## Rotas (`servidor/chat.js`, prefixo `/api/chat`)

| Método e caminho | Quem | O quê |
| --- | --- | --- |
| `GET /api/chat` | todos | o estado inicial (formato abaixo) |
| `GET /api/chat/canais/:id/mensagens?antes=<id>&limite=50` | quem vê | histórico para trás |
| `GET /api/chat/canais/:id/mensagens?depois=<id>` | quem vê | o que faltou depois de uma reconexão |
| `POST /api/chat/canais/:id/mensagens` | quem vê | enviar: JSON `{ texto, resposta?, persona? }`, ou formulário com `texto`, `resposta`, `persona` (JSON) e `imagem1` a `imagem4` |
| `PUT /api/chat/mensagens/:id` | o autor | `{ texto }` |
| `DELETE /api/chat/mensagens/:id` | o autor ou o administrador (nas privadas, só o autor) | apagar |
| `GET` e `POST /api/chat/privadas/:usuario/mensagens` | as duas contas | como nos canais |
| `POST /api/chat/privadas/:usuario/ocultar` | as duas contas | tirar da lista |
| `POST /api/chat/lida` | todos | `{ canal, ate }`; `canal` pode ser `privada:<usuario>` |
| `PUT /api/chat/avisos` | todos | `{ canal, nivel: "tudo" \| "mencoes" \| "nada" }` |
| `PUT /api/chat/personas` | todos | `{ mesa, persona: { tipo, id } }` |
| `GET /api/chat/eventos` | todos | os eventos (SSE) |
| `GET /api/chat/imagens/:arquivo` | quem vê a mensagem | a imagem |
| `POST /api/chat/voz/entrar` | quem vê a sala | `{ url, token }` |
| `POST /api/chat/voz/estado` | todos | `{ ensurdecido }` |
| `POST /api/chat/canais` | administrador | `{ categoria, tipo, nome }` |
| `PUT /api/chat/canais/:id` | administrador | `{ nome?, ordem? }` |
| `DELETE /api/chat/canais/:id` | administrador | apaga o canal e o histórico |
| `PUT /api/chat/categorias` | administrador | `{ mesas: ["<id>", …] }`: quais mesas têm categoria, na ordem |

O id de mensagem é único em todo o chat (`m-<tempo em base 36>-<sorteio>`). O portal guarda na memória de qual canal é cada id, para as rotas de editar e apagar.

O `mesas.js` (no `dadosDaBarra`) chama `resumoDoChat(conta)`, que o `chat.js` exporta, para o `chat` de `/api/barra`.

### Formatos

`GET /api/chat`:

```json
{
  "conta": { "usuario": "neia", "nome": "Neia", "admin": false },
  "categorias": [
    {
      "id": "mesa-…", "nome": "Ode to Sleep", "cor": "#2e3756", "mesa": "…",
      "canais": [
        { "id": "canal-…", "tipo": "texto", "nome": "conversa", "naoLidas": 3, "mencoes": 1, "aviso": "tudo" },
        { "id": "canal-…", "tipo": "voz", "nome": "Sessão" }
      ]
    }
  ],
  "privadas": [
    { "id": "privada:mestre~neia", "com": { "usuario": "mestre", "nome": "Felipe" }, "naoLidas": 0, "ultimaEm": "…", "ativa": true }
  ],
  "contas": [{ "usuario": "mestre", "nome": "Felipe", "noChat": true }],
  "personas": {
    "<id da mesa>": {
      "opcoes": [{ "tipo": "personagem", "id": "…", "nome": "…", "imagem": "…", "fonte": "…" }],
      "escolhida": { "tipo": "personagem", "id": "…" }
    }
  },
  "membros": { "<id da categoria>": ["neia", "mestre"] },
  "voz": { "configurada": true, "salas": { "canal-…": [{ "usuario": "…", "nome": "…", "imagem": "…", "fonte": "…", "mudo": false, "ensurdecido": false, "camera": false, "tela": false }] } }
}
```

Uma mensagem, como a página recebe:

```json
{
  "id": "m-…", "canal": "canal-…", "em": "…", "editadaEm": null,
  "autor": { "usuario": "neia", "nomeConta": "Neia" },
  "persona": { "tipo": "personagem", "id": "…", "nome": "…", "imagem": "…", "fonte": "…" },
  "texto": "…",
  "imagens": ["/api/chat/imagens/img-….webp"],
  "resposta": { "id": "m-…", "nome": "…", "trecho": "…" },
  "mencionaVoce": false,
  "podeEditar": true,
  "podeApagar": true
}
```

`resposta` é `null` quando não há, e `{ "id": "m-…", "apagada": true }` quando a original foi apagada.

## A página (`publico/chat/`)

`index.html`, `chat.js` (texto), `voz.js` (voz e vídeo), `chat.css`, `livekit-client.js` e `LICENCA-livekit.txt`.

- `<body class="chat" data-pagina="chat" data-raiz="../">`, sem a barra lateral e **sem as cinzas animadas** (a página fica aberta horas com chamada, e as cinzas gastam processador). Carrega `../style.css`, `chat.css`, `../comum.js`, `livekit-client.js`, `chat.js` e `voz.js`, todos com `defer`. Os caminhos relativos funcionam nos três jeitos: em chat.cronicaseternas.com/, em localhost/chat/ e como arquivo.
- **Só computador:** largura mínima de 1100 px e altura mínima de 640 px. Abaixo disso, a página rola. Sem versão de celular.
- **Login próprio:** sem sessão, a página mostra a sua tela de entrada (usuário, senha, "lembrar login", como a da página Mesas) e usa `/api/entrar`. Use `quandoPerderSessao()` para mostrar essa tela em vez de ir para a página Mesas.
- **Três colunas:**
  - **Esquerda (260 px):** no topo, "Crônicas Eternas" e o link **← Portal** (no servidor, `https://` + o domínio sem o `chat.`; em localhost e como arquivo, `RAIZ`); a lista (Geral, as mesas com um filete na cor da mesa, Mensagens privadas); embaixo, o painel de voz quando conectado e a faixa da conta (nome, engrenagem das configurações, Sair).
  - **Centro:** o cabeçalho do canal (nome; nas mesas, "Falando como" com o seletor de persona quando há escolha), as mensagens e o campo de escrever. Numa sala de voz, a grade de quadros.
  - **Direita (220 px, recolhível):** quem vê o canal, em "No chat agora" e "Fora", com a persona de cada um naquele canal e o nome da conta pequeno embaixo.
- **Administração** (só o administrador): `+` no cabeçalho de cada categoria (criar canal: nome e tipo), o menu `⋯` de cada canal (Renomear, Subir, Descer, Apagar, com `perguntar()` antes de apagar) e "Categorias das mesas" na engrenagem (marcar as mesas e a ordem).
- **Endereço:** `#canal-<id>` ou `#privada-<usuario>`. Sem endereço, abre o último canal visto (`localStorage`) ou o primeiro de texto da Geral.
- **Atalhos:** Enter envia; Shift+Enter quebra a linha; ↑ com o campo vazio edita a sua última mensagem; Esc cancela a resposta ou a edição.
- **Visual "Cinza e centelha":** fundo fuligem, texto pergaminho, a brasa só no canal atual, nas menções e na moldura de quem fala.
- **Prévia:** a API de mentira tem a Geral, duas mesas, três contas, uma privada, mensagens com imagens, menções, respostas e spoiler, e uma mensagem nova chegando a cada 20 segundos. A voz na prévia é simulada: entrar mostra quadros com retratos, o "falando" alterna entre eles, e os botões mudam os estados sem `livekit-client`.

## No CLAUDE.md

- **Sessão 11.1:** em "Regras do código", a exceção do `publico/chat/livekit-client.js`; em "Onde roda", o chat em chat.cronicaseternas.com no mesmo portal, o LiveKit (`livekit.service`, `/etc/livekit.yaml`, voz.cronicaseternas.com), os dados em `/var/lib/portal/chat/` e as variáveis de ambiente do portal (num override do `portal.service`); no "Testar", as variáveis para testar o chat localmente.
- **Sessão 11.5:** em "Cargos", que o administrador gerencia os canais e não lê as privadas dos outros; a versão do `livekit-client.js` copiada; o mapa do código completo.

## Fora desta versão

- celular;
- avisos com o chat fechado (Web Push);
- busca nas mensagens;
- reações e emojis próprios;
- threads e mensagens fixadas;
- privadas em grupo;
- bots e rolagem de dados no chat;
- apertar para falar;
- moderação de voz (mutar ou tirar alguém da sala);
- gravação de chamadas;
- "fulano está digitando";
- trocar de personagem dentro da sala de voz;
- migrar o histórico do Discord.

## Testar no servidor (depois da atualização)

Para mim, com uma conta de teste de jogador:

- abrir o chat pelo botão do portal já logado, e numa janela anônima ver a tela de entrada;
- a conta de teste sem personagem numa mesa não vê a categoria; com personagem, vê;
- a mensagem na mesa sai com o nome e o retrato do personagem; na Geral e nas privadas, com a conta;
- o administrador não vê privadas entre duas outras contas;
- voz entre dois computadores, um deles no 4G do celular;
- câmera, tela e quem está nas salas visto de fora;
- avisos e som com o chat noutra aba;
- no app, o chat em janela própria com o microfone funcionando;
- `free -h` durante uma sessão com Foundry e chamada.

## Sessões

- **11.1 Servidor, base e texto.** Inclui:
  - o `CONFIG` novo, o cookie `ce_sessao` com a migração e o `tokenDaSessao(req)`;
  - no `servidor.js`, o endereço do chat, os dois redirecionamentos e a CSP do chat;
  - `servidor/chat.js` registrado em `PAGINAS`: `dados.chat` e a criação inicial, a pasta `chat/`, ler e gravar os `.jsonl` e o `estado.json` com fila;
  - quem vê o quê (mesas, privadas e o administrador sem as privadas dos outros);
  - as personas, com a conferência e a cópia;
  - mensagens só de texto: enviar, histórico nos dois sentidos, editar, apagar, responder, menções e o limite;
  - privadas, lidas, contagens, avisos, personas escolhidas e ocultar;
  - os eventos, com a reconexão, a presença e o limite de conexões;
  - as rotas do administrador para canais e categorias;
  - os ganchos de conta e de mesa;
  - o `chat` de `/api/barra`;
  - o `CLAUDE.md` da 11.1.

  Testar com o servidor e `curl` (para ver o endereço do chat, `HOST_CHAT=chat.localhost` e `curl -H 'Host: chat.localhost'`):
  - o cookie novo com `DOMINIO_COOKIE=cronicaseternas.com`, a migração de um `sessao` antigo e o sair;
  - os dois 302 e, com um `publico/chat/index.html` provisório só durante o teste (não vai no commit), o `GET /` no endereço do chat e a CSP;
  - uma conta com personagem numa mesa e outra sem;
  - a persona errada (403) e a escolha entre dois personagens;
  - o administrador como Mestre e como outro personagem;
  - privada entre duas contas e o administrador fora dela;
  - editar e apagar regravando o arquivo, e uma linha quebrada à mão sendo pulada;
  - `curl -N` nos eventos com duas contas, uma reconexão com `Last-Event-ID` e o `recarregar`;
  - o limite de mensagens;
  - renomear e excluir conta, e excluir mesa.
- **11.2 Servidor, imagens e voz.** Inclui:
  - imagens nas mensagens (formulário, até 4), a rota protegida e apagar junto com a mensagem;
  - o JWT do LiveKit, `/voz/entrar`, `/voz/estado`, a presença pelas chamadas Twirp, o `DeleteRoom` e a voz sem configuração (503).

  Testar com `curl`:
  - imagem para quem vê o canal, para quem não vê (404), numa privada e apagada com a mensagem;
  - o token decodificado com `node` (assinatura, campos e sala de quem não vê o canal recusada);
  - se der para baixar o `livekit-server` dos releases do GitHub na sessão, rodar com `--dev` e conferir `ListRooms` e `ListParticipants` com o token; se não der, avisar que a presença fica para o teste no servidor.
- **11.3 Página, estrutura e texto.** Use o modo de planejamento. Inclui:
  - `publico/chat/` com `index.html`, `chat.js` e `chat.css`;
  - o login próprio e as três colunas;
  - a lista com categorias, não lidas e menções;
  - as mensagens (agrupamento, dias, "Novas", formatação, imagens, responder, editar, apagar e menções com a lista do `@`);
  - o campo de escrever com o seletor de persona;
  - as privadas, nova conversa e ocultar;
  - os eventos com reconexão, o título com o contador e o endereço `#`;
  - a administração dos canais e das categorias;
  - a prévia do texto.
- **11.4 Página, voz e vídeo.** Use o modo de planejamento. Inclui:
  - `livekit-client.js` e `LICENCA-livekit.txt`: `npm pack livekit-client@<a versão 2.x mais nova>`, copiar o arquivo UMD de `dist/` (o que expõe `LivekitClient`) e a licença, e escrever a versão na primeira linha do `LICENCA-livekit.txt`;
  - `voz.js`: entrar, trocar e sair, o painel, quem está nas salas, a grade, quem fala, câmera, tela, as configurações de aparelhos, o volume por pessoa e a reconexão;
  - a prévia simulada;
  - conferir que a CSP do chat deixa o `livekit-client.js` conectar.
- **11.5 Avisos, botão no portal e fechamento.** Inclui:
  - os avisos do navegador e o som, por canal, e "Ativar avisos";
  - o botão Chat no topo do portal (`comum.js` e `style.css`) com a marca de não lidas;
  - o `CLAUDE.md` da 11.5;
  - revisar a lista "Testar no servidor" com o que mudou nas sessões.
