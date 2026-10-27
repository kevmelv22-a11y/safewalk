import { defineSchema, defineTable } from 'convex/server';
import { authTables } from '@convex-dev/auth/server';
import { v } from 'convex/values';

export default defineSchema({
  ...authTables,
  profiles: defineTable({
    userId: v.id('users'),
    displayName: v.string(),
    defaultGraceMinutes: v.number(),
    sosCountdownSeconds: v.number(),
    onboardingDone: v.boolean(),
    restricted: v.boolean(),
    motionDetection: v.optional(v.boolean()),
    themePreference: v.optional(v.union(v.literal('system'), v.literal('dark'), v.literal('light'))),
  }).index('by_user', ['userId']),
  admins: defineTable({ userId: v.id('users') }).index('by_user', ['userId']),
  subscriptions: defineTable({
    userId: v.id('users'), tier: v.union(v.literal('free'), v.literal('premium')), expiresAt: v.optional(v.number()), provider: v.optional(v.string()),
  }).index('by_user', ['userId']),
  // owner deelt locatie; contact mag (alleen per sessie) meekijken
  trustedContacts: defineTable({
    ownerId: v.id('users'), contactId: v.id('users'), status: v.union(v.literal('accepted'), v.literal('removed')),
  }).index('by_owner', ['ownerId', 'status']).index('by_contact', ['contactId', 'status']).index('by_pair', ['ownerId', 'contactId']),
  invitations: defineTable({
    inviterId: v.id('users'), tokenHash: v.string(),
    status: v.union(v.literal('pending'), v.literal('accepted'), v.literal('declined'), v.literal('revoked')),
    respondedBy: v.optional(v.id('users')), expiresAt: v.number(),
  }).index('by_hash', ['tokenHash']).index('by_inviter', ['inviterId']),
  blocks: defineTable({ blockerId: v.id('users'), blockedId: v.id('users') })
    .index('by_pair', ['blockerId', 'blockedId']).index('by_blocked', ['blockedId']),
  sessions: defineTable({
    userId: v.id('users'), destinationLabel: v.string(),
    destinationLat: v.optional(v.number()), destinationLng: v.optional(v.number()),
    expectedArrival: v.number(),
    status: v.union(v.literal('active'), v.literal('ended'), v.literal('expired'), v.literal('alert')),
    endedAt: v.optional(v.number()), expiresAt: v.number(), almostNotifiedAt: v.optional(v.number()), startDistanceM: v.optional(v.number()),
  }).index('by_user', ['userId']).index('by_open', ['endedAt']),
  sessionViewers: defineTable({ sessionId: v.id('sessions'), viewerId: v.id('users'), revokedAt: v.optional(v.number()) })
    .index('by_session', ['sessionId']).index('by_viewer', ['viewerId']).index('by_session_viewer', ['sessionId', 'viewerId']),
  locations: defineTable({
    sessionId: v.id('sessions'), userId: v.id('users'), lat: v.number(), lng: v.number(),
    accuracyM: v.optional(v.number()), recordedAt: v.number(),
  }).index('by_session', ['sessionId', 'recordedAt']).index('by_user', ['userId']),
  checkIns: defineTable({
    sessionId: v.id('sessions'), userId: v.id('users'), dueAt: v.number(), graceMinutes: v.number(), extensions: v.number(),
    status: v.union(v.literal('pending'), v.literal('confirmed'), v.literal('missed'), v.literal('cancelled')),
    respondedAt: v.optional(v.number()), escalatedAt: v.optional(v.number()), reminderSentAt: v.optional(v.number()),
  }).index('by_session', ['sessionId']).index('by_status_due', ['status', 'dueAt']),
  alerts: defineTable({
    userId: v.id('users'), sessionId: v.optional(v.id('sessions')),
    kind: v.union(v.literal('sos'), v.literal('missed_check_in')), clientRef: v.optional(v.string()),
    lat: v.optional(v.number()), lng: v.optional(v.number()), accuracyM: v.optional(v.number()), locationAt: v.optional(v.number()),
    status: v.union(v.literal('open'), v.literal('cancelled'), v.literal('resolved')),
  }).index('by_client_ref', ['clientRef']).index('by_user', ['userId']),
  pushMessages: defineTable({
    recipientId: v.id('users'),
    kind: v.union(v.literal('sos'), v.literal('missed_check_in'), v.literal('trip_started'), v.literal('almost_arrived'),
      v.literal('check_in_required'), v.literal('trip_ended'), v.literal('motion_check')),
    alertId: v.optional(v.id('alerts')), sessionId: v.optional(v.id('sessions')),
    title: v.string(), body: v.string(), data: v.optional(v.any()),
    // queued → sent (ticket ok) → delivered (receipt ok: overgedragen aan Apple/Google) | failed | no_token | unknown
    status: v.union(v.literal('queued'), v.literal('sent'), v.literal('delivered'), v.literal('failed'), v.literal('no_token'), v.literal('unknown')),
    ticketIds: v.array(v.string()), detail: v.optional(v.string()), attempts: v.number(),
  }).index('by_alert', ['alertId']).index('by_recipient', ['recipientId']).index('by_session', ['sessionId']),
  motionSignals: defineTable({
    sessionId: v.id('sessions'), userId: v.id('users'),
    kind: v.union(v.literal('stationary'), v.literal('deviation'), v.literal('no_data')),
    status: v.union(v.literal('open'), v.literal('acknowledged')),
  }).index('by_session', ['sessionId']),
  billingEvents: defineTable({ eventId: v.string(), type: v.string(), userId: v.optional(v.id('users')) }).index('by_event', ['eventId']),
  errorLogs: defineTable({ source: v.string(), message: v.string(), userId: v.optional(v.id('users')) }),
  pushTokens: defineTable({ userId: v.id('users'), token: v.string(), platform: v.optional(v.string()) })
    .index('by_user', ['userId']).index('by_token', ['token']),
  auditLogs: defineTable({ actorId: v.optional(v.id('users')), action: v.string(), targetId: v.optional(v.string()), meta: v.optional(v.any()) }),
  abuseReports: defineTable({
    reporterId: v.id('users'), reportedId: v.id('users'),
    reason: v.union(v.literal('stalking'), v.literal('harassment'), v.literal('spam'), v.literal('other')),
    details: v.optional(v.string()), status: v.union(v.literal('open'), v.literal('reviewing'), v.literal('closed')),
  }).index('by_reporter', ['reporterId']),
  rateLimits: defineTable({ key: v.string(), windowStart: v.number(), hits: v.number() }).index('by_key', ['key']),
});
