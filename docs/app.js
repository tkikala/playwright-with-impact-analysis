const state = {
  matrix: null,
  files: [],
  tests: [],
  links: [],
  selected: null,
  query: '',
  group: '',
  density: 'all'
};

const els = {
  matrixFile: document.querySelector('#matrixFile'),
  resetSample: document.querySelector('#resetSample'),
  search: document.querySelector('#search'),
  groupFilter: document.querySelector('#groupFilter'),
  density: document.querySelector('#density'),
  fileMap: document.querySelector('#fileMap'),
  testMap: document.querySelector('#testMap'),
  edgeLayer: document.querySelector('#edgeLayer'),
  fileCount: document.querySelector('#fileCount'),
  testCount: document.querySelector('#testCount'),
  edgeCount: document.querySelector('#edgeCount'),
  generatedAt: document.querySelector('#generatedAt'),
  visibleFileCount: document.querySelector('#visibleFileCount'),
  visibleTestCount: document.querySelector('#visibleTestCount'),
  details: document.querySelector('#details')
};

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
window.addEventListener('resize', () => requestAnimationFrame(renderEdges));

loadSample();

async function loadSample() {
  const response = await fetch('sample-matrix.json');
  const matrix = await response.json();
  setMatrix(matrix, 'Sample');
}

async function handleFileUpload(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  try {
    const matrix = JSON.parse(await file.text());
    setMatrix(matrix, file.name);
  } catch (error) {
    els.details.innerHTML = `<h2>Matrix could not be loaded</h2><p>${escapeHtml(error.message)}</p>`;
  }
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
  els.search.value = '';
  els.density.value = state.density;
  updateGroupFilter();
  renderSummary(sourceLabel);
  render();
}

function normalizeMatrix(matrix) {
  const testsById = matrix.tests ?? {};
  const filesByPath = matrix.files ?? {};

  const files = Object.entries(filesByPath)
    .map(([path, testIds]) => ({
      id: path,
      path,
      name: basename(path),
      group: groupName(path),
      tests: [...new Set(testIds ?? [])].filter((id) => testsById[id])
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
  els.fileCount.textContent = state.files.length;
  els.testCount.textContent = state.tests.length;
  els.edgeCount.textContent = state.links.length;
  els.generatedAt.textContent = sourceLabel || formatDate(state.matrix.generatedAt);
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
    if (!state.query && !state.group) return true;
    return visibleTestIds.has(test.id) || matchesQuery(test);
  });

  els.visibleFileCount.textContent = `${visibleFiles.length} visible`;
  els.visibleTestCount.textContent = `${visibleTests.length} visible`;
  renderFiles(visibleFiles);
  renderTests(visibleTests);
  renderDetails();
  requestAnimationFrame(renderEdges);
}

function filteredFiles() {
  return state.files.filter((file) => {
    if (state.group && file.group !== state.group) return false;
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
    <span class="count">${file.tests.length}</span>
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
  const fileNodes = new Map([...document.querySelectorAll('[data-node-type="file"]')]
    .map((node) => [node.dataset.id, node]));
  const testNodes = new Map([...document.querySelectorAll('[data-node-type="test"]')]
    .map((node) => [node.dataset.id, node]));
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
    path.setAttribute('d', `M ${x1} ${y1} C ${curve} ${y1}, ${x2 - curve} ${y2}, ${x2} ${y2}`);
    els.edgeLayer.append(path);
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
      <p>${tests.length} Playwright test${tests.length === 1 ? '' : 's'} cover this file.</p>
      <div class="details-list">${tests.map((test) => `<span class="pill">${escapeHtml(test.spec)}: ${escapeHtml(test.title)}</span>`).join('')}</div>
    `;
    return;
  }

  const test = state.tests.find((item) => item.id === state.selected.id);
  els.details.innerHTML = `
    <small>Playwright test</small>
    <h2>${escapeHtml(test.title)}</h2>
    <p>${escapeHtml(test.spec)} covers ${test.files.length} SUT file${test.files.length === 1 ? '' : 's'}.</p>
    <div class="details-list">${test.files.map((file) => `<span class="pill">${escapeHtml(file)}</span>`).join('')}</div>
  `;
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
