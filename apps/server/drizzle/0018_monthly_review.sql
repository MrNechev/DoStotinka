ALTER TABLE "users" ADD COLUMN "notify_monthly_review" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "last_review_month" varchar(7);