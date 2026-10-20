"use strict";
/* =================================================================
   Crônicas Eternas: Linha do Tempo, a história de Draevor
   -----------------------------------------------------------------
   Vai do Expurgo Demoníaco, no ano 0 ED, até o ano atual do mundo.
   Editores registram direto; alterar ou apagar o que já está na
   linha vira um pedido que o administrador aprova ou recusa.
   Qualquer conta pode acrescentar frases marcantes.
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
  REGEX_COR,
  TIPOS_IMAGEM,
  arquivoEnviado,
  guardarImagem,
  apagarImagens,
} = require("./base");

const ANO_INICIAL_DA_LINHA = 366;
const ANO_MAXIMO_DA_LINHA = 100000;

// Os tipos que vêm com a página (os desenhos dos glifos ficam no linha.js)
const TIPOS_PADRAO = [
  { id: "marco", nome: "Marco", glifo: "marco" },
  { id: "guerra", nome: "Guerra", glifo: "guerra" },
  { id: "queda", nome: "Queda", glifo: "queda" },
  { id: "fundacao", nome: "Fundação", glifo: "fundacao" },
  { id: "catastrofe", nome: "Catástrofe", glifo: "catastrofe" },
  { id: "poder", nome: "Poder", glifo: "poder" },
  { id: "pacto", nome: "Pacto", glifo: "pacto" },
  { id: "arcano", nome: "Arcano", glifo: "arcano" },
  { id: "descoberta", nome: "Descoberta", glifo: "descoberta" },
  { id: "feito", nome: "Feito", glifo: "feito" },
];
const GLIFOS = new Set([
  ...TIPOS_PADRAO.map((t) => t.glifo),
  "lua", "olho", "escudo", "montanha", "sol", "gota", "navio", "torre",
]);
const VISIBILIDADES = new Set(["todos", "revelar", "admin"]);
const LIMITES_LINHA = { citados: 60, frases: 100, tipos: 60, mesasAntigas: 200 };

const chaveDaData = (data) => data.ano * 10000 + (data.mes || 0) * 100 + (data.dia || 0);
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

function origemDaLinha() {
  return {
    id: "origem",
    origem: true,
    titulo: "O Expurgo Demoníaco",
    descricao: "",
    data: { ano: 0, mes: null, dia: null, aprox: false },
    ate: null,
    tipo: "marco",
    importancia: "marco",
    mesas: [],
    personagens: [],
    imagem: null,
    frases: [],
    visibilidade: "todos",
    revelado: false,
    registradoPor: null,
    registradoNome: null,
    criadoEm: carimbo(),
  };
}

// Cria a linha na primeira vez e confere o formato do que está salvo.
// Devolve true quando precisou mudar alguma coisa.
function garantirLinha() {
  let mudou = false;
  if (!dados.linha || typeof dados.linha !== "object" || Array.isArray(dados.linha)) {
    dados.linha = {};
    mudou = true;
  }
  const linha = dados.linha;
  if (!Number.isInteger(linha.anoAtual) || linha.anoAtual < 0) {
    linha.anoAtual = ANO_INICIAL_DA_LINHA;
    mudou = true;
  }
  for (const lista of ["tipos", "mesasAntigas", "acontecimentos", "pendencias"]) {
    if (!Array.isArray(linha[lista])) {
      linha[lista] = [];
      mudou = true;
    }
  }
  if (!linha.acontecimentos.some((a) => a.origem)) {
    linha.acontecimentos.unshift(origemDaLinha());
    mudou = true;
  }
  for (const ev of linha.acontecimentos) {
    for (const lista of ["mesas", "personagens", "frases"]) {
      if (!Array.isArray(ev[lista])) {
        ev[lista] = [];
        mudou = true;
      }
    }
    for (const frase of ev.frases) {
      if (!frase.id) {
        frase.id = novoId("", new Set(ev.frases.map((f) => f.id)));
        mudou = true;
      }
    }
  }
  return mudou;
}

const tiposDaLinha = () => [...TIPOS_PADRAO, ...dados.linha.tipos];
const idsDasMesas = () => new Set([...dados.campanhas.map((c) => c.id), ...dados.linha.mesasAntigas.map((m) => m.id)]);
const idsDosPersonagens = () => new Set(dados.personagens.map((p) => p.id));

// Fica só com os ids que existem, sem repetir
function idsConhecidos(lista, conhecidos) {
  if (!Array.isArray(lista)) return [];
  const escolhidos = lista.filter((id) => typeof id === "string" && conhecidos.has(id));
  return [...new Set(escolhidos)].slice(0, LIMITES_LINHA.citados);
}

// O nome atual da conta; se ela foi excluída, o nome guardado no registro
function nomeDaConta(usuario, reserva) {
  const conta = usuario ? dados.contas.find((c) => c.usuario === usuario) : null;
  return conta ? conta.nome : reserva || null;
}

// Só o administrador vê o que é só dele e o que ainda está selado
function podeVer(conta, ev) {
  if (conta.admin) return true;
  if (ev.visibilidade === "admin") return false;
  return !(ev.visibilidade === "revelar" && !ev.revelado);
}

function semAcontecimento() {
  return new ErroHttp(404, "Esse acontecimento não existe mais. Recarregue a página.", "nao-encontrado");
}

function acontecimentoVisivel(conta, id) {
  const ev = dados.linha.acontecimentos.find((a) => a.id === id);
  if (!ev || !podeVer(conta, ev)) throw semAcontecimento();
  return ev;
}

function exigirAdmin(conta) {
  if (!conta.admin) throw new ErroHttp(403, "Só o administrador pode fazer isso.", "proibido");
}

function exigirEditor(conta) {
  if (cargoDe(conta) === "jogador") {
    throw new ErroHttp(403, "Só os editores e o administrador mexem nos acontecimentos.", "proibido");
  }
}

/* ---------- Formatos enviados à página ---------- */

function dataPublica(data, comAprox) {
  const publica = { ano: data.ano, mes: data.mes || null, dia: data.mes && data.dia ? data.dia : null };
  if (comAprox) publica.aprox = Boolean(data.aprox);
  return publica;
}

function acontecimentoPublico(ev, conta, contexto) {
  const publico = {
    id: ev.id,
    titulo: ev.titulo,
    descricao: ev.descricao || "",
    data: dataPublica(ev.data, true),
    ate: ev.ate ? dataPublica(ev.ate, false) : null,
    tipo: ev.tipo,
    importancia: ev.importancia === "marco" ? "marco" : "comum",
    mesas: ev.mesas.filter((id) => contexto.mesas.has(id)),
    personagens: ev.personagens.filter((id) => contexto.personagens.has(id)),
    imagem: ev.imagem || null,
    frases: ev.frases.map((f) => ({
      id: f.id,
      texto: f.texto,
      autor: f.autor || "",
      podeApagar: Boolean(conta.admin || (f.por && f.por === conta.usuario)),
    })),
    visibilidade: VISIBILIDADES.has(ev.visibilidade) ? ev.visibilidade : "todos",
    revelado: Boolean(ev.revelado),
    registradoPor: nomeDaConta(ev.registradoPor, ev.registradoNome),
    pendente: contexto.cargo !== "jogador" && contexto.comPendencia.has(ev.id),
  };
  if (ev.origem) publico.origem = true;
  return publico;
}

// O pedido de um editor, como o administrador vê para comparar com o card
function pedidoPublico(pedido, contexto) {
  const publico = { ...pedido };
  if (publico.data) publico.data = dataPublica(publico.data, true);
  if (publico.ate) publico.ate = dataPublica(publico.ate, false);
  if (Array.isArray(publico.mesas)) publico.mesas = publico.mesas.filter((id) => contexto.mesas.has(id));
  if (Array.isArray(publico.personagens)) {
    publico.personagens = publico.personagens.filter((id) => contexto.personagens.has(id));
  }
  return publico;
}

function dadosDaLinha(conta) {
  const linha = dados.linha;
  const cargo = cargoDe(conta);
  const contexto = {
    cargo,
    mesas: idsDasMesas(),
    personagens: idsDosPersonagens(),
    comPendencia: new Set(linha.pendencias.map((p) => p.acontecimento)),
  };

  const acontecimentos = [];
  const citadas = new Set();
  for (const ev of linha.acontecimentos) {
    if (ev.visibilidade === "admin" && !conta.admin) continue;
    if (!podeVer(conta, ev)) {
      // Selado: os outros só sabem que algo aconteceu naquele ano
      acontecimentos.push({ id: ev.id, selado: true, data: { ano: ev.data.ano }, importancia: "comum" });
      continue;
    }
    const publico = acontecimentoPublico(ev, conta, contexto);
    for (const id of publico.mesas) citadas.add(id);
    acontecimentos.push(publico);
  }

  // Os jogadores veem as mesas que têm personagens, como na página das mesas, e as citadas na linha
  const comPersonagens = new Set(dados.personagens.map((p) => p.campanha));
  const mesas = [
    ...dados.campanhas
      .filter((c) => cargo !== "jogador" || comPersonagens.has(c.id) || citadas.has(c.id))
      .map((c) => ({ id: c.id, nome: c.nome, cor: c.cor || "#2e3756", mundo: c.mundo || "" })),
    ...linha.mesasAntigas.map((m) => ({ id: m.id, nome: m.nome, cor: m.cor, antiga: true })),
  ];

  return {
    conta: { usuario: conta.usuario, nome: conta.nome, cargo },
    anoAtual: linha.anoAtual,
    tipos: tiposDaLinha().map((t) => ({ id: t.id, nome: t.nome, glifo: t.glifo, padrao: TIPOS_PADRAO.includes(t) })),
    mesas,
    personagens: dados.personagens.map((p) => ({ id: p.id, nome: p.nome, campanha: p.campanha })),
    acontecimentos,
    pendencias: conta.admin
      ? linha.pendencias.map((p) => ({
          id: p.id,
          acontecimento: p.acontecimento,
          acao: p.acao,
          por: nomeDaConta(p.por, p.porNome) || "Um editor",
          ...(p.acao === "alterar" ? { dados: pedidoPublico(p.dados || {}, contexto) } : {}),
        }))
      : [],
  };
}

/* ---------- O que chega do formulário ---------- */

function textoOpcional(valor, campo, max) {
  const limpo = typeof valor === "string" ? valor.replace(/\r\n?/g, "\n").trim() : "";
  if (limpo.length > max) throw new ErroHttp(400, `O campo ${campo} pode ter no máximo ${max} caracteres.`);
  return limpo;
}

// Mês e dia são opcionais: vazio, nulo ou zero quer dizer "sem"
function numeroOuNada(valor, min, max, mensagem) {
  if (valor === null || valor === undefined || valor === "" || valor === 0) return null;
  if (!Number.isInteger(valor) || valor < min || valor > max) throw new ErroHttp(400, mensagem);
  return valor;
}

function lerDataDaLinha(bruta, anoAtual, inicio) {
  const ano = bruta && typeof bruta === "object" ? bruta.ano : undefined;
  if (!Number.isInteger(ano) || ano < 0 || (inicio && ano > anoAtual)) {
    throw new ErroHttp(400, inicio ? `O ano precisa ser um número inteiro de 0 a ${anoAtual}.` : "Escreva o ano em que o período termina.");
  }
  if (ano > anoAtual) throw new ErroHttp(400, `O período não pode passar do ano atual, ${anoAtual} ED.`);
  const mes = numeroOuNada(bruta.mes, 1, 10, "Escolha um mês da lista.");
  const dia = mes ? numeroOuNada(bruta.dia, 1, 30, "Escolha um dia de 1 a 30.") : null;
  const data = { ano, mes, dia };
  if (inicio) data.aprox = bruta.aprox === true;
  return data;
}

// Confere e limpa o que veio do formulário de registro.
// O Expurgo, a origem da linha, só muda título e descrição.
function valoresDoAcontecimento(corpo, conta, origem = false) {
  const titulo = texto(corpo.titulo, "Título", 120);
  const descricao = textoOpcional(corpo.descricao, "Descrição", 3000);
  if (origem) return { titulo, descricao };

  const { anoAtual } = dados.linha;
  const data = lerDataDaLinha(corpo.data, anoAtual, true);
  const ate = corpo.ate ? lerDataDaLinha(corpo.ate, anoAtual, false) : null;
  if (ate && chaveDaData(ate) < chaveDaData(data)) throw new ErroHttp(400, "O período não pode terminar antes de começar.");
  const tipo = typeof corpo.tipo === "string" ? corpo.tipo : "";
  if (!tiposDaLinha().some((t) => t.id === tipo)) throw new ErroHttp(400, "Escolha um tipo da lista.");

  return {
    titulo,
    descricao,
    data,
    ate,
    tipo,
    importancia: corpo.importancia === "marco" ? "marco" : "comum",
    mesas: idsConhecidos(corpo.mesas, idsDasMesas()),
    personagens: idsConhecidos(corpo.personagens, idsDosPersonagens()),
    // Só o administrador escolhe quem vê; o que os editores registram é para todos
    visibilidade: conta.admin && VISIBILIDADES.has(corpo.visibilidade) ? corpo.visibilidade : "todos",
  };
}

function fraseDoCorpo(bruta) {
  if (!bruta || typeof bruta !== "object") return null;
  const frase = textoOpcional(bruta.texto, "Frase", 300);
  if (!frase) return null;
  return { texto: frase, autor: textoOpcional(bruta.autor, "Quem disse", 80) };
}

// Os dados vêm como JSON no campo "dados"; a imagem, se houver, no campo "imagem"
async function lerFormularioDaLinha(req) {
  const form = await lerFormulario(req, CONFIG.maxImagem + CONFIG.maxJson);
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
  if (!arquivoEnviado(imagem)) return { corpo, imagem: null };
  if (!TIPOS_IMAGEM[imagem.type]) throw new ErroHttp(400, "Use imagens PNG, JPG, WEBP, GIF ou AVIF.");
  if (imagem.size > CONFIG.maxImagem) throw new ErroHttp(413, "A imagem pode ter no máximo 10 MB.");
  return { corpo, imagem };
}
/* ---------- Pedidos dos editores ---------- */

// Um pedido novo substitui o anterior do mesmo editor para o mesmo acontecimento.
// Devolve as imagens dos pedidos substituídos, para apagar depois de salvar.
function registrarPedido(conta, ev, acao, pedido) {
  const linha = dados.linha;
  const anteriores = linha.pendencias.filter((p) => p.acontecimento === ev.id && p.por === conta.usuario);
  linha.pendencias = linha.pendencias.filter((p) => !anteriores.includes(p));
  const pendencia = {
    id: novoId("pend-", new Set(linha.pendencias.map((p) => p.id))),
    acontecimento: ev.id,
    acao,
    por: conta.usuario,
    porNome: conta.nome,
    quando: carimbo(),
  };
  if (pedido) pendencia.dados = pedido;
  linha.pendencias.push(pendencia);
  return anteriores.map((p) => p.dados?.imagemNova).filter(Boolean);
}

// Tira o acontecimento da linha junto com os pedidos sobre ele; devolve as imagens que sobraram
function removerAcontecimento(ev) {
  const linha = dados.linha;
  const pedidos = linha.pendencias.filter((p) => p.acontecimento === ev.id);
  linha.pendencias = linha.pendencias.filter((p) => p.acontecimento !== ev.id);
  linha.acontecimentos = linha.acontecimentos.filter((a) => a !== ev);
  return [ev.imagem, ...pedidos.map((p) => p.dados?.imagemNova)].filter(Boolean);
}

/* ---------- Rotas ---------- */

async function tratarLinha(req, res, rota, metodo, conta) {
  if (garantirLinha()) await salvarDados();
  let partes;
  try {
    partes = rota.split("/").filter(Boolean).slice(2).map(decodeURIComponent);
  } catch {
    throw new ErroHttp(404, "Endereço não encontrado.");
  }
  const [recurso, id, acao, outroId, ...resto] = partes;

  if (!resto.length) {
    if (!recurso && metodo === "GET") return enviarJson(res, 200, dadosDaLinha(conta));

    if (recurso === "acontecimentos") {
      if (!id && metodo === "POST") return registrarAcontecimento(req, res, conta);
      if (id && !acao && metodo === "PUT") return alterarAcontecimento(req, res, conta, id);
      if (id && !acao && metodo === "DELETE") return apagarAcontecimento(res, conta, id);
      if (id && acao === "frases" && !outroId && metodo === "POST") return adicionarFrase(req, res, conta, id);
      if (id && acao === "frases" && outroId && metodo === "DELETE") return apagarFrase(res, conta, id, outroId);
      if (id && acao === "revelar" && !outroId && metodo === "POST") return revelarAcontecimento(res, conta, id);
    }
    if (recurso === "pendencias" && id && !outroId && metodo === "POST" && ["aprovar", "recusar"].includes(acao)) {
      return decidirPedido(res, conta, id, acao === "aprovar");
    }
    if (recurso === "ano-atual" && !id && metodo === "PUT") return mudarAnoAtual(req, res, conta);
    if (recurso === "tipos" && !acao) {
      if (!id && metodo === "POST") return criarTipo(req, res, conta);
      if (id && metodo === "DELETE") return apagarTipo(res, conta, id);
    }
    if (recurso === "mesas-antigas" && !acao) {
      if (!id && metodo === "POST") return salvarMesaAntiga(req, res, conta, null);
      if (id && metodo === "PUT") return salvarMesaAntiga(req, res, conta, id);
      if (id && metodo === "DELETE") return apagarMesaAntiga(res, conta, id);
    }
  }
  throw new ErroHttp(404, "Endereço não encontrado.");
}

async function registrarAcontecimento(req, res, conta) {
  exigirEditor(conta);
  const { corpo, imagem } = await lerFormularioDaLinha(req);
  const valores = valoresDoAcontecimento(corpo, conta);
  const frase = fraseDoCorpo(corpo.frase);
  const caminho = imagem ? await guardarImagem(imagem) : null;

  const linha = dados.linha;
  const quando = carimbo();
  const ev = {
    id: novoId("", new Set(linha.acontecimentos.map((a) => a.id))),
    ...valores,
    imagem: caminho,
    frases: frase ? [{ id: idAleatorio(), ...frase, por: conta.usuario, porNome: conta.nome, quando }] : [],
    revelado: false,
    registradoPor: conta.usuario,
    registradoNome: conta.nome,
    criadoEm: quando,
    alteradoEm: quando,
  };
  linha.acontecimentos.push(ev);
  await salvarDados();
  console.log(`${conta.usuario} registrou na Linha do Tempo: ${ev.titulo}`);
  enviarJson(res, 201, { acontecimento: { id: ev.id } });
}

// O administrador altera direto; o pedido de um editor espera a aprovação dele
async function alterarAcontecimento(req, res, conta, id) {
  exigirEditor(conta);
  acontecimentoVisivel(conta, id); // antes de receber a imagem
  const { corpo, imagem } = await lerFormularioDaLinha(req);
  const valores = valoresDoAcontecimento(corpo, conta, Boolean(acontecimentoVisivel(conta, id).origem));
  const removerImagem = corpo.removerImagem === true && !imagem;
  const caminho = imagem ? await guardarImagem(imagem) : null;

  // Enquanto a imagem era gravada, o acontecimento pode ter saído da linha
  const ev = dados.linha.acontecimentos.find((a) => a.id === id);
  if (!ev || !podeVer(conta, ev)) {
    if (caminho) await apagarImagens([caminho]);
    throw semAcontecimento();
  }

  if (!conta.admin) {
    const pedido = { ...valores };
    delete pedido.visibilidade; // quem vê continua decidido pelo administrador
    if (caminho) pedido.imagemNova = caminho;
    else if (removerImagem) pedido.removerImagem = true;
    const sobras = registrarPedido(conta, ev, "alterar", pedido);
    await salvarDados();
    await apagarImagens(sobras);
    return enviarJson(res, 200, { pendente: true });
  }

  const sobras = [];
  // Passar a "revelar depois" sela o acontecimento de novo
  if (!ev.origem && valores.visibilidade === "revelar" && ev.visibilidade !== "revelar") ev.revelado = false;
  Object.assign(ev, valores);
  if (caminho || removerImagem) {
    if (ev.imagem) sobras.push(ev.imagem);
    ev.imagem = caminho;
  }
  ev.alteradoEm = carimbo();
  await salvarDados();
  await apagarImagens(sobras);
  enviarJson(res, 200, { pendente: false });
}

async function apagarAcontecimento(res, conta, id) {
  exigirEditor(conta);
  const ev = acontecimentoVisivel(conta, id);
  if (ev.origem) throw new ErroHttp(400, "O Expurgo Demoníaco é a origem da linha e não pode ser apagado.");
  const sobras = conta.admin ? removerAcontecimento(ev) : registrarPedido(conta, ev, "apagar", null);
  await salvarDados();
  await apagarImagens(sobras);
  if (conta.admin) console.log(`${conta.usuario} apagou da Linha do Tempo: ${ev.titulo}`);
  enviarJson(res, 200, { pendente: !conta.admin });
}

async function adicionarFrase(req, res, conta, id) {
  acontecimentoVisivel(conta, id);
  const frase = fraseDoCorpo(await lerJson(req));
  if (!frase) throw new ErroHttp(400, "Escreva a frase antes de adicionar.");
  const ev = acontecimentoVisivel(conta, id);
  if (ev.frases.length >= LIMITES_LINHA.frases) throw new ErroHttp(400, "Este acontecimento já tem frases demais.");
  ev.frases.push({
    id: novoId("", new Set(ev.frases.map((f) => f.id))),
    ...frase,
    por: conta.usuario,
    porNome: conta.nome,
    quando: carimbo(),
  });
  await salvarDados();
  enviarJson(res, 201, { ok: true });
}

// Quem acrescentou a frase pode tirá-la; o administrador pode tirar qualquer uma
async function apagarFrase(res, conta, id, idFrase) {
  const ev = acontecimentoVisivel(conta, id);
  const frase = ev.frases.find((f) => f.id === idFrase);
  if (!frase) throw new ErroHttp(404, "Essa frase já foi apagada.", "nao-encontrado");
  if (!conta.admin && frase.por !== conta.usuario) {
    throw new ErroHttp(403, "Só quem acrescentou a frase, ou o administrador, pode apagá-la.", "proibido");
  }
  ev.frases = ev.frases.filter((f) => f !== frase);
  await salvarDados();
  enviarJson(res, 200, { ok: true });
}

async function revelarAcontecimento(res, conta, id) {
  exigirAdmin(conta);
  const ev = acontecimentoVisivel(conta, id);
  if (ev.visibilidade !== "revelar") {
    throw new ErroHttp(400, "Este acontecimento não está guardado para revelar depois.");
  }
  ev.revelado = true;
  ev.reveladoEm = carimbo();
  await salvarDados();
  enviarJson(res, 200, { ok: true });
}

async function decidirPedido(res, conta, id, aprovar) {
  exigirAdmin(conta);
  const linha = dados.linha;
  const pendencia = linha.pendencias.find((p) => p.id === id);
  if (!pendencia) throw new ErroHttp(404, "Esse pedido já foi resolvido.", "nao-encontrado");
  const ev = linha.acontecimentos.find((a) => a.id === pendencia.acontecimento);
  const sobras = [];

  if (aprovar && ev && pendencia.acao === "apagar") {
    sobras.push(...removerAcontecimento(ev));
  } else if (aprovar && ev) {
    const { imagemNova, removerImagem, ...pedido } = pendencia.dados || {};
    if (ev.origem) {
      Object.assign(ev, { titulo: pedido.titulo, descricao: pedido.descricao });
    } else {
      // O que mudou desde o pedido pode impedir a aprovação
      if (!tiposDaLinha().some((t) => t.id === pedido.tipo)) {
        throw new ErroHttp(409, "O tipo pedido não existe mais. Recuse o pedido ou crie o tipo de novo.");
      }
      const ultimoAno = Math.max(pedido.data.ano, pedido.ate?.ano ?? 0);
      if (ultimoAno > linha.anoAtual) {
        throw new ErroHttp(409, `O pedido usa ${ultimoAno} ED, depois do ano atual do mundo (${linha.anoAtual} ED).`);
      }
      Object.assign(ev, {
        titulo: pedido.titulo,
        descricao: pedido.descricao,
        data: pedido.data,
        ate: pedido.ate,
        tipo: pedido.tipo,
        importancia: pedido.importancia,
        mesas: idsConhecidos(pedido.mesas, idsDasMesas()),
        personagens: idsConhecidos(pedido.personagens, idsDosPersonagens()),
      });
    }
    if (imagemNova || removerImagem) {
      if (ev.imagem) sobras.push(ev.imagem);
      ev.imagem = imagemNova || null;
    }
    ev.alteradoEm = carimbo();
    linha.pendencias = linha.pendencias.filter((p) => p !== pendencia);
  } else {
    // Recusado (ou o acontecimento já saiu da linha): o pedido some com a imagem que trazia
    linha.pendencias = linha.pendencias.filter((p) => p !== pendencia);
    if (pendencia.dados?.imagemNova) sobras.push(pendencia.dados.imagemNova);
  }

  await salvarDados();
  await apagarImagens(sobras);
  enviarJson(res, 200, { ok: true });
}

async function mudarAnoAtual(req, res, conta) {
  exigirAdmin(conta);
  const { ano } = await lerJson(req);
  if (!Number.isInteger(ano) || ano < 0) throw new ErroHttp(400, "Escreva um ano inteiro, de 0 em diante.");
  if (ano > ANO_MAXIMO_DA_LINHA) throw new ErroHttp(400, `O ano atual pode ir até ${ANO_MAXIMO_DA_LINHA} ED.`);
  const linha = dados.linha;
  const ultimo = linha.acontecimentos.reduce((maior, a) => Math.max(maior, a.data.ano, a.ate?.ano ?? 0), 0);
  if (ano < ultimo) {
    throw new ErroHttp(400, `Há acontecimentos registrados até ${ultimo} ED. O ano atual não pode ficar antes deles.`);
  }
  linha.anoAtual = ano;
  await salvarDados();
  enviarJson(res, 200, { ok: true });
}

async function criarTipo(req, res, conta) {
  exigirAdmin(conta);
  const corpo = await lerJson(req);
  const nome = textoOpcional(corpo.nome, "Nome do tipo", 40);
  if (!nome) throw new ErroHttp(400, "Dê um nome ao tipo.");
  const linha = dados.linha;
  if (tiposDaLinha().some((t) => semAcentos(t.nome) === semAcentos(nome))) {
    throw new ErroHttp(409, "Já existe um tipo com esse nome.");
  }
  if (linha.tipos.length >= LIMITES_LINHA.tipos) throw new ErroHttp(400, "Há tipos demais. Apague algum que ninguém usa.");
  const ocupados = new Set(tiposDaLinha().map((t) => t.id));
  linha.tipos.push({ id: novoId("tipo-", ocupados), nome, glifo: GLIFOS.has(corpo.glifo) ? corpo.glifo : "marco" });
  await salvarDados();
  enviarJson(res, 201, { ok: true });
}

async function apagarTipo(res, conta, id) {
  exigirAdmin(conta);
  const linha = dados.linha;
  if (TIPOS_PADRAO.some((t) => t.id === id)) throw new ErroHttp(400, "Os tipos que vêm com a página não podem ser apagados.");
  const tipo = linha.tipos.find((t) => t.id === id);
  if (!tipo) throw new ErroHttp(404, "Esse tipo não existe mais.", "nao-encontrado");
  if (linha.acontecimentos.some((a) => a.tipo === id)) throw new ErroHttp(409, "Esse tipo ainda é usado por algum acontecimento.");
  if (linha.pendencias.some((p) => p.dados?.tipo === id)) {
    throw new ErroHttp(409, "Esse tipo aparece num pedido esperando aprovação. Resolva o pedido antes.");
  }
  linha.tipos = linha.tipos.filter((t) => t !== tipo);
  await salvarDados();
  enviarJson(res, 200, { ok: true });
}

// Mesas antigas entram só com nome e cor, para poderem ser citadas
async function salvarMesaAntiga(req, res, conta, id) {
  exigirAdmin(conta);
  const corpo = await lerJson(req);
  const nome = textoOpcional(corpo.nome, "Nome da mesa", 80);
  if (!nome) throw new ErroHttp(400, "Dê um nome à mesa.");
  if (typeof corpo.cor !== "string" || !REGEX_COR.test(corpo.cor)) throw new ErroHttp(400, "Escolha uma cor válida.");
  const cor = corpo.cor.toLowerCase();
  const linha = dados.linha;
  if (id) {
    const mesa = linha.mesasAntigas.find((m) => m.id === id);
    if (!mesa) throw new ErroHttp(404, "Essa mesa não existe mais.", "nao-encontrado");
    Object.assign(mesa, { nome, cor });
  } else {
    if (linha.mesasAntigas.length >= LIMITES_LINHA.mesasAntigas) throw new ErroHttp(400, "Há mesas antigas demais.");
    linha.mesasAntigas.push({ id: novoId("antiga-", idsDasMesas()), nome, cor });
  }
  await salvarDados();
  enviarJson(res, id ? 200 : 201, { ok: true });
}

// Apagar uma mesa antiga tira também as citações dela
async function apagarMesaAntiga(res, conta, id) {
  exigirAdmin(conta);
  const linha = dados.linha;
  if (!linha.mesasAntigas.some((m) => m.id === id)) throw new ErroHttp(404, "Essa mesa não existe mais.", "nao-encontrado");
  linha.mesasAntigas = linha.mesasAntigas.filter((m) => m.id !== id);
  for (const ev of linha.acontecimentos) ev.mesas = ev.mesas.filter((m) => m !== id);
  for (const p of linha.pendencias) {
    if (Array.isArray(p.dados?.mesas)) p.dados.mesas = p.dados.mesas.filter((m) => m !== id);
  }
  await salvarDados();
  enviarJson(res, 200, { ok: true });
}

// Quando alguém troca o próprio usuário, os registros dele na linha acompanham
function renomearNaLinha(antigo, novo) {
  const linha = dados.linha;
  if (!linha) return;
  for (const ev of linha.acontecimentos) {
    if (ev.registradoPor === antigo) ev.registradoPor = novo;
    for (const frase of ev.frases || []) if (frase.por === antigo) frase.por = novo;
  }
  for (const p of linha.pendencias) if (p.por === antigo) p.por = novo;
}

// Conta excluída: os registros dela guardam só o nome, e ninguém herda o que era dela
function desligarContaDaLinha(conta) {
  const linha = dados.linha;
  if (!linha) return;
  for (const ev of linha.acontecimentos) {
    if (ev.registradoPor === conta.usuario) Object.assign(ev, { registradoPor: null, registradoNome: conta.nome });
    for (const frase of ev.frases || []) {
      if (frase.por === conta.usuario) Object.assign(frase, { por: null, porNome: conta.nome });
    }
  }
  for (const p of linha.pendencias) if (p.por === conta.usuario) Object.assign(p, { por: null, porNome: conta.nome });
}

ganchos.renomearConta.push(renomearNaLinha);
ganchos.excluirConta.push(desligarContaDaLinha);

// Os endereços /api/linha/... são desta página. "iniciar" confere os dados ao ligar o portal
// e devolve true quando precisou mudar alguma coisa.
module.exports = { prefixo: "/api/linha", tratar: tratarLinha, iniciar: garantirLinha };
