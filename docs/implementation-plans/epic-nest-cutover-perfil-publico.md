# Cutover: perfil público para Nest via BFF

## Contrato

A única consumidora, `app/[locale]/u/[username]/page.js`, passa de
`/api/users/public/:username` para `/api/backend/users/public/:username`.

O BFF já reconhece `users/public` como prefixo público. Assim, a página
continua acessível sem sessão e não encaminha cookie ou token. Uma resposta
válida renderiza o perfil; qualquer resposta não-2xx continua resultando em
404 na tela.

A implementação Nest é a fonte de verdade para o recorte seguro de campos,
para o 404 indistinguível de perfil privado/inexistente e para a busca sem
distinguir maiúsculas de minúsculas.

## Critério para remover o legado

1. O teste do BFF prova o encaminhamento público para Nest.
2. A página aponta somente para o BFF; nenhuma tela usa a rota legada.
3. As suítes do proxy e do perfil público Nest estão verdes.
4. Só então são removidos a rota legada e seu teste unitário.
