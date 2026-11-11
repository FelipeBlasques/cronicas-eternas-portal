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

// Soma dias a uma data completa. Todo mês tem 30 dias e todo ano tem 300.
function somarDias(data, dias) {
  const total = data.ano * 300 + (data.mes - 1) * 30 + (data.dia - 1) + dias;
  return { ano: Math.floor(total / 300), mes: Math.floor((total % 300) / 30) + 1, dia: (total % 30) + 1 };
}

// A idade em anos completos do nascimento até a data final (hoje, a Morte ou Destruído), ou null
// sem uma das duas ou com o nascimento depois do fim. O aniversário é o dia e o mês do nascimento;
// só com o mês, vale o dia 1 dele; só com o ano, conta a diferença dos anos. Fica aproximada ("c.")
// quando uma das duas datas é aproximada ou não tem mês.
function idadeEntre(nascimento, fim) {
  if (!nascimento || !fim) return null;
  let anos = fim.ano - nascimento.ano;
  if (nascimento.mes && fim.mes) {
    const aniversario = nascimento.mes * 100 + (nascimento.dia || 1);
    if (fim.mes * 100 + (fim.dia || 1) < aniversario) anos -= 1;
  }
  if (anos < 0) return null;
  return { anos, aprox: Boolean(nascimento.aprox || !nascimento.mes || fim.aprox || !fim.mes) };
}

// "27 anos", "1 ano", "c. 27 anos", "menos de 1 ano"; com o motivo "morte", "35 anos ao morrer",
// e com "destruido", "35 anos ao ser destruído". Sem idade, "".
function textoDaIdade(idade, motivo) {
  if (!idade) return "";
  const { anos, aprox } = idade;
  const base = anos === 0 ? "menos de 1 ano" : `${aprox ? "c. " : ""}${anos} ${anos === 1 ? "ano" : "anos"}`;
  if (motivo === "morte") return `${base} ao morrer`;
  if (motivo === "destruido") return `${base} ao ser destruído`;
  return base;
}
