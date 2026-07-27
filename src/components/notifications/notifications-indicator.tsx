import { Suspense } from "react";
import { NotificationsBell } from "@/components/notifications/notifications-bell";
import { countUnreadNotifications } from "@/lib/notifications/service";

export async function NotificationsIndicator({ userId }: { userId: string }) {
  const unreadCount = await countUnreadNotifications(userId);
  return <NotificationsBell initialUnreadCount={unreadCount} />;
}

export function NotificationsIndicatorSlot({ userId }: { userId: string }) {
  return (
    <Suspense fallback={null}>
      <NotificationsIndicator userId={userId} />
    </Suspense>
  );
}
