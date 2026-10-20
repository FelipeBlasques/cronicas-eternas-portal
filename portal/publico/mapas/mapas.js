/* =================================================================
   Crônicas Eternas: Mapas
   -----------------------------------------------------------------
   Os mapas de Draevor e de cada mesa. A galeria mostra só as
   miniaturas, em grupos: primeiro Draevor (os mapas sem mesa),
   depois um grupo por mesa. Só o administrador envia, altera e
   apaga mapas. A miniatura, a largura e a altura saem daqui mesmo:
   o navegador mede a imagem e reduz num <canvas> na hora do envio.

   Clicar num card abre o mapa no visor, com link próprio
   (mapas/#mapa-xxxxxxxx). O zoom e o arraste ficam no visor.js,
   carregado antes deste.

   No servidor, conversa com o servidor/mapas.js. Aberta fora dele
   (arquivo no PC ou prévia), usa o mapa de Tyrenar de exemplo e um
   painel para ver a página como administrador, editor ou jogador.

   Usa o comum.js, carregado antes: pedir(), criar(), avisos, barra
   lateral, status do Foundry e cinzas. Do visor.js, usa criarVisor().
   ================================================================= */

const CONFIG = {
  intervaloStatus: 15000, // tempo entre consultas ao estado do Foundry, em ms
  maxMapa: 25 * 1024 * 1024, // 25 MB, o mesmo limite do servidor
  ladoMaximo: 30000, // largura e altura da imagem, em pixels, o mesmo limite do servidor
  ladoMiniatura: 640, // o lado maior da miniatura da galeria, em pixels
};

const TIPOS_ACEITOS = ["image/png", "image/jpeg", "image/webp", "image/gif", "image/avif"];

/* =================================================================
   Conversa com o servidor
   ================================================================= */

// Os dados vão como JSON; a imagem nova, se houver, vai junto com a miniatura e as medidas
function formularioDe(dados) {
  const { imagem, ...resto } = dados;
  const form = new FormData();
  form.append("dados", JSON.stringify(imagem ? { ...resto, largura: imagem.largura, altura: imagem.altura } : resto));
  if (imagem) {
    form.append("imagem", imagem.arquivo);
    form.append("miniatura", imagem.miniatura);
  }
  return form;
}

const apiDoServidor = {
  mapas: () => pedir("GET", "/api/mapas"),
  estado: () => pedir("GET", "/api/estado", undefined, { silencioso: true }),
  sair: () => pedir("POST", "/api/sair"),
  enviar: (dados) => pedir("POST", "/api/mapas", formularioDe(dados)),
  alterar: (id, dados) => pedir("PUT", caminhoDe("/api/mapas", id), formularioDe(dados)),
  apagar: (id) => pedir("DELETE", caminhoDe("/api/mapas", id)),
};

/* =================================================================
   Prévia: um portal de mentira, só na memória do navegador
   ================================================================= */

const CONTAS_DA_PREVIA = {
  admin: { usuario: "mestre", nome: "Mestre", cargo: "admin" },
  editor: { usuario: "takezo", nome: "Takezo", cargo: "editor" },
  jogador: { usuario: "neia", nome: "Neia", cargo: "jogador" },
};

// Guardado como no dados.json do servidor; a mapas() monta o que a página recebe
function exemplosDaPrevia() {
  return {
    contas: [
      { usuario: "mestre", nome: "Mestre" },
      { usuario: "takezo", nome: "Takezo" },
      { usuario: "neia", nome: "Neia" },
    ],
    // As mesmas das outras prévias
    campanhas: [
      { id: "ode-to-sleep", nome: "Ode to Sleep", cor: "#2e3756" },
      { id: "remissao", nome: "Remissão do Flagelo Esvanescente", cor: "#5a2a26" },
    ],
    mapas: [
      {
        id: "mapa-7a1e0c3d",
        nome: "Tyrenar",
        mesas: [],
        descricao: "O reino entre Monaron, Feneck e as **Eclipsed Lands**. Ao norte e a leste, só o mar.",
        // A mesma imagem nos dois: 1600 × 1200, nas proporções do mapa de verdade
        imagem: "previa-tyrenar.webp",
        miniatura: "previa-tyrenar.webp",
        largura: 1600,
        altura: 1200,
        visibilidade: "todos",
        criadoEm: "2026-10-20T12:00:00.000Z",
        alteradoEm: "2026-10-20T12:00:00.000Z",
        marcadores: [],
      },
    ],
  };
}

function criarApiDePrevia() {
  let banco = exemplosDaPrevia();
  let conta = CONTAS_DA_PREVIA.admin;

  // O mesmo formato do servidor/mapas.js
  const podeVer = (item) => conta.cargo === "admin" || item.visibilidade !== "admin";
  const podeEditarMarcador = (m) => conta.cargo === "admin" || (conta.cargo === "editor" && m.registradoPor === conta.usuario);

  const proibido = () => erroComCodigo("Só o administrador pode fazer isso.", "proibido");
  const semMapa = () => erroComCodigo("Esse mapa não existe mais. Recarregue a página.", "nao-encontrado");
  const idAleatorio = () => Array.from(crypto.getRandomValues(new Uint8Array(4)), (b) => b.toString(16).padStart(2, "0")).join("");

  function acharMapa(id) {
    const mapa = banco.mapas.find((m) => m.id === id);
    if (!mapa || !podeVer(mapa)) throw semMapa();
    return mapa;
  }

  /* ---------- O que chega do formulário, conferido como no servidor ---------- */

  function valoresDoMapa(dados) {
    const nome = typeof dados.nome === "string" ? dados.nome.trim() : "";
    if (!nome) throw erroComCodigo("Preencha o campo Nome.");
    if (nome.length > 80) throw erroComCodigo("O campo Nome pode ter no máximo 80 caracteres.");
    const descricao = typeof dados.descricao === "string" ? dados.descricao.trim() : "";
    if (descricao.length > 600) throw erroComCodigo("O campo Descrição pode ter no máximo 600 caracteres.");
    const conhecidas = new Set(banco.campanhas.map((c) => c.id));
    return {
      nome,
      mesas: [...new Set(dados.mesas)].filter((id) => conhecidas.has(id)),
      descricao,
      visibilidade: dados.visibilidade === "admin" ? "admin" : "todos",
    };
  }

  // A imagem da prévia vira um endereço temporário do próprio navegador
  const imagensDe = (imagem) => ({
    imagem: URL.createObjectURL(imagem.arquivo),
    miniatura: URL.createObjectURL(imagem.miniatura),
    largura: imagem.largura,
    altura: imagem.altura,
  });

  /* ---------- O formato enviado à página ---------- */

  function marcadorPublico(m) {
    return {
      id: m.id,
      nome: m.nome,
      tipo: m.tipo,
      x: m.x,
      y: m.y,
      impresso: Boolean(m.impresso),
      raio: m.impresso ? m.raio ?? null : null,
      caixa: m.impresso ? m.caixa ?? null : null,
      glifo: m.impresso ? null : m.glifo,
      apelido: m.apelido || "",
      descricao: m.descricao || "",
      visibilidade: m.visibilidade,
      registradoPor: banco.contas.find((c) => c.usuario === m.registradoPor)?.nome ?? m.registradoNome ?? null,
      podeEditar: podeEditarMarcador(m),
    };
  }

  function mapaPublico(mapa) {
    const { marcadores, ...resto } = mapa;
    return { ...resto, mesas: [...mapa.mesas], marcadores: marcadores.filter(podeVer).map(marcadorPublico) };
  }

  return {
    trocarConta(cargo) {
      conta = CONTAS_DA_PREVIA[cargo] ?? CONTAS_DA_PREVIA.admin;
    },
    restaurar() {
      banco = exemplosDaPrevia();
    },
    async mapas() {
      await esperar(120);
      return structuredClone({
        conta: { ...conta },
        mesas: banco.campanhas,
        mapas: banco.mapas.filter(podeVer).map(mapaPublico),
      });
    },
    async estado() {
      return { online: true, mundoAtivo: "ode-to-sleep", conectados: 0, trocandoPara: null };
    },
    async sair() {
      await esperar(100);
      return {};
    },
    async enviar(dados) {
      await esperar(400);
      if (conta.cargo !== "admin") throw proibido();
      if (!dados.imagem) throw erroComCodigo("Escolha a imagem do mapa.");
      const valores = valoresDoMapa(dados);
      if (banco.mapas.length >= 30) throw erroComCodigo("A página pode ter no máximo 30 mapas.");
      const ocupados = new Set(banco.mapas.map((m) => m.id));
      let id;
      do id = `mapa-${idAleatorio()}`;
      while (ocupados.has(id));
      const quando = new Date().toISOString();
      const { imagem, miniatura, largura, altura } = imagensDe(dados.imagem);
      banco.mapas.push({
        id,
        nome: valores.nome,
        mesas: valores.mesas,
        descricao: valores.descricao,
        imagem,
        miniatura,
        largura,
        altura,
        visibilidade: valores.visibilidade,
        criadoEm: quando,
        alteradoEm: quando,
        marcadores: [],
      });
      return { mapa: { id } };
    },
    // Trocar a imagem mantém os marcadores, como no servidor
    async alterar(id, dados) {
      await esperar(300);
      if (conta.cargo !== "admin") throw proibido();
      const mapa = acharMapa(id);
      const valores = valoresDoMapa(dados);
      Object.assign(mapa, valores, dados.imagem ? imagensDe(dados.imagem) : {}, { alteradoEm: new Date().toISOString() });
      return { ok: true };
    },
    async apagar(id) {
      await esperar(200);
      if (conta.cargo !== "admin") throw proibido();
      const mapa = acharMapa(id);
      banco.mapas = banco.mapas.filter((m) => m !== mapa);
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
  mapas: [],
};

const ehAdmin = () => estado.conta?.cargo === "admin";
const ehEditor = () => estado.conta?.cargo === "editor";

const mesaPorId = (id) => estado.mesas.find((m) => m.id === id);
const mapaPorId = (id) => estado.mapas.find((m) => m.id === id);

const porNome = (a, b) => a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" });
const emMegabytes = (bytes) => `${(bytes / (1024 * 1024)).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB`;

/* =================================================================
   Cabeçalho: conta e estado do Foundry
   ================================================================= */

function atualizarTopo() {
  $("#nome-conta").textContent = estado.conta?.nome ?? "";
  const cargo = $("#cargo-conta");
  cargo.hidden = !ehAdmin() && !ehEditor();
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
   A galeria
   ================================================================= */

// Primeiro Draevor (os mapas sem mesa), depois um grupo para cada mesa, na ordem das Mesas.
// Um mapa de duas mesas aparece nas duas.
function gruposDaGaleria() {
  const grupos = [{ id: "draevor", nome: "Draevor", sub: "O mundo todo", mapas: estado.mapas.filter((m) => !m.mesas.length) }];
  for (const mesa of estado.mesas) {
    grupos.push({ id: mesa.id, nome: mesa.nome, cor: mesa.cor, mapas: estado.mapas.filter((m) => m.mesas.includes(mesa.id)) });
  }
  return grupos.filter((g) => g.mapas.length).map((g) => ({ ...g, mapas: g.mapas.sort(porNome) }));
}

function seloOculto() {
  const selo = criar("span", "selo-oculto");
  selo.append(simbolo("icone-oculto"), "Só o administrador");
  return selo;
}

// A miniatura numa moldura de ferro, com o nome abaixo. O administrador tem o lápis no canto.
function montarCard(mapa) {
  const oculto = mapa.visibilidade === "admin";
  const item = criar("article", `mapa-item${oculto ? " mapa-item--oculto" : ""}`);
  item.dataset.id = mapa.id;

  const card = criar("button", "mapa-card");
  card.type = "button";
  card.setAttribute("aria-label", oculto ? `Abrir o mapa ${mapa.nome}, que só o administrador vê` : `Abrir o mapa ${mapa.nome}`);
  const moldura = criar("span", "mapa-card__moldura");
  // A galeria só carrega as miniaturas; a imagem inteira fica para o visor
  const miniatura = criar("img", "mapa-card__miniatura");
  miniatura.alt = "";
  miniatura.loading = "lazy";
  miniatura.decoding = "async";
  miniatura.src = mapa.miniatura;
  moldura.append(miniatura);
  card.append(moldura, criar("span", "mapa-card__nome", mapa.nome));
  if (oculto) card.append(seloOculto());
  card.addEventListener("click", () => abrirMapa(mapa.id));
  item.append(card);

  if (ehAdmin()) {
    const lapis = criar("button", "botao botao-icone mapa-item__lapis");
    lapis.type = "button";
    lapis.title = "Alterar o mapa";
    lapis.setAttribute("aria-label", `Alterar o mapa ${mapa.nome}`);
    lapis.append(simbolo("icone-lapis"));
    lapis.addEventListener("click", () => abrirEdicao(mapa));
    item.append(lapis);
  }
  return item;
}

function montarGrupo(grupo) {
  const secao = criar("section", "grupo-mapas");
  const titulo = criar("h2", "grupo-mapas__titulo");
  titulo.id = `grupo-${grupo.id}`;
  if (grupo.cor) {
    const ponto = criar("span", "grupo-mapas__ponto");
    ponto.style.setProperty("--cor", corVisivel(grupo.cor));
    titulo.append(ponto);
  }
  titulo.append(grupo.nome);
  const nota = grupo.sub ? `${grupo.sub} · ` : "";
  titulo.append(criar("small", "grupo-mapas__nota", `${nota}${grupo.mapas.length === 1 ? "1 mapa" : `${grupo.mapas.length} mapas`}`));
  secao.setAttribute("aria-labelledby", titulo.id);

  const grade = criar("div", "grupo-mapas__grade");
  grade.append(...grupo.mapas.map(montarCard));
  secao.append(titulo, grade);
  return secao;
}

function renderizarGaleria() {
  const galeria = $("#galeria");
  const grupos = gruposDaGaleria();
  if (!grupos.length) {
    const texto = ehAdmin() ? "Ainda não há mapas. Envie o primeiro em \"+ Mapa\"." : "Ainda não há mapas.";
    galeria.replaceChildren(criar("p", "galeria-vazia", texto));
    return;
  }
  galeria.replaceChildren(...grupos.map(montarGrupo));
}

/* =================================================================
   O visor: um mapa aberto
   -----------------------------------------------------------------
   Abrir um mapa põe o id dele no endereço (#mapa-xxxxxxxx), então o
   link funciona e o Voltar do navegador volta à galeria. O que vier
   depois da barra (#mapa-xxxxxxxx/marca-xxxxxxxx) é o lugar, ainda
   não usado. As cinzas do fundo somem enquanto o visor está aberto.
   ================================================================= */

const visor = criarVisor({
  janela: $("#visor-janela"),
  imagem: $("#visor-imagem"),
  lugares: $("#visor-lugares"),
  botoes: { aproximar: $("#visor-aproximar"), afastar: $("#visor-afastar"), inteiro: $("#visor-inteiro") },
});

const TITULO_DA_PAGINA = document.title;

const navegacao = {
  aberto: null, // o id do mapa no visor, ou null na galeria
  pelaGaleria: false, // aberto por um card: "Voltar aos mapas" é o Voltar do navegador
};

const mapaDoEndereco = () => location.hash.match(/^#(mapa-[\w-]+)/)?.[1] ?? null;

// Põe (ou tira) o mapa aberto no endereço da página. Devolve false se o navegador não deixar.
function trocarEndereco(ancora, { nova = false } = {}) {
  const endereco = ancora || location.pathname + location.search;
  try {
    if (nova) history.pushState(null, "", endereco);
    else history.replaceState(null, "", endereco);
    return true;
  } catch {
    // dentro de alguns quadros de prévia, o navegador não deixa mudar o endereço
    return false;
  }
}

function abrirMapa(id) {
  const anotado = trocarEndereco(`#${id}`, { nova: true });
  mostrarRota(id);
  navegacao.pelaGaleria = anotado;
}

// Mostra o mapa do endereço no visor, ou a galeria
function mostrarRota(id = mapaDoEndereco()) {
  const mapa = id ? mapaPorId(id) : null;
  if (id && !mapa) {
    avisoRapido("Esse mapa não existe ou não está disponível para você.");
    trocarEndereco("");
  }
  if (mapa) abrirVisor(mapa);
  else fecharVisor();
}

async function abrirVisor(mapa) {
  $("#visor-nome").textContent = mapa.nome;
  document.title = `${mapa.nome} · ${TITULO_DA_PAGINA}`;
  if (navegacao.aberto === mapa.id) return;
  navegacao.aberto = mapa.id;
  navegacao.pelaGaleria = false;

  // O foco estava no card, que vai sumir: passa para o mapa
  const focoNaGaleria = $("#pagina").contains(document.activeElement);
  $("#pagina").hidden = true;
  $("#visor").hidden = false;
  document.body.classList.add("com-visor");
  if (focoNaGaleria) $("#visor-janela").focus({ preventScroll: true });
  const carregando = $("#visor-carregando");
  carregando.textContent = "Abrindo o mapa…";
  carregando.hidden = false;

  try {
    if (await visor.abrir(mapa)) carregando.hidden = true;
  } catch (falha) {
    if (navegacao.aberto === mapa.id) carregando.textContent = falha.message;
  }
}

function fecharVisor() {
  const id = navegacao.aberto;
  if (!id) return;
  navegacao.aberto = null;
  navegacao.pelaGaleria = false;
  visor.fechar();
  const focoNoVisor = $("#visor").contains(document.activeElement) || document.activeElement === document.body;
  $("#visor").hidden = true;
  $("#pagina").hidden = false;
  document.body.classList.remove("com-visor");
  document.title = TITULO_DA_PAGINA;
  // O foco volta ao card do mapa que estava aberto
  if (focoNoVisor) $(`.mapa-item[data-id="${id}"] .mapa-card`)?.focus();
}

function voltarAGaleria() {
  if (navegacao.pelaGaleria) return history.back();
  trocarEndereco("");
  mostrarRota(null);
}

/* =================================================================
   A imagem do mapa: medida e reduzida aqui mesmo
   -----------------------------------------------------------------
   O servidor não tem bibliotecas para mexer em imagens. Então o
   navegador abre a imagem escolhida, mede a largura e a altura e
   faz a miniatura da galeria num <canvas>, em WEBP.
   ================================================================= */

function abrirImagem(endereco) {
  return new Promise((resolver, rejeitar) => {
    const img = new Image();
    img.addEventListener("load", () => resolver(img), { once: true });
    img.addEventListener("error", () => rejeitar(new Error("Não foi possível abrir essa imagem. Escolha outra.")), { once: true });
    img.src = endereco;
  });
}

function desenharReduzida(fonte, largura, altura) {
  const canvas = document.createElement("canvas");
  canvas.width = largura;
  canvas.height = altura;
  const contexto = canvas.getContext("2d");
  contexto.imageSmoothingEnabled = true;
  contexto.imageSmoothingQuality = "high";
  contexto.drawImage(fonte, 0, 0, largura, altura);
  return canvas;
}

// Uns 640 px no lado maior. Reduz em passos (4, 2 e 1 vez o tamanho final) para o traço não serrilhar.
async function fazerMiniatura(img) {
  const escala = Math.min(1, CONFIG.ladoMiniatura / Math.max(img.naturalWidth, img.naturalHeight));
  const largura = Math.max(1, Math.round(img.naturalWidth * escala));
  const altura = Math.max(1, Math.round(img.naturalHeight * escala));
  let fonte = img;
  for (let fator = 4; fator > 1; fator /= 2) {
    if (largura * fator < img.naturalWidth) fonte = desenharReduzida(fonte, largura * fator, altura * fator);
  }
  const canvas = desenharReduzida(fonte, largura, altura);
  const blob = await new Promise((resolver) => canvas.toBlob(resolver, "image/webp", 0.85));
  if (!blob) throw new Error("Não foi possível fazer a miniatura do mapa. Tente outra imagem.");
  // Um navegador sem WEBP no canvas entrega PNG, que o servidor também aceita
  return new File([blob], blob.type === "image/webp" ? "miniatura.webp" : "miniatura.png", { type: blob.type });
}

// Confere, mede e reduz a imagem escolhida. Devolve o que vai para o servidor.
async function prepararImagem(arquivo) {
  if (!TIPOS_ACEITOS.includes(arquivo.type)) throw new Error("Use imagens PNG, JPG, WEBP, GIF ou AVIF.");
  if (arquivo.size > CONFIG.maxMapa) throw new Error(`O mapa pode ter no máximo 25 MB. Este tem ${emMegabytes(arquivo.size)}.`);
  const endereco = URL.createObjectURL(arquivo);
  try {
    const img = await abrirImagem(endereco);
    const largura = img.naturalWidth;
    const altura = img.naturalHeight;
    if (!largura || !altura) throw new Error("Não foi possível medir essa imagem. Escolha outra.");
    if (largura > CONFIG.ladoMaximo || altura > CONFIG.ladoMaximo) {
      throw new Error(`A imagem pode ter no máximo ${CONFIG.ladoMaximo} px de lado.`);
    }
    return { arquivo, miniatura: await fazerMiniatura(img), largura, altura };
  } finally {
    URL.revokeObjectURL(endereco);
  }
}

/* =================================================================
   Enviar e alterar (só o administrador)
   -----------------------------------------------------------------
   Ao escolher a imagem, ela já é medida e reduzida, e a miniatura
   aparece no formulário. Trocar a imagem de um mapa mantém os
   lugares: as posições são proporções da largura e da altura.
   ================================================================= */

const edicao = {
  mapa: null, // o mapa sendo alterado, ou null para um novo
  mesas: new Set(),
  preparo: null, // a imagem escolhida sendo medida e reduzida (promessa)
};

const formEdicao = () => $("#form-edicao");

function mostrarErroDaEdicao(texto) {
  const erro = $("#erro-edicao");
  erro.textContent = texto;
  erro.hidden = !texto;
}

function mostrarAndamento(texto) {
  const andamento = $("#andamento-edicao");
  andamento.textContent = texto;
  andamento.hidden = !texto;
}

function mostrarPreviaDaImagem(src, legenda) {
  const caixa = $("#previa-imagem");
  caixa.hidden = !src;
  if (!src) return;
  caixa.querySelector("img").src = src;
  $("#legenda-imagem").textContent = legenda;
}

function mostrarImagemAtual() {
  const mapa = edicao.mapa;
  mostrarPreviaDaImagem(mapa?.miniatura, mapa ? `Imagem atual · ${mapa.largura} × ${mapa.altura} px` : "");
}

// As mesas do portal; nenhuma marcada quer dizer Draevor
function renderizarEscolhaMesas() {
  const raiz = $("#escolha-mesas");
  if (!estado.mesas.length) {
    raiz.replaceChildren(criar("p", "escolhas__vazio", "Nenhuma mesa cadastrada ainda."));
    return;
  }
  raiz.replaceChildren(
    ...estado.mesas.map((mesa) => {
      const chip = criar("button", "etiqueta-mesa", mesa.nome);
      chip.type = "button";
      chip.style.setProperty("--cor", corVisivel(mesa.cor));
      chip.setAttribute("aria-pressed", String(edicao.mesas.has(mesa.id)));
      chip.addEventListener("click", () => {
        if (edicao.mesas.has(mesa.id)) edicao.mesas.delete(mesa.id);
        else edicao.mesas.add(mesa.id);
        chip.setAttribute("aria-pressed", String(edicao.mesas.has(mesa.id)));
      });
      return chip;
    }),
  );
}

function abrirEdicao(mapa = null) {
  if (!ehAdmin()) return;
  const form = formEdicao();
  form.reset();
  edicao.mapa = mapa;
  edicao.mesas = new Set(mapa?.mesas ?? []);
  edicao.preparo = null;
  mostrarErroDaEdicao("");
  mostrarAndamento("");

  $("#edicao-titulo").textContent = mapa ? `Alterar ${mapa.nome}` : "Novo mapa";
  $("#edicao-enviar").textContent = mapa ? "Salvar" : "Enviar";
  $("#edicao-apagar").hidden = !mapa;
  $("#ajuda-imagem").textContent = mapa
    ? "Escolha outra imagem só para trocar o mapa. Os lugares continuam onde estão."
    : "PNG, JPG ou WEBP, até 25 MB. A miniatura da galeria é feita aqui mesmo, na hora.";

  form.nome.value = mapa?.nome ?? "";
  form.descricao.value = mapa?.descricao ?? "";
  form.visibilidade.value = mapa?.visibilidade ?? "todos";
  renderizarEscolhaMesas();
  mostrarImagemAtual();

  $("#dialogo-edicao").showModal();
  $(".edicao__campos").scrollTop = 0;
  form.nome.focus();
}

// Mede e reduz assim que a imagem é escolhida; se outra for escolhida no meio, vale a última
async function escolherImagem() {
  const form = formEdicao();
  const arquivo = form.imagem.files[0];
  mostrarErroDaEdicao("");
  if (!arquivo) {
    edicao.preparo = null;
    mostrarAndamento("");
    mostrarImagemAtual();
    return;
  }
  const preparo = prepararImagem(arquivo);
  edicao.preparo = preparo;
  mostrarAndamento("Medindo a imagem e fazendo a miniatura…");
  try {
    const pronta = await preparo;
    if (edicao.preparo !== preparo) return;
    mostrarAndamento("");
    const legenda = `${edicao.mapa ? "Nova imagem" : "Imagem"} · ${pronta.largura} × ${pronta.altura} px · ${emMegabytes(arquivo.size)}`;
    mostrarPreviaDaImagem(URL.createObjectURL(pronta.miniatura), legenda);
  } catch (falha) {
    if (edicao.preparo !== preparo) return;
    edicao.preparo = null;
    form.imagem.value = "";
    mostrarAndamento("");
    mostrarImagemAtual();
    mostrarErroDaEdicao(falha.message);
  }
}

async function enviarEdicao(evento) {
  evento.preventDefault();
  const form = formEdicao();
  mostrarErroDaEdicao("");
  const nome = form.nome.value.trim();
  if (!nome) return mostrarErroDaEdicao("Escreva o nome do mapa.");
  if (!edicao.mapa && !edicao.preparo) return mostrarErroDaEdicao("Escolha a imagem do mapa.");

  const enviar = $("#edicao-enviar");
  enviar.disabled = true;
  try {
    let imagem = null;
    if (edicao.preparo) {
      mostrarAndamento("Fazendo a miniatura…");
      imagem = await edicao.preparo;
    }
    const dados = {
      nome,
      mesas: [...edicao.mesas],
      descricao: form.descricao.value.trim(),
      visibilidade: form.visibilidade.value,
      imagem,
    };
    mostrarAndamento(imagem ? `Enviando o mapa (${emMegabytes(imagem.arquivo.size)})…` : "Salvando…");
    const mapa = edicao.mapa;
    if (mapa) await api.alterar(mapa.id, dados);
    else await api.enviar(dados);
    $("#dialogo-edicao").close();
    await recarregar();
    avisoRapido(mapa ? "Mapa salvo." : "Mapa enviado.");
  } catch (falha) {
    mostrarErroDaEdicao(falha.message);
  } finally {
    mostrarAndamento("");
    enviar.disabled = false;
  }
}

async function apagarMapa() {
  const mapa = edicao.mapa;
  if (!mapa) return;
  const quantos = mapa.marcadores.length;
  const lugares = quantos ? ` e ${quantos === 1 ? "o lugar marcado nele" : `os ${quantos} lugares marcados nele`}` : "";
  const confirmado = await perguntar({
    titulo: "Apagar este mapa?",
    texto: `${mapa.nome} sai da página de vez, com a imagem${lugares}.`,
    confirmar: "Apagar",
    cancelar: "Cancelar",
    perigo: true,
  });
  if (!confirmado) return;
  try {
    await api.apagar(mapa.id);
    $("#dialogo-edicao").close();
    await recarregar();
    avisoRapido("Mapa apagado.");
  } catch (falha) {
    avisarFalha(falha);
  }
}

function configurarEdicao() {
  const form = formEdicao();
  form.addEventListener("submit", enviarEdicao);
  form.imagem.addEventListener("change", escolherImagem);
  $("#edicao-cancelar").addEventListener("click", () => $("#dialogo-edicao").close());
  $("#edicao-apagar").addEventListener("click", apagarMapa);
}

/* =================================================================
   Carregar e desenhar tudo
   ================================================================= */

function renderizarTudo() {
  atualizarTopo();
  $("#botao-novo").hidden = !ehAdmin();
  renderizarGaleria();
}

async function recarregar() {
  const dados = await api.mapas();
  Object.assign(estado, { conta: dados.conta, mesas: dados.mesas, mapas: dados.mapas });
  renderizarTudo();
  // Com o visor aberto, o mapa pode ter deixado de existir para esta conta
  if (navegacao.aberto) mostrarRota();
}

/* =================================================================
   Eventos da página
   ================================================================= */

// O cabeçalho fica preso no alto; a barra lateral precisa saber o tamanho dele.
// No celular, a barra vai para o rodapé e o visor termina acima dela.
function medirAlturas() {
  const topo = $("#topo");
  const barra = $(".barra-lateral");
  const aplicar = () => {
    document.documentElement.style.setProperty("--altura-topo", `${topo.offsetHeight}px`);
    document.documentElement.style.setProperty("--altura-barra", `${barra.offsetHeight}px`);
  };
  const observador = new ResizeObserver(aplicar);
  observador.observe(topo);
  observador.observe(barra);
  aplicar();
}

function configurarEventos() {
  $("#botao-novo").addEventListener("click", () => abrirEdicao());
  $("#visor-voltar").addEventListener("click", voltarAGaleria);

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
    $("#galeria").replaceChildren(criar("p", "galeria-vazia", falha.message));
    return;
  }
  $("#pagina").hidden = false;

  atualizarStatus();
  setInterval(atualizarStatus, CONFIG.intervaloStatus);

  // Link direto para um mapa: abre no visor. O Voltar e o Avançar do navegador trocam entre visor e galeria.
  window.addEventListener("popstate", () => mostrarRota());
  window.addEventListener("hashchange", () => mostrarRota());
  mostrarRota();
}

iniciar();
