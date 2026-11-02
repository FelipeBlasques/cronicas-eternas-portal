# Personagens: a ficha com abas

A ficha aberta de um personagem ganha **quatro abas**, como marcadores de livro presos ao lado direito do quadro: **Geral**, **Detalhes**, **Jornada** e **Textos**. A segunda é uma ficha completa, no estilo das enciclopédias de cenário; a quarta guarda caixas de texto livre. Decisões fechadas em 02/11/2026. Três sessões: 9.1 servidor, 9.2 a ficha com abas e 9.3 o formulário (veja "Sessões" no fim). Vai para o servidor numa atualização só, depois das três juntas na `main`: entre a 9.1 e a 9.3 a página fica usando campos que mudaram.

O resto da página continua como em `personagens.md`, `ajustes-1.md`, `ajustes-2.md` e `ajustes-3.md`.

## 1. As quatro abas

| Aba | O que mostra |
| --- | --- |
| **Geral** | o papel ("Personagem de jogador" ou "NPC"), o nome, o jogador (só personagem de jogador), as mesas, a situação (nos caídos, com o epitáfio embaixo, em itálico) e o **Título ou Frase** escolhido. Nada mais: a ancestralidade, o resumo, a história e a "Na Linha do Tempo" saem daqui |
| **Detalhes** | a ficha completa, na ordem da tabela da parte 2, só com o que estiver preenchido |
| **Jornada** | a lista que hoje é a "Na Linha do Tempo", igual: os acontecimentos que citam o personagem, do mais antigo ao mais recente, com link para a Linha |
| **Textos** | as caixas de texto livre, cada uma com um título e um texto (ex.: "Descrição", "Personalidade", "História") |

- O retrato continua à esquerda, parado, em todas as abas. "Copiar link" e "Fechar" continuam no pé, em todas as abas.
- A ficha abre sempre na aba **Geral**.
- Uma aba sem nada (Detalhes só com o nome, Jornada sem acontecimentos, Textos sem caixas) **não aparece**. Se sobrar só a Geral, não aparece aba nenhuma.

## 2. Os dados

### Detalhes

Um objeto novo, `detalhes`, em cada personagem do portal (`dados.personagens`) e em cada outro personagem (`dados.outrosPersonagens`). Na aba Detalhes, as linhas aparecem **nesta ordem**, com estes rótulos:

| Rótulo | Chave | Tipo |
| --- | --- | --- |
| Nome | (o `nome` de sempre) | sempre aparece |
| Títulos | `titulos` | lista |
| Apelidos | `apelidos` | lista |
| Nome Real | `nomeReal` | texto |
| Lar | `lar` | texto |
| Lares Anteriores | `laresAnteriores` | lista |
| Gênero | `genero` | texto |
| Espécie | `especie` | texto |
| Ocupação | `ocupacao` | texto |
| Idade | `idade` | texto (livre: "32 anos", "c. 300") |
| Religião | `religiao` | texto |
| Linguagem | `linguagens` | lista |
| Nascimento | `nascimento` | marco |
| Transformado | `transformado` | marco |
| Morte | `morte` | marco (veja "A morte e a queda") |
| Destruído | `destruido` | marco |
| Pais | `pais` | lista |
| Irmãos | `irmaos` | lista |
| Filhos | `filhos` | lista |
| Parentes | `parentes` | lista |
| Começo da Regência | `regenciaInicio` | data |
| Término da Regência | `regenciaFim` | data |
| Predecessor | `predecessor` | texto |
| Sucessor | `sucessor` | texto |
| Alinhamento | `alinhamento` | texto (o formulário sugere os nove: Leal e Bom, Neutro e Bom, Caótico e Bom, Leal e Neutro, Neutro, Caótico e Neutro, Leal e Mau, Neutro e Mau, Caótico e Mau) |
| Nível de Desafio / Nível | `nivel` | texto |
| Classe | `classe` | texto |
| Frases | `frases` | lista |

Os tipos:

- **texto:** até 120 caracteres, numa linha. Vazio é `""`.
- **lista:** até 20 itens. Cada item tem até 160 caracteres (as frases, até 300) e fica numa linha. Itens vazios saem.
- **data:** no Ciclo de Sylara, no formato e com as regras da Linha do Tempo (`{ ano, mes, dia, aprox }`, só o ano obrigatório, de 0 ao ano atual). Use `lerDataDaLinha` e `dataPublica`. Vazio é `null`.
- **marco:** `{ data, onde }`, com `data` como acima e `onde` com até 80 caracteres (ex.: "Westna"). Precisa de pelo menos um dos dois. Vazio é `null`.

Os textos e os itens de lista podem ter links (veja a parte 4).

**Como aparece na aba:** como a lista da aba Geral (o rótulo pequeno em versalete à esquerda e o valor à direita). Cada item de lista fica numa linha. As frases aparecem entre aspas curvas, em itálico. O marco aparece como "12 de Solcanis de 312 ED · Westna" (a data por extenso, `textoDaData`, e o onde). Se só um dos dois estiver preenchido, aparece só ele.

### O Título ou Frase (aba Geral)

Campo novo, `destaque`: `{ tipo: "titulo" ou "frase", indice }` ou `null`. Ele aponta para um item de `detalhes.titulos` ou de `detalhes.frases`. O servidor confere o índice; fora da lista, vira `null`.

O destaque aparece em dois lugares:

- **na aba Geral**, abaixo da situação: o título em itálico, ou a frase entre aspas curvas, em itálico;
- **embaixo do card na galeria**, no lugar onde hoje fica o resumo, do mesmo jeito.

### Textos

Campo novo, `textos`: até 20 caixas `{ titulo, texto }`. O título é obrigatório, com até 80 caracteres. O texto tem até 20.000, com a formatação de sempre (negrito, itálico, parágrafos e listas) e links.

### A morte e a queda

A data da queda do card passa a ser a **Morte** dos Detalhes: um campo só, `detalhes.morte`. A `queda` fica só com o epitáfio (`queda: { epitafio }` ou `null`). Nos caídos, o "Caiu em …" do card usa `detalhes.morte.data`. A Morte também pode existir em quem não está caído, como um morto que voltou, e aí aparece só na aba Detalhes.

### O que sai

`origem` (ancestralidade e classe), `resumo` e `historia` deixam de existir. Os dados que já estão neles vão para os campos novos na migração.

### Limites do envio

Com as caixas de texto, o campo `dados` do formulário passa dos 64 KB. Em `lerFormularioDaFicha`, o JSON do campo `dados` pode ter até **1 MB**, e o formulário inteiro até `CONFIG.maxImagem` + 1 MB.

## 3. Migração (no `iniciar()` de `servidor/personagens.js`, uma vez só)

Para cada personagem, do portal e outro, que ainda não tem a chave `detalhes`:

1. Cria `detalhes` com tudo vazio, `destaque: null` e `textos: []`.
2. **Ancestralidade e classe → Espécie e Classe:** separa a `origem` na primeira vírgula: "Elfo, mago 7" vira Espécie "Elfo" e Classe "mago 7", sem os espaços das pontas. Sem vírgula, tudo vai para a Espécie.
3. **Resumo → Título:** o `resumo`, se houver, vira o primeiro item de `detalhes.titulos`, e o `destaque` aponta para ele (`{ tipo: "titulo", indice: 0 }`).
4. **História → Textos:** a `historia`, se houver, vira a caixa `{ titulo: "História", texto: historia }`.
5. **Queda → Morte:** a `queda.data`, se houver, vira `detalhes.morte = { data, onde: "" }`. A `queda` fica só com o epitáfio (sem epitáfio, `null`).
6. As chaves `origem`, `resumo` e `historia` saem.

Devolve `true` quando mudou alguma coisa, como sempre.

## 4. Links

Os textos dos Detalhes, os itens das listas e os textos das caixas podem ter os mesmos links das Memórias: `[[personagem:<id>|o que aparece]]` e `[[evento:<id>|o que aparece]]`. Assim "Pais: [[personagem:npc-1a2b3c4d|Ysolde]]" vira um link para a ficha da Ysolde.

- **O servidor resolve os links** do personagem pedido para quem está lendo. Os alvos que a conta não vê (NPC oculto, acontecimento selado ou só do administrador) e os apagados ficam **só como texto**, sem link. Para isso, exporte do `servidor/memorias.js` a função que já faz isso (`linksPara`) e use-a no `servidor/personagens.js`.
- **Link de personagem:** abre a ficha dele ali mesmo, no mesmo diálogo, na aba Geral, sem recarregar a página.
- **Link de acontecimento:** leva à Linha do Tempo, como nas Memórias.
- O texto nunca vira HTML. Monte os links com `criar()`, como em `memorias.js` (`mencaoNoTexto` e `textoDaFolha` são o modelo). Essas funções podem ser copiadas para o `personagens.js`, que não carrega o `memorias.js`.

## 5. Quem muda o quê

| O quê | Administrador | Editor | Dono (personagem do portal) | Jogador |
| --- | --- | --- | --- | --- |
| Detalhes (menos a Morte), Título ou Frase, Textos e arte | qualquer personagem | qualquer um que ele vê | o próprio | não |
| Situação, epitáfio e Morte | qualquer personagem | qualquer um que ele vê | não | não |
| Nome, fonte, papel, jogador e mesas (só outros personagens) | sim | sim | não | não |
| Escolher quem vê e apagar (só outros personagens) | sim | não | não | não |

Para o dono, a Morte vem do servidor como está e não muda; um valor dela no envio do dono é ignorado.

## 6. Rotas (`/api/galeria`)

| Rota | O que muda |
| --- | --- |
| `GET /api/galeria` | A lista fica **leve**: cada personagem perde `origem`, `resumo` e `historia` e ganha `destaque` já resolvido (`{ tipo, texto }` ou `null`) e `apelidos` (para a busca). Continua com `queda`, agora como `{ data, epitafio }`, com a data tirada de `detalhes.morte` (o card não muda). A `jornada` sai daqui |
| `GET /api/galeria/ficha/:id` | **Nova.** Vale para qualquer personagem, do portal ou outro. Para quem vê o personagem: `{ personagem: { id, detalhes, destaque, textos }, jornada, links }`. A `jornada` é a lista que hoje vem no `GET /api/galeria`, só deste personagem, e `links` traz os alvos que a conta vê. Para quem pode editar o personagem, vem também `citaveis: { acontecimentos: [{ id, titulo, ano }], personagens: [{ id, nome }] }`, só com o que a conta vê. Personagem que a conta não vê: 404 |
| `PUT /api/galeria/ficha/:id` e `POST`/`PUT /api/galeria/outros` | Aceitam `detalhes`, `destaque` e `textos` no JSON `dados`, e não aceitam mais `origem`, `resumo` e `historia`. Cada um muda só o que a tabela da parte 5 deixa |

Mensagens de erro com o nome do campo, como nas outras páginas (ex.: "O campo Apelidos pode ter no máximo 20 itens.").

## 7. A página Personagens

### A ficha com abas (sessão 9.2)

- **As abas:** ficam **fora do quadro**, presas à borda direita do diálogo, uma embaixo da outra a partir do alto, como marcadores de livro saindo das páginas. Cada uma tem a palavra (Geral, Detalhes, Jornada, Textos) em Alegreya pequena. A aba ativa tem o fundo do quadro, como se continuasse a página, e um filete de brasa na ponta; as outras são mais escuras (fuligem e ferro).
- **Acessibilidade:** `role="tablist"` com `aria-orientation="vertical"`, `role="tab"`, `aria-selected` e `aria-controls`, e um `role="tabpanel"` para o conteúdo. As setas para cima e para baixo trocam de aba, e Home e End vão para a primeira e a última.
- **Altura:** o diálogo tem altura fixa (`min(42rem, 100dvh - 2rem)`) e só a coluna da direita rola. Assim o quadro não pula de tamanho ao trocar de aba, e as abas ficam paradas. Trocar de aba volta a rolagem do conteúdo ao alto.
- **Carregamento:** a aba Geral sai na hora, com os dados da lista. Ao abrir a ficha, a página pede `GET /api/galeria/ficha/:id`. Enquanto a resposta não chega, as outras abas aparecem apagadas. Se ela falhar, a Geral continua e um `avisoRapido` explica.
- **Celular (até 760 px):** as abas viram uma fileira na horizontal no alto da coluna de texto, presa no alto ao rolar.
- **O link da ficha** continua `#personagem-<id>` e abre na aba Geral.

### A galeria

- **Embaixo do card:** o Título ou Frase escolhido, no lugar do resumo.
- **A busca:** procura no nome, nos apelidos e no Título ou Frase.

### O formulário (sessão 9.3)

O mesmo diálogo de hoje, organizado em **três abas no alto**: **Geral**, **Detalhes** e **Textos**. "Salvar" salva tudo. Se um erro for de um campo de outra aba, o formulário vai para essa aba e põe o foco no campo.

- **Geral:** nome e fonte, papel, jogador e mesas (só outros personagens; nos do portal, o aviso de hoje de que nome e fonte mudam nas Mesas); situação e, nos caídos, epitáfio; **Título ou Frase**; arte; visibilidade.
  - **Título ou Frase** é uma lista de escolha: "Nenhum", cada título ("Título: …") e cada frase ("Frase: …") escritos na aba Detalhes. Ela se atualiza enquanto se escreve lá. Se o item escolhido sumir, volta para "Nenhum".
  - Saem os campos Ancestralidade e classe, Resumo e História.
- **Detalhes:** os campos da parte 2, em grupos com um título pequeno, para não virar uma coluna sem fim:
  - **Nomes:** Títulos, Apelidos, Nome Real.
  - **Origem:** Espécie, Gênero, Idade, Lar, Lares Anteriores, Linguagem, Religião.
  - **Vida:** Nascimento, Transformado, Morte, Destruído.
  - **Família:** Pais, Irmãos, Filhos, Parentes.
  - **Regência:** Começo, Término, Predecessor, Sucessor.
  - **Jogo:** Ocupação, Classe, Nível de Desafio / Nível, Alinhamento (com as sugestões num `<datalist>`).
  - **Frases.**

  Como cada tipo aparece:
  - **Listas:** uma área de texto com a ajuda "Um por linha". Cada linha é um item.
  - **Datas:** ano, mês e dia em campos simples, mais "aproximada", como a queda de hoje; nos marcos, também o "Onde".
  - **Morte:** para o dono, aparece só para ler.
- **Textos:** a lista de caixas, cada uma com título e texto. Tem "+ Caixa", "Remover" e as setas para subir e descer. Uma caixa nova vem com o título vazio e a dica "Ex.: Descrição, Personalidade, História". Uma caixa toda vazia é ignorada ao salvar; com texto e sem título, dá erro.
- **"Citar":** um botão nas abas Detalhes e Textos que abre a mesma busca das Memórias (acontecimentos e personagens, de `citaveis`) e põe o link no **último campo de texto que estava com o foco**, onde estava o cursor.

### Prévia

`criarApiDePrevia()` com a rota nova e as mesmas regras. Os exemplos passam para o formato novo:

- um NPC bem completo: vários campos dos Detalhes, uma frase como destaque, pais e filhos com links para outros personagens (um deles oculto, para mostrar o texto sem link) e duas caixas de texto;
- um personagem de jogador com título como destaque;
- um caído com Morte e epitáfio;
- os outros com poucos campos.

## Fora desta versão

Datas antes do ano 0 ED; o Título ou Frase na aba da Linha do Tempo; link de lugar dos Mapas no Lar; o link da ficha abrir direto numa aba.

## Sessões

- **9.1 Servidor:** as partes 2 a 6 no `servidor/personagens.js`: dados, migração, rotas, links (com o `linksPara` exportado do `servidor/memorias.js`), permissões e limites. Testar com o servidor e `curl`, incluindo a migração a partir de um `dados.json` com `origem` (com e sem vírgula), `resumo`, `historia` e `queda` com data e epitáfio, nos dois grupos de personagens.
- **9.2 A ficha com abas:** a parte 7, "A ficha com abas" e "A galeria", e a prévia com os exemplos novos. Use o modo de planejamento.
- **9.3 O formulário:** a parte 7, "O formulário", e as regras da parte 5 na página e na prévia.
