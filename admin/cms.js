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
  let draggedElement = null;
  let dropTarget = null;
  let activeWireframeTool = null;
  let textValueDirty = false;
  let backendServices = [];
  let backendServiceData = null;
  let backendServiceAlias = '';

  const outline = document.createElement('div');
  outline.className = 'cms-outline cms-ui';
  document.body.appendChild(outline);

  const toggleButton = document.createElement('button');
  toggleButton.id = 'cms-toggle';
  toggleButton.classList.add('cms-ui');
  toggleButton.textContent = 'Edit';
  document.body.appendChild(toggleButton);

  const sidebar = document.createElement('aside');
  sidebar.id = 'cms-sidebar';
  sidebar.classList.add('cms-ui');
  const POSITION_STORAGE_KEY = 'cmsSidebarPosition';
  const WIREFRAME_STORAGE_KEY = 'cmsWireframeEnabled';
  sidebar.innerHTML = `
    <div class="cms-sidebar__header">
      <div class="cms-sidebar__header-row">
        <div class="cms-sidebar__title">Inline CMS</div>
        <div class="cms-dock__arrows" aria-label="Dock position">
          <button type="button" class="cms-dock-arrow" data-pos="top" aria-label="Dock top">↑</button>
          <button type="button" class="cms-dock-arrow" data-pos="right" aria-label="Dock right">→</button>
          <button type="button" class="cms-dock-arrow" data-pos="bottom" aria-label="Dock bottom">↓</button>
          <button type="button" class="cms-dock-arrow" data-pos="left" aria-label="Dock left">←</button>
        </div>
      </div>
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
        <div class="cms-field cms-wireframe-tools">
          <label>Wireframe elements</label>
          <p class="cms-field__hint">Drag onto the page while wireframe mode is on.</p>
          <div class="cms-wireframe-tools__list">
            <div class="cms-wireframe-tool" draggable="true" data-wireframe-tool="square">Square</div>
            <div class="cms-wireframe-tool" draggable="true" data-wireframe-tool="circle">Circle</div>
            <div class="cms-wireframe-tool" draggable="true" data-wireframe-tool="text">Text block</div>
            <div class="cms-wireframe-tool" draggable="true" data-wireframe-tool="section">Section</div>
          </div>
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
          <input id="cms-link" type="text" placeholder="https://example.com or #section" />
        </div>
        <div class="cms-field cms-field--text">
          <label for="cms-value">Content</label>
          <textarea id="cms-value" placeholder="Type content here..."></textarea>
        </div>
        <div class="cms-field cms-field--image">
          <label for="cms-image-url">Image URL</label>
          <input id="cms-image-url" type="url" placeholder="https://example.com/image.png" />
          <div class="cms-action-row">
            <button type="button" id="cms-open-gallery">Browse gallery</button>
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
        <div class="cms-discovered">
          <div class="cms-hint">Existing keys on the page</div>
          <h4 class="cms-sidebar__list-title">Discovered</h4>
          <p id="cms-empty">No tagged elements yet.</p>
          <ul class="cms-list" id="cms-list"></ul>
        </div>
      </div>
      <div class="cms-panel" data-panel="styles">
        <div class="cms-field">
          <label for="cms-text-color">Text color</label>
          <input id="cms-text-color" type="color" value="#111827" />
        </div>
        <div class="cms-field">
          <label for="cms-bg-color">Background color</label>
          <input id="cms-bg-color" type="color" value="#ffffff" />
        </div>
        <div class="cms-field cms-field--font-size">
          <label for="cms-font-size">Font size (px)</label>
          <input id="cms-font-size" type="number" min="8" max="120" step="1" value="16" />
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
        <div class="cms-field cms-field--site">
          <label for="cms-sitename">Site name (used when publishing)</label>
          <div class="cms-site-input">
            <input id="cms-sitename" type="text" placeholder="enter-site-name" />
            <button type="button" id="cms-save-sitename">Save</button>
          </div>
          <p class="cms-pill cms-pill--subtle">Lowercase, no spaces. Required for prefixed image URLs.</p>
        </div>
        <div id="cms-settings-message"></div>
        <div class="cms-publish">
          <button type="button" id="cms-publish">Publish static site</button>
          <p class="cms-pill cms-pill--subtle">Publishes merged pages to the site root without editor assets</p>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(sidebar);

  const gallery = document.createElement('div');
  gallery.id = 'cms-gallery';
  gallery.classList.add('cms-ui');
  gallery.innerHTML = `
    <div class="cms-gallery__backdrop" data-gallery-close="true"></div>
    <div class="cms-gallery__dialog" role="dialog" aria-modal="true" aria-labelledby="cms-gallery-title">
      <div class="cms-gallery__header">
        <div>
          <h3 id="cms-gallery-title">Image gallery</h3>
          <p class="cms-gallery__subtitle">Choose from uploaded images or saved remote URLs.</p>
        </div>
        <button type="button" class="cms-gallery__close" data-gallery-close="true">Close</button>
      </div>
      <div class="cms-gallery__body">
        <div class="cms-gallery__section">
          <h4>Uploaded images</h4>
          <div class="cms-gallery__grid" data-gallery-section="uploads"></div>
        </div>
        <div class="cms-gallery__section">
          <h4>Remote URLs</h4>
          <div class="cms-gallery__grid" data-gallery-section="remote"></div>
        </div>
        <p class="cms-gallery__empty">No images found yet.</p>
      </div>
    </div>
  `;
  document.body.appendChild(gallery);

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
  const saveButton = sidebar.querySelector('#cms-save');
  const deleteButton = sidebar.querySelector('#cms-delete');
  const publishButton = sidebar.querySelector('#cms-publish');
  const siteNameInput = sidebar.querySelector('#cms-sitename');
  const siteNameSaveButton = sidebar.querySelector('#cms-save-sitename');
  const settingsMessageEl = sidebar.querySelector('#cms-settings-message');
  const messageEl = sidebar.querySelector('#cms-message');
  const listEl = sidebar.querySelector('#cms-list');
  const emptyEl = sidebar.querySelector('#cms-empty');
  const fileSelect = sidebar.querySelector('#cms-file');
  const dockButtons = sidebar.querySelectorAll('.cms-dock__buttons button');
  const dockArrowButtons = sidebar.querySelectorAll('.cms-dock__arrows button');
  const tabs = sidebar.querySelectorAll('.cms-tabs button');
  const panels = sidebar.querySelectorAll('.cms-panel');
  const textColorInput = sidebar.querySelector('#cms-text-color');
  const backgroundColorInput = sidebar.querySelector('#cms-bg-color');
  const fontSizeInput = sidebar.querySelector('#cms-font-size');
  const flexSelect = sidebar.querySelector('#cms-flex');
  const flexField = sidebar.querySelector('.cms-field--flex');
  const fontSizeField = sidebar.querySelector('.cms-field--font-size');
  const wireframeTools = sidebar.querySelectorAll('[data-wireframe-tool]');
  const galleryOpenButton = sidebar.querySelector('#cms-open-gallery');
  const galleryUploads = gallery.querySelector('[data-gallery-section="uploads"]');
  const galleryRemote = gallery.querySelector('[data-gallery-section="remote"]');
  const galleryEmpty = gallery.querySelector('.cms-gallery__empty');

  let sidebarPosition = localStorage.getItem(POSITION_STORAGE_KEY) || 'right';
  let siteName = '';
  let galleryAssets = { uploads: [], remote: [] };
  let layoutSaveTimer = null;
  deleteButton.disabled = true;

  function setWireframeState(enabled) {
    if (enabled && !editMode) {
      setEditMode(true);
    }
    document.body.classList.toggle('cms-wireframe', enabled);
    localStorage.setItem(WIREFRAME_STORAGE_KEY, enabled ? 'true' : 'false');
    toggleButton.disabled = enabled;
    setWireframeDragState(enabled);
  }

  setWireframeState(localStorage.getItem(WIREFRAME_STORAGE_KEY) === 'true');

  function applySidebarPosition() {
    sidebar.classList.remove('cms-pos-left', 'cms-pos-right', 'cms-pos-top', 'cms-pos-bottom');
    sidebar.classList.add(`cms-pos-${sidebarPosition}`);
    dockButtons.forEach((btn) => btn.classList.toggle('active', btn.dataset.pos === sidebarPosition));
    dockArrowButtons.forEach((btn) => btn.classList.toggle('active', btn.dataset.pos === sidebarPosition));
  }

  applySidebarPosition();

  function sanitizeSiteName(value) {
    return (value || '').toLowerCase().replace(/\s+/g, '').trim();
  }

  function clearForm() {
    keyInput.value = '';
    valueInput.value = '';
    linkInput.value = '';
    imageUrlInput.value = '';
    imageFileInput.value = '';
    imagePreview.textContent = 'No image selected';
    imagePreview.style.backgroundImage = 'none';
    deleteButton.disabled = true;
    textValueDirty = false;
  }

  function updateSiteName(value) {
    siteName = sanitizeSiteName(value);
    siteNameInput.value = siteName;
    if (!siteName) {
      siteNameInput.placeholder = 'required for publishing';
    }
  }

  function clearMessage() {
    messageEl.textContent = '';
    messageEl.style.color = '#16a34a';
  }

  function clearSettingsMessage() {
    settingsMessageEl.textContent = '';
    settingsMessageEl.style.color = '#16a34a';
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

  async function persistSiteName() {
    const desiredName = sanitizeSiteName(siteNameInput.value);
    if (!desiredName) {
      settingsMessageEl.textContent = 'Enter a site name (lowercase, no spaces) before saving.';
      settingsMessageEl.style.color = '#ef4444';
      return;
    }

    try {
      const res = await fetch(buildApiUrl(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteName: desiredName, file: currentFile }),
      });
      if (!res.ok) throw new Error('Site name save failed');
      const data = await res.json();
      updateSiteName(data.siteName || desiredName);
      settingsMessageEl.textContent = 'Site name saved for publishing.';
      settingsMessageEl.style.color = '#16a34a';
    } catch (err) {
      settingsMessageEl.textContent = 'Unable to save site name. Please try again.';
      settingsMessageEl.style.color = '#ef4444';
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
    return element.closest
      && element.closest('#cms-sidebar, #cms-toggle, .cms-outline,#cms-gallery');
  }

  function isWireframeEnabled() {
    return document.body.classList.contains('cms-wireframe');
  }

  function generateWireframeKey(base) {
    return ensureUniqueKey(`wireframe.${base}`);
  }

  function buildWireframeSection() {
    const section = document.createElement('section');
    section.className = 'cms-wireframe-section cms-wireframe-resizable';
    section.setAttribute('data-wireframe-section', 'true');
    section.setAttribute('draggable', 'true');
    section.dataset.sectionId = `section-${Date.now()}-${Math.random().toString(16).slice(2)}`;

    const label = document.createElement('div');
    label.className = 'cms-wireframe-section__label';
    label.textContent = 'Section';

    const content = document.createElement('div');
    content.className = 'cms-wireframe-section__content';

    section.appendChild(label);
    section.appendChild(content);
    return section;
  }

  function buildWireframeElement(type) {
    if (type === 'section') {
      return buildWireframeSection();
    }
    if (type === 'text') {
      const textBlock = document.createElement('p');
      textBlock.className = 'cms-wireframe-text cms-wireframe-resizable';
      textBlock.textContent = 'Text placeholder';
      textBlock.setAttribute('data-cms-text', generateWireframeKey('text'));
      if (isWireframeEnabled()) {
        textBlock.setAttribute('draggable', 'true');
      }
      return textBlock;
    }
    if (type === 'circle') {
      const circle = document.createElement('div');
      circle.className = 'cms-wireframe-shape cms-wireframe-shape--circle cms-wireframe-resizable';
      circle.textContent = 'Circle';
      circle.setAttribute('data-cms-text', generateWireframeKey('circle'));
      if (isWireframeEnabled()) {
        circle.setAttribute('draggable', 'true');
      }
      return circle;
    }
    const square = document.createElement('div');
    square.className = 'cms-wireframe-shape cms-wireframe-resizable';
    square.textContent = 'Square';
    square.setAttribute('data-cms-text', generateWireframeKey('square'));
    if (isWireframeEnabled()) {
      square.setAttribute('draggable', 'true');
    }
    return square;
  }

  function resolveSectionContainer(target) {
    if (!target) return null;
    const section = target.closest('[data-wireframe-section="true"]');
    if (!section) return null;
    return section.querySelector('.cms-wireframe-section__content') || section;
  }

  function getDropContainer(target) {
    if (!target) return document.body;
    const sectionContent = resolveSectionContainer(target);
    if (sectionContent) return sectionContent;
    if (target === document.body || target === document.documentElement) return document.body;
    return target;
  }

  function isWireframeSection(element) {
    return element && element.matches && element.matches('[data-wireframe-section="true"]');
  }

  function handleWireframeToolDragStart(event) {
    const tool = event.currentTarget;
    const type = tool.dataset.wireframeTool;
    if (!type) return;
    activeWireframeTool = type;
    event.dataTransfer.setData('text/plain', type);
    event.dataTransfer.setData('application/x-wireframe-tool', type);
    event.dataTransfer.effectAllowed = 'copy';
  }

  function isValidDragElement(element) {
    return element
      && element.nodeType === Node.ELEMENT_NODE
      && element !== document.body
      && element !== document.documentElement
      && !isCmsUi(element);
  }

  function setWireframeDragState(enabled) {
    document.querySelectorAll('body *:not(.cms-ui):not(.cms-ui *)').forEach((el) => {
      if (!isValidDragElement(el)) return;
      if (enabled) {
        el.setAttribute('draggable', 'true');
      } else {
        el.removeAttribute('draggable');
      }
    });
    if (!enabled) {
      clearDropTarget();
      if (draggedElement) {
        draggedElement.classList.remove('cms-dragging');
        draggedElement = null;
      }
      document.body.classList.remove('cms-drag-active');
    }
  }

  function clearDropTarget() {
    if (dropTarget) {
      dropTarget.classList.remove('cms-drop-target');
      dropTarget = null;
    }
  }

  function handleDragStart(event) {
    if (!isWireframeEnabled()) return;
    const target = getElementTarget(event.target);
    if (!isValidDragElement(target)) return;
    draggedElement = target;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', '');
    draggedElement.classList.add('cms-dragging');
    if (isWireframeSection(draggedElement)) {
      draggedElement.classList.add('cms-wireframe-section--dragging');
    }
    document.body.classList.add('cms-drag-active');
  }

  function handleDragOver(event) {
    if (!isWireframeEnabled()) return;
    const toolType = activeWireframeTool || event.dataTransfer.getData('application/x-wireframe-tool');
    if (toolType) {
      const target = getElementTarget(event.target);
      if (!isCmsUi(target)) {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
      }
      return;
    }
    if (!draggedElement) return;
    const target = getElementTarget(event.target);
    if (!isValidDragElement(target) || target === draggedElement || target.contains(draggedElement)) {
      clearDropTarget();
      return;
    }
    if (isWireframeSection(draggedElement)) {
      const targetSection = target.closest('[data-wireframe-section="true"]');
      if (!targetSection || targetSection === draggedElement) {
        clearDropTarget();
        return;
      }
      event.preventDefault();
      if (dropTarget !== targetSection) {
        clearDropTarget();
        dropTarget = targetSection;
        dropTarget.classList.add('cms-drop-target');
      }
      return;
    }
    event.preventDefault();
    if (dropTarget !== target) {
      clearDropTarget();
      dropTarget = target;
      dropTarget.classList.add('cms-drop-target');
    }
  }

  function handleDrop(event) {
    if (!isWireframeEnabled()) return;
    const toolType = activeWireframeTool || event.dataTransfer.getData('application/x-wireframe-tool');
    if (toolType) {
      const target = getElementTarget(event.target);
      if (isCmsUi(target)) return;
      event.preventDefault();
      const element = buildWireframeElement(toolType);
      if (toolType === 'section') {
        document.body.insertBefore(element, document.body.firstChild);
      } else {
        const container = getDropContainer(target);
        container.appendChild(element);
      }
      activeWireframeTool = null;
      persistLayout();
      return;
    }
    if (!draggedElement || !dropTarget) return;
    event.preventDefault();
    const parent = dropTarget.parentNode;
    if (!parent) return;
    const rect = dropTarget.getBoundingClientRect();
    const insertAfter = event.clientY > rect.top + rect.height / 2;
    const referenceNode = insertAfter ? dropTarget.nextSibling : dropTarget;
    if (referenceNode !== draggedElement) {
      parent.insertBefore(draggedElement, referenceNode);
    }
    clearDropTarget();
    persistLayout();
  }

  function handleDragEnd() {
    if (draggedElement) {
      draggedElement.classList.remove('cms-dragging');
      draggedElement.classList.remove('cms-wireframe-section--dragging');
    }
    draggedElement = null;
    activeWireframeTool = null;
    clearDropTarget();
    document.body.classList.remove('cms-drag-active');
  }

  function getElementTarget(node) {
    if (node && node.nodeType === Node.TEXT_NODE) {
      return node.parentElement;
    }
    return node;
  }

  function getFullHtmlPayload() {
    const docType = document.doctype ? `<!DOCTYPE ${document.doctype.name}>` : '';
    return `${docType}${document.documentElement.outerHTML}`;
  }

  async function persistLayout() {
    try {
      await fetch('/api/layout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          file: currentFile,
          html: getFullHtmlPayload(),
        }),
      });
    } catch (err) {
      console.warn('Unable to persist layout changes.', err);
    }
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

  function setEditMode(enabled) {
    if (editMode === enabled) return;
    editMode = enabled;
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

  function toggleEdit() {
    setEditMode(!editMode);
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
    fontSizeField.style.display = type === 'text' ? 'flex' : 'none';
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

  function applyImagePreviewToElement(src) {
    if (!selectedElement || !(selectedType === 'image' || selectedType === 'background')) return;
    applyImageToElement(selectedElement, src, selectedType === 'background' ? 'background' : 'image');
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

  function rgbToHex(value) {
    if (!value) return '#111827';
    if (value.startsWith('#')) return value;
    const match = value.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (!match) return '#111827';
    const toHex = (num) => Number(num).toString(16).padStart(2, '0');
    return `#${toHex(match[1])}${toHex(match[2])}${toHex(match[3])}`;
  }

  function updateStyleInputs(el) {
    if (!el) return;
    const computed = window.getComputedStyle(el);
    textColorInput.value = rgbToHex(computed.color);
    backgroundColorInput.value = rgbToHex(computed.backgroundColor);
    fontSizeInput.value = Number.parseFloat(computed.fontSize) || 16;
    flexSelect.value = computed.flexDirection || 'row';
  }

  function scheduleLayoutPersist() {
    if (layoutSaveTimer) {
      clearTimeout(layoutSaveTimer);
    }
    layoutSaveTimer = setTimeout(() => {
      persistLayout();
      layoutSaveTimer = null;
    }, 400);
  }

  function toggleGallery(open) {
    gallery.classList.toggle('open', open);
    document.body.classList.toggle('cms-gallery-open', open);
  }

  function buildGalleryItem(src, label) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'cms-gallery__item';
    button.style.backgroundImage = `url('${src}')`;
    button.title = label || src;
    const caption = document.createElement('span');
    caption.textContent = label || src;
    button.appendChild(caption);
    button.addEventListener('click', () => {
      imageUrlInput.value = src;
      updateImagePreview(src);
      applyImagePreviewToElement(src);
      toggleGallery(false);
    });
    return button;
  }

  function renderGallery() {
    const uploads = galleryAssets.uploads || [];
    const remote = galleryAssets.remote || [];
    galleryUploads.innerHTML = '';
    galleryRemote.innerHTML = '';
    uploads.forEach((src) => {
      galleryUploads.appendChild(buildGalleryItem(src, src.replace('/images/', '')));
    });
    remote.forEach((src) => {
      galleryRemote.appendChild(buildGalleryItem(src, src));
    });
    const hasAny = uploads.length || remote.length;
    galleryEmpty.style.display = hasAny ? 'none' : 'block';
  }

  function isRemoteImageUrl(value) {
    if (typeof value !== 'string') return false;
    const trimmed = value.trim();
    if (!trimmed) return false;
    return /^(https?:)?\/\//i.test(trimmed);
  }

  async function loadGalleryAssets() {
    try {
      const res = await fetch(FILES_ENDPOINT);
      if (!res.ok) throw new Error('Unable to fetch files');
      const data = await res.json();
      const files = Array.isArray(data.files) ? data.files : [];
      if (!files.includes(currentFile)) files.push(currentFile);

      const responses = await Promise.all(
        files.map(async (file) => {
          try {
            const contentRes = await fetch(`${API_ENDPOINT}?file=${encodeURIComponent(file)}`);
            if (!contentRes.ok) return null;
            const contentData = await contentRes.json();
            return contentData.content || {};
          } catch (err) {
            return null;
          }
        })
      );

      const uploads = new Set();
      const remote = new Set();
      responses.forEach((content) => {
        if (!content) return;
        Object.values(content).forEach((value) => {
          if (typeof value !== 'string') return;
          const trimmed = value.trim();
          if (!trimmed) return;
          if (trimmed.startsWith('/images/')) {
            uploads.add(trimmed);
          } else if (isRemoteImageUrl(trimmed)) {
            remote.add(trimmed);
          }
        });
      });

      galleryAssets = {
        uploads: Array.from(uploads).sort(),
        remote: Array.from(remote).sort(),
      };
      renderGallery();
    } catch (err) {
      galleryAssets = { uploads: [], remote: [] };
      renderGallery();
    }
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
    if (!editMode || selectedType !== 'text' || backendToggle.checked) return;
    clearInlineEditing();
    inlineInputHandler = () => {
      valueInput.value = el.textContent;
      textValueDirty = true;
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
    textValueDirty = false;
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
      }
      serviceForm.classList.remove('is-visible');
      if (backendServices.some((service) => service.alias === backendServiceAlias)) {
        serviceSelect.dispatchEvent(new Event('change'));
      } else {
        backendKeySelect.disabled = true;
      }
    }
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
    linkInput.value = el.getAttribute('data-link') || '';
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
    updateStyleInputs(el);
    deleteButton.disabled = false;
  }

  function activateTab(tabName) {
    tabs.forEach((btn) => btn.classList.toggle('active', btn.dataset.tab === tabName));
    panels.forEach((panel) => panel.classList.toggle('active', panel.dataset.panel === tabName));
    setWireframeState(tabName === 'wireframe');
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
    if (selectedType === 'text' && !textValueDirty) {
      valueInput.value = selectedElement.textContent;
    }
    const key = keyInput.value.trim();
    let value = selectedType === 'image' || selectedType === 'background'
      ? imageUrlInput.value.trim()
      : valueInput.value;
    const link = linkInput.value.trim();
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
      textValueDirty = true;
    }

    const attributeName =
      selectedType === 'image'
        ? 'data-cms-image'
        : selectedType === 'background'
          ? 'data-cms-bg'
          : 'data-cms-text';
    const currentKey = selectedElement.getAttribute(attributeName);
    const currentLink = selectedElement.getAttribute('data-link') || '';
    if (
      selectedType === 'text'
      && !textValueDirty
      && key === currentKey
      && link === currentLink
      && !useBackend
    ) {
      messageEl.textContent = 'No content changes to save.';
      messageEl.style.color = '#16a34a';
      return;
    }
    const uniqueKey = ensureUniqueKey(key, currentKey);
    const originalOuterHTML = selectedElement.outerHTML;

    if (uniqueKey !== key) {
      messageEl.textContent = `Key exists. Saved as ${uniqueKey}.`;
    } else {
      clearMessage();
    }

    selectedElement.setAttribute(attributeName, uniqueKey);
    if (link) {
      selectedElement.setAttribute('data-link', link);
    } else {
      selectedElement.removeAttribute('data-link');
    }
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
    } else if (textValueDirty) {
      const nextValue = valueInput.value;
      const currentText = selectedElement.textContent || '';
      if (nextValue.trim() === '' && currentText.trim() !== '') {
        bodyValue = null;
      } else {
        selectedElement.textContent = nextValue;
        bodyValue = nextValue;
      }
    } else {
      //bodyValue = null;
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
          link,
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
      updateSiteName(data.siteName || siteName);
      applyStoredTags(storedTags);
      applyContent();
      refreshList();
      textValueDirty = false;
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
    if (!siteName) {
      settingsMessageEl.textContent = 'Set a site name before publishing (lowercase, no spaces).';
      settingsMessageEl.style.color = '#ef4444';
      siteNameInput.focus();
      return;
    }

    const originalLabel = publishButton.textContent;
    publishButton.disabled = true;
    publishButton.textContent = 'Publishing...';
    settingsMessageEl.textContent = 'Publishing merged HTML to the site root...';
    settingsMessageEl.style.color = '#111827';

    try {
      const res = await fetch('/api/publish', { method: 'POST' });
      if (!res.ok) throw new Error('Publish failed');
      const data = await res.json();
      const count = Array.isArray(data.published) ? data.published.length : 0;
      settingsMessageEl.textContent = `Published ${count} page${count === 1 ? '' : 's'} to the site root.`;
      settingsMessageEl.style.color = '#16a34a';
    } catch (err) {
      settingsMessageEl.textContent = 'Unable to publish static pages.';
      settingsMessageEl.style.color = '#ef4444';
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
      //return;
    }
    e.preventDefault();
    e.stopPropagation();
    selectElement(target);
  }

  function handleLinkNavigation(e) {
    if (editMode) return;
    if (isCmsUi(e.target)) return;
    const target = e.target.closest ? e.target.closest('[data-link]') : null;
    if (!target) return;
    const href = target.getAttribute('data-link');
    if (!href) return;
    e.preventDefault();
    e.stopPropagation();
    window.location.href = href;
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
        if (entry && entry.link) {
          el.setAttribute('data-link', entry.link);
        } else {
          el.removeAttribute('data-link');
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
        updateSiteName(data.siteName || siteName);
        //applyStoredTags(storedTags);
      }
      //applyContent();
    } catch (err) {
      console.warn('Hydration failed', err);
    }
  }

  toggleButton.addEventListener('click', toggleEdit);
  document.addEventListener('mouseover', handleHover, true);
  document.addEventListener('click', handleClick, true);
  document.addEventListener('click', handleLinkNavigation);
  document.addEventListener('dragstart', handleDragStart, true);
  document.addEventListener('dragover', handleDragOver, true);
  document.addEventListener('drop', handleDrop, true);
  document.addEventListener('dragend', handleDragEnd, true);
  saveButton.addEventListener('click', saveSelection);
  deleteButton.addEventListener('click', deleteSelection);
  publishButton.addEventListener('click', publishStaticSite);
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => activateTab(tab.dataset.tab));
  });
  textColorInput.addEventListener('input', () => {
    if (!selectedElement) return;
    selectedElement.style.color = textColorInput.value;
    scheduleLayoutPersist();
  });
  backgroundColorInput.addEventListener('input', () => {
    if (!selectedElement) return;
    selectedElement.style.backgroundColor = backgroundColorInput.value;
    scheduleLayoutPersist();
  });
  fontSizeInput.addEventListener('input', () => {
    if (!selectedElement || selectedType !== 'text') return;
    const fontSize = Number.parseFloat(fontSizeInput.value);
    if (!Number.isNaN(fontSize)) {
      selectedElement.style.fontSize = `${fontSize}px`;
      scheduleLayoutPersist();
    }
  });
  flexSelect.addEventListener('change', () => {
    if (!selectedElement || selectedType === 'text') return;
    selectedElement.style.display = 'flex';
    selectedElement.style.flexDirection = flexSelect.value;
    scheduleLayoutPersist();
  });
  valueInput.addEventListener('input', (e) => {
    if (!editMode || !selectedElement || selectedType !== 'text' || backendToggle.checked) return;
    selectedElement.textContent = e.target.value;
    textValueDirty = true;
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
  siteNameSaveButton.addEventListener('click', persistSiteName);
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
      applyImagePreviewToElement(fileUrl);
    } else {
      updateImagePreview('');
    }
  });
  imageUrlInput.addEventListener('input', () => {
    if (backendToggle.checked) return;
    const nextUrl = imageUrlInput.value.trim();
    if (!nextUrl) return;
    updateImagePreview(nextUrl);
    applyImagePreviewToElement(nextUrl);
  });
  galleryOpenButton.addEventListener('click', async () => {
    await loadGalleryAssets();
    toggleGallery(true);
  });

  gallery.addEventListener('click', (event) => {
    const target = event.target;
    if (target && target.dataset && target.dataset.galleryClose) {
      toggleGallery(false);
    }
  });

  document.addEventListener('DOMContentLoaded', () => {
    loadFiles();
    applySidebarPosition();
    flexField.style.display = 'none';
    fontSizeField.style.display = 'flex';
    clearSettingsMessage();
    backendServices = getMetaServices();
    populateServiceSelect();
    setBackendMode(false);
    hydrate();
    if (document.querySelector('.cms-panel.active')?.dataset.panel !== 'wireframe') {
      setWireframeState(false);
    }
  });

  dockButtons.forEach((button) => {
    button.addEventListener('click', () => {
      sidebarPosition = button.dataset.pos;
      localStorage.setItem(POSITION_STORAGE_KEY, sidebarPosition);
      applySidebarPosition();
    });
  });

  dockArrowButtons.forEach((button) => {
    button.addEventListener('click', () => {
      sidebarPosition = button.dataset.pos;
      localStorage.setItem(POSITION_STORAGE_KEY, sidebarPosition);
      applySidebarPosition();
    });
  });

  wireframeTools.forEach((tool) => {
    tool.addEventListener('dragstart', handleWireframeToolDragStart);
  });
})();
