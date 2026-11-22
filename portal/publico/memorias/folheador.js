/* =================================================================
   Crônicas Eternas: o folheador dos livros em PDF (Memórias)
   -----------------------------------------------------------------
   O Livro das Memórias é um PDF. O folheador mostra o livro aberto,
   com as páginas do miolo do jeito que foram diagramadas (a página 1
   à direita, como num livro), e as folhas viram: clicando, puxando
   a página ou com as setas. Fechado, o livro mostra a capa (a imagem
   enviada, ou o couro com o título); no fim, a contracapa. Na tela
   estreita, uma página por vez.

   À direita da tela, fora do livro, fica o índice: os capítulos que
   o administrador marcou, cada um com a página. Clicar num capítulo
   vira até ele. O administrador edita o índice ali mesmo: escolhe a
   página (o "+ Capítulo" de cada página à vista, ou o número) e
   escreve o nome.

   As páginas são desenhadas pelo pdf.js, a cópia fixa em pdf.min.js
   e pdf.worker.min.js (veja LICENCA-pdfjs.txt), carregada só quando
   um livro abre.

   Declara carregarPdfJs(), OPCOES_DO_PDF, lerInfoDoPdf(arquivo) e
   criarFolheador(opções). Usa do comum.js: criar(), botao(),
   simbolo() e avisoRapido(); e os desenhos folhear-* do index.html.
   ================================================================= */

const FOLHEADOR = {
  duracao: 640, // ms de uma folha virando
  duracaoDoSalto: 460, // ms ao pular para longe (índice, capa, número da página)
  zooms: [1, 1.5, 2, 3],
  desenhosGuardados: 14, // páginas já desenhadas que ficam guardadas
  larguraMinimaDeDuas: 200, // px de cada página: abaixo disso, uma por vez
  perdaAceitaDeDuas: 0.86, // duas páginas, se cada uma ficar com pelo menos 86% do tamanho de uma sozinha
  folga: 14, // px em volta do livro
  arrasteMinimo: 8, // px até um clique virar arrasto
};

// O pdf.js não monta código com new Function (a CSP do portal também não deixa) e, num PDF
// grande, lê só os pedaços das páginas que vai mostrar
const OPCOES_DO_PDF = { isEvalSupported: false, disableAutoFetch: true, disableStream: true };

let pdfJsCarregando = null;

// Carrega o pdf.js na primeira vez que precisa
function carregarPdfJs() {
  if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
  pdfJsCarregando ??= new Promise((resolver, rejeitar) => {
    const script = document.createElement("script");
    script.src = "pdf.min.js";
    script.addEventListener("load", () => {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = "pdf.worker.min.js";
      resolver(window.pdfjsLib);
    });
    script.addEventListener("error", () => {
      pdfJsCarregando = null;
      script.remove();
      rejeitar(new Error("Não foi possível carregar o leitor de PDF. Confira a conexão e tente de novo."));
    });
    document.head.append(script);
  });
  return pdfJsCarregando;
}

// O PDF escolhido no formulário, lido aqui mesmo: quantas páginas ele tem e o tamanho da
// primeira, em pontos. Um arquivo que o pdf.js não abre vira um erro com a mensagem.
async function lerInfoDoPdf(arquivo) {
  const pdfjs = await carregarPdfJs();
  let documento;
  try {
    documento = await pdfjs.getDocument({ ...OPCOES_DO_PDF, data: new Uint8Array(await arquivo.arrayBuffer()) }).promise;
  } catch (erro) {
    if (erro?.name === "PasswordException") throw new Error("Esse PDF pede senha. Mande uma versão sem senha.");
    throw new Error(`O arquivo ${arquivo.name} não é um PDF que dê para ler.`);
  }
  try {
    const { width, height } = (await documento.getPage(1)).getViewport({ scale: 1 });
    const centesimos = (n) => Math.round(n * 100) / 100;
    return { paginas: documento.numPages, largura: centesimos(width), altura: centesimos(height) };
  } finally {
    documento.destroy();
  }
}

const reduzirMovimento = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

// Começa e termina devagar (o virar pelo botão) ou só termina devagar (soltando o arrasto)
const entradaESaida = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const saidaSuave = (t) => 1 - (1 - t) ** 3;

/* =================================================================
   O folheador
   -----------------------------------------------------------------
   opções:
   - titulo: o título do livro (na capa de couro);
   - livro: { miolo: { paginas, largura, altura }, capa, contracapa
     ({ endereco } ou null), indice: [{ pagina, titulo }] };
   - abrirDocumento(): devolve a promessa do documento do pdf.js;
   - pagina: a página inicial (null: a capa);
   - aoMudar(pagina): a página à vista mudou (null na capa e na
     contracapa);
   - indice: { editavel, salvar(indice) }, só para o administrador.
   Devolve { elemento, irPara(pagina), destruir() }.
   ================================================================= */

function criarFolheador({ titulo, livro, abrirDocumento, pagina: paginaInicial = null, aoMudar = () => {}, indice: opcoesDoIndice = {} }) {
  const N = livro.miolo.paginas;
  const proporcao = livro.miolo.largura / livro.miolo.altura;
  const editavel = Boolean(opcoesDoIndice.editavel);

  // As faces do livro, na ordem: a capa, a guarda (o verso da capa), as páginas do miolo (com
  // uma em branco depois da última, se forem ímpares), a guarda de trás e a contracapa.
  // No livro aberto, a folha f tem as faces 2f (frente) e 2f + 1 (verso).
  const faces = [{ tipo: "capa" }, { tipo: "guarda" }];
  for (let n = 1; n <= N; n++) faces.push({ tipo: "pagina", n });
  if (N % 2) faces.push({ tipo: "branco" });
  faces.push({ tipo: "guarda" }, { tipo: "contracapa" });
  const FOLHAS = faces.length / 2;
  const faceDaPagina = (n) => n + 1;
  // Uma página por vez: a capa, as páginas e a contracapa (índices em "faces")
  const sozinhas = [0, ...Array.from({ length: N }, (_, i) => faceDaPagina(i + 1)), faces.length - 1];

  const estado = {
    medido: false,
    duplo: true,
    folha: 0, // no livro aberto: quantas folhas já viraram (0: a capa; FOLHAS: a contracapa)
    sozinha: 0, // uma página por vez: 0 a capa, n a página n, N + 1 a contracapa
    zoom: 0, // a posição em FOLHEADOR.zooms
    largura: 0, // o tamanho de uma página na tela, em px, já com o zoom
    altura: 0,
    movimento: null, // a folha que está virando
    arrasto: null,
    editando: false,
    rascunho: null, // o índice que o administrador está editando
    destruido: false,
  };
  const posicao = () => (estado.duplo ? estado.folha : estado.sozinha);
  const ultimaPosicao = () => (estado.duplo ? FOLHAS : N + 1);

  /* ---------- O que aparece ---------- */

  const raiz = criar("div", "folheador");
  raiz.tabIndex = 0;
  raiz.setAttribute("role", "region");
  raiz.setAttribute("aria-roledescription", "livro");
  raiz.setAttribute("aria-label", titulo);

  const palco = criar("div", "folheador__palco");
  const livroAberto = criar("div", "livro-aberto");
  const ladoEsquerdo = criar("div", "livro-aberto__lado livro-aberto__lado--esquerdo");
  const ladoDireito = criar("div", "livro-aberto__lado livro-aberto__lado--direito");
  const sombra = criar("div", "livro-aberto__sombra");
  const folha = criar("div", "livro-aberto__folha");
  const frente = criar("div", "livro-aberto__face livro-aberto__face--frente");
  const verso = criar("div", "livro-aberto__face livro-aberto__face--verso");
  folha.append(frente, verso);
  folha.hidden = true;
  livroAberto.append(ladoEsquerdo, ladoDireito, sombra, folha);
  const aviso = criar("p", "folheador__aviso");
  aviso.setAttribute("role", "status");
  aviso.hidden = true;
  palco.append(livroAberto, aviso);

  const mostrarAviso = (texto) => {
    aviso.textContent = texto;
    aviso.hidden = !texto;
  };

  /* ---------- As faces ---------- */

  const nos = new Map(); // índice em "faces" → o elemento da face, para voltar a usar
  const pedidos = new WeakMap(); // o elemento de uma página → o último pedido de desenho

  function montarFace(face) {
    if (face.tipo === "capa" || face.tipo === "contracapa") {
      const no = criar("div", `face face--${face.tipo}`);
      const imagem = livro[face.tipo];
      if (imagem) {
        const img = criar("img", "face__imagem");
        img.alt = "";
        img.decoding = "async";
        img.draggable = false;
        img.src = imagem.endereco;
        no.append(img);
      } else {
        no.classList.add("face--couro");
        if (face.tipo === "capa") no.append(criar("span", "face__titulo", titulo));
      }
      return no;
    }
    if (face.tipo === "guarda") return criar("div", "face face--guarda");
    if (face.tipo === "branco") return criar("div", "face face--papel");
    const no = criar("div", `face face--papel face--pagina face--${face.n % 2 ? "impar" : "par"}`);
    no.dataset.pagina = String(face.n);
    const desenho = criar("canvas", "face__desenho");
    desenho.setAttribute("aria-hidden", "true");
    no.append(desenho);
    if (editavel) {
      const marcar = botao(`+ Capítulo aqui`, "botao--pequeno face__marcar", () => marcarCapitulo(face.n));
      marcar.setAttribute("aria-label", `Marcar um capítulo na página ${face.n}`);
      no.append(marcar);
    }
    return no;
  }

  function noDaFace(i) {
    if (i === null || i < 0 || i >= faces.length) return null;
    let no = nos.get(i);
    if (!no) {
      no = montarFace(faces[i]);
      nos.set(i, no);
    }
    return no;
  }

  // Põe a face num lugar (um lado do livro ou uma face da folha que vira), ou deixa o lugar vazio
  function porNoLugar(lugar, i) {
    const no = noDaFace(i);
    if (!no) lugar.replaceChildren();
    else if (lugar.firstElementChild !== no || lugar.childElementCount !== 1) lugar.replaceChildren(no);
    lugar.classList.toggle("livro-aberto__vazio", !no);
    if (no?.dataset.pagina) pintar(no);
  }

  // As faces longe da posição saem da memória
  function podar() {
    const centro = estado.duplo ? 2 * estado.folha : sozinhas[estado.sozinha];
    for (const [i, no] of nos) if (Math.abs(i - centro) > 10 && !no.isConnected) nos.delete(i);
  }

  /* ---------- As páginas do PDF ---------- */

  let documentoAberto = null;
  const documentoPronto = Promise.resolve()
    .then(abrirDocumento)
    .then((documento) => {
      if (estado.destruido) {
        documento.destroy();
        throw new Error("O livro já foi fechado.");
      }
      documentoAberto = documento;
      return documento;
    });
  documentoPronto.catch((erro) => {
    if (!estado.destruido) mostrarAviso(`Não foi possível abrir o PDF do livro. ${erro?.message ?? ""}`.trim());
  });

  const desenhos = new Map(); // página → o canvas com ela desenhada (o mais recente por último)
  const desenhando = new Map(); // "página:largura" → a promessa do desenho

  // A página desenhada com pelo menos essa largura, em pixels
  async function desenhoDaPagina(n, larguraPx) {
    const pronto = desenhos.get(n);
    if (pronto && pronto.width >= larguraPx - 1) {
      desenhos.delete(n);
      desenhos.set(n, pronto);
      return pronto;
    }
    const chave = `${n}:${larguraPx}`;
    if (!desenhando.has(chave)) {
      const promessa = (async () => {
        const documento = await documentoPronto;
        const pagina = await documento.getPage(n);
        const vista = pagina.getViewport({ scale: larguraPx / pagina.getViewport({ scale: 1 }).width });
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(vista.width));
        canvas.height = Math.max(1, Math.round(vista.height));
        const contexto = canvas.getContext("2d", { alpha: false });
        contexto.fillStyle = "#ffffff";
        contexto.fillRect(0, 0, canvas.width, canvas.height);
        await pagina.render({ canvasContext: contexto, viewport: vista }).promise;
        pagina.cleanup();
        return canvas;
      })();
      desenhando.set(chave, promessa);
      promessa
        .then((canvas) => {
          const antigo = desenhos.get(n);
          if (!antigo || antigo.width < canvas.width) {
            desenhos.delete(n);
            desenhos.set(n, canvas);
          }
          while (desenhos.size > FOLHEADOR.desenhosGuardados) desenhos.delete(desenhos.keys().next().value);
        })
        .catch(() => {})
        .finally(() => desenhando.delete(chave));
    }
    return desenhando.get(chave);
  }

  // Pinta a página no canvas da face, no tamanho da tela (a página inteira cabe, centralizada)
  function pintar(no) {
    if (!estado.largura) return;
    const n = Number(no.dataset.pagina);
    const densidade = Math.min(window.devicePixelRatio || 1, 2.5);
    const largura = Math.round(estado.largura * densidade);
    const altura = Math.round(estado.altura * densidade);
    const tamanho = `${largura}x${altura}`;
    if (no.dataset.tamanho === tamanho || no.dataset.pedindo === tamanho) return;
    no.dataset.pedindo = tamanho;
    const pedido = {};
    pedidos.set(no, pedido);
    desenhoDaPagina(n, largura)
      .then((desenho) => {
        if (estado.destruido || pedidos.get(no) !== pedido) return;
        const canvas = no.querySelector(".face__desenho");
        canvas.width = largura;
        canvas.height = altura;
        const contexto = canvas.getContext("2d", { alpha: false });
        contexto.fillStyle = "#fbf8f1";
        contexto.fillRect(0, 0, largura, altura);
        const escala = Math.min(largura / desenho.width, altura / desenho.height);
        const w = desenho.width * escala;
        const h = desenho.height * escala;
        contexto.imageSmoothingQuality = "high";
        contexto.drawImage(desenho, (largura - w) / 2, (altura - h) / 2, w, h);
        no.dataset.tamanho = tamanho;
        no.classList.add("face--pronta");
        no.classList.remove("face--falhou");
      })
      .catch(() => {
        if (estado.destruido || pedidos.get(no) !== pedido) return;
        no.classList.add("face--falhou");
      })
      .finally(() => {
        if (no.dataset.pedindo === tamanho) delete no.dataset.pedindo;
      });
  }

  // As faces de antes e de depois já ficam pintadas, para a folha virar com a página pronta
  function adiantar() {
    const vizinhas = estado.duplo
      ? [2 * estado.folha + 1, 2 * estado.folha + 2, 2 * estado.folha - 3, 2 * estado.folha - 2]
      : [sozinhas[estado.sozinha + 1], sozinhas[estado.sozinha - 1]];
    for (const i of vizinhas) {
      if (i === undefined || i < 0 || i >= faces.length || faces[i].tipo !== "pagina") continue;
      pintar(noDaFace(i));
    }
  }

  /* ---------- O livro parado ---------- */

  // Fechado, o livro fica no meio: na capa, só o lado direito aparece; na contracapa, o esquerdo
  const deslocamentoDe = (folhaVirada) => (!estado.duplo ? 0 : folhaVirada === 0 ? -0.5 : folhaVirada === FOLHAS ? 0.5 : 0);
  const deslocar = (paginas) => livroAberto.style.setProperty("--deslocamento", `${Math.round(paginas * estado.largura)}px`);

  // Os números das páginas do miolo à vista
  function paginasAVista() {
    const indices = estado.duplo ? [2 * estado.folha - 1, 2 * estado.folha] : [sozinhas[estado.sozinha]];
    return indices.map((i) => faces[i]).filter((face) => face?.tipo === "pagina").map((face) => face.n);
  }

  // A página do endereço: a primeira à vista; entre a última página e a contracapa, a última
  function paginaAtual() {
    const visiveis = paginasAVista();
    if (visiveis.length) return visiveis[0];
    return posicao() > 0 && posicao() < ultimaPosicao() ? N : null;
  }

  function mostrarParado() {
    folha.hidden = true;
    raiz.classList.remove("folheador--virando");
    folha.style.removeProperty("transform");
    if (estado.duplo) {
      porNoLugar(ladoEsquerdo, estado.folha > 0 ? 2 * estado.folha - 1 : null);
      porNoLugar(ladoDireito, estado.folha < FOLHAS ? 2 * estado.folha : null);
    } else {
      porNoLugar(ladoEsquerdo, null);
      porNoLugar(ladoDireito, sozinhas[estado.sozinha]);
    }
    deslocar(deslocamentoDe(estado.folha));
    const lidas = estado.duplo ? estado.folha / FOLHAS : estado.sozinha / (N + 1);
    livroAberto.style.setProperty("--lidas", lidas.toFixed(3));
    atualizarBarra();
    marcarCapituloAtual();
    aoMudar(paginaAtual());
    adiantar();
    podar();
  }

  /* ---------- A folha que vira ---------- */

  // Arruma a folha que vai virar de "de" para "para" (posições) e o que fica parado embaixo dela.
  // No livro aberto, pular várias folhas vira uma só, com a página de destino no verso.
  function prepararVirada(de, para) {
    const avancando = para > de;
    if (estado.duplo) {
      porNoLugar(frente, avancando ? 2 * de : 2 * para);
      porNoLugar(verso, avancando ? 2 * para - 1 : 2 * de - 1);
      const esquerda = avancando ? de : para;
      const direita = avancando ? para : de;
      porNoLugar(ladoEsquerdo, esquerda > 0 ? 2 * esquerda - 1 : null);
      porNoLugar(ladoDireito, direita < FOLHAS ? 2 * direita : null);
    } else {
      // Uma página por vez: a página vira para a esquerda (ou volta de lá), com o verso em branco
      porNoLugar(frente, sozinhas[avancando ? de : para]);
      porNoLugar(verso, null);
      porNoLugar(ladoEsquerdo, null);
      porNoLugar(ladoDireito, sozinhas[avancando ? para : de]);
    }
    folha.hidden = false;
    raiz.classList.add("folheador--virando");
    return {
      de,
      para,
      inicio: avancando ? 0 : -180,
      fim: avancando ? -180 : 0,
      deslocamentoDe: deslocamentoDe(de),
      deslocamentoPara: deslocamentoDe(para),
      pedidoDeQuadro: 0,
      cancelado: false,
    };
  }

  // Um quadro da virada: o ângulo da folha (0 deitada à direita, -180 deitada à esquerda), a luz
  // nela, a sombra que ela faz e o livro andando para o meio quando abre ou fecha
  function quadro(movimento, angulo) {
    folha.style.setProperty("transform", `rotateY(${angulo.toFixed(2)}deg)`);
    const progresso = (angulo - movimento.inicio) / (movimento.fim - movimento.inicio);
    deslocar(movimento.deslocamentoDe + (movimento.deslocamentoPara - movimento.deslocamentoDe) * progresso);
    const dobra = Math.sin((Math.abs(angulo) * Math.PI) / 180);
    livroAberto.style.setProperty("--dobra", dobra.toFixed(3));
    livroAberto.classList.toggle("livro-aberto--folha-a-esquerda", angulo < -90);
  }

  function animar(movimento, de, ate, duracao, facilidade) {
    return new Promise((resolver) => {
      if (duracao <= 0 || reduzirMovimento()) {
        quadro(movimento, ate);
        return resolver();
      }
      const inicio = performance.now();
      const passo = (agora) => {
        if (movimento.cancelado) return resolver();
        const t = Math.min(1, (agora - inicio) / duracao);
        quadro(movimento, de + (ate - de) * facilidade(t));
        if (t < 1) movimento.pedidoDeQuadro = requestAnimationFrame(passo);
        else resolver();
      };
      movimento.pedidoDeQuadro = requestAnimationFrame(passo);
    });
  }

  // A folha chegou: a posição nova fica parada
  function concluir(movimento) {
    if (estado.movimento !== movimento) return;
    estado.movimento = null;
    if (estado.duplo) estado.folha = movimento.para;
    else estado.sozinha = movimento.para;
    mostrarParado();
  }

  // A folha volta para onde estava (um arrasto que não passou do meio)
  function desistir(movimento) {
    if (estado.movimento !== movimento) return;
    estado.movimento = null;
    mostrarParado();
  }

  // Termina na hora o que estiver virando (um clique durante a virada passa para a próxima):
  // a folha vai para onde ela ia, ou volta, num arrasto que ainda não foi solto ou não passou do meio
  function terminarMovimento() {
    const movimento = estado.movimento;
    if (!movimento) return;
    movimento.cancelado = true;
    cancelAnimationFrame(movimento.pedidoDeQuadro);
    if (movimento.volta) desistir(movimento);
    else concluir(movimento);
  }

  async function virar(para, { salto = false } = {}) {
    if (estado.destruido || !estado.medido || estado.arrasto?.movimento) return;
    terminarMovimento();
    const de = posicao();
    para = Math.max(0, Math.min(ultimaPosicao(), para));
    if (para === de) return;
    const movimento = prepararVirada(de, para);
    estado.movimento = movimento;
    quadro(movimento, movimento.inicio);
    await animar(movimento, movimento.inicio, movimento.fim, salto ? FOLHEADOR.duracaoDoSalto : FOLHEADOR.duracao, entradaESaida);
    concluir(movimento);
  }

  const avancar = () => virar(posicao() + 1);
  const voltar = () => virar(posicao() - 1);
  const irParaCapa = () => virar(0, { salto: true });
  const irParaContracapa = () => virar(ultimaPosicao(), { salto: true });

  // A posição em que a página aparece (null: a capa)
  function posicaoDaPagina(n) {
    if (!Number.isInteger(n) || n < 1) return 0;
    const certa = Math.min(n, N);
    return estado.duplo ? Math.floor(certa / 2) + 1 : certa;
  }

  function irPara(n) {
    if (!estado.medido) {
      estado.paginaInicial = n;
      return;
    }
    if (paginasAVista().includes(n)) return;
    const alvo = posicaoDaPagina(n);
    virar(alvo, { salto: Math.abs(alvo - posicao()) > 1 });
  }

  /* ---------- Arrastar a página, ou passear pelo livro ampliado ---------- */

  const ampliado = () => FOLHEADOR.zooms[estado.zoom] > 1;

  function comecarArrasto(evento) {
    if (evento.button !== 0 || !estado.medido || evento.target.closest("button, a, input")) return;
    if (ampliado()) {
      estado.arrasto = { passeio: true, id: evento.pointerId, x0: evento.clientX, y0: evento.clientY, rolagemX: palco.scrollLeft, rolagemY: palco.scrollTop };
    } else {
      terminarMovimento();
      const caixa = livroAberto.getBoundingClientRect();
      const x = evento.clientX - caixa.left;
      // No livro aberto, cada metade vira para o seu lado; uma página por vez, o terço da esquerda volta
      const direcao = estado.duplo ? (x >= caixa.width / 2 ? 1 : -1) : x >= caixa.width / 3 ? 1 : -1;
      estado.arrasto = { id: evento.pointerId, x0: evento.clientX, y0: evento.clientY, direcao, movimento: null, angulo: null, velocidade: 0, ultimoX: evento.clientX, ultimoT: performance.now() };
    }
    livroAberto.setPointerCapture?.(evento.pointerId);
  }

  function moverArrasto(evento) {
    const arrasto = estado.arrasto;
    if (!arrasto || evento.pointerId !== arrasto.id) return;
    const dx = evento.clientX - arrasto.x0;
    if (arrasto.passeio) {
      palco.scrollLeft = arrasto.rolagemX - dx;
      palco.scrollTop = arrasto.rolagemY - (evento.clientY - arrasto.y0);
      return;
    }
    if (!arrasto.movimento) {
      if (Math.abs(dx) < FOLHEADOR.arrasteMinimo || Math.sign(dx) === arrasto.direcao) return;
      const para = posicao() + arrasto.direcao;
      if (para < 0 || para > ultimaPosicao()) return;
      arrasto.movimento = prepararVirada(posicao(), para);
      arrasto.movimento.volta = true; // enquanto o dedo segura, interromper devolve a folha
      estado.movimento = arrasto.movimento;
    }
    // A borda solta da folha segue o dedo; o ângulo sai de onde ela está em relação à lombada
    const largura = estado.largura;
    const borda = (arrasto.direcao > 0 ? largura : -largura) + dx;
    arrasto.angulo = -(Math.acos(Math.max(-1, Math.min(1, borda / largura))) * 180) / Math.PI;
    const agora = performance.now();
    if (agora > arrasto.ultimoT) {
      arrasto.velocidade = (evento.clientX - arrasto.ultimoX) / (agora - arrasto.ultimoT);
      arrasto.ultimoX = evento.clientX;
      arrasto.ultimoT = agora;
    }
    quadro(arrasto.movimento, arrasto.angulo);
  }

  async function soltarArrasto(evento) {
    const arrasto = estado.arrasto;
    if (!arrasto || evento.pointerId !== arrasto.id) return;
    estado.arrasto = null;
    if (arrasto.passeio) return;
    const movimento = arrasto.movimento;
    if (!movimento) {
      // Um clique: vira para o lado clicado
      const parado = Math.abs(evento.clientX - arrasto.x0) < FOLHEADOR.arrasteMinimo && Math.abs(evento.clientY - arrasto.y0) < FOLHEADOR.arrasteMinimo;
      if (parado && evento.type === "pointerup") virar(posicao() + arrasto.direcao);
      return;
    }
    // Passou do meio, foi puxada depressa ou para longe (um terço da página): termina de virar.
    // Senão, volta.
    const angulo = arrasto.angulo ?? movimento.inicio;
    const puxado = (evento.clientX - arrasto.x0) * -arrasto.direcao;
    const depressa = arrasto.velocidade * -arrasto.direcao > 0.35;
    const passou = arrasto.direcao > 0 ? angulo < -90 : angulo > -90;
    const completa = evento.type === "pointerup" && (passou || depressa || puxado > estado.largura / 3);
    const alvo = completa ? movimento.fim : movimento.inicio;
    movimento.volta = !completa;
    await animar(movimento, angulo, alvo, 120 + (FOLHEADOR.duracao * Math.abs(alvo - angulo)) / 180, saidaSuave);
    if (completa) concluir(movimento);
    else desistir(movimento);
  }

  livroAberto.addEventListener("pointerdown", comecarArrasto);
  livroAberto.addEventListener("pointermove", moverArrasto);
  livroAberto.addEventListener("pointerup", soltarArrasto);
  livroAberto.addEventListener("pointercancel", soltarArrasto);
  livroAberto.addEventListener("dragstart", (evento) => evento.preventDefault());

  /* ---------- A barra do folheador ---------- */

  function botaoDeIcone(desenho, rotulo, acao, classe = "") {
    const elemento = botao("", `botao--leve folheador__botao ${classe}`.trim(), acao);
    elemento.append(simbolo(desenho));
    elemento.setAttribute("aria-label", rotulo);
    elemento.title = rotulo;
    return elemento;
  }

  const barra = criar("div", "folheador__barra");
  const navegar = criar("div", "folheador__navegar");
  const botaoCapa = botaoDeIcone("folhear-inicio", "Capa", irParaCapa);
  const botaoVoltar = botaoDeIcone("folhear-voltar", "Página anterior", voltar);
  const botaoAvancar = botaoDeIcone("folhear-avancar", "Próxima página", avancar);
  const botaoFim = botaoDeIcone("folhear-fim", "Contracapa", irParaContracapa);
  const campoPagina = criar("input", "folheador__pagina");
  campoPagina.type = "number";
  campoPagina.min = "1";
  campoPagina.max = String(N);
  campoPagina.inputMode = "numeric";
  campoPagina.placeholder = "–";
  campoPagina.setAttribute("aria-label", "Ir para a página");
  campoPagina.addEventListener("change", () => {
    const n = Math.round(Number(campoPagina.value));
    if (n >= 1) irPara(Math.min(n, N));
  });
  campoPagina.addEventListener("keydown", (evento) => {
    if (evento.key === "Enter") campoPagina.blur();
  });
  const rotuloPagina = criar("label", "folheador__rotulo");
  rotuloPagina.append("Página", campoPagina, `de ${N}`);
  navegar.append(botaoCapa, botaoVoltar, rotuloPagina, botaoAvancar, botaoFim);

  const ferramentas = criar("div", "folheador__ferramentas");
  const botaoMenos = botaoDeIcone("folhear-menos", "Diminuir", () => ampliar(-1));
  const botaoMais = botaoDeIcone("folhear-mais", "Aumentar", () => ampliar(1));
  const botaoTela = botaoDeIcone("folhear-tela-cheia", "Tela cheia", alternarTelaCheia);
  botaoTela.hidden = !raiz.requestFullscreen;
  const botaoIndice = botao("Índice", "botao--leve botao--pequeno folheador__abrir-indice", () => abrirIndice(true));
  ferramentas.append(botaoMenos, botaoMais, botaoTela, botaoIndice);

  const anuncio = criar("span", "folheador__anuncio");
  anuncio.setAttribute("aria-live", "polite");
  barra.append(navegar, ferramentas, anuncio);

  function atualizarBarra() {
    const visiveis = paginasAVista();
    const n = paginaAtual();
    campoPagina.value = n === null ? "" : String(n);
    botaoCapa.disabled = botaoVoltar.disabled = posicao() === 0;
    botaoAvancar.disabled = botaoFim.disabled = posicao() === ultimaPosicao();
    botaoMenos.disabled = estado.zoom === 0;
    botaoMais.disabled = estado.zoom === FOLHEADOR.zooms.length - 1;
    let texto;
    if (posicao() === 0) texto = "Capa";
    else if (posicao() === ultimaPosicao()) texto = "Contracapa";
    else if (visiveis.length === 2) texto = `Páginas ${visiveis[0]} e ${visiveis[1]} de ${N}`;
    else if (visiveis.length === 1) texto = `Página ${visiveis[0]} de ${N}`;
    else texto = "Fim do livro";
    anuncio.textContent = texto;
  }

  /* ---------- Tamanho, zoom e tela cheia ---------- */

  // O maior livro que cabe no palco. Duas páginas quando cada uma fica quase do tamanho que teria
  // sozinha (a altura é que manda, numa tela deitada); senão, uma por vez (celular, tela em pé, PDF
  // de página deitada).
  function medir() {
    const larguraUtil = Math.max(0, palco.clientWidth - 2 * FOLHEADOR.folga);
    const alturaUtil = Math.max(0, palco.clientHeight - 2 * FOLHEADOR.folga);
    const alturaDeDuas = Math.min(alturaUtil, larguraUtil / (2 * proporcao));
    const alturaSozinha = Math.min(alturaUtil, larguraUtil / proporcao);
    const duplo = alturaDeDuas >= FOLHEADOR.perdaAceitaDeDuas * alturaSozinha && alturaDeDuas * proporcao >= FOLHEADOR.larguraMinimaDeDuas;
    const altura = duplo ? alturaDeDuas : alturaSozinha;
    const zoom = FOLHEADOR.zooms[estado.zoom];
    return { duplo, largura: Math.floor(altura * proporcao * zoom), altura: Math.floor(altura * zoom) };
  }

  function aplicarMedidas() {
    if (estado.destruido) return;
    const { duplo, largura, altura } = medir();
    if (largura < 20 || altura < 20) return;
    const primeiraVez = !estado.medido;
    if (!primeiraVez && duplo === estado.duplo && largura === estado.largura && altura === estado.altura) return;
    terminarMovimento();
    if (estado.arrasto) estado.arrasto = null;
    if (primeiraVez || duplo !== estado.duplo) {
      // A mesma página continua à vista (na primeira vez, a página pedida)
      const naContracapa = !primeiraVez && posicao() === ultimaPosicao();
      const n = primeiraVez ? estado.paginaInicial : paginaAtual();
      estado.duplo = duplo;
      if (naContracapa) {
        estado.folha = FOLHAS;
        estado.sozinha = N + 1;
      } else {
        estado.folha = Number.isInteger(n) && n >= 1 ? Math.floor(Math.min(n, N) / 2) + 1 : 0;
        estado.sozinha = Number.isInteger(n) && n >= 1 ? Math.min(n, N) : 0;
      }
    }
    estado.medido = true;
    estado.largura = largura;
    estado.altura = altura;
    raiz.classList.toggle("folheador--duplo", duplo);
    raiz.classList.toggle("folheador--sozinha", !duplo);
    raiz.classList.toggle("folheador--ampliado", ampliado());
    livroAberto.style.setProperty("--largura-pagina", `${largura}px`);
    livroAberto.style.setProperty("--altura-pagina", `${altura}px`);
    mostrarParado();
  }

  function ampliar(passo) {
    const novo = Math.max(0, Math.min(FOLHEADOR.zooms.length - 1, estado.zoom + passo));
    if (novo === estado.zoom) return;
    // O meio do que está à vista continua no meio
    const meioX = (palco.scrollLeft + palco.clientWidth / 2) / Math.max(1, palco.scrollWidth);
    const meioY = (palco.scrollTop + palco.clientHeight / 2) / Math.max(1, palco.scrollHeight);
    estado.zoom = novo;
    aplicarMedidas();
    palco.scrollLeft = meioX * palco.scrollWidth - palco.clientWidth / 2;
    palco.scrollTop = meioY * palco.scrollHeight - palco.clientHeight / 2;
  }

  function alternarTelaCheia() {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else raiz.requestFullscreen?.().catch(() => avisoRapido("O navegador não deixou abrir em tela cheia."));
  }

  function aoMudarTelaCheia() {
    const cheia = document.fullscreenElement === raiz;
    raiz.classList.toggle("folheador--tela-cheia", cheia);
    const rotulo = cheia ? "Sair da tela cheia" : "Tela cheia";
    botaoTela.setAttribute("aria-label", rotulo);
    botaoTela.title = rotulo;
  }
  document.addEventListener("fullscreenchange", aoMudarTelaCheia);

  let quadroDasMedidas = 0;
  const observador = new ResizeObserver(() => {
    cancelAnimationFrame(quadroDasMedidas);
    quadroDasMedidas = requestAnimationFrame(aplicarMedidas);
  });
  observador.observe(palco);

  /* ---------- O teclado ---------- */

  raiz.addEventListener("keydown", (evento) => {
    // Editando o índice, o Esc não fecha o livro (para nada se perder sem querer)
    if (evento.key === "Escape" && estado.editando) return evento.preventDefault();
    if (evento.target.closest("input, textarea, select") || evento.altKey || evento.ctrlKey || evento.metaKey) return;
    const acoes = {
      ArrowRight: avancar,
      PageDown: avancar,
      ArrowLeft: voltar,
      PageUp: voltar,
      Home: irParaCapa,
      End: irParaContracapa,
    };
    const acao = acoes[evento.key];
    if (!acao) return;
    evento.preventDefault();
    acao();
  });

  /* =================================================================
     O índice, preso à direita da tela
     ================================================================= */

  const painel = criar("aside", "indice-livro");
  painel.setAttribute("aria-label", "Índice do livro");
  const cabecaDoIndice = criar("div", "indice-livro__cabeca");
  const botaoEditar = botao("Editar", "botao--leve botao--pequeno indice-livro__editar", entrarNaEdicao);
  botaoEditar.hidden = !editavel;
  const botaoFechar = botao("", "botao--leve indice-livro__fechar", () => abrirIndice(false));
  botaoFechar.append(simbolo("folhear-fechar"));
  botaoFechar.setAttribute("aria-label", "Fechar o índice");
  cabecaDoIndice.append(criar("h2", "indice-livro__titulo", "Índice"), botaoEditar, botaoFechar);
  const listaDoIndice = criar("ol", "indice-livro__lista");
  const indiceVazio = criar("p", "indice-livro__vazio");
  const edicao = criar("div", "indice-livro__edicao");
  edicao.hidden = true;
  painel.append(cabecaDoIndice, listaDoIndice, indiceVazio, edicao);

  raiz.append(palco, barra, painel);

  // No celular, o índice abre por cima do livro, pelo botão da barra
  function abrirIndice(aberto) {
    raiz.classList.toggle("folheador--indice-aberto", aberto);
    if (aberto) (painel.querySelector("[aria-current], .indice-livro__capitulo, input, button") ?? painel).focus?.();
    else botaoIndice.focus();
  }

  function desenharIndice() {
    listaDoIndice.replaceChildren(
      ...livro.indice.map((capitulo, i) => {
        const item = criar("li");
        const link = criar("button", "indice-livro__capitulo");
        link.type = "button";
        link.dataset.i = String(i);
        link.append(criar("span", "indice-livro__nome", capitulo.titulo), criar("span", "indice-livro__numero", String(capitulo.pagina)));
        link.setAttribute("aria-label", `${capitulo.titulo}, página ${capitulo.pagina}`);
        link.addEventListener("click", () => {
          if (raiz.classList.contains("folheador--indice-aberto")) abrirIndice(false);
          irPara(capitulo.pagina);
        });
        item.append(link);
        return item;
      }),
    );
    indiceVazio.textContent = editavel ? "Ainda sem capítulos. Use o Editar para marcar as páginas." : "Este livro não tem índice.";
    indiceVazio.hidden = livro.indice.length > 0;
    marcarCapituloAtual();
  }

  // O capítulo em que se está: o último que começa até a última página à vista
  function marcarCapituloAtual() {
    if (estado.editando) return;
    const visiveis = paginasAVista();
    const ate = visiveis.length ? Math.max(...visiveis) : posicao() === 0 ? 0 : N;
    let atual = -1;
    livro.indice.forEach((capitulo, i) => {
      if (capitulo.pagina <= ate) atual = i;
    });
    for (const link of listaDoIndice.querySelectorAll(".indice-livro__capitulo")) {
      if (Number(link.dataset.i) === atual) link.setAttribute("aria-current", "true");
      else link.removeAttribute("aria-current");
    }
  }

  /* ---------- Editar o índice (só o administrador) ---------- */

  const erroDaEdicao = criar("p", "mensagem-erro indice-livro__erro");
  erroDaEdicao.setAttribute("role", "alert");

  function mostrarErroDaEdicao(texto) {
    erroDaEdicao.textContent = texto;
    erroDaEdicao.hidden = !texto;
  }

  function entrarNaEdicao() {
    estado.editando = true;
    estado.rascunho = livro.indice.map((capitulo) => ({ ...capitulo }));
    raiz.classList.add("folheador--editando");
    botaoEditar.hidden = true;
    listaDoIndice.hidden = true;
    indiceVazio.hidden = true;
    edicao.hidden = false;
    desenharEdicao();
    edicao.querySelector("input")?.focus();
  }

  function sairDaEdicao() {
    estado.editando = false;
    estado.rascunho = null;
    raiz.classList.remove("folheador--editando");
    botaoEditar.hidden = !editavel;
    listaDoIndice.hidden = false;
    edicao.hidden = true;
    desenharIndice();
    botaoEditar.focus();
  }

  function linhaDaEdicao(capitulo, i) {
    const linha = criar("li", "indice-livro__linha");
    const campoDaPagina = criar("input", "indice-livro__campo-pagina");
    campoDaPagina.type = "number";
    campoDaPagina.min = "1";
    campoDaPagina.max = String(N);
    campoDaPagina.inputMode = "numeric";
    campoDaPagina.value = String(capitulo.pagina);
    campoDaPagina.setAttribute("aria-label", `Página do capítulo ${i + 1}`);
    campoDaPagina.addEventListener("input", () => {
      capitulo.pagina = Math.round(Number(campoDaPagina.value));
    });
    const campoDoNome = criar("input", "indice-livro__campo-nome");
    campoDoNome.maxLength = 120;
    campoDoNome.autocomplete = "off";
    campoDoNome.placeholder = "Nome do capítulo";
    campoDoNome.value = capitulo.titulo;
    campoDoNome.setAttribute("aria-label", `Nome do capítulo ${i + 1}`);
    campoDoNome.addEventListener("input", () => {
      capitulo.titulo = campoDoNome.value;
    });
    const ir = botao("Ir", "botao--leve botao--pequeno", () => {
      if (capitulo.pagina >= 1 && capitulo.pagina <= N) irPara(capitulo.pagina);
    });
    ir.setAttribute("aria-label", `Ir para a página do capítulo ${i + 1}`);
    const tirar = botao("", "botao--leve botao--pequeno indice-livro__tirar", () => {
      estado.rascunho.splice(i, 1);
      desenharEdicao();
      (edicao.querySelectorAll(".indice-livro__campo-nome")[Math.min(i, estado.rascunho.length - 1)] ?? edicao.querySelector("button"))?.focus();
    });
    tirar.append(simbolo("folhear-fechar"));
    tirar.setAttribute("aria-label", `Tirar o capítulo ${i + 1}`);
    tirar.title = "Tirar";
    const pagina = criar("label", "indice-livro__rotulo-pagina");
    pagina.append("p.", campoDaPagina);
    linha.append(pagina, campoDoNome, ir, tirar);
    return linha;
  }

  function desenharEdicao() {
    const linhas = criar("ol", "indice-livro__linhas");
    linhas.append(...estado.rascunho.map(linhaDaEdicao));
    const ajuda = criar(
      "p",
      "indice-livro__ajuda",
      'Vire até a página e use o "+ Capítulo aqui" nela, ou escreva o número da página. Depois, o nome do capítulo.',
    );
    const mais = botao("+ Capítulo nesta página", "botao--leve botao--pequeno indice-livro__mais", () => marcarCapitulo(paginaAtual() ?? 1));
    const cancelar = botao("Cancelar", "botao--leve", sairDaEdicao);
    const salvar = botao("Salvar índice", "botao--principal indice-livro__salvar", salvarEdicao);
    const acoes = criar("div", "indice-livro__acoes");
    acoes.append(cancelar, salvar);
    mostrarErroDaEdicao("");
    edicao.replaceChildren(ajuda, linhas, mais, erroDaEdicao, acoes);
  }

  // Um capítulo novo no índice que está sendo editado, na página escolhida; o nome em seguida
  function marcarCapitulo(n) {
    if (!estado.editando) entrarNaEdicao();
    estado.rascunho.push({ pagina: n, titulo: "" });
    desenharEdicao();
    if (window.matchMedia?.("(max-width: 900px)").matches) raiz.classList.add("folheador--indice-aberto");
    const nomes = edicao.querySelectorAll(".indice-livro__campo-nome");
    nomes[nomes.length - 1]?.focus();
  }

  async function salvarEdicao() {
    const capitulos = estado.rascunho.map((capitulo) => ({ pagina: capitulo.pagina, titulo: capitulo.titulo.trim() }));
    const errado = capitulos.findIndex((c) => !Number.isInteger(c.pagina) || c.pagina < 1 || c.pagina > N);
    if (errado >= 0) {
      mostrarErroDaEdicao(`A página do capítulo ${errado + 1} precisa ser de 1 a ${N}.`);
      return edicao.querySelectorAll(".indice-livro__campo-pagina")[errado]?.focus();
    }
    const semNome = capitulos.findIndex((c) => !c.titulo);
    if (semNome >= 0) {
      mostrarErroDaEdicao(`Escreva o nome do capítulo da página ${capitulos[semNome].pagina}.`);
      return edicao.querySelectorAll(".indice-livro__campo-nome")[semNome]?.focus();
    }
    // Em ordem de página; os da mesma página, na ordem em que estão
    const ordenados = capitulos.map((c, i) => ({ ...c, i })).sort((a, b) => a.pagina - b.pagina || a.i - b.i).map((c) => ({ pagina: c.pagina, titulo: c.titulo }));
    const salvar = edicao.querySelector(".indice-livro__salvar");
    salvar.disabled = true;
    mostrarErroDaEdicao("");
    try {
      const salvo = await opcoesDoIndice.salvar(ordenados);
      livro.indice = salvo ?? ordenados;
      sairDaEdicao();
      avisoRapido("Índice salvo.");
    } catch (falha) {
      mostrarErroDaEdicao(falha.message);
    } finally {
      salvar.disabled = false;
    }
  }

  desenharIndice();
  estado.paginaInicial = paginaInicial;

  return {
    elemento: raiz,
    irPara,
    destruir() {
      estado.destruido = true;
      if (estado.movimento) {
        estado.movimento.cancelado = true;
        cancelAnimationFrame(estado.movimento.pedidoDeQuadro);
      }
      cancelAnimationFrame(quadroDasMedidas);
      observador.disconnect();
      document.removeEventListener("fullscreenchange", aoMudarTelaCheia);
      if (document.fullscreenElement === raiz) document.exitFullscreen?.();
      if (documentoAberto) documentoAberto.destroy();
      desenhos.clear();
      nos.clear();
    },
  };
}
