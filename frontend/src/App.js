import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "sonner";
import { DataProvider } from "@/context/DataContext";
import AppLayout from "@/components/AppLayout";
import Dashboard from "@/pages/Dashboard";
import IdeaList from "@/pages/IdeaList";
import Programs from "@/pages/Programs";
import TopLists from "@/pages/TopLists";
import Settings from "@/pages/Settings";
import AIDashboard from "@/pages/AIDashboard";
import Ranking from "@/pages/Ranking";
import IdeaDrawer from "@/components/IdeaDrawer";

export default function App() {
  return (
    <div className="App">
      <DataProvider>
        <BrowserRouter>
          <AppLayout>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/lista" element={<IdeaList />} />
              <Route path="/programok" element={<Programs />} />
              <Route path="/toplistak" element={<TopLists />} />
              <Route path="/debora" element={<Navigate to="/" replace />} />
              <Route path="/ai-dashboard" element={<AIDashboard />} />
              <Route path="/rangsor" element={<Ranking />} />
              <Route path="/beallitasok" element={<Settings />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </AppLayout>
          <IdeaDrawer />
        </BrowserRouter>
        <Toaster position="top-right" richColors closeButton />
      </DataProvider>
    </div>
  );
}
