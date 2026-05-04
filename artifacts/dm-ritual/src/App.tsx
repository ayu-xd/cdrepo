import { useEffect, useState } from "react";
import { FullPageSkeleton } from "@/components/ui/skeleton-shimmer";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import Auth from "./pages/Auth";

// Fix #15: redirect logged-in users away from /auth
const AuthGuard = () => {
  const [checking, setChecking] = useState(true);
  const [authed, setAuthed] = useState(false);
  useEffect(() => {
    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        setAuthed(!!session);
        setChecking(false);
      })
      .catch(() => setChecking(false));
  }, []);
  if (checking) return null;
  return authed ? <Navigate to="/" replace /> : <Auth />;
};
import Dashboard from "./pages/Dashboard";
import Actions from "./pages/Actions";
import Contacts from "./pages/Contacts";
import History from "./pages/History";
import Pipeline from "./pages/Pipeline";
import Settings from "./pages/Settings";
import Scraper from "./pages/Scraper";
import CampaignList from "./pages/CampaignList";
import CampaignWizard from "./pages/CampaignWizard";
import CampaignDetail from "./pages/CampaignDetail";
import Targets from "./pages/Targets";
import Browsers from "./pages/Browsers";
import AppLayout from "./components/AppLayout";
import NotFound from "./pages/NotFound";
import { SettingsProvider } from "@/contexts/SettingsContext";

const queryClient = new QueryClient();

const ProtectedApp = () => {
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user?.id ?? null);
      setLoading(false);
    });

    // Fix #5: handle getSession rejection so loading is never stuck
    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        setUserId(session?.user?.id ?? null);
        setLoading(false);
      })
      .catch(() => {
        setUserId(null);
        setLoading(false);
      });

    return () => subscription.unsubscribe();
  }, []);

  if (loading) {
    return <FullPageSkeleton />;
  }

  if (!userId) {
    return <Navigate to="/auth" replace />;
  }

  return (
    <SettingsProvider userId={userId}>
      <AppLayout>
        <Routes>
          <Route path="/" element={<Dashboard userId={userId} />} />
          <Route path="/campaigns" element={<CampaignList userId={userId} />} />
          <Route path="/campaigns/new" element={<CampaignWizard userId={userId} />} />
          <Route path="/campaigns/:id" element={<CampaignDetail userId={userId} />} />
          <Route path="/targets" element={<Targets userId={userId} />} />
          <Route path="/browsers" element={<Browsers userId={userId} />} />
          <Route path="/actions" element={<Actions userId={userId} />} />
          <Route path="/contacts" element={<Contacts userId={userId} />} />
          <Route path="/pipeline" element={<Pipeline userId={userId} />} />
          <Route path="/scraper" element={<Scraper userId={userId} />} />
          <Route path="/analytics" element={<History userId={userId} />} />
          <Route path="/history" element={<Navigate to="/analytics" replace />} />
          <Route path="/settings" element={<Settings userId={userId} />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </AppLayout>
    </SettingsProvider>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/auth" element={<AuthGuard />} />
          <Route path="/*" element={<ProtectedApp />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
