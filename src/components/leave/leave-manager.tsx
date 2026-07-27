"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { LeaveFilters, type LeaveFiltersState } from "@/components/leave/leave-filters";
import { LeaveTable } from "@/components/leave/leave-table";
import type { SerializedEmployeeOption } from "@/lib/admin/serialize";
import { Button } from "@/components/ui/button";
import { deleteShahbazSickLeave20260707Action } from "@/lib/admin/actions";
import {
  approveLeaveRequestAction,
  deleteLeaveRequestAction,
  getLeaveBalancesAction,
  rejectLeaveRequestAction,
} from "@/lib/leave/actions";
import { leaveListQuery } from "@/lib/leave/query-params";
import type { SerializedLeaveRequest } from "@/lib/leave/serialize";
import type { LeaveBalance } from "@/lib/leave/types";
import { downloadResponseBlob, toastAsync } from "@/lib/toast";

const LeaveDetailSheet = dynamic(
  () => import("@/components/leave/leave-detail-sheet").then((module) => module.LeaveDetailSheet),
  { loading: () => null },
);

const LeaveRejectSheet = dynamic(
  () => import("@/components/leave/leave-reject-sheet").then((module) => module.LeaveRejectSheet),
  { loading: () => null },
);

type LeaveManagerProps = {
  employees: SerializedEmployeeOption[];
  requests: SerializedLeaveRequest[];
  filters: LeaveFiltersState;
  companyName: string;
};

export function LeaveManager({
  employees,
  requests,
  filters: initialFilters,
  companyName,
}: LeaveManagerProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [filters, setFilters] = useState<LeaveFiltersState>(initialFilters);
  const [actionPending, setActionPending] = useState(false);
  const [downloadPending, setDownloadPending] = useState(false);
  const [viewRequest, setViewRequest] = useState<SerializedLeaveRequest | null>(null);
  const [viewBalances, setViewBalances] = useState<LeaveBalance[]>([]);
  const [rejectRequest, setRejectRequest] = useState<SerializedLeaveRequest | null>(null);

  useEffect(() => {
    if (!viewRequest) {
      setViewBalances([]);
      return;
    }

    const year = Number.parseInt(viewRequest.startDate.slice(0, 4), 10);
    void getLeaveBalancesAction(viewRequest.employeeId, year).then((result) => {
      if (result.ok) {
        setViewBalances(result.data);
      }
    });
  }, [viewRequest]);

  useEffect(() => {
    setFilters(initialFilters);
  }, [initialFilters]);

  function applyFilterPatch(patch: Partial<LeaveFiltersState>) {
    setFilters((current) => {
      const next = { ...current, ...patch };
      for (const key of Object.keys(patch) as (keyof LeaveFiltersState)[]) {
        if (patch[key] === undefined) {
          delete next[key];
        }
      }
      startTransition(() => {
        router.replace(`/admin/leave${leaveListQuery(next)}`);
      });
      return next;
    });
  }

  async function handleApprove(id: string) {
    setActionPending(true);

    try {
      await toastAsync(
        approveLeaveRequestAction(id).then((result) => {
          if (!result.ok) {
            throw new Error(result.error);
          }
        }),
        {
          loading: "Approving leave request…",
          success: "Leave request approved.",
        },
      );
    } catch {
      // toastAsync already surfaced the error toast
    } finally {
      setActionPending(false);
    }
  }

  async function handleDownloadPdf(id: string) {
    setDownloadPending(true);

    try {
      await toastAsync(
        fetch(`/api/admin/leave/${id}/pdf`).then((response) =>
          downloadResponseBlob(response, `leave-${id}.pdf`),
        ),
        {
          loading: "Downloading leave PDF…",
          success: "Leave application PDF downloaded.",
        },
      );
    } catch {
      // toastAsync already surfaced the error toast
    } finally {
      setDownloadPending(false);
    }
  }

  function openReject(id: string) {
    const request = requests.find((item) => item.id === id) ?? null;
    setRejectRequest(request);
  }

  async function handleConfirmReject(reason: string) {
    if (!rejectRequest) {
      return;
    }

    setActionPending(true);

    try {
      await toastAsync(
        rejectLeaveRequestAction(rejectRequest.id, reason).then((result) => {
          if (!result.ok) {
            throw new Error(result.error);
          }
        }),
        {
          loading: "Rejecting leave request…",
          success: "Leave rejected. Employee notified.",
        },
      );
      setRejectRequest(null);
    } catch {
      // toastAsync already surfaced the error toast
    } finally {
      setActionPending(false);
    }
  }

  async function handleDelete(id: string) {
    const confirmed = window.confirm(
      "Delete this leave request and restore the days to the employee’s leave balance?",
    );
    if (!confirmed) {
      return;
    }

    setActionPending(true);

    try {
      await toastAsync(
        deleteLeaveRequestAction(id).then((result) => {
          if (!result.ok) {
            throw new Error(result.error);
          }
        }),
        {
          loading: "Deleting leave request…",
          success: "Leave request deleted. Balance restored.",
        },
      );
      router.refresh();
    } catch {
      // toastAsync already surfaced the error toast
    } finally {
      setActionPending(false);
    }
  }

  async function handleDeleteShahbazSickLeave() {
    if (
      !window.confirm(
        "Delete Shahbaz Afzal (001) approved sick leave for 2026-07-07 and restore 1 day to his sick leave pool?",
      )
    ) {
      return;
    }

    setActionPending(true);
    try {
      await toastAsync(
        deleteShahbazSickLeave20260707Action().then((result) => {
          if (!result.ok) {
            throw new Error(result.error);
          }
          return result.data;
        }),
        {
          loading: "Deleting Shahbaz sick leave…",
          success: (data) =>
            data.deleted === 0
              ? "No matching approved sick leave found."
              : `Deleted ${data.deleted} leave request. Sick remaining: ${data.sickRemainingAfter ?? "—"}.`,
        },
      );
      router.refresh();
    } catch {
      // toastAsync already surfaced the error toast
    } finally {
      setActionPending(false);
    }
  }

  const showShahbazCleanup = requests.some(
    (request) =>
      (request.employeeCode === "001" ||
        request.employeeName.toLowerCase().includes("shahbaz")) &&
      request.leaveType === "sick" &&
      request.startDate === "2026-07-07" &&
      request.endDate === "2026-07-07" &&
      request.status === "approved",
  );

  return (
    <div className="flex flex-col gap-6 md:min-h-0 md:flex-1 md:overflow-hidden">
      <div className="shrink-0 space-y-3">
        <LeaveFilters filters={filters} employees={employees} onChange={applyFilterPatch} />
        {showShahbazCleanup ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={actionPending}
              onClick={handleDeleteShahbazSickLeave}
            >
              Restore Shahbaz sick leave (2026-07-07)
            </Button>
            <p className="text-muted-foreground text-xs">
              Removes the approved 1-day sick leave and returns it to his leave pool.
            </p>
          </div>
        ) : null}
      </div>

      <LeaveTable
        className="md:min-h-0 md:flex-1"
        requests={requests}
        loading={isPending}
        showEmployee
        onView={setViewRequest}
        onApprove={handleApprove}
        onReject={openReject}
        onDelete={handleDelete}
        onDownloadPdf={handleDownloadPdf}
        downloadPending={downloadPending}
        actionPending={actionPending}
        resetDeps={[filters.status, filters.leaveType, filters.employeeId]}
      />

      <LeaveDetailSheet
        open={viewRequest !== null}
        onOpenChange={(open) => {
          if (!open) {
            setViewRequest(null);
          }
        }}
        request={viewRequest}
        companyName={companyName}
        balances={viewBalances}
        showBalanceCards
      />

      <LeaveRejectSheet
        open={rejectRequest !== null}
        onOpenChange={(open) => {
          if (!open) {
            setRejectRequest(null);
          }
        }}
        request={rejectRequest}
        submitting={actionPending}
        onConfirm={(reason) => void handleConfirmReject(reason)}
      />
    </div>
  );
}
