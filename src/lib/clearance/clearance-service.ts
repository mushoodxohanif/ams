import { eq } from "drizzle-orm";
import { db } from "@/db";
import { companies, employees } from "@/db/schema";
import { adminFailure, type ServiceFailure, type ServiceSuccess } from "@/lib/admin/types";
import { CLEARANCE_DEPARTMENTS, type ClearanceDepartmentEntry } from "./clearance-form-layout";
import type { ClearanceFormPdfData } from "./clearance-pdf";

export type ClearanceFormInput = {
  departmentEntries: ClearanceDepartmentEntry[];
};

export function validateClearanceFormInput(
  input: ClearanceFormInput,
): ServiceFailure | ServiceSuccess<ClearanceDepartmentEntry[]> {
  if (!Array.isArray(input.departmentEntries)) {
    return adminFailure(400, "INVALID_INPUT", "Department entries are required.");
  }

  if (input.departmentEntries.length !== CLEARANCE_DEPARTMENTS.length) {
    return adminFailure(
      400,
      "INVALID_INPUT",
      `Expected ${CLEARANCE_DEPARTMENTS.length} department entries.`,
    );
  }

  const entries = input.departmentEntries.map((entry) => ({
    remarks: typeof entry?.remarks === "string" ? entry.remarks.trim() : "",
    signature: typeof entry?.signature === "string" ? entry.signature.trim() : "",
  }));

  return { ok: true, data: entries };
}

export async function getEmployeeClearancePdfData(
  employeeId: string,
  departmentEntries: ClearanceDepartmentEntry[],
  companyId?: string,
): Promise<ServiceFailure | ServiceSuccess<ClearanceFormPdfData>> {
  const [employee] = await db.select().from(employees).where(eq(employees.id, employeeId)).limit(1);

  if (!employee) {
    return adminFailure(404, "EMPLOYEE_NOT_FOUND", "Employee not found.");
  }

  if (companyId && employee.companyId !== companyId) {
    return adminFailure(403, "FORBIDDEN", "Employee is not in the selected company.");
  }

  const [company] = await db
    .select({ name: companies.name, slug: companies.slug })
    .from(companies)
    .where(eq(companies.id, employee.companyId))
    .limit(1);

  if (!company) {
    return adminFailure(404, "COMPANY_NOT_FOUND", "Employee company not found.");
  }

  return {
    ok: true,
    data: {
      companyName: company.name,
      companySlug: company.slug,
      employeeCode: employee.employeeCode,
      employeeName: employee.fullName,
      department: employee.department,
      designation: employee.designation,
      departmentEntries,
    },
  };
}
