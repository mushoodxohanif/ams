"use client";

import { LeaveBalanceCards } from "@/components/leave/leave-balance-cards";
import { LeaveFormDocument } from "@/components/leave/leave-form-document";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { leaveStatusBadgeVariant, leaveStatusLabel } from "@/lib/leave/display";
import type { SerializedLeaveRequest } from "@/lib/leave/serialize";
import type { LeaveBalance } from "@/lib/leave/types";

type LeaveDetailSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  request: SerializedLeaveRequest | null;
  companyName: string;
  companySlug?: string;
  designation?: string | null;
  department?: string | null;
  balances: LeaveBalance[];
  showBalanceCards?: boolean;
};

export function LeaveDetailSheet({
  open,
  onOpenChange,
  request,
  companyName,
  companySlug,
  designation,
  department,
  balances,
  showBalanceCards = false,
}: LeaveDetailSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="flex h-[min(94dvh,940px)] w-full flex-col gap-0 p-0 sm:mx-auto sm:max-w-3xl sm:rounded-t-2xl"
      >
        <SheetHeader className="shrink-0 gap-1.5 px-4 pt-1 pb-3 sm:px-6">
          <SheetTitle>Leave request</SheetTitle>
        </SheetHeader>

        {request ? (
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-3 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6">
            <div className="space-y-2 rounded-xl border border-white/12 bg-[#050d22]/70 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-[#c8cce0]">Status</span>
                <Badge variant={leaveStatusBadgeVariant(request.status)}>
                  {leaveStatusLabel(request.status)}
                </Badge>
              </div>
              {request.reviewNotes ? (
                <p className="text-sm text-[#eceef5]">
                  <span className="font-medium text-[#c8cce0]">
                    {request.status === "rejected" ? "Rejection reason: " : "Review notes: "}
                  </span>
                  {request.reviewNotes}
                </p>
              ) : null}
            </div>

            {showBalanceCards && balances.length > 0 ? (
              <div className="space-y-2 rounded-xl border border-white/12 bg-[#050d22]/60 p-4">
                <div>
                  <h3 className="font-semibold text-sm text-white">Leave balance</h3>
                  <p className="text-sm text-[#d7dceb]">
                    {request.employeeName} · remaining / entitled for the request year
                  </p>
                </div>
                <LeaveBalanceCards balances={balances} />
              </div>
            ) : null}

            <LeaveFormDocument
              mode="view"
              companyName={companyName}
              companySlug={companySlug}
              employeeName={request.employeeName}
              designation={designation ?? request.employeeDesignation}
              department={department ?? request.employeeDepartment}
              balances={balances}
              leaveType={request.leaveType}
              startDate={request.startDate}
              endDate={request.endDate}
              daysCount={request.daysCount}
              reason={request.reason}
              medicalCertificateNote={request.medicalCertificateNote}
            />
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
