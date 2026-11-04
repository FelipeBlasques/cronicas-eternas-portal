"use strict";
/* =================================================================
   Crônicas Eternas: Chat
   -----------------------------------------------------------------
   Um espaço só, o do grupo: a Geral, uma categoria por mesa e as
   mensagens privadas entre duas contas. A estrutura (categorias e
   canais) fica em dados.chat; as mensagens, fora do dados.json, em
   chat/canais/<canal>.jsonl e chat/privadas/<a>~<b>.jsonl, uma por
   linha. As lidas, os avisos, as personas escolhidas e as privadas
   ocultas de cada conta ficam em chat/estado.json.

   Quem vê: a Geral, todo mundo; a categoria de uma mesa, o
   administrador e quem tem personagem do portal nela; uma privada,
   só as duas contas (o administrador não lê as dos outros).

   O tempo real sai por /api/chat/eventos (Server-Sent Events).
   ================================================================= */

const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const {
  CONFIG,
  dados,
  salvarDados,
  ganchos,
  ErroHttp,
  enviarJson,
  lerJson,
  texto,
  FONTES,
  FONTE_PADRAO,
  REGEX_USUARIO,
} = require("./base");

const LIMITES = {
  nomeDoCanal: 40,
  canaisPorCategoria: 20,
  texto: 4000,
  pagina: 50, // mensagens do histórico por vez
  paginaMaxima: 100,
  depois: 500, // o que faltou depois de uma reconexão, no máximo
  envios: 10, // mensagens por conta...
  janelaDosEnvios: 10 * 1000, // ...em 10 segundos
  eventosGuardados: 500,
  conexoesPorConta: 5,
  trecho: 100, // caracteres do trecho de uma resposta
};
const INTERVALO_DO_PING = 25 * 1000;
const INTERVALO_DO_ESTADO = 2 * 1000; // o estado.json é gravado no máximo a cada 2 segundos

const PASTA_CHAT = path.join(CONFIG.pastaDados, "chat");
const PASTA_CANAIS = path.join(PASTA_CHAT, "canais");
const PASTA_PRIVADAS = path.join(PASTA_CHAT, "privadas");
const PASTA_IMAGENS = path.join(PASTA_CHAT, "imagens");
const ARQ_ESTADO = path.join(PASTA_CHAT, "estado.json");

const ID_GERAL = "geral";
const PREFIXO_PRIVADA = "privada:";
const TIPOS_DE_CANAL = new Set(["texto", "voz"]);
const TIPOS_DE_PERSONA = new Set(["conta", "personagem", "outro", "mestre"]);
const NIVEIS_DE_AVISO = new Set(["tudo", "mencoes", "nada"]);
const REGEX_ID_CANAL = /^canal-[0-9a-z]{4,40}$/;
const REGEX_ID_MENSAGEM = /^m-([0-9a-z]{1,12})-[0-9a-z]{1,20}$/;
const REGEX_ARQUIVO_CANAL = /^(canal-[0-9a-z]{4,40})\.jsonl$/;
const REGEX_ARQUIVO_PRIVADA = /^([a-z0-9_-]{2,30})~([a-z0-9_-]{2,30})\.jsonl$/;
const REGEX_IMAGEM = /^img-[0-9a-z-]{1,60}\.[a-z0-9]{2,5}$/;

const carimbo = () => new Date().toISOString();
const sorteio = (bytes) => crypto.randomBytes(bytes).toString("hex");
const objeto = (valor) => Boolean(valor) && typeof valor === "object" && !Array.isArray(valor);
const contaDe = (usuario) => dados.contas.find((c) => c.usuario === usuario);
const mesaDe = (id) => dados.campanhas.find((c) => c.id === id);
const fonteDe = (p) => (FONTES.has(p.fonte) ? p.fonte : FONTE_PADRAO);
const logErro = (contexto) => (erro) => console.error(`Chat: ${contexto}:`, erro);

/* =================================================================
   A estrutura: categorias e canais (em dados.chat)
   ================================================================= */

function novoIdDeCanal() {
  const usados = new Set((dados.chat?.canais ?? []).map((c) => c.id));
  let id;
  do id = `canal-${Date.now().toString(36)}${sorteio(3)}`;
  while (usados.has(id));
  return id;
}

function novoCanal(chat, categoria, tipo, nome) {
  const daCategoria = chat.canais.filter((c) => c.categoria === categoria);
  const ordem = daCategoria.length ? Math.max(...daCategoria.map((c) => c.ordem)) + 1 : 0;
  const canal = { id: novoIdDeCanal(), categoria, tipo, nome, ordem, criadoEm: carimbo() };
  chat.canais.push(canal);
  return canal;
}

const idDaCategoriaDaMesa = (idMesa) => `mesa-${idMesa}`;

function criarCategoriaDaMesa(chat, idMesa, ordem) {
  const categoria = { id: idDaCategoriaDaMesa(idMesa), mesa: idMesa, ordem };
  chat.categorias.push(categoria);
  novoCanal(chat, categoria.id, "texto", "conversa");
  novoCanal(chat, categoria.id, "voz", "Sessão");
  return categoria;
}

// Na primeira vez: a Geral e uma categoria para cada mesa da página Mesas com personagem do portal
function chatInicial() {
  const chat = { formato: 1, categorias: [{ id: ID_GERAL, mesa: null, ordem: 0 }], canais: [] };
  dados.chat = chat; // o novoIdDeCanal confere os ids já usados
  novoCanal(chat, ID_GERAL, "texto", "geral");
  novoCanal(chat, ID_GERAL, "voz", "Sala comum");
  const comPersonagens = new Set(dados.personagens.map((p) => p.campanha));
  for (const mesa of dados.campanhas) {
    if (mesa.naPaginaMesas === false || !comPersonagens.has(mesa.id)) continue;
    criarCategoriaDaMesa(chat, mesa.id, chat.categorias.length);
  }
  return chat;
}

// Ordem 0, 1, 2... sem buracos, nas categorias (a Geral sempre primeiro) e nos canais de cada uma
function renumerar(chat) {
  let mudou = false;
  const categorias = [...chat.categorias].sort((a, b) => (a.id === ID_GERAL ? -1 : b.id === ID_GERAL ? 1 : a.ordem - b.ordem));
  categorias.forEach((c, i) => {
    if (c.ordem !== i) mudou = true;
    c.ordem = i;
  });
  chat.categorias = categorias;
  for (const categoria of categorias) {
    const canais = chat.canais.filter((c) => c.categoria === categoria.id).sort((a, b) => a.ordem - b.ordem);
    canais.forEach((c, i) => {
      if (c.ordem !== i) mudou = true;
      c.ordem = i;
    });
  }
  return mudou;
}

// Cria dados.chat na primeira vez e confere o formato. Uma categoria de mesa que não existe
// mais (apagada por fora) sai com os canais e o histórico. Devolve true se mudou algo.
function garantirChat() {
  if (!objeto(dados.chat)) {
    chatInicial();
    return true;
  }
  const chat = dados.chat;
  let mudou = false;
  if (chat.formato !== 1) {
    chat.formato = 1;
    mudou = true;
  }
  if (!Array.isArray(chat.categorias)) {
    chat.categorias = [];
    mudou = true;
  }
  if (!Array.isArray(chat.canais)) {
    chat.canais = [];
    mudou = true;
  }
  if (!chat.categorias.some((c) => c.id === ID_GERAL)) {
    chat.categorias.unshift({ id: ID_GERAL, mesa: null, ordem: -1 });
    mudou = true;
  }
  const mesas = new Set(dados.campanhas.map((c) => c.id));
  const validas = chat.categorias.filter(
    (c) => objeto(c) && (c.id === ID_GERAL || (typeof c.mesa === "string" && mesas.has(c.mesa) && c.id === idDaCategoriaDaMesa(c.mesa))),
  );
  if (validas.length !== chat.categorias.length) {
    chat.categorias = validas;
    mudou = true;
  }
  const geral = chat.categorias.find((c) => c.id === ID_GERAL);
  if (geral.mesa !== null) {
    geral.mesa = null;
    mudou = true;
  }
  const categorias = new Set(chat.categorias.map((c) => c.id));
  const canais = chat.canais.filter(
    (c) =>
      objeto(c) &&
      REGEX_ID_CANAL.test(c.id) &&
      categorias.has(c.categoria) &&
      TIPOS_DE_CANAL.has(c.tipo) &&
      typeof c.nome === "string",
  );
  if (canais.length !== chat.canais.length) {
    const ficam = new Set(canais.map((c) => c.id));
    for (const c of chat.canais) if (!ficam.has(c?.id)) apagarHistorico(c?.id);
    chat.canais = canais;
    mudou = true;
  }
  for (const c of [...chat.categorias, ...chat.canais]) {
    if (!Number.isFinite(c.ordem)) {
      c.ordem = 0;
      mudou = true;
    }
  }
  if (renumerar(chat)) mudou = true;
  return mudou;
}

const categoriaDe = (id) => dados.chat.categorias.find((c) => c.id === id);
const canalDe = (id) => dados.chat.canais.find((c) => c.id === id);
const canaisDa = (categoria) =>
  dados.chat.canais.filter((c) => c.categoria === categoria.id).sort((a, b) => a.ordem - b.ordem);
const categoriasEmOrdem = () => [...dados.chat.categorias].sort((a, b) => a.ordem - b.ordem);

/* =================================================================
   Quem vê o quê
   ================================================================= */

// O administrador vê todas as mesas; as outras contas, só as mesas em que têm personagem do portal
function veCategoria(conta, categoria) {
  if (!categoria) return false;
  if (!categoria.mesa) return true;
  if (!mesaDe(categoria.mesa)) return false;
  if (conta.admin) return true;
  return dados.personagens.some((p) => p.dono === conta.usuario && p.campanha === categoria.mesa);
}

const veCanal = (conta, canal) => Boolean(canal && veCategoria(conta, categoriaDe(canal.categoria)));

/* ---------- As privadas ---------- */

const ehPrivada = (chave) => typeof chave === "string" && chave.startsWith(PREFIXO_PRIVADA);
const chaveDaPrivada = (a, b) => `${PREFIXO_PRIVADA}${[a, b].sort().join("~")}`;
const participantes = (chave) => chave.slice(PREFIXO_PRIVADA.length).split("~");
const outroDaPrivada = (chave, usuario) => participantes(chave).find((u) => u !== usuario) ?? usuario;

// A "chave" de um histórico: o id do canal, ou "privada:<a>~<b>" (as duas contas em ordem alfabética).
// Só as duas contas veem uma privada: o administrador não lê as dos outros.
function veChave(conta, chave) {
  if (ehPrivada(chave)) return participantes(chave).includes(conta.usuario);
  return veCanal(conta, canalDe(chave));
}

/* =================================================================
   Os históricos (os .jsonl)
   ================================================================= */

const historicos = new Map(); // chave → { chave, arquivo, mensagens, fila, semQuebra }
const ondeEsta = new Map(); // id da mensagem → chave, para as rotas de editar e apagar

function arquivoDa(chave) {
  if (ehPrivada(chave)) return path.join(PASTA_PRIVADAS, `${participantes(chave).join("~")}.jsonl`);
  return path.join(PASTA_CANAIS, `${chave}.jsonl`);
}

function novoHistorico(chave) {
  const h = { chave, arquivo: arquivoDa(chave), mensagens: [], fila: Promise.resolve(), semQuebra: false };
  historicos.set(chave, h);
  return h;
}

const historicoDe = (chave) => historicos.get(chave) ?? novoHistorico(chave);
const mensagensDe = (chave) => historicos.get(chave)?.mensagens ?? [];

// Confere uma linha lida do disco. Devolve a mensagem ou null.
function conferirMensagem(m) {
  if (!objeto(m) || typeof m.id !== "string" || !REGEX_ID_MENSAGEM.test(m.id)) return null;
  if (typeof m.em !== "string" || typeof m.autor !== "string" || typeof m.texto !== "string") return null;
  const p = m.persona;
  if (!objeto(p) || !TIPOS_DE_PERSONA.has(p.tipo) || typeof p.id !== "string" || typeof p.nome !== "string") return null;
  return {
    id: m.id,
    em: m.em,
    editadaEm: typeof m.editadaEm === "string" ? m.editadaEm : null,
    autor: m.autor,
    persona: {
      tipo: p.tipo,
      id: p.id,
      nome: p.nome,
      imagem: typeof p.imagem === "string" ? p.imagem : null,
      fonte: typeof p.fonte === "string" ? p.fonte : null,
    },
    texto: m.texto,
    imagens: Array.isArray(m.imagens) ? m.imagens.filter((a) => typeof a === "string" && REGEX_IMAGEM.test(a)) : [],
    resposta: typeof m.resposta === "string" ? m.resposta : null,
  };
}

// Uma linha que não dá para ler é pulada e registrada no log; o resto do arquivo vale.
// O arquivo não é regravado por isso: só por uma edição ou exclusão que alguém pediu.
function lerHistorico(chave, arquivo) {
  const conteudo = fs.readFileSync(arquivo, "utf8");
  const h = novoHistorico(chave);
  h.arquivo = arquivo;
  conteudo.split("\n").forEach((linha, i) => {
    if (!linha.trim()) return;
    let m = null;
    try {
      m = conferirMensagem(JSON.parse(linha));
    } catch {
      // segue para o aviso abaixo
    }
    if (!m) return console.error(`Chat: a linha ${i + 1} de ${arquivo} não pôde ser lida e foi pulada.`);
    if (ondeEsta.has(m.id)) return console.error(`Chat: a linha ${i + 1} de ${arquivo} repete o id ${m.id} e foi pulada.`);
    h.mensagens.push(m);
    ondeEsta.set(m.id, chave);
  });
  // Uma última linha sem quebra (gravação interrompida): a próxima mensagem começa numa linha nova
  h.semQuebra = conteudo.length > 0 && !conteudo.endsWith("\n");
}

// As gravações de cada arquivo ficam em fila. Cada tarefa já leva o caminho e o conteúdo
// do momento em que entrou na fila, para uma regravação não repetir uma linha que ainda
// vai ser acrescentada.
function enfileirar(h, tarefa) {
  const vez = h.fila.catch(() => {}).then(tarefa);
  h.fila = vez;
  return vez;
}

async function gravarInteiro(arquivo, conteudo) {
  const temporario = `${arquivo}.tmp`;
  await fsp.writeFile(temporario, conteudo, { mode: 0o600 });
  await fsp.rename(temporario, arquivo);
}

// Enviar só acrescenta uma linha
function acrescentar(h, m) {
  const arquivo = h.arquivo;
  const linha = `${h.semQuebra ? "\n" : ""}${JSON.stringify(m)}\n`;
  h.semQuebra = false;
  return enfileirar(h, () => fsp.appendFile(arquivo, linha, { mode: 0o600 }));
}

// Editar e apagar regravam o arquivo inteiro, para o texto antigo não ficar no disco
function regravar(h) {
  const arquivo = h.arquivo;
  const conteudo = h.mensagens.map((m) => `${JSON.stringify(m)}\n`).join("");
  h.semQuebra = false;
  return enfileirar(h, () => gravarInteiro(arquivo, conteudo));
}

async function apagarImagensDoChat(arquivos) {
  for (const arquivo of arquivos) {
    if (!REGEX_IMAGEM.test(arquivo)) continue;
    try {
      await fsp.rm(path.join(PASTA_IMAGENS, arquivo), { force: true });
    } catch (erro) {
      console.error(erro);
    }
  }
}

// Um canal apagado leva o histórico e as imagens das mensagens
function apagarHistorico(chave) {
  if (typeof chave !== "string") return;
  const h = historicos.get(chave);
  const arquivo = h?.arquivo ?? arquivoDa(chave);
  const imagens = [];
  if (h) {
    for (const m of h.mensagens) {
      ondeEsta.delete(m.id);
      imagens.push(...m.imagens);
    }
    historicos.delete(chave);
  }
  const apagar = async () => {
    await fsp.rm(arquivo, { force: true });
    await apagarImagensDoChat(imagens);
  };
  (h ? enfileirar(h, apagar) : apagar()).catch(logErro(`não foi possível apagar ${arquivo}`));
  // As lidas e os avisos desse canal saem do estado de cada conta
  let mudou = false;
  for (const e of Object.values(estado)) {
    if (objeto(e.lidas) && chave in e.lidas) {
      delete e.lidas[chave];
      mudou = true;
    }
    if (objeto(e.avisos) && chave in e.avisos) {
      delete e.avisos[chave];
      mudou = true;
    }
  }
  if (mudou) marcarEstado();
}

function lerHistoricos() {
  const conhecidos = new Set(dados.chat.canais.map((c) => c.id));
  for (const nome of fs.readdirSync(PASTA_CANAIS)) {
    const achado = REGEX_ARQUIVO_CANAL.exec(nome);
    if (!achado) continue;
    if (!conhecidos.has(achado[1])) {
      console.error(`Chat: ${nome} não é de nenhum canal e ficou de fora.`);
      continue;
    }
    lerHistorico(achado[1], path.join(PASTA_CANAIS, nome));
  }
  for (const nome of fs.readdirSync(PASTA_PRIVADAS)) {
    const achado = REGEX_ARQUIVO_PRIVADA.exec(nome);
    if (!achado || achado[1] >= achado[2]) continue;
    lerHistorico(chaveDaPrivada(achado[1], achado[2]), path.join(PASTA_PRIVADAS, nome));
  }
}

/* ---------- Posições no histórico ---------- */

// O id leva o tempo em base 36: serve para achar o lugar de uma mensagem que já foi apagada
function tempoDoId(id) {
  const achado = typeof id === "string" ? REGEX_ID_MENSAGEM.exec(id) : null;
  return achado ? parseInt(achado[1], 36) : NaN;
}

function novoIdDeMensagem() {
  let id;
  do id = `m-${Date.now().toString(36)}-${sorteio(4)}`;
  while (ondeEsta.has(id));
  return id;
}

function indiceDe(lista, id) {
  for (let i = lista.length - 1; i >= 0; i--) if (lista[i].id === id) return i;
  return -1;
}

// O índice da primeira mensagem depois de "id" (ou, se ela foi apagada, depois do tempo dela)
function posicaoDepois(lista, id) {
  const i = indiceDe(lista, id);
  if (i >= 0) return i + 1;
  const t = tempoDoId(id);
  let k = lista.length;
  while (k > 0 && tempoDoId(lista[k - 1].id) > t) k--;
  return k;
}

// O índice da própria mensagem "id" (ou da primeira com tempo igual ou maior)
function posicaoAntes(lista, id) {
  const i = indiceDe(lista, id);
  if (i >= 0) return i;
  const t = tempoDoId(id);
  let k = lista.length;
  while (k > 0 && tempoDoId(lista[k - 1].id) >= t) k--;
  return k;
}

function acharMensagem(id) {
  const chave = ondeEsta.get(id);
  if (!chave) return null;
  const h = historicos.get(chave);
  const i = h ? indiceDe(h.mensagens, id) : -1;
  return i >= 0 ? { chave, h, m: h.mensagens[i], indice: i } : null;
}

/* =================================================================
   O estado de cada conta (estado.json)
   ================================================================= */

let estado = {};
let esperaDoEstado = null;
let ultimaGravacaoDoEstado = 0;
let filaDoEstado = Promise.resolve();

function lerEstado() {
  try {
    const lido = JSON.parse(fs.readFileSync(ARQ_ESTADO, "utf8"));
    estado = objeto(lido) ? lido : {};
  } catch (erro) {
    if (erro.code !== "ENOENT") console.error(`Chat: não foi possível ler ${ARQ_ESTADO}; o estado começa vazio.`, erro);
    estado = {};
  }
  for (const [usuario, e] of Object.entries(estado)) {
    if (!objeto(e)) delete estado[usuario];
  }
}

// Só lê: uma conta que nunca abriu o chat não ganha registro no estado
function estadoLido(usuario) {
  const e = estado[usuario];
  return {
    lidas: objeto(e?.lidas) ? e.lidas : {},
    avisos: objeto(e?.avisos) ? e.avisos : {},
    personas: objeto(e?.personas) ? e.personas : {},
    ocultas: Array.isArray(e?.ocultas) ? e.ocultas : [],
  };
}

// Para mudar: cria o registro e as partes que faltam
function estadoDe(usuario) {
  if (!objeto(estado[usuario])) estado[usuario] = {};
  const e = estado[usuario];
  if (!objeto(e.lidas)) e.lidas = {};
  if (!objeto(e.avisos)) e.avisos = {};
  if (!objeto(e.personas)) e.personas = {};
  if (!Array.isArray(e.ocultas)) e.ocultas = [];
  return e;
}

// Grava no máximo a cada 2 segundos: as mudanças que chegam no meio vão juntas
function marcarEstado() {
  if (esperaDoEstado) return;
  const espera = Math.max(0, ultimaGravacaoDoEstado + INTERVALO_DO_ESTADO - Date.now());
  esperaDoEstado = setTimeout(gravarEstado, espera);
}

function gravarEstado() {
  esperaDoEstado = null;
  ultimaGravacaoDoEstado = Date.now();
  const conteudo = JSON.stringify(estado, null, 2);
  filaDoEstado = filaDoEstado
    .catch(() => {})
    .then(() => gravarInteiro(ARQ_ESTADO, conteudo))
    .catch(logErro(`não foi possível gravar ${ARQ_ESTADO}`));
}

const nivelDeAviso = (usuario, idCanal) => {
  const nivel = estadoLido(usuario).avisos[idCanal];
  return NIVEIS_DE_AVISO.has(nivel) ? nivel : "tudo";
};

/* =================================================================
   As personas: o nome e a imagem de quem fala
   ================================================================= */

// A imagem da conta é um selo com a inicial, que a página desenha: aqui vai null
const personaDaConta = (conta) => ({ tipo: "conta", id: conta.usuario, nome: conta.nome, imagem: null, fonte: null });
const personaDoPersonagem = (p) => ({ tipo: "personagem", id: p.id, nome: p.nome, imagem: p.retrato || null, fonte: fonteDe(p) });
const personaDoOutro = (p) => ({ tipo: "outro", id: p.id, nome: p.nome, imagem: p.retrato || null, fonte: fonteDe(p) });
// O Mestre de uma mesa: a imagem é o logo da mesa (sem logo, a página desenha o selo "M")
const personaDoMestre = (mesa) => ({ tipo: "mestre", id: mesa.id, nome: "Mestre", imagem: mesa.titulo || null, fonte: null });
const mesmaPersona = (a, b) => Boolean(a && b && a.tipo === b.tipo && a.id === b.id);
const soOTipoEOId = (p) => (p ? { tipo: p.tipo, id: p.id } : null);

// As personas que a conta pode usar nos canais de uma mesa. O administrador: o Mestre e os
// outros personagens que têm a mesa. As outras contas: os personagens do portal delas na mesa.
function opcoesDaMesa(conta, idMesa) {
  const mesa = mesaDe(idMesa);
  if (!mesa) return [];
  if (conta.admin) {
    const outros = (dados.outrosPersonagens ?? []).filter((p) => Array.isArray(p.mesas) && p.mesas.includes(idMesa));
    return [personaDoMestre(mesa), ...outros.map(personaDoOutro)];
  }
  return dados.personagens.filter((p) => p.dono === conta.usuario && p.campanha === idMesa).map(personaDoPersonagem);
}

// A guardada, se ainda vale; senão a primeira (o Mestre, para o administrador)
function personaEscolhida(conta, idMesa, opcoes = opcoesDaMesa(conta, idMesa)) {
  const guardada = estadoLido(conta.usuario).personas[idMesa];
  return opcoes.find((o) => mesmaPersona(o, guardada)) ?? opcoes[0] ?? null;
}

// A persona da conta num histórico: na Geral e nas privadas, a conta; na mesa, a escolhida
function personaNo(conta, chave) {
  if (ehPrivada(chave)) return personaDaConta(conta);
  const categoria = categoriaDe(canalDe(chave)?.categoria);
  return categoria?.mesa ? personaEscolhida(conta, categoria.mesa) : personaDaConta(conta);
}

function personaPedida(valor) {
  if (valor === undefined || valor === null) return null;
  if (!objeto(valor) || typeof valor.tipo !== "string" || typeof valor.id !== "string") {
    throw new ErroHttp(400, "A persona enviada não está num formato válido.");
  }
  return { tipo: valor.tipo, id: valor.id };
}

const personaRecusada = () => new ErroHttp(403, "Você não pode falar com essa persona aqui.", "persona");

// Confere a persona de uma mensagem. Sem persona pedida, vale a escolhida.
function personaParaFalar(conta, chave, valor) {
  const pedida = personaPedida(valor);
  const categoria = ehPrivada(chave) ? null : categoriaDe(canalDe(chave)?.categoria);
  if (!categoria?.mesa) {
    if (pedida && !mesmaPersona(pedida, { tipo: "conta", id: conta.usuario })) throw personaRecusada();
    return personaDaConta(conta);
  }
  const opcoes = opcoesDaMesa(conta, categoria.mesa);
  if (pedida) {
    const achada = opcoes.find((o) => mesmaPersona(o, pedida));
    if (!achada) throw personaRecusada();
    return achada;
  }
  const escolhida = personaEscolhida(conta, categoria.mesa, opcoes);
  if (!escolhida) throw personaRecusada();
  return escolhida;
}

// Na tela vale o nome e a imagem de agora, se o personagem ainda existe; senão, a cópia guardada
function personaAtual(copia) {
  if (copia.tipo === "personagem") {
    const p = dados.personagens.find((x) => x.id === copia.id);
    if (p) return personaDoPersonagem(p);
  } else if (copia.tipo === "outro") {
    const p = (dados.outrosPersonagens ?? []).find((x) => x.id === copia.id);
    if (p) return personaDoOutro(p);
  } else if (copia.tipo === "mestre") {
    const mesa = mesaDe(copia.id);
    if (mesa) return personaDoMestre(mesa);
  } else if (copia.tipo === "conta") {
    const conta = contaDe(copia.id);
    if (conta) return personaDaConta(conta);
  }
  return { tipo: copia.tipo, id: copia.id, nome: copia.nome, imagem: copia.imagem, fonte: copia.fonte };
}

/* =================================================================
   As mensagens como a página recebe
   ================================================================= */

const menciona = (m, usuario) =>
  m.autor !== usuario && (m.texto.includes(`<@${usuario}>`) || m.texto.includes("<@todos>"));

function trechoDe(textoDaMensagem) {
  const corrido = textoDaMensagem.replace(/\s+/g, " ").trim();
  const letras = [...corrido];
  return letras.length > LIMITES.trecho ? `${letras.slice(0, LIMITES.trecho).join("")}…` : corrido;
}

// O nome guardado de uma conta que já não existe: a persona dela numa mensagem, se houver
function nomeGuardado(usuario, lista) {
  for (let i = lista.length - 1; i >= 0; i--) {
    const m = lista[i];
    if (m.autor === usuario && m.persona.tipo === "conta") return m.persona.nome;
  }
  return usuario;
}

function mensagemPublica(m, chave, conta) {
  const autor = contaDe(m.autor);
  let resposta = null;
  if (m.resposta) {
    const original = acharMensagem(m.resposta);
    resposta = original
      ? { id: original.m.id, nome: personaAtual(original.m.persona).nome, trecho: trechoDe(original.m.texto) }
      : { id: m.resposta, apagada: true };
  }
  const privada = ehPrivada(chave);
  return {
    id: m.id,
    canal: chave,
    em: m.em,
    editadaEm: m.editadaEm,
    autor: {
      usuario: m.autor,
      nomeConta: autor ? autor.nome : m.persona.tipo === "conta" ? m.persona.nome : nomeGuardado(m.autor, mensagensDe(chave)),
    },
    persona: personaAtual(m.persona),
    texto: m.texto,
    imagens: m.imagens.map((arquivo) => `/api/chat/imagens/${arquivo}`),
    resposta,
    mencionaVoce: menciona(m, conta.usuario),
    podeEditar: m.autor === conta.usuario,
    podeApagar: m.autor === conta.usuario || (Boolean(conta.admin) && !privada),
  };
}

/* =================================================================
   Não lidas
   ================================================================= */

// Conta de trás para frente até a última vista. Mensagens da própria conta não contam.
function contarNaoLidas(chave, usuario) {
  const lista = mensagensDe(chave);
  const ate = estadoLido(usuario).lidas[chave];
  const t = ate ? tempoDoId(ate) : -Infinity;
  let naoLidas = 0;
  let mencoes = 0;
  for (let i = lista.length - 1; i >= 0; i--) {
    const m = lista[i];
    if (m.id === ate || tempoDoId(m.id) < t) break;
    if (m.autor === usuario) continue;
    naoLidas++;
    if (menciona(m, usuario)) mencoes++;
  }
  return { naoLidas, mencoes };
}

// As privadas da conta (com pelo menos uma mensagem), as ocultas incluídas
function privadasDa(usuario) {
  const lista = [];
  for (const h of historicos.values()) {
    if (ehPrivada(h.chave) && h.mensagens.length && participantes(h.chave).includes(usuario)) lista.push(h);
  }
  return lista;
}

// Para o botão Chat do portal (/api/barra)
function resumoDoChat(conta) {
  if (!objeto(dados.chat) || !Array.isArray(dados.chat.canais)) return { naoLidas: 0, mencoes: 0 };
  let naoLidas = 0;
  let mencoes = 0;
  for (const canal of dados.chat.canais) {
    if (canal.tipo !== "texto" || !veCanal(conta, canal)) continue;
    const contagem = contarNaoLidas(canal.id, conta.usuario);
    if (nivelDeAviso(conta.usuario, canal.id) === "tudo") naoLidas += contagem.naoLidas;
    mencoes += contagem.mencoes;
  }
  // Privada não lida conta como menção
  for (const h of privadasDa(conta.usuario)) {
    const { naoLidas: n } = contarNaoLidas(h.chave, conta.usuario);
    naoLidas += n;
    mencoes += n;
  }
  return { naoLidas, mencoes };
}

/* =================================================================
   O estado inicial (GET /api/chat)
   ================================================================= */

const vozConfigurada = () => Boolean(CONFIG.livekitUrl && CONFIG.livekitChave && CONFIG.livekitSegredo);

function nomeDaCategoria(categoria) {
  if (!categoria.mesa) return { nome: "Geral", cor: null };
  const mesa = mesaDe(categoria.mesa);
  return { nome: mesa?.nome ?? categoria.mesa, cor: mesa?.cor || "#2e3756" };
}

function estadoInicial(conta) {
  const usuario = conta.usuario;
  const visiveis = categoriasEmOrdem().filter((c) => veCategoria(conta, c));
  const categorias = visiveis.map((categoria) => ({
    id: categoria.id,
    ...nomeDaCategoria(categoria),
    mesa: categoria.mesa,
    canais: canaisDa(categoria).map((canal) =>
      canal.tipo === "texto"
        ? { id: canal.id, tipo: canal.tipo, nome: canal.nome, ...contarNaoLidas(canal.id, usuario), aviso: nivelDeAviso(usuario, canal.id) }
        : { id: canal.id, tipo: canal.tipo, nome: canal.nome },
    ),
  }));

  const ocultas = new Set(estadoLido(usuario).ocultas);
  const privadas = privadasDa(usuario)
    .filter((h) => !ocultas.has(h.chave))
    .map((h) => {
      const outro = outroDaPrivada(h.chave, usuario);
      const contaDoOutro = contaDe(outro);
      return {
        id: h.chave,
        com: { usuario: outro, nome: contaDoOutro ? contaDoOutro.nome : nomeGuardado(outro, h.mensagens) },
        naoLidas: contarNaoLidas(h.chave, usuario).naoLidas,
        ultimaEm: h.mensagens[h.mensagens.length - 1].em,
        ativa: Boolean(contaDoOutro),
      };
    })
    .sort((a, b) => (a.ultimaEm < b.ultimaEm ? 1 : a.ultimaEm > b.ultimaEm ? -1 : 0));

  const personas = {};
  for (const categoria of visiveis) {
    if (!categoria.mesa) continue;
    const opcoes = opcoesDaMesa(conta, categoria.mesa);
    personas[categoria.mesa] = { opcoes, escolhida: soOTipoEOId(personaEscolhida(conta, categoria.mesa, opcoes)) };
  }

  // Quem vê cada categoria e, de cada um, a persona naquela categoria (para as menções
  // e para a coluna da direita): na Geral, a conta; na mesa, a persona escolhida
  const membros = {};
  const personasDosMembros = {};
  for (const categoria of visiveis) {
    const quem = dados.contas.filter((c) => veCategoria(c, categoria));
    membros[categoria.id] = quem.map((c) => c.usuario);
    personasDosMembros[categoria.id] = Object.fromEntries(
      quem.map((c) => [c.usuario, categoria.mesa ? personaEscolhida(c, categoria.mesa) : personaDaConta(c)]),
    );
  }

  const online = usuariosNoChat();
  return {
    conta: { usuario, nome: conta.nome, admin: Boolean(conta.admin) },
    categorias,
    privadas,
    contas: dados.contas.map((c) => ({ usuario: c.usuario, nome: c.nome, noChat: online.has(c.usuario) })),
    personas,
    membros,
    personasDosMembros,
    voz: { configurada: vozConfigurada(), salas: {} },
  };
}

/* =================================================================
   Tempo real (Server-Sent Events)
   ================================================================= */

// A época é sorteada quando o portal liga: um Last-Event-ID de antes de ligar pede "recarregar"
const EPOCA = sorteio(4);
let contador = 0;
const guardados = []; // os últimos eventos, para reenviar o que faltou numa reconexão
const conexoes = new Set(); // { usuario, versao, res, desde }

// A conexão vale enquanto a conta existe com a mesma versão (trocar a senha ou o usuário a fecha)
function contaDaConexao(con) {
  const conta = contaDe(con.usuario);
  return conta && (conta.versao || 0) === con.versao ? conta : null;
}

function usuariosNoChat() {
  const online = new Set();
  for (const con of conexoes) if (contaDaConexao(con)) online.add(con.usuario);
  return online;
}

function escrever(con, texto) {
  if (con.res.writableEnded || con.res.destroyed) return;
  con.res.write(texto);
}

function entregar(con, evento) {
  const conta = contaDaConexao(con);
  if (!conta) return fecharConexao(con);
  let corpo;
  try {
    corpo = evento.para(conta);
  } catch (erro) {
    return console.error(erro);
  }
  if (corpo === null || corpo === undefined) return;
  escrever(con, `id: ${EPOCA}-${evento.n}\nevent: ${evento.tipo}\ndata: ${JSON.stringify(corpo)}\n\n`);
}

// "para(conta)" monta o corpo para cada conta, conferindo no envio quem pode ver; null = não manda.
// O mesmo vale ao reenviar numa reconexão: o que a conta deixou de ver não vai.
function emitir(tipo, para) {
  const evento = { n: ++contador, tipo, para };
  guardados.push(evento);
  if (guardados.length > LIMITES.eventosGuardados) guardados.shift();
  for (const con of [...conexoes]) entregar(con, evento);
}

// Só para quem vê o histórico
const paraQuemVe = (chave, corpo) => (conta) => (veChave(conta, chave) ? corpo(conta) : null);

let ultimaPresenca = "";
function avisarPresenca() {
  const noChat = [...usuariosNoChat()].sort();
  const assinatura = noChat.join(",");
  if (assinatura === ultimaPresenca) return;
  ultimaPresenca = assinatura;
  emitir("presenca", () => ({ noChat }));
}

function fecharConexao(con) {
  if (!conexoes.delete(con)) return;
  if (!con.res.writableEnded) con.res.end();
  avisarPresenca();
}

function reenviar(con, ultimoId) {
  const [epoca, numero] = String(ultimoId).split("-");
  const n = Number(numero);
  const primeiro = guardados.length ? guardados[0].n : contador + 1;
  const daMemoria = epoca === EPOCA && Number.isInteger(n) && n <= contador && n >= primeiro - 1;
  if (!daMemoria) {
    escrever(con, `id: ${EPOCA}-${contador}\nevent: recarregar\ndata: {}\n\n`);
    return;
  }
  for (const evento of guardados) if (evento.n > n) entregar(con, evento);
}

function abrirEventos(req, res, conta) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Accel-Buffering": "no",
  });
  res.write(": conectado\n\n");
  const con = { usuario: conta.usuario, versao: conta.versao || 0, res, desde: Date.now() };

  // Até 5 conexões por conta: na sexta, a mais antiga é fechada
  const daConta = [...conexoes].filter((c) => c.usuario === conta.usuario).sort((a, b) => a.desde - b.desde);
  while (daConta.length >= LIMITES.conexoesPorConta) fecharConexao(daConta.shift());

  conexoes.add(con);
  const terminar = () => fecharConexao(con);
  req.on("close", terminar);
  res.on("close", terminar);
  res.on("error", terminar);

  const ultimo = req.headers["last-event-id"];
  if (ultimo) reenviar(con, ultimo);
  avisarPresenca();
}

// Um comentário a cada 25 segundos mantém a conexão viva (e fecha a de quem perdeu a sessão)
function pingar() {
  for (const con of [...conexoes]) {
    if (!contaDaConexao(con)) fecharConexao(con);
    else escrever(con, ": ping\n\n");
  }
}

const avisarCanais = () => emitir("canais", () => ({}));

/* =================================================================
   Rotas das mensagens
   ================================================================= */

function textoDaMensagem(valor, podeFicarVazio = false) {
  if (valor !== undefined && valor !== null && typeof valor !== "string") {
    throw new ErroHttp(400, "O texto da mensagem não está num formato válido.");
  }
  // Tira as linhas em branco do começo e os espaços do fim; o resto fica como foi escrito
  const limpo = String(valor ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/^(?:[ \t]*\n)+/, "")
    .trimEnd();
  if (!limpo.trim() && !podeFicarVazio) throw new ErroHttp(400, "Escreva alguma coisa antes de enviar.");
  if (limpo.length > LIMITES.texto) throw new ErroHttp(400, "A mensagem pode ter no máximo 4.000 caracteres.");
  return limpo.trim() ? limpo : "";
}

// 10 mensagens em 10 segundos por conta
const envios = new Map();
function conferirLimite(usuario) {
  const agora = Date.now();
  const recentes = (envios.get(usuario) ?? []).filter((t) => agora - t < LIMITES.janelaDosEnvios);
  if (recentes.length >= LIMITES.envios) {
    envios.set(usuario, recentes);
    throw new ErroHttp(429, "Calma: espere alguns segundos.", "limite");
  }
  recentes.push(agora);
  envios.set(usuario, recentes);
}

function respostaValida(chave, valor) {
  if (valor === undefined || valor === null || valor === "") return null;
  const original = typeof valor === "string" ? acharMensagem(valor) : null;
  if (!original || original.chave !== chave) throw new ErroHttp(400, "A mensagem que você quer responder não está neste canal.");
  return original.m.id;
}

function marcarLida(usuario, chave, id) {
  estadoDe(usuario).lidas[chave] = id;
  marcarEstado();
  emitir("lida", (conta) => (conta.usuario === usuario ? { canal: chave, ate: id } : null));
}

async function enviarMensagem(req, res, conta, chave) {
  const corpo = await lerJson(req);
  const textoNovo = textoDaMensagem(corpo.texto);
  const persona = personaParaFalar(conta, chave, corpo.persona);
  const resposta = respostaValida(chave, corpo.resposta);
  conferirLimite(conta.usuario);

  const h = historicoDe(chave);
  const m = {
    id: novoIdDeMensagem(),
    em: carimbo(),
    editadaEm: null,
    autor: conta.usuario,
    persona,
    texto: textoNovo,
    imagens: [],
    resposta,
  };
  h.mensagens.push(m);
  ondeEsta.set(m.id, chave);
  try {
    await acrescentar(h, m);
  } catch (erro) {
    const i = indiceDe(h.mensagens, m.id);
    if (i >= 0) h.mensagens.splice(i, 1);
    ondeEsta.delete(m.id);
    throw erro;
  }

  // A conversa privada oculta volta para a lista das duas contas
  if (ehPrivada(chave)) {
    for (const usuario of participantes(chave)) {
      const e = estado[usuario];
      if (Array.isArray(e?.ocultas) && e.ocultas.includes(chave)) {
        e.ocultas = e.ocultas.filter((k) => k !== chave);
        marcarEstado();
      }
    }
  }
  emitir("mensagem", paraQuemVe(chave, (c) => (indiceDe(h.mensagens, m.id) >= 0 ? { mensagem: mensagemPublica(m, chave, c) } : null)));
  marcarLida(conta.usuario, chave, m.id);
  return enviarJson(res, 201, { mensagem: mensagemPublica(m, chave, conta) });
}

function limiteDoPedido(valor) {
  if (valor === null || valor === "") return LIMITES.pagina;
  const n = Number(valor);
  if (!Number.isInteger(n) || n < 1) throw new ErroHttp(400, "O limite precisa ser um número inteiro positivo.");
  return Math.min(n, LIMITES.paginaMaxima);
}

function idDoPedido(valor) {
  if (!REGEX_ID_MENSAGEM.test(valor)) throw new ErroHttp(400, "O id da mensagem não está num formato válido.");
  return valor;
}

// Para trás (?antes=<id>&limite=50, ou as últimas sem "antes") ou o que faltou (?depois=<id>)
function listarMensagens(req, res, conta, chave) {
  const parametros = new URL(req.url, "http://portal.local").searchParams;
  const lista = mensagensDe(chave);
  const publicas = (fatia) => fatia.map((m) => mensagemPublica(m, chave, conta));
  if (parametros.has("depois")) {
    const inicio = posicaoDepois(lista, idDoPedido(parametros.get("depois")));
    const fatia = lista.slice(inicio, inicio + LIMITES.depois);
    return enviarJson(res, 200, { mensagens: publicas(fatia), maisNovas: inicio + fatia.length < lista.length });
  }
  const limite = limiteDoPedido(parametros.get("limite"));
  const fim = parametros.has("antes") ? posicaoAntes(lista, idDoPedido(parametros.get("antes"))) : lista.length;
  const inicio = Math.max(0, fim - limite);
  return enviarJson(res, 200, { mensagens: publicas(lista.slice(inicio, fim)), maisAntigas: inicio > 0 });
}

const mensagemNaoEncontrada = () => new ErroHttp(404, "Mensagem não encontrada.");

function mensagemVisivel(conta, id) {
  const achada = acharMensagem(id);
  if (!achada || !veChave(conta, achada.chave)) throw mensagemNaoEncontrada();
  return achada;
}

async function editarMensagem(req, res, conta, id) {
  const { chave, h, m } = mensagemVisivel(conta, id);
  if (m.autor !== conta.usuario) throw new ErroHttp(403, "Só quem escreveu a mensagem pode editá-la.");
  const corpo = await lerJson(req);
  const textoNovo = textoDaMensagem(corpo.texto, m.imagens.length > 0);
  const antes = { texto: m.texto, editadaEm: m.editadaEm };
  m.texto = textoNovo;
  m.editadaEm = carimbo();
  try {
    await regravar(h);
  } catch (erro) {
    Object.assign(m, antes);
    throw erro;
  }
  emitir("editada", paraQuemVe(chave, (c) => (indiceDe(h.mensagens, m.id) >= 0 ? { mensagem: mensagemPublica(m, chave, c) } : null)));
  return enviarJson(res, 200, { mensagem: mensagemPublica(m, chave, conta) });
}

async function apagarMensagem(res, conta, id) {
  const { chave, h, m, indice } = mensagemVisivel(conta, id);
  const podeApagar = m.autor === conta.usuario || (conta.admin && !ehPrivada(chave));
  if (!podeApagar) throw new ErroHttp(403, "Você não pode apagar essa mensagem.");
  h.mensagens.splice(indice, 1);
  ondeEsta.delete(m.id);
  try {
    await regravar(h);
  } catch (erro) {
    h.mensagens.splice(Math.min(indice, h.mensagens.length), 0, m);
    ondeEsta.set(m.id, chave);
    throw erro;
  }
  await apagarImagensDoChat(m.imagens);
  emitir("apagada", paraQuemVe(chave, () => ({ id: m.id, canal: chave })));
  return enviarJson(res, 200, { ok: true });
}

/* ---------- Canais e privadas pelo endereço ---------- */

function canalDeTexto(conta, id) {
  const canal = canalDe(id);
  if (!canal || !veCanal(conta, canal)) throw new ErroHttp(404, "Canal não encontrado.");
  if (canal.tipo !== "texto") throw new ErroHttp(400, "Esse canal é uma sala de voz.");
  return canal;
}

// Uma privada com outra conta (ou com uma conta excluída, se a conversa já existe)
function privadaCom(conta, outro) {
  if (!REGEX_USUARIO.test(outro)) throw new ErroHttp(404, "Conta não encontrada.");
  if (outro === conta.usuario) throw new ErroHttp(400, "Escolha outra conta para conversar.");
  const chave = chaveDaPrivada(conta.usuario, outro);
  if (!contaDe(outro) && !mensagensDe(chave).length) throw new ErroHttp(404, "Conta não encontrada.");
  return chave;
}

// O "canal" das rotas de lida: o id de um canal de texto, "privada:<usuario>" ou "privada:<a>~<b>"
function chaveDoCanal(conta, valor) {
  if (typeof valor !== "string" || !valor) throw new ErroHttp(400, "Diga qual é o canal.");
  if (ehPrivada(valor)) {
    const resto = valor.slice(PREFIXO_PRIVADA.length);
    if (resto.includes("~")) {
      const chave = chaveDaPrivada(...resto.split("~", 2));
      if (chave !== valor || !veChave(conta, chave)) throw new ErroHttp(404, "Conversa não encontrada.");
      return chave;
    }
    return privadaCom(conta, resto);
  }
  return canalDeTexto(conta, valor).id;
}

async function marcarLidaPeloPedido(req, res, conta) {
  const { canal, ate } = await lerJson(req);
  const chave = chaveDoCanal(conta, canal);
  if (typeof ate !== "string" || indiceDe(mensagensDe(chave), ate) < 0) throw mensagemNaoEncontrada();
  // Só anda para a frente: uma janela atrasada não desmarca o que outra já viu
  const atual = estadoLido(conta.usuario).lidas[chave];
  const lista = mensagensDe(chave);
  if (!atual || posicaoAntes(lista, ate) >= posicaoDepois(lista, atual)) marcarLida(conta.usuario, chave, ate);
  return enviarJson(res, 200, { ok: true });
}

async function mudarAviso(req, res, conta) {
  const { canal, nivel } = await lerJson(req);
  if (ehPrivada(canal)) throw new ErroHttp(400, "As mensagens privadas avisam sempre.");
  const id = canalDeTexto(conta, canal).id;
  if (!NIVEIS_DE_AVISO.has(nivel)) throw new ErroHttp(400, "Escolha Tudo, Só menções ou Nada.");
  const e = estadoDe(conta.usuario);
  if (nivel === "tudo") delete e.avisos[id];
  else e.avisos[id] = nivel;
  marcarEstado();
  return enviarJson(res, 200, { canal: id, nivel });
}

async function escolherPersona(req, res, conta) {
  const { mesa, persona } = await lerJson(req);
  const categoria = typeof mesa === "string" ? categoriaDe(idDaCategoriaDaMesa(mesa)) : null;
  if (!categoria || !veCategoria(conta, categoria)) throw new ErroHttp(404, "Mesa não encontrada.");
  const pedida = personaPedida(persona);
  if (!pedida) throw new ErroHttp(400, "Escolha uma persona.");
  const achada = opcoesDaMesa(conta, mesa).find((o) => mesmaPersona(o, pedida));
  if (!achada) throw personaRecusada();
  estadoDe(conta.usuario).personas[mesa] = soOTipoEOId(achada);
  marcarEstado();
  // A persona aparece para os outros nas menções e na lista de membros
  emitir("canais", (c) => (veCategoria(c, categoriaDe(categoria.id)) ? {} : null));
  return enviarJson(res, 200, { mesa, escolhida: soOTipoEOId(achada) });
}

function ocultarPrivada(res, conta, outro) {
  const chave = privadaCom(conta, outro);
  const e = estadoDe(conta.usuario);
  if (!e.ocultas.includes(chave)) {
    e.ocultas.push(chave);
    marcarEstado();
  }
  return enviarJson(res, 200, { ok: true });
}

/* =================================================================
   Rotas do administrador: canais e categorias
   ================================================================= */

function exigirAdmin(conta) {
  if (!conta.admin) throw new ErroHttp(403, "Só o administrador pode fazer isso.");
}

const nomeDoCanal = (valor) => texto(valor, "Nome do canal", LIMITES.nomeDoCanal);

async function criarCanal(req, res, conta) {
  exigirAdmin(conta);
  const corpo = await lerJson(req);
  const categoria = categoriaDe(corpo.categoria);
  if (!categoria) throw new ErroHttp(404, "Categoria não encontrada.");
  if (!TIPOS_DE_CANAL.has(corpo.tipo)) throw new ErroHttp(400, "O canal precisa ser de texto ou de voz.");
  const nome = nomeDoCanal(corpo.nome);
  if (canaisDa(categoria).length >= LIMITES.canaisPorCategoria) {
    throw new ErroHttp(400, "Cada categoria pode ter no máximo 20 canais.");
  }
  const canal = novoCanal(dados.chat, categoria.id, corpo.tipo, nome);
  await salvarDados();
  avisarCanais();
  return enviarJson(res, 201, { canal });
}

async function alterarCanal(req, res, conta, id) {
  exigirAdmin(conta);
  const canal = canalDe(id);
  if (!canal) throw new ErroHttp(404, "Canal não encontrado.");
  const corpo = await lerJson(req);
  const nome = corpo.nome === undefined ? canal.nome : nomeDoCanal(corpo.nome);
  if (corpo.ordem !== undefined && !Number.isInteger(corpo.ordem)) throw new ErroHttp(400, "A ordem precisa ser um número inteiro.");
  canal.nome = nome;
  if (corpo.ordem !== undefined) {
    // Tira o canal do lugar e põe na posição pedida, dentro da mesma categoria
    const irmaos = canaisDa(categoriaDe(canal.categoria)).filter((c) => c !== canal);
    const posicao = Math.max(0, Math.min(corpo.ordem, irmaos.length));
    irmaos.splice(posicao, 0, canal);
    irmaos.forEach((c, i) => (c.ordem = i));
  }
  await salvarDados();
  avisarCanais();
  return enviarJson(res, 200, { canal });
}

// Tira os canais da estrutura e apaga o histórico deles (sem salvar o dados.json)
function tirarCanais(canais) {
  const saem = new Set(canais.map((c) => c.id));
  dados.chat.canais = dados.chat.canais.filter((c) => !saem.has(c.id));
  for (const id of saem) apagarHistorico(id);
}

async function apagarCanal(res, conta, id) {
  exigirAdmin(conta);
  const canal = canalDe(id);
  if (!canal) throw new ErroHttp(404, "Canal não encontrado.");
  tirarCanais([canal]);
  renumerar(dados.chat);
  await salvarDados();
  avisarCanais();
  return enviarJson(res, 200, { ok: true });
}

// Quais mesas têm categoria, na ordem. Uma mesa nova ganha "conversa" e "Sessão"; uma que
// sai da lista leva os canais e o histórico deles.
async function escolherCategorias(req, res, conta) {
  exigirAdmin(conta);
  const { mesas } = await lerJson(req);
  if (!Array.isArray(mesas) || mesas.some((m) => typeof m !== "string")) {
    throw new ErroHttp(400, "Envie a lista das mesas.");
  }
  if (new Set(mesas).size !== mesas.length) throw new ErroHttp(400, "Uma mesa apareceu duas vezes na lista.");
  for (const id of mesas) if (!mesaDe(id)) throw new ErroHttp(400, "Uma das mesas não existe.");

  const chat = dados.chat;
  const ficam = new Set(mesas.map(idDaCategoriaDaMesa));
  const saem = chat.categorias.filter((c) => c.id !== ID_GERAL && !ficam.has(c.id));
  tirarCanais(chat.canais.filter((c) => saem.some((s) => s.id === c.categoria)));
  chat.categorias = chat.categorias.filter((c) => c.id === ID_GERAL || ficam.has(c.id));
  mesas.forEach((idMesa, i) => {
    const categoria = categoriaDe(idDaCategoriaDaMesa(idMesa));
    if (categoria) categoria.ordem = i + 1;
    else criarCategoriaDaMesa(chat, idMesa, i + 1);
  });
  renumerar(chat);
  await salvarDados();
  avisarCanais();
  return enviarJson(res, 200, { ok: true });
}

/* =================================================================
   Distribuição das rotas
   ================================================================= */

async function tratarChat(req, res, rota, metodo, conta) {
  if (garantirChat()) await salvarDados();
  let partes;
  try {
    partes = rota.split("/").filter(Boolean).slice(2).map(decodeURIComponent);
  } catch {
    throw new ErroHttp(404, "Endereço não encontrado.");
  }
  const [recurso, id, acao, ...resto] = partes;
  if (resto.length) throw new ErroHttp(404, "Endereço não encontrado.");

  if (!recurso && metodo === "GET") return enviarJson(res, 200, estadoInicial(conta));
  if (recurso === "eventos" && !id && metodo === "GET") return abrirEventos(req, res, conta);

  if (recurso === "canais") {
    if (!id && metodo === "POST") return criarCanal(req, res, conta);
    if (id && acao === "mensagens") {
      const canal = canalDeTexto(conta, id);
      if (metodo === "GET") return listarMensagens(req, res, conta, canal.id);
      if (metodo === "POST") return enviarMensagem(req, res, conta, canal.id);
    }
    if (id && !acao && metodo === "PUT") return alterarCanal(req, res, conta, id);
    if (id && !acao && metodo === "DELETE") return apagarCanal(res, conta, id);
  }

  if (recurso === "privadas" && id) {
    if (acao === "mensagens") {
      const chave = privadaCom(conta, id);
      if (metodo === "GET") return listarMensagens(req, res, conta, chave);
      if (metodo === "POST") {
        if (!contaDe(id)) throw new ErroHttp(409, "Essa conta não existe mais.", "conta-excluida");
        return enviarMensagem(req, res, conta, chave);
      }
    }
    if (acao === "ocultar" && metodo === "POST") return ocultarPrivada(res, conta, id);
  }

  if (recurso === "mensagens" && id && !acao) {
    if (metodo === "PUT") return editarMensagem(req, res, conta, id);
    if (metodo === "DELETE") return apagarMensagem(res, conta, id);
  }

  if (!id) {
    if (recurso === "lida" && metodo === "POST") return marcarLidaPeloPedido(req, res, conta);
    if (recurso === "avisos" && metodo === "PUT") return mudarAviso(req, res, conta);
    if (recurso === "personas" && metodo === "PUT") return escolherPersona(req, res, conta);
    if (recurso === "categorias" && metodo === "PUT") return escolherCategorias(req, res, conta);
  }

  throw new ErroHttp(404, "Endereço não encontrado.");
}

/* =================================================================
   Ganchos de conta e de mesa
   ================================================================= */

// Troca "antigo" por "novo" nas chaves de privada de uma lista ou de um objeto
function trocarChave(chave, antigo, novo) {
  if (!ehPrivada(chave)) return chave;
  const [a, b] = participantes(chave);
  if (a !== antigo && b !== antigo) return chave;
  return chaveDaPrivada(a === antigo ? novo : a, b === antigo ? novo : b);
}

// O usuário mudou: o autor, as menções, as personas de conta, os arquivos das privadas e o estado
function renomearNoChat(antigo, novo) {
  const mencaoAntiga = `<@${antigo}>`;
  const mencaoNova = `<@${novo}>`;
  for (const h of [...historicos.values()]) {
    let mudou = false;
    for (const m of h.mensagens) {
      if (m.autor === antigo) {
        m.autor = novo;
        mudou = true;
      }
      if (m.persona.tipo === "conta" && m.persona.id === antigo) {
        m.persona.id = novo;
        mudou = true;
      }
      if (m.texto.includes(mencaoAntiga)) {
        m.texto = m.texto.replaceAll(mencaoAntiga, mencaoNova);
        mudou = true;
      }
    }
    const chaveNova = trocarChave(h.chave, antigo, novo);
    if (chaveNova === h.chave) {
      if (mudou) regravar(h).catch(logErro(`não foi possível regravar ${h.arquivo}`));
      continue;
    }
    // A privada muda de nome. Se já existe uma conversa com o nome novo (de uma conta
    // excluída com o mesmo usuário), as duas viram uma só, em ordem de tempo.
    const arquivoAntigo = h.arquivo;
    historicos.delete(h.chave);
    const destino = historicos.get(chaveNova);
    if (destino) {
      destino.mensagens = [...destino.mensagens, ...h.mensagens].sort((x, y) => tempoDoId(x.id) - tempoDoId(y.id));
      for (const m of h.mensagens) ondeEsta.set(m.id, chaveNova);
      regravar(destino).catch(logErro(`não foi possível regravar ${destino.arquivo}`));
    } else {
      h.chave = chaveNova;
      h.arquivo = arquivoDa(chaveNova);
      historicos.set(chaveNova, h);
      for (const m of h.mensagens) ondeEsta.set(m.id, chaveNova);
      regravar(h).catch(logErro(`não foi possível regravar ${h.arquivo}`));
    }
    // Na fila do histórico antigo: depois das linhas que ainda iam para o arquivo antigo
    enfileirar(h, () => fsp.rm(arquivoAntigo, { force: true })).catch(
      logErro(`não foi possível apagar ${arquivoAntigo}`),
    );
  }

  if (objeto(estado[antigo])) {
    estado[novo] = estado[antigo];
    delete estado[antigo];
  }
  for (const e of Object.values(estado)) {
    if (objeto(e.lidas)) {
      e.lidas = Object.fromEntries(Object.entries(e.lidas).map(([k, v]) => [trocarChave(k, antigo, novo), v]));
    }
    if (Array.isArray(e.ocultas)) e.ocultas = [...new Set(e.ocultas.map((k) => trocarChave(k, antigo, novo)))];
  }
  marcarEstado();
  if (envios.has(antigo)) {
    envios.set(novo, envios.get(antigo));
    envios.delete(antigo);
  }
  // As conexões da conta fecham sozinhas (a versão da conta muda) e a página conecta de novo
}

// As mensagens ficam, com a persona guardada; a conta sai do estado e do chat agora
function excluirDoChat(conta) {
  delete estado[conta.usuario];
  marcarEstado();
  envios.delete(conta.usuario);
  for (const con of [...conexoes]) if (con.usuario === conta.usuario) fecharConexao(con);
}

// Uma mesa excluída leva a categoria, os canais, o histórico e as imagens
function tirarMesaDoChat(idMesa) {
  if (!objeto(dados.chat)) return;
  const categoria = categoriaDe(idDaCategoriaDaMesa(idMesa));
  if (categoria) {
    tirarCanais(dados.chat.canais.filter((c) => c.categoria === categoria.id));
    dados.chat.categorias = dados.chat.categorias.filter((c) => c !== categoria);
    renumerar(dados.chat);
  }
  let mudou = false;
  for (const e of Object.values(estado)) {
    if (objeto(e.personas) && idMesa in e.personas) {
      delete e.personas[idMesa];
      mudou = true;
    }
  }
  if (mudou) marcarEstado();
  if (categoria) setImmediate(avisarCanais); // depois de a mesa sair da lista
}

ganchos.renomearConta.push(renomearNoChat);
ganchos.excluirConta.push(excluirDoChat);
ganchos.excluirMesa.push(tirarMesaDoChat);

/* =================================================================
   Início
   ================================================================= */

// Cria as pastas e lê tudo para a memória. Devolve true só quando criou ou mudou dados.chat.
function iniciarChat() {
  for (const pasta of [PASTA_CHAT, PASTA_CANAIS, PASTA_PRIVADAS, PASTA_IMAGENS]) {
    fs.mkdirSync(pasta, { recursive: true, mode: 0o700 });
  }
  lerEstado();
  const mudou = garantirChat();
  lerHistoricos();
  setInterval(pingar, INTERVALO_DO_PING).unref();
  return mudou;
}

module.exports = {
  prefixo: "/api/chat",
  tratar: tratarChat,
  iniciar: iniciarChat,
  resumoDoChat,
};
