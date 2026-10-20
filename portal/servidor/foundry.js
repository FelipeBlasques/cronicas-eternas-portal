"use strict";
/* =================================================================
   Crônicas Eternas: o Foundry visto pelo portal
   -----------------------------------------------------------------
   Status do servidor, lista de mundos e o pedido de troca de mundo,
   que um vigia na VPS lê para reiniciar o Foundry no mundo certo.
   ================================================================= */

const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const { CONFIG, ARQ_PEDIDO, PASTA_MUNDOS, REGEX_MUNDO, dados, salvarDados, semAcentos } = require("./base");

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

// Pede ao vigia da VPS para abrir outro mundo
async function pedirTroca(mundo) {
  await fsp.mkdir(path.dirname(ARQ_PEDIDO), { recursive: true });
  await fsp.writeFile(ARQ_PEDIDO, `${mundo}\n`);
  troca = { mundo, desde: Date.now() };
}

module.exports = { statusFoundry, estadoAtual, mundoExiste, listarMundos, ligarMundosPeloNome, pedirTroca };
