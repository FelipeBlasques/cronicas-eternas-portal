"use strict";
/* =================================================================
   Crônicas Eternas: Memórias de Draevor
   -----------------------------------------------------------------
   Os textos do cenário: cartas, contos, recortes, livros e outros
   escritos que os personagens encontram. Só o administrador
   escreve. Toda memória nasce escondida e só aparece para quem o
   administrador revelar; para os outros, ela não existe.
   O texto pode mencionar acontecimentos da Linha do Tempo e
   personagens da galeria com links.

   O Livro é um PDF: o miolo, como vai para a gráfica, e as imagens
   opcionais da capa, da lombada e da contracapa, cada uma enviada
   crua (sem formulário) para /api/memorias/<id>/livro/<parte>. Os
   arquivos ficam em livros/<id>/ (veja o servidor/livros.js) e
   saem pela rota protegida, só para quem pode ler o livro. O índice
   (a página e o nome de cada capítulo) o administrador monta à mão.
   Os livros antigos, escritos por capítulos, continuam como estão
   até o PDF chegar; ninguém escreve capítulos novos.
   ================================================================= */

const crypto = require("node:crypto");
const { CONFIG, dados, salvarDados, ganchos, ErroHttp, enviarJson, lerJson, texto, TIPOS_IMAGEM } = require("./base");
const { iniciar: garantirLinha, lerDataDaLinha, podeVer, dataPublica, chaveDaData, textoOpcional, anoDeHoje } = require("./linha");
const livros = require("./livros");

// As classificações e o rótulo do campo "detalhe" de cada uma (null: não tem o campo)
const TIPOS = new Map([
  ["carta", "Assinatura"],
  ["conto", null],
  ["diario", null],
  ["recorte", "Recortado de"],
  ["trecho", "Do livro"],
  ["livro", null],
  ["poema", null],
  ["documento", "Emitido por"],
  ["inscricao", "Onde está gravada"],
]);
const LIMITES = {
  memorias: 500,
  texto: 100000,
  link: 120,
  inicio: 160,
  miolo: 200 * 1024 * 1024, // o PDF do miolo, em bytes (o nginx precisa aceitar um pouco mais)
  paginas: 5000,
  indice: 300, // capítulos no índice do livro
};
const LIMITE_JSON = 4 * 1024 * 1024; // um texto de 100.000 caracteres, com acentos e links, cabe com folga

// As imagens opcionais do livro; sem a capa e a contracapa, o folheador desenha o couro, e sem
// a lombada, a estante desenha uma
const PARTES_DO_LIVRO = ["capa", "lombada", "contracapa"];

// Uma menção no texto: [[evento:<id>|o que aparece]] ou [[personagem:<id>|o que aparece]]
const REGEX_LINK = /\[\[(evento|personagem):([^\]|\n]+)\|([^\]\n]*)\]\]/g;

const carimbo = () => new Date().toISOString();
const idAleatorio = () => crypto.randomBytes(4).toString("hex");
// As datas são ISO, então a ordem do texto é a ordem do tempo
const doMaisRecente = (a, b) => (a < b ? 1 : a > b ? -1 : 0);

function novoId(prefixo, ocupados) {
  let id;
  do id = `${prefixo}${idAleatorio()}`;
  while (ocupados.has(id));
  return id;
}

function cargoDe(conta) {
  if (conta.admin) return "admin";
  if (conta.editor) return "editor";
  return "jogador";
}

const escondida = () => ({ todos: null, contas: {} });

/* ---------- O livro em PDF ---------- */

// miolo: { arquivo, paginas, largura, altura (da página 1, em pontos), bytes } ou null;
// capa, lombada, contracapa: { arquivo, largura, altura (em pixels) } ou null;
// indice: [{ pagina, titulo }], em ordem de página; baixar: quem lê pode baixar o PDF
const livroVazio = () => ({ miolo: null, capa: null, lombada: null, contracapa: null, indice: [], baixar: false });

// O livro antigo, escrito por capítulos no formulário: continua assim até o PDF do miolo chegar
const livroAntigo = (m) => m.tipo === "livro" && m.capitulos.length > 0;

const numeroEntre = (valor, minimo, maximo) => typeof valor === "number" && Number.isFinite(valor) && valor >= minimo && valor <= maximo;
const inteiroEntre = (valor, minimo, maximo) => Number.isInteger(valor) && valor >= minimo && valor <= maximo;

// Confere o livro salvo; o que não estiver no formato sai (um arquivo que falta, um capítulo
// do índice sem página). Devolve o livro certo.
function livroConferido(livro) {
  const certo = livroVazio();
  if (!livro || typeof livro !== "object") return certo;
  const miolo = livro.miolo;
  if (
    miolo &&
    livros.arquivoValido(miolo.arquivo) &&
    inteiroEntre(miolo.paginas, 1, LIMITES.paginas) &&
    numeroEntre(miolo.largura, 1, 20000) &&
    numeroEntre(miolo.altura, 1, 20000)
  ) {
    certo.miolo = { arquivo: miolo.arquivo, paginas: miolo.paginas, largura: miolo.largura, altura: miolo.altura, bytes: Number(miolo.bytes) || 0 };
  }
  for (const parte of PARTES_DO_LIVRO) {
    const imagem = livro[parte];
    if (imagem && livros.arquivoValido(imagem.arquivo) && inteiroEntre(imagem.largura, 1, 20000) && inteiroEntre(imagem.altura, 1, 20000)) {
      certo[parte] = { arquivo: imagem.arquivo, largura: imagem.largura, altura: imagem.altura };
    }
  }
  if (Array.isArray(livro.indice) && certo.miolo) {
    certo.indice = livro.indice
      .filter((e) => e && inteiroEntre(e.pagina, 1, certo.miolo.paginas) && typeof e.titulo === "string" && e.titulo.trim())
      .map((e) => ({ pagina: e.pagina, titulo: e.titulo.trim().slice(0, 120) }))
      .slice(0, LIMITES.indice);
  }
  certo.baixar = livro.baixar === true;
  return certo;
}

// Os arquivos que o livro usa agora
const arquivosDoLivro = (livro) => [livro?.miolo, ...PARTES_DO_LIVRO.map((parte) => livro?.[parte])].filter(Boolean).map((a) => a.arquivo);

// Cria a lista na primeira vez e confere o formato do que está salvo.
// Devolve true quando precisou mudar alguma coisa.
function garantirMemorias() {
  let mudou = false;
  if (!Array.isArray(dados.memorias)) {
    dados.memorias = [];
    mudou = true;
  }
  for (const m of dados.memorias) {
    const r = m.revelacao;
    if (!r || typeof r !== "object" || !r.contas || typeof r.contas !== "object" || Array.isArray(r.contas)) {
      m.revelacao = { ...escondida(), todos: (r && r.todos) || null };
      mudou = true;
    }
    if (!Array.isArray(m.capitulos)) {
      m.capitulos = [];
      mudou = true;
    }
    // Todo Livro tem o "livro" (o antigo também, vazio até o PDF chegar); as outras classificações, não
    if (m.tipo === "livro") {
      const certo = livroConferido(m.livro);
      if (JSON.stringify(certo) !== JSON.stringify(m.livro)) {
        m.livro = certo;
        mudou = true;
      }
    } else if ("livro" in m) {
      delete m.livro;
      mudou = true;
    }
  }
  return mudou;
}

// Ao ligar o portal: confere os dados e arruma as pastas dos livros (sem esperar)
function iniciarMemorias() {
  const mudou = garantirMemorias();
  const emUso = new Map(dados.memorias.filter((m) => m.tipo === "livro").map((m) => [m.id, new Set(arquivosDoLivro(m.livro))]));
  livros.arrumarPastas(emUso).catch((erro) => console.error("Não foi possível arrumar as pastas dos livros:", erro));
  return mudou;
}

function exigirAdmin(conta) {
  if (!conta.admin) throw new ErroHttp(403, "Só o administrador pode fazer isso.", "proibido");
}

function semMemoria() {
  return new ErroHttp(404, "Essa memória não existe.", "nao-encontrado");
}

/* ---------- Revelar ---------- */

// As contas que podem receber uma memória: todas, menos as de administrador, que já veem tudo
const contasMarcaveis = () => dados.contas.filter((c) => !c.admin);

// "contas" guarda usuários como chaves: só vale o que é dela mesma, nunca o que vem do Object
const dataDaConta = (revelacao, usuario) => (Object.hasOwn(revelacao.contas, usuario) ? revelacao.contas[usuario] : null);

// As contas para quem a memória foi revelada, entre as que ainda podem recebê-la
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
// Para o administrador, a primeira vez que a memória foi revelada para alguém. Escondida: null.
function reveladaEm(m, conta) {
  const usuarios = conta.admin ? contasReveladas(m) : [conta.usuario];
  const datas = [m.revelacao.todos, ...usuarios.map((u) => dataDaConta(m.revelacao, u))].filter(Boolean);
  return datas.length ? datas.sort()[0] : null;
}

const podeLer = (conta, m) => Boolean(conta.admin || reveladaEm(m, conta));

// Para quem não pode ler, a memória escondida não existe
function memoriaVisivel(conta, id) {
  const memoria = dados.memorias.find((m) => m.id === id);
  if (!memoria || !podeLer(conta, memoria)) throw semMemoria();
  return memoria;
}

/* ---------- Links no texto ---------- */

const textosDe = (m) => (m.tipo === "livro" ? m.capitulos.map((c) => c.texto) : [m.texto]);

// O começo do texto para a lista: sem as marcas e sem os códigos dos links, as linhas juntas
// (no Poema, com " / ", para a página pôr os versos de volta) e cortado no fim de uma palavra
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

// Os personagens que a conta vê na galeria: os do portal sempre; os outros, se não forem só do administrador
function personagensVisiveis(conta) {
  const outros = (dados.outrosPersonagens ?? []).filter((p) => conta.admin || p.visibilidade !== "admin");
  return [...dados.personagens, ...outros];
}

// Só os alvos que a conta pode ver. Os outros, e os que foram apagados, ficam só como texto na página.
function linksPara(conta, textos) {
  const acontecimentos = new Map((dados.linha?.acontecimentos ?? []).map((ev) => [ev.id, ev]));
  const personagens = new Map(personagensVisiveis(conta).map((p) => [p.id, p]));
  const links = {};
  for (const textoDaMemoria of textos) {
    for (const [, alvo, id] of textoDaMemoria.matchAll(REGEX_LINK)) {
      const chave = `${alvo}:${id}`;
      if (chave in links) continue;
      if (alvo === "evento") {
        const ev = acontecimentos.get(id);
        if (ev && podeVer(conta, ev)) links[chave] = { titulo: ev.titulo };
      } else {
        const personagem = personagens.get(id);
        if (personagem) links[chave] = { nome: personagem.nome };
      }
    }
  }
  return links;
}

/* ---------- Formatos enviados à página ---------- */

// Primeiro as escondidas (só o administrador as vê), da alterada mais recentemente;
// depois as reveladas, da revelada mais recentemente
function ordemDaLista(a, b) {
  if (!a.reveladaEm !== !b.reveladaEm) return a.reveladaEm ? 1 : -1;
  return a.reveladaEm ? doMaisRecente(a.reveladaEm, b.reveladaEm) : doMaisRecente(a.alteradoEm, b.alteradoEm);
}

// O que o "Citar" do formulário oferece: tudo, porque só o administrador escreve
function citaveis() {
  const acontecimentos = [...(dados.linha?.acontecimentos ?? [])]
    .sort((a, b) => chaveDaData(a.data) - chaveDaData(b.data))
    .map((ev) => ({ id: ev.id, titulo: ev.titulo, ano: ev.data.ano }));
  const personagens = personagensVisiveis({ admin: true })
    .map((p) => ({ id: p.id, nome: p.nome }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  return { acontecimentos, personagens };
}

/* ---------- O livro, para a página ---------- */

// Os arquivos saem pela rota protegida, com o nome do arquivo no fim (ele muda a cada envio)
const enderecoDoArquivo = (m, arquivo) => `/api/memorias/${encodeURIComponent(m.id)}/livro/${arquivo}`;

function imagemPublica(m, parte) {
  const imagem = m.livro?.[parte];
  return imagem ? { endereco: enderecoDoArquivo(m, imagem.arquivo), largura: imagem.largura, altura: imagem.altura } : null;
}

// Na estante: o livro antigo leva quantos capítulos tem; o de PDF, as páginas (0 sem o miolo),
// o tamanho da página e a imagem da lombada
function livroNaLista(m) {
  if (livroAntigo(m)) return { capitulos: m.capitulos.length };
  const miolo = m.livro.miolo;
  return {
    paginas: miolo?.paginas ?? 0,
    formato: miolo ? { largura: miolo.largura, altura: miolo.altura } : null,
    lombada: imagemPublica(m, "lombada"),
  };
}

// Na leitura: o PDF, as imagens, o índice e se quem lê pode baixar o PDF
function livroPublico(m) {
  const miolo = m.livro.miolo;
  return {
    miolo: miolo
      ? { endereco: enderecoDoArquivo(m, miolo.arquivo), paginas: miolo.paginas, largura: miolo.largura, altura: miolo.altura, bytes: miolo.bytes }
      : null,
    ...Object.fromEntries(PARTES_DO_LIVRO.map((parte) => [parte, imagemPublica(m, parte)])),
    indice: m.livro.indice.map((e) => ({ pagina: e.pagina, titulo: e.titulo })),
    baixar: m.livro.baixar,
  };
}

// A lista vai sem os textos, só com o que a biblioteca precisa: o começo do texto e, no Livro,
// o que a lombada precisa
function dadosDasMemorias(conta) {
  const memorias = dados.memorias
    .filter((m) => podeLer(conta, m))
    .map((m) => {
      const item = {
        id: m.id,
        titulo: m.titulo,
        tipo: m.tipo,
        data: m.data ? dataPublica(m.data, true) : null,
        detalhe: TIPOS.get(m.tipo) ? m.detalhe || "" : "",
      };
      if (m.tipo === "livro") Object.assign(item, livroNaLista(m));
      else item.inicio = inicioDoTexto(m.texto, m.tipo === "poema");
      item.reveladaEm = reveladaEm(m, conta);
      if (conta.admin) Object.assign(item, { alteradoEm: m.alteradoEm, revelacao: revelacaoPublica(m) });
      return item;
    })
    .sort(ordemDaLista);
  const resposta = { conta: { usuario: conta.usuario, nome: conta.nome, cargo: cargoDe(conta) }, memorias };
  if (conta.admin) {
    resposta.contas = contasMarcaveis().map((c) => ({ usuario: c.usuario, nome: c.nome }));
    resposta.citaveis = citaveis();
  }
  return resposta;
}

function memoriaPublica(m, conta) {
  const publica = {
    id: m.id,
    titulo: m.titulo,
    tipo: m.tipo,
    data: m.data ? dataPublica(m.data, true) : null,
    detalhe: TIPOS.get(m.tipo) ? m.detalhe || "" : "",
  };
  if (m.tipo === "livro") {
    publica.livro = livroPublico(m);
    if (livroAntigo(m)) publica.capitulos = m.capitulos.map((c) => ({ titulo: c.titulo, texto: c.texto }));
  } else publica.texto = m.texto;
  publica.reveladaEm = reveladaEm(m, conta);
  if (conta.admin) publica.revelacao = revelacaoPublica(m);
  return publica;
}

/* ---------- O que chega do formulário ---------- */

// Todo link precisa mostrar alguma coisa, e no máximo 120 caracteres
function conferirLinks(textoDaMemoria, campo) {
  for (const [, , , aparece] of textoDaMemoria.matchAll(REGEX_LINK)) {
    if (!aparece.trim()) {
      throw new ErroHttp(400, `Um link no campo ${campo} está sem o que aparece. Escreva depois da barra: [[evento:id|o que aparece]].`);
    }
    if (aparece.length > LIMITES.link) {
      throw new ErroHttp(400, `O que aparece num link pode ter no máximo ${LIMITES.link} caracteres (campo ${campo}).`);
    }
  }
}

function textoDaMemoria(valor, campo) {
  const limpo = textoOpcional(valor, campo, LIMITES.texto);
  conferirLinks(limpo, campo);
  return limpo;
}

// Confere e limpa o que veio do formulário de uma memória.
// No Livro não há texto: o PDF e as imagens vão pelas rotas do livro, e do formulário vem só o
// "baixar". Os capítulos de um livro antigo ficam como estão (quem decide é o alterarMemoria).
// O "detalhe" só fica nas classificações que têm o campo.
function valoresDaMemoria(corpo) {
  const titulo = texto(corpo.titulo, "Título", 120);
  if (typeof corpo.tipo !== "string" || !TIPOS.has(corpo.tipo)) {
    throw new ErroHttp(400, "Escolha uma classificação da lista.");
  }
  const tipo = corpo.tipo;
  const data = corpo.data ? lerDataDaLinha(corpo.data, anoDeHoje(), true) : null;
  const rotulo = TIPOS.get(tipo);
  const detalhe = rotulo ? textoOpcional(corpo.detalhe, rotulo, 120).replace(/\s*\n\s*/g, " ") : "";
  if (tipo === "livro") return { titulo, tipo, data, detalhe, texto: "", baixar: corpo.baixar === true };
  return { titulo, tipo, data, detalhe, texto: textoDaMemoria(corpo.texto, "Texto") };
}

// Repete usuários à vontade; uma conta que não existe, ou de administrador, é recusada
function contasEscolhidas(lista) {
  if (!Array.isArray(lista)) throw new ErroHttp(400, "Escolha as contas que vão ler a memória.");
  const usuarios = [...new Set(lista)];
  for (const usuario of usuarios) {
    const conta = dados.contas.find((c) => c.usuario === usuario);
    if (!conta) throw new ErroHttp(400, "Uma das contas escolhidas não existe. Recarregue a página.");
    if (conta.admin) throw new ErroHttp(400, "O administrador já vê todas as memórias. Escolha só as outras contas.");
  }
  return usuarios;
}

/* ---------- Rotas ---------- */

async function tratarMemorias(req, res, rota, metodo, conta) {
  const mudouLinha = garantirLinha();
  if (garantirMemorias() || mudouLinha) await salvarDados();
  let partes;
  try {
    partes = rota.split("/").filter(Boolean).slice(2).map(decodeURIComponent);
  } catch {
    throw new ErroHttp(404, "Endereço não encontrado.");
  }
  const [id, acao, ...resto] = partes;

  if (!resto.length) {
    if (!id && metodo === "GET") return enviarJson(res, 200, dadosDasMemorias(conta));
    if (!id && metodo === "POST") return escreverMemoria(req, res, conta);
    if (id && !acao) {
      if (metodo === "GET") return lerMemoria(res, conta, id);
      if (metodo === "PUT") return alterarMemoria(req, res, conta, id);
      if (metodo === "DELETE") return apagarMemoria(res, conta, id);
    }
    if (id && acao === "revelacao" && metodo === "PUT") return mudarRevelacao(req, res, conta, id);
  }
  if (id && acao === "livro" && resto.length === 1) return tratarLivro(req, res, conta, metodo, id, resto[0]);
  throw new ErroHttp(404, "Endereço não encontrado.");
}

/* ---------- As rotas do livro: /api/memorias/<id>/livro/<parte ou arquivo> ---------- */

// GET <arquivo>: o PDF ou uma imagem, para quem pode ler (com ?baixar=1, o PDF para salvar).
// Só o administrador: PUT miolo, PUT e DELETE capa/lombada/contracapa e PUT indice.
async function tratarLivro(req, res, conta, metodo, id, alvo) {
  if (metodo === "GET" || metodo === "HEAD") return mandarArquivoDoLivro(req, res, conta, id, alvo);
  exigirAdmin(conta);
  const memoria = memoriaVisivel(conta, id);
  if (memoria.tipo !== "livro") throw new ErroHttp(400, "Essa memória não é um livro.");
  if (alvo === "miolo" && metodo === "PUT") return receberMiolo(req, res, conta, memoria);
  if (PARTES_DO_LIVRO.includes(alvo) && metodo === "PUT") return receberImagem(req, res, memoria, alvo);
  if (PARTES_DO_LIVRO.includes(alvo) && metodo === "DELETE") return tirarImagem(res, memoria, alvo);
  if (alvo === "indice" && metodo === "PUT") return salvarIndice(req, res, memoria);
  throw new ErroHttp(404, "Endereço não encontrado.");
}

const parametrosDe = (req) => new URL(req.url, "http://portal.local").searchParams;

async function mandarArquivoDoLivro(req, res, conta, id, arquivo) {
  const memoria = memoriaVisivel(conta, id);
  if (memoria.tipo !== "livro" || !arquivosDoLivro(memoria.livro).includes(arquivo)) {
    throw new ErroHttp(404, "Esse arquivo não existe.");
  }
  const baixar = parametrosDe(req).get("baixar") === "1";
  if (baixar) {
    if (arquivo !== memoria.livro.miolo?.arquivo) throw new ErroHttp(404, "Esse arquivo não existe.");
    if (!conta.admin && !memoria.livro.baixar) throw new ErroHttp(403, "Este livro não pode ser baixado.", "proibido");
  }
  return livros.mandarArquivo(req, res, memoria.id, arquivo, { baixarComo: baixar ? `${memoria.titulo}.pdf` : null });
}

// Um número do endereço (?paginas=240&largura=419.5...), entre os limites
function numeroDoEndereco(parametros, nome, { minimo, maximo, inteiro, rotulo }) {
  const valor = Number(parametros.get(nome));
  const certo = inteiro ? inteiroEntre(valor, minimo, maximo) : numeroEntre(valor, minimo, maximo);
  if (!parametros.has(nome) || !certo) throw new ErroHttp(400, `Não deu para ler ${rotulo} do arquivo. Escolha-o de novo.`);
  return inteiro ? valor : Math.round(valor * 100) / 100;
}

// Enquanto o arquivo chegava, a memória pode ter sido apagada ou deixado de ser livro
function conferirQueAindaELivro(memoria, arquivo) {
  if (dados.memorias.includes(memoria) && memoria.tipo === "livro") return;
  livros.apagarArquivo(memoria.id, arquivo);
  throw new ErroHttp(409, "O livro mudou enquanto o arquivo chegava. Abra o livro de novo.");
}

// O PDF do miolo, cru (Content-Type: application/pdf). Quantas páginas ele tem e o tamanho da
// página 1 vêm no endereço: o navegador do administrador leu com o pdf.js antes de mandar.
// Com o PDF, um livro antigo deixa os capítulos; o índice perde o que passou da última página.
async function receberMiolo(req, res, conta, memoria) {
  if (!String(req.headers["content-type"] || "").startsWith("application/pdf")) {
    throw new ErroHttp(415, "Mande o miolo em PDF.");
  }
  const parametros = parametrosDe(req);
  const paginas = numeroDoEndereco(parametros, "paginas", { minimo: 1, maximo: LIMITES.paginas, inteiro: true, rotulo: "as páginas" });
  const largura = numeroDoEndereco(parametros, "largura", { minimo: 1, maximo: 20000, rotulo: "o tamanho da página" });
  const altura = numeroDoEndereco(parametros, "altura", { minimo: 1, maximo: 20000, rotulo: "o tamanho da página" });
  const { arquivo, bytes } = await livros.receberArquivo(req, memoria.id, "miolo", ".pdf", {
    limite: LIMITES.miolo,
    inicioValido: (inicio) => inicio.includes("%PDF-"),
    mensagemDoTipo: "Esse arquivo não é um PDF.",
  });
  conferirQueAindaELivro(memoria, arquivo);
  const antigo = memoria.livro.miolo?.arquivo;
  memoria.livro.miolo = { arquivo, paginas, largura, altura, bytes };
  memoria.livro.indice = memoria.livro.indice.filter((e) => e.pagina <= paginas);
  memoria.capitulos = [];
  memoria.alteradoEm = carimbo();
  await salvarDados();
  if (antigo) await livros.apagarArquivo(memoria.id, antigo);
  console.log(`${conta.usuario} mandou o PDF do livro "${memoria.titulo}" (${paginas} páginas)`);
  enviarJson(res, 200, { livro: livroPublico(memoria) });
}

// A capa, a lombada ou a contracapa, crua (Content-Type da imagem). A largura e a altura da imagem,
// em pixels, vêm no endereço; a estante usa a proporção da lombada.
async function receberImagem(req, res, memoria, parte) {
  const tipo = String(req.headers["content-type"] || "").split(";")[0].trim().toLowerCase();
  const extensao = TIPOS_IMAGEM[tipo];
  if (!extensao) throw new ErroHttp(415, "Use imagens PNG, JPG, WEBP, GIF ou AVIF.");
  const parametros = parametrosDe(req);
  const largura = numeroDoEndereco(parametros, "largura", { minimo: 1, maximo: 20000, inteiro: true, rotulo: "o tamanho da imagem" });
  const altura = numeroDoEndereco(parametros, "altura", { minimo: 1, maximo: 20000, inteiro: true, rotulo: "o tamanho da imagem" });
  const { arquivo } = await livros.receberArquivo(req, memoria.id, parte, extensao, {
    limite: CONFIG.maxImagem,
    inicioValido: () => true,
    mensagemDoTipo: "",
  });
  conferirQueAindaELivro(memoria, arquivo);
  const antigo = memoria.livro[parte]?.arquivo;
  memoria.livro[parte] = { arquivo, largura, altura };
  memoria.alteradoEm = carimbo();
  await salvarDados();
  if (antigo) await livros.apagarArquivo(memoria.id, antigo);
  enviarJson(res, 200, { livro: livroPublico(memoria) });
}

async function tirarImagem(res, memoria, parte) {
  const antigo = memoria.livro[parte]?.arquivo;
  if (antigo) {
    memoria.livro[parte] = null;
    memoria.alteradoEm = carimbo();
    await salvarDados();
    await livros.apagarArquivo(memoria.id, antigo);
  }
  enviarJson(res, 200, { livro: livroPublico(memoria) });
}

// O índice inteiro de uma vez: [{ pagina, titulo }], em qualquer ordem. Fica em ordem de página
// (capítulos na mesma página ficam na ordem em que vieram).
async function salvarIndice(req, res, memoria) {
  const corpo = await lerJson(req, LIMITE_JSON);
  const miolo = memoria.livro.miolo;
  if (!miolo) throw new ErroHttp(400, "Mande o PDF do miolo antes de montar o índice.");
  if (!Array.isArray(corpo.indice)) throw new ErroHttp(400, "Mande o índice como uma lista.");
  if (corpo.indice.length > LIMITES.indice) throw new ErroHttp(400, `O índice pode ter no máximo ${LIMITES.indice} capítulos.`);
  const indice = corpo.indice.map((bruto, i) => {
    const entrada = bruto && typeof bruto === "object" ? bruto : {};
    if (!inteiroEntre(entrada.pagina, 1, miolo.paginas)) {
      throw new ErroHttp(400, `A página do capítulo ${i + 1} do índice precisa ser de 1 a ${miolo.paginas}.`);
    }
    return { pagina: entrada.pagina, titulo: texto(entrada.titulo, `nome do capítulo ${i + 1} do índice`, 120) };
  });
  memoria.livro.indice = indice.map((e, i) => ({ ...e, i })).sort((a, b) => a.pagina - b.pagina || a.i - b.i).map(({ pagina, titulo }) => ({ pagina, titulo }));
  memoria.alteradoEm = carimbo();
  await salvarDados();
  enviarJson(res, 200, { livro: livroPublico(memoria) });
}

function lerMemoria(res, conta, id) {
  const memoria = memoriaVisivel(conta, id);
  enviarJson(res, 200, { memoria: memoriaPublica(memoria, conta), links: linksPara(conta, textosDe(memoria)) });
}

// Toda memória nasce escondida. O Livro nasce sem o PDF: ele vem depois, pela rota do miolo.
async function escreverMemoria(req, res, conta) {
  exigirAdmin(conta);
  const { baixar, ...valores } = valoresDaMemoria(await lerJson(req, LIMITE_JSON));
  if (dados.memorias.length >= LIMITES.memorias) {
    throw new ErroHttp(400, `Podem existir no máximo ${LIMITES.memorias} memórias.`);
  }
  const quando = carimbo();
  const memoria = {
    id: novoId("mem-", new Set(dados.memorias.map((m) => m.id))),
    ...valores,
    capitulos: [],
    revelacao: escondida(),
    criadoEm: quando,
    alteradoEm: quando,
  };
  if (memoria.tipo === "livro") memoria.livro = { ...livroVazio(), baixar };
  dados.memorias.push(memoria);
  await salvarDados();
  console.log(`${conta.usuario} escreveu nas Memórias de Draevor: ${memoria.titulo}`);
  enviarJson(res, 201, { memoria: { id: memoria.id } });
}

// Alterar não mexe na revelação. Num Livro, os capítulos de um livro antigo e os arquivos ficam
// como estão. Trocar para outra classificação apaga o PDF e as imagens (o texto de um livro antigo
// vem do formulário, com os capítulos juntos); trocar para Livro deixa o texto para trás.
async function alterarMemoria(req, res, conta, id) {
  exigirAdmin(conta);
  const { baixar, ...valores } = valoresDaMemoria(await lerJson(req, LIMITE_JSON));
  const memoria = memoriaVisivel(conta, id);
  const deixaDeSerLivro = memoria.tipo === "livro" && valores.tipo !== "livro";
  if (valores.tipo === "livro") {
    if (memoria.tipo !== "livro") {
      memoria.capitulos = [];
      memoria.livro = livroVazio();
    }
    memoria.livro.baixar = baixar;
  } else {
    memoria.capitulos = [];
    delete memoria.livro;
  }
  Object.assign(memoria, valores);
  memoria.alteradoEm = carimbo();
  await salvarDados();
  if (deixaDeSerLivro) await livros.apagarLivro(memoria.id);
  enviarJson(res, 200, { ok: true });
}

async function apagarMemoria(res, conta, id) {
  exigirAdmin(conta);
  const memoria = memoriaVisivel(conta, id);
  dados.memorias = dados.memorias.filter((m) => m !== memoria);
  await salvarDados();
  await livros.apagarLivro(memoria.id);
  console.log(`${conta.usuario} apagou das Memórias de Draevor: ${memoria.titulo}`);
  enviarJson(res, 200, { ok: true });
}

// Ninguém: escondida de novo. Todos: a data de agora, ou a que já tinha, e as contas ficam como estão.
// Algumas contas: cada marcada fica com a data que já tinha, ou a de agora; as desmarcadas saem.
async function mudarRevelacao(req, res, conta, id) {
  exigirAdmin(conta);
  const corpo = await lerJson(req, LIMITE_JSON);
  const memoria = memoriaVisivel(conta, id);
  if (corpo.para !== "ninguem" && memoria.tipo === "livro" && !livroAntigo(memoria) && !memoria.livro.miolo) {
    throw new ErroHttp(400, "Mande o PDF do miolo antes de revelar o livro.");
  }
  const atual = memoria.revelacao;
  const agora = carimbo();
  if (corpo.para === "ninguem") {
    memoria.revelacao = escondida();
  } else if (corpo.para === "todos") {
    atual.todos = atual.todos || agora;
  } else if (corpo.para === "contas") {
    const usuarios = contasEscolhidas(corpo.contas);
    const contas = Object.fromEntries(usuarios.map((u) => [u, dataDaConta(atual, u) || agora]));
    memoria.revelacao = { todos: null, contas };
  } else {
    throw new ErroHttp(400, "Escolha para quem revelar: ninguém, todos ou algumas contas.");
  }
  await salvarDados();
  enviarJson(res, 200, { ok: true });
}

// Quando alguém troca o próprio usuário, a data em que cada memória foi revelada para ele acompanha
function renomearNasMemorias(antigo, novo) {
  for (const m of dados.memorias ?? []) {
    const contas = m.revelacao?.contas;
    if (!contas || !Object.hasOwn(contas, antigo)) continue;
    contas[novo] = contas[antigo];
    delete contas[antigo];
  }
}

// Conta excluída: sai das memórias reveladas para ela
function desligarContaDasMemorias(conta) {
  for (const m of dados.memorias ?? []) {
    const contas = m.revelacao?.contas;
    if (contas && Object.hasOwn(contas, conta.usuario)) delete contas[conta.usuario];
  }
}

ganchos.renomearConta.push(renomearNasMemorias);
ganchos.excluirConta.push(desligarContaDasMemorias);

// Os endereços /api/memorias/... são desta página. "iniciar" confere os dados ao ligar o portal
// (e arruma as pastas dos livros) e devolve true quando precisou mudar alguma coisa. Os links
// servem também à página Personagens; "podeLer" serve aos links do Caderno.
module.exports = { prefixo: "/api/memorias", tratar: tratarMemorias, iniciar: iniciarMemorias, linksPara, conferirLinks, podeLer };
