/* =================================================================
   Crônicas Eternas: Chat (o portão de ruído do microfone)
   -----------------------------------------------------------------
   Um AudioWorklet, carregado pelo voz.js com audioWorklet.addModule.
   Mede o nível (RMS) em janelas de 10 ms: acima do corte, o som
   passa; abaixo, depois de segurar um pouco, ele se cala.

   - Ataque de 5 ms, segura 250 ms e solta em 120 ms.
   - O corte (em dB, de −80 a 0) vem em processorOptions.corte e
     muda na hora por mensagem: port.postMessage({ corte }).
   ================================================================= */

const PORTAO = {
  janela: 0.01, // segundos de cada medida
  ataque: 0.005,
  segura: 0.25,
  solta: 0.12,
  cortePadrao: -50,
};

const corteValido = (valor) => (Number.isFinite(valor) ? Math.min(0, Math.max(-80, valor)) : PORTAO.cortePadrao);

class PortaoDeRuido extends AudioWorkletProcessor {
  constructor(opcoes) {
    super();
    this.corte = corteValido(opcoes?.processorOptions?.corte);
    this.tamanhoDaJanela = Math.max(1, Math.round(sampleRate * PORTAO.janela));
    this.somaDaJanela = 0;
    this.amostrasNaJanela = 0;
    this.aberto = false;
    this.segurando = 0; // amostras que ainda faltam segurar aberto
    this.ganho = 0;
    this.passoDeAtaque = 1 / (sampleRate * PORTAO.ataque);
    this.passoDeSoltura = 1 / (sampleRate * PORTAO.solta);
    this.amostrasDeSegura = Math.round(sampleRate * PORTAO.segura);
    this.port.onmessage = (evento) => {
      if (evento.data && "corte" in evento.data) this.corte = corteValido(Number(evento.data.corte));
    };
  }

  // Uma janela de 10 ms terminou: decide se o portão abre
  fecharJanela() {
    const rms = Math.sqrt(this.somaDaJanela / this.amostrasNaJanela);
    const nivel = rms > 0 ? 20 * Math.log10(rms) : -Infinity;
    if (nivel > this.corte) {
      this.aberto = true;
      this.segurando = this.amostrasDeSegura;
    }
    this.somaDaJanela = 0;
    this.amostrasNaJanela = 0;
  }

  process(entradas, saidas) {
    const entrada = entradas[0];
    const saida = saidas[0];
    if (!saida?.length) return true;
    const canal = entrada?.[0];
    const quantas = saida[0].length;

    for (let i = 0; i < quantas; i++) {
      const amostra = canal ? canal[i] : 0;
      this.somaDaJanela += amostra * amostra;
      if (++this.amostrasNaJanela >= this.tamanhoDaJanela) this.fecharJanela();

      if (this.aberto) {
        if (this.segurando > 0) this.segurando--;
        else this.aberto = false;
      }
      if (this.aberto) this.ganho = Math.min(1, this.ganho + this.passoDeAtaque);
      else this.ganho = Math.max(0, this.ganho - this.passoDeSoltura);

      const valor = amostra * this.ganho;
      for (const saidaDoCanal of saida) saidaDoCanal[i] = valor;
    }
    return true;
  }
}

registerProcessor("portao-de-ruido", PortaoDeRuido);
