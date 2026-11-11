/* =================================================================
   Crônicas Eternas: Mural
   -----------------------------------------------------------------
   As notas que o grupo prega para todos lerem: um quadro de avisos
   de taverna, com os papéis pregados. Cada conta com caderno prega
   até 5 notas do próprio Caderno ("Pregar uma nota", aqui, ou o
   "⋯" da nota no Caderno); toda conta lê. Clicar num papel abre a
   leitura, que tem endereço próprio (#nota-<id>). Quem pregou e o
   administrador tiram a nota do mural.

   No servidor, conversa com o servidor/mural.js (ler o mural e as
   notas para pregar) e com o servidor/caderno.js (pregar e tirar).
   Aberta fora dele (arquivo no PC ou prévia), usa notas de exemplo
   e um painel para ver a página como jogador ou administrador.

   Usa o comum.js, carregado antes (pedir(), criar(), botao(),
   avisos, barra lateral, status do Foundry e cinzas), e o
   desenharMarcas() do marcas.js.
   ================================================================= */

const CONFIG = {
  intervaloStatus: 15000, // tempo entre consultas ao estado do Foundry, em ms
  recarregarDepois: 60000, // ms fora de vista depois dos quais o mural é pedido de novo ao voltar
};

const TITULO_DA_PAGINA = document.title;

/* =================================================================
   Conversa com o servidor
   ================================================================= */

const apiDoServidor = {
  mural: () => pedir("GET", "/api/mural"),
  minhas: () => pedir("GET", "/api/mural/minhas"),
  pregar: (id) => pedir("POST", `${caminhoDe("/api/caderno/notas", id)}/mural`),
  tirar: (id) => pedir("DELETE", `${caminhoDe("/api/caderno/notas", id)}/mural`),
  estado: () => pedir("GET", "/api/estado", undefined, { silencioso: true }),
  sair: () => pedir("POST", "/api/sair"),
};

/* =================================================================
   Prévia: um mural de mentira, só na memória do navegador
   ================================================================= */

const CONTAS_DA_PREVIA = {
  jogador: { usuario: "neia", nome: "Neia", cargo: "jogador" },
  admin: { usuario: "mestre", nome: "Mestre", cargo: "admin" },
};

// A imagem de exemplo: o mesmo desenho da prévia do Caderno
function desenhoDaPrevia(tracos) {
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="270" viewBox="0 0 480 270"><rect width="480" height="270" fill="#1b1714"/>' +
    `<g fill="none" stroke="#c9ab80" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">${tracos}</g></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

const DESENHO_DO_PASSO =
  '<path d="M20 220L120 90L180 160L260 50L350 170L410 110L470 220"/>' +
  '<path d="M60 240C140 200 200 230 250 180S360 150 440 200" stroke="#e8ddc8" stroke-dasharray="4 12"/>' +
  '<circle cx="60" cy="240" r="6"/><circle cx="440" cy="200" r="6"/>';

// O selo de exemplo com foto: uma inicial desenhada num círculo de cor
function fotoDaPrevia(cor, inicial) {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96"><rect width="96" height="96" fill="${cor}"/>` +
    `<circle cx="48" cy="38" r="17" fill="#e8ddc8" fill-opacity=".85"/><path d="M14 96c4-22 18-32 34-32s30 10 34 32Z" fill="#e8ddc8" fill-opacity=".85"/>` +
    `<text x="48" y="45" font-family="Georgia" font-size="20" text-anchor="middle" fill="${cor}">${inicial}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

// As datas contam a partir de hoje, para os exemplos parecerem recentes em qualquer dia.
// As notas da Neia têm os ids da prévia do Caderno.
function exemplosDaPrevia() {
  const agora = Date.now();
  const atras = (dias, horas = 0) => new Date(agora - dias * 86400000 - horas * 3600000).toISOString();
  const pessoas = {
    neia: { nome: "Neia", cor: "#5e5130", foto: null },
    takezo: { nome: "Takezo", cor: "#365c5c", foto: fotoDaPrevia("#365c5c", "T") },
    frati: { nome: "Frati", cor: "#6b3a4a", foto: null },
    mestre: { nome: "Mestre", cor: "#7a4a2e", foto: null },
  };
  // "links": os alvos que a Neia vê; "doAdmin": os que só o administrador vê a mais.
  // "leNoCaderno": as contas que leem a nota no Caderno (o administrador lê todas).
  const notas = [
    {
      id: "nota-5e5500000012",
      titulo: "Sessão 2: o Passo Negro",
      dono: "neia",
      desde: atras(0, 5),
      alteradaEm: atras(1, 3),
      leNoCaderno: ["neia"],
      texto:
        "Saímos de Hando antes do amanhecer, e [[evento:e9|a travessia do Passo Negro]] levou o dia inteiro.\n\n> O guia jura que já atravessou sozinho. Ninguém acredita.\n\nO mapa que o Takezo rabiscou está em [[nota:nota-7e0a00000054|Mapa do Passo Negro]]. #pistas #passo-negro\n\n- [ ] Perguntar a [[personagem:npc-1b2c3d4e|Bram]] sobre a canção\n- [x] Comprar corda",
      links: {
        "evento:e9": { titulo: "O grupo atravessa o Passo Negro" },
        "personagem:npc-1b2c3d4e": { nome: "Bram, o guardião da ponte" },
        "nota:nota-7e0a00000054": { titulo: "Mapa do Passo Negro" },
      },
      embutidas: {},
      imagens: {},
    },
    {
      id: "nota-7e0a00000054",
      titulo: "Mapa do Passo Negro",
      dono: "takezo",
      desde: atras(1, 2),
      alteradaEm: atras(3, 3),
      leNoCaderno: ["takezo", "neia"],
      texto:
        "Rabisquei de memória o caminho que fizemos depois de [[lugar:mapa-7a1e0c3d/marca-7a1e0003|Hando]].\n\n![[imagem:b2c3d4e5f60718293a4b5c6d|O Passo Negro, de memória]]\n\nQuem souber o nome do pico do meio, escreve aqui.",
      links: { "lugar:mapa-7a1e0c3d/marca-7a1e0003": { nome: "Hando", mapa: "Tyrenar" } },
      embutidas: {},
      imagens: { b2c3d4e5f60718293a4b5c6d: desenhoDaPrevia(DESENHO_DO_PASSO) },
    },
    {
      id: "nota-f4a700000071",
      titulo: "Rumores de Westna",
      dono: "frati",
      desde: atras(2, 6),
      alteradaEm: atras(4, 1),
      leNoCaderno: ["frati"],
      texto:
        "Na taverna de [[lugar:mapa-7a1e0c3d/marca-7a1e0000|Westna]] só se fala de [[personagem:npc-3d4e5f60|a Voz na Torre]]. Juntei o que ouvi.\n\n- O ferreiro jura que a voz canta.\n- A dona da taverna diz que é só o vento.\n\nAntes de ir, a lista da Neia:\n\n![[nota:nota-11a900000041|Para a viagem]]",
      links: { "lugar:mapa-7a1e0c3d/marca-7a1e0000": { nome: "Westna", mapa: "Tyrenar" } },
      doAdmin: { "personagem:npc-3d4e5f60": { nome: "A Voz na Torre" } },
      embutidas: {
        "nota-11a900000041": {
          titulo: "Para a viagem",
          texto: "- [ ] Corda nova\n- [x] Óleo para a lanterna\n- [ ] Mapa de Tyrenar",
          dono: { usuario: "neia", nome: "Neia" },
        },
      },
      imagens: {},
    },
    {
      id: "nota-7e0a00000053",
      titulo: "O culto e o inverno",
      dono: "takezo",
      desde: atras(6, 4),
      alteradaEm: atras(6, 5),
      leNoCaderno: ["takezo", "neia"],
      texto:
        "Se [[evento:e12|o culto se mover antes do inverno]], o [[evento:e9|Passo Negro]] fecha antes de voltarmos.\n\nVeja também os [[nota:nota-f4a700000071|rumores de Westna]], que a Frati pregou. #teoria",
      links: {
        "evento:e12": { titulo: "O culto se move antes do inverno" },
        "evento:e9": { titulo: "O grupo atravessa o Passo Negro" },
        "nota:nota-f4a700000071": { titulo: "Rumores de Westna", noMural: true },
      },
      embutidas: {},
      imagens: {},
    },
  ];
  // As notas do caderno da Neia, para "Pregar uma nota": título, pastas e texto
  const caderno = [
    { id: "nota-9a1a00000001", titulo: "Guia das marcas", caminho: "", texto: "Este guia mostra as marcas que o caderno entende. #guia" },
    {
      id: "nota-5e5500000011",
      titulo: "Sessão 1: a ponte",
      caminho: "Sessões",
      texto:
        "Chegamos a [[lugar:mapa-7a1e0c3d/marca-7a1e0003|Hando]] no fim da tarde. O guardião da ponte, [[personagem:npc-1b2c3d4e|Bram]], cobrou o pedágio de sempre e avisou que a névoa andava estranha. #pistas",
      links: {
        "lugar:mapa-7a1e0c3d/marca-7a1e0003": { nome: "Hando", mapa: "Tyrenar" },
        "personagem:npc-1b2c3d4e": { nome: "Bram, o guardião da ponte" },
      },
    },
    { id: "nota-5e5500000012", titulo: "Sessão 2: o Passo Negro", caminho: "Sessões" },
    { id: "nota-d1a700000021", titulo: "Treino com a lança", caminho: "Diário", texto: "Dia calmo. Treinei com a lança de manhã e escrevi uma carta para casa." },
    { id: "nota-9e5000000031", titulo: "Bram, o guardião da ponte", caminho: "Personagens / Hando", texto: "Bram cuida da ponte de Hando há trinta anos.\n\n- Gosta de pão de mel.\n- Não fala do irmão." },
    { id: "nota-11a900000041", titulo: "Para a viagem", caminho: "", texto: "- [ ] Corda nova\n- [x] Óleo para a lanterna\n- [ ] Mapa de Tyrenar" },
    { id: "nota-6a0f00000061", titulo: "A canção do rio", caminho: "", texto: "Bram diz que a canção sobe do rio de Hando nas noites sem lua. #pistas" },
  ];
  return { pessoas, notas, caderno };
}

function criarApiDePrevia() {
  let banco = exemplosDaPrevia();
  let conta = CONTAS_DA_PREVIA.jogador;
  const LIMITE = 5;
  const copia = (valor) => structuredClone(valor);
  const ehAdmin = () => conta.cargo === "admin";
  const doMaisRecente = (a, b) => (a.desde < b.desde ? 1 : a.desde > b.desde ? -1 : 0);
  const enderecoNoMural = (id) => `${enderecoDaPagina("mural")}#nota-${encodeURIComponent(id)}`;

  // Os links como a conta os vê: as notas que ela não lê no Caderno, mas estão no mural, levam ao papel
  function linksPara(nota) {
    const links = { ...nota.links, ...(ehAdmin() ? nota.doAdmin : {}) };
    for (const [chave, alvo] of Object.entries(links)) {
      if (!chave.startsWith("nota:")) continue;
      const id = chave.slice(5);
      const pregada = banco.notas.find((n) => n.id === id);
      const lida = ehAdmin() || pregada?.leNoCaderno.includes(conta.usuario) || (!pregada && !alvo.noMural);
      if (lida) links[chave] = { titulo: alvo.titulo };
      else if (pregada) links[chave] = { titulo: alvo.titulo, publico: enderecoNoMural(id) };
      else delete links[chave];
    }
    return links;
  }

  function notaDoMural(nota) {
    const minha = nota.dono === conta.usuario;
    return {
      id: nota.id,
      titulo: nota.titulo,
      texto: nota.texto,
      desde: nota.desde,
      alteradaEm: nota.alteradaEm,
      dono: { usuario: nota.dono, nome: banco.pessoas[nota.dono].nome },
      minha,
      podeTirar: minha || ehAdmin(),
      noCaderno: ehAdmin() || nota.leNoCaderno.includes(conta.usuario),
      links: linksPara(nota),
      embutidas: nota.embutidas,
      imagens: nota.imagens,
    };
  }

  const naoAchou = () => erroComCodigo("Essa nota não existe ou não foi compartilhada com você.", "nao-encontrado");

  return {
    async mural() {
      await esperar(180);
      const notas = [...banco.notas].sort(doMaisRecente).map(notaDoMural);
      const perfis = {};
      for (const nota of notas) {
        const { cor, foto } = banco.pessoas[nota.dono.usuario];
        perfis[nota.dono.usuario] = { cor, foto };
      }
      return copia({
        conta: { usuario: conta.usuario, nome: conta.nome, cargo: conta.cargo, temCaderno: !ehAdmin() },
        limite: LIMITE,
        notas,
        perfis,
      });
    },
    async minhas() {
      await esperar(150);
      if (ehAdmin()) throw erroComCodigo("O administrador não tem caderno.", "proibido");
      const noMural = new Set(banco.notas.map((n) => n.id));
      const notas = banco.caderno
        .map((n) => ({ id: n.id, titulo: n.titulo, caminho: n.caminho, noMural: noMural.has(n.id) }))
        .sort((a, b) => a.titulo.localeCompare(b.titulo, "pt-BR", { numeric: true }));
      return copia({ notas, noMural: banco.notas.filter((n) => n.dono === conta.usuario).length, limite: LIMITE });
    },
    async pregar(id) {
      await esperar(150);
      if (ehAdmin()) throw erroComCodigo("O administrador só lê os cadernos.", "proibido");
      const nota = banco.caderno.find((n) => n.id === id);
      if (!nota) throw naoAchou();
      if (!banco.notas.some((n) => n.id === id)) {
        if (banco.notas.filter((n) => n.dono === conta.usuario).length >= LIMITE) {
          throw erroComCodigo(`Você já tem ${LIMITE} notas no mural. Tire uma antes de pregar outra.`, "limite-do-mural");
        }
        const quando = new Date().toISOString();
        banco.notas.push({
          id,
          titulo: nota.titulo,
          dono: conta.usuario,
          desde: quando,
          alteradaEm: new Date(Date.now() - 2 * 86400000).toISOString(),
          leNoCaderno: [conta.usuario],
          texto: nota.texto ?? "",
          links: nota.links ?? {},
          embutidas: {},
          imagens: {},
        });
      }
      return { mural: true };
    },
    async tirar(id) {
      await esperar(150);
      const nota = banco.notas.find((n) => n.id === id);
      if (nota && nota.dono !== conta.usuario && !ehAdmin()) {
        throw erroComCodigo(`Só ${banco.pessoas[nota.dono].nome} pode tirar esta nota do mural.`, "proibido");
      }
      if (nota) {
        // A nota da Neia volta para o caderno dela com o texto, para poder ser pregada de novo
        const doCaderno = banco.caderno.find((n) => n.id === id);
        if (doCaderno && !doCaderno.texto) Object.assign(doCaderno, { texto: nota.texto, links: nota.links });
        banco.notas = banco.notas.filter((n) => n !== nota);
      }
      return { mural: false };
    },
    async estado() {
      await esperar(200);
      return { online: true, mundo: "Ode to Sleep", usuarios: 3 };
    },
    async sair() {
      return { ok: true };
    },
    // Só da prévia
    trocarConta(cargo) {
      conta = CONTAS_DA_PREVIA[cargo];
    },
    restaurar() {
      banco = exemplosDaPrevia();
    },
  };
}

const api = MODO_PREVIA ? criarApiDePrevia() : apiDoServidor;

/* =================================================================
   Estado e utilidades
   ================================================================= */

const estado = {
  dados: null, // a resposta do GET /api/mural
  carregadoEm: 0, // quando o mural foi pedido pela última vez (Date.now())
  aberta: null, // o id da nota na leitura, ou null
  minhas: null, // a resposta do GET /api/mural/minhas, com o diálogo de pregar aberto
  ocupado: false, // pregando uma nota: as outras esperam
};

const temCaderno = () => Boolean(estado.dados?.conta.temCaderno);
const ehAdmin = () => estado.dados?.conta.cargo === "admin";

// "11 de novembro", e o ano quando não é o de agora
const FORMATO_DO_DIA = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "long" });
const FORMATO_DO_DIA_E_ANO = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "long", year: "numeric" });
function textoDoDia(iso) {
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return "";
  return (data.getFullYear() === new Date().getFullYear() ? FORMATO_DO_DIA : FORMATO_DO_DIA_E_ANO).format(data);
}

// O giro do papel, de −1,5° a 1,5°, tirado do id: sempre o mesmo para a mesma nota
function giroDe(id) {
  let soma = 0;
  for (const ch of id) soma = (soma * 31 + ch.charCodeAt(0)) >>> 0;
  return ((soma % 301) / 100 - 1.5).toFixed(2);
}

// O selo de quem pregou: a foto do perfil do chat, ou a inicial na cor do perfil
function seloDe(dono) {
  const perfil = estado.dados?.perfis?.[dono.usuario] ?? {};
  if (perfil.foto) return imagem(perfil.foto, "selo selo--foto");
  const selo = criar("span", "selo", (dono.nome.trim()[0] ?? "?").toLocaleUpperCase("pt-BR"));
  selo.setAttribute("aria-hidden", "true");
  if (perfil.cor) selo.style.setProperty("--cor-selo", perfil.cor);
  return selo;
}

const notaDoMural = (id) => estado.dados?.notas.find((n) => n.id === id) ?? null;

/* =================================================================
   Cabeçalho: conta e estado do Foundry
   ================================================================= */

function atualizarTopo() {
  const conta = estado.dados?.conta;
  $("#nome-conta").textContent = conta?.nome ?? "";
  const cargo = $("#cargo-conta");
  cargo.hidden = !ehAdmin() && conta?.cargo !== "editor";
  cargo.textContent = ehAdmin() ? "administrador" : "editor";
}

async function atualizarStatus() {
  let situacao;
  try {
    situacao = await api.estado();
  } catch {
    situacao = { online: false };
  }
  mostrarStatus(situacao);
}

/* =================================================================
   O quadro de avisos
   ================================================================= */

function papel(nota) {
  const aviso = criar("article", "aviso");
  aviso.dataset.id = nota.id;
  aviso.style.setProperty("--giro", `${giroDe(nota.id)}deg`);

  const titulo = criar("h2", "aviso__titulo");
  const abrir = criar("button", "aviso__abrir", nota.titulo);
  abrir.type = "button";
  titulo.id = `aviso-${nota.id}`;
  titulo.append(abrir);
  aviso.setAttribute("aria-labelledby", titulo.id);

  // O começo do texto: só para ver, sem foco nem clique nos links (o clique vai para o papel)
  const trecho = criar("div", "marcas aviso__trecho");
  trecho.inert = true;
  if (nota.texto.trim()) trecho.append(...desenharMarcas(nota.texto, nota, { idDaNota: nota.id }));
  else trecho.append(criar("p", "aviso__vazia", "Esta nota está vazia."));

  const pe = criar("footer", "aviso__pe");
  const quem = criar("span", "aviso__quem");
  quem.append(criar("span", "aviso__nome", nota.dono.nome), criar("span", "aviso__data", `pregada em ${textoDoDia(nota.desde)}`));
  pe.append(seloDe(nota.dono), quem);

  aviso.append(titulo, trecho, pe);
  aviso.addEventListener("click", () => abrirLeitura(nota.id));
  return aviso;
}

function renderizarMural() {
  const { notas, limite } = estado.dados;
  const minhas = notas.filter((n) => n.minha).length;
  $("#acoes-mural").hidden = !temCaderno();
  $("#quantas-minhas").textContent = `${minhas} de ${limite} suas no mural`;
  $("#papeis").replaceChildren(...notas.map(papel));
  $("#papeis").hidden = !notas.length;
  $("#mural-vazio").hidden = notas.length > 0;
  $("#botao-pregar-vazio").hidden = !temCaderno();
}

async function recarregar() {
  estado.dados = await api.mural();
  estado.carregadoEm = Date.now();
  atualizarTopo();
  renderizarMural();
}

/* =================================================================
   A leitura
   ================================================================= */

const ancoraDe = (id) => `#nota-${encodeURIComponent(id)}`;

function idDoEndereco() {
  const achado = location.hash.match(/^#nota-(.+)$/);
  if (!achado) return null;
  try {
    return decodeURIComponent(achado[1]);
  } catch {
    return null;
  }
}

// Tira o #nota-<id> do endereço, sem criar um passo no histórico
function limparEndereco() {
  if (idDoEndereco() !== null) history.replaceState(history.state, "", `${location.pathname}${location.search}`);
}

// "Fe · pregada em 11 de novembro · alterada em 12 de novembro" (a alteração só se veio depois de pregar)
function linhaDeQuem(nota) {
  const partes = [nota.dono.nome, `pregada em ${textoDoDia(nota.desde)}`];
  if (nota.alteradaEm && nota.alteradaEm > nota.desde) partes.push(`alterada em ${textoDoDia(nota.alteradaEm)}`);
  return partes.join(" · ");
}

function abrirLeitura(id) {
  const nota = notaDoMural(id);
  const dialogo = $("#dialogo-leitura");
  if (!nota) {
    if (dialogo.open) dialogo.close();
    limparEndereco();
    avisoRapido("Essa nota não está mais no mural.");
    return;
  }
  estado.aberta = id;
  if (location.hash !== ancoraDe(id)) history.replaceState(history.state, "", ancoraDe(id));
  document.title = `${nota.titulo} · Mural`;
  $("#leitura-titulo").textContent = nota.titulo;
  $("#leitura-quem").textContent = linhaDeQuem(nota);
  const texto = $("#leitura-texto");
  if (nota.texto.trim()) texto.replaceChildren(...desenharMarcas(nota.texto, nota, { idDaNota: nota.id }));
  else texto.replaceChildren(criar("p", "aviso__vazia", "Esta nota está vazia."));

  const caderno = $("#leitura-caderno");
  caderno.hidden = !nota.noCaderno;
  caderno.href = `${enderecoDaPagina("caderno")}${ancoraDe(nota.id)}`;
  $("#leitura-tirar").hidden = !nota.podeTirar;
  if (!dialogo.open) dialogo.showModal();
  texto.scrollTop = 0;
  dialogo.scrollTop = 0;
  $("#leitura-fechar").focus({ preventScroll: true });
}

function aoFecharLeitura() {
  const id = estado.aberta;
  estado.aberta = null;
  document.title = TITULO_DA_PAGINA;
  limparEndereco();
  // O foco volta para o papel que abriu a leitura
  const papelAberto = id && [...document.querySelectorAll(".aviso")].find((a) => a.dataset.id === id);
  papelAberto?.querySelector(".aviso__abrir")?.focus({ preventScroll: true });
}

async function tirarDoMural() {
  const nota = notaDoMural(estado.aberta);
  if (!nota) return;
  if (!nota.minha) {
    const sim = await perguntar({
      titulo: `Tirar do mural a nota de ${nota.dono.nome}?`,
      texto: "Ela continua no caderno de quem pregou.",
      confirmar: "Tirar",
      cancelar: "Cancelar",
    });
    if (!sim) return;
  }
  const botaoTirar = $("#leitura-tirar");
  botaoTirar.disabled = true;
  try {
    await api.tirar(nota.id);
  } catch (falha) {
    botaoTirar.disabled = false;
    return avisarFalha(falha);
  }
  botaoTirar.disabled = false;
  $("#dialogo-leitura").close();
  await recarregarEmSilencio();
  avisoRapido("Nota tirada do mural.");
}

// Abre a nota do endereço, se houver uma
function mostrarEndereco() {
  const id = idDoEndereco();
  if (id === null) {
    if ($("#dialogo-leitura").open) $("#dialogo-leitura").close();
    return;
  }
  if (estado.aberta === id && $("#dialogo-leitura").open) return;
  abrirLeitura(id);
}

/* =================================================================
   Pregar uma nota
   ================================================================= */

function renderizarMinhas() {
  const { notas, noMural, limite } = estado.minhas;
  const cheio = noMural >= limite;
  const limiteTexto = $("#pregar-limite");
  limiteTexto.hidden = !cheio;
  limiteTexto.textContent = cheio ? `Você já tem ${limite} notas no mural. Tire uma antes de pregar outra.` : "";

  const busca = normalizar($("#pregar-busca").value.trim());
  const achadas = busca ? notas.filter((n) => normalizar(n.titulo).includes(busca)) : notas;
  const lista = $("#pregar-lista");
  lista.classList.toggle("pregar__lista--cheia", cheio);
  if (!notas.length) {
    lista.replaceChildren(criar("li", "pregar__nada", "Seu caderno ainda não tem notas."));
    return;
  }
  if (!achadas.length) {
    lista.replaceChildren(criar("li", "pregar__nada", "Nenhuma nota com esse título."));
    return;
  }
  lista.replaceChildren(
    ...achadas.map((nota) => {
      const item = criar("li");
      const escolher = criar("button", "pregar__nota");
      escolher.type = "button";
      escolher.disabled = cheio || nota.noMural;
      const textos = criar("span", "pregar__textos");
      textos.append(criar("span", "pregar__titulo", nota.titulo));
      if (nota.caminho) textos.append(criar("small", "pregar__caminho", nota.caminho));
      escolher.append(textos);
      if (nota.noMural) escolher.append(criar("span", "pregar__no-mural", "no mural"));
      escolher.addEventListener("click", () => pregar(nota.id));
      item.append(escolher);
      return item;
    }),
  );
}

async function abrirPregar() {
  const dialogo = $("#dialogo-pregar");
  $("#pregar-busca").value = "";
  $("#pregar-situacao").textContent = "Abrindo as suas notas…";
  $("#pregar-limite").hidden = true;
  $("#pregar-lista").replaceChildren();
  dialogo.showModal();
  try {
    estado.minhas = await api.minhas();
  } catch (falha) {
    $("#pregar-situacao").textContent = falha.message;
    return;
  }
  if (!dialogo.open) return;
  $("#pregar-situacao").textContent = "";
  renderizarMinhas();
  $("#pregar-busca").focus();
}

// Escolher prega na hora: o diálogo fecha, o mural recarrega e o papel novo ganha o foco
async function pregar(id) {
  if (estado.ocupado) return;
  estado.ocupado = true;
  for (const escolher of document.querySelectorAll(".pregar__nota")) escolher.disabled = true;
  $("#pregar-situacao").textContent = "Pregando…";
  try {
    await api.pregar(id);
  } catch (falha) {
    estado.ocupado = false;
    $("#pregar-situacao").textContent = "";
    renderizarMinhas();
    return avisarFalha(falha);
  }
  estado.ocupado = false;
  $("#dialogo-pregar").close();
  await recarregarEmSilencio();
  avisoRapido("Nota pregada no mural.");
  const novo = [...document.querySelectorAll(".aviso")].find((a) => a.dataset.id === id);
  if (novo) {
    novo.scrollIntoView({ block: "center", behavior: "smooth" });
    novo.querySelector(".aviso__abrir").focus({ preventScroll: true });
  }
}

/* =================================================================
   Carregar
   ================================================================= */

// Depois de pregar ou tirar, e ao voltar a ficar à vista: a falha só avisa, sem apagar o mural
async function recarregarEmSilencio() {
  try {
    await recarregar();
  } catch (falha) {
    if (falha.codigo === "sem-sessao") return;
    avisoRapido(`O mural não atualizou. ${falha.message}`);
  }
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
  $("#botao-pregar").addEventListener("click", abrirPregar);
  $("#botao-pregar-vazio").addEventListener("click", abrirPregar);
  $("#pregar-cancelar").addEventListener("click", () => $("#dialogo-pregar").close());
  $("#pregar-busca").addEventListener("input", () => estado.minhas && renderizarMinhas());
  $("#dialogo-pregar").addEventListener("close", () => (estado.minhas = null));

  const leitura = $("#dialogo-leitura");
  $("#leitura-fechar").addEventListener("click", () => leitura.close());
  $("#leitura-tirar").addEventListener("click", tirarDoMural);
  leitura.addEventListener("close", aoFecharLeitura);
  fecharAoClicarFora(leitura);
  fecharAoClicarFora($("#dialogo-pregar"));

  // De volta à vista depois de mais de um minuto: o mural pode ter mudado
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible" || !estado.dados) return;
    if (Date.now() - estado.carregadoEm > CONFIG.recarregarDepois) recarregarEmSilencio();
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

const NOMES_DOS_CARGOS = { admin: "administrador", jogador: "jogador" };

function configurarSimulacao() {
  $("#simulacao").hidden = false;
  const seletor = $("#sim-cargo");
  const resumo = () => {
    $("#simulacao-resumo").textContent = `Prévia · vendo como ${NOMES_DOS_CARGOS[seletor.value]}`;
  };
  resumo();
  seletor.addEventListener("change", async () => {
    api.trocarConta(seletor.value);
    resumo();
    for (const dialogo of document.querySelectorAll("dialog[open]")) dialogo.close();
    await recarregarEmSilencio();
    avisoRapido(`Agora você vê a página como ${NOMES_DOS_CARGOS[seletor.value]}.`);
  });
  $("#sim-restaurar").addEventListener("click", async () => {
    api.restaurar();
    for (const dialogo of document.querySelectorAll("dialog[open]")) dialogo.close();
    await recarregarEmSilencio();
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
    $("#papeis").hidden = true;
    $("#mural-vazio").hidden = false;
    $(".quadro__vazio-texto").textContent = falha.message;
    return;
  }
  $("#pagina").hidden = false;

  atualizarStatus();
  setInterval(atualizarStatus, CONFIG.intervaloStatus);

  // Link direto para uma nota: já abre a leitura. Um link para outro papel, também.
  window.addEventListener("hashchange", mostrarEndereco);
  mostrarEndereco();
}

iniciar();
