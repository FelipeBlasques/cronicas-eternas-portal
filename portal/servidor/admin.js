"use strict";
/* =================================================================
   Crônicas Eternas: administração
   -----------------------------------------------------------------
   Contas, mesas e personagens, só para o administrador. Todas as
   mesas ficam em dados.campanhas; naPaginaMesas diz se a mesa
   aparece na página Mesas.
   ================================================================= */

const crypto = require("node:crypto");
const {
  dados,
  salvarDados,
  ganchos,
  gerarHash,
  cookieDaConta,
  cifrar,
  ErroHttp,
  enviarJson,
  lerJson,
  lerFormulario,
  texto,
  validarSenhaNova,
  FONTES,
  FONTE_PADRAO,
  REGEX_USUARIO,
  REGEX_COR,
  criarId,
  CAMPOS_IMAGEM,
  CAMPOS_IMAGEM_PERSONAGEM,
  CAMPOS_IMAGEM_GALERIA,
  validarImagens,
  apagarImagem,
  aplicarImagens,
  aposentarTitulo,
  contaPublica,
  campanhaPublica,
  personagemPublico,
} = require("./base");
const { listarMundos, mundoExiste, ligarMundosPeloNome } = require("./foundry");

const LIMITE_MESAS = 300;

async function dadosDoAdmin() {
  return {
    contas: dados.contas.map((c) => ({ ...contaPublica(c), temSenha: Boolean(c.senha) })),
    campanhas: dados.campanhas.map((c) => campanhaPublica(c, true)),
    personagens: dados.personagens.map(personagemPublico),
    mundos: await listarMundos(),
  };
}

async function tratarAdmin(req, res, rota, metodo, contaAtual) {
  const [, , recurso, idBruto, acao] = rota.split("/").filter(Boolean);
  const id = idBruto ? decodeURIComponent(idBruto) : "";

  if (!recurso && metodo === "GET") {
    await ligarMundosPeloNome();
    return enviarJson(res, 200, await dadosDoAdmin());
  }
  if (recurso === "contas") return adminContas(req, res, metodo, id, acao, contaAtual);
  if (recurso === "campanhas" && !acao) return adminCampanhas(req, res, metodo, id);
  if (recurso === "mesas" && !acao) return adminMesas(req, res, metodo, id);
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
    for (const gancho of ganchos.excluirConta) gancho(conta);
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
  return { nome, mundo, cor, naPaginaMesas: form.get("na_pagina") === "1", mestreUsuario };
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
  if (!campanha) throw new ErroHttp(404, "Mesa não encontrada.");

  if (metodo === "PUT") {
    const form = await lerFormulario(req);
    Object.assign(campanha, valoresDaCampanha(form));
    aplicarLoginDoMestre(campanha, form);
    await aplicarImagens(campanha, form);
    await salvarDados();
    return enviarJson(res, 200, { ok: true });
  }

  if (metodo === "DELETE") return apagarMesa(res, campanha);

  throw new ErroHttp(405, "Operação não permitida.");
}

// Apagar uma mesa, pela Administração ou pelos painéis de mesas: as imagens vão junto,
// e cada página tira o id dela de onde a cita
async function apagarMesa(res, mesa) {
  if (dados.personagens.some((p) => p.campanha === mesa.id)) {
    throw new ErroHttp(409, "Essa mesa ainda tem personagens. Exclua os personagens ou mova para outra mesa antes.");
  }
  for (const campo of CAMPOS_IMAGEM) await apagarImagem(mesa[campo]);
  for (const gancho of ganchos.excluirMesa) gancho(mesa.id);
  dados.campanhas = dados.campanhas.filter((c) => c !== mesa);
  await salvarDados();
  return enviarJson(res, 200, { ok: true });
}

function nomeDaMesa(valor) {
  return texto(valor, "Nome da mesa", 80);
}

function corDaMesa(valor) {
  if (typeof valor !== "string" || !REGEX_COR.test(valor)) throw new ErroHttp(400, "Escolha uma cor válida.");
  return valor.toLowerCase();
}

// Os painéis de mesas da Linha do Tempo e dos Personagens mudam só o nome e a cor.
// O "Tirar da página" da página Mesas muda só o naPaginaMesas.
async function adminMesas(req, res, metodo, id) {
  if (!id && metodo === "POST") {
    const corpo = await lerJson(req);
    const nome = nomeDaMesa(corpo.nome);
    const cor = corDaMesa(corpo.cor);
    if (dados.campanhas.length >= LIMITE_MESAS) throw new ErroHttp(400, `O portal pode ter no máximo ${LIMITE_MESAS} mesas.`);
    const mesa = {
      id: criarId(nome, new Set(dados.campanhas.map((c) => c.id))),
      nome,
      mundo: "",
      cor,
      naPaginaMesas: false,
      mestreUsuario: "",
      mestreSenha: null,
      capa: null,
      titulo: null,
      arte: null,
    };
    dados.campanhas.push(mesa);
    await salvarDados();
    // Devolve o id, para a página Personagens marcar a mesa nova no formulário
    return enviarJson(res, 201, { mesa: { id: mesa.id } });
  }

  const mesa = dados.campanhas.find((c) => c.id === id);
  if (!mesa) throw new ErroHttp(404, "Essa mesa não existe mais.", "nao-encontrado");

  if (metodo === "PUT") {
    const corpo = await lerJson(req);
    const valores = {};
    if (corpo.nome !== undefined) valores.nome = nomeDaMesa(corpo.nome);
    if (corpo.cor !== undefined) valores.cor = corDaMesa(corpo.cor);
    if (corpo.naPaginaMesas !== undefined) {
      if (typeof corpo.naPaginaMesas !== "boolean") throw new ErroHttp(400, "Diga se a mesa aparece na página Mesas.");
      valores.naPaginaMesas = corpo.naPaginaMesas;
    }
    Object.assign(mesa, valores);
    await salvarDados();
    return enviarJson(res, 200, { ok: true });
  }

  if (metodo === "DELETE") return apagarMesa(res, mesa);

  throw new ErroHttp(405, "Operação não permitida.");
}

function valoresDoPersonagem(form) {
  const nome = texto(form.get("nome"), "Nome", 60);
  const dono = String(form.get("dono") || "");
  if (!dados.contas.some((c) => c.usuario === dono)) throw new ErroHttp(400, "Escolha o jogador do personagem.");
  const campanha = String(form.get("campanha") || "");
  if (!dados.campanhas.some((c) => c.id === campanha)) throw new ErroHttp(400, "Escolha a mesa do personagem.");
  const foundryUsuario = String(form.get("foundry_usuario") || "").trim();
  if (foundryUsuario.length > 60) throw new ErroHttp(400, "O usuário do Foundry pode ter no máximo 60 caracteres.");
  const foundrySenha = String(form.get("foundry_senha") || "");
  if (foundrySenha.length > 200) throw new ErroHttp(400, "A senha do Foundry pode ter no máximo 200 caracteres.");
  const fonte = String(form.get("fonte") || FONTE_PADRAO);
  if (!FONTES.has(fonte)) throw new ErroHttp(400, "Escolha uma das fontes da lista.");
  validarImagens(form, CAMPOS_IMAGEM_PERSONAGEM);
  return { nome, dono, campanha, foundryUsuario, fonte };
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
      retrato: null, // a arte da galeria começa vazia; a cópia da capa foi só na migração
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
    // Inclui o título antigo, se houver, e o retrato da galeria
    for (const campo of [...CAMPOS_IMAGEM, ...CAMPOS_IMAGEM_GALERIA]) await apagarImagem(personagem[campo]);
    dados.personagens = dados.personagens.filter((p) => p !== personagem);
    await salvarDados();
    return enviarJson(res, 200, { ok: true });
  }

  throw new ErroHttp(405, "Operação não permitida.");
}

module.exports = { tratarAdmin };
