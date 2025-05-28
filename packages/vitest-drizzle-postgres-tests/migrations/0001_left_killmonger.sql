DO $$ BEGIN
 CREATE TYPE "public"."post_status" AS ENUM('draft', 'published', 'archived');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."user_status" AS ENUM('active', 'inactive', 'pending', 'suspended');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "test_posts" ADD COLUMN "status" "post_status" DEFAULT 'draft' NOT NULL;--> statement-breakpoint
ALTER TABLE "test_users" ADD COLUMN "status" "user_status" DEFAULT 'pending' NOT NULL;