(function () {
  const API_ENDPOINT = '/api/content';
  const FILES_ENDPOINT = '/api/files';
  const params = new URLSearchParams(window.location.search);
  const pathFile = (() => {
    const pathName = window.location.pathname || '/';
    if (pathName === '/' || pathName === '') return 'index.html';
    const trimmed = pathName.replace(/^\//, '');
    return trimmed.toLowerCase().endsWith('.html') ? trimmed : `${trimmed}.html`;
  })();
  const currentFile = params.get('file') || pathFile;
  let mergedContent = {};
  let storedTags = {};
  let editMode = false;
  let selectedElement = null;
  let selectedType = 'text';
  let inlineInputHandler = null;
  const HOVER_CLASS_MAP = {
    lift: 'cms-hover-lift',
    glow: 'cms-hover-glow',
    zoom: 'cms-hover-zoom',
    shadow: 'cms-hover-shadow',
  };
  const HOVER_CLASSES = Object.values(HOVER_CLASS_MAP);

  const outline = document.createElement('div');
  outline.className = 'cms-outline';
  document.body.appendChild(outline);

  const toggleButton = document.createElement('button');
  toggleButton.id = 'cms-toggle';
  toggleButton.textContent = 'Edit';
  document.body.appendChild(toggleButton);

  const sidebar = document.createElement('aside');
  sidebar.id = 'cms-sidebar';
  const POSITION_STORAGE_KEY = 'cmsSidebarPosition';
  sidebar.innerHTML = `
    <div class="cms-sidebar__header">
      <div class="cms-sidebar__title">Inline CMS</div>
      <div class="cms-dock">
        <span>Dock</span>
        <div class="cms-dock__buttons">
          <button type="button" data-pos="left">Left</button>
          <button type="button" data-pos="top">Top</button>
          <button type="button" data-pos="right" class="active">Right</button>
          <button type="button" data-pos="bottom">Bottom</button>
        </div>
      </div>
      <div class="cms-field cms-field--file">
        <label for="cms-file">HTML file</label>
        <select id="cms-file"></select>
      </div>
      <div class="cms-publish">
        <button type="button" id="cms-publish">Publish static site</button>
        <p class="cms-pill cms-pill--subtle">Merges all pages into /published without editor assets</p>
      </div>
      <p class="cms-pill">Click text or images while editing</p>
    </div>
    <div class="cms-sidebar__body">
      <div class="cms-field">
        <label>Content type</label>
        <div class="cms-type">
          <label class="cms-radio"><input type="radio" name="cms-type" value="text" checked /> Text</label>
          <label class="cms-radio"><input type="radio" name="cms-type" value="image" /> Image</label>
          <label class="cms-radio"><input type="radio" name="cms-type" value="background" /> Background</label>
        </div>
      </div>
      <div class="cms-field">
        <label for="cms-key">Field key</label>
        <input id="cms-key" type="text" placeholder="auto.tag.hash" />
      </div>
      <div class="cms-field cms-field--text">
        <label for="cms-value">Content</label>
        <textarea id="cms-value" placeholder="Type content here..."></textarea>
      </div>
      <div class="cms-field cms-field--image">
        <label for="cms-image-url">Image URL</label>
        <input id="cms-image-url" type="url" placeholder="https://example.com/image.png" />
        <div class="cms-upload">
          <label class="cms-upload__label" for="cms-image-file">Upload image</label>
          <input id="cms-image-file" type="file" accept="image/*" />
        </div>
        <div id="cms-image-preview" class="cms-image-preview">No image selected</div>
      </div>
      <div class="cms-divider"></div>
      <div class="cms-field cms-field--effects">
        <label>Effects &amp; Colors</label>
        <div class="cms-effects">
          <button type="button" id="cms-effect-flip" class="cms-effects__toggle">Flip card</button>
          <button type="button" id="cms-effect-scroll" class="cms-effects__toggle">Scroller</button>
          <div class="cms-effects__row">
            <label for="cms-scroll-height">Scroll height</label>
            <input id="cms-scroll-height" type="number" min="80" step="10" value="240" />
          </div>
          <div class="cms-effects__row">
            <label for="cms-hover-effect">Hover effect</label>
            <select id="cms-hover-effect">
              <option value="none">None</option>
              <option value="lift">Lift</option>
              <option value="glow">Glow</option>
              <option value="zoom">Zoom</option>
              <option value="shadow">Shadow</option>
            </select>
          </div>
          <div class="cms-effects__row cms-effects__colors">
            <button type="button" id="cms-color-dialog-open" class="cms-effects__toggle">Pick colors</button>
            <div class="cms-color-preview" id="cms-color-preview"></div>
          </div>
        </div>
      </div>
      <button id="cms-save">Save</button>
      <button id="cms-delete" type="button">Delete element</button>
      <div id="cms-message"></div>
      <div class="cms-hint">Existing keys on the page</div>
      <h4 class="cms-sidebar__list-title">Discovered</h4>
      <p id="cms-empty">No tagged elements yet.</p>
      <ul class="cms-list" id="cms-list"></ul>
    </div>
  `;
  document.body.appendChild(sidebar);

  const colorDialog = document.createElement('dialog');
  colorDialog.id = 'cms-color-dialog';
  colorDialog.innerHTML = `
    <form method="dialog" class="cms-color-dialog">
      <h3>Colors</h3>
      <label for="cms-color-text">Text color</label>
      <div class="cms-color-row">
        <input type="color" id="cms-color-text" value="#111827" />
        <input type="text" id="cms-color-text-value" placeholder="#111827" />
      </div>
      <label for="cms-color-bg">Background color</label>
      <div class="cms-color-row">
        <input type="color" id="cms-color-bg" value="#ffffff" />
        <input type="text" id="cms-color-bg-value" placeholder="#ffffff" />
      </div>
      <label for="cms-color-border">Border color</label>
      <div class="cms-color-row">
        <input type="color" id="cms-color-border" value="#e5e7eb" />
        <input type="text" id="cms-color-border-value" placeholder="#e5e7eb" />
      </div>
      <div class="cms-color-actions">
        <button type="button" id="cms-color-clear">Clear</button>
        <div class="cms-color-actions__spacer"></div>
        <button type="submit" id="cms-color-close">Close</button>
        <button type="button" id="cms-color-apply">Apply</button>
      </div>
    </form>
  `;
  document.body.appendChild(colorDialog);

  const keyInput = sidebar.querySelector('#cms-key');
  const valueInput = sidebar.querySelector('#cms-value');
  const typeInputs = sidebar.querySelectorAll('input[name="cms-type"]');
  const imageUrlInput = sidebar.querySelector('#cms-image-url');
  const imageFileInput = sidebar.querySelector('#cms-image-file');
  const imagePreview = sidebar.querySelector('#cms-image-preview');
  const saveButton = sidebar.querySelector('#cms-save');
  const deleteButton = sidebar.querySelector('#cms-delete');
  const publishButton = sidebar.querySelector('#cms-publish');
  const messageEl = sidebar.querySelector('#cms-message');
  const listEl = sidebar.querySelector('#cms-list');
  const emptyEl = sidebar.querySelector('#cms-empty');
  const fileSelect = sidebar.querySelector('#cms-file');
  const dockButtons = sidebar.querySelectorAll('.cms-dock__buttons button');
  const effectsFlipButton = sidebar.querySelector('#cms-effect-flip');
  const effectsScrollButton = sidebar.querySelector('#cms-effect-scroll');
  const scrollHeightInput = sidebar.querySelector('#cms-scroll-height');
  const hoverEffectSelect = sidebar.querySelector('#cms-hover-effect');
  const colorDialogOpenButton = sidebar.querySelector('#cms-color-dialog-open');
  const colorPreview = sidebar.querySelector('#cms-color-preview');
  const colorTextInput = colorDialog.querySelector('#cms-color-text');
  const colorTextValueInput = colorDialog.querySelector('#cms-color-text-value');
  const colorBgInput = colorDialog.querySelector('#cms-color-bg');
  const colorBgValueInput = colorDialog.querySelector('#cms-color-bg-value');
  const colorBorderInput = colorDialog.querySelector('#cms-color-border');
  const colorBorderValueInput = colorDialog.querySelector('#cms-color-border-value');
  const colorApplyButton = colorDialog.querySelector('#cms-color-apply');
  const colorClearButton = colorDialog.querySelector('#cms-color-clear');

  let sidebarPosition = localStorage.getItem(POSITION_STORAGE_KEY) || 'right';
  deleteButton.disabled = true;

  function applySidebarPosition() {
    sidebar.classList.remove('cms-pos-left', 'cms-pos-right', 'cms-pos-top', 'cms-pos-bottom');
    sidebar.classList.add(`cms-pos-${sidebarPosition}`);
    dockButtons.forEach((btn) => btn.classList.toggle('active', btn.dataset.pos === sidebarPosition));
  }

  applySidebarPosition();

  function clearForm() {
    keyInput.value = '';
    valueInput.value = '';
    imageUrlInput.value = '';
    imageFileInput.value = '';
    imagePreview.textContent = 'No image selected';
    imagePreview.style.backgroundImage = 'none';
    deleteButton.disabled = true;
    effectsFlipButton.classList.remove('active');
    effectsScrollButton.classList.remove('active');
    scrollHeightInput.value = '240';
    hoverEffectSelect.value = 'none';
    colorPreview.style.background = 'transparent';
  }

  function clearMessage() {
    messageEl.textContent = '';
    messageEl.style.color = '#16a34a';
  }

  function rgbToHex(value) {
    if (!value) return '';
    if (value.startsWith('#')) return value;
    const match = value.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
    if (!match) return '';
    const [_, r, g, b] = match;
    return (
      '#' +
      [r, g, b]
        .map((num) => {
          const hex = Number(num).toString(16);
          return hex.length === 1 ? `0${hex}` : hex;
        })
        .join('')
    );
  }

  function syncColorInputs({ textColor, bgColor, borderColor }) {
    if (textColor) {
      colorTextInput.value = textColor;
      colorTextValueInput.value = textColor;
    }
    if (bgColor) {
      colorBgInput.value = bgColor;
      colorBgValueInput.value = bgColor;
    }
    if (borderColor) {
      colorBorderInput.value = borderColor;
      colorBorderValueInput.value = borderColor;
    }
  }

  function updateColorPreview(textColor, bgColor) {
    const previewBg = bgColor || '#ffffff';
    const previewText = textColor || '#111827';
    colorPreview.style.background = previewBg;
    colorPreview.style.color = previewText;
    colorPreview.textContent = 'Aa';
  }

  function removeOutlines() {
    document.querySelectorAll('.cms-outlined').forEach((el) => {
      el.classList.remove('cms-outlined');
    });
    outline.style.display = 'none';
  }

  function clearInlineEditing() {
    if (!selectedElement) return;
    if (inlineInputHandler) {
      selectedElement.removeEventListener('input', inlineInputHandler);
      inlineInputHandler = null;
    }
    if (selectedElement.isContentEditable) {
      selectedElement.contentEditable = 'false';
    }
  }

  function buildApiUrl() {
    const query = new URLSearchParams();
    query.set('file', currentFile);
    return `${API_ENDPOINT}?${query.toString()}`;
  }

  async function loadFiles() {
    try {
      const res = await fetch(FILES_ENDPOINT);
      if (!res.ok) throw new Error('Unable to fetch files');
      const data = await res.json();
      const files = Array.isArray(data.files) ? data.files : [];
      const existing = new Set(files);
      if (!existing.has(currentFile)) {
        files.push(currentFile);
      }
      fileSelect.innerHTML = '';
      files.forEach((file) => {
        const option = document.createElement('option');
        option.value = file;
        option.textContent = file;
        if (file === currentFile) option.selected = true;
        fileSelect.appendChild(option);
      });
    } catch (err) {
      const fallbackOption = document.createElement('option');
      fallbackOption.value = currentFile;
      fallbackOption.textContent = currentFile;
      fileSelect.innerHTML = '';
      fileSelect.appendChild(fallbackOption);
    }
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

  function getElementTarget(node) {
    if (node && node.nodeType === Node.TEXT_NODE) {
      return node.parentElement;
    }
    return node;
  }

  function handleHover(e) {
    if (!editMode) return;
    const target = getElementTarget(e.target);
    if (!target) return;
    if (isCmsUi(target)) {
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
      clearInlineEditing();
      selectedElement = null;
      clearMessage();
      clearForm();
      removeOutlines();
    }
    deleteButton.disabled = !editMode || !selectedElement;
  }

  function getExistingKeys() {
    return Array.from(document.querySelectorAll('[data-cms-text],[data-cms-image],[data-cms-bg]'))
      .map((el) => {
        if (el.hasAttribute('data-cms-image')) return el.getAttribute('data-cms-image');
        if (el.hasAttribute('data-cms-bg')) return el.getAttribute('data-cms-bg');
        return el.getAttribute('data-cms-text');
      })
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
    const text = (el.textContent || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const base = text ? `${tag}.${text}` : `auto.${tag}`;
    return ensureUniqueKey(base);
  }

  function setTypeSelection(type) {
    typeInputs.forEach((input) => {
      input.checked = input.value === type;
    });
    sidebar.classList.toggle('cms-image-mode', type === 'image' || type === 'background');
    selectedType = type;
    if (!selectedElement) return;
    if (selectedType === 'text' && editMode) {
      enableInlineEditing(selectedElement);
    } else {
      clearInlineEditing();
    }
  }

  function determineElementType(el) {
    if (el.tagName === 'IMG' || el.hasAttribute('data-cms-image')) {
      return 'image';
    }
    if (el.hasAttribute('data-cms-bg')) {
      return 'background';
    }
    const bg = window.getComputedStyle(el).backgroundImage;
    if (bg && bg !== 'none') {
      return 'background';
    }
    return 'text';
  }

  function getHoverEffectFromElement(el) {
    const match = Object.entries(HOVER_CLASS_MAP).find(([, className]) => el.classList.contains(className));
    return match ? match[0] : 'none';
  }

  function updateEffectsControls(el) {
    if (!el) return;
    const computed = window.getComputedStyle(el);
    effectsFlipButton.classList.toggle('active', el.classList.contains('cms-effect-flip'));
    effectsScrollButton.classList.toggle('active', el.classList.contains('cms-effect-scroll'));
    hoverEffectSelect.value = getHoverEffectFromElement(el);
    const scrollHeight = el.getAttribute('data-cms-scroll-height') || el.style.maxHeight;
    if (scrollHeight) {
      const parsedHeight = parseInt(scrollHeight, 10);
      if (!Number.isNaN(parsedHeight)) {
        scrollHeightInput.value = String(parsedHeight);
      }
    }
    const textColor = rgbToHex(computed.color) || '#111827';
    const bgColor = rgbToHex(computed.backgroundColor) || '#ffffff';
    const borderColor = rgbToHex(computed.borderColor) || '#e5e7eb';
    syncColorInputs({ textColor, bgColor, borderColor });
    updateColorPreview(textColor, bgColor);
  }

  function ensureFlipStructure(el) {
    const existing = el.querySelector('.cms-flip-inner');
    if (existing) return;
    const inner = document.createElement('div');
    inner.className = 'cms-flip-inner';
    const front = document.createElement('div');
    front.className = 'cms-flip-front';
    const back = document.createElement('div');
    back.className = 'cms-flip-back';
    while (el.firstChild) {
      front.appendChild(el.firstChild);
    }
    back.textContent = 'Back side';
    inner.appendChild(front);
    inner.appendChild(back);
    el.appendChild(inner);
  }

  function applyHoverEffect(el, effect) {
    HOVER_CLASSES.forEach((className) => el.classList.remove(className));
    if (effect && effect !== 'none' && HOVER_CLASS_MAP[effect]) {
      el.classList.add(HOVER_CLASS_MAP[effect]);
    }
  }

  function applyScrollEffect(el, enabled, height) {
    if (enabled) {
      el.classList.add('cms-effect-scroll');
      el.style.overflow = 'auto';
      el.style.maxHeight = `${height}px`;
      el.setAttribute('data-cms-scroll-height', String(height));
      return;
    }
    el.classList.remove('cms-effect-scroll');
    el.style.overflow = '';
    el.style.maxHeight = '';
    el.removeAttribute('data-cms-scroll-height');
  }

  async function persistElementHtml(originalOuterHTML, updatedOuterHTML) {
    if (!selectedElement) return;
    const key = keyInput.value.trim();
    if (!key) {
      messageEl.textContent = 'Add a key before saving effects.';
      messageEl.style.color = '#ef4444';
      return;
    }
    await saveSelection({ originalOuterHTML, updatedOuterHTML });
  }

  function updateImagePreview(src) {
    if (!src) {
      imagePreview.textContent = 'No image selected';
      imagePreview.style.backgroundImage = 'none';
      return;
    }
    imagePreview.textContent = '';
    imagePreview.style.backgroundImage = `url('${src}')`;
  }

  function getImageValue(el, key, type = 'image') {
    if (key && mergedContent[key]) return mergedContent[key];
    if (type === 'image' && el.tagName === 'IMG') return el.getAttribute('src');
    const bg = window.getComputedStyle(el).backgroundImage;
    if (bg && bg !== 'none') {
      const match = bg.match(/url\(["']?(.*?)["']?\)/);
      return match ? match[1] : '';
    }
    return '';
  }

  async function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function buildImagePayload() {
    const file = imageFileInput.files[0];
    const urlValue = imageUrlInput.value.trim();
    if (file) {
      const data = await readFileAsDataUrl(file);
      updateImagePreview(data);
      return { sourceType: 'upload', data, name: file.name };
    }
    if (urlValue) {
      updateImagePreview(urlValue);
      return { sourceType: 'url', url: urlValue };
    }
    return null;
  }

  function applyImageToElement(el, src, mode = 'image') {
    if (mode === 'background') {
      el.style.backgroundImage = src ? `url('${src}')` : '';
      return;
    }
    if (el.tagName === 'IMG') {
      el.setAttribute('src', src);
      return;
    }
    el.style.backgroundImage = src ? `url('${src}')` : '';
  }

  function enableInlineEditing(el) {
    if (!editMode || selectedType !== 'text') return;
    clearInlineEditing();
    inlineInputHandler = () => {
      valueInput.value = el.textContent;
    };
    el.contentEditable = 'true';
    el.addEventListener('input', inlineInputHandler);
  }

  function selectElement(el) {
    document.querySelectorAll('.cms-outlined').forEach((node) => node.classList.remove('cms-outlined'));
    if (selectedElement && selectedElement !== el) {
      clearInlineEditing();
    }
    selectedElement = el;
    selectedType = determineElementType(el);
    setTypeSelection(selectedType);
    el.classList.add('cms-outlined');
    const attributeName =
      selectedType === 'image'
        ? 'data-cms-image'
        : selectedType === 'background'
          ? 'data-cms-bg'
          : 'data-cms-text';
    const key = el.getAttribute(attributeName);
    const value = selectedType === 'image' || selectedType === 'background'
      ? getImageValue(el, key, selectedType)
      : el.textContent.trim();
    keyInput.value = key || generateKeySuggestion(el);
    if (selectedType === 'image' || selectedType === 'background') {
      const displayValue = mergedContent[key] ?? value;
      imageUrlInput.value = typeof displayValue === 'string' ? displayValue : '';
      updateImagePreview(displayValue);
    } else {
      valueInput.value = mergedContent[key] ?? value;
      enableInlineEditing(el);
      el.focus({ preventScroll: true });
    }
    updateEffectsControls(el);
    deleteButton.disabled = false;
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
        const el = document.querySelector(
          `[data-cms-text="${CSS.escape(key)}"], [data-cms-image="${CSS.escape(key)}"], [data-cms-bg="${CSS.escape(key)}"]`
        );
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

  async function saveSelection(overrides = {}) {
    if (!selectedElement) {
      messageEl.textContent = 'Click a text, image, or background element to edit it.';
      messageEl.style.color = '#ef4444';
      return;
    }
    if (selectedType === 'text') {
      valueInput.value = selectedElement.textContent;
    }
    const key = keyInput.value.trim();
    const value = selectedType === 'image' || selectedType === 'background'
      ? imageUrlInput.value.trim()
      : valueInput.value;
    if (!key) {
      messageEl.textContent = 'Key is required.';
      messageEl.style.color = '#ef4444';
      return;
    }

    const attributeName =
      selectedType === 'image'
        ? 'data-cms-image'
        : selectedType === 'background'
          ? 'data-cms-bg'
          : 'data-cms-text';
    const currentKey = selectedElement.getAttribute(attributeName);
    const uniqueKey = ensureUniqueKey(key, currentKey);
    const originalOuterHTML = overrides.originalOuterHTML || selectedElement.outerHTML;

    if (uniqueKey !== key) {
      messageEl.textContent = `Key exists. Saved as ${uniqueKey}.`;
    } else {
      clearMessage();
    }

    selectedElement.setAttribute(attributeName, uniqueKey);
    let bodyValue = value;
    let imagePayload = null;

    if (selectedType === 'image' || selectedType === 'background') {
      try {
        imagePayload = await buildImagePayload();
      } catch (err) {
        messageEl.textContent = 'Unable to read image file.';
        messageEl.style.color = '#ef4444';
        return;
      }
      if (!imagePayload && !value) {
        messageEl.textContent = 'Provide an image URL or upload a file.';
        messageEl.style.color = '#ef4444';
        return;
      }
      applyImageToElement(
        selectedElement,
        value || (imagePayload && imagePayload.data),
        selectedType === 'background' ? 'background' : 'image'
      );
    } else {
      selectedElement.textContent = value;
    }

    const path = buildElementPath(selectedElement);
    const updatedOuterHTML = overrides.updatedOuterHTML || selectedElement.outerHTML;

    try {
      const res = await fetch(buildApiUrl(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: uniqueKey,
          value: bodyValue,
          path,
          type: selectedType,
          image: imagePayload,
          originalOuterHTML,
          updatedOuterHTML,
          file: currentFile,
        }),
      });
      if (!res.ok) {
        throw new Error('Save failed');
      }
      const data = await res.json();
      mergedContent = data.content || mergedContent;
      storedTags = data.tags || storedTags;
      applyStoredTags(storedTags);
      applyContent();
      refreshList();
    } catch (err) {
      messageEl.textContent = 'Unable to save content to the server.';
      messageEl.style.color = '#ef4444';
    }
  }

  async function deleteSelection() {
    if (!selectedElement) {
      messageEl.textContent = 'Select an element to delete.';
      messageEl.style.color = '#ef4444';
      return;
    }
    const confirmDelete = window.confirm('Delete this element from the page?');
    if (!confirmDelete) return;

    const attributeName =
      selectedType === 'image'
        ? 'data-cms-image'
        : selectedType === 'background'
          ? 'data-cms-bg'
          : 'data-cms-text';
    const key = selectedElement.getAttribute(attributeName);
    const path = buildElementPath(selectedElement);

    try {
      const res = await fetch(buildApiUrl(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          delete: true,
          key,
          path,
          file: currentFile,
        }),
      });
      if (!res.ok) {
        throw new Error('Delete failed');
      }
      const data = await res.json();
      mergedContent = data.content || mergedContent;
      storedTags = data.tags || storedTags;
      clearInlineEditing();
      selectedElement.remove();
      selectedElement = null;
      clearForm();
      removeOutlines();
      applyStoredTags(storedTags);
      applyContent();
      refreshList();
      messageEl.textContent = 'Element deleted.';
      messageEl.style.color = '#16a34a';
    } catch (err) {
      messageEl.textContent = 'Unable to delete element.';
      messageEl.style.color = '#ef4444';
    }
  }

  async function publishStaticSite() {
    const originalLabel = publishButton.textContent;
    publishButton.disabled = true;
    publishButton.textContent = 'Publishing...';
    messageEl.textContent = 'Publishing merged HTML to /published...';
    messageEl.style.color = '#111827';

    try {
      const res = await fetch('/api/publish', { method: 'POST' });
      if (!res.ok) throw new Error('Publish failed');
      const data = await res.json();
      const count = Array.isArray(data.published) ? data.published.length : 0;
      messageEl.textContent = `Published ${count} page${count === 1 ? '' : 's'} to /published.`;
      messageEl.style.color = '#16a34a';
    } catch (err) {
      messageEl.textContent = 'Unable to publish static pages.';
      messageEl.style.color = '#ef4444';
    } finally {
      publishButton.disabled = false;
      publishButton.textContent = originalLabel;
    }
  }

  function handleClick(e) {
    if (!editMode) return;
    const target = getElementTarget(e.target);
    if (!target) return;
    if (isCmsUi(target)) return;
    if (selectedElement === target && target.isContentEditable) {
      return;
    }
    const hasText = target.textContent && target.textContent.trim();
    const type = determineElementType(target);
    if (!hasText && type === 'text') {
      messageEl.textContent = 'Select an element that contains text, an image, or a background.';
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

    document.querySelectorAll('[data-cms-image]').forEach((el) => {
      const key = el.getAttribute('data-cms-image');
      if (key && mergedContent[key] !== undefined) {
        applyImageToElement(el, mergedContent[key]);
      }
    });

    document.querySelectorAll('[data-cms-bg]').forEach((el) => {
      const key = el.getAttribute('data-cms-bg');
      if (key && mergedContent[key] !== undefined) {
        applyImageToElement(el, mergedContent[key], 'background');
      }
    });
    refreshList();
  }

  function applyStoredTags(tags = {}) {
    Object.entries(tags).forEach(([path, entry]) => {
      const key = typeof entry === 'string' ? entry : entry.key;
      const type = typeof entry === 'object' && entry.type ? entry.type : 'text';
      const el = document.querySelector(path);
      if (el && key) {
        if (type === 'image') {
          el.setAttribute('data-cms-image', key);
        } else if (type === 'background') {
          el.setAttribute('data-cms-bg', key);
        } else {
          el.setAttribute('data-cms-text', key);
        }
      }
    });
  }

  async function hydrate() {
    try {
      const res = await fetch(buildApiUrl());
      if (res.ok) {
        const data = await res.json();
        mergedContent = data.content || {};
        storedTags = data.tags || {};
        applyStoredTags(storedTags);
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
  deleteButton.addEventListener('click', deleteSelection);
  publishButton.addEventListener('click', publishStaticSite);
  valueInput.addEventListener('input', (e) => {
    if (!editMode || !selectedElement || selectedType !== 'text') return;
    selectedElement.textContent = e.target.value;
  });
  typeInputs.forEach((input) => {
    input.addEventListener('change', (e) => setTypeSelection(e.target.value));
  });
  fileSelect.addEventListener('change', () => {
    const nextFile = fileSelect.value;
    const nextPath = nextFile === 'index.html' ? '/' : `/${nextFile}`;
    window.location.href = nextPath;
  });
  imageFileInput.addEventListener('change', () => {
    if (imageFileInput.files[0]) {
      const fileUrl = URL.createObjectURL(imageFileInput.files[0]);
      updateImagePreview(fileUrl);
    } else {
      updateImagePreview('');
    }
  });

  function ensureElementSelected(actionLabel) {
    if (!selectedElement) {
      messageEl.textContent = `Select an element to apply ${actionLabel}.`;
      messageEl.style.color = '#ef4444';
      return false;
    }
    return true;
  }

  function ensureDivSelected(actionLabel) {
    if (!ensureElementSelected(actionLabel)) return false;
    if (selectedElement.tagName !== 'DIV') {
      messageEl.textContent = `${actionLabel} works on div elements only.`;
      messageEl.style.color = '#ef4444';
      return false;
    }
    return true;
  }

  effectsFlipButton.addEventListener('click', async () => {
    if (!ensureDivSelected('flip card effects')) return;
    const originalOuterHTML = selectedElement.outerHTML;
    selectedElement.classList.toggle('cms-effect-flip');
    if (selectedElement.classList.contains('cms-effect-flip')) {
      ensureFlipStructure(selectedElement);
    }
    updateEffectsControls(selectedElement);
    const updatedOuterHTML = selectedElement.outerHTML;
    await persistElementHtml(originalOuterHTML, updatedOuterHTML);
  });

  effectsScrollButton.addEventListener('click', async () => {
    if (!ensureDivSelected('scrolling')) return;
    const originalOuterHTML = selectedElement.outerHTML;
    const nextHeight = Number.parseInt(scrollHeightInput.value, 10) || 240;
    const isEnabled = !selectedElement.classList.contains('cms-effect-scroll');
    applyScrollEffect(selectedElement, isEnabled, nextHeight);
    updateEffectsControls(selectedElement);
    const updatedOuterHTML = selectedElement.outerHTML;
    await persistElementHtml(originalOuterHTML, updatedOuterHTML);
  });

  scrollHeightInput.addEventListener('change', async () => {
    if (!selectedElement || !selectedElement.classList.contains('cms-effect-scroll')) return;
    const originalOuterHTML = selectedElement.outerHTML;
    const nextHeight = Number.parseInt(scrollHeightInput.value, 10) || 240;
    applyScrollEffect(selectedElement, true, nextHeight);
    updateEffectsControls(selectedElement);
    const updatedOuterHTML = selectedElement.outerHTML;
    await persistElementHtml(originalOuterHTML, updatedOuterHTML);
  });

  hoverEffectSelect.addEventListener('change', async () => {
    if (!ensureElementSelected('hover effects')) return;
    const originalOuterHTML = selectedElement.outerHTML;
    applyHoverEffect(selectedElement, hoverEffectSelect.value);
    updateEffectsControls(selectedElement);
    const updatedOuterHTML = selectedElement.outerHTML;
    await persistElementHtml(originalOuterHTML, updatedOuterHTML);
  });

  colorDialogOpenButton.addEventListener('click', () => {
    if (!ensureElementSelected('colors')) return;
    updateEffectsControls(selectedElement);
    if (typeof colorDialog.showModal === 'function') {
      colorDialog.showModal();
    } else {
      colorDialog.setAttribute('open', 'true');
    }
  });

  function syncColorField(colorInput, textInput) {
    const value = textInput.value.trim();
    if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value)) {
      colorInput.value = value;
    }
  }

  colorTextInput.addEventListener('input', () => {
    colorTextValueInput.value = colorTextInput.value;
  });
  colorBgInput.addEventListener('input', () => {
    colorBgValueInput.value = colorBgInput.value;
  });
  colorBorderInput.addEventListener('input', () => {
    colorBorderValueInput.value = colorBorderInput.value;
  });
  colorTextValueInput.addEventListener('input', () => syncColorField(colorTextInput, colorTextValueInput));
  colorBgValueInput.addEventListener('input', () => syncColorField(colorBgInput, colorBgValueInput));
  colorBorderValueInput.addEventListener('input', () => syncColorField(colorBorderInput, colorBorderValueInput));

  colorApplyButton.addEventListener('click', async () => {
    if (!ensureElementSelected('colors')) return;
    const originalOuterHTML = selectedElement.outerHTML;
    selectedElement.style.color = colorTextInput.value;
    selectedElement.style.backgroundColor = colorBgInput.value;
    selectedElement.style.borderColor = colorBorderInput.value;
    updateEffectsControls(selectedElement);
    const updatedOuterHTML = selectedElement.outerHTML;
    await persistElementHtml(originalOuterHTML, updatedOuterHTML);
  });

  colorClearButton.addEventListener('click', async () => {
    if (!ensureElementSelected('colors')) return;
    const originalOuterHTML = selectedElement.outerHTML;
    selectedElement.style.color = '';
    selectedElement.style.backgroundColor = '';
    selectedElement.style.borderColor = '';
    updateEffectsControls(selectedElement);
    const updatedOuterHTML = selectedElement.outerHTML;
    await persistElementHtml(originalOuterHTML, updatedOuterHTML);
  });

  document.addEventListener('DOMContentLoaded', () => {
    loadFiles();
    applySidebarPosition();
    hydrate();
  });

  dockButtons.forEach((button) => {
    button.addEventListener('click', () => {
      sidebarPosition = button.dataset.pos;
      localStorage.setItem(POSITION_STORAGE_KEY, sidebarPosition);
      applySidebarPosition();
    });
  });
})();
