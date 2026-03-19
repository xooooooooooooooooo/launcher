import { useEffect, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";
import { toast } from "sonner";

const API_URL = "http://localhost:5000";

interface DllSyncProps {
    onDllFetched: (name: string, buffer: ArrayBuffer) => void;
}

/**
 * DllSync — runs once after login.
 * Fetches hades.dll from Supabase (launcher-download Edge Function)
 * and keeps it strictly in memory (RAM) via the onDllFetched callback.
 */
export default function DllSync({ onDllFetched }: DllSyncProps) {
    const hasSynced = useRef(false);

    useEffect(() => {
        if (hasSynced.current) return;
        hasSynced.current = true;

        const sync = async () => {
            try {
                // Get the current session JWT
                const { data: { session } } = await supabase.auth.getSession();
                if (!session?.access_token) return;

                toast.loading("Syncing client files...", { id: "dll-sync" });

                // 1. VERIFY USING THE WORKING ENDPOINT
                const response = await fetch(
                    `https://szxxwxwityixqzzmarlq.supabase.co/functions/v1/launcher-check-subscription`,
                    {
                        method: "POST",
                        headers: {
                            Authorization: `Bearer ${session.access_token}`,
                            "Content-Type": "application/json",
                        },
                    }
                );

                if (!response.ok) {
                    let msg = "Subscription verification failed";
                    try {
                        const json = await response.json();
                        msg = `Subscription check failed: ${json.error ?? response.statusText}`;
                    } catch { /* ignore parse error */ }
                    toast.error(msg, { id: "dll-sync" });
                    return;
                }

                const data = await response.json();
                
                if (!data.active) {
                    toast.error("No active subscription — Injection disabled.", { id: "dll-sync" });
                    return;
                }

                // 2. DOWNLOAD VIA SIGNED URL FROM EDGE FUNCTION
                toast.loading("Requesting signed download URL...", { id: "dll-sync" });
                
                const dlResponse = await fetch("https://szxxwxwityixqzzmarlq.supabase.co/functions/v1/launcher-download", {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${session.access_token}`,
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({})
                });

                if (!dlResponse.ok) {
                    let errMsg = `HTTP ${dlResponse.status}`;
                    try {
                        const errJson = await dlResponse.json();
                        errMsg = errJson.error || errJson.message || errMsg;
                    } catch {
                        errMsg = dlResponse.statusText;
                    }
                    toast.error(`Cloud Access Denied: ${errMsg}`, { id: "dll-sync" });
                    return;
                }

                const dlData = await dlResponse.json();
                if (!dlData.url) {
                    toast.error("Cloud Error: The Edge Function did not return a valid download URL.", { id: "dll-sync" });
                    return;
                }

                toast.loading("Downloading payload into memory...", { id: "dll-sync" });
                
                // Fetch the actual physical DLL bytes using the signed URL
                const payloadResponse = await fetch(dlData.url);
                if (!payloadResponse.ok) {
                    toast.error("Network Error: Failed to download the payload bytes from the signed URL.", { id: "dll-sync" });
                    return;
                }

                const bytes = await payloadResponse.arrayBuffer();

                if (bytes.byteLength === 0) {
                    toast.error("DLL sync failed: empty response.", { id: "dll-sync" });
                    return;
                }

                // Pass the raw memory buffer to the parent state instead of writing to disk
                onDllFetched("hades.dll", bytes);
                toast.success("Client payload loaded into Memory!", { id: "dll-sync" });
            } catch (err: any) {
                // Backend offline or network error — fail silently
                toast.dismiss("dll-sync");
                console.warn("[DllSync] Could not sync DLL:", err.message);
            }
        };

        sync();
    }, []);

    return null;
}
