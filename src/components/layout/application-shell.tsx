"use client";

import { usePathname } from "next/navigation";
import type { Session } from "next-auth";
import type { ReactNode } from "react";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { CompanySwitcher } from "@/components/layout/company-switcher";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { CompanyOption } from "@/lib/admin/selected-company";
import { isPublicPath } from "@/lib/auth/navigation";

type ApplicationShellProps = {
  user: Session["user"] | null | undefined;
  hasLinkedEmployee?: boolean;
  companies?: CompanyOption[];
  selectedCompanyId?: string | null;
  leaveRequestsIndicator?: ReactNode;
  lateRelaxationsIndicator?: ReactNode;
  notificationsIndicator?: ReactNode;
  children: React.ReactNode;
};

export function ApplicationShell({
  user,
  hasLinkedEmployee = false,
  companies = [],
  selectedCompanyId = null,
  leaveRequestsIndicator = null,
  lateRelaxationsIndicator = null,
  notificationsIndicator = null,
  children,
}: ApplicationShellProps) {
  const pathname = usePathname();
  const showAppChrome = user != null && !isPublicPath(pathname);

  if (!showAppChrome || !user) {
    return <div className="flex min-h-dvh flex-1 flex-col">{children}</div>;
  }

  return (
    <TooltipProvider>
      <SidebarProvider className="dark h-dvh overflow-hidden bg-[#010c28] text-[#eceef5]">
        <AppSidebar
          user={user}
          hasLinkedEmployee={hasLinkedEmployee}
          leaveRequestsIndicator={leaveRequestsIndicator}
          lateRelaxationsIndicator={lateRelaxationsIndicator}
        />
        <SidebarInset className="relative flex h-dvh min-h-0 flex-col overflow-hidden bg-[#010c28]">
          <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_45%_at_15%_-5%,#464c9f40,transparent_55%)]" />
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_45%_35%_at_95%_15%,#f26b2118,transparent_50%)]" />
            <div
              className="absolute inset-0 opacity-[0.14] mix-blend-soft-light"
              style={{
                backgroundImage:
                  "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.55'/%3E%3C/svg%3E\")",
              }}
            />
          </div>
          <header className="relative z-10 flex h-14 shrink-0 items-center gap-2 border-b border-white/10 bg-[#010c28]/80 px-3 pt-[max(0px,env(safe-area-inset-top))] backdrop-blur-md sm:h-12 sm:px-4">
            <SidebarTrigger className="-ml-0.5 size-10 touch-manipulation sm:size-9" />
            <div className="ml-auto flex min-w-0 items-center gap-1 sm:gap-2">
              {notificationsIndicator}
              {user.role === "admin" && companies.length > 0 && selectedCompanyId ? (
                <div className="min-w-0 max-w-[min(55vw,14rem)] sm:max-w-[14rem]">
                  <CompanySwitcher companies={companies} selectedCompanyId={selectedCompanyId} />
                </div>
              ) : null}
            </div>
          </header>
          <div className="relative z-10 flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-y-contain pb-[max(0px,env(safe-area-inset-bottom))]">
            {children}
          </div>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}
