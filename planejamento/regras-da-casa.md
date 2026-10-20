# Regras da casa

O livro de regras próprias do grupo. Só o administrador escreve, e qualquer conta lê. Sem login, a página manda para a entrada, como a Linha do Tempo. Decisões fechadas em 19/10/2026.

Sessões: 1.1 servidor · 1.2 página de leitura · 1.3 edição do administrador · 1.4 acender o botão e o ponto de novidade (veja "Sessões" no fim).

## O que a página guarda

As regras ficam em capítulos, um por assunto. Na primeira vez (quando `dados.regras` não existe), o `iniciar()` cria estes capítulos vazios, nesta ordem:

Criação de personagem · Combate · Descanso e cura · Morte e ressurreição · Itens e tesouro · Magia · Conduta à mesa

Cada regra tem:

| Campo | Regra |
| --- | --- |
| `titulo` | Obrigatório, até 120 caracteres. Ex.: "Crítico em 19 e 20" |
| `capitulo` | Obrigatório, id de um capítulo existente |
| `texto` | Obrigatório, até 6000 caracteres. Negrito, itálico, parágrafos e listas (veja "Texto formatado") |
| `mesas` | Ids de campanhas (`dados.campanhas`). Lista vazia = vale para todas as mesas |
| `situacao` | `vigor` (em vigor), `teste` (em teste) ou `revogada` |
| `criadaEm`, `alteradaEm` | ISO, automáticos |
| `avisadaEm` | ISO. Na criação, igual a `criadaEm`. Numa alteração, só muda se o administrador deixar marcado "Avisar como alteração" |

As datas aqui são do mundo real, e não do Ciclo de Sylara: uma regra da casa é sobre a mesa de jogo, não sobre Draevor.

## Dados

```js
dados.regras = {
  capitulos: [{ id: "cap-xxxxxxxx", nome }],          // a ordem é a da lista
  itens: [{ id: "regra-xxxxxxxx", capitulo, titulo, texto, mesas: [], situacao,
            criadaEm, alteradaEm, avisadaEm }],        // a ordem dentro do capítulo é a da lista
};
// e em cada conta:
conta.regrasVistasEm = "2026-10-19T22:00:00.000Z";     // última vez que a pessoa abriu a página
```

Limites: 40 capítulos, 500 regras, nome de capítulo até 60 caracteres. Ids com `novoId()` no mesmo estilo de `servidor/linha.js`.

## Rotas (`servidor/regras.js`, prefixo `/api/regras`)

| Rota | Quem | O que faz |
| --- | --- | --- |
| `GET /api/regras` | qualquer conta | `{ conta: { usuario, nome, cargo }, mesas: [{ id, nome, cor }], capitulos, itens, novidades }`. Cada item vem com `novidade: true` quando `avisadaEm` é depois do `regrasVistasEm` da conta (sem `regrasVistasEm`, nada é novidade). `novidades` é a contagem |
| `POST /api/regras/visto` | qualquer conta | grava `conta.regrasVistasEm` = agora. A página chama depois de desenhar, para os selos da visita atual continuarem visíveis |
| `POST /api/regras/capitulos` `{ nome }` | admin | cria no fim |
| `PUT /api/regras/capitulos/:id` `{ nome }` | admin | renomeia |
| `DELETE /api/regras/capitulos/:id` | admin | só se o capítulo estiver vazio (409 com mensagem, se não) |
| `POST /api/regras/itens` `{ capitulo, titulo, texto, mesas, situacao }` | admin | cria no fim do capítulo |
| `PUT /api/regras/itens/:id` `{ ..., avisar }` | admin | altera; `avisar: true` atualiza `avisadaEm`. Mudar de capítulo põe a regra no fim do novo |
| `DELETE /api/regras/itens/:id` | admin | apaga |
| `POST /api/regras/ordem` `{ capitulos }` ou `{ itens }` | admin | recebe a lista completa de ids na nova ordem; recusa (400) se não for exatamente a mesma lista de ids |

Use `ErroHttp` com mensagens em português para a pessoa, `exigirAdmin` no mesmo estilo da Linha do Tempo, e `salvarDados()` depois de cada mudança. Ao renomear uma conta, `regrasVistasEm` já vai junto (está na própria conta); não precisa de gancho.

## Texto formatado

O texto usa o mesmo formato das descrições da Linha do Tempo (`textoFormatado` e `paragrafosDe`, no `comum.js`), mais listas:

- um bloco (separado por linha em branco) em que todas as linhas começam com `- ` vira `<ul>`;
- um bloco em que todas as linhas começam com `1. `, `2. ` etc. vira `<ol>`;
- dentro dos itens continuam valendo **negrito** e *itálico*.

Faça isso estendendo o `paragrafosDe` do `comum.js`, sem nunca interpretar HTML. A Linha do Tempo passa a ganhar listas também, o que está certo.

## A página (`publico/regras/`)

Arquivos: `index.html`, `regras.js`, `regras.css`. Use `linha-do-tempo/index.html` como esqueleto (veja o CLAUDE.md), com `data-pagina="regras"`.

**No alto:** o título "Regras da casa", uma linha de apoio ("O que o grupo combinou à mesa."), a busca, um botão na cor de cada mesa (o mesmo visual dos filtros de mesa da Linha do Tempo, `.escolha--mesa` em `linha.css`; copie as regras de estilo que precisar para `regras.css`) e a caixa "Mostrar revogadas". Para o administrador, os botões "+ Capítulo" (leve) e "+ Regra" (principal, em brasa).

**Novidades:** se `novidades > 0`, uma faixa discreta no alto: "Desde a sua última visita: 2 regras novas ou alteradas". As regras com `novidade` ganham o selo "Novidade".

**À esquerda:** o sumário com os capítulos, preso enquanto a página rola, com o capítulo atual destacado. Clicar leva ao capítulo. Abaixo de 760 px, o sumário vira um `<select>` no alto.

**O corpo:** os capítulos em sequência. O título do capítulo vem em Grenze Gotisch com a primeira letra maior, em pergaminho claro (capitular). Entre capítulos, o divisor ornamental (o `<symbol id="divisor">` que as outras páginas já têm). Capítulo vazio mostra "Nenhuma regra neste capítulo ainda." só para o administrador; para os outros, o capítulo vazio some.

**Cada regra:** o número "§ 2.3" (capítulo 2, regra 3, contando só as visíveis daquele capítulo), o título, os selos (Em teste, Novidade e as etiquetas das mesas quando não vale para todas), o texto e, no pé, "Desde 12/10/2026" ou "Alterada em 19/10/2026" (data de `avisadaEm` quando for diferente de `criadaEm`). Um botão pequeno copia o link da regra. Para o administrador, o lápis e as setas ↑ ↓.

- **Em teste:** borda tracejada.
- **Revogada:** escondida por padrão. Com "Mostrar revogadas", aparece no fim do capítulo, riscada e apagada, com o selo "Revogada".

**Filtros:** a busca procura no título e no texto, sem acentos (`normalizar`). Com mesas escolhidas, aparecem as regras que valem para todas as mesas e as que citam alguma das escolhidas. Sem resultado, uma mensagem curta.

**Link próprio:** `regras/#regra-<id>`. Ao abrir com esse endereço, a página rola até a regra e a destaca por um instante, como a Linha do Tempo faz com os acontecimentos.

**Celular:** uma coluna, sumário no `<select>`, barra lateral no rodapé (já vem do `style.css`).

## Edição do administrador

Um diálogo (`<dialog>`) para criar e alterar, com: título, capítulo (`<select>`), mesas (chips; nenhum marcado = todas), situação (três opções), texto (`<textarea>`) com uma prévia ao lado mostrando o texto formatado, e a caixa "Avisar como alteração" (só ao alterar, marcada por padrão).

- As setas ↑ ↓ mudam a ordem dentro do capítulo; nos capítulos, mudam a ordem dos capítulos. Cada clique manda a lista completa para `/api/regras/ordem`.
- Apagar uma regra pede confirmação com `perguntar()` e sugere revogar no lugar ("Revogar em vez disso" e "Apagar de vez").
- Renomear e apagar capítulo pelo lápis do capítulo. Apagar só aparece com o capítulo vazio.
- Erros do servidor aparecem com `avisarFalha()`; sucesso com `avisoRapido()`.

## Visual

O estilo do portal: ferro, fuligem e pergaminho, fontes Grenze Gotisch e Alegreya, as cinzas no fundo (`iniciarCinzas(30)`). A brasa fica só na placa da barra lateral, no botão "+ Regra" e no contador de novidades na barra. O azul arcano não aparece nesta página.

## Prévia

`criarApiDePrevia()` com os mesmos nomes do `apiDoServidor`, guardando tudo na memória. Exemplos de mentira e genéricos: três capítulos com umas oito regras, sendo uma em teste, uma revogada, uma só para Ode to Sleep e duas como novidade. O painel `#simulacao` tem "Ver a página como" (Administrador ou Jogador) e "Restaurar os exemplos", como na Linha do Tempo.

## Fora desta versão

Histórico de versões de uma regra; versão para imprimir.

## Sessões

- **1.1 Servidor:** `servidor/regras.js` com dados, `iniciar()` e todas as rotas acima; registrar em `PAGINAS` no `servidor.js`. Testar as rotas com o servidor rodando e `curl` (veja o CLAUDE.md).
- **1.2 Leitura:** a pasta `publico/regras/` com tudo menos a edição: alto, novidades, sumário, capítulos, regras, filtros, link próprio, celular e a prévia. Inclui listas no `paragrafosDe`.
- **1.3 Edição:** botões e diálogo do administrador, setas de ordem, revogar e apagar, também funcionando na prévia.
- **1.4 Acender:** `pronta: true` para `regras` em `PAGINAS` (`comum.js`). Uma rota leve `GET /api/barra` (em `servidor/mesas.js`) que devolve `{ pendenciasLinha, novidadesRegras }` (`pendenciasLinha` só para o administrador), e no `comum.js` uma função que chama essa rota ao carregar qualquer página (fora da prévia, em silêncio se falhar) e usa `marcarNaBarra("regras", n, "n regras novas")`.
