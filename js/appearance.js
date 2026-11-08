const STORAGE_KEY = "intellivault.appearance.v1";
const themes = ["aurora-glass", "midnight-neon", "cloud-mist", "cyber-vault", "emerald-secure", "minimal-slate"];
const modes = ["light", "dark", "system"];
const radii = ["sharp", "medium", "rounded"];
const densities = ["comfortable", "compact"];
const accents = {
  "aurora-glass": "#7667e8",
  "midnight-neon": "#707cff",
  "cloud-mist": "#1685bd",
  "cyber-vault": "#984cff",
  "emerald-secure": "#138a71",
  "minimal-slate": "#4d77b7"
};

let preferences;

export function initializeAppearance() {
  preferences = loadPreferences();
  document.querySelector(".settings-grid").dataset.settingsPanel = "general";
  bindAppearanceControls();
  applyAppearance();
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (preferences.mode === "system") applyAppearance();
  });
}

function loadPreferences() {
  const defaults = {
    theme: "aurora-glass",
    mode: "system",
    glow: true,
    glass: true,
    radius: "medium",
    density: "comfortable",
    accent: ""
  };

  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    return {
      theme: themes.includes(saved.theme) ? saved.theme : defaults.theme,
      mode: modes.includes(saved.mode) ? saved.mode : defaults.mode,
      glow: typeof saved.glow === "boolean" ? saved.glow : defaults.glow,
      glass: typeof saved.glass === "boolean" ? saved.glass : defaults.glass,
      radius: radii.includes(saved.radius) ? saved.radius : defaults.radius,
      density: densities.includes(saved.density) ? saved.density : defaults.density,
      accent: /^#[0-9a-f]{6}$/i.test(saved.accent || "") ? saved.accent : defaults.accent
    };
  } catch {
    return defaults;
  }
}

function bindAppearanceControls() {
  document.querySelectorAll("[data-theme-choice]").forEach((button) => {
    button.addEventListener("click", () => {
      preferences.theme = button.dataset.themeChoice;
      preferences.accent = "";
      saveAndApply();
    });
  });

  document.querySelectorAll("[data-mode-choice]").forEach((button) => {
    button.addEventListener("click", () => {
      preferences.mode = button.dataset.modeChoice;
      saveAndApply();
    });
  });

  document.querySelectorAll("[data-radius-choice]").forEach((button) => {
    button.addEventListener("click", () => {
      preferences.radius = button.dataset.radiusChoice;
      saveAndApply();
    });
  });

  document.querySelectorAll("[data-density-choice]").forEach((button) => {
    button.addEventListener("click", () => {
      preferences.density = button.dataset.densityChoice;
      saveAndApply();
    });
  });

  document.getElementById("glowToggle").addEventListener("change", (event) => {
    preferences.glow = event.target.checked;
    saveAndApply();
  });
  document.getElementById("glassToggle").addEventListener("change", (event) => {
    preferences.glass = event.target.checked;
    saveAndApply();
  });
  document.getElementById("accentColor").addEventListener("input", (event) => {
    preferences.accent = event.target.value;
    saveAndApply();
  });
  document.getElementById("modeToggle").addEventListener("click", () => {
    preferences.mode = isDarkMode() ? "light" : "dark";
    saveAndApply();
  });

  document.querySelectorAll("[data-settings-tab]").forEach((button) => {
    button.addEventListener("click", () => setSettingsTab(button.dataset.settingsTab));
  });
}

function setSettingsTab(selectedTab) {
  document.querySelectorAll("[data-settings-tab]").forEach((button) => {
    const selected = button.dataset.settingsTab === selectedTab;
    button.classList.toggle("active", selected);
    button.setAttribute("aria-pressed", String(selected));
  });
  document.querySelectorAll("[data-settings-panel]").forEach((panel) => {
    panel.classList.toggle("hidden", panel.dataset.settingsPanel !== selectedTab);
  });
}

function saveAndApply() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
  } catch {
    document.querySelector(".appearance-saved").textContent = "Unable to save on this device";
  }
  applyAppearance();
}

function applyAppearance() {
  const root = document.documentElement;
  root.dataset.theme = preferences.theme;
  root.dataset.mode = preferences.mode;
  root.dataset.glow = preferences.glow ? "on" : "off";
  root.dataset.glass = preferences.glass ? "on" : "off";
  root.dataset.radius = preferences.radius;
  root.dataset.density = preferences.density;

  if (preferences.accent) {
    root.style.setProperty("--primary", preferences.accent);
    root.style.setProperty("--primary-hover", `color-mix(in srgb, ${preferences.accent} 84%, #111827)`);
  } else {
    root.style.removeProperty("--primary");
    root.style.removeProperty("--primary-hover");
  }

  document.querySelectorAll("[data-theme-choice]").forEach((button) => {
    const selected = button.dataset.themeChoice === preferences.theme;
    button.classList.toggle("selected", selected);
    button.setAttribute("aria-pressed", String(selected));
  });
  document.querySelectorAll("[data-mode-choice]").forEach((button) => {
    const selected = button.dataset.modeChoice === preferences.mode;
    button.classList.toggle("selected", selected);
    button.setAttribute("aria-pressed", String(selected));
  });
  document.querySelectorAll("[data-radius-choice]").forEach((button) => {
    const selected = button.dataset.radiusChoice === preferences.radius;
    button.classList.toggle("selected", selected);
    button.setAttribute("aria-pressed", String(selected));
  });
  document.querySelectorAll("[data-density-choice]").forEach((button) => {
    const selected = button.dataset.densityChoice === preferences.density;
    button.classList.toggle("selected", selected);
    button.setAttribute("aria-pressed", String(selected));
  });

  document.getElementById("glowToggle").checked = preferences.glow;
  document.getElementById("glassToggle").checked = preferences.glass;
  document.getElementById("accentColor").value = preferences.accent || accents[preferences.theme];
  document.getElementById("accentColorValue").textContent = preferences.accent || "Theme default";
  const dark = isDarkMode();
  const modeToggle = document.getElementById("modeToggle");
  modeToggle.textContent = dark ? "☼" : "☾";
  modeToggle.setAttribute("aria-label", `Switch to ${dark ? "light" : "dark"} mode`);
  modeToggle.title = `Switch to ${dark ? "light" : "dark"} mode`;
}

function isDarkMode() {
  if (preferences.mode === "dark") return true;
  if (preferences.mode === "light") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}
