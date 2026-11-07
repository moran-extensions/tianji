(() => {
  // extension/lib/rules.js
  var LIMITS = { items: 30, fields: 300, value: 2048, bytes: 2 * 1024 * 1024 };
  function siteOrigin(value) {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || ["chromewebstore.google.com", "chrome.google.com"].includes(url.hostname)) throw new Error("\u8BF7\u5728\u666E\u901A\u7F51\u9875\u4E0A\u4F7F\u7528");
    return url.origin;
  }
  function pageScope(value) {
    const url = new URL(value);
    siteOrigin(value);
    let path = url.pathname.replace(/\/+$/, "") || "/";
    if (path.includes("/job/")) path = path.replace(/\/(build|buildWithParameters|parambuild)$/, "") || "/";
    if (path.length > 2048) throw new Error("\u9875\u9762\u5730\u5740\u8FC7\u957F");
    return path;
  }
  function isSensitive(field) {
    if (!field || !["text", "search", "number", "url", "tel", "email", "textarea"].includes(field.kind)) return true;
    const text = [field.key, field.label, field.name, field.id, field.autocomplete, field.placeholder].filter((value) => typeof value === "string").join(" ").toLowerCase();
    return /password|passwd|passphrase|token|secret|credential|authorization|otpcode|verificationcode|one[-_ ]?time|(?:^|[^a-z])(?:otp|totp|hotp|pin|cvv|cvc|csrf|xsrf|username)(?:$|[^a-z])|api[-_ ]?key|access[-_ ]?key|private[-_ ]?key|current-password|new-password|cc-|密码|口令|验证码|校验码|动态码|令牌|密钥|身份证|信用卡|银行卡/.test(text);
  }

  // src/fields.js
  var clean = (value) => String(value || "").replace(/\s+/g, " ").trim().slice(0, 512);
  function describeField(node) {
    if (!(node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement) || node.disabled || node.readOnly || node.closest("[data-cj3-owned]")) return null;
    const kind = node instanceof HTMLTextAreaElement ? "textarea" : node.type;
    if (!["text", "search", "number", "url", "tel", "email", "textarea"].includes(kind) || node.closest(".select2-search,.ant-select-selection-search,.el-select__wrapper,[role=listbox]")) return null;
    const rect = node.getBoundingClientRect();
    if (!node.isConnected || rect.width < 20 || rect.height < 12 || getComputedStyle(node).visibility !== "visible" || getComputedStyle(node).display === "none") return null;
    const form = node.form;
    if (form && /j_acegi_security_check|j_spring_security_check|\/(login|signin)(?:[/?]|$)/i.test(form.getAttribute("action") || "")) return null;
    let parameter = "";
    for (let parent = node.parentElement, depth = 0; parent && depth < 5 && parent !== form && parent !== document.body; parent = parent.parentElement, depth++) {
      const names = parent.querySelectorAll('input[type="hidden"][name="name"]');
      if (names.length === 1) {
        parameter = clean(names[0].value);
        break;
      }
      if (names.length > 1) break;
    }
    const label = clean(node.labels?.[0]?.textContent || node.getAttribute("aria-label") || parameter || node.closest(".jenkins-form-item,.form-group,tr")?.querySelector(".jenkins-form-label,.setting-name,label")?.textContent || node.placeholder || node.name || node.id);
    let key;
    if (parameter) key = "parameter:" + parameter;
    else if (node.name && !/^(value|input|text)$/i.test(node.name)) {
      const peers = [...(form || document).querySelectorAll("input,textarea")].filter((item) => item.name === node.name);
      key = "name:" + node.name + (peers.length > 1 ? ":" + (label || peers.indexOf(node)) : "");
    } else if (label) key = "label:" + label;
    else if (node.id) key = "id:" + node.id;
    else key = "position:" + [...document.querySelectorAll("input,textarea")].indexOf(node);
    const field = { key, label: label || "\u672A\u547D\u540D\u8F93\u5165\u6846", kind, name: clean(node.name), id: clean(node.id), autocomplete: clean(node.autocomplete), placeholder: clean(node.placeholder) };
    return key.length <= 512 && !isSensitive(field) ? field : null;
  }
  function acceptsValue(node, value) {
    if (!describeField(node) || typeof value !== "string") return false;
    if (node.maxLength >= 0 && value.length > node.maxLength) return false;
    const clone = node.cloneNode(false);
    clone.value = value;
    return clone.value === value && clone.validity.valid;
  }
  function fillValue(node, value) {
    if (!acceptsValue(node, value)) throw new Error("\u5F53\u524D\u8F93\u5165\u6846\u4E0D\u63A5\u53D7\u8FD9\u4E2A\u503C\uFF0C\u8BF7\u68C0\u67E5\u957F\u5EA6\u6216\u683C\u5F0F\u9650\u5236");
    const prototype = node instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, "value").set.call(node, value);
    node.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    node.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
    if (node.isConnected) node.focus({ preventScroll: true });
  }

  // src/content.js
  (() => {
    if (window !== window.top || globalThis.__cj3History || !document.documentElement) return;
    let enabled = false, active = null, opened = false, items = [], context = null, refreshId = 0;
    let dirty = /* @__PURE__ */ new Map(), saving = /* @__PURE__ */ new WeakMap(), frame = 0;
    const host = document.createElement("div");
    host.id = "chajian3-field-history";
    host.dataset.cj3Owned = "true";
    const shadow = host.attachShadow({ mode: "closed" });
    const style = document.createElement("style");
    style.textContent = `
    :host{all:initial!important;position:fixed!important;left:0!important;top:0!important;width:0!important;height:0!important;z-index:2147483647!important;overflow:visible!important;pointer-events:none!important;color-scheme:light!important}
    *{box-sizing:border-box}button,input{font:inherit}button{cursor:pointer;border:0}button:disabled{cursor:default;opacity:.5}[hidden]{display:none!important}button:focus-visible,input:focus-visible{outline:3px solid #adc6ff;outline-offset:2px}
    #trigger{position:fixed;width:40px;height:40px;display:grid;place-items:center;border:1px solid #d8e2f1;border-radius:11px;background:#fff;color:#245bd4;box-shadow:0 3px 12px #15315d18;pointer-events:auto;padding:10px}#trigger:hover{background:#eef4ff;border-color:#adc6ff}
    #panel{position:fixed;width:350px;max-width:calc(100vw - 20px);max-height:calc(100vh - 20px);padding:16px;border:1px solid #dbe3ee;border-radius:15px;background:#fff;box-shadow:0 12px 42px #182f532b;color:#182c49;font:13px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;pointer-events:auto;overflow:auto;text-align:left;letter-spacing:normal}
    .heading{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:4px}h2{font-size:15px;line-height:1.5;margin:0;overflow-wrap:anywhere}.sub{font-size:11px;color:#62718a;margin:0 0 12px}#close{width:32px;height:32px;flex:none;border-radius:8px;background:#f0f3f8;color:#61718c;font-size:20px}
    #search{display:block;width:100%;min-height:40px;border:1px solid #dbe3ee;border-radius:9px;padding:9px 11px;background:#f8faff;color:#182c49;font-size:13px;margin:0 0 10px}#search::placeholder{color:#75839a}
    #list{max-height:224px;overflow:auto;overscroll-behavior:contain}.row{display:flex;align-items:stretch;gap:4px;border-radius:9px;margin:3px 0}.row:hover{background:#f1f5fc}.value{flex:1;min-width:0;text-align:left;background:transparent;color:#243e67;padding:10px 9px;border-radius:9px;min-height:43px;overflow-wrap:anywhere;white-space:pre-wrap;font-size:13px}.delete{width:34px;flex:none;align-self:center;height:34px;border-radius:8px;background:transparent;color:#8a96a9;font-size:17px}.delete:hover{color:#b42318;background:#fff0ee}.value:disabled{opacity:.55}.unavailable{font-size:10px;display:block;color:#986a31}.empty{padding:20px 8px;text-align:center;color:#718099;font-size:12px}
    #notice{font-size:12px;color:#62718a;overflow-wrap:anywhere;margin:8px 0 0}#notice[data-error=true]{color:#b42318}.footer{display:flex;justify-content:space-between;align-items:center;gap:8px;border-top:1px solid #e8edf4;margin-top:12px;padding-top:11px}.footer button{min-height:34px;padding:6px 10px;border-radius:8px;font-size:12px}#save{background:#eaf1ff;color:#245bd4}#manage{background:transparent;color:#62718a}.hint{margin:10px 0 0;color:#8490a3;font-size:10px}
    @media(prefers-color-scheme:dark){:host{color-scheme:dark!important}#trigger,#panel{background:#17243a;color:#e6edf8;border-color:#394a66}#trigger{color:#b6ceff}#trigger:hover,.row:hover{background:#233958}#close{background:#23354e;color:#c0cce0}#search{background:#101d31;border-color:#394a66;color:#e6edf8}.value{color:#d3e1f8}.sub,#notice,#manage{color:#b5c1d5}.delete{color:#9eacc0}.delete:hover{background:#482b31;color:#ffc1b9}.footer{border-color:#34435b}#save{background:#274675;color:#deebff}.hint{color:#9cabc2}}
    @media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important}}
  `;
    const node = (tag, text, props = {}) => {
      const element = document.createElement(tag);
      if (text !== void 0) element.textContent = text;
      Object.assign(element, props);
      return element;
    };
    const button = (id, text) => node("button", text, { id, type: "button" });
    const trigger = button("trigger", "");
    trigger.setAttribute("aria-label", "\u6253\u5F00\u8F93\u5165\u5386\u53F2");
    trigger.setAttribute("aria-haspopup", "dialog");
    trigger.setAttribute("aria-expanded", "false");
    const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    for (const [key, value] of Object.entries({ viewBox: "0 0 24 24", width: "20", height: "20", fill: "none", stroke: "currentColor", "stroke-width": "1.8", "aria-hidden": "true" })) icon.setAttribute(key, value);
    for (const d of ["M3 11a9 9 0 1 1 2.6 7", "M3 4v7h7", "M12 7v5l3 2"]) {
      const path = document.createElementNS(icon.namespaceURI, "path");
      path.setAttribute("d", d);
      icon.append(path);
    }
    trigger.append(icon);
    trigger.hidden = true;
    const panel = node("section", void 0, { id: "panel", hidden: true });
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "\u5B57\u6BB5\u8F93\u5165\u5386\u53F2");
    const heading = node("div", void 0, { className: "heading" }), title = node("h2", "\u8F93\u5165\u5386\u53F2"), close = button("close", "\xD7");
    close.setAttribute("aria-label", "\u5173\u95ED\u8F93\u5165\u5386\u53F2");
    heading.append(title, close);
    const sub = node("p", "\u6700\u8FD1\u4F7F\u7528 \xB7 \u6700\u591A 30 \u6761", { className: "sub" });
    const search = node("input", void 0, { id: "search", type: "search", placeholder: "\u641C\u7D22\u8FD9\u4E2A\u5B57\u6BB5\u7684\u5386\u53F2\u503C", autocomplete: "off" });
    search.setAttribute("aria-label", "\u641C\u7D22\u5F53\u524D\u5B57\u6BB5\u5386\u53F2");
    const list = node("div", void 0, { id: "list" }), notice = node("p", "", { id: "notice", hidden: true });
    notice.setAttribute("role", "status");
    const footer = node("div", void 0, { className: "footer" }), save = button("save", "\u4FDD\u5B58\u5F53\u524D\u503C"), manage = button("manage", "\u7BA1\u7406\u8BB0\u5F55 \u2197");
    footer.append(save, manage);
    panel.append(heading, sub, search, list, notice, footer, node("p", "\u4EC5\u4FDD\u5B58\u5230\u672C\u673A \xB7 \u56DE\u586B\u4E0D\u4F1A\u4E3B\u52A8\u63D0\u4EA4\u8868\u5355", { className: "hint" }));
    shadow.append(style, trigger, panel);
    const trustedClick = (element, fn) => element.addEventListener("click", (event) => {
      event.stopPropagation();
      if (event.isTrusted) void fn(event);
    });
    async function send(type, extra = {}) {
      const result = await chrome.runtime.sendMessage({ type, ...extra });
      if (!result?.ok) throw new Error(result?.error || "\u63D2\u4EF6\u5DF2\u66F4\u65B0\uFF0C\u8BF7\u5237\u65B0\u7F51\u9875\u540E\u91CD\u8BD5");
      return result.data;
    }
    function status(text, error = false) {
      notice.hidden = !text;
      notice.textContent = text;
      notice.dataset.error = String(error);
    }
    function hidePanel(focus = false) {
      opened = false;
      panel.hidden = true;
      list.replaceChildren();
      items = [];
      search.value = "";
      trigger.setAttribute("aria-expanded", "false");
      if (focus && active?.isConnected) active.focus({ preventScroll: true });
    }
    function hide() {
      hidePanel();
      trigger.hidden = true;
      active = null;
      host.remove();
    }
    function position() {
      frame = 0;
      if (!active || !enabled || !describeField(active)) {
        hide();
        return;
      }
      const rect = active.getBoundingClientRect();
      if (rect.bottom < 0 || rect.top > innerHeight || rect.right < 0 || rect.left > innerWidth) {
        trigger.hidden = true;
        panel.hidden = true;
        return;
      }
      trigger.hidden = false;
      panel.hidden = !opened;
      let left = rect.right + 6, top = rect.top + (rect.height - 40) / 2;
      if (left + 40 > innerWidth - 6) {
        left = rect.left - 46;
        if (left < 6) {
          left = Math.max(6, rect.right - 40);
          top = rect.top >= 46 ? rect.top - 44 : rect.bottom + 4;
        }
      }
      trigger.style.left = `${Math.max(6, left)}px`;
      trigger.style.top = `${Math.max(6, Math.min(innerHeight - 44, top))}px`;
      if (opened) {
        const width = Math.min(350, innerWidth - 20), height = Math.min(panel.offsetHeight || 300, innerHeight - 20);
        panel.style.left = `${Math.max(10, Math.min(rect.left, innerWidth - width - 10))}px`;
        panel.style.top = `${Math.max(10, rect.bottom + 8 + height <= innerHeight - 10 ? rect.bottom + 8 : rect.top - height - 8)}px`;
      }
    }
    function schedule() {
      if (!frame) frame = requestAnimationFrame(position);
    }
    function activate(target) {
      if (!enabled || !describeField(target)) {
        hide();
        return;
      }
      if (active !== target) {
        hidePanel();
        active = target;
      }
      if (!host.isConnected) document.documentElement.append(host);
      trigger.setAttribute("aria-label", `\u6253\u5F00 ${describeField(target).label} \u7684\u8F93\u5165\u5386\u53F2`);
      schedule();
    }
    async function remember(target, manual = false) {
      if (!enabled || !manual && !dirty.has(target)) return;
      const candidate = dirty.get(target);
      dirty.delete(target);
      const field = describeField(target), value = manual ? target.value : candidate?.value;
      if (!manual && (!field || candidate?.key !== field.key)) return;
      if (!field || !value.trim() || value.length > 2048) {
        if (manual) throw new Error("\u8BF7\u8F93\u5165\u4E0D\u8D85\u8FC7 2048 \u5B57\u7B26\u7684\u975E\u7A7A\u666E\u901A\u5185\u5BB9");
        return;
      }
      const task = send("FIELD_SAVE", { field, value });
      saving.set(target, task);
      try {
        await task;
      } finally {
        if (saving.get(target) === task) saving.delete(target);
      }
    }
    function draw() {
      list.replaceChildren();
      const query = search.value.toLocaleLowerCase(), filtered = items.filter((item) => item.value.toLocaleLowerCase().includes(query));
      if (!filtered.length) list.append(node("p", items.length ? "\u6CA1\u6709\u5339\u914D\u7684\u5386\u53F2\u503C" : "\u8FD8\u6CA1\u6709\u8BB0\u5F55\u3002\u8F93\u5165\u5B8C\u6210\u540E\u79BB\u5F00\u8F93\u5165\u6846\u4F1A\u81EA\u52A8\u4FDD\u5B58\u3002", { className: "empty" }));
      for (const item of filtered) {
        const row = node("div", void 0, { className: "row" }), value = button("", item.value), remove = button("", "\xD7");
        value.className = "value";
        value.title = item.value;
        value.disabled = !acceptsValue(active, item.value);
        value.dataset.itemId = item.id;
        if (value.disabled) value.append(node("span", "\u5F53\u524D\u5B57\u6BB5\u4E0D\u63A5\u53D7\u6B64\u503C", { className: "unavailable" }));
        remove.className = "delete";
        remove.setAttribute("aria-label", "\u5220\u9664\u8FD9\u6761\u5386\u53F2\u8BB0\u5F55");
        trustedClick(value, () => choose(item));
        trustedClick(remove, async () => {
          try {
            await send("FIELD_DELETE", { field: describeField(active), itemId: item.id });
            await load();
          } catch (error) {
            status(error.message, true);
          }
        });
        row.append(value, remove);
        list.append(row);
      }
      save.disabled = !active?.value.trim();
      schedule();
    }
    async function load() {
      const target = active, field = describeField(target), revision = ++refreshId;
      if (!field) {
        hide();
        return;
      }
      const result = await send("FIELD_GET", { field });
      if (active !== target || revision !== refreshId || !opened) return;
      items = result.items;
      title.textContent = field.label + " \xB7 \u8F93\u5165\u5386\u53F2";
      draw();
    }
    async function choose(item) {
      const target = active, field = describeField(target);
      try {
        if (!field || !context || pageScope(location.href) !== context.path || !acceptsValue(target, item.value)) throw new Error("\u9875\u9762\u6216\u5B57\u6BB5\u5DF2\u53D8\u5316\uFF0C\u8BF7\u91CD\u65B0\u6253\u5F00\u5386\u53F2");
        const result = await send("FIELD_USE", { field, itemId: item.id });
        if (active !== target || describeField(target)?.key !== field.key || pageScope(location.href) !== context.path) throw new Error("\u5B57\u6BB5\u5DF2\u53D8\u5316\uFF0C\u672A\u56DE\u586B");
        dirty.delete(target);
        hidePanel();
        fillValue(target, result.value);
      } catch (error) {
        status(error.message, true);
      }
    }
    trustedClick(trigger, async () => {
      if (opened) {
        hidePanel(true);
        return;
      }
      try {
        if (!describeField(active)) {
          hide();
          return;
        }
        const pending = saving.get(active);
        if (pending) await pending;
        else await remember(active);
        opened = true;
        panel.hidden = false;
        search.value = "";
        status("");
        trigger.setAttribute("aria-expanded", "true");
        list.replaceChildren(node("p", "\u6B63\u5728\u8BFB\u53D6\u5386\u53F2\u2026", { className: "empty" }));
        schedule();
        await load();
        search.focus({ preventScroll: true });
      } catch (error) {
        if (opened) status(error.message, true);
        else {
          trigger.title = error.message;
        }
      }
    });
    trustedClick(close, () => hidePanel(true));
    trustedClick(save, async () => {
      try {
        await remember(active, true);
        await load();
        status("\u5F53\u524D\u503C\u5DF2\u4FDD\u5B58");
      } catch (error) {
        status(error.message, true);
      }
    });
    trustedClick(manage, async () => {
      try {
        await send("OPEN_MANAGER");
      } catch (error) {
        status(error.message, true);
      }
    });
    search.addEventListener("input", () => {
      if (opened) draw();
    });
    shadow.addEventListener("keydown", (event) => {
      event.stopPropagation();
      if (!event.isTrusted) return;
      if (event.key === "Escape") {
        event.preventDefault();
        hidePanel(true);
      }
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        const buttons = [...list.querySelectorAll(".value:not(:disabled)")];
        if (!buttons.length) return;
        event.preventDefault();
        const index = buttons.indexOf(shadow.activeElement);
        buttons[(index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length].focus();
      }
      if (event.key === "Enter" && event.target === search) {
        event.preventDefault();
        const first = list.querySelector(".value:not(:disabled)");
        const item = items.find((item2) => item2.id === first?.dataset.itemId);
        if (item) void choose(item);
      }
    });
    for (const type of ["click", "mousedown", "submit"]) shadow.addEventListener(type, (event) => {
      event.stopPropagation();
      if (type === "submit") event.preventDefault();
    });
    document.addEventListener("focusin", (event) => {
      if (event.composedPath().includes(host)) return;
      activate(event.target);
    }, true);
    document.addEventListener("input", (event) => {
      if (!enabled || event.composedPath().includes(host)) return;
      const field = describeField(event.target);
      if (event.isTrusted && field) dirty.set(event.target, { key: field.key, value: event.target.value });
      else dirty.delete(event.target);
    }, true);
    for (const type of ["change", "focusout"]) document.addEventListener(type, (event) => {
      if (event.isTrusted && enabled && !event.composedPath().includes(host)) void remember(event.target).catch(() => {
      });
    }, true);
    document.addEventListener("submit", (event) => {
      if (enabled && event.isTrusted) {
        for (const target of [...dirty.keys()]) if (target.form === event.target) void remember(target).catch(() => {
        });
      }
    }, true);
    document.addEventListener("pointerdown", (event) => {
      if (event.isTrusted && !event.composedPath().includes(host)) hidePanel();
    }, true);
    window.addEventListener("scroll", schedule, { passive: true, capture: true });
    window.addEventListener("resize", schedule, { passive: true });
    new MutationObserver(() => {
      if (active && !active.isConnected) hide();
      else if (active) schedule();
    }).observe(document.documentElement, { childList: true, subtree: true });
    async function refresh() {
      try {
        context = await send("CONTEXT");
        enabled = context.enabled;
        if (!enabled) {
          dirty.clear();
          hide();
        } else if (opened) await load();
        else if (describeField(document.activeElement)) activate(document.activeElement);
      } catch {
        enabled = false;
        dirty.clear();
        hide();
      }
    }
    chrome.runtime.onMessage.addListener((message, sender) => {
      if (sender.id === chrome.runtime.id && message.type === "CJ3_REFRESH") void refresh();
    });
    globalThis.__cj3History = { refresh };
    void refresh();
  })();
})();
