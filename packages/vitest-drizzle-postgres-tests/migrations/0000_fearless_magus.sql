CREATE TABLE IF NOT EXISTS "test_posts" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"content" text,
	"author_id" integer,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "test_users" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"age" integer,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "test_users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "test_posts" ADD CONSTRAINT "test_posts_author_id_test_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."test_users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
