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

   A nota abre para ler; "Editar" (ou Ctrl+E) troca pela edição, com
   a barra de botões das marcas, o Citar ([[ e ![[), as imagens e o
   salvar sozinho. Na árvore, o "⋯" de cada item cria, renomeia,
   move, fixa, baixa, copia o link e apaga; a dona também arrasta.
   Compartilhar e buscar vêm depois: por enquanto, avisam "em breve".

   No servidor, conversa com o servidor/caderno.js. Aberta fora dele
   (arquivo no PC ou prévia), usa cadernos de exemplo e um painel
   para ver a página como Neia, Takezo ou o Mestre.

   Usa o comum.js, carregado antes (pedir(), criar(), botao(),
   simbolo(), avisos, barra lateral, status do Foundry e cinzas), e
   o desenharMarcas() do marcas.js.
   ================================================================= */

const CONFIG = {
  intervaloStatus: 15000, // tempo entre consultas ao estado do Foundry, em ms
  esperaParaSalvar: 1500, // ms depois da última mudança no texto, para salvar sozinho
  maximoSemSalvar: 10000, // ms, no máximo, escrevendo sem parar antes de salvar
  novasTentativas: [2000, 5000, 10000], // quando não salvou: as esperas de cada nova tentativa
};

// Os mesmos limites do servidor/caderno.js (a prévia usa todos; a página, os dos campos e das imagens)
const LIMITES = {
  titulo: 120, // caracteres do título da nota
  nomePasta: 80, // caracteres do nome da pasta
  texto: 100000, // caracteres do texto de uma nota
  notas: 2000, // notas num caderno
  pastas: 500, // pastas num caderno
  niveis: 8, // pastas dentro de pastas: uma pasta na raiz é o nível 1
  imagem: 10 * 1024 * 1024, // bytes de cada imagem (10 MB)
  imagens: 1024 * 1024 * 1024, // bytes somando todas as imagens de um caderno (1 GB)
  fixadas: 30, // notas que cada conta pode fixar
  link: 120, // caracteres do "o que aparece" de um link
};
const TIPOS_DE_IMAGEM = ["image/png", "image/jpeg", "image/webp", "image/gif", "image/avif"];

// O título e o nome numa linha só, como o servidor guarda; o título vazio vira "Sem título"
const numaLinha = (valor) => valor.replace(/\s*[\r\n]+\s*/g, " ").trim();
const tituloLimpo = (valor) => numaLinha(valor) || "Sem título";

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
  criarNota: (dados) => pedir("POST", "/api/caderno/notas", dados),
  alterarNota: (id, dados) => pedir("PUT", caminhoDe("/api/caderno/notas", id), dados),
  apagarNota: (id) => pedir("DELETE", caminhoDe("/api/caderno/notas", id)),
  criarPasta: (dados) => pedir("POST", "/api/caderno/pastas", dados),
  alterarPasta: (id, dados) => pedir("PUT", caminhoDe("/api/caderno/pastas", id), dados),
  apagarPasta: (id) => pedir("DELETE", caminhoDe("/api/caderno/pastas", id)),
  mudarFixadas: (notas) => pedir("PUT", "/api/caderno/fixadas", { notas }),
  enviarImagem: (idDaNota, arquivo) => {
    const formulario = new FormData();
    formulario.append("nota", idDaNota);
    formulario.append("imagem", arquivo);
    return pedir("POST", "/api/caderno/imagens", formulario);
  },
  citaveis: () => pedir("GET", "/api/caderno/citaveis"),
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
      { id: "e9", titulo: "O grupo atravessa o Passo Negro", ano: 362, visibilidade: "todos" },
      { id: "e10", titulo: "A morte do guardião da ponte", ano: 365, visibilidade: "todos" },
      { id: "e12", titulo: "O culto se move antes do inverno", ano: 366, visibilidade: "admin" },
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

  /* ---------- O que chega da página: as regras do servidor ---------- */

  const carimbo = () => new Date().toISOString();
  const novoId = (prefixo, bytes = 6) =>
    prefixo + [...crypto.getRandomValues(new Uint8Array(bytes))].map((b) => b.toString(16).padStart(2, "0")).join("");
  const podeAlterar = (nivel) => nivel === "dona" || nivel === "editar";
  const soADona = (dono, acao) => erroComCodigo(`Só ${pessoa(dono).nome} pode ${acao}.`, "proibido");
  const nivelNaArvore = (pasta, pastas) => (pasta ? 1 + pastasAcima(pasta, pastas).length : 0);
  const alturaDa = (pasta, c) => 1 + Math.max(0, ...c.pastas.filter((p) => p.pasta === pasta.id).map((f) => alturaDa(f, c)));
  const erroNiveis = () => erroComCodigo(`As pastas podem ficar no máximo ${LIMITES.niveis} níveis uma dentro da outra.`);
  const enderecosCriados = []; // as imagens enviadas na prévia, para soltar ao restaurar os exemplos

  function exigirQuemEscreve() {
    if (leitorAtual().admin) throw erroComCodigo("O administrador só lê os cadernos.", "proibido");
  }

  // Uma nota ou pasta que a conta pode ler. Para quem não pode, ela não existe.
  function itemVisivel(tipo, id) {
    const leitor = leitorAtual();
    for (const { dono, c } of cadernosAtivos()) {
      const item = (tipo === "nota" ? c.notas : c.pastas).find((x) => x.id === id);
      if (!item) continue;
      const pastas = mapaDePastas(c);
      const nivel = nivelDe(leitor, dono, item, pastas);
      if (nivel) return { dono, c, item, pastas, nivel };
      break;
    }
    throw erroComCodigo(
      tipo === "nota" ? "Essa nota não existe ou não foi compartilhada com você." : "Essa pasta não existe ou não foi compartilhada com você.",
      "nao-encontrado",
    );
  }

  function tituloDaNota(valor) {
    if (valor === undefined || valor === null) return "Sem título";
    if (typeof valor !== "string") throw erroComCodigo("O título da nota precisa ser um texto.");
    const titulo = numaLinha(valor);
    if (titulo.length > LIMITES.titulo) throw erroComCodigo(`O título da nota pode ter no máximo ${milhar(LIMITES.titulo)} caracteres.`);
    return titulo || "Sem título";
  }

  function nomeDaPasta(valor) {
    const nome = typeof valor === "string" ? numaLinha(valor) : "";
    if (!nome) throw erroComCodigo("Preencha o nome da pasta.");
    if (nome.length > LIMITES.nomePasta) throw erroComCodigo(`O nome da pasta pode ter no máximo ${milhar(LIMITES.nomePasta)} caracteres.`);
    return nome;
  }

  function textoDaNota(valor) {
    if (typeof valor !== "string") throw erroComCodigo("O texto da nota precisa ser um texto.");
    const limpo = valor.replace(/\r\n?/g, "\n");
    if (limpo.length > LIMITES.texto) throw erroComCodigo(`O texto da nota pode ter no máximo ${milhar(LIMITES.texto)} caracteres.`);
    const protegido = limpo.replace(REGEX_ESCAPE, (_, ch) => `\ue000${String.fromCharCode(0xe000 + ch.charCodeAt(0))}`);
    for (const [, , , aparece] of protegido.matchAll(REGEX_LINK)) {
      if (!aparece.trim()) {
        throw erroComCodigo("Um link no campo Texto está sem o que aparece. Escreva depois da barra: [[evento:id|o que aparece]].");
      }
      if (aparece.length > LIMITES.link) {
        throw erroComCodigo(`O que aparece num link pode ter no máximo ${LIMITES.link} caracteres (campo Texto).`);
      }
    }
    return limpo;
  }

  // Onde a conta pode criar: a raiz do próprio caderno, uma pasta dela ou uma compartilhada para editar
  function ondeCriar(idDaPasta) {
    if (idDaPasta === undefined || idDaPasta === null) {
      const c = cadernoDe(conta.usuario);
      return { c, pasta: null, pastas: mapaDePastas(c) };
    }
    const { c, item, pastas, nivel } = itemVisivel("pasta", idDaPasta);
    if (!podeAlterar(nivel)) throw erroComCodigo("Você pode ver esta pasta, mas não criar nada nela.", "proibido");
    return { c, pasta: item, pastas };
  }

  function pastaDeDestino(c, valor) {
    if (valor === null) return null;
    const pasta = typeof valor === "string" ? c.pastas.find((p) => p.id === valor) : null;
    if (!pasta) throw erroComCodigo("Escolha uma pasta deste mesmo caderno.");
    return pasta;
  }

  function conferirTextoDoCaderno(c, aMais) {
    const total = c.notas.reduce((soma, n) => soma + n.texto.length, 0);
    if (total + aMais > 10000000) {
      throw erroComCodigo("O texto do caderno inteiro, somando todas as notas, pode ter no máximo 10.000.000 de caracteres.");
    }
  }

  // A pasta, as pastas dentro dela e as notas de todas elas
  function conteudoDa(pasta, c) {
    const ids = new Set([pasta.id]);
    for (let cresceu = true; cresceu; ) {
      cresceu = false;
      for (const p of c.pastas) {
        if (!ids.has(p.id) && ids.has(p.pasta)) {
          ids.add(p.id);
          cresceu = true;
        }
      }
    }
    for (const n of c.notas) if (ids.has(n.pasta)) ids.add(n.id);
    return ids;
  }

  function tirarDoCaderno(c, ids) {
    c.pastas = c.pastas.filter((p) => !ids.has(p.id));
    c.notas = c.notas.filter((n) => !ids.has(n.id));
    c.fixadas = c.fixadas.filter((id) => !ids.has(id));
  }

  // Os lugares que a conta vê, com o id "<mapa>/<marca>" e o nome do mapa
  const lugaresVisiveis = (leitor) =>
    banco.mapas
      .filter((mapa) => leitor.admin || mapa.visibilidade !== "admin")
      .flatMap((mapa) =>
        mapa.marcadores
          .filter((m) => leitor.admin || m.visibilidade !== "admin")
          .map((m) => ({ id: `${mapa.id}/${m.id}`, nome: m.nome, mapa: mapa.nome })),
      );

  return {
    trocarConta(cargo) {
      conta = CONTAS_DA_PREVIA[cargo];
    },
    restaurar() {
      for (const endereco of enderecosCriados.splice(0)) URL.revokeObjectURL(endereco);
      banco = exemplosDaPrevia();
    },
    async criarNota(corpo) {
      await esperar(120);
      exigirQuemEscreve();
      const titulo = tituloDaNota(corpo.titulo);
      const texto = corpo.texto === undefined ? "" : textoDaNota(corpo.texto);
      const { c, pasta } = ondeCriar(corpo.pasta);
      if (c.notas.length >= LIMITES.notas) throw erroComCodigo(`Um caderno pode ter no máximo ${milhar(LIMITES.notas)} notas.`);
      conferirTextoDoCaderno(c, texto.length);
      const quando = carimbo();
      const nota = {
        id: novoId("nota-"),
        titulo,
        pasta: pasta ? pasta.id : null,
        texto,
        versao: 1,
        criadaEm: quando,
        criadaPor: conta.usuario,
        alteradaEm: quando,
        alteradaPor: conta.usuario,
        compartilhada: {},
        link: null,
      };
      c.notas.push(nota);
      return { nota: { id: nota.id } };
    },
    // Título e texto pedem a versão que a página tem: se a nota mudou desde então, o conflito.
    // Mover (a pasta) é só da dona e não pede versão.
    async alterarNota(id, corpo) {
      await esperar(120);
      exigirQuemEscreve();
      const { dono, c, item: nota, nivel } = itemVisivel("nota", id);
      if (!podeAlterar(nivel)) throw erroComCodigo("Você pode ler esta nota, mas não alterar.", "proibido");
      let destino = nota.pasta;
      if (corpo.pasta !== undefined && corpo.pasta !== nota.pasta) {
        if (nivel !== "dona") throw soADona(dono, "mover esta nota");
        destino = pastaDeDestino(c, corpo.pasta)?.id ?? null;
      }
      const mudaTitulo = corpo.titulo !== undefined;
      const mudaTexto = corpo.texto !== undefined;
      const titulo = mudaTitulo ? tituloDaNota(corpo.titulo) : nota.titulo;
      const texto = mudaTexto ? textoDaNota(corpo.texto) : nota.texto;
      if (mudaTitulo || mudaTexto) {
        if (!Number.isInteger(corpo.versao)) throw erroComCodigo("Envie a versão da nota que você está alterando.");
        if (corpo.versao !== nota.versao) {
          const mensagem = "Esta nota mudou enquanto você escrevia.";
          const atual = {
            titulo: nota.titulo,
            texto: nota.texto,
            versao: nota.versao,
            alteradaEm: nota.alteradaEm,
            alteradaPor: nota.alteradaPor ? pessoa(nota.alteradaPor) : null,
          };
          throw erroComCodigo(mensagem, "conflito", copia({ erro: mensagem, codigo: "conflito", nota: atual }));
        }
        conferirTextoDoCaderno(c, texto.length - nota.texto.length);
      }
      if (titulo !== nota.titulo || texto !== nota.texto) {
        Object.assign(nota, { titulo, texto, versao: nota.versao + 1, alteradaEm: carimbo(), alteradaPor: conta.usuario });
      }
      nota.pasta = destino;
      return { nota: { versao: nota.versao, alteradaEm: nota.alteradaEm } };
    },
    async apagarNota(id) {
      await esperar(120);
      exigirQuemEscreve();
      const { dono, c, item: nota, nivel } = itemVisivel("nota", id);
      if (nivel !== "dona") throw soADona(dono, "apagar esta nota");
      tirarDoCaderno(c, new Set([nota.id]));
      return { ok: true };
    },
    async criarPasta(corpo) {
      await esperar(120);
      exigirQuemEscreve();
      const nome = nomeDaPasta(corpo.nome);
      const { c, pasta: acima, pastas } = ondeCriar(corpo.pasta);
      if (c.pastas.length >= LIMITES.pastas) throw erroComCodigo(`Um caderno pode ter no máximo ${milhar(LIMITES.pastas)} pastas.`);
      if (nivelNaArvore(acima, pastas) + 1 > LIMITES.niveis) throw erroNiveis();
      const pasta = { id: novoId("pasta-"), nome, pasta: acima ? acima.id : null, compartilhada: {}, criadaEm: carimbo(), criadaPor: conta.usuario };
      c.pastas.push(pasta);
      return { pasta: { id: pasta.id } };
    },
    // Quem pode editar a pasta só muda o nome; mover é da dona
    async alterarPasta(id, corpo) {
      await esperar(120);
      exigirQuemEscreve();
      const { dono, c, item: pasta, pastas, nivel } = itemVisivel("pasta", id);
      if (!podeAlterar(nivel)) throw erroComCodigo("Você pode ver esta pasta, mas não renomear.", "proibido");
      const nome = corpo.nome === undefined ? pasta.nome : nomeDaPasta(corpo.nome);
      let destino = pasta.pasta;
      if (corpo.pasta !== undefined && corpo.pasta !== pasta.pasta) {
        if (nivel !== "dona") throw soADona(dono, "mover esta pasta");
        const nova = pastaDeDestino(c, corpo.pasta);
        if (nova && (nova === pasta || pastasAcima(nova, pastas).includes(pasta))) {
          throw erroComCodigo("Uma pasta não pode ir para dentro dela mesma.");
        }
        if (nivelNaArvore(nova, pastas) + alturaDa(pasta, c) > LIMITES.niveis) throw erroNiveis();
        destino = nova ? nova.id : null;
      }
      pasta.nome = nome;
      pasta.pasta = destino;
      return { ok: true };
    },
    async apagarPasta(id) {
      await esperar(120);
      exigirQuemEscreve();
      const { dono, c, item: pasta, nivel } = itemVisivel("pasta", id);
      if (nivel !== "dona") throw soADona(dono, "apagar esta pasta");
      tirarDoCaderno(c, conteudoDa(pasta, c));
      return { ok: true };
    },
    async mudarFixadas(notas) {
      await esperar(80);
      exigirQuemEscreve();
      if (!Array.isArray(notas) || notas.some((id) => typeof id !== "string")) throw erroComCodigo("Envie a lista das notas fixadas.");
      const ids = [...new Set(notas)];
      if (ids.length > LIMITES.fixadas) throw erroComCodigo(`Você pode fixar no máximo ${milhar(LIMITES.fixadas)} notas.`);
      for (const id of ids) itemVisivel("nota", id);
      cadernoDe(conta.usuario).fixadas = ids;
      return { ok: true };
    },
    // A imagem vai para o caderno da nota sendo escrita e conta no espaço da dona
    async enviarImagem(idDaNota, arquivo) {
      await esperar(500);
      exigirQuemEscreve();
      const { dono, c, nivel } = itemVisivel("nota", idDaNota);
      if (!podeAlterar(nivel)) throw erroComCodigo("Você pode ler esta nota, mas não pôr imagens nela.", "proibido");
      if (!TIPOS_DE_IMAGEM.includes(arquivo.type)) throw erroComCodigo("Use imagens PNG, JPG, WEBP, GIF ou AVIF.");
      if (arquivo.size > LIMITES.imagem) throw erroComCodigo(`Cada imagem pode ter no máximo ${emBytes(LIMITES.imagem)}.`);
      const { usado, limite } = espacoDe(c);
      if (usado + arquivo.size > limite) {
        throw erroComCodigo(
          `As imagens do caderno de ${pessoa(dono).nome} podem somar no máximo ${emBytes(limite)}, e já somam ${emBytes(usado)}: ` +
            "esta não cabe. As imagens que nenhuma nota cita mais saem sozinhas depois de 7 dias.",
          "sem-espaco",
        );
      }
      const id = novoId("", 12);
      const endereco = URL.createObjectURL(arquivo);
      enderecosCriados.push(endereco);
      const extensao = { "image/jpeg": ".jpg" }[arquivo.type] ?? `.${arquivo.type.slice(6)}`;
      c.imagens.push({ id, arquivo: id + extensao, tamanho: arquivo.size, criadaEm: carimbo(), orfaDesde: null, endereco });
      return { imagem: { id, endereco } };
    },
    // O que o "Citar" oferece: só o que a conta vê
    async citaveis() {
      await esperar(80);
      exigirQuemEscreve();
      const leitor = leitorAtual();
      const notas = notasLegiveis(leitor)
        .map((achado) => ({ id: achado.nota.id, titulo: achado.nota.titulo, caminho: caminhoDaNota(leitor, achado), dono: pessoa(achado.dono) }))
        .sort(porTitulo);
      const porNome = (a, b) => a.nome.localeCompare(b.nome, "pt-BR", { numeric: true });
      return copia({
        notas,
        personagens: [...banco.personagens, ...banco.outrosPersonagens.filter((p) => p.visibilidade !== "admin")]
          .map((p) => ({ id: p.id, nome: p.nome }))
          .sort(porNome),
        acontecimentos: banco.acontecimentos
          .filter((a) => a.visibilidade !== "admin" && !(a.visibilidade === "revelar" && !a.revelado))
          .sort((a, b) => a.ano - b.ano)
          .map((a) => ({ id: a.id, titulo: a.titulo, ano: a.ano })),
        mesas: banco.mesas.map((m) => ({ id: m.id, nome: m.nome })),
        memorias: banco.memorias
          .filter((m) => m.todos || m.contas.includes(leitor.usuario))
          .map((m) => ({ id: m.id, titulo: m.titulo }))
          .sort(porTitulo),
        lugares: lugaresVisiveis(leitor),
      });
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
  pastaEscolhida: null, // a última pasta clicada ou com o foco na árvore: "+ Nota" e "+ Pasta" criam nela
  citaveis: null, // o que o Citar oferece, pedido de novo cada vez que ele abre
};

const ehAdmin = () => estado.conta?.cargo === "admin";
const temCaderno = () => Boolean(estado.conta) && !ehAdmin();
const ehMinha = (pessoa) => pessoa?.usuario === estado.conta?.usuario;
const podeAlterarNota = (nota) => nota?.nivel === "dona" || nota?.nivel === "editar";

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

// "2026-11-02": a data de hoje no calendário do navegador, para o título da Nota de hoje
function dataDeHoje() {
  const hoje = new Date();
  const dois = (n) => String(n).padStart(2, "0");
  return `${hoje.getFullYear()}-${dois(hoje.getMonth() + 1)}-${dois(hoje.getDate())}`;
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

// O Compartilhar ainda não funciona
const emBreve = (oQue) => () => avisoRapido(`${oQue}: em breve.`);

// As outras contas, para os nomes de quem recebeu um compartilhamento
const nomeDaConta = (usuario) => estado.dados?.contas?.find((c) => c.usuario === usuario)?.nome ?? usuario;
const listaDeNomes = (usuarios) =>
  new Intl.ListFormat("pt-BR", { style: "long", type: "conjunction" }).format(usuarios.map(nomeDaConta).sort(porNomeNatural));

const noCelular = () => window.matchMedia("(max-width: 760px)").matches;

// Um colchete no nome fecharia o código [[…]] antes da hora: vira parêntese
const semColchetes = (texto) => texto.replace(/\[/g, "(").replace(/\]/g, ")");

// Para "Não salvou: <motivo>.": a mensagem do servidor no meio da frase
const minuscula = (texto) => texto.charAt(0).toLowerCase() + texto.slice(1);
const semPontoFinal = (texto) => texto.replace(/[.!]+$/, "");

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

// "opcoes.editar": a nota abre já na edição, com o foco no "titulo" (selecionado) ou no "texto"
function abrirNota(id, opcoes = {}) {
  estado.pastaEscolhida = null;
  marcarPastaEscolhida();
  if (!navegacao.id) navegacao.rolagemDaLateral = window.scrollY;
  if (id !== idDoEndereco()) trocarEndereco(ancoraDe(id), { nova: true });
  mostrarNota(id, opcoes);
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
// Sair da nota em edição salva antes o que falta; se não salvar e a pessoa preferir ficar, ela fica.
async function mostrarNota(id, { forcar = false, editar = null } = {}) {
  if (!forcar && id && id === navegacao.id) return;
  if (emEdicao() && edicao.id !== id) {
    const pedido = ++navegacao.pedido;
    const pode = await deixarEdicao();
    if (pedido !== navegacao.pedido) return; // outra nota foi pedida enquanto isso
    if (!pode) {
      trocarEndereco(ancoraDe(edicao.id));
      marcarNaArvore(edicao.id);
      return;
    }
    encerrarEdicao();
  }
  if (!id) return mostrarSemNota();
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
  if (editar && podeAlterarNota(lida.nota)) comecarEdicao(editar);
  else renderizarNota(lida);
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
   A nota aberta, para ler
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
      botao("+ Nota", "botao--principal botao--brasa", () => criarNota()),
      botao("Nota de hoje", "botao--leve", () => notaDeHoje()),
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

// "Editar" (ou "Ler", na edição) para quem pode alterar, "Compartilhar" para a dona e o menu "⋯"
function barraDaNota(nota, { editando = false } = {}) {
  const barra = criar("div", "nota__barra");
  if (podeAlterarNota(nota)) {
    const alternar = botao(editando ? "Ler" : "Editar", "botao--leve nota__alternar", () => (editando ? lerDeNovo() : comecarEdicao()));
    alternar.title = `${editando ? "Ler" : "Editar"} (Ctrl+E)`;
    alternar.setAttribute("aria-keyshortcuts", "Control+E");
    barra.append(alternar);
  }
  if (nota.nivel === "dona") barra.append(botao("Compartilhar", "botao--leve", emBreve("Compartilhar")));
  const mais = botao("⋯", "botao--leve nota__mais", () => {
    if (menu.botao === mais) return fecharMenu();
    abrirMenu(mais, opcoesDe({ tipo: "nota", id: nota.id, nivel: nota.nivel, naBarra: true }), { rotulo: "Mais opções da nota" });
  });
  mais.title = "Mais opções";
  mais.setAttribute("aria-label", "Mais opções");
  mais.setAttribute("aria-haspopup", "menu");
  mais.setAttribute("aria-expanded", "false");
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

// No alto, em letra pequena: de quem é o caderno (se não é de quem lê) e as pastas acima
function linhaDoCaminho(nota, caminho) {
  const onde = [];
  if (!ehMinha(nota.dono)) onde.push(criar("span", "nota__dono", `Do caderno de ${nota.dono.nome}`));
  if (caminho.length) onde.push(criar("span", "nota__pastas", caminho.map((p) => p.nome).join(" › ")));
  if (!onde.length) return null;
  const linha = criar("p", "nota__caminho");
  linha.append(...onde.flatMap((parte, i) => (i ? [" · ", parte] : [parte])));
  return linha;
}

// "Alterada em 2 de novembro de 2026, 14:30", com "por Takezo" quando quem mudou não foi a dona
function textoDaAlterada(nota) {
  const por = nota.alteradaPor && nota.alteradaPor.usuario !== nota.dono.usuario ? ` por ${nota.alteradaPor.nome}` : "";
  return `Alterada em ${dataEHora(nota.alteradaEm)}${por}`;
}

// "manterRolagem": a mesma nota desenhada de novo (depois de ler o que foi escrito, de renomear, de mover)
function renderizarNota(lida, { manterRolagem = false } = {}) {
  const { nota, caminho, citadaEm } = lida;
  // Desenhada de novo, o foco que estava na barra da nota volta para o mesmo botão
  const barraAntiga = $("#area-nota .nota__barra");
  const focoNaBarra = barraAntiga?.contains(document.activeElement) ? [...barraAntiga.children].indexOf(document.activeElement) : -1;
  document.title = nota.titulo;
  const folha = criar("article", "nota");
  folha.setAttribute("aria-labelledby", "titulo-da-nota");
  const linha = linhaDoCaminho(nota, caminho);
  if (linha) folha.append(linha);

  const titulo = criar("h1", "nota__titulo", nota.titulo);
  titulo.id = "titulo-da-nota";
  const alterada = criar("p", "nota__alterada", textoDaAlterada(nota));
  alterada.id = "alterada-da-nota";
  const barra = barraDaNota(nota);
  folha.append(titulo, alterada, barra);

  const texto = criar("div", "marcas nota__texto");
  const opcoes = { idDaNota: nota.id, aoAbrirNota: abrirNota };
  if (podeAlterarNota(nota)) opcoes.aoMarcarTarefa = marcarTarefa;
  if (nota.texto.trim()) texto.append(...desenharMarcas(nota.texto, lida, opcoes));
  else texto.append(criar("p", "nota__vazia", "Esta nota ainda está vazia."));
  folha.append(texto);
  if (citadaEm.length) folha.append(secaoCitadaEm(citadaEm));

  $("#area-nota").replaceChildren(botaoVoltar(), folha);
  if (focoNaBarra >= 0) (barra.children[focoNaBarra] ?? barra.lastElementChild).focus({ preventScroll: true });
  if (!manterRolagem) window.scrollTo(0, 0);
}

// Pede de novo a nota aberta para ler (os links, as embutidas e as imagens novas) e desenha no mesmo lugar
async function atualizarNotaAberta() {
  const id = navegacao.id;
  const pedido = navegacao.pedido;
  if (!id) return;
  let lida;
  try {
    lida = await api.nota(id);
  } catch {
    return;
  }
  if (pedido !== navegacao.pedido || navegacao.id !== id || emEdicao()) return;
  navegacao.lida = lida;
  renderizarNota(lida, { manterRolagem: true });
}

/* ---------- As tarefas, marcadas na leitura ---------- */

// "- [ ] tarefa", também dentro de "> ": tudo até o que fica entre os colchetes
const REGEX_CAIXINHA = /^((?:[ \t]*>[ \t]?)*[ \t]*[-*][ \t]+\[)[ xX](?=\])/;

// O texto com a tarefa da linha "numero" (a primeira é 0) marcada ou não; null se a linha não tem tarefa
function textoComTarefa(texto, numero, marcada) {
  const linhas = texto.split("\n");
  const achado = numero >= 0 && numero < linhas.length ? REGEX_CAIXINHA.exec(linhas[numero]) : null;
  if (!achado) return null;
  linhas[numero] = `${achado[1]}${marcada ? "x" : " "}${linhas[numero].slice(achado[0].length)}`;
  return linhas.join("\n");
}

// Cada caixinha marcada vai para a fila e salva com a versão que a anterior deixou
let filaDasTarefas = Promise.resolve();

function marcarTarefa(linha, marcada, caixa) {
  const id = navegacao.lida?.nota.id;
  caixa.closest(".marcas__tarefa")?.classList.toggle("marcas__tarefa--feita", marcada);
  filaDasTarefas = filaDasTarefas.then(() => gravarTarefa(id, linha, marcada, caixa));
}

async function gravarTarefa(id, linha, marcada, caixa) {
  const desfazer = () => {
    caixa.checked = !marcada;
    caixa.closest(".marcas__tarefa")?.classList.toggle("marcas__tarefa--feita", !marcada);
  };
  const lida = navegacao.lida;
  if (!lida || lida.nota.id !== id || emEdicao()) return desfazer();
  const texto = textoComTarefa(lida.nota.texto, linha, marcada);
  if (texto === null) {
    desfazer();
    return atualizarNotaAberta();
  }
  if (texto === lida.nota.texto) return;
  let resposta;
  try {
    resposta = await api.alterarNota(id, { texto, versao: lida.nota.versao });
  } catch (falha) {
    desfazer();
    if (falha.codigo === "conflito") {
      avisoRapido("Esta nota mudou enquanto você lia. Ela abriu de novo, já com a versão nova.");
      return atualizarNotaAberta();
    }
    return avisarFalha(falha);
  }
  Object.assign(lida.nota, {
    texto,
    versao: resposta.nota.versao,
    alteradaEm: resposta.nota.alteradaEm,
    alteradaPor: { usuario: estado.conta.usuario, nome: estado.conta.nome },
  });
  const alterada = $("#alterada-da-nota");
  if (alterada && navegacao.lida === lida) alterada.textContent = textoDaAlterada(lida.nota);
}

/* =================================================================
   A edição
   -----------------------------------------------------------------
   "Editar" (ou Ctrl+E) troca a leitura pela edição, no mesmo lugar:
   o título num campo, a barra de botões das marcas e o texto numa
   área que cresce com ele. O que se escreve salva sozinho: 1,5 s
   depois da última mudança (no máximo a cada 10 s, escrevendo sem
   parar), ao trocar de nota e ao voltar para a leitura. Se outra
   pessoa salvou a nota no meio (409), um diálogo pergunta qual
   versão fica.
   ================================================================= */

const edicao = {
  id: null, // a nota em edição; null quando se está lendo
  sessao: 0, // conta as edições, para ignorar o que chega de uma que já acabou
  versao: 0, // a versão da nota que a página tem
  salvo: null, // { titulo, texto }: o que o servidor já tem
  temporizador: null, // o próximo salvar sozinho (ou a próxima tentativa)
  desde: 0, // quando veio a primeira mudança ainda não salva
  gravando: null, // a gravação em curso
  tentativas: 0, // as novas tentativas já feitas depois de uma falha
  situacao: "", // "", "salvando", "salvo", "tentando", "erro", "conflito" ou "apagada"
  motivo: "", // a mensagem da falha
  versaoNova: null, // no conflito: a versão que o servidor tem
  conflito: null, // o diálogo do conflito aberto: a escolha que vem dele
  saindo: null, // a saída da nota em curso (salvando antes)
  enviando: 0, // imagens subindo
  envios: null, // a fila das imagens
  imagens: {}, // as imagens enviadas nesta edição: id → endereço
};

const emEdicao = () => edicao.id !== null;
const campoDoTitulo = () => $("#campo-titulo");
const campoDoTexto = () => $("#campo-texto");
const naTela = () => ({ titulo: campoDoTitulo().value, texto: campoDoTexto().value });

function temMudanca() {
  if (!emEdicao() || !campoDoTexto() || !campoDoTitulo()) return false;
  const { titulo, texto } = naTela();
  return titulo !== edicao.salvo.titulo || texto !== edicao.salvo.texto;
}

function zerarEdicao(id, versao, salvo) {
  clearTimeout(edicao.temporizador);
  Object.assign(edicao, {
    id,
    sessao: edicao.sessao + 1,
    versao,
    salvo,
    temporizador: null,
    desde: 0,
    gravando: null,
    tentativas: 0,
    situacao: "",
    motivo: "",
    versaoNova: null,
    conflito: null,
    saindo: null,
    enviando: 0,
    envios: null,
    imagens: {},
  });
}

// "foco": "titulo" (selecionado, para a nota nova) ou "texto"
function comecarEdicao(foco = "texto") {
  const lida = navegacao.lida;
  if (!lida || emEdicao() || !podeAlterarNota(lida.nota)) return;
  zerarEdicao(lida.nota.id, lida.nota.versao, { titulo: lida.nota.titulo, texto: lida.nota.texto });
  renderizarEdicao(lida, foco);
}

const encerrarEdicao = () => zerarEdicao(null, 0, null);

function renderizarEdicao(lida, foco) {
  const { nota, caminho } = lida;
  document.title = nota.titulo;
  const folha = criar("article", "nota nota--edicao");
  folha.setAttribute("aria-label", "Nota em edição");
  const linha = linhaDoCaminho(nota, caminho);
  if (linha) folha.append(linha);

  // O título e, ao lado, se já salvou
  const cabeca = criar("div", "nota__cabeca");
  const titulo = criar("input", "nota__campo-titulo");
  titulo.id = "campo-titulo";
  titulo.type = "text";
  titulo.value = nota.titulo;
  titulo.maxLength = LIMITES.titulo;
  titulo.autocomplete = "off";
  titulo.setAttribute("aria-label", "Título da nota");
  const situacao = criar("p", "nota__situacao");
  situacao.id = "situacao-salvar";
  situacao.setAttribute("role", "status");
  cabeca.append(titulo, situacao);

  const texto = criar("textarea", "nota__campo-texto");
  texto.id = "campo-texto";
  texto.value = nota.texto;
  texto.spellcheck = true;
  texto.placeholder = "Escreva aqui…";
  texto.setAttribute("aria-label", "Texto da nota");

  folha.append(cabeca, barraDaNota(nota, { editando: true }), barraDeFerramentas(), texto);
  $("#area-nota").replaceChildren(botaoVoltar(), folha);
  ajustarAltura();
  mostrarSituacao(edicao.situacao, edicao.motivo);
  if (foco === "titulo") {
    titulo.focus({ preventScroll: true });
    titulo.select();
  } else {
    texto.focus({ preventScroll: true });
    texto.setSelectionRange(0, 0);
  }
}

// A área de texto cresce com o texto. A folha guarda a altura enquanto mede, para a página não pular.
function ajustarAltura() {
  const area = campoDoTexto();
  if (!area) return;
  const folha = area.closest(".nota");
  folha.style.setProperty("min-height", `${folha.offsetHeight}px`);
  const bordas = area.offsetHeight - area.clientHeight;
  area.style.setProperty("height", "auto");
  area.style.setProperty("height", `${area.scrollHeight + bordas}px`);
  folha.style.removeProperty("min-height");
}

// Ao lado do título: "Salvando…", "Salvo", "Não salvou: …" (ou "Enviando imagem…", enquanto sobe)
function mostrarSituacao(situacao, motivo = "") {
  edicao.situacao = situacao;
  edicao.motivo = motivo;
  const lugar = $("#situacao-salvar");
  if (!lugar) return;
  const porque = semPontoFinal(minuscula(motivo));
  const textos = {
    salvando: "Salvando…",
    salvo: "Salvo",
    tentando: `Não salvou: ${porque}. Tentando de novo…`,
    erro: `Não salvou: ${porque}.`,
    conflito: "Não salvou: esta nota mudou enquanto você escrevia.",
    apagada: "Esta nota não existe mais.",
  };
  const enviando = edicao.enviando === 1 ? "Enviando imagem…" : edicao.enviando > 1 ? `Enviando ${edicao.enviando} imagens…` : "";
  lugar.textContent = enviando || textos[situacao] || "";
  lugar.classList.toggle("nota__situacao--falha", !enviando && ["tentando", "erro", "conflito", "apagada"].includes(situacao));
}

/* ---------- Salvar sozinho ---------- */

// Cada mudança no título ou no texto: salva 1,5 s depois da última, e no máximo 10 s depois da primeira
function aoMudarNaEdicao() {
  if (!emEdicao() || edicao.situacao === "apagada") return;
  const agora = Date.now();
  if (!edicao.desde) edicao.desde = agora;
  edicao.tentativas = 0;
  if (edicao.situacao === "salvo") mostrarSituacao("");
  clearTimeout(edicao.temporizador);
  const espera = Math.max(0, Math.min(CONFIG.esperaParaSalvar, edicao.desde + CONFIG.maximoSemSalvar - agora));
  edicao.temporizador = setTimeout(() => salvar(), espera);
}

// Salva o que está na tela; uma gravação por vez. Devolve true quando o servidor fica com tudo o que
// está na tela. "agora": salva também o que mudou durante a gravação (ao trocar de nota e ao ler).
async function salvar({ agora = false } = {}) {
  const sessao = edicao.sessao;
  clearTimeout(edicao.temporizador);
  edicao.temporizador = null;
  while (edicao.gravando) await edicao.gravando;
  if (sessao !== edicao.sessao) return true;
  if (edicao.situacao === "apagada") return false;
  if (!temMudanca()) return true;
  const gravacao = gravarUmaVez();
  edicao.gravando = gravacao;
  const salvou = await gravacao;
  if (edicao.gravando === gravacao) edicao.gravando = null;
  if (!salvou || sessao !== edicao.sessao) return salvou;
  if (agora && temMudanca()) return salvar({ agora });
  return !temMudanca();
}

// Uma gravação: o título e o texto da tela, com a versão que a página tem
async function gravarUmaVez() {
  const sessao = edicao.sessao;
  const enviado = naTela();
  edicao.desde = 0; // o que mudar daqui em diante conta de novo os 10 s
  mostrarSituacao("salvando");
  let resposta;
  try {
    resposta = await api.alterarNota(edicao.id, { titulo: enviado.titulo, texto: enviado.texto, versao: edicao.versao });
  } catch (falha) {
    if (sessao === edicao.sessao) falhouAoSalvar(falha);
    return false;
  }
  if (sessao !== edicao.sessao) return true;
  edicao.versao = resposta.nota.versao;
  edicao.salvo = enviado;
  edicao.tentativas = 0;
  depoisDeSalvar(enviado, resposta.nota);
  mostrarSituacao(temMudanca() ? "" : "salvo");
  return true;
}

// O conflito abre o diálogo; a nota apagada para de salvar; o resto tenta de novo, até 3 vezes
function falhouAoSalvar(falha) {
  if (falha.codigo === "conflito" && falha.extra?.nota) return abrirConflito(falha.extra.nota);
  if (falha.codigo === "nao-encontrado") return mostrarSituacao("apagada");
  if (edicao.tentativas < CONFIG.novasTentativas.length) {
    const espera = CONFIG.novasTentativas[edicao.tentativas];
    edicao.tentativas += 1;
    mostrarSituacao("tentando", falha.message);
    clearTimeout(edicao.temporizador);
    edicao.temporizador = setTimeout(() => salvar(), espera);
    return;
  }
  mostrarSituacao("erro", falha.message);
}

// O que o servidor ficou tendo vai para a nota aberta; o título novo, também para a lateral e a aba
function depoisDeSalvar(enviado, { versao, alteradaEm }) {
  const titulo = tituloLimpo(enviado.titulo);
  const lida = navegacao.lida;
  if (lida?.nota.id === edicao.id) {
    const mudouTitulo = lida.nota.titulo !== titulo;
    if (versao !== lida.nota.versao) lida.nota.alteradaPor = { usuario: estado.conta.usuario, nome: estado.conta.nome };
    Object.assign(lida.nota, { titulo, texto: enviado.texto, versao, alteradaEm });
    if (mudouTitulo) trocarTituloNaLateral(lida.nota.id, titulo);
  }
  document.title = titulo;
}

function trocarTituloNaLateral(id, titulo) {
  const dados = estado.dados;
  if (!dados || ehAdmin()) return;
  for (const arvore of [dados.caderno, ...dados.compartilhadas.map((secao) => secao.caderno)]) {
    for (const nota of arvore.notas) if (nota.id === id) nota.titulo = titulo;
  }
  for (const fixada of dados.fixadas) if (fixada.id === id) fixada.titulo = titulo;
  renderizarLateral();
}

// Antes de sair da nota em edição (outra nota, nenhuma, a leitura): espera as imagens e salva o que
// falta. Se não salvar, pergunta. Devolve false quando a pessoa prefere continuar na nota.
function deixarEdicao() {
  if (!emEdicao()) return Promise.resolve(true);
  if (!edicao.saindo) {
    const sessao = edicao.sessao;
    const saida = (async () => {
      if (edicao.envios) await edicao.envios;
      let salvou = await salvar({ agora: true });
      if (!salvou && edicao.conflito) salvou = await edicao.conflito;
      if (sessao !== edicao.sessao || salvou || !temMudanca()) return true;
      const motivo =
        edicao.situacao === "apagada"
          ? "Esta nota não existe mais."
          : edicao.situacao === "conflito"
            ? "Esta nota mudou enquanto você escrevia."
            : `Não salvou: ${semPontoFinal(minuscula(edicao.motivo))}.`;
      return perguntar({
        titulo: "Sair sem salvar?",
        texto: `${motivo} Saindo agora, o que não foi salvo se perde.`,
        confirmar: "Sair sem salvar",
        cancelar: "Continuar na nota",
        perigo: true,
      });
    })();
    edicao.saindo = saida;
    saida.finally(() => {
      if (edicao.saindo === saida) edicao.saindo = null;
    });
  }
  return edicao.saindo;
}

// "Ler" (ou Ctrl+E de novo): salva o que falta e volta para a leitura, já com o que foi escrito.
// A nota é pedida de novo logo depois, para os links, as embutidas e as imagens novas.
async function lerDeNovo() {
  if (!emEdicao()) return;
  const sessao = edicao.sessao;
  const focoNaNota = $("#area-nota").contains(document.activeElement);
  if (!(await deixarEdicao()) || sessao !== edicao.sessao) return;
  const lida = navegacao.lida;
  Object.assign(lida.nota, { titulo: tituloLimpo(edicao.salvo.titulo), texto: edicao.salvo.texto, versao: edicao.versao });
  Object.assign(lida.imagens, edicao.imagens);
  encerrarEdicao();
  renderizarNota(lida, { manterRolagem: true });
  if (focoNaNota) $("#area-nota .nota__alternar")?.focus({ preventScroll: true });
  atualizarNotaAberta();
  atualizarLateral();
}

/* ---------- O conflito ---------- */

// "Esta nota mudou enquanto você escrevia (Takezo, às 14:32)."
function abrirConflito(nova) {
  edicao.versaoNova = nova;
  mostrarSituacao("conflito");
  const quem = nova.alteradaPor ? (ehMinha(nova.alteradaPor) ? "você" : nova.alteradaPor.nome) : "";
  const quando = nova.alteradaEm ? new Date(nova.alteradaEm) : null;
  const hora = quando && !Number.isNaN(quando.getTime()) ? `às ${FORMATO_DA_HORA.format(quando)}` : "";
  const detalhe = [quem, hora].filter(Boolean).join(", ");
  $("#conflito-texto").textContent = `Esta nota mudou enquanto você escrevia${detalhe ? ` (${detalhe})` : ""}.`;
  const dialogo = $("#dialogo-conflito");
  if (dialogo.open) return;
  const sessao = edicao.sessao;
  dialogo.returnValue = "";
  dialogo.showModal();
  edicao.conflito = new Promise((resolver) => {
    dialogo.addEventListener("close", () => resolver(resolverConflito(dialogo.returnValue, sessao)), { once: true });
  });
}

// "nova": o texto e o título do servidor entram no lugar dos da tela. "minha": salva por cima, com a
// versão nova. Fechado sem escolher, fica o "Não salvou…" e a próxima mudança tenta de novo.
async function resolverConflito(escolha, sessao) {
  const nova = edicao.versaoNova;
  edicao.conflito = null;
  edicao.versaoNova = null;
  if (sessao !== edicao.sessao || !nova || !campoDoTexto()) return false;
  if (escolha === "nova") {
    campoDoTitulo().value = nova.titulo;
    campoDoTexto().value = nova.texto;
    ajustarAltura();
    edicao.versao = nova.versao;
    edicao.salvo = { titulo: nova.titulo, texto: nova.texto };
    const lida = navegacao.lida;
    if (lida?.nota.id === edicao.id) {
      const mudouTitulo = lida.nota.titulo !== nova.titulo;
      Object.assign(lida.nota, { titulo: nova.titulo, texto: nova.texto, versao: nova.versao, alteradaEm: nova.alteradaEm, alteradaPor: nova.alteradaPor });
      if (mudouTitulo) trocarTituloNaLateral(lida.nota.id, nova.titulo);
    }
    document.title = nova.titulo;
    mostrarSituacao("salvo");
    return true;
  }
  if (escolha === "minha") {
    edicao.versao = nova.versao;
    mostrarSituacao("");
    return salvar({ agora: true });
  }
  return false;
}

function configurarConflito() {
  const dialogo = $("#dialogo-conflito");
  // Só sai escolhendo uma das duas
  dialogo.addEventListener("cancel", (evento) => evento.preventDefault());
}

/* ---------- A barra de botões ---------- */

const TABELA_NOVA = "| Coluna 1 | Coluna 2 |\n| --- | --- |\n|  |  |\n|  |  |";

// Cada botão age na área de texto. O clique não tira o foco dela (o mousedown fica parado), e as setas
// andam entre os botões, como numa barra de ferramentas.
function barraDeFerramentas() {
  const barra = criar("div", "ferramentas");
  barra.setAttribute("role", "toolbar");
  barra.setAttribute("aria-label", "Marcas do texto");
  barra.setAttribute("aria-controls", "campo-texto");

  const ferramenta = (rotulo, desenho, acao, { classe = "", menu: abreMenu = false } = {}) => {
    const botaoDaFerramenta = criar("button", classe ? `ferramenta ${classe}` : "ferramenta");
    botaoDaFerramenta.type = "button";
    botaoDaFerramenta.title = rotulo;
    botaoDaFerramenta.tabIndex = -1;
    botaoDaFerramenta.setAttribute("aria-label", rotulo);
    if (desenho.startsWith("icone-")) botaoDaFerramenta.append(simbolo(desenho, "ferramenta__icone"));
    else {
      const letra = criar("span", "ferramenta__letra", desenho);
      letra.setAttribute("aria-hidden", "true");
      botaoDaFerramenta.append(letra);
    }
    if (abreMenu) {
      botaoDaFerramenta.setAttribute("aria-haspopup", "menu");
      botaoDaFerramenta.setAttribute("aria-expanded", "false");
    }
    botaoDaFerramenta.addEventListener("mousedown", (evento) => evento.preventDefault());
    botaoDaFerramenta.addEventListener("click", () => {
      const area = campoDoTexto();
      if (area) acao(area, botaoDaFerramenta);
    });
    return botaoDaFerramenta;
  };
  const grupo = (...botoes) => {
    const caixa = criar("span", "ferramentas__grupo");
    caixa.append(...botoes);
    return caixa;
  };
  const nasLinhas = (tipo) => (area) => aplicarTroca(area, trocaDeLinhas(area.value, area.selectionStart, area.selectionEnd, tipo));
  const bloco = (texto, selecionar) => (area) =>
    aplicarTroca(area, trocaDeBloco(area.value, area.selectionStart, area.selectionEnd, texto, { emVolta: true, selecionar }));

  barra.append(
    grupo(
      ferramenta("Negrito (Ctrl+B)", "N", (area) => envolver(area, "**"), { classe: "ferramenta--negrito" }),
      ferramenta("Itálico (Ctrl+I)", "I", (area) => envolver(area, "*"), { classe: "ferramenta--italico" }),
      ferramenta("Riscado", "abc", (area) => envolver(area, "~~"), { classe: "ferramenta--riscado" }),
      ferramenta("Título", "icone-titulo", abrirMenuDeTitulo, { menu: true }),
    ),
    grupo(
      ferramenta("Lista", "icone-lista", nasLinhas("lista")),
      ferramenta("Lista numerada", "icone-numerada", nasLinhas("numerada")),
      ferramenta("Tarefa", "icone-tarefa", nasLinhas("tarefa")),
      ferramenta("Citação", "icone-citacao", nasLinhas("citacao")),
    ),
    grupo(ferramenta("Tabela", "icone-tabela", bloco(TABELA_NOVA, [2, 10])), ferramenta("Separador", "icone-separador", bloco("---"))),
    grupo(
      ferramenta("Imagem", "icone-imagem", () => $("#campo-imagens").click()),
      ferramenta("Link", "icone-elo", (area) => abrirCitar(area)),
      ferramenta("Embutir nota", "icone-embutir", (area) => abrirCitar(area, { soNotas: true, embutir: true })),
    ),
  );
  barra.querySelector(".ferramenta").tabIndex = 0;

  barra.addEventListener("keydown", (evento) => {
    const botoes = [...barra.querySelectorAll(".ferramenta")];
    const i = botoes.indexOf(document.activeElement);
    if (i < 0) return;
    const destinos = { ArrowRight: (i + 1) % botoes.length, ArrowLeft: (i - 1 + botoes.length) % botoes.length, Home: 0, End: botoes.length - 1 };
    if (!Object.hasOwn(destinos, evento.key)) return;
    evento.preventDefault();
    botoes[i].tabIndex = -1;
    botoes[destinos[evento.key]].tabIndex = 0;
    botoes[destinos[evento.key]].focus();
  });
  return barra;
}

const envolver = (area, marca) => aplicarTroca(area, trocaDeEnvolver(area.value, area.selectionStart, area.selectionEnd, marca));

function abrirMenuDeTitulo(area, botaoDoTitulo) {
  if (menu.botao === botaoDoTitulo) return fecharMenu();
  const opcao = (nivel, texto) => ({
    texto,
    acao: () => aplicarTroca(area, trocaDeTitulo(area.value, area.selectionStart, area.selectionEnd, nivel)),
  });
  abrirMenu(botaoDoTitulo, [opcao(1, "Título 1"), opcao(2, "Título 2"), opcao(3, "Título 3"), opcao(0, "Texto")], { rotulo: "Título" });
}

/* ---------- As trocas no texto ----------
   Cada botão calcula uma troca: o pedaço [inicio, fim) do texto vira
   "novo", e a seleção fica em "selecao" (no texto novo). Essas contas
   não mexem na página; aplicarTroca() é que põe na área de texto. */

// Toda troca passa por aqui: com "insertText", o Ctrl+Z desfaz o que os botões fizeram; quando o
// navegador não aceita (ou a área não está com o foco), setRangeText e o aviso de mudança à mão
function aplicarTroca(area, troca, { foco = true } = {}) {
  let foi = false;
  if (foco) {
    area.focus({ preventScroll: true });
    area.setSelectionRange(troca.inicio, troca.fim);
    try {
      foi = document.execCommand("insertText", false, troca.novo);
    } catch {
      foi = false;
    }
  }
  if (!foi) {
    area.setRangeText(troca.novo, troca.inicio, troca.fim, "end");
    area.dispatchEvent(new Event("input", { bubbles: true }));
  }
  area.setSelectionRange(troca.selecao[0], troca.selecao[1]);
}

// O começo da primeira linha e o fim da última que a seleção toca (sem a linha em que ela só encosta)
function linhasDaSelecao(texto, inicio, fim) {
  const ultimo = fim > inicio && texto[fim - 1] === "\n" ? fim - 1 : fim;
  const de = inicio > 0 ? texto.lastIndexOf("\n", inicio - 1) + 1 : 0;
  const quebra = texto.indexOf("\n", Math.max(ultimo, de));
  return { de, ate: quebra < 0 ? texto.length : quebra };
}

// Numa linha que só mudou no começo, onde fica uma posição dela depois da troca
function mapaDaLinha(antiga, nova) {
  let comum = 0;
  while (comum < antiga.length && comum < nova.length && antiga[antiga.length - 1 - comum] === nova[nova.length - 1 - comum]) comum++;
  const antes = antiga.length - comum;
  const depois = nova.length - comum;
  return (posicao) => (posicao < antes ? depois : posicao - antes + depois);
}

// As linhas trocadas: numa linha só, a seleção acompanha o texto; em várias, fica o bloco todo
function trocaDasLinhas(inicio, fim, de, ate, linhas, novas) {
  const novo = novas.join("\n");
  if (linhas.length === 1) {
    const mapa = mapaDaLinha(linhas[0], novas[0]);
    return { inicio: de, fim: ate, novo, selecao: [de + mapa(inicio - de), de + mapa(fim - de)] };
  }
  return { inicio: de, fim: ate, novo, selecao: [de, de + novo.length] };
}

// O começo de uma linha antes do texto: o recuo, as citações, o "#" do título e a marca de item
const REGEX_COMECO = /^[ \t]*(?:>[ \t]?)*[ \t]*(?:#+[ \t]+|(?:[-*]|\d{1,9}\.)[ \t]+(?:\[[ xX]\](?:[ \t]+|$))?)?/;

// Negrito, itálico e riscado: as marcas em volta da seleção, linha por linha, deixando de fora os
// espaços das pontas e o começo da linha. Sem seleção, as duas marcas com o cursor no meio.
function trocaDeEnvolver(texto, inicio, fim, marca) {
  if (inicio === fim) return { inicio, fim, novo: marca + marca, selecao: [inicio + marca.length, inicio + marca.length] };
  const pedacos = texto.slice(inicio, fim).split("\n");
  let dentro = null; // numa linha só: onde ficou o texto envolvido, para continuar selecionado
  const novos = pedacos.map((pedaco, i) => {
    const doComeco = i > 0 || inicio === 0 || texto[inicio - 1] === "\n";
    const comeco = doComeco ? REGEX_COMECO.exec(pedaco)[0] : "";
    const [, espacoAntes, meio, espacoDepois] = /^(\s*)(.*?)(\s*)$/.exec(pedaco.slice(comeco.length));
    if (!meio) return pedaco;
    const antes = comeco + espacoAntes + marca;
    if (pedacos.length === 1) dentro = [inicio + antes.length, inicio + antes.length + meio.length];
    return antes + meio + marca + espacoDepois;
  });
  const novo = novos.join("\n");
  return { inicio, fim, novo, selecao: dentro ?? [inicio, inicio + novo.length] };
}

// Lista, lista numerada e tarefa no começo de uma linha (também dentro de "> ")
const REGEX_ITEM = /^((?:[ \t]*>[ \t]?)*)([ \t]*)(?:([-*])[ \t]+(\[[ xX]\](?:[ \t]+|$))?|(\d{1,9})\.[ \t]+)?/;

function lerItem(linha) {
  const achado = REGEX_ITEM.exec(linha);
  const tipo = achado[4] ? "tarefa" : achado[3] ? "lista" : achado[5] ? "numerada" : null;
  return { citacoes: achado[1], recuo: achado[2], tipo, resto: linha.slice(achado[0].length) };
}

// Lista, Lista numerada, Tarefa e Citação: se todas as linhas já têm a marca, ela sai; senão, entra
// (no lugar de outra marca de lista). A numerada conta 1., 2., 3.; o recuo fica.
function trocaDeLinhas(texto, inicio, fim, tipo) {
  const { de, ate } = linhasDaSelecao(texto, inicio, fim);
  const linhas = texto.slice(de, ate).split("\n");
  const cheias = linhas.filter((linha) => linha.trim());
  let novas;
  if (tipo === "citacao") {
    const tira = cheias.length > 0 && cheias.every((linha) => /^[ \t]*>/.test(linha));
    novas = linhas.map((linha) => {
      if (tira) return linha.replace(/^[ \t]*>[ \t]?/, "");
      if (!cheias.length) return `> ${linha}`;
      return linha.trim() ? `> ${linha}` : ">";
    });
  } else {
    const tira = cheias.length > 0 && cheias.every((linha) => lerItem(linha).tipo === tipo);
    let numero = 0;
    novas = linhas.map((linha) => {
      if (cheias.length && !linha.trim()) return linha;
      const item = lerItem(linha);
      if (tira) return item.citacoes + item.recuo + item.resto;
      if (tipo === "tarefa" && item.tipo === "tarefa") return linha; // a feita continua feita
      numero += 1;
      const marca = tipo === "lista" ? "- " : tipo === "tarefa" ? "- [ ] " : `${numero}. `;
      return item.citacoes + item.recuo + marca + item.resto;
    });
  }
  return trocaDasLinhas(inicio, fim, de, ate, linhas, novas);
}

// Título 1, 2 ou 3 (nível 0: "Texto") no começo das linhas
function trocaDeTitulo(texto, inicio, fim, nivel) {
  const { de, ate } = linhasDaSelecao(texto, inicio, fim);
  const linhas = texto.slice(de, ate).split("\n");
  const cheias = linhas.filter((linha) => linha.trim());
  const novas = linhas.map((linha) => {
    if (cheias.length && !linha.trim()) return linha;
    const resto = linha.replace(/^[ \t]*(?:#+[ \t]+)?/, "");
    return nivel ? `${"#".repeat(nivel)} ${resto}` : resto;
  });
  return trocaDasLinhas(inicio, fim, de, ate, linhas, novas);
}

// Um bloco numa linha só dele (a tabela, o separador, a nota embutida, a imagem), com uma linha em
// branco em volta quando "emVolta". "selecionar": o pedaço do bloco que fica selecionado; sem ele,
// o cursor fica logo depois.
function trocaDeBloco(texto, inicio, fim, bloco, { emVolta = false, selecionar = null } = {}) {
  const antes = texto.slice(0, inicio);
  const depois = texto.slice(fim);
  let prefixo = antes && !antes.endsWith("\n") ? "\n" : "";
  if (emVolta && antes.trim() && !(antes + prefixo).endsWith("\n\n")) prefixo += "\n";
  let sufixo = depois.startsWith("\n") ? "" : "\n";
  if (emVolta && !(sufixo + depois).startsWith("\n\n")) sufixo += "\n";
  const novo = prefixo + bloco + sufixo;
  const comeco = inicio + prefixo.length;
  const selecao = selecionar ? [comeco + selecionar[0], comeco + selecionar[1]] : [inicio + novo.length, inicio + novo.length];
  return { inicio, fim, novo, selecao };
}

// Enter num item de lista: o próximo item com a mesma marca ("- ", o próximo número, "- [ ] ").
// Num item vazio, a marca sai e a lista termina. null: o Enter de sempre.
const REGEX_MARCA_DE_ITEM = /^((?:[ \t]*>[ \t]?)*)([ \t]*)(?:([-*])([ \t]+)(\[[ xX]\](?:[ \t]+|$))?|(\d{1,9})\.([ \t]+))/;

function trocaDoEnter(texto, inicio, fim) {
  if (inicio !== fim) return null;
  const de = inicio > 0 ? texto.lastIndexOf("\n", inicio - 1) + 1 : 0;
  const quebra = texto.indexOf("\n", inicio);
  const ate = quebra < 0 ? texto.length : quebra;
  const linha = texto.slice(de, ate);
  const achado = REGEX_MARCA_DE_ITEM.exec(linha);
  if (!achado || inicio - de < achado[0].length) return null;
  const [inteira, citacoes, recuo, traco, espaco, caixinha, numero, espacoDoNumero] = achado;
  if (!linha.slice(inteira.length).trim()) {
    return { inicio: de, fim: ate, novo: citacoes, selecao: [de + citacoes.length, de + citacoes.length] };
  }
  const marca = numero !== undefined ? `${Number(numero) + 1}.${espacoDoNumero}` : `${traco}${espaco}${caixinha ? "[ ] " : ""}`;
  const novo = `\n${citacoes}${recuo}${marca}`;
  return { inicio, fim, novo, selecao: [inicio + novo.length, inicio + novo.length] };
}

// Na área de texto: Ctrl+B, Ctrl+I e o Enter nas listas
function teclaNoTexto(evento) {
  const area = evento.target;
  const comando = (evento.ctrlKey || evento.metaKey) && !evento.altKey && !evento.shiftKey;
  const tecla = evento.key.toLowerCase();
  if (comando && (tecla === "b" || tecla === "i")) {
    evento.preventDefault();
    envolver(area, tecla === "b" ? "**" : "*");
    return;
  }
  if (evento.key !== "Enter" || evento.shiftKey || evento.ctrlKey || evento.metaKey || evento.altKey || evento.isComposing) return;
  const troca = trocaDoEnter(area.value, area.selectionStart, area.selectionEnd);
  if (!troca) return;
  evento.preventDefault();
  aplicarTroca(area, troca);
}

// Digitar [[ abre o Citar; ![[, o Citar só com as notas, para embutir
function aoDigitarColchete(area, evento) {
  if (evento.inputType !== "insertText" || evento.data !== "[") return;
  const posicao = area.selectionStart;
  if (posicao !== area.selectionEnd || area.value.slice(posicao - 2, posicao) !== "[[") return;
  const antes = area.value[posicao - 3];
  if (antes === "[" || antes === "\\") return;
  const embutir = antes === "!";
  abrirCitar(area, { inicio: posicao - (embutir ? 3 : 2), fim: posicao, soNotas: embutir, embutir, digitado: true });
}

/* =================================================================
   Citar: links e notas embutidas
   -----------------------------------------------------------------
   O diálogo das Memórias, com os grupos Notas, Personagens,
   Acontecimentos, Mesas, Memórias e Lugares. Escolher um põe
   [[tipo:<id>|nome]] onde estava o cursor; o "o que aparece" pode
   ser mudado depois, no próprio texto. Aberto por [[ ou ![[
   digitados, escolher troca o que foi digitado pelo código inteiro.
   ================================================================= */

const citacao = {
  area: null, // a área de texto que recebe o link
  inicio: 0, // o pedaço do texto que o link substitui (a seleção, ou o [[ digitado)
  fim: 0,
  soNotas: false, // só as notas, para embutir
  embutir: false, // o código fica ![[nota:…]]
  digitado: false, // aberto pelo [[ ou ![[ digitado
  escolhido: false,
};

function abrirCitar(area, { inicio = area.selectionStart, fim = area.selectionEnd, soNotas = false, embutir = false, digitado = false } = {}) {
  Object.assign(citacao, { area, inicio, fim, soNotas, embutir, digitado, escolhido: false });
  $("#citar-titulo").textContent = embutir ? "Embutir nota" : "Citar";
  $("#citar-rotulo").textContent = soNotas ? "Buscar uma nota" : "Buscar uma nota, personagem, acontecimento, mesa, memória ou lugar";
  const busca = $("#citar-busca");
  busca.value = "";
  renderizarCitaveis();
  $("#dialogo-citar").showModal();
  $("#citar-resultados").scrollTop = 0;
  busca.focus();
  carregarCitaveis();
}

// A lista é pedida de novo cada vez (as notas mudam); enquanto isso, fica a da última vez
async function carregarCitaveis() {
  try {
    estado.citaveis = await api.citaveis();
  } catch (falha) {
    if (!estado.citaveis && $("#dialogo-citar").open) $("#citar-resultados").replaceChildren(criar("p", "citar__vazio", falha.message));
    return;
  }
  if ($("#dialogo-citar").open) renderizarCitaveis();
}

function itemCitavel(nome, extra, codigo) {
  const item = criar("button", "citar__item");
  item.type = "button";
  item.append(criar("span", "citar__nome", nome));
  if (extra) item.append(criar("span", "citar__extra", extra));
  item.addEventListener("click", () => inserirCitacao(codigo));
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

// O "o que aparece" do link: numa linha, sem colchetes, sem barra invertida no fim e no máximo 120 caracteres
const textoDoLink = (texto) =>
  semColchetes(texto).replace(/\s+/g, " ").trim().slice(0, LIMITES.link).replace(/\\+$/, "").trim() || "…";

// Sem acentos e sem diferença de maiúsculas
function renderizarCitaveis() {
  const resultados = $("#citar-resultados");
  const focoNaLista = resultados.contains(document.activeElement);
  const citaveis = estado.citaveis;
  if (!citaveis) {
    resultados.replaceChildren(criar("p", "citar__vazio", "Carregando…"));
    return;
  }
  const termo = normalizar($("#citar-busca").value.trim());
  const achou = (...textos) => !termo || textos.some((texto) => normalizar(texto).includes(termo));
  const link = (tipo, id, texto) => `[[${tipo}:${id}|${textoDoLink(texto)}]]`;

  const notas = citaveis.notas
    .filter((n) => n.id !== edicao.id && achou(n.titulo))
    .map((n) => {
      const onde = [n.caminho.map((p) => p.nome).join(" › "), ehMinha(n.dono) ? "" : `de ${n.dono.nome}`].filter(Boolean).join(" · ");
      return itemCitavel(n.titulo, onde, `${citacao.soNotas ? "!" : ""}${link("nota", n.id, n.titulo)}`);
    });
  const grupos = [["Notas", notas]];
  if (!citacao.soNotas) {
    grupos.push(
      ["Personagens", citaveis.personagens.filter((p) => achou(p.nome)).map((p) => itemCitavel(p.nome, "", link("personagem", p.id, p.nome)))],
      [
        "Acontecimentos",
        citaveis.acontecimentos
          .filter((ev) => achou(ev.titulo))
          .map((ev) => itemCitavel(ev.titulo, Number.isFinite(ev.ano) ? `${ev.ano} ED` : "", link("evento", ev.id, ev.titulo))),
      ],
      ["Mesas", citaveis.mesas.filter((m) => achou(m.nome)).map((m) => itemCitavel(m.nome, "", link("mesa", m.id, m.nome)))],
      ["Memórias", citaveis.memorias.filter((m) => achou(m.titulo)).map((m) => itemCitavel(m.titulo, "", link("memoria", m.id, m.titulo)))],
      ["Lugares", citaveis.lugares.filter((l) => achou(l.nome, l.mapa)).map((l) => itemCitavel(l.nome, l.mapa, link("lugar", l.id, l.nome)))],
    );
  }

  const blocos = grupos.flatMap(([titulo, itens]) => grupoCitavel(titulo, itens));
  if (blocos.length) resultados.replaceChildren(...blocos);
  else {
    const nada = termo ? "Nada encontrado." : citacao.soNotas ? "Nenhuma outra nota para embutir ainda." : "Nada para citar ainda.";
    resultados.replaceChildren(criar("p", "citar__vazio", nada));
  }
  if (focoNaLista) $("#citar-busca").focus();
}

// O link entra onde estava o cursor (ou no lugar do que estava selecionado, ou do [[ digitado), e o
// cursor fica depois dele. A nota embutida pelo botão entra numa linha só dela.
function inserirCitacao(codigo) {
  const { area, inicio, fim, embutir, digitado } = citacao;
  citacao.escolhido = true;
  $("#dialogo-citar").close();
  if (!area?.isConnected) return;
  const troca =
    embutir && !digitado
      ? trocaDeBloco(area.value, inicio, fim, codigo)
      : { inicio, fim, novo: codigo, selecao: [inicio + codigo.length, inicio + codigo.length] };
  aplicarTroca(area, troca);
}

function configurarCitar() {
  const dialogo = $("#dialogo-citar");
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
  $("#citar-cancelar").addEventListener("click", () => dialogo.close());
  fecharAoClicarFora(dialogo);
  // Esc e Cancelar: o que foi digitado fica, e o cursor volta para onde estava
  dialogo.addEventListener("close", () => {
    const { area, inicio, fim, digitado, escolhido } = citacao;
    citacao.area = null;
    if (escolhido || !area?.isConnected) return;
    area.focus({ preventScroll: true });
    area.setSelectionRange(digitado ? fim : inicio, fim);
  });
}

/* =================================================================
   Imagens: pelo botão, por colar e por arrastar
   -----------------------------------------------------------------
   Cada uma é enviada (uma por vez, na ordem) para o caderno da nota
   em edição e entra numa linha só dela onde está o cursor, como
   ![[imagem:<id>|legenda]], com o nome do arquivo de legenda.
   ================================================================= */

function conferirImagem(arquivo) {
  if (!TIPOS_DE_IMAGEM.includes(arquivo.type)) throw new Error("Use imagens PNG, JPG, WEBP, GIF ou AVIF.");
  if (arquivo.size > LIMITES.imagem) throw new Error(`Cada imagem pode ter no máximo ${emBytes(LIMITES.imagem)}.`);
}

function enviarImagens(arquivos) {
  const lista = [...arquivos];
  if (!lista.length || !emEdicao()) return;
  const sessao = edicao.sessao;
  edicao.enviando += lista.length;
  mostrarSituacao(edicao.situacao, edicao.motivo);
  avisoRapido(lista.length === 1 ? "Enviando imagem…" : `Enviando ${lista.length} imagens…`);
  const envios = (edicao.envios ?? Promise.resolve()).then(async () => {
    for (const arquivo of lista) await enviarUmaImagem(arquivo, sessao);
  });
  edicao.envios = envios;
  envios.finally(() => {
    if (edicao.envios === envios) edicao.envios = null;
  });
}

async function enviarUmaImagem(arquivo, sessao) {
  if (sessao !== edicao.sessao) return;
  let imagem = null;
  let falha = null;
  try {
    conferirImagem(arquivo);
    ({ imagem } = await api.enviarImagem(edicao.id, arquivo));
  } catch (erro) {
    falha = erro;
  }
  if (sessao !== edicao.sessao) return;
  edicao.enviando = Math.max(0, edicao.enviando - 1);
  if (imagem) {
    edicao.imagens[imagem.id] = imagem.endereco;
    if (navegacao.lida?.nota.id === edicao.id) navegacao.lida.imagens[imagem.id] = imagem.endereco;
    porImagemNoTexto(imagem.id, arquivo.name || "");
  }
  mostrarSituacao(edicao.situacao, edicao.motivo);
  if (falha) await avisarFalha(falha);
}

// A legenda começa com o nome do arquivo sem a extensão. Se a área não está com o foco, a imagem entra
// do mesmo jeito, sem tirar o foco de onde a pessoa está.
function porImagemNoTexto(id, nomeOriginal) {
  const area = campoDoTexto();
  if (!area) return;
  const legenda = textoDoLink(nomeOriginal.replace(/\.[^.]*$/, "")).replace(/^…$/, "");
  const codigo = legenda ? `![[imagem:${id}|${legenda}]]` : `![[imagem:${id}]]`;
  const posicao = area.selectionEnd;
  aplicarTroca(area, trocaDeBloco(area.value, posicao, posicao, codigo), { foco: document.activeElement === area });
}

// Colar: só quando a área de transferência tem imagens e nenhum texto junto
function aoColar(evento) {
  const dados = evento.clipboardData;
  const imagens = [...(dados?.files ?? [])].filter((arquivo) => arquivo.type.startsWith("image/"));
  if (!imagens.length || dados.getData("text/plain")) return;
  evento.preventDefault();
  enviarImagens(imagens);
}

const levaArquivos = (evento) => emEdicao() && Array.from(evento.dataTransfer?.types ?? []).includes("Files");

/* =================================================================
   O menu: o "⋯" dos itens da árvore e da nota, e o botão Título
   -----------------------------------------------------------------
   Um elemento só (#menu), aberto junto do botão. As setas andam,
   Home e End vão às pontas; Esc e Tab fecham e devolvem o foco; o
   clique fora fecha.
   ================================================================= */

const menu = { botao: null, devolver: null }; // o botão que abriu e quem recebe o foco ao fechar

function abrirMenu(ancora, opcoes, { rotulo, devolver = ancora } = {}) {
  fecharMenu({ devolverFoco: false });
  if (!opcoes.length) return;
  const caixa = $("#menu");
  caixa.replaceChildren(
    ...opcoes.map((opcao) => {
      const item = criar("button", opcao.perigo ? "menu__item menu__item--perigo" : "menu__item", opcao.texto);
      item.type = "button";
      item.tabIndex = -1;
      item.setAttribute("role", "menuitem");
      item.addEventListener("click", () => {
        fecharMenu();
        opcao.acao();
      });
      return item;
    }),
  );
  caixa.setAttribute("aria-label", rotulo);
  caixa.hidden = false;
  // Embaixo do botão; sem espaço, em cima. Sempre dentro da tela.
  const lugar = ancora.getBoundingClientRect();
  const x = Math.max(8, Math.min(lugar.left, window.innerWidth - caixa.offsetWidth - 8));
  let y = lugar.bottom + 4;
  if (y + caixa.offsetHeight > window.innerHeight - 8) y = Math.max(8, lugar.top - caixa.offsetHeight - 4);
  caixa.style.setProperty("left", `${Math.round(x)}px`);
  caixa.style.setProperty("top", `${Math.round(y)}px`);
  menu.botao = ancora;
  menu.devolver = devolver;
  if (ancora.hasAttribute("aria-haspopup")) ancora.setAttribute("aria-expanded", "true");
  caixa.querySelector(".menu__item").focus();
}

function fecharMenu({ devolverFoco = true } = {}) {
  const caixa = $("#menu");
  if (caixa.hidden) return;
  const { botao: ancora, devolver } = menu;
  menu.botao = null;
  menu.devolver = null;
  caixa.hidden = true;
  caixa.replaceChildren();
  if (ancora?.hasAttribute("aria-haspopup")) ancora.setAttribute("aria-expanded", "false");
  if (devolverFoco && devolver?.isConnected) devolver.focus({ preventScroll: true });
}

function configurarMenu() {
  const caixa = $("#menu");
  caixa.addEventListener("keydown", (evento) => {
    const itens = [...caixa.querySelectorAll(".menu__item")];
    const i = itens.indexOf(document.activeElement);
    let destino = null;
    if (evento.key === "ArrowDown") destino = itens[(i + 1) % itens.length];
    else if (evento.key === "ArrowUp") destino = itens[(i - 1 + itens.length) % itens.length];
    else if (evento.key === "Home") destino = itens[0];
    else if (evento.key === "End") destino = itens[itens.length - 1];
    else if (evento.key === "Escape" || evento.key === "Tab") {
      evento.preventDefault();
      evento.stopPropagation();
      fecharMenu();
      return;
    } else return;
    evento.preventDefault();
    destino?.focus();
  });
  document.addEventListener("pointerdown", (evento) => {
    if (caixa.hidden || caixa.contains(evento.target) || menu.botao?.contains(evento.target)) return;
    fecharMenu({ devolverFoco: false });
  });
}

/* =================================================================
   O que se faz com as notas e as pastas
   -----------------------------------------------------------------
   As opções do "⋯" (da árvore e da barra da nota), cada uma só
   para quem pode: a dona faz tudo; quem pode editar cria nas pastas,
   renomeia e fixa; quem pode ver fixa; o administrador só baixa e
   copia o link.
   ================================================================= */

// "nivel": "dona", "editar", "ver" ou "admin". "naBarra": o "⋯" da barra da nota aberta.
function opcoesDe({ tipo, id, nivel, naBarra = false }) {
  const dona = nivel === "dona";
  const altera = dona || nivel === "editar";
  const opcoes = [];
  const opcao = (texto, acao, perigo = false) => opcoes.push({ texto, acao, perigo });
  if (tipo === "pasta" && altera) {
    opcao("Nova nota aqui", () => criarNota(id));
    opcao("Nova pasta aqui", () => criarPasta(id));
  }
  if (altera) opcao("Renomear", () => (naBarra ? renomearNaBarra() : comecarRenomear(tipo, id)));
  if (dona) opcao("Mover para…", () => abrirMover(tipo, id));
  if (dona) opcao("Compartilhar…", emBreve("Compartilhar"));
  if (tipo === "nota" && temCaderno()) {
    const fixada = estado.dados.fixadas.some((f) => f.id === id);
    opcao(fixada ? "Desafixar" : "Fixar", () => fixar(id, !fixada));
  }
  if (tipo === "nota") {
    opcao("Baixar .md", () => baixarMd(id));
    opcao("Copiar link", () => copiarLink(id));
  }
  if (dona) opcao("Apagar", () => apagar(tipo, id), true);
  return opcoes;
}

// Sem nenhuma opção (as pastas do administrador e as só para ver), o item fica sem "⋯"
const temOpcoes = (tipo, nivel) => tipo === "nota" || nivel === "dona" || nivel === "editar";

// Depois de criar, mover, renomear, apagar ou fixar: o caderno de novo, e o foco de volta no item
async function atualizarLateral({ foco = null } = {}) {
  try {
    if (!ehAdmin()) estado.dados = await api.caderno();
    else if (estado.escolhida) estado.vista = await api.cadernoDaConta(estado.escolhida);
  } catch (falha) {
    avisoRapido(`A lateral não atualizou. ${falha.message}`);
    return;
  }
  renderizarLateral();
  if (foco) focarNaArvore(foco.tipo, foco.id);
}

// As árvores da lateral de quem tem caderno: a dele e as das seções "Compartilhadas por"
const arvoresDaLateral = () =>
  estado.dados && !ehAdmin() ? [estado.dados.caderno, ...estado.dados.compartilhadas.map((secao) => secao.caderno)] : [];

// Se a conta pode criar notas e pastas nessa pasta: as dela e as compartilhadas para editar
function podeCriarNa(id) {
  if (!id || !temCaderno()) return false;
  if (estado.dados.caderno.pastas.some((p) => p.id === id)) return true;
  return estado.dados.compartilhadas.some((secao) => secao.caderno.pastas.some((p) => p.id === id && p.nivel === "editar"));
}

// Onde "+ Nota" e "+ Pasta" criam: na pasta escolhida na árvore, senão na pasta da nota aberta, senão na raiz
function pastaParaCriar() {
  if (podeCriarNa(estado.pastaEscolhida)) return estado.pastaEscolhida;
  const pastaDaNota = navegacao.lida?.nota.pasta;
  return podeCriarNa(pastaDaNota) ? pastaDaNota : null;
}

// Abre na árvore a pasta e as de cima dela (ficam guardadas como as outras abertas)
function abrirPastas(id) {
  const pastas = new Map(arvoresDaLateral().flatMap((arvore) => arvore.pastas.map((p) => [p.id, p])));
  const vistas = new Set();
  for (let atual = id; atual && !vistas.has(atual); atual = pastas.get(atual)?.pasta) {
    vistas.add(atual);
    pastasAbertas.add(atual);
  }
  guardarPastas();
}

function itemNaArvore(tipo, id) {
  return [...document.querySelectorAll(`.arvore__item--${tipo}`)].find((item) => item.dataset.id === id) ?? null;
}

// Põe o foco no item, com as pastas acima dele abertas
function focarNaArvore(tipo, id) {
  const item = itemNaArvore(tipo, id);
  if (!item) return null;
  for (let pasta = item.parentElement.closest('[role="treeitem"]'); pasta; pasta = pasta.parentElement.closest('[role="treeitem"]')) {
    alternarPasta(pasta, true);
  }
  focarItem(item);
  return item;
}

/* ---------- Criar ---------- */

// "pasta": de "Nova nota aqui"; sem ela, a pasta escolhida (veja pastaParaCriar)
async function criarNota(pasta) {
  if (!temCaderno() || !(await deixarEdicao())) return;
  const onde = pasta === undefined ? pastaParaCriar() : pasta;
  let resposta;
  try {
    resposta = await api.criarNota({ titulo: "", pasta: onde });
  } catch (falha) {
    return avisarFalha(falha);
  }
  if (onde) abrirPastas(onde);
  await atualizarLateral();
  abrirNota(resposta.nota.id, { editar: "titulo" });
}

// A pasta nova nasce "Nova pasta", já com o nome para trocar ali mesmo, na árvore
async function criarPasta(pasta) {
  if (!temCaderno()) return;
  const onde = pasta === undefined ? pastaParaCriar() : pasta;
  let resposta;
  try {
    resposta = await api.criarPasta({ nome: "Nova pasta", pasta: onde });
  } catch (falha) {
    return avisarFalha(falha);
  }
  if (onde) abrirPastas(onde);
  estado.pastaEscolhida = resposta.pasta.id;
  await atualizarLateral();
  comecarRenomear("pasta", resposta.pasta.id);
}

/* ---------- Renomear ---------- */

// Na árvore, ali mesmo: Enter e clicar fora salvam, Esc desiste.
// A nota em edição se renomeia no campo do título.
function comecarRenomear(tipo, id) {
  if (tipo === "nota" && edicao.id === id && campoDoTitulo()) return renomearNaBarra();
  const item = focarNaArvore(tipo, id);
  const linha = item?.querySelector(":scope > .arvore__linha");
  const nome = linha?.querySelector(".arvore__nome");
  if (!nome) return;
  const antes = nome.textContent;
  const campo = criar("input", "arvore__renomear");
  campo.type = "text";
  campo.value = antes;
  campo.maxLength = tipo === "nota" ? LIMITES.titulo : LIMITES.nomePasta;
  campo.autocomplete = "off";
  campo.spellcheck = false;
  campo.setAttribute("aria-label", tipo === "nota" ? "Novo título da nota" : "Novo nome da pasta");
  const arrastavel = linha.draggable;
  linha.draggable = false;
  nome.replaceWith(campo);
  campo.focus();
  campo.select();

  let terminou = false;
  const terminar = async (salvarNome, { pelaTecla = false } = {}) => {
    if (terminou) return;
    terminou = true;
    const novo = numaLinha(campo.value);
    campo.replaceWith(nome);
    linha.draggable = arrastavel;
    if (pelaTecla) focarItem(item);
    if (!salvarNome || novo === antes || (tipo === "pasta" && !novo)) return;
    nome.textContent = novo || "Sem título";
    try {
      await renomear(tipo, id, novo);
    } catch (falha) {
      nome.textContent = antes;
      return avisarFalha(falha);
    }
    await atualizarLateral({ foco: pelaTecla ? { tipo, id } : null });
  };
  campo.addEventListener("keydown", (evento) => {
    if (evento.key === "Enter" && !evento.isComposing) {
      evento.preventDefault();
      terminar(true, { pelaTecla: true });
    } else if (evento.key === "Escape") {
      evento.preventDefault();
      evento.stopPropagation();
      terminar(false, { pelaTecla: true });
    }
  });
  campo.addEventListener("blur", () => terminar(true));
}

// O título da nota pede a versão de agora (tenta uma vez de novo, se ela mudar no meio)
async function renomear(tipo, id, nome) {
  if (tipo === "pasta") return api.alterarPasta(id, { nome });
  const aberta = navegacao.lida?.nota.id === id ? navegacao.lida : null;
  const versao = aberta ? aberta.nota.versao : (await api.nota(id)).nota.versao;
  try {
    await api.alterarNota(id, { titulo: nome, versao });
  } catch (falha) {
    if (falha.codigo !== "conflito" || !falha.extra?.nota) throw falha;
    await api.alterarNota(id, { titulo: nome, versao: falha.extra.nota.versao });
  }
  if (navegacao.id === id) atualizarNotaAberta();
}

// Na barra da nota: o título no campo da edição, selecionado
function renomearNaBarra() {
  if (!emEdicao()) return comecarEdicao("titulo");
  const campo = campoDoTitulo();
  campo?.focus();
  campo?.select();
}

/* ---------- Mover ---------- */

// As pastas acima de uma pasta, de dentro para fora (sem ela)
function idsAcima(id, pastas) {
  const acima = [];
  for (let atual = pastas.get(id)?.pasta; atual && pastas.has(atual) && !acima.includes(atual); atual = pastas.get(atual).pasta) {
    acima.push(atual);
  }
  return acima;
}

// Quantos níveis uma pasta ocupa: ela mesma e as que estão dentro dela
function alturaDaPasta(id, arvore, vistas = new Set()) {
  vistas.add(id);
  const filhas = arvore.pastas.filter((p) => p.pasta === id && !vistas.has(p.id));
  return 1 + Math.max(0, ...filhas.map((f) => alturaDaPasta(f.id, arvore, vistas)));
}

// Se a dona pode mover o item para a pasta (null: a raiz): não para onde ele já está, não uma pasta
// para dentro dela mesma, e sem passar dos 8 níveis
function podeIrPara(tipo, id, destino) {
  const arvore = temCaderno() ? estado.dados.caderno : null;
  const item = arvore && (tipo === "nota" ? arvore.notas : arvore.pastas).find((x) => x.id === id);
  if (!item) return false;
  const pastas = new Map(arvore.pastas.map((p) => [p.id, p]));
  if (destino !== null && !pastas.has(destino)) return false;
  const onde = item.pasta && pastas.has(item.pasta) ? item.pasta : null;
  if (onde === destino) return false;
  if (tipo === "nota") return true;
  const caminho = destino === null ? [] : [destino, ...idsAcima(destino, pastas)];
  if (caminho.includes(id)) return false;
  return caminho.length + alturaDaPasta(id, arvore) <= LIMITES.niveis;
}

// "Mover para…": a raiz e as pastas do caderno, com recuo. A de agora e as que não podem ficam desligadas.
function abrirMover(tipo, id) {
  const arvore = temCaderno() ? estado.dados.caderno : null;
  const item = arvore && (tipo === "nota" ? arvore.notas : arvore.pastas).find((x) => x.id === id);
  if (!item) return;
  const nome = tipo === "nota" ? item.titulo : item.nome;
  $("#mover-texto").textContent = tipo === "nota" ? `Para onde vai a nota "${nome}"?` : `Para onde vai a pasta "${nome}"?`;
  const ids = new Set(arvore.pastas.map((p) => p.id));
  const acimaDe = (p) => (p.pasta && ids.has(p.pasta) ? p.pasta : null);
  const ondeEsta = tipo === "nota" ? (item.pasta && ids.has(item.pasta) ? item.pasta : null) : acimaDe(item);
  const destinos = [];
  const destino = (pasta, rotulo, nivel) => {
    const opcao = criar("button", "mover__destino");
    opcao.type = "button";
    opcao.style.setProperty("--nivel", String(nivel));
    opcao.append(criar("span", "mover__nome", rotulo));
    if (pasta === ondeEsta) opcao.append(criar("span", "mover__aqui", "onde está"));
    opcao.disabled = !podeIrPara(tipo, id, pasta);
    opcao.addEventListener("click", () => {
      $("#dialogo-mover").close();
      mover(tipo, id, pasta);
    });
    const linha = criar("li");
    linha.append(opcao);
    destinos.push(linha);
  };
  destino(null, `Caderno de ${estado.conta.nome}`, 0);
  const vistas = new Set();
  const descer = (acima, nivel) => {
    const filhas = arvore.pastas.filter((p) => acimaDe(p) === acima).sort((a, b) => porNomeNatural(a.nome, b.nome));
    for (const pasta of filhas) {
      if (vistas.has(pasta.id)) continue;
      vistas.add(pasta.id);
      destino(pasta.id, pasta.nome, nivel);
      descer(pasta.id, nivel + 1);
    }
  };
  descer(null, 1);
  $("#mover-lista").replaceChildren(...destinos);
  $("#dialogo-mover").showModal();
  $("#mover-lista .mover__destino:not(:disabled)")?.focus();
}

async function mover(tipo, id, pasta) {
  try {
    if (tipo === "nota") await api.alterarNota(id, { pasta });
    else await api.alterarPasta(id, { pasta });
  } catch (falha) {
    return avisarFalha(falha);
  }
  if (pasta) abrirPastas(pasta);
  const naArvore = $("#lateral").contains(document.activeElement) || document.activeElement === document.body;
  await atualizarLateral({ foco: naArvore ? { tipo, id } : null });
  // O caminho da nota aberta pode ter mudado
  if (navegacao.id && !emEdicao()) atualizarNotaAberta();
}

/* ---------- Apagar ---------- */

// As pastas dentro de uma pasta (com ela) e as notas de todas elas
function conteudoDaPasta(id, arvore) {
  const pastas = new Set([id]);
  for (let cresceu = true; cresceu; ) {
    cresceu = false;
    for (const p of arvore.pastas) {
      if (!pastas.has(p.id) && pastas.has(p.pasta)) {
        pastas.add(p.id);
        cresceu = true;
      }
    }
  }
  return { pastas, notas: arvore.notas.filter((n) => pastas.has(n.pasta)).map((n) => n.id) };
}

async function apagar(tipo, id) {
  const arvore = temCaderno() ? estado.dados.caderno : null;
  const item = arvore && (tipo === "nota" ? arvore.notas : arvore.pastas).find((x) => x.id === id);
  if (!item) return;
  let texto;
  let saem;
  if (tipo === "nota") {
    texto = `A nota "${item.titulo}" sai de vez.`;
    saem = new Set([id]);
  } else {
    const { pastas, notas } = conteudoDaPasta(id, arvore);
    const quantas = notas.length;
    texto = quantas
      ? `A pasta "${item.nome}" e ${quantas === 1 ? "a nota" : `as ${milhar(quantas)} notas`} dentro dela saem de vez.`
      : `A pasta "${item.nome}" sai de vez.`;
    saem = new Set([...pastas, ...notas]);
  }
  const sim = await perguntar({
    titulo: tipo === "nota" ? "Apagar a nota?" : "Apagar a pasta?",
    texto,
    confirmar: "Apagar",
    cancelar: "Cancelar",
    perigo: true,
  });
  if (!sim) return;
  try {
    if (tipo === "nota") await api.apagarNota(id);
    else await api.apagarPasta(id);
  } catch (falha) {
    return avisarFalha(falha);
  }
  // A nota aberta que saiu fecha (e a edição dela acaba sem salvar)
  if (navegacao.id && saem.has(navegacao.id)) {
    if (emEdicao()) encerrarEdicao();
    trocarEndereco("");
    mostrarNota(null);
  }
  if (saem.has(estado.pastaEscolhida)) estado.pastaEscolhida = null;
  await atualizarLateral();
  avisoRapido(tipo === "nota" ? "Nota apagada." : "Pasta apagada.");
}

/* ---------- Fixar ---------- */

// As fixadas ficam na ordem em que foram fixadas: a nova vai para o fim
async function fixar(id, sim) {
  const outras = estado.dados.fixadas.map((f) => f.id).filter((outra) => outra !== id);
  try {
    await api.mudarFixadas(sim ? [...outras, id] : outras);
  } catch (falha) {
    return avisarFalha(falha);
  }
  await atualizarLateral();
  avisoRapido(sim ? "Nota fixada." : "Nota desafixada.");
}

/* ---------- Nota de hoje ---------- */

// A nota com a data de hoje (AAAA-MM-DD) na pasta "Diário", na raiz do caderno. A pasta é achada pelo
// nome, sem diferença de maiúsculas e acentos, e criada se não existir; a nota do dia, também.
async function notaDeHoje() {
  if (!temCaderno() || !(await deixarEdicao())) return;
  const titulo = dataDeHoje();
  try {
    estado.dados = await api.caderno();
    const { caderno } = estado.dados;
    const diario = caderno.pastas.find((p) => !p.pasta && normalizar(p.nome.trim()) === "diario");
    const idDoDiario = diario ? diario.id : (await api.criarPasta({ nome: "Diário", pasta: null })).pasta.id;
    abrirPastas(idDoDiario);
    const existente = diario && caderno.notas.find((n) => n.pasta === idDoDiario && n.titulo.trim() === titulo);
    if (existente) {
      renderizarLateral();
      return abrirNota(existente.id);
    }
    const { nota } = await api.criarNota({ titulo, pasta: idDoDiario, texto: "" });
    await atualizarLateral();
    abrirNota(nota.id, { editar: "texto" });
  } catch (falha) {
    avisarFalha(falha);
  }
}

/* ---------- Baixar .md ---------- */

// O texto como foi escrito, para o .md: os links do portal e as notas embutidas viram só o que aparece,
// e a imagem vira ![legenda](endereço completo). Os escapes (\*, \[ e os outros) ficam como estão.
function textoParaMd(texto, imagens, base) {
  const protegido = texto.replace(/\\([*~#[\]|\->\\])/g, (_, ch) => String.fromCharCode(0xe000 + 92, 0xe000 + ch.charCodeAt(0)));
  const trocado = protegido
    .replace(/!\[\[imagem:([^\]|\n]+)(?:\|([^\]\n]*))?\]\]/g, (_, id, legenda = "") => {
      const endereco = Object.hasOwn(imagens, id) ? imagens[id] : null;
      return endereco ? `![${legenda.trim()}](${new URL(endereco, base).href})` : legenda.trim();
    })
    .replace(/!?\[\[(?:nota|personagem|evento|mesa|memoria|lugar):[^\]|\n]+\|([^\]\n]*)\]\]/g, "$1");
  return trocado.replace(/[-]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xe000));
}

// O título como nome do arquivo, sem os caracteres que o Windows não aceita
function nomeDoArquivo(titulo) {
  let nome = titulo.replace(/[<>:"/\\|?*\x00-\x1f]/g, "").replace(/[. ]+$/, "").trim();
  if (!nome) nome = "Sem título";
  if (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(nome)) nome += "_";
  return `${nome}.md`;
}

async function baixarMd(id) {
  let nota;
  let imagens;
  if (edicao.id === id && campoDoTexto()) {
    nota = naTela();
    imagens = { ...(navegacao.lida?.imagens ?? {}), ...edicao.imagens };
  } else if (navegacao.lida?.nota.id === id) {
    ({ nota, imagens } = navegacao.lida);
  } else {
    try {
      ({ nota, imagens } = await api.nota(id));
    } catch (falha) {
      return avisarFalha(falha);
    }
  }
  const arquivo = new Blob([textoParaMd(nota.texto, imagens ?? {}, location.href)], { type: "text/markdown;charset=utf-8" });
  const link = criar("a");
  link.href = URL.createObjectURL(arquivo);
  link.download = nomeDoArquivo(tituloLimpo(nota.titulo));
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 30000);
}

/* ---------- Copiar link ---------- */

async function copiarTexto(texto) {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    // fora do https (o arquivo aberto no PC), o jeito antigo
  }
  const antes = document.activeElement;
  const campo = criar("textarea", "sr");
  campo.value = texto;
  campo.readOnly = true;
  document.body.append(campo);
  campo.select();
  let foi = false;
  try {
    foi = document.execCommand("copy");
  } catch {
    foi = false;
  }
  campo.remove();
  antes?.focus?.({ preventScroll: true });
  return foi;
}

// O endereço da página com #nota-<id>: quem pode ler a nota abre direto nela
async function copiarLink(id) {
  const endereco = `${location.href.split("#")[0]}${ancoraDe(id)}`;
  if (await copiarTexto(endereco)) avisoRapido("Link copiado. Quem pode ler a nota abre direto nela.");
  else perguntar({ titulo: "Link da nota", texto: endereco });
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
  marcarPastaEscolhida();
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
   navegador. A nota aberta fica marcada; a pasta escolhida (onde
   "+ Nota" e "+ Pasta" criam), também, de leve. No teclado, como
   uma árvore: as setas andam, → abre a pasta, ← fecha, Enter abre,
   F2 renomeia e a tecla de menu (ou Shift+F10) abre o "⋯". A dona
   arrasta notas e pastas do caderno dela para outra pasta, ou para
   o título do caderno (a raiz).
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
  // O que a conta pode no item: tudo, no caderno dela; nas compartilhadas, o que recebeu; o administrador, ler
  const acesso = opcoes.daDona ? "dona" : opcoes.compartilhada ? dado.nivel : "admin";
  const nome = tipo === "pasta" ? dado.nome : dado.titulo;
  const item = criar("li", `arvore__item arvore__item--${tipo}`);
  item.setAttribute("role", "treeitem");
  item.tabIndex = -1;
  item.dataset.id = dado.id;
  item.dataset.tipo = tipo;
  item.dataset.nivel = acesso;
  if (tipo === "nota") item.setAttribute("aria-selected", "false");

  const linha = criar("div", "arvore__linha");
  linha.style.setProperty("--nivel", String(nivel));
  linha.append(
    tipo === "pasta" ? simbolo("icone-seta", "arvore__seta") : criar("span", "arvore__seta"),
    criar("span", "arvore__nome", nome),
  );
  const sinais = sinaisDoItem(dado, opcoes);
  if (sinais) linha.append(sinais);
  if (temOpcoes(tipo, acesso)) {
    const mais = criar("button", "arvore__mais", "⋯");
    mais.type = "button";
    mais.tabIndex = -1; // no teclado, a tecla de menu ou Shift+F10 no item
    mais.title = "Mais opções";
    mais.setAttribute("aria-label", `Mais opções: ${nome}`);
    mais.setAttribute("aria-haspopup", "menu");
    mais.setAttribute("aria-expanded", "false");
    linha.append(mais);
  }
  if (opcoes.daDona && !noCelular()) linha.draggable = true;
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

// A pasta escolhida: onde "+ Nota" e "+ Pasta" criam (só as pastas em que a conta pode criar ficam marcadas)
function escolherPasta(id) {
  estado.pastaEscolhida = id;
  marcarPastaEscolhida();
}

function marcarPastaEscolhida() {
  const id = podeCriarNa(estado.pastaEscolhida) ? estado.pastaEscolhida : null;
  for (const item of document.querySelectorAll(".arvore__item--pasta")) {
    item.classList.toggle("arvore__item--escolhida", item.dataset.id === id);
  }
}

// O "⋯" de um item: pelo botão dele ou, no teclado, pela tecla de menu
function abrirMenuDoItem(item, ancora) {
  const { tipo, id, nivel } = item.dataset;
  const linha = item.querySelector(":scope > .arvore__linha");
  const botaoMais = linha.querySelector(".arvore__mais");
  if (!botaoMais) return;
  if (menu.botao === botaoMais) return fecharMenu();
  const nome = linha.querySelector(".arvore__nome")?.textContent ?? "";
  abrirMenu(ancora ?? botaoMais, opcoesDe({ tipo, id, nivel }), {
    rotulo: `${tipo === "nota" ? "Nota" : "Pasta"} ${nome}`,
    devolver: item,
  });
}

function teclaNaArvore(evento) {
  const item = evento.target;
  if (item.getAttribute?.("role") !== "treeitem" || evento.altKey || evento.ctrlKey || evento.metaKey) return;
  const podeRenomear = item.dataset.nivel === "dona" || item.dataset.nivel === "editar";
  if (evento.key === "F2" || evento.key === "ContextMenu" || (evento.key === "F10" && evento.shiftKey)) {
    evento.preventDefault();
    if (evento.key !== "F2") abrirMenuDoItem(item);
    else if (podeRenomear) comecarRenomear(item.dataset.tipo, item.dataset.id);
    return;
  }
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

/* ---------- Arrastar (computador, só a dona) ---------- */

const arraste = { tipo: null, id: null, destino: null }; // o item arrastado e o destino marcado

// Para onde o item vai, se soltar aqui: uma pasta do caderno da dona ou o título do caderno (a raiz)
function destinoDoArraste(alvo) {
  const elemento = alvo instanceof Element ? alvo : alvo?.parentElement;
  if (!elemento) return null;
  let pasta;
  let lugar;
  if (elemento.closest("#titulo-caderno")) {
    pasta = null;
    lugar = $("#titulo-caderno");
  } else {
    const linha = elemento.closest("#arvore-caderno .arvore__linha");
    const item = linha?.parentElement;
    if (!item?.classList.contains("arvore__item--pasta")) return null;
    pasta = item.dataset.id;
    lugar = linha;
  }
  return podeIrPara(arraste.tipo, arraste.id, pasta) ? { pasta, lugar } : null;
}

function marcarDestino(lugar) {
  if (arraste.destino === lugar) return;
  arraste.destino?.classList.remove("destino-do-arraste");
  arraste.destino = lugar;
  lugar?.classList.add("destino-do-arraste");
}

function terminarArraste() {
  marcarDestino(null);
  for (const item of document.querySelectorAll(".arvore__item--arrastando")) item.classList.remove("arvore__item--arrastando");
  arraste.tipo = null;
  arraste.id = null;
}

function configurarArraste() {
  const lateral = $("#lateral");
  lateral.addEventListener("dragstart", (evento) => {
    const linha = evento.target.closest?.(".arvore__linha");
    const item = linha?.parentElement;
    if (!linha?.draggable || item?.getAttribute("role") !== "treeitem") return;
    fecharMenu({ devolverFoco: false });
    arraste.tipo = item.dataset.tipo;
    arraste.id = item.dataset.id;
    evento.dataTransfer.effectAllowed = "move";
    // Um tipo só do caderno: soltar na área de texto não escreve nada
    evento.dataTransfer.setData("application/x-caderno-item", item.dataset.id);
    item.classList.add("arvore__item--arrastando");
  });
  lateral.addEventListener("dragover", (evento) => {
    if (!arraste.id) return;
    const destino = destinoDoArraste(evento.target);
    marcarDestino(destino?.lugar ?? null);
    if (!destino) return;
    evento.preventDefault();
    evento.dataTransfer.dropEffect = "move";
  });
  lateral.addEventListener("dragleave", (evento) => {
    if (arraste.id && !lateral.contains(evento.relatedTarget)) marcarDestino(null);
  });
  lateral.addEventListener("drop", (evento) => {
    if (!arraste.id) return;
    evento.preventDefault();
    const destino = destinoDoArraste(evento.target);
    const { tipo, id } = arraste;
    terminarArraste();
    if (destino) mover(tipo, id, destino.pasta);
  });
  lateral.addEventListener("dragend", terminarArraste);
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

// A nota em edição: o título, o texto, colar e arrastar imagens. A área é montada de novo a cada nota:
// os eventos ficam nela.
function configurarEdicao() {
  const area = $("#area-nota");
  area.addEventListener("input", (evento) => {
    if (evento.target.id === "campo-texto") {
      ajustarAltura();
      aoMudarNaEdicao();
      aoDigitarColchete(evento.target, evento);
    } else if (evento.target.id === "campo-titulo") aoMudarNaEdicao();
  });
  area.addEventListener("keydown", (evento) => {
    if (evento.target.id === "campo-texto") return teclaNoTexto(evento);
    // Enter no título passa para o texto
    if (evento.target.id === "campo-titulo" && evento.key === "Enter" && !evento.isComposing) {
      evento.preventDefault();
      const texto = campoDoTexto();
      texto.focus();
      texto.setSelectionRange(0, 0);
    }
  });
  area.addEventListener("paste", (evento) => {
    if (evento.target.id === "campo-texto") aoColar(evento);
  });
  // Arquivos soltos em qualquer lugar da nota em edição entram onde está o cursor
  area.addEventListener("dragover", (evento) => {
    if (!levaArquivos(evento)) return;
    evento.preventDefault();
    evento.dataTransfer.dropEffect = "copy";
    campoDoTexto()?.classList.add("nota__campo-texto--soltar");
  });
  area.addEventListener("dragleave", (evento) => {
    if (!area.contains(evento.relatedTarget)) campoDoTexto()?.classList.remove("nota__campo-texto--soltar");
  });
  area.addEventListener("drop", (evento) => {
    if (!levaArquivos(evento)) return;
    evento.preventDefault();
    campoDoTexto()?.classList.remove("nota__campo-texto--soltar");
    enviarImagens(evento.dataTransfer.files);
  });
  $("#campo-imagens").addEventListener("change", (evento) => {
    const arquivos = [...evento.target.files];
    evento.target.value = "";
    enviarImagens(arquivos);
  });

  // Ctrl+E (⌘E no Mac): da leitura para a edição e de volta
  document.addEventListener("keydown", (evento) => {
    if (evento.key.toLowerCase() !== "e" || !(evento.ctrlKey || evento.metaKey) || evento.altKey || evento.shiftKey) return;
    if (document.querySelector("dialog[open]") || !podeAlterarNota(navegacao.lida?.nota)) return;
    evento.preventDefault();
    fecharMenu({ devolverFoco: false });
    if (emEdicao()) lerDeNovo();
    else comecarEdicao();
  });
  window.addEventListener("resize", () => ajustarAltura());
  // Com mudança por salvar (ou imagem subindo), fechar a página pede confirmação
  window.addEventListener("beforeunload", (evento) => {
    if (!temMudanca() && !edicao.enviando) return;
    evento.preventDefault();
    evento.returnValue = "";
  });
}

function configurarEventos() {
  $("#botao-nova-nota").addEventListener("click", () => criarNota());
  $("#botao-nova-pasta").addEventListener("click", () => criarPasta());
  $("#botao-nota-de-hoje").addEventListener("click", () => notaDeHoje());
  $("#conta-escolhida").addEventListener("change", aoEscolherConta);

  // As árvores são montadas de novo a cada mudança: os eventos ficam na lateral
  const lateral = $("#lateral");
  lateral.addEventListener("click", (evento) => {
    if (evento.target.closest(".arvore__renomear")) return;
    const linha = evento.target.closest(".arvore__linha");
    if (!linha) return;
    const item = linha.closest('[role="treeitem"]');
    if (evento.target.closest(".arvore__mais")) return abrirMenuDoItem(item);
    focarItem(item);
    ativarItem(item);
  });
  lateral.addEventListener("keydown", teclaNaArvore);
  // A pasta com o foco (pelo clique ou pelas setas) é a escolhida
  lateral.addEventListener("focusin", (evento) => {
    const item = evento.target;
    if (item.getAttribute?.("role") === "treeitem" && item.dataset.tipo === "pasta") escolherPasta(item.dataset.id);
  });
  configurarArraste();
  configurarEdicao();
  configurarMenu();
  configurarCitar();
  configurarConflito();
  $("#mover-cancelar").addEventListener("click", () => $("#dialogo-mover").close());
  fecharAoClicarFora($("#dialogo-mover"));

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
  estado.citaveis = null;
  estado.pastaEscolhida = null;
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
    // O que estava sendo escrito salva antes, ainda como a conta de antes
    if (emEdicao()) {
      await salvar({ agora: true });
      encerrarEdicao();
    }
    api.trocarConta(seletor.value);
    resumo();
    fecharMenu({ devolverFoco: false });
    for (const dialogo of document.querySelectorAll("dialog[open]")) dialogo.close();
    await recarregarTudo();
    avisoRapido(`Agora você vê a página como ${NOMES_DA_PREVIA[seletor.value]}.`);
  });
  $("#sim-restaurar").addEventListener("click", async () => {
    encerrarEdicao();
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
