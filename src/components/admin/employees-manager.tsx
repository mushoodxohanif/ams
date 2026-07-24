"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import {
  type ClearanceFormValues,
  employeeToClearanceForm,
} from "@/components/employee/clearance-form-sheet";
import { EmployeeFilters } from "@/components/employee/employee-filters";
import {
  type EmployeeFormValues,
  employeeToForm,
  emptyEmployeeFormForCompany,
  type ShiftPresetCompany,
} from "@/components/employee/employee-sheet";
import { EmployeeTable } from "@/components/employee/employee-table";
import {
  consolidateDuplicateEmployeesAction,
  createEmployeeAction,
  deactivateEmployeeAction,
  endEmployeeProbationAction,
  getEmployeeDeactivationPreviewAction,
  reactivateEmployeeAction,
  startEmployeeProbationAction,
  updateEmployeeAction,
} from "@/lib/admin/actions";
import { DEFAULT_PROBATION_PERIOD_MONTHS, getTodayPkt } from "@/lib/admin/probation";
import { employeesListQuery } from "@/lib/admin/query-params";
import type { SerializedEmployee } from "@/lib/admin/serialize";
import { downloadResponseBlob, previewResponseBlob, toastAsync, toastError } from "@/lib/toast";
import { Button } from "@/components/ui/button";

const EmployeeSheet = dynamic(
  () => import("@/components/employee/employee-sheet").then((module) => module.EmployeeSheet),
  { loading: () => null },
);

const ClearanceFormSheet = dynamic(
  () =>
    import("@/components/employee/clearance-form-sheet").then(
      (module) => module.ClearanceFormSheet,
    ),
  { loading: () => null },
);

const EmployeeLeaveQuotaSheet = dynamic(
  () =>
    import("@/components/employee/employee-leave-quota-sheet").then(
      (module) => module.EmployeeLeaveQuotaSheet,
    ),
  { loading: () => null },
);

type EmployeesManagerProps = {
  employees: SerializedEmployee[];
  search: string;
  includeInactive: boolean;
  /** When set, show and save per-employee shift timing for that company. */
  shiftPresetCompany?: ShiftPresetCompany | null;
  leaveYear: number;
};

export function EmployeesManager({
  employees,
  search,
  includeInactive,
  shiftPresetCompany = null,
  leaveYear,
}: EmployeesManagerProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [searchInput, setSearchInput] = useState(search);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<EmployeeFormValues>(() =>
    emptyEmployeeFormForCompany(shiftPresetCompany),
  );
  const [saving, setSaving] = useState(false);
  const [probationActionPending, setProbationActionPending] = useState(false);
  const [clearanceOpen, setClearanceOpen] = useState(false);
  const [clearanceEmployee, setClearanceEmployee] = useState<SerializedEmployee | null>(null);
  const [clearanceForm, setClearanceForm] = useState<ClearanceFormValues>(
    employeeToClearanceForm(),
  );
  const [clearanceGenerating, setClearanceGenerating] = useState(false);
  const [leaveQuotaOpen, setLeaveQuotaOpen] = useState(false);
  const [leaveQuotaEmployee, setLeaveQuotaEmployee] = useState<SerializedEmployee | null>(null);

  useEffect(() => {
    setSearchInput(search);
  }, [search]);

  useEffect(() => {
    const href = `/admin/employees${employeesListQuery(searchInput, includeInactive)}`;
    const currentHref = `/admin/employees${employeesListQuery(search, includeInactive)}`;
    if (href === currentHref) {
      return;
    }

    const timer = window.setTimeout(() => {
      startTransition(() => {
        router.replace(href);
      });
    }, 400);

    return () => window.clearTimeout(timer);
  }, [searchInput, includeInactive, search, router]);

  function navigateFilters(nextSearch: string, nextIncludeInactive: boolean) {
    startTransition(() => {
      router.replace(`/admin/employees${employeesListQuery(nextSearch, nextIncludeInactive)}`);
    });
  }

  function openCreate() {
    setEditingId(null);
    setForm(emptyEmployeeFormForCompany(shiftPresetCompany));
    setFormOpen(true);
  }

  function openClearanceForm(employee: SerializedEmployee) {
    setClearanceEmployee(employee);
    setClearanceForm(employeeToClearanceForm());
    setClearanceOpen(true);
  }

  function closeClearanceForm() {
    setClearanceOpen(false);
    setClearanceEmployee(null);
    setClearanceForm(employeeToClearanceForm());
  }

  function openLeaveQuota(employee: SerializedEmployee) {
    setLeaveQuotaEmployee(employee);
    setLeaveQuotaOpen(true);
  }

  function closeLeaveQuota() {
    setLeaveQuotaOpen(false);
    setLeaveQuotaEmployee(null);
  }

  async function generateClearancePdf(disposition: "inline" | "attachment") {
    if (!clearanceEmployee) {
      return;
    }

    setClearanceGenerating(true);

    try {
      const response = await fetch(`/api/admin/employees/${clearanceEmployee.id}/clearance/pdf`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          departmentEntries: clearanceForm.departmentEntries,
          disposition,
        }),
      });

      const fallbackFilename = `clearance-${clearanceEmployee.employeeCode}.pdf`;

      if (disposition === "inline") {
        await toastAsync(previewResponseBlob(response, fallbackFilename), {
          loading: "Generating clearance PDF…",
          success: "Clearance PDF opened in a new tab.",
        });
      } else {
        await toastAsync(downloadResponseBlob(response, fallbackFilename), {
          loading: "Generating clearance PDF…",
          success: "Clearance PDF downloaded.",
        });
      }
    } catch {
      // toastAsync already surfaced the error toast
    } finally {
      setClearanceGenerating(false);
    }
  }

  function openEdit(employee: SerializedEmployee) {
    setEditingId(employee.id);
    setForm(employeeToForm(employee, shiftPresetCompany));
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    setEditingId(null);
    setForm(emptyEmployeeFormForCompany(shiftPresetCompany));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      const periodMonths = Number.parseInt(form.probationPeriodMonths, 10);
      if (
        form.probationEnabled &&
        (!Number.isFinite(periodMonths) || periodMonths < 1 || periodMonths > 24)
      ) {
        toastError("Probation period must be between 1 and 24 months.");
        return;
      }

      const shiftFields = shiftPresetCompany ? { shiftPreset: form.shiftPreset } : {};

      const payload = form.probationCompleted
        ? {
            employeeCode: form.employeeCode,
            fullName: form.fullName,
            email: form.email,
            department: form.department || null,
            designation: form.designation || null,
            probationCompleted: true,
            probationEnabled: false,
            probationStartDate: null,
            probationPeriodMonths: DEFAULT_PROBATION_PERIOD_MONTHS,
            password: form.password.trim() || undefined,
            ...shiftFields,
          }
        : {
            employeeCode: form.employeeCode,
            fullName: form.fullName,
            email: form.email,
            department: form.department || null,
            designation: form.designation || null,
            probationCompleted: false,
            probationEnabled: form.probationEnabled,
            probationStartDate: form.probationEnabled ? form.probationStartDate : null,
            probationPeriodMonths: form.probationEnabled
              ? periodMonths
              : DEFAULT_PROBATION_PERIOD_MONTHS,
            password: form.password.trim() || undefined,
            ...shiftFields,
          };

      await toastAsync(
        (editingId ? updateEmployeeAction(editingId, payload) : createEmployeeAction(payload)).then(
          (result) => {
            if (!result.ok) {
              throw new Error(result.error);
            }
          },
        ),
        {
          loading: editingId ? "Updating employee…" : "Creating employee…",
          success: editingId ? "Employee updated." : "Employee created.",
        },
      );
      closeForm();
      startTransition(() => router.refresh());
    } catch {
      // toastAsync already surfaced the error toast
    } finally {
      setSaving(false);
    }
  }

  async function handleDeactivate(id: string, name: string) {
    try {
      const preview = await getEmployeeDeactivationPreviewAction(id);
      if (!preview.ok) {
        toastError(preview.error);
        return;
      }

      const { hasOpenShift, openShiftState } = preview.data;
      const stateLabel = openShiftState === "on_break" ? "on break" : "checked in";
      const message = hasOpenShift
        ? `${name} is still ${stateLabel} for today's shift. Close their shift now and deactivate them? They will no longer be able to check in.`
        : `Deactivate ${name}? They will no longer be able to check in.`;

      if (!window.confirm(message)) {
        return;
      }

      await toastAsync(
        deactivateEmployeeAction(id, {
          closeOpenShift: hasOpenShift,
        }).then((result) => {
          if (!result.ok) {
            throw new Error(result.error);
          }
        }),
        {
          loading: "Deactivating employee…",
          success: hasOpenShift
            ? "Employee deactivated and open shift closed."
            : "Employee deactivated.",
        },
      );
      startTransition(() => router.refresh());
    } catch {
      // toastAsync already surfaced the error toast
    }
  }

  async function handleStartProbation(id: string, name: string): Promise<boolean> {
    if (
      !window.confirm(
        `Start a ${DEFAULT_PROBATION_PERIOD_MONTHS}-month probation period for ${name}?`,
      )
    ) {
      return false;
    }

    setProbationActionPending(true);
    try {
      await toastAsync(
        startEmployeeProbationAction(id).then((result) => {
          if (!result.ok) {
            throw new Error(result.error);
          }
        }),
        {
          loading: "Starting probation…",
          success: "Probation started.",
        },
      );
      startTransition(() => router.refresh());
      return true;
    } catch {
      return false;
    } finally {
      setProbationActionPending(false);
    }
  }

  async function handleEndProbation(id: string, name: string): Promise<boolean> {
    if (!window.confirm(`End probation for ${name}?`)) {
      return false;
    }

    setProbationActionPending(true);
    try {
      await toastAsync(
        endEmployeeProbationAction(id).then((result) => {
          if (!result.ok) {
            throw new Error(result.error);
          }
        }),
        {
          loading: "Ending probation…",
          success: "Probation ended.",
        },
      );
      startTransition(() => router.refresh());
      return true;
    } catch {
      return false;
    } finally {
      setProbationActionPending(false);
    }
  }

  async function handleSheetStartProbation() {
    if (!editingId) {
      return;
    }
    const employee = employees.find((item) => item.id === editingId);
    if (!employee) {
      return;
    }
    const started = await handleStartProbation(editingId, employee.fullName);
    if (!started) {
      return;
    }
    setForm((current) => ({
      ...current,
      probationEnabled: true,
      probationCompleted: false,
      probationStartDate: getTodayPkt(),
      probationPeriodMonths: String(DEFAULT_PROBATION_PERIOD_MONTHS),
    }));
  }

  async function handleSheetEndProbation() {
    if (!editingId) {
      return;
    }
    const employee = employees.find((item) => item.id === editingId);
    if (!employee) {
      return;
    }
    const ended = await handleEndProbation(editingId, employee.fullName);
    if (!ended) {
      return;
    }
    setForm((current) => ({
      ...current,
      probationEnabled: false,
      probationCompleted: true,
    }));
  }

  async function handleConsolidateDuplicates() {
    if (
      !window.confirm(
        "Merge duplicate employee rows for the selected company? Sibling attendance and ZKTime punches move onto the canonical record, codes are aligned to ZKTime badges when possible, and duplicate rows are deactivated.",
      )
    ) {
      return;
    }

    try {
      await toastAsync(
        consolidateDuplicateEmployeesAction().then((result) => {
          if (!result.ok) {
            throw new Error(result.error);
          }
          return result.data;
        }),
        {
          loading: "Pulling ZKTime employees and merging duplicates…",
          success: (data) =>
            data.clustersMerged === 0
              ? "No duplicate employee clusters found."
              : `Merged ${data.clustersMerged} cluster(s): deactivated ${data.siblingsDeactivated}, moved ${data.attendanceMoved} attendance row(s), relinked ${data.punchesRelinked} punch(es), aligned ${data.codesAlignedToZktime} code(s) to ZKTime.`,
        },
      );
      startTransition(() => router.refresh());
    } catch {
      // toastAsync already surfaced the error toast
    }
  }

  async function handleReactivate(id: string) {
    try {
      await toastAsync(
        reactivateEmployeeAction(id).then((result) => {
          if (!result.ok) {
            throw new Error(result.error);
          }
        }),
        {
          loading: "Reactivating employee…",
          success: "Employee reactivated.",
        },
      );
      startTransition(() => router.refresh());
    } catch {
      // toastAsync already surfaced the error toast
    }
  }

  return (
    <div className="flex flex-col gap-4 md:min-h-0 md:flex-1 md:overflow-hidden">
      <div className="shrink-0 space-y-4">
        <EmployeeFilters
          search={searchInput}
          onSearchChange={setSearchInput}
          includeInactive={includeInactive}
          onIncludeInactiveChange={(value) => {
            setSearchInput(searchInput);
            navigateFilters(searchInput, value);
          }}
          onAddEmployee={openCreate}
        />

        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={handleConsolidateDuplicates}>
            Merge duplicates + align ZKTime
          </Button>
          <p className="text-muted-foreground text-xs">
            Removes duplicate people from reports/employees and prefers ZKTime badge codes.
          </p>
        </div>

        <EmployeeSheet
          open={formOpen}
          onOpenChange={(open) => {
            if (!open) {
              closeForm();
            }
          }}
          editingId={editingId}
          form={form}
          onFormChange={setForm}
          saving={saving}
          onSubmit={handleSubmit}
          onCancel={closeForm}
          onStartProbation={editingId ? handleSheetStartProbation : undefined}
          onEndProbation={editingId ? handleSheetEndProbation : undefined}
          probationActionPending={probationActionPending}
          shiftPresetCompany={shiftPresetCompany}
        />

        <ClearanceFormSheet
          open={clearanceOpen}
          onOpenChange={(open) => {
            if (!open) {
              closeClearanceForm();
            }
          }}
          employee={clearanceEmployee}
          form={clearanceForm}
          onFormChange={setClearanceForm}
          generating={clearanceGenerating}
          onPreview={() => void generateClearancePdf("inline")}
          onDownload={() => void generateClearancePdf("attachment")}
          onCancel={closeClearanceForm}
        />

        <EmployeeLeaveQuotaSheet
          open={leaveQuotaOpen}
          onOpenChange={(open) => {
            if (!open) {
              closeLeaveQuota();
            }
          }}
          employee={leaveQuotaEmployee}
          balances={leaveQuotaEmployee?.leaveBalances ?? []}
          year={leaveYear}
        />
      </div>

      <EmployeeTable
        className="md:min-h-0 md:flex-1"
        employees={employees}
        loading={isPending}
        onEdit={openEdit}
        onClearanceForm={openClearanceForm}
        onViewLeaveQuota={openLeaveQuota}
        onDeactivate={handleDeactivate}
        onReactivate={handleReactivate}
        onStartProbation={handleStartProbation}
        onEndProbation={handleEndProbation}
        showShiftPreset={Boolean(shiftPresetCompany)}
        resetDeps={[search, includeInactive]}
      />
    </div>
  );
}
