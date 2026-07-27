"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { formatLeaveDays, leaveTypeLabel } from "@/lib/leave/display";
import type { SerializedLeaveRequest } from "@/lib/leave/serialize";

type LeaveRejectSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  request: SerializedLeaveRequest | null;
  submitting: boolean;
  onConfirm: (reason: string) => void;
};

export function LeaveRejectSheet({
  open,
  onOpenChange,
  request,
  submitting,
  onConfirm,
}: LeaveRejectSheetProps) {
  const [reason, setReason] = useState("");
  const trimmed = reason.trim();

  function handleOpenChange(next: boolean) {
    if (!next) {
      setReason("");
    }
    onOpenChange(next);
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Reject leave request</SheetTitle>
          <SheetDescription>
            {request
              ? `${request.employeeName} · ${leaveTypeLabel(request.leaveType)} · ${formatLeaveDays(request.daysCount)} day(s)`
              : "Provide a reason the employee will see."}
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-1 flex-col gap-3 px-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="leave-reject-reason">Rejection reason</Label>
            <Textarea
              id="leave-reject-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Explain why this leave is being rejected…"
              rows={5}
              disabled={submitting}
              className="resize-none"
            />
            <p className="text-muted-foreground text-xs">
              Required. The employee will receive a notification with this reason.
            </p>
          </div>
        </div>

        <SheetFooter className="px-4 py-4 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={submitting || !trimmed}
            onClick={() => onConfirm(trimmed)}
          >
            {submitting ? "Rejecting…" : "Reject leave"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
