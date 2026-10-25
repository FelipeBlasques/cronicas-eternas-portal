/* =================================================================
   Crônicas Eternas: Memórias de Draevor
   -----------------------------------------------------------------
   Os textos do cenário: cartas, contos, recortes, livros e outros
   escritos que os personagens encontram. A lista mostra só o nome
   de cada memória; clicar num nome troca a lista pela leitura, com
   endereço próprio (#memoria-<id>, e #memoria-<id>-capitulo-<n>
   nos capítulos de um livro). O texto pode mencionar acontecimentos
   da Linha do Tempo e personagens da galeria com links. Só o
   administrador escreve, altera, apaga e revela as memórias.

   No servidor, conversa com o servidor/memorias.js. Aberta fora dele
   (arquivo no PC ou prévia), usa memórias de exemplo e um painel
   para ver a página como administrador, editor ou jogador.

   Usa o comum.js, carregado antes: pedir(), criar(), avisos, barra
   lateral, status do Foundry, texto formatado, fontes e cinzas. Do
   calendario.js, textoDaData() e chaveDaData().
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

const apiDoServidor = {
  memorias: () => pedir("GET", "/api/memorias"),
  memoria: (id) => pedir("GET", caminhoDe("/api/memorias", id)),
  escrever: (dados) => pedir("POST", "/api/memorias", dados),
  alterar: (id, dados) => pedir("PUT", caminhoDe("/api/memorias", id), dados),
  apagar: (id) => pedir("DELETE", caminhoDe("/api/memorias", id)),
  revelar: (id, escolha) => pedir("PUT", `${caminhoDe("/api/memorias", id)}/revelacao`, escolha),
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

  return {
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

  function memoriaPublica(m) {
    const publica = {
      id: m.id,
      titulo: m.titulo,
      tipo: m.tipo,
      data: m.data ? dataPublica(m.data) : null,
      detalhe: tipoDeMemoria(m.tipo)?.detalhe ? m.detalhe || "" : "",
    };
    if (m.tipo === "livro") publica.capitulos = m.capitulos.map((c) => ({ titulo: c.titulo, texto: c.texto }));
    else publica.texto = m.texto;
    publica.reveladaEm = reveladaEm(m);
    if (contaEhAdmin()) publica.revelacao = revelacaoPublica(m);
    return publica;
  }

  // As mesmas conferências e mensagens do servidor/memorias.js
  const ANO_ATUAL = 366; // o ano atual da prévia da Linha do Tempo
  const LIMITES = { memorias: 500, capitulos: 80, texto: 40000, livro: 400000, link: 120 };

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

  function capitulosDoLivro(lista) {
    if (!Array.isArray(lista) || !lista.length) throw erroComCodigo("O livro precisa ter pelo menos um capítulo.");
    if (lista.length > LIMITES.capitulos) throw erroComCodigo(`O livro pode ter no máximo ${LIMITES.capitulos} capítulos.`);
    let total = 0;
    const capitulos = lista.map((bruto, i) => {
      const capitulo = bruto && typeof bruto === "object" ? bruto : {};
      const titulo = textoValido(capitulo.titulo, `Título do capítulo ${i + 1}`, 120);
      const textoDoCapitulo = textoDaMemoria(capitulo.texto, `Texto do capítulo ${i + 1}`);
      total += textoDoCapitulo.length;
      return { titulo, texto: textoDoCapitulo };
    });
    if (total > LIMITES.livro) throw erroComCodigo(`O livro inteiro pode ter no máximo ${LIMITES.livro} caracteres.`);
    return capitulos;
  }

  // No Livro vale "capitulos" e o texto fica vazio; nos outros, o contrário.
  // O "detalhe" só fica nas classificações que têm o campo.
  function valoresDaMemoria(dados) {
    const titulo = textoValido(dados.titulo, "Título", 120);
    const tipo = typeof dados.tipo === "string" ? tipoDeMemoria(dados.tipo) : null;
    if (!tipo) throw erroComCodigo("Escolha uma classificação da lista.");
    const data = dados.data ? dataDaMemoria(dados.data) : null;
    const detalhe = tipo.detalhe ? textoOpcional(dados.detalhe, tipo.detalhe, 120).replace(/\s*\n\s*/g, " ") : "";
    if (tipo.id === "livro") return { titulo, tipo: tipo.id, data, detalhe, texto: "", capitulos: capitulosDoLivro(dados.capitulos) };
    return { titulo, tipo: tipo.id, data, detalhe, texto: textoDaMemoria(dados.texto, "Texto"), capitulos: [] };
  }

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
          const item = { id: m.id, titulo: m.titulo, reveladaEm: reveladaEm(m) };
          if (contaEhAdmin()) Object.assign(item, { tipo: m.tipo, alteradoEm: m.alteradoEm, revelacao: revelacaoPublica(m) });
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
    // Toda memória nasce escondida
    async escrever(dados) {
      await esperar(150);
      exigirAdmin();
      const valores = valoresDaMemoria(dados);
      if (banco.memorias.length >= LIMITES.memorias) throw erroComCodigo(`Podem existir no máximo ${LIMITES.memorias} memórias.`);
      const quando = new Date().toISOString();
      const memoria = { id: novoId(), ...valores, revelacao: { todos: null, contas: {} }, criadoEm: quando, alteradoEm: quando };
      banco.memorias.push(memoria);
      return { memoria: { id: memoria.id } };
    },
    // Alterar não mexe na revelação
    async alterar(id, dados) {
      await esperar(150);
      exigirAdmin();
      const valores = valoresDaMemoria(dados);
      const memoria = acharMemoria(id);
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
    // Ninguém: escondida de novo. Todos: a data de agora, ou a que já tinha, e as contas ficam como estão.
    // Algumas contas: cada marcada fica com a data que já tinha, ou a de agora; as desmarcadas saem.
    async revelar(id, escolha) {
      await esperar(120);
      exigirAdmin();
      const memoria = acharMemoria(id);
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
  rota: null, // { id, capitulo } na leitura (capitulo é null fora dos capítulos), ou null na lista
  lida: null, // { memoria, links } da memória aberta, para folhear os capítulos sem pedir de novo
  pedido: 0, // conta as aberturas, para ignorar a resposta de uma que ficou para trás
  rolagemDaLista: 0,
};

const ancoraDe = ({ id, capitulo }) => `#memoria-${id}${capitulo ? `-capitulo-${capitulo}` : ""}`;

function rotaDoEndereco() {
  const achado = location.hash.match(/^#memoria-([\w-]+?)(?:-capitulo-(\d+))?$/);
  return achado ? { id: achado[1], capitulo: achado[2] ? Number(achado[2]) : null } : null;
}

const mesmaRota = (a, b) => Boolean(a && b && a.id === b.id && a.capitulo === b.capitulo);

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
  leitura.hidden = true;
  leitura.replaceChildren();
  $("#vista-lista").hidden = false;
  document.title = TITULO_DA_PAGINA;
  window.scrollTo(0, navegacao.rolagemDaLista);
  // O foco volta ao nome da memória que estava aberta
  if (focoNaLeitura) {
    const link = [...document.querySelectorAll(".memoria-item__link")].find((l) => l.dataset.id === aberta.id);
    link?.focus({ preventScroll: true });
  }
}

/* =================================================================
   A lista
   ================================================================= */

// Para o administrador: "Escondida" (com o olho riscado) ou "Só para Neia e Takezo".
// As reveladas para todos não levam nada na lista; na leitura, "Revelada para todos".
function sinalDaRevelacao(revelacao, { todos = false } = {}) {
  if (revelacao.para === "ninguem") {
    const selo = criar("span", "selo-oculto");
    selo.append(simbolo("icone-oculto"), "Escondida");
    return selo;
  }
  if (revelacao.para === "contas") return criar("span", "memoria-estado", `Só para ${listaDeNomes(revelacao.contas)}`);
  return todos ? criar("span", "memoria-estado", "Revelada para todos") : null;
}

function itemDaLista(m) {
  const link = linkDaLeitura({ id: m.id, capitulo: null }, "memoria-item__link");
  link.dataset.id = m.id;
  link.append(criar("span", "memoria-item__titulo", m.titulo));
  const sinal = ehAdmin() && m.revelacao ? sinalDaRevelacao(m.revelacao) : null;
  if (sinal) link.append(sinal);
  const item = criar("li", "memoria-item");
  item.append(link);
  return item;
}

function renderizarLista() {
  $("#botao-nova").hidden = !ehAdmin();
  const lista = $("#lista-memorias");
  const vazio = $("#memorias-vazio");
  lista.replaceChildren(...estado.memorias.map(itemDaLista));
  lista.hidden = !estado.memorias.length;
  vazio.hidden = estado.memorias.length > 0;
  vazio.textContent = ehAdmin() ? "Nenhuma memória escrita ainda." : "Nenhuma memória foi revelada ainda.";
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
  document.title = TITULO_DA_PAGINA;
  const barra = criar("div", "leitura__barra");
  barra.append(botao("← Memórias", "botao--leve", voltarALista));
  const aviso = criar("p", "leitura__aviso", mensagem);
  aviso.setAttribute("role", "status");
  $("#leitura").replaceChildren(barra, aviso);
}

async function copiarLink(rota) {
  const link = `${location.origin}${location.pathname}${ancoraDe(rota)}`;
  try {
    await navigator.clipboard.writeText(link);
    avisoRapido(`Link copiado. Quem abrir vai direto ${rota.capitulo ? "neste capítulo" : "nesta memória"}.`);
  } catch {
    avisoRapido(link);
  }
}

// No alto: "← Memórias" e "Copiar link"; para o administrador, também "Alterar" e "Revelar…",
// com o estado atual ao lado
function barraDaLeitura(memoria, rota) {
  const barra = criar("div", "leitura__barra");
  barra.append(botao("← Memórias", "botao--leve", voltarALista), botao("Copiar link", "botao--leve", () => copiarLink(rota)));
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
  let soma = 7;
  for (const letra of id) soma = (soma * 31 + letra.charCodeAt(0)) % 9973;
  return 12 + (soma % 388);
}

// A folha de cada classificação (o Livro tem as dele, logo abaixo). Devolve o que vem depois
// da classificação: a folha e, em alguns tipos, o título antes dela e o detalhe depois, fora dela.
function folhaDaMemoria(memoria, links) {
  const { tipo, titulo, detalhe } = memoria;
  const folha = criar("div", `folha folha--${tipo}`);
  const tituloNaFolha = () => criar("h1", "folha__titulo", titulo);
  const tituloFora = () => criar("h1", "memoria__titulo", titulo);
  // A data e o detalhe são opcionais: sem eles, nada de elemento vazio
  const se = (valor, classe) => (valor ? [criar("p", classe, valor)] : []);
  const data = memoria.data ? textoDaData(memoria.data) : "";
  const texto = textoDaFolha(memoria.texto, links);

  switch (tipo) {
    case "carta":
      folha.append(...se(data, "carta__data"), texto, ...se(detalhe, "carta__assinatura"), enfeite("lacre"));
      return [tituloFora(), folha];
    case "diario":
      folha.append(...se(data, "diario__data"), texto);
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

// Cada capítulo numa página como a do Conto, com capitular
function capituloDoLivro(memoria, n, links) {
  const capitulo = memoria.capitulos[n - 1];
  const folha = criar("div", "folha folha--pagina");
  folha.append(
    criar("p", "folha__capitulo", `Capítulo ${n}`),
    criar("h1", "folha__titulo", capitulo.titulo),
    textoDaFolha(capitulo.texto, links),
    passosEntreCapitulos(memoria, n),
  );
  return [folha];
}

function renderizarLeitura(pedida) {
  const { memoria, links } = navegacao.lida;
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
   Livro, o texto dá lugar aos capítulos. Trocar a classificação de
   Livro para outra junta os capítulos num texto só; de outra para
   Livro, o texto vira o capítulo 1. Nada se perde.
   ================================================================= */

const LIMITE_DE_CAPITULOS = 80; // como no servidor

// A ajuda abaixo do campo "detalhe", nas classificações que têm o campo
const AJUDA_DO_DETALHE = {
  carta: "Aparece no fim da carta.",
  recorte: "O nome do jornal. Ex.: Gazeta de Westna",
  trecho: "O nome da obra.",
  documento: "Aparece no fim, com o selo. Ex.: Conselho de Westna",
  inscricao: "Aparece abaixo da pedra. Ex.: Lápide no cemitério de Hando",
};

const edicao = {
  memoria: null, // a memória sendo alterada, ou null para uma nova
  tipo: null, // a classificação escolhida, para saber de qual se trocou
  capitulos: 0, // conta os capítulos montados, para o id de cada campo de texto
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

// Um capítulo no formulário: o número, as setas e o "Remover" no alto; depois o título e o texto,
// com o "Citar" acima dele
function campoDoCapitulo({ titulo = "", texto = "" } = {}) {
  const item = criar("li", "capitulo-form");
  const subir = botao("↑", "botao--leve capitulo-form__seta", () => moverCapitulo(item, -1));
  const descer = botao("↓", "botao--leve capitulo-form__seta", () => moverCapitulo(item, 1));
  subir.title = "Subir";
  descer.title = "Descer";
  const acoes = criar("div", "capitulo-form__acoes");
  acoes.append(subir, descer, botao("Remover", "botao--leve botao--perigo", () => removerCapitulo(item)));
  const cabeca = criar("div", "capitulo-form__cabeca");
  cabeca.append(criar("span", "capitulo-form__numero"), acoes);

  const entrada = criar("input", "capitulo-form__titulo");
  entrada.maxLength = 120;
  entrada.autocomplete = "off";
  entrada.value = titulo;
  const campoTitulo = criar("label", "campo");
  campoTitulo.append(criar("span", "campo__rotulo", "Título"), entrada);

  const area = criar("textarea", "capitulo-form__texto");
  area.id = `capitulo-texto-${++edicao.capitulos}`;
  area.rows = 10;
  area.maxLength = 100000;
  area.value = texto;
  const rotulo = criar("label", "campo__rotulo", "Texto");
  rotulo.htmlFor = area.id;
  const cabecaDoTexto = criar("div", "campo__cabeca");
  cabecaDoTexto.append(rotulo, botao("Citar", "botao--leve botao--pequeno botao-citar", () => abrirCitar(area)));
  const campoTexto = criar("div", "campo");
  campoTexto.append(cabecaDoTexto, area);

  item.append(cabeca, campoTitulo, campoTexto);
  return item;
}

// Depois de mexer na lista: o número de cada capítulo, as setas das pontas apagadas
// e o "Remover" apagado quando só sobra um
function numerarCapitulos() {
  const itens = [...$("#lista-capitulos").children];
  itens.forEach((item, i) => {
    const n = i + 1;
    item.querySelector(".capitulo-form__numero").textContent = `Capítulo ${n}`;
    const [subir, descer, remover] = item.querySelectorAll(".capitulo-form__acoes button");
    subir.disabled = i === 0;
    descer.disabled = n === itens.length;
    remover.disabled = itens.length === 1;
    subir.setAttribute("aria-label", `Subir o capítulo ${n}`);
    descer.setAttribute("aria-label", `Descer o capítulo ${n}`);
    remover.setAttribute("aria-label", `Remover o capítulo ${n}`);
    item.querySelector(".botao-citar").setAttribute("aria-label", `Citar no capítulo ${n}`);
  });
  $("#botao-mais-capitulo").disabled = itens.length >= LIMITE_DE_CAPITULOS;
}

function mostrarCapitulos(capitulos) {
  $("#lista-capitulos").replaceChildren(...capitulos.map(campoDoCapitulo));
  numerarCapitulos();
}

function capitulosDoFormulario() {
  return [...$("#lista-capitulos").children].map((item) => ({
    titulo: item.querySelector(".capitulo-form__titulo").value.trim(),
    texto: item.querySelector(".capitulo-form__texto").value.trim(),
  }));
}

function adicionarCapitulo() {
  const lista = $("#lista-capitulos");
  if (lista.children.length >= LIMITE_DE_CAPITULOS) return;
  const item = campoDoCapitulo();
  lista.append(item);
  numerarCapitulos();
  item.querySelector(".capitulo-form__titulo").focus();
}

// O foco segue o capítulo que andou; na ponta, passa para a seta que ainda anda
function moverCapitulo(item, passo) {
  const vizinho = passo < 0 ? item.previousElementSibling : item.nextElementSibling;
  if (!vizinho) return;
  if (passo < 0) vizinho.before(item);
  else vizinho.after(item);
  numerarCapitulos();
  const [subir, descer] = item.querySelectorAll(".capitulo-form__seta");
  const seta = passo < 0 ? subir : descer;
  (seta.disabled ? (passo < 0 ? descer : subir) : seta).focus();
  item.scrollIntoView({ block: "nearest" });
}

// Um capítulo com texto pede confirmação antes de sair
async function removerCapitulo(item) {
  if ($("#lista-capitulos").children.length <= 1) return;
  if (item.querySelector(".capitulo-form__texto").value.trim()) {
    const titulo = item.querySelector(".capitulo-form__titulo").value.trim();
    const confirmado = await perguntar({
      titulo: "Remover este capítulo?",
      texto: `${titulo ? `"${titulo}"` : "O capítulo"} sai do livro, com o texto. Nada muda até você salvar a memória.`,
      confirmar: "Remover",
      cancelar: "Cancelar",
      perigo: true,
    });
    if (!confirmado) return;
  }
  const vizinho = item.nextElementSibling ?? item.previousElementSibling;
  item.remove();
  numerarCapitulos();
  vizinho.querySelector(".capitulo-form__titulo").focus();
}

// Os capítulos num texto só: o título de cada um vira uma linha em negrito
function textoDosCapitulos(capitulos) {
  return capitulos
    .map(({ titulo, texto }) => [titulo && `**${titulo}**`, texto].filter(Boolean).join("\n\n"))
    .filter(Boolean)
    .join("\n\n");
}

function trocarClassificacao() {
  const form = formMemoria();
  const nova = form.tipo.value;
  if (edicao.tipo === "livro" && nova !== "livro") {
    form.texto.value = textoDosCapitulos(capitulosDoFormulario());
    mostrarCapitulos([]);
  } else if (edicao.tipo !== "livro" && nova === "livro") {
    mostrarCapitulos([{ titulo: "Capítulo 1", texto: form.texto.value.trim() }]);
    form.texto.value = "";
  }
  edicao.tipo = nova;
  mostrarCamposDoTipo();
}

// O "detalhe" leva o rótulo da classificação e some nas que não têm o campo;
// no Livro, os capítulos ficam no lugar do texto
function mostrarCamposDoTipo() {
  const tipo = tipoDeMemoria(formMemoria().tipo.value);
  $("#campo-detalhe").hidden = !tipo.detalhe;
  $("#rotulo-detalhe").textContent = tipo.detalhe ?? "";
  $("#ajuda-detalhe").textContent = AJUDA_DO_DETALHE[tipo.id] ?? "";
  $("#grupo-texto").hidden = tipo.id === "livro";
  $("#grupo-capitulos").hidden = tipo.id !== "livro";
}

function abrirEdicao(memoria = null) {
  if (!ehAdmin()) return;
  const form = formMemoria();
  form.reset();
  edicao.memoria = memoria;
  $("#erro-memoria").hidden = true;
  $("#memoria-form-titulo").textContent = memoria ? "Alterar memória" : "Nova memória";
  $("#memoria-enviar").textContent = memoria ? "Salvar" : "Escrever";
  $("#memoria-aviso").hidden = Boolean(memoria);
  $("#memoria-apagar").hidden = !memoria;

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
  mostrarCapitulos(memoria?.tipo === "livro" ? memoria.capitulos : []);
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

function coletarMemoria() {
  const form = formMemoria();
  const titulo = form.titulo.value.trim();
  if (!titulo) throw new Error("Escreva o título da memória.");
  const tipo = tipoDeMemoria(form.tipo.value);
  const dados = { titulo, tipo: tipo.id, data: dataDoFormulario(), detalhe: tipo.detalhe ? form.detalhe.value.trim() : "" };
  if (tipo.id !== "livro") return { ...dados, texto: form.texto.value.trim() };
  const capitulos = capitulosDoFormulario();
  const semTitulo = capitulos.findIndex((c) => !c.titulo);
  if (semTitulo >= 0) throw new Error(`Escreva o título do capítulo ${semTitulo + 1}.`);
  return { ...dados, capitulos };
}

// Uma falha antes de fechar o formulário aparece nele; depois, num aviso
function mostrarFalha(dialogo, erro, falha) {
  if (!dialogo.open) return avisarFalha(falha);
  erro.textContent = falha.message;
  erro.hidden = false;
}

// Depois de salvar, a leitura mostra a memória como ficou; a memória nova já abre na leitura
async function enviarMemoria(evento) {
  evento.preventDefault();
  const dialogo = $("#dialogo-memoria");
  const erro = $("#erro-memoria");
  const enviar = $("#memoria-enviar");
  erro.hidden = true;
  let dados;
  try {
    dados = coletarMemoria();
  } catch (falha) {
    return mostrarFalha(dialogo, erro, falha);
  }
  enviar.disabled = true;
  try {
    const alterada = edicao.memoria;
    if (alterada) await api.alterar(alterada.id, dados);
    const nova = alterada ? null : (await api.escrever(dados)).memoria;
    dialogo.close();
    avisoRapido(nova ? "Memória escrita. Ela fica escondida até você revelar." : "Memória salva.");
    await recarregar();
    if (nova) abrir({ id: nova.id, capitulo: null });
    else if (navegacao.rota) await mostrarRota(navegacao.rota, { forcar: true });
  } catch (falha) {
    mostrarFalha(dialogo, erro, falha);
  } finally {
    enviar.disabled = false;
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
  $("#botao-mais-capitulo").addEventListener("click", adicionarCapitulo);
  $("#citar-texto").addEventListener("click", () => abrirCitar(form.texto));
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
    $("#lista-memorias").hidden = true;
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
