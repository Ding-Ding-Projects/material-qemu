'use strict';
const $ = (s) => document.querySelector(s);
let lang = 'en';
try { lang = localStorage.getItem('mq-build-lang') || 'en'; } catch {}
const say = (en, yue) => (lang === 'yue' ? yue : lang === 'both' ? `${en} · ${yue}` : en);
const names = { build: ['Build', '建置'], run: ['Build and run', '建置並執行'], installer: ['Build installer', '建置安裝程式'] };
let current = null;
let tick = null;

function applyLanguage() {
  document.documentElement.lang = lang === 'yue' ? 'yue-Hant-HK' : 'en';
  for (const el of document.querySelectorAll('[data-t]')) { const [en, yue] = el.dataset.t.split('|'); el.textContent = say(en, yue); }
  $('#lang').value = lang;
  if (current) draw(current);
}
function draw(s) {
  current = s;
  $('#commit').textContent = String(s.commit).slice(0, 12);
  $('#where').textContent = say(`Builds in ${s.sourceDir}`, `建置位置：${s.sourceDir}`);
  const busy = Boolean(s.job);
  for (const b of document.querySelectorAll('[data-action]')) { b.disabled = busy; b.setAttribute('aria-pressed', String(busy && s.job.action === b.dataset.action)); }
  $('#stop').disabled = !busy;
  clearInterval(tick);
  if (busy) {
    const [en, yue] = names[s.job.action];
    const started = Date.parse(s.job.startedAt);
    const update = () => { const sec = Math.round((Date.now() - started) / 1000); $('#status').textContent = say(`${en} running · ${sec} s`, `${yue}進行中 · ${sec} 秒`); };
    update();
    tick = setInterval(update, 1000);
    $('#bar').className = 'running';
  } else if (s.last) {
    const [en, yue] = names[s.last.action];
    $('#status').textContent = s.last.stopped ? say(`${en} stopped`, `${yue}已停止`)
      : s.last.ok ? say(`${en} succeeded in ${s.last.seconds} s`, `${yue}成功，用時 ${s.last.seconds} 秒`)
      : say(`${en} failed${s.last.code != null ? ` (exit code ${s.last.code})` : ''}${s.last.message ? `: ${s.last.message}` : ''}`, `${yue}失敗${s.last.code != null ? `（結束代碼 ${s.last.code}）` : ''}${s.last.message ? `：${s.last.message}` : ''}`);
    $('#bar').className = s.last.ok ? 'done' : 'failed';
  } else {
    $('#status').textContent = say('Choose an action.', '請選擇操作。');
    $('#bar').className = '';
  }
}
function drawLog(lines) {
  const pre = $('#log');
  const atEnd = pre.scrollTop + pre.clientHeight >= pre.scrollHeight - 4;
  pre.textContent = lines.join('\n');
  if (atEnd) pre.scrollTop = pre.scrollHeight;
}
for (const b of document.querySelectorAll('[data-action]')) b.addEventListener('click', async () => draw(await window.builder.run(b.dataset.action)));
$('#stop').addEventListener('click', async () => draw(await window.builder.stop()));
$('#open-source').addEventListener('click', () => window.builder.openSource());
$('#open-installer').addEventListener('click', () => window.builder.openInstaller());
$('#lang').addEventListener('change', (e) => { lang = e.target.value; try { localStorage.setItem('mq-build-lang', lang); } catch {} applyLanguage(); });
window.builder.onState(draw);
window.builder.onLog(drawLog);
(async () => { draw(await window.builder.snapshot()); drawLog(await window.builder.log()); applyLanguage(); })();
