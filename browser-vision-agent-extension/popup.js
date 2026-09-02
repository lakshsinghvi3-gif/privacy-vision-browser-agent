const output = document.getElementById("output");

function show(obj) {
  output.textContent = typeof obj === "string"
    ? obj
    : JSON.stringify(obj, null, 2);
}

document.getElementById("capture").addEventListener("click", async () => {
  show("Capturing...");
  const result = await chrome.runtime.sendMessage({ type: "GET_CONTEXT" });

  if (!result?.ok) {
    show(`Error: ${result?.error}`);
    return;
  }

  const c = result.context;
  show({
    url: c.dom.url,
    title: c.dom.title,
    viewport: c.dom.viewport,
    elementCount: c.dom.nodes.length,
    sensitiveRegionCount: c.dom.sensitiveBoxes.length,
    elements: c.dom.nodes.slice(0, 30)
  });
});

document.getElementById("run").addEventListener("click", async () => {
  show("Running agent...");
  const result = await chrome.runtime.sendMessage({ type: "RUN_AGENT" });

  if (!result?.ok) {
    show(`Error: ${result?.error}`);
    return;
  }

  show({
    server: result.result.serverResult,
    action: result.result.actionResult
  });
});