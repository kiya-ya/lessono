const _filterComboboxes = new Map();

function filterComboboxText(value) {
  return String(value || '').trim().toLocaleLowerCase();
}

function closeFilterCombobox(state, restore = true) {
  if (!state) return;
  state.root.classList.remove('is-open');
  state.input.setAttribute('aria-expanded', 'false');
  if (restore) syncFilterCombobox(state.select);
}

function closeOtherFilterComboboxes(current) {
  _filterComboboxes.forEach(state => {
    if (state !== current) closeFilterCombobox(state);
  });
}

function renderFilterComboboxOptions(state, query = '') {
  const needle = filterComboboxText(query);
  const options = Array.from(state.select.options)
    .map((option, index) => ({ option, index }))
    .filter(({ option }) => !needle || filterComboboxText(option.textContent).includes(needle));

  state.list.replaceChildren();
  state.activeIndex = -1;

  if (!options.length) {
    const empty = document.createElement('div');
    empty.className = 'wb-combobox-empty';
    empty.textContent = '没有匹配项';
    state.list.append(empty);
    return;
  }

  options.forEach(({ option, index }) => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'wb-combobox-option';
    item.setAttribute('role', 'option');
    item.dataset.optionIndex = String(index);
    item.textContent = option.textContent;
    const selected = index === state.select.selectedIndex;
    item.setAttribute('aria-selected', String(selected));
    if (selected) item.classList.add('is-selected');
    item.addEventListener('mousedown', event => event.preventDefault());
    item.addEventListener('click', () => chooseFilterComboboxOption(state, index));
    state.list.append(item);
  });
}

function openFilterCombobox(state, showAll = false) {
  closeOtherFilterComboboxes(state);
  state.root.classList.add('is-open');
  state.input.setAttribute('aria-expanded', 'true');
  renderFilterComboboxOptions(state, showAll ? '' : state.input.value);
}

function chooseFilterComboboxOption(state, optionIndex) {
  if (!state.select.options[optionIndex]) return;
  state.select.selectedIndex = optionIndex;
  syncFilterCombobox(state.select);
  closeFilterCombobox(state, false);
  state.select.dispatchEvent(new Event('change', { bubbles: true }));
  state.input.focus();
}

function moveFilterComboboxActive(state, direction) {
  const items = Array.from(state.list.querySelectorAll('.wb-combobox-option'));
  if (!items.length) return;
  state.activeIndex = (state.activeIndex + direction + items.length) % items.length;
  items.forEach((item, index) => item.classList.toggle('is-active', index === state.activeIndex));
  items[state.activeIndex].scrollIntoView({ block: 'nearest' });
}

function syncFilterCombobox(selectOrId) {
  const select = typeof selectOrId === 'string'
    ? document.getElementById(selectOrId)
    : selectOrId;
  const state = select && _filterComboboxes.get(select.id);
  if (!state) return;
  const selected = select.options[select.selectedIndex];
  state.input.value = selected ? selected.textContent : '';
  state.input.title = selected ? selected.textContent : '';
  if (state.root.classList.contains('is-open')) {
    renderFilterComboboxOptions(state, state.input.value);
  }
}

function initFilterCombobox(selectId, label) {
  const select = document.getElementById(selectId);
  if (!select || _filterComboboxes.has(selectId)) return;

  const root = document.createElement('div');
  root.className = `wb-combobox wb-combobox--${selectId.replace('-select', '')}`;

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'wb-combobox-input';
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-expanded', 'false');
  input.setAttribute('aria-label', `${label}，可输入关键词搜索`);
  input.placeholder = `搜索${label}`;

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'wb-combobox-toggle';
  toggle.setAttribute('aria-label', `展开${label}选项`);
  toggle.innerHTML = '<span aria-hidden="true"></span>';

  const list = document.createElement('div');
  list.className = 'wb-combobox-list';
  list.id = `${selectId}-search-list`;
  list.setAttribute('role', 'listbox');
  input.setAttribute('aria-controls', list.id);

  select.parentNode.insertBefore(root, select);
  root.append(input, toggle, list, select);
  select.classList.add('wb-native-filter-select');
  select.tabIndex = -1;
  select.setAttribute('aria-hidden', 'true');

  const state = { select, root, input, toggle, list, activeIndex: -1 };
  _filterComboboxes.set(selectId, state);

  input.addEventListener('focus', () => openFilterCombobox(state, true));
  input.addEventListener('input', () => openFilterCombobox(state));
  input.addEventListener('keydown', event => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!root.classList.contains('is-open')) openFilterCombobox(state, true);
      moveFilterComboboxActive(state, event.key === 'ArrowDown' ? 1 : -1);
    } else if (event.key === 'Enter' && state.activeIndex >= 0) {
      event.preventDefault();
      const items = list.querySelectorAll('.wb-combobox-option');
      const item = items[state.activeIndex];
      if (item) chooseFilterComboboxOption(state, Number(item.dataset.optionIndex));
    } else if (event.key === 'Escape') {
      closeFilterCombobox(state);
      input.blur();
    }
  });
  toggle.addEventListener('click', () => {
    if (root.classList.contains('is-open')) {
      closeFilterCombobox(state);
    } else {
      input.focus();
      openFilterCombobox(state, true);
    }
  });
  select.addEventListener('change', () => syncFilterCombobox(select));

  const observer = new MutationObserver(() => syncFilterCombobox(select));
  observer.observe(select, { childList: true, subtree: true });
  syncFilterCombobox(select);
}

function initSearchableHallFilters() {
  initFilterCombobox('type-select', '类型');
  initFilterCombobox('group-select', '组');
  initFilterCombobox('hall-select', '大厅');

  document.addEventListener('pointerdown', event => {
    _filterComboboxes.forEach(state => {
      if (!state.root.contains(event.target)) closeFilterCombobox(state);
    });
  });
}
