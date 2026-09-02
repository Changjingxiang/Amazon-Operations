import { parseAsins, normalizeConcurrency } from "./utils.mjs";

const elements = {
  input: document.querySelector("#asin-input"),
  counter: document.querySelector("#asin-counter"),
  validation: document.querySelector("#validation-message"),
  concurrency: document.querySelector("#concurrency"),
  start: document.querySelector("#start-button"),
  stop: document.querySelector("#stop-button"),
  retry: document.querySelector("#retry-button"),
  summary: document.querySelector("#summary-text"),
  progress: document.querySelector("#progress-bar"),
  list: document.querySelector("#task-list")
};

let latestState = null;

function inputState() {
  return parseAsins(elements.input.value);
}

function renderValidation() {
  const parsed = inputState();
  elements.counter.textContent = `${parsed.accepted.length} / 15`;
  elements.validation.classList.remove("error");

  if (parsed.invalid.length) {
    elements.validation.textContent = `格式不正确：${parsed.invalid.slice(0, 3).join("、")}`;
    elements.validation.classList.add("error");
  } else if (parsed.overflow.length) {
    elements.validation.textContent = `超出上限：请删除 ${parsed.overflow.length} 个 ASIN。`;
    elements.validation.classList.add("error");
  } else {
    elements.validation.textContent = "最多 15 个，重复项会自动去除。";
  }

  const running = latestState?.status === "running" || latestState?.status === "stopping";
  elements.start.disabled = running || !parsed.accepted.length || parsed.invalid.length > 0 || parsed.overflow.length > 0;
}

const labels = {
  queued: "排队中",
  opening: "打开页面",
  working: "查询父体",
  downloading: "文件下载中",
  done: "已完成",
  failed: "失败",
  cancelled: "已停止"
};

function renderState(state) {
  latestState = state || { status: "idle", tasks: [] };
  const tasks = latestState.tasks || [];
  const finished = tasks.filter((task) => ["done", "failed", "cancelled"].includes(task.status)).length;
  const failed = tasks.filter((task) => task.status === "failed").length;
  const running = ["running", "stopping"].includes(latestState.status);
  const percent = tasks.length ? Math.round((finished / tasks.length) * 100) : 0;

  elements.summary.textContent = tasks.length
    ? `${finished} / ${tasks.length}${failed ? ` · ${failed} 失败` : ""}`
    : "尚未开始";
  elements.progress.style.width = `${percent}%`;
  elements.stop.disabled = !running;
  elements.retry.hidden = running || failed === 0;
  elements.input.disabled = running;
  elements.concurrency.disabled = running;

  if (!tasks.length) {
    elements.list.innerHTML = '<li class="empty-state">输入 ASIN 后开始，扩展会在后台工作。</li>';
  } else {
    elements.list.replaceChildren(...tasks.map((task) => {
      const li = document.createElement("li");
      const row = document.createElement("div");
      row.className = "task-row";
      const asin = document.createElement("span");
      asin.className = "asin";
      asin.textContent = task.asin;
      const status = document.createElement("span");
      status.className = `task-status status-${task.status}`;
      status.textContent = labels[task.status] || task.status;
      row.append(asin, status);
      li.append(row);
      if (task.error) {
        const error = document.createElement("p");
        error.className = "task-error";
        error.textContent = task.error;
        li.append(error);
      }
      return li;
    }));
  }

  renderValidation();
}

async function getState() {
  try {
    const response = await chrome.runtime.sendMessage({ type: "GET_STATE" });
    if (response?.state) renderState(response.state);
  } catch (error) {
    elements.summary.textContent = "后台连接失败";
  }
}

elements.input.addEventListener("input", () => {
  renderValidation();
  chrome.storage.local.set({ popupDraft: elements.input.value });
});

elements.concurrency.addEventListener("change", () => {
  chrome.storage.local.set({ concurrency: normalizeConcurrency(elements.concurrency.value) });
});

elements.start.addEventListener("click", async () => {
  const parsed = inputState();
  if (!parsed.accepted.length || parsed.invalid.length || parsed.overflow.length) return;
  const response = await chrome.runtime.sendMessage({
    type: "START_BATCH",
    payload: {
      asins: parsed.accepted,
      concurrency: normalizeConcurrency(elements.concurrency.value)
    }
  });
  if (!response?.ok) {
    elements.validation.textContent = response?.error || "无法开始任务。";
    elements.validation.classList.add("error");
  }
  await getState();
});

elements.stop.addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "STOP_BATCH" });
  await getState();
});

elements.retry.addEventListener("click", async () => {
  const response = await chrome.runtime.sendMessage({ type: "RETRY_FAILED" });
  if (!response?.ok) {
    elements.validation.textContent = response?.error || "无法重试。";
    elements.validation.classList.add("error");
  }
  await getState();
});

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "STATE_UPDATED") renderState(message.state);
});

const saved = await chrome.storage.local.get(["popupDraft", "concurrency"]);
elements.input.value = saved.popupDraft || "";
elements.concurrency.value = String(normalizeConcurrency(saved.concurrency || 3));
renderValidation();
await getState();
setInterval(getState, 1200);
