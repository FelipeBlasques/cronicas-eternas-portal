# Crônicas Eternas: portal

Portal do grupo de RPG em https://cronicaseternas.com. Cada jogador tem conta, vê os personagens na página **Mesas** e entra no mundo certo do Foundry com um clique. Também tem a **Linha do Tempo** do mundo de Draevor, as **Regras da casa**, a galeria de **Personagens**, os **Mapas** e as **Memórias de Draevor** (textos do cenário). As especificações de cada página estão em `planejamento/`.

## Onde roda

- VPS Hostinger com Ubuntu. Foundry 14 em `/opt/foundry`, no endereço vtt.cronicaseternas.com.
- O portal é a pasta `portal/` deste repositório, instalada em `/opt/portal`. É Node 24 **sem dependências**. Roda como `portal.service` na porta 3000, atrás do nginx.
- Os dados ficam fora do código, em `/var/lib/portal`: `dados.json`, `segredo` e `uploads/`. Eles nunca entram no repositório.
- Os cadernos ficam em `/var/lib/portal/cadernos/` (`<usuario>/caderno.json` e `<usuario>/imagens/`), fora do `dados.json`.
- As imagens fixas das campanhas (`publico/imagens/`) não estão no repositório. Se existirem no servidor, a atualização não as apaga.
- O **chat** abre em chat.cronicaseternas.com, servido pelo mesmo portal (porta 3000), num bloco próprio do nginx. As mensagens ficam em `/var/lib/portal/chat/` (`canais/`, `privadas/`, `estado.json`, `reacoes.json`, `fixadas.json` e `imagens/`), fora do `dados.json`; só a estrutura (categorias e canais) e os perfis do chat (`dados.chat.perfis`, com a foto e a faixa em `uploads/`) ficam em `dados.chat`.
- Os **GIFs** do chat vêm da Klipy, sempre pelo portal (a página nunca fala com ela). Sem `KLIPY_CHAVE`, o chat fica sem GIFs.
- A voz e o vídeo do chat usam o **LiveKit**, um servidor de mídia que roda na VPS como serviço próprio (`livekit.service`, configurado em `/etc/livekit.yaml`), fora do portal, como o Foundry. Endereço público: voz.cronicaseternas.com (a sinalização passa pelo nginx; o áudio e o vídeo vão direto às portas 7881/tcp e 7882/udp).
- As variáveis de ambiente do portal ficam num override do `portal.service` (`systemctl edit portal`): `HOST_CHAT`, `DOMINIO_COOKIE`, `LIVEKIT_URL`, `LIVEKIT_INTERNO`, `LIVEKIT_CHAVE`, `LIVEKIT_SEGREDO` (veja `planejamento/chat.md`) e `KLIPY_CHAVE` (veja `planejamento/chat-atualizacao-1.md`; `KLIPY_BASE` e `KLIPY_MIDIA` só mudam para teste ou se a Klipy trocar o endereço das imagens). Com `DOMINIO_COOKIE`, o cookie da sessão se chama `ce_sessao` e vale nos subdomínios.
- O app dos jogadores fica noutro repositório, `FelipeBlasques/cronicas-eternas-app` (Tauri, fork do FLC). Ele abre o portal na janela principal e manda tudo o que é de vtt.cronicaseternas.com para a janela do jogo. Páginas novas do portal não precisam de mudança no app.

## Onde você trabalha

Na nuvem (claude.ai/code), num clone deste repositório, com Node 22. Cada sessão é uma tarefa do roteiro que está no fim de cada arquivo de `planejamento/`. O trabalho sai da sessão por uma branch própria, que eu testo e junto na `main`.

## Como o servidor é atualizado

1. Eu faço o merge do PR, dou Pull no GitHub Desktop e rodo `empacotar.cmd 10`, que gera `portal-atualizacao-10.zip` com a pasta `portal/`.
2. O zip vai para `/root` pelo WinSCP.
3. No servidor: `unzip -o /root/portal-atualizacao-10.zip -d /opt && systemctl restart portal`.
4. No navegador, Ctrl+F5, ou reabrir o app.

O `unzip -o` só cria e substitui arquivos, nunca apaga. Se uma mudança tirar algum arquivo, diga no fim da sessão qual é e qual `rm` rodar.

## Regras do código (obrigatórias)

- **Sem bibliotecas externas**, nem no servidor nem nas páginas. Nada de npm, CDN ou framework.
  - **A exceção única:** `publico/chat/livekit-client.js`, cópia do arquivo UMD do pacote npm `livekit-client` (Apache 2.0) numa versão fixa (hoje a **2.23.0**, `dist/livekit-client.umd.js`), com a licença e a versão em `publico/chat/LICENCA-livekit.txt`. Fica no repositório e é servido pelo portal, sem CDN. Ninguém o atualiza de passagem: só numa sessão que peça isso. No servidor do portal continua sem biblioteca nenhuma (o passe do LiveKit é um JWT feito com `node:crypto`).
- **A CSP proíbe script e estilo inline.** Nada de `<script>` com código, atributo `style="..."` ou `<style>` no HTML. Tudo fica em arquivos `.js` e `.css`. Mudar estilo pelo JS com `elemento.style.setProperty(...)` pode.
- **Nomes no código e textos da interface em português.**
- Os scripts das páginas são clássicos (não módulos) e usam `defer`, para a prévia funcionar abrindo o arquivo direto no navegador.
- **Toda página tem modo prévia:** fora de cronicaseternas.com e de localhost, ela usa uma API de mentira com dados de exemplo, no mesmo formato do servidor.

## Visual "Cinza e centelha"

- Fontes: Grenze Gotisch nos títulos e Alegreya no texto.
- Tons de fuligem, ferro e pergaminho. As variáveis ficam no `:root` do `publico/style.css`.
- A brasa (`--brasa`) é só para destaque: página atual, botão principal, marcos maiores.
- O azul arcano é raro: só no glifo Arcano, no lacre que se rompe e nas centelhas do fundo.

## Cargos

- **Administrador** (`conta.admin`): faz tudo. No chat, só ele cria, renomeia, ordena e apaga canais e escolhe as categorias das mesas. A exceção a "faz tudo": **não lê as mensagens privadas entre outras contas**.
- **Editor** (`conta.editor`): registra e altera acontecimentos na Linha do Tempo (apagar vira pedido aprovado pelo administrador); cadastra e altera qualquer personagem que vê na galeria (apagar e escolher quem vê ficam com o administrador); marca lugares nos mapas e altera só os que ele marcou.
- **Jogador:** só a conta.

Toda conta que não é administrador tem um **Caderno**, que só ela altera (e quem ela deixar editar). O administrador lê todos os cadernos e não altera nenhum.

Sem login, nenhuma página abre. A exceção é a leitura pública de uma nota do Caderno (`/ler/#<token>`), que abre com o link.

## Mapa do código

```
portal/
  servidor.js       núcleo: liga o servidor, serve publico/ e distribui /api (lista PAGINAS); as rotas
                    públicas (prefixoPublico/tratarPublico de uma página) vêm antes da sessão
  servidor/
    base.js         CONFIG, dados (objeto único) e salvarDados(), sessões, senhas, cifra,
                    ErroHttp, enviarJson, lerJson, lerFormulario, texto(), imagens,
                    contaPublica / campanhaPublica / personagemPublico, ganchos
    foundry.js      status do Foundry, lista de mundos, pedirTroca()
    mesas.js        /api/entrar, /api/portal, /api/abrir, /api/conta, /api/senha, ...
    admin.js        /api/admin/... (contas, mesas, personagens). Todas as mesas ficam em dados.campanhas;
                    naPaginaMesas diz se a mesa aparece na página Mesas
    linha.js        /api/linha/... (Linha do Tempo; exporta lerDataDaLinha, podeVer, dataPublica...)
    regras.js       /api/regras/... (Regras da casa)
    personagens.js  /api/galeria/... (Personagens: fichas e outros personagens; a arte da galeria
                    fica em `retrato`, separada da capa e da arte do card das Mesas)
    mapas.js        /api/mapas/... (Mapas e lugares; exporta podeVerLugar)
    memorias.js     /api/memorias/... (Memórias de Draevor: textos que só o administrador escreve e revela;
                    exporta podeLer)
    chat.js         /api/chat/... (Chat: canais, privadas, lidas, personas, perfis, reações, fixadas, GIFs e
                    eventos SSE; a estrutura e os perfis em dados.chat e as mensagens em chat/canais/*.jsonl e
                    chat/privadas/*.jsonl, fora do dados.json; as reações e as fixadas em chat/reacoes.json e
                    chat/fixadas.json; as imagens em chat/imagens/, pela rota protegida; os GIFs: a busca na
                    Klipy com cache e o envio pelo id; a voz: o passe JWT do LiveKit, quem está nas salas
                    pelas chamadas Twirp e o "mover" do administrador; exporta resumoDoChat, que o
                    /api/barra usa)
    caderno.js      /api/caderno/... (Caderno: notas e pastas de cada conta, em cadernos/<usuario>/caderno.json,
                    fora do dados.json, e as imagens em cadernos/<usuario>/imagens/; os ganchos de conta
                    renomeiam e apagam essas pastas. Links, embutidas, etiquetas, busca, citáveis, imagens
                    protegidas e órfãs; /api/caderno/publico/... é o link público, sem login)
  publico/
    comum.js        lista PAGINAS e barra lateral, pedir(), $, criar(), botao(), imagem(),
                    simbolo(), perguntar(), avisoRapido(), avisarFalha(), fecharAoClicarFora(),
                    mostrarStatus(), textoFormatado(), paragrafosDe(), resumoDe(), normalizar(),
                    corVisivel(), FONTES e aplicarFonte(), montarCardComMoldura(),
                    iniciarCinzas(), irParaEntrada(), marcarNaBarra(); o botão Chat do topo
                    (montarBotaoDoChat(), à esquerda do #nome-conta, com a marca de não lidas do
                    /api/barra em marcarChat())
    calendario.js   o Ciclo de Sylara: MESES, textoDaData(), textoDoPeriodo(), faseDaLua()...
    marcas.js       as marcas do texto das notas do Caderno (tipo Markdown, com os links, as embutidas e as
                    imagens do portal): declara só desenharMarcas(texto, { links, embutidas, imagens }, opcoes),
                    que devolve os elementos. Usado pelo Caderno e pela leitura pública
    marcas.css      o estilo das marcas, dentro de um elemento com a classe "marcas"
    style.css       estilos comuns: variáveis, topo, barra lateral, botões, campos, diálogos, cards
    index.html, script.js        página Mesas, tela de entrada e administração
    linha-do-tempo/              index.html, linha.js, linha.css
    regras/                      index.html, regras.js, regras.css
    personagens/                 index.html, personagens.js, personagens.css
    mapas/                       index.html, visor.js, mapas.js, mapas.css
    memorias/                    index.html, memorias.js, memorias.css
    caderno/                     index.html, caderno.js, caderno.css (carrega também ../marcas.js e ../marcas.css)
    ler/                         index.html, ler.js, ler.css: a leitura pública de uma nota do Caderno (/ler/#<token>),
                                 sem login e sem a barra lateral; carrega também ../marcas.js e ../marcas.css
    chat/                        index.html, chat.js (texto: lista, mensagens, privadas, eventos, administração,
                                 "Seu perfil", o card de quem fala, os avisos do navegador por canal e os do
                                 app (cronicasEternasApp.avisar), o som e a prévia), chat.css: a página do chat, com
                                 login próprio, sem a barra lateral e sem as cinzas; voz.js (voz e vídeo: o painel, a sala, as configurações de aparelhos, o volume
                                 por pessoa e a voz simulada da prévia; usa o estado e os ganchosDaVoz do chat.js);
                                 livekit-client.js (a cópia fixa do LiveKit) e LICENCA-livekit.txt (versão e licença);
                                 extras.js (o seletor de emojis, o ":" no campo, as reações, o painel de GIFs, o GIF na
                                 mensagem e as fixadas; usa o estado do chat.js e preenche os ganchosDosExtras);
                                 emojis.js (só dados: EMOJIS, gerado por planejamento/ferramentas/gerar-emojis.mjs) e
                                 LICENCA-emojis.txt (as licenças dos dados dos emojis)
planejamento/       especificações e roteiro das sessões; referencias/ com o Atlas de Tyrenar; ferramentas/ com o
                    gerar-emojis.mjs (gera o emojis.js a partir de pacotes npm instalados fora de portal/)
```

## Padrão: página nova no servidor

1. Crie `portal/servidor/<pagina>.js` com `"use strict"`, importando o que precisar de `./base`. Ele exporta `{ prefixo: "/api/<pagina>", tratar(req, res, rota, metodo, conta), iniciar() }`. Use `servidor/linha.js` de modelo.
2. Registre o módulo na lista `PAGINAS` do `servidor.js`.
3. Os dados ficam em `dados.<pagina>`, dentro do mesmo `dados.json`. O `iniciar()` cria e confere essa parte e devolve `true` se mudou algo. Depois de mudar dados, chame `await salvarDados()`.
4. A sessão já foi conferida antes do `tratar`. Para o cargo, use `conta.admin` e `conta.editor`.
5. Para erros, use `throw new ErroHttp(status, "mensagem para a pessoa", "codigo")`. Para responder, use `enviarJson(res, status, corpo)`.
6. Para envio com imagem, use `lerFormulario(req, limite)`, `arquivoEnviado`, `TIPOS_IMAGEM`, `guardarImagem` e `apagarImagens`.
7. Se a página guardar usuários de contas, inscreva-se em `ganchos.renomearConta` e `ganchos.excluirConta`.

## Padrão: página nova no navegador

1. Crie a pasta `publico/<pasta>/` com `index.html`, `<pagina>.js` e `<pagina>.css`. Copie o esqueleto de `linha-do-tempo/index.html`: cenário, `<svg class="simbolos">`, `.topo` (`#status`, `#nome-conta`, `#botao-sair`), `<nav class="barra-lateral">` vazio, `#dialogo-aviso`, `#aviso-rapido` e `#simulacao` (prévia).
2. Use `<body class="com-barra" data-pagina="<id>" data-raiz="../">`. Carregue `../style.css` e depois o css da página. Carregue `<script src="../comum.js" defer>` e depois o script da página.
3. No script, monte `apiDoServidor` com `pedir()` e `criarApiDePrevia()` com os mesmos nomes. Depois, `const api = MODO_PREVIA ? criarApiDePrevia() : apiDoServidor;`. **Não declare de novo nomes que já existem no `comum.js`.**
4. Para acender o botão na barra lateral, mude `pronta: true` na lista `PAGINAS` do `comum.js`.

## Testar

- **Rotas novas:** rode o servidor na sessão com dados de teste e use `curl`:
  ```sh
  DADOS=/tmp/portal-teste COOKIE_SEGURO=nao PORTA=3999 node portal/servidor.js > /tmp/portal.log 2>&1 &
  grep -o 'mestre": .*' /tmp/portal.log      # senha do mestre, na primeira vez
  curl -s -c /tmp/c -H 'Content-Type: application/json' \
       -d '{"usuario":"mestre","senha":"..."}' http://127.0.0.1:3999/api/entrar
  curl -s -b /tmp/c http://127.0.0.1:3999/api/regras
  ```
  Pare o servidor no fim (`kill %1`).
- **Chat:** para ver o endereço do chat, ligue com `HOST_CHAT=chat.localhost` e use `curl -H 'Host: chat.localhost'`. Para o cookie novo, `DOMINIO_COOKIE=cronicaseternas.com` (o curl não manda esse cookie para 127.0.0.1: confira só os cabeçalhos `Set-Cookie`). A voz pede `LIVEKIT_URL`, `LIVEKIT_CHAVE` e `LIVEKIT_SEGREDO`; sem eles, responde 503 e o texto funciona. Os GIFs pedem `KLIPY_CHAVE`; para testar sem a Klipy, aponte `KLIPY_BASE=http://127.0.0.1:<porta>/api/v1` para um servidor de mentira local (as imagens precisam ser `https://static.klipy.com/...`). Os eventos: `curl -N -b /tmp/c http://127.0.0.1:3999/api/chat/eventos`.
- **Páginas:** a prévia (abrir `portal/publico/<pasta>/index.html` direto no navegador) fica comigo. No meu PC também há o `rodar-local.cmd`.
- Antes de terminar, rode `node --check` em cada `.js` mudado.

## Como trabalhar nas sessões

- Leia só o que a tarefa pede. Use o mapa acima e busque com grep. Não leia `linha.js`, `script.js` ou `style.css` inteiros.
- Siga a especificação de `planejamento/` à risca. Se algo estiver ambíguo, pergunte antes de inventar.
- Não mude o que não foi pedido, nem com "melhorias" de passagem.
- Não abra navegador nem tire prints: eu testo na prévia e digo o que vi.
- No fim, faça commit com uma mensagem curta em português e envie a branch da sessão. Não faça merge na `main`.
- Na resposta final, liste os arquivos criados ou mudados e diga se algum arquivo precisa ser apagado no servidor.

# Compact instructions

Ao resumir, guarde os arquivos mudados, as decisões tomadas e o que falta testar.
