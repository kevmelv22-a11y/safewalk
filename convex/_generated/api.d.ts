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
import type * as auth from "../auth.js";
import type * as contacts from "../contacts.js";
import type * as crons from "../crons.js";
import type * as geo from "../geo.js";
import type * as http from "../http.js";
import type * as lib from "../lib.js";
import type * as monitor from "../monitor.js";
import type * as notify from "../notify.js";
import type * as profiles from "../profiles.js";
import type * as push from "../push.js";
import type * as sessions from "../sessions.js";
import type * as sos from "../sos.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  account: typeof account;
  auth: typeof auth;
  contacts: typeof contacts;
  crons: typeof crons;
  geo: typeof geo;
  http: typeof http;
  lib: typeof lib;
  monitor: typeof monitor;
  notify: typeof notify;
  profiles: typeof profiles;
  push: typeof push;
  sessions: typeof sessions;
  sos: typeof sos;
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
