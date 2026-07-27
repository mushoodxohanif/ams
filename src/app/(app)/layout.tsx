import { cookies } from "next/headers";
import { after } from "next/server";
import { Suspense } from "react";
import type { Session } from "next-auth";
import { ApplicationShell } from "@/components/layout/application-shell";
import { PendingLateRelaxationIndicator } from "@/components/layout/pending-late-relaxation-indicator";
import { PendingLeaveIndicator } from "@/components/layout/pending-leave-indicator";
import { NotificationsIndicatorSlot } from "@/components/notifications/notifications-indicator";
import { ensureCrestEveningShiftEmployees } from "@/lib/admin/ensure-crest-evening-shifts";
import { getCompanies } from "@/lib/admin/selected-company";
import {
  COMPANY_COOKIE,
  resolveSelectedCompanyId,
} from "@/lib/admin/selected-company-utils";
import { hasLinkedEmployee } from "@/lib/auth/attendance-access";
import { getSession } from "@/lib/auth/session";

export default async function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await getSession();
  const linkedEmployee = session?.user
    ? hasLinkedEmployee({ user: session.user } as Session)
    : false;
  const isAdmin = session?.user?.role === "admin";

  if (isAdmin) {
    // Non-blocking seed — must not delay every admin navigation.
    after(() => {
      void ensureCrestEveningShiftEmployees();
    });
  }

  const [companies, cookieStore] = isAdmin
    ? await Promise.all([getCompanies(), cookies()])
    : [[], null];

  const selectedCompanyId = isAdmin
    ? resolveSelectedCompanyId(companies, cookieStore?.get(COMPANY_COOKIE)?.value)
    : null;

  return (
    <ApplicationShell
      user={session?.user}
      hasLinkedEmployee={linkedEmployee}
      companies={companies}
      selectedCompanyId={selectedCompanyId}
      notificationsIndicator={
        session?.user ? <NotificationsIndicatorSlot userId={session.user.id} /> : null
      }
      leaveRequestsIndicator={
        isAdmin ? (
          <Suspense fallback={null}>
            <PendingLeaveIndicator companyId={selectedCompanyId} />
          </Suspense>
        ) : null
      }
      lateRelaxationsIndicator={
        isAdmin ? (
          <Suspense fallback={null}>
            <PendingLateRelaxationIndicator companyId={selectedCompanyId} />
          </Suspense>
        ) : null
      }
    >
      {children}
    </ApplicationShell>
  );
}
