'use strict';
const $ = (s) => document.querySelector(s);
let lang = 'en';
try { lang = localStorage.getItem('mq-host-lang') || 'en'; } catch {}
const say = (en, yue) => (lang === 'yue' ? yue : lang === 'both' ? `${en} · ${yue}` : en);
const labels = {
  running: ['Running', '運行中'], starting: ['Starting…', '啟動中…'], stopping: ['Stopping…', '停止中…'], stopped: ['Stopped', '已停止'], error: ['Needs attention', '需要處理'],
};
let current = null;

function applyLanguage() {
  document.documentElement.lang = lang === 'yue' ? 'yue-Hant-HK' : 'en';
  for (const el of document.querySelectorAll('[data-t]')) {
    const [en, yue] = el.dataset.t.split('|');
    el.textContent = say(en, yue);
  }
  $('#lang').value = lang;
  if (current) draw(current);
}

function draw(s) {
  current = s;
  const [en, yue] = labels[s.status] || labels.stopped;
  $('#state').dataset.status = s.status;
  $('#state-text').textContent = say(en, yue);
  $('#url').textContent = s.url || say('Not running', '未運行');
  $('#error').hidden = !s.error;
  $('#error').textContent = s.error || '';
  const running = s.status === 'running' || s.status === 'starting';
  $('#toggle').textContent = running ? say('Stop', '停止') : say('Start', '啟動');
  $('#toggle').disabled = s.status === 'stopping' || s.status === 'starting';
  $('#open').disabled = s.status !== 'running';
  $('#copy').disabled = !s.url;
  $('#qemu').textContent = s.qemu ? say('Installed', '已安裝') : say('Not found', '找不到');
  $('#qemu').title = s.qemu || '';
  $('#install-qemu').hidden = Boolean(s.qemu);
  $('#data').textContent = s.dataDir;
  $('#port').textContent = s.port ? String(s.port) : '—';
  $('#login').checked = Boolean(s.openAtLogin);
  $('#version').textContent = s.version || '';
}
function drawLog(lines) {
  const pre = $('#log');
  const atEnd = pre.scrollTop + pre.clientHeight >= pre.scrollHeight - 4;
  pre.textContent = lines.join('\n');
  if (atEnd) pre.scrollTop = pre.scrollHeight;
}

$('#lang').addEventListener('change', (e) => { lang = e.target.value; try { localStorage.setItem('mq-host-lang', lang); } catch {} applyLanguage(); });
$('#open').addEventListener('click', () => window.host.open());
$('#copy').addEventListener('click', async () => {
  if (await window.host.copy()) { const b = $('#copy'); b.textContent = say('Copied', '已複製'); setTimeout(applyLanguage, 1500); }
});
$('#toggle').addEventListener('click', async () => {
  const running = current && (current.status === 'running' || current.status === 'starting');
  draw(await (running ? window.host.stop() : window.host.start()));
});
$('#open-data').addEventListener('click', () => window.host.openData());
$('#install-qemu').addEventListener('click', async (e) => {
  e.target.disabled = true;
  e.target.textContent = say('Waiting for Windows approval…', '等待 Windows 批准…');
  draw(await window.host.installQemu());
  e.target.disabled = false;
  applyLanguage();
});
$('#login').addEventListener('change', async (e) => draw(await window.host.setLogin(e.target.checked)));
window.host.onState(draw);
window.host.onLog(drawLog);
(async () => { draw(await window.host.snapshot()); drawLog(await window.host.log()); applyLanguage(); })();
