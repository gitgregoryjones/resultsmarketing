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
  let dropTargetPosition = null;
  let activeWireframeTool = null;
  let textValueDirty = false;
  let reorderMode = false;
  let resizeState = null;
  let backendServices = [];
  let backendServiceData = null;
  let backendServiceAlias = '';
  let backendPendingKey = '';
  let quickTextHistory = [];
  let quickBgHistory = [];
  let isMenuDragging = false;
  let menuDragOffsetX = 0;
  let menuDragOffsetY = 0;
  let drawMode = false;
  let drawState = null;
  let drawOverlayEl = null;
  let drawDropHighlightEl = null;

  const COLOR_SWATCHES = [
    { hex: '#111827', textClass: 'text-gray-900', bgClass: 'bg-gray-900' },
    { hex: '#ffffff', textClass: 'text-white', bgClass: 'bg-white' },
    { hex: '#6b7280', textClass: 'text-gray-500', bgClass: 'bg-gray-500' },
    { hex: '#7c3aed', textClass: 'text-purple-600', bgClass: 'bg-purple-600' },
    { hex: '#2563eb', textClass: 'text-blue-600', bgClass: 'bg-blue-600' },
    { hex: '#16a34a', textClass: 'text-green-600', bgClass: 'bg-green-600' },
    { hex: '#ef4444', textClass: 'text-red-500', bgClass: 'bg-red-500' },
  ];

  const outline = document.createElement('div');
  outline.className = 'cms-outline cms-ui';
  document.body.appendChild(outline);

  const floatingActions = document.createElement('div');
  floatingActions.className = 'cms-floating-actions cms-ui';
  document.body.appendChild(floatingActions);

  const floatingMenu = document.createElement('div');
  floatingMenu.id = 'cms-floating-menu';
  floatingMenu.className = 'cms-floating-menu cms-ui';
  floatingMenu.innerHTML = `
    <button type="button" class="cms-floating-menu__minimize" aria-label="Minimize menu">–</button>
    <div class="cms-floating-menu__items">
      <div class="cms-floating-menu__item cms-floating-menu__pages">
        <button type="button" class="cms-floating-menu__button" id="cms-pages-toggle">Pages</button>
        <div class="cms-floating-menu__dropdown" id="cms-pages-dropdown">
          <select id="cms-pages-select" aria-label="Select page"></select>
          <div class="cms-floating-menu__page-actions">
            <input id="cms-page-name" type="text" placeholder="new-page" />
            <button type="button" id="cms-page-create">Add page</button>
            <button type="button" id="cms-page-delete" class="is-danger">Delete page</button>
          </div>
        </div>
      </div>
      <button type="button" class="cms-floating-menu__button" id="cms-effects-button">Effects</button>
      <button type="button" class="cms-floating-menu__button" id="cms-settings-button">Settings</button>
      <button type="button" class="cms-floating-menu__button" id="cms-draw-button">Draw</button>
      <button type="button" class="cms-floating-menu__button" id="cms-xray-button">X-ray</button>
      <button type="button" class="cms-floating-menu__button" id="cms-publish-button">
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M14.5 3c3.1 0 6.5 1.4 6.5 4.5 0 3.2-2.2 6.9-6.4 9.8l-2.2-2.2c2.5-1.8 4.1-4.3 4.1-6.4 0-.9-.3-1.7-.9-2.3-.6-.6-1.4-.9-2.3-.9-2.1 0-4.6 1.6-6.4 4.1L4.7 7.4C7.6 3.2 11.3 1 14.5 1v2zM6.2 12.5 3 15.7V21h5.3l3.2-3.2-2.3-2.3-2 2H6v-1.2l2-2-1.8-1.8zM14 6.5a2 2 0 1 0 0 4 2 2 0 0 0 0-4z" />
        </svg>
        <span>Publish</span>
      </button>
    </div>
  `;
  document.body.appendChild(floatingMenu);

  const drawStyles = document.createElement('style');
  drawStyles.textContent = `
    .cms-draw-overlay {
      position: fixed;
      border: 2px dashed #60a5fa;
      background: rgba(96, 165, 250, 0.12);
      pointer-events: none;
      z-index: 999999;
    }
    .cms-draw-dropzone {
      outline: 2px solid #60a5fa;
      outline-offset: 2px;
    }
  `;
  document.head.appendChild(drawStyles);

  const toast = document.createElement('div');
  toast.id = 'cms-toast';
  toast.className = 'cms-toast cms-ui';
  toast.innerHTML = '<span></span>';
  document.body.appendChild(toast);

  const settingsDialog = document.createElement('div');
  settingsDialog.id = 'cms-settings-dialog';
  settingsDialog.className = 'cms-settings-dialog cms-ui';
  settingsDialog.innerHTML = `
    <div class="cms-settings-dialog__backdrop" data-settings-close="true"></div>
    <div class="cms-settings-dialog__panel" role="dialog" aria-modal="true" aria-labelledby="cms-settings-dialog-title">
      <div class="cms-settings-dialog__header">
        <h3 id="cms-settings-dialog-title">Site settings</h3>
        <button type="button" class="cms-settings-dialog__close" data-settings-close="true">Close</button>
      </div>
      <div class="cms-settings-dialog__body"></div>
    </div>
  `;
  document.body.appendChild(settingsDialog);

  const publishShortcutButton = document.createElement('button');
  publishShortcutButton.id = 'cms-publish-shortcut';
  publishShortcutButton.classList.add('cms-ui');
  publishShortcutButton.type = 'button';
  publishShortcutButton.setAttribute('aria-label', 'Publish site');
  publishShortcutButton.innerHTML = `
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M14.5 3c3.1 0 6.5 1.4 6.5 4.5 0 3.2-2.2 6.9-6.4 9.8l-2.2-2.2c2.5-1.8 4.1-4.3 4.1-6.4 0-.9-.3-1.7-.9-2.3-.6-.6-1.4-.9-2.3-.9-2.1 0-4.6 1.6-6.4 4.1L4.7 7.4C7.6 3.2 11.3 1 14.5 1v2zM6.2 12.5 3 15.7V21h5.3l3.2-3.2-2.3-2.3-2 2H6v-1.2l2-2-1.8-1.8zM14 6.5a2 2 0 1 0 0 4 2 2 0 0 0 0-4z" />
    </svg>
  `;

  const toggleButton = document.createElement('button');
  toggleButton.id = 'cms-toggle';
  toggleButton.classList.add('cms-ui');
  toggleButton.textContent = 'Edit';
  floatingActions.appendChild(publishShortcutButton);
  floatingActions.appendChild(toggleButton);

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
        <div class="cms-field cms-field--toggle">
          <label class="cms-toggle">
            <span>Reorder mode</span>
            <input id="cms-reorder-toggle" type="checkbox" />
            <span class="cms-toggle__control" aria-hidden="true"></span>
          </label>
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
        <div class="cms-field cms-field--text">
          <label for="cms-value">Content</label>
          <textarea id="cms-value" placeholder="Type content here..."></textarea>
        </div>
        <div class="cms-field cms-field--image">
          <label for="cms-image-url">Image URL</label>
          <div id="cms-image-preview" class="cms-image-preview cms-image-preview--interactive">
            <span class="cms-image-preview__empty">No image selected</span>
            <button type="button" class="cms-image-preview__delete" aria-label="Remove image" title="Remove image">
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="M9 3h6l1 2h4v2H4V5h4l1-2zm1 6h2v9h-2V9zm4 0h2v9h-2V9z" />
              </svg>
            </button>
          </div>
          <p class="cms-image-help">Double-click the preview to upload or choose Gallery to reuse uploaded images.</p>
          <div class="cms-image-controls">
            <input id="cms-image-url" type="url" placeholder="https://example.com/image.png" />
            <button type="button" id="cms-open-gallery">Gallery</button>
          </div>
          <input id="cms-image-file" class="cms-image-file" type="file" accept="image/*" />
        </div>
        <div class="cms-quick-styles">
          <div class="cms-quick-styles__title">Quick Styles</div>
          <div class="cms-quick-styles__grid">
            <div class="cms-quick-style">
              <div class="cms-quick-style__label">
                <span>Text Color</span>
                <button type="button" class="cms-eye-dropper" data-quick-picker="text" aria-label="Pick text color">
                  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                    <path d="M14.7 3.3a2.5 2.5 0 0 1 3.5 3.5l-1.1 1.1-3.5-3.5 1.1-1.1zM4 14.5 13.1 5.4l3.5 3.5L7.5 18H4v-3.5zM3 19h18v2H3z" />
                  </svg>
                </button>
                <input id="cms-quick-text-color" class="cms-quick-style-input" type="color" value="#111827" aria-label="Quick text color" />
              </div>
              <div class="cms-quick-style__swatches" data-quick-styles="text"></div>
            </div>
            <div class="cms-quick-style">
              <div class="cms-quick-style__label">
                <span>Background</span>
                <button type="button" class="cms-eye-dropper" data-quick-picker="background" aria-label="Pick background color">
                  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                    <path d="M14.7 3.3a2.5 2.5 0 0 1 3.5 3.5l-1.1 1.1-3.5-3.5 1.1-1.1zM4 14.5 13.1 5.4l3.5 3.5L7.5 18H4v-3.5zM3 19h18v2H3z" />
                  </svg>
                </button>
                <input id="cms-quick-bg-color" class="cms-quick-style-input" type="color" value="#ffffff" aria-label="Quick background color" />
              </div>
              <div class="cms-quick-style__swatches" data-quick-styles="background"></div>
            </div>
          </div>
        </div>
        <div class="cms-field cms-field--link" id="cms-link-field">
          <label for="cms-link">Link URL</label>
          <input id="cms-link" type="text" placeholder="https://example.com or #section" />
        </div>
        <button id="cms-save">Save</button>
        <div class="cms-advanced">
          <button type="button" class="cms-advanced__toggle" id="cms-advanced-toggle" aria-expanded="false">
            <span>Advanced</span>
            <span class="cms-advanced__chevron">⌄</span>
          </button>
          <div class="cms-advanced__content" id="cms-advanced-content">
            <div class="cms-field cms-field--toggle">
              <label class="cms-toggle">
                <span class="cms-toggle__label cms-toggle__label--data">
                  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                    <path d="M12 3C7.58 3 4 4.79 4 7v10c0 2.21 3.58 4 8 4s8-1.79 8-4V7c0-2.21-3.58-4-8-4zm0 2c3.31 0 6 .99 6 2s-2.69 2-6 2-6-.99-6-2 2.69-2 6-2zm0 6c3.31 0 6-.99 6-2v3c0 1.01-2.69 2-6 2s-6-.99-6-2V9c0 1.01 2.69 2 6 2zm0 8c-3.31 0-6-.99-6-2v-3c0 1.01 2.69 2 6 2s6-.99 6-2v3c0 1.01-2.69 2-6 2z" />
                  </svg>
                  <span>Connect to Data</span>
                </span>
                <input id="cms-backend-toggle" type="checkbox" />
                <span class="cms-toggle__control" aria-hidden="true"></span>
              </label>
            </div>
            <div class="cms-field" id="cms-key-field">
              <label for="cms-key">Element Key</label>
              <input id="cms-key" type="text" placeholder="auto.tag.hash" />
            </div>
            <div class="cms-field">
              <label for="cms-component-id">Component ID</label>
              <div class="cms-action-row">
                <input id="cms-component-id" type="text" placeholder="header.primary" list="cms-component-options" />
                <button type="button" id="cms-component-clear">Clear</button>
              </div>
              <datalist id="cms-component-options"></datalist>
            </div>
            <div class="cms-field">
              <label class="cms-toggle">
                <span>Component source</span>
                <input id="cms-component-source" type="checkbox" />
                <span class="cms-toggle__control" aria-hidden="true"></span>
              </label>
            </div>
            <div class="cms-field cms-backend-only">
              <label class="cms-toggle">
                <span>Repeat items</span>
                <input id="cms-repeat-toggle" type="checkbox" />
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
          </div>
        </div>
        <div class="grid grid-cols-2 gap-4 mt-4">
          <button id="cms-clone" type="button">Clone</button>
          <button id="cms-delete" type="button">Delete</button>
        </div>
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
        <div class="cms-field cms-layout-actions">
          <label>Group elements</label>
          <p class="cms-field__hint">Wrap elements to apply grid or flex layouts.</p>
          <div class="cms-action-row">
            <button type="button" id="cms-group">Group selection</button>
            <button type="button" id="cms-ungroup">Ungroup</button>
          </div>
        </div>
        <div class="cms-field cms-grid-controls">
          <label>Grid columns</label>
          <div class="cms-grid-controls__row">
            <button type="button" id="cms-grid-decrease">-</button>
            <span id="cms-grid-count">0</span>
            <button type="button" id="cms-grid-increase">+</button>
          </div>
          <p class="cms-field__hint">Use on containers when you want a grid layout.</p>
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
      <div class="cms-gallery__tabs" role="tablist">
        <button type="button" class="cms-gallery__tab is-active" data-gallery-tab="uploads" role="tab">Uploaded Images</button>
        <button type="button" class="cms-gallery__tab" data-gallery-tab="remote" role="tab">Remote URLs</button>
      </div>
      <div class="cms-gallery__body">
        <div class="cms-gallery__content" data-gallery-content="uploads">
          <div class="cms-gallery__grid" data-gallery-section="uploads"></div>
        </div>
        <div class="cms-gallery__content" data-gallery-content="remote">
          <div class="cms-gallery__grid" data-gallery-section="remote"></div>
        </div>
        <p class="cms-gallery__empty">No images found yet.</p>
      </div>
    </div>
  `;
  document.body.appendChild(gallery);

  const resizeOverlay = document.createElement('div');
  resizeOverlay.className = 'cms-resize-overlay cms-ui';
  resizeOverlay.innerHTML = `
    <span class="cms-resize-handle cms-resize-handle--n" data-resize-handle="n"></span>
    <span class="cms-resize-handle cms-resize-handle--s" data-resize-handle="s"></span>
    <span class="cms-resize-handle cms-resize-handle--e" data-resize-handle="e"></span>
    <span class="cms-resize-handle cms-resize-handle--w" data-resize-handle="w"></span>
    <span class="cms-resize-handle cms-resize-handle--se" data-resize-handle="se"></span>
  `;
  document.body.appendChild(resizeOverlay);

  const quickColorMenu = document.createElement('div');
  quickColorMenu.className = 'cms-quick-colors cms-ui';
  quickColorMenu.innerHTML = `
    <label>
      Text
      <input type="color" data-quick-color="text" />
    </label>
    <label>
      Background
      <input type="color" data-quick-color="background" />
    </label>
  `;
  document.body.appendChild(quickColorMenu);

  const pagesToggleButton = floatingMenu.querySelector('#cms-pages-toggle');
  const pagesDropdown = floatingMenu.querySelector('#cms-pages-dropdown');
  const pagesSelect = floatingMenu.querySelector('#cms-pages-select');
  const pageNameInput = floatingMenu.querySelector('#cms-page-name');
  const pageCreateButton = floatingMenu.querySelector('#cms-page-create');
  const pageDeleteButton = floatingMenu.querySelector('#cms-page-delete');
  const effectsButton = floatingMenu.querySelector('#cms-effects-button');
  const settingsMenuButton = floatingMenu.querySelector('#cms-settings-button');
  const drawButton = floatingMenu.querySelector('#cms-draw-button');
  const xrayButton = floatingMenu.querySelector('#cms-xray-button');
  const publishMenuButton = floatingMenu.querySelector('#cms-publish-button');
  const floatingMinimizeButton = floatingMenu.querySelector('.cms-floating-menu__minimize');
  const settingsDialogBody = settingsDialog.querySelector('.cms-settings-dialog__body');
  const settingsDialogClose = settingsDialog.querySelector('.cms-settings-dialog__close');

  const keyFieldWrapper = sidebar.querySelector('#cms-key-field');
  let keyField = sidebar.querySelector('#cms-key');
  const componentIdInput = sidebar.querySelector('#cms-component-id');
  const componentOptionsList = sidebar.querySelector('#cms-component-options');
  const componentClearButton = sidebar.querySelector('#cms-component-clear');
  const componentSourceToggle = sidebar.querySelector('#cms-component-source');
  const backendToggle = sidebar.querySelector('#cms-backend-toggle');
  const repeatToggle = sidebar.querySelector('#cms-repeat-toggle');
  const serviceSelect = sidebar.querySelector('#cms-service');
  const serviceForm = sidebar.querySelector('#cms-service-form');
  const serviceAliasInput = sidebar.querySelector('#cms-service-alias');
  const serviceUrlInput = sidebar.querySelector('#cms-service-url');
  const serviceOkButton = sidebar.querySelector('#cms-service-ok');
  const serviceCancelButton = sidebar.querySelector('#cms-service-cancel');
  const quickColorPicker = document.createElement('input');
  quickColorPicker.type = 'color';
  quickColorPicker.className = 'cms-quick-style-picker';
  quickColorPicker.setAttribute('aria-hidden', 'true');
  quickColorPicker.tabIndex = -1;
  document.body.appendChild(quickColorPicker);
  const valueInput = sidebar.querySelector('#cms-value');
  const linkInput = sidebar.querySelector('#cms-link');
  const typeInputs = sidebar.querySelectorAll('input[name="cms-type"]');
  const imageUrlInput = sidebar.querySelector('#cms-image-url');
  const imageFileInput = sidebar.querySelector('#cms-image-file');
  const imagePreview = sidebar.querySelector('#cms-image-preview');
  const imagePreviewDelete = sidebar.querySelector('.cms-image-preview__delete');
  const saveButton = sidebar.querySelector('#cms-save');
  const cloneButton = sidebar.querySelector('#cms-clone');
  const reorderToggle = sidebar.querySelector('#cms-reorder-toggle');
  const gridDecreaseButton = sidebar.querySelector('#cms-grid-decrease');
  const gridIncreaseButton = sidebar.querySelector('#cms-grid-increase');
  const gridCountLabel = sidebar.querySelector('#cms-grid-count');
  const groupButton = sidebar.querySelector('#cms-group');
  const ungroupButton = sidebar.querySelector('#cms-ungroup');
  const advancedToggle = sidebar.querySelector('#cms-advanced-toggle');
  const advancedContent = sidebar.querySelector('#cms-advanced-content');
  const quickTextSwatches = sidebar.querySelector('[data-quick-styles="text"]');
  const quickBgSwatches = sidebar.querySelector('[data-quick-styles="background"]');
  const deleteButton = sidebar.querySelector('#cms-delete');
  const publishButton = sidebar.querySelector('#cms-publish');
  const siteNameInput = sidebar.querySelector('#cms-sitename');
  const siteNameSaveButton = sidebar.querySelector('#cms-save-sitename');
  const settingsMessageEl = sidebar.querySelector('#cms-settings-message');
  const messageEl = sidebar.querySelector('#cms-message');
  const siteField = sidebar.querySelector('.cms-field--site');
  const listEl = sidebar.querySelector('#cms-list');
  const emptyEl = sidebar.querySelector('#cms-empty');
  const fileSelect = sidebar.querySelector('#cms-file');
  const dockButtons = sidebar.querySelectorAll('.cms-dock__buttons button');
  const dockArrowButtons = sidebar.querySelectorAll('.cms-dock__arrows button');
  const tabs = sidebar.querySelectorAll('.cms-tabs button');
  const panels = sidebar.querySelectorAll('.cms-panel');
  const quickPickerButtons = sidebar.querySelectorAll('[data-quick-picker]');
  const textColorInput = sidebar.querySelector('#cms-text-color');
  const quickTextColorInput = sidebar.querySelector('#cms-quick-text-color');
  const quickBgColorInput = sidebar.querySelector('#cms-quick-bg-color');
  const backgroundColorInput = sidebar.querySelector('#cms-bg-color');
  const fontSizeInput = sidebar.querySelector('#cms-font-size');
  const flexSelect = sidebar.querySelector('#cms-flex');
  const flexField = sidebar.querySelector('.cms-field--flex');
  const fontSizeField = sidebar.querySelector('.cms-field--font-size');
  const wireframeTools = sidebar.querySelectorAll('[data-wireframe-tool]');
  const galleryOpenButton = sidebar.querySelector('#cms-open-gallery');
  const galleryUploads = gallery.querySelector('[data-gallery-section="uploads"]');
  const galleryRemote = gallery.querySelector('[data-gallery-section="remote"]');
  const galleryTabs = gallery.querySelectorAll('[data-gallery-tab]');
  const galleryContents = gallery.querySelectorAll('[data-gallery-content]');
  const galleryEmpty = gallery.querySelector('.cms-gallery__empty');
  const settingsDialogOriginalParent = siteField?.parentElement || null;
  const settingsMessageParent = settingsMessageEl?.parentElement || null;
  const settingsNextSibling = siteField?.nextSibling || null;

  let sidebarPosition = localStorage.getItem(POSITION_STORAGE_KEY) || 'right';
  let siteName = '';
  let galleryAssets = { uploads: [], remote: [] };
  let layoutSaveTimer = null;
  let lastComponentId = '';
  deleteButton.disabled = true;
  cloneButton.disabled = true;
  loadQuickStyleHistory();
  renderQuickStyles();

  function handleBackendKeyChange(event) {
    if (!backendToggle.checked) return;
    const path = event.target.value;
    if (!path) return;
    setBackendValueForKey(path);
  }

  function replaceKeyField(withSelect) {
    if (!keyFieldWrapper) return;
    const currentValue = keyField ? keyField.value : '';
    if (withSelect && keyField?.tagName === 'SELECT') return;
    if (!withSelect && keyField?.tagName === 'INPUT') return;
    const nextField = document.createElement(withSelect ? 'select' : 'input');
    nextField.id = 'cms-key';
    if (withSelect) {
      nextField.addEventListener('change', handleBackendKeyChange);
    } else {
      nextField.type = 'text';
      nextField.placeholder = 'auto.tag.hash';
    }
    keyFieldWrapper.replaceChild(nextField, keyField);
    keyField = nextField;
    if (currentValue) {
      keyField.value = currentValue;
    }
  }

  function getActivePanel() {
    return document.querySelector('.cms-panel.active')?.dataset.panel || '';
  }

  function isContentPanelActive() {
    return getActivePanel() === 'content';
  }

  function isLayoutModeEnabled() {
    return editMode && (isWireframeEnabled() || isContentPanelActive());
  }

  function updateLayoutMode() {
    const enabled = isLayoutModeEnabled();
    document.body.classList.toggle('cms-layout-mode', enabled);
    setLayoutDragState(enabled);
    updateCloneState();
    if (!enabled) {
      hideResizeOverlay();
      hideQuickColorMenu();
      clearReorderIndicator();
      return;
    }
    updateResizeOverlay(selectedElement);
  }

  function setWireframeState(enabled) {
    if (enabled && !editMode) {
      setEditMode(true);
    }
    document.body.classList.toggle('cms-wireframe', enabled);
    localStorage.setItem(WIREFRAME_STORAGE_KEY, enabled ? 'true' : 'false');
    toggleButton.disabled = enabled;
    updateLayoutMode();
    if (!enabled) {
      reorderMode = false;
      if (reorderToggle) {
        reorderToggle.checked = false;
      }
    }
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
    keyField.value = '';
    if (componentIdInput) componentIdInput.value = '';
    if (componentSourceToggle) {
      componentSourceToggle.checked = false;
      componentSourceToggle.disabled = true;
    }
    valueInput.value = '';
    linkInput.value = '';
    imageUrlInput.value = '';
    imageFileInput.value = '';
    imagePreview.textContent = 'No image selected';
    imagePreview.style.backgroundImage = 'none';
    deleteButton.disabled = true;
    textValueDirty = false;
    updateGridControls(null);
    updateCloneState();
    updateGroupControls();
  }

  function updateSiteName(value) {
    siteName = sanitizeSiteName(value);
    siteNameInput.value = siteName;
    if (!siteName) {
      siteNameInput.placeholder = 'required for publishing';
    }
  }

  function getComponentId(value) {
    return (value || '').trim();
  }

  function clearComponentSelection() {
    if (!selectedElement) return;
    selectedElement.removeAttribute('data-component-id');
    selectedElement.removeAttribute('data-component-source');
    if (componentIdInput) {
      componentIdInput.value = '';
    }
    if (componentSourceToggle) {
      componentSourceToggle.checked = false;
      componentSourceToggle.disabled = true;
    }
    lastComponentId = '';
    scheduleLayoutPersist();
  }

  function getComponentSource(componentId) {
    if (!componentId) return null;
    return document.querySelector(
      `[data-component-id="${CSS.escape(componentId)}"][data-component-source="true"]`
    );
  }

  async function applyComponentFromDisk(componentId) {
    if (!selectedElement || !componentId) return;
    if (selectedElement.getAttribute('data-component-source') === 'true') return;
    try {
      const res = await fetch(`/api/components?id=${encodeURIComponent(componentId)}`);
      if (!res.ok) return;
      const data = await res.json();
      if (!data.html) return;
      const wrapper = document.createElement('div');
      wrapper.innerHTML = data.html.trim();
      const nextNode = wrapper.firstElementChild;
      if (!nextNode) return;
      nextNode.removeAttribute('data-component-source');
      nextNode.setAttribute('data-component-id', componentId);
      selectedElement.replaceWith(nextNode);
      selectedElement = nextNode;
      selectElement(nextNode);
      scheduleLayoutPersist();
    } catch (err) {
      console.warn('Unable to apply component from disk', err);
    }
  }

  function syncComponentInstances(componentId) {
    if (!componentId) return;
    const source = getComponentSource(componentId);
    if (!source) return;
    const instances = Array.from(
      document.querySelectorAll(`[data-component-id="${CSS.escape(componentId)}"]`)
    );
    instances.forEach((instance) => {
      if (instance === source) return;
      const clone = source.cloneNode(true);
      clone.removeAttribute('data-component-source');
      clone.setAttribute('data-component-id', componentId);
      instance.replaceWith(clone);
      if (selectedElement === instance) {
        selectedElement = clone;
        selectElement(clone);
      }
    });
  }

  function syncAllComponents() {
    const ids = new Set(
      Array.from(document.querySelectorAll('[data-component-id]')).map((el) =>
        el.getAttribute('data-component-id')
      )
    );
    ids.forEach((id) => syncComponentInstances(id));
  }

  function setComponentSource(componentId, sourceEl) {
    if (!componentId || !sourceEl) return;
    document
      .querySelectorAll(`[data-component-id="${CSS.escape(componentId)}"][data-component-source="true"]`)
      .forEach((el) => {
        if (el !== sourceEl) el.removeAttribute('data-component-source');
      });
    sourceEl.setAttribute('data-component-source', 'true');
  }

  function clearMessage() {
    messageEl.textContent = '';
    messageEl.style.color = '#16a34a';
  }

  function clearSettingsMessage() {
    settingsMessageEl.textContent = '';
    settingsMessageEl.style.color = '#16a34a';
  }

  function showToast(message, type = 'info') {
    const label = toast.querySelector('span');
    if (label) {
      label.textContent = message;
    }
    toast.classList.remove('is-info', 'is-success', 'is-error', 'is-visible');
    toast.classList.add('is-visible', `is-${type}`);
    window.clearTimeout(showToast.hideTimer);
    showToast.hideTimer = window.setTimeout(() => {
      toast.classList.remove('is-visible');
    }, 3000);
  }

  function openSettingsDialog() {
    if (!siteField || !settingsMessageEl) return;
    if (settingsDialog.classList.contains('is-visible')) return;
    settingsDialogBody.appendChild(siteField);
    settingsDialogBody.appendChild(settingsMessageEl);
    settingsDialog.classList.add('is-visible');
  }

  function closeSettingsDialog() {
    if (!settingsDialog.classList.contains('is-visible')) return;
    if (settingsDialogOriginalParent && siteField) {
      settingsDialogOriginalParent.insertBefore(siteField, settingsNextSibling);
    }
    if (settingsMessageParent && settingsMessageEl) {
      settingsMessageParent.appendChild(settingsMessageEl);
    }
    settingsDialog.classList.remove('is-visible');
  }

  function togglePagesDropdown(forceState) {
    const nextState = typeof forceState === 'boolean'
      ? forceState
      : !pagesDropdown.classList.contains('is-open');
    pagesDropdown.classList.toggle('is-open', nextState);
  }

  function handleMenuDismiss(event) {
    if (!pagesDropdown.classList.contains('is-open')) return;
    if (floatingMenu.contains(event.target)) return;
    togglePagesDropdown(false);
  }

  function handleSettingsDialogClick(event) {
    const target = event.target;
    if (!target) return;
    if (target.dataset.settingsClose) {
      closeSettingsDialog();
    }
  }

  function handleMenuDragStart(event) {
    if (event.button !== 0) return;
    if (event.target.closest('button, select, option, input, .cms-floating-menu__dropdown')) return;
    const rect = floatingMenu.getBoundingClientRect();
    isMenuDragging = true;
    menuDragOffsetX = event.clientX - rect.left;
    menuDragOffsetY = event.clientY - rect.top;
    floatingMenu.classList.add('is-dragging');
    floatingMenu.style.transform = 'none';
    window.addEventListener('mousemove', handleMenuDragMove);
    window.addEventListener('mouseup', handleMenuDragEnd);
  }

  function handleMenuDragMove(event) {
    if (!isMenuDragging) return;
    floatingMenu.style.left = `${event.clientX - menuDragOffsetX}px`;
    floatingMenu.style.top = `${event.clientY - menuDragOffsetY}px`;
  }

  function handleMenuDragEnd() {
    if (!isMenuDragging) return;
    isMenuDragging = false;
    floatingMenu.classList.remove('is-dragging');
    window.removeEventListener('mousemove', handleMenuDragMove);
    window.removeEventListener('mouseup', handleMenuDragEnd);
  }

  async function triggerPublishWithFeedback(button) {
    if (!button || button.disabled) return;
    button.classList.remove('is-error');
    button.classList.add('is-publishing');
    button.disabled = true;
    const success = await publishStaticSite();
    button.classList.remove('is-publishing');
    if (!success) {
      button.classList.add('is-error');
      window.setTimeout(() => {
        button.classList.remove('is-error');
      }, 3000);
    }
    button.disabled = editMode && button === publishShortcutButton;
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

  function updateResizeOverlay(target) {
    if (!editMode || !isLayoutModeEnabled() || !target || isCmsUi(target)) {
      hideResizeOverlay();
      return;
    }
    const rect = target.getBoundingClientRect();
    resizeOverlay.style.display = 'block';
    resizeOverlay.style.width = `${rect.width}px`;
    resizeOverlay.style.height = `${rect.height}px`;
    resizeOverlay.style.left = `${rect.left + window.scrollX}px`;
    resizeOverlay.style.top = `${rect.top + window.scrollY}px`;
  }

  function hideResizeOverlay() {
    resizeOverlay.style.display = 'none';
  }

  function hideQuickColorMenu() {
    quickColorMenu.classList.remove('is-visible');
  }

  function showQuickColorMenu(target) {
    if (!target) return;
    const computed = window.getComputedStyle(target);
    const textInput = quickColorMenu.querySelector('[data-quick-color="text"]');
    const bgInput = quickColorMenu.querySelector('[data-quick-color="background"]');
    if (textInput) {
      textInput.value = rgbToHex(computed.color);
    }
    if (bgInput) {
      bgInput.value = rgbToHex(computed.backgroundColor);
    }
    const rect = target.getBoundingClientRect();
    quickColorMenu.style.left = `${rect.left + window.scrollX}px`;
    quickColorMenu.style.top = `${rect.bottom + window.scrollY + 8}px`;
    quickColorMenu.classList.add('is-visible');
  }

  function handleResizeStart(event) {
    const handle = event.target.closest('[data-resize-handle]');
    if (!handle || !selectedElement || !isLayoutModeEnabled()) return;
    event.preventDefault();
    event.stopPropagation();
    const rect = selectedElement.getBoundingClientRect();
    const computed = window.getComputedStyle(selectedElement);
    resizeState = {
      handle: handle.dataset.resizeHandle,
      startX: event.clientX,
      startY: event.clientY,
      startWidth: rect.width,
      startHeight: rect.height,
      baseFontSize: Number.parseFloat(computed.fontSize) || 16,
      baseHeight: rect.height,
    };
    document.body.classList.add('cms-resizing');
    window.addEventListener('mousemove', handleResizeMove);
    window.addEventListener('mouseup', handleResizeEnd);
  }

  function handleResizeMove(event) {
    if (!resizeState || !selectedElement) return;
    const dx = event.clientX - resizeState.startX;
    const dy = event.clientY - resizeState.startY;
    let nextWidth = resizeState.startWidth;
    let nextHeight = resizeState.startHeight;
    if (resizeState.handle.includes('e')) {
      nextWidth = resizeState.startWidth + dx;
    }
    if (resizeState.handle.includes('w')) {
      nextWidth = resizeState.startWidth - dx;
    }
    if (resizeState.handle.includes('s')) {
      nextHeight = resizeState.startHeight + dy;
    }
    if (resizeState.handle.includes('n')) {
      nextHeight = resizeState.startHeight - dy;
    }
    nextWidth = Math.max(40, nextWidth);
    nextHeight = Math.max(30, nextHeight);
    selectedElement.style.width = `${nextWidth}px`;
    selectedElement.style.height = `${nextHeight}px`;
    if (isTextElement(selectedElement)) {
      const ratio = nextHeight / resizeState.baseHeight;
      const nextFont = Math.max(8, Math.round(resizeState.baseFontSize * ratio));
      selectedElement.style.fontSize = `${nextFont}px`;
      fontSizeInput.value = String(nextFont);
    }
    updateResizeOverlay(selectedElement);
  }

  function handleResizeEnd() {
    if (!resizeState) return;
    resizeState = null;
    document.body.classList.remove('cms-resizing');
    window.removeEventListener('mousemove', handleResizeMove);
    window.removeEventListener('mouseup', handleResizeEnd);
    scheduleLayoutPersist();
  }

  function buildApiUrl() {
    const query = new URLSearchParams();
    query.set('file', currentFile);
    return `${API_ENDPOINT}?${query.toString()}`;
  }

  function navigateToFile(file) {
    const nextPath = file === 'index.html' ? '/' : `/${file}`;
    window.location.href = nextPath;
  }

  function normalizePageName(value) {
    return (value || '')
      .trim()
      .replace(/\s+/g, '-')
      .replace(/[^a-zA-Z0-9-_]/g, '')
      .toLowerCase();
  }

  async function createPage(fileName) {
    const safeName = normalizePageName(fileName);
    if (!safeName) {
      showToast('Enter a page name first.', 'error');
      return;
    }
    try {
      const res = await fetch('/api/files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file: safeName }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Unable to create page.');
      }
      await loadFiles();
      pageNameInput.value = '';
      togglePagesDropdown(false);
      navigateToFile(`${safeName}.html`);
    } catch (err) {
      showToast(err.message || 'Unable to create page.', 'error');
    }
  }

  async function deletePage(fileName) {
    if (!fileName) {
      showToast('Select a page to delete.', 'error');
      return;
    }
    const confirmed = window.confirm(`Delete ${fileName}? This cannot be undone.`);
    if (!confirmed) return;
    try {
      const res = await fetch('/api/files', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file: fileName }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Unable to delete page.');
      }
      const data = await res.json().catch(() => ({}));
      const nextFile = data.files?.[0] || 'index.html';
      togglePagesDropdown(false);
      if (fileName === currentFile) {
        navigateToFile(nextFile);
      } else {
        await loadFiles();
      }
    } catch (err) {
      showToast(err.message || 'Unable to delete page.', 'error');
    }
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
      populatePagesSelect();
    } catch (err) {
      const fallbackOption = document.createElement('option');
      fallbackOption.value = currentFile;
      fallbackOption.textContent = currentFile;
      fileSelect.innerHTML = '';
      fileSelect.appendChild(fallbackOption);
      populatePagesSelect();
    }
  }

  async function loadComponentOptions() {
    if (!componentOptionsList) return;
    try {
      const res = await fetch('/api/components');
      if (!res.ok) throw new Error('Unable to fetch components');
      const data = await res.json();
      const components = Array.isArray(data.components) ? data.components : [];
      componentOptionsList.innerHTML = '';
      components.forEach((componentId) => {
        const option = document.createElement('option');
        option.value = componentId;
        componentOptionsList.appendChild(option);
      });
    } catch (err) {
      componentOptionsList.innerHTML = '';
    }
  }

  function populatePagesSelect() {
    if (!pagesSelect || !fileSelect) return;
    pagesSelect.innerHTML = '';
    Array.from(fileSelect.options).forEach((option) => {
      const nextOption = document.createElement('option');
      nextOption.value = option.value;
      nextOption.textContent = option.textContent;
      if (option.value === currentFile) {
        nextOption.selected = true;
      }
      pagesSelect.appendChild(nextOption);
    });
    if (pageDeleteButton) {
      pageDeleteButton.disabled = !pagesSelect.value || pagesSelect.value === 'index.html';
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
      && element.closest('#cms-sidebar, #cms-toggle, .cms-outline, #cms-gallery, .cms-ui');
  }

  function isForbiddenElement(element) {
    if (!element || !element.tagName) return false;
    return ['SCRIPT', 'STYLE', 'META', 'LINK', 'HEAD'].includes(element.tagName);
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
    section.dataset.wireframeCreated = 'true';
    section.dataset.sectionId = `section-${Date.now()}-${Math.random().toString(16).slice(2)}`;

    const label = document.createElement('div');
    label.className = 'cms-wireframe-section__label';
    label.textContent = 'Section';

    const content = document.createElement('div');
    content.className = 'cms-wireframe-section__content';
    content.dataset.wireframeCreated = 'true';

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
      textBlock.dataset.wireframeCreated = 'true';
      if (isWireframeEnabled()) {
        textBlock.setAttribute('draggable', 'true');
      }
      return textBlock;
    }
    if (type === 'circle') {
      const circle = document.createElement('div');
      circle.className =
        'cms-wireframe-shape cms-wireframe-shape--circle cms-wireframe-resizable grid grid-cols-1 gap-4 place-items-center';
      circle.textContent = 'Circle';
      circle.setAttribute('data-cms-text', generateWireframeKey('circle'));
      circle.dataset.wireframeCreated = 'true';
      if (isWireframeEnabled()) {
        circle.setAttribute('draggable', 'true');
      }
      return circle;
    }
    const square = document.createElement('div');
    square.className =
      'cms-wireframe-shape cms-wireframe-resizable grid grid-cols-1 gap-4 place-items-center';
    square.textContent = 'Square';
    square.setAttribute('data-cms-text', generateWireframeKey('square'));
    square.dataset.wireframeCreated = 'true';
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

  function isTextElement(element) {
    return element && element.matches && element.matches('[data-cms-text], .cms-wireframe-text');
  }

  function isImageElement(element) {
    return element && (element.tagName === 'IMG' || element.hasAttribute?.('data-cms-image'));
  }

  function supportsGridLayout(element) {
    if (!element || !element.matches || isCmsUi(element) || isForbiddenElement(element)) return false;
    if (element === document.body || element === document.documentElement) return true;
    return !isTextElement(element) && !isImageElement(element);
  }

  function ensureBoxPlaceholder(box) {
    if (!box) return;
    const placeholder = box.querySelector('[data-cms-box-placeholder="true"]');
    const hasContent = Array.from(box.childNodes).some((node) => {
      if (node === placeholder) return false;
      if (node.nodeType === Node.TEXT_NODE) return node.textContent.trim().length > 0;
      return node.nodeType === Node.ELEMENT_NODE;
    });
    if (hasContent) {
      if (placeholder) {
        placeholder.remove();
      }
      return;
    }
    if (!placeholder) {
      const nextPlaceholder = document.createElement('div');
      nextPlaceholder.textContent = 'Drop content here';
      nextPlaceholder.className = 'text-xs text-gray-400 p-2';
      nextPlaceholder.setAttribute('data-cms-box-placeholder', 'true');
      box.appendChild(nextPlaceholder);
    }
  }

  function setDropZoneHighlight(element) {
    if (drawDropHighlightEl === element) return;
    if (drawDropHighlightEl) {
      drawDropHighlightEl.classList.remove('cms-draw-dropzone');
    }
    drawDropHighlightEl = element;
    if (drawDropHighlightEl) {
      drawDropHighlightEl.classList.add('cms-draw-dropzone');
    }
  }

  function clearDropZoneHighlight() {
    if (drawDropHighlightEl) {
      drawDropHighlightEl.classList.remove('cms-draw-dropzone');
      drawDropHighlightEl = null;
    }
  }

  function findValidDrawContainerAtPoint(x, y) {
    let target = document.elementFromPoint(x, y);
    while (target) {
      if (isCmsUi(target) || isForbiddenElement(target)) {
        target = target.parentElement;
        continue;
      }
      if (target === document.body || target === document.documentElement) {
        return document.body;
      }
      if ((supportsGridLayout(target) || target.hasAttribute('data-cms-group') || isWireframeSection(target))
        && !isTextElement(target)
        && !isImageElement(target)) {
        return target;
      }
      target = target.parentElement;
    }
    return document.body;
  }

  function applyBoxSnapSizing(box, rect, parent) {
    if (!box || !parent) return;
    const parentClasses = Array.from(parent.classList || []);
    const gridColumns = getGridColumnCount(parent);
    const isGrid = parentClasses.includes('grid') || parentClasses.some((name) => name.startsWith('grid-cols-'));
    const computed = window.getComputedStyle(parent);
    const isFlex = parent.style.display === 'flex' || computed.display === 'flex';
    if (isGrid && gridColumns === 12) {
      box.classList.add('col-span-12');
      Array.from(box.classList)
        .filter((name) => name.startsWith('md:col-span-'))
        .forEach((name) => box.classList.remove(name));
      const containerWidth = parent.getBoundingClientRect().width || 1;
      const spanRatio = rect.width / containerWidth;
      const mdSpan = Math.max(1, Math.min(12, Math.round(spanRatio * 12)));
      box.classList.add(`md:col-span-${mdSpan}`);
    } else if (!isGrid && (isFlex || parent === document.body)) {
      box.classList.add('w-full');
    } else if (!isGrid && !isFlex) {
      box.classList.add('w-full');
    }
    Array.from(box.classList)
      .filter((name) => name.startsWith('min-h-'))
      .forEach((name) => box.classList.remove(name));
    if (rect.height < 80) {
      box.classList.add('min-h-12');
    } else if (rect.height < 160) {
      box.classList.add('min-h-24');
    } else {
      box.classList.add('min-h-40');
    }
  }

  function setDrawMode(enabled) {
    if (enabled && !editMode) {
      setEditMode(true);
    }
    drawMode = enabled;
    if (drawButton) {
      drawButton.classList.toggle('is-active', drawMode);
    }
    if (!drawMode) {
      drawState = null;
      if (drawOverlayEl) {
        drawOverlayEl.remove();
        drawOverlayEl = null;
      }
      clearDropZoneHighlight();
    }
  }

  function handleDrawMouseDown(event) {
    if (!editMode || !drawMode) return;
    if (event.button !== 0) return;
    const target = getElementTarget(event.target);
    if (!target || isCmsUi(target) || isForbiddenElement(target)) return;
    drawState = {
      startX: event.clientX,
      startY: event.clientY,
      isDrawing: true,
    };
    if (drawOverlayEl) {
      drawOverlayEl.remove();
    }
    drawOverlayEl = document.createElement('div');
    drawOverlayEl.className = 'cms-draw-overlay cms-ui';
    drawOverlayEl.style.left = `${event.clientX}px`;
    drawOverlayEl.style.top = `${event.clientY}px`;
    drawOverlayEl.style.width = '0px';
    drawOverlayEl.style.height = '0px';
    document.body.appendChild(drawOverlayEl);
    event.preventDefault();
    event.stopPropagation();
  }

  function handleDrawMouseMove(event) {
    if (!editMode || !drawMode || !drawState?.isDrawing || !drawOverlayEl) return;
    const currentX = event.clientX;
    const currentY = event.clientY;
    const left = Math.min(drawState.startX, currentX);
    const top = Math.min(drawState.startY, currentY);
    const width = Math.abs(currentX - drawState.startX);
    const height = Math.abs(currentY - drawState.startY);
    drawOverlayEl.style.left = `${left}px`;
    drawOverlayEl.style.top = `${top}px`;
    drawOverlayEl.style.width = `${width}px`;
    drawOverlayEl.style.height = `${height}px`;
    const container = findValidDrawContainerAtPoint(currentX, currentY);
    drawState.container = container;
    setDropZoneHighlight(container);
  }

  function handleDrawMouseUp(event) {
    if (!editMode || !drawMode || !drawState?.isDrawing) return;
    const currentX = event.clientX;
    const currentY = event.clientY;
    const rect = {
      left: Math.min(drawState.startX, currentX),
      top: Math.min(drawState.startY, currentY),
      width: Math.abs(currentX - drawState.startX),
      height: Math.abs(currentY - drawState.startY),
    };
    if (drawOverlayEl) {
      drawOverlayEl.remove();
      drawOverlayEl = null;
    }
    const container = drawState.container || findValidDrawContainerAtPoint(currentX, currentY);
    clearDropZoneHighlight();
    drawState = null;

    const box = document.createElement('div');
    box.className = 'cms-box cms-wireframe-resizable border border-dashed border-gray-300 bg-white/0 min-h-12';
    box.setAttribute('data-wireframe-created', 'true');
    box.dataset.boxId = `box-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    if (isLayoutModeEnabled()) {
      box.setAttribute('draggable', 'true');
    }
    ensureBoxPlaceholder(box);

    let dropContainer = document.body;
    if (container && isWireframeSection(container)) {
      dropContainer = container.querySelector('.cms-wireframe-section__content') || container;
    } else if (container) {
      dropContainer = getDropContainer(container);
    }
    dropContainer.appendChild(box);
    applyBoxSnapSizing(box, rect, dropContainer);
    scheduleLayoutPersist();
    selectElement(box);
    event.preventDefault();
    event.stopPropagation();
  }

  function getGridColumnCount(element) {
    if (!element || !element.classList) return 0;
    const match = Array.from(element.classList).find((name) => name.startsWith('grid-cols-'));
    if (!match) return 0;
    const value = Number.parseInt(match.replace('grid-cols-', ''), 10);
    return Number.isNaN(value) ? 0 : value;
  }

  function ensureGridLayout(element, columns = 1, force = false) {
    if (!supportsGridLayout(element)) return;
    if (!force && element.dataset?.wireframeCreated !== 'true') return;
    if (!element.classList.contains('grid')) {
      element.classList.add('grid');
    }
    if (!Array.from(element.classList).some((name) => name.startsWith('gap-'))) {
      element.classList.add('gap-4');
    }
    if (getGridColumnCount(element) === 0) {
      element.classList.add(`grid-cols-${columns}`);
    }
  }

  function setGridColumnCount(element, count) {
    if (!element || !element.classList) return;
    const nextCount = Math.max(1, Math.min(12, count));
    element.style.display = 'grid';
    Array.from(element.classList)
      .filter((name) => name.startsWith('grid-cols-'))
      .forEach((name) => element.classList.remove(name));
    element.classList.add(`grid-cols-${nextCount}`);
    ensureGridLayout(element, nextCount, true);
    updateGridControls(element);
    scheduleLayoutPersist();
  }

  function updateGridControls(element) {
    if (!gridCountLabel || !gridDecreaseButton || !gridIncreaseButton) return;
    if (!element || !supportsGridLayout(element)) {
      gridCountLabel.textContent = '-';
      gridDecreaseButton.disabled = true;
      gridIncreaseButton.disabled = true;
      return;
    }
    const count = getGridColumnCount(element);
    gridCountLabel.textContent = String(count || 0);
    gridDecreaseButton.disabled = count <= 1;
    gridIncreaseButton.disabled = count >= 12;
  }

  function clearReorderIndicator() {
    if (dropTarget) {
      dropTarget.classList.remove('cms-reorder-before', 'cms-reorder-after');
    }
    dropTargetPosition = null;
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
      && !isCmsUi(element)
      && !isForbiddenElement(element);
  }

  function setLayoutDragState(enabled) {
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
      clearReorderIndicator();
      document.body.classList.remove('cms-drag-active');
    }
  }

  function clearDropTarget() {
    if (dropTarget) {
      dropTarget.classList.remove('cms-drop-target');
      dropTarget = null;
      dropTargetPosition = null;
    }
  }

  function handleDragStart(event) {
    if (!isLayoutModeEnabled()) return;
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
    const toolType = activeWireframeTool || event.dataTransfer.getData('application/x-wireframe-tool');
    if (toolType) {
      if (!isWireframeEnabled()) return;
      const target = getElementTarget(event.target);
      if (!isCmsUi(target)) {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
      }
      return;
    }
    if (!isLayoutModeEnabled()) return;
    if (!draggedElement) return;
    const target = getElementTarget(event.target);
    if (!isValidDragElement(target) || target === draggedElement || target.contains(draggedElement)) {
      clearDropTarget();
      clearReorderIndicator();
      return;
    }
    if (reorderMode) {
      const targetParent = target.parentElement;
      if (!targetParent || targetParent !== draggedElement.parentElement) {
        clearDropTarget();
        clearReorderIndicator();
        return;
      }
      const sectionContent = resolveSectionContainer(targetParent);
      if (!sectionContent || sectionContent !== targetParent) {
        clearDropTarget();
        clearReorderIndicator();
        return;
      }
      event.preventDefault();
      if (dropTarget !== target) {
        clearDropTarget();
        clearReorderIndicator();
        dropTarget = target;
      }
      const rect = target.getBoundingClientRect();
      dropTargetPosition = event.clientX > rect.left + rect.width / 2 ? 'after' : 'before';
      dropTarget.classList.remove('cms-reorder-before', 'cms-reorder-after');
      dropTarget.classList.add(
        dropTargetPosition === 'after' ? 'cms-reorder-after' : 'cms-reorder-before'
      );
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
    const toolType = activeWireframeTool || event.dataTransfer.getData('application/x-wireframe-tool');
    if (toolType) {
      if (!isWireframeEnabled()) return;
      const target = getElementTarget(event.target);
      if (isCmsUi(target)) return;
      event.preventDefault();
      const element = buildWireframeElement(toolType);
      if (toolType === 'section') {
        const targetSection = target.closest('[data-wireframe-section="true"]');
        if (targetSection && targetSection.parentElement) {
          targetSection.parentElement.insertBefore(element, targetSection);
        } else {
          document.body.appendChild(element);
        }
      } else {
        const container = getDropContainer(target);
        container.appendChild(element);
      }
      activeWireframeTool = null;
      persistLayout();
      return;
    }
    if (!isLayoutModeEnabled()) return;
    if (!draggedElement || !dropTarget) return;
    event.preventDefault();
    if (reorderMode) {
      const parent = dropTarget.parentNode;
      if (!parent) return;
      const referenceNode = dropTargetPosition === 'after' ? dropTarget.nextSibling : dropTarget;
      if (referenceNode !== draggedElement) {
        parent.insertBefore(draggedElement, referenceNode);
      }
    } else {
      const dropContainer = resolveSectionContainer(dropTarget) || dropTarget;
      if (dropContainer && dropContainer !== draggedElement.parentNode) {
        dropContainer.appendChild(draggedElement);
      }
    }
    clearDropTarget();
    clearReorderIndicator();
    if (draggedElement?.classList?.contains('cms-box')) {
      ensureBoxPlaceholder(draggedElement);
    }
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
    clearReorderIndicator();
    document.body.classList.remove('cms-drag-active');
  }

  function updateCloneState() {
    cloneButton.disabled = !editMode || !selectedElement || !isLayoutModeEnabled();
  }

  function stripCloneUiState(el) {
    el.classList.remove('cms-outlined', 'cms-dragging', 'cms-drop-target');
  }

  function remapCloneKeys(el) {
    const nodes = [el, ...el.querySelectorAll('[data-cms-text],[data-cms-image],[data-cms-bg]')];
    nodes.forEach((node) => {
      if (node.hasAttribute('data-cms-text')) {
        const key = node.getAttribute('data-cms-text');
        if (key) node.setAttribute('data-cms-text', ensureUniqueKey(key));
      }
      if (node.hasAttribute('data-cms-image')) {
        const key = node.getAttribute('data-cms-image');
        if (key) node.setAttribute('data-cms-image', ensureUniqueKey(key));
      }
      if (node.hasAttribute('data-cms-bg')) {
        const key = node.getAttribute('data-cms-bg');
        if (key) node.setAttribute('data-cms-bg', ensureUniqueKey(key));
      }
      if (node.matches('[data-wireframe-section="true"]')) {
        node.dataset.sectionId = `section-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      }
      stripCloneUiState(node);
    });
  }

  function cloneSelection() {
    if (!selectedElement) {
      messageEl.textContent = 'Select an element to clone.';
      messageEl.style.color = '#ef4444';
      return;
    }
    const parent = selectedElement.parentElement;
    if (!parent) {
      messageEl.textContent = 'Unable to clone the selected element.';
      messageEl.style.color = '#ef4444';
      return;
    }
    const clone = selectedElement.cloneNode(true);
    remapCloneKeys(clone);
    parent.appendChild(clone);
    if (isLayoutModeEnabled()) {
      setLayoutDragState(true);
    }
    selectElement(clone);
    persistLayout();
    messageEl.textContent = 'Element cloned.';
    messageEl.style.color = '#16a34a';
  }

  function getGroupContainer(target) {
    if (!target) return null;
    if (target.matches?.('[data-cms-group="true"]')) return target;
    return target.closest?.('[data-cms-group="true"]') || null;
  }

  function updateGroupControls() {
    if (!groupButton || !ungroupButton) return;
    const hasSelection = Boolean(selectedElement && selectedElement !== document.body && selectedElement !== document.documentElement);
    const groupTarget = getGroupContainer(selectedElement);
    groupButton.disabled = !editMode || !hasSelection;
    ungroupButton.disabled = !editMode || !groupTarget;
  }

  function groupSelection() {
    if (!selectedElement) {
      messageEl.textContent = 'Select an element to group.';
      messageEl.style.color = '#ef4444';
      return;
    }
    if (selectedElement === document.body || selectedElement === document.documentElement) {
      messageEl.textContent = 'Select a specific element instead of the page itself.';
      messageEl.style.color = '#ef4444';
      return;
    }
    const parent = selectedElement.parentElement;
    if (!parent) return;
    const wrapper = document.createElement('div');
    wrapper.setAttribute('data-cms-group', 'true');
    wrapper.classList.add('cms-group');
    parent.insertBefore(wrapper, selectedElement);
    wrapper.appendChild(selectedElement);
    selectElement(wrapper);
    if (isLayoutModeEnabled()) {
      setLayoutDragState(true);
    }
    persistLayout();
  }

  function ungroupSelection() {
    const group = getGroupContainer(selectedElement);
    if (!group) {
      messageEl.textContent = 'Select a grouped element to ungroup.';
      messageEl.style.color = '#ef4444';
      return;
    }
    const parent = group.parentElement;
    if (!parent) return;
    const children = Array.from(group.childNodes);
    children.forEach((child) => {
      parent.insertBefore(child, group);
    });
    parent.removeChild(group);
    selectElement(parent);
    if (isLayoutModeEnabled()) {
      setLayoutDragState(true);
    }
    persistLayout();
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
    if (isCmsUi(target) || isForbiddenElement(target)) {
      outline.style.display = 'none';
      return;
    }
    positionOutline(target);
  }

  function setEditMode(enabled) {
    if (editMode === enabled) return;
    editMode = enabled;
    document.body.classList.toggle('cms-editing', editMode);
    toggleButton.textContent = editMode ? 'Done' : 'Edit';
    sidebar.classList.toggle('open', editMode);
    outline.style.display = editMode ? 'block' : 'none';
    if (!editMode) {
      clearInlineEditing();
      selectedElement = null;
      clearMessage();
      clearForm();
      removeOutlines();
      hideResizeOverlay();
      hideQuickColorMenu();
      document.body.classList.remove('cms-layout-mode');
      setDrawMode(false);
    }
    publishShortcutButton.disabled = editMode;
    deleteButton.disabled = !editMode || !selectedElement;
    updateCloneState();
    updateGroupControls();
    updateLayoutMode();
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
      const emptyLabel = imagePreview.querySelector('.cms-image-preview__empty');
      if (emptyLabel) emptyLabel.textContent = 'No image selected';
      imagePreview.style.backgroundImage = 'none';
      imagePreview.classList.remove('has-image');
      return;
    }
    const emptyLabel = imagePreview.querySelector('.cms-image-preview__empty');
    if (emptyLabel) emptyLabel.textContent = '';
    imagePreview.style.backgroundImage = `url('${src}')`;
    imagePreview.classList.add('has-image');
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

  function getBackendSourceContainer(el) {
    if (!el || !el.closest) return null;
    return el.closest('[data-json-source]');
  }

  function ensureTemplateWrapper(parent, alias) {
    if (!parent) return null;
    const existingWrapper = parent.parentElement;
    if (existingWrapper && existingWrapper.hasAttribute('data-template-item')) {
      existingWrapper.setAttribute('data-template-item', alias);
      existingWrapper.setAttribute('data-json-source', alias);
      return existingWrapper;
    }
    const wrapper = document.createElement('div');
    wrapper.setAttribute('data-template-item', alias);
    wrapper.setAttribute('data-json-source', alias);
    const container = parent.parentElement;
    if (container) {
      container.insertBefore(wrapper, parent);
    }
    wrapper.appendChild(parent);
    return wrapper;
  }

  function removeTemplateWrapper(parent) {
    if (!parent) return;
    const wrapper = parent.parentElement;
    if (!wrapper || !wrapper.hasAttribute('data-template-item')) return;
    if (wrapper.childElementCount === 1) {
      const container = wrapper.parentElement;
      if (container) {
        container.insertBefore(parent, wrapper);
      }
      wrapper.remove();
      return;
    }
    wrapper.removeAttribute('data-template-item');
  }

  function collectJsonPaths(data, prefix = '') {
    const paths = [];
    if (Array.isArray(data)) {
      data.forEach((item, index) => {
        const next = prefix ? `${prefix}.${index}` : `${index}`;
        if (item && typeof item === 'object') {
          paths.push(...collectJsonPaths(item, next));
          if (prefix) {
            paths.push(...collectJsonPaths(item, prefix));
          }
        } else {
          paths.push(next);
          if (prefix) {
            paths.push(prefix);
          }
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

  function upsertServiceMeta(alias, urlValue) {
    const escapedAlias = window.CSS && CSS.escape ? CSS.escape(alias) : alias;
    let meta = document.querySelector(`meta[name="${escapedAlias}"]`);
    if (!meta) {
      meta = document.createElement('meta');
      document.head.appendChild(meta);
    }
    meta.setAttribute('name', alias);
    meta.setAttribute('itemtype', 'GET');
    meta.setAttribute('content', '');
    meta.setAttribute('itemprop', urlValue);
  }

  function setBackendKeyOptions(paths) {
    if (!keyField || keyField.tagName !== 'SELECT') return;
    const previousValue = keyField.value;
    keyField.innerHTML = '';
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = paths.length ? 'Select a field key' : 'No keys found';
    keyField.appendChild(placeholder);
    paths.forEach((path) => {
      const option = document.createElement('option');
      option.value = path;
      option.textContent = path;
      keyField.appendChild(option);
    });
    keyField.disabled = !paths.length;
    if (backendPendingKey && paths.includes(backendPendingKey)) {
      keyField.value = backendPendingKey;
      setBackendValueForKey(backendPendingKey);
      backendPendingKey = '';
      return;
    }
    if (previousValue && paths.includes(previousValue)) {
      keyField.value = previousValue;
    }
  }

  function setBackendValueForKey(path) {
    const rawValue = getValueByPath(backendServiceData, path);
    const formatted = formatBackendValue(rawValue);
    keyField.value = path || '';
    valueInput.value = formatted;
    imageUrlInput.value = formatted;
    updateImagePreview(formatted);
    if (selectedElement) {
      if (selectedType === 'image' || selectedType === 'background') {
        applyImageToElement(selectedElement, formatted, selectedType === 'background' ? 'background' : 'image');
      } else {
        setPrimaryTextValue(selectedElement, formatted);
      }
    }
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
    replaceKeyField(enabled);
    if (!enabled && repeatToggle) {
      repeatToggle.checked = false;
    }
    if (enabled && keyField.tagName === 'SELECT') {
      keyField.disabled = true;
      setBackendKeyOptions([]);
    }
    serviceForm.classList.remove('is-visible');
    if (!enabled) {
      backendServiceData = null;
      backendServiceAlias = '';
      setBackendKeyOptions([]);
      serviceSelect.value = '';
    }
  }

  function updateServiceFormVisibility() {
    const shouldShow = backendToggle.checked && serviceSelect.value === '__new__';
    serviceForm.classList.toggle('is-visible', shouldShow);
    return shouldShow;
  }

  function rgbToHex(value) {
    if (!value) return '#111827';
    if (value.startsWith('#')) return value;
    const match = value.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (!match) return '#111827';
    const toHex = (num) => Number(num).toString(16).padStart(2, '0');
    return `#${toHex(match[1])}${toHex(match[2])}${toHex(match[3])}`;
  }

  function normalizeHex(value) {
    if (!value) return '';
    const hex = value.startsWith('#') ? value.slice(1) : value;
    if (hex.length === 3) {
      return `#${hex.split('').map((c) => c + c).join('')}`.toLowerCase();
    }
    return `#${hex}`.toLowerCase();
  }

  function hexToRgb(value) {
    const hex = normalizeHex(value).replace('#', '');
    if (hex.length !== 6) return null;
    const r = Number.parseInt(hex.slice(0, 2), 16);
    const g = Number.parseInt(hex.slice(2, 4), 16);
    const b = Number.parseInt(hex.slice(4, 6), 16);
    return { r, g, b };
  }

  function colorDistance(a, b) {
    return (a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2;
  }

  function findNearestSwatch(hex) {
    const rgb = hexToRgb(hex);
    if (!rgb) return COLOR_SWATCHES[0];
    return COLOR_SWATCHES.reduce((closest, swatch) => {
      const swatchRgb = hexToRgb(swatch.hex);
      if (!swatchRgb) return closest;
      if (!closest) return swatch;
      const closestRgb = hexToRgb(closest.hex);
      return colorDistance(rgb, swatchRgb) < colorDistance(rgb, closestRgb) ? swatch : closest;
    }, null);
  }

  function getSwatchClasses(type) {
    return COLOR_SWATCHES.map((swatch) => (type === 'text' ? swatch.textClass : swatch.bgClass));
  }

  function stripTailwindTextColorClasses(element) {
    if (!element || !element.classList) return;
    const colorPattern =
      /^text-(?:black|white|slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)(?:-\d{2,3})?$/;
    Array.from(element.classList).forEach((className) => {
      if (colorPattern.test(className)) {
        element.classList.remove(className);
      }
    });
  }

  function applyTailwindColorClass(type, className) {
    if (!selectedElement || !className) return;
    const swatchClasses = getSwatchClasses(type);
    swatchClasses.forEach((swatchClass) => selectedElement.classList.remove(swatchClass));
    if (type === 'text') {
      stripTailwindTextColorClasses(selectedElement);
    }
    selectedElement.classList.add(className);
    if (type === 'text') {
      selectedElement.style.color = '';
    } else {
      selectedElement.style.backgroundColor = '';
    }
    scheduleLayoutPersist();
  }

  function updateQuickStyleHistory(type, className) {
    const list = type === 'text' ? quickTextHistory : quickBgHistory;
    const filtered = list.filter((entry) => entry !== className);
    filtered.unshift(className);
    const next = filtered.slice(0, 4);
    if (type === 'text') {
      quickTextHistory = next;
      localStorage.setItem('cmsQuickTextColors', JSON.stringify(next));
    } else {
      quickBgHistory = next;
      localStorage.setItem('cmsQuickBgColors', JSON.stringify(next));
    }
    renderQuickStyles();
  }

  function getDefaultQuickHistory(type) {
    const defaults = [
      COLOR_SWATCHES[0],
      COLOR_SWATCHES[2],
      COLOR_SWATCHES[3],
      COLOR_SWATCHES[1],
    ];
    return defaults.map((swatch) => (type === 'text' ? swatch.textClass : swatch.bgClass));
  }

  function loadQuickStyleHistory() {
    const storedText = localStorage.getItem('cmsQuickTextColors');
    const storedBg = localStorage.getItem('cmsQuickBgColors');
    try {
      quickTextHistory = JSON.parse(storedText) || getDefaultQuickHistory('text');
    } catch (err) {
      quickTextHistory = getDefaultQuickHistory('text');
    }
    try {
      quickBgHistory = JSON.parse(storedBg) || getDefaultQuickHistory('background');
    } catch (err) {
      quickBgHistory = getDefaultQuickHistory('background');
    }
  }

  function renderQuickStyles() {
    if (!quickTextSwatches || !quickBgSwatches) return;
    const render = (container, list, type) => {
      container.innerHTML = '';
      list.forEach((className) => {
        const swatch = COLOR_SWATCHES.find((entry) =>
          type === 'text' ? entry.textClass === className : entry.bgClass === className
        );
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'cms-swatch';
        if (swatch) {
          button.style.backgroundColor = swatch.hex;
          button.dataset.tailwindClass = className;
          button.dataset.swatchType = type;
          if (selectedElement && selectedElement.classList.contains(className)) {
            button.classList.add('is-active');
          }
        }
        container.appendChild(button);
      });
    };
    render(quickTextSwatches, quickTextHistory, 'text');
    render(quickBgSwatches, quickBgHistory, 'background');
  }

  function handleQuickStyleClick(event) {
    const button = event.target.closest('.cms-swatch');
    if (!button || !selectedElement) return;
    const className = button.dataset.tailwindClass;
    const type = button.dataset.swatchType;
    if (!className || !type) return;
    applyTailwindColorClass(type, className);
    updateQuickStyleHistory(type, className);
    const swatch = COLOR_SWATCHES.find((entry) =>
      type === 'text' ? entry.textClass === className : entry.bgClass === className
    );
    if (swatch) {
      if (type === 'text') {
        textColorInput.value = swatch.hex;
      } else {
        backgroundColorInput.value = swatch.hex;
      }
    }
    updateStyleInputs(selectedElement);
  }

  function handleQuickPickerClick(event) {
    event.preventDefault();
    const type = event.currentTarget.dataset.quickPicker;
    console.debug('[cms] Quick picker click', { type, selected: Boolean(selectedElement) });
    if (!type) return;
    if (type === 'text') {
      if (quickTextColorInput) {
        quickTextColorInput.value = textColorInput.value;
        console.debug('[cms] Quick picker trigger text input', { value: quickTextColorInput.value });
        quickTextColorInput.focus({ preventScroll: true });
        quickTextColorInput.click();
        return;
      }
      quickColorPicker.value = textColorInput.value;
      console.debug('[cms] Quick picker set text value', { value: quickColorPicker.value });
    } else {
      if (quickBgColorInput) {
        quickBgColorInput.value = backgroundColorInput.value;
        console.debug('[cms] Quick picker trigger background input', { value: quickBgColorInput.value });
        quickBgColorInput.focus({ preventScroll: true });
        quickBgColorInput.click();
        return;
      }
      quickColorPicker.value = backgroundColorInput.value;
      console.debug('[cms] Quick picker set background value', { value: quickColorPicker.value });
    }
    quickColorPicker.dataset.pickerType = type;
    quickColorPicker.classList.add('is-active');
    quickColorPicker.focus({ preventScroll: true });
    if (typeof quickColorPicker.showPicker === 'function') {
      console.debug('[cms] Quick picker showPicker');
      quickColorPicker.showPicker();
    } else {
      console.debug('[cms] Quick picker click fallback');
      quickColorPicker.click();
    }
    window.setTimeout(() => {
      quickColorPicker.classList.remove('is-active');
    }, 100);
  }

  function updateStyleInputs(el) {
    if (!el) return;
    const computed = window.getComputedStyle(el);
    textColorInput.value = rgbToHex(computed.color);
    if (quickTextColorInput) {
      quickTextColorInput.value = textColorInput.value;
    }
    backgroundColorInput.value = rgbToHex(computed.backgroundColor);
    if (quickBgColorInput) {
      quickBgColorInput.value = backgroundColorInput.value;
    }
    fontSizeInput.value = Number.parseFloat(computed.fontSize) || 16;
    flexSelect.value = computed.flexDirection || 'row';
  }

  function scheduleLayoutPersist() {
    if (layoutSaveTimer) {
      clearTimeout(layoutSaveTimer);
    }
    layoutSaveTimer = setTimeout(() => {
      if (selectedElement && selectedElement.hasAttribute('data-component-source')) {
        const componentId = selectedElement.getAttribute('data-component-id');
        syncComponentInstances(componentId);
      }
      persistLayout();
      layoutSaveTimer = null;
    }, 400);
  }

  function toggleGallery(open) {
    gallery.classList.toggle('open', open);
    document.body.classList.toggle('cms-gallery-open', open);
    if (open) {
      setGalleryTab('uploads');
    }
  }

  function setGalleryTab(tabName) {
    galleryTabs.forEach((tab) => {
      tab.classList.toggle('is-active', tab.dataset.galleryTab === tabName);
    });
    galleryContents.forEach((content) => {
      content.classList.toggle('is-active', content.dataset.galleryContent === tabName);
    });
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
    if (!uploads.length && remote.length) {
      setGalleryTab('remote');
    }
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

  function getPrimaryTextTarget(el) {
    if (!el) return null;
    const child = el.firstChild;
    if (!child) return null;
    if (child.nodeType === Node.TEXT_NODE || child.nodeType === Node.ELEMENT_NODE) {
      return child;
    }
    return null;
  }

  function getPrimaryTextValue(el) {
    const target = getPrimaryTextTarget(el);
    if (target) return target.textContent || '';
    return el?.textContent || '';
  }

  function setPrimaryTextValue(el, value) {
    const target = getPrimaryTextTarget(el);
    if (target) {
      target.textContent = value;
      return;
    }
    if (el) {
      el.textContent = value;
    }
  }

  function enableInlineEditing(el) {
    if (!editMode || selectedType !== 'text' || backendToggle.checked || isForbiddenElement(el)) return;
    clearInlineEditing();
    inlineInputHandler = () => {
      valueInput.value = getPrimaryTextValue(el);
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
    hideQuickColorMenu();
    selectedElement = el;
    selectedType = determineElementType(el);
    setTypeSelection(selectedType);
    el.classList.add('cms-outlined');
    textValueDirty = false;
    const backendValue =
      el.getAttribute('data-server-text')
      || el.getAttribute('data-server-image')
      || el.getAttribute('data-server-bg');
    const backendContainer = getBackendSourceContainer(el);
    const backendSource = backendContainer?.getAttribute('data-json-source') || '';
    const shouldUseBackend = Boolean(backendValue) && Boolean(backendSource);
    if (backendToggle.checked !== shouldUseBackend) {
      backendToggle.checked = shouldUseBackend;
      setBackendMode(shouldUseBackend);
    }
    if (repeatToggle) {
      repeatToggle.checked = Boolean(backendContainer && backendContainer.hasAttribute('data-template-item'));
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
      if (keyField.tagName === 'SELECT') {
        keyField.disabled = true;
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
      : getPrimaryTextValue(el).trim();
    linkInput.value = el.getAttribute('data-link') || '';
    keyField.value = key || generateKeySuggestion(el);
    if (componentIdInput && componentSourceToggle) {
      const componentId = el.getAttribute('data-component-id') || '';
      componentIdInput.value = componentId;
      componentSourceToggle.checked = el.getAttribute('data-component-source') === 'true';
      componentSourceToggle.disabled = !componentId;
      lastComponentId = componentId;
    }
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
    updateGridControls(el);
    updateResizeOverlay(el);
    updateGroupControls();
    renderQuickStyles();
    if (el.classList.contains('cms-box')) {
      ensureBoxPlaceholder(el);
    }
    deleteButton.disabled = false;
    updateCloneState();
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
    if (selectedElement === document.body || selectedElement === document.documentElement) {
      messageEl.textContent = 'Select a specific element instead of the page itself.';
      messageEl.style.color = '#ef4444';
      return;
    }
    const useBackend = backendToggle.checked;
    if (selectedType === 'text' && !textValueDirty) {
      valueInput.value = getPrimaryTextValue(selectedElement);
    }
    const key = keyField.value.trim();
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
    const serverAttr =
      selectedType === 'image'
        ? 'data-server-image'
        : selectedType === 'background'
          ? 'data-server-bg'
          : 'data-server-text';
    if (useBackend) {
      selectedElement.setAttribute(serverAttr, value || '');
      const parent = selectedElement.parentElement;
      let backendContainer = parent;
      if (parent && repeatToggle && repeatToggle.checked) {
        backendContainer = ensureTemplateWrapper(parent, backendServiceAlias);
      } else if (parent) {
        removeTemplateWrapper(parent);
      }
      if (backendContainer) {
        backendContainer.setAttribute('data-json-source', backendServiceAlias);
      }
    } else {
      selectedElement.removeAttribute(serverAttr);
      const parent = selectedElement.parentElement;
      if (parent) {
        removeTemplateWrapper(parent);
        parent.removeAttribute('data-json-source');
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
      const currentText = getPrimaryTextValue(selectedElement);
      if (nextValue.trim() === '' && currentText.trim() !== '') {
        bodyValue = null;
      } else {
        setPrimaryTextValue(selectedElement, nextValue);
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
          html: getFullHtmlPayload(),
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
      //applyContent();
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
      showToast('Please enter a site name before publishing.', 'error');
      return false;
    }

    syncAllComponents();

    const originalLabel = publishButton.textContent;
    publishButton.disabled = true;
    publishButton.textContent = 'Publishing...';
    settingsMessageEl.textContent = 'Publishing merged HTML to the site root...';
    settingsMessageEl.style.color = '#111827';
    let success = true;

    try {
      const res = await fetch('/api/publish', { method: 'POST' });
      if (!res.ok) throw new Error('Publish failed');
      const data = await res.json();
      const count = Array.isArray(data.published) ? data.published.length : 0;
      const successMessage = `Published ${count} page${count === 1 ? '' : 's'} to the site root.`;
      settingsMessageEl.textContent = successMessage;
      settingsMessageEl.style.color = '#16a34a';
      showToast(successMessage, 'success');
    } catch (err) {
      success = false;
      settingsMessageEl.textContent = 'Unable to publish static pages.';
      settingsMessageEl.style.color = '#ef4444';
      showToast('Unable to publish static pages.', 'error');
    } finally {
      publishButton.disabled = false;
      publishButton.textContent = originalLabel;
    }
    return success;
  }

  function handleClick(e) {
    if (!editMode) return;
    if (drawMode) return;
    const target = getElementTarget(e.target);
    if (!target) return;
    if (isCmsUi(target) || isForbiddenElement(target)) return;
    if (target === document.body || target === document.documentElement) {
      messageEl.textContent = 'Select a specific element instead of the page itself.';
      messageEl.style.color = '#ef4444';
      return;
    }
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

  function handleDoubleClick(e) {
    if (!editMode) return;
    if (drawMode) return;
    const target = getElementTarget(e.target);
    if (!target || isCmsUi(target) || isForbiddenElement(target)) return;
    if (target === document.body || target === document.documentElement) return;
    e.preventDefault();
    e.stopPropagation();
    selectElement(target);
    showQuickColorMenu(target);
  }

  function handleQuickMenuDismiss(e) {
    if (!quickColorMenu.classList.contains('is-visible')) return;
    if (quickColorMenu.contains(e.target)) return;
    hideQuickColorMenu();
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
    return;
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
      syncAllComponents();
    } catch (err) {
      console.warn('Hydration failed', err);
    }
  }

  toggleButton.addEventListener('click', toggleEdit);
  document.addEventListener('mouseover', handleHover, true);
  document.addEventListener('click', handleClick, true);
  document.addEventListener('dblclick', handleDoubleClick, true);
  document.addEventListener('click', handleQuickMenuDismiss, true);
  document.addEventListener('click', handleMenuDismiss, true);
  document.addEventListener('click', handleLinkNavigation);
  document.addEventListener('dragstart', handleDragStart, true);
  document.addEventListener('dragover', handleDragOver, true);
  document.addEventListener('drop', handleDrop, true);
  document.addEventListener('dragend', handleDragEnd, true);
  document.addEventListener('mousedown', handleDrawMouseDown, true);
  document.addEventListener('mousemove', handleDrawMouseMove, true);
  document.addEventListener('mouseup', handleDrawMouseUp, true);
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (drawMode && !drawState?.isDrawing) {
      setDrawMode(false);
    }
  });
  saveButton.addEventListener('click', (event) => {
    event.preventDefault();
    saveSelection();
  });
  deleteButton.addEventListener('click', (event) => {
    event.preventDefault();
    deleteSelection();
  });
  cloneButton.addEventListener('click', (event) => {
    event.preventDefault();
    cloneSelection();
  });
  publishButton.addEventListener('click', publishStaticSite);
  publishShortcutButton.addEventListener('click', async () => {
    await triggerPublishWithFeedback(publishShortcutButton);
  });
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => activateTab(tab.dataset.tab));
  });
  if (advancedToggle && advancedContent) {
    advancedToggle.addEventListener('click', () => {
      const isOpen = advancedContent.classList.toggle('is-open');
      advancedToggle.setAttribute('aria-expanded', String(isOpen));
      advancedToggle.classList.toggle('is-open', isOpen);
    });
  }
  if (quickTextSwatches) {
    quickTextSwatches.addEventListener('click', handleQuickStyleClick);
  }
  if (quickBgSwatches) {
    quickBgSwatches.addEventListener('click', handleQuickStyleClick);
  }
  quickPickerButtons.forEach((button) => {
    button.addEventListener('click', handleQuickPickerClick);
  });
  resizeOverlay.addEventListener('mousedown', handleResizeStart);
  window.addEventListener('resize', () => updateResizeOverlay(selectedElement));
  window.addEventListener('scroll', () => updateResizeOverlay(selectedElement), true);
  if (reorderToggle) {
    reorderToggle.addEventListener('change', () => {
      reorderMode = reorderToggle.checked;
    });
  }
  if (gridDecreaseButton) {
    gridDecreaseButton.addEventListener('click', () => {
      if (!selectedElement || !supportsGridLayout(selectedElement)) return;
      const count = getGridColumnCount(selectedElement);
      setGridColumnCount(selectedElement, count - 1);
    });
  }
  if (gridIncreaseButton) {
    gridIncreaseButton.addEventListener('click', () => {
      if (!selectedElement || !supportsGridLayout(selectedElement)) return;
      const count = getGridColumnCount(selectedElement);
      setGridColumnCount(selectedElement, count + 1);
    });
  }
  if (groupButton) {
    groupButton.addEventListener('click', () => {
      groupSelection();
      updateGroupControls();
    });
  }
  if (ungroupButton) {
    ungroupButton.addEventListener('click', () => {
      ungroupSelection();
      updateGroupControls();
    });
  }
  textColorInput.addEventListener('input', () => {
    if (!selectedElement) return;
    selectedElement.style.color = textColorInput.value;
    const swatch = findNearestSwatch(textColorInput.value);
    if (swatch?.textClass) {
      updateQuickStyleHistory('text', swatch.textClass);
    }
    scheduleLayoutPersist();
  });
  if (quickTextColorInput) {
    quickTextColorInput.addEventListener('input', () => {
      if (!selectedElement) return;
      selectedElement.style.color = quickTextColorInput.value;
      textColorInput.value = quickTextColorInput.value;
      const swatch = findNearestSwatch(quickTextColorInput.value);
      if (swatch?.textClass) {
        updateQuickStyleHistory('text', swatch.textClass);
      }
      scheduleLayoutPersist();
    });
  }
  if (quickBgColorInput) {
    quickBgColorInput.addEventListener('input', () => {
      if (!selectedElement) return;
      selectedElement.style.backgroundColor = quickBgColorInput.value;
      backgroundColorInput.value = quickBgColorInput.value;
      const swatch = findNearestSwatch(quickBgColorInput.value);
      if (swatch?.bgClass) {
        updateQuickStyleHistory('background', swatch.bgClass);
      }
      scheduleLayoutPersist();
    });
  }
  backgroundColorInput.addEventListener('input', () => {
    if (!selectedElement) return;
    selectedElement.style.backgroundColor = backgroundColorInput.value;
    const swatch = findNearestSwatch(backgroundColorInput.value);
    if (swatch?.bgClass) {
      updateQuickStyleHistory('background', swatch.bgClass);
    }
    scheduleLayoutPersist();
  });
  quickColorMenu.querySelectorAll('[data-quick-color]').forEach((input) => {
    input.addEventListener('input', (event) => {
      if (!selectedElement) return;
      const colorType = event.target.dataset.quickColor;
      if (colorType === 'text') {
        selectedElement.style.color = event.target.value;
        const swatch = findNearestSwatch(event.target.value);
        if (swatch?.textClass) {
          updateQuickStyleHistory('text', swatch.textClass);
        }
      } else {
        selectedElement.style.backgroundColor = event.target.value;
        const swatch = findNearestSwatch(event.target.value);
        if (swatch?.bgClass) {
          updateQuickStyleHistory('background', swatch.bgClass);
        }
      }
      updateStyleInputs(selectedElement);
      scheduleLayoutPersist();
    });
  });
  quickColorPicker.addEventListener('input', () => {
    if (!selectedElement) return;
    const type = quickColorPicker.dataset.pickerType;
    if (type === 'text') {
      selectedElement.style.color = quickColorPicker.value;
      textColorInput.value = quickColorPicker.value;
      if (quickTextColorInput) {
        quickTextColorInput.value = quickColorPicker.value;
      }
      const swatch = findNearestSwatch(quickColorPicker.value);
      if (swatch?.textClass) {
        updateQuickStyleHistory('text', swatch.textClass);
      }
    } else if (type === 'background') {
      selectedElement.style.backgroundColor = quickColorPicker.value;
      backgroundColorInput.value = quickColorPicker.value;
      if (quickBgColorInput) {
        quickBgColorInput.value = quickColorPicker.value;
      }
      const swatch = findNearestSwatch(quickColorPicker.value);
      if (swatch?.bgClass) {
        updateQuickStyleHistory('background', swatch.bgClass);
      }
    }
    updateStyleInputs(selectedElement);
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
    Array.from(selectedElement.classList)
      .filter((name) => name === 'grid' || name.startsWith('grid-cols-'))
      .forEach((name) => selectedElement.classList.remove(name));
    updateGridControls(selectedElement);
    scheduleLayoutPersist();
  });
  valueInput.addEventListener('input', (e) => {
    if (!editMode || !selectedElement || selectedType !== 'text' || backendToggle.checked) return;
    setPrimaryTextValue(selectedElement, e.target.value);
    textValueDirty = true;
  });
  backendToggle.addEventListener('change', () => {
    const enabled = backendToggle.checked;
    setBackendMode(enabled);
    if (enabled && !backendServices.length) {
      backendServices = getMetaServices();
      populateServiceSelect();
    }
    updateServiceFormVisibility();
  });
  if (componentIdInput) {
    componentIdInput.addEventListener('input', () => {
      if (!selectedElement) return;
      const nextId = getComponentId(componentIdInput.value);
      if (!nextId) {
        selectedElement.removeAttribute('data-component-id');
        selectedElement.removeAttribute('data-component-source');
        if (componentSourceToggle) {
          componentSourceToggle.checked = false;
          componentSourceToggle.disabled = true;
        }
        return;
      }
      selectedElement.setAttribute('data-component-id', nextId);
      if (componentSourceToggle) {
        componentSourceToggle.disabled = false;
        if (componentSourceToggle.checked) {
          setComponentSource(nextId, selectedElement);
          syncComponentInstances(nextId);
        }
      }
      if (!componentSourceToggle?.checked && nextId !== lastComponentId) {
        lastComponentId = nextId;
        applyComponentFromDisk(nextId);
      }
    });
  }
  if (componentClearButton) {
    componentClearButton.addEventListener('click', () => {
      clearComponentSelection();
    });
  }
  if (componentSourceToggle) {
    componentSourceToggle.addEventListener('change', () => {
      if (!selectedElement) return;
      const componentId = getComponentId(componentIdInput?.value);
      if (!componentId) {
        componentSourceToggle.checked = false;
        componentSourceToggle.disabled = true;
        return;
      }
      if (componentSourceToggle.checked) {
        setComponentSource(componentId, selectedElement);
        syncComponentInstances(componentId);
      } else {
        selectedElement.removeAttribute('data-component-source');
      }
    });
  }
  serviceSelect.addEventListener('change', async () => {
    const selected = serviceSelect.value;
    messageEl.textContent = '';
    if (selected === '__new__') {
      updateServiceFormVisibility();
      backendServiceData = null;
      backendServiceAlias = '';
      setBackendKeyOptions([]);
      return;
    }
    updateServiceFormVisibility();
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
    upsertServiceMeta(alias, urlValue);
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
    navigateToFile(fileSelect.value);
  });
  pagesSelect.addEventListener('change', () => {
    if (pageDeleteButton) {
      pageDeleteButton.disabled = pagesSelect.value === 'index.html';
    }
    navigateToFile(pagesSelect.value);
    togglePagesDropdown(false);
  });
  if (pageCreateButton) {
    pageCreateButton.addEventListener('click', () => {
      createPage(pageNameInput?.value);
    });
  }
  if (pageDeleteButton) {
    pageDeleteButton.addEventListener('click', () => {
      deletePage(pagesSelect?.value);
    });
  }
  pagesToggleButton.addEventListener('click', () => {
    togglePagesDropdown();
  });
  effectsButton.addEventListener('click', () => {
    window.alert('Effects coming soon.');
  });
  settingsMenuButton.addEventListener('click', () => {
    openSettingsDialog();
  });
  if (drawButton) {
    drawButton.addEventListener('click', () => {
      setDrawMode(!drawMode);
    });
  }
  xrayButton.addEventListener('click', () => {
    activateTab(isWireframeEnabled() ? 'content' : 'wireframe');
  });
  publishMenuButton.addEventListener('click', async () => {
    await triggerPublishWithFeedback(publishMenuButton);
  });
  floatingMinimizeButton.addEventListener('click', () => {
    floatingMenu.classList.toggle('is-minimized');
  });
  floatingMenu.addEventListener('mousedown', handleMenuDragStart);
  settingsDialog.addEventListener('click', handleSettingsDialogClick);
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
  imagePreview.addEventListener('dblclick', () => {
    if (imageFileInput.disabled) return;
    imageFileInput.value = '';
    imageFileInput.click();
  });
  if (imagePreviewDelete) {
    imagePreviewDelete.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (!selectedElement || !(selectedType === 'image' || selectedType === 'background')) return;
      imageUrlInput.value = '';
      imageFileInput.value = '';
      updateImagePreview('');
      applyImageToElement(selectedElement, '', selectedType === 'background' ? 'background' : 'image');
      scheduleLayoutPersist();
    });
  }
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

  galleryTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      setGalleryTab(tab.dataset.galleryTab);
    });
  });

  document.addEventListener('DOMContentLoaded', () => {
    loadFiles();
    loadComponentOptions();
    applySidebarPosition();
    flexField.style.display = 'none';
    fontSizeField.style.display = 'flex';
    clearSettingsMessage();
    backendServices = getMetaServices();
    populateServiceSelect();
    setBackendMode(false);
    updateServiceFormVisibility();
    hydrate();
    if (document.querySelector('.cms-panel.active')?.dataset.panel !== 'wireframe') {
      setWireframeState(false);
    }
    updateGroupControls();
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
