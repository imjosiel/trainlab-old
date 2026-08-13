# Epic: Backend NestJS — Fatia 1: a ponte de autenticação

Primeira fatia da separação frontend/backend. O objetivo desta fatia **não** é migrar nenhuma regra de negócio — é construir e provar o **caminho** por onde toda regra vai passar depois: uma requisição autenticada saindo do frontend, atravessando o BFF, e chegando ao Nest com a identidade do usuário íntegra.

Nada de domínio migra aqui. Se esta fatia estiver certa, todas as próximas são mecânicas.

---

## Por que Nest, e por que a auth primeiro

O monólito atual tem **119 rotas em `app/api/`**, e cada uma reimplementa a própria checagem de sessão chamando `getSessionOrToken(req)` e testando o retorno. Funciona — mas nada **estrutural** impede uma rota nova de nascer sem essa checagem. A garantia é disciplina humana, não compilador.

A evidência de que a disciplina não se sustenta está no próprio código: a mensagem de 401 divergiu em quatro variantes ao longo das rotas.

> [!NOTE]
> **Contagem corrigida na fatia 3.** A versão original desta seção listava 4 variantes: o grep que a produziu procurou só por "autoriz" e por isso não viu as mensagens em inglês — que são a **maioria**. A tabela abaixo é a medição completa sobre as 120 rotas.

| Variante | Ocorrências |
|---|---|
| `'Unauthorized'` | **84** |
| `'Não autorizado'` | 24 |
| `'Não autorizado.'` | 13 |
| `'Acesso negado.'` | 9 |
| `'Acesso negado'` | 7 |
| `'Sem permissão'` | 6 |
| `'Não autorizado. Apenas administradores.'` | 4 |
| `'Acesso restrito a administradores.'` | 3 |
| `'Sem permissão para acessar este exercício.'` | 2 |
| `'Nao autorizado'` (sem acento) | 2 |
| `'Acesso Negado'` (capitalização própria) | 2 |

**Onze variantes em 120 rotas, e a dominante está em outro idioma que o resto do produto.** Se a *mensagem* divergiu tanto sem ninguém notar, a *presença* da checagem pode divergir do mesmo jeito — e uma rota sem checagem não produz nenhum sintoma visível até ser explorada.

**E a divergência não é só cosmética.** A mensagem de admin aparece com **os dois status codes**: 5× como `401` e 4× como `403`. A mesma condição — "está logado, mas não é admin" — responde coisas diferentes dependendo da rota. Um cliente não consegue distinguir "faça login" de "você não tem permissão", e portanto não consegue decidir se vale tentar de novo. Verificado que nenhum código de frontend compara essas strings (só exibe `data.error`), então a divergência nunca produziu sintoma — o que é exatamente o problema: erra em silêncio.

**O que o Nest muda:** `APP_GUARD` é um guard registrado no nível do módulo raiz. Ele roda **antes de todo handler**, incluindo os que ainda não foram escritos. Rota nova nasce protegida por construção; expor uma exige o decorator explícito `@Public()`, que é visível em code review e greppável. A garantia sai da convenção e vira framework.

---

## Decisões

### D1 — O backend decodifica o mesmo token que o NextAuth emite; não existe segundo sistema de auth

O NextAuth v4 com `strategy: 'jwt'` não emite um JWT assinado comum — emite um **JWE (token criptografado)** derivado do `NEXTAUTH_SECRET`. Não é verificável com `jsonwebtoken.verify()`.

Portanto `apps/backend` declara `next-auth` como dependência e usa `decode()` de `next-auth/jwt`. **Isso é deliberado, não preguiça:** a alternativa (o backend emitir o próprio token) criaria dois emissores de identidade, duas expirações e dois pontos de revogação para a mesma sessão. O frontend continua o único emissor; o backend é só consumidor.

Consequência aceita: `apps/backend` carrega `next-auth` (e o `next` que ele traz como peer dependency) sem ser um app Next. É o preço de ter um só emissor.

### D2 — O guard é global e default-deny; `@Public()` é a única saída

`NextAuthJwtGuard` registrado via `APP_GUARD` no `AppModule`. Sem token válido → 401, sem o handler ser alcançado.

`@Public()` marca as exceções via metadata lido por `Reflector`. Rota pública é uma declaração afirmativa no código, não a ausência de uma checagem.

### D3 — O payload injetado no request é o mesmo `SessionPayload` do legado

Contrato copiado campo a campo de `lib/auth-helpers.ts`, para que a migração de cada rota depois seja tradução de sintaxe, não de semântica:

```ts
interface SessionPayload {
  id: string
  name?: string | null
  email?: string | null
  image?: string | null
  roles: string[]              // fallback: ['PENDING']
  systemRoles: string[]        // fallback: ['USER']
  isAdmin: boolean             // derivado de ADMIN_SYSTEM_ROLES
  subscriptionStatus: string | null
  subscriptionPlan: string | null
  stripeCustomerId: string | null
}
```

**`isAdmin` é derivado no servidor, nunca lido do token como booleano.** O legado já faz isso (`ADMIN_SYSTEM_ROLES.some(...)` sobre `systemRoles`) e a propriedade precisa sobreviver: se `isAdmin` fosse um campo transportado, bastaria um caminho onde o cliente influencia o token para virar admin. Derivar de `systemRoles` mantém uma única fonte.

Os fallbacks (`['PENDING']`, `['USER']`) são fidelidade ao legado, **não** cortesia: um token sem roles não deve virar um usuário sem restrições.

### D4 — O guard NÃO consulta o banco

O legado já resolve a atualidade dos dados no callback `jwt` do NextAuth, que re-verifica no banco a cada 15 minutos (`dbCheckedAt`) e invalida a sessão se o usuário deixou de existir. Reconsultar no guard adicionaria uma query a **toda** requisição para reimplementar uma garantia que já existe do lado do emissor.

Consequência aceita e herdada do legado: uma mudança de role leva até 15 minutos para refletir. Rotas onde isso importa devem ler do banco explicitamente — e o legado já tem esse precedente (o reset de créditos lê os roles do banco, não do token).

### D5 — Exceptions devolvem `{ error }`, não o corpo padrão do Nest

`new UnauthorizedException('msg')` serializa como `{ statusCode, message, error: 'Unauthorized' }`. O frontend inteiro lê `data.error`. Sem cuidado, todo toast mostraria "Unauthorized" em vez da mensagem real.

Nest usa objeto passado como corpo **verbatim**, então: `new UnauthorizedException({ error: 'Não autorizado' })`.

**Isso vale para toda rota migrada depois desta fatia**, não só para o guard — é o tipo de detalhe que só aparece quando um usuário real vê um toast errado, e por isso fica travado por teste que afirma `getResponse()`, não só `instanceof`.

### D5b — 401 e 403 são de guards diferentes; a mensagem de admin não é achatada na genérica

As variantes do legado se separam em duas famílias, e a divisão é por **pergunta respondida**, não por texto:

- **"não tem sessão" → 401 `'Não autorizado'`**, emitido só pelo guard de auth. Absorve `'Unauthorized'` (84), `'Não autorizado'` (24), `'Não autorizado.'` (13), `'Nao autorizado'` (2).
- **"tem sessão, falta privilégio" → 403 `'Acesso negado'`**, emitido só pelo guard de roles. Absorve `'Acesso negado.'` (9), `'Acesso negado'` (7), `'Acesso Negado'` (2), `'Sem permissão'` (6), e as de admin (`'Não autorizado. Apenas administradores.'`, `'Acesso restrito a administradores.'`).

O ganho de unificar a primeira família é grande e óbvio (84 rotas devolvendo inglês num produto em português). O que **não** se faz é achatar as duas famílias numa — cada uma responde coisa diferente, e é a fusão delas que produziu a inconsistência de status code medida abaixo.

Isso resolve estruturalmente a inconsistência de status code registrada acima: **o guard de auth é o único dono do 401 e o de roles é o único dono do 403**. Nenhuma rota decide isso por conta própria, então nenhuma rota pode decidir diferente da vizinha.

O guard de roles **não é construído nesta fatia** — nenhuma rota de negócio existe ainda para protegê-lo. Fica registrado aqui porque é a decisão que impede o erro de, na primeira rota de admin migrada, alguém emitir 401 de dentro do handler e reintroduzir a divergência.

**Não corrigir as variantes nas rotas legadas.** Elas são substituídas rota por rota; editar 38 arquivos à mão é trabalho descartado junto com a rota, e não há consumidor da string que justifique o risco.

### D6 — O BFF encaminha o token bruto, não a sessão desserializada

`getToken({ req, secret, raw: true })` devolve a string criptografada do cookie, repassada como `Authorization: Bearer <token>`. O BFF **não** interpreta o conteúdo.

Se o BFF desserializasse a sessão e remontasse um payload para o backend, ele se tornaria um segundo lugar onde a identidade é construída — e discordâncias entre os dois seriam invisíveis. Repassando o token cru, o backend é o único que o interpreta.

O BFF também não é ponto de autorização: repassa e devolve. Autorização mora no backend, junto da regra que ela protege.

### D7 — O BFF não presume que a resposta é JSON

`res.json()` incondicional corrompe qualquer corpo binário. O projeto já tem rota que devolve PDF (`/exercises/:id/pdf`) e o R2 serve vídeo. O proxy checa `Content-Type` e repassa bytes crus com os headers preservados quando não é JSON.

### D8 — Swagger gerado dos decoradores, substituindo um YAML escrito à mão que já divergiu

`@nestjs/swagger` em `/docs`, com `addBearerAuth()` para que o "Authorize" do Swagger UI aceite o mesmo token que o BFF envia — assim a doc é exercitável com uma sessão real, não só legível.

Isso não é preferência de ferramenta. O estado atual da doc no monólito, verificado:

- **`GET /api/docs` está quebrado hoje.** `app/api/docs/route.ts` faz `import yaml from 'js-yaml'`, e **`js-yaml` não está declarado em `package.json`** — a rota falha com module-not-found. O endpoint de documentação não responde.
- **`public/openapi.yaml` é mantido à mão** (88 KB) e declara **30 paths para as 119 rotas existentes**. Cobre cerca de um quarto da superfície.
- A mesma rota devolve **401** para uma falha de permissão de admin (`'Acesso restrito a administradores.'`) — mais uma instância exata da confusão 401/403 do D5b.

Doc escrita à mão em arquivo separado divergo do código porque nada a obriga a acompanhar: uma rota nova não quebra o YAML, só fica ausente dele. Gerada de decoradores, a doc não pode divergir — ela é derivada da mesma declaração que serve a rota. As 30 paths de cobertura são a medida de quanto a disciplina manual entregou.

`public/openapi.yaml` e `app/api/docs/route.ts` **não são apagados nesta fatia** (nada legado é), mas ficam marcados para sair no contract, quando o Swagger gerado cobrir o mesmo recurso.

---

## Propriedades a provar por teste

Cada uma corresponde a um teste; a numeração é referenciada nos nomes dos testes.

**Do guard:**
1. Requisição sem header `Authorization` → 401.
2. Header malformado (sem `Bearer `, ou vazio) → 401.
3. Token que não decodifica com o secret → 401.
4. Token que decodifica mas **sem `id`** → 401. *(um token válido em forma mas sem sujeito não é uma identidade)*
5. Token válido → handler alcançado, `request.user` populado.
6. Rota `@Public()` sem token → alcançada, e `request.user` fica indefinido em vez de um objeto falso.
7. Rota `@Public()` **com** token válido → `request.user` populado. *(público significa "não exige", não "ignora")*

**Do payload (D3):**
8. `isAdmin: true` quando `systemRoles` contém um role de admin.
9. `isAdmin: false` quando não contém — **inclusive se o token trouxer `isAdmin: true` explícito**, provando que o campo é derivado e não transportado.
10. Token sem `roles` → `['PENDING']`; sem `systemRoles` → `['USER']`.

**Do contrato de erro (D5):**
11. O corpo do 401 é `{ error: 'Não autorizado' }` — afirmado pelo corpo da resposta, não por `instanceof`.

**Do BFF (D6/D7):**
12. Sessão presente → o backend recebe `Authorization: Bearer <token bruto>`.
13. Sem sessão em rota não-pública → 401 sem chegar ao backend.
14. Sem sessão em rota pública → repassada.
15. Método, corpo JSON, query params e params de rota chegam ao backend intactos.
16. Erro do Nest (400/404) é repassado com o corpo nativo intacto, não reembalado.
17. Resposta não-JSON volta como bytes, com `Content-Type` preservado.

---

### D9 — `GET /me` existe para tornar a ponte observável

Decidido **durante a verificação**, não antes. Com `/health` sendo a única rota e ela sendo `@Public()`, a afirmação central da fatia — "uma requisição autenticada chega ao Nest com a identidade íntegra" — não era observável num sistema rodando, só em teste. Não havia rota que exigisse sessão para se poder ver o guard aceitar ou recusar.

`GET /me` devolve o próprio `SessionPayload` que o guard montou. Um 200 com o `id` correto prova a cadeia inteira de uma vez, e é o endpoint que toda fatia seguinte ia querer de qualquer forma.

---

## Verificação

Além das suítes:

- `npx nest build` e `npx next build` conferindo **exit code de verdade** — pipe para `tail` mascara o exit code, e há uma classe de erro (enum do Prisma tratado como string) que só aparece no build, nunca nos testes com mock.
- Caminho autenticado real ponta a ponta: token cunhado com `encode()` de `next-auth/jwt` (mesma técnica que o NextAuth usa), enviado ao BFF, atravessando até o Nest. Prova a cadeia sem depender de login OAuth do Google, que não é automatizável neste ambiente.

### O que a execução ao vivo pegou e os testes não

**O Nest não carrega `.env` por conta própria.** Os dois processos subiram, os testes estavam todos verdes, e ainda assim toda requisição autenticada voltava 401 — o processo do backend estava sem `NEXTAUTH_SECRET`, então o guard caía no ramo fail-closed. Os testes não pegaram porque cada um seta `process.env.NEXTAUTH_SECRET` no `beforeEach`/`beforeAll`; o ambiente de teste sempre teve o segredo que o de execução não tinha.

Resolvido com `ConfigModule.forRoot({ isGlobal: true })`, que popula `process.env` — de onde o guard já lia.

**Isso é a evidência mais forte a favor do fail-closed.** O ramo `if (!secret) return null` parecia defensivo demais quando escrevi o teste. Foi ele que transformou uma falha de configuração em negação limpa: escrito como fail-open, o backend teria passado a aceitar token que não conseguia verificar, e nada no comportamento observável denunciaria.

**Lição de método**: teste verde não prova que o serviço funciona, porque o teste constrói o ambiente que o serviço precisa encontrar pronto. Toda fatia precisa de uma execução real dos dois processos, não só de suíte verde.

### Provado ao vivo (dois processos, token real)

| Cenário | Resultado |
|---|---|
| `/me` via BFF sem sessão | 401 `{error}` — portão do BFF, sem chegar ao Nest |
| `/me` direto no Nest sem token | 401 `{error}` — guard global |
| `/me` direto no Nest com token corrompido | 401 `{error}` |
| `/me` via BFF com cookie de sessão real | 200 com o `SessionPayload` completo |
| Token declarando `isAdmin: true` com `systemRoles: ['USER']` | 200 com **`isAdmin: false`** |
| `/docs` | Swagger UI servindo, com Authorize em Bearer |

A última linha é a propriedade 9 valendo no sistema rodando, não só em teste.

### Limites honestos

- **Login OAuth real do Google não é exercitável por automação aqui.** O que a verificação prova é que um token legítimo atravessa a cadeia; que o *navegador* obtém esse token continua sendo responsabilidade do NextAuth, inalterada por esta fatia.
- **O banco não estava de pé** durante a verificação (`docker compose up` não foi rodado). Não afeta esta fatia — pelo D4 nada no caminho de auth lê do banco, e isso ficou visível: as rotas legadas que tocam Prisma erraram 500 enquanto `/api/backend/me` respondeu 200.
- **Rota inexistente no Nest devolve o corpo padrão do Nest** (`{message, error, statusCode}`), não o contrato `{error}`, porque o router 404 antes dos guards. Via BFF o portão cobre isso; direto na porta do Nest, não. Vale um filtro de exceção global quando o backend passar a ser exposto além do BFF.

---

## Fora do escopo desta fatia

Declarado para não haver dúvida depois:

- **Nenhuma regra de negócio migra.** As rotas do Nest são `/health` (`@Public()`) e `/me` (protegida, ver D9) — as duas sobre a própria ponte, nenhuma sobre domínio.
- **Nenhuma rota legada é apagada.** As 119 continuam servindo intactas. O contract vem depois, rota por rota, só quando a substituta estiver provada.
- **`apps/backend` não recebe Prisma nesta fatia.** Pelo D4 o guard não consulta o banco, e `/health` não lê nada — um cliente Prisma aqui seria maquinário com zero consumidores. Entra na primeira fatia que tiver uma rota que leia dados, junto do isolamento de `output` que ela vai exigir.
- **O schema não muda.**
- **O guard de roles (403) não é construído** — ver D5b.
- **O frontend não é religado.** Nenhuma tela passa a chamar `/api/backend/*` nesta fatia — cortar tela é decisão por recurso, tomada quando o recurso inteiro estiver migrado.
