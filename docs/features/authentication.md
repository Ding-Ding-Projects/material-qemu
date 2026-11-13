# Single-owner sign-in

The Main screen supports a passkey or an owner username and password. New setup labels the owner name as the username. Existing records without a separate username continue accepting their saved owner name exactly, so the change does not rename an existing account. Anonymous session metadata never returns that identity.

Password checks use the same verification work before returning a generic rejected-details result for a wrong username or password. Five unsuccessful verifications trigger a fifteen-minute cooldown for the connection address. At most two verifications are in flight per address, and a pending fifth attempt prevents a concurrent sixth. Success clears prior failure state without silently erasing another pending verification's later failure.

This is one-owner authentication, not the separate multi-user design. Password-disable settings, advanced unlock ladders and support-ticket recovery remain pending. Passkey verification with a virtual authenticator is source-bound evidence; physical authenticator acceptance is separate.
