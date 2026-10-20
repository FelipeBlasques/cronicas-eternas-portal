"use strict";
/* =================================================================
   Crônicas Eternas: Regras da casa
   -----------------------------------------------------------------
   O livro de regras próprias do grupo, em capítulos. Só o
   administrador escreve; qualquer conta lê. Cada conta guarda a
   última vez que abriu a página, para marcar o que é novidade.
   As datas são do mundo real, e não do Ciclo de Sylara.
   ================================================================= */

const crypto = require("node:crypto");
const { dados, salvarDados, ErroHttp, enviarJson, lerJson, texto } = require("./base");

// Os capítulos que a página ganha na primeira vez, nesta ordem
const CAPITULOS_INICIAIS = [
  "Criação de personagem",
  "Combate",
  "Descanso e cura",
  "Morte e ressurreição",
  "Itens e tesouro",
  "Magia",
  "Conduta à mesa",
];
const SITUACOES = new Set(["vigor", "teste", "revogada"]);
const LIMITES_REGRAS = { capitulos: 40, itens: 500 };

const carimbo = () => new Date().toISOString();
const idAleatorio = () => crypto.randomBytes(4).toString("hex");

function novoId(prefixo, ocupados) {
  let id;
  do id = `${prefixo}${idAleatorio()}`;
  while (ocupados.has(id));
  return id;
}

function cargoDe(conta) {
  if (conta.admin) return "admin";
  if (conta.editor) return "editor";
  return "jogador";
}

// Cria o livro na primeira vez e confere o formato do que está salvo.
// Devolve true quando precisou mudar alguma coisa.
function garantirRegras() {
  if (!dados.regras || typeof dados.regras !== "object" || Array.isArray(dados.regras)) {
    const ocupados = new Set();
    const capitulos = CAPITULOS_INICIAIS.map((nome) => {
      const id = novoId("cap-", ocupados);
      ocupados.add(id);
      return { id, nome };
    });
    dados.regras = { capitulos, itens: [] };
    return true;
  }
  let mudou = false;
  const regras = dados.regras;
  for (const lista of ["capitulos", "itens"]) {
    if (!Array.isArray(regras[lista])) {
      regras[lista] = [];
      mudou = true;
    }
  }
  for (const item of regras.itens) {
    if (!Array.isArray(item.mesas)) {
      item.mesas = [];
      mudou = true;
    }
  }
  return mudou;
}

const idsDasMesas = () => new Set(dados.campanhas.map((c) => c.id));

// Fica só com as mesas que existem, sem repetir
function mesasConhecidas(lista) {
  if (!Array.isArray(lista)) return [];
  const conhecidas = idsDasMesas();
  return [...new Set(lista.filter((id) => typeof id === "string" && conhecidas.has(id)))];
}

function exigirAdmin(conta) {
  if (!conta.admin) throw new ErroHttp(403, "Só o administrador pode fazer isso.", "proibido");
}

function semCapitulo() {
  return new ErroHttp(404, "Esse capítulo não existe mais. Recarregue a página.", "nao-encontrado");
}

function semRegra() {
  return new ErroHttp(404, "Essa regra não existe mais. Recarregue a página.", "nao-encontrado");
}

/* ---------- Formato enviado à página ---------- */

// Sem regrasVistasEm (a pessoa nunca abriu a página), nada é novidade
function ehNovidade(item, vistasEm) {
  return Boolean(vistasEm) && Date.parse(item.avisadaEm) > Date.parse(vistasEm);
}

// Para a barra lateral de todas as páginas (GET /api/barra, em mesas.js)
function contarNovidades(conta) {
  return (dados.regras?.itens ?? []).filter((item) => ehNovidade(item, conta.regrasVistasEm)).length;
}

function dadosDasRegras(conta) {
  const { capitulos, itens } = dados.regras;
  const conhecidas = idsDasMesas();
  let novidades = 0;
  const lista = itens.map((item) => {
    const novidade = ehNovidade(item, conta.regrasVistasEm);
    if (novidade) novidades++;
    return {
      id: item.id,
      capitulo: item.capitulo,
      titulo: item.titulo,
      texto: item.texto,
      mesas: item.mesas.filter((id) => conhecidas.has(id)),
      situacao: SITUACOES.has(item.situacao) ? item.situacao : "vigor",
      criadaEm: item.criadaEm,
      alteradaEm: item.alteradaEm,
      avisadaEm: item.avisadaEm,
      novidade,
    };
  });
  return {
    conta: { usuario: conta.usuario, nome: conta.nome, cargo: cargoDe(conta) },
    mesas: dados.campanhas.map((c) => ({ id: c.id, nome: c.nome, cor: c.cor || "#2e3756" })),
    capitulos: capitulos.map((c) => ({ id: c.id, nome: c.nome })),
    itens: lista,
    novidades,
  };
}

/* ---------- O que chega do formulário ---------- */

function nomeDoCapitulo(corpo) {
  return texto(corpo.nome, "Nome do capítulo", 60);
}

// Confere e limpa o que veio do formulário de uma regra
function valoresDaRegra(corpo) {
  const titulo = texto(corpo.titulo, "Título", 120);
  const capitulo = typeof corpo.capitulo === "string" ? corpo.capitulo : "";
  if (!dados.regras.capitulos.some((c) => c.id === capitulo)) throw new ErroHttp(400, "Escolha um capítulo da lista.");
  const textoBruto = typeof corpo.texto === "string" ? corpo.texto.replace(/\r\n?/g, "\n") : "";
  const textoDaRegra = texto(textoBruto, "Texto", 6000);
  if (!SITUACOES.has(corpo.situacao)) {
    throw new ErroHttp(400, "Escolha a situação da regra: em vigor, em teste ou revogada.");
  }
  return { titulo, capitulo, texto: textoDaRegra, mesas: mesasConhecidas(corpo.mesas), situacao: corpo.situacao };
}

// A lista nova precisa ter exatamente os mesmos ids da atual, em outra ordem
function novaOrdem(atual, ids) {
  const recusar = () => new ErroHttp(400, "A ordem enviada não confere com a lista atual. Recarregue a página.");
  if (!Array.isArray(ids) || ids.length !== atual.length || new Set(ids).size !== ids.length) throw recusar();
  const porId = new Map(atual.map((x) => [x.id, x]));
  const nova = ids.map((id) => porId.get(id));
  if (nova.some((x) => !x)) throw recusar();
  return nova;
}

/* ---------- Rotas ---------- */

async function tratarRegras(req, res, rota, metodo, conta) {
  if (garantirRegras()) await salvarDados();
  let partes;
  try {
    partes = rota.split("/").filter(Boolean).slice(2).map(decodeURIComponent);
  } catch {
    throw new ErroHttp(404, "Endereço não encontrado.");
  }
  const [recurso, id, ...resto] = partes;

  if (!resto.length) {
    if (!recurso && metodo === "GET") return enviarJson(res, 200, dadosDasRegras(conta));
    if (recurso === "visto" && !id && metodo === "POST") return marcarVisto(res, conta);
    if (recurso === "capitulos") {
      if (!id && metodo === "POST") return criarCapitulo(req, res, conta);
      if (id && metodo === "PUT") return renomearCapitulo(req, res, conta, id);
      if (id && metodo === "DELETE") return apagarCapitulo(res, conta, id);
    }
    if (recurso === "itens") {
      if (!id && metodo === "POST") return criarRegra(req, res, conta);
      if (id && metodo === "PUT") return alterarRegra(req, res, conta, id);
      if (id && metodo === "DELETE") return apagarRegra(res, conta, id);
    }
    if (recurso === "ordem" && !id && metodo === "POST") return mudarOrdem(req, res, conta);
  }
  throw new ErroHttp(404, "Endereço não encontrado.");
}

// A página chama depois de desenhar, para os selos da visita atual continuarem visíveis
async function marcarVisto(res, conta) {
  conta.regrasVistasEm = carimbo();
  await salvarDados();
  enviarJson(res, 200, { ok: true });
}

async function criarCapitulo(req, res, conta) {
  exigirAdmin(conta);
  const nome = nomeDoCapitulo(await lerJson(req));
  const regras = dados.regras;
  if (regras.capitulos.length >= LIMITES_REGRAS.capitulos) {
    throw new ErroHttp(400, `O livro pode ter no máximo ${LIMITES_REGRAS.capitulos} capítulos.`);
  }
  const capitulo = { id: novoId("cap-", new Set(regras.capitulos.map((c) => c.id))), nome };
  regras.capitulos.push(capitulo);
  await salvarDados();
  enviarJson(res, 201, { capitulo: { id: capitulo.id } });
}

async function renomearCapitulo(req, res, conta, id) {
  exigirAdmin(conta);
  const nome = nomeDoCapitulo(await lerJson(req));
  const capitulo = dados.regras.capitulos.find((c) => c.id === id);
  if (!capitulo) throw semCapitulo();
  capitulo.nome = nome;
  await salvarDados();
  enviarJson(res, 200, { ok: true });
}

async function apagarCapitulo(res, conta, id) {
  exigirAdmin(conta);
  const regras = dados.regras;
  const capitulo = regras.capitulos.find((c) => c.id === id);
  if (!capitulo) throw semCapitulo();
  if (regras.itens.some((r) => r.capitulo === id)) {
    throw new ErroHttp(409, "Esse capítulo ainda tem regras. Mova ou apague as regras dele antes.");
  }
  regras.capitulos = regras.capitulos.filter((c) => c !== capitulo);
  await salvarDados();
  enviarJson(res, 200, { ok: true });
}

// A regra nova entra no fim da lista, que é também o fim do capítulo dela
async function criarRegra(req, res, conta) {
  exigirAdmin(conta);
  const valores = valoresDaRegra(await lerJson(req));
  const regras = dados.regras;
  if (regras.itens.length >= LIMITES_REGRAS.itens) {
    throw new ErroHttp(400, `O livro pode ter no máximo ${LIMITES_REGRAS.itens} regras.`);
  }
  const quando = carimbo();
  const regra = {
    id: novoId("regra-", new Set(regras.itens.map((r) => r.id))),
    ...valores,
    criadaEm: quando,
    alteradaEm: quando,
    avisadaEm: quando,
  };
  regras.itens.push(regra);
  await salvarDados();
  console.log(`${conta.usuario} escreveu nas Regras da casa: ${regra.titulo}`);
  enviarJson(res, 201, { regra: { id: regra.id } });
}

// Com "avisar", a alteração volta a aparecer como novidade. Mudar de capítulo põe a regra no fim do novo.
async function alterarRegra(req, res, conta, id) {
  exigirAdmin(conta);
  const corpo = await lerJson(req);
  const regras = dados.regras;
  const regra = regras.itens.find((r) => r.id === id);
  if (!regra) throw semRegra();
  const valores = valoresDaRegra(corpo);
  if (valores.capitulo !== regra.capitulo) regras.itens = [...regras.itens.filter((r) => r !== regra), regra];
  Object.assign(regra, valores);
  regra.alteradaEm = carimbo();
  if (corpo.avisar === true) regra.avisadaEm = regra.alteradaEm;
  await salvarDados();
  enviarJson(res, 200, { ok: true });
}

async function apagarRegra(res, conta, id) {
  exigirAdmin(conta);
  const regras = dados.regras;
  const regra = regras.itens.find((r) => r.id === id);
  if (!regra) throw semRegra();
  regras.itens = regras.itens.filter((r) => r !== regra);
  await salvarDados();
  console.log(`${conta.usuario} apagou das Regras da casa: ${regra.titulo}`);
  enviarJson(res, 200, { ok: true });
}

// Recebe a lista completa de ids dos capítulos ou das regras, na nova ordem
async function mudarOrdem(req, res, conta) {
  exigirAdmin(conta);
  const corpo = await lerJson(req);
  const regras = dados.regras;
  if (corpo.capitulos !== undefined) regras.capitulos = novaOrdem(regras.capitulos, corpo.capitulos);
  else if (corpo.itens !== undefined) regras.itens = novaOrdem(regras.itens, corpo.itens);
  else throw new ErroHttp(400, "Envie a nova ordem dos capítulos ou das regras.");
  await salvarDados();
  enviarJson(res, 200, { ok: true });
}

module.exports = { prefixo: "/api/regras", tratar: tratarRegras, iniciar: garantirRegras, contarNovidades };
