'use strict';
(() => {
  const api = window.deployApi;
  const $ = (id) => document.getElementById(id);
  const STEP_LABELS = {
    appliance: 'Get the verified appliance', import: 'Import into the hypervisor', configure: 'Bridge the network and attach the serial report',
    start: 'Start the virtual machine', report: 'Wait for the appliance to report its address', health: 'Check health at the LAN address',
  };
  const state = { hypervisors: [], chosen: null, release: null, localOva: null, steps: {}, lastFailure: null, removing: null };

  const motionBox = $('motion');
  try { motionBox.checked = localStorage.getItem('motion') !== 'off'; } catch {}
  const applyMotion = () => { document.body.classList.toggle('motion', motionBox.checked); try { localStorage.setItem('motion', motionBox.checked ? 'on' : 'off'); } catch {} };
  motionBox.addEventListener('change', applyMotion); applyMotion();

  function show(view) {
    for (const id of ['deploy', 'progress', 'ready', 'instances']) $(id).hidden = id !== view;
    for (const b of document.querySelectorAll('.nav')) {
      const on = b.dataset.view === view || (view !== 'instances' && b.dataset.view === 'deploy');
      if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    }
    if (view === 'instances') loadInstances();
  }
  document.querySelectorAll('.nav').forEach((b) => b.addEventListener('click', () => show(b.dataset.view)));

  function el(tag, attrs = {}, ...kids) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') n.className = v; else if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else if (v !== null && v !== undefined && v !== false) n.setAttribute(k, v === true ? '' : v);
    }
    for (const k of kids) if (k !== null && k !== undefined) n.append(k);
    return n;
  }

  async function loadHypervisors() {
    state.hypervisors = await api.hypervisors();
    const box = $('hvCards'); box.replaceChildren();
    if (!state.hypervisors.length) {
      box.append(el('p', { class: 'error' }, 'Neither VirtualBox nor VMware Workstation was found. Install one of them, then reopen this app.'));
      $('deployBtn').disabled = true; return;
    }
    for (const h of state.hypervisors) {
      box.append(el('button', { type: 'button', class: 'card', 'aria-pressed': 'false', disabled: !h.ready, 'data-id': h.id, onclick: () => choose(h.id) },
        el('strong', {}, h.name),
        el('span', { class: 'muted small' }, h.id === 'virtualbox' ? `VBoxManage ${h.version || ''} found` : (h.ovftool ? 'vmrun and OVF Tool found' : 'vmrun found')),
        el('span', { class: h.ready ? 'ok' : 'bad' }, h.ready ? 'Ready' : h.problem)));
    }
    const first = state.hypervisors.find((h) => h.ready);
    if (first) choose(first.id);
  }

  async function choose(id) {
    state.chosen = id;
    document.querySelectorAll('.card').forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.id === id)));
    const h = state.hypervisors.find((x) => x.id === id);
    $('deployBtn').textContent = `Deploy to ${h.id === 'vmware' ? 'VMware' : 'VirtualBox'}`;
    const sel = $('adapter'); sel.replaceChildren(el('option', {}, 'Loading…')); sel.disabled = true;
    try {
      const list = await api.adapters(id);
      sel.replaceChildren(...list.map((a) => el('option', { value: a }, a)));
      sel.disabled = id === 'vmware';
    } catch (e) { sel.replaceChildren(el('option', { value: '' }, 'No adapters found')); }
  }

  async function loadRelease() {
    try {
      state.release = await api.latestRelease();
      $('releaseLabel').textContent = state.release.ova
        ? `Latest release (${state.release.tag}, ${(state.release.ova.size / 1073741824).toFixed(2)} GB, SHA-256 checked)`
        : `Latest release unavailable: ${state.release.reason}`;
    } catch (e) { $('releaseLabel').textContent = 'Latest release unavailable: this computer could not reach GitHub. Use a local .ova file.'; }
  }
  document.querySelectorAll('input[name=src]').forEach((r) => r.addEventListener('change', () => { $('pickOva').hidden = r.value !== 'local' || !r.checked; if (r.value === 'release' && r.checked) $('pickOva').hidden = true; }));
  $('pickOva').addEventListener('click', async () => { const f = await api.pickOva(); if (f) { state.localOva = f; $('localName').textContent = f; } });

  function renderSteps() {
    const ol = $('steps'); ol.replaceChildren();
    for (const id of Object.keys(STEP_LABELS)) {
      const s = state.steps[id] || { state: 'waiting', detail: '' };
      ol.append(el('li', {}, el('span', { class: `dot ${s.state}`, 'aria-hidden': 'true' }), el('span', { class: 'label' }, STEP_LABELS[id]),
        el('span', { class: 'detail' }, s.state === 'waiting' ? 'waiting' : (s.detail || s.state))));
    }
  }
  api.onEvent((m) => {
    if (m.type === 'step') { state.steps[m.id] = { state: m.state, detail: m.detail }; renderSteps(); }
    else if (m.type === 'progress' && m.total) {
      const pct = Math.round((m.done / m.total) * 100);
      $('barFill').style.width = `${pct}%`; $('bar').setAttribute('aria-valuenow', String(pct));
      state.steps.appliance = { state: 'active', detail: m.phase === 'cached' ? 'already downloaded and verified' : `${pct}% of ${(m.total / 1073741824).toFixed(2)} GB` };
      renderSteps();
    } else if (m.type === 'output') { const o = $('liveOutput'); o.textContent = (o.textContent + m.text).slice(-4000); o.scrollTop = o.scrollHeight; }
  });

  function readForm() {
    const name = $('name').value.trim(), cpus = Number($('cpus').value), memoryMb = Number($('memory').value);
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,47}$/.test(name)) return { error: 'Use 1 to 48 letters, digits, dots, dashes or underscores, starting with a letter or digit.' };
    if (!Number.isInteger(cpus) || cpus < 1 || cpus > 64) return { error: 'CPUs must be from 1 to 64.' };
    if (!Number.isInteger(memoryMb) || memoryMb < 1024) return { error: 'Memory must be at least 1024 MB.' };
    const local = document.querySelector('input[name=src][value=local]').checked;
    if (local && !state.localOva) return { error: 'Choose a local .ova file first.' };
    if (!local && !state.release?.ova) return { error: 'The latest release has no downloadable appliance. Choose a local file instead.' };
    if (state.chosen === 'virtualbox' && !$('adapter').value) return { error: 'Choose a network adapter to bridge.' };
    return { hypervisor: state.chosen, name, cpus, memoryMb, adapter: $('adapter').value, nested: $('nested').checked, localOva: local ? state.localOva : null };
  }

  $('deployBtn').addEventListener('click', async () => {
    const req = readForm();
    $('formError').textContent = req.error || '';
    if (req.error) return;
    state.steps = {}; renderSteps(); $('liveOutput').textContent = ''; $('barFill').style.width = '0';
    $('progressTitle').textContent = `Deploying ${req.name} to ${req.hypervisor === 'vmware' ? 'VMware' : 'VirtualBox'}`;
    show('progress');
    const r = await api.deploy(req);
    if (r.ok) {
      $('readyTitle').textContent = `${r.instance.name} is running`;
      $('readyDetail').textContent = `Deployed in ${Math.floor(r.seconds / 60)} min ${r.seconds % 60} s. Health checked just now.`;
      $('readyUrl').textContent = r.url; $('readyUrl').dataset.url = r.url;
      $('setupRow').hidden = !r.setup; $('setupCode').textContent = r.setup || '';
      show('ready'); $('readyTitle').focus();
    } else {
      for (const [id, s] of Object.entries(state.steps)) if (s.state === 'active') state.steps[id] = { state: 'failed', detail: 'failed' };
      renderSteps();
      fail(r);
    }
  });
  $('cancelBtn').addEventListener('click', () => api.cancel());
  $('readyUrl').addEventListener('click', (e) => { e.preventDefault(); api.open(e.currentTarget.dataset.url); });
  $('openReady').addEventListener('click', () => api.open($('readyUrl').dataset.url));
  $('copyUrl').addEventListener('click', () => api.copy($('readyUrl').dataset.url));
  $('copySetup').addEventListener('click', () => api.copy($('setupCode').textContent));
  $('toInstances').addEventListener('click', () => show('instances'));
  $('newDeploy').addEventListener('click', () => show('deploy'));
  $('refresh').addEventListener('click', () => loadInstances());
  $('openFolder').addEventListener('click', () => api.openFolder());

  function fail(r) {
    state.lastFailure = r; state.failReturn = document.activeElement;
    $('failMsg').textContent = r.message;
    $('failCode').textContent = r.exitCode ?? 'none';
    $('failTime').textContent = r.seconds != null ? `${r.seconds} s` : 'unknown';
    $('failAt').textContent = r.failedAt ? new Date(r.failedAt).toLocaleTimeString([], { hour12: false }) : new Date().toLocaleTimeString([], { hour12: false });
    $('failCommand').textContent = r.command || 'No external command failed; the message above is the cause.';
    $('failOutput').textContent = r.output || 'No output was captured.';
    $('failOverlay').hidden = false; $('failDismiss').focus();
  }
  const closeFail = () => { $('failOverlay').hidden = true; show('deploy'); $('deployBtn').focus(); };
  $('failDismiss').addEventListener('click', closeFail);
  $('failRetry').addEventListener('click', closeFail);
  $('failCopy').addEventListener('click', () => { const r = state.lastFailure || {}; api.copy([r.message, `Exit code: ${r.exitCode ?? 'none'}`, `Command: ${r.command || 'none'}`, r.output].join('\n')); });

  async function loadInstances() {
    const box = $('instanceList');
    box.replaceChildren(el('p', { class: 'muted' }, 'Checking instances…'));
    let list;
    try { list = await api.instances(); } catch (e) { box.replaceChildren(el('p', { class: 'error' }, e.message)); return; }
    box.replaceChildren();
    if (!list.length) { box.append(el('p', { class: 'muted' }, 'No instances yet. Deploy one to see it here.')); return; }
    const labels = { healthy: 'Healthy', starting: 'Running, not answering yet', stopped: 'Stopped', missing: 'Virtual machine missing', unavailable: 'Hypervisor unavailable' };
    for (const i of list) {
      const running = i.state === 'healthy' || i.state === 'starting';
      const checked = i.health?.checkedAt ? `, checked ${new Date(i.health.checkedAt).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit' })}` : '';
      const act = (a) => async (ev) => { ev.currentTarget.disabled = true; const r = await api.action(i.id, a); if (!r.ok) fail(r); loadInstances(); };
      box.append(el('article', { class: 'instance' },
        el('span', { class: `state ${i.state}`, 'aria-hidden': 'true' }),
        el('div', { class: 'meta' }, el('strong', {}, i.name), el('span', {}, `${i.hypervisor === 'vmware' ? 'VMware' : 'VirtualBox'} · ${i.version}`)),
        el('span', { class: 'small' }, labels[i.state] + (i.state === 'healthy' ? checked : '')),
        el('span', { class: 'url' }, i.lastUrl ? (running ? i.lastUrl : `Last seen ${i.lastUrl}`) : 'No address reported yet'),
        i.state !== 'missing' && i.state !== 'unavailable' ? el('button', { type: 'button', onclick: act(running ? 'stop' : 'start') }, running ? 'Stop' : 'Start') : null,
        running ? el('button', { type: 'button', onclick: act('restart') }, 'Restart') : null,
        i.state === 'healthy' ? el('button', { type: 'button', onclick: () => api.open(i.lastUrl) }, 'Open') : null,
        i.lastUrl ? el('button', { type: 'button', onclick: () => api.copy(i.lastUrl) }, 'Copy link') : null,
        i.setupCode ? el('button', { type: 'button', onclick: () => api.copy(i.setupCode) }, 'Copy setup code') : null,
        el('button', { type: 'button', class: 'remove', onclick: () => openRemove(i) }, 'Remove')));
    }
  }

  function openRemove(i) {
    state.removing = i; state.removeReturn = document.activeElement;
    $('removeTitle').textContent = `Remove ${i.name}?`;
    $('removeText').textContent = `This powers off and deletes the ${i.hypervisor === 'vmware' ? 'VMware' : 'VirtualBox'} machine ${i.name} and its disk files. Every QEMU guest, ISO and setting stored inside it is deleted too. This cannot be undone.`;
    state.keys = [false, false]; state.removeBusy = false;
    syncGate(); $('removeError').textContent = ''; $('removeDone').hidden = true;
    $('removeOverlay').hidden = false; $('key1').focus();
  }
  function syncGate() {
    const armed = state.keys[0] && state.keys[1];
    [['key1', 0], ['key2', 1]].forEach(([id, i]) => { $(id).setAttribute('aria-pressed', String(state.keys[i])); $(id).textContent = `Key ${i + 1}: ${state.keys[i] ? 'turned' : 'turn'}`; $(id).disabled = state.removeBusy; });
    const s = $('removeSlide');
    if (!armed) s.value = '0';
    s.disabled = !armed || state.removeBusy;
    $('slideLabel').textContent = armed ? 'Slide all the way to authorize removal' : 'Turn both keys to unlock the slider';
    s.setAttribute('aria-valuetext', `${s.value} percent`);
    $('slideFill').style.width = `${s.value}%`;
    $('slideFill').parentElement.classList.toggle('moving', armed && Number(s.value) > 0 && Number(s.value) < 100);
  }
  $('key1').addEventListener('click', () => { state.keys[0] = !state.keys[0]; syncGate(); });
  $('key2').addEventListener('click', () => { state.keys[1] = !state.keys[1]; syncGate(); });
  const closeRemove = () => { if (state.removeBusy) return; $('removeOverlay').hidden = true; state.removeReturn?.focus?.(); };
  $('removeCancel').addEventListener('click', closeRemove);
  $('removeSlide').addEventListener('input', async () => {
    syncGate();
    if (Number($('removeSlide').value) < 100 || !(state.keys[0] && state.keys[1]) || state.removeBusy) return;
    state.removeBusy = true; syncGate();
    $('removeDone').textContent = `Authorized. Removing ${state.removing.name}…`; $('removeDone').hidden = false;
    const r = await api.remove(state.removing.id, { keys: 2, slider: 100 });
    state.removeBusy = false;
    if (!r.ok) { $('removeDone').hidden = true; state.keys = [false, false]; syncGate(); $('removeError').textContent = r.message; if (r.command) { closeRemove(); fail(r); } return; }
    closeRemove(); loadInstances();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!$('removeOverlay').hidden) closeRemove(); else if (!$('failOverlay').hidden) closeFail();
  });

  (async () => {
    const info = await api.info();
    $('appVersion').textContent = `Version ${info.version}`;
    renderSteps();
    await Promise.all([loadHypervisors(), loadRelease()]);
  })();
})();
