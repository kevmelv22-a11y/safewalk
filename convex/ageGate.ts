import { mutation } from './_generated/server';
import { v } from 'convex/values';
import { fail, requireUser } from './lib';
import { ageStatus, isEarlierBirth, type AgeStatus } from './age';

const MIN_YEAR = 1900;

/** Bewaart geboortejaar en -maand. Een latere claim van een eerdere geboorte wordt geweigerd. */
export const declareBirth = mutation({
  args: { year: v.number(), month: v.number() },
  handler: async (ctx, { year, month }): Promise<{ status: AgeStatus }> => {
    const uid = await requireUser(ctx);
    const nowYear = new Date().getUTCFullYear();
    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12 || year < MIN_YEAR || year > nowYear) {
      fail('AGE_INVALID');
    }
    const status = ageStatus(year, month);
    if (status === 'unknown') fail('AGE_INVALID');
    const found = await ctx.db.query('profiles').withIndex('by_user', (q) => q.eq('userId', uid)).first();
    if (found === null) fail('NOT_FOUND');
    const row = found as NonNullable<typeof found>;
    if (row.birthYear !== undefined && row.birthMonth !== undefined && isEarlierBirth(row.birthYear, row.birthMonth, year, month)) {
      fail('AGE_LOCKED');
    }
    await ctx.db.patch(row._id, { birthYear: year, birthMonth: month });
    return { status };
  },
});
