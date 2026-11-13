/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as account from "../account.js";
import type * as admin from "../admin.js";
import type * as age from "../age.js";
import type * as ageGate from "../ageGate.js";
import type * as assistant from "../assistant.js";
import type * as auth from "../auth.js";
import type * as authEmail from "../authEmail.js";
import type * as billing from "../billing.js";
import type * as contacts from "../contacts.js";
import type * as crons from "../crons.js";
import type * as deviceContacts from "../deviceContacts.js";
import type * as deviceCrypto from "../deviceCrypto.js";
import type * as deviceStatus from "../deviceStatus.js";
import type * as geo from "../geo.js";
import type * as http from "../http.js";
import type * as incidents from "../incidents.js";
import type * as lib from "../lib.js";
import type * as monitor from "../monitor.js";
import type * as motion from "../motion.js";
import type * as motionText from "../motionText.js";
import type * as notify from "../notify.js";
import type * as profiles from "../profiles.js";
import type * as push from "../push.js";
import type * as recordings from "../recordings.js";
import type * as referrals from "../referrals.js";
import type * as safetyCode from "../safetyCode.js";
import type * as security from "../security.js";
import type * as sessions from "../sessions.js";
import type * as sos from "../sos.js";
import type * as trackPage from "../trackPage.js";
import type * as tracking from "../tracking.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  account: typeof account;
  admin: typeof admin;
  age: typeof age;
  ageGate: typeof ageGate;
  assistant: typeof assistant;
  auth: typeof auth;
  authEmail: typeof authEmail;
  billing: typeof billing;
  contacts: typeof contacts;
  crons: typeof crons;
  deviceContacts: typeof deviceContacts;
  deviceCrypto: typeof deviceCrypto;
  deviceStatus: typeof deviceStatus;
  geo: typeof geo;
  http: typeof http;
  incidents: typeof incidents;
  lib: typeof lib;
  monitor: typeof monitor;
  motion: typeof motion;
  motionText: typeof motionText;
  notify: typeof notify;
  profiles: typeof profiles;
  push: typeof push;
  recordings: typeof recordings;
  referrals: typeof referrals;
  safetyCode: typeof safetyCode;
  security: typeof security;
  sessions: typeof sessions;
  sos: typeof sos;
  trackPage: typeof trackPage;
  tracking: typeof tracking;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
