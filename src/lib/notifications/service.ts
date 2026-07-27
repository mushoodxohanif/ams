import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { employees, notifications, users } from "@/db/schema";
import { ensureNotificationsSchema, withNotificationsSchema } from "./ensure-schema";

export type NotificationItem = {
  id: string;
  type: string;
  title: string;
  body: string;
  href: string | null;
  readAt: string | null;
  createdAt: string;
};

export type CreateNotificationInput = {
  userId: string;
  type: string;
  title: string;
  body: string;
  href?: string | null;
};

async function resolveUserIdForEmployee(employeeId: string): Promise<string | null> {
  const [byEmployeeLink] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.employeeId, employeeId))
    .limit(1);
  if (byEmployeeLink) {
    return byEmployeeLink.id;
  }

  const [employee] = await db
    .select({ userId: employees.userId })
    .from(employees)
    .where(eq(employees.id, employeeId))
    .limit(1);

  return employee?.userId ?? null;
}

export async function createNotificationForEmployee(
  employeeId: string,
  input: Omit<CreateNotificationInput, "userId">,
): Promise<NotificationItem | null> {
  const userId = await resolveUserIdForEmployee(employeeId);
  if (!userId) {
    return null;
  }
  return createNotification({ ...input, userId });
}

export async function createNotification(
  input: CreateNotificationInput,
): Promise<NotificationItem> {
  await ensureNotificationsSchema();

  return withNotificationsSchema(async () => {
    const [created] = await db
      .insert(notifications)
      .values({
        userId: input.userId,
        type: input.type,
        title: input.title,
        body: input.body,
        href: input.href ?? null,
      })
      .returning();

    return {
      id: created.id,
      type: created.type,
      title: created.title,
      body: created.body,
      href: created.href,
      readAt: created.readAt?.toISOString() ?? null,
      createdAt: created.createdAt.toISOString(),
    };
  });
}

export async function listNotificationsForUser(
  userId: string,
  limit = 20,
): Promise<NotificationItem[]> {
  await ensureNotificationsSchema();

  return withNotificationsSchema(async () => {
    const rows = await db
      .select({
        id: notifications.id,
        type: notifications.type,
        title: notifications.title,
        body: notifications.body,
        href: notifications.href,
        readAt: notifications.readAt,
        createdAt: notifications.createdAt,
      })
      .from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt))
      .limit(limit);

    return rows.map((row) => ({
      id: row.id,
      type: row.type,
      title: row.title,
      body: row.body,
      href: row.href,
      readAt: row.readAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    }));
  });
}

export async function countUnreadNotifications(userId: string): Promise<number> {
  await ensureNotificationsSchema();

  return withNotificationsSchema(async () => {
    const [row] = await db
      .select({ value: sql<number>`count(*)::int` })
      .from(notifications)
      .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));

    return row?.value ?? 0;
  });
}

export async function markNotificationRead(
  userId: string,
  notificationId: string,
): Promise<void> {
  await ensureNotificationsSchema();

  await withNotificationsSchema(async () => {
    await db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(and(eq(notifications.id, notificationId), eq(notifications.userId, userId)));
  });
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
  await ensureNotificationsSchema();

  await withNotificationsSchema(async () => {
    await db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  });
}
