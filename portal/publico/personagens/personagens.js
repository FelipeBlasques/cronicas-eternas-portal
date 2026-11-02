/* =================================================================
   Crônicas Eternas: Personagens
   -----------------------------------------------------------------
   A galeria de todos os personagens de Draevor: os dos jogadores,
   que têm card na página Mesas, e os NPCs e personagens sem conta
   no portal, cadastrados aqui pelo administrador ou por um editor.
   Os editores alteram qualquer personagem que veem; apagar e
   escolher quem vê ficam com o administrador. Os caídos continuam
   na galeria, como lápides.

   A ficha aberta tem quatro abas, presas ao lado do quadro: Geral,
   Detalhes, Jornada e Textos. A Geral sai na hora, com os dados da
   lista; as outras chegam com a ficha completa, pedida ao abrir.
   O formulário de cadastrar e alterar tem três abas no alto: Geral,
   Detalhes e Textos, com o "Citar" das Memórias.

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

// A ficha completa da aba Detalhes, na ordem em que aparece: chave, rótulo e tipo, como no
// servidor/personagens.js. O Nome, que vem primeiro, é o "nome" de sempre.
const CAMPOS_DOS_DETALHES = [
  ["titulos", "Títulos", "lista"],
  ["apelidos", "Apelidos", "lista"],
  ["nomeReal", "Nome Real", "texto"],
  ["lar", "Lar", "texto"],
  ["laresAnteriores", "Lares Anteriores", "lista"],
  ["genero", "Gênero", "texto"],
  ["especie", "Espécie", "texto"],
  ["ocupacao", "Ocupação", "texto"],
  ["idade", "Idade", "texto"],
  ["religiao", "Religião", "texto"],
  ["linguagens", "Linguagem", "lista"],
  ["nascimento", "Nascimento", "marco"],
  ["transformado", "Transformado", "marco"],
  ["morte", "Morte", "marco"],
  ["destruido", "Destruído", "marco"],
  ["pais", "Pais", "lista"],
  ["irmaos", "Irmãos", "lista"],
  ["filhos", "Filhos", "lista"],
  ["parentes", "Parentes", "lista"],
  ["regenciaInicio", "Começo da Regência", "data"],
  ["regenciaFim", "Término da Regência", "data"],
  ["predecessor", "Predecessor", "texto"],
  ["sucessor", "Sucessor", "texto"],
  ["alinhamento", "Alinhamento", "texto"],
  ["nivel", "Nível de Desafio / Nível", "texto"],
  ["classe", "Classe", "texto"],
  ["frases", "Frases", "lista"],
];

// Os limites da ficha, como no servidor/personagens.js
const LIMITES_DA_FICHA = {
  texto: 120, // um campo de texto dos Detalhes
  itens: 20, // itens de uma lista
  item: 160, // cada item de uma lista
  frase: 300, // cada item das Frases
  onde: 80, // o "onde" de um marco
  link: 120, // o que aparece num link, como nas Memórias
  caixas: 20,
  tituloDaCaixa: 80,
  textoDaCaixa: 20000,
};

// O destaque aponta um item de uma destas listas dos Detalhes
const LISTA_DO_DESTAQUE = { titulo: "titulos", frase: "frases" };

// Um link no texto, como nas Memórias: [[evento:<id>|o que aparece]] ou [[personagem:<id>|o que aparece]]
const REGEX_LINK = /\[\[(evento|personagem):([^\]|\n]+)\|([^\]\n]*)\]\]/g;

// Só o que aparece de cada link, para o card e a busca, que não sabem quais alvos a conta vê
const semLinks = (texto) => String(texto || "").replace(REGEX_LINK, (_, alvo, id, aparece) => aparece);

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
  // Os Detalhes, a Jornada, os Textos e os links de um personagem
  ficha: (id) => pedir("GET", caminhoDe("/api/galeria/ficha", id)),
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

// Os Detalhes com tudo vazio, como o servidor cria: texto "", lista [], data e marco null
function detalhesVazios() {
  const vazio = { texto: () => "", lista: () => [], data: () => null, marco: () => null };
  return Object.fromEntries(CAMPOS_DOS_DETALHES.map(([chave, , tipo]) => [chave, vazio[tipo]()]));
}

// Guardado como no dados.json do servidor; a galeria() e a ficha() montam o que a página recebe
function exemplosDaPrevia() {
  // Um busto desenhado aqui mesmo, para a prévia mostrar retratos sem depender de arquivos
  const retratoDeExemplo = (fundo, cor) =>
    `data:image/svg+xml,${encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 300"><defs><linearGradient id="f" x1="0" y1="0" x2="0" y2="1">` +
        `<stop offset="0" stop-color="${fundo}"/><stop offset="1" stop-color="#0e0c0b"/></linearGradient></defs>` +
        `<rect width="200" height="300" fill="url(#f)"/><circle cx="100" cy="112" r="34" fill="${cor}"/>` +
        `<path d="M28 300c4-74 36-118 72-118s68 44 72 118z" fill="${cor}"/></svg>`,
    )}`;
  // Os Detalhes, a queda, o destaque e os textos no formato do servidor/personagens.js;
  // cada exemplo diz só os campos dos Detalhes que tem
  const fichaDe = ({ detalhes = {}, ...campos }) => ({
    situacao: "vivo",
    queda: null,
    destaque: null,
    textos: [],
    ...campos,
    detalhes: { ...detalhesVazios(), ...detalhes },
  });
  const doPortal = (campos) => fichaDe({ fonte: "gotica", retrato: null, ...campos });
  const outro = (campos) =>
    fichaDe({
      fonte: "gotica",
      retrato: null,
      papel: "npc",
      jogador: "",
      mesas: [],
      visibilidade: "todos",
      registradoPor: "mestre",
      registradoNome: "Mestre",
      criadoEm: "2026-10-19T21:00:00.000Z",
      alteradoEm: "2026-10-19T21:00:00.000Z",
      ...campos,
    });
  const data = (ano, mes = null, dia = null, aprox = false) => ({ ano, mes, dia, aprox });
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
      // Um título como destaque e um link para a ficha da Dona Hilda num dos títulos
      doPortal({
        id: "p1",
        nome: "Venti",
        dono: "comuna",
        campanha: "ode-to-sleep",
        fonte: "elfica",
        retrato: retratoDeExemplo("#3a4670", "#9fb0c8"),
        detalhes: {
          titulos: ["O Bardo Insone", "Voz da [[personagem:npc-2c3d4e5f|Lanterna Torta]]"],
          apelidos: ["Vento"],
          especie: "Meio-elfo",
          ocupacao: "Músico errante",
          idade: "27 anos",
          linguagens: ["Comum", "Élfico"],
          classe: "Bardo 7",
          frases: ["Enquanto eu tocar, a cidade não dorme."],
        },
        destaque: { tipo: "titulo", indice: 0 },
        textos: [
          {
            titulo: "História",
            texto:
              "Chegou à cidade com um alaúde rachado e **nenhuma** lembrança de onde veio.\n\nDesde [[evento:e11|a noite da canção]], *não dorme mais*.",
          },
        ],
      }),
      doPortal({
        id: "p2",
        nome: "Alisaie",
        dono: "takezo",
        campanha: "ode-to-sleep",
        fonte: "romana",
        retrato: retratoDeExemplo("#6e332d", "#d8b98a"),
        detalhes: {
          titulos: ["Estudiosa do Ciclo de Sylara, desconfia de toda melodia antiga."],
          especie: "Elfa",
          classe: "Maga 7",
        },
        destaque: { tipo: "titulo", indice: 0 },
        textos: [
          {
            titulo: "História",
            texto: "Viu [[personagem:npc-1b2c3d4e|o guardião da ponte]] cair e jurou descobrir quem canta na torre.",
          },
        ],
      }),
      doPortal({
        id: "p3",
        nome: "Personagem de Frati",
        dono: "frati",
        campanha: "ode-to-sleep",
        situacao: "aposentado",
        detalhes: {
          titulos: ["Pendurou o machado depois da canção e abriu uma forja perto do porto."],
          especie: "Anão",
          ocupacao: "Ferreiro",
          classe: "Guerreiro 6",
        },
        destaque: { tipo: "titulo", indice: 0 },
      }),
      // Só a Geral e a Jornada
      doPortal({ id: "p4", nome: "Personagem de Neia", dono: "neia", campanha: "ode-to-sleep" }),
      // Um caído sem a data da Morte, só com o epitáfio
      doPortal({
        id: "p5",
        nome: "Personagem de Comuna",
        dono: "comuna",
        campanha: "remissao",
        situacao: "caido",
        queda: { epitafio: "Ninguém anotou o dia em que caiu." },
        detalhes: { especie: "Humano", classe: "Ladino 5" },
      }),
      doPortal({
        id: "p6",
        nome: "Personagem de Neia",
        dono: "neia",
        campanha: "remissao",
        retrato: retratoDeExemplo("#34503a", "#b9c9a4"),
        detalhes: {
          titulos: ["Atravessou o Passo Negro carregando os feridos nas costas."],
          especie: "Humana",
          classe: "Clériga 5",
        },
        destaque: { tipo: "titulo", indice: 0 },
      }),
    ],
    // NPCs cadastrados aqui na galeria
    outrosPersonagens: [
      // A ficha bem completa: uma frase como destaque, a família com links (a filha é a Voz na Torre,
      // que só o administrador vê: para os outros, o nome fica sem link) e duas caixas de texto
      outro({
        id: "npc-0a1b2c3d",
        nome: "Ysolde, a Guardiã",
        fonte: "uncial",
        retrato: retratoDeExemplo("#4a5560", "#c8cdd0"),
        mesas: ["primeira-mesa"],
        situacao: "desaparecido",
        detalhes: {
          titulos: ["Guardiã do Gelo", "Senhora de Westna"],
          apelidos: ["A Guardiã", "Sol"],
          nomeReal: "Ysolde Varn",
          lar: "As ruínas sob o gelo",
          laresAnteriores: ["Westna", "O Passo Negro"],
          genero: "Feminino",
          especie: "Humana",
          ocupacao: "Paladina da Ordem do Gelo",
          idade: "35 anos quando sumiu",
          religiao: "A Chama Quieta",
          linguagens: ["Comum", "Anão", "Primordial"],
          nascimento: { data: data(296, 4, 12), onde: "Westna" },
          pais: ["Aldren Varn", "[[personagem:npc-2c3d4e5f|Dona Hilda]], mãe de criação"],
          irmaos: ["[[personagem:npc-1b2c3d4e|Bram]], irmão de juramento"],
          filhos: ["[[personagem:npc-3d4e5f60|Lianne]]"],
          regenciaInicio: data(324, null, null, true),
          regenciaFim: data(331, 9),
          predecessor: "Aldren Varn, o Velho",
          alinhamento: "Leal e Bom",
          nivel: "ND 9",
          classe: "Paladina",
          frases: ["O gelo guarda o que a gente esquece.", "Quem desce comigo volta comigo."],
        },
        destaque: { tipo: "frase", indice: 0 },
        textos: [
          {
            titulo: "Descrição",
            texto:
              "Alta, de cabelo cor de cinza e uma cicatriz que atravessa a sobrancelha. Usa a armadura da ordem até fora de serviço.\n\nCarrega sempre:\n- o escudo com o brasão de Westna;\n- uma lanterna que *nunca* apaga.",
          },
          {
            titulo: "História",
            texto:
              "Governou Westna até [[evento:e7|encontrar as ruínas sob o gelo]] e descer sozinha.\n\nDizem que ainda ouve **a voz da filha**, e que é por isso que [[evento:e12|o culto]] a procura.",
          },
        ],
      }),
      // O caído com a Morte e o epitáfio
      outro({
        id: "npc-1b2c3d4e",
        nome: "Bram, o guardião da ponte",
        fonte: "ferro",
        retrato: retratoDeExemplo("#6b4a2e", "#c9a37a"),
        mesas: ["ode-to-sleep"],
        situacao: "caido",
        queda: { epitafio: "Ninguém passou pela ponte enquanto ele esteve de pé." },
        detalhes: {
          titulos: ["Guardou a ponte velha por trinta invernos."],
          especie: "Meio-orc",
          ocupacao: "Guardião da ponte velha",
          idade: "c. 50 anos",
          morte: { data: data(365, 4, 22), onde: "A ponte velha" },
          irmaos: ["[[personagem:npc-0a1b2c3d|Ysolde]], irmã de juramento"],
          classe: "Guerreiro",
        },
        destaque: { tipo: "titulo", indice: 0 },
      }),
      // Sem Detalhes, Textos nem acontecimentos: a ficha fica sem abas
      outro({
        id: "npc-2c3d4e5f",
        nome: "Dona Hilda",
        fonte: "caligrafia",
        mesas: ["remissao", "ode-to-sleep"],
        registradoPor: "takezo",
        registradoNome: "Takezo",
      }),
      outro({
        id: "npc-3d4e5f60",
        nome: "A Voz na Torre",
        fonte: "tinta",
        mesas: ["ode-to-sleep"],
        detalhes: {
          nomeReal: "Lianne Varn",
          especie: "Desconhecida",
          pais: ["[[personagem:npc-0a1b2c3d|Ysolde]]"],
          frases: ["Durmam, durmam: a torre vigia."],
        },
        destaque: { tipo: "frase", indice: 0 },
        textos: [{ titulo: "Notas do mestre", texto: "Canta da torre todas as noites. O grupo ainda não a encontrou." }],
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

  const numaLinha = (valor) => valor.replace(/\s*\n\s*/g, " ");

  // Todo link precisa mostrar alguma coisa, e no máximo 120 caracteres
  function conferirLinks(texto, campo) {
    for (const [, , , aparece] of texto.matchAll(REGEX_LINK)) {
      if (!aparece.trim()) {
        throw erroComCodigo(`Um link no campo ${campo} está sem o que aparece. Escreva depois da barra: [[evento:id|o que aparece]].`);
      }
      if (aparece.length > LIMITES_DA_FICHA.link) {
        throw erroComCodigo(`O que aparece num link pode ter no máximo ${LIMITES_DA_FICHA.link} caracteres (campo ${campo}).`);
      }
    }
  }

  // Uma data no Ciclo de Sylara, com as regras da Linha do Tempo. Vazia: null.
  function dataDoDetalhe(bruta, rotulo) {
    if (!bruta) return null;
    const { ano } = bruta;
    if (!Number.isInteger(ano) || ano < 0 || ano > banco.anoAtual) {
      throw erroComCodigo(`O ano precisa ser um número inteiro de 0 a ${banco.anoAtual} (campo ${rotulo}).`);
    }
    const numero = (valor, max, mensagem) => {
      if (valor === null || valor === undefined || valor === "" || valor === 0) return null;
      if (!Number.isInteger(valor) || valor < 1 || valor > max) throw erroComCodigo(`${mensagem} (campo ${rotulo}).`);
      return valor;
    };
    const mes = numero(bruta.mes, 10, "Escolha um mês da lista");
    const dia = mes ? numero(bruta.dia, 30, "Escolha um dia de 1 a 30") : null;
    return { ano, mes, dia, aprox: bruta.aprox === true };
  }

  // A ficha completa, campo a campo. "morteMantida": quando quem envia não muda a Morte (o dono),
  // ela fica como está e o que veio no envio é ignorado.
  function detalhesDe(bruto, morteMantida) {
    const corpo = bruto && typeof bruto === "object" && !Array.isArray(bruto) ? bruto : {};
    const detalhes = {};
    for (const [chave, rotulo, tipo] of CAMPOS_DOS_DETALHES) {
      if (chave === "morte" && morteMantida !== undefined) {
        detalhes.morte = morteMantida;
        continue;
      }
      const valor = corpo[chave];
      if (tipo === "texto") {
        detalhes[chave] = numaLinha(textoOpcional(valor, rotulo, LIMITES_DA_FICHA.texto));
        conferirLinks(detalhes[chave], rotulo);
      } else if (tipo === "lista") {
        const max = chave === "frases" ? LIMITES_DA_FICHA.frase : LIMITES_DA_FICHA.item;
        const itens = (Array.isArray(valor) ? valor : []).map((item) => (typeof item === "string" ? numaLinha(item.trim()) : "")).filter(Boolean);
        for (const item of itens) {
          if (item.length > max) throw erroComCodigo(`Cada item do campo ${rotulo} pode ter no máximo ${max} caracteres.`);
          conferirLinks(item, rotulo);
        }
        if (itens.length > LIMITES_DA_FICHA.itens) {
          throw erroComCodigo(`O campo ${rotulo} pode ter no máximo ${LIMITES_DA_FICHA.itens} itens.`);
        }
        detalhes[chave] = itens;
      } else if (tipo === "data") {
        detalhes[chave] = dataDoDetalhe(valor, rotulo);
      } else if (valor && typeof valor === "object") {
        const data = dataDoDetalhe(valor.data, rotulo);
        const onde = numaLinha(textoOpcional(valor.onde, `${rotulo} (onde)`, LIMITES_DA_FICHA.onde));
        detalhes[chave] = data || onde ? { data, onde } : null;
      } else {
        detalhes[chave] = null;
      }
    }
    return detalhes;
  }

  // As caixas de texto livre. Uma caixa toda vazia sai; com texto, precisa de título.
  function caixasDe(lista) {
    const caixas = [];
    (Array.isArray(lista) ? lista : []).forEach((bruta, i) => {
      const caixa = bruta && typeof bruta === "object" ? bruta : {};
      const titulo = numaLinha(textoOpcional(caixa.titulo, `Título da caixa ${i + 1}`, LIMITES_DA_FICHA.tituloDaCaixa));
      const texto = textoOpcional(caixa.texto, `Texto da caixa ${i + 1}`, LIMITES_DA_FICHA.textoDaCaixa);
      if (!titulo && !texto) return;
      if (!titulo) throw erroComCodigo(`Preencha o campo Título da caixa ${i + 1}.`);
      conferirLinks(texto, `Texto da caixa ${i + 1}`);
      caixas.push({ titulo, texto });
    });
    if (caixas.length > LIMITES_DA_FICHA.caixas) {
      throw erroComCodigo(`A aba Textos pode ter no máximo ${LIMITES_DA_FICHA.caixas} caixas.`);
    }
    return caixas;
  }

  // Os Detalhes, o Título ou Frase e os Textos. O destaque aponta um item que existe, ou fica null.
  function conteudoDe(dados, morteMantida) {
    const detalhes = detalhesDe(dados.detalhes, morteMantida);
    const bruto = dados.destaque;
    const lista = bruto && Object.hasOwn(LISTA_DO_DESTAQUE, bruto.tipo) ? detalhes[LISTA_DO_DESTAQUE[bruto.tipo]] : null;
    const valido = lista && Number.isInteger(bruto.indice) && bruto.indice >= 0 && bruto.indice < lista.length;
    return { detalhes, destaque: valido ? { tipo: bruto.tipo, indice: bruto.indice } : null, textos: caixasDe(dados.textos) };
  }

  // O epitáfio só vale para os caídos; a data da queda é a Morte dos Detalhes
  function situacaoDe(dados) {
    const situacao = dados.situacao ?? "vivo";
    if (!Object.hasOwn(ROTULOS_SITUACAO, situacao)) {
      throw erroComCodigo("Escolha a situação: vivo, caído, desaparecido ou aposentado.");
    }
    const bruta = situacao === "caido" && dados.queda && typeof dados.queda === "object" ? dados.queda : null;
    const epitafio = bruta ? textoOpcional(bruta.epitafio, "Epitáfio", 160) : "";
    return { situacao, queda: epitafio ? { epitafio } : null };
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
      ...conteudoDe(dados),
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

  const dataOuNada = (data) => (data ? dataPublica(data, true) : null);

  // O item que o destaque aponta, se ele ainda existir
  function destaqueValido(p) {
    const d = p.destaque;
    const lista = d && Object.hasOwn(LISTA_DO_DESTAQUE, d.tipo) ? p.detalhes[LISTA_DO_DESTAQUE[d.tipo]] : null;
    return lista && Number.isInteger(d.indice) && lista[d.indice] ? { tipo: d.tipo, indice: d.indice } : null;
  }

  function destaqueResolvido(p) {
    const d = destaqueValido(p);
    return d ? { tipo: d.tipo, texto: p.detalhes[LISTA_DO_DESTAQUE[d.tipo]][d.indice] } : null;
  }

  // O que o card precisa. Nos caídos, "Caiu em …" usa a data da Morte.
  function cardPublico(p) {
    const data = p.detalhes.morte?.data || null;
    const epitafio = p.queda?.epitafio || "";
    const queda = p.situacao === "caido" && (data || epitafio) ? { data: dataOuNada(data), epitafio } : null;
    return { situacao: p.situacao, queda, destaque: destaqueResolvido(p), apelidos: [...p.detalhes.apelidos] };
  }

  function detalhesPublicos(d) {
    const publicos = {};
    for (const [chave, , tipo] of CAMPOS_DOS_DETALHES) {
      const valor = d[chave];
      if (tipo === "texto") publicos[chave] = valor || "";
      else if (tipo === "lista") publicos[chave] = [...(valor || [])];
      else if (tipo === "data") publicos[chave] = dataOuNada(valor);
      else publicos[chave] = valor ? { data: dataOuNada(valor.data), onde: valor.onde || "" } : null;
    }
    return publicos;
  }

  /* ---------- Links nos textos, como no servidor/memorias.js ---------- */

  // Os personagens que a conta vê: os do portal sempre; os outros, se não forem só do administrador
  const personagensVisiveis = () => [...banco.personagens, ...banco.outrosPersonagens.filter(podeVerOutro)];

  // Os textos que podem ter links: os campos de texto e os itens das listas dos Detalhes e o texto das caixas
  function textosComLinks(p) {
    const textos = [];
    for (const [chave, , tipo] of CAMPOS_DOS_DETALHES) {
      if (tipo === "texto") textos.push(p.detalhes[chave]);
      else if (tipo === "lista") textos.push(...p.detalhes[chave]);
    }
    for (const caixa of p.textos) textos.push(caixa.texto);
    return textos.filter((t) => typeof t === "string" && t);
  }

  // Só os alvos que a conta pode ver. Os outros, e os que foram apagados, ficam só como texto na página.
  function linksPara(textos) {
    const acontecimentos = new Map(banco.acontecimentos.map((ev) => [ev.id, ev]));
    const personagens = new Map(personagensVisiveis().map((p) => [p.id, p]));
    const links = {};
    for (const texto of textos) {
      for (const [, alvo, id] of texto.matchAll(REGEX_LINK)) {
        const chave = `${alvo}:${id}`;
        if (chave in links) continue;
        if (alvo === "evento") {
          const ev = acontecimentos.get(id);
          if (ev && podeVer(ev)) links[chave] = { titulo: ev.titulo };
        } else {
          const personagem = personagens.get(id);
          if (personagem) links[chave] = { nome: personagem.nome };
        }
      }
    }
    return links;
  }

  // O que o "Citar" do formulário oferece: só o que a conta vê
  function citaveis() {
    const acontecimentos = banco.acontecimentos
      .filter(podeVer)
      .sort((a, b) => chaveDaData(a.data) - chaveDaData(b.data))
      .map((ev) => ({ id: ev.id, titulo: ev.titulo, ano: ev.data.ano }));
    const personagens = personagensVisiveis()
      .map((p) => ({ id: p.id, nome: p.nome }))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    return { acontecimentos, personagens };
  }

  // Os acontecimentos que a conta pode ver e que citam o personagem, do mais antigo ao mais recente
  function jornadaDe(id) {
    return banco.acontecimentos
      .filter((ev) => podeVer(ev) && ev.personagens.includes(id))
      .sort((a, b) => chaveDaData(a.data) - chaveDaData(b.data))
      .map((ev) => ({ id: ev.id, titulo: ev.titulo, data: dataPublica(ev.data, true), ate: ev.ate ? dataPublica(ev.ate, false) : null }));
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
      ...cardPublico(p),
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
      ...cardPublico(p),
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
    // A lista vai leve: os Detalhes, os Textos e a Jornada vêm com a ficha de cada um
    async galeria() {
      await esperar(120);
      const personagens = [
        ...banco.personagens.map(personagemDoPortal),
        ...banco.outrosPersonagens.filter(podeVerOutro).map(outroPublico),
      ];
      return structuredClone({
        conta: { ...conta },
        mesas: banco.campanhas,
        personagens,
      });
    },
    // A ficha de um personagem, do portal ou outro, com os links que a conta pode seguir.
    // Quem pode editar o personagem recebe também o que pode citar.
    async ficha(id) {
      await esperar(350);
      const doPortal = banco.personagens.find((x) => x.id === id);
      const p = doPortal || acharOutro(id);
      const resposta = {
        personagem: {
          id: p.id,
          detalhes: detalhesPublicos(p.detalhes),
          destaque: destaqueValido(p),
          textos: p.textos.map((caixa) => ({ titulo: caixa.titulo, texto: caixa.texto })),
        },
        jornada: jornadaDe(p.id),
        links: linksPara(textosComLinks(p)),
      };
      if (doPortal ? podeEditarFicha(doPortal) : podeEditarOutro()) resposta.citaveis = citaveis();
      return structuredClone(resposta);
    },
    async estado() {
      return { online: true, mundoAtivo: "ode-to-sleep", conectados: 0, trocandoPara: null };
    },
    async sair() {
      await esperar(100);
      return {};
    },
    // O dono escreve os Detalhes (menos a Morte), o Título ou Frase e os Textos e troca a arte;
    // o administrador e os editores mudam isso em qualquer ficha e também a situação, o epitáfio e a Morte
    async salvarFicha(id, dados) {
      await esperar(200);
      const p = banco.personagens.find((x) => x.id === id);
      if (!p) throw semPersonagem();
      if (!podeEditarFicha(p)) throw proibido();
      const cuida = conta.cargo === "admin" || conta.cargo === "editor";
      const valores = conteudoDe(dados, cuida ? undefined : (p.detalhes.morte ?? null));
      if (cuida) Object.assign(valores, situacaoDe(dados));
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
  // No nome, nos apelidos e no Título ou Frase
  const termo = normalizar(f.busca.trim());
  const onde = [personagem.nome, ...(personagem.apelidos ?? []), personagem.destaque?.texto].map(semLinks).join(" ");
  return !termo || normalizar(onde).includes(termo);
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

// O Título ou Frase escolhido, sem os links: o título como está, a frase entre aspas curvas
function destaqueSemLinks(destaque) {
  if (!destaque) return "";
  const texto = semLinks(destaque.texto);
  return destaque.tipo === "frase" ? `“${texto}”` : texto;
}

// O card das Mesas, na cor da primeira mesa, com o retrato como capa e sem arte recortada;
// abaixo dele, o Título ou Frase e as mesas
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

  const destaque = destaqueSemLinks(personagem.destaque);
  if (destaque) item.append(criar("p", "personagem__destaque", destaque));
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

// As abas, na ordem em que aparecem. A Geral sai na hora, com os dados da lista;
// as outras esperam a ficha completa, pedida ao abrir.
const ABAS = [
  { id: "geral", rotulo: "Geral" },
  { id: "detalhes", rotulo: "Detalhes" },
  { id: "jornada", rotulo: "Jornada" },
  { id: "textos", rotulo: "Textos" },
];

// A ficha aberta e a aba à mostra. "resposta" é a ficha completa, null enquanto não chega (ou se falhou);
// "pedido" conta os pedidos, para a resposta de uma ficha que já foi trocada ser ignorada.
const fichaAberta = { id: null, aba: "geral", resposta: null, pedido: 0 };

/* ---------- Links nos textos (os mesmos das Memórias) ---------- */

// Um link vira link só quando a conta vê o alvo; senão, fica só o que aparece, como texto.
// O endereço é montado aqui, a partir do id; o texto nunca vira HTML.
// O de personagem abre a ficha dele ali mesmo, no mesmo diálogo, na aba Geral.
function linkDaMencao({ alvo, id, aparece }, links) {
  const destino = links[`${alvo}:${id}`];
  if (!destino) return aparece;
  const link = criar("a", "ficha__link", aparece);
  if (alvo === "evento") {
    link.href = `${enderecoDaPagina("linha")}#evento-${encodeURIComponent(id)}`;
    link.title = `Na Linha do Tempo: ${destino.titulo}`;
    return link;
  }
  link.href = `#personagem-${encodeURIComponent(id)}`;
  link.title = `Nos Personagens: ${destino.nome}`;
  link.addEventListener("click", (evento) => {
    // Com Ctrl, Shift e afins, o navegador abre o link em outra aba ou janela, como sempre
    if (evento.button !== 0 || evento.ctrlKey || evento.metaKey || evento.shiftKey || evento.altKey) return;
    if (!personagemPorId(id)) return;
    evento.preventDefault();
    abrirFicha(id);
    focarFicha();
  });
  return link;
}

// Um texto de uma linha (um campo ou um item dos Detalhes, o Título ou Frase), com os links
function linhaComLinks(texto, links) {
  const fonte = String(texto || "");
  const partes = [];
  let ultimo = 0;
  for (const achado of fonte.matchAll(REGEX_LINK)) {
    if (achado.index > ultimo) partes.push(fonte.slice(ultimo, achado.index));
    const [, alvo, id, aparece] = achado;
    partes.push(linkDaMencao({ alvo, id, aparece }, links));
    ultimo = achado.index + achado[0].length;
  }
  if (ultimo < fonte.length) partes.push(fonte.slice(ultimo));
  return partes.filter((parte) => parte !== "");
}

// O texto de uma caixa, com **negrito**, *itálico*, parágrafos, listas e os links.
// Cada link vira um marcador antes da formatação (o paragrafosDe do comum.js) e,
// depois, o link no lugar dele; assim um link pode ficar dentro de um negrito.
function textoDaCaixa(texto, links) {
  const mencoes = [];
  const marcado = String(texto || "").replace(REGEX_LINK, (_, alvo, id, aparece) => {
    mencoes.push({ alvo, id, aparece });
    return `${mencoes.length - 1}`;
  });
  const corpo = criar("div", "ficha__caixa-texto");
  corpo.append(...paragrafosDe(marcado));
  if (!mencoes.length) return corpo;

  const comMarcador = [];
  const caminho = document.createTreeWalker(corpo, NodeFilter.SHOW_TEXT);
  while (caminho.nextNode()) if (caminho.currentNode.data.includes("")) comMarcador.push(caminho.currentNode);
  for (const no of comMarcador) {
    // Com o grupo no split, os pedaços ímpares são os números dos links
    const pedacos = no.data.split(/(\d+)/);
    no.replaceWith(...pedacos.map((pedaco, i) => (i % 2 ? linkDaMencao(mencoes[Number(pedaco)], links) : pedaco)).filter(Boolean));
  }
  return corpo;
}

/* ---------- O conteúdo de cada aba ---------- */

// O retrato preenche a coluna da esquerda e fica parado em todas as abas. Sem ele, a ficha fica numa coluna só.
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

// Um rótulo e o valor, na lista de dados da ficha
function linhaDaLista(lista, rotulo, ...valor) {
  const dd = criar("dd");
  dd.append(...valor);
  lista.append(criar("dt", null, rotulo), dd);
  return dd;
}

// O Título ou Frase: o título como está, a frase entre aspas curvas (os dois em itálico, pelo CSS)
function conteudoDoDestaque(destaque, links) {
  const partes = linhaComLinks(destaque.texto, links);
  return destaque.tipo === "frase" ? ["“", ...partes, "”"] : partes;
}

// O destaque da ficha completa, com o texto do item que ele aponta, como o da lista
function destaqueDaResposta(resposta) {
  const { destaque, detalhes } = resposta.personagem;
  if (!destaque || !Object.hasOwn(LISTA_DO_DESTAQUE, destaque.tipo)) return null;
  const texto = detalhes[LISTA_DO_DESTAQUE[destaque.tipo]]?.[destaque.indice];
  return texto ? { tipo: destaque.tipo, texto } : null;
}

// Geral: o papel, o nome, o jogador, as mesas, a situação (nos caídos, com o epitáfio embaixo)
// e o Título ou Frase. Sai com os dados da lista; com a ficha completa, o destaque ganha os links.
function abaGeral(personagem) {
  const mesas = personagem.mesas.map(mesaPorId).filter(Boolean);
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
  // O foco vem para o nome quando a ficha fica sem abas
  const nome = criar("h2", "ficha__nome", personagem.nome);
  nome.id = "ficha-nome";
  nome.tabIndex = -1;
  aplicarFonte(nome, personagem.fonte);

  const lista = criar("dl", "ficha__dados");
  if (personagem.jogador) linhaDaLista(lista, "Jogador", personagem.jogador);
  if (mesas.length) {
    const etiquetas = criar("span", "ficha__mesas");
    etiquetas.append(...mesas.map((mesa) => etiquetaMesa(mesa)));
    linhaDaLista(lista, mesas.length > 1 ? "Mesas" : "Mesa", etiquetas);
  }
  const situacao = linhaDaLista(lista, "Situação", comMaiuscula(ROTULOS_SITUACAO[personagem.situacao] ?? personagem.situacao));
  if (personagem.situacao === "caido" && personagem.queda?.epitafio) {
    situacao.append(criar("span", "ficha__epitafio", `“${personagem.queda.epitafio}”`));
  }

  const partes = [cabeca, nome, lista];
  const resposta = fichaAberta.resposta;
  const destaque = resposta ? destaqueDaResposta(resposta) : personagem.destaque;
  if (destaque?.texto) {
    const paragrafo = criar("p", "ficha__destaque");
    paragrafo.append(...conteudoDoDestaque(destaque, resposta?.links ?? {}));
    partes.push(paragrafo);
  }
  return partes;
}

const detalhePreenchido = (tipo, valor) => (tipo === "lista" ? Array.isArray(valor) && valor.length > 0 : Boolean(valor));

// Um valor dos Detalhes: o texto com os links; a lista, um item por linha (as frases entre aspas curvas);
// a data no Ciclo de Sylara; o marco com a data e o onde, ou só o que tiver
function valorDoDetalhe(chave, tipo, valor, links) {
  if (tipo === "texto") return linhaComLinks(valor, links);
  if (tipo === "lista") {
    const frase = chave === "frases";
    return valor.map((item) => {
      const linha = criar("span", frase ? "ficha__item ficha__frase" : "ficha__item");
      linha.append(...(frase ? ["“", ...linhaComLinks(item, links), "”"] : linhaComLinks(item, links)));
      return linha;
    });
  }
  if (tipo === "data") return [textoDaData(valor)];
  return [[valor.data ? textoDaData(valor.data) : "", valor.onde].filter(Boolean).join(" · ")];
}

// Detalhes: o nome e, na ordem da ficha, só o que estiver preenchido
function abaDetalhes(personagem, resposta) {
  const { detalhes } = resposta.personagem;
  const lista = criar("dl", "ficha__dados");
  linhaDaLista(lista, "Nome", personagem.nome);
  for (const [chave, rotulo, tipo] of CAMPOS_DOS_DETALHES) {
    if (detalhePreenchido(tipo, detalhes[chave])) {
      linhaDaLista(lista, rotulo, ...valorDoDetalhe(chave, tipo, detalhes[chave], resposta.links));
    }
  }
  return [lista];
}

// Jornada: os acontecimentos que citam o personagem, do mais antigo ao mais recente (o servidor já manda nessa ordem)
function abaJornada(resposta) {
  const linha = enderecoDaPagina("linha");
  const lista = criar("ol", "jornada");
  for (const passo of resposta.jornada) {
    const link = criar("a", "jornada__link");
    link.href = `${linha}#evento-${encodeURIComponent(passo.id)}`;
    link.append(criar("span", "jornada__data", textoDoPeriodo(passo)), criar("span", "jornada__titulo", passo.titulo));
    const item = criar("li", "jornada__passo");
    item.append(link);
    lista.append(item);
  }
  return [lista];
}

// Textos: as caixas, cada uma com o título e o texto formatado
function abaTextos(resposta) {
  return resposta.personagem.textos.map((caixa) => {
    const secao = criar("section", "ficha__caixa");
    secao.append(criar("h3", null, caixa.titulo), textoDaCaixa(caixa.texto, resposta.links));
    return secao;
  });
}

// As abas que têm o que mostrar: a Geral sempre; as outras, só com conteúdo
function abasComConteudo(resposta) {
  const { detalhes, textos } = resposta.personagem;
  const tem = {
    geral: true,
    detalhes: CAMPOS_DOS_DETALHES.some(([chave, , tipo]) => detalhePreenchido(tipo, detalhes[chave])),
    jornada: resposta.jornada.length > 0,
    textos: textos.length > 0,
  };
  return ABAS.filter((aba) => tem[aba.id]);
}

/* ---------- As abas ---------- */

// Os marcadores presos à borda direita do quadro (no celular, uma fileira no alto da coluna de texto).
// Enquanto a ficha completa não chega, só a Geral funciona; as outras aparecem apagadas.
function montarAbas(abas, carregando) {
  const lista = criar("div", "ficha__abas");
  lista.setAttribute("role", "tablist");
  lista.setAttribute("aria-orientation", "vertical");
  lista.setAttribute("aria-label", "Partes da ficha");
  for (const aba of abas) {
    const botaoAba = criar("button", "ficha__aba", aba.rotulo);
    botaoAba.type = "button";
    botaoAba.id = `ficha-aba-${aba.id}`;
    botaoAba.dataset.aba = aba.id;
    botaoAba.setAttribute("role", "tab");
    botaoAba.setAttribute("aria-controls", "ficha-painel");
    if (carregando && aba.id !== "geral") botaoAba.setAttribute("aria-disabled", "true");
    botaoAba.addEventListener("click", () => mostrarAba(aba.id));
    lista.append(botaoAba);
  }
  lista.addEventListener("keydown", andarPelasAbas);
  return lista;
}

// Põe (ou troca) as abas na ficha aberta. Se sobrar só a Geral, não aparece aba nenhuma.
function colocarAbas(abas, carregando) {
  const ficha = $("#ficha-conteudo");
  const painel = $("#ficha-painel");
  const antigas = ficha.querySelector(".ficha__abas");
  const focoNasAbas = Boolean(antigas?.contains(document.activeElement));
  antigas?.remove();
  if (!abas.some((aba) => aba.id === fichaAberta.aba)) fichaAberta.aba = "geral";

  if (abas.length > 1) {
    ficha.querySelector(".ficha__texto").before(montarAbas(abas, carregando));
    painel.setAttribute("role", "tabpanel");
    painel.tabIndex = 0;
  } else {
    for (const atributo of ["role", "aria-labelledby", "tabindex"]) painel.removeAttribute(atributo);
  }
  marcarAbaAtiva();
  if (focoNasAbas) focarFicha();
}

// A aba ativa: selecionada, a única no Tab (as outras pelas setas) e o rótulo do painel
function marcarAbaAtiva() {
  for (const botaoAba of document.querySelectorAll("#ficha-conteudo .ficha__aba")) {
    const ativa = botaoAba.dataset.aba === fichaAberta.aba;
    botaoAba.setAttribute("aria-selected", String(ativa));
    botaoAba.tabIndex = ativa ? 0 : -1;
  }
  const painel = $("#ficha-painel");
  if (painel.getAttribute("role") === "tabpanel") painel.setAttribute("aria-labelledby", `ficha-aba-${fichaAberta.aba}`);
}

// O conteúdo da aba à mostra
function desenharAba() {
  const personagem = personagemPorId(fichaAberta.id);
  if (!personagem) return;
  const resposta = fichaAberta.resposta;
  const conteudo = {
    geral: () => abaGeral(personagem),
    detalhes: () => abaDetalhes(personagem, resposta),
    jornada: () => abaJornada(resposta),
    textos: () => abaTextos(resposta),
  }[fichaAberta.aba];
  $("#ficha-painel").replaceChildren(...conteudo());
}

function mostrarAba(id, { focar = false } = {}) {
  // As apagadas esperam a ficha completa
  if (id !== "geral" && !fichaAberta.resposta) return;
  if (id !== fichaAberta.aba) {
    fichaAberta.aba = id;
    marcarAbaAtiva();
    desenharAba();
    voltarAoAlto();
  }
  if (focar) $(`#ficha-aba-${id}`)?.focus();
}

// No teclado: ↓ e ↑ trocam de aba (e → e ←, na fileira do celular), com volta;
// Home e End vão à primeira e à última. As apagadas ficam de fora.
function andarPelasAbas(evento) {
  const teclas = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1, Home: "primeira", End: "ultima" };
  if (!Object.hasOwn(teclas, evento.key)) return;
  const abas = [...evento.currentTarget.querySelectorAll('.ficha__aba:not([aria-disabled="true"])')];
  if (!abas.length) return;
  evento.preventDefault();
  const atual = Math.max(0, abas.findIndex((botaoAba) => botaoAba.dataset.aba === fichaAberta.aba));
  const passo = teclas[evento.key];
  const indice = passo === "primeira" ? 0 : passo === "ultima" ? abas.length - 1 : (atual + passo + abas.length) % abas.length;
  mostrarAba(abas[indice].dataset.aba, { focar: true });
}

// Trocar de aba volta o conteúdo ao alto. No celular a ficha inteira rola e as abas ficam presas no alto:
// ela volta só até onde as abas grudam, sem trazer o retrato de volta.
function voltarAoAlto() {
  const ficha = $("#ficha-conteudo");
  $("#ficha-painel").scrollTop = 0;
  const abas = ficha.querySelector(".ficha__abas");
  if (!abas) return;
  const texto = ficha.querySelector(".ficha__texto");
  const ondeGrudam = texto.getBoundingClientRect().top - ficha.getBoundingClientRect().top + ficha.scrollTop - abas.offsetHeight;
  if (ficha.scrollTop > ondeGrudam) ficha.scrollTop = Math.max(0, ondeGrudam);
}

// Depois de trocar de ficha por um link: o foco vai para a aba Geral ou, sem abas, para o nome
function focarFicha() {
  ($("#ficha-aba-geral") ?? $("#ficha-nome"))?.focus({ preventScroll: true });
}

// A ficha completa: os Detalhes, a Jornada, os Textos e os links. Quando chega, ficam só as abas com conteúdo
// e o destaque da Geral ganha os links. Se falhar, a Geral continua e as outras abas saem.
async function carregarFicha(id) {
  const pedido = ++fichaAberta.pedido;
  let resposta = null;
  let falha = null;
  try {
    resposta = await api.ficha(id);
  } catch (erro) {
    falha = erro;
  }
  if (pedido !== fichaAberta.pedido || fichaAberta.id !== id || !$("#dialogo-ficha").open) return;
  fichaAberta.resposta = resposta;
  if (falha) avisoRapido(`As outras abas da ficha não carregaram. ${falha.message}`);
  colocarAbas(resposta ? abasComConteudo(resposta) : [ABAS[0]], false);

  const destaque = resposta && fichaAberta.aba === "geral" ? $("#ficha-painel .ficha__destaque") : null;
  const novo = destaque ? destaqueDaResposta(resposta) : null;
  if (novo) destaque.replaceChildren(...conteudoDoDestaque(novo, resposta.links));
}

function abrirFicha(id) {
  const personagem = personagemPorId(id);
  if (!personagem) return;
  const dialogo = $("#dialogo-ficha");
  const conteudo = $("#ficha-conteudo");
  const mesas = personagem.mesas.map(mesaPorId).filter(Boolean);
  Object.assign(fichaAberta, { id, aba: "geral", resposta: null });
  const partes = [];

  const retrato = retratoDaFicha(personagem, mesas[0]?.cor ?? COR_SEM_MESA);
  if (retrato) partes.push(retrato);
  conteudo.classList.toggle("ficha--sem-retrato", !retrato);
  conteudo.classList.toggle("ficha--caido", personagem.situacao === "caido");

  // O conteúdo da aba: só ele rola (no celular, a ficha inteira). O pé fica igual em todas as abas.
  const painel = criar("div", "ficha__corpo");
  painel.id = "ficha-painel";
  const acoes = criar("div", "ficha__acoes");
  acoes.append(
    botao("Copiar link", "botao--leve espaco", () => copiarLink(personagem)),
    botao("Fechar", "botao--leve", () => dialogo.close()),
  );
  const texto = criar("div", "ficha__texto");
  texto.append(painel, acoes);
  partes.push(texto);
  conteudo.replaceChildren(...partes);

  colocarAbas(ABAS, true);
  desenharAba();
  // O nome só está na aba Geral; o diálogo leva ele no rótulo
  dialogo.setAttribute("aria-label", personagem.nome);
  trocarEndereco(`#personagem-${personagem.id}`);
  if (!dialogo.open) dialogo.showModal();
  conteudo.scrollTop = 0;
  painel.scrollTop = 0;
  carregarFicha(id);
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
   Um formulário só, em três abas (Geral, Detalhes e Textos), com
   os campos que a conta pode mudar. "Salvar" salva tudo. Nos
   personagens do portal, nome e fonte continuam no "Personalizar"
   das Mesas; o dono escreve os Detalhes (menos a Morte), o Título
   ou Frase e os Textos e troca a arte, e só o administrador e os
   editores mudam a situação, o epitáfio e a Morte.
   ================================================================= */

const edicao = {
  personagem: null, // o personagem sendo alterado, ou null para um novo
  mesas: new Set(),
  remover: { retrato: false },
  aba: "geral",
  cuida: false, // administrador ou editor: muda a situação, o epitáfio e a Morte
  destaque: null, // o Título ou Frase escolhido: { tipo, indice, texto, quantos }, ou null
  citaveis: { acontecimentos: [], personagens: [] }, // o que o "Citar" oferece
  ultimoCampo: { detalhes: null, textos: null }, // onde o "Citar" de cada aba põe o link
  abrindo: false, // esperando a ficha completa para abrir
  pedido: 0, // conta os pedidos do "Citar" de um personagem novo, para ignorar os que ficaram para trás
};

const formEdicao = () => $("#form-edicao");

// As abas do formulário, na ordem em que aparecem
const ABAS_DA_EDICAO = ["geral", "detalhes", "textos"];

// Os Detalhes no formulário, em grupos com um título pequeno. Os rótulos são os da ficha, que também
// aparecem nas mensagens de erro; dentro da Regência, o começo e o término ficam com o nome curto.
const GRUPOS_DOS_DETALHES = [
  ["Nomes", ["titulos", "apelidos", "nomeReal"]],
  ["Origem", ["especie", "genero", "idade", "lar", "laresAnteriores", "linguagens", "religiao"]],
  ["Vida", ["nascimento", "transformado", "morte", "destruido"]],
  ["Família", ["pais", "irmaos", "filhos", "parentes"]],
  ["Regência", ["regenciaInicio", "regenciaFim", "predecessor", "sucessor"]],
  ["Jogo", ["ocupacao", "classe", "nivel", "alinhamento"]],
  ["Frases", ["frases"]],
];
const ROTULOS_CURTOS = { regenciaInicio: "Começo", regenciaFim: "Término" };

// As sugestões do Alinhamento; dá para escrever outro
const ALINHAMENTOS = [
  "Leal e Bom",
  "Neutro e Bom",
  "Caótico e Bom",
  "Leal e Neutro",
  "Neutro",
  "Caótico e Neutro",
  "Leal e Mau",
  "Neutro e Mau",
  "Caótico e Mau",
];

const ROTULOS_DO_DESTAQUE = { titulo: "Título", frase: "Frase" };

function opcoesDeMes(seletor, valor) {
  seletor.replaceChildren(new Option("Sem mês", ""), ...MESES.map((mes, i) => new Option(mes, String(i + 1))));
  seletor.value = valor ? String(valor) : "";
}

function opcoesDeDia(seletor, valor) {
  seletor.replaceChildren(new Option("Sem dia", ""));
  for (let dia = 1; dia <= 30; dia++) seletor.append(new Option(String(dia), String(dia)));
  seletor.value = valor ? String(valor) : "";
}

// Um erro de um campo: o formulário vai para a aba dele e põe o foco nele
function erroNoCampo(mensagem, campo) {
  const erro = new Error(mensagem);
  erro.campo = campo;
  return erro;
}

/* ---------- As abas do formulário ---------- */

// A aba à mostra: selecionada e a única no Tab (as outras pelas setas). Trocar volta os campos ao alto.
// O "Citar" aparece nas abas Detalhes e Textos.
function mostrarAbaDaEdicao(aba, { focar = false } = {}) {
  const trocou = aba !== edicao.aba;
  edicao.aba = aba;
  for (const id of ABAS_DA_EDICAO) {
    const ativa = id === aba;
    const botaoAba = $(`#edicao-aba-${id}`);
    botaoAba.setAttribute("aria-selected", String(ativa));
    botaoAba.tabIndex = ativa ? 0 : -1;
    $(`#edicao-${id}`).hidden = !ativa;
  }
  mostrarCitar();
  if (trocou) $(".edicao__campos").scrollTop = 0;
  if (focar) $(`#edicao-aba-${aba}`).focus();
}

// No teclado: → e ← trocam de aba, com volta; Home e End vão à primeira e à última
function andarPelasAbasDaEdicao(evento) {
  const teclas = { ArrowRight: 1, ArrowLeft: -1, Home: "primeira", End: "ultima" };
  if (!Object.hasOwn(teclas, evento.key)) return;
  evento.preventDefault();
  const total = ABAS_DA_EDICAO.length;
  const atual = ABAS_DA_EDICAO.indexOf(edicao.aba);
  const passo = teclas[evento.key];
  const indice = passo === "primeira" ? 0 : passo === "ultima" ? total - 1 : (atual + passo + total) % total;
  mostrarAbaDaEdicao(ABAS_DA_EDICAO[indice], { focar: true });
}

/* ---------- Geral ---------- */

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

// O jogador só vale para personagens de jogador; o epitáfio, só para os caídos
function mostrarCamposDependentes() {
  const form = formEdicao();
  $("#campo-jogador").hidden = form.papel.value !== "jogador";
  $("#campo-epitafio").hidden = $("#grupo-situacao").hidden || form.situacao.value !== "caido";
}

function mostrarImagem(campo, src) {
  const caixa = $(`#imagem-${campo}`);
  caixa.hidden = !src;
  if (src) caixa.querySelector("img").src = src;
}

// A situação e, para os caídos, o epitáfio. A data da queda é a Morte, na aba Detalhes.
function situacaoDoFormulario() {
  const form = formEdicao();
  const situacao = form.situacao.value;
  const epitafio = situacao === "caido" ? form.epitafio.value.trim() : "";
  return { situacao, queda: epitafio ? { epitafio } : null };
}

/* ---------- Geral: o Título ou Frase ---------- */

// Cada linha de uma lista é um item; as vazias saem
const itensDaLista = (texto) =>
  texto
    .split("\n")
    .map((linha) => linha.trim())
    .filter(Boolean);

// Uma opção comprida demais encurta, para a lista de escolha caber no formulário
const encurtar = (texto, max = 90) => (texto.length > max ? `${texto.slice(0, max - 1).trimEnd()}…` : texto);

// Os títulos e as frases escritos agora na aba Detalhes
function listasDoDestaque() {
  const form = formEdicao();
  return {
    titulo: itensDaLista(form.elements[nomeDoDetalhe("titulos")].value),
    frase: itensDaLista(form.elements[nomeDoDetalhe("frases")].value),
  };
}

// Escolhe um item (ou nenhum) e lembra o texto dele e quantos itens a lista tinha
function escolherDestaque(destaque, listas) {
  const itens = destaque ? listas[destaque.tipo] : null;
  const texto = itens?.[destaque.indice];
  edicao.destaque = texto ? { tipo: destaque.tipo, indice: destaque.indice, texto, quantos: itens.length } : null;
  formEdicao().destaque.value = edicao.destaque ? `${destaque.tipo}:${destaque.indice}` : "";
}

// "Nenhum", cada título ("Título: …") e cada frase ("Frase: …") da aba Detalhes. Muda enquanto se escreve lá,
// e a escolha segue o item: se ele muda de lugar, vai junto; se é reescrito ali mesmo, continua;
// se some, volta para "Nenhum".
function atualizarDestaque() {
  const listas = listasDoDestaque();
  const antes = edicao.destaque;
  let indice = null;
  if (antes) {
    const itens = listas[antes.tipo];
    const iguais = itens.flatMap((item, i) => (item === antes.texto ? [i] : []));
    if (iguais.length) {
      indice = iguais.reduce((perto, i) => (Math.abs(i - antes.indice) < Math.abs(perto - antes.indice) ? i : perto));
    } else if (itens.length === antes.quantos) {
      indice = antes.indice;
    }
  }
  const opcoes = [new Option("Nenhum", "")];
  for (const tipo of ["titulo", "frase"]) {
    listas[tipo].forEach((item, i) => opcoes.push(new Option(`${ROTULOS_DO_DESTAQUE[tipo]}: ${encurtar(semLinks(item))}`, `${tipo}:${i}`)));
  }
  formEdicao().destaque.replaceChildren(...opcoes);
  escolherDestaque(indice === null ? null : { tipo: antes.tipo, indice }, listas);
}

/* ---------- Detalhes ---------- */

const nomeDoDetalhe = (chave, parte) => (parte ? `detalhe_${chave}_${parte}` : `detalhe_${chave}`);

// Ano, mês e dia em campos simples, mais a "aproximada"
function camposDaData(chave) {
  const ano = criar("input");
  ano.name = nomeDoDetalhe(chave, "ano");
  ano.type = "number";
  ano.inputMode = "numeric";
  ano.min = "0";
  const campoAno = criar("label", "campo campo--ano");
  campoAno.append(criar("span", "campo__rotulo", "Ano"), ano);

  const seletor = (parte, rotulo) => {
    const lista = criar("select");
    lista.name = nomeDoDetalhe(chave, parte);
    const campo = criar("label", "campo");
    campo.append(criar("span", "campo__rotulo", rotulo), lista);
    return campo;
  };

  const aprox = criar("input");
  aprox.type = "checkbox";
  aprox.name = nomeDoDetalhe(chave, "aprox");
  const marca = criar("span", "caixa__marca");
  marca.setAttribute("aria-hidden", "true");
  const caixa = criar("label", "caixa caixa--aprox");
  caixa.append(aprox, marca, criar("span", null, "Data aproximada"));

  const linha = criar("div", "data-campos");
  linha.append(campoAno, seletor("mes", "Mês"), seletor("dia", "Dia"), caixa);
  return linha;
}

// Um campo dos Detalhes, conforme o tipo: o texto numa linha; a lista numa área de texto, um item por linha;
// a data com ano, mês e dia; o marco com a data e o onde. Os textos e as listas aceitam o "Citar".
// "sozinho": o único campo do grupo, que já tem o nome dele no título.
function campoDoDetalhe(chave, rotulo, tipo, sozinho) {
  const visivel = ROTULOS_CURTOS[chave] ?? rotulo;
  if (tipo === "texto" || tipo === "lista") {
    const entrada = criar(tipo === "texto" ? "input" : "textarea");
    entrada.name = nomeDoDetalhe(chave);
    entrada.dataset.citavel = "";
    if (tipo === "texto") {
      entrada.maxLength = LIMITES_DA_FICHA.texto;
      entrada.autocomplete = "off";
      if (chave === "alinhamento") entrada.setAttribute("list", "sugestoes-alinhamento");
    } else {
      entrada.rows = 3;
    }
    const titulo = criar("span", sozinho ? "campo__rotulo sr" : "campo__rotulo", visivel);
    const campo = criar("label", tipo === "lista" ? "campo campo--largo" : "campo");
    campo.append(titulo, entrada);
    if (tipo === "lista") campo.append(criar("span", "campo__ajuda", "Um por linha"));
    return campo;
  }

  const campos = criar("div", "marco-form");
  campos.append(camposDaData(chave));
  if (tipo === "marco") {
    const onde = criar("input");
    onde.name = nomeDoDetalhe(chave, "onde");
    onde.maxLength = LIMITES_DA_FICHA.onde;
    onde.autocomplete = "off";
    const campoOnde = criar("label", "campo");
    campoOnde.append(criar("span", "campo__rotulo", "Onde"), onde);
    campos.append(campoOnde);
  }
  const grupo = criar("fieldset", "grupo campo--largo");
  grupo.id = `campo-${chave}`;
  grupo.append(criar("legend", "campo__rotulo", visivel), campos);

  // A Morte, para o dono: só para ler
  if (chave === "morte") {
    const leitura = criar("div", "morte-leitura");
    leitura.id = "morte-leitura";
    leitura.hidden = true;
    leitura.append(criar("p", "morte-leitura__valor"), criar("span", "campo__ajuda", "Só o administrador e os editores mudam a Morte."));
    grupo.append(leitura);
  }
  return grupo;
}

// Os grupos da aba Detalhes, montados uma vez só
function montarDetalhes() {
  const campos = new Map(CAMPOS_DOS_DETALHES.map(([chave, rotulo, tipo]) => [chave, { rotulo, tipo }]));
  const grupos = GRUPOS_DOS_DETALHES.map(([titulo, chaves]) => {
    const lista = criar("div", "grupo-detalhes__campos");
    for (const chave of chaves) {
      const { rotulo, tipo } = campos.get(chave);
      lista.append(campoDoDetalhe(chave, rotulo, tipo, chaves.length === 1));
    }
    const grupo = criar("fieldset", "grupo-detalhes");
    grupo.append(criar("legend", "grupo-detalhes__titulo", titulo), lista);
    return grupo;
  });
  const sugestoes = criar("datalist");
  sugestoes.id = "sugestoes-alinhamento";
  sugestoes.append(...ALINHAMENTOS.map((alinhamento) => new Option(alinhamento)));
  $("#campos-detalhes").replaceChildren(...grupos, sugestoes);
}

function preencherData(chave, data) {
  const form = formEdicao();
  form.elements[nomeDoDetalhe(chave, "ano")].value = data ? String(data.ano) : "";
  opcoesDeMes(form.elements[nomeDoDetalhe(chave, "mes")], data?.mes);
  opcoesDeDia(form.elements[nomeDoDetalhe(chave, "dia")], data?.dia);
  form.elements[nomeDoDetalhe(chave, "aprox")].checked = Boolean(data?.aprox);
}

// "12 de Solcanis de 312 ED · Westna", como na aba Detalhes da ficha, ou só o que tiver
const textoDoMarco = (marco) => [marco?.data ? textoDaData(marco.data) : "", marco?.onde ?? ""].filter(Boolean).join(" · ");

function preencherDetalhes(detalhes) {
  const form = formEdicao();
  for (const [chave, , tipo] of CAMPOS_DOS_DETALHES) {
    const valor = detalhes[chave];
    if (tipo === "texto") form.elements[nomeDoDetalhe(chave)].value = valor || "";
    else if (tipo === "lista") form.elements[nomeDoDetalhe(chave)].value = (valor || []).join("\n");
    else if (tipo === "data") preencherData(chave, valor);
    else {
      preencherData(chave, valor?.data);
      form.elements[nomeDoDetalhe(chave, "onde")].value = valor?.onde || "";
    }
  }
  // A Morte: o administrador e os editores mudam; o dono só lê
  $("#campo-morte .marco-form").hidden = !edicao.cuida;
  $("#morte-leitura").hidden = edicao.cuida;
  $("#morte-leitura .morte-leitura__valor").textContent = textoDoMarco(detalhes.morte) || "Sem data nem lugar.";
}

// Só o ano é obrigatório; o dia só vale com o mês
function dataDoFormulario(chave, rotulo) {
  const form = formEdicao();
  const campoAno = form.elements[nomeDoDetalhe(chave, "ano")];
  const mes = Number(form.elements[nomeDoDetalhe(chave, "mes")].value) || null;
  if (campoAno.value === "" && !campoAno.validity.badInput) {
    if (mes) throw erroNoCampo(`Escreva o ano do campo ${rotulo}, ou deixe o mês em branco.`, campoAno);
    return null;
  }
  const ano = Number(campoAno.value);
  if (campoAno.value === "" || !Number.isInteger(ano) || ano < 0) {
    throw erroNoCampo(`O ano do campo ${rotulo} precisa ser um número inteiro, de 0 em diante.`, campoAno);
  }
  const dia = mes ? Number(form.elements[nomeDoDetalhe(chave, "dia")].value) || null : null;
  return { ano, mes, dia, aprox: form.elements[nomeDoDetalhe(chave, "aprox")].checked };
}

// Os Detalhes como o servidor recebe, conferidos como lá. O dono não manda a Morte: ela fica como está.
function detalhesDoFormulario() {
  const form = formEdicao();
  const detalhes = {};
  for (const [chave, rotulo, tipo] of CAMPOS_DOS_DETALHES) {
    if (chave === "morte" && !edicao.cuida) continue;
    if (tipo === "texto") {
      const campo = form.elements[nomeDoDetalhe(chave)];
      const valor = campo.value.trim();
      if (valor.length > LIMITES_DA_FICHA.texto) {
        throw erroNoCampo(`O campo ${rotulo} pode ter no máximo ${LIMITES_DA_FICHA.texto} caracteres.`, campo);
      }
      detalhes[chave] = valor;
    } else if (tipo === "lista") {
      const campo = form.elements[nomeDoDetalhe(chave)];
      const itens = itensDaLista(campo.value);
      const max = chave === "frases" ? LIMITES_DA_FICHA.frase : LIMITES_DA_FICHA.item;
      if (itens.length > LIMITES_DA_FICHA.itens) {
        throw erroNoCampo(`O campo ${rotulo} pode ter no máximo ${LIMITES_DA_FICHA.itens} itens.`, campo);
      }
      if (itens.some((item) => item.length > max)) {
        throw erroNoCampo(`Cada item do campo ${rotulo} pode ter no máximo ${max} caracteres.`, campo);
      }
      detalhes[chave] = itens;
    } else if (tipo === "data") {
      detalhes[chave] = dataDoFormulario(chave, rotulo);
    } else {
      const data = dataDoFormulario(chave, rotulo);
      const onde = form.elements[nomeDoDetalhe(chave, "onde")].value.trim();
      detalhes[chave] = data || onde ? { data, onde } : null;
    }
  }
  return detalhes;
}

/* ---------- Textos: as caixas ---------- */

// Uma caixa: o número, as setas e o "Remover" no alto; depois o título e o texto
function campoDaCaixa({ titulo = "", texto = "" } = {}) {
  const item = criar("li", "caixa-form");
  const subir = botao("↑", "botao--leve caixa-form__seta", () => moverCaixa(item, -1));
  const descer = botao("↓", "botao--leve caixa-form__seta", () => moverCaixa(item, 1));
  subir.title = "Subir";
  descer.title = "Descer";
  const acoes = criar("div", "caixa-form__acoes");
  acoes.append(subir, descer, botao("Remover", "botao--leve botao--perigo", () => removerCaixa(item)));
  const cabeca = criar("div", "caixa-form__cabeca");
  cabeca.append(criar("span", "caixa-form__numero"), acoes);

  const entrada = criar("input", "caixa-form__titulo");
  entrada.maxLength = LIMITES_DA_FICHA.tituloDaCaixa;
  entrada.autocomplete = "off";
  entrada.placeholder = "Ex.: Descrição, Personalidade, História";
  entrada.value = titulo;
  const campoTitulo = criar("label", "campo");
  campoTitulo.append(criar("span", "campo__rotulo", "Título"), entrada);

  const area = criar("textarea", "caixa-form__texto");
  area.rows = 8;
  area.maxLength = LIMITES_DA_FICHA.textoDaCaixa;
  area.dataset.citavel = "";
  area.value = texto;
  const campoTexto = criar("label", "campo");
  campoTexto.append(criar("span", "campo__rotulo", "Texto"), area);

  item.append(cabeca, campoTitulo, campoTexto);
  return item;
}

// Depois de mexer na lista: o número de cada caixa e as setas das pontas apagadas.
// Sem caixas, o "Citar" fica apagado na aba; no limite, o "+ Caixa" também.
function numerarCaixas() {
  const itens = [...$("#lista-caixas").children];
  itens.forEach((item, i) => {
    const n = i + 1;
    item.querySelector(".caixa-form__numero").textContent = `Caixa ${n}`;
    const [subir, descer, remover] = item.querySelectorAll(".caixa-form__acoes button");
    subir.disabled = i === 0;
    descer.disabled = n === itens.length;
    subir.setAttribute("aria-label", `Subir a caixa ${n}`);
    descer.setAttribute("aria-label", `Descer a caixa ${n}`);
    remover.setAttribute("aria-label", `Remover a caixa ${n}`);
  });
  $("#caixas-vazio").hidden = itens.length > 0;
  $("#botao-mais-caixa").disabled = itens.length >= LIMITES_DA_FICHA.caixas;
  mostrarCitar();
}

function mostrarCaixas(caixas) {
  $("#lista-caixas").replaceChildren(...caixas.map(campoDaCaixa));
  numerarCaixas();
}

// Todas as caixas, na ordem, para os números das mensagens do servidor baterem com os daqui.
// Uma caixa toda vazia o servidor ignora; com texto e sem título, dá erro.
function caixasDoFormulario() {
  return [...$("#lista-caixas").children].map((item, i) => {
    const titulo = item.querySelector(".caixa-form__titulo");
    const texto = item.querySelector(".caixa-form__texto");
    const caixa = { titulo: titulo.value.trim(), texto: texto.value.trim() };
    if (caixa.texto && !caixa.titulo) throw erroNoCampo(`Preencha o campo Título da caixa ${i + 1}.`, titulo);
    if (caixa.texto.length > LIMITES_DA_FICHA.textoDaCaixa) {
      throw erroNoCampo(`O campo Texto da caixa ${i + 1} pode ter no máximo ${LIMITES_DA_FICHA.textoDaCaixa} caracteres.`, texto);
    }
    return caixa;
  });
}

function adicionarCaixa() {
  const lista = $("#lista-caixas");
  if (lista.children.length >= LIMITES_DA_FICHA.caixas) return;
  const item = campoDaCaixa();
  lista.append(item);
  numerarCaixas();
  item.querySelector(".caixa-form__titulo").focus();
}

// O foco segue a caixa que andou; na ponta, passa para a seta que ainda anda
function moverCaixa(item, passo) {
  const vizinho = passo < 0 ? item.previousElementSibling : item.nextElementSibling;
  if (!vizinho) return;
  if (passo < 0) vizinho.before(item);
  else vizinho.after(item);
  numerarCaixas();
  const [subir, descer] = item.querySelectorAll(".caixa-form__seta");
  const seta = passo < 0 ? subir : descer;
  (seta.disabled ? (passo < 0 ? descer : subir) : seta).focus();
  item.scrollIntoView({ block: "nearest" });
}

// Uma caixa com texto pede confirmação antes de sair
async function removerCaixa(item) {
  if (item.querySelector(".caixa-form__texto").value.trim()) {
    const titulo = item.querySelector(".caixa-form__titulo").value.trim();
    const confirmado = await perguntar({
      titulo: "Remover esta caixa?",
      texto: `${titulo ? `"${titulo}"` : "A caixa"} sai da ficha, com o texto. Nada muda até você salvar.`,
      confirmar: "Remover",
      cancelar: "Cancelar",
      perigo: true,
    });
    if (!confirmado) return;
  }
  const vizinho = item.nextElementSibling ?? item.previousElementSibling;
  item.remove();
  numerarCaixas();
  (vizinho?.querySelector(".caixa-form__titulo") ?? $("#botao-mais-caixa")).focus();
}

/* ---------- Abrir, conferir e salvar ---------- */

// Os Detalhes, o Título ou Frase, os Textos e o que o "Citar" oferece vêm da ficha completa:
// a da ficha aberta, se já chegou, ou um pedido novo
function fichaDaEdicao(personagem) {
  if (fichaAberta.id === personagem.id && fichaAberta.resposta) return Promise.resolve(fichaAberta.resposta);
  return api.ficha(personagem.id);
}

// O "Citar" de um personagem novo: o que ele oferece é o mesmo em todas as fichas que a conta pode alterar,
// então vem da ficha de um personagem qualquer que ela vê. Enquanto não chega, fica o que já se sabia.
async function carregarCitaveisDoNovo() {
  const pedido = ++edicao.pedido;
  const algum = estado.personagens[0];
  if (!algum) return;
  try {
    const { citaveis } = await api.ficha(algum.id);
    if (pedido !== edicao.pedido || !citaveis) return;
    edicao.citaveis = citaveis;
    if ($("#dialogo-citar").open) renderizarCitaveis();
  } catch (falha) {
    if (pedido === edicao.pedido) avisoRapido(`A lista do Citar não carregou. ${falha.message}`);
  }
}

// Para alterar, o formulário espera a ficha completa; sem ela, não abre, para não salvar por cima do que já existe
async function abrirEdicao(personagem = null) {
  if (personagem ? !personagem.podeEditar : !podeCadastrar()) return;
  if (edicao.abrindo) return;
  let ficha = null;
  if (personagem) {
    edicao.abrindo = true;
    try {
      ficha = await fichaDaEdicao(personagem);
    } catch (falha) {
      avisarFalha(falha);
      return;
    } finally {
      edicao.abrindo = false;
    }
  }

  const form = formEdicao();
  form.reset();
  Object.assign(edicao, {
    personagem,
    mesas: new Set(personagem?.mesas ?? []),
    remover: { retrato: false },
    cuida: ehAdmin() || ehEditor(),
    destaque: null,
    citaveis: ficha?.citaveis ?? fichaAberta.resposta?.citaveis ?? { acontecimentos: [], personagens: [] },
    ultimoCampo: { detalhes: null, textos: null },
  });
  edicao.pedido++;
  if (!personagem) carregarCitaveisDoNovo();
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
  $("#grupo-situacao").hidden = doPortal && !edicao.cuida;
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

  // Situação e epitáfio
  form.situacao.value = personagem?.situacao ?? "vivo";
  form.epitafio.value = personagem?.queda?.epitafio ?? "";
  mostrarCamposDependentes();

  // Detalhes, Título ou Frase e Textos
  const conteudo = ficha?.personagem;
  preencherDetalhes(conteudo?.detalhes ?? detalhesVazios());
  atualizarDestaque();
  if (conteudo?.destaque) escolherDestaque(conteudo.destaque, listasDoDestaque());
  mostrarCaixas(conteudo?.textos ?? []);

  // Arte e visibilidade
  for (const campo of CAMPOS_IMAGEM) mostrarImagem(campo, personagem?.[campo]);
  form.visibilidade.value = personagem?.visibilidade ?? "todos";

  mostrarAbaDaEdicao("geral");
  $("#dialogo-edicao").showModal();
  $(".edicao__campos").scrollTop = 0;
  (doPortal ? $("#edicao-aba-geral") : form.nome).focus();
}

function coletarEdicao() {
  const form = formEdicao();
  const doPortal = edicao.personagem?.origemDoDado === "portal";
  const nome = form.nome.value.trim();
  if (!doPortal && !nome) throw erroNoCampo("Escreva o nome do personagem.", form.nome);

  const imagens = {};
  for (const campo of CAMPOS_IMAGEM) {
    const arquivo = form[campo].files[0] ?? null;
    imagens[campo] = { arquivo, remover: edicao.remover[campo] && !arquivo };
  }
  atualizarDestaque(); // para o destaque apontar o item certo da lista que vai
  const dados = {
    detalhes: detalhesDoFormulario(),
    destaque: edicao.destaque ? { tipo: edicao.destaque.tipo, indice: edicao.destaque.indice } : null,
    textos: caixasDoFormulario(),
    imagens,
  };
  if (!$("#grupo-situacao").hidden) Object.assign(dados, situacaoDoFormulario());
  if (doPortal) return dados;

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

// O campo de uma mensagem do servidor, pelo rótulo: "O campo Apelidos …", "… (campo Nascimento).",
// "Preencha o campo Título da caixa 2.". Vale o rótulo mais longo que aparece inteiro.
function campoDaMensagem(mensagem) {
  const form = formEdicao();
  const caixa = mensagem.match(/campo (Título|Texto) da caixa (\d+)/);
  if (caixa) {
    const item = $("#lista-caixas").children[Number(caixa[2]) - 1];
    return item?.querySelector(caixa[1] === "Título" ? ".caixa-form__titulo" : ".caixa-form__texto") ?? null;
  }
  const campos = [
    ["Nome", form.nome],
    ["Jogador", form.jogador],
    ["Epitáfio", form.epitafio],
  ];
  for (const [chave, rotulo, tipo] of CAMPOS_DOS_DETALHES) {
    campos.push([rotulo, form.elements[tipo === "texto" || tipo === "lista" ? nomeDoDetalhe(chave) : nomeDoDetalhe(chave, "ano")]]);
    if (tipo === "marco") campos.push([`${rotulo} (onde)`, form.elements[nomeDoDetalhe(chave, "onde")]]);
  }
  let achado = null;
  for (const [rotulo, campo] of campos) {
    const trecho = `campo ${rotulo}`;
    const i = mensagem.indexOf(trecho);
    if (i < 0 || /[\p{L}\p{N}]/u.test(mensagem.charAt(i + trecho.length))) continue;
    if (!achado || rotulo.length > achado.rotulo.length) achado = { rotulo, campo };
  }
  return achado?.campo ?? null;
}

// A mensagem embaixo do formulário. Se ela for de um campo, o formulário vai para a aba dele e põe o foco nele.
function mostrarErroDaEdicao(falha) {
  const erro = $("#erro-edicao");
  erro.textContent = falha.message;
  erro.hidden = false;
  const campo = falha.campo ?? campoDaMensagem(falha.message);
  const painel = campo?.closest(".edicao__painel");
  if (!painel) return;
  mostrarAbaDaEdicao(painel.dataset.aba);
  if (!campo.closest("[hidden]")) campo.focus();
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
    mostrarErroDaEdicao(falha);
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
    mostrarErroDaEdicao(falha);
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
  montarDetalhes();
  form.addEventListener("submit", enviarEdicao);
  $("#edicao-cancelar").addEventListener("click", () => $("#dialogo-edicao").close());
  $("#edicao-apagar").addEventListener("click", apagarPersonagem);

  // As abas
  for (const id of ABAS_DA_EDICAO) $(`#edicao-aba-${id}`).addEventListener("click", () => mostrarAbaDaEdicao(id));
  $("#edicao-abas").addEventListener("keydown", andarPelasAbasDaEdicao);

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

  // O Título ou Frase acompanha os títulos e as frases da aba Detalhes
  form.destaque.addEventListener("change", () => {
    const [tipo, indice] = form.destaque.value.split(":");
    escolherDestaque(tipo ? { tipo, indice: Number(indice) } : null, listasDoDestaque());
  });
  for (const chave of ["titulos", "frases"]) form.elements[nomeDoDetalhe(chave)].addEventListener("input", atualizarDestaque);

  // As caixas
  $("#botao-mais-caixa").addEventListener("click", adicionarCaixa);

  // O "Citar" lembra, em cada aba, o último campo de texto dela que esteve com o foco
  for (const aba of ["detalhes", "textos"]) {
    $(`#edicao-${aba}`).addEventListener("focusin", (evento) => {
      if (evento.target.matches("[data-citavel]")) edicao.ultimoCampo[aba] = evento.target;
    });
  }
  $("#edicao-citar").addEventListener("click", () => citarNaAba(edicao.aba));
  configurarCitar();
}

/* =================================================================
   Citar: uma busca pelos acontecimentos e personagens
   -----------------------------------------------------------------
   A mesma das Memórias. O "Citar" das abas Detalhes e Textos põe
   [[evento:<id>|título]] ou [[personagem:<id>|nome]] no último
   campo de texto daquela aba que esteve com o foco, onde estava o
   cursor. O "o que aparece" pode ser mudado depois, no próprio texto.
   ================================================================= */

const citacao = { area: null }; // o campo que recebe o link

// Um colchete no título fecharia o link antes da hora: vira parêntese
const semColchetes = (texto) => texto.replace(/\[/g, "(").replace(/\]/g, ")");

// Só nas abas Detalhes e Textos; nos Textos sem caixas, apagado
function mostrarCitar() {
  const citar = $("#edicao-citar");
  citar.hidden = edicao.aba === "geral";
  citar.disabled = edicao.aba === "textos" && !$("#lista-caixas").children.length;
  citar.setAttribute("aria-label", edicao.aba === "textos" ? "Citar num texto da aba Textos" : "Citar num campo da aba Detalhes");
}

// O último campo de texto da aba que esteve com o foco; se nenhum esteve, o primeiro dela
function citarNaAba(aba) {
  const ultimo = edicao.ultimoCampo[aba];
  const alvo = ultimo?.isConnected && !ultimo.closest("[hidden]") ? ultimo : $(`#edicao-${aba} [data-citavel]`);
  if (alvo) abrirCitar(alvo);
}

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
  const { acontecimentos, personagens } = edicao.citaveis;
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

// O link entra onde estava o cursor (ou no lugar do que estava selecionado), e o cursor fica depois dele.
// O aviso de mudança faz o Título ou Frase acompanhar, se o link entrou nos títulos ou nas frases.
function inserirCitacao(trecho) {
  const area = citacao.area;
  $("#dialogo-citar").close();
  if (!area?.isConnected) return;
  area.focus();
  area.setRangeText(trecho, area.selectionStart, area.selectionEnd, "end");
  area.dispatchEvent(new Event("input", { bubbles: true }));
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
