import { action, internalMutation, internalQuery, query } from './_generated/server';
import { v } from 'convex/values';
import { getAuthUserId } from '@convex-dev/auth/server';
import { internal } from './_generated/api';
import { fail, isPremium, rateLimit } from './lib';

/**
 * Optionele AI-veiligheidsassistent (Premium). Volledig los van SOS en check-ins.
 * De AI stelt NOOIT een noodsituatie vast en alarmeert NOOIT hulpdiensten of contacten.
 * Gesprekken worden niet op de server opgeslagen.
 */
export const SYSTEM_PROMPT = `Je bent de SafeWalk-veiligheidsassistent. Je geeft in helder Nederlands (of de taal van de gebruiker) algemene veiligheidstips, helpt bij het voorbereiden van een reis, legt SafeWalk-functies uit (SOS, check-in-timer, tijdelijk locatie delen, vertrouwde contacten) en geeft advies over verstandig locatie delen.
Strikte regels:
- Je bent geen hulpdienst. Je stelt nooit vast of er een noodsituatie is en je alarmeert nooit hulpdiensten of contacten; dat kun je ook niet.
- Bij (mogelijk) direct gevaar zeg je altijd eerst: bel zelf 112 (in Nederland) en gebruik de SOS-knop in de app om je vertrouwde contacten te waarschuwen.
- Beweer nooit dat een route, buurt of tijdstip veilig is; je hebt geen betrouwbare veiligheidsdata.
- Geen medische, juridische of politiële diagnoses; verwijs naar professionals. Voor niet-spoedeisende politiezaken: 0900-8844.
- Houd antwoorden kort en praktisch.`;

const DANGER = /\b(112|help|hulp|gevaar|bedreigd|achtervolgd|gevolgd|aangevallen|aanranding|verkracht|noodgeval|nood|sos|bang|in paniek|danger|attacked|followed)\b/i;
export const DANGER_NOTICE = 'Ben je in direct gevaar? Bel nu zelf 112 en druk op de SOS-knop om je vertrouwde contacten te waarschuwen. Ik kan geen hulpdiensten bellen.';

export const availability = query({ args: {}, handler: async (ctx) => {
  const uid = await getAuthUserId(ctx);
  return { enabled: Boolean(process.env.OPENAI_API_KEY), premium: uid ? await isPremium(ctx, uid) : false };
} });

export const gate = internalQuery({ args: { userId: v.id('users') }, handler: async (ctx, { userId }) => isPremium(ctx, userId) });
export const hit = internalMutation({ args: { userId: v.id('users') }, handler: async (ctx, { userId }) => { await rateLimit(ctx, `ai:${userId}`, 30, 3600_000); } });

const msgV = v.object({ role: v.union(v.literal('user'), v.literal('assistant')), content: v.string() });
export const ask = action({ args: { messages: v.array(msgV) }, handler: async (ctx, { messages }): Promise<{ disabled?: true; reply?: string; notice?: string }> => {
  const uid = await getAuthUserId(ctx); if (!uid) fail('NOT_AUTHENTICATED');
  const key = process.env.OPENAI_API_KEY;
  if (!key) return { disabled: true };
  if (!(await ctx.runQuery(internal.assistant.gate, { userId: uid! }))) fail('PREMIUM_REQUIRED');
  if (messages.length === 0 || messages.length > 20 || messages.some((m) => m.content.length > 2000)) fail('BAD_REQUEST');
  await ctx.runMutation(internal.assistant.hit, { userId: uid! });
  const last = messages[messages.length - 1].content;
  const notice = DANGER.test(last) ? DANGER_NOTICE : undefined; // vaste tekst, geen AI-beoordeling
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: process.env.OPENAI_MODEL ?? 'gpt-4o-mini', temperature: 0.3, max_tokens: 500,
        messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages.slice(-12)] }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const j = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    return { reply: j.choices?.[0]?.message?.content?.trim() || 'Geen antwoord ontvangen.', notice };
  } catch {
    return { reply: 'De assistent is nu niet bereikbaar. SOS en check-ins werken gewoon door.', notice };
  }
} });
