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

   O multiplicador secreto: o admin põe um multiplicador em cada
   conta (PUT /api/uso/multiplicadores/<usuario>, de 0 a 10). O
   painel mostra o tempo dessa conta vezes ele, a partir do dia (de
   Brasília) em que mudou: cada dia guardado conta com o
   multiplicador que valia nele, e os dias de antes da troca não
   mudam. Só o admin recebe o multiplicador e o tempo de verdade; as
   outras contas só recebem o tempo já multiplicado. A conta guarda
   o tempo de verdade; o multiplicador fica à parte, no mesmo
   uso.json, com o dia em que cada um começou.
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
  multiplicadorMaximo: 10,
};

// As páginas que pulsam: as da barra lateral e o chat
const PAGINAS_DO_USO = new Set(["mesas", "linha", "personagens", "mapas", "memorias", "regras", "caderno", "mural", "chat"]);

const FORMATO_DO_DIA = /^\d{4}-\d{2}-\d{2}$/;

// uso.contas: usuario → { total, dias: { "AAAA-MM-DD": soma }, ajuste? }, o tempo de verdade.
// uso.multiplicadores: usuario → [{ desde: "AAAA-MM-DD", vezes }], em ordem; sem lista, a conta é ×1.
// Os dois sem protótipo: uma conta chamada "constructor" ou "__proto__" não esbarra no Object.prototype.
const usoVazio = (desde) => ({ formato: 1, desde, contas: Object.create(null), multiplicadores: Object.create(null) });

let uso = usoVazio(null);
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

// Junta em "soma" a "parte" vezes "fator" (o fator pode quebrar os segundos; o painel arredonda no fim)
function juntar(soma, parte, fator) {
  if (!parte || !fator) return;
  soma.s += parte.s * fator;
  soma.voz += parte.voz * fator;
  for (const [pagina, s] of Object.entries(parte.paginas)) soma.paginas[pagina] = (soma.paginas[pagina] ?? 0) + s * fator;
}

/* =================================================================
   O multiplicador secreto
   ================================================================= */

// O multiplicador que vale no dia: o último da lista que começou até ele; antes do primeiro, 1
function vezesNaLista(lista, dia) {
  let vezes = 1;
  for (const trecho of lista ?? []) {
    if (trecho.desde > dia) break;
    vezes = trecho.vezes;
  }
  return vezes;
}

const multiplicadorEm = (usuario, dia) => vezesNaLista(uso.multiplicadores[usuario], dia);

// O admin troca o multiplicador da conta: vale de hoje em diante. Trocar de novo no mesmo dia só
// corrige o de hoje; voltar ao que valia ontem tira o de hoje da lista.
function definirMultiplicador(usuario, vezes, agora = Date.now()) {
  const hoje = diaDeBrasilia(agora);
  const lista = (uso.multiplicadores[usuario] ?? []).filter((trecho) => trecho.desde < hoje);
  if (vezesNaLista(lista, hoje) !== vezes) lista.push({ desde: hoje, vezes });
  if (lista.length) uso.multiplicadores[usuario] = lista;
  else delete uso.multiplicadores[usuario];
  mudou = true;
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

// O ajuste guarda segundos quebrados e pode ser negativo (multiplicador abaixo de 1)
function conferirAjuste(soma) {
  const numero = (n) => (Number.isFinite(n) ? n : 0);
  const paginas = {};
  if (soma?.paginas && typeof soma.paginas === "object") {
    for (const [pagina, s] of Object.entries(soma.paginas)) if (numero(s)) paginas[pagina] = numero(s);
  }
  return { s: numero(soma?.s), voz: numero(soma?.voz), paginas };
}

const multiplicadorValido = (vezes) => Number.isFinite(vezes) && vezes >= 0 && vezes <= USO.multiplicadorMaximo;

// Em ordem de dia, um por dia (fica o último)
function conferirMultiplicadores(lista) {
  const porDia = new Map();
  for (const trecho of Array.isArray(lista) ? lista : []) {
    if (typeof trecho?.desde !== "string" || !FORMATO_DO_DIA.test(trecho.desde)) continue;
    if (!multiplicadorValido(trecho.vezes)) continue;
    porDia.set(trecho.desde, Math.round(trecho.vezes * 100) / 100);
  }
  return [...porDia]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([desde, vezes]) => ({ desde, vezes }));
}

function conferirUso(lido) {
  const certo = usoVazio(null);
  if (typeof lido?.desde === "string" && FORMATO_DO_DIA.test(lido.desde)) certo.desde = lido.desde;
  if (lido?.contas && typeof lido.contas === "object") {
    for (const [usuario, registro] of Object.entries(lido.contas)) {
      const dias = {};
      if (registro?.dias && typeof registro.dias === "object") {
        for (const [dia, soma] of Object.entries(registro.dias)) {
          if (FORMATO_DO_DIA.test(dia)) dias[dia] = conferirSoma(soma);
        }
      }
      certo.contas[usuario] = { total: conferirSoma(registro?.total), dias };
      if (registro?.ajuste) certo.contas[usuario].ajuste = conferirAjuste(registro.ajuste);
    }
  }
  if (lido?.multiplicadores && typeof lido.multiplicadores === "object") {
    for (const [usuario, lista] of Object.entries(lido.multiplicadores)) {
      const certa = conferirMultiplicadores(lista);
      if (certa.length) certo.multiplicadores[usuario] = certa;
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
      uso = usoVazio(diaDeBrasilia(Date.now()));
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
    uso = usoVazio(diaDeBrasilia(Date.now()));
    mudou = true;
  }
  gravarUso();
  setInterval(gravarUso, USO.gravarACada).unref();
  return false; // nada no dados.json
}

// Os dias velhos saem; o total fica. O que o multiplicador somou (ou tirou) num dia que sai passa
// para o ajuste da conta, e o "desde sempre" do painel não muda.
function tirarDiasVelhos(agora = Date.now()) {
  const limite = diaAntes(diaDeBrasilia(agora), USO.diasGuardados);
  for (const [usuario, registro] of Object.entries(uso.contas)) {
    for (const [dia, doDia] of Object.entries(registro.dias)) {
      if (dia >= limite) continue;
      const vezes = multiplicadorEm(usuario, dia);
      if (vezes !== 1) juntar((registro.ajuste ??= somaVazia()), doDia, vezes - 1);
      delete registro.dias[dia];
    }
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

// Os segundos inteiros, nunca abaixo de zero; as páginas sem tempo saem
function arredondar(soma) {
  const inteiro = (n) => Math.max(0, Math.round(n));
  const paginas = {};
  for (const [pagina, s] of Object.entries(soma.paginas)) if (inteiro(s)) paginas[pagina] = inteiro(s);
  return { s: inteiro(soma.s), voz: inteiro(soma.voz), paginas };
}

// Os dias desde "desde" (inclusive), cada um vezes o multiplicador que valia nele
function somarDias(registro, desde, vezesNoDia) {
  const soma = somaVazia();
  for (const [dia, doDia] of Object.entries(registro?.dias ?? {})) {
    if (dia >= desde) juntar(soma, doDia, vezesNoDia(dia));
  }
  return arredondar(soma);
}

// Desde sempre: o total, mais o que o multiplicador somou (ou tirou) nos dias guardados e nos que já saíram
function somarSempre(registro, vezesNoDia) {
  const soma = somaVazia();
  if (!registro) return soma;
  juntar(soma, registro.total, 1);
  juntar(soma, registro.ajuste, 1);
  for (const [dia, doDia] of Object.entries(registro.dias)) juntar(soma, doDia, vezesNoDia(dia) - 1);
  return arredondar(soma);
}

// O painel como a conta o vê: o tempo já multiplicado. Só o admin recebe também o multiplicador
// de hoje e o tempo de verdade ("real"); para as outras contas, o multiplicador não existe.
function dadosDoUso(quemVe, agora = Date.now()) {
  const hoje = diaDeBrasilia(agora);
  const semana = diaAntes(hoje, 6);
  const mes = diaAntes(hoje, 29);
  const contas = dados.contas.map((conta) => {
    const registro = uso.contas[conta.usuario];
    const { cor, foto } = perfilPublico(conta.usuario);
    const ultimo = ultimos.get(conta.usuario);
    const vezesNoDia = (dia) => multiplicadorEm(conta.usuario, dia);
    const linha = {
      usuario: conta.usuario,
      nome: conta.nome,
      cor,
      foto,
      agora: ultimo !== undefined && agora - ultimo <= USO.agora * 1000,
      semana: somarDias(registro, semana, vezesNoDia),
      mes: somarDias(registro, mes, vezesNoDia),
      sempre: somarSempre(registro, vezesNoDia),
    };
    if (quemVe?.admin) {
      linha.multiplicador = multiplicadorEm(conta.usuario, hoje);
      linha.real = {
        semana: somarDias(registro, semana, () => 1),
        mes: somarDias(registro, mes, () => 1),
        sempre: structuredClone(registro?.total ?? somaVazia()),
      };
    }
    return linha;
  });
  return { desde: uso.desde ?? hoje, contas };
}

/* =================================================================
   As rotas
   ================================================================= */

const ROTA_DOS_MULTIPLICADORES = "/api/uso/multiplicadores/";

// PUT /api/uso/multiplicadores/<usuario> { vezes }: só o admin. Grava na hora.
async function trocarMultiplicador(req, res, conta, usuario) {
  if (!conta.admin) throw new ErroHttp(403, "Só o administrador pode fazer isso.", "proibido");
  if (!dados.contas.some((c) => c.usuario === usuario)) throw new ErroHttp(404, "Conta não encontrada.");
  const { vezes } = await lerJson(req);
  if (typeof vezes !== "number" || !multiplicadorValido(vezes)) {
    throw new ErroHttp(400, `O multiplicador vai de 0 a ${USO.multiplicadorMaximo}.`);
  }
  const certo = Math.round(vezes * 100) / 100;
  definirMultiplicador(usuario, certo);
  await gravarUso();
  return enviarJson(res, 200, { usuario, multiplicador: certo });
}

async function tratarUso(req, res, rota, metodo, conta) {
  if (rota === "/api/uso" && metodo === "GET") return enviarJson(res, 200, dadosDoUso(conta));
  if (rota === "/api/uso/pulso" && metodo === "POST") {
    const { pagina, voz } = await lerJson(req);
    if (typeof pagina !== "string" || !PAGINAS_DO_USO.has(pagina)) throw new ErroHttp(400, "Página desconhecida.");
    if (typeof voz !== "boolean") throw new ErroHttp(400, "O campo voz precisa ser verdadeiro ou falso.");
    somarPulso(conta.usuario, pagina, voz);
    res.writeHead(204, { "Cache-Control": "no-store" });
    return res.end();
  }
  if (rota.startsWith(ROTA_DOS_MULTIPLICADORES) && metodo === "PUT") {
    let usuario;
    try {
      usuario = decodeURIComponent(rota.slice(ROTA_DOS_MULTIPLICADORES.length));
    } catch {
      throw new ErroHttp(404, "Endereço não encontrado.");
    }
    if (!usuario || usuario.includes("/")) throw new ErroHttp(404, "Endereço não encontrado.");
    return trocarMultiplicador(req, res, conta, usuario);
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
  if (Object.hasOwn(uso.multiplicadores, antigo)) {
    uso.multiplicadores[novo] = uso.multiplicadores[antigo];
    delete uso.multiplicadores[antigo];
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
  if (Object.hasOwn(uso.multiplicadores, conta.usuario)) {
    delete uso.multiplicadores[conta.usuario];
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
  definirMultiplicador,
  multiplicadorEm,
  tirarDiasVelhos,
  lerUso: () => uso,
};
