import { formatInTimeZone } from "date-fns-tz";
import { and, count, desc, eq, gte, lte, type SQL } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import { db } from "@/db";
import { attendanceDays, companies, employees, leaveRequests } from "@/db/schema";
import { formatProbationEndDate, isCurrentlyOnProbation } from "@/lib/admin/probation";
import { adminFailure, type ServiceFailure, type ServiceSuccess } from "@/lib/admin/types";
import { BUSINESS_TIMEZONE } from "@/lib/attendance/constants";
import {
  isClosedShiftDate,
  type CompanyShiftConfig,
} from "@/lib/attendance/company-shift";
import { loadEmployeeShiftContext } from "@/lib/attendance/employee-shift";
import { ENTITLED_LEAVE_TYPES, LEAVE_ENTITLEMENTS } from "./constants";
import { leaveTypeLabel } from "./display";
import type { LeaveApplicationPdfData } from "./leave-pdf";
import type {
  EmployeeLeaveBalanceSummary,
  LeaveBalance,
  LeaveRequestStatus,
  LeaveType,
  UnpaidLeaveSummary,
} from "./types";
import {
  countCalendarDays,
  countWorkingDaysForCompany,
  eachDateInRange,
} from "./working-days";
import { createNotificationForEmployee } from "@/lib/notifications/service";

export type LeaveListItem = {
  id: string;
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  employeeEmail: string;
  employeeDesignation: string | null;
  employeeDepartment: string | null;
  leaveType: LeaveType;
  startDate: string;
  endDate: string;
  daysCount: number;
  reason: string;
  medicalCertificateNote: string | null;
  status: LeaveRequestStatus;
  reviewedByUserId: string | null;
  reviewedAt: Date | null;
  reviewNotes: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type SubmitLeaveInput = {
  leaveType: LeaveType;
  startDate: string;
  endDate: string;
  reason: string;
  medicalCertificateNote?: string | null;
};

function parseDaysCount(value: string | number): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function formatDaysCountForDb(value: number): string {
  return value.toFixed(1);
}

export type ListLeaveFilters = {
  employeeId?: string;
  companyId?: string;
  status?: LeaveRequestStatus;
  leaveType?: LeaveType;
  year?: number;
};

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function getCurrentYear(): number {
  return Number.parseInt(formatInTimeZone(new Date(), BUSINESS_TIMEZONE, "yyyy"), 10);
}

function validateDateRange(
  startDate: string,
  endDate: string,
): ServiceFailure | ServiceSuccess<{ startDate: string; endDate: string }> {
  if (!DATE_PATTERN.test(startDate) || !DATE_PATTERN.test(endDate)) {
    return adminFailure(400, "INVALID_DATE", "Dates must be YYYY-MM-DD.");
  }
  if (endDate < startDate) {
    return adminFailure(400, "INVALID_DATE_RANGE", "End date cannot be before start date.");
  }
  return { ok: true, data: { startDate, endDate } };
}

function countLeaveDays(
  leaveType: LeaveType,
  startDate: string,
  endDate: string,
  shiftConfig: CompanyShiftConfig,
  companySlug: string,
): number {
  const config = LEAVE_ENTITLEMENTS[leaveType];
  return config.workingDaysOnly
    ? countWorkingDaysForCompany(startDate, endDate, shiftConfig, companySlug)
    : countCalendarDays(startDate, endDate);
}

function getLeaveDatesForAttendance(
  leaveType: LeaveType,
  startDate: string,
  endDate: string,
  shiftConfig: CompanyShiftConfig,
  companySlug: string,
): string[] {
  const config = LEAVE_ENTITLEMENTS[leaveType];
  const allDates = eachDateInRange(startDate, endDate);

  if (!config.workingDaysOnly) {
    return allDates;
  }

  return allDates.filter((date) => !isClosedShiftDate(date, shiftConfig, companySlug));
}

async function getEmployeeShiftContext(
  employeeId: string,
): Promise<{ config: CompanyShiftConfig; companySlug: string }> {
  return loadEmployeeShiftContext(employeeId);
}


function mapLeaveRow(
  row: typeof leaveRequests.$inferSelect,
  employee: typeof employees.$inferSelect,
): LeaveListItem {
  return {
    id: row.id,
    employeeId: row.employeeId,
    employeeCode: employee.employeeCode,
    employeeName: employee.fullName,
    employeeEmail: employee.email,
    employeeDesignation: employee.designation,
    employeeDepartment: employee.department,
    leaveType: row.leaveType,
    startDate: row.startDate,
    endDate: row.endDate,
    daysCount: parseDaysCount(row.daysCount),
    reason: row.reason,
    medicalCertificateNote: row.medicalCertificateNote,
    status: row.status,
    reviewedByUserId: row.reviewedByUserId,
    reviewedAt: row.reviewedAt,
    reviewNotes: row.reviewNotes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function getEmployeeForLeave(
  employeeId: string,
  options?: { allowInactive?: boolean },
): Promise<ServiceFailure | ServiceSuccess<typeof employees.$inferSelect>> {
  const [employee] = await db.select().from(employees).where(eq(employees.id, employeeId)).limit(1);
  if (!employee) {
    return adminFailure(404, "EMPLOYEE_NOT_FOUND", "Employee not found.");
  }
  if (!employee.isActive && !options?.allowInactive) {
    return adminFailure(403, "EMPLOYEE_INACTIVE", "Your employee account is inactive.");
  }
  return { ok: true, data: employee };
}

async function loadLeaveItem(id: string): Promise<ServiceFailure | ServiceSuccess<LeaveListItem>> {
  const [row] = await db.select().from(leaveRequests).where(eq(leaveRequests.id, id)).limit(1);
  if (!row) {
    return adminFailure(404, "LEAVE_NOT_FOUND", "Leave request not found.");
  }

  const [employee] = await db
    .select()
    .from(employees)
    .where(eq(employees.id, row.employeeId))
    .limit(1);
  if (!employee) {
    return adminFailure(404, "EMPLOYEE_NOT_FOUND", "Employee not found.");
  }

  return { ok: true, data: mapLeaveRow(row, employee) };
}

export async function getLeaveRequestForPdf(
  id: string,
  companyId?: string,
): Promise<ServiceFailure | ServiceSuccess<LeaveApplicationPdfData>> {
  const [row] = await db.select().from(leaveRequests).where(eq(leaveRequests.id, id)).limit(1);
  if (!row) {
    return adminFailure(404, "LEAVE_NOT_FOUND", "Leave request not found.");
  }

  const [employee] = await db
    .select()
    .from(employees)
    .where(eq(employees.id, row.employeeId))
    .limit(1);
  if (!employee) {
    return adminFailure(404, "EMPLOYEE_NOT_FOUND", "Employee not found.");
  }

  if (companyId && employee.companyId !== companyId) {
    return adminFailure(403, "FORBIDDEN", "Leave request is not in the selected company.");
  }

  const [company] = await db
    .select({ name: companies.name })
    .from(companies)
    .where(eq(companies.id, employee.companyId))
    .limit(1);

  if (!company) {
    return adminFailure(404, "COMPANY_NOT_FOUND", "Employee company not found.");
  }

  const leaveYear = Number.parseInt(row.startDate.slice(0, 4), 10);
  const balancesResult = await getLeaveBalances(row.employeeId, leaveYear, { allowInactive: true });
  if (!balancesResult.ok) {
    return balancesResult;
  }

  return {
    ok: true,
    data: {
      companyName: company.name,
      employeeName: employee.fullName,
      employeeCode: employee.employeeCode,
      designation: employee.designation,
      department: employee.department,
      startDate: row.startDate,
      endDate: row.endDate,
      daysCount: parseDaysCount(row.daysCount),
      leaveType: row.leaveType,
      reason: row.reason,
      medicalCertificateNote: row.medicalCertificateNote,
      balances: balancesResult.data,
    },
  };
}

function buildListConditions(filters: ListLeaveFilters): SQL[] {
  const conditions: SQL[] = [];
  const year = filters.year ?? getCurrentYear();
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;

  conditions.push(gte(leaveRequests.startDate, yearStart));
  conditions.push(lte(leaveRequests.startDate, yearEnd));

  if (filters.employeeId) {
    conditions.push(eq(leaveRequests.employeeId, filters.employeeId));
  }
  if (filters.companyId) {
    conditions.push(eq(employees.companyId, filters.companyId));
  }
  if (filters.status) {
    conditions.push(eq(leaveRequests.status, filters.status));
  }
  if (filters.leaveType) {
    conditions.push(eq(leaveRequests.leaveType, filters.leaveType));
  }

  return conditions;
}

export async function listLeaveRequests(
  filters: ListLeaveFilters = {},
): Promise<ServiceSuccess<LeaveListItem[]>> {
  const conditions = buildListConditions(filters);
  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const rows = await db
    .select({ request: leaveRequests, employee: employees })
    .from(leaveRequests)
    .innerJoin(employees, eq(leaveRequests.employeeId, employees.id))
    .where(whereClause)
    .orderBy(desc(leaveRequests.createdAt));

  return {
    ok: true,
    data: rows.map(({ request, employee }) => mapLeaveRow(request, employee)),
  };
}

/** Pending leave requests needing admin review (company-scoped when provided). */
export async function countPendingLeaveRequests(companyId?: string | null): Promise<number> {
  const conditions = [eq(leaveRequests.status, "pending")];
  if (companyId) {
    conditions.push(eq(employees.companyId, companyId));
  }

  const [row] = await db
    .select({ value: count() })
    .from(leaveRequests)
    .innerJoin(employees, eq(leaveRequests.employeeId, employees.id))
    .where(and(...conditions));

  return row?.value ?? 0;
}

/** Cross-request cache for sidebar badge (invalidated via updateTag on leave actions). */
export async function countPendingLeaveRequestsCached(
  companyId?: string | null,
): Promise<number> {
  const key = companyId ?? "all";
  return unstable_cache(
    () => countPendingLeaveRequests(companyId),
    ["pending-leave-count", key],
    { revalidate: 30, tags: ["pending-leave"] },
  )();
}

type LeaveRequestForBalance = Pick<LeaveListItem, "leaveType" | "status" | "daysCount">;

type LeaveRequestForUnpaidSummary = Pick<
  LeaveListItem,
  "leaveType" | "status" | "daysCount" | "startDate" | "endDate"
>;

export function computeUnpaidLeaveSummary(
  requests: LeaveRequestForUnpaidSummary[],
  probationStart: string,
  probationEnd: string,
): UnpaidLeaveSummary {
  const relevant = requests.filter(
    (request) =>
      request.leaveType === "unpaid" &&
      (request.status === "approved" || request.status === "pending") &&
      request.startDate <= probationEnd &&
      request.endDate >= probationStart,
  );

  const used = relevant
    .filter((request) => request.status === "approved")
    .reduce((sum, request) => sum + request.daysCount, 0);

  const pending = relevant
    .filter((request) => request.status === "pending")
    .reduce((sum, request) => sum + request.daysCount, 0);

  return { used, pending, total: used + pending };
}

export async function getUnpaidLeaveSummary(
  employeeId: string,
): Promise<ServiceFailure | ServiceSuccess<UnpaidLeaveSummary>> {
  const employeeResult = await getEmployeeForLeave(employeeId);
  if (!employeeResult.ok) {
    return employeeResult;
  }

  const employee = employeeResult.data;
  if (!isCurrentlyOnProbation(employee) || !employee.probationStartDate) {
    return { ok: true, data: { used: 0, pending: 0, total: 0 } };
  }

  const probationStart = employee.probationStartDate;
  const probationEnd = formatProbationEndDate(
    employee.probationStartDate,
    employee.probationPeriodMonths,
  );

  const requestsResult = await listLeaveRequests({ employeeId });
  return {
    ok: true,
    data: computeUnpaidLeaveSummary(requestsResult.data, probationStart, probationEnd),
  };
}

export function computeLeaveBalances(requests: LeaveRequestForBalance[]): LeaveBalance[] {
  return ENTITLED_LEAVE_TYPES.map((leaveType) => {
    const entitled = LEAVE_ENTITLEMENTS[leaveType].annualDays;
    const relevant = requests.filter((request) => request.leaveType === leaveType);

    const used = relevant
      .filter((request) => request.status === "approved")
      .reduce((sum, request) => sum + request.daysCount, 0);

    const pending = relevant
      .filter((request) => request.status === "pending")
      .reduce((sum, request) => sum + request.daysCount, 0);

    return {
      leaveType,
      entitled,
      used,
      pending,
      remaining: Math.max(0, entitled - used - pending),
    };
  });
}

export async function getLeaveBalances(
  employeeId: string,
  year = getCurrentYear(),
  options?: { allowInactive?: boolean },
): Promise<ServiceFailure | ServiceSuccess<LeaveBalance[]>> {
  const employeeResult = await getEmployeeForLeave(employeeId, options);
  if (!employeeResult.ok) {
    return employeeResult;
  }

  const requestsResult = await listLeaveRequests({ employeeId, year });
  return { ok: true, data: computeLeaveBalances(requestsResult.data) };
}

export async function listCompanyLeaveBalances(
  companyId: string,
  year = getCurrentYear(),
  options?: { includeInactive?: boolean },
): Promise<ServiceSuccess<EmployeeLeaveBalanceSummary[]>> {
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;
  const employeeFilter = options?.includeInactive
    ? eq(employees.companyId, companyId)
    : and(eq(employees.companyId, companyId), eq(employees.isActive, true));

  const [employeeRows, requestRows] = await Promise.all([
    db
      .select({
        id: employees.id,
        employeeCode: employees.employeeCode,
        fullName: employees.fullName,
      })
      .from(employees)
      .where(employeeFilter)
      .orderBy(employees.fullName),
    db
      .select({
        employeeId: leaveRequests.employeeId,
        leaveType: leaveRequests.leaveType,
        status: leaveRequests.status,
        daysCount: leaveRequests.daysCount,
      })
      .from(leaveRequests)
      .innerJoin(employees, eq(leaveRequests.employeeId, employees.id))
      .where(
        and(
          eq(employees.companyId, companyId),
          gte(leaveRequests.startDate, yearStart),
          lte(leaveRequests.startDate, yearEnd),
        ),
      ),
  ]);

  const requestsByEmployee = new Map<string, LeaveRequestForBalance[]>();
  for (const row of requestRows) {
    const existing = requestsByEmployee.get(row.employeeId) ?? [];
    existing.push({
      leaveType: row.leaveType,
      status: row.status,
      daysCount: parseDaysCount(row.daysCount),
    });
    requestsByEmployee.set(row.employeeId, existing);
  }

  return {
    ok: true,
    data: employeeRows.map((employee) => ({
      employeeId: employee.id,
      employeeCode: employee.employeeCode,
      employeeName: employee.fullName,
      balances: computeLeaveBalances(requestsByEmployee.get(employee.id) ?? []),
    })),
  };
}

async function validateLeaveSubmission(
  employeeId: string,
  input: SubmitLeaveInput,
): Promise<ServiceFailure | ServiceSuccess<{ daysCount: number }>> {
  const employeeResult = await getEmployeeForLeave(employeeId);
  if (!employeeResult.ok) {
    return employeeResult;
  }

  const onProbation = isCurrentlyOnProbation(employeeResult.data);

  if (onProbation && input.leaveType !== "unpaid") {
    return adminFailure(
      403,
      "PROBATION_UNPAID_ONLY",
      "During probation, only unpaid leave can be requested. Entitled leave is available after probation is completed.",
    );
  }

  if (!onProbation && input.leaveType === "unpaid") {
    return adminFailure(
      400,
      "UNPAID_NOT_ALLOWED",
      "Unpaid leave is only available during probation.",
    );
  }

  const dateResult = validateDateRange(input.startDate, input.endDate);
  if (!dateResult.ok) {
    return dateResult;
  }

  const reason = input.reason.trim();
  if (!reason) {
    return adminFailure(400, "REASON_REQUIRED", "Please provide a reason for your leave request.");
  }

  const config = LEAVE_ENTITLEMENTS[input.leaveType];
  if (config.requiresMedicalCertificate) {
    const note = input.medicalCertificateNote?.trim();
    if (!note) {
      return adminFailure(
        400,
        "MEDICAL_CERTIFICATE_REQUIRED",
        "Sick leave requires a medical certificate reference or note.",
      );
    }
  }

  const { config: shiftConfig, companySlug } = await loadEmployeeShiftContext(employeeId);

  const daysCount = countLeaveDays(
    input.leaveType,
    input.startDate,
    input.endDate,
    shiftConfig,
    companySlug,
  );
  if (daysCount === 0) {
    return adminFailure(
      400,
      "NO_LEAVE_DAYS",
      input.leaveType === "annual" || input.leaveType === "unpaid"
        ? "The selected range contains no working days."
        : "The selected date range is invalid.",
    );
  }

  if (input.leaveType !== "unpaid") {
    const leaveYear = Number.parseInt(input.startDate.slice(0, 4), 10);
    const balancesResult = await getLeaveBalances(employeeId, leaveYear);
    if (!balancesResult.ok) {
      return balancesResult;
    }

    const balance = balancesResult.data.find((item) => item.leaveType === input.leaveType);
    if (!balance || daysCount > balance.remaining) {
      return adminFailure(
        400,
        "INSUFFICIENT_BALANCE",
        `Insufficient ${input.leaveType} leave balance. Requested ${daysCount} day(s), ${balance?.remaining ?? 0} remaining.`,
      );
    }
  }

  const overlapResult = await listLeaveRequests({ employeeId });
  const hasOverlap = overlapResult.data.some(
    (request) =>
      (request.status === "pending" || request.status === "approved") &&
      input.startDate <= request.endDate &&
      input.endDate >= request.startDate,
  );
  if (hasOverlap) {
    return adminFailure(
      409,
      "OVERLAPPING_LEAVE",
      "You already have a pending or approved leave request overlapping these dates.",
    );
  }

  return { ok: true, data: { daysCount } };
}

async function syncApprovedLeaveToAttendance(
  request: LeaveListItem,
  editedByUserId: string | null,
): Promise<void> {
  const { config: shiftConfig, companySlug } = await getEmployeeShiftContext(request.employeeId);
  const shiftDates = getLeaveDatesForAttendance(
    request.leaveType,
    request.startDate,
    request.endDate,
    shiftConfig,
    companySlug,
  );
  const now = new Date();

  for (const shiftDate of shiftDates) {
    const [existing] = await db
      .select()
      .from(attendanceDays)
      .where(
        and(
          eq(attendanceDays.employeeId, request.employeeId),
          eq(attendanceDays.shiftDate, shiftDate),
        ),
      )
      .limit(1);

    if (existing) {
      await db
        .update(attendanceDays)
        .set({
          status: "leave",
          source: "manual",
          editedByUserId,
          notes: `Leave: ${request.leaveType} (${request.id})`,
          updatedAt: now,
        })
        .where(eq(attendanceDays.id, existing.id));
    } else {
      await db.insert(attendanceDays).values({
        employeeId: request.employeeId,
        shiftDate,
        status: "leave",
        source: "manual",
        editedByUserId,
        notes: `Leave: ${request.leaveType} (${request.id})`,
        createdAt: now,
        updatedAt: now,
      });
    }
  }
}

export async function submitLeaveRequest(
  employeeId: string,
  input: SubmitLeaveInput,
): Promise<ServiceFailure | ServiceSuccess<LeaveListItem>> {
  const validation = await validateLeaveSubmission(employeeId, input);
  if (!validation.ok) {
    return validation;
  }

  const employeeResult = await getEmployeeForLeave(employeeId);
  if (!employeeResult.ok) {
    return employeeResult;
  }

  const config = LEAVE_ENTITLEMENTS[input.leaveType];
  const initialStatus: LeaveRequestStatus = config.requiresApproval ? "pending" : "approved";
  const now = new Date();

  const [created] = await db
    .insert(leaveRequests)
    .values({
      employeeId,
      leaveType: input.leaveType,
      startDate: input.startDate,
      endDate: input.endDate,
      daysCount: formatDaysCountForDb(validation.data.daysCount),
      reason: input.reason.trim(),
      medicalCertificateNote: input.medicalCertificateNote?.trim() || null,
      status: initialStatus,
      reviewedAt: initialStatus === "approved" ? now : null,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  const item = mapLeaveRow(created, employeeResult.data);

  if (initialStatus === "approved") {
    await syncApprovedLeaveToAttendance(item, employeeResult.data.userId);
  }

  return { ok: true, data: item };
}

export async function cancelLeaveRequest(
  employeeId: string,
  id: string,
): Promise<ServiceFailure | ServiceSuccess<LeaveListItem>> {
  const current = await loadLeaveItem(id);
  if (!current.ok) {
    return current;
  }

  if (current.data.employeeId !== employeeId) {
    return adminFailure(403, "FORBIDDEN", "You can only cancel your own leave requests.");
  }

  if (current.data.status !== "pending") {
    return adminFailure(400, "INVALID_STATUS", "Only pending leave requests can be cancelled.");
  }

  const now = new Date();
  const [updated] = await db
    .update(leaveRequests)
    .set({ status: "cancelled", updatedAt: now })
    .where(eq(leaveRequests.id, id))
    .returning();

  const [employee] = await db
    .select()
    .from(employees)
    .where(eq(employees.id, updated.employeeId))
    .limit(1);

  if (!employee) {
    return adminFailure(404, "EMPLOYEE_NOT_FOUND", "Employee not found.");
  }

  return { ok: true, data: mapLeaveRow(updated, employee) };
}

export async function approveLeaveRequest(
  adminUserId: string,
  id: string,
  reviewNotes?: string | null,
): Promise<ServiceFailure | ServiceSuccess<LeaveListItem>> {
  const current = await loadLeaveItem(id);
  if (!current.ok) {
    return current;
  }

  if (current.data.status !== "pending") {
    return adminFailure(400, "INVALID_STATUS", "Only pending leave requests can be approved.");
  }

  if (current.data.leaveType !== "unpaid") {
    const leaveYear = Number.parseInt(current.data.startDate.slice(0, 4), 10);
    const balancesResult = await getLeaveBalances(current.data.employeeId, leaveYear);
    if (!balancesResult.ok) {
      return balancesResult;
    }

    const balance = balancesResult.data.find((item) => item.leaveType === current.data.leaveType);
    if (!balance || current.data.daysCount > balance.remaining) {
      return adminFailure(
        400,
        "INSUFFICIENT_BALANCE",
        "Employee no longer has sufficient leave balance for this request.",
      );
    }
  }

  const now = new Date();
  const [updated] = await db
    .update(leaveRequests)
    .set({
      status: "approved",
      reviewedByUserId: adminUserId,
      reviewedAt: now,
      reviewNotes: reviewNotes?.trim() || null,
      updatedAt: now,
    })
    .where(eq(leaveRequests.id, id))
    .returning();

  const [employee] = await db
    .select()
    .from(employees)
    .where(eq(employees.id, updated.employeeId))
    .limit(1);

  if (!employee) {
    return adminFailure(404, "EMPLOYEE_NOT_FOUND", "Employee not found.");
  }

  const item = mapLeaveRow(updated, employee);
  await syncApprovedLeaveToAttendance(item, adminUserId);

  return { ok: true, data: item };
}

export async function rejectLeaveRequest(
  adminUserId: string,
  id: string,
  reviewNotes: string,
): Promise<ServiceFailure | ServiceSuccess<LeaveListItem>> {
  const current = await loadLeaveItem(id);
  if (!current.ok) {
    return current;
  }

  if (current.data.status !== "pending") {
    return adminFailure(400, "INVALID_STATUS", "Only pending leave requests can be rejected.");
  }

  const reason = reviewNotes.trim();
  if (!reason) {
    return adminFailure(
      400,
      "REJECTION_REASON_REQUIRED",
      "Please provide a reason for rejecting this leave request.",
    );
  }

  const now = new Date();
  const [updated] = await db
    .update(leaveRequests)
    .set({
      status: "rejected",
      reviewedByUserId: adminUserId,
      reviewedAt: now,
      reviewNotes: reason,
      updatedAt: now,
    })
    .where(eq(leaveRequests.id, id))
    .returning();

  const [employee] = await db
    .select()
    .from(employees)
    .where(eq(employees.id, updated.employeeId))
    .limit(1);

  if (!employee) {
    return adminFailure(404, "EMPLOYEE_NOT_FOUND", "Employee not found.");
  }

  const item = mapLeaveRow(updated, employee);

  const typeLabel = leaveTypeLabel(item.leaveType);
  try {
    await createNotificationForEmployee(item.employeeId, {
      type: "leave_rejected",
      title: `${typeLabel} rejected`,
      body: reason,
      href: "/leave",
    });
  } catch (error) {
    console.error("[leave] failed to create rejection notification", error);
  }

  return { ok: true, data: item };
}

async function clearLeaveFromAttendance(request: LeaveListItem): Promise<number> {
  const { config: shiftConfig, companySlug } = await getEmployeeShiftContext(request.employeeId);
  const shiftDates = getLeaveDatesForAttendance(
    request.leaveType,
    request.startDate,
    request.endDate,
    shiftConfig,
    companySlug,
  );
  const noteMarker = `(${request.id})`;
  let cleared = 0;

  for (const shiftDate of shiftDates) {
    const [existing] = await db
      .select()
      .from(attendanceDays)
      .where(
        and(
          eq(attendanceDays.employeeId, request.employeeId),
          eq(attendanceDays.shiftDate, shiftDate),
        ),
      )
      .limit(1);

    if (!existing) {
      continue;
    }

    const notes = existing.notes ?? "";
    const isLeaveMark =
      existing.status === "leave" && (notes.includes(noteMarker) || notes.startsWith("Leave:"));
    if (!isLeaveMark) {
      continue;
    }

    // Synthetic leave-only rows: remove. Otherwise clear leave status.
    if (existing.source === "manual" && !existing.checkInAt && !existing.checkOutAt) {
      await db.delete(attendanceDays).where(eq(attendanceDays.id, existing.id));
    } else {
      await db
        .update(attendanceDays)
        .set({
          status: "absent",
          notes: null,
          updatedAt: new Date(),
        })
        .where(eq(attendanceDays.id, existing.id));
    }
    cleared += 1;
  }

  return cleared;
}

/**
 * Permanently delete a leave request and restore its days to the leave pool.
 * Balance is computed from approved/pending rows, so deletion restores remaining days.
 * Also clears attendance days synced from an approved leave.
 */
export async function deleteLeaveRequest(
  id: string,
): Promise<ServiceFailure | ServiceSuccess<{ deleted: LeaveListItem; attendanceCleared: number }>> {
  const current = await loadLeaveItem(id);
  if (!current.ok) {
    return current;
  }

  const attendanceCleared =
    current.data.status === "approved" ? await clearLeaveFromAttendance(current.data) : 0;

  await db.delete(leaveRequests).where(eq(leaveRequests.id, id));

  return {
    ok: true,
    data: { deleted: current.data, attendanceCleared },
  };
}
