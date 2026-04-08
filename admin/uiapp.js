const sectionBuilderApp = (() => {
  const PRESET_BACKGROUNDS = [
    { label: 'None', value: 'none' },
    { label: 'White', value: 'bg-white' },
    { label: 'Gray 50', value: 'bg-gray-50' },
    { label: 'Gray 100', value: 'bg-gray-100' },
    { label: 'Slate 900', value: 'bg-slate-900 text-white' },
  ];

  const PRESET_PADDING_Y = ['py-6', 'py-10', 'py-16'];
  const PRESET_PADDING_X = ['px-4', 'px-6'];
  const PRESET_CONTAINER = ['max-w-4xl', 'max-w-6xl', 'max-w-7xl'];
  const PRESET_LAYOUTS = [
    { label: 'Stack', value: 'stack' },
    { label: '2 Column Grid', value: 'grid-2' },
    { label: '3 Column Grid', value: 'grid-3' },
    { label: '12 Column Grid', value: 'grid-12' },
  ];
  const PRESET_GAPS = ['gap-4', 'gap-6', 'gap-8', 'gap-10'];

  const state = {
    page: {
      sections: [],
    },
    selection: {
      type: 'section',
      sectionId: null,
      componentId: null,
    },
    ui: {
      breakpoint: 'base',
      addMenuSectionId: null,
      dragging: null,
      dropIndicator: null,
      isSaving: false,
    },
  };

  const structurePanel = document.getElementById('structure-panel');
  const propertiesPanel = document.getElementById('properties-panel');
  const breadcrumb = document.getElementById('breadcrumb');
  const previewFrame = document.getElementById('preview-frame');
  const previewFrameWrapper = document.getElementById('preview-frame-wrapper');
  const componentModal = document.getElementById('component-modal');
  const componentModalClose = document.getElementById('close-component-modal');
  const breakpointMobile = document.getElementById('breakpoint-mobile');
  const breakpointDesktop = document.getElementById('breakpoint-desktop');
  const saveButton = document.getElementById('save-layout');
  const savingDialog = document.getElementById('saving-dialog');
  const savingTitle = document.getElementById('saving-title');
  const savingMessage = document.getElementById('saving-message');
  const savingClose = document.getElementById('saving-close');

  const id = (() => {
    let counter = 0;
    return () => `id-${Date.now()}-${counter++}`;
  })();

  const createSection = () => ({
    id: id(),
    settings: {
      background: 'bg-white',
      paddingY: 'py-10',
      paddingX: 'px-4',
      container: 'max-w-6xl',
    },
    layout: {
      type: 'stack',
      gap: 'gap-6',
    },
    components: [],
  });

  const createComponent = (type) => {
    const base = {
      id: id(),
      type,
      props: {},
      styleTokens: {
        baseSpan: 12,
        mdSpan: 6,
      },
      responsiveOverrides: {},
    };
    if (type === 'text') {
      base.props.text = 'Add your text here.';
    }
    if (type === 'image') {
      base.props.url = 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=900&q=80';
      base.props.alt = 'Landscape photo';
    }
    if (type === 'button') {
      base.props.label = 'Call to Action';
    }
    if (type === 'card') {
      base.props.title = 'Card title';
      base.props.body = 'Describe your offering in a short paragraph.';
    }
    if (type === 'form') {
      base.props.label = 'Email address';
      base.props.placeholder = 'you@example.com';
    }
    return base;
  };

  const getLayoutClasses = (layoutType) => {
    switch (layoutType) {
      case 'grid-2':
        return 'grid grid-cols-1 md:grid-cols-2';
      case 'grid-3':
        return 'grid grid-cols-1 md:grid-cols-3';
      case 'grid-12':
        return 'grid grid-cols-12';
      default:
        return 'flex flex-col';
    }
  };

  const escapeHtml = (value) =>
    String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

  const generateComponentHtml = (component, section, options) => {
    const selectedClass =
      options.selected?.type === 'component' && options.selected.componentId === component.id
        ? 'ring-2 ring-blue-500 ring-offset-2'
        : '';
    const spanClasses =
      section.layout.type === 'grid-12'
        ? `col-span-${component.styleTokens.baseSpan} md:col-span-${component.styleTokens.mdSpan}`
        : '';
    const baseClasses = ['relative', spanClasses, selectedClass].filter(Boolean).join(' ');

    if (component.type === 'text') {
      return `<p data-component-id="${component.id}" class="${baseClasses} text-base leading-relaxed text-slate-700">${escapeHtml(
        component.props.text || ''
      )}</p>`;
    }
    if (component.type === 'image') {
      return `<img data-component-id="${component.id}" class="${baseClasses} h-auto w-full rounded-lg object-cover" src="${escapeHtml(
        component.props.url || ''
      )}" alt="${escapeHtml(component.props.alt || '')}" />`;
    }
    if (component.type === 'button') {
      return `<button data-component-id="${component.id}" class="${baseClasses} inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700" type="button">${escapeHtml(
        component.props.label || 'Button'
      )}</button>`;
    }
    if (component.type === 'card') {
      return `<div data-component-id="${component.id}" class="${baseClasses} rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 class="text-base font-semibold text-slate-900">${escapeHtml(component.props.title || '')}</h3>
        <p class="mt-2 text-sm text-slate-600">${escapeHtml(component.props.body || '')}</p>
      </div>`;
    }
    if (component.type === 'form') {
      return `<div data-component-id="${component.id}" class="${baseClasses} flex flex-col gap-2">
        <label class="text-sm font-medium text-slate-700">${escapeHtml(component.props.label || '')}</label>
        <input class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="${escapeHtml(
          component.props.placeholder || ''
        )}" />
      </div>`;
    }
    return '';
  };

  const generateSectionHtml = (section, options) => {
    const background = section.settings.background === 'none' ? '' : section.settings.background;
    const sectionSelectedClass =
      options.selected?.type === 'section' && options.selected.sectionId === section.id
        ? 'outline outline-2 outline-blue-500 outline-offset-2'
        : '';
    const sectionClasses = [background, section.settings.paddingY, section.settings.paddingX, sectionSelectedClass]
      .filter(Boolean)
      .join(' ');
    const containerClasses = `mx-auto ${section.settings.container}`;
    const layoutClasses = `${getLayoutClasses(section.layout.type)} ${section.layout.gap}`;

    const componentHtml = section.components
      .map((component) => generateComponentHtml(component, section, options))
      .join('');

    const gridSpanClass = section.layout.type === 'grid-12' ? 'col-span-12' : '';
    const emptyPlaceholder =
      options.preview && section.components.length === 0
        ? `<div class="${gridSpanClass} rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 p-6 text-center">
          <p class="text-sm text-slate-500">Drop components here</p>
          <button data-action="add-component" data-section-id="${section.id}" class="mt-3 inline-flex items-center rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100" type="button">Add Component</button>
        </div>`
        : '';

    const addButton =
      options.preview && section.components.length > 0
        ? `<div class="${gridSpanClass}">
          <button data-action="add-component" data-section-id="${section.id}" class="mt-4 inline-flex items-center rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100" type="button">Add Component</button>
        </div>`
        : '';

    return `<section data-section-id="${section.id}" class="${sectionClasses}">
      <div class="${containerClasses}">
        <div class="${layoutClasses}">
          ${componentHtml}
          ${emptyPlaceholder}
          ${addButton}
        </div>
      </div>
    </section>`;
  };

  const generateDesignedHtml = (pageState, options = { preview: false, selected: null }) =>
    pageState.sections.map((section) => generateSectionHtml(section, options)).join('\n');

  const updatePreview = () => {
    const html = generateDesignedHtml(state.page, {
      preview: true,
      selected: state.selection,
    });
    const previewDoc = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-white text-slate-900">
  ${html}
</body>
</html>`;
    previewFrame.srcdoc = previewDoc;
  };

  const updateBreadcrumb = () => {
    const section = state.page.sections.find((item) => item.id === state.selection.sectionId);
    if (!section) {
      breadcrumb.textContent = 'Page';
      return;
    }
    if (state.selection.type === 'component') {
      const component = section.components.find((item) => item.id === state.selection.componentId);
      breadcrumb.textContent = `Page / Section / ${component?.type || 'Component'}`;
      return;
    }
    breadcrumb.textContent = 'Page / Section';
  };

  const renderStructurePanel = () => {
    const sectionItems = state.page.sections
      .map((section) => {
        const isSelected = state.selection.sectionId === section.id && state.selection.type === 'section';
        const components = section.components
          .map((component) => {
            const compSelected =
              state.selection.type === 'component' && state.selection.componentId === component.id;
            const showIndicator =
              state.ui.dropIndicator?.type === 'component' &&
              state.ui.dropIndicator.sectionId === section.id &&
              state.ui.dropIndicator.componentId === component.id;
            const indicator = showIndicator ? `<div class="h-0 border-t-2 border-blue-500"></div>` : '';
            const indicatorBefore = showIndicator && state.ui.dropIndicator.position === 'before' ? indicator : '';
            const indicatorAfter = showIndicator && state.ui.dropIndicator.position === 'after' ? indicator : '';
            return `${indicatorBefore}<li
                class="flex items-center justify-between rounded-md border border-transparent px-2 py-1 text-sm text-slate-600 hover:bg-slate-50 ${
                  compSelected ? 'bg-blue-50 text-blue-700' : ''
                }"
                data-select-component="${component.id}"
                data-section-id="${section.id}"
                data-drag-type="component"
                draggable="true"
                data-component-id="${component.id}"
              >
                <span class="flex items-center gap-2">
                  <span class="text-xs text-slate-400">☰</span>
                  ${component.type}
                </span>
              </li>${indicatorAfter}`;
          })
          .join('');

        const componentIndicator =
          state.ui.dropIndicator?.type === 'component-list' &&
          state.ui.dropIndicator.sectionId === section.id
            ? `<div class="h-0 border-t-2 border-blue-500"></div>`
            : '';

        const showSectionIndicator =
          state.ui.dropIndicator?.type === 'section' && state.ui.dropIndicator.sectionId === section.id;
        const sectionIndicatorLine = showSectionIndicator
          ? `<div class="h-0 border-t-2 border-blue-500"></div>`
          : '';
        const sectionIndicatorBefore =
          showSectionIndicator && state.ui.dropIndicator.position === 'before' ? sectionIndicatorLine : '';
        const sectionIndicatorAfter =
          showSectionIndicator && state.ui.dropIndicator.position === 'after' ? sectionIndicatorLine : '';

        return `${sectionIndicatorBefore}<div class="mb-4 rounded-lg border border-slate-200">
          <div
            class="flex items-center justify-between border-b border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 ${
              isSelected ? 'bg-blue-50 text-blue-700' : 'bg-slate-50'
            }"
            data-select-section="${section.id}"
            data-drag-type="section"
            draggable="true"
            data-section-id="${section.id}"
          >
            <span class="flex items-center gap-2">
              <span class="text-xs text-slate-400">☰</span>
              Section
            </span>
            <button
              data-action="add-component"
              data-section-id="${section.id}"
              class="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-xs text-slate-500 hover:bg-slate-100"
              type="button"
            >
              Add
            </button>
          </div>
          <ul class="px-3 py-2" data-component-list="${section.id}">
            ${components || '<li class="text-xs text-slate-400">Empty section</li>'}
            ${componentIndicator}
          </ul>
        </div>${sectionIndicatorAfter}`;
      })
      .join('');

    const sectionIndicator =
      state.ui.dropIndicator?.type === 'section' && !state.ui.dropIndicator.sectionId
        ? `<div class="h-0 border-t-2 border-blue-500"></div>`
        : '';

    structurePanel.innerHTML = `
      <div class="flex items-center justify-between">
        <div class="text-xs font-semibold uppercase tracking-wide text-slate-400">Sections</div>
        <button
          id="add-section"
          class="rounded-md bg-blue-600 px-3 py-1 text-xs font-semibold text-white hover:bg-blue-700"
          type="button"
        >
          Add Section
        </button>
      </div>
      <div class="mt-3" data-section-list="true">
        ${sectionItems}
        ${sectionIndicator}
      </div>
    `;
  };

  const renderPropertiesPanel = () => {
    const section = state.page.sections.find((item) => item.id === state.selection.sectionId);
    if (!section) {
      propertiesPanel.innerHTML = '<p class="text-sm text-slate-500">Select a section.</p>';
      return;
    }

    if (state.selection.type === 'section') {
      propertiesPanel.innerHTML = `
        <div class="space-y-4">
          <div>
            <label class="text-xs font-semibold uppercase tracking-wide text-slate-400">Background</label>
            <select id="section-background" class="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm">
              ${PRESET_BACKGROUNDS.map(
                (preset) =>
                  `<option value="${preset.value}" ${
                    preset.value === section.settings.background ? 'selected' : ''
                  }>${preset.label}</option>`
              ).join('')}
            </select>
          </div>
          <div>
            <label class="text-xs font-semibold uppercase tracking-wide text-slate-400">Padding Y</label>
            <select id="section-padding-y" class="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm">
              ${PRESET_PADDING_Y.map(
                (value) => `<option value="${value}" ${value === section.settings.paddingY ? 'selected' : ''}>${value}</option>`
              ).join('')}
            </select>
          </div>
          <div>
            <label class="text-xs font-semibold uppercase tracking-wide text-slate-400">Padding X</label>
            <select id="section-padding-x" class="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm">
              ${PRESET_PADDING_X.map(
                (value) => `<option value="${value}" ${value === section.settings.paddingX ? 'selected' : ''}>${value}</option>`
              ).join('')}
            </select>
          </div>
          <div>
            <label class="text-xs font-semibold uppercase tracking-wide text-slate-400">Container width</label>
            <select id="section-container" class="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm">
              ${PRESET_CONTAINER.map(
                (value) => `<option value="${value}" ${value === section.settings.container ? 'selected' : ''}>${value}</option>`
              ).join('')}
            </select>
          </div>
          <div>
            <label class="text-xs font-semibold uppercase tracking-wide text-slate-400">Layout preset</label>
            <select id="section-layout" class="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm">
              ${PRESET_LAYOUTS.map(
                (layout) =>
                  `<option value="${layout.value}" ${layout.value === section.layout.type ? 'selected' : ''}>${layout.label}</option>`
              ).join('')}
            </select>
          </div>
          <div>
            <label class="text-xs font-semibold uppercase tracking-wide text-slate-400">Gap</label>
            <select id="section-gap" class="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm">
              ${PRESET_GAPS.map(
                (value) => `<option value="${value}" ${value === section.layout.gap ? 'selected' : ''}>${value}</option>`
              ).join('')}
            </select>
          </div>
        </div>
      `;
      return;
    }

    const component = section.components.find((item) => item.id === state.selection.componentId);
    if (!component) {
      propertiesPanel.innerHTML = '<p class="text-sm text-slate-500">Select a component.</p>';
      return;
    }

    const spanControls =
      section.layout.type === 'grid-12'
        ? `
        <div class="rounded-lg border border-slate-200 p-3">
          <p class="text-xs font-semibold uppercase tracking-wide text-slate-400">Grid spans</p>
          <div class="mt-2">
            <label class="text-xs text-slate-500">${state.ui.breakpoint === 'base' ? 'Base span' : 'Desktop span'}</label>
            <select id="component-span" class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm">
              ${Array.from({ length: 12 }, (_, i) => i + 1)
                .map((value) => {
                  const current =
                    state.ui.breakpoint === 'base' ? component.styleTokens.baseSpan : component.styleTokens.mdSpan;
                  return `<option value="${value}" ${value === current ? 'selected' : ''}>${value} / 12</option>`;
                })
                .join('')}
            </select>
            <p class="mt-2 text-xs text-slate-400">Switch breakpoint above to edit base or desktop span.</p>
          </div>
        </div>`
        : '';

    let fields = '';
    if (component.type === 'text') {
      fields = `
        <div>
          <label class="text-xs font-semibold uppercase tracking-wide text-slate-400">Text</label>
          <textarea id="component-text" class="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" rows="4">${escapeHtml(
            component.props.text || ''
          )}</textarea>
        </div>`;
    }
    if (component.type === 'image') {
      fields = `
        <div>
          <label class="text-xs font-semibold uppercase tracking-wide text-slate-400">Image URL</label>
          <input id="component-image-url" class="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value="${escapeHtml(
            component.props.url || ''
          )}" />
        </div>
        <div>
          <label class="text-xs font-semibold uppercase tracking-wide text-slate-400">Alt text</label>
          <input id="component-image-alt" class="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value="${escapeHtml(
            component.props.alt || ''
          )}" />
        </div>`;
    }
    if (component.type === 'button') {
      fields = `
        <div>
          <label class="text-xs font-semibold uppercase tracking-wide text-slate-400">Label</label>
          <input id="component-button-label" class="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value="${escapeHtml(
            component.props.label || ''
          )}" />
        </div>`;
    }
    if (component.type === 'card') {
      fields = `
        <div>
          <label class="text-xs font-semibold uppercase tracking-wide text-slate-400">Title</label>
          <input id="component-card-title" class="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value="${escapeHtml(
            component.props.title || ''
          )}" />
        </div>
        <div>
          <label class="text-xs font-semibold uppercase tracking-wide text-slate-400">Body</label>
          <textarea id="component-card-body" class="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" rows="3">${escapeHtml(
            component.props.body || ''
          )}</textarea>
        </div>`;
    }
    if (component.type === 'form') {
      fields = `
        <div>
          <label class="text-xs font-semibold uppercase tracking-wide text-slate-400">Label</label>
          <input id="component-form-label" class="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value="${escapeHtml(
            component.props.label || ''
          )}" />
        </div>
        <div>
          <label class="text-xs font-semibold uppercase tracking-wide text-slate-400">Placeholder</label>
          <input id="component-form-placeholder" class="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value="${escapeHtml(
            component.props.placeholder || ''
          )}" />
        </div>`;
    }

    propertiesPanel.innerHTML = `
      <div class="space-y-4">
        <div class="rounded-lg border border-slate-200 p-3">
          <p class="text-xs font-semibold uppercase tracking-wide text-slate-400">Component type</p>
          <p class="mt-2 text-sm font-semibold text-slate-700">${component.type}</p>
        </div>
        ${fields}
        ${spanControls}
        <button id="delete-component" class="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-600" type="button">Delete component</button>
      </div>
    `;
  };

  const renderAll = () => {
    renderStructurePanel();
    renderPropertiesPanel();
    updateBreadcrumb();
    updatePreview();
    updateBreakpointButtons();
  };

  const updateBreakpointButtons = () => {
    if (state.ui.breakpoint === 'base') {
      breakpointMobile.classList.add('bg-white', 'text-slate-900', 'shadow-sm');
      breakpointDesktop.classList.remove('bg-white', 'text-slate-900', 'shadow-sm');
      previewFrameWrapper.classList.remove('max-w-5xl');
      previewFrameWrapper.classList.add('max-w-sm');
    } else {
      breakpointDesktop.classList.add('bg-white', 'text-slate-900', 'shadow-sm');
      breakpointMobile.classList.remove('bg-white', 'text-slate-900', 'shadow-sm');
      previewFrameWrapper.classList.remove('max-w-sm');
      previewFrameWrapper.classList.add('max-w-5xl');
    }
  };

  const selectSection = (sectionId) => {
    state.selection = { type: 'section', sectionId, componentId: null };
    renderAll();
  };

  const selectComponent = (sectionId, componentId) => {
    state.selection = { type: 'component', sectionId, componentId };
    renderAll();
  };

  const addSection = () => {
    const newSection = createSection();
    state.page.sections.push(newSection);
    selectSection(newSection.id);
  };

  const addComponentToSection = (sectionId, type) => {
    const section = state.page.sections.find((item) => item.id === sectionId);
    if (!section) return;
    const component = createComponent(type);
    section.components.push(component);
    selectComponent(sectionId, component.id);
  };

  const removeComponent = () => {
    const section = state.page.sections.find((item) => item.id === state.selection.sectionId);
    if (!section) return;
    section.components = section.components.filter((component) => component.id !== state.selection.componentId);
    selectSection(section.id);
  };

  const moveSection = (sectionId, targetIndex) => {
    const index = state.page.sections.findIndex((section) => section.id === sectionId);
    if (index === -1) return;
    const [section] = state.page.sections.splice(index, 1);
    state.page.sections.splice(targetIndex, 0, section);
  };

  const moveComponent = (sourceSectionId, componentId, targetSectionId, targetIndex) => {
    const sourceSection = state.page.sections.find((section) => section.id === sourceSectionId);
    const targetSection = state.page.sections.find((section) => section.id === targetSectionId);
    if (!sourceSection || !targetSection) return;
    const componentIndex = sourceSection.components.findIndex((component) => component.id === componentId);
    if (componentIndex === -1) return;
    const [component] = sourceSection.components.splice(componentIndex, 1);
    targetSection.components.splice(targetIndex, 0, component);
  };

  const openComponentModal = (sectionId) => {
    state.ui.addMenuSectionId = sectionId;
    componentModal.classList.remove('hidden');
    componentModal.classList.add('flex');
  };

  const closeComponentModal = () => {
    state.ui.addMenuSectionId = null;
    componentModal.classList.add('hidden');
    componentModal.classList.remove('flex');
  };

  const getCurrentFile = () => {
    const params = new URLSearchParams(window.location.search);
    return params.get('file') || 'index.html';
  };

  const openSavingDialog = (title, message, allowClose = false) => {
    savingTitle.textContent = title;
    savingMessage.textContent = message;
    if (allowClose) {
      savingClose.classList.remove('hidden');
    } else {
      savingClose.classList.add('hidden');
    }
    savingDialog.classList.remove('hidden');
    savingDialog.classList.add('flex');
  };

  const closeSavingDialog = () => {
    savingDialog.classList.add('hidden');
    savingDialog.classList.remove('flex');
  };

  const saveLayout = async () => {
    try {
      openSavingDialog('Saving…', 'Persisting your layout to the server.');
      const html = window.getDesignedHtml();
      const payload = {
        html,
        file: getCurrentFile(),
      };
      const response = await fetch('/api/layout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error('Save failed');
      openSavingDialog('Saved!', 'Your layout has been saved.', true);
    } catch (error) {
      openSavingDialog('Save failed', 'Unable to save right now. Please try again.', true);
    }
  };

  const handleStructureClick = (event) => {
    const addButton = event.target.closest('[data-action="add-component"]');
    if (addButton) {
      openComponentModal(addButton.dataset.sectionId);
      return;
    }
    if (event.target.id === 'add-section') {
      addSection();
      return;
    }
    const sectionTarget = event.target.closest('[data-select-section]');
    if (sectionTarget) {
      selectSection(sectionTarget.dataset.selectSection);
      return;
    }
    const componentTarget = event.target.closest('[data-select-component]');
    if (componentTarget) {
      selectComponent(componentTarget.dataset.sectionId, componentTarget.dataset.selectComponent);
    }
  };

  const handlePropertiesChange = (event) => {
    const section = state.page.sections.find((item) => item.id === state.selection.sectionId);
    if (!section) return;
    if (state.selection.type === 'section') {
      if (event.target.id === 'section-background') {
        section.settings.background = event.target.value;
      }
      if (event.target.id === 'section-padding-y') {
        section.settings.paddingY = event.target.value;
      }
      if (event.target.id === 'section-padding-x') {
        section.settings.paddingX = event.target.value;
      }
      if (event.target.id === 'section-container') {
        section.settings.container = event.target.value;
      }
      if (event.target.id === 'section-layout') {
        section.layout.type = event.target.value;
      }
      if (event.target.id === 'section-gap') {
        section.layout.gap = event.target.value;
      }
    }

    if (state.selection.type === 'component') {
      const component = section.components.find((item) => item.id === state.selection.componentId);
      if (!component) return;
      if (event.target.id === 'component-text') {
        component.props.text = event.target.value;
      }
      if (event.target.id === 'component-image-url') {
        component.props.url = event.target.value;
      }
      if (event.target.id === 'component-image-alt') {
        component.props.alt = event.target.value;
      }
      if (event.target.id === 'component-button-label') {
        component.props.label = event.target.value;
      }
      if (event.target.id === 'component-card-title') {
        component.props.title = event.target.value;
      }
      if (event.target.id === 'component-card-body') {
        component.props.body = event.target.value;
      }
      if (event.target.id === 'component-form-label') {
        component.props.label = event.target.value;
      }
      if (event.target.id === 'component-form-placeholder') {
        component.props.placeholder = event.target.value;
      }
      if (event.target.id === 'component-span') {
        const value = Number(event.target.value);
        if (state.ui.breakpoint === 'base') {
          component.styleTokens.baseSpan = value;
        } else {
          component.styleTokens.mdSpan = value;
        }
      }
    }

    renderAll();
  };

  const handlePropertiesClick = (event) => {
    if (event.target.id === 'delete-component') {
      removeComponent();
    }
  };

  const handlePreviewClick = () => {
    const doc = previewFrame.contentDocument;
    if (!doc) return;
    doc.addEventListener('click', (event) => {
      const actionButton = event.target.closest('[data-action="add-component"]');
      if (actionButton) {
        event.preventDefault();
        openComponentModal(actionButton.dataset.sectionId);
        return;
      }
      const componentEl = event.target.closest('[data-component-id]');
      if (componentEl) {
        const sectionEl = event.target.closest('[data-section-id]');
        if (sectionEl) {
          selectComponent(sectionEl.dataset.sectionId, componentEl.dataset.componentId);
        }
        return;
      }
      const sectionEl = event.target.closest('[data-section-id]');
      if (sectionEl) {
        selectSection(sectionEl.dataset.sectionId);
      }
    });
  };

  const handleDragStart = (event) => {
    const dragTarget = event.target.closest('[data-drag-type]');
    if (!dragTarget) return;
    const dragType = dragTarget.dataset.dragType;
    const payload = {
      type: dragType,
      sectionId: dragTarget.dataset.sectionId,
      componentId: dragTarget.dataset.componentId,
    };
    state.ui.dragging = payload;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('application/json', JSON.stringify(payload));
  };

  const updateDropIndicator = (indicator) => {
    state.ui.dropIndicator = indicator;
    renderStructurePanel();
  };

  const handleDragOver = (event) => {
    const dragging = state.ui.dragging;
    if (!dragging) return;
    const sectionTarget = event.target.closest('[data-select-section]');
    const componentTarget = event.target.closest('[data-select-component]');
    const componentList = event.target.closest('[data-component-list]');
    const sectionList = event.target.closest('[data-section-list]');

    if (dragging.type === 'section' && sectionTarget) {
      event.preventDefault();
      const rect = sectionTarget.getBoundingClientRect();
      const position = event.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
      updateDropIndicator({ type: 'section', sectionId: sectionTarget.dataset.selectSection, position });
      return;
    }

    if (dragging.type === 'section' && sectionList) {
      event.preventDefault();
      updateDropIndicator({ type: 'section', sectionId: null, position: 'after' });
      return;
    }

    if (dragging.type === 'component' && componentTarget) {
      event.preventDefault();
      const rect = componentTarget.getBoundingClientRect();
      const position = event.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
      updateDropIndicator({
        type: 'component',
        sectionId: componentTarget.dataset.sectionId,
        componentId: componentTarget.dataset.selectComponent,
        position,
      });
      return;
    }

    if (dragging.type === 'component' && componentList) {
      event.preventDefault();
      updateDropIndicator({ type: 'component-list', sectionId: componentList.dataset.componentList });
    }
  };

  const clearDragState = () => {
    state.ui.dragging = null;
    state.ui.dropIndicator = null;
    renderStructurePanel();
  };

  const handleDrop = (event) => {
    const dragging = state.ui.dragging;
    if (!dragging) return;
    event.preventDefault();

    const indicator = state.ui.dropIndicator;
    if (dragging.type === 'section') {
      const currentIndex = state.page.sections.findIndex((section) => section.id === dragging.sectionId);
      let targetIndex = state.page.sections.length;
      if (indicator?.type === 'section' && indicator.sectionId) {
        const index = state.page.sections.findIndex((section) => section.id === indicator.sectionId);
        targetIndex = indicator.position === 'before' ? index : index + 1;
      }
      if (currentIndex !== -1) {
        moveSection(dragging.sectionId, targetIndex > currentIndex ? targetIndex - 1 : targetIndex);
      }
    }

    if (dragging.type === 'component') {
      const sourceSectionId = dragging.sectionId;
      let targetSectionId = sourceSectionId;
      let targetIndex = null;

      if (indicator?.type === 'component') {
        targetSectionId = indicator.sectionId;
        const targetSection = state.page.sections.find((section) => section.id === targetSectionId);
        const targetComponentIndex = targetSection.components.findIndex(
          (component) => component.id === indicator.componentId
        );
        targetIndex = indicator.position === 'before' ? targetComponentIndex : targetComponentIndex + 1;
      }

      if (indicator?.type === 'component-list') {
        targetSectionId = indicator.sectionId;
        const targetSection = state.page.sections.find((section) => section.id === targetSectionId);
        targetIndex = targetSection.components.length;
      }

      if (targetIndex !== null) {
        moveComponent(sourceSectionId, dragging.componentId, targetSectionId, targetIndex);
      }
    }

    clearDragState();
    renderAll();
  };

  const bindEvents = () => {
    structurePanel.addEventListener('click', handleStructureClick);
    structurePanel.addEventListener('dragstart', handleDragStart);
    structurePanel.addEventListener('dragover', handleDragOver);
    structurePanel.addEventListener('drop', handleDrop);
    structurePanel.addEventListener('dragend', clearDragState);

    propertiesPanel.addEventListener('input', handlePropertiesChange);
    propertiesPanel.addEventListener('change', handlePropertiesChange);
    propertiesPanel.addEventListener('click', handlePropertiesClick);

    componentModal.addEventListener('click', (event) => {
      if (event.target === componentModal) {
        closeComponentModal();
      }
      const button = event.target.closest('[data-component-type]');
      if (button) {
        addComponentToSection(state.ui.addMenuSectionId, button.dataset.componentType);
        closeComponentModal();
      }
    });

    componentModalClose.addEventListener('click', closeComponentModal);
    breakpointMobile.addEventListener('click', () => {
      state.ui.breakpoint = 'base';
      renderAll();
    });
    breakpointDesktop.addEventListener('click', () => {
      state.ui.breakpoint = 'md';
      renderAll();
    });
    saveButton.addEventListener('click', saveLayout);
    savingClose.addEventListener('click', closeSavingDialog);
    previewFrame.addEventListener('load', handlePreviewClick);
  };

  const init = () => {
    state.page.sections = [createSection()];
    state.selection.sectionId = state.page.sections[0].id;
    bindEvents();
    renderAll();
  };

  window.getDesignedHtml = () => generateDesignedHtml(state.page, { preview: false, selected: null });
  window.loadDesignedHtml = (htmlString) => {
    console.warn('TODO: implement loadDesignedHtml() to parse generated HTML.');
    return htmlString;
  };

  init();
})();
