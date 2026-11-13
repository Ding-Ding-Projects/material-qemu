export function platformFields({ state, wizard, t, select, escape }) {
  const capability = state.capabilities[wizard.arch];
  const choices = Object.entries(state.capabilities)
    .filter(([, value]) => value.available)
    .map(([name]) => [name, name]);
  const recipes = capability?.selectableRecipes || [];
  const accelerators = capability?.accelerators || [];
  return (
    select("arch", t("Architecture", "架構"), choices, wizard.arch) +
    select(
      "machineType",
      t("Machine type", "機器類型"),
      recipes.map((recipe) => [
        recipe.machineType,
        `${recipe.machineType} · ${recipe.description}`,
      ]),
      wizard.machineType || capability?.machine,
    ) +
    select(
      "accelerator",
      t("Accelerator", "加速方式"),
      accelerators
        .filter((value) => value.usable)
        .map((value) => [
          value.name,
          value.name.toUpperCase() +
            (value.name === "tcg"
              ? ""
              : t(
                  " (eligible; launch unverified)",
                  "（符合條件，啟動未驗證）",
                )),
        ]),
      wizard.accelerator || "tcg",
    ) +
    `<p class="help">${t("Choices come from the installed QEMU binary. Only supported device recipes are selectable. Hardware acceleration still needs a successful launch on this host.", "選項來自已安裝的 QEMU，只能選擇已支援的裝置組合。硬件加速仍需在此主機成功啟動才算驗證。")}</p>` +
    `<details class="capability-details"><summary>${t("Discovered but unavailable choices", "已發現但未能使用的選項")}</summary><div tabindex="0" aria-label="${t("Capability details", "功能詳細資料")}"><h3>${t("Machine boards", "機器板型")}</h3><ul>${(capability?.discoveredUnsupported || []).map((value) => `<li><strong>${escape(value.name)}</strong>: ${escape(value.reason)}</li>`).join("") || `<li>${t("No unsupported boards reported.", "沒有未支援板型。")}</li>`}</ul><h3>${t("Accelerators", "加速方式")}</h3><ul>${
      accelerators
        .filter((value) => !value.usable)
        .map(
          (value) =>
            `<li><strong>${escape(value.name)}</strong>: ${escape(value.reason)}</li>`,
        )
        .join("") ||
      `<li>${t("No unavailable accelerators reported.", "沒有未能使用的加速方式。")}</li>`
    }</ul><h3>${t("Other system targets", "其他系統目標")}</h3><ul>${Object.entries(
      state.capabilities,
    )
      .filter(([, value]) => !value.available)
      .map(
        ([name, value]) =>
          `<li><strong>${name}</strong>: ${escape(value.reason)}</li>`,
      )
      .join("")}</ul></div></details>`
  );
}
