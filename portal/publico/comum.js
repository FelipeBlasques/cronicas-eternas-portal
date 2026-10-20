/* =================================================================
   Crônicas Eternas: código comum das páginas
   -----------------------------------------------------------------
   Carregado antes do script de cada página, que diz quem é e onde
   fica a raiz do site:

     <body data-pagina="linha" data-raiz="../">
     <script src="../comum.js" defer></script>
     <script src="linha.js" defer></script>

   Tudo o que está aqui fica disponível para o script da página.
   Por isso nenhum nome daqui pode ser declarado de novo lá.

   Tem: as páginas do grupo e a barra lateral, a conversa com o
   servidor, utilidades de tela, diálogos e avisos, o status do
   Foundry no cabeçalho, texto formatado, as fontes e o card com
   moldura dos personagens, e as cinzas do fundo.
   ================================================================= */

// Fora do servidor (arquivo no PC ou outro endereço), as páginas rodam em prévia, com dados de exemplo
const MODO_PREVIA =
  !/(^|\.)cronicaseternas\.com$/.test(location.hostname) &&
  !["localhost", "127.0.0.1"].includes(location.hostname);

// Aberta como arquivo no PC, uma pasta não abre sozinha o index.html
const COMO_ARQUIVO = location.protocol === "file:";

const PAGINA_ATUAL = document.body.dataset.pagina || "";
const RAIZ = document.body.dataset.raiz || "./";

/* =================================================================
   As páginas do grupo
   -----------------------------------------------------------------
   A barra lateral sai desta lista. Para acender uma página nova,
   crie a pasta dela em publico/ e mude "pronta" para true.
   Os ícones são traços de 24 × 24, desenhados só com contorno.
   ================================================================= */

const PAGINAS = [
  {
    id: "mesas",
    nome: "Mesas",
    curto: "Mesas",
    caminho: "",
    pronta: true,
    icone: "M4.5 21V10.5a7.5 7.5 0 0 1 15 0V21M2.5 21h19M9 21v-5.5a3 3 0 0 1 6 0V21M12 3v2", // portão em arco
  },
  {
    id: "linha",
    nome: "Linha do Tempo",
    curto: "Linha",
    caminho: "linha-do-tempo/",
    pronta: true,
    icone: "M6 2.5h12M6 21.5h12M7.5 2.5c0 5 9 6.2 9 9.5s-9 4.5-9 9.5M16.5 2.5c0 5-9 6.2-9 9.5s9 4.5 9 9.5M10 19h4M11 8.5h2", // ampulheta
  },
  {
    id: "personagens",
    nome: "Personagens",
    curto: "Personagens",
    caminho: "personagens/",
    pronta: false,
    icone: "M5 20.5v-7a7 7 0 0 1 14 0v7ZM12 6.5v14M7.5 13.5h3M13.5 13.5h3M3.5 20.5h17M12 3v3.5", // elmo
  },
  {
    id: "mapas",
    nome: "Mapas",
    curto: "Mapas",
    caminho: "mapas/",
    pronta: false,
    icone: "M12 2l2.3 7.7L22 12l-7.7 2.3L12 22l-2.3-7.7L2 12l7.7-2.3ZM14.2 12a2.2 2.2 0 1 1-4.4 0a2.2 2.2 0 1 1 4.4 0Z", // rosa dos ventos
  },
  {
    id: "regras",
    nome: "Regras da casa",
    curto: "Regras",
    caminho: "regras/",
    pronta: true,
    icone: "M6.5 2.5h11a1.5 1.5 0 0 1 1.5 1.5v15.5H6.5a2 2 0 0 0 0 4H19M6.5 2.5A2 2 0 0 0 4.5 4.5v17M9.5 7h6M9.5 10.5h4", // livro fechado
  },
];

// O endereço de uma página do grupo, visto da página atual
function enderecoDaPagina(id) {
  const pagina = PAGINAS.find((p) => p.id === id);
  const caminho = !pagina || pagina.id === PAGINA_ATUAL ? "./" : `${RAIZ}${pagina.caminho}`;
  return COMO_ARQUIVO ? `${caminho}index.html` : caminho;
}

// Sem sessão, a página Mesas pede o login. Com "voltar", ela traz a pessoa de volta
// para esta página depois de entrar, no mesmo ponto do link.
function irParaEntrada({ voltar = false } = {}) {
  if (MODO_PREVIA) return;
  const destino = voltar ? `?voltar=${encodeURIComponent(location.pathname + location.hash)}` : "";
  location.href = `${RAIZ}${destino}`;
}

/* =================================================================
   Barra lateral
   ================================================================= */

function desenhoDaBarra(caminhoSvg) {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  const traco = document.createElementNS(ns, "path");
  traco.setAttribute("d", caminhoSvg);
  svg.append(traco);
  return svg;
}

function botaoDaBarra(pagina) {
  const botao = criar(pagina.pronta ? "a" : "span", "barra-lateral__botao");
  botao.id = `barra-${pagina.id}`;
  botao.dataset.curto = pagina.curto;
  const rotulo = criar("span", "barra-lateral__rotulo", pagina.nome);
  botao.append(desenhoDaBarra(pagina.icone), rotulo);

  if (pagina.pronta) {
    botao.href = enderecoDaPagina(pagina.id);
    if (pagina.id === PAGINA_ATUAL) botao.setAttribute("aria-current", "page");
    // Um número aceso na placa e a explicação dele no rótulo (veja marcarNaBarra)
    const detalhe = criar("small");
    detalhe.id = `rotulo-${pagina.id}`;
    detalhe.hidden = true;
    rotulo.append(" ", detalhe);
    const contador = criar("span", "barra-lateral__contador");
    contador.id = `contador-${pagina.id}`;
    contador.setAttribute("aria-hidden", "true");
    contador.hidden = true;
    botao.append(contador);
    return botao;
  }

  // As páginas que ainda não existem aparecem apagadas e só avisam
  botao.classList.add("barra-lateral__botao--em-breve");
  botao.setAttribute("role", "link");
  botao.setAttribute("aria-disabled", "true");
  botao.tabIndex = 0;
  rotulo.append(" ", criar("small", null, "Em breve"));
  const avisar = () => avisoRapido(`${pagina.nome}: em breve.`);
  botao.addEventListener("click", avisar);
  botao.addEventListener("keydown", (evento) => {
    if (evento.key === "Enter" || evento.key === " ") {
      evento.preventDefault();
      avisar();
    }
  });
  return botao;
}

function montarBarraLateral() {
  const barra = document.querySelector(".barra-lateral");
  if (barra) barra.replaceChildren(...PAGINAS.map(botaoDaBarra));
}

// Acende um número na placa de uma página, com a explicação no rótulo
// (ex.: os pedidos dos editores esperando o administrador na Linha do Tempo)
function marcarNaBarra(id, quantas, explicacao = "") {
  const contador = document.getElementById(`contador-${id}`);
  const detalhe = document.getElementById(`rotulo-${id}`);
  if (contador) {
    contador.hidden = !quantas;
    contador.textContent = String(quantas);
  }
  if (detalhe) {
    detalhe.hidden = !quantas;
    detalhe.textContent = explicacao;
  }
}

// Os números da barra em qualquer página: as regras da casa novas ou alteradas desde a
// última visita e, para o administrador, os pedidos dos editores na Linha do Tempo.
// Fora da prévia e em silêncio: sem sessão ou sem conexão, a barra só fica sem números.
async function atualizarBarra() {
  if (MODO_PREVIA) return;
  let barra;
  try {
    barra = await pedir("GET", "/api/barra", undefined, { silencioso: true });
  } catch {
    return;
  }
  if (barra.pendenciasLinha !== undefined) {
    const quantas = barra.pendenciasLinha;
    marcarNaBarra("linha", quantas, quantas === 1 ? "1 pedido para aprovar" : `${quantas} pedidos para aprovar`);
  }
  const novas = barra.novidadesRegras ?? 0;
  marcarNaBarra("regras", novas, novas === 1 ? "1 regra nova" : `${novas} regras novas`);
}

/* =================================================================
   Conversa com o servidor
   -----------------------------------------------------------------
   Cada página monta o próprio "apiDoServidor" com pedir() e, na
   prévia, troca por uma API de mentira com os mesmos nomes.
   ================================================================= */

function erroComCodigo(mensagem, codigo, extra) {
  const erro = new Error(mensagem);
  erro.codigo = codigo;
  erro.extra = extra;
  return erro;
}

let aoPerderSessao = () => irParaEntrada({ voltar: true });

// A página Mesas troca isso: lá, perder a sessão mostra a tela de entrada na hora
function quandoPerderSessao(funcao) {
  aoPerderSessao = funcao;
}

async function pedir(metodo, caminho, corpo, { silencioso = false } = {}) {
  const opcoes = { method: metodo, headers: { Accept: "application/json" }, credentials: "same-origin" };
  if (corpo instanceof FormData) {
    opcoes.body = corpo;
  } else if (corpo !== undefined) {
    opcoes.headers["Content-Type"] = "application/json";
    opcoes.body = JSON.stringify(corpo);
  }

  let resposta;
  try {
    resposta = await fetch(caminho, opcoes);
  } catch {
    throw erroComCodigo("Sem conexão com o portal. Confira sua internet e tente de novo.", "rede");
  }

  const dados = await resposta.json().catch(() => null);
  if (!resposta.ok) {
    if (dados?.codigo === "sem-sessao" && !silencioso) aoPerderSessao();
    throw erroComCodigo(
      dados?.erro || "O portal não respondeu como esperado. Tente de novo em instantes.",
      dados?.codigo,
      dados,
    );
  }
  return dados;
}

const caminhoDe = (base, id) => (id ? `${base}/${encodeURIComponent(id)}` : base);

/* =================================================================
   Utilidades de tela
   ================================================================= */

const $ = (seletor) => document.querySelector(seletor);
const esperar = (ms) => new Promise((resolver) => setTimeout(resolver, ms));

// Sem acentos e em minúsculas, para buscas
const normalizar = (texto) =>
  String(texto || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

function criar(tag, classe, texto) {
  const elemento = document.createElement(tag);
  if (classe) elemento.className = classe;
  if (texto !== undefined && texto !== null && texto !== "") elemento.textContent = texto;
  return elemento;
}

function botao(texto, classe, aoClicar) {
  const elemento = criar("button", `botao ${classe}`, texto);
  elemento.type = "button";
  elemento.addEventListener("click", aoClicar);
  return elemento;
}

function imagem(src, classe, alt = "") {
  const img = criar("img", classe);
  img.alt = alt;
  img.decoding = "async";
  img.src = src;
  return img;
}

// Um desenho da página (<symbol id="...">) usado num botão ou card
function simbolo(id, classe) {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("aria-hidden", "true");
  if (classe) svg.setAttribute("class", classe);
  const uso = document.createElementNS(ns, "use");
  uso.setAttribute("href", `#${id}`);
  svg.append(uso);
  return svg;
}

// As cores das campanhas são escuras; nas etiquetas, ficam um pouco mais claras para aparecer
function corVisivel(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
  if (!m) return "#a8987f";
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h /= 6;
  }
  const s2 = Math.min(Math.max(s, 0.25), 0.62);
  const l2 = Math.max(l, 0.6);
  return `hsl(${Math.round(h * 360)} ${Math.round(s2 * 100)}% ${Math.round(l2 * 100)}%)`;
}

/* =================================================================
   Texto formatado: **negrito**, *itálico*, parágrafos e listas
   ================================================================= */

// **negrito**, *itálico* e quebras de linha, sem nunca interpretar HTML
function textoFormatado(elemento, texto) {
  const padrao = /(\*\*[^*]+\*\*|\*[^*\n]+\*|\n)/g;
  let ultimo = 0;
  for (const achado of texto.matchAll(padrao)) {
    if (achado.index > ultimo) elemento.append(texto.slice(ultimo, achado.index));
    const pedaco = achado[0];
    if (pedaco === "\n") elemento.append(criar("br"));
    else if (pedaco.startsWith("**")) elemento.append(criar("strong", null, pedaco.slice(2, -2)));
    else elemento.append(criar("em", null, pedaco.slice(1, -1)));
    ultimo = achado.index + pedaco.length;
  }
  if (ultimo < texto.length) elemento.append(texto.slice(ultimo));
}

// Um bloco em que toda linha começa com "- " vira lista; com "1. ", "2. "..., lista numerada
function listaDe(bloco) {
  const linhas = bloco.split("\n").map((linha) => linha.trimStart());
  const numerada = linhas.every((linha) => /^\d+\. /.test(linha));
  if (!numerada && !linhas.every((linha) => linha.startsWith("- "))) return null;
  const lista = criar(numerada ? "ol" : "ul");
  const inicio = parseInt(linhas[0], 10);
  if (numerada && inicio !== 1) lista.start = inicio;
  for (const linha of linhas) {
    const item = criar("li");
    textoFormatado(item, linha.replace(/^(- |\d+\. )/, ""));
    lista.append(item);
  }
  return lista;
}

// Uma linha em branco separa parágrafos (e listas)
function paragrafosDe(texto) {
  return String(texto || "")
    .split(/\n\s*\n/)
    .map((bloco) => bloco.trim())
    .filter(Boolean)
    .map((bloco) => {
      const lista = listaDe(bloco);
      if (lista) return lista;
      const p = criar("p");
      textoFormatado(p, bloco);
      return p;
    });
}

// O texto numa linha só, sem as marcas de formatação (para resumos em cards)
const resumoDe = (texto) =>
  String(texto || "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*\n]+)\*/g, "$1")
    .replace(/\s*\n+\s*/g, " ")
    .trim();

/* =================================================================
   Diálogos e avisos
   -----------------------------------------------------------------
   Usam o <dialog id="dialogo-aviso"> e o <div id="aviso-rapido">
   que toda página tem.
   ================================================================= */

function perguntar({ titulo, texto, confirmar = "Entendi", cancelar = "", perigo = false }) {
  const dialogo = $("#dialogo-aviso");
  const botaoConfirmar = $("#aviso-confirmar");
  const botaoCancelar = $("#aviso-cancelar");

  $("#aviso-titulo").textContent = titulo;
  $("#aviso-texto").textContent = texto;
  botaoConfirmar.textContent = confirmar;
  botaoConfirmar.classList.toggle("botao--perigo", perigo);
  botaoCancelar.hidden = !cancelar;
  botaoCancelar.textContent = cancelar;

  dialogo.returnValue = "";
  dialogo.showModal();
  return new Promise((resolver) => {
    dialogo.addEventListener("close", () => resolver(dialogo.returnValue === "confirmar"), { once: true });
  });
}

// Um pedido que deu errado, com a mensagem do servidor
function avisarFalha(falha) {
  return perguntar({ titulo: "Não deu certo", texto: falha.message });
}

let timerAvisoRapido;
function avisoRapido(texto) {
  const aviso = $("#aviso-rapido");
  aviso.textContent = texto;
  aviso.hidden = false;
  clearTimeout(timerAvisoRapido);
  timerAvisoRapido = setTimeout(() => (aviso.hidden = true), 3400);
}

// Fecha o diálogo quando o clique cai fora dele, no fundo escurecido
function fecharAoClicarFora(dialogo) {
  dialogo.addEventListener("click", (evento) => {
    if (evento.target !== dialogo) return;
    const caixa = dialogo.getBoundingClientRect();
    const dentro =
      evento.clientX >= caixa.left && evento.clientX <= caixa.right && evento.clientY >= caixa.top && evento.clientY <= caixa.bottom;
    if (!dentro) dialogo.close();
  });
}

/* =================================================================
   Status do Foundry no cabeçalho
   ================================================================= */

function frasePessoas(n) {
  if (n === 0) return "sem ninguém conectado";
  if (n === 1) return "com 1 pessoa conectada";
  return `com ${n} pessoas conectadas`;
}

// "situacao" é o que o /api/estado devolve; "nomeDoMundo" troca o id do mundo pelo nome da mesa
function mostrarStatus(situacao, nomeDoMundo = (mundo) => mundo) {
  const { online, mundoAtivo, trocandoPara } = situacao;
  const conectados = situacao.conectados ?? 0;
  let texto;
  let tom;
  if (trocandoPara) {
    texto = `Abrindo ${nomeDoMundo(trocandoPara)}…`;
    tom = "trocando";
  } else if (!online) {
    texto = "O Foundry está fora do ar no momento.";
    tom = "reiniciando";
  } else if (!mundoAtivo) {
    texto = "Nenhum mundo aberto no momento.";
    tom = "vazio";
  } else {
    texto = `${nomeDoMundo(mundoAtivo)} está aberto, ${frasePessoas(conectados)}.`;
    tom = conectados > 0 ? "em-sessao" : "aberto";
  }
  $("#status").dataset.tom = tom;
  $("#status-texto").textContent = texto;
}

/* =================================================================
   Fontes para o nome dos personagens
   -----------------------------------------------------------------
   "escala" equilibra o tamanho visual entre fontes mais largas ou
   mais estreitas. A Gótica já vem carregada com a página; as outras
   só são baixadas quando algum card ou o seletor precisa delas.
   A lista de chaves aceitas também existe no servidor (FONTES, em
   servidor/base.js).
   ================================================================= */

const FONTES = [
  { chave: "gotica", rotulo: "Gótica", familia: "Grenze Gotisch", peso: 500, escala: 1 },
  { chave: "fraktur", rotulo: "Fraktur", familia: "UnifrakturMaguntia", google: "UnifrakturMaguntia", escala: 0.9 },
  { chave: "textura", rotulo: "Textura", familia: "Texturina", google: "Texturina:wght@500", peso: 500, escala: 0.88 },
  { chave: "germanica", rotulo: "Germânica", familia: "Germania One", google: "Germania One", escala: 0.92 },
  { chave: "pirata", rotulo: "Corsária", familia: "Pirata One", google: "Pirata One", escala: 1 },
  { chave: "ferro", rotulo: "Ferro", familia: "New Rocker", google: "New Rocker", escala: 0.88 },
  { chave: "uncial", rotulo: "Uncial", familia: "Uncial Antiqua", google: "Uncial Antiqua", escala: 0.76 },
  { chave: "medieval", rotulo: "Medieval", familia: "MedievalSharp", google: "MedievalSharp", escala: 0.86 },
  { chave: "elfica", rotulo: "Élfica", familia: "Almendra", google: "Almendra", escala: 0.94 },
  { chave: "arcana", rotulo: "Arcana", familia: "Metamorphous", google: "Metamorphous", escala: 0.76 },
  { chave: "romana", rotulo: "Romana", familia: "Cinzel Decorative", google: "Cinzel Decorative", escala: 0.72 },
  { chave: "classica", rotulo: "Clássica", familia: "Cormorant SC", google: "Cormorant SC:wght@600", peso: 600, escala: 0.92 },
  { chave: "tinta", rotulo: "Tinta antiga", familia: "IM Fell English SC", google: "IM Fell English SC", escala: 0.9 },
  { chave: "caligrafia", rotulo: "Caligrafia", familia: "Fondamento", google: "Fondamento", escala: 0.9 },
  { chave: "pena", rotulo: "Pena", familia: "Great Vibes", google: "Great Vibes", escala: 1.12 },
  { chave: "sangue", rotulo: "Sangue", familia: "Nosifer", google: "Nosifer", escala: 0.62 },
];

const fontePor = (chave) => FONTES.find((f) => f.chave === chave) ?? FONTES[0];
const fontesCarregadas = new Set(["gotica"]);

function carregarFontes(chaves) {
  const novas = [...new Set(chaves)].map(fontePor).filter((f) => f.google && !fontesCarregadas.has(f.chave));
  if (!novas.length) return;
  for (const fonte of novas) fontesCarregadas.add(fonte.chave);
  const familias = novas.map((f) => `family=${f.google.replace(/ /g, "+")}`).join("&");
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = `https://fonts.googleapis.com/css2?${familias}&display=swap`;
  document.head.append(link);
}

function aplicarFonte(elemento, chave) {
  const fonte = fontePor(chave);
  elemento.style.fontFamily = `"${fonte.familia}", var(--fonte-gotica)`;
  elemento.style.fontWeight = String(fonte.peso ?? 400);
  elemento.style.setProperty("--escala-nome", fonte.escala);
}

/* =================================================================
   Card com moldura: o card dos personagens (e das campanhas no
   ritual do mestre). Os estilos ficam no style.css, em .card.
   ================================================================= */

function nomeEmTexto(nome, fonte) {
  const elemento = criar("span", "card__nome", nome);
  if (fonte) aplicarFonte(elemento, fonte);
  return elemento;
}

// Se alguma imagem não carregar, o card se ajusta sozinho
function protegerImagens(card) {
  const capa = card.querySelector(".card__capa");
  capa?.addEventListener(
    "error",
    () => {
      capa.remove();
      card.classList.add("card--sem-capa");
    },
    { once: true },
  );

  const titulo = card.querySelector(".card__titulo");
  titulo?.addEventListener("error", () => titulo.replaceWith(nomeEmTexto(card.dataset.nome)), {
    once: true,
  });

  const arte = card.querySelector(".card__arte");
  arte?.addEventListener("error", () => arte.remove(), { once: true });
}

// Personagens mostram o nome em texto, na fonte escolhida pelo dono.
// O card da campanha (no ritual do mestre) ainda pode usar o logo em imagem.
function montarCardComMoldura({ nome, capa, titulo, arte, fonte }, campanha, { alheio = false } = {}) {
  const card = criar("button", alheio ? "card card--alheio" : "card");
  card.type = "button";
  card.dataset.nome = nome;
  card.style.setProperty("--cor", campanha.cor);

  const moldura = criar("span", "card__moldura");
  const capaFinal = capa || campanha.capa;
  if (capaFinal) moldura.append(imagem(capaFinal, "card__capa"));
  else card.classList.add("card--sem-capa");
  // Cantos de ferro e as runas que acendem quando o personagem desperta
  moldura.append(criar("span", "card__cantos"), criar("span", "card__runas"));
  card.append(moldura);

  card.append(titulo ? imagem(titulo, "card__titulo", nome) : nomeEmTexto(nome, fonte));
  if (arte) card.append(imagem(arte, "card__arte"));

  protegerImagens(card);
  return card;
}

/* =================================================================
   Cinzas no ar: brasas comuns e, raramente, uma centelha arcana
   ================================================================= */

function iniciarCinzas(quantas = 34) {
  const tela = $("#cinzas");
  if (!tela || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const contexto = tela.getContext("2d");
  const particulas = [];
  let largura = 0;
  let altura = 0;

  const redimensionar = () => {
    const escala = Math.min(window.devicePixelRatio || 1, 2);
    largura = window.innerWidth;
    altura = window.innerHeight;
    tela.width = largura * escala;
    tela.height = altura * escala;
    contexto.setTransform(escala, 0, 0, escala, 0, 0);
  };

  const nova = (espalhada) => {
    const arcana = Math.random() < 0.06; // a magia é rara
    return {
      arcana,
      x: Math.random() * largura,
      y: espalhada ? Math.random() * altura : altura + 12,
      raio: arcana ? 1.3 + Math.random() * 1.1 : 0.6 + Math.random() * 1.2,
      subida: arcana ? 0.12 + Math.random() * 0.16 : 0.22 + Math.random() * 0.5,
      deriva: (Math.random() - 0.5) * 0.18,
      fase: Math.random() * Math.PI * 2,
    };
  };

  redimensionar();
  window.addEventListener("resize", redimensionar);
  for (let i = 0; i < quantas; i++) particulas.push(nova(true));

  let anterior = performance.now();
  const quadro = (agora) => {
    const passo = Math.min(50, agora - anterior) / 16.7;
    anterior = agora;
    contexto.clearRect(0, 0, largura, altura);
    for (const p of particulas) {
      p.fase += 0.02 * passo;
      p.x += (p.deriva + Math.sin(p.fase) * 0.22) * passo;
      p.y -= p.subida * passo;
      if (p.y < -14) Object.assign(p, nova(false));
      const pulso = 0.5 + 0.5 * Math.sin(p.fase * 3);
      const sumir = Math.max(0, Math.min(1, (p.y / altura) * 1.5));
      const alfa = sumir * (p.arcana ? 0.95 : 0.45 + pulso * 0.35);
      contexto.beginPath();
      contexto.fillStyle = p.arcana
        ? `rgba(178, 224, 255, ${alfa})`
        : `rgba(${225 + pulso * 25}, ${105 + pulso * 45}, 48, ${alfa})`;
      contexto.shadowBlur = p.arcana ? 14 : 6;
      contexto.shadowColor = p.arcana ? "rgba(110, 190, 255, 0.95)" : "rgba(230, 120, 50, 0.8)";
      contexto.arc(p.x, p.y, p.raio, 0, Math.PI * 2);
      contexto.fill();
    }
    window.requestAnimationFrame(quadro);
  };
  window.requestAnimationFrame(quadro);
}

/* =================================================================
   Ao carregar: monta a barra lateral, acende os números dela e
   acerta os links de pasta
   ================================================================= */

montarBarraLateral();
atualizarBarra();

if (COMO_ARQUIVO) {
  for (const link of document.querySelectorAll('a[href="./"], a[href="../"]')) {
    link.setAttribute("href", `${link.getAttribute("href")}index.html`);
  }
}
