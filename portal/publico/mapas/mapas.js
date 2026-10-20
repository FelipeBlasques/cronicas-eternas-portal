/* =================================================================
   Crônicas Eternas: Mapas
   -----------------------------------------------------------------
   Os mapas de Draevor e de cada mesa. A galeria mostra só as
   miniaturas, em grupos: primeiro Draevor (os mapas sem mesa),
   depois um grupo por mesa. Só o administrador envia, altera e
   apaga mapas. A miniatura, a largura e a altura saem daqui mesmo:
   o navegador mede a imagem e reduz num <canvas> na hora do envio.

   Clicar num card abre o mapa no visor, com link próprio
   (mapas/#mapa-xxxxxxxx, e mapas/#mapa-xxxxxxxx/marca-xxxxxxxx com
   um lugar já escolhido). O zoom e o arraste ficam no visor.js,
   carregado antes deste. Os lugares em cima do mapa e o painel com
   o índice ficam aqui, como no Atlas de Tyrenar: os impressos são
   áreas invisíveis sobre o que já está desenhado na imagem, e só os
   marcados depois pelo portal ganham um marcador visível.

   No servidor, conversa com o servidor/mapas.js. Aberta fora dele
   (arquivo no PC ou prévia), usa o mapa de Tyrenar de exemplo e um
   painel para ver a página como administrador, editor ou jogador.

   Usa o comum.js, carregado antes: pedir(), criar(), avisos, barra
   lateral, status do Foundry e cinzas. Do visor.js, usa criarVisor().
   ================================================================= */

const CONFIG = {
  intervaloStatus: 15000, // tempo entre consultas ao estado do Foundry, em ms
  maxMapa: 25 * 1024 * 1024, // 25 MB, o mesmo limite do servidor
  ladoMaximo: 30000, // largura e altura da imagem, em pixels, o mesmo limite do servidor
  ladoMiniatura: 640, // o lado maior da miniatura da galeria, em pixels
};

const TIPOS_ACEITOS = ["image/png", "image/jpeg", "image/webp", "image/gif", "image/avif"];

/* =================================================================
   Conversa com o servidor
   ================================================================= */

// Os dados vão como JSON; a imagem nova, se houver, vai junto com a miniatura e as medidas
function formularioDe(dados) {
  const { imagem, ...resto } = dados;
  const form = new FormData();
  form.append("dados", JSON.stringify(imagem ? { ...resto, largura: imagem.largura, altura: imagem.altura } : resto));
  if (imagem) {
    form.append("imagem", imagem.arquivo);
    form.append("miniatura", imagem.miniatura);
  }
  return form;
}

const apiDoServidor = {
  mapas: () => pedir("GET", "/api/mapas"),
  estado: () => pedir("GET", "/api/estado", undefined, { silencioso: true }),
  sair: () => pedir("POST", "/api/sair"),
  enviar: (dados) => pedir("POST", "/api/mapas", formularioDe(dados)),
  alterar: (id, dados) => pedir("PUT", caminhoDe("/api/mapas", id), formularioDe(dados)),
  apagar: (id) => pedir("DELETE", caminhoDe("/api/mapas", id)),
};

/* =================================================================
   Prévia: um portal de mentira, só na memória do navegador
   ================================================================= */

const CONTAS_DA_PREVIA = {
  admin: { usuario: "mestre", nome: "Mestre", cargo: "admin" },
  editor: { usuario: "takezo", nome: "Takezo", cargo: "editor" },
  jogador: { usuario: "neia", nome: "Neia", cargo: "jogador" },
};

// Os 36 lugares do Atlas de Tyrenar, copiados de planejamento/referencias/lugares-tyrenar.json
const LUGARES_DE_TYRENAR = [
  {
    nome: "Westna",
    tipo: "capital",
    x: 0.61875,
    y: 0.6435,
    impresso: true,
    raio: 0.005,
    caixa: [0.5785, 0.65383, 0.65675, 0.67767],
    descricao: "Capital de Tyrenar e único lugar marcado com o símbolo de capital. Fica no centro-sul do reino, onde várias estradas se cruzam, entre a floresta central, ao norte, e a grande floresta do leste.",
  },
  {
    nome: "Greywater",
    tipo: "cidade",
    x: 0.52075,
    y: 0.08783,
    impresso: true,
    raio: 0.00275,
    caixa: [0.48688, 0.09467, 0.55725, 0.10983],
    descricao: "A cidade mais ao norte do reino, perto da costa e ao lado de um pequeno bosque.",
  },
  {
    nome: "Sail’s Portico",
    tipo: "vila",
    x: 0.34013,
    y: 0.14083,
    impresso: true,
    raio: 0.00275,
    caixa: [0.30775, 0.15367, 0.3785, 0.16667],
    descricao: "Vila perto da costa norte, entre a grande floresta do noroeste e a floresta sinuosa.",
  },
  {
    nome: "Hando",
    tipo: "cidade",
    x: 0.18513,
    y: 0.2095,
    impresso: true,
    raio: 0.00275,
    caixa: [0.16225, 0.2215, 0.20575, 0.23583],
    descricao: "Cidade do noroeste, ao pé de uma grande floresta costeira e a leste da fronteira com Monaron.",
  },
  {
    nome: "Valtara",
    tipo: "cidade",
    x: 0.31475,
    y: 0.24083,
    impresso: true,
    raio: 0.00275,
    caixa: [0.28775, 0.24883, 0.33887, 0.26417],
    descricao: "Cidade do norte, em campos de colinas baixas entre Hando e a floresta sinuosa.",
  },
  {
    nome: "Aylesbury",
    tipo: "vila",
    x: 0.47425,
    y: 0.2635,
    impresso: true,
    raio: 0.00275,
    caixa: [0.44838, 0.2695, 0.50013, 0.28167],
    descricao: "Vila na ponta sul da floresta sinuosa, a oeste de Sedgecourt.",
  },
  {
    nome: "Fairlock",
    tipo: "cidade",
    x: 0.78812,
    y: 0.22183,
    impresso: true,
    raio: 0.00275,
    caixa: [0.76187, 0.2265, 0.8195, 0.24167],
    descricao: "Cidade do nordeste, em campos abertos perto da costa.",
  },
  {
    nome: "Sedgecourt",
    tipo: "cidade",
    x: 0.617,
    y: 0.29667,
    impresso: true,
    raio: 0.00275,
    caixa: [0.58125, 0.30317, 0.65587, 0.319],
    descricao: "Cidade do centro-norte, logo acima da grande floresta central.",
  },
  {
    nome: "Penshaw",
    tipo: "vila",
    x: 0.86562,
    y: 0.32917,
    impresso: true,
    raio: 0.00275,
    caixa: [0.84525, 0.33783, 0.88838, 0.34983],
    descricao: "A vila mais a leste do reino, perto da costa.",
  },
  {
    nome: "Olkdiff",
    tipo: "cidade",
    x: 0.23763,
    y: 0.3195,
    impresso: true,
    raio: 0.00275,
    caixa: [0.2105, 0.32483, 0.26125, 0.34017],
    descricao: "Cidade do oeste, ao lado de um pequeno bosque.",
  },
  {
    nome: "Vellow",
    tipo: "vila",
    x: 0.3835,
    y: 0.38583,
    impresso: true,
    raio: 0.00275,
    caixa: [0.36788, 0.39467, 0.3995, 0.40467],
    descricao: "Vila na orla oeste da floresta central.",
  },
  {
    nome: "Dornwich",
    tipo: "vila",
    x: 0.1215,
    y: 0.43133,
    impresso: true,
    raio: 0.00275,
    caixa: [0.09688, 0.4415, 0.14888, 0.45383],
    descricao: "Vila do oeste, entre a fronteira com Monaron e uma grande mata em forma de cunha.",
  },
  {
    nome: "Hardenmoor",
    tipo: "cidade",
    x: 0.76338,
    y: 0.40567,
    impresso: true,
    raio: 0.00275,
    caixa: [0.72275, 0.4145, 0.80612, 0.43017],
    descricao: "Cidade do leste, na orla norte da grande floresta do leste.",
  },
  {
    nome: "Aubreth",
    tipo: "vila",
    x: 0.38175,
    y: 0.46667,
    impresso: true,
    raio: 0.00275,
    caixa: [0.35988, 0.474, 0.4045, 0.486],
    descricao: "Vila do centro-oeste, entre faixas de floresta, ao sul de Vellow.",
  },
  {
    nome: "Drumrane",
    tipo: "cidade",
    x: 0.577,
    y: 0.51133,
    impresso: true,
    raio: 0.00275,
    caixa: [0.54525, 0.51667, 0.61187, 0.532],
    descricao: "Cidade logo abaixo da escarpa que fecha a floresta central, ao norte de Westna.",
  },
  {
    nome: "Hadleigh",
    tipo: "vila",
    x: 0.193,
    y: 0.56333,
    impresso: true,
    raio: 0.00275,
    caixa: [0.16825, 0.57417, 0.217, 0.586],
    descricao: "Vila do sudoeste, em campo aberto entre Dornwich e Co Rapids.",
  },
  {
    nome: "Wakafield",
    tipo: "vila",
    x: 0.45238,
    y: 0.60117,
    impresso: true,
    raio: 0.00275,
    caixa: [0.4255, 0.60667, 0.47837, 0.61917],
    descricao: "Vila na encosta nordeste do maciço central, a oeste de Westna.",
  },
  {
    nome: "Didsshaw",
    tipo: "cidade",
    x: 0.27463,
    y: 0.62017,
    impresso: true,
    raio: 0.00275,
    caixa: [0.2465, 0.62683, 0.30575, 0.64217],
    descricao: "Cidade do sudoeste, a oeste do maciço central.",
  },
  {
    nome: "Co Rapids",
    tipo: "vila",
    x: 0.1375,
    y: 0.6405,
    impresso: true,
    raio: 0.00275,
    caixa: [0.11313, 0.6475, 0.1635, 0.66],
    descricao: "Vila do extremo sudoeste, perto de onde se encontram as fronteiras com Monaron e Feneck.",
  },
  {
    nome: "Balerno",
    tipo: "vila",
    x: 0.50413,
    y: 0.67567,
    impresso: true,
    raio: 0.00275,
    caixa: [0.48237, 0.685, 0.52487, 0.697],
    descricao: "Vila a oeste de Westna, perto da borda leste do maciço central.",
  },
  {
    nome: "Wolfville",
    tipo: "cidade",
    x: 0.72688,
    y: 0.6755,
    impresso: true,
    raio: 0.00275,
    caixa: [0.6935, 0.683, 0.759, 0.6985],
    descricao: "Cidade a leste de Westna, ao pé da escarpa sul da floresta do leste.",
  },
  {
    nome: "Ardennac",
    tipo: "cidade",
    x: 0.283,
    y: 0.76683,
    impresso: true,
    raio: 0.00275,
    caixa: [0.25275, 0.77683, 0.316, 0.79217],
    descricao: "Cidade no sopé das serras do sudoeste, perto da fronteira com Feneck.",
  },
  {
    nome: "Lanercost",
    tipo: "vila",
    x: 0.50487,
    y: 0.80217,
    impresso: true,
    raio: 0.00275,
    caixa: [0.47663, 0.8105, 0.53087, 0.82283],
    descricao: "Vila do sul, entre o maciço central e bosques esparsos.",
  },
  {
    nome: "Brudermell",
    tipo: "cidade",
    x: 0.65187,
    y: 0.85333,
    impresso: true,
    raio: 0.00275,
    caixa: [0.612, 0.861, 0.68925, 0.87667],
    descricao: "A cidade mais ao sul do reino, junto ao bosque de árvores mortas que acompanha a fronteira com as Eclipsed Lands.",
  },
  {
    nome: "Tyrenar",
    tipo: "reino",
    x: 0.8175,
    y: 0.08333,
    impresso: true,
    caixa: [0.65875, 0.02667, 0.97625, 0.14],
    descricao: "O reino deste mapa. Faz fronteira com Monaron a oeste, com Feneck a sudoeste e com as Eclipsed Lands ao sul; ao norte e a leste fica o mar.",
  },
  {
    nome: "Monaron",
    tipo: "regiao",
    x: 0.03587,
    y: 0.36783,
    impresso: true,
    caixa: [0.01875, 0.26417, 0.05312, 0.47167],
    descricao: "Terras a oeste de Tyrenar. A fronteira desce da costa norte até perto de Co Rapids.",
  },
  {
    nome: "Feneck",
    tipo: "regiao",
    x: 0.108,
    y: 0.916,
    impresso: true,
    caixa: [0.02775, 0.8825, 0.18837, 0.94967],
    descricao: "Terras a sudoeste, do outro lado das serras que fecham essa ponta de Tyrenar.",
  },
  {
    nome: "Eclipsed Lands",
    tipo: "regiao",
    x: 0.6635,
    y: 0.96167,
    impresso: true,
    caixa: [0.52425, 0.92717, 0.80288, 0.99617],
    apelido: "Em português: Terras Eclipsadas",
    descricao: "Terras ao sul de Tyrenar. Do lado de cá da fronteira, perto de Brudermell, a mata vira um bosque de árvores mortas.",
  },
  {
    nome: "Floresta do Noroeste",
    tipo: "relevo",
    x: 0.19437,
    y: 0.15367,
    impresso: false,
    glifo: "floresta",
    descricao: "Mata fechada entre a costa norte e Hando.",
  },
  {
    nome: "Floresta Sinuosa",
    tipo: "relevo",
    x: 0.39787,
    y: 0.18083,
    impresso: false,
    glifo: "floresta",
    descricao: "Faixa de floresta que desce em curvas da costa norte até Aylesbury.",
  },
  {
    nome: "Floresta Central",
    tipo: "relevo",
    x: 0.52438,
    y: 0.41583,
    impresso: false,
    glifo: "floresta",
    descricao: "A grande mata do centro do reino, entre Sedgecourt e Drumrane. A borda sul termina numa escarpa.",
  },
  {
    nome: "Floresta do Leste",
    tipo: "relevo",
    x: 0.859,
    y: 0.57267,
    impresso: false,
    glifo: "floresta",
    descricao: "A maior floresta do mapa, de Hardenmoor até a costa leste. A borda sul também cai numa escarpa, e no meio da mata há uma cratera.",
  },
  {
    nome: "Cratera",
    tipo: "relevo",
    x: 0.76062,
    y: 0.51167,
    impresso: false,
    glifo: "cratera",
    descricao: "Uma depressão de bordas íngremes no coração da floresta do leste. Nenhuma estrada do mapa chega até ela.",
  },
  {
    nome: "Maciço Central",
    tipo: "relevo",
    x: 0.40687,
    y: 0.67517,
    impresso: false,
    glifo: "montanha",
    descricao: "Os picos mais altos do mapa. Sobem do sul até perto de Aubreth e Wakafield.",
  },
  {
    nome: "Serras do Sudoeste",
    tipo: "relevo",
    x: 0.25312,
    y: 0.83183,
    impresso: false,
    glifo: "montanha",
    descricao: "Cordilheira que acompanha a fronteira com Feneck, de Co Rapids até o maciço central.",
  },
  {
    nome: "Bosque Morto",
    tipo: "relevo",
    x: 0.63287,
    y: 0.90233,
    impresso: false,
    glifo: "arvore-morta",
    descricao: "Faixa de árvores mortas ao longo da fronteira com as Eclipsed Lands, logo ao sul de Brudermell.",
  },
];

// Mais três marcados pelo portal: dois visíveis de um editor e um que só o administrador vê
const MARCADORES_DA_PREVIA = [
  {
    id: "marca-c41d0e01",
    nome: "Torre Partida",
    tipo: "lugar",
    x: 0.70125,
    y: 0.34,
    impresso: false,
    glifo: "torre",
    apelido: "",
    descricao: "Uma torre de vigia em ruínas na estrada de Sedgecourt a Hardenmoor. O grupo passou uma noite aqui e achou marcas de garras na escada.",
    visibilidade: "todos",
    registradoPor: "takezo",
  },
  {
    id: "marca-c41d0e02",
    nome: "Naufrágio do Corvo",
    tipo: "lugar",
    x: 0.935,
    y: 0.25,
    impresso: false,
    glifo: "navio",
    apelido: "O Corvo",
    descricao: "O navio que trouxe o grupo a Tyrenar. Encalhou nas pedras ao largo de Penshaw, e na maré baixa ainda dá para ver o mastro.\n\nO que estava no porão **não** foi encontrado.",
    visibilidade: "todos",
    registradoPor: "takezo",
  },
  {
    id: "marca-c41d0e03",
    nome: "Círculo de Pedras",
    tipo: "lugar",
    x: 0.80625,
    y: 0.475,
    impresso: false,
    glifo: "arcano",
    apelido: "O Selo",
    descricao: "Escondido na floresta do leste, a nordeste da cratera. É o selo que prende o que caiu do céu. O grupo ainda não sabe que ele existe.",
    visibilidade: "admin",
    registradoPor: "mestre",
  },
];

// Guardados como no dados.json do servidor: os do atlas entraram pela importação do administrador
function marcadoresDaPrevia() {
  const quando = "2026-10-20T12:00:00.000Z";
  const doAtlas = LUGARES_DE_TYRENAR.map((lugar, i) => ({
    id: `marca-7a1e${String(i).padStart(4, "0")}`,
    ...lugar,
    raio: lugar.impresso ? lugar.raio ?? null : null,
    caixa: lugar.impresso ? lugar.caixa ?? null : null,
    glifo: lugar.impresso ? null : lugar.glifo,
    apelido: lugar.apelido ?? "",
    visibilidade: "todos",
    registradoPor: "mestre",
  }));
  const doPortal = MARCADORES_DA_PREVIA.map((m) => ({ ...m, raio: null, caixa: null }));
  return [...doAtlas, ...doPortal].map((m) => ({
    ...m,
    registradoNome: { mestre: "Mestre", takezo: "Takezo" }[m.registradoPor],
    criadoEm: quando,
    alteradoEm: quando,
  }));
}

// Guardado como no dados.json do servidor; a mapas() monta o que a página recebe
function exemplosDaPrevia() {
  return {
    contas: [
      { usuario: "mestre", nome: "Mestre" },
      { usuario: "takezo", nome: "Takezo" },
      { usuario: "neia", nome: "Neia" },
    ],
    // As mesmas das outras prévias
    campanhas: [
      { id: "ode-to-sleep", nome: "Ode to Sleep", cor: "#2e3756" },
      { id: "remissao", nome: "Remissão do Flagelo Esvanescente", cor: "#5a2a26" },
    ],
    mapas: [
      {
        id: "mapa-7a1e0c3d",
        nome: "Tyrenar",
        mesas: [],
        descricao: "O reino entre Monaron, Feneck e as **Eclipsed Lands**. Ao norte e a leste, só o mar.",
        // A mesma imagem nos dois: 1600 × 1200, nas proporções do mapa de verdade
        imagem: "previa-tyrenar.webp",
        miniatura: "previa-tyrenar.webp",
        largura: 1600,
        altura: 1200,
        visibilidade: "todos",
        criadoEm: "2026-10-20T12:00:00.000Z",
        alteradoEm: "2026-10-20T12:00:00.000Z",
        marcadores: marcadoresDaPrevia(),
      },
    ],
  };
}

function criarApiDePrevia() {
  let banco = exemplosDaPrevia();
  let conta = CONTAS_DA_PREVIA.admin;

  // O mesmo formato do servidor/mapas.js
  const podeVer = (item) => conta.cargo === "admin" || item.visibilidade !== "admin";
  const podeEditarMarcador = (m) => conta.cargo === "admin" || (conta.cargo === "editor" && m.registradoPor === conta.usuario);

  const proibido = () => erroComCodigo("Só o administrador pode fazer isso.", "proibido");
  const semMapa = () => erroComCodigo("Esse mapa não existe mais. Recarregue a página.", "nao-encontrado");
  const idAleatorio = () => Array.from(crypto.getRandomValues(new Uint8Array(4)), (b) => b.toString(16).padStart(2, "0")).join("");

  function acharMapa(id) {
    const mapa = banco.mapas.find((m) => m.id === id);
    if (!mapa || !podeVer(mapa)) throw semMapa();
    return mapa;
  }

  /* ---------- O que chega do formulário, conferido como no servidor ---------- */

  function valoresDoMapa(dados) {
    const nome = typeof dados.nome === "string" ? dados.nome.trim() : "";
    if (!nome) throw erroComCodigo("Preencha o campo Nome.");
    if (nome.length > 80) throw erroComCodigo("O campo Nome pode ter no máximo 80 caracteres.");
    const descricao = typeof dados.descricao === "string" ? dados.descricao.trim() : "";
    if (descricao.length > 600) throw erroComCodigo("O campo Descrição pode ter no máximo 600 caracteres.");
    const conhecidas = new Set(banco.campanhas.map((c) => c.id));
    return {
      nome,
      mesas: [...new Set(dados.mesas)].filter((id) => conhecidas.has(id)),
      descricao,
      visibilidade: dados.visibilidade === "admin" ? "admin" : "todos",
    };
  }

  // A imagem da prévia vira um endereço temporário do próprio navegador
  const imagensDe = (imagem) => ({
    imagem: URL.createObjectURL(imagem.arquivo),
    miniatura: URL.createObjectURL(imagem.miniatura),
    largura: imagem.largura,
    altura: imagem.altura,
  });

  /* ---------- O formato enviado à página ---------- */

  function marcadorPublico(m) {
    return {
      id: m.id,
      nome: m.nome,
      tipo: m.tipo,
      x: m.x,
      y: m.y,
      impresso: Boolean(m.impresso),
      raio: m.impresso ? m.raio ?? null : null,
      caixa: m.impresso ? m.caixa ?? null : null,
      glifo: m.impresso ? null : m.glifo,
      apelido: m.apelido || "",
      descricao: m.descricao || "",
      visibilidade: m.visibilidade,
      registradoPor: banco.contas.find((c) => c.usuario === m.registradoPor)?.nome ?? m.registradoNome ?? null,
      podeEditar: podeEditarMarcador(m),
    };
  }

  function mapaPublico(mapa) {
    const { marcadores, ...resto } = mapa;
    return { ...resto, mesas: [...mapa.mesas], marcadores: marcadores.filter(podeVer).map(marcadorPublico) };
  }

  return {
    trocarConta(cargo) {
      conta = CONTAS_DA_PREVIA[cargo] ?? CONTAS_DA_PREVIA.admin;
    },
    restaurar() {
      banco = exemplosDaPrevia();
    },
    async mapas() {
      await esperar(120);
      return structuredClone({
        conta: { ...conta },
        mesas: banco.campanhas,
        mapas: banco.mapas.filter(podeVer).map(mapaPublico),
      });
    },
    async estado() {
      return { online: true, mundoAtivo: "ode-to-sleep", conectados: 0, trocandoPara: null };
    },
    async sair() {
      await esperar(100);
      return {};
    },
    async enviar(dados) {
      await esperar(400);
      if (conta.cargo !== "admin") throw proibido();
      if (!dados.imagem) throw erroComCodigo("Escolha a imagem do mapa.");
      const valores = valoresDoMapa(dados);
      if (banco.mapas.length >= 30) throw erroComCodigo("A página pode ter no máximo 30 mapas.");
      const ocupados = new Set(banco.mapas.map((m) => m.id));
      let id;
      do id = `mapa-${idAleatorio()}`;
      while (ocupados.has(id));
      const quando = new Date().toISOString();
      const { imagem, miniatura, largura, altura } = imagensDe(dados.imagem);
      banco.mapas.push({
        id,
        nome: valores.nome,
        mesas: valores.mesas,
        descricao: valores.descricao,
        imagem,
        miniatura,
        largura,
        altura,
        visibilidade: valores.visibilidade,
        criadoEm: quando,
        alteradoEm: quando,
        marcadores: [],
      });
      return { mapa: { id } };
    },
    // Trocar a imagem mantém os marcadores, como no servidor
    async alterar(id, dados) {
      await esperar(300);
      if (conta.cargo !== "admin") throw proibido();
      const mapa = acharMapa(id);
      const valores = valoresDoMapa(dados);
      Object.assign(mapa, valores, dados.imagem ? imagensDe(dados.imagem) : {}, { alteradoEm: new Date().toISOString() });
      return { ok: true };
    },
    async apagar(id) {
      await esperar(200);
      if (conta.cargo !== "admin") throw proibido();
      const mapa = acharMapa(id);
      banco.mapas = banco.mapas.filter((m) => m !== mapa);
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
  mapas: [],
};

const ehAdmin = () => estado.conta?.cargo === "admin";
const ehEditor = () => estado.conta?.cargo === "editor";

const mesaPorId = (id) => estado.mesas.find((m) => m.id === id);
const mapaPorId = (id) => estado.mapas.find((m) => m.id === id);

const porNome = (a, b) => a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" });
const emMegabytes = (bytes) => `${(bytes / (1024 * 1024)).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB`;

/* =================================================================
   Cabeçalho: conta e estado do Foundry
   ================================================================= */

function atualizarTopo() {
  $("#nome-conta").textContent = estado.conta?.nome ?? "";
  const cargo = $("#cargo-conta");
  cargo.hidden = !ehAdmin() && !ehEditor();
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
   A galeria
   ================================================================= */

// Primeiro Draevor (os mapas sem mesa), depois um grupo para cada mesa, na ordem das Mesas.
// Um mapa de duas mesas aparece nas duas.
function gruposDaGaleria() {
  const grupos = [{ id: "draevor", nome: "Draevor", sub: "O mundo todo", mapas: estado.mapas.filter((m) => !m.mesas.length) }];
  for (const mesa of estado.mesas) {
    grupos.push({ id: mesa.id, nome: mesa.nome, cor: mesa.cor, mapas: estado.mapas.filter((m) => m.mesas.includes(mesa.id)) });
  }
  return grupos.filter((g) => g.mapas.length).map((g) => ({ ...g, mapas: g.mapas.sort(porNome) }));
}

function seloOculto() {
  const selo = criar("span", "selo-oculto");
  selo.append(simbolo("icone-oculto"), "Só o administrador");
  return selo;
}

// A miniatura numa moldura de ferro, com o nome abaixo. O administrador tem o lápis no canto.
function montarCard(mapa) {
  const oculto = mapa.visibilidade === "admin";
  const item = criar("article", `mapa-item${oculto ? " mapa-item--oculto" : ""}`);
  item.dataset.id = mapa.id;

  const card = criar("button", "mapa-card");
  card.type = "button";
  card.setAttribute("aria-label", oculto ? `Abrir o mapa ${mapa.nome}, que só o administrador vê` : `Abrir o mapa ${mapa.nome}`);
  const moldura = criar("span", "mapa-card__moldura");
  // A galeria só carrega as miniaturas; a imagem inteira fica para o visor
  const miniatura = criar("img", "mapa-card__miniatura");
  miniatura.alt = "";
  miniatura.loading = "lazy";
  miniatura.decoding = "async";
  miniatura.src = mapa.miniatura;
  moldura.append(miniatura);
  card.append(moldura, criar("span", "mapa-card__nome", mapa.nome));
  if (oculto) card.append(seloOculto());
  card.addEventListener("click", () => abrirMapa(mapa.id));
  item.append(card);

  if (ehAdmin()) {
    const lapis = criar("button", "botao botao-icone mapa-item__lapis");
    lapis.type = "button";
    lapis.title = "Alterar o mapa";
    lapis.setAttribute("aria-label", `Alterar o mapa ${mapa.nome}`);
    lapis.append(simbolo("icone-lapis"));
    lapis.addEventListener("click", () => abrirEdicao(mapa));
    item.append(lapis);
  }
  return item;
}

function montarGrupo(grupo) {
  const secao = criar("section", "grupo-mapas");
  const titulo = criar("h2", "grupo-mapas__titulo");
  titulo.id = `grupo-${grupo.id}`;
  if (grupo.cor) {
    const ponto = criar("span", "grupo-mapas__ponto");
    ponto.style.setProperty("--cor", corVisivel(grupo.cor));
    titulo.append(ponto);
  }
  titulo.append(grupo.nome);
  const nota = grupo.sub ? `${grupo.sub} · ` : "";
  titulo.append(criar("small", "grupo-mapas__nota", `${nota}${grupo.mapas.length === 1 ? "1 mapa" : `${grupo.mapas.length} mapas`}`));
  secao.setAttribute("aria-labelledby", titulo.id);

  const grade = criar("div", "grupo-mapas__grade");
  grade.append(...grupo.mapas.map(montarCard));
  secao.append(titulo, grade);
  return secao;
}

function renderizarGaleria() {
  const galeria = $("#galeria");
  const grupos = gruposDaGaleria();
  if (!grupos.length) {
    const texto = ehAdmin() ? "Ainda não há mapas. Envie o primeiro em \"+ Mapa\"." : "Ainda não há mapas.";
    galeria.replaceChildren(criar("p", "galeria-vazia", texto));
    return;
  }
  galeria.replaceChildren(...grupos.map(montarGrupo));
}

/* =================================================================
   O visor: um mapa aberto
   -----------------------------------------------------------------
   Abrir um mapa põe o id dele no endereço (#mapa-xxxxxxxx), então o
   link funciona e o Voltar do navegador volta à galeria. O que vier
   depois da barra (#mapa-xxxxxxxx/marca-xxxxxxxx) é o lugar escolhido.
   As cinzas do fundo somem enquanto o visor está aberto.
   ================================================================= */

// No celular (a mesma largura do mapas.css), o painel dos lugares vira uma gaveta no rodapé
const TELA_DE_GAVETA = window.matchMedia("(max-width: 760px)");

// O que o painel cobre do mapa: "Ver o mapa inteiro" e "Centralizar" usam o espaço que sobra
function espacoDoPainel() {
  const painel = $("#painel-lugares");
  if (!painel.offsetParent) return {};
  const janela = $("#visor-janela").getBoundingClientRect();
  if (TELA_DE_GAVETA.matches) return { baixo: Math.max(0, janela.bottom - painel.getBoundingClientRect().top) };
  return { esquerda: Math.max(0, $(".visor__lado").getBoundingClientRect().right - janela.left) };
}

const visor = criarVisor({
  janela: $("#visor-janela"),
  imagem: $("#visor-imagem"),
  lugares: $("#visor-lugares"),
  botoes: { aproximar: $("#visor-aproximar"), afastar: $("#visor-afastar"), inteiro: $("#visor-inteiro") },
  espacoOcupado: espacoDoPainel,
  // O halo e o rótulo têm medidas que dependem do zoom; o resto dos lugares acompanha pelo --escala
  aoMudar: () => {
    desenharHalo();
    posicionarRotulo();
  },
});

const TITULO_DA_PAGINA = document.title;

const navegacao = {
  aberto: null, // o id do mapa no visor, ou null na galeria
  pelaGaleria: false, // aberto por um card: "Voltar aos mapas" é o Voltar do navegador
};

const mapaDoEndereco = () => location.hash.match(/^#(mapa-[\w-]+)/)?.[1] ?? null;
const marcaDoEndereco = () => location.hash.match(/^#mapa-[\w-]+\/(marca-[\w-]+)/)?.[1] ?? null;

// Põe (ou tira) o mapa aberto no endereço da página. Devolve false se o navegador não deixar.
function trocarEndereco(ancora, { nova = false } = {}) {
  const endereco = ancora || location.pathname + location.search;
  try {
    if (nova) history.pushState(null, "", endereco);
    else history.replaceState(null, "", endereco);
    return true;
  } catch {
    // dentro de alguns quadros de prévia, o navegador não deixa mudar o endereço
    return false;
  }
}

function abrirMapa(id) {
  const anotado = trocarEndereco(`#${id}`, { nova: true });
  mostrarRota(id);
  navegacao.pelaGaleria = anotado;
}

// Mostra o mapa do endereço no visor, com o lugar do endereço escolhido, ou a galeria.
// Ao recarregar os dados, o lugar escolhido não é lido de novo do endereço: alguns quadros de prévia não deixam mudá-lo.
function mostrarRota(id = mapaDoEndereco(), { lugarDoEndereco = true } = {}) {
  const mapa = id ? mapaPorId(id) : null;
  if (id && !mapa) {
    avisoRapido("Esse mapa não existe ou não está disponível para você.");
    trocarEndereco("");
  }
  if (!mapa) return fecharVisor();
  const novo = navegacao.aberto !== mapa.id;
  abrirVisor(mapa);
  mostrarLugares(mapa, { novo });
  if (novo || lugarDoEndereco) mostrarLugarDoEndereco({ animar: !novo });
}

async function abrirVisor(mapa) {
  $("#visor-nome").textContent = mapa.nome;
  document.title = `${mapa.nome} · ${TITULO_DA_PAGINA}`;
  if (navegacao.aberto === mapa.id) return;
  navegacao.aberto = mapa.id;
  navegacao.pelaGaleria = false;

  // O foco estava no card, que vai sumir: passa para o mapa
  const focoNaGaleria = $("#pagina").contains(document.activeElement);
  $("#pagina").hidden = true;
  $("#visor").hidden = false;
  document.body.classList.add("com-visor");
  if (focoNaGaleria) $("#visor-janela").focus({ preventScroll: true });
  const carregando = $("#visor-carregando");
  carregando.textContent = "Abrindo o mapa…";
  carregando.hidden = false;

  try {
    if (await visor.abrir(mapa)) carregando.hidden = true;
  } catch (falha) {
    if (navegacao.aberto === mapa.id) carregando.textContent = falha.message;
  }
}

function fecharVisor() {
  const id = navegacao.aberto;
  if (!id) return;
  navegacao.aberto = null;
  navegacao.pelaGaleria = false;
  visor.fechar();
  limparLugares();
  const focoNoVisor = $("#visor").contains(document.activeElement) || document.activeElement === document.body;
  $("#visor").hidden = true;
  $("#pagina").hidden = false;
  document.body.classList.remove("com-visor");
  document.title = TITULO_DA_PAGINA;
  // O foco volta ao card do mapa que estava aberto
  if (focoNoVisor) $(`.mapa-item[data-id="${id}"] .mapa-card`)?.focus();
}

function voltarAGaleria() {
  if (navegacao.pelaGaleria) return history.back();
  trocarEndereco("");
  mostrarRota(null);
}

/* =================================================================
   Os lugares no mapa
   -----------------------------------------------------------------
   Como no Atlas de Tyrenar. Os impressos já estão desenhados na
   imagem: o portal só põe por cima áreas clicáveis invisíveis, um
   círculo em volta do ponto (raio) e um retângulo sobre o nome
   escrito (caixa). O mouse em cima acende um anel em volta do ponto
   e um rótulo com o nome e o tipo; reino e regiões, que não têm
   ponto, escurecem a caixa do nome. Os visíveis (o relevo e o que
   for marcado pelo portal) são um círculo de ferro com o glifo.

   Cada lugar fica no seu ponto da camada dos lugares, que o visor.js
   move junto com a imagem. Por dentro, o .lugar__ponto desfaz o zoom
   (--escala): o anel, a área clicável e o marcador ficam do mesmo
   tamanho na tela. A caixa do nome não desfaz, porque acompanha o
   nome escrito na imagem.
   ================================================================= */

// Medidas na tela, em px: as mesmas do mapas.css
const MEDIDAS_DOS_LUGARES = {
  anelMinimo: 28, // o menor diâmetro do anel em volta do ponto
  folgaDoAnel: 30 / 4000, // como no atlas, o anel passa 30 px do ponto num mapa de 4000 px de largura
  folgaDaCaixa: 4, // em volta do nome escrito
  marca: 30, // o círculo dos marcadores visíveis
  crescimento: 1.18, // o marcador visível com o mouse em cima
  espacoDoRotulo: 10, // entre o lugar e o rótulo
  folgaDoHalo: 8, // entre o anel e o halo
  tracinho: 6, // os quatro tracinhos do halo
};

const NOMES_DOS_TIPOS = {
  capital: "Capital",
  cidade: "Cidade",
  vila: "Vila",
  reino: "Reino",
  regiao: "Região",
  relevo: "Relevo",
  lugar: "Lugar",
};

// O índice do painel, nesta ordem; dentro de cada grupo, por nome
const GRUPOS_DO_INDICE = [
  { nome: "Reino e terras", tipos: ["reino", "regiao"] },
  { nome: "Capital", tipos: ["capital"] },
  { nome: "Cidades", tipos: ["cidade"] },
  { nome: "Vilas", tipos: ["vila"] },
  { nome: "Relevo", tipos: ["relevo"] },
  { nome: "Outros lugares", tipos: ["lugar"] },
];

// Os impressos usam o ícone do tipo, com o desenho do atlas; os visíveis, o próprio glifo
const ICONES_DOS_TIPOS = {
  capital: "icone-capital",
  cidade: "icone-cidade",
  vila: "icone-vila",
  reino: "icone-reino",
  regiao: "icone-reino",
  relevo: "glifo-montanha",
};
const iconeDoLugar = (m) => (m.impresso ? ICONES_DOS_TIPOS[m.tipo] ?? "glifo-marco" : `glifo-${m.glifo}`);

const semPonto = (m) => m.impresso && !m.raio;
const ehOculto = (m) => m.visibilidade === "admin";

const lugares = {
  mapa: null, // o mapa aberto no visor
  porId: new Map(), // id → { marcador, elemento, ponto }
  selecionado: null, // o id do lugar escolhido, com o detalhe aberto no painel
  halo: null, // { svg, traco, tracinhos } em volta do escolhido
  aceso: { lista: null, mapa: null }, // o lugar com o anel aceso pelo mouse, no índice ou no mapa
  busca: "",
  destacar: false,
  gaveta: false, // no celular, a gaveta do painel aberta
};

// Um rótulo só, que vai para o lugar com o mouse em cima
const rotulo = { elemento: criar("span", "rotulo-lugar"), id: null };

/* ---------- Montar os lugares na camada ---------- */

function alvoDoLugar(m, classe) {
  const alvo = criar("div", `lugar__alvo ${classe}`);
  alvo.addEventListener("pointerenter", (evento) => {
    acender("mapa", m.id);
    // No dedo, o rótulo só piscaria: o toque já abre o lugar
    if (evento.pointerType !== "touch") mostrarRotulo(m.id);
  });
  alvo.addEventListener("pointerleave", () => {
    if (lugares.aceso.mapa === m.id) acender("mapa", null);
    if (rotulo.id === m.id) esconderRotulo();
  });
  alvo.addEventListener("click", () => selecionarLugar(m.id));
  return alvo;
}

function montarLugar(m, { largura, altura }) {
  const classes = ["lugar", m.impresso ? "lugar--impresso" : "lugar--visivel"];
  if (semPonto(m)) classes.push("lugar--sem-ponto");
  if (m.glifo === "arcano") classes.push("lugar--arcano");
  if (ehOculto(m)) classes.push("lugar--oculto");
  const elemento = criar("div", classes.join(" "));
  elemento.dataset.id = m.id;
  elemento.style.setProperty("left", `${m.x * largura}px`);
  elemento.style.setProperty("top", `${m.y * altura}px`);
  const ponto = criar("div", "lugar__ponto");

  if (m.impresso && m.caixa) {
    const [x0, y0, x1, y1] = m.caixa;
    const caixa = alvoDoLugar(m, "lugar__caixa");
    caixa.style.setProperty("left", `${(x0 - m.x) * largura}px`);
    caixa.style.setProperty("top", `${(y0 - m.y) * altura}px`);
    caixa.style.setProperty("width", `${(x1 - x0) * largura}px`);
    caixa.style.setProperty("height", `${(y1 - y0) * altura}px`);
    if (ehOculto(m) && semPonto(m)) caixa.append(criar("span", "lugar__nevoa"));
    elemento.append(caixa);
  }

  if (m.impresso && m.raio) {
    // Em px da imagem, antes do zoom: o raio da área clicável e o diâmetro do anel
    elemento.style.setProperty("--raio", String(m.raio * largura));
    elemento.style.setProperty("--anel", String((2 * m.raio + MEDIDAS_DOS_LUGARES.folgaDoAnel) * largura));
    if (ehOculto(m)) ponto.append(criar("span", "lugar__nevoa"));
    ponto.append(criar("span", "lugar__anel"), alvoDoLugar(m, "lugar__area"));
  }

  if (!m.impresso) {
    const marca = alvoDoLugar(m, "lugar__marca");
    marca.append(simbolo(`glifo-${m.glifo}`));
    ponto.append(marca);
  }

  elemento.append(ponto);
  return { marcador: m, elemento, ponto };
}

// Monta os lugares do mapa aberto. Ao recarregar os dados, o lugar escolhido continua escolhido, se ainda existir.
function mostrarLugares(mapa, { novo = false } = {}) {
  if (novo) limparLugares();
  const selecionado = lugares.selecionado;
  esconderRotulo();
  desmarcarLugar();
  lugares.aceso = { lista: null, mapa: null };
  lugares.mapa = mapa;

  // Os impressos embaixo, os marcadores visíveis por cima
  const itens = [...mapa.marcadores].sort((a, b) => Number(!a.impresso) - Number(!b.impresso)).map((m) => montarLugar(m, mapa));
  lugares.porId = new Map(itens.map((item) => [item.marcador.id, item]));
  $("#visor-lugares").replaceChildren(...itens.map((item) => item.elemento));

  const quantos = mapa.marcadores.length;
  $("#painel-contagem").textContent = quantos === 1 ? "1 lugar" : `${quantos} lugares`;
  renderizarLista();
  if (selecionado && lugares.porId.has(selecionado)) selecionarLugar(selecionado, { mover: false, endereco: false, gaveta: false });
  else if (selecionado) fecharDetalhe();
}

function limparLugares() {
  esconderRotulo();
  desmarcarLugar();
  Object.assign(lugares, { mapa: null, porId: new Map(), aceso: { lista: null, mapa: null }, busca: "" });
  $("#busca-lugares").value = "";
  $("#visor-lugares").replaceChildren();
  $("#lista-lugares").replaceChildren();
  $("#lista-lugares").hidden = false;
  $("#detalhe-lugar").replaceChildren();
  $("#detalhe-lugar").hidden = true;
  abrirGaveta(false);
}

/* ---------- O anel aceso e o rótulo ---------- */

// Acende o anel de um lugar (ou apaga, com null). O índice e o mapa acendem cada um o seu.
function acender(origem, id) {
  const antes = lugares.aceso[origem];
  if (antes === id) return;
  lugares.aceso[origem] = id;
  for (const qual of [antes, id]) {
    const item = qual && lugares.porId.get(qual);
    if (item) item.elemento.classList.toggle("lugar--aceso", qual === lugares.aceso.lista || qual === lugares.aceso.mapa);
  }
}

// Até onde o lugar vai na tela, em px a partir do ponto (x, y): o anel, o marcador ou a caixa do nome
function extensaoNaTela(m) {
  const escala = visor.escala;
  const { largura, altura } = lugares.mapa;
  const { anelMinimo, folgaDoAnel, folgaDaCaixa, marca, crescimento } = MEDIDAS_DOS_LUGARES;
  if (semPonto(m)) {
    const [x0, y0, x1, y1] = m.caixa;
    return {
      esquerda: (x0 - m.x) * largura * escala - folgaDaCaixa,
      direita: (x1 - m.x) * largura * escala + folgaDaCaixa,
      topo: (y0 - m.y) * altura * escala - folgaDaCaixa,
      baixo: (y1 - m.y) * altura * escala + folgaDaCaixa,
    };
  }
  const raio = m.impresso ? Math.max(anelMinimo, (2 * m.raio + folgaDoAnel) * largura * escala) / 2 : (marca * crescimento) / 2;
  return { esquerda: -raio, direita: raio, topo: -raio, baixo: raio };
}

function mostrarRotulo(id) {
  const item = lugares.porId.get(id);
  if (!item) return;
  rotulo.elemento.replaceChildren(item.marcador.nome, criar("small", null, NOMES_DOS_TIPOS[item.marcador.tipo]));
  item.ponto.append(rotulo.elemento);
  rotulo.id = id;
  posicionarRotulo();
}

function esconderRotulo() {
  rotulo.elemento.remove();
  rotulo.id = null;
}

// À direita do lugar; se não couber antes da coluna de ferramentas, à esquerda
function posicionarRotulo() {
  const item = rotulo.id && lugares.porId.get(rotulo.id);
  if (!item) return;
  const { espacoDoRotulo } = MEDIDAS_DOS_LUGARES;
  const extensao = extensaoNaTela(item.marcador);
  const elemento = rotulo.elemento;
  elemento.classList.remove("rotulo-lugar--esquerda");
  elemento.style.setProperty("left", `${extensao.direita + espacoDoRotulo}px`);
  elemento.style.setProperty("top", `${(extensao.topo + extensao.baixo) / 2}px`);
  const limite = $(".visor__ferramentas").getBoundingClientRect().left - espacoDoRotulo;
  if (elemento.getBoundingClientRect().right > limite) {
    elemento.classList.add("rotulo-lugar--esquerda");
    elemento.style.setProperty("left", `${extensao.esquerda - espacoDoRotulo}px`);
  }
}

/* ---------- O halo em brasa do lugar escolhido ---------- */

const SVG = "http://www.w3.org/2000/svg";

function criarHalo(item) {
  const svg = document.createElementNS(SVG, "svg");
  svg.setAttribute("class", "halo");
  svg.setAttribute("aria-hidden", "true");
  // No reino e nas regiões, que não têm ponto, o halo contorna o nome escrito
  const traco = document.createElementNS(SVG, semPonto(item.marcador) ? "rect" : "circle");
  traco.setAttribute("class", "halo__traco");
  traco.setAttribute("pathLength", "100");
  const tracinhos = document.createElementNS(SVG, "path");
  tracinhos.setAttribute("class", "halo__tracinhos");
  svg.append(traco, tracinhos);
  item.ponto.append(svg);
  lugares.halo = { svg, traco, tracinhos };
  desenharHalo();
}

// O arco (ou o retângulo) que se completa e os quatro tracinhos, um em cada direção.
// As medidas mudam com o zoom; o traço se desenhando é animação do mapas.css.
function desenharHalo() {
  const item = lugares.selecionado && lugares.porId.get(lugares.selecionado);
  if (!item || !lugares.halo) return;
  const { svg, traco, tracinhos } = lugares.halo;
  const { folgaDoHalo, tracinho } = MEDIDAS_DOS_LUGARES;
  const extensao = extensaoNaTela(item.marcador);
  const largura = extensao.direita - extensao.esquerda + 2 * folgaDoHalo;
  const altura = extensao.baixo - extensao.topo + 2 * folgaDoHalo;
  const borda = tracinho + 4; // o espaço dos tracinhos em volta do traço
  const total = { largura: largura + 2 * borda, altura: altura + 2 * borda };

  svg.style.setProperty("left", `${extensao.esquerda - folgaDoHalo - borda}px`);
  svg.style.setProperty("top", `${extensao.topo - folgaDoHalo - borda}px`);
  svg.setAttribute("width", total.largura);
  svg.setAttribute("height", total.altura);
  svg.setAttribute("viewBox", `0 0 ${total.largura} ${total.altura}`);

  const cx = total.largura / 2;
  const cy = total.altura / 2;
  if (traco.localName === "circle") {
    traco.setAttribute("cx", cx);
    traco.setAttribute("cy", cy);
    traco.setAttribute("r", largura / 2);
    traco.setAttribute("transform", `rotate(-90 ${cx} ${cy})`); // começa no alto
  } else {
    traco.setAttribute("x", borda);
    traco.setAttribute("y", borda);
    traco.setAttribute("width", largura);
    traco.setAttribute("height", altura);
    traco.setAttribute("rx", 6);
  }
  const perto = borda - 3;
  const longe = borda - 3 - tracinho;
  tracinhos.setAttribute(
    "d",
    `M${cx} ${perto}V${longe}M${total.largura - perto} ${cy}H${total.largura - longe}` +
      `M${cx} ${total.altura - perto}V${total.altura - longe}M${perto} ${cy}H${longe}`,
  );
}

/* ---------- Escolher um lugar ---------- */

// Escolhe o lugar: o halo, o detalhe no painel, o endereço próprio e o mapa deslizando até ele
function selecionarLugar(id, { mover = true, animar = true, endereco = true, gaveta = true, focar = false } = {}) {
  const item = lugares.porId.get(id);
  if (!item) return;
  if (lugares.selecionado !== id) {
    desmarcarLugar();
    lugares.selecionado = id;
    item.elemento.classList.add("lugar--selecionado");
    criarHalo(item);
  }
  mostrarDetalhe(item.marcador, { focar });
  if (gaveta && TELA_DE_GAVETA.matches) abrirGaveta(true);
  if (endereco) trocarEndereco(`#${lugares.mapa.id}/${id}`);
  if (mover) visor.centralizar(item.marcador.x, item.marcador.y, { animar });
}

function desmarcarLugar() {
  const item = lugares.selecionado && lugares.porId.get(lugares.selecionado);
  item?.elemento.classList.remove("lugar--selecionado");
  lugares.halo?.svg.remove();
  lugares.halo = null;
  lugares.selecionado = null;
}

// Fecha o detalhe e volta ao índice (ou à busca). Com o foco no painel, ele volta ao nome do lugar.
function fecharDetalhe({ endereco = true, focar = false } = {}) {
  const id = lugares.selecionado;
  desmarcarLugar();
  $("#detalhe-lugar").replaceChildren();
  $("#detalhe-lugar").hidden = true;
  $("#lista-lugares").hidden = false;
  if (endereco && lugares.mapa) trocarEndereco(`#${lugares.mapa.id}`);
  if (focar) ($(`#lista-lugares [data-id="${id}"]`) ?? $("#busca-lugares")).focus();
}

// O lugar do endereço (#mapa-xxxxxxxx/marca-xxxxxxxx), ao abrir o link ou com o Voltar do navegador
function mostrarLugarDoEndereco({ animar }) {
  const marca = marcaDoEndereco();
  if (marca === lugares.selecionado) return;
  if (!marca) return fecharDetalhe({ endereco: false });
  if (!lugares.porId.has(marca)) {
    avisoRapido("Esse lugar não existe ou não está disponível para você.");
    return fecharDetalhe();
  }
  selecionarLugar(marca, { animar, endereco: false });
}

async function copiarLink(m) {
  const link = `${location.origin}${location.pathname}#${lugares.mapa.id}/${m.id}`;
  try {
    await navigator.clipboard.writeText(link);
    avisoRapido("Link copiado. Quem abrir vai direto neste lugar.");
  } catch {
    avisoRapido(link);
  }
}

/* =================================================================
   O painel dos lugares
   -----------------------------------------------------------------
   À esquerda no computador; no celular, uma gaveta no rodapé. Sem
   busca, o índice em grupos; com busca (no nome e no apelido, sem
   acentos), os lugares encontrados. Clicar num nome troca a lista
   pelo detalhe do lugar. Para o administrador, os lugares ocultos
   aparecem cobertos de névoa, aqui e no mapa.
   ================================================================= */

function itemDoIndice(m, { comTipo = false } = {}) {
  const oculto = ehOculto(m);
  const linha = criar("li");
  const classes = ["indice__item"];
  if (m.glifo === "arcano") classes.push("indice__item--arcano");
  if (oculto) classes.push("indice__item--oculto");
  const item = criar("button", classes.join(" "));
  item.type = "button";
  item.dataset.id = m.id;
  item.append(simbolo(iconeDoLugar(m)), criar("span", "indice__nome", m.nome));
  if (comTipo) item.append(criar("span", "indice__tipo", NOMES_DOS_TIPOS[m.tipo]));
  if (oculto) item.append(criar("span", "sr", ", só o administrador vê"));
  item.addEventListener("click", () => selecionarLugar(m.id, { focar: true }));
  item.addEventListener("pointerenter", () => acender("lista", m.id));
  item.addEventListener("pointerleave", () => acender("lista", null));
  linha.append(item);
  return linha;
}

function grupoDoIndice(nome, doGrupo, opcoes) {
  if (!doGrupo.length) return null;
  const secao = criar("section", "indice__grupo");
  const titulo = criar("h3", "indice__titulo", nome);
  titulo.append(criar("small", null, String(doGrupo.length)));
  const itens = criar("ul", "indice__itens");
  itens.append(...doGrupo.sort(porNome).map((m) => itemDoIndice(m, opcoes)));
  secao.append(titulo, itens);
  return secao;
}

function renderizarLista() {
  const lista = $("#lista-lugares");
  acender("lista", null);
  const marcadores = lugares.mapa?.marcadores ?? [];
  if (!marcadores.length) {
    lista.replaceChildren(criar("p", "lista-lugares__vazia", "Nenhum lugar marcado neste mapa ainda."));
    return;
  }
  const busca = normalizar(lugares.busca.trim());
  if (busca) {
    const achados = marcadores.filter((m) => normalizar(m.nome).includes(busca) || normalizar(m.apelido).includes(busca));
    if (achados.length) lista.replaceChildren(grupoDoIndice("Encontrados", achados, { comTipo: true }));
    else lista.replaceChildren(criar("p", "lista-lugares__vazia", "Nenhum lugar com esse nome."));
    return;
  }
  const grupos = GRUPOS_DO_INDICE.map((grupo) => grupoDoIndice(grupo.nome, marcadores.filter((m) => grupo.tipos.includes(m.tipo))));
  lista.replaceChildren(...grupos.filter(Boolean));
}

function botaoDoDetalhe(texto, icone, aoClicar) {
  const elemento = botao("", "botao--leve detalhe-lugar__acao", aoClicar);
  elemento.append(simbolo(icone), texto);
  return elemento;
}

// "Índice" para voltar, o nome com o ícone e o tipo, o apelido, a descrição e as ações
function mostrarDetalhe(m, { focar = false } = {}) {
  const detalhe = $("#detalhe-lugar");
  const voltar = botaoDoDetalhe("Índice", "icone-voltar", () => fecharDetalhe({ focar: true }));
  voltar.classList.add("detalhe-lugar__voltar");

  const cabeca = criar("header", "detalhe-lugar__cabeca");
  const icone = criar("span", `detalhe-lugar__icone${m.glifo === "arcano" ? " detalhe-lugar__icone--arcano" : ""}`);
  icone.append(simbolo(iconeDoLugar(m)));
  const titulos = criar("div", "detalhe-lugar__titulos");
  const nome = criar("h2", "detalhe-lugar__nome", m.nome);
  nome.id = "detalhe-nome";
  titulos.append(nome, criar("p", "detalhe-lugar__tipo", NOMES_DOS_TIPOS[m.tipo]));
  cabeca.append(icone, titulos);

  const partes = [voltar, cabeca];
  if (m.apelido) partes.push(criar("p", "detalhe-lugar__apelido", m.apelido));
  if (ehOculto(m)) partes.push(seloOculto());
  if (m.descricao) {
    const texto = criar("div", "detalhe-lugar__texto");
    texto.append(...paragrafosDe(m.descricao));
    partes.push(texto);
  }
  const acoes = criar("div", "detalhe-lugar__acoes");
  acoes.append(
    botaoDoDetalhe("Centralizar", "icone-alvo", () => visor.centralizar(m.x, m.y)),
    botaoDoDetalhe("Copiar link", "icone-corrente", () => copiarLink(m)),
  );
  partes.push(acoes);

  detalhe.replaceChildren(...partes);
  detalhe.setAttribute("aria-labelledby", nome.id);
  $("#lista-lugares").hidden = true;
  detalhe.hidden = false;
  detalhe.scrollTop = 0;
  if (focar) voltar.focus();
}

function abrirGaveta(aberta) {
  lugares.gaveta = aberta;
  $("#painel-lugares").classList.toggle("painel-lugares--aberto", aberta);
  $("#painel-alca").setAttribute("aria-expanded", String(aberta));
}

function focarBusca() {
  if (TELA_DE_GAVETA.matches) abrirGaveta(true);
  const busca = $("#busca-lugares");
  busca.focus();
  busca.select();
}

// "/" leva à busca; Esc fecha o detalhe
function aoTeclarNosLugares(evento) {
  if (!navegacao.aberto || evento.defaultPrevented || evento.ctrlKey || evento.metaKey || evento.altKey) return;
  if (document.querySelector("dialog[open]")) return;
  if (evento.key === "/" && !evento.target.closest?.("input, textarea, select, [contenteditable]")) {
    evento.preventDefault();
    focarBusca();
  } else if (evento.key === "Escape" && lugares.selecionado) {
    evento.preventDefault();
    fecharDetalhe({ focar: $("#painel-lugares").contains(document.activeElement) });
  }
}

function configurarLugares() {
  $("#busca-lugares").addEventListener("input", (evento) => {
    lugares.busca = evento.target.value;
    if (lugares.selecionado) fecharDetalhe();
    renderizarLista();
  });
  $("#painel-alca").addEventListener("click", () => abrirGaveta(!lugares.gaveta));

  // "Destacar lugares": um anel suave em todos os impressos, para quem não sabe onde clicar
  $("#visor-destacar").addEventListener("click", () => {
    lugares.destacar = !lugares.destacar;
    $("#visor-destacar").setAttribute("aria-pressed", String(lugares.destacar));
    $("#visor-lugares").classList.toggle("visor__lugares--destaque", lugares.destacar);
  });

  document.addEventListener("keydown", aoTeclarNosLugares);
  // O painel cobre parte do mapa: quando ele muda de tamanho (a gaveta abrindo, por exemplo), o visor se ajusta
  new ResizeObserver(() => visor.ajustar()).observe($("#painel-lugares"));
}

/* =================================================================
   A imagem do mapa: medida e reduzida aqui mesmo
   -----------------------------------------------------------------
   O servidor não tem bibliotecas para mexer em imagens. Então o
   navegador abre a imagem escolhida, mede a largura e a altura e
   faz a miniatura da galeria num <canvas>, em WEBP.
   ================================================================= */

function abrirImagem(endereco) {
  return new Promise((resolver, rejeitar) => {
    const img = new Image();
    img.addEventListener("load", () => resolver(img), { once: true });
    img.addEventListener("error", () => rejeitar(new Error("Não foi possível abrir essa imagem. Escolha outra.")), { once: true });
    img.src = endereco;
  });
}

function desenharReduzida(fonte, largura, altura) {
  const canvas = document.createElement("canvas");
  canvas.width = largura;
  canvas.height = altura;
  const contexto = canvas.getContext("2d");
  contexto.imageSmoothingEnabled = true;
  contexto.imageSmoothingQuality = "high";
  contexto.drawImage(fonte, 0, 0, largura, altura);
  return canvas;
}

// Uns 640 px no lado maior. Reduz em passos (4, 2 e 1 vez o tamanho final) para o traço não serrilhar.
async function fazerMiniatura(img) {
  const escala = Math.min(1, CONFIG.ladoMiniatura / Math.max(img.naturalWidth, img.naturalHeight));
  const largura = Math.max(1, Math.round(img.naturalWidth * escala));
  const altura = Math.max(1, Math.round(img.naturalHeight * escala));
  let fonte = img;
  for (let fator = 4; fator > 1; fator /= 2) {
    if (largura * fator < img.naturalWidth) fonte = desenharReduzida(fonte, largura * fator, altura * fator);
  }
  const canvas = desenharReduzida(fonte, largura, altura);
  const blob = await new Promise((resolver) => canvas.toBlob(resolver, "image/webp", 0.85));
  if (!blob) throw new Error("Não foi possível fazer a miniatura do mapa. Tente outra imagem.");
  // Um navegador sem WEBP no canvas entrega PNG, que o servidor também aceita
  return new File([blob], blob.type === "image/webp" ? "miniatura.webp" : "miniatura.png", { type: blob.type });
}

// Confere, mede e reduz a imagem escolhida. Devolve o que vai para o servidor.
async function prepararImagem(arquivo) {
  if (!TIPOS_ACEITOS.includes(arquivo.type)) throw new Error("Use imagens PNG, JPG, WEBP, GIF ou AVIF.");
  if (arquivo.size > CONFIG.maxMapa) throw new Error(`O mapa pode ter no máximo 25 MB. Este tem ${emMegabytes(arquivo.size)}.`);
  const endereco = URL.createObjectURL(arquivo);
  try {
    const img = await abrirImagem(endereco);
    const largura = img.naturalWidth;
    const altura = img.naturalHeight;
    if (!largura || !altura) throw new Error("Não foi possível medir essa imagem. Escolha outra.");
    if (largura > CONFIG.ladoMaximo || altura > CONFIG.ladoMaximo) {
      throw new Error(`A imagem pode ter no máximo ${CONFIG.ladoMaximo} px de lado.`);
    }
    return { arquivo, miniatura: await fazerMiniatura(img), largura, altura };
  } finally {
    URL.revokeObjectURL(endereco);
  }
}

/* =================================================================
   Enviar e alterar (só o administrador)
   -----------------------------------------------------------------
   Ao escolher a imagem, ela já é medida e reduzida, e a miniatura
   aparece no formulário. Trocar a imagem de um mapa mantém os
   lugares: as posições são proporções da largura e da altura.
   ================================================================= */

const edicao = {
  mapa: null, // o mapa sendo alterado, ou null para um novo
  mesas: new Set(),
  preparo: null, // a imagem escolhida sendo medida e reduzida (promessa)
};

const formEdicao = () => $("#form-edicao");

function mostrarErroDaEdicao(texto) {
  const erro = $("#erro-edicao");
  erro.textContent = texto;
  erro.hidden = !texto;
}

function mostrarAndamento(texto) {
  const andamento = $("#andamento-edicao");
  andamento.textContent = texto;
  andamento.hidden = !texto;
}

function mostrarPreviaDaImagem(src, legenda) {
  const caixa = $("#previa-imagem");
  caixa.hidden = !src;
  if (!src) return;
  caixa.querySelector("img").src = src;
  $("#legenda-imagem").textContent = legenda;
}

function mostrarImagemAtual() {
  const mapa = edicao.mapa;
  mostrarPreviaDaImagem(mapa?.miniatura, mapa ? `Imagem atual · ${mapa.largura} × ${mapa.altura} px` : "");
}

// As mesas do portal; nenhuma marcada quer dizer Draevor
function renderizarEscolhaMesas() {
  const raiz = $("#escolha-mesas");
  if (!estado.mesas.length) {
    raiz.replaceChildren(criar("p", "escolhas__vazio", "Nenhuma mesa cadastrada ainda."));
    return;
  }
  raiz.replaceChildren(
    ...estado.mesas.map((mesa) => {
      const chip = criar("button", "etiqueta-mesa", mesa.nome);
      chip.type = "button";
      chip.style.setProperty("--cor", corVisivel(mesa.cor));
      chip.setAttribute("aria-pressed", String(edicao.mesas.has(mesa.id)));
      chip.addEventListener("click", () => {
        if (edicao.mesas.has(mesa.id)) edicao.mesas.delete(mesa.id);
        else edicao.mesas.add(mesa.id);
        chip.setAttribute("aria-pressed", String(edicao.mesas.has(mesa.id)));
      });
      return chip;
    }),
  );
}

function abrirEdicao(mapa = null) {
  if (!ehAdmin()) return;
  const form = formEdicao();
  form.reset();
  edicao.mapa = mapa;
  edicao.mesas = new Set(mapa?.mesas ?? []);
  edicao.preparo = null;
  mostrarErroDaEdicao("");
  mostrarAndamento("");

  $("#edicao-titulo").textContent = mapa ? `Alterar ${mapa.nome}` : "Novo mapa";
  $("#edicao-enviar").textContent = mapa ? "Salvar" : "Enviar";
  $("#edicao-apagar").hidden = !mapa;
  $("#ajuda-imagem").textContent = mapa
    ? "Escolha outra imagem só para trocar o mapa. Os lugares continuam onde estão."
    : "PNG, JPG ou WEBP, até 25 MB. A miniatura da galeria é feita aqui mesmo, na hora.";

  form.nome.value = mapa?.nome ?? "";
  form.descricao.value = mapa?.descricao ?? "";
  form.visibilidade.value = mapa?.visibilidade ?? "todos";
  renderizarEscolhaMesas();
  mostrarImagemAtual();

  $("#dialogo-edicao").showModal();
  $(".edicao__campos").scrollTop = 0;
  form.nome.focus();
}

// Mede e reduz assim que a imagem é escolhida; se outra for escolhida no meio, vale a última
async function escolherImagem() {
  const form = formEdicao();
  const arquivo = form.imagem.files[0];
  mostrarErroDaEdicao("");
  if (!arquivo) {
    edicao.preparo = null;
    mostrarAndamento("");
    mostrarImagemAtual();
    return;
  }
  const preparo = prepararImagem(arquivo);
  edicao.preparo = preparo;
  mostrarAndamento("Medindo a imagem e fazendo a miniatura…");
  try {
    const pronta = await preparo;
    if (edicao.preparo !== preparo) return;
    mostrarAndamento("");
    const legenda = `${edicao.mapa ? "Nova imagem" : "Imagem"} · ${pronta.largura} × ${pronta.altura} px · ${emMegabytes(arquivo.size)}`;
    mostrarPreviaDaImagem(URL.createObjectURL(pronta.miniatura), legenda);
  } catch (falha) {
    if (edicao.preparo !== preparo) return;
    edicao.preparo = null;
    form.imagem.value = "";
    mostrarAndamento("");
    mostrarImagemAtual();
    mostrarErroDaEdicao(falha.message);
  }
}

async function enviarEdicao(evento) {
  evento.preventDefault();
  const form = formEdicao();
  mostrarErroDaEdicao("");
  const nome = form.nome.value.trim();
  if (!nome) return mostrarErroDaEdicao("Escreva o nome do mapa.");
  if (!edicao.mapa && !edicao.preparo) return mostrarErroDaEdicao("Escolha a imagem do mapa.");

  const enviar = $("#edicao-enviar");
  enviar.disabled = true;
  try {
    let imagem = null;
    if (edicao.preparo) {
      mostrarAndamento("Fazendo a miniatura…");
      imagem = await edicao.preparo;
    }
    const dados = {
      nome,
      mesas: [...edicao.mesas],
      descricao: form.descricao.value.trim(),
      visibilidade: form.visibilidade.value,
      imagem,
    };
    mostrarAndamento(imagem ? `Enviando o mapa (${emMegabytes(imagem.arquivo.size)})…` : "Salvando…");
    const mapa = edicao.mapa;
    if (mapa) await api.alterar(mapa.id, dados);
    else await api.enviar(dados);
    $("#dialogo-edicao").close();
    await recarregar();
    avisoRapido(mapa ? "Mapa salvo." : "Mapa enviado.");
  } catch (falha) {
    mostrarErroDaEdicao(falha.message);
  } finally {
    mostrarAndamento("");
    enviar.disabled = false;
  }
}

async function apagarMapa() {
  const mapa = edicao.mapa;
  if (!mapa) return;
  const quantos = mapa.marcadores.length;
  const lugares = quantos ? ` e ${quantos === 1 ? "o lugar marcado nele" : `os ${quantos} lugares marcados nele`}` : "";
  const confirmado = await perguntar({
    titulo: "Apagar este mapa?",
    texto: `${mapa.nome} sai da página de vez, com a imagem${lugares}.`,
    confirmar: "Apagar",
    cancelar: "Cancelar",
    perigo: true,
  });
  if (!confirmado) return;
  try {
    await api.apagar(mapa.id);
    $("#dialogo-edicao").close();
    await recarregar();
    avisoRapido("Mapa apagado.");
  } catch (falha) {
    avisarFalha(falha);
  }
}

function configurarEdicao() {
  const form = formEdicao();
  form.addEventListener("submit", enviarEdicao);
  form.imagem.addEventListener("change", escolherImagem);
  $("#edicao-cancelar").addEventListener("click", () => $("#dialogo-edicao").close());
  $("#edicao-apagar").addEventListener("click", apagarMapa);
}

/* =================================================================
   Carregar e desenhar tudo
   ================================================================= */

function renderizarTudo() {
  atualizarTopo();
  $("#botao-novo").hidden = !ehAdmin();
  renderizarGaleria();
}

async function recarregar() {
  const dados = await api.mapas();
  Object.assign(estado, { conta: dados.conta, mesas: dados.mesas, mapas: dados.mapas });
  renderizarTudo();
  // Com o visor aberto, o mapa pode ter deixado de existir para esta conta. O lugar escolhido continua o mesmo.
  if (navegacao.aberto) mostrarRota(undefined, { lugarDoEndereco: false });
}

/* =================================================================
   Eventos da página
   ================================================================= */

// O cabeçalho fica preso no alto; a barra lateral precisa saber o tamanho dele.
// No celular, a barra vai para o rodapé e o visor termina acima dela.
function medirAlturas() {
  const topo = $("#topo");
  const barra = $(".barra-lateral");
  const aplicar = () => {
    document.documentElement.style.setProperty("--altura-topo", `${topo.offsetHeight}px`);
    document.documentElement.style.setProperty("--altura-barra", `${barra.offsetHeight}px`);
  };
  const observador = new ResizeObserver(aplicar);
  observador.observe(topo);
  observador.observe(barra);
  aplicar();
}

function configurarEventos() {
  $("#botao-novo").addEventListener("click", () => abrirEdicao());
  $("#visor-voltar").addEventListener("click", voltarAGaleria);

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
  configurarLugares();
  iniciarCinzas(30);
  if (MODO_PREVIA) configurarSimulacao();

  try {
    await recarregar();
  } catch (falha) {
    if (falha.codigo === "sem-sessao") return irParaEntrada({ voltar: true });
    $("#pagina").hidden = false;
    $("#galeria").replaceChildren(criar("p", "galeria-vazia", falha.message));
    return;
  }
  $("#pagina").hidden = false;

  atualizarStatus();
  setInterval(atualizarStatus, CONFIG.intervaloStatus);

  // Link direto para um mapa: abre no visor. O Voltar e o Avançar do navegador trocam entre visor e galeria.
  // Depois de o endereço mudar por fora (um link de lugar colado, por exemplo), a galeria pode não ser mais
  // a página anterior: "Voltar aos mapas" deixa de usar o Voltar do navegador.
  const aoMudarOEndereco = () => {
    navegacao.pelaGaleria = false;
    mostrarRota();
  };
  window.addEventListener("popstate", aoMudarOEndereco);
  window.addEventListener("hashchange", aoMudarOEndereco);
  mostrarRota();
}

iniciar();
