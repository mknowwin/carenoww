import { useEffect, useState } from "react";
import { ReactNode } from "react";
import Sidebar from "./sidebar";
import TopNav from "./top-nav";
import { useIsMobile } from "@/hooks/use-mobile";

export default function AdminLayout({ children }: { children: ReactNode }) {
  const isMobile = useIsMobile();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [sidebarHovered, setSidebarHovered] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  useEffect(() => {
    if (!isMobile) setMobileSidebarOpen(false);
  }, [isMobile]);

  const handleToggleSidebar = () => {
    if (isMobile) setMobileSidebarOpen((v) => !v);
    else setIsCollapsed((v) => !v);
  };

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar
        isCollapsed={isCollapsed}
        onToggleCollapse={() => setIsCollapsed((v) => !v)}
        onHover={setSidebarHovered}
        sidebarHovered={sidebarHovered}
        isMobile={isMobile}
        isMobileOpen={mobileSidebarOpen}
        onMobileClose={() => setMobileSidebarOpen(false)}
      />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <TopNav onToggleSidebar={handleToggleSidebar} />
        <main className="flex-1 overflow-y-auto p-3 sm:p-6 dashboard-bg">
          {children}
        </main>
      </div>
    </div>
  );
}
