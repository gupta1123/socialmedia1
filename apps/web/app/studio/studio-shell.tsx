"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ImagePreviewProvider } from "./image-preview";
import { CalendarSkeleton } from "./skeleton";
import { StudioProvider, useStudio } from "./studio-context";
import { TopbarActionsProvider, useTopbarActions } from "./topbar-actions-context";

const primaryNavigation = [
  // {
  //   href: "/studio",
  //   label: "Home",
  //   icon: (
  //     <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
  //       <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
  //       <polyline points="9 22 9 12 15 12 15 22"/>
  //     </svg>
  //   )
  // },
  // {
  //   href: "/studio/plan",
  //   label: "Plan",
  //   icon: (
  //     <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
  //       <path d="M4 4h16v16H4z" />
  //       <path d="M9 4v16" />
  //       <path d="M15 4v16" />
  //       <path d="M4 9h16" />
  //       <path d="M4 15h16" />
  //     </svg>
  //   )
  // },
  {
    href: "/studio/create?mode=ad-hoc",
    label: "Create",
    matchPath: "/studio/create",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 5v14" />
        <path d="M5 12h14" />
        <path d="M18.5 5.5 20 4" />
        <path d="M4 20l1.5-1.5" />
      </svg>
    )
  },
  {
    href: "/studio/ai-edit",
    label: "Editor",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
        <path d="m16 5 3 3" />
        <path d="M8 16l8.5-8.5a2.12 2.12 0 1 1 3 3L11 19l-4 1 1-4Z" />
      </svg>
    )
  },
  {
    href: "/studio/review",
    label: "Review",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect width="18" height="18" x="3" y="3" rx="2"/>
        <path d="M9 3v18"/><path d="M3 9h18"/>
      </svg>
    )
  },
  {
    href: "/studio/gallery",
    label: "Gallery",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <circle cx="8.5" cy="8.5" r="1.5" />
        <path d="M21 16l-5-5-4 4-3-3-6 6" />
      </svg>
    )
  },
  // {
  //   href: "/studio/calendar",
  //   label: "Calendar",
  //   icon: (
  //     <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
  //       <rect x="3" y="5" width="18" height="16" rx="2" />
  //       <path d="M16 3v4" />
  //       <path d="M8 3v4" />
  //       <path d="M3 10h18" />
  //     </svg>
  //   )
  // },
  {
    href: "/studio/library",
    label: "Library",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="m16 6 4 14"/><path d="M12 6v14"/><path d="M8 8v12"/><path d="M4 4v16"/>
      </svg>
    )
  }
];

const superAdminNavigationItem = {
  href: "/studio/admin",
  label: "Platform Admin",
  icon: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l8 4v6c0 5-3.5 8-8 10-4.5-2-8-5-8-10V7l8-4z" />
      <path d="M9.5 12l2 2 3.5-4" />
    </svg>
  )
};

const workspaceAdminNavigationItem = {
  href: "/studio/workspace-admin",
  label: "Settings",
  icon: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3 4 7v6c0 4.5 3.5 7 8 8 4.5-1 8-3.5 8-8V7l-8-4Z" />
      <path d="M9 12h6" />
      <path d="M12 9v6" />
    </svg>
  )
};

const adminSidebarNavigation = [
  {
    category: "Mode",
    items: [
      {
        href: "/studio",
        label: "Back to App",
        icon: (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="m15 18-6-6 6-6" />
            <path d="M9 12h12" />
          </svg>
        )
      }
    ]
  },
  {
    category: "Platform",
    items: [
      {
        href: "/studio/admin",
        label: "Dashboard",
        matchPath: "/studio/admin",
        icon: (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 13h6V5H4z" />
            <path d="M14 19h6V5h-6z" />
            <path d="M4 19h6v-2H4z" />
          </svg>
        )
      },
      {
        href: "/studio/admin/orgs",
        label: "Organizations",
        matchPath: "/studio/admin/orgs",
        icon: (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 21h18" />
            <path d="M5 21V7l7-4 7 4v14" />
            <path d="M9 10h.01" />
            <path d="M15 10h.01" />
            <path d="M9 14h.01" />
            <path d="M15 14h.01" />
          </svg>
        )
      },
      {
        href: "/studio/admin/credits",
        label: "Credits",
        matchPath: "/studio/admin/credits",
        excludeMatchPrefixes: ["/studio/admin/credits/ledger"],
        icon: (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="8" />
            <path d="M9.5 9.5c0-1.1 1-2 2.5-2s2.5.9 2.5 2-1 1.7-2.5 2-2.5.9-2.5 2 1 2 2.5 2 2.5-.9 2.5-2" />
          </svg>
        )
      },
      {
        href: "/studio/admin/credits/ledger",
        label: "Credit Ledger",
        matchPath: "/studio/admin/credits/ledger",
        icon: (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 4h11l3 3v13H5z" />
            <path d="M14 4v3h3" />
            <path d="M8 11h8" />
            <path d="M8 15h8" />
          </svg>
        )
      },
      {
        href: "/studio/admin/platform-admins",
        label: "Platform Admins",
        matchPath: "/studio/admin/platform-admins",
        icon: (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3l7 4v5c0 4.5-3 7.4-7 9-4-1.6-7-4.5-7-9V7l7-4Z" />
            <path d="M9.5 12l1.7 1.7L14.8 10" />
          </svg>
        )
      },
      {
        href: "/studio/admin/ops",
        label: "Operations",
        matchPath: "/studio/admin/ops",
        icon: (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 14h4l2-4 4 8 2-4h4" />
            <path d="M4 6h16" />
          </svg>
        )
      },
      {
        href: "/studio/admin/audit",
        label: "Audit",
        matchPath: "/studio/admin/audit",
        icon: (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M8 6h11" />
            <path d="M8 12h11" />
            <path d="M8 18h11" />
            <path d="M3 6h.01" />
            <path d="M3 12h.01" />
            <path d="M3 18h.01" />
          </svg>
        )
      }
    ]
  }
];

const workspaceAdminSidebarNavigation = [
  {
    category: "",
    items: [
      {
        href: "/studio",
        label: "Back to App",
        icon: (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="m15 18-6-6 6-6" />
            <path d="M9 12h12" />
          </svg>
        )
      }
    ]
  },
  {
    category: "Workspace",
    items: [
      {
        href: "/studio/workspace-admin/team",
        label: "Team Access",
        matchPath: "/studio/workspace-admin/team",
        icon: (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" />
            <circle cx="9.5" cy="7" r="3.5" />
            <path d="M20 8v6" />
            <path d="M17 11h6" />
          </svg>
        )
      },
      {
        href: "/studio/workspace-admin/compliance",
        label: "Compliance",
        matchPath: "/studio/workspace-admin/compliance",
        icon: (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3 5 6v5c0 4.5 2.9 8.5 7 10 4.1-1.5 7-5.5 7-10V6z" />
            <path d="m9 12 2 2 4-5" />
          </svg>
        )
      },
      {
        href: "/studio/workspace-admin/posting-windows",
        label: "Posting Windows",
        matchPath: "/studio/workspace-admin/posting-windows",
        icon: (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2" />
            <path d="M16 2v4" />
            <path d="M8 2v4" />
            <path d="M3 10h18" />
            <path d="M8 14h.01" />
            <path d="M12 14h.01" />
            <path d="M16 14h.01" />
          </svg>
        )
      },
    ]
  }
];

const PAGE_META: Record<string, { title: string; subtitle: string }> = {
  "/studio": {
    title: "Home",
    subtitle: "Know what needs planning, review, and scheduling across the team.",
  },
  "/studio/plan": {
    title: "Plan",
    subtitle: "Plan campaigns, series, and one-off work before the team starts creating.",
  },
  "/studio/queue": {
    title: "Queue",
    subtitle: "Daily work queue for creators, approvers, and scheduling ops.",
  },
  "/studio/brands": {
    title: "Brands",
    subtitle: "Manage brand identities and switch your active workspace context.",
  },
  "/studio/create": {
    title: "Create",
    subtitle: "Start from a post task or open an empty brief to create post options.",
  },
  "/studio/ai-edit": {
    title: "Editor",
    subtitle: "Compose posts with text, image layers, and focused AI edits.",
  },
  "/studio/projects": {
    title: "Projects",
    subtitle: "Project truth for every development.",
  },
  "/studio/campaigns": {
    title: "Campaigns",
    subtitle: "Plan initiatives and turn them into post tasks the team can move forward.",
  },
  "/studio/deliverables": {
    title: "Post tasks",
    subtitle: "Track work from brief to approval and scheduling.",
  },
  "/studio/templates": {
    title: "Templates",
    subtitle: "Reusable starting points for future posts.",
  },
  "/studio/calendar": {
    title: "Calendar",
    subtitle: "See scheduled posts for the week and adjust timing as plans change.",
  },
  "/studio/library": {
    title: "Library",
    subtitle: "Manage brands, templates, references, channels, and posting windows.",
  },
  "/studio/review": {
    title: "Review",
    subtitle: "Review post options and move approved work straight into scheduling.",
  },
  "/studio/gallery": {
    title: "Gallery",
    subtitle: "Browse generated images across review states in one place.",
  },
  "/studio/workspace-admin": {
    title: "Settings",
    subtitle: "Workspace-level access, compliance, and scheduling settings.",
  },
  "/studio/workspace-admin/team": {
    title: "Team Access",
    subtitle: "Add users, manage workspace access, and set passwords directly.",
  },
  "/studio/workspace-admin/compliance": {
    title: "Compliance",
    subtitle: "Configure default RERA compliance block settings for this workspace.",
  },
  "/studio/workspace-admin/posting-windows": {
    title: "Posting Windows",
    subtitle: "Manage default posting slots used as scheduling suggestions.",
  },
  "/studio/admin/credits": {
    title: "Admin Credits",
    subtitle: "Platform super-admin controls for workspace credit balances and ledger monitoring.",
  },
  "/studio/admin": {
    title: "Admin Dashboard",
    subtitle: "Platform overview across organizations, credits, and operational health.",
  },
  "/studio/admin/orgs": {
    title: "Organizations",
    subtitle: "Inspect each client workspace, users, and credit balances.",
  },
  "/studio/admin/platform-admins": {
    title: "Platform Admins",
    subtitle: "Grant or revoke super-admin permissions.",
  },
  "/studio/admin/ops": {
    title: "Operations",
    subtitle: "Monitor job queue health, failures, and stuck workflows.",
  },
  "/studio/admin/audit": {
    title: "Audit",
    subtitle: "Track sensitive actions across credits, roles, and failures.",
  },
  "/studio/admin/credits/ledger": {
    title: "Credit Ledger",
    subtitle: "Cross-organization immutable history of credit activity.",
  },
};

export function StudioShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const bootstrapMode = resolveBootstrapMode(pathname);

  return (
    <TopbarActionsProvider>
      <StudioProvider bootstrapMode={bootstrapMode}>
        <ImagePreviewProvider>
          <ShellFrame>{children}</ShellFrame>
        </ImagePreviewProvider>
      </StudioProvider>
    </TopbarActionsProvider>
  );
}

function ShellFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const {
    loading,
    bootstrap,
    userEmail,
    darkMode,
    toggleDarkMode,
    message,
    setMessage,
    signOut
  } = useStudio();

  const [showPopover, setShowPopover] = useState(false);
  const [showTopbarMenu, setShowTopbarMenu] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [createSidebarExpanded, setCreateSidebarExpanded] = useState(false);
  const [editorSidebarExpanded, setEditorSidebarExpanded] = useState(false);
  const [sidebarPrefsReady, setSidebarPrefsReady] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const topbarMenuRef = useRef<HTMLDivElement>(null);
  const isCreateRoute = pathname === "/studio/create" || pathname.startsWith("/studio/create/");
  const isEditorRoute = pathname === "/studio/ai-edit" || pathname.startsWith("/studio/ai-edit/");
  const isOutputRoute = pathname === "/studio/outputs" || pathname.startsWith("/studio/outputs/");
  const isCalendarRoute = pathname === "/studio/calendar" || pathname.startsWith("/studio/calendar/");
  const isAdminRoute = pathname === "/studio/admin" || pathname.startsWith("/studio/admin/");
  const isWorkspaceAdminRoute = pathname === "/studio/workspace-admin" || pathname.startsWith("/studio/workspace-admin/");
  const isPlatformAdmin = bootstrap?.viewer.isPlatformAdmin === true;
  const workspaceRole = bootstrap?.workspace?.role ?? null;
  const isWorkspaceAdmin = workspaceRole === "owner" || workspaceRole === "admin";
  const showAdminSidebar = isAdminRoute && isPlatformAdmin;
  const showWorkspaceAdminSidebar = isWorkspaceAdminRoute && isWorkspaceAdmin;
  const navigation = useMemo(() => {
    if (showAdminSidebar) {
      return adminSidebarNavigation;
    }
    if (showWorkspaceAdminSidebar) {
      if (isPlatformAdmin) {
        return workspaceAdminSidebarNavigation;
      }
      return workspaceAdminSidebarNavigation.map((group) => ({
        ...group,
        items: group.items.filter((item) => item.href !== "/studio/workspace-admin/team"),
      }));
    }
    if (isPlatformAdmin && isWorkspaceAdmin) {
      return [...primaryNavigation, workspaceAdminNavigationItem, superAdminNavigationItem];
    }
    if (isWorkspaceAdmin) {
      return [...primaryNavigation, workspaceAdminNavigationItem];
    }
    if (isPlatformAdmin) {
      return [...primaryNavigation, superAdminNavigationItem];
    }
    return primaryNavigation;
  }, [showAdminSidebar, showWorkspaceAdminSidebar, isPlatformAdmin, isWorkspaceAdmin]);
  const shellCollapsed = isCreateRoute ? !createSidebarExpanded : isEditorRoute ? !editorSidebarExpanded : collapsed;
  const pageMeta = resolvePageMeta(pathname);

  useEffect(() => {
    if (!showPopover && !showTopbarMenu) return;
    function handleOutsideClick(e: MouseEvent) {
      const target = e.target as Node;

      if (showPopover && popoverRef.current && !popoverRef.current.contains(target)) {
        setShowPopover(false);
      }

      if (showTopbarMenu && topbarMenuRef.current && !topbarMenuRef.current.contains(target)) {
        setShowTopbarMenu(false);
      }
    }
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [showPopover, showTopbarMenu]);

  useEffect(() => {
    setShowTopbarMenu(false);
  }, [pathname]);

  useEffect(() => {
    setCollapsed(window.localStorage.getItem("studio-sidebar-collapsed") === "true");
    setSidebarPrefsReady(true);
  }, []);

  useEffect(() => {
    if (isCreateRoute) {
      setCreateSidebarExpanded(false);
      return;
    }
    if (isEditorRoute) {
      setEditorSidebarExpanded(false);
    }
  }, [isCreateRoute, isEditorRoute]);

  useEffect(() => {
    if (!sidebarPrefsReady) return;
    window.localStorage.setItem("studio-sidebar-collapsed", collapsed ? "true" : "false");
  }, [collapsed, sidebarPrefsReady]);

  async function handleSignOut() {
    setSigningOut(true);
    await signOut();
  }

  function handleSidebarToggle() {
    if (isCreateRoute) {
      setCreateSidebarExpanded((value) => !value);
      return;
    }
    if (isEditorRoute) {
      setEditorSidebarExpanded((value) => !value);
      return;
    }
    setCollapsed((value) => !value);
  }

  const { actions: topbarActions, controls: topbarControls, meta: topbarMeta } = useTopbarActions();

  if (loading || !bootstrap) {
    return (
      <div className={shellCollapsed ? "workspace-shell sidebar-collapsed" : "workspace-shell"}>
        <aside className="workspace-sidebar studio-shell-loading-sidebar">
          <div className="sidebar-brand">
            {!shellCollapsed ? <span className="sidebar-wordmark">Briefly Social</span> : null}
            <div className="studio-shell-skeleton studio-shell-toggle-skeleton" aria-hidden="true" />
          </div>
          <nav className="sidebar-nav studio-shell-loading-nav" aria-hidden="true">
            {Array.from({ length: 7 }).map((_, index) => (
              <div className="nav-item studio-shell-loading-nav-item" key={index}>
                <span className="studio-shell-skeleton studio-shell-nav-icon-skeleton" />
                {!shellCollapsed ? <span className="studio-shell-skeleton studio-shell-nav-label-skeleton" /> : null}
              </div>
            ))}
          </nav>
          <div className="sidebar-foot">
            <div className="sidebar-user-anchor studio-shell-loading-user" aria-hidden="true">
              <span className="studio-shell-skeleton studio-shell-avatar-skeleton" />
              {!shellCollapsed ? (
                <span className="studio-shell-loading-user-copy">
                  <span className="studio-shell-skeleton studio-shell-user-skeleton" />
                  <span className="studio-shell-skeleton studio-shell-user-subtitle-skeleton" />
                </span>
              ) : null}
            </div>
          </div>
        </aside>
        <main className="workspace-main">
          <header className="workspace-topbar">
            {isCalendarRoute ? (
              <div className="topbar-page-meta">
                <div className="topbar-breadcrumb">
                  <h1 className="topbar-title">{pageMeta.title}</h1>
                </div>
                {pageMeta.subtitle ? <p className="topbar-subtitle">{pageMeta.subtitle}</p> : null}
              </div>
            ) : (
              <div className="topbar-page-meta studio-shell-loading-meta">
                <div className="studio-shell-skeleton studio-shell-title-skeleton" />
                <div className="studio-shell-skeleton studio-shell-subtitle-skeleton" />
              </div>
            )}
          </header>
          <div className={`workspace-content studio-shell-loading-content ${isCreateRoute ? "is-create" : ""}`}>
            {isCreateRoute ? (
              <div className="studio-create-loading-layout" aria-hidden="true">
                <div className="studio-create-loading-rail">
                  <div className="studio-shell-skeleton studio-create-loading-section-title" />
                  <div className="studio-shell-skeleton studio-create-loading-toggle" />
                  <div className="studio-shell-skeleton studio-create-loading-card tall" />
                  <div className="studio-shell-skeleton studio-create-loading-section-title short" />
                  <div className="studio-shell-skeleton studio-create-loading-card" />
                  <div className="studio-shell-skeleton studio-create-loading-card" />
                </div>
                <div className="studio-create-loading-main">
                  <div className="studio-shell-skeleton studio-create-loading-breadcrumb" />
                  <div className="studio-shell-skeleton studio-create-loading-heading" />
                  <div className="studio-shell-skeleton studio-create-loading-hero" />
                  <div className="studio-create-loading-grid">
                    {Array.from({ length: 3 }).map((_, index) => (
                      <div className="studio-shell-skeleton studio-create-loading-candidate" key={index} />
                    ))}
                  </div>
                  <div className="studio-shell-skeleton studio-create-loading-dock" />
                </div>
              </div>
            ) : isCalendarRoute ? (
              <div className="page-stack calendar-page">
                <CalendarSkeleton />
              </div>
            ) : (
              <div className="studio-shell-loading-panel" aria-hidden="true">
                <div className="studio-shell-loading-row">
                  <div className="studio-shell-skeleton studio-shell-panel-card" />
                  <div className="studio-shell-skeleton studio-shell-panel-card" />
                  <div className="studio-shell-skeleton studio-shell-panel-card" />
                </div>
                <div className="studio-shell-loading-row">
                  <div className="studio-shell-skeleton studio-shell-panel-wide" />
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
    );
  }

  const topbarTitle = topbarMeta?.title ?? pageMeta.title;
  const topbarSubtitle = topbarMeta?.subtitle ?? pageMeta.subtitle;
  const sidebarEyebrow = showAdminSidebar ? "Platform admin" : "Workspace";
  const sidebarWordmark = showAdminSidebar ? "Admin Console" : "Briefly Social";

  return (
    <div className={shellCollapsed ? "workspace-shell sidebar-collapsed" : "workspace-shell"}>
      <aside className="workspace-sidebar">
        {/* Logo / Wordmark */}
        <div className="sidebar-brand">
          {!shellCollapsed ? (
            <div className="sidebar-brand-copy">
              <span className="sidebar-eyebrow">{sidebarEyebrow}</span>
              <span className="sidebar-wordmark">{sidebarWordmark}</span>
            </div>
          ) : null}
          <button
            className="sidebar-toggle"
            aria-label={shellCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            onClick={handleSidebarToggle}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect width="18" height="18" x="3" y="3" rx="2"/>
              <path d="M9 3v18"/>
            </svg>
          </button>
        </div>

        {/* Navigation */}
        <nav className="sidebar-nav">
          {navigation.map((item: any, idx: number) => {
            if (Array.isArray(item.items)) {
              return (
                <div key={idx} className="nav-section">
                  {!shellCollapsed && item.category ? <span className="nav-section-label">{item.category}</span> : null}
                  {item.items.map((sub: any) => {
                    const matchPath = sub.matchPath ?? sub.href.split("?")[0];
                    const excludedPrefixes = sub.excludeMatchPrefixes ?? [];
                    const active =
                      !excludedPrefixes.some((prefix: string) => pathname.startsWith(prefix)) &&
                      (pathname === matchPath ||
                        (matchPath !== "/studio" && pathname.startsWith(`${matchPath}/`)));
                    return (
                      <Link
                        key={sub.href}
                        href={sub.href}
                        prefetch={false}
                        className={active ? "nav-item active" : "nav-item"}
                        title={shellCollapsed ? sub.label : undefined}
                      >
                        <span className="nav-icon">{sub.icon}</span>
                        {!shellCollapsed && <span className="nav-label">{sub.label}</span>}
                        {!shellCollapsed && sub.badge && <span className="nav-badge">{sub.badge}</span>}
                      </Link>
                    );
                  })}
                </div>
              );
            }
            const matchPath = item.matchPath ?? item.href.split("?")[0];
            const active =
              pathname === matchPath ||
              (matchPath !== "/studio" && pathname.startsWith(`${matchPath}/`));
            return (
              <Link
                key={item.href}
                href={item.href}
                prefetch={false}
                className={active ? "nav-item active" : "nav-item"}
                title={shellCollapsed ? item.label : undefined}
              >
                <span className="nav-icon">{item.icon}</span>
                {!shellCollapsed && <span className="nav-label">{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        {/* Footer with Popover */}
        <div className="sidebar-foot" ref={popoverRef}>
          <button
            className="sidebar-user-anchor"
            onClick={() => setShowPopover(!showPopover)}
            aria-label="User menu"
            title={shellCollapsed ? (userEmail ?? "User") : undefined}
          >
            <span className="sidebar-avatar">{userEmail ? userEmail.charAt(0).toUpperCase() : "U"}</span>
            {!shellCollapsed && <span className="nav-label user-email">{userEmail}</span>}
            {!shellCollapsed && (
              <svg
                width="14" height="14" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                className={showPopover ? "chevron rotated" : "chevron"}
              >
                <path d="m18 15-6-6-6 6"/>
              </svg>
            )}
          </button>

          {showPopover && (
            <div className="user-popover">
              <button className="popover-item" onClick={() => toggleDarkMode()}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  {darkMode ? (
                    <>
                      <circle cx="12" cy="12" r="5"/>
                      <line x1="12" y1="1" x2="12" y2="3"/>
                      <line x1="12" y1="21" x2="12" y2="23"/>
                      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
                      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
                      <line x1="1" y1="12" x2="3" y2="12"/>
                      <line x1="21" y1="12" x2="23" y2="12"/>
                      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
                      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
                    </>
                  ) : (
                    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
                  )}
                </svg>
                <span>{darkMode ? "Switch to Light" : "Switch to Dark"}</span>
              </button>

              <button
                className="popover-item signout-btn"
                onClick={handleSignOut}
                disabled={signingOut}
              >
                {signingOut ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="spin">
                    <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                  </svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                    <polyline points="16 17 21 12 16 7"/>
                    <line x1="21" x2="9" y1="12" y2="12"/>
                  </svg>
                )}
                <span>{signingOut ? "Signing out…" : "Sign out"}</span>
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* Main content */}
      <main className="workspace-main">
        <header className="workspace-topbar">
          <div className="topbar-page-meta">
            <div className="topbar-breadcrumb">
              {topbarMeta?.backHref ? (
                <>
                  <Link
                    className="breadcrumb-item breadcrumb-back"
                    href={topbarMeta.backHref}
                    prefetch={false}
                  >
                    {topbarMeta.backLabel ?? "Back"}
                  </Link>
                  <span className="breadcrumb-separator">/</span>
                </>
              ) : null}
              <h1 className="topbar-title">{topbarTitle}</h1>
              {topbarMeta?.badges ? <div className="topbar-badges">{topbarMeta.badges}</div> : null}
            </div>
            {topbarSubtitle ? <p className="topbar-subtitle">{topbarSubtitle}</p> : null}
          </div>

          <div className="topbar-right">
            {topbarControls ? <div className="topbar-controls">{topbarControls}</div> : null}
            {topbarActions ? (
              <div className="topbar-actions" ref={topbarMenuRef}>
                <button
                  aria-expanded={showTopbarMenu}
                  aria-label="Open page actions"
                  className={`topbar-action-trigger ${showTopbarMenu ? "is-open" : ""}`}
                  onClick={() => setShowTopbarMenu((value) => !value)}
                  type="button"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="1" />
                    <circle cx="19" cy="12" r="1" />
                    <circle cx="5" cy="12" r="1" />
                  </svg>
                </button>
                {showTopbarMenu ? (
                  <div
                    className="topbar-menu-panel"
                    onClick={(event) => {
                      const target = event.target as HTMLElement;
                      if (target.closest("a, button")) {
                        setShowTopbarMenu(false);
                      }
                    }}
                  >
                    {topbarActions}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </header>

        <div className={`workspace-content ${isCreateRoute ? "is-create" : ""}${isOutputRoute ? " is-output-detail" : ""}`}>
          {children}
        </div>
        <div aria-atomic="true" aria-live="polite" className="studio-toast-viewport">
          {message ? (
            <div className="studio-toast" role="status">
              <div aria-hidden="true" className="studio-toast-icon">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14" />
                  <path d="M12 5v14" />
                </svg>
              </div>
              <p className="studio-toast-copy">{message}</p>
              <button
                aria-label="Dismiss notification"
                className="studio-toast-close"
                onClick={() => setMessage(null)}
                type="button"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m18 6-12 12" />
                  <path d="m6 6 12 12" />
                </svg>
              </button>
            </div>
          ) : null}
        </div>
      </main>
    </div>
  );
}

function resolvePageMeta(pathname: string) {
  if (pathname.startsWith("/studio/projects/")) {
    return {
      title: "Project detail",
      subtitle: "Project truth, claims, and constraints in one place."
    };
  }

  if (pathname.startsWith("/studio/campaigns/")) {
    return {
      title: "Campaign detail",
      subtitle: "Objective, plans, and resulting deliverables."
    };
  }

  if (pathname.startsWith("/studio/deliverables/")) {
    return {
      title: "Post task",
      subtitle: "The workflow hub for one piece of work from brief to schedule."
    };
  }

  if (pathname.startsWith("/studio/templates/")) {
    return {
      title: "Template detail",
      subtitle: "Reusable references and rules for future posts."
    };
  }

  if (pathname.startsWith("/studio/runs/")) {
    return {
      title: "Run detail",
      subtitle: "One brief with its directions and finals."
    };
  }

  if (pathname.startsWith("/studio/review")) {
    return PAGE_META["/studio/review"] ?? { title: "Review", subtitle: "" };
  }

  if (pathname.startsWith("/studio/campaigns")) {
    return PAGE_META["/studio/campaigns"] ?? { title: "Campaigns", subtitle: "" };
  }

  if (pathname.startsWith("/studio/deliverables")) {
    return PAGE_META["/studio/deliverables"] ?? { title: "Post tasks", subtitle: "" };
  }

  if (pathname.startsWith("/studio/queue")) {
    return PAGE_META["/studio/queue"] ?? { title: "Queue", subtitle: "" };
  }

  if (pathname.startsWith("/studio/plan")) {
    return PAGE_META["/studio/plan"] ?? { title: "Plan", subtitle: "" };
  }

  if (pathname.startsWith("/studio/projects")) {
    return PAGE_META["/studio/projects"] ?? { title: "Projects", subtitle: "" };
  }

  if (pathname.startsWith("/studio/templates")) {
    return PAGE_META["/studio/templates"] ?? { title: "Templates", subtitle: "" };
  }

  if (pathname.startsWith("/studio/ai-edit")) {
    return PAGE_META["/studio/ai-edit"] ?? { title: "Editor", subtitle: "" };
  }

  if (pathname.startsWith("/studio/calendar")) {
    return PAGE_META["/studio/calendar"] ?? { title: "Calendar", subtitle: "" };
  }

  if (pathname.startsWith("/studio/workspace-admin/team")) {
    return PAGE_META["/studio/workspace-admin/team"] ?? { title: "Team Access", subtitle: "" };
  }

  if (pathname.startsWith("/studio/workspace-admin/compliance")) {
    return PAGE_META["/studio/workspace-admin/compliance"] ?? { title: "Compliance", subtitle: "" };
  }

  if (pathname.startsWith("/studio/workspace-admin/posting-windows")) {
    return PAGE_META["/studio/workspace-admin/posting-windows"] ?? { title: "Posting Windows", subtitle: "" };
  }

  if (pathname === "/studio/workspace-admin" || pathname.startsWith("/studio/workspace-admin/")) {
    return PAGE_META["/studio/workspace-admin"] ?? { title: "Settings", subtitle: "" };
  }

  if (pathname.startsWith("/studio/admin/credits/ledger")) {
    return PAGE_META["/studio/admin/credits/ledger"] ?? { title: "Credit Ledger", subtitle: "" };
  }

  if (pathname.startsWith("/studio/admin/credits")) {
    return PAGE_META["/studio/admin/credits"] ?? { title: "Admin Credits", subtitle: "" };
  }

  if (pathname.startsWith("/studio/admin/orgs")) {
    return PAGE_META["/studio/admin/orgs"] ?? { title: "Organizations", subtitle: "" };
  }

  if (pathname.startsWith("/studio/admin/platform-admins")) {
    return PAGE_META["/studio/admin/platform-admins"] ?? { title: "Platform Admins", subtitle: "" };
  }

  if (pathname.startsWith("/studio/admin/ops")) {
    return PAGE_META["/studio/admin/ops"] ?? { title: "Operations", subtitle: "" };
  }

  if (pathname.startsWith("/studio/admin/audit")) {
    return PAGE_META["/studio/admin/audit"] ?? { title: "Audit", subtitle: "" };
  }

  if (pathname === "/studio/admin" || pathname.startsWith("/studio/admin/")) {
    return PAGE_META["/studio/admin"] ?? { title: "Admin Dashboard", subtitle: "" };
  }

  return PAGE_META[pathname] ?? { title: "Studio", subtitle: "" };
}

function resolveBootstrapMode(pathname: string) {
  if (pathname === "/studio/create" || pathname.startsWith("/studio/create/")) {
    return "create" as const;
  }

  if (
    pathname === "/studio/ai-edit" ||
    pathname.startsWith("/studio/ai-edit/") ||
    pathname === "/studio/templates" ||
    pathname.startsWith("/studio/templates/")
  ) {
    return "editor" as const;
  }

  if (
    pathname === "/studio" ||
    pathname === "/studio/plan" ||
    pathname.startsWith("/studio/plan/") ||
    pathname === "/studio/queue" ||
    pathname.startsWith("/studio/queue/") ||
    pathname === "/studio/review" ||
    pathname.startsWith("/studio/review/") ||
    pathname === "/studio/gallery" ||
    pathname.startsWith("/studio/gallery/") ||
    pathname === "/studio/outputs" ||
    pathname.startsWith("/studio/outputs/") ||
    pathname === "/studio/library" ||
    pathname.startsWith("/studio/library/") ||
    pathname === "/studio/workspace-admin" ||
    pathname.startsWith("/studio/workspace-admin/") ||
    pathname === "/studio/admin" ||
    pathname.startsWith("/studio/admin/") ||
    pathname === "/studio/brands" ||
    pathname.startsWith("/studio/brands/") ||
    pathname === "/studio/projects" ||
    pathname.startsWith("/studio/projects/") ||
    pathname === "/studio/campaigns" ||
    pathname.startsWith("/studio/campaigns/") ||
    pathname === "/studio/deliverables" ||
    pathname.startsWith("/studio/deliverables/") ||
    pathname === "/studio/calendar" ||
    pathname.startsWith("/studio/calendar/")
  ) {
    return "light" as const;
  }

  return "full" as const;
}
