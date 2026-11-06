/* =================================================================
   Crônicas Eternas: Chat (emojis, reações, GIFs e fixadas)
   -----------------------------------------------------------------
   - O seletor de emojis: no campo de escrever e para reagir.
   - O ":" + duas letras: sugestões de emoji acima do campo.
   - As reações embaixo de cada mensagem.
   - O painel de GIFs (da Klipy, sempre pelo portal) e o GIF na
     mensagem.
   - Fixar mensagens: o alfinete nas ações, o botão no cabeçalho e o
     painel das fixadas.

   Carregado depois do chat.js: usa o "estado", a "api" e as funções
   de lá, e preenche os "ganchosDosExtras". A lista de emojis vem do
   emojis.js (EMOJIS), carregado antes.
   ================================================================= */

const EXTRAS = {
  usados: 27, // "Usados com frequência": 3 linhas de 9
  usadosGuardados: 200, // em chat:emojis:usados, no máximo
  sugestoes: 8, // as sugestões do ":"
  emojisGrandes: 27, // mensagem só de emojis, até 27, aparece maior
  nomesNaReacao: 10, // "Neia, Takezo... e mais 3 reagiram com 😂"
  reacoesPorMensagem: 20,
  esperaDosGifs: 400, // a busca de GIFs espera você parar de digitar
};

/* =================================================================
   Painéis flutuantes: abrir perto de um botão, fechar por fora e Esc
   ================================================================= */

let painelAberto = null; // { painel, ancora, aoFechar }

function posicionarPainel(painel, ancora) {
  const margem = 8;
  const r = ancora.getBoundingClientRect();
  const largura = painel.offsetWidth;
  const altura = painel.offsetHeight;
  let esquerda = Math.min(r.right - largura, window.innerWidth - largura - margem);
  esquerda = Math.max(margem, esquerda);
  let topo = r.top - altura - 6;
  if (topo < margem) topo = Math.min(r.bottom + 6, window.innerHeight - altura - margem);
  painel.style.setProperty("left", `${Math.round(esquerda)}px`);
  painel.style.setProperty("top", `${Math.round(Math.max(margem, topo))}px`);
}

function abrirPainel(painel, ancora, aoFechar = null) {
  if (painelAberto && painelAberto.painel !== painel) fecharPainel();
  painel.hidden = false;
  painelAberto = { painel, ancora, aoFechar };
  ancora?.setAttribute("aria-expanded", "true");
  posicionarPainel(painel, ancora);
}

function fecharPainel() {
  if (!painelAberto) return;
  const { painel, ancora, aoFechar } = painelAberto;
  painelAberto = null;
  painel.hidden = true;
  ancora?.setAttribute("aria-expanded", "false");
  aoFechar?.();
}

const painelEstaAberto = (painel) => painelAberto?.painel === painel;

/* =================================================================
   Emojis: a lista, a busca, o tom de pele e os usados
   ================================================================= */

const GRUPOS_DE_EMOJIS = typeof EMOJIS !== "undefined" ? EMOJIS : [];

// Os desenhos da coluna dos grupos (os <symbol> do index.html)
const ICONES_DOS_GRUPOS = {
  usados: "icone-grupo-usados",
  pessoas: "icone-grupo-pessoas",
  natureza: "icone-grupo-natureza",
  comida: "icone-grupo-comida",
  atividades: "icone-grupo-atividades",
  viagens: "icone-grupo-viagens",
  objetos: "icone-grupo-objetos",
  simbolos: "icone-grupo-simbolos",
  bandeiras: "icone-grupo-bandeiras",
};

// Cada emoji com o texto da busca (nome e palavras, sem acento e em minúsculas)
const TODOS_OS_EMOJIS = GRUPOS_DE_EMOJIS.flatMap((g) =>
  g.emojis.map((x) => ({ ...x, nomeBusca: normalizar(x.n), palavrasBusca: x.p.map(normalizar) })),
);
// O emoji (e cada tom dele) leva aos dados do emoji sem tom
const EMOJI_POR_TEXTO = new Map();
for (const x of TODOS_OS_EMOJIS) {
  EMOJI_POR_TEXTO.set(x.e, x);
  for (const t of x.t ?? []) EMOJI_POR_TEXTO.set(t, x);
}

const dadosDoEmoji = (emoji) => EMOJI_POR_TEXTO.get(emoji) ?? EMOJI_POR_TEXTO.get(emoji.replace(/️/g, "")) ?? null;
const semTom = (emoji) => dadosDoEmoji(emoji)?.e ?? emoji;

// O tom de pele: 0 é a amarela, sem tom; de 1 a 5, os tons
const MAOS_DOS_TONS = ["✋", ...(EMOJI_POR_TEXTO.get("✋")?.t ?? [])];
const NOMES_DOS_TONS = ["Sem tom", "Pele clara", "Pele morena clara", "Pele morena", "Pele morena escura", "Pele escura"];

function lerTom() {
  const n = Number(lerLocal("chat:emojis:tom"));
  return Number.isInteger(n) && n >= 1 && n <= 5 && MAOS_DOS_TONS.length === 6 ? n : 0;
}

let tomAtual = lerTom();
const comTom = (x) => (tomAtual && x.t ? x.t[tomAtual - 1] : x.e);

// Os usados: { "<emoji sem tom>": { vezes, em } }, em chat:emojis:usados
function lerUsados() {
  const bruto = lerLocal("chat:emojis:usados");
  if (bruto !== null) {
    try {
      const usados = JSON.parse(bruto);
      return usados && typeof usados === "object" && !Array.isArray(usados) ? usados : {};
    } catch {
      return {};
    }
  }
  // Da lista antiga (chat:emojis:recentes): cada um com vezes 1, um minuto de diferença
  let recentes = [];
  try {
    const lista = JSON.parse(lerLocal("chat:emojis:recentes") || "[]");
    if (Array.isArray(lista)) recentes = lista.filter((e) => typeof e === "string" && e);
  } catch {
    recentes = [];
  }
  const usados = {};
  const agora = Date.now();
  recentes.forEach((e, i) => {
    const base = semTom(e);
    if (!usados[base]) usados[base] = { vezes: 1, em: agora - i * 60000 };
  });
  if (recentes.length) gravarLocal("chat:emojis:usados", JSON.stringify(usados));
  return usados;
}

const usoValido = (u) => u && Number.isFinite(u.vezes) && u.vezes > 0 && Number.isFinite(u.em);

// Os mais usados, na ordem de vezes / (1 + dias desde o último uso / 7)
function emojisUsados() {
  const agora = Date.now();
  const nota = (u) => u.vezes / (1 + Math.max(0, agora - u.em) / 86400000 / 7);
  return Object.entries(lerUsados())
    .filter(([e, u]) => e && usoValido(u))
    .sort((a, b) => nota(b[1]) - nota(a[1]))
    .slice(0, EXTRAS.usados)
    .map(([e]) => dadosDoEmoji(e) ?? { e, n: e, p: [] });
}

function usouEmoji(emoji) {
  const base = semTom(emoji);
  const usados = Object.fromEntries(Object.entries(lerUsados()).filter(([, u]) => usoValido(u)));
  usados[base] = { vezes: (usados[base]?.vezes ?? 0) + 1, em: Date.now() };
  // Passando do limite, sai o de menor conta (o mais antigo, se empatar)
  let chaves = Object.keys(usados);
  while (chaves.length > EXTRAS.usadosGuardados) {
    const sai = chaves
      .filter((e) => e !== base)
      .reduce((a, b) => (usados[b].vezes < usados[a].vezes || (usados[b].vezes === usados[a].vezes && usados[b].em < usados[a].em) ? b : a));
    delete usados[sai];
    chaves = Object.keys(usados);
  }
  gravarLocal("chat:emojis:usados", JSON.stringify(usados));
}

// Busca pelo nome e pelas palavras: primeiro os que começam pelo termo, depois os que o contêm
function buscarEmojis(termo, limite = Infinity) {
  const t = normalizar(termo).trim();
  if (!t) return [];
  const comeca = [];
  const palavra = [];
  const contem = [];
  for (const x of TODOS_OS_EMOJIS) {
    if (x.nomeBusca.startsWith(t)) comeca.push(x);
    else if (x.palavrasBusca.some((p) => p.startsWith(t)) || x.nomeBusca.includes(` ${t}`)) palavra.push(x);
    else if (x.nomeBusca.includes(t) || x.palavrasBusca.some((p) => p.includes(t))) contem.push(x);
  }
  return [...comeca, ...palavra, ...contem].slice(0, limite);
}

const nomeDoEmoji = (emoji) => dadosDoEmoji(emoji)?.n ?? emoji;

// Mensagem só de emojis: até 27, ignorando espaços, sem nada mais
const REGEX_SO_EMOJIS =
  /^(?:[#*0-9]️?⃣|[\p{Extended_Pictographic}\p{Regional_Indicator}\p{Emoji_Modifier}‍️\u{E0020}-\u{E007F}]|\s)+$/u;
const segmentador = typeof Intl.Segmenter === "function" ? new Intl.Segmenter("pt-BR", { granularity: "grapheme" }) : null;

function ehSoEmojis(texto) {
  if (!texto || texto.length > 400 || !REGEX_SO_EMOJIS.test(texto) || !/[^\s]/.test(texto)) return false;
  const semEspacos = texto.replace(/\s+/g, "");
  const quantos = segmentador ? [...segmentador.segment(semEspacos)].length : [...semEspacos].length;
  return quantos <= EXTRAS.emojisGrandes;
}

/* =================================================================
   O seletor de emojis (escrever e reagir)
   ================================================================= */

let seletor = { modo: "escrever", mensagem: null, montado: false, temUsados: false };

const POR_LINHA = 9; // as colunas da grade

function botaoDeEmoji(x) {
  const emoji = comTom(x);
  const b = criar("button", "emoji-opcao", emoji);
  b.type = "button";
  b.tabIndex = -1;
  b.title = x.n;
  b.setAttribute("aria-label", x.n);
  b.dataset.emoji = emoji;
  return b;
}

// Só uma casa da grade entra no Tab; as setas andam entre elas
function acertarCasaComFoco(grade = $("#emojis-grade")) {
  const primeiro = grade.querySelector(".emoji-opcao");
  if (primeiro) primeiro.tabIndex = 0;
}

function focarEmoji(botao) {
  for (const b of $("#emojis-grade").querySelectorAll('.emoji-opcao[tabindex="0"]')) b.tabIndex = -1;
  botao.tabIndex = 0;
  botao.focus();
  botao.scrollIntoView({ block: "nearest" });
}

// A grade inteira: os usados e os grupos, cada um com o seu título
function montarGradeDeEmojis(manterRolagem = false) {
  const grade = $("#emojis-grade");
  const rolagem = grade.scrollTop;
  const partes = [];
  const usados = emojisUsados();
  seletor.temUsados = usados.length > 0;
  if (usados.length) {
    const titulo = criar("h3", "painel-emojis__grupo", "Usados com frequência");
    titulo.dataset.grupo = "usados";
    const caixa = criar("div", "painel-emojis__lista");
    caixa.append(...usados.map(botaoDeEmoji));
    partes.push(titulo, caixa);
  }
  for (const g of GRUPOS_DE_EMOJIS) {
    const titulo = criar("h3", "painel-emojis__grupo", g.nome);
    titulo.dataset.grupo = g.id;
    const caixa = criar("div", "painel-emojis__lista");
    caixa.append(...g.emojis.map(botaoDeEmoji));
    partes.push(titulo, caixa);
  }
  grade.replaceChildren(...partes);
  acertarCasaComFoco(grade);
  grade.scrollTop = manterRolagem ? rolagem : 0;
  marcarAbaAtual();
}

function montarAbas() {
  const abas = $("#emojis-abas");
  const lista = [{ id: "usados", nome: "Usados com frequência" }, ...GRUPOS_DE_EMOJIS];
  abas.replaceChildren(
    ...lista.map((g) => {
      const b = criar("button", "painel-emojis__aba");
      b.type = "button";
      b.title = g.nome;
      b.setAttribute("aria-label", g.nome);
      b.dataset.grupo = g.id;
      b.append(simbolo(ICONES_DOS_GRUPOS[g.id] ?? "icone-emoji"));
      b.addEventListener("click", () => {
        $("#emojis-busca").value = "";
        if ($("#emojis-grade").dataset.busca) montarGradeDeEmojis();
        delete $("#emojis-grade").dataset.busca;
        const titulo = $(`#emojis-grade [data-grupo="${g.id}"]`);
        if (titulo) $("#emojis-grade").scrollTop = inicioDoGrupo(titulo);
        marcarAbaAtual(g.id);
      });
      return b;
    }),
  );
}

// Onde o grupo começa na grade. O título fica grudado no topo ao rolar (e o offsetTop dele
// muda junto), então a conta parte da lista logo abaixo dele.
const inicioDoGrupo = (titulo) => (titulo.nextElementSibling?.offsetTop ?? 0) - titulo.offsetHeight;

function marcarAbaAtual(forcado) {
  const grade = $("#emojis-grade");
  let atual = forcado;
  if (!atual) {
    for (const titulo of grade.querySelectorAll(".painel-emojis__grupo")) {
      if (inicioDoGrupo(titulo) <= grade.scrollTop + 4) atual = titulo.dataset.grupo;
    }
  }
  for (const aba of $("#emojis-abas").children) {
    aba.setAttribute("aria-pressed", String(aba.dataset.grupo === atual));
    if (aba.dataset.grupo === "usados") aba.hidden = !seletor.temUsados;
  }
}

function mostrarBuscaDeEmojis() {
  const grade = $("#emojis-grade");
  const termo = $("#emojis-busca").value;
  if (!termo.trim()) {
    delete grade.dataset.busca;
    return montarGradeDeEmojis();
  }
  grade.dataset.busca = "sim";
  const achados = buscarEmojis(termo);
  if (!achados.length) {
    grade.replaceChildren(criar("p", "painel-emojis__vazio", "Nenhum emoji encontrado."));
  } else {
    const caixa = criar("div", "painel-emojis__lista");
    caixa.append(...achados.map(botaoDeEmoji));
    grade.replaceChildren(caixa);
    acertarCasaComFoco(grade);
  }
  grade.scrollTop = 0;
  marcarAbaAtual("nenhuma");
}

// A barra de baixo: o emoji sob o mouse (ou com o foco) grande e o nome; sem nenhum, a frase
function mostrarNaBarra(botao) {
  $("#emojis-nome-emoji").textContent = botao ? botao.dataset.emoji : "";
  $("#emojis-nome-texto").textContent = botao ? botao.title : seletor.frase ?? "";
}

function emojiComFoco() {
  const ativo = document.activeElement;
  return ativo?.classList?.contains("emoji-opcao") && $("#emojis-grade").contains(ativo) ? ativo : null;
}

// O tom de pele: o botão com a mão no tom e a fileira das seis opções
function atualizarBotaoDoTom() {
  const botao = $("#emojis-tom");
  botao.textContent = MAOS_DOS_TONS[tomAtual] ?? "✋";
  botao.title = `Tom de pele: ${NOMES_DOS_TONS[tomAtual].toLowerCase()}`;
  botao.setAttribute("aria-label", botao.title);
}

function fecharTons() {
  $("#emojis-tons").hidden = true;
  $("#emojis-tom").setAttribute("aria-expanded", "false");
}

function abrirTons() {
  const fileira = $("#emojis-tons");
  fileira.replaceChildren(
    ...MAOS_DOS_TONS.map((mao, i) => {
      const b = criar("button", "painel-emojis__opcao-tom", mao);
      b.type = "button";
      b.title = NOMES_DOS_TONS[i];
      b.setAttribute("aria-label", NOMES_DOS_TONS[i]);
      b.setAttribute("aria-pressed", String(i === tomAtual));
      b.addEventListener("click", () => escolherTom(i));
      return b;
    }),
  );
  fileira.hidden = false;
  $("#emojis-tom").setAttribute("aria-expanded", "true");
  fileira.children[tomAtual]?.focus();
}

function escolherTom(tom) {
  tomAtual = tom;
  gravarLocal("chat:emojis:tom", String(tom));
  fecharTons();
  atualizarBotaoDoTom();
  if ($("#emojis-grade").dataset.busca) mostrarBuscaDeEmojis();
  else montarGradeDeEmojis(true);
  mostrarNaBarra(null);
  $("#emojis-tom").focus();
}

// modo "escrever": insere no campo; modo "reagir": reage à mensagem
function abrirSeletorDeEmojis(ancora, modo = "escrever", mensagem = null) {
  const painel = $("#painel-emojis");
  if (painelEstaAberto(painel) && seletor.modo === modo && seletor.mensagem?.id === mensagem?.id) return fecharPainel();
  seletor = { ...seletor, modo, mensagem };
  if (!seletor.montado) {
    montarAbas();
    seletor.montado = true;
  }
  tomAtual = lerTom();
  atualizarBotaoDoTom();
  fecharTons();
  $("#emojis-busca").value = "";
  delete $("#emojis-grade").dataset.busca;
  seletor.frase = modo === "reagir" ? "Escolha a reação" : "Shift + clique escolhe mais de um";
  mostrarNaBarra(null);
  painel.classList.toggle("painel-emojis--reagir", modo === "reagir");
  montarGradeDeEmojis();
  abrirPainel(painel, ancora, () => {
    fecharTons();
    if (seletor.modo === "escrever") $("#campo-texto").focus();
  });
  $("#emojis-busca").focus();
}

function inserirNoCampo(texto) {
  const campo = $("#campo-texto");
  if (campo.disabled) return;
  const inicio = campo.selectionStart ?? campo.value.length;
  const fim = campo.selectionEnd ?? campo.value.length;
  campo.value = `${campo.value.slice(0, inicio)}${texto}${campo.value.slice(fim)}`;
  const posicao = inicio + texto.length;
  campo.setSelectionRange(posicao, posicao);
  ajustarCampo();
}

function escolherEmoji(emoji, manterAberto) {
  usouEmoji(emoji);
  if (seletor.modo === "reagir") {
    const m = seletor.mensagem;
    fecharPainel();
    if (m) mudarReacao(m, emoji, true);
    return;
  }
  inserirNoCampo(emoji);
  if (!manterAberto) fecharPainel();
}

// A casa ao lado (setas): 9 por linha, passando de um grupo para o outro na mesma coluna.
// Para cima, da primeira linha, volta para a busca ("busca").
function casaVizinha(botao, tecla) {
  const lista = botao.parentElement;
  const itens = [...lista.children];
  const i = itens.indexOf(botao);
  const coluna = i % POR_LINHA;
  const listas = [...$("#emojis-grade").querySelectorAll(".painel-emojis__lista")];
  const k = listas.indexOf(lista);
  if (tecla === "ArrowRight") return itens[i + 1] ?? listas[k + 1]?.firstElementChild ?? null;
  if (tecla === "ArrowLeft") return itens[i - 1] ?? listas[k - 1]?.lastElementChild ?? null;
  if (tecla === "ArrowDown") {
    if (i + POR_LINHA < itens.length) return itens[i + POR_LINHA];
    const ultimaLinha = Math.floor((itens.length - 1) / POR_LINHA);
    if (Math.floor(i / POR_LINHA) < ultimaLinha) return itens[itens.length - 1];
    const proxima = listas[k + 1];
    return proxima ? proxima.children[Math.min(coluna, proxima.children.length - 1)] : null;
  }
  if (tecla === "ArrowUp") {
    if (i - POR_LINHA >= 0) return itens[i - POR_LINHA];
    const anterior = listas[k - 1];
    if (!anterior) return "busca";
    const n = anterior.children.length;
    return anterior.children[Math.min(Math.floor((n - 1) / POR_LINHA) * POR_LINHA + coluna, n - 1)];
  }
  return null;
}

function configurarSeletorDeEmojis() {
  const grade = $("#emojis-grade");
  grade.addEventListener("click", (evento) => {
    const botao = evento.target.closest(".emoji-opcao");
    if (botao) escolherEmoji(botao.dataset.emoji, evento.shiftKey);
  });
  grade.addEventListener("mouseover", (evento) => {
    const botao = evento.target.closest(".emoji-opcao");
    if (botao) mostrarNaBarra(botao);
  });
  grade.addEventListener("mouseleave", () => mostrarNaBarra(emojiComFoco()));
  grade.addEventListener("focusin", (evento) => {
    if (evento.target.classList.contains("emoji-opcao")) mostrarNaBarra(evento.target);
  });
  grade.addEventListener("focusout", (evento) => {
    if (!evento.relatedTarget?.classList?.contains("emoji-opcao")) mostrarNaBarra(null);
  });
  grade.addEventListener("keydown", (evento) => {
    const botao = evento.target.closest(".emoji-opcao");
    if (!botao) return;
    if (evento.key.startsWith("Arrow")) {
      evento.preventDefault();
      const vizinha = casaVizinha(botao, evento.key);
      if (vizinha === "busca") $("#emojis-busca").focus();
      else if (vizinha) focarEmoji(vizinha);
    } else if (evento.key === "Enter" || evento.key === " ") {
      evento.preventDefault();
      escolherEmoji(botao.dataset.emoji, evento.key === "Enter" && evento.shiftKey);
    }
  });
  // O espaço solto não clica de novo no botão
  grade.addEventListener("keyup", (evento) => {
    if (evento.key === " " && evento.target.closest(".emoji-opcao")) evento.preventDefault();
  });
  grade.addEventListener("scroll", () => {
    if (!grade.dataset.busca) marcarAbaAtual();
  });
  const busca = $("#emojis-busca");
  busca.addEventListener("input", mostrarBuscaDeEmojis);
  busca.addEventListener("keydown", (evento) => {
    if (evento.key === "Enter") {
      evento.preventDefault();
      const primeiro = grade.querySelector(".emoji-opcao");
      if (primeiro) escolherEmoji(primeiro.dataset.emoji, evento.shiftKey);
    } else if (evento.key === "ArrowDown") {
      const primeiro = grade.querySelector(".emoji-opcao");
      if (primeiro) {
        evento.preventDefault();
        focarEmoji(primeiro);
      }
    }
  });
  $("#emojis-tom").addEventListener("click", () => ($("#emojis-tons").hidden ? abrirTons() : fecharTons()));
  // Um clique no painel fora do tom fecha a fileira
  $("#painel-emojis").addEventListener("pointerdown", (evento) => {
    if (!$("#emojis-tons").hidden && !evento.target.closest(".painel-emojis__tom")) fecharTons();
  });
  $("#botao-emoji").addEventListener("click", (evento) => abrirSeletorDeEmojis(evento.currentTarget, "escrever"));
}

/* =================================================================
   O ":" + duas letras no campo de escrever
   ================================================================= */

let sugestaoAtual = null; // { inicio, fim, opcoes, escolhida }

function procurarSugestaoDeEmoji() {
  const campo = $("#campo-texto");
  if (campo.selectionStart !== campo.selectionEnd) return fecharSugestoes();
  const antes = campo.value.slice(0, campo.selectionStart);
  const achado = /(^|\s):([^\s:]{2,30})$/.exec(antes);
  if (!achado) return fecharSugestoes();
  const opcoes = buscarEmojis(achado[2], EXTRAS.sugestoes);
  if (!opcoes.length) return fecharSugestoes();
  sugestaoAtual = { inicio: antes.length - achado[2].length - 1, fim: antes.length, opcoes, escolhida: 0 };
  desenharSugestoes();
}

function desenharSugestoes() {
  const lista = $("#lista-emojis");
  lista.replaceChildren(
    ...sugestaoAtual.opcoes.map((x, i) => {
      const item = criar("button", "mencao-opcao emoji-sugestao");
      item.type = "button";
      item.setAttribute("role", "option");
      item.setAttribute("aria-selected", String(i === sugestaoAtual.escolhida));
      item.append(criar("span", "emoji-sugestao__emoji", comTom(x)), criar("span", "mencao-opcao__nome", x.n));
      item.addEventListener("mousedown", (evento) => {
        evento.preventDefault();
        sugestaoAtual.escolhida = i;
        escolherSugestao();
      });
      return item;
    }),
  );
  lista.hidden = false;
}

function fecharSugestoes() {
  sugestaoAtual = null;
  $("#lista-emojis").hidden = true;
}

function escolherSugestao() {
  const campo = $("#campo-texto");
  const { inicio, fim, opcoes, escolhida } = sugestaoAtual;
  const emoji = comTom(opcoes[escolhida]);
  campo.value = `${campo.value.slice(0, inicio)}${emoji}${campo.value.slice(fim)}`;
  const posicao = inicio + emoji.length;
  campo.setSelectionRange(posicao, posicao);
  usouEmoji(emoji);
  fecharSugestoes();
  ajustarCampo();
  campo.focus();
}

function configurarSugestoes() {
  const campo = $("#campo-texto");
  campo.addEventListener("input", procurarSugestaoDeEmoji);
  campo.addEventListener("click", procurarSugestaoDeEmoji);
  campo.addEventListener("blur", () => setTimeout(fecharSugestoes, 120));
  // Na captura, no formulário: chega antes das teclas do chat.js (o Enter que envia)
  $("#escrever").addEventListener(
    "keydown",
    (evento) => {
      if (!sugestaoAtual || evento.target !== campo) return;
      const n = sugestaoAtual.opcoes.length;
      let tratada = true;
      if (evento.key === "ArrowDown" || evento.key === "ArrowUp") {
        sugestaoAtual.escolhida = (sugestaoAtual.escolhida + (evento.key === "ArrowDown" ? 1 : n - 1)) % n;
        desenharSugestoes();
      } else if ((evento.key === "Enter" && !evento.shiftKey && !evento.isComposing) || evento.key === "Tab") {
        escolherSugestao();
      } else if (evento.key === "Escape") {
        fecharSugestoes();
      } else {
        tratada = false;
      }
      if (tratada) {
        evento.preventDefault();
        evento.stopPropagation();
      }
    },
    true,
  );
}

/* =================================================================
   Reações
   ================================================================= */

// A privada com uma conta excluída fica só para ler: sem reagir
function alvoSoParaLer() {
  const alvo = estado.alvo;
  return alvo?.tipo === "privada" && (privadaDaLista(alvo.chave)?.ativa === false || !contaPorUsuario(alvo.usuario));
}

// O nome de quem reagiu: a persona daquela conta no canal (ou o apelido)
function nomeNoAlvo(usuario, categoria) {
  const persona = categoria && estado.dados.personasDosMembros?.[categoria.id]?.[usuario];
  return persona?.nome ?? apelidoDe(usuario);
}

function listaDeNomes(nomes) {
  if (nomes.length <= 1) return nomes.join("");
  return `${nomes.slice(0, -1).join(", ")} e ${nomes[nomes.length - 1]}`;
}

function textoDaReacao(r, categoria) {
  const nomes = r.usuarios.map((u) => (u === eu() ? "Você" : nomeNoAlvo(u, categoria)));
  const sobram = nomes.length - EXTRAS.nomesNaReacao;
  const quem = sobram > 0 ? `${nomes.slice(0, EXTRAS.nomesNaReacao).join(", ")} e mais ${sobram}` : listaDeNomes(nomes);
  return `${quem} ${nomes.length === 1 && r.usuarios[0] !== eu() ? "reagiu" : "reagiram"} com ${r.emoji}`;
}

function reacoesDaMensagem(m, categoria) {
  const reacoes = m.reacoes ?? [];
  if (!reacoes.length) return null;
  const soLer = alvoSoParaLer();
  const caixa = criar("div", "msg__reacoes");
  for (const r of reacoes) {
    const minha = r.usuarios.includes(eu());
    const b = criar("button", `reacao${minha ? " reacao--minha" : ""}`);
    b.type = "button";
    b.title = textoDaReacao(r, categoria);
    b.setAttribute("aria-label", `${b.title}. ${minha ? "Clique para tirar a sua." : "Clique para reagir também."}`);
    b.setAttribute("aria-pressed", String(minha));
    b.disabled = soLer;
    b.append(criar("span", "reacao__emoji", r.emoji), criar("span", "reacao__numero", String(r.usuarios.length)));
    b.addEventListener("click", () => mudarReacao(m, r.emoji, !minha));
    caixa.append(b);
  }
  if (!soLer && reacoes.length < EXTRAS.reacoesPorMensagem) {
    const mais = criar("button", "reacao reacao--mais");
    mais.type = "button";
    mais.title = "Reagir";
    mais.setAttribute("aria-label", "Reagir");
    mais.append(simbolo("icone-mais"));
    mais.addEventListener("click", () => abrirSeletorDeEmojis(mais, "reagir", m));
    caixa.append(mais);
  }
  return caixa;
}

function trocarReacoes(id, chave, reacoes) {
  const h = estado.historicos.get(chave);
  const m = h?.lista.find((x) => x.id === id);
  if (!m) return;
  m.reacoes = reacoes;
  if (estado.alvo?.chave === chave && !estado.alvo.voz) desenharMensagens();
}

async function mudarReacao(m, emoji, ligado) {
  try {
    const { reacoes } = await api.reagir(m.id, emoji, ligado);
    trocarReacoes(m.id, m.canal, reacoes);
  } catch (falha) {
    if (falha.codigo === "sem-sessao") return;
    if (falha.codigo === "reacoes-demais" || falha.codigo === "emoji") avisoRapido(falha.message);
    else avisarFalha(falha);
  }
}

/* =================================================================
   GIFs (da Klipy, pelo portal)
   ================================================================= */

const gifs = { termo: "", pagina: 0, maisPaginas: false, carregando: false, pedido: 0, alturas: [0, 0], espera: null };

// O GIF na mensagem: a altura reservada antes de carregar, para a rolagem não pular
function gifDaMensagem(m) {
  const g = m.gif;
  if (!g?.url) return null;
  const abrir = criar("button", "msg__gif");
  abrir.type = "button";
  abrir.title = g.titulo ? `${g.titulo} (abrir)` : "Abrir o GIF";
  const img = imagem(g.url, "msg__gif-imagem", g.titulo || "GIF");
  img.loading = "lazy";
  if (g.largura > 0 && g.altura > 0) {
    img.width = g.largura;
    img.height = g.altura;
    abrir.style.setProperty("--largura", `${g.largura}px`);
    abrir.style.setProperty("--proporcao", `${g.largura} / ${g.altura}`);
  }
  img.addEventListener("load", () => {
    if (estado.grudado) rolarParaOFim();
  });
  abrir.append(img);
  abrir.addEventListener("click", () => abrirImagem(g.url));
  return abrir;
}

function colunasDosGifs() {
  return [...$("#gifs-grade").querySelectorAll(".painel-gifs__coluna")];
}

function limparGradeDosGifs() {
  const grade = $("#gifs-grade");
  grade.replaceChildren(criar("div", "painel-gifs__coluna"), criar("div", "painel-gifs__coluna"));
  gifs.alturas = [0, 0];
  grade.scrollTop = 0;
}

function avisoNosGifs(texto) {
  const grade = $("#gifs-grade");
  grade.querySelector(".painel-gifs__aviso")?.remove();
  if (texto) grade.append(criar("p", "painel-gifs__aviso", texto));
}

function opcaoDeGif(g) {
  const b = criar("button", "gif-opcao");
  b.type = "button";
  b.title = g.titulo || "GIF";
  b.setAttribute("aria-label", g.titulo ? `Enviar o GIF: ${g.titulo}` : "Enviar o GIF");
  const img = imagem(g.previa.url, "gif-opcao__imagem", "");
  img.loading = "lazy";
  img.width = g.previa.largura;
  img.height = g.previa.altura;
  img.style.setProperty("--proporcao", `${g.previa.largura} / ${g.previa.altura}`);
  b.append(img);
  b.addEventListener("click", () => enviarGif(g));
  return b;
}

async function carregarGifs(novaBusca) {
  if (novaBusca) {
    gifs.pagina = 0;
    gifs.maisPaginas = false;
    gifs.carregando = false;
    limparGradeDosGifs();
  } else if (gifs.carregando || !gifs.maisPaginas) {
    return;
  }
  const pedido = ++gifs.pedido;
  const pagina = gifs.pagina + 1;
  gifs.carregando = true;
  avisoNosGifs("Carregando…");
  try {
    const resposta = await api.gifs(gifs.termo, pagina);
    if (pedido !== gifs.pedido) return;
    gifs.pagina = pagina;
    gifs.maisPaginas = Boolean(resposta.maisPaginas);
    const colunas = colunasDosGifs();
    for (const g of resposta.gifs ?? []) {
      const i = gifs.alturas[0] <= gifs.alturas[1] ? 0 : 1;
      colunas[i].append(opcaoDeGif(g));
      gifs.alturas[i] += g.previa.altura / g.previa.largura;
    }
    const nenhum = !colunas.some((c) => c.children.length);
    avisoNosGifs(nenhum ? (gifs.termo ? "Nenhum GIF encontrado." : "Nenhum GIF em alta agora.") : "");
  } catch (falha) {
    if (pedido !== gifs.pedido) return;
    avisoNosGifs(falha.codigo === "sem-sessao" ? "" : falha.message);
  } finally {
    if (pedido === gifs.pedido) gifs.carregando = false;
  }
  // Se a primeira página não encheu o painel, já pede a próxima
  const grade = $("#gifs-grade");
  if (pedido === gifs.pedido && gifs.maisPaginas && grade.scrollHeight <= grade.clientHeight + 40) carregarGifs(false);
}

function abrirPainelDeGifs(ancora) {
  const painel = $("#painel-gifs");
  if (painelEstaAberto(painel)) return fecharPainel();
  const busca = $("#gifs-busca");
  busca.value = "";
  gifs.termo = "";
  abrirPainel(painel, ancora, () => {
    clearTimeout(gifs.espera);
    gifs.pedido++;
    $("#campo-texto").focus();
  });
  busca.focus();
  carregarGifs(true);
}

async function enviarGif(g) {
  const alvo = estado.alvo;
  const campo = $("#campo-texto");
  if (!alvo || alvo.voz || estado.enviando || campo.disabled) return;
  fecharPainel();
  estado.enviando = true;
  try {
    const { mensagem } = await api.enviar(alvo, { texto: "", resposta: estado.respondendo?.id, persona: personaParaEnviar(), gif: g.id });
    if (estado.alvo?.chave === alvo.chave && estado.respondendo) {
      estado.respondendo = null;
      desenharEscrever();
    }
    estado.grudado = true;
    estado.marcaNovas = null;
    const h = estado.historicos.get(alvo.chave);
    if (h?.carregado) {
      acrescentarMensagem(mensagem);
      estado.lidaEnviada.set(alvo.chave, mensagem.id);
      if (estado.alvo?.chave === alvo.chave) desenharMensagens();
    }
    if (alvo.tipo === "privada" && !privadaDaLista(alvo.chave)) await recarregarEstado();
  } catch (falha) {
    if (falha.codigo === "limite" || falha.codigo === "gif" || falha.codigo === "gifs") avisoRapido(falha.message);
    else if (falha.codigo !== "sem-sessao") avisarFalha(falha);
  } finally {
    estado.enviando = false;
  }
}

function configurarGifs() {
  $("#botao-gif").addEventListener("click", (evento) => abrirPainelDeGifs(evento.currentTarget));
  const busca = $("#gifs-busca");
  busca.addEventListener("input", () => {
    clearTimeout(gifs.espera);
    gifs.espera = setTimeout(() => {
      const termo = busca.value.trim();
      if (termo === gifs.termo) return;
      gifs.termo = termo;
      carregarGifs(true);
    }, EXTRAS.esperaDosGifs);
  });
  busca.addEventListener("keydown", (evento) => {
    if (evento.key === "Enter") evento.preventDefault();
  });
  const grade = $("#gifs-grade");
  grade.addEventListener("scroll", () => {
    if (grade.scrollTop + grade.clientHeight > grade.scrollHeight - 120) carregarGifs(false);
  });
}

/* =================================================================
   Mensagens fixadas
   ================================================================= */

const fixadasDoAlvo = () => (estado.alvo ? estado.dados?.fixadas?.[estado.alvo.chave] ?? 0 : 0);

function atualizarBotaoDasFixadas() {
  const botao = $("#botao-fixadas");
  const alvo = estado.alvo;
  botao.hidden = !alvo || Boolean(alvo.voz);
  const quantas = fixadasDoAlvo();
  const numero = $("#fixadas-numero");
  numero.textContent = quantas ? String(quantas) : "";
  numero.hidden = !quantas;
  const rotulo = quantas ? `Mensagens fixadas (${quantas})` : "Mensagens fixadas";
  botao.title = rotulo;
  botao.setAttribute("aria-label", rotulo);
}

let chaveDoPainelDeFixadas = null;

async function desenharFixadas() {
  const alvo = estado.alvo;
  const lista = $("#fixadas-lista");
  if (!alvo) return;
  const chave = alvo.chave;
  let resposta;
  try {
    resposta = await api.fixadas(alvo);
  } catch (falha) {
    if (chaveDoPainelDeFixadas === chave) lista.replaceChildren(criar("p", "painel-fixadas__vazio", falha.message));
    return;
  }
  if (chaveDoPainelDeFixadas !== chave || !painelEstaAberto($("#painel-fixadas"))) return;
  const categoria = categoriaDoAlvo();
  if (!resposta.fixadas.length) {
    lista.replaceChildren(criar("p", "painel-fixadas__vazio", "Nenhuma mensagem fixada aqui ainda. Use o alfinete nas ações de uma mensagem."));
    return;
  }
  lista.replaceChildren(
    ...resposta.fixadas.map(({ mensagem: m, por, em }) => {
      const item = criar("article", "fixada");
      const cabeca = criar("div", "fixada__cabeca");
      const hora = criar("time", "fixada__hora", dataCompleta(m.em));
      hora.dateTime = m.em;
      cabeca.append(retratoDe(m.persona, categoria, "fixada__retrato"), nomeDaPersona(m.persona, "fixada__nome"), hora);
      const resumo = criar("p", "fixada__resumo", textoDoAviso(m, categoria) || "(mensagem vazia)");
      const quem = criar("p", "fixada__por", `fixada por ${nomeNoAlvo(por, categoria)} em ${dataCompleta(em)}`);
      const acoes = criar("div", "fixada__acoes");
      const ir = criar("button", "botao botao--leve botao--pequeno", "Ir até");
      ir.type = "button";
      ir.addEventListener("click", () => {
        fecharPainel();
        irParaMensagem(m.id);
      });
      const desafixar = criar("button", "botao botao--leve botao--pequeno", "Desafixar");
      desafixar.type = "button";
      desafixar.addEventListener("click", () => mudarFixada(m, false));
      acoes.append(ir, desafixar);
      item.append(cabeca, resumo, quem, acoes);
      return item;
    }),
  );
}

function abrirPainelDeFixadas(ancora) {
  const painel = $("#painel-fixadas");
  if (painelEstaAberto(painel)) return fecharPainel();
  chaveDoPainelDeFixadas = estado.alvo?.chave ?? null;
  $("#fixadas-lista").replaceChildren(criar("p", "painel-fixadas__vazio", "Carregando…"));
  abrirPainel(painel, ancora, () => (chaveDoPainelDeFixadas = null));
  desenharFixadas();
}

// Uma mensagem fixada ou desafixada (por você ou pelo evento)
function trocarFixada(chave, id, fixada, quantas) {
  const contagem = (estado.dados.fixadas ??= {});
  if (typeof quantas === "number") {
    if (quantas > 0) contagem[chave] = quantas;
    else delete contagem[chave];
  }
  const m = id && estado.historicos.get(chave)?.lista.find((x) => x.id === id);
  if (m && typeof fixada === "boolean") m.fixada = fixada;
  if (estado.alvo?.chave === chave) {
    atualizarBotaoDasFixadas();
    if (m && !estado.alvo.voz) desenharMensagens();
    if (chaveDoPainelDeFixadas === chave && painelEstaAberto($("#painel-fixadas"))) desenharFixadas();
  }
}

async function mudarFixada(m, fixada) {
  try {
    const resposta = await api.fixar(m.id, fixada);
    trocarFixada(m.canal, m.id, resposta.fixada, resposta.quantas);
  } catch (falha) {
    if (falha.codigo === "sem-sessao") return;
    if (falha.codigo === "fixadas-demais") avisoRapido("Desafixe uma antes.");
    else avisarFalha(falha);
  }
}

/* =================================================================
   Ganchos do chat.js e início
   ================================================================= */

ganchosDosExtras.conteudo = (m, categoria) => [gifDaMensagem(m), reacoesDaMensagem(m, categoria)].filter(Boolean);

ganchosDosExtras.acoes = (m) => {
  const antes = [];
  if (!alvoSoParaLer()) {
    const reagir = botaoDeIcone("icone-emoji", "Reagir", () => abrirSeletorDeEmojis(reagir, "reagir", m));
    antes.push(reagir);
  }
  const depois = [
    m.fixada
      ? botaoDeIcone("icone-alfinete", "Desafixar", () => mudarFixada(m, false), "icone-botao--ligado")
      : botaoDeIcone("icone-alfinete", "Fixar", () => mudarFixada(m, true)),
  ];
  return { antes, depois };
};

ganchosDosExtras.soEmojis = ehSoEmojis;

ganchosDosExtras.cabeca = atualizarBotaoDasFixadas;

ganchosDosExtras.escrever = (inativa) => {
  $("#botao-emoji").disabled = inativa;
  const botaoGif = $("#botao-gif");
  botaoGif.hidden = !estado.dados?.gifs;
  botaoGif.disabled = inativa;
};

ganchosDosExtras.evento = (tipo, corpo) => {
  if (tipo === "reacoes" && corpo.id && corpo.canal) trocarReacoes(corpo.id, corpo.canal, corpo.reacoes ?? []);
  else if (tipo === "fixadas" && corpo.canal) trocarFixada(corpo.canal, corpo.id, corpo.fixada, corpo.quantas);
};

ganchosDosExtras.fechar = () => {
  fecharPainel();
  fecharSugestoes();
};

function configurarExtras() {
  configurarSeletorDeEmojis();
  configurarSugestoes();
  configurarGifs();
  $("#botao-fixadas").addEventListener("click", (evento) => abrirPainelDeFixadas(evento.currentTarget));

  // Fecha o painel aberto ao clicar fora dele (e fora do botão que o abriu) e com Esc
  document.addEventListener("pointerdown", (evento) => {
    if (!painelAberto) return;
    const { painel, ancora } = painelAberto;
    if (painel.contains(evento.target) || ancora?.contains(evento.target)) return;
    fecharPainel();
  });
  document.addEventListener("keydown", (evento) => {
    if (evento.key === "Escape" && painelAberto) {
      evento.preventDefault();
      evento.stopPropagation();
      fecharPainel();
    }
  }, true);
  window.addEventListener("resize", () => {
    if (painelAberto?.ancora?.isConnected) posicionarPainel(painelAberto.painel, painelAberto.ancora);
    else fecharPainel();
  });

  // O estado pode ter chegado antes deste arquivo: acerta os botões e as mensagens
  if (estado.dados) {
    ganchosDosExtras.escrever(alvoSoParaLer());
    atualizarBotaoDasFixadas();
    if (estado.alvo && !estado.alvo.voz) desenharMensagens();
  }
}

configurarExtras();
