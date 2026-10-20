/* =================================================================
   Crônicas Eternas: o visor dos mapas
   -----------------------------------------------------------------
   Só cuida de zoom e arraste. Duas camadas do tamanho da imagem,
   a da imagem e, por cima, a dos lugares, andam juntas com
   translate(...) scale(...). A camada dos lugares recebe a escala
   atual em --escala (e aoMudar é chamada a cada mudança), para os
   anéis e as áreas clicáveis manterem o tamanho na tela.

   A vista é a escala e o ponto da imagem (cx, cy, em pixels da
   imagem) que fica no centro do espaço livre. Esse centro nunca sai
   de cima do mapa: assim o mapa nunca some inteiro da tela, e
   qualquer ponto dele pode ser centralizado.

   O espaço livre é a janela menos o que a página diz que cobre o
   mapa (espacoOcupado: o painel dos lugares, por exemplo). "Ver o
   mapa inteiro" centraliza nele. Quando o que cobre muda, a página
   chama ajustar().

   Carregado antes do mapas.js. Só cria AJUSTES_DO_VISOR e
   criarVisor().
   ================================================================= */

const AJUSTES_DO_VISOR = {
  folga: 24, // px em volta do mapa inteiro, no zoom mínimo
  zoomMaximo: 2, // 2 vezes o tamanho real da imagem
  passoDoBotao: 1.6, // quanto + e − aproximam ou afastam
  passoDaSeta: 120, // px na tela a cada seta
  duracao: 260, // ms das animações dos botões e das teclas
  limiarDoArraste: 5, // px até o arraste começar; antes disso, é um clique
  descanso: 200, // ms parado até o navegador redesenhar a imagem nítida
};

function criarVisor({ janela, imagem, lugares, botoes = {}, espacoOcupado = () => ({}), aoMudar = () => {} }) {
  const camadas = [imagem, lugares];
  const movimentoReduzido = window.matchMedia("(prefers-reduced-motion: reduce)");
  const limitar = (valor, minimo, maximo) => Math.min(maximo, Math.max(minimo, valor));

  let aberto = false;
  let mapa = { largura: 1, altura: 1 };
  let vista = { escala: 1, cx: 0, cy: 0 };
  let inteiro = true; // a vista ainda é o mapa inteiro: se a janela mudar de tamanho, refaz o encaixe
  let animacao = null; // { quadro, alvo }
  let carga = 0; // conta as aberturas, para uma imagem atrasada não valer sobre a seguinte
  let timerDescanso;

  /* ---------- O espaço livre e os limites ---------- */

  function espacoLivre() {
    const ocupado = espacoOcupado() || {};
    const esquerda = ocupado.esquerda || 0;
    const topo = ocupado.topo || 0;
    const largura = Math.max(1, janela.clientWidth - esquerda - (ocupado.direita || 0));
    const altura = Math.max(1, janela.clientHeight - topo - (ocupado.baixo || 0));
    return { largura, altura, centroX: esquerda + largura / 2, centroY: topo + altura / 2 };
  }

  // O mapa inteiro cabe no espaço livre, com uma folga em volta
  function escalaMinima(livre) {
    const folga = Math.min(AJUSTES_DO_VISOR.folga, livre.largura / 4, livre.altura / 4);
    return Math.min((livre.largura - 2 * folga) / mapa.largura, (livre.altura - 2 * folga) / mapa.altura);
  }

  // Uma imagem pequena pode já caber maior que o máximo: então ela não aproxima mais
  const escalaMaxima = (livre) => Math.max(AJUSTES_DO_VISOR.zoomMaximo, escalaMinima(livre));

  function conferir(proposta, livre = espacoLivre()) {
    return {
      escala: limitar(proposta.escala, escalaMinima(livre), escalaMaxima(livre)),
      cx: limitar(proposta.cx, 0, mapa.largura),
      cy: limitar(proposta.cy, 0, mapa.altura),
    };
  }

  /* ---------- Mover as camadas ---------- */

  // Enquanto mexe, a imagem fica numa camada própria, que anda rápido.
  // Parada, a camada sai e o navegador redesenha a imagem nítida na escala nova.
  function marcarMovimento() {
    janela.classList.add("visor--movendo");
    clearTimeout(timerDescanso);
    timerDescanso = setTimeout(() => janela.classList.remove("visor--movendo"), AJUSTES_DO_VISOR.descanso);
  }

  function atualizarBotoes(livre) {
    const quase = 1.001;
    botoes.aproximar?.setAttribute("aria-disabled", String(vista.escala * quase >= escalaMaxima(livre)));
    botoes.afastar?.setAttribute("aria-disabled", String(vista.escala <= escalaMinima(livre) * quase));
  }

  function aplicar(proposta) {
    const livre = espacoLivre();
    vista = conferir(proposta, livre);
    const x = livre.centroX - vista.cx * vista.escala;
    const y = livre.centroY - vista.cy * vista.escala;
    const transformacao = `translate(${x}px, ${y}px) scale(${vista.escala})`;
    for (const camada of camadas) camada.style.setProperty("transform", transformacao);
    lugares.style.setProperty("--escala", String(vista.escala));
    marcarMovimento();
    atualizarBotoes(livre);
    aoMudar({ escala: vista.escala });
  }

  function pararAnimacao() {
    if (animacao) cancelAnimationFrame(animacao.quadro);
    animacao = null;
  }

  // Desliza até a vista pedida: a escala muda em proporção, o centro em linha reta
  function irPara(destino, { animar = true } = {}) {
    pararAnimacao();
    const alvo = conferir(destino);
    if (!animar || movimentoReduzido.matches) return aplicar(alvo);
    const inicio = { ...vista };
    const comeco = performance.now();
    const passo = (agora) => {
      const t = Math.min(1, (agora - comeco) / AJUSTES_DO_VISOR.duracao);
      const suave = 1 - (1 - t) ** 3;
      aplicar({
        escala: inicio.escala * (alvo.escala / inicio.escala) ** suave,
        cx: inicio.cx + (alvo.cx - inicio.cx) * suave,
        cy: inicio.cy + (alvo.cy - inicio.cy) * suave,
      });
      animacao = t < 1 ? { quadro: requestAnimationFrame(passo), alvo } : null;
    };
    animacao = { quadro: requestAnimationFrame(passo), alvo };
  }

  // Teclas repetidas somam ao destino da animação em curso
  const vistaDeBase = () => animacao?.alvo ?? vista;

  // Aproxima (fator > 1) ou afasta. Com um ponto da janela, o lugar do mapa embaixo dele fica parado.
  function vistaComZoom(base, fator, ponto) {
    const livre = espacoLivre();
    const escala = limitar(base.escala * fator, escalaMinima(livre), escalaMaxima(livre));
    if (!ponto) return { ...base, escala };
    const dx = ponto.x - livre.centroX;
    const dy = ponto.y - livre.centroY;
    return { escala, cx: base.cx + dx / base.escala - dx / escala, cy: base.cy + dy / base.escala - dy / escala };
  }

  function pontoNaJanela(evento) {
    const caixa = janela.getBoundingClientRect();
    return { x: evento.clientX - caixa.left, y: evento.clientY - caixa.top };
  }

  /* ---------- O que a página usa ---------- */

  function verInteiro({ animar = true } = {}) {
    if (!aberto) return;
    irPara({ escala: escalaMinima(espacoLivre()), cx: mapa.largura / 2, cy: mapa.altura / 2 }, { animar });
    inteiro = true;
  }

  function aproximar(fator, { animar = true } = {}) {
    if (!aberto) return;
    inteiro = false;
    irPara(vistaComZoom(vistaDeBase(), fator), { animar });
  }

  // dx e dy em pixels da tela
  function mover(dx, dy, { animar = true } = {}) {
    if (!aberto) return;
    const base = vistaDeBase();
    inteiro = false;
    irPara({ ...base, cx: base.cx + dx / base.escala, cy: base.cy + dy / base.escala }, { animar });
  }

  // Leva o ponto (x e y de 0 a 1, em proporção da imagem) ao centro do espaço livre
  function centralizar(x, y, { escala = vistaDeBase().escala, animar = true } = {}) {
    if (!aberto) return;
    inteiro = false;
    irPara({ escala, cx: x * mapa.largura, cy: y * mapa.altura }, { animar });
  }

  // A janela, ou o que cobre o mapa, mudou de tamanho
  function ajustar() {
    if (!aberto || !janela.clientWidth || !janela.clientHeight) return;
    if (inteiro) verInteiro({ animar: false });
    else if (!animacao) aplicar(vista);
  }

  // Resolve quando a imagem estiver pronta para aparecer. Devolve false se outro mapa
  // foi aberto (ou o visor fechado) no meio do caminho.
  async function abrir({ imagem: endereco, largura, altura }) {
    const esta = ++carga;
    pararAnimacao();
    aberto = true;
    mapa = { largura, altura };
    for (const camada of camadas) {
      camada.style.setProperty("width", `${largura}px`);
      camada.style.setProperty("height", `${altura}px`);
    }
    janela.classList.add("visor--carregando");
    imagem.src = endereco;
    verInteiro({ animar: false });
    try {
      await imagem.decode();
    } catch {
      if (esta !== carga) return false;
      throw new Error("Não foi possível abrir a imagem do mapa. Recarregue a página.");
    }
    if (esta !== carga) return false;
    janela.classList.remove("visor--carregando");
    return true;
  }

  function fechar() {
    carga++;
    aberto = false;
    pararAnimacao();
    toques.clear();
    gesto = null;
    janela.classList.remove("visor--arrastando");
    imagem.removeAttribute("src"); // solta a imagem grande da memória
  }

  /* ---------- A roda do mouse e a pinça do touchpad ---------- */

  // A pinça do touchpad chega como roda com Ctrl, em passos pequenos; no app, o Ctrl + roda
  // daria zoom na janela inteira. Sobre o mapa, os dois viram zoom do mapa.
  function aoRolar(evento) {
    evento.preventDefault();
    if (!aberto) return;
    const unidade = evento.deltaMode === 1 ? 16 : evento.deltaMode === 2 ? janela.clientHeight : 1;
    const delta = evento.deltaY * unidade;
    if (!delta) return;
    const fator = evento.ctrlKey ? Math.exp(-limitar(delta, -50, 50) * 0.01) : Math.exp(-limitar(delta, -250, 250) * 0.002);
    pararAnimacao();
    inteiro = false;
    aplicar(vistaComZoom(vista, fator, pontoNaJanela(evento)));
  }

  /* ---------- Arraste e pinça com os dedos (pointer events) ---------- */

  const toques = new Map(); // os dedos (ou o mouse) apertados sobre o mapa, por pointerId
  let gesto = null; // { tipo: "arraste" ou "pinca", ultimo, andou }
  let engolirClique = false;

  // Recomeça o gesto com os dedos que estão na tela: um arrasta, dois fazem pinça
  function comecarGesto() {
    const pontos = [...toques.values()];
    const andou = gesto?.andou ?? false;
    if (!pontos.length) gesto = null;
    else if (pontos.length === 1) gesto = { tipo: "arraste", inicio: pontos[0], ultimo: pontos[0], andou };
    else {
      const [a, b] = pontos;
      gesto = { tipo: "pinca", ultimo: medirPinca(a, b), andou: true };
      capturar();
    }
    janela.classList.toggle("visor--arrastando", Boolean(gesto?.andou));
  }

  const medirPinca = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, distancia: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)) });

  // Só depois que o arraste começa: um clique simples continua indo para o que está embaixo
  function capturar() {
    for (const id of toques.keys()) {
      try {
        janela.setPointerCapture(id);
      } catch {
        // o dedo já saiu
      }
    }
  }

  function aoApertar(evento) {
    if (!aberto || (evento.pointerType === "mouse" && evento.button !== 0)) return;
    pararAnimacao();
    toques.set(evento.pointerId, pontoNaJanela(evento));
    comecarGesto();
  }

  function aoArrastar(evento) {
    if (!toques.has(evento.pointerId)) return;
    // O botão foi solto fora da janela, antes de o arraste começar
    if (evento.pointerType === "mouse" && !evento.buttons) return aoSoltar(evento);
    toques.set(evento.pointerId, pontoNaJanela(evento));
    if (!gesto) return;

    if (gesto.tipo === "arraste") {
      const ponto = toques.get(evento.pointerId);
      if (!gesto.andou) {
        if (Math.hypot(ponto.x - gesto.inicio.x, ponto.y - gesto.inicio.y) < AJUSTES_DO_VISOR.limiarDoArraste) return;
        gesto.andou = true;
        janela.classList.add("visor--arrastando");
        capturar();
      }
      inteiro = false;
      aplicar({
        escala: vista.escala,
        cx: vista.cx - (ponto.x - gesto.ultimo.x) / vista.escala,
        cy: vista.cy - (ponto.y - gesto.ultimo.y) / vista.escala,
      });
      gesto.ultimo = ponto;
      return;
    }

    // Pinça: o lugar do mapa entre os dedos segue os dedos
    const [a, b] = toques.values();
    const agora = medirPinca(a, b);
    const antes = gesto.ultimo;
    const livre = espacoLivre();
    const escala = limitar((vista.escala * agora.distancia) / antes.distancia, escalaMinima(livre), escalaMaxima(livre));
    inteiro = false;
    aplicar({
      escala,
      cx: vista.cx + (antes.x - livre.centroX) / vista.escala - (agora.x - livre.centroX) / escala,
      cy: vista.cy + (antes.y - livre.centroY) / vista.escala - (agora.y - livre.centroY) / escala,
    });
    gesto.ultimo = agora;
  }

  function aoSoltar(evento) {
    if (!toques.delete(evento.pointerId)) return;
    // Depois de arrastar, o clique que o navegador manda ao soltar não vale como clique
    if (gesto?.andou && !toques.size) {
      engolirClique = true;
      setTimeout(() => (engolirClique = false));
    }
    comecarGesto();
  }

  /* ---------- Teclado: + e − para o zoom, setas para mover, 0 para o mapa inteiro ---------- */

  const SETAS = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };

  function aoTeclar(evento) {
    if (!aberto || evento.defaultPrevented || evento.ctrlKey || evento.metaKey || evento.altKey) return;
    if (document.querySelector("dialog[open]")) return;
    if (evento.target.closest?.("input, textarea, select, [contenteditable]")) return;
    const { passoDoBotao, passoDaSeta } = AJUSTES_DO_VISOR;
    if (evento.key === "+" || evento.key === "=") aproximar(passoDoBotao);
    else if (evento.key === "-") aproximar(1 / passoDoBotao);
    else if (evento.key === "0") verInteiro();
    else if (SETAS[evento.key]) mover(SETAS[evento.key][0] * passoDaSeta, SETAS[evento.key][1] * passoDaSeta);
    else return;
    evento.preventDefault();
  }

  /* ---------- Ligar tudo ---------- */

  janela.addEventListener("wheel", aoRolar, { passive: false });
  janela.addEventListener("pointerdown", aoApertar);
  janela.addEventListener("pointermove", aoArrastar);
  janela.addEventListener("pointerup", aoSoltar);
  janela.addEventListener("pointercancel", aoSoltar);
  janela.addEventListener("dragstart", (evento) => evento.preventDefault());
  janela.addEventListener(
    "click",
    (evento) => {
      if (!engolirClique) return;
      evento.preventDefault();
      evento.stopImmediatePropagation();
    },
    true,
  );
  document.addEventListener("keydown", aoTeclar);

  botoes.aproximar?.addEventListener("click", () => aproximar(AJUSTES_DO_VISOR.passoDoBotao));
  botoes.afastar?.addEventListener("click", () => aproximar(1 / AJUSTES_DO_VISOR.passoDoBotao));
  botoes.inteiro?.addEventListener("click", () => verInteiro());

  new ResizeObserver(ajustar).observe(janela);

  return {
    abrir,
    fechar,
    verInteiro,
    aproximar,
    mover,
    centralizar,
    ajustar,
    get escala() {
      return vista.escala;
    },
  };
}
