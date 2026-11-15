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
    // Veiligheids-PIN (alleen hash+salt; nooit plaintext). Optioneel tot onboarding-stap.
    pinHash: v.optional(v.string()),
    pinSalt: v.optional(v.string()),
    pinSetAt: v.optional(v.number()),
    // Dwangcode: tweede code, alleen hash+salt. Bij gebruik lijkt de app gestopt; contacten krijgen stil een SOS.
    duressHash: v.optional(v.string()),
    duressSalt: v.optional(v.string()),
    duressSetAt: v.optional(v.number()),
    // Verbergt de open reis op het eigen dashboard na gebruik van de dwangcode bij "veilig aangekomen".
    duressCloakAt: v.optional(v.number()),
    torchStrobeOptIn: v.optional(v.boolean()), // fotosensitiviteitswaarschuwing expliciet geaccepteerd
    // Eigen verklaring, geen volledige geboortedatum. Afwezig = leeftijd onbekend.
    birthYear: v.optional(v.number()),
    birthMonth: v.optional(v.number()),
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
    // Toestelstatus tijdens een actieve reis (gewist bij einde reis): batterij 0–100 en laatste contact met de server.
    batteryPct: v.optional(v.number()), batteryAt: v.optional(v.number()), lastSeenAt: v.optional(v.number()),
    // 'timer' = sessie zonder bestemming (bv. date, "30 min lopen"). Afwezig = reis.
    kind: v.optional(v.union(v.literal('trip'), v.literal('timer'))),
    // Privacy-check-in: kijkers zien alleen de status; locatie/batterij/route pas bij gemiste check-in of SOS.
    privacyMode: v.optional(v.boolean()),
    // Signalen naar kijkers (elk hooguit beperkt per reis): batterij bijna leeg, niet meer live, SOS tijdens de reis.
    lowBatteryAt: v.optional(v.number()), notLiveAt: v.optional(v.number()), notLiveCount: v.optional(v.number()),
    sosAt: v.optional(v.number()),
    // Optionele ritgegevens (taxi/rit delen), alleen als de gebruiker ze invult. Worden bij het einde van de reis gewist.
    ridePlate: v.optional(v.string()),
    rideDriverName: v.optional(v.string()),
    rideVehicle: v.optional(v.string()),
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
    kind: v.union(
      v.literal('sos'), v.literal('missed_check_in'),
      v.literal('unsafe'), v.literal('come_quick'), v.literal('arrived_safe'), v.literal('wrong_pin'),
    ), clientRef: v.optional(v.string()),
    lat: v.optional(v.number()), lng: v.optional(v.number()), accuracyM: v.optional(v.number()), locationAt: v.optional(v.number()),
    // Alleen bij gemiste check-in: batterij en laatst-online op het moment van escaleren (na 30 dagen gewist, net als de locatie).
    batteryPct: v.optional(v.number()), batteryAt: v.optional(v.number()), lastSeenAt: v.optional(v.number()),
    status: v.union(v.literal('open'), v.literal('cancelled'), v.literal('resolved')),
  }).index('by_client_ref', ['clientRef']).index('by_user', ['userId']),
  pushMessages: defineTable({
    recipientId: v.id('users'),
    kind: v.union(v.literal('sos'), v.literal('missed_check_in'), v.literal('trip_started'), v.literal('almost_arrived'),
      v.literal('check_in_required'), v.literal('trip_ended'), v.literal('motion_check'),
      v.literal('unsafe'), v.literal('come_quick'), v.literal('arrived_safe'), v.literal('wrong_pin'),
      v.literal('low_battery'), v.literal('not_live')),
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
  // Vrienden uitnodigen: één regel per beloonde (of afgewezen) nieuwe vertrouwde-contactrelatie.
  referrals: defineTable({
    inviterId: v.id('users'), inviteeId: v.id('users'), invitationId: v.id('invitations'),
    status: v.union(v.literal('rewarded'), v.literal('not_eligible')),
    reason: v.optional(v.string()), createdAt: v.number(),
  }).index('by_inviter', ['inviterId', 'createdAt']).index('by_invitee', ['inviteeId']),
  // Premium buiten de winkel om (nu alleen: beloning voor uitnodigen). Geen betaling, geen RevenueCat.
  premiumGrants: defineTable({
    userId: v.id('users'), source: v.literal('referral'), referralId: v.id('referrals'),
    startsAt: v.number(), expiresAt: v.number(),
  }).index('by_user', ['userId', 'expiresAt']),
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
  // Actieve gevaar-/incidentstatus (alarm mag client-side tot server unlock bevestigt)
  incidents: defineTable({
    userId: v.id('users'),
    kind: v.union(v.literal('unsafe'), v.literal('come_quick')),
    status: v.union(v.literal('active'), v.literal('resolved'), v.literal('cancelled')),
    alertId: v.optional(v.id('alerts')),
    sessionId: v.optional(v.id('sessions')),
    startedAt: v.number(),
    resolvedAt: v.optional(v.number()),
    torchRequested: v.boolean(),
  }).index('by_user_status', ['userId', 'status']),

  // Publieke tracking-links (alleen token-hash; raw token één keer naar client)
  shareLinks: defineTable({
    userId: v.id('users'),
    tokenHash: v.string(),
    sessionId: v.optional(v.id('sessions')),
    incidentId: v.optional(v.id('incidents')),
    label: v.optional(v.string()),
    // Expliciete scopes: location en/of recording (geen impliciete toegang)
    scopes: v.array(v.union(v.literal('location'), v.literal('recording'))),
    locationConsent: v.boolean(), // gebruiker gaf locatie-toestemming bij aanmaak
    expiresAt: v.number(),
    revokedAt: v.optional(v.number()),
    createdAt: v.number(),
    // Gekozen duur in de app ('arrival' = tot de reis eindigt/verloopt, max. 24 u).
    duration: v.optional(v.union(v.literal('15m'), v.literal('1h'), v.literal('arrival'), v.literal('8h'))),
    // Optionele toegangscode (PBKDF2-hash + salt; de code zelf nooit opgeslagen). Na te veel foute pogingen geblokkeerd.
    codeHash: v.optional(v.string()), codeSalt: v.optional(v.string()),
    codeFailures: v.optional(v.number()), codeLockedAt: v.optional(v.number()),
  }).index('by_hash', ['tokenHash']).index('by_user', ['userId']).index('by_incident', ['incidentId']).index('by_session', ['sessionId']),
  // Ontgrendeling van een link met toegangscode: kortlevende kijkerssleutel (alleen hash), geldig tot de link verloopt.
  linkGrants: defineTable({ linkId: v.id('shareLinks'), grantHash: v.string(), expiresAt: v.number() })
    .index('by_hash', ['grantHash']).index('by_link', ['linkId']),
  // E-mailmeldingen voor kijkers zonder app (dubbele opt-in). Adres alleen zolang de link bestaat; daarna gewist.
  viewerSubscriptions: defineTable({
    linkId: v.id('shareLinks'), ownerId: v.id('users'), sessionId: v.optional(v.id('sessions')),
    email: v.string(), emailHash: v.string(),
    status: v.union(v.literal('pending'), v.literal('active'), v.literal('unsubscribed'), v.literal('ended')),
    confirmHash: v.string(), unsubToken: v.string(),
    createdAt: v.number(), confirmedAt: v.optional(v.number()), expiresAt: v.number(),
    sent: v.array(v.string()), // dedupe-sleutels van verstuurde meldingen
    lastError: v.optional(v.string()),
  }).index('by_link', ['linkId']).index('by_confirm', ['confirmHash']).index('by_unsub', ['unsubToken'])
    .index('by_session', ['sessionId']).index('by_owner', ['ownerId']).index('by_expires', ['expiresAt']),
  // Locatie-updates tijdens incident (aparte bron als er geen trip-sessie is)
  incidentLocations: defineTable({
    incidentId: v.id('incidents'),
    userId: v.id('users'),
    lat: v.number(),
    lng: v.number(),
    accuracyM: v.optional(v.number()),
    recordedAt: v.number(),
  }).index('by_incident', ['incidentId', 'recordedAt']),
  // Geselecteerde telefooncontacten (minimaal: naam + genormaliseerd telefoonnummer); geen volledige adresboek-dump
  deviceContacts: defineTable({
    userId: v.id('users'),
    displayName: v.string(),
    phoneE164: v.string(),
    createdAt: v.number(),
  }).index('by_user', ['userId']).index('by_user_phone', ['userId', 'phoneE164']),
  // Audio-opnames: storage + ACL. encryption 'none'=legacy plaintext; 'e2e-v1'=AES-GCM ciphertext (keys never on server)
  recordings: defineTable({
    userId: v.id('users'),
    incidentId: v.optional(v.id('incidents')),
    alertId: v.optional(v.id('alerts')),
    storageId: v.id('_storage'),
    mime: v.string(), // plaintext mime for e2e; storage holds ciphertext when encryption=e2e-v1
    byteSize: v.number(), // stored object size (ciphertext size when encrypted)
    plaintextByteSize: v.optional(v.number()),
    durationMs: v.optional(v.number()),
    createdAt: v.number(),
    deletedAt: v.optional(v.number()),
    encryption: v.optional(v.union(v.literal('none'), v.literal('e2e-v1'))),
    clientUploadId: v.optional(v.string()), // binds client AAD; not a secret
  }).index('by_user', ['userId']).index('by_incident', ['incidentId']).index('by_storage', ['storageId']).index('by_deleted', ['deletedAt']),
  // Device X25519 public keys for envelope wrap (private keys stay on device SecureStore)
  deviceCryptoKeys: defineTable({
    userId: v.id('users'),
    keyId: v.string(),
    publicKeyX25519: v.string(), // hex
    createdAt: v.number(),
    revokedAt: v.optional(v.number()),
  }).index('by_user', ['userId']).index('by_user_key', ['userId', 'keyId']),
  // Wrapped DEKs for trusted app recipients (server stores ciphertext of DEK only)
  recordingKeyEnvelopes: defineTable({
    recordingId: v.id('recordings'),
    ownerId: v.id('users'),
    recipientId: v.id('users'),
    recipientKeyId: v.string(),
    ephemeralPubX25519: v.string(),
    wrappedDek: v.string(), // base64url nonce||ct||tag
    createdAt: v.number(),
    version: v.optional(v.literal(2)), // 2 = AAD-bound (recording|upload|owner|recipient|keyId); absent = legacy v1
  }).index('by_recording', ['recordingId']).index('by_recipient', ['recipientId']),
  // Upload intents: created by the upload proxy BEFORE storing bytes; proves a storage object is a recording upload
  recordingUploads: defineTable({
    userId: v.id('users'),
    storageId: v.optional(v.id('_storage')),
    createdAt: v.number(),
  }).index('by_created', ['createdAt']),
  rateLimits: defineTable({ key: v.string(), windowStart: v.number(), hits: v.number() }).index('by_key', ['key']),
});
