import { mutation, query } from './_generated/server';
import { v } from 'convex/values';
import { getAuthUserId } from '@convex-dev/auth/server';
import { audit, fail, rateLimit, requireAdult, requireUser } from './lib';

export const EXTERNAL_CONTACT_LIMIT = 30;

/** Normaliseer NL/internationaal telefoonnummer tot digits met optionele + (minimale opslag). */
export function normalizePhone(raw: string): string | null {
  const cleaned = raw.trim().replace(/[^\d+]/g, '');
  const digits = cleaned.replace(/\D/g, '');
  if (digits.length < 8 || digits.length > 15) return null;
  if (digits.startsWith('0') && digits.length === 10) return '+31' + digits.slice(1); // NL mobiel
  if (cleaned.startsWith('+')) return '+' + digits;
  return '+' + digits;
}

/** Kleine letters, geen spaties. Ongeldig → null. Geen stille andere wijziging dan case. */
export function normalizeEmail(raw: string): string | null {
  const email = raw.trim().toLowerCase();
  if (!email || email.length > 120) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

export function normalizeDisplayName(raw: string): string | null {
  const name = raw.trim().replace(/\s+/g, ' ');
  if (!name || name.length > 80) return null;
  return name;
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
    await requireAdult(ctx, uid);
    await rateLimit(ctx, `devcontacts:${uid}`, 20, 60 * 60_000);
    if (contacts.length > 30) fail('BAD_REQUEST');
    const existing = await ctx.db.query('deviceContacts').withIndex('by_user', (q) => q.eq('userId', uid)).collect();
    const manualPhones = new Set(existing.filter((e) => e.manual && e.phoneE164).map((e) => e.phoneE164!));
    for (const e of existing) {
      if (e.manual) continue;
      await ctx.db.delete(e._id);
    }
    let n = 0;
    for (const c of contacts) {
      const phoneE164 = normalizePhone(c.phone);
      if (!phoneE164 || manualPhones.has(phoneE164)) continue;
      const displayName = c.displayName.trim().slice(0, 80) || phoneE164;
      await ctx.db.insert('deviceContacts', { userId: uid, displayName, phoneE164, createdAt: Date.now() });
      n++;
    }
    await audit(ctx, uid, 'deviceContacts.replace', undefined, { count: n });
    return { saved: n };
  },
});

/**
 * Handmatig contact zonder account van de ontvanger. Minstens telefoon of e-mail.
 * Vraagt geen adresboek. Audit logt geen nummer of adres.
 */
export const saveManual = mutation({
  args: {
    id: v.optional(v.id('deviceContacts')),
    displayName: v.string(),
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
  },
  handler: async (ctx, a) => {
    const uid = await requireUser(ctx);
    await rateLimit(ctx, `devcontacts-manual:${uid}`, 30, 60 * 60_000);
    const displayName = normalizeDisplayName(a.displayName) ?? '';
    if (!displayName) fail('CONTACT_INVALID');
    const phoneRaw = a.phone?.trim() ?? '';
    const emailRaw = a.email?.trim() ?? '';
    if (!phoneRaw && !emailRaw) fail('CONTACT_INVALID');
    let phoneE164: string | undefined;
    if (phoneRaw) {
      phoneE164 = normalizePhone(phoneRaw) ?? undefined;
      if (!phoneE164) fail('CONTACT_INVALID');
    }
    let email: string | undefined;
    if (emailRaw) {
      email = normalizeEmail(emailRaw) ?? undefined;
      if (!email) fail('CONTACT_INVALID');
    }
    const existing = await ctx.db.query('deviceContacts').withIndex('by_user', (q) => q.eq('userId', uid)).collect();
    const current = a.id ? existing.find((e) => e._id === a.id) : undefined;
    if (a.id && (!current || !current.manual)) fail('NOT_FOUND');
    const dup = existing.find((e) => e._id !== a.id && ((phoneE164 && e.phoneE164 === phoneE164) || (email && e.email === email)));
    if (dup) fail('CONTACT_DUPLICATE');
    if (!current && existing.length >= EXTERNAL_CONTACT_LIMIT) fail('EXTERNAL_CONTACT_LIMIT');
    const patch = { displayName, phoneE164, email, manual: true as const };
    if (current) {
      await ctx.db.patch(current._id, patch);
      await audit(ctx, uid, 'deviceContacts.manual_update');
      return current._id;
    }
    const id = await ctx.db.insert('deviceContacts', { userId: uid, ...patch, createdAt: Date.now() });
    await audit(ctx, uid, 'deviceContacts.manual_add');
    return id;
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
