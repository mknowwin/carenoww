import { useState } from "react";
import { ReactNode } from "react";
import Sidebar from "./sidebar";
import TopNav from "./top-nav";

export default function AdminLayout({ children }: { children: ReactNode }) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [sidebarHovered, setSidebarHovered] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar
        isCollapsed={isCollapsed}
        onToggleCollapse={() => setIsCollapsed((v) => !v)}
        onHover={setSidebarHovered}
        sidebarHovered={sidebarHovered}
      />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <TopNav onToggleSidebar={() => setIsCollapsed((v) => !v)} />
        <main className="flex-1 overflow-y-auto p-6 dashboard-bg">
          {children}
        </main>
      </div>
    </div>
  );
}
