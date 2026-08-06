import Sidebar from "./Sidebar";
import TopBar from "./TopBar";
import FilterBar from "./FilterBar";
import DeboraWidget from "./DeboraWidget";
import { useLocation } from "react-router-dom";

export default function AppLayout({ children }) {
  const { pathname } = useLocation();
  const hideGlobalFilters = pathname === "/ai-dashboard" || pathname === "/rangsor";

  return (
    <div className="min-h-screen w-full flex bg-forest-50 text-forest-950">
      <Sidebar />
      <main className="flex-1 min-w-0 flex flex-col">
        <TopBar />
        {!hideGlobalFilters && <FilterBar />}
        <div data-testid="app-content" className="flex-1 px-6 md:px-10 pb-14">
          {children}
        </div>
      </main>
      <DeboraWidget />
    </div>
  );
}
