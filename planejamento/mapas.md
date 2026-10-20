# Mapas

Os mapas de Draevor e de cada mesa. Cada mapa abre em tela cheia, com zoom, arraste e marcadores clicáveis. Só o administrador envia mapas; editores e o administrador colocam marcadores. Sem login, a página manda para a entrada. Decisões fechadas em 19/10/2026.

Sessões: 3.1 servidor, envio e galeria · 3.2 visor · 3.3 ver marcadores · 3.4 editar marcadores e acender o botão (veja "Sessões" no fim).

## Referência

Hoje existe um mapa, em PNG, e uma página HTML que posiciona pontos por cima dele e ficou boa. Ela fica em `planejamento/referencias/` e é o modelo de como posicionar os marcadores sobre a imagem. **Leia essa página antes das sessões 3.2 e 3.3.** Se ela já tiver lugares marcados, a sessão 3.4 inclui um jeito simples de trazer esses pontos como os primeiros marcadores do mapa (pode ser um script de uma vez só, rodado no servidor, ou um botão "Importar pontos" só para o administrador).

> Pendente: a página de referência ainda vai ser adicionada a `planejamento/referencias/`. Este arquivo será completado com o que ela tiver.

## O que a página guarda

```js
dados.mapas = [{
  id: "mapa-xxxxxxxx",
  nome,                       // até 80
  mesas: [],                  // ids de campanhas; vazio = mapa de Draevor (mundo todo)
  descricao,                  // até 600, texto formatado
  imagem, miniatura,          // "/uploads/..."
  largura, altura,            // em pixels, da imagem original (o navegador mede e manda no envio)
  visibilidade,               // "todos" ou "admin"
  criadoEm, alteradoEm,
  marcadores: [{
    id: "marca-xxxxxxxx",
    x, y,                     // de 0 a 1, proporção da largura e da altura da imagem
    nome,                     // até 60
    glifo,                    // um dos glifos da Linha: marco, guerra, queda, fundacao, catastrofe, poder,
                              // pacto, arcano, descoberta, feito, lua, olho, escudo, montanha, sol, gota, navio, torre
    descricao,                // até 600, texto formatado
    visibilidade,             // "todos" ou "admin"
    registradoPor, registradoNome, criadoEm, alteradoEm,
  }],
}];
```

Limites: 30 mapas, 300 marcadores por mapa.

## Quem faz o quê

| Ação | Administrador | Editor | Jogador |
| --- | --- | --- | --- |
| Ver mapas e marcadores "todos" | Sim | Sim | Sim |
| Enviar, trocar a imagem, alterar e apagar mapas | Sim | Não | Não |
| Criar marcadores | Sim | Sim | Não |
| Alterar e mover marcadores | Qualquer um | Os que colocou | Não |
| Apagar marcadores | Sim | Não | Não |
| Deixar mapa ou marcador "só o administrador", e ver esses | Sim | Não | Não |

O que um editor cria entra sempre como `todos`, como na Linha do Tempo. Em Administração > Contas, o texto do cargo Editor (`ROTULO_EDITOR`, em `script.js`) passa a ser: "Editor (registra na Linha do Tempo, cadastra personagens e marca lugares nos mapas; alterar ou apagar acontecimentos passa pela sua aprovação)".

## Imagens grandes

- Os mapas aceitam até 40 MB (`CONFIG.maxMapa`, em `servidor/base.js`), só na rota de mapas. As outras imagens continuam com 10 MB.
- **Antes de subir a fase 3 para o servidor:** confira no nginx o `client_max_body_size`, que precisa ser pelo menos `45m`.
- A miniatura (uns 640 px no lado maior, WEBP) é feita pelo navegador num `<canvas>` na hora do envio e sobe junto, no campo `miniatura`. O servidor continua sem bibliotecas.
- A galeria mostra só as miniaturas; a imagem inteira só carrega no visor.

## Rotas (`servidor/mapas.js`, prefixo `/api/mapas`)

| Rota | Quem | O que faz |
| --- | --- | --- |
| `GET /api/mapas` | qualquer conta | `{ conta, mesas, mapas }`, só com o que a conta pode ver; cada marcador com `podeEditar` |
| `POST /api/mapas` | admin | formulário com `dados` (JSON), `imagem` e `miniatura` |
| `PUT /api/mapas/:id` | admin | altera; `imagem` e `miniatura` opcionais (trocar a imagem mantém os marcadores) |
| `DELETE /api/mapas/:id` | admin | apaga o mapa, os marcadores e os arquivos |
| `POST /api/mapas/:id/marcadores` | admin ou editor | cria |
| `PUT /api/mapas/:id/marcadores/:marca` | admin, ou o editor que colocou | altera ou move |
| `DELETE /api/mapas/:id/marcadores/:marca` | admin | apaga |

Ganchos: `renomearConta` e `excluirConta` para `registradoPor`, como na Linha.

## A galeria (`publico/mapas/`)

Arquivos: `index.html`, `mapas.js`, `visor.js`, `mapas.css`. Esqueleto como em `linha-do-tempo/index.html`, com `data-pagina="mapas"`. O `visor.js` é carregado antes do `mapas.js` e só cuida de zoom e arraste.

- Cards com a miniatura e o nome, em grupos: primeiro **Draevor** (mapas sem mesa), depois um grupo por mesa.
- Para o administrador, "+ Mapa" (principal) e o lápis em cada card.
- Clicar num card abre o visor. Link próprio: `mapas/#mapa-<id>`, e `mapas/#mapa-<id>/<marca>` abre já centrado no marcador.

## O visor

- O mapa ocupa a tela (abaixo do cabeçalho), com uma moldura de ferro fina e um botão de fechar que volta à galeria.
- **Zoom:** a roda do mouse aproxima no ponto do cursor; no celular, pinça com dois dedos; botões + e − e "Encaixar" num canto; teclado: + e − para zoom, setas para mover, 0 para encaixar.
- **Ctrl + roda:** a pinça do touchpad chega como roda com Ctrl, e no app o Ctrl + roda também dá zoom na janela inteira. Sobre o mapa, trate os dois como zoom do mapa e cancele o padrão (`preventDefault` num listener `wheel` com `passive: false`).
- **Arraste:** segurar e arrastar move o mapa, com mouse ou dedo (pointer events).
- **Limites:** zoom mínimo é o "Encaixar"; máximo, 4 vezes o tamanho real da imagem. O mapa não sai inteiro da tela.
- Técnica: uma camada com a imagem e os marcadores, movida com `transform: translate(...) scale(...)` via `style.setProperty`. Sem bibliotecas.

## Os marcadores

- Pequenas placas de ferro com o glifo, do mesmo tamanho na tela em qualquer zoom (a escala é compensada no marcador).
- Passar o mouse mostra o nome num rótulo de pergaminho, igual ao da barra lateral.
- Clicar abre um balão com o nome, a descrição e "Copiar link". O marcador selecionado fica com a borda em brasa.
- **Índice:** uma lista dos marcadores ao lado do mapa (no celular, numa gaveta), com busca. Clicar num nome leva o mapa até ele.
- O glifo arcano é o único em azul arcano. Para o administrador, marcadores ocultos aparecem cobertos de névoa.

## Editar marcadores (sessão 3.4)

O administrador e os editores veem o botão "Editar marcadores" no visor. Ligado:

- clicar num ponto vazio do mapa abre o formulário de um marcador novo naquele ponto;
- arrastar um marcador que a conta pode editar muda o lugar dele (salva ao soltar);
- clicar num marcador abre o formulário: nome, glifo (grade com os glifos), descrição, visibilidade (só o administrador) e "Apagar" (só o administrador).

## Visual

O estilo do portal: ferro, fuligem e pergaminho, as cinzas no fundo (`iniciarCinzas(30)`) só na galeria, não no visor. A brasa fica na placa da barra lateral, nos botões principais e no marcador selecionado.

## Prévia

`criarApiDePrevia()` com os mesmos nomes do `apiDoServidor`. O mapa de exemplo é um SVG desenhado dentro do `mapas.js` (costa, rios, montanhas simples), usado como imagem por `data:` URL, sem arquivo de imagem. Uns dez marcadores, um deles oculto. O painel `#simulacao` com "Ver a página como" (Administrador, Editor ou Jogador) e "Restaurar os exemplos".

## Fora desta versão

Ligar marcadores a acontecimentos da Linha; mapas dentro de mapas (um marcador que abre o mapa da região).

## Sessões

- **3.1 Servidor, envio e galeria:** `servidor/mapas.js` com dados, rotas, limite de 40 MB e ganchos; registrar em `PAGINAS`; a pasta `publico/mapas/` com a galeria, o envio de mapa pelo administrador (miniatura no `canvas`) e a prévia. Sem visor.
- **3.2 Visor (em modo de plano):** `visor.js` com tudo da seção "O visor", ainda sem marcadores, mas com a camada pronta para eles. Leia antes a referência em `planejamento/referencias/`.
- **3.3 Ver marcadores:** marcadores no visor, rótulo, balão, índice com busca e link de cada marcador.
- **3.4 Editar marcadores e acender (em modo de plano):** o modo "Editar marcadores", a importação dos pontos da referência (se houver), o texto novo do cargo Editor e `pronta: true` para `mapas` em `PAGINAS`.
