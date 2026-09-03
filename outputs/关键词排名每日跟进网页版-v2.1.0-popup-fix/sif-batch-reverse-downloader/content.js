(() => {
  "use strict";

  const WEB_SOURCE = "keyword-tracker-web";
  const EXT_SOURCE = "sif-batch-extension";

  if (location.hostname === "www.sif.com") {
    initSifPage();
  } else if (isTrackerPage()) {
    initTrackerPage();
  }

  function isTrackerPage() {
    return /(?:^|[\\/])index\.html(?:[?#]|$)/i.test(location.href);
  }

  function initTrackerPage() {
    if (globalThis.__KEYWORD_TRACKER_EXTENSION_BRIDGE_LOADED__) return;
    globalThis.__KEYWORD_TRACKER_EXTENSION_BRIDGE_LOADED__ = true;

    window.addEventListener("message", (event) => {
      if (event.source !== window || event.data?.source !== WEB_SOURCE) return;
      const { type, requestId, payload } = event.data;
      const messageType = type === "PING_WEB_BRIDGE" ? "PING_WEB_BRIDGE"
        : type === "START_WEB_BATCH" ? "START_WEB_BATCH"
          : type === "STOP_WEB_BATCH" ? "STOP_WEB_BATCH" : null;
      if (!messageType || !requestId) return;
      Promise.resolve()
        .then(() => chrome.runtime.sendMessage({ type: messageType, payload }))
        .then((response) => window.postMessage({
          source: EXT_SOURCE,
          type: "WEB_BRIDGE_REPLY",
          requestId,
          ...(response || { ok: false, error: "扩展没有返回结果。" })
        }, "*"))
        .catch((error) => window.postMessage({
          source: EXT_SOURCE,
          type: "WEB_BRIDGE_REPLY",
          requestId,
          ok: false,
          error: String(error?.message || error || "无法连接浏览器扩展。")
        }, "*"));
    });

    chrome.runtime.onMessage.addListener((message) => {
      if (!message || !/^STATE_UPDATED$|^WEB_BATCH_/u.test(String(message.type || ""))) return;
      window.postMessage({ source: EXT_SOURCE, ...message }, "*");
    });
    window.postMessage({ source: EXT_SOURCE, type: "WEB_BRIDGE_READY" }, "*");
  }

  function initSifPage() {
    if (globalThis.__SIF_BATCH_DOWNLOADER_LOADED__) return;
    globalThis.__SIF_BATCH_DOWNLOADER_LOADED__ = true;

    const TIMEOUT_MS = 80_000;
    const INITIAL_TABLE_SETTLE_DELAY_MS = 2_000;
    const TABLE_SETTLE_DELAY_MS = 1_200;
    const TABLE_STABLE_SAMPLES = 3;
    const TABLE_POLL_MS = 250;
    let captureWaiter = null;

    window.addEventListener("message", (event) => {
      const data = event.data;
      if (event.source !== window || data?.source !== "sif-batch-downloader") return;
      if (!captureWaiter || String(data.asin || "").toUpperCase() !== captureWaiter.asin) return;
      const waiter = captureWaiter;
      captureWaiter = null;
      clearTimeout(waiter.timer);
      if (data.type === "SIF_DOWNLOAD_CAPTURE") {
        waiter.resolve({
          name: String(data.filename || ""),
          mime: String(data.mime || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
          data: String(data.data || "")
        });
      } else {
        waiter.resolve(null);
      }
    });

    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message?.type !== "RUN_SIF_DOWNLOAD") return false;
      run(message.asin, message.captureReady !== false)
        .then((result) => sendResponse({ ok: true, ...result }))
        .catch((error) => sendResponse({ ok: false, code: error.message || "SELECTOR_CHANGED" }));
      return true;
    });

    async function run(asin, captureReady) {
      if (!/^[A-Z0-9]{10}$/u.test(asin)) throw new Error("ASIN_INVALID");
      await progress(asin, "working");

      const searchButton = await waitFor(() =>
        [...document.querySelectorAll("button")].find((button) => button.textContent.trim() === "反查流量词"),
        25_000
      ).catch(() => null);

      if (!searchButton && /登录|验证码/u.test(document.body?.innerText || "")) {
        throw new Error("AUTH_REQUIRED");
      }

      const currentAsin = new URL(location.href).searchParams.get("asin")?.toUpperCase();
      if (currentAsin !== asin) {
        const input = document.querySelector(".search .search-input input:not([readonly])")
          || [...document.querySelectorAll(".search input:not([readonly])")].at(-1);
        if (!input || !searchButton) throw new Error("SELECTOR_CHANGED");
        setNativeInputValue(input, asin);
        searchButton.click();
        await waitFor(() => new URL(location.href).searchParams.get("asin")?.toUpperCase() === asin, 30_000);
      }

      const parentCard = await waitFor(() => {
        const cards = [...document.querySelectorAll(".single_variant_wrap.pasin_item, .single_variant_wrap")];
        return cards.find((card) => {
          const header = card.querySelector(".single_variant_header.all, .single_variant_header");
          return header?.textContent.trim() === "父体";
        });
      }, TIMEOUT_MS);

      // SIF can briefly render the parent card as selected before it finishes
      // loading the initially selected child table.  Let the first table
      // settle before deciding whether a parent click is needed.
      await waitForTableReady("", false, INITIAL_TABLE_SETTLE_DELAY_MS);
      const previousTableFingerprint = tableFingerprint();
      let parentSelectionChanged = false;
      if (!parentCard.classList.contains("isActive")) {
        parentCard.click();
        await waitFor(() => parentCard.classList.contains("isActive"), 20_000);
        parentSelectionChanged = true;
      }
      if (parentSelectionChanged) {
        await waitForTableReady(previousTableFingerprint, true, TABLE_SETTLE_DELAY_MS);
      } else {
        await waitForTableReady(previousTableFingerprint, false, TABLE_SETTLE_DELAY_MS);
      }

      const downloadButton = await waitFor(() => {
        const button = document.querySelector("#title_top_color_pad .downloadPolorBtn")
          || document.querySelector(".keyword_list_table_wrap .downloadPolorBtn");
        if (!button || !isVisible(button) || hasVisibleLoadingMask()) return null;
        if (button.classList.contains("is-disabled")) return null;
        return button;
      }, TIMEOUT_MS);

      const capturePromise = captureReady ? waitForCapture(asin) : Promise.resolve(null);
      if (captureReady) {
        window.postMessage({
          source: WEB_SOURCE,
          type: "ARM_SIF_DOWNLOAD_CAPTURE",
          asin
        }, "*");
      }
      await progress(asin, "downloading");
      downloadButton.scrollIntoView({ block: "center", inline: "nearest" });
      await sleep(180);
      downloadButton.click();
      const file = await capturePromise;
      return { clickedAt: Date.now(), url: location.href, file };
    }

    function waitForCapture(asin) {
      if (captureWaiter) {
        clearTimeout(captureWaiter.timer);
        captureWaiter.resolve(null);
      }
      return new Promise((resolve) => {
        const timer = setTimeout(() => {
          if (captureWaiter?.asin === asin) captureWaiter = null;
          resolve(null);
        }, 45_000);
        captureWaiter = { asin: String(asin).toUpperCase(), resolve, timer };
      });
    }

    function setNativeInputValue(input, value) {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }

    function hasVisibleLoadingMask() {
      return [...document.querySelectorAll(".reverse_table_warp .el-loading-mask, .keyword_list_table_wrap .el-loading-mask")]
        .some(isVisible);
    }

    function tableRows() {
      const rows = [
        ...document.querySelectorAll(".reverse_table_warp .el-table__body-wrapper tbody tr, .keyword_list_table_wrap tbody tr")
      ];
      return [...new Set(rows)];
    }

    function tableFingerprint() {
      const rows = tableRows();
      const values = rows.map((row) => String(row.innerText || row.textContent || "")
        .replace(/\s+/gu, " ")
        .trim());
      if (!values.length) return "";
      // Keep enough of the table to distinguish parent/child reports without
      // repeatedly serialising every cell while the page is rendering.
      return JSON.stringify({
        count: values.length,
        first: values.slice(0, 3),
        last: values.slice(-3),
      });
    }

    async function waitForTableReady(previousFingerprint, requireRefresh, settleDelayMs = TABLE_SETTLE_DELAY_MS) {
      const started = Date.now();
      const settleAfter = started + settleDelayMs;
      let sawLoading = false;
      let refreshObserved = !requireRefresh || !previousFingerprint;
      let stableFingerprint = "";
      let stableSamples = 0;

      while (Date.now() - started < TIMEOUT_MS) {
        const loading = hasVisibleLoadingMask();
        if (loading) {
          sawLoading = true;
          stableFingerprint = "";
          stableSamples = 0;
        }
        const fingerprint = tableFingerprint();
        if (requireRefresh && ((fingerprint && fingerprint !== previousFingerprint) || sawLoading)) {
          refreshObserved = true;
        }
        const elapsedEnough = Date.now() >= settleAfter;
        if (!loading && elapsedEnough && fingerprint && refreshObserved) {
          if (fingerprint === stableFingerprint) stableSamples += 1;
          else {
            stableFingerprint = fingerprint;
            stableSamples = 1;
          }
          if (stableSamples >= TABLE_STABLE_SAMPLES) return fingerprint;
        } else {
          stableFingerprint = fingerprint;
          stableSamples = 0;
        }
        await sleep(TABLE_POLL_MS);
      }
      throw new Error("SELECTOR_CHANGED");
    }

    function isVisible(element) {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) !== 0
        && rect.width > 0 && rect.height > 0;
    }

    async function waitFor(probe, timeoutMs) {
      const started = Date.now();
      while (Date.now() - started < timeoutMs) {
        const result = probe();
        if (result) return result;
        await sleep(300);
      }
      throw new Error("SELECTOR_CHANGED");
    }

    function sleep(ms) {
      return new Promise((resolve) => setTimeout(resolve, ms));
    }

    function progress(asin, status) {
      return chrome.runtime.sendMessage({ type: "TASK_PROGRESS", asin, status }).catch(() => {});
    }
  }
})();
