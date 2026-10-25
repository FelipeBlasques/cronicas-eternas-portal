/* =================================================================
   Crônicas Eternas: Memórias de Draevor
   -----------------------------------------------------------------
   Os textos do cenário: cartas, contos, recortes, livros e outros
   escritos que os personagens encontram. A lista mostra só o nome
   de cada memória; clicar num nome troca a lista pela leitura, com
   endereço próprio (#memoria-<id>, e #memoria-<id>-capitulo-<n>
   nos capítulos de um livro). O texto pode mencionar acontecimentos
   da Linha do Tempo e personagens da galeria com links.

   No servidor, conversa com o servidor/memorias.js. Aberta fora dele
   (arquivo no PC ou prévia), usa memórias de exemplo e um painel
   para ver a página como administrador, editor ou jogador.

   Usa o comum.js, carregado antes: pedir(), criar(), avisos, barra
   lateral, status do Foundry, texto formatado e cinzas. Do
   calendario.js, textoDaData() e chaveDaData().
   ================================================================= */

const CONFIG = {
  intervaloStatus: 15000, // tempo entre consultas ao estado do Foundry, em ms
};

// As classificações, com o rótulo do campo "detalhe" de cada uma (null: não tem o campo)
const TIPOS_DE_MEMORIA = [
  { id: "carta", nome: "Carta", detalhe: "Assinatura" },
  { id: "conto", nome: "Conto", detalhe: null },
  { id: "diario", nome: "Diário", detalhe: null },
  { id: "recorte", nome: "Recorte", detalhe: "Recortado de" },
  { id: "trecho", nome: "Trecho de livro", detalhe: "Do livro" },
  { id: "livro", nome: "Livro", detalhe: null },
  { id: "poema", nome: "Poema ou canção", detalhe: null },
  { id: "documento", nome: "Documento", detalhe: "Emitido por" },
  { id: "inscricao", nome: "Inscrição", detalhe: "Onde está gravada" },
];

const tipoDeMemoria = (id) => TIPOS_DE_MEMORIA.find((t) => t.id === id);

// Uma menção no texto: [[evento:<id>|o que aparece]] ou [[personagem:<id>|o que aparece]]
const REGEX_LINK = /\[\[(evento|personagem):([^\]|\n]+)\|([^\]\n]*)\]\]/g;

/* =================================================================
   Conversa com o servidor
   ================================================================= */

const apiDoServidor = {
  memorias: () => pedir("GET", "/api/memorias"),
  memoria: (id) => pedir("GET", caminhoDe("/api/memorias", id)),
  estado: () => pedir("GET", "/api/estado", undefined, { silencioso: true }),
  sair: () => pedir("POST", "/api/sair"),
};

/* =================================================================
   Prévia: um portal de mentira, só na memória do navegador
   ================================================================= */

const CONTAS_DA_PREVIA = {
  admin: { usuario: "mestre", nome: "Mestre", cargo: "admin" },
  editor: { usuario: "takezo", nome: "Takezo", cargo: "editor" },
  jogador: { usuario: "neia", nome: "Neia", cargo: "jogador" },
};

// As datas contam a partir de hoje, para os exemplos parecerem recentes em qualquer dia.
// Os acontecimentos e personagens têm os ids das prévias da Linha do Tempo e dos Personagens,
// para os links levarem a eles.
function exemplosDaPrevia() {
  const agora = Date.now();
  const diasAtras = (dias) => new Date(agora - dias * 86400000).toISOString();
  const paraTodos = (dias) => ({ todos: diasAtras(dias), contas: {} });
  // "alterada": há quantos dias a memória foi alterada pela última vez
  const memoria = ({ alterada, ...campos }) => ({
    data: null,
    detalhe: "",
    texto: "",
    capitulos: [],
    ...campos,
    criadoEm: diasAtras(alterada + 6),
    alteradoEm: diasAtras(alterada),
  });

  return {
    contas: [
      { usuario: "mestre", nome: "Mestre", admin: true },
      { usuario: "comuna", nome: "Comuna" },
      { usuario: "takezo", nome: "Takezo", editor: true },
      { usuario: "frati", nome: "Frati" },
      { usuario: "neia", nome: "Neia" },
    ],
    acontecimentos: [
      { id: "e4", titulo: "A Guerra dos Sete Invernos", data: { ano: 154 }, visibilidade: "todos" },
      { id: "e8", titulo: "O verdadeiro nome do Flagelo", data: { ano: 350, mes: 10, dia: 30 }, visibilidade: "revelar", revelado: false },
      { id: "e9", titulo: "O grupo atravessa o Passo Negro", data: { ano: 362, mes: 7, dia: 9 }, visibilidade: "todos" },
      { id: "e10", titulo: "A morte do guardião da ponte", data: { ano: 365, mes: 4, dia: 22 }, visibilidade: "todos" },
      { id: "e11", titulo: "A canção que adormece a cidade", data: { ano: 365, mes: 2, dia: 15 }, visibilidade: "todos" },
      { id: "e12", titulo: "O culto se move antes do inverno", data: { ano: 366, mes: 6 }, visibilidade: "admin" },
    ],
    // Os personagens do portal aparecem sempre; os outros, se não forem só do administrador
    personagens: [
      { id: "p1", nome: "Venti" },
      { id: "p2", nome: "Alisaie" },
    ],
    outrosPersonagens: [
      { id: "npc-1b2c3d4e", nome: "Bram, o guardião da ponte", visibilidade: "todos" },
      { id: "npc-3d4e5f60", nome: "A Voz na Torre", visibilidade: "admin" },
    ],
    memorias: [
      memoria({
        id: "mem-0a1b2c3d",
        titulo: "Carta deixada na hospedaria",
        tipo: "carta",
        data: { ano: 365, mes: 4, dia: 24, aprox: false },
        detalhe: "Edrin, de Westna",
        texto:
          "Amigo,\n\nEscrevo depressa, antes que a vela acabe. Soube do que houve em [[evento:e10|aquela noite na ponte]] e desde então não durmo direito.\n\nSe ouvir [[personagem:npc-3d4e5f60|a voz que canta na torre]], não responda. Volte pelo caminho do rio e me procure na hospedaria de sempre.\n\nCom a amizade de sempre,",
        revelacao: paraTodos(4),
        alterada: 5,
      }),
      memoria({
        id: "mem-1b2c3d4e",
        titulo: "O ferreiro que guardava brasas",
        tipo: "conto",
        texto:
          "Havia em Hando um ferreiro que nunca deixava a forja apagar. Dizia que cada brasa guardava a lembrança de uma espada, e que deixar o fogo morrer era esquecer quem a empunhou.\n\nQuando o inverno chegou, os vizinhos vieram pedir fogo. Ele deu a cada um uma brasa pequena, embrulhada em folhas de ferro, e pediu só uma coisa: que contassem a história da espada que ela lembrava.\n\nNa primavera, a vila inteira sabia as histórias de cor. O ferreiro, enfim, deixou a forja descansar.",
        revelacao: paraTodos(20),
        alterada: 21,
      }),
      memoria({
        id: "mem-2c3d4e5f",
        titulo: "Diário de viagem, terceira semana",
        tipo: "diario",
        data: { ano: 362, mes: 7, dia: 9, aprox: false },
        texto:
          "Chuva desde o amanhecer. As botas não secam mais.\n\nO guia diz que o [[evento:e9|Passo Negro]] fica a dois dias daqui, se o tempo ajudar. Ninguém acredita muito nele, mas também ninguém sabe outro caminho.\n\n*Anotar:* comprar corda em Westna. A nossa já está gasta.",
        revelacao: { todos: null, contas: { neia: diasAtras(2) } },
        alterada: 3,
      }),
      memoria({
        id: "mem-3d4e5f60",
        titulo: "A ponte de Hando volta a abrir",
        tipo: "recorte",
        data: { ano: 365, mes: 5, aprox: false },
        detalhe: "Gazeta de Westna",
        texto:
          "Depois de semanas fechada, a ponte de Hando voltou a receber carroças nesta manhã. O conselho da vila garante que as tábuas foram trocadas e que a guarda dobrou.\n\nComerciantes comemoram. Os barqueiros, nem tanto: durante o fechamento, a travessia de barco rendeu o dobro.\n\nPerguntada sobre o ocorrido, [[personagem:p2|uma viajante de passagem]] disse apenas que \"a ponte não tem culpa de nada\".",
        revelacao: paraTodos(12),
        alterada: 13,
      }),
      memoria({
        id: "mem-4e5f6071",
        titulo: "Sobre as marés de Drae'mora",
        tipo: "trecho",
        detalhe: "Tratado das Luas",
        texto:
          "A lua cheia não puxa só as águas. Os antigos marinheiros juravam que, no dia 16 de cada mês, também os sonhos ficam mais pesados, e que quem dorme perto do mar acorda com gosto de sal na boca.\n\nNão encontrei prova disso. Mas também não encontrei marinheiro que dormisse em terra nessas noites.",
        revelacao: paraTodos(30),
        alterada: 31,
      }),
      memoria({
        id: "mem-5f607182",
        titulo: "Crônica dos Sete Invernos",
        tipo: "livro",
        data: { ano: 161, aprox: true },
        capitulos: [
          {
            titulo: "O primeiro inverno",
            texto:
              "Ninguém esperava que a neve viesse tão cedo. Os celeiros ainda estavam pela metade quando as estradas fecharam.\n\nEste livro conta o que veio depois, inverno após inverno, até a paz.",
          },
          {
            titulo: "O cerco",
            texto:
              "No terceiro inverno, as muralhas do norte já não abriam os portões. Do lado de dentro, contavam-se os sacos de grão; do lado de fora, as fogueiras.\n\n- Grão para quarenta dias\n- Lenha para vinte\n- Esperança para menos que isso",
          },
          {
            titulo: "A paz",
            texto:
              "A paz não chegou com trombetas. Chegou com um mensageiro cansado, que pediu água antes de falar.\n\nQuando enfim falou, a [[evento:e4|guerra dos sete invernos]] acabou numa frase só.",
          },
        ],
        revelacao: paraTodos(8),
        alterada: 9,
      }),
      memoria({
        id: "mem-60718293",
        titulo: "Canção de ninar da torre",
        tipo: "poema",
        texto:
          "Dorme, cidade, que eu canto por ti,\nfecha a janela, apaga o candil.\nO rio já dorme, a ponte também,\nninguém atravessa, não passa ninguém.\n\nDorme, cidade, que a lua não tarda,\no sino descansa, descansa a guarda.\nE quando acordares, não lembres de mim:\na canção começa, e a canção tem fim.",
        revelacao: { todos: null, contas: {} },
        alterada: 1,
      }),
      memoria({
        id: "mem-718293a4",
        titulo: "Édito sobre as noites de lua cheia",
        tipo: "documento",
        data: { ano: 366, mes: 1, dia: 3, aprox: false },
        detalhe: "Conselho de Westna",
        texto:
          "Por decisão deste conselho, valem a partir de hoje as seguintes regras para as noites de lua cheia:\n\n1. Os portões da cidade fecham ao pôr do sol.\n2. Nenhuma canção será tocada nas praças.\n3. Quem ouvir música vinda da torre deve avisar a guarda.\n\nQuem descumprir pagará **dez moedas de prata**.",
        revelacao: { todos: null, contas: {} },
        alterada: 3,
      }),
      memoria({
        id: "mem-8293a4b5",
        titulo: "Lápide sem nome",
        tipo: "inscricao",
        detalhe: "Lápide no cemitério de Hando",
        texto: "Aqui dorme quem guardou a ponte.\nQue a cinza lhe seja leve.",
        revelacao: paraTodos(40),
        alterada: 41,
      }),
    ],
  };
}

function criarApiDePrevia() {
  let banco = exemplosDaPrevia();
  let conta = CONTAS_DA_PREVIA.admin;

  // As mesmas regras do servidor/memorias.js
  const contaEhAdmin = () => conta.cargo === "admin";
  const doMaisRecente = (a, b) => (a < b ? 1 : a > b ? -1 : 0);
  const contasMarcaveis = () => banco.contas.filter((c) => !c.admin);
  const dataDaConta = (revelacao, usuario) => (Object.hasOwn(revelacao.contas, usuario) ? revelacao.contas[usuario] : null);

  function contasReveladas(m) {
    return contasMarcaveis()
      .map((c) => c.usuario)
      .filter((usuario) => dataDaConta(m.revelacao, usuario));
  }

  function revelacaoPublica(m) {
    const contas = contasReveladas(m);
    const para = m.revelacao.todos ? "todos" : contas.length ? "contas" : "ninguem";
    return { para, contas };
  }

  // Para quem lê, a data mais antiga entre "todos" e a da própria conta.
  // Para o administrador, a primeira vez que a memória foi revelada para alguém.
  function reveladaEm(m) {
    const usuarios = contaEhAdmin() ? contasReveladas(m) : [conta.usuario];
    const datas = [m.revelacao.todos, ...usuarios.map((u) => dataDaConta(m.revelacao, u))].filter(Boolean);
    return datas.length ? datas.sort()[0] : null;
  }

  const podeLer = (m) => contaEhAdmin() || Boolean(reveladaEm(m));

  function ordemDaLista(a, b) {
    if (!a.reveladaEm !== !b.reveladaEm) return a.reveladaEm ? 1 : -1;
    return a.reveladaEm ? doMaisRecente(a.reveladaEm, b.reveladaEm) : doMaisRecente(a.alteradoEm, b.alteradoEm);
  }

  const podeVerAcontecimento = (ev) =>
    contaEhAdmin() || (ev.visibilidade !== "admin" && !(ev.visibilidade === "revelar" && !ev.revelado));

  function personagensVisiveis() {
    const outros = banco.outrosPersonagens.filter((p) => contaEhAdmin() || p.visibilidade !== "admin");
    return [...banco.personagens, ...outros];
  }

  function citaveis() {
    const acontecimentos = [...banco.acontecimentos]
      .sort((a, b) => chaveDaData(a.data) - chaveDaData(b.data))
      .map((ev) => ({ id: ev.id, titulo: ev.titulo, ano: ev.data.ano }));
    const personagens = personagensVisiveis()
      .map((p) => ({ id: p.id, nome: p.nome }))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    return { acontecimentos, personagens };
  }

  const textosDe = (m) => (m.tipo === "livro" ? m.capitulos.map((c) => c.texto) : [m.texto]);

  function linksPara(textos) {
    const acontecimentos = new Map(banco.acontecimentos.map((ev) => [ev.id, ev]));
    const personagens = new Map(personagensVisiveis().map((p) => [p.id, p]));
    const links = {};
    for (const textoDaMemoria of textos) {
      for (const [, alvo, id] of textoDaMemoria.matchAll(REGEX_LINK)) {
        const chave = `${alvo}:${id}`;
        if (chave in links) continue;
        if (alvo === "evento") {
          const ev = acontecimentos.get(id);
          if (ev && podeVerAcontecimento(ev)) links[chave] = { titulo: ev.titulo };
        } else {
          const personagem = personagens.get(id);
          if (personagem) links[chave] = { nome: personagem.nome };
        }
      }
    }
    return links;
  }

  const dataPublica = (data) => ({
    ano: data.ano,
    mes: data.mes || null,
    dia: data.mes && data.dia ? data.dia : null,
    aprox: Boolean(data.aprox),
  });

  function memoriaPublica(m) {
    const publica = {
      id: m.id,
      titulo: m.titulo,
      tipo: m.tipo,
      data: m.data ? dataPublica(m.data) : null,
      detalhe: tipoDeMemoria(m.tipo)?.detalhe ? m.detalhe || "" : "",
    };
    if (m.tipo === "livro") publica.capitulos = m.capitulos.map((c) => ({ titulo: c.titulo, texto: c.texto }));
    else publica.texto = m.texto;
    publica.reveladaEm = reveladaEm(m);
    if (contaEhAdmin()) publica.revelacao = revelacaoPublica(m);
    return publica;
  }

  return {
    trocarConta(cargo) {
      conta = CONTAS_DA_PREVIA[cargo] ?? CONTAS_DA_PREVIA.admin;
    },
    restaurar() {
      banco = exemplosDaPrevia();
    },
    async memorias() {
      await esperar(120);
      const memorias = banco.memorias
        .filter(podeLer)
        .map((m) => {
          const item = { id: m.id, titulo: m.titulo, reveladaEm: reveladaEm(m) };
          if (contaEhAdmin()) Object.assign(item, { tipo: m.tipo, alteradoEm: m.alteradoEm, revelacao: revelacaoPublica(m) });
          return item;
        })
        .sort(ordemDaLista);
      const resposta = { conta: { ...conta }, memorias };
      if (contaEhAdmin()) {
        resposta.contas = contasMarcaveis().map((c) => ({ usuario: c.usuario, nome: c.nome }));
        resposta.citaveis = citaveis();
      }
      return resposta;
    },
    async memoria(id) {
      await esperar(120);
      const memoria = banco.memorias.find((m) => m.id === id);
      if (!memoria || !podeLer(memoria)) throw erroComCodigo("Essa memória não existe.", "nao-encontrado");
      return { memoria: memoriaPublica(memoria), links: linksPara(textosDe(memoria)) };
    },
    async estado() {
      return { online: true, mundoAtivo: "ode-to-sleep", conectados: 0, trocandoPara: null };
    },
    async sair() {
      await esperar(100);
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
  memorias: [],
  contas: [], // só para o administrador: as contas que podem receber uma memória
};

const ehAdmin = () => estado.conta?.cargo === "admin";

const nomeDaConta = (usuario) => estado.contas.find((c) => c.usuario === usuario)?.nome ?? usuario;

// "Neia", "Neia e Takezo", "Comuna, Neia e Takezo"
const listaDeNomes = (usuarios) =>
  new Intl.ListFormat("pt-BR", { style: "long", type: "conjunction" }).format(usuarios.map(nomeDaConta));

/* =================================================================
   Cabeçalho: conta e estado do Foundry
   ================================================================= */

function atualizarTopo() {
  $("#nome-conta").textContent = estado.conta?.nome ?? "";
  const cargo = $("#cargo-conta");
  cargo.hidden = !ehAdmin() && estado.conta?.cargo !== "editor";
  cargo.textContent = ehAdmin() ? "administrador" : "editor";
}

async function atualizarStatus() {
  let situacao;
  try {
    situacao = await api.estado();
  } catch {
    situacao = { online: false };
  }
  mostrarStatus(situacao);
}

/* =================================================================
   Endereço: a lista, uma memória ou um capítulo
   -----------------------------------------------------------------
   Cada passo dado dentro da página guarda no histórico quantos
   passos o separam da lista. Assim "← Memórias" usa o Voltar do
   navegador quando a pessoa veio da lista, mesmo depois de folhear
   capítulos. Quem chegou por um link direto (ou mudou o endereço
   à mão) não tem a lista atrás: aí o botão só troca o endereço.
   ================================================================= */

const TITULO_DA_PAGINA = document.title;

const navegacao = {
  rota: null, // { id, capitulo } na leitura (capitulo é null fora dos capítulos), ou null na lista
  lida: null, // { memoria, links } da memória aberta, para folhear os capítulos sem pedir de novo
  pedido: 0, // conta as aberturas, para ignorar a resposta de uma que ficou para trás
  rolagemDaLista: 0,
};

const ancoraDe = ({ id, capitulo }) => `#memoria-${id}${capitulo ? `-capitulo-${capitulo}` : ""}`;

function rotaDoEndereco() {
  const achado = location.hash.match(/^#memoria-([\w-]+?)(?:-capitulo-(\d+))?$/);
  return achado ? { id: achado[1], capitulo: achado[2] ? Number(achado[2]) : null } : null;
}

const mesmaRota = (a, b) => Boolean(a && b && a.id === b.id && a.capitulo === b.capitulo);

const passosDesdeALista = () => (Number.isInteger(history.state?.passos) ? history.state.passos : null);

// Põe (ou tira) a memória aberta no endereço da página. Devolve false se o navegador não deixar.
function trocarEndereco(ancora, { nova = false } = {}) {
  const endereco = ancora || location.pathname + location.search;
  const passos = passosDesdeALista();
  try {
    if (nova) history.pushState({ passos: passos === null ? null : passos + 1 }, "", endereco);
    else history.replaceState({ passos: ancora ? passos : 0 }, "", endereco);
    return true;
  } catch {
    // dentro de alguns quadros de prévia, o navegador não deixa mudar o endereço
    return false;
  }
}

function abrir(rota) {
  if (!navegacao.rota) navegacao.rolagemDaLista = window.scrollY;
  trocarEndereco(ancoraDe(rota), { nova: true });
  mostrarRota(rota);
}

function voltarALista() {
  const passos = passosDesdeALista();
  if (passos) return history.go(-passos);
  trocarEndereco("");
  mostrarRota(null);
}

// Um link para a leitura. O clique comum abre na mesma página; com Ctrl, o botão do meio
// ou o direito, continua um link de verdade (nova aba, copiar o endereço).
function linkDaLeitura(rota, classe, texto) {
  const link = criar("a", classe, texto);
  link.href = ancoraDe(rota);
  link.addEventListener("click", (evento) => {
    if (evento.button !== 0 || evento.ctrlKey || evento.metaKey || evento.shiftKey || evento.altKey) return;
    evento.preventDefault();
    abrir(rota);
  });
  return link;
}

// Mostra a memória (ou o capítulo) do endereço na leitura, ou a lista.
// "forcar" pede a memória de novo ao servidor, mesmo que ela já esteja aberta.
async function mostrarRota(rota = rotaDoEndereco(), { forcar = false } = {}) {
  if (!rota) return mostrarLista();
  if (!forcar && mesmaRota(rota, navegacao.rota)) return;
  const pedido = ++navegacao.pedido;

  // O foco estava na lista ou num link da leitura, que vão sumir: passa para a leitura
  const leitura = $("#leitura");
  const focoPerdido = $("#vista-lista").contains(document.activeElement) || leitura.contains(document.activeElement);
  navegacao.rota = rota;
  $("#vista-lista").hidden = true;
  leitura.hidden = false;
  if (focoPerdido) leitura.focus({ preventScroll: true });

  if (forcar || navegacao.lida?.memoria.id !== rota.id) {
    navegacao.lida = null;
    mostrarAvisoNaLeitura("Abrindo a memória…");
    let lida;
    try {
      lida = await api.memoria(rota.id);
    } catch (falha) {
      if (pedido === navegacao.pedido) mostrarAvisoNaLeitura(falha.message);
      return;
    }
    if (pedido !== navegacao.pedido) return;
    navegacao.lida = lida;
  }
  renderizarLeitura(rota);
}

function mostrarLista() {
  navegacao.pedido++; // a resposta de uma leitura que ainda estava a caminho não abre mais nada
  const aberta = navegacao.rota;
  navegacao.rota = null;
  navegacao.lida = null;
  // A lista fica marcada no histórico como o ponto de partida (passo 0)
  try {
    history.replaceState({ passos: 0 }, "");
  } catch {
    // dentro de alguns quadros de prévia, o navegador não deixa
  }
  if (!aberta) return;

  const leitura = $("#leitura");
  const focoNaLeitura = leitura.contains(document.activeElement) || document.activeElement === document.body;
  leitura.hidden = true;
  leitura.replaceChildren();
  $("#vista-lista").hidden = false;
  document.title = TITULO_DA_PAGINA;
  window.scrollTo(0, navegacao.rolagemDaLista);
  // O foco volta ao nome da memória que estava aberta
  if (focoNaLeitura) {
    const link = [...document.querySelectorAll(".memoria-item__link")].find((l) => l.dataset.id === aberta.id);
    link?.focus({ preventScroll: true });
  }
}

/* =================================================================
   A lista
   ================================================================= */

// Para o administrador: "Escondida" (com o olho riscado) ou "Só para Neia e Takezo".
// As reveladas para todos não levam nada na lista; na leitura, "Revelada para todos".
function sinalDaRevelacao(revelacao, { todos = false } = {}) {
  if (revelacao.para === "ninguem") {
    const selo = criar("span", "selo-oculto");
    selo.append(simbolo("icone-oculto"), "Escondida");
    return selo;
  }
  if (revelacao.para === "contas") return criar("span", "memoria-estado", `Só para ${listaDeNomes(revelacao.contas)}`);
  return todos ? criar("span", "memoria-estado", "Revelada para todos") : null;
}

function itemDaLista(m) {
  const link = linkDaLeitura({ id: m.id, capitulo: null }, "memoria-item__link");
  link.dataset.id = m.id;
  link.append(criar("span", "memoria-item__titulo", m.titulo));
  const sinal = ehAdmin() && m.revelacao ? sinalDaRevelacao(m.revelacao) : null;
  if (sinal) link.append(sinal);
  const item = criar("li", "memoria-item");
  item.append(link);
  return item;
}

function renderizarLista() {
  $("#botao-nova").hidden = !ehAdmin();
  const lista = $("#lista-memorias");
  const vazio = $("#memorias-vazio");
  lista.replaceChildren(...estado.memorias.map(itemDaLista));
  lista.hidden = !estado.memorias.length;
  vazio.hidden = estado.memorias.length > 0;
  vazio.textContent = ehAdmin() ? "Nenhuma memória escrita ainda." : "Nenhuma memória foi revelada ainda.";
}

/* =================================================================
   A leitura
   -----------------------------------------------------------------
   Por enquanto, uma cara só para todas as classificações: o texto
   numa folha de pergaminho. A folha leva a classificação em
   data-tipo.
   ================================================================= */

function mostrarAvisoNaLeitura(mensagem) {
  document.title = TITULO_DA_PAGINA;
  const barra = criar("div", "leitura__barra");
  barra.append(botao("← Memórias", "botao--leve", voltarALista));
  const aviso = criar("p", "leitura__aviso", mensagem);
  aviso.setAttribute("role", "status");
  $("#leitura").replaceChildren(barra, aviso);
}

async function copiarLink(rota) {
  const link = `${location.origin}${location.pathname}${ancoraDe(rota)}`;
  try {
    await navigator.clipboard.writeText(link);
    avisoRapido(`Link copiado. Quem abrir vai direto ${rota.capitulo ? "neste capítulo" : "nesta memória"}.`);
  } catch {
    avisoRapido(link);
  }
}

// Escrever, alterar e revelar ainda não chegaram: por enquanto, os botões só avisam
function abrirEdicao() {
  avisoRapido("Escrever e alterar memórias: em breve.");
}

function abrirRevelacao() {
  avisoRapido("Revelar memórias: em breve.");
}

// No alto: "← Memórias" e "Copiar link"; para o administrador, também "Alterar" e "Revelar…",
// com o estado atual ao lado
function barraDaLeitura(memoria, rota) {
  const barra = criar("div", "leitura__barra");
  barra.append(botao("← Memórias", "botao--leve", voltarALista), botao("Copiar link", "botao--leve", () => copiarLink(rota)));
  if (ehAdmin() && memoria.revelacao) {
    const admin = criar("div", "leitura__admin");
    admin.append(
      botao("Alterar", "botao--leve", () => abrirEdicao(memoria)),
      botao("Revelar…", "botao--leve", () => abrirRevelacao(memoria)),
      sinalDaRevelacao(memoria.revelacao, { todos: true }),
    );
    barra.append(admin);
  }
  return barra;
}

// "Carta · 12 de Solcanis de 365 ED"
function linhaDaClassificacao(memoria) {
  const partes = [tipoDeMemoria(memoria.tipo)?.nome ?? "Memória"];
  if (memoria.data) partes.push(textoDaData(memoria.data));
  return criar("p", "folha__meta", partes.join(" · "));
}

// Uma menção vira link só quando a conta vê o alvo; senão, fica só o que aparece, como texto.
// O endereço é montado aqui, a partir do id; o texto nunca vira HTML.
function mencaoNoTexto({ alvo, id, aparece }, links) {
  const destino = links[`${alvo}:${id}`];
  if (!destino) return aparece;
  const link = criar("a", "mencao", aparece);
  if (alvo === "evento") {
    link.href = `${enderecoDaPagina("linha")}#evento-${encodeURIComponent(id)}`;
    link.title = `Na Linha do Tempo: ${destino.titulo}`;
  } else {
    link.href = `${enderecoDaPagina("personagens")}#personagem-${encodeURIComponent(id)}`;
    link.title = `Nos Personagens: ${destino.nome}`;
  }
  return link;
}

// O texto com **negrito**, *itálico*, parágrafos, listas e as menções.
// Cada menção vira um marcador antes da formatação (o paragrafosDe do comum.js) e,
// depois, o link no lugar dele; assim um link pode ficar dentro de um negrito.
function textoDaFolha(texto, links) {
  const mencoes = [];
  const marcado = String(texto || "").replace(REGEX_LINK, (_, alvo, id, aparece) => {
    mencoes.push({ alvo, id, aparece });
    return `${mencoes.length - 1}`;
  });
  const corpo = criar("div", "folha__texto");
  corpo.append(...paragrafosDe(marcado));
  if (!mencoes.length) return corpo;

  const comMarcador = [];
  const caminho = document.createTreeWalker(corpo, NodeFilter.SHOW_TEXT);
  while (caminho.nextNode()) if (caminho.currentNode.data.includes("")) comMarcador.push(caminho.currentNode);
  for (const no of comMarcador) {
    // Com o grupo no split, os pedaços ímpares são os números das menções
    const pedacos = no.data.split(/(\d+)/);
    no.replaceWith(...pedacos.map((pedaco, i) => (i % 2 ? mencaoNoTexto(mencoes[Number(pedaco)], links) : pedaco)).filter(Boolean));
  }
  return corpo;
}

// O livro aberto: a capa, com o título, e o índice dos capítulos
function capaEIndice(memoria) {
  const capa = criar("div", "capa");
  capa.append(criar("h1", "capa__titulo", memoria.titulo));

  const indice = criar("nav", "indice");
  indice.setAttribute("aria-label", "Capítulos");
  const lista = criar("ol", "indice__lista");
  memoria.capitulos.forEach((capitulo, i) => {
    const link = linkDaLeitura({ id: memoria.id, capitulo: i + 1 }, "indice__link");
    link.append(criar("span", "indice__numero", String(i + 1)), criar("span", "indice__nome", capitulo.titulo));
    const item = criar("li");
    item.append(link);
    lista.append(item);
  });
  indice.append(criar("h2", "indice__titulo", "Índice"), lista);
  return [capa, indice];
}

// No fim do capítulo: "← Capítulo anterior", "Índice" e "Próximo capítulo →"
function passosEntreCapitulos(memoria, n) {
  const nav = criar("nav", "entre-capitulos");
  nav.setAttribute("aria-label", "Outros capítulos");
  const total = memoria.capitulos.length;
  const vizinho = (numero, classe, texto) =>
    numero >= 1 && numero <= total ? linkDaLeitura({ id: memoria.id, capitulo: numero }, classe, texto) : criar("span", classe);
  nav.append(
    vizinho(n - 1, "entre-capitulos__anterior", "← Capítulo anterior"),
    linkDaLeitura({ id: memoria.id, capitulo: null }, "entre-capitulos__indice", "Índice"),
    vizinho(n + 1, "entre-capitulos__proximo", "Próximo capítulo →"),
  );
  return nav;
}

function capituloDoLivro(memoria, n, links) {
  const capitulo = memoria.capitulos[n - 1];
  return [
    criar("p", "folha__capitulo", `Capítulo ${n}`),
    criar("h1", "folha__titulo", capitulo.titulo),
    textoDaFolha(capitulo.texto, links),
    passosEntreCapitulos(memoria, n),
  ];
}

function renderizarLeitura(pedida) {
  const { memoria, links } = navegacao.lida;
  let capitulo = pedida.capitulo;
  // Um capítulo que não existe (ou numa memória que não é livro) mostra a memória inteira
  if (capitulo !== null && !(memoria.tipo === "livro" && capitulo >= 1 && capitulo <= memoria.capitulos.length)) {
    if (memoria.tipo === "livro") avisoRapido("Esse capítulo não existe.");
    capitulo = null;
    trocarEndereco(ancoraDe({ id: memoria.id, capitulo }));
  }
  const rota = { id: memoria.id, capitulo };
  navegacao.rota = rota;
  document.title = memoria.titulo;

  const folha = criar("article", "folha");
  folha.dataset.tipo = memoria.tipo;
  folha.append(linhaDaClassificacao(memoria));
  if (memoria.tipo !== "livro") folha.append(criar("h1", "folha__titulo", memoria.titulo), textoDaFolha(memoria.texto, links));
  else if (capitulo === null) folha.append(...capaEIndice(memoria));
  else folha.append(...capituloDoLivro(memoria, capitulo, links));

  $("#leitura").replaceChildren(barraDaLeitura(memoria, rota), folha);
  window.scrollTo(0, 0);
}

/* =================================================================
   Carregar
   ================================================================= */

async function recarregar() {
  const dados = await api.memorias();
  Object.assign(estado, { conta: dados.conta, memorias: dados.memorias, contas: dados.contas ?? [] });
  atualizarTopo();
  renderizarLista();
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
  $("#botao-nova").addEventListener("click", () => abrirEdicao(null));

  // Esc fecha a leitura e volta para a lista
  document.addEventListener("keydown", (evento) => {
    if (evento.key !== "Escape" || !navegacao.rota || evento.defaultPrevented) return;
    if (document.querySelector("dialog[open]")) return;
    evento.preventDefault();
    voltarALista();
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

// Depois de trocar a conta ou restaurar os exemplos, a memória aberta é pedida de novo:
// a outra conta pode não ver mais (e aí ela "não existe")
async function recarregarTudo() {
  await recarregar();
  if (navegacao.rota) await mostrarRota(navegacao.rota, { forcar: true });
}

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
    await recarregarTudo();
    avisoRapido(`Agora você vê a página como ${NOMES_DOS_CARGOS[seletor.value]}.`);
  });
  $("#sim-restaurar").addEventListener("click", async () => {
    api.restaurar();
    await recarregarTudo();
    avisoRapido("Exemplos restaurados.");
  });
}

/* =================================================================
   Início
   ================================================================= */

async function iniciar() {
  medirAlturas();
  configurarEventos();
  iniciarCinzas(30);
  if (MODO_PREVIA) configurarSimulacao();

  try {
    await recarregar();
  } catch (falha) {
    if (falha.codigo === "sem-sessao") return irParaEntrada({ voltar: true });
    $("#pagina").hidden = false;
    $("#lista-memorias").hidden = true;
    const vazio = $("#memorias-vazio");
    vazio.textContent = falha.message;
    vazio.hidden = false;
    return;
  }
  $("#pagina").hidden = false;

  atualizarStatus();
  setInterval(atualizarStatus, CONFIG.intervaloStatus);

  // Link direto para uma memória (ou um capítulo): já abre a leitura.
  // O Voltar e o Avançar do navegador trocam entre a lista, as memórias e os capítulos.
  window.addEventListener("popstate", () => mostrarRota());
  window.addEventListener("hashchange", () => mostrarRota());
  mostrarRota();
}

iniciar();
