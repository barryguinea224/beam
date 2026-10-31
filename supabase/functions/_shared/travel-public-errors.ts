// Public Edge Function errors must never expose database, Storage or Auth messages.
const INTERNAL_CODES = new Set([
  "STORAGE_LIST_FAILED",
  "STORAGE_REMOVE_FAILED",
  "STORAGE_NOT_EMPTY",
  "STORAGE_VERIFY_FAILED",
  "TRIP_LOCK_FAILED",
  "PROFILE_NOT_FOUND",
  "OWNED_OBJECTS_CHECK_FAILED",
  "OWNED_OBJECTS_REMAIN",
  "AUTH_DELETE_FAILED",
  "UNAUTHENTICATED",
]);
export function safeDeletionError(e: unknown): { error: string; status: number } {
  if (e instanceof Error && e.message === "UNAUTHENTICATED") {
    return { error: "UNAUTHENTICATED", status: 401 };
  }
  return { error: "DELETE_UNAVAILABLE", status: 503 };
}
export function safeInternalDeletionCode(e: unknown): string {
  const head = e instanceof Error ? e.message.split(":")[0] : "";
  return INTERNAL_CODES.has(head) ? head : "INTERNAL_ERROR";
}
