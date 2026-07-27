import { and, eq, gte, inArray, lt, or, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { companies, employees, machinePunches } from "@/db/schema";
import { ZktimeClient } from "@/lib/zktime/client";

/**
 * Temporary ZKTime punch diagnostic. Remove after investigation.
 * Auth: Authorization: Bearer <DIAGNOSTIC_TOKEN>
 *
 * ?live=1 also pulls transactions from the ZKTime bridge since `from` midnight PKT.
 */
const DIAGNOSTIC_TOKEN = "ams-zktime-diag-2026-07-24-xorora";

function punchDirection(rawPunchAt: string | null): "in" | "out" | "unknown" {
  const state = (rawPunchAt?.split("|")[1] ?? "").trim().toLowerCase();
  if (state.includes("check out") || state === "checkout") {
    return "out";
  }
  if (state.includes("check in") || state === "checkin") {
    return "in";
  }
  return "unknown";
}

function directionFromState(state: string | null | undefined): "in" | "out" | "unknown" {
  const normalized = (state ?? "").trim().toLowerCase();
  if (normalized.includes("check out") || normalized === "checkout") {
    return "out";
  }
  if (normalized.includes("check in") || normalized === "checkin") {
    return "in";
  }
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
  const fromDate = url.searchParams.get("from") ?? "2026-07-24";
  const toDate = url.searchParams.get("to") ?? "2026-07-26";
  const live = url.searchParams.get("live") === "1";

  if (!/^\d{4}-\d{2}-\d{2}$/.test(fromDate) || !/^\d{4}-\d{2}-\d{2}$/.test(toDate)) {
    return NextResponse.json(
      { error: "from/to must be YYYY-MM-DD", code: "INVALID_DATE" },
      { status: 400 },
    );
  }

  const [company] = await db
    .select({ id: companies.id, name: companies.name })
    .from(companies)
    .where(eq(companies.slug, companySlug))
    .limit(1);

  if (!company) {
    return NextResponse.json({ error: "Company not found", code: "NOT_FOUND" }, { status: 404 });
  }

  const companyEmployees = await db
    .select({
      id: employees.id,
      employeeCode: employees.employeeCode,
      fullName: employees.fullName,
      isActive: employees.isActive,
    })
    .from(employees)
    .where(eq(employees.companyId, company.id));

  const employeeIds = companyEmployees.map((row) => row.id);
  const codes = [...new Set(companyEmployees.map((row) => row.employeeCode))];
  const codeVariants = [
    ...new Set([
      ...codes,
      ...codes.map(normalizeCode),
      ...codes.map((code) => code.padStart(3, "0")),
    ]),
  ];
  const codeSet = new Set(codeVariants.map(normalizeCode));

  if (employeeIds.length === 0) {
    return NextResponse.json({
      company: company.name,
      companySlug,
      fromDate,
      toDate,
      totalPunches: 0,
      employees: [],
      unlinked: [],
    });
  }

  const punches = await db
    .select({
      id: machinePunches.id,
      punchAt: machinePunches.punchAt,
      rawPunchAt: machinePunches.rawPunchAt,
      cardNo: machinePunches.cardNo,
      machineEmpCode: machinePunches.machineEmpCode,
      machineEmpName: machinePunches.machineEmpName,
      machineNo: machinePunches.machineNo,
      employeeId: machinePunches.employeeId,
      sourcePunchId: machinePunches.sourcePunchId,
      syncedAt: machinePunches.syncedAt,
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

  const byEmployee = new Map(
    companyEmployees.map((employee) => [
      employee.id,
      {
        employeeCode: employee.employeeCode,
        fullName: employee.fullName,
        isActive: employee.isActive,
        punches: [] as Array<{
          punchAt: string;
          direction: "in" | "out" | "unknown";
          rawState: string;
          cardNo: string;
          machineNo: string | null;
          linked: boolean;
          sourcePunchId: number;
        }>,
      },
    ]),
  );

  const unlinked: Array<{
    punchAt: string;
    direction: "in" | "out" | "unknown";
    rawState: string;
    cardNo: string;
    machineEmpCode: string | null;
    machineEmpName: string | null;
    sourcePunchId: number;
  }> = [];

  for (const punch of punches) {
    const rawState = punch.rawPunchAt?.split("|")[1] ?? "";
    const entry = {
      punchAt: punch.punchAt.toISOString(),
      direction: punchDirection(punch.rawPunchAt),
      rawState,
      cardNo: punch.cardNo,
      machineNo: punch.machineNo,
      linked: Boolean(punch.employeeId),
      sourcePunchId: punch.sourcePunchId,
    };

    if (punch.employeeId && byEmployee.has(punch.employeeId)) {
      byEmployee.get(punch.employeeId)!.punches.push(entry);
      continue;
    }

    const match = companyEmployees.find((employee) => {
      const left = normalizeCode(employee.employeeCode);
      const right = normalizeCode(punch.cardNo);
      const machine = normalizeCode(punch.machineEmpCode ?? "");
      return (
        employee.employeeCode === punch.cardNo ||
        left === right ||
        employee.employeeCode === punch.machineEmpCode ||
        left === machine
      );
    });

    if (match) {
      byEmployee.get(match.id)!.punches.push(entry);
    } else {
      unlinked.push({
        punchAt: entry.punchAt,
        direction: entry.direction,
        rawState: entry.rawState,
        cardNo: punch.cardNo,
        machineEmpCode: punch.machineEmpCode,
        machineEmpName: punch.machineEmpName,
        sourcePunchId: punch.sourcePunchId,
      });
    }
  }

  const employeesSummary = [...byEmployee.values()]
    .map((row) => {
      const ins = row.punches.filter((punch) => punch.direction === "in").length;
      const outs = row.punches.filter((punch) => punch.direction === "out").length;
      const unknowns = row.punches.filter((punch) => punch.direction === "unknown").length;
      return {
        ...row,
        punchCount: row.punches.length,
        inCount: ins,
        outCount: outs,
        unknownCount: unknowns,
        hasOutPunch: outs > 0,
      };
    })
    .sort((left, right) => left.fullName.localeCompare(right.fullName));

  let liveBridge: {
    fetched: number;
    companyMatched: number;
    inCount: number;
    outCount: number;
    unknownCount: number;
    outPunches: Array<{
      empCode: string;
      punchTime: string;
      state: string;
      terminalSn: string | null;
    }>;
    sampleStates: string[];
  } | null = null;

  if (live) {
    const client = ZktimeClient.tryFromEnv();
    if (!client) {
      return NextResponse.json(
        { error: "ZKTime is not configured", code: "ZKTIME_NOT_CONFIGURED" },
        { status: 500 },
      );
    }

    const since = `${fromDate} 00:00:00`;
    const exportResult = await client.exportTransactions(since);
    const matched = exportResult.transactions.filter((tx) =>
      codeSet.has(normalizeCode(tx.emp_code)),
    );
    const withDirection = matched.map((tx) => ({
      empCode: tx.emp_code,
      punchTime: tx.punch_time,
      state: tx.punch_state_display ?? "",
      terminalSn: tx.terminal_sn ?? null,
      direction: directionFromState(tx.punch_state_display),
    }));

    const toCutoff = `${toDate} 00:00:00`;
    const inWindow = withDirection.filter((tx) => tx.punchTime < toCutoff);
    const outPunches = inWindow
      .filter((tx) => tx.direction === "out")
      .map(({ empCode, punchTime, state, terminalSn }) => ({
        empCode,
        punchTime,
        state,
        terminalSn,
      }));

    const stateCounts = new Map<string, number>();
    for (const tx of inWindow) {
      const key = tx.state || "(empty)";
      stateCounts.set(key, (stateCounts.get(key) ?? 0) + 1);
    }

    liveBridge = {
      fetched: exportResult.transactions.length,
      companyMatched: inWindow.length,
      inCount: inWindow.filter((tx) => tx.direction === "in").length,
      outCount: outPunches.length,
      unknownCount: inWindow.filter((tx) => tx.direction === "unknown").length,
      outPunches,
      sampleStates: [...stateCounts.entries()]
        .sort((left, right) => right[1] - left[1])
        .slice(0, 12)
        .map(([state, count]) => `${state}: ${count}`),
    };
  }

  return NextResponse.json({
    company: company.name,
    companySlug,
    fromDate,
    toDate,
    timezone: "Asia/Karachi",
    totalPunches: punches.length,
    employeesWithOutPunch: employeesSummary.filter((row) => row.hasOutPunch).length,
    employeesWithPunchesButNoOut: employeesSummary.filter(
      (row) => row.punchCount > 0 && !row.hasOutPunch,
    ).length,
    employeesWithNoPunches: employeesSummary.filter((row) => row.punchCount === 0).length,
    unlinkedPunchCount: unlinked.length,
    employees: employeesSummary,
    unlinked,
    liveBridge,
  });
}
