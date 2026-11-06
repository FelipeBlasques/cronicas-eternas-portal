/* =================================================================
   Crônicas Eternas: o grafo do Caderno
   -----------------------------------------------------------------
   Cada nota é um ponto, e cada link entre duas notas é uma linha.
   Os personagens, acontecimentos, lugares, memórias e mesas citados
   nas notas entram como pontos de outras cores, e as etiquetas
   também, se a pessoa quiser. Abre na área da nota, em #grafo (o
   caderno inteiro) ou em #grafo-<id> (a vizinhança de uma nota).

   O desenho é um <canvas> com uma simulação por forças escrita
   aqui: repulsão entre os pontos (com uma quadtree, Barnes-Hut,
   quando passam de 300), molas nas linhas, gravidade fraca para o
   centro e colisão. Por cima, o painel (procurar, mostrar, grafo
   local e zoom) e a legenda.

   Carregado depois do caderno.js. Usa de lá o estado, a api, o
   abrirNota, o buscarEtiqueta, o voltarAoCaderno, o botaoVoltar e
   o noCelular, e só preenche os ganchosDoGrafo: mostrar(id ou null)
   e fechar(). Do comum.js, criar(), botao(), normalizar() e
   corVisivel(); do marcas.js, desenharMarcas.enderecoDoPortal().
   ================================================================= */

(() => {
  "use strict";

  const GUARDA = "caderno:grafo";

  // As forças da simulação (nas medidas do grafo; o zoom aumenta tudo junto)
  const FISICA = {
    repulsao: 180, // a força que afasta cada par de pontos
    theta: 0.9, // Barnes-Hut: o quanto um grupo distante conta como um ponto só
    barnesHutDesde: 300, // pontos: a partir daqui, a repulsão usa a quadtree
    mola: 70, // o comprimento das linhas
    forcaDaMola: 0.06,
    gravidade: 0.012,
    folga: 4, // a distância mínima entre dois pontos é a soma dos raios mais isto
    amortecer: 0.6, // a velocidade que fica a cada passo
    esfriar: 0.985, // o calor é multiplicado por isto a cada passo
    parar: 0.005, // abaixo deste calor, a simulação para
    calorDoArraste: 0.3,
    passosDoMovimentoReduzido: 300,
  };
  const ZOOM = { minimo: 0.2, maximo: 4, doBotao: 1.3, maximoAoCentralizar: 1.6 };

  const CORES = {
    personagem: "#c9a66b",
    evento: "#b8735a",
    lugar: "#8a9f73",
    memoria: "#9a8bb5",
    etiqueta: "#6f9690",
  };
  const COR_DA_LINHA = "rgba(181, 154, 118, 0.22)";
  const APAGADO = 0.15; // a opacidade do que não está em destaque

  const NOMES = {
    nota: "Nota",
    personagem: "Personagem",
    evento: "Acontecimento",
    lugar: "Lugar",
    memoria: "Memória",
    mesa: "Mesa",
    etiqueta: "Etiqueta",
  };

  // As caixas de "Mostrar", na ordem do painel, e como começam
  const MOSTRAR = [
    { chave: "personagem", texto: "Personagens", ligada: true },
    { chave: "evento", texto: "Acontecimentos", ligada: true },
    { chave: "lugar", texto: "Lugares", ligada: true },
    { chave: "memoria", texto: "Memórias", ligada: true },
    { chave: "mesa", texto: "Mesas", ligada: true },
    { chave: "etiqueta", texto: "Etiquetas", ligada: false },
    { chave: "soltas", texto: "Notas sem ligação", ligada: true },
  ];

  /* ---------- As escolhas guardadas (menos a busca) ---------- */

  function lerEscolhas() {
    const escolhas = { mostrar: Object.fromEntries(MOSTRAR.map((m) => [m.chave, m.ligada])), profundidade: 1, recolhido: false };
    try {
      const guardadas = JSON.parse(localStorage.getItem(GUARDA) || "null");
      if (guardadas && typeof guardadas === "object") {
        for (const m of MOSTRAR) if (typeof guardadas.mostrar?.[m.chave] === "boolean") escolhas.mostrar[m.chave] = guardadas.mostrar[m.chave];
        if ([1, 2, 3].includes(guardadas.profundidade)) escolhas.profundidade = guardadas.profundidade;
        if (typeof guardadas.recolhido === "boolean") escolhas.recolhido = guardadas.recolhido;
      }
    } catch {
      // sem o armazenamento do navegador, valem as escolhas de sempre
    }
    return escolhas;
  }

  function guardarEscolhas() {
    try {
      localStorage.setItem(GUARDA, JSON.stringify(escolhas));
    } catch {
      // sem o armazenamento do navegador, as escolhas valem só até fechar
    }
  }

  const escolhas = lerEscolhas();

  /* ---------- O grafo aberto ---------- */

  let pedido = 0; // conta as aberturas, para ignorar a resposta de uma que ficou para trás
  let atual = null; // o grafo na tela: os dados, os pontos, a vista, o painel…

  const limitar = (valor, minimo, maximo) => Math.min(maximo, Math.max(minimo, valor));
  const movimentoReduzido = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const corDoCss = (nome, reserva) => getComputedStyle(document.documentElement).getPropertyValue(nome).trim() || reserva;
  const milhar = (n) => n.toLocaleString("pt-BR");
  const plural = (n, um, varios) => `${milhar(n)} ${n === 1 ? um : varios}`;

  async function mostrar(id) {
    fechar();
    const meu = ++pedido;
    const area = $("#area-nota");
    const aviso = (texto) => {
      const p = criar("p", "area-nota__aviso", texto);
      p.setAttribute("role", "status");
      area.replaceChildren(botaoVoltar(), p);
    };
    if (ehAdmin() && !estado.escolhida) return aviso("Escolha um caderno em “Caderno de:” para ver o grafo.");
    aviso("Abrindo o grafo…");
    let dados;
    try {
      dados = ehAdmin() ? await api.grafoDaConta(estado.escolhida) : await api.grafo();
    } catch (falha) {
      if (meu === pedido) aviso(falha.message);
      return;
    }
    if (meu !== pedido) return;
    montar(area, dados, id);
  }

  function fechar() {
    pedido++;
    if (!atual) return;
    cancelAnimationFrame(atual.quadro);
    atual.observador.disconnect();
    atual = null;
  }

  /* ---------- Os pontos e as linhas, a partir do que o servidor mandou ---------- */

  function modelo(dados) {
    const pontos = new Map();
    const eu = estado.conta?.usuario;
    for (const nota of dados.notas) {
      const fora = !ehAdmin() && nota.dono.usuario !== eu;
      pontos.set(`nota:${nota.id}`, { chave: `nota:${nota.id}`, tipo: "nota", id: nota.id, nome: nota.titulo, dono: nota.dono, fora });
    }
    for (const [chave, alvo] of Object.entries(dados.alvos)) {
      const separador = chave.indexOf(":");
      const tipo = chave.slice(0, separador);
      if (!Object.hasOwn(NOMES, tipo)) continue;
      pontos.set(chave, { chave, tipo, id: chave.slice(separador + 1), nome: alvo.nome ?? alvo.titulo ?? "", mapa: alvo.mapa, cor: alvo.cor });
    }
    // As linhas sem direção: A→B e B→A viram uma só, tracejada só se as duas forem só embutida
    const linhas = new Map();
    const ligar = (a, b, embutida) => {
      if (!pontos.has(a) || !pontos.has(b) || a === b) return;
      const chave = a < b ? `${a}\n${b}` : `${b}\n${a}`;
      const ja = linhas.get(chave);
      if (ja) ja.embutida = ja.embutida && embutida;
      else linhas.set(chave, { a: pontos.get(a), b: pontos.get(b), embutida });
    };
    for (const ligacao of dados.ligacoes) ligar(`nota:${ligacao.de}`, ligacao.para, ligacao.embutida);
    for (const nota of dados.notas) {
      for (const nome of nota.etiquetas) {
        const chave = `etiqueta:${nome}`;
        if (!pontos.has(chave)) pontos.set(chave, { chave, tipo: "etiqueta", id: nome, nome: `#${nome}` });
        ligar(`nota:${nota.id}`, chave, false);
      }
    }
    // O começo: uma espiral (filotaxia), na ordem dos ids, para o desenho sair igual toda vez
    const lista = [...pontos.values()].sort((a, b) => (a.chave < b.chave ? -1 : a.chave > b.chave ? 1 : 0));
    lista.forEach((p, i) => {
      const raio = 12 * Math.sqrt(i + 0.5);
      const angulo = i * Math.PI * (3 - Math.sqrt(5));
      Object.assign(p, { x: raio * Math.cos(angulo), y: raio * Math.sin(angulo), vx: 0, vy: 0, fixo: null, raio: 4, vizinhos: new Set() });
      p.busca = normalizar(p.nome);
      p.cor = p.tipo === "nota" ? null : p.tipo === "mesa" ? corVisivel(p.cor) : CORES[p.tipo];
    });
    return { pontos: lista, porChave: pontos, linhas: [...linhas.values()] };
  }

  // O que aparece, pelas caixas de "Mostrar" e pelo grafo local
  function filtrar() {
    const g = atual;
    const mostra = (p) => p.tipo === "nota" || escolhas.mostrar[p.tipo];
    let linhas = g.todas.linhas.filter((l) => mostra(l.a) && mostra(l.b));
    let visiveis = new Set(g.todas.pontos.filter(mostra));
    const centro = g.centro ? g.todas.porChave.get(`nota:${g.centro}`) : null;
    if (centro && g.local) {
      // Os passos a partir da nota, passando também pelos pontos do portal e pelas etiquetas
      const vizinhos = new Map();
      for (const l of linhas) {
        if (!vizinhos.has(l.a)) vizinhos.set(l.a, []);
        if (!vizinhos.has(l.b)) vizinhos.set(l.b, []);
        vizinhos.get(l.a).push(l.b);
        vizinhos.get(l.b).push(l.a);
      }
      const alcancados = new Set([centro]);
      let borda = [centro];
      for (let passo = 0; passo < escolhas.profundidade; passo++) {
        const proxima = [];
        for (const p of borda) {
          for (const q of vizinhos.get(p) ?? []) {
            if (!alcancados.has(q)) {
              alcancados.add(q);
              proxima.push(q);
            }
          }
        }
        borda = proxima;
      }
      visiveis = alcancados;
      linhas = linhas.filter((l) => visiveis.has(l.a) && visiveis.has(l.b));
    }
    for (const p of g.todas.pontos) p.vizinhos = new Set();
    for (const l of linhas) {
      l.a.vizinhos.add(l.b);
      l.b.vizinhos.add(l.a);
    }
    if (!escolhas.mostrar.soltas) {
      for (const p of [...visiveis]) if (p.tipo === "nota" && !p.vizinhos.size && p !== centro) visiveis.delete(p);
    }
    g.pontos = g.todas.pontos.filter((p) => visiveis.has(p));
    g.linhas = linhas;
    for (const p of g.pontos) p.raio = Math.min(14, 4 + 1.6 * Math.sqrt(p.vizinhos.size)) * (p.tipo === "etiqueta" ? 0.7 : 1);
    g.centroVisivel = centro && visiveis.has(centro) ? centro : null;
    if (g.sobMouse && !visiveis.has(g.sobMouse)) g.sobMouse = null;
    atualizarNumeros();
    atualizarLegenda();
    procurar();
  }

  /* ---------- A simulação ---------- */

  // A quadtree: cada nó guarda quantos pontos tem e a soma das posições (o centro é a soma / massa)
  const novoNo = (x, y, t) => ({ x, y, t, filhos: null, pontos: null, massa: 0, sx: 0, sy: 0 });

  function inserir(no, p, profundidade) {
    no.massa++;
    no.sx += p.x;
    no.sy += p.y;
    if (!no.filhos) {
      if (!no.pontos) {
        no.pontos = [p];
        return;
      }
      if (profundidade > 18) {
        no.pontos.push(p); // pontos quase no mesmo lugar ficam juntos numa folha
        return;
      }
      const antigos = no.pontos;
      no.pontos = null;
      no.filhos = [null, null, null, null];
      for (const q of antigos) descer(no, q, profundidade);
    }
    descer(no, p, profundidade);
  }

  function descer(no, p, profundidade) {
    const meio = no.t / 2;
    const i = (p.x >= no.x + meio ? 1 : 0) + (p.y >= no.y + meio ? 2 : 0);
    if (!no.filhos[i]) no.filhos[i] = novoNo(no.x + (i & 1 ? meio : 0), no.y + (i & 2 ? meio : 0), meio);
    inserir(no.filhos[i], p, profundidade + 1);
  }

  function quadtree(pontos) {
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const p of pontos) {
      x0 = Math.min(x0, p.x);
      y0 = Math.min(y0, p.y);
      x1 = Math.max(x1, p.x);
      y1 = Math.max(y1, p.y);
    }
    const raiz = novoNo(x0, y0, Math.max(x1 - x0, y1 - y0, 1) + 1);
    for (const p of pontos) inserir(raiz, p, 0);
    return raiz;
  }

  // Empurra "p" para longe de um ponto (ou de um grupo de "massa" pontos) em (x, y)
  function empurrar(p, x, y, massa, forca) {
    let dx = x - p.x;
    let dy = y - p.y;
    let d2 = dx * dx + dy * dy;
    if (d2 < 1e-6) {
      dx = 0.01;
      dy = 0.01;
      d2 = 2e-4;
    }
    d2 = Math.max(d2, 1);
    p.vx -= (dx * forca * massa) / d2;
    p.vy -= (dy * forca * massa) / d2;
  }

  function repelirPelaArvore(no, p, forca, theta2) {
    if (!no.filhos) {
      for (const q of no.pontos) if (q !== p) empurrar(p, q.x, q.y, 1, forca);
      return;
    }
    const cx = no.sx / no.massa;
    const cy = no.sy / no.massa;
    const dx = cx - p.x;
    const dy = cy - p.y;
    if ((no.t * no.t) / theta2 < dx * dx + dy * dy) return empurrar(p, cx, cy, no.massa, forca);
    for (const filho of no.filhos) if (filho) repelirPelaArvore(filho, p, forca, theta2);
  }

  // Os pontos não se sobrepõem: uma grade com células do tamanho do maior encontro possível
  function separar(pontos) {
    const celula = 2 * 14 + FISICA.folga;
    const grade = new Map();
    for (const p of pontos) {
      const chave = `${Math.floor(p.x / celula)},${Math.floor(p.y / celula)}`;
      if (!grade.has(chave)) grade.set(chave, []);
      grade.get(chave).push(p);
    }
    for (const p of pontos) {
      const cx = Math.floor(p.x / celula);
      const cy = Math.floor(p.y / celula);
      for (let i = -1; i <= 1; i++) {
        for (let j = -1; j <= 1; j++) {
          for (const q of grade.get(`${cx + i},${cy + j}`) ?? []) {
            if (q === p || q.chave < p.chave) continue; // cada par uma vez
            const minimo = p.raio + q.raio + FISICA.folga;
            let dx = q.x - p.x;
            let dy = q.y - p.y;
            let d = Math.hypot(dx, dy);
            if (d >= minimo) continue;
            if (d < 1e-6) {
              dx = 1;
              dy = 0;
              d = 1;
            }
            const falta = (minimo - d) / 2;
            const ux = (dx / d) * falta;
            const uy = (dy / d) * falta;
            if (!p.fixo) {
              p.x -= ux;
              p.y -= uy;
            }
            if (!q.fixo) {
              q.x += ux;
              q.y += uy;
            }
          }
        }
      }
    }
  }

  function passo() {
    const g = atual;
    const calor = g.calor;
    const pontos = g.pontos;
    const forca = FISICA.repulsao * calor;
    if (pontos.length > FISICA.barnesHutDesde) {
      const raiz = quadtree(pontos);
      const theta2 = FISICA.theta * FISICA.theta;
      for (const p of pontos) repelirPelaArvore(raiz, p, forca, theta2);
    } else {
      for (let i = 0; i < pontos.length; i++) {
        const p = pontos[i];
        for (let j = i + 1; j < pontos.length; j++) {
          const q = pontos[j];
          let dx = q.x - p.x;
          let dy = q.y - p.y;
          let d2 = dx * dx + dy * dy;
          if (d2 < 1e-6) {
            dx = 0.01;
            dy = 0.01;
            d2 = 2e-4;
          }
          d2 = Math.max(d2, 1);
          const fx = (dx * forca) / d2;
          const fy = (dy * forca) / d2;
          p.vx -= fx;
          p.vy -= fy;
          q.vx += fx;
          q.vy += fy;
        }
      }
    }
    for (const l of g.linhas) {
      const dx = l.b.x - l.a.x;
      const dy = l.b.y - l.a.y;
      const d = Math.hypot(dx, dy) || 1;
      const f = ((d - FISICA.mola) * FISICA.forcaDaMola * calor) / d / 2;
      l.a.vx += dx * f;
      l.a.vy += dy * f;
      l.b.vx -= dx * f;
      l.b.vy -= dy * f;
    }
    for (const p of pontos) {
      p.vx -= p.x * FISICA.gravidade * calor;
      p.vy -= p.y * FISICA.gravidade * calor;
      p.vx *= FISICA.amortecer;
      p.vy *= FISICA.amortecer;
      if (p.fixo) {
        p.x = p.fixo.x;
        p.y = p.fixo.y;
        p.vx = 0;
        p.vy = 0;
      } else {
        p.x += p.vx;
        p.y += p.vy;
      }
    }
    separar(pontos);
    g.calor *= FISICA.esfriar;
    if (g.calor < FISICA.parar) g.calor = 0;
  }

  // Esquenta a simulação de novo (um filtro mudou ou um ponto foi arrastado)
  function esquentar(calor) {
    const g = atual;
    g.calor = Math.max(g.calor, calor);
    if (movimentoReduzido() && !g.arraste) assentar();
    pedirDesenho();
  }

  // Movimento reduzido: os passos são calculados antes, e só o fim é desenhado
  function assentar() {
    const g = atual;
    for (let i = 0; i < FISICA.passosDoMovimentoReduzido && g.calor; i++) passo();
    g.calor = 0;
    if (g.seguir) centralizar({ seguir: true });
  }

  /* ---------- A vista: o zoom e a posição ---------- */

  const naTela = (p) => ({ x: p.x * atual.vista.zoom + atual.vista.x, y: p.y * atual.vista.zoom + atual.vista.y });
  const noGrafo = (x, y) => ({ x: (x - atual.vista.x) / atual.vista.zoom, y: (y - atual.vista.y) / atual.vista.zoom });

  function centralizar({ seguir = false } = {}) {
    const g = atual;
    g.seguir = seguir;
    const { largura, altura } = g;
    if (!g.pontos.length || !largura) {
      g.vista = { x: largura / 2, y: altura / 2, zoom: 1 };
      return pedirDesenho();
    }
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const p of g.pontos) {
      x0 = Math.min(x0, p.x - p.raio);
      y0 = Math.min(y0, p.y - p.raio);
      x1 = Math.max(x1, p.x + p.raio);
      y1 = Math.max(y1, p.y + p.raio + 16); // o nome embaixo
    }
    const margem = 40;
    const zoom = limitar(
      Math.min((largura - 2 * margem) / Math.max(x1 - x0, 1), (altura - 2 * margem) / Math.max(y1 - y0, 1)),
      ZOOM.minimo,
      ZOOM.maximoAoCentralizar,
    );
    g.vista = { zoom, x: largura / 2 - ((x0 + x1) / 2) * zoom, y: altura / 2 - ((y0 + y1) / 2) * zoom };
    pedirDesenho();
  }

  // O zoom em volta de um ponto da tela
  function darZoom(fator, x = atual.largura / 2, y = atual.altura / 2) {
    const g = atual;
    const zoom = limitar(g.vista.zoom * fator, ZOOM.minimo, ZOOM.maximo);
    const antes = noGrafo(x, y);
    g.vista = { zoom, x: x - antes.x * zoom, y: y - antes.y * zoom };
    g.seguir = false;
    pedirDesenho();
  }

  function mover(dx, dy) {
    atual.vista.x += dx;
    atual.vista.y += dy;
    atual.seguir = false;
    pedirDesenho();
  }

  /* ---------- O desenho ---------- */

  function pedirDesenho() {
    const g = atual;
    if (!g || g.quadro) return;
    g.quadro = requestAnimationFrame(quadro);
  }

  function quadro() {
    const g = atual;
    if (!g) return;
    g.quadro = 0;
    if (g.calor && !movimentoReduzido()) {
      passo();
      if (g.seguir) centralizar({ seguir: true });
    }
    desenhar();
    if (g.calor && !movimentoReduzido()) pedirDesenho();
  }

  // O que fica inteiro: o ponto sob o mouse e os vizinhos; senão, o que a busca achou; senão, tudo
  function emDestaque() {
    const g = atual;
    if (g.sobMouse) return new Set([g.sobMouse, ...g.sobMouse.vizinhos]);
    if (g.achados) return g.achados;
    return null;
  }

  function desenhar() {
    const g = atual;
    const ctx = g.ctx;
    const escala = window.devicePixelRatio || 1;
    ctx.setTransform(escala, 0, 0, escala, 0, 0);
    ctx.clearRect(0, 0, g.largura, g.altura);
    const { zoom } = g.vista;
    const destaque = emDestaque();
    const alfa = (p) => (!destaque || destaque.has(p) ? 1 : APAGADO);

    // As linhas
    ctx.lineWidth = 1;
    for (const l of g.linhas) {
      const doMouse = g.sobMouse && (l.a === g.sobMouse || l.b === g.sobMouse);
      const a = naTela(l.a);
      const b = naTela(l.b);
      ctx.globalAlpha = doMouse || !destaque || (destaque.has(l.a) && destaque.has(l.b)) ? 1 : APAGADO;
      ctx.strokeStyle = doMouse ? g.cores.pergaminho : COR_DA_LINHA;
      ctx.setLineDash(l.embutida ? [4, 4] : []);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // Os pontos
    for (const p of g.pontos) {
      const { x, y } = naTela(p);
      const r = p.raio * zoom;
      ctx.globalAlpha = alfa(p);
      const cor = p.cor ?? g.cores.nota;
      ctx.fillStyle = cor;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      if (p.fora) {
        ctx.strokeStyle = cor;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(x, y, r + 2.5, 0, Math.PI * 2);
        ctx.stroke();
      }
      if (p === g.sobMouse || p === g.centroVisivel) {
        ctx.strokeStyle = g.cores.brasa;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, r + (p.fora ? 5 : 3.5), 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    // Os nomes: com o zoom a partir de 1 (somem aos poucos até 0,6), e sempre no ponto sob o mouse e nos vizinhos
    const doZoom = limitar((zoom - 0.6) / 0.4, 0, 1);
    const perto = g.sobMouse ? new Set([g.sobMouse, ...g.sobMouse.vizinhos]) : null;
    ctx.font = `12px ${g.cores.fonte}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillStyle = g.cores.nota;
    for (const p of g.pontos) {
      const base = perto?.has(p) ? 1 : doZoom * alfa(p);
      if (base <= 0.01) continue;
      const { x, y } = naTela(p);
      ctx.globalAlpha = base;
      ctx.fillText(p.nome.length > 32 ? `${p.nome.slice(0, 31)}…` : p.nome, x, y + p.raio * zoom + 4);
    }
    ctx.globalAlpha = 1;
  }

  /* ---------- O ponto sob o mouse e o rótulo ---------- */

  function pontoEm(x, y, folga) {
    const g = atual;
    let melhor = null;
    let distancia = Infinity;
    for (const p of g.pontos) {
      const t = naTela(p);
      const d = Math.hypot(t.x - x, t.y - y);
      if (d <= p.raio * g.vista.zoom + folga && d < distancia) {
        melhor = p;
        distancia = d;
      }
    }
    return melhor;
  }

  function textoDoRotulo(p) {
    if (p.tipo === "nota") return { nome: p.nome, mais: p.fora ? `de ${p.dono.nome}` : "" };
    if (p.tipo === "lugar") return { nome: `${NOMES.lugar} · ${p.nome}`, mais: p.mapa ? `no mapa ${p.mapa}` : "" };
    return { nome: `${NOMES[p.tipo]} · ${p.nome}`, mais: "" };
  }

  function marcarSobMouse(p) {
    const g = atual;
    if (g.sobMouse === p) return;
    g.sobMouse = p;
    g.canvas.classList.toggle("grafo__canvas--sobre-ponto", Boolean(p));
    const rotulo = g.rotulo;
    if (!p) {
      rotulo.hidden = true;
    } else {
      const { nome, mais } = textoDoRotulo(p);
      rotulo.replaceChildren(criar("span", "grafo__rotulo-nome", nome));
      if (mais) rotulo.append(criar("span", "grafo__rotulo-mais", mais));
      rotulo.hidden = false;
      posicionarRotulo();
    }
    pedirDesenho();
  }

  function posicionarRotulo() {
    const g = atual;
    if (!g.sobMouse || g.rotulo.hidden) return;
    const t = naTela(g.sobMouse);
    g.rotulo.style.setProperty("left", `${Math.round(t.x)}px`);
    g.rotulo.style.setProperty("top", `${Math.round(t.y - g.sobMouse.raio * g.vista.zoom - 8)}px`);
  }

  /* ---------- Clicar ---------- */

  function clicar(p, evento) {
    if (p.tipo === "nota") return abrirNota(p.id);
    if (p.tipo === "etiqueta") {
      buscarEtiqueta(p.id);
      // No celular, a busca fica na lateral: o grafo dá lugar a ela
      if (noCelular()) voltarAoCaderno();
      return;
    }
    const endereco = desenharMarcas.enderecoDoPortal(p.tipo, p.id);
    if (evento?.ctrlKey || evento?.metaKey) window.open(endereco, "_blank", "noopener");
    else location.href = endereco;
  }

  /* ---------- Mexer: a roda, o arraste, a pinça e o teclado ---------- */

  function pontoDoEvento(evento) {
    const caixa = atual.canvas.getBoundingClientRect();
    return { x: evento.clientX - caixa.left, y: evento.clientY - caixa.top };
  }

  // Como no visor dos mapas: a pinça do touchpad chega como roda com Ctrl
  function aoRolar(evento) {
    evento.preventDefault();
    if (!atual) return;
    const unidade = evento.deltaMode === 1 ? 16 : evento.deltaMode === 2 ? atual.altura : 1;
    const delta = evento.deltaY * unidade;
    if (!delta) return;
    const fator = evento.ctrlKey ? Math.exp(-limitar(delta, -50, 50) * 0.01) : Math.exp(-limitar(delta, -250, 250) * 0.002);
    const { x, y } = pontoDoEvento(evento);
    darZoom(fator, x, y);
    posicionarRotulo();
  }

  function aoApertar(evento) {
    const g = atual;
    if (!g || (evento.pointerType === "mouse" && evento.button !== 0)) return;
    g.canvas.setPointerCapture?.(evento.pointerId);
    const ponto = pontoDoEvento(evento);
    g.toques.set(evento.pointerId, ponto);
    if (g.toques.size === 1) {
      const p = pontoEm(ponto.x, ponto.y, evento.pointerType === "mouse" ? 3 : 10);
      g.arraste = { ponto: p, inicio: ponto, ultimo: ponto, moveu: false };
    } else {
      // Dois dedos: a pinça. O ponto que estava sendo arrastado volta para a simulação.
      soltarPonto();
      g.arraste = null;
      g.pinca = medirPinca();
    }
  }

  function medirPinca() {
    const [a, b] = [...atual.toques.values()];
    return { distancia: Math.hypot(a.x - b.x, a.y - b.y) || 1, meio: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
  }

  function aoArrastar(evento) {
    const g = atual;
    if (!g) return;
    const ponto = pontoDoEvento(evento);
    if (!g.toques.has(evento.pointerId)) {
      if (evento.pointerType === "mouse") marcarSobMouse(pontoEm(ponto.x, ponto.y, 3));
      return;
    }
    g.toques.set(evento.pointerId, ponto);
    if (g.toques.size >= 2 && g.pinca) {
      const agora = medirPinca();
      mover(agora.meio.x - g.pinca.meio.x, agora.meio.y - g.pinca.meio.y);
      darZoom(agora.distancia / g.pinca.distancia, agora.meio.x, agora.meio.y);
      g.pinca = agora;
      posicionarRotulo();
      return;
    }
    const arraste = g.arraste;
    if (!arraste) return;
    if (!arraste.moveu && Math.hypot(ponto.x - arraste.inicio.x, ponto.y - arraste.inicio.y) < 4) return;
    arraste.moveu = true;
    if (arraste.ponto) {
      arraste.ponto.fixo = noGrafo(ponto.x, ponto.y);
      g.seguir = false;
      esquentar(FISICA.calorDoArraste);
      if (movimentoReduzido()) {
        arraste.ponto.x = arraste.ponto.fixo.x;
        arraste.ponto.y = arraste.ponto.fixo.y;
      }
    } else {
      mover(ponto.x - arraste.ultimo.x, ponto.y - arraste.ultimo.y);
    }
    arraste.ultimo = ponto;
    posicionarRotulo();
  }

  function soltarPonto() {
    const p = atual?.arraste?.ponto;
    if (!p?.fixo) return;
    p.fixo = null;
    atual.arraste = null;
    esquentar(FISICA.calorDoArraste);
  }

  function aoSoltar(evento) {
    const g = atual;
    if (!g || !g.toques.delete(evento.pointerId)) return;
    if (g.toques.size) {
      g.pinca = g.toques.size >= 2 ? medirPinca() : null;
      return;
    }
    g.pinca = null;
    const arraste = g.arraste;
    if (!arraste) return;
    if (arraste.moveu && arraste.ponto) return soltarPonto();
    g.arraste = null;
    if (!arraste.moveu && arraste.ponto && evento.type === "pointerup") clicar(arraste.ponto, evento);
  }

  function aoTeclar(evento) {
    const g = atual;
    if (!g || evento.altKey || evento.ctrlKey || evento.metaKey) return;
    const passoDaSeta = 40;
    const teclas = {
      ArrowLeft: () => mover(passoDaSeta, 0),
      ArrowRight: () => mover(-passoDaSeta, 0),
      ArrowUp: () => mover(0, passoDaSeta),
      ArrowDown: () => mover(0, -passoDaSeta),
      "+": () => darZoom(ZOOM.doBotao),
      "=": () => darZoom(ZOOM.doBotao),
      "-": () => darZoom(1 / ZOOM.doBotao),
      _: () => darZoom(1 / ZOOM.doBotao),
      0: () => centralizar(),
    };
    const acao = teclas[evento.key];
    if (!acao) return;
    evento.preventDefault();
    acao();
    posicionarRotulo();
  }

  /* ---------- O painel ---------- */

  function caixa(texto, marcada, aoMudar) {
    const rotulo = criar("label", "grafo__caixa");
    const entrada = criar("input");
    entrada.type = "checkbox";
    entrada.checked = marcada;
    entrada.addEventListener("change", () => aoMudar(entrada.checked));
    rotulo.append(entrada, criar("span", null, texto));
    return rotulo;
  }

  function montarPainel() {
    const g = atual;
    const painel = criar("section", "grafo__painel");
    painel.setAttribute("aria-label", "Painel do grafo");
    const cabeca = criar("div", "grafo__cabeca");
    const titulo = criar("h2", "grafo__titulo", "Grafo");
    g.numeros = criar("p", "grafo__numeros");
    const recolher = botao("", "botao--leve grafo__recolher", () => {
      escolhas.recolhido = !painel.classList.contains("grafo__painel--recolhido");
      aplicarRecolhido();
      guardarEscolhas();
    });
    const aplicarRecolhido = () => {
      painel.classList.toggle("grafo__painel--recolhido", escolhas.recolhido);
      recolher.textContent = escolhas.recolhido ? "▸" : "▾";
      recolher.setAttribute("aria-expanded", String(!escolhas.recolhido));
      recolher.setAttribute("aria-label", escolhas.recolhido ? "Abrir o painel do grafo" : "Recolher o painel do grafo");
      recolher.title = recolher.getAttribute("aria-label");
    };
    cabeca.append(titulo, g.numeros, recolher);

    const corpo = criar("div", "grafo__corpo");
    corpo.id = "grafo-corpo";
    recolher.setAttribute("aria-controls", corpo.id);

    // Procurar: o que tem o termo fica inteiro; Enter centraliza o primeiro
    const campo = criar("label", "campo grafo__procurar");
    campo.append(criar("span", "campo__rotulo", "Procurar"));
    const busca = criar("input");
    busca.type = "search";
    busca.autocomplete = "off";
    busca.spellcheck = false;
    busca.placeholder = "Nome de uma nota…";
    busca.addEventListener("input", () => {
      g.termo = normalizar(busca.value.trim());
      procurar();
    });
    busca.addEventListener("keydown", (evento) => {
      if (evento.key !== "Enter") return;
      evento.preventDefault();
      const primeiro = g.pontos.find((p) => g.achados?.has(p));
      if (!primeiro) return;
      g.vista.x = g.largura / 2 - primeiro.x * g.vista.zoom;
      g.vista.y = g.altura / 2 - primeiro.y * g.vista.zoom;
      g.seguir = false;
      pedirDesenho();
    });
    campo.append(busca);

    const mostrarGrupo = criar("fieldset", "grafo__grupo");
    mostrarGrupo.append(criar("legend", "campo__rotulo", "Mostrar"));
    for (const m of MOSTRAR) {
      mostrarGrupo.append(
        caixa(m.texto, escolhas.mostrar[m.chave], (ligada) => {
          escolhas.mostrar[m.chave] = ligada;
          guardarEscolhas();
          filtrar();
          esquentar(0.5);
        }),
      );
    }
    corpo.append(campo, mostrarGrupo);

    // O grafo local, só em #grafo-<id>
    if (g.centro && g.todas.porChave.has(`nota:${g.centro}`)) {
      const local = criar("fieldset", "grafo__grupo");
      local.append(criar("legend", "campo__rotulo", "Grafo local"));
      const profundidade = criar("select");
      for (const n of [1, 2, 3]) {
        const opcao = criar("option", null, String(n));
        opcao.value = String(n);
        profundidade.append(opcao);
      }
      profundidade.value = String(escolhas.profundidade);
      profundidade.disabled = !g.local;
      profundidade.addEventListener("change", () => {
        escolhas.profundidade = Number(profundidade.value);
        guardarEscolhas();
        filtrar();
        esquentar(0.5);
        centralizar({ seguir: true });
      });
      const rotuloDaProfundidade = criar("label", "grafo__profundidade");
      rotuloDaProfundidade.append(criar("span", null, "Profundidade"), profundidade);
      local.append(
        caixa("Só a vizinhança da nota", g.local, (ligado) => {
          g.local = ligado;
          profundidade.disabled = !ligado;
          filtrar();
          esquentar(0.5);
          centralizar({ seguir: true });
        }),
        rotuloDaProfundidade,
      );
      corpo.append(local);
    }

    const botoes = criar("div", "grafo__botoes");
    const mais = botao("+", "botao--leve", () => darZoom(ZOOM.doBotao));
    mais.setAttribute("aria-label", "Aproximar");
    mais.title = "Aproximar";
    const menos = botao("−", "botao--leve", () => darZoom(1 / ZOOM.doBotao));
    menos.setAttribute("aria-label", "Afastar");
    menos.title = "Afastar";
    botoes.append(botao("Centralizar", "botao--leve", () => centralizar()), mais, menos);
    corpo.append(botoes);

    painel.append(cabeca, corpo);
    aplicarRecolhido();
    return painel;
  }

  function procurar() {
    const g = atual;
    if (!g) return;
    g.achados = g.termo ? new Set(g.pontos.filter((p) => p.busca.includes(g.termo))) : null;
    pedirDesenho();
  }

  function atualizarNumeros() {
    const g = atual;
    const notas = g.pontos.filter((p) => p.tipo === "nota").length;
    const ligacoes = g.linhas.length;
    g.numeros.textContent = `${plural(notas, "nota", "notas")} · ${plural(ligacoes, "ligação", "ligações")}`;
    g.canvas.setAttribute("aria-label", `Grafo do caderno: ${plural(notas, "nota", "notas")} e ${plural(ligacoes, "ligação", "ligações")}`);
  }

  // As cores que estão no grafo, com o nome de cada tipo (cada mesa com o nome dela)
  function atualizarLegenda() {
    const g = atual;
    const itens = [];
    const ja = new Set();
    const juntar = (chave, cor, texto, anel = false) => {
      if (ja.has(chave)) return;
      ja.add(chave);
      itens.push({ cor, texto, anel });
    };
    const ordem = ["nota", "personagem", "evento", "lugar", "memoria", "mesa", "etiqueta"];
    const ordenados = [...g.pontos].sort((a, b) => ordem.indexOf(a.tipo) - ordem.indexOf(b.tipo));
    for (const p of ordenados) {
      if (p.tipo === "nota") {
        if (p.fora) juntar("fora", g.cores.nota, "Nota de outra conta", true);
        else juntar("nota", g.cores.nota, "Nota");
      } else if (p.tipo === "mesa") {
        juntar(`mesa:${p.id}`, p.cor, `Mesa · ${p.nome}`);
      } else {
        juntar(p.tipo, p.cor, NOMES[p.tipo]);
      }
    }
    // "Nota" antes de "Nota de outra conta"
    itens.sort((a, b) => (a.texto === "Nota" ? -1 : b.texto === "Nota" ? 1 : 0));
    g.legenda.replaceChildren(
      ...itens.map(({ cor, texto, anel }) => {
        const item = criar("li", "grafo__legenda-item");
        const amostra = criar("span", `grafo__amostra${anel ? " grafo__amostra--anel" : ""}`);
        amostra.style.setProperty("--cor", cor);
        item.append(amostra, criar("span", null, texto));
        return item;
      }),
    );
    g.legenda.hidden = !itens.length;
  }

  /* ---------- Montar ---------- */

  function montar(area, dados, centro) {
    const embrulho = criar("div", "grafo");
    const canvas = criar("canvas", "grafo__canvas");
    canvas.tabIndex = 0;
    canvas.setAttribute("role", "img");
    const rotulo = criar("div", "grafo__rotulo");
    rotulo.hidden = true;
    const legenda = criar("ul", "grafo__legenda");
    legenda.setAttribute("aria-label", "Legenda");
    embrulho.append(canvas, rotulo, legenda);
    area.replaceChildren(botaoVoltar(), embrulho);

    const fonte = getComputedStyle(document.documentElement).getPropertyValue("--fonte-texto").trim() || "Alegreya, Georgia, serif";
    atual = {
      area,
      embrulho,
      canvas,
      ctx: canvas.getContext("2d"),
      rotulo,
      legenda,
      numeros: null,
      cores: {
        nota: corDoCss("--pergaminho-apagado", "#a8987f"),
        pergaminho: corDoCss("--pergaminho", "#e8ddc8"),
        brasa: corDoCss("--brasa", "#c46a35"),
        fonte,
      },
      todas: modelo(dados),
      centro,
      local: Boolean(centro),
      pontos: [],
      linhas: [],
      centroVisivel: null,
      vista: { x: 0, y: 0, zoom: 1 },
      largura: 0,
      altura: 0,
      calor: 1,
      seguir: true, // até a pessoa mexer, a vista acompanha a simulação para caber na tela
      quadro: 0,
      sobMouse: null,
      termo: "",
      achados: null,
      toques: new Map(),
      arraste: null,
      pinca: null,
      observador: null,
    };
    if (noCelular()) escolhas.recolhido = true;
    embrulho.append(montarPainel());
    filtrar();

    canvas.addEventListener("wheel", aoRolar, { passive: false });
    canvas.addEventListener("pointerdown", aoApertar);
    canvas.addEventListener("pointermove", aoArrastar);
    canvas.addEventListener("pointerup", aoSoltar);
    canvas.addEventListener("pointercancel", aoSoltar);
    canvas.addEventListener("pointerleave", (evento) => {
      if (evento.pointerType === "mouse" && atual && !atual.toques.size) marcarSobMouse(null);
    });
    canvas.addEventListener("keydown", aoTeclar);

    // Nítido em qualquer tela, e desenhado de novo quando a área muda de tamanho
    const esteGrafo = atual;
    let primeiraVez = true;
    atual.observador = new ResizeObserver(() => {
      if (atual !== esteGrafo) return;
      const largura = embrulho.clientWidth;
      const altura = embrulho.clientHeight;
      if (!largura || !altura) return;
      const escala = window.devicePixelRatio || 1;
      atual.largura = largura;
      atual.altura = altura;
      canvas.width = Math.round(largura * escala);
      canvas.height = Math.round(altura * escala);
      if (primeiraVez) {
        primeiraVez = false;
        if (movimentoReduzido()) assentar();
        centralizar({ seguir: !movimentoReduzido() });
      } else if (atual.seguir) {
        centralizar({ seguir: true });
      }
      desenhar();
      pedirDesenho();
    });
    atual.observador.observe(embrulho);
  }

  ganchosDoGrafo.mostrar = mostrar;
  ganchosDoGrafo.fechar = fechar;

    // Link direto para #grafo: se o caderno.js chegou ao endereço antes deste arquivo carregar, o grafo abre agora
    if (navegacao.grafo) mostrar(navegacao.grafo.id);
})();
