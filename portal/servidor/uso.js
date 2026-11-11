"use strict";
/* =================================================================
   Crônicas Eternas: o tempo no portal
   -----------------------------------------------------------------
   Cada página do portal (as da barra lateral e o chat) manda um
   pulso a cada 30 segundos enquanto está à vista e em uso, ou numa
   chamada do chat (POST /api/uso/pulso). Aqui o pulso vira tempo:
   até 90 segundos depois do anterior da mesma conta (de qualquer
   janela), soma o tempo desde ele; no primeiro, ou depois de mais
   de 90 segundos, soma 30. Assim duas janelas não contam em dobro.

   Os números ficam em uso.json, na pasta dos dados, fora do
   dados.json: o total e cada dia (de Brasília) de cada conta, em
   segundos, com o tempo de cada página e o tempo em chamada. O
   último pulso de cada conta fica só na memória. Grava uma vez por
   minuto, se mudou; os dias com mais de 400 dias saem ao gravar.

   O GET /api/uso é o painel "Tempo no portal" do Mural.
   ================================================================= */

const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const { CONFIG, dados, ganchos, ErroHttp, enviarJson, lerJson } = require("./base");
const { perfilPublico } = require("./chat");

const ARQ_USO = path.join(CONFIG.pastaDados, "uso.json");

const USO = {
  passo: 30, // segundos somados no primeiro pulso, ou depois de um intervalo longo
  intervaloMaximo: 90, // segundos entre dois pulsos que ainda contam o tempo do relógio
  agora: 120, // segundos desde o último pulso para estar "no portal agora"
  diasGuardados: 400, // os dias mais antigos saem ao gravar; o total fica
  gravarACada: 60000, // ms
};

// As páginas que pulsam: as da barra lateral e o chat
const PAGINAS_DO_USO = new Set(["mesas", "linha", "personagens", "mapas", "memorias", "regras", "caderno", "mural", "chat"]);

let uso = { formato: 1, desde: null, contas: {} };
let mudou = false;
let gravando = Promise.resolve();
const ultimos = new Map(); // usuario → o último pulso (ms), só na memória

/* =================================================================
   Os dias de Brasília
   ================================================================= */

const FORMATO_DE_BRASILIA = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

// "2026-11-12": o dia em Brasília do instante (ms)
function diaDeBrasilia(ms) {
  const partes = Object.fromEntries(FORMATO_DE_BRASILIA.formatToParts(new Date(ms)).map((p) => [p.type, p.value]));
  return `${partes.year}-${partes.month}-${partes.day}`;
}

// O dia "AAAA-MM-DD" que fica "dias" antes deste
function diaAntes(dia, dias) {
  return new Date(Date.parse(`${dia}T00:00:00Z`) - dias * 86400000).toISOString().slice(0, 10);
}

/* =================================================================
   A conta do tempo
   ================================================================= */

const somaVazia = () => ({ s: 0, voz: 0, paginas: {} });

function acrescentar(soma, segundos, pagina, voz) {
  soma.s += segundos;
  if (voz) soma.voz += segundos;
  soma.paginas[pagina] = (soma.paginas[pagina] ?? 0) + segundos;
}

// Um pulso da conta, no instante "agora" (ms). Devolve os segundos somados.
function somarPulso(usuario, pagina, voz, agora = Date.now()) {
  const anterior = ultimos.get(usuario);
  let segundos = USO.passo;
  if (anterior !== undefined) {
    const passou = (agora - anterior) / 1000;
    if (passou < 0) segundos = 0; // um pulso atrasado de outra janela: o tempo já contou
    else if (passou <= USO.intervaloMaximo) segundos = Math.round(passou);
  }
  ultimos.set(usuario, Math.max(anterior ?? agora, agora));
  if (!segundos) return 0;

  const dia = diaDeBrasilia(agora);
  if (!uso.desde) uso.desde = dia;
  const registro = (uso.contas[usuario] ??= { total: somaVazia(), dias: {} });
  acrescentar(registro.total, segundos, pagina, voz);
  acrescentar((registro.dias[dia] ??= somaVazia()), segundos, pagina, voz);
  mudou = true;
  return segundos;
}

/* =================================================================
   Ler e gravar o uso.json
   ================================================================= */

function conferirSoma(soma) {
  const numero = (n) => (Number.isFinite(n) && n > 0 ? Math.round(n) : 0);
  const paginas = {};
  if (soma?.paginas && typeof soma.paginas === "object") {
    for (const [pagina, s] of Object.entries(soma.paginas)) if (numero(s)) paginas[pagina] = numero(s);
  }
  return { s: numero(soma?.s), voz: numero(soma?.voz), paginas };
}

function conferirUso(lido) {
  const certo = { formato: 1, desde: null, contas: {} };
  if (typeof lido?.desde === "string" && /^\d{4}-\d{2}-\d{2}$/.test(lido.desde)) certo.desde = lido.desde;
  if (lido?.contas && typeof lido.contas === "object") {
    for (const [usuario, registro] of Object.entries(lido.contas)) {
      const dias = {};
      if (registro?.dias && typeof registro.dias === "object") {
        for (const [dia, soma] of Object.entries(registro.dias)) {
          if (/^\d{4}-\d{2}-\d{2}$/.test(dia)) dias[dia] = conferirSoma(soma);
        }
      }
      certo.contas[usuario] = { total: conferirSoma(registro?.total), dias };
    }
  }
  return certo;
}

// Ao ligar: lê o arquivo. Na primeira vez, cria com o dia de hoje em "desde".
function iniciarUso() {
  try {
    if (fs.existsSync(ARQ_USO)) {
      uso = conferirUso(JSON.parse(fs.readFileSync(ARQ_USO, "utf8")));
    } else {
      uso = { formato: 1, desde: diaDeBrasilia(Date.now()), contas: {} };
      mudou = true;
    }
  } catch (erro) {
    // Um arquivo estragado fica guardado ao lado, e a conta recomeça
    console.error("Não foi possível ler o uso.json; ele foi guardado como uso.json.com-erro:", erro);
    try {
      fs.copyFileSync(ARQ_USO, `${ARQ_USO}.com-erro`);
    } catch {
      // sem cópia, segue
    }
    uso = { formato: 1, desde: diaDeBrasilia(Date.now()), contas: {} };
    mudou = true;
  }
  gravarUso();
  setInterval(gravarUso, USO.gravarACada).unref();
  return false; // nada no dados.json
}

// Os dias velhos saem; o total fica
function tirarDiasVelhos(agora = Date.now()) {
  const limite = diaAntes(diaDeBrasilia(agora), USO.diasGuardados);
  for (const registro of Object.values(uso.contas)) {
    for (const dia of Object.keys(registro.dias)) if (dia < limite) delete registro.dias[dia];
  }
}

// Grava em fila, num temporário e depois "rename", como o salvarDados. Só se mudou.
function gravarUso() {
  gravando = gravando
    .catch(() => {})
    .then(async () => {
      if (!mudou) return;
      mudou = false;
      tirarDiasVelhos();
      const temporario = `${ARQ_USO}.tmp`;
      try {
        await fsp.writeFile(temporario, JSON.stringify(uso), { mode: 0o600 });
        await fsp.rename(temporario, ARQ_USO);
      } catch (erro) {
        mudou = true; // tenta de novo no próximo minuto
        console.error("Não foi possível gravar o uso.json:", erro);
      }
    });
  return gravando;
}

/* =================================================================
   O painel
   ================================================================= */

function somarDias(registro, desde) {
  const soma = somaVazia();
  for (const [dia, doDia] of Object.entries(registro?.dias ?? {})) {
    if (dia < desde) continue;
    soma.s += doDia.s;
    soma.voz += doDia.voz;
    for (const [pagina, s] of Object.entries(doDia.paginas)) soma.paginas[pagina] = (soma.paginas[pagina] ?? 0) + s;
  }
  return soma;
}

function dadosDoUso(agora = Date.now()) {
  const hoje = diaDeBrasilia(agora);
  const contas = dados.contas.map((conta) => {
    const registro = uso.contas[conta.usuario];
    const { cor, foto } = perfilPublico(conta.usuario);
    const ultimo = ultimos.get(conta.usuario);
    return {
      usuario: conta.usuario,
      nome: conta.nome,
      cor,
      foto,
      agora: ultimo !== undefined && agora - ultimo <= USO.agora * 1000,
      semana: somarDias(registro, diaAntes(hoje, 6)),
      mes: somarDias(registro, diaAntes(hoje, 29)),
      sempre: structuredClone(registro?.total ?? somaVazia()),
    };
  });
  return { desde: uso.desde ?? hoje, contas };
}

/* =================================================================
   As rotas
   ================================================================= */

async function tratarUso(req, res, rota, metodo, conta) {
  if (rota === "/api/uso" && metodo === "GET") return enviarJson(res, 200, dadosDoUso());
  if (rota === "/api/uso/pulso" && metodo === "POST") {
    const { pagina, voz } = await lerJson(req);
    if (typeof pagina !== "string" || !PAGINAS_DO_USO.has(pagina)) throw new ErroHttp(400, "Página desconhecida.");
    if (typeof voz !== "boolean") throw new ErroHttp(400, "O campo voz precisa ser verdadeiro ou falso.");
    somarPulso(conta.usuario, pagina, voz);
    res.writeHead(204, { "Cache-Control": "no-store" });
    return res.end();
  }
  throw new ErroHttp(404, "Endereço não encontrado.");
}

/* =================================================================
   Contas renomeadas e excluídas
   ================================================================= */

ganchos.renomearConta.push((antigo, novo) => {
  if (Object.hasOwn(uso.contas, antigo)) {
    uso.contas[novo] = uso.contas[antigo];
    delete uso.contas[antigo];
    mudou = true;
  }
  if (ultimos.has(antigo)) {
    ultimos.set(novo, ultimos.get(antigo));
    ultimos.delete(antigo);
  }
});

ganchos.excluirConta.push((conta) => {
  if (Object.hasOwn(uso.contas, conta.usuario)) {
    delete uso.contas[conta.usuario];
    mudou = true;
  }
  ultimos.delete(conta.usuario);
});

// Os endereços /api/uso/... são desta parte. "iniciar" lê o uso.json e liga a gravação de cada minuto.
// O resto do que sai daqui serve aos testes.
module.exports = {
  prefixo: "/api/uso",
  tratar: tratarUso,
  iniciar: iniciarUso,
  somarPulso,
  gravarUso,
  dadosDoUso,
  diaDeBrasilia,
  lerUso: () => uso,
};
