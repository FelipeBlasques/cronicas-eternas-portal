/* =================================================================
   Crônicas Eternas: leitura pública de uma nota do Caderno
   -----------------------------------------------------------------
   Abre com o link público de uma nota (/ler/#<token>), mesmo sem
   conta no portal. Só lê: ninguém altera por aqui. Sem a barra
   lateral, a conta e o status do Foundry; no alto, só o nome do
   portal, com o link para ele.

   O servidor decide o que vira link: sem login, os links para
   coisas do portal ficam só como texto; logada, a pessoa vê os
   links que a conta dela vê. Um link para outra nota leva à
   leitura pública dela (se ela também tiver o link ligado) ou, para
   quem pode lê-la, à página do Caderno. Sem "Citada em" e sem a
   busca das etiquetas.

   Fora do servidor (arquivo no PC ou prévia), mostra a nota "Guia
   das marcas" de exemplo, como a vê quem não tem conta.

   Usa o comum.js (pedir(), criar() e o modo prévia) e o
   desenharMarcas() do marcas.js, carregados antes.
   ================================================================= */

/* =================================================================
   Conversa com o servidor
   ================================================================= */

const apiDoServidor = {
  // Em silêncio: aqui, estar sem sessão não manda ninguém para a entrada
  nota: (token) => pedir("GET", caminhoDe("/api/caderno/publico", token), undefined, { silencioso: true }),
};

/* =================================================================
   Prévia: a resposta do servidor para quem lê sem conta
   ================================================================= */

// A imagem do Guia: o mesmo desenho da prévia do Caderno
function desenhoDaPrevia(tracos) {
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="270" viewBox="0 0 480 270"><rect width="480" height="270" fill="#1b1714"/>' +
    `<g fill="none" stroke="#c9ab80" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">${tracos}</g></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

const DESENHO_DA_PONTE =
  '<path d="M40 190Q240 60 440 190M40 190H440"/>' +
  '<path d="M90 190V150M150 190V118M210 190V102M270 190V102M330 190V118M390 190V150"/>' +
  '<path d="M20 225q30-12 60 0t60 0t60 0t60 0t60 0t60 0t60 0" stroke-opacity=".5"/>' +
  '<path d="M50 248q30-12 60 0t60 0t60 0t60 0t60 0t60 0" stroke-opacity=".3"/>';

// O texto do Guia das marcas, o mesmo da prévia do Caderno
const GUIA = String.raw`Este guia mostra as marcas que o caderno entende. Em cada uma, primeiro como se escreve (com uma barra invertida antes da marca, para ela aparecer) e depois o resultado. #guia

# Títulos

Uma, duas ou três cerquilhas e um espaço no começo da linha (\# Título, \#\# Título, \#\#\# Título) fazem os três tamanhos de título. Este guia usa os três.

## Texto

- \*\*negrito\*\* fica **negrito**
- \*itálico\* fica *itálico*
- \~\~riscado\~\~ fica ~~riscado~~
- as marcas se combinam: **negrito com *itálico* dentro**
- a barra invertida antes de uma marca mostra a marca: \\\* fica \*

Dentro de um parágrafo, a quebra de linha fica.
Esta frase está na linha de baixo. Uma linha em branco começa outro parágrafo.

## Listas

Um traço e um espaço no começo da linha (\- item) fazem uma lista. Dois espaços a mais no começo põem um item dentro do outro, até três níveis:

- Leva sempre:
  - corda
  - lanterna
    - óleo para a lanterna
- E nunca esquece o mapa

Um número e um ponto no começo da linha fazem uma lista numerada, que começa no primeiro número:

3. Westna
4. Hando
5. Passo Negro

### Tarefas

Um traço e colchetes (\- \[ \] tarefa ou \- \[x\] feita) fazem uma tarefa com caixinha:

- [x] Comprar corda em Westna
- [ ] Perguntar ao guia sobre o Passo Negro

## Citação

Um sinal de maior (\>) no começo da linha faz uma citação. As linhas seguidas formam uma citação só:

> Aqui dorme quem guardou a ponte.
> Que a cinza lhe seja leve.

## Tabela

As células ficam entre barras verticais. A linha de traços logo abaixo do cabeçalho diz o alinhamento de cada coluna: :\-\-\- à esquerda, :\-\-\-: no centro e \-\-\-: à direita.

| Parada | Dias de viagem | Custo |
| :--- | :---: | ---: |
| [[lugar:mapa-7a1e0c3d/marca-7a1e0000|Westna]] | 2 | 15 po |
| [[lugar:mapa-7a1e0c3d/marca-7a1e0003|Hando]] | 5 | 40 po |

## Separador

Três traços, três asteriscos ou três sublinhados sozinhos na linha fazem um separador:

---

## Etiquetas

Uma cerquilha colada numa palavra (\#pistas) vira etiqueta: #pistas #viagem. Elas também aparecem na lateral, em Etiquetas.

## Links

Um endereço da web solto vira link: https://cronicaseternas.com. Para mostrar outro texto no lugar do endereço, o texto vai entre colchetes e o endereço entre parênteses, logo depois: [o portal do grupo](https://cronicaseternas.com).

Os links para o portal usam o código \[\[tipo:id\|o que aparece\]\], que o botão Link escreve. O que vem depois da barra é o que aparece:

- outra nota: [[nota:nota-5e5500000011|Sessão 1: a ponte]]
- personagem: [[personagem:p1|Venti]]
- acontecimento: [[evento:e10|a morte do guardião da ponte]]
- mesa: [[mesa:ode-to-sleep|Ode to Sleep]]
- memória: [[memoria:mem-0a1b2c3d|a carta deixada na hospedaria]]
- lugar: [[lugar:mapa-7a1e0c3d/marca-7a1e0000|Westna]]

Quem não vê o alvo lê só o texto, sem link. Este personagem só o administrador vê: [[personagem:npc-3d4e5f60|a Voz na Torre]].

## Imagem

O botão Imagem envia a imagem e põe no texto o código !\[\[imagem:id\|legenda\]\]. A legenda aparece embaixo, e clicar abre a imagem inteira:

![[imagem:a1b2c3d4e5f60718293a4b5c|Esboço da ponte de Hando]]

## Nota embutida

O código !\[\[nota:id\|…\]\] sozinho na linha mostra a outra nota inteira, numa moldura:

![[nota:nota-11a900000041|Para a viagem]]`;

// O token do link público de "Para a viagem", o mesmo da prévia do Caderno
const TOKEN_DA_VIAGEM = "Zx3mQ8vYtK2pL7nW4rB9cD1fH6jS0aEu";

function criarApiDePrevia() {
  const diasAtras = (dias, horas = 0) => new Date(Date.now() - dias * 86400000 - horas * 3600000).toISOString();
  const viagem = {
    id: "nota-11a900000041",
    titulo: "Para a viagem",
    texto: "- [ ] Corda nova\n- [x] Óleo para a lanterna\n- [ ] Mapa de Tyrenar",
    alteradaEm: diasAtras(4, 3),
    dono: { nome: "Neia" },
  };
  // Sem login, só a nota embutida com link público vira link (para a leitura pública dela; na
  // prévia, só a âncora, para funcionar com o arquivo aberto no PC). Os outros links ficam texto.
  const guia = {
    nota: {
      id: "nota-9a1a00000001",
      titulo: "Guia das marcas",
      texto: GUIA,
      alteradaEm: diasAtras(6, 3),
      dono: { nome: "Neia" },
    },
    links: { [`nota:${viagem.id}`]: { titulo: viagem.titulo, publico: `#${TOKEN_DA_VIAGEM}` } },
    embutidas: { [viagem.id]: { titulo: viagem.titulo, texto: viagem.texto, dono: { nome: "Neia" } } },
    imagens: { a1b2c3d4e5f60718293a4b5c: desenhoDaPrevia(DESENHO_DA_PONTE) },
  };
  const paraAViagem = { nota: viagem, links: {}, embutidas: {}, imagens: {} };

  return {
    // O link de "Para a viagem" abre ela; qualquer outro (ou nenhum) abre o Guia
    async nota(token) {
      await esperar(150);
      return structuredClone(token === TOKEN_DA_VIAGEM ? paraAViagem : guia);
    },
  };
}

const api = MODO_PREVIA ? criarApiDePrevia() : apiDoServidor;

/* =================================================================
   A nota
   ================================================================= */

const TITULO_DA_PAGINA = document.title;

// "2 de novembro de 2026, 14:30"
const FORMATO_DA_DATA = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "long", year: "numeric" });
const FORMATO_DA_HORA = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" });
function dataEHora(iso) {
  const data = new Date(iso);
  return Number.isNaN(data.getTime()) ? "" : `${FORMATO_DA_DATA.format(data)}, ${FORMATO_DA_HORA.format(data)}`;
}

function tokenDoEndereco() {
  try {
    return decodeURIComponent(location.hash.slice(1));
  } catch {
    return "";
  }
}

function mostrarAviso(mensagem) {
  const aviso = criar("p", "leitura__aviso", mensagem);
  aviso.setAttribute("role", "status");
  $("#leitura").replaceChildren(aviso);
}

// Link desligado, errado ou sem conexão: a mensagem e o caminho para o portal
function mostrarFalha(mensagem) {
  document.title = TITULO_DA_PAGINA;
  const caixa = criar("div", "leitura__falha");
  const aviso = criar("p", "leitura__aviso", mensagem);
  aviso.setAttribute("role", "status");
  const portal = criar("a", "botao botao--leve", "Ir para o portal");
  portal.href = enderecoDaPagina("mesas");
  caixa.append(aviso, portal);
  $("#leitura").replaceChildren(caixa);
}

function mostrarNota({ nota, links, embutidas, imagens }) {
  document.title = nota.titulo;
  const folha = criar("article", "leitura__folha");
  folha.setAttribute("aria-labelledby", "titulo-da-nota");
  const titulo = criar("h1", "leitura__titulo", nota.titulo);
  titulo.id = "titulo-da-nota";
  folha.append(criar("p", "leitura__dono", `Do caderno de ${nota.dono.nome}`), titulo);
  const quando = dataEHora(nota.alteradaEm);
  if (quando) folha.append(criar("p", "leitura__alterada", `Alterada em ${quando}`));

  // Só para ler: as tarefas não se marcam e as etiquetas não buscam
  const texto = criar("div", "marcas leitura__texto");
  if (nota.texto.trim()) texto.append(...desenharMarcas(nota.texto, { links, embutidas, imagens }, { idDaNota: nota.id }));
  else texto.append(criar("p", "leitura__vazia", "Esta nota está vazia."));
  folha.append(texto);

  $("#leitura").replaceChildren(folha);
  window.scrollTo(0, 0);
}

let pedidoAtual = 0; // conta as aberturas, para ignorar a resposta de uma que ficou para trás

async function carregar() {
  const pedido = ++pedidoAtual;
  const token = tokenDoEndereco();
  if (!token && !MODO_PREVIA) return mostrarFalha("Este link não está mais ativo.");
  mostrarAviso("Abrindo a nota…");
  let lida;
  try {
    lida = await api.nota(token);
  } catch (falha) {
    if (pedido === pedidoAtual) mostrarFalha(falha.message);
    return;
  }
  if (pedido === pedidoAtual) mostrarNota(lida);
}

/* =================================================================
   Início
   ================================================================= */

iniciarCinzas(30);
// Um link para a leitura pública de outra nota só troca o que vem depois do #
window.addEventListener("hashchange", carregar);
carregar();
