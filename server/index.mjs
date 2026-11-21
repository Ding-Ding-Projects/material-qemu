import http from "node:http";
import { readFile, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID, randomBytes } from "node:crypto";
import net from "node:net";
import { WebSocketServer } from "ws";
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server";
import { Store, event } from "./store.mjs";
import { Qemu, validateMachine, launchPlan, containedFile } from "./qemu.mjs";
import { mergeMachineUpdate, migrateMachine, diskFileName } from "./machine-config.mjs";
import { hostSummary } from "./host.mjs";
import { performLiveAction, SCREENSHOT_FILE } from "./live-actions.mjs";
import {
  listSnapshots,
  createSnapshot,
  restoreSnapshot,
  deleteSnapshot,
} from "./snapshots.mjs";
import {
  storageReport,
  resizeDisk,
  cloneMachine,
  deleteIso,
} from "./storage.mjs";
import { importDisk } from "./disk-import.mjs";
import { removeMachine, restoreMachine } from "./machine-records.mjs";
import { setPasswordAccess } from "./security-settings.mjs";
import { Sessions, hashPassword, checkPassword } from "./auth.mjs";
import { updateOrganization, requireFolder } from "./organization.mjs";
import { receiveIso, MAX_ISO_BYTES } from "./media.mjs";
import { MetricSampler } from "./resources.mjs";
import { dataDirectory } from "./paths.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export async function createApplication(options = {}) {
  const data = dataDirectory(root, options.data || process.env.DATA_DIR);
  let buildInfo = null;
  try {
    buildInfo = JSON.parse(
      await readFile(path.join(root, "build-receipt.json"), "utf8"),
    );
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const origin =
    options.origin || process.env.PUBLIC_ORIGIN || "http://localhost:8080";
  const expected = new URL(origin),
    secure = expected.protocol === "https:";
  const store = await new Store(data).open();
  const qemu = await new Qemu(data).open();
  const metrics = await new MetricSampler().start();
  const sessions = new Sessions();
  const challenges = new Map();
  let activeUploads = 0;
  // The first person to register becomes the owner; no setup code is needed.
  // Remove the code file older versions wrote so it does not linger.
  await unlink(path.join(data, "setup-code")).catch(() => {});
  const json = (res, status, body, headers = {}) => {
    res.writeHead(status, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...headers,
    });
    res.end(JSON.stringify(body));
  };
  const login = (res, method = "password") => {
    const session = sessions.issue(method);
    json(
      res,
      200,
      { csrf: session.csrf },
      { "Set-Cookie": sessions.cookie(session.id, secure) },
    );
  };
  const sessionInfo = (session) => ({
    authenticated: Boolean(session),
    setupRequired: !store.state.owner,
    passwordEnabled: store.state.owner?.passwordEnabled !== false,
    setup: session ? store.state.setup : null,
    csrf: session?.csrf,
    version: "0.1.0",
    updatedAt: process.env.BUILD_DATE || buildInfo?.builtAt || null,
    origin,
  });
  const server = http.createServer(async (req, res) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "same-origin");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'none'",
    );
    try {
      if (req.headers.host !== expected.host)
        return json(res, 421, { error: "Host does not match PUBLIC_ORIGIN." });
      const url = new URL(req.url, origin),
        route = url.pathname;
      const session = sessions.get(req);
      if (route === "/health")
        return json(res, 200, { status: "healthy", version: "0.1.0" });
      if (!route.startsWith("/api/")) return await staticFile(route, res);
      if (req.method === "GET" && route === "/api/session")
        return json(res, 200, sessionInfo(session));
      if (req.method !== "GET") {
        if (
          req.headers.origin !== origin ||
          req.headers["content-type"]?.split(";")[0] !==
            (route === "/api/media" || route === "/api/storage/import"
              ? "application/octet-stream"
              : "application/json")
        )
          return json(res, 403, { error: "Origin or content type rejected." });
        if (session && req.headers["x-csrf-token"] !== session.csrf)
          return json(res, 403, {
            error: "Session verification failed. Reload and try again.",
          });
      }
      if (route === "/api/media" && req.method === "POST") {
        if (!session)
          return json(res, 401, {
            error: "Sign in to upload installation media.",
          });
        if (activeUploads >= 2)
          return json(res, 429, {
            error: "Two uploads are already active. Wait for one to finish.",
          });
        activeUploads++;
        const deadline = setTimeout(
          () => req.destroy(new Error("Upload exceeded the 15-minute limit.")),
          15 * 60 * 1000,
        );
        try {
          const media = await receiveIso(
            req,
            data,
            url.searchParams.get("name"),
          );
          try {
            await store.transaction((s) =>
              event(
                s,
                `Imported installation media ${media.name} (${media.bytes} bytes).`,
              ),
            );
            return json(res, 201, { ...media, auditRecorded: true });
          } catch {
            return json(res, 201, {
              ...media,
              auditRecorded: false,
              warning:
                "ISO saved successfully, but activity history could not be recorded. Refresh the media library before retrying.",
            });
          }
        } finally {
          clearTimeout(deadline);
          activeUploads--;
        }
      }
      if (route === "/api/storage/import" && req.method === "POST") {
        if (!session)
          return json(res, 401, { error: "Sign in to import a disk image." });
        if (activeUploads >= 2)
          return json(res, 429, {
            error: "Two uploads are already active. Wait for one to finish.",
          });
        activeUploads++;
        const deadline = setTimeout(
          () => req.destroy(new Error("Upload exceeded the 60-minute limit.")),
          60 * 60 * 1000,
        );
        try {
          const mode = url.searchParams.get("mode");
          const target = url.searchParams.get("machineId");
          const result = await (mode === "disk" && target
            ? qemu.exclusive(target, () =>
                importDisk({ request: req, params: url.searchParams, store, qemu }),
              )
            : importDisk({ request: req, params: url.searchParams, store, qemu }));
          return json(res, 201, result);
        } finally {
          clearTimeout(deadline);
          activeUploads--;
        }
      }
      const body = req.method === "GET" ? {} : await readJson(req);
      if (route === "/api/setup" && req.method === "POST") {
        if (!sessions.allow(req.socket.remoteAddress))
          return json(res, 429, {
            error: "Too many attempts. Try again in 15 minutes.",
          });
        if (store.state.owner)
          return json(res, 409, {
            error: "This workspace already has an owner. Sign in instead.",
          });
        const password = await hashPassword(body.password);
        const name = String(body.name || "")
          .trim()
          .slice(0, 80);
        if (!name) throw new Error("Owner name is required.");
        await store.transaction((state) => {
          if (state.owner)
            throw new Error("Owner setup has already completed.");
          state.owner = { name, username: name, ...password, credentials: [] };
          state.setup = { step: 2, complete: false };
          if (["en", "yue", "both"].includes(body.preferences?.language))
            state.settings.language = body.preferences.language;
          if (["dark", "light", "system"].includes(body.preferences?.theme))
            state.settings.theme = body.preferences.theme;
          event(state, "Owner account created.");
        });
        return login(res);
      }
      if (route === "/api/login" && req.method === "POST") {
        if (store.state.owner?.passwordEnabled === false)
          return json(res, 403, {
            error: "Password sign-in is disabled. Use a registered passkey.",
          });
        const address = req.socket.remoteAddress;
        if (!sessions.reserve(address))
          return json(res, 429, {
            error:
              "Sign-in is temporarily limited. After five unsuccessful attempts, wait fifteen minutes.",
          });
        let successful = false;
        try {
          const owner = store.state.owner;
          const passwordMatches = owner
            ? await checkPassword(body.password, owner)
            : false;
          const usernameMatches =
            typeof body.username === "string" &&
            body.username.trim() === (owner?.username || owner?.name);
          if (!owner || !usernameMatches || !passwordMatches)
            return json(res, 401, {
              error: "The sign-in details were not accepted.",
            });
          successful = true;
          return login(res);
        } finally {
          sessions.finish(address, successful);
        }
      }
      if (route === "/api/passkey/login-options" && req.method === "POST") {
        if (!sessions.allow(req.socket.remoteAddress))
          return json(res, 429, { error: "Too many attempts." });
        if (!store.state.owner?.credentials.length)
          throw new Error(
            "No passkey is registered. Sign in with your password first.",
          );
        const options = await generateAuthenticationOptions({
          rpID: expected.hostname,
          allowCredentials: store.state.owner.credentials.map((c) => ({
            id: c.id,
            transports: c.transports,
          })),
          userVerification: "required",
        });
        const id = randomBytes(24).toString("base64url");
        challenges.set(id, {
          challenge: options.challenge,
          expires: Date.now() + 60000,
          kind: "login",
        });
        pruneChallenges();
        return json(res, 200, { id, options });
      }
      if (route === "/api/passkey/login" && req.method === "POST") {
        const address = req.socket.remoteAddress;
        if (!sessions.reserve(address))
          return json(res, 429, {
            error:
              "Sign-in is temporarily limited. After five unsuccessful attempts, wait fifteen minutes.",
          });
        let successful = false;
        try {
          const challenge = takeChallenge(body.id, "login");
          const credential = store.state.owner?.credentials.find(
            (c) => c.id === body.response?.id,
          );
          if (!credential) throw new Error("Unknown passkey.");
          const result = await verifyAuthenticationResponse({
            response: body.response,
            expectedChallenge: challenge,
            expectedOrigin: origin,
            expectedRPID: expected.hostname,
            credential: {
              ...credential,
              publicKey: Uint8Array.from(
                Buffer.from(credential.publicKey, "base64"),
              ),
            },
            requireUserVerification: true,
          });
          if (!result.verified) {
            throw new Error("Passkey verification failed.");
          }
          await store.transaction((s) => {
            const current = s.owner.credentials.find(
              (c) => c.id === credential.id,
            );
            const next = result.authenticationInfo.newCounter;
            if ((current.counter > 0 || next > 0) && next <= current.counter)
              throw new Error("Passkey counter did not advance.");
            current.counter = next;
          });
          successful = true;
          return login(res, "passkey");
        } finally {
          sessions.finish(address, successful);
        }
      }
      if (!session) return json(res, 401, { error: "Sign in to continue." });
      if (route === "/api/security" && req.method === "POST") {
        if (
          session.method !== "passkey" ||
          !session.passkeyVerifiedAt ||
          Date.now() - session.passkeyVerifiedAt > 5 * 60 * 1000
        )
          return json(res, 403, {
            error: "Verify a passkey again before changing password sign-in.",
          });
        return json(
          res,
          200,
          await store.transaction((s) => setPasswordAccess(s, body, session)),
        );
      }
      if (route === "/api/logout" && req.method === "POST") {
        sessions.items.delete(session.id);
        for (const ws of wss.clients)
          if (ws.sessionId === session.id) ws.close(1008, "Signed out");
        return json(
          res,
          200,
          {},
          {
            "Set-Cookie":
              "mq_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0",
          },
        );
      }
      if (route === "/api/state" && req.method === "GET") {
        await qemu.refreshStates();
        return json(res, 200, {
          ...sessionInfo(session),
          owner: {
            name: store.state.owner.name,
            passkeys: store.state.owner.credentials.length,
            passwordEnabled: store.state.owner.passwordEnabled !== false,
          },
          machines: store.state.machines.map((m) => ({
            ...m,
            ...qemu.status(m.id),
          })),
          removedMachines: store.state.removedMachines || [],
          settings: store.state.settings,
          folders: store.state.folders,
          views: store.state.views,
          events: store.state.events,
          capabilities: qemu.capabilities,
          capabilityDiscovery: qemu.capabilities.inventory,
          media: await qemu.media(),
          mediaMaxBytes: MAX_ISO_BYTES,
          metrics: metrics.latest,
          metricHistory: metrics.history,
          metricError: metrics.error,
        });
      }
      if (route === "/api/preferences" && req.method === "POST") {
        await store.transaction((s) => {
          if (body.settings) {
            const v = body.settings;
            if (Array.isArray(v.collapsedFolders)) {
              if (
                v.collapsedFolders.length > 101 ||
                v.collapsedFolders.some(
                  (name) =>
                    typeof name !== "string" ||
                    (name !== "" && !s.folders.includes(name)),
                )
              )
                throw new Error("Collapsed folder selection is invalid.");
              s.settings.collapsedFolders = [...new Set(v.collapsedFolders)];
            }
            if (
              ["all", "running", "paused", "stopped", "attention"].includes(
                v.overviewState,
              )
            )
              s.settings.overviewState = v.overviewState;
            if (
              v.overviewArch === "all" ||
              Object.hasOwn(qemu.capabilities, v.overviewArch)
            )
              s.settings.overviewArch = v.overviewArch;
            if (["dark", "light", "system"].includes(v.theme))
              s.settings.theme = v.theme;
            if (["en", "yue", "both"].includes(v.language))
              s.settings.language = v.language;
            if (typeof v.motion === "boolean") s.settings.motion = v.motion;
            if (["cards", "list", "compact"].includes(v.layout))
              s.settings.layout = v.layout;
            if (Array.isArray(v.columns))
              s.settings.columns = v.columns.filter((c) =>
                ["platform", "memory", "cpu"].includes(c),
              );
          }
          if (body.setup) {
            const step = Number(body.setup.step);
            if (!Number.isInteger(step) || step < 2 || step > 8)
              throw new Error("Invalid setup step.");
            if (body.setup.complete && step !== 8)
              throw new Error(
                "Complete onboarding from the final review step.",
              );
            const skipped = s.setup.skipped || [];
            if (body.setup.skipStep !== undefined) {
              if (![4, 5, 6, 7].includes(body.setup.skipStep))
                throw new Error("This onboarding step is required.");
              if (!skipped.includes(body.setup.skipStep))
                skipped.push(body.setup.skipStep);
            }
            s.setup = {
              step,
              complete: Boolean(body.setup.complete),
              skipped,
              savedAt: new Date().toISOString(),
            };
          }
          updateOrganization(s, body);
        });
        return json(res, 200, { saved: true });
      }
      if (route === "/api/passkey/register-options" && req.method === "POST") {
        const options = await generateRegistrationOptions({
          rpName: "Material QEMU",
          rpID: expected.hostname,
          userName: store.state.owner.name,
          attestationType: "none",
          excludeCredentials: store.state.owner.credentials.map((c) => ({
            id: c.id,
          })),
          authenticatorSelection: {
            residentKey: "preferred",
            userVerification: "required",
          },
        });
        challenges.set(session.id, {
          challenge: options.challenge,
          expires: Date.now() + 60000,
          kind: "register",
        });
        return json(res, 200, { options });
      }
      if (route === "/api/passkey/register" && req.method === "POST") {
        const result = await verifyRegistrationResponse({
          response: body.response,
          expectedChallenge: takeChallenge(session.id, "register"),
          expectedOrigin: origin,
          expectedRPID: expected.hostname,
          requireUserVerification: true,
        });
        if (!result.verified)
          throw new Error("Passkey registration was not verified.");
        const c = result.registrationInfo.credential;
        await store.transaction((s) => {
          s.owner.credentials.push({
            ...c,
            publicKey: Buffer.from(c.publicKey).toString("base64"),
          });
          event(s, "Passkey registered.");
        });
        return json(res, 200, { registered: true });
      }
      if (route === "/api/host" && req.method === "GET")
        return json(res, 200, hostSummary(qemu.host, qemu.capabilities));
      if (route === "/api/storage" && req.method === "GET")
        return json(res, 200, await storageReport(store, qemu));
      if (route === "/api/storage/disks/resize" && req.method === "POST") {
        const result = await qemu.exclusive(String(body.machineId), () =>
          resizeDisk(store, qemu, body),
        );
        return json(res, 200, result);
      }
      const isoMatch = route.match(/^\/api\/storage\/isos\/([^/]+)$/);
      if (isoMatch && req.method === "DELETE")
        return json(
          res,
          200,
          await deleteIso(store, qemu, decodeURIComponent(isoMatch[1])),
        );
      const screenshotMatch = route.match(
        /^\/api\/machines\/([a-f0-9-]{36})\/screenshot$/,
      );
      if (screenshotMatch && req.method === "GET") {
        if (!store.state.machines.some((m) => m.id === screenshotMatch[1]))
          return json(res, 404, { error: "Machine not found." });
        const shotMachine = store.state.machines.find((m) => m.id === screenshotMatch[1]);
        const shotFile = path.join(qemu.runtimeDirectory(shotMachine.id), SCREENSHOT_FILE);
        if (qemu.status(shotMachine.id)?.state === "running") {
          const age = await stat(shotFile).then((s) => Date.now() - s.mtimeMs, () => Infinity);
          if (age > 2000)
            await qemu
              .exclusive(shotMachine.id, () =>
                performLiveAction(qemu, migrateMachine(shotMachine), { action: "screenshot" }),
              )
              .catch(() => {});
        }
        try {
          const image = await readFile(
            path.join(
              qemu.runtimeDirectory(screenshotMatch[1]),
              SCREENSHOT_FILE,
            ),
          );
          res.writeHead(200, {
            "Content-Type": "image/png",
            "Cache-Control": "no-store",
          });
          return res.end(image);
        } catch {
          return json(res, 404, { error: "No screenshot has been taken yet." });
        }
      }
      const snapshotMatch = route.match(
        /^\/api\/machines\/([a-f0-9-]{36})\/snapshots(?:\/([^/]+?)(\/restore)?)?$/,
      );
      if (snapshotMatch) {
        const machine = store.state.machines.find(
          (m) => m.id === snapshotMatch[1],
        );
        if (!machine) return json(res, 404, { error: "Machine not found." });
        const view = migrateMachine(machine);
        const name = snapshotMatch[2] && decodeURIComponent(snapshotMatch[2]);
        const method = req.method;
        const work = async (action, message) =>
          qemu.exclusive(machine.id, async () => {
            const result = await action();
            await store.transaction((s) => event(s, `${machine.name}: ${message}`));
            return result;
          });
        if (!name && method === "GET")
          return json(
            res,
            200,
            await qemu.exclusive(machine.id, () => listSnapshots(qemu, view)),
          );
        if (!name && method === "POST") {
          await work(() => createSnapshot(qemu, view, body.name), `snapshot ${body.name} created.`);
          return json(res, 201, { created: true, name: body.name });
        }
        if (name && snapshotMatch[3] && method === "POST") {
          await work(() => restoreSnapshot(qemu, view, name), `snapshot ${name} restored.`);
          return json(res, 200, { restored: true, name });
        }
        if (name && !snapshotMatch[3] && method === "DELETE") {
          await work(() => deleteSnapshot(qemu, view, name), `snapshot ${name} deleted.`);
          return json(res, 200, { deleted: true, name });
        }
        return json(res, 404, { error: "Unknown endpoint." });
      }
      if (
        (route === "/api/machine-preview" || route === "/api/machines/preview") &&
        req.method === "POST"
      ) {
        const config = validateMachine(body, qemu.capabilities, qemu.host);
        return json(res, 200, {
          ...launchPlan(config),
          available: Boolean(qemu.capabilities[config.arch]?.available),
          executed: false,
          placeholders: true,
        });
      }
      if (route === "/api/machines" && req.method === "POST") {
        const config = validateMachine(body, qemu.capabilities, qemu.host);
        if (!qemu.capabilities[config.arch]?.available)
          throw new Error(
            "This architecture is unavailable. Install its QEMU system emulator first.",
          );
        const machine = {
          ...config,
          id: randomUUID(),
          createdAt: new Date().toISOString(),
        };
        await store
          .transaction(async (s) => {
            if (s.machines.length >= 100)
              throw new Error("Machine limit reached.");
            for (const disk of machine.disks)
              await qemu.createDisk(machine.id, disk);
            requireFolder(s, machine.folder);
            s.machines.push(machine);
            event(s, `Created ${machine.name}.`);
          })
          .catch(async (error) => {
            for (const disk of machine.disks)
              await unlink(
                path.join(data, "disks", diskFileName(machine.id, disk)),
              ).catch(() => {});
            throw error;
          });
        if (body.startAfterCreate === true) {
          try {
            await qemu.exclusive(machine.id, () => qemu.start(machine));
            await store.transaction((s) => {
              s.machines.find((m) => m.id === machine.id).lastUsed =
                new Date().toISOString();
              event(s, `${machine.name}: started after creation.`);
            });
            return json(res, 201, { ...machine, ...qemu.status(machine.id) });
          } catch (error) {
            return json(res, 201, {
              ...machine,
              ...qemu.status(machine.id),
              startError: error.message,
            });
          }
        }
        return json(res, 201, { ...machine, ...qemu.status(machine.id) });
      }
      const restoreMatch = route.match(
        /^\/api\/removed-machines\/([a-f0-9-]{36})\/restore$/,
      );
      if (restoreMatch && req.method === "POST") {
        const id = restoreMatch[1];
        const result = await qemu.exclusive(id, async () => {
          await containedFile(path.join(data, "disks"), `${id}.qcow2`);
          return store.transaction((s) => restoreMachine(s, id));
        });
        return json(res, 200, result);
      }
      const match = route.match(
        /^\/api\/machines\/([a-f0-9-]{36})(?:\/(actions?|keys|remove|clone))?$/,
      );
      if (match && req.method === "POST") {
        if (!store.state.machines.some((m) => m.id === match[1]))
          return json(res, 404, { error: "Machine not found." });
        const result = await qemu.exclusive(match[1], async () => {
          const machine = store.state.machines.find((m) => m.id === match[1]);
          if (!machine) throw new Error("Machine no longer exists.");
          if (match[2] === "remove")
            return store.transaction((s) =>
              removeMachine(s, machine.id, body, qemu.status(machine.id).state),
            );
          if (match[2] === "clone") {
            const clone = await cloneMachine(
              store,
              qemu,
              machine,
              String(body.name || "").trim(),
            );
            return { cloned: true, machine: clone };
          }
          if (match[2] === "actions") {
            // Live actions (QMP) and start; legacy `/action` stays below.
            let liveResult = {};
            if (body.action === "start") await qemu.start(machine);
            else
              await performLiveAction(qemu, migrateMachine(machine), body).then(
                (result) => (liveResult = result),
              );
            await store.transaction((s) => {
              s.machines.find((m) => m.id === machine.id).lastUsed =
                new Date().toISOString();
              event(s, `${machine.name}: ${body.action} requested.`);
            });
            return { ...qemu.status(machine.id), ...liveResult };
          }
          if (match[2] === "action") {
            if (body.action === "start") await qemu.start(machine);
            else await qemu.action(machine.id, body.action);
            await store.transaction((s) => {
              s.machines.find((m) => m.id === machine.id).lastUsed =
                new Date().toISOString();
              event(s, `${machine.name}: ${body.action} requested.`);
            });
            return qemu.status(machine.id);
          }
          if (match[2] === "keys") {
            const sequences = {
              ctrlaltdel: ["ctrl", "alt", "delete"],
              ctrlaltf1: ["ctrl", "alt", "f1"],
              ctrlaltf2: ["ctrl", "alt", "f2"],
              print: ["print"],
              meta: ["meta_l"],
              escape: ["esc"],
              enter: ["ret"],
            };
            if (!sequences[body.keys])
              throw new Error("Unsupported key sequence.");
            return qemu.command(machine.id, "send-key", {
              keys: sequences[body.keys].map((data) => ({
                type: "qcode",
                data,
              })),
            });
          }
          const metadataOnly = Object.keys(body).every((key) =>
            ["favourite", "folder", "notes", "tags"].includes(key),
          );
          if (!metadataOnly && qemu.status(machine.id).state !== "stopped")
            throw new Error("Stop the machine before editing hardware.");
          const config = validateMachine(
            mergeMachineUpdate(machine, body),
            qemu.capabilities,
            metadataOnly ? undefined : qemu.host,
          );
          // Disks added by this edit get a new managed file; removed disks
          // keep their data on storage and are only detached.
          const known = new Set(migrateMachine(machine).disks.map((d) => d.id));
          const added = config.disks.filter((d) => !known.has(d.id));
          const created = [];
          try {
            for (const disk of added) {
              await qemu.createDisk(machine.id, disk);
              created.push(disk);
            }
          } catch (error) {
            for (const disk of created)
              await unlink(
                path.join(data, "disks", diskFileName(machine.id, disk)),
              ).catch(() => {});
            throw error;
          }
          await store.transaction((s) => {
            requireFolder(s, config.folder);
            Object.assign(
              s.machines.find((m) => m.id === machine.id),
              config,
            );
            event(s, `Updated ${config.name}.`);
          });
          return { saved: true };
        });
        return json(res, 200, result);
      }
      return json(res, 404, { error: "Unknown endpoint." });
    } catch (error) {
      json(res, 400, { error: error.message });
    }
  });
  function pruneChallenges() {
    for (const [k, v] of challenges)
      if (v.expires < Date.now()) challenges.delete(k);
    if (challenges.size > 1000)
      challenges.delete(challenges.keys().next().value);
  }
  function takeChallenge(id, kind) {
    const c = challenges.get(id);
    challenges.delete(id);
    if (!c || c.expires < Date.now() || c.kind !== kind)
      throw new Error("Authentication challenge expired. Try again.");
    return c.challenge;
  }
  const wss = new WebSocketServer({ noServer: true, maxPayload: 1024 * 1024 });
  server.on("upgrade", (req, socket, head) => {
    const match = req.url.match(/^\/console\/([a-f0-9-]{36})$/);
    const session = sessions.get(req);
    if (
      req.headers.host !== expected.host ||
      req.headers.origin !== origin ||
      !session ||
      !match ||
      !qemu.running.has(match[1])
    )
      return socket.destroy();
    const runtime = qemu.running.get(match[1]);
    wss.handleUpgrade(req, socket, head, (ws) => {
      ws.sessionId = session.id;
      const tcp = net.connect(runtime.vnc, "127.0.0.1");
      ws.on("message", (data) => {
        if (!sessions.items.has(session.id))
          return ws.close(1008, "Signed out");
        if (tcp.writable && !tcp.write(data))
          ws.close(1013, "Input exceeded transport capacity");
      });
      tcp.on("data", (data) => {
        if (ws.bufferedAmount > 4 * 1024 * 1024)
          return ws.close(1013, "Display exceeded transport capacity");
        if (ws.readyState === 1) ws.send(data);
      });
      tcp.on("error", () => ws.close());
      tcp.on("close", () => ws.close());
      ws.on("close", () => tcp.destroy());
      ws.on("error", () => tcp.destroy());
      const expiry = setTimeout(
        () => ws.close(1008, "Session expired"),
        Math.max(0, session.expires - Date.now()),
      );
      ws.on("close", () => clearTimeout(expiry));
    });
  });
  async function staticFile(route, res) {
    let base = path.join(root, "public"),
      relative =
        route === "/" ? "index.html" : decodeURIComponent(route).slice(1);
    if (route.startsWith("/vendor/novnc/")) {
      base = path.join(root, "node_modules/@novnc/novnc");
      relative = route.slice("/vendor/novnc/".length);
    }
    if (route === "/vendor/webauthn.js") {
      base = path.join(
        root,
        "node_modules/@simplewebauthn/browser/dist/bundle",
      );
      relative = "index.umd.min.js";
    }
    if (route === "/fonts/roboto-flex.woff2") {
      base = path.join(
        root,
        "node_modules/@fontsource-variable/roboto-flex/files",
      );
      relative = "roboto-flex-latin-full-normal.woff2";
    }
    if (route === "/fonts/material-symbols.woff2") {
      base = path.join(
        root,
        "node_modules/@fontsource/material-symbols-rounded/files",
      );
      relative = "material-symbols-rounded-latin-500-normal.woff2";
    }
    const file = path.resolve(base, relative);
    if (!file.startsWith(base + path.sep))
      return json(res, 404, { error: "Not found." });
    try {
      if (!(await stat(file)).isFile())
        return json(res, 404, { error: "Not found." });
      const types = {
        ".html": "text/html",
        ".js": "text/javascript",
        ".css": "text/css",
        ".woff2": "font/woff2",
        ".svg": "image/svg+xml",
      };
      res.writeHead(200, {
        "Content-Type": types[path.extname(file)] || "application/octet-stream",
      });
      res.end(await readFile(file));
    } catch {
      return json(res, 404, { error: "Not found." });
    }
  }
  server.requestTimeout = 60 * 60 * 1000 + 1000;
  server.headersTimeout = 60000;
  // Start every machine marked autostart. Failures are recorded per machine
  // and never stop the server.
  async function autostart() {
    const started = [];
    for (const machine of [...store.state.machines]) {
      if (!machine.autostart) continue;
      try {
        await qemu.exclusive(machine.id, () => qemu.start(machine));
        started.push(machine.id);
        await store.transaction((s) =>
          event(s, `${machine.name}: started automatically.`),
        );
      } catch (error) {
        await store
          .transaction((s) =>
            event(s, `${machine.name}: automatic start failed: ${error.message}`),
          )
          .catch(() => {});
      }
    }
    return started;
  }
  return {
    server,
    store,
    qemu,
    autostart,
    close: async () => {
      metrics.stop();
      wss.clients.forEach((c) => c.close());
      await qemu.close();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}
async function readJson(req) {
  const deadline = setTimeout(
    () => req.destroy(new Error("JSON request exceeded the 30-second limit.")),
    30000,
  );
  let size = 0,
    chunks = [];
  try {
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 64 * 1024) throw new Error("Request is too large.");
      chunks.push(chunk);
    }
    return JSON.parse(Buffer.concat(chunks).toString() || "{}");
  } finally {
    clearTimeout(deadline);
  }
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const app = await createApplication();
  app.server.listen(
    Number(process.env.PORT || 8080),
    process.env.BIND_ADDRESS || "127.0.0.1",
    () => {
      console.log("Material QEMU ready. Open the configured PUBLIC_ORIGIN.");
      app.autostart();
    },
  );
  for (const signal of ["SIGINT", "SIGTERM"])
    process.on(signal, async () => {
      await app.close();
      process.exit(0);
    });
}
