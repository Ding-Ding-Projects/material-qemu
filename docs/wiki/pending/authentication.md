# Single-owner sign-in

The Main screen supports a passkey or an owner username and password. New setup labels the owner name as the username. Existing records without a separate username continue accepting their saved owner name exactly, so the change does not rename an existing account. Anonymous session metadata never returns that identity.

Password checks use the same verification work before returning a generic rejected-details result for a wrong username or password. Five unsuccessful verifications trigger a fifteen-minute cooldown for the connection address. At most two verifications are in flight per address, and a pending fifth attempt prevents a concurrent sixth. Success clears prior failure state without silently erasing another pending verification's later failure.

This is one-owner authentication, not the separate multi-user design. Advanced unlock ladders and support-ticket recovery remain pending. Passkey verification with a virtual authenticator is source-bound evidence; physical authenticator acceptance is separate.

## Explicit password sign-in choice

Settings offers password disable and re-enable only after a passkey is registered. Every change requires a newly completed passkey verification; the server checks the opaque session's authentication method and a five-minute verification age, rather than trusting a request field. Cancelling or failing that verification leaves the setting unchanged.

Disabling rejects new password sign-ins even when the username and password are correct. The saved password and existing sessions remain unchanged. Re-enabling also requires fresh passkey verification. There is no unauthenticated password-only recovery endpoint. If all registered passkeys are lost, recovery requires a separately reviewed trusted-host operator or backup procedure; no automated recovery has been implemented or verified.

## People and roles

The owner can let other people sign in, each with their own name and password, from **Settings, People**. Each person has one role:

- **Operator** creates, runs and changes machines and storage, uploads media and firmware, and uses consoles. Operators cannot manage people, change sign-in security, or start an appliance update.
- **Viewer** sees machines, storage, jobs and activity. Viewers cannot change anything, including the shared workspace settings, and get no console, because a console can type into the guest.

The owner keeps every right and is the only one who signs in with passkeys. Roles are checked by the server for every request before any route runs, uploads included, and the console connection refuses viewers; the browser hiding a control is never what protects it. Someone signed in as an operator or viewer sees their role in the header, and a viewer sees a note explaining what they can do.

Changing a person's role or resetting their password ends their open sessions, so the change applies at their next sign-in. Removing a person (behind the two-key confirmation) ends their sessions and their sign-in immediately; their machines and the activity history stay. Sign-in names are unique, ignoring letter case, and cannot reuse the owner's. Up to 50 people can be added.

Endpoints (owner only): `GET /api/users`, `POST /api/users` `{ name, username, password, role }`, `POST /api/users/{id}` `{ role?, name?, password? }`, `DELETE /api/users/{id}`. `GET /api/session` includes `user: { name, role }`. Password material is never returned.

`tests/users-api.test.mjs` checks the role rules and a full run against a real server: adding people, signing in as each role, refusals (including an upload), and sessions ending after a role change, a password reset and a removal. `scripts/verify-people.mjs` does the same through the interface in headless Edge (evidence/people).
