import { useState, useEffect } from 'react';
import { supabase } from '../supabase';

export interface OnboardingData {
  birthdate:    string;
  gender:       'male' | 'female' | '';
  lookingFor:   'male' | 'female' | '';
  profileImage: string | null;
}

export function useAuth() {
  const [user,                setUser]                = useState<any>(null);
  const [profileChecked,      setProfileChecked]      = useState(false);
  const [showOnboarding,      setShowOnboarding]      = useState(false);
  const [showCompleteProfile, setShowCompleteProfile] = useState(false);

  const checkProfile = async (userId: string) => {
    setProfileChecked(false);
    setShowOnboarding(false);
    setShowCompleteProfile(false);

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, gender, birthdate, looking_for')
        .eq('id', userId)
        .maybeSingle();

      if (error) {
        setProfileChecked(true);
        return;
      }

      setProfileChecked(true);
      if (!data) setShowOnboarding(true);
    } catch {
      setProfileChecked(true);
    }
  };

  const handleOnboardingComplete = async (data: OnboardingData, userId: string) => {
    let avatarUrl: string | null = null;

    if (data.profileImage) {
      try {
        const res = await fetch(data.profileImage);
        const blob = await res.blob();
        const fileName = `avatar-${userId}-${Date.now()}.jpg`;
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('avatars')
          .upload(fileName, blob, { contentType: 'image/jpeg', upsert: true });
        if (!uploadError && uploadData) {
          const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(fileName);
          avatarUrl = publicUrl;
        }
      } catch {
        // Image upload failed — continue without avatar
      }
    }

    await supabase.from('profiles').upsert({
      id:          userId,
      gender:      data.gender,
      birthdate:   data.birthdate,
      looking_for: data.lookingFor,
      avatar_url:  avatarUrl,
    });
    setShowOnboarding(false);
  };

  const logout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setProfileChecked(false);
    setShowOnboarding(false);
    setShowCompleteProfile(false);
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) { setUser(session.user); void checkProfile(session.user.id); }
      else { setUser(null); setProfileChecked(true); }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session?.user) { setUser(session.user); void checkProfile(session.user.id); }
      else { setUser(null); setProfileChecked(true); setShowOnboarding(false); setShowCompleteProfile(false); }
    });

    return () => subscription.unsubscribe();
  }, []);

  return {
    user,
    profileChecked,
    showOnboarding,
    showCompleteProfile,
    setShowCompleteProfile,
    handleOnboardingComplete,
    logout,
  };
}
