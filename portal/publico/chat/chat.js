/* =================================================================
   Crônicas Eternas: Chat (texto)
   -----------------------------------------------------------------
   Um Discord simplificado do grupo: a Geral, uma categoria por mesa
   e as mensagens privadas. Três colunas: a lista à esquerda, o canal
   aberto no centro e quem vê o canal à direita. O tempo real chega
   por /api/chat/eventos (Server-Sent Events).

   Endereço: #canal-<id> ou #privada-<usuario>. Sem endereço, abre o
   último canal visto ou o primeiro de texto da Geral.

   Tem login próprio: sem sessão, mostra a sua tela de entrada em vez
   de ir para a página Mesas.

   No servidor, conversa com o servidor/chat.js. Aberta fora dele
   (arquivo no PC ou prévia), usa um chat de exemplo na memória, com
   uma mensagem nova a cada 20 segundos.

   A voz e o vídeo ficam no voz.js, que usa o "estado" e os
   "ganchosDaVoz" daqui.

   Usa o comum.js, carregado antes: pedir(), criar(), botao(),
   imagem(), simbolo(), perguntar(), avisos, normalizar(), fontes.
   ================================================================= */

const CONFIG = {
  intervaloDaLida: 1000, // "lida até" no máximo uma vez por segundo
  minutosDoGrupo: 5, // mensagens seguidas da mesma persona, com até 5 minutos entre elas, ficam juntas
  maxImagens: 4,
  maxImagem: 10 * 1024 * 1024,
  tiposDeImagem: ["image/png", "image/jpeg", "image/webp", "image/gif", "image/avif"],
  maxTexto: 4000,
  esperaDaReconexao: 5000,
  tamanhoDoTrecho: 100,
  tamanhoDoAviso: 120, // o texto do aviso do navegador
};

// Os avisos de cada canal de texto (as privadas avisam sempre)
const NIVEIS_DE_AVISO = [
  ["tudo", "Tudo"],
  ["mencoes", "Só menções"],
  ["nada", "Nada"],
];

// As cores do selo das contas (a inicial do nome), sempre a mesma para a mesma conta
const CORES_DAS_CONTAS = ["#7a4a2e", "#4d5b37", "#3e4a66", "#6b3a4c", "#5e5130", "#365c5c", "#5a3f6b", "#6e4f3a"];

/* =================================================================
   Conversa com o servidor
   ================================================================= */

// O "alvo" é o que está aberto: um canal ({ tipo: "canal", id }) ou uma privada ({ tipo: "privada", usuario })
const caminhoDasMensagens = (alvo) =>
  alvo.tipo === "privada"
    ? `/api/chat/privadas/${encodeURIComponent(alvo.usuario)}/mensagens`
    : `/api/chat/canais/${encodeURIComponent(alvo.id)}/mensagens`;

function corpoDoEnvio({ texto, resposta, persona, arquivos, gif }) {
  if (!arquivos?.length) return { texto, resposta: resposta || undefined, persona: persona || undefined, gif: gif || undefined };
  const form = new FormData();
  form.append("texto", texto);
  if (resposta) form.append("resposta", resposta);
  if (persona) form.append("persona", JSON.stringify(persona));
  arquivos.forEach((arquivo, i) => form.append(`imagem${i + 1}`, arquivo));
  return form;
}

const apiDoServidor = {
  estado: () => pedir("GET", "/api/chat"),
  mensagens: (alvo, { antes, depois } = {}) => {
    const parametros = new URLSearchParams();
    if (antes) parametros.set("antes", antes);
    if (depois) parametros.set("depois", depois);
    const busca = parametros.toString();
    return pedir("GET", `${caminhoDasMensagens(alvo)}${busca ? `?${busca}` : ""}`);
  },
  enviar: (alvo, envio) => pedir("POST", caminhoDasMensagens(alvo), corpoDoEnvio(envio)),
  editar: (id, texto) => pedir("PUT", caminhoDe("/api/chat/mensagens", id), { texto }),
  apagar: (id) => pedir("DELETE", caminhoDe("/api/chat/mensagens", id)),
  ocultar: (usuario) => pedir("POST", `/api/chat/privadas/${encodeURIComponent(usuario)}/ocultar`),
  lida: (canal, ate) => pedir("POST", "/api/chat/lida", { canal, ate }, { silencioso: true }),
  mudarAviso: (canal, nivel) => pedir("PUT", "/api/chat/avisos", { canal, nivel }),
  escolherPersona: (mesa, persona) => pedir("PUT", "/api/chat/personas", { mesa, persona }),
  criarCanal: (categoria, tipo, nome) => pedir("POST", "/api/chat/canais", { categoria, tipo, nome }),
  alterarCanal: (id, mudancas) => pedir("PUT", caminhoDe("/api/chat/canais", id), mudancas),
  apagarCanal: (id) => pedir("DELETE", caminhoDe("/api/chat/canais", id)),
  categorias: (mesas) => pedir("PUT", "/api/chat/categorias", { mesas }),
  mudarPerfil: (form) => pedir("PUT", "/api/chat/perfil", form),
  reagir: (id, emoji, ligado) => pedir("PUT", `${caminhoDe("/api/chat/mensagens", id)}/reacoes`, { emoji, ligado }),
  fixar: (id, fixada) => pedir("PUT", `${caminhoDe("/api/chat/mensagens", id)}/fixada`, { fixada }),
  fixadas: (alvo) => pedir("GET", caminhoDasMensagens(alvo).replace(/\/mensagens$/, "/fixadas")),
  gifs: (q, pagina) => {
    const parametros = new URLSearchParams({ pagina: String(pagina) });
    if (q) parametros.set("q", q);
    return pedir("GET", `/api/chat/gifs?${parametros}`);
  },
  mesasDoAdmin: async () => (await pedir("GET", "/api/admin")).campanhas,
  entrar: (usuario, senha, lembrar) => pedir("POST", "/api/entrar", { usuario, senha, lembrar }),
  sair: () => pedir("POST", "/api/sair"),

  // Abre os eventos. "aoReceber(tipo, corpo)" recebe cada um; "aoCair()" é chamado quando o
  // navegador desiste de reconectar sozinho (sem sessão, portal fora do ar...).
  eventos(aoReceber, aoCair) {
    const fonte = new EventSource("/api/chat/eventos");
    for (const tipo of TIPOS_DE_EVENTO) {
      fonte.addEventListener(tipo, (evento) => {
        let corpo = {};
        try {
          corpo = JSON.parse(evento.data || "{}");
        } catch {
          return;
        }
        aoReceber(tipo, corpo);
      });
    }
    fonte.addEventListener("open", () => aoReceber("conectado", {}));
    fonte.addEventListener("error", () => {
      if (fonte.readyState === EventSource.CLOSED) aoCair();
      else aoReceber("reconectando", {});
    });
    return { fechar: () => fonte.close() };
  },
};

const TIPOS_DE_EVENTO = ["mensagem", "editada", "apagada", "lida", "canais", "voz", "presenca", "perfil", "reacoes", "fixadas", "mover", "recarregar"];

/* =================================================================
   Prévia: um chat de mentira, só na memória do navegador
   ================================================================= */

// Uma imagem de exemplo desenhada em SVG, sem arquivo
function desenhoDeExemplo(cor, letra, largura = 120, altura = 120) {
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='${largura}' height='${altura}' viewBox='0 0 ${largura} ${altura}'>` +
    `<rect width='100%' height='100%' fill='${cor}'/>` +
    `<circle cx='${largura / 2}' cy='${altura / 2}' r='${Math.min(largura, altura) / 3}' fill='none' stroke='#e8ddc8' stroke-opacity='.5' stroke-width='3'/>` +
    `<text x='50%' y='56%' text-anchor='middle' font-family='Georgia' font-size='${Math.min(largura, altura) / 3}' fill='#e8ddc8'>${letra}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function mapaDeExemplo() {
  const svg =
    "<svg xmlns='http://www.w3.org/2000/svg' width='480' height='300' viewBox='0 0 480 300'>" +
    "<rect width='480' height='300' fill='#2a241d'/>" +
    "<path d='M30 220C90 160 140 240 210 170S330 90 450 130' fill='none' stroke='#a8987f' stroke-width='3' stroke-dasharray='8 6'/>" +
    "<path d='M60 80l30-40 30 40ZM300 240l25-35 25 35Z' fill='#5e5130'/>" +
    "<circle cx='210' cy='170' r='9' fill='#c46a35'/>" +
    "<text x='225' y='160' font-family='Georgia' font-size='20' fill='#e8ddc8'>Vau do Corvo</text></svg>";
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

// Os GIFs de exemplo da prévia: desenhados num canvas, sem rede (uma vez só)
let gifsDaPrevia = null;
function gifsDeExemplo() {
  if (gifsDaPrevia) return gifsDaPrevia;
  const modelos = [
    ["dado rolando um vinte", "#2e3756", "d20", 240, 180],
    ["vitória da party", "#5a2a22", "Vitória!", 240, 240],
    ["fogo na taverna", "#7a3a1e", "🔥", 240, 135],
    ["dragão acordou", "#3b4a2e", "🐉", 200, 260],
    ["risada do mestre", "#5e5130", "HAHA", 240, 160],
    ["susto no escuro", "#1f1d2a", "!!!", 240, 200],
    ["brinde na taverna", "#6b3a4c", "🍺", 240, 240],
    ["magia arcana", "#24364a", "✦", 260, 180],
    ["espada em punho", "#4d4a45", "⚔", 220, 220],
    ["chuva sem fim", "#365c5c", "~ ~ ~", 240, 150],
    ["festa no castelo", "#5a3f6b", "🎉", 240, 200],
    ["dormindo na sessão", "#3e4a66", "zzz", 240, 170],
  ];
  gifsDaPrevia = modelos.map(([titulo, cor, texto, largura, altura], i) => {
    const tela = document.createElement("canvas");
    tela.width = largura;
    tela.height = altura;
    const ctx = tela.getContext("2d");
    const fundo = ctx.createLinearGradient(0, 0, largura, altura);
    fundo.addColorStop(0, cor);
    fundo.addColorStop(1, "#14110e");
    ctx.fillStyle = fundo;
    ctx.fillRect(0, 0, largura, altura);
    ctx.strokeStyle = "rgba(232, 221, 200, 0.35)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(largura / 2, altura / 2, Math.min(largura, altura) / 2.6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "#e8ddc8";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `${Math.round(Math.min(largura, altura) / 4.5)}px Georgia, serif`;
    ctx.fillText(texto, largura / 2, altura / 2);
    ctx.font = "13px Georgia, serif";
    ctx.fillStyle = "rgba(232, 221, 200, 0.7)";
    ctx.fillText("GIF de exemplo", largura / 2, altura - 14);
    const url = tela.toDataURL("image/png");
    return { id: `exemplo-${i + 1}`, titulo, previa: { url, largura, altura }, url, largura, altura };
  });
  return gifsDaPrevia;
}

function exemplosDaPrevia() {
  const agora = Date.now();
  const minutosAtras = (min) => agora - min * 60000;
  let sequencia = 0;
  const idEm = (tempo) => `m-${Math.floor(tempo).toString(36)}-${(++sequencia).toString(36)}x`;

  const contas = [
    { usuario: "mestre", nome: "Felipe", admin: true },
    { usuario: "neia", nome: "Neia", admin: false },
    { usuario: "takezo", nome: "Takezo", admin: false },
  ];
  const mesas = [
    { id: "ode-to-sleep", nome: "Ode to Sleep", cor: "#2e3756", titulo: null },
    { id: "cinzas-de-vael", nome: "Cinzas de Vael", cor: "#5a2a22", titulo: desenhoDeExemplo("#5a2a22", "V", 160, 60) },
    { id: "torre-partida", nome: "Torre Partida", cor: "#3b4a2e", titulo: null },
  ];
  const personagens = [
    { id: "p-aelin", nome: "Aelin Vesper", dono: "neia", campanha: "ode-to-sleep", retrato: desenhoDeExemplo("#3e4a66", "A"), fonte: "elfica" },
    { id: "p-bram", nome: "Bram", dono: "neia", campanha: "cinzas-de-vael", retrato: null, fonte: "ferro" },
    { id: "p-sorcha", nome: "Sorcha", dono: "neia", campanha: "cinzas-de-vael", retrato: desenhoDeExemplo("#6b3a4c", "S"), fonte: "caligrafia" },
    { id: "p-kaito", nome: "Kaito", dono: "takezo", campanha: "ode-to-sleep", retrato: null, fonte: "pirata" },
  ];
  const outros = [{ id: "o-marta", nome: "Velha Marta", mesas: ["ode-to-sleep"], retrato: desenhoDeExemplo("#5e5130", "M"), fonte: "tinta" }];

  const categorias = [
    { id: "geral", mesa: null, ordem: 0 },
    { id: "mesa-ode-to-sleep", mesa: "ode-to-sleep", ordem: 1 },
    { id: "mesa-cinzas-de-vael", mesa: "cinzas-de-vael", ordem: 2 },
  ];
  const canais = [
    { id: "canal-geral01", categoria: "geral", tipo: "texto", nome: "geral", ordem: 0 },
    { id: "canal-geral02", categoria: "geral", tipo: "texto", nome: "fora de jogo", ordem: 1 },
    { id: "canal-sala01", categoria: "geral", tipo: "voz", nome: "Sala comum", ordem: 2 },
    { id: "canal-ode01", categoria: "mesa-ode-to-sleep", tipo: "texto", nome: "conversa", ordem: 0 },
    { id: "canal-ode02", categoria: "mesa-ode-to-sleep", tipo: "voz", nome: "Sessão", ordem: 1 },
    { id: "canal-vael01", categoria: "mesa-cinzas-de-vael", tipo: "texto", nome: "conversa", ordem: 0 },
    { id: "canal-vael02", categoria: "mesa-cinzas-de-vael", tipo: "voz", nome: "Sessão", ordem: 1 },
  ];

  const historicos = {};
  const escrever = (chave, minutos, autor, persona, texto, extra = {}) => {
    const em = minutosAtras(minutos);
    const m = { id: idEm(em), em: new Date(em).toISOString(), editadaEm: null, autor, persona, texto, imagens: [], resposta: null, ...extra };
    (historicos[chave] ??= []).push(m);
    return m;
  };
  const conta = (usuario) => ({ tipo: "conta", id: usuario });

  // Geral: ontem e hoje
  escrever("canal-geral01", 60 * 26, "mestre", conta("mestre"), "Boa noite, pessoal! O chat novo está no ar. Testem à vontade.");
  escrever("canal-geral01", 60 * 26 - 2, "mestre", conta("mestre"), "Dá para usar **negrito**, *itálico*, ~~riscado~~ e `código`.");
  const pergunta = escrever("canal-geral01", 60 * 25, "takezo", conta("takezo"), "Sessão de Ode to Sleep continua no sábado?");
  escrever("canal-geral01", 60 * 24, "mestre", conta("mestre"), "Continua, às 20h. <@todos> confirmem quando puderem.", { resposta: pergunta.id });
  escrever("canal-geral01", 50, "neia", conta("neia"), "Confirmado! Achei esse link do mapa: https://cronicaseternas.com/mapas/");
  escrever("canal-geral01", 48, "neia", conta("neia"), "> Quem não tem pressa chega inteiro.\nFrase do dia, <@takezo>.");
  const spoiler = escrever("canal-geral01", 6, "takezo", conta("takezo"), "Spoiler do episódio de ontem: ||a ponte cai|| 😅");
  const soEmojis = escrever("canal-geral01", 5, "neia", conta("neia"), "😱🌉💥");
  const gif = gifsDeExemplo()[2];
  const comGif = escrever("canal-geral01", 4, "mestre", conta("mestre"), "", { gif: { id: gif.id, url: gif.url, largura: gif.largura, altura: gif.altura, titulo: gif.titulo } });
  escrever("canal-geral01", 3, "takezo", conta("takezo"), "Ei <@mestre>, posso levar o mapa impresso?");
  escrever("canal-geral02", 90, "neia", conta("neia"), "Alguém viu aquele filme novo?");

  // Ode to Sleep
  escrever("canal-ode01", 120, "mestre", { tipo: "mestre", id: "ode-to-sleep" }, "A chuva bate no telhado da estalagem. O taverneiro olha para vocês, desconfiado.");
  escrever("canal-ode01", 118, "neia", { tipo: "personagem", id: "p-aelin" }, "*Aelin puxa o capuz e se aproxima do balcão.* Um quarto, e silêncio.");
  escrever("canal-ode01", 117, "neia", { tipo: "personagem", id: "p-aelin" }, "E vinho. Do bom.");
  escrever("canal-ode01", 110, "takezo", { tipo: "personagem", id: "p-kaito" }, "Eu fico de olho na porta.", { imagens: [mapaDeExemplo()] });
  escrever("canal-ode01", 100, "mestre", { tipo: "outro", id: "o-marta" }, "Vocês não deviam ter vindo por aqui, forasteiros.");
  escrever(
    "canal-ode01",
    20,
    "mestre",
    { tipo: "mestre", id: "ode-to-sleep" },
    "Rolagens da cena anterior:\n```\nPercepção  14\nFurtividade  9\n```\n<@neia>, sua vez.",
  );

  // Cinzas de Vael
  escrever("canal-vael01", 300, "neia", { tipo: "personagem", id: "p-bram" }, "Bram afia o machado em silêncio.");
  escrever("canal-vael01", 200, "mestre", { tipo: "mestre", id: "cinzas-de-vael" }, "As cinzas ainda caem sobre Vael.");

  // Uma privada
  escrever("privada:mestre~neia", 400, "neia", conta("neia"), "Mestre, posso mudar o antecedente da Aelin?");
  escrever("privada:mestre~neia", 380, "mestre", conta("mestre"), "Pode, me manda a ideia antes da sessão.");
  escrever("privada:mestre~neia", 4, "neia", conta("neia"), "Mandei no Caderno!");

  // As reações ({ id: { emoji: [usuarios] } }) e as fixadas ({ chave: [{ id, por, em }] })
  const reacoes = {
    [spoiler.id]: { "😂": ["neia", "mestre"], "😭": ["neia"] },
    [soEmojis.id]: { "😱": ["takezo"] },
    [comGif.id]: { "🔥": ["neia", "takezo"], "👍": ["takezo"] },
  };
  const confirmacao = historicos["canal-geral01"][3];
  const fixadas = {
    "canal-geral01": [
      { id: historicos["canal-geral01"][0].id, por: "mestre", em: new Date(minutosAtras(60 * 25)).toISOString() },
      { id: confirmacao.id, por: "neia", em: new Date(minutosAtras(60 * 23)).toISOString() },
    ],
  };

  // O que cada conta já leu (a última vista de cada canal)
  const ultima = (chave, deTras = 0) => historicos[chave][historicos[chave].length - 1 - deTras].id;
  const lidas = {
    mestre: { "canal-geral01": ultima("canal-geral01", 2), "canal-geral02": ultima("canal-geral02"), "canal-ode01": ultima("canal-ode01"), "canal-vael01": ultima("canal-vael01"), "privada:mestre~neia": ultima("privada:mestre~neia", 1) },
    neia: { "canal-geral01": ultima("canal-geral01", 3), "canal-ode01": ultima("canal-ode01", 1), "privada:mestre~neia": ultima("privada:mestre~neia") },
    takezo: { "canal-geral01": ultima("canal-geral01") },
  };

  // Os perfis do chat (takezo nunca mexeu no dele: fica o padrão)
  const perfis = {
    mestre: {
      apelido: "Mestre Felipe",
      foto: desenhoDeExemplo("#7a4a2e", "F"),
      faixa: desenhoDeExemplo("#3a2a20", "✦", 360, 120),
      cor: "#a0522d",
      frase: "Quem rola os dados também chora.",
      sobre: "Narro **Ode to Sleep** e *Cinzas de Vael*.\nPergunte das regras da casa por privada. ||O dragão existe.||",
      alteradoEm: new Date(minutosAtras(600)).toISOString(),
    },
    neia: {
      apelido: "Neia ✿",
      foto: desenhoDeExemplo("#365c5c", "N"),
      faixa: null,
      cor: "#4f7f6f",
      frase: "Elfa nas horas vagas.",
      sobre: "",
      alteradoEm: new Date(minutosAtras(900)).toISOString(),
    },
  };

  return { contas, mesas, personagens, outros, categorias, canais, historicos, lidas, perfis, reacoes, fixadas, personas: {}, ocultas: {}, noChat: ["mestre", "neia"] };
}

function criarApiDePrevia() {
  let mundo = exemplosDaPrevia();
  let eu = "mestre";
  let ouvinte = null;
  let sorteioDaChegada = 0;
  let sequencia = 1000;
  const pausa = () => esperar(120);

  const novoId = () => `m-${Date.now().toString(36)}-${(++sequencia).toString(36)}p`;
  const contaDe = (usuario) => mundo.contas.find((c) => c.usuario === usuario);
  const mesaDe = (id) => mundo.mesas.find((m) => m.id === id);
  const categoriaDe = (id) => mundo.categorias.find((c) => c.id === id);
  const canalDe = (id) => mundo.canais.find((c) => c.id === id);
  const ehPrivada = (chave) => chave.startsWith("privada:");
  const participantes = (chave) => chave.slice(8).split("~");
  const chaveDaPrivada = (a, b) => `privada:${[a, b].sort().join("~")}`;
  const falha = (mensagem, codigo) => erroComCodigo(mensagem, codigo);

  function veCategoria(usuario, categoria) {
    if (!categoria) return false;
    if (!categoria.mesa) return true;
    if (contaDe(usuario)?.admin) return true;
    return mundo.personagens.some((p) => p.dono === usuario && p.campanha === categoria.mesa);
  }
  const veChave = (usuario, chave) =>
    ehPrivada(chave) ? participantes(chave).includes(usuario) : veCategoria(usuario, categoriaDe(canalDe(chave)?.categoria));

  const personaDaConta = (c) => {
    const p = mundo.perfis[c.usuario];
    return { tipo: "conta", id: c.usuario, nome: p?.apelido || c.nome, imagem: p?.foto ?? null, fonte: null };
  };
  const CORES_PADRAO = CORES_DAS_CONTAS;
  function perfilPublico(usuario) {
    const p = mundo.perfis[usuario] ?? {};
    let soma = 0;
    for (const letra of String(usuario)) soma = (soma * 31 + letra.codePointAt(0)) >>> 0;
    return {
      apelido: p.apelido ?? "",
      foto: p.foto ?? null,
      faixa: p.faixa ?? null,
      cor: p.cor || CORES_PADRAO[soma % CORES_PADRAO.length],
      frase: p.frase ?? "",
      sobre: p.sobre ?? "",
      alteradoEm: p.alteradoEm ?? null,
    };
  }
  const personaDoPersonagem = (p, tipo = "personagem") => ({ tipo, id: p.id, nome: p.nome, imagem: p.retrato || null, fonte: p.fonte });
  const personaDoMestre = (mesa) => ({ tipo: "mestre", id: mesa.id, nome: "Mestre", imagem: mesa.titulo || null, fonte: null });

  function personaCompleta(copia) {
    if (copia.tipo === "conta") return personaDaConta(contaDe(copia.id) ?? { usuario: copia.id, nome: copia.id });
    if (copia.tipo === "mestre") return personaDoMestre(mesaDe(copia.id));
    if (copia.tipo === "outro") return personaDoPersonagem(mundo.outros.find((o) => o.id === copia.id), "outro");
    return personaDoPersonagem(mundo.personagens.find((p) => p.id === copia.id));
  }

  function opcoesDaMesa(usuario, idMesa) {
    const mesa = mesaDe(idMesa);
    if (contaDe(usuario)?.admin) {
      return [personaDoMestre(mesa), ...mundo.outros.filter((o) => o.mesas.includes(idMesa)).map((o) => personaDoPersonagem(o, "outro"))];
    }
    return mundo.personagens.filter((p) => p.dono === usuario && p.campanha === idMesa).map((p) => personaDoPersonagem(p));
  }

  function personaEscolhida(usuario, idMesa) {
    const opcoes = opcoesDaMesa(usuario, idMesa);
    const guardada = mundo.personas[usuario]?.[idMesa];
    return opcoes.find((o) => guardada && o.tipo === guardada.tipo && o.id === guardada.id) ?? opcoes[0] ?? null;
  }

  function personaNo(usuario, chave) {
    if (ehPrivada(chave)) return personaDaConta(contaDe(usuario));
    const categoria = categoriaDe(canalDe(chave).categoria);
    return categoria.mesa ? personaEscolhida(usuario, categoria.mesa) : personaDaConta(contaDe(usuario));
  }

  const menciona = (m, usuario) => m.autor !== usuario && (m.texto.includes(`<@${usuario}>`) || m.texto.includes("<@todos>"));

  function acharMensagem(id) {
    for (const [chave, lista] of Object.entries(mundo.historicos)) {
      const i = lista.findIndex((m) => m.id === id);
      if (i >= 0) return { chave, lista, m: lista[i], indice: i };
    }
    return null;
  }

  function publica(m, chave) {
    let resposta = null;
    if (m.resposta) {
      const original = acharMensagem(m.resposta);
      resposta = original
        ? { id: original.m.id, nome: personaCompleta(original.m.persona).nome, trecho: trechoDe(original.m.texto), gif: Boolean(original.m.gif) }
        : { id: m.resposta, apagada: true };
    }
    return {
      id: m.id,
      canal: chave,
      em: m.em,
      editadaEm: m.editadaEm,
      autor: { usuario: m.autor, nomeConta: contaDe(m.autor)?.nome ?? m.autor },
      persona: personaCompleta(m.persona),
      texto: m.texto,
      imagens: [...m.imagens],
      gif: m.gif ? { ...m.gif } : null,
      resposta,
      reacoes: reacoesPublicas(m.id),
      fixada: (mundo.fixadas[chave] ?? []).some((f) => f.id === m.id),
      mencionaVoce: menciona(m, eu),
      podeEditar: m.autor === eu,
      podeApagar: m.autor === eu || (Boolean(contaDe(eu)?.admin) && !ehPrivada(chave)),
    };
  }

  const reacoesPublicas = (id) => Object.entries(mundo.reacoes[id] ?? {}).map(([emoji, usuarios]) => ({ emoji, usuarios: [...usuarios] }));

  function tirarDasFixadas(chave, id) {
    const lista = mundo.fixadas[chave] ?? [];
    if (!lista.some((f) => f.id === id)) return false;
    mundo.fixadas[chave] = lista.filter((f) => f.id !== id);
    return true;
  }

  function contar(chave, usuario) {
    const lista = mundo.historicos[chave] ?? [];
    const ate = mundo.lidas[usuario]?.[chave];
    let naoLidas = 0;
    let mencoes = 0;
    for (let i = lista.length - 1; i >= 0; i--) {
      if (lista[i].id === ate) break;
      if (lista[i].autor === usuario) continue;
      naoLidas++;
      if (menciona(lista[i], usuario)) mencoes++;
    }
    return { naoLidas, mencoes };
  }

  function marcarLida(chave, id) {
    (mundo.lidas[eu] ??= {})[chave] = id;
  }

  function estadoInicial() {
    const visiveis = [...mundo.categorias].sort((a, b) => a.ordem - b.ordem).filter((c) => veCategoria(eu, c));
    const categorias = visiveis.map((categoria) => {
      const mesa = categoria.mesa ? mesaDe(categoria.mesa) : null;
      return {
        id: categoria.id,
        nome: mesa ? mesa.nome : "Geral",
        cor: mesa ? mesa.cor : null,
        mesa: categoria.mesa,
        canais: mundo.canais
          .filter((c) => c.categoria === categoria.id)
          .sort((a, b) => a.ordem - b.ordem)
          .map((c) => (c.tipo === "texto" ? { id: c.id, tipo: c.tipo, nome: c.nome, ...contar(c.id, eu), aviso: mundo.avisos?.[eu]?.[c.id] ?? "tudo" } : { id: c.id, tipo: c.tipo, nome: c.nome })),
      };
    });
    const ocultas = mundo.ocultas[eu] ?? [];
    const privadas = Object.entries(mundo.historicos)
      .filter(([chave, lista]) => ehPrivada(chave) && lista.length && participantes(chave).includes(eu) && !ocultas.includes(chave))
      .map(([chave, lista]) => {
        const outro = participantes(chave).find((u) => u !== eu);
        return {
          id: chave,
          com: { usuario: outro, nome: contaDe(outro)?.nome ?? outro },
          naoLidas: contar(chave, eu).naoLidas,
          ultimaEm: lista[lista.length - 1].em,
          ativa: Boolean(contaDe(outro)),
        };
      })
      .sort((a, b) => (a.ultimaEm < b.ultimaEm ? 1 : -1));
    const personas = {};
    const membros = {};
    const personasDosMembros = {};
    for (const categoria of visiveis) {
      if (categoria.mesa) {
        const escolhida = personaEscolhida(eu, categoria.mesa);
        personas[categoria.mesa] = { opcoes: opcoesDaMesa(eu, categoria.mesa), escolhida: escolhida && { tipo: escolhida.tipo, id: escolhida.id } };
      }
      const quem = mundo.contas.filter((c) => veCategoria(c.usuario, categoria));
      membros[categoria.id] = quem.map((c) => c.usuario);
      personasDosMembros[categoria.id] = Object.fromEntries(
        quem.map((c) => [c.usuario, categoria.mesa ? personaEscolhida(c.usuario, categoria.mesa) : personaDaConta(c)]),
      );
    }
    const contaEu = contaDe(eu);
    return {
      conta: { usuario: eu, nome: contaEu.nome, admin: contaEu.admin },
      categorias,
      privadas,
      contas: mundo.contas.map((c) => ({ usuario: c.usuario, nome: c.nome, noChat: mundo.noChat.includes(c.usuario) || c.usuario === eu })),
      personas,
      membros,
      personasDosMembros,
      perfis: Object.fromEntries(mundo.contas.map((c) => [c.usuario, perfilPublico(c.usuario)])),
      voz: { configurada: true, salas: salasDaPrevia(visiveis) },
      gifs: true,
      fixadas: Object.fromEntries(Object.entries(mundo.fixadas).filter(([chave, lista]) => lista.length && veChave(eu, chave)).map(([chave, lista]) => [chave, lista.length])),
    };
  }

  // Quem está nas salas de voz de exemplo (sem a conta que está vendo, só nas salas que ela vê)
  function salasDaPrevia(visiveis) {
    const naSala = (usuario, chave, estados = {}) => {
      const p = personaNo(usuario, chave);
      return { usuario, nome: p.nome, imagem: p.imagem, fonte: p.fonte, mudo: false, ensurdecido: false, camera: false, tela: false, ...estados };
    };
    const exemplo = {
      "canal-sala01": [naSala("neia", "canal-sala01"), naSala("takezo", "canal-sala01", { mudo: true })],
      "canal-ode02": [naSala("neia", "canal-ode02", { camera: true })],
    };
    const salas = {};
    for (const [id, pessoas] of Object.entries(exemplo)) {
      if (!visiveis.some((c) => c.id === canalDe(id)?.categoria)) continue;
      const outras = pessoas.filter((p) => p.usuario !== eu);
      if (outras.length) salas[id] = outras;
    }
    return salas;
  }

  function chaveDoAlvo(alvo) {
    if (alvo.tipo === "privada") {
      if (alvo.usuario === eu) throw falha("Escolha outra conta para conversar.");
      const chave = chaveDaPrivada(eu, alvo.usuario);
      if (!contaDe(alvo.usuario) && !mundo.historicos[chave]?.length) throw falha("Conta não encontrada.");
      return chave;
    }
    const canal = canalDe(alvo.id);
    if (!canal || !veChave(eu, canal.id)) throw falha("Canal não encontrado.");
    return canal.id;
  }

  function avisar(tipo, corpo) {
    if (ouvinte) setTimeout(() => ouvinte(tipo, corpo), 30);
  }

  // Uma mensagem de outra conta, a cada 20 segundos, num canal que a conta da prévia vê
  const FALAS = [
    { chave: "canal-geral01", autor: "neia", texto: "Alguém aí? Testando o chat novo." },
    { chave: "canal-geral01", autor: "takezo", texto: "Ô <@{eu}>, viu a mensagem lá em cima?" },
    { chave: "canal-ode01", autor: "takezo", persona: { tipo: "personagem", id: "p-kaito" }, texto: "*Kaito ouve passos na escada.* Tem alguém vindo." },
    { chave: "privada", autor: "neia", texto: "Psiu, depois me conta o que acontece na torre. ||é segredo||" },
    { chave: "canal-geral01", autor: "mestre", texto: "Lembrete: sessão no sábado, 20h." },
    { chave: "canal-vael01", autor: "neia", persona: { tipo: "personagem", id: "p-sorcha" }, texto: "Sorcha acende uma vela." },
  ];

  function chegarMensagem() {
    const opcoes = FALAS.filter((f) => f.autor !== eu);
    const fala = opcoes[sorteioDaChegada++ % opcoes.length];
    const chave = fala.chave === "privada" ? chaveDaPrivada(eu, fala.autor) : fala.chave;
    if (!veChave(fala.autor, chave) || !veChave(eu, chave)) return;
    const persona = ehPrivada(chave) || !categoriaDe(canalDe(chave).categoria).mesa ? { tipo: "conta", id: fala.autor } : fala.persona ?? { tipo: "mestre", id: categoriaDe(canalDe(chave).categoria).mesa };
    const m = { id: novoId(), em: new Date().toISOString(), editadaEm: null, autor: fala.autor, persona, texto: fala.texto.replace("{eu}", eu), imagens: [], resposta: null };
    (mundo.historicos[chave] ??= []).push(m);
    if (ehPrivada(chave)) mundo.ocultas[eu] = (mundo.ocultas[eu] ?? []).filter((k) => k !== chave);
    avisar("mensagem", { mensagem: publica(m, chave) });
  }

  return {
    async estado() {
      await pausa();
      if (!eu) throw falha("Entre na sua conta para continuar.", "sem-sessao");
      return estadoInicial();
    },
    async mensagens(alvo, { antes } = {}) {
      await pausa();
      const chave = chaveDoAlvo(alvo);
      const lista = mundo.historicos[chave] ?? [];
      const fim = antes ? lista.findIndex((m) => m.id === antes) : lista.length;
      const inicio = Math.max(0, fim - 50);
      return { mensagens: lista.slice(inicio, fim).map((m) => publica(m, chave)), maisAntigas: inicio > 0 };
    },
    async enviar(alvo, { texto, resposta, persona, arquivos, gif }) {
      await pausa();
      const chave = chaveDoAlvo(alvo);
      if (alvo.tipo === "privada" && !contaDe(alvo.usuario)) throw falha("Essa conta não existe mais.");
      const achado = gif ? gifsDeExemplo().find((g) => g.id === gif) : null;
      if (gif && !achado) throw falha("Esse GIF não foi encontrado.", "gif");
      if (!texto.trim() && !arquivos?.length && !achado) throw falha("Escreva alguma coisa antes de enviar.");
      const propria = personaNo(eu, chave);
      const usada = persona ?? propria;
      const m = {
        id: novoId(),
        em: new Date().toISOString(),
        editadaEm: null,
        autor: eu,
        persona: { tipo: usada.tipo, id: usada.id },
        texto,
        imagens: (arquivos ?? []).map((arquivo) => URL.createObjectURL(arquivo)),
        resposta: resposta || null,
        gif: achado ? { id: achado.id, url: achado.url, largura: achado.largura, altura: achado.altura, titulo: achado.titulo } : null,
      };
      (mundo.historicos[chave] ??= []).push(m);
      marcarLida(chave, m.id);
      if (ehPrivada(chave)) mundo.ocultas[eu] = (mundo.ocultas[eu] ?? []).filter((k) => k !== chave);
      return { mensagem: publica(m, chave) };
    },
    async editar(id, texto) {
      await pausa();
      const achada = acharMensagem(id);
      if (!achada) throw falha("Mensagem não encontrada.");
      achada.m.texto = texto;
      achada.m.editadaEm = new Date().toISOString();
      const mensagem = publica(achada.m, achada.chave);
      avisar("editada", { mensagem });
      return { mensagem };
    },
    async apagar(id) {
      await pausa();
      const achada = acharMensagem(id);
      if (!achada) throw falha("Mensagem não encontrada.");
      achada.lista.splice(achada.indice, 1);
      delete mundo.reacoes[id];
      if (tirarDasFixadas(achada.chave, id)) avisar("fixadas", { canal: achada.chave, quantas: mundo.fixadas[achada.chave].length, id, fixada: false });
      avisar("apagada", { id, canal: achada.chave });
      return { ok: true };
    },
    async reagir(id, emoji, ligado) {
      await pausa();
      const achada = acharMensagem(id);
      if (!achada || !veChave(eu, achada.chave)) throw falha("Mensagem não encontrada.");
      if (ehPrivada(achada.chave) && participantes(achada.chave).some((u) => !contaDe(u))) throw falha("Essa conta não existe mais.", "conta-excluida");
      const daMensagem = (mundo.reacoes[id] ??= {});
      const usuarios = daMensagem[emoji] ?? [];
      if (ligado && !usuarios.includes(eu)) {
        if (!usuarios.length && Object.keys(daMensagem).length >= 20) throw falha("Uma mensagem pode ter no máximo 20 reações diferentes.", "reacoes-demais");
        daMensagem[emoji] = [...usuarios, eu];
      } else if (!ligado && usuarios.includes(eu)) {
        const ficam = usuarios.filter((u) => u !== eu);
        if (ficam.length) daMensagem[emoji] = ficam;
        else delete daMensagem[emoji];
      }
      avisar("reacoes", { id, canal: achada.chave, reacoes: reacoesPublicas(id) });
      return { reacoes: reacoesPublicas(id) };
    },
    async fixar(id, fixada) {
      await pausa();
      const achada = acharMensagem(id);
      if (!achada || !veChave(eu, achada.chave)) throw falha("Mensagem não encontrada.");
      const chave = achada.chave;
      const lista = (mundo.fixadas[chave] ??= []);
      let mudou = false;
      if (fixada && !lista.some((f) => f.id === id)) {
        if (lista.length >= 50) throw falha("Desafixe uma antes.", "fixadas-demais");
        lista.push({ id, por: eu, em: new Date().toISOString() });
        mudou = true;
      } else if (!fixada) {
        mudou = tirarDasFixadas(chave, id);
      }
      const quantas = mundo.fixadas[chave].length;
      if (mudou) avisar("fixadas", { canal: chave, quantas, id, fixada });
      return { fixada, quantas };
    },
    async fixadas(alvo) {
      await pausa();
      const chave = chaveDoAlvo(alvo);
      const lista = [...(mundo.fixadas[chave] ?? [])].reverse();
      return {
        fixadas: lista
          .map((f) => ({ achada: acharMensagem(f.id), f }))
          .filter(({ achada }) => achada)
          .map(({ achada, f }) => ({ mensagem: publica(achada.m, chave), por: f.por, em: f.em })),
      };
    },
    // Na prévia, 8 por página, para dar para ver o "mais ao rolar"
    async gifs(q, pagina) {
      await pausa();
      const termo = normalizar(q || "");
      const todos = gifsDeExemplo().filter((g) => !termo || normalizar(g.titulo).includes(termo));
      const inicio = (pagina - 1) * 8;
      return { gifs: todos.slice(inicio, inicio + 8), maisPaginas: inicio + 8 < todos.length };
    },
    async ocultar(usuario) {
      await pausa();
      (mundo.ocultas[eu] ??= []).push(chaveDaPrivada(eu, usuario));
      return { ok: true };
    },
    async lida(canal, ate) {
      const chave = canal.startsWith("privada:") ? chaveDaPrivada(eu, canal.slice(8)) : canal;
      marcarLida(chave, ate);
      return { ok: true };
    },
    async mudarAviso(canal, nivel) {
      await pausa();
      ((mundo.avisos ??= {})[eu] ??= {})[canal] = nivel;
      return { canal, nivel };
    },
    async escolherPersona(mesa, persona) {
      await pausa();
      (mundo.personas[eu] ??= {})[mesa] = persona;
      avisar("canais", {});
      return { mesa, escolhida: persona };
    },
    async criarCanal(categoria, tipo, nome) {
      await pausa();
      if (!nome.trim()) throw falha("Escreva o nome do canal.");
      const daCategoria = mundo.canais.filter((c) => c.categoria === categoria);
      if (daCategoria.length >= 20) throw falha("Cada categoria pode ter no máximo 20 canais.");
      const canal = { id: `canal-${Date.now().toString(36)}`, categoria, tipo, nome: nome.trim(), ordem: daCategoria.length };
      mundo.canais.push(canal);
      avisar("canais", {});
      return { canal };
    },
    async alterarCanal(id, { nome, ordem }) {
      await pausa();
      const canal = canalDe(id);
      if (nome !== undefined) {
        if (!nome.trim()) throw falha("Escreva o nome do canal.");
        canal.nome = nome.trim();
      }
      if (ordem !== undefined) {
        const irmaos = mundo.canais.filter((c) => c.categoria === canal.categoria && c !== canal).sort((a, b) => a.ordem - b.ordem);
        irmaos.splice(Math.max(0, Math.min(ordem, irmaos.length)), 0, canal);
        irmaos.forEach((c, i) => (c.ordem = i));
      }
      avisar("canais", {});
      return { canal };
    },
    async apagarCanal(id) {
      await pausa();
      mundo.canais = mundo.canais.filter((c) => c.id !== id);
      for (const m of mundo.historicos[id] ?? []) delete mundo.reacoes[m.id];
      delete mundo.historicos[id];
      delete mundo.fixadas[id];
      avisar("canais", {});
      return { ok: true };
    },
    async categorias(mesas) {
      await pausa();
      const ficam = new Set(mesas.map((m) => `mesa-${m}`));
      const saem = mundo.categorias.filter((c) => c.mesa && !ficam.has(c.id)).map((c) => c.id);
      mundo.canais = mundo.canais.filter((c) => !saem.includes(c.categoria));
      mundo.categorias = mundo.categorias.filter((c) => !saem.includes(c.id));
      mesas.forEach((idMesa, i) => {
        let categoria = categoriaDe(`mesa-${idMesa}`);
        if (!categoria) {
          categoria = { id: `mesa-${idMesa}`, mesa: idMesa, ordem: 0 };
          mundo.categorias.push(categoria);
          const base = Date.now().toString(36);
          mundo.canais.push(
            { id: `canal-${base}t${i}`, categoria: categoria.id, tipo: "texto", nome: "conversa", ordem: 0 },
            { id: `canal-${base}v${i}`, categoria: categoria.id, tipo: "voz", nome: "Sessão", ordem: 1 },
          );
        }
        categoria.ordem = i + 1;
      });
      avisar("canais", {});
      return { ok: true };
    },
    // Como o PUT /api/chat/perfil: um campo que não veio fica como está
    async mudarPerfil(form) {
      await pausa();
      const novo = { ...(mundo.perfis[eu] ?? {}) };
      const campo = (nome) => (typeof form.get(nome) === "string" ? form.get(nome) : undefined);
      const apelido = campo("apelido");
      if (apelido !== undefined) {
        const limpo = apelido.replace(/\s+/g, " ").trim();
        if (limpo.length > 32) throw falha("O apelido pode ter no máximo 32 caracteres.");
        novo.apelido = limpo;
      }
      const cor = campo("cor");
      if (cor !== undefined) {
        const limpa = cor.trim().toLowerCase();
        if (limpa && !/^#[0-9a-f]{6}$/.test(limpa)) throw falha("Escolha uma cor válida.");
        novo.cor = limpa || null;
      }
      const frase = campo("frase");
      if (frase !== undefined) {
        const limpa = frase.replace(/\s+/g, " ").trim();
        if (limpa.length > 80) throw falha("A frase pode ter no máximo 80 caracteres.");
        novo.frase = limpa;
      }
      const sobre = campo("sobre");
      if (sobre !== undefined) {
        const limpo = sobre.replace(/\r\n?/g, "\n").trim();
        if (limpo.length > 300) throw falha('O "Sobre mim" pode ter no máximo 300 caracteres.');
        novo.sobre = limpo;
      }
      for (const nome of ["foto", "faixa"]) {
        const arquivo = form.get(nome);
        if (arquivo instanceof File && arquivo.size) {
          if (!CONFIG.tiposDeImagem.includes(arquivo.type)) throw falha("Use imagens PNG, JPG, WEBP, GIF ou AVIF.");
          if (arquivo.size > CONFIG.maxImagem) throw falha("Cada imagem pode ter no máximo 10 MB.");
          novo[nome] = URL.createObjectURL(arquivo);
        } else if (form.get(`remover_${nome}`) === "1") {
          novo[nome] = null;
        }
      }
      novo.alteradoEm = new Date().toISOString();
      mundo.perfis[eu] = novo;
      const perfil = perfilPublico(eu);
      avisar("perfil", { usuario: eu, perfil });
      return { perfil };
    },
    async mesasDoAdmin() {
      await pausa();
      return mundo.mesas.map((m) => ({ ...m }));
    },
    async entrar(usuario, senha) {
      await pausa();
      if (!contaDe(usuario) || senha !== "teste") throw falha("Usuário ou senha incorretos.");
      eu = usuario;
      return { conta: contaDe(usuario) };
    },
    async sair() {
      eu = null;
      return { ok: true };
    },
    eventos(aoReceber) {
      ouvinte = aoReceber;
      const timer = setInterval(chegarMensagem, 20000);
      setTimeout(() => aoReceber("conectado", {}), 30);
      return {
        fechar: () => {
          clearInterval(timer);
          if (ouvinte === aoReceber) ouvinte = null;
        },
      };
    },

    // Só a prévia: o painel "Ver o chat como" e "Restaurar"
    trocarConta(usuario) {
      eu = usuario;
    },
    restaurar() {
      mundo = exemplosDaPrevia();
    },
  };
}

const api = MODO_PREVIA ? criarApiDePrevia() : apiDoServidor;

/* =================================================================
   Estado da página
   ================================================================= */

const estado = {
  dados: null, // o que o GET /api/chat devolve
  alvo: null, // { tipo: "canal" | "privada", id?, usuario?, chave }
  historicos: new Map(), // chave → { lista, maisAntigas, carregado, carregando }
  marcaNovas: null, // o id da primeira mensagem não lida do alvo aberto (a linha "Novas")
  marcaPendente: 0, // quantas não lidas o alvo tinha ao abrir, até o histórico chegar
  respondendo: null, // a mensagem que está sendo respondida
  editando: null, // { id, texto, mapa }
  anexos: [], // [{ arquivo, url }]
  mencoesEscolhidas: [], // [{ texto: "@Nome", usuario }]
  grudado: true, // a rolagem está no fim das mensagens
  eventos: null,
  lidaEnviada: new Map(), // chave → id
  ultimaLida: 0,
  esperaDaLida: null,
  esperaDosCanais: null,
  esperaDaReconexao: null,
  enviando: false,
};

// O extras.js (emojis, reações, GIFs e fixadas) preenche estes ganchos
const ganchosDosExtras = {
  conteudo: null, // (m, categoria) → os elementos depois do texto: o GIF e as reações
  acoes: null, // (m) → { antes: [botões], depois: [botões] } das ações da mensagem
  soEmojis: null, // (texto) → true se o texto for só emojis (aparece maior)
  cabeca: null, // () → o cabeçalho foi redesenhado (o botão das fixadas)
  escrever: null, // (inativa) → os botões de emoji e de GIF do campo
  evento: null, // (tipo, corpo) → os eventos "reacoes" e "fixadas"
  fechar: null, // () → fecha os painéis (trocou de canal)
};

// O voz.js preenche estes ganchos
const ganchosDaVoz = {
  abrirSala: null, // (canal, categoria) → mostra a sala no centro
  mudou: null, // () → as salas ou a estrutura mudaram
  ajustarPessoas: null, // (id da sala, pessoas) → a lista com o seu estado de agora
  salaConectada: null, // () → o id da sala em que você está, ou null
  encerrar: null, // () → sai da sala (saiu da conta)
  mover: null, // ({ canal }) → o administrador moveu você para outra sala
  depoisDaLista: null, // () → a lista foi redesenhada (o brilho de quem fala)
};

const eu = () => estado.dados?.conta.usuario;
const contaPorUsuario = (usuario) => estado.dados?.contas.find((c) => c.usuario === usuario);
const chaveDaPrivadaCom = (usuario) => `privada:${[eu(), usuario].sort().join("~")}`;
const outroDaChave = (chave) => chave.slice("privada:".length).split("~").find((u) => u !== eu()) ?? eu();
const ehChaveDePrivada = (chave) => typeof chave === "string" && chave.startsWith("privada:");

function acharCanal(id) {
  for (const categoria of estado.dados?.categorias ?? []) {
    const canal = categoria.canais.find((c) => c.id === id);
    if (canal) return { canal, categoria };
  }
  return null;
}

const privadaDaLista = (chave) => estado.dados?.privadas.find((p) => p.id === chave);

function trechoDe(texto) {
  const corrido = String(texto || "").replace(/\s+/g, " ").trim();
  const letras = [...corrido];
  return letras.length > CONFIG.tamanhoDoTrecho ? `${letras.slice(0, CONFIG.tamanhoDoTrecho).join("")}…` : corrido;
}

function lerLocal(chave) {
  try {
    return localStorage.getItem(chave);
  } catch {
    return null;
  }
}

function gravarLocal(chave, valor) {
  try {
    localStorage.setItem(chave, valor);
  } catch {
    // sem armazenamento: a escolha vale só nesta visita
  }
}

/* =================================================================
   Personas: a imagem e o nome de quem fala
   ================================================================= */

function corDaConta(usuario) {
  let soma = 0;
  for (const letra of String(usuario)) soma = (soma * 31 + letra.codePointAt(0)) >>> 0;
  return CORES_DAS_CONTAS[soma % CORES_DAS_CONTAS.length];
}

// A cor da mesa do alvo aberto (ou da categoria pedida), para o selo dos personagens sem retrato
function corDaCategoria(categoria) {
  return categoria?.cor || "#2e3756";
}

// O selo com a inicial, quando não há imagem
function seloDe(persona, cor, classe) {
  const letra = persona.tipo === "mestre" ? "M" : [...String(persona.nome || "?").trim()][0]?.toUpperCase() ?? "?";
  const selo = criar("span", `${classe} retrato retrato--selo`, letra);
  selo.style.setProperty("--cor-selo", persona.tipo === "conta" ? corDaConta(persona.id) : cor);
  selo.setAttribute("aria-hidden", "true");
  return selo;
}

function retratoDe(persona, categoria, classe = "") {
  const cor = corDaCategoria(categoria);
  if (!persona.imagem) return seloDe(persona, cor, classe);
  const img = imagem(persona.imagem, `${classe} retrato${persona.tipo === "mestre" ? " retrato--logo" : ""}`);
  img.loading = "lazy";
  img.addEventListener("error", () => img.replaceWith(seloDe(persona, cor, classe)), { once: true });
  return img;
}

function nomeDaPersona(persona, classe = "") {
  const nome = criar("span", `${classe} nome-persona`, persona.nome);
  if (persona.fonte) {
    carregarFontes([persona.fonte]);
    aplicarFonte(nome, persona.fonte);
    nome.classList.add("nome-persona--fonte");
  }
  return nome;
}

/* =================================================================
   Perfis: o apelido, a foto e o resto de cada conta (Geral e privadas)
   ================================================================= */

const LIMITES_DO_PERFIL = { apelido: 32, frase: 80, sobre: 300 };

function perfilDe(usuario) {
  const p = estado.dados?.perfis?.[usuario];
  return {
    apelido: p?.apelido ?? "",
    foto: p?.foto ?? null,
    faixa: p?.faixa ?? null,
    cor: p?.cor || corDaConta(usuario),
    frase: p?.frase ?? "",
    sobre: p?.sobre ?? "",
  };
}

// O nome da conta no chat: o apelido, ou o nome da conta
function apelidoDe(usuario) {
  const apelido = perfilDe(usuario).apelido.trim();
  if (apelido) return apelido;
  return contaPorUsuario(usuario)?.nome ?? privadaComUsuario(usuario)?.com.nome ?? usuario;
}

const privadaComUsuario = (usuario) => estado.dados?.privadas.find((p) => p.com.usuario === usuario);

function personaDaContaDe(usuario) {
  return { tipo: "conta", id: usuario, nome: apelidoDe(usuario), imagem: perfilDe(usuario).foto, fonte: null };
}

// O apelido grande e, quando for diferente, o nome da conta pequeno
function nomesDaConta(usuario, classe) {
  const caixa = criar("span", `${classe} nomes-conta`);
  const apelido = apelidoDe(usuario);
  const nomeConta = contaPorUsuario(usuario)?.nome ?? privadaComUsuario(usuario)?.com.nome ?? usuario;
  caixa.append(criar("span", "nomes-conta__apelido", apelido));
  if (nomeConta !== apelido) caixa.append(criar("small", "nomes-conta__conta", nomeConta));
  return caixa;
}

// Um perfil novo (o seu, salvo, ou o de outra conta, pelo evento): troca o nome e a foto
// em tudo o que a página já tem e redesenha
function aplicarPerfil(usuario, perfil) {
  if (!estado.dados) return;
  (estado.dados.perfis ??= {})[usuario] = perfil;
  const persona = personaDaContaDe(usuario);
  const trocar = (p) => {
    if (p?.tipo === "conta" && p.id === usuario) Object.assign(p, { nome: persona.nome, imagem: persona.imagem });
  };
  for (const h of estado.historicos.values()) for (const m of h.lista) trocar(m.persona);
  for (const personas of Object.values(estado.dados.personasDosMembros ?? {})) trocar(personas[usuario]);
  if (usuario === eu()) $("#nome-conta").textContent = persona.nome;
  desenharLista();
  desenharCabeca();
  desenharMembros();
  if (estado.alvo && !estado.alvo.voz) desenharMensagens();
  ganchosDaVoz.mudou?.();
  redesenharCard();
}

/* =================================================================
   Formatação do texto das mensagens
   -----------------------------------------------------------------
   Só estas marcas: **negrito**, *itálico*, ~~riscado~~, ||spoiler||,
   `código`, bloco entre ```, linha começando com "> " e links
   http(s). Tudo montado com elementos e textContent, nunca innerHTML.
   ================================================================= */

const PADRAO_EM_LINHA =
  /(`[^`\n]+`)|(\|\|[^\n]+?\|\|)|(\*\*[^\n]+?\*\*)|(~~[^\n]+?~~)|(\*[^*\n]+\*)|(<@(?:[a-z0-9_-]{2,30}|todos)>)|(https?:\/\/[^\s<>"]+)/g;

// O nome que aparece numa menção: a persona daquela pessoa no alvo aberto
function nomeDaMencao(usuario) {
  if (usuario === "todos") return "todos";
  const alvo = estado.alvo;
  if (alvo?.tipo === "canal") {
    const achado = acharCanal(alvo.id);
    const persona = achado && estado.dados.personasDosMembros?.[achado.categoria.id]?.[usuario];
    if (persona) return persona.nome;
  }
  return apelidoDe(usuario);
}

// O texto de uma resposta, numa linha só, sem as marcas de menção nem o spoiler
const trechoLegivel = (trecho) =>
  String(trecho || "")
    .replace(/<@([a-z0-9_-]{2,30}|todos)>/g, (_, usuario) => `@${nomeDaMencao(usuario)}`)
    .replace(/\|\|[^\n]+?\|\|/g, "▒▒▒");

function linkDe(endereco) {
  // A pontuação do fim da frase não faz parte do link
  let url = endereco.replace(/[.,;:!?'"]+$/, "");
  if (url.endsWith(")") && !url.includes("(")) url = url.slice(0, -1);
  let valido = null;
  try {
    valido = new URL(url);
  } catch {
    valido = null;
  }
  if (!valido || !/^https?:$/.test(valido.protocol)) return { elemento: document.createTextNode(endereco), sobra: "" };
  const a = criar("a", "msg__link", url);
  a.href = valido.href;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  return { elemento: a, sobra: endereco.slice(url.length) };
}

function spoilerDe(conteudo) {
  const spoiler = criar("span", "spoiler");
  spoiler.tabIndex = 0;
  spoiler.setAttribute("role", "button");
  spoiler.title = "Spoiler: clique para ver";
  emLinha(spoiler, conteudo);
  const revelar = (evento) => {
    evento.stopPropagation();
    spoiler.classList.add("spoiler--revelado");
    spoiler.removeAttribute("role");
    spoiler.removeAttribute("title");
  };
  spoiler.addEventListener("click", revelar);
  spoiler.addEventListener("keydown", (evento) => {
    if (evento.key === "Enter" || evento.key === " ") revelar(evento);
  });
  return spoiler;
}

function emLinha(destino, texto) {
  let ultimo = 0;
  for (const achado of texto.matchAll(PADRAO_EM_LINHA)) {
    if (achado.index > ultimo) destino.append(texto.slice(ultimo, achado.index));
    const [pedaco, codigo, spoiler, negrito, riscado, italico, mencao, link] = achado;
    if (codigo) destino.append(criar("code", "msg__codigo", codigo.slice(1, -1)));
    else if (spoiler) destino.append(spoilerDe(spoiler.slice(2, -2)));
    else if (negrito) {
      const forte = criar("strong");
      emLinha(forte, negrito.slice(2, -2));
      destino.append(forte);
    } else if (riscado) {
      const s = criar("s");
      emLinha(s, riscado.slice(2, -2));
      destino.append(s);
    } else if (italico) {
      const em = criar("em");
      emLinha(em, italico.slice(1, -1));
      destino.append(em);
    } else if (mencao && mencoesComoTexto) {
      destino.append(mencao);
    } else if (mencao) {
      const usuario = mencao.slice(2, -1);
      const marca = criar("span", "mencao", `@${nomeDaMencao(usuario)}`);
      if (usuario === eu() || usuario === "todos") marca.classList.add("mencao--voce");
      destino.append(marca);
    } else if (link) {
      const { elemento, sobra } = linkDe(link);
      destino.append(elemento);
      if (sobra) destino.append(sobra);
    }
    ultimo = achado.index + pedaco.length;
  }
  if (ultimo < texto.length) destino.append(texto.slice(ultimo));
}

// Linhas comuns (com <br>) e citações ("> ")
function blocoDeTexto(destino, texto) {
  const linhas = texto.split("\n");
  let grupo = null;
  let citacao = false;
  const fechar = () => {
    if (grupo) destino.append(grupo);
    grupo = null;
  };
  for (const linha of linhas) {
    const ehCitacao = linha.startsWith("> ");
    if (!grupo || ehCitacao !== citacao) {
      fechar();
      citacao = ehCitacao;
      grupo = criar(citacao ? "blockquote" : "div", citacao ? "msg__citacao" : "msg__linhas");
    } else {
      grupo.append(criar("br"));
    }
    emLinha(grupo, ehCitacao ? linha.slice(2) : linha);
  }
  fechar();
}

// O "Sobre mim" usa as mesmas marcas, menos as menções (ficam como texto)
let mencoesComoTexto = false;

function desenharTexto(destino, texto, { semMencoes = false } = {}) {
  mencoesComoTexto = semMencoes;
  try {
    desenharTextoComMarcas(destino, texto);
  } finally {
    mencoesComoTexto = false;
  }
}

function desenharTextoComMarcas(destino, texto) {
  const partes = texto.split("```");
  let pendente = "";
  let depoisDoCodigo = false;
  const descarregar = (antesDoCodigo) => {
    let pedaco = pendente;
    if (depoisDoCodigo) pedaco = pedaco.replace(/^\n/, "");
    if (antesDoCodigo) pedaco = pedaco.replace(/\n$/, "");
    if (pedaco) blocoDeTexto(destino, pedaco);
    pendente = "";
  };
  partes.forEach((parte, i) => {
    const ehCodigo = i % 2 === 1 && i < partes.length - 1;
    if (!ehCodigo) {
      pendente += i % 2 === 1 ? `\`\`\`${parte}` : parte; // um ``` sem par fica como texto
      return;
    }
    descarregar(true);
    const pre = criar("pre", "msg__bloco");
    pre.append(criar("code", null, parte.replace(/^\n/, "").replace(/\n$/, "")));
    destino.append(pre);
    depoisDoCodigo = true;
  });
  descarregar(false);
}

/* =================================================================
   Datas
   ================================================================= */

const dataDe = (iso) => new Date(iso);
const horaDe = (iso) => dataDe(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
const diaDe = (iso) => dataDe(iso).toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" });
const dataCompleta = (iso) => `${diaDe(iso)}, ${horaDe(iso)}`;
const mesmoDia = (a, b) => dataDe(a).toDateString() === dataDe(b).toDateString();

/* =================================================================
   Entrada e saída
   ================================================================= */

function mostrarEntrada(mensagem = "") {
  ganchosDaVoz.encerrar?.();
  fecharEventos();
  fecharCard();
  for (const dialogo of document.querySelectorAll("dialog[open]")) dialogo.close();
  limparAnexos();
  estado.dados = null;
  estado.alvo = null;
  estado.historicos.clear();
  estado.lidaEnviada.clear();
  estado.respondendo = null;
  estado.editando = null;
  $("#chat").hidden = true;
  $("#simulacao").hidden = true;
  $("#entrada").hidden = false;
  $("#dica-teste").hidden = !MODO_PREVIA;
  document.title = "Chat · Crônicas Eternas";
  const erro = $("#erro-entrar");
  erro.textContent = mensagem;
  erro.hidden = !mensagem;
  $("#form-entrar").elements.usuario.focus();
}

function sessaoPerdida() {
  if (estado.dados) mostrarEntrada("Sua sessão terminou. Entre de novo para continuar.");
}

function configurarEntrada() {
  const form = $("#form-entrar");
  const erro = $("#erro-entrar");
  const enviar = form.querySelector('button[type="submit"]');
  const textoDoBotao = enviar.querySelector(".botao__texto");

  form.addEventListener("input", () => {
    form.classList.toggle("portao--pronto", Boolean(form.elements.usuario.value.trim() && form.elements.senha.value));
  });

  form.addEventListener("submit", async (evento) => {
    evento.preventDefault();
    erro.hidden = true;
    const usuario = form.elements.usuario.value.trim();
    const senha = form.elements.senha.value;
    if (!usuario || !senha) {
      erro.textContent = "Preencha o usuário e a senha.";
      erro.hidden = false;
      return;
    }
    enviar.disabled = true;
    textoDoBotao.textContent = "Entrando…";
    try {
      await api.entrar(usuario, senha, form.elements.lembrar.checked);
      form.reset();
      form.classList.remove("portao--pronto");
      await abrirChat();
    } catch (falha) {
      erro.textContent = falha.message;
      erro.hidden = false;
      form.elements.senha.select();
    } finally {
      enviar.disabled = false;
      textoDoBotao.textContent = "Entrar";
    }
  });
}

async function sair() {
  try {
    await api.sair();
  } catch {
    // mesmo sem resposta, a tela volta para a entrada
  }
  mostrarEntrada();
}

async function abrirChat() {
  estado.dados = await api.estado();
  $("#entrada").hidden = true;
  $("#chat").hidden = false;
  if (MODO_PREVIA) {
    $("#simulacao").hidden = false;
    $("#sim-conta").value = eu();
  }
  $("#nome-conta").textContent = apelidoDe(eu());
  desenharLista();
  abrirPeloEndereco();
  conectarEventos();
}

/* =================================================================
   O link para o portal
   ================================================================= */

function enderecoDoPortal() {
  const host = location.hostname;
  if (!MODO_PREVIA && host.startsWith("chat.")) return `https://${host.slice("chat.".length)}/`;
  return COMO_ARQUIVO ? `${RAIZ}index.html` : RAIZ;
}

/* =================================================================
   Coluna da esquerda: a lista
   ================================================================= */

function contadorDe(numero, classe = "") {
  const marca = criar("span", `contador-chat ${classe}`, String(numero > 99 ? "99+" : numero));
  marca.setAttribute("aria-label", numero === 1 ? "1 menção" : `${numero} menções`);
  return marca;
}

function itemDoCanal(canal, categoria) {
  const item = criar("div", "item-canal");
  item.dataset.canal = canal.id;
  const link = criar("a", "item-canal__link");
  link.href = `#canal-${canal.id}`;
  link.append(simbolo(canal.tipo === "voz" ? "icone-voz" : "icone-texto", "item-canal__icone"), criar("span", "item-canal__nome", canal.nome));
  if (canal.tipo === "texto") {
    if (canal.naoLidas > 0) item.classList.add("item-canal--nao-lido");
    if (canal.mencoes > 0) link.append(contadorDe(canal.mencoes));
  }
  if (estado.alvo?.tipo === "canal" && estado.alvo.id === canal.id) {
    item.classList.add("item-canal--atual");
    link.setAttribute("aria-current", "page");
  }
  item.append(link);

  if (estado.dados.conta.admin || canal.tipo === "texto") {
    const menu = criar("button", "icone-botao item-canal__menu");
    menu.type = "button";
    menu.title = "Opções do canal";
    menu.setAttribute("aria-label", `Opções de ${canal.nome}`);
    menu.append(simbolo("icone-menu"));
    menu.addEventListener("click", (evento) => {
      evento.preventDefault();
      abrirMenuDoCanal(menu, canal, categoria);
    });
    item.append(menu);
  }

  // Quem está numa sala de voz, com os ícones de mudo, ensurdecido, câmera e tela
  if (canal.tipo === "voz") {
    if (ganchosDaVoz.salaConectada?.() === canal.id) item.classList.add("item-canal--conectado");
    let pessoas = estado.dados.voz?.salas?.[canal.id] ?? [];
    if (ganchosDaVoz.ajustarPessoas) pessoas = ganchosDaVoz.ajustarPessoas(canal.id, pessoas);
    if (pessoas.length) {
      const lista = criar("ul", "item-canal__sala");
      for (const pessoa of pessoas) {
        const linha = criar("li");
        linha.dataset.usuario = pessoa.usuario;
        linha.dataset.sala = canal.id;
        if (estado.dados.conta.admin) linha.draggable = true; // arrastar para outra sala (voz.js)
        const conta = contaPorUsuario(pessoa.usuario);
        if (conta) linha.title = `por ${conta.nome}`;
        const circulo = criar("span", "item-canal__voz"); // o brilho de quem fala (voz.js) é deste círculo
        circulo.append(retratoDe(pessoa, categoria, "item-canal__retrato"));
        linha.append(circulo, nomeDaPersona(pessoa, "item-canal__pessoa"));
        abreCard(linha, () => ({ usuario: pessoa.usuario, persona: personaDaPresencaNaSala(pessoa, categoria), categoria }));
        const icones = criar("span", "item-canal__estados");
        if (pessoa.ensurdecido) icones.append(simbolo("icone-fone-mudo", "estado-voz estado-voz--desligado"));
        else if (pessoa.mudo) icones.append(simbolo("icone-microfone-mudo", "estado-voz estado-voz--desligado"));
        if (pessoa.camera) icones.append(simbolo("icone-camera", "estado-voz"));
        if (pessoa.tela) icones.append(simbolo("icone-tela", "estado-voz"));
        linha.append(icones);
        lista.append(linha);
      }
      item.append(lista);
    }
  }
  return item;
}

function cabecaDaCategoria(titulo, acao) {
  const cabeca = criar("div", "categoria__cabeca");
  cabeca.append(criar("h2", "categoria__nome", titulo));
  if (acao) cabeca.append(acao);
  return cabeca;
}

function botaoDeIcone(icone, rotulo, aoClicar, classe = "") {
  const b = criar("button", `icone-botao ${classe}`);
  b.type = "button";
  b.title = rotulo;
  b.setAttribute("aria-label", rotulo);
  b.append(simbolo(icone));
  b.addEventListener("click", aoClicar);
  return b;
}

function itemDaPrivada(privada) {
  const item = criar("div", "item-canal item-privada");
  const conta = contaPorUsuario(privada.com.usuario);
  const link = criar("a", "item-canal__link");
  link.href = `#privada-${privada.com.usuario}`;
  const ponto = criar("span", "presenca");
  ponto.classList.toggle("presenca--no-chat", Boolean(conta?.noChat));
  ponto.title = conta?.noChat ? "No chat agora" : "Fora do chat";
  const persona = personaDaContaDe(privada.com.usuario);
  const retrato = criar("span", "item-privada__retrato");
  retrato.append(retratoDe(persona, null, "item-privada__selo"), ponto);
  link.append(retrato, nomesDaConta(privada.com.usuario, "item-canal__nome"));
  if (privada.naoLidas > 0) {
    item.classList.add("item-canal--nao-lido");
    link.append(contadorDe(privada.naoLidas));
  }
  if (estado.alvo?.tipo === "privada" && estado.alvo.chave === privada.id) {
    item.classList.add("item-canal--atual");
    link.setAttribute("aria-current", "page");
  }
  item.append(
    link,
    botaoDeIcone("icone-fechar", `Tirar a conversa com ${persona.nome} da lista`, () => ocultarPrivada(privada), "item-canal__menu"),
  );
  return item;
}

function desenharLista() {
  const lista = $("#lista");
  const partes = [];
  for (const categoria of estado.dados.categorias) {
    const secao = criar("section", categoria.mesa ? "categoria categoria--mesa" : "categoria");
    if (categoria.cor) secao.style.setProperty("--cor", categoria.cor);
    const mais = estado.dados.conta.admin
      ? botaoDeIcone("icone-mais", `Criar canal em ${categoria.nome}`, () => abrirDialogoDoCanal({ categoria }))
      : null;
    secao.append(cabecaDaCategoria(categoria.nome, mais));
    for (const canal of categoria.canais) secao.append(itemDoCanal(canal, categoria));
    partes.push(secao);
  }

  const privadas = criar("section", "categoria categoria--privadas");
  privadas.append(cabecaDaCategoria("Mensagens privadas", botaoDeIcone("icone-mais", "Nova conversa", abrirNovaConversa)));
  const conversas = [...estado.dados.privadas];
  // A privada aberta, ainda sem mensagens, aparece na lista enquanto está aberta
  if (estado.alvo?.tipo === "privada" && !privadaDaLista(estado.alvo.chave)) {
    const conta = contaPorUsuario(estado.alvo.usuario);
    conversas.unshift({ id: estado.alvo.chave, com: { usuario: estado.alvo.usuario, nome: conta?.nome ?? estado.alvo.usuario }, naoLidas: 0, ativa: Boolean(conta) });
  }
  for (const privada of conversas) privadas.append(itemDaPrivada(privada));
  if (!conversas.length) privadas.append(criar("p", "categoria__vazia", "Nenhuma conversa ainda."));
  partes.push(privadas);

  const rolagem = lista.scrollTop;
  lista.replaceChildren(...partes);
  lista.scrollTop = rolagem;
  atualizarTitulo();
  ganchosDaVoz.depoisDaLista?.();
}

// (3) Chat · Crônicas Eternas: menções + privadas não lidas
function atualizarTitulo() {
  if (!estado.dados) return;
  let total = 0;
  for (const categoria of estado.dados.categorias) for (const canal of categoria.canais) total += canal.mencoes || 0;
  for (const privada of estado.dados.privadas) total += privada.naoLidas || 0;
  document.title = total ? `(${total}) Chat · Crônicas Eternas` : "Chat · Crônicas Eternas";
}

/* =================================================================
   Menus pequenos (opções do canal, persona, configurações)
   ================================================================= */

let menuAberto = null;
let ancoraDoMenu = null;

function fecharMenu() {
  menuAberto?.remove();
  menuAberto = null;
  ancoraDoMenu = null;
}

// "itens": [{ texto, acao, perigo?, desligado?, atual?, conteudo? (elemento no lugar do texto) }],
// ou { titulo } para um rótulo que separa um grupo de itens
function abrirMenu(ancora, itens) {
  fecharMenu();
  const menu = criar("div", "menu-chat");
  menu.setAttribute("role", "menu");
  for (const item of itens) {
    if (item.titulo) {
      menu.append(criar("span", "menu-chat__titulo", item.titulo));
      continue;
    }
    const b = criar("button", `menu-chat__item${item.perigo ? " menu-chat__item--perigo" : ""}${item.atual ? " menu-chat__item--atual" : ""}`);
    b.type = "button";
    b.setAttribute("role", "menuitem");
    b.disabled = Boolean(item.desligado);
    if (item.conteudo) b.append(item.conteudo);
    else b.textContent = item.texto;
    b.addEventListener("click", () => {
      fecharMenu();
      item.acao();
    });
    menu.append(b);
  }
  document.body.append(menu);
  const caixa = ancora.getBoundingClientRect();
  const largura = menu.offsetWidth;
  const altura = menu.offsetHeight;
  const esquerda = Math.min(caixa.left, window.innerWidth - largura - 8);
  const topo = caixa.bottom + altura + 8 > window.innerHeight ? caixa.top - altura - 4 : caixa.bottom + 4;
  menu.style.setProperty("left", `${Math.max(8, esquerda) + window.scrollX}px`);
  menu.style.setProperty("top", `${Math.max(8, topo) + window.scrollY}px`);
  menuAberto = menu;
  ancoraDoMenu = ancora;
  menu.querySelector("button:not(:disabled)")?.focus();
}

document.addEventListener("click", (evento) => {
  if (menuAberto && !menuAberto.contains(evento.target) && !ancoraDoMenu?.contains(evento.target)) fecharMenu();
});
document.addEventListener("keydown", (evento) => {
  if (evento.key === "Escape" && menuAberto) {
    fecharMenu();
    evento.stopPropagation();
  }
});
window.addEventListener("resize", fecharMenu);

/* =================================================================
   Administração dos canais e das categorias
   ================================================================= */

// Os avisos (de todos, nos canais de texto) e a administração (só o administrador)
function abrirMenuDoCanal(ancora, canal, categoria) {
  const itens = [];
  if (canal.tipo === "texto") {
    const nivel = canal.aviso || "tudo";
    itens.push({ titulo: "Avisos" });
    for (const [valor, texto] of NIVEIS_DE_AVISO) {
      itens.push({ texto, atual: nivel === valor, acao: () => mudarAviso(canal, valor) });
    }
  }
  if (estado.dados.conta.admin) {
    const indice = categoria.canais.indexOf(canal);
    if (itens.length) itens.push({ titulo: "Canal" });
    itens.push(
      { texto: "Renomear", acao: () => abrirDialogoDoCanal({ categoria, canal }) },
      { texto: "Subir", desligado: indice <= 0, acao: () => moverCanal(canal, indice - 1) },
      { texto: "Descer", desligado: indice >= categoria.canais.length - 1, acao: () => moverCanal(canal, indice + 1) },
      { texto: "Apagar", perigo: true, acao: () => apagarCanal(canal) },
    );
  }
  abrirMenu(ancora, itens);
}

async function moverCanal(canal, ordem) {
  try {
    await api.alterarCanal(canal.id, { ordem });
    await recarregarEstado();
  } catch (falha) {
    avisarFalha(falha);
  }
}

async function apagarCanal(canal) {
  const confirmado = await perguntar({
    titulo: `Apagar ${canal.tipo === "voz" ? "a sala" : "o canal"} "${canal.nome}"?`,
    texto: canal.tipo === "voz" ? "Quem estiver na sala sai dela." : "O histórico do canal some para todos, com as imagens. Não dá para desfazer.",
    confirmar: "Apagar",
    cancelar: "Cancelar",
    perigo: true,
  });
  if (!confirmado) return;
  try {
    await api.apagarCanal(canal.id);
    await recarregarEstado();
  } catch (falha) {
    avisarFalha(falha);
  }
}

let canalEmEdicao = null; // { categoria, canal? }

function abrirDialogoDoCanal(contexto) {
  canalEmEdicao = contexto;
  const form = $("#form-canal");
  form.reset();
  $("#erro-canal").hidden = true;
  const renomear = Boolean(contexto.canal);
  $("#canal-titulo").textContent = renomear ? "Renomear canal" : `Novo canal em ${contexto.categoria.nome}`;
  $("#canal-tipo").hidden = renomear;
  $("#canal-enviar").textContent = renomear ? "Salvar" : "Criar";
  form.elements.nome.value = renomear ? contexto.canal.nome : "";
  $("#dialogo-canal").showModal();
  form.elements.nome.focus();
}

function configurarDialogoDoCanal() {
  const form = $("#form-canal");
  const dialogo = $("#dialogo-canal");
  fecharAoClicarFora(dialogo);
  $("#canal-cancelar").addEventListener("click", () => dialogo.close());
  form.addEventListener("submit", async (evento) => {
    evento.preventDefault();
    const erro = $("#erro-canal");
    const nome = form.elements.nome.value.trim();
    if (!nome) {
      erro.textContent = "Escreva o nome do canal.";
      erro.hidden = false;
      return;
    }
    const enviar = $("#canal-enviar");
    enviar.disabled = true;
    try {
      if (canalEmEdicao.canal) await api.alterarCanal(canalEmEdicao.canal.id, { nome });
      else await api.criarCanal(canalEmEdicao.categoria.id, form.elements.tipo.value, nome);
      dialogo.close();
      await recarregarEstado();
    } catch (falha) {
      erro.textContent = falha.message;
      erro.hidden = false;
    } finally {
      enviar.disabled = false;
    }
  });
}

function abrirConfiguracoes() {
  const itens = [{ titulo: "Perfil" }, { texto: "Seu perfil", acao: abrirPerfil }, { titulo: "Avisos" }, itemDosAvisos(), itemDoSom()];
  if (estado.dados.conta.admin) itens.push({ titulo: "Administração" }, { texto: "Categorias das mesas", acao: abrirCategorias });
  abrirMenu($("#botao-configuracoes"), itens);
}

// As mesas na ordem da lista: primeiro as que têm categoria (na ordem delas), depois as outras
let ordemDasMesas = [];

async function abrirCategorias() {
  let mesas;
  try {
    mesas = await api.mesasDoAdmin();
  } catch (falha) {
    return avisarFalha(falha);
  }
  const marcadas = estado.dados.categorias.filter((c) => c.mesa).map((c) => c.mesa);
  ordemDasMesas = [
    ...marcadas.map((id) => mesas.find((m) => m.id === id)).filter(Boolean).map((m) => ({ mesa: m, marcada: true })),
    ...mesas.filter((m) => !marcadas.includes(m.id)).map((m) => ({ mesa: m, marcada: false })),
  ];
  $("#erro-categorias").hidden = true;
  desenharCategorias();
  $("#dialogo-categorias").showModal();
}

function desenharCategorias() {
  const linhas = ordemDasMesas.map((item, i) => {
    const linha = criar("div", "linha-categoria");
    linha.style.setProperty("--cor", item.mesa.cor || "#2e3756");
    const rotulo = criar("label", "caixa");
    const caixa = criar("input");
    caixa.type = "checkbox";
    caixa.checked = item.marcada;
    caixa.addEventListener("change", () => (item.marcada = caixa.checked));
    rotulo.append(caixa, criar("span", "caixa__marca"), criar("span", "linha-categoria__nome", item.mesa.nome));
    const mover = (para) => {
      const [tirado] = ordemDasMesas.splice(i, 1);
      ordemDasMesas.splice(para, 0, tirado);
      desenharCategorias();
    };
    const subir = botao("↑", "botao--leve botao--pequeno", () => mover(i - 1));
    subir.disabled = i === 0;
    subir.setAttribute("aria-label", `Subir ${item.mesa.nome}`);
    const descer = botao("↓", "botao--leve botao--pequeno", () => mover(i + 1));
    descer.disabled = i === ordemDasMesas.length - 1;
    descer.setAttribute("aria-label", `Descer ${item.mesa.nome}`);
    linha.append(rotulo, subir, descer);
    return linha;
  });
  if (!linhas.length) linhas.push(criar("p", "categoria__vazia", "Nenhuma mesa cadastrada."));
  $("#lista-categorias").replaceChildren(...linhas);
}

function configurarCategorias() {
  const dialogo = $("#dialogo-categorias");
  fecharAoClicarFora(dialogo);
  $("#categorias-cancelar").addEventListener("click", () => dialogo.close());
  $("#categorias-salvar").addEventListener("click", async () => {
    const mesas = ordemDasMesas.filter((i) => i.marcada).map((i) => i.mesa.id);
    const antes = estado.dados.categorias.filter((c) => c.mesa).map((c) => c.mesa);
    const saem = antes.filter((id) => !mesas.includes(id));
    if (saem.length) {
      const nomes = saem.map((id) => ordemDasMesas.find((i) => i.mesa.id === id)?.mesa.nome ?? id).join(", ");
      dialogo.close();
      const confirmado = await perguntar({
        titulo: "Tirar categorias?",
        texto: `${nomes} perde${saem.length > 1 ? "m" : ""} os canais e todo o histórico deles. Não dá para desfazer.`,
        confirmar: "Tirar",
        cancelar: "Cancelar",
        perigo: true,
      });
      if (!confirmado) return dialogo.showModal();
    }
    const salvar = $("#categorias-salvar");
    salvar.disabled = true;
    try {
      await api.categorias(mesas);
      if (dialogo.open) dialogo.close();
      await recarregarEstado();
      avisoRapido("Categorias salvas.");
    } catch (falha) {
      if (!dialogo.open) dialogo.showModal();
      $("#erro-categorias").textContent = falha.message;
      $("#erro-categorias").hidden = false;
    } finally {
      salvar.disabled = false;
    }
  });
}

/* =================================================================
   Privadas: nova conversa e ocultar
   ================================================================= */

function abrirNovaConversa() {
  const contas = estado.dados.contas.filter((c) => c.usuario !== eu()).sort((a, b) => apelidoDe(a.usuario).localeCompare(apelidoDe(b.usuario), "pt-BR"));
  const itens = contas.map((conta) => {
    const b = criar("button", "linha-conta");
    b.type = "button";
    const ponto = criar("span", "presenca");
    ponto.classList.toggle("presenca--no-chat", Boolean(conta.noChat));
    const retrato = criar("span", "item-privada__retrato");
    retrato.append(retratoDe(personaDaContaDe(conta.usuario), null, "item-privada__selo"), ponto);
    const apelido = apelidoDe(conta.usuario);
    b.append(retrato, criar("span", "linha-conta__nome", apelido), criar("span", "linha-conta__usuario", apelido === conta.nome ? conta.usuario : conta.nome));
    b.addEventListener("click", () => {
      $("#dialogo-nova-conversa").close();
      irPara(`#privada-${conta.usuario}`);
    });
    return b;
  });
  if (!itens.length) itens.push(criar("p", "categoria__vazia", "Nenhuma outra conta."));
  $("#lista-contas").replaceChildren(...itens);
  $("#dialogo-nova-conversa").showModal();
}

async function ocultarPrivada(privada) {
  try {
    await api.ocultar(privada.com.usuario);
  } catch (falha) {
    return avisarFalha(falha);
  }
  estado.dados.privadas = estado.dados.privadas.filter((p) => p.id !== privada.id);
  if (estado.alvo?.chave === privada.id) irPara("");
  else desenharLista();
}

/* =================================================================
   Endereço: qual canal está aberto
   ================================================================= */

function irPara(hash) {
  if (location.hash === hash || (!hash && !location.hash)) abrirPeloEndereco();
  else location.hash = hash;
}

function alvoPadrao() {
  const ultimo = lerLocal("chat:ultimo");
  if (ultimo && alvoDoHash(ultimo)) return ultimo;
  const geral = estado.dados.categorias.find((c) => !c.mesa) ?? estado.dados.categorias[0];
  const canal = geral?.canais.find((c) => c.tipo === "texto");
  return canal ? `#canal-${canal.id}` : "";
}

// "#canal-<id>" ou "#privada-<usuario>" → o alvo, ou null se a conta não vê
function alvoDoHash(hash) {
  const canal = /^#canal-([\w-]+)$/.exec(hash);
  if (canal) {
    const achado = acharCanal(canal[1]);
    return achado ? { tipo: "canal", id: achado.canal.id, chave: achado.canal.id, voz: achado.canal.tipo === "voz" } : null;
  }
  const privada = /^#privada-([a-z0-9_-]{2,30})$/.exec(hash);
  if (privada && privada[1] !== eu()) {
    const chave = chaveDaPrivadaCom(privada[1]);
    if (contaPorUsuario(privada[1]) || privadaDaLista(chave)) return { tipo: "privada", usuario: privada[1], chave };
  }
  return null;
}

function abrirPeloEndereco() {
  if (!estado.dados) return;
  let alvo = alvoDoHash(location.hash);
  if (!alvo) {
    const padrao = alvoPadrao();
    alvo = alvoDoHash(padrao);
    if (location.hash !== padrao) {
      try {
        history.replaceState(null, "", padrao || location.pathname + location.search);
      } catch {
        // alguns quadros de prévia não deixam mudar o endereço
      }
    }
  }
  abrirAlvo(alvo);
}

function abrirAlvo(alvo) {
  const mesmo = alvo && estado.alvo && alvo.chave === estado.alvo.chave;
  if (!mesmo) {
    estado.respondendo = null;
    estado.editando = null;
    estado.mencoesEscolhidas = [];
    limparAnexos();
    $("#campo-texto").value = "";
    ajustarCampo();
  }
  estado.alvo = alvo;
  fecharListaDeMencoes();
  fecharCard();
  ganchosDosExtras.fechar?.();
  desenharLista();
  desenharCabeca();
  desenharMembros();
  if (!alvo) {
    $("#mensagens").replaceChildren(criar("p", "mensagens__vazio", "Nenhum canal para abrir."));
    $("#escrever").hidden = true;
    $("#sala").hidden = true;
    $("#mensagens").hidden = false;
    return;
  }
  if (!alvo.voz) gravarLocal("chat:ultimo", alvo.tipo === "privada" ? `#privada-${alvo.usuario}` : `#canal-${alvo.id}`);

  if (alvo.voz) {
    $("#mensagens").hidden = true;
    $("#escrever").hidden = true;
    $("#sala").hidden = false;
    const { canal, categoria } = acharCanal(alvo.id);
    if (ganchosDaVoz.abrirSala) ganchosDaVoz.abrirSala(canal, categoria);
    else $("#sala").replaceChildren(criar("p", "mensagens__vazio", `${canal.nome}: a voz chega em breve.`));
    return;
  }

  $("#sala").hidden = true;
  $("#mensagens").hidden = false;
  $("#escrever").hidden = false;
  desenharEscrever();
  if (!mesmo) {
    estado.marcaNovas = null;
    estado.marcaPendente = naoLidasDoAlvo(alvo);
    estado.grudado = true;
  }
  const h = estado.historicos.get(alvo.chave);
  if (h?.carregado) {
    if (!mesmo) definirMarcaNovas(h);
    desenharMensagens(mesmo ? "manter" : "abrir");
  } else {
    $("#mensagens").replaceChildren(criar("p", "mensagens__vazio", "Carregando…"));
    carregarHistorico(alvo);
  }
  if (!mesmo) $("#campo-texto").focus();
}

function naoLidasDoAlvo(alvo) {
  if (alvo.tipo === "privada") return privadaDaLista(alvo.chave)?.naoLidas ?? 0;
  return acharCanal(alvo.id)?.canal.naoLidas ?? 0;
}

// A linha "Novas" fica antes da primeira mensagem não lida, contando de trás as das outras contas
function definirMarcaNovas(h) {
  let faltam = estado.marcaPendente || 0;
  estado.marcaPendente = 0;
  estado.marcaNovas = null;
  if (!faltam) return;
  for (let i = h.lista.length - 1; i >= 0; i--) {
    if (h.lista[i].autor.usuario === eu()) continue;
    faltam--;
    if (faltam === 0) {
      estado.marcaNovas = h.lista[i].id;
      return;
    }
  }
  if (h.lista.length) estado.marcaNovas = h.lista[0].id;
}

async function carregarHistorico(alvo) {
  const chave = alvo.chave;
  const h = estado.historicos.get(chave) ?? { lista: [], maisAntigas: false, carregado: false, carregando: false };
  estado.historicos.set(chave, h);
  if (h.carregando) return;
  h.carregando = true;
  try {
    const resposta = await api.mensagens(alvo);
    // Mensagens que chegaram pelos eventos enquanto o histórico vinha
    const chegadas = h.lista.filter((m) => !resposta.mensagens.some((r) => r.id === m.id));
    h.lista = [...resposta.mensagens, ...chegadas];
    h.maisAntigas = resposta.maisAntigas;
    h.carregado = true;
  } catch (falha) {
    if (estado.alvo?.chave === chave) {
      $("#mensagens").replaceChildren(criar("p", "mensagens__vazio", falha.message));
    }
    estado.historicos.delete(chave);
    return;
  } finally {
    h.carregando = false;
  }
  if (estado.alvo?.chave === chave) {
    definirMarcaNovas(h);
    desenharMensagens("abrir");
  }
}

async function carregarMaisAntigas() {
  const alvo = estado.alvo;
  const h = alvo && estado.historicos.get(alvo.chave);
  if (!h?.carregado || !h.maisAntigas || h.carregando || !h.lista.length) return false;
  h.carregando = true;
  try {
    const resposta = await api.mensagens(alvo, { antes: h.lista[0].id });
    const novas = resposta.mensagens.filter((m) => !h.lista.some((x) => x.id === m.id));
    h.lista = [...novas, ...h.lista];
    h.maisAntigas = resposta.maisAntigas;
  } catch (falha) {
    avisoRapido(falha.message);
    return false;
  } finally {
    h.carregando = false;
  }
  if (estado.alvo?.chave === alvo.chave) desenharMensagens("antigas");
  return true;
}

/* =================================================================
   Centro: o cabeçalho do canal e a persona
   ================================================================= */

function personaEscolhidaDa(mesa) {
  const info = estado.dados.personas?.[mesa];
  if (!info) return null;
  return info.opcoes.find((o) => o.tipo === info.escolhida?.tipo && o.id === info.escolhida?.id) ?? info.opcoes[0] ?? null;
}

function desenharCabeca() {
  const titulo = $("#titulo-canal");
  const falando = $("#falando-como");
  titulo.replaceChildren();
  falando.replaceChildren();
  falando.hidden = true;
  ganchosDosExtras.cabeca?.();
  const alvo = estado.alvo;
  if (!alvo) return;
  if (alvo.tipo === "privada") {
    titulo.append(simbolo("icone-privada", "centro__icone"), apelidoDe(alvo.usuario));
    return;
  }
  const { canal, categoria } = acharCanal(alvo.id);
  titulo.append(simbolo(canal.tipo === "voz" ? "icone-voz" : "icone-texto", "centro__icone"), canal.nome);
  if (categoria.mesa) titulo.append(criar("span", "centro__categoria", categoria.nome));
  if (!categoria.mesa || canal.tipo === "voz") return;

  const info = estado.dados.personas?.[categoria.mesa];
  const atual = personaEscolhidaDa(categoria.mesa);
  if (!info || !atual) return;
  falando.hidden = false;
  falando.append(criar("span", "falando-como__rotulo", "Falando como"));
  const conteudo = () => {
    const caixa = criar("span", "seletor-persona__conteudo");
    caixa.append(retratoDe(atual, categoria, "seletor-persona__retrato"), nomeDaPersona(atual));
    return caixa;
  };
  if (info.opcoes.length < 2) {
    const fixo = criar("span", "seletor-persona seletor-persona--fixo");
    fixo.append(conteudo());
    falando.append(fixo);
    return;
  }
  const seletor = criar("button", "seletor-persona");
  seletor.type = "button";
  seletor.setAttribute("aria-haspopup", "menu");
  seletor.title = "Trocar a persona nesta mesa";
  seletor.append(conteudo(), criar("span", "seletor-persona__seta", "▾"));
  seletor.addEventListener("click", () => {
    if (menuAberto) return fecharMenu();
    abrirMenu(
      seletor,
      info.opcoes.map((opcao) => {
        const linha = criar("span", "seletor-persona__conteudo");
        linha.append(retratoDe(opcao, categoria, "seletor-persona__retrato"), nomeDaPersona(opcao));
        return { conteudo: linha, atual: opcao.tipo === atual.tipo && opcao.id === atual.id, acao: () => escolherPersona(categoria.mesa, opcao) };
      }),
    );
  });
  falando.append(seletor);
}

async function escolherPersona(mesa, opcao) {
  try {
    await api.escolherPersona(mesa, { tipo: opcao.tipo, id: opcao.id });
  } catch (falha) {
    return avisarFalha(falha);
  }
  estado.dados.personas[mesa].escolhida = { tipo: opcao.tipo, id: opcao.id };
  desenharCabeca();
  agendarRecarga(); // as menções e a coluna da direita usam a persona nova
}

/* =================================================================
   Centro: as mensagens
   ================================================================= */

function linhaDeDia(iso) {
  const linha = criar("div", "divisa");
  linha.append(criar("span", "divisa__texto", diaDe(iso)));
  return linha;
}

function linhaNovas() {
  const linha = criar("div", "divisa divisa--novas");
  linha.append(criar("span", "divisa__texto", "Novas"));
  return linha;
}

const mesmaPersona = (a, b) => a.persona.tipo === b.persona.tipo && a.persona.id === b.persona.id && a.autor.usuario === b.autor.usuario;

function continuaDe(anterior, m) {
  if (!anterior || m.resposta || m.id === estado.marcaNovas) return false;
  if (!mesmaPersona(anterior, m) || !mesmoDia(anterior.em, m.em)) return false;
  return dataDe(m.em) - dataDe(anterior.em) <= CONFIG.minutosDoGrupo * 60000;
}

function categoriaDoAlvo() {
  return estado.alvo?.tipo === "canal" ? acharCanal(estado.alvo.id)?.categoria ?? null : null;
}

function blocoDaResposta(m, categoria) {
  const r = m.resposta;
  const bloco = criar("button", "msg__resposta");
  bloco.type = "button";
  bloco.append(simbolo("icone-responder", "msg__resposta-icone"));
  if (r.apagada) {
    bloco.append(criar("span", "msg__resposta-trecho msg__resposta-trecho--apagada", "Mensagem apagada"));
    bloco.disabled = true;
    return bloco;
  }
  const original = estado.historicos.get(estado.alvo.chave)?.lista.find((x) => x.id === r.id);
  if (original) bloco.append(retratoDe(original.persona, categoria, "msg__resposta-retrato"));
  const nome = original ? nomeDaPersona(original.persona, "msg__resposta-nome") : criar("span", "msg__resposta-nome nome-persona", r.nome);
  bloco.append(nome, criar("span", "msg__resposta-trecho", r.trecho || !r.gif ? trechoLegivel(r.trecho) : "(GIF)"));
  bloco.title = "Ir para a mensagem";
  bloco.addEventListener("click", () => irParaMensagem(r.id));
  return bloco;
}

function acoesDaMensagem(m) {
  const acoes = criar("div", "msg__acoes");
  const privadaInativa = estado.alvo.tipo === "privada" && privadaDaLista(estado.alvo.chave)?.ativa === false;
  const extras = ganchosDosExtras.acoes?.(m) ?? { antes: [], depois: [] };
  acoes.append(...extras.antes);
  if (!privadaInativa) acoes.append(botaoDeIcone("icone-responder", "Responder", () => responderA(m)));
  acoes.append(...extras.depois);
  if (m.podeEditar) acoes.append(botaoDeIcone("icone-lapis", "Editar", () => comecarEdicao(m)));
  if (m.podeApagar) acoes.append(botaoDeIcone("icone-lixeira", "Apagar", () => apagarMensagem(m), "icone-botao--perigo"));
  return acoes;
}

function edicaoDe(m) {
  const caixa = criar("div", "msg__edicao");
  const campo = criar("textarea", "msg__edicao-campo");
  campo.value = estado.editando.texto;
  campo.maxLength = CONFIG.maxTexto;
  campo.rows = Math.min(10, campo.value.split("\n").length);
  campo.addEventListener("input", () => {
    estado.editando.texto = campo.value;
    ajustarAltura(campo);
  });
  campo.addEventListener("keydown", (evento) => {
    if (evento.key === "Escape") {
      evento.preventDefault();
      evento.stopPropagation();
      cancelarEdicao();
    } else if (evento.key === "Enter" && !evento.shiftKey && !evento.isComposing) {
      evento.preventDefault();
      salvarEdicao(m);
    }
  });
  const dica = criar("p", "msg__edicao-dica");
  dica.append("Enter salva · Esc cancela · ");
  const cancelar = criar("button", "botao botao--leve botao--pequeno", "cancelar");
  cancelar.type = "button";
  cancelar.addEventListener("click", cancelarEdicao);
  dica.append(cancelar);
  caixa.append(campo, dica);
  requestAnimationFrame(() => {
    if (!campo.isConnected) return;
    ajustarAltura(campo);
    if (document.activeElement !== campo) {
      campo.focus();
      campo.setSelectionRange(campo.value.length, campo.value.length);
    }
  });
  return caixa;
}

// O card de quem mandou: na Geral e nas privadas, o perfil de agora
const infoDaMensagem = (m, categoria) => ({ usuario: m.autor.usuario, persona: m.persona, categoria });

// O alfinete pequeno de uma mensagem fixada, ao lado da hora
function alfineteDaMensagem() {
  const alfinete = simbolo("icone-alfinete", "msg__alfinete");
  const caixa = criar("span", "msg__fixada");
  caixa.title = "Mensagem fixada";
  caixa.append(alfinete);
  return caixa;
}

function elementoDaMensagem(m, continua, categoria) {
  const el = criar("article", "msg");
  el.dataset.id = m.id;
  if (continua) el.classList.add("msg--continua");
  if (m.mencionaVoce) el.classList.add("msg--mencao");
  if (estado.respondendo?.id === m.id) el.classList.add("msg--respondendo");

  if (m.resposta && !continua) el.append(blocoDaResposta(m, categoria));

  const lado = criar("div", "msg__lado");
  if (continua) {
    const hora = criar("time", "msg__hora-lado", horaDe(m.em));
    hora.dateTime = m.em;
    hora.title = dataCompleta(m.em);
    lado.append(hora);
  } else {
    const retrato = criar("span", "msg__retrato-botao");
    retrato.append(retratoDe(m.persona, categoria, "msg__retrato"));
    retrato.setAttribute("aria-label", m.persona.nome);
    abreCard(retrato, () => infoDaMensagem(m, categoria));
    lado.append(retrato);
  }

  const corpo = criar("div", "msg__corpo");
  if (!continua) {
    const cabeca = criar("div", "msg__cabeca");
    const nome = nomeDaPersona(m.persona, "msg__nome");
    nome.title = `por ${m.autor.nomeConta}`;
    abreCard(nome, () => infoDaMensagem(m, categoria));
    const hora = criar("time", "msg__hora", horaDe(m.em));
    hora.dateTime = m.em;
    hora.title = dataCompleta(m.em);
    cabeca.append(nome, hora);
    if (m.fixada) cabeca.append(alfineteDaMensagem());
    corpo.append(cabeca);
  } else if (m.fixada) {
    lado.append(alfineteDaMensagem());
  }

  if (estado.editando?.id === m.id) {
    corpo.append(edicaoDe(m));
  } else if (m.texto) {
    const texto = criar("div", "msg__texto");
    if (ganchosDosExtras.soEmojis?.(m.texto)) texto.classList.add("msg__texto--emojis");
    desenharTexto(texto, m.texto);
    if (m.editadaEm) {
      const marca = criar("span", "msg__editada", "(editada)");
      marca.title = dataCompleta(m.editadaEm);
      (texto.lastElementChild?.matches(".msg__linhas, .msg__citacao") ? texto.lastElementChild : texto).append(" ", marca);
    }
    corpo.append(texto);
  } else if (m.editadaEm) {
    corpo.append(criar("span", "msg__editada", "(editada)"));
  }

  if (m.imagens.length) {
    const imagens = criar("div", "msg__imagens");
    for (const src of m.imagens) {
      const abrir = criar("button", "msg__miniatura");
      abrir.type = "button";
      abrir.title = "Abrir a imagem";
      const img = imagem(src, "msg__imagem");
      img.loading = "lazy";
      img.addEventListener("load", () => {
        if (estado.grudado) rolarParaOFim();
      });
      abrir.append(img);
      abrir.addEventListener("click", () => abrirImagem(src));
      imagens.append(abrir);
    }
    corpo.append(imagens);
  }

  corpo.append(...(ganchosDosExtras.conteudo?.(m, categoria) ?? []));

  el.append(lado, corpo, acoesDaMensagem(m));
  return el;
}

const caixaDasMensagens = () => $("#mensagens");
const pertoDoFim = (caixa) => caixa.scrollHeight - caixa.scrollTop - caixa.clientHeight < 60;

function rolarParaOFim() {
  const caixa = caixaDasMensagens();
  caixa.scrollTop = caixa.scrollHeight;
}

// "abrir": no fim (ou na linha "Novas"); "antigas": mantém o lugar depois de pôr mensagens em cima;
// "manter": fica onde está, mas acompanha o fim se já estava nele
function desenharMensagens(modo = "manter") {
  const alvo = estado.alvo;
  const h = alvo && estado.historicos.get(alvo.chave);
  if (!h?.carregado) return;
  const caixa = caixaDasMensagens();
  const distanciaDoFim = caixa.scrollHeight - caixa.scrollTop;
  const estavaNoFim = pertoDoFim(caixa);
  const topo = caixa.scrollTop;
  const categoria = categoriaDoAlvo();

  const partes = [];
  if (h.maisAntigas) partes.push(criar("p", "mensagens__mais", "Role para cima para ver as mais antigas."));
  else partes.push(inicioDoCanal());
  let anterior = null;
  for (const m of h.lista) {
    if (!anterior || !mesmoDia(anterior.em, m.em)) partes.push(linhaDeDia(m.em));
    if (m.id === estado.marcaNovas) partes.push(linhaNovas());
    partes.push(elementoDaMensagem(m, continuaDe(anterior, m), categoria));
    anterior = m;
  }
  caixa.replaceChildren(...partes);
  carregarFontes(h.lista.map((m) => m.persona.fonte).filter(Boolean));

  if (modo === "abrir") {
    const novas = caixa.querySelector(".divisa--novas");
    if (novas && caixa.scrollHeight > caixa.clientHeight) {
      novas.scrollIntoView({ block: "center" });
      estado.grudado = pertoDoFim(caixa);
    } else {
      rolarParaOFim();
      estado.grudado = true;
    }
  } else if (modo === "antigas") {
    caixa.scrollTop = caixa.scrollHeight - distanciaDoFim;
  } else if (estavaNoFim || estado.grudado) {
    rolarParaOFim();
  } else {
    caixa.scrollTop = topo;
  }
  marcarLidaSePreciso();
}

function inicioDoCanal() {
  const inicio = criar("div", "mensagens__inicio");
  const alvo = estado.alvo;
  if (alvo.tipo === "privada") {
    const nome = apelidoDe(alvo.usuario);
    inicio.append(criar("h2", "mensagens__inicio-titulo", nome), criar("p", null, `O começo da sua conversa com ${nome}. Só vocês dois leem.`));
  } else {
    const { canal } = acharCanal(alvo.id);
    inicio.append(criar("h2", "mensagens__inicio-titulo", `#${canal.nome}`), criar("p", null, "O começo do canal."));
  }
  return inicio;
}

async function irParaMensagem(id) {
  for (let tentativas = 0; tentativas < 20; tentativas++) {
    const el = caixaDasMensagens().querySelector(`[data-id="${CSS.escape(id)}"]`);
    if (el) {
      el.scrollIntoView({ block: "center", behavior: "smooth" });
      el.classList.remove("msg--destaque");
      void el.offsetWidth;
      el.classList.add("msg--destaque");
      return;
    }
    if (!(await carregarMaisAntigas())) break;
  }
  avisoRapido("A mensagem original não foi encontrada.");
}

function abrirImagem(src) {
  $("#imagem-grande").src = src;
  $("#dialogo-imagem").showModal();
}

/* ---------- Responder, editar e apagar ---------- */

function responderA(m) {
  estado.editando = null;
  estado.respondendo = m;
  desenharEscrever();
  desenharMensagens();
  $("#campo-texto").focus();
}

function cancelarResposta() {
  estado.respondendo = null;
  desenharEscrever();
  desenharMensagens();
}

// O texto guardado tem <@usuario>; na edição aparece como @Nome, e volta ao salvar
function textoParaEscrever(texto) {
  const mapa = [];
  const escrito = texto.replace(/<@([a-z0-9_-]{2,30}|todos)>/g, (_, usuario) => {
    const visivel = `@${nomeDaMencao(usuario)}`;
    if (!mapa.some((x) => x.texto === visivel)) mapa.push({ texto: visivel, usuario });
    return visivel;
  });
  return { texto: escrito, mapa };
}

function textoParaGuardar(texto, mapa) {
  let resultado = texto;
  const ordenado = [...mapa].sort((a, b) => b.texto.length - a.texto.length);
  for (const { texto: visivel, usuario } of ordenado) resultado = resultado.split(visivel).join(`<@${usuario}>`);
  return resultado;
}

function comecarEdicao(m) {
  const { texto, mapa } = textoParaEscrever(m.texto);
  estado.respondendo = null;
  estado.editando = { id: m.id, texto, mapa };
  desenharEscrever();
  desenharMensagens();
}

function cancelarEdicao() {
  estado.editando = null;
  desenharMensagens();
  $("#campo-texto").focus();
}

async function salvarEdicao(m) {
  const edicao = estado.editando;
  if (!edicao) return;
  const texto = textoParaGuardar(edicao.texto, edicao.mapa).trimEnd();
  if (texto === m.texto) return cancelarEdicao();
  if (!texto.trim() && !m.imagens.length) {
    const apagar = await perguntar({
      titulo: "Apagar a mensagem?",
      texto: "A mensagem ficou vazia.",
      confirmar: "Apagar",
      cancelar: "Cancelar",
      perigo: true,
    });
    if (apagar) {
      estado.editando = null;
      return apagarDeVez(m);
    }
    return;
  }
  try {
    const { mensagem } = await api.editar(m.id, texto);
    trocarMensagem(mensagem);
    estado.editando = null;
    desenharMensagens();
    $("#campo-texto").focus();
  } catch (falha) {
    avisarFalha(falha);
  }
}

async function apagarMensagem(m) {
  const confirmado = await perguntar({
    titulo: "Apagar a mensagem?",
    texto: "Ela some para todos, com as imagens. Não dá para desfazer.",
    confirmar: "Apagar",
    cancelar: "Cancelar",
    perigo: true,
  });
  if (confirmado) apagarDeVez(m);
}

async function apagarDeVez(m) {
  try {
    await api.apagar(m.id);
    tirarMensagem(m.id, m.canal);
  } catch (falha) {
    avisarFalha(falha);
  }
}

/* ---------- Mudanças no histórico (pelo envio ou pelos eventos) ---------- */

function acrescentarMensagem(m) {
  const h = estado.historicos.get(m.canal);
  if (!h || h.lista.some((x) => x.id === m.id)) return false;
  h.lista.push(m);
  return true;
}

function trocarMensagem(m) {
  const h = estado.historicos.get(m.canal);
  if (!h) return;
  const i = h.lista.findIndex((x) => x.id === m.id);
  if (i >= 0) h.lista[i] = m;
  for (const x of h.lista) if (x.resposta?.id === m.id && !x.resposta.apagada) x.resposta = { ...x.resposta, trecho: trechoDe(m.texto) };
  if (estado.alvo?.chave === m.canal) desenharMensagens();
}

function tirarMensagem(id, chave) {
  const h = estado.historicos.get(chave);
  if (!h) return;
  h.lista = h.lista.filter((x) => x.id !== id);
  for (const x of h.lista) if (x.resposta?.id === id) x.resposta = { id, apagada: true };
  if (estado.respondendo?.id === id) {
    estado.respondendo = null;
    desenharEscrever();
  }
  if (estado.editando?.id === id) estado.editando = null;
  if (estado.marcaNovas === id) estado.marcaNovas = null;
  if (estado.alvo?.chave === chave) desenharMensagens();
}

/* =================================================================
   Lida até
   ================================================================= */

function marcarLidaSePreciso() {
  const alvo = estado.alvo;
  if (!alvo || alvo.voz || document.hidden || !document.hasFocus()) return;
  const h = estado.historicos.get(alvo.chave);
  if (!h?.carregado || !h.lista.length || !pertoDoFim(caixaDasMensagens())) return;
  const ultima = h.lista[h.lista.length - 1].id;

  // Na tela, as contagens somem na hora
  zerarContagens(alvo.chave);

  if (estado.lidaEnviada.get(alvo.chave) === ultima) return;
  const espera = estado.ultimaLida + CONFIG.intervaloDaLida - Date.now();
  if (espera > 0) {
    clearTimeout(estado.esperaDaLida);
    estado.esperaDaLida = setTimeout(marcarLidaSePreciso, espera);
    return;
  }
  estado.ultimaLida = Date.now();
  estado.lidaEnviada.set(alvo.chave, ultima);
  const canal = alvo.tipo === "privada" ? `privada:${alvo.usuario}` : alvo.id;
  api.lida(canal, ultima).catch(() => estado.lidaEnviada.delete(alvo.chave));
}

function zerarContagens(chave) {
  let mudou = false;
  if (ehChaveDePrivada(chave)) {
    const privada = privadaDaLista(chave);
    if (privada?.naoLidas) {
      privada.naoLidas = 0;
      mudou = true;
    }
  } else {
    const canal = acharCanal(chave)?.canal;
    if (canal && (canal.naoLidas || canal.mencoes)) {
      canal.naoLidas = 0;
      canal.mencoes = 0;
      mudou = true;
    }
  }
  if (mudou) desenharLista();
}

/* =================================================================
   O campo de escrever
   ================================================================= */

function ajustarAltura(campo) {
  campo.style.setProperty("height", "auto");
  campo.style.setProperty("height", `${Math.min(campo.scrollHeight + 2, 260)}px`);
}

function ajustarCampo() {
  ajustarAltura($("#campo-texto"));
}

function desenharEscrever() {
  const alvo = estado.alvo;
  const campo = $("#campo-texto");
  const aviso = $("#escrever-aviso");
  const inativa = alvo?.tipo === "privada" && (privadaDaLista(alvo.chave)?.ativa === false || !contaPorUsuario(alvo.usuario));
  campo.disabled = inativa;
  $("#botao-imagem").disabled = inativa;
  ganchosDosExtras.escrever?.(inativa);
  aviso.hidden = !inativa;
  aviso.textContent = inativa ? "Essa conta não existe mais. A conversa fica só para leitura." : "";
  if (alvo && !inativa) {
    if (alvo.tipo === "privada") campo.placeholder = `Mensagem para ${contaPorUsuario(alvo.usuario)?.nome ?? alvo.usuario}`;
    else campo.placeholder = `Mensagem em #${acharCanal(alvo.id)?.canal.nome ?? ""}`;
  }

  const faixa = $("#respondendo");
  const r = estado.respondendo;
  faixa.hidden = !r;
  if (r) {
    const texto = $("#respondendo-texto");
    texto.replaceChildren("Respondendo a ", nomeDaPersona(r.persona, "respondendo__nome"));
  }
  desenharAnexos();
}

function desenharAnexos() {
  const caixa = $("#anexos");
  caixa.hidden = !estado.anexos.length;
  caixa.replaceChildren(
    ...estado.anexos.map((anexo, i) => {
      const item = criar("div", "anexo");
      item.append(imagem(anexo.url, "anexo__imagem", anexo.arquivo.name));
      item.append(
        botaoDeIcone("icone-fechar", "Tirar a imagem", () => {
          URL.revokeObjectURL(anexo.url);
          estado.anexos.splice(i, 1);
          desenharAnexos();
        }, "anexo__tirar"),
      );
      return item;
    }),
  );
}

function limparAnexos() {
  for (const anexo of estado.anexos) URL.revokeObjectURL(anexo.url);
  estado.anexos = [];
  if ($("#anexos")) desenharAnexos();
}

function anexar(arquivos) {
  if (!estado.alvo || estado.alvo.voz || $("#campo-texto").disabled) return;
  for (const arquivo of arquivos) {
    if (!CONFIG.tiposDeImagem.includes(arquivo.type)) {
      avisoRapido("Use imagens PNG, JPG, WEBP, GIF ou AVIF.");
      continue;
    }
    if (arquivo.size > CONFIG.maxImagem) {
      avisoRapido("Cada imagem pode ter no máximo 10 MB.");
      continue;
    }
    if (estado.anexos.length >= CONFIG.maxImagens) {
      avisoRapido("Cada mensagem pode ter no máximo 4 imagens.");
      break;
    }
    estado.anexos.push({ arquivo, url: URL.createObjectURL(arquivo) });
  }
  desenharAnexos();
}

function personaParaEnviar() {
  const categoria = categoriaDoAlvo();
  if (!categoria?.mesa) return null;
  const escolhida = personaEscolhidaDa(categoria.mesa);
  return escolhida ? { tipo: escolhida.tipo, id: escolhida.id } : null;
}

async function enviarMensagem() {
  const alvo = estado.alvo;
  const campo = $("#campo-texto");
  if (!alvo || alvo.voz || estado.enviando || campo.disabled) return;
  const texto = textoParaGuardar(campo.value, estado.mencoesEscolhidas).trimEnd();
  if (!texto.trim() && !estado.anexos.length) return;
  if (texto.length > CONFIG.maxTexto) return avisoRapido("A mensagem pode ter no máximo 4.000 caracteres.");

  estado.enviando = true;
  campo.classList.add("escrever__campo--enviando");
  try {
    const { mensagem } = await api.enviar(alvo, {
      texto,
      resposta: estado.respondendo?.id,
      persona: personaParaEnviar(),
      arquivos: estado.anexos.map((a) => a.arquivo),
    });
    if (estado.alvo?.chave === alvo.chave) {
      campo.value = "";
      ajustarCampo();
      estado.respondendo = null;
      estado.mencoesEscolhidas = [];
      limparAnexos();
      desenharEscrever();
    }
    estado.grudado = true;
    estado.marcaNovas = null;
    const h = estado.historicos.get(alvo.chave);
    if (h?.carregado) {
      acrescentarMensagem(mensagem);
      estado.lidaEnviada.set(alvo.chave, mensagem.id); // o servidor já marca como lida
      if (estado.alvo?.chave === alvo.chave) desenharMensagens();
    }
    // A primeira mensagem de uma privada nova (ou oculta) a põe na lista
    if (alvo.tipo === "privada" && !privadaDaLista(alvo.chave)) await recarregarEstado();
  } catch (falha) {
    if (falha.codigo === "limite") avisoRapido(falha.message);
    else if (falha.codigo !== "sem-sessao") avisarFalha(falha);
  } finally {
    estado.enviando = false;
    campo.classList.remove("escrever__campo--enviando");
  }
}

// ↑ com o campo vazio edita a sua última mensagem
function editarAUltima() {
  const h = estado.historicos.get(estado.alvo?.chave);
  const minha = h?.lista.findLast((m) => m.podeEditar);
  if (minha) comecarEdicao(minha);
}

/* ---------- A lista do @ ---------- */

let mencaoAtual = null; // { inicio, termo, opcoes, escolhida }

// Quem vê o alvo: [{ usuario, nome (a persona ali), nomeConta }]
function quemVeOAlvo() {
  const alvo = estado.alvo;
  if (!alvo) return [];
  if (alvo.tipo === "privada") {
    return [eu(), alvo.usuario]
      .map((usuario) => contaPorUsuario(usuario))
      .filter(Boolean)
      .map((c) => {
        const persona = personaDaContaDe(c.usuario);
        return { usuario: c.usuario, nome: persona.nome, nomeConta: c.nome, persona };
      });
  }
  const categoria = acharCanal(alvo.id)?.categoria;
  if (!categoria) return [];
  const personas = estado.dados.personasDosMembros?.[categoria.id] ?? {};
  return (estado.dados.membros?.[categoria.id] ?? []).map((usuario) => {
    const conta = contaPorUsuario(usuario);
    const persona = personas[usuario] ?? personaDaContaDe(usuario);
    return { usuario, nome: persona.nome, nomeConta: conta?.nome ?? usuario, persona };
  });
}

function procurarMencao() {
  const campo = $("#campo-texto");
  const antes = campo.value.slice(0, campo.selectionStart);
  const achado = /(^|\s)@([^\s@]{0,30})$/.exec(antes);
  if (!achado || campo.selectionStart !== campo.selectionEnd) return fecharListaDeMencoes();
  const termo = normalizar(achado[2]);
  const opcoes = quemVeOAlvo()
    .filter((p) => p.usuario !== eu())
    .filter((p) => !termo || [p.nome, p.nomeConta, p.usuario].some((t) => normalizar(t).includes(termo)))
    .slice(0, 8);
  if (estado.alvo.tipo === "canal" && "todos".includes(termo)) opcoes.push({ usuario: "todos", nome: "todos", nomeConta: "Avisa todo mundo que vê o canal" });
  if (!opcoes.length) return fecharListaDeMencoes();
  mencaoAtual = { inicio: antes.length - achado[2].length - 1, fim: antes.length, opcoes, escolhida: 0 };
  desenharListaDeMencoes();
}

function desenharListaDeMencoes() {
  const lista = $("#lista-mencoes");
  const categoria = categoriaDoAlvo();
  lista.replaceChildren(
    ...mencaoAtual.opcoes.map((opcao, i) => {
      const item = criar("button", "mencao-opcao");
      item.type = "button";
      item.setAttribute("role", "option");
      item.setAttribute("aria-selected", String(i === mencaoAtual.escolhida));
      if (opcao.persona) item.append(retratoDe(opcao.persona, categoria, "mencao-opcao__retrato"), nomeDaPersona(opcao.persona, "mencao-opcao__nome"));
      else item.append(criar("span", "mencao-opcao__todos", "@"), criar("span", "mencao-opcao__nome", "todos"));
      item.append(criar("span", "mencao-opcao__conta", opcao.nomeConta));
      item.addEventListener("mousedown", (evento) => {
        evento.preventDefault();
        mencaoAtual.escolhida = i;
        escolherMencao();
      });
      return item;
    }),
  );
  lista.hidden = false;
}

function fecharListaDeMencoes() {
  mencaoAtual = null;
  $("#lista-mencoes").hidden = true;
}

function escolherMencao() {
  const campo = $("#campo-texto");
  const opcao = mencaoAtual.opcoes[mencaoAtual.escolhida];
  const visivel = `@${opcao.nome}`;
  campo.value = `${campo.value.slice(0, mencaoAtual.inicio)}${visivel} ${campo.value.slice(mencaoAtual.fim)}`;
  const posicao = mencaoAtual.inicio + visivel.length + 1;
  campo.setSelectionRange(posicao, posicao);
  if (!estado.mencoesEscolhidas.some((x) => x.texto === visivel)) estado.mencoesEscolhidas.push({ texto: visivel, usuario: opcao.usuario });
  fecharListaDeMencoes();
  ajustarCampo();
  campo.focus();
}

function configurarEscrever() {
  const campo = $("#campo-texto");
  const form = $("#escrever");
  form.addEventListener("submit", (evento) => {
    evento.preventDefault();
    enviarMensagem();
  });
  campo.addEventListener("input", () => {
    ajustarCampo();
    procurarMencao();
  });
  campo.addEventListener("click", procurarMencao);
  campo.addEventListener("blur", () => setTimeout(fecharListaDeMencoes, 120));
  campo.addEventListener("keydown", (evento) => {
    if (mencaoAtual) {
      const n = mencaoAtual.opcoes.length;
      if (evento.key === "ArrowDown" || evento.key === "ArrowUp") {
        evento.preventDefault();
        mencaoAtual.escolhida = (mencaoAtual.escolhida + (evento.key === "ArrowDown" ? 1 : n - 1)) % n;
        return desenharListaDeMencoes();
      }
      if ((evento.key === "Enter" && !evento.shiftKey) || evento.key === "Tab") {
        evento.preventDefault();
        return escolherMencao();
      }
      if (evento.key === "Escape") {
        evento.preventDefault();
        return fecharListaDeMencoes();
      }
    }
    if (evento.key === "Enter" && !evento.shiftKey && !evento.isComposing) {
      evento.preventDefault();
      enviarMensagem();
    } else if (evento.key === "ArrowUp" && !campo.value) {
      evento.preventDefault();
      editarAUltima();
    } else if (evento.key === "Escape") {
      if (estado.respondendo) cancelarResposta();
      else if (estado.editando) cancelarEdicao();
    }
  });

  // Imagens: botão, Ctrl+V e arrastar
  const arquivo = $("#arquivo-imagem");
  $("#botao-imagem").addEventListener("click", () => arquivo.click());
  arquivo.addEventListener("change", () => {
    anexar([...arquivo.files]);
    arquivo.value = "";
    campo.focus();
  });
  campo.addEventListener("paste", (evento) => {
    const arquivos = [...(evento.clipboardData?.files ?? [])].filter((a) => a.type.startsWith("image/"));
    if (!arquivos.length) return;
    evento.preventDefault();
    anexar(arquivos);
  });
  const centro = $(".centro");
  centro.addEventListener("dragover", (evento) => {
    if (![...(evento.dataTransfer?.types ?? [])].includes("Files")) return;
    evento.preventDefault();
    centro.classList.add("centro--soltar");
  });
  centro.addEventListener("dragleave", (evento) => {
    if (!centro.contains(evento.relatedTarget)) centro.classList.remove("centro--soltar");
  });
  centro.addEventListener("drop", (evento) => {
    centro.classList.remove("centro--soltar");
    if (!evento.dataTransfer?.files?.length) return;
    evento.preventDefault();
    anexar([...evento.dataTransfer.files]);
  });

  $("#respondendo-cancelar").addEventListener("click", cancelarResposta);
}

/* =================================================================
   Coluna da direita: quem vê o canal
   ================================================================= */

function desenharMembros() {
  const coluna = $("#membros");
  const pessoas = quemVeOAlvo();
  const categoria = categoriaDoAlvo();
  if (!pessoas.length) return coluna.replaceChildren();
  const linha = (p) => {
    const conta = contaPorUsuario(p.usuario);
    const item = criar("li", "membro");
    const retrato = criar("span", "membro__retrato");
    const ponto = criar("span", "presenca");
    ponto.classList.toggle("presenca--no-chat", Boolean(conta?.noChat));
    retrato.append(retratoDe(p.persona, categoria, "membro__imagem"), ponto);
    const nomes = criar("span", "membro__nomes");
    nomes.append(nomeDaPersona(p.persona, "membro__nome"), criar("small", "membro__conta", p.nomeConta));
    const frase = p.persona.tipo === "conta" ? perfilDe(p.usuario).frase : "";
    if (frase) nomes.append(criar("small", "membro__frase", frase));
    item.append(retrato, nomes);
    abreCard(item, () => ({ usuario: p.usuario, persona: p.persona, categoria }));
    return item;
  };
  const grupo = (titulo, lista, classe = "") => {
    if (!lista.length) return [];
    const ul = criar("ul", `membros__lista ${classe}`);
    ul.append(...lista.map(linha));
    return [criar("h2", "membros__titulo", `${titulo} · ${lista.length}`), ul];
  };
  const ordenar = (a, b) => a.nome.localeCompare(b.nome, "pt-BR");
  const noChat = pessoas.filter((p) => contaPorUsuario(p.usuario)?.noChat).sort(ordenar);
  const fora = pessoas.filter((p) => !contaPorUsuario(p.usuario)?.noChat).sort(ordenar);
  coluna.replaceChildren(...grupo("No chat agora", noChat), ...grupo("Fora", fora, "membros__lista--fora"));
}

// Na janela larga, o botão mostra ou recolhe a coluna (e a escolha fica guardada). Abaixo de
// 1100 px, a coluna abre por cima do centro e fecha ao clicar fora ou com Esc.
const janelaEstreita = matchMedia("(max-width: 1099.98px)");

function configurarMembros() {
  const botaoMembros = $("#botao-membros");
  const coluna = $("#membros");
  const aplicar = () => {
    const aberta = janelaEstreita.matches
      ? document.body.classList.contains("membros-por-cima")
      : !document.body.classList.contains("sem-membros");
    botaoMembros.setAttribute("aria-pressed", String(aberta));
  };
  const fecharPorCima = () => {
    if (!document.body.classList.contains("membros-por-cima")) return;
    document.body.classList.remove("membros-por-cima");
    aplicar();
  };
  document.body.classList.toggle("sem-membros", lerLocal("chat:membros") === "fechada");
  aplicar();
  botaoMembros.addEventListener("click", () => {
    if (janelaEstreita.matches) {
      document.body.classList.toggle("membros-por-cima");
    } else {
      const fechar = !document.body.classList.contains("sem-membros");
      document.body.classList.toggle("sem-membros", fechar);
      gravarLocal("chat:membros", fechar ? "fechada" : "aberta");
    }
    aplicar();
  });
  janelaEstreita.addEventListener("change", () => {
    document.body.classList.remove("membros-por-cima");
    aplicar();
  });
  document.addEventListener("pointerdown", (evento) => {
    if (!janelaEstreita.matches || coluna.contains(evento.target) || botaoMembros.contains(evento.target)) return;
    if ($("#card-pessoa")?.contains(evento.target)) return;
    fecharPorCima();
  });
  document.addEventListener("keydown", (evento) => {
    if (evento.key === "Escape" && document.body.classList.contains("membros-por-cima") && !cardAberto()) fecharPorCima();
  });
}

/* =================================================================
   O card de quem fala
   -----------------------------------------------------------------
   Abre ao clicar no nome ou na imagem de alguém (mensagens, coluna
   da direita, salas de voz). Conta: o perfil. Personagem, Mestre e
   outro personagem: o retrato, a mesa e quem joga.
   ================================================================= */

let cardAtual = null; // { ancora, info }: info = { usuario, persona, categoria }

const cardAberto = () => !$("#card-pessoa").hidden;

// A ficha na galeria do portal (o mesmo endereço que a galeria já abre)
function enderecoDaFicha(id) {
  const hash = `#personagem-${encodeURIComponent(id)}`;
  const host = location.hostname;
  if (!MODO_PREVIA && host.startsWith("chat.")) return `https://${host.slice("chat.".length)}/personagens/${hash}`;
  return COMO_ARQUIVO ? `${RAIZ}personagens/index.html${hash}` : `${RAIZ}personagens/${hash}`;
}

// A sala de voz em que a conta está, se você vê essa sala
function salaDeVozDe(usuario) {
  if (usuario === eu()) {
    const id = ganchosDaVoz.salaConectada?.();
    return id ? acharCanal(id) : null;
  }
  for (const [id, pessoas] of Object.entries(estado.dados?.voz?.salas ?? {})) {
    if (pessoas.some((p) => p.usuario === usuario)) return acharCanal(id);
  }
  return null;
}

// A presença de voz traz só o nome, a imagem e a fonte: na Geral é a conta; na mesa, a persona
// escolhida pela pessoa (a mesma com que ela entrou, se o nome bate)
function personaDaPresencaNaSala(pessoa, categoria) {
  if (!categoria?.mesa) return personaDaContaDe(pessoa.usuario);
  const escolhida = estado.dados?.personasDosMembros?.[categoria.id]?.[pessoa.usuario];
  if (escolhida && escolhida.nome === pessoa.nome) return escolhida;
  const admin = Boolean(contaPorUsuario(pessoa.usuario)?.admin);
  const tipo = admin ? (pessoa.nome === "Mestre" ? "mestre" : "outro") : "personagem";
  return { tipo, id: tipo === "mestre" ? categoria.mesa : null, nome: pessoa.nome, imagem: pessoa.imagem ?? null, fonte: pessoa.fonte ?? null };
}

// Faz um elemento abrir o card (clique, Enter ou espaço)
function abreCard(elemento, info) {
  elemento.classList.add("abre-card");
  if (!elemento.matches("button, a")) {
    elemento.tabIndex = 0;
    elemento.setAttribute("role", "button");
  }
  elemento.addEventListener("click", (evento) => {
    evento.stopPropagation();
    if (cardAtual?.ancora === elemento && cardAberto()) return fecharCard();
    abrirCard(elemento, info());
  });
  elemento.addEventListener("keydown", (evento) => {
    if (evento.key !== "Enter" && evento.key !== " ") return;
    evento.preventDefault();
    evento.stopPropagation();
    abrirCard(elemento, info());
  });
}

function linhaDoDono(rotulo, usuario, aoClicar) {
  const linha = criar("p", "card-pessoa__dono");
  linha.append(criar("span", "card-pessoa__rotulo", rotulo));
  const quem = criar("button", "card-pessoa__quem");
  quem.type = "button";
  quem.title = "Ver o perfil";
  quem.append(retratoDe(personaDaContaDe(usuario), null, "card-pessoa__mini"), criar("span", null, apelidoDe(usuario)));
  if (aoClicar) quem.addEventListener("click", aoClicar);
  else quem.disabled = true;
  linha.append(quem);
  return linha;
}

function linhaDaMesa(categoria) {
  const mesa = criar("p", "card-pessoa__mesa");
  if (categoria?.cor) mesa.style.setProperty("--cor", categoria.cor);
  mesa.append(criar("span", "card-pessoa__ponto"), categoria?.nome ?? "");
  return mesa;
}

// O card de uma conta. "perfil" e "persona" podem vir de fora (a prévia do diálogo do perfil).
function cardDaConta(usuario, { perfil = perfilDe(usuario), persona = personaDaContaDe(usuario), previa = false } = {}) {
  const card = criar("div", "card-pessoa__caixa card-pessoa__caixa--conta");
  card.style.setProperty("--cor-card", perfil.cor);
  const faixa = criar("div", "card-pessoa__faixa");
  if (perfil.faixa) {
    const img = imagem(perfil.faixa, "card-pessoa__faixa-imagem");
    img.addEventListener("error", () => img.remove(), { once: true });
    faixa.append(img);
  }
  const foto = criar("span", "card-pessoa__foto");
  const ponto = criar("span", "presenca");
  const conta = contaPorUsuario(usuario);
  ponto.classList.toggle("presenca--no-chat", Boolean(conta?.noChat));
  foto.append(retratoDe(persona, null, "card-pessoa__retrato"), ponto);
  card.append(faixa, foto);

  const corpo = criar("div", "card-pessoa__corpo");
  const nomeConta = conta?.nome ?? privadaComUsuario(usuario)?.com.nome ?? usuario;
  corpo.append(criar("h2", "card-pessoa__nome", persona.nome));
  if (nomeConta !== persona.nome) corpo.append(criar("p", "card-pessoa__conta", nomeConta));
  if (perfil.frase) corpo.append(criar("p", "card-pessoa__frase", perfil.frase));
  if (perfil.sobre) {
    const sobre = criar("section", "card-pessoa__sobre");
    const texto = criar("div", "msg__texto card-pessoa__texto");
    desenharTexto(texto, perfil.sobre, { semMencoes: true });
    sobre.append(criar("h3", "card-pessoa__titulo", "Sobre mim"), texto);
    corpo.append(sobre);
  }

  if (!previa) {
    const situacao = criar("div", "card-pessoa__situacao");
    if (conta?.noChat) situacao.append(criar("p", "card-pessoa__no-chat", "No chat agora"));
    const sala = salaDeVozDe(usuario);
    if (sala) {
      const link = criar("a", "card-pessoa__sala");
      link.href = `#canal-${sala.canal.id}`;
      link.append(simbolo("icone-voz", "card-pessoa__icone"), sala.canal.nome);
      if (sala.categoria.mesa) link.append(criar("span", "card-pessoa__sala-mesa", ` · ${sala.categoria.nome}`));
      link.addEventListener("click", fecharCard);
      situacao.append(link);
    }
    if (situacao.childElementCount) corpo.append(situacao);
  }

  if (usuario === eu()) {
    const editar = botao("Editar perfil", "botao botao--leve botao--pequeno card-pessoa__acao", () => {
      fecharCard();
      abrirPerfil();
    });
    editar.disabled = previa;
    corpo.append(editar);
  } else if (conta) {
    corpo.append(
      botao("Mensagem privada", "botao botao--leve botao--pequeno card-pessoa__acao", () => {
        fecharCard();
        irPara(`#privada-${usuario}`);
      }),
    );
  }
  card.append(corpo);
  return card;
}

// O card de um personagem, do Mestre ou de outro personagem (nas mesas)
function cardDoPersonagem({ usuario, persona, categoria }) {
  const card = criar("div", `card-pessoa__caixa card-pessoa__caixa--${persona.tipo}`);
  card.style.setProperty("--cor-card", corDaCategoria(categoria));
  const retrato = criar("div", "card-pessoa__retrato-grande");
  retrato.append(retratoDe(persona, categoria, "card-pessoa__arte"));
  card.append(retrato);

  const corpo = criar("div", "card-pessoa__corpo");
  const nome = criar("h2", "card-pessoa__nome");
  nome.append(nomeDaPersona(persona));
  corpo.append(nome, linhaDaMesa(categoria));
  const verDono = () => abrirCard(cardAtual?.ancora ?? $("#card-pessoa"), { usuario, persona: personaDaContaDe(usuario), categoria: null }, true);
  corpo.append(linhaDoDono(persona.tipo === "outro" ? "interpretado por" : "jogado por", usuario, verDono));
  if ((persona.tipo === "personagem" || persona.tipo === "outro") && persona.id) {
    const ficha = criar("a", "card-pessoa__ficha", "Ver ficha");
    ficha.href = enderecoDaFicha(persona.id);
    if (!window.cronicasEternasApp) {
      ficha.target = "cronicas-portal";
      ficha.rel = "noopener";
    }
    ficha.addEventListener("click", fecharCard);
    corpo.append(ficha);
  }
  card.append(corpo);
  return card;
}

function conteudoDoCard(info) {
  if (info.persona?.tipo === "conta" || !info.persona) return cardDaConta(info.usuario);
  return cardDoPersonagem(info);
}

// Ao lado do que foi clicado, dentro da janela. "manterLugar": troca o conteúdo sem mexer
// (o "jogado por" abre o perfil do dono no mesmo lugar)
function abrirCard(ancora, info, manterLugar = false) {
  const card = $("#card-pessoa");
  cardAtual = { ancora, info };
  card.replaceChildren(conteudoDoCard(info));
  card.hidden = false;
  if (!manterLugar) posicionarCard();
  card.focus({ preventScroll: true });
}

function posicionarCard() {
  const card = $("#card-pessoa");
  const caixa = cardAtual.ancora.getBoundingClientRect();
  const largura = card.offsetWidth;
  const altura = card.offsetHeight;
  let esquerda = caixa.right + 10;
  if (esquerda + largura > window.innerWidth - 8) esquerda = caixa.left - largura - 10;
  if (esquerda < 8) esquerda = Math.min(Math.max(8, caixa.left), window.innerWidth - largura - 8);
  const topo = Math.min(Math.max(8, caixa.top), window.innerHeight - altura - 8);
  card.style.setProperty("left", `${Math.max(8, esquerda)}px`);
  card.style.setProperty("top", `${Math.max(8, topo)}px`);
}

function fecharCard() {
  if (!cardAtual && !cardAberto()) return;
  $("#card-pessoa").hidden = true;
  $("#card-pessoa").replaceChildren();
  cardAtual = null;
}

// Um perfil, a presença ou a voz mudaram: o card aberto acompanha, no mesmo lugar
function redesenharCard() {
  if (!cardAtual || !cardAberto()) return;
  $("#card-pessoa").replaceChildren(conteudoDoCard(cardAtual.info));
}

function configurarCard() {
  const card = $("#card-pessoa");
  card.tabIndex = -1;
  document.addEventListener("pointerdown", (evento) => {
    if (!cardAberto() || card.contains(evento.target) || cardAtual?.ancora.contains(evento.target)) return;
    fecharCard();
  });
  document.addEventListener("keydown", (evento) => {
    if (evento.key !== "Escape" || !cardAberto()) return;
    evento.stopPropagation();
    const ancora = cardAtual?.ancora;
    fecharCard();
    if (ancora?.isConnected) ancora.focus({ preventScroll: true });
  });
  window.addEventListener("resize", fecharCard);
}

/* =================================================================
   Seu perfil (a engrenagem)
   ================================================================= */

// O que está no diálogo: as imagens novas escolhidas e as que vão ser removidas
const edicaoDoPerfil = { foto: null, faixa: null, removerFoto: false, removerFaixa: false, urls: [] };

function imagemDoPerfil(campo) {
  const escolhida = edicaoDoPerfil[campo];
  if (escolhida) return escolhida.url;
  if (campo === "foto" ? edicaoDoPerfil.removerFoto : edicaoDoPerfil.removerFaixa) return null;
  return perfilDe(eu())[campo];
}

function desenharPreviaDoPerfil() {
  const form = $("#form-perfil");
  const conta = estado.dados.conta;
  const apelido = form.elements.apelido.value.replace(/\s+/g, " ").trim();
  const perfil = {
    apelido,
    foto: imagemDoPerfil("foto"),
    faixa: imagemDoPerfil("faixa"),
    cor: form.elements.cor.value || corDaConta(eu()),
    frase: form.elements.frase.value.replace(/\s+/g, " ").trim(),
    sobre: form.elements.sobre.value.trim(),
  };
  const persona = { tipo: "conta", id: eu(), nome: apelido || conta.nome, imagem: perfil.foto, fonte: null };
  const caixa = criar("div", "card-pessoa card-pessoa--previa");
  caixa.append(cardDaConta(eu(), { perfil, persona, previa: true }));
  $("#perfil-previa").replaceChildren(caixa);
  $("#perfil-foto-remover").disabled = !perfil.foto;
  $("#perfil-faixa-remover").disabled = !perfil.faixa;
}

function limparEdicaoDoPerfil() {
  for (const url of edicaoDoPerfil.urls) URL.revokeObjectURL(url);
  Object.assign(edicaoDoPerfil, { foto: null, faixa: null, removerFoto: false, removerFaixa: false, urls: [] });
}

function abrirPerfil() {
  const form = $("#form-perfil");
  const perfil = perfilDe(eu());
  limparEdicaoDoPerfil();
  form.elements.apelido.value = perfil.apelido;
  form.elements.apelido.placeholder = estado.dados.conta.nome;
  form.elements.cor.value = perfil.cor;
  form.elements.frase.value = perfil.frase;
  form.elements.sobre.value = perfil.sobre;
  $("#erro-perfil").hidden = true;
  desenharPreviaDoPerfil();
  $("#dialogo-perfil").showModal();
}

function escolherImagemDoPerfil(campo, arquivo) {
  if (!arquivo) return;
  const erro = $("#erro-perfil");
  if (!CONFIG.tiposDeImagem.includes(arquivo.type)) {
    erro.textContent = "Use imagens PNG, JPG, WEBP, GIF ou AVIF.";
    erro.hidden = false;
    return;
  }
  if (arquivo.size > CONFIG.maxImagem) {
    erro.textContent = "Cada imagem pode ter no máximo 10 MB.";
    erro.hidden = false;
    return;
  }
  erro.hidden = true;
  const url = URL.createObjectURL(arquivo);
  edicaoDoPerfil.urls.push(url);
  edicaoDoPerfil[campo] = { arquivo, url };
  if (campo === "foto") edicaoDoPerfil.removerFoto = false;
  else edicaoDoPerfil.removerFaixa = false;
  desenharPreviaDoPerfil();
}

function removerImagemDoPerfil(campo) {
  edicaoDoPerfil[campo] = null;
  if (campo === "foto") edicaoDoPerfil.removerFoto = true;
  else edicaoDoPerfil.removerFaixa = true;
  desenharPreviaDoPerfil();
}

async function salvarPerfil() {
  const form = $("#form-perfil");
  const erro = $("#erro-perfil");
  const salvar = $("#perfil-salvar");
  const envio = new FormData();
  envio.append("apelido", form.elements.apelido.value);
  envio.append("cor", form.elements.cor.value);
  envio.append("frase", form.elements.frase.value);
  envio.append("sobre", form.elements.sobre.value);
  for (const campo of ["foto", "faixa"]) {
    const escolhida = edicaoDoPerfil[campo];
    const remover = campo === "foto" ? edicaoDoPerfil.removerFoto : edicaoDoPerfil.removerFaixa;
    if (escolhida) envio.append(campo, escolhida.arquivo);
    else if (remover) envio.append(`remover_${campo}`, "1");
  }
  erro.hidden = true;
  salvar.disabled = true;
  try {
    const { perfil } = await api.mudarPerfil(envio);
    aplicarPerfil(eu(), perfil);
    $("#dialogo-perfil").close();
    avisoRapido("Perfil salvo.");
  } catch (falha) {
    erro.textContent = falha.message;
    erro.hidden = false;
  } finally {
    salvar.disabled = false;
  }
}

function configurarPerfil() {
  const dialogo = $("#dialogo-perfil");
  const form = $("#form-perfil");
  form.addEventListener("input", (evento) => {
    if (evento.target.type !== "file") desenharPreviaDoPerfil();
  });
  form.addEventListener("submit", (evento) => {
    evento.preventDefault();
    salvarPerfil();
  });
  for (const campo of ["foto", "faixa"]) {
    const arquivo = $(`#perfil-${campo}`);
    $(`#perfil-${campo}-escolher`).addEventListener("click", () => arquivo.click());
    $(`#perfil-${campo}-remover`).addEventListener("click", () => removerImagemDoPerfil(campo));
    arquivo.addEventListener("change", () => {
      escolherImagemDoPerfil(campo, arquivo.files[0]);
      arquivo.value = "";
    });
  }
  $("#perfil-cancelar").addEventListener("click", () => dialogo.close());
  // As imagens escolhidas só valem enquanto o diálogo está aberto
  dialogo.addEventListener("close", limparEdicaoDoPerfil);
}

/* =================================================================
   Tempo real
   ================================================================= */

function conectarEventos() {
  fecharEventos();
  estado.eventos = api.eventos(tratarEvento, eventosCaidos);
}

function fecharEventos() {
  estado.eventos?.fechar();
  estado.eventos = null;
  clearTimeout(estado.esperaDaReconexao);
}

// O navegador desistiu de reconectar: confere a sessão e tenta de novo
function eventosCaidos() {
  fecharEventos();
  document.body.classList.add("chat--sem-conexao");
  estado.esperaDaReconexao = setTimeout(async () => {
    if (!estado.dados) return;
    try {
      await recarregarTudo();
      conectarEventos();
    } catch (falha) {
      if (falha.codigo !== "sem-sessao") eventosCaidos();
    }
  }, CONFIG.esperaDaReconexao);
}

// Os pedidos de "canais" chegam em rajadas (várias mudanças seguidas): um GET só
function agendarRecarga() {
  clearTimeout(estado.esperaDosCanais);
  estado.esperaDosCanais = setTimeout(() => recarregarEstado().catch(() => {}), 250);
}

async function recarregarEstado() {
  const dados = await api.estado();
  if (!estado.dados) return;
  estado.dados = dados;
  $("#nome-conta").textContent = apelidoDe(eu());
  // O alvo aberto sumiu (canal apagado, mesa sem acesso): volta ao padrão
  const alvo = estado.alvo;
  if (alvo && !alvoDoHash(alvo.tipo === "privada" ? `#privada-${alvo.usuario}` : `#canal-${alvo.id}`)) {
    estado.historicos.delete(alvo.chave);
    ganchosDaVoz.mudou?.();
    return irPara("");
  }
  // Canais apagados levam o histórico guardado
  for (const chave of [...estado.historicos.keys()]) {
    if (!ehChaveDePrivada(chave) && !acharCanal(chave)) estado.historicos.delete(chave);
  }
  desenharLista();
  desenharCabeca();
  desenharMembros();
  if (alvo && !alvo.voz) {
    desenharEscrever();
    desenharMensagens();
  }
  ganchosDaVoz.mudou?.(); // a sala conectada pode ter sumido; a aberta, mudado
}

// "recarregar": o portal perdeu os eventos que faltavam; pede tudo de novo
async function recarregarTudo() {
  estado.historicos.clear();
  estado.lidaEnviada.clear();
  await recarregarEstado();
  if (estado.alvo && !estado.alvo.voz) await carregarHistorico(estado.alvo);
}

function contarChegada(m) {
  if (m.autor.usuario === eu()) return;
  const aberto = estado.alvo?.chave === m.canal && !document.hidden && document.hasFocus() && pertoDoFim(caixaDasMensagens());
  if (aberto) return;
  if (ehChaveDePrivada(m.canal)) {
    const privada = privadaDaLista(m.canal);
    if (!privada) return agendarRecarga(); // conversa nova (ou oculta): volta para a lista
    privada.naoLidas = (privada.naoLidas || 0) + 1;
    privada.ultimaEm = m.em;
    estado.dados.privadas.sort((a, b) => (a.ultimaEm < b.ultimaEm ? 1 : a.ultimaEm > b.ultimaEm ? -1 : 0));
  } else {
    const canal = acharCanal(m.canal)?.canal;
    if (!canal) return;
    canal.naoLidas = (canal.naoLidas || 0) + 1;
    if (m.mencionaVoce) canal.mencoes = (canal.mencoes || 0) + 1;
  }
  // Quem estava vendo o canal mas rolado para cima: a linha "Novas" marca onde começaram
  if (estado.alvo?.chave === m.canal && !estado.marcaNovas) estado.marcaNovas = m.id;
}

function tratarEvento(tipo, corpo) {
  if (!estado.dados) return;
  if (tipo === "conectado") return document.body.classList.remove("chat--sem-conexao");
  if (tipo === "reconectando") return document.body.classList.add("chat--sem-conexao");

  if (tipo === "mensagem" && corpo.mensagem) {
    const m = corpo.mensagem;
    acrescentarMensagem(m);
    if (ehChaveDePrivada(m.canal)) {
      const privada = privadaDaLista(m.canal);
      if (privada) privada.ultimaEm = m.em;
      else agendarRecarga(); // conversa nova (ou oculta), mesmo que mandada por outra janela desta conta
    }
    contarChegada(m);
    avisarChegada(m);
    desenharLista();
    if (estado.alvo?.chave === m.canal) desenharMensagens();
  } else if (tipo === "editada" && corpo.mensagem) {
    trocarMensagem(corpo.mensagem);
  } else if (tipo === "apagada") {
    tirarMensagem(corpo.id, corpo.canal);
  } else if (tipo === "lida") {
    // Outra janela da mesma conta leu: as contagens daqui acompanham
    const h = estado.historicos.get(corpo.canal);
    estado.lidaEnviada.set(corpo.canal, corpo.ate);
    if (!h?.carregado || h.lista[h.lista.length - 1]?.id === corpo.ate) zerarContagens(corpo.canal);
  } else if (tipo === "canais") {
    agendarRecarga();
  } else if (tipo === "presenca") {
    const noChat = new Set(corpo.noChat ?? []);
    for (const conta of estado.dados.contas) conta.noChat = noChat.has(conta.usuario);
    desenharLista();
    desenharMembros();
    redesenharCard();
  } else if (tipo === "voz") {
    estado.dados.voz = { ...(estado.dados.voz ?? {}), salas: corpo.salas ?? {} };
    desenharLista();
    ganchosDaVoz.mudou?.();
    redesenharCard();
  } else if (tipo === "perfil" && corpo.usuario && corpo.perfil) {
    aplicarPerfil(corpo.usuario, corpo.perfil);
  } else if (tipo === "reacoes" || tipo === "fixadas") {
    ganchosDosExtras.evento?.(tipo, corpo);
  } else if (tipo === "mover" && corpo.canal) {
    ganchosDaVoz.mover?.(corpo);
  } else if (tipo === "recarregar") {
    recarregarTudo().catch(() => {});
  }
}

/* =================================================================
   Avisos do navegador e o som
   -----------------------------------------------------------------
   Enquanto o chat está aberto, mesmo noutra aba ou com a janela
   minimizada. A permissão só é pedida pelo "Ativar avisos" das
   configurações. Cada canal de texto avisa Tudo, Só menções ou
   Nada; as privadas, sempre. Nada para as suas mensagens nem para
   o canal aberto com a janela em foco.
   ================================================================= */

const temAvisos = () => typeof Notification === "function";
const somLigado = () => lerLocal("chat:som") !== "nao";

// O app novo mostra a notificação do Windows (o navegador embutido recusa as do site)
const appAvisa = () => typeof window.cronicasEternasApp?.avisar === "function";
const avisosDoAppLigados = () => lerLocal("chat:avisos-app") !== "nao";

function itemDosAvisos() {
  if (appAvisa()) {
    const ligados = avisosDoAppLigados();
    return {
      texto: ligados ? "Avisos do app: ligados" : "Avisos do app: desligados",
      atual: ligados,
      acao: () => {
        gravarLocal("chat:avisos-app", ligados ? "nao" : "sim");
        avisoRapido(ligados ? "Avisos do app desligados." : "Avisos do app ligados.");
      },
    };
  }
  if (!temAvisos()) return { texto: "Este navegador não mostra avisos", desligado: true };
  if (Notification.permission === "granted") return { texto: "Avisos ativados", desligado: true, atual: true };
  if (Notification.permission === "denied") {
    // O site não consegue desbloquear sozinho: o item explica o caminho
    const explicacao = window.cronicasEternasApp
      ? "Atualize o app para receber avisos."
      : "Os avisos estão bloqueados neste navegador. Clique no cadeado à esquerda do endereço, ponha Notificações em Permitir e recarregue a página.";
    const conteudo = criar("span", "menu-chat__explicacao");
    conteudo.append(criar("strong", null, "Avisos bloqueados"), criar("span", null, explicacao));
    return { conteudo, desligado: true };
  }
  return { texto: "Ativar avisos", acao: ativarAvisos };
}

function itemDoSom() {
  const ligado = somLigado();
  return {
    texto: ligado ? "Som dos avisos: ligado" : "Som dos avisos: desligado",
    atual: ligado,
    acao: () => {
      gravarLocal("chat:som", ligado ? "nao" : "sim");
      if (!ligado) tocarSom(); // para ouvir como é
      avisoRapido(ligado ? "Som dos avisos desligado." : "Som dos avisos ligado.");
    },
  };
}

async function ativarAvisos() {
  let resposta;
  try {
    resposta = await Notification.requestPermission();
  } catch {
    resposta = Notification.permission;
  }
  if (resposta === "granted") avisoRapido("Avisos ativados.");
  else if (resposta === "denied") avisoRapido("O navegador bloqueou os avisos. Libere nas configurações do site.");
  else avisoRapido("Os avisos continuam desligados.");
}

async function mudarAviso(canal, nivel) {
  try {
    await api.mudarAviso(canal.id, nivel);
    canal.aviso = nivel;
    const texto = NIVEIS_DE_AVISO.find(([valor]) => valor === nivel)[1];
    avisoRapido(`Avisos de #${canal.nome}: ${texto}.`);
  } catch (falha) {
    avisarFalha(falha);
  }
}

// O toque: duas notas curtas, feitas na hora com Web Audio (sem arquivo)
let contextoDoSom = null;

function prepararSom() {
  if (contextoDoSom || typeof AudioContext !== "function") return;
  try {
    contextoDoSom = new AudioContext();
  } catch {
    contextoDoSom = null;
  }
}

function tocarSom() {
  prepararSom();
  const ctx = contextoDoSom;
  if (!ctx) return;
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  const inicio = ctx.currentTime + 0.01;
  [
    [880, 0],
    [1320, 0.09],
  ].forEach(([frequencia, atraso]) => {
    const nota = ctx.createOscillator();
    const volume = ctx.createGain();
    nota.type = "sine";
    nota.frequency.value = frequencia;
    volume.gain.setValueAtTime(0.0001, inicio + atraso);
    volume.gain.exponentialRampToValueAtTime(0.12, inicio + atraso + 0.015);
    volume.gain.exponentialRampToValueAtTime(0.0001, inicio + atraso + 0.22);
    nota.connect(volume).connect(ctx.destination);
    nota.start(inicio + atraso);
    nota.stop(inicio + atraso + 0.25);
  });
}

// O texto do aviso: as menções com o nome, os spoilers escondidos, até 120 caracteres
function textoDoAviso(m, categoria) {
  const nomeDe = (usuario) => {
    if (usuario === "todos") return "todos";
    const persona = categoria && estado.dados.personasDosMembros?.[categoria.id]?.[usuario];
    return persona?.nome ?? apelidoDe(usuario);
  };
  let texto = String(m.texto || "")
    .replace(/<@([a-z0-9_-]{2,30}|todos)>/g, (_, usuario) => `@${nomeDe(usuario)}`)
    .replace(/\|\|[\s\S]+?\|\|/g, "▒▒▒")
    .replace(/\s+/g, " ")
    .trim();
  if (!texto && m.imagens?.length) texto = m.imagens.length === 1 ? "(uma imagem)" : `(${m.imagens.length} imagens)`;
  if (!texto && m.gif) texto = "(GIF)";
  const letras = [...texto];
  return letras.length > CONFIG.tamanhoDoAviso ? `${letras.slice(0, CONFIG.tamanhoDoAviso - 1).join("")}…` : texto;
}

function avisarChegada(m) {
  if (!estado.dados || m.autor.usuario === eu()) return;
  if (estado.alvo?.chave === m.canal && !estado.alvo.voz && !document.hidden && document.hasFocus()) return;

  let titulo;
  let hash;
  let categoria = null;
  if (ehChaveDePrivada(m.canal)) {
    titulo = `${m.persona?.nome || m.autor.nomeConta} (privada)`;
    hash = `#privada-${outroDaChave(m.canal)}`;
  } else {
    const achado = acharCanal(m.canal);
    if (!achado) return;
    const nivel = achado.canal.aviso || "tudo";
    if (nivel === "nada" || (nivel === "mencoes" && !m.mencionaVoce)) return;
    categoria = achado.categoria;
    titulo = `${m.persona?.nome || m.autor.nomeConta} em #${achado.canal.nome}`;
    hash = `#canal-${achado.canal.id}`;
  }

  if (somLigado()) tocarSom();
  if (appAvisa()) {
    if (!avisosDoAppLigados()) return;
    try {
      window.cronicasEternasApp.avisar(titulo, textoDoAviso(m, categoria));
    } catch {
      // o app não mostrou: fica o som
    }
    return;
  }
  if (!temAvisos() || Notification.permission !== "granted") return;
  try {
    const aviso = new Notification(titulo, { body: textoDoAviso(m, categoria), tag: m.canal });
    aviso.addEventListener("click", () => {
      window.focus();
      irPara(hash);
      aviso.close();
    });
  } catch {
    // o navegador não deixou mostrar (em alguns, só pelo service worker): fica o som
  }
}

/* =================================================================
   Prévia: o painel "Ver o chat como"
   ================================================================= */

function configurarSimulacao() {
  if (!MODO_PREVIA) return;
  $("#sim-conta").addEventListener("change", async (evento) => {
    ganchosDaVoz.encerrar?.();
    api.trocarConta(evento.target.value);
    estado.historicos.clear();
    estado.alvo = null;
    await abrirChat();
  });
  $("#sim-restaurar").addEventListener("click", async () => {
    ganchosDaVoz.encerrar?.();
    api.restaurar();
    api.trocarConta($("#sim-conta").value);
    estado.historicos.clear();
    estado.alvo = null;
    await abrirChat();
    avisoRapido("Exemplos restaurados.");
  });
}

/* =================================================================
   Início
   ================================================================= */

function configurarRolagem() {
  const caixa = caixaDasMensagens();
  caixa.addEventListener("scroll", () => {
    estado.grudado = pertoDoFim(caixa);
    if (caixa.scrollTop < 120) carregarMaisAntigas();
    marcarLidaSePreciso();
  });
  window.addEventListener("focus", marcarLidaSePreciso);
  document.addEventListener("visibilitychange", marcarLidaSePreciso);
}

function configurarDialogos() {
  const dialogoImagem = $("#dialogo-imagem");
  dialogoImagem.addEventListener("click", () => dialogoImagem.close());
  const novaConversa = $("#dialogo-nova-conversa");
  fecharAoClicarFora(novaConversa);
  $("#nova-conversa-fechar").addEventListener("click", () => novaConversa.close());
  configurarDialogoDoCanal();
  configurarCategorias();
}

async function iniciar() {
  quandoPerderSessao(sessaoPerdida);
  configurarEntrada();
  configurarEscrever();
  configurarMembros();
  configurarRolagem();
  configurarDialogos();
  configurarSimulacao();
  configurarCard();
  configurarPerfil();
  $("#link-portal").href = enderecoDoPortal();
  $("#botao-sair").addEventListener("click", sair);
  $("#botao-configuracoes").addEventListener("click", abrirConfiguracoes);
  window.addEventListener("hashchange", abrirPeloEndereco);
  // O navegador só deixa tocar som depois de um clique ou tecla na página
  for (const tipo of ["pointerdown", "keydown"]) document.addEventListener(tipo, prepararSom, { once: true, capture: true });

  try {
    await abrirChat();
  } catch (falha) {
    if (falha.codigo === "sem-sessao") return mostrarEntrada();
    mostrarEntrada(falha.message);
  }
}

iniciar();
