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

  const outline = document.createElement('div');
  outline.className = 'cms-outline';
  outline.classList.add('cms-ui');
  document.body.appendChild(outline);

  const toggleButton = document.createElement('button');
  toggleButton.id = 'cms-toggle';
  toggleButton.textContent = 'Edit';
  toggleButton.classList.add('cms-ui');
  document.body.appendChild(toggleButton);

  const sidebar = document.createElement('aside');
  sidebar.id = 'cms-sidebar';
  sidebar.classList.add('cms-ui');
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
      <div class="cms-publish">
        <button type="button" id="cms-publish">Publish static site</button>
        <p class="cms-pill cms-pill--subtle">Merges all pages into /published without editor assets</p>
      </div>
      <p class="cms-pill">Click text or images while editing</p>
    </div>
    <div class="cms-sidebar__body">
      <div class="cms-accordion" data-accordion>
        <div class="cms-accordion__item" data-accordion-item>
          <button class="cms-accordion__toggle" type="button" data-accordion-toggle aria-expanded="false">
            Settings
          </button>
          <div class="cms-accordion__panel" data-accordion-panel hidden>
            <div class="cms-field cms-field--file">
              <label for="cms-file">HTML files</label>
              <select id="cms-file"></select>
            </div>
            <div class="cms-field">
              <label for="cms-site-name">Site name</label>
              <input id="cms-site-name" type="text" placeholder="Results Marketing" />
            </div>
          </div>
        </div>
        <div class="cms-accordion__item cms-accordion__item--open" data-accordion-item data-accordion-open>
          <button class="cms-accordion__toggle" type="button" data-accordion-toggle aria-expanded="true">
            Content Updates
          </button>
          <div class="cms-accordion__panel" data-accordion-panel>
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
            <div class="cms-field">
              <label for="cms-link">Link</label>
              <input id="cms-link" type="url" placeholder="https://example.com" />
            </div>
            <div class="cms-field cms-field--text">
              <label for="cms-value">Content</label>
              <textarea id="cms-value" placeholder="Type content here..."></textarea>
            </div>
            <div class="cms-field cms-field--image">
              <label for="cms-image-url">Image URL</label>
              <input id="cms-image-url" type="url" placeholder="https://example.com/image.png" />
              <div class="cms-upload">
                <button class="cms-upload__button" type="button">Browse gallery</button>
                <label class="cms-upload__label" for="cms-image-file">Choose file</label>
                <input id="cms-image-file" type="file" accept="image/*" />
              </div>
              <div id="cms-image-preview" class="cms-image-preview">No image selected</div>
            </div>
            <button id="cms-save">Save</button>
            <button id="cms-delete" type="button">Delete element</button>
            <div id="cms-message"></div>
          </div>
        </div>
        <div class="cms-accordion__item" data-accordion-item>
          <button class="cms-accordion__toggle" type="button" data-accordion-toggle aria-expanded="false">
            Discovered
          </button>
          <div class="cms-accordion__panel" data-accordion-panel hidden>
            <div class="cms-hint">Existing keys on the page</div>
            <p id="cms-empty">No tagged elements yet.</p>
            <ul class="cms-list" id="cms-list"></ul>
          </div>
        </div>
        <div class="cms-accordion__item" data-accordion-item>
          <button class="cms-accordion__toggle" type="button" data-accordion-toggle aria-expanded="false">
            Colors
          </button>
          <div class="cms-accordion__panel" data-accordion-panel hidden>
            <div class="cms-field">
              <label for="cms-color">Element color</label>
              <input id="cms-color" type="color" value="#111827" />
            </div>
          </div>
        </div>
        <div class="cms-accordion__item" data-accordion-item>
          <button class="cms-accordion__toggle" type="button" data-accordion-toggle aria-expanded="false">
            Effects
          </button>
          <div class="cms-accordion__panel" data-accordion-panel hidden>
            <div class="cms-field">
              <label for="cms-effect">Effect</label>
              <select id="cms-effect">
                <option value="none">None</option>
                <option value="shadow">Shadow</option>
                <option value="zoom">Zoom</option>
                <option value="fade">Fade In on Scroll Into View</option>
                <option value="slide-left">Slide In From Left on Scroll Into View</option>
                <option value="slide-right">Slide In From Right on Scroll Into View</option>
              </select>
            </div>
          </div>
        </div>
        <div class="cms-accordion__item" data-accordion-item>
          <button class="cms-accordion__toggle" type="button" data-accordion-toggle aria-expanded="false">
            Wireframe
          </button>
          <div class="cms-accordion__panel" data-accordion-panel hidden>
            <button class="cms-button" id="cms-wireframe" type="button">Wireframe Off</button>
          </div>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(sidebar);

  const keyInput = sidebar.querySelector('#cms-key');
  const linkInput = sidebar.querySelector('#cms-link');
  const valueInput = sidebar.querySelector('#cms-value');
  const typeInputs = sidebar.querySelectorAll('input[name="cms-type"]');
  const imageUrlInput = sidebar.querySelector('#cms-image-url');
  const imageFileInput = sidebar.querySelector('#cms-image-file');
  const imagePreview = sidebar.querySelector('#cms-image-preview');
  const saveButton = sidebar.querySelector('#cms-save');
  const deleteButton = sidebar.querySelector('#cms-delete');
  const publishButton = sidebar.querySelector('#cms-publish');
  const colorInput = sidebar.querySelector('#cms-color');
  const effectSelect = sidebar.querySelector('#cms-effect');
  const wireframeButton = sidebar.querySelector('#cms-wireframe');
  const messageEl = sidebar.querySelector('#cms-message');
  const listEl = sidebar.querySelector('#cms-list');
  const emptyEl = sidebar.querySelector('#cms-empty');
  const fileSelect = sidebar.querySelector('#cms-file');
  const siteNameInput = sidebar.querySelector('#cms-site-name');
  const dockButtons = sidebar.querySelectorAll('.cms-dock__buttons button');
  const accordionToggles = sidebar.querySelectorAll('[data-accordion-toggle]');
  const accordionItems = sidebar.querySelectorAll('[data-accordion-item]');

  let sidebarPosition = localStorage.getItem(POSITION_STORAGE_KEY) || 'right';
  deleteButton.disabled = true;
  let wireframeEnabled = localStorage.getItem('cmsWireframeEnabled') === 'true';
  let siteName = '';
  let effectObserver = null;
  const scrollEffects = new Set(['fade', 'slide-left', 'slide-right']);

  function applySidebarPosition() {
    sidebar.classList.remove('cms-pos-left', 'cms-pos-right', 'cms-pos-top', 'cms-pos-bottom');
    sidebar.classList.add(`cms-pos-${sidebarPosition}`);
    dockButtons.forEach((btn) => btn.classList.toggle('active', btn.dataset.pos === sidebarPosition));
  }

  function setAccordionState(item, isOpen) {
    const panel = item.querySelector('[data-accordion-panel]');
    const toggle = item.querySelector('[data-accordion-toggle]');
    item.classList.toggle('cms-accordion__item--open', isOpen);
    toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    if (panel) {
      panel.hidden = !isOpen;
    }
  }

  function handleAccordionToggle(targetItem) {
    accordionItems.forEach((item) => {
      setAccordionState(item, item === targetItem);
    });
  }

  function initAccordion() {
    let openItem = Array.from(accordionItems).find((item) => item.hasAttribute('data-accordion-open'));
    if (!openItem) {
      openItem = accordionItems[0];
    }
    accordionItems.forEach((item) => {
      const shouldOpen = item === openItem;
      setAccordionState(item, shouldOpen);
    });
    accordionToggles.forEach((toggle) => {
      toggle.addEventListener('click', () => {
        const item = toggle.closest('[data-accordion-item]');
        if (item) handleAccordionToggle(item);
      });
    });
  }

  function setWireframeState(enabled) {
    wireframeEnabled = enabled;
    document.body.classList.toggle('cms-wireframe', enabled);
    wireframeButton.textContent = `Wireframe ${enabled ? 'On' : 'Off'}`;
    localStorage.setItem('cmsWireframeEnabled', enabled ? 'true' : 'false');
  }

  function getEffectValue(el) {
    return el?.dataset?.cmsEffect || 'none';
  }

  function clearEffects(el) {
    if (!el) return;
    el.classList.remove(
      'cms-effect-shadow',
      'cms-effect-zoom',
      'cms-effect-scroll',
      'cms-effect-active'
    );
    el.removeAttribute('data-cms-effect');
    if (effectObserver) {
      effectObserver.unobserve(el);
    }
  }

  function applyEffect(el, effect) {
    if (!el) return;
    clearEffects(el);
    if (!effect || effect === 'none') return;
    el.dataset.cmsEffect = effect;
    if (scrollEffects.has(effect)) {
      el.classList.add('cms-effect-scroll');
      if (!effectObserver) {
        effectObserver = new IntersectionObserver(
          (entries) => {
            entries.forEach((entry) => {
              if (entry.isIntersecting) {
                entry.target.classList.add('cms-effect-active');
              }
            });
          },
          { threshold: 0.2 }
        );
      }
      effectObserver.observe(el);
      return;
    }
    if (effect === 'shadow') {
      el.classList.add('cms-effect-shadow');
    }
    if (effect === 'zoom') {
      el.classList.add('cms-effect-zoom');
    }
  }

  function updateColorPicker(el) {
    if (!el) return;
    const color = window.getComputedStyle(el).color;
    if (!color) return;
    const rgbMatch = color.match(/\d+/g);
    if (rgbMatch && rgbMatch.length >= 3) {
      const [r, g, b] = rgbMatch.map((value) => parseInt(value, 10));
      const hex = `#${[r, g, b]
        .map((channel) => channel.toString(16).padStart(2, '0'))
        .join('')}`;
      colorInput.value = hex;
    }
  }

  applySidebarPosition();

  function clearForm() {
    keyInput.value = '';
    linkInput.value = '';
    valueInput.value = '';
    imageUrlInput.value = '';
    imageFileInput.value = '';
    imagePreview.textContent = 'No image selected';
    imagePreview.style.backgroundImage = 'none';
    colorInput.value = '#111827';
    effectSelect.value = 'none';
    deleteButton.disabled = true;
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

  function sanitizeSiteName(name = '') {
    return String(name || '')
      .toLowerCase()
      .replace(/\s+/g, '')
      .trim();
  }

  function updateSiteName(value = '') {
    siteName = sanitizeSiteName(value);
    siteNameInput.value = siteName;
    if (!siteName) {
      siteNameInput.placeholder = 'required for publishing';
    }
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
    updateColorPicker(el);
    effectSelect.value = getEffectValue(el);
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
    const linkValue = el.getAttribute('data-link') || (el.tagName === 'A' ? el.getAttribute('href') : '');
    linkInput.value = linkValue || '';
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

  async function saveSelection() {
    if (!selectedElement) {
      messageEl.textContent = 'Click a text, image, or background element to edit it.';
      messageEl.style.color = '#ef4444';
      return;
    }
    if (selectedType === 'text') {
      valueInput.value = selectedElement.textContent;
    }
    const key = keyInput.value.trim();
    const linkValue = linkInput.value.trim();
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
    const originalOuterHTML = selectedElement.outerHTML;

    if (uniqueKey !== key) {
      messageEl.textContent = `Key exists. Saved as ${uniqueKey}.`;
    } else {
      clearMessage();
    }

    selectedElement.setAttribute(attributeName, uniqueKey);
    if (linkValue) {
      selectedElement.setAttribute('data-link', linkValue);
    } else {
      selectedElement.removeAttribute('data-link');
    }
    if (selectedElement.tagName !== 'IMG') {
      selectedElement.style.color = colorInput.value;
    }
    applyEffect(selectedElement, effectSelect.value);
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
    const updatedOuterHTML = selectedElement.outerHTML;

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
          link: linkValue,
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

  async function persistSiteName() {
    const desiredName = sanitizeSiteName(siteNameInput.value);
    if (!desiredName) {
      messageEl.textContent = 'Enter a site name (lowercase, no spaces) before saving.';
      messageEl.style.color = '#ef4444';
      siteNameInput.focus();
      return;
    }
    try {
      const res = await fetch(buildApiUrl(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteName: desiredName, file: currentFile }),
      });
      if (!res.ok) {
        throw new Error('Save failed');
      }
      const data = await res.json();
      updateSiteName(data.siteName || desiredName);
      messageEl.textContent = 'Site name saved.';
      messageEl.style.color = '#16a34a';
    } catch (err) {
      messageEl.textContent = 'Unable to save site name.';
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
        updateSiteName(data.siteName || '');
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
  siteNameInput.addEventListener('change', persistSiteName);
  siteNameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      persistSiteName();
    }
  });
  colorInput.addEventListener('input', () => {
    if (!selectedElement) return;
    if (selectedElement.tagName !== 'IMG') {
      selectedElement.style.color = colorInput.value;
    }
  });
  effectSelect.addEventListener('change', (e) => {
    if (!selectedElement) return;
    applyEffect(selectedElement, e.target.value);
  });
  wireframeButton.addEventListener('click', () => {
    setWireframeState(!wireframeEnabled);
  });
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

  document.addEventListener('DOMContentLoaded', () => {
    loadFiles();
    applySidebarPosition();
    initAccordion();
    setWireframeState(wireframeEnabled);
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
