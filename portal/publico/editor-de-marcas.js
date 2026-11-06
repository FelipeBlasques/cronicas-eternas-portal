"use strict";

/* =================================================================
   Crônicas Eternas: o editor das marcas
   -----------------------------------------------------------------
   A edição do texto com as marcas do marcas.js, comum ao Caderno e
   à página do lugar dos Mapas: a barra de botões (com o menu do
   Título), as teclas (Ctrl+B, Ctrl+I e o Enter das listas), o Citar
   ([[ e, com as notas, ![[) e o "pôr a imagem no texto".

   Declara só criarEditorDeMarcas(). Carregado depois do comum.js:
   usa $, criar(), simbolo(), normalizar() e fecharAoClicarFora().

     const editor = criarEditorDeMarcas({
       area: () => elemento,       // a área de texto em edição, ou null
       citaveis: () => promessa,   // a lista do Citar, pedida a cada vez que ele abre
       notas: { atual, extra },    // opcional: o grupo Notas, "Embutir nota" e o ![[
       tarefas: true,              // o botão Tarefa
       imagens: { escolher },      // opcional: o botão Imagem
     });

   editor.barra(), tecla(evento), digitou(evento), abrirCitar(area,
   opcoes), porImagem(id, nome), conferirImagem(arquivo),
   textoDoLink(texto) e fechar().
   ================================================================= */

function criarEditorDeMarcas({ area: areaEmEdicao, citaveis: pedirCitaveis, notas = null, tarefas = false, imagens = null }) {
  const TABELA_NOVA = "| Coluna 1 | Coluna 2 |\n| --- | --- |\n|  |  |\n|  |  |";
  const LIMITE_DO_LINK = 120; // caracteres do "o que aparece" de um link (o mesmo do servidor)
  const TIPOS_DE_IMAGEM = ["image/png", "image/jpeg", "image/webp", "image/gif", "image/avif"];
  const LIMITE_DA_IMAGEM = 10 * 1024 * 1024; // bytes de cada imagem (10 MB)

  // "10 MB", "1,5 GB": a mesma conta do servidor
  function emBytes(bytes) {
    for (const [unidade, tamanho] of [
      ["GB", 1024 ** 3],
      ["MB", 1024 ** 2],
      ["KB", 1024],
    ]) {
      const arredondado = Math.round((bytes / tamanho) * 10) / 10;
      if (arredondado >= 1) return `${arredondado.toLocaleString("pt-BR")} ${unidade}`;
    }
    return `${bytes.toLocaleString("pt-BR")} bytes`;
  }

  // Os colchetes de um nome viram parênteses, para não fechar o link antes da hora
  const semColchetes = (texto) => texto.replace(/\[/g, "(").replace(/\]/g, ")");

  /* ---------- A barra de botões ---------- */

  // Cada botão age na área de texto. O clique não tira o foco dela (o mousedown fica parado), e as setas
  // andam entre os botões, como numa barra de ferramentas.
  function barra() {
    const caixaDaBarra = criar("div", "ferramentas");
    caixaDaBarra.setAttribute("role", "toolbar");
    caixaDaBarra.setAttribute("aria-label", "Marcas do texto");
    const idDaArea = areaEmEdicao()?.id;
    if (idDaArea) caixaDaBarra.setAttribute("aria-controls", idDaArea);

    const ferramenta = (rotulo, desenho, acao, { classe = "", menu: abreMenu = false } = {}) => {
      const botaoDaFerramenta = criar("button", classe ? `ferramenta ${classe}` : "ferramenta");
      botaoDaFerramenta.type = "button";
      botaoDaFerramenta.title = rotulo;
      botaoDaFerramenta.tabIndex = -1;
      botaoDaFerramenta.setAttribute("aria-label", rotulo);
      if (desenho.startsWith("icone-")) botaoDaFerramenta.append(simbolo(desenho, "ferramenta__icone"));
      else {
        const letra = criar("span", "ferramenta__letra", desenho);
        letra.setAttribute("aria-hidden", "true");
        botaoDaFerramenta.append(letra);
      }
      if (abreMenu) {
        botaoDaFerramenta.setAttribute("aria-haspopup", "menu");
        botaoDaFerramenta.setAttribute("aria-expanded", "false");
      }
      botaoDaFerramenta.addEventListener("mousedown", (evento) => evento.preventDefault());
      botaoDaFerramenta.addEventListener("click", () => {
        const area = areaEmEdicao();
        if (area) acao(area, botaoDaFerramenta);
      });
      return botaoDaFerramenta;
    };
    const grupo = (...botoes) => {
      const caixa = criar("span", "ferramentas__grupo");
      caixa.append(...botoes.filter(Boolean));
      return caixa;
    };
    const nasLinhas = (tipo) => (area) => aplicarTroca(area, trocaDeLinhas(area.value, area.selectionStart, area.selectionEnd, tipo));
    const bloco = (texto, selecionar) => (area) =>
      aplicarTroca(area, trocaDeBloco(area.value, area.selectionStart, area.selectionEnd, texto, { emVolta: true, selecionar }));

    caixaDaBarra.append(
      grupo(
        ferramenta("Negrito (Ctrl+B)", "N", (area) => envolver(area, "**"), { classe: "ferramenta--negrito" }),
        ferramenta("Itálico (Ctrl+I)", "I", (area) => envolver(area, "*"), { classe: "ferramenta--italico" }),
        ferramenta("Riscado", "abc", (area) => envolver(area, "~~"), { classe: "ferramenta--riscado" }),
        ferramenta("Título", "icone-titulo", abrirMenuDeTitulo, { menu: true }),
      ),
      grupo(
        ferramenta("Lista", "icone-lista", nasLinhas("lista")),
        ferramenta("Lista numerada", "icone-numerada", nasLinhas("numerada")),
        tarefas && ferramenta("Tarefa", "icone-tarefa", nasLinhas("tarefa")),
        ferramenta("Citação", "icone-citacao", nasLinhas("citacao")),
      ),
      grupo(ferramenta("Tabela", "icone-tabela", bloco(TABELA_NOVA, [2, 10])), ferramenta("Separador", "icone-separador", bloco("---"))),
      grupo(
        imagens && ferramenta("Imagem", "icone-imagem", () => imagens.escolher()),
        ferramenta("Link", "icone-elo", (area) => abrirCitar(area)),
        notas && ferramenta("Embutir nota", "icone-embutir", (area) => abrirCitar(area, { soNotas: true, embutir: true })),
      ),
    );
    caixaDaBarra.querySelector(".ferramenta").tabIndex = 0;

    caixaDaBarra.addEventListener("keydown", (evento) => {
      const botoes = [...caixaDaBarra.querySelectorAll(".ferramenta")];
      const i = botoes.indexOf(document.activeElement);
      if (i < 0) return;
      const destinos = { ArrowRight: (i + 1) % botoes.length, ArrowLeft: (i - 1 + botoes.length) % botoes.length, Home: 0, End: botoes.length - 1 };
      if (!Object.hasOwn(destinos, evento.key)) return;
      evento.preventDefault();
      botoes[i].tabIndex = -1;
      botoes[destinos[evento.key]].tabIndex = 0;
      botoes[destinos[evento.key]].focus();
    });
    return caixaDaBarra;
  }

  const envolver = (area, marca) => aplicarTroca(area, trocaDeEnvolver(area.value, area.selectionStart, area.selectionEnd, marca));

  /* ---------- O menu do botão Título ----------
     Um elemento só, criado na primeira vez e aberto junto do botão
     (dentro do diálogo do botão, se ele estiver num). As setas
     andam, Home e End vão às pontas; Esc e Tab fecham e devolvem o
     foco ao botão; o clique fora fecha. */

  const menu = { caixa: null, botao: null };

  function caixaDoMenu() {
    if (menu.caixa) return menu.caixa;
    const caixa = criar("div", "menu-do-titulo");
    caixa.setAttribute("role", "menu");
    caixa.setAttribute("aria-label", "Título");
    caixa.hidden = true;
    caixa.addEventListener("keydown", (evento) => {
      const itens = [...caixa.querySelectorAll(".menu-do-titulo__item")];
      const i = itens.indexOf(document.activeElement);
      let destino = null;
      if (evento.key === "ArrowDown") destino = itens[(i + 1) % itens.length];
      else if (evento.key === "ArrowUp") destino = itens[(i - 1 + itens.length) % itens.length];
      else if (evento.key === "Home") destino = itens[0];
      else if (evento.key === "End") destino = itens[itens.length - 1];
      else if (evento.key === "Escape" || evento.key === "Tab") {
        evento.preventDefault();
        evento.stopPropagation();
        fecharMenuDeTitulo();
        return;
      } else return;
      evento.preventDefault();
      destino?.focus();
    });
    document.addEventListener("pointerdown", (evento) => {
      if (caixa.hidden || caixa.contains(evento.target) || menu.botao?.contains(evento.target)) return;
      fecharMenuDeTitulo({ devolverFoco: false });
    });
    menu.caixa = caixa;
    return caixa;
  }

  function abrirMenuDeTitulo(area, botaoDoTitulo) {
    if (menu.botao === botaoDoTitulo) return fecharMenuDeTitulo();
    fecharMenuDeTitulo({ devolverFoco: false });
    const caixa = caixaDoMenu();
    const opcao = (nivel, texto) => {
      const item = criar("button", "menu-do-titulo__item", texto);
      item.type = "button";
      item.tabIndex = -1;
      item.setAttribute("role", "menuitem");
      item.addEventListener("click", () => {
        fecharMenuDeTitulo();
        aplicarTroca(area, trocaDeTitulo(area.value, area.selectionStart, area.selectionEnd, nivel));
      });
      return item;
    };
    caixa.replaceChildren(opcao(1, "Título 1"), opcao(2, "Título 2"), opcao(3, "Título 3"), opcao(0, "Texto"));
    (botaoDoTitulo.closest("dialog") ?? document.body).append(caixa);
    caixa.hidden = false;
    // Embaixo do botão; sem espaço, em cima. Sempre dentro da tela.
    const lugar = botaoDoTitulo.getBoundingClientRect();
    const x = Math.max(8, Math.min(lugar.left, window.innerWidth - caixa.offsetWidth - 8));
    let y = lugar.bottom + 4;
    if (y + caixa.offsetHeight > window.innerHeight - 8) y = Math.max(8, lugar.top - caixa.offsetHeight - 4);
    caixa.style.setProperty("left", `${Math.round(x)}px`);
    caixa.style.setProperty("top", `${Math.round(y)}px`);
    menu.botao = botaoDoTitulo;
    botaoDoTitulo.setAttribute("aria-expanded", "true");
    caixa.querySelector(".menu-do-titulo__item").focus();
  }

  function fecharMenuDeTitulo({ devolverFoco = true } = {}) {
    const caixa = menu.caixa;
    if (!caixa || caixa.hidden) return;
    const botaoDoTitulo = menu.botao;
    menu.botao = null;
    caixa.hidden = true;
    caixa.replaceChildren();
    botaoDoTitulo?.setAttribute("aria-expanded", "false");
    if (devolverFoco && botaoDoTitulo?.isConnected) botaoDoTitulo.focus({ preventScroll: true });
  }

  /* ---------- As trocas no texto ----------
     Cada botão calcula uma troca: o pedaço [inicio, fim) do texto vira
     "novo", e a seleção fica em "selecao" (no texto novo). Essas contas
     não mexem na página; aplicarTroca() é que põe na área de texto. */

  // Toda troca passa por aqui: com "insertText", o Ctrl+Z desfaz o que os botões fizeram; quando o
  // navegador não aceita (ou a área não está com o foco), setRangeText e o aviso de mudança à mão
  function aplicarTroca(area, troca, { foco = true } = {}) {
    let foi = false;
    if (foco) {
      area.focus({ preventScroll: true });
      area.setSelectionRange(troca.inicio, troca.fim);
      try {
        foi = document.execCommand("insertText", false, troca.novo);
      } catch {
        foi = false;
      }
    }
    if (!foi) {
      area.setRangeText(troca.novo, troca.inicio, troca.fim, "end");
      area.dispatchEvent(new Event("input", { bubbles: true }));
    }
    area.setSelectionRange(troca.selecao[0], troca.selecao[1]);
  }

  // O começo da primeira linha e o fim da última que a seleção toca (sem a linha em que ela só encosta)
  function linhasDaSelecao(texto, inicio, fim) {
    const ultimo = fim > inicio && texto[fim - 1] === "\n" ? fim - 1 : fim;
    const de = inicio > 0 ? texto.lastIndexOf("\n", inicio - 1) + 1 : 0;
    const quebra = texto.indexOf("\n", Math.max(ultimo, de));
    return { de, ate: quebra < 0 ? texto.length : quebra };
  }

  // Numa linha que só mudou no começo, onde fica uma posição dela depois da troca
  function mapaDaLinha(antiga, nova) {
    let comum = 0;
    while (comum < antiga.length && comum < nova.length && antiga[antiga.length - 1 - comum] === nova[nova.length - 1 - comum]) comum++;
    const antes = antiga.length - comum;
    const depois = nova.length - comum;
    return (posicao) => (posicao < antes ? depois : posicao - antes + depois);
  }

  // As linhas trocadas: numa linha só, a seleção acompanha o texto; em várias, fica o bloco todo
  function trocaDasLinhas(inicio, fim, de, ate, linhas, novas) {
    const novo = novas.join("\n");
    if (linhas.length === 1) {
      const mapa = mapaDaLinha(linhas[0], novas[0]);
      return { inicio: de, fim: ate, novo, selecao: [de + mapa(inicio - de), de + mapa(fim - de)] };
    }
    return { inicio: de, fim: ate, novo, selecao: [de, de + novo.length] };
  }

  // O começo de uma linha antes do texto: o recuo, as citações, o "#" do título e a marca de item
  const REGEX_COMECO = /^[ \t]*(?:>[ \t]?)*[ \t]*(?:#+[ \t]+|(?:[-*]|\d{1,9}\.)[ \t]+(?:\[[ xX]\](?:[ \t]+|$))?)?/;

  // Negrito, itálico e riscado: as marcas em volta da seleção, linha por linha, deixando de fora os
  // espaços das pontas e o começo da linha. Sem seleção, as duas marcas com o cursor no meio.
  function trocaDeEnvolver(texto, inicio, fim, marca) {
    if (inicio === fim) return { inicio, fim, novo: marca + marca, selecao: [inicio + marca.length, inicio + marca.length] };
    const pedacos = texto.slice(inicio, fim).split("\n");
    let dentro = null; // numa linha só: onde ficou o texto envolvido, para continuar selecionado
    const novos = pedacos.map((pedaco, i) => {
      const doComeco = i > 0 || inicio === 0 || texto[inicio - 1] === "\n";
      const comeco = doComeco ? REGEX_COMECO.exec(pedaco)[0] : "";
      const [, espacoAntes, meio, espacoDepois] = /^(\s*)(.*?)(\s*)$/.exec(pedaco.slice(comeco.length));
      if (!meio) return pedaco;
      const antes = comeco + espacoAntes + marca;
      if (pedacos.length === 1) dentro = [inicio + antes.length, inicio + antes.length + meio.length];
      return antes + meio + marca + espacoDepois;
    });
    const novo = novos.join("\n");
    return { inicio, fim, novo, selecao: dentro ?? [inicio, inicio + novo.length] };
  }

  // Lista, lista numerada e tarefa no começo de uma linha (também dentro de "> ")
  const REGEX_ITEM = /^((?:[ \t]*>[ \t]?)*)([ \t]*)(?:([-*])[ \t]+(\[[ xX]\](?:[ \t]+|$))?|(\d{1,9})\.[ \t]+)?/;

  function lerItem(linha) {
    const achado = REGEX_ITEM.exec(linha);
    const tipo = achado[4] ? "tarefa" : achado[3] ? "lista" : achado[5] ? "numerada" : null;
    return { citacoes: achado[1], recuo: achado[2], tipo, resto: linha.slice(achado[0].length) };
  }

  // Lista, Lista numerada, Tarefa e Citação: se todas as linhas já têm a marca, ela sai; senão, entra
  // (no lugar de outra marca de lista). A numerada conta 1., 2., 3.; o recuo fica.
  function trocaDeLinhas(texto, inicio, fim, tipo) {
    const { de, ate } = linhasDaSelecao(texto, inicio, fim);
    const linhas = texto.slice(de, ate).split("\n");
    const cheias = linhas.filter((linha) => linha.trim());
    let novas;
    if (tipo === "citacao") {
      const tira = cheias.length > 0 && cheias.every((linha) => /^[ \t]*>/.test(linha));
      novas = linhas.map((linha) => {
        if (tira) return linha.replace(/^[ \t]*>[ \t]?/, "");
        if (!cheias.length) return `> ${linha}`;
        return linha.trim() ? `> ${linha}` : ">";
      });
    } else {
      const tira = cheias.length > 0 && cheias.every((linha) => lerItem(linha).tipo === tipo);
      let numero = 0;
      novas = linhas.map((linha) => {
        if (cheias.length && !linha.trim()) return linha;
        const item = lerItem(linha);
        if (tira) return item.citacoes + item.recuo + item.resto;
        if (tipo === "tarefa" && item.tipo === "tarefa") return linha; // a feita continua feita
        numero += 1;
        const marca = tipo === "lista" ? "- " : tipo === "tarefa" ? "- [ ] " : `${numero}. `;
        return item.citacoes + item.recuo + marca + item.resto;
      });
    }
    return trocaDasLinhas(inicio, fim, de, ate, linhas, novas);
  }

  // Título 1, 2 ou 3 (nível 0: "Texto") no começo das linhas
  function trocaDeTitulo(texto, inicio, fim, nivel) {
    const { de, ate } = linhasDaSelecao(texto, inicio, fim);
    const linhas = texto.slice(de, ate).split("\n");
    const cheias = linhas.filter((linha) => linha.trim());
    const novas = linhas.map((linha) => {
      if (cheias.length && !linha.trim()) return linha;
      const resto = linha.replace(/^[ \t]*(?:#+[ \t]+)?/, "");
      return nivel ? `${"#".repeat(nivel)} ${resto}` : resto;
    });
    return trocaDasLinhas(inicio, fim, de, ate, linhas, novas);
  }

  // Um bloco numa linha só dele (a tabela, o separador, a nota embutida, a imagem), com uma linha em
  // branco em volta quando "emVolta". "selecionar": o pedaço do bloco que fica selecionado; sem ele,
  // o cursor fica logo depois.
  function trocaDeBloco(texto, inicio, fim, bloco, { emVolta = false, selecionar = null } = {}) {
    const antes = texto.slice(0, inicio);
    const depois = texto.slice(fim);
    let prefixo = antes && !antes.endsWith("\n") ? "\n" : "";
    if (emVolta && antes.trim() && !(antes + prefixo).endsWith("\n\n")) prefixo += "\n";
    let sufixo = depois.startsWith("\n") ? "" : "\n";
    if (emVolta && !(sufixo + depois).startsWith("\n\n")) sufixo += "\n";
    const novo = prefixo + bloco + sufixo;
    const comeco = inicio + prefixo.length;
    const selecao = selecionar ? [comeco + selecionar[0], comeco + selecionar[1]] : [inicio + novo.length, inicio + novo.length];
    return { inicio, fim, novo, selecao };
  }

  // Enter num item de lista: o próximo item com a mesma marca ("- ", o próximo número, "- [ ] ").
  // Num item vazio, a marca sai e a lista termina. null: o Enter de sempre.
  const REGEX_MARCA_DE_ITEM = /^((?:[ \t]*>[ \t]?)*)([ \t]*)(?:([-*])([ \t]+)(\[[ xX]\](?:[ \t]+|$))?|(\d{1,9})\.([ \t]+))/;

  function trocaDoEnter(texto, inicio, fim) {
    if (inicio !== fim) return null;
    const de = inicio > 0 ? texto.lastIndexOf("\n", inicio - 1) + 1 : 0;
    const quebra = texto.indexOf("\n", inicio);
    const ate = quebra < 0 ? texto.length : quebra;
    const linha = texto.slice(de, ate);
    const achado = REGEX_MARCA_DE_ITEM.exec(linha);
    if (!achado || inicio - de < achado[0].length) return null;
    const [inteira, citacoes, recuo, traco, espaco, caixinha, numero, espacoDoNumero] = achado;
    if (!linha.slice(inteira.length).trim()) {
      return { inicio: de, fim: ate, novo: citacoes, selecao: [de + citacoes.length, de + citacoes.length] };
    }
    const marca = numero !== undefined ? `${Number(numero) + 1}.${espacoDoNumero}` : `${traco}${espaco}${caixinha ? "[ ] " : ""}`;
    const novo = `\n${citacoes}${recuo}${marca}`;
    return { inicio, fim, novo, selecao: [inicio + novo.length, inicio + novo.length] };
  }

  // Na área de texto: Ctrl+B, Ctrl+I e o Enter nas listas
  function tecla(evento) {
    const area = evento.target;
    const comando = (evento.ctrlKey || evento.metaKey) && !evento.altKey && !evento.shiftKey;
    const letra = evento.key.toLowerCase();
    if (comando && (letra === "b" || letra === "i")) {
      evento.preventDefault();
      envolver(area, letra === "b" ? "**" : "*");
      return;
    }
    if (evento.key !== "Enter" || evento.shiftKey || evento.ctrlKey || evento.metaKey || evento.altKey || evento.isComposing) return;
    const troca = trocaDoEnter(area.value, area.selectionStart, area.selectionEnd);
    if (!troca) return;
    evento.preventDefault();
    aplicarTroca(area, troca);
  }

  // Digitar [[ abre o Citar; ![[ (com as notas), o Citar só com as notas, para embutir
  function digitou(evento) {
    const area = evento.target;
    if (evento.inputType !== "insertText" || evento.data !== "[") return;
    const posicao = area.selectionStart;
    if (posicao !== area.selectionEnd || area.value.slice(posicao - 2, posicao) !== "[[") return;
    const antes = area.value[posicao - 3];
    if (antes === "[" || antes === "\\") return;
    const embutir = antes === "!" && Boolean(notas);
    abrirCitar(area, { inicio: posicao - (embutir ? 3 : 2), fim: posicao, soNotas: embutir, embutir, digitado: true });
  }

  /* =================================================================
     Citar: links e notas embutidas
     -----------------------------------------------------------------
     O diálogo das Memórias, com os grupos Notas (com "notas"),
     Personagens, Acontecimentos, Mesas, Memórias e Lugares. Escolher
     um põe [[tipo:<id>|nome]] onde estava o cursor; o "o que aparece"
     pode ser mudado depois, no próprio texto. Aberto por [[ ou ![[
     digitados, escolher troca o que foi digitado pelo código inteiro.
     O diálogo é criado na primeira vez que abre.
     ================================================================= */

  const citacao = {
    area: null, // a área de texto que recebe o link
    inicio: 0, // o pedaço do texto que o link substitui (a seleção, ou o [[ digitado)
    fim: 0,
    soNotas: false, // só as notas, para embutir
    embutir: false, // o código fica ![[nota:…]]
    digitado: false, // aberto pelo [[ ou ![[ digitado
    escolhido: false,
    lista: null, // o que o Citar oferece, pedido de novo cada vez que ele abre
  };

  let dialogoDoCitar = null;

  function abrirCitar(area, { inicio = area.selectionStart, fim = area.selectionEnd, soNotas = false, embutir = false, digitado = false } = {}) {
    const dialogo = criarDialogoDoCitar();
    Object.assign(citacao, { area, inicio, fim, soNotas, embutir, digitado, escolhido: false });
    $("#citar-titulo").textContent = embutir ? "Embutir nota" : "Citar";
    $("#citar-rotulo").textContent = soNotas
      ? "Buscar uma nota"
      : notas
        ? "Buscar uma nota, personagem, acontecimento, mesa, memória ou lugar"
        : "Buscar um personagem, acontecimento, mesa, memória ou lugar";
    const busca = $("#citar-busca");
    busca.value = "";
    renderizarCitaveis();
    dialogo.showModal();
    $("#citar-resultados").scrollTop = 0;
    busca.focus();
    carregarCitaveis();
  }

  // A lista é pedida de novo cada vez (as notas mudam); enquanto isso, fica a da última vez
  async function carregarCitaveis() {
    try {
      citacao.lista = await pedirCitaveis();
    } catch (falha) {
      if (!citacao.lista && dialogoDoCitar.open) $("#citar-resultados").replaceChildren(criar("p", "citar__vazio", falha.message));
      return;
    }
    if (dialogoDoCitar.open) renderizarCitaveis();
  }

  function itemCitavel(nome, extra, codigo) {
    const item = criar("button", "citar__item");
    item.type = "button";
    item.append(criar("span", "citar__nome", nome));
    if (extra) item.append(criar("span", "citar__extra", extra));
    item.addEventListener("click", () => inserirCitacao(codigo));
    const linha = criar("li");
    linha.append(item);
    return linha;
  }

  function grupoCitavel(titulo, itens) {
    if (!itens.length) return [];
    const lista = criar("ul", "citar__lista");
    lista.append(...itens);
    const grupo = criar("section", "citar__grupo");
    grupo.append(criar("h3", "citar__titulo", titulo), lista);
    return [grupo];
  }

  // O "o que aparece" do link: numa linha, sem colchetes, sem barra invertida no fim e no máximo 120 caracteres
  const textoDoLink = (texto) =>
    semColchetes(texto).replace(/\s+/g, " ").trim().slice(0, LIMITE_DO_LINK).replace(/\\+$/, "").trim() || "…";

  // Sem acentos e sem diferença de maiúsculas
  function renderizarCitaveis() {
    const resultados = $("#citar-resultados");
    const focoNaLista = resultados.contains(document.activeElement);
    const citaveis = citacao.lista;
    if (!citaveis) {
      resultados.replaceChildren(criar("p", "citar__vazio", "Carregando…"));
      return;
    }
    const termo = normalizar($("#citar-busca").value.trim());
    const achou = (...textos) => !termo || textos.some((texto) => normalizar(texto).includes(termo));
    const link = (tipo, id, texto) => `[[${tipo}:${id}|${textoDoLink(texto)}]]`;

    const grupos = [];
    if (notas) {
      const atual = notas.atual();
      const itensDasNotas = (citaveis.notas ?? [])
        .filter((n) => n.id !== atual && achou(n.titulo))
        .map((n) => itemCitavel(n.titulo, notas.extra?.(n) ?? "", `${citacao.soNotas ? "!" : ""}${link("nota", n.id, n.titulo)}`));
      grupos.push(["Notas", itensDasNotas]);
    }
    if (!citacao.soNotas) {
      grupos.push(
        ["Personagens", citaveis.personagens.filter((p) => achou(p.nome)).map((p) => itemCitavel(p.nome, "", link("personagem", p.id, p.nome)))],
        [
          "Acontecimentos",
          citaveis.acontecimentos
            .filter((ev) => achou(ev.titulo))
            .map((ev) => itemCitavel(ev.titulo, Number.isFinite(ev.ano) ? `${ev.ano} ED` : "", link("evento", ev.id, ev.titulo))),
        ],
        ["Mesas", citaveis.mesas.filter((m) => achou(m.nome)).map((m) => itemCitavel(m.nome, "", link("mesa", m.id, m.nome)))],
        ["Memórias", citaveis.memorias.filter((m) => achou(m.titulo)).map((m) => itemCitavel(m.titulo, "", link("memoria", m.id, m.titulo)))],
        ["Lugares", citaveis.lugares.filter((l) => achou(l.nome, l.mapa)).map((l) => itemCitavel(l.nome, l.mapa, link("lugar", l.id, l.nome)))],
      );
    }

    const blocos = grupos.flatMap(([titulo, itens]) => grupoCitavel(titulo, itens));
    if (blocos.length) resultados.replaceChildren(...blocos);
    else {
      const nada = termo ? "Nada encontrado." : citacao.soNotas ? "Nenhuma outra nota para embutir ainda." : "Nada para citar ainda.";
      resultados.replaceChildren(criar("p", "citar__vazio", nada));
    }
    if (focoNaLista) $("#citar-busca").focus();
  }

  // O link entra onde estava o cursor (ou no lugar do que estava selecionado, ou do [[ digitado), e o
  // cursor fica depois dele. A nota embutida pelo botão entra numa linha só dela.
  function inserirCitacao(codigo) {
    const { area, inicio, fim, embutir, digitado } = citacao;
    citacao.escolhido = true;
    dialogoDoCitar.close();
    if (!area?.isConnected) return;
    const troca =
      embutir && !digitado
        ? trocaDeBloco(area.value, inicio, fim, codigo)
        : { inicio, fim, novo: codigo, selecao: [inicio + codigo.length, inicio + codigo.length] };
    aplicarTroca(area, troca);
  }

  // O diálogo, na primeira vez: o título, a busca, os resultados e o Cancelar
  function criarDialogoDoCitar() {
    if (dialogoDoCitar) return dialogoDoCitar;
    const dialogo = criar("dialog", "dialogo dialogo--citar");
    dialogo.id = "dialogo-citar";
    dialogo.setAttribute("aria-labelledby", "citar-titulo");
    const titulo = criar("h2", "dialogo__titulo", "Citar");
    titulo.id = "citar-titulo";
    const campo = criar("label", "campo");
    const rotulo = criar("span", "campo__rotulo", "Buscar");
    rotulo.id = "citar-rotulo";
    const busca = criar("input");
    busca.id = "citar-busca";
    busca.type = "search";
    busca.autocomplete = "off";
    busca.spellcheck = false;
    campo.append(rotulo, busca);
    const resultados = criar("div", "citar__resultados");
    resultados.id = "citar-resultados";
    const acoes = criar("div", "dialogo__acoes");
    const cancelar = criar("button", "botao botao--leve", "Cancelar");
    cancelar.id = "citar-cancelar";
    cancelar.type = "button";
    acoes.append(cancelar);
    dialogo.append(titulo, campo, resultados, acoes);
    document.body.append(dialogo);
    dialogoDoCitar = dialogo;

    const itens = () => [...resultados.querySelectorAll(".citar__item")];
    busca.addEventListener("input", renderizarCitaveis);
    // Enter escolhe o primeiro achado; a seta para baixo desce para a lista
    busca.addEventListener("keydown", (evento) => {
      const primeiro = itens()[0];
      if (!primeiro || (evento.key !== "Enter" && evento.key !== "ArrowDown")) return;
      evento.preventDefault();
      if (evento.key === "Enter") primeiro.click();
      else primeiro.focus();
    });
    // Na lista, as setas andam de um achado para o outro; acima do primeiro, volta para a busca
    resultados.addEventListener("keydown", (evento) => {
      if (evento.key !== "ArrowDown" && evento.key !== "ArrowUp") return;
      const lista = itens();
      const i = lista.indexOf(document.activeElement);
      if (i < 0) return;
      evento.preventDefault();
      const proximo = lista[evento.key === "ArrowDown" ? i + 1 : i - 1];
      if (proximo) proximo.focus();
      else if (evento.key === "ArrowUp") busca.focus();
    });
    cancelar.addEventListener("click", () => dialogo.close());
    fecharAoClicarFora(dialogo);
    // Esc e Cancelar: o que foi digitado fica, e o cursor volta para onde estava
    dialogo.addEventListener("close", () => {
      const { area, inicio, fim, digitado, escolhido } = citacao;
      citacao.area = null;
      if (escolhido || !area?.isConnected) return;
      area.focus({ preventScroll: true });
      area.setSelectionRange(digitado ? fim : inicio, fim);
    });
    return dialogo;
  }

  /* ---------- As imagens ---------- */

  // O tipo e o tamanho, antes de enviar
  function conferirImagem(arquivo) {
    if (!TIPOS_DE_IMAGEM.includes(arquivo.type)) throw new Error("Use imagens PNG, JPG, WEBP, GIF ou AVIF.");
    if (arquivo.size > LIMITE_DA_IMAGEM) throw new Error(`Cada imagem pode ter no máximo ${emBytes(LIMITE_DA_IMAGEM)}.`);
  }

  // ![[imagem:<id>|legenda]] numa linha só dela, onde está o cursor. A legenda começa com o nome do
  // arquivo sem a extensão. Se a área não está com o foco, a imagem entra do mesmo jeito, sem tirar o
  // foco de onde a pessoa está.
  function porImagem(id, nomeOriginal) {
    const area = areaEmEdicao();
    if (!area) return;
    const legenda = textoDoLink(nomeOriginal.replace(/\.[^.]*$/, "")).replace(/^…$/, "");
    const codigo = legenda ? `![[imagem:${id}|${legenda}]]` : `![[imagem:${id}]]`;
    const posicao = area.selectionEnd;
    aplicarTroca(area, trocaDeBloco(area.value, posicao, posicao, codigo), { foco: document.activeElement === area });
  }

  // Fecha o menu do Título e o Citar, se estiverem abertos
  function fechar() {
    fecharMenuDeTitulo({ devolverFoco: false });
    if (dialogoDoCitar?.open) dialogoDoCitar.close();
  }

  return { barra, tecla, digitou, abrirCitar, porImagem, conferirImagem, textoDoLink, fechar };
}
