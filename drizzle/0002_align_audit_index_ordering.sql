DROP INDEX "audit_log_entity_idx";--> statement-breakpoint
DROP INDEX "audit_log_created_at_idx";--> statement-breakpoint
CREATE INDEX "audit_log_entity_idx" ON "audit_log" USING btree ("entity_id","created_at" DESC);--> statement-breakpoint
CREATE INDEX "audit_log_created_at_idx" ON "audit_log" USING btree ("created_at" DESC);