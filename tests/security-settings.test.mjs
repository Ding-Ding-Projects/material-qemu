import test from "node:test";
import assert from "node:assert/strict";
import { setPasswordAccess } from "../server/security-settings.mjs";
test("password access changes require a fresh verified passkey and retain recovery credentials", () => {
  const state = {
    owner: {
      credentials: [{ id: "fixture" }],
      hash: "unchanged-fixture",
      salt: "unchanged-fixture",
    },
    events: [],
  };
  const session = { method: "passkey", passkeyVerifiedAt: 1000 };
  setPasswordAccess(state, { passwordEnabled: false }, session, 1001);
  assert.equal(state.owner.passwordEnabled, false);
  assert.equal(state.owner.hash, "unchanged-fixture");
  setPasswordAccess(state, { passwordEnabled: true }, session, 1002);
  assert.equal(state.owner.passwordEnabled, true);
});
test("password-only, stale, future and absent-passkey changes leave settings intact", () => {
  const state = {
    owner: { passwordEnabled: true, credentials: [{ id: "fixture" }] },
    events: [],
  };
  for (const session of [
    { method: "password", passkeyVerifiedAt: 1000 },
    { method: "passkey", passkeyVerifiedAt: 1 },
    { method: "passkey", passkeyVerifiedAt: 999999 },
  ])
    assert.throws(() =>
      setPasswordAccess(state, { passwordEnabled: false }, session, 400000),
    );
  assert.equal(state.owner.passwordEnabled, true);
  state.owner.credentials = [];
  assert.throws(() =>
    setPasswordAccess(
      state,
      { passwordEnabled: false },
      { method: "passkey", passkeyVerifiedAt: 400000 },
      400001,
    ),
  );
  assert.equal(state.owner.passwordEnabled, true);
});
