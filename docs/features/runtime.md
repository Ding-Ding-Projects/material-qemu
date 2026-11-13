# Runtime architecture

The HTTP service owns authentication, persistent state and all QEMU launch arguments. Browser input selects bounded configuration values and cannot submit a shell command or arbitrary QMP operation. State updates serialize through a single queue and atomically rename a complete replacement file.

QEMU executes as the unprivileged container user with TCG. Each machine has a private QCOW2 disk. ISO files are resolved against the managed media directory with real-path containment checks. Console transport connects only after session and origin validation.

The default network is disconnected. Restricted user networking does not provide external connectivity. Graceful shutdown sends an ACPI request; the guest is responsible for handling it. Explicit power off may lose guest data and requires a confirmation.

The staged `dist` runtime stores its data in the adjacent root `data` directory by default. An explicit `DATA_DIR` overrides that location. Rebuilds replace generated output, preserve that separate data directory and stop without deleting anything when legacy `dist/data` is detected. State writes retain the prior valid `state.json.previous` as a recovery copy. Restore only while the service is stopped and after preserving both current and previous files.

The initial browser verification used a blank disk and the genuine SeaBIOS display. It proves console transport, not installation or boot of a guest operating system. Passkey registration and device authentication, guest ACPI handling, aarch64 guest boot, fullscreen behavior and physical keyboard-device combinations remain unverified.

Known limitations: no hardware acceleration, guest agents, disk resizing, deletion workflow, VM CPU sampling, throughput metrics, backups, live migration or unattended appliance updates. The container is a single-owner trust boundary, not a sandbox for hostile tenants.
