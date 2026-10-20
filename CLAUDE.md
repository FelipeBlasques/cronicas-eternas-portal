# Crônicas Eternas: portal

Portal do grupo de RPG em https://cronicaseternas.com. Cada jogador tem conta, vê os personagens na página **Mesas** e entra no mundo certo do Foundry com um clique. Também tem a **Linha do Tempo** do mundo de Draevor. As páginas novas (Regras da casa, Personagens, Mapas) estão especificadas em `planejamento/`.

## Onde roda

- VPS Hostinger com Ubuntu. Foundry 14 em `/opt/foundry`, no endereço vtt.cronicaseternas.com.
- O portal é a pasta `portal/` deste repositório, instalada em `/opt/portal`. É Node 24 **sem dependências**. Roda como `portal.service` na porta 3000, atrás do nginx.
- Os dados ficam fora do código, em `/var/lib/portal`: `dados.json`, `segredo` e `uploads/`. Eles nunca entram no repositório.
- As imagens fixas das campanhas (`publico/imagens/`) não estão no repositório. Se existirem no servidor, a atualização não as apaga.
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

- **Administrador** (`conta.admin`): faz tudo.
- **Editor** (`conta.editor`): registra na Linha do Tempo. Para alterar ou apagar, o pedido passa pela aprovação do administrador.
- **Jogador:** só a conta.

Sem login, nenhuma página abre.

## Mapa do código

```
portal/
  servidor.js       núcleo: liga o servidor, serve publico/ e distribui /api (lista PAGINAS)
  servidor/
    base.js         CONFIG, dados (objeto único) e salvarDados(), sessões, senhas, cifra,
                    ErroHttp, enviarJson, lerJson, lerFormulario, texto(), imagens,
                    contaPublica / campanhaPublica / personagemPublico, ganchos
    foundry.js      status do Foundry, lista de mundos, pedirTroca()
    mesas.js        /api/entrar, /api/portal, /api/abrir, /api/conta, /api/senha, ...
    admin.js        /api/admin/... (contas, campanhas, personagens)
    linha.js        /api/linha/... (Linha do Tempo)
  publico/
    comum.js        lista PAGINAS e barra lateral, pedir(), $, criar(), botao(), imagem(),
                    simbolo(), perguntar(), avisoRapido(), avisarFalha(), fecharAoClicarFora(),
                    mostrarStatus(), textoFormatado(), paragrafosDe(), resumoDe(), normalizar(),
                    corVisivel(), FONTES e aplicarFonte(), montarCardComMoldura(),
                    iniciarCinzas(), irParaEntrada(), marcarNaBarra()
    style.css       estilos comuns: variáveis, topo, barra lateral, botões, campos, diálogos, cards
    index.html, script.js        página Mesas, tela de entrada e administração
    linha-do-tempo/              index.html, linha.js, linha.css
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
