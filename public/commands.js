export function commandInventory(state, t) {
  const entries = [
    ...[
      ["overview", "Overview", "總覽"],
      ["machines", "All machines", "所有機器"],
      ["storage", "Storage", "儲存空間"],
      ["new", "New machine", "新增機器"],
      ["settings", "Settings", "設定"],
      ["history", "Activity", "活動記錄"],
      ["docs", "Help and documentation", "說明文件"],
    ].map(([route, en, yue]) => ({
      id: `route:${route}`,
      route,
      label: t(en, yue),
      description: t("Open workspace destination", "開啟工作區目的地"),
    })),
    ...[
      ["theme", "Theme", "主題"],
      ["language", "Language", "語言"],
      ["motion", "Interface motion", "介面動畫"],
    ].map(([focus, en, yue]) => ({
      id: `setting:${focus}`,
      route: "settings",
      focus,
      label: t(en, yue),
      description: t("Open the actual saved setting", "開啟實際儲存設定"),
    })),
    ...[
      ["folder", "Create folder", "建立資料夾"],
      ["manage-folders", "Manage folders", "管理資料夾"],
      ["removed-machines", "Restore retained machine", "還原保留機器"],
      ["save-view", "Save current machine view", "儲存目前機器檢視"],

    ].map(([action, en, yue]) => ({
      id: `action:${action}`,
      route: "machines",
      action,
      label: t(en, yue),
      description: t("Use the machine workspace control", "使用機器工作區控制"),
    })),
    {
      id: "register-passkey",
      route: "settings",
      action: "register-passkey",
      label: t("Register a passkey", "登記通行密鑰"),
      description: t("Use your authenticator", "使用你的驗證器"),
    },
    {
      id: "password-mode",
      route: "settings",
      action: "password-mode",
      label: t("Change password sign-in", "更改密碼登入"),
      description: t(
        "Requires fresh passkey verification",
        "需要重新驗證通行密鑰",
      ),
      unavailable: state.owner.passkeys
        ? null
        : t("Register a passkey first.", "請先登記通行密鑰。"),
    },
  ];
  for (const machine of state.machines) {
    entries.push({
      id: `console:${machine.id}`,
      route: `console:${machine.id}`,
      label: `${t("Console", "主控台")} · ${machine.name}`,
      description: machine.arch,
    });
    for (const [action, en, yue] of [
      ["details", "Details", "詳細資料"],
      ["move", "Move to folder", "移至資料夾"],
      ["tags", "Edit tags", "編輯標籤"],
      ["remove", "Remove, retain disk", "移除並保留磁碟"],
    ])
      entries.push({
        id: `${action}:${machine.id}`,
        route: "machines",
        select: machine.id,
        action: action === "details" ? undefined : `${action}:${machine.id}`,
        label: `${t(en, yue)} · ${machine.name}`,
        description: machine.arch,
      });
    const verb =
      machine.state === "stopped"
        ? "start"
        : machine.state === "paused" || machine.state === "prelaunch"
          ? "resume"
          : "pause";
    entries.push({
      id: `lifecycle:${machine.id}:${verb}`,
      route: `console:${machine.id}`,
      action: `lifecycle:${machine.id}:${verb}`,
      label: `${t(verb === "start" ? "Start" : verb === "resume" ? "Resume" : "Pause", verb === "start" ? "啟動" : verb === "resume" ? "繼續" : "暫停")} · ${machine.name}`,
      description: t("Actual QEMU lifecycle action", "實際 QEMU 生命週期操作"),
    });
    if (machine.state !== "stopped")
      for (const [action, en, yue] of [
        [`lifecycle:${machine.id}:shutdown`, "Request shutdown", "請求關機"],
        [
          `lifecycle:${machine.id}:stop`,
          "Power off with confirmation",
          "確認後強制關機",
        ],
        ["console-reset", "Reset with confirmation", "確認後重設"],
        ["console-keys", "Send keys", "傳送按鍵"],
        ["console-text", "Type text", "輸入文字"],
        ["console-clipboard", "Send clipboard text", "傳送剪貼簿文字"],
      ])
        entries.push({
          id: `${machine.id}:${action}`,
          route: `console:${machine.id}`,
          action,
          label: `${t(en, yue)} · ${machine.name}`,
          description: t("Open the console control", "開啟主控台控制"),
        });
  }
  return entries;
}
export function searchCommands(entries, query) {
  const text = String(query || "")
    .trim()
    .toLowerCase();
  return entries.filter((entry) =>
    `${entry.label} ${entry.description}`.toLowerCase().includes(text),
  );
}
