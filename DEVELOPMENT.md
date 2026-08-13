# Padrão de Desenvolvimento — Player.Action

Todo novo desenvolvimento **DEVE** seguir o ciclo **SDD → TDD → Implementação → Swagger**, nesta ordem.

---

## 1. SDD — Security-Driven Development

Antes de escrever qualquer código, analise a feature sob a ótica de segurança:

### Checklist obrigatório:
- [ ] **Threat Model**: Identificar vetores de ataque (STRIDE: Spoofing, Tampering, Repudiation, Info Disclosure, DoS, Elevation)
- [ ] **Input Validation**: Definir schemas de validação para todos os inputs (query params, body, headers)
- [ ] **Rate Limiting**: Definir limites por rota (usar `lib/rate-limit.ts` para in-memory ou `lib/ratelimit.ts` para Redis)
- [ ] **Auth & Authz**: Definir quem pode acessar (roles, systemRoles) e documentar no issue
- [ ] **Data Exposure**: Garantir que a API não vaza dados sensíveis (select explícito no Prisma, nunca `select: *`)
- [ ] **Audit Trail**: Movimentações financeiras devem ter log imutável

### No issue do GitHub:
Incluir seção `## Segurança` com o threat model simplificado e controles planejados.

---

## 2. TDD — Test-Driven Development

Escreva os testes **ANTES** da implementação:

### Padrão:
1. **Red**: Escrever testes que falham (descrevem o comportamento esperado)
2. **Green**: Implementar o mínimo para os testes passarem
3. **Refactor**: Limpar o código mantendo os testes verdes

### Estrutura de testes:
```
__tests__/
├── api/                    # Testes de API routes
│   └── [module]/
│       └── [route].test.ts
├── lib/                    # Testes de helpers/utils
│   └── [file].test.ts
└── helpers/                # Mocks e factories
    ├── prisma-mock.ts
    ├── stripe-mock.ts
    └── auth-mock.ts
```

### Regras:
- Framework: **Vitest** (`npm test`)
- Cobertura mínima: **70%** por módulo
- Nomes de testes em **português**
- Mocks devem refletir a estrutura real do código

### No issue do GitHub:
Incluir seção `## Testes` listando os cenários a testar (happy path, edge cases, erros).

---

## 3. Implementação

Após SDD e TDD, implementar a feature:

### Regras de código:
- API routes em **TypeScript** (`.ts`)
- Componentes em **JavaScript** (`.js` / `.jsx`)
- Prisma queries com **select explícito** (nunca retornar modelo inteiro)
- Erros devem retornar formato padrão: `{ error: string }`
- Respostas de sucesso devem ser tipadas e consistentes

### Commits:
```
feat(módulo): descrição curta
fix(módulo): descrição curta
docs(módulo): descrição curta
test(módulo): descrição curta
sec(módulo): descrição curta
```

---

## 4. Swagger — Documentação OpenAPI

Todo endpoint novo **DEVE** ser documentado no `public/openapi.yaml`:

### Obrigatório:
- [ ] Path com método, summary e description (em português)
- [ ] Request body schema (se aplicável)
- [ ] Response schemas para todos os status codes (200, 400, 401, 403, 404, 429, 500)
- [ ] Schemas reutilizáveis em `components.schemas`
- [ ] Tag apropriada (Admin, Afiliados, Público, etc.)

### Verificação:
- Acessar `/{locale}/docs` como admin para visualizar
- Spec deve ser válida no [Swagger Editor](https://editor.swagger.io/)

---

## Template de Issue

Toda issue de feature/fix deve seguir este template:

```markdown
## Contexto
[Descrição do problema ou feature]

## Segurança (SDD)
- Threat model: [vetores de ataque identificados]
- Auth: [quem pode acessar]
- Rate limit: [limites definidos]
- Validação: [schemas de input]

## Testes (TDD)
### Cenários a testar:
- [ ] [cenário happy path]
- [ ] [cenário de erro]
- [ ] [cenário edge case]

## Implementação
### Arquivos:
- [ ] [NOVO/MODIFICAR] `path/to/file` — descrição
- [ ] [NOVO/MODIFICAR] `path/to/file` — descrição

## Documentação (Swagger)
- [ ] Endpoint documentado em `public/openapi.yaml`
- [ ] Schemas adicionados/atualizados
- [ ] Verificado em `/{locale}/docs`

## Critérios de aceite
- [ ] Testes passando
- [ ] Sem findings de segurança
- [ ] Documentação atualizada
- [ ] Code review aprovado
```
