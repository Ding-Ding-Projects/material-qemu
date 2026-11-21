# Material QEMU

A functional, self-hosted QEMU workspace based on the preserved design contract. This initial runtime connects owner sign-in, guided setup, overview, machine management, an eight-step machine editor, and an authenticated live VNC console.

[Public screenshot gallery: current verified views and historical originals](https://ding-ding-projects.github.io/material-qemu-gallery/)

## Run locally

Use Node.js 22 or newer for the web runtime. The container includes QEMU for x86_64 and aarch64 with TCG emulation.

```powershell
.\build.bat -Container
.\host.bat --detached
```

Open http://localhost:8080/ and create the first account: the first account created becomes the owner, and every later visitor has to sign in. Set it up right after starting it, before anyone else on your network opens the page.

The default Compose port is loopback-only. Remote access requires a reviewed HTTPS reverse proxy and an exact `PUBLIC_ORIGIN`. LAN delivery and image-registry publication are not yet verified. Preserve the data volume during updates.

## One-click test host on this computer

`go-host.bat` runs Material QEMU directly on Windows for quick testing, with no container and no virtual machine. Double-click it, or run it from a terminal:

```powershell
.\go-host.bat
```

It installs QEMU for Windows through Chocolatey when it is missing (Windows asks for administrator approval), builds the runtime, starts the server on port 8090 at this computer's LAN address, waits for `/health`, and prints the link. Open it and create the first account to become the owner. `go-host.bat --status` and `go-host.bat --stop` check and stop it; `--port` and `--ip` override the defaults. Test data lives in `Documents\Material QEMU VMs\go-test`, separate from every other deployment, and is kept when it stops.

This is a test bench, not the appliance: guests use software emulation, the Arm targets report their firmware as unavailable on Windows, and a result here says nothing about the OVA, USB or Raspberry Pi images.

## Host in VirtualBox, VMware, Docker or on a USB drive

Each release from the build workflow carries a portable Windows deploy assistant (`material-qemu-deploy-<version>-portable.exe`), an appliance VM (`material-qemu-appliance-<version>.ova`), a USB image for spare PCs and, when its build passes, a Raspberry Pi 4/5 image. Run the assistant and pick a target:

- **VirtualBox or VMware Workstation**: it imports the appliance, bridges it onto your network, waits for it to report its address, checks its health, then shows the LAN link.
- **Docker on this computer**: it runs the release container on a port of this computer's LAN address.
- **Flash**: it writes the PC or Raspberry Pi image to a removable USB or SD disk behind a two-key slider gate, then reads the disk back to verify it.

The **Instances** page starts, stops, restarts and removes what it created. The interface is in English, Cantonese, or both. See [hosting with the deploy assistant](docs/features/vm-hosting.md).

![Deploy assistant detecting VirtualBox and VMware on a real Windows host](evidence/deploy-assistant/deploy-wizard.png)

![Deploy page in Cantonese, showing Docker detected but its engine stopped](evidence/deploy-assistant/deploy-cantonese-docker.png)

![Flash page listing only the removable USB disk, with the backup-drive warning and locked keys](evidence/deploy-assistant/flash-page-cantonese.png)

![Two-key remove gate armed with the slider part-way](evidence/deploy-assistant/remove-gate-armed.png)

The assistant screens were designed first on a canvas; the source boards are in `design/deploy-assistant/`.

## Runtime behavior

- Password authentication uses scrypt; sessions use opaque HttpOnly SameSite cookies and CSRF verification.
- Passkeys use SimpleWebAuthn with origin and relying-party checks. Hardware authenticator verification remains pending.
- Machine disks are sparse QCOW2 images within managed storage. Installation ISOs are operator-managed under `data/media`.
- Machine start, pause, resume, ACPI shutdown and explicit power off use real QEMU processes and QMP.
- The browser console uses locally bundled noVNC through an authenticated WebSocket proxy. VNC and QMP bind only to container loopback.
- The data directory and container are a single-owner trust boundary. Other code running inside that container must be trusted.
- Host measurements are actual readings. Unsupported disk/network throughput and advanced hardware are not synthesized.

## Scope and remaining work

The other 50 design boards remain design-only. The deploy assistant, the appliance OVA, the USB image and the Raspberry Pi image build in the workflow; see the [roadmap](ROADMAP.md) for which of them have been verified on real hypervisors and hardware. Advanced QEMU hardware, snapshots, migration and native installers are not delivered. Full required-feature parity, regex tooling, complete translation and production hardening remain incomplete. `build-installer.bat` reports that gap with a nonzero exit code.

See [roadmap](ROADMAP.md), [handoff](HANDOFF.md), [runtime architecture](docs/features/runtime.md) and the original [design contract](design/HANDOFF.md). Design frames illustrate the reference only and are not runtime evidence.

## Verified runtime images

The following images show the real container built from `8e7802f38df82728a5db4fe58959be70f3a7bc09`. The [evidence inventory](evidence/README.md) records source and image identity, exact hashes, viewports, observed interactions and limitations. Later source changes require their own evidence.

![Initial owner setup with empty credential fields](evidence/8e7802f/initial.png)

![Authenticated QEMU console displaying SeaBIOS on an intentionally blank disk](evidence/8e7802f/console.png)

[Machine management at 360 pixels](evidence/8e7802f/machines-360.png)
