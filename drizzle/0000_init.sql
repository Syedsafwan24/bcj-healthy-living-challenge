CREATE TABLE "admins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" "citext" NOT NULL,
	"name" text NOT NULL,
	"password_hash" text,
	"totp_secret_enc" "bytea",
	"totp_enrolled_at" timestamp with time zone,
	"recovery_codes" text[] DEFAULT '{}'::text[] NOT NULL,
	"status" text DEFAULT 'invited' NOT NULL,
	"invite_token_hash" text,
	"invite_expires_at" timestamp with time zone,
	"failed_attempts" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"last_login_at" timestamp with time zone,
	"last_login_ip" "inet",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	CONSTRAINT "admins_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"actor_admin_id" uuid,
	"actor_participant_id" uuid,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid,
	"field" text,
	"old_value" text,
	"new_value" text,
	"reason" text,
	"ip" "inet",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "daily_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"participant_id" uuid NOT NULL,
	"entry_date" date NOT NULL,
	"week_no" integer NOT NULL,
	"water_litres" numeric(5, 2),
	"steps" integer,
	"sleep_hours" numeric(4, 2),
	"c3_cook_at_home" boolean,
	"c4_no_sugary" boolean,
	"c5_vegetables" boolean,
	"c6_no_late_food" boolean,
	"c8_mindfulness" boolean,
	"c9_screen_time" boolean,
	"breakfast" boolean,
	"mid_morning" boolean,
	"lunch" boolean,
	"evening_snack" boolean,
	"dinner" boolean,
	"daily_points" integer,
	"max_points" integer,
	"daily_percentage" numeric(9, 4),
	"status" text DEFAULT 'draft' NOT NULL,
	"submitted_at" timestamp with time zone,
	"computed_at" timestamp with time zone,
	CONSTRAINT "daily_entries_participant_date" UNIQUE("participant_id","entry_date"),
	CONSTRAINT "daily_entries_water_non_negative" CHECK ("daily_entries"."water_litres" >= 0),
	CONSTRAINT "daily_entries_steps_non_negative" CHECK ("daily_entries"."steps" >= 0),
	CONSTRAINT "daily_entries_sleep_non_negative" CHECK ("daily_entries"."sleep_hours" >= 0)
);
--> statement-breakpoint
CREATE TABLE "diet_categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"title" text NOT NULL,
	"min_age" integer,
	"max_age" integer,
	"min_weight" numeric(5, 2),
	"max_weight" numeric(5, 2),
	"plan" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "diet_categories_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "final_scores" (
	"participant_id" uuid PRIMARY KEY NOT NULL,
	"final_score" numeric(10, 4) NOT NULL,
	"final_percentage" numeric(6, 3) NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "participant_health" (
	"participant_id" uuid PRIMARY KEY NOT NULL,
	"blood_group" text,
	"blood_pressure" text,
	"diabetes_status" text,
	"blood_sugar" text
);
--> statement-breakpoint
CREATE TABLE "participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"registration_id" text NOT NULL,
	"seq_no" integer DEFAULT nextval('participant_seq') NOT NULL,
	"email" "citext" NOT NULL,
	"full_name" text NOT NULL,
	"display_name" text NOT NULL,
	"mobile" text NOT NULL,
	"age" integer NOT NULL,
	"gender" text NOT NULL,
	"area_of_residence" text NOT NULL,
	"residence_status" text NOT NULL,
	"height_cm" numeric(5, 2),
	"weight_kg" numeric(5, 2) NOT NULL,
	"starting_weight_kg" numeric(5, 2),
	"diet_category_id" integer,
	"status" text DEFAULT 'pending' NOT NULL,
	"registered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"extra" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "participants_registration_id_unique" UNIQUE("registration_id")
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"key" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "rate_limits_key_window_start_pk" PRIMARY KEY("key","window_start")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"participant_id" uuid,
	"admin_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"idle_expires_at" timestamp with time zone,
	"ip" "inet",
	"user_agent" text,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_one_subject" CHECK (num_nonnulls("sessions"."participant_id", "sessions"."admin_id") = 1)
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"start_date" date NOT NULL,
	"total_weeks" integer DEFAULT 12 NOT NULL,
	"max_active_week" integer DEFAULT 9 NOT NULL,
	"timezone" text DEFAULT 'Asia/Riyadh' NOT NULL,
	"submission_cutoff" time DEFAULT '23:59' NOT NULL,
	"correction_days" integer DEFAULT 3 NOT NULL,
	"missing_scores_zero" boolean DEFAULT true NOT NULL,
	"rules_locked" boolean DEFAULT false NOT NULL,
	CONSTRAINT "settings_single_row" CHECK ("settings"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE "weekly_scores" (
	"participant_id" uuid NOT NULL,
	"week_no" integer NOT NULL,
	"percentage" numeric(9, 4) NOT NULL,
	"days_counted" integer NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "weekly_scores_participant_id_week_no_pk" PRIMARY KEY("participant_id","week_no")
);
--> statement-breakpoint
ALTER TABLE "admins" ADD CONSTRAINT "admins_created_by_admins_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."admins"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_admin_id_admins_id_fk" FOREIGN KEY ("actor_admin_id") REFERENCES "public"."admins"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_participant_id_participants_id_fk" FOREIGN KEY ("actor_participant_id") REFERENCES "public"."participants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_entries" ADD CONSTRAINT "daily_entries_participant_id_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "final_scores" ADD CONSTRAINT "final_scores_participant_id_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participant_health" ADD CONSTRAINT "participant_health_participant_id_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participants" ADD CONSTRAINT "participants_diet_category_id_diet_categories_id_fk" FOREIGN KEY ("diet_category_id") REFERENCES "public"."diet_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_participant_id_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_admin_id_admins_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."admins"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_scores" ADD CONSTRAINT "weekly_scores_participant_id_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_log_entity_idx" ON "audit_log" USING btree ("entity_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "daily_entries_entry_date_idx" ON "daily_entries" USING btree ("entry_date");--> statement-breakpoint
CREATE INDEX "daily_entries_participant_week_idx" ON "daily_entries" USING btree ("participant_id","week_no");--> statement-breakpoint
CREATE INDEX "participants_email_idx" ON "participants" USING btree ("email");--> statement-breakpoint
CREATE INDEX "participants_status_idx" ON "participants" USING btree ("status");--> statement-breakpoint
CREATE INDEX "rate_limits_window_idx" ON "rate_limits" USING btree ("window_start");--> statement-breakpoint
CREATE INDEX "sessions_expires_at_idx" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "sessions_admin_id_idx" ON "sessions" USING btree ("admin_id") WHERE "sessions"."admin_id" IS NOT NULL;