#!/usr/bin/env node
"use strict";
/* =================================================================
   Crônicas Eternas: servidor do portal
   -----------------------------------------------------------------
   Roda na VPS como serviço (portal.service). Não usa bibliotecas
   externas, só o que já vem com o Node.

   Este arquivo é o núcleo: liga o servidor, serve os arquivos do
   site e distribui os pedidos da API. O resto fica em servidor/:
     base.js      configuração, dados, sessões e utilidades
     foundry.js   status do Foundry, mundos e troca de mundo
     mesas.js     página Mesas e a conta de cada pessoa
     admin.js     administração
     linha.js     Linha do Tempo
     regras.js    Regras da casa
     personagens.js  Personagens (a galeria)

   Comandos:
     node servidor.js                     inicia o portal
     node servidor.js --nova-senha conta  gera uma senha nova para a conta
   ================================================================= */

const http = require("node:http");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const {
  CONFIG,
  PASTA_PUBLICA,
  PASTA_UPLOADS,
  ARQ_PEDIDO,
  dados,
  carregarDados,
  salvarDados,
  recarregarSeMudou,
  prepararSegredos,
  gerarHash,
  gerarSenhaLegivel,
  sessaoDoToken,
  lerCookies,
  cookieSessao,
  cookieDaConta,
  ErroHttp,
  enviarJson,
  origemValida,
  contaPublica,
} = require("./servidor/base");
const { statusFoundry, estadoAtual, ligarMundosPeloNome } = require("./servidor/foundry");
const {
  dadosDoPortal,
  dadosDaBarra,
  entrar,
  abrir,
  trocarSenha,
  acessoFoundry,
  personalizarPersonagem,
  atualizarConta,
} = require("./servidor/mesas");
const { tratarAdmin } = require("./servidor/admin");

// As páginas do grupo que têm dados próprios. Cada módulo responde pelos endereços
// que começam com o seu prefixo (ex.: /api/linha) e pode conferir os dados ao ligar.
const PAGINAS = [require("./servidor/linha"), require("./servidor/regras"), require("./servidor/personagens")];

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
  if (rota === "/api/barra" && metodo === "GET") return enviarJson(res, 200, dadosDaBarra(conta));
  if (rota === "/api/estado" && metodo === "GET") return enviarJson(res, 200, await estadoAtual());
  if (rota === "/api/abrir" && metodo === "POST") return abrir(req, res, conta);
  if (rota === "/api/senha" && metodo === "POST") return trocarSenha(req, res, conta);
  if (rota === "/api/conta" && metodo === "POST") return atualizarConta(req, res, conta);
  if (rota.startsWith("/api/personagens/") && metodo === "PUT") {
    return personalizarPersonagem(req, res, conta, decodeURIComponent(rota.slice("/api/personagens/".length)));
  }
  if (rota === "/api/acesso-foundry" && metodo === "POST") return acessoFoundry(req, res, conta);

  const pagina = PAGINAS.find((p) => rota === p.prefixo || rota.startsWith(`${p.prefixo}/`));
  if (pagina) return pagina.tratar(req, res, rota, metodo, conta);

  if (rota === "/api/admin" || rota.startsWith("/api/admin/")) {
    if (!conta.admin) throw new ErroHttp(403, "Só o administrador pode fazer isso.");
    return tratarAdmin(req, res, rota, metodo, conta);
  }

  throw new ErroHttp(404, "Endereço não encontrado.");
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
  await prepararSegredos();
  carregarDados();

  if (process.argv[2] === "--nova-senha") return novaSenhaPeloTerminal(process.argv[3]);

  // Cada página confere os próprios dados. Na primeira vez, a Linha do Tempo começa no Expurgo.
  let mudou = false;
  for (const pagina of PAGINAS) if (pagina.iniciar?.()) mudou = true;
  if (mudou) await salvarDados();

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
