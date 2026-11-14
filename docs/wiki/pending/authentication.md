# Single-owner sign-in

The Main screen supports a passkey or an owner username and password. New setup labels the owner name as the username. Existing records without a separate username continue accepting their saved owner name exactly, so the change does not rename an existing account. Anonymous session metadata never returns that identity.

Password checks use the same verification work before returning a generic rejected-details result for a wrong username or password. Five unsuccessful verifications trigger a fifteen-minute cooldown for the connection address. At most two verifications are in flight per address, and a pending fifth attempt prevents a concurrent sixth. Success clears prior failure state without silently erasing another pending verification's later failure.

This is one-owner authentication, not the separate multi-user design. Advanced unlock ladders and support-ticket recovery remain pending. Passkey verification with a virtual authenticator is source-bound evidence; physical authenticator acceptance is separate.

## Explicit password sign-in choice

Settings offers password disable and re-enable only after a passkey is registered. Every change requires a newly completed passkey verification; the server checks the opaque session's authentication method and a five-minute verification age, rather than trusting a request field. Cancelling or failing that verification leaves the setting unchanged.

Disabling rejects new password sign-ins even when the username and password are correct. The saved password and existing sessions remain unchanged. Re-enabling also requires fresh passkey verification. There is no unauthenticated password-only recovery endpoint. If all registered passkeys are lost, recovery requires a separately reviewed trusted-host operator or backup procedure; no automated recovery has been implemented or verified.


Source: [docs/features/authentication.md](https://github.com/Ding-Ding-Projects/material-qemu/blob/2a273d914f9d4a0c4f61be13d391a9011fc38f42/docs/features/authentication.md).
