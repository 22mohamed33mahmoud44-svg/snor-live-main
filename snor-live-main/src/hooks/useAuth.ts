import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../supabase';
import { uploadAvatar } from '../utils/avatarStorage';

export interface OnboardingData {
  birthdate: string;
  gender: 'male' | 'female' | '';
  lookingFor: 'male' | 'female' | '';
  profileImage: string | null;
}

export function useAuth() {
  const [user, setUser] = useState<any>(null);
  const [profileChecked, setProfileChecked] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);

  const profileCheckRequestRef = useRef(0);
  const checkedUserIdRef = useRef<string | null>(null);

  const checkProfile = useCallback(async (userId: string, force = false) => {
    if (!force && checkedUserIdRef.current === userId) return;

    const requestId = ++profileCheckRequestRef.current;
    checkedUserIdRef.current = userId;

    setProfileChecked(false);
    setProfileError(null);
    setShowOnboarding(false);

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, gender, birthdate, looking_for')
        .eq('id', userId)
        .maybeSingle();

      if (requestId !== profileCheckRequestRef.current) return;

      if (error) {
        console.error('Profile check failed:', error);
        setProfileError('تعذر التحقق من ملفك الشخصي. حاول مرة أخرى.');
        return;
      }

      if (!data) setShowOnboarding(true);
    } catch (error) {
      if (requestId !== profileCheckRequestRef.current) return;
      console.error('Profile check failed:', error);
      setProfileError('تعذر التحقق من ملفك الشخصي. حاول مرة أخرى.');
    } finally {
      if (requestId === profileCheckRequestRef.current) setProfileChecked(true);
    }
  }, []);

  const handleOnboardingComplete = async (data: OnboardingData, userId: string) => {
    let avatarUrl: string | null = null;

    if (data.profileImage) {
      try {
        const res = await fetch(data.profileImage);
        if (!res.ok) throw new Error(`Image fetch failed: ${res.status}`);

        const blob = await res.blob();
        if (!blob.type.startsWith('image/')) throw new Error('Invalid image type');
        if (blob.size > 5 * 1024 * 1024) throw new Error('Image is larger than 5MB');

        avatarUrl = await uploadAvatar(userId, blob);
      } catch (error) {
        console.error('Avatar upload failed:', error);
        setProfileError('تعذر رفع صورة الملف الشخصي. يمكنك المحاولة مرة أخرى.');
        return;
      }
    }

    try {
      const { error } = await supabase.from('profiles').upsert({
        id: userId,
        gender: data.gender,
        birthdate: data.birthdate,
        looking_for: data.lookingFor,
        avatar_url: avatarUrl,
      });

      if (error) {
        console.error('Profile save failed:', error);
        setProfileError('تعذر حفظ بيانات ملفك الشخصي. حاول مرة أخرى.');
        return;
      }

      setProfileError(null);
      setShowOnboarding(false);
      setProfileChecked(true);
      checkedUserIdRef.current = userId;
    } catch (error) {
      console.error('Profile save failed:', error);
      setProfileError('تعذر حفظ بيانات ملفك الشخصي. حاول مرة أخرى.');
    }
  };

  const logout = async () => {
    ++profileCheckRequestRef.current;
    checkedUserIdRef.current = null;

    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error('Logout failed:', error);
      setProfileError('تعذر تسجيل الخروج. حاول مرة أخرى.');
      return;
    }

    setUser(null);
    setProfileChecked(false);
    setProfileError(null);
    setShowOnboarding(false);
  };

  useEffect(() => {
    let mounted = true;

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;

      if (session?.user) {
        setUser(session.user);
        void checkProfile(session.user.id);
      } else {
        ++profileCheckRequestRef.current;
        checkedUserIdRef.current = null;
        setUser(null);
        setProfileChecked(true);
        setProfileError(null);
        setShowOnboarding(false);
      }
    });

    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (!mounted) return;

      if (error) {
        console.error('Session restore failed:', error);
        setProfileError('تعذر استعادة جلسة تسجيل الدخول. حاول تحديث الصفحة.');
        setProfileChecked(true);
        return;
      }

      if (session?.user) {
        setUser(session.user);
        void checkProfile(session.user.id);
      } else {
        setUser(null);
        setProfileChecked(true);
      }
    }).catch((error) => {
      if (!mounted) return;
      console.error('Session restore failed:', error);
      setProfileError('تعذر استعادة جلسة تسجيل الدخول. حاول تحديث الصفحة.');
      setProfileChecked(true);
    });

    return () => {
      mounted = false;
      ++profileCheckRequestRef.current;
      subscription.unsubscribe();
    };
  }, [checkProfile]);

  return {
    user,
    profileChecked,
    profileError,
    showOnboarding,
    handleOnboardingComplete,
    logout,
  };
}
