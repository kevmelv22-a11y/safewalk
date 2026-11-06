import { mutation, query } from './_generated/server';
import { v } from 'convex/values';
import { getAuthUserId } from '@convex-dev/auth/server';
import { audit, fail, rateLimit, requireUser } from './lib';

/** Normaliseer NL/internationaal telefoonnummer tot digits met optionele + (minimale opslag). */
export function normalizePhone(raw: string): string | null {
  const cleaned = raw.replace(/[^\d+]/g, '');
  const digits = cleaned.replace(/\D/g, '');
  if (digits.length < 8 || digits.length > 15) return null;
  if (digits.startsWith('0') && digits.length === 10) return '+31' + digits.slice(1); // NL mobiel
  if (cleaned.startsWith('+')) return '+' + digits;
  return '+' + digits;
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    const uid = await getAuthUserId(ctx);
    if (!uid) return [];
    return await ctx.db.query('deviceContacts').withIndex('by_user', (q) => q.eq('userId', uid)).collect();
  },
});

/** Sla alleen aangevinkte contacten op (naam + genormaliseerd nummer). Geen volledige sync. */
export const replaceSelection = mutation({
  args: {
    contacts: v.array(v.object({ displayName: v.string(), phone: v.string() })),
  },
  handler: async (ctx, { contacts }) => {
    const uid = await requireUser(ctx);
    await rateLimit(ctx, `devcontacts:${uid}`, 20, 60 * 60_000);
    if (contacts.length > 30) fail('BAD_REQUEST');
    const existing = await ctx.db.query('deviceContacts').withIndex('by_user', (q) => q.eq('userId', uid)).collect();
    for (const e of existing) await ctx.db.delete(e._id);
    let n = 0;
    for (const c of contacts) {
      const phoneE164 = normalizePhone(c.phone);
      if (!phoneE164) continue;
      const displayName = c.displayName.trim().slice(0, 80) || phoneE164;
      await ctx.db.insert('deviceContacts', { userId: uid, displayName, phoneE164, createdAt: Date.now() });
      n++;
    }
    await audit(ctx, uid, 'deviceContacts.replace', undefined, { count: n });
    return { saved: n };
  },
});

export const remove = mutation({
  args: { id: v.id('deviceContacts') },
  handler: async (ctx, { id }) => {
    const uid = await requireUser(ctx);
    const row = await ctx.db.get(id);
    if (!row || row.userId !== uid) fail('NOT_FOUND');
    await ctx.db.delete(id);
  },
});
