/* =================================================================
   Crônicas Eternas: as marcas do texto das notas
   -----------------------------------------------------------------
   O texto das notas do Caderno tem marcas parecidas com as do
   Markdown (títulos, negrito, itálico, riscado, listas, tarefas,
   citações, separadores, tabelas, etiquetas e links) e os códigos
   do portal: imagens, links para notas e para outras páginas e
   notas embutidas. Aqui o texto vira elementos da página, sempre
   com criar() e textContent: o texto nunca vira HTML, e os
   endereços dos links são feitos aqui, a partir do id.

   Usado pela página do Caderno e pela leitura pública, carregado
   depois do comum.js (usa criar(), imagem() e enderecoDaPagina()):

     <script src="../comum.js" defer></script>
     <script src="../marcas.js" defer></script>

   Declara um nome só, que nenhuma página pode declarar de novo:

     desenharMarcas(texto, { links, embutidas, imagens }, opcoes)

   Devolve a lista de elementos, para pôr dentro de um elemento com
   a classe "marcas" (o estilo fica no marcas.css). "links",
   "embutidas" e "imagens" são o que o servidor mandou com a nota.
   As opções, todas opcionais:
     idDaNota                a nota desenhada: a que embute a si
                             mesma mostra só o link
     aoAbrirNota(id)         o clique comum num link de nota (com
                             Ctrl, Shift e afins, o navegador faz o
                             de sempre)
     aoClicarEtiqueta(nome)  com ela, a etiqueta vira botão
     aoMarcarTarefa(linha, marcada, caixa)  com ela, a caixinha da
                             tarefa pode ser marcada; sem ela, fica
                             só para ver
   E, como propriedade da mesma função, o endereço de uma coisa do
   portal (o mesmo dos links), que o grafo do Caderno usa:

     desenharMarcas.enderecoDoPortal(tipo, id)

   Cada caixinha leva em data-linha o número da linha da tarefa no
   texto (a primeira linha é 0).

   O que vira link, nota embutida, imagem ou etiqueta segue as
   regras do servidor/caderno.js, que lê o texto do mesmo jeito.
   ================================================================= */

const desenharMarcas = (() => {
  /* ---------- Escapes ---------- */

  // Uma barra invertida antes de uma marca mostra a marca como texto. Como no servidor, a dupla
  // (barra e caractere) vira dois caracteres de uso privado, que não casam com nenhuma marca, e só
  // volta a ser o caractere na hora de virar texto na página.
  const REGEX_ESCAPE = /\\([*~#[\]|\->\\])/g;
  const REGEX_PROTEGIDO = /([-])/g;
  const proteger = (texto) =>
    texto.replace(REGEX_ESCAPE, (_, ch) => `${String.fromCharCode(0xe000 + ch.charCodeAt(0))}`);
  const desproteger = (texto) => texto.replace(REGEX_PROTEGIDO, (_, ch) => String.fromCharCode(ch.charCodeAt(0) - 0xe000));

  /* ---------- O que cada linha pode ser ---------- */

  const LINHA_EMBUTIDA = /^[ \t]*!\[\[nota:([^\]|\n]+)\|([^\]\n]*)\]\][ \t]*$/; // ![[nota:<id>|…]] sozinho
  const LINHA_TITULO = /^[ \t]*(#+)[ \t]+(.*\S)[ \t]*$/; // # Título (com espaço depois)
  const LINHA_SEPARADOR = /^[ \t]*(?:-{3,}|\*{3,}|_{3,})[ \t]*$/; // ---, *** ou ___ sozinhos
  const LINHA_TRACOS = /^[ \t]*\|?(?:[ \t]*:?-+:?[ \t]*\|)+(?:[ \t]*:?-+:?[ \t]*)?$/; // | --- | :---: |
  const LINHA_DA_TABELA = /^[ \t]*\|/;
  const LINHA_CITACAO = /^[ \t]*>[ \t]?(.*)$/;
  const LINHA_ITEM = /^([ \t]*)([-*]|\d{1,9}\.)[ \t]+(.*)$/; // - item, * item, 1. item
  const TAREFA = /^\[([ xX])\](?:[ \t]+(.*))?$/; // o começo do item: [ ] ou [x]
  const CODIGOS = /!?\[\[[^\]\n]*\]\]/g; // qualquer [[…]]: as barras de dentro não separam células

  const MAXIMO_DE_NIVEIS = 3; // item dentro de item, numa lista
  const MAXIMO_DE_CITACOES = 4; // citação dentro de citação

  /* ---------- O que vem dentro de uma linha ---------- */

  // Os "átomos": o que não tem marca dentro. Na ordem: imagem, link do portal (com o "!" no meio
  // da linha, a nota embutida vira link), outro código [[…]] (fica como texto), [texto](https://…)
  // e o endereço solto.
  const REGEX_ATOMO = new RegExp(
    [
      String.raw`!\[\[imagem:([^\]|\n]+)(?:\|([^\]\n]*))?\]\]`,
      String.raw`!?\[\[(nota|personagem|evento|mesa|memoria|lugar):([^\]|\n]+)\|([^\]\n]*)\]\]`,
      String.raw`!?\[\[[^\]\n]*\]\]`,
      String.raw`\[([^\]\n]*)\]\((https?:\/\/[^)\s]*)\)`,
      String.raw`https?:\/\/\S+`,
    ].join("|"),
    "g",
  );
  // #etiqueta: no começo da linha ou depois de um espaço ou de um parêntese
  const REGEX_ETIQUETA = /(^|[\s(])#([\p{L}\p{M}\p{N}_/-]+)/gu;
  const MAXIMO_DA_ETIQUETA = 60;

  const temAlvo = (mapa, chave) => Boolean(mapa) && Object.hasOwn(mapa, chave);
  const codificar = encodeURIComponent;

  function nosDeTexto(texto) {
    const nos = [];
    texto.split("\n").forEach((linha, i) => {
      if (i) nos.push(criar("br"));
      if (linha) nos.push(document.createTextNode(desproteger(linha)));
    });
    return nos;
  }

  // O clique comum fica com a página; com Ctrl, Shift, o botão do meio e afins, continua um link
  function aoClicarComum(link, acao) {
    link.addEventListener("click", (evento) => {
      if (evento.button !== 0 || evento.ctrlKey || evento.metaKey || evento.shiftKey || evento.altKey) return;
      evento.preventDefault();
      acao();
    });
  }

  // O endereço de um personagem, acontecimento, mesa, memória ou lugar ("<mapa>/<marca>"), a partir do id
  function enderecoDoPortal(tipo, id) {
    if (tipo === "personagem") return `${enderecoDaPagina("personagens")}#personagem-${codificar(id)}`;
    if (tipo === "evento") return `${enderecoDaPagina("linha")}#evento-${codificar(id)}`;
    if (tipo === "mesa") return `${enderecoDaPagina("personagens")}#mesa-${codificar(id)}`;
    if (tipo === "memoria") return `${enderecoDaPagina("memorias")}#memoria-${codificar(id)}`;
    const [mapa, marca = ""] = id.split("/");
    return `${enderecoDaPagina("mapas")}#${codificar(mapa)}/${codificar(marca)}`;
  }

  // [[tipo:<id>|o que aparece]]: vira link só quando quem lê vê o alvo; senão, fica o texto
  function linkDoPortal(tipo, id, aparece, ctx) {
    const chave = `${tipo}:${id}`;
    if (!temAlvo(ctx.links, chave)) return document.createTextNode(aparece);
    const alvo = ctx.links[chave];
    const limpo = desproteger(id);
    const link = criar("a", "marcas__link", aparece);
    if (tipo === "nota") {
      link.href = alvo.publico || `${enderecoDaPagina("caderno")}#nota-${codificar(limpo)}`;
      link.title = `No Caderno: ${alvo.titulo}`;
      if (ctx.aoAbrirNota && !alvo.publico) aoClicarComum(link, () => ctx.aoAbrirNota(limpo));
    } else {
      link.href = enderecoDoPortal(tipo, limpo);
      if (tipo === "personagem") link.title = `Nos Personagens: ${alvo.nome}`;
      else if (tipo === "evento") link.title = `Na Linha do Tempo: ${alvo.titulo}`;
      else if (tipo === "mesa") link.title = `Nos Personagens: a mesa ${alvo.nome}`;
      else if (tipo === "memoria") link.title = `Nas Memórias de Draevor: ${alvo.titulo}`;
      else link.title = `No mapa ${alvo.mapa}: ${alvo.nome}`;
    }
    return link;
  }

  // Um link para fora do portal: só http e https, em outra aba. O resto fica como estava escrito.
  function linkDeFora(texto, endereco, comoEstava) {
    let valido = false;
    try {
      valido = ["http:", "https:"].includes(new URL(endereco).protocol);
    } catch {
      valido = false;
    }
    if (!valido) return document.createTextNode(comoEstava);
    const link = criar("a", "marcas__link marcas__link--fora", texto || endereco);
    link.href = endereco;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    return link;
  }

  // O endereço solto não leva a pontuação do fim da frase nem um ")" sem par
  function cortarEndereco(endereco) {
    let fim = endereco.length;
    while (fim > 0) {
      const ch = endereco[fim - 1];
      if (/[.,;:!?*~'"]/.test(ch)) {
        fim--;
        continue;
      }
      if (ch === ")") {
        const parte = endereco.slice(0, fim);
        if ((parte.match(/\)/g) || []).length > (parte.match(/\(/g) || []).length) {
          fim--;
          continue;
        }
      }
      break;
    }
    return endereco.slice(0, fim);
  }

  // ![[imagem:<id>|legenda]]: só as imagens que o servidor mandou (as do próprio caderno da nota).
  // As outras, e as que não carregam, ficam só com a legenda.
  const imagensDesenhadas = new WeakSet();
  function imagemDaNota(id, legenda, ctx) {
    const caixa = criar("span", "marcas__imagem");
    imagensDesenhadas.add(caixa);
    const soALegenda = () => {
      caixa.className = "marcas__imagem marcas__imagem--ausente";
      caixa.replaceChildren(...(legenda ? [criar("span", "marcas__legenda", legenda)] : []));
    };
    if (!temAlvo(ctx.imagens, id)) {
      soALegenda();
      return caixa;
    }
    const endereco = ctx.imagens[id];
    const link = criar("a", "marcas__imagem-link");
    link.href = endereco;
    link.target = "_blank";
    link.rel = "noopener";
    const foto = imagem(endereco, "marcas__foto", legenda || "Imagem da nota");
    foto.loading = "lazy";
    foto.addEventListener("error", soALegenda, { once: true });
    link.append(foto);
    caixa.append(link);
    if (legenda) {
      // A legenda já é o texto alternativo da imagem: os leitores de tela não a leem duas vezes
      const texto = criar("span", "marcas__legenda", legenda);
      texto.setAttribute("aria-hidden", "true");
      caixa.append(texto);
    }
    return caixa;
  }

  function etiqueta(nome, ctx) {
    const texto = `#${nome}`;
    if (!ctx.aoClicarEtiqueta) return criar("span", "marcas__etiqueta", texto);
    const placa = criar("button", "marcas__etiqueta", texto);
    placa.type = "button";
    placa.addEventListener("click", () => ctx.aoClicarEtiqueta(nome));
    return placa;
  }

  // As etiquetas de um pedaço de texto entre átomos. "antes" é o caractere logo antes do pedaço
  // ("" no começo): ele decide se um "#" logo no começo do pedaço é etiqueta.
  function etiquetasNoPedaco(texto, antes, ctx, pedacos) {
    const fonte = antes + texto;
    let ultimo = antes.length;
    for (const achado of fonte.matchAll(REGEX_ETIQUETA)) {
      const nome = achado[2];
      if (nome.length > MAXIMO_DA_ETIQUETA || !/\p{L}/u.test(nome)) continue;
      const inicio = achado.index + achado[1].length;
      if (inicio > ultimo) pedacos.push(fonte.slice(ultimo, inicio));
      pedacos.push(etiqueta(nome, ctx));
      ultimo = inicio + 1 + nome.length;
    }
    if (ultimo < fonte.length) pedacos.push(fonte.slice(ultimo));
  }

  // O texto de uma linha (ou de um parágrafo) em pedaços: os átomos já como elementos e o
  // resto como texto, onde ainda podem estar o negrito, o itálico e o riscado
  function pedacosDaLinha(texto, antes, ctx) {
    const pedacos = [];
    let ultimo = 0;
    let anterior = antes;
    for (const achado of texto.matchAll(REGEX_ATOMO)) {
      const [inteiro, imagemId, legenda, tipo, id, aparece, textoDoLink, endereco] = achado;
      let fim = achado.index + inteiro.length;
      let no;
      if (imagemId !== undefined) no = imagemDaNota(imagemId, desproteger(legenda ?? "").trim(), ctx);
      else if (tipo !== undefined) no = linkDoPortal(tipo, id, desproteger(aparece), ctx);
      else if (endereco !== undefined) no = linkDeFora(desproteger(textoDoLink), desproteger(endereco), desproteger(inteiro));
      else if (inteiro.startsWith("http")) {
        const cortado = cortarEndereco(inteiro);
        fim = achado.index + cortado.length; // a pontuação do fim volta para o texto
        const limpo = desproteger(cortado);
        no = linkDeFora("", limpo, limpo);
      } else no = document.createTextNode(desproteger(inteiro)); // outro [[…]]: como está escrito
      etiquetasNoPedaco(texto.slice(ultimo, achado.index), anterior, ctx, pedacos);
      pedacos.push(no);
      ultimo = fim;
      anterior = texto[fim - 1];
    }
    etiquetasNoPedaco(texto.slice(ultimo), anterior, ctx, pedacos);
    return pedacos;
  }

  // **negrito**, *itálico* e ~~riscado~~, que podem se combinar. Cada sequência de * ou ~ pode abrir
  // (se o que vem depois não é espaço) e fechar (se o que vem antes não é espaço). Quem fecha
  // procura para trás a que abre mais perto, como no CommonMark. O que não fecha fica como texto.
  function enfatizar(pedacos) {
    const itens = [];
    for (const pedaco of pedacos) {
      if (typeof pedaco !== "string") {
        itens.push({ no: pedaco });
        continue;
      }
      for (const parte of pedaco.split(/(\*+|~+)/)) {
        if (!parte) continue;
        if (parte[0] === "*" || parte[0] === "~") itens.push({ marca: parte[0], n: parte.length });
        else itens.push({ texto: parte });
      }
    }
    // O caractere do lado de uma marca: um elemento conta como letra
    const lado = (item, doFim) => {
      if (!item) return "";
      if (item.no) return "x";
      if (item.marca) return item.marca;
      return doFim ? item.texto[item.texto.length - 1] : item.texto[0];
    };
    itens.forEach((item, i) => {
      if (!item.marca) return;
      const serve = item.marca === "*" || item.n >= 2; // um ~ sozinho é só um ~
      const antes = lado(itens[i - 1], true);
      const depois = lado(itens[i + 1], false);
      item.abre = serve && depois !== "" && !/\s/.test(depois);
      item.fecha = serve && antes !== "" && !/\s/.test(antes);
    });

    const casa = (abre, fecha) => abre.marca === fecha.marca && abre.abre && abre.n > 0 && (abre.marca === "*" || abre.n >= 2);
    for (let i = 0; i < itens.length; i++) {
      const fecha = itens[i];
      if (!fecha.marca || !fecha.fecha) continue;
      while (fecha.n > 0 && (fecha.marca === "*" || fecha.n >= 2)) {
        let j = i - 1;
        while (j >= 0 && !casa(itens[j], fecha)) j--;
        if (j < 0) break;
        const abre = itens[j];
        const usa = fecha.marca === "~" || (abre.n >= 2 && fecha.n >= 2) ? 2 : 1;
        const elemento = criar(fecha.marca === "~" ? "s" : usa === 2 ? "strong" : "em");
        elemento.append(...nosDosItens(itens.slice(j + 1, i)));
        itens.splice(j + 1, i - j - 1, { no: elemento });
        abre.n -= usa;
        fecha.n -= usa;
        i = j + 2;
        if (!abre.n) {
          itens.splice(j, 1);
          i -= 1;
        }
      }
      if (!fecha.n) {
        itens.splice(i, 1);
        i -= 1;
      }
    }
    return nosDosItens(itens);
  }

  function nosDosItens(itens) {
    const nos = [];
    for (const item of itens) {
      if (item.no) nos.push(item.no);
      else nos.push(...nosDeTexto(item.marca ? item.marca.repeat(item.n) : item.texto));
    }
    return nos;
  }

  const marcasDaLinha = (texto, antes, ctx) => enfatizar(pedacosDaLinha(texto, antes, ctx));

  /* ---------- Os blocos ---------- */

  // As linhas do texto, já com os escapes protegidos. "numero" é a linha no texto original.
  const linhasDe = (texto) =>
    proteger(String(texto ?? "").replace(/\r\n?/g, "\n"))
      .split("\n")
      .map((linha, numero) => ({ texto: linha, numero }));

  // A imagem já ocupa a linha dela: a quebra de linha encostada nela sobra
  function paragrafoCom(nos) {
    const p = criar("p", "marcas__paragrafo");
    const ehQuebra = (no) => no?.tagName === "BR";
    p.append(
      ...nos.filter((no, i) => !ehQuebra(no) || !(imagensDesenhadas.has(nos[i - 1]) || imagensDesenhadas.has(nos[i + 1]))),
    );
    return p;
  }

  function titulo(cerquilhas, conteudo, ctx) {
    const nivel = Math.min(cerquilhas, 3);
    // O título da nota é o h1 da página: os do texto começam no h2
    const elemento = criar(`h${nivel + 1}`, `marcas__titulo marcas__titulo--${nivel}`);
    elemento.append(...marcasDaLinha(conteudo, " ", ctx));
    return elemento;
  }

  // ![[nota:<id>|…]] sozinho na linha: a outra nota inteira, numa moldura. Só um nível, fora das
  // citações; a que embute a si mesma, a embutida dentro da embutida e a que quem lê não pode ler
  // ficam como link (ou só o texto, se nem o link veio).
  function notaEmbutida(id, aparece, ctx) {
    const embute = ctx.nivel === 0 && ctx.citacoes === 0 && id !== ctx.idDaNota && temAlvo(ctx.embutidas, id);
    if (!embute) return paragrafoCom([linkDoPortal("nota", id, aparece, ctx)]);
    const outra = ctx.embutidas[id];
    const moldura = criar("div", "marcas__embutida");
    const cabeca = criar("p", "marcas__embutida-titulo");
    cabeca.append(linkDoPortal("nota", id, outra.titulo, ctx));
    const corpo = criar("div", "marcas marcas__embutida-texto");
    corpo.append(...lerBlocos(linhasDe(outra.texto), { ...ctx, nivel: 1, citacoes: 0, idDaNota: id, aoMarcarTarefa: null }));
    moldura.append(cabeca, corpo);
    return moldura;
  }

  /* Tabela: o cabeçalho, a linha de traços e as linhas que começam com "|" */

  const comecaTabela = (linhas, i) =>
    i + 1 < linhas.length && linhas[i].texto.replace(CODIGOS, "").includes("|") && LINHA_TRACOS.test(linhas[i + 1].texto);

  // As células de uma linha, sem quebrar os códigos [[…|…]]. "antes" é o caractere antes da célula.
  function celulasDa(linha) {
    const guardados = [];
    let resto = linha
      .replace(CODIGOS, (codigo) => {
        guardados.push(codigo);
        return `${guardados.length - 1}`;
      })
      .trim();
    const comBarra = resto.startsWith("|");
    if (comBarra) resto = resto.slice(1);
    if (resto.endsWith("|")) resto = resto.slice(0, -1);
    return resto.split("|").map((celula, i) => ({
      texto: celula.replace(/(\d+)/g, (_, n) => guardados[Number(n)]),
      antes: i || comBarra ? "|" : "",
    }));
  }

  // :--- esquerda, :---: centro, ---: direita
  function alinhamentoDe({ texto }) {
    const tracos = texto.trim();
    if (tracos.startsWith(":") && tracos.endsWith(":")) return "centro";
    return tracos.endsWith(":") ? "direita" : null;
  }

  function tabela(linhas, i, ctx, blocos) {
    const alinhamentos = celulasDa(linhas[i + 1].texto).map(alinhamentoDe);
    const linhaDaTabela = (texto, tag) => {
      const tr = criar("tr");
      const celulas = celulasDa(texto);
      alinhamentos.forEach((alinhamento, c) => {
        const celula = criar(tag, alinhamento ? `marcas__celula--${alinhamento}` : null);
        if (tag === "th") celula.setAttribute("scope", "col");
        if (celulas[c]) celula.append(...marcasDaLinha(celulas[c].texto, celulas[c].antes, ctx));
        tr.append(celula);
      });
      return tr;
    };
    const grade = criar("table");
    const cabeca = criar("thead");
    cabeca.append(linhaDaTabela(linhas[i].texto, "th"));
    grade.append(cabeca);
    let j = i + 2;
    const corpo = criar("tbody");
    while (j < linhas.length && LINHA_DA_TABELA.test(linhas[j].texto)) {
      corpo.append(linhaDaTabela(linhas[j].texto, "td"));
      j++;
    }
    if (j > i + 2) grade.append(corpo);
    const caixa = criar("div", "marcas__tabela"); // rola de lado sozinha, se a tabela for larga
    caixa.append(grade);
    blocos.push(caixa);
    return j;
  }

  // As linhas seguidas que começam com ">", lidas de novo como blocos
  function citacao(linhas, i, ctx, blocos) {
    const dentro = [];
    let j = i;
    for (; j < linhas.length; j++) {
      const achado = LINHA_CITACAO.exec(linhas[j].texto);
      if (!achado) break;
      dentro.push({ texto: achado[1], numero: linhas[j].numero });
    }
    const bloco = criar("blockquote", "marcas__citacao");
    bloco.append(...lerBlocos(dentro, { ...ctx, citacoes: ctx.citacoes + 1 }));
    blocos.push(bloco);
    return j;
  }

  /* Listas: o recuo (2 espaços ou um Tab) põe o item dentro do anterior */

  const recuoDe = (espacos) => [...espacos].reduce((soma, ch) => soma + (ch === "\t" ? 2 : 1), 0);

  function itemDaLista(conteudo, numerada, numeroDaLinha, ctx) {
    const item = criar("li");
    const tarefa = numerada ? null : TAREFA.exec(conteudo);
    if (!tarefa) {
      item.append(...marcasDaLinha(conteudo, " ", ctx));
      return item;
    }
    const feita = tarefa[1] !== " ";
    item.className = feita ? "marcas__tarefa marcas__tarefa--feita" : "marcas__tarefa";
    const texto = criar("span", "marcas__tarefa-texto");
    texto.append(...marcasDaLinha(tarefa[2] ?? "", " ", ctx));

    // A caixinha do portal (a .caixa do style.css), com a linha da tarefa no texto
    const caixa = criar("label", "caixa marcas__caixa");
    const marcar = criar("input");
    marcar.type = "checkbox";
    marcar.checked = feita;
    marcar.dataset.linha = String(numeroDaLinha);
    marcar.setAttribute("aria-label", texto.textContent.trim() || "Tarefa");
    if (ctx.aoMarcarTarefa) marcar.addEventListener("change", () => ctx.aoMarcarTarefa(numeroDaLinha, marcar.checked, marcar));
    else marcar.disabled = true;
    const marca = criar("span", "caixa__marca");
    marca.setAttribute("aria-hidden", "true");
    caixa.append(marcar, marca);
    item.append(caixa, texto);
    return item;
  }

  // Os itens seguidos, numa lista (ou mais, quando muda de "-" para "1." no mesmo nível).
  // O nível vem do recuo em relação ao primeiro item, no máximo um a mais que o item anterior.
  function listas(linhas, i, ctx, blocos) {
    const abertas = []; // abertas[nivel] = { lista, numerada, ultimo }
    let base = null;
    let anterior = -1;
    let j = i;
    for (; j < linhas.length; j++) {
      const achado = LINHA_ITEM.exec(linhas[j].texto);
      if (!achado) break;
      const [, espacos, marcador, conteudo] = achado;
      const recuo = recuoDe(espacos);
      base ??= recuo;
      const nivel = Math.max(0, Math.min(Math.floor((recuo - base) / 2), anterior + 1, MAXIMO_DE_NIVEIS - 1));
      const numerada = marcador !== "-" && marcador !== "*";
      abertas.length = Math.min(abertas.length, nivel + 1);
      let atual = abertas[nivel];
      if (!atual || atual.numerada !== numerada) {
        const lista = criar(numerada ? "ol" : "ul", "marcas__lista");
        const primeiro = numerada ? parseInt(marcador, 10) : 1;
        if (primeiro !== 1) lista.start = primeiro;
        if (nivel === 0) blocos.push(lista);
        else abertas[nivel - 1].ultimo.append(lista);
        atual = { lista, numerada, ultimo: null };
        abertas[nivel] = atual;
      }
      const item = itemDaLista(conteudo, numerada, linhas[j].numero, ctx);
      atual.lista.append(item);
      atual.ultimo = item;
      anterior = nivel;
    }
    return j;
  }

  // Uma linha em branco separa os blocos. A lista, o título, a citação, a tabela, o separador e a
  // nota embutida começam mesmo logo abaixo de um parágrafo. Dentro do parágrafo, a quebra fica.
  function lerBlocos(linhas, ctx) {
    const blocos = [];
    let paragrafo = [];
    const fecharParagrafo = () => {
      if (!paragrafo.length) return;
      blocos.push(paragrafoCom(marcasDaLinha(paragrafo.map((l) => l.texto.trim()).join("\n"), "", ctx)));
      paragrafo = [];
    };

    let i = 0;
    while (i < linhas.length) {
      const { texto } = linhas[i];
      let achado;
      if (!texto.trim()) {
        fecharParagrafo();
        i++;
        continue;
      }
      if ((achado = LINHA_EMBUTIDA.exec(texto))) {
        fecharParagrafo();
        blocos.push(notaEmbutida(achado[1], desproteger(achado[2]), ctx));
        i++;
      } else if ((achado = LINHA_TITULO.exec(texto))) {
        fecharParagrafo();
        blocos.push(titulo(achado[1].length, achado[2], ctx));
        i++;
      } else if (LINHA_SEPARADOR.test(texto)) {
        fecharParagrafo();
        blocos.push(criar("hr", "marcas__separador"));
        i++;
      } else if (comecaTabela(linhas, i)) {
        fecharParagrafo();
        i = tabela(linhas, i, ctx, blocos);
      } else if (ctx.citacoes < MAXIMO_DE_CITACOES && LINHA_CITACAO.test(texto)) {
        fecharParagrafo();
        i = citacao(linhas, i, ctx, blocos);
      } else if (LINHA_ITEM.test(texto)) {
        fecharParagrafo();
        i = listas(linhas, i, ctx, blocos);
      } else {
        paragrafo.push(linhas[i]);
        i++;
      }
    }
    fecharParagrafo();
    return blocos;
  }

  function desenharMarcas(texto, conteudo = {}, opcoes = {}) {
    const ctx = {
      links: conteudo?.links ?? {},
      embutidas: conteudo?.embutidas ?? {},
      imagens: conteudo?.imagens ?? {},
      idDaNota: opcoes.idDaNota ?? null,
      aoAbrirNota: opcoes.aoAbrirNota ?? null,
      aoClicarEtiqueta: opcoes.aoClicarEtiqueta ?? null,
      aoMarcarTarefa: opcoes.aoMarcarTarefa ?? null,
      nivel: 0, // 1 dentro de uma nota embutida
      citacoes: 0, // quantas citações em volta
    };
    return lerBlocos(linhasDe(texto), ctx);
  }

  // O grafo do Caderno usa os mesmos endereços dos links
  desenharMarcas.enderecoDoPortal = enderecoDoPortal;
  return desenharMarcas;
})();
