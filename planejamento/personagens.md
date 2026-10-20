# Personagens

A galeria de todos os personagens de Draevor: os dos jogadores, que já estão no portal, e os NPCs e personagens de mesas antigas, cadastrados pelo administrador ou por um editor. Os caídos continuam na galeria, como lápides. Sem login, a página manda para a entrada. Decisões fechadas em 19/10/2026.

> **Mudou depois (20/10/2026):** a galeria tem uma imagem só, a arte em `retrato`, separada da capa e da arte do card das Mesas. O que vale está em `ajustes-1.md`, partes 1 e 2.

Sessões: 2.1 servidor e citações na Linha · 2.2 galeria · 2.3 ficha aberta e jornada · 2.4 edição e acender o botão (veja "Sessões" no fim).

## Quem aparece

- **Personagens do portal:** os de `dados.personagens`, que têm card na página Mesas. Continuam sendo criados em Administração > Personagens, com dono, campanha e login do Foundry. Na galeria, ganham uma ficha.
- **Outros personagens:** NPCs e personagens de jogadores das mesas antigas, em `dados.outrosPersonagens`. Não aparecem na página Mesas e não entram no Foundry.

Os dois grupos podem ser citados na Linha do Tempo.

## A ficha

| Campo | Personagens do portal | Outros personagens |
| --- | --- | --- |
| Nome e fonte | os que já existem (`nome`, `fonte`) | `nome` (até 60), `fonte` (chave de `FONTES`) |
| Imagens | `capa` e `arte`, as mesmas do card das Mesas | `capa` e `arte` |
| Papel | sempre personagem de jogador | `papel`: `jogador` ou `npc` |
| Jogador | a conta dona (`dono`) | `jogador`: texto livre, até 40 (ex.: nome de quem jogou numa mesa antiga) |
| Mesas | a `campanha` | `mesas`: ids de campanhas ou de mesas antigas da Linha (`dados.linha.mesasAntigas`) |
| Situação | `situacao`: `vivo` (padrão), `caido`, `desaparecido` ou `aposentado` | igual |
| Ancestralidade e classe | `origem`: texto livre, até 80. Ex.: "Elfo, mago 7" | igual |
| Resumo | `resumo`: uma frase, até 160, aparece no card | igual |
| História | `historia`: até 6000, com negrito, itálico, parágrafos e listas | igual |
| Queda | `queda`: `{ data, epitafio }` só para caídos. `data` no Ciclo de Sylara, no mesmo formato da Linha (`{ ano, mes, dia, aprox }`, só o ano obrigatório). `epitafio` até 160 | igual |
| Visibilidade | sempre todos | `visibilidade`: `todos` ou `admin` (NPC que o grupo ainda não conheceu) |
| Registro | não tem | `registradoPor`, `registradoNome`, `criadoEm`, `alteradoEm` |

Ids dos outros: `npc-` mais 8 caracteres hexadecimais. Limite: 500 outros personagens.

## Quem faz o quê

| Ação | Administrador | Editor | Jogador |
| --- | --- | --- | --- |
| Cadastrar outros personagens | Sim | Sim | Não |
| Alterar outros personagens | Qualquer um | Os que cadastrou | Não |
| Apagar outros personagens | Sim | Não | Não |
| Preencher a ficha de qualquer personagem do portal | Sim | Não | Não |
| Escrever resumo, ancestralidade e história do próprio personagem | Sim | Sim | Sim |
| Trocar `capa` e `arte` do próprio personagem | Sim | Sim | Sim |
| Mudar situação e queda dos personagens do portal | Sim | Não | Não |
| Deixar um personagem "só o administrador" | Sim | Não | Não |
| Ver personagens "só o administrador" | Sim | Não | Não |

- "Próprio personagem" é o personagem do portal cujo `dono` é a conta.
- O que um editor cadastra entra sempre como `todos`, e o editor não muda a visibilidade, como na Linha do Tempo.
- Ninguém precisa de aprovação nesta página.
- Em Administração > Contas, o texto da caixa do cargo Editor (`ROTULO_EDITOR`, em `script.js`) passa a ser: "Editor (registra na Linha do Tempo e cadastra personagens; alterar ou apagar acontecimentos passa pela sua aprovação)".

## Rotas (`servidor/personagens.js`, prefixo `/api/galeria`)

O prefixo é `/api/galeria` para não colidir com o `PUT /api/personagens/:id` que já existe (nome e fonte, em `servidor/mesas.js`).

| Rota | Quem | O que faz |
| --- | --- | --- |
| `GET /api/galeria` | qualquer conta | `{ conta: { usuario, nome, cargo }, mesas, personagens, jornada }`. `mesas`: campanhas e mesas antigas (`{ id, nome, cor, antiga? }`). `personagens`: os do portal e os outros que a conta pode ver, num formato só, com `origemDoDado: "portal"` ou `"outro"`, `podeEditar` e, para o portal, `dono` e `nomeDono`. Os logins do Foundry nunca vêm aqui. `jornada`: para cada id de personagem, os acontecimentos da Linha que a conta pode ver e que o citam, `[{ id, titulo, data, ate }]` |
| `PUT /api/galeria/ficha/:id` | dono ou admin | ficha de um personagem do portal. Formulário com `dados` (JSON) e, opcionalmente, os arquivos `capa` e `arte` (e `remover_capa`, `remover_arte`). O dono só muda `resumo`, `origem`, `historia` e as imagens; o administrador muda tudo |
| `POST /api/galeria/outros` | admin ou editor | cria. Mesmo formato de formulário. Para o editor, `visibilidade` é sempre `todos` |
| `PUT /api/galeria/outros/:id` | admin, ou o editor que cadastrou | altera. O editor não muda `visibilidade` |
| `DELETE /api/galeria/outros/:id` | admin | apaga, apaga as imagens e tira o id das citações da Linha (`ev.personagens` e os pedidos pendentes), como `apagarMesaAntiga` faz com as mesas |

- Imagens: até 10 MB cada, com `lerFormulario`, `validarImagens`, `aplicarImagens` (veja `servidor/base.js` e `servidor/admin.js`).
- A data da queda é conferida com a mesma regra da Linha. Exporte de `servidor/linha.js` o que precisar (`lerDataDaLinha`, `podeVer`) em vez de copiar.
- Ganchos: `renomearConta` acerta `registradoPor`; `excluirConta` limpa `registradoPor` e guarda `registradoNome`, como a Linha faz.
- Apagar um personagem do portal (em Administração) já existe e continua igual; ele some da galeria junto.

## Ligação com a Linha do Tempo (sessão 2.1)

- `idsDosPersonagens()` e a lista `personagens` de `dadosDaLinha` (`servidor/linha.js`) passam a incluir os outros personagens. Quem não é administrador não recebe os ocultos, e eles somem das citações que essa conta vê.
- Cada personagem da lista da Linha ganha `imagem` (a `arte` ou, sem ela, a `capa`) e `mesas` (para os do portal, `[campanha]`).
- Em `linha.js`, `retrato()` mostra essa imagem num círculo quando existe (e a inicial quando não existe), e `nomeDoPersonagem()` usa a primeira mesa para desempatar nomes repetidos. O formulário de registro já lista os personagens que vierem do servidor.

## A galeria (`publico/personagens/`)

Arquivos: `index.html`, `personagens.js`, `personagens.css`. Esqueleto como em `linha-do-tempo/index.html`, com `data-pagina="personagens"`.

- **Calendário:** a galeria precisa escrever datas do Ciclo de Sylara. Mova a seção "O Ciclo de Sylara" do `linha.js` (`MESES`, `ESTACOES`, `DIAS_DA_DEZENA`, `FASES`, `faseDaLua`, `diaDaDezena`, `ehSylara`, `chaveDaData`, `textoDaData`, `textoDoPeriodo`) para um `publico/calendario.js` novo, carregado depois do `comum.js` nas duas páginas.
- **Cards em grade:** o card das Mesas (`montarCardComMoldura`, no `comum.js`; estilos `.card` no `style.css`), com o nome na fonte escolhida. Abaixo do card, o resumo e as etiquetas das mesas.
- **Filtros no alto:** um botão por mesa, papel (Todos, Jogadores, NPCs), situação (Todos, Vivos, Caídos, Desaparecidos, Aposentados) e busca pelo nome e pelo resumo.
- **Ordem:** vivos primeiro; depois desaparecidos e aposentados; por último os caídos. Dentro de cada grupo, por nome.
- **Caídos:** o card fica sem cor (`filter: grayscale`), como uma lápide, com "Caiu em 15 de Florentis de 312 ED" abaixo do nome.
- **Desaparecidos:** card esmaecido, com uma névoa por cima.
- **Ocultos:** só o administrador vê, com o olho riscado, como `evento--oculto` na Linha.
- Para o administrador e os editores, o botão "+ Personagem" (principal).
- Celular: duas colunas de cards; filtros recolhidos atrás de um botão "Filtros", como na Linha do Tempo.

## A ficha aberta (sessão 2.3)

Clicar num card abre a ficha num `<dialog>`, como os acontecimentos da Linha. Link próprio: `personagens/#personagem-<id>`; abrir esse endereço abre a ficha.

- A arte grande, o nome, o papel, o jogador, as mesas, a situação e a ancestralidade.
- O resumo e a história (`paragrafosDe`).
- Para caídos, a queda: data por extenso e o epitáfio.
- **Na Linha do Tempo:** os acontecimentos da `jornada` do personagem, do mais antigo ao mais recente, com a data no Ciclo de Sylara. Cada um é um link para `../linha-do-tempo/#evento-<id>`, que já abre o acontecimento.
- Botão "Copiar link". Para quem pode editar, o lápis.

## Edição (sessão 2.4)

Um diálogo de formulário com os campos que a conta pode mudar (veja "Quem faz o quê"):

- nome e fonte (só outros personagens; os do portal mudam nome e fonte pelo "Personalizar" das Mesas, que continua igual);
- papel, jogador e mesas (só outros);
- situação e queda (a data com ano, mês e dia em campos simples, como o "Até" do formulário da Linha; o epitáfio só aparece quando a situação é "Caído");
- ancestralidade e classe, resumo, história;
- capa e arte, com miniatura e "Remover";
- visibilidade (só o administrador, só outros).

Apagar (só o administrador, só outros) pede confirmação com `perguntar()`.

## Visual

O estilo do portal. A brasa fica só na placa da barra lateral, no botão "+ Personagem" e no foco dos cards. O azul arcano não aparece nesta página. As cinzas do fundo com `iniciarCinzas(30)`.

## Prévia

`criarApiDePrevia()` com os mesmos nomes do `apiDoServidor`. Exemplos de mentira: seis personagens do portal (os das campanhas de exemplo), quatro NPCs, dois caídos (um com queda e epitáfio), um desaparecido, um oculto e alguns acontecimentos na jornada. O painel `#simulacao` com "Ver a página como" (Administrador, Editor ou Jogador) e "Restaurar os exemplos".

## Fora desta versão

Registrar a queda na Linha a partir da ficha; frases marcantes do personagem; atalho do card das Mesas para a ficha.

## Sessões

- **2.1 Servidor e citações na Linha:** `servidor/personagens.js` com dados, rotas e ganchos; registrar em `PAGINAS`; as mudanças na Linha do Tempo (servidor e `retrato()`/`nomeDoPersonagem()` no `linha.js`). Testar com o servidor rodando e `curl`.
- **2.2 Galeria:** `publico/calendario.js`, a pasta `publico/personagens/` com grade, filtros, ordem, situações, ocultos, celular e a prévia. Sem ficha aberta e sem edição.
- **2.3 Ficha aberta e jornada:** o diálogo da ficha, o link próprio e a lista "Na Linha do Tempo".
- **2.4 Edição e acender:** o formulário, apagar, o texto novo do cargo Editor e `pronta: true` para `personagens` em `PAGINAS`.
