import { useEffect, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";
import { toast } from "sonner";
import { useSettings } from "@/context/SettingsContext";

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
    const { settings } = useSettings();

    useEffect(() => {
        if (hasSynced.current) return;
        hasSynced.current = true;

        const sync = async () => {
            try {
                // Respect the Cloud Payload Sync setting
                if (!settings.useCloudSync) {
                    console.log("[DllSync] Cloud Payload Sync is OFF — skipping download.");
                    return;
                }

                // Get the current session JWT
                const { data: { session } } = await supabase.auth.getSession();
                if (!session?.access_token) return;

                toast.loading("Syncing client files...", { id: "dll-sync" });

                // API check completely eliminated to improve stealth and silence

                // Native storage bypass REMOVED — Supabase CDN caches old versions.
                // Always use the Edge Function signed URL for fresh downloads.

                // 2. DOWNLOAD VIA SIGNED URL FROM EDGE FUNCTION
                toast.loading("Requesting signed download URL...", { id: "dll-sync" });

                const endpointName = "launcher-download";
                const dlResponse = await fetch(`https://szxxwxwityixqzzmarlq.supabase.co/functions/v1/${endpointName}`, {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${session.access_token}`,
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({ requireSubscription: settings.requireSubscription })
                });

                if (!dlResponse.ok) {
                    let errMsg = `HTTP ${dlResponse.status}`;
                    try {
                        const errJson = await dlResponse.json();
                        errMsg = errJson.error || errJson.message || errMsg;
                    } catch {
                        errMsg = dlResponse.statusText;
                    }
                    console.warn(`Cloud Access Denied: ${errMsg}`);
                    toast.error(`Cloud Access Denied: ${errMsg}`, { id: "dll-sync", duration: 10000 });
                    return;
                }

                const dlData = await dlResponse.json();
                if (!dlData.url) {
                    console.warn("Cloud Error: The Edge Function did not return a valid download URL.");
                    toast.error("Cloud Error: The Edge Function did not return a valid download URL.", { id: "dll-sync" });
                    return;
                }

                toast.loading("Downloading payload into memory...", { id: "dll-sync" });

                // Fetch the payload data from the signed URL
                const payloadResponse = await fetch(dlData.url);
                if (!payloadResponse.ok) {
                    console.warn("Network Error: Failed to download the payload bytes from the signed URL.");
                    toast.error("Network Error: Failed to download the payload bytes from the signed URL.", { id: "dll-sync" });
                    return;
                }

                let bytes = await payloadResponse.arrayBuffer();

                // DETECT NESTED JSON: The user stated the bucket file is sometimes a JSON pointer instead of raw binary
                try {
                    const textDecoder = new TextDecoder("utf-8", { fatal: true });
                    const possibleJsonString = textDecoder.decode(bytes);
                    if (possibleJsonString.trim().startsWith("{") && possibleJsonString.trim().endsWith("}")) {
                        const parsed = JSON.parse(possibleJsonString);
                        const innerUrl = parsed.url || parsed.link || parsed.download;
                        if (innerUrl && typeof innerUrl === "string" && innerUrl.startsWith("http")) {
                            console.log("[Cloud Sync] Detected JSON pointer file. Re-routing payload download to: " + innerUrl);
                            const realDllResponse = await fetch(innerUrl);
                            if (!realDllResponse.ok) {
                                console.warn("Network Error: Failed to fetch the nested DLL from the JSON pointer URL!");
                                return;
                            }
                            bytes = await realDllResponse.arrayBuffer();
                        } else {
                            console.warn("The payload was a JSON file, but it didn't contain a valid 'url' or 'link' property!");
                            return;
                        }
                    }
                } catch (e) {
                    // Not valid UTF-8 JSON. This means it is the actual binary DLL. Proceed safely.
                }

                if (bytes.byteLength === 0) {
                    console.warn("DLL sync failed: empty response.");
                    toast.error("DLL sync failed: empty response.", { id: "dll-sync" });
                    return;
                }

                // Pass the raw memory buffer to the parent state instead of writing to disk
                onDllFetched("hades.dll", bytes);
                toast.success("Client payload loaded into Memory!", { id: "dll-sync" });
            } catch (err: any) {
                // Backend offline or network error
                console.warn(`Exception during cloud sync: ${err.message}`);
                toast.dismiss("dll-sync");
                console.warn("[DllSync] Could not sync DLL:", err.message);
            }
        };

        sync();
    }, []);

    return null;
}
