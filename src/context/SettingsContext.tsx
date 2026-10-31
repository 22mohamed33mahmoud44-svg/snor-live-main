import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../supabase';

export interface UserSettings {
  notif: boolean;
  sound: boolean;
  liveNotif: boolean;
  discover: boolean;
  hideOnline: boolean;
  dark: boolean;
  neon: boolean;
}

interface SettingsContextType {
  settings: UserSettings;
  updateSetting: <K extends keyof UserSettings>(key: K, value: UserSettings[K]) => Promise<void>;
  isLoading: boolean;
}

const defaultSettings: UserSettings = {
  notif: true, sound: true, liveNotif: false, discover: true,
  hideOnline: false, dark: true, neon: true,
};

const SettingsContext = createContext<SettingsContextType | null>(null);
const settingsKey = (userId?: string) => `user_app_settings_${userId || 'guest'}`;

function readLocalSettings(userId?: string): UserSettings {
  try {
    const saved = localStorage.getItem(settingsKey(userId));
    return saved ? { ...defaultSettings, ...JSON.parse(saved) } : { ...defaultSettings };
  } catch {
    return { ...defaultSettings };
  }
}

export const SettingsProvider = ({ children, userId }: { children: React.ReactNode; userId?: string }) => {
  const [isLoading, setIsLoading] = useState(true);
  const [settings, setSettings] = useState<UserSettings>(() => readLocalSettings(userId));

  // The production profiles view has no 'settings' JSON column. The actual
  // privacy fields are show_in_radar and hide_online; other preferences are local.
  useEffect(() => {
    let canceled = false;
    const local = readLocalSettings(userId);
    setSettings(local);
    setIsLoading(!!userId);

    if (!userId) return;

    const fetchPrivacy = async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('show_in_radar, hide_online')
        .eq('id', userId)
        .maybeSingle();
      if (canceled) return;

      if (error) {
        console.warn('Could not fetch profile privacy settings', error);
      } else if (data) {
        const merged: UserSettings = {
          ...local,
          discover: typeof data.show_in_radar === 'boolean' ? data.show_in_radar : local.discover,
          hideOnline: typeof data.hide_online === 'boolean' ? data.hide_online : local.hideOnline,
        };
        setSettings(merged);
        localStorage.setItem(settingsKey(userId), JSON.stringify(merged));
      }
      setIsLoading(false);
    };
    void fetchPrivacy();
    return () => { canceled = true; };
  }, [userId]);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', settings.dark);
    root.classList.toggle('light', !settings.dark);
    root.classList.toggle('neon-active', settings.neon);
  }, [settings.dark, settings.neon]);

  const updateSetting = async <K extends keyof UserSettings>(key: K, value: UserSettings[K]) => {
    const updated = { ...settings, [key]: value };
    setSettings(updated);
    localStorage.setItem(settingsKey(userId), JSON.stringify(updated));

    if (!userId) return;
    const dbField = key === 'discover'
      ? 'show_in_radar'
      : key === 'hideOnline' ? 'hide_online' : null;
    if (!dbField) return; // The remaining preferences are device-local.

    const { error } = await supabase
      .from('profiles')
      .update({ [dbField]: value })
      .eq('id', userId);
    if (error) console.warn('Could not synchronize privacy setting', error);
  };

  return (
    <SettingsContext.Provider value={{ settings, updateSetting, isLoading }}>
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = () => {
  const context = useContext(SettingsContext);
  if (!context) throw new Error('useSettings must be used within a SettingsProvider');
  return context;
};
