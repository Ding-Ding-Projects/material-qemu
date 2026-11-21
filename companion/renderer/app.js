'use strict';
(() => {
  const api = window.deployApi;
  const { t } = window.I18N;
  const $ = (id) => document.getElementById(id);
  const STEP_LABELS = {
    appliance: 'Get the appliance', import: 'Import or create', configure: 'Configure network and reporting',
    start: 'Start', report: 'Wait for the address report', health: 'Check health at the LAN address',
  };
  const HV_SHORT = { virtualbox: 'VirtualBox', vmware: 'VMware', docker: 'Docker' };
  const state = { hypervisors: [], chosen: null, release: null, localOva: null, steps: {}, lastFailure: null, removing: null, keys: [false, false], removeBusy: false };

  const motionBox = $('motion');
  try { motionBox.checked = localStorage.getItem('motion') !== 'off'; } catch {}
  const applyMotion = () => { document.body.classList.toggle('motion', motionBox.checked); try { localStorage.setItem('motion', motionBox.checked ? 'on' : 'off'); } catch {} };
  motionBox.addEventListener('change', applyMotion); applyMotion();

  const langSel = $('lang');
  langSel.value = window.I18N.mode;
  langSel.addEventListener('change', () => { window.I18N.setMode(langSel.value); rerender(); });

  let currentView = 'deploy';
  function show(view) {
    currentView = view;
    for (const id of ['deploy', 'progress', 'ready', 'instances', 'flash']) $(id).hidden = id !== view;
    const navFor = view === 'instances' || view === 'flash' ? view : 'deploy';
    for (const b of document.querySelectorAll('.nav')) {
      if (b.dataset.view === navFor) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    }
    if (view === 'instances') loadInstances();
    if (view === 'flash') window.Flash?.render($('flash'));
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
  window.ui = { el, t, api, $ };

  function hvDetail(h) {
    if (h.id === 'virtualbox') return t('VBoxManage {v} found', { v: h.version || '' });
    if (h.id === 'docker') return h.version ? t('Docker engine {v}', { v: h.version }) : 'docker.exe';
    return h.ovftool ? t('vmrun and OVF Tool found') : t('vmrun found');
  }

  function renderHypervisors() {
    const box = $('hvCards'); box.replaceChildren();
    if (!state.hypervisors.length) {
      box.append(el('p', { class: 'error' }, t('No VirtualBox, VMware Workstation or Docker was found. Install one of them, then reopen this app.')));
      $('deployBtn').disabled = true; return;
    }
    for (const h of state.hypervisors) {
      box.append(el('button', { type: 'button', class: 'card', 'aria-pressed': String(state.chosen === h.id), disabled: !h.ready, 'data-id': h.id, onclick: () => choose(h.id) },
        el('strong', {}, t(h.name)),
        el('span', { class: 'muted small' }, hvDetail(h)),
        el('span', { class: h.ready ? 'ok' : 'bad' }, h.ready ? t('Ready') : t(h.problem))));
    }
  }

  async function loadHypervisors() {
    state.hypervisors = await api.hypervisors();
    const still = state.hypervisors.find((h) => h.id === state.chosen && h.ready);
    const first = still || state.hypervisors.find((h) => h.ready);
    renderHypervisors();
    $('deployBtn').disabled = !first;
    if (first) await choose(first.id);
  }
  $('hvRefresh').addEventListener('click', loadHypervisors);

  function updateDeployLabels() {
    const isDocker = state.chosen === 'docker';
    $('deployBtn').textContent = t('Deploy to {hv}', { hv: HV_SHORT[state.chosen] || '' });
    $('exposure').textContent = isDocker ? t('Docker publishes the port on this computer\'s LAN address. Nothing is exposed to the internet.') : t('The VM gets its own address on your network. Nothing is exposed to the internet.');
    $('imageLabel').textContent = state.release?.tag ? t('Container image {image}', { image: `ghcr.io/ding-ding-projects/material-qemu:${state.release.tag.replace(/^v/, '')}` }) : t('Latest release unavailable: {reason}', { reason: t(state.release?.reason || 'unknown') });
  }

  async function choose(id) {
    state.chosen = id;
    document.querySelectorAll('.card').forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.id === id)));
    const isDocker = id === 'docker';
    document.querySelectorAll('.vmOnly').forEach((n) => { n.hidden = isDocker; });
    document.querySelectorAll('.dockerOnly').forEach((n) => { n.hidden = !isDocker; });
    $('ovaSource').hidden = isDocker; $('imageSource').hidden = !isDocker;
    updateDeployLabels();
    if (isDocker) {
      const list = await api.lan();
      $('lanIp').replaceChildren(...list.map((a) => el('option', { value: a.address }, `${a.address} (${a.name})`)));
      return;
    }
    const sel = $('adapter'); sel.replaceChildren(el('option', {}, t('Loading…'))); sel.disabled = true;
    try {
      const list = await api.adapters(id);
      sel.replaceChildren(...list.map((a) => el('option', { value: a }, t(a))));
      sel.disabled = id === 'vmware';
    } catch { sel.replaceChildren(el('option', { value: '' }, t('No adapters found'))); }
  }

  function renderRelease() {
    const r = state.release;
    if (!r) { $('releaseLabel').textContent = t('Checking the latest release…'); return; }
    $('releaseLabel').textContent = r.ova
      ? t('Latest release ({tag}, {size} GB, SHA-256 checked)', { tag: r.tag, size: (r.ova.size / 1073741824).toFixed(2) })
      : t('Latest release unavailable: {reason}', { reason: t(r.reason) });
  }
  async function loadRelease() {
    try { state.release = await api.latestRelease(); } catch { state.release = { reason: 'Latest release unavailable: this computer could not reach GitHub. Use a local .ova file.' }; }
    renderRelease(); updateDeployLabels();
  }
  document.querySelectorAll('input[name=src]').forEach((r) => r.addEventListener('change', () => {
    $('pickOva').hidden = !document.querySelector('input[name=src][value=local]').checked;
  }));
  $('pickOva').addEventListener('click', async () => { const f = await api.pickOva(); if (f) { state.localOva = f; $('localName').textContent = f; } });

  function renderSteps() {
    const ol = $('steps'); ol.replaceChildren();
    for (const id of Object.keys(STEP_LABELS)) {
      const s = state.steps[id] || { state: 'waiting', detail: '' };
      ol.append(el('li', {}, el('span', { class: `dot ${s.state}`, 'aria-hidden': 'true' }), el('span', { class: 'label' }, t(STEP_LABELS[id])),
        el('span', { class: 'detail' }, s.state === 'waiting' ? t('waiting') : (s.detail || t(s.state)))));
    }
  }
  api.onEvent((m) => {
    if (m.type === 'step') { state.steps[m.id] = { state: m.state, detail: m.detail }; renderSteps(); }
    else if (m.type === 'progress' && m.total) {
      const pct = Math.round((m.done / m.total) * 100);
      $('barFill').style.width = `${pct}%`; $('bar').setAttribute('aria-valuenow', String(pct));
      state.steps.appliance = { state: 'active', detail: m.phase === 'cached' ? t('already downloaded and verified') : t('{pct}% of {size} GB', { pct, size: (m.total / 1073741824).toFixed(2) }) };
      renderSteps();
    } else if (m.type === 'output') { const o = $('liveOutput'); o.textContent = (o.textContent + m.text).slice(-4000); o.scrollTop = o.scrollHeight; }
  });

  function readForm() {
    const name = $('name').value.trim();
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,47}$/.test(name)) return { error: t('Use 1 to 48 letters, digits, dots, dashes or underscores, starting with a letter or digit.') };
    if (state.chosen === 'docker') {
      const port = Number($('port').value);
      if (!$('lanIp').value) return { error: t('Choose this computer\'s LAN address.') };
      if (!Number.isInteger(port) || port < 1024 || port > 65535) return { error: t('The port must be from 1024 to 65535.') };
      if (!state.release?.tag) return { error: t('Latest release unavailable: {reason}', { reason: t(state.release?.reason || 'unknown') }) };
      return { hypervisor: 'docker', name, ip: $('lanIp').value, port };
    }
    const cpus = Number($('cpus').value), memoryMb = Number($('memory').value);
    if (!Number.isInteger(cpus) || cpus < 1 || cpus > 64) return { error: t('CPUs must be from 1 to 64.') };
    if (!Number.isInteger(memoryMb) || memoryMb < 1024) return { error: t('Memory must be at least 1024 MB.') };
    const local = document.querySelector('input[name=src][value=local]').checked;
    if (local && !state.localOva) return { error: t('Choose a local .ova file first.') };
    if (!local && !state.release?.ova) return { error: t('The latest release has no downloadable appliance. Choose a local file instead.') };
    if (state.chosen === 'virtualbox' && !$('adapter').value) return { error: t('Choose a network adapter to bridge.') };
    return { hypervisor: state.chosen, name, cpus, memoryMb, adapter: $('adapter').value, nested: $('nested').checked, localOva: local ? state.localOva : null };
  }

  $('deployBtn').addEventListener('click', async () => {
    const req = readForm();
    $('formError').textContent = req.error || '';
    if (req.error) return;
    state.steps = {}; renderSteps(); $('liveOutput').textContent = ''; $('barFill').style.width = '0';
    state.progressTitle = { name: req.name, hv: HV_SHORT[req.hypervisor] };
    $('progressTitle').textContent = t('Deploying {name} to {hv}', state.progressTitle);
    show('progress');
    const r = await api.deploy(req);
    if (r.ok) {
      state.ready = r; renderReady();
      show('ready'); $('readyTitle').focus();
    } else {
      for (const [id, s] of Object.entries(state.steps)) if (s.state === 'active') state.steps[id] = { state: 'failed', detail: '' };
      renderSteps();
      fail(r);
    }
  });
  function renderReady() {
    const r = state.ready; if (!r) return;
    $('readyTitle').textContent = t('{name} is running', { name: r.instance.name });
    $('readyDetail').textContent = t('Deployed in {m} min {s} s. Health checked just now.', { m: Math.floor(r.seconds / 60), s: r.seconds % 60 });
    $('readyUrl').textContent = r.url; $('readyUrl').dataset.url = r.url;
  }
  $('cancelBtn').addEventListener('click', () => api.cancel());
  $('readyUrl').addEventListener('click', (e) => { e.preventDefault(); api.open(e.currentTarget.dataset.url); });
  $('openReady').addEventListener('click', () => api.open($('readyUrl').dataset.url));
  $('copyUrl').addEventListener('click', () => api.copy($('readyUrl').dataset.url));
  $('toInstances').addEventListener('click', () => show('instances'));
  $('newDeploy').addEventListener('click', () => show('deploy'));
  $('refresh').addEventListener('click', () => loadInstances());
  $('openFolder').addEventListener('click', () => api.openFolder());

  function fail(r) {
    state.lastFailure = r;
    $('failMsg').textContent = r.message;
    $('failCode').textContent = r.exitCode ?? t('none');
    $('failTime').textContent = r.seconds != null ? `${r.seconds} s` : t('unknown');
    $('failAt').textContent = new Date(r.failedAt || Date.now()).toLocaleTimeString([], { hour12: false });
    $('failCommand').textContent = r.command || t('No external command failed; the message above is the cause.');
    $('failOutput').textContent = r.output || t('No output was captured.');
    $('failOverlay').hidden = false; $('failDismiss').focus();
  }
  window.ui.fail = fail;
  const closeFail = () => { $('failOverlay').hidden = true; if (currentView === 'progress') show('deploy'); };
  $('failDismiss').addEventListener('click', closeFail);
  $('failRetry').addEventListener('click', () => { $('failOverlay').hidden = true; show('deploy'); $('deployBtn').focus(); });
  $('failCopy').addEventListener('click', () => { const r = state.lastFailure || {}; api.copy([r.message, `Exit code: ${r.exitCode ?? 'none'}`, `Command: ${r.command || 'none'}`, r.output].join('\n')); });

  const STATE_LABELS = { healthy: 'Healthy', starting: 'Running, not answering yet', stopped: 'Stopped', missing: 'Virtual machine missing', unavailable: 'Hypervisor unavailable' };
  async function loadInstances() {
    const box = $('instanceList');
    box.replaceChildren(el('p', { class: 'muted' }, t('Checking instances…')));
    let list;
    try { list = await api.instances(); } catch (e) { box.replaceChildren(el('p', { class: 'error' }, e.message)); return; }
    state.instances = list;
    renderInstances();
  }
  function renderInstances() {
    const box = $('instanceList'); const list = state.instances || [];
    box.replaceChildren();
    if (!list.length) { box.append(el('p', { class: 'muted' }, t('No instances yet. Deploy one to see it here.'))); return; }
    for (const i of list) {
      const running = i.state === 'healthy' || i.state === 'starting';
      const checked = i.health?.checkedAt ? ` · ${t('checked {time}', { time: new Date(i.health.checkedAt).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit' }) })}` : '';
      const act = (a) => async (ev) => { ev.currentTarget.disabled = true; const r = await api.action(i.id, a); if (!r.ok) fail(r); loadInstances(); };
      // A rack unit: screw ear, power/network LEDs, faceplate, controls.
      const pwr = running ? 'on' : (i.state === 'missing' || i.state === 'unavailable' ? 'bad' : '');
      const net = i.state === 'healthy' ? 'act' : '';
      box.append(el('article', { class: `instance${running ? '' : ' off'}`, 'aria-label': `${i.name}: ${t(STATE_LABELS[i.state])}` },
        el('div', { class: 'ear', 'aria-hidden': 'true' }, el('span'), el('span')),
        el('div', { class: 'leds', 'aria-hidden': 'true' },
          el('span', {}, el('span', { class: `led ${pwr}` }), 'PWR'),
          el('span', {}, el('span', { class: `led ${net}` }), 'NET')),
        el('div', { class: 'face' },
          el('div', { class: 'title' }, el('strong', {}, i.name), el('span', { class: 'tag' }, HV_SHORT[i.hypervisor] || i.hypervisor)),
          el('span', { class: `url${running ? '' : ' stale'}` }, i.lastUrl ? (running ? i.lastUrl : t('Last seen {url}', { url: i.lastUrl })) : t('No address reported yet')),
          el('span', { class: 'meta' }, `${i.version} · ${t(STATE_LABELS[i.state])}${i.state === 'healthy' ? checked : ''}`)),
        el('div', { class: 'ctl' },
          i.state !== 'missing' && i.state !== 'unavailable' ? el('button', { type: 'button', onclick: act(running ? 'stop' : 'start') }, running ? t('Stop') : t('Start')) : null,
          running ? el('button', { type: 'button', onclick: act('restart') }, t('Restart')) : null,
          i.state === 'healthy' ? el('button', { type: 'button', onclick: () => api.open(i.lastUrl) }, t('Open')) : null,
          i.lastUrl ? el('button', { type: 'button', onclick: () => api.copy(i.lastUrl) }, t('Copy link')) : null,
          el('button', { type: 'button', class: 'remove', onclick: (e) => openRemove(i, e.currentTarget) }, t('Remove')))));
    }
  }

  function openRemove(i, origin) {
    state.removing = i; state.removeReturn = origin;
    state.keys = [false, false]; state.removeBusy = false;
    renderRemove(); $('removeError').textContent = ''; $('removeDone').hidden = true;
    $('removeOverlay').hidden = false; $('key1').focus();
  }
  function renderRemove() {
    const i = state.removing; if (!i) return;
    $('removeTitle').textContent = t('Remove {name}?', { name: i.name });
    $('removeText').textContent = i.hypervisor === 'docker'
      ? t('This stops and deletes the container {name} and its data volume. Every QEMU guest, ISO and setting stored in it is deleted too. This cannot be undone.', { name: i.vmRef || i.name })
      : t('This powers off and deletes the {hv} machine {name} and its disk files. Every QEMU guest, ISO and setting stored inside it is deleted too. This cannot be undone.', { hv: HV_SHORT[i.hypervisor], name: i.name });
    syncGate();
  }
  // The drawn key switch: a round lock whose slot turns from SAFE to ARMED.
  function keySwitch(n, turned) {
    return [el('span', { class: 'lock', 'aria-hidden': 'true' }, el('span', { class: 'slot' })),
      el('span', { class: 'keytext', 'aria-hidden': 'true' }, el('small', {}, t('Key {n}', { n })), el('strong', {}, turned ? t('Armed') : t('Safe')))];
  }
  window.ui.keySwitch = keySwitch;

  function syncGate() {
    const armed = state.keys[0] && state.keys[1];
    [['key1', 0], ['key2', 1]].forEach(([id, n]) => {
      const b = $(id);
      b.setAttribute('aria-pressed', String(state.keys[n]));
      b.setAttribute('aria-label', t(state.keys[n] ? 'Key {n}: turned' : 'Key {n}: turn', { n: n + 1 }));
      b.replaceChildren(...keySwitch(n + 1, state.keys[n]));
      b.disabled = state.removeBusy;
    });
    $('slideBar').classList.toggle('armed', armed);
    const s = $('removeSlide');
    if (!armed) s.value = '0';
    s.disabled = !armed || state.removeBusy;
    $('slideLabel').textContent = armed ? t('Slide all the way to authorize removal') : t('Turn both keys to unlock the slider');
    s.setAttribute('aria-valuetext', t('{n} percent', { n: s.value }));
    $('slideFill').style.width = `${s.value}%`;
    $('slideBar').classList.toggle('moving', armed && Number(s.value) > 0 && Number(s.value) < 100);
  }
  $('key1').addEventListener('click', () => { state.keys[0] = !state.keys[0]; syncGate(); });
  $('key2').addEventListener('click', () => { state.keys[1] = !state.keys[1]; syncGate(); });
  const closeRemove = () => { if (state.removeBusy) return; $('removeOverlay').hidden = true; state.removeReturn?.focus?.(); };
  $('removeCancel').addEventListener('click', closeRemove);
  $('removeSlide').addEventListener('input', async () => {
    syncGate();
    if (Number($('removeSlide').value) < 100 || !(state.keys[0] && state.keys[1]) || state.removeBusy) return;
    state.removeBusy = true; syncGate();
    $('removeDone').textContent = t('Authorized. Removing {name}…', { name: state.removing.name }); $('removeDone').hidden = false;
    const r = await api.remove(state.removing.id, { keys: 2, slider: 100 });
    state.removeBusy = false;
    if (!r.ok) { $('removeDone').hidden = true; state.keys = [false, false]; syncGate(); $('removeError').textContent = t(r.message); if (r.command) { closeRemove(); fail(r); } return; }
    closeRemove(); loadInstances();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!$('removeOverlay').hidden) closeRemove();
    else if (!$('failOverlay').hidden) closeFail();
    else window.Flash?.escape?.();
  });

  function rerender() {
    window.I18N.apply();
    renderHypervisors(); renderRelease(); updateDeployLabels(); renderSteps();
    if (state.progressTitle) $('progressTitle').textContent = t('Deploying {name} to {hv}', state.progressTitle);
    renderReady();
    if (state.instances) renderInstances();
    if (!$('removeOverlay').hidden) renderRemove();
    if (currentView === 'flash') window.Flash?.render($('flash'));
    $('appVersion').textContent = t('Version {v}', { v: state.version || '' });
  }

  (async () => {
    window.I18N.apply();
    const notice = await api.notice();
    if (notice) { $('noticeText').textContent = notice; $('notice').hidden = false; }
    $('noticeClose').addEventListener('click', () => { $('notice').hidden = true; });
    const info = await api.info();
    state.version = info.version;
    $('appVersion').textContent = t('Version {v}', { v: info.version });
    renderSteps();
    await Promise.all([loadHypervisors(), loadRelease()]);
  })();
})();
