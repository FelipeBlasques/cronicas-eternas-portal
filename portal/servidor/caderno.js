"use strict";
/* =================================================================
   Crônicas Eternas: Caderno
   -----------------------------------------------------------------
   O caderno pessoal de cada conta, com pastas e notas. Toda conta
   que não é administrador tem um; ela só vê o próprio e o que
   compartilharam com ela. O administrador lê todos e não altera.
   Os cadernos ficam fora do dados.json, um arquivo por conta em
   cadernos/<usuario>/caderno.json, porque a página salva sozinha
   enquanto se escreve.
   ================================================================= */

const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const { CONFIG, dados, ganchos, ErroHttp, enviarJson, lerJson, REGEX_USUARIO } = require("./base");

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
};
const LIMITE_JSON = 1024 * 1024; // o corpo das rotas de escrita: uma nota inteira, com folga para os acentos

const PASTA_CADERNOS = path.join(CONFIG.pastaDados, "cadernos");
const ARQUIVO = "caderno.json";
const pastaDoCaderno = (usuario) => path.join(PASTA_CADERNOS, usuario);

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
const ondeEsta = new Map(); // id da nota ou da pasta → o caderno, para os ids serem únicos entre todos

const carimbo = () => new Date().toISOString();
const numero = (n) => n.toLocaleString("pt-BR");
const objeto = (valor) => Boolean(valor) && typeof valor === "object" && !Array.isArray(valor);
const cadernoVazio = () => ({ formato: 1, pastas: [], notas: [], fixadas: [], imagens: [] });

function novoCaderno(dono, conteudo = cadernoVazio(), corrompido = false) {
  return { dono, dados: conteudo, corrompido, gravando: null, esperando: null, apagado: false };
}

function novoId(prefixo) {
  let id;
  do id = `${prefixo}${crypto.randomBytes(6).toString("hex")}`;
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
  for (const item of [...c.dados.pastas, ...c.dados.notas]) {
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
    imagens: Array.isArray(bruto.imagens) ? bruto.imagens : [],
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
    if (!objeto(nota.link) || typeof nota.link.token !== "string") nota.link = null;
  }
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

// Ao ligar: cria a pasta dos cadernos e lê todos para a memória (são poucas contas).
// Devolve false, porque não muda nada no dados.json.
function iniciarCadernos() {
  fs.mkdirSync(PASTA_CADERNOS, { recursive: true, mode: 0o700 });
  cadernos.clear();
  ondeEsta.clear();
  for (const entrada of fs.readdirSync(PASTA_CADERNOS, { withFileTypes: true })) {
    if (entrada.isDirectory() && REGEX_USUARIO.test(entrada.name)) registrar(lerCaderno(entrada.name));
  }
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
// As etiquetas chegam na sessão 10.2
const notaDaArvore = (n, pasta) => ({ id: n.id, titulo: n.titulo, pasta, alteradaEm: n.alteradaEm, etiquetas: [] });

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
    etiquetas: [], // chegam na sessão 10.2
    imagens: espacoDe(meu),
    contas: contasComCaderno()
      .filter((c) => c.usuario !== conta.usuario)
      .map((c) => ({ usuario: c.usuario, nome: c.nome })),
  };
}

function notaPublica(conta, achado) {
  const { c, item: nota, pastas, nivel } = achado;
  // As pastas acima, da raiz para dentro, só as que a conta vê
  const caminho = pastasAcima(nota, pastas)
    .reverse()
    .filter((p) => nivelDe(conta, c, p, pastas));
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
    publica.link = nota.link ? { endereco: `/ler/#${nota.link.token}` } : null;
  }
  return {
    nota: publica,
    caminho: caminho.map((p) => ({ id: p.id, nome: p.nome })),
    // Os links, as embutidas, as imagens e "Citada em" chegam na sessão 10.2
    links: {},
    embutidas: {},
    imagens: {},
    citadaEm: [],
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
    if (recurso === "fixadas" && !id && metodo === "PUT") return mudarFixadas(req, res, conta);
    if (recurso === "notas") {
      if (!id && metodo === "POST") return criarNota(req, res, conta);
      if (id && !acao) {
        if (metodo === "GET") return enviarJson(res, 200, notaPublica(conta, itemVisivel(conta, "nota", id)));
        if (metodo === "PUT") return alterarNota(req, res, conta, id);
        if (metodo === "DELETE") return apagarNota(res, conta, id);
      }
      if (id && acao === "compartilhada" && metodo === "PUT") return compartilhar(req, res, conta, "nota", id);
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
    etiquetas: [], // chegam na sessão 10.2
    imagens: espacoDe(c),
  });
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
module.exports = { prefixo: "/api/caderno", tratar: tratarCaderno, iniciar: iniciarCadernos };
