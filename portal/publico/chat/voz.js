/* =================================================================
   Crônicas Eternas: Chat (voz e vídeo)
   -----------------------------------------------------------------
   As salas de voz do chat, pelo LiveKit (livekit-client.js, que
   expõe "LivekitClient"). Clicar numa sala na lista entra nela;
   estando numa, clicar noutra troca. Uma sala por vez. Entra com o
   microfone ligado e a câmera desligada.

   - O painel de voz fica embaixo da lista enquanto conectado, com
     Microfone, Ensurdecer, Câmera, Tela, Sair e a engrenagem.
   - A sala aberta no centro é uma grade de quadros, um por pessoa;
     uma tela compartilhada vai para o quadro grande.
   - Clique direito num quadro ou num nome na lista: o volume daquela
     pessoa, só para você.

   O passe de entrada vem de POST /api/chat/voz/entrar; o ensurdecido,
   que o LiveKit não sabe, vai para POST /api/chat/voz/estado.

   Na prévia, a voz é simulada (sem o livekit-client): entrar mostra
   quadros com retratos, o "falando" alterna entre eles e os botões
   mudam os estados.

   Usa o chat.js (carregado antes): estado, ganchosDaVoz, acharCanal(),
   retratoDe(), nomeDaPersona(), personaEscolhidaDa(), desenharLista(),
   lerLocal(), gravarLocal(), eu(); e o comum.js: pedir(), criar(),
   simbolo(), avisarFalha(), avisoRapido().
   ================================================================= */

const CONFIG_DA_VOZ = {
  intervaloDaFala: 1800, // prévia: de quanto em quanto tempo troca quem fala
  esperaDaPrevia: 500, // prévia: o "Conectando…"
  chaveDosAparelhos: "chat:voz:aparelhos",
  chaveDosVolumes: "chat:voz:volumes",
};

const TEXTO_DA_SITUACAO = {
  conectando: "Conectando…",
  conectado: "Conectado",
  reconectando: "Reconectando…",
};

/* =================================================================
   O que fica guardado neste computador
   ================================================================= */

function lerObjetoLocal(chave) {
  try {
    const valor = JSON.parse(lerLocal(chave) || "null");
    return valor && typeof valor === "object" && !Array.isArray(valor) ? valor : {};
  } catch {
    return {};
  }
}

// Os aparelhos escolhidos ("" = o padrão do sistema)
const aparelhos = { microfone: "", saida: "", camera: "", ruido: true, eco: true };
{
  const guardados = lerObjetoLocal(CONFIG_DA_VOZ.chaveDosAparelhos);
  for (const chave of ["microfone", "saida", "camera"]) if (typeof guardados[chave] === "string") aparelhos[chave] = guardados[chave];
  for (const chave of ["ruido", "eco"]) if (typeof guardados[chave] === "boolean") aparelhos[chave] = guardados[chave];
}
const guardarAparelhos = () => gravarLocal(CONFIG_DA_VOZ.chaveDosAparelhos, JSON.stringify(aparelhos));

// O volume de cada pessoa, só para você: usuario → { volume: 0 a 100, silenciado }
const volumes = lerObjetoLocal(CONFIG_DA_VOZ.chaveDosVolumes);
const guardarVolumes = () => gravarLocal(CONFIG_DA_VOZ.chaveDosVolumes, JSON.stringify(volumes));

function volumeDe(usuario) {
  const guardado = volumes[usuario];
  const numero = Number(guardado?.volume);
  return {
    volume: Number.isFinite(numero) ? Math.min(100, Math.max(0, Math.round(numero))) : 100,
    silenciado: Boolean(guardado?.silenciado),
  };
}

// O que de fato toca: 0 com você ensurdecido ou a pessoa silenciada
function volumeQueToca(usuario) {
  if (voz.ensurdecido) return 0;
  const { volume, silenciado } = volumeDe(usuario);
  return silenciado ? 0 : volume / 100;
}

/* =================================================================
   Estado da voz
   ================================================================= */

const voz = {
  motor: null, // o LiveKit (ou o simulado da prévia) da sala em que você está
  sala: null, // o id do canal de voz
  situacao: "fora", // "fora" | "conectando" | "conectado" | "reconectando" | "caiu"
  queda: "", // a mensagem quando caiu
  tentativa: 0, // cada entrada tem um número: avisos de uma entrada antiga não valem
  ensurdecido: false,
  mudoAntes: false, // o microfone de antes de ensurdecer
  somBloqueado: false, // o navegador pede um clique para tocar o som
  entrarAoAbrir: null, // a sala clicada na lista: entra quando ela abrir
  ampliado: undefined, // undefined = a tela compartilhada, se houver; null = a grade; "chave" = aquele quadro
  quadros: new Map(), // chave → { elemento, midia, video, trilha, modo }
  chamada: null, // o elemento da grade, guardado para não recriar os vídeos
  arranjo: "",
  assinaturaDaLista: "",
  desenhoPendente: false,
};

const salaConectada = () => (voz.motor && voz.situacao !== "caiu" ? voz.sala : null);
const pessoaLocal = () => voz.motor?.pessoas().find((p) => p.local) ?? null;

function lerMetadata(texto) {
  try {
    const valor = JSON.parse(texto || "{}");
    return valor && typeof valor === "object" ? valor : {};
  } catch {
    return {};
  }
}

// A sua persona numa sala: a escolhida na mesa, ou a conta
function minhaPersonaNa(idSala) {
  const mesa = acharCanal(idSala)?.categoria.mesa;
  if (mesa) {
    const escolhida = personaEscolhidaDa(mesa);
    if (escolhida) return escolhida;
  }
  return { tipo: "conta", id: eu(), nome: estado.dados?.conta.nome ?? eu(), imagem: null, fonte: null };
}

// A presença do servidor traz só nome, imagem e fonte: o tipo vem da categoria (para a cor do selo)
function personaDaPresenca(pessoa, categoria) {
  const tipo = categoria?.mesa ? "personagem" : "conta";
  return { tipo, id: pessoa.usuario, nome: pessoa.nome || pessoa.usuario, imagem: pessoa.imagem || null, fonte: pessoa.fonte || null };
}

// Quem está na sala conectada, com o ensurdecido (o seu daqui; o dos outros, da presença)
function pessoasDaSala() {
  const presenca = estado.dados?.voz?.salas?.[voz.sala] ?? [];
  return (voz.motor?.pessoas() ?? []).map((p) => ({
    ...p,
    ensurdecido: p.local ? voz.ensurdecido : Boolean(p.ensurdecido || presenca.find((x) => x.usuario === p.usuario)?.ensurdecido),
  }));
}

/* =================================================================
   Falhas de microfone, câmera e tela
   ================================================================= */

function textoDaFalhaDeAparelho(falha, aparelho) {
  const nome = { microfone: "o microfone", camera: "a câmera", tela: "a tela" }[aparelho];
  const nomeSolto = { microfone: "microfone", camera: "câmera", tela: "tela" }[aparelho];
  const tipo = falha?.name || "";
  if (tipo === "NotAllowedError" || tipo === "SecurityError") {
    return `O navegador não deixou usar ${nome}. Libere ${nome} nas permissões do site (o cadeado ao lado do endereço) e tente de novo.`;
  }
  if (tipo === "NotFoundError" || tipo === "OverconstrainedError") {
    return aparelho === "camera" ? "Nenhuma câmera encontrada neste computador." : "Nenhum microfone encontrado neste computador.";
  }
  if (tipo === "NotReadableError") return `${nome[0].toUpperCase()}${nome.slice(1)} está sendo usad${aparelho === "microfone" ? "o" : "a"} por outro programa.`;
  return `Não foi possível ligar ${nome}${nomeSolto === "tela" ? " compartilhada" : ""}.`;
}

/* =================================================================
   O motor do LiveKit
   -----------------------------------------------------------------
   Os dois motores (este e o simulado da prévia) têm os mesmos nomes:
   conectar(), pessoas(), definirMicrofone(), definirCamera(),
   definirTela(), aplicarVolumes(), trocarAparelho(),
   reiniciarMicrofone(), liberarSom() e sair(). Cada pessoa é
   { usuario, persona, local, mudo, camera, tela, falando,
     trilhaCamera, trilhaTela }.
   ================================================================= */

function opcoesDoMicrofone() {
  return {
    deviceId: aparelhos.microfone ? { ideal: aparelhos.microfone } : undefined,
    noiseSuppression: aparelhos.ruido,
    echoCancellation: aparelhos.eco,
    autoGainControl: true,
  };
}

function criarMotorDoLivekit(idSala, avisos) {
  const { Room, RoomEvent, Track, VideoPresets, DisconnectReason } = window.LivekitClient;
  const caixaDosAudios = $("#audios-da-voz");
  let sala = null;
  let saindo = false;

  const opcoesDaCamera = () => ({
    deviceId: aparelhos.camera ? { ideal: aparelhos.camera } : undefined,
    resolution: VideoPresets.h360.resolution,
  });

  function pessoaDe(participante, local) {
    const meta = lerMetadata(participante.metadata);
    const usuario = typeof meta.usuario === "string" ? meta.usuario : participante.identity;
    const persona =
      meta.persona && typeof meta.persona.nome === "string"
        ? meta.persona
        : { tipo: "conta", id: usuario, nome: participante.name || usuario, imagem: null, fonte: null };
    const camera = participante.getTrackPublication(Track.Source.Camera);
    const tela = participante.getTrackPublication(Track.Source.ScreenShare);
    const ligada = (publicacao) => Boolean(publicacao && !publicacao.isMuted && (local || publicacao.isSubscribed || publicacao.track));
    return {
      usuario,
      persona,
      local,
      mudo: !participante.isMicrophoneEnabled,
      camera: ligada(camera),
      tela: ligada(tela),
      falando: participante.isSpeaking,
      trilhaCamera: ligada(camera) ? camera.track ?? null : null,
      trilhaTela: ligada(tela) ? tela.track ?? null : null,
    };
  }

  function aplicarVolumeEm(participante) {
    if (!sala || !participante || participante === sala.localParticipant || typeof participante.setVolume !== "function") return;
    const usuario = lerMetadata(participante.metadata).usuario || participante.identity;
    const volume = volumeQueToca(usuario);
    participante.setVolume(volume, Track.Source.Microphone);
    participante.setVolume(volume, Track.Source.ScreenShareAudio);
  }

  function limparAudios() {
    caixaDosAudios.replaceChildren();
  }

  function ligarEventos() {
    const mudou = () => avisos.mudou();
    sala
      .on(RoomEvent.ParticipantConnected, (participante) => {
        aplicarVolumeEm(participante);
        mudou();
      })
      .on(RoomEvent.ParticipantDisconnected, mudou)
      .on(RoomEvent.TrackSubscribed, (trilha, _publicacao, participante) => {
        if (trilha.kind === "audio") {
          caixaDosAudios.append(trilha.attach());
          aplicarVolumeEm(participante);
        }
        mudou();
      })
      .on(RoomEvent.TrackUnsubscribed, (trilha) => {
        if (trilha.kind === "audio") for (const elemento of trilha.detach()) elemento.remove();
        mudou();
      })
      .on(RoomEvent.TrackPublished, mudou)
      .on(RoomEvent.TrackUnpublished, mudou)
      .on(RoomEvent.TrackMuted, mudou)
      .on(RoomEvent.TrackUnmuted, mudou)
      .on(RoomEvent.LocalTrackPublished, mudou)
      .on(RoomEvent.LocalTrackUnpublished, mudou) // também quando a tela para pela barra do navegador
      .on(RoomEvent.ActiveSpeakersChanged, mudou)
      .on(RoomEvent.ParticipantMetadataChanged, mudou)
      .on(RoomEvent.ParticipantNameChanged, mudou)
      .on(RoomEvent.Reconnecting, () => avisos.situacao("reconectando"))
      .on(RoomEvent.Reconnected, () => avisos.situacao("conectado"))
      .on(RoomEvent.AudioPlaybackStatusChanged, () => avisos.somBloqueado(!sala.canPlaybackAudio))
      .on(RoomEvent.MediaDevicesChanged, () => avisos.aparelhos())
      .on(RoomEvent.Disconnected, (motivo) => {
        limparAudios();
        if (saindo) return;
        if (motivo === DisconnectReason.DUPLICATE_IDENTITY) avisos.caiu("Você entrou por outra janela.");
        else if (motivo === DisconnectReason.ROOM_DELETED) avisos.caiu("A sala foi apagada.");
        else if (motivo === DisconnectReason.CLIENT_INITIATED) avisos.saiu();
        else avisos.caiu("A conexão de voz caiu.");
      });
  }

  return {
    async conectar() {
      let passe;
      try {
        passe = await pedir("POST", "/api/chat/voz/entrar", { canal: idSala });
      } catch (falha) {
        falha.doPortal = true;
        throw falha;
      }
      if (saindo) return;
      sala = new Room({
        adaptiveStream: true,
        dynacast: true,
        audioCaptureDefaults: opcoesDoMicrofone(),
        videoCaptureDefaults: opcoesDaCamera(),
        audioOutput: aparelhos.saida ? { deviceId: aparelhos.saida } : undefined,
      });
      ligarEventos();
      await sala.connect(passe.url, passe.token);
      if (saindo) return;
      sala.startAudio().catch(() => {});
      avisos.somBloqueado(!sala.canPlaybackAudio);
      try {
        await sala.localParticipant.setMicrophoneEnabled(true, opcoesDoMicrofone());
      } catch (falha) {
        avisoRapido(textoDaFalhaDeAparelho(falha, "microfone"));
      }
      avisos.mudou();
    },
    pessoas() {
      if (!sala || sala.state === "disconnected") return [];
      return [pessoaDe(sala.localParticipant, true), ...[...sala.remoteParticipants.values()].map((p) => pessoaDe(p, false))];
    },
    definirMicrofone: (ligado) => sala?.localParticipant.setMicrophoneEnabled(ligado, opcoesDoMicrofone()),
    definirCamera: (ligada) => sala?.localParticipant.setCameraEnabled(ligada, opcoesDaCamera()),
    definirTela: (ligada) => sala?.localParticipant.setScreenShareEnabled(ligada),
    aplicarVolumes() {
      if (sala) for (const participante of sala.remoteParticipants.values()) aplicarVolumeEm(participante);
    },
    async trocarAparelho(tipo, id) {
      if (sala) await sala.switchActiveDevice(tipo, id || "default");
    },
    async reiniciarMicrofone() {
      if (!sala) return;
      sala.options.audioCaptureDefaults = { ...sala.options.audioCaptureDefaults, ...opcoesDoMicrofone() };
      const trilha = sala.localParticipant.getTrackPublication(Track.Source.Microphone)?.track;
      if (trilha) await trilha.restartTrack(opcoesDoMicrofone());
    },
    liberarSom: () => sala?.startAudio(),
    async sair() {
      saindo = true;
      limparAudios();
      if (sala) await sala.disconnect();
    },
  };
}

/* =================================================================
   O motor simulado (prévia)
   ================================================================= */

function criarMotorSimulado(idSala, avisos) {
  const categoria = acharCanal(idSala)?.categoria;
  let pessoas = [];
  let timer = null;
  let saiu = false;

  function alternarFala() {
    const quemPode = pessoas.filter((p) => !p.mudo && !p.ensurdecido);
    const sorteada = Math.random() < 0.25 ? null : quemPode[Math.floor(Math.random() * quemPode.length)];
    for (const p of pessoas) p.falando = p === sorteada;
    avisos.mudou();
  }

  const local = () => pessoas.find((p) => p.local);

  return {
    async conectar() {
      await esperar(CONFIG_DA_VOZ.esperaDaPrevia);
      if (saiu) return;
      const outras = (estado.dados.voz?.salas?.[idSala] ?? []).filter((p) => p.usuario !== eu());
      pessoas = [
        { usuario: eu(), persona: minhaPersonaNa(idSala), local: true, mudo: false, camera: false, tela: false, falando: false },
        ...outras.map((p) => ({
          usuario: p.usuario,
          persona: personaDaPresenca(p, categoria),
          local: false,
          mudo: Boolean(p.mudo),
          ensurdecido: Boolean(p.ensurdecido),
          camera: Boolean(p.camera),
          tela: Boolean(p.tela),
          falando: false,
        })),
      ];
      timer = setInterval(alternarFala, CONFIG_DA_VOZ.intervaloDaFala);
    },
    pessoas: () => pessoas.map((p) => ({ ...p, trilhaCamera: null, trilhaTela: null, simulada: true })),
    async definirMicrofone(ligado) {
      local().mudo = !ligado;
      if (!ligado) local().falando = false;
      avisos.mudou();
    },
    async definirCamera(ligada) {
      local().camera = ligada;
      avisos.mudou();
    },
    async definirTela(ligada) {
      local().tela = ligada;
      avisos.mudou();
    },
    aplicarVolumes() {},
    async trocarAparelho() {},
    async reiniciarMicrofone() {},
    async liberarSom() {},
    async sair() {
      saiu = true;
      clearInterval(timer);
      pessoas = [];
    },
  };
}

/* =================================================================
   Entrar, trocar e sair
   ================================================================= */

function avisosDaTentativa(tentativa) {
  const vale = () => tentativa === voz.tentativa;
  return {
    mudou: () => vale() && agendarDesenho(),
    situacao(situacao) {
      if (!vale()) return;
      voz.situacao = situacao;
      agendarDesenho();
    },
    somBloqueado(bloqueado) {
      if (!vale()) return;
      voz.somBloqueado = bloqueado;
      agendarDesenho();
    },
    aparelhos: () => vale() && $("#dialogo-voz").open && preencherAparelhos(),
    caiu: (mensagem) => vale() && caiuDaSala(mensagem),
    saiu: () => vale() && sairDaSala(),
  };
}

async function entrarNaSala(idSala) {
  const achado = acharCanal(idSala);
  if (!achado || achado.canal.tipo !== "voz") return;
  if (salaConectada() === idSala) return agendarDesenho();
  if (!MODO_PREVIA) {
    if (estado.dados.voz?.configurada === false) return avisarFalha({ message: "A voz ainda não está configurada no servidor." });
    if (!window.LivekitClient) return avisarFalha({ message: "A voz não carregou. Recarregue a página e tente de novo." });
  }
  await sairDaSala();

  const tentativa = ++voz.tentativa;
  const motor = (MODO_PREVIA ? criarMotorSimulado : criarMotorDoLivekit)(idSala, avisosDaTentativa(tentativa));
  Object.assign(voz, { motor, sala: idSala, situacao: "conectando", queda: "", ensurdecido: false, mudoAntes: false, somBloqueado: false, ampliado: undefined });
  desenharTudo();

  try {
    await motor.conectar();
  } catch (falha) {
    motor.sair().catch(() => {});
    if (tentativa !== voz.tentativa) return;
    Object.assign(voz, { motor: null, sala: null, situacao: "fora" });
    desenharTudo();
    avisarFalha(falha.doPortal ? falha : { message: "Não foi possível entrar na sala de voz. Confira sua internet e tente de novo." });
    return;
  }
  if (tentativa !== voz.tentativa) return;
  voz.situacao = "conectado";
  desenharTudo();
}

async function sairDaSala() {
  voz.tentativa++;
  const motor = voz.motor;
  Object.assign(voz, { motor: null, sala: null, situacao: "fora", queda: "", ensurdecido: false, somBloqueado: false });
  limparQuadros();
  fecharVolume();
  if (estado.dados) desenharTudo();
  if (motor) await motor.sair().catch(() => {});
}

// O LiveKit desistiu, ou a sala fechou: o painel fica com a mensagem e "Entrar de novo"
function caiuDaSala(mensagem) {
  const motor = voz.motor;
  voz.tentativa++;
  Object.assign(voz, { motor: null, situacao: "caiu", queda: mensagem, ensurdecido: false, somBloqueado: false });
  limparQuadros();
  fecharVolume();
  desenharTudo();
  motor?.sair().catch(() => {});
}

function avisarEnsurdecido() {
  if (MODO_PREVIA) return;
  pedir("POST", "/api/chat/voz/estado", { ensurdecido: voz.ensurdecido }, { silencioso: true }).catch(() => {});
}

async function alternarMicrofone() {
  const local = pessoaLocal();
  if (!voz.motor || !local) return;
  const ligar = local.mudo || voz.ensurdecido;
  if (voz.ensurdecido) {
    // Ligar o microfone ensurdecido também tira o ensurdecido
    voz.ensurdecido = false;
    voz.motor.aplicarVolumes();
    avisarEnsurdecido();
  }
  try {
    await voz.motor.definirMicrofone(ligar);
  } catch (falha) {
    avisarFalha({ message: textoDaFalhaDeAparelho(falha, "microfone") });
  }
  desenharTudo();
}

async function alternarEnsurdecer() {
  const local = pessoaLocal();
  if (!voz.motor || !local) return;
  if (!voz.ensurdecido) {
    voz.mudoAntes = local.mudo;
    voz.ensurdecido = true;
    voz.motor.aplicarVolumes();
    if (!local.mudo) await Promise.resolve(voz.motor.definirMicrofone(false)).catch(() => {});
  } else {
    voz.ensurdecido = false;
    voz.motor.aplicarVolumes();
    if (!voz.mudoAntes) {
      try {
        await voz.motor.definirMicrofone(true);
      } catch (falha) {
        avisoRapido(textoDaFalhaDeAparelho(falha, "microfone"));
      }
    }
  }
  avisarEnsurdecido();
  desenharTudo();
}

async function alternarCamera() {
  const local = pessoaLocal();
  if (!voz.motor || !local) return;
  try {
    await voz.motor.definirCamera(!local.camera);
  } catch (falha) {
    avisarFalha({ message: textoDaFalhaDeAparelho(falha, "camera") });
  }
  desenharTudo();
}

async function alternarTela() {
  const local = pessoaLocal();
  if (!voz.motor || !local) return;
  try {
    await voz.motor.definirTela(!local.tela);
  } catch (falha) {
    // Fechar a janela de escolha da tela não é erro
    if (falha?.name !== "NotAllowedError" && falha?.name !== "AbortError") avisarFalha({ message: textoDaFalhaDeAparelho(falha, "tela") });
  }
  desenharTudo();
}

/* =================================================================
   Desenhar: o painel, a sala e a lista
   ================================================================= */

function desenharTudo() {
  voz.desenhoPendente = false;
  if (!estado.dados) return;
  desenharPainel();
  if (estado.alvo?.voz) desenharSala();
  // A lista só muda quando o seu estado muda (não a cada troca de quem fala)
  const local = pessoaLocal();
  const assinatura = [salaConectada(), voz.situacao, voz.ensurdecido, local?.mudo, local?.camera, local?.tela].join("|");
  if (assinatura !== voz.assinaturaDaLista) {
    voz.assinaturaDaLista = assinatura;
    desenharLista();
  }
}

// Muitos avisos seguidos do LiveKit: um desenho por quadro da tela
function agendarDesenho() {
  if (voz.desenhoPendente) return;
  voz.desenhoPendente = true;
  requestAnimationFrame(desenharTudo);
}

/* ---------- O painel de voz ---------- */

const painel = {};

function botaoDaVoz(rotulo, icone, aoClicar, classe = "") {
  const b = criar("button", `icone-botao botao-voz ${classe}`);
  b.type = "button";
  b.title = rotulo;
  b.setAttribute("aria-label", rotulo);
  b.append(simbolo(icone));
  b.addEventListener("click", aoClicar);
  return b;
}

function trocarBotao(b, { rotulo, icone, pressionado, desligado = false, ligado = false }) {
  b.title = rotulo;
  b.setAttribute("aria-label", rotulo);
  if (pressionado !== undefined) b.setAttribute("aria-pressed", String(pressionado));
  b.classList.toggle("botao-voz--desligado", desligado);
  b.classList.toggle("botao-voz--ligado", ligado);
  b.querySelector("use").setAttribute("href", `#${icone}`);
}

function montarPainel() {
  const caixa = $("#painel-voz");
  painel.situacao = criar("p", "painel-voz__situacao");
  painel.situacao.setAttribute("role", "status");
  painel.sala = criar("a", "painel-voz__sala");
  painel.nomeDaSala = criar("span", "painel-voz__nome");
  painel.categoria = criar("span", "painel-voz__categoria");
  painel.sala.append(painel.nomeDaSala, painel.categoria);
  const textos = criar("div", "painel-voz__textos");
  textos.append(painel.situacao, painel.sala);
  const engrenagem = botaoDaVoz("Configurações de voz", "icone-engrenagem", abrirConfiguracoesDeVoz);
  const cabeca = criar("div", "painel-voz__cabeca");
  cabeca.append(textos, engrenagem);

  painel.som = botao("Ativar o som", "botao botao--leve botao--pequeno painel-voz__som", () =>
    Promise.resolve(voz.motor?.liberarSom()).catch(() => {}),
  );

  painel.microfone = botaoDaVoz("Desligar o microfone", "icone-microfone", alternarMicrofone);
  painel.ensurdecer = botaoDaVoz("Ensurdecer", "icone-fone", alternarEnsurdecer);
  painel.camera = botaoDaVoz("Ligar a câmera", "icone-camera-desligada", alternarCamera);
  painel.tela = botaoDaVoz("Compartilhar a tela", "icone-tela", alternarTela);
  painel.sair = botaoDaVoz("Sair da sala", "icone-desligar", sairDaSala, "botao-voz--sair");
  painel.botoes = criar("div", "painel-voz__botoes");
  painel.botoes.append(painel.microfone, painel.ensurdecer, painel.camera, painel.tela, painel.sair);

  painel.deNovo = criar("div", "painel-voz__botoes painel-voz__botoes--queda");
  painel.deNovo.append(
    botao("Entrar de novo", "botao botao--principal botao--pequeno", () => entrarNaSala(voz.sala)),
    botao("Fechar", "botao botao--leve botao--pequeno", sairDaSala),
  );

  caixa.append(cabeca, painel.som, painel.botoes, painel.deNovo);
}

function desenharPainel() {
  const caixa = $("#painel-voz");
  const achado = voz.sala ? acharCanal(voz.sala) : null;
  if (!achado) {
    caixa.hidden = true;
    return;
  }
  caixa.hidden = false;
  const caiu = voz.situacao === "caiu";
  caixa.classList.toggle("painel-voz--caiu", caiu);
  painel.situacao.textContent = caiu ? voz.queda : TEXTO_DA_SITUACAO[voz.situacao] ?? "";
  painel.situacao.dataset.situacao = voz.situacao;
  painel.sala.href = `#canal-${achado.canal.id}`;
  painel.sala.title = `Abrir ${achado.canal.nome}`;
  painel.nomeDaSala.textContent = achado.canal.nome;
  painel.categoria.textContent = achado.categoria.nome;
  painel.som.hidden = caiu || !voz.somBloqueado;
  painel.botoes.hidden = caiu;
  painel.deNovo.hidden = !caiu;
  if (caiu) return;

  const local = pessoaLocal();
  const pronto = Boolean(local) && voz.situacao !== "conectando";
  for (const b of [painel.microfone, painel.ensurdecer, painel.camera, painel.tela]) b.disabled = !pronto;
  const mudo = !local || local.mudo || voz.ensurdecido;
  trocarBotao(painel.microfone, {
    rotulo: mudo ? "Ligar o microfone" : "Desligar o microfone",
    icone: mudo ? "icone-microfone-mudo" : "icone-microfone",
    pressionado: !mudo,
    desligado: Boolean(local) && mudo,
  });
  trocarBotao(painel.ensurdecer, {
    rotulo: voz.ensurdecido ? "Voltar a ouvir" : "Ensurdecer",
    icone: voz.ensurdecido ? "icone-fone-mudo" : "icone-fone",
    pressionado: voz.ensurdecido,
    desligado: voz.ensurdecido,
  });
  trocarBotao(painel.camera, {
    rotulo: local?.camera ? "Desligar a câmera" : "Ligar a câmera",
    icone: local?.camera ? "icone-camera" : "icone-camera-desligada",
    pressionado: Boolean(local?.camera),
    ligado: Boolean(local?.camera),
  });
  trocarBotao(painel.tela, {
    rotulo: local?.tela ? "Parar de compartilhar a tela" : "Compartilhar a tela",
    icone: "icone-tela",
    pressionado: Boolean(local?.tela),
    ligado: Boolean(local?.tela),
  });
}

/* ---------- A sala no centro ---------- */

function desenharSala() {
  const alvo = estado.alvo;
  if (!alvo?.voz) return;
  const achado = acharCanal(alvo.id);
  if (!achado) return;
  const caixa = $("#sala");
  if (salaConectada() === alvo.id) desenharChamada(caixa, achado.categoria);
  else desenharVestibulo(caixa, achado.canal, achado.categoria);
}

// A sala em que você não está: quem está lá e o botão de entrar
function desenharVestibulo(caixa, canal, categoria) {
  const vestibulo = criar("div", "sala__vestibulo");
  vestibulo.append(simbolo("icone-voz", "sala__icone"), criar("h2", "sala__nome", canal.nome));
  const pessoas = ganchosDaVoz.ajustarPessoas(canal.id, estado.dados.voz?.salas?.[canal.id] ?? []);
  if (pessoas.length) {
    const lista = criar("ul", "sala__presentes");
    for (const pessoa of pessoas) {
      const item = criar("li", "sala__presente");
      item.append(retratoDe(personaDaPresenca(pessoa, categoria), categoria, "sala__presente-retrato"), nomeDaPersona(pessoa));
      lista.append(item);
    }
    vestibulo.append(lista);
  } else {
    vestibulo.append(criar("p", "sala__texto", "Ninguém na sala agora."));
  }

  if (estado.dados.voz?.configurada === false && !MODO_PREVIA) {
    vestibulo.append(criar("p", "sala__texto sala__texto--aviso", "A voz ainda não está configurada no servidor."));
  } else {
    if (categoria.mesa) {
      const como = criar("p", "sala__como");
      como.append("Você entra como ", nomeDaPersona(minhaPersonaNa(canal.id)), ".");
      vestibulo.append(como);
    }
    const rotulo = salaConectada() ? "Trocar para esta sala" : "Entrar na sala";
    vestibulo.append(botao(rotulo, "botao botao--principal sala__entrar", () => entrarNaSala(canal.id)));
  }
  caixa.replaceChildren(vestibulo);
}

function montarChamada() {
  const chamada = criar("div", "sala__chamada");
  const palco = criar("div", "sala__palco");
  const grade = criar("div", "sala__grade");
  const espera = criar("p", "sala__texto sala__espera", "Conectando…");
  chamada.append(espera, palco, grade);
  voz.chamada = { elemento: chamada, palco, grade, espera };
}

function limparQuadros() {
  for (const registro of voz.quadros.values()) {
    if (registro.trilha && registro.video) registro.trilha.detach(registro.video);
    registro.elemento.remove();
  }
  voz.quadros.clear();
  voz.arranjo = "";
}

// Os quadros da sala: um por pessoa, mais um por tela compartilhada
function quadrosDaSala() {
  const quadros = [];
  for (const p of pessoasDaSala()) {
    quadros.push({ chave: `p:${p.usuario}`, tipo: "pessoa", p });
    if (p.tela) quadros.push({ chave: `t:${p.usuario}`, tipo: "tela", p });
  }
  return quadros;
}

function destaqueDe(quadros) {
  if (voz.ampliado === null) return null;
  if (voz.ampliado !== undefined) {
    const escolhido = quadros.find((q) => q.chave === voz.ampliado);
    if (escolhido) return escolhido;
    voz.ampliado = undefined; // o quadro ampliado sumiu: volta ao automático
  }
  return quadros.find((q) => q.tipo === "tela") ?? null;
}

function clicarNoQuadro(chave, destacado) {
  voz.ampliado = destacado ? null : chave;
  desenharTudo();
}

function registroDoQuadro(q) {
  let registro = voz.quadros.get(q.chave);
  if (registro) return registro;
  const elemento = criar("figure", "quadro");
  elemento.tabIndex = 0;
  const midia = criar("div", "quadro__midia");
  const rotulo = criar("figcaption", "quadro__rotulo");
  elemento.append(midia, rotulo);
  registro = { elemento, midia, rotulo, video: null, trilha: null, modo: "" };
  elemento.addEventListener("click", () => clicarNoQuadro(q.chave, elemento.classList.contains("quadro--destaque")));
  elemento.addEventListener("keydown", (evento) => {
    if (evento.key === "Enter" || evento.key === " ") {
      evento.preventDefault();
      elemento.click();
    }
  });
  elemento.addEventListener("contextmenu", (evento) => {
    const usuario = registro.usuario;
    if (!usuario || usuario === eu()) return;
    evento.preventDefault();
    abrirVolume(usuario, registro.nome, evento.clientX, evento.clientY);
  });
  voz.quadros.set(q.chave, registro);
  return registro;
}

function atualizarQuadro(registro, q, categoria) {
  const { p } = q;
  const ehTela = q.tipo === "tela";
  registro.usuario = p.usuario;
  registro.nome = p.persona.nome;
  const { elemento } = registro;
  elemento.classList.toggle("quadro--tela", ehTela);
  elemento.classList.toggle("quadro--falando", !ehTela && p.falando && !p.mudo);
  const conta = contaPorUsuario(p.usuario);
  elemento.title = conta ? `por ${conta.nome}` : "";
  elemento.setAttribute("aria-label", ehTela ? `Tela de ${p.persona.nome}` : p.persona.nome);

  // A mídia: o vídeo, o desenho da prévia ou o retrato
  const trilha = ehTela ? p.trilhaTela : p.trilhaCamera;
  const ligada = ehTela ? p.tela : p.camera;
  let modo;
  if (trilha) modo = "video";
  else if (ligada && p.simulada) modo = `simulado:${q.chave}`;
  else modo = `retrato:${p.persona.tipo}:${p.persona.id}:${p.persona.nome}:${p.persona.imagem ?? ""}`;

  if (registro.trilha && registro.trilha !== trilha) {
    if (registro.video) registro.trilha.detach(registro.video);
    registro.trilha = null;
  }
  if (modo === "video") {
    if (!registro.video) {
      registro.video = criar("video", "quadro__video");
      registro.video.autoplay = true;
      registro.video.playsInline = true;
      registro.video.muted = true;
    }
    if (registro.trilha !== trilha) {
      trilha.attach(registro.video);
      registro.trilha = trilha;
    }
    registro.video.classList.toggle("quadro__video--espelho", p.local && !ehTela);
    registro.video.classList.toggle("quadro__video--tela", ehTela);
  }
  if (modo !== registro.modo) {
    registro.modo = modo;
    if (modo === "video") {
      registro.midia.replaceChildren(registro.video);
    } else if (modo.startsWith("simulado:")) {
      const desenho = ehTela ? mapaDeExemplo() : desenhoDeExemplo(corDaConta(p.usuario), "◉", 320, 180);
      registro.midia.replaceChildren(imagem(desenho, "quadro__simulado"));
    } else {
      registro.midia.replaceChildren(retratoDe(p.persona, categoria, "quadro__retrato"));
    }
  }

  // O rótulo: o nome e os ícones
  const nome = nomeDaPersona(p.persona, "quadro__nome");
  const partes = [];
  if (ehTela) partes.push(simbolo("icone-tela", "estado-voz"), criar("span", "quadro__de", "Tela de "), nome);
  else {
    partes.push(nome);
    if (p.ensurdecido) partes.push(simbolo("icone-fone-mudo", "estado-voz estado-voz--desligado"));
    else if (p.mudo) partes.push(simbolo("icone-microfone-mudo", "estado-voz estado-voz--desligado"));
  }
  registro.rotulo.replaceChildren(...partes);
}

function colunasPara(n) {
  if (n <= 1) return 1;
  if (n <= 4) return 2;
  if (n <= 9) return 3;
  return 4;
}

function desenharChamada(caixa, categoria) {
  if (!voz.chamada) montarChamada();
  const { elemento, palco, grade, espera } = voz.chamada;
  if (caixa.firstChild !== elemento || caixa.childNodes.length !== 1) caixa.replaceChildren(elemento);

  const quadros = quadrosDaSala();
  espera.hidden = quadros.length > 0;
  espera.textContent = voz.situacao === "reconectando" ? "Reconectando…" : "Conectando…";

  // Tira os quadros de quem saiu
  const chaves = new Set(quadros.map((q) => q.chave));
  for (const [chave, registro] of voz.quadros) {
    if (chaves.has(chave)) continue;
    if (registro.trilha && registro.video) registro.trilha.detach(registro.video);
    registro.elemento.remove();
    voz.quadros.delete(chave);
  }

  const destaque = destaqueDe(quadros);
  for (const q of quadros) {
    const registro = registroDoQuadro(q);
    atualizarQuadro(registro, q, categoria);
    registro.elemento.classList.toggle("quadro--destaque", q === destaque);
  }

  // Só mexe na ordem quando o arranjo muda (mover um vídeo pausa ele)
  const arranjo = `${destaque?.chave ?? ""}|${quadros.map((q) => q.chave).join(",")}`;
  if (arranjo !== voz.arranjo) {
    voz.arranjo = arranjo;
    const elementos = (lista) => lista.map((q) => voz.quadros.get(q.chave).elemento);
    elemento.classList.toggle("sala__chamada--destaque", Boolean(destaque));
    if (destaque) {
      palco.replaceChildren(...elementos([destaque]));
      grade.replaceChildren(...elementos(quadros.filter((q) => q !== destaque)));
    } else {
      palco.replaceChildren();
      grade.replaceChildren(...elementos(quadros));
    }
    grade.style.setProperty("--colunas", String(colunasPara(destaque ? 1 : quadros.length)));
  }
  for (const registro of voz.quadros.values()) {
    if (registro.video?.paused && registro.trilha) registro.video.play().catch(() => {});
  }
}

/* =================================================================
   Volume por pessoa (clique direito)
   ================================================================= */

let volumeDeQuem = null;

function abrirVolume(usuario, nome, x, y) {
  if (!usuario || usuario === eu()) return;
  volumeDeQuem = usuario;
  const caixa = $("#volume-pessoa");
  const { volume, silenciado } = volumeDe(usuario);
  $("#volume-nome").textContent = nome || contaPorUsuario(usuario)?.nome || usuario;
  $("#volume-barra").value = String(volume);
  $("#volume-valor").textContent = `${volume}%`;
  $("#volume-silenciar").checked = silenciado;
  caixa.hidden = false;
  const largura = caixa.offsetWidth;
  const altura = caixa.offsetHeight;
  const esquerda = Math.max(8, Math.min(x, window.innerWidth - largura - 8));
  const topo = Math.max(8, Math.min(y, window.innerHeight - altura - 8));
  caixa.style.setProperty("left", `${esquerda + window.scrollX}px`);
  caixa.style.setProperty("top", `${topo + window.scrollY}px`);
  $("#volume-barra").focus();
}

function fecharVolume() {
  $("#volume-pessoa").hidden = true;
  volumeDeQuem = null;
}

function mudarVolume() {
  if (!volumeDeQuem) return;
  const volume = Number($("#volume-barra").value);
  const silenciado = $("#volume-silenciar").checked;
  $("#volume-valor").textContent = `${volume}%`;
  if (volume === 100 && !silenciado) delete volumes[volumeDeQuem];
  else volumes[volumeDeQuem] = { volume, silenciado };
  guardarVolumes();
  voz.motor?.aplicarVolumes();
}

function configurarVolume() {
  $("#volume-barra").addEventListener("input", mudarVolume);
  $("#volume-silenciar").addEventListener("change", mudarVolume);
  document.addEventListener("pointerdown", (evento) => {
    if (volumeDeQuem && !$("#volume-pessoa").contains(evento.target)) fecharVolume();
  });
  document.addEventListener("keydown", (evento) => {
    if (evento.key === "Escape" && volumeDeQuem) fecharVolume();
  });
  window.addEventListener("resize", fecharVolume);

  // Na lista: clique direito no nome de quem está numa sala
  $("#lista").addEventListener("contextmenu", (evento) => {
    const linha = evento.target.closest(".item-canal__sala li[data-usuario]");
    if (!linha || linha.dataset.usuario === eu()) return;
    evento.preventDefault();
    abrirVolume(linha.dataset.usuario, linha.querySelector(".nome-persona")?.textContent, evento.clientX, evento.clientY);
  });
}

/* =================================================================
   Configurações de voz (a engrenagem do painel)
   ================================================================= */

const APARELHOS_DE_EXEMPLO = {
  audioinput: [
    { deviceId: "mic-1", label: "Microfone do headset (exemplo)" },
    { deviceId: "mic-2", label: "Microfone da webcam (exemplo)" },
  ],
  audiooutput: [
    { deviceId: "som-1", label: "Fone de ouvido (exemplo)" },
    { deviceId: "som-2", label: "Caixas de som (exemplo)" },
  ],
  videoinput: [{ deviceId: "cam-1", label: "Webcam (exemplo)" }],
};

const NOME_DO_APARELHO = { audioinput: "Microfone", audiooutput: "Saída", videoinput: "Câmera" };
const podeEscolherSaida = () => typeof HTMLMediaElement !== "undefined" && "setSinkId" in HTMLMediaElement.prototype;

async function listarAparelhos(tipo, pedirPermissao) {
  if (MODO_PREVIA) return APARELHOS_DE_EXEMPLO[tipo];
  try {
    if (window.LivekitClient) return await LivekitClient.Room.getLocalDevices(tipo, pedirPermissao);
  } catch {
    // sem permissão: a lista vem sem os nomes
  }
  try {
    return (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === tipo);
  } catch {
    return [];
  }
}

function preencherLista(select, tipo, lista, escolhido) {
  const opcoes = [new Option("Padrão do sistema", "")];
  lista
    .filter((d) => d.deviceId && d.deviceId !== "default")
    .forEach((d, i) => opcoes.push(new Option(d.label || `${NOME_DO_APARELHO[tipo]} ${i + 1}`, d.deviceId)));
  select.replaceChildren(...opcoes);
  select.value = opcoes.some((o) => o.value === escolhido) ? escolhido : "";
}

let preenchendo = null;
function preencherAparelhos() {
  // Um pedido de permissão por vez: primeiro o microfone, depois a câmera
  preenchendo ??= (async () => {
    try {
      preencherLista($("#voz-microfone"), "audioinput", await listarAparelhos("audioinput", true), aparelhos.microfone);
      preencherLista($("#voz-saida"), "audiooutput", await listarAparelhos("audiooutput", false), aparelhos.saida);
      preencherLista($("#voz-camera"), "videoinput", await listarAparelhos("videoinput", true), aparelhos.camera);
    } finally {
      preenchendo = null;
    }
  })();
  return preenchendo;
}

async function abrirConfiguracoesDeVoz() {
  const dialogo = $("#dialogo-voz");
  $("#voz-ruido").checked = aparelhos.ruido;
  $("#voz-eco").checked = aparelhos.eco;
  const saidaLivre = podeEscolherSaida();
  $("#voz-saida").disabled = !saidaLivre;
  $("#voz-saida-aviso").hidden = saidaLivre;
  $("#voz-aparelhos-aviso").hidden = true;
  if (!dialogo.open) dialogo.showModal();
  await preencherAparelhos();
}

function avisoDosAparelhos(texto) {
  const aviso = $("#voz-aparelhos-aviso");
  aviso.textContent = texto;
  aviso.hidden = !texto;
}

async function trocarAparelho(campo, tipo, aparelho) {
  aparelhos[campo] = $(`#voz-${campo}`).value;
  guardarAparelhos();
  avisoDosAparelhos("");
  if (campo === "camera" && !aparelhos.camera) return; // vale na próxima vez que a câmera ligar
  try {
    await voz.motor?.trocarAparelho(tipo, aparelhos[campo]);
  } catch (falha) {
    avisoDosAparelhos(campo === "saida" ? "Não foi possível trocar a saída de som." : textoDaFalhaDeAparelho(falha, aparelho));
  }
  if (campo === "microfone" && teste.ligado) comecarTeste();
}

async function mudarProcessamento() {
  aparelhos.ruido = $("#voz-ruido").checked;
  aparelhos.eco = $("#voz-eco").checked;
  guardarAparelhos();
  try {
    await voz.motor?.reiniciarMicrofone();
  } catch (falha) {
    avisoDosAparelhos(textoDaFalhaDeAparelho(falha, "microfone"));
  }
  if (teste.ligado) comecarTeste();
}

/* ---------- O teste do microfone ---------- */

const teste = { ligado: false, fluxo: null, contexto: null, quadro: 0 };

function mostrarNivel(nivel) {
  $("#voz-nivel").style.setProperty("--nivel", String(Math.min(1, Math.max(0, nivel))));
}

function pararTeste() {
  cancelAnimationFrame(teste.quadro);
  teste.fluxo?.getTracks().forEach((t) => t.stop());
  teste.contexto?.close().catch(() => {});
  Object.assign(teste, { ligado: false, fluxo: null, contexto: null, quadro: 0 });
  mostrarNivel(0);
  $("#voz-testar").textContent = "Testar o microfone";
}

async function comecarTeste() {
  pararTeste();
  teste.ligado = true;
  $("#voz-testar").textContent = "Parar o teste";
  avisoDosAparelhos("");

  if (MODO_PREVIA) {
    let fase = 0;
    const animar = () => {
      fase += 0.12;
      mostrarNivel(Math.max(0, Math.sin(fase) * 0.5 + Math.random() * 0.35));
      teste.quadro = requestAnimationFrame(animar);
    };
    animar();
    return;
  }

  try {
    teste.fluxo = await navigator.mediaDevices.getUserMedia({ audio: opcoesDoMicrofone() });
  } catch (falha) {
    pararTeste();
    avisoDosAparelhos(textoDaFalhaDeAparelho(falha, "microfone"));
    return;
  }
  if (!teste.ligado) return teste.fluxo.getTracks().forEach((t) => t.stop());
  teste.contexto = new AudioContext();
  const analisador = teste.contexto.createAnalyser();
  analisador.fftSize = 1024;
  teste.contexto.createMediaStreamSource(teste.fluxo).connect(analisador);
  const amostras = new Uint8Array(analisador.fftSize);
  const medir = () => {
    analisador.getByteTimeDomainData(amostras);
    let soma = 0;
    for (const amostra of amostras) soma += ((amostra - 128) / 128) ** 2;
    mostrarNivel(Math.sqrt(soma / amostras.length) * 4);
    teste.quadro = requestAnimationFrame(medir);
  };
  medir();
}

function configurarConfiguracoesDeVoz() {
  const dialogo = $("#dialogo-voz");
  fecharAoClicarFora(dialogo);
  dialogo.addEventListener("close", pararTeste);
  $("#voz-testar").addEventListener("click", () => (teste.ligado ? pararTeste() : comecarTeste()));
  $("#voz-microfone").addEventListener("change", () => trocarAparelho("microfone", "audioinput", "microfone"));
  $("#voz-saida").addEventListener("change", () => trocarAparelho("saida", "audiooutput", "microfone"));
  $("#voz-camera").addEventListener("change", () => trocarAparelho("camera", "videoinput", "camera"));
  $("#voz-ruido").addEventListener("change", mudarProcessamento);
  $("#voz-eco").addEventListener("change", mudarProcessamento);
}

/* =================================================================
   Os ganchos do chat.js
   ================================================================= */

// A sala abriu no centro: entra se foi clicada na lista; senão, só mostra
ganchosDaVoz.abrirSala = (canal) => {
  if (voz.entrarAoAbrir === canal.id) {
    voz.entrarAoAbrir = null;
    if (salaConectada() !== canal.id) entrarNaSala(canal.id);
  }
  desenharSala();
};

// As salas ou a estrutura mudaram
ganchosDaVoz.mudou = () => {
  if (voz.sala && acharCanal(voz.sala)?.canal.tipo !== "voz") {
    sairDaSala();
    avisoRapido("A sala de voz em que você estava foi fechada.");
    return;
  }
  agendarDesenho();
};

// A lista de quem está numa sala, com você na hora certa (a presença do servidor demora até 3 segundos)
ganchosDaVoz.ajustarPessoas = (idSala, pessoas) => {
  const conectada = salaConectada();
  if (!conectada) return pessoas;
  const outras = pessoas.filter((p) => p.usuario !== eu());
  if (idSala !== conectada) return outras;
  const local = pessoaLocal();
  const persona = local?.persona ?? minhaPersonaNa(idSala);
  const minha = {
    usuario: eu(),
    nome: persona.nome,
    imagem: persona.imagem ?? null,
    fonte: persona.fonte ?? null,
    mudo: local ? local.mudo : false,
    ensurdecido: voz.ensurdecido,
    camera: Boolean(local?.camera),
    tela: Boolean(local?.tela),
  };
  const lugar = pessoas.findIndex((p) => p.usuario === eu());
  if (lugar < 0) return [...outras, minha];
  const lista = [...pessoas];
  lista[lugar] = minha;
  return lista;
};

ganchosDaVoz.salaConectada = salaConectada;
ganchosDaVoz.encerrar = () => {
  if (voz.sala) sairDaSala();
  voz.assinaturaDaLista = "";
};

/* =================================================================
   Início
   ================================================================= */

function configurarVoz() {
  montarPainel();
  configurarVolume();
  configurarConfiguracoesDeVoz();

  // Clicar numa sala na lista entra nela (abrir pelo endereço só mostra)
  $("#lista").addEventListener("click", (evento) => {
    const link = evento.target.closest(".item-canal__link");
    const id = link?.closest(".item-canal")?.dataset.canal;
    if (!id || acharCanal(id)?.canal.tipo !== "voz") return;
    voz.entrarAoAbrir = id;
    if (location.hash === `#canal-${id}`) {
      evento.preventDefault();
      abrirPeloEndereco();
    }
  });
}

configurarVoz();
