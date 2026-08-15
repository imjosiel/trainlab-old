-- D75 — `ProcessedWebhookEvent` deixa de ser recibo e passa a ser RESERVA.
--
-- O legado consultava a tabela antes de processar e gravava depois: check-then-act.
-- Duas entregas simultâneas do mesmo `event.id` — que o Stripe faz por desenho,
-- porque ele reentrega até receber 2xx — passavam as duas pela consulta e rodavam
-- o handler DUAS vezes antes de a segunda levar violação de chave (A74).
--
-- Com a reserva vindo primeiro, a chave primária vira trava.
--
-- `claimedAt` existe para o processo que morre no meio: sem ele, uma reserva
-- órfã trancaria o evento para sempre, e o Stripe desiste depois de algumas
-- tentativas — trocaríamos "processa duas vezes" por "não processa nunca", que
-- em pagamento é pior.
--
-- Os dois campos têm DEFAULT porque as linhas já existentes são de eventos que
-- terminaram: elas nascem `concluido` para não serem reprocessadas.

ALTER TABLE "ProcessedWebhookEvent"
  ADD COLUMN "status"    TEXT      NOT NULL DEFAULT 'processando',
  ADD COLUMN "claimedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Linhas anteriores à migration são recibos de eventos JÁ processados.
UPDATE "ProcessedWebhookEvent" SET "status" = 'concluido';

CREATE INDEX "ProcessedWebhookEvent_status_claimedAt_idx"
  ON "ProcessedWebhookEvent" ("status", "claimedAt");
