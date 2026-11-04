ALTER TABLE "users" ADD COLUMN "notify_url" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "notify_format" text DEFAULT 'ntfy' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "notify_hour" smallint DEFAULT 8 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "last_notified_on" date;