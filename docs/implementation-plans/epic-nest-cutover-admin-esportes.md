# Cutover: administração de esportes para Nest via BFF

## Contrato preservado

As duas telas administrativas deixam de chamar `/api/admin/sports` e passam a
usar `/api/backend/admin/sports`:

| Operação | Caminho no BFF | Resultado preservado |
|---|---|---|
| Listar | `GET /admin/sports` | ativos e inativos, com `_count.profiles` |
| Criar | `POST /admin/sports` | cria ativo; valida nome e slug |
| Sincronizar | `POST /admin/sports` com `action: "syncDefaults"` | reimporta padrões idempotentemente |
| Editar | `PATCH /admin/sports/:id` | atualiza campos enviados e bloqueia desativação vinculada |
| Excluir | `DELETE /admin/sports/:id` | bloqueia quando há atletas vinculados |

O endpoint continua protegido. O BFF encaminha o token NextAuth; o Nest define
401 para ausência de sessão e 403 para usuário sem papel administrativo.
`ADMIN` e `MODERATOR` conservam o acesso que já tinham no legado.

## Consumidores

1. `app/(admin)/admin/sports/page.jsx`: listar e criar.
2. `app/[locale]/admin/sports/page.js`: listar, criar, sincronizar, editar e
   excluir.

## Critério de remoção

1. As sete chamadas das duas telas usam o BFF.
2. A suíte e2e do Nest cobre todas as cinco operações e as permissões.
3. Não há referência ao endereço legado; as duas rotas Next antigas podem ser
   removidas.
