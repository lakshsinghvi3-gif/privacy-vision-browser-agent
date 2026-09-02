(() => {
  const AGENT_ID = "data-agent-id";
  let nextId = 1;

  const SENSITIVE_INPUT_TYPES = new Set([
    "password", "hidden"
  ]);

  const SENSITIVE_AUTOCOMPLETE = /cc-|credit-card|current-password|new-password|one-time-code|tel|email|address-line|postal-code/i;
  const SENSITIVE_NAME = /password|passwd|pwd|secret|token|api[_-]?key|credit|card|cvv|cvc|ssn|aadhaar|pan|email|phone|mobile|address|dob|date.?birth/i;

  function isVisible(el) {
    const s = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return s.display !== "none" &&
           s.visibility !== "hidden" &&
           parseFloat(s.opacity || "1") > 0 &&
           r.width > 0 && r.height > 0;
  }

  function isSensitiveElement(el) {
    if (!(el instanceof Element)) return false;

    const tag = el.tagName.toLowerCase();
    const type = (el.getAttribute("type") || "").toLowerCase();
    const autocomplete = el.getAttribute("autocomplete") || "";
    const name = el.getAttribute("name") || "";
    const id = el.id || "";
    const aria = el.getAttribute("aria-label") || "";

    if (SENSITIVE_INPUT_TYPES.has(type)) return true;
    if (SENSITIVE_AUTOCOMPLETE.test(autocomplete)) return true;
    if (SENSITIVE_NAME.test(`${name} ${id} ${aria}`)) return true;

    // Treat contenteditable areas with credential-like labels as sensitive.
    if (el.isContentEditable && SENSITIVE_NAME.test(`${name} ${id} ${aria}`)) return true;

    return false;
  }

  function textForStructure(el) {
    if (isSensitiveElement(el)) return "[REDACTED]";

    // Keep only short, non-sensitive visible text for structural reasoning.
    const text = (el.innerText || el.textContent || "")
      .replace(/\s+/g, " ")
      .trim();

    return text.length <= 120 ? text : text.slice(0, 117) + "...";
  }

  function cssSelector(el) {
    if (el.id) return `#${CSS.escape(el.id)}`;

    const parts = [];
    let node = el;

    while (node && node.nodeType === Node.ELEMENT_NODE && parts.length < 5) {
      let part = node.tagName.toLowerCase();

      const classes = [...node.classList]
        .filter(c => /^[a-zA-Z_][\w-]*$/.test(c))
        .slice(0, 2);

      if (classes.length) {
        part += "." + classes.map(CSS.escape).join(".");
      }

      const parent = node.parentElement;
      if (parent) {
        const siblings = [...parent.children].filter(x => x.tagName === node.tagName);
        if (siblings.length > 1) {
          part += `:nth-of-type(${siblings.indexOf(node) + 1})`;
        }
      }

      parts.unshift(part);
      node = parent;
    }

    return parts.join(" > ");
  }

  function getOrAssignId(el) {
    let id = el.getAttribute(AGENT_ID);
    if (!id) {
      id = `el-${Date.now()}-${nextId++}`;
      el.setAttribute(AGENT_ID, id);
    }
    return id;
  }

  function box(el) {
    const r = el.getBoundingClientRect();
    return {
      x: Math.max(0, Math.round(r.left)),
      y: Math.max(0, Math.round(r.top)),
      width: Math.max(0, Math.round(r.width)),
      height: Math.max(0, Math.round(r.height))
    };
  }

  function extractDom() {
    const elements = [...document.querySelectorAll(
      "button, a, input, textarea, select, [role='button'], [contenteditable='true'], h1, h2, h3, label"
    )];

    const sensitiveBoxes = [];
    const nodes = [];

    for (const el of elements) {
      if (!isVisible(el)) continue;

      const sensitive = isSensitiveElement(el);
      const id = getOrAssignId(el);

      if (sensitive) {
        sensitiveBoxes.push(box(el));
      }

      const attrs = {};
      for (const attr of ["role", "type", "name", "placeholder", "aria-label", "autocomplete"]) {
        if (el.hasAttribute(attr) && attr !== "value") {
          attrs[attr] = attr === "placeholder" && sensitive ? "[REDACTED]" : el.getAttribute(attr);
        }
      }

      nodes.push({
        agentId: id,
        tag: el.tagName.toLowerCase(),
        selector: cssSelector(el),
        text: textForStructure(el),
        attributes: attrs,
        sensitive,
        box: box(el)
      });
    }

    return {
      url: location.origin + location.pathname,
      title: document.title,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
        devicePixelRatio: window.devicePixelRatio
      },
      nodes,
      sensitiveBoxes
    };
  }

  function findByAgentId(agentId) {
    return document.querySelector(`[${AGENT_ID}="${CSS.escape(agentId)}"]`);
  }

  function executeAction(action) {
    if (!action || typeof action.type !== "string") {
      throw new Error("Invalid action");
    }

    if (action.type === "click") {
      const el = findByAgentId(action.agentId);
      if (!el) throw new Error("Target element not found");
      if (!isVisible(el)) throw new Error("Target element is not visible");
      if (isSensitiveElement(el)) throw new Error("Refusing to click a sensitive element");
      el.scrollIntoView({ block: "center", inline: "center", behavior: "instant" });
      el.click();
      return { ok: true, type: "click", agentId: action.agentId };
    }

    if (action.type === "scroll") {
      const amount = Number(action.amount);
      if (!Number.isFinite(amount) || Math.abs(amount) > 3000) {
        throw new Error("Invalid scroll amount");
      }
      window.scrollBy({ top: amount, left: 0, behavior: "smooth" });
      return { ok: true, type: "scroll", amount };
    }

    if (action.type === "focus") {
      const el = findByAgentId(action.agentId);
      if (!el) throw new Error("Target element not found");
      if (isSensitiveElement(el)) throw new Error("Refusing to focus a sensitive element");
      el.focus();
      return { ok: true, type: "focus", agentId: action.agentId };
    }

    throw new Error(`Unsupported action: ${action.type}`);
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === "EXTRACT_DOM") {
      try {
        sendResponse({ ok: true, context: extractDom() });
      } catch (e) {
        sendResponse({ ok: false, error: String(e) });
      }
      return true;
    }

    if (message?.type === "EXECUTE_ACTION") {
      try {
        sendResponse(executeAction(message.action));
      } catch (e) {
        sendResponse({ ok: false, error: String(e) });
      }
      return true;
    }
  });
})();