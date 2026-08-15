-- A78/D78 — impede assinatura duplicada (mesmo aluno + mesmo parceiro) no BANCO,
-- não em código.
--
-- O legado fazia check-then-act: `findFirst` por assinatura ativa, e só então
-- `create`. Sem trava no banco, dois cliques simultâneos passam os dois pela
-- consulta antes de qualquer um escrever. Medido contra Postgres real com três
-- conexões concorrentes: TRÊS assinaturas criadas para o mesmo par
-- aluno/treinador. O comentário do próprio legado ("BUG 48 fix: Date.now() pode
-- colidir — usar UUID") mostra que a corrida era conhecida; a correção trocou o
-- id para não colidir, o que tornou a duplicata SILENCIOSA em vez de impedi-la.
--
-- O banco só pode vigiar colunas que enxerga na MESMA linha. `partnerId` só
-- existia via `offer.partnerId`, então a regra não tinha onde morar. Por isso a
-- coluna é denormalizada aqui: é seguro porque `PartnerOffer.partnerId` é escrito
-- só na criação da oferta (nenhuma rota do produto move oferta entre parceiros),
-- então a cópia não tem como desatualizar.
--
-- O banco de desenvolvimento tinha ZERO `PartnerSubscription` no momento desta
-- migration — não há duplicata para limpar. Em qualquer outro ambiente, rodar
-- a consulta de diagnóstico abaixo ANTES de aplicar:
--
--   SELECT "userId", partner."id" AS "partnerId", count(*)
--   FROM "PartnerSubscription" sub
--   JOIN "PartnerOffer" offer ON offer.id = sub."offerId"
--   JOIN "PartnerAccount" partner ON partner.id = offer."partnerId"
--   WHERE sub."userId" IS NOT NULL
--     AND sub.status IN ('active', 'canceling', 'trialing', 'past_due')
--   GROUP BY 1, 2
--   HAVING count(*) > 1;

ALTER TABLE "PartnerSubscription" ADD COLUMN "partnerId" TEXT;

-- Backfill: para toda linha existente, copia o dono da oferta.
UPDATE "PartnerSubscription" sub
SET "partnerId" = offer."partnerId"
FROM "PartnerOffer" offer
WHERE offer.id = sub."offerId";

ALTER TABLE "PartnerSubscription"
  ADD CONSTRAINT "PartnerSubscription_partnerId_fkey"
  FOREIGN KEY ("partnerId") REFERENCES "PartnerAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "PartnerSubscription_partnerId_idx" ON "PartnerSubscription"("partnerId");

-- A TRAVA. Parcial de propósito: um aluno pode assinar, cancelar, e assinar de
-- novo com o mesmo parceiro depois — só não pode ter DUAS linhas ativas ao
-- mesmo tempo. Sem o WHERE, o histórico cancelado bloquearia a reassinatura
-- legítima.
CREATE UNIQUE INDEX "PartnerSubscription_userId_partnerId_active_key"
  ON "PartnerSubscription" ("userId", "partnerId")
  WHERE "userId" IS NOT NULL
    AND "partnerId" IS NOT NULL
    AND status IN ('active', 'canceling', 'trialing', 'past_due');
