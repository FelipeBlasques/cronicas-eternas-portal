/* =================================================================
   Crônicas Eternas: o Ciclo de Sylara
   -----------------------------------------------------------------
   O calendário de Draevor: 10 meses de 30 dias, em 3 dezenas cada,
   contados a partir do Expurgo Demoníaco (0 ED). O dia 1 de Auralis
   é Sylara, e a lua Drae'mora fica cheia no dia 16.

   Carregado depois do comum.js e antes do script da página, nas
   páginas que escrevem datas do mundo (Linha do Tempo e
   Personagens). Nenhum nome daqui pode ser declarado de novo lá.
   ================================================================= */

const MESES = ["Auralis", "Florentis", "Ignarion", "Solcanis", "Lumenir", "Forganis", "Ventharis", "Umbriel", "Frostir", "Tervalith"];
const ESTACOES = ["Primavera", "Primavera", "Verão", "Verão", "Outono", "Outono", "Inverno", "Inverno", "Inverno", "Transição"];
const DIAS_DA_DEZENA = ["Primur", "Secundis", "Tertiar", "Quartis", "Quintis", "Sextar", "Septium", "Octar", "Nonir", "Decimar"];
const FASES = { nova: "Lua Nova", crescente: "Quarto Crescente", cheia: "Lua Cheia", minguante: "Quarto Minguante" };

const faseDaLua = (dia) => (dia === 1 ? "nova" : dia <= 15 ? "crescente" : dia === 16 ? "cheia" : "minguante");
const diaDaDezena = (dia) => DIAS_DA_DEZENA[(dia - 1) % 10];
const ehSylara = (data) => data.mes === 1 && data.dia === 1;
const chaveDaData = (data) => data.ano * 10000 + (data.mes || 0) * 100 + (data.dia || 0);

// "312 ED", "Florentis de 312 ED", "15 de Florentis de 312 ED" ou, por extenso,
// "Quintis, 15 de Florentis de 312 ED". O dia 1 de Auralis é Sylara.
function textoDaData(data, { extenso = false } = {}) {
  const aprox = data.aprox ? "c. " : "";
  if (!data.mes) return `${aprox}${data.ano} ED`;
  const mes = MESES[data.mes - 1];
  if (!data.dia) return `${aprox}${mes} de ${data.ano} ED`;
  const base = `${data.dia} de ${mes} de ${data.ano} ED`;
  if (!extenso) return aprox + base;
  return `${aprox}${ehSylara(data) ? "Sylara" : diaDaDezena(data.dia)}, ${base}`;
}

function textoDoPeriodo(ev, opcoes) {
  if (!ev.ate) return textoDaData(ev.data, opcoes);
  const { data: de, ate } = ev;
  if (!de.mes && !ate.mes) return `De ${de.aprox ? "c. " : ""}${de.ano} a ${ate.ano} ED`;
  return `De ${textoDaData(de, opcoes)} a ${textoDaData(ate, opcoes)}`;
}
