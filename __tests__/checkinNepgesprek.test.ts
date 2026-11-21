import { alertTitle } from '../src/lib/safety';
import {
  HOME_GRACE_MINUTES, HOME_MAX_ACTIVE, ageLabel, checkedInBody, cleanLabel, defaultClock, dueFromClock, dueFromMinutes,
  dueWindowError, escalationIsDue, extendAllowed, homePhase, localReminderAt, missedContactBody, reminderBody, reminderIsDue, statusCopy,
} from '../src/lib/homeCheckIn';
import {
  answerRing, callerNumberIssue, createRing, declineRing, delayNeedsPremium, fakeCallAllowed, hangUpRing, missRing, sanitizeCallerNumber,
} from '../src/lib/fakeCall';

const at = (h: number, min: number, day = 21) => new Date(2026, 10, day, h, min, 0, 0).getTime();

describe('thuis-check-in tijd', () => {
  const evening = at(22, 0);

  it('23:30 vandaag is later vanavond', () => {
    const r = dueFromClock({ hour: 23, minute: 30, tomorrow: false }, evening);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const d = new Date(r.dueAt);
    expect(d.getHours()).toBe(23);
    expect(d.getMinutes()).toBe(30);
    expect(d.getDate()).toBe(21);
  });

  it('een tijd die vandaag al voorbij is wordt niet stil op morgen gezet', () => {
    const r = dueFromClock({ hour: 21, minute: 0, tomorrow: false }, evening);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/voorbij|morgen/i);
  });

  it('na middernacht alleen met morgen aan', () => {
    const late = at(23, 50);
    expect(dueFromClock({ hour: 0, minute: 15, tomorrow: false }, late).ok).toBe(false);
    const next = dueFromClock({ hour: 0, minute: 15, tomorrow: true }, late);
    expect(next.ok).toBe(true);
    if (!next.ok) return;
    const d = new Date(next.dueAt);
    expect(d.getDate()).toBe(22);
    expect(d.getHours()).toBe(0);
    expect(d.getMinutes()).toBe(15);
  });

  it('morgen te ver vooruit wordt geweigerd', () => {
    const morning = at(10, 0);
    const r = dueFromClock({ hour: 9, minute: 0, tomorrow: true }, morning);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/18 uur/);
  });

  it('over X minuten en de harde grens', () => {
    expect(dueFromMinutes(30, evening)).toEqual({ ok: true, dueAt: evening + 30 * 60_000 });
    expect(dueFromMinutes(0, evening).ok).toBe(false);
    expect(dueFromMinutes(18 * 60, evening).ok).toBe(true);
    expect(dueFromMinutes(18 * 60 + 1, evening).ok).toBe(false);
    expect(dueWindowError(evening + 10_000, evening)).toMatch(/dichtbij|voorbij/);
    expect(dueWindowError(evening + 31_000, evening)).toBeNull();
  });

  it('standaardklok ligt in de toekomst', () => {
    const clock = defaultClock(evening);
    const r = dueFromClock(clock, evening);
    expect(r.ok).toBe(true);
  });

  it('ongeldige klok en te korte omschrijving', () => {
    expect(dueFromClock({ hour: 24, minute: 0, tomorrow: false }, evening).ok).toBe(false);
    expect(cleanLabel('  Thuis  ')).toBe('Thuis');
    expect(cleanLabel('A')).toBeNull();
  });
});

describe('thuis-check-in verlopen en tekst', () => {
  const now = at(23, 0);

  it('eerst herinnering, pas na de respijt escalatie', () => {
    const due = now + 2 * 60_000;
    expect(HOME_GRACE_MINUTES).toBe(2);
    expect(reminderIsDue(due, now)).toBe(false);
    expect(reminderIsDue(due, now + 70_000)).toBe(true);
    expect(escalationIsDue(due, HOME_GRACE_MINUTES, due + 60_000)).toBe(false);
    expect(escalationIsDue(due, HOME_GRACE_MINUTES, due + HOME_GRACE_MINUTES * 60_000)).toBe(true);
    expect(homePhase(due, HOME_GRACE_MINUTES, now)).toBe('running');
    expect(homePhase(due, HOME_GRACE_MINUTES, due + 30_000)).toBe('grace');
    expect(homePhase(due, HOME_GRACE_MINUTES, due + 3 * 60_000)).toBe('overdue');
  });

  it('verlengen hooguit 3 keer, met 10 of 20 minuten', () => {
    expect(extendAllowed(0, 10)).toBe(true);
    expect(extendAllowed(2, 20)).toBe(true);
    expect(extendAllowed(3, 10)).toBe(false);
    expect(extendAllowed(0, 15)).toBe(false);
    expect(HOME_MAX_ACTIVE).toBe(3);
  });

  it('locatie onbekend wordt eerlijk gezegd, een bekend punt krijgt een kaartlink en een leeftijd', () => {
    const unknown = missedContactBody('Sam', 'Thuis', null, now);
    expect(unknown).toMatch(/onbekend/);
    expect(unknown).not.toMatch(/gegarandeerd/i);
    const known = missedContactBody('Sam', 'Thuis', { lat: 52.1, lng: 4.3, locationAt: now - 5 * 60_000 }, now);
    expect(known).toContain('https://maps.google.com/?q=52.1,4.3');
    expect(known).toContain('5 min geleden');
    expect(known).toMatch(/verouderd/);
    expect(ageLabel(now - 30_000, now)).toBe('zojuist');
  });

  it('teksten beloven geen veiligheid en geen aankomst van de melding', () => {
    const texts = [
      reminderBody('Thuis', 2),
      checkedInBody('Sam', 'Thuis', false),
      checkedInBody('Sam', 'Thuis', true),
      statusCopy({ status: 'confirmed', dueAt: now, graceMinutes: 2, now, locationKnown: false }).detail,
      statusCopy({ status: 'missed', dueAt: now, graceMinutes: 2, now, locationKnown: false }).detail,
      statusCopy({ status: 'cancelled', dueAt: now, graceMinutes: 2, now, locationKnown: false }).detail,
    ];
    for (const text of texts) expect(text.toLowerCase()).not.toContain('gegarandeerd');
    expect(checkedInBody('Sam', 'Thuis', true)).toMatch(/ná de eerdere/);
    expect(statusCopy({ status: 'cancelled', dueAt: now, graceMinutes: 2, now, locationKnown: false }).detail).toMatch(/geen melding/);
  });

  it('lokale herinnering na een herstart alleen als de deadline nog ver genoeg is', () => {
    expect(localReminderAt(now + 5 * 60_000, now)).toBe(now + 4 * 60_000);
    expect(localReminderAt(now + 20_000, now)).toBeNull();
  });

  it('meldingstekst voor een thuis-check-in verschilt van een reis', () => {
    const home = alertTitle('missed_check_in', 'home-abc');
    expect(home.title).toMatch(/Thuiskomst/);
    expect(home.explain.toLowerCase()).not.toContain('gegarandeerd');
    expect(alertTitle('missed_check_in', 'trip').title).toMatch(/Check-in gemist/);
  });
});

describe('nepgesprek-state', () => {
  it('inkomend, opnemen, weigeren, ophangen en gemist', () => {
    const ringing = createRing('  mama  ', '06 12345678');
    expect(ringing).toMatchObject({ phase: 'ringing', caller: 'mama', number: '06 12345678', startedAt: null });
    const talking = answerRing(ringing, 5_000);
    expect(talking).toMatchObject({ phase: 'talking', startedAt: 5_000 });
    expect(answerRing(talking, 9_000)).toBe(talking);
    expect(hangUpRing(talking)).toMatchObject({ phase: 'closed', closedReason: 'hangup' });
    expect(declineRing(ringing)).toMatchObject({ phase: 'closed', closedReason: 'declined' });
    expect(declineRing(talking)).toBe(talking);
    expect(missRing(ringing).closedReason).toBe('missed');
    expect(hangUpRing(ringing)).toBe(ringing);
  });

  it('nummer is alleen tekst: 112 en te kort worden niet getoond', () => {
    expect(callerNumberIssue('')).toBeNull();
    expect(callerNumberIssue('112')).toMatch(/hulpdienst/i);
    expect(callerNumberIssue('06 12')).toBeNull();
    expect(callerNumberIssue('12')).toMatch(/minstens 3/);
    expect(sanitizeCallerNumber('112')).toBe('');
    expect(sanitizeCallerNumber('bel 06-12345678!')).toBe('06-12345678');
    expect(createRing('Mama', '112').number).toBe('');
  });

  it('nu is gratis, een vertraging blijft Premium', () => {
    expect(delayNeedsPremium(0)).toBe(false);
    expect(delayNeedsPremium(10_000)).toBe(true);
    expect(fakeCallAllowed('now', false)).toBe(true);
    expect(fakeCallAllowed('schedule', false)).toBe(false);
    expect(fakeCallAllowed('schedule', true)).toBe(true);
  });
});
