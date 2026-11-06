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
     pessoa (a voz e a tela), só para você. Para o administrador, também
     "Mover para…"; ele ainda pode arrastar quem está numa sala, na
     lista, para outra sala (POST /api/chat/voz/mover). Quem é movido
     recebe o evento "mover" e troca de sala, com o mudo e o ensurdecido.
   - O microfone passa pelo portão de ruído (portao-de-ruido.js, um
     AudioWorklet), que cala o som abaixo do corte escolhido.
   - Sons curtos ao entrar e sair, e quando alguém entra ou sai da sua
     sala, feitos com Web Audio.

   O passe de entrada vem de POST /api/chat/voz/entrar; o ensurdecido,
   que o LiveKit não sabe, vai para POST /api/chat/voz/estado.

   Na prévia, a voz é simulada (sem o livekit-client): entrar mostra
   quadros com retratos, o "falando" alterna entre eles e os botões
   mudam os estados. Os sons tocam, e o "mover" mexe nas salas de
   exemplo (mover você mesmo passa pelo mesmo caminho do evento).

   Usa o chat.js (carregado antes): estado, ganchosDaVoz, acharCanal(),
   retratoDe(), nomeDaPersona(), personaEscolhidaDa(), desenharLista(),
   lerLocal(), gravarLocal(), eu(), personaDaContaDe(), abreCard(),
   personaDaPresencaNaSala() (o card de quem está na sala) e
   prepararSom() / contextoDoSom (os sons); e o comum.js: pedir(), criar(),
   simbolo(), perguntar(), avisarFalha(), avisoRapido().
   ================================================================= */

const CONFIG_DA_VOZ = {
  intervaloDaFala: 1800, // prévia: de quanto em quanto tempo troca quem fala
  esperaDaPrevia: 500, // prévia: o "Conectando…"
  chaveDosAparelhos: "chat:voz:aparelhos:2",
  chaveAntigaDosAparelhos: "chat:voz:aparelhos", // dela, só os aparelhos escolhidos valem
  chaveDosVolumes: "chat:voz:volumes",
  chaveDoPortao: "chat:voz:portao",
  chaveDosSons: "chat:voz:sons",
  cortePadrao: -50, // dB
  volumeDosSons: 0.06,
};

const DICA_DA_TELA =
  "Para levar o som, escolha a tela inteira (com 'Compartilhar áudio do sistema') ou uma aba. Uma janela sozinha não leva som.";

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

// Os aparelhos escolhidos ("" = o padrão do sistema) e o processamento do navegador
const aparelhos = { microfone: "", saida: "", camera: "", eco: false, ruido: false, ganho: true };
{
  const temNova = Boolean(lerLocal(CONFIG_DA_VOZ.chaveDosAparelhos));
  const guardados = lerObjetoLocal(temNova ? CONFIG_DA_VOZ.chaveDosAparelhos : CONFIG_DA_VOZ.chaveAntigaDosAparelhos);
  for (const chave of ["microfone", "saida", "camera"]) if (typeof guardados[chave] === "string") aparelhos[chave] = guardados[chave];
  if (temNova) for (const chave of ["eco", "ruido", "ganho"]) if (typeof guardados[chave] === "boolean") aparelhos[chave] = guardados[chave];
}
const guardarAparelhos = () => gravarLocal(CONFIG_DA_VOZ.chaveDosAparelhos, JSON.stringify(aparelhos));

// O portão de ruído: ligado, e o corte em dB (de −80 a 0)
const corteValido = (valor) => (Number.isFinite(valor) ? Math.min(0, Math.max(-80, Math.round(valor))) : CONFIG_DA_VOZ.cortePadrao);
const portao = { ligado: true, corte: CONFIG_DA_VOZ.cortePadrao };
{
  const guardado = lerObjetoLocal(CONFIG_DA_VOZ.chaveDoPortao);
  if (typeof guardado.ligado === "boolean") portao.ligado = guardado.ligado;
  if (guardado.corte !== undefined) portao.corte = corteValido(Number(guardado.corte));
}
const guardarPortao = () => gravarLocal(CONFIG_DA_VOZ.chaveDoPortao, JSON.stringify(portao));

// Os sons da chamada (entrar, sair, alguém entrou ou saiu): ligados, a não ser que desligue
const sonsDaChamadaLigados = () => lerLocal(CONFIG_DA_VOZ.chaveDosSons) !== "nao";

// O volume de cada pessoa, só para você: usuario → { volume: 0 a 100, tela: 0 a 100, silenciado }
const volumes = lerObjetoLocal(CONFIG_DA_VOZ.chaveDosVolumes);
const guardarVolumes = () => gravarLocal(CONFIG_DA_VOZ.chaveDosVolumes, JSON.stringify(volumes));

function volumeDe(usuario) {
  const guardado = volumes[usuario];
  const porcento = (valor) => {
    const numero = Number(valor);
    return Number.isFinite(numero) ? Math.min(100, Math.max(0, Math.round(numero))) : 100;
  };
  return { volume: porcento(guardado?.volume), tela: porcento(guardado?.tela), silenciado: Boolean(guardado?.silenciado) };
}

// O que de fato toca ("voz" ou "tela"): 0 com você ensurdecido ou a pessoa silenciada
function volumeQueToca(usuario, fonte = "voz") {
  if (voz.ensurdecido) return 0;
  const guardado = volumeDe(usuario);
  if (guardado.silenciado) return 0;
  return (fonte === "tela" ? guardado.tela : guardado.volume) / 100;
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
  return personaDaContaDe(eu());
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
   conectar({ microfone }), pessoas(), definirMicrofone(), definirCamera(),
   definirTela(), aplicarVolumes(), trocarAparelho(),
   reiniciarMicrofone(), aplicarPortao(), liberarSom() e sair(). Cada
   pessoa é { usuario, persona, local, mudo, camera, tela, telaComSom,
   falando, trilhaCamera, trilhaTela }.
   ================================================================= */

function opcoesDoMicrofone() {
  return {
    deviceId: aparelhos.microfone ? { ideal: aparelhos.microfone } : undefined,
    echoCancellation: aparelhos.eco,
    noiseSuppression: aparelhos.ruido,
    autoGainControl: aparelhos.ganho,
    channelCount: 1,
  };
}

/* ---------- O portão de ruído, como processador do LiveKit ---------- */

let portaoFalhou = false; // avisa uma vez só por página

function avisarFalhaDoPortao() {
  if (portaoFalhou) return;
  portaoFalhou = true;
  avisoRapido("Seu navegador não aceitou o corte de ruído: a voz segue sem ele.");
}

// A interface que o LiveKit pede (name, init, restart, destroy, processedTrack), com um
// AudioContext próprio: microfone → portão (AudioWorklet) → trilha nova, em mono
function criarProcessadorDoPortao() {
  let contexto = null;
  let fonte = null;
  let no = null;

  function ligarFonte(trilha) {
    fonte?.disconnect();
    fonte = contexto.createMediaStreamSource(new MediaStream([trilha]));
    fonte.connect(no);
  }

  const processador = {
    name: "portao-de-ruido",
    processedTrack: undefined,
    async init({ track }) {
      if (typeof AudioWorkletNode !== "function") throw new Error("Sem AudioWorklet");
      contexto = new AudioContext();
      await contexto.audioWorklet.addModule("portao-de-ruido.js");
      no = new AudioWorkletNode(contexto, "portao-de-ruido", {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        channelCount: 1,
        channelCountMode: "explicit",
        outputChannelCount: [1],
        processorOptions: { corte: portao.corte },
      });
      const destino = contexto.createMediaStreamDestination();
      destino.channelCount = 1;
      no.connect(destino);
      ligarFonte(track);
      processador.processedTrack = destino.stream.getAudioTracks()[0];
      if (contexto.state === "suspended") contexto.resume().catch(() => {});
    },
    async restart({ track }) {
      if (contexto) ligarFonte(track);
    },
    async destroy() {
      fonte?.disconnect();
      no?.disconnect();
      processador.processedTrack?.stop();
      await contexto?.close().catch(() => {});
      contexto = fonte = no = null;
      processador.processedTrack = undefined;
    },
    mudarCorte: (corte) => no?.port.postMessage({ corte }),
  };
  return processador;
}

/* ---------- Os sons da chamada (Web Audio, sem arquivo) ---------- */

// Cada nota: [frequência do começo, frequência do fim, atraso, duração], em Hz e segundos
const SONS_DA_CHAMADA = {
  entrei: [
    [587, 587, 0, 0.13],
    [880, 880, 0.1, 0.2],
  ],
  sai: [
    [880, 880, 0, 0.13],
    [587, 587, 0.1, 0.2],
  ],
  chegou: [[620, 830, 0, 0.14]],
  partiu: [[830, 620, 0, 0.14]],
};

function tocarSomDaChamada(tipo) {
  if (!sonsDaChamadaLigados()) return;
  prepararSom();
  const ctx = contextoDoSom;
  if (!ctx) return;
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  const inicio = ctx.currentTime + 0.01;
  for (const [de, para, atraso, duracao] of SONS_DA_CHAMADA[tipo] ?? []) {
    const comeco = inicio + atraso;
    const nota = ctx.createOscillator();
    const volume = ctx.createGain();
    nota.type = "sine";
    nota.frequency.setValueAtTime(de, comeco);
    if (para !== de) nota.frequency.exponentialRampToValueAtTime(para, comeco + duracao * 0.8);
    volume.gain.setValueAtTime(0.0001, comeco);
    volume.gain.exponentialRampToValueAtTime(CONFIG_DA_VOZ.volumeDosSons, comeco + 0.012);
    volume.gain.exponentialRampToValueAtTime(0.0001, comeco + duracao);
    nota.connect(volume).connect(ctx.destination);
    nota.start(comeco);
    nota.stop(comeco + duracao + 0.02);
  }
}

function criarMotorDoLivekit(idSala, avisos) {
  const { Room, RoomEvent, Track, VideoPresets, AudioPresets, DisconnectReason } = window.LivekitClient;
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
    const somDaTela = participante.getTrackPublication(Track.Source.ScreenShareAudio);
    const ligada = (publicacao) => Boolean(publicacao && !publicacao.isMuted && (local || publicacao.isSubscribed || publicacao.track));
    return {
      usuario,
      persona,
      local,
      mudo: !participante.isMicrophoneEnabled,
      camera: ligada(camera),
      tela: ligada(tela),
      telaComSom: ligada(tela) && Boolean(somDaTela && !somDaTela.isMuted),
      falando: participante.isSpeaking,
      trilhaCamera: ligada(camera) ? camera.track ?? null : null,
      trilhaTela: ligada(tela) ? tela.track ?? null : null,
    };
  }

  function aplicarVolumeEm(participante) {
    if (!sala || !participante || participante === sala.localParticipant || typeof participante.setVolume !== "function") return;
    const usuario = lerMetadata(participante.metadata).usuario || participante.identity;
    participante.setVolume(volumeQueToca(usuario, "voz"), Track.Source.Microphone);
    participante.setVolume(volumeQueToca(usuario, "tela"), Track.Source.ScreenShareAudio);
  }

  // O portão no microfone: põe, tira ou só muda o corte. Uma mudança por vez.
  let filaDoPortao = Promise.resolve();
  function aplicarPortao() {
    filaDoPortao = filaDoPortao
      .then(async () => {
        const trilha = sala?.localParticipant.getTrackPublication(Track.Source.Microphone)?.track;
        if (!trilha || typeof trilha.setProcessor !== "function") return;
        const atual = trilha.getProcessor();
        if (portao.ligado && !atual) {
          const processador = criarProcessadorDoPortao();
          try {
            await trilha.setProcessor(processador);
          } catch {
            processador.destroy().catch(() => {});
            avisarFalhaDoPortao();
          }
        } else if (!portao.ligado && atual) {
          await trilha.stopProcessor();
        } else if (atual) {
          atual.mudarCorte?.(portao.corte);
        }
      })
      .catch(() => {});
    return filaDoPortao;
  }

  function limparAudios() {
    caixaDosAudios.replaceChildren();
  }

  function ligarEventos() {
    const mudou = () => avisos.mudou();
    sala
      .on(RoomEvent.ParticipantConnected, (participante) => {
        aplicarVolumeEm(participante);
        avisos.chegou();
        mudou();
      })
      .on(RoomEvent.ParticipantDisconnected, () => {
        avisos.partiu();
        mudou();
      })
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
      .on(RoomEvent.LocalTrackPublished, (publicacao) => {
        if (publicacao.source === Track.Source.Microphone) aplicarPortao();
        mudou();
      })
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
    async conectar({ microfone = true } = {}) {
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
        publishDefaults: { audioPreset: AudioPresets.musicHighQuality }, // 96 kbps; DTX e RED como no padrão
      });
      ligarEventos();
      await sala.connect(passe.url, passe.token);
      if (saindo) return;
      sala.startAudio().catch(() => {});
      avisos.somBloqueado(!sala.canPlaybackAudio);
      if (microfone) {
        try {
          await sala.localParticipant.setMicrophoneEnabled(true, opcoesDoMicrofone());
        } catch (falha) {
          avisoRapido(textoDaFalhaDeAparelho(falha, "microfone"));
        }
      }
      avisos.mudou();
    },
    pessoas() {
      if (!sala || sala.state === "disconnected") return [];
      return [pessoaDe(sala.localParticipant, true), ...[...sala.remoteParticipants.values()].map((p) => pessoaDe(p, false))];
    },
    definirMicrofone: (ligado) => sala?.localParticipant.setMicrophoneEnabled(ligado, opcoesDoMicrofone()),
    definirCamera: (ligada) => sala?.localParticipant.setCameraEnabled(ligada, opcoesDaCamera()),
    // O som vai junto, sem o som desta aba (as vozes da chamada), quando o navegador deixa
    definirTela: (ligada) =>
      sala?.localParticipant.setScreenShareEnabled(
        ligada,
        ligada
          ? {
              audio: { restrictOwnAudio: true, echoCancellation: false, noiseSuppression: false, autoGainControl: false },
              systemAudio: "include",
              selfBrowserSurface: "exclude",
            }
          : undefined,
      ),
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
    aplicarPortao,
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
  const daPresenca = (p) => ({
    usuario: p.usuario,
    persona: personaDaPresencaNaSala(p, categoria),
    local: false,
    mudo: Boolean(p.mudo),
    ensurdecido: Boolean(p.ensurdecido),
    camera: Boolean(p.camera),
    tela: Boolean(p.tela),
    falando: false,
  });

  return {
    async conectar({ microfone = true } = {}) {
      await esperar(CONFIG_DA_VOZ.esperaDaPrevia);
      if (saiu) return;
      const outras = (estado.dados.voz?.salas?.[idSala] ?? []).filter((p) => p.usuario !== eu());
      pessoas = [
        { usuario: eu(), persona: minhaPersonaNa(idSala), local: true, mudo: !microfone, camera: false, tela: false, falando: false },
        ...outras.map(daPresenca),
      ];
      timer = setInterval(alternarFala, CONFIG_DA_VOZ.intervaloDaFala);
    },
    // Na prévia, as telas de exemplo vêm com som
    pessoas: () => pessoas.map((p) => ({ ...p, telaComSom: p.tela, trilhaCamera: null, trilhaTela: null, simulada: true })),
    // Só na prévia: o "mover" de exemplo põe e tira gente da sala
    chegou(presenca) {
      if (saiu || pessoas.some((p) => p.usuario === presenca.usuario)) return;
      pessoas.push(daPresenca(presenca));
      avisos.chegou();
      avisos.mudou();
    },
    partiu(usuario) {
      if (saiu || !pessoas.some((p) => p.usuario === usuario && !p.local)) return;
      pessoas = pessoas.filter((p) => p.usuario !== usuario);
      avisos.partiu();
      avisos.mudou();
    },
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
    async aplicarPortao() {},
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
    chegou: () => vale() && voz.situacao === "conectado" && tocarSomDaChamada("chegou"),
    partiu: () => vale() && voz.situacao === "conectado" && tocarSomDaChamada("partiu"),
  };
}

// "manter" (quando o administrador move você): { mudo, ensurdecido, mudoAntes } da sala de antes
async function entrarNaSala(idSala, manter = null) {
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
  Object.assign(voz, {
    motor,
    sala: idSala,
    situacao: "conectando",
    queda: "",
    ensurdecido: Boolean(manter?.ensurdecido),
    mudoAntes: Boolean(manter?.mudoAntes),
    somBloqueado: false,
    ampliado: undefined,
  });
  desenharTudo();

  try {
    await motor.conectar({ microfone: !manter?.mudo });
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
  if (voz.ensurdecido) avisarEnsurdecido();
  tocarSomDaChamada("entrei"); // trocar de sala toca só este
  desenharTudo();
}

// O botão Sair: o único que toca o "saiu"
function sairPeloBotao() {
  if (salaConectada()) tocarSomDaChamada("sai");
  sairDaSala();
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

// Sem "restrictOwnAudio", o som desta aba (as vozes da chamada) iria junto: avisa uma vez por página
let avisouDoSomDaTela = false;

function navegadorTiraOSomDoChat() {
  try {
    return Boolean(navigator.mediaDevices?.getSupportedConstraints?.().restrictOwnAudio);
  } catch {
    return false;
  }
}

async function alternarTela() {
  const local = pessoaLocal();
  if (!voz.motor || !local) return;
  if (!local.tela && !avisouDoSomDaTela && !navegadorTiraOSomDoChat()) {
    avisouDoSomDaTela = true;
    await perguntar({
      titulo: "O som do chat pode ir junto",
      texto:
        "Seu navegador não consegue tirar o som do chat da transmissão. Compartilhe só uma aba, ou desmarque 'Compartilhar áudio'.",
    });
    if (!voz.motor || pessoaLocal()?.tela) return;
  }
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
  marcarQuemFalaNaLista();
}

// O brilho de quem fala na lista da esquerda: só na sala conectada (das outras, não se sabe quem fala)
function marcarQuemFalaNaLista() {
  const conectada = salaConectada();
  const falando = new Set(conectada ? pessoasDaSala().filter((p) => p.falando && !p.mudo).map((p) => p.usuario) : []);
  for (const linha of document.querySelectorAll("#lista .item-canal__sala li")) {
    linha.classList.toggle("item-canal__falando", linha.dataset.sala === conectada && falando.has(linha.dataset.usuario));
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

function trocarBotao(b, { rotulo, icone, pressionado, desligado = false, ligado = false, dica = "" }) {
  b.title = dica || rotulo;
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
  painel.sair = botaoDaVoz("Sair da sala", "icone-desligar", sairPeloBotao, "botao-voz--sair");
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
    dica: local?.tela ? "" : DICA_DA_TELA,
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
      abreCard(item, () => ({ usuario: pessoa.usuario, persona: personaDaPresencaNaSala(pessoa, categoria), categoria }));
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
    if (!podeAbrirMenuDe(usuario)) return;
    evento.preventDefault();
    abrirVolume(usuario, registro.nome, evento.clientX, evento.clientY);
  });
  voz.quadros.set(q.chave, registro);
  return registro;
}

// O retrato grande do quadro sem câmera: a classe pelo tipo vai só no <img>; atrás do retrato e da foto,
// a mesma imagem desfocada cobre o quadro (sai se falhar, ou se o retrato falhar e virar selo)
function retratoDoQuadro(persona, categoria) {
  const retrato = retratoDe(persona, categoria, "quadro__retrato");
  if (retrato.tagName !== "IMG" || persona.tipo === "mestre") return [retrato];
  retrato.classList.add(persona.tipo === "conta" ? "quadro__retrato--foto" : "quadro__retrato--corpo");
  const fundo = imagem(persona.imagem, "quadro__fundo");
  fundo.alt = "";
  fundo.setAttribute("aria-hidden", "true");
  fundo.addEventListener("error", () => fundo.remove(), { once: true });
  retrato.addEventListener("error", () => fundo.remove(), { once: true });
  return [fundo, retrato];
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
  elemento.setAttribute("aria-label", ehTela ? `Tela de ${p.persona.nome}${p.telaComSom ? ", com som" : ""}` : p.persona.nome);

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
      registro.midia.replaceChildren(...retratoDoQuadro(p.persona, categoria));
    }
  }

  // O rótulo: o nome (que abre o card, sem ampliar o quadro) e os ícones
  const nome = nomeDaPersona(p.persona, "quadro__nome");
  abreCard(nome, () => ({ usuario: p.usuario, persona: p.persona, categoria }));
  const partes = [];
  if (ehTela) {
    partes.push(simbolo("icone-tela", "estado-voz"), criar("span", "quadro__de", "Tela de "), nome);
    if (p.telaComSom) partes.push(simbolo("icone-voz", "estado-voz"));
  } else {
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

const souAdmin = () => Boolean(estado.dados?.conta.admin);

// O menu de clique direito: o volume dos outros; o administrador também move (até a si mesmo)
const podeAbrirMenuDe = (usuario) => Boolean(usuario) && (usuario !== eu() || souAdmin());

function abrirVolume(usuario, nome, x, y) {
  if (!podeAbrirMenuDe(usuario)) return;
  const proprio = usuario === eu();
  if (proprio && !salaAtualDe(usuario)) return; // você mesmo: só para mover, estando numa sala
  volumeDeQuem = usuario;
  const caixa = $("#volume-pessoa");
  $("#volume-nome").textContent = nome || contaPorUsuario(usuario)?.nome || usuario;
  $("#volume-controles").hidden = proprio;
  if (!proprio) {
    const { volume, tela, silenciado } = volumeDe(usuario);
    $("#volume-barra").value = String(volume);
    $("#volume-valor").textContent = `${volume}%`;
    $("#volume-tela").value = String(tela);
    $("#volume-tela-valor").textContent = `${tela}%`;
    $("#volume-silenciar").checked = silenciado;
  }
  preencherMover(usuario);
  caixa.hidden = false;
  const largura = caixa.offsetWidth;
  const altura = caixa.offsetHeight;
  const esquerda = Math.max(8, Math.min(x, window.innerWidth - largura - 8));
  const topo = Math.max(8, Math.min(y, window.innerHeight - altura - 8));
  caixa.style.setProperty("left", `${esquerda + window.scrollX}px`);
  caixa.style.setProperty("top", `${topo + window.scrollY}px`);
  (proprio ? caixa.querySelector(".volume-pessoa__sala") : $("#volume-barra"))?.focus();
}

function fecharVolume() {
  $("#volume-pessoa").hidden = true;
  volumeDeQuem = null;
}

function mudarVolume() {
  if (!volumeDeQuem || volumeDeQuem === eu()) return;
  const volume = Number($("#volume-barra").value);
  const tela = Number($("#volume-tela").value);
  const silenciado = $("#volume-silenciar").checked;
  $("#volume-valor").textContent = `${volume}%`;
  $("#volume-tela-valor").textContent = `${tela}%`;
  if (volume === 100 && tela === 100 && !silenciado) delete volumes[volumeDeQuem];
  else volumes[volumeDeQuem] = { volume, tela, silenciado };
  guardarVolumes();
  voz.motor?.aplicarVolumes();
}

/* =================================================================
   Mover pessoas entre as salas (só o administrador)
   ================================================================= */

// A sala de voz em que a pessoa está agora (a sua, pelo LiveKit; a dos outros, pela presença)
function salaAtualDe(usuario) {
  if (usuario === eu()) return salaConectada();
  for (const [id, pessoas] of Object.entries(estado.dados?.voz?.salas ?? {})) {
    if (pessoas.some((p) => p.usuario === usuario)) return id;
  }
  return null;
}

// As salas de voz que a pessoa vê, na ordem da lista
function salasQueVe(usuario) {
  const salas = [];
  for (const categoria of estado.dados?.categorias ?? []) {
    if (!(estado.dados.membros?.[categoria.id] ?? []).includes(usuario)) continue;
    for (const canal of categoria.canais) if (canal.tipo === "voz") salas.push({ canal, categoria });
  }
  return salas;
}

function preencherMover(usuario) {
  const caixa = $("#volume-mover");
  const atual = souAdmin() ? salaAtualDe(usuario) : null;
  caixa.hidden = !atual;
  if (!atual) return;
  const botoes = salasQueVe(usuario)
    .filter(({ canal }) => canal.id !== atual)
    .map(({ canal, categoria }) => {
      const b = criar("button", "volume-pessoa__sala");
      b.type = "button";
      b.append(criar("span", null, canal.nome), criar("span", "volume-pessoa__sala-categoria", categoria.nome));
      b.addEventListener("click", () => {
        fecharVolume();
        moverPessoa(usuario, canal.id);
      });
      return b;
    });
  $("#volume-salas").replaceChildren(...(botoes.length ? botoes : [criar("p", "volume-pessoa__vazio", "Nenhuma outra sala de voz.")]));
}

async function moverPessoa(usuario, idSala) {
  const de = salaAtualDe(usuario);
  const destino = acharCanal(idSala);
  if (!souAdmin() || !de || de === idSala || destino?.canal.tipo !== "voz") return;
  if (MODO_PREVIA) return moverNaPrevia(usuario, de, destino);
  try {
    const resposta = await pedir("POST", "/api/chat/voz/mover", { usuario, canal: idSala });
    if (resposta?.movida && usuario !== eu()) avisoRapido(`${contaPorUsuario(usuario)?.nome ?? usuario} foi para ${destino.canal.nome}.`);
  } catch (falha) {
    avisarFalha(falha);
  }
}

// Prévia: mexe nas salas de exemplo como o servidor faria; mover você mesmo passa pelo evento
function moverNaPrevia(usuario, de, destino) {
  if (usuario === eu()) return ganchosDaVoz.mover({ canal: destino.canal.id });
  const salas = estado.dados.voz.salas;
  const pessoa = (salas[de] ?? []).find((p) => p.usuario === usuario);
  if (!pessoa) return;
  salas[de] = salas[de].filter((p) => p !== pessoa);
  if (!salas[de].length) delete salas[de];
  const mesa = destino.categoria.mesa;
  const persona = (mesa && estado.dados.personasDosMembros?.[destino.categoria.id]?.[usuario]) || personaDaContaDe(usuario);
  const nova = { ...pessoa, nome: persona.nome, imagem: persona.imagem ?? null, fonte: persona.fonte ?? null };
  (salas[destino.canal.id] ??= []).push(nova);
  if (voz.sala === de) voz.motor?.partiu?.(usuario);
  if (voz.sala === destino.canal.id) voz.motor?.chegou?.(nova);
  desenharLista();
  agendarDesenho();
  avisoRapido(`${contaPorUsuario(usuario)?.nome ?? usuario} foi para ${destino.canal.nome}.`);
}

// Arrastar, na lista, quem está numa sala para outra sala de voz
function configurarArrastar() {
  const lista = $("#lista");
  let arrastando = null; // { usuario, de }

  const salaDoAlvo = (evento) => {
    const item = evento.target.closest?.(".item-canal[data-canal]");
    if (!item || !arrastando) return null;
    const achado = acharCanal(item.dataset.canal);
    if (achado?.canal.tipo !== "voz") return null;
    if (!(estado.dados.membros?.[achado.categoria.id] ?? []).includes(arrastando.usuario)) return null;
    return item;
  };
  const marcar = (item) => {
    for (const outro of lista.querySelectorAll(".item-canal--alvo")) if (outro !== item) outro.classList.remove("item-canal--alvo");
    item?.classList.add("item-canal--alvo");
  };

  lista.addEventListener("dragstart", (evento) => {
    const linha = evento.target.closest?.(".item-canal__sala li[draggable='true']");
    if (!linha || !souAdmin()) return;
    arrastando = { usuario: linha.dataset.usuario, de: linha.dataset.sala };
    evento.dataTransfer.effectAllowed = "move";
    evento.dataTransfer.setData("text/plain", linha.dataset.usuario);
  });
  lista.addEventListener("dragover", (evento) => {
    const item = salaDoAlvo(evento);
    marcar(item);
    if (!item) return;
    evento.preventDefault();
    evento.dataTransfer.dropEffect = item.dataset.canal === arrastando.de ? "none" : "move";
  });
  lista.addEventListener("dragleave", (evento) => {
    if (!lista.contains(evento.relatedTarget)) marcar(null);
  });
  lista.addEventListener("drop", (evento) => {
    const item = salaDoAlvo(evento);
    const quem = arrastando;
    arrastando = null;
    marcar(null);
    if (!item) return;
    evento.preventDefault();
    if (item.dataset.canal !== quem.de) moverPessoa(quem.usuario, item.dataset.canal);
  });
  document.addEventListener("dragend", () => {
    arrastando = null;
    marcar(null);
  });
}

function configurarVolume() {
  $("#volume-barra").addEventListener("input", mudarVolume);
  $("#volume-tela").addEventListener("input", mudarVolume);
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
    if (!linha || !podeAbrirMenuDe(linha.dataset.usuario)) return;
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
  $("#voz-eco").checked = aparelhos.eco;
  $("#voz-ruido").checked = aparelhos.ruido;
  $("#voz-ganho").checked = aparelhos.ganho;
  $("#voz-sons").checked = sonsDaChamadaLigados();
  mostrarPortao();
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
  aparelhos.eco = $("#voz-eco").checked;
  aparelhos.ruido = $("#voz-ruido").checked;
  aparelhos.ganho = $("#voz-ganho").checked;
  guardarAparelhos();
  try {
    await voz.motor?.reiniciarMicrofone();
  } catch (falha) {
    avisoDosAparelhos(textoDaFalhaDeAparelho(falha, "microfone"));
  }
  if (teste.ligado) comecarTeste();
}

/* ---------- O portão de ruído (a sensibilidade do microfone) ---------- */

const textoDoCorte = (corte) => `${corte < 0 ? "−" : ""}${Math.abs(corte)} dB`;

function mostrarPortao() {
  $("#voz-portao").checked = portao.ligado;
  $("#voz-corte").value = String(portao.corte);
  $("#voz-corte").disabled = !portao.ligado;
  $("#voz-corte-valor").textContent = portao.ligado ? textoDoCorte(portao.corte) : "Desligado";
}

function mudarPortao() {
  portao.ligado = $("#voz-portao").checked;
  portao.corte = corteValido(Number($("#voz-corte").value));
  guardarPortao();
  mostrarPortao();
  voz.motor?.aplicarPortao();
}

/* ---------- O teste do microfone ---------- */

const teste = { ligado: false, fluxo: null, contexto: null, quadro: 0 };

// O nível em dB (−80 a 0) na barra; verde quando passa do corte (ou com o portão desligado)
function mostrarNivel(decibeis) {
  const nivel = Number.isFinite(decibeis) ? (decibeis + 80) / 80 : 0;
  $("#voz-nivel").style.setProperty("--nivel", String(Math.min(1, Math.max(0, nivel))));
  $("#voz-barra").classList.toggle("voz-teste__barra--passa", teste.ligado && (!portao.ligado || decibeis > portao.corte));
}

function pararTeste() {
  cancelAnimationFrame(teste.quadro);
  teste.fluxo?.getTracks().forEach((t) => t.stop());
  teste.contexto?.close().catch(() => {});
  Object.assign(teste, { ligado: false, fluxo: null, contexto: null, quadro: 0 });
  mostrarNivel(-Infinity);
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
      fase += 0.06;
      // Fala de exemplo: sobe e desce entre o ruído de fundo (−70 dB) e a voz (−15 dB)
      mostrarNivel(-70 + Math.max(0, Math.sin(fase)) * 50 + Math.random() * 8);
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
  const amostras = new Float32Array(analisador.fftSize);
  const medir = () => {
    analisador.getFloatTimeDomainData(amostras);
    let soma = 0;
    for (const amostra of amostras) soma += amostra * amostra;
    const rms = Math.sqrt(soma / amostras.length);
    mostrarNivel(rms > 0 ? 20 * Math.log10(rms) : -Infinity);
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
  $("#voz-eco").addEventListener("change", mudarProcessamento);
  $("#voz-ruido").addEventListener("change", mudarProcessamento);
  $("#voz-ganho").addEventListener("change", mudarProcessamento);
  $("#voz-portao").addEventListener("change", mudarPortao);
  $("#voz-corte").addEventListener("input", mudarPortao);
  $("#voz-sons").addEventListener("change", () => {
    const ligar = $("#voz-sons").checked;
    gravarLocal(CONFIG_DA_VOZ.chaveDosSons, ligar ? "sim" : "nao");
    if (ligar) tocarSomDaChamada("entrei"); // para ouvir como é
  });
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

// O administrador moveu você: troca de sala com o mudo e o ensurdecido de agora (fora de sala, ignora)
ganchosDaVoz.mover = ({ canal }) => {
  if (!salaConectada() || voz.situacao === "conectando" || canal === voz.sala) return;
  const destino = acharCanal(canal);
  if (destino?.canal.tipo !== "voz") return;
  const local = pessoaLocal();
  const manter = {
    ensurdecido: voz.ensurdecido,
    mudoAntes: voz.ensurdecido ? voz.mudoAntes : Boolean(local?.mudo),
    mudo: voz.ensurdecido || Boolean(local?.mudo),
  };
  avisoRapido(`Você foi movido para ${destino.canal.nome}.`);
  entrarNaSala(canal, manter);
};

ganchosDaVoz.salaConectada = salaConectada;
ganchosDaVoz.depoisDaLista = marcarQuemFalaNaLista;
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
  configurarArrastar();
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
