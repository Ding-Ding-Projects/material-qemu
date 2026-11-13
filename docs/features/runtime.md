# Runtime architecture

The HTTP service owns authentication, persistent state and all QEMU launch arguments. Browser input selects bounded configuration values and cannot submit a shell command or arbitrary QMP operation. State updates serialize through a single queue and atomically rename a complete replacement file.

QEMU executes as the unprivileged container user with TCG. Each machine has a private QCOW2 disk. ISO files are resolved against the managed media directory with real-path containment checks. Console transport connects only after session and origin validation.

The default network is disconnected. Restricted user networking does not provide external connectivity. Graceful shutdown sends an ACPI request; the guest is responsible for handling it. Explicit power off may lose guest data and requires a confirmation.

Known limitations: no hardware acceleration, guest agents, disk resizing, deletion workflow, VM CPU sampling, throughput metrics, backups, live migration or unattended appliance updates. The container is a single-owner trust boundary, not a sandbox for hostile tenants.
