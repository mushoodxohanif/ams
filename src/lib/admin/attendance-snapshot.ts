import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { attendanceDays, companies, employees } from "@/db/schema";
import { effectiveAttendanceStatus } from "@/lib/attendance/effective-status";

export type AttendanceSnapshotRow = {
  employeeCode: string;
  fullName: string;
  status: string;
  checkInAt: string | null;
  checkOutAt: string | null;
  isLate: boolean;
  isMissedCheckout: boolean;
};

export type AttendanceSnapshot = {
  company: string;
  shiftDate: string;
  activeEmployees: number;
  withCheckIn: number;
  withoutCheckIn: number;
  withCheckOut: number;
  missingCheckOut: number;
  missedCheckoutFlagged: number;
  employees: AttendanceSnapshotRow[];
};

export async function getAttendanceSnapshot(
  shiftDate: string,
  companySlug = "xorora",
): Promise<AttendanceSnapshot> {
  const [company] = await db
    .select({ id: companies.id, name: companies.name })
    .from(companies)
    .where(eq(companies.slug, companySlug))
    .limit(1);

  if (!company) {
    throw new Error(`Company not found: ${companySlug}`);
  }

  const rows = await db
    .select({
      employeeCode: employees.employeeCode,
      fullName: employees.fullName,
      status: attendanceDays.status,
      checkInAt: attendanceDays.checkInAt,
      checkOutAt: attendanceDays.checkOutAt,
      isLate: attendanceDays.isLate,
      isMissedCheckout: attendanceDays.isMissedCheckout,
    })
    .from(attendanceDays)
    .innerJoin(employees, eq(attendanceDays.employeeId, employees.id))
    .where(and(eq(employees.companyId, company.id), eq(attendanceDays.shiftDate, shiftDate)));

  const activeEmployees = await db
    .select({
      employeeCode: employees.employeeCode,
      fullName: employees.fullName,
    })
    .from(employees)
    .where(and(eq(employees.companyId, company.id), eq(employees.isActive, true)))
    .orderBy(employees.fullName);

  const byCode = new Map(rows.map((row) => [row.employeeCode, row]));
  const employeesSummary: AttendanceSnapshotRow[] = activeEmployees.map((employee) => {
    const row = byCode.get(employee.employeeCode);
    if (!row) {
      return {
        employeeCode: employee.employeeCode,
        fullName: employee.fullName,
        status: "no row",
        checkInAt: null,
        checkOutAt: null,
        isLate: false,
        isMissedCheckout: false,
      };
    }

    return {
      employeeCode: row.employeeCode,
      fullName: row.fullName,
      status: effectiveAttendanceStatus(row),
      checkInAt: row.checkInAt?.toISOString() ?? null,
      checkOutAt: row.checkOutAt?.toISOString() ?? null,
      isLate: row.isLate,
      isMissedCheckout: row.isMissedCheckout,
    };
  });

  employeesSummary.sort((left, right) => left.fullName.localeCompare(right.fullName));

  const withCheckIn = employeesSummary.filter((row) => row.checkInAt);
  const withCheckOut = withCheckIn.filter((row) => row.checkOutAt);
  const missingCheckOut = withCheckIn.filter((row) => !row.checkOutAt);
  const missedCheckoutFlagged = missingCheckOut.filter((row) => row.isMissedCheckout);

  return {
    company: company.name,
    shiftDate,
    activeEmployees: employeesSummary.length,
    withCheckIn: withCheckIn.length,
    withoutCheckIn: employeesSummary.length - withCheckIn.length,
    withCheckOut: withCheckOut.length,
    missingCheckOut: missingCheckOut.length,
    missedCheckoutFlagged: missedCheckoutFlagged.length,
    employees: employeesSummary,
  };
}
