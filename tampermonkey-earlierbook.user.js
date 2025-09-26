// ==UserScript==
// @name         EarlierBook Watcher (Tampermonkey)
// @namespace    http://tampermonkey.net/
// @version      1.0.1
// @description  Monitor for earlier reservation slots and automatically reload between 43s and 53s of each minute.
// @match        https://ticket.expo2025.or.jp/*
// @run-at       document-end
// @grant        none
// @updateURL    https://github.com/Nagi-Inaba/earlierbook/raw/refs/heads/main/tampermonkey-earlierbook.user.js
// @downloadURL  https://github.com/Nagi-Inaba/earlierbook/raw/refs/heads/main/tampermonkey-earlierbook.user.js
// @homepageURL  https://github.com/Nagi-Inaba/earlierbook
// @supportURL   https://github.com/Nagi-Inaba/earlierbook/issues
// ==/UserScript==

(function () {
  "use strict";

  const STORAGE_KEY = "ar_nc_v9";
  const SESSION_SKIP_KEY = "ar_nc_skip_window_v1";

  function loadState() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") || {};
    } catch (error) {
      console.warn("[EarlierBook] Failed to load state", error);
      return {};
    }
  }

  function saveState(next) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch (error) {
      console.warn("[EarlierBook] Failed to save state", error);
    }
  }

  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const random = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const BLOCKED_NAVIGATION_HOSTNAMES = new Set(["www.expo2025.or.jp"]);

  function shouldBlockNavigation(target) {
    if (!target) return false;
    const anchor =
      target.closest?.("a[href]") ?? (target.tagName === "A" ? target : null);
    if (!anchor) return false;
    try {
      const url = new URL(anchor.href, location.href);
      return BLOCKED_NAVIGATION_HOSTNAMES.has(url.hostname);
    } catch (error) {
      console.warn("[EarlierBook] Failed to inspect navigation target", error);
      return false;
    }
  }

  const hourToMinutes = (hour) => ({ 10: 600, 11: 660, 12: 720, 17: 1020 }[hour] ?? null);
  const minutesToHour = (minutes) => ({ 600: 10, 660: 11, 720: 12, 1020: 17 }[minutes] ?? "");

  const isDisabled = (element) => {
    if (!element || element.disabled) return true;
    const aria = (element.getAttribute("aria-disabled") || "").toLowerCase();
    if (aria === "true") return true;
    if (/\bdisabled\b/i.test(element.className || "")) return true;
    if (element.getAttribute("data-disabled") === "true") return true;
    try {
      return getComputedStyle(element).pointerEvents === "none";
    } catch (error) {
      return false;
    }
  };

  async function waitButton({ sel, txt, timeout = 10_000, interval = 200 } = {}) {
    const start = Date.now();
    for (;;) {
      if (Date.now() - start > timeout) return null;

      if (sel) {
        const found = $(sel);
        if (found && !isDisabled(found)) return found;
      }

      if (txt) {
        const found = $$("button,a,[role=button]").find((button) => {
          const label = (button.textContent || button.getAttribute("aria-label") || "").trim();
          return txt.test(label) && !isDisabled(button);
        });
        if (found) return found;
      }

      await wait(interval);
    }
  }

  async function clickWithDelay(target) {
    if (!target || isDisabled(target)) return false;
    if (shouldBlockNavigation(target)) {
      console.warn(
        "[EarlierBook] Skipping blocked navigation to Expo 2025 homepage",
      );
      return false;
    }
    await wait(500 + random(0, 1000));
    target.click?.();
    return true;
  }

  const SELECTOR_TOGGLE = "div.style_buy__2YcAY:nth-of-type(1) > ul.buttons:nth-of-type(1) > li:nth-of-type(1) > a.basic-btn.type3:nth-of-type(1)";
  const SELECTOR_CLOSE_ICON = "div.ReactModal__Content.ReactModal__Content--after-open:nth-of-type(1) > div.style_modal__ZpsOM:nth-of-type(1) > a.style_close__lYrCO:nth-of-type(1)";
  const SELECTOR_SUCCESS = "h2#reservation_modal_title";
  const SELECTOR_FAILURE = "h2#reservation_fail_modal_title";

  let skipCurrentWindow = false;
  try {
    if (sessionStorage.getItem(SESSION_SKIP_KEY) === "1") {
      skipCurrentWindow = true;
      sessionStorage.removeItem(SESSION_SKIP_KEY);
    }
  } catch (error) {
    console.warn("[EarlierBook] Unable to read session skip flag", error);
  }

  function markSkipWindow() {
    skipCurrentWindow = true;
    try {
      sessionStorage.setItem(SESSION_SKIP_KEY, "1");
    } catch (error) {
      console.warn("[EarlierBook] Unable to persist skip flag", error);
    }
  }

  async function closeFailThenReload() {
    const reloadWithSkip = async () => {
      markSkipWindow();
      await wait(120 + random(60, 140));
      location.reload();
    };

    let element = $(SELECTOR_TOGGLE);
    if (await clickWithDelay(element)) {
      await reloadWithSkip();
      return;
    }

    element = $(SELECTOR_CLOSE_ICON);
    if (element && (await clickWithDelay(element) || await clickWithDelay(element.querySelector("img")))) {
      await reloadWithSkip();
      return;
    }

    element = $("button[aria-label='閉じる'],a[aria-label='閉じる'],[data-modal-close],.modal-close");
    if (await clickWithDelay(element)) {
      await reloadWithSkip();
      return;
    }

    const closeImage = $("img[src*='close.svg'],[style*='close.svg'],use[href*='close.svg'],image[href*='close.svg']");
    if (closeImage) {
      const clickTarget = closeImage.closest("a,button,[role=button]") || closeImage;
      if (await clickWithDelay(clickTarget)) {
        await reloadWithSkip();
        return;
      }
    }

    element = $$("[class*='close'],[class*='Close'],[class*='CLOSE']").find((candidate) => !isDisabled(candidate));
    if (await clickWithDelay(element)) {
      await reloadWithSkip();
      return;
    }

    try {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    } catch (error) {
      console.warn("[EarlierBook] Unable to dispatch Escape", error);
    }

    markSkipWindow();
    await wait(60);
    location.reload();
  }

  function buildUi() {
    const wrapper = document.createElement("div");
    Object.assign(wrapper.style, {
      position: "fixed",
      bottom: "20px",
      right: "20px",
      zIndex: 999999,
      background: "rgba(255, 255, 255, 0.95)",
      padding: "10px 12px",
      borderRadius: "12px",
      boxShadow: "0 2px 10px rgba(0,0,0,.2)",
      fontFamily: "-apple-system,system-ui,Segoe UI,Roboto,sans-serif",
      width: "300px",
    });

    const row = (marginBottom = 8) => {
      const div = document.createElement("div");
      Object.assign(div.style, {
        display: "flex",
        gap: "8px",
        alignItems: "center",
        marginBottom: `${marginBottom}px`,
      });
      return div;
    };

    const headerRow = row();
    const title = document.createElement("div");
    title.textContent = "予約";
    title.style.fontWeight = "bold";

    const toggle = document.createElement("input");
    toggle.type = "checkbox";

    headerRow.appendChild(title);
    headerRow.appendChild(toggle);

    const state = Object.assign({ r: false, b: null, z: "both" }, loadState());
    saveState(state);
    toggle.checked = !!state.r;

    const baseRow = row();
    const baseLabel = document.createElement("label");
    baseLabel.textContent = "基準時刻";
    baseLabel.style.width = "64px";
    baseLabel.style.fontSize = "12px";

    const baseSelect = document.createElement("select");
    baseSelect.style.flex = "1";
    [
      ["", "未設定"],
      ["10", "10時"],
      ["11", "11時"],
      ["12", "12時"],
      ["17", "17時"],
    ].forEach(([value, label]) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      baseSelect.appendChild(option);
    });

    if (state.b != null) {
      const hour = `${minutesToHour(state.b)}`;
      if (hour) baseSelect.value = hour;
    }

    const gateRow = row();
    const gateLabel = document.createElement("label");
    gateLabel.textContent = "ゲート";
    gateLabel.style.width = "64px";
    gateLabel.style.fontSize = "12px";

    const gateSelect = document.createElement("select");
    gateSelect.style.flex = "1";
    [
      ["both", "両方"],
      ["east", "東ゲート"],
      ["west", "西ゲート"],
    ].forEach(([value, label]) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      gateSelect.appendChild(option);
    });
    gateSelect.value = state.z;

    const status = document.createElement("div");
    status.style.fontSize = "12px";
    status.textContent = state.r ? "稼働中" : "停止中";

    wrapper.appendChild(headerRow);
    baseRow.appendChild(baseLabel);
    baseRow.appendChild(baseSelect);
    wrapper.appendChild(baseRow);

    gateRow.appendChild(gateLabel);
    gateRow.appendChild(gateSelect);
    wrapper.appendChild(gateRow);
    wrapper.appendChild(status);
    document.body.appendChild(wrapper);

    function readConfiguration() {
      const hourValue = baseSelect.value;
      const minutes = hourValue ? hourToMinutes(Number(hourValue)) : null;
      if (minutes == null) {
        setStatus("基準時刻を選択してください");
        return null;
      }
      return { b: minutes, z: gateSelect.value };
    }

    function setStatus(text) {
      status.textContent = text;
    }

    function uncheck() {
      try {
        toggle.checked = false;
        toggle.dispatchEvent(new Event("input", { bubbles: true }));
        toggle.dispatchEvent(new Event("change", { bubbles: true }));
      } catch (error) {
        console.warn("[EarlierBook] Failed to uncheck", error);
      }
      setStatus("停止中");
    }

    toggle.addEventListener("change", () => {
      if (toggle.checked) {
        const config = readConfiguration();
        if (!config) {
          toggle.checked = false;
          return;
        }
        state.r = true;
        state.b = config.b;
        state.z = config.z;
        saveState(state);
        setStatus(`稼働中（基準 ${baseSelect.value}時）`);
        run();
      } else {
        state.r = false;
        saveState(state);
        setStatus("停止中");
        clearTimeout(reloadTimer);
      }
    });

    [baseSelect, gateSelect].forEach((element) => {
      element.addEventListener("change", () => {
        if (element === baseSelect && baseSelect.value === "") {
          state.b = null;
          saveState(state);
          if (state.r) setStatus("基準時刻を選択してください");
          return;
        }
        const baseMinutes = hourToMinutes(Number(baseSelect.value));
        if (baseMinutes != null) state.b = baseMinutes;
        state.z = gateSelect.value;
        saveState(state);
        if (state.r) setStatus(`稼働中（基準 ${baseSelect.value}時）`);
      });
    });

    return { setStatus, baseSelect, uncheck, state, gateSelect };
  }

  const ui = buildUi();
  let { state: st } = ui;
  let reloadTimer = null;

  function formatTimeIn(delayMs) {
    const target = new Date(Date.now() + delayMs);
    const pad = (value) => `${value}`.padStart(2, "0");
    return `${pad(target.getHours())}:${pad(target.getMinutes())}:${pad(target.getSeconds())}`;
  }

  function nextWindowDelay() {
    const now = new Date();
    const msNow = now.getTime();
    const seconds = now.getSeconds() + now.getMilliseconds() / 1000;
    const minuteStart = msNow - seconds * 1000;
    const windowStart = minuteStart + 43_000;
    const windowEnd = minuteStart + 53_000;

    if (skipCurrentWindow) {
      skipCurrentWindow = false;
      const nextMinuteStart = minuteStart + 60_000;
      const target = nextMinuteStart + 43_000 + Math.random() * 10_000;
      return Math.max(0, target - msNow);
    }

    if (seconds < 43) {
      const target = windowStart + Math.random() * 10_000;
      return Math.max(0, target - msNow);
    }

    if (seconds >= 53) {
      const nextMinuteStart = minuteStart + 60_000;
      const target = nextMinuteStart + 43_000 + Math.random() * 10_000;
      return Math.max(0, target - msNow);
    }

    const remaining = windowEnd - msNow;
    const jitter = Math.min(remaining, 2_000 + Math.random() * 1_000);
    return Math.max(200, jitter);
  }

  function scheduleReload(reason = "監視継続") {
    if (!st.r) return;
    clearTimeout(reloadTimer);

    const delay = nextWindowDelay();
    const eta = formatTimeIn(delay);
    ui.setStatus(`${reason} → 次回リロード ${eta}`);

    reloadTimer = setTimeout(() => {
      if (st.r) location.reload();
    }, delay);
  }

  function stopMonitoring() {
    try {
      clearTimeout(reloadTimer);
    } catch (error) {
      console.warn("[EarlierBook] Unable to clear timer", error);
    }
    st.r = false;
    st.b = null;
    saveState(st);
    try {
      ui.baseSelect.value = "";
    } catch (error) {
      console.warn("[EarlierBook] Unable to reset select", error);
    }
    ui.uncheck();
    ui.setStatus("来場日時が設定されました。停止＆基準時刻リセット。");
  }

  async function ensureZone(zone) {
    if (zone !== "east" && zone !== "west") return true;
    const label = zone === "east" ? "東" : "西";
    const button = $$("button,a,div[role=button]").find((element) => {
      const text = (element.textContent || element.getAttribute("aria-label") || "").normalize("NFKC");
      return text.includes(label) && !isDisabled(element);
    });

    if (button) {
      await clickWithDelay(button);
      await wait(200 + random(60, 180));
    }

    return Boolean(button);
  }

  function textToMinutes(text) {
    const match = text.match(/(\d{1,2})\s*[:：]\s*(\d{2})/);
    if (!match) return null;
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
    return hours * 60 + minutes;
  }

  function collectSlots() {
    return $$("button,a,div[role=button]")
      .map((element) => {
        const text = (element.textContent || "").trim();
        const mins = textToMinutes(text);
        return mins == null ? null : { element, minutes: mins, text };
      })
      .filter(Boolean);
  }

  function pickEarlier(slots, baselineMinutes) {
    const candidates = slots
      .filter((slot) => !isDisabled(slot.element) && slot.minutes < baselineMinutes)
      .sort((a, b) => a.minutes - b.minutes);
    return candidates[0] || null;
  }

  async function waitSlotsReady(timeout = 6_000) {
    const start = Date.now();
    for (;;) {
      const ready = $$("button,a,div[role=button]").some((element) => /(\d{1,2})\s*[:：]\s*(\d{2})/.test(element.textContent || ""));
      if (ready) return true;
      if (Date.now() - start > timeout) return false;
      await wait(150);
    }
  }

  async function runReservationFlow() {
    let button = await waitButton({ sel: "button.basic-btn.type2.style_full__ptzZq", txt: /来場日時を設定する/, timeout: 8_000 });
    if (!button) return "retry";
    await clickWithDelay(button);

    await waitButton({ txt: /確認|来場日時|交通|手段/, timeout: 5_000, interval: 150 });

    button = await waitButton({ sel: "button.style_next_button__N_pbs", txt: /来場日時を変更する/, timeout: 10_000 });
    if (!button) return "retry";
    await clickWithDelay(button);

    const start = Date.now();
    for (;;) {
      if ($(SELECTOR_SUCCESS)) {
        stopMonitoring();
        return "success";
      }
      if ($(SELECTOR_FAILURE)) {
        await closeFailThenReload();
        return "force";
      }
      if (Date.now() - start > 12_000) break;
      await wait(120);
    }
    return "retry";
  }

  async function scanSlots() {
    const order =
      st.z === "both" ? (Math.random() < 0.5 ? ["east", "west"] : ["west", "east"]) : [st.z];

    for (const zone of order) {
      if (!st.r) return false;

      await ensureZone(zone);
      await waitSlotsReady();
      await wait(120 + random(40, 140));

      const slotList = collectSlots();
      const pick = pickEarlier(slotList, st.b);
      if (!pick) continue;

      ui.setStatus(`発見：${pick.text}（${zone === "east" ? "東" : "西"}）→変更`);
      await clickWithDelay(pick.element);

      const result = await runReservationFlow();
      if (result === "success") return true;
      if (result === "force") return false;

      await wait(180 + random(40, 140));
    }

    return false;
  }

  async function run() {
    const start = Date.now();
    while (document.readyState !== "complete" && Date.now() - start < 3_000) {
      await wait(80);
    }

    if ($(SELECTOR_SUCCESS)) {
      stopMonitoring();
      return;
    }

    if ($(SELECTOR_FAILURE)) {
      await closeFailThenReload();
      return;
    }

    if (!st.r) return;
    if (st.b == null) {
      ui.setStatus("基準時刻を選択してください");
      return;
    }

    await waitSlotsReady();
    const found = await scanSlots();
    if (!st.r) return;
    if (found) return;

    scheduleReload("空き無し");
  }

  if (st.r) run();

  window.addEventListener("beforeunload", () => {
    clearTimeout(reloadTimer);
  });
})();
