"use server";

import { revalidatePath } from "next/cache";
import { type ActionResult, actionFailure, actionSuccess } from "@/lib/actions/result";
import { requireSession } from "@/lib/auth/require-session";
import {
  countUnreadNotifications,
  listNotificationsForUser,
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationItem,
} from "./service";

function revalidateNotificationPaths() {
  revalidatePath("/dashboard", "layout");
  revalidatePath("/leave");
}

export async function listMyNotificationsAction(): Promise<ActionResult<NotificationItem[]>> {
  const session = await requireSession();
  const items = await listNotificationsForUser(session.user.id);
  return actionSuccess(items);
}

export async function countMyUnreadNotificationsAction(): Promise<ActionResult<number>> {
  const session = await requireSession();
  const count = await countUnreadNotifications(session.user.id);
  return actionSuccess(count);
}

export async function markNotificationReadAction(id: string): Promise<ActionResult> {
  const session = await requireSession();
  await markNotificationRead(session.user.id, id);
  revalidateNotificationPaths();
  return actionSuccess();
}

export async function markAllNotificationsReadAction(): Promise<ActionResult> {
  const session = await requireSession();
  await markAllNotificationsRead(session.user.id);
  revalidateNotificationPaths();
  return actionSuccess();
}
