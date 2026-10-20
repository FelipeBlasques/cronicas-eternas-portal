# Referência: o Atlas de Tyrenar

Uma página HTML feita antes do portal, que mostra o mapa de Tyrenar com lugares clicáveis. Ela ficou boa e é o modelo da página Mapas, principalmente no jeito de posicionar e mostrar os marcadores. O arquivo original tem 2,6 MB, quase tudo de imagem, e não está no repositório. Este resumo traz o que importa dele.

Arquivos nesta pasta:

- `lugares-tyrenar.json`: os 36 lugares do atlas, já no formato dos marcadores do portal (posições em proporção da imagem).
- `previa-tyrenar.webp`: o mapa em 1600 × 1200 px, para a prévia da página.

O mapa de verdade (4000 × 3000 px, WEBP, 1,7 MB) é enviado pelo administrador pela própria página, depois da sessão 3.1.

## A ideia principal: o mapa já tem os lugares desenhados

As cidades, vilas, regiões e o nome do reino já estão desenhados na imagem, com um ponto e o nome escrito. O atlas **não desenha ícones por cima deles**. Ele põe áreas clicáveis invisíveis no lugar certo:

- um **círculo** em volta do ponto (`x`, `y`, `raio`), e
- um **retângulo** em volta do nome escrito no mapa (`caixa`), com uma pequena folga.

Passar o mouse num dos dois mostra um **anel** em volta do ponto e um **rótulo** com o nome e o tipo ("Westna · Capital do reino"). Clicar seleciona o lugar: o mapa voa até ele e um **halo** se desenha em volta do ponto (um arco que se completa em 0,8 s e quatro tracinhos nas direções), e o painel lateral mostra o detalhe. Regiões e o reino não têm ponto, só a caixa do nome.

Na camada "Destacar cidades e vilas", todos os lugares impressos ganham um anel suave, para quem não sabe onde clicar.

Só o **relevo** (florestas, montanhas, cratera, bosque morto) ganha um marcador visível: um círculo pequeno com um ícone, porque o mapa não escreve o nome deles.

No portal, isso vira o campo `impresso` dos marcadores:

- `impresso: true` → área clicável invisível (`raio` e `caixa`), anel no hover, halo na seleção;
- `impresso: false` → marcador visível com `glifo` (relevo e tudo o que alguém marcar depois pelo portal).

O tamanho do anel e da área clicável acompanha o zoom: no atlas, o diâmetro do anel é `max(28px, (raio × 2 + 30 px do mapa) × escala)`, e a área clicável tem pelo menos 15 px de raio na tela.

## O painel lateral

- No computador, um painel fixo à esquerda do mapa; no celular, uma gaveta que sobe do rodapé (com uma alça para abrir e fechar).
- No alto, a busca ("Buscar cidade, vila ou região"), que procura no nome e no `apelido` (outros nomes, ex.: "Terras Eclipsadas"), sem acentos. A tecla `/` leva à busca.
- Sem busca, o **índice** em grupos, cada um com a contagem: Reino e terras vizinhas, Capital, Cidades, Vilas, Relevo. Dentro do grupo, por nome. Passar o mouse num nome do índice acende o anel no mapa.
- Clicar num nome (no índice ou no mapa) troca o índice pelo **detalhe**: botão "Índice" para voltar, nome, ícone e tipo, apelido, descrição e "Centralizar no mapa".
- `Esc` fecha o detalhe.

## Os ícones do atlas

Traços de 24 × 24, sem preenchimento salvo onde indicado, `stroke-width` 1,8. Use estes desenhos nos novos `<symbol>` da página (glifos `floresta`, `cratera`, `arvore-morta`) e nos ícones do índice.

| Ícone | Desenho |
| --- | --- |
| capital | `<circle cx="12" cy="12" r="7.2" stroke-width="2.4"/><circle cx="12" cy="12" r="3" fill="currentColor" stroke="none"/>` |
| cidade | `<circle cx="12" cy="12" r="5.4" fill="currentColor" stroke="none"/>` |
| vila | `<circle cx="12" cy="12" r="3.5" fill="currentColor" stroke="none"/>` |
| reino e regiões | `<path d="M6 21V3.5"/><path d="M6 4.5h11.5l-2.8 4 2.8 4H6"/>` |
| floresta | `<path d="M12 2.8 7 9.5h2.8L5.5 15.5h13L14.2 9.5H17z"/><path d="M12 15.5V21"/>` |
| montanha | `<path d="m2.5 19.5 6.8-11.5 4.3 7.2 2.3-3.6 5.6 7.9z"/><path d="m7.4 12.7 1.9 1.3 1.6-1.6"/>` |
| cratera | `<ellipse cx="12" cy="13" rx="9" ry="5.6"/><ellipse cx="12" cy="13.6" rx="4.4" ry="2.4"/><path d="M5 10.2 7 12M19 10.2 17 12"/>` |
| árvore morta | `<path d="M12 21v-9.5"/><path d="M12 14 7.5 9.5"/><path d="M12 12 16 7"/><path d="M7.5 9.5 6 6.5"/><path d="M7.5 9.5 4.5 9"/><path d="m16 7 2.5-.8"/><path d="M16 7l-.4-3"/><path d="M12 11.5 11 5"/>` |

## O que não copiar

- **Leaflet e os ladrilhos (tiles).** O portal não usa bibliotecas. O mapa é uma imagem só, de 4000 × 3000 px, e o visor faz zoom e arraste com `transform`.
- **As cores do atlas** (azul de tinta, tema claro e escuro). O portal tem o próprio visual: anel em pergaminho, seleção em brasa.
- **Os marcadores salvos no navegador** (`localStorage`). No portal, os marcadores ficam no servidor e valem para todo mundo.
- **Régua, tempo de viagem, grade hexagonal e escala.** Ficam para depois (veja "Fora desta versão" em `mapas.md`).
