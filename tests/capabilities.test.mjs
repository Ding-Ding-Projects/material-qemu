import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  parseMachines,
  parseAccelerators,
  supportedMachine,
  targetInventory,
} from "../server/capabilities.mjs";
import { Qemu, validateMachine } from "../server/qemu.mjs";

test("capability parsing separates supported recipes from discovered boards", () => {
  const machines = parseMachines(
    "Supported machines are:\nq35     Standard PC\npc-i440fx-7.2  Standard PC version\nmicrovm Micro VM\nnone Empty machine\n",
  );
  assert.equal(machines.length, 4);
  assert.deepEqual(
    machines
      .filter((m) => supportedMachine("x86_64", m.name))
      .map((m) => m.name),
    ["q35", "pc-i440fx-7.2"],
  );
  assert.deepEqual(
    parseAccelerators("Accelerators supported in QEMU binary:\ntcg\nkvm\n"),
    ["tcg", "kvm"],
  );
  assert.equal(targetInventory.length, 29);
});
test("unadvertised machine types and unavailable accelerators cannot reach launch configuration", () => {
  const base = {
    name: "Fixture",
    arch: "x86_64",
    memory: 128,
    cpus: 1,
    diskGiB: 1,
    network: "none",
  };
  const capabilities = {
    x86_64: {
      available: true,
      selectableRecipes: [{ machineType: "q35" }],
      accelerators: [
        { name: "tcg", usable: true },
        { name: "kvm", usable: false },
      ],
    },
  };
  assert.equal(validateMachine(base, capabilities).machineType, "q35");
  assert.throws(
    () => validateMachine({ ...base, machineType: "pc-q35-7.1" }, capabilities),
    /not discovered/,
  );
  assert.throws(
    () =>
      validateMachine({ ...base, machineType: "q35,accel=kvm" }, capabilities),
    /Unsupported/,
  );
  assert.throws(
    () => validateMachine({ ...base, accelerator: "kvm" }, capabilities),
    /not usable/,
  );
});
test("every selectable installed platform recipe launches through real QMP", async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "mq-platforms-"));
  const qemu = await new Qemu(dir).open();
  try {
    const available = Object.entries(qemu.capabilities).filter(
      ([, cap]) => cap.available,
    );
    if (!available.length)
      return t.skip("No QEMU system emulator is installed on this host.");
    await writeFile(
      path.join(dir, "media", "blank-transport-fixture.iso"),
      Buffer.alloc(32768),
    );
    for (const [arch, cap] of available) {
      await t.test(arch, async () => {
        const id = randomUUID();
        const machine = {
          id,
          ...validateMachine(
            {
              name: `Platform ${arch}`,
              arch,
              machineType: cap.machine,
              accelerator: "tcg",
              memory: 256,
              cpus: 1,
              diskGiB: 1,
              network: "none",
              iso: "blank-transport-fixture.iso",
            },
            qemu.capabilities,
          ),
        };
        await qemu.disk(id, 1);
        await qemu.start(machine);
        assert.equal(qemu.status(id).state, "running");
        await qemu.action(id, "stop");
      });
    }
  } finally {
    await qemu.close();
    await rm(dir, { recursive: true, force: true });
  }
});
