"use strict";
/* =================================================================
   Crônicas Eternas: Mapas
   -----------------------------------------------------------------
   Os mapas de Draevor e de cada mesa, com os lugares marcados em
   cada um. Só o administrador envia, troca e apaga mapas; ele e os
   editores marcam lugares. Os lugares que já estão desenhados na
   imagem (impressos) só entram pela importação de um arquivo.

   A miniatura, a largura e a altura vêm do navegador, que mede a
   imagem na hora do envio: o servidor continua sem bibliotecas.
   ================================================================= */

const crypto = require("node:crypto");
const {
  CONFIG,
  dados,
  salvarDados,
  ganchos,
  ErroHttp,
  enviarJson,
  lerJson,
  lerFormulario,
  texto,
  semAcentos,
  TIPOS_IMAGEM,
  arquivoEnviado,
  guardarImagem,
  apagarImagens,
} = require("./base");
const { textoOpcional } = require("./linha");
// Os links e o Citar da página de um lugar vêm do Caderno. Pedido só dentro das funções: o servidor.js
// carrega este arquivo antes do caderno.js, e o caderno.js pede este (o podeVerLugar).
const caderno = () => require("./caderno");

const TIPOS = new Set(["capital", "cidade", "vila", "reino", "regiao", "relevo", "lugar"]);
// Os glifos da Linha do Tempo e três com o desenho do atlas (os desenhos ficam na página)
const GLIFOS = new Set([
  "marco", "guerra", "queda", "fundacao", "catastrofe", "poder", "pacto", "arcano", "descoberta", "feito",
  "lua", "olho", "escudo", "montanha", "sol", "gota", "navio", "torre",
  "floresta", "cratera", "arvore-morta",
]);
const VISIBILIDADES = new Set(["todos", "admin"]);
const LIMITES = { mapas: 30, marcadores: 300 };
const LADO_MAXIMO = 30000; // largura e altura da imagem, em pixels
const RAIO_MAXIMO = 0.05; // em proporção da largura
const LIMITE_IMPORTACAO = 1024 * 1024; // 300 lugares com descrição longa cabem com folga
const PAGINA = {
  texto: 30000, // caracteres do texto da página de um lugar
  imagens: 30, // imagens enviadas para a página de um lugar
  json: 256 * 1024, // o corpo do PUT da página: o texto inteiro, com folga para os acentos
};
const UM_DIA = 24 * 60 * 60 * 1000; // a imagem que o texto não cita sai depois disso
const ESCALA = { distancia: 100000, pixels: 20 }; // a distância maior e a linha menor, em pixels da imagem
const UNIDADES = new Set(["km", "mi"]);

const carimbo = () => new Date().toISOString();
const idAleatorio = () => crypto.randomBytes(4).toString("hex");

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

// Cria a lista de mapas na primeira vez e confere o formato do que está salvo.
// Devolve true quando precisou mudar alguma coisa.
function garantirMapas() {
  let mudou = false;
  if (!Array.isArray(dados.mapas)) {
    dados.mapas = [];
    mudou = true;
  }
  for (const mapa of dados.mapas) {
    for (const campo of ["mesas", "marcadores"]) {
      if (!Array.isArray(mapa[campo])) {
        mapa[campo] = [];
        mudou = true;
      }
    }
  }
  return mudou;
}

const idsDasMesas = () => new Set(dados.campanhas.map((c) => c.id));

// Fica só com as campanhas que existem, sem repetir. Nenhuma: o mapa é de Draevor, o mundo todo.
function mesasConhecidas(lista) {
  if (!Array.isArray(lista)) return [];
  const conhecidas = idsDasMesas();
  return [...new Set(lista.filter((id) => typeof id === "string" && conhecidas.has(id)))];
}

// O nome atual da conta; se ela foi excluída, o nome guardado no registro
function nomeDaConta(usuario, reserva) {
  const conta = usuario ? dados.contas.find((c) => c.usuario === usuario) : null;
  return conta ? conta.nome : reserva || null;
}

// Só o administrador vê os mapas e os lugares guardados para ele
const podeVer = (conta, item) => Boolean(conta.admin || item.visibilidade !== "admin");
// Se a conta vê um lugar: nem o mapa nem o lugar são "só o administrador", ou a conta é o administrador.
// Serve aos links do Caderno.
const podeVerLugar = (conta, mapa, marcador) => podeVer(conta, mapa) && podeVer(conta, marcador);
const podeEditarMarcador = (conta, m) =>
  Boolean(conta.admin || (conta.editor && m.registradoPor && m.registradoPor === conta.usuario));
// A página do lugar: a "só o administrador" não existe para as outras contas
const temPaginaVisivel = (conta, m) => Boolean(m.pagina && podeVer(conta, m.pagina));

function exigirAdmin(conta) {
  if (!conta.admin) throw new ErroHttp(403, "Só o administrador pode fazer isso.", "proibido");
}

function exigirEditor(conta) {
  if (cargoDe(conta) === "jogador") {
    throw new ErroHttp(403, "Só os editores e o administrador marcam lugares nos mapas.", "proibido");
  }
}

function acharMapa(conta, id) {
  const mapa = dados.mapas.find((m) => m.id === id);
  if (!mapa || !podeVer(conta, mapa)) {
    throw new ErroHttp(404, "Esse mapa não existe mais. Recarregue a página.", "nao-encontrado");
  }
  return mapa;
}

function acharMarcador(conta, mapa, id) {
  const marcador = mapa.marcadores.find((m) => m.id === id);
  if (!marcador || !podeVer(conta, marcador)) {
    throw new ErroHttp(404, "Esse lugar não existe mais. Recarregue a página.", "nao-encontrado");
  }
  return marcador;
}

/* ---------- Formato enviado à página ---------- */

function marcadorPublico(m, conta) {
  const impresso = Boolean(m.impresso);
  return {
    id: m.id,
    nome: m.nome,
    tipo: TIPOS.has(m.tipo) ? m.tipo : "lugar",
    x: m.x,
    y: m.y,
    impresso,
    raio: impresso ? m.raio ?? null : null,
    caixa: impresso ? m.caixa ?? null : null,
    glifo: impresso ? null : GLIFOS.has(m.glifo) ? m.glifo : "marco",
    apelido: m.apelido || "",
    descricao: m.descricao || "",
    visibilidade: VISIBILIDADES.has(m.visibilidade) ? m.visibilidade : "todos",
    registradoPor: nomeDaConta(m.registradoPor, m.registradoNome),
    podeEditar: podeEditarMarcador(conta, m),
    temPagina: temPaginaVisivel(conta, m),
    podeCriarPagina: !m.pagina && cargoDe(conta) !== "jogador",
  };
}

function mapaPublico(mapa, conta, conhecidas) {
  return {
    id: mapa.id,
    nome: mapa.nome,
    mesas: mapa.mesas.filter((id) => conhecidas.has(id)),
    descricao: mapa.descricao || "",
    imagem: mapa.imagem,
    miniatura: mapa.miniatura,
    largura: mapa.largura,
    altura: mapa.altura,
    visibilidade: VISIBILIDADES.has(mapa.visibilidade) ? mapa.visibilidade : "todos",
    criadoEm: mapa.criadoEm,
    alteradoEm: mapa.alteradoEm,
    escala: mapa.escala ?? null,
    marcadores: mapa.marcadores.filter((m) => podeVer(conta, m)).map((m) => marcadorPublico(m, conta)),
  };
}

function dadosDosMapas(conta) {
  const conhecidas = idsDasMesas();
  return {
    conta: { usuario: conta.usuario, nome: conta.nome, cargo: cargoDe(conta) },
    mesas: dados.campanhas.map((c) => ({ id: c.id, nome: c.nome, cor: c.cor || "#2e3756" })),
    mapas: dados.mapas.filter((m) => podeVer(conta, m)).map((m) => mapaPublico(m, conta, conhecidas)),
  };
}

/* ---------- O que chega do formulário de um mapa ---------- */

// Os dados vêm como JSON no campo "dados"; a imagem e a miniatura, quando há, nos campos "imagem" e "miniatura"
async function lerFormularioDoMapa(req) {
  let form;
  try {
    form = await lerFormulario(req, CONFIG.maxMapa + CONFIG.maxImagem + CONFIG.maxJson);
  } catch (erro) {
    // A mensagem comum fala dos 10 MB das outras imagens
    if (erro instanceof ErroHttp && erro.status === 413) {
      throw new ErroHttp(413, "O envio passou do limite. O mapa pode ter no máximo 25 MB.");
    }
    throw erro;
  }
  const bruto = form.get("dados");
  let corpo = null;
  if (typeof bruto === "string" && bruto.length <= CONFIG.maxJson) {
    try {
      corpo = JSON.parse(bruto);
    } catch {
      corpo = null;
    }
  }
  if (!corpo || typeof corpo !== "object" || Array.isArray(corpo)) {
    throw new ErroHttp(400, "Os dados enviados não estão em um formato válido.");
  }

  const imagem = form.get("imagem");
  const miniatura = form.get("miniatura");
  if (arquivoEnviado(imagem) !== arquivoEnviado(miniatura)) {
    throw new ErroHttp(400, "A imagem do mapa e a miniatura precisam ser enviadas juntas.");
  }
  if (!arquivoEnviado(imagem)) return { corpo, imagem: null, miniatura: null };
  if (!TIPOS_IMAGEM[imagem.type] || !TIPOS_IMAGEM[miniatura.type]) {
    throw new ErroHttp(400, "Use imagens PNG, JPG, WEBP, GIF ou AVIF.");
  }
  if (imagem.size > CONFIG.maxMapa) throw new ErroHttp(413, "O mapa pode ter no máximo 25 MB.");
  if (miniatura.size > CONFIG.maxImagem) throw new ErroHttp(413, "A miniatura pode ter no máximo 10 MB.");
  return { corpo, imagem, miniatura };
}

function valoresDoMapa(corpo) {
  const visibilidade = corpo.visibilidade ?? "todos";
  if (!VISIBILIDADES.has(visibilidade)) {
    throw new ErroHttp(400, "Escolha quem vê o mapa: todos ou só o administrador.");
  }
  return {
    nome: texto(corpo.nome, "Nome", 80),
    mesas: mesasConhecidas(corpo.mesas),
    descricao: textoOpcional(corpo.descricao, "Descrição", 600),
    visibilidade,
  };
}

// Largura e altura em pixels, medidas pelo navegador na imagem enviada
function medidasDe(corpo) {
  const certa = (valor) => Number.isInteger(valor) && valor >= 1 && valor <= LADO_MAXIMO;
  if (!certa(corpo.largura) || !certa(corpo.altura)) {
    throw new ErroHttp(400, "Não foi possível medir a imagem do mapa. Escolha a imagem de novo.");
  }
  return { largura: corpo.largura, altura: corpo.altura };
}

/* ---------- O que chega sobre um lugar ---------- */

function numeroEntre(valor, min, max, mensagem) {
  if (typeof valor !== "number" || !Number.isFinite(valor) || valor < min || valor > max) {
    throw new ErroHttp(400, mensagem);
  }
  return valor;
}

// Posições e tamanhos em proporção da imagem, guardados com 5 casas, como no atlas
const proporcao = (valor) => Math.round(valor * 100000) / 100000;

function textosDoLugar(corpo) {
  if (!TIPOS.has(corpo.tipo)) {
    throw new ErroHttp(400, "Escolha o tipo do lugar: capital, cidade, vila, reino, região, relevo ou lugar.");
  }
  return {
    nome: texto(corpo.nome, "Nome", 60),
    tipo: corpo.tipo,
    apelido: textoOpcional(corpo.apelido, "Apelido", 80).replace(/\s*\n\s*/g, " "),
    descricao: textoOpcional(corpo.descricao, "Descrição", 600),
  };
}

function posicaoDe(corpo) {
  const mensagem = "A posição do lugar precisa estar dentro do mapa.";
  return { x: proporcao(numeroEntre(corpo.x, 0, 1, mensagem)), y: proporcao(numeroEntre(corpo.y, 0, 1, mensagem)) };
}

function glifoDe(corpo) {
  if (!GLIFOS.has(corpo.glifo)) throw new ErroHttp(400, "Escolha um dos glifos da lista.");
  return corpo.glifo;
}

// Só o administrador escolhe quem vê; o que um editor marca é para todos, e ele não muda depois
function visibilidadeDe(corpo, conta, atual) {
  if (!conta.admin) return atual ?? "todos";
  const visibilidade = corpo.visibilidade ?? atual ?? "todos";
  if (!VISIBILIDADES.has(visibilidade)) {
    throw new ErroHttp(400, "Escolha quem vê o lugar: todos ou só o administrador.");
  }
  return visibilidade;
}

// Num lugar impresso, a área clicável: o círculo em volta do ponto e o retângulo sobre o nome escrito.
// Regiões e reino não têm ponto, só o nome; um dos dois precisa existir.
function areaImpressa(lugar) {
  const raio =
    lugar.raio === undefined || lugar.raio === null
      ? null
      : proporcao(numeroEntre(lugar.raio, 0, RAIO_MAXIMO, "O raio do lugar precisa ir de 0 a 0,05."));
  let caixa = null;
  if (lugar.caixa !== undefined && lugar.caixa !== null) {
    const c = lugar.caixa;
    const valida =
      Array.isArray(c) &&
      c.length === 4 &&
      c.every((v) => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1) &&
      c[0] < c[2] &&
      c[1] < c[3];
    if (!valida) throw new ErroHttp(400, "A caixa do nome precisa ser [x0, y0, x1, y1], dentro do mapa.");
    caixa = c.map(proporcao);
  }
  if (!raio && !caixa) throw new ErroHttp(400, "Um lugar impresso precisa de raio, de caixa ou dos dois.");
  return { raio, caixa };
}

// Um marcador visível novo, marcado na página
function valoresDoMarcador(corpo, conta) {
  return {
    ...textosDoLugar(corpo),
    ...posicaoDe(corpo),
    impresso: false,
    raio: null,
    caixa: null,
    glifo: glifoDe(corpo),
    visibilidade: visibilidadeDe(corpo, conta, null),
  };
}

// Um lugar do arquivo de importação, no formato de lugares-tyrenar.json
function lugarImportado(lugar, conta) {
  if (!lugar || typeof lugar !== "object" || Array.isArray(lugar)) {
    throw new ErroHttp(400, "O lugar não está num formato válido.");
  }
  const impresso = lugar.impresso === true;
  return {
    ...textosDoLugar(lugar),
    ...posicaoDe(lugar),
    impresso,
    ...(impresso ? { ...areaImpressa(lugar), glifo: null } : { raio: null, caixa: null, glifo: glifoDe(lugar) }),
    visibilidade: visibilidadeDe(lugar, conta, null),
  };
}

function novoMarcador(mapa, conta, valores) {
  const quando = carimbo();
  return {
    id: novoId("marca-", new Set(mapa.marcadores.map((m) => m.id))),
    nome: valores.nome,
    tipo: valores.tipo,
    x: valores.x,
    y: valores.y,
    impresso: valores.impresso,
    raio: valores.raio,
    caixa: valores.caixa,
    glifo: valores.glifo,
    apelido: valores.apelido,
    descricao: valores.descricao,
    visibilidade: valores.visibilidade,
    registradoPor: conta.usuario,
    registradoNome: conta.nome,
    criadoEm: quando,
    alteradoEm: quando,
  };
}

function cabeNoMapa(mapa, quantos) {
  if (mapa.marcadores.length + quantos > LIMITES.marcadores) {
    throw new ErroHttp(400, `Um mapa pode ter no máximo ${LIMITES.marcadores} lugares. Este tem ${mapa.marcadores.length}.`);
  }
}

/* ---------- Rotas ---------- */

async function tratarMapas(req, res, rota, metodo, conta) {
  if (garantirMapas()) await salvarDados();
  let partes;
  try {
    partes = rota.split("/").filter(Boolean).slice(2).map(decodeURIComponent);
  } catch {
    throw new ErroHttp(404, "Endereço não encontrado.");
  }
  const [id, recurso, marca, quarto, quinto, ...resto] = partes;

  if (!quarto && !resto.length) {
    if (!id && metodo === "GET") return enviarJson(res, 200, dadosDosMapas(conta));
    // Os ids de mapa começam sempre com "mapa-"
    if (id === "citaveis" && !recurso && metodo === "GET") return enviarCitaveis(res, conta);
    if (id && recurso === "escala" && !marca && metodo === "PUT") return marcarEscala(req, res, conta, id);
    if (!id && metodo === "POST") return enviarMapa(req, res, conta);
    if (id && !recurso && metodo === "PUT") return alterarMapa(req, res, conta, id);
    if (id && !recurso && metodo === "DELETE") return apagarMapa(res, conta, id);
    if (id && recurso === "marcadores") {
      if (!marca && metodo === "POST") return criarMarcador(req, res, conta, id);
      if (marca === "importar" && metodo === "POST") return importarLugares(req, res, conta, id);
      if (marca && metodo === "PUT") return alterarMarcador(req, res, conta, id, marca);
      if (marca && metodo === "DELETE") return apagarMarcador(res, conta, id, marca);
    }
  }
  if (id && recurso === "marcadores" && marca && quarto === "pagina" && !resto.length) {
    if (!quinto && metodo === "GET") return lerPagina(res, conta, id, marca);
    if (!quinto && metodo === "PUT") return gravarPagina(req, res, conta, id, marca);
    if (!quinto && metodo === "DELETE") return apagarPagina(res, conta, id, marca);
    if (quinto === "imagens" && metodo === "POST") return receberImagemDaPagina(req, res, conta, id, marca);
  }
  throw new ErroHttp(404, "Endereço não encontrado.");
}

async function enviarMapa(req, res, conta) {
  exigirAdmin(conta);
  const { corpo, imagem, miniatura } = await lerFormularioDoMapa(req);
  if (!imagem) throw new ErroHttp(400, "Escolha a imagem do mapa.");
  const valores = valoresDoMapa(corpo);
  const medidas = medidasDe(corpo);
  if (dados.mapas.length >= LIMITES.mapas) {
    throw new ErroHttp(400, `A página pode ter no máximo ${LIMITES.mapas} mapas.`);
  }

  const caminhoImagem = await guardarImagem(imagem);
  const caminhoMiniatura = await guardarImagem(miniatura);
  const quando = carimbo();
  const mapa = {
    id: novoId("mapa-", new Set(dados.mapas.map((m) => m.id))),
    nome: valores.nome,
    mesas: valores.mesas,
    descricao: valores.descricao,
    imagem: caminhoImagem,
    miniatura: caminhoMiniatura,
    largura: medidas.largura,
    altura: medidas.altura,
    visibilidade: valores.visibilidade,
    criadoEm: quando,
    alteradoEm: quando,
    marcadores: [],
  };
  dados.mapas.push(mapa);
  await salvarDados();
  console.log(`${conta.usuario} enviou nos Mapas: ${mapa.nome}`);
  enviarJson(res, 201, { mapa: { id: mapa.id } });
}

// Trocar a imagem mantém os marcadores: as posições são proporções da largura e da altura
async function alterarMapa(req, res, conta, id) {
  exigirAdmin(conta);
  acharMapa(conta, id); // antes de receber a imagem
  const { corpo, imagem, miniatura } = await lerFormularioDoMapa(req);
  const valores = valoresDoMapa(corpo);
  const medidas = imagem ? medidasDe(corpo) : null;
  const novas = imagem ? { imagem: await guardarImagem(imagem), miniatura: await guardarImagem(miniatura) } : null;

  // Enquanto a imagem era gravada, o mapa pode ter sido apagado
  const mapa = dados.mapas.find((m) => m.id === id);
  if (!mapa) {
    if (novas) await apagarImagens([novas.imagem, novas.miniatura]);
    throw new ErroHttp(404, "Esse mapa não existe mais. Recarregue a página.", "nao-encontrado");
  }
  const sobras = novas ? [mapa.imagem, mapa.miniatura] : [];
  Object.assign(mapa, valores, novas, medidas, { alteradoEm: carimbo() });
  await salvarDados();
  await apagarImagens(sobras);
  enviarJson(res, 200, { ok: true });
}

async function apagarMapa(res, conta, id) {
  exigirAdmin(conta);
  const mapa = acharMapa(conta, id);
  dados.mapas = dados.mapas.filter((m) => m !== mapa);
  await salvarDados();
  await apagarImagens([mapa.imagem, mapa.miniatura, ...mapa.marcadores.flatMap(arquivosDaPagina)]);
  console.log(`${conta.usuario} apagou dos Mapas: ${mapa.nome}`);
  enviarJson(res, 200, { ok: true });
}

async function criarMarcador(req, res, conta, id) {
  exigirEditor(conta);
  const corpo = await lerJson(req);
  const mapa = acharMapa(conta, id);
  const valores = valoresDoMarcador(corpo, conta);
  cabeNoMapa(mapa, 1);
  const marcador = novoMarcador(mapa, conta, valores);
  mapa.marcadores.push(marcador);
  await salvarDados();
  console.log(`${conta.usuario} marcou no mapa ${mapa.nome}: ${marcador.nome}`);
  enviarJson(res, 201, { marcador: { id: marcador.id } });
}

// O que não vem no pedido continua como está: para mover, basta mandar x e y.
// Num impresso, a área continua a da importação; só mudam nome, tipo, apelido, descrição e visibilidade.
async function alterarMarcador(req, res, conta, id, idMarca) {
  exigirEditor(conta);
  const corpo = await lerJson(req);
  const mapa = acharMapa(conta, id);
  const marcador = acharMarcador(conta, mapa, idMarca);
  if (!podeEditarMarcador(conta, marcador)) {
    throw new ErroHttp(403, "Só quem marcou o lugar, ou o administrador, pode alterá-lo.", "proibido");
  }
  const junto = { ...marcador, ...corpo };
  const valores = { ...textosDoLugar(junto), visibilidade: visibilidadeDe(junto, conta, marcador.visibilidade) };
  if (!marcador.impresso) Object.assign(valores, posicaoDe(junto), { glifo: glifoDe(junto) });
  Object.assign(marcador, valores, { alteradoEm: carimbo() });
  await salvarDados();
  enviarJson(res, 200, { ok: true });
}

async function apagarMarcador(res, conta, id, idMarca) {
  exigirAdmin(conta);
  const mapa = acharMapa(conta, id);
  const marcador = acharMarcador(conta, mapa, idMarca);
  mapa.marcadores = mapa.marcadores.filter((m) => m !== marcador);
  await salvarDados();
  await apagarImagens(arquivosDaPagina(marcador));
  console.log(`${conta.usuario} apagou do mapa ${mapa.nome}: ${marcador.nome}`);
  enviarJson(res, 200, { ok: true });
}

// Confere todos os lugares antes de guardar qualquer um: um lugar com erro barra a importação inteira.
// Os que já existem no mapa com o mesmo nome (sem contar acentos e maiúsculas) são pulados.
async function importarLugares(req, res, conta, id) {
  exigirAdmin(conta);
  const corpo = await lerJson(req, LIMITE_IMPORTACAO);
  acharMapa(conta, id);
  if (!Array.isArray(corpo.lugares) || !corpo.lugares.length) {
    throw new ErroHttp(400, "O arquivo não tem lugares para importar.");
  }
  if (corpo.lugares.length > LIMITES.marcadores) {
    throw new ErroHttp(400, `Um mapa pode ter no máximo ${LIMITES.marcadores} lugares.`);
  }
  const lugares = corpo.lugares.map((bruto, i) => {
    try {
      return lugarImportado(bruto, conta);
    } catch (erro) {
      if (!(erro instanceof ErroHttp)) throw erro;
      const nome = typeof bruto?.nome === "string" && bruto.nome.trim() ? ` (${bruto.nome.trim().slice(0, 60)})` : "";
      throw new ErroHttp(400, `Lugar ${i + 1}${nome}: ${erro.message}`);
    }
  });

  const mapa = acharMapa(conta, id);
  const nomes = new Set(mapa.marcadores.map((m) => semAcentos(m.nome)));
  const novos = lugares.filter((lugar) => {
    const chave = semAcentos(lugar.nome);
    if (nomes.has(chave)) return false;
    nomes.add(chave);
    return true;
  });
  cabeNoMapa(mapa, novos.length);
  for (const lugar of novos) mapa.marcadores.push(novoMarcador(mapa, conta, lugar));
  if (novos.length) {
    await salvarDados();
    console.log(`${conta.usuario} importou ${novos.length} lugares no mapa ${mapa.nome}`);
  }
  enviarJson(res, 200, { entraram: novos.length, pulados: lugares.length - novos.length });
}

/* ---------- A página de um lugar ---------- */

// Os arquivos das imagens da página, para apagar junto com ela, com o lugar ou com o mapa
const arquivosDaPagina = (m) => (m.imagensDaPagina ?? []).map((imagem) => imagem.arquivo);

function exigirQuemEscrevePagina(conta) {
  if (cargoDe(conta) === "jogador") {
    throw new ErroHttp(403, "Só os editores e o administrador escrevem as páginas dos lugares.", "proibido");
  }
}

// O lugar com a página que a conta vê; sem página, ou com a "só o administrador" para outra conta: 404
function acharPagina(conta, marcador) {
  if (!temPaginaVisivel(conta, marcador)) {
    throw new ErroHttp(404, "Esse lugar não tem página.", "nao-encontrado");
  }
  return marcador.pagina;
}

function enviarCitaveis(res, conta) {
  exigirQuemEscrevePagina(conta);
  enviarJson(res, 200, caderno().citaveisDoPortal(conta));
}

function lerPagina(res, conta, id, idMarca) {
  const mapa = acharMapa(conta, id);
  const marcador = acharMarcador(conta, mapa, idMarca);
  const pagina = acharPagina(conta, marcador);
  const { lerCodigos, alvosDosLinks } = caderno();
  const lida = lerCodigos(pagina.texto);
  // As notas do Caderno não entram: ficam só como texto para todos
  const chaves = [...lida.links].filter((chave) => !chave.startsWith("nota:"));
  const doLugar = new Map((marcador.imagensDaPagina ?? []).map((imagem) => [imagem.id, imagem.arquivo]));
  const imagens = {};
  for (const idDaImagem of lida.imagens) if (doLugar.has(idDaImagem)) imagens[idDaImagem] = doLugar.get(idDaImagem);
  enviarJson(res, 200, {
    pagina: {
      texto: pagina.texto,
      ...(conta.admin ? { visibilidade: VISIBILIDADES.has(pagina.visibilidade) ? pagina.visibilidade : "todos" } : {}),
      versao: pagina.versao,
      criadaPor: nomeDaConta(pagina.criadaPor, pagina.criadaNome),
      criadaEm: pagina.criadaEm,
      alteradaPor: nomeDaConta(pagina.alteradaPor, pagina.alteradaNome),
      alteradaEm: pagina.alteradaEm,
    },
    links: alvosDosLinks(conta, chaves),
    imagens,
    podeEditar: Boolean(conta.admin || (conta.editor && pagina.visibilidade !== "admin")),
    podeApagar: Boolean(conta.admin),
  });
}

function textoDaPagina(valor) {
  if (typeof valor !== "string" || !valor.trim()) throw new ErroHttp(400, "Escreva o texto da página.");
  const textoNovo = valor.replace(/\r\n/g, "\n");
  if (textoNovo.length > PAGINA.texto) {
    throw new ErroHttp(400, `O texto da página pode ter no máximo ${PAGINA.texto.toLocaleString("pt-BR")} caracteres.`);
  }
  caderno().conferirLinks(textoNovo);
  return textoNovo;
}

// Saem as imagens do lugar que o texto gravado não cita e que foram enviadas há mais de 24 horas.
// As mais novas ficam: podem ser de alguém que ainda está escrevendo. Devolve os arquivos que saíram.
function tirarSobras(marcador) {
  if (!marcador.imagensDaPagina?.length) return [];
  const citadas = caderno().lerCodigos(marcador.pagina.texto).imagens;
  const limite = Date.now() - UM_DIA;
  const sobras = [];
  marcador.imagensDaPagina = marcador.imagensDaPagina.filter((imagem) => {
    const enviada = Date.parse(imagem.enviadaEm);
    if (citadas.has(imagem.id) || !(enviada <= limite)) return true;
    sobras.push(imagem.arquivo);
    return false;
  });
  return sobras;
}

// Cria ou altera. Cada gravação manda a versão que leu (0 para criar); se a do servidor for outra,
// nada é gravado e a resposta é 409, com a versão nova e quem salvou.
async function gravarPagina(req, res, conta, id, idMarca) {
  exigirQuemEscrevePagina(conta);
  const corpo = await lerJson(req, PAGINA.json);
  const mapa = acharMapa(conta, id);
  const marcador = acharMarcador(conta, mapa, idMarca);
  const atual = marcador.pagina ?? null;
  // A "só o administrador" não existe para o editor
  if (atual && !podeVer(conta, atual)) throw new ErroHttp(404, "Esse lugar não tem página.", "nao-encontrado");
  if (!conta.admin && corpo.visibilidade !== undefined) {
    throw new ErroHttp(403, "Só o administrador escolhe quem vê a página.", "proibido");
  }
  if (!Number.isInteger(corpo.versao)) throw new ErroHttp(400, "Envie a versão da página que você está alterando.");
  const textoNovo = textoDaPagina(corpo.texto);
  let visibilidade = atual?.visibilidade ?? "todos";
  if (conta.admin) {
    visibilidade = corpo.visibilidade ?? visibilidade;
    if (!VISIBILIDADES.has(visibilidade)) {
      throw new ErroHttp(400, "Escolha quem vê a página: todos ou só o administrador.");
    }
  }
  const versaoAtual = atual ? atual.versao : 0;
  if (corpo.versao !== versaoAtual) {
    throw new ErroHttp(409, "Alguém salvou esta página enquanto você escrevia.", "conflito", {
      pagina: {
        versao: versaoAtual,
        alteradaPor: atual ? nomeDaConta(atual.alteradaPor, atual.alteradaNome) : null,
        alteradaEm: atual ? atual.alteradaEm : null,
      },
    });
  }

  const quando = carimbo();
  const quem = { alteradaPor: conta.usuario, alteradaNome: conta.nome, alteradaEm: quando };
  if (atual) {
    Object.assign(atual, { texto: textoNovo, visibilidade, versao: atual.versao + 1 }, quem);
  } else {
    marcador.pagina = {
      texto: textoNovo,
      visibilidade,
      versao: 1,
      criadaPor: conta.usuario,
      criadaNome: conta.nome,
      criadaEm: quando,
      ...quem,
    };
  }
  const sobras = tirarSobras(marcador);
  await salvarDados();
  await apagarImagens(sobras);
  console.log(`${conta.usuario} escreveu a página de ${marcador.nome} no mapa ${mapa.nome}`);
  enviarJson(res, atual ? 200 : 201, { pagina: { versao: marcador.pagina.versao, alteradaEm: quando } });
}

async function apagarPagina(res, conta, id, idMarca) {
  exigirAdmin(conta);
  const mapa = acharMapa(conta, id);
  const marcador = acharMarcador(conta, mapa, idMarca);
  acharPagina(conta, marcador);
  const arquivos = arquivosDaPagina(marcador);
  delete marcador.pagina;
  delete marcador.imagensDaPagina;
  await salvarDados();
  await apagarImagens(arquivos);
  console.log(`${conta.usuario} apagou a página de ${marcador.nome} no mapa ${mapa.nome}`);
  enviarJson(res, 200, { ok: true });
}

// O lugar onde a imagem vai entrar: a conta vê o lugar e, se ele já tem página, também a página
function lugarDaImagem(conta, id, idMarca) {
  const mapa = acharMapa(conta, id);
  const marcador = acharMarcador(conta, mapa, idMarca);
  if (marcador.pagina && !podeVer(conta, marcador.pagina)) {
    throw new ErroHttp(404, "Esse lugar não tem página.", "nao-encontrado");
  }
  return marcador;
}

function cabemImagens(marcador) {
  if ((marcador.imagensDaPagina ?? []).length >= PAGINA.imagens) {
    throw new ErroHttp(400, `Um lugar pode ter no máximo ${PAGINA.imagens} imagens na página.`);
  }
}

// A imagem fica no lugar, e não na página: dá para enviá-la antes de a página existir
async function receberImagemDaPagina(req, res, conta, id, idMarca) {
  exigirQuemEscrevePagina(conta);
  cabemImagens(lugarDaImagem(conta, id, idMarca)); // antes de receber a imagem
  const form = await lerFormulario(req, CONFIG.maxImagem + 4096);
  const arquivo = form.get("imagem");
  if (!arquivoEnviado(arquivo)) throw new ErroHttp(400, "Escolha a imagem.");
  if (!TIPOS_IMAGEM[arquivo.type]) throw new ErroHttp(400, "Use imagens PNG, JPG, WEBP, GIF ou AVIF.");
  if (arquivo.size > CONFIG.maxImagem) throw new ErroHttp(413, "Cada imagem pode ter no máximo 10 MB.");
  const caminho = await guardarImagem(arquivo);

  // Enquanto a imagem era gravada, o lugar pode ter sido apagado, ou outra imagem ter chegado
  let marcador;
  try {
    marcador = lugarDaImagem(conta, id, idMarca);
    cabemImagens(marcador);
  } catch (erro) {
    await apagarImagens([caminho]);
    throw erro;
  }
  if (!Array.isArray(marcador.imagensDaPagina)) marcador.imagensDaPagina = [];
  const imagem = {
    id: novoId("img-", new Set(marcador.imagensDaPagina.map((i) => i.id))),
    arquivo: caminho,
    tamanho: arquivo.size,
    enviadaEm: carimbo(),
    enviadaPor: conta.usuario,
  };
  marcador.imagensDaPagina.push(imagem);
  await salvarDados();
  enviarJson(res, 201, { imagem: { id: imagem.id, endereco: imagem.arquivo } });
}

/* ---------- A escala do mapa ---------- */

// { escala: { distancia, unidade, de: { x, y }, ate: { x, y } } } ou { escala: null }, que tira a escala
function valoresDaEscala(bruta, mapa) {
  if (!bruta || typeof bruta !== "object" || Array.isArray(bruta)) {
    throw new ErroHttp(400, "A escala não está num formato válido.");
  }
  const distancia =
    typeof bruta.distancia === "number" && Number.isFinite(bruta.distancia)
      ? Math.round(bruta.distancia * 100) / 100
      : NaN;
  if (!(distancia > 0 && distancia <= ESCALA.distancia)) {
    throw new ErroHttp(400, "A distância precisa ser um número maior que zero e de no máximo 100.000.");
  }
  if (!UNIDADES.has(bruta.unidade)) throw new ErroHttp(400, "Escolha a unidade da escala: km ou milhas.");
  const mensagem = "As pontas da linha da escala precisam estar dentro do mapa.";
  const ponta = (p) => {
    if (!p || typeof p !== "object" || Array.isArray(p)) throw new ErroHttp(400, mensagem);
    return { x: proporcao(numeroEntre(p.x, 0, 1, mensagem)), y: proporcao(numeroEntre(p.y, 0, 1, mensagem)) };
  };
  const de = ponta(bruta.de);
  const ate = ponta(bruta.ate);
  if (Math.hypot((ate.x - de.x) * mapa.largura, (ate.y - de.y) * mapa.altura) < ESCALA.pixels) {
    throw new ErroHttp(400, "A linha da escala precisa ser mais comprida.");
  }
  return { distancia, unidade: bruta.unidade, de, ate, alteradaEm: carimbo() };
}

async function marcarEscala(req, res, conta, id) {
  exigirAdmin(conta);
  const corpo = await lerJson(req);
  const mapa = acharMapa(conta, id);
  if (corpo.escala === undefined) throw new ErroHttp(400, "Envie a escala do mapa.");
  mapa.escala = corpo.escala === null ? null : valoresDaEscala(corpo.escala, mapa);
  await salvarDados();
  console.log(`${conta.usuario} ${mapa.escala ? "marcou" : "tirou"} a escala do mapa ${mapa.nome}`);
  enviarJson(res, 200, { escala: mapa.escala });
}

// Quando alguém troca o próprio usuário, os lugares que marcou, as páginas que escreveu
// e as imagens que enviou acompanham
function renomearNosMapas(antigo, novo) {
  for (const mapa of dados.mapas ?? []) {
    for (const m of mapa.marcadores ?? []) {
      if (m.registradoPor === antigo) m.registradoPor = novo;
      if (m.pagina?.criadaPor === antigo) m.pagina.criadaPor = novo;
      if (m.pagina?.alteradaPor === antigo) m.pagina.alteradaPor = novo;
      for (const imagem of m.imagensDaPagina ?? []) if (imagem.enviadaPor === antigo) imagem.enviadaPor = novo;
    }
  }
}

// Conta excluída: os lugares e as páginas dela guardam só o nome, e ninguém herda o que era dela
function desligarContaDosMapas(conta) {
  for (const mapa of dados.mapas ?? []) {
    for (const m of mapa.marcadores ?? []) {
      if (m.registradoPor === conta.usuario) Object.assign(m, { registradoPor: null, registradoNome: conta.nome });
      if (m.pagina?.criadaPor === conta.usuario) Object.assign(m.pagina, { criadaPor: null, criadaNome: conta.nome });
      if (m.pagina?.alteradaPor === conta.usuario) {
        Object.assign(m.pagina, { alteradaPor: null, alteradaNome: conta.nome });
      }
      for (const imagem of m.imagensDaPagina ?? []) if (imagem.enviadaPor === conta.usuario) imagem.enviadaPor = null;
    }
  }
}

// Mesa apagada: sai dos mapas que a citam
function tirarMesaDosMapas(id) {
  for (const mapa of dados.mapas ?? []) {
    if (Array.isArray(mapa.mesas)) mapa.mesas = mapa.mesas.filter((m) => m !== id);
  }
}

ganchos.renomearConta.push(renomearNosMapas);
ganchos.excluirConta.push(desligarContaDosMapas);
ganchos.excluirMesa.push(tirarMesaDosMapas);

// Os endereços /api/mapas/... são desta página. "iniciar" confere os dados ao ligar o portal
// e devolve true quando precisou mudar alguma coisa. "podeVerLugar" serve aos links do Caderno.
module.exports = { prefixo: "/api/mapas", tratar: tratarMapas, iniciar: garantirMapas, podeVerLugar };
