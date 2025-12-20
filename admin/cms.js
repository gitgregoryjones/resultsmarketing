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
  outline.className = 'cms-outline cms-ui';
  document.body.appendChild(outline);

  const toggleButton = document.createElement('button');
  toggleButton.id = 'cms-toggle';
  toggleButton.classList.add('cms-ui');
  toggleButton.textContent = 'Edit';
  document.body.appendChild(toggleButton);

  const wireframeToggle = document.createElement('button');
  wireframeToggle.id = 'cms-wireframe-toggle';
  wireframeToggle.classList.add('cms-ui');
  wireframeToggle.setAttribute('type', 'button');
  wireframeToggle.setAttribute('aria-pressed', 'false');
  wireframeToggle.textContent = 'Wireframe Off';
  document.body.appendChild(wireframeToggle);

  const sidebar = document.createElement('aside');
  sidebar.id = 'cms-sidebar';
  sidebar.classList.add('cms-ui');
  const POSITION_STORAGE_KEY = 'cmsSidebarPosition';
  const WIREFRAME_STORAGE_KEY = 'cmsWireframeEnabled';
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
      <div class="cms-field cms-field--site">
        <label for="cms-sitename">Site name (used when publishing)</label>
        <div class="cms-site-input">
          <input id="cms-sitename" type="text" placeholder="enter-site-name" />
          <button type="button" id="cms-save-sitename">Save</button>
        </div>
        <p class="cms-pill cms-pill--subtle">Lowercase, no spaces. Required for prefixed image URLs.</p>
      </div>
      <div class="cms-publish">
        <button type="button" id="cms-publish">Publish static site</button>
        <p class="cms-pill cms-pill--subtle">Publishes merged pages to the site root without editor assets</p>
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
        <div class="cms-image-actions">
          <button type="button" id="cms-open-gallery">Browse gallery</button>
        </div>
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
  colorDialog.classList.add('cms-ui');
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

  const gallery = document.createElement('div');
  gallery.id = 'cms-gallery';
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
  const messageEl = sidebar.querySelector('#cms-message');
  const listEl = sidebar.querySelector('#cms-list');
  const emptyEl = sidebar.querySelector('#cms-empty');
  const fileSelect = sidebar.querySelector('#cms-file');
  const dockButtons = sidebar.querySelectorAll('.cms-dock__buttons button');
  const galleryOpenButton = sidebar.querySelector('#cms-open-gallery');
  const galleryUploads = gallery.querySelector('[data-gallery-section="uploads"]');
  const galleryRemote = gallery.querySelector('[data-gallery-section="remote"]');
  const galleryEmpty = gallery.querySelector('.cms-gallery__empty');
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
  const colorCloseButton = colorDialog.querySelector('#cms-color-close');

  let sidebarPosition = localStorage.getItem(POSITION_STORAGE_KEY) || 'right';
  let siteName = '';
  let galleryAssets = { uploads: [], remote: [] };
  let colorDialogState = {
    applied: false,
    originalStyles: null,
  };
  deleteButton.disabled = true;

  function setWireframeState(enabled) {
    if (enabled) {
      setEditMode(false);
    }
    document.body.classList.toggle('cms-wireframe', enabled);
    wireframeToggle.setAttribute('aria-pressed', enabled ? 'true' : 'false');
    wireframeToggle.textContent = `Wireframe ${enabled ? 'On' : 'Off'}`;
    localStorage.setItem(WIREFRAME_STORAGE_KEY, enabled ? 'true' : 'false');
    toggleButton.disabled = enabled;
  }

  setWireframeState(localStorage.getItem(WIREFRAME_STORAGE_KEY) === 'true');

  function applySidebarPosition() {
    sidebar.classList.remove('cms-pos-left', 'cms-pos-right', 'cms-pos-top', 'cms-pos-bottom');
    sidebar.classList.add(`cms-pos-${sidebarPosition}`);
    dockButtons.forEach((btn) => btn.classList.toggle('active', btn.dataset.pos === sidebarPosition));
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
    effectsFlipButton.classList.remove('active');
    effectsScrollButton.classList.remove('active');
    scrollHeightInput.value = '240';
    hoverEffectSelect.value = 'none';
    colorPreview.style.background = 'transparent';
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

  function applyLiveColors() {
    if (!selectedElement) return;
    selectedElement.style.color = colorTextInput.value;
    selectedElement.style.backgroundColor = colorBgInput.value;
    selectedElement.style.borderColor = colorBorderInput.value;
    updateColorPreview(colorTextInput.value, colorBgInput.value);
  }

  function captureOriginalColors() {
    if (!selectedElement) return null;
    return {
      color: selectedElement.style.color,
      backgroundColor: selectedElement.style.backgroundColor,
      borderColor: selectedElement.style.borderColor,
    };
  }

  function restoreOriginalColors() {
    if (!selectedElement || !colorDialogState.originalStyles) return;
    selectedElement.style.color = colorDialogState.originalStyles.color;
    selectedElement.style.backgroundColor = colorDialogState.originalStyles.backgroundColor;
    selectedElement.style.borderColor = colorDialogState.originalStyles.borderColor;
    updateEffectsControls(selectedElement);
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
      messageEl.textContent = 'Enter a site name (lowercase, no spaces) before saving.';
      messageEl.style.color = '#ef4444';
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
      messageEl.textContent = 'Site name saved for publishing.';
      messageEl.style.color = '#16a34a';
    } catch (err) {
      messageEl.textContent = 'Unable to save site name. Please try again.';
      messageEl.style.color = '#ef4444';
    }
  }

  wireframeToggle.addEventListener('click', () => {
    setWireframeState(!document.body.classList.contains('cms-wireframe'));
  });

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
      && element.closest('#cms-sidebar, #cms-toggle, #cms-wireframe-toggle, .cms-outline, #cms-gallery, #cms-color-dialog');
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
    await saveSelection({ originalOuterHTML, updatedOuterHTML, skipContentUpdate: true });
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
    if (selectedType === 'text' && !overrides.skipContentUpdate) {
      valueInput.value = selectedElement.textContent;
    }
    const key = keyInput.value.trim();
    const value = selectedType === 'image' || selectedType === 'background'
      ? imageUrlInput.value.trim()
      : valueInput.value;
    const link = linkInput.value.trim();
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
    if (link) {
      selectedElement.setAttribute('data-link', link);
    } else {
      selectedElement.removeAttribute('data-link');
    }
    let bodyValue = value;
    let imagePayload = null;

    if (!overrides.skipContentUpdate) {
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
      messageEl.textContent = 'Set a site name before publishing (lowercase, no spaces).';
      messageEl.style.color = '#ef4444';
      siteNameInput.focus();
      return;
    }

    const originalLabel = publishButton.textContent;
    publishButton.disabled = true;
    publishButton.textContent = 'Publishing...';
    messageEl.textContent = 'Publishing merged HTML to the site root...';
    messageEl.style.color = '#111827';

    try {
      const res = await fetch('/api/publish', { method: 'POST' });
      if (!res.ok) throw new Error('Publish failed');
      const data = await res.json();
      const count = Array.isArray(data.published) ? data.published.length : 0;
      messageEl.textContent = `Published ${count} page${count === 1 ? '' : 's'} to the site root.`;
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
  document.addEventListener('click', handleLinkNavigation);
  saveButton.addEventListener('click', saveSelection);
  deleteButton.addEventListener('click', deleteSelection);
  publishButton.addEventListener('click', publishStaticSite);
  valueInput.addEventListener('input', (e) => {
    if (!editMode || !selectedElement || selectedType !== 'text') return;
    selectedElement.textContent = e.target.value;
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
    colorDialogState = {
      applied: false,
      originalStyles: captureOriginalColors(),
    };
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
    applyLiveColors();
  });
  colorBgInput.addEventListener('input', () => {
    colorBgValueInput.value = colorBgInput.value;
    applyLiveColors();
  });
  colorBorderInput.addEventListener('input', () => {
    colorBorderValueInput.value = colorBorderInput.value;
    applyLiveColors();
  });
  colorTextValueInput.addEventListener('input', () => {
    syncColorField(colorTextInput, colorTextValueInput);
    applyLiveColors();
  });
  colorBgValueInput.addEventListener('input', () => {
    syncColorField(colorBgInput, colorBgValueInput);
    applyLiveColors();
  });
  colorBorderValueInput.addEventListener('input', () => {
    syncColorField(colorBorderInput, colorBorderValueInput);
    applyLiveColors();
  });

  colorApplyButton.addEventListener('click', async () => {
    if (!ensureElementSelected('colors')) return;
    const originalOuterHTML = selectedElement.outerHTML;
    applyLiveColors();
    updateEffectsControls(selectedElement);
    const updatedOuterHTML = selectedElement.outerHTML;
    colorDialogState.applied = true;
    await persistElementHtml(originalOuterHTML, updatedOuterHTML);
    if (typeof colorDialog.close === 'function') {
      colorDialog.close();
    } else {
      colorDialog.removeAttribute('open');
    }
  });

  colorClearButton.addEventListener('click', async () => {
    if (!ensureElementSelected('colors')) return;
    const originalOuterHTML = selectedElement.outerHTML;
    selectedElement.style.color = '';
    selectedElement.style.backgroundColor = '';
    selectedElement.style.borderColor = '';
    updateEffectsControls(selectedElement);
    const updatedOuterHTML = selectedElement.outerHTML;
    colorDialogState.applied = true;
    await persistElementHtml(originalOuterHTML, updatedOuterHTML);
  });

  colorDialog.addEventListener('close', () => {
    if (colorDialogState.applied) return;
    restoreOriginalColors();
  });

  colorCloseButton.addEventListener('click', () => {
    if (typeof colorDialog.close === 'function') {
      colorDialog.close();
    } else {
      colorDialog.removeAttribute('open');
      restoreOriginalColors();
    }
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
