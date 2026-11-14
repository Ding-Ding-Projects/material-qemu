import { event } from "./store.mjs";

export function setPasswordAccess(state, request, session, now = Date.now()) {
  if (typeof request.passwordEnabled !== "boolean")
    throw new Error("Password sign-in choice must be explicit.");
  if (!state.owner?.credentials.length)
    throw new Error(
      "Register and verify a passkey before changing password sign-in.",
    );
  if (
    session.method !== "passkey" ||
    !Number.isFinite(session.passkeyVerifiedAt) ||
    now - session.passkeyVerifiedAt > 5 * 60 * 1000 ||
    session.passkeyVerifiedAt > now
  )
    throw new Error("Verify a passkey again before changing password sign-in.");
  state.owner.passwordEnabled = request.passwordEnabled;
  event(
    state,
    request.passwordEnabled
      ? "Password sign-in enabled after passkey verification."
      : "Password sign-in disabled after passkey verification.",
  );
  return { passwordEnabled: state.owner.passwordEnabled };
}
