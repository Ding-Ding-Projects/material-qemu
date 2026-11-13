import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, readdir, realpath, stat, readFile } from "node:fs/promises";
import path from "node:path";
import net from "node:net";
import os from "node:os";

const exec = promisify(execFile);
import {
  targets,
  discoverCapabilities,
  supportedMachine,
} from "./capabilities.mjs";
export function validateMachine(input, capabilities) {
  const name = String(input.name || "").trim();
  if (!name || name.length > 80 || /[\x00-\x1f]/.test(name))
    throw new Error("Use a machine name between 1 and 80 characters.");
  if (!targets[input.arch]) throw new Error("Unsupported architecture.");
  const machineType = input.machineType || targets[input.arch].machine;
  const accelerator = input.accelerator || "tcg";
  if (
    !supportedMachine(input.arch, machineType) ||
    !["tcg", "kvm"].includes(accelerator)
  )
    throw new Error("Unsupported machine recipe or accelerator.");
  if (capabilities) {
    const cap = capabilities[input.arch];
    if (!cap?.available)
      throw new Error(cap?.reason || "Target is unavailable.");
    if (!cap.selectableRecipes.some((item) => item.machineType === machineType))
      throw new Error("Machine type was not discovered as a supported recipe.");
    if (
      !cap.accelerators.some((item) => item.name === accelerator && item.usable)
    )
      throw new Error("Accelerator is not usable on this host.");
  }
  const memory = Number(input.memory),
    cpus = Number(input.cpus),
    diskGiB = Number(input.diskGiB);
  if (!Number.isInteger(memory) || memory < 128 || memory > 32768)
    throw new Error("Memory must be 128–32768 MiB.");
  if (!Number.isInteger(cpus) || cpus < 1 || cpus > 16)
    throw new Error("CPU count must be 1–16.");
  if (!Number.isInteger(diskGiB) || diskGiB < 1 || diskGiB > 256)
    throw new Error("Disk capacity must be 1–256 GiB.");
  if (!["user", "none"].includes(input.network))
    throw new Error("Unsupported network.");
  if (input.iso && !/^[a-zA-Z0-9][a-zA-Z0-9._ -]{0,150}\.iso$/i.test(input.iso))
    throw new Error("Select an ISO from the managed media directory.");
  return {
    name,
    arch: input.arch,
    machineType,
    accelerator,
    memory,
    cpus,
    diskGiB,
    network: input.network,
    iso: input.iso || "",
    folder: String(input.folder || "").slice(0, 80),
    favourite: Boolean(input.favourite),
    notes: String(input.notes || "").slice(0, 2000),
  };
}
export async function containedFile(directory, name) {
  const root = await realpath(directory);
  const resolved = await realpath(path.join(directory, name));
  if (!resolved.startsWith(root + path.sep) || !(await stat(resolved)).isFile())
    throw new Error("File is outside managed storage.");
  return resolved;
}

export function launchPlan(
  machine,
  {
    disk = "<managed disk>",
    qmp = "<private QMP port>",
    vnc = "<private VNC display>",
    iso = "<managed ISO>",
  } = {},
) {
  const target = targets[machine.arch];
  if (!target) throw new Error("Unsupported architecture.");
  const args = [
    "-name",
    machine.name.replaceAll(",", ",,"),
    "-machine",
    machine.machineType || target.machine,
    "-accel",
    machine.accelerator || "tcg",
    "-cpu",
    machine.accelerator === "kvm" ? "host" : target.cpu,
    "-m",
    String(machine.memory),
    "-smp",
    String(machine.cpus),
    "-drive",
    `file=${disk.replaceAll(",", ",,")},format=qcow2,if=virtio`,
    "-qmp",
    `tcp:127.0.0.1:${qmp},server=on,wait=off`,
    "-vnc",
    `127.0.0.1:${typeof vnc === "number" ? vnc - 5900 : vnc}`,
    "-display",
    "none",
  ];
  if (target.firmware)
    args.push(
      "-bios",
      target.firmware,
      "-device",
      "virtio-gpu-pci",
      "-device",
      "qemu-xhci",
      "-device",
      "usb-kbd",
      "-device",
      "usb-tablet",
    );
  if (machine.network === "user")
    args.push(
      "-netdev",
      "user,id=net0,restrict=on",
      "-device",
      "virtio-net-pci,netdev=net0",
    );
  else args.push("-nic", "none");
  if (machine.iso) args.push("-cdrom", iso, "-boot", "order=d");
  return { executable: target.executable, args };
}
export class Qemu {
  constructor(directory) {
    this.directory = directory;
    this.running = new Map();
    this.lastErrors = new Map();
    this.locks = new Map();
    this.capabilities = {};
  }
  async open() {
    for (const dir of ["disks", "media", "runtime"])
      await mkdir(path.join(this.directory, dir), {
        recursive: true,
        mode: 0o700,
      });
    this.capabilities = await discoverCapabilities();
    return this;
  }
  async media() {
    return (await readdir(path.join(this.directory, "media"))).filter((n) =>
      /^[a-zA-Z0-9][a-zA-Z0-9._ -]{0,150}\.iso$/i.test(n),
    );
  }
  exclusive(id, action) {
    const prior = this.locks.get(id) || Promise.resolve();
    const next = prior.catch(() => {}).then(action);
    this.locks.set(id, next);
    next
      .finally(() => {
        if (this.locks.get(id) === next) this.locks.delete(id);
      })
      .catch(() => {});
    return next;
  }
  async disk(id, size) {
    const destination = path.join(this.directory, "disks", `${id}.qcow2`);
    await exec("qemu-img", ["create", "-f", "qcow2", destination, `${size}G`], {
      timeout: 20000,
    });
    return destination;
  }
  status(id) {
    const r = this.running.get(id);
    return r
      ? {
          state: r.state,
          pid: r.process.pid,
          startedAt: r.startedAt,
          error: r.error || null,
        }
      : { state: "stopped", pid: null, error: this.lastErrors.get(id) || null };
  }
  async refreshStates() {
    await Promise.all(
      [...this.running].map(async ([id, r]) => {
        if (r.state === "starting") return;
        try {
          const result = await this.command(id, "query-status");
          r.state = result.running
            ? "running"
            : result.status === "paused"
              ? "paused"
              : result.status;
        } catch (error) {
          if (this.running.has(id)) r.error = error.message;
        }
      }),
    );
  }
  async start(machine) {
    return this.exclusive("all-starts", () => this.startReserved(machine));
  }
  async startReserved(machine) {
    machine = validateMachineWithIdentity(machine, this.capabilities);
    if (this.running.has(machine.id))
      throw new Error("Machine is already active.");
    if (!this.capabilities[machine.arch]?.available)
      throw new Error(
        this.capabilities[machine.arch]?.reason || "QEMU unavailable.",
      );
    const disk = await containedFile(
      path.join(this.directory, "disks"),
      `${machine.id}.qcow2`,
    );
    const target = targets[machine.arch];
    const memory = await memoryLimit();
    const allocated = [...this.running.values()].reduce(
      (sum, r) => sum + r.memory,
      0,
    );
    if ((allocated + machine.memory) * 1048576 > memory * 0.85)
      throw new Error(
        "Requested memory exceeds the safe host/container allocation limit.",
      );
    const qmp = await port();
    let vnc = await port();
    for (let i = 0; (vnc === qmp || vnc < 5900) && i < 20; i++)
      vnc = await port();
    if (vnc === qmp || vnc < 5900)
      throw new Error("No valid private console port available.");
    const iso = machine.iso
      ? await containedFile(path.join(this.directory, "media"), machine.iso)
      : "";
    const { args } = launchPlan(machine, { disk, qmp, vnc, iso });
    const child = spawn(target.executable, args, {
      stdio: ["ignore", "ignore", "pipe"],
      windowsHide: true,
    });
    const r = {
      process: child,
      qmp,
      vnc,
      memory: machine.memory,
      state: "starting",
      startedAt: new Date().toISOString(),
      error: "",
    };
    this.lastErrors.delete(machine.id);
    this.running.set(machine.id, r);
    child.stderr.on("data", (data) => {
      r.error = (r.error + data.toString()).slice(-3000);
    });
    child.on("error", (error) => {
      r.error = error.message;
      r.state = "error";
      this.lastErrors.set(machine.id, r.error);
      if (this.running.get(machine.id) === r) this.running.delete(machine.id);
    });
    r.closed = new Promise((resolve) =>
      child.on("close", (code) => {
        if (code && r.error) this.lastErrors.set(machine.id, r.error);
        if (this.running.get(machine.id) === r) this.running.delete(machine.id);
        resolve();
      }),
    );
    const deadline = Date.now() + 10000;
    for (let i = 0; i < 30 && Date.now() < deadline; i++) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      if (r.state === "error" || !this.running.has(machine.id))
        throw new Error(r.error || "QEMU exited before becoming ready.");
      try {
        const result = await qmpCommand(
          qmp,
          "query-status",
          undefined,
          Math.max(1, deadline - Date.now()),
        );
        r.state = result.running ? "running" : "paused";
        return this.status(machine.id);
      } catch {
        /* Startup is bounded. */
      }
    }
    child.kill();
    throw new Error(r.error || "QEMU did not become ready within ten seconds.");
  }
  async command(id, execute, args) {
    const r = this.running.get(id);
    if (!r) throw new Error("Machine is not running.");
    return this.exclusive(`qmp:${id}`, () => qmpCommand(r.qmp, execute, args));
  }
  async action(id, action) {
    const r = this.running.get(id);
    if (!r) throw new Error("Machine is not running.");
    const commands = {
      pause: "stop",
      resume: "cont",
      shutdown: "system_powerdown",
      stop: "quit",
      reset: "system_reset",
    };
    if (!commands[action]) throw new Error("Unsupported action.");
    await this.command(id, commands[action]);
    if (action === "stop")
      await Promise.race([
        r.closed,
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error("Machine has not exited yet.")),
            5000,
          ),
        ),
      ]);
    else {
      const status = await this.command(id, "query-status");
      r.state = status.running ? "running" : status.status;
    }
    return { ...this.status(id), requested: action };
  }
  async close() {
    await Promise.all(
      [...this.running.keys()].map(async (id) => {
        try {
          await this.action(id, "stop");
        } catch {
          this.running.get(id)?.process.kill();
        }
      }),
    );
  }
}
async function port() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.on("error", reject);
    s.listen(0, "127.0.0.1", () => {
      const p = s.address().port;
      s.close(() => resolve(p));
    });
  });
}
export function qmpCommand(portNumber, execute, args, timeout = 3000) {
  return new Promise((resolve, reject) => {
    const socket = net.connect(portNumber, "127.0.0.1");
    let buffer = "",
      stage = 0;
    const timer = setTimeout(
      () => finish(new Error("QMP request timed out.")),
      timeout,
    );
    function finish(error, result) {
      clearTimeout(timer);
      socket.destroy();
      error ? reject(error) : resolve(result);
    }
    socket.on("error", (error) =>
      execute === "quit" && stage === 2 && error.code === "ECONNRESET"
        ? finish(null, {})
        : finish(error),
    );
    socket.on("data", (chunk) => {
      buffer += chunk.toString();
      if (buffer.length > 1024 * 1024)
        return finish(new Error("QMP response exceeded the limit."));
      let end;
      while ((end = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, end);
        buffer = buffer.slice(end + 1);
        let message;
        try {
          message = JSON.parse(line);
        } catch {
          return finish(new Error("Invalid QMP response."));
        }
        if (message.QMP && stage === 0) {
          stage = 1;
          socket.write(
            JSON.stringify({ execute: "qmp_capabilities", id: "cap" }) + "\n",
          );
        } else if (message.id === "cap") {
          if (message.error) return finish(new Error(message.error.desc));
          stage = 2;
          socket.write(
            JSON.stringify({ execute, arguments: args, id: "command" }) + "\n",
          );
        } else if (message.id === "command")
          return message.error
            ? finish(new Error(message.error.desc))
            : finish(null, message.return);
      }
    });
    socket.on("end", () => {
      if (execute === "quit" && stage === 2) finish(null, {});
      else finish(new Error("QMP connection closed."));
    });
  });
}
let previousCpu;
async function memoryLimit() {
  let limit = os.totalmem();
  for (const file of [
    "/sys/fs/cgroup/memory.max",
    "/sys/fs/cgroup/memory/memory.limit_in_bytes",
  ]) {
    try {
      const value = Number((await readFile(file, "utf8")).trim());
      if (Number.isFinite(value) && value > 0) limit = Math.min(limit, value);
    } catch {}
  }
  return limit;
}
export async function hostMetrics() {
  const cpus = os.cpus();
  const total = cpus.reduce(
    (sum, c) => sum + Object.values(c.times).reduce((a, b) => a + b, 0),
    0,
  );
  const idle = cpus.reduce((sum, c) => sum + c.times.idle, 0);
  const cpuPercent =
    previousCpu && total > previousCpu.total
      ? Math.round(
          100 * (1 - (idle - previousCpu.idle) / (total - previousCpu.total)),
        )
      : null;
  previousCpu = { total, idle };
  const memoryTotal = await memoryLimit();
  let memoryUsed = os.totalmem() - os.freemem();
  try {
    memoryUsed = Number(
      (await readFile("/sys/fs/cgroup/memory.current", "utf8")).trim(),
    );
  } catch {}
  return {
    cpuPercent,
    cpuCount: cpus.length,
    memoryTotal,
    memoryUsed: Math.min(memoryTotal, memoryUsed),
    uptime: os.uptime(),
    platform: os.platform(),
    arch: os.arch(),
    sampledAt: new Date().toISOString(),
    diskIO: null,
    networkIO: null,
  };
}

function validateMachineWithIdentity(machine, capabilities) {
  return { ...machine, ...validateMachine(machine, capabilities) };
}
