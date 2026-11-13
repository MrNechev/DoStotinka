CREATE TABLE "household_invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"email" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "household_owner_id" uuid;--> statement-breakpoint
ALTER TABLE "household_invites" ADD CONSTRAINT "household_invites_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "household_invites_owner_email_idx" ON "household_invites" USING btree ("owner_id","email");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_household_owner_id_users_id_fk" FOREIGN KEY ("household_owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;