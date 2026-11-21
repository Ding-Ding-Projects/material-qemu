'use strict';
// The Flash page: write the PC (x86_64) or Raspberry Pi image to a removable
// USB or SD disk behind the two-key slider gate, then read it back.
window.Flash = (() => {
  const s = { kind: 'usb', disks: null, disk: null, release: null, keys: [false, false], busy: false, progress: null, result: null, error: null, root: null };
  const ui = () => window.ui;

  async function refreshDisks() {
    s.disks = null; s.disk = null; s.error = null; draw();
    try { s.disks = await ui().api.flashDisks(); } catch (e) { s.error = e.message; s.disks = []; }
    draw();
  }
  async function loadRelease() {
    try { s.release = await ui().api.latestRelease(); } catch { s.release = { reason: 'Latest release unavailable: this computer could not reach GitHub. Use a local .ova file.' }; }
    draw();
  }

  const gb = (n) => (n / 1073741824).toFixed(1);
  function draw() {
    const root = s.root; if (!root) return;
    const { el, t } = ui();
    const asset = s.release?.[s.kind];
    const kinds = [
      { id: 'usb', title: t('PC from a USB drive'), detail: t('Boots a spare x86_64 PC (BIOS or UEFI) straight into Material QEMU.') },
      { id: 'rpi', title: t('Raspberry Pi'), detail: t('Raspberry Pi 4 or 5 (64-bit) from an SD card or USB drive.') },
    ];
    const armed = s.keys[0] && s.keys[1];
    const diskList = s.disks === null
      ? el('p', { class: 'muted' }, t('Looking for removable disks…'))
      : (s.disks.length
        ? el('div', { class: 'cards', role: 'radiogroup', 'aria-label': t('Removable disks') }, ...s.disks.map((d) => el('button', {
            type: 'button', class: 'card', role: 'radio', 'aria-checked': String(s.disk?.number === d.number), 'aria-pressed': String(s.disk?.number === d.number), disabled: s.busy,
            onclick: () => { s.disk = d; s.keys = [false, false]; draw(); },
          }, el('strong', {}, d.name), el('span', { class: 'muted small' }, t('Disk {n} · {bus} · {size} GB', { n: d.number, bus: d.bus, size: gb(d.size) })))))
        : el('p', { class: 'muted' }, t('No removable USB or SD disk is attached. Plug one in, then press Refresh.')));
    const tooSmall = s.disk && asset && s.disk.size < asset.size;
    const canArm = s.disk && asset && !s.busy && !s.result?.ok;
    const gate = el('section', { class: 'panel gate', 'aria-labelledby': 'flashGateTitle' },
      el('h2', { id: 'flashGateTitle' }, s.disk ? t('Erase {name} and write the image?', { name: s.disk.name }) : t('Choose a disk first')),
      s.disk ? el('p', { class: 'muted' }, t('Everything on disk {n} ({name}, {size} GB) is erased and replaced by the Material QEMU image. This cannot be undone.', { n: s.disk.number, name: s.disk.name, size: gb(s.disk.size) })) : null,
      el('div', { class: 'keys' },
        el('button', { type: 'button', class: 'key', 'aria-pressed': String(s.keys[0]), disabled: !canArm, onclick: () => { s.keys[0] = !s.keys[0]; draw(); } }, t(s.keys[0] ? 'Key {n}: turned' : 'Key {n}: turn', { n: 1 })),
        el('button', { type: 'button', class: 'key', 'aria-pressed': String(s.keys[1]), disabled: !canArm, onclick: () => { s.keys[1] = !s.keys[1]; draw(); } }, t(s.keys[1] ? 'Key {n}: turned' : 'Key {n}: turn', { n: 2 }))),
      el('label', {}, el('span', {}, armed ? t('Slide all the way to start writing') : t('Turn both keys to unlock the slider')),
        el('input', { type: 'range', min: '0', max: '100', value: '0', id: 'flashSlide', disabled: !armed || !canArm, 'aria-valuetext': t('{n} percent', { n: 0 }), oninput: onSlide })),
      el('div', { class: 'slidebar', 'aria-hidden': 'true' }, el('div', { id: 'flashSlideFill' })),
      el('p', { class: 'muted small' }, t('Windows asks for administrator approval before anything is written. Declining writes nothing.')));
    let status = null;
    if (s.progress) {
      const p = s.progress;
      const pct = p.total ? Math.floor((p.done / p.total) * 100) : 0;
      const label = { downloading: t('Downloading and checking the image'), approval: t('Waiting for administrator approval'), preparing: t('Preparing the disk'), writing: t('Writing'), verifying: t('Reading back to verify'), done: t('Done'), failed: t('failed') }[p.phase] || p.phase;
      status = el('div', { class: 'panel', 'aria-live': 'polite' }, el('strong', {}, `${label} ${p.total ? `${pct}%` : ''}`),
        el('div', { class: 'bar', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(pct) }, el('div', { style: `width:${pct}%` })));
    }
    let done = null;
    if (s.result?.ok) {
      done = el('div', { class: 'celebrate' }, el('h2', {}, t('{name} is ready', { name: s.disk?.name || '' })),
        el('p', {}, t('Written and read back: the disk matches the release image (SHA-256 {sha}).', { sha: s.result.sha256.slice(0, 16) + '…' })),
        el('p', { class: 'muted' }, s.kind === 'rpi'
          ? t('Put it in the Raspberry Pi with a network cable and power it on. After a few minutes the address and setup code are on the HDMI screen, and on your router\'s device list as material-qemu.')
          : t('Boot the PC from this drive with a network cable connected. After a few minutes the address and setup code are on its screen.')),
        el('button', { type: 'button', class: 'outline', onclick: () => { s.result = null; s.disk = null; s.keys = [false, false]; refreshDisks(); } }, t('Flash another')));
    }
    root.replaceChildren(
      el('header', {}, el('h1', {}, t('Flash a USB drive or SD card')), el('p', { class: 'muted' }, t('Turn a spare PC or a Raspberry Pi into a dedicated Material QEMU server.'))),
      el('section', {}, el('h2', {}, t('1. Device')),
        el('div', { class: 'cards' }, ...kinds.map((k) => el('button', { type: 'button', class: 'card', 'aria-pressed': String(s.kind === k.id), disabled: s.busy, onclick: () => { s.kind = k.id; s.keys = [false, false]; draw(); } },
          el('strong', {}, k.title), el('span', { class: 'muted small' }, k.detail),
          el('span', { class: s.release?.[k.id] ? 'ok' : 'bad' }, s.release?.[k.id] ? t('{tag}, {size} GB download', { tag: s.release.tag, size: gb(s.release[k.id].size) }) : (s.release ? t('Not in the latest release') : t('Checking the latest release…'))))))),
      el('section', {}, el('div', { class: 'row' }, el('h2', { class: 'grow' }, t('2. Disk')), el('button', { type: 'button', class: 'text', disabled: s.busy, onclick: refreshDisks }, t('Refresh'))),
        el('p', { class: 'muted small' }, t('Only removable USB and SD disks are listed. The disk Windows runs from is never offered.')),
        diskList, tooSmall ? el('p', { class: 'error' }, t('That disk is smaller than the image.')) : null, s.error ? el('p', { class: 'error', role: 'alert' }, s.error) : null),
      done || gate, status);
  }

  async function onSlide(e) {
    const v = Number(e.target.value);
    const fill = document.getElementById('flashSlideFill');
    fill.style.width = `${v}%`;
    e.target.setAttribute('aria-valuetext', ui().t('{n} percent', { n: v }));
    fill.parentElement.classList.toggle('moving', v > 0 && v < 100);
    if (v < 100 || s.busy) return;
    s.busy = true; s.progress = { phase: 'downloading', done: 0, total: 0 }; draw();
    const r = await ui().api.flashStart({ kind: s.kind, diskNumber: s.disk.number, gate: { keys: 2, slider: 100 } });
    s.busy = false; s.keys = [false, false];
    if (r.ok) { s.result = r; s.progress = null; draw(); }
    else { s.progress = null; draw(); ui().fail({ ...r, command: r.command || null }); }
  }

  let subscribed = false;
  function render(root) {
    s.root = root;
    if (!subscribed) { subscribed = true; ui().api.onFlash((p) => { s.progress = p; draw(); }); }
    if (s.disks === null && !s.busy) refreshDisks();
    if (!s.release) loadRelease();
    draw();
  }
  function escape() { if (!s.busy && (s.keys[0] || s.keys[1])) { s.keys = [false, false]; draw(); } }
  return { render, escape };
})();
