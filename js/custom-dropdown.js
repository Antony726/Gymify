const openDropdowns = new Set();

document.addEventListener("click", () => {
  openDropdowns.forEach((close) => close());
});

export function refreshCustomDropdown(selectEl) {
  selectEl?._customDropdownApi?.refresh();
}

export function initCustomDropdown(selectEl) {
  if (!selectEl || selectEl.dataset.customDropdown === "true") {
    return selectEl?._customDropdownApi;
  }

  selectEl.dataset.customDropdown = "true";

  const wrapper = document.createElement("div");
  wrapper.className = "custom-dropdown";

  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "dropdown-trigger";
  trigger.innerHTML = '<span class="dropdown-label"></span><span class="arrow" aria-hidden="true">▼</span>';

  const list = document.createElement("div");
  list.className = "dropdown-list";
  list.setAttribute("role", "listbox");

  selectEl.classList.add("custom-dropdown-native");

  selectEl.parentNode.insertBefore(wrapper, selectEl);
  wrapper.appendChild(trigger);
  wrapper.appendChild(list);
  wrapper.appendChild(selectEl);

  const close = () => {
    list.classList.remove("open");
    trigger.classList.remove("open");
    openDropdowns.delete(close);
  };

  const updateLabel = () => {
    const selected = selectEl.options[selectEl.selectedIndex];
    trigger.querySelector(".dropdown-label").textContent =
      selected?.textContent?.trim() || "Select...";

    list.querySelectorAll(".dropdown-item").forEach((item) => {
      item.classList.toggle("selected", item.dataset.value === selectEl.value);
    });
  };

  const refresh = () => {
    list.innerHTML = "";

    Array.from(selectEl.options).forEach((opt) => {
      const item = document.createElement("div");
      item.className = "dropdown-item";
      item.setAttribute("role", "option");
      item.dataset.value = opt.value;
      item.textContent = opt.textContent;
      if (opt.value === selectEl.value) item.classList.add("selected");

      item.addEventListener("click", (e) => {
        e.stopPropagation();
        selectEl.value = opt.value;
        updateLabel();
        selectEl.dispatchEvent(new Event("change", { bubbles: true }));
        close();
      });

      list.appendChild(item);
    });

    updateLabel();
  };

  trigger.addEventListener("click", (e) => {
    e.stopPropagation();
    const isOpen = list.classList.contains("open");
    openDropdowns.forEach((fn) => fn());
    if (!isOpen) {
      list.classList.add("open");
      trigger.classList.add("open");
      openDropdowns.add(close);
    }
  });

  list.addEventListener("click", (e) => e.stopPropagation());

  refresh();

  const api = { refresh, updateLabel };
  selectEl._customDropdownApi = api;
  return api;
}

export function enhanceAllSelects(root = document) {
  root.querySelectorAll('select:not([data-skip-custom-dropdown]):not([data-custom-dropdown="true"])')
    .forEach(initCustomDropdown);
}
