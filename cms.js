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
  let backendServices = [];
  let backendServiceData = null;
  let backendServiceAlias = '';
  let backendPendingKey = '';

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
    </div>
    <div class="cms-sidebar__body">
      <div class="cms-tabs">
        <button type="button" data-tab="wireframe">Wireframe</button>
        <button type="button" class="active" data-tab="content">Content</button>
        <button type="button" data-tab="styles">Styles</button>
        <button type="button" data-tab="effects">Effect</button>
        <button type="button" data-tab="settings">Settings</button>
      </div>
      <div class="cms-panel" data-panel="wireframe">
        <p class="cms-pill">Click text or images while editing</p>
        <div class="cms-discovered">
          <div class="cms-hint">Existing keys on the page</div>
          <h4 class="cms-sidebar__list-title">Discovered</h4>
          <p id="cms-empty">No tagged elements yet.</p>
          <ul class="cms-list" id="cms-list"></ul>
        </div>
      </div>
      <div class="cms-panel active" data-panel="content">
        <div class="cms-field">
          <label>Content type</label>
          <div class="cms-type">
            <label class="cms-radio"><input type="radio" name="cms-type" value="text" checked /> Text</label>
            <label class="cms-radio"><input type="radio" name="cms-type" value="image" /> Image</label>
            <label class="cms-radio"><input type="radio" name="cms-type" value="background" /> Background</label>
          </div>
        </div>
        <div class="cms-field cms-field--toggle">
          <label class="cms-toggle">
            <span>Use Backend Content</span>
            <input id="cms-backend-toggle" type="checkbox" />
            <span class="cms-toggle__control" aria-hidden="true"></span>
          </label>
        </div>
        <div class="cms-field cms-backend-only">
          <label for="cms-service">Service</label>
          <select id="cms-service"></select>
        </div>
        <div class="cms-field cms-backend-only cms-service-form" id="cms-service-form">
          <label>New service call</label>
          <input id="cms-service-alias" type="text" placeholder="Service alias" />
          <input id="cms-service-url" type="url" placeholder="https://example.com/api" />
          <div class="cms-action-row">
            <button type="button" id="cms-service-ok">OK</button>
            <button type="button" id="cms-service-cancel">Cancel</button>
          </div>
        </div>
        <div class="cms-field cms-backend-only">
          <label for="cms-backend-key">Field key</label>
          <select id="cms-backend-key"></select>
        </div>
        <div class="cms-field cms-standard-only">
          <label for="cms-key">Field key</label>
          <input id="cms-key" type="text" placeholder="auto.tag.hash" />
        </div>
        <div class="cms-field">
          <label for="cms-link">Link (optional)</label>
          <input id="cms-link" type="url" placeholder="https://example.com" />
        </div>
        <div class="cms-field cms-field--text">
          <label for="cms-value">Content</label>
          <textarea id="cms-value" placeholder="Type content here..."></textarea>
        </div>
        <div class="cms-field cms-field--image">
          <label for="cms-image-url">Image URL</label>
          <input id="cms-image-url" type="url" placeholder="https://example.com/image.png" />
          <div class="cms-action-row">
            <button type="button" id="cms-gallery">Browse gallery</button>
            <div class="cms-upload">
              <label class="cms-upload__label" for="cms-image-file">Upload image</label>
              <input id="cms-image-file" type="file" accept="image/*" />
            </div>
          </div>
          <div id="cms-image-preview" class="cms-image-preview">No image selected</div>
        </div>
        <button id="cms-save">Save</button>
        <button id="cms-delete" type="button">Delete element</button>
        <div id="cms-message"></div>
      </div>
      <div class="cms-panel" data-panel="styles">
        <div class="cms-field">
          <label for="cms-color">Color picker</label>
          <input id="cms-color" type="color" value="#111827" />
        </div>
        <div class="cms-field cms-field--flex">
          <label for="cms-flex">Flex direction</label>
          <select id="cms-flex">
            <option value="row">Row</option>
            <option value="column">Column</option>
            <option value="row-reverse">Row reverse</option>
            <option value="column-reverse">Column reverse</option>
          </select>
        </div>
      </div>
      <div class="cms-panel" data-panel="effects">
        <p class="cms-empty-state">TBD</p>
      </div>
      <div class="cms-panel" data-panel="settings">
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
        <div class="cms-field">
          <label for="cms-site-name">Site name (used when publishing)</label>
          <input id="cms-site-name" type="text" placeholder="Results Marketing" />
        </div>
        <button id="cms-settings-save" type="button">Save</button>
        <div id="cms-settings-message"></div>
        <div class="cms-publish">
          <button type="button" id="cms-publish">Publish static site</button>
          <p class="cms-pill cms-pill--subtle">Merges all pages into /published without editor assets</p>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(sidebar);

  const keyInput = sidebar.querySelector('#cms-key');
  const backendToggle = sidebar.querySelector('#cms-backend-toggle');
  const serviceSelect = sidebar.querySelector('#cms-service');
  const backendKeySelect = sidebar.querySelector('#cms-backend-key');
  const serviceForm = sidebar.querySelector('#cms-service-form');
  const serviceAliasInput = sidebar.querySelector('#cms-service-alias');
  const serviceUrlInput = sidebar.querySelector('#cms-service-url');
  const serviceOkButton = sidebar.querySelector('#cms-service-ok');
  const serviceCancelButton = sidebar.querySelector('#cms-service-cancel');
  const valueInput = sidebar.querySelector('#cms-value');
  const linkInput = sidebar.querySelector('#cms-link');
  const typeInputs = sidebar.querySelectorAll('input[name="cms-type"]');
  const imageUrlInput = sidebar.querySelector('#cms-image-url');
  const imageFileInput = sidebar.querySelector('#cms-image-file');
  const imagePreview = sidebar.querySelector('#cms-image-preview');
  const galleryButton = sidebar.querySelector('#cms-gallery');
  const saveButton = sidebar.querySelector('#cms-save');
  const deleteButton = sidebar.querySelector('#cms-delete');
  const publishButton = sidebar.querySelector('#cms-publish');
  const messageEl = sidebar.querySelector('#cms-message');
  const settingsSaveButton = sidebar.querySelector('#cms-settings-save');
  const settingsMessageEl = sidebar.querySelector('#cms-settings-message');
  const listEl = sidebar.querySelector('#cms-list');
  const emptyEl = sidebar.querySelector('#cms-empty');
  const fileSelect = sidebar.querySelector('#cms-file');
  const dockButtons = sidebar.querySelectorAll('.cms-dock__buttons button');
  const tabs = sidebar.querySelectorAll('.cms-tabs button');
  const panels = sidebar.querySelectorAll('.cms-panel');
  const colorInput = sidebar.querySelector('#cms-color');
  const flexSelect = sidebar.querySelector('#cms-flex');
  const flexField = sidebar.querySelector('.cms-field--flex');
  const siteNameInput = sidebar.querySelector('#cms-site-name');

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
    linkInput.value = '';
    imageUrlInput.value = '';
    imageFileInput.value = '';
    imagePreview.textContent = 'No image selected';
    imagePreview.style.backgroundImage = 'none';
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
    flexField.style.display = type === 'text' ? 'none' : 'flex';
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

  function rgbToHex(value) {
    if (!value) return '#111827';
    if (value.startsWith('#')) return value;
    const match = value.match(/rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)/);
    if (!match) return '#111827';
    const toHex = (num) => Number(num).toString(16).padStart(2, '0');
    return `#${toHex(match[1])}${toHex(match[2])}${toHex(match[3])}`;
  }

  function updateStyleInputs(el) {
    if (!el) return;
    const computed = window.getComputedStyle(el);
    const sourceColor = selectedType === 'text' ? computed.color : computed.backgroundColor;
    colorInput.value = rgbToHex(sourceColor);
    flexSelect.value = computed.flexDirection || 'row';
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

  function formatBackendValue(value) {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string') return value;
    return JSON.stringify(value);
  }

  function getValueByPath(data, path) {
    if (!path) return undefined;
    return path.split('.').reduce((acc, segment) => {
      if (acc === null || acc === undefined) return undefined;
      const key = /^\d+$/.test(segment) ? Number(segment) : segment;
      return acc[key];
    }, data);
  }

  function collectJsonPaths(data, prefix = '') {
    const paths = [];
    if (Array.isArray(data)) {
      data.forEach((item, index) => {
        const next = prefix ? `${prefix}.${index}` : `${index}`;
        if (item && typeof item === 'object') {
          paths.push(...collectJsonPaths(item, next));
        } else {
          paths.push(next);
        }
      });
      return paths;
    }
    if (data && typeof data === 'object') {
      Object.entries(data).forEach(([key, value]) => {
        const next = prefix ? `${prefix}.${key}` : key;
        if (value && typeof value === 'object') {
          paths.push(...collectJsonPaths(value, next));
        } else {
          paths.push(next);
        }
      });
      return paths;
    }
    if (prefix) return [prefix];
    return paths;
  }

  function getMetaServices() {
    return Array.from(document.querySelectorAll('meta[itemprop]'))
      .map((meta) => {
        const alias = meta.getAttribute('name') || meta.getAttribute('itemprop');
        const urlValue = meta.getAttribute('itemprop');
        if (!alias || !urlValue) return null;
        return { alias: alias.trim(), url: urlValue.trim() };
      })
      .filter(Boolean);
  }

  function populateServiceSelect() {
    if (!serviceSelect) return;
    serviceSelect.innerHTML = '';
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Select a service';
    serviceSelect.appendChild(placeholder);
    backendServices.forEach((service) => {
      const option = document.createElement('option');
      option.value = service.alias;
      option.textContent = service.alias;
      option.dataset.url = service.url;
      serviceSelect.appendChild(option);
    });
    const newOption = document.createElement('option');
    newOption.value = '__new__';
    newOption.textContent = 'New service call...';
    serviceSelect.appendChild(newOption);
  }

  function setBackendKeyOptions(paths) {
    if (!backendKeySelect) return;
    backendKeySelect.innerHTML = '';
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = paths.length ? 'Select a field key' : 'No keys found';
    backendKeySelect.appendChild(placeholder);
    paths.forEach((path) => {
      const option = document.createElement('option');
      option.value = path;
      option.textContent = path;
      backendKeySelect.appendChild(option);
    });
    backendKeySelect.disabled = !paths.length;
    if (backendPendingKey && paths.includes(backendPendingKey)) {
      backendKeySelect.value = backendPendingKey;
      setBackendValueForKey(backendPendingKey);
      backendPendingKey = '';
    }
  }

  function setBackendValueForKey(path) {
    const rawValue = getValueByPath(backendServiceData, path);
    const formatted = formatBackendValue(rawValue);
    keyInput.value = path || '';
    valueInput.value = formatted;
    imageUrlInput.value = formatted;
    updateImagePreview(formatted);
  }

  async function fetchServiceData(serviceUrl) {
    const response = await fetch(`/api/services?url=${encodeURIComponent(serviceUrl)}`);
    if (!response.ok) {
      throw new Error('Service request failed');
    }
    const payload = await response.json();
    return payload.data;
  }

  function setBackendMode(enabled) {
    sidebar.classList.toggle('cms-backend-enabled', enabled);
    valueInput.readOnly = enabled;
    imageUrlInput.readOnly = enabled;
    imageFileInput.disabled = enabled;
    backendKeySelect.disabled = !enabled;
    serviceForm.classList.remove('is-visible');
    if (!enabled) {
      backendServiceData = null;
      backendServiceAlias = '';
      setBackendKeyOptions([]);
      serviceSelect.value = '';
    }
  }

  function enableInlineEditing(el) {
    if (!editMode || selectedType !== 'text' || backendToggle.checked) return;
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
    const backendValue =
      el.getAttribute('data-server-text')
      || el.getAttribute('data-server-image')
      || el.getAttribute('data-server-bg');
    const backendSource = el.parentElement?.getAttribute('data-json-source') || '';
    const shouldUseBackend = Boolean(backendValue) && Boolean(backendSource);
    if (backendToggle.checked !== shouldUseBackend) {
      backendToggle.checked = shouldUseBackend;
      setBackendMode(shouldUseBackend);
    }
    if (shouldUseBackend) {
      backendServiceAlias = backendSource;
      if (!backendServices.length) {
        backendServices = getMetaServices();
      }
      populateServiceSelect();
      if (backendServices.some((service) => service.alias === backendServiceAlias)) {
        serviceSelect.value = backendServiceAlias;
      } else {
        serviceSelect.value = '';
        backendKeySelect.disabled = true;
      }
      serviceForm.classList.remove('is-visible');
    }
    const attributeName =
      selectedType === 'image'
        ? 'data-cms-image'
        : selectedType === 'background'
          ? 'data-cms-bg'
          : 'data-cms-text';
    const key = el.getAttribute(attributeName);
    linkInput.value = el.getAttribute('data-link') || '';
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
    if (shouldUseBackend) {
      backendPendingKey = key || '';
      const formattedBackendValue = formatBackendValue(backendValue);
      valueInput.value = formattedBackendValue;
      imageUrlInput.value = formattedBackendValue;
      updateImagePreview(formattedBackendValue);
      if (backendServices.some((service) => service.alias === backendServiceAlias)) {
        serviceSelect.dispatchEvent(new Event('change'));
      }
    }
    updateStyleInputs(el);
    deleteButton.disabled = false;
  }

  function activateTab(tabName) {
    tabs.forEach((btn) => btn.classList.toggle('active', btn.dataset.tab === tabName));
    panels.forEach((panel) => panel.classList.toggle('active', panel.dataset.panel === tabName));
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
    const useBackend = backendToggle.checked;
    if (selectedType === 'text' && !useBackend) {
      valueInput.value = selectedElement.textContent;
    }
    const key = keyInput.value.trim();
    let value = selectedType === 'image' || selectedType === 'background'
      ? imageUrlInput.value.trim()
      : valueInput.value;
    const linkValue = linkInput.value.trim();
    if (!key) {
      messageEl.textContent = 'Key is required.';
      messageEl.style.color = '#ef4444';
      return;
    }
    if (useBackend && !backendServiceAlias) {
      messageEl.textContent = 'Select a backend service before saving.';
      messageEl.style.color = '#ef4444';
      return;
    }
    if (useBackend && !backendServiceData) {
      messageEl.textContent = 'Load a backend service before saving.';
      messageEl.style.color = '#ef4444';
      return;
    }
    if (useBackend) {
      value = formatBackendValue(getValueByPath(backendServiceData, key));
      valueInput.value = value;
      imageUrlInput.value = value;
      updateImagePreview(value);
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
    if (useBackend) {
      const serverAttr =
        selectedType === 'image'
          ? 'data-server-image'
          : selectedType === 'background'
            ? 'data-server-bg'
            : 'data-server-text';
      selectedElement.setAttribute(serverAttr, value || '');
      const parent = selectedElement.parentElement;
      if (parent) {
        parent.setAttribute('data-json-source', backendServiceAlias);
      }
    }
    let bodyValue = value;
    let imagePayload = null;

    if (selectedType === 'image' || selectedType === 'background') {
      if (!useBackend) {
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
        siteNameInput.value = data.siteName || '';
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
  if (galleryButton) {
    galleryButton.addEventListener('click', () => {
      messageEl.textContent = 'Gallery browser coming soon.';
      messageEl.style.color = '#111827';
    });
  }
  if (settingsSaveButton) {
    settingsSaveButton.addEventListener('click', async () => {
      const siteName = siteNameInput.value.trim();
      settingsMessageEl.textContent = 'Saving settings...';
      settingsMessageEl.style.color = '#111827';
      try {
        const res = await fetch(buildApiUrl(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ siteName, file: currentFile }),
        });
        if (!res.ok) throw new Error('Save failed');
        const data = await res.json();
        siteNameInput.value = data.siteName || siteName;
        settingsMessageEl.textContent = 'Settings saved.';
        settingsMessageEl.style.color = '#16a34a';
      } catch (err) {
        settingsMessageEl.textContent = 'Unable to save settings.';
        settingsMessageEl.style.color = '#ef4444';
      }
    });
  }
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => activateTab(tab.dataset.tab));
  });
  colorInput.addEventListener('input', () => {
    if (!selectedElement) return;
    if (selectedType === 'text') {
      selectedElement.style.color = colorInput.value;
    } else {
      selectedElement.style.backgroundColor = colorInput.value;
    }
  });
  flexSelect.addEventListener('change', () => {
    if (!selectedElement || selectedType === 'text') return;
    selectedElement.style.display = 'flex';
    selectedElement.style.flexDirection = flexSelect.value;
  });
  valueInput.addEventListener('input', (e) => {
    if (!editMode || !selectedElement || selectedType !== 'text' || backendToggle.checked) return;
    selectedElement.textContent = e.target.value;
  });
  backendToggle.addEventListener('change', () => {
    const enabled = backendToggle.checked;
    setBackendMode(enabled);
    if (enabled && !backendServices.length) {
      backendServices = getMetaServices();
      populateServiceSelect();
    }
  });
  serviceSelect.addEventListener('change', async () => {
    const selected = serviceSelect.value;
    messageEl.textContent = '';
    if (selected === '__new__') {
      serviceForm.classList.add('is-visible');
      backendServiceData = null;
      backendServiceAlias = '';
      setBackendKeyOptions([]);
      return;
    }
    serviceForm.classList.remove('is-visible');
    if (!selected) {
      backendServiceData = null;
      backendServiceAlias = '';
      setBackendKeyOptions([]);
      return;
    }
    const service = backendServices.find((item) => item.alias === selected);
    if (!service) return;
    backendServiceAlias = service.alias;
    try {
      backendServiceData = await fetchServiceData(service.url);
      const paths = Array.from(new Set(collectJsonPaths(backendServiceData)));
      setBackendKeyOptions(paths);
    } catch (err) {
      backendServiceData = null;
      setBackendKeyOptions([]);
      messageEl.textContent = 'Unable to load backend service data.';
      messageEl.style.color = '#ef4444';
    }
  });
  backendKeySelect.addEventListener('change', (event) => {
    const path = event.target.value;
    if (!path) return;
    setBackendValueForKey(path);
  });
  serviceOkButton.addEventListener('click', () => {
    const alias = serviceAliasInput.value.trim();
    const urlValue = serviceUrlInput.value.trim();
    if (!alias || !urlValue) {
      messageEl.textContent = 'Provide a service alias and URL.';
      messageEl.style.color = '#ef4444';
      return;
    }
    const existingIndex = backendServices.findIndex((service) => service.alias === alias);
    if (existingIndex >= 0) {
      backendServices[existingIndex] = { alias, url: urlValue };
    } else {
      backendServices.push({ alias, url: urlValue });
    }
    populateServiceSelect();
    serviceSelect.value = alias;
    serviceAliasInput.value = '';
    serviceUrlInput.value = '';
    serviceForm.classList.remove('is-visible');
    serviceSelect.dispatchEvent(new Event('change'));
  });
  serviceCancelButton.addEventListener('click', () => {
    serviceAliasInput.value = '';
    serviceUrlInput.value = '';
    serviceSelect.value = '';
    serviceForm.classList.remove('is-visible');
    backendServiceAlias = '';
    backendServiceData = null;
    setBackendKeyOptions([]);
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
    if (backendToggle.checked) return;
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
    flexField.style.display = 'none';
    backendServices = getMetaServices();
    populateServiceSelect();
    setBackendMode(false);
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
