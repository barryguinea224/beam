import { strict as assert } from "node:assert";
import { safeDeletionError, safeInternalDeletionCode } from "./travel-public-errors.ts";

Deno.test("public errors do not reveal Storage paths, SQL or credentials", () => {
  for (const message of [
    "STORAGE_REMOVE_FAILED: media/bucket/private-user-id",
    "OWNED_OBJECTS_CHECK_FAILED: database connection password=sensitive",
    "AUTH_DELETE_FAILED: attacker@example.com",
    "unexpected database constraint 23505 private.email",
  ]) {
    const result = safeDeletionError(new Error(message));
    assert.deepEqual(result, { error: "DELETE_UNAVAILABLE", status: 503 });
    assert.ok(!JSON.stringify(result).includes("private"));
  }
});
Deno.test("only authentication errors keep the public 401 code", () => {
  assert.deepEqual(safeDeletionError(new Error("UNAUTHENTICATED")),
    { error: "UNAUTHENTICATED", status: 401 });
});
Deno.test("logs contain only allowlisted stable error codes", () => {
  assert.equal(safeInternalDeletionCode(new Error("STORAGE_LIST_FAILED: secret=user@example.com")), "STORAGE_LIST_FAILED");
  assert.equal(safeInternalDeletionCode(new Error("private user name")), "INTERNAL_ERROR");
});
