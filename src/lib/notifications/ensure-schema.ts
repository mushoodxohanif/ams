import { sql } from "drizzle-orm";
import { db } from "@/db";

function isMissingNotificationsRelation(error: unknown): boolean {
  const message =
    error instanceof Error
      ? `${error.message} ${error.cause instanceof Error ? error.cause.message : ""}`
      : String(error);
  return message.includes("notifications") && message.includes("does not exist");
}

let ensurePromise: Promise<void> | null = null;

/** Idempotent DDL so production recovers if migration 0028 was not applied. */
export async function ensureNotificationsSchema(): Promise<void> {
  if (!ensurePromise) {
    ensurePromise = (async () => {
      await db.execute(sql.raw(`
        CREATE TABLE IF NOT EXISTS "notifications" (
          "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
          "user_id" uuid NOT NULL,
          "type" text NOT NULL,
          "title" text NOT NULL,
          "body" text NOT NULL,
          "href" text,
          "read_at" timestamp with time zone,
          "created_at" timestamp with time zone DEFAULT now() NOT NULL
        );
      `));

      await db.execute(sql.raw(`
        DO $$ BEGIN
          ALTER TABLE "notifications"
            ADD CONSTRAINT "notifications_user_id_users_id_fk"
            FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
            ON DELETE cascade ON UPDATE no action;
        EXCEPTION
          WHEN duplicate_object THEN null;
        END $$;
      `));

      await db.execute(sql.raw(`
        CREATE INDEX IF NOT EXISTS "notifications_user_id_created_at_idx"
          ON "notifications" USING btree ("user_id","created_at");
      `));
      await db.execute(sql.raw(`
        CREATE INDEX IF NOT EXISTS "notifications_user_id_unread_idx"
          ON "notifications" USING btree ("user_id","read_at");
      `));
    })().catch((error) => {
      ensurePromise = null;
      throw error;
    });
  }

  await ensurePromise;
}

export async function withNotificationsSchema<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (!isMissingNotificationsRelation(error)) {
      throw error;
    }
    await ensureNotificationsSchema();
    return operation();
  }
}
