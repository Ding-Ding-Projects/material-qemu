# Continuation handoff

## Objective and stop direction

Finish the remaining roadmap items and push each one to main as it is completed. The owner stopped this goal with a usage-limit closeout. New implementation has stopped. The roadmap is not finished; this is a continuation record, not a completion claim.

## State of main

Main was at 8737170bdb2a43f92e8a420ee11bb4e0349f2e94 before the commit that adds this record; the latest release is v0.1.0-build.61 (from that commit). There is one checkout, one branch (main) and no stash. Nothing is uncommitted.

Delivered and verified in this stretch, each with tests and a headless browser check against real QEMU, and evidence under evidence/:

- Regex builder: explain, test bench with groups, replace and split previews, saved library, one-second worker limit, step debugger, comparison with other flavours, code generation in six languages, local file search and replace (evidence/regex-tools).
- Header search over disks, ISOs and help articles; command palette regex search (evidence/search-everywhere).
- Machine page tabs: Overview, Hardware, Monitor (read-only QEMU queries), Guest agent, Save and resume, Log (evidence/machine-tabs, evidence/guest-agent, evidence/saved-state).
- NUMA nodes and CPU flags (evidence/cpu-numa); running jobs card (evidence/jobs); custom firmware images (evidence/firmware-images); cloud-init seed discs read by Linux by their cidata label (evidence/cloud-init).
- Multiple people with operator and viewer roles enforced by the server (evidence/people).
- Moving a machine to another host as one bundle, saved state included (evidence/machine-move).
- Storage pools on host folders with health warnings (evidence/pools).
- Appliance console: the login screen shows the IP address while starting, when running and on failure; the CI boot check reads it from a console picture with OCR (evidence/appliance-console).
- Fixed: deleting ISOs, snapshots and firmware from the browser had been refused for lack of a content type.

## Remaining work

- Guest agent: the tab is verified against QEMU without an agent and against a fake agent. A reply from a real agent is not verified. The owner approved downloading the latest appliance OVA (build.61, about 770 MB) for this check and for checking the console LAN address in VirtualBox and VMware (both installed on this host). The download has not started.
- Appliance console LAN address: verified only under QEMU user networking (10.0.2.15) in CI; not yet seen with a real LAN address in VirtualBox or VMware.
- Not built: network bridges, SPICE consoles and USB redirection. The owner chose the SPICE console next. This host's QEMU supports SPICE, QXL and usb-redir; a browser SPICE client (spice-html5, LGPL) would have to be vendored. USB redirection from a browser is not possible through spice-html5; host USB passthrough on Windows needs a WinUSB driver.
- The other 50 design boards.
- Owner steps: a LAN check from a second device, a real USB flash and boot on a PC, and creating the wiki's first page so the prepared pages in docs/wiki/pending/ can be published.
- Decided: commit 7da8359 recorded local file paths in evidence. The owner chose to leave history as it is; no rewrite or force-push.

## Next session

Fetch and verify main, read AGENTS.md, ROADMAP.md and docs/features/design-coverage.md, pick one bounded unfinished item, verify its real behaviour, and push it promptly. Keep local paths and account names out of evidence (scripts/redact-paths.mjs). Use scripts/browser-process.mjs in browser checks so no browser is left running. Next: download the approved OVA, run the two checks without touching the existing VMs, then build the SPICE console. This record does not authorize other downloads, history rewrites, publication or host changes.
