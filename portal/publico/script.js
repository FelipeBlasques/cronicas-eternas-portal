/* =================================================================
   Crônicas Eternas: portal dos jogadores
   -----------------------------------------------------------------
   No servidor, conversa com o servidor.js, que guarda as contas e os
   personagens e pede ao sistema a troca de mundo.
   Aberto fora do servidor (arquivo no PC), roda em pré-visualização,
   com dados de exemplo e um painel para simular o estado do Foundry.
   Usa o comum.js, carregado antes: pedir(), criar(), avisos, barra
   lateral, status do Foundry, fontes, card com moldura e cinzas.
   ================================================================= */

const CONFIG = {
  intervaloStatus: 15000, // tempo entre consultas ao servidor, em ms
  limiteAbertura: 150000, // tempo máximo esperando um mundo abrir, em ms
};

/* =================================================================
   Conversa com o servidor
   ================================================================= */

const apiDoServidor = {
  sessao: () => pedir("GET", "/api/sessao", undefined, { silencioso: true }),
  entrar: (usuario, senha, lembrar) => pedir("POST", "/api/entrar", { usuario, senha, lembrar }),
  sair: () => pedir("POST", "/api/sair"),
  portal: () => pedir("GET", "/api/portal"),
  estado: () => pedir("GET", "/api/estado"),
  abrirMundo: (campanha, forcar) => pedir("POST", "/api/abrir", { campanha, forcar }),
  trocarSenha: (atual, nova) => pedir("POST", "/api/senha", { atual, nova }),
  acessoFoundry: (alvo) => pedir("POST", "/api/acesso-foundry", alvo),
  conta: (usuario, atual, nova) => pedir("POST", "/api/conta", { usuario, atual, nova }),
  personagem: (id, dados) => pedir("PUT", caminhoDe("/api/personagens", id), dados),
  admin: {
    dados: () => pedir("GET", "/api/admin"),
    criarConta: (corpo) => pedir("POST", "/api/admin/contas", corpo),
    editarConta: (usuario, corpo) => pedir("PUT", caminhoDe("/api/admin/contas", usuario), corpo),
    senhaDaConta: (usuario, senha) =>
      pedir("POST", `${caminhoDe("/api/admin/contas", usuario)}/senha`, { senha }),
    excluirConta: (usuario) => pedir("DELETE", caminhoDe("/api/admin/contas", usuario)),
    salvarCampanha: (id, form) => pedir(id ? "PUT" : "POST", caminhoDe("/api/admin/campanhas", id), form),
    excluirCampanha: (id) => pedir("DELETE", caminhoDe("/api/admin/campanhas", id)),
    alterarMesa: (id, mudancas) => pedir("PUT", caminhoDe("/api/admin/mesas", id), mudancas),
    salvarPersonagem: (id, form) =>
      pedir(id ? "PUT" : "POST", caminhoDe("/api/admin/personagens", id), form),
    excluirPersonagem: (id) => pedir("DELETE", caminhoDe("/api/admin/personagens", id)),
  },
};

/* =================================================================
   Pré-visualização: dados de exemplo e um Foundry de mentira
   ================================================================= */

const simulacao = { online: true, mundoAtivo: "ode-to-sleep", conectados: 0, trocandoPara: null };

function mudarSimulacao(mudancas) {
  Object.assign(simulacao, mudancas);
  sincronizarPainelSimulacao();
}

function criarApiDePrevia() {
  const banco = {
    campanhas: [
      {
        id: "ode-to-sleep",
        nome: "Ode to Sleep",
        mundo: "ode-to-sleep",
        cor: "#2b3466",
        naPaginaMesas: true,
        mestreUsuario: "Gamemaster",
        temSenhaMestre: true,
        capa: "imagens/ots-cover.jpg",
        titulo: "imagens/ots-text.png",
        arte: "imagens/ots-hover.png",
      },
      {
        id: "remissao",
        nome: "Remissão do Flagelo Esvanescente",
        mundo: "remissao-do-flagelo-esvanescente",
        cor: "#5a1f22",
        naPaginaMesas: true,
        capa: null,
        titulo: null,
        arte: null,
      },
      {
        id: "primeira-mesa",
        nome: "Primeira mesa (exemplo)",
        mundo: "",
        cor: "#6b6b45",
        naPaginaMesas: false,
        capa: null,
        titulo: null,
        arte: null,
      },
    ],
    contas: [
      { usuario: "mestre", nome: "Mestre", admin: true, editor: false, temSenha: true },
      { usuario: "comuna", nome: "Comuna", admin: false, editor: false, temSenha: true },
      { usuario: "takezo", nome: "Takezo", admin: false, editor: true, temSenha: true },
      { usuario: "frati", nome: "Frati", admin: false, editor: false, temSenha: true },
      { usuario: "neia", nome: "Neia", admin: false, editor: false, temSenha: false },
    ],
    personagens: [
      { id: "p1", nome: "Venti", dono: "comuna", campanha: "ode-to-sleep", fonte: "elfica", foundryUsuario: "Comuna", temSenhaFoundry: true },
      { id: "p2", nome: "Alisaie", dono: "takezo", campanha: "ode-to-sleep", fonte: "romana" },
      { id: "p3", nome: "Personagem de Frati", dono: "frati", campanha: "ode-to-sleep" },
      { id: "p4", nome: "Personagem de Neia", dono: "neia", campanha: "ode-to-sleep" },
      { id: "p5", nome: "Personagem de Comuna", dono: "comuna", campanha: "remissao" },
      { id: "p6", nome: "Personagem de Neia", dono: "neia", campanha: "remissao" },
    ],
    mundos: [
      { id: "ode-to-sleep", titulo: "Ode to Sleep", sistema: "pf2e" },
      { id: "remissao-do-flagelo-esvanescente", titulo: "Remissão do Flagelo Esvanescente", sistema: "pf2e" },
    ],
  };
  let atual = null;

  const publico = (p) => ({
    capa: null,
    arte: null,
    fonte: "gotica",
    foundryUsuario: "",
    ...p,
    nomeDono: banco.contas.find((c) => c.usuario === p.dono)?.nome ?? p.dono,
    temLoginFoundry: Boolean(p.foundryUsuario && p.temSenhaFoundry),
  });
  const campanhaPublica = (c) => ({
    ...c,
    temLoginMestre: Boolean(c.mestreUsuario && c.temSenhaMestre),
  });
  const exigirConta = () => {
    if (!atual) throw erroComCodigo("Entre na sua conta para continuar.", "sem-sessao");
  };
  const imagensDoFormulario = (item, form) => {
    for (const campo of ["capa", "titulo", "arte"]) {
      const arquivo = form.get(campo);
      if (arquivo && arquivo.size) item[campo] = URL.createObjectURL(arquivo);
      else if (form.get(`remover_${campo}`) === "1") item[campo] = null;
    }
  };

  return {
    async sessao() {
      await esperar(60);
      exigirConta();
      return { conta: atual };
    },
    async entrar(usuario, senha) {
      await esperar(350);
      const conta = banco.contas.find((c) => c.usuario === usuario.toLowerCase());
      if (!conta || senha !== "teste") throw erroComCodigo("Usuário ou senha incorretos.", "login");
      atual = { usuario: conta.usuario, nome: conta.nome, admin: conta.admin, editor: conta.editor };
      return { conta: atual };
    },
    async sair() {
      atual = null;
    },
    async portal() {
      exigirConta();
      const comPersonagens = new Set(banco.personagens.map((p) => p.campanha));
      const campanhas = banco.campanhas.filter(
        (c) => c.naPaginaMesas !== false && (atual.admin || comPersonagens.has(c.id)),
      );
      const visiveis = new Set(campanhas.map((c) => c.id));
      return {
        conta: atual,
        enderecoFoundry: "https://vtt.cronicaseternas.com/join",
        campanhas: campanhas.map(campanhaPublica),
        personagens: banco.personagens
          .filter((p) => visiveis.has(p.campanha))
          .map((p) => ({ ...publico(p), temLoginFoundry: p.dono === atual.usuario && publico(p).temLoginFoundry })),
        // Na prévia, o administrador tem um pedido de editor esperando na Linha do Tempo
        ...(atual.admin ? { pendenciasLinha: 1 } : {}),
      };
    },
    async personagem(id, { nome, fonte }) {
      await esperar(250);
      const personagem = banco.personagens.find((p) => p.id === id && p.dono === atual.usuario);
      if (!personagem) throw erroComCodigo("Personagem não encontrado.");
      if (!String(nome || "").trim()) throw erroComCodigo("Preencha o campo Nome.");
      Object.assign(personagem, { nome: nome.trim(), fonte });
      return { personagem: publico(personagem) };
    },
    async conta(usuario, senhaAtual, nova) {
      await esperar(300);
      if (senhaAtual !== "teste") throw erroComCodigo("A senha atual está incorreta.");
      const novo = String(usuario || "").trim().toLowerCase();
      if (!/^[a-z0-9_-]{2,30}$/.test(novo)) {
        throw erroComCodigo("O usuário precisa ter de 2 a 30 caracteres: letras minúsculas, números, hífen ou sublinhado.");
      }
      if (novo !== atual.usuario && banco.contas.some((c) => c.usuario === novo)) {
        throw erroComCodigo("Já existe uma conta com esse usuário.");
      }
      if (nova && nova.length < 8) throw erroComCodigo("A senha precisa ter pelo menos 8 caracteres.");
      const conta = banco.contas.find((c) => c.usuario === atual.usuario);
      for (const p of banco.personagens) if (p.dono === conta.usuario) p.dono = novo;
      conta.usuario = novo;
      atual = { ...atual, usuario: novo };
      return { conta: atual };
    },
    async estado() {
      await esperar(90);
      return { ...simulacao };
    },
    async abrirMundo(idCampanha, forcar) {
      await esperar(350);
      const campanha = banco.campanhas.find((c) => c.id === idCampanha);
      if (!campanha?.mundo) throw erroComCodigo("Essa campanha ainda não está ligada a um mundo do Foundry.", "sem-mundo");
      if (simulacao.trocandoPara) {
        if (simulacao.trocandoPara === campanha.mundo) return { aguardando: true };
        throw erroComCodigo("O servidor já está trocando de mundo.", "trocando");
      }
      if (simulacao.online && simulacao.mundoAtivo === campanha.mundo) return { jaAberto: true };
      const emUso = simulacao.online && simulacao.mundoAtivo && simulacao.conectados > 0;
      if (emUso && !(forcar && atual?.admin)) throw erroComCodigo("O servidor está em uso.", "ocupado");
      mudarSimulacao({ trocandoPara: campanha.mundo });
      setTimeout(() => mudarSimulacao({ online: false, mundoAtivo: null, conectados: 0 }), 1600);
      setTimeout(() => mudarSimulacao({ online: true }), 3600);
      setTimeout(() => mudarSimulacao({ mundoAtivo: campanha.mundo, trocandoPara: null }), 5800);
      return { aguardando: true };
    },
    async trocarSenha(senhaAtual) {
      await esperar(300);
      if (senhaAtual !== "teste") throw erroComCodigo("A senha atual está incorreta.");
    },
    async acessoFoundry() {
      throw erroComCodigo("Na pré-visualização não há login do Foundry.", "sem-login");
    },
    admin: {
      async dados() {
        await esperar(150);
        return {
          contas: banco.contas.map((c) => ({ ...c })),
          campanhas: banco.campanhas.map(campanhaPublica),
          personagens: banco.personagens.map(publico),
          mundos: banco.mundos,
        };
      },
      async criarConta({ usuario, nome, senha, admin, editor }) {
        const novo = String(usuario || "").trim().toLowerCase();
        if (!/^[a-z0-9_-]{2,30}$/.test(novo)) {
          throw erroComCodigo("O usuário precisa ter de 2 a 30 caracteres: letras minúsculas, números, hífen ou sublinhado.");
        }
        if (banco.contas.some((c) => c.usuario === novo)) throw erroComCodigo("Já existe uma conta com esse usuário.");
        if (!String(nome || "").trim()) throw erroComCodigo("Preencha o campo Nome.");
        if (String(senha || "").length < 8) throw erroComCodigo("A senha precisa ter pelo menos 8 caracteres.");
        banco.contas.push({ usuario: novo, nome: nome.trim(), admin: Boolean(admin), editor: Boolean(editor), temSenha: true });
      },
      async editarConta(usuario, { nome, admin, editor }) {
        const conta = banco.contas.find((c) => c.usuario === usuario);
        if (!String(nome || "").trim()) throw erroComCodigo("Preencha o campo Nome.");
        Object.assign(conta, { nome: nome.trim(), admin: Boolean(admin), editor: Boolean(editor) });
      },
      async senhaDaConta(usuario, senha) {
        if (String(senha || "").length < 8) throw erroComCodigo("A senha precisa ter pelo menos 8 caracteres.");
        banco.contas.find((c) => c.usuario === usuario).temSenha = true;
      },
      async excluirConta(usuario) {
        if (usuario === atual.usuario) throw erroComCodigo("Você não pode excluir a sua própria conta.");
        if (banco.personagens.some((p) => p.dono === usuario)) {
          throw erroComCodigo("Essa conta ainda tem personagens. Exclua os personagens ou passe para outra conta antes.");
        }
        banco.contas = banco.contas.filter((c) => c.usuario !== usuario);
      },
      async salvarCampanha(id, form) {
        const nome = String(form.get("nome") || "").trim();
        if (!nome) throw erroComCodigo("Preencha o campo Nome.");
        let campanha = banco.campanhas.find((c) => c.id === id);
        if (!campanha) {
          campanha = { id: `c${Date.now()}`, capa: null, titulo: null, arte: null };
          banco.campanhas.push(campanha);
        }
        Object.assign(campanha, {
          nome,
          mundo: String(form.get("mundo") || ""),
          cor: String(form.get("cor") || "#2b2520"),
          naPaginaMesas: form.get("na_pagina") === "1",
          mestreUsuario: String(form.get("mestre_usuario") || "").trim(),
        });
        if (form.get("remover_mestre") === "1") Object.assign(campanha, { mestreUsuario: "", temSenhaMestre: false });
        else if (form.get("mestre_senha")) campanha.temSenhaMestre = true;
        imagensDoFormulario(campanha, form);
      },
      async excluirCampanha(id) {
        if (banco.personagens.some((p) => p.campanha === id)) {
          throw erroComCodigo("Essa mesa ainda tem personagens. Exclua os personagens ou mova para outra mesa antes.");
        }
        banco.campanhas = banco.campanhas.filter((c) => c.id !== id);
      },
      async alterarMesa(id, { naPaginaMesas }) {
        await esperar(200);
        const mesa = banco.campanhas.find((c) => c.id === id);
        if (!mesa) throw erroComCodigo("Essa mesa não existe mais.", "nao-encontrado");
        if (naPaginaMesas !== undefined) mesa.naPaginaMesas = naPaginaMesas;
      },
      async salvarPersonagem(id, form) {
        const nome = String(form.get("nome") || "").trim();
        if (!nome) throw erroComCodigo("Preencha o campo Nome.");
        let personagem = banco.personagens.find((p) => p.id === id);
        if (!personagem) {
          personagem = { id: `p${Date.now()}`, capa: null, titulo: null, arte: null };
          banco.personagens.push(personagem);
        }
        Object.assign(personagem, {
          nome,
          dono: String(form.get("dono")),
          campanha: String(form.get("campanha")),
          fonte: String(form.get("fonte") || "gotica"),
          foundryUsuario: String(form.get("foundry_usuario") || "").trim(),
        });
        if (form.get("remover_foundry") === "1") Object.assign(personagem, { foundryUsuario: "", temSenhaFoundry: false });
        else if (form.get("foundry_senha")) personagem.temSenhaFoundry = true;
        imagensDoFormulario(personagem, form);
      },
      async excluirPersonagem(id) {
        banco.personagens = banco.personagens.filter((p) => p.id !== id);
      },
    },
  };
}

const api = MODO_PREVIA ? criarApiDePrevia() : apiDoServidor;

/* =================================================================
   Estado e utilidades
   ================================================================= */

const estado = {
  conta: null,
  campanhas: [],
  personagens: [],
  enderecoFoundry: "",
  status: { online: true, mundoAtivo: null, conectados: 0, trocandoPara: null },
  abrindo: false,
  timerStatus: null,
  admin: null,
  abaAdmin: "personagens",
};

const ROTULOS_SITUACAO = {
  aberto: "Aberto agora",
  disponivel: "Disponível",
  ocupado: "Outro mundo em uso",
  abrindo: "Abrindo agora",
  trocando: "Trocando de mundo",
  "sem-mundo": "Sem mundo no Foundry",
};

const campanhaPorId = (id) => estado.campanhas.find((c) => c.id === id);
const campanhaPorMundo = (mundo) => estado.campanhas.find((c) => c.mundo === mundo);
const nomeDoMundo = (mundo) => campanhaPorMundo(mundo)?.nome ?? mundo;

function essasPessoas(n) {
  return n === 1 ? "essa pessoa" : `essas ${n} pessoas`;
}

// Situação de uma campanha diante do estado atual do Foundry
function situacaoDe(campanha) {
  const { online, mundoAtivo, conectados, trocandoPara } = estado.status;
  if (!campanha.mundo) return "sem-mundo";
  if (trocandoPara) return trocandoPara === campanha.mundo ? "abrindo" : "trocando";
  if (online && mundoAtivo === campanha.mundo) return "aberto";
  if (online && mundoAtivo && conectados > 0) return "ocupado";
  return "disponivel";
}

/* =================================================================
   Status do servidor
   ================================================================= */

function aplicarStatus(novo) {
  estado.status = novo;
  atualizarTopo();
  atualizarSelos();
}

async function atualizarStatus() {
  try {
    aplicarStatus(await api.estado());
  } catch (falha) {
    if (falha.codigo === "sem-sessao") return;
    aplicarStatus({ online: false, mundoAtivo: null, conectados: 0, trocandoPara: null });
  }
}

function atualizarTopo() {
  mostrarStatus(estado.status, nomeDoMundo);
}

function atualizarSelos() {
  for (const secao of document.querySelectorAll(".campanha")) {
    const campanha = campanhaPorId(secao.dataset.campanha);
    if (!campanha) continue;
    const situacao = situacaoDe(campanha);
    const selo = secao.querySelector(".selo");
    selo.className = `selo selo--${situacao}`;
    selo.textContent = ROTULOS_SITUACAO[situacao];
  }
}

/* =================================================================
   Cards e campanhas
   ================================================================= */

// Cada jogador vê os personagens de todas as campanhas e pode admirar a arte de
// qualquer um, mas só entra no mundo com o próprio. O mestre entra por qualquer card.
function criarItemPersonagem(personagem, campanha) {
  const proprio = personagem.dono === estado.conta.usuario;
  const podeEntrar = proprio || estado.conta.admin;
  const item = criar("div", "card-item");
  const card = montarCardComMoldura(personagem, campanha, { alheio: !podeEntrar });

  if (podeEntrar) {
    card.setAttribute("aria-label", `Entrar com ${personagem.nome} em ${campanha.nome}`);
    const acesso = {
      alvo: { personagem: personagem.id },
      temLogin: proprio && personagem.temLoginFoundry,
      usuario: personagem.foundryUsuario,
    };
    card.addEventListener("click", () => entrarNoMundo(campanha, card, acesso));
  } else {
    card.setAttribute("aria-label", `${personagem.nome}, personagem de ${personagem.nomeDono}`);
    card.addEventListener("click", () =>
      avisar({
        titulo: "Esse personagem não é seu",
        texto: `${personagem.nome} pertence a ${personagem.nomeDono}. Você só pode entrar no mundo com os seus personagens.`,
      }),
    );
  }
  item.append(card);

  const legenda = proprio && !estado.conta.admin ? "Seu personagem" : personagem.nomeDono;
  item.append(criar("p", `card-item__dono${proprio ? " card-item__dono--proprio" : ""}`, legenda));
  if (proprio) {
    item.append(
      botao("Personalizar", "botao--leve botao--pequeno card-item__personalizar", () =>
        abrirPersonalizacao(personagem, campanha),
      ),
    );
  }
  return item;
}

// O dono escolhe o nome que aparece no card e a fonte, vendo o card mudar ao vivo
function abrirPersonalizacao(personagem, campanha) {
  const dialogo = $("#dialogo-personagem");
  const form = $("#form-personagem");
  const erro = $("#erro-personagem");
  const grade = $("#personalizar-fontes");
  const botaoEnviar = form.querySelector('button[type="submit"]');

  carregarFontes(FONTES.map((f) => f.chave));
  form.elements.nome.value = personagem.nome;
  erro.hidden = true;

  grade.replaceChildren(
    ...FONTES.map((fonte) => {
      const opcao = criar("label", "fonte");
      const entrada = criar("input");
      entrada.type = "radio";
      entrada.name = "fonte";
      entrada.value = fonte.chave;
      entrada.checked = fonte.chave === personagem.fonte;
      const amostra = criar("span", "fonte__amostra");
      aplicarFonte(amostra, fonte.chave);
      opcao.append(entrada, amostra, criar("span", "fonte__rotulo", fonte.rotulo));
      return opcao;
    }),
  );

  const atualizar = () => {
    const nome = form.elements.nome.value.trim() || personagem.nome;
    const fonte = form.elements.fonte.value || personagem.fonte;
    for (const amostra of grade.querySelectorAll(".fonte__amostra")) amostra.textContent = nome;
    const card = montarCardComMoldura({ ...personagem, nome, fonte }, campanha);
    card.disabled = true;
    card.tabIndex = -1;
    card.classList.add("card--destaque");
    $("#personalizar-palco").replaceChildren(card);
  };
  form.oninput = atualizar;
  atualizar();

  form.onsubmit = async (evento) => {
    evento.preventDefault();
    erro.hidden = true;
    const nome = form.elements.nome.value.trim();
    if (!nome) {
      erro.textContent = "Escreva o nome do personagem.";
      erro.hidden = false;
      return;
    }
    botaoEnviar.disabled = true;
    try {
      await api.personagem(personagem.id, { nome, fonte: form.elements.fonte.value || personagem.fonte });
      dialogo.close();
      avisoRapido("Personagem salvo.");
      await carregarPortal();
    } catch (falha) {
      erro.textContent = falha.message;
      erro.hidden = false;
    } finally {
      botaoEnviar.disabled = false;
    }
  };
  $("#personagem-cancelar").onclick = () => dialogo.close();
  dialogo.showModal();
}

// Seus personagens primeiro, depois os dos outros jogadores
function ordenarPersonagens(lista) {
  const meu = (p) => (p.dono === estado.conta.usuario ? 0 : 1);
  return [...lista].sort((a, b) => meu(a) - meu(b));
}

function criarSecao(campanha, personagens, ehAdmin) {
  const secao = criar("section", "campanha");
  secao.dataset.campanha = campanha.id;
  secao.setAttribute("aria-label", campanha.nome);

  const topo = criar("header", "campanha__topo");
  // Na página principal, o título da campanha aparece sempre escrito (o logo fica só no card da campanha)
  topo.append(criar("h2", "campanha__titulo", campanha.nome), criar("p", "selo"));

  if (ehAdmin) {
    const acoes = criar("div", "campanha__acoes");
    acoes.append(
      botao("Tirar da página", "botao--leve", () => tirarDaPagina(campanha)),
      botao("Entrar no mundo", "botao--leve", () => entrarNoMundo(campanha, null)),
      botao("Entrar como Mestre", "botao--principal botao--pequeno", () => entrarComoMestre(campanha)),
    );
    topo.append(acoes);
  }

  const regua = criar("span", "campanha__regua");
  regua.setAttribute("aria-hidden", "true");

  const lista = criar("div", "campanha__cards");
  if (personagens.length) {
    for (const personagem of ordenarPersonagens(personagens)) {
      lista.append(criarItemPersonagem(personagem, campanha));
    }
  } else {
    lista.classList.add("campanha__cards--vazia");
    lista.append(criar("p", "campanha__vazio", "Nenhum personagem cadastrado nesta campanha."));
  }

  secao.append(topo, regua, lista);
  return secao;
}

// Só o administrador tira uma mesa da página Mesas; ela volta pela Administração
async function tirarDaPagina(campanha) {
  const confirmou = await perguntar({
    titulo: "Tirar da página Mesas?",
    texto: `“${campanha.nome}” sai da página Mesas, com os cards dos personagens. Continua na Linha do Tempo, nos Personagens, nos Mapas e nas Regras. Para trazer de volta, marque “Aparece na página Mesas” em Administração, na aba Mesas.`,
    confirmar: "Tirar da página",
    cancelar: "Cancelar",
  });
  if (!confirmou) return;
  try {
    await api.admin.alterarMesa(campanha.id, { naPaginaMesas: false });
    await carregarPortal();
  } catch (falha) {
    avisar({ titulo: "Não foi possível tirar da página", texto: falha.message });
  }
}

function renderizarCampanhas() {
  const raiz = $("#campanhas");
  raiz.replaceChildren();
  carregarFontes(estado.personagens.map((p) => p.fonte));
  const ehAdmin = Boolean(estado.conta?.admin);

  const minhas = new Set(estado.personagens.filter((p) => p.dono === estado.conta.usuario).map((p) => p.campanha));
  const ordenadas = [...estado.campanhas].sort((a, b) => Number(minhas.has(b.id)) - Number(minhas.has(a.id)));
  for (const campanha of ordenadas) {
    const daCampanha = estado.personagens.filter((p) => p.campanha === campanha.id);
    if (daCampanha.length || ehAdmin) raiz.append(criarSecao(campanha, daCampanha, ehAdmin));
  }

  if (!raiz.children.length) {
    const vazio = criar("div", "vazio");
    vazio.append(
      criar("h2", "vazio__titulo", "Você ainda não tem personagens cadastrados"),
      criar("p", "vazio__texto", "Peça ao mestre para incluir os seus."),
    );
    raiz.append(vazio);
  }

  atualizarSelos();
}

async function carregarPortal() {
  const dados = await api.portal();
  estado.conta = dados.conta;
  estado.campanhas = dados.campanhas;
  estado.personagens = dados.personagens;
  estado.enderecoFoundry = dados.enderecoFoundry;
  $("#nome-conta").textContent = estado.conta.nome;
  $("#botao-admin").hidden = !estado.conta.admin;
  mostrarPendenciasDaLinha(dados.pendenciasLinha ?? 0);
  renderizarCampanhas();
}

/* =================================================================
   Entrar no mundo de um personagem
   ================================================================= */

// "acesso" diz com qual login do Foundry entrar: o de um personagem ou o do mestre
async function entrarNoMundo(campanha, cardOrigem, acesso = null) {
  if (estado.abrindo) return;
  await atualizarStatus();
  const situacao = situacaoDe(campanha);

  if (situacao === "sem-mundo") {
    return avisar({
      titulo: "Essa campanha ainda não tem mundo",
      texto: estado.conta.admin
        ? "Ligue a campanha a um mundo do Foundry na administração, na aba Mesas."
        : "Ela ainda não foi ligada a um mundo do Foundry. Avise o mestre.",
    });
  }
  if (situacao === "aberto") return irParaFoundry(acesso);
  if (situacao === "abrindo") return acompanharAbertura(campanha, cardOrigem, acesso);
  if (situacao === "trocando") {
    return avisar({
      titulo: "O servidor está trocando de mundo",
      texto: `Alguém está abrindo ${nomeDoMundo(estado.status.trocandoPara)} agora. Espere terminar e tente de novo.`,
    });
  }

  let forcar = false;
  if (situacao === "ocupado") {
    const { mundoAtivo, conectados } = estado.status;
    const ocupacao = `${nomeDoMundo(mundoAtivo)} está aberto, ${frasePessoas(conectados)}.`;

    if (!estado.conta.admin) {
      return avisar({
        titulo: "O servidor está em uso",
        texto: `${ocupacao} Tente de novo quando a sessão acabar.`,
      });
    }

    const confirmou = await perguntar({
      titulo: "Forçar a troca de mundo?",
      texto: `${ocupacao} Abrir ${campanha.nome} agora desconecta ${essasPessoas(conectados)}.`,
      confirmar: "Forçar troca",
      cancelar: "Cancelar",
      perigo: true,
    });
    if (!confirmou) return;
    forcar = true;
  }

  estado.abrindo = true;
  mostrarAbertura(campanha, cardOrigem);
  try {
    const resposta = await api.abrirMundo(campanha.id, forcar);
    if (resposta?.jaAberto) {
      encerrarAbertura();
      return irParaFoundry(acesso);
    }
  } catch (falha) {
    encerrarAbertura();
    // A situação mudou enquanto isso: refaz a checagem e mostra o aviso certo
    if (falha.codigo === "ocupado" || falha.codigo === "trocando") {
      return entrarNoMundo(campanha, cardOrigem, acesso);
    }
    return avisar({ titulo: "Não foi possível abrir o mundo", texto: falha.message });
  }
  await esperarMundo(campanha, acesso);
}

// O mestre entra direto no usuário de mestre daquela campanha, salvo na administração
function entrarComoMestre(campanha) {
  if (!campanha.temLoginMestre) {
    return avisar({
      titulo: "Falta salvar o login do mestre",
      texto: "Em Administração, na aba Mesas, edite esta mesa e preencha o usuário e a senha do mestre no Foundry.",
    });
  }
  return entrarNoMundo(campanha, null, {
    alvo: { campanha: campanha.id },
    temLogin: true,
    usuario: campanha.mestreUsuario,
  });
}

async function acompanharAbertura(campanha, cardOrigem, acesso) {
  estado.abrindo = true;
  mostrarAbertura(campanha, cardOrigem);
  await esperarMundo(campanha, acesso);
}

async function esperarMundo(campanha, acesso) {
  const inicio = Date.now();
  while (Date.now() - inicio < CONFIG.limiteAbertura) {
    await esperar(1500);
    await atualizarStatus();
    const { online, mundoAtivo } = estado.status;

    if (online && mundoAtivo === campanha.mundo) {
      marcarEtapa(4, "O mundo despertou.");
      $("#abertura").classList.add("ritual--pronto");
      await esperar(1300);
      encerrarAbertura();
      return irParaFoundry(acesso);
    }

    if (!online) marcarEtapa(3, "Religando o Foundry…");
    else if (!mundoAtivo) marcarEtapa(4, `Carregando ${campanha.nome}…`);
    else marcarEtapa(2, "Fechando o mundo atual…");
  }

  encerrarAbertura();
  avisar({
    titulo: "O mundo demorou demais para abrir",
    texto: "Tente de novo em alguns minutos. Se continuar assim, avise o mestre.",
  });
}

// No aplicativo, leva junto o login do Foundry salvo no personagem. O aplicativo tira
// esses dados do endereço antes de abrir o jogo e faz o login sozinho.
async function irParaFoundry(acesso) {
  if (MODO_PREVIA) {
    const login = acesso?.temLogin ? ` O aplicativo entraria sozinho como ${acesso.usuario}.` : "";
    return avisar({
      titulo: "Aqui o Foundry abriria",
      texto: `No portal de verdade, você iria agora para o mundo no Foundry.${login}`,
    });
  }
  let destino = estado.enderecoFoundry;
  const appFazLogin = Boolean(window.cronicasEternasApp?.loginFoundry);
  if (acesso?.temLogin && appFazLogin) {
    try {
      const { usuario, senha } = await api.acessoFoundry(acesso.alvo);
      destino += `#${new URLSearchParams({ "ce-usuario": usuario, "ce-senha": senha })}`;
    } catch {
      // sem o login salvo, abre a tela de login normal do Foundry
    }
  }
  window.location.href = destino;
}

/* ---------- Tela de abertura ---------- */

function mostrarAbertura(campanha, cardOrigem) {
  const abertura = $("#abertura");
  abertura.classList.remove("ritual--pronto");
  abertura.style.setProperty("--cor", campanha.cor);
  $("#abertura-fundo").style.backgroundImage = campanha.capa ? `url("${campanha.capa}")` : "";

  // Mostra o card que foi clicado. Pelo botão do mestre, mostra o card da campanha.
  let card;
  if (cardOrigem) {
    card = cardOrigem.cloneNode(true);
    protegerImagens(card);
  } else {
    card = montarCardComMoldura({ nome: campanha.nome, titulo: campanha.titulo, arte: campanha.arte }, campanha);
  }
  card.disabled = true;
  card.tabIndex = -1;
  card.removeAttribute("aria-label");
  $("#abertura-palco").replaceChildren(card);

  $("#abertura-titulo").textContent = `Abrindo ${campanha.nome}`;
  marcarEtapa(1, "Pedindo a troca de mundo…", true);
  abertura.hidden = false;
  document.body.classList.add("com-ritual");

  // O card se abre no quadro seguinte, para a transição aparecer
  requestAnimationFrame(() => requestAnimationFrame(() => card.classList.add("card--destaque")));
}

// Cada etapa da troca acende uma runa do círculo (as anteriores continuam acesas)
function marcarEtapa(etapa, texto, reiniciar = false) {
  $("#abertura-etapa").textContent = texto;
  for (const runa of document.querySelectorAll(".sigilo__runa")) {
    const acesa = Number(runa.dataset.etapa) <= etapa;
    if (reiniciar) runa.classList.remove("acesa");
    runa.classList.toggle("acesa", acesa);
  }
}

function encerrarAbertura() {
  const abertura = $("#abertura");
  abertura.hidden = true;
  abertura.classList.remove("ritual--pronto");
  $("#abertura-palco").replaceChildren();
  document.body.classList.remove("com-ritual");
  estado.abrindo = false;
}

/* =================================================================
   Avisos
   ================================================================= */

function avisar({ titulo, texto }) {
  return perguntar({ titulo, texto });
}

/* =================================================================
   Entrar, sair e trocar senha
   ================================================================= */

function mostrarEntrada(mensagem = "") {
  clearInterval(estado.timerStatus);
  for (const dialogo of document.querySelectorAll("dialog[open]")) dialogo.close();
  encerrarAbertura();
  estado.conta = null;
  estado.admin = null;

  $("#campanhas").replaceChildren();
  $("#adm-conteudo").replaceChildren();
  $("#portal").hidden = true;
  $("#simulacao").hidden = true;
  $("#aviso-rapido").hidden = true;
  $("#entrada").hidden = false;
  document.body.classList.replace("no-portal", "na-entrada");
  document.body.classList.remove("com-barra");

  const erro = $("#erro-entrar");
  erro.textContent = mensagem;
  erro.hidden = !mensagem;
  $("#form-entrar").elements.usuario.focus();
}

function sessaoExpirada() {
  if (estado.conta) mostrarEntrada("Sua sessão terminou. Entre de novo para continuar.");
}

function configurarEntrada() {
  const form = $("#form-entrar");
  const erro = $("#erro-entrar");
  const botaoEnviar = form.querySelector('button[type="submit"]');

  // O portão reconhece quem chega: a pedra de fecho acende com usuário e senha preenchidos
  const conferirPreenchido = () => {
    const pronto = Boolean(form.elements.usuario.value.trim() && form.elements.senha.value);
    form.classList.toggle("portao--pronto", pronto);
  };
  form.addEventListener("input", conferirPreenchido);
  form.addEventListener("reset", () => setTimeout(conferirPreenchido));

  form.addEventListener("submit", async (evento) => {
    evento.preventDefault();
    erro.hidden = true;

    const usuario = form.elements.usuario.value.trim();
    const senha = form.elements.senha.value;
    const lembrar = form.elements.lembrar.checked;
    if (!usuario || !senha) {
      erro.textContent = "Preencha o usuário e a senha.";
      erro.hidden = false;
      return;
    }

    botaoEnviar.disabled = true;
    botaoEnviar.textContent = "Entrando…";
    try {
      await api.entrar(usuario, senha, lembrar);
      form.reset();
      const destino = destinoDepoisDeEntrar();
      if (destino) return location.assign(destino);
      atualizarBarra(); // a página não recarrega, e os números da barra são da conta que entrou
      await abrirPortal();
    } catch (falha) {
      erro.textContent = falha.message;
      erro.hidden = false;
      form.elements.senha.select();
    } finally {
      botaoEnviar.disabled = false;
      botaoEnviar.textContent = "Entrar";
    }
  });
}

// Quem abriu o link de uma página do grupo sem estar logado volta para ele depois de entrar.
// Só vale para as páginas prontas da lista PAGINAS (comum.js), para o endereço nunca levar a outro site.
function destinoDepoisDeEntrar() {
  const destino = new URLSearchParams(location.search).get("voltar") ?? "";
  const pastas = PAGINAS.filter((p) => p.pronta && p.caminho).map((p) => p.caminho.replace(/\/$/, ""));
  const permitido = new RegExp(`^/(${pastas.join("|")})/(index\\.html)?(#[\\w-]+)?$`);
  return permitido.test(destino) ? destino : "";
}

async function abrirPortal() {
  await carregarPortal();
  if (location.search) {
    try {
      history.replaceState(null, "", location.pathname); // tira o "?voltar=" do endereço
    } catch {
      // alguns quadros de prévia não deixam mudar o endereço
    }
  }
  $("#entrada").hidden = true;
  $("#portal").hidden = false;
  if (MODO_PREVIA) $("#simulacao").hidden = false;
  mostrarPersonagens();
  document.body.classList.replace("na-entrada", "no-portal");
  document.body.classList.add("com-barra");
  await atualizarStatus();
  clearInterval(estado.timerStatus);
  estado.timerStatus = setInterval(atualizarStatus, CONFIG.intervaloStatus);
}

async function sair() {
  await api.sair().catch(() => {});
  mostrarEntrada();
}

function configurarMinhaConta() {
  const dialogo = $("#dialogo-conta");
  const form = $("#form-conta");
  const erro = $("#erro-conta");
  const botaoEnviar = form.querySelector('button[type="submit"]');

  $("#botao-conta").addEventListener("click", () => {
    form.reset();
    form.elements.usuario.value = estado.conta.usuario;
    $("#conta-nome").textContent = estado.conta.nome;
    erro.hidden = true;
    dialogo.showModal();
  });
  $("#conta-cancelar").addEventListener("click", () => dialogo.close());

  form.addEventListener("submit", async (evento) => {
    evento.preventDefault();
    const { usuario, atual, nova, repetida } = form.elements;
    const novoUsuario = usuario.value.trim().toLowerCase();

    let problema = "";
    if (!novoUsuario) problema = "Preencha o usuário.";
    else if (!atual.value) problema = "Digite a senha atual para salvar.";
    else if (nova.value && nova.value.length < 8) problema = "A nova senha precisa ter pelo menos 8 caracteres.";
    else if (nova.value !== repetida.value) problema = "As duas novas senhas não são iguais.";
    else if (novoUsuario === estado.conta.usuario && !nova.value) problema = "Nada mudou. Altere o usuário ou preencha uma nova senha.";
    if (problema) {
      erro.textContent = problema;
      erro.hidden = false;
      return;
    }

    botaoEnviar.disabled = true;
    try {
      const { conta } = await api.conta(novoUsuario, atual.value, nova.value);
      const mudouUsuario = conta.usuario !== estado.conta.usuario;
      estado.conta = conta;
      dialogo.close();
      avisoRapido(mudouUsuario ? `Conta salva. Da próxima vez, entre como ${conta.usuario}.` : "Conta salva.");
      await carregarPortal();
    } catch (falha) {
      erro.textContent = falha.message;
      erro.hidden = false;
    } finally {
      botaoEnviar.disabled = false;
    }
  });
}

/* =================================================================
   Administração
   ================================================================= */

function mostrarPersonagens() {
  $("#administracao").hidden = true;
  $("#campanhas").hidden = false;
  $("#botao-admin").textContent = "Administração";
}

async function alternarAdmin() {
  if (!$("#administracao").hidden) return mostrarPersonagens();
  $("#campanhas").hidden = true;
  $("#administracao").hidden = false;
  $("#botao-admin").textContent = "Ver personagens";
  await carregarAdmin();
}

async function carregarAdmin() {
  try {
    estado.admin = await api.admin.dados();
    renderizarAdmin();
  } catch (falha) {
    avisar({ titulo: "Não foi possível carregar a administração", texto: falha.message });
  }
}

// Depois de qualquer mudança, atualiza a administração e os cards
async function recarregarTudo() {
  await Promise.all([carregarAdmin(), carregarPortal()]);
}

function renderizarAdmin() {
  for (const aba of document.querySelectorAll(".aba")) {
    aba.setAttribute("aria-selected", String(aba.dataset.aba === estado.abaAdmin));
  }
  const raiz = $("#adm-conteudo");
  raiz.replaceChildren();
  if (estado.abaAdmin === "personagens") renderizarAbaPersonagens(raiz);
  if (estado.abaAdmin === "contas") renderizarAbaContas(raiz);
  if (estado.abaAdmin === "campanhas") renderizarAbaCampanhas(raiz);
}

function barraDaAba(explicacao, textoBotao, aoClicar) {
  const barra = criar("div", "administracao__barra");
  barra.append(criar("p", "administracao__explicacao", explicacao));
  barra.append(botao(textoBotao, "botao--principal", aoClicar));
  return barra;
}

function linha({ miniatura, nome, detalhes, acoes }) {
  const item = criar("div", "linha");
  const info = criar("div", "linha__info");
  info.append(criar("p", "linha__nome", nome));
  for (const detalhe of detalhes) {
    const paragrafo = criar("p", "linha__detalhe", detalhe.texto ?? detalhe);
    if (detalhe.alerta) paragrafo.classList.add("linha__alerta");
    info.append(paragrafo);
  }
  const caixaAcoes = criar("div", "linha__acoes");
  for (const [texto, aoClicar, perigo] of acoes) {
    caixaAcoes.append(botao(texto, `botao--leve botao--pequeno${perigo ? " botao--perigo" : ""}`, aoClicar));
  }
  item.append(miniatura, info, caixaAcoes);
  return item;
}

function miniaturaDe(src, cor) {
  const caixa = criar("span", "linha__miniatura");
  caixa.style.setProperty("--cor", cor);
  if (src) {
    const img = imagem(src, "");
    img.addEventListener("error", () => img.remove(), { once: true });
    caixa.append(img);
  }
  return caixa;
}

function listaOuVazio(itens, textoVazio) {
  const lista = criar("div", "lista");
  if (!itens.length) lista.append(criar("p", "lista__vazia", textoVazio));
  else lista.append(...itens);
  return lista;
}

/* ---------- Aba Personagens ---------- */

function renderizarAbaPersonagens(raiz) {
  const { personagens, campanhas } = estado.admin;
  raiz.append(
    barraDaAba(
      "Cada personagem aparece só para o jogador dono dele. Clicar no card abre o mundo da mesa.",
      "Novo personagem",
      () => formularioPersonagem(null),
    ),
  );

  const ordem = new Map(campanhas.map((c, i) => [c.id, i]));
  const ordenados = [...personagens].sort(
    (a, b) => (ordem.get(a.campanha) ?? 0) - (ordem.get(b.campanha) ?? 0) || a.nome.localeCompare(b.nome, "pt-BR"),
  );

  const itens = ordenados.map((p) => {
    const campanha = campanhas.find((c) => c.id === p.campanha);
    const login = p.temLoginFoundry
      ? `login do Foundry salvo (${p.foundryUsuario})`
      : "sem login do Foundry salvo";
    return linha({
      miniatura: miniaturaDe(p.capa || campanha?.capa, campanha?.cor),
      nome: p.nome,
      detalhes: [`${p.nomeDono} em ${campanha?.nome ?? "mesa removida"}, ${login}`],
      acoes: [
        ["Editar", () => formularioPersonagem(p)],
        ["Excluir", () => excluir(`Excluir ${p.nome}?`, "O personagem sai do portal. O mundo no Foundry não muda.", () => api.admin.excluirPersonagem(p.id), "Personagem excluído."), true],
      ],
    });
  });
  raiz.append(listaOuVazio(itens, "Nenhum personagem cadastrado ainda."));
}

function formularioPersonagem(personagem) {
  const { contas, campanhas } = estado.admin;
  if (!campanhas.length) {
    return avisar({ titulo: "Crie uma mesa primeiro", texto: "Todo personagem precisa estar em uma mesa." });
  }
  abrirFormulario({
    titulo: personagem ? `Editar ${personagem.nome}` : "Novo personagem",
    campos: [
      { tipo: "texto", nome: "nome", rotulo: "Nome do personagem", valor: personagem?.nome, max: 60 },
      {
        tipo: "selecao",
        nome: "fonte",
        rotulo: "Fonte do nome",
        valor: personagem?.fonte || "gotica",
        opcoes: FONTES.map((f) => [f.chave, f.rotulo]),
        ajuda: "O jogador também pode trocar o nome e a fonte pelo botão Personalizar, embaixo do card dele.",
      },
      {
        tipo: "selecao",
        nome: "dono",
        rotulo: "Jogador",
        valor: personagem?.dono,
        opcoes: contas.map((c) => [c.usuario, c.nome]),
      },
      {
        tipo: "selecao",
        nome: "campanha",
        rotulo: "Mesa",
        valor: personagem?.campanha,
        opcoes: campanhas.map((c) => [c.id, c.nome]),
      },
      {
        tipo: "texto",
        nome: "foundry_usuario",
        rotulo: "Usuário no Foundry",
        valor: personagem?.foundryUsuario,
        max: 60,
        ajuda: "O nome desse jogador no mundo da mesa, igual aparece na tela de login do Foundry.",
      },
      {
        tipo: "senha",
        nome: "foundry_senha",
        rotulo: "Senha no Foundry",
        ajuda: personagem?.temLoginFoundry
          ? "Já tem uma senha salva. Deixe em branco para manter a mesma."
          : "Com usuário e senha salvos, o aplicativo entra no mundo sozinho quando o jogador clica no card.",
      },
      ...(personagem?.temLoginFoundry
        ? [{ tipo: "caixa", nome: "remover_foundry", rotulo: "Apagar o login do Foundry salvo" }]
        : []),
      {
        tipo: "imagem",
        nome: "capa",
        rotulo: "Capa",
        atual: personagem?.capa,
        ajuda: "Fundo do card, na proporção 2 por 3. Sem capa, o card usa a da mesa.",
      },
      {
        tipo: "imagem",
        nome: "arte",
        rotulo: "Arte recortada",
        atual: personagem?.arte,
        ajuda: "O personagem em PNG transparente. É ela que salta do card.",
      },
    ],
    enviar: (form) => api.admin.salvarPersonagem(personagem?.id, new FormData(form)),
    sucesso: personagem ? "Personagem salvo." : "Personagem criado.",
  });
}

/* ---------- Aba Contas ---------- */

function renderizarAbaContas(raiz) {
  const { contas, personagens } = estado.admin;
  raiz.append(
    barraDaAba(
      "Cada jogador entra no portal com o próprio usuário e senha.",
      "Nova conta",
      () => formularioNovaConta(),
    ),
  );

  const itens = contas.map((c) => {
    const quantos = personagens.filter((p) => p.dono === c.usuario).length;
    const cargo = c.admin ? ", administrador" : c.editor ? ", editor da Linha do Tempo" : "";
    const detalhes = [
      `Usuário ${c.usuario}${cargo}, ${quantos === 1 ? "1 personagem" : `${quantos} personagens`}`,
    ];
    if (!c.temSenha) detalhes.push({ texto: "Ainda sem senha. Defina uma para a pessoa conseguir entrar.", alerta: true });
    const inicial = criar("span", "linha__miniatura linha__miniatura--conta", c.nome.charAt(0).toUpperCase());
    inicial.setAttribute("aria-hidden", "true");
    return linha({
      miniatura: inicial,
      nome: c.nome,
      detalhes,
      acoes: [
        ["Editar", () => formularioEditarConta(c)],
        [c.temSenha ? "Redefinir senha" : "Definir senha", () => formularioSenhaDaConta(c)],
        ["Excluir", () => excluir(`Excluir a conta de ${c.nome}?`, "A pessoa não vai mais conseguir entrar no portal.", () => api.admin.excluirConta(c.usuario), "Conta excluída."), true],
      ],
    });
  });
  raiz.append(listaOuVazio(itens, "Nenhuma conta cadastrada."));
}

const ROTULO_EDITOR = "Editor (registra e altera acontecimentos na Linha do Tempo, cadastra e altera personagens e marca lugares nos mapas; apagar acontecimentos passa pela sua aprovação)";

function formularioNovaConta() {
  abrirFormulario({
    titulo: "Nova conta",
    campos: [
      {
        tipo: "texto",
        nome: "usuario",
        rotulo: "Usuário",
        max: 30,
        ajuda: "O que a pessoa digita para entrar: letras minúsculas e números, sem espaços.",
      },
      { tipo: "texto", nome: "nome", rotulo: "Nome", max: 40, ajuda: "Como o nome aparece no portal." },
      {
        tipo: "senha",
        nome: "senha",
        rotulo: "Senha inicial",
        ajuda: "Pelo menos 8 caracteres. A pessoa pode trocar depois.",
      },
      { tipo: "caixa", nome: "admin", rotulo: "Administrador (pode cadastrar e forçar troca de mundo)" },
      { tipo: "caixa", nome: "editor", rotulo: ROTULO_EDITOR },
    ],
    botao: "Criar conta",
    enviar: (form) =>
      api.admin.criarConta({
        usuario: form.elements.usuario.value,
        nome: form.elements.nome.value,
        senha: form.elements.senha.value,
        admin: form.elements.admin.checked,
        editor: form.elements.editor.checked,
      }),
    sucesso: "Conta criada.",
  });
}

function formularioEditarConta(conta) {
  abrirFormulario({
    titulo: `Editar ${conta.nome}`,
    campos: [
      { tipo: "texto", nome: "nome", rotulo: "Nome", valor: conta.nome, max: 40 },
      {
        tipo: "caixa",
        nome: "admin",
        rotulo: "Administrador (pode cadastrar e forçar troca de mundo)",
        valor: conta.admin,
      },
      { tipo: "caixa", nome: "editor", rotulo: ROTULO_EDITOR, valor: conta.editor },
    ],
    enviar: (form) =>
      api.admin.editarConta(conta.usuario, {
        nome: form.elements.nome.value,
        admin: form.elements.admin.checked,
        editor: form.elements.editor.checked,
      }),
    sucesso: "Conta salva.",
  });
}

function formularioSenhaDaConta(conta) {
  abrirFormulario({
    titulo: `Senha de ${conta.nome}`,
    campos: [
      {
        tipo: "senha",
        nome: "senha",
        rotulo: "Nova senha",
        ajuda: "Pelo menos 8 caracteres. Se a pessoa estiver conectada em outro aparelho, vai precisar entrar de novo.",
      },
    ],
    botao: "Salvar senha",
    enviar: (form) => api.admin.senhaDaConta(conta.usuario, form.elements.senha.value),
    sucesso: "Senha salva.",
  });
}

/* ---------- Aba Mesas ---------- */

function renderizarAbaCampanhas(raiz) {
  const { campanhas, mundos, personagens } = estado.admin;
  raiz.append(
    barraDaAba(
      "Todas as mesas do portal. As que acontecem no Foundry ficam ligadas a um mundo; é ele que abre quando alguém clica num personagem dela.",
      "Nova mesa",
      () => formularioCampanha(null),
    ),
  );

  const itens = campanhas.map((c) => {
    const mundo = mundos.find((m) => m.id === c.mundo);
    const quantos = personagens.filter((p) => p.campanha === c.id).length;
    const detalhes = [c.naPaginaMesas ? "Aparece na página Mesas" : "Fora da página Mesas"];
    const loginMestre = c.temLoginMestre ? `login do mestre salvo (${c.mestreUsuario})` : "sem login do mestre salvo";
    if (mundo) {
      detalhes.push(`Mundo ${mundo.titulo}, ${quantos === 1 ? "1 personagem" : `${quantos} personagens`}, ${loginMestre}`);
    } else if (c.naPaginaMesas) {
      detalhes.push({ texto: "Ainda não está ligada a um mundo do Foundry.", alerta: true });
    }
    return linha({
      miniatura: miniaturaDe(c.capa, c.cor),
      nome: c.nome,
      detalhes,
      acoes: [
        ["Editar", () => formularioCampanha(c)],
        ["Excluir", () => excluir(`Excluir ${c.nome}?`, "A mesa sai do portal. O mundo no Foundry não muda.", () => api.admin.excluirCampanha(c.id), "Mesa excluída."), true],
      ],
    });
  });
  raiz.append(listaOuVazio(itens, "Nenhuma mesa cadastrada."));
}

function formularioCampanha(campanha) {
  const { mundos } = estado.admin;
  abrirFormulario({
    titulo: campanha ? `Editar ${campanha.nome}` : "Nova mesa",
    campos: [
      { tipo: "texto", nome: "nome", rotulo: "Nome da mesa", valor: campanha?.nome, max: 80 },
      // Uma mesa nova nasce na página Mesas
      { tipo: "caixa", nome: "na_pagina", rotulo: "Aparece na página Mesas", valor: campanha ? campanha.naPaginaMesas : true },
      {
        tipo: "selecao",
        nome: "mundo",
        rotulo: "Mundo do Foundry",
        valor: campanha?.mundo,
        opcoes: [["", "Nenhum por enquanto"], ...mundos.map((m) => [m.id, `${m.titulo} (${m.id})`])],
        ajuda: mundos.length
          ? "A lista mostra os mundos criados no Foundry."
          : "Nenhum mundo encontrado. Crie o mundo no Foundry e volte aqui.",
      },
      {
        tipo: "texto",
        nome: "mestre_usuario",
        rotulo: "Usuário do mestre no Foundry",
        valor: campanha?.mestreUsuario,
        max: 60,
        ajuda: "O usuário de mestre neste mundo, igual aparece na tela de login do Foundry. É o que o botão Entrar como Mestre usa.",
      },
      {
        tipo: "senha",
        nome: "mestre_senha",
        rotulo: "Senha do mestre no Foundry",
        ajuda: campanha?.temLoginMestre
          ? "Já tem uma senha salva. Deixe em branco para manter a mesma."
          : "Com usuário e senha salvos, o aplicativo entra no mundo como mestre sozinho.",
      },
      ...(campanha?.temLoginMestre
        ? [{ tipo: "caixa", nome: "remover_mestre", rotulo: "Apagar o login do mestre salvo" }]
        : []),
      {
        tipo: "cor",
        nome: "cor",
        rotulo: "Cor",
        valor: campanha?.cor || "#2e3756",
        ajuda: "Usada nos cards que ainda não têm imagem.",
      },
      {
        tipo: "imagem",
        nome: "capa",
        rotulo: "Capa",
        atual: campanha?.capa,
        ajuda: "Usada nos cards dos personagens sem capa própria e no fundo da tela de abertura.",
      },
      {
        tipo: "imagem",
        nome: "titulo",
        rotulo: "Logo",
        atual: campanha?.titulo,
        larga: true,
        ajuda: "Nome da mesa escrito como imagem. Aparece no card da mesa quando o mestre abre o mundo pela administração.",
      },
      {
        tipo: "imagem",
        nome: "arte",
        rotulo: "Arte recortada",
        atual: campanha?.arte,
        ajuda: "Aparece saltando do card quando o mestre abre o mundo pela administração.",
      },
    ],
    enviar: (form) => api.admin.salvarCampanha(campanha?.id, new FormData(form)),
    sucesso: campanha ? "Mesa salva." : "Mesa criada.",
  });
}

/* ---------- Formulário genérico ---------- */

function caixaDeMarcar(nome, texto, marcada) {
  const rotulo = criar("label", "caixa");
  const entrada = criar("input");
  entrada.type = "checkbox";
  entrada.name = nome;
  entrada.value = "1";
  entrada.checked = marcada;
  const marca = criar("span", "caixa__marca");
  marca.setAttribute("aria-hidden", "true");
  rotulo.append(entrada, marca, criar("span", "", texto));
  return rotulo;
}

function criarCampo(campo) {
  if (campo.tipo === "caixa") return caixaDeMarcar(campo.nome, campo.rotulo, Boolean(campo.valor));

  const rotulo = criar(campo.tipo === "imagem" ? "div" : "label", "campo");
  const idCampo = `campo-${campo.nome}`;
  const titulo = criar(campo.tipo === "imagem" ? "label" : "span", "campo__rotulo", campo.rotulo);
  rotulo.append(titulo);

  let entrada;
  if (campo.tipo === "selecao") {
    entrada = criar("select");
    for (const [valor, texto] of campo.opcoes) entrada.append(new Option(texto, valor));
    if (campo.valor !== undefined && campo.valor !== null) entrada.value = campo.valor;
  } else if (campo.tipo === "imagem") {
    if (campo.atual) {
      const atual = criar("div", `imagem-atual${campo.larga ? " imagem-atual--larga" : ""}`);
      atual.append(imagem(campo.atual, "", ""));
      atual.append(caixaDeMarcar(`remover_${campo.nome}`, "Remover esta imagem", false));
      rotulo.append(atual);
    }
    entrada = criar("input");
    entrada.type = "file";
    entrada.accept = "image/png,image/jpeg,image/webp,image/gif,image/avif";
    titulo.htmlFor = idCampo;
  } else {
    entrada = criar("input");
    entrada.type = campo.tipo === "senha" ? "password" : campo.tipo === "cor" ? "color" : "text";
    if (campo.tipo === "senha") entrada.autocomplete = "new-password";
    if (campo.tipo === "texto") {
      entrada.autocomplete = "off";
      entrada.spellcheck = false;
    }
    if (campo.max) entrada.maxLength = campo.max;
    if (campo.valor) entrada.value = campo.valor;
  }
  entrada.name = campo.nome;
  entrada.id = idCampo;
  rotulo.append(entrada);
  if (campo.ajuda) rotulo.append(criar("span", "campo__ajuda", campo.ajuda));
  return rotulo;
}

function abrirFormulario({ titulo, campos, botao: textoBotao = "Salvar", enviar, sucesso }) {
  const dialogo = $("#dialogo-form");
  const form = $("#form-admin");
  const erro = $("#form-admin-erro");
  const botaoEnviar = $("#form-admin-enviar");

  $("#form-admin-titulo").textContent = titulo;
  $("#form-admin-campos").replaceChildren(...campos.map(criarCampo));
  botaoEnviar.textContent = textoBotao;
  erro.hidden = true;

  form.onsubmit = async (evento) => {
    evento.preventDefault();
    erro.hidden = true;
    botaoEnviar.disabled = true;
    try {
      await enviar(form);
      dialogo.close();
      avisoRapido(sucesso);
      await recarregarTudo();
    } catch (falha) {
      erro.textContent = falha.message;
      erro.hidden = false;
    } finally {
      botaoEnviar.disabled = false;
    }
  };

  dialogo.showModal();
}

async function excluir(titulo, texto, acao, sucesso) {
  const confirmou = await perguntar({ titulo, texto, confirmar: "Excluir", cancelar: "Cancelar", perigo: true });
  if (!confirmou) return;
  try {
    await acao();
    avisoRapido(sucesso);
    await recarregarTudo();
  } catch (falha) {
    avisar({ titulo: "Não foi possível excluir", texto: falha.message });
  }
}

function configurarAdmin() {
  $("#botao-admin").addEventListener("click", alternarAdmin);
  $("#form-admin-cancelar").addEventListener("click", () => $("#dialogo-form").close());
  for (const aba of document.querySelectorAll(".aba")) {
    aba.addEventListener("click", () => {
      estado.abaAdmin = aba.dataset.aba;
      renderizarAdmin();
    });
  }
}

/* =================================================================
   Barra lateral: as páginas do grupo
   ================================================================= */

// O administrador vê na placa da Linha do Tempo quantos pedidos dos editores esperam por ele
function mostrarPendenciasDaLinha(quantas) {
  marcarNaBarra("linha", quantas, quantas === 1 ? "1 pedido para aprovar" : `${quantas} pedidos para aprovar`);
}

// A barra em si é montada pelo comum.js (lista PAGINAS)
function configurarBarraLateral() {
  // O cabeçalho fica preso no alto, e a barra começa logo abaixo dele
  const topo = $("#portal .topo");
  const medir = () => {
    if (topo.offsetHeight) document.documentElement.style.setProperty("--altura-topo", `${topo.offsetHeight}px`);
  };
  new ResizeObserver(medir).observe(topo);

  // As mesas são esta página: o botão só volta para os personagens, sem recarregar
  $("#barra-mesas").addEventListener("click", (evento) => {
    evento.preventDefault();
    if (!$("#administracao").hidden) mostrarPersonagens();
    const suave = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: suave ? "smooth" : "auto" });
  });

}

/* =================================================================
   Painel de simulação (só na pré-visualização)
   ================================================================= */

function configurarSimulacao() {
  if (!MODO_PREVIA) return;
  $("#dica-teste").hidden = false;
  const seletor = $("#sim-mundo");
  const conectados = $("#sim-conectados");
  seletor.append(new Option("Nenhum", ""));
  seletor.append(new Option("Ode to Sleep", "ode-to-sleep"));
  seletor.append(new Option("Remissão do Flagelo Esvanescente", "remissao-do-flagelo-esvanescente"));

  const aplicar = () => {
    mudarSimulacao({
      online: true,
      trocandoPara: null,
      mundoAtivo: seletor.value || null,
      conectados: Math.max(0, Number(conectados.value) || 0),
    });
    if (!$("#portal").hidden) aplicarStatus({ ...simulacao });
  };
  seletor.addEventListener("change", aplicar);
  conectados.addEventListener("input", aplicar);
  sincronizarPainelSimulacao();
}

function sincronizarPainelSimulacao() {
  if (!MODO_PREVIA) return;
  $("#sim-mundo").value = simulacao.mundoAtivo ?? "";
  $("#sim-conectados").value = simulacao.conectados;
}

/* =================================================================
   Início
   ================================================================= */

async function iniciar() {
  quandoPerderSessao(sessaoExpirada);
  configurarEntrada();
  configurarMinhaConta();
  configurarAdmin();
  configurarBarraLateral();
  configurarSimulacao();
  iniciarCinzas(34);
  $("#botao-sair").addEventListener("click", sair);

  try {
    await api.sessao();
    const destino = destinoDepoisDeEntrar();
    if (destino) return location.replace(destino);
    await abrirPortal();
  } catch {
    mostrarEntrada();
  }
}

iniciar();
