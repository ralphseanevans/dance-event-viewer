import type { DashboardProfile } from "../types";

/* Every dashboard load reads Supabase the same way: rows come back typed as the
   view's shape or null, an error means "show the message and keep the last good
   state", and parallel loads report the first failure rather than six. */

interface QueryResult<Row> {
  data: Row[] | unknown[] | null;
  error: { message: string } | null;
}

/** Rows of a Supabase result, or an empty list when the query returned nothing. */
export function rowsOf<Row>(result: QueryResult<Row>): Row[] {
  return (result.data as Row[] | null) ?? [];
}

/** Message of the first failed result, or "" when every query succeeded. */
export function firstErrorMessage(results: Array<{ error: { message: string } | null }>): string {
  return results.find((result) => result.error)?.error?.message ?? "";
}

/** Day-to-day admin authority: the owner plus volunteer admins. */
export function isAdmin(profile: DashboardProfile): boolean {
  return profile.role === "owner_admin" || profile.role === "volunteer_admin";
}

/** Owner-only authority (people, permissions, experiments). */
export function isOwnerAdmin(profile: DashboardProfile): boolean {
  return profile.role === "owner_admin";
}
