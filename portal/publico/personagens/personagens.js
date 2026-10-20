/* =================================================================
   Crônicas Eternas: Personagens
   -----------------------------------------------------------------
   A galeria de todos os personagens de Draevor: os dos jogadores,
   que têm card na página Mesas, e os NPCs e personagens de mesas
   antigas, cadastrados aqui pelo administrador ou por um editor.
   Os caídos continuam na galeria, como lápides.

   No servidor, conversa com o servidor/personagens.js. Aberta fora
   dele (arquivo no PC ou prévia), usa personagens de exemplo e um
   painel para ver a página como administrador, editor ou jogador.

   Usa o comum.js, carregado antes: pedir(), criar(), avisos, barra
   lateral, status do Foundry, o card com moldura e cinzas. As datas
   vêm do calendario.js, carregado logo depois dele.
   ================================================================= */

const CONFIG = {
  intervaloStatus: 15000, // tempo entre consultas ao estado do Foundry, em ms
};

/* =================================================================
   Conversa com o servidor
   ================================================================= */

const apiDoServidor = {
  galeria: () => pedir("GET", "/api/galeria"),
  estado: () => pedir("GET", "/api/estado", undefined, { silencioso: true }),
  sair: () => pedir("POST", "/api/sair"),
};

/* =================================================================
   Prévia: um portal de mentira, só na memória do navegador
   ================================================================= */

const CONTAS_DA_PREVIA = {
  admin: { usuario: "mestre", nome: "Mestre", cargo: "admin" },
  editor: { usuario: "takezo", nome: "Takezo", cargo: "editor" },
  jogador: { usuario: "neia", nome: "Neia", cargo: "jogador" },
};

// Guardado como no dados.json do servidor; a galeria() monta o que a página recebe
function exemplosDaPrevia() {
  // Um busto desenhado aqui mesmo, para a prévia mostrar capas sem depender de arquivos
  const capaDeExemplo = (fundo, cor) =>
    `data:image/svg+xml,${encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 300"><defs><linearGradient id="f" x1="0" y1="0" x2="0" y2="1">` +
        `<stop offset="0" stop-color="${fundo}"/><stop offset="1" stop-color="#0e0c0b"/></linearGradient></defs>` +
        `<rect width="200" height="300" fill="url(#f)"/><circle cx="100" cy="112" r="34" fill="${cor}"/>` +
        `<path d="M28 300c4-74 36-118 72-118s68 44 72 118z" fill="${cor}"/></svg>`,
    )}`;
  const doPortal = (campos) => ({
    fonte: "gotica",
    capa: null,
    arte: null,
    situacao: "vivo",
    queda: null,
    origem: "",
    resumo: "",
    historia: "",
    ...campos,
  });
  const outro = (campos) => ({
    fonte: "gotica",
    capa: null,
    arte: null,
    papel: "npc",
    jogador: "",
    mesas: [],
    situacao: "vivo",
    queda: null,
    origem: "",
    resumo: "",
    historia: "",
    visibilidade: "todos",
    registradoPor: "mestre",
    registradoNome: "Mestre",
    criadoEm: "2026-10-19T21:00:00.000Z",
    alteradoEm: "2026-10-19T21:00:00.000Z",
    ...campos,
  });
  const ev = (campos) => ({ ate: null, visibilidade: "todos", revelado: false, personagens: [], ...campos });

  return {
    contas: [
      { usuario: "mestre", nome: "Mestre" },
      { usuario: "comuna", nome: "Comuna" },
      { usuario: "takezo", nome: "Takezo" },
      { usuario: "frati", nome: "Frati" },
      { usuario: "neia", nome: "Neia" },
    ],
    campanhas: [
      { id: "ode-to-sleep", nome: "Ode to Sleep", cor: "#2e3756" },
      { id: "remissao", nome: "Remissão do Flagelo Esvanescente", cor: "#5a2a26" },
    ],
    mesasAntigas: [{ id: "antiga-1", nome: "Primeira mesa (exemplo)", cor: "#6b6b45" }],
    // Os mesmos das campanhas de exemplo da página Mesas
    personagens: [
      doPortal({
        id: "p1",
        nome: "Venti",
        dono: "comuna",
        campanha: "ode-to-sleep",
        fonte: "elfica",
        capa: capaDeExemplo("#3a4670", "#9fb0c8"),
        origem: "Meio-elfo, bardo 7",
        resumo: "Bardo errante que toca a noite inteira para a cidade não dormir.",
        historia: "Chegou à cidade com um alaúde rachado e **nenhuma** lembrança de onde veio.\n\nDesde a noite da canção, *não dorme mais*.",
      }),
      doPortal({
        id: "p2",
        nome: "Alisaie",
        dono: "takezo",
        campanha: "ode-to-sleep",
        fonte: "romana",
        capa: capaDeExemplo("#6e332d", "#d8b98a"),
        origem: "Elfa, maga 7",
        resumo: "Estudiosa do Ciclo de Sylara, desconfia de toda melodia antiga.",
        historia: "Viu o guardião da ponte cair e jurou descobrir quem canta na torre.",
      }),
      doPortal({
        id: "p3",
        nome: "Personagem de Frati",
        dono: "frati",
        campanha: "ode-to-sleep",
        situacao: "aposentado",
        origem: "Anão, guerreiro 6",
        resumo: "Pendurou o machado depois da canção e abriu uma forja perto do porto.",
      }),
      doPortal({ id: "p4", nome: "Personagem de Neia", dono: "neia", campanha: "ode-to-sleep" }),
      doPortal({
        id: "p5",
        nome: "Personagem de Comuna",
        dono: "comuna",
        campanha: "remissao",
        situacao: "caido",
        origem: "Humano, ladino 5",
        resumo: "Ninguém anotou o dia em que caiu.",
      }),
      doPortal({
        id: "p6",
        nome: "Personagem de Neia",
        dono: "neia",
        campanha: "remissao",
        capa: capaDeExemplo("#34503a", "#b9c9a4"),
        origem: "Humana, clériga 5",
        resumo: "Atravessou o Passo Negro carregando os feridos nas costas.",
      }),
    ],
    // NPCs cadastrados aqui na galeria
    outrosPersonagens: [
      outro({
        id: "npc-0a1b2c3d",
        nome: "Ysolde, a Guardiã",
        fonte: "uncial",
        capa: capaDeExemplo("#4a5560", "#c8cdd0"),
        mesas: ["antiga-1"],
        situacao: "desaparecido",
        origem: "Humana, paladina",
        resumo: "Desceu às ruínas sob o gelo e nunca mais foi vista.",
      }),
      outro({
        id: "npc-1b2c3d4e",
        nome: "Bram, o guardião da ponte",
        fonte: "ferro",
        capa: capaDeExemplo("#6b4a2e", "#c9a37a"),
        mesas: ["ode-to-sleep"],
        situacao: "caido",
        queda: {
          data: { ano: 365, mes: 4, dia: 22, aprox: false },
          epitafio: "Ninguém passou pela ponte enquanto ele esteve de pé.",
        },
        origem: "Meio-orc, guerreiro",
        resumo: "Guardou a ponte velha por trinta invernos.",
      }),
      outro({
        id: "npc-2c3d4e5f",
        nome: "Dona Hilda",
        fonte: "caligrafia",
        mesas: ["remissao", "ode-to-sleep"],
        origem: "Halfling, estalajadeira",
        resumo: "Dona da Lanterna Torta; sabe de tudo antes de todo mundo.",
        registradoPor: "takezo",
        registradoNome: "Takezo",
      }),
      outro({
        id: "npc-3d4e5f60",
        nome: "A Voz na Torre",
        fonte: "tinta",
        mesas: ["ode-to-sleep"],
        origem: "Desconhecida",
        resumo: "Canta da torre todas as noites. O grupo ainda não a encontrou.",
        visibilidade: "admin",
      }),
    ],
    // Os acontecimentos da Linha do Tempo (os mesmos da prévia de lá) que citam alguém daqui
    acontecimentos: [
      ev({ id: "e7", titulo: "Ruínas encontradas sob o gelo", data: { ano: 331, mes: 9 }, personagens: ["npc-0a1b2c3d"] }),
      ev({
        id: "e8",
        titulo: "O verdadeiro nome do Flagelo",
        data: { ano: 350, mes: 10, dia: 30 },
        visibilidade: "revelar",
        personagens: ["p6"],
      }),
      ev({ id: "e9", titulo: "O grupo atravessa o Passo Negro", data: { ano: 362, mes: 7, dia: 9 }, personagens: ["p5", "p6"] }),
      ev({
        id: "e11",
        titulo: "A canção que adormece a cidade",
        data: { ano: 365, mes: 2, dia: 15 },
        personagens: ["p1", "p2", "p3", "p4", "npc-3d4e5f60"],
      }),
      ev({
        id: "e10",
        titulo: "A morte do guardião da ponte",
        data: { ano: 365, mes: 4, dia: 22 },
        personagens: ["p2", "npc-1b2c3d4e"],
      }),
      ev({
        id: "e12",
        titulo: "O culto se move antes do inverno",
        data: { ano: 366, mes: 6 },
        visibilidade: "admin",
        personagens: ["p1", "npc-3d4e5f60"],
      }),
    ],
  };
}

function criarApiDePrevia() {
  let banco = exemplosDaPrevia();
  let conta = CONTAS_DA_PREVIA.admin;

  // O mesmo formato do servidor/personagens.js
  const dataPublica = (data, comAprox) => {
    const publica = { ano: data.ano, mes: data.mes || null, dia: data.mes && data.dia ? data.dia : null };
    if (comAprox) publica.aprox = Boolean(data.aprox);
    return publica;
  };
  const podeVer = (ev) =>
    conta.cargo === "admin" || (ev.visibilidade !== "admin" && !(ev.visibilidade === "revelar" && !ev.revelado));

  function fichaPublica(p) {
    const queda =
      p.situacao === "caido" && p.queda
        ? { data: p.queda.data ? dataPublica(p.queda.data, true) : null, epitafio: p.queda.epitafio || "" }
        : null;
    return { situacao: p.situacao, queda, origem: p.origem, resumo: p.resumo, historia: p.historia };
  }

  function personagemDoPortal(p) {
    const nomeDono = banco.contas.find((c) => c.usuario === p.dono)?.nome ?? p.dono;
    return {
      id: p.id,
      origemDoDado: "portal",
      nome: p.nome,
      fonte: p.fonte,
      capa: p.capa,
      arte: p.arte,
      papel: "jogador",
      jogador: nomeDono,
      dono: p.dono,
      nomeDono,
      mesas: [p.campanha],
      ...fichaPublica(p),
      visibilidade: "todos",
      podeEditar: conta.cargo === "admin" || p.dono === conta.usuario,
    };
  }

  function outroPublico(p) {
    return {
      id: p.id,
      origemDoDado: "outro",
      nome: p.nome,
      fonte: p.fonte,
      capa: p.capa,
      arte: p.arte,
      papel: p.papel,
      jogador: p.jogador,
      mesas: [...p.mesas],
      ...fichaPublica(p),
      visibilidade: p.visibilidade,
      podeEditar: conta.cargo === "admin" || (conta.cargo === "editor" && p.registradoPor === conta.usuario),
    };
  }

  return {
    trocarConta(cargo) {
      conta = CONTAS_DA_PREVIA[cargo] ?? CONTAS_DA_PREVIA.admin;
    },
    restaurar() {
      banco = exemplosDaPrevia();
    },
    async galeria() {
      await esperar(120);
      const personagens = [
        ...banco.personagens.map(personagemDoPortal),
        ...banco.outrosPersonagens.filter((p) => conta.cargo === "admin" || p.visibilidade !== "admin").map(outroPublico),
      ];
      // Para cada personagem, os acontecimentos que a conta pode ver e que o citam, do mais antigo ao mais recente
      const jornada = Object.fromEntries(personagens.map((p) => [p.id, []]));
      const acontecimentos = banco.acontecimentos.filter(podeVer).sort((a, b) => chaveDaData(a.data) - chaveDaData(b.data));
      for (const ev of acontecimentos) {
        const passo = { id: ev.id, titulo: ev.titulo, data: dataPublica(ev.data, true), ate: ev.ate ? dataPublica(ev.ate, false) : null };
        for (const id of new Set(ev.personagens)) jornada[id]?.push(passo);
      }
      return structuredClone({
        conta: { ...conta },
        mesas: [...banco.campanhas, ...banco.mesasAntigas.map((m) => ({ ...m, antiga: true }))],
        personagens,
        jornada,
      });
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
  personagens: [],
  jornada: {},
  filtros: { mesas: new Set(), papel: "", situacao: "", busca: "" },
};

const ehAdmin = () => estado.conta?.cargo === "admin";
const ehEditor = () => estado.conta?.cargo === "editor";
const podeCadastrar = () => ehAdmin() || ehEditor();

const mesaPorId = (id) => estado.mesas.find((m) => m.id === id);

const ROTULOS_SITUACAO = { vivo: "vivo", caido: "caído", desaparecido: "desaparecido", aposentado: "aposentado" };

// Na galeria: vivos primeiro; depois desaparecidos e aposentados; por último os caídos
const GRUPO_DA_SITUACAO = { vivo: 0, desaparecido: 1, aposentado: 1, caido: 2 };

// Sem mesa, o card sem capa fica na pedra escura
const COR_SEM_MESA = "#2a2520";

/* =================================================================
   Cabeçalho: conta e estado do Foundry
   ================================================================= */

function atualizarTopo() {
  $("#nome-conta").textContent = estado.conta?.nome ?? "";
  const cargo = $("#cargo-conta");
  cargo.hidden = !podeCadastrar();
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

const filtrosAtivos = () => {
  const f = estado.filtros;
  return f.mesas.size + (f.papel ? 1 : 0) + (f.situacao ? 1 : 0) + (f.busca.trim() ? 1 : 0);
};

function passaNosFiltros(personagem) {
  const f = estado.filtros;
  if (f.mesas.size && !personagem.mesas.some((id) => f.mesas.has(id))) return false;
  if (f.papel && personagem.papel !== f.papel) return false;
  if (f.situacao && personagem.situacao !== f.situacao) return false;
  const termo = normalizar(f.busca.trim());
  return !termo || normalizar(`${personagem.nome} ${personagem.resumo}`).includes(termo);
}

// Pela situação e, dentro de cada grupo, pelo nome
function ordenar(a, b) {
  const grupo = (GRUPO_DA_SITUACAO[a.situacao] ?? 0) - (GRUPO_DA_SITUACAO[b.situacao] ?? 0);
  return grupo || a.nome.localeCompare(b.nome, "pt-BR");
}

const personagensVisiveis = () => estado.personagens.filter(passaNosFiltros).sort(ordenar);

function renderizarFiltros() {
  const f = estado.filtros;

  // Mesas: as campanhas e depois as antigas; as que sumiram saem do filtro
  for (const id of [...f.mesas]) if (!mesaPorId(id)) f.mesas.delete(id);
  const mesas = [...estado.mesas].sort((a, b) => Number(Boolean(a.antiga)) - Number(Boolean(b.antiga)));
  const grupo = $("#filtro-mesas");
  grupo.hidden = mesas.length === 0;
  grupo.replaceChildren(
    ...mesas.map((mesa) => {
      const chip = criar("button", "etiqueta-mesa", mesa.nome);
      chip.type = "button";
      chip.dataset.id = mesa.id;
      chip.style.setProperty("--cor", corVisivel(mesa.cor));
      chip.setAttribute("aria-pressed", String(f.mesas.has(mesa.id)));
      if (mesa.antiga) chip.append(criar("small", null, "antiga"));
      chip.addEventListener("click", () => {
        if (f.mesas.has(mesa.id)) f.mesas.delete(mesa.id);
        else f.mesas.add(mesa.id);
        aplicarFiltros();
      });
      return chip;
    }),
  );

  for (const opcao of document.querySelectorAll('#filtro-papel input[name="papel"]')) opcao.checked = opcao.value === f.papel;
  for (const opcao of document.querySelectorAll('#filtro-situacao input[name="situacao"]')) {
    opcao.checked = opcao.value === f.situacao;
  }
  $("#filtro-busca").value = f.busca;
}

function aplicarFiltros() {
  const ativos = filtrosAtivos();
  $("#limpar-filtros").hidden = ativos === 0;
  const contador = $("#filtros-contador");
  contador.hidden = ativos === 0;
  contador.textContent = String(ativos);
  for (const chip of document.querySelectorAll("#filtro-mesas .etiqueta-mesa")) {
    chip.setAttribute("aria-pressed", String(estado.filtros.mesas.has(chip.dataset.id)));
  }
  renderizarGaleria();
}

function limparFiltros() {
  const f = estado.filtros;
  f.mesas.clear();
  f.papel = "";
  f.situacao = "";
  f.busca = "";
  renderizarFiltros();
  aplicarFiltros();
}

/* =================================================================
   A galeria
   ================================================================= */

function etiquetaMesa(mesa) {
  const etiqueta = criar("span", "etiqueta-cor", mesa.nome);
  etiqueta.style.setProperty("--cor", corVisivel(mesa.cor));
  return etiqueta;
}

function seloOculto() {
  const selo = criar("span", "selo-oculto");
  selo.append(simbolo("icone-oculto"), "Só o administrador");
  return selo;
}

// Para leitores de tela, o que a cor e a névoa mostram
function rotuloDoCard(personagem) {
  const partes = [personagem.nome];
  if (personagem.situacao === "caido" && personagem.queda?.data) {
    partes.push(`caiu em ${textoDaData(personagem.queda.data)}`);
  } else if (personagem.situacao !== "vivo") {
    partes.push(ROTULOS_SITUACAO[personagem.situacao] ?? personagem.situacao);
  }
  if (personagem.visibilidade === "admin") partes.push("só o administrador vê");
  return partes.join(", ");
}

// O card das Mesas, na cor da primeira mesa, e abaixo dele o resumo e as mesas
function montarItem(personagem) {
  const mesas = personagem.mesas.map(mesaPorId).filter(Boolean);
  const item = criar("article", "personagem");
  item.dataset.id = personagem.id;

  const card = montarCardComMoldura(personagem, { cor: mesas[0]?.cor ?? COR_SEM_MESA });
  if (personagem.situacao === "caido") {
    card.classList.add("card--caido");
    if (personagem.queda?.data) {
      card.querySelector(".card__nome").after(criar("span", "card__queda", `Caiu em ${textoDaData(personagem.queda.data)}`));
    }
  }
  if (personagem.situacao === "desaparecido") card.classList.add("card--desaparecido");
  if (personagem.visibilidade === "admin") card.classList.add("card--oculto");
  card.setAttribute("aria-label", rotuloDoCard(personagem));
  item.append(card);

  if (personagem.resumo) item.append(criar("p", "personagem__resumo", personagem.resumo));
  const etiquetas = criar("div", "personagem__mesas");
  etiquetas.append(...mesas.map(etiquetaMesa));
  if (personagem.visibilidade === "admin") etiquetas.append(seloOculto());
  if (etiquetas.childElementCount) item.append(etiquetas);
  return item;
}

function renderizarGaleria() {
  const galeria = $("#galeria");
  const visiveis = personagensVisiveis();
  galeria.classList.toggle("galeria--vazia", visiveis.length === 0);
  if (!visiveis.length) {
    const texto = estado.personagens.length ? "Nenhum personagem com esses filtros." : "A galeria ainda não tem personagens.";
    galeria.replaceChildren(criar("p", "galeria-vazia", texto));
    return;
  }
  galeria.replaceChildren(...visiveis.map(montarItem));
}

/* =================================================================
   Carregar e desenhar tudo
   ================================================================= */

function renderizarAcoes() {
  $("#botao-novo").hidden = !podeCadastrar();
}

function renderizarTudo() {
  atualizarTopo();
  renderizarAcoes();
  renderizarFiltros();
  aplicarFiltros();
}

async function recarregar() {
  const dados = await api.galeria();
  Object.assign(estado, {
    conta: dados.conta,
    mesas: dados.mesas,
    personagens: dados.personagens,
    jornada: dados.jornada,
  });
  carregarFontes(estado.personagens.map((p) => p.fonte));
  renderizarTudo();
}

/* =================================================================
   Eventos da página
   ================================================================= */

// O cabeçalho fica preso no alto; a barra lateral precisa saber o tamanho dele
function medirAlturas() {
  const aplicar = () => document.documentElement.style.setProperty("--altura-topo", `${$("#topo").offsetHeight}px`);
  new ResizeObserver(aplicar).observe($("#topo"));
  aplicar();
}

function configurarEventos() {
  $("#filtro-papel").addEventListener("change", (evento) => {
    estado.filtros.papel = evento.target.value;
    aplicarFiltros();
  });
  $("#filtro-situacao").addEventListener("change", (evento) => {
    estado.filtros.situacao = evento.target.value;
    aplicarFiltros();
  });
  let timerBusca;
  $("#filtro-busca").addEventListener("input", (evento) => {
    clearTimeout(timerBusca);
    timerBusca = setTimeout(() => {
      estado.filtros.busca = evento.target.value;
      aplicarFiltros();
    }, 160);
  });
  $("#limpar-filtros").addEventListener("click", limparFiltros);
  $("#filtros-alternar").addEventListener("click", () => {
    const aberto = $("#filtros").classList.toggle("filtros--aberto");
    $("#filtros-alternar").setAttribute("aria-expanded", String(aberto));
  });

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

const NOMES_DOS_CARGOS = { admin: "administrador", editor: "editor", jogador: "jogador" };

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
    avisoRapido(`Agora você vê a página como ${NOMES_DOS_CARGOS[seletor.value]}.`);
  });
  $("#sim-restaurar").addEventListener("click", async () => {
    api.restaurar();
    await recarregar();
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
    $("#galeria").classList.add("galeria--vazia");
    $("#galeria").replaceChildren(criar("p", "galeria-vazia", falha.message));
    return;
  }
  $("#pagina").hidden = false;

  atualizarStatus();
  setInterval(atualizarStatus, CONFIG.intervaloStatus);
}

iniciar();
