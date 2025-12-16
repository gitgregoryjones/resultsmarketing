(function () {
  const API_ENDPOINT = '/api/content';
  let mergedContent = {};
  let editMode = false;
  let selectedElement = null;

  const outline = document.createElement('div');
  outline.className = 'cms-outline';
  document.body.appendChild(outline);

  const toggleButton = document.createElement('button');
  toggleButton.id = 'cms-toggle';
  toggleButton.textContent = 'Edit';
  document.body.appendChild(toggleButton);

  const sidebar = document.createElement('aside');
  sidebar.id = 'cms-sidebar';
  sidebar.innerHTML = `
    <div class="cms-sidebar__header">
      <div class="cms-sidebar__title">Inline CMS</div>
      <p class="cms-pill">Click any text while editing</p>
    </div>
    <div class="cms-sidebar__body">
      <div class="cms-field">
        <label for="cms-key">Field key</label>
        <input id="cms-key" type="text" placeholder="auto.tag.hash" />
      </div>
      <div class="cms-field">
        <label for="cms-value">Content</label>
        <textarea id="cms-value" placeholder="Type content here..."></textarea>
      </div>
      <button id="cms-save">Save</button>
      <div id="cms-message"></div>
      <div class="cms-hint">Existing keys on the page</div>
      <h4 class="cms-sidebar__list-title">Discovered</h4>
      <p id="cms-empty">No tagged elements yet.</p>
      <ul class="cms-list" id="cms-list"></ul>
    </div>
  `;
  document.body.appendChild(sidebar);

  const keyInput = sidebar.querySelector('#cms-key');
  const valueInput = sidebar.querySelector('#cms-value');
  const saveButton = sidebar.querySelector('#cms-save');
  const messageEl = sidebar.querySelector('#cms-message');
  const listEl = sidebar.querySelector('#cms-list');
  const emptyEl = sidebar.querySelector('#cms-empty');

  function clearForm() {
    keyInput.value = '';
    valueInput.value = '';
  }

  function clearMessage() {
    messageEl.textContent = '';
    messageEl.style.color = '#16a34a';
  }

  function removeOutlines() {
    document.querySelectorAll('.cms-outlined').forEach((el) => {
      el.classList.remove('cms-outlined');
    });
    outline.style.display = 'none';
  }

  function positionOutline(target) {
    const rect = target.getBoundingClientRect();
    outline.style.display = 'block';
    outline.style.width = `${rect.width}px`;
    outline.style.height = `${rect.height}px`;
    outline.style.left = `${rect.left + window.scrollX}px`;
    outline.style.top = `${rect.top + window.scrollY}px`;
  }

  function isCmsUi(element) {
    return element.closest && element.closest('#cms-sidebar, #cms-toggle, .cms-outline');
  }

  function handleHover(e) {
    if (!editMode) return;
    const target = e.target;
    if (isCmsUi(target) || !target.textContent.trim()) {
      outline.style.display = 'none';
      return;
    }
    positionOutline(target);
  }

  function toggleEdit() {
    editMode = !editMode;
    toggleButton.textContent = editMode ? 'Done' : 'Edit';
    sidebar.classList.toggle('open', editMode);
    outline.style.display = editMode ? 'block' : 'none';
    if (!editMode) {
      selectedElement = null;
      clearMessage();
      clearForm();
      removeOutlines();
    }
  }

  function getExistingKeys() {
    return Array.from(document.querySelectorAll('[data-cms-text]'))
      .map((el) => el.getAttribute('data-cms-text'))
      .filter(Boolean);
  }

  function ensureUniqueKey(base, currentKey) {
    const existing = new Set([...getExistingKeys(), ...Object.keys(mergedContent)]);
    if (currentKey) existing.delete(currentKey);
    if (!existing.has(base)) return base;
    let i = 2;
    let candidate = `${base}-${i}`;
    while (existing.has(candidate)) {
      i += 1;
      candidate = `${base}-${i}`;
    }
    return candidate;
  }

  function generateKeySuggestion(el) {
    const tag = el.tagName.toLowerCase();
    const hash = Math.random().toString(36).slice(2, 6);
    return ensureUniqueKey(`auto.${tag}.${hash}`);
  }

  function selectElement(el) {
    removeOutlines();
    selectedElement = el;
    el.classList.add('cms-outlined');
    positionOutline(el);

    const key = el.getAttribute('data-cms-text') || generateKeySuggestion(el);
    const value = el.textContent.trim();
    keyInput.value = key;
    valueInput.value = mergedContent[key] ?? value;
  }

  function refreshList() {
    const keys = getExistingKeys();
    listEl.innerHTML = '';
    emptyEl.style.display = keys.length ? 'none' : 'block';
    keys.forEach((key) => {
      const item = document.createElement('li');
      const label = document.createElement('span');
      label.textContent = key;
      const editBtn = document.createElement('button');
      editBtn.textContent = 'Edit';
      editBtn.addEventListener('click', () => {
        const el = document.querySelector(`[data-cms-text="${CSS.escape(key)}"]`);
        if (el) selectElement(el);
      });
      item.appendChild(label);
      item.appendChild(editBtn);
      listEl.appendChild(item);
    });
  }

  function buildElementPath(el) {
    const segments = [];
    let node = el;
    while (node && node.nodeType === 1 && node !== document.body) {
      const siblings = Array.from(node.parentNode.children);
      const index = siblings.indexOf(node) + 1;
      segments.unshift(`${node.tagName.toLowerCase()}:nth-child(${index})`);
      node = node.parentNode;
    }
    return segments.length ? `body > ${segments.join(' > ')}` : '';
  }

  async function saveSelection() {
    if (!selectedElement) {
      messageEl.textContent = 'Click a text element to edit it.';
      messageEl.style.color = '#ef4444';
      return;
    }
    const key = keyInput.value.trim();
    const value = valueInput.value;
    if (!key) {
      messageEl.textContent = 'Key is required.';
      messageEl.style.color = '#ef4444';
      return;
    }

    const currentKey = selectedElement.getAttribute('data-cms-text');
    const uniqueKey = ensureUniqueKey(key, currentKey);
    const originalOuterHTML = selectedElement.outerHTML;

    if (uniqueKey !== key) {
      messageEl.textContent = `Key exists. Saved as ${uniqueKey}.`;
    } else {
      clearMessage();
    }

    selectedElement.setAttribute('data-cms-text', uniqueKey);
    selectedElement.textContent = value;
    const path = buildElementPath(selectedElement);
    const updatedOuterHTML = selectedElement.outerHTML;

    try {
      const res = await fetch(API_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: uniqueKey, value, path, originalOuterHTML, updatedOuterHTML }),
      });
      if (!res.ok) {
        throw new Error('Save failed');
      }
      const data = await res.json();
      mergedContent = data.content || mergedContent;
      refreshList();
    } catch (err) {
      messageEl.textContent = 'Unable to save content to the server.';
      messageEl.style.color = '#ef4444';
    }
  }

  function handleClick(e) {
    if (!editMode) return;
    const target = e.target;
    if (isCmsUi(target)) return;
    if (!target.textContent.trim()) {
      messageEl.textContent = 'Select an element that contains text.';
      messageEl.style.color = '#ef4444';
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    selectElement(target);
  }

  function applyContent() {
    document.querySelectorAll('[data-cms-text]').forEach((el) => {
      const key = el.getAttribute('data-cms-text');
      if (key && mergedContent[key] !== undefined) {
        el.textContent = mergedContent[key];
      }
    });
    refreshList();
  }

  async function hydrate() {
    try {
      const res = await fetch(API_ENDPOINT);
      if (res.ok) {
        const data = await res.json();
        mergedContent = data.content || {};
      }
      applyContent();
    } catch (err) {
      console.warn('Hydration failed', err);
    }
  }

  toggleButton.addEventListener('click', toggleEdit);
  document.addEventListener('mouseover', handleHover, true);
  document.addEventListener('click', handleClick, true);
  saveButton.addEventListener('click', saveSelection);

  document.addEventListener('DOMContentLoaded', hydrate);
})();
