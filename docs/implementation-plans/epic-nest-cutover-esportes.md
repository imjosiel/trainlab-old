# Cutover: esportes para Nest via BFF

## Contrato preservado

`GET /api/sports` e `GET /api/backend/sports` retornam o mesmo corpo:
`{ sports: Sport[] }`. A lista contém somente esportes ativos, ordenados por
nome, limitada a 50 itens. Quando `positions` está vazio no banco, as posições
padrão do slug são aplicadas.

Os quatro consumidores usam apenas `data.sports || []`; por isso, a migração
não altera seus estados de carregamento ou o tratamento de falha já existente.

## Consumidores

1. Onboarding
2. Edição do próprio perfil
3. Lista/criação de alunos
4. Edição de aluno

## Critério de remoção

1. Os quatro consumidores apontam para `/api/backend/sports`.
2. O BFF permanece público para `sports`, sem exigir sessão.
3. A suíte e2e do Nest prova filtragem, ordenação e posições de fallback.
4. Sem referências ao endpoint legado, a rota `app/api/sports` é removida.
