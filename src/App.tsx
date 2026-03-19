import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HashRouter, Routes, Route, Navigate, useLocation, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { SettingsProvider } from "@/context/SettingsContext";
import Launcher from "./pages/Index";
import NotFound from "./pages/NotFound";
import Login from "./components/Login";
import DllSync from "./components/launcher/DllSync";
import { useEffect, useState } from "react";
import { supabase } from "./lib/supabaseClient";

const pageTransition = {
  initial: { opacity: 0, y: 24 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -24 },
  transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] },
};

function AuthView({ session, profile }: { session: any; profile: any }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [dllPayload, setDllPayload] = useState<{ name: string; buffer: ArrayBuffer } | null>(null);

  useEffect(() => {
    if (!session && location.pathname === "/launcher") navigate("/", { replace: true });
    if (session && location.pathname === "/") navigate("/launcher", { replace: true });
  }, [session, location.pathname, navigate]);

  return (
    <AnimatePresence mode="wait">
      {!session ? (
        <motion.div
          key="login"
          initial={pageTransition.initial}
          animate={pageTransition.animate}
          exit={pageTransition.exit}
          transition={pageTransition.transition}
          className="h-full w-full min-h-0 min-w-0"
        >
          <Login onLoginSuccess={() => {}} />
        </motion.div>
      ) : (
        <motion.div
          key="launcher"
          initial={pageTransition.initial}
          animate={pageTransition.animate}
          exit={pageTransition.exit}
          transition={pageTransition.transition}
          className="h-full w-full min-h-0 min-w-0"
        >
          <DllSync onDllFetched={(name, buffer) => setDllPayload({ name, buffer })} />
          <Launcher profile={profile} user={session.user} session={session} dllPayload={dllPayload} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

const queryClient = new QueryClient();

const App = () => {
  const [session, setSession] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = async (userId: string) => {
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("user_id", userId)
      .single();
    setProfile(data);
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session?.user) fetchProfile(session.user.id);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setSession(session);
      if (session?.user) {
        fetchProfile(session.user.id);
      } else {
        setProfile(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading) {
    return <div className="flex h-screen items-center justify-center text-white">Loading...</div>;
  }

  return (
    <SettingsProvider>
      <div className="h-full w-full min-h-0 min-w-0">
        <QueryClientProvider client={queryClient}>
          <TooltipProvider>
            <Toaster />
            <HashRouter>
              <div className="h-full w-full min-h-0 min-w-0">
                <Routes>
                  <Route path="/" element={<AuthView session={session} profile={profile} />} />
                  <Route path="/launcher" element={<AuthView session={session} profile={profile} />} />
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </div>
            </HashRouter>
          </TooltipProvider>
        </QueryClientProvider>
      </div>
    </SettingsProvider>
  );
};

export default App;
