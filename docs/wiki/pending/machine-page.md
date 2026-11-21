# Machine page tabs

Each machine page has four tabs under its name and power buttons.

- **Overview** shows the live console with its tools, the machine's CPU and memory use, its disks, its snapshots and its recent activity.
- **Hardware** lists every saved setting: architecture, machine type, accelerator, SMBIOS UUID (the machine ID when none is set), whether it starts with the host, CPU count and topology, CPU model, memory and balloon, firmware, Secure Boot, TPM, boot menu and order, each disk with its size, format, bus and cache, attached ISO images, the network mode, adapter, MAC address and port forwards, and the display, sound, USB, serial log and random number devices. **Edit hardware** opens the same editor as the machine list.
- **Monitor** asks the running machine read-only questions through QEMU's monitor: run state, QEMU version, virtual CPUs, memory size, memory balloon, memory backends (one per NUMA node), block devices, disk input and output, character devices, display server, pointer devices, KVM acceleration and I/O threads. The answer is shown as labelled rows, with the raw reply available underneath. When QEMU cannot answer, for example because the machine has no balloon device, its own message is shown.
- **Log** shows QEMU's own warnings and errors from the current or last run (the last 3,000 characters) and, when serial console logging is on for the machine, the last 64 KiB of the serial log.

## Safety

The browser only chooses a question by name. The server maps the name to a fixed `query-*` command and refuses any other name, so nothing typed in the browser reaches QEMU's monitor and no question can change or stop the machine. Both views need a signed-in session like the rest of the API.

## Endpoints

- `GET /api/machines/{id}/monitor` lists the question names and whether the machine is running.
- `GET /api/machines/{id}/monitor/{name}` returns `{ query, ok, result }` or `{ query, ok: false, error }`.
- `GET /api/machines/{id}/log` returns `{ running, qemuOutput, serialEnabled, serial }`, where `serial` is `{ text, size, cut, modified }` or `null`.

## Not yet available

Moving a running machine to another host (migration) and a guest agent tab are not implemented.

## Verification

`tests/machine-monitor.test.mjs` checks the query list and the log tail. `scripts/verify-machine-tabs.mjs` starts a real QEMU machine (TCG) and checks every tab in headless Edge, including a refused request that leaves the machine running and the tabs at phone width (evidence/machine-tabs).
