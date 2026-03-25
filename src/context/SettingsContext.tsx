import React, { createContext, useContext, useEffect, useState } from "react";

export type SettingKey = "autoInject" | "stealthMode" | "startMinimized" | "checkUpdates" | "useCloudSync" | "useBetaPayload" | "requireSubscription" | "useLocalFallback";

/** Launcher appearance theme. "shader" = premium animated background, "vanguard" = cinematic 3D layout. */
export type LauncherTheme = "default" | "minimal" | "professional" | "shader" | "vanguard";

/** Shader preset when launcher theme is "shader". */
export type ShaderPresetId = "gold-orbs" | "stars" | "aurora" | "waves";

export interface SettingsState {
    autoInject: boolean;
    stealthMode: boolean;
    useCloudSync: boolean;
    useBetaPayload: boolean;
    requireSubscription: boolean;
    useLocalFallback: boolean;
    startMinimized: boolean;
    checkUpdates: boolean;
    /** Launcher UI theme (default, minimal, or premium shader). */
    launcherTheme: LauncherTheme;
    /** Which shader to show when launcherTheme is "shader". */
    shaderPreset: ShaderPresetId;
    /** Custom hex color for the professional theme primary accent. */
    primaryColor: string;
    /** Internal flag to handle cache migrations between versions. */
    migratedV102?: boolean;
}

interface SettingsContextType {
    settings: SettingsState;
    updateSetting: (key: SettingKey, value: boolean) => void;
    setLauncherTheme: (theme: LauncherTheme) => void;
    setShaderPreset: (preset: ShaderPresetId) => void;
    setPrimaryColor: (color: string) => void;
}

const defaultSettings: SettingsState = {
    autoInject: false,
    stealthMode: true,
    useCloudSync: true,
    useBetaPayload: false,
    requireSubscription: true,
    useLocalFallback: false,
    startMinimized: false,
    checkUpdates: true,
    launcherTheme: "professional",
    shaderPreset: "gold-orbs",
    primaryColor: "#ffffff",
};

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
    const [settings, setSettings] = useState<SettingsState>(() => {
        try {
            const stored = localStorage.getItem("hades_settings");
            if (stored) {
                const parsed = JSON.parse(stored) as Partial<SettingsState>;
                let finalTheme = (parsed.launcherTheme as LauncherTheme) ?? defaultSettings.launcherTheme;
                
                // Overwrite legacy themes for upgrading users
                if (!parsed.migratedV102) {
                    finalTheme = "professional";
                }

                return {
                    ...defaultSettings,
                    ...parsed,
                    launcherTheme: finalTheme,
                    shaderPreset: (parsed.shaderPreset as SettingsState["shaderPreset"]) ?? defaultSettings.shaderPreset,
                    primaryColor: parsed.primaryColor ?? defaultSettings.primaryColor,
                    migratedV102: true,
                };
            }
        } catch (e) {
            console.error("Failed to load settings:", e);
        }
        return defaultSettings;
    });

    useEffect(() => {
        try {
            localStorage.setItem("hades_settings", JSON.stringify(settings));
        } catch (e) {
            console.error("Failed to save settings:", e);
        }
    }, [settings]);

    const updateSetting = (key: SettingKey, value: boolean) => {
        setSettings((prev) => ({ ...prev, [key]: value }));
    };

    const setLauncherTheme = (launcherTheme: LauncherTheme) => {
        setSettings((prev) => ({ ...prev, launcherTheme }));
    };

    const setShaderPreset = (shaderPreset: ShaderPresetId) => {
        setSettings((prev) => ({ ...prev, shaderPreset }));
    };

    const setPrimaryColor = (primaryColor: string) => {
        setSettings((prev) => ({ ...prev, primaryColor }));
    };

    return (
        <SettingsContext.Provider value={{ settings, updateSetting, setLauncherTheme, setShaderPreset, setPrimaryColor }}>
            {children}
        </SettingsContext.Provider>
    );
}

export function useSettings() {
    const context = useContext(SettingsContext);
    if (context === undefined) {
        throw new Error("useSettings must be used within a SettingsProvider");
    }
    return context;
}
