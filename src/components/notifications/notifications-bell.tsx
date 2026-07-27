"use client";

import { BellIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  listMyNotificationsAction,
  markAllNotificationsReadAction,
  markNotificationReadAction,
} from "@/lib/notifications/actions";
import type { NotificationItem } from "@/lib/notifications/service";

type NotificationsBellProps = {
  initialUnreadCount: number;
};

function formatRelativeTime(isoOrDate: Date | string): string {
  const date = typeof isoOrDate === "string" ? new Date(isoOrDate) : isoOrDate;
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) {
    return "Just now";
  }
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function NotificationsBell({ initialUnreadCount }: NotificationsBellProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setUnreadCount(initialUnreadCount);
  }, [initialUnreadCount]);

  useEffect(() => {
    if (!open || loaded) {
      return;
    }

    startTransition(() => {
      void listMyNotificationsAction().then((result) => {
        if (result.ok) {
          setItems(result.data);
          setUnreadCount(result.data.filter((item) => !item.readAt).length);
        }
        setLoaded(true);
      });
    });
  }, [open, loaded]);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setLoaded(false);
    }
  }

  async function handleItemClick(item: NotificationItem) {
    if (!item.readAt) {
      await markNotificationReadAction(item.id);
      setItems((current) =>
        current.map((entry) =>
          entry.id === item.id ? { ...entry, readAt: new Date().toISOString() } : entry,
        ),
      );
      setUnreadCount((count) => Math.max(0, count - 1));
    }
    setOpen(false);
    if (item.href) {
      router.push(item.href);
    }
  }

  async function handleMarkAllRead() {
    await markAllNotificationsReadAction();
    setItems((current) =>
      current.map((item) => ({ ...item, readAt: item.readAt ?? new Date().toISOString() })),
    );
    setUnreadCount(0);
    router.refresh();
  }

  return (
    <DropdownMenu open={open} onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="relative size-10 touch-manipulation text-[#eceef5] hover:bg-white/10 sm:size-9"
          aria-label={
            unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"
          }
        >
          <BellIcon className="size-5" />
          {unreadCount > 0 ? (
            <span className="absolute top-1.5 right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#f26b21] px-1 text-[10px] font-semibold text-white">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[min(92vw,22rem)]">
        <DropdownMenuLabel className="flex items-center justify-between gap-2">
          <span>Notifications</span>
          {unreadCount > 0 ? (
            <button
              type="button"
              className="text-muted-foreground text-xs font-normal hover:text-foreground"
              onClick={() => void handleMarkAllRead()}
            >
              Mark all read
            </button>
          ) : null}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {isPending && !loaded ? (
          <div className="px-2 py-6 text-center text-muted-foreground text-sm">Loading…</div>
        ) : items.length === 0 ? (
          <div className="px-2 py-6 text-center text-muted-foreground text-sm">
            No notifications yet.
          </div>
        ) : (
          items.map((item) => (
            <DropdownMenuItem
              key={item.id}
              className="flex cursor-pointer flex-col items-start gap-1 py-2.5"
              onSelect={(event) => {
                event.preventDefault();
                void handleItemClick(item);
              }}
            >
              <div className="flex w-full items-start justify-between gap-2">
                <p className={`text-sm ${item.readAt ? "font-medium" : "font-semibold"}`}>
                  {item.title}
                </p>
                {!item.readAt ? (
                  <span className="mt-1 size-2 shrink-0 rounded-full bg-[#f26b21]" />
                ) : null}
              </div>
              <p className="line-clamp-3 text-muted-foreground text-xs whitespace-normal">
                {item.body}
              </p>
              <p className="text-muted-foreground text-[11px]">
                {formatRelativeTime(item.createdAt)}
              </p>
            </DropdownMenuItem>
          ))
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/leave" className="cursor-pointer justify-center text-xs">
            View leave requests
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
