const SERVER_URL = "http://localhost:8000/agent";

async function ensureOffscreen() {
  const existing = await chrome.offscreen.hasDocument();
  if (existing) return;

  await chrome.offscreen.createDocument({
    url: "offscreen.html",
    reasons: ["BLOBS"],
    justification: "Redact sensitive regions from a captured tab image before network transmission."
  });
}

async function redactImage(dataUrl, boxes, dpr) {
  await ensureOffscreen();

  return await chrome.runtime.sendMessage({
    type: "REDACT_IMAGE",
    dataUrl,
    boxes,
    dpr
  });
}

async function captureContext(tabId, windowId) {
  const [domResult] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => new Promise(resolve => {
      chrome.runtime.sendMessage({ type: "EXTRACT_DOM" }, resolve);
    })
  });

  // Fallback: directly message the content script if the executeScript wrapper
  // cannot access the content-script response.
  let domResponse = domResult?.result;

  if (!domResponse?.ok) {
    domResponse = await chrome.tabs.sendMessage(tabId, { type: "EXTRACT_DOM" });
  }

  if (!domResponse?.ok) {
    throw new Error(domResponse?.error || "Could not extract DOM");
  }

  const screenshot = await chrome.tabs.captureVisibleTab(windowId, {
    format: "png"
  });

  const redacted = await redactImage(
    screenshot,
    domResponse.context.sensitiveBoxes || [],
    domResponse.context.viewport?.devicePixelRatio || 1
  );

  return {
    dom: domResponse.context,
    screenshot: redacted.dataUrl
  };
}

async function sendToServer(context) {
  const response = await fetch(SERVER_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(context)
  });

  if (!response.ok) {
    throw new Error(`Server returned HTTP ${response.status}`);
  }

  return await response.json();
}

async function executeReturnedAction(tabId, action) {
  // Defense-in-depth: only allow a tiny explicit action vocabulary.
  const allowed = new Set(["click", "scroll", "focus"]);
  if (!action || !allowed.has(action.type)) {
    throw new Error("Server returned a disallowed action");
  }

  return await chrome.tabs.sendMessage(tabId, {
    type: "EXECUTE_ACTION",
    action
  });
}

async function runAgent(tab) {
  const context = await captureContext(tab.id, tab.windowId);

  // This sends ONLY:
  // 1) structural DOM metadata with sensitive fields excluded/redacted
  // 2) locally redacted screenshot
  const serverResult = await sendToServer(context);

  let actionResult = null;
  if (serverResult?.action) {
    actionResult = await executeReturnedAction(tab.id, serverResult.action);
  }

  return { context, serverResult, actionResult };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "RUN_AGENT") {
    chrome.tabs.query({ active: true, currentWindow: true })
      .then(tabs => runAgent(tabs[0]))
      .then(result => sendResponse({ ok: true, result }))
      .catch(error => sendResponse({ ok: false, error: String(error) }));

    return true;
  }

  if (message?.type === "GET_CONTEXT") {
    chrome.tabs.query({ active: true, currentWindow: true })
      .then(tabs => captureContext(tabs[0].id, tabs[0].windowId))
      .then(context => sendResponse({ ok: true, context }))
      .catch(error => sendResponse({ ok: false, error: String(error) }));

    return true;
  }
});

chrome.commands.onCommand.addListener(async command => {
  if (command !== "capture-page-context") return;

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;

  try {
    await runAgent(tab);
  } catch (e) {
    console.error("Agent failed:", e);
  }
});