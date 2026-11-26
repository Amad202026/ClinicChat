(() => {
  "use strict";
  const CC = (globalThis.CC = globalThis.CC || {});

  CC.staffPicker = ({ exclude, multi, onChange, onPick }) => {
    const skip = exclude || new Set();
    const selected = new Set();
    const root = CC.h("div", multi ? "picker" : "picker single");
    root.innerHTML = `
      <input type="search" class="picker-q" placeholder="Cari staff" aria-label="Cari staff" autocomplete="off">
      <div class="pick-list" role="listbox"></div>`;
    const input = root.querySelector(".picker-q");
    const list = root.querySelector(".pick-list");

    function paint() {
      const q = input.value.trim().toLowerCase();
      list.replaceChildren();
      const people = [...CC.staff.values()]
        .filter((p) => !skip.has(p.id) && p.is_active !== false)
        .filter((p) => !q || (p.full_name + " " + p.role + " " + p.staff_code).toLowerCase().includes(q))
        .sort((a, b) => a.full_name.localeCompare(b.full_name, "id"));
      if (!people.length) {
        list.append(CC.h("div", "pick-empty", "Staff tidak ditemukan"));
        return;
      }
      for (const p of people) {
        const row = CC.h("button", "pick-row" + (selected.has(p.id) ? " on" : ""));
        row.type = "button";
        row.setAttribute("role", "option");
        const text = CC.h("span", "pick-name");
        text.append(CC.h("strong", null, p.full_name), CC.h("small", null, p.role));
        row.append(CC.avatarEl(p, "mention-av"), text, CC.h("span", "tick"));
        row.addEventListener("click", () => {
          if (!multi) { if (onPick) onPick(p.id); return; }
          if (selected.has(p.id)) selected.delete(p.id);
          else selected.add(p.id);
          row.classList.toggle("on", selected.has(p.id));
          if (onChange) onChange([...selected]);
        });
        list.append(row);
      }
    }

    input.addEventListener("input", paint);
    paint();
    return { el: root, selected: () => [...selected], refresh: paint };
  };
})();
