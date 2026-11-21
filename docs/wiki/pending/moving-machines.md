# Moving a machine to another host

A stopped machine can be moved to another Material QEMU host as one file.

1. On the first host, open the machine's **Hardware** tab and choose **Export to move it to another host**. To keep a running machine's open programs, save its state first in **Save and resume**; the export carries the saved state.
2. On the other host, drop the `.mqvm.tar` file into **Storage** (or choose it with **Choose file**).
3. The machine appears with its settings and disks. If a saved state came along, resume it from its **Save and resume** tab; it continues exactly where it was.

## What the bundle holds

A plain tar file with `machine.json` (the settings), each disk (`disks/<id>.qcow2` or `.raw`), the UEFI variables, the TPM state, the custom firmware image if the machine uses one, and the saved state if there is one. Large disks use the GNU size field, so any disk size fits.

The imported machine gets a new ID. Its SMBIOS UUID stays the old machine's (so the guest sees the same machine, and a saved state's hardware check still matches) and so does its MAC address. If the name is already taken on the new host, `(2)`, `(3)` and so on is added.

## Safety

- The machine stays locked during the export, so it cannot be started while its disks are being read, and a running machine cannot be exported.
- An import only accepts the file names listed above; anything else, including paths like `../x`, rejects the whole bundle. Links and other special entries are refused.
- Each disk's format is detected, not taken from its name, and a disk that points at another file (a qcow2 backing file or external data file) is refused, since that file would be on the new host.
- A firmware image that already exists on the new host must be byte-for-byte the same, or the import is refused.
- Nothing is added until every check passes; the received files are removed otherwise.
- Viewers cannot export, because a bundle contains whole disks.

## Endpoints

- `GET /api/machines/{id}/export` sends the bundle as `application/x-tar` with its exact length. Exporting appears as a running job.
- `POST /api/storage/import-bundle?name=…` takes the bundle as `application/octet-stream` and returns `{ machine, savedState }`. Importing appears as a running job.

## Verification

`tests/tar.test.mjs` checks the archive format, odd-sized pieces, damaged and truncated archives, links, and sizes over 8 GiB. `tests/machine-bundle.test.mjs` moves a machine between two real servers, and refuses unexpected names, missing disks, a disguised qcow2 with a backing file pointing at a host file, and unknown versions. `scripts/verify-machine-move.mjs` runs two hosts in headless Edge: a running machine is saved and exported on one, imported through Storage on the other, resumed there, and shows exactly the screen it had (evidence/machine-move).
