# Storage pools

A storage pool is a folder on the host, such as another drive, where new machine disks can be kept instead of Material QEMU's own data folder.

## Using pools

- **Storage, Pools** lists every pool, including the built-in managed storage, with free and total space, a space meter, and how many disks each holds. A pool whose folder is missing (an unplugged drive, for example) or unreadable is marked so, and the Overview shows a warning for it, or for any pool with under 10% free space. Health is checked again every 30 seconds while Storage, the Overview or the machine form is open.
- The owner adds a pool with a name and the full path of an existing folder. Material QEMU checks that it can write there and keeps disks in a `material-qemu-disks` folder inside it, so nothing already in the folder is touched.
- In the machine form, each new disk has a **Storage pool** choice. A disk stays in the pool it was created in: editing the machine cannot move it, and its choice is locked for existing disks.
- Resizing, snapshots, cloning (the clone's disks go to the same pool) and exporting all find disks in their pool. A machine imported from a bundle keeps its disks in managed storage, since the other host's pools mean nothing here.
- A pool that still holds disks cannot be removed. Removing a pool leaves its folder and files in place.

## Roles

Operators can choose a pool for a new disk; only the owner can add or remove pools, since a pool is a folder on the host.

## Endpoints

- `GET /api/pools` lists `{ id, name, builtIn, path, disks, healthy, freeBytes, totalBytes }` (or `error` when unhealthy).
- `POST /api/pools` `{ name, path }` and `DELETE /api/pools/{id}` (owner only).
- Disks carry an optional `pool` with the pool's ID.

## Not yet available

NFS and other network pools, and pool filesystem or reflink settings, are not offered; a pool is a local folder. Network storage that the host already mounts can be used as a folder.

## Verification

`tests/pools-api.test.mjs` checks folder validation, disks created in a pool, resize, clone and export from a pool, that editing does not move disks, the health report, removal while in use, and roles, against a real server. `scripts/verify-pools.mjs` adds a pool through Storage, creates and starts a machine with its disk there through the form, reads QEMU's command line, checks the removal lock, and hides the folder to see the Overview warning (evidence/pools).
