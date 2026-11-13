CREATE TABLE "bank_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"connection_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"uid" text NOT NULL,
	"identity" text,
	"name" text,
	"iban" text,
	"currency" varchar(3),
	"account_id" uuid,
	"enabled" boolean DEFAULT true NOT NULL,
	"import_from" date NOT NULL,
	"last_booking_date" date,
	"balance" bigint,
	"balance_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bank_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" text DEFAULT 'enable_banking' NOT NULL,
	"bank_name" text NOT NULL,
	"bank_country" varchar(2) NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"auth_state" text,
	"session_id" text,
	"valid_until" timestamp with time zone,
	"enabled" boolean DEFAULT true NOT NULL,
	"auto_confirm" boolean DEFAULT false NOT NULL,
	"last_sync_at" timestamp with time zone,
	"last_error" text,
	"retry_after" timestamp with time zone,
	"expiry_notified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bank_credentials" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"provider" text DEFAULT 'enable_banking' NOT NULL,
	"application_id" text NOT NULL,
	"private_key" text NOT NULL,
	"environment" text,
	"redirect_urls" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"redirect_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inbox_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"origin" text NOT NULL,
	"notification_source_id" uuid,
	"bank_account_id" uuid,
	"app" text,
	"account_id" uuid,
	"type" text DEFAULT 'expense' NOT NULL,
	"amount" bigint,
	"currency" varchar(3),
	"occurred_at" timestamp with time zone NOT NULL,
	"payee" text,
	"description" text,
	"external_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"category_id" uuid,
	"record_id" uuid,
	"match_record_id" uuid,
	"duplicate_of_id" uuid,
	"pair_item_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_apps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"app" text NOT NULL,
	"account_id" uuid,
	"enabled" boolean DEFAULT true NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"token_hash" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"auto_confirm" boolean DEFAULT false NOT NULL,
	"last_received_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "import_notifications" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "import_bank" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_connection_id_bank_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."bank_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_connections" ADD CONSTRAINT "bank_connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_credentials" ADD CONSTRAINT "bank_credentials_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbox_items" ADD CONSTRAINT "inbox_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbox_items" ADD CONSTRAINT "inbox_items_notification_source_id_notification_sources_id_fk" FOREIGN KEY ("notification_source_id") REFERENCES "public"."notification_sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbox_items" ADD CONSTRAINT "inbox_items_bank_account_id_bank_accounts_id_fk" FOREIGN KEY ("bank_account_id") REFERENCES "public"."bank_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbox_items" ADD CONSTRAINT "inbox_items_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbox_items" ADD CONSTRAINT "inbox_items_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbox_items" ADD CONSTRAINT "inbox_items_record_id_records_id_fk" FOREIGN KEY ("record_id") REFERENCES "public"."records"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbox_items" ADD CONSTRAINT "inbox_items_match_record_id_records_id_fk" FOREIGN KEY ("match_record_id") REFERENCES "public"."records"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_apps" ADD CONSTRAINT "notification_apps_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_apps" ADD CONSTRAINT "notification_apps_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_sources" ADD CONSTRAINT "notification_sources_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bank_accounts_user_idx" ON "bank_accounts" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "bank_accounts_connection_uid_idx" ON "bank_accounts" USING btree ("connection_id","uid");--> statement-breakpoint
CREATE INDEX "bank_connections_user_idx" ON "bank_connections" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "bank_connections_state_idx" ON "bank_connections" USING btree ("auth_state");--> statement-breakpoint
CREATE INDEX "inbox_items_user_status_idx" ON "inbox_items" USING btree ("user_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "inbox_items_external_idx" ON "inbox_items" USING btree ("user_id","origin","external_id");--> statement-breakpoint
CREATE INDEX "inbox_items_record_idx" ON "inbox_items" USING btree ("record_id");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_apps_user_app_idx" ON "notification_apps" USING btree ("user_id","app");--> statement-breakpoint
CREATE INDEX "notification_sources_user_idx" ON "notification_sources" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_sources_token_idx" ON "notification_sources" USING btree ("token_hash");