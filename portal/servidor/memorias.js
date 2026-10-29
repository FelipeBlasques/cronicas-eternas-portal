"use strict";
/* =================================================================
   Crônicas Eternas: Memórias de Draevor
   -----------------------------------------------------------------
   Os textos do cenário: cartas, contos, recortes, livros e outros
   escritos que os personagens encontram. Só o administrador
   escreve. Toda memória nasce escondida e só aparece para quem o
   administrador revelar; para os outros, ela não existe.
   O texto pode mencionar acontecimentos da Linha do Tempo e
   personagens da galeria com links.
   ================================================================= */

const crypto = require("node:crypto");
const { dados, salvarDados, ganchos, ErroHttp, enviarJson, lerJson, texto } = require("./base");
const { iniciar: garantirLinha, lerDataDaLinha, podeVer, dataPublica, chaveDaData, textoOpcional } = require("./linha");

// As classificações e o rótulo do campo "detalhe" de cada uma (null: não tem o campo)
const TIPOS = new Map([
  ["carta", "Assinatura"],
  ["conto", null],
  ["diario", null],
  ["recorte", "Recortado de"],
  ["trecho", "Do livro"],
  ["livro", null],
  ["poema", null],
  ["documento", "Emitido por"],
  ["inscricao", "Onde está gravada"],
]);
const LIMITES = { memorias: 500, capitulos: 80, texto: 100000, livro: 1000000, link: 120 };
const LIMITE_JSON = 4 * 1024 * 1024; // um livro inteiro, com acentos, passa de 1 MB

// Uma menção no texto: [[evento:<id>|o que aparece]] ou [[personagem:<id>|o que aparece]]
const REGEX_LINK = /\[\[(evento|personagem):([^\]|\n]+)\|([^\]\n]*)\]\]/g;

const carimbo = () => new Date().toISOString();
const idAleatorio = () => crypto.randomBytes(4).toString("hex");
// As datas são ISO, então a ordem do texto é a ordem do tempo
const doMaisRecente = (a, b) => (a < b ? 1 : a > b ? -1 : 0);

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

const escondida = () => ({ todos: null, contas: {} });

// Cria a lista na primeira vez e confere o formato do que está salvo.
// Devolve true quando precisou mudar alguma coisa.
function garantirMemorias() {
  let mudou = false;
  if (!Array.isArray(dados.memorias)) {
    dados.memorias = [];
    mudou = true;
  }
  for (const m of dados.memorias) {
    const r = m.revelacao;
    if (!r || typeof r !== "object" || !r.contas || typeof r.contas !== "object" || Array.isArray(r.contas)) {
      m.revelacao = { ...escondida(), todos: (r && r.todos) || null };
      mudou = true;
    }
    if (!Array.isArray(m.capitulos)) {
      m.capitulos = [];
      mudou = true;
    }
  }
  return mudou;
}

function exigirAdmin(conta) {
  if (!conta.admin) throw new ErroHttp(403, "Só o administrador pode fazer isso.", "proibido");
}

function semMemoria() {
  return new ErroHttp(404, "Essa memória não existe.", "nao-encontrado");
}

/* ---------- Revelar ---------- */

// As contas que podem receber uma memória: todas, menos as de administrador, que já veem tudo
const contasMarcaveis = () => dados.contas.filter((c) => !c.admin);

// "contas" guarda usuários como chaves: só vale o que é dela mesma, nunca o que vem do Object
const dataDaConta = (revelacao, usuario) => (Object.hasOwn(revelacao.contas, usuario) ? revelacao.contas[usuario] : null);

// As contas para quem a memória foi revelada, entre as que ainda podem recebê-la
function contasReveladas(m) {
  return contasMarcaveis()
    .map((c) => c.usuario)
    .filter((usuario) => dataDaConta(m.revelacao, usuario));
}

function revelacaoPublica(m) {
  const contas = contasReveladas(m);
  const para = m.revelacao.todos ? "todos" : contas.length ? "contas" : "ninguem";
  return { para, contas };
}

// Para quem lê, a data mais antiga entre "todos" e a da própria conta.
// Para o administrador, a primeira vez que a memória foi revelada para alguém. Escondida: null.
function reveladaEm(m, conta) {
  const usuarios = conta.admin ? contasReveladas(m) : [conta.usuario];
  const datas = [m.revelacao.todos, ...usuarios.map((u) => dataDaConta(m.revelacao, u))].filter(Boolean);
  return datas.length ? datas.sort()[0] : null;
}

const podeLer = (conta, m) => Boolean(conta.admin || reveladaEm(m, conta));

// Para quem não pode ler, a memória escondida não existe
function memoriaVisivel(conta, id) {
  const memoria = dados.memorias.find((m) => m.id === id);
  if (!memoria || !podeLer(conta, memoria)) throw semMemoria();
  return memoria;
}

/* ---------- Links no texto ---------- */

const textosDe = (m) => (m.tipo === "livro" ? m.capitulos.map((c) => c.texto) : [m.texto]);

// Os personagens que a conta vê na galeria: os do portal sempre; os outros, se não forem só do administrador
function personagensVisiveis(conta) {
  const outros = (dados.outrosPersonagens ?? []).filter((p) => conta.admin || p.visibilidade !== "admin");
  return [...dados.personagens, ...outros];
}

// Só os alvos que a conta pode ver. Os outros, e os que foram apagados, ficam só como texto na página.
function linksPara(conta, textos) {
  const acontecimentos = new Map((dados.linha?.acontecimentos ?? []).map((ev) => [ev.id, ev]));
  const personagens = new Map(personagensVisiveis(conta).map((p) => [p.id, p]));
  const links = {};
  for (const textoDaMemoria of textos) {
    for (const [, alvo, id] of textoDaMemoria.matchAll(REGEX_LINK)) {
      const chave = `${alvo}:${id}`;
      if (chave in links) continue;
      if (alvo === "evento") {
        const ev = acontecimentos.get(id);
        if (ev && podeVer(conta, ev)) links[chave] = { titulo: ev.titulo };
      } else {
        const personagem = personagens.get(id);
        if (personagem) links[chave] = { nome: personagem.nome };
      }
    }
  }
  return links;
}

/* ---------- Formatos enviados à página ---------- */

// Primeiro as escondidas (só o administrador as vê), da alterada mais recentemente;
// depois as reveladas, da revelada mais recentemente
function ordemDaLista(a, b) {
  if (!a.reveladaEm !== !b.reveladaEm) return a.reveladaEm ? 1 : -1;
  return a.reveladaEm ? doMaisRecente(a.reveladaEm, b.reveladaEm) : doMaisRecente(a.alteradoEm, b.alteradoEm);
}

// O que o "Citar" do formulário oferece: tudo, porque só o administrador escreve
function citaveis() {
  const acontecimentos = [...(dados.linha?.acontecimentos ?? [])]
    .sort((a, b) => chaveDaData(a.data) - chaveDaData(b.data))
    .map((ev) => ({ id: ev.id, titulo: ev.titulo, ano: ev.data.ano }));
  const personagens = personagensVisiveis({ admin: true })
    .map((p) => ({ id: p.id, nome: p.nome }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  return { acontecimentos, personagens };
}

// A lista vai sem os textos, só com o que a lista precisa
function dadosDasMemorias(conta) {
  const memorias = dados.memorias
    .filter((m) => podeLer(conta, m))
    .map((m) => {
      const item = { id: m.id, titulo: m.titulo, reveladaEm: reveladaEm(m, conta) };
      if (conta.admin) Object.assign(item, { tipo: m.tipo, alteradoEm: m.alteradoEm, revelacao: revelacaoPublica(m) });
      return item;
    })
    .sort(ordemDaLista);
  const resposta = { conta: { usuario: conta.usuario, nome: conta.nome, cargo: cargoDe(conta) }, memorias };
  if (conta.admin) {
    resposta.contas = contasMarcaveis().map((c) => ({ usuario: c.usuario, nome: c.nome }));
    resposta.citaveis = citaveis();
  }
  return resposta;
}

function memoriaPublica(m, conta) {
  const publica = {
    id: m.id,
    titulo: m.titulo,
    tipo: m.tipo,
    data: m.data ? dataPublica(m.data, true) : null,
    detalhe: TIPOS.get(m.tipo) ? m.detalhe || "" : "",
  };
  if (m.tipo === "livro") publica.capitulos = m.capitulos.map((c) => ({ titulo: c.titulo, texto: c.texto }));
  else publica.texto = m.texto;
  publica.reveladaEm = reveladaEm(m, conta);
  if (conta.admin) publica.revelacao = revelacaoPublica(m);
  return publica;
}

/* ---------- O que chega do formulário ---------- */

// Todo link precisa mostrar alguma coisa, e no máximo 120 caracteres
function conferirLinks(textoDaMemoria, campo) {
  for (const [, , , aparece] of textoDaMemoria.matchAll(REGEX_LINK)) {
    if (!aparece.trim()) {
      throw new ErroHttp(400, `Um link no campo ${campo} está sem o que aparece. Escreva depois da barra: [[evento:id|o que aparece]].`);
    }
    if (aparece.length > LIMITES.link) {
      throw new ErroHttp(400, `O que aparece num link pode ter no máximo ${LIMITES.link} caracteres (campo ${campo}).`);
    }
  }
}

function textoDaMemoria(valor, campo) {
  const limpo = textoOpcional(valor, campo, LIMITES.texto);
  conferirLinks(limpo, campo);
  return limpo;
}

function capitulosDoLivro(lista) {
  if (!Array.isArray(lista) || !lista.length) throw new ErroHttp(400, "O livro precisa ter pelo menos um capítulo.");
  if (lista.length > LIMITES.capitulos) {
    throw new ErroHttp(400, `O livro pode ter no máximo ${LIMITES.capitulos} capítulos.`);
  }
  let total = 0;
  const capitulos = lista.map((bruto, i) => {
    const capitulo = bruto && typeof bruto === "object" ? bruto : {};
    const titulo = texto(capitulo.titulo, `Título do capítulo ${i + 1}`, 120);
    const textoDoCapitulo = textoDaMemoria(capitulo.texto, `Texto do capítulo ${i + 1}`);
    total += textoDoCapitulo.length;
    return { titulo, texto: textoDoCapitulo };
  });
  if (total > LIMITES.livro) {
    throw new ErroHttp(400, `O livro inteiro pode ter no máximo ${LIMITES.livro} caracteres.`);
  }
  return capitulos;
}

// Confere e limpa o que veio do formulário de uma memória.
// No Livro vale "capitulos" e o texto fica vazio; nos outros, o contrário.
// O "detalhe" só fica nas classificações que têm o campo.
function valoresDaMemoria(corpo) {
  const titulo = texto(corpo.titulo, "Título", 120);
  if (typeof corpo.tipo !== "string" || !TIPOS.has(corpo.tipo)) {
    throw new ErroHttp(400, "Escolha uma classificação da lista.");
  }
  const tipo = corpo.tipo;
  const data = corpo.data ? lerDataDaLinha(corpo.data, dados.linha.anoAtual, true) : null;
  const rotulo = TIPOS.get(tipo);
  const detalhe = rotulo ? textoOpcional(corpo.detalhe, rotulo, 120).replace(/\s*\n\s*/g, " ") : "";
  if (tipo === "livro") return { titulo, tipo, data, detalhe, texto: "", capitulos: capitulosDoLivro(corpo.capitulos) };
  return { titulo, tipo, data, detalhe, texto: textoDaMemoria(corpo.texto, "Texto"), capitulos: [] };
}

// Repete usuários à vontade; uma conta que não existe, ou de administrador, é recusada
function contasEscolhidas(lista) {
  if (!Array.isArray(lista)) throw new ErroHttp(400, "Escolha as contas que vão ler a memória.");
  const usuarios = [...new Set(lista)];
  for (const usuario of usuarios) {
    const conta = dados.contas.find((c) => c.usuario === usuario);
    if (!conta) throw new ErroHttp(400, "Uma das contas escolhidas não existe. Recarregue a página.");
    if (conta.admin) throw new ErroHttp(400, "O administrador já vê todas as memórias. Escolha só as outras contas.");
  }
  return usuarios;
}

/* ---------- Rotas ---------- */

async function tratarMemorias(req, res, rota, metodo, conta) {
  const mudouLinha = garantirLinha();
  if (garantirMemorias() || mudouLinha) await salvarDados();
  let partes;
  try {
    partes = rota.split("/").filter(Boolean).slice(2).map(decodeURIComponent);
  } catch {
    throw new ErroHttp(404, "Endereço não encontrado.");
  }
  const [id, acao, ...resto] = partes;

  if (!resto.length) {
    if (!id && metodo === "GET") return enviarJson(res, 200, dadosDasMemorias(conta));
    if (!id && metodo === "POST") return escreverMemoria(req, res, conta);
    if (id && !acao) {
      if (metodo === "GET") return lerMemoria(res, conta, id);
      if (metodo === "PUT") return alterarMemoria(req, res, conta, id);
      if (metodo === "DELETE") return apagarMemoria(res, conta, id);
    }
    if (id && acao === "revelacao" && metodo === "PUT") return mudarRevelacao(req, res, conta, id);
  }
  throw new ErroHttp(404, "Endereço não encontrado.");
}

function lerMemoria(res, conta, id) {
  const memoria = memoriaVisivel(conta, id);
  enviarJson(res, 200, { memoria: memoriaPublica(memoria, conta), links: linksPara(conta, textosDe(memoria)) });
}

// Toda memória nasce escondida
async function escreverMemoria(req, res, conta) {
  exigirAdmin(conta);
  const valores = valoresDaMemoria(await lerJson(req, LIMITE_JSON));
  if (dados.memorias.length >= LIMITES.memorias) {
    throw new ErroHttp(400, `Podem existir no máximo ${LIMITES.memorias} memórias.`);
  }
  const quando = carimbo();
  const memoria = {
    id: novoId("mem-", new Set(dados.memorias.map((m) => m.id))),
    ...valores,
    revelacao: escondida(),
    criadoEm: quando,
    alteradoEm: quando,
  };
  dados.memorias.push(memoria);
  await salvarDados();
  console.log(`${conta.usuario} escreveu nas Memórias de Draevor: ${memoria.titulo}`);
  enviarJson(res, 201, { memoria: { id: memoria.id } });
}

// Alterar não mexe na revelação
async function alterarMemoria(req, res, conta, id) {
  exigirAdmin(conta);
  const valores = valoresDaMemoria(await lerJson(req, LIMITE_JSON));
  const memoria = memoriaVisivel(conta, id);
  Object.assign(memoria, valores);
  memoria.alteradoEm = carimbo();
  await salvarDados();
  enviarJson(res, 200, { ok: true });
}

async function apagarMemoria(res, conta, id) {
  exigirAdmin(conta);
  const memoria = memoriaVisivel(conta, id);
  dados.memorias = dados.memorias.filter((m) => m !== memoria);
  await salvarDados();
  console.log(`${conta.usuario} apagou das Memórias de Draevor: ${memoria.titulo}`);
  enviarJson(res, 200, { ok: true });
}

// Ninguém: escondida de novo. Todos: a data de agora, ou a que já tinha, e as contas ficam como estão.
// Algumas contas: cada marcada fica com a data que já tinha, ou a de agora; as desmarcadas saem.
async function mudarRevelacao(req, res, conta, id) {
  exigirAdmin(conta);
  const corpo = await lerJson(req, LIMITE_JSON);
  const memoria = memoriaVisivel(conta, id);
  const atual = memoria.revelacao;
  const agora = carimbo();
  if (corpo.para === "ninguem") {
    memoria.revelacao = escondida();
  } else if (corpo.para === "todos") {
    atual.todos = atual.todos || agora;
  } else if (corpo.para === "contas") {
    const usuarios = contasEscolhidas(corpo.contas);
    const contas = Object.fromEntries(usuarios.map((u) => [u, dataDaConta(atual, u) || agora]));
    memoria.revelacao = { todos: null, contas };
  } else {
    throw new ErroHttp(400, "Escolha para quem revelar: ninguém, todos ou algumas contas.");
  }
  await salvarDados();
  enviarJson(res, 200, { ok: true });
}

// Quando alguém troca o próprio usuário, a data em que cada memória foi revelada para ele acompanha
function renomearNasMemorias(antigo, novo) {
  for (const m of dados.memorias ?? []) {
    const contas = m.revelacao?.contas;
    if (!contas || !Object.hasOwn(contas, antigo)) continue;
    contas[novo] = contas[antigo];
    delete contas[antigo];
  }
}

// Conta excluída: sai das memórias reveladas para ela
function desligarContaDasMemorias(conta) {
  for (const m of dados.memorias ?? []) {
    const contas = m.revelacao?.contas;
    if (contas && Object.hasOwn(contas, conta.usuario)) delete contas[conta.usuario];
  }
}

ganchos.renomearConta.push(renomearNasMemorias);
ganchos.excluirConta.push(desligarContaDasMemorias);

// Os endereços /api/memorias/... são desta página. "iniciar" confere os dados ao ligar o portal
// e devolve true quando precisou mudar alguma coisa.
module.exports = { prefixo: "/api/memorias", tratar: tratarMemorias, iniciar: garantirMemorias };
