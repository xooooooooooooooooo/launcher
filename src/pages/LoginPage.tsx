import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

const DEMO_KEY = "HADES-DEV-KEY";

const LoginPage = () => {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [key, setKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!username || !password || !key) {
      setError("Bitte Benutzername, Passwort und Key ausfüllen.");
      return;
    }
    if (key !== DEMO_KEY) {
      setError("Ungültiger Key. (Demo: HADES-DEV-KEY)");
      return;
    }

    setLoading(true);
    localStorage.setItem("hades_auth", JSON.stringify({ username, ts: Date.now() }));
    navigate("/launcher", { replace: true });
  };

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-gradient-to-br from-background via-background/95 to-background/90 min-h-full min-w-full">
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.35 }}
        className="w-full max-w-md rounded-2xl border border-border bg-card/95 p-6 shadow-2xl backdrop-blur-xl"
      >
        <div className="mb-4 text-center">
          <h1 className="font-display text-2xl font-bold text-foreground">Hades Launcher</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            Melde dich mit deinem Account und Key an, um den Launcher zu verwenden.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="username">Benutzername</Label>
            <Input
              id="username"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Dein Name"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Passwort</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="key">Lizenz-Key</Label>
            <Input
              id="key"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="HADES-XXXX-XXXX"
            />
            <p className="text-[10px] text-muted-foreground">
              Demo-Key zum Testen: <span className="font-mono">HADES-DEV-KEY</span>
            </p>
          </div>

          {error && (
            <p className="text-xs font-medium text-red-400">{error}</p>
          )}

          <Button type="submit" className="mt-2 w-full" disabled={loading}>
            {loading ? "Prüfe Zugang..." : "Login"}
          </Button>
        </form>
      </motion.div>
    </div>
  );
};

export default LoginPage;
