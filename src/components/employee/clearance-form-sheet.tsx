"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import type { SerializedEmployee } from "@/lib/admin/serialize";
import {
  CLEARANCE_DEPARTMENTS,
  type ClearanceDepartmentEntry,
  emptyClearanceDepartmentEntries,
} from "@/lib/clearance/clearance-form-layout";

export type ClearanceFormValues = {
  departmentEntries: ClearanceDepartmentEntry[];
};

export function employeeToClearanceForm(): ClearanceFormValues {
  return {
    departmentEntries: emptyClearanceDepartmentEntries(),
  };
}

type ClearanceFormSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employee: SerializedEmployee | null;
  form: ClearanceFormValues;
  onFormChange: React.Dispatch<React.SetStateAction<ClearanceFormValues>>;
  generating: boolean;
  onPreview: () => void;
  onDownload: () => void;
  onCancel: () => void;
};

export function ClearanceFormSheet({
  open,
  onOpenChange,
  employee,
  form,
  onFormChange,
  generating,
  onPreview,
  onDownload,
  onCancel,
}: ClearanceFormSheetProps) {
  function updateDepartmentEntry(index: number, patch: Partial<ClearanceDepartmentEntry>): void {
    onFormChange((current) => ({
      departmentEntries: current.departmentEntries.map((entry, entryIndex) =>
        entryIndex === index ? { ...entry, ...patch } : entry,
      ),
    }));
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 overflow-hidden sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>Crest LED clearance form</SheetTitle>
          <SheetDescription>
            Enter departmental remarks and signatures, then preview or download the printable PDF.
          </SheetDescription>
        </SheetHeader>

        {employee ? (
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4">
            <div className="grid gap-3 rounded-xl border border-white/12 bg-[#050d22]/70 p-4 sm:grid-cols-2">
              <div>
                <p className="text-xs font-medium text-[#c8cce0]">Employee code</p>
                <p className="font-mono text-sm font-semibold text-white">{employee.employeeCode}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-[#c8cce0]">Name</p>
                <p className="text-sm font-semibold text-white">{employee.fullName}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-[#c8cce0]">Department</p>
                <p className="text-sm font-medium text-[#eceef5]">{employee.department ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-[#c8cce0]">Designation</p>
                <p className="text-sm font-medium text-[#eceef5]">{employee.designation ?? "—"}</p>
              </div>
            </div>

            <Separator className="bg-white/10" />

            <div className="space-y-4">
              {CLEARANCE_DEPARTMENTS.map((department, index) => {
                const entry = form.departmentEntries[index] ?? { remarks: "", signature: "" };

                return (
                  <div
                    key={department}
                    className="space-y-3 rounded-xl border border-white/12 bg-[#050d22]/60 p-4"
                  >
                    <p className="font-semibold text-sm text-white">
                      {index + 1}. {department}
                    </p>
                    <div className="space-y-2">
                      <Label htmlFor={`clearance-remarks-${index}`}>Remarks</Label>
                      <Textarea
                        id={`clearance-remarks-${index}`}
                        value={entry.remarks}
                        onChange={(event) =>
                          updateDepartmentEntry(index, { remarks: event.target.value })
                        }
                        rows={2}
                        placeholder="Department remarks"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`clearance-signature-${index}`}>Signature</Label>
                      <Input
                        id={`clearance-signature-${index}`}
                        value={entry.signature}
                        onChange={(event) =>
                          updateDepartmentEntry(index, { signature: event.target.value })
                        }
                        placeholder="Signatory name"
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            <p className="text-sm text-[#d7dceb]">
              Preview or download the Crest LED letterhead clearance PDF. Office Manager, General
              Manager, and Executive Director lines stay blank for wet signatures after printing.
            </p>
          </div>
        ) : null}

        <SheetFooter className="px-4 py-4 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={onCancel} disabled={generating}>
            Cancel
          </Button>
          <Button type="button" variant="secondary" onClick={onPreview} disabled={generating}>
            {generating ? "Generating…" : "Preview PDF"}
          </Button>
          <Button type="button" onClick={onDownload} disabled={generating}>
            {generating ? "Generating…" : "Download PDF"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
