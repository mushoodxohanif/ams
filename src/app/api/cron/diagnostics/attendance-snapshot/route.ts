import { NextResponse } from "next/server";
import { getAttendanceSnapshot } from "@/lib/admin/attendance-snapshot";

/**
 * Temporary one-shot attendance diagnostic. Remove after investigation.
 * Auth: Authorization: Bearer <DIAGNOSTIC_TOKEN>
 */
const DIAGNOSTIC_TOKEN = "ams-att-diag-2026-07-24-xorora-check";

export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${DIAGNOSTIC_TOKEN}`) {
    return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
  }

  const url = new URL(request.url);
  const shiftDate = url.searchParams.get("date") ?? "2026-07-24";
  const company = url.searchParams.get("company") ?? "xorora";

  if (!/^\d{4}-\d{2}-\d{2}$/.test(shiftDate)) {
    return NextResponse.json(
      { error: "date must be YYYY-MM-DD", code: "INVALID_SHIFT_DATE" },
      { status: 400 },
    );
  }

  try {
    const snapshot = await getAttendanceSnapshot(shiftDate, company);
    const missing = snapshot.employees.filter((row) => row.checkInAt && !row.checkOutAt);
    return NextResponse.json({
      ...snapshot,
      missingCheckOutEmployees: missing.map((row) => ({
        employeeCode: row.employeeCode,
        fullName: row.fullName,
        checkInAt: row.checkInAt,
        isMissedCheckout: row.isMissedCheckout,
        status: row.status,
      })),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to load attendance snapshot",
        code: "SNAPSHOT_FAILED",
      },
      { status: 500 },
    );
  }
}
