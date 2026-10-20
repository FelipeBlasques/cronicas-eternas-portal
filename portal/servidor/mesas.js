"use strict";
/* =================================================================
   Crônicas Eternas: página Mesas e a conta de cada pessoa
   -----------------------------------------------------------------
   Entrar, os dados da página Mesas, os números da barra lateral,
   abrir um mundo, o login do Foundry guardado com cada personagem
   e as mudanças na própria conta (usuário, senha, nome e fonte do
   personagem).
   ================================================================= */

const {
  CONFIG,
  dados,
  salvarDados,
  ganchos,
  senhaFalsa,
  conferirSenha,
  gerarHash,
  cookieDaConta,
  decifrar,
  tentativas,
  bloqueado,
  registrarFalha,
  ipDe,
  ErroHttp,
  enviarJson,
  lerJson,
  texto,
  validarSenhaNova,
  FONTES,
  REGEX_USUARIO,
  aposentarTitulo,
  contaPublica,
  campanhaPublica,
  personagemPublico,
} = require("./base");
const { estadoAtual, mundoExiste, pedirTroca } = require("./foundry");
const { contarNovidades } = require("./regras");

// Todo mundo vê todas as campanhas que têm personagens, e todos os personagens delas.
// Entrar no mundo continua só com o próprio personagem (o /api/abrir confere isso),
// e o login do Foundry de cada personagem só vai para o dono dele.
function dadosDoPortal(conta) {
  const comPersonagens = new Set(dados.personagens.map((p) => p.campanha));
  const campanhas = dados.campanhas.filter((c) => conta.admin || comPersonagens.has(c.id));
  const visiveis = new Set(campanhas.map((c) => c.id));
  const personagens = dados.personagens
    .filter((p) => visiveis.has(p.campanha))
    .map((p) => {
      const publico = personagemPublico(p);
      if (p.dono !== conta.usuario) {
        publico.temLoginFoundry = false;
        if (!conta.admin) publico.foundryUsuario = "";
      }
      return publico;
    });
  const portal = {
    conta: contaPublica(conta),
    enderecoFoundry: CONFIG.enderecoFoundry,
    campanhas: campanhas.map((c) => campanhaPublica(c, conta.admin)),
    personagens,
  };
  // O administrador vê na barra lateral quantos pedidos dos editores esperam por ele
  if (conta.admin) portal.pendenciasLinha = dados.linha?.pendencias?.length ?? 0;
  return portal;
}

// Os números da barra lateral, que todas as páginas pedem ao carregar: as regras da casa
// novas ou alteradas desde a última visita e, só para o administrador, os pedidos dos
// editores esperando por ele na Linha do Tempo
function dadosDaBarra(conta) {
  const barra = { novidadesRegras: contarNovidades(conta) };
  if (conta.admin) barra.pendenciasLinha = dados.linha?.pendencias?.length ?? 0;
  return barra;
}

async function entrar(req, res) {
  const ip = ipDe(req);
  if (bloqueado(ip)) {
    throw new ErroHttp(429, "Muitas tentativas erradas. Espere 15 minutos e tente de novo.");
  }
  const { usuario, senha, lembrar } = await lerJson(req);
  const nome = typeof usuario === "string" ? usuario.trim().toLowerCase() : "";
  const conta = dados.contas.find((c) => c.usuario === nome);
  const confere = await conferirSenha(typeof senha === "string" ? senha : "", conta?.senha || senhaFalsa());
  if (!conta || !conta.senha || !confere) {
    registrarFalha(ip);
    throw new ErroHttp(401, "Usuário ou senha incorretos.", "login");
  }
  tentativas.delete(ip);
  enviarJson(res, 200, { conta: contaPublica(conta) }, cookieDaConta(conta, lembrar === true));
}

async function abrir(req, res, conta) {
  const { campanha: idCampanha, forcar } = await lerJson(req);
  const campanha = dados.campanhas.find((c) => c.id === idCampanha);
  if (!campanha) throw new ErroHttp(404, "Campanha não encontrada.");

  const temPersonagem = dados.personagens.some((p) => p.dono === conta.usuario && p.campanha === campanha.id);
  if (!conta.admin && !temPersonagem) throw new ErroHttp(403, "Você não tem personagem nessa campanha.");
  if (!mundoExiste(campanha.mundo)) {
    throw new ErroHttp(409, "Essa campanha ainda não está ligada a um mundo do Foundry.", "sem-mundo");
  }

  const estado = await estadoAtual();
  if (estado.trocandoPara) {
    if (estado.trocandoPara === campanha.mundo) return enviarJson(res, 202, { aguardando: true });
    throw new ErroHttp(409, "O servidor já está trocando de mundo. Espere um pouco e tente de novo.", "trocando");
  }
  if (estado.online && estado.mundoAtivo === campanha.mundo) return enviarJson(res, 200, { jaAberto: true });

  const emUso = estado.online && estado.mundoAtivo && estado.conectados > 0;
  if (emUso && !(forcar === true && conta.admin)) {
    throw new ErroHttp(409, "O servidor está em uso.", "ocupado", { estado });
  }

  await pedirTroca(campanha.mundo);
  console.log(`${conta.usuario} pediu para abrir o mundo ${campanha.mundo}${emUso ? " (troca forçada)" : ""}`);
  enviarJson(res, 202, { aguardando: true });
}

async function trocarSenha(req, res, conta) {
  const { atual, nova } = await lerJson(req);
  const confere = await conferirSenha(typeof atual === "string" ? atual : "", conta.senha);
  if (!confere) throw new ErroHttp(400, "A senha atual está incorreta.");
  validarSenhaNova(nova);
  conta.senha = await gerarHash(nova);
  conta.versao = (conta.versao || 0) + 1;
  await salvarDados();
  enviarJson(res, 200, { ok: true }, cookieDaConta(conta, req.lembrar));
}

// Entrega o login do Foundry na hora de entrar no mundo: o de um personagem só para o
// dono dele, e o do mestre de uma campanha só para o administrador
async function acessoFoundry(req, res, conta) {
  const { personagem: idPersonagem, campanha: idCampanha } = await lerJson(req);
  let usuario;
  let senhaCifrada;
  if (idCampanha) {
    if (!conta.admin) throw new ErroHttp(403, "Só o administrador pode entrar como mestre.");
    const campanha = dados.campanhas.find((c) => c.id === idCampanha);
    if (!campanha) throw new ErroHttp(404, "Campanha não encontrada.");
    usuario = campanha.mestreUsuario;
    senhaCifrada = campanha.mestreSenha;
  } else {
    const personagem = dados.personagens.find((p) => p.id === idPersonagem && p.dono === conta.usuario);
    if (!personagem) throw new ErroHttp(404, "Personagem não encontrado.");
    usuario = personagem.foundryUsuario;
    senhaCifrada = personagem.foundrySenha;
  }
  if (!usuario || !senhaCifrada) throw new ErroHttp(404, "Não há login do Foundry salvo para isso.", "sem-login");
  let senha;
  try {
    senha = decifrar(senhaCifrada);
  } catch {
    throw new ErroHttp(409, "O login salvo não pôde ser lido. Salve de novo na administração.");
  }
  enviarJson(res, 200, { usuario, senha });
}

// O dono do personagem escolhe o nome que aparece no card e a fonte dele
async function personalizarPersonagem(req, res, conta, id) {
  const personagem = dados.personagens.find((p) => p.id === id && p.dono === conta.usuario);
  if (!personagem) throw new ErroHttp(404, "Personagem não encontrado.");
  const { nome, fonte } = await lerJson(req);
  const novoNome = texto(nome, "Nome", 60);
  if (!FONTES.has(fonte)) throw new ErroHttp(400, "Escolha uma das fontes da lista.");
  personagem.nome = novoNome;
  personagem.fonte = fonte;
  await aposentarTitulo(personagem);
  await salvarDados();
  enviarJson(res, 200, { personagem: personagemPublico(personagem) });
}

// Cada pessoa pode trocar o próprio usuário e a própria senha. O nome, só o administrador.
async function atualizarConta(req, res, conta) {
  const { usuario, atual, nova } = await lerJson(req);
  const confere = await conferirSenha(typeof atual === "string" ? atual : "", conta.senha);
  if (!confere) throw new ErroHttp(400, "A senha atual está incorreta.");

  const novoUsuario = String(usuario ?? conta.usuario).trim().toLowerCase();
  if (!REGEX_USUARIO.test(novoUsuario)) {
    throw new ErroHttp(400, "O usuário precisa ter de 2 a 30 caracteres: letras minúsculas, números, hífen ou sublinhado.");
  }
  const mudaUsuario = novoUsuario !== conta.usuario;
  if (mudaUsuario && dados.contas.some((c) => c.usuario === novoUsuario)) {
    throw new ErroHttp(409, "Já existe uma conta com esse usuário.");
  }
  const mudaSenha = typeof nova === "string" && nova.length > 0;
  if (mudaSenha) validarSenhaNova(nova);
  if (!mudaUsuario && !mudaSenha) throw new ErroHttp(400, "Nada mudou. Altere o usuário ou preencha uma nova senha.");

  if (mudaUsuario) {
    for (const personagem of dados.personagens) {
      if (personagem.dono === conta.usuario) personagem.dono = novoUsuario;
    }
    for (const gancho of ganchos.renomearConta) gancho(conta.usuario, novoUsuario);
    console.log(`A conta ${conta.usuario} passou a se chamar ${novoUsuario}`);
    conta.usuario = novoUsuario;
  }
  if (mudaSenha) conta.senha = await gerarHash(nova);
  conta.versao = (conta.versao || 0) + 1;
  await salvarDados();
  enviarJson(res, 200, { conta: contaPublica(conta) }, cookieDaConta(conta, req.lembrar));
}

module.exports = {
  dadosDoPortal,
  dadosDaBarra,
  entrar,
  abrir,
  trocarSenha,
  acessoFoundry,
  personalizarPersonagem,
  atualizarConta,
};
