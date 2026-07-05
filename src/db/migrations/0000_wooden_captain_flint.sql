CREATE TABLE "analyses" (
	"call_id" bigint PRIMARY KEY NOT NULL,
	"summary" text,
	"sentiment" varchar(16),
	"manager_score" double precision,
	"script_compliance" double precision,
	"next_action" text,
	"objections" jsonb,
	"topics" jsonb,
	"checklist_scores" jsonb,
	"client_name" text,
	"detected_product" varchar(32),
	"raw" jsonb,
	"model" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "calls" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"tenant_id" bigint NOT NULL,
	"user_id" bigint,
	"channel" varchar(32) DEFAULT 'bitrix_telephony' NOT NULL,
	"type" varchar(16) DEFAULT 'call' NOT NULL,
	"bitrix_call_id" varchar(128),
	"bitrix_deal_id" varchar(64),
	"bitrix_lead_id" varchar(64),
	"bitrix_contact_id" varchar(64),
	"bitrix_activity_id" varchar(64),
	"manager_id" varchar(64),
	"manager_name" text,
	"client_phone" varchar(64),
	"direction" varchar(4),
	"started_at" timestamp with time zone,
	"duration_sec" integer DEFAULT 0 NOT NULL,
	"recording_url" text,
	"recording_path" text,
	"status" varchar(16) DEFAULT 'pending' NOT NULL,
	"error" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"detected_product" varchar(32),
	"deal_context" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "calls_bitrix_call_id_unique" UNIQUE("bitrix_call_id")
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"tenant_id" bigint NOT NULL,
	"type" varchar(64) NOT NULL,
	"payload" jsonb,
	"delivery_status" varchar(16) DEFAULT 'pending' NOT NULL,
	"delivery_error" text,
	"delivery_attempts" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "managers" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"tenant_id" bigint NOT NULL,
	"name" text,
	"email" varchar(255),
	"is_active" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reminders" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"tenant_id" bigint NOT NULL,
	"user_id" bigint,
	"call_id" bigint,
	"title" text NOT NULL,
	"description" text,
	"due_at" timestamp with time zone,
	"status" varchar(16) DEFAULT 'open' NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sales_scripts" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"tenant_id" bigint NOT NULL,
	"name" text NOT NULL,
	"product" varchar(32),
	"direction" varchar(8) DEFAULT 'all' NOT NULL,
	"content_md" text DEFAULT '' NOT NULL,
	"checklist" jsonb DEFAULT '[]'::jsonb,
	"is_active" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" varchar(128) PRIMARY KEY NOT NULL,
	"user_id" bigint,
	"tenant_id" bigint,
	"legacy_login" varchar(255),
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" varchar(128) PRIMARY KEY NOT NULL,
	"value" text,
	"tenant_id" bigint,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" varchar(64),
	"is_active" boolean DEFAULT true NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenants_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "transcripts" (
	"call_id" bigint PRIMARY KEY NOT NULL,
	"text" text NOT NULL,
	"segments" jsonb,
	"dialogue" jsonb,
	"language" varchar(8),
	"model" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"tenant_id" bigint NOT NULL,
	"login" varchar(255) NOT NULL,
	"password_hash" text NOT NULL,
	"role" varchar(16) DEFAULT 'manager' NOT NULL,
	"name" text,
	"email" varchar(255),
	"is_active" boolean DEFAULT true NOT NULL,
	"bitrix_manager_id" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "analyses" ADD CONSTRAINT "analyses_call_id_calls_id_fk" FOREIGN KEY ("call_id") REFERENCES "public"."calls"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calls" ADD CONSTRAINT "calls_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calls" ADD CONSTRAINT "calls_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "managers" ADD CONSTRAINT "managers_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_call_id_calls_id_fk" FOREIGN KEY ("call_id") REFERENCES "public"."calls"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_scripts" ADD CONSTRAINT "sales_scripts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transcripts" ADD CONSTRAINT "transcripts_call_id_calls_id_fk" FOREIGN KEY ("call_id") REFERENCES "public"."calls"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "calls_status_idx" ON "calls" USING btree ("status");--> statement-breakpoint
CREATE INDEX "calls_started_at_idx" ON "calls" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "calls_manager_idx" ON "calls" USING btree ("manager_id");--> statement-breakpoint
CREATE INDEX "calls_tenant_started_idx" ON "calls" USING btree ("tenant_id","started_at");--> statement-breakpoint
CREATE INDEX "calls_tenant_manager_idx" ON "calls" USING btree ("tenant_id","manager_id");--> statement-breakpoint
CREATE INDEX "events_delivery_idx" ON "events" USING btree ("delivery_status","created_at");--> statement-breakpoint
CREATE INDEX "events_tenant_idx" ON "events" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "reminders_user_status_idx" ON "reminders" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "reminders_due_idx" ON "reminders" USING btree ("due_at");--> statement-breakpoint
CREATE INDEX "sessions_expires_idx" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "users_tenant_login_idx" ON "users" USING btree ("tenant_id","login");--> statement-breakpoint
CREATE INDEX "users_bitrix_idx" ON "users" USING btree ("bitrix_manager_id");--> statement-breakpoint
CREATE INDEX "users_tenant_role_idx" ON "users" USING btree ("tenant_id","role");