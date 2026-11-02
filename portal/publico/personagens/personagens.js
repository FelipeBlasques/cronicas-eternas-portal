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

  function textosDe(dados) {
    return {
      origem: textoOpcional(dados.origem, "Ancestralidade e classe", 80),
      resumo: textoOpcional(dados.resumo, "Resumo", 160).replace(/\s*\n\s*/g, " "),
      historia: textoOpcional(dados.historia, "História", 6000),
    };
  }

  function situacaoDe(dados) {
    const situacao = dados.situacao ?? "vivo";
    if (!Object.hasOwn(ROTULOS_SITUACAO, situacao)) {
      throw erroComCodigo("Escolha a situação: vivo, caído, desaparecido ou aposentado.");
    }
    const bruta = situacao === "caido" ? dados.queda : null;
    if (!bruta) return { situacao, queda: null };
    let data = null;
    if (bruta.data) {
      const { ano, mes, dia } = bruta.data;
      if (!Number.isInteger(ano) || ano < 0 || ano > banco.anoAtual) {
        throw erroComCodigo(`O ano precisa ser um número inteiro de 0 a ${banco.anoAtual}.`);
      }
      data = { ano, mes: mes || null, dia: mes && dia ? dia : null, aprox: false };
    }
    const epitafio = textoOpcional(bruta.epitafio, "Epitáfio", 160);
    return { situacao, queda: data || epitafio ? { data, epitafio } : null };
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
      ...textosDe(dados),
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
    // O dono escreve os textos e troca a arte; o administrador e os editores mudam isso em qualquer ficha,
    // e também a situação e a queda
    async salvarFicha(id, dados) {
      await esperar(200);
      const p = banco.personagens.find((x) => x.id === id);
      if (!p) throw semPersonagem();
      if (!podeEditarFicha(p)) throw proibido();
      const valores = textosDe(dados);
      if (conta.cargo === "admin" || conta.cargo === "editor") Object.assign(valores, situacaoDe(dados));
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
      // Os Detalhes, o Título ou Frase e os Textos chegam com o formulário novo (sessão 9.3)
      const p = {
        id,
        ...valores,
        detalhes: detalhesVazios(),
        destaque: null,
        textos: [],
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
   Um formulário só, com os campos que a conta pode mudar. Nos
   personagens do portal, nome e fonte continuam no "Personalizar"
   das Mesas; o dono escreve os textos e troca a arte, e só o
   administrador muda a situação e a queda.
   ================================================================= */

const edicao = {
  personagem: null, // o personagem sendo alterado, ou null para um novo
  mesas: new Set(),
  remover: { retrato: false },
};

const formEdicao = () => $("#form-edicao");

function opcoesDeMes(seletor, valor) {
  seletor.replaceChildren(new Option("Sem mês", ""), ...MESES.map((mes, i) => new Option(mes, String(i + 1))));
  seletor.value = valor ? String(valor) : "";
}

function opcoesDeDia(seletor, valor) {
  seletor.replaceChildren(new Option("Sem dia", ""));
  for (let dia = 1; dia <= 30; dia++) seletor.append(new Option(String(dia), String(dia)));
  seletor.value = valor ? String(valor) : "";
}

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

// O jogador só vale para personagens de jogador; a data e o epitáfio, só para os caídos
function mostrarCamposDependentes() {
  const form = formEdicao();
  $("#campo-jogador").hidden = form.papel.value !== "jogador";
  $("#grupo-queda").hidden = $("#grupo-situacao").hidden || form.situacao.value !== "caido";
}

function mostrarImagem(campo, src) {
  const caixa = $(`#imagem-${campo}`);
  caixa.hidden = !src;
  if (src) caixa.querySelector("img").src = src;
}

function abrirEdicao(personagem = null) {
  if (personagem ? !personagem.podeEditar : !podeCadastrar()) return;
  const form = formEdicao();
  form.reset();
  edicao.personagem = personagem;
  edicao.mesas = new Set(personagem?.mesas ?? []);
  edicao.remover = { retrato: false };
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
  $("#grupo-situacao").hidden = doPortal && !ehAdmin() && !ehEditor();
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

  // Situação e queda
  form.situacao.value = personagem?.situacao ?? "vivo";
  const queda = personagem?.queda;
  form.queda_ano.value = queda?.data ? String(queda.data.ano) : "";
  opcoesDeMes(form.queda_mes, queda?.data?.mes);
  opcoesDeDia(form.queda_dia, queda?.data?.dia);
  form.epitafio.value = queda?.epitafio ?? "";
  mostrarCamposDependentes();

  // Textos, arte e visibilidade
  form.origem.value = personagem?.origem ?? "";
  form.resumo.value = personagem?.resumo ?? "";
  form.historia.value = personagem?.historia ?? "";
  for (const campo of CAMPOS_IMAGEM) mostrarImagem(campo, personagem?.[campo]);
  form.visibilidade.value = personagem?.visibilidade ?? "todos";

  $("#dialogo-edicao").showModal();
  $(".edicao__campos").scrollTop = 0;
  (doPortal ? form.origem : form.nome).focus();
}

// A situação e, para os caídos, a queda: a data (só o ano é obrigatório) e o epitáfio
function situacaoDoFormulario() {
  const form = formEdicao();
  const situacao = form.situacao.value;
  if (situacao !== "caido") return { situacao, queda: null };
  const mes = Number(form.queda_mes.value) || null;
  let data = null;
  if (form.queda_ano.value !== "") {
    const ano = Number(form.queda_ano.value);
    if (!Number.isInteger(ano) || ano < 0) throw new Error("O ano da queda precisa ser um número inteiro, de 0 em diante.");
    data = { ano, mes, dia: mes ? Number(form.queda_dia.value) || null : null };
  } else if (mes) {
    throw new Error("Escreva o ano da queda, ou deixe o mês em branco.");
  }
  const epitafio = form.epitafio.value.trim();
  return { situacao, queda: data || epitafio ? { data, epitafio } : null };
}

function coletarEdicao() {
  const form = formEdicao();
  const imagens = {};
  for (const campo of CAMPOS_IMAGEM) {
    const arquivo = form[campo].files[0] ?? null;
    imagens[campo] = { arquivo, remover: edicao.remover[campo] && !arquivo };
  }
  const dados = {
    origem: form.origem.value.trim(),
    resumo: form.resumo.value.trim(),
    historia: form.historia.value.trim(),
    imagens,
  };
  if (!$("#grupo-situacao").hidden) Object.assign(dados, situacaoDoFormulario());
  if (edicao.personagem?.origemDoDado === "portal") return dados;

  const nome = form.nome.value.trim();
  if (!nome) throw new Error("Escreva o nome do personagem.");
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

async function enviarEdicao(evento) {
  evento.preventDefault();
  const erro = $("#erro-edicao");
  const enviar = $("#edicao-enviar");
  erro.hidden = true;
  let dados;
  try {
    dados = coletarEdicao();
  } catch (falha) {
    erro.textContent = falha.message;
    erro.hidden = false;
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
    erro.textContent = falha.message;
    erro.hidden = false;
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
  form.addEventListener("submit", enviarEdicao);
  $("#edicao-cancelar").addEventListener("click", () => $("#dialogo-edicao").close());
  $("#edicao-apagar").addEventListener("click", apagarPersonagem);
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
