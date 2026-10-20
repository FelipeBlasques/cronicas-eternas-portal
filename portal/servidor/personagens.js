"use strict";
/* =================================================================
   Crônicas Eternas: Personagens, a galeria de Draevor
   -----------------------------------------------------------------
   Os personagens do portal (os dos jogadores, com card nas Mesas)
   ganham uma ficha. Os outros, NPCs e personagens sem conta no
   portal, são cadastrados aqui pelo administrador ou por um editor.
   Os editores alteram qualquer personagem que veem; apagar e
   escolher quem vê ficam com o administrador. Os caídos continuam
   na galeria. Ninguém precisa de aprovação.
   A arte da galeria fica em "retrato", separada da capa e da arte
   do card das Mesas.
   ================================================================= */

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const {
  CONFIG,
  PASTA_UPLOADS,
  dados,
  salvarDados,
  ganchos,
  ErroHttp,
  enviarJson,
  lerFormulario,
  texto,
  FONTES,
  FONTE_PADRAO,
  CAMPOS_IMAGEM_GALERIA,
  validarImagens,
  aplicarImagens,
  apagarImagens,
} = require("./base");
const { iniciar: garantirLinha, lerDataDaLinha, podeVer, dataPublica, chaveDaData, textoOpcional } = require("./linha");

const PAPEIS = new Set(["jogador", "npc"]);
const SITUACOES = new Set(["vivo", "caido", "desaparecido", "aposentado"]);
const VISIBILIDADES = new Set(["todos", "admin"]);
const LIMITE_OUTROS = 500;

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

// O retrato de um personagem do portal nasce de uma cópia da capa (ou da arte), para que trocar
// ou remover a imagem numa página nunca apague o arquivo da outra. As imagens fixas do site não são copiadas.
function retratoCopiado(p) {
  const origem = p.capa || p.arte;
  if (!origem) return null;
  if (!origem.startsWith("/uploads/")) return origem;
  const arquivo = path.join(PASTA_UPLOADS, path.basename(origem));
  if (!fs.existsSync(arquivo)) return null;
  const nome = `${crypto.randomBytes(12).toString("hex")}${path.extname(arquivo)}`;
  try {
    fs.copyFileSync(arquivo, path.join(PASTA_UPLOADS, nome));
  } catch (erro) {
    console.error(erro); // sem a cópia, o personagem fica sem retrato e ganha outro pela galeria
    return null;
  }
  return `/uploads/${nome}`;
}

// Cria a lista dos outros personagens na primeira vez e confere o formato do que está salvo.
// Quem ainda não tem "retrato" vem de antes da arte própria da galeria e passa pela migração.
// Devolve true quando precisou mudar alguma coisa.
function garantirPersonagens() {
  let mudou = false;
  if (!Array.isArray(dados.outrosPersonagens)) {
    dados.outrosPersonagens = [];
    mudou = true;
  }
  for (const p of dados.personagens) {
    if ("retrato" in p) continue;
    p.retrato = retratoCopiado(p);
    mudou = true;
  }
  for (const p of dados.outrosPersonagens) {
    if (!Array.isArray(p.mesas)) {
      p.mesas = [];
      mudou = true;
    }
    // Nenhum arquivo é apagado: a arte recortada que sobrar fica em uploads/
    if (!("retrato" in p)) {
      p.retrato = p.capa || p.arte || null;
      delete p.capa;
      delete p.arte;
      mudou = true;
    }
  }
  return mudou;
}

const idsDasMesas = () => new Set(dados.campanhas.map((c) => c.id));

// Fica só com as mesas que existem, sem repetir
function mesasConhecidas(lista) {
  if (!Array.isArray(lista)) return [];
  const conhecidas = idsDasMesas();
  return [...new Set(lista.filter((id) => typeof id === "string" && conhecidas.has(id)))];
}

// Só o administrador vê os personagens guardados para ele. Os editores alteram qualquer um que veem.
const podeVerOutro = (conta, p) => Boolean(conta.admin || p.visibilidade !== "admin");
const podeEditarFicha = (conta, p) => Boolean(conta.admin || conta.editor || p.dono === conta.usuario);
const podeEditarOutro = (conta) => Boolean(conta.admin || conta.editor);

function exigirAdmin(conta) {
  if (!conta.admin) throw new ErroHttp(403, "Só o administrador pode fazer isso.", "proibido");
}

function exigirEditor(conta) {
  if (cargoDe(conta) === "jogador") {
    throw new ErroHttp(403, "Só os editores e o administrador cadastram personagens.", "proibido");
  }
}

function semPersonagem() {
  return new ErroHttp(404, "Esse personagem não existe mais. Recarregue a página.", "nao-encontrado");
}

function fichaEditavel(conta, id) {
  const personagem = dados.personagens.find((p) => p.id === id);
  if (!personagem) throw semPersonagem();
  if (!podeEditarFicha(conta, personagem)) {
    throw new ErroHttp(403, "Só o jogador do personagem, os editores e o administrador mudam a ficha.", "proibido");
  }
  return personagem;
}

function outroVisivel(conta, id) {
  const personagem = dados.outrosPersonagens.find((p) => p.id === id);
  if (!personagem || !podeVerOutro(conta, personagem)) throw semPersonagem();
  return personagem;
}

function outroEditavel(conta, id) {
  const personagem = outroVisivel(conta, id);
  if (!podeEditarOutro(conta)) {
    throw new ErroHttp(403, "Só os editores e o administrador alteram personagens.", "proibido");
  }
  return personagem;
}

/* ---------- Formato enviado à página ---------- */

function fichaPublica(p) {
  const situacao = SITUACOES.has(p.situacao) ? p.situacao : "vivo";
  const queda =
    situacao === "caido" && p.queda
      ? { data: p.queda.data ? dataPublica(p.queda.data, true) : null, epitafio: p.queda.epitafio || "" }
      : null;
  return { situacao, queda, origem: p.origem || "", resumo: p.resumo || "", historia: p.historia || "" };
}

// Os logins do Foundry ficam de fora
function personagemDoPortal(p, conta) {
  const dono = dados.contas.find((c) => c.usuario === p.dono);
  const nomeDono = dono ? dono.nome : p.dono;
  return {
    id: p.id,
    origemDoDado: "portal",
    nome: p.nome,
    fonte: FONTES.has(p.fonte) ? p.fonte : FONTE_PADRAO,
    retrato: p.retrato || null,
    papel: "jogador",
    jogador: nomeDono,
    dono: p.dono,
    nomeDono,
    mesas: [p.campanha],
    ...fichaPublica(p),
    visibilidade: "todos",
    podeEditar: podeEditarFicha(conta, p),
  };
}

function outroPublico(p, conta, conhecidas) {
  return {
    id: p.id,
    origemDoDado: "outro",
    nome: p.nome,
    fonte: FONTES.has(p.fonte) ? p.fonte : FONTE_PADRAO,
    retrato: p.retrato || null,
    papel: PAPEIS.has(p.papel) ? p.papel : "npc",
    jogador: p.jogador || "",
    mesas: p.mesas.filter((id) => conhecidas.has(id)),
    ...fichaPublica(p),
    visibilidade: VISIBILIDADES.has(p.visibilidade) ? p.visibilidade : "todos",
    podeEditar: podeEditarOutro(conta),
  };
}

// Para cada personagem, os acontecimentos da Linha que a conta pode ver e que o citam, do mais antigo ao mais recente
function jornadaDe(conta, ids) {
  const jornada = new Map(ids.map((id) => [id, []]));
  const acontecimentos = (dados.linha?.acontecimentos ?? []).filter((ev) => podeVer(conta, ev));
  acontecimentos.sort((a, b) => chaveDaData(a.data) - chaveDaData(b.data));
  for (const ev of acontecimentos) {
    const passo = {
      id: ev.id,
      titulo: ev.titulo,
      data: dataPublica(ev.data, true),
      ate: ev.ate ? dataPublica(ev.ate, false) : null,
    };
    for (const id of new Set(ev.personagens)) jornada.get(id)?.push(passo);
  }
  return Object.fromEntries(jornada);
}

function dadosDaGaleria(conta) {
  const conhecidas = idsDasMesas();
  const personagens = [
    ...dados.personagens.map((p) => personagemDoPortal(p, conta)),
    ...dados.outrosPersonagens.filter((p) => podeVerOutro(conta, p)).map((p) => outroPublico(p, conta, conhecidas)),
  ];
  return {
    conta: { usuario: conta.usuario, nome: conta.nome, cargo: cargoDe(conta) },
    mesas: dados.campanhas.map((c) => ({
      id: c.id,
      nome: c.nome,
      cor: c.cor || "#2e3756",
      naPaginaMesas: c.naPaginaMesas !== false,
    })),
    personagens,
    jornada: jornadaDe(conta, personagens.map((p) => p.id)),
  };
}

/* ---------- O que chega do formulário ---------- */

// Os dados vêm como JSON no campo "dados"; a imagem, se houver, no campo "retrato"
async function lerFormularioDaFicha(req) {
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
  validarImagens(form, CAMPOS_IMAGEM_GALERIA);
  return { corpo, form };
}

// O que o jogador escreve sobre o próprio personagem. O resumo é uma frase só, numa linha.
function textosDaFicha(corpo) {
  return {
    origem: textoOpcional(corpo.origem, "Ancestralidade e classe", 80),
    resumo: textoOpcional(corpo.resumo, "Resumo", 160).replace(/\s*\n\s*/g, " "),
    historia: textoOpcional(corpo.historia, "História", 6000),
  };
}

// A queda só vale para os caídos, e a data segue a regra da Linha do Tempo.
// Sem data e sem epitáfio, o caído fica sem queda.
function situacaoDaFicha(corpo) {
  const situacao = corpo.situacao ?? "vivo";
  if (!SITUACOES.has(situacao)) {
    throw new ErroHttp(400, "Escolha a situação: vivo, caído, desaparecido ou aposentado.");
  }
  const bruta = situacao === "caido" && corpo.queda && typeof corpo.queda === "object" ? corpo.queda : null;
  if (!bruta) return { situacao, queda: null };
  const data = bruta.data ? lerDataDaLinha(bruta.data, dados.linha.anoAtual, true) : null;
  const epitafio = textoOpcional(bruta.epitafio, "Epitáfio", 160);
  return { situacao, queda: data || epitafio ? { data, epitafio } : null };
}

// Confere e limpa o que veio do formulário de um outro personagem.
// Só o administrador escolhe quem vê; o que um editor cadastra é para todos, e ele não muda depois.
function valoresDoOutro(corpo, conta, atual) {
  const nome = texto(corpo.nome, "Nome", 60);
  const fonte = corpo.fonte ?? FONTE_PADRAO;
  if (!FONTES.has(fonte)) throw new ErroHttp(400, "Escolha uma das fontes da lista.");
  if (!PAPEIS.has(corpo.papel)) throw new ErroHttp(400, "Escolha o papel: personagem de jogador ou NPC.");
  const jogador = corpo.papel === "jogador" ? textoOpcional(corpo.jogador, "Jogador", 40) : "";
  let visibilidade = atual && VISIBILIDADES.has(atual.visibilidade) ? atual.visibilidade : "todos";
  if (conta.admin) visibilidade = VISIBILIDADES.has(corpo.visibilidade) ? corpo.visibilidade : "todos";
  return {
    nome,
    fonte,
    papel: corpo.papel,
    jogador,
    mesas: mesasConhecidas(corpo.mesas),
    ...situacaoDaFicha(corpo),
    ...textosDaFicha(corpo),
    visibilidade,
  };
}

// Apagar o personagem tira também as citações dele na Linha do Tempo
function tirarDasCitacoes(id) {
  const linha = dados.linha;
  if (!linha) return;
  for (const ev of linha.acontecimentos) ev.personagens = ev.personagens.filter((p) => p !== id);
  for (const p of linha.pendencias) {
    if (Array.isArray(p.dados?.personagens)) p.dados.personagens = p.dados.personagens.filter((x) => x !== id);
  }
}

/* ---------- Rotas ---------- */

async function tratarGaleria(req, res, rota, metodo, conta) {
  const mudouLinha = garantirLinha();
  if (garantirPersonagens() || mudouLinha) await salvarDados();
  let partes;
  try {
    partes = rota.split("/").filter(Boolean).slice(2).map(decodeURIComponent);
  } catch {
    throw new ErroHttp(404, "Endereço não encontrado.");
  }
  const [recurso, id, ...resto] = partes;

  if (!resto.length) {
    if (!recurso && metodo === "GET") return enviarJson(res, 200, dadosDaGaleria(conta));
    if (recurso === "ficha" && id && metodo === "PUT") return salvarFicha(req, res, conta, id);
    if (recurso === "outros") {
      if (!id && metodo === "POST") return cadastrarOutro(req, res, conta);
      if (id && metodo === "PUT") return alterarOutro(req, res, conta, id);
      if (id && metodo === "DELETE") return apagarOutro(res, conta, id);
    }
  }
  throw new ErroHttp(404, "Endereço não encontrado.");
}

// O dono escreve resumo, ancestralidade e história e troca o retrato; o administrador e os editores
// mudam isso em qualquer ficha e também a situação e a queda.
// Nome e fonte continuam no "Personalizar" das Mesas, e a capa e a arte do card também.
async function salvarFicha(req, res, conta, id) {
  fichaEditavel(conta, id); // antes de receber as imagens
  const { corpo, form } = await lerFormularioDaFicha(req);
  const valores = textosDaFicha(corpo);
  if (conta.admin || conta.editor) Object.assign(valores, situacaoDaFicha(corpo));
  const personagem = fichaEditavel(conta, id);
  Object.assign(personagem, valores);
  await aplicarImagens(personagem, form, CAMPOS_IMAGEM_GALERIA);
  await salvarDados();
  enviarJson(res, 200, { ok: true });
}

async function cadastrarOutro(req, res, conta) {
  exigirEditor(conta);
  const { corpo, form } = await lerFormularioDaFicha(req);
  const valores = valoresDoOutro(corpo, conta, null);
  if (dados.outrosPersonagens.length >= LIMITE_OUTROS) {
    throw new ErroHttp(400, `A galeria pode ter no máximo ${LIMITE_OUTROS} personagens cadastrados aqui.`);
  }
  const quando = carimbo();
  const personagem = {
    id: novoId("npc-", new Set([...dados.personagens, ...dados.outrosPersonagens].map((p) => p.id))),
    ...valores,
    retrato: null,
    registradoPor: conta.usuario,
    registradoNome: conta.nome,
    criadoEm: quando,
    alteradoEm: quando,
  };
  await aplicarImagens(personagem, form, CAMPOS_IMAGEM_GALERIA);
  dados.outrosPersonagens.push(personagem);
  await salvarDados();
  console.log(`${conta.usuario} cadastrou nos Personagens: ${personagem.nome}`);
  enviarJson(res, 201, { personagem: { id: personagem.id } });
}

async function alterarOutro(req, res, conta, id) {
  outroEditavel(conta, id); // antes de receber as imagens
  const { corpo, form } = await lerFormularioDaFicha(req);
  const personagem = outroEditavel(conta, id);
  Object.assign(personagem, valoresDoOutro(corpo, conta, personagem));
  await aplicarImagens(personagem, form, CAMPOS_IMAGEM_GALERIA);
  personagem.alteradoEm = carimbo();
  await salvarDados();
  enviarJson(res, 200, { ok: true });
}

async function apagarOutro(res, conta, id) {
  exigirAdmin(conta);
  const personagem = outroVisivel(conta, id);
  dados.outrosPersonagens = dados.outrosPersonagens.filter((p) => p !== personagem);
  tirarDasCitacoes(id);
  await salvarDados();
  await apagarImagens(CAMPOS_IMAGEM_GALERIA.map((campo) => personagem[campo]));
  console.log(`${conta.usuario} apagou dos Personagens: ${personagem.nome}`);
  enviarJson(res, 200, { ok: true });
}

// Quando alguém troca o próprio usuário, os cadastros dele acompanham
function renomearNosPersonagens(antigo, novo) {
  for (const p of dados.outrosPersonagens ?? []) if (p.registradoPor === antigo) p.registradoPor = novo;
}

// Conta excluída: os cadastros dela guardam só o nome, e ninguém herda o que era dela
function desligarContaDosPersonagens(conta) {
  for (const p of dados.outrosPersonagens ?? []) {
    if (p.registradoPor === conta.usuario) Object.assign(p, { registradoPor: null, registradoNome: conta.nome });
  }
}

// Mesa apagada: sai dos outros personagens que a citam
function tirarMesaDosPersonagens(id) {
  for (const p of dados.outrosPersonagens ?? []) {
    if (Array.isArray(p.mesas)) p.mesas = p.mesas.filter((m) => m !== id);
  }
}

ganchos.renomearConta.push(renomearNosPersonagens);
ganchos.excluirConta.push(desligarContaDosPersonagens);
ganchos.excluirMesa.push(tirarMesaDosPersonagens);

// Os endereços /api/galeria/... são desta página (/api/personagens/:id já é o "Personalizar" das Mesas).
// "iniciar" confere os dados ao ligar o portal e devolve true quando precisou mudar alguma coisa.
module.exports = { prefixo: "/api/galeria", tratar: tratarGaleria, iniciar: garantirPersonagens };
