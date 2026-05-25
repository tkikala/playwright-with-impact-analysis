const state = {
  matrix: null,
  files: [],
  tests: [],
  links: [],
  selected: null,
  query: '',
  group: '',
  density: 'all',
  coverage: 'all',
  view: 'map'
};

const els = {
  matrixFile: document.querySelector('#matrixFile'),
  matrixCatalog: document.querySelector('#matrixCatalog'),
  resetSample: document.querySelector('#resetSample'),
  search: document.querySelector('#search'),
  groupFilter: document.querySelector('#groupFilter'),
  density: document.querySelector('#density'),
  fileMap: document.querySelector('#fileMap'),
  testMap: document.querySelector('#testMap'),
  edgeLayer: document.querySelector('#edgeLayer'),
  fileCount: document.querySelector('#fileCount'),
  testCount: document.querySelector('#testCount'),
  noLinkTestCount: document.querySelector('#noLinkTestCount'),
  edgeCount: document.querySelector('#edgeCount'),
  uncoveredCount: document.querySelector('#uncoveredCount'),
  coverageRate: document.querySelector('#coverageRate'),
  coverageMeter: document.querySelector('#coverageMeter'),
  generatedAt: document.querySelector('#generatedAt'),
  diagnostics: document.querySelector('#diagnostics'),
  changedFilesPreview: document.querySelector('#changedFilesPreview'),
  runPreview: document.querySelector('#runPreview'),
  previewResult: document.querySelector('#previewResult'),
  visibleFileCount: document.querySelector('#visibleFileCount'),
  visibleTestCount: document.querySelector('#visibleTestCount'),
  details: document.querySelector('#details'),
  coverageFilter: document.querySelector('#coverageFilter'),
  mapView: document.querySelector('#mapView'),
  circleView: document.querySelector('#circleView'),
  workspace: document.querySelector('.workspace'),
  circleGraphPanel: document.querySelector('#circleGraphPanel'),
  circleGraph: document.querySelector('#circleGraph'),
  circleGraphStats: document.querySelector('#circleGraphStats')
};

els.matrixCatalog.addEventListener('change', () => {
  if (els.matrixCatalog.value) loadCatalogMatrix(els.matrixCatalog.value);
});
els.matrixFile.addEventListener('change', handleFileUpload);
els.resetSample.addEventListener('click', () => loadSample());
els.search.addEventListener('input', () => {
  state.query = els.search.value.trim().toLowerCase();
  render();
});
els.groupFilter.addEventListener('change', () => {
  state.group = els.groupFilter.value;
  render();
});
els.density.addEventListener('change', () => {
  state.density = els.density.value;
  renderEdges();
});
els.coverageFilter.addEventListener('change', () => {
  state.coverage = els.coverageFilter.value;
  render();
});
els.runPreview.addEventListener('click', () => renderPreview());
els.mapView.addEventListener('click', () => setView('map'));
els.circleView.addEventListener('click', () => setView('circle'));
window.addEventListener('resize', () => requestAnimationFrame(renderActiveGraph));
els.fileMap.addEventListener('scroll', scheduleMapEdges, { passive: true });
els.testMap.addEventListener('scroll', scheduleMapEdges, { passive: true });

loadCatalog();

async function loadSample() {
  const response = await fetch('sample-matrix.json');
  const matrix = await response.json();
  setMatrix(matrix, 'Sample');
}

async function loadCatalog() {
  try {
    const response = await fetch('data/manifest.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(`No matrix catalog found: ${response.status}`);
    const manifest = await response.json();
    renderCatalog(manifest.entries ?? []);
    if (manifest.latest) {
      await loadCatalogMatrix(manifest.latest);
      els.matrixCatalog.value = manifest.latest;
      return;
    }
  } catch {
    renderCatalog([]);
  }

  await loadSample();
}

function renderCatalog(entries) {
  els.matrixCatalog.innerHTML = '';
  if (!entries.length) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'Sample matrix';
    els.matrixCatalog.append(option);
    return;
  }

  for (const entry of entries) {
    const option = document.createElement('option');
    option.value = entry.path;
    option.textContent = `${entry.label} · ${formatDate(entry.generatedAt)}`;
    els.matrixCatalog.append(option);
  }
}

async function loadCatalogMatrix(path) {
  try {
    const response = await fetch(path, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Matrix snapshot failed to load: ${response.status}`);
    const matrix = await response.json();
    const label = catalogLabel(matrix, path);
    setMatrix(matrix, label);
  } catch (error) {
    els.details.innerHTML = `<h2>Matrix could not be loaded</h2><p>${escapeHtml(error.message)}</p>`;
  }
}

async function handleFileUpload(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  try {
    const matrix = JSON.parse(await file.text());
    els.matrixCatalog.value = '';
    setMatrix(matrix, file.name);
  } catch (error) {
    els.details.innerHTML = `<h2>Matrix could not be loaded</h2><p>${escapeHtml(error.message)}</p>`;
  }
}

function catalogLabel(matrix, path) {
  const catalog = matrix.catalog;
  if (!catalog) return path.split('/').at(-1) ?? 'Catalog matrix';
  const repo = catalog.repository ?? 'repository';
  return `${repo} @ ${(catalog.sha ?? '').slice(0, 7) || 'unknown'}`;
}

function setMatrix(matrix, sourceLabel) {
  const normalized = normalizeMatrix(matrix);
  state.matrix = normalized.matrix;
  state.files = normalized.files;
  state.tests = normalized.tests;
  state.links = normalized.links;
  state.selected = null;
  state.group = '';
  state.query = '';
  els.changedFilesPreview.value = '';
  els.previewResult.textContent = 'Paste changed files to preview impacted specs.';
  els.search.value = '';
  els.density.value = state.density;
  updateGroupFilter();
  renderSummary(sourceLabel);
  render();
}

function setView(view) {
  state.view = view;
  els.mapView.classList.toggle('active', view === 'map');
  els.circleView.classList.toggle('active', view === 'circle');
  els.workspace.hidden = view !== 'map';
  els.circleGraphPanel.hidden = view !== 'circle';
  requestAnimationFrame(renderActiveGraph);
}

function normalizeMatrix(matrix) {
  const testsById = matrix.tests ?? {};
  const filesByPath = matrix.files ?? {};
  const inventory = matrix.sourceFiles?.length
    ? matrix.sourceFiles
    : Object.keys(filesByPath);

  const files = [...new Set([...inventory, ...Object.keys(filesByPath)])]
    .map((path) => ({
      id: path,
      path,
      name: basename(path),
      group: groupName(path),
      tests: [...new Set(filesByPath[path] ?? [])].filter((id) => testsById[id]),
      covered: Boolean(filesByPath[path]?.length)
    }))
    .sort((a, b) => a.path.localeCompare(b.path));

  const tests = Object.entries(testsById)
    .map(([id, test]) => ({
      id,
      spec: test.spec ?? id.split('::')[0],
      title: test.title ?? 'unknown test',
      project: test.project ?? 'default',
      files: [...new Set(test.files ?? [])]
    }))
    .sort((a, b) => a.spec.localeCompare(b.spec) || a.title.localeCompare(b.title));

  const links = [];
  for (const file of files) {
    for (const testId of file.tests) {
      links.push({ fileId: file.id, testId });
    }
  }

  return { matrix, files, tests, links };
}

function renderSummary(sourceLabel) {
  const coveredFiles = state.files.filter((file) => file.covered).length;
  const uncoveredFiles = state.files.length - coveredFiles;
  const coverageRate = state.files.length
    ? Math.round((coveredFiles / state.files.length) * 100)
    : 0;

  els.fileCount.textContent = coveredFiles;
  els.uncoveredCount.textContent = uncoveredFiles;
  els.testCount.textContent = state.tests.length;
  els.noLinkTestCount.textContent = state.tests.filter((test) => test.files.length === 0).length;
  els.edgeCount.textContent = state.links.length;
  els.coverageRate.textContent = `${coverageRate}%`;
  els.coverageMeter.style.width = `${coverageRate}%`;
  els.generatedAt.textContent = sourceLabel || formatDate(state.matrix.generatedAt);
  renderDiagnostics({ coveredFiles, uncoveredFiles, coverageRate });
}

function renderDiagnostics(summary) {
  const zeroLinkTests = state.tests.filter((test) => test.files.length === 0).length;
  const diagnostics = [
    {
      label: 'Matrix commit',
      value: state.matrix.baseCommit ? state.matrix.baseCommit.slice(0, 8) : 'unknown',
      tone: state.matrix.baseCommit ? 'ok' : 'warn'
    },
    {
      label: 'Generated',
      value: formatDate(state.matrix.generatedAt ?? state.matrix.catalog?.generatedAt),
      tone: 'ok'
    },
    {
      label: 'Source coverage',
      value: `${summary.coveredFiles}/${state.files.length} files (${summary.coverageRate}%)`,
      tone: summary.uncoveredFiles ? 'warn' : 'ok'
    },
    {
      label: 'Uncovered files',
      value: summary.uncoveredFiles,
      tone: summary.uncoveredFiles ? 'warn' : 'ok'
    },
    {
      label: 'Tests without links',
      value: zeroLinkTests,
      tone: zeroLinkTests ? 'warn' : 'ok'
    }
  ];

  els.diagnostics.innerHTML = diagnostics.map((item) => `
    <div class="diagnostic ${item.tone}">
      <span>${escapeHtml(item.label)}</span>
      <strong>${escapeHtml(item.value)}</strong>
    </div>
  `).join('');
}

function updateGroupFilter() {
  const groups = [...new Set(state.files.map((file) => file.group))].sort();
  els.groupFilter.innerHTML = '<option value="">All groups</option>';
  for (const group of groups) {
    const option = document.createElement('option');
    option.value = group;
    option.textContent = group;
    els.groupFilter.append(option);
  }
}

function render() {
  const visibleFiles = filteredFiles();
  const visibleTestIds = new Set(visibleFiles.flatMap((file) => file.tests));
  const visibleTests = filteredTests().filter((test) => {
    if (!state.query && !state.group && state.coverage === 'all') return true;
    return visibleTestIds.has(test.id) || matchesQuery(test);
  });

  els.visibleFileCount.textContent = `${visibleFiles.length} visible`;
  els.visibleTestCount.textContent = `${visibleTests.length} visible`;
  renderFiles(visibleFiles);
  renderTests(visibleTests);
  renderDetails();
  requestAnimationFrame(renderActiveGraph);
}

function filteredFiles() {
  return state.files.filter((file) => {
    if (state.group && file.group !== state.group) return false;
    if (state.coverage === 'covered' && !file.covered) return false;
    if (state.coverage === 'uncovered' && file.covered) return false;
    if (!state.query) return true;
    return file.path.toLowerCase().includes(state.query)
      || file.tests.some((id) => {
        const test = state.tests.find((item) => item.id === id);
        return test && matchesQuery(test);
      });
  });
}

function filteredTests() {
  return state.tests.filter((test) => !state.query || matchesQuery(test));
}

function renderFiles(files) {
  els.fileMap.innerHTML = '';
  if (!files.length) {
    els.fileMap.innerHTML = '<div class="empty">No matching SUT files.</div>';
    return;
  }

  const groups = groupBy(files, (file) => file.group);
  for (const [group, groupFiles] of groups) {
    const section = document.createElement('section');
    section.className = 'group';
    section.innerHTML = `<p class="group-title"><span>${escapeHtml(group)}</span><span>${groupFiles.length}</span></p>`;
    for (const file of groupFiles) section.append(createFileNode(file));
    els.fileMap.append(section);
  }
}

function renderTests(tests) {
  els.testMap.innerHTML = '';
  if (!tests.length) {
    els.testMap.innerHTML = '<div class="empty">No matching Playwright specs.</div>';
    return;
  }

  const groups = groupBy(tests, (test) => test.spec);
  for (const [spec, specTests] of groups) {
    const section = document.createElement('section');
    section.className = 'group';
    section.innerHTML = `<p class="group-title"><span>${escapeHtml(spec)}</span><span>${specTests.length}</span></p>`;
    for (const test of specTests) section.append(createTestNode(test));
    els.testMap.append(section);
  }
}

function createFileNode(file) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = nodeClass('file', file.id);
  button.dataset.nodeType = 'file';
  button.dataset.id = file.id;
  button.innerHTML = `
    <span>
      <strong>${escapeHtml(file.name)}</strong>
      <span>${escapeHtml(file.path)}</span>
    </span>
    <span class="count">${file.covered ? file.tests.length : '0'}</span>
  `;
  button.addEventListener('click', () => selectNode('file', file.id));
  return button;
}

function createTestNode(test) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = nodeClass('test', test.id);
  button.dataset.nodeType = 'test';
  button.dataset.id = test.id;
  button.innerHTML = `
    <span>
      <strong>${escapeHtml(test.title)}</strong>
      <span>${escapeHtml(test.project)} in ${escapeHtml(test.spec)}</span>
    </span>
    <span class="count">${test.files.length}</span>
  `;
  button.addEventListener('click', () => selectNode('test', test.id));
  return button;
}

function nodeClass(type, id) {
  const classes = ['node'];
  if (type === 'file') {
    const file = state.files.find((item) => item.id === id);
    if (file && !file.covered) classes.push('uncovered');
  }
  if (type === 'test') {
    const test = state.tests.find((item) => item.id === id);
    if (test && test.files.length === 0) classes.push('no-links');
  }
  if (state.selected?.type === type && state.selected.id === id) classes.push('active');
  if (state.selected && isRelated(type, id)) classes.push('related');
  if (state.selected && !isRelated(type, id) && !(state.selected.type === type && state.selected.id === id)) {
    classes.push('dimmed');
  }
  return classes.join(' ');
}

function selectNode(type, id) {
  if (state.selected?.type === type && state.selected.id === id) {
    state.selected = null;
  } else {
    state.selected = { type, id };
  }
  render();
}

function isRelated(type, id) {
  if (!state.selected) return false;
  if (state.selected.type === 'file' && type === 'test') {
    return state.links.some((link) => link.fileId === state.selected.id && link.testId === id);
  }
  if (state.selected.type === 'test' && type === 'file') {
    return state.links.some((link) => link.testId === state.selected.id && link.fileId === id);
  }
  return false;
}

function renderEdges() {
  if (state.view !== 'map') return;

  const fileNodes = visibleNodeMap('[data-node-type="file"]', els.fileMap);
  const testNodes = visibleNodeMap('[data-node-type="test"]', els.testMap);
  const graphBox = els.edgeLayer.getBoundingClientRect();
  const visibleLinks = state.links.filter((link) => fileNodes.has(link.fileId) && testNodes.has(link.testId));
  const selectedLinks = visibleLinks.filter((link) => {
    if (!state.selected) return true;
    return state.selected.type === 'file'
      ? link.fileId === state.selected.id
      : link.testId === state.selected.id;
  });
  const links = state.density === 'selected' || state.selected ? selectedLinks : visibleLinks;

  els.edgeLayer.setAttribute('viewBox', `0 0 ${Math.max(graphBox.width, 1)} ${Math.max(graphBox.height, 1)}`);
  els.edgeLayer.innerHTML = '';

  for (const link of links) {
    const fileBox = fileNodes.get(link.fileId).getBoundingClientRect();
    const testBox = testNodes.get(link.testId).getBoundingClientRect();
    const y1 = fileBox.top + fileBox.height / 2 - graphBox.top;
    const y2 = testBox.top + testBox.height / 2 - graphBox.top;
    const x1 = 0;
    const x2 = graphBox.width;
    const curve = Math.max(40, graphBox.width * 0.42);
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('class', state.selected ? 'edge active' : 'edge');
    if (!state.selected && linkWeight(link) > 1) path.classList.add('high');
    path.setAttribute('d', `M ${x1} ${y1} C ${curve} ${y1}, ${x2 - curve} ${y2}, ${x2} ${y2}`);
    els.edgeLayer.append(path);
  }
}

function scheduleMapEdges() {
  if (state.view !== 'map') return;
  if (scheduleMapEdges.frame) return;
  scheduleMapEdges.frame = requestAnimationFrame(() => {
    scheduleMapEdges.frame = 0;
    renderEdges();
  });
}

function visibleNodeMap(selector, viewportElement) {
  const viewport = viewportElement.getBoundingClientRect();
  return new Map([...document.querySelectorAll(selector)]
    .filter((node) => {
      const box = node.getBoundingClientRect();
      return box.bottom >= viewport.top && box.top <= viewport.bottom;
    })
    .map((node) => [node.dataset.id, node]));
}

function renderActiveGraph() {
  if (state.view === 'circle') {
    renderCircleGraph();
  } else {
    renderEdges();
  }
}

function renderCircleGraph() {
  const svg = els.circleGraph;
  const box = svg.getBoundingClientRect();
  const width = Math.max(box.width, 720);
  const height = Math.max(box.height, 520);
  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.min(width, height) * 0.39;
  const files = filteredFiles();
  const fileIds = new Set(files.map((file) => file.id));
  const tests = filteredTests().filter((test) => {
    if (!state.group && state.coverage === 'all') return true;
    return test.files.some((file) => fileIds.has(file)) || matchesQuery(test);
  });
  const testIds = new Set(tests.map((test) => test.id));
  const links = state.links.filter((link) => fileIds.has(link.fileId) && testIds.has(link.testId));
  const filePositions = radialPositions(files, cx, cy, radius, 118, 242);
  const testPositions = radialPositions(tests, cx, cy, radius, -62, 62);

  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.innerHTML = '';
  els.circleGraphStats.textContent = `${files.length + tests.length} nodes · ${links.length} links`;

  if (!files.length && !tests.length) {
    const empty = createSvg('text', {
      class: 'circle-empty',
      x: cx,
      y: cy
    });
    empty.textContent = 'No matching graph nodes';
    svg.append(empty);
    return;
  }

  const linkLayer = createSvg('g');
  const nodeLayer = createSvg('g');
  const labelLayer = createSvg('g');
  svg.append(linkLayer, nodeLayer, labelLayer);

  for (const link of links) {
    const filePosition = filePositions.get(link.fileId);
    const testPosition = testPositions.get(link.testId);
    if (!filePosition || !testPosition) continue;
    const active = isLinkActive(link);
    const path = createSvg('path', {
      class: circleClass('circle-link', link.fileId, link.testId, active),
      d: curvedRadialPath(filePosition, testPosition, cx, cy)
    });
    linkLayer.append(path);
  }

  for (const file of files) {
    const position = filePositions.get(file.id);
    const node = createCircleNode({
      type: 'file',
      id: file.id,
      label: file.path,
      position,
      radius: nodeRadius(file.tests.length),
      className: circleNodeClass('file', file.id)
    });
    nodeLayer.append(node);
    if (shouldLabelNode(file, position.index, files.length)) {
      labelLayer.append(createCircleLabel(file.name, file.id, position, cx, 'file', file.covered));
    }
  }

  for (const test of tests) {
    const position = testPositions.get(test.id);
    const node = createCircleNode({
      type: 'test',
      id: test.id,
      label: `${test.spec}: ${test.title}`,
      position,
      radius: nodeRadius(test.files.length),
      className: circleNodeClass('test', test.id)
    });
    nodeLayer.append(node);
    if (shouldLabelNode(test, position.index, tests.length)) {
      labelLayer.append(createCircleLabel(test.title, test.id, position, cx, 'test', test.files.length > 0));
    }
  }
}

function renderDetails() {
  if (!state.selected) {
    els.details.innerHTML = `
      <h2>Coverage map</h2>
      <p>Select a SUT file or Playwright test to highlight its impact links. Load a real matrix JSON to inspect a product test suite.</p>
    `;
    return;
  }

  if (state.selected.type === 'file') {
    const file = state.files.find((item) => item.id === state.selected.id);
    const tests = file.tests.map((id) => state.tests.find((test) => test.id === id)).filter(Boolean);
    els.details.innerHTML = `
      <small>SUT file</small>
      <h2>${escapeHtml(file.path)}</h2>
      <p>${tests.length
        ? `${tests.length} Playwright test${tests.length === 1 ? '' : 's'} cover this file.`
        : 'No Playwright tests covered this file in the recorded matrix.'}</p>
      <div class="details-list">${tests.map((test) => `<span class="pill">${escapeHtml(test.spec)}: ${escapeHtml(test.title)}</span>`).join('')}</div>
    `;
    return;
  }

  const test = state.tests.find((item) => item.id === state.selected.id);
  const noCoverageCopy = test.files.length === 0
    ? 'The test ran, but the browser coverage collector did not observe any instrumented SUT file hits for it.'
    : `${escapeHtml(test.spec)} covers ${test.files.length} SUT file${test.files.length === 1 ? '' : 's'}.`;
  els.details.innerHTML = `
    <small>Playwright test</small>
    <h2>${escapeHtml(test.title)}</h2>
    <p>${noCoverageCopy}</p>
    <div class="details-list">${test.files.map((file) => `<span class="pill">${escapeHtml(file)}</span>`).join('')}</div>
  `;
}

function renderPreview() {
  const changedFiles = els.changedFilesPreview.value
    .split(/[\n,]/)
    .map((file) => file.trim())
    .filter(Boolean);
  const selection = previewSelection(changedFiles);
  const specs = selection.specs.length
    ? `<div class="details-list">${selection.specs.map((spec) => `<span class="pill">${escapeHtml(spec)}</span>`).join('')}</div>`
    : '';

  els.previewResult.innerHTML = `
    <strong>${escapeHtml(selection.decision.toUpperCase())}</strong>
    <span>${escapeHtml(selection.reason)}</span>
    ${specs}
  `;
}

function previewSelection(changedFiles) {
  if (!changedFiles.length) {
    return { decision: 'none', specs: [], reason: 'No changed files were provided.' };
  }

  const impactedTestIds = new Set();
  for (const file of changedFiles) {
    const normalized = normalizePreviewPath(file);
    if (isGlobalChange(normalized)) {
      return { decision: 'full', specs: [], reason: `${normalized} is configured as a global-change file.` };
    }

    const testIds = state.matrix.files?.[normalized];
    if (testIds?.length) {
      for (const testId of testIds) impactedTestIds.add(testId);
      continue;
    }

    if (isRelevantPreviewSource(normalized)) {
      return { decision: 'full', specs: [], reason: `Changed source file is not in the matrix: ${normalized}` };
    }
  }

  const specs = [...new Set([...impactedTestIds]
    .map((testId) => state.tests.find((test) => test.id === testId)?.spec)
    .filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));

  if (!specs.length) return { decision: 'none', specs: [], reason: 'No impacted Playwright specs were found.' };
  return { decision: 'selected', specs, reason: `${specs.length} impacted Playwright spec file${specs.length === 1 ? '' : 's'} found.` };
}

function normalizePreviewPath(file) {
  return file.replace(/^file:\/\//, '')
    .replace(/^\.\//, '')
    .replaceAll('\\', '/')
    .split('?')[0]
    .split('#')[0];
}

function isGlobalChange(file) {
  return [
    'package.json',
    'package-lock.json',
    'pnpm-lock.yaml',
    'yarn.lock',
    'bun.lockb',
    'playwright.config.ts',
    'playwright.config.js',
    'vite.config.ts',
    'vite.config.js',
    'webpack.config.js',
    'tsconfig.json'
  ].includes(file);
}

function isRelevantPreviewSource(file) {
  if (file.startsWith('.github/') || file.endsWith('.md') || file.endsWith('.txt')) return false;
  return ['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.vue', '.svelte', '.css', '.scss', '.sass', '.less', '.html']
    .some((extension) => file.endsWith(extension));
}

function radialPositions(items, cx, cy, radius, startDegrees, endDegrees) {
  const positions = new Map();
  const span = endDegrees - startDegrees;
  const count = Math.max(items.length, 1);
  items.forEach((item, index) => {
    const ratio = count === 1 ? 0.5 : index / count;
    const angle = degreesToRadians(startDegrees + span * ratio);
    positions.set(item.id, {
      index,
      angle,
      x: cx + Math.cos(angle) * radius,
      y: cy + Math.sin(angle) * radius
    });
  });
  return positions;
}

function createCircleNode({ type, id, label, position, radius, className }) {
  const group = createSvg('g', {
    class: className,
    tabindex: '0',
    role: 'button'
  });
  group.dataset.nodeType = type;
  group.dataset.id = id;
  group.append(createSvg('title', {}, label));
  group.append(createSvg('circle', {
    cx: position.x,
    cy: position.y,
    r: radius
  }));
  group.addEventListener('click', () => selectNode(type, id));
  group.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      selectNode(type, id);
    }
  });
  return group;
}

function createCircleLabel(label, id, position, cx, type, linked) {
  const anchor = position.x < cx ? 'end' : 'start';
  const xOffset = position.x < cx ? -10 : 10;
  const text = createSvg('text', {
    class: `circle-label ${type === 'test' || !linked ? 'muted' : ''} ${state.selected && !isRelated(type, id) && !(state.selected.type === type && state.selected.id === id) ? 'dimmed' : ''}`,
    x: position.x + xOffset,
    y: position.y + 4,
    'text-anchor': anchor
  });
  text.textContent = trimMiddle(label, 28);
  return text;
}

function circleClass(base, fileId, testId, active) {
  const classes = [base];
  if (active) classes.push('active');
  if (state.selected && !active) classes.push('dimmed');
  return classes.join(' ');
}

function circleNodeClass(type, id) {
  const classes = ['circle-node', type];
  if (type === 'file') {
    const file = state.files.find((item) => item.id === id);
    if (file && !file.covered) classes.push('uncovered');
  }
  if (type === 'test') {
    const test = state.tests.find((item) => item.id === id);
    if (test && test.files.length === 0) classes.push('no-links');
  }
  if (state.selected?.type === type && state.selected.id === id) classes.push('active');
  if (state.selected && isRelated(type, id)) classes.push('related');
  if (state.selected && !isRelated(type, id) && !(state.selected.type === type && state.selected.id === id)) {
    classes.push('dimmed');
  }
  return classes.join(' ');
}

function isLinkActive(link) {
  if (!state.selected) return false;
  return state.selected.type === 'file'
    ? link.fileId === state.selected.id
    : link.testId === state.selected.id;
}

function curvedRadialPath(filePosition, testPosition, cx, cy) {
  const c1x = (filePosition.x + cx) / 2;
  const c1y = (filePosition.y + cy) / 2;
  const c2x = (testPosition.x + cx) / 2;
  const c2y = (testPosition.y + cy) / 2;
  return `M ${filePosition.x} ${filePosition.y} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${testPosition.x} ${testPosition.y}`;
}

function nodeRadius(linkCount) {
  return Math.min(11, 4.8 + Math.sqrt(Math.max(linkCount, 0)) * 1.2);
}

function shouldLabelNode(item, index, total) {
  if (state.selected?.id === item.id) return true;
  if (isRelated(item.files ? 'test' : 'file', item.id)) return true;
  if (total > 48) return false;
  const stride = total > 32 ? 8 : total > 20 ? 5 : total > 12 ? 3 : 2;
  return index % stride === 0;
}

function createSvg(tag, attributes = {}, text = '') {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [key, value] of Object.entries(attributes)) {
    if (key === 'class') {
      node.setAttribute('class', value);
    } else {
      node.setAttribute(key, value);
    }
  }
  if (text) node.textContent = text;
  return node;
}

function degreesToRadians(value) {
  return (value * Math.PI) / 180;
}

function trimMiddle(value, maxLength) {
  const text = String(value);
  if (text.length <= maxLength) return text;
  const head = Math.ceil((maxLength - 1) / 2);
  const tail = Math.floor((maxLength - 1) / 2);
  return `${text.slice(0, head)}…${text.slice(-tail)}`;
}

function groupBy(values, getKey) {
  const map = new Map();
  for (const value of values) {
    const key = getKey(value);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(value);
  }
  return [...map.entries()];
}

function matchesQuery(test) {
  const query = state.query;
  return test.spec.toLowerCase().includes(query)
    || test.title.toLowerCase().includes(query)
    || test.files.some((file) => file.toLowerCase().includes(query));
}

function linkWeight(link) {
  const file = state.files.find((item) => item.id === link.fileId);
  const test = state.tests.find((item) => item.id === link.testId);
  return Math.max(file?.tests.length ?? 1, test?.files.length ?? 1);
}

function basename(value) {
  return value.split('/').at(-1) || value;
}

function groupName(value) {
  const parts = value.split('/');
  return parts.length > 1 ? parts.slice(0, -1).join('/') : 'root';
}

function formatDate(value) {
  if (!value) return 'Unknown';
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? String(value) : date.toLocaleDateString();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
