(() => {
  "use strict";
  const CC = (globalThis.CC = globalThis.CC || {});
  const M = (CC.mentions = {});

  const WORD = /[\p{L}\p{N}_]/u;

  function scan(text, allow) {
    const lower = text.toLowerCase();
    const fold = lower.length === text.length;
    const hay = fold ? lower : text;
    const people = [...CC.staff.values()]
      .filter((p) => p.full_name && (!allow || allow.has(p.id)))
      .sort((a, b) => b.full_name.length - a.full_name.length);
    const taken = [];
    const found = [];
    for (const p of people) {
      const tag = "@" + p.full_name;
      const needle = fold ? tag.toLowerCase() : tag;
      if (needle.length !== tag.length) continue;
      let from = 0;
      for (;;) {
        const i = hay.indexOf(needle, from);
        if (i < 0) break;
        const end = i + needle.length;
        from = end;
        if (i > 0 && WORD.test(text[i - 1])) continue;
        if (end < text.length && WORD.test(text[end])) continue;
        if (taken.some(([s, e]) => i < e && end > s)) continue;
        taken.push([i, end]);
        found.push({ start: i, end, id: p.id });
      }
    }
    return found.sort((a, b) => a.start - b.start);
  }

  M.collect = (text, meId) => {
    const ids = new Set();
    for (const t of scan(text, null)) if (t.id !== meId) ids.add(t.id);
    return [...ids].slice(0, 50);
  };

  M.render = (box, text, ids, meId) => {
    const allow = new Set(ids || []);
    const tags = allow.size ? scan(text, allow) : [];
    let pos = 0;
    for (const t of tags) {
      if (t.start > pos) box.append(text.slice(pos, t.start));
      const chip = document.createElement("span");
      chip.className = t.id === meId ? "tag me" : "tag";
      chip.textContent = text.slice(t.start, t.end);
      box.append(chip);
      pos = t.end;
    }
    if (pos < text.length) box.append(text.slice(pos));
  };

  M.attach = ({ textarea, menu, meId, getCandidates }) => {
    const pool = () => (getCandidates ? getCandidates() : [...CC.staff.values()]);
    let items = [];
    let index = 0;
    let range = null;

    function close() {
      menu.hidden = true;
      menu.replaceChildren();
      items = [];
      range = null;
    }

    function paint() {
      menu.replaceChildren();
      items.forEach((p, i) => {
        const row = document.createElement("div");
        row.className = "mention-item" + (i === index ? " on" : "");
        row.setAttribute("role", "option");
        const av = CC.avatarEl(p, "mention-av");
        const name = document.createElement("strong");
        name.textContent = p.full_name;
        const role = document.createElement("span");
        role.className = "mention-role";
        role.textContent = p.role || "";
        row.append(av, name, role);
        row.addEventListener("mousedown", (e) => { e.preventDefault(); choose(i); });
        row.addEventListener("mouseenter", () => { index = i; mark(); });
        menu.append(row);
      });
      menu.hidden = false;
    }

    function mark() {
      [...menu.children].forEach((c, i) => c.classList.toggle("on", i === index));
    }

    function update() {
      const pos = textarea.selectionStart;
      const before = textarea.value.slice(0, pos);
      const m = /(^|\s)@([^\n@]{0,30})$/.exec(before);
      if (!m) return close();
      const q = m[2].toLowerCase();
      const list = pool()
        .filter((p) => p.id !== meId && p.full_name && p.full_name.toLowerCase().includes(q))
        .sort((a, b) => {
          const sa = a.full_name.toLowerCase().startsWith(q) ? 0 : 1;
          const sb = b.full_name.toLowerCase().startsWith(q) ? 0 : 1;
          return sa - sb || a.full_name.localeCompare(b.full_name, "id");
        })
        .slice(0, 6);
      if (!list.length) return close();
      items = list;
      index = 0;
      range = { start: pos - m[2].length - 1, end: pos };
      paint();
    }

    function choose(i) {
      const p = items[i];
      if (!p || !range) return;
      const tag = "@" + p.full_name + " ";
      const v = textarea.value;
      textarea.value = v.slice(0, range.start) + tag + v.slice(range.end);
      const caret = range.start + tag.length;
      textarea.setSelectionRange(caret, caret);
      close();
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
      textarea.focus();
    }

    function handleKey(e) {
      if (menu.hidden || !items.length) return false;
      if (e.key === "ArrowDown") { index = (index + 1) % items.length; mark(); }
      else if (e.key === "ArrowUp") { index = (index - 1 + items.length) % items.length; mark(); }
      else if (e.key === "Enter" || e.key === "Tab") { choose(index); }
      else if (e.key === "Escape") { close(); }
      else return false;
      e.preventDefault();
      return true;
    }

    textarea.addEventListener("input", update);
    textarea.addEventListener("click", update);
    textarea.addEventListener("keyup", (e) => {
      if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) update();
    });
    textarea.addEventListener("blur", () => setTimeout(close, 120));

    return { handleKey, close };
  };
})();
