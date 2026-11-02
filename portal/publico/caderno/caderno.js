/* =================================================================
   Crônicas Eternas: Caderno
   -----------------------------------------------------------------
   O caderno pessoal de cada conta, com pastas e notas. À esquerda,
   a lateral: o título, os botões, a busca, as notas fixadas, a
   árvore do caderno, uma seção para cada conta que compartilhou
   algo ("Compartilhadas por <nome>") e as etiquetas. À direita, a
   nota aberta, com endereço próprio (#nota-<id>). O texto da nota
   é desenhado pelo marcas.js, com os links, as notas embutidas e
   as imagens que o servidor manda. O administrador não tem
   caderno: ele escolhe uma conta e lê o caderno dela, sem alterar.

   Esta é a parte de mostrar e navegar. Criar, editar, compartilhar
   e buscar vêm depois: por enquanto, esses botões avisam "em breve".

   No servidor, conversa com o servidor/caderno.js. Aberta fora dele
   (arquivo no PC ou prévia), usa cadernos de exemplo e um painel
   para ver a página como Neia, Takezo ou o Mestre.

   Usa o comum.js, carregado antes (pedir(), criar(), botao(),
   simbolo(), avisos, barra lateral, status do Foundry e cinzas), e
   o desenharMarcas() do marcas.js.
   ================================================================= */

const CONFIG = {
  intervaloStatus: 15000, // tempo entre consultas ao estado do Foundry, em ms
};

// No localStorage: as pastas abertas na árvore e, para o administrador, a conta escolhida
const GUARDA_PASTAS = "caderno-pastas-abertas";
const GUARDA_CONTA = "caderno-conta-escolhida";

const TITULO_DA_PAGINA = document.title;

/* =================================================================
   Conversa com o servidor
   ================================================================= */

const apiDoServidor = {
  caderno: () => pedir("GET", "/api/caderno"),
  cadernoDaConta: (usuario) => pedir("GET", caminhoDe("/api/caderno/contas", usuario)),
  nota: (id) => pedir("GET", caminhoDe("/api/caderno/notas", id)),
  estado: () => pedir("GET", "/api/estado", undefined, { silencioso: true }),
  sair: () => pedir("POST", "/api/sair"),
};

/* =================================================================
   Prévia: um portal de mentira, só na memória do navegador
   ================================================================= */

const CONTAS_DA_PREVIA = {
  jogador: { usuario: "neia", nome: "Neia", cargo: "jogador" },
  editor: { usuario: "takezo", nome: "Takezo", cargo: "editor" },
  admin: { usuario: "mestre", nome: "Mestre", cargo: "admin" },
};

// As imagens da prévia: desenhos de traço claro num fundo escuro
function desenhoDaPrevia(tracos) {
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 270"><rect width="480" height="270" fill="#1b1714"/>' +
    `<g fill="none" stroke="#c9ab80" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">${tracos}</g></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

const DESENHO_DA_PONTE =
  '<path d="M40 190Q240 60 440 190M40 190H440"/>' +
  '<path d="M90 190V150M150 190V118M210 190V102M270 190V102M330 190V118M390 190V150"/>' +
  '<path d="M20 225q30-12 60 0t60 0t60 0t60 0t60 0t60 0t60 0" stroke-opacity=".5"/>' +
  '<path d="M50 248q30-12 60 0t60 0t60 0t60 0t60 0t60 0" stroke-opacity=".3"/>';

const DESENHO_DO_PASSO =
  '<path d="M20 220L120 90L180 160L260 50L350 170L410 110L470 220"/>' +
  '<path d="M60 240C140 200 200 230 250 180S360 150 440 200" stroke="#e8ddc8" stroke-dasharray="4 12"/>' +
  '<circle cx="60" cy="240" r="6"/><circle cx="440" cy="200" r="6"/>';

// As datas contam a partir de hoje, para os exemplos parecerem recentes em qualquer dia.
// Os personagens, acontecimentos, mesas, memórias e lugares têm os ids e nomes das outras prévias.
function exemplosDaPrevia() {
  const agora = Date.now();
  const diasAtras = (dias, horas = 0) => new Date(agora - dias * 86400000 - horas * 3600000).toISOString();
  // O título da nota de um dia: a data do calendário de verdade, AAAA-MM-DD
  const diaDoCalendario = (dias) => {
    const d = new Date(agora - dias * 86400000);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  const pasta = (dono, { pasta: acima = null, compartilhada = {}, ...campos }) => ({
    ...campos,
    pasta: acima,
    compartilhada,
    criadaEm: diasAtras(40),
    criadaPor: dono,
  });
  // "dias": há quantos dias a nota foi alterada pela última vez; "por": quem alterou
  const nota = (dono, { dias, por = dono, pasta: acima = null, compartilhada = {}, link = null, ...campos }) => ({
    ...campos,
    pasta: acima,
    versao: 3,
    criadaEm: diasAtras(dias + 6),
    criadaPor: dono,
    alteradaEm: diasAtras(dias, 3),
    alteradaPor: por,
    compartilhada,
    link,
  });

  const GUIA = String.raw`Este guia mostra as marcas que o caderno entende. Em cada uma, primeiro como se escreve (com uma barra invertida antes da marca, para ela aparecer) e depois o resultado. #guia

# Títulos

Uma, duas ou três cerquilhas e um espaço no começo da linha (\# Título, \#\# Título, \#\#\# Título) fazem os três tamanhos de título. Este guia usa os três.

## Texto

- \*\*negrito\*\* fica **negrito**
- \*itálico\* fica *itálico*
- \~\~riscado\~\~ fica ~~riscado~~
- as marcas se combinam: **negrito com *itálico* dentro**
- a barra invertida antes de uma marca mostra a marca: \\\* fica \*

Dentro de um parágrafo, a quebra de linha fica.
Esta frase está na linha de baixo. Uma linha em branco começa outro parágrafo.

## Listas

Um traço e um espaço no começo da linha (\- item) fazem uma lista. Dois espaços a mais no começo põem um item dentro do outro, até três níveis:

- Leva sempre:
  - corda
  - lanterna
    - óleo para a lanterna
- E nunca esquece o mapa

Um número e um ponto no começo da linha fazem uma lista numerada, que começa no primeiro número:

3. Westna
4. Hando
5. Passo Negro

### Tarefas

Um traço e colchetes (\- \[ \] tarefa ou \- \[x\] feita) fazem uma tarefa com caixinha:

- [x] Comprar corda em Westna
- [ ] Perguntar ao guia sobre o Passo Negro

## Citação

Um sinal de maior (\>) no começo da linha faz uma citação. As linhas seguidas formam uma citação só:

> Aqui dorme quem guardou a ponte.
> Que a cinza lhe seja leve.

## Tabela

As células ficam entre barras verticais. A linha de traços logo abaixo do cabeçalho diz o alinhamento de cada coluna: :\-\-\- à esquerda, :\-\-\-: no centro e \-\-\-: à direita.

| Parada | Dias de viagem | Custo |
| :--- | :---: | ---: |
| [[lugar:mapa-7a1e0c3d/marca-7a1e0000|Westna]] | 2 | 15 po |
| [[lugar:mapa-7a1e0c3d/marca-7a1e0003|Hando]] | 5 | 40 po |

## Separador

Três traços, três asteriscos ou três sublinhados sozinhos na linha fazem um separador:

---

## Etiquetas

Uma cerquilha colada numa palavra (\#pistas) vira etiqueta: #pistas #viagem. Elas também aparecem na lateral, em Etiquetas.

## Links

Um endereço da web solto vira link: https://cronicaseternas.com. Para mostrar outro texto no lugar do endereço, o texto vai entre colchetes e o endereço entre parênteses, logo depois: [o portal do grupo](https://cronicaseternas.com).

Os links para o portal usam o código \[\[tipo:id\|o que aparece\]\], que o botão Link escreve. O que vem depois da barra é o que aparece:

- outra nota: [[nota:nota-5e5500000011|Sessão 1: a ponte]]
- personagem: [[personagem:p1|Venti]]
- acontecimento: [[evento:e10|a morte do guardião da ponte]]
- mesa: [[mesa:ode-to-sleep|Ode to Sleep]]
- memória: [[memoria:mem-0a1b2c3d|a carta deixada na hospedaria]]
- lugar: [[lugar:mapa-7a1e0c3d/marca-7a1e0000|Westna]]

Quem não vê o alvo lê só o texto, sem link. Este personagem só o administrador vê: [[personagem:npc-3d4e5f60|a Voz na Torre]].

## Imagem

O botão Imagem envia a imagem e põe no texto o código !\[\[imagem:id\|legenda\]\]. A legenda aparece embaixo, e clicar abre a imagem inteira:

![[imagem:a1b2c3d4e5f60718293a4b5c|Esboço da ponte de Hando]]

## Nota embutida

O código !\[\[nota:id\|…\]\] sozinho na linha mostra a outra nota inteira, numa moldura:

![[nota:nota-11a900000041|Para a viagem]]`;

  const neia = {
    pastas: [
      pasta("neia", { id: "pasta-5e5500000001", nome: "Sessões" }),
      pasta("neia", { id: "pasta-d1a700000002", nome: "Diário" }),
      pasta("neia", { id: "pasta-9e5000000003", nome: "Personagens", compartilhada: { frati: "ver" } }),
    ],
    notas: [
      nota("neia", { id: "nota-9a1a00000001", titulo: "Guia das marcas", texto: GUIA, dias: 6 }),
      nota("neia", {
        id: "nota-5e5500000011",
        titulo: "Sessão 1: a ponte",
        pasta: "pasta-5e5500000001",
        compartilhada: { takezo: "editar" },
        por: "takezo",
        dias: 2,
        texto:
          "Chegamos a [[lugar:mapa-7a1e0c3d/marca-7a1e0003|Hando]] no fim da tarde. O guardião da ponte, [[personagem:npc-1b2c3d4e|Bram]], cobrou o pedágio de sempre e avisou que a névoa andava estranha. #pistas\n\n- A névoa vinha do rio, contra o vento.\n- Bram falou de uma canção que se ouve à noite.\n\nTakezo: acho que a canção tem a ver com [[evento:e10|o que aconteceu na ponte]].\n\nContinua em [[nota:nota-5e5500000012|Sessão 2: o Passo Negro]].",
      }),
      nota("neia", {
        id: "nota-5e5500000012",
        titulo: "Sessão 2: o Passo Negro",
        pasta: "pasta-5e5500000001",
        dias: 1,
        texto:
          "Saímos de Hando antes do amanhecer, e [[evento:e9|a travessia do Passo Negro]] levou o dia inteiro.\n\n> O guia jura que já atravessou sozinho. Ninguém acredita.\n\nO que vimos na ponte está em [[nota:nota-5e5500000011|Sessão 1: a ponte]]. #pistas #passo-negro\n\n- [ ] Perguntar a Bram sobre a canção\n- [x] Comprar corda",
      }),
      nota("neia", {
        id: "nota-d1a700000021",
        titulo: diaDoCalendario(1),
        pasta: "pasta-d1a700000002",
        dias: 1,
        texto: "Dia calmo. Treinei com a lança de manhã e escrevi uma carta para casa.",
      }),
      nota("neia", {
        id: "nota-d1a700000022",
        titulo: diaDoCalendario(3),
        pasta: "pasta-d1a700000002",
        dias: 3,
        texto: "Choveu desde cedo. As botas não secam mais.\n\n- [ ] Comprar botas novas",
      }),
      nota("neia", {
        id: "nota-9e5000000031",
        titulo: "Bram, o guardião da ponte",
        pasta: "pasta-9e5000000003",
        dias: 9,
        texto:
          "[[personagem:npc-1b2c3d4e|Bram]] cuida da ponte de [[lugar:mapa-7a1e0c3d/marca-7a1e0003|Hando]] há trinta anos.\n\n- Gosta de pão de mel.\n- Não fala do irmão.",
      }),
      nota("neia", {
        id: "nota-11a900000041",
        titulo: "Para a viagem",
        link: { token: "Zx3mQ8vYtK2pL7nW4rB9cD1fH6jS0aEu", criadoEm: diasAtras(4) },
        dias: 4,
        texto: "- [ ] Corda nova\n- [x] Óleo para a lanterna\n- [ ] Mapa de Tyrenar",
      }),
    ],
    // A segunda é do Takezo, compartilhada com a Neia para ver
    fixadas: ["nota-9a1a00000001", "nota-7e0a00000054"],
    imagens: [
      {
        id: "a1b2c3d4e5f60718293a4b5c",
        arquivo: "a1b2c3d4e5f60718293a4b5c.png",
        tamanho: 183022,
        criadaEm: diasAtras(6),
        orfaDesde: null,
        endereco: desenhoDaPrevia(DESENHO_DA_PONTE),
      },
    ],
  };

  const takezo = {
    pastas: [pasta("takezo", { id: "pasta-7e0a00000051", nome: "Teorias", compartilhada: { neia: "editar" } })],
    notas: [
      nota("takezo", {
        id: "nota-7e0a00000052",
        titulo: "Quem é a Voz na Torre",
        pasta: "pasta-7e0a00000051",
        por: "neia",
        dias: 2,
        texto:
          "Desconfio que [[personagem:npc-3d4e5f60|a Voz na Torre]] é alguém que já conhecemos. #teoria\n\nNeia: e se for alguém de [[lugar:mapa-7a1e0c3d/marca-7a1e0000|Westna]]?",
      }),
      nota("takezo", {
        id: "nota-7e0a00000053",
        titulo: "O culto e o inverno",
        pasta: "pasta-7e0a00000051",
        dias: 5,
        texto:
          "Se [[evento:e12|o culto se mover antes do inverno]], o [[evento:e9|Passo Negro]] fecha antes de voltarmos. #teoria #pistas",
      }),
      nota("takezo", {
        id: "nota-7e0a00000054",
        titulo: "Mapa do Passo Negro",
        compartilhada: { neia: "ver" },
        dias: 3,
        texto:
          "Rabisquei de memória o caminho que fizemos depois de [[lugar:mapa-7a1e0c3d/marca-7a1e0003|Hando]].\n\n![[imagem:b2c3d4e5f60718293a4b5c6d|O Passo Negro, de memória]]",
      }),
    ],
    fixadas: [],
    imagens: [
      {
        id: "b2c3d4e5f60718293a4b5c6d",
        arquivo: "b2c3d4e5f60718293a4b5c6d.png",
        tamanho: 96214,
        criadaEm: diasAtras(3),
        orfaDesde: null,
        endereco: desenhoDaPrevia(DESENHO_DO_PASSO),
      },
    ],
  };

  return {
    contas: [
      { usuario: "mestre", nome: "Mestre", admin: true },
      { usuario: "comuna", nome: "Comuna" },
      { usuario: "takezo", nome: "Takezo", editor: true },
      { usuario: "frati", nome: "Frati" },
      { usuario: "neia", nome: "Neia" },
    ],
    cadernos: { neia, takezo },
    // Os personagens do portal aparecem sempre; os outros, se não forem só do administrador
    personagens: [{ id: "p1", nome: "Venti" }],
    outrosPersonagens: [
      { id: "npc-1b2c3d4e", nome: "Bram, o guardião da ponte", visibilidade: "todos" },
      { id: "npc-3d4e5f60", nome: "A Voz na Torre", visibilidade: "admin" },
    ],
    acontecimentos: [
      { id: "e9", titulo: "O grupo atravessa o Passo Negro", visibilidade: "todos" },
      { id: "e10", titulo: "A morte do guardião da ponte", visibilidade: "todos" },
      { id: "e12", titulo: "O culto se move antes do inverno", visibilidade: "admin" },
    ],
    mesas: [
      { id: "ode-to-sleep", nome: "Ode to Sleep" },
      { id: "remissao", nome: "Remissão do Flagelo Esvanescente" },
    ],
    memorias: [{ id: "mem-0a1b2c3d", titulo: "Carta deixada na hospedaria", todos: true, contas: [] }],
    mapas: [
      {
        id: "mapa-7a1e0c3d",
        nome: "Tyrenar",
        visibilidade: "todos",
        marcadores: [
          { id: "marca-7a1e0000", nome: "Westna", visibilidade: "todos" },
          { id: "marca-7a1e0003", nome: "Hando", visibilidade: "todos" },
          { id: "marca-c41d0e03", nome: "Círculo de Pedras", visibilidade: "admin" },
        ],
      },
    ],
  };
}

function criarApiDePrevia() {
  let banco = exemplosDaPrevia();
  let conta = CONTAS_DA_PREVIA.jogador;

  // As mesmas regras do servidor/caderno.js
  const FORCA = { ver: 1, editar: 2 };
  const copia = (valor) => structuredClone(valor);
  const porTitulo = (a, b) => a.titulo.localeCompare(b.titulo, "pt-BR", { numeric: true });
  const contaDe = (usuario) => banco.contas.find((c) => c.usuario === usuario);
  const pessoa = (usuario) => ({ usuario, nome: contaDe(usuario)?.nome ?? usuario });
  const leitorAtual = () => contaDe(conta.usuario);
  const contasComCaderno = () => banco.contas.filter((c) => !c.admin);
  const cadernoDe = (usuario) => {
    if (!Object.hasOwn(banco.cadernos, usuario)) banco.cadernos[usuario] = { pastas: [], notas: [], fixadas: [], imagens: [] };
    return banco.cadernos[usuario];
  };
  const cadernosAtivos = () => contasComCaderno().map((c) => ({ dono: c.usuario, c: cadernoDe(c.usuario) }));
  const mapaDePastas = (c) => new Map(c.pastas.map((p) => [p.id, p]));

  // As pastas acima de um item, de dentro para fora
  function pastasAcima(item, pastas) {
    const acima = [];
    let id = item.pasta;
    while (id && pastas.has(id) && !acima.some((p) => p.id === id)) {
      const pasta = pastas.get(id);
      acima.push(pasta);
      id = pasta.pasta;
    }
    return acima;
  }

  const compartilhadoCom = (item, usuario) =>
    Object.hasOwn(item.compartilhada, usuario) && FORCA[item.compartilhada[usuario]] ? item.compartilhada[usuario] : null;
  const maisForte = (a, b) => (!a ? b : !b ? a : FORCA[b] > FORCA[a] ? b : a);

  function nivelCompartilhado(usuario, item, pastas) {
    let nivel = compartilhadoCom(item, usuario);
    for (const pasta of pastasAcima(item, pastas)) nivel = maisForte(nivel, compartilhadoCom(pasta, usuario));
    return nivel;
  }

  function nivelDe(leitor, dono, item, pastas) {
    if (leitor.admin) return "admin";
    if (dono === leitor.usuario) return "dona";
    return nivelCompartilhado(leitor.usuario, item, pastas);
  }

  function acharNota(id) {
    for (const { dono, c } of cadernosAtivos()) {
      const nota = c.notas.find((n) => n.id === id);
      if (nota) return { dono, c, nota, pastas: mapaDePastas(c) };
    }
    return null;
  }

  const legivel = (leitor, achado) => Boolean(achado && nivelDe(leitor, achado.dono, achado.nota, achado.pastas));

  // O que o servidor lê do texto: links, embutidas, imagens e etiquetas
  const REGEX_ESCAPE = /\\([*~#[\]|\->\\])/g;
  const REGEX_LINK = /\[\[(nota|personagem|evento|mesa|memoria|lugar):([^\]|\n]+)\|([^\]\n]*)\]\]/g;
  const REGEX_EMBUTIDA = /^[ \t]*!\[\[nota:([^\]|\n]+)\|[^\]\n]*\]\][ \t]*$/gm;
  const REGEX_IMAGEM = /!\[\[imagem:([^\]|\n]+)(?:\|([^\]\n]*))?\]\]/g;
  const REGEX_SEM_ETIQUETA = /!?\[\[[^\]\n]*\]\]|\[[^\]\n]*\]\(https?:\/\/[^)\s]*\)|https?:\/\/\S+/g;
  const REGEX_ETIQUETA = /(^|[\s(])#([\p{L}\p{M}\p{N}_/-]+)/gmu;

  function lerCodigos(texto) {
    const protegido = texto.replace(REGEX_ESCAPE, (_, ch) => `${String.fromCharCode(0xe000 + ch.charCodeAt(0))}`);
    const links = new Set([...protegido.matchAll(REGEX_LINK)].map(([, tipo, id]) => `${tipo}:${id}`));
    const embutidas = new Set([...protegido.matchAll(REGEX_EMBUTIDA)].map(([, id]) => id));
    const imagens = new Set([...protegido.matchAll(REGEX_IMAGEM)].map(([, id]) => id));
    const etiquetas = new Map();
    for (const [, , nome] of protegido.replace(REGEX_SEM_ETIQUETA, "\u0001").matchAll(REGEX_ETIQUETA)) {
      if (nome.length > 60 || !/\p{L}/u.test(nome)) continue;
      const chave = normalizar(nome);
      if (!etiquetas.has(chave)) etiquetas.set(chave, nome.toLowerCase());
    }
    return { links, embutidas, imagens, etiquetas };
  }

  /* ---------- A árvore ---------- */

  const compartilhadaPublica = (item) =>
    Object.fromEntries(Object.entries(item.compartilhada).filter(([usuario, nivel]) => FORCA[nivel] && contaDe(usuario) && !contaDe(usuario).admin));
  const notaDaArvore = (n, pasta) => ({
    id: n.id,
    titulo: n.titulo,
    pasta,
    alteradaEm: n.alteradaEm,
    etiquetas: [...lerCodigos(n.texto).etiquetas.values()],
  });

  function arvoreInteira(c, daDona) {
    return {
      pastas: c.pastas.map((p) => ({ id: p.id, nome: p.nome, pasta: p.pasta, ...(daDona ? { compartilhada: compartilhadaPublica(p) } : {}) })),
      notas: c.notas.map((n) => ({
        ...notaDaArvore(n, n.pasta),
        ...(daDona ? { compartilhada: compartilhadaPublica(n), link: Boolean(n.link) } : {}),
      })),
    };
  }

  // O que um caderno compartilhou com a conta. Os do alto (fora de uma pasta também
  // compartilhada com ela) vêm na raiz.
  function arvoreCompartilhada(leitor, c) {
    const pastas = mapaDePastas(c);
    const niveis = new Map();
    for (const p of c.pastas) {
      const nivel = nivelCompartilhado(leitor.usuario, p, pastas);
      if (nivel) niveis.set(p.id, nivel);
    }
    const acimaVisivel = (item) => (item.pasta && niveis.has(item.pasta) ? item.pasta : null);
    const arvore = { pastas: [], notas: [] };
    for (const p of c.pastas) {
      if (niveis.has(p.id)) arvore.pastas.push({ id: p.id, nome: p.nome, pasta: acimaVisivel(p), nivel: niveis.get(p.id) });
    }
    for (const n of c.notas) {
      const nivel = maisForte(compartilhadoCom(n, leitor.usuario), niveis.get(n.pasta) || null);
      if (nivel) arvore.notas.push({ ...notaDaArvore(n, acimaVisivel(n)), nivel });
    }
    return arvore;
  }

  function compartilhadasCom(leitor) {
    return cadernosAtivos()
      .filter(({ dono }) => dono !== leitor.usuario)
      .map(({ dono, c }) => ({ dono: pessoa(dono), caderno: arvoreCompartilhada(leitor, c) }))
      .filter((secao) => secao.caderno.pastas.length || secao.caderno.notas.length)
      .sort((a, b) => a.dono.nome.localeCompare(b.dono.nome, "pt-BR", { numeric: true }));
  }

  function notasLegiveis(leitor, lista = cadernosAtivos()) {
    const achadas = [];
    for (const { dono, c } of lista) {
      const pastas = mapaDePastas(c);
      for (const nota of c.notas) if (nivelDe(leitor, dono, nota, pastas)) achadas.push({ dono, c, nota, pastas });
    }
    return achadas;
  }

  function contarEtiquetas(achadas) {
    const contagem = new Map();
    for (const { nota } of achadas) {
      for (const [chave, nome] of lerCodigos(nota.texto).etiquetas) {
        const atual = contagem.get(chave);
        if (atual) atual.quantas += 1;
        else contagem.set(chave, { nome, quantas: 1 });
      }
    }
    return [...contagem.values()].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR", { numeric: true }));
  }

  const fixadasDe = (leitor, c) =>
    c.fixadas.flatMap((id) => {
      const achado = acharNota(id);
      return legivel(leitor, achado) ? [{ id, titulo: achado.nota.titulo, dono: pessoa(achado.dono) }] : [];
    });

  const espacoDe = (c) => ({ usado: c.imagens.reduce((soma, i) => soma + i.tamanho, 0), limite: 1024 ** 3 });

  /* ---------- A nota para quem lê ---------- */

  // Só os alvos que a conta vê; os outros ficam de fora e aparecem só como texto
  function alvosDosLinks(leitor, chaves) {
    const links = {};
    for (const chave of chaves) {
      const separador = chave.indexOf(":");
      const tipo = chave.slice(0, separador);
      const id = chave.slice(separador + 1);
      let alvo = null;
      if (tipo === "nota") {
        const achado = acharNota(id);
        if (legivel(leitor, achado)) alvo = { titulo: achado.nota.titulo };
      } else if (tipo === "personagem") {
        const p = [...banco.personagens, ...banco.outrosPersonagens.filter((x) => leitor.admin || x.visibilidade !== "admin")].find(
          (x) => x.id === id,
        );
        if (p) alvo = { nome: p.nome };
      } else if (tipo === "evento") {
        const ev = banco.acontecimentos.find(
          (a) => a.id === id && (leitor.admin || (a.visibilidade !== "admin" && !(a.visibilidade === "revelar" && !a.revelado))),
        );
        if (ev) alvo = { titulo: ev.titulo };
      } else if (tipo === "mesa") {
        const mesa = banco.mesas.find((m) => m.id === id);
        if (mesa) alvo = { nome: mesa.nome };
      } else if (tipo === "memoria") {
        const memoria = banco.memorias.find((m) => m.id === id && (leitor.admin || m.todos || m.contas.includes(leitor.usuario)));
        if (memoria) alvo = { titulo: memoria.titulo };
      } else if (tipo === "lugar") {
        const [idDoMapa, idDaMarca] = id.split("/");
        const mapa = banco.mapas.find((m) => m.id === idDoMapa);
        const marca = mapa?.marcadores.find((m) => m.id === idDaMarca);
        if (marca && (leitor.admin || (mapa.visibilidade !== "admin" && marca.visibilidade !== "admin"))) {
          alvo = { nome: marca.nome, mapa: mapa.nome };
        }
      }
      if (alvo) links[chave] = alvo;
    }
    return links;
  }

  // Só as imagens do próprio caderno da nota
  function juntarImagens(imagens, lida, c) {
    for (const id of lida.imagens) {
      const guardada = c.imagens.find((i) => i.id === id);
      if (guardada && !Object.hasOwn(imagens, id)) imagens[id] = guardada.endereco;
    }
  }

  // Os links, as embutidas (um nível só) e as imagens, com os das embutidas
  function conteudoLido(leitor, { c, nota }) {
    const lida = lerCodigos(nota.texto);
    const chaves = new Set(lida.links);
    const embutidas = {};
    const imagens = {};
    juntarImagens(imagens, lida, c);
    for (const id of lida.embutidas) {
      if (id === nota.id) continue;
      const outra = acharNota(id);
      if (!legivel(leitor, outra)) continue;
      embutidas[id] = { titulo: outra.nota.titulo, texto: outra.nota.texto, dono: pessoa(outra.dono) };
      const daOutra = lerCodigos(outra.nota.texto);
      for (const chave of daOutra.links) chaves.add(chave);
      juntarImagens(imagens, daOutra, outra.c);
    }
    return { links: alvosDosLinks(leitor, chaves), embutidas, imagens };
  }

  function citadaEm(leitor, nota) {
    const chave = `nota:${nota.id}`;
    return notasLegiveis(leitor)
      .filter(({ nota: outra }) => outra !== nota && lerCodigos(outra.texto).links.has(chave))
      .map(({ dono, nota: outra }) => ({ id: outra.id, titulo: outra.titulo, dono: pessoa(dono) }))
      .sort(porTitulo);
  }

  // As pastas acima da nota, da raiz para dentro, só as que a conta vê
  const caminhoDaNota = (leitor, { dono, nota, pastas }) =>
    pastasAcima(nota, pastas)
      .reverse()
      .filter((p) => nivelDe(leitor, dono, p, pastas))
      .map((p) => ({ id: p.id, nome: p.nome }));

  function notaPublica(leitor, achado) {
    const { dono, nota, pastas } = achado;
    const nivel = nivelDe(leitor, dono, nota, pastas);
    const caminho = caminhoDaNota(leitor, achado);
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
      dono: pessoa(dono),
      nivel,
    };
    if (nivel === "dona") {
      publica.compartilhada = compartilhadaPublica(nota);
      publica.link = nota.link ? { endereco: `/ler/#${nota.link.token}` } : null;
    }
    return { nota: publica, caminho, ...conteudoLido(leitor, achado), citadaEm: citadaEm(leitor, nota) };
  }

  return {
    trocarConta(cargo) {
      conta = CONTAS_DA_PREVIA[cargo];
    },
    restaurar() {
      banco = exemplosDaPrevia();
    },
    async caderno() {
      const leitor = leitorAtual();
      const quem = { usuario: leitor.usuario, nome: leitor.nome, cargo: conta.cargo };
      if (leitor.admin) {
        const cadernos = contasComCaderno().map((c) => ({ usuario: c.usuario, nome: c.nome, notas: cadernoDe(c.usuario).notas.length }));
        return copia({ conta: quem, cadernos });
      }
      const meu = cadernoDe(leitor.usuario);
      return copia({
        conta: quem,
        caderno: arvoreInteira(meu, true),
        compartilhadas: compartilhadasCom(leitor),
        fixadas: fixadasDe(leitor, meu),
        etiquetas: contarEtiquetas(notasLegiveis(leitor)),
        imagens: espacoDe(meu),
        contas: contasComCaderno()
          .filter((c) => c.usuario !== leitor.usuario)
          .map((c) => ({ usuario: c.usuario, nome: c.nome })),
      });
    },
    async cadernoDaConta(usuario) {
      const leitor = leitorAtual();
      if (!leitor.admin) throw erroComCodigo("Só o administrador pode fazer isso.", "proibido");
      const dona = contaDe(usuario);
      if (!dona || dona.admin) throw erroComCodigo("Essa conta não existe ou não tem caderno.", "nao-encontrado");
      const c = cadernoDe(usuario);
      return copia({
        dono: pessoa(usuario),
        caderno: arvoreInteira(c, false),
        etiquetas: contarEtiquetas(notasLegiveis(leitor, [{ dono: usuario, c }])),
        imagens: espacoDe(c),
      });
    },
    async nota(id) {
      await esperar(80);
      const leitor = leitorAtual();
      const achado = acharNota(id);
      if (!legivel(leitor, achado)) throw erroComCodigo("Essa nota não existe ou não foi compartilhada com você.", "nao-encontrado");
      return copia(notaPublica(leitor, achado));
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
  conta: null, // { usuario, nome, cargo }
  dados: null, // o que o GET /api/caderno mandou
  escolhida: null, // só o administrador: o usuário do caderno que ele lê
  vista: null, // só o administrador: o caderno escolhido ({ dono, caderno, etiquetas, imagens })
};

const ehAdmin = () => estado.conta?.cargo === "admin";
const temCaderno = () => Boolean(estado.conta) && !ehAdmin();
const ehMinha = (pessoa) => pessoa?.usuario === estado.conta?.usuario;

const porNomeNatural = (a, b) => a.localeCompare(b, "pt-BR", { numeric: true });
const milhar = (n) => n.toLocaleString("pt-BR");

// "120 MB", "1 GB", "1,5 GB": a mesma conta do servidor
function emBytes(bytes) {
  for (const [unidade, tamanho] of [
    ["GB", 1024 ** 3],
    ["MB", 1024 ** 2],
    ["KB", 1024],
  ]) {
    const arredondado = Math.round((bytes / tamanho) * 10) / 10;
    if (arredondado >= 1) return `${milhar(arredondado)} ${unidade}`;
  }
  return `${milhar(bytes)} bytes`;
}

// "2 de novembro de 2026, 14:30"
const FORMATO_DA_DATA = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "long", year: "numeric" });
const FORMATO_DA_HORA = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" });
function dataEHora(iso) {
  const data = new Date(iso);
  return Number.isNaN(data.getTime()) ? "" : `${FORMATO_DA_DATA.format(data)}, ${FORMATO_DA_HORA.format(data)}`;
}

// O que fica guardado no navegador. Sem o localStorage (navegação privada, alguns arquivos abertos
// no PC), a página funciona do mesmo jeito, só sem lembrar.
function lerGuardado(chave) {
  try {
    return localStorage.getItem(chave);
  } catch {
    return null;
  }
}

function guardar(chave, valor) {
  try {
    localStorage.setItem(chave, valor);
  } catch {
    // sem o localStorage, fica só nesta visita
  }
}

const pastasAbertas = new Set(
  (() => {
    try {
      const lista = JSON.parse(lerGuardado(GUARDA_PASTAS) || "[]");
      return Array.isArray(lista) ? lista.filter((id) => typeof id === "string") : [];
    } catch {
      return [];
    }
  })(),
);
const guardarPastas = () => guardar(GUARDA_PASTAS, JSON.stringify([...pastasAbertas]));

// Os botões de criar, editar e compartilhar ainda não funcionam
const emBreve = (oQue) => () => avisoRapido(`${oQue}: em breve.`);

// As outras contas, para os nomes de quem recebeu um compartilhamento
const nomeDaConta = (usuario) => estado.dados?.contas?.find((c) => c.usuario === usuario)?.nome ?? usuario;
const listaDeNomes = (usuarios) =>
  new Intl.ListFormat("pt-BR", { style: "long", type: "conjunction" }).format(usuarios.map(nomeDaConta).sort(porNomeNatural));

const noCelular = () => window.matchMedia("(max-width: 760px)").matches;

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
   Endereço: a nota aberta (#nota-<id>)
   -----------------------------------------------------------------
   Abrir uma nota põe o endereço dela no histórico, para o Voltar do
   navegador voltar à nota anterior. Cada passo guarda quantos o
   separam do caderno sem nota aberta: no celular, "‹ Caderno" usa o
   Voltar quando a pessoa veio da lateral. Quem chegou por um link
   direto não tem a lateral atrás: aí o botão só tira a nota do
   endereço.
   ================================================================= */

const navegacao = {
  id: null, // a nota do endereço: aberta, abrindo ou que não abriu
  lida: null, // o que o servidor mandou da nota aberta
  pedido: 0, // conta as aberturas, para ignorar a resposta de uma que ficou para trás
  rolagemDaLateral: 0, // no celular, onde a lateral estava antes de abrir a nota
};

const ancoraDe = (id) => `#nota-${id}`;

function idDoEndereco() {
  const achado = location.hash.match(/^#nota-([\w-]+)$/);
  return achado ? achado[1] : null;
}

const passosDesdeOCaderno = () => (Number.isInteger(history.state?.passos) ? history.state.passos : null);

// Põe (ou tira) a nota aberta no endereço da página. Devolve false se o navegador não deixar.
function trocarEndereco(ancora, { nova = false } = {}) {
  const endereco = ancora || location.pathname + location.search;
  const passos = passosDesdeOCaderno();
  try {
    if (nova) history.pushState({ passos: passos === null ? null : passos + 1 }, "", endereco);
    else history.replaceState({ passos: ancora ? passos : 0 }, "", endereco);
    return true;
  } catch {
    // dentro de alguns quadros de prévia, o navegador não deixa mudar o endereço
    return false;
  }
}

function abrirNota(id) {
  if (!navegacao.id) navegacao.rolagemDaLateral = window.scrollY;
  if (id !== idDoEndereco()) trocarEndereco(ancoraDe(id), { nova: true });
  mostrarNota(id);
}

// "‹ Caderno", no celular: de volta à lateral
function voltarAoCaderno() {
  const passos = passosDesdeOCaderno();
  if (passos) return history.go(-passos);
  trocarEndereco("");
  mostrarNota(null);
}

const aoMudarOEndereco = () => mostrarNota(idDoEndereco());

// Mostra a nota (ou nenhuma, com id null). "forcar" pede a nota de novo, mesmo que já esteja aberta.
async function mostrarNota(id, { forcar = false } = {}) {
  if (!id) return mostrarSemNota();
  if (!forcar && id === navegacao.id) return;
  const pedido = ++navegacao.pedido;
  // No celular a lateral some: o foco que estava nela passa para a nota
  const focoPerdido = noCelular() && $("#lateral").contains(document.activeElement);
  navegacao.id = id;
  navegacao.lida = null;
  $("#pagina").classList.add("pagina-caderno--com-nota");
  marcarNaArvore(id);
  mostrarAviso("Abrindo a nota…");
  if (focoPerdido) $("#area-nota").focus({ preventScroll: true });

  let lida;
  try {
    lida = await api.nota(id);
  } catch (falha) {
    if (pedido === navegacao.pedido) mostrarAviso(falha.message);
    return;
  }
  if (pedido !== navegacao.pedido) return;
  // O administrador passa a ler o caderno de quem é a nota
  if (ehAdmin() && lida.nota.dono.usuario !== estado.escolhida) {
    try {
      await escolherCaderno(lida.nota.dono.usuario);
    } catch {
      // a nota abre do mesmo jeito; a lateral fica com o caderno que estava
    }
    if (pedido !== navegacao.pedido) return;
  }
  navegacao.lida = lida;
  renderizarNota(lida);
  marcarNaArvore(id);
}

function mostrarSemNota() {
  navegacao.pedido++; // a resposta de uma nota que ainda estava a caminho não abre mais nada
  const aberta = navegacao.id;
  navegacao.id = null;
  navegacao.lida = null;
  // O caderno sem nota fica marcado no histórico como o ponto de partida (passo 0)
  try {
    history.replaceState({ passos: 0 }, "");
  } catch {
    // dentro de alguns quadros de prévia, o navegador não deixa
  }
  const area = $("#area-nota");
  const focoNaNota = area.contains(document.activeElement) || document.activeElement === document.body;
  $("#pagina").classList.remove("pagina-caderno--com-nota");
  document.title = TITULO_DA_PAGINA;
  marcarNaArvore(null);
  renderizarVazio();
  if (!aberta) return;
  if (noCelular()) window.scrollTo(0, navegacao.rolagemDaLateral);
  // O foco volta para a nota que estava aberta, na árvore
  if (focoNaNota) {
    const item = [...document.querySelectorAll(".arvore__item--nota")].find((i) => i.dataset.id === aberta && i.offsetParent);
    item?.focus({ preventScroll: true });
  }
}

/* =================================================================
   A nota aberta
   ================================================================= */

const botaoVoltar = () => botao("‹ Caderno", "botao--leve area-nota__voltar", voltarAoCaderno);

function mostrarAviso(mensagem) {
  document.title = TITULO_DA_PAGINA;
  const aviso = criar("p", "area-nota__aviso", mensagem);
  aviso.setAttribute("role", "status");
  $("#area-nota").replaceChildren(botaoVoltar(), aviso);
}

// Sem nota aberta: o convite no meio
function renderizarVazio() {
  const vazio = criar("div", "area-nota__vazio");
  if (!temCaderno()) {
    vazio.append(criar("p", "area-nota__convite", "Escolha uma nota para ler."));
  } else {
    const acoes = criar("div", "area-nota__acoes");
    acoes.append(
      botao("+ Nota", "botao--principal botao--brasa", emBreve("Criar notas")),
      botao("Nota de hoje", "botao--leve", emBreve("Nota de hoje")),
    );
    vazio.append(criar("p", "area-nota__convite", "Escolha uma nota ou comece uma nova."), acoes);
  }
  $("#area-nota").replaceChildren(vazio);
}

// Um link para uma nota. O clique comum abre aqui mesmo; com Ctrl, o botão do meio ou o direito,
// continua um link de verdade (nova aba, copiar o endereço).
function linkDeNota(id, texto, classe) {
  const link = criar("a", classe, texto);
  link.href = ancoraDe(id);
  link.addEventListener("click", (evento) => {
    if (evento.button !== 0 || evento.ctrlKey || evento.metaKey || evento.shiftKey || evento.altKey) return;
    evento.preventDefault();
    abrirNota(id);
  });
  return link;
}

// "Editar" para quem pode alterar, "Compartilhar" para a dona e o menu "⋯" (ainda em breve)
function barraDaNota(nota) {
  const barra = criar("div", "nota__barra");
  if (nota.nivel === "dona" || nota.nivel === "editar") barra.append(botao("Editar", "botao--leve", emBreve("Editar")));
  if (nota.nivel === "dona") barra.append(botao("Compartilhar", "botao--leve", emBreve("Compartilhar")));
  const mais = botao("⋯", "botao--leve nota__mais", emBreve("Mais opções"));
  mais.title = "Mais opções";
  mais.setAttribute("aria-label", "Mais opções");
  barra.append(mais);
  return barra;
}

// No pé: as notas que têm link para esta ou a embutem
function secaoCitadaEm(citadas) {
  const secao = criar("section", "nota__citada");
  const titulo = criar("h2", "nota__citada-titulo", "Citada em");
  titulo.id = "titulo-citada";
  secao.setAttribute("aria-labelledby", titulo.id);
  const lista = criar("ul", "nota__citada-lista");
  for (const citada of citadas) {
    const item = criar("li");
    item.append(linkDeNota(citada.id, citada.titulo, "marcas__link"));
    if (!ehMinha(citada.dono)) item.append(criar("span", "nota__de", ` · de ${citada.dono.nome}`));
    lista.append(item);
  }
  secao.append(titulo, lista);
  return secao;
}

function renderizarNota(lida) {
  const { nota, caminho, citadaEm } = lida;
  document.title = nota.titulo;
  const folha = criar("article", "nota");
  folha.setAttribute("aria-labelledby", "titulo-da-nota");

  // No alto, em letra pequena: de quem é o caderno (se não é de quem lê) e as pastas acima
  const onde = [];
  if (!ehMinha(nota.dono)) onde.push(criar("span", "nota__dono", `Do caderno de ${nota.dono.nome}`));
  if (caminho.length) onde.push(criar("span", "nota__pastas", caminho.map((p) => p.nome).join(" › ")));
  if (onde.length) {
    const linha = criar("p", "nota__caminho");
    linha.append(...onde.flatMap((parte, i) => (i ? [" · ", parte] : [parte])));
    folha.append(linha);
  }

  const titulo = criar("h1", "nota__titulo", nota.titulo);
  titulo.id = "titulo-da-nota";
  const alterada = criar("p", "nota__alterada", `Alterada em ${dataEHora(nota.alteradaEm)}`);
  if (nota.alteradaPor && nota.alteradaPor.usuario !== nota.dono.usuario) alterada.append(` por ${nota.alteradaPor.nome}`);
  folha.append(titulo, alterada, barraDaNota(nota));

  const texto = criar("div", "marcas nota__texto");
  if (nota.texto.trim()) texto.append(...desenharMarcas(nota.texto, lida, { idDaNota: nota.id, aoAbrirNota: abrirNota }));
  else texto.append(criar("p", "nota__vazia", "Esta nota ainda está vazia."));
  folha.append(texto);
  if (citadaEm.length) folha.append(secaoCitadaEm(citadaEm));

  $("#area-nota").replaceChildren(botaoVoltar(), folha);
  window.scrollTo(0, 0);
}

/* =================================================================
   A lateral
   ================================================================= */

function renderizarLateral() {
  const admin = ehAdmin();
  const dados = estado.dados;
  $("#titulo-caderno").textContent = admin ? "Cadernos" : `Caderno de ${estado.conta.nome}`;
  $("#campo-conta").hidden = !admin;
  $("#lateral-acoes").hidden = admin;
  if (admin) renderizarEscolhaDaConta();

  renderizarFixadas(admin ? [] : dados.fixadas);

  const lugar = $("#arvore-caderno");
  if (!admin) {
    lugar.replaceChildren(montarArvore(dados.caderno, { rotulo: `Caderno de ${estado.conta.nome}`, daDona: true, vazio: "Nenhuma nota ainda." }));
  } else if (estado.vista) {
    const rotulo = `Caderno de ${estado.vista.dono.nome}`;
    lugar.replaceChildren(montarArvore(estado.vista.caderno, { rotulo, vazio: "Este caderno está vazio." }));
  } else {
    lugar.replaceChildren(criar("p", "lateral__vazio", dados.cadernos.length ? "" : "Nenhuma conta tem caderno ainda."));
  }

  renderizarCompartilhadas(admin ? [] : dados.compartilhadas);
  renderizarEtiquetas(admin ? estado.vista?.etiquetas ?? [] : dados.etiquetas);

  // O espaço das imagens, só para a dona
  const pe = $("#espaco-imagens");
  pe.hidden = admin;
  if (!admin) pe.textContent = `Imagens: ${emBytes(dados.imagens.usado)} de ${emBytes(dados.imagens.limite)}`;

  marcarNaArvore(navegacao.id);
}

// Só o administrador: "Caderno de: Neia (8 notas)", em ordem de nome
function renderizarEscolhaDaConta() {
  const seletor = $("#conta-escolhida");
  const cadernos = [...estado.dados.cadernos].sort((a, b) => porNomeNatural(a.nome, b.nome));
  seletor.replaceChildren(
    ...cadernos.map((c) => {
      const opcao = criar("option", null, `${c.nome} (${c.notas === 1 ? "1 nota" : `${milhar(c.notas)} notas`})`);
      opcao.value = c.usuario;
      return opcao;
    }),
  );
  seletor.value = estado.escolhida ?? "";
  seletor.disabled = !cadernos.length;
}

function renderizarFixadas(fixadas) {
  $("#secao-fixadas").hidden = !fixadas.length;
  $("#lista-fixadas").replaceChildren(
    ...fixadas.map((fixada) => {
      const item = criar("li", "lateral__fixada");
      item.dataset.id = fixada.id;
      const link = linkDeNota(fixada.id, fixada.titulo, "lateral__link");
      if (!ehMinha(fixada.dono)) link.append(criar("small", "lateral__de", ` · de ${fixada.dono.nome}`));
      item.append(link);
      return item;
    }),
  );
}

// "Compartilhadas por <nome>": uma seção para cada conta, já em ordem de nome
function renderizarCompartilhadas(secoes) {
  $("#secoes-compartilhadas").replaceChildren(
    ...secoes.map((secao, i) => {
      const bloco = criar("section", "lateral__secao");
      const titulo = criar("h3", "lateral__subtitulo", `Compartilhadas por ${secao.dono.nome}`);
      titulo.id = `titulo-compartilhadas-${i}`;
      bloco.setAttribute("aria-labelledby", titulo.id);
      bloco.append(titulo, montarArvore(secao.caderno, { rotulo: titulo.textContent, compartilhada: true }));
      return bloco;
    }),
  );
}

// As plaquinhas, com quantas notas tem cada uma (clicar para buscar vem com a busca)
function renderizarEtiquetas(etiquetas) {
  $("#secao-etiquetas").hidden = !etiquetas.length;
  $("#lista-etiquetas").replaceChildren(
    ...etiquetas.map((etiqueta) => {
      const placa = criar("span", "marcas__etiqueta lateral__etiqueta", `#${etiqueta.nome}`);
      const quantas = criar("small", "lateral__quantas", ` ${etiqueta.quantas}`);
      quantas.append(criar("span", "sr", etiqueta.quantas === 1 ? " nota" : " notas"));
      placa.append(quantas);
      return placa;
    }),
  );
}

/* =================================================================
   A árvore
   -----------------------------------------------------------------
   Pastas primeiro, depois as notas, cada grupo em ordem de nome. A
   pasta abre e fecha com um clique; as abertas ficam guardadas no
   navegador. A nota aberta fica marcada. No teclado, como uma
   árvore: as setas andam, → abre a pasta, ← fecha, Enter abre.
   ================================================================= */

// Os pequenos sinais do item: para a dona, com quem compartilhou e o link público; nas
// compartilhadas, o que a conta pode (ver ou editar)
function sinaisDoItem(dado, { daDona, compartilhada }) {
  const sinais = [];
  const sinal = (icone, texto) => {
    const elemento = criar("span", "arvore__sinal");
    elemento.title = texto;
    elemento.append(simbolo(icone), criar("span", "sr", ` (${texto})`));
    return elemento;
  };
  if (daDona) {
    const contas = Object.keys(dado.compartilhada ?? {});
    if (contas.length) sinais.push(sinal("icone-pessoas", `Compartilhada com ${listaDeNomes(contas)}`));
    if (dado.link) sinais.push(sinal("icone-elo", "Com link público"));
  }
  if (compartilhada) sinais.push(dado.nivel === "editar" ? sinal("icone-lapis", "Você pode editar") : sinal("icone-olho", "Você pode ver"));
  if (!sinais.length) return null;
  const caixa = criar("span", "arvore__sinais");
  caixa.append(...sinais);
  return caixa;
}

function itemDaArvore(tipo, dado, nivel, opcoes) {
  const item = criar("li", `arvore__item arvore__item--${tipo}`);
  item.setAttribute("role", "treeitem");
  item.tabIndex = -1;
  item.dataset.id = dado.id;
  item.dataset.tipo = tipo;
  if (tipo === "nota") item.setAttribute("aria-selected", "false");

  const linha = criar("div", "arvore__linha");
  linha.style.setProperty("--nivel", String(nivel));
  linha.append(
    tipo === "pasta" ? simbolo("icone-seta", "arvore__seta") : criar("span", "arvore__seta"),
    criar("span", "arvore__nome", tipo === "pasta" ? dado.nome : dado.titulo),
  );
  const sinais = sinaisDoItem(dado, opcoes);
  if (sinais) linha.append(sinais);
  item.append(linha);
  return item;
}

// "rotulo": o nome da árvore para os leitores de tela. "vazio": o que aparece sem nenhum item.
function montarArvore(arvore, { rotulo, daDona = false, compartilhada = false, vazio = "" }) {
  // Um item cuja pasta não está nesta árvore fica na raiz
  const idsDasPastas = new Set(arvore.pastas.map((p) => p.id));
  const acima = (item) => (item.pasta && idsDasPastas.has(item.pasta) ? item.pasta : null);
  const grupos = new Map(); // a pasta (null na raiz) → { pastas, notas }
  const grupoDe = (id) => {
    if (!grupos.has(id)) grupos.set(id, { pastas: [], notas: [] });
    return grupos.get(id);
  };
  for (const p of arvore.pastas) grupoDe(acima(p)).pastas.push(p);
  for (const n of arvore.notas) grupoDe(acima(n)).notas.push(n);
  for (const grupo of grupos.values()) {
    grupo.pastas.sort((a, b) => porNomeNatural(a.nome, b.nome));
    grupo.notas.sort((a, b) => porNomeNatural(a.titulo, b.titulo));
  }

  const raiz = criar("ul", "arvore");
  raiz.setAttribute("role", "tree");
  raiz.setAttribute("aria-label", rotulo);
  const opcoes = { daDona, compartilhada };
  const jaPostas = new Set(); // uma pasta só aparece uma vez, mesmo com dados estranhos
  const montar = (idDaPasta, nivel, lista) => {
    const { pastas, notas } = grupos.get(idDaPasta) ?? { pastas: [], notas: [] };
    for (const p of pastas) {
      if (jaPostas.has(p.id)) continue;
      jaPostas.add(p.id);
      const item = itemDaArvore("pasta", p, nivel, opcoes);
      const dentro = criar("ul", "arvore__grupo");
      dentro.setAttribute("role", "group");
      montar(p.id, nivel + 1, dentro);
      const aberta = pastasAbertas.has(p.id);
      item.setAttribute("aria-expanded", String(aberta));
      dentro.hidden = !aberta;
      item.append(dentro);
      lista.append(item);
    }
    for (const n of notas) lista.append(itemDaArvore("nota", n, nivel, opcoes));
  };
  montar(null, 0, raiz);

  if (!raiz.children.length) return criar("p", "lateral__vazio", vazio);
  raiz.children[0].tabIndex = 0;
  return raiz;
}

// Os itens à mostra (fora das pastas fechadas), na ordem da tela
const itensVisiveis = (raiz) =>
  [...raiz.querySelectorAll('[role="treeitem"]')].filter((item) => !item.parentElement.closest(".arvore__grupo[hidden]"));

// Só um item de cada árvore entra na ordem do Tab: o último com o foco (ou a nota aberta)
function passarOTab(item) {
  const raiz = item.closest('[role="tree"]');
  for (const outro of raiz.querySelectorAll('[role="treeitem"][tabindex="0"]')) outro.tabIndex = -1;
  item.tabIndex = 0;
}

function focarItem(item) {
  passarOTab(item);
  item.focus();
}

function alternarPasta(item, abrir) {
  const aberta = item.getAttribute("aria-expanded") === "true";
  if (abrir === undefined) abrir = !aberta;
  if (abrir === aberta) return;
  item.setAttribute("aria-expanded", String(abrir));
  item.querySelector(":scope > .arvore__grupo").hidden = !abrir;
  if (abrir) pastasAbertas.add(item.dataset.id);
  else pastasAbertas.delete(item.dataset.id);
  guardarPastas();
}

// A pasta abre ou fecha; a nota abre
function ativarItem(item) {
  if (item.dataset.tipo === "pasta") alternarPasta(item);
  else abrirNota(item.dataset.id);
}

function teclaNaArvore(evento) {
  const item = evento.target;
  if (item.getAttribute?.("role") !== "treeitem" || evento.altKey || evento.ctrlKey || evento.metaKey) return;
  const visiveis = itensVisiveis(item.closest('[role="tree"]'));
  const i = visiveis.indexOf(item);
  const pasta = item.dataset.tipo === "pasta";
  const aberta = item.getAttribute("aria-expanded") === "true";
  let destino = null;
  switch (evento.key) {
    case "ArrowDown":
      destino = visiveis[i + 1];
      break;
    case "ArrowUp":
      destino = visiveis[i - 1];
      break;
    case "Home":
      destino = visiveis[0];
      break;
    case "End":
      destino = visiveis[visiveis.length - 1];
      break;
    case "ArrowRight":
      // A pasta fechada abre; a aberta passa para o primeiro item dela
      if (pasta && !aberta) alternarPasta(item, true);
      else if (pasta) destino = item.querySelector(':scope > .arvore__grupo > [role="treeitem"]');
      break;
    case "ArrowLeft":
      // A pasta aberta fecha; o resto sobe para a pasta de cima
      if (pasta && aberta) alternarPasta(item, false);
      else destino = item.parentElement.closest('[role="treeitem"]');
      break;
    case "Enter":
    case " ":
      ativarItem(item);
      break;
    default:
      return;
  }
  evento.preventDefault();
  if (destino) focarItem(destino);
}

// Marca a nota aberta na árvore (com as pastas acima dela abertas) e nas Fixadas
function marcarNaArvore(id) {
  for (const item of document.querySelectorAll('.arvore__item--nota[aria-selected="true"]')) item.setAttribute("aria-selected", "false");
  for (const link of document.querySelectorAll(".lateral__fixada > a[aria-current]")) link.removeAttribute("aria-current");
  if (!id) return;
  for (const item of document.querySelectorAll(".arvore__item--nota")) {
    if (item.dataset.id !== id) continue;
    item.setAttribute("aria-selected", "true");
    for (let pasta = item.parentElement.closest('[role="treeitem"]'); pasta; pasta = pasta.parentElement.closest('[role="treeitem"]')) {
      alternarPasta(pasta, true);
    }
    passarOTab(item);
  }
  for (const fixada of document.querySelectorAll(".lateral__fixada")) {
    if (fixada.dataset.id === id) fixada.firstElementChild.setAttribute("aria-current", "true");
  }
}

/* =================================================================
   O administrador: o caderno de qual conta
   ================================================================= */

async function escolherCaderno(usuario) {
  const vista = await api.cadernoDaConta(usuario);
  estado.escolhida = usuario;
  estado.vista = vista;
  renderizarLateral();
}

async function aoEscolherConta() {
  const usuario = $("#conta-escolhida").value;
  guardar(GUARDA_CONTA, usuario);
  try {
    await escolherCaderno(usuario);
  } catch (falha) {
    avisarFalha(falha);
    return;
  }
  // A nota aberta de outro caderno fecha
  if (navegacao.id && navegacao.lida?.nota.dono.usuario !== usuario) {
    trocarEndereco("");
    mostrarNota(null);
  }
}

/* =================================================================
   Carregar
   ================================================================= */

async function recarregar() {
  const dados = await api.caderno();
  estado.dados = dados;
  estado.conta = dados.conta;
  estado.escolhida = null;
  estado.vista = null;
  atualizarTopo();
  if (ehAdmin()) {
    // A última conta escolhida, se ainda tiver caderno; senão, a primeira pelo nome
    const usuarios = dados.cadernos.map((c) => c.usuario);
    const guardada = lerGuardado(GUARDA_CONTA);
    const primeira = [...dados.cadernos].sort((a, b) => porNomeNatural(a.nome, b.nome))[0]?.usuario ?? null;
    const escolha = usuarios.includes(guardada) ? guardada : primeira;
    if (escolha) {
      estado.vista = await api.cadernoDaConta(escolha);
      estado.escolhida = escolha;
    }
  }
  renderizarLateral();
}

/* =================================================================
   Eventos da página
   ================================================================= */

// O cabeçalho fica preso no alto; a lateral precisa saber o tamanho dele
function medirAlturas() {
  const aplicar = () => document.documentElement.style.setProperty("--altura-topo", `${$("#topo").offsetHeight}px`);
  new ResizeObserver(aplicar).observe($("#topo"));
  aplicar();
}

function configurarEventos() {
  $("#botao-nova-nota").addEventListener("click", emBreve("Criar notas"));
  $("#botao-nova-pasta").addEventListener("click", emBreve("Criar pastas"));
  $("#botao-nota-de-hoje").addEventListener("click", emBreve("Nota de hoje"));
  $("#conta-escolhida").addEventListener("change", aoEscolherConta);

  // As árvores são montadas de novo a cada mudança: os eventos ficam na lateral
  const lateral = $("#lateral");
  lateral.addEventListener("click", (evento) => {
    const linha = evento.target.closest(".arvore__linha");
    if (!linha) return;
    const item = linha.closest('[role="treeitem"]');
    focarItem(item);
    ativarItem(item);
  });
  lateral.addEventListener("keydown", teclaNaArvore);

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

const NOMES_DA_PREVIA = { jogador: "Neia (jogadora)", editor: "Takezo (editor)", admin: "Mestre (administrador)" };

// Depois de trocar a conta ou restaurar os exemplos, a nota aberta é pedida de novo:
// a outra conta pode não poder lê-la (e aí ela "não existe")
async function recarregarTudo() {
  await recarregar();
  if (navegacao.id) await mostrarNota(navegacao.id, { forcar: true });
  else renderizarVazio();
}

function configurarSimulacao() {
  $("#simulacao").hidden = false;
  const seletor = $("#sim-cargo");
  const resumo = () => {
    $("#simulacao-resumo").textContent = `Prévia · vendo como ${NOMES_DA_PREVIA[seletor.value]}`;
  };
  api.trocarConta(seletor.value);
  resumo();
  seletor.addEventListener("change", async () => {
    api.trocarConta(seletor.value);
    resumo();
    for (const dialogo of document.querySelectorAll("dialog[open]")) dialogo.close();
    await recarregarTudo();
    avisoRapido(`Agora você vê a página como ${NOMES_DA_PREVIA[seletor.value]}.`);
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
  iniciarCinzas(30);
  if (MODO_PREVIA) configurarSimulacao();

  try {
    await recarregar();
  } catch (falha) {
    if (falha.codigo === "sem-sessao") return irParaEntrada({ voltar: true });
    $("#pagina").hidden = false;
    $("#pagina").classList.add("pagina-caderno--com-nota");
    $("#lateral").hidden = true;
    const aviso = criar("p", "area-nota__aviso", falha.message);
    aviso.setAttribute("role", "status");
    $("#area-nota").replaceChildren(aviso);
    return;
  }
  $("#pagina").hidden = false;

  atualizarStatus();
  setInterval(atualizarStatus, CONFIG.intervaloStatus);

  // Link direto para uma nota: já abre. O Voltar e o Avançar do navegador trocam as notas.
  window.addEventListener("popstate", aoMudarOEndereco);
  window.addEventListener("hashchange", aoMudarOEndereco);
  aoMudarOEndereco();
}

iniciar();
