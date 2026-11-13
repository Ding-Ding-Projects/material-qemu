import { mkdir, readFile, rename, writeFile, copyFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

export class Store {
  constructor(directory) {
    this.directory = path.resolve(directory);
    this.file = path.join(this.directory, "state.json");
    this.queue = Promise.resolve();
  }
  async open() {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    try {
      this.state = JSON.parse(await readFile(this.file, "utf8"));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      this.state = {
        version: 1,
        owner: null,
        machines: [],
        folders: [],
        views: [],
        events: [],
        setup: { step: 1 },
        settings: {
          theme: "dark",
          language: "en",
          motion: true,
          layout: "cards",
          columns: ["platform", "memory", "cpu"],
        },
      };
    }
    validateState(this.state);
    return this;
  }
  transaction(action) {
    const operation = this.queue.then(async () => {
      const next = structuredClone(this.state);
      const result = await action(next);
      validateState(next);
      const temporary = `${this.file}.${randomUUID()}.tmp`;
      await writeFile(temporary, JSON.stringify(next, null, 2), {
        mode: 0o600,
      });
      try {
        await copyFile(this.file, `${this.file}.previous`);
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
      await rename(temporary, this.file);
      this.state = next;
      return result;
    });
    this.queue = operation.catch(() => {});
    return operation;
  }
}
export function event(state, message) {
  state.events.unshift({
    id: randomUUID(),
    at: new Date().toISOString(),
    message,
  });
  state.events = state.events.slice(0, 200);
}
function validateState(state) {
  if (
    state.version !== 1 ||
    !Array.isArray(state.machines) ||
    !Array.isArray(state.folders) ||
    !Array.isArray(state.views) ||
    !Array.isArray(state.events) ||
    !state.settings ||
    !state.setup
  )
    throw new Error(
      "Unsupported or invalid state file. Restore a verified backup before starting.",
    );
  if (
    state.owner &&
    (!/^[a-f0-9]{128}$/.test(state.owner.hash) ||
      !/^[a-f0-9]{32}$/.test(state.owner.salt) ||
      !Array.isArray(state.owner.credentials))
  )
    throw new Error("Invalid owner state. Restore a verified backup.");
  if (
    state.machines.some(
      (m) =>
        !/^[a-f0-9-]{36}$/.test(m.id) ||
        typeof m.name !== "string" ||
        !["x86_64", "aarch64"].includes(m.arch) ||
        !Number.isInteger(m.memory) ||
        !Number.isInteger(m.cpus),
    )
  )
    throw new Error("Invalid machine state. Restore a verified backup.");
}
