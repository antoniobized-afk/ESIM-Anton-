CREATE INDEX "marketing_touches_occurredAt_campaignId_idx"
ON "marketing_touches"("occurredAt", "campaignId");

CREATE INDEX "orders_userId_completedAt_id_idx"
ON "orders"("userId", "completedAt", "id")
WHERE "status" = 'COMPLETED' AND "parentOrderId" IS NULL;
