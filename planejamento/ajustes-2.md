# Ajustes 2: mesas na aba Personagens

Mais um pacote de ajustes, agora só na página Personagens, mais um detalhe no servidor da Linha. Decisões fechadas em 20/10/2026. É uma sessão só, a 5.1 (veja "Sessão" no fim), e vai para o servidor na atualização seguinte à 13.

## 1. A sigla das mesas

Toda mesa ganha uma **sigla**, calculada sozinha a partir do nome. Ninguém digita a sigla, e nada novo é guardado no `dados.json`.

**A regra:** a primeira letra de cada palavra do nome, mantendo maiúscula ou minúscula como está escrita.

- As palavras são separadas por espaços.
- De cada palavra vale o primeiro caractere que for letra ou número (`\p{L}` ou `\p{N}`), pulando parênteses, aspas e outros sinais do começo. Uma palavra sem letra nem número não entra.
- Acentos ficam como estão.

| Nome | Sigla | Nome completo na página |
| --- | --- | --- |
| Ode to Sleep | OtS | Ode to Sleep [OtS] |
| Remissão do Flagelo Esvanescente | RdFE | Remissão do Flagelo Esvanescente [RdFE] |
| Prova dos Ascendentes | PdA | Prova dos Ascendentes [PdA] |
| Primeira mesa (exemplo) | Pme | Primeira mesa (exemplo) [Pme] |

Vale para as campanhas e para as mesas antigas. **Só na página Personagens:** a Linha do Tempo, os Mapas e a página Mesas continuam mostrando só o nome. As duas funções (a sigla e o nome completo) ficam no `personagens.js`.

Onde aparece na página Personagens:

- **Filtros:** cada mesa com o nome completo, "Ode to Sleep [OtS]" (as antigas continuam com o "antiga" ao lado).
- **Abaixo do card na galeria:** só a sigla na etiqueta colorida, "OtS". O nome completo vai no `title` da etiqueta (aparece ao parar o mouse) e no texto para leitores de tela.
- **Ficha aberta:** as etiquetas com o nome completo.
- **Formulário de edição:** a escolha das mesas com o nome completo.
- **Painel de mesas antigas:** cada mesa com o nome completo. Abaixo do campo "Nome da mesa", a sigla aparece enquanto se digita ("Sigla: OtS").

Duas mesas podem acabar com a mesma sigla. A cor e o nome completo no `title` desfazem a dúvida; não é preciso tratar isso.

## 2. Cadastrar mesas antigas pela aba Personagens

As mesas antigas continuam sendo as mesmas da Linha do Tempo (`dados.linha.mesasAntigas`, com `id`, `nome` e `cor`), com as mesmas rotas (`/api/linha/mesas-antigas`). A página Personagens passa a usar essas rotas também. **Só o administrador** cria, altera e apaga, como hoje.

### O botão "Mesas antigas"

- No alto da página, ao lado do "+ Personagem", um botão leve "Mesas antigas", só para o administrador.
- Ele abre um diálogo igual ao painel "Mesas antigas" da Linha do Tempo (`abrirMesasAntigas()` no `linha.js` é o modelo): a lista das antigas com o ponto da cor, "Alterar" e "Apagar", e o formulário "Nova mesa antiga" com nome e cor.
- Em cada mesa, em vez de "Citada em N acontecimentos", vai "N personagens", contando os da galeria que estão nela.
- Apagar pede confirmação: "“<nome>” sai da lista, dos personagens e das citações na Linha do Tempo."
- O diálogo e os estilos do painel são copiados para a página (`index.html` e `personagens.css`); os da Linha estão no `linha.css`. Nada de criar dependência entre as duas páginas.

### "+ Mesa antiga" no formulário do personagem

- No formulário de um **outro personagem** (NPC ou de mesa antiga), dentro da escolha de mesas, um botão leve "+ Mesa antiga", só para o administrador.
- Ele abre ali mesmo, abaixo das mesas, uma linha com nome, cor e "Adicionar" (e "Cancelar"). Com a sigla aparecendo enquanto se digita.
- Ao adicionar, a mesa nova é criada no servidor, entra na lista e **já fica marcada** para o personagem. O resto do formulário não perde nada do que estava preenchido.
- Erros do servidor (nome vazio, cor inválida) aparecem ali, junto da linha.

### Servidor (`servidor/linha.js`)

Duas mudanças pequenas:

- **Criar** (`POST /api/linha/mesas-antigas`) passa a responder `{ mesa: { id } }`, com status 201, para o formulário marcar a mesa nova. Alterar continua respondendo `{ ok: true }`.
- **Apagar** uma mesa antiga também tira o `id` dela das `mesas` dos outros personagens (`dados.outrosPersonagens`), além das citações da Linha que já tira hoje.

### Prévia

A `criarApiDePrevia()` da página ganha `salvarMesaAntiga` e `apagarMesaAntiga`, com as mesmas regras (só o administrador; criar devolve o id; apagar tira a mesa dos personagens).

## Sessão

- **5.1 Mesas na aba Personagens:** as partes 1 e 2 inteiras: a sigla, o botão com o painel, o "+ Mesa antiga" no formulário, as duas mudanças no `servidor/linha.js` e a prévia. Testar as duas rotas com o servidor e `curl` (criar devolve o id; apagar tira a mesa de um NPC).
