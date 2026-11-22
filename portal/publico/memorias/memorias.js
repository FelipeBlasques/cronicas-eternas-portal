/* =================================================================
   Crônicas Eternas: Memórias de Draevor
   -----------------------------------------------------------------
   Os textos do cenário: cartas, contos, recortes, livros e outros
   escritos que os personagens encontram. A entrada é uma biblioteca:
   os livros numa estante e os outros escritos numa mesa, cada um
   com a cara da classificação; clicar num deles troca a biblioteca
   pela leitura, com
   endereço próprio (#memoria-<id>). O texto pode mencionar
   acontecimentos da Linha do Tempo e personagens da galeria com
   links. Só o administrador escreve, altera, apaga e revela as
   memórias.

   O Livro é um PDF (o miolo, e as imagens opcionais da capa, da
   lombada e da contracapa): abre no folheador (folheador.js), com
   o índice à direita, e cada página tem endereço próprio
   (#memoria-<id>-pagina-<n>). Os livros antigos, escritos por
   capítulos, continuam com a capa, o índice e os capítulos de antes
   (#memoria-<id>-capitulo-<n>) até o PDF chegar.

   No servidor, conversa com o servidor/memorias.js. Aberta fora dele
   (arquivo no PC ou prévia), usa memórias de exemplo e um painel
   para ver a página como administrador, editor ou jogador.

   Usa o comum.js, carregado antes: pedir(), criar(), avisos, barra
   lateral, status do Foundry, texto formatado, fontes e cinzas. Do
   calendario.js, textoDaData() e chaveDaData(). Do folheador.js,
   criarFolheador(), carregarPdfJs(), OPCOES_DO_PDF e lerInfoDoPdf().
   ================================================================= */

const CONFIG = {
  intervaloStatus: 15000, // tempo entre consultas ao estado do Foundry, em ms
};

// As classificações, com o rótulo do campo "detalhe" de cada uma (null: não tem o campo)
// e as fontes que a cara dela usa, da lista FONTES do comum.js (a Gótica e a Alegreya
// já vêm com a página)
const TIPOS_DE_MEMORIA = [
  { id: "carta", nome: "Carta", detalhe: "Assinatura", fontes: ["caligrafia", "pena"] },
  { id: "conto", nome: "Conto", detalhe: null, fontes: [] },
  { id: "diario", nome: "Diário", detalhe: null, fontes: ["caligrafia"] },
  { id: "recorte", nome: "Recorte", detalhe: "Recortado de", fontes: ["fraktur", "tinta"] },
  { id: "trecho", nome: "Trecho de livro", detalhe: "Do livro", fontes: ["tinta"] },
  { id: "livro", nome: "Livro", detalhe: null, fontes: [] },
  { id: "poema", nome: "Poema ou canção", detalhe: null, fontes: [] },
  { id: "documento", nome: "Documento", detalhe: "Emitido por", fontes: ["romana"] },
  { id: "inscricao", nome: "Inscrição", detalhe: "Onde está gravada", fontes: ["romana"] },
];

const tipoDeMemoria = (id) => TIPOS_DE_MEMORIA.find((t) => t.id === id);

// Uma menção no texto: [[evento:<id>|o que aparece]] ou [[personagem:<id>|o que aparece]]
const REGEX_LINK = /\[\[(evento|personagem):([^\]|\n]+)\|([^\]\n]*)\]\]/g;

/* =================================================================
   Conversa com o servidor
   ================================================================= */

// Manda um arquivo cru (o PDF do miolo ou uma imagem do livro), com o andamento do envio.
// O fetch não conta o que já subiu; o XMLHttpRequest conta.
function enviarArquivo(metodo, caminho, arquivo, tipo, aoProgredir) {
  return new Promise((resolver, rejeitar) => {
    const pedido = new XMLHttpRequest();
    pedido.open(metodo, caminho);
    pedido.setRequestHeader("Content-Type", tipo);
    pedido.setRequestHeader("Accept", "application/json");
    pedido.upload.addEventListener("progress", (evento) => {
      if (evento.lengthComputable) aoProgredir?.(evento.loaded / evento.total);
    });
    pedido.addEventListener("load", () => {
      let dados = null;
      try {
        dados = JSON.parse(pedido.responseText);
      } catch {
        // o nginx responde em HTML quando o arquivo passa do limite dele
      }
      if (pedido.status >= 200 && pedido.status < 300) return resolver(dados);
      if (dados?.codigo === "sem-sessao") aoPerderSessao();
      const mensagem =
        dados?.erro ||
        (pedido.status === 413 ? "O arquivo passou do tamanho que o servidor aceita." : "O portal não respondeu como esperado. Tente de novo em instantes.");
      rejeitar(erroComCodigo(mensagem, dados?.codigo, dados));
    });
    pedido.addEventListener("error", () => rejeitar(erroComCodigo("Sem conexão com o portal. Confira sua internet e tente de novo.", "rede")));
    pedido.send(arquivo);
  });
}

const caminhoDoLivro = (id, parte) => `${caminhoDe("/api/memorias", id)}/livro/${parte}`;
const numerosNoEndereco = (numeros) => new URLSearchParams(Object.entries(numeros).map(([nome, valor]) => [nome, String(valor)])).toString();

const apiDoServidor = {
  memorias: () => pedir("GET", "/api/memorias"),
  memoria: (id) => pedir("GET", caminhoDe("/api/memorias", id)),
  escrever: (dados) => pedir("POST", "/api/memorias", dados),
  alterar: (id, dados) => pedir("PUT", caminhoDe("/api/memorias", id), dados),
  apagar: (id) => pedir("DELETE", caminhoDe("/api/memorias", id)),
  revelar: (id, escolha) => pedir("PUT", `${caminhoDe("/api/memorias", id)}/revelacao`, escolha),
  // O livro: o PDF (com as páginas e o tamanho que o pdf.js leu aqui), as imagens e o índice
  enviarMiolo: (id, arquivo, info, aoProgredir) =>
    enviarArquivo("PUT", `${caminhoDoLivro(id, "miolo")}?${numerosNoEndereco(info)}`, arquivo, "application/pdf", aoProgredir),
  enviarImagem: (id, parte, arquivo, medidas, aoProgredir) =>
    enviarArquivo("PUT", `${caminhoDoLivro(id, parte)}?${numerosNoEndereco(medidas)}`, arquivo, arquivo.type, aoProgredir),
  tirarImagem: (id, parte) => pedir("DELETE", caminhoDoLivro(id, parte)),
  salvarIndice: (id, indice) => pedir("PUT", caminhoDoLivro(id, "indice"), { indice }),
  // O pdf.js lê o PDF pela rota protegida, só os pedaços que precisa
  abrirPdf: async (memoria) => (await carregarPdfJs()).getDocument({ ...OPCOES_DO_PDF, url: memoria.livro.miolo.endereco }).promise,
  enderecoParaBaixar: (memoria) => `${memoria.livro.miolo.endereco}?baixar=1`,
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

/* ---------- Os livros de exemplo: um PDF feito aqui mesmo ---------- */

// Um PDF pequeno, escrito à mão: páginas de papel antigo com texto na fonte Times (que o PDF não
// leva dentro; o pdf.js usa a do sistema). Cada página é uma lista de linhas
// { texto, fonte: "F1" (normal) | "F2" (itálico) | "F3" (negrito), tamanho, y, x ou centro }
// e de fios { fio: [x1, y1, x2, y2] }.
function pdfDaPrevia(paginas, { largura = 420, altura = 595 } = {}) {
  // WinAnsi: o Latin-1 serve para os acentos; alguns sinais têm lugar próprio
  const ESPECIAIS = { "—": 0x97, "–": 0x96, "…": 0x85, "“": 0x93, "”": 0x94, "‘": 0x91, "’": 0x92 };
  const textoDoPdf = (texto) =>
    [...texto]
      .map((c) => {
        if (c === "\\" || c === "(" || c === ")") return `\\${c}`;
        if (ESPECIAIS[c]) return String.fromCharCode(ESPECIAIS[c]);
        return c.charCodeAt(0) <= 0xff ? c : "?";
      })
      .join("");
  const numero = (n) => String(Math.round(n * 100) / 100);
  const objetos = [];
  const novo = (corpo) => objetos.push(corpo);
  const catalogo = novo(null);
  const raizDasPaginas = novo(null);
  const fontes = ["Times-Roman", "Times-Italic", "Times-Bold"].map((nome) =>
    novo(`<< /Type /Font /Subtype /Type1 /BaseFont /${nome} /Encoding /WinAnsiEncoding >>`),
  );
  const recursos = `<< /Font << ${fontes.map((n, i) => `/F${i + 1} ${n} 0 R`).join(" ")} >> >>`;
  const filhos = paginas.map((linhas) => {
    const partes = [`0.98 0.96 0.9 rg 0 0 ${largura} ${altura} re f`, "0.2 0.15 0.1 rg 0.45 0.35 0.25 RG"];
    for (const linha of linhas) {
      if (linha.fio) {
        const [x1, y1, x2, y2] = linha.fio.map(numero);
        partes.push(`0.6 w ${x1} ${y1} m ${x2} ${y2} l S`);
        continue;
      }
      const x = linha.centro ? (largura - linha.texto.length * linha.tamanho * 0.46) / 2 : linha.x;
      partes.push(`BT /${linha.fonte} ${numero(linha.tamanho)} Tf ${numero(x)} ${numero(linha.y)} Td (${textoDoPdf(linha.texto)}) Tj ET`);
    }
    const fluxo = partes.join("\n");
    const conteudo = novo(`<< /Length ${fluxo.length} >>\nstream\n${fluxo}\nendstream`);
    return novo(`<< /Type /Page /Parent ${raizDasPaginas} 0 R /MediaBox [0 0 ${largura} ${altura}] /Resources ${recursos} /Contents ${conteudo} 0 R >>`);
  });
  objetos[catalogo - 1] = `<< /Type /Catalog /Pages ${raizDasPaginas} 0 R >>`;
  objetos[raizDasPaginas - 1] = `<< /Type /Pages /Kids [${filhos.map((n) => `${n} 0 R`).join(" ")}] /Count ${filhos.length} >>`;

  let saida = "%PDF-1.4\n%\xe2\xe3\xcf\xd3\n";
  const posicoes = objetos.map((corpo, i) => {
    const posicao = saida.length;
    saida += `${i + 1} 0 obj\n${corpo}\nendobj\n`;
    return posicao;
  });
  const xref = saida.length;
  saida += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n${posicoes.map((p) => `${String(p).padStart(10, "0")} 00000 n \n`).join("")}`;
  saida += `trailer\n<< /Size ${objetos.length + 1} /Root ${catalogo} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Uint8Array.from(saida, (c) => c.charCodeAt(0));
}

// As páginas de um livro de exemplo: a folha de rosto, o verso dela, e cada capítulo começando
// numa página ímpar (à direita), com o texto quebrado em linhas e o número no pé. Devolve as
// páginas e o índice (a página em que cada capítulo começa).
function livroDaPrevia(titulo, capitulos, { largura = 420, altura = 595 } = {}) {
  const margem = 56;
  const porLinha = Math.floor((largura - 2 * margem) / (11 * 0.46));
  const linhasDoTexto = (texto) => {
    const linhas = [];
    for (const paragrafo of texto.split("\n")) {
      let linha = "";
      for (const palavra of paragrafo.split(" ")) {
        if (`${linha} ${palavra}`.trim().length > porLinha) {
          linhas.push(linha.trim());
          linha = palavra;
        } else linha += ` ${palavra}`;
      }
      linhas.push(linha.trim(), "");
    }
    return linhas;
  };
  const paginas = [
    [
      { texto: titulo, fonte: "F3", tamanho: 19, y: altura * 0.62, centro: true },
      { fio: [largura / 2 - 40, altura * 0.585, largura / 2 + 40, altura * 0.585] },
      { texto: "Crônicas Eternas", fonte: "F2", tamanho: 11, y: altura * 0.18, centro: true },
    ],
    [{ texto: "Escrito em Draevor, para quem lê à luz de vela.", fonte: "F2", tamanho: 9, y: 70, centro: true }],
  ];
  const pe = (n) => ({ texto: String(n), fonte: "F1", tamanho: 9, y: 34, centro: true });
  const indice = [];
  capitulos.forEach((capitulo, i) => {
    if (paginas.length % 2 === 1) paginas.push([]);
    indice.push({ pagina: paginas.length + 1, titulo: capitulo.titulo });
    let pagina = [
      { texto: `Capítulo ${i + 1}`, fonte: "F2", tamanho: 11, y: altura - 118, centro: true },
      { texto: capitulo.titulo, fonte: "F3", tamanho: 17, y: altura - 144, centro: true },
    ];
    let y = altura - 190;
    for (const linha of linhasDoTexto(capitulo.texto)) {
      if (y < 62) {
        paginas.push([...pagina, pe(paginas.length + 1)]);
        pagina = [];
        y = altura - margem - 10;
      }
      if (linha) pagina.push({ texto: linha, fonte: "F1", tamanho: 11, x: margem, y });
      y -= linha ? 15 : 8;
    }
    paginas.push([...pagina, pe(paginas.length + 1)]);
  });
  return { pdf: pdfDaPrevia(paginas, { largura, altura }), paginas: paginas.length, largura, altura, indice };
}

// Uma imagem de exemplo (capa, lombada ou contracapa), desenhada em SVG
function imagemDaPrevia(largura, altura, desenho) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${largura} ${altura}" width="${largura}" height="${altura}">${desenho}</svg>`;
  return { endereco: `data:image/svg+xml,${encodeURIComponent(svg)}`, largura, altura };
}

function capasDaPrevia(titulo) {
  const fundo =
    '<defs><linearGradient id="f" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#20443f"/><stop offset="1" stop-color="#0e211f"/></linearGradient></defs>' +
    '<rect width="100%" height="100%" fill="url(#f)"/>';
  const letra = 'font-family="Georgia, serif" fill="#e8d9b0"';
  return {
    capa: imagemDaPrevia(
      420,
      595,
      `${fundo}<rect x="22" y="22" width="376" height="551" fill="none" stroke="#c9ab80" stroke-width="2"/>` +
        '<circle cx="210" cy="250" r="70" fill="none" stroke="#c9ab80" stroke-width="1.5"/><path d="M150 330 Q210 230 270 330" fill="none" stroke="#e8d9b0" stroke-width="3"/>' +
        `<text x="210" y="420" text-anchor="middle" font-size="40" ${letra}>${titulo.split(" ").slice(0, 1).join(" ")}</text>` +
        `<text x="210" y="465" text-anchor="middle" font-size="40" ${letra}>${titulo.split(" ").slice(1).join(" ")}</text>` +
        `<text x="210" y="540" text-anchor="middle" font-size="15" font-style="italic" ${letra}>Crônicas Eternas</text>`,
    ),
    lombada: imagemDaPrevia(
      44,
      595,
      `${fundo}<rect x="4" y="30" width="36" height="2" fill="#c9ab80"/><rect x="4" y="563" width="36" height="2" fill="#c9ab80"/>` +
        `<text transform="translate(29 297) rotate(90)" text-anchor="middle" font-size="20" ${letra}>${titulo}</text>`,
    ),
    contracapa: imagemDaPrevia(
      420,
      595,
      `${fundo}<rect x="22" y="22" width="376" height="551" fill="none" stroke="#c9ab80" stroke-width="1"/>` +
        `<text x="210" y="260" text-anchor="middle" font-size="17" font-style="italic" ${letra}>Doze dias de estrada,</text>` +
        `<text x="210" y="290" text-anchor="middle" font-size="17" font-style="italic" ${letra}>doze cantigas para não esquecer.</text>`,
    ),
  };
}

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

  // Os dois livros em PDF: o PDF fica em "arquivos", e o livro guarda o nome dele
  const arquivos = new Map();
  const livroDoExemplo = (nome, { pdf, paginas, largura, altura, indice }, extras = {}) => {
    arquivos.set(nome, pdf);
    return {
      miolo: { arquivo: nome, paginas, largura, altura, bytes: pdf.length },
      capa: null,
      lombada: null,
      contracapa: null,
      indice,
      baixar: false,
      ...extras,
    };
  };
  const ESTRADA = ["A partida", "O primeiro poço", "A ponte velha", "O vale de cinza", "A estalagem do corvo", "A chuva", "O desvio", "A torre ao longe", "O rio sem nome", "A vigília", "O passo", "A chegada"];
  const cantigas = livroDaPrevia(
    "Cantigas do caminho",
    ESTRADA.map((titulo, i) => ({
      titulo,
      texto: [
        `Dia ${i + 1} de estrada. Andamos até o sol baixar e paramos perto de ${titulo.toLowerCase()}. Ninguém falou muito.`,
        "O guia contou as pedras do caminho em voz baixa, como quem reza, e depois dormiu sentado, com a mão no cabo da faca.",
        "Alguém começou uma cantiga antiga, dessas que só se lembram pela metade. Os outros completaram o resto, cada um com uma palavra diferente, e ninguém quis corrigir ninguém.",
        "Antes de dormir, anotamos o que vimos: o céu limpo, a água fria, o cheiro de cinza que vinha do norte.",
      ].join("\n"),
    })),
  );
  const luas = livroDaPrevia("Tratado das luas", [
    {
      titulo: "Das luas",
      texto: Array(5)
        .fill("São duas as luas de Draevor, e nenhuma delas é gentil. Quem nasce sob a lua cheia carrega um peso nos olhos, dizem as avós; quem nasce na lua nova não carrega nada, e por isso esquece depressa.")
        .join("\n"),
    },
    {
      titulo: "Das marés",
      texto: Array(4)
        .fill("As marés obedecem às duas, e por isso nunca descansam. O mar sobe pela manhã e de novo à noite, e entre uma e outra os barqueiros contam histórias que ninguém confere.")
        .join("\n"),
    },
  ]);

  return {
    arquivos,
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
        id: "mem-a1b2c3d4",
        titulo: "Cantigas do caminho",
        tipo: "livro",
        data: { ano: 364, aprox: true },
        livro: livroDoExemplo("miolo-cantigas.pdf", cantigas, { ...capasDaPrevia("Cantigas do caminho"), baixar: true }),
        revelacao: { todos: null, contas: { neia: diasAtras(2) } },
        alterada: 2,
      }),
      memoria({
        id: "mem-b2c3d4e5",
        titulo: "Tratado completo sobre as luas, as marés e os sonhos dos homens que vivem perto do mar",
        tipo: "livro",
        livro: livroDoExemplo("miolo-luas.pdf", luas),
        revelacao: paraTodos(25),
        alterada: 26,
      }),
      memoria({
        id: "mem-c3d4e5f6",
        titulo: "Bilhete sob a porta",
        tipo: "carta",
        data: { ano: 365, mes: 6, dia: 2, aprox: false },
        detalhe: "M.",
        texto: "Não confie no barqueiro. Ele cobra a travessia duas vezes: uma em prata, outra em segredos.\n\nQueime este bilhete.",
        revelacao: paraTodos(15),
        alterada: 16,
      }),
      memoria({
        id: "mem-d4e5f607",
        titulo: "Diário de viagem, quarta semana",
        tipo: "diario",
        data: { ano: 362, mes: 7, dia: 16, aprox: false },
        texto:
          "O sol voltou. Secamos as botas numa pedra quente e o guia, pela primeira vez, sorriu.\n\nDo alto do passo dá para ver a torre. Ninguém quis comentar.",
        revelacao: paraTodos(10),
        alterada: 11,
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

  // O começo do texto para a lista: sem as marcas e sem os códigos dos links, as linhas juntas
  // (no Poema, com " / ") e cortado no fim de uma palavra
  function inicioDoTexto(textoDaMemoria, versos) {
    const linhas = textoDaMemoria
      .replace(REGEX_LINK, (_, alvo, id, aparece) => aparece)
      .split("\n")
      .map((linha) => linha.replace(/^\s*(?:-|\d+\.)\s+/, "").replace(/\*\*|\*/g, "").trim())
      .filter(Boolean);
    const junto = linhas.join(versos ? " / " : " ").replace(/\s+/g, " ").trim();
    if (junto.length <= LIMITES.inicio) return junto;
    const corte = junto.lastIndexOf(" ", LIMITES.inicio);
    return `${junto.slice(0, corte > 0 ? corte : LIMITES.inicio).replace(/[\s/]+$/, "")}…`;
  }

  /* ---------- O livro em PDF, como no servidor ---------- */

  const PARTES_DO_LIVRO = ["capa", "lombada", "contracapa"];
  const livroVazio = () => ({ miolo: null, capa: null, lombada: null, contracapa: null, indice: [], baixar: false });
  const livroAntigo = (m) => m.tipo === "livro" && m.capitulos.length > 0;
  // Todo Livro tem o "livro" (o antigo também, vazio até o PDF chegar)
  const livroDe = (m) => (m.livro ??= livroVazio());
  // Na prévia, o PDF fica na memória do navegador: o endereço só diz o nome dele
  const PREFIXO_DO_PDF = "previa:";
  const pdfDoLivro = (livro) => banco.arquivos.get(livro.miolo.endereco.slice(PREFIXO_DO_PDF.length));

  function livroNaLista(m) {
    if (livroAntigo(m)) return { capitulos: m.capitulos.length };
    const { miolo, lombada } = livroDe(m);
    return { paginas: miolo?.paginas ?? 0, formato: miolo ? { largura: miolo.largura, altura: miolo.altura } : null, lombada: lombada ? { ...lombada } : null };
  }

  function livroPublico(m) {
    const livro = livroDe(m);
    const miolo = livro.miolo;
    return {
      miolo: miolo ? { endereco: `${PREFIXO_DO_PDF}${miolo.arquivo}`, paginas: miolo.paginas, largura: miolo.largura, altura: miolo.altura, bytes: miolo.bytes } : null,
      ...Object.fromEntries(PARTES_DO_LIVRO.map((parte) => [parte, livro[parte] ? { ...livro[parte] } : null])),
      indice: livro.indice.map((e) => ({ ...e })),
      baixar: livro.baixar,
    };
  }

  function memoriaPublica(m) {
    const publica = {
      id: m.id,
      titulo: m.titulo,
      tipo: m.tipo,
      data: m.data ? dataPublica(m.data) : null,
      detalhe: tipoDeMemoria(m.tipo)?.detalhe ? m.detalhe || "" : "",
    };
    if (m.tipo === "livro") {
      publica.livro = livroPublico(m);
      if (livroAntigo(m)) publica.capitulos = m.capitulos.map((c) => ({ titulo: c.titulo, texto: c.texto }));
    } else publica.texto = m.texto;
    publica.reveladaEm = reveladaEm(m);
    if (contaEhAdmin()) publica.revelacao = revelacaoPublica(m);
    return publica;
  }

  // As mesmas conferências e mensagens do servidor/memorias.js
  const ANO_ATUAL = 366; // o ano atual da prévia da Linha do Tempo
  const LIMITES = { memorias: 500, texto: 100000, link: 120, inicio: 160, miolo: 200 * 1024 * 1024, paginas: 5000, indice: 300 };

  function exigirAdmin() {
    if (!contaEhAdmin()) throw erroComCodigo("Só o administrador pode fazer isso.", "proibido");
  }

  // Para quem não pode ler, a memória escondida não existe
  function acharMemoria(id) {
    const memoria = banco.memorias.find((m) => m.id === id);
    if (!memoria || !podeLer(memoria)) throw erroComCodigo("Essa memória não existe.", "nao-encontrado");
    return memoria;
  }

  function novoId() {
    let id;
    do id = `mem-${Math.random().toString(16).slice(2, 10).padEnd(8, "0")}`;
    while (banco.memorias.some((m) => m.id === id));
    return id;
  }

  function textoValido(valor, campo, max) {
    const limpo = typeof valor === "string" ? valor.trim() : "";
    if (!limpo) throw erroComCodigo(`Preencha o campo ${campo}.`);
    if (limpo.length > max) throw erroComCodigo(`O campo ${campo} pode ter no máximo ${max} caracteres.`);
    return limpo;
  }

  function textoOpcional(valor, campo, max) {
    const limpo = typeof valor === "string" ? valor.replace(/\r\n?/g, "\n").trim() : "";
    if (limpo.length > max) throw erroComCodigo(`O campo ${campo} pode ter no máximo ${max} caracteres.`);
    return limpo;
  }

  // Mês e dia são opcionais: vazio, nulo ou zero quer dizer "sem"
  function numeroOuNada(valor, min, max, mensagem) {
    if (valor === null || valor === undefined || valor === "" || valor === 0) return null;
    if (!Number.isInteger(valor) || valor < min || valor > max) throw erroComCodigo(mensagem);
    return valor;
  }

  // A data no formato e com as regras da Linha do Tempo: só o ano é obrigatório
  function dataDaMemoria(bruta) {
    const ano = bruta && typeof bruta === "object" ? bruta.ano : undefined;
    if (!Number.isInteger(ano) || ano < 0 || ano > ANO_ATUAL) {
      throw erroComCodigo(`O ano precisa ser um número inteiro de 0 a ${ANO_ATUAL}.`);
    }
    const mes = numeroOuNada(bruta.mes, 1, 10, "Escolha um mês da lista.");
    const dia = mes ? numeroOuNada(bruta.dia, 1, 30, "Escolha um dia de 1 a 30.") : null;
    return { ano, mes, dia, aprox: bruta.aprox === true };
  }

  // Todo link precisa mostrar alguma coisa, e no máximo 120 caracteres
  function conferirLinks(textoDaMemoria, campo) {
    for (const [, , , aparece] of textoDaMemoria.matchAll(REGEX_LINK)) {
      if (!aparece.trim()) {
        throw erroComCodigo(`Um link no campo ${campo} está sem o que aparece. Escreva depois da barra: [[evento:id|o que aparece]].`);
      }
      if (aparece.length > LIMITES.link) {
        throw erroComCodigo(`O que aparece num link pode ter no máximo ${LIMITES.link} caracteres (campo ${campo}).`);
      }
    }
  }

  function textoDaMemoria(valor, campo) {
    const limpo = textoOpcional(valor, campo, LIMITES.texto);
    conferirLinks(limpo, campo);
    return limpo;
  }

  // No Livro não há texto: do formulário vem só o "baixar". O "detalhe" só fica nas
  // classificações que têm o campo.
  function valoresDaMemoria(dados) {
    const titulo = textoValido(dados.titulo, "Título", 120);
    const tipo = typeof dados.tipo === "string" ? tipoDeMemoria(dados.tipo) : null;
    if (!tipo) throw erroComCodigo("Escolha uma classificação da lista.");
    const data = dados.data ? dataDaMemoria(dados.data) : null;
    const detalhe = tipo.detalhe ? textoOpcional(dados.detalhe, tipo.detalhe, 120).replace(/\s*\n\s*/g, " ") : "";
    if (tipo.id === "livro") return { titulo, tipo: tipo.id, data, detalhe, texto: "", baixar: dados.baixar === true };
    return { titulo, tipo: tipo.id, data, detalhe, texto: textoDaMemoria(dados.texto, "Texto") };
  }

  function livroParaMexer(id) {
    exigirAdmin();
    const memoria = acharMemoria(id);
    if (memoria.tipo !== "livro") throw erroComCodigo("Essa memória não é um livro.");
    return memoria;
  }

  // Um envio de mentira: o andamento sobe aos poucos
  async function simularEnvio(aoProgredir) {
    for (const parte of [0.2, 0.45, 0.7, 1]) {
      await esperar(90);
      aoProgredir?.(parte);
    }
  }

  const nomeAleatorio = (parte, extensao) => `${parte}-${Math.random().toString(16).slice(2, 10)}${extensao}`;

  // Repete usuários à vontade; uma conta que não existe, ou de administrador, é recusada
  function contasEscolhidas(lista) {
    if (!Array.isArray(lista)) throw erroComCodigo("Escolha as contas que vão ler a memória.");
    const usuarios = [...new Set(lista)];
    for (const usuario of usuarios) {
      const dona = banco.contas.find((c) => c.usuario === usuario);
      if (!dona) throw erroComCodigo("Uma das contas escolhidas não existe. Recarregue a página.");
      if (dona.admin) throw erroComCodigo("O administrador já vê todas as memórias. Escolha só as outras contas.");
    }
    return usuarios;
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
          const item = {
            id: m.id,
            titulo: m.titulo,
            tipo: m.tipo,
            data: m.data ? dataPublica(m.data) : null,
            detalhe: tipoDeMemoria(m.tipo)?.detalhe ? m.detalhe || "" : "",
          };
          if (m.tipo === "livro") Object.assign(item, livroNaLista(m));
          else item.inicio = inicioDoTexto(m.texto, m.tipo === "poema");
          item.reveladaEm = reveladaEm(m);
          if (contaEhAdmin()) Object.assign(item, { alteradoEm: m.alteradoEm, revelacao: revelacaoPublica(m) });
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
      const memoria = acharMemoria(id);
      return { memoria: memoriaPublica(memoria), links: linksPara(textosDe(memoria)) };
    },
    // Toda memória nasce escondida. O Livro nasce sem o PDF.
    async escrever(dados) {
      await esperar(150);
      exigirAdmin();
      const { baixar, ...valores } = valoresDaMemoria(dados);
      if (banco.memorias.length >= LIMITES.memorias) throw erroComCodigo(`Podem existir no máximo ${LIMITES.memorias} memórias.`);
      const quando = new Date().toISOString();
      const memoria = { id: novoId(), ...valores, capitulos: [], revelacao: { todos: null, contas: {} }, criadoEm: quando, alteradoEm: quando };
      if (memoria.tipo === "livro") memoria.livro = { ...livroVazio(), baixar };
      banco.memorias.push(memoria);
      return { memoria: { id: memoria.id } };
    },
    // Alterar não mexe na revelação. Trocar de Livro para outra classificação apaga o PDF e as
    // imagens; de outra para Livro, deixa o texto para trás. Um livro antigo fica com os capítulos.
    async alterar(id, dados) {
      await esperar(150);
      exigirAdmin();
      const { baixar, ...valores } = valoresDaMemoria(dados);
      const memoria = acharMemoria(id);
      if (valores.tipo === "livro") {
        if (memoria.tipo !== "livro") {
          memoria.capitulos = [];
          memoria.livro = livroVazio();
        }
        livroDe(memoria).baixar = baixar;
      } else {
        memoria.capitulos = [];
        delete memoria.livro;
      }
      Object.assign(memoria, valores, { alteradoEm: new Date().toISOString() });
      return { ok: true };
    },
    async apagar(id) {
      await esperar(120);
      exigirAdmin();
      const memoria = acharMemoria(id);
      banco.memorias = banco.memorias.filter((m) => m !== memoria);
      return { ok: true };
    },
    /* ---------- O livro ---------- */
    async enviarMiolo(id, arquivo, info, aoProgredir) {
      const memoria = livroParaMexer(id);
      if (arquivo.size > LIMITES.miolo) throw erroComCodigo("O arquivo passou do limite de 200 MB.");
      const bytes = new Uint8Array(await arquivo.arrayBuffer());
      if (!new TextDecoder("latin1").decode(bytes.subarray(0, 1024)).includes("%PDF-")) throw erroComCodigo("Esse arquivo não é um PDF.");
      if (!Number.isInteger(info?.paginas) || info.paginas < 1 || info.paginas > LIMITES.paginas) {
        throw erroComCodigo("Não deu para ler as páginas do arquivo. Escolha-o de novo.");
      }
      await simularEnvio(aoProgredir);
      const livro = livroDe(memoria);
      const nome = nomeAleatorio("miolo", ".pdf");
      banco.arquivos.set(nome, bytes);
      if (livro.miolo) banco.arquivos.delete(livro.miolo.arquivo);
      livro.miolo = { arquivo: nome, paginas: info.paginas, largura: info.largura, altura: info.altura, bytes: bytes.length };
      livro.indice = livro.indice.filter((e) => e.pagina <= info.paginas);
      memoria.capitulos = [];
      memoria.alteradoEm = new Date().toISOString();
      return { livro: livroPublico(memoria) };
    },
    async enviarImagem(id, parte, arquivo, medidas, aoProgredir) {
      const memoria = livroParaMexer(id);
      if (!PARTES_DO_LIVRO.includes(parte)) throw erroComCodigo("Endereço não encontrado.");
      if (!["image/png", "image/jpeg", "image/webp", "image/gif", "image/avif"].includes(arquivo.type)) {
        throw erroComCodigo("Use imagens PNG, JPG, WEBP, GIF ou AVIF.");
      }
      if (arquivo.size > 10 * 1024 * 1024) throw erroComCodigo("O arquivo passou do limite de 10 MB.");
      await simularEnvio(aoProgredir);
      const livro = livroDe(memoria);
      livro[parte] = { endereco: URL.createObjectURL(arquivo), largura: medidas.largura, altura: medidas.altura };
      memoria.alteradoEm = new Date().toISOString();
      return { livro: livroPublico(memoria) };
    },
    async tirarImagem(id, parte) {
      await esperar(80);
      const memoria = livroParaMexer(id);
      livroDe(memoria)[parte] = null;
      return { livro: livroPublico(memoria) };
    },
    async salvarIndice(id, indice) {
      await esperar(120);
      const memoria = livroParaMexer(id);
      const miolo = livroDe(memoria).miolo;
      if (!miolo) throw erroComCodigo("Mande o PDF do miolo antes de montar o índice.");
      if (!Array.isArray(indice)) throw erroComCodigo("Mande o índice como uma lista.");
      if (indice.length > LIMITES.indice) throw erroComCodigo(`O índice pode ter no máximo ${LIMITES.indice} capítulos.`);
      const certos = indice.map((entrada, i) => {
        if (!Number.isInteger(entrada?.pagina) || entrada.pagina < 1 || entrada.pagina > miolo.paginas) {
          throw erroComCodigo(`A página do capítulo ${i + 1} do índice precisa ser de 1 a ${miolo.paginas}.`);
        }
        return { pagina: entrada.pagina, titulo: textoValido(entrada.titulo, `nome do capítulo ${i + 1} do índice`, 120), i };
      });
      memoria.livro.indice = certos.sort((a, b) => a.pagina - b.pagina || a.i - b.i).map(({ pagina, titulo }) => ({ pagina, titulo }));
      memoria.alteradoEm = new Date().toISOString();
      return { livro: livroPublico(memoria) };
    },
    // O pdf.js recebe o PDF já na memória (aberta direto do arquivo, a página não busca nada)
    async abrirPdf(memoria) {
      const pdfjs = await carregarPdfJs();
      return pdfjs.getDocument({ ...OPCOES_DO_PDF, data: pdfDoLivro(memoria.livro).slice() }).promise;
    },
    enderecoParaBaixar(memoria) {
      return URL.createObjectURL(new Blob([pdfDoLivro(memoria.livro)], { type: "application/pdf" }));
    },
    // Ninguém: escondida de novo. Todos: a data de agora, ou a que já tinha, e as contas ficam como estão.
    // Algumas contas: cada marcada fica com a data que já tinha, ou a de agora; as desmarcadas saem.
    async revelar(id, escolha) {
      await esperar(120);
      exigirAdmin();
      const memoria = acharMemoria(id);
      if (escolha?.para !== "ninguem" && memoria.tipo === "livro" && !livroAntigo(memoria) && !livroDe(memoria).miolo) {
        throw erroComCodigo("Mande o PDF do miolo antes de revelar o livro.");
      }
      const atual = memoria.revelacao;
      const agora = new Date().toISOString();
      if (escolha?.para === "ninguem") {
        memoria.revelacao = { todos: null, contas: {} };
      } else if (escolha?.para === "todos") {
        atual.todos = atual.todos || agora;
      } else if (escolha?.para === "contas") {
        const usuarios = contasEscolhidas(escolha.contas);
        memoria.revelacao = { todos: null, contas: Object.fromEntries(usuarios.map((u) => [u, dataDaConta(atual, u) || agora])) };
      } else {
        throw erroComCodigo("Escolha para quem revelar: ninguém, todos ou algumas contas.");
      }
      return { ok: true };
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
  citaveis: { acontecimentos: [], personagens: [] }, // só para o administrador: o que o "Citar" oferece
  busca: "", // o "Procurar pelo título" da biblioteca
  filtro: "todos", // a classificação escolhida na mesa dos Escritos (não fica guardada)
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
  // { id, capitulo, pagina } na leitura (capitulo: num capítulo de um livro antigo; pagina: na
  // página de um livro em PDF; os dois são null fora deles), ou null na lista
  rota: null,
  lida: null, // { memoria, links } da memória aberta, para folhear os capítulos sem pedir de novo
  folheador: null, // o livro em PDF aberto (criarFolheador)
  pedido: 0, // conta as aberturas, para ignorar a resposta de uma que ficou para trás
  rolagemDaLista: 0,
};

const ancoraDe = ({ id, capitulo = null, pagina = null }) =>
  `#memoria-${id}${capitulo ? `-capitulo-${capitulo}` : pagina ? `-pagina-${pagina}` : ""}`;

function rotaDoEndereco() {
  const achado = location.hash.match(/^#memoria-([\w-]+?)(?:-(capitulo|pagina)-(\d+))?$/);
  if (!achado) return null;
  const numero = achado[3] ? Number(achado[3]) : null;
  return { id: achado[1], capitulo: achado[2] === "capitulo" ? numero : null, pagina: achado[2] === "pagina" ? numero : null };
}

const mesmaRota = (a, b) => Boolean(a && b && a.id === b.id && a.capitulo === b.capitulo && (a.pagina ?? null) === (b.pagina ?? null));

// Fecha o livro em PDF que estiver aberto, e a página volta à largura de sempre
function fecharFolheador() {
  navegacao.folheador?.destruir();
  navegacao.folheador = null;
  $("#pagina").classList.remove("pagina-memorias--livro");
  $("#leitura").classList.remove("leitura--livro");
}

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
  // No livro em PDF aberto, outra página do mesmo livro só vira as folhas
  if (!forcar && navegacao.folheador && navegacao.rota?.id === rota.id && !rota.capitulo) {
    navegacao.rota = rota;
    navegacao.folheador.irPara(rota.pagina);
    return;
  }
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
  fecharFolheador();
  leitura.hidden = true;
  leitura.replaceChildren();
  $("#vista-lista").hidden = false;
  document.title = TITULO_DA_PAGINA;
  window.scrollTo(0, navegacao.rolagemDaLista);
  // O foco volta ao livro ou ao papel da memória que estava aberta
  if (focoNaLeitura) {
    const link = [...document.querySelectorAll(".lombada, .papel-link")].find((l) => l.dataset.id === aberta.id);
    link?.focus({ preventScroll: true });
  }
}

/* =================================================================
   A biblioteca: a estante dos Livros e a mesa dos Escritos
   -----------------------------------------------------------------
   Os livros são lombadas em pé numa prateleira; os outros escritos,
   papéis em miniatura com a cara da classificação. O "Procurar pelo
   título" filtra as duas partes; as classificações filtram a mesa.
   ================================================================= */

// Para o administrador: "Escondida" (com o olho riscado) ou "Só para Neia e Takezo".
// As reveladas para todos não levam nada na biblioteca; na leitura, "Revelada para todos".
function sinalDaRevelacao(revelacao, { todos = false } = {}) {
  if (revelacao.para === "ninguem") {
    const selo = criar("span", "selo-oculto");
    selo.append(simbolo("icone-oculto"), "Escondida");
    return selo;
  }
  if (revelacao.para === "contas") return criar("span", "memoria-estado", `Só para ${listaDeNomes(revelacao.contas)}`);
  return todos ? criar("span", "memoria-estado", "Revelada para todos") : null;
}

// O estado, em texto: "Escondida" ou "Só para Neia e Takezo" (as reveladas para todos, nada)
function estadoEmTexto(revelacao) {
  if (!revelacao || revelacao.para === "todos") return "";
  return revelacao.para === "ninguem" ? "Escondida" : `Só para ${listaDeNomes(revelacao.contas)}`;
}

// Um número tirado do id, sempre o mesmo para a mesma memória: dele saem o tamanho e a cor
// do livro, a inclinação do papel e o número da página do Trecho de livro
function numeroDoId(id) {
  let soma = 7;
  for (const letra of id) soma = (soma * 31 + letra.charCodeAt(0)) % 9973;
  return soma;
}

const SETE_DIAS = 7 * 86400000;

// Revelada para a conta nos últimos 7 dias (o administrador não vê a marca)
const reveladaHaPouco = (m) => !ehAdmin() && Boolean(m.reveladaEm) && Date.now() - Date.parse(m.reveladaEm) < SETE_DIAS;

const quantosCapitulos = (n) => `${n} ${n === 1 ? "capítulo" : "capítulos"}`;
const quantasPaginas = (n) => `${n} ${n === 1 ? "página" : "páginas"}`;

// O tamanho do livro na estante: "240 páginas" (ou "12 capítulos", num livro antigo).
// Sem o PDF ainda (só o administrador vê), "sem o PDF".
function tamanhoDoLivro(m) {
  if (m.capitulos !== undefined) return quantosCapitulos(m.capitulos);
  return m.paginas ? quantasPaginas(m.paginas) : "sem o PDF";
}

// O nome do link: "Livro: <título>, 240 páginas" ou "Carta: <título>", e o estado para o administrador
function nomeDoLink(m) {
  const partes = [`${tipoDeMemoria(m.tipo)?.nome ?? "Memória"}: ${m.titulo}`];
  if (m.tipo === "livro") partes.push(tamanhoDoLivro(m));
  const estadoDela = ehAdmin() ? estadoEmTexto(m.revelacao) : "";
  if (estadoDela) partes.push(estadoDela.charAt(0).toLowerCase() + estadoDela.slice(1));
  return partes.join(", ");
}

// O link de um livro ou de um papel: abre a leitura e guarda o id para o foco voltar a ele
function linkDaBiblioteca(m, classe) {
  const link = linkDaLeitura({ id: m.id, capitulo: null }, classe);
  link.dataset.id = m.id;
  link.setAttribute("aria-label", nomeDoLink(m));
  return link;
}

/* ---------- A estante: os Livros ---------- */

const CORES_DO_COURO = ["vinho", "musgo", "noite", "castanho", "fuligem", "ocre"];
const MAXIMO_DE_CAPITULOS_NA_LARGURA = 40;

// A etiqueta fica centralizada no livro, mas sem passar das bordas da estante
function ajustarEtiqueta(livro) {
  const etiqueta = livro.querySelector(".lombada__etiqueta");
  const estante = livro.closest(".estante");
  if (!etiqueta || !estante) return;
  etiqueta.style.setProperty("--desvio", "0px");
  const caixa = etiqueta.getBoundingClientRect();
  const limite = estante.getBoundingClientRect();
  let desvio = 0;
  if (caixa.left < limite.left) desvio = limite.left - caixa.left;
  else if (caixa.right > limite.right) desvio = limite.right - caixa.right;
  etiqueta.style.setProperty("--desvio", `${Math.round(desvio)}px`);
}

// A altura do livro em PDF na estante sai do tamanho da página: um A5 (595 pontos) fica com uns
// 15rem, um A4 com 17,4rem; entre 13rem e 18rem
const alturaDoFormato = (formato) => Math.min(18, Math.max(13, 9 + formato.altura / 100));

// A largura, sem a imagem da lombada, acompanha as páginas
const larguraDasPaginas = (paginas) => 2.2 + Math.min(paginas, 800) * 0.0045;

function lombada(m) {
  const numero = numeroDoId(m.id);
  const link = linkDaBiblioteca(m, `lombada lombada--${CORES_DO_COURO[Math.floor(numero / 31) % CORES_DO_COURO.length]}`);
  const altura = m.formato ? alturaDoFormato(m.formato) : 14 + (numero % 31) / 10;
  link.style.setProperty("--altura", `${altura}rem`);
  if (m.capitulos !== undefined) {
    link.style.setProperty("--capitulos", String(Math.min(m.capitulos, MAXIMO_DE_CAPITULOS_NA_LARGURA)));
  } else if (m.lombada) {
    // A lombada enviada: a imagem inteira, na proporção dela (um livro fino fica fino)
    const largura = Math.min(7, Math.max(0.9, (altura * m.lombada.largura) / m.lombada.altura));
    link.style.setProperty("--largura", `${largura.toFixed(2)}rem`);
  } else {
    link.style.setProperty("--largura", `${larguraDasPaginas(m.paginas).toFixed(2)}rem`);
  }

  if (m.lombada) {
    link.classList.add("lombada--imagem");
    const desenho = criar("img", "lombada__imagem");
    desenho.alt = "";
    desenho.decoding = "async";
    desenho.loading = "lazy";
    desenho.draggable = false;
    desenho.src = m.lombada.endereco;
    link.append(desenho);
  } else {
    link.append(criar("span", "lombada__titulo", m.titulo), enfeite("lombada__ponteiras"));
  }
  if (reveladaHaPouco(m)) link.append(enfeite("lombada__fita"));
  if (ehAdmin() && m.revelacao?.para === "ninguem") {
    const veu = enfeite("lombada__veu");
    veu.append(simbolo("icone-oculto"));
    link.append(veu);
  }

  // A etiqueta de pergaminho que aparece acima do livro: só visual, o nome do link já diz tudo
  const etiqueta = enfeite("lombada__etiqueta");
  etiqueta.append(criar("span", "lombada__etiqueta-titulo", m.titulo));
  const linha = [tamanhoDoLivro(m), m.data ? textoDaData(m.data) : ""].filter(Boolean).join(" · ");
  etiqueta.append(criar("span", "lombada__etiqueta-linha", linha));
  const estadoDele = ehAdmin() ? estadoEmTexto(m.revelacao) : "";
  if (estadoDele) etiqueta.append(criar("span", "lombada__etiqueta-estado", estadoDele));
  link.append(etiqueta);
  link.addEventListener("mouseenter", () => ajustarEtiqueta(link));
  link.addEventListener("focus", () => ajustarEtiqueta(link));

  const vaga = criar("li", "estante__vaga");
  vaga.append(link);
  return vaga;
}

/* ---------- A mesa: os Escritos ---------- */

const PLURAIS = {
  carta: "Cartas",
  conto: "Contos",
  diario: "Diários",
  recorte: "Recortes",
  trecho: "Trechos de livro",
  poema: "Poemas e canções",
  documento: "Documentos",
  inscricao: "Inscrições",
};

// O começo do texto. No Poema, cada " / " volta a ser uma quebra de linha.
function inicioNoPapel(m) {
  const inicio = criar("p", "papel__inicio");
  if (m.tipo !== "poema") {
    inicio.textContent = m.inicio || "";
    return inicio;
  }
  (m.inicio || "").split(" / ").forEach((verso, i) => {
    if (i) inicio.append(document.createElement("br"));
    inicio.append(verso);
  });
  return inicio;
}

// O que vai no papel de cada classificação, em miniatura da cara da leitura
function pecasDoPapel(m) {
  const se = (valor, classe) => (valor ? [criar("p", classe, valor)] : []);
  const tipo = enfeite("papel__tipo", tipoDeMemoria(m.tipo)?.nome ?? "");
  const titulo = criar("p", "papel__titulo", m.titulo);
  const inicio = inicioNoPapel(m);
  const data = se(m.data ? textoDaData(m.data) : "", "papel__data");
  const detalhe = m.detalhe || "";

  switch (m.tipo) {
    case "carta":
      return [tipo, ...data, titulo, inicio, ...se(detalhe, "papel__assinatura"), enfeite("lacre papel__lacre")];
    case "conto":
      return [tipo, titulo, inicio, ...data, enfeite("papel__ornamento")];
    case "diario":
      return [tipo, ...data, titulo, inicio];
    case "recorte":
      return [tipo, ...se(detalhe, "papel__jornal"), titulo, inicio, ...data];
    case "trecho":
      return [tipo, ...se(detalhe, "papel__cabeca"), titulo, inicio, ...data, enfeite("papel__pagina", String(numeroDaPagina(m.id)))];
    case "documento":
      return [tipo, titulo, ...data, inicio, ...se(detalhe, "papel__emissor"), enfeite("lacre lacre--selo papel__selo")];
    default:
      return [tipo, titulo, inicio, ...data];
  }
}

function papel(m) {
  const link = linkDaBiblioteca(m, "papel-link");
  link.style.setProperty("--inclinacao", `${((numeroDoId(m.id) % 41) - 20) / 10}deg`);
  const folha = criar("div", `papel papel--${m.tipo}`);
  folha.append(...pecasDoPapel(m));

  if (ehAdmin() && m.revelacao) {
    if (m.revelacao.para === "ninguem") folha.append(enfeite("papel__veu"));
    const sinal = sinalDaRevelacao(m.revelacao);
    if (sinal) {
      sinal.classList.add("papel__estado");
      folha.classList.add("papel--com-estado");
      folha.append(sinal);
    }
  }
  if (reveladaHaPouco(m)) folha.append(enfeite("papel__nova", "Nova"));
  link.append(folha);
  // Na Inscrição, o "Onde está gravada" fica abaixo da pedra
  if (m.tipo === "inscricao" && m.detalhe) link.append(enfeite("papel__lugar", m.detalhe));

  const vaga = criar("li", "mesa__vaga");
  vaga.append(link);
  return vaga;
}

// "Todos" e cada classificação que existe na lista, com o número; a escolha não fica guardada
function renderizarFiltros(escritos) {
  const contagem = new Map();
  for (const m of escritos) contagem.set(m.tipo, (contagem.get(m.tipo) ?? 0) + 1);
  if (estado.filtro !== "todos" && !contagem.has(estado.filtro)) estado.filtro = "todos";
  const opcoes = [{ id: "todos", nome: "Todos", n: escritos.length }];
  for (const t of TIPOS_DE_MEMORIA) {
    if (contagem.has(t.id)) {
      const n = contagem.get(t.id);
      opcoes.push({ id: t.id, nome: n === 1 ? t.nome : PLURAIS[t.id] ?? t.nome, n });
    }
  }
  $("#filtros-escritos").replaceChildren(
    ...opcoes.map((opcao) => {
      const filtro = criar("button", "filtro-escritos");
      filtro.type = "button";
      filtro.dataset.tipo = opcao.id;
      filtro.setAttribute("aria-pressed", String(estado.filtro === opcao.id));
      filtro.append(opcao.nome, " ", criar("span", "filtro-escritos__numero", String(opcao.n)));
      return filtro;
    }),
  );
}

/* ---------- A biblioteca inteira ---------- */

function renderizarLista() {
  $("#botao-nova").hidden = !ehAdmin();
  const todas = estado.memorias;
  const vazio = $("#memorias-vazio");
  vazio.hidden = todas.length > 0;
  vazio.textContent = ehAdmin() ? "Nenhuma memória escrita ainda." : "Nenhuma memória foi revelada ainda.";
  $("#biblioteca").hidden = !todas.length;
  if (!todas.length) return;

  carregarFontes(todas.flatMap((m) => tipoDeMemoria(m.tipo)?.fontes ?? []));

  const busca = normalizar(estado.busca.trim());
  const achada = (m) => !busca || normalizar(m.titulo).includes(busca);
  const livros = todas.filter((m) => m.tipo === "livro");
  const escritos = todas.filter((m) => m.tipo !== "livro");

  // A estante: sem livros na lista (ou na busca), a seção não aparece
  const livrosAchados = livros.filter(achada);
  $("#secao-livros").hidden = !livrosAchados.length;
  $("#numero-livros").textContent = String(livrosAchados.length);
  $("#estante").replaceChildren(...livrosAchados.map(lombada));

  // A mesa
  const escritosAchados = escritos.filter(achada);
  const semEscritos = !escritos.length;
  // Sem escritos na lista, a seção fica com o aviso (menos durante a busca); na busca sem nada, some
  $("#secao-escritos").hidden = semEscritos ? Boolean(busca) : !escritosAchados.length;
  renderizarFiltros(escritos);
  $("#filtros-escritos").hidden = semEscritos;
  const filtrados = escritosAchados.filter((m) => estado.filtro === "todos" || m.tipo === estado.filtro);
  $("#numero-escritos").textContent = String(semEscritos ? 0 : filtrados.length);
  $("#mesa").replaceChildren(...filtrados.map(papel));
  $("#mesa").hidden = !filtrados.length;
  const escritosVazio = $("#escritos-vazio");
  escritosVazio.hidden = filtrados.length > 0;
  if (semEscritos) escritosVazio.textContent = ehAdmin() ? "Nenhum escrito ainda." : "Nenhum escrito revelado ainda.";
  else escritosVazio.textContent = "Nenhuma memória com esse nome."; // a classificação escolhida, sem nada na busca

  $("#busca-vazia").hidden = Boolean(livrosAchados.length || escritosAchados.length);
}

function configurarBiblioteca() {
  $("#busca-memorias").addEventListener("input", (evento) => {
    estado.busca = evento.target.value;
    renderizarLista();
  });
  $("#filtros-escritos").addEventListener("click", (evento) => {
    const filtro = evento.target.closest(".filtro-escritos");
    if (!filtro || filtro.dataset.tipo === estado.filtro) return;
    estado.filtro = filtro.dataset.tipo;
    renderizarLista();
    $(`.filtro-escritos[data-tipo="${estado.filtro}"]`)?.focus();
  });
}

/* =================================================================
   A leitura
   -----------------------------------------------------------------
   Cada classificação tem a própria cara, feita no memorias.css: a
   memória aberta leva a classificação em data-tipo e a folha, a
   classe folha--<tipo>. Acima da folha, no fundo escuro, fica a
   classificação (e a data, quando a folha não tem lugar para ela);
   na Carta, no Diário e na Inscrição, também o título.
   ================================================================= */

function mostrarAvisoNaLeitura(mensagem) {
  fecharFolheador();
  document.title = TITULO_DA_PAGINA;
  const barra = criar("div", "leitura__barra");
  barra.append(botao("← Memórias", "botao--leve", voltarALista));
  const aviso = criar("p", "leitura__aviso", mensagem);
  aviso.setAttribute("role", "status");
  $("#leitura").replaceChildren(barra, aviso);
}

// No livro em PDF, o link leva à página que está à vista (a rota muda quando as folhas viram)
async function copiarLink(rota) {
  const atual = navegacao.folheador && navegacao.rota?.id === rota.id ? navegacao.rota : rota;
  const link = `${location.origin}${location.pathname}${ancoraDe(atual)}`;
  const onde = atual.capitulo ? "neste capítulo" : atual.pagina ? "nesta página" : "nesta memória";
  try {
    await navigator.clipboard.writeText(link);
    avisoRapido(`Link copiado. Quem abrir vai direto ${onde}.`);
  } catch {
    avisoRapido(link);
  }
}

/* -----------------------------------------------------------------
   Baixar PDF: sai da impressão do navegador. O título da aba vira o
   nome do arquivo, e o @media print do memorias.css deixa na folha
   só a memória aberta, com a cara dela.
   ----------------------------------------------------------------- */

const AVISO_DO_PDF = "memorias-aviso-do-pdf"; // no localStorage: o aviso da primeira vez já foi mostrado

// "Carta ao ferreiro" ou, num capítulo, "Crônica dos Sete Invernos - Capítulo 2 - O cerco"
function nomeDoPdf(memoria, rota) {
  if (!rota.capitulo) return memoria.titulo;
  return `${memoria.titulo} - Capítulo ${rota.capitulo} - ${memoria.capitulos[rota.capitulo - 1].titulo}`;
}

// Devolve true só na primeira vez (ou sempre, se o navegador não deixar guardar)
function primeiroPdf() {
  try {
    if (localStorage.getItem(AVISO_DO_PDF)) return false;
    localStorage.setItem(AVISO_DO_PDF, "sim");
  } catch {
    // sem o localStorage (navegação privada, alguns arquivos abertos no PC), o aviso aparece sempre
  }
  return true;
}

async function baixarPdf(memoria, rota) {
  if (primeiroPdf()) {
    avisoRapido("Na janela que abrir, escolha Salvar como PDF.");
    await new Promise((pronto) => setTimeout(pronto, 1000)); // o tempo de ler o aviso antes da janela
  }
  const titulo = document.title;
  const nome = nomeDoPdf(memoria, rota);
  document.title = nome;
  const devolverTitulo = () => {
    // Se a pessoa já foi para outra memória, o título é o dela e fica como está
    if (document.title === nome) document.title = titulo;
  };
  window.addEventListener("afterprint", devolverTitulo, { once: true });
  await document.fonts.ready;
  window.print();
}

// O livro em PDF: o "Baixar PDF" é o próprio PDF do miolo, para quem o administrador deixou
// (e para ele). Os livros antigos, escritos por capítulos, baixam um capítulo por vez, impresso.
const livroEmPdf = (memoria) => memoria.tipo === "livro" && !memoria.capitulos?.length;

function linkParaBaixar(memoria) {
  const link = criar("a", "botao botao--leve", "Baixar PDF");
  link.href = api.enderecoParaBaixar(memoria);
  link.download = `${memoria.titulo}.pdf`;
  return link;
}

// No alto: "← Memórias", "Copiar link" e "Baixar PDF" (no Livro antigo, só nos capítulos; no de
// PDF, se puder baixar); para o administrador, também "Alterar" e "Revelar…", com o estado atual ao lado
function barraDaLeitura(memoria, rota) {
  const barra = criar("div", "leitura__barra");
  barra.append(botao("← Memórias", "botao--leve", voltarALista), botao("Copiar link", "botao--leve", () => copiarLink(rota)));
  if (livroEmPdf(memoria)) {
    if (memoria.livro.miolo && (memoria.livro.baixar || ehAdmin())) barra.append(linkParaBaixar(memoria));
  } else if (memoria.tipo !== "livro" || rota.capitulo) {
    barra.append(botao("Baixar PDF", "botao--leve", () => baixarPdf(memoria, rota)));
  }
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

// As classificações que escrevem a data na própria folha (no alto da carta, no cabeçalho
// da entrada do diário, embaixo do título do documento)
const DATA_NA_FOLHA = new Set(["carta", "diario", "documento"]);

// Acima da folha: "Recorte · Lumenir de 365 ED", ou só "Carta" quando a data vai na folha
function linhaDaClassificacao(memoria) {
  const partes = [tipoDeMemoria(memoria.tipo)?.nome ?? "Memória"];
  if (memoria.data && !DATA_NA_FOLHA.has(memoria.tipo)) partes.push(textoDaData(memoria.data));
  return criar("p", "memoria__classificacao", partes.join(" · "));
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

// Um enfeite que só desenha (o lacre de cera, o número da página): os leitores de tela pulam
function enfeite(classe, texto) {
  const elemento = criar("span", classe, texto);
  elemento.setAttribute("aria-hidden", "true");
  return elemento;
}

// O número de página de mentira do Trecho de livro, tirado do id: sempre o mesmo para a
// mesma memória, entre 12 e 399
function numeroDaPagina(id) {
  return 12 + (numeroDoId(id) % 388);
}

// A folha de cada classificação (o Livro tem as dele, logo abaixo). Devolve o que vem depois
// da classificação: a folha e, em alguns tipos, o título antes dela e o detalhe depois, fora dela.
function folhaDaMemoria(memoria, links) {
  const { tipo, titulo, detalhe } = memoria;
  const folha = criar("div", `folha folha--${tipo}`);
  const tituloNaFolha = () => criar("h1", "folha__titulo", titulo);
  const tituloFora = () => criar("h1", "memoria__titulo", titulo);
  // No PDF a folha é a página: o título que fica fora dela na tela vai para dentro
  const tituloNoPdf = () => enfeite("folha__titulo so-no-pdf", titulo);
  // A data e o detalhe são opcionais: sem eles, nada de elemento vazio
  const se = (valor, classe) => (valor ? [criar("p", classe, valor)] : []);
  const data = memoria.data ? textoDaData(memoria.data) : "";
  const texto = textoDaFolha(memoria.texto, links);

  switch (tipo) {
    case "carta":
      folha.append(tituloNoPdf(), ...se(data, "carta__data"), texto, ...se(detalhe, "carta__assinatura"), enfeite("lacre"));
      return [tituloFora(), folha];
    case "diario":
      folha.append(tituloNoPdf(), ...se(data, "diario__data"), texto);
      return [tituloFora(), folha];
    case "recorte":
      folha.append(...se(detalhe, "recorte__jornal"), tituloNaFolha(), texto);
      return [folha];
    case "trecho":
      folha.append(...se(detalhe, "trecho__cabeca"), tituloNaFolha(), texto, enfeite("trecho__pagina", String(numeroDaPagina(memoria.id))));
      return [folha];
    case "documento":
      folha.append(tituloNaFolha(), ...se(data, "documento__data"), texto, ...se(detalhe, "documento__emissor"), enfeite("lacre lacre--selo"));
      return [folha];
    case "inscricao":
      folha.append(texto);
      return [tituloFora(), folha, ...se(detalhe, "inscricao__lugar")];
    case "conto":
      // A mesma página das leituras dos capítulos de um livro, com capitular
      folha.classList.add("folha--pagina");
      folha.append(tituloNaFolha(), texto);
      return [folha];
    default:
      folha.append(tituloNaFolha(), texto);
      return [folha];
  }
}

// O livro aberto: a capa de couro, com o título, e o índice dos capítulos num pergaminho
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
  const folha = criar("div", "folha folha--indice");
  folha.append(indice);
  return [capa, folha];
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

// Cada capítulo numa página como a do Conto, com capitular. No PDF, o nome do livro vai no pé.
function capituloDoLivro(memoria, n, links) {
  const capitulo = memoria.capitulos[n - 1];
  const folha = criar("div", "folha folha--pagina");
  folha.append(
    criar("p", "folha__capitulo", `Capítulo ${n}`),
    criar("h1", "folha__titulo", capitulo.titulo),
    textoDaFolha(capitulo.texto, links),
    passosEntreCapitulos(memoria, n),
    enfeite("folha__livro so-no-pdf", memoria.titulo),
  );
  return [folha];
}

/* -----------------------------------------------------------------
   O livro em PDF: o folheador, com o índice à direita
   ----------------------------------------------------------------- */

// A página à vista vai para o endereço (sem encher o histórico); o "Copiar link" leva a ela
function aoMudarDePagina(memoria, pagina) {
  if (navegacao.lida?.memoria !== memoria) return;
  const rota = { id: memoria.id, capitulo: null, pagina };
  if (mesmaRota(rota, navegacao.rota) && location.hash === ancoraDe(rota)) return;
  navegacao.rota = rota;
  trocarEndereco(ancoraDe(rota));
}

function renderizarLivro(memoria, pedida) {
  const rota = { id: memoria.id, capitulo: null, pagina: pedida.pagina };
  navegacao.rota = rota;
  document.title = memoria.titulo;

  const cabeca = criar("div", "livro-pdf__cabeca");
  cabeca.append(criar("h1", "livro-pdf__titulo", memoria.titulo), linhaDaClassificacao(memoria));
  cabeca.lastElementChild.className = "livro-pdf__classificacao";
  const leitura = $("#leitura");

  if (!memoria.livro.miolo) {
    // Só o administrador chega a um livro sem o PDF (ele não pode ser revelado assim)
    const aviso = criar("p", "livro-pdf__sem-miolo", "Este livro ainda não tem o PDF do miolo. Mande o PDF em Alterar.");
    leitura.replaceChildren(barraDaLeitura(memoria, rota), cabeca, aviso);
    window.scrollTo(0, 0);
    return;
  }

  $("#pagina").classList.add("pagina-memorias--livro");
  leitura.classList.add("leitura--livro");
  const folheador = criarFolheador({
    titulo: memoria.titulo,
    livro: memoria.livro,
    abrirDocumento: () => api.abrirPdf(memoria),
    pagina: pedida.pagina,
    aoMudar: (pagina) => aoMudarDePagina(memoria, pagina),
    indice: {
      editavel: ehAdmin(),
      salvar: async (indice) => (await api.salvarIndice(memoria.id, indice)).livro.indice,
    },
  });
  navegacao.folheador = folheador;
  leitura.replaceChildren(barraDaLeitura(memoria, rota), cabeca, folheador.elemento);
  window.scrollTo(0, 0);
  // O teclado (as setas) já vira as páginas, se o foco estava na leitura
  if (leitura.contains(document.activeElement) || document.activeElement === leitura || document.activeElement === document.body) {
    folheador.elemento.focus({ preventScroll: true });
  }
}

function renderizarLeitura(pedida) {
  const { memoria, links } = navegacao.lida;
  fecharFolheador();
  if (livroEmPdf(memoria)) return renderizarLivro(memoria, pedida);
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
  carregarFontes(tipoDeMemoria(memoria.tipo)?.fontes ?? []);

  const aberta = criar("article", "memoria");
  aberta.dataset.tipo = memoria.tipo;
  aberta.append(linhaDaClassificacao(memoria));
  if (memoria.tipo !== "livro") aberta.append(...folhaDaMemoria(memoria, links));
  else if (capitulo === null) aberta.append(...capaEIndice(memoria));
  else aberta.append(...capituloDoLivro(memoria, capitulo, links));

  $("#leitura").replaceChildren(barraDaLeitura(memoria, rota), aberta);
  window.scrollTo(0, 0);
}

/* =================================================================
   Escrever e alterar (só o administrador)
   -----------------------------------------------------------------
   Um formulário só, aberto pelo "+ Memória" ou pelo "Alterar". No
   Livro, o texto dá lugar ao PDF do miolo e às imagens opcionais da
   capa, da lombada e da contracapa. Eles vão depois de salvar a
   memória, cada um pela sua rota, com o andamento do envio. O pdf.js
   lê o PDF aqui antes, para saber as páginas e o tamanho delas.

   Trocar a classificação: de outra para Livro, o texto sai (pergunta
   antes); de um Livro em PDF para outra, o PDF e as imagens saem ao
   salvar (pergunta antes); de um livro antigo para outra, os
   capítulos viram o texto. Nenhum livro é escrito por capítulos.
   ================================================================= */

// A ajuda abaixo do campo "detalhe", nas classificações que têm o campo
const AJUDA_DO_DETALHE = {
  carta: "Aparece no fim da carta.",
  recorte: "O nome do jornal. Ex.: Gazeta de Westna",
  trecho: "O nome da obra.",
  documento: "Aparece no fim, com o selo. Ex.: Conselho de Westna",
  inscricao: "Aparece abaixo da pedra. Ex.: Lápide no cemitério de Hando",
};

// As imagens do livro, cada uma com o que aparece sem ela
const IMAGENS_DO_LIVRO = [
  { parte: "capa", nome: "a capa", sem: "O couro, com o título" },
  { parte: "lombada", nome: "a lombada", sem: "A estante desenha uma" },
  { parte: "contracapa", nome: "a contracapa", sem: "O couro" },
];
const LIMITE_DO_MIOLO = 200 * 1024 * 1024; // como no servidor
const LIMITE_DA_IMAGEM = 10 * 1024 * 1024;
const TIPOS_DE_IMAGEM = ["image/png", "image/jpeg", "image/webp", "image/gif", "image/avif"];

const edicao = {
  memoria: null, // a memória sendo alterada, ou null para uma nova
  criadaAgora: false, // a memória nova já foi escrita, mas um arquivo do livro não foi
  tipo: null, // a classificação escolhida, para saber de qual se trocou
  // O livro: o PDF escolhido, com o que o pdf.js leu dele ({ arquivo, info }); e, de cada imagem,
  // a escolhida ({ arquivo, largura, altura, previa }) ou "tirar"
  miolo: null,
  lendoMiolo: null, // a leitura do PDF escolhido, enquanto não termina
  imagens: {},
};

const formMemoria = () => $("#form-memoria");

function opcoesDeMes(seletor, valor) {
  seletor.replaceChildren(new Option("Sem mês", ""), ...MESES.map((mes, i) => new Option(mes, String(i + 1))));
  seletor.value = valor ? String(valor) : "";
}

function opcoesDeDia(seletor, valor) {
  seletor.replaceChildren(new Option("Sem dia", ""));
  for (let dia = 1; dia <= 30; dia++) seletor.append(new Option(String(dia), String(dia)));
  seletor.value = valor ? String(valor) : "";
}

// Os capítulos de um livro antigo num texto só: o título de cada um vira uma linha em negrito
function textoDosCapitulos(capitulos) {
  return capitulos
    .map(({ titulo, texto }) => [titulo && `**${titulo}**`, texto].filter(Boolean).join("\n\n"))
    .filter(Boolean)
    .join("\n\n");
}

// "12,3 MB", ou "40 KB" num arquivo pequeno
function tamanhoDoArquivo(bytes) {
  const mega = bytes / (1024 * 1024);
  if (mega >= 1) return `${mega.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB`;
  return `${Math.max(1, Math.round(bytes / 1024)).toLocaleString("pt-BR")} KB`;
}

// O livro como está salvo (nada numa memória nova, ou que ainda não é Livro)
const livroSalvo = () => (edicao.memoria?.tipo === "livro" ? edicao.memoria.livro ?? null : null);
const livroAntigoNaEdicao = () => edicao.memoria?.tipo === "livro" && edicao.memoria.capitulos?.length > 0;

function mostrarFalhaNoFormulario(texto) {
  const erro = $("#erro-memoria");
  erro.textContent = texto;
  erro.hidden = !texto;
}

// O PDF: o escolhido (que vai ao salvar), o que o livro já tem, ou nenhum
function mostrarMiolo() {
  const texto = $("#livro-miolo-atual");
  const salvo = livroSalvo()?.miolo;
  if (edicao.miolo) {
    const { arquivo, info } = edicao.miolo;
    texto.textContent = `${arquivo.name}: ${quantasPaginas(info.paginas)}, ${tamanhoDoArquivo(arquivo.size)}. Vai quando você salvar.`;
  } else if (salvo) {
    texto.textContent = `${quantasPaginas(salvo.paginas)}, ${tamanhoDoArquivo(salvo.bytes)}.`;
  } else {
    texto.textContent = livroAntigoNaEdicao() ? "Nenhum ainda: o livro continua em capítulos." : "Nenhum ainda.";
  }
  $("#livro-miolo-escolher").textContent = edicao.miolo || salvo ? "Trocar o PDF" : "Escolher o PDF";
}

// A miniatura de cada imagem: a escolhida, a que o livro já tem, ou o que aparece sem ela
function mostrarImagem(parte) {
  const caixa = $(`.livro-form__imagem[data-parte="${parte}"]`);
  const escolhida = edicao.imagens[parte];
  const endereco = escolhida === "tirar" ? null : escolhida?.previa ?? livroSalvo()?.[parte]?.endereco ?? null;
  const miniatura = caixa.querySelector(".livro-form__miniatura");
  if (endereco) {
    const desenho = criar("img");
    desenho.alt = "";
    desenho.src = endereco;
    miniatura.replaceChildren(desenho);
  } else {
    miniatura.replaceChildren(criar("span", "livro-form__sem-imagem", IMAGENS_DO_LIVRO.find((i) => i.parte === parte).sem));
  }
  caixa.querySelector(".livro-form__tirar").hidden = !endereco;
  caixa.querySelector(".livro-form__escolher").textContent = endereco ? "Trocar" : "Escolher";
}

function mostrarLivro() {
  $("#livro-antigo").hidden = !livroAntigoNaEdicao();
  mostrarMiolo();
  for (const { parte } of IMAGENS_DO_LIVRO) mostrarImagem(parte);
}

function esquecerEscolhas() {
  for (const escolhida of Object.values(edicao.imagens)) if (escolhida?.previa) URL.revokeObjectURL(escolhida.previa);
  edicao.miolo = null;
  edicao.lendoMiolo = null;
  edicao.imagens = {};
}

// O PDF escolhido é lido aqui mesmo (as páginas e o tamanho); um arquivo que não serve não fica
async function escolherMiolo(arquivo) {
  mostrarFalhaNoFormulario("");
  if (arquivo.size > LIMITE_DO_MIOLO) return mostrarFalhaNoFormulario(`O PDF passa de 200 MB (tem ${tamanhoDoArquivo(arquivo.size)}).`);
  $("#livro-miolo-atual").textContent = `Lendo ${arquivo.name}…`;
  const leitura = lerInfoDoPdf(arquivo);
  edicao.lendoMiolo = leitura;
  try {
    const info = await leitura;
    if (edicao.lendoMiolo === leitura) edicao.miolo = { arquivo, info };
  } catch (falha) {
    if (edicao.lendoMiolo === leitura) mostrarFalhaNoFormulario(falha.message);
  } finally {
    if (edicao.lendoMiolo === leitura) edicao.lendoMiolo = null;
  }
  mostrarMiolo();
}

// A imagem escolhida: o tamanho dela (a estante usa a proporção da lombada) e a miniatura
async function escolherImagem(parte, arquivo) {
  mostrarFalhaNoFormulario("");
  if (!TIPOS_DE_IMAGEM.includes(arquivo.type)) return mostrarFalhaNoFormulario("Use imagens PNG, JPG, WEBP, GIF ou AVIF.");
  if (arquivo.size > LIMITE_DA_IMAGEM) return mostrarFalhaNoFormulario(`A imagem passa de 10 MB (tem ${tamanhoDoArquivo(arquivo.size)}).`);
  let medidas;
  try {
    const desenho = await createImageBitmap(arquivo);
    medidas = { largura: desenho.width, altura: desenho.height };
    desenho.close();
  } catch {
    return mostrarFalhaNoFormulario(`Não deu para abrir a imagem ${arquivo.name}.`);
  }
  const anterior = edicao.imagens[parte];
  if (anterior?.previa) URL.revokeObjectURL(anterior.previa);
  edicao.imagens[parte] = { arquivo, ...medidas, previa: URL.createObjectURL(arquivo) };
  mostrarImagem(parte);
}

// A que o livro já tem sai ao salvar; a que só foi escolhida, sai agora
function tirarImagemDoFormulario(parte) {
  const anterior = edicao.imagens[parte];
  if (anterior?.previa) URL.revokeObjectURL(anterior.previa);
  if (livroSalvo()?.[parte]) edicao.imagens[parte] = "tirar";
  else delete edicao.imagens[parte];
  mostrarImagem(parte);
}

// Trocar a classificação pode deixar o texto, ou o PDF, para trás: pergunta antes
async function trocarClassificacao() {
  const form = formMemoria();
  const nova = form.tipo.value;
  const antiga = edicao.tipo;
  const confirmar = (titulo, texto) => perguntar({ titulo, texto, confirmar: "Trocar", cancelar: "Cancelar", perigo: true });
  if (antiga !== "livro" && nova === "livro" && form.texto.value.trim()) {
    if (!(await confirmar("Trocar para Livro?", "O Livro é um PDF: o texto desta memória sai quando você salvar."))) {
      form.tipo.value = antiga;
      return;
    }
  }
  if (antiga === "livro" && nova !== "livro") {
    if (livroAntigoNaEdicao()) {
      // O livro antigo: os capítulos viram o texto
      if (!form.texto.value.trim()) form.texto.value = textoDosCapitulos(edicao.memoria.capitulos);
    } else if (livroSalvo()?.miolo || edicao.miolo || Object.keys(edicao.imagens).length) {
      if (!(await confirmar("Deixar de ser Livro?", "O PDF, as imagens e o índice deste livro saem quando você salvar."))) {
        form.tipo.value = antiga;
        return;
      }
    }
  }
  edicao.tipo = nova;
  mostrarCamposDoTipo();
}

// O "detalhe" leva o rótulo da classificação e some nas que não têm o campo;
// no Livro, o PDF e as imagens ficam no lugar do texto
function mostrarCamposDoTipo() {
  const tipo = tipoDeMemoria(formMemoria().tipo.value);
  const livro = tipo.id === "livro";
  $("#campo-detalhe").hidden = !tipo.detalhe;
  $("#rotulo-detalhe").textContent = tipo.detalhe ?? "";
  $("#ajuda-detalhe").textContent = AJUDA_DO_DETALHE[tipo.id] ?? "";
  $("#grupo-texto").hidden = livro;
  $("#ajuda-do-texto").hidden = livro;
  $("#grupo-livro").hidden = !livro;
  if (livro) mostrarLivro();
}

function mostrarTituloDaEdicao() {
  const alterando = Boolean(edicao.memoria);
  $("#memoria-form-titulo").textContent = alterando ? "Alterar memória" : "Nova memória";
  $("#memoria-enviar").textContent = alterando ? "Salvar" : "Escrever";
  $("#memoria-aviso").hidden = alterando && !edicao.criadaAgora;
  $("#memoria-apagar").hidden = !alterando;
}

function abrirEdicao(memoria = null) {
  if (!ehAdmin()) return;
  const form = formMemoria();
  form.reset();
  esquecerEscolhas();
  edicao.memoria = memoria;
  edicao.criadaAgora = false;
  $("#erro-memoria").hidden = true;
  $("#livro-envio").hidden = true;
  mostrarTituloDaEdicao();

  form.titulo.value = memoria?.titulo ?? "";
  form.tipo.replaceChildren(...TIPOS_DE_MEMORIA.map((t) => new Option(t.nome, t.id)));
  form.tipo.value = memoria?.tipo ?? TIPOS_DE_MEMORIA[0].id;
  edicao.tipo = form.tipo.value;
  form.detalhe.value = memoria?.detalhe ?? "";

  const data = memoria?.data;
  form.ano.value = data ? String(data.ano) : "";
  opcoesDeMes(form.mes, data?.mes);
  opcoesDeDia(form.dia, data?.dia);
  form.aprox.checked = Boolean(data?.aprox);

  form.texto.value = memoria?.texto ?? "";
  form.baixar.checked = Boolean(memoria?.livro?.baixar);
  mostrarCamposDoTipo();

  $("#dialogo-memoria").showModal();
  $(".memoria-form__campos").scrollTop = 0;
  form.titulo.focus();
}

// A data é opcional: sem o ano, a memória fica sem data
function dataDoFormulario() {
  const form = formMemoria();
  const mes = Number(form.mes.value) || null;
  if (form.ano.validity.badInput) throw new Error("O ano precisa ser um número inteiro, de 0 em diante.");
  if (form.ano.value === "") {
    if (mes) throw new Error("Escreva o ano, ou deixe o mês em branco.");
    return null;
  }
  const ano = Number(form.ano.value);
  if (!Number.isInteger(ano) || ano < 0) throw new Error("O ano precisa ser um número inteiro, de 0 em diante.");
  return { ano, mes, dia: mes ? Number(form.dia.value) || null : null, aprox: form.aprox.checked };
}

// Um livro novo (ou que acabou de virar Livro) precisa do PDF; um antigo continua em capítulos sem ele
function coletarMemoria() {
  const form = formMemoria();
  const titulo = form.titulo.value.trim();
  if (!titulo) throw new Error("Escreva o título da memória.");
  const tipo = tipoDeMemoria(form.tipo.value);
  const dados = { titulo, tipo: tipo.id, data: dataDoFormulario(), detalhe: tipo.detalhe ? form.detalhe.value.trim() : "" };
  if (tipo.id !== "livro") return { ...dados, texto: form.texto.value.trim() };
  if (!edicao.miolo && !livroSalvo()?.miolo && !livroAntigoNaEdicao()) throw new Error("Escolha o PDF do miolo do livro.");
  return { ...dados, baixar: form.baixar.checked };
}

// Uma falha antes de fechar o formulário aparece nele; depois, num aviso
function mostrarFalha(dialogo, erro, falha) {
  if (!dialogo.open) return avisarFalha(falha);
  erro.textContent = falha.message;
  erro.hidden = false;
}

// O andamento do envio do PDF e das imagens, embaixo do formulário
function mostrarEnvio(rotulo, fracao = null) {
  const andamento = $("#livro-envio");
  const barra = andamento.querySelector("progress");
  andamento.hidden = false;
  andamento.querySelector(".livro-form__envio-texto").textContent = fracao === null ? `${rotulo}…` : `${rotulo}: ${Math.round(fracao * 100)}%`;
  if (fracao === null) barra.removeAttribute("value");
  else barra.value = fracao;
}

// O PDF e as imagens escolhidas, um de cada vez. O que já foi fica no livro salvo: se um falhar,
// salvar de novo manda só o que faltou.
async function enviarArquivosDoLivro(id) {
  const guardar = (livro) => {
    if (edicao.memoria) edicao.memoria.livro = livro;
  };
  if (edicao.miolo) {
    const { arquivo, info } = edicao.miolo;
    mostrarEnvio("Enviando o PDF do miolo", 0);
    guardar((await api.enviarMiolo(id, arquivo, info, (fracao) => mostrarEnvio("Enviando o PDF do miolo", fracao))).livro);
    edicao.miolo = null;
    mostrarMiolo();
  }
  for (const { parte, nome } of IMAGENS_DO_LIVRO) {
    const escolhida = edicao.imagens[parte];
    if (!escolhida) continue;
    if (escolhida === "tirar") {
      mostrarEnvio(`Tirando ${nome}`);
      guardar((await api.tirarImagem(id, parte)).livro);
    } else {
      const rotulo = `Enviando ${nome}`;
      mostrarEnvio(rotulo, 0);
      const medidas = { largura: escolhida.largura, altura: escolhida.altura };
      guardar((await api.enviarImagem(id, parte, escolhida.arquivo, medidas, (fracao) => mostrarEnvio(rotulo, fracao))).livro);
      URL.revokeObjectURL(escolhida.previa);
    }
    delete edicao.imagens[parte];
    mostrarImagem(parte);
  }
}

// Depois de salvar, a leitura mostra a memória como ficou; a memória nova já abre na leitura.
// Um livro novo é escrito primeiro e recebe os arquivos depois: se um arquivo falhar, o
// formulário passa a alterar o livro que já existe.
async function enviarMemoria(evento) {
  evento.preventDefault();
  const dialogo = $("#dialogo-memoria");
  const erro = $("#erro-memoria");
  const enviar = $("#memoria-enviar");
  erro.hidden = true;
  enviar.disabled = true;
  try {
    if (edicao.lendoMiolo) {
      mostrarEnvio("Lendo o PDF");
      await edicao.lendoMiolo.catch(() => {});
    }
    let dados;
    try {
      dados = coletarMemoria();
    } catch (falha) {
      return mostrarFalha(dialogo, erro, falha);
    }
    const nova = !edicao.memoria || edicao.criadaAgora;
    let id = edicao.memoria?.id;
    if (edicao.memoria) {
      await api.alterar(id, dados);
      if (dados.tipo === "livro" && edicao.memoria.tipo !== "livro") {
        Object.assign(edicao.memoria, { tipo: "livro", capitulos: [], livro: { miolo: null, capa: null, lombada: null, contracapa: null, indice: [], baixar: dados.baixar } });
      }
    } else {
      id = (await api.escrever(dados)).memoria.id;
      edicao.memoria = { id, titulo: dados.titulo, tipo: dados.tipo, capitulos: [] };
      if (dados.tipo === "livro") edicao.memoria.livro = { miolo: null, capa: null, lombada: null, contracapa: null, indice: [], baixar: dados.baixar };
      edicao.criadaAgora = true;
      mostrarTituloDaEdicao();
    }
    if (dados.tipo === "livro") await enviarArquivosDoLivro(id);
    dialogo.close();
    avisoRapido(nova ? "Memória escrita. Ela fica escondida até você revelar." : "Memória salva.");
    await recarregar();
    if (nova) abrir({ id, capitulo: null });
    else if (navegacao.rota) await mostrarRota(navegacao.rota, { forcar: true });
  } catch (falha) {
    mostrarFalha(dialogo, erro, falha);
  } finally {
    enviar.disabled = false;
    $("#livro-envio").hidden = true;
  }
}

async function apagarMemoria() {
  const memoria = edicao.memoria;
  if (!memoria) return;
  const confirmado = await perguntar({
    titulo: "Apagar esta memória?",
    texto: `"${memoria.titulo}" sai das Memórias de Draevor de vez, também para quem já a leu.`,
    confirmar: "Apagar",
    cancelar: "Cancelar",
    perigo: true,
  });
  if (!confirmado) return;
  try {
    await api.apagar(memoria.id);
    $("#dialogo-memoria").close();
    await recarregar();
    voltarALista();
    avisoRapido("Memória apagada.");
  } catch (falha) {
    avisarFalha(falha);
  }
}

function configurarEdicao() {
  const form = formMemoria();
  form.addEventListener("submit", enviarMemoria);
  form.tipo.addEventListener("change", trocarClassificacao);
  $("#memoria-cancelar").addEventListener("click", () => $("#dialogo-memoria").close());
  $("#memoria-apagar").addEventListener("click", apagarMemoria);
  $("#citar-texto").addEventListener("click", () => abrirCitar(form.texto));
  $("#importar-texto").addEventListener("click", () => escolherArquivos(importarNoTexto));
  const escolha = $("#arquivo-md");
  escolha.addEventListener("change", () => {
    const arquivos = [...escolha.files];
    if (arquivos.length) importacao.aoEscolher?.(arquivos);
  });

  // O livro: o PDF e as imagens
  const miolo = $("#livro-miolo");
  $("#livro-miolo-escolher").addEventListener("click", () => {
    miolo.value = "";
    miolo.click();
  });
  miolo.addEventListener("change", () => {
    if (miolo.files[0]) escolherMiolo(miolo.files[0]);
  });
  for (const caixa of document.querySelectorAll(".livro-form__imagem")) {
    const parte = caixa.dataset.parte;
    const entrada = caixa.querySelector("input[type=file]");
    caixa.querySelector(".livro-form__escolher").addEventListener("click", () => {
      entrada.value = "";
      entrada.click();
    });
    entrada.addEventListener("change", () => {
      if (entrada.files[0]) escolherImagem(parte, entrada.files[0]);
    });
    caixa.querySelector(".livro-form__tirar").addEventListener("click", () => tirarImagemDoFormulario(parte));
  }
  $("#dialogo-memoria").addEventListener("close", esquecerEscolhas);
}

/* =================================================================
   Importar .md
   -----------------------------------------------------------------
   O texto de um arquivo .md (exportado do Word ou do Google Docs)
   vai para o texto da memória, no formulário. Tudo acontece aqui no
   navegador; nada vai para o servidor até "Escrever" ou "Salvar".
   ================================================================= */

const LIMITE_DO_ARQUIVO = 5 * 1024 * 1024; // 5 MB
const LIMITE_DO_TEXTO = 100000; // como no servidor

const milhar = (n) => n.toLocaleString("pt-BR");

// O Markdown no texto do portal, que só conhece **negrito**, *itálico*, parágrafos, listas com
// "- " ou "1. " e os links [[evento:...|...]] e [[personagem:...|...]]. Nenhuma palavra se perde:
// o resto das marcas sai e o texto fica. No Poema (versos), cada linha fica como está.
// Se o arquivo começa com "# Título" ou "## Título", ele sai do texto e volta como "titulo".
function textoDoMarkdown(md, { versos = false } = {}) {
  // O que não pode ser mexido no caminho (os links do portal, o código, os caracteres
  // escapados) fica guardado num sinal n e volta no fim
  const guardados = [];
  const guardar = (texto) => `${guardados.push(texto) - 1}`;
  const devolver = (texto) => texto.replace(/(\d+)/g, (_, i) => devolver(guardados[i]));
  const semEscapes = (texto) => texto.replace(/\\([!-\/:-@\[-`{-~])/g, "$1");

  // Negrito e itálico nas marcas do portal, que não põe um dentro do outro: o de dentro sai.
  // ***x*** vira negrito. Sem ênfase (nos títulos), as marcas saem todas.
  function enfase(texto, semEnfase) {
    const [N, n, I, i] = ["", "", "", ""];
    const marcado = texto
      .replace(/\*\*\*(?=\S)(.*?\S)\*\*\*/g, `${N}$1${n}`)
      .replace(/(?<![\p{L}\p{N}_])___(?=\S)(.*?\S)___(?![\p{L}\p{N}_])/gu, `${N}$1${n}`)
      .replace(/\*\*(?=\S)(.*?\S)\*\*/g, `${N}$1${n}`)
      .replace(/(?<![\p{L}\p{N}_])__(?=\S)(.*?\S)__(?![\p{L}\p{N}_])/gu, `${N}$1${n}`)
      .replace(/\*(?=\S)(.*?\S)\*/g, `${I}$1${i}`)
      .replace(/(?<![\p{L}\p{N}_])_(?=\S)(.*?\S)_(?![\p{L}\p{N}_])/gu, `${I}$1${i}`);
    let saida = "";
    let aberta = null; // a marca de fora, a única que fica
    let dentro = 0; // quantas iguais a ela abriram lá dentro
    for (const c of marcado) {
      if (c === N || c === I) {
        if (!aberta) {
          aberta = c;
          if (!semEnfase) saida += c === N ? "**" : "*";
        } else if (c === aberta) dentro++;
      } else if (c === n || c === i) {
        if ((c === n ? N : I) !== aberta) continue;
        if (dentro) dentro--;
        else {
          aberta = null;
          if (!semEnfase) saida += c === n ? "**" : "*";
        }
      } else saida += c;
    }
    return saida;
  }

  // Uma linha (ou um parágrafo já numa linha só) com as marcas de dentro do texto
  function emLinha(texto, semEnfase = false) {
    const limpo = texto
      .replace(/\\([!-\/:-@\[-`{-~])/g, (_, c) => guardar(c)) // \* \_ \# ...: o caractere sem a barra
      .replace(/(?<!`)(`+)(?!`)(.*?[^`])\1(?!`)/g, (_, __, codigo) => guardar(codigo.trim())) // `código`
      .replace(/!\[[^\]]*\](?:\((?:[^()]|\([^()]*\))*\)|\[[^\]]*\])?/g, "") // imagens
      .replace(/\[([^\]]*)\](?:\((?:[^()]|\([^()]*\))*\)|\[[^\]]*\])/g, "$1") // [texto](endereço) e [texto][ref]
      .replace(/<([a-z][a-z\d+.-]{1,31}:[^<>\s]*)>/gi, (_, endereco) => guardar(endereco)) // <http://...>
      .replace(/<!--.*?-->/g, "")
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<\/?[a-z][a-z\d-]*(?:\s[^<>]*)?\/?>/gi, "") // outras marcas HTML
      .replace(/~~(?=\S)(.*?\S)~~/g, "$1"); // riscado
    return devolver(enfase(limpo, semEnfase)).replace(/[ \t]+/g, " ").trim();
  }

  // Os links do portal ficam como estão: sem as barras que o Google Docs põe nos colchetes e,
  // se o texto quebrou no meio de um, numa linha só
  const fonte = String(md)
    .replace(/^﻿/, "")
    .replace(/\r\n?/g, "\n")
    .replace(/\t/g, "    ")
    .replace(
      /\\?\[\\?\[(evento|personagem):((?:\\.|[^\s|\]\\])+)\\?\|((?:(?!\n[ \t]*\n)[^\]])*?)\\?\]\\?\]/g,
      (_, alvo, id, aparece) => guardar(`[[${alvo}:${semEscapes(id)}|${semEscapes(aparece).replace(/\s*\n\s*/g, " ")}]]`),
    );
  // As linhas de referência ([image1]: <data:...>, [ref]: endereço) saem
  const linhas = fonte
    .split("\n")
    .filter((linha) => !/^ {0,3}\[[^\]\n]+\]:[ \t]*(?:<[^>\n]*>|\S+)(?:[ \t]+(?:"[^"\n]*"|'[^'\n]*'|\([^)\n]*\)))?[ \t]*$/.test(linha));
  const tirarCitacao = (linha) => linha.replace(/^(?: {0,3}> ?)+/, "");
  const temBarra = (linha) => /(^|[^\\])\|/.test(linha);
  const ehDivisa = (linha) => /^ *\|?(?: *:?-+:? *\|)+(?: *:?-+:? *)?$/.test(linha);
  const celulas = (linha) =>
    linha
      .replace(/^\|/, "")
      .replace(/(^|[^\\])\|$/, "$1")
      .split(/(?<!\\)\|/);

  // Os blocos: parágrafo (com as linhas que ficam), lista, tabela, título, separador e código.
  // Uma citação ("> ") só separa o que vem antes e depois dela.
  const blocos = [];
  let bloco = null; // o bloco aberto, que ainda recebe linhas
  let cerca = ""; // dentro de um bloco de código, a cerca que o fecha
  const novo = (tipo, citacao = false) => blocos.push((bloco = { tipo, citacao, partes: [] }));

  for (let l = 0; l < linhas.length; l++) {
    if (cerca) {
      const fim = linhas[l].trim();
      if (fim.length >= cerca.length && fim === cerca[0].repeat(fim.length)) {
        cerca = "";
        bloco = null;
      } else bloco.partes.push(linhas[l]);
      continue;
    }
    const linha = tirarCitacao(linhas[l]);
    const citacao = linha.length < linhas[l].length;
    const conteudo = linha.trim();
    if (!conteudo) {
      // Na lista, a linha em branco não fecha: um item do mesmo tipo logo depois continua nela
      if (bloco?.tipo === "lista") bloco.pausa = true;
      else bloco = null;
      continue;
    }
    if (bloco && bloco.citacao !== citacao) bloco = null;

    const abertura = conteudo.match(/^(`{3,})[^`]*$|^(~{3,})/);
    if (abertura) {
      cerca = abertura[1] || abertura[2];
      novo("codigo");
      continue;
    }
    if (/^([-*_])(?:[ \t]*\1){2,}$/.test(conteudo)) {
      bloco = null;
      blocos.push({ tipo: "separador" });
      continue;
    }
    const titulo = conteudo.match(/^(#{1,6})(?:[ \t]+(.*?))?(?:[ \t]+#+)?$/);
    if (titulo) {
      bloco = null;
      blocos.push({ tipo: "titulo", nivel: titulo[1].length, partes: [titulo[2] ?? ""] });
      continue;
    }
    if (bloco?.tipo === "tabela" && temBarra(conteudo)) {
      if (!ehDivisa(conteudo)) bloco.partes.push(celulas(conteudo));
      continue;
    }
    if (temBarra(conteudo) && l + 1 < linhas.length && ehDivisa(tirarCitacao(linhas[l + 1]).trim())) {
      novo("tabela", citacao);
      bloco.partes.push(celulas(conteudo));
      l++;
      continue;
    }

    // A quebra forçada no fim da linha: dois espaços, "\" ou <br>
    const forcada = / {2}$/.test(linha) || /(^|[^\\])(\\\\)*\\$/.test(conteudo) || /<br\s*\/?>$/i.test(conteudo);
    const texto = conteudo.replace(/(^|[^\\])((?:\\\\)*)\\$/, "$1$2").replace(/<br\s*\/?>$/i, "");
    const item = texto.match(/^(?:([-*+])|(\d{1,9})[.)])[ \t]+(.*)$/);
    if (item) {
      const numerada = Boolean(item[2]);
      if (bloco?.tipo !== "lista" || bloco.numerada !== numerada) {
        novo("lista", citacao);
        bloco.numerada = numerada;
      }
      bloco.pausa = false;
      bloco.partes.push({ marca: numerada ? `${Number(item[2])}. ` : "- ", texto: item[3] });
      continue;
    }
    // Uma linha que continua o item de cima junta-se a ele: o item não tem quebra de linha
    if (bloco?.tipo === "lista" && !bloco.pausa) {
      bloco.partes.at(-1).texto += ` ${texto}`;
      continue;
    }
    if (bloco?.tipo !== "paragrafo") {
      novo("paragrafo", citacao);
      bloco.quebrar = true;
    }
    // As linhas se juntam com um espaço; ficam separadas na quebra forçada e no Poema
    texto.split(/<br\s*\/?>/i).forEach((pedaco, p) => {
      if (p === 0 && !bloco.quebrar && !versos) bloco.partes[bloco.partes.length - 1] += ` ${pedaco}`;
      else bloco.partes.push(pedaco);
    });
    bloco.quebrar = forcada;
  }

  // Cada bloco no texto do portal; o que ficou vazio (uma imagem, por exemplo) sai
  const pedacos = [];
  for (const b of blocos) {
    let texto = "";
    let simples = null; // o título sem marcas, para o caso de ser o título do arquivo
    if (b.tipo === "paragrafo") texto = b.partes.map((p) => emLinha(p)).filter(Boolean).join("\n");
    else if (b.tipo === "lista") {
      texto = b.partes
        .map(({ marca, texto: item }) => {
          const convertido = emLinha(item);
          return convertido && marca + convertido;
        })
        .filter(Boolean)
        .join("\n");
    } else if (b.tipo === "tabela") {
      texto = b.partes
        .map((linha) => linha.map((c) => emLinha(c)).filter(Boolean).join(" · "))
        .filter(Boolean)
        .join("\n");
    } else if (b.tipo === "titulo") {
      simples = emLinha(b.partes[0], true);
      texto = simples && `**${simples}**`;
    } else if (b.tipo === "separador") texto = "⁂";
    else if (b.tipo === "codigo") {
      texto = b.partes
        .map((linha) => devolver(linha).replace(/[ \t]+/g, " ").trim())
        .join("\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
    }
    if (texto) pedacos.push({ texto, titulo: b.tipo === "titulo" && b.nivel <= 2 ? simples : null });
  }

  // Um título comprido demais para o campo não é o título do arquivo: fica no texto
  const titulo = pedacos[0]?.titulo && pedacos[0].titulo.length <= 120 ? pedacos.shift().titulo : "";
  return { titulo, texto: pedacos.map((p) => p.texto).join("\n\n") };
}

// Lê como UTF-8 (o TextDecoder já tira o BOM do começo). Com algum caractere que não deu
// para ler, lê de novo como windows-1252, como o Word às vezes salva.
async function lerArquivoDeTexto(arquivo) {
  const bytes = await arquivo.arrayBuffer();
  const texto = new TextDecoder("utf-8").decode(bytes);
  return texto.includes("�") ? new TextDecoder("windows-1252").decode(bytes) : texto;
}

// Lê e converte um arquivo. Todo motivo para não importar vira um erro com a mensagem.
async function converterArquivo(arquivo, versos) {
  const nome = arquivo.name;
  if (arquivo.size > LIMITE_DO_ARQUIVO) throw new Error(`O arquivo ${nome} passa de 5 MB.`);
  const { titulo, texto } = textoDoMarkdown(await lerArquivoDeTexto(arquivo), { versos });
  if (!texto) throw new Error(`O arquivo ${nome} não tem texto para importar.`);
  if (texto.length > LIMITE_DO_TEXTO) {
    throw new Error(`O arquivo ${nome} tem ${milhar(texto.length)} caracteres; o limite é ${milhar(LIMITE_DO_TEXTO)}.`);
  }
  return { nome, titulo, texto };
}

// Com texto na área, pergunta antes de trocar
async function podeTrocar(area) {
  if (!area.value.trim()) return true;
  return perguntar({
    titulo: "Trocar o texto atual pelo do arquivo?",
    texto: "O texto que está no formulário dá lugar ao do arquivo. Nada muda até você salvar a memória.",
    confirmar: "Trocar",
    cancelar: "Não",
    perigo: true,
  });
}

// Os botões "Importar" usam a mesma escolha de arquivo, escondida no formulário;
// cada um diz o que fazer com o que for escolhido
const importacao = { aoEscolher: null };

function escolherArquivos(aoEscolher) {
  const escolha = $("#arquivo-md");
  escolha.value = "";
  importacao.aoEscolher = aoEscolher;
  escolha.click();
}

// Nas memórias que não são Livro: o texto e, se estiver vazio, o título
async function importarNoTexto([arquivo]) {
  const form = formMemoria();
  try {
    const { nome, titulo, texto } = await converterArquivo(arquivo, form.tipo.value === "poema");
    if (!(await podeTrocar(form.texto))) return;
    form.texto.value = texto;
    if (titulo && !form.titulo.value.trim()) form.titulo.value = titulo;
    avisoRapido(`Texto importado de ${nome}.`);
  } catch (falha) {
    avisarFalha(falha);
  }
}

/* =================================================================
   Citar: uma busca pelos acontecimentos e personagens
   -----------------------------------------------------------------
   Escolher um põe [[evento:<id>|título]] ou [[personagem:<id>|nome]]
   onde estava o cursor. O "o que aparece" pode ser mudado depois,
   no próprio texto.
   ================================================================= */

const citacao = { area: null }; // a área de texto que recebe o link

// Um colchete no título fecharia o link antes da hora: vira parêntese
const semColchetes = (texto) => texto.replace(/\[/g, "(").replace(/\]/g, ")");

function abrirCitar(area) {
  citacao.area = area;
  const busca = $("#citar-busca");
  busca.value = "";
  renderizarCitaveis();
  $("#dialogo-citar").showModal();
  $("#citar-resultados").scrollTop = 0;
  busca.focus();
}

function itemCitavel(nome, extra, trecho) {
  const item = criar("button", "citar__item");
  item.type = "button";
  item.append(criar("span", "citar__nome", nome));
  if (extra) item.append(criar("span", "citar__extra", extra));
  item.addEventListener("click", () => inserirCitacao(trecho));
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

// Sem acentos e sem diferença de maiúsculas
function renderizarCitaveis() {
  const termo = normalizar($("#citar-busca").value.trim());
  const achou = (texto) => !termo || normalizar(texto).includes(termo);
  const { acontecimentos, personagens } = estado.citaveis;
  const eventos = acontecimentos
    .filter((ev) => achou(ev.titulo))
    .map((ev) => itemCitavel(ev.titulo, `${ev.ano} ED`, `[[evento:${ev.id}|${semColchetes(ev.titulo)}]]`));
  const pessoas = personagens
    .filter((p) => achou(p.nome))
    .map((p) => itemCitavel(p.nome, "", `[[personagem:${p.id}|${semColchetes(p.nome)}]]`));
  const resultados = $("#citar-resultados");
  if (!eventos.length && !pessoas.length) {
    const nada = acontecimentos.length || personagens.length ? "Nada encontrado." : "Nenhum acontecimento ou personagem para citar ainda.";
    resultados.replaceChildren(criar("p", "citar__vazio", nada));
    return;
  }
  resultados.replaceChildren(...grupoCitavel("Acontecimentos", eventos), ...grupoCitavel("Personagens", pessoas));
}

// O link entra onde estava o cursor (ou no lugar do que estava selecionado), e o cursor fica depois dele
function inserirCitacao(trecho) {
  const area = citacao.area;
  $("#dialogo-citar").close();
  if (!area?.isConnected) return;
  area.focus();
  area.setRangeText(trecho, area.selectionStart, area.selectionEnd, "end");
}

function configurarCitar() {
  const busca = $("#citar-busca");
  const itens = () => [...document.querySelectorAll("#citar-resultados .citar__item")];
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
  $("#citar-resultados").addEventListener("keydown", (evento) => {
    if (evento.key !== "ArrowDown" && evento.key !== "ArrowUp") return;
    const lista = itens();
    const i = lista.indexOf(document.activeElement);
    if (i < 0) return;
    evento.preventDefault();
    const proximo = lista[evento.key === "ArrowDown" ? i + 1 : i - 1];
    if (proximo) proximo.focus();
    else if (evento.key === "ArrowUp") busca.focus();
  });
  $("#citar-cancelar").addEventListener("click", () => $("#dialogo-citar").close());
  fecharAoClicarFora($("#dialogo-citar"));
}

/* =================================================================
   Revelar (só o administrador)
   -----------------------------------------------------------------
   Ninguém (escondida de novo), todos ou só algumas contas. As contas
   para marcar são todas, menos as de administrador, que já veem tudo.
   ================================================================= */

const revelar = { memoria: null };

const formRevelar = () => $("#form-revelar");

function caixaDaConta(conta, marcada) {
  const entrada = criar("input");
  entrada.type = "checkbox";
  entrada.name = "contas";
  entrada.value = conta.usuario;
  entrada.checked = marcada;
  const marca = criar("span", "caixa__marca");
  marca.setAttribute("aria-hidden", "true");
  const caixa = criar("label", "caixa");
  caixa.append(entrada, marca, criar("span", null, conta.nome));
  return caixa;
}

// As contas só aparecem na terceira escolha
function mostrarContas() {
  $("#grupo-contas").hidden = formRevelar().para.value !== "contas";
}

function abrirRevelacao(memoria) {
  if (!ehAdmin() || !memoria.revelacao) return;
  revelar.memoria = memoria;
  const form = formRevelar();
  form.reset();
  $("#erro-revelar").hidden = true;
  $("#revelar-memoria").textContent = memoria.titulo;
  form.para.value = memoria.revelacao.para;
  const marcadas = new Set(memoria.revelacao.contas);
  $("#escolha-contas").replaceChildren(
    ...(estado.contas.length
      ? estado.contas.map((c) => caixaDaConta(c, marcadas.has(c.usuario)))
      : [criar("p", "escolhas__vazio", "Nenhuma conta além da do administrador.")]),
  );
  mostrarContas();
  $("#dialogo-revelar").showModal();
  form.querySelector('input[name="para"]:checked')?.focus();
}

function avisoDaRevelacao(escolha) {
  if (escolha.para === "ninguem") return "A memória está escondida.";
  if (escolha.para === "todos") return "Memória revelada para todos.";
  return `Memória revelada só para ${listaDeNomes(escolha.contas)}.`;
}

// Salvar chama a rota de revelação e recarrega a lista e a leitura
async function enviarRevelacao(evento) {
  evento.preventDefault();
  const form = formRevelar();
  const dialogo = $("#dialogo-revelar");
  const erro = $("#erro-revelar");
  const enviar = $("#revelar-enviar");
  erro.hidden = true;
  const para = form.para.value;
  const contas = [...form.querySelectorAll('input[name="contas"]:checked')].map((caixa) => caixa.value);
  if (para === "contas" && !contas.length) {
    return mostrarFalha(dialogo, erro, new Error('Marque pelo menos uma conta, ou escolha "Ninguém".'));
  }
  const escolha = para === "contas" ? { para, contas } : { para };
  enviar.disabled = true;
  try {
    await api.revelar(revelar.memoria.id, escolha);
    dialogo.close();
    avisoRapido(avisoDaRevelacao(escolha));
    await recarregar();
    if (navegacao.rota) await mostrarRota(navegacao.rota, { forcar: true });
  } catch (falha) {
    mostrarFalha(dialogo, erro, falha);
  } finally {
    enviar.disabled = false;
  }
}

function configurarRevelacao() {
  const form = formRevelar();
  form.addEventListener("submit", enviarRevelacao);
  form.addEventListener("change", (evento) => {
    if (evento.target.name === "para") mostrarContas();
  });
  $("#revelar-cancelar").addEventListener("click", () => $("#dialogo-revelar").close());
}

/* =================================================================
   Carregar
   ================================================================= */

async function recarregar() {
  const dados = await api.memorias();
  Object.assign(estado, {
    conta: dados.conta,
    memorias: dados.memorias,
    contas: dados.contas ?? [],
    citaveis: dados.citaveis ?? { acontecimentos: [], personagens: [] },
  });
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
  configurarBiblioteca();
  configurarEdicao();
  configurarCitar();
  configurarRevelacao();
  iniciarCinzas(30);
  if (MODO_PREVIA) configurarSimulacao();

  try {
    await recarregar();
  } catch (falha) {
    if (falha.codigo === "sem-sessao") return irParaEntrada({ voltar: true });
    $("#pagina").hidden = false;
    $("#biblioteca").hidden = true;
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
