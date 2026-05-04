import { useState, useEffect } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import {
  LayoutDashboard, BarChart3, LogOut, GitBranch, ListChecks,
  ChevronsLeft, ChevronsRight, Settings,
  Megaphone, Target, Monitor,
  X, User
} from "lucide-react";
import { cn } from "@/lib/utils";
import { applyTheme, getStoredTheme } from "./ThemeSwitcher";
import PwaInstallPrompt from "./PwaInstallPrompt";

type NavItem = {
  to: string;
  icon: typeof LayoutDashboard;
  label: string;
  separator?: false;
} | {
  separator: true;
};

const navItems: NavItem[] = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/actions", icon: ListChecks, label: "Daily Actions" },
  { to: "/campaigns", icon: Megaphone, label: "Campaigns" },
  { to: "/pipeline", icon: GitBranch, label: "Pipeline" },
  { to: "/targets", icon: Target, label: "Targets" },
  { separator: true },
  { to: "/analytics", icon: BarChart3, label: "Analytics" },
  { to: "/browsers", icon: Monitor, label: "Browsers" },
];

// Mobile bottom — 3 main + account icon
const mobileBottomNav = [
  { to: "/", icon: LayoutDashboard, label: "Home" },
  { to: "/actions", icon: ListChecks, label: "Actions" },
  { to: "/pipeline", icon: GitBranch, label: "Pipeline" },
];

// Account sheet nav items
const accountSheetItems = [
  { to: "/campaigns", icon: Megaphone, label: "Campaigns" },
  { to: "/targets", icon: Target, label: "Targets" },
  { to: "/browsers", icon: Monitor, label: "Browsers" },
  { to: "/analytics", icon: BarChart3, label: "Analytics" },
  { to: "/settings", icon: Settings, label: "Settings" },
];

const AppLayout = ({ children }: { children: React.ReactNode }) => {
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);

  useEffect(() => { applyTheme(getStoredTheme()); }, []);

  const handleLogout = async () => {
    setAccountOpen(false);
    await supabase.auth.signOut();
    navigate("/auth");
  };

  return (
    <div className="flex min-h-[100dvh] bg-background">

      {/* ─── Mobile bottom nav ─── */}
      <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-background/95 backdrop-blur-sm md:hidden">
        <nav className="flex items-center px-6 py-1.5" style={{ justifyContent: "space-around" }}>

          {mobileBottomNav.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                cn(
                  "flex flex-col items-center gap-0.5 py-1 px-3 rounded-xl transition-colors min-w-[52px]",
                  isActive ? "text-foreground" : "text-muted-foreground"
                )
              }
            >
              {({ isActive }) => (
                <>
                  <Icon className="h-[22px] w-[22px]" strokeWidth={isActive ? 2.2 : 1.7} />
                  <span className="text-[10px] font-medium">{label}</span>
                </>
              )}
            </NavLink>
          ))}

          {/* Account icon */}
          <button
            onClick={() => setAccountOpen(true)}
            className={cn(
              "flex flex-col items-center gap-0.5 py-1 px-3 rounded-xl transition-colors min-w-[52px]",
              accountOpen ? "text-foreground" : "text-muted-foreground"
            )}
          >
            <div className={cn(
              "h-[22px] w-[22px] rounded-full border-2 flex items-center justify-center transition-colors",
              accountOpen ? "border-foreground" : "border-muted-foreground"
            )}>
              <User className="h-3 w-3" strokeWidth={2} />
            </div>
            <span className="text-[10px] font-medium">Account</span>
          </button>
        </nav>
      </div>

      {/* ─── Account bottom sheet ─── */}
      {accountOpen && (
        <>
          <div
            className="fixed inset-0 z-50 bg-black/50 md:hidden"
            onClick={() => setAccountOpen(false)}
          />
          <div
            className="fixed left-0 right-0 bottom-0 z-[60] md:hidden bg-card rounded-t-2xl border-t border-border shadow-2xl"
            style={{ paddingBottom: "max(env(safe-area-inset-bottom, 0px), 80px)" }}
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-2">
              <div className="w-9 h-1 rounded-full bg-border" />
            </div>

            {/* Sheet header */}
            <div className="flex items-center justify-between px-5 pb-3 border-b border-border/40">
              <span className="text-sm font-bold">Menu</span>
              <button
                onClick={() => setAccountOpen(false)}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Page links — 4 per row grid */}
            <div className="grid grid-cols-4 gap-1 px-4 pt-4 pb-3">
              {accountSheetItems.map(({ to, icon: Icon, label }) => (
                <NavLink
                  key={to}
                  to={to}
                  onClick={() => setAccountOpen(false)}
                  className={({ isActive }) =>
                    cn(
                      "flex flex-col items-center gap-1.5 p-3 rounded-xl transition-colors text-center",
                      isActive
                        ? "bg-foreground text-background"
                        : "text-foreground hover:bg-muted"
                    )
                  }
                >
                  <Icon className="h-5 w-5" strokeWidth={1.8} />
                  <span className="text-[10px] font-semibold leading-tight">{label}</span>
                </NavLink>
              ))}
            </div>

            {/* Log out */}
            <div className="px-5 pt-1 pb-2 border-t border-border/40">
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm text-red-500 hover:bg-red-500/8 transition-colors font-medium"
              >
                <LogOut className="h-4 w-4" />
                Log out
              </button>
            </div>
          </div>
        </>
      )}

      {/* ─── Desktop sidebar ─── */}
      <aside
        className={cn(
          "fixed left-0 top-0 hidden h-full border-r border-border bg-[hsl(var(--sidebar-background))] md:flex flex-col transition-all duration-200 z-40",
          collapsed ? "w-[52px]" : "w-[240px]"
        )}
      >
        <div className="flex items-center justify-between px-3 py-3 min-h-[52px]">
          {!collapsed && (
            <div className="flex items-center gap-2 min-w-0">
              <img src="/pwa-192.png" alt="DM Ritual" className="h-6 w-6 rounded shrink-0" />
              <span className="text-sm font-semibold text-foreground truncate">DM Ritual</span>
            </div>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="p-1 rounded hover:bg-[hsl(var(--sidebar-accent))] text-muted-foreground transition-colors"
          >
            {collapsed ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
          </button>
        </div>

        <nav className="flex flex-col gap-0.5 px-2 flex-1 overflow-y-auto">
          {navItems.map((item, i) => {
            if ("separator" in item) {
              return <div key={`sep-${i}`} className="my-1.5 border-t border-border/40" />;
            }
            const { to, icon: Icon, label } = item;
            return (
              <NavLink
                key={to}
                to={to}
                end={to === "/"}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-2.5 rounded-md px-2 py-[6px] text-[13px] font-medium transition-colors",
                    isActive
                      ? "bg-[hsl(var(--sidebar-accent))] text-foreground"
                      : "text-[hsl(var(--sidebar-foreground))] hover:bg-[hsl(var(--sidebar-accent))]",
                    collapsed && "justify-center px-0"
                  )
                }
                title={collapsed ? label : undefined}
              >
                <Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.8} />
                {!collapsed && <span>{label}</span>}
              </NavLink>
            );
          })}
        </nav>

        <div className="px-2 pb-3 space-y-0.5">
          <NavLink
            to="/settings"
            className={({ isActive }) =>
              cn(
                "flex w-full items-center gap-2.5 rounded-md px-2 py-[6px] text-[13px] font-medium transition-colors",
                isActive
                  ? "bg-[hsl(var(--sidebar-accent))] text-foreground"
                  : "text-[hsl(var(--sidebar-foreground))] hover:bg-[hsl(var(--sidebar-accent))]",
                collapsed && "justify-center px-0"
              )
            }
            title={collapsed ? "Settings" : undefined}
          >
            <Settings className="h-[18px] w-[18px] shrink-0" strokeWidth={1.8} />
            {!collapsed && <span>Settings</span>}
          </NavLink>
          <button
            onClick={handleLogout}
            className={cn(
              "flex w-full items-center gap-2.5 rounded-md px-2 py-[6px] text-[13px] font-medium text-[hsl(var(--sidebar-foreground))] hover:bg-[hsl(var(--sidebar-accent))] transition-colors",
              collapsed && "justify-center px-0"
            )}
            title={collapsed ? "Logout" : undefined}
          >
            <LogOut className="h-[18px] w-[18px] shrink-0" strokeWidth={1.8} />
            {!collapsed && <span>Logout</span>}
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main
        className={cn(
          "flex-1 pb-[72px] md:pb-0 transition-all duration-200",
          collapsed ? "md:pl-[52px]" : "md:pl-[240px]"
        )}
      >
        <div className="mx-auto max-w-[1400px] px-4 pt-4 pb-4 md:px-10 md:pt-6 md:pb-6 overflow-x-hidden">
          {children}
        </div>
      </main>

      <PwaInstallPrompt />
    </div>
  );
};

export default AppLayout;
