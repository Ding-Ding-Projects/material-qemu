import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  mkdir,
  readdir,
  realpath,
  stat,
  access,
} from "node:fs/promises";
import path from "node:path";
import net from "node:net";
import { memoryLimit } from "./resources.mjs";
import { targets, discoverCapabilities } from "./capabilities.mjs";
import { discoverHost } from "./host.mjs";
import { qemuImg } from "./disk-tools.mjs";
import { validateMachine, diskFileName } from "./machine-config.mjs";
import { launchPlan } from "./launch-plan.mjs";
export { hostMetrics } from "./resources.mjs";
export { validateMachine, launchPlan };

const exec = promisify(execFile);

export async function containedFile(directory, name) {
  const root = await realpath(directory);
  const resolved = await realpath(path.join(directory, name));
  if (!resolved.startsWith(root + path.sep) || !(await stat(resolved)).isFile())
    throw new Error("File is outside managed storage.");
  return resolved;
}

export class Qemu {
  constructor(directory) {
    this.directory = directory;
    this.running = new Map();
    this.lastErrors = new Map();
    this.locks = new Map();
    this.capabilities = {};
    this.host = {
      firmware: {
        x86_64: { uefi: false, secureBoot: false },
        i386: { uefi: false, secureBoot: false },
      },
      swtpm: null,
      cpuModels: {},
    };
  }
  async open() {
    for (const dir of ["disks", "media", "runtime", "imports"])
      await mkdir(path.join(this.directory, dir), {
        recursive: true,
        mode: 0o700,
      });
    this.capabilities = await discoverCapabilities();
    this.host = await discoverHost(this.capabilities);
    return this;
  }
  runtimeDirectory(id) {
    if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error("Invalid machine id.");
    return path.join(this.directory, "runtime", id);
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
    return this.createDisk(id, {
      id: "disk0",
      format: "qcow2",
      sizeGiB: size,
    });
  }
  async createDisk(machineId, disk) {
    const destination = path.join(
      this.directory,
      "disks",
      diskFileName(machineId, disk),
    );
    // Never overwrite existing data, including a detached disk's file.
    if (await stat(destination).then(() => true, () => false))
      throw new Error(
        "A disk file with this id already exists in managed storage. Use another disk id.",
      );
    await exec(
      "qemu-img",
      ["create", "-f", disk.format, destination, `${disk.sizeGiB}G`],
      { timeout: 20000 },
    );
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
    machine = {
      ...machine,
      ...validateMachine(machine, this.capabilities, this.host),
    };
    if (this.running.has(machine.id))
      throw new Error("Machine is already active.");
    if (!this.capabilities[machine.arch]?.available)
      throw new Error(
        this.capabilities[machine.arch]?.reason || "QEMU unavailable.",
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
    const diskPaths = {};
    for (const d of machine.disks)
      diskPaths[d.id] = await containedFile(
        path.join(this.directory, "disks"),
        diskFileName(machine.id, d),
      );
    const cdPaths = [];
    for (const name of machine.cdroms)
      cdPaths.push(
        await containedFile(path.join(this.directory, "media"), name),
      );
    const runtime = this.runtimeDirectory(machine.id);
    await mkdir(runtime, { recursive: true, mode: 0o700 });
    const options = { disks: diskPaths, cdroms: cdPaths, qmp, vnc };
    if (
      ["x86_64", "i386"].includes(machine.arch) &&
      machine.firmware === "uefi"
    ) {
      const firmware = this.host.firmware[machine.arch];
      options.firmware = firmware;
      // The per-machine variable store is qcow2 so running snapshots work:
      // QEMU refuses to snapshot a machine with a writable raw flash device.
      options.vars = path.join(runtime, "OVMF_VARS.qcow2");
      options.varsFormat = "qcow2";
      if (!(await stat(options.vars).then(() => true, () => false)))
        await qemuImg([
          "convert",
          "-f",
          "raw",
          "-O",
          "qcow2",
          firmware.vars,
          options.vars,
        ]);
    }
    if (machine.serial) options.serialLog = path.join(runtime, "serial.log");
    let tpm = null;
    if (machine.tpm) {
      if (!this.host.swtpm)
        throw new Error("The swtpm emulator was not found on this host.");
      const state = path.join(runtime, "tpm");
      await mkdir(state, { recursive: true, mode: 0o700 });
      options.tpmSocket = path.join(runtime, "swtpm.sock");
      tpm = spawn(
        this.host.swtpm,
        [
          "socket",
          "--tpmstate",
          `dir=${state}`,
          "--ctrl",
          `type=unixio,path=${options.tpmSocket}`,
          "--tpm2",
          "--terminate",
        ],
        { stdio: "ignore", windowsHide: true },
      );
      tpm.on("error", () => {});
      for (let i = 0; i < 30; i++) {
        try {
          await access(options.tpmSocket);
          break;
        } catch {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      }
    }
    const { args } = launchPlan(machine, options);
    const child = spawn(target.executable, args, {
      stdio: ["ignore", "ignore", "pipe"],
      windowsHide: true,
    });
    child.on("close", () => tpm?.kill());
    child.on("error", () => tpm?.kill());
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
  async command(id, execute, args, timeout) {
    const r = this.running.get(id);
    if (!r) throw new Error("Machine is not running.");
    return this.exclusive(`qmp:${id}`, () =>
      qmpCommand(r.qmp, execute, args, timeout),
    );
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
