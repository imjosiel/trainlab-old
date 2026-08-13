# Fatia 11 — `UserRole` com vocabulário genérico

**Estado:** feito e verificado. Não commitado.

## Por que agora

Josiel descreveu a estratégia de produto: este núcleo — agenda, mensagens,
notificações, relação profissional↔cliente, comercial, billing — será **forkado**
para outros verticais (personal trainer, escola de música, psicologia). Cada
vertical vira um repositório independente: copia tudo, remove o módulo de
esportes, constrói o próprio.

Levantei a proporção antes de opinar: dos **41 modelos** do schema, **35 são
núcleo** e **6 são futebol** (`AthleteProfile`, `Sport`, `Team`, `TrainingPlan`,
`TrainingSession`, `Exercise`). O produto já é, em grande parte, uma plataforma
genérica de "profissional atende cliente" com uma casca fina de futebol.

Mas o `enum UserRole` carregava o vocabulário do vertical:

```
enum UserRole { PENDING TRAINER ATHLETE STUDENT PARTNER_B2B AFFILIATE }
```

O fork **copia o enum** para dentro de cada repo. Um repositório de psicologia com
`TRAINER`/`ATHLETE` é confusão permanente. E renomear depois de três forks são
três migrações, em bancos com dados reais, em vez de uma agora, num banco vazio e
antes do primeiro commit. É a janela mais barata que vai existir.

## A pergunta que veio antes: por que não `String[]`?

Josiel perguntou por que o campo precisa de enum em vez de array de strings — o
que tornaria o fork livre para escolher o próprio vocabulário sem migração.

Medi o que o enum entrega hoje:

- **Proteção de tipo: já furada.** Existem **12 casts** `as import('@prisma/client').UserRole`
  em 7 arquivos, e estão em **todo** escritor de papéis. Onde escreve, o tipo é
  afirmado por força, não checado. Some a isso **141 arquivos `.js/.jsx` contra
  115 `.ts/.tsx`**: na maioria da base o TypeScript nem alcança.
- **Validação no banco: funcionando.** É a única barreira que resta, e ela é real.

E não é hipotético: nesta mesma sessão escrevi um teste asseverando sobre a
string `'PARTNER'`, que **não existe** — o valor é `'PARTNER_B2B'`. Com `String[]`
aquilo entraria no banco e o teste "passaria" sem exercitar nada.

**Conclusão:** trocar por `String[]` removeria a única proteção que ainda
funciona. O problema nunca foi enum contra string — era que os **nomes**
carregavam o vertical. Nomes genéricos resolvem o fork **e** mantêm a validação.

## D58 — rename 1:1, sem fundir conceitos

```
TRAINER → PROFESSIONAL    ATHLETE → INDIVIDUAL    STUDENT → CLIENT
```

Considerei colapsar `ATHLETE` e `STUDENT` num único `CLIENT` — vocabulário mais
limpo, dois conceitos em vez de três. **Rejeitado**: a distinção é real (um usa a
plataforma sozinho, o outro é atendido por um profissional) e colapsar exigiria
rederivar essa diferença do vínculo `TrainerAthlete` em cada lugar que hoje a
consulta. Seria mudança semântica disfarçada de rename, com risco em troca de
estética.

`PENDING`, `PARTNER_B2B` e `AFFILIATE` já eram genéricos e ficaram.

## D59 — escopo: valores de papel, não nomes de modelo

Os modelos `TrainerAthlete`, `AthleteProfile`, `Student` e os campos `trainerId`,
`athleteId`, `studentId` **não foram tocados**. Renomear tabela e coluna é
migração de outra ordem de grandeza, e a decisão de fazê-lo é separada.

Isso deixa uma inconsistência assumida: o enum fala genérico, os modelos falam
futebol. Registrada de propósito, não esquecida.

## Verificação

**Antes de substituir**, três checagens que evitaram estrago:

1. **Nenhum outro enum colide.** `PlanSegment` tem `ATHLETE_INDEPENDENT`, mas
   `\bATHLETE\b` não casa ali dentro (`_` é caractere de palavra). Confirmado
   empiricamente, não por raciocínio.
2. **Nomes de modelo não casam.** `TrainerAthlete` é *MixedCase*; o padrão é
   maiúsculo com limite de palavra.
3. **Colunas de texto que guardam papel.** Varri o banco: só `SaaSTier.targetRole`
   é `String` com valor de papel. **Renomear o enum não a alcança** — a migração
   precisa de `UPDATE` explícito, ou um banco com tiers cadastrados manteria
   `'TRAINER'` num campo comparado contra `'PROFESSIONAL'`, falhando em silêncio.

**Alcance:** 559 ocorrências em 133 arquivos de fonte + 164 em 26 docs de
referência.

**Migração** escrita à mão, com `ALTER TYPE ... RENAME VALUE`. O diff automático
do Prisma para "valor de enum renomeado" é DROP + CREATE, que **descarta os
dados**. Aplicada e conferida:

```
antes:  PENDING, TRAINER, ATHLETE, STUDENT, PARTNER_B2B, AFFILIATE
depois: PENDING, PROFESSIONAL, INDIVIDUAL, CLIENT, PARTNER_B2B, AFFILIATE
```

**Suítes:** 237 Jest + 65 Vitest (web), 208 unit + 151 e2e (backend) = **661**.
`tsc` limpo nos dois apps.

## A47 — o `dist` desatualizado do pacote compartilhado

Depois do rename, **5 testes do backend falharam** apontando para `resolverPapeis`.
A regra estava certa: o `packages/papeis` publica `dist/index.js` (decisão do D55),
e eu editei o `src/` **sem recompilar**. Os dois apps liam os valores antigos.

É um custo direto do D55 que eu não tinha antecipado: fonte compartilhada com
artefato compilado significa que **editar o pacote sem rebuildar produz falha que
aponta para o lugar errado** — o teste acusa a regra, a causa é o build.

**Corrigido estruturalmente**, não por disciplina: `build:packages` no root e um
`pre*` em todos os 8 alvos que consomem o pacote (`dev`, `build`, `test`,
`typecheck` dos dois apps).

Verificado de verdade: corrompi `dist/index.js` de propósito, rodei
`npm run test:backend`, e ele reconstruiu sozinho — 208 passando.

## Fica pendente

- **`PlanSegment`** tem `COACH` e `ATHLETE_INDEPENDENT` — mesmo problema de
  vocabulário, outro enum, outra migração.
- **Nomes de modelo** (`AthleteProfile`, `TrainerAthlete`, `Student`) e seus
  campos — D59.
- ~~**`apps/web/temp_route.js`**~~: era 25 KB em UTF-16 na raiz do app, cópia da
  rota de training-plans, datada da importação original — não servido pelo Next e
  sem importadores. Foi o arquivo que interrompeu a substituição por não ser
  UTF-8. **Apagado** na limpeza que antecedeu o primeiro commit.
