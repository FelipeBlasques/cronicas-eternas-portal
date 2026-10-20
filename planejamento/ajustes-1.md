# Ajustes 1: Mesas, Personagens e Linha do Tempo

Pacote de ajustes depois das três páginas novas. Decisões fechadas em 20/10/2026. Vai para o servidor como a **atualização 13**, só depois das três sessões juntas na `main` (entre a 4.1 e a 4.2 a galeria fica sem imagens).

Sessões: 4.1 servidor da arte da galeria · 4.2 página Personagens · 4.3 Linha do Tempo (veja "Sessões" no fim).

## 1. A arte da galeria separada do card das Mesas

Hoje a ficha da galeria usa a `capa` e a `arte` do personagem, as mesmas do card das Mesas. Trocar a imagem numa página muda a outra. Daqui em diante, cada página tem as suas imagens:

- **Mesas:** o card continua com `capa` e `arte` (a recortada que salta do card). Elas mudam só pelo "Personalizar" das Mesas e por Administração > Personagens, como hoje. Nada muda na página Mesas.
- **Personagens:** uma imagem só, a **arte** da ficha, guardada no campo novo `retrato`. Ela aparece no card da galeria (no lugar da capa), na ficha aberta e no círculo do personagem na Linha do Tempo. Não existe mais arte recortada na galeria.

Nome e fonte continuam um só para as duas páginas (mudam pelo "Personalizar" das Mesas, como hoje).

### Dados

| Onde | Antes | Depois |
| --- | --- | --- |
| `dados.personagens[]` (do portal) | `capa`, `arte` (Mesas e galeria) | `capa`, `arte` só das Mesas; `retrato` (string ou `null`) da galeria |
| `dados.outrosPersonagens[]` | `capa`, `arte` | só `retrato` |

### Migração (no `iniciar()` de `servidor/personagens.js`, uma vez só)

Roda para cada personagem que ainda não tem a chave `retrato`:

- **Personagens do portal:** o `retrato` nasce com uma **cópia** do arquivo da `capa` (ou da `arte`, se não houver capa), num arquivo novo de `uploads/` com nome aleatório e a mesma extensão. É cópia para que trocar ou remover a imagem numa página nunca apague o arquivo da outra. Se o endereço não for de `/uploads/` (imagem fixa do site), o `retrato` usa o mesmo endereço, sem copiar. Sem capa e sem arte, ou se o arquivo não existir, `retrato: null`. A `capa` e a `arte` continuam como estão.
- **Outros personagens:** `retrato` = a `capa`; sem capa, a `arte`; sem nenhuma, `null`. Depois, as chaves `capa` e `arte` saem do registro. **Nenhum arquivo é apagado:** a arte recortada que sobrar fica esquecida em `uploads/` (decisão do Fe).

O `iniciar()` continua síncrono e devolve `true` quando mudou alguma coisa. Para copiar, use `fs.copyFileSync` e o caminho de `uploads` que o `base.js` já conhece (exporte o que faltar de lá).

### Rotas

- `GET /api/galeria`: cada personagem traz `retrato` no lugar de `capa` e `arte`.
- `PUT /api/galeria/ficha/:id`, `POST /api/galeria/outros` e `PUT /api/galeria/outros/:id`: a imagem vem no arquivo `retrato`, e `remover_retrato=1` remove. Os campos `capa` e `arte` deixam de existir nessas rotas. Use uma constante própria (ex.: `CAMPOS_IMAGEM_GALERIA = ["retrato"]`); a `CAMPOS_IMAGEM_PERSONAGEM` continua sendo a das Mesas.
- `DELETE /api/galeria/outros/:id`: apaga o arquivo do `retrato`.
- Administração > Personagens, apagar um personagem do portal (`servidor/admin.js`): apaga também o `retrato`.
- `PUT /api/personagens/:id` (o "Personalizar" das Mesas) e a Administração nunca mexem no `retrato`.
- Linha do Tempo (`personagensDaLinha()` em `servidor/linha.js`): a imagem do círculo passa a ser o `retrato`, nos dois grupos. Sem retrato, `null` (a página mostra a inicial, como hoje).

## 2. A página Personagens

### A imagem única

- **Formulário de edição:** os campos "Capa" e "Arte recortada" viram um só, **"Arte"** (`#campo-retrato`, `name="retrato"`), com a miniatura e o "Remover" de hoje. Ajuda abaixo do campo: "Aparece aqui na galeria e na Linha do Tempo. O card das Mesas continua com as imagens do Personalizar."
- **Card da galeria:** `montarCardComMoldura()` recebe o `retrato` como capa e nenhuma arte. Sem retrato, a pedra escura no tom da mesa, como hoje.
- **Ficha aberta:** o retrato à esquerda, preenchendo a coluna (`object-fit: cover`, preso ao alto). Sem retrato, a ficha fica numa coluna só, como hoje.
- **Prévia:** os exemplos passam a usar `retrato`.

### O hover novo: "Acender a capa"

Só na galeria. O card das Mesas continua com a animação de hoje, então as regras novas ficam no `personagens.css`, presas a `.galeria .card`.

- A moldura **não deita mais para trás**: ela sobe uns 6 px, com a sombra mais funda.
- A capa sai do tom apagado para a cor cheia (como hoje) e **aproxima devagar**, uns 6% em cerca de 1,2 s, recortada dentro da moldura (cantos arredondados, nada vaza).
- O nome sobe um pouco (uns 0,6 rem), sem o salto em 3D de hoje. A linha da queda dos caídos acompanha o nome.
- O véu escuro da base sobe, como hoje.
- `:focus-visible` faz o mesmo que o hover. Com `prefers-reduced-motion`, só a cor muda.
- O espaço que a grade reservava no alto para a arte saltar (`padding-top: 5.8rem` da `.galeria`) volta ao normal, e o espaço entre as linhas de cards diminui na mesma proporção.

### A névoa do desaparecido

Hoje a névoa é um `::after` do `.card`, fora da moldura: no hover a moldura se mexe e a névoa fica para trás, fora do quadro. A névoa passa a ficar **dentro da `.card__moldura`** (um elemento a mais montado pelo `personagens.js`, ou outra forma que a mantenha dentro dela), recortada pelos cantos e acompanhando a moldura em qualquer movimento. No hover, ela esmaece como hoje. A regra do celular acompanha.

### Filtros fixos

Os filtros ficam **presos no alto ao rolar**, como na Linha do Tempo: logo abaixo do cabeçalho, com o mesmo fundo escuro com desfoque, a faixa que cobre a fresta entre o cabeçalho e os filtros, e acima dos cards (os cards passam por baixo). No celular, continuam atrás do botão "Filtros".

## 3. A Linha do Tempo

### Editor altera sem aprovação

| Ação do editor | Antes | Depois |
| --- | --- | --- |
| Registrar | direto | direto (igual) |
| Alterar qualquer acontecimento que ele vê, inclusive o Expurgo (só título e descrição, como hoje) | pedido | **direto**: título, descrição, data, período, tipo, importância, imagem, mesas e personagens citados |
| Apagar | pedido | pedido (igual) |
| Escolher quem vê | não | não (igual) |

Regras do servidor (`alterarAcontecimento` em `servidor/linha.js`):

- O editor altera como o administrador, menos a **visibilidade**, que continua a do acontecimento (e a regra de selar de novo o "revelar depois" continua só do administrador).
- Os personagens ocultos que o editor não vê continuam citados, como já acontece no pedido de hoje.
- Se o próprio editor tinha um pedido de alteração esperando para aquele acontecimento, ele some (e a imagem que o pedido trazia é apagada). Pedidos de outros editores continuam.
- A resposta é `{ pendente: false }`. No log: `<usuário> alterou na Linha do Tempo: <título>`.
- Os pedidos de alteração feitos antes da atualização continuam no painel do administrador para aprovar ou recusar. O fluxo de aprovar e recusar continua igual.
- O comentário do alto do arquivo passa a dizer que só apagar vira pedido.

Na página (`linha.js`):

- O botão do formulário de alteração passa a ser "Salvar" também para o editor; sai o aviso "A alteração vai para o administrador aprovar".
- Depois de salvar: "Acontecimento alterado."
- A prévia (`criarApiDePrevia`) segue a regra nova.
- O texto do painel de pendências passa a: "Pedidos dos editores esperando você. O card só muda depois que você aprovar."

Em Administração > Contas, o texto do cargo (`ROTULO_EDITOR`, em `script.js`) passa a ser: "Editor (registra e altera acontecimentos na Linha do Tempo, cadastra personagens e marca lugares nos mapas; apagar acontecimentos passa pela sua aprovação)".

### Panorama fixo

O Panorama fica **preso no alto ao rolar**, logo abaixo dos filtros, como um bloco só com eles.

- Mesmo fundo escuro com desfoque dos filtros (hoje o Panorama é mais transparente), sem fresta entre os dois.
- O sugerido é envolver filtros e Panorama num contêiner fixo (`position: sticky`). Tudo o que hoje conta a altura dos filtros passa a contar o bloco inteiro: a variável `--altura-filtros` (o ano preso no alto e os `scroll-margin-top`), o `ResizeObserver` do `medirAlturas()` e o `alturaPresa()`.
- Clicar no trilho continua levando ao ano, e a janela continua acompanhando a rolagem.
- **Celular:** o Panorama continua fixo, mas compacto: sem a linha do título e da legenda, e com o trilho mais baixo. Os filtros continuam atrás do botão "Filtros".

## Sessões

- **4.1 Arte da galeria no servidor:** a parte 1 inteira: `servidor/personagens.js` (migração e rotas), o que faltar exportar do `base.js`, `servidor/admin.js` (apagar) e `servidor/linha.js` (círculo da Linha). Testar com o servidor e `curl`, incluindo a migração a partir de dados com `capa` e `arte` nos dois grupos.
- **4.2 Página Personagens:** a parte 2 inteira: imagem única (formulário, card, ficha, prévia), o hover novo, a névoa e os filtros fixos.
- **4.3 Linha do Tempo:** a parte 3 inteira: editor altera direto (servidor, página, prévia e `ROTULO_EDITOR`) e o Panorama fixo.
