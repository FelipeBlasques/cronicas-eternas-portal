"use strict";
/* =================================================================
   Crônicas Eternas: Personagens, a galeria de Draevor
   -----------------------------------------------------------------
   Os personagens do portal (os dos jogadores, com card nas Mesas)
   ganham uma ficha. Os outros, NPCs e personagens sem conta no
   portal, são cadastrados aqui pelo administrador ou por um editor.
   Os editores alteram qualquer personagem que veem; apagar e
   escolher quem vê ficam com o administrador. Os caídos continuam
   na galeria. Ninguém precisa de aprovação.
   A arte da galeria fica em "retrato", separada da capa e da arte
   do card das Mesas.
   A ficha aberta tem abas: Geral, Detalhes (a ficha completa, em
   "detalhes"), Jornada (os acontecimentos da Linha que o citam) e
   Textos (caixas de texto livre, em "textos"). O Título ou Frase
   ("destaque") aponta um item dos títulos ou das frases.
   ================================================================= */

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const {
  CONFIG,
  PASTA_UPLOADS,
  dados,
  salvarDados,
  ganchos,
  ErroHttp,
  enviarJson,
  lerFormulario,
  texto,
  FONTES,
  FONTE_PADRAO,
  CAMPOS_IMAGEM_GALERIA,
  validarImagens,
  aplicarImagens,
  apagarImagens,
} = require("./base");
const { iniciar: garantirLinha, lerDataDaLinha, podeVer, dataPublica, chaveDaData, textoOpcional, anoDeHoje, dataDeHoje } = require("./linha");
const { linksPara, conferirLinks } = require("./memorias");

const PAPEIS = new Set(["jogador", "npc"]);
const SITUACOES = new Set(["vivo", "caido", "desaparecido", "aposentado"]);
const VISIBILIDADES = new Set(["todos", "admin"]);
const LIMITE_OUTROS = 500;

// A ficha completa da aba Detalhes, na ordem em que aparece: chave, rótulo e tipo.
// O Nome, que vem primeiro, é o "nome" de sempre. A idade não é um campo: a página a conta
// do Nascimento. A idade escrita antes fica em detalhes.idade até haver o ano de nascimento.
const CAMPOS_DOS_DETALHES = [
  ["titulos", "Títulos", "lista"],
  ["apelidos", "Apelidos", "lista"],
  ["nomeReal", "Nome Real", "texto"],
  ["lar", "Lar", "texto"],
  ["laresAnteriores", "Lares Anteriores", "lista"],
  ["genero", "Gênero", "texto"],
  ["especie", "Espécie", "texto"],
  ["ocupacao", "Ocupação", "texto"],
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
const LIMITES = {
  texto: 120, // um campo de texto dos Detalhes
  itens: 20, // itens de uma lista
  item: 160, // cada item de uma lista
  frase: 300, // cada item das Frases
  onde: 80, // o "onde" de um marco
  caixas: 20,
  tituloDaCaixa: 80,
  textoDaCaixa: 20000,
  dados: 1024 * 1024, // o JSON do campo "dados" do formulário, com as caixas de texto
};
// O destaque aponta um item de uma destas listas
const LISTA_DO_DESTAQUE = new Map([
  ["titulo", "titulos"],
  ["frase", "frases"],
]);

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

// O retrato de um personagem do portal nasce de uma cópia da capa (ou da arte), para que trocar
// ou remover a imagem numa página nunca apague o arquivo da outra. As imagens fixas do site não são copiadas.
function retratoCopiado(p) {
  const origem = p.capa || p.arte;
  if (!origem) return null;
  if (!origem.startsWith("/uploads/")) return origem;
  const arquivo = path.join(PASTA_UPLOADS, path.basename(origem));
  if (!fs.existsSync(arquivo)) return null;
  const nome = `${crypto.randomBytes(12).toString("hex")}${path.extname(arquivo)}`;
  try {
    fs.copyFileSync(arquivo, path.join(PASTA_UPLOADS, nome));
  } catch (erro) {
    console.error(erro); // sem a cópia, o personagem fica sem retrato e ganha outro pela galeria
    return null;
  }
  return `/uploads/${nome}`;
}

const numaLinha = (valor) => valor.replace(/\s*\n\s*/g, " ");

// Os Detalhes com tudo vazio: texto "", lista [], data e marco null
function detalhesVazios() {
  const vazio = { texto: () => "", lista: () => [], data: () => null, marco: () => null };
  return Object.fromEntries(CAMPOS_DOS_DETALHES.map(([chave, , tipo]) => [chave, vazio[tipo]()]));
}

// Antes das abas, a ficha tinha "origem" (ancestralidade e classe), "resumo", "historia" e a data
// da queda. A origem se divide na primeira vírgula em Espécie e Classe; o resumo vira o primeiro
// título e o destaque; a história vira a caixa "História"; a data da queda vira a Morte, e a queda
// fica só com o epitáfio. As chaves antigas saem.
function migrarParaAsAbas(p) {
  const detalhes = detalhesVazios();
  let destaque = null;
  const textos = [];

  const origem = typeof p.origem === "string" ? numaLinha(p.origem) : "";
  const virgula = origem.indexOf(",");
  if (virgula < 0) {
    detalhes.especie = origem.trim();
  } else {
    detalhes.especie = origem.slice(0, virgula).trim();
    detalhes.classe = origem.slice(virgula + 1).trim();
  }

  const resumo = typeof p.resumo === "string" ? numaLinha(p.resumo).trim() : "";
  if (resumo) {
    detalhes.titulos.push(resumo);
    destaque = { tipo: "titulo", indice: 0 };
  }

  const historia = typeof p.historia === "string" ? p.historia.trim() : "";
  if (historia) textos.push({ titulo: "História", texto: historia });

  const queda = p.queda && typeof p.queda === "object" ? p.queda : null;
  if (queda?.data) detalhes.morte = { data: queda.data, onde: "" };
  p.queda = queda?.epitafio ? { epitafio: queda.epitafio } : null;

  delete p.origem;
  delete p.resumo;
  delete p.historia;
  Object.assign(p, { detalhes, destaque, textos });
}

// Cria a lista dos outros personagens na primeira vez e confere o formato do que está salvo.
// Quem ainda não tem "retrato" vem de antes da arte própria da galeria e passa pela migração;
// quem ainda não tem "detalhes" vem de antes das abas e passa pela outra.
// Devolve true quando precisou mudar alguma coisa.
function garantirPersonagens() {
  let mudou = false;
  if (!Array.isArray(dados.outrosPersonagens)) {
    dados.outrosPersonagens = [];
    mudou = true;
  }
  for (const p of dados.personagens) {
    if ("retrato" in p) continue;
    p.retrato = retratoCopiado(p);
    mudou = true;
  }
  for (const p of dados.outrosPersonagens) {
    if (!Array.isArray(p.mesas)) {
      p.mesas = [];
      mudou = true;
    }
    // Nenhum arquivo é apagado: a arte recortada que sobrar fica em uploads/
    if (!("retrato" in p)) {
      p.retrato = p.capa || p.arte || null;
      delete p.capa;
      delete p.arte;
      mudou = true;
    }
  }
  for (const p of [...dados.personagens, ...dados.outrosPersonagens]) {
    if ("detalhes" in p) continue;
    migrarParaAsAbas(p);
    mudou = true;
  }
  return mudou;
}

const idsDasMesas = () => new Set(dados.campanhas.map((c) => c.id));

// Fica só com as mesas que existem, sem repetir
function mesasConhecidas(lista) {
  if (!Array.isArray(lista)) return [];
  const conhecidas = idsDasMesas();
  return [...new Set(lista.filter((id) => typeof id === "string" && conhecidas.has(id)))];
}

// Só o administrador vê os personagens guardados para ele. Os editores alteram qualquer um que veem.
const podeVerOutro = (conta, p) => Boolean(conta.admin || p.visibilidade !== "admin");
const podeEditarFicha = (conta, p) => Boolean(conta.admin || conta.editor || p.dono === conta.usuario);
const podeEditarOutro = (conta) => Boolean(conta.admin || conta.editor);

function exigirAdmin(conta) {
  if (!conta.admin) throw new ErroHttp(403, "Só o administrador pode fazer isso.", "proibido");
}

function exigirEditor(conta) {
  if (cargoDe(conta) === "jogador") {
    throw new ErroHttp(403, "Só os editores e o administrador cadastram personagens.", "proibido");
  }
}

function semPersonagem() {
  return new ErroHttp(404, "Esse personagem não existe mais. Recarregue a página.", "nao-encontrado");
}

function fichaEditavel(conta, id) {
  const personagem = dados.personagens.find((p) => p.id === id);
  if (!personagem) throw semPersonagem();
  if (!podeEditarFicha(conta, personagem)) {
    throw new ErroHttp(403, "Só o jogador do personagem, os editores e o administrador mudam a ficha.", "proibido");
  }
  return personagem;
}

function outroVisivel(conta, id) {
  const personagem = dados.outrosPersonagens.find((p) => p.id === id);
  if (!personagem || !podeVerOutro(conta, personagem)) throw semPersonagem();
  return personagem;
}

function outroEditavel(conta, id) {
  const personagem = outroVisivel(conta, id);
  if (!podeEditarOutro(conta)) {
    throw new ErroHttp(403, "Só os editores e o administrador alteram personagens.", "proibido");
  }
  return personagem;
}

/* ---------- Formato enviado à página ---------- */

const dataOuNada = (data) => (data ? dataPublica(data, true) : null);

// O item que o destaque aponta, se ele ainda existir
function destaqueValido(p) {
  const d = p.destaque;
  const lista = d ? p.detalhes[LISTA_DO_DESTAQUE.get(d.tipo)] : null;
  return lista && Number.isInteger(d.indice) && lista[d.indice] ? { tipo: d.tipo, indice: d.indice } : null;
}

function destaqueResolvido(p) {
  const d = destaqueValido(p);
  return d ? { tipo: d.tipo, texto: p.detalhes[LISTA_DO_DESTAQUE.get(d.tipo)][d.indice] } : null;
}

// O que o card precisa. Nos caídos, "Caiu em …" usa a data da Morte.
function cardPublico(p) {
  const situacao = SITUACOES.has(p.situacao) ? p.situacao : "vivo";
  const data = p.detalhes.morte?.data || null;
  const epitafio = p.queda?.epitafio || "";
  const queda = situacao === "caido" && (data || epitafio) ? { data: dataOuNada(data), epitafio } : null;
  return { situacao, queda, destaque: destaqueResolvido(p), apelidos: [...p.detalhes.apelidos] };
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
  publicos.idadeAnotada = typeof d.idade === "string" ? d.idade : "";
  return publicos;
}

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

// Os logins do Foundry ficam de fora
function personagemDoPortal(p, conta) {
  const dono = dados.contas.find((c) => c.usuario === p.dono);
  const nomeDono = dono ? dono.nome : p.dono;
  return {
    id: p.id,
    origemDoDado: "portal",
    nome: p.nome,
    fonte: FONTES.has(p.fonte) ? p.fonte : FONTE_PADRAO,
    retrato: p.retrato || null,
    papel: "jogador",
    jogador: nomeDono,
    dono: p.dono,
    nomeDono,
    mesas: [p.campanha],
    ...cardPublico(p),
    visibilidade: "todos",
    podeEditar: podeEditarFicha(conta, p),
  };
}

function outroPublico(p, conta, conhecidas) {
  return {
    id: p.id,
    origemDoDado: "outro",
    nome: p.nome,
    fonte: FONTES.has(p.fonte) ? p.fonte : FONTE_PADRAO,
    retrato: p.retrato || null,
    papel: PAPEIS.has(p.papel) ? p.papel : "npc",
    jogador: p.jogador || "",
    mesas: p.mesas.filter((id) => conhecidas.has(id)),
    ...cardPublico(p),
    visibilidade: VISIBILIDADES.has(p.visibilidade) ? p.visibilidade : "todos",
    podeEditar: podeEditarOutro(conta),
  };
}

// Para cada personagem, os acontecimentos da Linha que a conta pode ver e que o citam, do mais antigo ao mais recente
function jornadaDe(conta, ids) {
  const jornada = new Map(ids.map((id) => [id, []]));
  const acontecimentos = (dados.linha?.acontecimentos ?? []).filter((ev) => podeVer(conta, ev));
  acontecimentos.sort((a, b) => chaveDaData(a.data) - chaveDaData(b.data));
  for (const ev of acontecimentos) {
    const passo = {
      id: ev.id,
      titulo: ev.titulo,
      data: dataPublica(ev.data, true),
      ate: ev.ate ? dataPublica(ev.ate, false) : null,
    };
    for (const id of new Set(ev.personagens)) jornada.get(id)?.push(passo);
  }
  return Object.fromEntries(jornada);
}

// A lista vai leve: os Detalhes, os Textos e a Jornada vêm com a ficha de cada um
function dadosDaGaleria(conta) {
  const conhecidas = idsDasMesas();
  const personagens = [
    ...dados.personagens.map((p) => personagemDoPortal(p, conta)),
    ...dados.outrosPersonagens.filter((p) => podeVerOutro(conta, p)).map((p) => outroPublico(p, conta, conhecidas)),
  ];
  return {
    conta: { usuario: conta.usuario, nome: conta.nome, cargo: cargoDe(conta) },
    hoje: dataDeHoje(),
    mesas: dados.campanhas.map((c) => ({
      id: c.id,
      nome: c.nome,
      cor: c.cor || "#2e3756",
      naPaginaMesas: c.naPaginaMesas !== false,
    })),
    personagens,
  };
}

// O que o "Citar" do formulário oferece: só o que a conta vê
function citaveisPara(conta) {
  const acontecimentos = (dados.linha?.acontecimentos ?? [])
    .filter((ev) => podeVer(conta, ev))
    .sort((a, b) => chaveDaData(a.data) - chaveDaData(b.data))
    .map((ev) => ({ id: ev.id, titulo: ev.titulo, ano: ev.data.ano }));
  const personagens = [...dados.personagens, ...dados.outrosPersonagens.filter((p) => podeVerOutro(conta, p))]
    .map((p) => ({ id: p.id, nome: p.nome }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  return { acontecimentos, personagens };
}

// A ficha de um personagem, do portal ou outro, com os links que a conta pode seguir.
// Quem pode editar o personagem recebe também o que pode citar.
function fichaCompleta(conta, id) {
  const doPortal = dados.personagens.find((p) => p.id === id);
  const p = doPortal || outroVisivel(conta, id);
  const resposta = {
    personagem: {
      id: p.id,
      detalhes: detalhesPublicos(p.detalhes),
      destaque: destaqueValido(p),
      textos: p.textos.map((caixa) => ({ titulo: caixa.titulo, texto: caixa.texto })),
    },
    jornada: jornadaDe(conta, [p.id])[p.id],
    links: linksPara(conta, textosComLinks(p)),
  };
  if (doPortal ? podeEditarFicha(conta, doPortal) : podeEditarOutro(conta)) resposta.citaveis = citaveisPara(conta);
  return resposta;
}

/* ---------- O que chega do formulário ---------- */

// Os dados vêm como JSON no campo "dados", de até 1 MB por causa das caixas de texto;
// a imagem, se houver, no campo "retrato"
async function lerFormularioDaFicha(req) {
  const form = await lerFormulario(req, CONFIG.maxImagem + LIMITES.dados);
  const bruto = form.get("dados");
  if (typeof bruto === "string" && Buffer.byteLength(bruto) > LIMITES.dados) {
    throw new ErroHttp(413, "A ficha passou do limite de 1 MB. Encurte os textos.");
  }
  let corpo = null;
  if (typeof bruto === "string") {
    try {
      corpo = JSON.parse(bruto);
    } catch {
      corpo = null;
    }
  }
  if (!corpo || typeof corpo !== "object" || Array.isArray(corpo)) {
    throw new ErroHttp(400, "Os dados enviados não estão em um formato válido.");
  }
  validarImagens(form, CAMPOS_IMAGEM_GALERIA);
  return { corpo, form };
}

// Um campo de texto dos Detalhes: numa linha, com links
function textoDoDetalhe(valor, rotulo) {
  const limpo = numaLinha(textoOpcional(valor, rotulo, LIMITES.texto));
  conferirLinks(limpo, rotulo);
  return limpo;
}

// Uma lista dos Detalhes: cada item numa linha, com links. Os itens vazios saem.
function listaDoDetalhe(valor, rotulo, maxItem) {
  const itens = [];
  for (const bruto of Array.isArray(valor) ? valor : []) {
    const item = typeof bruto === "string" ? numaLinha(bruto.replace(/\r\n?/g, "\n").trim()) : "";
    if (!item) continue;
    if (item.length > maxItem) {
      throw new ErroHttp(400, `Cada item do campo ${rotulo} pode ter no máximo ${maxItem} caracteres.`);
    }
    conferirLinks(item, rotulo);
    itens.push(item);
  }
  if (itens.length > LIMITES.itens) {
    throw new ErroHttp(400, `O campo ${rotulo} pode ter no máximo ${LIMITES.itens} itens.`);
  }
  return itens;
}

// Uma data no Ciclo de Sylara, com as regras da Linha do Tempo. Vazia: null.
function dataDoDetalhe(valor, rotulo) {
  if (!valor) return null;
  try {
    return lerDataDaLinha(valor, anoDeHoje(), true);
  } catch (erro) {
    if (erro instanceof ErroHttp) throw new ErroHttp(400, `${erro.message.replace(/\.$/, "")} (campo ${rotulo}).`);
    throw erro;
  }
}

// Um marco: a data e o onde. Precisa de pelo menos um dos dois; sem nenhum, fica null.
function marcoDoDetalhe(valor, rotulo) {
  if (!valor || typeof valor !== "object") return null;
  const data = dataDoDetalhe(valor.data, rotulo);
  const onde = numaLinha(textoOpcional(valor.onde, `${rotulo} (onde)`, LIMITES.onde));
  return data || onde ? { data, onde } : null;
}

// A ficha completa, campo a campo. "morteMantida": quando quem envia não muda a Morte (o dono),
// ela fica como está e o que veio no envio é ignorado.
function detalhesDoCorpo(bruto, morteMantida) {
  const corpo = bruto && typeof bruto === "object" && !Array.isArray(bruto) ? bruto : {};
  const detalhes = {};
  for (const [chave, rotulo, tipo] of CAMPOS_DOS_DETALHES) {
    if (chave === "morte" && morteMantida !== undefined) {
      detalhes.morte = morteMantida;
      continue;
    }
    const valor = Object.hasOwn(corpo, chave) ? corpo[chave] : undefined;
    if (tipo === "texto") detalhes[chave] = textoDoDetalhe(valor, rotulo);
    else if (tipo === "lista") detalhes[chave] = listaDoDetalhe(valor, rotulo, chave === "frases" ? LIMITES.frase : LIMITES.item);
    else if (tipo === "data") detalhes[chave] = dataDoDetalhe(valor, rotulo);
    else detalhes[chave] = marcoDoDetalhe(valor, rotulo);
  }
  return detalhes;
}

// O Título ou Frase aponta um item dos títulos ou das frases, já sem os itens vazios.
// Um item que não existe deixa o personagem sem destaque.
function destaqueDoCorpo(bruto, detalhes) {
  if (!bruto || typeof bruto !== "object") return null;
  const lista = detalhes[LISTA_DO_DESTAQUE.get(bruto.tipo)];
  if (!lista || !Number.isInteger(bruto.indice) || bruto.indice < 0 || bruto.indice >= lista.length) return null;
  return { tipo: bruto.tipo, indice: bruto.indice };
}

// As caixas de texto livre. Uma caixa toda vazia sai; com texto, precisa de título.
function textosDoCorpo(lista) {
  const caixas = [];
  (Array.isArray(lista) ? lista : []).forEach((bruta, i) => {
    const caixa = bruta && typeof bruta === "object" ? bruta : {};
    const titulo = numaLinha(textoOpcional(caixa.titulo, `Título da caixa ${i + 1}`, LIMITES.tituloDaCaixa));
    const textoDaCaixa = textoOpcional(caixa.texto, `Texto da caixa ${i + 1}`, LIMITES.textoDaCaixa);
    if (!titulo && !textoDaCaixa) return;
    if (!titulo) throw new ErroHttp(400, `Preencha o campo Título da caixa ${i + 1}.`);
    conferirLinks(textoDaCaixa, `Texto da caixa ${i + 1}`);
    caixas.push({ titulo, texto: textoDaCaixa });
  });
  if (caixas.length > LIMITES.caixas) {
    throw new ErroHttp(400, `A aba Textos pode ter no máximo ${LIMITES.caixas} caixas.`);
  }
  return caixas;
}

// A idade escrita antes de a idade ser contada fica enquanto não houver o ano de nascimento
function manterIdadeAnotada(detalhes, anteriores) {
  const anotada = anteriores?.idade;
  if (typeof anotada === "string" && anotada && !detalhes.nascimento?.data) detalhes.idade = anotada;
}

// Os Detalhes, o Título ou Frase e os Textos. Quem não muda a Morte passa a que já está guardada.
// "anteriores": os Detalhes guardados, de onde vem a idade escrita antes.
function conteudoDaFicha(corpo, morteMantida, anteriores) {
  const detalhes = detalhesDoCorpo(corpo.detalhes, morteMantida);
  manterIdadeAnotada(detalhes, anteriores);
  return { detalhes, destaque: destaqueDoCorpo(corpo.destaque, detalhes), textos: textosDoCorpo(corpo.textos) };
}

// O epitáfio só vale para os caídos; a data da queda é a Morte dos Detalhes.
// Sem epitáfio, a queda fica null.
function situacaoDaFicha(corpo) {
  const situacao = corpo.situacao ?? "vivo";
  if (!SITUACOES.has(situacao)) {
    throw new ErroHttp(400, "Escolha a situação: vivo, caído, desaparecido ou aposentado.");
  }
  const bruta = situacao === "caido" && corpo.queda && typeof corpo.queda === "object" ? corpo.queda : null;
  const epitafio = bruta ? textoOpcional(bruta.epitafio, "Epitáfio", 160) : "";
  return { situacao, queda: epitafio ? { epitafio } : null };
}

// Confere e limpa o que veio do formulário de um outro personagem.
// Só o administrador escolhe quem vê; o que um editor cadastra é para todos, e ele não muda depois.
function valoresDoOutro(corpo, conta, atual) {
  const nome = texto(corpo.nome, "Nome", 60);
  const fonte = corpo.fonte ?? FONTE_PADRAO;
  if (!FONTES.has(fonte)) throw new ErroHttp(400, "Escolha uma das fontes da lista.");
  if (!PAPEIS.has(corpo.papel)) throw new ErroHttp(400, "Escolha o papel: personagem de jogador ou NPC.");
  const jogador = corpo.papel === "jogador" ? textoOpcional(corpo.jogador, "Jogador", 40) : "";
  let visibilidade = atual && VISIBILIDADES.has(atual.visibilidade) ? atual.visibilidade : "todos";
  if (conta.admin) visibilidade = VISIBILIDADES.has(corpo.visibilidade) ? corpo.visibilidade : "todos";
  return {
    nome,
    fonte,
    papel: corpo.papel,
    jogador,
    mesas: mesasConhecidas(corpo.mesas),
    ...situacaoDaFicha(corpo),
    ...conteudoDaFicha(corpo, undefined, atual?.detalhes),
    visibilidade,
  };
}

// Apagar o personagem tira também as citações dele na Linha do Tempo
function tirarDasCitacoes(id) {
  const linha = dados.linha;
  if (!linha) return;
  for (const ev of linha.acontecimentos) ev.personagens = ev.personagens.filter((p) => p !== id);
  for (const p of linha.pendencias) {
    if (Array.isArray(p.dados?.personagens)) p.dados.personagens = p.dados.personagens.filter((x) => x !== id);
  }
}

/* ---------- Rotas ---------- */

async function tratarGaleria(req, res, rota, metodo, conta) {
  const mudouLinha = garantirLinha();
  if (garantirPersonagens() || mudouLinha) await salvarDados();
  let partes;
  try {
    partes = rota.split("/").filter(Boolean).slice(2).map(decodeURIComponent);
  } catch {
    throw new ErroHttp(404, "Endereço não encontrado.");
  }
  const [recurso, id, ...resto] = partes;

  if (!resto.length) {
    if (!recurso && metodo === "GET") return enviarJson(res, 200, dadosDaGaleria(conta));
    if (recurso === "ficha" && id && metodo === "GET") return enviarJson(res, 200, fichaCompleta(conta, id));
    if (recurso === "ficha" && id && metodo === "PUT") return salvarFicha(req, res, conta, id);
    if (recurso === "outros") {
      if (!id && metodo === "POST") return cadastrarOutro(req, res, conta);
      if (id && metodo === "PUT") return alterarOutro(req, res, conta, id);
      if (id && metodo === "DELETE") return apagarOutro(res, conta, id);
    }
  }
  throw new ErroHttp(404, "Endereço não encontrado.");
}

// O dono escreve os Detalhes (menos a Morte), o Título ou Frase e os Textos e troca o retrato;
// o administrador e os editores mudam isso em qualquer ficha e também a situação, o epitáfio e a Morte.
// Nome e fonte continuam no "Personalizar" das Mesas, e a capa e a arte do card também.
async function salvarFicha(req, res, conta, id) {
  fichaEditavel(conta, id); // antes de receber as imagens
  const { corpo, form } = await lerFormularioDaFicha(req);
  const personagem = fichaEditavel(conta, id);
  const cuida = Boolean(conta.admin || conta.editor);
  const morteMantida = cuida ? undefined : (personagem.detalhes?.morte ?? null);
  const valores = conteudoDaFicha(corpo, morteMantida, personagem.detalhes);
  if (cuida) Object.assign(valores, situacaoDaFicha(corpo));
  Object.assign(personagem, valores);
  await aplicarImagens(personagem, form, CAMPOS_IMAGEM_GALERIA);
  await salvarDados();
  enviarJson(res, 200, { ok: true });
}

async function cadastrarOutro(req, res, conta) {
  exigirEditor(conta);
  const { corpo, form } = await lerFormularioDaFicha(req);
  const valores = valoresDoOutro(corpo, conta, null);
  if (dados.outrosPersonagens.length >= LIMITE_OUTROS) {
    throw new ErroHttp(400, `A galeria pode ter no máximo ${LIMITE_OUTROS} personagens cadastrados aqui.`);
  }
  const quando = carimbo();
  const personagem = {
    id: novoId("npc-", new Set([...dados.personagens, ...dados.outrosPersonagens].map((p) => p.id))),
    ...valores,
    retrato: null,
    registradoPor: conta.usuario,
    registradoNome: conta.nome,
    criadoEm: quando,
    alteradoEm: quando,
  };
  await aplicarImagens(personagem, form, CAMPOS_IMAGEM_GALERIA);
  dados.outrosPersonagens.push(personagem);
  await salvarDados();
  console.log(`${conta.usuario} cadastrou nos Personagens: ${personagem.nome}`);
  enviarJson(res, 201, { personagem: { id: personagem.id } });
}

async function alterarOutro(req, res, conta, id) {
  outroEditavel(conta, id); // antes de receber as imagens
  const { corpo, form } = await lerFormularioDaFicha(req);
  const personagem = outroEditavel(conta, id);
  Object.assign(personagem, valoresDoOutro(corpo, conta, personagem));
  await aplicarImagens(personagem, form, CAMPOS_IMAGEM_GALERIA);
  personagem.alteradoEm = carimbo();
  await salvarDados();
  enviarJson(res, 200, { ok: true });
}

async function apagarOutro(res, conta, id) {
  exigirAdmin(conta);
  const personagem = outroVisivel(conta, id);
  dados.outrosPersonagens = dados.outrosPersonagens.filter((p) => p !== personagem);
  tirarDasCitacoes(id);
  await salvarDados();
  await apagarImagens(CAMPOS_IMAGEM_GALERIA.map((campo) => personagem[campo]));
  console.log(`${conta.usuario} apagou dos Personagens: ${personagem.nome}`);
  enviarJson(res, 200, { ok: true });
}

// Quando alguém troca o próprio usuário, os cadastros dele acompanham
function renomearNosPersonagens(antigo, novo) {
  for (const p of dados.outrosPersonagens ?? []) if (p.registradoPor === antigo) p.registradoPor = novo;
}

// Conta excluída: os cadastros dela guardam só o nome, e ninguém herda o que era dela
function desligarContaDosPersonagens(conta) {
  for (const p of dados.outrosPersonagens ?? []) {
    if (p.registradoPor === conta.usuario) Object.assign(p, { registradoPor: null, registradoNome: conta.nome });
  }
}

// Mesa apagada: sai dos outros personagens que a citam
function tirarMesaDosPersonagens(id) {
  for (const p of dados.outrosPersonagens ?? []) {
    if (Array.isArray(p.mesas)) p.mesas = p.mesas.filter((m) => m !== id);
  }
}

ganchos.renomearConta.push(renomearNosPersonagens);
ganchos.excluirConta.push(desligarContaDosPersonagens);
ganchos.excluirMesa.push(tirarMesaDosPersonagens);

// Os endereços /api/galeria/... são desta página (/api/personagens/:id já é o "Personalizar" das Mesas).
// "iniciar" confere os dados ao ligar o portal e devolve true quando precisou mudar alguma coisa.
module.exports = { prefixo: "/api/galeria", tratar: tratarGaleria, iniciar: garantirPersonagens };
