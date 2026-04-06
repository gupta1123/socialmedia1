"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ImagePreviewProvider } from "./image-preview";
import { StudioProvider, useStudio } from "./studio-context";
import { TopbarActionsProvider, useTopbarActions } from "./topbar-actions-context";

const navigation = [
  {
    href: "/studio",
    label: "Home",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
        <polyline points="9 22 9 12 15 12 15 22"/>
      </svg>
    )
  },
  {
    href: "/studio/plan",
    label: "Plan",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 4h16v16H4z" />
        <path d="M9 4v16" />
        <path d="M15 4v16" />
        <path d="M4 9h16" />
        <path d="M4 15h16" />
      </svg>
    )
  },
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
    href: "/studio/queue",
    label: "Queue",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 6h16" />
        <path d="M4 12h10" />
        <path d="M4 18h13" />
        <circle cx="18" cy="12" r="2.5" />
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
    href: "/studio/calendar",
    label: "Calendar",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M16 3v4" />
        <path d="M8 3v4" />
        <path d="M3 10h18" />
      </svg>
    )
  },
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
  "/studio/settings": {
    title: "Settings",
    subtitle: "Save preferred posting windows so scheduling forms can suggest your usual channel and time combinations.",
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
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("studio-sidebar-collapsed") === "true";
  });
  const [createSidebarExpanded, setCreateSidebarExpanded] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("studio-create-sidebar-expanded") === "true";
  });
  const popoverRef = useRef<HTMLDivElement>(null);
  const topbarMenuRef = useRef<HTMLDivElement>(null);
  const isCreateRoute = pathname === "/studio/create" || pathname.startsWith("/studio/create/");
  const shellCollapsed = isCreateRoute ? !createSidebarExpanded : collapsed;

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
    window.localStorage.setItem("studio-sidebar-collapsed", collapsed ? "true" : "false");
  }, [collapsed]);

  useEffect(() => {
    window.localStorage.setItem("studio-create-sidebar-expanded", createSidebarExpanded ? "true" : "false");
  }, [createSidebarExpanded]);

  async function handleSignOut() {
    setSigningOut(true);
    await signOut();
  }

  function handleSidebarToggle() {
    if (isCreateRoute) {
      setCreateSidebarExpanded((value) => !value);
      return;
    }
    setCollapsed((value) => !value);
  }

  const { actions: topbarActions, controls: topbarControls, meta: topbarMeta } = useTopbarActions();

  if (loading || !bootstrap) {
    return (
      <div className="workspace-shell">
        <aside className="workspace-sidebar" />
        <main className="workspace-main">
          <p className="sidebar-loading">Loading…</p>
        </main>
      </div>
    );
  }

  const pageMeta = resolvePageMeta(pathname);
  const topbarTitle = topbarMeta?.title ?? pageMeta.title;
  const topbarSubtitle = topbarMeta?.subtitle ?? pageMeta.subtitle;

  return (
    <div className={shellCollapsed ? "workspace-shell sidebar-collapsed" : "workspace-shell"}>
      <aside className="workspace-sidebar">
        {/* Logo / Wordmark */}
        <div className="sidebar-brand">
          {!shellCollapsed && <span className="sidebar-wordmark">Briefly Social</span>}
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
            if (item.category) {
              return (
                <div key={idx} className="nav-section">
                  {!shellCollapsed && <span className="nav-section-label">{item.category}</span>}
                  {item.items.map((sub: any) => {
                    const active =
                      pathname === sub.href ||
                      (sub.href !== "/studio" && pathname.startsWith(`${sub.href}/`));
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

              <Link className="popover-item" href="/studio/settings" onClick={() => setShowPopover(false)} prefetch={false}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 3v4" />
                  <path d="M12 17v4" />
                  <path d="M4 8h8" />
                  <path d="M4 16h4" />
                  <path d="M12 8h8" />
                  <path d="M16 16h4" />
                  <circle cx="15" cy="16" r="2" />
                  <circle cx="10" cy="8" r="2" />
                </svg>
                <span>Settings</span>
              </Link>

              <div className="popover-divider" />

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
            <div className="topbar-title-row">
              {topbarMeta?.backHref ? (
                <Link
                  aria-label={topbarMeta.backLabel ?? "Back"}
                  className="topbar-back-link"
                  href={topbarMeta.backHref}
                  prefetch={false}
                  title={topbarMeta.backLabel ?? "Back"}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m15 18-6-6 6-6" />
                  </svg>
                </Link>
              ) : null}
              <h1 className="topbar-title">{topbarTitle}</h1>
              {topbarMeta?.badges ? <div className="topbar-badges">{topbarMeta.badges}</div> : null}
            </div>
            {topbarSubtitle ? <p className="topbar-subtitle">{topbarSubtitle}</p> : null}
          </div>
          {topbarControls || topbarActions ? (
            <div className="topbar-right">
              {topbarControls ? <div className="topbar-controls">{topbarControls}</div> : null}
              {topbarActions ? (
                <div className="topbar-actions" ref={topbarMenuRef}>
                  <button
                    aria-expanded={showTopbarMenu}
                    aria-label="Open page actions"
                    className={`topbar-menu-trigger ${showTopbarMenu ? "is-open" : ""}`}
                    onClick={() => setShowTopbarMenu((value) => !value)}
                    type="button"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="5" r="1.5" fill="currentColor" stroke="none" />
                      <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
                      <circle cx="12" cy="19" r="1.5" fill="currentColor" stroke="none" />
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
          ) : null}
        </header>

        <div className="workspace-content">
          {message && (
            <div className="status-banner">
              <span>{message}</span>
              <button className="status-dismiss" onClick={() => setMessage(null)} type="button">Dismiss</button>
            </div>
          )}

          {children}
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

  if (pathname.startsWith("/studio/calendar")) {
    return PAGE_META["/studio/calendar"] ?? { title: "Calendar", subtitle: "" };
  }

  return PAGE_META[pathname] ?? { title: "Studio", subtitle: "" };
}

function resolveBootstrapMode(pathname: string) {
  if (
    pathname === "/studio" ||
    pathname === "/studio/plan" ||
    pathname.startsWith("/studio/plan/") ||
    pathname === "/studio/queue" ||
    pathname.startsWith("/studio/queue/") ||
    pathname === "/studio/review" ||
    pathname.startsWith("/studio/review/") ||
    pathname === "/studio/library" ||
    pathname.startsWith("/studio/library/") ||
    pathname === "/studio/settings" ||
    pathname.startsWith("/studio/settings/") ||
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
