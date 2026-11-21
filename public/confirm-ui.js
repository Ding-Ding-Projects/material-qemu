import { createGate, toggleKey, slide, release, cancel, isUnlocked, isDone } from "./confirm-gate.js";

const esc = (v) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// Two independent key toggles unlock a full-range slider. Sliding fills a progress track,
// completion plays its own animation, then onConfirm runs. Escape or Emergency exit cancel.
export function showGate({ dialog, t, title, body, confirmLabel, doneText, onConfirm, onError, fallbackFocus }) {
  const opener = document.activeElement;
  let gate = createGate();
  dialog.innerHTML = `<h2 id="dialog-title">${title}</h2><div class="gate" id="gate"><div class="gate-body">${body}</div><div class="gate-controls"><p class="muted-line" id="gate-help">${t("Turn on both keys, then slide all the way to confirm.", "先開啟兩個鑰匙，再滑到盡頭確認。")}</p><div class="gate-keys">${[0, 1].map((i) => `<button type="button" class="gate-key" data-gate-key="${i}" aria-pressed="false"><span class="icon" aria-hidden="true">${i ? "vpn_key" : "key"}</span>${t("Key", "鑰匙")} ${i + 1}</button>`).join("")}</div><div class="gate-track locked" id="gate-track"><div class="gate-fill" id="gate-fill"></div><span class="gate-label" id="gate-label">${esc(confirmLabel)}</span><input id="gate-slider" type="range" min="0" max="100" step="2" value="0" disabled aria-label="${esc(confirmLabel)}" aria-describedby="gate-help"></div><div class="actions" style="justify-content:space-between"><button type="button" class="emergency" id="gate-exit"><span class="icon" aria-hidden="true">emergency_home</span>${t("Emergency exit", "緊急退出")}</button><span class="muted-line">${t("Escape also cancels.", "按 Escape 亦可取消。")}</span></div></div><div class="gate-done" role="status"><span class="burst"><span class="icon" aria-hidden="true">check_circle</span></span><strong>${esc(doneText)}</strong></div></div>`;
  dialog.setAttribute("aria-labelledby", "dialog-title");
  const $ = (s) => dialog.querySelector(s);
  const track = $("#gate-track"),
    fill = $("#gate-fill"),
    slider = $("#gate-slider"),
    root = $("#gate");
  const sync = () => {
    dialog.querySelectorAll("[data-gate-key]").forEach((b) => b.setAttribute("aria-pressed", String(gate.keys[b.dataset.gateKey])));
    slider.disabled = !isUnlocked(gate) || isDone(gate);
    slider.value = String(gate.value);
    fill.style.width = `${gate.value}%`;
    track.classList.toggle("locked", !isUnlocked(gate));
    track.classList.toggle("sliding", gate.phase === "sliding");
    $("#gate-label").textContent = isUnlocked(gate)
      ? gate.value > 0
        ? `${Math.round(gate.value)}%`
        : confirmLabel
      : t("Locked", "已鎖定");
    root.classList.toggle("done", isDone(gate));
  };
  const finish = async () => {
    sync();
    setTimeout(async () => {
      try {
        await onConfirm();
      } catch (error) {
        onError?.(error);
      } finally {
        if (dialog.open && root.isConnected) dialog.close();
      }
    }, 900);
  };
  dialog.querySelectorAll("[data-gate-key]").forEach((b) =>
    b.addEventListener("click", () => {
      gate = toggleKey(gate, Number(b.dataset.gateKey));
      sync();
    }),
  );
  slider.addEventListener("input", () => {
    gate = slide(gate, slider.value);
    if (isDone(gate)) finish();
    else sync();
  });
  const letGo = () => {
    if (!isDone(gate)) {
      gate = release(gate);
      sync();
    }
  };
  slider.addEventListener("pointerup", letGo);
  slider.addEventListener("pointercancel", letGo);
  slider.addEventListener("blur", letGo);
  $("#gate-exit").addEventListener("click", () => {
    gate = cancel(gate);
    dialog.close();
  });
  dialog.onclose = () => {
    gate = cancel(gate);
    const target = opener?.isConnected ? opener : fallbackFocus?.();
    target?.focus?.();
  };
  dialog.oncancel = () => {
    gate = cancel(gate);
  };
  if (!dialog.open) dialog.showModal();
  sync();
  dialog.querySelector("[data-gate-key]").focus();
}
