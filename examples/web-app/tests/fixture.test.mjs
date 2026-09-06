import assert from "node:assert/strict";
import test from "node:test";

test("fixture data has a stable initial item", () => {
  assert.deepEqual({ id: 1, title: "Adapter fixture", completed: false }, { id: 1, title: "Adapter fixture", completed: false });
});
