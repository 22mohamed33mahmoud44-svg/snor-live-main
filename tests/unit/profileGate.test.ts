/// <reference lib="deno.ns" />
import { requiresOnboarding, shouldShowProfileError } from '../../src/utils/profileGate.ts';

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

Deno.test('missing or partially initialized profiles must complete onboarding', () => {
  const complete = { gender: 'female', birthdate: '2000-01-01', looking_for: 'male' };
  assert(!requiresOnboarding(complete), 'complete profile was blocked');
  assert(requiresOnboarding(null), 'missing profile skipped onboarding');
  assert(requiresOnboarding({ ...complete, gender: null }), 'missing gender skipped onboarding');
  assert(requiresOnboarding({ ...complete, birthdate: '  ' }), 'blank birthdate skipped onboarding');
  assert(requiresOnboarding({ ...complete, looking_for: null }), 'missing preference skipped onboarding');
});

Deno.test('profile lookup failure blocks the dashboard even after the request completes', () => {
  const error = 'تعذر التحقق من ملفك الشخصي';
  assert(shouldShowProfileError(true, error, false), 'signed-in profile error must block dashboard');
  assert(!shouldShowProfileError(true, null, false), 'successful check should not show an error');
  assert(!shouldShowProfileError(true, error, true), 'onboarding must display its own save error');
  assert(!shouldShowProfileError(false, error, false), 'signed-out visitors should not see profile error');
});
