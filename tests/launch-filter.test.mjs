import test from "node:test";
import assert from "node:assert/strict";
import { launchPlan, validateMachine } from "../server/qemu.mjs";
import { filterMachines } from "../public/machine-filter.js";

test("launch preview and execution use the same fixed argument builder", () => {
  const machine = validateMachine({
    name: "test, process=other; echo injected",
    arch: "x86_64",
    memory: 512,
    cpus: 2,
    diskGiB: 3,
    network: "none",
    iso: "trusted.iso",
  });
  const preview = launchPlan(machine),
    actual = launchPlan(machine, {
      disk: "/data/disks/id.qcow2",
      qmp: 30000,
      vnc: 31000,
      iso: "/data/media/trusted.iso",
    });
  assert.equal(preview.executable, "qemu-system-x86_64");
  assert.equal(actual.executable, preview.executable);
  assert.equal(
    actual.args[actual.args.indexOf("-name") + 1],
    "test,, process=other; echo injected",
  );
  assert.equal(actual.args[actual.args.indexOf("-vnc") + 1], "127.0.0.1:25100");
  assert.equal(
    actual.args[actual.args.indexOf("-qmp") + 1],
    "tcp:127.0.0.1:30000,server=on,wait=off",
  );
  assert.ok(preview.args.some((arg) => arg.includes("<managed disk>")));
  assert.ok(!actual.args.includes("echo"));
  assert.ok(!actual.args.includes("-cdrom"));
  const cd = actual.args.find(
    (value) =>
      value.includes("id=installation-media") && value.includes("file="),
  );
  assert.equal(
    cd,
    "file=/data/media/trusted.iso,format=raw,if=none,media=cdrom,readonly=on,id=installation-media",
  );
  assert.ok(
    actual.args.includes(
      "scsi-cd,drive=installation-media,bus=media-scsi.0,bootindex=1,id=cd-0",
    ),
  );
  for (const arch of ["x86_64", "i386", "aarch64", "arm"]) {
    const plan = launchPlan({ ...machine, arch });
    assert.ok(!plan.args.includes("-cdrom"));
    assert.ok(
      plan.args.some((value) =>
        value.includes("format=raw,if=none,media=cdrom,readonly=on"),
      ),
    );
  }
});
test("attention and recent filters use actual errors and last-use timestamps", () => {
  const now = Date.parse("2026-11-13T12:00:00Z");
  const machines = [
    {
      id: "a",
      name: "Alpha",
      arch: "x86_64",
      state: "stopped",
      folder: "Work",
      lastUsed: "2026-11-12T12:00:00Z",
    },
    {
      id: "b",
      name: "Beta",
      arch: "x86_64",
      state: "stopped",
      folder: "Work",
      error: "QEMU exited",
      lastUsed: "2026-11-13T10:00:00Z",
    },
    {
      id: "c",
      name: "Gamma",
      arch: "aarch64",
      state: "running",
      folder: "Lab",
      lastUsed: "2026-10-01T12:00:00Z",
    },
  ];
  assert.deepEqual(
    filterMachines(machines, { state: "attention", now }).map((m) => m.id),
    ["b"],
  );
  assert.deepEqual(
    filterMachines(machines, { state: "recent", now }).map((m) => m.id),
    ["b", "a"],
  );
  assert.deepEqual(
    filterMachines(machines, {
      state: "recent",
      folder: "Work",
      query: "Alpha",
      now,
    }).map((m) => m.id),
    ["a"],
  );
  assert.deepEqual(
    machines.map((m) => m.id),
    ["a", "b", "c"],
  );
});
