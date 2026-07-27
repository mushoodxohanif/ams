import {
  type AnyPgColumn,
  boolean,
  date,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const userRoleEnum = pgEnum("user_role", ["admin", "employee", "accounting_admin"]);
export type UserRole = (typeof userRoleEnum.enumValues)[number];
export const attendanceStatusEnum = pgEnum("attendance_status", [
  "present",
  "absent",
  "leave",
  "weekend_off",
]);
export const attendanceSourceEnum = pgEnum("attendance_source", ["auto", "manual", "system"]);
export const leaveTypeEnum = pgEnum("leave_type", ["annual", "casual", "sick", "unpaid"]);
export const leaveRequestStatusEnum = pgEnum("leave_request_status", [
  "pending",
  "approved",
  "rejected",
  "cancelled",
]);
export const lateRelaxationStatusEnum = pgEnum("late_relaxation_status", [
  "pending",
  "approved",
  "rejected",
  "cancelled",
]);
export const machinePunchSourceEnum = pgEnum("machine_punch_source", ["ebio", "zkteco", "wdms"]);

/** Per-employee shift: afternoon/evening (Xorora), day/evening (Crest LED). */
export type EmployeeShiftPreset = "afternoon" | "evening" | "day";
/** @deprecated Prefer EmployeeShiftPreset — kept for existing call sites. */
export type XororaShiftPreset = EmployeeShiftPreset;

export const companies = pgTable("companies", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull().unique(),
  slug: text("slug").notNull().unique(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const employees = pgTable("employees", {
  id: uuid("id").defaultRandom().primaryKey(),
  employeeCode: text("employee_code").notNull().unique(),
  fullName: text("full_name").notNull(),
  email: text("email").notNull().unique(),
  department: text("department"),
  designation: text("designation"),
  companyId: uuid("company_id")
    .notNull()
    .references((): AnyPgColumn => companies.id),
  isActive: boolean("is_active").notNull().default(true),
  probationEnabled: boolean("probation_enabled").notNull().default(false),
  probationCompleted: boolean("probation_completed").notNull().default(false),
  probationStartDate: date("probation_start_date"),
  probationPeriodMonths: integer("probation_period_months").notNull().default(3),
  /**
   * Per-employee shift override.
   * Xorora: `afternoon` (3pm–12am, break 7–8pm) or `evening` (6pm–3am, break 10–11pm).
   * Crest LED: `day` (9am–5pm) or `evening` (6pm–3am).
   * Null uses the company default.
   */
  shiftPreset: text("shift_preset").$type<EmployeeShiftPreset | null>(),
  userId: uuid("user_id").references((): AnyPgColumn => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name"),
  image: text("image"),
  role: userRoleEnum("role").notNull().default("employee"),
  googleSubject: text("google_subject").unique(),
  passwordHash: text("password_hash"),
  employeeId: uuid("employee_id").references((): AnyPgColumn => employees.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const officeSettings = pgTable("office_settings", {
  id: uuid("id").defaultRandom().primaryKey(),
  lat: real("lat").notNull(),
  lng: real("lng").notNull(),
  radiusMeters: integer("radius_meters").notNull().default(100),
  timezone: text("timezone").notNull().default("Asia/Karachi"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const attendanceDays = pgTable(
  "attendance_days",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id),
    shiftDate: date("shift_date").notNull(),
    status: attendanceStatusEnum("status").notNull().default("present"),
    source: attendanceSourceEnum("source").notNull().default("auto"),
    checkInAt: timestamp("check_in_at", { withTimezone: true }),
    checkOutAt: timestamp("check_out_at", { withTimezone: true }),
    checkInLat: real("check_in_lat"),
    checkInLng: real("check_in_lng"),
    checkOutLat: real("check_out_lat"),
    checkOutLng: real("check_out_lng"),
    isLate: boolean("is_late").notNull().default(false),
    isEarlyLeave: boolean("is_early_leave").notNull().default(false),
    isMissedCheckout: boolean("is_missed_checkout").notNull().default(false),
    totalBreakSeconds: integer("total_break_seconds").notNull().default(0),
    notes: text("notes"),
    editedByUserId: uuid("edited_by_user_id").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("attendance_days_employee_shift_date_idx").on(table.employeeId, table.shiftDate),
    index("attendance_days_shift_date_status_idx").on(table.shiftDate, table.status),
  ],
);

export const leaveRequests = pgTable(
  "leave_requests",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id),
    leaveType: leaveTypeEnum("leave_type").notNull(),
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    daysCount: numeric("days_count", { precision: 4, scale: 1 }).notNull(),
    reason: text("reason").notNull(),
    medicalCertificateNote: text("medical_certificate_note"),
    status: leaveRequestStatusEnum("status").notNull().default("pending"),
    reviewedByUserId: uuid("reviewed_by_user_id").references(() => users.id),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewNotes: text("review_notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("leave_requests_employee_id_idx").on(table.employeeId),
    index("leave_requests_status_idx").on(table.status),
    index("leave_requests_start_date_idx").on(table.startDate),
  ],
);

export const lateRelaxationRequests = pgTable(
  "late_relaxation_requests",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id),
    yearMonth: text("year_month").notNull(),
    reason: text("reason").notNull(),
    lateCountAtRequest: integer("late_count_at_request").notNull(),
    status: lateRelaxationStatusEnum("status").notNull().default("pending"),
    reviewedByUserId: uuid("reviewed_by_user_id").references(() => users.id),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewNotes: text("review_notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("late_relaxation_requests_employee_id_idx").on(table.employeeId),
    index("late_relaxation_requests_status_idx").on(table.status),
    index("late_relaxation_requests_year_month_idx").on(table.yearMonth),
  ],
);

export const machinePunches = pgTable(
  "machine_punches",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sourceSystem: machinePunchSourceEnum("source_system").notNull().default("zkteco"),
    // External punch id from the biometric bridge (or legacy ebio/zkteco id).
    sourcePunchId: integer("source_punch_id").notNull(),
    cardNo: text("card_no").notNull(),
    punchAt: timestamp("punch_at", { withTimezone: true }).notNull(),
    machineNo: text("machine_no"),
    isManual: boolean("is_manual").notNull().default(false),
    machineEmpCode: text("machine_emp_code"),
    machineEmpName: text("machine_emp_name"),
    sourceEmpId: integer("source_emp_id"),
    employeeId: uuid("employee_id").references((): AnyPgColumn => employees.id),
    rawPunchAt: text("raw_punch_at"),
    syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("machine_punches_source_system_punch_id_idx").on(
      table.sourceSystem,
      table.sourcePunchId,
    ),
    uniqueIndex("machine_punches_card_no_punch_at_idx").on(table.cardNo, table.punchAt),
    index("machine_punches_punch_at_idx").on(table.punchAt),
    index("machine_punches_card_no_idx").on(table.cardNo),
    index("machine_punches_employee_id_idx").on(table.employeeId),
  ],
);

export const deviceTerminals = pgTable("device_terminals", {
  id: uuid("id").defaultRandom().primaryKey(),
  serialNumber: text("serial_number").notNull().unique(),
  alias: text("alias"),
  ipAddress: text("ip_address"),
  firmwareVersion: text("firmware_version"),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const syncState = pgTable("sync_state", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const breakSessions = pgTable("break_sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  attendanceDayId: uuid("attendance_day_id")
    .notNull()
    .references(() => attendanceDays.id, { onDelete: "cascade" }),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  durationSeconds: integer("duration_seconds"),
});

export const userCompanyAssignments = pgTable(
  "user_company_assignments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("user_company_assignments_user_id_idx").on(table.userId)],
);

export const employeeCompensation = pgTable(
  "employee_compensation",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    grossSalaryPkr: integer("gross_salary_pkr").notNull(),
    basicSalaryPkr: integer("basic_salary_pkr").notNull().default(0),
    conveyanceAllowancePkr: integer("conveyance_allowance_pkr").notNull().default(0),
    adhocPkr: integer("adhoc_pkr").notNull().default(0),
    hrAllowancePkr: integer("hr_allowance_pkr").notNull().default(0),
    medicalAllowancePkr: integer("medical_allowance_pkr").notNull().default(0),
    bankName: text("bank_name"),
    bankAccountNumber: text("bank_account_number"),
    fixedSecurityDeductionPkr: integer("fixed_security_deduction_pkr").notNull().default(0),
    fixedOtherPayPkr: integer("fixed_other_pay_pkr").notNull().default(0),
    updatedByUserId: uuid("updated_by_user_id").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("employee_compensation_employee_id_idx").on(table.employeeId)],
);

export const salarySlips = pgTable(
  "salary_slips",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id),
    yearMonth: text("year_month").notNull(),
    incomeTaxPkr: integer("income_tax_pkr").notNull().default(0),
    additionalDeductionPkr: integer("additional_deduction_pkr").notNull().default(0),
    deductionDetails: text("deduction_details"),
    otherPayPkr: integer("other_pay_pkr").notNull().default(0),
    incrementPkr: integer("increment_pkr").notNull().default(0),
    otherPayableDetails: text("other_payable_details"),
    totalDays: integer("total_days").notNull(),
    earnedDays: integer("earned_days").notNull(),
    deductDays: integer("deduct_days").notNull(),
    calculatedSalaryPkr: integer("calculated_salary_pkr").notNull(),
    autoLeaveDeductionPkr: integer("auto_leave_deduction_pkr").notNull(),
    securityDeductionPkr: integer("security_deduction_pkr").notNull(),
    totalOtherPayPkr: integer("total_other_pay_pkr").notNull(),
    totalDeductionPkr: integer("total_deduction_pkr").notNull(),
    netSalaryPkr: integer("net_salary_pkr").notNull(),
    transferDetails: text("transfer_details"),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id),
    updatedByUserId: uuid("updated_by_user_id").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("salary_slips_employee_year_month_idx").on(table.employeeId, table.yearMonth),
    index("salary_slips_company_year_month_idx").on(table.companyId, table.yearMonth),
  ],
);

export const salarySheetImports = pgTable(
  "salary_sheet_imports",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    yearMonth: text("year_month").notNull(),
    fileName: text("file_name").notNull(),
    uploadedByUserId: uuid("uploaded_by_user_id")
      .notNull()
      .references(() => users.id),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("salary_sheet_imports_company_year_month_idx").on(
      table.companyId,
      table.yearMonth,
    ),
  ],
);

export const salarySheetRows = pgTable(
  "salary_sheet_rows",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    importId: uuid("import_id")
      .notNull()
      .references(() => salarySheetImports.id, { onDelete: "cascade" }),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    yearMonth: text("year_month").notNull(),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    salarySlipId: uuid("salary_slip_id").references(() => salarySlips.id, {
      onDelete: "set null",
    }),
    employeeCode: text("employee_code").notNull(),
    employeeName: text("employee_name").notNull(),
    designation: text("designation"),
    joiningDate: text("joining_date"),
    grossSalaryPkr: integer("gross_salary_pkr").notNull().default(0),
    basicSalaryPkr: integer("basic_salary_pkr").notNull().default(0),
    conveyanceAllowancePkr: integer("conveyance_allowance_pkr").notNull().default(0),
    adhocPkr: integer("adhoc_pkr").notNull().default(0),
    hrAllowancePkr: integer("hr_allowance_pkr").notNull().default(0),
    medicalAllowancePkr: integer("medical_allowance_pkr").notNull().default(0),
    workingDays: integer("working_days").notNull().default(0),
    daysWorked: integer("days_worked").notNull().default(0),
    leaveDeductionPkr: integer("leave_deduction_pkr").notNull().default(0),
    earnedSalaryPkr: integer("earned_salary_pkr").notNull().default(0),
    incomeTaxPkr: integer("income_tax_pkr").notNull().default(0),
    totalDeductionPkr: integer("total_deduction_pkr").notNull().default(0),
    netSalaryPkr: integer("net_salary_pkr").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("salary_sheet_rows_company_year_month_employee_idx").on(
      table.companyId,
      table.yearMonth,
      table.employeeId,
    ),
    index("salary_sheet_rows_import_id_idx").on(table.importId),
  ],
);

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    href: text("href"),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("notifications_user_id_created_at_idx").on(table.userId, table.createdAt),
    index("notifications_user_id_unread_idx").on(table.userId, table.readAt),
  ],
);
