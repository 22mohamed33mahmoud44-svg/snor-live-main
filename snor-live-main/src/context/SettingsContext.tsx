import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { logError } from '../utils/logError';

// ── Types ────────────────────────────────────────────────────────
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

// ── Default Values ───────────────────────────────────────────────
const defaultSettings: UserSettings = {
  notif: true,
  sound: true,
  liveNotif: false,
  discover: true,
  hideOnline: false,
  dark: true,
  neon: true,
};

// ── Context ──────────────────────────────────────────────────────
const SettingsContext = createContext<SettingsContextType | null>(null);

export const SettingsProvider = ({ children, userId }: { children: React.ReactNode, userId?: string }) => {
  const [isLoading, setIsLoading] = useState(true);

  // 1. التهيئة المبدئية من LocalStorage لسرعة عرض الواجهة
  const [settings, setSettings] = useState<UserSettings>(() => {
    try {
      const localSettings = localStorage.getItem('user_app_settings');
      return localSettings ? JSON.parse(localSettings) : defaultSettings;
    } catch (error) {
      logError('SettingsProvider.readLocalSettings', error);
      return defaultSettings;
    }
  });

  // 2. جلب الإعدادات من Supabase عند تسجيل الدخول أو تحميل التطبيق
  useEffect(() => {
    const fetchSettings = async () => {
      if (!userId) {
        setIsLoading(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('settings')
          .eq('id', userId)
          .single();

        if (error) {
          logError('SettingsProvider.fetchSettings', error);
        }

        if (data?.settings) {
          const mergedSettings = { ...defaultSettings, ...data.settings };
          setSettings(mergedSettings);
          localStorage.setItem('user_app_settings', JSON.stringify(mergedSettings));
        }
      } catch (error) {
        logError('SettingsProvider.fetchSettings', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchSettings();
  }, [userId]);

  // 3. تطبيق التأثيرات المرئية (CSS) على مستوى التطبيق بالكامل
  useEffect(() => {
    const root = document.documentElement;
    
    if (settings.dark) {
      root.classList.add('dark');
      root.classList.remove('light');
    } else {
      root.classList.add('light');
      root.classList.remove('dark');
    }

    if (settings.neon) {
      root.classList.add('neon-active');
    } else {
      root.classList.remove('neon-active');
    }
  }, [settings.dark, settings.neon]);

  // 4. دالة التحديث (استجابة فورية + حفظ محلي + مزامنة سحابية)
  const updateSetting = async <K extends keyof UserSettings>(key: K, value: UserSettings[K]) => {
    // التحديث الفوري للواجهة لضمان سرعة الاستجابة
    const newSettings = { ...settings, [key]: value };
    setSettings(newSettings);
    
    // الحفظ في LocalStorage
    localStorage.setItem('user_app_settings', JSON.stringify(newSettings));

    // المزامنة مع Supabase في الخلفية
    if (userId) {
      try {
        // supabase لا يرمي استثناءً عند فشل الاستعلام، لذلك نفحص error صريحاً
        const { error } = await supabase
          .from('profiles')
          .update({ settings: newSettings })
          .eq('id', userId);

        if (error) logError('SettingsProvider.syncSetting', error);
      } catch (error) {
        logError('SettingsProvider.syncSetting', error);
      }
    }
  };

  return (
    <SettingsContext.Provider value={{ settings, updateSetting, isLoading }}>
      {children}
    </SettingsContext.Provider>
  );
};

// Custom Hook لتسهيل الاستخدام
export const useSettings = () => {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
};