/* =================================================================
   Crônicas Eternas: Linha do Tempo
   -----------------------------------------------------------------
   A história de Draevor, do ano atual do mundo, no alto, até o
   Expurgo Demoníaco, no ano 0 ED, lá embaixo. As datas seguem o
   Ciclo de Sylara: 10 meses de 30 dias, em 3 dezenas cada.

   No servidor, conversa com o servidor.js. Aberta fora dele (arquivo
   no PC ou prévia), usa acontecimentos de exemplo e um painel para
   ver a página como administrador, editor ou jogador.

   Usa o comum.js, carregado antes: pedir(), criar(), avisos, barra
   lateral, status do Foundry, texto formatado e cinzas. As datas e a
   lua vêm do calendario.js, carregado logo depois dele.
   ================================================================= */

const CONFIG = {
  intervaloStatus: 15000, // tempo entre consultas ao estado do Foundry, em ms
  limiteIntervalo: 10, // a partir de quantos anos vazios a linha mostra o intervalo
};

/* =================================================================
   Tipos de acontecimento e glifos
   ================================================================= */

const TIPOS_PADRAO = [
  { id: "marco", nome: "Marco", glifo: "marco", padrao: true },
  { id: "guerra", nome: "Guerra", glifo: "guerra", padrao: true },
  { id: "queda", nome: "Queda", glifo: "queda", padrao: true },
  { id: "fundacao", nome: "Fundação", glifo: "fundacao", padrao: true },
  { id: "catastrofe", nome: "Catástrofe", glifo: "catastrofe", padrao: true },
  { id: "poder", nome: "Poder", glifo: "poder", padrao: true },
  { id: "pacto", nome: "Pacto", glifo: "pacto", padrao: true },
  { id: "arcano", nome: "Arcano", glifo: "arcano", padrao: true },
  { id: "descoberta", nome: "Descoberta", glifo: "descoberta", padrao: true },
  { id: "feito", nome: "Feito", glifo: "feito", padrao: true },
];

const GLIFOS = [
  ...TIPOS_PADRAO.map((t) => t.glifo),
  "lua",
  "olho",
  "escudo",
  "montanha",
  "sol",
  "gota",
  "navio",
  "torre",
];

/* =================================================================
   Conversa com o servidor
   ================================================================= */

// Os dados vão como JSON; a imagem, se houver, vai junto como arquivo
function formularioDe(dados) {
  const { imagem, ...resto } = dados;
  const form = new FormData();
  form.append("dados", JSON.stringify(resto));
  if (imagem) form.append("imagem", imagem);
  return form;
}

const apiDoServidor = {
  linha: () => pedir("GET", "/api/linha"),
  estado: () => pedir("GET", "/api/estado", undefined, { silencioso: true }),
  sair: () => pedir("POST", "/api/sair"),
  registrar: (dados) => pedir("POST", "/api/linha/acontecimentos", formularioDe(dados)),
  alterar: (id, dados) => pedir("PUT", caminhoDe("/api/linha/acontecimentos", id), formularioDe(dados)),
  apagar: (id) => pedir("DELETE", caminhoDe("/api/linha/acontecimentos", id)),
  adicionarFrase: (id, frase) => pedir("POST", `${caminhoDe("/api/linha/acontecimentos", id)}/frases`, frase),
  apagarFrase: (id, idFrase) => pedir("DELETE", caminhoDe(`${caminhoDe("/api/linha/acontecimentos", id)}/frases`, idFrase)),
  revelar: (id) => pedir("POST", `${caminhoDe("/api/linha/acontecimentos", id)}/revelar`),
  decidir: (id, aprovar) => pedir("POST", `${caminhoDe("/api/linha/pendencias", id)}/${aprovar ? "aprovar" : "recusar"}`),
  mudarAnoAtual: (ano) => pedir("PUT", "/api/linha/ano-atual", { ano }),
  criarTipo: (tipo) => pedir("POST", "/api/linha/tipos", tipo),
  apagarTipo: (id) => pedir("DELETE", caminhoDe("/api/linha/tipos", id)),
  salvarMesaAntiga: (mesa) => pedir(mesa.id ? "PUT" : "POST", caminhoDe("/api/linha/mesas-antigas", mesa.id), mesa),
  apagarMesaAntiga: (id) => pedir("DELETE", caminhoDe("/api/linha/mesas-antigas", id)),
};

/* =================================================================
   Prévia: um portal de mentira, só na memória do navegador
   ================================================================= */

const CONTAS_DA_PREVIA = {
  admin: { usuario: "mestre", nome: "Mestre", cargo: "admin" },
  editor: { usuario: "takezo", nome: "Takezo", cargo: "editor" },
  jogador: { usuario: "neia", nome: "Neia", cargo: "jogador" },
};

function exemplosDaPrevia() {
  // Um busto desenhado aqui mesmo, para a prévia mostrar retratos sem depender de arquivos
  const retratoDeExemplo = (fundo, cor) =>
    `data:image/svg+xml,${encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect width="40" height="40" fill="${fundo}"/>` +
        `<circle cx="20" cy="15" r="7" fill="${cor}"/><path d="M5 40c1-10 8-15 15-15s14 5 15 15z" fill="${cor}"/></svg>`,
    )}`;
  const ev = (campos) => ({
    mesas: [],
    personagens: [],
    descricao: "",
    imagem: null,
    frases: [],
    visibilidade: "todos",
    importancia: "comum",
    ate: null,
    registradoPor: "Mestre",
    ...campos,
  });
  return {
    anoAtual: 366,
    tipos: TIPOS_PADRAO.map((t) => ({ ...t })),
    mesas: [
      { id: "ode-to-sleep", nome: "Ode to Sleep", cor: "#2e3756" },
      { id: "remissao", nome: "Remissão do Flagelo Esvanescente", cor: "#5a2a26" },
      { id: "antiga-1", nome: "Primeira mesa (exemplo)", cor: "#6b6b45", antiga: true },
    ],
    personagens: [
      ...[
        { id: "p1", nome: "Venti", campanha: "ode-to-sleep", imagem: retratoDeExemplo("#2e3756", "#9fb0c8") },
        { id: "p2", nome: "Alisaie", campanha: "ode-to-sleep", imagem: retratoDeExemplo("#5a2a26", "#d8b98a") },
        { id: "p3", nome: "Personagem de Frati", campanha: "ode-to-sleep" },
        { id: "p4", nome: "Personagem de Neia", campanha: "ode-to-sleep" },
        { id: "p5", nome: "Personagem de Comuna", campanha: "remissao" },
        { id: "p6", nome: "Personagem de Neia", campanha: "remissao" },
      ].map((p) => ({ imagem: null, ...p, mesas: [p.campanha] })),
      // Um NPC cadastrado na página Personagens, de uma mesa antiga
      { id: "npc-0a1b2c3d", nome: "Ysolde, a Guardiã", imagem: null, mesas: ["antiga-1"] },
    ],
    acontecimentos: [
      ev({
        id: "origem",
        origem: true,
        titulo: "O Expurgo Demoníaco",
        data: { ano: 0 },
        tipo: "marco",
        importancia: "marco",
        registradoPor: "o portal",
      }),
      ev({
        id: "e1",
        titulo: "Os sobreviventes erguem a primeira muralha",
        data: { ano: 14, aprox: true },
        tipo: "fundacao",
        descricao: "Exemplo de data aproximada: ninguém sabe o dia exato, só que foi por volta do ano 14.",
      }),
      ev({
        id: "e2",
        titulo: "A Peste Cinzenta",
        data: { ano: 61, mes: 8 },
        ate: { ano: 64, mes: 3 },
        tipo: "catastrofe",
        importancia: "marco",
        descricao: "Exemplo de acontecimento que dura um período, de Umbriel de 61 ED a Ignarion de 64 ED.",
      }),
      ev({
        id: "e3",
        titulo: "O eclipse de Sylara",
        data: { ano: 118, mes: 1, dia: 1 },
        tipo: "arcano",
        descricao: "Exemplo do tipo Arcano, o único com o glifo em azul. Caiu no primeiro dia do ano, o dia de Sylara.",
      }),
      ev({
        id: "e4",
        titulo: "A Guerra dos Sete Invernos",
        data: { ano: 154 },
        ate: { ano: 161 },
        tipo: "guerra",
        importancia: "marco",
        descricao: "**Sete invernos** de cerco entre os reinos do norte.\n\nExemplo de marco maior que dura um período, só com os anos.",
        frases: [{ id: "f1", texto: "Que o gelo guarde os nossos mortos.", autor: "Um capitão do norte", por: "mestre" }],
      }),
      ev({
        id: "e5",
        titulo: "O Pacto das Três Coroas",
        data: { ano: 203, mes: 5, dia: 16 },
        tipo: "pacto",
        descricao: "Exemplo de data completa, numa noite de Lua Cheia.",
      }),
      ev({
        id: "e6",
        titulo: "A queda da rainha de cinzas",
        data: { ano: 288 },
        tipo: "queda",
        descricao: "Exemplo de queda: o card vira uma lápide sem cor.",
      }),
      ev({
        id: "e7",
        titulo: "Ruínas encontradas sob o gelo",
        data: { ano: 331, mes: 9 },
        tipo: "descoberta",
        mesas: ["antiga-1"],
        personagens: ["npc-0a1b2c3d"],
        descricao: "Exemplo de mesa antiga citada: ela entra só com nome e cor.",
      }),
      ev({
        id: "e8",
        titulo: "O verdadeiro nome do Flagelo",
        data: { ano: 350, mes: 10, dia: 30 },
        tipo: "descoberta",
        importancia: "marco",
        visibilidade: "revelar",
        revelado: false,
        mesas: ["remissao"],
        descricao: "Exemplo de segredo: os jogadores veem só um card selado até o administrador revelar.",
      }),
      ev({
        id: "e9",
        titulo: "O grupo atravessa o Passo Negro",
        data: { ano: 362, mes: 7, dia: 9 },
        tipo: "feito",
        mesas: ["remissao"],
        personagens: ["p5", "p6"],
        registradoPor: "Takezo",
        descricao: "Exemplo de feito de uma mesa, com personagens citados. Há uma alteração pedida por um editor esperando aprovação.",
      }),
      ev({
        id: "e10",
        titulo: "A morte do guardião da ponte",
        data: { ano: 365, mes: 4, dia: 22 },
        tipo: "queda",
        mesas: ["ode-to-sleep"],
        personagens: ["p2"],
        descricao: "Exemplo de queda de um NPC numa mesa atual.",
      }),
      ev({
        id: "e11",
        titulo: "A canção que adormece a cidade",
        data: { ano: 365, mes: 2, dia: 15 },
        tipo: "arcano",
        importancia: "marco",
        mesas: ["ode-to-sleep"],
        personagens: ["p1", "p2", "p3", "p4"],
        descricao: "Uma melodia antiga ecoa pelas ruas, e a cidade inteira dorme por três dias.\n\nExemplo de marco maior de uma mesa atual, com frase marcante.",
        frases: [
          { id: "f2", texto: "Durmam. Eu canto por vocês.", autor: "Uma voz na torre", por: "mestre" },
          { id: "f3", texto: "Alguém mais ouviu um alaúde?", autor: "Alisaie", por: "neia" },
        ],
      }),
      ev({
        id: "e12",
        titulo: "O culto se move antes do inverno",
        data: { ano: 366, mes: 6 },
        tipo: "poder",
        visibilidade: "admin",
        mesas: ["ode-to-sleep"],
        descricao: "Exemplo de anotação que só o administrador vê.",
      }),
    ],
    pendencias: [
      {
        id: "pend-1",
        acontecimento: "e9",
        acao: "alterar",
        por: "Takezo",
        dados: { titulo: "O grupo atravessa o Passo Negro sob a neve" },
      },
    ],
  };
}

function criarApiDePrevia() {
  let banco = exemplosDaPrevia();
  let conta = CONTAS_DA_PREVIA.admin;
  let proximoId = 100;

  const esperar = (ms) => new Promise((resolver) => setTimeout(resolver, ms));
  const copia = (valor) => structuredClone(valor);
  const proibido = () => erroComCodigo("Sua conta não pode fazer isso.", "proibido");
  const achar = (id) => {
    const ev = banco.acontecimentos.find((a) => a.id === id);
    if (!ev) throw erroComCodigo("Esse acontecimento não existe mais.", "nao-encontrado");
    return ev;
  };
  const ehAdmin = () => conta.cargo === "admin";
  const podeRegistrar = () => conta.cargo === "admin" || conta.cargo === "editor";

  function validar(dados, origem = false) {
    if (!String(dados.titulo || "").trim()) throw erroComCodigo("Escreva o título do acontecimento.");
    if (origem) return;
    const { ano } = dados.data;
    if (!Number.isInteger(ano) || ano < 0 || ano > banco.anoAtual) {
      throw erroComCodigo(`O ano precisa ficar entre 0 e ${banco.anoAtual} ED.`);
    }
    if (dados.ate && (dados.ate.ano > banco.anoAtual || chaveDaData(dados.ate) < chaveDaData(dados.data))) {
      throw erroComCodigo("O período precisa terminar depois de começar e até o ano atual.");
    }
    if (!banco.tipos.some((t) => t.id === dados.tipo)) throw erroComCodigo("Escolha um tipo da lista.");
  }

  // A imagem da prévia vira um endereço temporário do próprio navegador
  function imagemDe(dados, atual) {
    if (dados.removerImagem) return null;
    if (dados.imagem instanceof File) return URL.createObjectURL(dados.imagem);
    return atual ?? null;
  }

  function aplicar(ev, dados) {
    const imagem = imagemDe(dados, ev.imagem);
    const { removerImagem, frase, ...resto } = dados;
    Object.assign(ev, resto, { imagem });
    if (ev.origem) ev.data = { ano: 0 };
  }

  return {
    trocarConta(cargo) {
      conta = CONTAS_DA_PREVIA[cargo] ?? CONTAS_DA_PREVIA.admin;
    },
    restaurar() {
      banco = exemplosDaPrevia();
    },
    async linha() {
      await esperar(120);
      const admin = ehAdmin();
      const comPendencia = new Set(banco.pendencias.map((p) => p.acontecimento));
      const acontecimentos = banco.acontecimentos.flatMap((ev) => {
        if (ev.visibilidade === "admin" && !admin) return [];
        if (ev.visibilidade === "revelar" && !ev.revelado && !admin) {
          return [{ id: ev.id, selado: true, data: { ano: ev.data.ano }, importancia: "comum" }];
        }
        const frases = ev.frases.map(({ por, ...frase }) => ({ ...frase, podeApagar: admin || por === conta.usuario }));
        return [{ ...copia(ev), frases, pendente: conta.cargo !== "jogador" && comPendencia.has(ev.id) }];
      });
      return {
        conta: { ...conta },
        anoAtual: banco.anoAtual,
        tipos: copia(banco.tipos),
        mesas: copia(banco.mesas),
        personagens: copia(banco.personagens),
        acontecimentos,
        pendencias: admin ? copia(banco.pendencias) : [],
      };
    },
    async estado() {
      return { online: true, mundoAtivo: "ode-to-sleep", conectados: 0, trocandoPara: null };
    },
    async sair() {
      await esperar(100);
      return {};
    },
    async registrar(dados) {
      await esperar(220);
      if (!podeRegistrar()) throw proibido();
      validar(dados);
      const ev = {
        id: `e${proximoId++}`,
        frases: [],
        registradoPor: conta.nome,
        revelado: false,
      };
      aplicar(ev, { ...dados, visibilidade: ehAdmin() ? dados.visibilidade : "todos" });
      if (dados.frase?.texto) {
        ev.frases.push({ id: `f${proximoId++}`, texto: dados.frase.texto, autor: dados.frase.autor, por: conta.usuario });
      }
      banco.acontecimentos.push(ev);
      return { acontecimento: { id: ev.id } };
    },
    async alterar(id, dados) {
      await esperar(220);
      if (!podeRegistrar()) throw proibido();
      const ev = achar(id);
      validar(dados, ev.origem);
      if (ehAdmin()) {
        aplicar(ev, dados);
        return { pendente: false };
      }
      // O editor altera direto, sem mudar quem vê; o pedido de alteração que ele tinha some
      aplicar(ev, { ...dados, visibilidade: ev.visibilidade });
      banco.pendencias = banco.pendencias.filter(
        (p) => !(p.acontecimento === id && p.por === conta.nome && p.acao === "alterar")
      );
      return { pendente: false };
    },
    async apagar(id) {
      await esperar(200);
      if (!podeRegistrar()) throw proibido();
      const ev = achar(id);
      if (ev.origem) throw erroComCodigo("O Expurgo Demoníaco é a origem da linha e não pode ser apagado.");
      if (ehAdmin()) {
        banco.acontecimentos = banco.acontecimentos.filter((a) => a.id !== id);
        banco.pendencias = banco.pendencias.filter((p) => p.acontecimento !== id);
        return { pendente: false };
      }
      banco.pendencias = banco.pendencias.filter((p) => !(p.acontecimento === id && p.por === conta.nome));
      banco.pendencias.push({ id: `pend-${proximoId++}`, acontecimento: id, acao: "apagar", por: conta.nome });
      return { pendente: true };
    },
    async adicionarFrase(id, frase) {
      await esperar(160);
      if (!String(frase.texto || "").trim()) throw erroComCodigo("Escreva a frase.");
      achar(id).frases.push({
        id: `f${proximoId++}`,
        texto: frase.texto.trim(),
        autor: String(frase.autor || "").trim(),
        por: conta.usuario,
      });
      return {};
    },
    async apagarFrase(id, idFrase) {
      await esperar(140);
      const ev = achar(id);
      const frase = ev.frases.find((f) => f.id === idFrase);
      if (!frase) throw erroComCodigo("Essa frase já foi apagada.");
      if (!ehAdmin() && frase.por !== conta.usuario) throw proibido();
      ev.frases = ev.frases.filter((f) => f !== frase);
      return {};
    },
    async revelar(id) {
      await esperar(160);
      if (!ehAdmin()) throw proibido();
      achar(id).revelado = true;
      return {};
    },
    async decidir(idPendencia, aprovar) {
      await esperar(180);
      if (!ehAdmin()) throw proibido();
      const pendencia = banco.pendencias.find((p) => p.id === idPendencia);
      if (!pendencia) throw erroComCodigo("Esse pedido já foi resolvido.");
      banco.pendencias = banco.pendencias.filter((p) => p !== pendencia);
      if (!aprovar) return {};
      if (pendencia.acao === "apagar") {
        banco.acontecimentos = banco.acontecimentos.filter((a) => a.id !== pendencia.acontecimento);
        banco.pendencias = banco.pendencias.filter((p) => p.acontecimento !== pendencia.acontecimento);
      } else {
        const ev = achar(pendencia.acontecimento);
        const { imagemNova, removerImagem, frase, ...dados } = pendencia.dados;
        Object.assign(ev, dados);
        if (ev.origem) ev.data = { ano: 0 };
        if (removerImagem) ev.imagem = null;
        if (imagemNova) ev.imagem = imagemNova;
      }
      return {};
    },
    async mudarAnoAtual(ano) {
      await esperar(160);
      if (!ehAdmin()) throw proibido();
      const ultimo = Math.max(...banco.acontecimentos.map((a) => Math.max(a.data.ano, a.ate?.ano ?? 0)));
      if (!Number.isInteger(ano) || ano < 0) throw erroComCodigo("Escreva um ano inteiro, de 0 em diante.");
      if (ano < ultimo) throw erroComCodigo(`Há acontecimentos registrados até ${ultimo} ED. O ano atual não pode ficar antes deles.`);
      banco.anoAtual = ano;
      return {};
    },
    async criarTipo(tipo) {
      await esperar(160);
      if (!ehAdmin()) throw proibido();
      const nome = String(tipo.nome || "").trim();
      if (!nome) throw erroComCodigo("Dê um nome ao tipo.");
      if (banco.tipos.some((t) => normalizar(t.nome) === normalizar(nome))) throw erroComCodigo("Já existe um tipo com esse nome.");
      banco.tipos.push({ id: `tipo-${proximoId++}`, nome, glifo: GLIFOS.includes(tipo.glifo) ? tipo.glifo : "marco" });
      return {};
    },
    async apagarTipo(id) {
      await esperar(160);
      if (!ehAdmin()) throw proibido();
      const tipo = banco.tipos.find((t) => t.id === id);
      if (!tipo || tipo.padrao) throw erroComCodigo("Os tipos que vêm com a página não podem ser apagados.");
      if (banco.acontecimentos.some((a) => a.tipo === id)) throw erroComCodigo("Esse tipo ainda é usado por algum acontecimento.");
      banco.tipos = banco.tipos.filter((t) => t.id !== id);
      return {};
    },
    async salvarMesaAntiga(mesa) {
      await esperar(160);
      if (!ehAdmin()) throw proibido();
      const nome = String(mesa.nome || "").trim();
      if (!nome) throw erroComCodigo("Dê um nome à mesa.");
      if (mesa.id) {
        Object.assign(banco.mesas.find((m) => m.id === mesa.id), { nome, cor: mesa.cor });
      } else {
        banco.mesas.push({ id: `antiga-${proximoId++}`, nome, cor: mesa.cor, antiga: true });
      }
      return {};
    },
    async apagarMesaAntiga(id) {
      await esperar(160);
      if (!ehAdmin()) throw proibido();
      banco.mesas = banco.mesas.filter((m) => m.id !== id);
      for (const ev of banco.acontecimentos) ev.mesas = ev.mesas.filter((m) => m !== id);
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
  anoAtual: 0,
  tipos: [],
  mesas: [],
  personagens: [],
  acontecimentos: [],
  pendencias: [],
  filtros: { mesas: new Set(), tipos: new Set(), personagem: "", soMarcos: false, busca: "" },
};

const ehAdmin = () => estado.conta?.cargo === "admin";
const ehEditor = () => estado.conta?.cargo === "editor";
const podeRegistrar = () => ehAdmin() || ehEditor();

const tipoPorId = (id) => estado.tipos.find((t) => t.id === id);
const mesaPorId = (id) => estado.mesas.find((m) => m.id === id);
const personagemPorId = (id) => estado.personagens.find((p) => p.id === id);
const acontecimentoPorId = (id) => estado.acontecimentos.find((a) => a.id === id);
const pendenciaDe = (id) => estado.pendencias.find((p) => p.acontecimento === id);

// Um pequeno desenho da lua Drae'mora na fase do dia
function iconeLua(fase) {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("class", "lua");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", FASES[fase]);
  const titulo = document.createElementNS(ns, "title");
  titulo.textContent = FASES[fase];
  const borda = document.createElementNS(ns, "circle");
  borda.setAttribute("cx", "8");
  borda.setAttribute("cy", "8");
  borda.setAttribute("r", "6.4");
  borda.setAttribute("class", "lua__borda");
  svg.append(titulo, borda);
  if (fase !== "nova") {
    const luz = document.createElementNS(ns, fase === "cheia" ? "circle" : "path");
    if (fase === "cheia") {
      luz.setAttribute("cx", "8");
      luz.setAttribute("cy", "8");
      luz.setAttribute("r", "5.2");
    } else {
      luz.setAttribute("d", fase === "crescente" ? "M8 2.8a5.2 5.2 0 0 1 0 10.4Z" : "M8 2.8a5.2 5.2 0 0 0 0 10.4Z");
    }
    luz.setAttribute("class", "lua__luz");
    svg.append(luz);
  }
  return svg;
}

// Nomes repetidos ganham a primeira mesa do personagem, para desempatar
function nomeDoPersonagem(personagem) {
  const repetidos = estado.personagens.filter((p) => p.nome === personagem.nome).length > 1;
  if (!repetidos) return personagem.nome;
  const mesa = personagem.mesas.map(mesaPorId).find(Boolean);
  return mesa ? `${personagem.nome} (${mesa.nome})` : personagem.nome;
}

/* =================================================================
   Cabeçalho: conta e estado do Foundry
   ================================================================= */

function atualizarTopo() {
  $("#nome-conta").textContent = estado.conta?.nome ?? "";
  const cargo = $("#cargo-conta");
  cargo.hidden = !podeRegistrar();
  cargo.textContent = ehAdmin() ? "administrador" : "editor";
}

async function atualizarStatus() {
  let situacao;
  try {
    situacao = await api.estado();
  } catch {
    situacao = { online: false };
  }
  mostrarStatus(situacao, (mundo) => estado.mesas.find((m) => m.mundo === mundo || m.id === mundo)?.nome ?? mundo);
}

/* =================================================================
   Filtros
   ================================================================= */

const filtrosAtivos = () => {
  const f = estado.filtros;
  return f.mesas.size + f.tipos.size + (f.personagem ? 1 : 0) + (f.soMarcos ? 1 : 0) + (f.busca.trim() ? 1 : 0);
};

function passaNosFiltros(ev) {
  if (ev.origem) return true;
  const f = estado.filtros;
  if (ev.selado) return filtrosAtivos() === 0;
  if (f.soMarcos && ev.importancia !== "marco") return false;
  if (f.mesas.size && !ev.mesas.some((m) => f.mesas.has(m))) return false;
  if (f.tipos.size && !f.tipos.has(ev.tipo)) return false;
  if (f.personagem && !ev.personagens.includes(f.personagem)) return false;
  const termo = normalizar(f.busca.trim());
  if (termo) {
    const texto = normalizar([ev.titulo, ev.descricao, ...(ev.frases ?? []).flatMap((fr) => [fr.texto, fr.autor])].join(" "));
    if (!texto.includes(termo)) return false;
  }
  return true;
}

// Do mais recente ao mais antigo; o Expurgo sempre por último
function ordenar(a, b) {
  if (a.origem !== b.origem) return a.origem ? 1 : -1;
  return chaveDaData(b.data) - chaveDaData(a.data);
}

const acontecimentosVisiveis = () => estado.acontecimentos.filter(passaNosFiltros).sort(ordenar);

function renderizarFiltros() {
  const f = estado.filtros;

  // Mesas: só as que existem; as que sumiram saem do filtro
  for (const id of [...f.mesas]) if (!mesaPorId(id)) f.mesas.delete(id);
  const mesas = [...estado.mesas].sort((a, b) => Number(Boolean(a.antiga)) - Number(Boolean(b.antiga)));
  $("#filtro-mesas").replaceChildren(
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

  // Tipos
  for (const id of [...f.tipos]) if (!tipoPorId(id)) f.tipos.delete(id);
  const painel = $("#painel-tipos");
  const opcoes = estado.tipos.map((tipo) => {
    const rotulo = criar("label", "painel-tipos__opcao");
    const caixa = criar("input");
    caixa.type = "checkbox";
    caixa.checked = f.tipos.has(tipo.id);
    caixa.addEventListener("change", () => {
      if (caixa.checked) f.tipos.add(tipo.id);
      else f.tipos.delete(tipo.id);
      aplicarFiltros();
    });
    rotulo.append(caixa, simbolo(`glifo-${tipo.glifo}`), criar("span", null, tipo.nome));
    return rotulo;
  });
  const acoes = criar("div", "painel-tipos__acoes");
  acoes.append(
    botao("Todos os tipos", "botao--leve botao--pequeno", () => {
      f.tipos.clear();
      renderizarFiltros();
      aplicarFiltros();
    }),
    botao("Fechar", "botao--leve botao--pequeno", () => alternarPainelTipos(false)),
  );
  painel.replaceChildren(...opcoes, acoes);
  atualizarRotuloTipos();

  // Personagens
  const seletor = $("#filtro-personagem");
  if (f.personagem && !personagemPorId(f.personagem)) f.personagem = "";
  seletor.replaceChildren(new Option("Todos os personagens", ""));
  const personagens = [...estado.personagens].sort((a, b) => nomeDoPersonagem(a).localeCompare(nomeDoPersonagem(b), "pt-BR"));
  for (const p of personagens) seletor.append(new Option(nomeDoPersonagem(p), p.id));
  seletor.value = f.personagem;

  $("#filtro-marcos").checked = f.soMarcos;
  $("#filtro-busca").value = f.busca;
  $("#ir-ano").max = String(estado.anoAtual);
  $("#ir-ano").placeholder = "Ir para o ano";
}

function atualizarRotuloTipos() {
  const escolhidos = [...estado.filtros.tipos].map(tipoPorId).filter(Boolean);
  let texto = "Todos os tipos";
  if (escolhidos.length === 1) texto = escolhidos[0].nome;
  else if (escolhidos.length > 1) texto = `${escolhidos.length} tipos`;
  $("#rotulo-filtro-tipos").textContent = texto;
}

function alternarPainelTipos(abrir) {
  const painel = $("#painel-tipos");
  const aberto = abrir ?? painel.hidden;
  painel.hidden = !aberto;
  $("#botao-filtro-tipos").setAttribute("aria-expanded", String(aberto));
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
  atualizarRotuloTipos();
  renderizarLinha();
  renderizarPanorama();
  agendarRolagem();
}

function limparFiltros() {
  const f = estado.filtros;
  f.mesas.clear();
  f.tipos.clear();
  f.personagem = "";
  f.soMarcos = false;
  f.busca = "";
  renderizarFiltros();
  aplicarFiltros();
}

/* =================================================================
   A linha
   ================================================================= */

function glifoDe(tipo) {
  const caixa = criar("span", "evento__glifo");
  caixa.append(simbolo(`glifo-${tipo?.glifo ?? "marco"}`));
  return caixa;
}

function selosDe(ev) {
  const selos = criar("span", "evento__selos");
  if (ev.pendente) selos.append(criar("span", "selo-evento selo-evento--pendente", "Alteração pendente"));
  if (ev.visibilidade === "admin") selos.append(criar("span", "selo-evento selo-evento--oculto", "Só o administrador"));
  if (ev.visibilidade === "revelar" && !ev.revelado) selos.append(criar("span", "selo-evento selo-evento--revelar", "Revelar depois"));
  return selos;
}

// A imagem do personagem num círculo; sem imagem, a inicial do nome
function retrato(personagem) {
  const r = criar("span", "retrato");
  if (personagem.imagem) r.append(imagem(personagem.imagem, "retrato__imagem"));
  else r.textContent = personagem.nome.trim().charAt(0).toUpperCase();
  r.title = nomeDoPersonagem(personagem);
  r.setAttribute("role", "img");
  r.setAttribute("aria-label", nomeDoPersonagem(personagem));
  return r;
}

function etiquetaMesa(mesa) {
  const etiqueta = criar("span", "etiqueta-cor", mesa.nome);
  etiqueta.style.setProperty("--cor", corVisivel(mesa.cor));
  return etiqueta;
}

function montarCard(ev) {
  const tipo = tipoPorId(ev.tipo);
  const card = criar("article", "evento");
  card.dataset.id = ev.id;
  if (ev.importancia === "marco") card.classList.add("evento--marco");
  if (ev.tipo === "queda") card.classList.add("evento--queda");
  if (ev.tipo === "arcano") card.classList.add("evento--arcano");
  if (ev.visibilidade === "admin") card.classList.add("evento--oculto");
  card.tabIndex = 0;
  card.setAttribute("role", "button");
  card.setAttribute("aria-label", `${ev.titulo}, ${textoDoPeriodo(ev)}. Abrir o acontecimento.`);

  const cabeca = criar("header", "evento__cabeca");
  cabeca.append(glifoDe(tipo), criar("span", "evento__tipo", tipo?.nome ?? "Acontecimento"));
  const selos = selosDe(ev);
  if (selos.childElementCount) cabeca.append(selos);

  const data = criar("p", "evento__data");
  if (ev.data.dia && !ev.ate) data.append(iconeLua(faseDaLua(ev.data.dia)));
  data.append(textoDoPeriodo(ev));

  card.append(cabeca, data, criar("h3", "evento__titulo", ev.titulo));
  if (ev.descricao) card.append(criar("p", "evento__resumo", resumoDe(ev.descricao)));

  const citados = criar("div", "evento__citados");
  for (const id of ev.personagens) {
    const personagem = personagemPorId(id);
    if (personagem) citados.append(retrato(personagem));
  }
  for (const id of ev.mesas) {
    const mesa = mesaPorId(id);
    if (mesa) citados.append(etiquetaMesa(mesa));
  }
  card.append(citados);

  card.addEventListener("click", () => abrirEvento(ev.id));
  card.addEventListener("keydown", (evento) => {
    if (evento.key === "Enter" || evento.key === " ") {
      evento.preventDefault();
      abrirEvento(ev.id);
    }
  });
  return card;
}

function cardSelado(ev) {
  const card = criar("article", "evento evento--selado");
  card.dataset.id = ev.id;
  card.setAttribute("aria-label", `Um acontecimento selado em ${ev.data.ano} ED.`);
  const lacre = criar("span", "lacre");
  lacre.append(simbolo("runa-selo"));
  card.append(criar("p", "evento__data", `${ev.data.ano} ED`), lacre, criar("p", "evento__velado", "Um segredo ainda guardado."));
  const linhas = criar("div", "linhas-veladas");
  linhas.append(criar("span"), criar("span"), criar("span"));
  card.append(linhas);
  card.addEventListener("click", () => avisoRapido("Este acontecimento ainda está selado. O mestre revela no momento certo."));
  return card;
}

function linhaEvento(ev, lado) {
  const linha = criar("div", `evento-linha evento-linha--${lado}`);
  if (ev.importancia === "marco" && !ev.selado) linha.classList.add("evento-linha--marco");
  linha.id = `evento-${ev.id}`;
  linha.dataset.ano = String(ev.data.ano);
  linha.append(criar("span", "evento-linha__no"), ev.selado ? cardSelado(ev) : montarCard(ev));
  return linha;
}

function linhaOrigem(ev) {
  const linha = criar("div", "evento-origem");
  linha.id = `evento-${ev.id}`;
  linha.dataset.ano = "0";
  linha.dataset.marcoAno = "";
  const card = criar("article", "evento evento--origem");
  card.dataset.id = ev.id;
  card.tabIndex = 0;
  card.setAttribute("role", "button");
  card.setAttribute("aria-label", `${ev.titulo}, ano 0 ED, a origem da linha. Abrir o acontecimento.`);
  const glifo = criar("span", "evento__glifo");
  glifo.append(simbolo("glifo-origem"));
  card.append(glifo, criar("span", "evento-origem__ano", "Ano 0 ED"), criar("h3", "evento__titulo", ev.titulo));
  card.append(criar("p", "evento__resumo", ev.descricao ? resumoDe(ev.descricao) : "O começo da contagem dos anos em Draevor."));
  if (ev.pendente) {
    const selos = selosDe(ev);
    selos.classList.add("evento__selos--centro");
    card.append(selos);
  }
  card.addEventListener("click", () => abrirEvento(ev.id));
  card.addEventListener("keydown", (evento) => {
    if (evento.key === "Enter" || evento.key === " ") {
      evento.preventDefault();
      abrirEvento(ev.id);
    }
  });
  linha.append(card);
  return linha;
}

function marcadorHoje() {
  const marcador = criar("div", "marcador-hoje");
  marcador.dataset.ano = String(estado.anoAtual);
  marcador.dataset.marcoAno = "";
  marcador.append(criar("span", "marcador-hoje__ano", `${estado.anoAtual} ED`), criar("span", "marcador-hoje__rotulo", "Hoje em Draevor"));
  if (ehAdmin()) {
    marcador.append(botao("Alterar o ano atual", "botao--leve botao--pequeno marcador-hoje__editar", abrirAnoAtual));
  }
  return marcador;
}

function marcadorAno(ano) {
  const marcador = criar("h2", "marcador-ano", `${ano} ED`);
  marcador.id = `ano-${ano}`;
  marcador.dataset.ano = String(ano);
  marcador.dataset.marcoAno = "";
  return marcador;
}

function intervalo(anos) {
  const caixa = criar("div", "intervalo");
  caixa.append(simbolo("icone-corrente"), criar("span", null, `${anos} anos sem registros`));
  return caixa;
}

function renderizarLinha() {
  const lista = acontecimentosVisiveis();
  const partes = [marcadorHoje()];
  const comuns = lista.filter((ev) => !ev.origem);

  if (!comuns.length) {
    let texto = "Nenhum acontecimento com esses filtros.";
    if (!filtrosAtivos()) {
      texto = podeRegistrar()
        ? "A história ainda não foi escrita. Use “+ Registrar” para criar o primeiro acontecimento."
        : "Nenhum acontecimento registrado ainda.";
    }
    partes.push(criar("p", "linha-vazia", texto));
  }

  let anoAcima = estado.anoAtual;
  let anoDoGrupo = null;
  let lado = 0;
  for (const ev of lista) {
    const ano = ev.data.ano;
    if (ano !== anoDoGrupo) {
      const vazios = anoAcima - ano - 1;
      if (vazios >= CONFIG.limiteIntervalo) partes.push(intervalo(vazios));
      if (ano !== estado.anoAtual && !(ev.origem && ano === 0)) partes.push(marcadorAno(ano));
      anoAcima = ano;
      anoDoGrupo = ano;
    }
    partes.push(ev.origem ? linhaOrigem(ev) : linhaEvento(ev, lado++ % 2 === 0 ? "esquerda" : "direita"));
  }
  partes.push(criar("span", "fim-da-linha"));
  $("#linha").replaceChildren(...partes);
}

/* =================================================================
   Panorama: a régua de 0 ED até o ano atual
   ================================================================= */

const posicaoNoPanorama = (ano) => `${(Math.min(ano, estado.anoAtual) / Math.max(estado.anoAtual, 1)) * 100}%`;

function passoDoPanorama(total) {
  if (total <= 60) return 10;
  if (total <= 150) return 25;
  if (total <= 450) return 50;
  if (total <= 1200) return 100;
  return 250;
}

function renderizarPanorama() {
  const total = Math.max(estado.anoAtual, 1);
  const trilho = $("#panorama-trilho");
  const itens = [$("#panorama-janela")];

  const divisa = (ano, rotulo, hoje = false) => {
    const marca = criar("span", `panorama__divisa${hoje ? " panorama__divisa--hoje" : ""}`);
    marca.style.left = posicaoNoPanorama(ano);
    marca.append(criar("span", null, rotulo));
    return marca;
  };
  const passo = passoDoPanorama(total);
  for (let ano = 0; ano < total; ano += passo) {
    if (total - ano < passo * 0.45) continue; // não encosta no rótulo de hoje
    itens.push(divisa(ano, ano === 0 ? "0 ED" : String(ano)));
  }
  itens.push(divisa(total, `${estado.anoAtual} ED`, true));

  const lista = acontecimentosVisiveis();
  for (const ev of lista) {
    const marca = criar("button", "panorama__marca");
    marca.type = "button";
    if (ev.origem) marca.classList.add("panorama__marca--origem");
    else if (ev.selado) marca.classList.add("panorama__marca--selado");
    else if (ev.importancia === "marco") marca.classList.add("panorama__marca--marco");
    else if (ev.tipo === "arcano") marca.classList.add("panorama__marca--arcano");
    else if (ev.tipo === "queda") marca.classList.add("panorama__marca--queda");
    marca.style.left = posicaoNoPanorama(ev.data.ano);
    const rotulo = ev.selado ? `Acontecimento selado, ${ev.data.ano} ED` : `${ev.titulo}, ${textoDoPeriodo(ev)}`;
    marca.title = rotulo;
    marca.setAttribute("aria-label", `Ir para: ${rotulo}`);
    marca.addEventListener("click", (evento) => {
      evento.stopPropagation();
      irParaEvento(ev.id);
    });
    itens.push(marca);
  }
  trilho.replaceChildren(...itens);

  const comuns = lista.filter((ev) => !ev.origem).length;
  const todos = estado.acontecimentos.filter((ev) => !ev.origem).length;
  const quantos = filtrosAtivos() ? `${comuns} de ${todos}` : String(todos);
  $("#panorama-legenda").textContent = `${quantos} ${todos === 1 ? "acontecimento" : "acontecimentos"}, de 0 ED a ${estado.anoAtual} ED`;
}

/* =================================================================
   Navegar pela linha
   ================================================================= */

const alturaPresa = () => ($("#topo")?.offsetHeight ?? 0) + ($("#presos")?.offsetHeight ?? 0);

function rolarAte(elemento) {
  const reduzido = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  elemento.scrollIntoView({ behavior: reduzido ? "auto" : "smooth", block: "start" });
}

function realcar(card) {
  if (!card) return;
  card.classList.remove("evento--realce");
  void card.offsetWidth;
  card.classList.add("evento--realce");
  setTimeout(() => card.classList.remove("evento--realce"), 1900);
}

function irParaEvento(id) {
  const linha = document.getElementById(`evento-${id}`);
  if (!linha) return;
  rolarAte(linha);
  realcar(linha.querySelector(".evento"));
}

function irParaAno(ano) {
  if (!Number.isInteger(ano) || ano < 0) return avisoRapido("Escreva um ano inteiro, de 0 em diante.");
  if (ano > estado.anoAtual) {
    avisoRapido(`O ano atual do mundo é ${estado.anoAtual} ED.`);
    ano = estado.anoAtual;
  }
  const alvos = [...document.querySelectorAll("#linha [data-ano]")];
  const alvo = alvos.find((el) => Number(el.dataset.ano) <= ano);
  if (!alvo) return;
  const anoAchado = Number(alvo.dataset.ano);
  if (anoAchado !== ano && ano < estado.anoAtual) {
    avisoRapido(`Nada registrado em ${ano} ED. Mostrando ${anoAchado} ED, o mais próximo antes dele.`);
  }
  rolarAte(alvo);
}

// O ano que está passando pelo alto da tela e a janela do panorama
let rolagemAgendada = false;
function agendarRolagem() {
  if (rolagemAgendada) return;
  rolagemAgendada = true;
  requestAnimationFrame(() => {
    rolagemAgendada = false;
    atualizarAnoFixo();
    atualizarJanela();
  });
}

function atualizarAnoFixo() {
  const fixo = $("#ano-fixo");
  const topoDoFixo = parseFloat(getComputedStyle(fixo).top) || alturaPresa() + 22;
  const marcadores = [...document.querySelectorAll("#linha [data-marco-ano]")];
  let indice = -1;
  marcadores.forEach((marcador, i) => {
    if (marcador.getBoundingClientRect().top < topoDoFixo) indice = i;
  });
  const atual = marcadores[indice];
  if (!atual || atual.classList.contains("evento-origem")) {
    fixo.hidden = true;
    return;
  }
  const texto = atual.classList.contains("marcador-hoje") ? `${atual.dataset.ano} ED · hoje` : `${atual.dataset.ano} ED`;
  if (fixo.textContent !== texto) fixo.textContent = texto;
  fixo.hidden = false;

  // Quando o próximo ano chega, ele empurra o atual para cima
  const altura = fixo.offsetHeight || 32;
  const proximo = marcadores[indice + 1];
  let deslocamento = 0;
  if (proximo) {
    const folga = proximo.getBoundingClientRect().top - (topoDoFixo + altura + 10);
    if (folga < 0) deslocamento = folga;
  }
  if (deslocamento < -altura - 4) {
    fixo.hidden = true;
    return;
  }
  fixo.style.setProperty("--empurrao", `${Math.round(deslocamento)}px`);
  fixo.style.opacity = String(Math.max(0, 1 + deslocamento / altura));
}

function atualizarJanela() {
  const janela = $("#panorama-janela");
  const topoVisivel = alturaPresa();
  const fundoVisivel = window.innerHeight;
  let menor = Infinity;
  let maior = -Infinity;
  for (const el of document.querySelectorAll("#linha [data-ano]")) {
    const caixa = el.getBoundingClientRect();
    if (caixa.bottom < topoVisivel || caixa.top > fundoVisivel) continue;
    const ano = Number(el.dataset.ano);
    menor = Math.min(menor, ano);
    maior = Math.max(maior, ano);
  }
  if (menor === Infinity) {
    janela.style.opacity = "0";
    return;
  }
  janela.style.opacity = "1";
  janela.style.left = `calc(${posicaoNoPanorama(menor)} - 4px)`;
  janela.style.width = `calc(${posicaoNoPanorama(maior - menor)} + 8px)`;
}

/* =================================================================
   O acontecimento aberto
   ================================================================= */

function partesDaData(data) {
  const partes = [textoDaData(data, { extenso: true })];
  if (data.dia) partes.push(FASES[faseDaLua(data.dia)]);
  if (data.mes) partes.push(ESTACOES[data.mes - 1]);
  return partes;
}

function linhaDeData(ev) {
  const linha = criar("p", "evento-aberto__data");
  if (ev.data.dia) linha.append(iconeLua(faseDaLua(ev.data.dia)));
  const partes = partesDaData(ev.data);
  if (ev.ate) partes.push(`até ${textoDaData(ev.ate, { extenso: true })}`);
  partes.forEach((parte, indice) => {
    if (indice) linha.append(criar("span", "separador", "·"));
    linha.append(criar("span", null, parte));
  });
  return linha;
}

function secao(titulo, ...conteudo) {
  const caixa = criar("section", "evento-aberto__secao");
  caixa.append(criar("h3", null, titulo), ...conteudo);
  return caixa;
}

const nomesDasMesas = (ids) => ids.map(mesaPorId).filter(Boolean).map((m) => m.nome).join(", ") || "nenhuma";
const nomesDosPersonagens = (ids) => ids.map(personagemPorId).filter(Boolean).map(nomeDoPersonagem).join(", ") || "nenhum";

// O que uma alteração pendente muda, campo a campo
function mudancasDe(ev, pendencia) {
  const novo = { ...ev, ...pendencia.dados };
  const lista = [];
  const comparar = (rotulo, antes, depois) => {
    if (antes !== depois) lista.push({ rotulo, antes, depois });
  };
  comparar("Título", ev.titulo, novo.titulo);
  comparar("Data", textoDoPeriodo(ev), textoDoPeriodo(novo));
  comparar("Tipo", tipoPorId(ev.tipo)?.nome, tipoPorId(novo.tipo)?.nome);
  comparar("Importância", ev.importancia === "marco" ? "marco maior" : "registro comum", novo.importancia === "marco" ? "marco maior" : "registro comum");
  comparar("Mesas", nomesDasMesas(ev.mesas), nomesDasMesas(novo.mesas));
  comparar("Personagens", nomesDosPersonagens(ev.personagens), nomesDosPersonagens(novo.personagens));
  if (resumoDe(ev.descricao) !== resumoDe(novo.descricao)) lista.push({ rotulo: "Descrição", depois: "texto novo" });
  if (pendencia.dados.removerImagem) lista.push({ rotulo: "Imagem", depois: "removida" });
  else if (pendencia.dados.imagemNova) lista.push({ rotulo: "Imagem", depois: "imagem nova" });
  return lista;
}

function listaDeMudancas(mudancas) {
  const lista = criar("ul", "mudancas");
  for (const m of mudancas) {
    const item = criar("li", null, `${m.rotulo}: `);
    if (m.antes !== undefined) {
      item.append(criar("del", null, m.antes || "nada"), " → ");
    }
    item.append(criar("ins", null, m.depois || "nada"));
    lista.append(item);
  }
  return lista;
}

function caixaDePendencia(ev) {
  const pendencia = pendenciaDe(ev.id);
  const caixa = criar("div", "evento-aberto__aviso");
  if (!pendencia) {
    caixa.append(criar("p", null, "Há uma alteração deste acontecimento esperando a aprovação do administrador. Até lá, ele continua como está."));
    return caixa;
  }
  if (pendencia.acao === "apagar") {
    caixa.append(criar("p", null, `${pendencia.por} pediu para apagar este acontecimento.`));
  } else {
    caixa.append(criar("p", null, `${pendencia.por} pediu esta alteração:`));
    const mudancas = mudancasDe(ev, pendencia);
    caixa.append(mudancas.length ? listaDeMudancas(mudancas) : criar("p", null, "Nenhuma diferença visível."));
  }
  const acoes = criar("div", "dialogo__acoes");
  acoes.append(
    botao("Recusar", "botao--leve botao--perigo", () => decidir(pendencia, false)),
    botao(pendencia.acao === "apagar" ? "Aprovar e apagar" : "Aprovar", "botao--principal botao--pequeno", () => decidir(pendencia, true)),
  );
  caixa.append(acoes);
  return caixa;
}

function abrirEvento(id) {
  const ev = acontecimentoPorId(id);
  if (!ev || ev.selado) return;
  const dialogo = $("#dialogo-evento");
  const tipo = tipoPorId(ev.tipo);
  const partes = [];

  if (ev.imagem) {
    const img = criar("img", "evento-aberto__imagem");
    img.src = ev.imagem;
    img.alt = "";
    partes.push(img);
  }

  const corpo = criar("div", "evento-aberto__corpo");
  const cabeca = criar("div", "evento__cabeca");
  cabeca.append(glifoDe(ev.origem ? { glifo: "origem" } : tipo), criar("span", "evento__tipo", ev.origem ? "A origem" : tipo?.nome ?? "Acontecimento"));
  if (ev.importancia === "marco" && !ev.origem) cabeca.append(criar("span", "evento__tipo", "· marco maior"));
  const selos = selosDe(ev);
  if (selos.childElementCount) cabeca.append(selos);
  corpo.append(cabeca, criar("h2", "evento-aberto__titulo", ev.titulo), linhaDeData(ev));

  if (ev.descricao) {
    const descricao = criar("div", "evento-aberto__descricao");
    descricao.append(...paragrafosDe(ev.descricao));
    corpo.append(descricao);
  }

  const personagens = ev.personagens.map(personagemPorId).filter(Boolean);
  if (personagens.length) {
    const lista = criar("div", "evento-aberto__lista");
    for (const p of personagens) {
      const item = criar("span", "citado-personagem");
      item.append(retrato(p), nomeDoPersonagem(p));
      lista.append(item);
    }
    corpo.append(secao("Personagens citados", lista));
  }

  const mesas = ev.mesas.map(mesaPorId).filter(Boolean);
  if (mesas.length) {
    const lista = criar("div", "evento-aberto__lista");
    lista.append(...mesas.map(etiquetaMesa));
    corpo.append(secao("Vivido nas mesas", lista));
  }

  // Frases marcantes: qualquer conta pode acrescentar; quem acrescentou, ou o administrador, pode tirar
  const frases = (ev.frases ?? []).map((frase) => {
    const bloco = criar("blockquote", "frase", `“${frase.texto}”`);
    if (frase.autor) bloco.append(criar("cite", null, frase.autor));
    if (!frase.podeApagar) return bloco;
    const item = criar("div", "frase-item");
    const apagar = botao("Apagar", "botao--leve botao--perigo frase__apagar", () => apagarFrase(ev, frase));
    apagar.setAttribute("aria-label", `Apagar a frase “${frase.texto}”`);
    item.append(bloco, apagar);
    return item;
  });
  const formFrase = criar("form", "form-frase");
  formFrase.noValidate = true;
  const campoTexto = criar("label", "campo");
  const entradaTexto = criar("input");
  entradaTexto.name = "texto";
  entradaTexto.maxLength = 300;
  entradaTexto.autocomplete = "off";
  campoTexto.append(criar("span", "campo__rotulo", "Nova frase"), entradaTexto);
  const campoAutor = criar("label", "campo");
  const entradaAutor = criar("input");
  entradaAutor.name = "autor";
  entradaAutor.maxLength = 80;
  entradaAutor.autocomplete = "off";
  campoAutor.append(criar("span", "campo__rotulo", "Quem disse"), entradaAutor);
  const enviar = criar("button", "botao botao--leve", "Adicionar");
  enviar.type = "submit";
  formFrase.append(campoTexto, campoAutor, enviar);
  formFrase.addEventListener("submit", async (evento) => {
    evento.preventDefault();
    if (!entradaTexto.value.trim()) {
      entradaTexto.focus();
      return avisoRapido("Escreva a frase antes de adicionar.");
    }
    enviar.disabled = true;
    try {
      await api.adicionarFrase(ev.id, { texto: entradaTexto.value.trim(), autor: entradaAutor.value.trim() });
      await recarregar();
      if ($("#dialogo-evento").open && acontecimentoPorId(ev.id)) abrirEvento(ev.id);
      avisoRapido("Frase adicionada.");
    } catch (falha) {
      avisoRapido(falha.message);
    } finally {
      enviar.disabled = false;
    }
  });
  corpo.append(secao("Frases marcantes", ...(frases.length ? frases : [criar("p", "evento-aberto__meta", "Nenhuma frase ainda.")]), formFrase));

  if (ev.pendente) corpo.append(caixaDePendencia(ev));

  const meta = [];
  if (ev.registradoPor) meta.push(`Registrado por ${ev.registradoPor}.`);
  if (ev.visibilidade === "admin") meta.push("Só o administrador vê este acontecimento.");
  if (ev.visibilidade === "revelar" && !ev.revelado) meta.push("Para os jogadores, ele aparece selado até ser revelado.");
  if (meta.length) corpo.append(criar("p", "evento-aberto__meta", meta.join(" ")));
  partes.push(corpo);

  const acoes = criar("div", "evento-aberto__acoes");
  acoes.append(botao("Copiar link", "botao--leve espaco", () => copiarLink(ev)));
  acoes.append(botao("Fechar", "botao--leve", () => dialogo.close()));
  if (podeRegistrar() && !ev.origem) {
    acoes.append(botao(ehAdmin() ? "Apagar" : "Pedir para apagar", "botao--leve botao--perigo", () => apagarEvento(ev)));
  }
  if (podeRegistrar()) {
    acoes.append(botao("Alterar", "botao--leve", () => {
      dialogo.close();
      abrirRegistro(ev);
    }));
  }
  if (ehAdmin() && ev.visibilidade === "revelar" && !ev.revelado) {
    acoes.append(botao("Revelar agora", "botao--principal botao--pequeno", () => revelar(ev)));
  }
  partes.push(acoes);

  $("#evento-conteudo").replaceChildren(...partes);
  trocarEndereco(`#evento-${ev.id}`);
  if (!dialogo.open) dialogo.showModal();
  dialogo.scrollTop = 0;
}

async function copiarLink(ev) {
  const link = `${location.origin}${location.pathname}#evento-${ev.id}`;
  try {
    await navigator.clipboard.writeText(link);
    avisoRapido("Link copiado. Quem abrir vai direto neste acontecimento.");
  } catch {
    avisoRapido(link);
  }
}

async function apagarEvento(ev) {
  const admin = ehAdmin();
  const confirmado = await perguntar({
    titulo: admin ? "Apagar este acontecimento?" : "Pedir para apagar?",
    texto: admin
      ? `“${ev.titulo}” sai da linha do tempo de vez.`
      : `O administrador vai decidir se “${ev.titulo}” sai da linha. Até lá, ele continua lá.`,
    confirmar: admin ? "Apagar" : "Pedir",
    cancelar: "Cancelar",
    perigo: admin,
  });
  if (!confirmado) return;
  try {
    const resposta = await api.apagar(ev.id);
    $("#dialogo-evento").close();
    await recarregar();
    avisoRapido(resposta.pendente ? "Pedido enviado para o administrador." : "Acontecimento apagado.");
  } catch (falha) {
    avisarFalha(falha);
  }
}

async function apagarFrase(ev, frase) {
  const confirmado = await perguntar({
    titulo: "Apagar esta frase?",
    texto: `“${frase.texto}” sai deste acontecimento.`,
    confirmar: "Apagar",
    cancelar: "Cancelar",
    perigo: true,
  });
  if (!confirmado) return;
  try {
    await api.apagarFrase(ev.id, frase.id);
    await recarregar();
    if ($("#dialogo-evento").open && acontecimentoPorId(ev.id)) abrirEvento(ev.id);
    avisoRapido("Frase apagada.");
  } catch (falha) {
    avisarFalha(falha);
  }
}

async function revelar(ev) {
  const confirmado = await perguntar({
    titulo: "Revelar o segredo?",
    texto: `“${ev.titulo}” passa a aparecer para todos, no mesmo lugar da linha.`,
    confirmar: "Revelar",
    cancelar: "Cancelar",
  });
  if (!confirmado) return;
  try {
    await api.revelar(ev.id);
    $("#dialogo-evento").close();
    await recarregar();
    irParaEvento(ev.id);
    avisoRapido("O selo se rompeu. Todos já podem ver.");
  } catch (falha) {
    avisarFalha(falha);
  }
}

async function decidir(pendencia, aprovar) {
  try {
    await api.decidir(pendencia.id, aprovar);
    await recarregar();
    avisoRapido(aprovar ? "Pedido aprovado." : "Pedido recusado.");
    const dialogo = $("#dialogo-evento");
    if (dialogo.open) {
      if (acontecimentoPorId(pendencia.acontecimento)) abrirEvento(pendencia.acontecimento);
      else dialogo.close();
    }
    if ($("#dialogo-painel").open && painelAtual === "pendencias") abrirPendencias();
  } catch (falha) {
    avisarFalha(falha);
  }
}

// Coloca (ou tira) o acontecimento aberto no endereço da página, para o link funcionar
function trocarEndereco(ancora) {
  try {
    history.replaceState(null, "", ancora || location.pathname + location.search);
  } catch {
    // dentro de alguns quadros de prévia, o navegador não deixa mudar o endereço
  }
}

/* =================================================================
   Registrar ou alterar
   ================================================================= */

const registro = {
  ev: null, // o acontecimento sendo alterado, ou null para um novo
  dia: null,
  mesas: new Set(),
  personagens: new Set(),
  removerImagem: false,
};

const formRegistro = () => $("#form-registro");

function opcoesDeMes(seletor, valor) {
  seletor.replaceChildren(new Option("Sem mês", ""), ...MESES.map((mes, i) => new Option(mes, String(i + 1))));
  seletor.value = valor ? String(valor) : "";
}

function opcoesDeDia(seletor, valor) {
  seletor.replaceChildren(new Option("Sem dia", ""));
  for (let dia = 1; dia <= 30; dia++) seletor.append(new Option(String(dia), String(dia)));
  seletor.value = valor ? String(valor) : "";
}

function renderizarGradeDias() {
  const form = formRegistro();
  const grade = $("#grade-dias");
  const mes = Number(form.mes.value) || 0;
  grade.hidden = !mes || form.mes.disabled;
  if (!mes) {
    registro.dia = null;
    return;
  }
  const itens = DIAS_DA_DEZENA.map((nome) => {
    const rotulo = criar("span", "grade-dias__nome", nome.slice(0, 3));
    rotulo.title = nome;
    return rotulo;
  });
  for (let dia = 1; dia <= 30; dia++) {
    const dataDoDia = { mes, dia };
    const botaoDia = criar("button", "grade-dias__dia", String(dia));
    botaoDia.type = "button";
    botaoDia.dataset.dia = String(dia);
    botaoDia.setAttribute("aria-pressed", String(dia === registro.dia));
    const descricao = `${ehSylara(dataDoDia) ? "Sylara" : diaDaDezena(dia)}, ${dia} de ${MESES[mes - 1]}, ${FASES[faseDaLua(dia)]}`;
    botaoDia.title = descricao;
    botaoDia.setAttribute("aria-label", descricao);
    if (dia === 1 || dia === 16) botaoDia.append(iconeLua(faseDaLua(dia)));
    if (ehSylara(dataDoDia)) botaoDia.classList.add("grade-dias__dia--sylara");
    botaoDia.addEventListener("click", () => {
      registro.dia = registro.dia === dia ? null : dia;
      renderizarGradeDias();
      atualizarPreviaData();
      grade.querySelector(`[data-dia="${dia}"]`)?.focus();
    });
    itens.push(botaoDia);
  }
  grade.replaceChildren(...itens);
}

function dataDoFormulario() {
  const form = formRegistro();
  const ano = form.ano.value === "" ? NaN : Number(form.ano.value);
  const mes = Number(form.mes.value) || null;
  return { ano, mes, dia: mes ? registro.dia : null, aprox: form.aprox.checked };
}

function fimDoFormulario() {
  const form = formRegistro();
  if (!form.periodo.checked) return null;
  const ano = form.ate_ano.value === "" ? NaN : Number(form.ate_ano.value);
  const mes = Number(form.ate_mes.value) || null;
  return { ano, mes, dia: mes ? Number(form.ate_dia.value) || null : null };
}

function atualizarPreviaData() {
  const previa = $("#previa-data");
  const data = dataDoFormulario();
  if (!Number.isInteger(data.ano) || data.ano < 0) {
    previa.textContent = "Escreva o ano para ver a data.";
    previa.classList.add("apagado");
    return;
  }
  previa.classList.remove("apagado");
  const partes = partesDaData(data);
  const fim = fimDoFormulario();
  if (fim && Number.isInteger(fim.ano)) partes.push(`até ${textoDaData(fim, { extenso: true })}`);
  previa.textContent = partes.join(" · ");
}

function escolhas(raiz, itens, selecionados, { comCor = false } = {}) {
  if (!itens.length) {
    raiz.replaceChildren(criar("p", "escolhas__vazio", "Nada para escolher ainda."));
    return;
  }
  raiz.replaceChildren(
    ...itens.map((item) => {
      const chip = criar("button", `escolha${comCor ? " escolha--mesa" : ""}`, item.rotulo);
      chip.type = "button";
      if (comCor) chip.style.setProperty("--cor", corVisivel(item.cor));
      chip.setAttribute("aria-pressed", String(selecionados.has(item.id)));
      chip.addEventListener("click", () => {
        if (selecionados.has(item.id)) selecionados.delete(item.id);
        else selecionados.add(item.id);
        chip.setAttribute("aria-pressed", String(selecionados.has(item.id)));
      });
      return chip;
    }),
  );
}

function abrirRegistro(ev = null) {
  if (!podeRegistrar()) return;
  const form = formRegistro();
  const dialogo = $("#dialogo-registro");
  form.reset();
  registro.ev = ev;
  registro.dia = ev?.data.dia ?? null;
  registro.mesas = new Set(ev?.mesas ?? []);
  registro.personagens = new Set(ev?.personagens ?? []);
  registro.removerImagem = false;
  $("#erro-registro").hidden = true;

  const origem = Boolean(ev?.origem);
  $("#registro-titulo").textContent = ev ? "Alterar acontecimento" : "Registrar acontecimento";
  $("#registro-enviar").textContent = ev ? "Salvar" : "Registrar";

  const aviso = $("#registro-aviso");
  const avisos = [];
  if (origem) avisos.push("O Expurgo Demoníaco fica sempre no ano 0 ED; aqui só mudam o título, a descrição e a imagem.");
  aviso.hidden = !avisos.length;
  aviso.textContent = avisos.join(" ");

  // Data
  form.ano.max = String(estado.anoAtual);
  form.ate_ano.max = String(estado.anoAtual);
  form.ano.value = ev ? String(ev.data.ano) : String(estado.anoAtual);
  opcoesDeMes(form.mes, ev?.data.mes);
  form.aprox.checked = Boolean(ev?.data.aprox);
  form.periodo.checked = Boolean(ev?.ate);
  opcoesDeMes(form.ate_mes, ev?.ate?.mes);
  opcoesDeDia(form.ate_dia, ev?.ate?.dia);
  form.ate_ano.value = ev?.ate ? String(ev.ate.ano) : "";
  $("#campos-ate").hidden = !form.periodo.checked;

  // Tipo e importância
  form.tipo.replaceChildren(...estado.tipos.map((t) => new Option(t.nome, t.id)));
  form.tipo.value = ev?.tipo ?? estado.tipos[0]?.id ?? "";
  form.importancia.value = ev?.importancia ?? "comum";

  // Citações
  const mesas = [...estado.mesas]
    .sort((a, b) => Number(Boolean(a.antiga)) - Number(Boolean(b.antiga)))
    .map((m) => ({ id: m.id, rotulo: m.nome, cor: m.cor }));
  escolhas($("#escolha-mesas"), mesas, registro.mesas, { comCor: true });
  const personagens = [...estado.personagens]
    .sort((a, b) => nomeDoPersonagem(a).localeCompare(nomeDoPersonagem(b), "pt-BR"))
    .map((p) => ({ id: p.id, rotulo: nomeDoPersonagem(p) }));
  escolhas($("#escolha-personagens"), personagens, registro.personagens);

  // Textos e imagem
  form.titulo.value = ev?.titulo ?? "";
  form.descricao.value = ev?.descricao ?? "";
  const imagemAtual = $("#imagem-atual");
  imagemAtual.hidden = !ev?.imagem;
  if (ev?.imagem) imagemAtual.querySelector("img").src = ev.imagem;
  $("#campos-frase").hidden = Boolean(ev);

  // Visibilidade: só o administrador escolhe
  $("#campo-visibilidade").hidden = !ehAdmin() || origem;
  form.visibilidade.value = ev?.visibilidade ?? "todos";

  // O Expurgo não sai do ano 0 nem muda de tipo
  for (const grupo of ["#grupo-data", "#grupo-tipo", "#grupo-mesas", "#grupo-personagens"]) $(grupo).hidden = origem;

  renderizarGradeDias();
  atualizarPreviaData();
  dialogo.showModal();
  form.titulo.focus();
}

function coletarRegistro() {
  const form = formRegistro();
  const ev = registro.ev;
  const titulo = form.titulo.value.trim();
  if (!titulo) throw new Error("Escreva o título do acontecimento.");

  const base = {
    titulo,
    descricao: form.descricao.value.trim(),
    imagem: form.imagem.files[0] ?? null,
    removerImagem: registro.removerImagem && !form.imagem.files[0],
  };
  if (ev?.origem) return base;

  const data = dataDoFormulario();
  if (!Number.isInteger(data.ano) || data.ano < 0 || data.ano > estado.anoAtual) {
    throw new Error(`O ano precisa ser um número inteiro de 0 a ${estado.anoAtual}.`);
  }
  const ate = fimDoFormulario();
  if (ate) {
    if (!Number.isInteger(ate.ano)) throw new Error("Escreva o ano em que o período termina.");
    if (ate.ano > estado.anoAtual) throw new Error(`O período não pode passar do ano atual, ${estado.anoAtual} ED.`);
    if (chaveDaData(ate) < chaveDaData(data)) throw new Error("O período não pode terminar antes de começar.");
  }
  if (!form.tipo.value) throw new Error("Escolha um tipo.");

  const frase = form.frase.value.trim();
  return {
    ...base,
    data: { ano: data.ano, mes: data.mes, dia: data.dia, aprox: data.aprox },
    ate,
    tipo: form.tipo.value,
    importancia: form.importancia.value,
    mesas: [...registro.mesas],
    personagens: [...registro.personagens],
    visibilidade: ehAdmin() ? form.visibilidade.value : "todos",
    frase: !ev && frase ? { texto: frase, autor: form.frase_autor.value.trim() } : null,
  };
}

async function enviarRegistro(evento) {
  evento.preventDefault();
  const erro = $("#erro-registro");
  const enviar = $("#registro-enviar");
  erro.hidden = true;
  let dados;
  try {
    dados = coletarRegistro();
  } catch (falha) {
    erro.textContent = falha.message;
    erro.hidden = false;
    return;
  }
  enviar.disabled = true;
  try {
    let irPara = registro.ev?.id ?? null;
    let mensagem;
    if (registro.ev) {
      await api.alterar(registro.ev.id, dados);
      mensagem = "Acontecimento alterado.";
    } else {
      const resposta = await api.registrar(dados);
      irPara = resposta.acontecimento?.id ?? null;
      mensagem = "Acontecimento registrado.";
    }
    $("#dialogo-registro").close();
    await recarregar();
    avisoRapido(mensagem);
    if (irPara) irParaEvento(irPara);
  } catch (falha) {
    erro.textContent = falha.message;
    erro.hidden = false;
  } finally {
    enviar.disabled = false;
  }
}

function configurarRegistro() {
  const form = formRegistro();
  form.addEventListener("submit", enviarRegistro);
  $("#registro-cancelar").addEventListener("click", () => $("#dialogo-registro").close());
  form.mes.addEventListener("change", () => {
    registro.dia = null;
    renderizarGradeDias();
    atualizarPreviaData();
  });
  for (const nome of ["ano", "aprox", "ate_ano", "ate_mes", "ate_dia"]) {
    form.elements[nome].addEventListener("input", atualizarPreviaData);
  }
  form.periodo.addEventListener("change", () => {
    $("#campos-ate").hidden = !form.periodo.checked;
    if (form.periodo.checked && !form.ate_ano.value) form.ate_ano.value = form.ano.value;
    atualizarPreviaData();
  });
  form.imagem.addEventListener("change", () => {
    const arquivo = form.imagem.files[0];
    const caixa = $("#imagem-atual");
    if (!arquivo) return;
    caixa.hidden = false;
    caixa.querySelector("img").src = URL.createObjectURL(arquivo);
    registro.removerImagem = false;
  });
  $("#remover-imagem").addEventListener("click", () => {
    form.imagem.value = "";
    registro.removerImagem = true;
    $("#imagem-atual").hidden = true;
  });
}

/* =================================================================
   Painéis do administrador
   ================================================================= */

let painelAtual = null;

function abrirPainel(nome, titulo, construir) {
  painelAtual = nome;
  $("#painel-titulo").textContent = titulo;
  const conteudo = $("#painel-conteudo");
  conteudo.replaceChildren();
  construir(conteudo);
  const dialogo = $("#dialogo-painel");
  if (!dialogo.open) dialogo.showModal();
}

function campoTexto(rotulo, nome, valor = "", { tipo = "text", ajuda = "", max } = {}) {
  const campo = criar("label", "campo");
  const entrada = criar("input");
  entrada.name = nome;
  entrada.type = tipo;
  entrada.value = valor;
  entrada.autocomplete = "off";
  if (max) entrada.maxLength = max;
  campo.append(criar("span", "campo__rotulo", rotulo), entrada);
  if (ajuda) campo.append(criar("span", "campo__ajuda", ajuda));
  return campo;
}

function abrirAnoAtual() {
  abrirPainel("ano", "Ano atual do mundo", (raiz) => {
    const ultimo = Math.max(0, ...estado.acontecimentos.map((a) => Math.max(a.data.ano, a.ate?.ano ?? 0)));
    raiz.append(criar("p", "painel__texto", `A linha termina no ano atual, hoje ${estado.anoAtual} ED. Nenhum acontecimento pode passar dele.`));
    const form = criar("form", "painel__form");
    form.noValidate = true;
    const campo = campoTexto("Ano atual", "ano", String(estado.anoAtual), {
      tipo: "number",
      ajuda: ultimo > 0 ? `O registro mais recente é de ${ultimo} ED.` : "",
    });
    const erro = criar("p", "mensagem-erro");
    erro.hidden = true;
    const salvar = criar("button", "botao botao--principal botao--pequeno", "Salvar");
    salvar.type = "submit";
    const linha = criar("div", "painel__linha");
    linha.append(campo, salvar);
    form.append(linha, erro);
    form.addEventListener("submit", async (evento) => {
      evento.preventDefault();
      const ano = Number(form.ano.value);
      salvar.disabled = true;
      try {
        await api.mudarAnoAtual(ano);
        $("#dialogo-painel").close();
        await recarregar();
        avisoRapido(`O ano atual agora é ${ano} ED.`);
      } catch (falha) {
        erro.textContent = falha.message;
        erro.hidden = false;
      } finally {
        salvar.disabled = false;
      }
    });
    raiz.append(form);
  });
}

function abrirPendencias() {
  abrirPainel("pendencias", "Pendências", (raiz) => {
    if (!estado.pendencias.length) {
      raiz.append(criar("p", "painel__texto", "Nada esperando aprovação."));
      return;
    }
    raiz.append(criar("p", "painel__texto", "Pedidos dos editores esperando você. O card só muda depois que você aprovar."));
    const lista = criar("div", "painel__lista");
    for (const pendencia of estado.pendencias) {
      const ev = acontecimentoPorId(pendencia.acontecimento);
      if (!ev) continue;
      const item = criar("div", "pendencia");
      const cabeca = criar("div", "pendencia__cabeca");
      cabeca.append(
        criar("span", "pendencia__titulo", ev.titulo),
        criar("span", "pendencia__quem", pendencia.acao === "apagar" ? `${pendencia.por} pediu para apagar` : `Alteração pedida por ${pendencia.por}`),
      );
      item.append(cabeca);
      if (pendencia.acao !== "apagar") {
        const mudancas = mudancasDe(ev, pendencia);
        item.append(mudancas.length ? listaDeMudancas(mudancas) : criar("p", "pendencia__quem", "Nenhuma diferença visível."));
      }
      const acoes = criar("div", "dialogo__acoes");
      acoes.append(
        botao("Ver o acontecimento", "botao--leve", () => {
          $("#dialogo-painel").close();
          irParaEvento(ev.id);
        }),
        botao("Recusar", "botao--leve botao--perigo", () => decidir(pendencia, false)),
        botao(pendencia.acao === "apagar" ? "Aprovar e apagar" : "Aprovar", "botao--principal botao--pequeno", () => decidir(pendencia, true)),
      );
      item.append(acoes);
      lista.append(item);
    }
    raiz.append(lista);
  });
}

function abrirTipos() {
  abrirPainel("tipos", "Tipos de acontecimento", (raiz) => {
    raiz.append(criar("p", "painel__texto", "Os tipos definem o glifo de cada card. Os que vêm com a página ficam sempre; os que você criar podem ser apagados quando ninguém os usa."));
    const lista = criar("div", "painel__lista");
    for (const tipo of estado.tipos) {
      const usos = estado.acontecimentos.filter((a) => a.tipo === tipo.id).length;
      const item = criar("div", "painel__item");
      const detalhe = `${tipo.padrao ? "Vem com a página" : "Criado por você"} · ${usos === 1 ? "1 acontecimento" : `${usos} acontecimentos`}`;
      item.append(glifoDe(tipo), criar("span", "painel__nome", tipo.nome), criar("span", "painel__detalhe", detalhe));
      if (!tipo.padrao) {
        const acoes = criar("div", "painel__acoes");
        const apagar = botao("Apagar", "botao--leve botao--perigo", async () => {
          try {
            await api.apagarTipo(tipo.id);
            await recarregar();
            abrirTipos();
            avisoRapido("Tipo apagado.");
          } catch (falha) {
            avisoRapido(falha.message);
          }
        });
        apagar.disabled = usos > 0;
        if (usos > 0) apagar.title = "Ainda há acontecimentos com esse tipo.";
        acoes.append(apagar);
        item.append(acoes);
      }
      lista.append(item);
    }
    raiz.append(lista);

    // Novo tipo
    let glifoEscolhido = "lua";
    const form = criar("form", "painel__form");
    form.noValidate = true;
    const glifos = criar("div", "glifos");
    glifos.setAttribute("role", "group");
    glifos.setAttribute("aria-label", "Glifo do tipo");
    const desenharGlifos = () => {
      glifos.replaceChildren(
        ...GLIFOS.map((glifo) => {
          const opcao = criar("button", "glifo-opcao");
          opcao.type = "button";
          opcao.setAttribute("aria-pressed", String(glifo === glifoEscolhido));
          opcao.setAttribute("aria-label", glifo);
          opcao.append(simbolo(`glifo-${glifo}`));
          opcao.addEventListener("click", () => {
            glifoEscolhido = glifo;
            desenharGlifos();
          });
          return opcao;
        }),
      );
    };
    desenharGlifos();
    const erro = criar("p", "mensagem-erro");
    erro.hidden = true;
    const criarBotao = criar("button", "botao botao--principal botao--pequeno", "Criar tipo");
    criarBotao.type = "submit";
    const linha = criar("div", "painel__linha");
    linha.append(campoTexto("Nome do tipo", "nome", "", { max: 40 }), criarBotao);
    form.append(criar("h3", "painel__form-titulo", "Novo tipo"), linha, criar("span", "campo__rotulo", "Glifo"), glifos, erro);
    form.addEventListener("submit", async (evento) => {
      evento.preventDefault();
      criarBotao.disabled = true;
      try {
        await api.criarTipo({ nome: form.nome.value.trim(), glifo: glifoEscolhido });
        await recarregar();
        abrirTipos();
        avisoRapido("Tipo criado.");
      } catch (falha) {
        erro.textContent = falha.message;
        erro.hidden = false;
      } finally {
        criarBotao.disabled = false;
      }
    });
    raiz.append(form);
  });
}

function abrirMesasAntigas(emEdicao = null) {
  abrirPainel("mesas", "Mesas antigas", (raiz) => {
    raiz.append(criar("p", "painel__texto", "As mesas atuais vêm do portal. Aqui ficam as antigas, só com nome e cor, para poderem ser citadas nos acontecimentos."));
    const antigas = estado.mesas.filter((m) => m.antiga);
    const lista = criar("div", "painel__lista");
    if (!antigas.length) lista.append(criar("p", "painel__texto", "Nenhuma mesa antiga ainda."));
    for (const mesa of antigas) {
      const citacoes = estado.acontecimentos.filter((a) => a.mesas?.includes(mesa.id)).length;
      const item = criar("div", "painel__item");
      const ponto = criar("span", "ponto-cor");
      ponto.style.setProperty("--cor", corVisivel(mesa.cor));
      const acoes = criar("div", "painel__acoes");
      acoes.append(
        botao("Alterar", "botao--leve", () => abrirMesasAntigas(mesa)),
        botao("Apagar", "botao--leve botao--perigo", async () => {
          const confirmado = await perguntar({
            titulo: "Apagar esta mesa?",
            texto: citacoes
              ? `“${mesa.nome}” sai da lista e deixa de aparecer em ${citacoes === 1 ? "1 acontecimento" : `${citacoes} acontecimentos`}.`
              : `“${mesa.nome}” sai da lista.`,
            confirmar: "Apagar",
            cancelar: "Cancelar",
            perigo: true,
          });
          if (!confirmado) return abrirMesasAntigas();
          try {
            await api.apagarMesaAntiga(mesa.id);
            await recarregar();
            avisoRapido("Mesa apagada.");
          } catch (falha) {
            avisoRapido(falha.message);
          }
          abrirMesasAntigas();
        }),
      );
      item.append(
        ponto,
        criar("span", "painel__nome", mesa.nome),
        criar("span", "painel__detalhe", citacoes === 1 ? "Citada em 1 acontecimento" : `Citada em ${citacoes} acontecimentos`),
        acoes,
      );
      lista.append(item);
    }
    raiz.append(lista);

    const form = criar("form", "painel__form");
    form.noValidate = true;
    const campoCor = campoTexto("Cor", "cor", emEdicao?.cor ?? "#6b5a45", { tipo: "color" });
    const erro = criar("p", "mensagem-erro");
    erro.hidden = true;
    const salvar = criar("button", "botao botao--principal botao--pequeno", emEdicao ? "Salvar" : "Adicionar mesa");
    salvar.type = "submit";
    const linha = criar("div", "painel__linha");
    linha.append(campoTexto("Nome da mesa", "nome", emEdicao?.nome ?? "", { max: 80 }), campoCor, salvar);
    form.append(criar("h3", "painel__form-titulo", emEdicao ? `Alterar ${emEdicao.nome}` : "Nova mesa antiga"), linha, erro);
    if (emEdicao) form.append(botao("Cancelar a alteração", "botao--leve", () => abrirMesasAntigas()));
    form.addEventListener("submit", async (evento) => {
      evento.preventDefault();
      salvar.disabled = true;
      try {
        await api.salvarMesaAntiga({ id: emEdicao?.id, nome: form.nome.value.trim(), cor: form.cor.value });
        await recarregar();
        abrirMesasAntigas();
        avisoRapido(emEdicao ? "Mesa alterada." : "Mesa adicionada.");
      } catch (falha) {
        erro.textContent = falha.message;
        erro.hidden = false;
      } finally {
        salvar.disabled = false;
      }
    });
    raiz.append(form);
  });
}

/* =================================================================
   Carregar e desenhar tudo
   ================================================================= */

function renderizarAcoes() {
  $("#botao-registrar").hidden = !podeRegistrar();
  const admin = ehAdmin();
  $("#botao-tipos-admin").hidden = !admin;
  $("#botao-mesas-antigas").hidden = !admin;
  const pendencias = $("#botao-pendencias");
  pendencias.hidden = !admin;
  const quantas = estado.pendencias.length;
  const contador = $("#contador-pendencias");
  contador.hidden = quantas === 0;
  contador.textContent = String(quantas);
}

function renderizarTudo() {
  atualizarTopo();
  renderizarAcoes();
  renderizarFiltros();
  aplicarFiltros();
}

async function recarregar() {
  const dados = await api.linha();
  Object.assign(estado, {
    conta: dados.conta,
    anoAtual: dados.anoAtual,
    tipos: dados.tipos,
    mesas: dados.mesas,
    personagens: dados.personagens,
    acontecimentos: dados.acontecimentos,
    pendencias: dados.pendencias ?? [],
  });
  renderizarTudo();
}

/* =================================================================
   Eventos da página
   ================================================================= */

// O cabeçalho e o bloco dos filtros com o Panorama ficam presos no alto; a página precisa saber o tamanho deles
function medirAlturas() {
  const raiz = document.documentElement;
  const aplicar = () => {
    raiz.style.setProperty("--altura-topo", `${$("#topo").offsetHeight}px`);
    raiz.style.setProperty("--altura-filtros", `${$("#presos").offsetHeight}px`);
  };
  const observador = new ResizeObserver(aplicar);
  observador.observe($("#topo"));
  observador.observe($("#presos"));
  aplicar();
}

function configurarEventos() {
  configurarRegistro();
  fecharAoClicarFora($("#dialogo-evento"));
  fecharAoClicarFora($("#dialogo-painel"));
  $("#dialogo-evento").addEventListener("close", () => {
    if (location.hash.startsWith("#evento-")) trocarEndereco("");
  });
  $("#painel-fechar").addEventListener("click", () => $("#dialogo-painel").close());

  $("#botao-registrar").addEventListener("click", () => abrirRegistro());
  $("#botao-pendencias").addEventListener("click", abrirPendencias);
  $("#botao-tipos-admin").addEventListener("click", abrirTipos);
  $("#botao-mesas-antigas").addEventListener("click", () => abrirMesasAntigas());

  // Filtros
  $("#botao-filtro-tipos").addEventListener("click", () => alternarPainelTipos());
  document.addEventListener("click", (evento) => {
    if (!evento.target.closest(".filtro-tipos")) alternarPainelTipos(false);
  });
  document.addEventListener("keydown", (evento) => {
    if (evento.key === "Escape" && !$("#painel-tipos").hidden) alternarPainelTipos(false);
  });
  $("#filtro-personagem").addEventListener("change", (evento) => {
    estado.filtros.personagem = evento.target.value;
    aplicarFiltros();
  });
  $("#filtro-marcos").addEventListener("change", (evento) => {
    estado.filtros.soMarcos = evento.target.checked;
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
  $("#form-ir-ano").addEventListener("submit", (evento) => {
    evento.preventDefault();
    const valor = $("#ir-ano").value;
    if (valor === "") return;
    irParaAno(Number(valor));
  });
  $("#limpar-filtros").addEventListener("click", limparFiltros);
  $("#filtros-alternar").addEventListener("click", () => {
    const filtros = $("#filtros");
    const aberto = filtros.classList.toggle("filtros--aberto");
    $("#filtros-alternar").setAttribute("aria-expanded", String(aberto));
  });

  // Panorama: clicar no trilho leva ao ano daquele ponto
  $("#panorama-trilho").addEventListener("click", (evento) => {
    const caixa = evento.currentTarget.getBoundingClientRect();
    const fracao = Math.min(1, Math.max(0, (evento.clientX - caixa.left) / caixa.width));
    irParaAno(Math.round(fracao * estado.anoAtual));
  });

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
    $("#linha").replaceChildren(criar("p", "linha-vazia", falha.message));
    return;
  }
  $("#pagina").hidden = false;
  agendarRolagem();

  atualizarStatus();
  setInterval(atualizarStatus, CONFIG.intervaloStatus);

  // Link direto para um acontecimento: rola até ele e abre
  const alvo = location.hash.match(/^#evento-(.+)$/)?.[1];
  if (alvo && acontecimentoPorId(decodeURIComponent(alvo))) {
    const id = decodeURIComponent(alvo);
    requestAnimationFrame(() => {
      irParaEvento(id);
      abrirEvento(id);
    });
  }
}

iniciar();
