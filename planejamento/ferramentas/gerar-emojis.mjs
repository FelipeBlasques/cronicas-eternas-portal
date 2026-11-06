// Gera portal/publico/chat/emojis.js, a lista de emojis do chat (só dados).
//
// O pacote é instalado só para gerar, numa pasta fora de portal/:
//
//   mkdir /tmp/emojis && cd /tmp/emojis && npm init -y
//   npm i emojibase-data@18.0.0
//   node <repositório>/planejamento/ferramentas/gerar-emojis.mjs /tmp/emojis
//
// Tudo vem do emojibase-data (pt/data.json): a lista, os grupos e a ordem, os nomes
// e as palavras em português (dados do CLDR) e os tons de pele. Até a versão do Emoji
// que o Noto Color Emoji tem (VERSAO_MAXIMA). Ao trocar as versões, acerte
// LICENCA-emojis.txt.

import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const pastaDosPacotes = path.resolve(process.argv[2] ?? ".");
const exigir = createRequire(path.join(pastaDosPacotes, "package.json"));
const destino = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../portal/publico/chat/emojis.js");

const VERSAO_MAXIMA = 17;

const dados = exigir("emojibase-data/pt/data.json");
const versaoDosDados = exigir("emojibase-data/package.json").version;

// Os grupos do chat e os "group" do emojibase de cada um (o 2, component, fica de fora)
const GRUPOS = [
  { id: "pessoas", nome: "Rostos e pessoas", de: [0, 1] },
  { id: "natureza", nome: "Animais e natureza", de: [3] },
  { id: "comida", nome: "Comida e bebida", de: [4] },
  { id: "atividades", nome: "Atividades", de: [6] },
  { id: "viagens", nome: "Viagens e lugares", de: [5] },
  { id: "objetos", nome: "Objetos", de: [7] },
  { id: "simbolos", nome: "Símbolos", de: [8] },
  { id: "bandeiras", nome: "Bandeiras", de: [9] },
];

// Os cinco tons de um emoji (só os de um tom, até a versão máxima), ou nada
function tonsDe(x) {
  const tons = (x.skins ?? [])
    .filter((s) => typeof s.tone === "number" && s.version <= VERSAO_MAXIMA)
    .sort((a, b) => a.tone - b.tone);
  if (tons.length !== 5 || tons.some((s, i) => s.tone !== i + 1)) return null;
  return tons.map((s) => s.emoji);
}

const grupos = GRUPOS.map((g) => ({ id: g.id, nome: g.nome, emojis: [] }));
const ordenados = [...dados].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
for (const x of ordenados) {
  if (typeof x.group !== "number" || x.version > VERSAO_MAXIMA) continue;
  const grupo = grupos[GRUPOS.findIndex((g) => g.de.includes(x.group))];
  if (!grupo) continue;
  const item = { e: x.emoji, n: x.label, p: (x.tags ?? []).filter((p) => p !== x.label) };
  const tons = tonsDe(x);
  if (tons) item.t = tons;
  grupo.emojis.push(item);
}

const linhas = grupos.map((g) => {
  const emojis = g.emojis.map((x) => `      ${JSON.stringify(x)},`).join("\n");
  return `  {\n    id: ${JSON.stringify(g.id)},\n    nome: ${JSON.stringify(g.nome)},\n    emojis: [\n${emojis}\n    ],\n  },`;
});

const conteudo = `/* =================================================================
   Crônicas Eternas: Chat (a lista de emojis)
   -----------------------------------------------------------------
   Só dados. Gerado por planejamento/ferramentas/gerar-emojis.mjs;
   não mude à mão. Fonte: emojibase-data ${versaoDosDados} (pt/data.json,
   com os nomes e as palavras do Unicode CLDR), até o Emoji
   ${VERSAO_MAXIMA}.0. Licenças em LICENCA-emojis.txt.
   Cada emoji: e (o emoji), n (o nome), p (as palavras para a busca)
   e, se tiver, t (os cinco tons de pele, do 1 ao 5).
   ================================================================= */

const EMOJIS = [
${linhas.join("\n")}
];
`;

writeFileSync(destino, conteudo);
const total = grupos.reduce((s, g) => s + g.emojis.length, 0);
const comTons = grupos.reduce((s, g) => s + g.emojis.filter((x) => x.t).length, 0);
console.log(`${destino}: ${total} emojis em ${grupos.length} grupos (${comTons} com os cinco tons).`);

// A conferência: todo emoji do seletor (e cada tom) tem que passar no REGEX_EMOJI do
// servidor (copiado de portal/servidor/chat.js), para poder ser uma reação.
const PICTOGRAMA = "\\p{Extended_Pictographic}\\uFE0F?\\p{Emoji_Modifier}?";
const REGEX_EMOJI = new RegExp(
  `^(?:[0-9#*]\\uFE0F?\\u20E3|\\p{Regional_Indicator}{2}|\\u{1F3F4}[\\u{E0020}-\\u{E007E}]+\\u{E007F}|${PICTOGRAMA}(?:\\u200D${PICTOGRAMA})*)$`,
  "u",
);
const falharam = grupos.flatMap((g) => g.emojis.flatMap((x) => [x.e, ...(x.t ?? [])])).filter((e) => !REGEX_EMOJI.test(e));
console.log(`Conferência com o REGEX_EMOJI do servidor: ${falharam.length} falharam.`);
if (falharam.length) {
  console.log(falharam.join(" "));
  process.exitCode = 1;
}
