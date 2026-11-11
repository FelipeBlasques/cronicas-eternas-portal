"use strict";
/* =================================================================
   Crônicas Eternas: Mural
   -----------------------------------------------------------------
   As notas que o grupo prega para todos lerem. Cada conta com
   caderno prega notas do próprio Caderno, até 5; toda conta lê. A
   marca fica na própria nota (nota.mural, no caderno.json): pregar
   e tirar passam pelas rotas do caderno. Aqui só se lê o mural e
   as notas que a conta pode pregar.
   ================================================================= */

const { ErroHttp, enviarJson } = require("./base");
const { notasDoMural, notasParaPregar, LIMITE_NO_MURAL } = require("./caderno");
const { perfilPublico } = require("./chat");

function cargoDe(conta) {
  if (conta.admin) return "admin";
  if (conta.editor) return "editor";
  return "jogador";
}

// O mural como a conta o lê, com a cor e a foto do perfil do chat de quem pregou
function dadosDoMural(conta) {
  const notas = notasDoMural(conta);
  const perfis = {};
  for (const nota of notas) {
    const usuario = nota.dono.usuario;
    if (Object.hasOwn(perfis, usuario)) continue;
    const { cor, foto } = perfilPublico(usuario);
    perfis[usuario] = { cor, foto };
  }
  return {
    conta: { usuario: conta.usuario, nome: conta.nome, cargo: cargoDe(conta), temCaderno: !conta.admin },
    limite: LIMITE_NO_MURAL,
    notas,
    perfis,
  };
}

function tratarMural(req, res, rota, metodo, conta) {
  if (rota === "/api/mural" && metodo === "GET") return enviarJson(res, 200, dadosDoMural(conta));
  if (rota === "/api/mural/minhas" && metodo === "GET") {
    if (conta.admin) throw new ErroHttp(403, "O administrador não tem caderno.", "proibido");
    return enviarJson(res, 200, notasParaPregar(conta));
  }
  throw new ErroHttp(404, "Endereço não encontrado.");
}

// Os endereços /api/mural/... são desta página. Não tem dados próprios no dados.json.
module.exports = {
  prefixo: "/api/mural",
  tratar: tratarMural,
  iniciar: () => false,
};
