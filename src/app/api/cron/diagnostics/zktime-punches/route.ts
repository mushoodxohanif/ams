import { and, eq, gte, inArray, lt, or, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getAttendanceSnapshot } from "@/lib/admin/attendance-snapshot";
import { db } from "@/db";
import { companies, employees, machinePunches } from "@/db/schema";

/** Temporary — remove after recheck. Auth: Bearer token below. */
const DIAGNOSTIC_TOKEN = "ams-zktime-diag-2026-07-24-xorora";

function punchDirection(rawPunchAt: string | null): "in" | "out" | "unknown" {
  const state = (rawPunchAt?.split("|")[1] ?? "").trim().toLowerCase();
  if (state.includes("check out") || state === "checkout") return "out";
  if (state.includes("check in") || state === "checkin") return "in";
  return "unknown";
}

function normalizeCode(code: string): string {
  return code.replace(/^0+/, "") || "0";
}

export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${DIAGNOSTIC_TOKEN}`) {
    return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
  }

  const url = new URL(request.url);
  const companySlug = url.searchParams.get("company") ?? "xorora";
  const shiftDate = url.searchParams.get("date") ?? "2026-07-24";
  const fromDate = url.searchParams.get("from") ?? shiftDate;
  const toDate = url.searchParams.get("to") ?? "2026-07-26";

  const snapshot = await getAttendanceSnapshot(shiftDate, companySlug);

  const [company] = await db
    .select({ id: companies.id, name: companies.name })
    .from(companies)
    .where(eq(companies.slug, companySlug))
    .limit(1);

  if (!company) {
    return NextResponse.json({ error: "Company not found" }, { status: 404 });
  }

  const companyEmployees = await db
    .select({
      id: employees.id,
      employeeCode: employees.employeeCode,
      fullName: employees.fullName,
    })
    .from(employees)
    .where(eq(employees.companyId, company.id));

  const employeeIds = companyEmployees.map((e) => e.id);
  const codes = [...new Set(companyEmployees.map((e) => e.employeeCode))];
  const codeVariants = [
    ...new Set([...codes, ...codes.map(normalizeCode), ...codes.map((c) => c.padStart(3, "0"))]),
  ];

  const punches = await db
    .select({
      punchAt: machinePunches.punchAt,
      rawPunchAt: machinePunches.rawPunchAt,
      cardNo: machinePunches.cardNo,
      machineEmpCode: machinePunches.machineEmpCode,
      machineNo: machinePunches.machineNo,
      employeeId: machinePunches.employeeId,
      sourcePunchId: machinePunches.sourcePunchId,
    })
    .from(machinePunches)
    .where(
      and(
        gte(machinePunches.punchAt, sql`${fromDate}::date AT TIME ZONE 'Asia/Karachi'`),
        lt(machinePunches.punchAt, sql`${toDate}::date AT TIME ZONE 'Asia/Karachi'`),
        or(
          inArray(machinePunches.employeeId, employeeIds),
          inArray(machinePunches.cardNo, codeVariants),
          inArray(machinePunches.machineEmpCode, codeVariants),
        ),
      ),
    )
    .orderBy(machinePunches.punchAt);

  const byCode = new Map(
    companyEmployees.map((e) => [
      e.employeeCode,
      {
        employeeCode: e.employeeCode,
        fullName: e.fullName,
        punches: [] as Array<{
          punchAt: string;
          direction: string;
          rawState: string;
          machineNo: string | null;
        }>,
      },
    ]),
  );

  for (const punch of punches) {
    const match =
      companyEmployees.find((e) => e.id === punch.employeeId) ??
      companyEmployees.find((e) => {
        const left = normalizeCode(e.employeeCode);
        const right = normalizeCode(punch.cardNo);
        const machine = normalizeCode(punch.machineEmpCode ?? "");
        return left === right || left === machine || e.employeeCode === punch.cardNo;
      });
    if (!match) continue;
    byCode.get(match.employeeCode)!.punches.push({
      punchAt: punch.punchAt.toISOString(),
      direction: punchDirection(punch.rawPunchAt),
      rawState: punch.rawPunchAt?.split("|")[1] ?? "",
      machineNo: punch.machineNo,
    });
  }

  const punchSummary = [...byCode.values()]
    .map((row) => ({
      ...row,
      inCount: row.punches.filter((p) => p.direction === "in").length,
      outCount: row.punches.filter((p) => p.direction === "out").length,
      unknownCount: row.punches.filter((p) => p.direction === "unknown").length,
    }))
    .filter((row) => row.punches.length > 0)
    .sort((a, b) => a.fullName.localeCompare(b.fullName));

  const missingCheckout = snapshot.employees.filter((e) => e.checkInAt && !e.checkOutAt);
  const withCheckout = snapshot.employees.filter((e) => e.checkInAt && e.checkOutAt);

  return NextResponse.json({
    checkedAt: new Date().toISOString(),
    attendance: {
      shiftDate,
      withCheckIn: snapshot.withCheckIn,
      withCheckOut: snapshot.withCheckOut,
      missingCheckOut: snapshot.missingCheckOut,
      missedCheckoutFlagged: snapshot.missedCheckoutFlagged,
      missing: missingCheckout.map((e) => ({
        code: e.employeeCode,
        name: e.fullName,
        checkInAt: e.checkInAt,
        isMissedCheckout: e.isMissedCheckout,
      })),
      completed: withCheckout.map((e) => ({
        code: e.employeeCode,
        name: e.fullName,
        checkInAt: e.checkInAt,
        checkOutAt: e.checkOutAt,
      })),
    },
    zktime: {
      fromDate,
      toDate,
      totalPunches: punches.length,
      inCount: punches.filter((p) => punchDirection(p.rawPunchAt) === "in").length,
      outCount: punches.filter((p) => punchDirection(p.rawPunchAt) === "out").length,
      unknownCount: punches.filter((p) => punchDirection(p.rawPunchAt) === "unknown").length,
      employees: punchSummary,
    },
  });
}
