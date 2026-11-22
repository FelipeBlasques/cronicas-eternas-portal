"use strict";
/* =================================================================
   Crônicas Eternas: os arquivos dos livros em PDF (Memórias)
   -----------------------------------------------------------------
   Cada Livro das Memórias tem uma pasta em livros/<id da memória>/,
   fora do dados.json: o PDF do miolo e as imagens da capa, da
   lombada e da contracapa. O nome de cada arquivo é aleatório e muda
   a cada envio, então o navegador pode guardá-lo para sempre.

   Aqui só se recebe, manda e apaga arquivos. Quem pode o quê fica no
   servidor/memorias.js, que é quem usa estas funções.
   ================================================================= */

const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const { Transform } = require("node:stream");
const { pipeline } = require("node:stream/promises");
const { CONFIG, ErroHttp, TIPOS_IMAGEM } = require("./base");

const PASTA_LIVROS = path.join(CONFIG.pastaDados, "livros");
const REGEX_ID = /^[\w-]{1,60}$/;
const REGEX_ARQUIVO = /^(miolo|capa|lombada|contracapa)-[0-9a-f]{16}\.(pdf|png|jpg|webp|gif|avif)$/;
const TIPO_DA_EXTENSAO = {
  ...Object.fromEntries(Object.entries(TIPOS_IMAGEM).map(([tipo, extensao]) => [extensao, tipo])),
  ".pdf": "application/pdf",
};
const CACHE_DO_ARQUIVO = "private, max-age=31536000, immutable"; // o nome muda a cada envio
const INICIO_CONFERIDO = 1024; // os primeiros bytes, para conferir o tipo (o "%PDF-" pode vir até aí)

function pastaDoLivro(id) {
  if (!REGEX_ID.test(id)) throw new ErroHttp(404, "Esse livro não existe.");
  return path.join(PASTA_LIVROS, id);
}

const arquivoValido = (arquivo) => typeof arquivo === "string" && REGEX_ARQUIVO.test(arquivo);

const grandeDemais = (limite) =>
  new ErroHttp(413, `O arquivo passou do limite de ${Math.round(limite / (1024 * 1024))} MB.`, "grande-demais");

// Grava o corpo do pedido (o arquivo cru, sem formulário) na pasta do livro, com nome aleatório.
// Conta os bytes enquanto chegam (para no limite) e confere o começo com "inicioValido".
// Devolve { arquivo, bytes }. Se algo falhar, nada fica na pasta.
async function receberArquivo(req, id, parte, extensao, { limite, inicioValido, mensagemDoTipo }) {
  if (Number(req.headers["content-length"]) > limite) throw grandeDemais(limite);
  const pasta = pastaDoLivro(id);
  await fsp.mkdir(pasta, { recursive: true });
  const arquivo = `${parte}-${crypto.randomBytes(8).toString("hex")}${extensao}`;
  const temporario = path.join(pasta, `.${arquivo}.tmp`);

  let bytes = 0;
  const inicio = [];
  let guardados = 0;
  const contador = new Transform({
    transform(pedaco, _codificacao, pronto) {
      bytes += pedaco.length;
      if (bytes > limite) return pronto(grandeDemais(limite));
      if (guardados < INICIO_CONFERIDO) {
        inicio.push(pedaco.subarray(0, INICIO_CONFERIDO - guardados));
        guardados += Math.min(pedaco.length, INICIO_CONFERIDO - guardados);
      }
      pronto(null, pedaco);
    },
  });

  try {
    await pipeline(req, contador, fs.createWriteStream(temporario, { mode: 0o600 }));
    if (!bytes) throw new ErroHttp(400, "O arquivo chegou vazio.");
    if (!inicioValido(Buffer.concat(inicio))) throw new ErroHttp(400, mensagemDoTipo);
    await fsp.rename(temporario, path.join(pasta, arquivo));
    return { arquivo, bytes };
  } catch (erro) {
    await fsp.rm(temporario, { force: true }).catch(() => {});
    if (erro instanceof ErroHttp) throw erro;
    throw new ErroHttp(400, "O envio do arquivo foi interrompido. Tente de novo.");
  }
}

// Só a primeira faixa de um "Range: bytes=..." (o pdf.js pede uma por vez).
// Devolve null sem faixa (ou com uma que não entende), "fora" se ela passa do arquivo.
function faixaPedida(cabecalho, tamanho) {
  const casou = /^bytes=(\d*)-(\d*)$/.exec(String(cabecalho || "").split(",")[0].trim());
  if (!casou || (!casou[1] && !casou[2])) return null;
  let inicio;
  let fim;
  if (!casou[1]) {
    // "bytes=-500": os últimos 500
    inicio = Math.max(0, tamanho - Number(casou[2]));
    fim = tamanho - 1;
  } else {
    inicio = Number(casou[1]);
    fim = casou[2] ? Math.min(Number(casou[2]), tamanho - 1) : tamanho - 1;
  }
  if (inicio >= tamanho || inicio > fim) return "fora";
  return { inicio, fim };
}

// "Crônica dos Sete Invernos.pdf": o nome no "Salvar como", com um nome sem acentos para os
// navegadores antigos
function disposicao(nome) {
  const limpo = nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\w .()-]+/g, "")
    .trim();
  const simples = limpo.replace(/\.pdf$/i, "").trim() ? limpo : "livro.pdf";
  return `attachment; filename="${simples}"; filename*=UTF-8''${encodeURIComponent(nome)}`;
}

// Manda um arquivo do livro, com faixas (o pdf.js lê só o pedaço do PDF que precisa) e,
// com "baixarComo", como um arquivo para salvar
async function mandarArquivo(req, res, id, arquivo, { baixarComo = null } = {}) {
  if (!arquivoValido(arquivo)) throw new ErroHttp(404, "Esse arquivo não existe.");
  const caminho = path.join(pastaDoLivro(id), arquivo);
  let info;
  try {
    info = await fsp.stat(caminho);
  } catch {
    throw new ErroHttp(404, "Esse arquivo não existe.");
  }
  const cabecalhos = {
    "Content-Type": TIPO_DA_EXTENSAO[path.extname(arquivo)],
    "Cache-Control": CACHE_DO_ARQUIVO,
    "Accept-Ranges": "bytes",
  };
  if (baixarComo) cabecalhos["Content-Disposition"] = disposicao(baixarComo);

  const faixa = faixaPedida(req.headers.range, info.size);
  if (faixa === "fora") {
    res.writeHead(416, { ...cabecalhos, "Content-Range": `bytes */${info.size}` });
    return res.end();
  }
  const { inicio, fim } = faixa ?? { inicio: 0, fim: info.size - 1 };
  if (faixa) {
    res.writeHead(206, { ...cabecalhos, "Content-Range": `bytes ${inicio}-${fim}/${info.size}`, "Content-Length": fim - inicio + 1 });
  } else {
    res.writeHead(200, { ...cabecalhos, "Content-Length": info.size });
  }
  if (req.method === "HEAD" || !info.size) return res.end();
  // Quem desiste no meio (o pdf.js troca o pedido inteiro por faixas) fecha a conexão: tudo bem
  await pipeline(fs.createReadStream(caminho, { start: inicio, end: fim }), res).catch(() => {});
}

async function apagarArquivo(id, arquivo) {
  if (!arquivoValido(arquivo)) return;
  try {
    await fsp.rm(path.join(pastaDoLivro(id), arquivo), { force: true });
  } catch (erro) {
    console.error(erro);
  }
}

// A pasta inteira do livro (memória apagada, ou que deixou de ser Livro)
async function apagarLivro(id) {
  try {
    await fsp.rm(pastaDoLivro(id), { recursive: true, force: true });
  } catch (erro) {
    if (!(erro instanceof ErroHttp)) console.error(erro);
  }
}

// Ao ligar: tira as pastas de memórias que não existem mais e, nas outras, os arquivos que
// nenhum livro usa (um envio interrompido, ou o antigo de uma troca que não terminou).
// "emUso": id → os nomes dos arquivos que o livro usa.
async function arrumarPastas(emUso) {
  let pastas;
  try {
    pastas = await fsp.readdir(PASTA_LIVROS, { withFileTypes: true });
  } catch {
    return; // ainda não há livros
  }
  for (const pasta of pastas) {
    if (!pasta.isDirectory()) continue;
    const usados = emUso.get(pasta.name);
    if (!usados) {
      await apagarLivro(pasta.name);
      continue;
    }
    for (const arquivo of await fsp.readdir(path.join(PASTA_LIVROS, pasta.name))) {
      if (!usados.has(arquivo)) await fsp.rm(path.join(PASTA_LIVROS, pasta.name, arquivo), { force: true }).catch(() => {});
    }
  }
}

module.exports = { receberArquivo, mandarArquivo, apagarArquivo, apagarLivro, arrumarPastas, arquivoValido, PASTA_LIVROS };
