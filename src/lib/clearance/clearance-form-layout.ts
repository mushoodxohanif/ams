export type ClearanceDepartmentEntry = {
  remarks: string;
  signature: string;
};

export const CLEARANCE_DEPARTMENTS = [
  "Marketing Department",
  "Design & Development",
  "Finance Department",
  "Purchase Department",
  "IT Department",
  "Chairman Secretariat",
  "Administration Department",
  "Human Resource Department",
] as const;

export const CLEARANCE_FINAL_SIGNATURES = [
  "HR Manager",
  "CEO",
] as const;

export function emptyClearanceDepartmentEntries(): ClearanceDepartmentEntry[] {
  return CLEARANCE_DEPARTMENTS.map(() => ({
    remarks: "",
    signature: "",
  }));
}
