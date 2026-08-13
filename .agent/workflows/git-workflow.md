---
description: Padrão oficial de branching (Feature e Hotfix) utilizando o GitHub CLI (gh)
---

// turbo-all

## 1. Regra de Ouro (Criação da Issue primeiro)

Toda e qualquer mudança no código COMEÇA criando uma Issue no GitHub vinculada ao repositório para manter o rastreio do que está sendo feito.

```
gh issue create --title "<título curto e claro>" --body "<descrição breve do porquê da mudança>"
```

Tome nota do NÚMERO da issue que o comando retornar (ex: `#12`). O número deverá ser usado no nome da branch.

---

## 2. Fluxo Normal: Desenvolvimento de Features (Padrão)

Use este fluxo para features, melhorias ou correções não urgetes.

1. **A partir da `develop`**, crie uma branch com o número da issue:
```
git checkout develop
git pull origin develop
git checkout -b feat/12-nome-da-feature
```

2. Após trabalhar, comite:
```
git add .
git commit -m "feat: <descrição> (closes #12)"
```

3. Dê push para remoto e merge de volta em `develop`:
```
git checkout develop
git pull origin develop
git merge feat/12-nome-da-feature --no-ff -m "Merge branch feat/12-nome-da-feature into develop"
git push origin develop
```
*A `main` só será atualizada posteriormente, no dia de release, juntando todas as features da `develop`.*

---

## 3. Fluxo Urgente: Hotfix Direto em Produção

Use este fluxo APENAS se houver um bug grave na produção ou uma mudança (como troca de string urgente) que o usuário explicitamente pedir para consertar na hora na `main` sem subir as sujeiras da `develop`.

1. **A partir da `main`**, crie uma branch com o número da issue:
```
git checkout main
git pull origin main
git checkout -b hotfix/12-urgencia-aqui
```

2. Comite a correção:
```
git add .
git commit -m "fix: <descrição da correção> (closes #12)"
```

3. Aplique primeiro na `main` (resolve a produção IMEDIATAMENTE):
```
git checkout main
git pull origin main
git merge hotfix/12-urgencia-aqui --no-ff -m "Merge hotfix/12-urgencia-aqui into main"
git push origin main
```

4. Agora aplique a **MESMA branch na `develop`** para os ambientes não ficarem fora de sincronia:
```
git checkout develop
git pull origin develop
git merge hotfix/12-urgencia-aqui --no-ff -m "Backport hotfix/12-urgencia-aqui into develop"
git push origin develop
```

## Regras Finais de Versionamento

- **NUNCA** faça merge da `develop` para a `main` apenas para passar uma feature específica. Use o Hotfix Flow para passar uma coisa só. Caso contrário você jogará recursos inacabados no ar.
- **Sempre** inclua `(closes #ID)` na mensagem final do commit que resolve o problema, o GitHub fecha a issue automaticamente.
