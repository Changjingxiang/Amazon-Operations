import {
  MAX_ASINS,
  ASIN_PATTERN,
  buildSifReverseUrl,
  extractAsin,
  isSifDownload,
  normalizeConcurrency,
  normalizeCountryCode,
  suggestedFilename
} from "./utils.mjs";

const STORAGE_KEY = "batchState";
const PAGE_TIMEOUT_MS = 90_000;
const DOWNLOAD_START_TIMEOUT_MS = 40_000;
const DOWNLOAD_FINISH_TIMEOUT_MS = 180_000;

let state = {
  status: "idle",
  tasks: [],
  concurrency: 3,
  updatedAt: Date.now()
};
let activeRun = null;
const expectedDownloads = new Map();
const downloadOwners = new Map();
let downloadGate = Promise.resolve();

const ready = restoreState();

function isTrackerTab(tab) {
  const url = String(tab?.url || "");
  try {
    if (new URL(url).origin === "https://hans-keyword-tracker.chalky-fawn-4758.chatgpt.site") return true;
  } catch {}
  return /^(?:file:\/\/\/|https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?\/)/i.test(url)
    && /(?:^|[\\/])index\.html(?:[?#]|$)/i.test(url);
}

function isLocalSender(sender) {
  return Boolean(sender?.tab && isTrackerTab(sender.tab));
}

function sendToWeb(run, message) {
  if (!Number.isInteger(run?.webTabId)) return Promise.resolve();
  return chrome.tabs.sendMessage(run.webTabId, { ...message, runId: run.id });
}

// A web job belongs to one document, not just a browser tab. A reload must
// finish cancelling the old queue before that tab can submit another job.
chrome.tabs?.onRemoved?.addListener((tabId) => {
  if (activeRun?.webTabId === tabId) void stopBatch().catch(console.warn);
});
chrome.tabs?.onUpdated?.addListener((tabId, change) => {
  if (activeRun?.webTabId === tabId && (change.status === "loading" || change.discarded)) {
    void stopBatch().catch(console.warn);
  }
});

function waitForReportAck(run, task, file) {
  return new Promise((resolve, reject) => {
    const finish = (error) => {
      clearTimeout(timer);
      run.acks.delete(task.asin);
      run.cancelWaits.delete(cancel);
      error ? reject(Object.assign(error, { noRetry: true })) : resolve();
    };
    const cancel = () => finish(new Error("STOPPED"));
    const timer = setTimeout(() => finish(new Error("网页未确认报表已保存，已停止导入。请重新打开页面后重试。")), 120_000);
    run.acks.set(task.asin, finish);
    run.cancelWaits.add(cancel);
    sendToWeb(run, { type: "WEB_BATCH_REPORT", asin: task.asin,
      countryCode: task.countryCode, modelName: task.modelName, file }).catch(finish);
  });
}

function untilStopped(run, operation) {
  if (run.stopped) return Promise.reject(new Error("STOPPED"));
  return new Promise((resolve, reject) => {
    const cancel = () => reject(new Error("STOPPED"));
    run.cancelWaits.add(cancel);
    Promise.resolve(operation).then(resolve, reject).finally(() => run.cancelWaits.delete(cancel));
  });
}

async function restoreState() {
  const saved = await chrome.storage.local.get(STORAGE_KEY);
  if (saved[STORAGE_KEY]) state = saved[STORAGE_KEY];
  if (["running", "stopping"].includes(state.status)) {
    state.status = "interrupted";
    state.tasks = (state.tasks || []).map((task) =>
      ["queued", "opening", "working", "downloading"].includes(task.status)
        ? { ...task, status: "failed", error: "浏览器后台被中断，请点击“重试失败项”。" }
        : task
    );
    await persistState();
  }
}

async function persistState() {
  state.updatedAt = Date.now();
  await chrome.storage.local.set({ [STORAGE_KEY]: state });
  chrome.runtime.sendMessage({ type: "STATE_UPDATED", state }).catch(() => {});
}

function updateTask(asin, patch) {
  const task = state.tasks.find((item) => item.asin === asin);
  if (task) Object.assign(task, patch, { updatedAt: Date.now() });
  return persistState();
}

function publicError(error) {
  const message = String(error?.message || error || "未知错误");
  if (message.includes("AUTH_REQUIRED")) return "Sif 尚未登录，请先登录后重试。";
  if (message.includes("DOWNLOAD_BLOCKED")) return "未检测到下载。请允许 www.sif.com 自动下载多个文件后重试。";
  if (message.includes("DOWNLOAD_FAILED")) return "浏览器报告文件下载失败，请重试。";
  if (message.includes("PAGE_TIMEOUT")) return "Sif 页面加载超时，请降低并发数后重试。";
  if (message.includes("SELECTOR_CHANGED")) return "未找到父体或下载按钮，Sif 页面可能已改版。";
  if (message.includes("STOPPED")) return "任务已停止。";
  return message.replace(/^Error:\s*/i, "").slice(0, 180);
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    await ready;
    if (message?.type === "GET_STATE") {
      sendResponse({ ok: true, state });
      return;
    }
    if (message?.type === "PING_WEB_BRIDGE") {
      if (!isLocalSender(sender)) {
        sendResponse({ ok: false, error: "仅允许关键词排名网页版连接。" });
        return;
      }
      if (activeRun?.webTabId === sender.tab.id && activeRun.sessionId !== message.sessionId) await stopBatch();
      sendResponse({ ok: true, version: chrome.runtime.getManifest().version });
      return;
    }
    if (["WEB_BATCH_HEARTBEAT", "WEB_BATCH_ACK"].includes(message?.type)) {
      const run = activeRun;
      if (!isLocalSender(sender) || !run || run.webTabId !== sender.tab.id
        || run.sessionId !== message.sessionId || run.id !== message.payload?.runId || run.stopped) {
        sendResponse({ ok: false, error: "导入任务已中断，请重新发起导入。" });
        return;
      }
      run.lastSeen = Date.now();
      if (message.type === "WEB_BATCH_ACK") {
        run.acks.get(message.payload.asin)?.(message.payload.ok ? null : new Error(message.payload.error || "报表保存失败。"));
      }
      sendResponse({ ok: true });
      return;
    }
    if (message?.type === "START_WEB_BATCH") {
      if (!isLocalSender(sender)) {
        sendResponse({ ok: false, error: "仅允许关键词排名网页版发起任务。" });
        return;
      }
      if (message.payload?.protocolVersion !== 2 || !message.sessionId || typeof message.payload.runId !== 'string' || !message.payload.runId) {
        sendResponse({ ok: false, error: "请刷新关键词软件页面后再导入。" });
        return;
      }
      sendResponse(await startBatch(message.payload, sender.tab.id, message.sessionId));
      return;
    }
    if (message?.type === "STOP_WEB_BATCH") {
      if (!isLocalSender(sender)) {
        sendResponse({ ok: false, error: "仅允许关键词排名网页版停止任务。" });
        return;
      }
      if (activeRun && (activeRun.webTabId !== sender.tab.id || activeRun.sessionId !== message.sessionId
        || activeRun.id !== message.payload?.runId)) {
        sendResponse({ ok: false, error: "不能停止其他页面的任务。" });
        return;
      }
      sendResponse(await stopBatch());
      return;
    }
    if (message?.type === "START_BATCH") {
      sendResponse(await startBatch(message.payload));
      return;
    }
    if (message?.type === "STOP_BATCH") {
      sendResponse(await stopBatch());
      return;
    }
    if (message?.type === "RETRY_FAILED") {
      const failed = state.tasks.filter((task) => task.status === "failed").map((task) => ({
        asin: task.asin,
        countryCode: task.countryCode,
        modelName: task.modelName
      }));
      sendResponse(await startBatch({ items: failed, concurrency: state.concurrency }));
      return;
    }
    if (message?.type === "TASK_PROGRESS" && sender.tab?.id) {
      if (activeRun?.tabOwners.get(sender.tab.id) === message.asin) {
        if (message.status === "downloading") armDownloadTimeout(message.asin);
        await updateTask(message.asin, { status: message.status || "working", error: null });
      }
      sendResponse({ ok: true });
      return;
    }
    sendResponse({ ok: false, error: "未知消息。" });
  })().catch((error) => sendResponse({ ok: false, error: publicError(error) }));
  return true;
});

async function startBatch(payload = {}, webTabId = null, sessionId = null) {
  if (activeRun) return { ok: false, error: "已有任务正在运行或停止中，请等待扩展结束当前任务。" };

  const rawItems = Array.isArray(payload.items) && payload.items.length
    ? payload.items
    : (payload.asins || []);
  const seen = new Set();
  const items = [];
  for (const raw of rawItems) {
    const item = raw && typeof raw === "object" ? raw : { asin: raw };
    const asin = String(item.asin || item.parentAsin || "").trim().toUpperCase();
    if (seen.has(asin)) continue;
    seen.add(asin);
    items.push({
      asin,
      countryCode: normalizeCountryCode(item.countryCode || item.site || "CA"),
      modelName: String(item.modelName || "").trim()
    });
  }
  if (!items.length) return { ok: false, error: "没有可执行的 ASIN。" };
  if (items.length > MAX_ASINS) return { ok: false, error: `一次最多 ${MAX_ASINS} 个 ASIN。` };
  if (items.some(({ asin }) => !ASIN_PATTERN.test(asin))) return { ok: false, error: "ASIN 格式不正确。" };

  const run = {
    id: webTabId !== null ? payload.runId : crypto.randomUUID(),
    stopped: false,
    tabs: new Set(),
    tabOwners: new Map(),
    webTabId: Number.isInteger(webTabId) ? webTabId : null,
    sessionId, lastSeen: Date.now(), acks: new Map(), cancelWaits: new Set()
  };
  activeRun = run;
  state = {
    status: "running",
    concurrency: webTabId !== null ? 1 : normalizeConcurrency(payload.concurrency),
    startedAt: Date.now(),
    updatedAt: Date.now(),
    tasks: items.map((item) => ({ ...item, status: "queued", error: null, attempts: 0 }))
  };
  run.done = (async () => {
    await persistState();
    await sendToWeb(run, { type: "WEB_BATCH_STARTED", state });
    if (run.webTabId !== null) run.watchdog = setInterval(() => {
      if (Date.now() - run.lastSeen > 90_000) void stopBatch().catch(console.warn);
    }, 10_000);
    await runQueue(run);
  })().catch(async (error) => {
    if (activeRun === run) {
      state.status = "failed";
      state.fatalError = publicError(error);
      await persistState();
      await sendToWeb(run, { type: "WEB_BATCH_FAILED", error: state.fatalError, state }).catch(() => {});
    }
  }).finally(() => {
    clearInterval(run.watchdog);
    if (activeRun === run) activeRun = null;
  });
  run.done.catch(console.warn);
  return { ok: true };
}

async function stopBatch() {
  const run = activeRun;
  if (!run) return { ok: true };
  if (run.stopped) { await run.done; return { ok: true }; }
  run.stopped = true;
  for (const cancel of [...run.cancelWaits]) cancel();
  for (const asin of run.tabOwners.values()) cancelExpectedDownload(asin, new Error("STOPPED"));
  state.status = "stopping";
  await persistState();
  await Promise.allSettled([...run.tabs].map((tabId) => chrome.tabs.remove(tabId)));
  await sendToWeb(run, { type: "WEB_BATCH_STOPPING", state }).catch(() => {});
  await run.done;
  return { ok: true };
}

async function runQueue(run) {
  let cursor = 0;
  const workers = Array.from({ length: state.concurrency }, async () => {
    while (!run.stopped) {
      const task = state.tasks[cursor++];
      if (!task) return;
      await executeTask(run, task);
    }
  });

  await Promise.allSettled(workers);
  for (const task of state.tasks) {
    if (["queued", "opening", "working", "downloading"].includes(task.status)) {
      task.status = "cancelled";
      task.error = run.stopped ? "任务已停止。" : "任务未完成。";
    }
  }
  state.status = run.stopped ? "stopped" : "completed";
  state.completedAt = Date.now();
  await persistState();
  clearInterval(run.watchdog);
  // Release before notifying the page, which may immediately start phase 2.
  if (activeRun === run) activeRun = null;
  await sendToWeb(run, { type: "WEB_BATCH_COMPLETED", state }).catch(() => {});
}

async function executeTask(run, task) {
  let lastError;
  for (let attempt = 1; attempt <= 2 && !run.stopped; attempt += 1) {
    task.attempts = attempt;
    try {
      const result = await processOne(run, task);
      if (run.stopped) throw new Error("STOPPED");
      if (result?.file && run.webTabId !== null) {
        try { await waitForReportAck(run, task, result.file); }
        catch (error) {
          // Never download more files into a dead or unsaved page.
          run.stopped = true;
          run.stopReason = publicError(error);
          throw error;
        }
      } else if (run.webTabId !== null) {
        run.stopped = true;
        run.stopReason = "文件已下载，但未能回传保存，任务已停止。请用本地导入补录，并检查扩展的文件网址权限。";
        throw new Error(run.stopReason);
      }
      await updateTask(task.asin, { status: "done", error: null, finishedAt: Date.now() });
      return;
    } catch (error) {
      lastError = error;
      if (run.stopped) break;
      if (error?.noRetry || attempt === 2) break;
      await updateTask(task.asin, { status: "queued", error: "首次加载失败，正在自动重试…" });
      await delay(1_500 * attempt);
    }
  }
  await updateTask(task.asin, {
    status: run.stopped ? "cancelled" : "failed",
    error: run.stopReason || (run.stopped ? "任务已停止。" : publicError(lastError))
  });
  await sendToWeb(run, {
    type: "WEB_BATCH_TASK_FAILED",
    asin: task.asin,
    modelName: task.modelName,
    error: run.stopReason || (run.stopped ? "任务已停止。" : publicError(lastError))
  }).catch(() => {});
}

async function processOne(run, task) {
  const asin = task.asin;
  if (run.stopped) throw new Error("STOPPED");
  await updateTask(asin, { status: "opening", error: null });
  const tab = await chrome.tabs.create({ url: buildSifReverseUrl(asin, task.countryCode), active: false });
  if (!tab.id) throw new Error("无法创建工作页。");
  const tabId = tab.id;
  run.tabs.add(tabId);
  run.tabOwners.set(tabId, asin);

  try {
    if (run.stopped) throw new Error("STOPPED");
    await waitForTabComplete(tabId, PAGE_TIMEOUT_MS, run);
    if (run.stopped) throw new Error("STOPPED");
    await updateTask(asin, { status: "working" });

    const item = await withDownloadGate(async () => {
      if (run.stopped) throw new Error("STOPPED");
      const downloadPromise = expectDownload(asin);
      // Observe rejection immediately while the content script is still
      // waiting for its report capture response.
      downloadPromise.catch(() => {});
      let captureReady = true;
      try {
        await chrome.scripting.executeScript({
          target: { tabId },
          world: "MAIN",
          func: installDownloadCaptureMain
        });
      } catch (error) {
        captureReady = false;
        console.warn("无法注入 SIF 报表回传钩子，将仅保留本地下载。", error);
      }
      let response;
      try {
        response = await sendTaskToTab(tabId, asin, { captureReady, run });
      } catch (error) {
        cancelExpectedDownload(asin, error);
        await downloadPromise.catch(() => {});
        throw error;
      }

      if (!response?.ok) {
        const error = new Error(response?.code || response?.error || "SELECTOR_CHANGED");
        cancelExpectedDownload(asin, error);
        await downloadPromise.catch(() => {});
        throw error;
      }

      await updateTask(asin, { status: "downloading" });
      armDownloadTimeout(asin);
      try {
        const download = await downloadPromise;
        return { download, file: response?.file || null };
      } catch (error) {
        error.noRetry = true;
        throw error;
      }
    });
    downloadOwners.set(item.download.id, { asin, countryCode: task.countryCode });
    await waitForDownloadComplete(item.download.id, DOWNLOAD_FINISH_TIMEOUT_MS, run);
    return item;
  } finally {
    run.tabs.delete(tabId);
    run.tabOwners.delete(tabId);
    await chrome.tabs.remove(tabId).catch(() => {});
  }
}

async function sendTaskToTab(tabId, asin, options = {}) {
  let injected = false;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    if (options.run.stopped) throw new Error("STOPPED");
    try {
      return await untilStopped(options.run, chrome.tabs.sendMessage(tabId, {
        type: "RUN_SIF_DOWNLOAD",
        asin,
        captureReady: options.captureReady !== false
      }));
    } catch (error) {
      if (options.run.stopped) throw new Error("STOPPED");
      if (!injected) {
        await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
        injected = true;
      }
      await delay(700);
    }
  }
  throw new Error("无法连接 Sif 工作页。请刷新登录状态后重试。");
}

// This function is injected into the Sif page's MAIN world.  The page builds
// the XLSX download as a Blob and then clicks an object URL; capturing that
// Blob lets the local keyword tracker import it without reading the Downloads
// folder (which a normal web page cannot access).
function installDownloadCaptureMain() {
  const stateKey = "__KEYWORD_TRACKER_SIF_CAPTURE__";
  if (window[stateKey]) return;
  const state = { armed: false, asin: "", posted: false, blobs: new Map() };
  window[stateKey] = state;

  const encode = (buffer) => {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    const chunk = 0x8000;
    for (let offset = 0; offset < bytes.length; offset += chunk) {
      binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + chunk, bytes.length)));
    }
    return btoa(binary);
  };
  const isSpreadsheet = (blob) => {
    const type = String(blob?.type || "").toLowerCase();
    return type.includes("spreadsheet") || type.includes("excel") || type.includes("octet-stream")
      || type.includes("csv") || type === "";
  };
  const postBlob = async (blob, filename = "") => {
    if (!state.armed || state.posted || !(blob instanceof Blob) || !isSpreadsheet(blob)) return;
    if (!blob.size || blob.size > 25 * 1024 * 1024) return;
    state.posted = true;
    try {
      const data = encode(await blob.arrayBuffer());
      window.postMessage({
        source: "sif-batch-downloader",
        type: "SIF_DOWNLOAD_CAPTURE",
        asin: state.asin,
        filename: String(filename || ""),
        mime: blob.type || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        data
      }, "*");
    } catch (error) {
      state.posted = false;
      window.postMessage({
        source: "sif-batch-downloader",
        type: "SIF_DOWNLOAD_CAPTURE_ERROR",
        asin: state.asin,
        error: String(error?.message || error)
      }, "*");
    }
  };

  const originalCreateObjectURL = URL.createObjectURL.bind(URL);
  URL.createObjectURL = (value) => {
    const url = originalCreateObjectURL(value);
    if (state.armed && value instanceof Blob) state.blobs.set(url, value);
    return url;
  };
  const originalRevokeObjectURL = URL.revokeObjectURL.bind(URL);
  URL.revokeObjectURL = (url) => {
    if (state.armed) state.blobs.delete(url);
    return originalRevokeObjectURL(url);
  };
  const anchorClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function (...args) {
    if (state.armed && this.download) {
      const blob = state.blobs.get(this.href);
      if (blob) void postBlob(blob, this.download);
    }
    return anchorClick.apply(this, args);
  };
  window.addEventListener("message", (event) => {
    if (event.source !== window || event.data?.source !== "keyword-tracker-web") return;
    if (event.data.type !== "ARM_SIF_DOWNLOAD_CAPTURE") return;
    state.armed = true;
    state.posted = false;
    state.asin = String(event.data.asin || "").trim().toUpperCase();
    state.blobs.clear();
  });
}

function waitForTabComplete(tabId, timeoutMs, run) {
  return new Promise(async (resolve, reject) => {
    const current = await chrome.tabs.get(tabId).catch(() => null);
    if (run.stopped) return reject(new Error("STOPPED"));
    if (!current) return reject(new Error("工作页被关闭。"));
    if (current?.status === "complete") return resolve();

    const timer = setTimeout(() => finish(new Error("PAGE_TIMEOUT")), timeoutMs);
    const onUpdated = (updatedId, changeInfo) => {
      if (updatedId === tabId && changeInfo.status === "complete") finish();
    };
    const onRemoved = (removedId) => {
      if (removedId === tabId) finish(new Error(run.stopped ? "STOPPED" : "工作页被关闭。"));
    };
    const finish = (error) => {
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(onUpdated);
      chrome.tabs.onRemoved.removeListener(onRemoved);
      error ? reject(error) : resolve();
    };
    chrome.tabs.onUpdated.addListener(onUpdated);
    chrome.tabs.onRemoved.addListener(onRemoved);
  });
}

function expectDownload(asin) {
  cancelExpectedDownload(asin, new Error("新的下载任务已替换旧任务。"));
  return new Promise((resolve, reject) => {
    expectedDownloads.set(asin, { resolve, reject, timer: null, createdAt: Date.now() });
  });
}

function armDownloadTimeout(asin) {
  const pending = expectedDownloads.get(asin);
  if (!pending || pending.timer !== null) return;
  pending.timer = setTimeout(() => {
    expectedDownloads.delete(asin);
    const error = new Error("DOWNLOAD_BLOCKED");
    error.noRetry = true;
    pending.reject(error);
  }, DOWNLOAD_START_TIMEOUT_MS);
}

function cancelExpectedDownload(asin, error) {
  const pending = expectedDownloads.get(asin);
  if (!pending) return;
  clearTimeout(pending.timer);
  expectedDownloads.delete(asin);
  pending.reject(error);
}

chrome.downloads.onCreated.addListener((item) => {
  if (!isSifDownload(item)) return;
  const asin = extractAsin(item.referrer, item.finalUrl, item.url, item.filename);
  let pending = asin ? expectedDownloads.get(asin) : null;
  let owner = asin;

  if (!pending) {
    const fallback = [...expectedDownloads.entries()].sort((a, b) => a[1].createdAt - b[1].createdAt)[0];
    if (fallback) [owner, pending] = fallback;
  }
  if (!pending || !owner) return;
  clearTimeout(pending.timer);
  expectedDownloads.delete(owner);
  downloadOwners.set(item.id, {
    asin: owner,
    countryCode: state.tasks.find((task) => task.asin === owner)?.countryCode || "CA"
  });
  pending.resolve(item);
});

chrome.downloads.onDeterminingFilename.addListener((item, suggest) => {
  const owner = downloadOwners.get(item.id);
  if (!owner && !isSifDownload(item)) return suggest();
  const asin = owner?.asin || extractAsin(item.referrer, item.finalUrl, item.url, item.filename);
  if (!asin) return suggest();
  suggest({ filename: suggestedFilename(asin, item, new Date(), owner?.countryCode || "CA"), conflictAction: "uniquify" });
});

async function waitForDownloadComplete(downloadId, timeoutMs, run) {
  const existing = (await chrome.downloads.search({ id: downloadId }))[0];
  if (existing?.state === "complete") return existing;
  if (existing?.state === "interrupted") {
    const error = new Error("DOWNLOAD_FAILED");
    error.noRetry = true;
    throw error;
  }

  return new Promise((resolve, reject) => {
    const cancel = () => finish(new Error("STOPPED"));
    const timer = setTimeout(() => finish(new Error("DOWNLOAD_FAILED")), timeoutMs);
    const listener = async (delta) => {
      if (delta.id !== downloadId || !delta.state) return;
      if (delta.state.current === "complete") {
        const result = (await chrome.downloads.search({ id: downloadId }))[0];
        finish(null, result);
      } else if (delta.state.current === "interrupted") {
        finish(new Error("DOWNLOAD_FAILED"));
      }
    };
    const finish = (error, result) => {
      clearTimeout(timer);
      chrome.downloads.onChanged.removeListener(listener);
      run.cancelWaits.delete(cancel);
      downloadOwners.delete(downloadId);
      if (error) error.noRetry = true;
      error ? reject(error) : resolve(result);
    };
    chrome.downloads.onChanged.addListener(listener);
    run.cancelWaits.add(cancel);
    if (run.stopped) cancel();
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withDownloadGate(callback) {
  const previous = downloadGate;
  let release;
  downloadGate = new Promise((resolve) => { release = resolve; });
  await previous;
  try {
    return await callback();
  } finally {
    release();
  }
}
