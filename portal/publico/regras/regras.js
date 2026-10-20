/* =================================================================
   Crônicas Eternas: Regras da casa
   -----------------------------------------------------------------
   O livro de regras próprias do grupo, em capítulos. Qualquer conta
   lê; só o administrador escreve. As regras avisadas depois da
   última visita da pessoa aparecem como novidade. As datas são do
   mundo real, e não do Ciclo de Sylara.

   No servidor, conversa com o servidor/regras.js. Aberta fora dele
   (arquivo no PC ou prévia), usa regras de exemplo e um painel para
   ver a página como administrador ou jogador.

   Usa o comum.js, carregado antes: pedir(), criar(), avisos, barra
   lateral, status do Foundry, texto formatado e cinzas.
   ================================================================= */

const CONFIG = {
  intervaloStatus: 15000, // tempo entre consultas ao estado do Foundry, em ms
};

/* =================================================================
   Conversa com o servidor
   ================================================================= */

const apiDoServidor = {
  regras: () => pedir("GET", "/api/regras"),
  marcarVisto: () => pedir("POST", "/api/regras/visto", undefined, { silencioso: true }),
  estado: () => pedir("GET", "/api/estado", undefined, { silencioso: true }),
  sair: () => pedir("POST", "/api/sair"),
};

/* =================================================================
   Prévia: um portal de mentira, só na memória do navegador
   ================================================================= */

const CONTAS_DA_PREVIA = {
  admin: { usuario: "mestre", nome: "Mestre", cargo: "admin" },
  jogador: { usuario: "neia", nome: "Neia", cargo: "jogador" },
};

// As datas contam a partir de hoje, para os exemplos parecerem recentes em qualquer dia
function exemplosDaPrevia() {
  const agora = Date.now();
  const diasAtras = (dias) => new Date(agora - dias * 86400000).toISOString();
  // "avisada": há quantos dias a regra foi alterada com o aviso ligado
  const regra = ({ criada, avisada, ...campos }) => {
    const criadaEm = diasAtras(criada);
    const avisadaEm = avisada === undefined ? criadaEm : diasAtras(avisada);
    return { mesas: [], situacao: "vigor", ...campos, criadaEm, alteradaEm: avisadaEm, avisadaEm };
  };

  return {
    mesas: [
      { id: "ode-to-sleep", nome: "Ode to Sleep", cor: "#2e3756" },
      { id: "remissao", nome: "Remissão do Flagelo Esvanescente", cor: "#5a2a26" },
    ],
    capitulos: [
      { id: "cap-combate", nome: "Combate" },
      { id: "cap-descanso", nome: "Descanso e cura" },
      { id: "cap-conduta", nome: "Conduta à mesa" },
    ],
    itens: [
      regra({
        id: "regra-critico",
        capitulo: "cap-combate",
        titulo: "Crítico em 19 e 20",
        texto:
          "Nos ataques com arma, um **19 natural** também é acerto crítico.\n\n" +
          "- Vale para ataques corpo a corpo e à distância.\n" +
          "- Magias de ataque continuam com crítico só no 20.",
        criada: 40,
      }),
      regra({
        id: "regra-flanquear",
        capitulo: "cap-combate",
        titulo: "Flanquear dá vantagem",
        texto:
          "Duas criaturas em lados opostos de um inimigo têm **vantagem** nos ataques corpo a corpo contra ele.\n\n" +
          "*Em teste até o fim do arco atual. Depois o grupo decide se fica.*",
        situacao: "teste",
        criada: 20,
      }),
      regra({
        id: "regra-pocao",
        capitulo: "cap-combate",
        titulo: "Poção como ação bônus",
        texto:
          "Beber uma poção de cura gasta uma **ação bônus**. Dar a poção a outra pessoa continua custando uma ação.\n\n" +
          "Quem bebe usando a ação inteira, em vez da bônus, cura o máximo do dado.",
        criada: 30,
        avisada: 1,
      }),
      regra({
        id: "regra-iniciativa",
        capitulo: "cap-combate",
        titulo: "Iniciativa a cada rodada",
        texto:
          "Todo mundo rolava a iniciativa de novo no começo de cada rodada.\n\n" +
          "*Revogada: deixava o combate lento demais.*",
        situacao: "revogada",
        criada: 50,
        avisada: 25,
      }),
      regra({
        id: "regra-descanso-longo",
        capitulo: "cap-descanso",
        titulo: "Descanso longo só em lugar seguro",
        texto:
          "Para valer como descanso longo, o grupo precisa de:\n\n" +
          "1. um abrigo com porta, muralha ou alguém de guarda;\n" +
          "2. oito horas sem combate;\n" +
          "3. comida e água para todos.\n\n" +
          "Sem isso, conta só como descanso curto.",
        mesas: ["ode-to-sleep"],
        criada: 35,
      }),
      regra({
        id: "regra-dados-de-vida",
        capitulo: "cap-descanso",
        titulo: "Dados de vida no descanso curto",
        texto: "No descanso curto, cada personagem pode gastar até **metade** dos dados de vida, arredondando para cima.",
        criada: 1,
      }),
      regra({
        id: "regra-celular",
        capitulo: "cap-conduta",
        titulo: "Celular longe da mesa",
        texto: "Durante as cenas, o celular fica virado para baixo. Nos intervalos, à vontade.",
        criada: 60,
      }),
      regra({
        id: "regra-ausencia",
        capitulo: "cap-conduta",
        titulo: "Personagem de quem faltou",
        texto:
          "O personagem de quem faltou acompanha o grupo, mas fica em segundo plano:\n\n" +
          "- não morre nem perde itens na sessão;\n" +
          "- não fica com parte do tesouro;\n" +
          "- ganha a experiência normalmente.",
        criada: 45,
      }),
    ],
    // A última visita de cada conta: o que foi avisado depois disso é novidade
    vistasEm: { mestre: diasAtras(3), neia: diasAtras(3) },
  };
}

function criarApiDePrevia() {
  let banco = exemplosDaPrevia();
  let conta = CONTAS_DA_PREVIA.admin;

  return {
    trocarConta(cargo) {
      conta = CONTAS_DA_PREVIA[cargo] ?? CONTAS_DA_PREVIA.admin;
    },
    restaurar() {
      banco = exemplosDaPrevia();
    },
    async regras() {
      await esperar(120);
      const vistasEm = banco.vistasEm[conta.usuario];
      const itens = banco.itens.map((item) => ({
        ...structuredClone(item),
        novidade: Boolean(vistasEm) && Date.parse(item.avisadaEm) > Date.parse(vistasEm),
      }));
      return {
        conta: { ...conta },
        mesas: structuredClone(banco.mesas),
        capitulos: structuredClone(banco.capitulos),
        itens,
        novidades: itens.filter((item) => item.novidade).length,
      };
    },
    async marcarVisto() {
      await esperar(80);
      banco.vistasEm[conta.usuario] = new Date().toISOString();
      return { ok: true };
    },
    async estado() {
      return { online: true, mundoAtivo: "ode-to-sleep", conectados: 0, trocandoPara: null };
    },
    async sair() {
      await esperar(100);
      return {};
    },
  };
}

const api = MODO_PREVIA ? criarApiDePrevia() : apiDoServidor;

/* =================================================================
   Estado e utilidades
   ================================================================= */

const estado = {
  conta: null,
  mesas: [],
  capitulos: [],
  itens: [],
  novidades: 0,
  filtros: { busca: "", mesas: new Set(), revogadas: false },
};

const ehAdmin = () => estado.conta?.cargo === "admin";

const mesaPorId = (id) => estado.mesas.find((m) => m.id === id);
const regraPorId = (id) => estado.itens.find((r) => r.id === id);

// 19/10/2026
const dataCurta = (iso) => new Date(iso).toLocaleDateString("pt-BR");

/* =================================================================
   Cabeçalho: conta e estado do Foundry
   ================================================================= */

function atualizarTopo() {
  $("#nome-conta").textContent = estado.conta?.nome ?? "";
  const cargo = $("#cargo-conta");
  cargo.hidden = !ehAdmin() && estado.conta?.cargo !== "editor";
  cargo.textContent = ehAdmin() ? "administrador" : "editor";
}

async function atualizarStatus() {
  let situacao;
  try {
    situacao = await api.estado();
  } catch {
    situacao = { online: false };
  }
  mostrarStatus(situacao, (mundo) => mesaPorId(mundo)?.nome ?? mundo);
}

/* =================================================================
   Filtros
   ================================================================= */

const filtrosAtivos = () => estado.filtros.mesas.size > 0 || estado.filtros.busca.trim() !== "";

// Com mesas escolhidas, ficam as regras que valem para todas e as que citam alguma delas
function passaNosFiltros(regra) {
  const f = estado.filtros;
  if (f.mesas.size && regra.mesas.length && !regra.mesas.some((id) => f.mesas.has(id))) return false;
  const termo = normalizar(f.busca.trim());
  return !termo || normalizar(`${regra.titulo} ${resumoDe(regra.texto)}`).includes(termo);
}

function renderizarFiltros() {
  const f = estado.filtros;
  for (const id of [...f.mesas]) if (!mesaPorId(id)) f.mesas.delete(id);
  const grupo = $("#filtro-mesas");
  grupo.hidden = estado.mesas.length === 0;
  grupo.replaceChildren(
    ...estado.mesas.map((mesa) => {
      const chip = criar("button", "escolha escolha--mesa", mesa.nome);
      chip.type = "button";
      chip.style.setProperty("--cor", corVisivel(mesa.cor));
      chip.setAttribute("aria-pressed", String(f.mesas.has(mesa.id)));
      chip.addEventListener("click", () => {
        if (f.mesas.has(mesa.id)) f.mesas.delete(mesa.id);
        else f.mesas.add(mesa.id);
        chip.setAttribute("aria-pressed", String(f.mesas.has(mesa.id)));
        renderizarLivro();
      });
      return chip;
    }),
  );
  $("#filtro-busca").value = f.busca;
  $("#filtro-revogadas").checked = f.revogadas;
}

/* =================================================================
   O livro: capítulos e regras
   ================================================================= */

// As regras do capítulo na ordem da página, cada uma com o seu número §. As revogadas, quando
// aparecem, vão para o fim. A busca e as mesas não mudam a numeração: § 2.3 é sempre a mesma
// regra, e o capítulo conta pela posição na lista toda, mesmo que algum antes dele esteja vazio.
function regrasNumeradas(capitulo, posicao) {
  const doCapitulo = estado.itens.filter((r) => r.capitulo === capitulo.id);
  const ativas = doCapitulo.filter((r) => r.situacao !== "revogada");
  const revogadas = estado.filtros.revogadas ? doCapitulo.filter((r) => r.situacao === "revogada") : [];
  return [...ativas, ...revogadas].map((regra, i) => ({ regra, numero: `${posicao}.${i + 1}` }));
}

// Os capítulos que aparecem, só com as regras que passam nos filtros.
// O capítulo vazio aparece só para o administrador, e some quando há filtro.
function capitulosVisiveis() {
  const filtrando = filtrosAtivos();
  return estado.capitulos
    .map((capitulo, i) => {
      const numeradas = regrasNumeradas(capitulo, i + 1);
      return { capitulo, vazio: !numeradas.length, regras: numeradas.filter(({ regra }) => passaNosFiltros(regra)) };
    })
    .filter(({ vazio, regras }) => (filtrando ? regras.length > 0 : !vazio || ehAdmin()));
}

function etiquetaMesa(mesa) {
  const etiqueta = criar("span", "etiqueta-cor", mesa.nome);
  etiqueta.style.setProperty("--cor", corVisivel(mesa.cor));
  return etiqueta;
}

function selosDe(regra) {
  const selos = criar("span", "regra__selos");
  if (regra.situacao === "revogada") selos.append(criar("span", "selo-regra", "Revogada"));
  if (regra.situacao === "teste") selos.append(criar("span", "selo-regra selo-regra--teste", "Em teste"));
  if (regra.novidade) selos.append(criar("span", "selo-regra selo-regra--novidade", "Novidade"));
  // Sem mesas, a regra vale para todas e não leva etiqueta
  for (const id of regra.mesas) {
    const mesa = mesaPorId(id);
    if (mesa) selos.append(etiquetaMesa(mesa));
  }
  return selos;
}

// A data de quando a regra passou a valer como está, ou da última alteração avisada
const dataDaRegra = (regra) =>
  regra.avisadaEm !== regra.criadaEm ? `Alterada em ${dataCurta(regra.avisadaEm)}` : `Desde ${dataCurta(regra.criadaEm)}`;

function cartaoDaRegra({ regra, numero }) {
  const cartao = criar("article", `regra regra--${regra.situacao}`);
  // Os ids já começam com "regra-", e o link fica regras/#regra-xxxxxxxx
  cartao.id = regra.id;

  const cabeca = criar("header", "regra__cabeca");
  cabeca.append(criar("span", "regra__numero", `§ ${numero}`), criar("h3", "regra__titulo", regra.titulo));
  const selos = selosDe(regra);
  if (selos.childElementCount) cabeca.append(selos);

  const texto = criar("div", "regra__texto");
  texto.append(...paragrafosDe(regra.texto));

  const pe = criar("footer", "regra__pe");
  const link = botao("", "botao--leve botao--pequeno regra__link", () => copiarLink(regra));
  link.append(simbolo("icone-corrente"), criar("span", null, "Copiar link"));
  pe.append(criar("span", "regra__data", dataDaRegra(regra)), link);

  cartao.append(cabeca, texto, pe);
  return cartao;
}

function secaoDoCapitulo({ capitulo, vazio, regras }) {
  const secao = criar("section", "capitulo");
  secao.id = capitulo.id;
  secao.append(criar("h2", "capitulo__titulo", capitulo.nome));
  if (vazio) secao.append(criar("p", "capitulo__vazio", "Nenhuma regra neste capítulo ainda."));
  else secao.append(...regras.map(cartaoDaRegra));
  return secao;
}

function divisorOrnamental() {
  const caixa = criar("div", "capitulos__divisor");
  caixa.setAttribute("aria-hidden", "true");
  caixa.append(simbolo("divisor", "divisor"));
  return caixa;
}

function renderizarLivro() {
  const visiveis = capitulosVisiveis();
  const partes = visiveis.flatMap((item, i) => (i ? [divisorOrnamental(), secaoDoCapitulo(item)] : [secaoDoCapitulo(item)]));
  if (!visiveis.length) {
    const mensagem = filtrosAtivos() ? "Nenhuma regra encontrada com esses filtros." : "O livro ainda não tem regras.";
    partes.push(criar("p", "regras-vazio", mensagem));
  }
  $("#capitulos").replaceChildren(...partes);
  renderizarSumario(visiveis);
  agendarRolagem();
}

function renderizarNovidades() {
  const n = estado.novidades;
  const faixa = $("#faixa-novidades");
  faixa.hidden = !n;
  faixa.textContent = `Desde a sua última visita: ${n} ${n === 1 ? "regra nova ou alterada" : "regras novas ou alteradas"}`;
}

/* =================================================================
   Sumário e navegação
   ================================================================= */

function renderizarSumario(visiveis) {
  $("#sumario").hidden = !visiveis.length;
  $("#sumario-lista").replaceChildren(
    ...visiveis.map(({ capitulo }) => {
      const item = criar("li");
      const link = criar("a", "sumario__link", capitulo.nome);
      link.href = `#${capitulo.id}`;
      link.dataset.id = capitulo.id;
      link.addEventListener("click", (evento) => {
        evento.preventDefault();
        irParaCapitulo(capitulo.id);
      });
      item.append(link);
      return item;
    }),
  );
  // No celular, o mesmo sumário numa lista de escolher
  $(".sumario-celular").hidden = !visiveis.length;
  $("#sumario-celular").replaceChildren(...visiveis.map(({ capitulo }) => new Option(capitulo.nome, capitulo.id)));
}

function rolarAte(elemento) {
  const reduzido = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  elemento.scrollIntoView({ behavior: reduzido ? "auto" : "smooth", block: "start" });
}

function irParaCapitulo(id) {
  const secao = document.getElementById(id);
  if (secao) rolarAte(secao);
}

function realcar(cartao) {
  cartao.classList.remove("regra--realce");
  void cartao.offsetWidth;
  cartao.classList.add("regra--realce");
  setTimeout(() => cartao.classList.remove("regra--realce"), 1900);
}

// Link próprio de uma regra. Se ela estiver revogada, as revogadas passam a aparecer.
function irParaRegra(id) {
  const regra = regraPorId(id);
  if (!regra) return;
  if (regra.situacao === "revogada" && !estado.filtros.revogadas) {
    estado.filtros.revogadas = true;
    $("#filtro-revogadas").checked = true;
    renderizarLivro();
  }
  const cartao = document.getElementById(id);
  if (!cartao) return;
  rolarAte(cartao);
  realcar(cartao);
}

async function copiarLink(regra) {
  const link = `${location.origin}${location.pathname}#${regra.id}`;
  try {
    await navigator.clipboard.writeText(link);
    avisoRapido("Link copiado. Quem abrir vai direto nesta regra.");
  } catch {
    avisoRapido(link);
  }
}

// O capítulo atual é o último que já começou acima de um quarto da tela
let rolagemAgendada = false;
function agendarRolagem() {
  if (rolagemAgendada) return;
  rolagemAgendada = true;
  requestAnimationFrame(() => {
    rolagemAgendada = false;
    marcarCapituloAtual();
  });
}

function marcarCapituloAtual() {
  const secoes = [...document.querySelectorAll("#capitulos .capitulo")];
  if (!secoes.length) return;
  const limite = $("#topo").offsetHeight + window.innerHeight * 0.25;
  let atual = secoes[0];
  for (const secao of secoes) if (secao.getBoundingClientRect().top <= limite) atual = secao;
  // Lá no fim da página, o último capítulo fica como atual, mesmo se for curto
  const noFim = window.scrollY > 0 && window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
  if (noFim) atual = secoes.at(-1);

  for (const link of document.querySelectorAll("#sumario-lista .sumario__link")) {
    if (link.dataset.id === atual.id) link.setAttribute("aria-current", "true");
    else link.removeAttribute("aria-current");
  }
  $("#sumario-celular").value = atual.id;
}

/* =================================================================
   Carregar e desenhar tudo
   ================================================================= */

function renderizarTudo() {
  atualizarTopo();
  renderizarNovidades();
  renderizarFiltros();
  renderizarLivro();
}

async function recarregar() {
  const dados = await api.regras();
  Object.assign(estado, {
    conta: dados.conta,
    mesas: dados.mesas,
    capitulos: dados.capitulos,
    itens: dados.itens,
    novidades: dados.novidades ?? 0,
  });
  renderizarTudo();
}

// Chamado depois de desenhar: os selos desta visita continuam na tela, e a próxima visita
// já não mostra como novidade o que a pessoa viu agora
function marcarVisto() {
  api.marcarVisto().catch(() => {});
}

/* =================================================================
   Eventos da página
   ================================================================= */

// O cabeçalho fica preso no alto; o sumário e a barra lateral precisam saber o tamanho dele
function medirAlturas() {
  const aplicar = () => document.documentElement.style.setProperty("--altura-topo", `${$("#topo").offsetHeight}px`);
  new ResizeObserver(aplicar).observe($("#topo"));
  aplicar();
}

function configurarEventos() {
  let timerBusca;
  $("#filtro-busca").addEventListener("input", (evento) => {
    clearTimeout(timerBusca);
    timerBusca = setTimeout(() => {
      estado.filtros.busca = evento.target.value;
      renderizarLivro();
    }, 160);
  });
  $("#filtro-revogadas").addEventListener("change", (evento) => {
    estado.filtros.revogadas = evento.target.checked;
    renderizarLivro();
  });
  $("#sumario-celular").addEventListener("change", (evento) => irParaCapitulo(evento.target.value));

  window.addEventListener("scroll", agendarRolagem, { passive: true });
  window.addEventListener("resize", agendarRolagem);

  $("#botao-sair").addEventListener("click", async () => {
    if (MODO_PREVIA) return avisoRapido("Na prévia, sair não faz nada.");
    try {
      await api.sair();
    } finally {
      irParaEntrada();
    }
  });
}

/* =================================================================
   Painel da prévia
   ================================================================= */

const NOMES_DOS_CARGOS = { admin: "administrador", jogador: "jogador" };

function configurarSimulacao() {
  const painel = $("#simulacao");
  painel.hidden = false;
  const seletor = $("#sim-cargo");
  const resumo = () => {
    $("#simulacao-resumo").textContent = `Prévia · vendo como ${NOMES_DOS_CARGOS[seletor.value]}`;
  };
  resumo();
  seletor.addEventListener("change", async () => {
    api.trocarConta(seletor.value);
    resumo();
    for (const dialogo of document.querySelectorAll("dialog[open]")) dialogo.close();
    await recarregar();
    marcarVisto();
    avisoRapido(`Agora você vê a página como ${NOMES_DOS_CARGOS[seletor.value]}.`);
  });
  $("#sim-restaurar").addEventListener("click", async () => {
    api.restaurar();
    await recarregar();
    marcarVisto();
    avisoRapido("Exemplos restaurados.");
  });
}

/* =================================================================
   Início
   ================================================================= */

async function iniciar() {
  medirAlturas();
  configurarEventos();
  iniciarCinzas(30);
  if (MODO_PREVIA) configurarSimulacao();

  try {
    await recarregar();
  } catch (falha) {
    if (falha.codigo === "sem-sessao") return irParaEntrada({ voltar: true });
    $("#pagina").hidden = false;
    $("#sumario").hidden = true;
    $("#capitulos").replaceChildren(criar("p", "regras-vazio", falha.message));
    return;
  }
  $("#pagina").hidden = false;
  marcarVisto();
  agendarRolagem();

  atualizarStatus();
  setInterval(atualizarStatus, CONFIG.intervaloStatus);

  // Link próprio de uma regra: rola até ela e a destaca por um instante
  const alvo = location.hash.match(/^#(regra-.+)$/)?.[1];
  if (alvo) requestAnimationFrame(() => irParaRegra(decodeURIComponent(alvo)));
}

iniciar();
