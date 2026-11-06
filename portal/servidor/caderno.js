"use strict";
/* =================================================================
   Crônicas Eternas: Caderno
   -----------------------------------------------------------------
   O caderno pessoal de cada conta, com pastas e notas. Toda conta
   que não é administrador tem um; ela só vê o próprio e o que
   compartilharam com ela. O administrador lê todos e não altera.
   Os cadernos ficam fora do dados.json, um arquivo por conta em
   cadernos/<usuario>/caderno.json, porque a página salva sozinha
   enquanto se escreve; as imagens, em cadernos/<usuario>/imagens/.
   O texto das notas pode ter links para outras notas e para coisas
   do portal, notas embutidas, imagens e etiquetas. Uma nota pode
   ter um link público, que qualquer pessoa lê sem conta: as rotas
   dele (tratarPublico) são respondidas antes da sessão.
   ================================================================= */

const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const {
  CONFIG,
  dados,
  ganchos,
  ErroHttp,
  enviarJson,
  lerJson,
  lerFormulario,
  REGEX_USUARIO,
  TIPOS_IMAGEM,
  arquivoEnviado,
} = require("./base");
const { podeVer: podeVerAcontecimento, chaveDaData } = require("./linha");
const { podeLer: podeLerMemoria } = require("./memorias");
const { podeVerLugar } = require("./mapas");

// Os limites de cada caderno. Podem mudar à vontade: valem para o que chegar depois.
const LIMITES = {
  titulo: 120, // caracteres do título da nota, numa linha só (vazio vira "Sem título")
  nomePasta: 80, // caracteres do nome da pasta, numa linha só (obrigatório)
  texto: 100000, // caracteres do texto de uma nota
  textoDoCaderno: 10000000, // caracteres somando o texto de todas as notas de um caderno
  notas: 2000, // notas num caderno
  pastas: 500, // pastas num caderno
  niveis: 8, // pastas dentro de pastas: uma pasta na raiz é o nível 1
  imagem: CONFIG.maxImagem, // bytes de cada imagem: o mesmo das outras páginas (10 MB, no base.js)
  imagens: 1024 * 1024 * 1024, // bytes somando todas as imagens de um caderno, as órfãs também (1 GB)
  fixadas: 30, // notas que cada conta pode fixar
  link: 120, // caracteres do "o que aparece" de um link: [[tipo:id|o que aparece]]
};
const DIAS_DA_ORFA = 7; // dias que uma imagem fica guardada depois que nenhuma nota a cita mais
const RESULTADOS_DA_BUSCA = 50; // notas que a busca devolve, no máximo
const LARGURA_DO_TRECHO = 120; // caracteres, mais ou menos, do trecho de cada resultado da busca
const LIMITE_JSON = 1024 * 1024; // o corpo das rotas de escrita: uma nota inteira, com folga para os acentos
const UM_DIA = 24 * 60 * 60 * 1000;

const PASTA_CADERNOS = path.join(CONFIG.pastaDados, "cadernos");
const ARQUIVO = "caderno.json";
const pastaDoCaderno = (usuario) => path.join(PASTA_CADERNOS, usuario);
const pastaDasImagens = (usuario) => path.join(pastaDoCaderno(usuario), "imagens");

// O arquivo de uma imagem: o id (24 caracteres hexadecimais) e a extensão do tipo dela
const REGEX_ARQUIVO = /^([0-9a-f]{24})(\.[a-z0-9]+)$/;
const TIPO_DA_EXTENSAO = Object.fromEntries(Object.entries(TIPOS_IMAGEM).map(([tipo, extensao]) => [extensao, tipo]));
const CACHE_DA_IMAGEM = "private, max-age=31536000, immutable";

// O que cada conta pode receber num compartilhamento. Pelo mais de um caminho, vale o mais forte.
const FORCA = new Map([
  ["ver", 1],
  ["editar", 2],
]);

/* =================================================================
   Os cadernos na memória
   -----------------------------------------------------------------
   Cada caderno: { dono, dados, corrompido, gravando, esperando,
   apagado }. "dados" é o conteúdo do caderno.json. Um caderno que
   não pôde ser lido fica "corrompido": vazio na memória, e nada
   nele muda, para nunca gravar por cima do arquivo.
   ================================================================= */

const cadernos = new Map(); // pelo usuário da dona
const ondeEsta = new Map(); // id da nota, da pasta ou da imagem → o caderno, para os ids serem únicos entre todos

const carimbo = () => new Date().toISOString();
const numero = (n) => n.toLocaleString("pt-BR");
const objeto = (valor) => Boolean(valor) && typeof valor === "object" && !Array.isArray(valor);
const cadernoVazio = () => ({ formato: 1, pastas: [], notas: [], fixadas: [], imagens: [] });

function novoCaderno(dono, conteudo = cadernoVazio(), corrompido = false) {
  return { dono, dados: conteudo, corrompido, gravando: null, esperando: null, apagado: false };
}

// Notas e pastas: o prefixo e 12 caracteres hexadecimais. Imagens: sem prefixo, 24 caracteres.
function novoId(prefixo, bytes = 6) {
  let id;
  do id = `${prefixo}${crypto.randomBytes(bytes).toString("hex")}`;
  while (ondeEsta.has(id));
  return id;
}

const contaDe = (usuario) => dados.contas.find((c) => c.usuario === usuario);

// Dona, autora ou quem alterou. Para uma conta que não existe mais, o usuário no lugar do nome.
function pessoa(usuario) {
  const conta = contaDe(usuario);
  return { usuario, nome: conta ? conta.nome : usuario };
}

function cargoDe(conta) {
  if (conta.admin) return "admin";
  if (conta.editor) return "editor";
  return "jogador";
}

// As contas que têm caderno e que podem receber um compartilhamento: todas, menos as de administrador
const contasComCaderno = () => dados.contas.filter((c) => !c.admin);

function contaQueRecebe(usuario) {
  const conta = contaDe(usuario);
  return Boolean(conta && !conta.admin);
}

// O caderno vale enquanto a dona existir e não for administrador
const cadernoAtivo = (c) => contaQueRecebe(c.dono);

// O caderno de uma conta que não é administrador. Na primeira vez ele fica só na memória:
// o arquivo é criado na primeira mudança.
function cadernoDaConta(conta) {
  let c = cadernos.get(conta.usuario);
  if (!c) {
    c = novoCaderno(conta.usuario);
    cadernos.set(conta.usuario, c);
  }
  return c;
}

function registrar(c) {
  cadernos.set(c.dono, c);
  for (const item of [...c.dados.pastas, ...c.dados.notas, ...c.dados.imagens]) {
    if (ondeEsta.has(item.id)) console.error(`Caderno de ${c.dono}: o id ${item.id} já existe noutro caderno e foi ignorado.`);
    else ondeEsta.set(item.id, c);
  }
}

function esquecer(c) {
  if (cadernos.get(c.dono) === c) cadernos.delete(c.dono);
  for (const [id, onde] of ondeEsta) if (onde === c) ondeEsta.delete(id);
}

/* ---------- Ler do disco ---------- */

// Confere um caderno.json lido do disco. Um formato inesperado conta como arquivo corrompido
// (lança erro), para o portal nunca gravar por cima do que não entendeu. Faltas pequenas
// (um campo sem valor, uma pasta que sumiu) são acertadas só na memória.
function conferirCaderno(bruto) {
  if (!objeto(bruto) || bruto.formato !== 1) throw new Error("o formato do arquivo não é o do caderno");
  if (!Array.isArray(bruto.pastas) || !Array.isArray(bruto.notas)) throw new Error("faltam as pastas ou as notas");
  const conteudo = {
    ...bruto,
    fixadas: Array.isArray(bruto.fixadas) ? bruto.fixadas.filter((id) => typeof id === "string") : [],
  };
  const ids = new Set();
  for (const [lista, prefixo] of [
    [conteudo.pastas, "pasta-"],
    [conteudo.notas, "nota-"],
  ]) {
    for (const item of lista) {
      if (!objeto(item) || typeof item.id !== "string" || !item.id.startsWith(prefixo) || ids.has(item.id)) {
        throw new Error("há um item sem id válido");
      }
      ids.add(item.id);
      if (typeof item.pasta !== "string") item.pasta = null;
      if (!objeto(item.compartilhada)) item.compartilhada = {};
    }
  }
  for (const pasta of conteudo.pastas) if (typeof pasta.nome !== "string") pasta.nome = "Sem nome";
  for (const nota of conteudo.notas) {
    if (typeof nota.titulo !== "string") nota.titulo = "Sem título";
    if (typeof nota.texto !== "string") nota.texto = "";
    if (!Number.isInteger(nota.versao)) nota.versao = 1;
    if (!objeto(nota.link) || typeof nota.link.token !== "string" || !nota.link.token) nota.link = null;
  }
  // Uma imagem com o registro estragado fica de fora, sem perder o resto do caderno
  conteudo.imagens = (Array.isArray(bruto.imagens) ? bruto.imagens : []).filter((imagem) => {
    const casou = objeto(imagem) && typeof imagem.arquivo === "string" && REGEX_ARQUIVO.exec(imagem.arquivo);
    if (!casou || imagem.id !== casou[1] || !TIPO_DA_EXTENSAO[casou[2]] || ids.has(imagem.id)) {
      console.error(`Um registro de imagem do caderno foi ignorado: ${JSON.stringify(imagem)}`);
      return false;
    }
    ids.add(imagem.id);
    if (!Number.isFinite(imagem.tamanho) || imagem.tamanho < 0) imagem.tamanho = 0;
    if (typeof imagem.orfaDesde !== "string" || Number.isNaN(Date.parse(imagem.orfaDesde))) imagem.orfaDesde = null;
    return true;
  });
  // Um item numa pasta que não existe vai para a raiz; um círculo de pastas é cortado
  const pastas = new Map(conteudo.pastas.map((p) => [p.id, p]));
  for (const item of [...conteudo.pastas, ...conteudo.notas]) if (item.pasta && !pastas.has(item.pasta)) item.pasta = null;
  for (const pasta of conteudo.pastas) {
    const vistas = new Set([pasta.id]);
    for (let id = pasta.pasta; id; id = pastas.get(id).pasta) {
      if (vistas.has(id)) {
        pasta.pasta = null;
        break;
      }
      vistas.add(id);
    }
  }
  return conteudo;
}

function lerCaderno(usuario) {
  const arquivo = path.join(pastaDoCaderno(usuario), ARQUIVO);
  if (!fs.existsSync(arquivo)) return novoCaderno(usuario);
  try {
    return novoCaderno(usuario, conferirCaderno(JSON.parse(fs.readFileSync(arquivo, "utf8"))));
  } catch (erro) {
    console.error(
      `Não foi possível ler o caderno de ${usuario} (${arquivo}): ${erro.message}. ` +
        "Ele fica protegido: nada nele muda até o arquivo ser consertado e o portal reiniciado.",
    );
    return novoCaderno(usuario, cadernoVazio(), true);
  }
}

let relogioDasOrfas = null;

// Ao ligar: cria a pasta dos cadernos e lê todos para a memória (são poucas contas).
// Confere as imagens órfãs agora e uma vez por dia.
// Devolve false, porque não muda nada no dados.json.
function iniciarCadernos() {
  fs.mkdirSync(PASTA_CADERNOS, { recursive: true, mode: 0o700 });
  cadernos.clear();
  ondeEsta.clear();
  for (const entrada of fs.readdirSync(PASTA_CADERNOS, { withFileTypes: true })) {
    if (entrada.isDirectory() && REGEX_USUARIO.test(entrada.name)) registrar(lerCaderno(entrada.name));
  }
  conferirOrfas();
  clearInterval(relogioDasOrfas);
  relogioDasOrfas = setInterval(conferirOrfas, UM_DIA);
  relogioDasOrfas.unref();
  return false;
}

/* ---------- Gravar no disco ---------- */

function erroCorrompido(c) {
  return new ErroHttp(
    500,
    `O caderno de ${pessoa(c.dono).nome} não pôde ser lido do disco e ficou protegido: nada nele pode mudar até o administrador consertar o arquivo.`,
    "caderno-corrompido",
  );
}

function exigirGravavel(c) {
  if (c.corrompido) throw erroCorrompido(c);
}

// Grava como o dados.json: arquivo temporário, troca de nome, modo 0600. A conta pode ser
// renomeada (e o caderno, mudar de pasta) ou excluída no meio da gravação: aí a pasta antiga
// não fica para trás, e a gravação vai de novo para o lugar novo.
async function escreverCaderno(c) {
  const conteudo = JSON.stringify(c.dados, null, 2);
  for (;;) {
    if (c.apagado) return;
    const dono = c.dono;
    const pasta = pastaDoCaderno(dono);
    try {
      await fsp.mkdir(pasta, { recursive: true, mode: 0o700 });
      const temporario = path.join(pasta, `${ARQUIVO}.tmp`);
      await fsp.writeFile(temporario, conteudo, { mode: 0o600 });
      await fsp.rename(temporario, path.join(pasta, ARQUIVO));
    } catch (erro) {
      if (c.apagado || c.dono !== dono) continue;
      throw erro;
    }
    if (c.apagado || c.dono !== dono) fs.rmSync(pasta, { recursive: true, force: true });
    if (c.dono === dono) return;
  }
}

// As gravações de um caderno ficam em fila. Uma mudança que chega enquanto outra gravação
// espera vai junto com ela: no máximo uma gravação esperando por caderno. A promessa
// devolvida termina quando a gravação que leva a mudança termina.
function gravarCaderno(c) {
  if (c.corrompido) return Promise.reject(erroCorrompido(c));
  if (c.apagado) return Promise.resolve();
  if (c.esperando) return c.esperando;
  const anterior = c.gravando || Promise.resolve();
  const gravacao = anterior
    .catch(() => {})
    .then(() => {
      // Daqui em diante, uma mudança nova precisa de outra gravação
      c.esperando = null;
      c.gravando = gravacao;
      return escreverCaderno(c);
    })
    .finally(() => {
      if (c.gravando === gravacao) c.gravando = null;
    });
  c.esperando = gravacao;
  return gravacao;
}

function gravarEmSegundoPlano(c) {
  gravarCaderno(c).catch((erro) => console.error(`Não foi possível gravar o caderno de ${c.dono}:`, erro));
}

/* =================================================================
   Quem pode o quê
   ================================================================= */

const mapaDePastas = (c) => new Map(c.dados.pastas.map((p) => [p.id, p]));

// As pastas acima de um item, de dentro para fora
function pastasAcima(item, pastas) {
  const acima = [];
  const vistas = new Set();
  for (let id = item.pasta; id && pastas.has(id) && !vistas.has(id); id = pastas.get(id).pasta) {
    vistas.add(id);
    acima.push(pastas.get(id));
  }
  return acima;
}

// O nível de uma pasta na árvore: a raiz é 0, uma pasta na raiz é 1
const nivelNaArvore = (pasta, pastas) => (pasta ? 1 + pastasAcima(pasta, pastas).length : 0);

// Quantos níveis uma pasta ocupa: ela mesma e as que estão dentro dela
function alturaDa(pasta, c) {
  const filhas = c.dados.pastas.filter((p) => p.pasta === pasta.id);
  return 1 + Math.max(0, ...filhas.map((f) => alturaDa(f, c)));
}

// "compartilhada" guarda usuários como chaves: só vale o que é dela mesma, nunca o que vem do Object
function compartilhadoCom(item, usuario) {
  if (!Object.hasOwn(item.compartilhada, usuario)) return null;
  const nivel = item.compartilhada[usuario];
  return FORCA.has(nivel) ? nivel : null;
}

const maisForte = (a, b) => (!a ? b : !b ? a : FORCA.get(b) > FORCA.get(a) ? b : a);

// O que a conta recebeu num item, pelo próprio item e pelas pastas acima dele
function nivelCompartilhado(usuario, item, pastas) {
  let nivel = compartilhadoCom(item, usuario);
  for (const pasta of pastasAcima(item, pastas)) nivel = maisForte(nivel, compartilhadoCom(pasta, usuario));
  return nivel;
}

// "dona", "editar", "ver", "admin", ou null quando a conta não pode ler o item
function nivelDe(conta, c, item, pastas) {
  if (!cadernoAtivo(c)) return null;
  if (conta.admin) return "admin";
  if (c.dono === conta.usuario) return "dona";
  return nivelCompartilhado(conta.usuario, item, pastas);
}

const podeAlterar = (nivel) => nivel === "dona" || nivel === "editar";

function acharItem(tipo, id) {
  const c = ondeEsta.get(id);
  const item = c && (tipo === "nota" ? c.dados.notas : c.dados.pastas).find((x) => x.id === id);
  return item ? { c, item } : null;
}

// Uma nota ou pasta que a conta pode ler. Para quem não pode, ela não existe.
function itemVisivel(conta, tipo, id) {
  const achado = typeof id === "string" ? acharItem(tipo, id) : null;
  const pastas = achado && mapaDePastas(achado.c);
  const nivel = achado && nivelDe(conta, achado.c, achado.item, pastas);
  if (!nivel) {
    const mensagem = tipo === "nota" ? "Essa nota não existe ou não foi compartilhada com você." : "Essa pasta não existe ou não foi compartilhada com você.";
    throw new ErroHttp(404, mensagem, "nao-encontrado");
  }
  return { ...achado, pastas, nivel };
}

function exigirQuemEscreve(conta) {
  if (conta.admin) throw new ErroHttp(403, "O administrador só lê os cadernos.", "proibido");
}

function soADona(c, acao) {
  return new ErroHttp(403, `Só ${pessoa(c.dono).nome} pode ${acao}.`, "proibido");
}

// Todas as notas que a conta pode ler, nos cadernos da lista (todos, se não vier lista)
function notasLegiveis(conta, lista = [...cadernos.values()]) {
  const achadas = [];
  for (const c of lista) {
    if (!cadernoAtivo(c)) continue;
    const pastas = mapaDePastas(c);
    for (const nota of c.dados.notas) {
      const nivel = nivelDe(conta, c, nota, pastas);
      if (nivel) achadas.push({ c, item: nota, pastas, nivel });
    }
  }
  return achadas;
}

// As pastas acima de um item, da raiz para dentro, só as que a conta vê
function caminhoDe(conta, { c, item, pastas }) {
  return pastasAcima(item, pastas)
    .reverse()
    .filter((p) => nivelDe(conta, c, p, pastas))
    .map((p) => ({ id: p.id, nome: p.nome }));
}

/* =================================================================
   O texto das notas
   -----------------------------------------------------------------
   O servidor só lê do texto o que precisa: os links, as notas
   embutidas, as imagens e as etiquetas, e um texto sem as marcas
   para a busca. O desenho das marcas fica na página (marcas.js).
   ================================================================= */

// Uma barra invertida antes de uma marca mostra a marca como texto. Para ler os códigos, a dupla
// (barra e caractere) vira dois caracteres de uso privado, do mesmo tamanho, que não casam com nada.
const REGEX_ESCAPE = /\\([*~#[\]|\->\\])/g;
const REGEX_PROTEGIDO = /\uE000([\uE001-\uE07F])/g;
const protegerEscapes = (texto) =>
  texto.replace(REGEX_ESCAPE, (_, ch) => `\uE000${String.fromCharCode(0xe000 + ch.charCodeAt(0))}`);
const tirarProtecao = (texto) => texto.replace(REGEX_PROTEGIDO, (_, ch) => String.fromCharCode(ch.charCodeAt(0) - 0xe000));

// [[tipo:<id>|o que aparece]]. O "o que aparece" é obrigatório: sem a barra, não é link.
const REGEX_LINK = /\[\[(nota|personagem|evento|mesa|memoria|lugar):([^\]|\n]+)\|([^\]\n]*)\]\]/g;
// ![[nota:<id>|o que aparece]] sozinho na linha: a outra nota embutida
const REGEX_EMBUTIDA = /^[ \t]*!\[\[nota:([^\]|\n]+)\|[^\]\n]*\]\][ \t]*$/gm;
// ![[imagem:<id>|legenda]] ou ![[imagem:<id>]]
const REGEX_IMAGEM = /!\[\[imagem:([^\]|\n]+)(?:\|([^\]\n]*))?\]\]/g;
// O que não pode ter etiqueta dentro: os códigos do portal, os links [texto](https://…) e os endereços da web
const REGEX_SEM_ETIQUETA = /!?\[\[[^\]\n]*\]\]|\[[^\]\n]*\]\(https?:\/\/[^)\s]*\)|https?:\/\/\S+/g;
// #etiqueta: no começo da linha ou depois de um espaço ou de um parêntese
const REGEX_ETIQUETA = /(^|[\s(])#([\p{L}\p{M}\p{N}_/-]+)/gmu;
const MAXIMO_DA_ETIQUETA = 60;

// Para comparar sem diferença de maiúsculas e acentos sem mudar o tamanho do texto: cada
// caractere vira um só, e uma posição no texto dobrado vale no original.
const dobras = new Map();
function dobrarCaractere(ch) {
  let dobrado = dobras.get(ch);
  if (dobrado === undefined) {
    const semAcento = ch.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    dobrado = semAcento.length === 1 ? semAcento : ch;
    dobras.set(ch, dobrado);
  }
  return dobrado;
}

function dobrar(texto) {
  // Em minúsculas, só uma letra rara (o İ turco) muda de tamanho: aí vão só as letras sem acento
  const minusculas = texto.toLowerCase();
  const base = minusculas.length === texto.length ? minusculas : texto.replace(/[A-Z]/g, (l) => l.toLowerCase());
  return base.replace(/[^\x00-\x7f]/g, dobrarCaractere);
}

// Os códigos de um texto: as chaves dos links ("tipo:id"), os ids das notas embutidas e das imagens,
// e as etiquetas (a chave sem acentos → o nome em minúsculas, como apareceu primeiro)
function lerCodigos(texto) {
  const protegido = protegerEscapes(texto);
  const links = new Set();
  for (const [, tipo, id] of protegido.matchAll(REGEX_LINK)) links.add(`${tipo}:${id}`);
  const embutidas = new Set();
  for (const [, id] of protegido.matchAll(REGEX_EMBUTIDA)) embutidas.add(id);
  const imagens = new Set();
  for (const [, id] of protegido.matchAll(REGEX_IMAGEM)) imagens.add(id);
  const etiquetas = new Map();
  for (const [, , nome] of protegido.replace(REGEX_SEM_ETIQUETA, "\u0001").matchAll(REGEX_ETIQUETA)) {
    if (nome.length > MAXIMO_DA_ETIQUETA || !/\p{L}/u.test(nome)) continue;
    const minusculas = nome.toLowerCase();
    const chave = dobrar(minusculas);
    if (!etiquetas.has(chave)) etiquetas.set(chave, minusculas);
  }
  return { links, embutidas, imagens, etiquetas };
}

// O que foi lido de cada nota fica guardado enquanto o texto dela não muda
const leituras = new WeakMap();
function analisar(nota) {
  let lida = leituras.get(nota);
  if (!lida || lida.texto !== nota.texto) {
    lida = { texto: nota.texto, ...lerCodigos(nota.texto) };
    leituras.set(nota, lida);
  }
  return lida;
}

// O texto como aparece na leitura, sem as marcas e numa linha só: os links e as imagens contam
// pelo que aparece. Serve à busca e ao trecho dos resultados.
function textoSimples(texto) {
  return tirarProtecao(
    protegerEscapes(texto)
      .replace(REGEX_IMAGEM, (_, id, legenda) => legenda || " ")
      .replace(/!?\[\[(?:nota|personagem|evento|mesa|memoria|lugar):[^\]|\n]+\|([^\]\n]*)\]\]/g, "$1")
      .replace(/\[([^\]\n]*)\]\(https?:\/\/[^)\s]*\)/g, "$1")
      .replace(/^[ \t]*#+[ \t]+/gm, "") // títulos
      .replace(/^[ \t]*(?:>[ \t]?)+/gm, "") // citações
      .replace(/^[ \t]*(?:-{3,}|\*{3,}|_{3,})[ \t]*$/gm, "") // separadores
      .replace(/^[ \t]*(?:[-*]|\d+\.)[ \t]+(?:\[[ xX]\][ \t]+)?/gm, "") // listas e tarefas
      .replace(/^[ \t]*\|?(?:[ \t]*:?-+:?[ \t]*\|)+(?:[ \t]*:?-+:?[ \t]*)?$/gm, "") // a linha de traços da tabela
      .replace(/\*\*|~~|\*/g, "")
      .replace(/\|/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
}

// O texto simples e o dobrado de uma nota, feitos só na primeira busca que passa por ela
function textoDeBusca(nota) {
  const lida = analisar(nota);
  if (lida.simples === undefined) {
    lida.simples = textoSimples(nota.texto);
    lida.dobrado = dobrar(lida.simples);
  }
  return lida;
}

// Todo link precisa mostrar alguma coisa, e no máximo 120 caracteres (as mensagens das Memórias)
function conferirLinks(texto) {
  for (const [, , , aparece] of protegerEscapes(texto).matchAll(REGEX_LINK)) {
    if (!aparece.trim()) {
      throw new ErroHttp(400, "Um link no campo Texto está sem o que aparece. Escreva depois da barra: [[evento:id|o que aparece]].");
    }
    if (aparece.length > LIMITES.link) {
      throw new ErroHttp(400, `O que aparece num link pode ter no máximo ${LIMITES.link} caracteres (campo Texto).`);
    }
  }
}

/* =================================================================
   Links, notas embutidas e imagens para quem lê
   ================================================================= */

// Os personagens que a conta vê na galeria: os do portal sempre; os outros, se não forem só do administrador
const personagensVisiveis = (conta) => [
  ...(dados.personagens ?? []),
  ...(dados.outrosPersonagens ?? []).filter((p) => conta.admin || p.visibilidade !== "admin"),
];

// Os lugares que a conta vê, com o id "<mapa>/<marca>" e o nome do mapa
function lugaresVisiveis(conta) {
  const lugares = [];
  for (const mapa of dados.mapas ?? []) {
    for (const marcador of mapa.marcadores ?? []) {
      if (podeVerLugar(conta, mapa, marcador)) lugares.push({ id: `${mapa.id}/${marcador.id}`, nome: marcador.nome, mapa: mapa.nome });
    }
  }
  return lugares;
}

const enderecoPublico = (nota) => `/ler/#${nota.link.token}`;

// O link para outra nota: para quem pode lê-la, o título. Na leitura pública, uma nota que quem
// lê não pode abrir no Caderno, mas que tem o link público ligado, vem também com "publico".
function alvoDeNota(leitor, id, publica) {
  const achado = acharItem("nota", id);
  if (!achado || !cadernoAtivo(achado.c)) return null;
  const nota = achado.item;
  if (leitor && nivelDe(leitor, achado.c, nota, mapaDePastas(achado.c))) return { titulo: nota.titulo };
  if (publica && nota.link) return { titulo: nota.titulo, publico: enderecoPublico(nota) };
  return null;
}

// O que cada link mostra para quem está lendo: só os alvos que a conta vê. Os outros, e os apagados,
// ficam de fora e aparecem só como texto. "leitor" é null na leitura pública sem login: aí só as
// notas com o link público ligado viram link.
function alvosDosLinks(leitor, chaves, publica = false) {
  const listas = new Map(); // a lista de cada tipo, montada só quando um link precisa dela
  const lista = (tipo, montar) => {
    if (!listas.has(tipo)) listas.set(tipo, new Map(montar().map((x) => [x.id, x])));
    return listas.get(tipo);
  };
  const links = {};
  for (const chave of chaves) {
    const separador = chave.indexOf(":");
    const tipo = chave.slice(0, separador);
    const id = chave.slice(separador + 1);
    let alvo = null;
    if (tipo === "nota") {
      alvo = alvoDeNota(leitor, id, publica);
    } else if (leitor && tipo === "personagem") {
      const p = lista(tipo, () => personagensVisiveis(leitor)).get(id);
      if (p) alvo = { nome: p.nome };
    } else if (leitor && tipo === "evento") {
      const ev = lista(tipo, () => (dados.linha?.acontecimentos ?? []).filter((a) => podeVerAcontecimento(leitor, a))).get(id);
      if (ev) alvo = { titulo: ev.titulo };
    } else if (leitor && tipo === "mesa") {
      const mesa = lista(tipo, () => dados.campanhas ?? []).get(id);
      if (mesa) alvo = { nome: mesa.nome };
    } else if (leitor && tipo === "memoria") {
      const memoria = lista(tipo, () => (dados.memorias ?? []).filter((m) => podeLerMemoria(leitor, m))).get(id);
      if (memoria) alvo = { titulo: memoria.titulo };
    } else if (leitor && tipo === "lugar") {
      const lugar = lista(tipo, () => lugaresVisiveis(leitor)).get(id);
      if (lugar) alvo = { nome: lugar.nome, mapa: lugar.mapa };
    }
    if (alvo) links[chave] = alvo;
  }
  return links;
}

// As imagens citadas numa nota que estão no próprio caderno dela (a de outro caderno fica só com a legenda)
function juntarImagens(imagens, lida, c, endereco) {
  if (!lida.imagens.size) return;
  const doCaderno = new Map(c.dados.imagens.map((imagem) => [imagem.id, imagem]));
  for (const id of lida.imagens) {
    const imagem = doCaderno.get(id);
    if (imagem && !Object.hasOwn(imagens, id)) imagens[id] = endereco(imagem.arquivo);
  }
}

// Os links, as notas embutidas e as imagens de uma nota, com os das embutidas.
// Só um nível: a nota embutida dentro da embutida fica como link; a que embute a si mesma, também.
// "leitor": a conta, ou null na leitura pública sem login. "token": só na leitura pública, o link
// da nota principal; as imagens dela e das embutidas com link público vão pela rota pública.
function conteudoLido(nota, c, leitor, token) {
  const publica = token !== undefined;
  const endereco = (pelaPublica) => (arquivo) =>
    pelaPublica ? `/api/caderno/publico/${token}/imagens/${arquivo}` : `/api/caderno/imagens/${arquivo}`;
  const lida = analisar(nota);
  const chaves = new Set(lida.links);
  const embutidas = {};
  const imagens = {};
  juntarImagens(imagens, lida, c, endereco(publica));
  for (const id of lida.embutidas) {
    if (id === nota.id) continue;
    const achado = acharItem("nota", id);
    if (!achado || !cadernoAtivo(achado.c)) continue;
    const outra = achado.item;
    const comLink = publica && Boolean(outra.link);
    const legivel = Boolean(leitor && nivelDe(leitor, achado.c, outra, mapaDePastas(achado.c)));
    if (!comLink && !legivel) continue;
    const dono = pessoa(achado.c.dono);
    embutidas[id] = { titulo: outra.titulo, texto: outra.texto, dono: publica ? { nome: dono.nome } : dono };
    const lidaDaOutra = analisar(outra);
    for (const chave of lidaDaOutra.links) chaves.add(chave);
    juntarImagens(imagens, lidaDaOutra, achado.c, endereco(comLink));
  }
  return { links: alvosDosLinks(leitor, chaves, publica), embutidas, imagens };
}

const porTitulo = (a, b) => a.titulo.localeCompare(b.titulo, "pt-BR", { numeric: true });
const porNome = (a, b) => a.nome.localeCompare(b.nome, "pt-BR", { numeric: true });

// "Citada em": as notas que têm link para esta ou a embutem, só as que a conta pode ler
function citadaEm(conta, nota) {
  const chave = `nota:${nota.id}`;
  const lista = [];
  for (const c of cadernos.values()) {
    if (!cadernoAtivo(c)) continue;
    let pastas = null;
    for (const outra of c.dados.notas) {
      if (outra === nota || !analisar(outra).links.has(chave)) continue;
      pastas ??= mapaDePastas(c);
      if (nivelDe(conta, c, outra, pastas)) lista.push({ id: outra.id, titulo: outra.titulo, dono: pessoa(c.dono) });
    }
  }
  return lista.sort(porTitulo);
}

// As etiquetas das notas, com quantas notas tem cada uma, em ordem de nome
function contarEtiquetas(achadas) {
  const contagem = new Map();
  for (const { item } of achadas) {
    for (const [chave, nome] of analisar(item).etiquetas) {
      const atual = contagem.get(chave);
      if (atual) atual.quantas += 1;
      else contagem.set(chave, { nome, quantas: 1 });
    }
  }
  return [...contagem.values()].sort(porNome);
}

/* =================================================================
   Formatos enviados à página
   ================================================================= */

// O compartilhamento do próprio item, só com as contas que ainda podem recebê-lo
function compartilhadaPublica(item) {
  return Object.fromEntries(
    Object.entries(item.compartilhada).filter(([usuario, nivel]) => FORCA.has(nivel) && contaQueRecebe(usuario)),
  );
}

const pastaDaArvore = (p, pasta) => ({ id: p.id, nome: p.nome, pasta });
const notaDaArvore = (n, pasta) => ({
  id: n.id,
  titulo: n.titulo,
  pasta,
  alteradaEm: n.alteradaEm,
  etiquetas: [...analisar(n).etiquetas.values()],
});

// A árvore inteira de um caderno: para a dona, com o que ela compartilhou; para o administrador, sem
function arvoreInteira(c, daDona) {
  const pastas = c.dados.pastas.map((p) => {
    const item = pastaDaArvore(p, p.pasta);
    if (daDona) item.compartilhada = compartilhadaPublica(p);
    return item;
  });
  const notas = c.dados.notas.map((n) => {
    const item = notaDaArvore(n, n.pasta);
    if (daDona) Object.assign(item, { compartilhada: compartilhadaPublica(n), link: Boolean(n.link) });
    return item;
  });
  return { pastas, notas };
}

// O que um caderno compartilhou com a conta, cada item com o nível dela.
// Os do alto (fora de uma pasta também compartilhada com ela) vêm na raiz.
function arvoreCompartilhada(conta, c) {
  const pastas = mapaDePastas(c);
  const niveis = new Map();
  for (const p of c.dados.pastas) {
    const nivel = nivelCompartilhado(conta.usuario, p, pastas);
    if (nivel) niveis.set(p.id, nivel);
  }
  const acimaVisivel = (item) => (item.pasta && niveis.has(item.pasta) ? item.pasta : null);
  const arvore = { pastas: [], notas: [] };
  for (const p of c.dados.pastas) {
    if (niveis.has(p.id)) arvore.pastas.push({ ...pastaDaArvore(p, acimaVisivel(p)), nivel: niveis.get(p.id) });
  }
  for (const n of c.dados.notas) {
    const nivel = maisForte(compartilhadoCom(n, conta.usuario), niveis.get(n.pasta) || null);
    if (nivel) arvore.notas.push({ ...notaDaArvore(n, acimaVisivel(n)), nivel });
  }
  return arvore;
}

// "Compartilhadas por <nome>": uma seção para cada conta que compartilhou algo, em ordem de nome
function compartilhadasCom(conta) {
  return [...cadernos.values()]
    .filter((c) => c.dono !== conta.usuario && cadernoAtivo(c))
    .map((c) => ({ dono: pessoa(c.dono), caderno: arvoreCompartilhada(conta, c) }))
    .filter((secao) => secao.caderno.pastas.length || secao.caderno.notas.length)
    .sort((a, b) => a.dono.nome.localeCompare(b.dono.nome, "pt-BR", { numeric: true }));
}

// As fixadas que a conta ainda pode ler, na ordem em que foram fixadas
function fixadasDe(conta, c) {
  return c.dados.fixadas.flatMap((id) => {
    const achado = acharItem("nota", id);
    if (!achado || !nivelDe(conta, achado.c, achado.item, mapaDePastas(achado.c))) return [];
    return [{ id, titulo: achado.item.titulo, dono: pessoa(achado.c.dono) }];
  });
}

function espacoDe(c) {
  const usado = c.dados.imagens.reduce((soma, imagem) => soma + (Number(imagem?.tamanho) || 0), 0);
  return { usado, limite: LIMITES.imagens };
}

function dadosDoCaderno(conta) {
  const quem = { usuario: conta.usuario, nome: conta.nome, cargo: cargoDe(conta) };
  if (conta.admin) {
    const lista = contasComCaderno().map((c) => ({
      usuario: c.usuario,
      nome: c.nome,
      notas: cadernos.get(c.usuario)?.dados.notas.length ?? 0,
    }));
    return { conta: quem, cadernos: lista };
  }
  const meu = cadernoDaConta(conta);
  return {
    conta: quem,
    caderno: arvoreInteira(meu, true),
    compartilhadas: compartilhadasCom(conta),
    fixadas: fixadasDe(conta, meu),
    etiquetas: contarEtiquetas(notasLegiveis(conta)),
    imagens: espacoDe(meu),
    contas: contasComCaderno()
      .filter((c) => c.usuario !== conta.usuario)
      .map((c) => ({ usuario: c.usuario, nome: c.nome })),
  };
}

function notaPublica(conta, achado) {
  const { c, item: nota, nivel } = achado;
  const caminho = caminhoDe(conta, achado);
  const acimaVisivel = caminho.length && caminho[caminho.length - 1].id === nota.pasta;
  const publica = {
    id: nota.id,
    titulo: nota.titulo,
    texto: nota.texto,
    pasta: acimaVisivel ? nota.pasta : null,
    versao: nota.versao,
    criadaEm: nota.criadaEm,
    alteradaEm: nota.alteradaEm,
    alteradaPor: nota.alteradaPor ? pessoa(nota.alteradaPor) : null,
    dono: pessoa(c.dono),
    nivel,
  };
  if (nivel === "dona") {
    publica.compartilhada = compartilhadaPublica(nota);
    publica.link = nota.link ? { endereco: enderecoPublico(nota) } : null;
  }
  return { nota: publica, caminho, ...conteudoLido(nota, c, conta), citadaEm: citadaEm(conta, nota) };
}

// A nota do link público, para qualquer pessoa. "leitor" é a conta de quem está logado, ou null.
function leituraPublica({ c, nota }, leitor) {
  return {
    nota: {
      id: nota.id,
      titulo: nota.titulo,
      texto: nota.texto,
      alteradaEm: nota.alteradaEm,
      dono: { nome: pessoa(c.dono).nome },
    },
    ...conteudoLido(nota, c, leitor, nota.link.token),
  };
}

/* =================================================================
   O que chega da página
   ================================================================= */

const numaLinha = (valor) => valor.replace(/\s*[\r\n]+\s*/g, " ").trim();

function tituloDaNota(valor) {
  if (valor === undefined || valor === null) return "Sem título";
  if (typeof valor !== "string") throw new ErroHttp(400, "O título da nota precisa ser um texto.");
  const titulo = numaLinha(valor);
  if (titulo.length > LIMITES.titulo) {
    throw new ErroHttp(400, `O título da nota pode ter no máximo ${numero(LIMITES.titulo)} caracteres.`);
  }
  return titulo || "Sem título";
}

function nomeDaPasta(valor) {
  const nome = typeof valor === "string" ? numaLinha(valor) : "";
  if (!nome) throw new ErroHttp(400, "Preencha o nome da pasta.");
  if (nome.length > LIMITES.nomePasta) {
    throw new ErroHttp(400, `O nome da pasta pode ter no máximo ${numero(LIMITES.nomePasta)} caracteres.`);
  }
  return nome;
}

function textoDaNota(valor) {
  if (typeof valor !== "string") throw new ErroHttp(400, "O texto da nota precisa ser um texto.");
  const textoLimpo = valor.replace(/\r\n?/g, "\n");
  if (textoLimpo.length > LIMITES.texto) {
    throw new ErroHttp(400, `O texto da nota pode ter no máximo ${numero(LIMITES.texto)} caracteres.`);
  }
  conferirLinks(textoLimpo);
  return textoLimpo;
}

// "aMais": quantos caracteres a mudança acrescenta ao caderno (pode ser negativo)
function conferirTextoDoCaderno(c, aMais) {
  if (aMais <= 0) return;
  const total = c.dados.notas.reduce((soma, n) => soma + n.texto.length, 0);
  if (total + aMais > LIMITES.textoDoCaderno) {
    throw new ErroHttp(
      400,
      `O texto do caderno inteiro, somando todas as notas, pode ter no máximo ${numero(LIMITES.textoDoCaderno)} de caracteres.`,
    );
  }
}

function erroNiveis() {
  return new ErroHttp(400, `As pastas podem ficar no máximo ${numero(LIMITES.niveis)} níveis uma dentro da outra.`);
}

// Onde a conta pode criar uma nota ou pasta: a raiz do próprio caderno (pasta null),
// uma pasta dela ou uma pasta compartilhada com ela para editar
function ondeCriar(conta, idDaPasta) {
  if (idDaPasta === undefined || idDaPasta === null) {
    const c = cadernoDaConta(conta);
    exigirGravavel(c);
    return { c, pasta: null, pastas: mapaDePastas(c) };
  }
  const { c, item: pasta, pastas, nivel } = itemVisivel(conta, "pasta", idDaPasta);
  if (!podeAlterar(nivel)) throw new ErroHttp(403, "Você pode ver esta pasta, mas não criar nada nela.", "proibido");
  exigirGravavel(c);
  return { c, pasta, pastas };
}

// A pasta para onde a dona move um item: a raiz (null) ou uma pasta do mesmo caderno
function pastaDeDestino(c, valor) {
  if (valor === null) return null;
  const achado = typeof valor === "string" ? acharItem("pasta", valor) : null;
  if (!achado || achado.c !== c) throw new ErroHttp(400, "Escolha uma pasta deste mesmo caderno.");
  return achado.item;
}

// Contas que existem, que não são administrador nem a dona, com "ver" ou "editar"
function contasDoCompartilhar(valor, dono) {
  if (!objeto(valor)) throw new ErroHttp(400, "Escolha com quem compartilhar.");
  const pares = Object.entries(valor);
  for (const [usuario, nivel] of pares) {
    if (!FORCA.has(nivel)) throw new ErroHttp(400, 'Escolha "ver" ou "editar" para cada conta.');
    const conta = contaDe(usuario);
    if (!conta) throw new ErroHttp(400, "Uma das contas escolhidas não existe. Recarregue a página.");
    if (conta.admin) throw new ErroHttp(400, "O administrador já lê todos os cadernos. Escolha só as outras contas.");
    if (usuario === dono) throw new ErroHttp(400, "Este caderno já é seu. Escolha só as outras contas.");
  }
  return Object.fromEntries(pares);
}

/* =================================================================
   Rotas
   ================================================================= */

async function tratarCaderno(req, res, rota, metodo, conta) {
  let partes;
  try {
    partes = rota.split("/").filter(Boolean).slice(2).map(decodeURIComponent);
  } catch {
    throw new ErroHttp(404, "Endereço não encontrado.");
  }
  const [recurso, id, acao, ...resto] = partes;

  if (!resto.length) {
    if (!recurso && metodo === "GET") return enviarJson(res, 200, dadosDoCaderno(conta));
    if (recurso === "contas" && id && !acao && metodo === "GET") return verCadernoDaConta(res, conta, id);
    if (recurso === "contas" && id && acao === "grafo" && metodo === "GET") return verGrafoDaConta(res, conta, id);
    if (recurso === "grafo" && !id && metodo === "GET") return verGrafo(res, conta);
    if (recurso === "fixadas" && !id && metodo === "PUT") return mudarFixadas(req, res, conta);
    if (recurso === "busca" && !id && metodo === "GET") return buscar(req, res, conta);
    if (recurso === "citaveis" && !id && metodo === "GET") return enviarJson(res, 200, citaveis(conta));
    if (recurso === "imagens") {
      if (!id && metodo === "POST") return receberImagem(req, res, conta);
      if (id && !acao && metodo === "GET") return verImagem(res, conta, id);
    }
    if (recurso === "notas") {
      if (!id && metodo === "POST") return criarNota(req, res, conta);
      if (id && !acao) {
        if (metodo === "GET") return enviarJson(res, 200, notaPublica(conta, itemVisivel(conta, "nota", id)));
        if (metodo === "PUT") return alterarNota(req, res, conta, id);
        if (metodo === "DELETE") return apagarNota(res, conta, id);
      }
      if (id && acao === "compartilhada" && metodo === "PUT") return compartilhar(req, res, conta, "nota", id);
      if (id && acao === "link") {
        if (metodo === "POST") return ligarLink(res, conta, id);
        if (metodo === "DELETE") return desligarLink(res, conta, id);
      }
    }
    if (recurso === "pastas") {
      if (!id && metodo === "POST") return criarPasta(req, res, conta);
      if (id && !acao) {
        if (metodo === "PUT") return alterarPasta(req, res, conta, id);
        if (metodo === "DELETE") return apagarPasta(res, conta, id);
      }
      if (id && acao === "compartilhada" && metodo === "PUT") return compartilhar(req, res, conta, "pasta", id);
    }
  }
  throw new ErroHttp(404, "Endereço não encontrado.");
}

// O administrador lê o caderno de uma conta, sem alterar
function verCadernoDaConta(res, conta, usuario) {
  if (!conta.admin) throw new ErroHttp(403, "Só o administrador pode fazer isso.", "proibido");
  const dona = contaDe(usuario);
  if (!dona || dona.admin) throw new ErroHttp(404, "Essa conta não existe ou não tem caderno.", "nao-encontrado");
  const c = cadernoDaConta(dona);
  enviarJson(res, 200, {
    dono: pessoa(dona.usuario),
    caderno: arvoreInteira(c, false),
    etiquetas: contarEtiquetas(notasLegiveis(conta, [c])),
    imagens: espacoDe(c),
  });
}

/* ---------- O grafo ---------- */

// Os ids das notas que só aparecem embutidas no texto, nunca como link comum. O REGEX_LINK casa
// também dentro do ![[nota:…]]: o link comum é o que sobra depois de tirar as embutidas.
function soEmbutidas(nota) {
  const lida = analisar(nota);
  if (lida.soEmbutidas === undefined) {
    const vezes = new Map();
    const protegido = protegerEscapes(nota.texto);
    for (const [, tipo, id] of protegido.matchAll(REGEX_LINK)) if (tipo === "nota") vezes.set(id, (vezes.get(id) ?? 0) + 1);
    for (const [, id] of protegido.matchAll(REGEX_EMBUTIDA)) vezes.set(id, (vezes.get(id) ?? 0) - 1);
    lida.soEmbutidas = new Set(lida.embutidas.size ? [...lida.embutidas].filter((id) => (vezes.get(id) ?? 0) <= 0) : []);
  }
  return lida.soEmbutidas;
}

// As notas da lista, as linhas entre elas e para o portal, e os alvos do portal que a conta vê.
// Tudo sai do que já se lê das notas; nada é guardado.
function montarGrafo(conta, lista) {
  const ids = new Set(lista.map((achado) => achado.item.id));
  const notas = [];
  const pares = [];
  const chavesDoPortal = new Set();
  for (const { c, item: nota } of lista) {
    const lida = analisar(nota);
    notas.push({ id: nota.id, titulo: nota.titulo, dono: pessoa(c.dono), etiquetas: [...lida.etiquetas.values()] });
    const embutidas = soEmbutidas(nota);
    for (const chave of lida.links) {
      if (chave.startsWith("nota:")) {
        const id = chave.slice(5);
        if (id === nota.id || !ids.has(id)) continue;
        pares.push({ de: nota.id, para: chave, embutida: embutidas.has(id) });
      } else {
        chavesDoPortal.add(chave);
        pares.push({ de: nota.id, para: chave, embutida: false });
      }
    }
  }
  const alvos = alvosDosLinks(conta, chavesDoPortal);
  const mesas = new Map((dados.campanhas ?? []).map((m) => [m.id, m]));
  for (const [chave, alvo] of Object.entries(alvos)) {
    if (chave.startsWith("mesa:")) alvo.cor = mesas.get(chave.slice(5))?.cor ?? null;
  }
  // "links" é um Set: cada par já aparece uma vez só
  const ligacoes = pares.filter((par) => par.para.startsWith("nota:") || Object.hasOwn(alvos, par.para));
  return { notas, ligacoes, alvos };
}

// O grafo das notas que a conta lê: as do caderno dela e as compartilhadas com ela
function verGrafo(res, conta) {
  if (conta.admin) throw new ErroHttp(403, "O administrador vê o grafo do caderno de cada conta.", "proibido");
  enviarJson(res, 200, montarGrafo(conta, notasLegiveis(conta)));
}

// O administrador vê o grafo do caderno de uma conta
function verGrafoDaConta(res, conta, usuario) {
  if (!conta.admin) throw new ErroHttp(403, "Só o administrador pode fazer isso.", "proibido");
  const dona = contaDe(usuario);
  if (!dona || dona.admin) throw new ErroHttp(404, "Essa conta não existe ou não tem caderno.", "nao-encontrado");
  enviarJson(res, 200, montarGrafo(conta, notasLegiveis(conta, [cadernoDaConta(dona)])));
}

/* ---------- Notas ---------- */

// O caderno é o da pasta; na raiz, o da própria conta
async function criarNota(req, res, conta) {
  exigirQuemEscreve(conta);
  const corpo = await lerJson(req, LIMITE_JSON);
  const titulo = tituloDaNota(corpo.titulo);
  const textoNovo = corpo.texto === undefined ? "" : textoDaNota(corpo.texto);
  const { c, pasta } = ondeCriar(conta, corpo.pasta);
  if (c.dados.notas.length >= LIMITES.notas) {
    throw new ErroHttp(400, `Um caderno pode ter no máximo ${numero(LIMITES.notas)} notas.`);
  }
  conferirTextoDoCaderno(c, textoNovo.length);
  const quando = carimbo();
  const nota = {
    id: novoId("nota-"),
    titulo,
    pasta: pasta ? pasta.id : null,
    texto: textoNovo,
    versao: 1,
    criadaEm: quando,
    criadaPor: conta.usuario,
    alteradaEm: quando,
    alteradaPor: conta.usuario,
    compartilhada: {},
    link: null,
  };
  c.dados.notas.push(nota);
  ondeEsta.set(nota.id, c);
  await gravarCaderno(c);
  enviarJson(res, 201, { nota: { id: nota.id } });
}

// Título e texto pedem a versão que a página tem: se a nota mudou desde então, 409.
// Mover (a pasta) é só da dona e não pede versão.
async function alterarNota(req, res, conta, id) {
  exigirQuemEscreve(conta);
  const corpo = await lerJson(req, LIMITE_JSON);
  const { c, item: nota, nivel } = itemVisivel(conta, "nota", id);
  if (!podeAlterar(nivel)) throw new ErroHttp(403, "Você pode ler esta nota, mas não alterar.", "proibido");

  let destino = nota.pasta;
  if (corpo.pasta !== undefined && corpo.pasta !== nota.pasta) {
    if (nivel !== "dona") throw soADona(c, "mover esta nota");
    destino = pastaDeDestino(c, corpo.pasta)?.id ?? null;
  }
  exigirGravavel(c);

  const mudaTitulo = corpo.titulo !== undefined;
  const mudaTexto = corpo.texto !== undefined;
  const titulo = mudaTitulo ? tituloDaNota(corpo.titulo) : nota.titulo;
  const textoNovo = mudaTexto ? textoDaNota(corpo.texto) : nota.texto;
  if (mudaTitulo || mudaTexto) {
    if (!Number.isInteger(corpo.versao)) throw new ErroHttp(400, "Envie a versão da nota que você está alterando.");
    if (corpo.versao !== nota.versao) {
      throw new ErroHttp(409, "Esta nota mudou enquanto você escrevia.", "conflito", {
        nota: {
          titulo: nota.titulo,
          texto: nota.texto,
          versao: nota.versao,
          alteradaEm: nota.alteradaEm,
          alteradaPor: nota.alteradaPor ? pessoa(nota.alteradaPor) : null,
        },
      });
    }
    conferirTextoDoCaderno(c, textoNovo.length - nota.texto.length);
  }

  const mudou = titulo !== nota.titulo || textoNovo !== nota.texto;
  const moveu = destino !== nota.pasta;
  if (mudou) {
    nota.titulo = titulo;
    nota.texto = textoNovo;
    nota.versao += 1;
    nota.alteradaEm = carimbo();
    nota.alteradaPor = conta.usuario;
  }
  if (moveu) nota.pasta = destino;
  if (mudou || moveu) await gravarCaderno(c);
  enviarJson(res, 200, { nota: { versao: nota.versao, alteradaEm: nota.alteradaEm } });
}

// Tira notas e pastas de um caderno; as fixadas da dona que estavam ali saem junto
function tirarDoCaderno(c, ids) {
  c.dados.pastas = c.dados.pastas.filter((p) => !ids.has(p.id));
  c.dados.notas = c.dados.notas.filter((n) => !ids.has(n.id));
  c.dados.fixadas = c.dados.fixadas.filter((id) => !ids.has(id));
  for (const id of ids) ondeEsta.delete(id);
}

async function apagarNota(res, conta, id) {
  exigirQuemEscreve(conta);
  const { c, item: nota, nivel } = itemVisivel(conta, "nota", id);
  if (nivel !== "dona") throw soADona(c, "apagar esta nota");
  exigirGravavel(c);
  tirarDoCaderno(c, new Set([nota.id]));
  await gravarCaderno(c);
  enviarJson(res, 200, { ok: true });
}

/* ---------- Pastas ---------- */

async function criarPasta(req, res, conta) {
  exigirQuemEscreve(conta);
  const corpo = await lerJson(req, LIMITE_JSON);
  const nome = nomeDaPasta(corpo.nome);
  const { c, pasta: acima, pastas } = ondeCriar(conta, corpo.pasta);
  if (c.dados.pastas.length >= LIMITES.pastas) {
    throw new ErroHttp(400, `Um caderno pode ter no máximo ${numero(LIMITES.pastas)} pastas.`);
  }
  if (nivelNaArvore(acima, pastas) + 1 > LIMITES.niveis) throw erroNiveis();
  const pasta = {
    id: novoId("pasta-"),
    nome,
    pasta: acima ? acima.id : null,
    compartilhada: {},
    criadaEm: carimbo(),
    criadaPor: conta.usuario,
  };
  c.dados.pastas.push(pasta);
  ondeEsta.set(pasta.id, c);
  await gravarCaderno(c);
  enviarJson(res, 201, { pasta: { id: pasta.id } });
}

// Quem pode editar a pasta só muda o nome; mover é da dona
async function alterarPasta(req, res, conta, id) {
  exigirQuemEscreve(conta);
  const corpo = await lerJson(req, LIMITE_JSON);
  const { c, item: pasta, pastas, nivel } = itemVisivel(conta, "pasta", id);
  if (!podeAlterar(nivel)) throw new ErroHttp(403, "Você pode ver esta pasta, mas não renomear.", "proibido");
  const nome = corpo.nome === undefined ? pasta.nome : nomeDaPasta(corpo.nome);

  let destino = pasta.pasta;
  if (corpo.pasta !== undefined && corpo.pasta !== pasta.pasta) {
    if (nivel !== "dona") throw soADona(c, "mover esta pasta");
    const nova = pastaDeDestino(c, corpo.pasta);
    if (nova && (nova === pasta || pastasAcima(nova, pastas).includes(pasta))) {
      throw new ErroHttp(400, "Uma pasta não pode ir para dentro dela mesma.");
    }
    if (nivelNaArvore(nova, pastas) + alturaDa(pasta, c) > LIMITES.niveis) throw erroNiveis();
    destino = nova ? nova.id : null;
  }
  exigirGravavel(c);

  if (nome !== pasta.nome || destino !== pasta.pasta) {
    pasta.nome = nome;
    pasta.pasta = destino;
    await gravarCaderno(c);
  }
  enviarJson(res, 200, { ok: true });
}

// A pasta, as pastas dentro dela e as notas de todas elas
function conteudoDa(pasta, c) {
  const ids = new Set([pasta.id]);
  for (let cresceu = true; cresceu; ) {
    cresceu = false;
    for (const p of c.dados.pastas) {
      if (!ids.has(p.id) && ids.has(p.pasta)) {
        ids.add(p.id);
        cresceu = true;
      }
    }
  }
  for (const n of c.dados.notas) if (ids.has(n.pasta)) ids.add(n.id);
  return ids;
}

async function apagarPasta(res, conta, id) {
  exigirQuemEscreve(conta);
  const { c, item: pasta, nivel } = itemVisivel(conta, "pasta", id);
  if (nivel !== "dona") throw soADona(c, "apagar esta pasta");
  exigirGravavel(c);
  tirarDoCaderno(c, conteudoDa(pasta, c));
  await gravarCaderno(c);
  enviarJson(res, 200, { ok: true });
}

/* ---------- Compartilhar e fixar ---------- */

// Substitui as contas com quem o item está compartilhado
async function compartilhar(req, res, conta, tipo, id) {
  exigirQuemEscreve(conta);
  const corpo = await lerJson(req, LIMITE_JSON);
  const { c, item, nivel } = itemVisivel(conta, tipo, id);
  if (nivel !== "dona") throw soADona(c, `compartilhar esta ${tipo}`);
  const contas = contasDoCompartilhar(corpo.contas, c.dono);
  exigirGravavel(c);
  item.compartilhada = contas;
  await gravarCaderno(c);
  enviarJson(res, 200, { ok: true });
}

// As fixadas ficam no caderno de quem fixou, e valem notas do caderno e compartilhadas
async function mudarFixadas(req, res, conta) {
  exigirQuemEscreve(conta);
  const corpo = await lerJson(req, LIMITE_JSON);
  if (!Array.isArray(corpo.notas) || corpo.notas.some((id) => typeof id !== "string")) {
    throw new ErroHttp(400, "Envie a lista das notas fixadas.");
  }
  const ids = [...new Set(corpo.notas)];
  if (ids.length > LIMITES.fixadas) throw new ErroHttp(400, `Você pode fixar no máximo ${numero(LIMITES.fixadas)} notas.`);
  for (const id of ids) itemVisivel(conta, "nota", id);
  const meu = cadernoDaConta(conta);
  exigirGravavel(meu);
  meu.dados.fixadas = ids;
  await gravarCaderno(meu);
  enviarJson(res, 200, { ok: true });
}

/* ---------- O link público ---------- */

// Liga o link público, ou gera outro: o antigo para de funcionar na hora
async function ligarLink(res, conta, id) {
  exigirQuemEscreve(conta);
  const { c, item: nota, nivel } = itemVisivel(conta, "nota", id);
  if (nivel !== "dona") throw soADona(c, "ligar o link público desta nota");
  exigirGravavel(c);
  nota.link = { token: crypto.randomBytes(24).toString("base64url"), criadoEm: carimbo() };
  await gravarCaderno(c);
  enviarJson(res, 200, { link: { endereco: enderecoPublico(nota) } });
}

async function desligarLink(res, conta, id) {
  exigirQuemEscreve(conta);
  const { c, item: nota, nivel } = itemVisivel(conta, "nota", id);
  if (nivel !== "dona") throw soADona(c, "desligar o link público desta nota");
  exigirGravavel(c);
  if (nota.link) {
    nota.link = null;
    await gravarCaderno(c);
  }
  enviarJson(res, 200, { ok: true });
}

/* ---------- Imagens ---------- */

// Um tamanho em bytes do jeito que se lê: "10 MB", "1 GB", "1,5 GB"
function emBytes(bytes) {
  for (const [unidade, tamanho] of [
    ["GB", 1024 ** 3],
    ["MB", 1024 ** 2],
    ["KB", 1024],
  ]) {
    const arredondado = Math.round((bytes / tamanho) * 10) / 10;
    if (arredondado >= 1) return `${numero(arredondado)} ${unidade}`;
  }
  return `${numero(bytes)} bytes`;
}

function semImagem() {
  return new ErroHttp(404, "Essa imagem não existe ou não foi compartilhada com você.", "nao-encontrado");
}

// A imagem pelo nome do arquivo, com o caderno em que está
function imagemPeloArquivo(arquivo) {
  const casou = typeof arquivo === "string" && REGEX_ARQUIVO.exec(arquivo);
  const c = casou && ondeEsta.get(casou[1]);
  const imagem = c && c.dados.imagens.find((im) => im.id === casou[1] && im.arquivo === arquivo);
  return imagem && cadernoAtivo(c) ? { c, imagem } : null;
}

async function mandarImagem(res, { c, imagem }) {
  const caminho = path.join(pastaDasImagens(c.dono), imagem.arquivo);
  let info;
  try {
    info = await fsp.stat(caminho);
  } catch {
    throw semImagem();
  }
  res.writeHead(200, {
    "Content-Type": TIPO_DA_EXTENSAO[path.extname(imagem.arquivo)],
    "Content-Length": info.size,
    "Cache-Control": CACHE_DA_IMAGEM,
  });
  fs.createReadStream(caminho)
    .on("error", () => res.destroy())
    .pipe(res);
}

// A imagem fica protegida: só quem pode ler uma nota do mesmo caderno que a cite (o administrador sempre)
function verImagem(res, conta, arquivo) {
  const achada = imagemPeloArquivo(arquivo);
  if (!achada) throw semImagem();
  const { c, imagem } = achada;
  if (!conta.admin) {
    const pastas = mapaDePastas(c);
    const citada = c.dados.notas.some((n) => analisar(n).imagens.has(imagem.id) && nivelDe(conta, c, n, pastas));
    if (!citada) throw semImagem();
  }
  return mandarImagem(res, achada);
}

// Espaço das imagens do caderno inteiro, as órfãs também
function conferirEspaco(c, tamanho) {
  const { usado, limite } = espacoDe(c);
  if (usado + tamanho > limite) {
    throw new ErroHttp(
      400,
      `As imagens do caderno de ${pessoa(c.dono).nome} podem somar no máximo ${emBytes(limite)}, e já somam ${emBytes(usado)}: ` +
        `esta não cabe. As imagens que nenhuma nota cita mais saem sozinhas depois de ${DIAS_DA_ORFA} dias.`,
      "sem-espaco",
    );
  }
}

// "nota" é a nota sendo escrita: a imagem vai para o caderno dela e conta no espaço da dona
async function receberImagem(req, res, conta) {
  exigirQuemEscreve(conta);
  let form;
  try {
    form = await lerFormulario(req, LIMITES.imagem + CONFIG.maxJson);
  } catch (erro) {
    if (erro instanceof ErroHttp && erro.status === 413) {
      throw new ErroHttp(413, `Cada imagem pode ter no máximo ${emBytes(LIMITES.imagem)}.`);
    }
    throw erro;
  }
  const arquivo = form.get("imagem");
  const idDaNota = form.get("nota");
  const { c, nivel } = itemVisivel(conta, "nota", typeof idDaNota === "string" ? idDaNota : null);
  if (!podeAlterar(nivel)) throw new ErroHttp(403, "Você pode ler esta nota, mas não pôr imagens nela.", "proibido");
  if (!arquivoEnviado(arquivo)) throw new ErroHttp(400, "Escolha a imagem.");
  if (!TIPOS_IMAGEM[arquivo.type]) throw new ErroHttp(400, "Use imagens PNG, JPG, WEBP, GIF ou AVIF.");
  if (arquivo.size > LIMITES.imagem) throw new ErroHttp(413, `Cada imagem pode ter no máximo ${emBytes(LIMITES.imagem)}.`);
  exigirGravavel(c);
  conferirEspaco(c, arquivo.size);
  const conteudo = Buffer.from(await arquivo.arrayBuffer());

  // Daqui até o registro, tudo é síncrono: a conta não muda de nome nem some no meio,
  // e duas imagens enviadas juntas não passam as duas pelo espaço que só cabe uma
  if (c.apagado) throw new ErroHttp(404, "Essa nota não existe ou não foi compartilhada com você.", "nao-encontrado");
  conferirEspaco(c, conteudo.length);
  const id = novoId("", 12);
  const nome = `${id}${TIPOS_IMAGEM[arquivo.type]}`;
  const pasta = pastaDasImagens(c.dono);
  fs.mkdirSync(pasta, { recursive: true, mode: 0o700 });
  fs.writeFileSync(path.join(pasta, nome), conteudo, { mode: 0o600 });
  c.dados.imagens.push({ id, arquivo: nome, tamanho: conteudo.length, criadaEm: carimbo(), orfaDesde: null });
  ondeEsta.set(id, c);
  await gravarCaderno(c);
  enviarJson(res, 201, { imagem: { id, endereco: `/api/caderno/imagens/${nome}` } });
}

/* ---------- Busca e citáveis ---------- */

// Uns 120 caracteres do texto em volta do achado, sem cortar palavras nas pontas.
// "pos" -1: o achado foi só no título, e o trecho é o começo do texto.
function trechoEmVolta(simples, pos, tamanho) {
  if (simples.length <= LARGURA_DO_TRECHO) return simples;
  const folga = Math.max(0, Math.floor((LARGURA_DO_TRECHO - tamanho) / 2));
  let inicio = pos < 0 ? 0 : Math.max(0, Math.min(pos - folga, simples.length - LARGURA_DO_TRECHO));
  let fim = Math.min(simples.length, inicio + LARGURA_DO_TRECHO);
  const fimDoAchado = pos < 0 ? inicio : pos + tamanho;
  if (inicio > 0) {
    const espaco = simples.indexOf(" ", inicio);
    if (espaco !== -1 && espaco < (pos < 0 ? fim : pos)) inicio = espaco + 1;
  }
  if (fim < simples.length) {
    const espaco = simples.lastIndexOf(" ", fim);
    if (espaco > Math.max(inicio, fimDoAchado)) fim = espaco;
  }
  // Nunca um caractere de fora do básico (um emoji) pela metade
  if (/[\uDC00-\uDFFF]/.test(simples[inicio])) inicio += 1;
  if (/[\uD800-\uDBFF]/.test(simples[fim - 1])) fim -= 1;
  return `${inicio > 0 ? "…" : ""}${simples.slice(inicio, fim)}${fim < simples.length ? "…" : ""}`;
}

// As datas são ISO, então a ordem do texto é a ordem do tempo
const doMaisRecente = (a = "", b = "") => (a < b ? 1 : a > b ? -1 : 0);

// No título e no texto, sem diferença de maiúsculas e acentos. Começando com #, busca a etiqueta.
// Primeiro os achados no título, depois os mais recentes. O administrador busca no caderno de uma conta.
function buscar(req, res, conta) {
  const parametros = new URL(req.url, "http://portal.local").searchParams;
  const q = (parametros.get("q") ?? "").replace(/\s+/g, " ").trim();
  if (q.length < 2) throw new ErroHttp(400, "Escreva pelo menos 2 caracteres para buscar.");
  let lista;
  if (conta.admin) {
    const usuario = parametros.get("conta");
    if (!usuario) throw new ErroHttp(400, "Escolha o caderno em que buscar.");
    const dona = contaDe(usuario);
    if (!dona || dona.admin) throw new ErroHttp(404, "Essa conta não existe ou não tem caderno.", "nao-encontrado");
    lista = notasLegiveis(conta, [cadernoDaConta(dona)]);
  } else {
    lista = notasLegiveis(conta);
  }

  const etiqueta = q.startsWith("#") ? dobrar(q.slice(1).trim()) : null;
  const termo = etiqueta === null ? dobrar(q) : `#${etiqueta}`;
  const achados = [];
  for (const achado of lista) {
    const nota = achado.item;
    let noTitulo = false;
    if (etiqueta !== null) {
      if (!analisar(nota).etiquetas.has(etiqueta)) continue;
    } else {
      noTitulo = dobrar(nota.titulo).includes(termo);
      if (!noTitulo && !textoDeBusca(nota).dobrado.includes(termo)) continue;
    }
    achados.push({ achado, noTitulo });
  }
  achados.sort((a, b) =>
    a.noTitulo !== b.noTitulo ? (a.noTitulo ? -1 : 1) : doMaisRecente(a.achado.item.alteradaEm, b.achado.item.alteradaEm),
  );

  const resultados = achados.slice(0, RESULTADOS_DA_BUSCA).map(({ achado }) => {
    const { simples, dobrado } = textoDeBusca(achado.item);
    return {
      id: achado.item.id,
      titulo: achado.item.titulo,
      dono: pessoa(achado.c.dono),
      caminho: caminhoDe(conta, achado),
      trecho: trechoEmVolta(simples, dobrado.indexOf(termo), termo.length),
    };
  });
  enviarJson(res, 200, { resultados });
}

// O que o "Citar" oferece: só o que a conta vê. As notas são as do caderno dela e as compartilhadas com ela.
function citaveis(conta) {
  exigirQuemEscreve(conta);
  const notas = notasLegiveis(conta)
    .map((achado) => ({
      id: achado.item.id,
      titulo: achado.item.titulo,
      caminho: caminhoDe(conta, achado),
      dono: pessoa(achado.c.dono),
    }))
    .sort(porTitulo);
  return { notas, ...citaveisDoPortal(conta) };
}

// O "Citar" sem as notas: os personagens, os acontecimentos, as mesas, as memórias e os lugares
// que a conta vê. Serve também à página dos lugares nos Mapas.
function citaveisDoPortal(conta) {
  const acontecimentos = (dados.linha?.acontecimentos ?? [])
    .filter((ev) => podeVerAcontecimento(conta, ev))
    .sort((a, b) => chaveDaData(a.data) - chaveDaData(b.data))
    .map((ev) => ({ id: ev.id, titulo: ev.titulo, ano: ev.data.ano }));
  return {
    personagens: personagensVisiveis(conta)
      .map((p) => ({ id: p.id, nome: p.nome }))
      .sort(porNome),
    acontecimentos,
    mesas: (dados.campanhas ?? []).map((m) => ({ id: m.id, nome: m.nome })),
    memorias: (dados.memorias ?? [])
      .filter((m) => podeLerMemoria(conta, m))
      .map((m) => ({ id: m.id, titulo: m.titulo }))
      .sort(porTitulo),
    lugares: lugaresVisiveis(conta),
  };
}

/* =================================================================
   A leitura pública
   -----------------------------------------------------------------
   Qualquer pessoa com o link lê a nota, sem conta. O servidor.js
   responde estas rotas antes de conferir a sessão, só para GET, e
   passa a conta de quem está logado, ou null.
   ================================================================= */

const PREFIXO_PUBLICO = "/api/caderno/publico";

function notaDoLink(token) {
  if (typeof token === "string" && token) {
    for (const c of cadernos.values()) {
      if (!cadernoAtivo(c)) continue;
      const nota = c.dados.notas.find((n) => n.link?.token === token);
      if (nota) return { c, nota };
    }
  }
  throw new ErroHttp(404, "Este link não está mais ativo.", "link-inativo");
}

// Vale a imagem citada na nota do link, ou numa nota embutida nela que também tenha o link público
// ligado. Cada nota, só as imagens do próprio caderno.
function imagemDaLeituraPublica({ c, nota }, { c: dona, imagem }) {
  const lida = analisar(nota);
  if (dona === c && lida.imagens.has(imagem.id)) return true;
  for (const id of lida.embutidas) {
    if (id === nota.id) continue;
    const achado = acharItem("nota", id);
    if (achado && achado.c === dona && achado.item.link && analisar(achado.item).imagens.has(imagem.id)) return true;
  }
  return false;
}

function tratarPublico(req, res, rota, metodo, conta) {
  res.setHeader("X-Robots-Tag", "noindex");
  let partes;
  try {
    partes = rota.slice(PREFIXO_PUBLICO.length).split("/").filter(Boolean).map(decodeURIComponent);
  } catch {
    throw new ErroHttp(404, "Endereço não encontrado.");
  }
  const [token, recurso, arquivo, ...resto] = partes;
  if (metodo === "GET" && token && !resto.length) {
    if (!recurso) return enviarJson(res, 200, leituraPublica(notaDoLink(token), conta));
    if (recurso === "imagens" && arquivo) {
      const principal = notaDoLink(token);
      const achada = imagemPeloArquivo(arquivo);
      if (!achada || !imagemDaLeituraPublica(principal, achada)) throw semImagem();
      return mandarImagem(res, achada);
    }
  }
  throw new ErroHttp(404, "Endereço não encontrado.");
}

/* =================================================================
   Imagens órfãs
   -----------------------------------------------------------------
   A imagem que nenhuma nota do próprio caderno cita mais não some
   na hora, para um recortar e colar não perder a imagem: ela ganha
   "orfaDesde" e é apagada depois de 7 dias. Citada de novo antes
   disso, "orfaDesde" volta a null. Roda ao ligar e uma vez por dia.
   ================================================================= */

function conferirOrfas() {
  const agora = Date.now();
  for (const c of cadernos.values()) {
    if (c.corrompido || c.apagado || !c.dados.imagens.length) continue;
    try {
      const citadas = new Set();
      for (const nota of c.dados.notas) for (const id of analisar(nota).imagens) citadas.add(id);
      const apagar = [];
      let mudou = false;
      c.dados.imagens = c.dados.imagens.filter((imagem) => {
        if (citadas.has(imagem.id)) {
          if (imagem.orfaDesde) {
            imagem.orfaDesde = null;
            mudou = true;
          }
          return true;
        }
        if (!imagem.orfaDesde) {
          imagem.orfaDesde = carimbo();
          mudou = true;
          return true;
        }
        if (agora - Date.parse(imagem.orfaDesde) < DIAS_DA_ORFA * UM_DIA) return true;
        apagar.push(imagem);
        mudou = true;
        return false;
      });
      if (!mudou) continue;
      for (const imagem of apagar) ondeEsta.delete(imagem.id);
      // Os arquivos saem só depois de o caderno ser gravado sem eles
      gravarCaderno(c)
        .then(() => {
          if (c.apagado) return;
          for (const imagem of apagar) fs.rmSync(path.join(pastaDasImagens(c.dono), imagem.arquivo), { force: true });
        })
        .catch((erro) => console.error(`Não foi possível limpar as imagens do caderno de ${c.dono}:`, erro));
    } catch (erro) {
      console.error(`Não foi possível conferir as imagens do caderno de ${c.dono}:`, erro);
    }
  }
}

/* =================================================================
   Contas renomeadas e excluídas
   -----------------------------------------------------------------
   Os ganchos são síncronos: usam as funções síncronas do fs (são
   raros) e mandam gravar os cadernos que mudaram.
   ================================================================= */

// Troca um usuário por outro em todos os cadernos que dá para alterar; devolve os que mudaram
function trocarNosCadernos(trocar) {
  const mudaram = new Set();
  for (const c of cadernos.values()) {
    if (c.corrompido) continue;
    for (const item of [...c.dados.pastas, ...c.dados.notas]) if (trocar(item)) mudaram.add(c);
  }
  return mudaram;
}

// Usuário renomeado: a pasta do caderno muda de nome, e o usuário muda no "compartilhada",
// no "criadaPor" e no "alteradaPor" de todos os cadernos
function renomearNosCadernos(antigo, novo) {
  const proprio = cadernos.get(antigo);
  let gravarProprio = false;
  if (proprio) {
    const deAntes = pastaDoCaderno(antigo);
    try {
      if (fs.existsSync(deAntes)) fs.renameSync(deAntes, pastaDoCaderno(novo));
    } catch (erro) {
      console.error(`Não foi possível mudar a pasta do caderno de ${antigo} para ${novo}:`, erro);
      gravarProprio = true; // o que está na memória vai para o lugar novo
    }
    // Um caderno que sobrou de uma conta antiga com o usuário novo sai da memória
    const sobra = cadernos.get(novo);
    if (sobra) esquecer(sobra);
    cadernos.delete(antigo);
    proprio.dono = novo;
    cadernos.set(novo, proprio);
  }

  const mudaram = trocarNosCadernos((item) => {
    let mudou = false;
    if (Object.hasOwn(item.compartilhada, antigo)) {
      item.compartilhada = Object.fromEntries(
        Object.entries(item.compartilhada).map(([usuario, nivel]) => [usuario === antigo ? novo : usuario, nivel]),
      );
      mudou = true;
    }
    if (item.criadaPor === antigo) {
      item.criadaPor = novo;
      mudou = true;
    }
    if (item.alteradaPor === antigo) {
      item.alteradaPor = novo;
      mudou = true;
    }
    return mudou;
  });
  if (proprio && gravarProprio && !proprio.corrompido) mudaram.add(proprio);
  for (const c of mudaram) gravarEmSegundoPlano(c);
}

// Conta excluída: o caderno dela é apagado, com as imagens, e ela sai do "compartilhada" dos outros.
// O que ela escreveu nos cadernos dos outros fica, com o usuário dela em "criadaPor" e "alteradaPor".
function apagarCadernoDaConta(conta) {
  const proprio = cadernos.get(conta.usuario);
  if (proprio) {
    proprio.apagado = true;
    esquecer(proprio);
  }
  try {
    fs.rmSync(pastaDoCaderno(conta.usuario), { recursive: true, force: true });
  } catch (erro) {
    console.error(`Não foi possível apagar o caderno de ${conta.usuario}:`, erro);
  }

  const mudaram = trocarNosCadernos((item) => {
    if (!Object.hasOwn(item.compartilhada, conta.usuario)) return false;
    item.compartilhada = Object.fromEntries(
      Object.entries(item.compartilhada).filter(([usuario]) => usuario !== conta.usuario),
    );
    return true;
  });
  for (const c of mudaram) gravarEmSegundoPlano(c);
}

ganchos.renomearConta.push(renomearNosCadernos);
ganchos.excluirConta.push(apagarCadernoDaConta);

// Os endereços /api/caderno/... são desta página. "iniciar" lê os cadernos ao ligar o portal.
// Os que começam com /api/caderno/publico/ abrem sem login: o servidor.js os passa a "tratarPublico".
// "lerCodigos", "alvosDosLinks", "conferirLinks" e "citaveisDoPortal" servem à página dos lugares nos Mapas.
module.exports = {
  prefixo: "/api/caderno",
  tratar: tratarCaderno,
  iniciar: iniciarCadernos,
  prefixoPublico: PREFIXO_PUBLICO,
  tratarPublico,
  lerCodigos,
  alvosDosLinks,
  conferirLinks,
  citaveisDoPortal,
};
