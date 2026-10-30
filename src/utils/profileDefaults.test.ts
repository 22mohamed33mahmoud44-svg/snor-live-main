/// <reference lib="deno.ns" />
import { newProfileRequiredFields } from './profileDefaults.ts';

const id = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
function assert(ok: unknown, explanation: string) {
  if (!ok) throw new Error(explanation);
}
Deno.test('new onboarding creates stable valid username without a user-entered name', () => {
  const one = newProfileRequiredFields(id, { gender: 'male', birthdate: '2000-01-01', avatar_url: null });
  const two = newProfileRequiredFields(id, { gender: 'male', birthdate: '2000-01-01' });
  const otherName = newProfileRequiredFields(other, { gender: 'female', birthdate: '2002-02-02' });
  assert(one.username === 'user_11111111111141118111111111111111', 'Username is incorrect');
  assert(one.username === two.username, 'Username should be stable after retry');
  assert(one.username !== otherName.username, 'Distinct accounts must get distinct defaults');
  assert(one.username.length <= 50, 'Username violates database length limit');
  assert(one.avatar_url === '' && two.avatar_url === '', 'Optional photo must not be database NULL');
});
Deno.test('explicit names and uploaded avatars are preserved', () => {
  const r = newProfileRequiredFields(id, {
    username: '  sara  ', gender: 'female', birthdate: '1999-05-07',
    avatar_url: 'https://example.org/avatar.jpg',
  });
  assert(r.username === 'sara', 'Explicit name must be used');
  assert(r.avatar_url === 'https://example.org/avatar.jpg', 'Uploaded avatar lost');
});
Deno.test('invalid identities, missing required attributes and oversized names fail closed', () => {
  const expectThrows = (fn: () => unknown) => {
    let rejected = false;
    try { fn(); } catch { rejected = true; }
    assert(rejected, 'Unsafe profile insert unexpectedly accepted');
  };
  expectThrows(() => newProfileRequiredFields('not-a-uuid', { gender:'male', birthdate:'2000-01-01' }));
  expectThrows(() => newProfileRequiredFields(id, { birthdate:'2000-01-01' }));
  expectThrows(() => newProfileRequiredFields(id, { gender:'male' }));
  expectThrows(() => newProfileRequiredFields(id, { gender:'male', birthdate:'2000-01-01', username:'a'.repeat(51) }));
});
