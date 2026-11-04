"use strict";
/* =================================================================
   Crônicas Eternas: Chat
   -----------------------------------------------------------------
   Um espaço só, o do grupo: a Geral, uma categoria por mesa e as
   mensagens privadas entre duas contas. A estrutura (categorias e
   canais) fica em dados.chat; as mensagens, fora do dados.json, em
   chat/canais/<canal>.jsonl e chat/privadas/<a>~<b>.jsonl, uma por
   linha. As lidas, os avisos, as personas escolhidas e as privadas
   ocultas de cada conta ficam em chat/estado.json; as reações, em
   chat/reacoes.json; as mensagens fixadas, em chat/fixadas.json. O
   perfil de cada conta (apelido, foto, faixa...) fica em
   dados.chat.perfis e vale na Geral e nas privadas.

   Quem vê: a Geral, todo mundo; a categoria de uma mesa, o
   administrador e quem tem personagem do portal nela; uma privada,
   só as duas contas (o administrador não lê as dos outros).

   O tempo real sai por /api/chat/eventos (Server-Sent Events). As
   imagens das mensagens ficam em chat/imagens/ e saem só para quem
   vê a mensagem. A voz e o vídeo são do LiveKit: o portal dá o passe
   de entrada e conta quem está em cada sala. Os GIFs vêm da Klipy,
   pelo portal, que guarda as buscas por 15 minutos.
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
  lerFormulario,
  arquivoEnviado,
  TIPOS_IMAGEM,
  guardarImagem,
  apagarImagens,
  codigoDaConta,
  texto,
  FONTES,
  FONTE_PADRAO,
  REGEX_USUARIO,
  REGEX_COR,
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
  imagens: 4, // imagens por mensagem
  apelido: 32,
  frase: 80,
  sobre: 300,
  emojisPorMensagem: 20, // emojis diferentes nas reações de uma mensagem
  emoji: 32, // unidades de código de uma reação
  fixadas: 50, // por canal
  gifsPorPagina: 24,
  gifsGuardados: 300, // buscas guardadas na memória
  validadeDosGifs: 15 * 60 * 1000,
  buscasDeGifs: 20, // buscas por conta...
  janelaDasBuscas: 60 * 1000, // ...por minuto
  textoDaBusca: 100,
  paginaDosGifs: 100,
};
const INTERVALO_DA_VOZ = 3 * 1000; // quem está nas salas, consultado no LiveKit só enquanto alguém tem o chat aberto
const ESPERA_DO_LIVEKIT = 2500; // tempo máximo de cada chamada ao LiveKit
const DURACAO_DO_PASSE = 6 * 60 * 60; // segundos do passe de entrada numa sala
const DURACAO_DO_PASSE_DO_PORTAL = 60; // segundos do passe das consultas do portal
const INTERVALO_DO_PING = 25 * 1000;
const INTERVALO_DO_ESTADO = 2 * 1000; // o estado.json (e o reacoes.json e o fixadas.json) é gravado no máximo a cada 2 segundos
const ESPERA_DA_KLIPY = 5000; // tempo máximo de cada chamada à Klipy
const LOCALE_DOS_GIFS = "br"; // o país (ISO 3166-1), para a Klipy dar preferência ao que é daqui

const PASTA_CHAT = path.join(CONFIG.pastaDados, "chat");
const PASTA_CANAIS = path.join(PASTA_CHAT, "canais");
const PASTA_PRIVADAS = path.join(PASTA_CHAT, "privadas");
const PASTA_IMAGENS = path.join(PASTA_CHAT, "imagens");
const ARQ_ESTADO = path.join(PASTA_CHAT, "estado.json");
const ARQ_REACOES = path.join(PASTA_CHAT, "reacoes.json");
const ARQ_FIXADAS = path.join(PASTA_CHAT, "fixadas.json");

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
const REGEX_ID_GIF = /^[A-Za-z0-9_-]{1,120}$/;
// Uma reação: um emoji só. Um keycap (1️⃣), uma bandeira (dois Regional_Indicator) ou um
// pictograma com o seletor de variação e o tom de pele, que o ZWJ pode juntar a outros (🏳️‍🌈)
const PICTOGRAMA = "\\p{Extended_Pictographic}\\uFE0F?\\p{Emoji_Modifier}?";
const REGEX_EMOJI = new RegExp(
  `^(?:[0-9#*]\\uFE0F?\\u20E3|\\p{Regional_Indicator}{2}|${PICTOGRAMA}(?:\\u200D${PICTOGRAMA})*)$`,
  "u",
);

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
  const chat = { formato: 1, categorias: [{ id: ID_GERAL, mesa: null, ordem: 0 }], canais: [], perfis: {} };
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
  if (!objeto(chat.perfis)) {
    chat.perfis = {};
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
const imagemDe = new Map(); // arquivo de uma imagem → id da mensagem dona dela, para a rota protegida

function registrarImagens(m) {
  for (const arquivo of m.imagens) imagemDe.set(arquivo, m.id);
}

function esquecerImagens(m) {
  for (const arquivo of m.imagens) if (imagemDe.get(arquivo) === m.id) imagemDe.delete(arquivo);
}

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
    gif: gifGuardado(m.gif),
  };
}

// O GIF de uma mensagem (a cópia do que a Klipy entregou), ou null
function gifGuardado(g) {
  if (!objeto(g) || typeof g.id !== "string" || typeof g.url !== "string" || !g.url.startsWith("https://")) return null;
  const largura = Number(g.largura);
  const altura = Number(g.altura);
  return {
    id: g.id,
    url: g.url,
    largura: Number.isFinite(largura) && largura > 0 ? largura : null,
    altura: Number.isFinite(altura) && altura > 0 ? altura : null,
    titulo: typeof g.titulo === "string" ? g.titulo : "",
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
    registrarImagens(m);
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
      esquecerImagens(m);
      imagens.push(...m.imagens);
      tirarReacoes(m.id);
    }
    historicos.delete(chave);
  }
  if (chave in fixadas.conteudo) {
    delete fixadas.conteudo[chave];
    marcarArquivo(fixadas);
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

/* ---------- Outros arquivos gravados como o estado.json ---------- */

// O reacoes.json e o fixadas.json: lidos uma vez, mudados na memória e gravados
// no máximo a cada 2 segundos, com arquivo temporário e troca de nome
function arquivoJson(arquivo) {
  return { arquivo, conteudo: {}, espera: null, ultima: 0, fila: Promise.resolve() };
}

function lerArquivoJson(a) {
  try {
    const lido = JSON.parse(fs.readFileSync(a.arquivo, "utf8"));
    a.conteudo = objeto(lido) ? lido : {};
  } catch (erro) {
    if (erro.code !== "ENOENT") console.error(`Chat: não foi possível ler ${a.arquivo}; ele começa vazio.`, erro);
    a.conteudo = {};
  }
}

function marcarArquivo(a) {
  if (a.espera) return;
  const espera = Math.max(0, a.ultima + INTERVALO_DO_ESTADO - Date.now());
  a.espera = setTimeout(() => gravarArquivoJson(a), espera);
}

function gravarArquivoJson(a) {
  a.espera = null;
  a.ultima = Date.now();
  const conteudo = JSON.stringify(a.conteudo);
  a.fila = a.fila
    .catch(() => {})
    .then(() => gravarInteiro(a.arquivo, conteudo))
    .catch(logErro(`não foi possível gravar ${a.arquivo}`));
}

const reacoes = arquivoJson(ARQ_REACOES); // { idMensagem: { emoji: [usuarios] } }, os emojis na ordem em que apareceram
const fixadas = arquivoJson(ARQ_FIXADAS); // { chave: [{ id, por, em }] }, da mais antiga para a mais nova

const nivelDeAviso = (usuario, idCanal) => {
  const nivel = estadoLido(usuario).avisos[idCanal];
  return NIVEIS_DE_AVISO.has(nivel) ? nivel : "tudo";
};

/* =================================================================
   Os perfis (em dados.chat.perfis): valem na Geral e nas privadas
   ================================================================= */

// As cores do selo das contas, as mesmas (e na mesma conta) do chat.js da página
const CORES_DAS_CONTAS = ["#7a4a2e", "#4d5b37", "#3e4a66", "#6b3a4c", "#5e5130", "#365c5c", "#5a3f6b", "#6e4f3a"];

function corDaConta(usuario) {
  let soma = 0;
  for (const letra of String(usuario)) soma = (soma * 31 + letra.codePointAt(0)) >>> 0;
  return CORES_DAS_CONTAS[soma % CORES_DAS_CONTAS.length];
}

const perfilGuardado = (usuario) => {
  const p = dados.chat?.perfis?.[usuario];
  return objeto(p) ? p : null;
};

const textoOuVazio = (valor) => (typeof valor === "string" ? valor : "");

// O perfil como a página recebe; uma conta que nunca mexeu nele tem o perfil padrão
function perfilPublico(usuario) {
  const p = perfilGuardado(usuario) ?? {};
  return {
    apelido: textoOuVazio(p.apelido),
    foto: typeof p.foto === "string" ? p.foto : null,
    faixa: typeof p.faixa === "string" ? p.faixa : null,
    cor: typeof p.cor === "string" && REGEX_COR.test(p.cor) ? p.cor : corDaConta(usuario),
    frase: textoOuVazio(p.frase),
    sobre: textoOuVazio(p.sobre),
    alteradoEm: typeof p.alteradoEm === "string" ? p.alteradoEm : null,
  };
}

/* =================================================================
   As personas: o nome e a imagem de quem fala
   ================================================================= */

// A conta fala com o apelido e a foto do perfil. Sem foto, a imagem é um selo com a
// inicial, que a página desenha: aqui vai null.
function personaDaConta(conta) {
  const p = perfilGuardado(conta.usuario);
  const apelido = typeof p?.apelido === "string" ? p.apelido.trim() : "";
  const foto = typeof p?.foto === "string" ? p.foto : null;
  return { tipo: "conta", id: conta.usuario, nome: apelido || conta.nome, imagem: foto, fonte: null };
}
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
    // A foto de uma conta excluída saiu com o perfil
    return { tipo: "conta", id: copia.id, nome: copia.nome, imagem: null, fonte: null };
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
      ? {
          id: original.m.id,
          nome: personaAtual(original.m.persona).nome,
          trecho: trechoDe(original.m.texto),
          gif: Boolean(original.m.gif),
        }
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
    gif: m.gif ? { ...m.gif } : null,
    resposta,
    reacoes: reacoesPublicas(m.id),
    fixada: estaFixada(chave, m.id),
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

  // Quantas fixadas há em cada canal de texto e privada que a conta vê (só os que têm alguma)
  const quantasFixadas = {};
  for (const [chave, lista] of Object.entries(fixadas.conteudo)) {
    if (Array.isArray(lista) && lista.length && veChave(conta, chave)) quantasFixadas[chave] = lista.length;
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
    perfis: Object.fromEntries(dados.contas.map((c) => [c.usuario, perfilPublico(c.usuario)])),
    gifs: gifsLigados(),
    fixadas: quantasFixadas,
    voz: { configurada: vozConfigurada(), salas: salasQueVe(conta) },
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

  const primeira = !conexoes.size;
  conexoes.add(con);
  if (primeira) consultarVoz().catch(logErro("consulta da voz")); // sem esperar os 3 segundos
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
   Voz e vídeo (o LiveKit, um servidor de mídia à parte)
   -----------------------------------------------------------------
   O portal não carrega mídia nenhuma: dá o passe de entrada numa
   sala (um JWT HS256 assinado com o segredo do LiveKit) e, enquanto
   alguém tem o chat aberto, pergunta ao LiveKit quem está em cada
   sala. Cada canal de voz é a sala "ce-<id do canal>".
   ================================================================= */

const salaDoCanal = (id) => `ce-${id}`;
const canalDaSala = (nome) => (typeof nome === "string" && nome.startsWith("ce-") ? canalDe(nome.slice(3)) : null);
const vozNaoConfigurada = () => new ErroHttp(503, "A voz ainda não está configurada no servidor.", "voz-desligada");

// O JWT do LiveKit, feito com node:crypto: iss = a chave, nbf 10 s antes, exp "segundos" depois
function passeDoLivekit(campos, segundos) {
  const agora = Math.floor(Date.now() / 1000);
  const parte = (valor) => Buffer.from(JSON.stringify(valor)).toString("base64url");
  const cabecalho = parte({ alg: "HS256", typ: "JWT" });
  const corpo = parte({ iss: CONFIG.livekitChave, ...campos, nbf: agora - 10, exp: agora + segundos });
  const assinatura = crypto.createHmac("sha256", CONFIG.livekitSegredo).update(`${cabecalho}.${corpo}`).digest("base64url");
  return `${cabecalho}.${corpo}.${assinatura}`;
}

// Uma chamada Twirp ao RoomService do LiveKit, com um passe de 1 minuto só com o que ela pede
async function chamarLivekit(metodo, corpo, video) {
  const base = CONFIG.livekitInterno.replace(/\/+$/, "");
  const resposta = await fetch(`${base}/twirp/livekit.RoomService/${metodo}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${passeDoLivekit({ video }, DURACAO_DO_PASSE_DO_PORTAL)}`,
    },
    body: JSON.stringify(corpo),
    signal: AbortSignal.timeout(ESPERA_DO_LIVEKIT),
  });
  const lido = await resposta.json().catch(() => ({}));
  if (!resposta.ok) {
    const erro = new Error(`${metodo} respondeu ${resposta.status} ${lido?.code ?? ""} ${lido?.msg ?? ""}`.trim());
    erro.codigo = lido?.code;
    throw erro;
  }
  return objeto(lido) ? lido : {};
}

// O JSON do Twirp pode vir com os nomes em snake_case ou em camelCase, e omite os valores padrão
function campo(obj, ...nomes) {
  for (const nome of nomes) if (obj && obj[nome] !== undefined) return obj[nome];
  return undefined;
}

// Os enums também podem vir como texto ou como número
const TIPOS_DE_FAIXA = { 0: "AUDIO", 1: "VIDEO", 2: "DATA" };
const FONTES_DE_FAIXA = { 0: "UNKNOWN", 1: "CAMERA", 2: "MICROPHONE", 3: "SCREEN_SHARE", 4: "SCREEN_SHARE_AUDIO" };
const enumDe = (valor, nomes, padrao) =>
  valor === undefined || valor === null ? padrao : typeof valor === "number" ? nomes[valor] ?? padrao : String(valor).toUpperCase();

function fonteDaFaixa(faixa) {
  const tipo = enumDe(campo(faixa, "type"), TIPOS_DE_FAIXA, "AUDIO");
  const fonte = enumDe(campo(faixa, "source"), FONTES_DE_FAIXA, "UNKNOWN");
  if (fonte === "MICROPHONE" || (fonte === "UNKNOWN" && tipo === "AUDIO")) return "microfone";
  if (fonte === "CAMERA" || (fonte === "UNKNOWN" && tipo === "VIDEO")) return "camera";
  if (fonte === "SCREEN_SHARE") return "tela";
  return null;
}

// Um participante como a página recebe: a persona vem do metadata (que só o portal assina)
function participanteDaSala(p) {
  const usuario = campo(p, "identity");
  if (typeof usuario !== "string" || !REGEX_USUARIO.test(usuario)) return null;
  const situacao = campo(p, "state");
  if (situacao === 3 || situacao === "DISCONNECTED") return null;
  let meta = {};
  try {
    meta = JSON.parse(campo(p, "metadata") || "{}");
  } catch {
    meta = {};
  }
  const persona = objeto(meta?.persona) ? meta.persona : {};
  const faixas = Array.isArray(campo(p, "tracks")) ? campo(p, "tracks") : [];
  const ligada = (fonte) => faixas.some((f) => fonteDaFaixa(f) === fonte && !campo(f, "muted"));
  const nome = typeof persona.nome === "string" ? persona.nome : campo(p, "name");
  return {
    usuario,
    nome: typeof nome === "string" && nome ? nome : usuario,
    imagem: typeof persona.imagem === "string" ? persona.imagem : null,
    fonte: typeof persona.fonte === "string" ? persona.fonte : null,
    mudo: !ligada("microfone"),
    camera: ligada("camera"),
    tela: ligada("tela"),
  };
}

let salasDoLivekit = {}; // id do canal → participantes, como o LiveKit disse na última consulta
const ensurdecidos = new Set(); // o LiveKit não sabe: a página avisa
let consultandoVoz = false;
let livekitFalhou = false; // o problema vai para o log uma vez, não a cada 3 segundos
let ultimaVoz = "{}";

// Quem está em cada sala, com o ensurdecido; só os canais de voz que ainda existem
function salasDaVoz() {
  const salas = {};
  for (const [id, lista] of Object.entries(salasDoLivekit)) {
    if (canalDe(id)?.tipo !== "voz") continue;
    salas[id] = lista.map((p) => {
      const { usuario, nome, imagem, fonte, mudo, camera, tela } = p;
      return { usuario, nome, imagem, fonte, mudo, ensurdecido: ensurdecidos.has(usuario), camera, tela };
    });
  }
  return salas;
}

// Só as salas que a conta vê
function salasQueVe(conta, salas = salasDaVoz()) {
  return Object.fromEntries(Object.entries(salas).filter(([id]) => veCanal(conta, canalDe(id))));
}

function avisarVoz() {
  const salas = salasDaVoz();
  const assinatura = JSON.stringify(salas);
  if (assinatura === ultimaVoz) return;
  ultimaVoz = assinatura;
  emitir("voz", (conta) => ({ salas: salasQueVe(conta) }));
}

async function consultarVoz() {
  if (consultandoVoz || !vozConfigurada() || !conexoes.size) return;
  consultandoVoz = true;
  try {
    const { rooms } = await chamarLivekit("ListRooms", {}, { roomList: true });
    const novas = {};
    for (const sala of Array.isArray(rooms) ? rooms : []) {
      const nome = campo(sala, "name");
      const canal = canalDaSala(nome);
      if (canal?.tipo !== "voz") continue;
      if (!(Number(campo(sala, "num_participants", "numParticipants")) > 0)) continue;
      const { participants } = await chamarLivekit("ListParticipants", { room: nome }, { roomAdmin: true, room: nome });
      const lista = (Array.isArray(participants) ? participants : []).map(participanteDaSala).filter(Boolean);
      if (lista.length) novas[canal.id] = lista;
    }
    salasDoLivekit = novas;
    // Quem saiu de todas as salas deixa de estar ensurdecido
    const presentes = new Set(Object.values(novas).flatMap((lista) => lista.map((p) => p.usuario)));
    for (const usuario of [...ensurdecidos]) if (!presentes.has(usuario)) ensurdecidos.delete(usuario);
    if (livekitFalhou) console.log("Chat: o LiveKit voltou a responder.");
    livekitFalhou = false;
  } catch (erro) {
    if (!livekitFalhou) {
      console.error(`Chat: não foi possível consultar o LiveKit (${erro.message}); as salas ficam vazias até ele voltar.`);
    }
    livekitFalhou = true;
    salasDoLivekit = {};
  } finally {
    consultandoVoz = false;
  }
  avisarVoz();
}

// A cada 3 segundos, só enquanto alguém tem o chat aberto
function vigiarVoz() {
  if (conexoes.size) return void consultarVoz().catch(logErro("consulta da voz"));
  salasDoLivekit = {};
  ultimaVoz = JSON.stringify(salasDaVoz());
}

// Uma sala de voz apagada: o LiveKit fecha a sala e todos saem
function fecharSala(canal) {
  if (canal.tipo !== "voz") return;
  delete salasDoLivekit[canal.id];
  if (!vozConfigurada()) return;
  const sala = salaDoCanal(canal.id);
  chamarLivekit("DeleteRoom", { room: sala }, { roomCreate: true, room: sala }).catch((erro) => {
    if (erro.codigo !== "not_found") console.error(`Chat: não foi possível fechar a sala ${sala} no LiveKit: ${erro.message}`);
  });
}

// POST /api/chat/voz/entrar { canal, persona? } → { url, token }
async function entrarNaVoz(req, res, conta) {
  const { canal: idCanal, persona: pedida } = await lerJson(req);
  const canal = typeof idCanal === "string" ? canalDe(idCanal) : null;
  if (!canal || !veCanal(conta, canal)) throw new ErroHttp(404, "Sala não encontrada.");
  if (canal.tipo !== "voz") throw new ErroHttp(400, "Esse canal não é uma sala de voz.");
  if (!vozConfigurada()) throw vozNaoConfigurada();
  const persona = personaParaFalar(conta, canal.id, pedida);
  const { tipo, id, nome, imagem, fonte } = persona;
  const token = passeDoLivekit(
    {
      sub: conta.usuario,
      name: nome,
      metadata: JSON.stringify({ usuario: conta.usuario, persona: { tipo, id, nome, imagem, fonte } }),
      video: {
        room: salaDoCanal(canal.id),
        roomJoin: true,
        canPublish: true,
        canSubscribe: true,
        canPublishData: false,
        canUpdateOwnMetadata: false,
      },
    },
    DURACAO_DO_PASSE,
  );
  // Entra com o microfone ligado: não está ensurdecido
  if (ensurdecidos.delete(conta.usuario)) avisarVoz();
  return enviarJson(res, 200, { url: CONFIG.livekitUrl, token });
}

// POST /api/chat/voz/estado { ensurdecido }
async function mudarEstadoDaVoz(req, res, conta) {
  const { ensurdecido } = await lerJson(req);
  if (typeof ensurdecido !== "boolean") throw new ErroHttp(400, "Diga se você está ensurdecido.");
  if (ensurdecido) ensurdecidos.add(conta.usuario);
  else ensurdecidos.delete(conta.usuario);
  avisarVoz();
  return enviarJson(res, 200, { ensurdecido });
}

// A sala de voz em que a pessoa está, pelo que o LiveKit disse na última consulta
function salaDe(usuario) {
  for (const [id, lista] of Object.entries(salasDoLivekit)) {
    if (canalDe(id)?.tipo === "voz" && lista.some((p) => p.usuario === usuario)) return id;
  }
  return null;
}

// POST /api/chat/voz/mover { usuario, canal } (só o administrador). O evento "mover" vai só para
// as conexões da pessoa, e não fica guardado: numa reconexão mais tarde, ele não volta.
async function moverNaVoz(req, res, conta) {
  exigirAdmin(conta);
  const { usuario, canal: idCanal } = await lerJson(req);
  const pessoa = typeof usuario === "string" ? contaDe(usuario) : null;
  if (!pessoa) throw new ErroHttp(404, "Conta não encontrada.");
  const canal = typeof idCanal === "string" ? canalDe(idCanal) : null;
  if (!canal) throw new ErroHttp(404, "Sala não encontrada.");
  if (canal.tipo !== "voz") throw new ErroHttp(400, "Esse canal não é uma sala de voz.");
  const atual = salaDe(pessoa.usuario);
  if (!atual) throw new ErroHttp(409, "Essa pessoa não está numa sala de voz.", "fora-da-voz");
  if (!veCanal(pessoa, canal)) throw new ErroHttp(403, "Essa pessoa não vê essa sala.");
  if (atual === canal.id) return enviarJson(res, 200, { ok: true, movida: false });
  const dela = [...conexoes].filter((con) => con.usuario === pessoa.usuario && contaDaConexao(con));
  if (!dela.length) throw new ErroHttp(409, "Essa pessoa não está com o chat aberto.", "sem-conexao");
  const evento = { n: ++contador, tipo: "mover", para: (c) => (c.usuario === pessoa.usuario ? { canal: canal.id } : null) };
  for (const con of dela) entregar(con, evento);
  return enviarJson(res, 200, { ok: true, movida: true });
}

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

// O envio: JSON { texto, resposta?, persona?, gif? }, ou formulário com texto, resposta,
// persona (JSON) e imagem1 a imagem4. O gif é o id de um GIF que o portal entregou.
async function lerEnvio(req) {
  const tipo = req.headers["content-type"] || "";
  if (!tipo.startsWith("multipart/form-data")) {
    const corpo = await lerJson(req);
    return { texto: corpo.texto, resposta: corpo.resposta, persona: corpo.persona, gif: corpo.gif, arquivos: [] };
  }
  const form = await lerFormulario(req, LIMITES.imagens * CONFIG.maxImagem + CONFIG.maxJson);
  const campo = (nome) => {
    const valor = form.get(nome);
    return typeof valor === "string" ? valor : undefined;
  };
  let persona;
  const personaEnviada = campo("persona");
  if (personaEnviada) {
    try {
      persona = JSON.parse(personaEnviada);
    } catch {
      throw new ErroHttp(400, "A persona enviada não está num formato válido.");
    }
  }
  for (const nome of form.keys()) {
    const numero = /^imagem(\d+)$/.exec(nome);
    if (numero && (Number(numero[1]) < 1 || Number(numero[1]) > LIMITES.imagens)) {
      throw new ErroHttp(400, "Cada mensagem pode ter no máximo 4 imagens.");
    }
  }
  const arquivos = [];
  for (let i = 1; i <= LIMITES.imagens; i++) {
    const enviados = form.getAll(`imagem${i}`).filter(arquivoEnviado);
    if (enviados.length > 1) throw new ErroHttp(400, "Cada mensagem pode ter no máximo 4 imagens.");
    const arquivo = enviados[0];
    if (!arquivo) continue;
    if (!TIPOS_IMAGEM[arquivo.type]) throw new ErroHttp(400, "Use imagens PNG, JPG, WEBP, GIF ou AVIF.");
    if (arquivo.size > CONFIG.maxImagem) throw new ErroHttp(413, "Cada imagem pode ter no máximo 10 MB.");
    arquivos.push(arquivo);
  }
  return { texto: campo("texto"), resposta: campo("resposta"), persona, arquivos };
}

// Grava as imagens de uma mensagem em chat/imagens/, com nome sorteado. Se uma falhar, nenhuma fica.
async function guardarImagensDoChat(arquivos) {
  const nomes = [];
  try {
    for (const arquivo of arquivos) {
      let nome;
      do nome = `img-${sorteio(12)}${TIPOS_IMAGEM[arquivo.type]}`;
      while (imagemDe.has(nome));
      await fsp.writeFile(path.join(PASTA_IMAGENS, nome), Buffer.from(await arquivo.arrayBuffer()), { mode: 0o600 });
      nomes.push(nome);
    }
  } catch (erro) {
    await apagarImagensDoChat(nomes);
    throw erro;
  }
  return nomes;
}

async function enviarMensagem(req, res, conta, chave) {
  const corpo = await lerEnvio(req);
  const comGif = corpo.gif !== undefined && corpo.gif !== null && corpo.gif !== "";
  const textoNovo = textoDaMensagem(corpo.texto, corpo.arquivos.length > 0 || comGif);
  const persona = personaParaFalar(conta, chave, corpo.persona);
  const resposta = respostaValida(chave, corpo.resposta);
  conferirLimite(conta.usuario);
  const gif = comGif ? await gifDoEnvio(corpo.gif) : null;

  const imagens = await guardarImagensDoChat(corpo.arquivos);
  const h = historicoDe(chave);
  const m = {
    id: novoIdDeMensagem(),
    em: carimbo(),
    editadaEm: null,
    autor: conta.usuario,
    persona,
    texto: textoNovo,
    imagens,
    resposta,
    gif,
  };
  h.mensagens.push(m);
  ondeEsta.set(m.id, chave);
  registrarImagens(m);
  try {
    await acrescentar(h, m);
  } catch (erro) {
    const i = indiceDe(h.mensagens, m.id);
    if (i >= 0) h.mensagens.splice(i, 1);
    ondeEsta.delete(m.id);
    esquecerImagens(m);
    await apagarImagensDoChat(imagens);
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
  const textoNovo = textoDaMensagem(corpo.texto, m.imagens.length > 0 || Boolean(m.gif));
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
  esquecerImagens(m);
  try {
    await regravar(h);
  } catch (erro) {
    h.mensagens.splice(Math.min(indice, h.mensagens.length), 0, m);
    ondeEsta.set(m.id, chave);
    registrarImagens(m);
    throw erro;
  }
  await apagarImagensDoChat(m.imagens);
  tirarReacoes(m.id);
  emitir("apagada", paraQuemVe(chave, () => ({ id: m.id, canal: chave })));
  if (desafixar(chave, m.id)) avisarFixadas(chave, m.id, false);
  return enviarJson(res, 200, { ok: true });
}

/* ---------- As imagens das mensagens ---------- */

const TIPO_DA_EXTENSAO = Object.fromEntries(Object.entries(TIPOS_IMAGEM).map(([tipo, extensao]) => [extensao, tipo]));
const CACHE_DA_IMAGEM = "private, max-age=31536000, immutable";

// A imagem sai só para quem vê a mensagem dona dela; para os outros, é como se não existisse
async function verImagem(res, conta, arquivo) {
  const naoEncontrada = () => new ErroHttp(404, "Imagem não encontrada.");
  const tipo = REGEX_IMAGEM.test(arquivo) ? TIPO_DA_EXTENSAO[path.extname(arquivo)] : null;
  const id = tipo ? imagemDe.get(arquivo) : null;
  const achada = id ? acharMensagem(id) : null;
  if (!achada || !veChave(conta, achada.chave) || !achada.m.imagens.includes(arquivo)) throw naoEncontrada();
  const caminho = path.join(PASTA_IMAGENS, arquivo);
  let info;
  try {
    info = await fsp.stat(caminho);
  } catch {
    throw naoEncontrada();
  }
  res.writeHead(200, { "Content-Type": tipo, "Content-Length": info.size, "Cache-Control": CACHE_DA_IMAGEM });
  fs.createReadStream(caminho)
    .on("error", () => res.destroy())
    .pipe(res);
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
   Reações (chat/reacoes.json)
   ================================================================= */

const reacoesPublicas = (id) =>
  Object.entries(objeto(reacoes.conteudo[id]) ? reacoes.conteudo[id] : {}).map(([emoji, usuarios]) => ({
    emoji,
    usuarios: [...usuarios],
  }));

function tirarReacoes(id) {
  if (!(id in reacoes.conteudo)) return;
  delete reacoes.conteudo[id];
  marcarArquivo(reacoes);
}

function emojiValido(valor) {
  if (typeof valor !== "string" || !valor || valor.length > LIMITES.emoji || !REGEX_EMOJI.test(valor)) {
    throw new ErroHttp(400, "A reação precisa ser um emoji.", "emoji");
  }
  return valor;
}

const avisarReacoes = (chave, id) => emitir("reacoes", paraQuemVe(chave, () => ({ id, canal: chave, reacoes: reacoesPublicas(id) })));

// Uma privada com uma conta excluída fica só para ler
function exigirPrivadaAtiva(chave) {
  if (ehPrivada(chave) && participantes(chave).some((u) => !contaDe(u))) {
    throw new ErroHttp(409, "Essa conta não existe mais.", "conta-excluida");
  }
}

// PUT /api/chat/mensagens/:id/reacoes { emoji, ligado } → { reacoes }
async function mudarReacao(req, res, conta, id) {
  const { chave, m } = mensagemVisivel(conta, id);
  exigirPrivadaAtiva(chave);
  const corpo = await lerJson(req);
  const emoji = emojiValido(corpo.emoji);
  if (typeof corpo.ligado !== "boolean") throw new ErroHttp(400, "Diga se a reação fica ou sai.");
  const daMensagem = objeto(reacoes.conteudo[m.id]) ? reacoes.conteudo[m.id] : {};
  const usuarios = Array.isArray(daMensagem[emoji]) ? daMensagem[emoji] : [];
  let mudou = false;
  if (corpo.ligado && !usuarios.includes(conta.usuario)) {
    if (!usuarios.length && Object.keys(daMensagem).length >= LIMITES.emojisPorMensagem) {
      throw new ErroHttp(400, "Uma mensagem pode ter no máximo 20 reações diferentes.", "reacoes-demais");
    }
    daMensagem[emoji] = [...usuarios, conta.usuario];
    mudou = true;
  } else if (!corpo.ligado && usuarios.includes(conta.usuario)) {
    const ficam = usuarios.filter((u) => u !== conta.usuario);
    if (ficam.length) daMensagem[emoji] = ficam;
    else delete daMensagem[emoji];
    mudou = true;
  }
  if (mudou) {
    if (Object.keys(daMensagem).length) reacoes.conteudo[m.id] = daMensagem;
    else delete reacoes.conteudo[m.id];
    marcarArquivo(reacoes);
    avisarReacoes(chave, m.id);
  }
  return enviarJson(res, 200, { reacoes: reacoesPublicas(m.id) });
}

/* =================================================================
   Mensagens fixadas (chat/fixadas.json)
   ================================================================= */

const fixadasDe = (chave) => (Array.isArray(fixadas.conteudo[chave]) ? fixadas.conteudo[chave] : []);
const estaFixada = (chave, id) => fixadasDe(chave).some((f) => f.id === id);

// Tira a mensagem das fixadas do canal; devolve true se ela estava lá
function desafixar(chave, id) {
  const lista = fixadasDe(chave);
  const ficam = lista.filter((f) => f.id !== id);
  if (ficam.length === lista.length) return false;
  if (ficam.length) fixadas.conteudo[chave] = ficam;
  else delete fixadas.conteudo[chave];
  marcarArquivo(fixadas);
  return true;
}

// { canal, quantas }, e qual mensagem mudou ({ id, fixada }), para a página acertar o alfinete
const avisarFixadas = (chave, id, fixada) =>
  emitir("fixadas", paraQuemVe(chave, () => ({ canal: chave, quantas: fixadasDe(chave).length, id, fixada })));

// GET .../fixadas → { fixadas: [{ mensagem, por, em }] }, da mais recente para a mais antiga
function listarFixadas(res, conta, chave) {
  const lista = [];
  for (const f of [...fixadasDe(chave)].reverse()) {
    const achada = acharMensagem(f.id);
    if (!achada || achada.chave !== chave) continue;
    lista.push({ mensagem: mensagemPublica(achada.m, chave, conta), por: f.por, em: f.em });
  }
  return enviarJson(res, 200, { fixadas: lista });
}

// PUT /api/chat/mensagens/:id/fixada { fixada } → { fixada, quantas }
async function mudarFixada(req, res, conta, id) {
  const { chave, m } = mensagemVisivel(conta, id);
  const { fixada } = await lerJson(req);
  if (typeof fixada !== "boolean") throw new ErroHttp(400, "Diga se a mensagem fica fixada.");
  let mudou = false;
  if (fixada && !estaFixada(chave, m.id)) {
    const lista = fixadasDe(chave);
    if (lista.length >= LIMITES.fixadas) throw new ErroHttp(400, "Desafixe uma antes.", "fixadas-demais");
    fixadas.conteudo[chave] = [...lista, { id: m.id, por: conta.usuario, em: carimbo() }];
    marcarArquivo(fixadas);
    mudou = true;
  } else if (!fixada) {
    mudou = desafixar(chave, m.id);
  }
  if (mudou) avisarFixadas(chave, m.id, fixada);
  return enviarJson(res, 200, { fixada, quantas: fixadasDe(chave).length });
}

// Na partida: some o que é de mensagem ou canal que já não existe
function limparReacoesEFixadas() {
  let mudouReacoes = false;
  for (const [id, daMensagem] of Object.entries(reacoes.conteudo)) {
    if (!ondeEsta.has(id) || !objeto(daMensagem)) {
      delete reacoes.conteudo[id];
      mudouReacoes = true;
      continue;
    }
    for (const [emoji, usuarios] of Object.entries(daMensagem)) {
      const validos = Array.isArray(usuarios) ? [...new Set(usuarios.filter((u) => typeof u === "string"))] : [];
      const emojiBom = emoji.length <= LIMITES.emoji && REGEX_EMOJI.test(emoji);
      if (!emojiBom || !validos.length) {
        delete daMensagem[emoji];
        mudouReacoes = true;
      } else if (validos.length !== usuarios.length) {
        daMensagem[emoji] = validos;
        mudouReacoes = true;
      }
    }
    if (!Object.keys(daMensagem).length) {
      delete reacoes.conteudo[id];
      mudouReacoes = true;
    }
  }
  if (mudouReacoes) marcarArquivo(reacoes);

  let mudouFixadas = false;
  for (const [chave, lista] of Object.entries(fixadas.conteudo)) {
    const vistas = new Set();
    const validas = (Array.isArray(lista) ? lista : []).filter((f) => {
      const boa = objeto(f) && typeof f.id === "string" && ondeEsta.get(f.id) === chave && !vistas.has(f.id);
      if (boa) vistas.add(f.id);
      return boa && typeof f.por === "string" && typeof f.em === "string";
    });
    if (!validas.length) {
      delete fixadas.conteudo[chave];
      mudouFixadas = true;
    } else if (validas.length !== lista.length) {
      fixadas.conteudo[chave] = validas;
      mudouFixadas = true;
    }
  }
  if (mudouFixadas) marcarArquivo(fixadas);
}

/* =================================================================
   O perfil (PUT /api/chat/perfil)
   ================================================================= */

const CAMPOS_IMAGEM_DO_PERFIL = ["foto", "faixa"];

// Formulário com apelido, cor, frase, sobre, foto, faixa, remover_foto e remover_faixa.
// Um campo que não veio fica como está. Trocar ou remover uma imagem apaga a anterior.
async function mudarPerfil(req, res, conta) {
  const form = await lerFormulario(req, CAMPOS_IMAGEM_DO_PERFIL.length * CONFIG.maxImagem + CONFIG.maxJson);
  const campo = (nome) => {
    const valor = form.get(nome);
    return typeof valor === "string" ? valor : undefined;
  };
  const novo = { ...(perfilGuardado(conta.usuario) ?? {}) };

  const apelido = campo("apelido");
  if (apelido !== undefined) {
    const limpo = apelido.replace(/\s+/g, " ").trim();
    if (limpo.length > LIMITES.apelido) throw new ErroHttp(400, "O apelido pode ter no máximo 32 caracteres.");
    novo.apelido = limpo;
  }
  const cor = campo("cor");
  if (cor !== undefined) {
    const limpa = cor.trim().toLowerCase();
    if (limpa && !REGEX_COR.test(limpa)) throw new ErroHttp(400, "Escolha uma cor válida.");
    novo.cor = limpa || null;
  }
  const frase = campo("frase");
  if (frase !== undefined) {
    const limpa = frase.replace(/\s+/g, " ").trim();
    if (limpa.length > LIMITES.frase) throw new ErroHttp(400, "A frase pode ter no máximo 80 caracteres.");
    novo.frase = limpa;
  }
  const sobre = campo("sobre");
  if (sobre !== undefined) {
    const limpo = sobre.replace(/\r\n?/g, "\n").trim();
    if (limpo.length > LIMITES.sobre) throw new ErroHttp(400, "O \"Sobre mim\" pode ter no máximo 300 caracteres.");
    novo.sobre = limpo;
  }

  const enviadas = {};
  for (const nome of CAMPOS_IMAGEM_DO_PERFIL) {
    const arquivo = form.get(nome);
    if (!arquivoEnviado(arquivo)) continue;
    if (!TIPOS_IMAGEM[arquivo.type]) throw new ErroHttp(400, "Use imagens PNG, JPG, WEBP, GIF ou AVIF.");
    if (arquivo.size > CONFIG.maxImagem) throw new ErroHttp(413, "Cada imagem pode ter no máximo 10 MB.");
    enviadas[nome] = arquivo;
  }

  const gravadas = [];
  const antigas = [];
  const antes = perfilGuardado(conta.usuario);
  try {
    for (const nome of CAMPOS_IMAGEM_DO_PERFIL) {
      const anterior = typeof novo[nome] === "string" ? novo[nome] : null;
      if (enviadas[nome]) {
        novo[nome] = await guardarImagem(enviadas[nome]);
        gravadas.push(novo[nome]);
      } else if (form.get(`remover_${nome}`) === "1") {
        novo[nome] = null;
      } else {
        continue;
      }
      if (anterior) antigas.push(anterior);
    }
    novo.alteradoEm = carimbo();
    dados.chat.perfis[conta.usuario] = novo;
    await salvarDados();
  } catch (erro) {
    if (antes) dados.chat.perfis[conta.usuario] = antes;
    else delete dados.chat.perfis[conta.usuario];
    await apagarImagens(gravadas);
    throw erro;
  }
  await apagarImagens(antigas);
  const perfil = perfilPublico(conta.usuario);
  emitir("perfil", () => ({ usuario: conta.usuario, perfil }));
  return enviarJson(res, 200, { perfil });
}

/* =================================================================
   GIFs (a Klipy)
   -----------------------------------------------------------------
   A página nunca fala com a Klipy: pede ao portal, que busca com a
   chave e guarda cada busca por 15 minutos. Numa mensagem, só vale
   um GIF que o portal entregou (ou que ele confere na Klipy pelo id),
   com a imagem num host da Klipy.
   ================================================================= */

const gifsLigados = () => Boolean(CONFIG.klipyChave);
const gifsIndisponiveis = () => new ErroHttp(503, "Os GIFs não estão disponíveis agora.", "gifs");

const buscasGuardadas = new Map(); // "texto\npágina" → { em, gifs, maisPaginas }, a mais antiga primeiro
const buscasDaConta = new Map(); // usuario → os tempos das buscas no último minuto
let klipyFalhou = false; // o problema vai para o log uma vez, não a cada busca

// Uma chamada à Klipy. O endereço leva a chave: ele nunca vai para o log.
async function chamarKlipy(caminho, parametros) {
  const url = new URL(`${CONFIG.klipyBase}/${encodeURIComponent(CONFIG.klipyChave)}/gifs/${caminho}`);
  for (const [nome, valor] of Object.entries(parametros)) url.searchParams.set(nome, String(valor));
  let lido = null;
  let problema = "";
  try {
    const resposta = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(ESPERA_DA_KLIPY) });
    lido = await resposta.json().catch(() => null);
    if (!resposta.ok) problema = `respondeu ${resposta.status}`;
    else if (!objeto(lido) || lido.result === false) problema = "mandou uma resposta que não deu para ler";
  } catch (erro) {
    problema = erro.name === "TimeoutError" ? "não respondeu a tempo" : `não respondeu (${erro.code || erro.name})`;
  }
  if (problema) {
    if (!klipyFalhou) console.error(`Chat: a Klipy (gifs/${caminho}) ${problema}; os GIFs ficam indisponíveis até ela voltar.`);
    klipyFalhou = true;
    throw gifsIndisponiveis();
  }
  if (klipyFalhou) console.log("Chat: a Klipy voltou a responder.");
  klipyFalhou = false;
  return lido;
}

// Um tamanho de um GIF ({ url, width, height }), só com https e num host da Klipy
function midiaDaKlipy(r) {
  if (!objeto(r) || typeof r.url !== "string") return null;
  let url;
  try {
    url = new URL(r.url);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || !CONFIG.klipyMidia.includes(url.host)) return null;
  const largura = Number(r.width);
  const altura = Number(r.height);
  if (!(largura > 0) || !(altura > 0)) return null;
  return { url: url.href, largura: Math.round(largura), altura: Math.round(altura) };
}

// Um item da Klipy como a página recebe. Anúncios e outros tipos ficam de fora (null).
// A prévia é o tamanho pequeno (WebP, se houver); a imagem da mensagem é o médio.
function gifDaKlipy(item) {
  if (!objeto(item) || item.type !== "gif") return null;
  const id = typeof item.slug === "string" ? item.slug : null;
  if (!id || !REGEX_ID_GIF.test(id)) return null;
  const f = objeto(item.file) ? item.file : {};
  const previa = midiaDaKlipy(f.sm?.webp) ?? midiaDaKlipy(f.sm?.gif) ?? midiaDaKlipy(f.xs?.webp) ?? midiaDaKlipy(f.xs?.gif);
  const medio = midiaDaKlipy(f.md?.gif) ?? midiaDaKlipy(f.md?.webp) ?? midiaDaKlipy(f.hd?.gif) ?? midiaDaKlipy(f.hd?.webp);
  if (!previa || !medio) return null;
  const titulo = typeof item.title === "string" ? item.title.replace(/\s+/g, " ").trim().slice(0, 200) : "";
  return { id, titulo, previa, ...medio };
}

// A lista de uma resposta: { result, data: { data: [...], has_next, ... } }
function gifsDaResposta(lido) {
  const corpo = objeto(lido.data) ? lido.data : lido;
  const itens = Array.isArray(corpo.data) ? corpo.data : [];
  return { gifs: itens.map(gifDaKlipy).filter(Boolean), maisPaginas: corpo.has_next === true };
}

function conferirBuscas(usuario) {
  const agora = Date.now();
  const recentes = (buscasDaConta.get(usuario) ?? []).filter((t) => agora - t < LIMITES.janelaDasBuscas);
  if (recentes.length >= LIMITES.buscasDeGifs) {
    buscasDaConta.set(usuario, recentes);
    throw new ErroHttp(429, "Calma: espere um pouco antes de buscar mais GIFs.", "limite");
  }
  recentes.push(agora);
  buscasDaConta.set(usuario, recentes);
}

function guardarBusca(chave, resultado) {
  buscasGuardadas.delete(chave);
  buscasGuardadas.set(chave, { em: Date.now(), ...resultado });
  while (buscasGuardadas.size > LIMITES.gifsGuardados) buscasGuardadas.delete(buscasGuardadas.keys().next().value);
}

// GET /api/chat/gifs?q=<texto>&pagina=<n> → { gifs, maisPaginas }; sem q, os em alta
async function buscarGifs(req, res, conta) {
  if (!gifsLigados()) throw gifsIndisponiveis();
  const parametros = new URL(req.url, "http://portal.local").searchParams;
  const q = (parametros.get("q") ?? "").replace(/\s+/g, " ").trim().toLowerCase();
  if (q.length > LIMITES.textoDaBusca) throw new ErroHttp(400, "A busca pode ter no máximo 100 caracteres.");
  const paginaPedida = parametros.get("pagina");
  const pagina = paginaPedida === null || paginaPedida === "" ? 1 : Number(paginaPedida);
  if (!Number.isInteger(pagina) || pagina < 1 || pagina > LIMITES.paginaDosGifs) {
    throw new ErroHttp(400, "A página precisa ser um número inteiro de 1 a 100.");
  }
  conferirBuscas(conta.usuario);

  const chave = `${q}\n${pagina}`;
  const guardada = buscasGuardadas.get(chave);
  if (guardada && Date.now() - guardada.em < LIMITES.validadeDosGifs) {
    return enviarJson(res, 200, { gifs: guardada.gifs, maisPaginas: guardada.maisPaginas });
  }
  const pedido = {
    ...(q ? { q } : {}),
    page: pagina,
    per_page: LIMITES.gifsPorPagina,
    customer_id: codigoDaConta(conta.usuario),
    locale: LOCALE_DOS_GIFS,
    content_filter: "off", // sem filtro de classificação
  };
  const resultado = gifsDaResposta(await chamarKlipy(q ? "search" : "trending", pedido));
  guardarBusca(chave, resultado);
  return enviarJson(res, 200, resultado);
}

// O GIF de uma mensagem: primeiro no que o portal entregou; senão, pedido à Klipy pelo id
async function gifDoEnvio(valor) {
  if (typeof valor !== "string" || !REGEX_ID_GIF.test(valor)) throw new ErroHttp(400, "O GIF enviado não está num formato válido.");
  if (!gifsLigados()) throw gifsIndisponiveis();
  let achado = null;
  for (const busca of buscasGuardadas.values()) {
    achado = busca.gifs.find((g) => g.id === valor);
    if (achado) break;
  }
  if (!achado) {
    const { gifs } = gifsDaResposta(await chamarKlipy("items", { slugs: valor }));
    achado = gifs.find((g) => g.id === valor);
  }
  if (!achado) throw new ErroHttp(400, "Esse GIF não foi encontrado.", "gif");
  const { id, url, largura, altura, titulo } = achado;
  return { id, url, largura, altura, titulo };
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
  for (const canal of canais) fecharSala(canal);
  avisarVoz();
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
  if (recurso === "imagens" && id && !acao && metodo === "GET") return verImagem(res, conta, id);
  if (recurso === "voz" && !acao && metodo === "POST") {
    if (id === "entrar") return entrarNaVoz(req, res, conta);
    if (id === "estado") return mudarEstadoDaVoz(req, res, conta);
    if (id === "mover") return moverNaVoz(req, res, conta);
  }
  if (recurso === "perfil" && !id && metodo === "PUT") return mudarPerfil(req, res, conta);
  if (recurso === "gifs" && !id && metodo === "GET") return buscarGifs(req, res, conta);

  if (recurso === "canais") {
    if (!id && metodo === "POST") return criarCanal(req, res, conta);
    if (id && acao === "mensagens") {
      const canal = canalDeTexto(conta, id);
      if (metodo === "GET") return listarMensagens(req, res, conta, canal.id);
      if (metodo === "POST") return enviarMensagem(req, res, conta, canal.id);
    }
    if (id && acao === "fixadas" && metodo === "GET") return listarFixadas(res, conta, canalDeTexto(conta, id).id);
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
    if (acao === "fixadas" && metodo === "GET") return listarFixadas(res, conta, privadaCom(conta, id));
    if (acao === "ocultar" && metodo === "POST") return ocultarPrivada(res, conta, id);
  }

  if (recurso === "mensagens" && id && !acao) {
    if (metodo === "PUT") return editarMensagem(req, res, conta, id);
    if (metodo === "DELETE") return apagarMensagem(res, conta, id);
  }
  if (recurso === "mensagens" && id && metodo === "PUT") {
    if (acao === "reacoes") return mudarReacao(req, res, conta, id);
    if (acao === "fixada") return mudarFixada(req, res, conta, id);
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

  // O perfil (o dados.json é salvo por quem renomeou a conta)
  if (perfilGuardado(antigo)) {
    dados.chat.perfis[novo] = dados.chat.perfis[antigo];
    delete dados.chat.perfis[antigo];
  }
  // Quem reagiu e quem fixou; as fixadas de uma privada mudam de chave (e se juntam, se preciso)
  let mudouReacoes = false;
  for (const daMensagem of Object.values(reacoes.conteudo)) {
    for (const [emoji, usuarios] of Object.entries(daMensagem)) {
      if (!usuarios.includes(antigo)) continue;
      daMensagem[emoji] = [...new Set(usuarios.map((u) => (u === antigo ? novo : u)))];
      mudouReacoes = true;
    }
  }
  if (mudouReacoes) marcarArquivo(reacoes);
  const fixadasNovas = {};
  for (const [chave, lista] of Object.entries(fixadas.conteudo)) {
    const destino = trocarChave(chave, antigo, novo);
    const juntas = [...(fixadasNovas[destino] ?? []), ...lista.map((f) => (f.por === antigo ? { ...f, por: novo } : f))];
    fixadasNovas[destino] = juntas.filter((f, i) => juntas.findIndex((g) => g.id === f.id) === i).slice(-LIMITES.fixadas);
  }
  fixadas.conteudo = fixadasNovas;
  marcarArquivo(fixadas);

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
  if (ensurdecidos.delete(antigo)) ensurdecidos.add(novo);
  // As conexões da conta fecham sozinhas (a versão da conta muda) e a página conecta de novo
}

// As mensagens ficam, com a persona guardada; a conta sai do estado e do chat agora
function excluirDoChat(conta) {
  delete estado[conta.usuario];
  marcarEstado();
  // O perfil e as imagens dele (o dados.json é salvo por quem excluiu a conta)
  const perfil = perfilGuardado(conta.usuario);
  if (perfil) {
    delete dados.chat.perfis[conta.usuario];
    apagarImagens([perfil.foto, perfil.faixa]).catch(logErro("não foi possível apagar as imagens do perfil"));
  }
  // As reações da conta saem
  for (const [id, daMensagem] of Object.entries(reacoes.conteudo)) {
    let mudou = false;
    for (const [emoji, usuarios] of Object.entries(daMensagem)) {
      if (!usuarios.includes(conta.usuario)) continue;
      const ficam = usuarios.filter((u) => u !== conta.usuario);
      if (ficam.length) daMensagem[emoji] = ficam;
      else delete daMensagem[emoji];
      mudou = true;
    }
    if (!mudou) continue;
    if (!Object.keys(daMensagem).length) delete reacoes.conteudo[id];
    marcarArquivo(reacoes);
    const chave = ondeEsta.get(id);
    if (chave) avisarReacoes(chave, id);
  }
  envios.delete(conta.usuario);
  ensurdecidos.delete(conta.usuario);
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
  lerArquivoJson(reacoes);
  lerArquivoJson(fixadas);
  const mudou = garantirChat();
  lerHistoricos();
  limparReacoesEFixadas();
  setInterval(pingar, INTERVALO_DO_PING).unref();
  setInterval(vigiarVoz, INTERVALO_DA_VOZ).unref();
  return mudou;
}

module.exports = {
  prefixo: "/api/chat",
  tratar: tratarChat,
  iniciar: iniciarChat,
  resumoDoChat,
};
