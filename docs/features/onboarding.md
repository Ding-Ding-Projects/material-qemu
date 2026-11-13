# Resume setup and machine drafts

Onboarding saves its current step on the server. Save and finish later persists that step and signs out; the next authenticated visit resumes it. Storage, network, ISO and first-machine steps can be explicitly skipped, with skipped-step records retained. Required steps cannot be marked skipped through the API, and completion is accepted only at the final review step.

The first-machine step opens the actual machine editor. Cancelling returns to setup without dropping the local draft. Saving returns to the final onboarding review, and Finish opens the productive overview. Optional immediate startup retains its explicit opt-in.

Machine drafts store the exact current step and current fields in bounded browser storage. New-machine and per-machine edit drafts are separate. Existing unversioned drafts remain readable. Invalid or oversized records are ignored rather than executed or treated as configuration. Successful save removes only the matching draft.

The sign-in screen offers language and theme choices without requesting account identity. These choices persist in that browser and are carried into new-owner setup. Existing authenticated account preferences remain authoritative after sign-in. Changing these controls keeps the current form values in memory and never writes passwords or setup codes into browser storage.
