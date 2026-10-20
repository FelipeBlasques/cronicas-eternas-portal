#!/usr/bin/env node
"use strict";
/* =================================================================
   Crônicas Eternas: servidor do portal
   -----------------------------------------------------------------
   Roda na VPS como serviço (portal.service). Não usa bibliotecas
   externas, só o que já vem com o Node.

   Comandos:
     node servidor.js                     inicia o portal
     node servidor.js --nova-senha conta  gera uma senha nova para a conta
   ================================================================= */

const http = require("node:http");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const { promisify } = require("node:util");
const { Readable } = require("node:stream");

const scrypt = promisify(crypto.scrypt);

const CONFIG = {
  porta: Number(process.env.PORTA) || 3000,
  host: process.env.HOST || "127.0.0.1",
  pastaDados: process.env.DADOS || "/var/lib/portal",
  pastaFoundry: process.env.FOUNDRY_DADOS || "/var/lib/foundry",
  urlFoundry: process.env.FOUNDRY_URL || "http://127.0.0.1:30000",
  enderecoFoundry: process.env.FOUNDRY_PUBLICO || "https://vtt.cronicaseternas.com/join",
  cookieSeguro: process.env.COOKIE_SEGURO !== "nao",
  duracaoLembrar: 365 * 24 * 60 * 60 * 1000, // "lembrar login": um ano, renovado a cada uso
  duracaoSemLembrar: 12 * 60 * 60 * 1000, // sem lembrar: some ao fechar o app ou o navegador
  limiteTroca: 3 * 60 * 1000, // tempo máximo de uma troca de mundo
  maxImagem: 10 * 1024 * 1024, // 10 MB por imagem
  maxJson: 64 * 1024,
};

const PASTA_PUBLICA = path.join(__dirname, "publico");
const PASTA_UPLOADS = path.join(CONFIG.pastaDados, "uploads");
const ARQ_DADOS = path.join(CONFIG.pastaDados, "dados.json");
const ARQ_SEGREDO = path.join(CONFIG.pastaDados, "segredo");
const ARQ_PEDIDO = path.join(CONFIG.pastaDados, "troca", "pedido");
const PASTA_MUNDOS = path.join(CONFIG.pastaFoundry, "Data", "worlds");

/* =================================================================
   Dados iniciais (usados só na primeira vez que o portal liga)
   ================================================================= */

const DADOS_INICIAIS = {
  campanhas: [
    {
      id: "ode-to-sleep",
      nome: "Ode to Sleep",
      mundo: "",
      cor: "#2e3756",
      capa: "/imagens/ots-cover.jpg",
      titulo: "/imagens/ots-text.png",
      arte: "/imagens/ots-hover.png",
    },
    {
      id: "remissao",
      nome: "Remissão do Flagelo Esvanescente",
      mundo: "",
      cor: "#5a2a26",
      capa: null,
      titulo: null,
      arte: null,
    },
  ],
  contas: [
    { usuario: "mestre", nome: "Mestre", admin: true },
    { usuario: "comuna", nome: "Comuna", admin: false },
    { usuario: "takezo", nome: "Takezo", admin: false },
    { usuario: "frati", nome: "Frati", admin: false },
    { usuario: "neia", nome: "Neia", admin: false },
  ],
  personagens: [
    { id: "ots-comuna", nome: "Personagem de Comuna", dono: "comuna", campanha: "ode-to-sleep" },
    { id: "ots-takezo", nome: "Personagem de Takezo", dono: "takezo", campanha: "ode-to-sleep" },
    { id: "ots-frati", nome: "Personagem de Frati", dono: "frati", campanha: "ode-to-sleep" },
    { id: "ots-neia", nome: "Personagem de Neia", dono: "neia", campanha: "ode-to-sleep" },
    { id: "rem-comuna", nome: "Personagem de Comuna", dono: "comuna", campanha: "remissao" },
    { id: "rem-neia", nome: "Personagem de Neia", dono: "neia", campanha: "remissao" },
  ],
};

/* =================================================================
   Armazenamento
   ================================================================= */

let dados = null;
let carimboDados = 0;
let filaGravacao = Promise.resolve();
let segredo = "";
let hashFalso = "";

function carregarDados() {
  if (fs.existsSync(ARQ_DADOS)) {
    dados = JSON.parse(fs.readFileSync(ARQ_DADOS, "utf8"));
  } else {
    dados = structuredClone(DADOS_INICIAIS);
    const temporario = `${ARQ_DADOS}.tmp`;
    fs.writeFileSync(temporario, JSON.stringify(dados, null, 2), { mode: 0o600 });
    fs.renameSync(temporario, ARQ_DADOS);
  }
  carimboDados = fs.statSync(ARQ_DADOS).mtimeMs;
}

// Grava em fila, para duas mudanças seguidas não se atropelarem
function salvarDados() {
  filaGravacao = filaGravacao
    .catch(() => {})
    .then(async () => {
      const temporario = `${ARQ_DADOS}.tmp`;
      await fsp.writeFile(temporario, JSON.stringify(dados, null, 2), { mode: 0o600 });
      await fsp.rename(temporario, ARQ_DADOS);
      carimboDados = (await fsp.stat(ARQ_DADOS)).mtimeMs;
    });
  return filaGravacao;
}

// Se o arquivo mudou por fora (pelo comando --nova-senha), lê de novo
async function recarregarSeMudou() {
  try {
    const { mtimeMs } = await fsp.stat(ARQ_DADOS);
    if (mtimeMs !== carimboDados) {
      dados = JSON.parse(await fsp.readFile(ARQ_DADOS, "utf8"));
      carimboDados = mtimeMs;
    }
  } catch {
    // mantém o que já está na memória
  }
}

function carregarSegredo() {
  if (!fs.existsSync(ARQ_SEGREDO)) {
    fs.writeFileSync(ARQ_SEGREDO, crypto.randomBytes(32).toString("hex"), { mode: 0o600 });
  }
  return fs.readFileSync(ARQ_SEGREDO, "utf8").trim();
}

/* =================================================================
   Senhas e sessões
   ================================================================= */

async function gerarHash(senha) {
  const sal = crypto.randomBytes(16);
  const hash = await scrypt(senha, sal, 64);
  return `scrypt:${sal.toString("hex")}:${hash.toString("hex")}`;
}

async function conferirSenha(senha, guardado) {
  if (typeof guardado !== "string") return false;
  const [, salHex, hashHex] = guardado.split(":");
  if (!salHex || !hashHex) return false;
  const esperado = Buffer.from(hashHex, "hex");
  const calculado = await scrypt(String(senha), Buffer.from(salHex, "hex"), esperado.length);
  return crypto.timingSafeEqual(esperado, calculado);
}

function gerarSenhaLegivel() {
  const letras = "abcdefghjkmnpqrstuvwxyz23456789";
  const bytes = crypto.randomBytes(12);
  let senha = "";
  for (let i = 0; i < 12; i++) {
    senha += letras[bytes[i] % letras.length];
    if (i === 3 || i === 7) senha += "-";
  }
  return senha;
}

function assinar(texto) {
  return crypto.createHmac("sha256", segredo).update(texto).digest("base64url");
}

function iguais(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

// A sessão guarda a "versão" da conta: trocar a senha invalida as sessões antigas.
// Também guarda se a pessoa marcou "lembrar login".
function criarToken(conta, lembrar) {
  const duracao = lembrar ? CONFIG.duracaoLembrar : CONFIG.duracaoSemLembrar;
  const base = `${conta.usuario}.${conta.versao || 0}.${Date.now() + duracao}.${lembrar ? 1 : 0}`;
  return `${Buffer.from(base).toString("base64url")}.${assinar(base)}`;
}

function sessaoDoToken(token) {
  if (!token) return null;
  const [codificado, assinatura] = token.split(".");
  if (!codificado || !assinatura) return null;
  const base = Buffer.from(codificado, "base64url").toString("utf8");
  if (!iguais(assinatura, assinar(base))) return null;
  const [usuario, versao, expira, lembrar = "1"] = base.split(".");
  if (!(Number(expira) > Date.now())) return null;
  const conta = dados.contas.find((c) => c.usuario === usuario);
  if (!conta || String(conta.versao || 0) !== versao) return null;
  return { conta, lembrar: lembrar === "1" };
}

function lerCookies(req) {
  const cookies = {};
  for (const parte of (req.headers.cookie || "").split(";")) {
    const i = parte.indexOf("=");
    if (i > 0) cookies[parte.slice(0, i).trim()] = parte.slice(i + 1).trim();
  }
  return cookies;
}

// Sem "segundos", o cookie vale só até fechar o app ou o navegador
function cookieSessao(valor, segundos) {
  const partes = [`sessao=${valor}`, "Path=/", "HttpOnly", "SameSite=Lax"];
  if (segundos !== undefined) partes.push(`Max-Age=${segundos}`);
  if (CONFIG.cookieSeguro) partes.push("Secure");
  return partes.join("; ");
}

function cookieDaConta(conta, lembrar) {
  const token = criarToken(conta, lembrar);
  return { "Set-Cookie": cookieSessao(token, lembrar ? CONFIG.duracaoLembrar / 1000 : undefined) };
}

/* ---------- Login do Foundry guardado com cada personagem ---------- */

function chaveCripto() {
  return crypto.createHash("sha256").update(`login-foundry:${segredo}`).digest();
}

function cifrar(texto) {
  const iv = crypto.randomBytes(12);
  const cifra = crypto.createCipheriv("aes-256-gcm", chaveCripto(), iv);
  const conteudo = Buffer.concat([cifra.update(texto, "utf8"), cifra.final()]);
  return [iv, cifra.getAuthTag(), conteudo].map((b) => b.toString("base64url")).join(".");
}

function decifrar(guardado) {
  const [iv, etiqueta, conteudo] = guardado.split(".").map((parte) => Buffer.from(parte, "base64url"));
  const decifra = crypto.createDecipheriv("aes-256-gcm", chaveCripto(), iv);
  decifra.setAuthTag(etiqueta);
  return Buffer.concat([decifra.update(conteudo), decifra.final()]).toString("utf8");
}

// Limite de tentativas de login por endereço
const tentativas = new Map();

function bloqueado(chave) {
  const registro = tentativas.get(chave);
  return Boolean(registro && registro.ate > Date.now() && registro.vezes >= 10);
}

function registrarFalha(chave) {
  const agora = Date.now();
  const registro = tentativas.get(chave);
  if (!registro || registro.ate < agora) tentativas.set(chave, { vezes: 1, ate: agora + 15 * 60 * 1000 });
  else registro.vezes += 1;
}

function ipDe(req) {
  const direto = req.socket.remoteAddress || "";
  const local = ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(direto);
  return (local && req.headers["x-real-ip"]) || direto;
}

/* =================================================================
   Utilidades de HTTP
   ================================================================= */

class ErroHttp extends Error {
  constructor(status, mensagem, codigo, extra) {
    super(mensagem);
    this.status = status;
    this.codigo = codigo;
    this.extra = extra;
  }
}

function enviarJson(res, status, corpo, cabecalhos = {}) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...cabecalhos,
  });
  res.end(corpo === undefined ? "" : JSON.stringify(corpo));
}

function origemValida(req) {
  const origem = req.headers.origin;
  if (!origem) return true;
  try {
    return new URL(origem).host === req.headers.host;
  } catch {
    return false;
  }
}

async function lerJson(req) {
  const tipo = req.headers["content-type"] || "";
  if (!tipo.startsWith("application/json")) throw new ErroHttp(415, "Envie os dados em JSON.");
  const partes = [];
  let tamanho = 0;
  for await (const parte of req) {
    tamanho += parte.length;
    if (tamanho > CONFIG.maxJson) throw new ErroHttp(413, "Os dados enviados são grandes demais.");
    partes.push(parte);
  }
  try {
    const corpo = JSON.parse(Buffer.concat(partes).toString("utf8") || "{}");
    return corpo && typeof corpo === "object" ? corpo : {};
  } catch {
    throw new ErroHttp(400, "Os dados enviados não estão em um formato válido.");
  }
}

// O limite padrão cabe as três imagens de uma campanha; a Linha do Tempo usa um menor
async function lerFormulario(req, limite = 3 * CONFIG.maxImagem + CONFIG.maxJson) {
  const tipo = req.headers["content-type"] || "";
  if (!tipo.startsWith("multipart/form-data")) throw new ErroHttp(415, "Envie o formulário com os arquivos.");
  const grandeDemais = () => new ErroHttp(413, "O envio passou do limite. Cada imagem pode ter no máximo 10 MB.");
  if (Number(req.headers["content-length"]) > limite) throw grandeDemais();

  // Conta o que chega, para um envio sem tamanho declarado também parar no limite
  let tamanho = 0;
  const contador = new TransformStream({
    transform(parte, controle) {
      tamanho += parte.byteLength;
      if (tamanho > limite) controle.error(grandeDemais());
      else controle.enqueue(parte);
    },
  });
  const requisicao = new Request("http://portal.local/", {
    method: "POST",
    headers: { "content-type": tipo },
    body: Readable.toWeb(req).pipeThrough(contador),
    duplex: "half",
  });
  try {
    return await requisicao.formData();
  } catch {
    if (tamanho > limite) throw grandeDemais();
    throw new ErroHttp(400, "Não foi possível ler o formulário enviado.");
  }
}

function texto(valor, campo, max) {
  const limpo = typeof valor === "string" ? valor.trim() : "";
  if (!limpo) throw new ErroHttp(400, `Preencha o campo ${campo}.`);
  if (limpo.length > max) throw new ErroHttp(400, `O campo ${campo} pode ter no máximo ${max} caracteres.`);
  return limpo;
}

function validarSenhaNova(senha) {
  if (typeof senha !== "string" || senha.length < 8) {
    throw new ErroHttp(400, "A senha precisa ter pelo menos 8 caracteres.");
  }
  if (senha.length > 200) throw new ErroHttp(400, "A senha pode ter no máximo 200 caracteres.");
}

// Fontes que o jogador pode escolher para o nome do personagem (a lista visual fica no script.js)
const FONTES = new Set([
  "gotica", "fraktur", "textura", "germanica", "pirata", "ferro", "uncial", "medieval",
  "elfica", "arcana", "romana", "classica", "tinta", "caligrafia", "pena", "sangue",
]);
const FONTE_PADRAO = "gotica";

const REGEX_USUARIO = /^[a-z0-9_-]{2,30}$/;
const REGEX_MUNDO = /^[a-z0-9_-]{1,100}$/;
const REGEX_COR = /^#[0-9a-f]{6}$/i;

function semAcentos(texto) {
  return texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function criarId(nome, existentes) {
  const base =
    semAcentos(nome).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "campanha";
  let id = base;
  let n = 2;
  while (existentes.has(id)) id = `${base}-${n++}`;
  return id;
}

/* =================================================================
   Foundry: status, mundos e troca
   ================================================================= */

let troca = null; // { mundo, desde } enquanto uma troca está acontecendo

async function statusFoundry() {
  try {
    const resposta = await fetch(`${CONFIG.urlFoundry}/api/status`, {
      signal: AbortSignal.timeout(2500),
    });
    if (!resposta.ok) return null;
    return await resposta.json();
  } catch {
    return null;
  }
}

async function estadoAtual() {
  const status = await statusFoundry();
  const online = Boolean(status);
  const mundoAtivo = status && status.active ? status.world || null : null;
  const conectados = status && status.active ? Number(status.users) || 0 : 0;
  if (troca) {
    const terminou = online && mundoAtivo === troca.mundo;
    if (terminou || Date.now() - troca.desde > CONFIG.limiteTroca) troca = null;
  }
  return { online, mundoAtivo, conectados, trocandoPara: troca ? troca.mundo : null };
}

function mundoExiste(id) {
  return (
    typeof id === "string" &&
    REGEX_MUNDO.test(id) &&
    fs.existsSync(path.join(PASTA_MUNDOS, id, "world.json"))
  );
}

async function listarMundos() {
  let pastas = [];
  try {
    pastas = await fsp.readdir(PASTA_MUNDOS, { withFileTypes: true });
  } catch {
    return [];
  }
  const mundos = [];
  for (const pasta of pastas) {
    if (!pasta.isDirectory() || !REGEX_MUNDO.test(pasta.name)) continue;
    try {
      const info = JSON.parse(
        await fsp.readFile(path.join(PASTA_MUNDOS, pasta.name, "world.json"), "utf8"),
      );
      mundos.push({ id: pasta.name, titulo: info.title || pasta.name, sistema: info.system || "" });
    } catch {
      // pasta sem world.json válido: não é um mundo
    }
  }
  return mundos.sort((a, b) => a.titulo.localeCompare(b.titulo, "pt-BR"));
}

// Liga sozinho as campanhas sem mundo a um mundo do Foundry com o mesmo nome
async function ligarMundosPeloNome() {
  const semMundo = dados.campanhas.filter((c) => !c.mundo);
  if (!semMundo.length) return;
  const mundos = await listarMundos();
  let mudou = false;
  for (const campanha of semMundo) {
    const achado = mundos.find((m) => semAcentos(m.titulo) === semAcentos(campanha.nome));
    if (achado) {
      campanha.mundo = achado.id;
      mudou = true;
    }
  }
  if (mudou) await salvarDados();
}

/* =================================================================
   Imagens enviadas
   ================================================================= */

const CAMPOS_IMAGEM = ["capa", "titulo", "arte"]; // campanhas
const CAMPOS_IMAGEM_PERSONAGEM = ["capa", "arte"]; // personagens: o nome agora é texto, com fonte escolhida
const TIPOS_IMAGEM = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "image/avif": ".avif",
};

function arquivoEnviado(valor) {
  return Boolean(valor && typeof valor === "object" && typeof valor.arrayBuffer === "function" && valor.size > 0);
}

function validarImagens(form, campos = CAMPOS_IMAGEM) {
  for (const campo of campos) {
    const arquivo = form.get(campo);
    if (!arquivoEnviado(arquivo)) continue;
    if (!TIPOS_IMAGEM[arquivo.type]) throw new ErroHttp(400, "Use imagens PNG, JPG, WEBP, GIF ou AVIF.");
    if (arquivo.size > CONFIG.maxImagem) throw new ErroHttp(413, "Cada imagem pode ter no máximo 10 MB.");
  }
}

async function apagarImagem(caminho) {
  // Só apaga o que foi enviado pelo portal, nunca as imagens fixas do site
  if (typeof caminho !== "string" || !caminho.startsWith("/uploads/")) return;
  await fsp.rm(path.join(PASTA_UPLOADS, path.basename(caminho)), { force: true });
}

async function aplicarImagens(item, form, campos = CAMPOS_IMAGEM) {
  for (const campo of campos) {
    const arquivo = form.get(campo);
    if (arquivoEnviado(arquivo)) {
      const nome = `${crypto.randomBytes(12).toString("hex")}${TIPOS_IMAGEM[arquivo.type]}`;
      await fsp.writeFile(path.join(PASTA_UPLOADS, nome), Buffer.from(await arquivo.arrayBuffer()));
      await apagarImagem(item[campo]);
      item[campo] = `/uploads/${nome}`;
    } else if (form.get(`remover_${campo}`) === "1") {
      await apagarImagem(item[campo]);
      item[campo] = null;
    }
  }
}

/* =================================================================
   Formatos enviados ao navegador
   ================================================================= */

function contaPublica(conta) {
  return { usuario: conta.usuario, nome: conta.nome, admin: Boolean(conta.admin), editor: Boolean(conta.editor) };
}

function campanhaPublica(c, comLoginDoMestre = false) {
  const publica = {
    id: c.id,
    nome: c.nome,
    mundo: c.mundo || "",
    cor: c.cor || "#2e3756",
    capa: c.capa || null,
    titulo: c.titulo || null,
    arte: c.arte || null,
  };
  if (comLoginDoMestre) {
    publica.mestreUsuario = c.mestreUsuario || "";
    publica.temLoginMestre = Boolean(c.mestreUsuario && c.mestreSenha);
  }
  return publica;
}

function personagemPublico(p) {
  const dono = dados.contas.find((c) => c.usuario === p.dono);
  return {
    id: p.id,
    nome: p.nome,
    dono: p.dono,
    nomeDono: dono ? dono.nome : p.dono,
    campanha: p.campanha,
    capa: p.capa || null,
    arte: p.arte || null,
    fonte: FONTES.has(p.fonte) ? p.fonte : FONTE_PADRAO,
    foundryUsuario: p.foundryUsuario || "",
    temLoginFoundry: Boolean(p.foundryUsuario && p.foundrySenha),
  };
}

// Todo mundo vê todas as campanhas que têm personagens, e todos os personagens delas.
// Entrar no mundo continua só com o próprio personagem (o /api/abrir confere isso),
// e o login do Foundry de cada personagem só vai para o dono dele.
function dadosDoPortal(conta) {
  const comPersonagens = new Set(dados.personagens.map((p) => p.campanha));
  const campanhas = dados.campanhas.filter((c) => conta.admin || comPersonagens.has(c.id));
  const visiveis = new Set(campanhas.map((c) => c.id));
  const personagens = dados.personagens
    .filter((p) => visiveis.has(p.campanha))
    .map((p) => {
      const publico = personagemPublico(p);
      if (p.dono !== conta.usuario) {
        publico.temLoginFoundry = false;
        if (!conta.admin) publico.foundryUsuario = "";
      }
      return publico;
    });
  const portal = {
    conta: contaPublica(conta),
    enderecoFoundry: CONFIG.enderecoFoundry,
    campanhas: campanhas.map((c) => campanhaPublica(c, conta.admin)),
    personagens,
  };
  // O administrador vê na barra lateral quantos pedidos dos editores esperam por ele
  if (conta.admin) portal.pendenciasLinha = dados.linha?.pendencias?.length ?? 0;
  return portal;
}

async function dadosDoAdmin() {
  return {
    contas: dados.contas.map((c) => ({ ...contaPublica(c), temSenha: Boolean(c.senha) })),
    campanhas: dados.campanhas.map((c) => campanhaPublica(c, true)),
    personagens: dados.personagens.map(personagemPublico),
    mundos: await listarMundos(),
  };
}

/* =================================================================
   Rotas da API
   ================================================================= */

async function tratarApi(req, res, url) {
  await recarregarSeMudou();
  const metodo = req.method;
  const rota = url.pathname;

  // Status no formato do Foundry, para o FLC mostrar na lista de servidores
  if (rota === "/api/status") {
    const cors = { "Access-Control-Allow-Origin": "*" };
    if (metodo === "OPTIONS") {
      res.writeHead(204, { ...cors, "Access-Control-Allow-Headers": "Accept", "Access-Control-Allow-Methods": "GET" });
      return res.end();
    }
    if (metodo !== "GET") throw new ErroHttp(405, "Use GET.");
    const status = await statusFoundry();
    if (!status) return enviarJson(res, 503, { erro: "O Foundry está fora do ar ou reiniciando." }, cors);
    return enviarJson(res, 200, status, cors);
  }

  if (metodo !== "GET" && !origemValida(req)) throw new ErroHttp(403, "Pedido de outro site recusado.");

  if (rota === "/api/entrar" && metodo === "POST") return entrar(req, res);
  if (rota === "/api/sair" && metodo === "POST") {
    return enviarJson(res, 200, { ok: true }, { "Set-Cookie": cookieSessao("", 0) });
  }

  const sessao = sessaoDoToken(lerCookies(req).sessao);
  if (!sessao) throw new ErroHttp(401, "Entre na sua conta para continuar.", "sem-sessao");
  const { conta } = sessao;
  req.lembrar = sessao.lembrar;

  if (rota === "/api/sessao" && metodo === "GET") {
    // Com "lembrar login", cada vez que o portal abre o prazo recomeça
    const renovar = sessao.lembrar ? cookieDaConta(conta, true) : {};
    return enviarJson(res, 200, { conta: contaPublica(conta) }, renovar);
  }
  if (rota === "/api/portal" && metodo === "GET") return enviarJson(res, 200, dadosDoPortal(conta));
  if (rota === "/api/estado" && metodo === "GET") return enviarJson(res, 200, await estadoAtual());
  if (rota === "/api/abrir" && metodo === "POST") return abrir(req, res, conta);
  if (rota === "/api/senha" && metodo === "POST") return trocarSenha(req, res, conta);
  if (rota === "/api/conta" && metodo === "POST") return atualizarConta(req, res, conta);
  if (rota.startsWith("/api/personagens/") && metodo === "PUT") {
    return personalizarPersonagem(req, res, conta, decodeURIComponent(rota.slice("/api/personagens/".length)));
  }
  if (rota === "/api/acesso-foundry" && metodo === "POST") return acessoFoundry(req, res, conta);

  if (rota === "/api/linha" || rota.startsWith("/api/linha/")) return tratarLinha(req, res, rota, metodo, conta);

  if (rota === "/api/admin" || rota.startsWith("/api/admin/")) {
    if (!conta.admin) throw new ErroHttp(403, "Só o administrador pode fazer isso.");
    return tratarAdmin(req, res, rota, metodo, conta);
  }

  throw new ErroHttp(404, "Endereço não encontrado.");
}

async function entrar(req, res) {
  const ip = ipDe(req);
  if (bloqueado(ip)) {
    throw new ErroHttp(429, "Muitas tentativas erradas. Espere 15 minutos e tente de novo.");
  }
  const { usuario, senha, lembrar } = await lerJson(req);
  const nome = typeof usuario === "string" ? usuario.trim().toLowerCase() : "";
  const conta = dados.contas.find((c) => c.usuario === nome);
  const confere = await conferirSenha(typeof senha === "string" ? senha : "", conta?.senha || hashFalso);
  if (!conta || !conta.senha || !confere) {
    registrarFalha(ip);
    throw new ErroHttp(401, "Usuário ou senha incorretos.", "login");
  }
  tentativas.delete(ip);
  enviarJson(res, 200, { conta: contaPublica(conta) }, cookieDaConta(conta, lembrar === true));
}

async function abrir(req, res, conta) {
  const { campanha: idCampanha, forcar } = await lerJson(req);
  const campanha = dados.campanhas.find((c) => c.id === idCampanha);
  if (!campanha) throw new ErroHttp(404, "Campanha não encontrada.");

  const temPersonagem = dados.personagens.some((p) => p.dono === conta.usuario && p.campanha === campanha.id);
  if (!conta.admin && !temPersonagem) throw new ErroHttp(403, "Você não tem personagem nessa campanha.");
  if (!mundoExiste(campanha.mundo)) {
    throw new ErroHttp(409, "Essa campanha ainda não está ligada a um mundo do Foundry.", "sem-mundo");
  }

  const estado = await estadoAtual();
  if (estado.trocandoPara) {
    if (estado.trocandoPara === campanha.mundo) return enviarJson(res, 202, { aguardando: true });
    throw new ErroHttp(409, "O servidor já está trocando de mundo. Espere um pouco e tente de novo.", "trocando");
  }
  if (estado.online && estado.mundoAtivo === campanha.mundo) return enviarJson(res, 200, { jaAberto: true });

  const emUso = estado.online && estado.mundoAtivo && estado.conectados > 0;
  if (emUso && !(forcar === true && conta.admin)) {
    throw new ErroHttp(409, "O servidor está em uso.", "ocupado", { estado });
  }

  await fsp.mkdir(path.dirname(ARQ_PEDIDO), { recursive: true });
  await fsp.writeFile(ARQ_PEDIDO, `${campanha.mundo}\n`);
  troca = { mundo: campanha.mundo, desde: Date.now() };
  console.log(`${conta.usuario} pediu para abrir o mundo ${campanha.mundo}${emUso ? " (troca forçada)" : ""}`);
  enviarJson(res, 202, { aguardando: true });
}

async function trocarSenha(req, res, conta) {
  const { atual, nova } = await lerJson(req);
  const confere = await conferirSenha(typeof atual === "string" ? atual : "", conta.senha);
  if (!confere) throw new ErroHttp(400, "A senha atual está incorreta.");
  validarSenhaNova(nova);
  conta.senha = await gerarHash(nova);
  conta.versao = (conta.versao || 0) + 1;
  await salvarDados();
  enviarJson(res, 200, { ok: true }, cookieDaConta(conta, req.lembrar));
}

// Entrega o login do Foundry na hora de entrar no mundo: o de um personagem só para o
// dono dele, e o do mestre de uma campanha só para o administrador
async function acessoFoundry(req, res, conta) {
  const { personagem: idPersonagem, campanha: idCampanha } = await lerJson(req);
  let usuario;
  let senhaCifrada;
  if (idCampanha) {
    if (!conta.admin) throw new ErroHttp(403, "Só o administrador pode entrar como mestre.");
    const campanha = dados.campanhas.find((c) => c.id === idCampanha);
    if (!campanha) throw new ErroHttp(404, "Campanha não encontrada.");
    usuario = campanha.mestreUsuario;
    senhaCifrada = campanha.mestreSenha;
  } else {
    const personagem = dados.personagens.find((p) => p.id === idPersonagem && p.dono === conta.usuario);
    if (!personagem) throw new ErroHttp(404, "Personagem não encontrado.");
    usuario = personagem.foundryUsuario;
    senhaCifrada = personagem.foundrySenha;
  }
  if (!usuario || !senhaCifrada) throw new ErroHttp(404, "Não há login do Foundry salvo para isso.", "sem-login");
  let senha;
  try {
    senha = decifrar(senhaCifrada);
  } catch {
    throw new ErroHttp(409, "O login salvo não pôde ser lido. Salve de novo na administração.");
  }
  enviarJson(res, 200, { usuario, senha });
}

// O dono do personagem escolhe o nome que aparece no card e a fonte dele
async function personalizarPersonagem(req, res, conta, id) {
  const personagem = dados.personagens.find((p) => p.id === id && p.dono === conta.usuario);
  if (!personagem) throw new ErroHttp(404, "Personagem não encontrado.");
  const { nome, fonte } = await lerJson(req);
  const novoNome = texto(nome, "Nome", 60);
  if (!FONTES.has(fonte)) throw new ErroHttp(400, "Escolha uma das fontes da lista.");
  personagem.nome = novoNome;
  personagem.fonte = fonte;
  await aposentarTitulo(personagem);
  await salvarDados();
  enviarJson(res, 200, { personagem: personagemPublico(personagem) });
}

// Cada pessoa pode trocar o próprio usuário e a própria senha. O nome, só o administrador.
async function atualizarConta(req, res, conta) {
  const { usuario, atual, nova } = await lerJson(req);
  const confere = await conferirSenha(typeof atual === "string" ? atual : "", conta.senha);
  if (!confere) throw new ErroHttp(400, "A senha atual está incorreta.");

  const novoUsuario = String(usuario ?? conta.usuario).trim().toLowerCase();
  if (!REGEX_USUARIO.test(novoUsuario)) {
    throw new ErroHttp(400, "O usuário precisa ter de 2 a 30 caracteres: letras minúsculas, números, hífen ou sublinhado.");
  }
  const mudaUsuario = novoUsuario !== conta.usuario;
  if (mudaUsuario && dados.contas.some((c) => c.usuario === novoUsuario)) {
    throw new ErroHttp(409, "Já existe uma conta com esse usuário.");
  }
  const mudaSenha = typeof nova === "string" && nova.length > 0;
  if (mudaSenha) validarSenhaNova(nova);
  if (!mudaUsuario && !mudaSenha) throw new ErroHttp(400, "Nada mudou. Altere o usuário ou preencha uma nova senha.");

  if (mudaUsuario) {
    for (const personagem of dados.personagens) {
      if (personagem.dono === conta.usuario) personagem.dono = novoUsuario;
    }
    renomearNaLinha(conta.usuario, novoUsuario);
    console.log(`A conta ${conta.usuario} passou a se chamar ${novoUsuario}`);
    conta.usuario = novoUsuario;
  }
  if (mudaSenha) conta.senha = await gerarHash(nova);
  conta.versao = (conta.versao || 0) + 1;
  await salvarDados();
  enviarJson(res, 200, { conta: contaPublica(conta) }, cookieDaConta(conta, req.lembrar));
}

/* ---------- Administração ---------- */

async function tratarAdmin(req, res, rota, metodo, contaAtual) {
  const [, , recurso, idBruto, acao] = rota.split("/").filter(Boolean);
  const id = idBruto ? decodeURIComponent(idBruto) : "";

  if (!recurso && metodo === "GET") {
    await ligarMundosPeloNome();
    return enviarJson(res, 200, await dadosDoAdmin());
  }
  if (recurso === "contas") return adminContas(req, res, metodo, id, acao, contaAtual);
  if (recurso === "campanhas" && !acao) return adminCampanhas(req, res, metodo, id);
  if (recurso === "personagens" && !acao) return adminPersonagens(req, res, metodo, id);
  throw new ErroHttp(404, "Endereço não encontrado.");
}

async function adminContas(req, res, metodo, usuario, acao, contaAtual) {
  if (!usuario && !acao && metodo === "POST") {
    const corpo = await lerJson(req);
    const novo = String(corpo.usuario || "").trim().toLowerCase();
    if (!REGEX_USUARIO.test(novo)) {
      throw new ErroHttp(400, "O usuário precisa ter de 2 a 30 caracteres: letras minúsculas, números, hífen ou sublinhado.");
    }
    if (dados.contas.some((c) => c.usuario === novo)) throw new ErroHttp(409, "Já existe uma conta com esse usuário.");
    const nome = texto(corpo.nome, "Nome", 40);
    validarSenhaNova(corpo.senha);
    dados.contas.push({
      usuario: novo,
      nome,
      admin: corpo.admin === true,
      editor: corpo.editor === true,
      senha: await gerarHash(corpo.senha),
      versao: 0,
    });
    await salvarDados();
    return enviarJson(res, 201, { ok: true });
  }

  const conta = dados.contas.find((c) => c.usuario === usuario);
  if (!conta) throw new ErroHttp(404, "Conta não encontrada.");
  const outrosAdmins = dados.contas.filter((c) => c.admin && c !== conta).length;

  if (acao === "senha" && metodo === "POST") {
    const { senha } = await lerJson(req);
    validarSenhaNova(senha);
    conta.senha = await gerarHash(senha);
    conta.versao = (conta.versao || 0) + 1;
    await salvarDados();
    return enviarJson(res, 200, { ok: true }, conta === contaAtual ? cookieDaConta(conta, req.lembrar) : {});
  }

  if (!acao && metodo === "PUT") {
    const corpo = await lerJson(req);
    const nome = texto(corpo.nome, "Nome", 40);
    const admin = corpo.admin === true;
    if (!admin && conta.admin && !outrosAdmins) throw new ErroHttp(400, "Precisa existir pelo menos um administrador.");
    conta.nome = nome;
    conta.admin = admin;
    // Cargo de Editor da Linha do Tempo (uma página antiga, sem o campo, não mexe nele)
    if (typeof corpo.editor === "boolean") conta.editor = corpo.editor;
    await salvarDados();
    return enviarJson(res, 200, { ok: true });
  }

  if (!acao && metodo === "DELETE") {
    if (conta === contaAtual) throw new ErroHttp(400, "Você não pode excluir a sua própria conta.");
    if (conta.admin && !outrosAdmins) throw new ErroHttp(400, "Precisa existir pelo menos um administrador.");
    if (dados.personagens.some((p) => p.dono === conta.usuario)) {
      throw new ErroHttp(409, "Essa conta ainda tem personagens. Exclua os personagens ou passe para outra conta antes.");
    }
    desligarContaDaLinha(conta);
    dados.contas = dados.contas.filter((c) => c !== conta);
    await salvarDados();
    return enviarJson(res, 200, { ok: true });
  }

  throw new ErroHttp(405, "Operação não permitida.");
}

function valoresDaCampanha(form) {
  const nome = texto(form.get("nome"), "Nome", 80);
  const mundo = String(form.get("mundo") || "");
  if (mundo && !mundoExiste(mundo)) throw new ErroHttp(400, "Esse mundo não foi encontrado no Foundry.");
  const cor = String(form.get("cor") || "#2e3756");
  if (!REGEX_COR.test(cor)) throw new ErroHttp(400, "Escolha uma cor válida.");
  const mestreUsuario = String(form.get("mestre_usuario") || "").trim();
  if (mestreUsuario.length > 60) throw new ErroHttp(400, "O usuário do mestre pode ter no máximo 60 caracteres.");
  if (String(form.get("mestre_senha") || "").length > 200) {
    throw new ErroHttp(400, "A senha do mestre pode ter no máximo 200 caracteres.");
  }
  validarImagens(form);
  return { nome, mundo, cor, mestreUsuario };
}

// Senha em branco mantém a que já estava salva
function aplicarLoginDoMestre(campanha, form) {
  if (form.get("remover_mestre") === "1") {
    campanha.mestreUsuario = "";
    campanha.mestreSenha = null;
    return;
  }
  const senha = String(form.get("mestre_senha") || "");
  if (senha) campanha.mestreSenha = cifrar(senha);
}

async function adminCampanhas(req, res, metodo, id) {
  if (!id && metodo === "POST") {
    const form = await lerFormulario(req);
    const valores = valoresDaCampanha(form);
    const campanha = {
      id: criarId(valores.nome, new Set(dados.campanhas.map((c) => c.id))),
      ...valores,
      capa: null,
      titulo: null,
      arte: null,
      mestreSenha: null,
    };
    aplicarLoginDoMestre(campanha, form);
    await aplicarImagens(campanha, form);
    dados.campanhas.push(campanha);
    await salvarDados();
    return enviarJson(res, 201, { ok: true });
  }

  const campanha = dados.campanhas.find((c) => c.id === id);
  if (!campanha) throw new ErroHttp(404, "Campanha não encontrada.");

  if (metodo === "PUT") {
    const form = await lerFormulario(req);
    Object.assign(campanha, valoresDaCampanha(form));
    aplicarLoginDoMestre(campanha, form);
    await aplicarImagens(campanha, form);
    await salvarDados();
    return enviarJson(res, 200, { ok: true });
  }

  if (metodo === "DELETE") {
    if (dados.personagens.some((p) => p.campanha === campanha.id)) {
      throw new ErroHttp(409, "Essa campanha ainda tem personagens. Exclua os personagens ou mova para outra campanha antes.");
    }
    for (const campo of CAMPOS_IMAGEM) await apagarImagem(campanha[campo]);
    dados.campanhas = dados.campanhas.filter((c) => c !== campanha);
    await salvarDados();
    return enviarJson(res, 200, { ok: true });
  }

  throw new ErroHttp(405, "Operação não permitida.");
}

function valoresDoPersonagem(form) {
  const nome = texto(form.get("nome"), "Nome", 60);
  const dono = String(form.get("dono") || "");
  if (!dados.contas.some((c) => c.usuario === dono)) throw new ErroHttp(400, "Escolha o jogador do personagem.");
  const campanha = String(form.get("campanha") || "");
  if (!dados.campanhas.some((c) => c.id === campanha)) throw new ErroHttp(400, "Escolha a campanha do personagem.");
  const foundryUsuario = String(form.get("foundry_usuario") || "").trim();
  if (foundryUsuario.length > 60) throw new ErroHttp(400, "O usuário do Foundry pode ter no máximo 60 caracteres.");
  const foundrySenha = String(form.get("foundry_senha") || "");
  if (foundrySenha.length > 200) throw new ErroHttp(400, "A senha do Foundry pode ter no máximo 200 caracteres.");
  const fonte = String(form.get("fonte") || FONTE_PADRAO);
  if (!FONTES.has(fonte)) throw new ErroHttp(400, "Escolha uma das fontes da lista.");
  validarImagens(form, CAMPOS_IMAGEM_PERSONAGEM);
  return { nome, dono, campanha, foundryUsuario, fonte };
}

// O título em imagem dos personagens deixou de existir: some com o arquivo antigo, se houver
async function aposentarTitulo(personagem) {
  if (personagem.titulo) {
    await apagarImagem(personagem.titulo);
    personagem.titulo = null;
  }
}

// Senha em branco mantém a que já estava salva
function aplicarLoginFoundry(personagem, form) {
  if (form.get("remover_foundry") === "1") {
    personagem.foundryUsuario = "";
    personagem.foundrySenha = null;
    return;
  }
  const senha = String(form.get("foundry_senha") || "");
  if (senha) personagem.foundrySenha = cifrar(senha);
}

async function adminPersonagens(req, res, metodo, id) {
  if (!id && metodo === "POST") {
    const form = await lerFormulario(req);
    const personagem = {
      id: crypto.randomBytes(6).toString("hex"),
      ...valoresDoPersonagem(form),
      capa: null,
      arte: null,
      foundrySenha: null,
    };
    aplicarLoginFoundry(personagem, form);
    await aplicarImagens(personagem, form, CAMPOS_IMAGEM_PERSONAGEM);
    dados.personagens.push(personagem);
    await salvarDados();
    return enviarJson(res, 201, { ok: true });
  }

  const personagem = dados.personagens.find((p) => p.id === id);
  if (!personagem) throw new ErroHttp(404, "Personagem não encontrado.");

  if (metodo === "PUT") {
    const form = await lerFormulario(req);
    Object.assign(personagem, valoresDoPersonagem(form));
    aplicarLoginFoundry(personagem, form);
    await aplicarImagens(personagem, form, CAMPOS_IMAGEM_PERSONAGEM);
    await aposentarTitulo(personagem);
    await salvarDados();
    return enviarJson(res, 200, { ok: true });
  }

  if (metodo === "DELETE") {
    for (const campo of CAMPOS_IMAGEM) await apagarImagem(personagem[campo]); // inclui o título antigo, se houver
    dados.personagens = dados.personagens.filter((p) => p !== personagem);
    await salvarDados();
    return enviarJson(res, 200, { ok: true });
  }

  throw new ErroHttp(405, "Operação não permitida.");
}

/* =================================================================
   Linha do Tempo: a história de Draevor
   -----------------------------------------------------------------
   Vai do Expurgo Demoníaco, no ano 0 ED, até o ano atual do mundo.
   Editores registram direto; alterar ou apagar o que já está na
   linha vira um pedido que o administrador aprova ou recusa.
   Qualquer conta pode acrescentar frases marcantes.
   ================================================================= */

const ANO_INICIAL_DA_LINHA = 366;
const ANO_MAXIMO_DA_LINHA = 100000;

// Os tipos que vêm com a página (os desenhos dos glifos ficam no linha.js)
const TIPOS_PADRAO = [
  { id: "marco", nome: "Marco", glifo: "marco" },
  { id: "guerra", nome: "Guerra", glifo: "guerra" },
  { id: "queda", nome: "Queda", glifo: "queda" },
  { id: "fundacao", nome: "Fundação", glifo: "fundacao" },
  { id: "catastrofe", nome: "Catástrofe", glifo: "catastrofe" },
  { id: "poder", nome: "Poder", glifo: "poder" },
  { id: "pacto", nome: "Pacto", glifo: "pacto" },
  { id: "arcano", nome: "Arcano", glifo: "arcano" },
  { id: "descoberta", nome: "Descoberta", glifo: "descoberta" },
  { id: "feito", nome: "Feito", glifo: "feito" },
];
const GLIFOS = new Set([
  ...TIPOS_PADRAO.map((t) => t.glifo),
  "lua", "olho", "escudo", "montanha", "sol", "gota", "navio", "torre",
]);
const VISIBILIDADES = new Set(["todos", "revelar", "admin"]);
const LIMITES_LINHA = { citados: 60, frases: 100, tipos: 60, mesasAntigas: 200 };

const chaveDaData = (data) => data.ano * 10000 + (data.mes || 0) * 100 + (data.dia || 0);
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

function origemDaLinha() {
  return {
    id: "origem",
    origem: true,
    titulo: "O Expurgo Demoníaco",
    descricao: "",
    data: { ano: 0, mes: null, dia: null, aprox: false },
    ate: null,
    tipo: "marco",
    importancia: "marco",
    mesas: [],
    personagens: [],
    imagem: null,
    frases: [],
    visibilidade: "todos",
    revelado: false,
    registradoPor: null,
    registradoNome: null,
    criadoEm: carimbo(),
  };
}

// Cria a linha na primeira vez e confere o formato do que está salvo.
// Devolve true quando precisou mudar alguma coisa.
function garantirLinha() {
  let mudou = false;
  if (!dados.linha || typeof dados.linha !== "object" || Array.isArray(dados.linha)) {
    dados.linha = {};
    mudou = true;
  }
  const linha = dados.linha;
  if (!Number.isInteger(linha.anoAtual) || linha.anoAtual < 0) {
    linha.anoAtual = ANO_INICIAL_DA_LINHA;
    mudou = true;
  }
  for (const lista of ["tipos", "mesasAntigas", "acontecimentos", "pendencias"]) {
    if (!Array.isArray(linha[lista])) {
      linha[lista] = [];
      mudou = true;
    }
  }
  if (!linha.acontecimentos.some((a) => a.origem)) {
    linha.acontecimentos.unshift(origemDaLinha());
    mudou = true;
  }
  for (const ev of linha.acontecimentos) {
    for (const lista of ["mesas", "personagens", "frases"]) {
      if (!Array.isArray(ev[lista])) {
        ev[lista] = [];
        mudou = true;
      }
    }
    for (const frase of ev.frases) {
      if (!frase.id) {
        frase.id = novoId("", new Set(ev.frases.map((f) => f.id)));
        mudou = true;
      }
    }
  }
  return mudou;
}

const tiposDaLinha = () => [...TIPOS_PADRAO, ...dados.linha.tipos];
const idsDasMesas = () => new Set([...dados.campanhas.map((c) => c.id), ...dados.linha.mesasAntigas.map((m) => m.id)]);
const idsDosPersonagens = () => new Set(dados.personagens.map((p) => p.id));

// Fica só com os ids que existem, sem repetir
function idsConhecidos(lista, conhecidos) {
  if (!Array.isArray(lista)) return [];
  const escolhidos = lista.filter((id) => typeof id === "string" && conhecidos.has(id));
  return [...new Set(escolhidos)].slice(0, LIMITES_LINHA.citados);
}

// O nome atual da conta; se ela foi excluída, o nome guardado no registro
function nomeDaConta(usuario, reserva) {
  const conta = usuario ? dados.contas.find((c) => c.usuario === usuario) : null;
  return conta ? conta.nome : reserva || null;
}

// Só o administrador vê o que é só dele e o que ainda está selado
function podeVer(conta, ev) {
  if (conta.admin) return true;
  if (ev.visibilidade === "admin") return false;
  return !(ev.visibilidade === "revelar" && !ev.revelado);
}

function semAcontecimento() {
  return new ErroHttp(404, "Esse acontecimento não existe mais. Recarregue a página.", "nao-encontrado");
}

function acontecimentoVisivel(conta, id) {
  const ev = dados.linha.acontecimentos.find((a) => a.id === id);
  if (!ev || !podeVer(conta, ev)) throw semAcontecimento();
  return ev;
}

function exigirAdmin(conta) {
  if (!conta.admin) throw new ErroHttp(403, "Só o administrador pode fazer isso.", "proibido");
}

function exigirEditor(conta) {
  if (cargoDe(conta) === "jogador") {
    throw new ErroHttp(403, "Só os editores e o administrador mexem nos acontecimentos.", "proibido");
  }
}

/* ---------- Formatos enviados à página ---------- */

function dataPublica(data, comAprox) {
  const publica = { ano: data.ano, mes: data.mes || null, dia: data.mes && data.dia ? data.dia : null };
  if (comAprox) publica.aprox = Boolean(data.aprox);
  return publica;
}

function acontecimentoPublico(ev, conta, contexto) {
  const publico = {
    id: ev.id,
    titulo: ev.titulo,
    descricao: ev.descricao || "",
    data: dataPublica(ev.data, true),
    ate: ev.ate ? dataPublica(ev.ate, false) : null,
    tipo: ev.tipo,
    importancia: ev.importancia === "marco" ? "marco" : "comum",
    mesas: ev.mesas.filter((id) => contexto.mesas.has(id)),
    personagens: ev.personagens.filter((id) => contexto.personagens.has(id)),
    imagem: ev.imagem || null,
    frases: ev.frases.map((f) => ({
      id: f.id,
      texto: f.texto,
      autor: f.autor || "",
      podeApagar: Boolean(conta.admin || (f.por && f.por === conta.usuario)),
    })),
    visibilidade: VISIBILIDADES.has(ev.visibilidade) ? ev.visibilidade : "todos",
    revelado: Boolean(ev.revelado),
    registradoPor: nomeDaConta(ev.registradoPor, ev.registradoNome),
    pendente: contexto.cargo !== "jogador" && contexto.comPendencia.has(ev.id),
  };
  if (ev.origem) publico.origem = true;
  return publico;
}

// O pedido de um editor, como o administrador vê para comparar com o card
function pedidoPublico(pedido, contexto) {
  const publico = { ...pedido };
  if (publico.data) publico.data = dataPublica(publico.data, true);
  if (publico.ate) publico.ate = dataPublica(publico.ate, false);
  if (Array.isArray(publico.mesas)) publico.mesas = publico.mesas.filter((id) => contexto.mesas.has(id));
  if (Array.isArray(publico.personagens)) {
    publico.personagens = publico.personagens.filter((id) => contexto.personagens.has(id));
  }
  return publico;
}

function dadosDaLinha(conta) {
  const linha = dados.linha;
  const cargo = cargoDe(conta);
  const contexto = {
    cargo,
    mesas: idsDasMesas(),
    personagens: idsDosPersonagens(),
    comPendencia: new Set(linha.pendencias.map((p) => p.acontecimento)),
  };

  const acontecimentos = [];
  const citadas = new Set();
  for (const ev of linha.acontecimentos) {
    if (ev.visibilidade === "admin" && !conta.admin) continue;
    if (!podeVer(conta, ev)) {
      // Selado: os outros só sabem que algo aconteceu naquele ano
      acontecimentos.push({ id: ev.id, selado: true, data: { ano: ev.data.ano }, importancia: "comum" });
      continue;
    }
    const publico = acontecimentoPublico(ev, conta, contexto);
    for (const id of publico.mesas) citadas.add(id);
    acontecimentos.push(publico);
  }

  // Os jogadores veem as mesas que têm personagens, como na página das mesas, e as citadas na linha
  const comPersonagens = new Set(dados.personagens.map((p) => p.campanha));
  const mesas = [
    ...dados.campanhas
      .filter((c) => cargo !== "jogador" || comPersonagens.has(c.id) || citadas.has(c.id))
      .map((c) => ({ id: c.id, nome: c.nome, cor: c.cor || "#2e3756", mundo: c.mundo || "" })),
    ...linha.mesasAntigas.map((m) => ({ id: m.id, nome: m.nome, cor: m.cor, antiga: true })),
  ];

  return {
    conta: { usuario: conta.usuario, nome: conta.nome, cargo },
    anoAtual: linha.anoAtual,
    tipos: tiposDaLinha().map((t) => ({ id: t.id, nome: t.nome, glifo: t.glifo, padrao: TIPOS_PADRAO.includes(t) })),
    mesas,
    personagens: dados.personagens.map((p) => ({ id: p.id, nome: p.nome, campanha: p.campanha })),
    acontecimentos,
    pendencias: conta.admin
      ? linha.pendencias.map((p) => ({
          id: p.id,
          acontecimento: p.acontecimento,
          acao: p.acao,
          por: nomeDaConta(p.por, p.porNome) || "Um editor",
          ...(p.acao === "alterar" ? { dados: pedidoPublico(p.dados || {}, contexto) } : {}),
        }))
      : [],
  };
}

/* ---------- O que chega do formulário ---------- */

function textoOpcional(valor, campo, max) {
  const limpo = typeof valor === "string" ? valor.replace(/\r\n?/g, "\n").trim() : "";
  if (limpo.length > max) throw new ErroHttp(400, `O campo ${campo} pode ter no máximo ${max} caracteres.`);
  return limpo;
}

// Mês e dia são opcionais: vazio, nulo ou zero quer dizer "sem"
function numeroOuNada(valor, min, max, mensagem) {
  if (valor === null || valor === undefined || valor === "" || valor === 0) return null;
  if (!Number.isInteger(valor) || valor < min || valor > max) throw new ErroHttp(400, mensagem);
  return valor;
}

function lerDataDaLinha(bruta, anoAtual, inicio) {
  const ano = bruta && typeof bruta === "object" ? bruta.ano : undefined;
  if (!Number.isInteger(ano) || ano < 0 || (inicio && ano > anoAtual)) {
    throw new ErroHttp(400, inicio ? `O ano precisa ser um número inteiro de 0 a ${anoAtual}.` : "Escreva o ano em que o período termina.");
  }
  if (ano > anoAtual) throw new ErroHttp(400, `O período não pode passar do ano atual, ${anoAtual} ED.`);
  const mes = numeroOuNada(bruta.mes, 1, 10, "Escolha um mês da lista.");
  const dia = mes ? numeroOuNada(bruta.dia, 1, 30, "Escolha um dia de 1 a 30.") : null;
  const data = { ano, mes, dia };
  if (inicio) data.aprox = bruta.aprox === true;
  return data;
}

// Confere e limpa o que veio do formulário de registro.
// O Expurgo, a origem da linha, só muda título e descrição.
function valoresDoAcontecimento(corpo, conta, origem = false) {
  const titulo = texto(corpo.titulo, "Título", 120);
  const descricao = textoOpcional(corpo.descricao, "Descrição", 3000);
  if (origem) return { titulo, descricao };

  const { anoAtual } = dados.linha;
  const data = lerDataDaLinha(corpo.data, anoAtual, true);
  const ate = corpo.ate ? lerDataDaLinha(corpo.ate, anoAtual, false) : null;
  if (ate && chaveDaData(ate) < chaveDaData(data)) throw new ErroHttp(400, "O período não pode terminar antes de começar.");
  const tipo = typeof corpo.tipo === "string" ? corpo.tipo : "";
  if (!tiposDaLinha().some((t) => t.id === tipo)) throw new ErroHttp(400, "Escolha um tipo da lista.");

  return {
    titulo,
    descricao,
    data,
    ate,
    tipo,
    importancia: corpo.importancia === "marco" ? "marco" : "comum",
    mesas: idsConhecidos(corpo.mesas, idsDasMesas()),
    personagens: idsConhecidos(corpo.personagens, idsDosPersonagens()),
    // Só o administrador escolhe quem vê; o que os editores registram é para todos
    visibilidade: conta.admin && VISIBILIDADES.has(corpo.visibilidade) ? corpo.visibilidade : "todos",
  };
}

function fraseDoCorpo(bruta) {
  if (!bruta || typeof bruta !== "object") return null;
  const frase = textoOpcional(bruta.texto, "Frase", 300);
  if (!frase) return null;
  return { texto: frase, autor: textoOpcional(bruta.autor, "Quem disse", 80) };
}

// Os dados vêm como JSON no campo "dados"; a imagem, se houver, no campo "imagem"
async function lerFormularioDaLinha(req) {
  const form = await lerFormulario(req, CONFIG.maxImagem + CONFIG.maxJson);
  const bruto = form.get("dados");
  let corpo = null;
  if (typeof bruto === "string" && bruto.length <= CONFIG.maxJson) {
    try {
      corpo = JSON.parse(bruto);
    } catch {
      corpo = null;
    }
  }
  if (!corpo || typeof corpo !== "object" || Array.isArray(corpo)) {
    throw new ErroHttp(400, "Os dados enviados não estão em um formato válido.");
  }
  const imagem = form.get("imagem");
  if (!arquivoEnviado(imagem)) return { corpo, imagem: null };
  if (!TIPOS_IMAGEM[imagem.type]) throw new ErroHttp(400, "Use imagens PNG, JPG, WEBP, GIF ou AVIF.");
  if (imagem.size > CONFIG.maxImagem) throw new ErroHttp(413, "A imagem pode ter no máximo 10 MB.");
  return { corpo, imagem };
}

async function guardarImagem(arquivo) {
  const nome = `${crypto.randomBytes(12).toString("hex")}${TIPOS_IMAGEM[arquivo.type]}`;
  await fsp.writeFile(path.join(PASTA_UPLOADS, nome), Buffer.from(await arquivo.arrayBuffer()));
  return `/uploads/${nome}`;
}

async function apagarImagens(caminhos) {
  for (const caminho of caminhos) {
    try {
      await apagarImagem(caminho);
    } catch (erro) {
      console.error(erro);
    }
  }
}

/* ---------- Pedidos dos editores ---------- */

// Um pedido novo substitui o anterior do mesmo editor para o mesmo acontecimento.
// Devolve as imagens dos pedidos substituídos, para apagar depois de salvar.
function registrarPedido(conta, ev, acao, pedido) {
  const linha = dados.linha;
  const anteriores = linha.pendencias.filter((p) => p.acontecimento === ev.id && p.por === conta.usuario);
  linha.pendencias = linha.pendencias.filter((p) => !anteriores.includes(p));
  const pendencia = {
    id: novoId("pend-", new Set(linha.pendencias.map((p) => p.id))),
    acontecimento: ev.id,
    acao,
    por: conta.usuario,
    porNome: conta.nome,
    quando: carimbo(),
  };
  if (pedido) pendencia.dados = pedido;
  linha.pendencias.push(pendencia);
  return anteriores.map((p) => p.dados?.imagemNova).filter(Boolean);
}

// Tira o acontecimento da linha junto com os pedidos sobre ele; devolve as imagens que sobraram
function removerAcontecimento(ev) {
  const linha = dados.linha;
  const pedidos = linha.pendencias.filter((p) => p.acontecimento === ev.id);
  linha.pendencias = linha.pendencias.filter((p) => p.acontecimento !== ev.id);
  linha.acontecimentos = linha.acontecimentos.filter((a) => a !== ev);
  return [ev.imagem, ...pedidos.map((p) => p.dados?.imagemNova)].filter(Boolean);
}

/* ---------- Rotas ---------- */

async function tratarLinha(req, res, rota, metodo, conta) {
  if (garantirLinha()) await salvarDados();
  let partes;
  try {
    partes = rota.split("/").filter(Boolean).slice(2).map(decodeURIComponent);
  } catch {
    throw new ErroHttp(404, "Endereço não encontrado.");
  }
  const [recurso, id, acao, outroId, ...resto] = partes;

  if (!resto.length) {
    if (!recurso && metodo === "GET") return enviarJson(res, 200, dadosDaLinha(conta));

    if (recurso === "acontecimentos") {
      if (!id && metodo === "POST") return registrarAcontecimento(req, res, conta);
      if (id && !acao && metodo === "PUT") return alterarAcontecimento(req, res, conta, id);
      if (id && !acao && metodo === "DELETE") return apagarAcontecimento(res, conta, id);
      if (id && acao === "frases" && !outroId && metodo === "POST") return adicionarFrase(req, res, conta, id);
      if (id && acao === "frases" && outroId && metodo === "DELETE") return apagarFrase(res, conta, id, outroId);
      if (id && acao === "revelar" && !outroId && metodo === "POST") return revelarAcontecimento(res, conta, id);
    }
    if (recurso === "pendencias" && id && !outroId && metodo === "POST" && ["aprovar", "recusar"].includes(acao)) {
      return decidirPedido(res, conta, id, acao === "aprovar");
    }
    if (recurso === "ano-atual" && !id && metodo === "PUT") return mudarAnoAtual(req, res, conta);
    if (recurso === "tipos" && !acao) {
      if (!id && metodo === "POST") return criarTipo(req, res, conta);
      if (id && metodo === "DELETE") return apagarTipo(res, conta, id);
    }
    if (recurso === "mesas-antigas" && !acao) {
      if (!id && metodo === "POST") return salvarMesaAntiga(req, res, conta, null);
      if (id && metodo === "PUT") return salvarMesaAntiga(req, res, conta, id);
      if (id && metodo === "DELETE") return apagarMesaAntiga(res, conta, id);
    }
  }
  throw new ErroHttp(404, "Endereço não encontrado.");
}

async function registrarAcontecimento(req, res, conta) {
  exigirEditor(conta);
  const { corpo, imagem } = await lerFormularioDaLinha(req);
  const valores = valoresDoAcontecimento(corpo, conta);
  const frase = fraseDoCorpo(corpo.frase);
  const caminho = imagem ? await guardarImagem(imagem) : null;

  const linha = dados.linha;
  const quando = carimbo();
  const ev = {
    id: novoId("", new Set(linha.acontecimentos.map((a) => a.id))),
    ...valores,
    imagem: caminho,
    frases: frase ? [{ id: idAleatorio(), ...frase, por: conta.usuario, porNome: conta.nome, quando }] : [],
    revelado: false,
    registradoPor: conta.usuario,
    registradoNome: conta.nome,
    criadoEm: quando,
    alteradoEm: quando,
  };
  linha.acontecimentos.push(ev);
  await salvarDados();
  console.log(`${conta.usuario} registrou na Linha do Tempo: ${ev.titulo}`);
  enviarJson(res, 201, { acontecimento: { id: ev.id } });
}

// O administrador altera direto; o pedido de um editor espera a aprovação dele
async function alterarAcontecimento(req, res, conta, id) {
  exigirEditor(conta);
  acontecimentoVisivel(conta, id); // antes de receber a imagem
  const { corpo, imagem } = await lerFormularioDaLinha(req);
  const valores = valoresDoAcontecimento(corpo, conta, Boolean(acontecimentoVisivel(conta, id).origem));
  const removerImagem = corpo.removerImagem === true && !imagem;
  const caminho = imagem ? await guardarImagem(imagem) : null;

  // Enquanto a imagem era gravada, o acontecimento pode ter saído da linha
  const ev = dados.linha.acontecimentos.find((a) => a.id === id);
  if (!ev || !podeVer(conta, ev)) {
    if (caminho) await apagarImagens([caminho]);
    throw semAcontecimento();
  }

  if (!conta.admin) {
    const pedido = { ...valores };
    delete pedido.visibilidade; // quem vê continua decidido pelo administrador
    if (caminho) pedido.imagemNova = caminho;
    else if (removerImagem) pedido.removerImagem = true;
    const sobras = registrarPedido(conta, ev, "alterar", pedido);
    await salvarDados();
    await apagarImagens(sobras);
    return enviarJson(res, 200, { pendente: true });
  }

  const sobras = [];
  // Passar a "revelar depois" sela o acontecimento de novo
  if (!ev.origem && valores.visibilidade === "revelar" && ev.visibilidade !== "revelar") ev.revelado = false;
  Object.assign(ev, valores);
  if (caminho || removerImagem) {
    if (ev.imagem) sobras.push(ev.imagem);
    ev.imagem = caminho;
  }
  ev.alteradoEm = carimbo();
  await salvarDados();
  await apagarImagens(sobras);
  enviarJson(res, 200, { pendente: false });
}

async function apagarAcontecimento(res, conta, id) {
  exigirEditor(conta);
  const ev = acontecimentoVisivel(conta, id);
  if (ev.origem) throw new ErroHttp(400, "O Expurgo Demoníaco é a origem da linha e não pode ser apagado.");
  const sobras = conta.admin ? removerAcontecimento(ev) : registrarPedido(conta, ev, "apagar", null);
  await salvarDados();
  await apagarImagens(sobras);
  if (conta.admin) console.log(`${conta.usuario} apagou da Linha do Tempo: ${ev.titulo}`);
  enviarJson(res, 200, { pendente: !conta.admin });
}

async function adicionarFrase(req, res, conta, id) {
  acontecimentoVisivel(conta, id);
  const frase = fraseDoCorpo(await lerJson(req));
  if (!frase) throw new ErroHttp(400, "Escreva a frase antes de adicionar.");
  const ev = acontecimentoVisivel(conta, id);
  if (ev.frases.length >= LIMITES_LINHA.frases) throw new ErroHttp(400, "Este acontecimento já tem frases demais.");
  ev.frases.push({
    id: novoId("", new Set(ev.frases.map((f) => f.id))),
    ...frase,
    por: conta.usuario,
    porNome: conta.nome,
    quando: carimbo(),
  });
  await salvarDados();
  enviarJson(res, 201, { ok: true });
}

// Quem acrescentou a frase pode tirá-la; o administrador pode tirar qualquer uma
async function apagarFrase(res, conta, id, idFrase) {
  const ev = acontecimentoVisivel(conta, id);
  const frase = ev.frases.find((f) => f.id === idFrase);
  if (!frase) throw new ErroHttp(404, "Essa frase já foi apagada.", "nao-encontrado");
  if (!conta.admin && frase.por !== conta.usuario) {
    throw new ErroHttp(403, "Só quem acrescentou a frase, ou o administrador, pode apagá-la.", "proibido");
  }
  ev.frases = ev.frases.filter((f) => f !== frase);
  await salvarDados();
  enviarJson(res, 200, { ok: true });
}

async function revelarAcontecimento(res, conta, id) {
  exigirAdmin(conta);
  const ev = acontecimentoVisivel(conta, id);
  if (ev.visibilidade !== "revelar") {
    throw new ErroHttp(400, "Este acontecimento não está guardado para revelar depois.");
  }
  ev.revelado = true;
  ev.reveladoEm = carimbo();
  await salvarDados();
  enviarJson(res, 200, { ok: true });
}

async function decidirPedido(res, conta, id, aprovar) {
  exigirAdmin(conta);
  const linha = dados.linha;
  const pendencia = linha.pendencias.find((p) => p.id === id);
  if (!pendencia) throw new ErroHttp(404, "Esse pedido já foi resolvido.", "nao-encontrado");
  const ev = linha.acontecimentos.find((a) => a.id === pendencia.acontecimento);
  const sobras = [];

  if (aprovar && ev && pendencia.acao === "apagar") {
    sobras.push(...removerAcontecimento(ev));
  } else if (aprovar && ev) {
    const { imagemNova, removerImagem, ...pedido } = pendencia.dados || {};
    if (ev.origem) {
      Object.assign(ev, { titulo: pedido.titulo, descricao: pedido.descricao });
    } else {
      // O que mudou desde o pedido pode impedir a aprovação
      if (!tiposDaLinha().some((t) => t.id === pedido.tipo)) {
        throw new ErroHttp(409, "O tipo pedido não existe mais. Recuse o pedido ou crie o tipo de novo.");
      }
      const ultimoAno = Math.max(pedido.data.ano, pedido.ate?.ano ?? 0);
      if (ultimoAno > linha.anoAtual) {
        throw new ErroHttp(409, `O pedido usa ${ultimoAno} ED, depois do ano atual do mundo (${linha.anoAtual} ED).`);
      }
      Object.assign(ev, {
        titulo: pedido.titulo,
        descricao: pedido.descricao,
        data: pedido.data,
        ate: pedido.ate,
        tipo: pedido.tipo,
        importancia: pedido.importancia,
        mesas: idsConhecidos(pedido.mesas, idsDasMesas()),
        personagens: idsConhecidos(pedido.personagens, idsDosPersonagens()),
      });
    }
    if (imagemNova || removerImagem) {
      if (ev.imagem) sobras.push(ev.imagem);
      ev.imagem = imagemNova || null;
    }
    ev.alteradoEm = carimbo();
    linha.pendencias = linha.pendencias.filter((p) => p !== pendencia);
  } else {
    // Recusado (ou o acontecimento já saiu da linha): o pedido some com a imagem que trazia
    linha.pendencias = linha.pendencias.filter((p) => p !== pendencia);
    if (pendencia.dados?.imagemNova) sobras.push(pendencia.dados.imagemNova);
  }

  await salvarDados();
  await apagarImagens(sobras);
  enviarJson(res, 200, { ok: true });
}

async function mudarAnoAtual(req, res, conta) {
  exigirAdmin(conta);
  const { ano } = await lerJson(req);
  if (!Number.isInteger(ano) || ano < 0) throw new ErroHttp(400, "Escreva um ano inteiro, de 0 em diante.");
  if (ano > ANO_MAXIMO_DA_LINHA) throw new ErroHttp(400, `O ano atual pode ir até ${ANO_MAXIMO_DA_LINHA} ED.`);
  const linha = dados.linha;
  const ultimo = linha.acontecimentos.reduce((maior, a) => Math.max(maior, a.data.ano, a.ate?.ano ?? 0), 0);
  if (ano < ultimo) {
    throw new ErroHttp(400, `Há acontecimentos registrados até ${ultimo} ED. O ano atual não pode ficar antes deles.`);
  }
  linha.anoAtual = ano;
  await salvarDados();
  enviarJson(res, 200, { ok: true });
}

async function criarTipo(req, res, conta) {
  exigirAdmin(conta);
  const corpo = await lerJson(req);
  const nome = textoOpcional(corpo.nome, "Nome do tipo", 40);
  if (!nome) throw new ErroHttp(400, "Dê um nome ao tipo.");
  const linha = dados.linha;
  if (tiposDaLinha().some((t) => semAcentos(t.nome) === semAcentos(nome))) {
    throw new ErroHttp(409, "Já existe um tipo com esse nome.");
  }
  if (linha.tipos.length >= LIMITES_LINHA.tipos) throw new ErroHttp(400, "Há tipos demais. Apague algum que ninguém usa.");
  const ocupados = new Set(tiposDaLinha().map((t) => t.id));
  linha.tipos.push({ id: novoId("tipo-", ocupados), nome, glifo: GLIFOS.has(corpo.glifo) ? corpo.glifo : "marco" });
  await salvarDados();
  enviarJson(res, 201, { ok: true });
}

async function apagarTipo(res, conta, id) {
  exigirAdmin(conta);
  const linha = dados.linha;
  if (TIPOS_PADRAO.some((t) => t.id === id)) throw new ErroHttp(400, "Os tipos que vêm com a página não podem ser apagados.");
  const tipo = linha.tipos.find((t) => t.id === id);
  if (!tipo) throw new ErroHttp(404, "Esse tipo não existe mais.", "nao-encontrado");
  if (linha.acontecimentos.some((a) => a.tipo === id)) throw new ErroHttp(409, "Esse tipo ainda é usado por algum acontecimento.");
  if (linha.pendencias.some((p) => p.dados?.tipo === id)) {
    throw new ErroHttp(409, "Esse tipo aparece num pedido esperando aprovação. Resolva o pedido antes.");
  }
  linha.tipos = linha.tipos.filter((t) => t !== tipo);
  await salvarDados();
  enviarJson(res, 200, { ok: true });
}

// Mesas antigas entram só com nome e cor, para poderem ser citadas
async function salvarMesaAntiga(req, res, conta, id) {
  exigirAdmin(conta);
  const corpo = await lerJson(req);
  const nome = textoOpcional(corpo.nome, "Nome da mesa", 80);
  if (!nome) throw new ErroHttp(400, "Dê um nome à mesa.");
  if (typeof corpo.cor !== "string" || !REGEX_COR.test(corpo.cor)) throw new ErroHttp(400, "Escolha uma cor válida.");
  const cor = corpo.cor.toLowerCase();
  const linha = dados.linha;
  if (id) {
    const mesa = linha.mesasAntigas.find((m) => m.id === id);
    if (!mesa) throw new ErroHttp(404, "Essa mesa não existe mais.", "nao-encontrado");
    Object.assign(mesa, { nome, cor });
  } else {
    if (linha.mesasAntigas.length >= LIMITES_LINHA.mesasAntigas) throw new ErroHttp(400, "Há mesas antigas demais.");
    linha.mesasAntigas.push({ id: novoId("antiga-", idsDasMesas()), nome, cor });
  }
  await salvarDados();
  enviarJson(res, id ? 200 : 201, { ok: true });
}

// Apagar uma mesa antiga tira também as citações dela
async function apagarMesaAntiga(res, conta, id) {
  exigirAdmin(conta);
  const linha = dados.linha;
  if (!linha.mesasAntigas.some((m) => m.id === id)) throw new ErroHttp(404, "Essa mesa não existe mais.", "nao-encontrado");
  linha.mesasAntigas = linha.mesasAntigas.filter((m) => m.id !== id);
  for (const ev of linha.acontecimentos) ev.mesas = ev.mesas.filter((m) => m !== id);
  for (const p of linha.pendencias) {
    if (Array.isArray(p.dados?.mesas)) p.dados.mesas = p.dados.mesas.filter((m) => m !== id);
  }
  await salvarDados();
  enviarJson(res, 200, { ok: true });
}

// Quando alguém troca o próprio usuário, os registros dele na linha acompanham
function renomearNaLinha(antigo, novo) {
  const linha = dados.linha;
  if (!linha) return;
  for (const ev of linha.acontecimentos) {
    if (ev.registradoPor === antigo) ev.registradoPor = novo;
    for (const frase of ev.frases || []) if (frase.por === antigo) frase.por = novo;
  }
  for (const p of linha.pendencias) if (p.por === antigo) p.por = novo;
}

// Conta excluída: os registros dela guardam só o nome, e ninguém herda o que era dela
function desligarContaDaLinha(conta) {
  const linha = dados.linha;
  if (!linha) return;
  for (const ev of linha.acontecimentos) {
    if (ev.registradoPor === conta.usuario) Object.assign(ev, { registradoPor: null, registradoNome: conta.nome });
    for (const frase of ev.frases || []) {
      if (frase.por === conta.usuario) Object.assign(frase, { por: null, porNome: conta.nome });
    }
  }
  for (const p of linha.pendencias) if (p.por === conta.usuario) Object.assign(p, { por: null, porNome: conta.nome });
}

/* =================================================================
   Arquivos do site
   ================================================================= */

const TIPOS_ARQUIVO = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".avif": "image/avif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' https://fonts.googleapis.com",
  "font-src https://fonts.gstatic.com",
  "img-src 'self' data: blob:",
  "connect-src 'self'",
  "frame-ancestors 'self'",
  "base-uri 'self'",
].join("; ");

function naoEncontrado(res) {
  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("Página não encontrada.");
}

async function servirArquivo(req, res, url) {
  let base = PASTA_PUBLICA;
  let relativo = url.pathname;
  let cacheLongo = false;
  if (relativo.startsWith("/uploads/")) {
    base = PASTA_UPLOADS;
    relativo = relativo.slice("/uploads".length);
    cacheLongo = true; // nomes aleatórios: o arquivo nunca muda
  }

  let decodificado;
  try {
    decodificado = decodeURIComponent(relativo);
  } catch {
    return naoEncontrado(res);
  }
  if (decodificado.includes("\0")) return naoEncontrado(res);

  let caminho = path.join(base, decodificado);
  if (caminho !== base && !caminho.startsWith(base + path.sep)) return naoEncontrado(res);

  let info;
  try {
    info = await fsp.stat(caminho);
    if (info.isDirectory()) {
      caminho = path.join(caminho, "index.html");
      info = await fsp.stat(caminho);
    }
  } catch {
    return naoEncontrado(res);
  }

  const tipo = TIPOS_ARQUIVO[path.extname(caminho).toLowerCase()] || "application/octet-stream";
  const modificado = info.mtime.toUTCString();
  const cabecalhos = {
    "Content-Type": tipo,
    "Last-Modified": modificado,
    "Cache-Control": cacheLongo ? "public, max-age=31536000, immutable" : "no-cache",
  };
  if (tipo.startsWith("text/html")) cabecalhos["Content-Security-Policy"] = CSP;

  if (req.headers["if-modified-since"] === modificado) {
    res.writeHead(304, cabecalhos);
    return res.end();
  }
  res.writeHead(200, { ...cabecalhos, "Content-Length": info.size });
  if (req.method === "HEAD") return res.end();
  fs.createReadStream(caminho).pipe(res);
}

/* =================================================================
   Início
   ================================================================= */

const servidor = http.createServer(async (req, res) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "same-origin");
  let url;
  try {
    url = new URL(req.url, "http://portal.local");
  } catch {
    return naoEncontrado(res);
  }

  try {
    if (url.pathname === "/api" || url.pathname.startsWith("/api/")) return await tratarApi(req, res, url);
    if (req.method !== "GET" && req.method !== "HEAD") throw new ErroHttp(405, "Método não permitido.");
    return await servirArquivo(req, res, url);
  } catch (erro) {
    const conhecido = erro instanceof ErroHttp;
    if (!conhecido) console.error(erro);
    if (res.headersSent) return res.end();
    const status = conhecido ? erro.status : 500;
    const mensagem = conhecido ? erro.message : "O portal encontrou um erro. Tente de novo em instantes.";
    enviarJson(res, status, { erro: mensagem, codigo: conhecido ? erro.codigo : undefined, ...(erro.extra || {}) });
  }
});

async function novaSenhaPeloTerminal(usuario) {
  const conta = dados.contas.find((c) => c.usuario === String(usuario || "").toLowerCase());
  if (!conta) {
    console.error(`Conta não encontrada: ${usuario || "(nenhuma informada)"}`);
    process.exit(1);
  }
  const senha = gerarSenhaLegivel();
  conta.senha = await gerarHash(senha);
  conta.versao = (conta.versao || 0) + 1;
  await salvarDados();
  console.log(`Nova senha da conta "${conta.usuario}": ${senha}`);
}

async function iniciar() {
  fs.mkdirSync(PASTA_UPLOADS, { recursive: true });
  fs.mkdirSync(path.dirname(ARQ_PEDIDO), { recursive: true });
  segredo = carregarSegredo();
  carregarDados();
  hashFalso = await gerarHash(crypto.randomBytes(16).toString("hex"));

  if (process.argv[2] === "--nova-senha") return novaSenhaPeloTerminal(process.argv[3]);

  // Primeira vez com a Linha do Tempo: começa no Expurgo, com o mundo em 366 ED
  if (garantirLinha()) await salvarDados();

  // Administrador sem senha (primeira vez): gera uma e mostra no registro do serviço
  for (const conta of dados.contas.filter((c) => c.admin && !c.senha)) {
    const senha = gerarSenhaLegivel();
    conta.senha = await gerarHash(senha);
    conta.versao = (conta.versao || 0) + 1;
    await salvarDados();
    console.log(`Senha inicial da conta "${conta.usuario}": ${senha}`);
  }

  await ligarMundosPeloNome();
  servidor.listen(CONFIG.porta, CONFIG.host, () => {
    console.log(`Portal no ar em http://${CONFIG.host}:${CONFIG.porta}`);
  });
}

iniciar().catch((erro) => {
  console.error(erro);
  process.exit(1);
});
