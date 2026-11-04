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
     mapas.js     Mapas
     memorias.js  Memórias de Draevor
     caderno.js   Caderno (cada conta tem o seu, fora do dados.json)
     chat.js      Chat (canais, privadas e eventos; as mensagens ficam fora do dados.json)

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
  tokenDaSessao,
  sessaoDoCookieAntigo,
  cookiesDeSair,
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
const PAGINAS = [
  require("./servidor/linha"),
  require("./servidor/regras"),
  require("./servidor/personagens"),
  require("./servidor/mapas"),
  require("./servidor/memorias"),
  require("./servidor/caderno"),
  require("./servidor/chat"),
];

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

  // As rotas públicas (a leitura pública de uma nota do Caderno) abrem sem login, só para GET.
  // Quem está logado vê também os links que a conta dele vê.
  if (metodo === "GET") {
    const publica = PAGINAS.find((p) => p.prefixoPublico && rota.startsWith(`${p.prefixoPublico}/`));
    if (publica) {
      const logada = sessaoDoToken(tokenDaSessao(req))?.conta ?? null;
      return publica.tratarPublico(req, res, rota, metodo, logada);
    }
  }

  if (metodo !== "GET" && !origemValida(req)) throw new ErroHttp(403, "Pedido de outro site recusado.");

  if (rota === "/api/entrar" && metodo === "POST") return entrar(req, res);
  if (rota === "/api/sair" && metodo === "POST") {
    return enviarJson(res, 200, { ok: true }, cookiesDeSair());
  }

  const sessao = sessaoDoToken(tokenDaSessao(req));
  if (!sessao) throw new ErroHttp(401, "Entre na sua conta para continuar.", "sem-sessao");
  const { conta } = sessao;
  req.lembrar = sessao.lembrar;

  // Migração sozinha: quem entrou antes do chat tem o cookie antigo, só do portal. A resposta
  // leva o cookie novo, que vale também no chat, e apaga o antigo. Uma rota que manda o próprio
  // cookie da conta (renovar, trocar a senha) passa por cima deste, com o mesmo efeito.
  if (sessaoDoCookieAntigo(req)) res.setHeader("Set-Cookie", cookieDaConta(conta, sessao.lembrar)["Set-Cookie"]);

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

function montarCsp({ conexoes = [], midia = false, imagens = [] } = {}) {
  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' https://fonts.googleapis.com",
    "font-src https://fonts.gstatic.com",
    ["img-src 'self' data: blob:", ...imagens].join(" "),
    ["connect-src 'self'", ...conexoes].join(" "),
    ...(midia ? ["media-src 'self' blob: mediastream:"] : []),
    "frame-ancestors 'self'",
    "base-uri 'self'",
  ].join("; ");
}

// O LiveKit público, para a CSP do chat deixar a voz conectar: a sinalização (wss) e a
// conferência quando ela falha (https). Com ws:// (o LiveKit local, no teste), ws e http.
function conexoesDoLivekit() {
  if (!CONFIG.livekitUrl) return [];
  try {
    const { protocol, host } = new URL(CONFIG.livekitUrl);
    return protocol === "ws:" || protocol === "http:" ? [`ws://${host}`, `http://${host}`] : [`wss://${host}`, `https://${host}`];
  } catch {
    console.error(`LIVEKIT_URL inválido: ${CONFIG.livekitUrl}`);
    return [];
  }
}

const CSP = montarCsp();
// Só o html do chat: a voz (o LiveKit), o áudio e o vídeo das chamadas e as imagens dos GIFs (a Klipy)
const CSP_CHAT = montarCsp({
  conexoes: conexoesDoLivekit(),
  midia: true,
  imagens: CONFIG.klipyMidia.map((host) => `https://${host}`),
});
const PASTA_DO_CHAT = path.join(PASTA_PUBLICA, "chat");
const HTML_DO_CHAT = path.join(PASTA_DO_CHAT, "index.html");
// Os arquivos de publico/chat/ (sem o index.html), que no endereço do chat são pedidos na raiz
// (o index.html os pede por caminho relativo). A lista é lida uma vez, quando o portal liga.
const ARQUIVOS_DO_CHAT = new Set(
  fs.readdirSync(PASTA_DO_CHAT, { withFileTypes: true })
    .filter((item) => item.isFile() && item.name !== "index.html")
    .map((item) => item.name)
);

/* ---------- O endereço do chat ---------- */

// O domínio principal é o do chat sem o primeiro rótulo (chat.cronicaseternas.com → cronicaseternas.com)
const DOMINIO_PRINCIPAL = CONFIG.hostChat.split(".").slice(1).join(".");

function hostDoPedido(req) {
  return String(req.headers.host || "").toLowerCase().replace(/:\d+$/, "");
}

function redirecionar(res, destino) {
  res.writeHead(302, { Location: destino, "Cache-Control": "no-store" });
  res.end();
}

// No endereço do chat, "/" é a página do chat e as outras páginas voltam ao portal.
// No portal, /chat/ vai para o endereço do chat, para ele ter uma origem só (avisos do
// navegador e permissão do microfone valem por origem). Devolve true se já respondeu.
function tratarEnderecoDoChat(req, res, url) {
  if (!CONFIG.hostChat || (req.method !== "GET" && req.method !== "HEAD")) return false;
  const caminho = url.pathname;
  if (caminho === "/api" || caminho.startsWith("/api/")) return false;
  if (hostDoPedido(req) === CONFIG.hostChat) {
    if (caminho === "/") return false; // o servirArquivo serve o html do chat
    if (caminho.endsWith("/") && DOMINIO_PRINCIPAL) {
      redirecionar(res, `https://${DOMINIO_PRINCIPAL}${caminho}${url.search}`);
      return true;
    }
    return false;
  }
  if (caminho === "/chat" || caminho === "/chat/") {
    redirecionar(res, `https://${CONFIG.hostChat}/`);
    return true;
  }
  return false;
}

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
  if (base === PASTA_PUBLICA && CONFIG.hostChat && hostDoPedido(req) === CONFIG.hostChat) {
    if (decodificado === "/") caminho = HTML_DO_CHAT;
    else if (ARQUIVOS_DO_CHAT.has(decodificado.slice(1))) caminho = path.join(PASTA_DO_CHAT, decodificado.slice(1));
  }
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
  if (tipo.startsWith("text/html")) cabecalhos["Content-Security-Policy"] = caminho === HTML_DO_CHAT ? CSP_CHAT : CSP;

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
    if (tratarEnderecoDoChat(req, res, url)) return;
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
