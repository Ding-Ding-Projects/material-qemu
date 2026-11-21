# Running jobs

The Overview page has a **Running jobs** card. It lists the long operations the server is doing right now and the outcome of the ones that finished in the last ten minutes:

- uploading an ISO image,
- importing a disk image (upload and conversion to qcow2),
- resizing a disk,
- cloning a machine,
- taking, restoring and deleting snapshots.

Uploads show how many bytes have arrived out of the declared size, as a percentage and a progress bar that reports its value to screen readers. Other operations show a moving bar while they work, since QEMU's tools do not report progress for them. Each entry shows how long it has run. A failed job keeps its reason, translated into Cantonese like other server messages.

The list lives in the server's memory only. It starts empty when the server starts, holds at most 30 finished jobs, and drops finished jobs after ten minutes. It is part of `GET /api/state` as `jobs`, so the Overview refreshes it with everything else.

## Verification

`tests/jobs.test.mjs` checks ordering, progress, outcomes, expiry, and that byte counting passes every byte through and lets a cancelled upload fail its reader. `scripts/verify-jobs.mjs` slows the browser's upload speed to 2 MiB/s, uploads a 12 MiB ISO and sees it as a running job at about 42% on the Overview, then checks that it finishes, that a real clone is listed as finished, and that a refused resize is listed as failed with its reason (evidence/jobs).
