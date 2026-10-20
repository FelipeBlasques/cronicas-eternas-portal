"use strict";
/* =================================================================
   Crônicas Eternas: base do servidor
   -----------------------------------------------------------------
   O que todas as partes do servidor usam: configuração, dados,
   senhas e sessões, utilidades de HTTP, validação, imagens e os
   formatos enviados ao navegador. Não conhece nenhuma página.
   ================================================================= */

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
  maxMapa: 25 * 1024 * 1024, // 25 MB: só a imagem de um mapa, na página Mapas
  maxJson: 64 * 1024,
};

const PASTA_PUBLICA = path.join(__dirname, "..", "publico");
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

// Todas as partes do servidor usam este mesmo objeto. Ele nunca é trocado por
// outro: quando o arquivo é lido de novo, o conteúdo é substituído aqui dentro.
const dados = {};
let carimboDados = 0;
let filaGravacao = Promise.resolve();
let segredo = "";
let hashFalso = "";

function substituirDados(novos) {
  for (const chave of Object.keys(dados)) delete dados[chave];
  Object.assign(dados, novos);
}

function carregarDados() {
  if (fs.existsSync(ARQ_DADOS)) {
    substituirDados(JSON.parse(fs.readFileSync(ARQ_DADOS, "utf8")));
  } else {
    substituirDados(structuredClone(DADOS_INICIAIS));
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
      substituirDados(JSON.parse(await fsp.readFile(ARQ_DADOS, "utf8")));
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

// O segredo assina as sessões. A senha falsa iguala o tempo de um login com usuário que não existe.
async function prepararSegredos() {
  segredo = carregarSegredo();
  hashFalso = await gerarHash(crypto.randomBytes(16).toString("hex"));
}

const senhaFalsa = () => hashFalso;

/* =================================================================
   Ganchos entre as partes
   -----------------------------------------------------------------
   Quando uma conta muda de usuário ou é excluída, cada página que
   guarda usuários de contas acerta os próprios registros. Quando uma
   mesa é apagada, cada página tira o id dela de onde a cita. O módulo
   da página se inscreve aqui; quem muda a conta ou a mesa só avisa.
   ================================================================= */

const ganchos = {
  renomearConta: [], // (usuarioAntigo, usuarioNovo)
  excluirConta: [], // (conta), antes de a conta sair da lista
  excluirMesa: [], // (id), antes de a mesa sair da lista
};

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

// O limite padrão serve a quase tudo; a importação de lugares dos Mapas usa um maior
async function lerJson(req, limite = CONFIG.maxJson) {
  const tipo = req.headers["content-type"] || "";
  if (!tipo.startsWith("application/json")) throw new ErroHttp(415, "Envie os dados em JSON.");
  const partes = [];
  let tamanho = 0;
  for await (const parte of req) {
    tamanho += parte.length;
    if (tamanho > limite) throw new ErroHttp(413, "Os dados enviados são grandes demais.");
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
   Imagens enviadas
   ================================================================= */

const CAMPOS_IMAGEM = ["capa", "titulo", "arte"]; // campanhas
const CAMPOS_IMAGEM_PERSONAGEM = ["capa", "arte"]; // personagens: o nome agora é texto, com fonte escolhida
const CAMPOS_IMAGEM_GALERIA = ["retrato"]; // a arte da ficha na galeria, separada do card das Mesas
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

// Grava uma imagem enviada com nome aleatório e devolve o endereço dela
async function guardarImagem(arquivo) {
  const nome = `${crypto.randomBytes(12).toString("hex")}${TIPOS_IMAGEM[arquivo.type]}`;
  await fsp.writeFile(path.join(PASTA_UPLOADS, nome), Buffer.from(await arquivo.arrayBuffer()));
  return `/uploads/${nome}`;
}

// Apaga várias imagens; um erro numa delas não impede as outras
async function apagarImagens(caminhos) {
  for (const caminho of caminhos) {
    try {
      await apagarImagem(caminho);
    } catch (erro) {
      console.error(erro);
    }
  }
}

// O título em imagem dos personagens deixou de existir: some com o arquivo antigo, se houver
async function aposentarTitulo(personagem) {
  if (personagem.titulo) {
    await apagarImagem(personagem.titulo);
    personagem.titulo = null;
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
    naPaginaMesas: c.naPaginaMesas !== false,
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

module.exports = {
  CONFIG,
  PASTA_PUBLICA,
  PASTA_UPLOADS,
  ARQ_PEDIDO,
  PASTA_MUNDOS,
  dados,
  carregarDados,
  salvarDados,
  recarregarSeMudou,
  prepararSegredos,
  senhaFalsa,
  ganchos,
  gerarHash,
  conferirSenha,
  gerarSenhaLegivel,
  sessaoDoToken,
  lerCookies,
  cookieSessao,
  cookieDaConta,
  cifrar,
  decifrar,
  tentativas,
  bloqueado,
  registrarFalha,
  ipDe,
  ErroHttp,
  enviarJson,
  origemValida,
  lerJson,
  lerFormulario,
  texto,
  validarSenhaNova,
  FONTES,
  FONTE_PADRAO,
  REGEX_USUARIO,
  REGEX_MUNDO,
  REGEX_COR,
  semAcentos,
  criarId,
  CAMPOS_IMAGEM,
  CAMPOS_IMAGEM_PERSONAGEM,
  CAMPOS_IMAGEM_GALERIA,
  TIPOS_IMAGEM,
  arquivoEnviado,
  validarImagens,
  apagarImagem,
  apagarImagens,
  aplicarImagens,
  guardarImagem,
  aposentarTitulo,
  contaPublica,
  campanhaPublica,
  personagemPublico,
};
