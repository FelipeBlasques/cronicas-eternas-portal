// Gera portal/publico/chat/emojis.js, a lista de emojis do chat (só dados).
//
// Os pacotes são instalados só para gerar, numa pasta fora de portal/:
//
//   mkdir /tmp/emojis && cd /tmp/emojis && npm init -y
//   npm i unicode-emoji-json cldr-annotations-full cldr-annotations-derived-full
//   node <repositório>/planejamento/ferramentas/gerar-emojis.mjs /tmp/emojis
//
// A lista, os grupos e a ordem vêm do unicode-emoji-json; os nomes e as palavras
// em português (pt), do CLDR: cldr-annotations-full e, para o que falta nele
// (bandeiras e combinações), cldr-annotations-derived-full. Até a versão 15.0 do
// Emoji e sem tons de pele. Ao trocar as versões, acerte LICENCA-emojis.txt.

import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const pastaDosPacotes = path.resolve(process.argv[2] ?? ".");
const exigir = createRequire(path.join(pastaDosPacotes, "package.json"));
const destino = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../portal/publico/chat/emojis.js");

const VERSAO_MAXIMA = 15.0;

const ordem = exigir("unicode-emoji-json/data-ordered-emoji.json");
const dados = exigir("unicode-emoji-json/data-by-emoji.json");
const anotacoes = exigir("cldr-annotations-full/annotations/pt/annotations.json").annotations.annotations;
const derivadas = exigir("cldr-annotations-derived-full/annotationsDerived/pt/annotations.json").annotationsDerived.annotations;
const versoes = {
  unicode: exigir("unicode-emoji-json/package.json").version,
  cldr: exigir("cldr-annotations-full/package.json").version,
  cldrDerivadas: exigir("cldr-annotations-derived-full/package.json").version,
};

const GRUPOS = [
  { id: "pessoas", nome: "Rostos e pessoas", icone: "😀", de: ["Smileys & Emotion", "People & Body"] },
  { id: "natureza", nome: "Animais e natureza", icone: "🐻", de: ["Animals & Nature"] },
  { id: "comida", nome: "Comida e bebida", icone: "🍔", de: ["Food & Drink"] },
  { id: "atividades", nome: "Atividades", icone: "⚽", de: ["Activities"] },
  { id: "viagens", nome: "Viagens e lugares", icone: "🚗", de: ["Travel & Places"] },
  { id: "objetos", nome: "Objetos", icone: "💡", de: ["Objects"] },
  { id: "simbolos", nome: "Símbolos", icone: "💖", de: ["Symbols"] },
  { id: "bandeiras", nome: "Bandeiras", icone: "🏳️", de: ["Flags"] },
];

const semVariacao = (e) => e.replace(/️/g, "");
const anotacaoDe = (e) => anotacoes[e] ?? anotacoes[semVariacao(e)] ?? derivadas[e] ?? derivadas[semVariacao(e)] ?? null;

const grupos = GRUPOS.map((g) => ({ id: g.id, nome: g.nome, icone: g.icone, emojis: [] }));
let semNome = 0;
for (const e of ordem) {
  const info = dados[e];
  if (!info || Number(info.emoji_version) > VERSAO_MAXIMA) continue;
  const grupo = grupos[GRUPOS.findIndex((g) => g.de.includes(info.group))];
  if (!grupo) continue;
  const a = anotacaoDe(e);
  if (!a) semNome++;
  const nome = a?.tts?.[0] ?? info.name;
  const palavras = (a?.default ?? []).filter((p) => p !== nome);
  grupo.emojis.push({ e, n: nome, p: palavras });
}

const linhas = grupos.map((g) => {
  const emojis = g.emojis.map((x) => `    ${JSON.stringify(x)},`).join("\n");
  return `  {\n    id: ${JSON.stringify(g.id)},\n    nome: ${JSON.stringify(g.nome)},\n    icone: ${JSON.stringify(g.icone)},\n    emojis: [\n${emojis.replace(/^ {4}/gm, "      ")}\n    ],\n  },`;
});

const conteudo = `/* =================================================================
   Crônicas Eternas: Chat (a lista de emojis)
   -----------------------------------------------------------------
   Só dados. Gerado por planejamento/ferramentas/gerar-emojis.mjs;
   não mude à mão. Fontes: unicode-emoji-json ${versoes.unicode} e CLDR
   (cldr-annotations-full ${versoes.cldr} e cldr-annotations-derived-full
   ${versoes.cldrDerivadas}). Licenças em LICENCA-emojis.txt.
   Cada emoji: e (o emoji), n (o nome), p (as palavras para a busca).
   ================================================================= */

const EMOJIS = [
${linhas.join("\n")}
];
`;

writeFileSync(destino, conteudo);
const total = grupos.reduce((s, g) => s + g.emojis.length, 0);
console.log(`${destino}: ${total} emojis em ${grupos.length} grupos (${semNome} sem nome em português).`);
