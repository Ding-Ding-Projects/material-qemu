# Machine page tabs

Each machine page has six tabs under its name and power buttons.

- **Overview** shows the live console with its tools, the machine's CPU and memory use, its disks, its snapshots and its recent activity.
- **Hardware** lists every saved setting: architecture, machine type, accelerator, SMBIOS UUID (the machine ID when none is set), whether it starts with the host, CPU count and topology, CPU model, memory and balloon, firmware, Secure Boot, TPM, boot menu and order, each disk with its size, format, bus and cache, attached ISO images, the network mode, adapter, MAC address and port forwards, and the display, sound, USB, serial log and random number devices. **Edit hardware** opens the same editor as the machine list.
- **Monitor** asks the running machine read-only questions through QEMU's monitor: run state, QEMU version, virtual CPUs, memory size, memory balloon, memory backends (one per NUMA node), block devices, disk input and output, character devices, display server, pointer devices, KVM acceleration and I/O threads. The answer is shown as labelled rows, with the raw reply available underneath. When QEMU cannot answer, for example because the machine has no balloon device, its own message is shown.
- **Guest agent** asks the agent running inside the guest (qemu-guest-agent) read-only questions: whether it answers, its version and commands, the operating system, host name, network addresses, file systems, signed-in users, clock, time zone and the processors the guest sees. It needs the machine's **QEMU guest agent channel** (in Display and devices) and the agent installed in the guest. A machine without the channel explains how to turn it on; when no agent answers within three seconds, the tab says so.
- **Save and resume** saves a running machine's whole state (memory, processor and devices) to a file and stops it, then later resumes it exactly where it was, still running or paused as it was. While a saved state exists, the main start button becomes **Resume**, and a normal start, a disk resize and a snapshot restore are refused, because the restored memory must match the disks. **Discard saved state** (behind the two-key confirmation) removes it so the machine starts normally again. Resuming is refused if the hardware changed since the save.
- **Log** shows QEMU's own warnings and errors from the current or last run (the last 3,000 characters) and, when serial console logging is on for the machine, the last 64 KiB of the serial log.

## Safety

The browser only chooses a question by name. The server maps the name to a fixed `query-*` command and refuses any other name, so nothing typed in the browser reaches QEMU's monitor and no question can change or stop the machine. Both views need a signed-in session like the rest of the API.

The guest agent works the same way: the server maps the question name to a fixed `guest-*` query (`guest-ping`, `guest-info` and `guest-get-*` or `guest-network-get-*` only), so file access, command execution and shutdown through the agent are never reachable. Each question first sends `guest-sync` so leftover output from an earlier client is ignored.

## How saving works

QEMU streams the state over a local TCP socket into `saved-state.bin` in the machine's runtime folder, and back in through `-incoming tcp:` on resume; QEMU's file transport does not work on Windows, so the socket is used everywhere. A fingerprint of the machine's QEMU arguments and disk sizes is saved with the state and checked before resuming. The state file is removed after a successful resume.

## Endpoints

- `GET /api/machines/{id}/monitor` lists the question names and whether the machine is running.
- `GET /api/machines/{id}/monitor/{name}` returns `{ query, ok, result }` or `{ query, ok: false, error }`.
- `GET /api/machines/{id}/agent` lists the guest agent questions and whether the machine has the channel; `GET /api/machines/{id}/agent/{name}` returns `{ query, ok, result }` or `{ query, ok: false, error }`.
- `POST /api/machines/{id}/saved-state` with `{ action: "save" | "resume" | "discard" }`. Saving and resuming appear as running jobs. `GET /api/state` includes `savedState` (`{ savedAt, bytes, wasRunning, hardware }` or `null`) for each machine.
- `GET /api/machines/{id}/log` returns `{ running, qemuOutput, serialEnabled, serial }`, where `serial` is `{ text, size, cut, modified }` or `null`.

## Not yet available

Moving a machine to another host is done with an export from the Hardware tab; see [moving-machines.md](moving-machines.md). The guest agent tab has been checked against QEMU with no agent in the guest; a reply from a real agent has not been checked yet. The appliance image now installs qemu-guest-agent so it can be checked with the next appliance build.

## Verification

`tests/machine-monitor.test.mjs` checks the query list and the log tail. `tests/guest-agent.test.mjs` runs the agent protocol against a fake agent (handshake, stale output, errors, silence) and checks the channel arguments. `scripts/verify-guest-agent.mjs` starts machines in QEMU with and without the channel (evidence/guest-agent). `tests/saved-state.test.mjs` checks the fingerprint, the guards and discarding; `scripts/verify-saved-state.mjs` saves a running QEMU machine from its tab, checks that a start and a resize are refused, resumes it and compares QEMU's own screenshot before and after (identical), then discards a second save through the confirmation gate (evidence/saved-state). `scripts/verify-machine-tabs.mjs` starts a real QEMU machine (TCG) and checks every tab in headless Edge, including a refused request that leaves the machine running and the tabs at phone width (evidence/machine-tabs).
