# Ajustes 4: a ficha dos Personagens sem o espaço vazio

Decisão de 06/11/2026. Uma sessão, a 13.1 (veja "Sessão" no fim). Só CSS, no `personagens/personagens.css`. O resto da ficha continua como em `personagens-abas.md`.

## O que acontece hoje

No computador, o diálogo da ficha tem altura fixa: `min(42rem, 100dvh - 2rem)`, 672 px numa tela comum. O retrato tem 16,5rem de largura em 2:3, ou seja, 396 px de altura. Com pouco texto na aba, sobram uns 270 px vazios embaixo do retrato.

## O que muda (só no computador, acima de 760 px)

- **A altura do quadro acompanha a aba aberta.** Ela é a maior entre o retrato e o conteúdo da aba, com o pé ("Copiar link" e "Fechar"). Com pouco texto, o quadro termina junto com o retrato. Com muito, ele cresce até o limite, e só a coluna da direita rola, como hoje.
- **O alto do quadro fica parado.** O quadro fica preso pelo alto, numa altura que deixa centralizado na tela um quadro do tamanho do retrato, e cresce só para baixo. Assim as abas, presas à borda direita, não saem do lugar ao trocar de aba. Era para isso que a altura era fixa.
- **O limite:** o quadro vai até 1rem antes do fim da tela, e no máximo 42rem.
- **Sem retrato:** a altura mínima é 14rem, para as quatro abas não passarem do fim do quadro.
- **No celular (até 760 px), nada muda:** a altura continua fixa e a ficha inteira rola.

### O CSS

Nas regras de hoje de `.dialogo.dialogo--ficha`, `.ficha` e `.ficha__corpo`, troque o que trata da altura por isto. O resto dessas regras fica como está.

```css
.dialogo.dialogo--ficha {
  /* O alto do quadro: centraliza um quadro da altura do retrato (24,75rem mais as bordas) */
  --topo-da-ficha: max(1rem, calc((100dvh - 25rem) / 2));
  height: fit-content;
  max-height: none;
  margin-block: var(--topo-da-ficha) auto;
}

.ficha {
  height: auto;
  min-height: 14rem;
  max-height: min(42rem, calc(100dvh - var(--topo-da-ficha) - 1rem));
}

.ficha__corpo {
  flex: 0 1 auto;
}
```

No bloco do celular (o `@media` de 760 px), acrescente isto para ficar como hoje:

```css
  .dialogo.dialogo--ficha {
    height: min(42rem, calc(100dvh - 2rem));
    max-height: calc(100dvh - 2rem);
    margin: auto;
  }

  .ficha {
    height: 100%;
    min-height: 0;
    max-height: none;
  }
```

O `.ficha__corpo` do celular já tem `flex: 1 0 auto`.

Dois cuidados:

- **Use `height: fit-content`, e não `auto`.** O `<dialog>` aberto é `position: fixed` com `inset-block: 0`. Com `auto`, ele estica até ocupar a tela inteira.
- **O limite fica no `.ficha`, e não no diálogo.** O diálogo deixa passar o que sai da borda (as abas). Com o limite nele, o conteúdo vazaria em vez de rolar. A grade (`grid-template-rows: minmax(0, 1fr)`, que já existe) respeita o `max-height`, e a coluna da direita rola.

Esse CSS foi conferido na prévia, colocado por fora:

- Em 1366 × 768, a Geral da Alisaie (`p2`) fica com 398 px (o retrato e as bordas), e as abas ficam no mesmo lugar nas quatro abas.
- Os Detalhes do NPC `npc-0a1b2c3d` crescem até 570 px e rolam.
- No celular (390 × 844), tudo fica igual a hoje.

## Testar (exceção ao CLAUDE.md)

Meça com o Playwright na prévia, sem tirar prints. Abra `personagens/index.html#personagem-<id>`, carregando a página de novo para cada personagem (mudar só o `#` não abre outra ficha), e espere a ficha abrir. Use os tamanhos 1366 × 768, 1920 × 1000, 1280 × 600 e 390 × 844.

- **Pouco texto, com retrato** (a Alisaie, `p2`): no computador, a altura do `#dialogo-ficha` é a do `.ficha__retrato` mais 2 px, em todas as abas.
- **Aba longa** (os Detalhes do `npc-0a1b2c3d`): o quadro termina 1rem antes do fim da tela, ou antes, se chegar a 42rem. O `.ficha__corpo` rola (`scrollHeight > clientHeight`).
- **Trocar de aba** não muda o `top` do diálogo nem o das `.ficha__abas`.
- **Sem retrato** (o `npc-3d4e5f60`): o fim das `.ficha__abas` fica dentro do quadro, em todas as abas.
- **No celular:** o diálogo tem a mesma altura de antes da mudança, e as medidas da ficha não mudam.

## Sessão

- **13.1 A ficha sem o espaço vazio:** a parte "O que muda" inteira, com as medições de "Testar".
