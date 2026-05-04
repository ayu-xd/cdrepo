import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface UserSettings {
  dm_limit: number;
  follow_limit: number;
  follow_before_dm: boolean;
  flywheel_days: number;
}

export const DEFAULT_SETTINGS: UserSettings = {
  dm_limit: 30,
  follow_limit: 30,
  follow_before_dm: true,
  flywheel_days: 90,
};

interface SettingsContextValue {
  settings: UserSettings;
  settingsLoading: boolean;
  refreshSettings: () => Promise<void>;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export const SettingsProvider = ({
  userId,
  children,
}: {
  userId: string;
  children: React.ReactNode;
}) => {
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [settingsLoading, setSettingsLoading] = useState(true);

  const refreshSettings = useCallback(async () => {
    const { data } = await supabase
      .from("user_settings")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();
    if (data) {
      setSettings({
        dm_limit: data.dm_limit ?? DEFAULT_SETTINGS.dm_limit,
        follow_limit: data.follow_limit ?? DEFAULT_SETTINGS.follow_limit,
        follow_before_dm: data.follow_before_dm ?? DEFAULT_SETTINGS.follow_before_dm,
        flywheel_days: data.flywheel_days ?? DEFAULT_SETTINGS.flywheel_days,
      });
    } else {
      await supabase.from("user_settings").insert({
        user_id: userId,
        dm_limit: DEFAULT_SETTINGS.dm_limit,
        follow_limit: DEFAULT_SETTINGS.follow_limit,
        follow_before_dm: DEFAULT_SETTINGS.follow_before_dm,
        flywheel_days: DEFAULT_SETTINGS.flywheel_days,
      });
      setSettings(DEFAULT_SETTINGS);
    }
    setSettingsLoading(false);
  }, [userId]);

  useEffect(() => {
    refreshSettings();
  }, [refreshSettings]);

  return (
    <SettingsContext.Provider value={{ settings, settingsLoading, refreshSettings }}>
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = () => {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used within SettingsProvider");
  return ctx;
};
