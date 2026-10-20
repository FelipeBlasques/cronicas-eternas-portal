# Mapas

Os mapas de Draevor e de cada mesa. Cada mapa abre num visor com zoom, arraste, lugares clicáveis e um painel lateral com o índice dos lugares. Só o administrador envia mapas; editores e o administrador marcam lugares. Sem login, a página manda para a entrada. Decisões fechadas em 20/10/2026.

Sessões: 3.1 servidor, envio e galeria · 3.2 visor · 3.3 lugares e painel · 3.4 editar, importar e acender o botão (veja "Sessões" no fim).

## Referência: o Atlas de Tyrenar

O jeito de mostrar os lugares vem de uma página feita antes do portal, o Atlas de Tyrenar. **Leia `planejamento/referencias/atlas-de-tyrenar.md` antes das sessões 3.2, 3.3 e 3.4.** A ideia central: as cidades, vilas e regiões já estão desenhadas na imagem, então o portal não desenha ícones por cima delas. Ele põe áreas clicáveis invisíveis sobre o ponto e sobre o nome escrito, com anel no hover e halo na seleção. Só o relevo e o que alguém marcar depois ganham marcador visível.

Hoje existe um mapa, Tyrenar, com 36 lugares já posicionados em `planejamento/referencias/lugares-tyrenar.json`.

## O que a página guarda

```js
dados.mapas = [{
  id: "mapa-xxxxxxxx",
  nome,                       // até 80
  mesas: [],                  // ids de campanhas; vazio = mapa de Draevor (mundo todo)
  descricao,                  // até 600, texto formatado
  imagem, miniatura,          // "/uploads/..."
  largura, altura,            // em pixels, da imagem enviada (o navegador mede e manda)
  visibilidade,               // "todos" ou "admin"
  criadoEm, alteradoEm,
  marcadores: [{
    id: "marca-xxxxxxxx",
    nome,                     // até 60
    tipo,                     // "capital", "cidade", "vila", "reino", "regiao", "relevo" ou "lugar"
    x, y,                     // de 0 a 1, proporção da largura e da altura da imagem
    impresso,                 // true: o lugar já está desenhado na imagem (área clicável invisível)
    raio,                     // só impresso: raio da área em volta do ponto, em proporção da largura (0 a 0,05)
    caixa,                    // só impresso, opcional: [x0, y0, x1, y1], o retângulo sobre o nome escrito
    glifo,                    // só não impresso: o desenho do marcador visível
    apelido,                  // opcional, até 80: outros nomes, usados na busca
    descricao,                // até 600, texto formatado
    visibilidade,             // "todos" ou "admin"
    registradoPor, registradoNome, criadoEm, alteradoEm,
  }],
}];
```

Glifos aceitos: os da Linha do Tempo (marco, guerra, queda, fundacao, catastrofe, poder, pacto, arcano, descoberta, feito, lua, olho, escudo, montanha, sol, gota, navio, torre) e três novos, com o desenho do atlas: `floresta`, `cratera` e `arvore-morta`.

Limites: 30 mapas, 300 marcadores por mapa.

## Quem faz o quê

| Ação | Administrador | Editor | Jogador |
| --- | --- | --- | --- |
| Ver mapas e lugares "todos" | Sim | Sim | Sim |
| Enviar, trocar a imagem, alterar e apagar mapas | Sim | Não | Não |
| Importar lugares de um arquivo | Sim | Não | Não |
| Marcar lugares novos (marcadores visíveis) | Sim | Sim | Não |
| Alterar e mover marcadores | Qualquer um | Os que colocou | Não |
| Apagar marcadores | Sim | Não | Não |
| Deixar mapa ou marcador "só o administrador", e ver esses | Sim | Não | Não |

O que um editor cria entra sempre como `todos`, como na Linha do Tempo. Lugares impressos só são criados pela importação. Em Administração > Contas, o texto do cargo Editor (`ROTULO_EDITOR`, em `script.js`) passa a ser: "Editor (registra na Linha do Tempo, cadastra personagens e marca lugares nos mapas; alterar ou apagar acontecimentos passa pela sua aprovação)".

## Imagens

- O nginx do portal aceita envios de até 32 MB (`client_max_body_size 32M`). O limite dos mapas é **25 MB** (`CONFIG.maxMapa`, em `servidor/base.js`), usado só na rota de mapas. As outras imagens continuam com 10 MB. Não precisa mexer no nginx.
- O mapa de Tyrenar já existe pronto para enviar: 4000 × 3000 px, WEBP, 1,7 MB.
- A miniatura (uns 640 px no lado maior, WEBP) é feita pelo navegador num `<canvas>` na hora do envio e sobe junto, no campo `miniatura`. O servidor continua sem bibliotecas.
- A galeria mostra só as miniaturas; a imagem inteira só carrega no visor.

## Rotas (`servidor/mapas.js`, prefixo `/api/mapas`)

| Rota | Quem | O que faz |
| --- | --- | --- |
| `GET /api/mapas` | qualquer conta | `{ conta, mesas, mapas }`, só com o que a conta pode ver; cada marcador com `podeEditar` |
| `POST /api/mapas` | admin | formulário com `dados` (JSON), `imagem` e `miniatura` |
| `PUT /api/mapas/:id` | admin | altera; `imagem` e `miniatura` opcionais (trocar a imagem mantém os marcadores) |
| `DELETE /api/mapas/:id` | admin | apaga o mapa, os marcadores e os arquivos |
| `POST /api/mapas/:id/marcadores` | admin ou editor | cria um marcador visível (`impresso: false`) |
| `PUT /api/mapas/:id/marcadores/:marca` | admin, ou o editor que colocou | altera ou move. Num impresso, só mudam nome, tipo, apelido, descrição e visibilidade |
| `DELETE /api/mapas/:id/marcadores/:marca` | admin | apaga |
| `POST /api/mapas/:id/marcadores/importar` | admin | `{ lugares: [...] }` no formato de `lugares-tyrenar.json`. Confere cada lugar, pula os que já existem com o mesmo nome e devolve quantos entraram e quantos foram pulados |

Ganchos: `renomearConta` e `excluirConta` para `registradoPor`, como na Linha.

## A galeria (`publico/mapas/`)

Arquivos: `index.html`, `mapas.js`, `visor.js`, `mapas.css`. Esqueleto como em `linha-do-tempo/index.html`, com `data-pagina="mapas"`. O `visor.js` é carregado antes do `mapas.js` e só cuida de zoom e arraste.

- Cards com a miniatura e o nome, em grupos: primeiro **Draevor** (mapas sem mesa), depois um grupo por mesa.
- Para o administrador, "+ Mapa" (principal) e o lápis em cada card.
- Clicar num card abre o visor. Link próprio: `mapas/#mapa-<id>`, e `mapas/#mapa-<id>/<marca>` abre já com o lugar selecionado.

## O visor (sessão 3.2)

- O mapa ocupa o espaço abaixo do cabeçalho, com uma moldura de ferro fina e um botão "Voltar aos mapas".
- **Zoom:** a roda do mouse aproxima no ponto do cursor; no celular, pinça com dois dedos; botões + e −, e "Ver o mapa inteiro", numa coluna de ferramentas à direita; teclado: + e − para zoom, setas para mover, 0 para o mapa inteiro.
- **Ctrl + roda:** a pinça do touchpad chega como roda com Ctrl, e no app o Ctrl + roda também dá zoom na janela inteira. Sobre o mapa, trate os dois como zoom do mapa e cancele o padrão (`preventDefault` num listener `wheel` com `passive: false`).
- **Arraste:** segurar e arrastar move o mapa, com mouse ou dedo (pointer events).
- **Limites:** o zoom mínimo mostra o mapa inteiro com uma folga; o máximo é 2 vezes o tamanho real da imagem. O mapa nunca sai inteiro da tela.
- **Espaço do painel:** "Ver o mapa inteiro" centraliza o mapa no espaço que sobra ao lado do painel lateral (no celular, acima da gaveta).
- Técnica: uma camada com a imagem e, por cima, uma camada para os lugares, movidas juntas com `transform: translate(...) scale(...)` via `style.setProperty`. A camada dos lugares precisa saber a escala atual (para os anéis e as áreas clicáveis manterem tamanho na tela). Sem bibliotecas.

## Lugares e painel (sessão 3.3)

Tudo como no atlas (veja a referência), no visual do portal:

- **Impressos:** áreas clicáveis invisíveis no ponto (`raio`, com pelo menos 15 px na tela) e no nome (`caixa`, com uma folga). Hover: anel em pergaminho em volta do ponto e um rótulo de pergaminho com nome e tipo, igual ao da barra lateral. Regiões e reino, sem ponto: a caixa do nome fica levemente escurecida no hover.
- **Visíveis:** um círculo de ferro com o glifo, do mesmo tamanho na tela em qualquer zoom; cresce um pouco no hover. O glifo arcano é o único em azul arcano.
- **Seleção:** o mapa desliza até o lugar e um halo em brasa se desenha em volta dele (o arco que se completa e os quatro tracinhos do atlas). No marcador visível, o círculo fica em brasa.
- **"Destacar lugares":** um botão nas ferramentas que mostra um anel suave em todos os lugares impressos.
- **Painel lateral:** à esquerda no computador, gaveta no rodapé no celular. Busca no nome e no apelido (tecla `/`). Sem busca, o índice em grupos com contagem: Reino e terras, Capital, Cidades, Vilas, Relevo, Outros lugares. Passar o mouse num nome acende o anel no mapa. Clicar mostra o detalhe: "Índice" para voltar, nome, ícone e tipo, apelido, descrição (`paragrafosDe`), "Centralizar" e "Copiar link". `Esc` fecha o detalhe.
- Para o administrador, os lugares ocultos aparecem cobertos de névoa no índice e no mapa.

## Editar e importar (sessão 3.4)

O administrador e os editores veem o botão "Editar lugares" nas ferramentas do visor. Ligado:

- clicar num ponto vazio do mapa abre o formulário de um marcador visível novo naquele ponto: nome, tipo, glifo (grade com os glifos), apelido, descrição e visibilidade (só o administrador);
- arrastar um marcador visível que a conta pode editar muda o lugar dele (salva ao soltar);
- no detalhe de um lugar que a conta pode editar, o lápis abre o mesmo formulário (nos impressos, sem glifo e sem mover), com "Apagar" só para o administrador.

Para o administrador, "Importar lugares" abre a escolha de um arquivo `.json` no formato de `lugares-tyrenar.json`, lê no navegador, manda para `/importar` e avisa quantos entraram. É assim que os 36 lugares de Tyrenar entram no mapa depois que ele for enviado.

## Visual

O estilo do portal: ferro, fuligem e pergaminho; as cinzas do fundo (`iniciarCinzas(30)`) só na galeria, não no visor. A brasa fica na placa da barra lateral, nos botões principais e na seleção. O painel lateral do visor é fuligem com bordas de ferro, como os diálogos do portal.

## Prévia

`criarApiDePrevia()` com os mesmos nomes do `apiDoServidor`. A sessão 3.1 copia `planejamento/referencias/previa-tyrenar.webp` para `portal/publico/mapas/previa-tyrenar.webp` e usa como imagem do mapa de exemplo (1600 × 1200; as proporções são as mesmas do mapa real). Os marcadores de exemplo são os de `lugares-tyrenar.json` (copiados para dentro do `mapas.js`), mais dois visíveis marcados por um editor e um oculto. O painel `#simulacao` com "Ver a página como" (Administrador, Editor ou Jogador) e "Restaurar os exemplos".

## Fora desta versão

Do atlas: a régua com distância e dias de viagem (Pathfinder e D&D), a grade hexagonal e o ajuste de escala. Do portal: ligar lugares a acontecimentos da Linha; mapas dentro de mapas (um lugar que abre o mapa da região).

## Sessões

- **3.1 Servidor, envio e galeria:** `servidor/mapas.js` com dados, todas as rotas (inclusive `/importar`), limite de 25 MB e ganchos; registrar em `PAGINAS`; a pasta `publico/mapas/` com a galeria, o envio de mapa pelo administrador (miniatura no `canvas`, largura e altura medidas no navegador) e a prévia com a imagem de Tyrenar. Sem visor.
- **3.2 Visor (em modo de plano):** `visor.js` com tudo da seção "O visor", sem lugares ainda, mas com a camada de lugares pronta e a escala disponível para ela.
- **3.3 Lugares e painel:** impressos, visíveis, anel, rótulo, halo, "Destacar lugares", painel com índice, busca e detalhe, link de cada lugar e os lugares de Tyrenar na prévia.
- **3.4 Editar, importar e acender (em modo de plano):** o modo "Editar lugares", o formulário, mover, apagar, "Importar lugares", o texto novo do cargo Editor e `pronta: true` para `mapas` em `PAGINAS`.
