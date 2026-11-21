import test from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import { qgaCommand, runGuestQuery, GUEST_QUERIES } from "../server/guest-agent.mjs";
import { launchPlan } from "../server/launch-plan.mjs";

// A fake agent that speaks the guest-sync handshake like qemu-ga.
function fakeAgent(handler, { stale = true, silent = false } = {}) {
  const seen = [];
  const server = net.createServer((socket) => {
    if (stale) socket.write('{"return": {"left": "over"}}\n');
    let buffer = "";
    socket.on("data", (chunk) => {
      buffer += chunk;
      let end;
      while ((end = buffer.indexOf("\n")) !== -1) {
        const message = JSON.parse(buffer.slice(0, end));
        buffer = buffer.slice(end + 1);
        seen.push(message.execute);
        if (silent) continue;
        if (message.execute === "guest-sync") socket.write("\xff" + JSON.stringify({ return: message.arguments.id }) + "\n");
        else socket.write(JSON.stringify(handler(message.execute)) + "\n");
      }
    });
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve({ server, port: server.address().port, seen })));
}

test("a question is asked only after the sync handshake, ignoring stale output", async () => {
  const agent = await fakeAgent((cmd) => (cmd === "guest-get-osinfo" ? { return: { id: "debian", "version-id": "13" } } : { error: { desc: "Command not found" } }));
  try {
    assert.deepEqual(await qgaCommand(agent.port, "guest-get-osinfo"), { id: "debian", "version-id": "13" });
    assert.deepEqual(agent.seen, ["guest-sync", "guest-get-osinfo"]);
    await assert.rejects(qgaCommand(agent.port, "guest-nonsense"), /Command not found/);
  } finally {
    agent.server.close();
  }
});

test("a silent or missing agent gives a clear answer", async () => {
  const quiet = await fakeAgent(() => ({}), { silent: true });
  try {
    await assert.rejects(qgaCommand(quiet.port, "guest-ping", { timeout: 300 }), /No guest agent answered/);
  } finally {
    quiet.server.close();
  }
  const closed = net.createServer();
  await new Promise((r) => closed.listen(0, "127.0.0.1", r));
  const port = closed.address().port;
  closed.close();
  await new Promise((r) => setTimeout(r, 50));
  await assert.rejects(qgaCommand(port, "guest-ping"), /no guest agent channel/);
});

test("only listed questions are asked, and only of running machines with a channel", async () => {
  const qemu = { running: new Map([["on", { qga: 1 }], ["nochan", { qga: null }]]), exclusive: (_k, fn) => fn() };
  for (const bad of ["guest-exec", "exec", "file-open", "shutdown", "__proto__"]) await assert.rejects(runGuestQuery(qemu, { id: "on" }, bad), /listed guest agent question/);
  await assert.rejects(runGuestQuery(qemu, { id: "off" }, "ping"), /not running/);
  await assert.rejects(runGuestQuery(qemu, { id: "nochan" }, "ping"), /no guest agent channel/);
  assert.ok(Object.values(GUEST_QUERIES).every((c) => /^guest-(ping|info|get-|network-get-)/.test(c)));
});

test("the channel is added only when the machine asks for it", () => {
  const machine = { id: "11111111-1111-1111-1111-111111111111", name: "a", arch: "x86_64", machineType: "q35", accelerator: "tcg", firmware: "bios", cpus: 1, sockets: 1, cores: 1, threads: 1, memory: 256, disks: [], cdroms: [], network: { mode: "none" }, display: { adapter: "std" }, usb: {}, bootOrder: ["disk"] };
  const on = launchPlan({ ...machine, guestAgent: true }, { qga: 45678 }).args.join(" ");
  assert.match(on, /socket,id=qga0,host=127\.0\.0\.1,port=45678,server=on,wait=off/);
  assert.match(on, /virtserialport,chardev=qga0,name=org\.qemu\.guest_agent\.0/);
  assert.doesNotMatch(launchPlan(machine).args.join(" "), /qga0/);
});
