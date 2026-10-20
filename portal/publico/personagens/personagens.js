/* =================================================================
   Crônicas Eternas: Personagens
   -----------------------------------------------------------------
   A galeria de todos os personagens de Draevor: os dos jogadores,
   que têm card na página Mesas, e os NPCs e personagens sem conta
   no portal, cadastrados aqui pelo administrador ou por um editor.
   Os editores alteram qualquer personagem que veem; apagar e
   escolher quem vê ficam com o administrador. Os caídos continuam
   na galeria, como lápides.

   No servidor, conversa com o servidor/personagens.js. Aberta fora
   dele (arquivo no PC ou prévia), usa personagens de exemplo e um
   painel para ver a página como administrador, editor ou jogador.

   Usa o comum.js, carregado antes: pedir(), criar(), avisos, barra
   lateral, status do Foundry, o card com moldura e cinzas. As datas
   vêm do calendario.js, carregado logo depois dele.
   ================================================================= */

const CONFIG = {
  intervaloStatus: 15000, // tempo entre consultas ao estado do Foundry, em ms
};

/* =================================================================
   Conversa com o servidor
   ================================================================= */

// A arte da galeria, separada da capa e da arte do card das Mesas
const CAMPOS_IMAGEM = ["retrato"];

// Os dados vão como JSON; a arte, se houver, vai junto como arquivo (ou como pedido para remover)
function formularioDe(dados) {
  const { imagens, ...resto } = dados;
  const form = new FormData();
  form.append("dados", JSON.stringify(resto));
  for (const campo of CAMPOS_IMAGEM) {
    if (imagens[campo].arquivo) form.append(campo, imagens[campo].arquivo);
    else if (imagens[campo].remover) form.append(`remover_${campo}`, "1");
  }
  return form;
}

const apiDoServidor = {
  galeria: () => pedir("GET", "/api/galeria"),
  estado: () => pedir("GET", "/api/estado", undefined, { silencioso: true }),
  sair: () => pedir("POST", "/api/sair"),
  salvarFicha: (id, dados) => pedir("PUT", caminhoDe("/api/galeria/ficha", id), formularioDe(dados)),
  cadastrar: (dados) => pedir("POST", "/api/galeria/outros", formularioDe(dados)),
  alterar: (id, dados) => pedir("PUT", caminhoDe("/api/galeria/outros", id), formularioDe(dados)),
  apagar: (id) => pedir("DELETE", caminhoDe("/api/galeria/outros", id)),
  // As mesas são as da Administração; aqui mudam só o nome e a cor, como na Linha do Tempo
  salvarMesa: (mesa) => pedir(mesa.id ? "PUT" : "POST", caminhoDe("/api/admin/mesas", mesa.id), mesa),
  apagarMesa: (id) => pedir("DELETE", caminhoDe("/api/admin/mesas", id)),
};

/* =================================================================
   Prévia: um portal de mentira, só na memória do navegador
   ================================================================= */

const CONTAS_DA_PREVIA = {
  admin: { usuario: "mestre", nome: "Mestre", cargo: "admin" },
  editor: { usuario: "takezo", nome: "Takezo", cargo: "editor" },
  jogador: { usuario: "neia", nome: "Neia", cargo: "jogador" },
};

// Guardado como no dados.json do servidor; a galeria() monta o que a página recebe
function exemplosDaPrevia() {
  // Um busto desenhado aqui mesmo, para a prévia mostrar retratos sem depender de arquivos
  const retratoDeExemplo = (fundo, cor) =>
    `data:image/svg+xml,${encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 300"><defs><linearGradient id="f" x1="0" y1="0" x2="0" y2="1">` +
        `<stop offset="0" stop-color="${fundo}"/><stop offset="1" stop-color="#0e0c0b"/></linearGradient></defs>` +
        `<rect width="200" height="300" fill="url(#f)"/><circle cx="100" cy="112" r="34" fill="${cor}"/>` +
        `<path d="M28 300c4-74 36-118 72-118s68 44 72 118z" fill="${cor}"/></svg>`,
    )}`;
  const doPortal = (campos) => ({
    fonte: "gotica",
    retrato: null,
    situacao: "vivo",
    queda: null,
    origem: "",
    resumo: "",
    historia: "",
    ...campos,
  });
  const outro = (campos) => ({
    fonte: "gotica",
    retrato: null,
    papel: "npc",
    jogador: "",
    mesas: [],
    situacao: "vivo",
    queda: null,
    origem: "",
    resumo: "",
    historia: "",
    visibilidade: "todos",
    registradoPor: "mestre",
    registradoNome: "Mestre",
    criadoEm: "2026-10-19T21:00:00.000Z",
    alteradoEm: "2026-10-19T21:00:00.000Z",
    ...campos,
  });
  const ev = (campos) => ({ ate: null, visibilidade: "todos", revelado: false, personagens: [], ...campos });

  return {
    anoAtual: 366, // o ano de hoje em Draevor, o mesmo da prévia da Linha do Tempo
    contas: [
      { usuario: "mestre", nome: "Mestre" },
      { usuario: "comuna", nome: "Comuna" },
      { usuario: "takezo", nome: "Takezo" },
      { usuario: "frati", nome: "Frati" },
      { usuario: "neia", nome: "Neia" },
    ],
    // Todas as mesas; a última não está na página Mesas
    campanhas: [
      { id: "ode-to-sleep", nome: "Ode to Sleep", cor: "#2e3756", naPaginaMesas: true },
      { id: "remissao", nome: "Remissão do Flagelo Esvanescente", cor: "#5a2a26", naPaginaMesas: true },
      { id: "primeira-mesa", nome: "Primeira mesa (exemplo)", cor: "#6b6b45", naPaginaMesas: false },
    ],
    // Os mesmos das campanhas de exemplo da página Mesas
    personagens: [
      doPortal({
        id: "p1",
        nome: "Venti",
        dono: "comuna",
        campanha: "ode-to-sleep",
        fonte: "elfica",
        retrato: retratoDeExemplo("#3a4670", "#9fb0c8"),
        origem: "Meio-elfo, bardo 7",
        resumo: "Bardo errante que toca a noite inteira para a cidade não dormir.",
        historia: "Chegou à cidade com um alaúde rachado e **nenhuma** lembrança de onde veio.\n\nDesde a noite da canção, *não dorme mais*.",
      }),
      doPortal({
        id: "p2",
        nome: "Alisaie",
        dono: "takezo",
        campanha: "ode-to-sleep",
        fonte: "romana",
        retrato: retratoDeExemplo("#6e332d", "#d8b98a"),
        origem: "Elfa, maga 7",
        resumo: "Estudiosa do Ciclo de Sylara, desconfia de toda melodia antiga.",
        historia: "Viu o guardião da ponte cair e jurou descobrir quem canta na torre.",
      }),
      doPortal({
        id: "p3",
        nome: "Personagem de Frati",
        dono: "frati",
        campanha: "ode-to-sleep",
        situacao: "aposentado",
        origem: "Anão, guerreiro 6",
        resumo: "Pendurou o machado depois da canção e abriu uma forja perto do porto.",
      }),
      doPortal({ id: "p4", nome: "Personagem de Neia", dono: "neia", campanha: "ode-to-sleep" }),
      doPortal({
        id: "p5",
        nome: "Personagem de Comuna",
        dono: "comuna",
        campanha: "remissao",
        situacao: "caido",
        origem: "Humano, ladino 5",
        resumo: "Ninguém anotou o dia em que caiu.",
      }),
      doPortal({
        id: "p6",
        nome: "Personagem de Neia",
        dono: "neia",
        campanha: "remissao",
        retrato: retratoDeExemplo("#34503a", "#b9c9a4"),
        origem: "Humana, clériga 5",
        resumo: "Atravessou o Passo Negro carregando os feridos nas costas.",
      }),
    ],
    // NPCs cadastrados aqui na galeria
    outrosPersonagens: [
      outro({
        id: "npc-0a1b2c3d",
        nome: "Ysolde, a Guardiã",
        fonte: "uncial",
        retrato: retratoDeExemplo("#4a5560", "#c8cdd0"),
        mesas: ["primeira-mesa"],
        situacao: "desaparecido",
        origem: "Humana, paladina",
        resumo: "Desceu às ruínas sob o gelo e nunca mais foi vista.",
      }),
      outro({
        id: "npc-1b2c3d4e",
        nome: "Bram, o guardião da ponte",
        fonte: "ferro",
        retrato: retratoDeExemplo("#6b4a2e", "#c9a37a"),
        mesas: ["ode-to-sleep"],
        situacao: "caido",
        queda: {
          data: { ano: 365, mes: 4, dia: 22, aprox: false },
          epitafio: "Ninguém passou pela ponte enquanto ele esteve de pé.",
        },
        origem: "Meio-orc, guerreiro",
        resumo: "Guardou a ponte velha por trinta invernos.",
      }),
      outro({
        id: "npc-2c3d4e5f",
        nome: "Dona Hilda",
        fonte: "caligrafia",
        mesas: ["remissao", "ode-to-sleep"],
        origem: "Halfling, estalajadeira",
        resumo: "Dona da Lanterna Torta; sabe de tudo antes de todo mundo.",
        registradoPor: "takezo",
        registradoNome: "Takezo",
      }),
      outro({
        id: "npc-3d4e5f60",
        nome: "A Voz na Torre",
        fonte: "tinta",
        mesas: ["ode-to-sleep"],
        origem: "Desconhecida",
        resumo: "Canta da torre todas as noites. O grupo ainda não a encontrou.",
        visibilidade: "admin",
      }),
    ],
    // Os acontecimentos da Linha do Tempo (os mesmos da prévia de lá) que citam alguém daqui
    acontecimentos: [
      ev({ id: "e7", titulo: "Ruínas encontradas sob o gelo", data: { ano: 331, mes: 9 }, personagens: ["npc-0a1b2c3d"] }),
      ev({
        id: "e8",
        titulo: "O verdadeiro nome do Flagelo",
        data: { ano: 350, mes: 10, dia: 30 },
        visibilidade: "revelar",
        personagens: ["p6"],
      }),
      ev({ id: "e9", titulo: "O grupo atravessa o Passo Negro", data: { ano: 362, mes: 7, dia: 9 }, personagens: ["p5", "p6"] }),
      ev({
        id: "e11",
        titulo: "A canção que adormece a cidade",
        data: { ano: 365, mes: 2, dia: 15 },
        personagens: ["p1", "p2", "p3", "p4", "npc-3d4e5f60"],
      }),
      ev({
        id: "e10",
        titulo: "A morte do guardião da ponte",
        data: { ano: 365, mes: 4, dia: 22 },
        personagens: ["p2", "npc-1b2c3d4e"],
      }),
      ev({
        id: "e12",
        titulo: "O culto se move antes do inverno",
        data: { ano: 366, mes: 6 },
        visibilidade: "admin",
        personagens: ["p1", "npc-3d4e5f60"],
      }),
    ],
  };
}

function criarApiDePrevia() {
  let banco = exemplosDaPrevia();
  let conta = CONTAS_DA_PREVIA.admin;

  // O mesmo formato do servidor/personagens.js
  const dataPublica = (data, comAprox) => {
    const publica = { ano: data.ano, mes: data.mes || null, dia: data.mes && data.dia ? data.dia : null };
    if (comAprox) publica.aprox = Boolean(data.aprox);
    return publica;
  };
  const podeVer = (ev) =>
    conta.cargo === "admin" || (ev.visibilidade !== "admin" && !(ev.visibilidade === "revelar" && !ev.revelado));
  const podeVerOutro = (p) => conta.cargo === "admin" || p.visibilidade !== "admin";
  // Os editores alteram qualquer personagem que veem, como o administrador
  const podeEditarFicha = (p) => conta.cargo === "admin" || conta.cargo === "editor" || p.dono === conta.usuario;
  const podeEditarOutro = () => conta.cargo === "admin" || conta.cargo === "editor";

  const proibido = () => erroComCodigo("Sua conta não pode fazer isso.", "proibido");
  const semPersonagem = () => erroComCodigo("Esse personagem não existe mais. Recarregue a página.", "nao-encontrado");
  const idAleatorio = () => Array.from(crypto.getRandomValues(new Uint8Array(4)), (b) => b.toString(16).padStart(2, "0")).join("");

  function acharOutro(id) {
    const p = banco.outrosPersonagens.find((x) => x.id === id);
    if (!p || !podeVerOutro(p)) throw semPersonagem();
    return p;
  }

  /* ---------- O que chega do formulário, conferido como no servidor ---------- */

  function textoOpcional(valor, campo, max) {
    const limpo = typeof valor === "string" ? valor.trim() : "";
    if (limpo.length > max) throw erroComCodigo(`O campo ${campo} pode ter no máximo ${max} caracteres.`);
    return limpo;
  }

  function textosDe(dados) {
    return {
      origem: textoOpcional(dados.origem, "Ancestralidade e classe", 80),
      resumo: textoOpcional(dados.resumo, "Resumo", 160).replace(/\s*\n\s*/g, " "),
      historia: textoOpcional(dados.historia, "História", 6000),
    };
  }

  function situacaoDe(dados) {
    const situacao = dados.situacao ?? "vivo";
    if (!Object.hasOwn(ROTULOS_SITUACAO, situacao)) {
      throw erroComCodigo("Escolha a situação: vivo, caído, desaparecido ou aposentado.");
    }
    const bruta = situacao === "caido" ? dados.queda : null;
    if (!bruta) return { situacao, queda: null };
    let data = null;
    if (bruta.data) {
      const { ano, mes, dia } = bruta.data;
      if (!Number.isInteger(ano) || ano < 0 || ano > banco.anoAtual) {
        throw erroComCodigo(`O ano precisa ser um número inteiro de 0 a ${banco.anoAtual}.`);
      }
      data = { ano, mes: mes || null, dia: mes && dia ? dia : null, aprox: false };
    }
    const epitafio = textoOpcional(bruta.epitafio, "Epitáfio", 160);
    return { situacao, queda: data || epitafio ? { data, epitafio } : null };
  }

  // O editor não escolhe quem vê: o que ele cadastra é para todos, e continua como está quando ele altera
  function valoresDoOutro(dados, atual) {
    const nome = typeof dados.nome === "string" ? dados.nome.trim() : "";
    if (!nome) throw erroComCodigo("Preencha o campo Nome.");
    if (nome.length > 60) throw erroComCodigo("O campo Nome pode ter no máximo 60 caracteres.");
    if (!FONTES.some((f) => f.chave === dados.fonte)) throw erroComCodigo("Escolha uma das fontes da lista.");
    if (dados.papel !== "jogador" && dados.papel !== "npc") {
      throw erroComCodigo("Escolha o papel: personagem de jogador ou NPC.");
    }
    const conhecidas = new Set(banco.campanhas.map((m) => m.id));
    let visibilidade = atual?.visibilidade ?? "todos";
    if (conta.cargo === "admin") visibilidade = dados.visibilidade === "admin" ? "admin" : "todos";
    return {
      nome,
      fonte: dados.fonte,
      papel: dados.papel,
      jogador: dados.papel === "jogador" ? textoOpcional(dados.jogador, "Jogador", 40) : "",
      mesas: [...new Set(dados.mesas)].filter((id) => conhecidas.has(id)),
      ...situacaoDe(dados),
      ...textosDe(dados),
      visibilidade,
    };
  }

  // A imagem da prévia vira um endereço temporário do próprio navegador
  function aplicarImagens(p, imagens) {
    for (const campo of CAMPOS_IMAGEM) {
      if (imagens[campo].arquivo instanceof File) p[campo] = URL.createObjectURL(imagens[campo].arquivo);
      else if (imagens[campo].remover) p[campo] = null;
    }
  }

  /* ---------- O formato enviado à página ---------- */

  function fichaPublica(p) {
    const queda =
      p.situacao === "caido" && p.queda
        ? { data: p.queda.data ? dataPublica(p.queda.data, true) : null, epitafio: p.queda.epitafio || "" }
        : null;
    return { situacao: p.situacao, queda, origem: p.origem, resumo: p.resumo, historia: p.historia };
  }

  function personagemDoPortal(p) {
    const nomeDono = banco.contas.find((c) => c.usuario === p.dono)?.nome ?? p.dono;
    return {
      id: p.id,
      origemDoDado: "portal",
      nome: p.nome,
      fonte: p.fonte,
      retrato: p.retrato,
      papel: "jogador",
      jogador: nomeDono,
      dono: p.dono,
      nomeDono,
      mesas: [p.campanha],
      ...fichaPublica(p),
      visibilidade: "todos",
      podeEditar: podeEditarFicha(p),
    };
  }

  function outroPublico(p) {
    return {
      id: p.id,
      origemDoDado: "outro",
      nome: p.nome,
      fonte: p.fonte,
      retrato: p.retrato,
      papel: p.papel,
      jogador: p.jogador,
      mesas: [...p.mesas],
      ...fichaPublica(p),
      visibilidade: p.visibilidade,
      podeEditar: podeEditarOutro(),
    };
  }

  return {
    trocarConta(cargo) {
      conta = CONTAS_DA_PREVIA[cargo] ?? CONTAS_DA_PREVIA.admin;
    },
    restaurar() {
      banco = exemplosDaPrevia();
    },
    async galeria() {
      await esperar(120);
      const personagens = [
        ...banco.personagens.map(personagemDoPortal),
        ...banco.outrosPersonagens.filter(podeVerOutro).map(outroPublico),
      ];
      // Para cada personagem, os acontecimentos que a conta pode ver e que o citam, do mais antigo ao mais recente
      const jornada = Object.fromEntries(personagens.map((p) => [p.id, []]));
      const acontecimentos = banco.acontecimentos.filter(podeVer).sort((a, b) => chaveDaData(a.data) - chaveDaData(b.data));
      for (const ev of acontecimentos) {
        const passo = { id: ev.id, titulo: ev.titulo, data: dataPublica(ev.data, true), ate: ev.ate ? dataPublica(ev.ate, false) : null };
        for (const id of new Set(ev.personagens)) jornada[id]?.push(passo);
      }
      return structuredClone({
        conta: { ...conta },
        mesas: banco.campanhas,
        personagens,
        jornada,
      });
    },
    async estado() {
      return { online: true, mundoAtivo: "ode-to-sleep", conectados: 0, trocandoPara: null };
    },
    async sair() {
      await esperar(100);
      return {};
    },
    // O dono escreve os textos e troca a arte; o administrador e os editores mudam isso em qualquer ficha,
    // e também a situação e a queda
    async salvarFicha(id, dados) {
      await esperar(200);
      const p = banco.personagens.find((x) => x.id === id);
      if (!p) throw semPersonagem();
      if (!podeEditarFicha(p)) throw proibido();
      const valores = textosDe(dados);
      if (conta.cargo === "admin" || conta.cargo === "editor") Object.assign(valores, situacaoDe(dados));
      Object.assign(p, valores);
      aplicarImagens(p, dados.imagens);
      return { ok: true };
    },
    async cadastrar(dados) {
      await esperar(200);
      if (conta.cargo === "jogador") throw proibido();
      const valores = valoresDoOutro(dados, null);
      const ocupados = new Set([...banco.personagens, ...banco.outrosPersonagens].map((p) => p.id));
      let id;
      do id = `npc-${idAleatorio()}`;
      while (ocupados.has(id));
      const quando = new Date().toISOString();
      const p = {
        id,
        ...valores,
        retrato: null,
        registradoPor: conta.usuario,
        registradoNome: conta.nome,
        criadoEm: quando,
        alteradoEm: quando,
      };
      aplicarImagens(p, dados.imagens);
      banco.outrosPersonagens.push(p);
      return { personagem: { id } };
    },
    async alterar(id, dados) {
      await esperar(200);
      const p = acharOutro(id);
      if (!podeEditarOutro()) throw proibido();
      Object.assign(p, valoresDoOutro(dados, p), { alteradoEm: new Date().toISOString() });
      aplicarImagens(p, dados.imagens);
      return { ok: true };
    },
    // Como no servidor: sai também das citações da Linha do Tempo
    async apagar(id) {
      await esperar(200);
      if (conta.cargo !== "admin") throw proibido();
      const p = acharOutro(id);
      banco.outrosPersonagens = banco.outrosPersonagens.filter((x) => x !== p);
      for (const ev of banco.acontecimentos) ev.personagens = ev.personagens.filter((x) => x !== id);
      return { ok: true };
    },
    // Como no servidor/admin.js: só o administrador, a mesa nova fica fora da página Mesas,
    // e criar devolve o id dela
    async salvarMesa(mesa) {
      await esperar(150);
      if (conta.cargo !== "admin") throw proibido();
      const nome = textoOpcional(mesa.nome, "Nome da mesa", 80);
      if (!nome) throw erroComCodigo("Preencha o campo Nome da mesa.");
      if (typeof mesa.cor !== "string" || !/^#[0-9a-f]{6}$/i.test(mesa.cor)) throw erroComCodigo("Escolha uma cor válida.");
      const cor = mesa.cor.toLowerCase();
      if (mesa.id) {
        const atual = banco.campanhas.find((m) => m.id === mesa.id);
        if (!atual) throw erroComCodigo("Essa mesa não existe mais.", "nao-encontrado");
        Object.assign(atual, { nome, cor });
        return { ok: true };
      }
      const ocupados = new Set(banco.campanhas.map((m) => m.id));
      let id;
      do id = `mesa-${idAleatorio()}`;
      while (ocupados.has(id));
      banco.campanhas.push({ id, nome, cor, naPaginaMesas: false });
      return { mesa: { id } };
    },
    // Como no servidor: a mesa com personagens do portal fica; as outras saem também dos
    // outros personagens (os acontecimentos da prévia não citam mesas)
    async apagarMesa(id) {
      await esperar(150);
      if (conta.cargo !== "admin") throw proibido();
      if (!banco.campanhas.some((m) => m.id === id)) throw erroComCodigo("Essa mesa não existe mais.", "nao-encontrado");
      if (banco.personagens.some((p) => p.campanha === id)) {
        throw erroComCodigo("Essa mesa ainda tem personagens. Exclua os personagens ou mova para outra mesa antes.");
      }
      banco.campanhas = banco.campanhas.filter((m) => m.id !== id);
      for (const p of banco.outrosPersonagens) p.mesas = p.mesas.filter((m) => m !== id);
      return { ok: true };
    },
  };
}

const api = MODO_PREVIA ? criarApiDePrevia() : apiDoServidor;

/* =================================================================
   Estado e utilidades
   ================================================================= */

const estado = {
  conta: null,
  mesas: [],
  personagens: [],
  jornada: {},
  filtros: { mesas: new Set(), papel: "", situacao: "", busca: "" },
};

const ehAdmin = () => estado.conta?.cargo === "admin";
const ehEditor = () => estado.conta?.cargo === "editor";
const podeCadastrar = () => ehAdmin() || ehEditor();

const mesaPorId = (id) => estado.mesas.find((m) => m.id === id);
const personagemPorId = (id) => estado.personagens.find((p) => p.id === id);

// A sigla da mesa, só desta página e sem nada guardado: de cada palavra, o primeiro caractere
// que for letra ou número, como está escrito. "Primeira mesa (exemplo)" vira "Pme".
function siglaDe(nome) {
  return nome
    .split(/\s+/)
    .map((palavra) => palavra.match(/[\p{L}\p{N}]/u)?.[0] ?? "")
    .join("");
}

// "Ode to Sleep [OtS]"
function nomeCompletoDe(nome) {
  const sigla = siglaDe(nome);
  return sigla ? `${nome} [${sigla}]` : nome;
}

const ROTULOS_SITUACAO = { vivo: "vivo", caido: "caído", desaparecido: "desaparecido", aposentado: "aposentado" };

// Na galeria: vivos primeiro; depois desaparecidos e aposentados; por último os caídos
const GRUPO_DA_SITUACAO = { vivo: 0, desaparecido: 1, aposentado: 1, caido: 2 };

// Sem mesa, o card sem capa fica na pedra escura
const COR_SEM_MESA = "#2a2520";

/* =================================================================
   Cabeçalho: conta e estado do Foundry
   ================================================================= */

function atualizarTopo() {
  $("#nome-conta").textContent = estado.conta?.nome ?? "";
  const cargo = $("#cargo-conta");
  cargo.hidden = !podeCadastrar();
  cargo.textContent = ehAdmin() ? "administrador" : "editor";
}

async function atualizarStatus() {
  let situacao;
  try {
    situacao = await api.estado();
  } catch {
    situacao = { online: false };
  }
  mostrarStatus(situacao, (mundo) => mesaPorId(mundo)?.nome ?? mundo);
}

/* =================================================================
   Filtros
   ================================================================= */

const filtrosAtivos = () => {
  const f = estado.filtros;
  return f.mesas.size + (f.papel ? 1 : 0) + (f.situacao ? 1 : 0) + (f.busca.trim() ? 1 : 0);
};

function passaNosFiltros(personagem) {
  const f = estado.filtros;
  if (f.mesas.size && !personagem.mesas.some((id) => f.mesas.has(id))) return false;
  if (f.papel && personagem.papel !== f.papel) return false;
  if (f.situacao && personagem.situacao !== f.situacao) return false;
  const termo = normalizar(f.busca.trim());
  return !termo || normalizar(`${personagem.nome} ${personagem.resumo}`).includes(termo);
}

// Pela situação e, dentro de cada grupo, pelo nome
function ordenar(a, b) {
  const grupo = (GRUPO_DA_SITUACAO[a.situacao] ?? 0) - (GRUPO_DA_SITUACAO[b.situacao] ?? 0);
  return grupo || a.nome.localeCompare(b.nome, "pt-BR");
}

const personagensVisiveis = () => estado.personagens.filter(passaNosFiltros).sort(ordenar);

function renderizarFiltros() {
  const f = estado.filtros;

  // Mesas: na ordem da lista; as que sumiram saem do filtro
  for (const id of [...f.mesas]) if (!mesaPorId(id)) f.mesas.delete(id);
  const grupo = $("#filtro-mesas");
  grupo.hidden = estado.mesas.length === 0;
  grupo.replaceChildren(
    ...estado.mesas.map((mesa) => {
      const chip = criar("button", "etiqueta-mesa", nomeCompletoDe(mesa.nome));
      chip.type = "button";
      chip.dataset.id = mesa.id;
      chip.style.setProperty("--cor", corVisivel(mesa.cor));
      chip.setAttribute("aria-pressed", String(f.mesas.has(mesa.id)));
      chip.addEventListener("click", () => {
        if (f.mesas.has(mesa.id)) f.mesas.delete(mesa.id);
        else f.mesas.add(mesa.id);
        aplicarFiltros();
      });
      return chip;
    }),
  );

  for (const opcao of document.querySelectorAll('#filtro-papel input[name="papel"]')) opcao.checked = opcao.value === f.papel;
  for (const opcao of document.querySelectorAll('#filtro-situacao input[name="situacao"]')) {
    opcao.checked = opcao.value === f.situacao;
  }
  $("#filtro-busca").value = f.busca;
}

function aplicarFiltros() {
  const ativos = filtrosAtivos();
  $("#limpar-filtros").hidden = ativos === 0;
  const contador = $("#filtros-contador");
  contador.hidden = ativos === 0;
  contador.textContent = String(ativos);
  for (const chip of document.querySelectorAll("#filtro-mesas .etiqueta-mesa")) {
    chip.setAttribute("aria-pressed", String(estado.filtros.mesas.has(chip.dataset.id)));
  }
  renderizarGaleria();
}

function limparFiltros() {
  const f = estado.filtros;
  f.mesas.clear();
  f.papel = "";
  f.situacao = "";
  f.busca = "";
  renderizarFiltros();
  aplicarFiltros();
}

/* =================================================================
   A galeria
   ================================================================= */

// Na ficha, o nome completo. Abaixo do card, só a sigla; o nome completo fica no title e para leitores de tela.
function etiquetaMesa(mesa, { curta = false } = {}) {
  const completo = nomeCompletoDe(mesa.nome);
  const etiqueta = criar("span", "etiqueta-cor", curta ? null : completo);
  etiqueta.style.setProperty("--cor", corVisivel(mesa.cor));
  if (curta) {
    const sigla = criar("span", null, siglaDe(mesa.nome) || mesa.nome);
    sigla.setAttribute("aria-hidden", "true");
    etiqueta.title = completo;
    etiqueta.append(sigla, criar("span", "sr", completo));
  }
  return etiqueta;
}

function seloOculto() {
  const selo = criar("span", "selo-oculto");
  selo.append(simbolo("icone-oculto"), "Só o administrador");
  return selo;
}

// Para leitores de tela, o que a cor e a névoa mostram
function rotuloDoCard(personagem) {
  const partes = [personagem.nome];
  if (personagem.situacao === "caido" && personagem.queda?.data) {
    partes.push(`caiu em ${textoDaData(personagem.queda.data)}`);
  } else if (personagem.situacao !== "vivo") {
    partes.push(ROTULOS_SITUACAO[personagem.situacao] ?? personagem.situacao);
  }
  if (personagem.visibilidade === "admin") partes.push("só o administrador vê");
  return partes.join(", ");
}

// O card das Mesas, na cor da primeira mesa, com o retrato como capa e sem arte recortada;
// abaixo dele, o resumo e as mesas
function montarItem(personagem) {
  const mesas = personagem.mesas.map(mesaPorId).filter(Boolean);
  const item = criar("article", "personagem");
  item.dataset.id = personagem.id;

  const { nome, fonte, retrato } = personagem;
  const card = montarCardComMoldura({ nome, fonte, capa: retrato }, { cor: mesas[0]?.cor ?? COR_SEM_MESA });
  if (personagem.situacao === "caido") {
    card.classList.add("card--caido");
    if (personagem.queda?.data) {
      card.querySelector(".card__nome").after(criar("span", "card__queda", `Caiu em ${textoDaData(personagem.queda.data)}`));
    }
  }
  // A névoa fica dentro da moldura, para acompanhá-la e ser recortada pelos cantos
  if (personagem.situacao === "desaparecido") {
    card.classList.add("card--desaparecido");
    card.querySelector(".card__moldura").append(criar("span", "card__nevoa"));
  }
  if (personagem.visibilidade === "admin") card.classList.add("card--oculto");
  card.setAttribute("aria-label", rotuloDoCard(personagem));
  card.addEventListener("click", () => abrirFicha(personagem.id));
  item.append(card);

  if (personagem.resumo) item.append(criar("p", "personagem__resumo", personagem.resumo));
  const etiquetas = criar("div", "personagem__mesas");
  etiquetas.append(...mesas.map((mesa) => etiquetaMesa(mesa, { curta: true })));
  if (personagem.visibilidade === "admin") etiquetas.append(seloOculto());
  if (etiquetas.childElementCount) item.append(etiquetas);
  return item;
}

function renderizarGaleria() {
  const galeria = $("#galeria");
  const visiveis = personagensVisiveis();
  galeria.classList.toggle("galeria--vazia", visiveis.length === 0);
  if (!visiveis.length) {
    const texto = estado.personagens.length ? "Nenhum personagem com esses filtros." : "A galeria ainda não tem personagens.";
    galeria.replaceChildren(criar("p", "galeria-vazia", texto));
    return;
  }
  galeria.replaceChildren(...visiveis.map(montarItem));
}

/* =================================================================
   A ficha aberta
   ================================================================= */

const ROTULOS_PAPEL = { jogador: "Personagem de jogador", npc: "NPC" };

const comMaiuscula = (texto) => texto.charAt(0).toUpperCase() + texto.slice(1);

function secaoDaFicha(titulo, ...conteudo) {
  const caixa = criar("section", "ficha__secao");
  caixa.append(criar("h3", null, titulo), ...conteudo);
  return caixa;
}

// O retrato preenche a coluna da esquerda. Sem ele, a ficha fica numa coluna só.
function retratoDaFicha(personagem, cor) {
  if (!personagem.retrato) return null;
  const retrato = criar("div", "ficha__retrato");
  retrato.style.setProperty("--cor", cor);
  const img = imagem(personagem.retrato);
  img.addEventListener(
    "error",
    () => {
      // A ficha já pode ter sido trocada por outra
      if (!retrato.isConnected) return;
      retrato.remove();
      $("#ficha-conteudo").classList.add("ficha--sem-retrato");
    },
    { once: true },
  );
  retrato.append(img);
  return retrato;
}

// Jogador, mesas, situação e ancestralidade, um abaixo do outro
function dadosDaFicha(personagem, mesas) {
  const lista = criar("dl", "ficha__dados");
  const linha = (rotulo, ...valor) => {
    const dd = criar("dd");
    dd.append(...valor);
    lista.append(criar("dt", null, rotulo), dd);
  };
  if (personagem.jogador) linha("Jogador", personagem.jogador);
  if (mesas.length) {
    const etiquetas = criar("span", "ficha__mesas");
    etiquetas.append(...mesas.map((mesa) => etiquetaMesa(mesa)));
    linha(mesas.length > 1 ? "Mesas" : "Mesa", etiquetas);
  }
  linha("Situação", comMaiuscula(ROTULOS_SITUACAO[personagem.situacao] ?? personagem.situacao));
  if (personagem.origem) linha("Ancestralidade e classe", personagem.origem);
  return lista;
}

// A data por extenso e o epitáfio
function quedaDaFicha(queda) {
  if (!queda || (!queda.data && !queda.epitafio)) return null;
  const partes = [];
  if (queda.data) partes.push(criar("p", "ficha__queda-data", textoDaData(queda.data, { extenso: true })));
  if (queda.epitafio) partes.push(criar("blockquote", "ficha__epitafio", `“${queda.epitafio}”`));
  return secaoDaFicha("A queda", ...partes);
}

// Os acontecimentos que citam o personagem, do mais antigo ao mais recente (o servidor já manda nessa ordem)
function jornadaDaFicha(personagem) {
  const passos = estado.jornada[personagem.id] ?? [];
  if (!passos.length) return criar("p", "ficha__nota", "Nenhum acontecimento da Linha do Tempo cita este personagem ainda.");
  const linha = enderecoDaPagina("linha");
  const lista = criar("ol", "jornada");
  for (const passo of passos) {
    const link = criar("a", "jornada__link");
    link.href = `${linha}#evento-${encodeURIComponent(passo.id)}`;
    link.append(criar("span", "jornada__data", textoDoPeriodo(passo)), criar("span", "jornada__titulo", passo.titulo));
    const item = criar("li", "jornada__passo");
    item.append(link);
    lista.append(item);
  }
  return lista;
}

function abrirFicha(id) {
  const personagem = personagemPorId(id);
  if (!personagem) return;
  const dialogo = $("#dialogo-ficha");
  const conteudo = $("#ficha-conteudo");
  const mesas = personagem.mesas.map(mesaPorId).filter(Boolean);
  const partes = [];

  const retrato = retratoDaFicha(personagem, mesas[0]?.cor ?? COR_SEM_MESA);
  if (retrato) partes.push(retrato);
  conteudo.classList.toggle("ficha--sem-retrato", !retrato);
  conteudo.classList.toggle("ficha--caido", personagem.situacao === "caido");

  const corpo = criar("div", "ficha__corpo");
  const cabeca = criar("div", "ficha__cabeca");
  cabeca.append(criar("span", "ficha__papel", ROTULOS_PAPEL[personagem.papel] ?? personagem.papel));
  if (personagem.visibilidade === "admin") cabeca.append(seloOculto());
  if (personagem.podeEditar) {
    const lapis = criar("button", "botao botao-icone ficha__lapis");
    lapis.type = "button";
    lapis.title = "Alterar";
    lapis.setAttribute("aria-label", `Alterar ${personagem.nome}`);
    lapis.append(simbolo("icone-lapis"));
    lapis.addEventListener("click", () => abrirEdicao(personagem));
    cabeca.append(lapis);
  }
  const nome = criar("h2", "ficha__nome", personagem.nome);
  nome.id = "ficha-nome";
  aplicarFonte(nome, personagem.fonte);
  corpo.append(cabeca, nome, dadosDaFicha(personagem, mesas));

  if (personagem.resumo) corpo.append(criar("p", "ficha__resumo", personagem.resumo));
  if (personagem.historia) {
    const historia = criar("div", "ficha__historia");
    historia.append(...paragrafosDe(personagem.historia));
    corpo.append(secaoDaFicha("História", historia));
  }
  if (personagem.situacao === "caido") {
    const queda = quedaDaFicha(personagem.queda);
    if (queda) corpo.append(queda);
  }
  corpo.append(secaoDaFicha("Na Linha do Tempo", jornadaDaFicha(personagem)));

  const acoes = criar("div", "ficha__acoes");
  acoes.append(
    botao("Copiar link", "botao--leve espaco", () => copiarLink(personagem)),
    botao("Fechar", "botao--leve", () => dialogo.close()),
  );

  const texto = criar("div", "ficha__texto");
  texto.append(corpo, acoes);
  partes.push(texto);

  conteudo.replaceChildren(...partes);
  trocarEndereco(`#personagem-${personagem.id}`);
  if (!dialogo.open) dialogo.showModal();
  dialogo.scrollTop = 0;
}

async function copiarLink(personagem) {
  const link = `${location.origin}${location.pathname}#personagem-${personagem.id}`;
  try {
    await navigator.clipboard.writeText(link);
    avisoRapido("Link copiado. Quem abrir vai direto nesta ficha.");
  } catch {
    avisoRapido(link);
  }
}

// Coloca (ou tira) a ficha aberta no endereço da página, para o link funcionar
function trocarEndereco(ancora) {
  try {
    history.replaceState(null, "", ancora || location.pathname + location.search);
  } catch {
    // dentro de alguns quadros de prévia, o navegador não deixa mudar o endereço
  }
}

/* =================================================================
   Cadastrar e alterar
   -----------------------------------------------------------------
   Um formulário só, com os campos que a conta pode mudar. Nos
   personagens do portal, nome e fonte continuam no "Personalizar"
   das Mesas; o dono escreve os textos e troca a arte, e só o
   administrador muda a situação e a queda.
   ================================================================= */

const edicao = {
  personagem: null, // o personagem sendo alterado, ou null para um novo
  mesas: new Set(),
  remover: { retrato: false },
};

const formEdicao = () => $("#form-edicao");

function opcoesDeMes(seletor, valor) {
  seletor.replaceChildren(new Option("Sem mês", ""), ...MESES.map((mes, i) => new Option(mes, String(i + 1))));
  seletor.value = valor ? String(valor) : "";
}

function opcoesDeDia(seletor, valor) {
  seletor.replaceChildren(new Option("Sem dia", ""));
  for (let dia = 1; dia <= 30; dia++) seletor.append(new Option(String(dia), String(dia)));
  seletor.value = valor ? String(valor) : "";
}

// As mesas na ordem da lista, como no filtro; no fim, o "+ Mesa" do administrador
function renderizarEscolhaMesas() {
  const raiz = $("#escolha-mesas");
  const itens = estado.mesas.map((mesa) => {
    const chip = criar("button", "etiqueta-mesa", nomeCompletoDe(mesa.nome));
    chip.type = "button";
    chip.style.setProperty("--cor", corVisivel(mesa.cor));
    chip.setAttribute("aria-pressed", String(edicao.mesas.has(mesa.id)));
    chip.addEventListener("click", () => {
      if (edicao.mesas.has(mesa.id)) edicao.mesas.delete(mesa.id);
      else edicao.mesas.add(mesa.id);
      chip.setAttribute("aria-pressed", String(edicao.mesas.has(mesa.id)));
    });
    return chip;
  });
  if (!estado.mesas.length) itens.push(criar("p", "escolhas__vazio", "Nenhuma mesa cadastrada ainda."));
  if (ehAdmin()) {
    const mais = botao("+ Mesa", "botao--leve escolhas__mais", abrirNovaMesa);
    mais.setAttribute("aria-controls", "nova-mesa");
    mais.setAttribute("aria-expanded", String(!$("#nova-mesa").hidden));
    itens.push(mais);
  }
  raiz.replaceChildren(...itens);
}

// A sigla aparece abaixo do nome da mesa enquanto se digita
function mostrarSigla(entrada, saida) {
  const sigla = siglaDe(entrada.value);
  saida.textContent = sigla ? `Sigla: ${sigla}` : "";
}

// "+ Mesa": nome, cor e "Adicionar", ali mesmo, abaixo das mesas
function abrirNovaMesa() {
  const form = formEdicao();
  if ($("#nova-mesa").hidden) {
    form.mesa_nome.value = "";
    form.mesa_cor.value = "#6b5a45";
    mostrarSigla(form.mesa_nome, $("#nova-mesa-sigla"));
    $("#erro-nova-mesa").hidden = true;
    $("#nova-mesa").hidden = false;
    renderizarEscolhaMesas();
  }
  form.mesa_nome.focus();
}

function fecharNovaMesa() {
  $("#nova-mesa").hidden = true;
  renderizarEscolhaMesas();
  $("#escolha-mesas .escolhas__mais")?.focus();
}

// A mesa nova vai para o servidor, entra na lista e já fica marcada; o resto do formulário fica como está
async function adicionarMesa() {
  const form = formEdicao();
  const erro = $("#erro-nova-mesa");
  const adicionar = $("#nova-mesa-adicionar");
  if (adicionar.disabled) return;
  erro.hidden = true;
  adicionar.disabled = true;
  try {
    const { mesa } = await api.salvarMesa({ nome: form.mesa_nome.value.trim(), cor: form.mesa_cor.value });
    edicao.mesas.add(mesa.id);
    await recarregar();
    fecharNovaMesa();
    avisoRapido("Mesa adicionada.");
  } catch (falha) {
    erro.textContent = falha.message;
    erro.hidden = false;
  } finally {
    adicionar.disabled = false;
  }
}

// O nome aparece na fonte escolhida enquanto se escreve
function mostrarFonte() {
  const form = formEdicao();
  carregarFontes([form.fonte.value]);
  aplicarFonte(form.nome, form.fonte.value);
}

// O jogador só vale para personagens de jogador; a data e o epitáfio, só para os caídos
function mostrarCamposDependentes() {
  const form = formEdicao();
  $("#campo-jogador").hidden = form.papel.value !== "jogador";
  $("#grupo-queda").hidden = $("#grupo-situacao").hidden || form.situacao.value !== "caido";
}

function mostrarImagem(campo, src) {
  const caixa = $(`#imagem-${campo}`);
  caixa.hidden = !src;
  if (src) caixa.querySelector("img").src = src;
}

function abrirEdicao(personagem = null) {
  if (personagem ? !personagem.podeEditar : !podeCadastrar()) return;
  const form = formEdicao();
  form.reset();
  edicao.personagem = personagem;
  edicao.mesas = new Set(personagem?.mesas ?? []);
  edicao.remover = { retrato: false };
  $("#erro-edicao").hidden = true;
  $("#nova-mesa").hidden = true;

  const doPortal = personagem?.origemDoDado === "portal";
  $("#edicao-titulo").textContent = personagem ? `Alterar ${personagem.nome}` : "Novo personagem";
  $("#edicao-enviar").textContent = personagem ? "Salvar" : "Cadastrar";
  const aviso = $("#edicao-aviso");
  aviso.hidden = !doPortal;
  aviso.textContent = doPortal ? "O nome e a fonte deste personagem mudam na página Mesas." : "";

  // Quais campos aparecem
  for (const grupo of ["#grupo-nome", "#grupo-papel", "#grupo-mesas"]) $(grupo).hidden = doPortal;
  $("#grupo-situacao").hidden = doPortal && !ehAdmin() && !ehEditor();
  $("#grupo-visibilidade").hidden = doPortal || !ehAdmin();
  $("#edicao-apagar").hidden = !personagem || doPortal || !ehAdmin();

  // Nome, fonte, papel e mesas: só os outros personagens
  form.nome.value = personagem?.nome ?? "";
  form.fonte.replaceChildren(...FONTES.map((f) => new Option(f.rotulo, f.chave)));
  form.fonte.value = personagem?.fonte ?? FONTES[0].chave;
  mostrarFonte();
  form.papel.value = personagem?.papel ?? "npc";
  form.jogador.value = personagem?.jogador ?? "";
  renderizarEscolhaMesas();

  // Situação e queda
  form.situacao.value = personagem?.situacao ?? "vivo";
  const queda = personagem?.queda;
  form.queda_ano.value = queda?.data ? String(queda.data.ano) : "";
  opcoesDeMes(form.queda_mes, queda?.data?.mes);
  opcoesDeDia(form.queda_dia, queda?.data?.dia);
  form.epitafio.value = queda?.epitafio ?? "";
  mostrarCamposDependentes();

  // Textos, arte e visibilidade
  form.origem.value = personagem?.origem ?? "";
  form.resumo.value = personagem?.resumo ?? "";
  form.historia.value = personagem?.historia ?? "";
  for (const campo of CAMPOS_IMAGEM) mostrarImagem(campo, personagem?.[campo]);
  form.visibilidade.value = personagem?.visibilidade ?? "todos";

  $("#dialogo-edicao").showModal();
  $(".edicao__campos").scrollTop = 0;
  (doPortal ? form.origem : form.nome).focus();
}

// A situação e, para os caídos, a queda: a data (só o ano é obrigatório) e o epitáfio
function situacaoDoFormulario() {
  const form = formEdicao();
  const situacao = form.situacao.value;
  if (situacao !== "caido") return { situacao, queda: null };
  const mes = Number(form.queda_mes.value) || null;
  let data = null;
  if (form.queda_ano.value !== "") {
    const ano = Number(form.queda_ano.value);
    if (!Number.isInteger(ano) || ano < 0) throw new Error("O ano da queda precisa ser um número inteiro, de 0 em diante.");
    data = { ano, mes, dia: mes ? Number(form.queda_dia.value) || null : null };
  } else if (mes) {
    throw new Error("Escreva o ano da queda, ou deixe o mês em branco.");
  }
  const epitafio = form.epitafio.value.trim();
  return { situacao, queda: data || epitafio ? { data, epitafio } : null };
}

function coletarEdicao() {
  const form = formEdicao();
  const imagens = {};
  for (const campo of CAMPOS_IMAGEM) {
    const arquivo = form[campo].files[0] ?? null;
    imagens[campo] = { arquivo, remover: edicao.remover[campo] && !arquivo };
  }
  const dados = {
    origem: form.origem.value.trim(),
    resumo: form.resumo.value.trim(),
    historia: form.historia.value.trim(),
    imagens,
  };
  if (!$("#grupo-situacao").hidden) Object.assign(dados, situacaoDoFormulario());
  if (edicao.personagem?.origemDoDado === "portal") return dados;

  const nome = form.nome.value.trim();
  if (!nome) throw new Error("Escreva o nome do personagem.");
  return {
    ...dados,
    nome,
    fonte: form.fonte.value,
    papel: form.papel.value,
    jogador: form.papel.value === "jogador" ? form.jogador.value.trim() : "",
    mesas: [...edicao.mesas],
    visibilidade: ehAdmin() ? form.visibilidade.value : "todos",
  };
}

async function enviarEdicao(evento) {
  evento.preventDefault();
  const erro = $("#erro-edicao");
  const enviar = $("#edicao-enviar");
  erro.hidden = true;
  let dados;
  try {
    dados = coletarEdicao();
  } catch (falha) {
    erro.textContent = falha.message;
    erro.hidden = false;
    return;
  }
  enviar.disabled = true;
  try {
    const personagem = edicao.personagem;
    if (!personagem) await api.cadastrar(dados);
    else if (personagem.origemDoDado === "portal") await api.salvarFicha(personagem.id, dados);
    else await api.alterar(personagem.id, dados);
    $("#dialogo-edicao").close();
    await recarregar();
    avisoRapido(personagem ? "Ficha salva." : "Personagem cadastrado.");
    // Alterado pela ficha: ela mostra o que acabou de mudar
    if (personagem && $("#dialogo-ficha").open && personagemPorId(personagem.id)) abrirFicha(personagem.id);
  } catch (falha) {
    erro.textContent = falha.message;
    erro.hidden = false;
  } finally {
    enviar.disabled = false;
  }
}

async function apagarPersonagem() {
  const personagem = edicao.personagem;
  if (!personagem) return;
  const confirmado = await perguntar({
    titulo: "Apagar este personagem?",
    texto: `${personagem.nome} sai da galeria de vez, com a arte, e some das citações da Linha do Tempo.`,
    confirmar: "Apagar",
    cancelar: "Cancelar",
    perigo: true,
  });
  if (!confirmado) return;
  try {
    await api.apagar(personagem.id);
    $("#dialogo-edicao").close();
    $("#dialogo-ficha").close();
    await recarregar();
    avisoRapido("Personagem apagado.");
  } catch (falha) {
    avisarFalha(falha);
  }
}

function configurarEdicao() {
  const form = formEdicao();
  form.addEventListener("submit", enviarEdicao);
  $("#edicao-cancelar").addEventListener("click", () => $("#dialogo-edicao").close());
  $("#edicao-apagar").addEventListener("click", apagarPersonagem);
  form.fonte.addEventListener("change", mostrarFonte);
  // A linha do "+ Mesa" está dentro deste formulário: o Enter nela adiciona a mesa, sem enviar o personagem
  form.mesa_nome.addEventListener("input", () => mostrarSigla(form.mesa_nome, $("#nova-mesa-sigla")));
  form.mesa_nome.addEventListener("keydown", (evento) => {
    if (evento.key !== "Enter") return;
    evento.preventDefault();
    adicionarMesa();
  });
  $("#nova-mesa-adicionar").addEventListener("click", adicionarMesa);
  $("#nova-mesa-cancelar").addEventListener("click", fecharNovaMesa);
  form.addEventListener("change", (evento) => {
    if (evento.target.name === "papel" || evento.target.name === "situacao") mostrarCamposDependentes();
  });
  for (const campo of CAMPOS_IMAGEM) {
    form[campo].addEventListener("change", () => {
      const arquivo = form[campo].files[0];
      if (!arquivo) return;
      mostrarImagem(campo, URL.createObjectURL(arquivo));
      edicao.remover[campo] = false;
    });
    $(`#imagem-${campo} button`).addEventListener("click", () => {
      form[campo].value = "";
      edicao.remover[campo] = true;
      mostrarImagem(campo, null);
    });
  }
}

/* =================================================================
   Mesas
   -----------------------------------------------------------------
   Todas as mesas do portal, mas só o nome e a cor; o resto fica na
   Administração. Só o administrador cria, altera e apaga. O painel
   é uma cópia do da Linha do Tempo, contando os personagens em vez
   dos acontecimentos.
   ================================================================= */

function campoTexto(rotulo, nome, valor = "", { tipo = "text", ajuda = "", max } = {}) {
  const campo = criar("label", "campo");
  const entrada = criar("input");
  entrada.name = nome;
  entrada.type = tipo;
  entrada.value = valor;
  entrada.autocomplete = "off";
  if (max) entrada.maxLength = max;
  campo.append(criar("span", "campo__rotulo", rotulo), entrada);
  if (ajuda) campo.append(criar("span", "campo__ajuda", ajuda));
  return campo;
}

function abrirMesas(emEdicao = null) {
  const raiz = $("#painel-conteudo");
  raiz.replaceChildren(
    criar(
      "p",
      "painel__texto",
      "Todas as mesas do portal. Aqui mudam só o nome e a cor. Mundo do Foundry, imagens e a página Mesas ficam em Administração, na aba Mesas.",
    ),
  );
  const lista = criar("div", "painel__lista");
  if (!estado.mesas.length) lista.append(criar("p", "painel__texto", "Nenhuma mesa ainda."));
  for (const mesa of estado.mesas) {
    const personagens = estado.personagens.filter((p) => p.mesas.includes(mesa.id)).length;
    const detalhe = personagens === 1 ? "1 personagem" : `${personagens} personagens`;
    const item = criar("div", "painel__item");
    const ponto = criar("span", "ponto-cor");
    ponto.style.setProperty("--cor", corVisivel(mesa.cor));
    const acoes = criar("div", "painel__acoes");
    acoes.append(
      botao("Alterar", "botao--leve", () => abrirMesas(mesa)),
      botao("Apagar", "botao--leve botao--perigo", async () => {
        const confirmado = await perguntar({
          titulo: "Apagar esta mesa?",
          texto: `“${mesa.nome}” sai da lista, dos personagens e das citações na Linha do Tempo.`,
          confirmar: "Apagar",
          cancelar: "Cancelar",
          perigo: true,
        });
        if (!confirmado) return abrirMesas();
        try {
          await api.apagarMesa(mesa.id);
          await recarregar();
          avisoRapido("Mesa apagada.");
        } catch (falha) {
          // Uma mesa com personagens do portal não sai: o servidor explica
          await avisarFalha(falha);
        }
        abrirMesas();
      }),
    );
    item.append(
      ponto,
      criar("span", "painel__nome", nomeCompletoDe(mesa.nome)),
      criar("span", "painel__detalhe", mesa.naPaginaMesas ? `${detalhe} · na página Mesas` : detalhe),
      acoes,
    );
    lista.append(item);
  }
  raiz.append(lista);

  const form = criar("form", "painel__form");
  form.noValidate = true;
  const campoNome = campoTexto("Nome da mesa", "nome", emEdicao?.nome ?? "", { max: 80 });
  const sigla = criar("span", "campo__ajuda campo__sigla");
  campoNome.append(sigla);
  const campoCor = campoTexto("Cor", "cor", emEdicao?.cor ?? "#6b5a45", { tipo: "color" });
  const erro = criar("p", "mensagem-erro");
  erro.hidden = true;
  const salvar = criar("button", "botao botao--principal botao--pequeno", emEdicao ? "Salvar" : "Adicionar mesa");
  salvar.type = "submit";
  const linha = criar("div", "painel__linha painel__linha--sigla");
  linha.append(campoNome, campoCor, salvar);
  form.append(criar("h3", "painel__form-titulo", emEdicao ? `Alterar ${emEdicao.nome}` : "Nova mesa"), linha, erro);
  if (emEdicao) form.append(botao("Cancelar a alteração", "botao--leve", () => abrirMesas()));
  form.nome.addEventListener("input", () => mostrarSigla(form.nome, sigla));
  mostrarSigla(form.nome, sigla);
  form.addEventListener("submit", async (evento) => {
    evento.preventDefault();
    salvar.disabled = true;
    try {
      await api.salvarMesa({ id: emEdicao?.id, nome: form.nome.value.trim(), cor: form.cor.value });
      await recarregar();
      abrirMesas();
      avisoRapido(emEdicao ? "Mesa alterada." : "Mesa adicionada.");
    } catch (falha) {
      erro.textContent = falha.message;
      erro.hidden = false;
    } finally {
      salvar.disabled = false;
    }
  });
  raiz.append(form);

  const dialogo = $("#dialogo-painel");
  if (!dialogo.open) dialogo.showModal();
}

/* =================================================================
   Carregar e desenhar tudo
   ================================================================= */

function renderizarAcoes() {
  $("#botao-mesas").hidden = !ehAdmin();
  $("#botao-novo").hidden = !podeCadastrar();
}

function renderizarTudo() {
  atualizarTopo();
  renderizarAcoes();
  renderizarFiltros();
  aplicarFiltros();
}

async function recarregar() {
  const dados = await api.galeria();
  Object.assign(estado, {
    conta: dados.conta,
    mesas: dados.mesas,
    personagens: dados.personagens,
    jornada: dados.jornada,
  });
  carregarFontes(estado.personagens.map((p) => p.fonte));
  renderizarTudo();
}

/* =================================================================
   Eventos da página
   ================================================================= */

// O cabeçalho fica preso no alto; a barra lateral precisa saber o tamanho dele
function medirAlturas() {
  const aplicar = () => document.documentElement.style.setProperty("--altura-topo", `${$("#topo").offsetHeight}px`);
  new ResizeObserver(aplicar).observe($("#topo"));
  aplicar();
}

function configurarEventos() {
  $("#filtro-papel").addEventListener("change", (evento) => {
    estado.filtros.papel = evento.target.value;
    aplicarFiltros();
  });
  $("#filtro-situacao").addEventListener("change", (evento) => {
    estado.filtros.situacao = evento.target.value;
    aplicarFiltros();
  });
  let timerBusca;
  $("#filtro-busca").addEventListener("input", (evento) => {
    clearTimeout(timerBusca);
    timerBusca = setTimeout(() => {
      estado.filtros.busca = evento.target.value;
      aplicarFiltros();
    }, 160);
  });
  $("#limpar-filtros").addEventListener("click", limparFiltros);
  $("#filtros-alternar").addEventListener("click", () => {
    const aberto = $("#filtros").classList.toggle("filtros--aberto");
    $("#filtros-alternar").setAttribute("aria-expanded", String(aberto));
  });

  $("#botao-novo").addEventListener("click", () => abrirEdicao());
  $("#botao-mesas").addEventListener("click", () => abrirMesas());
  fecharAoClicarFora($("#dialogo-painel"));
  $("#painel-fechar").addEventListener("click", () => $("#dialogo-painel").close());

  fecharAoClicarFora($("#dialogo-ficha"));
  $("#dialogo-ficha").addEventListener("close", () => {
    if (location.hash.startsWith("#personagem-")) trocarEndereco("");
  });

  $("#botao-sair").addEventListener("click", async () => {
    if (MODO_PREVIA) return avisoRapido("Na prévia, sair não faz nada.");
    try {
      await api.sair();
    } finally {
      irParaEntrada();
    }
  });
}

/* =================================================================
   Painel da prévia
   ================================================================= */

const NOMES_DOS_CARGOS = { admin: "administrador", editor: "editor", jogador: "jogador" };

function configurarSimulacao() {
  const painel = $("#simulacao");
  painel.hidden = false;
  const seletor = $("#sim-cargo");
  const resumo = () => {
    $("#simulacao-resumo").textContent = `Prévia · vendo como ${NOMES_DOS_CARGOS[seletor.value]}`;
  };
  resumo();
  seletor.addEventListener("change", async () => {
    api.trocarConta(seletor.value);
    resumo();
    for (const dialogo of document.querySelectorAll("dialog[open]")) dialogo.close();
    await recarregar();
    avisoRapido(`Agora você vê a página como ${NOMES_DOS_CARGOS[seletor.value]}.`);
  });
  $("#sim-restaurar").addEventListener("click", async () => {
    api.restaurar();
    await recarregar();
    avisoRapido("Exemplos restaurados.");
  });
}

/* =================================================================
   Início
   ================================================================= */

async function iniciar() {
  medirAlturas();
  configurarEventos();
  configurarEdicao();
  iniciarCinzas(30);
  if (MODO_PREVIA) configurarSimulacao();

  try {
    await recarregar();
  } catch (falha) {
    if (falha.codigo === "sem-sessao") return irParaEntrada({ voltar: true });
    $("#pagina").hidden = false;
    $("#galeria").classList.add("galeria--vazia");
    $("#galeria").replaceChildren(criar("p", "galeria-vazia", falha.message));
    return;
  }
  $("#pagina").hidden = false;

  atualizarStatus();
  setInterval(atualizarStatus, CONFIG.intervaloStatus);

  // Link direto para um personagem: abre a ficha
  const alvo = location.hash.match(/^#personagem-(.+)$/)?.[1];
  if (alvo) abrirFicha(decodeURIComponent(alvo));
}

iniciar();
