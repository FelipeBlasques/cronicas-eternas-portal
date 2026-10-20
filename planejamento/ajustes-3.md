# Ajustes 3: uma lista só de mesas e editores nos personagens

Decisões fechadas em 20/10/2026. Três sessões (veja "Sessões" no fim), e vai para o servidor numa atualização só, depois das três juntas na `main`: entre a 6.1 e a 6.3 as páginas ficam usando rotas que mudaram.

Este pacote **substitui** o que `ajustes-2.md` dizia sobre "mesas antigas". A sigla das mesas (parte 1 de `ajustes-2.md`) continua igual, só na página Personagens.

## 1. Uma lista só de mesas

Não existem mais "campanhas" e "mesas antigas". Existem **mesas**. Toda mesa tem nome e cor. Uma mesa **pode** ter mundo do Foundry, login do mestre, capa, logo, arte e personagens do portal (com dono e login), mas nada disso é obrigatório. Assim dá para ter uma mesa de agora que não acontece no Foundry, sem chamá-la de antiga.

E cada mesa tem uma marca nova: **aparece ou não na página Mesas**.

### Dados

- A lista de todas as mesas é `dados.campanhas` (o nome no código fica, para não mexer no que já funciona).
- Campo novo em cada mesa: `naPaginaMesas` (`true` ou `false`).
- `dados.linha.mesasAntigas` deixa de existir.

### Migração (uma vez, ao ligar)

No `iniciar()` do `servidor/linha.js`, que roda primeiro e é quem conhece as mesas antigas:

- Cada mesa de `dados.linha.mesasAntigas` vira uma mesa em `dados.campanhas`, **com o mesmo `id`** (as citações na Linha, nos NPCs e nos mapas continuam valendo), o mesmo nome e a mesma cor, `naPaginaMesas: false`, `mundo: ""`, `mestreUsuario: ""`, `mestreSenha: null` e as imagens `null`. Depois, a chave `mesasAntigas` sai de `dados.linha`.
- Toda mesa que ainda não tem a chave `naPaginaMesas` ganha `true` (as campanhas de hoje continuam na página Mesas).
- Devolve `true` quando mudou alguma coisa, como os outros `iniciar()`.

### Quem usa a lista

- Tudo o que hoje junta `dados.campanhas` com `mesasAntigas` (Linha, Personagens) passa a usar só `dados.campanhas`. A marca `antiga` some das respostas.
- Mapas e Regras já usam `dados.campanhas`, então passam a mostrar também as mesas fora do Foundry, sem mudar nada.
- A regra da Linha de mostrar ao jogador só as mesas com personagens ou citadas continua igual.
- `campanhaPublica()` (em `base.js`) passa a mandar `naPaginaMesas`.

### Rotas

Rotas novas, só do administrador, em `servidor/admin.js`, para mudar uma mesa só pelo nome e pela cor (são as que os painéis da Linha e dos Personagens usam):

| Rota | O que faz |
| --- | --- |
| `POST /api/admin/mesas` | JSON `{ nome, cor }`. Cria uma mesa com `naPaginaMesas: false` e o resto vazio. O `id` sai do nome, como nas campanhas (`criarId`). Responde 201 com `{ mesa: { id } }`. Limite: 300 mesas no total |
| `PUT /api/admin/mesas/:id` | JSON com `nome`, `cor` e `naPaginaMesas`, todos opcionais: muda só o que vier (com a mesma validação de hoje). Responde `{ ok: true }` |
| `DELETE /api/admin/mesas/:id` | Apaga a mesa (veja abaixo) |

- As rotas `/api/linha/mesas-antigas` saem.
- O formulário completo de Administração (`/api/admin/campanhas`) ganha a caixa `na_pagina` ("1" marcada): é o `naPaginaMesas`. Uma mesa nova por ali nasce com a caixa marcada.
- **Apagar uma mesa**, pelas duas rotas (`DELETE /api/admin/campanhas/:id` e `DELETE /api/admin/mesas/:id`), faz a mesma coisa:
  - recusa com 409 se a mesa tem personagens do portal, como hoje ("Essa mesa ainda tem personagens. Exclua os personagens ou mova para outra mesa antes.");
  - apaga as imagens dela;
  - tira o `id` dela de **todo lugar que a cita**: acontecimentos e pedidos da Linha, outros personagens, mapas e regras. Para isso, um gancho novo em `base.js`, `ganchos.excluirMesa`, como os de contas. Cada módulo se inscreve e limpa o que é dele.

### Página Mesas (`GET /api/portal`, em `servidor/mesas.js`)

Só entram as mesas com `naPaginaMesas: true`, para todo mundo, inclusive o administrador. As outras regras continuam (o jogador vê as que têm personagens). Os personagens de uma mesa fora da página também não aparecem ali, mas continuam na galeria Personagens.

## 2. As páginas

### Página Mesas e Administração (`script.js`)

- **"Tirar da página":** no alto de cada mesa, junto de "Entrar no mundo" e "Entrar como Mestre", um botão leve "Tirar da página", só para o administrador.
  - Confirmação com `perguntar()`: "“<nome>” sai da página Mesas, com os cards dos personagens. Continua na Linha do Tempo, nos Personagens, nos Mapas e nas Regras. Para trazer de volta, marque “Aparece na página Mesas” em Administração, na aba Mesas."
  - Ao confirmar, chama `PUT /api/admin/mesas/:id` com `{ naPaginaMesas: false }` e recarrega a página.
- **Administração:** a aba "Campanhas" passa a se chamar **"Mesas"**.
  - Botão "Nova mesa".
  - Texto da aba: "Todas as mesas do portal. As que acontecem no Foundry ficam ligadas a um mundo; é ele que abre quando alguém clica num personagem dela."
  - Na lista, cada mesa diz se está na página Mesas ou não. O aviso "Ainda não está ligada a um mundo do Foundry" só aparece para as que estão na página.
  - O formulário ganha a caixa **"Aparece na página Mesas"** e passa a dizer "mesa" onde dizia "campanha" (título, nome, mensagens de salvo e excluído).
  - Na aba Personagens, o campo "Campanha" vira "Mesa" e lista todas as mesas.
- A prévia da página acompanha.

### Linha do Tempo (`linha.js`)

- Sai o "antiga" das etiquetas, dos filtros e do formulário, e sai a ordem "atuais primeiro, antigas depois": as mesas vêm na ordem da lista.
- O botão e o painel "Mesas antigas" viram **"Mesas"**:
  - a lista mostra **todas** as mesas, com a cor, o nome e "Citada em N acontecimentos"; as que estão na página Mesas levam também "na página Mesas";
  - texto do painel: "Todas as mesas do portal. Aqui mudam só o nome e a cor. Mundo do Foundry, imagens e a página Mesas ficam em Administração, na aba Mesas.";
  - o formulário "Nova mesa" cria pela rota nova;
  - apagar mostra a confirmação de hoje; se o servidor recusar (mesa com personagens do portal), a mensagem dele aparece.
- A prévia acompanha.

### Personagens (`personagens.js`)

- Sai o "antiga" dos filtros e da escolha de mesas, e a ordem passa a ser a da lista. A sigla continua igual.
- O botão e o painel "Mesas antigas" viram **"Mesas"**, como na Linha (contando "N personagens" em vez de acontecimentos).
- O "+ Mesa antiga" do formulário vira **"+ Mesa"**, com o mesmo comportamento.
- As chamadas usam as rotas novas (`/api/admin/mesas`).
- A prévia acompanha.

## 3. Editores alteram qualquer personagem

Hoje o editor altera só os NPCs que ele mesmo cadastrou. Passa a alterar **qualquer personagem que ele vê** na galeria, como o administrador, com duas exceções que continuam só do administrador: **escolher quem vê** e **apagar**.

| Ação | Administrador | Editor | Jogador |
| --- | --- | --- | --- |
| Cadastrar outros personagens | Sim | Sim | Não |
| Alterar outros personagens | Qualquer um | **Qualquer um que ele vê** | Não |
| Ficha dos personagens do portal (textos, arte, situação e queda) | Qualquer um | **Qualquer um** | Só textos e arte do próprio |
| Apagar outros personagens | Sim | Não | Não |
| Escolher "só o administrador" | Sim | Não | Não |

- Servidor (`servidor/personagens.js`): `podeEditarFicha` e `podeEditarOutro` passam a aceitar o editor; em `salvarFicha`, situação e queda valem para o administrador e o editor.
- Página: o grupo de situação aparece também para o editor nos personagens do portal. A prévia segue as regras novas.
- O texto do cargo (`ROTULO_EDITOR`, em `script.js`) passa a ser: "Editor (registra e altera acontecimentos na Linha do Tempo, cadastra e altera personagens e marca lugares nos mapas; apagar acontecimentos passa pela sua aprovação)".

## Sessões

- **6.1 Servidor:** as partes 1 (dados, migração, rotas, gancho `excluirMesa`, `/api/portal`) e 3 (só o servidor). Testar com o servidor e `curl`, incluindo a migração a partir de um `dados.json` com mesas antigas citadas na Linha, num NPC e num mapa.
- **6.2 Página Mesas e Administração:** a parte 2, "Página Mesas e Administração", e o `ROTULO_EDITOR`.
- **6.3 Linha do Tempo e Personagens:** a parte 2, "Linha do Tempo" e "Personagens", e a parte 3 na página Personagens.
