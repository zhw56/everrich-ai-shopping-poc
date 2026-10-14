import { loadUsers } from '../data.js';
import type { Tool } from '../types.js';
import { maskName, maskPhone } from '../util/mask.js';

const DEMO_OTP = '123456';
const MAX_ATTEMPTS = 3;
const LOCK_MS = 10 * 60 * 1000;

export const verifyIdentity: Tool<{ phone: string; otp: string }> = {
  definition: {
    name: 'verify_identity',
    description: '以 RICHCLUB 會員手機號碼與簡訊驗證碼驗證會員身分。只有在用戶已經提供手機號碼與驗證碼時才呼叫，不可自行猜測驗證碼。',
    input_schema: {
      type: 'object',
      properties: {
        phone: { type: 'string', description: '會員手機號碼，例如 0900-000-001' },
        otp: { type: 'string', description: '6 位數驗證碼' },
      },
      required: ['phone', 'otp'],
    },
  },
  async run(input, ctx) {
    const s = ctx.session;
    const now = Date.now();
    if (s.locked_until && now < s.locked_until) return { ok: false, error: 'LOCKED' };
    const digits = (input.phone ?? '').replace(/[^0-9]/g, '');
    const user = loadUsers().users.find((u) => u.phone.replace(/[^0-9]/g, '') === digits);
    if (user && String(input.otp ?? '').trim() === DEMO_OTP) {
      s.verified = true;
      s.user_id = user.id;
      s.otp_attempts = 0;
      s.locked_until = null;
      return { ok: true, data: { verified: true, user_id: user.id, name: maskName(user.name), phone: maskPhone(user.phone), member_tier: user.member_tier } };
    }
    s.otp_attempts += 1;
    if (s.otp_attempts >= MAX_ATTEMPTS) {
      s.otp_attempts = 0;
      s.locked_until = now + LOCK_MS;
      return { ok: false, error: 'LOCKED' };
    }
    return { ok: false, error: 'INVALID_CREDENTIALS', data: { remaining_attempts: MAX_ATTEMPTS - s.otp_attempts } };
  },
};
