// QEMU guest agent: a fixed list of read-only questions asked of the agent
// running inside the guest, over the machine's own agent channel (a local TCP
// socket QEMU listens on). The browser chooses a question by name only.
import net from "node:net";

export const GUEST_QUERIES = Object.freeze({
  ping: "guest-ping",
  info: "guest-info",
  os: "guest-get-osinfo",
  hostname: "guest-get-host-name",
  network: "guest-network-get-interfaces",
  filesystems: "guest-get-fsinfo",
  users: "guest-get-users",
  time: "guest-get-time",
  timezone: "guest-get-timezone",
  vcpus: "guest-get-vcpus",
});

// Sends one command. Agents answer only after a guest-sync handshake clears
// whatever an earlier client left behind, so every call starts with one.
export function qgaCommand(port, execute, { timeout = 3000, host = "127.0.0.1" } = {}) {
  return new Promise((resolve, reject) => {
    const socket = net.connect(port, host);
    const syncId = Math.floor(Math.random() * 2 ** 31);
    let buffer = "", synced = false, settled = false;
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      error ? reject(error) : resolve(result);
    };
    const timer = setTimeout(() => finish(new Error("No guest agent answered. Start the agent inside the guest (qemu-guest-agent).")), timeout);
    socket.on("connect", () => socket.write(JSON.stringify({ execute: "guest-sync", arguments: { id: syncId } }) + "\n"));
    socket.on("error", (error) => finish(error.code === "ECONNREFUSED" ? new Error("This machine has no guest agent channel. Turn it on in Edit hardware.") : error));
    socket.on("data", (chunk) => {
      buffer += chunk.toString("utf8").replace(/\xff/g, "");
      if (buffer.length > 1024 * 1024) return finish(new Error("The guest agent reply exceeded the limit."));
      let end;
      while ((end = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, end).trim();
        buffer = buffer.slice(end + 1);
        if (!line) continue;
        let message;
        try { message = JSON.parse(line); } catch { continue; }
        if (!synced) {
          if (message.return === syncId) {
            synced = true;
            socket.write(JSON.stringify({ execute }) + "\n");
          }
          continue;
        }
        if (message.error) return finish(new Error(message.error.desc || "The guest agent refused the request."));
        if ("return" in message) return finish(null, message.return);
      }
    });
  });
}

export async function runGuestQuery(qemu, machine, name) {
  if (!Object.hasOwn(GUEST_QUERIES, name)) throw new Error("Choose a listed guest agent question.");
  const running = qemu.running.get(machine.id);
  if (!running) throw new Error("Machine is not running.");
  if (!running.qga) throw new Error("This machine has no guest agent channel. Turn it on in Edit hardware.");
  return qemu.exclusive(`qga:${machine.id}`, () => qgaCommand(running.qga, GUEST_QUERIES[name]));
}
