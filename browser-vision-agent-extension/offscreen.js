chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "REDACT_IMAGE") return;

  (async () => {
    const img = new Image();

    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = message.dataUrl;
    });

    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;

    const ctx = canvas.getContext("2d", { willReadFrequently: false });
    ctx.drawImage(img, 0, 0);

    const dpr = Number(message.dpr) || 1;

    // DOM coordinates are CSS pixels; screenshot coordinates are device pixels.
    for (const b of message.boxes || []) {
      const x = Math.max(0, Math.round(b.x * dpr));
      const y = Math.max(0, Math.round(b.y * dpr));
      const w = Math.max(0, Math.round(b.width * dpr));
      const h = Math.max(0, Math.round(b.height * dpr));

      // Solid fill is intentionally used for the MVP. It is stronger than
      // blur because the underlying pixels are completely overwritten.
      ctx.fillStyle = "#000000";
      ctx.fillRect(x, y, w, h);
    }

    sendResponse({
      ok: true,
      dataUrl: canvas.toDataURL("image/png")
    });
  })().catch(error => {
    sendResponse({ ok: false, error: String(error) });
  });

  return true;
});