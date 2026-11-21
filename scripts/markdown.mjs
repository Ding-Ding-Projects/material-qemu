// A small Markdown renderer for the documentation site: headings with ids,
// paragraphs, nested lists, fenced code, tables, block quotes, rules, links,
// images, bold, italic and inline code. Raw HTML is escaped, never passed through.
const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export function slugify(text) {
  return String(text).toLowerCase().replace(/<[^>]+>/g, "").replace(/[`*_]/g, "").replace(/[^\p{L}\p{N}\s-]/gu, "").trim().replace(/\s+/g, "-");
}

export function inline(text, link = (href) => href) {
  const codes = [];
  let s = String(text).replace(/`([^`]+)`/g, (_, code) => `\u0000${codes.push(code) - 1}\u0000`);
  s = escapeHtml(s);
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+&quot;([^&]*)&quot;)?\)/g, (_, alt, href) => `<img src="${escapeHtml(link(href, true))}" alt="${alt}" loading="lazy">`);
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, href) => {
    const target = link(href, false);
    const external = /^https?:/.test(target);
    return `<a href="${escapeHtml(target)}"${external ? ' rel="noopener"' : ""}>${label}</a>`;
  });
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(/(^|[^\w*])\*([^*\s][^*]*)\*(?!\w)/g, "$1<em>$2</em>").replace(/(^|\W)_([^_\s][^_]*)_(?!\w)/g, "$1<em>$2</em>");
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${escapeHtml(codes[Number(i)])}</code>`);
}

export function renderMarkdown(source, { link } = {}) {
  const lines = String(source).replace(/\r\n/g, "\n").split("\n");
  const out = [];
  const headings = [];
  const used = new Map();
  let i = 0;
  const para = [];
  const flush = () => { if (para.length) { out.push(`<p>${inline(para.join(" "), link)}</p>`); para.length = 0; } };
  const isTableRow = (l) => /^\s*\|.*\|\s*$/.test(l);
  const cells = (l) => l.trim().replace(/^\||\|$/g, "").split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, "|"));
  function list(start) {
    const base = lines[start].match(/^(\s*)/)[1].length;
    const ordered = /^\s*\d+[.)]\s/.test(lines[start]);
    const items = [];
    let j = start;
    while (j < lines.length) {
      const l = lines[j];
      const m = l.match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/);
      if (m && m[1].length === base) { items.push({ text: [m[3]], children: "" }); j++; continue; }
      if (m && m[1].length > base) { const [html, next] = list(j); items[items.length - 1].children += html; j = next; continue; }
      if (l.trim() === "") {
        const k = lines.slice(j + 1).findIndex((x) => x.trim() !== "");
        const nextLine = k < 0 ? null : lines[j + 1 + k];
        if (nextLine && nextLine.match(/^(\s*)/)[1].length > base && items.length) { j += 1 + k; continue; }
        if (nextLine && new RegExp(`^\\s{${base}}([-*+]|\\d+[.)])\\s`).test(nextLine) && nextLine.match(/^(\s*)/)[1].length === base) { j += 1 + k; continue; }
        break;
      }
      if (l.match(/^(\s*)/)[1].length > base && items.length) {
        const t = l.trim();
        if (/^!\[/.test(t)) items[items.length - 1].children += `<p>${inline(t, link)}</p>`;
        else items[items.length - 1].text.push(t);
        j++;
        continue;
      }
      break;
    }
    const tag = ordered ? "ol" : "ul";
    return [`<${tag}>${items.map((it) => `<li>${inline(it.text.join(" "), link)}${it.children}</li>`).join("")}</${tag}>`, j];
  }
  while (i < lines.length) {
    const line = lines[i];
    if (/^```/.test(line)) {
      flush();
      const lang = line.slice(3).trim();
      const body = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) body.push(lines[i++]);
      i++;
      out.push(`<pre><code${lang ? ` class="language-${escapeHtml(lang)}"` : ""}>${escapeHtml(body.join("\n"))}</code></pre>`);
      continue;
    }
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      flush();
      const level = h[1].length;
      let id = slugify(h[2]) || `section-${headings.length + 1}`;
      const n = used.get(id) || 0;
      used.set(id, n + 1);
      if (n) id = `${id}-${n}`;
      headings.push({ level, id, text: h[2].replace(/[`*_]/g, "") });
      out.push(`<h${level} id="${id}">${inline(h[2], link)}</h${level}>`);
      i++;
      continue;
    }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) { flush(); out.push("<hr>"); i++; continue; }
    if (/^\s*>/.test(line)) {
      flush();
      const body = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) body.push(lines[i++].replace(/^\s*>\s?/, ""));
      out.push(`<blockquote>${renderMarkdown(body.join("\n"), { link }).html}</blockquote>`);
      continue;
    }
    if (isTableRow(line) && i + 1 < lines.length && /^\s*\|?\s*:?-{3,}/.test(lines[i + 1])) {
      flush();
      const head = cells(line);
      i += 2;
      const rows = [];
      while (i < lines.length && isTableRow(lines[i])) rows.push(cells(lines[i++]));
      out.push(`<div class="table"><table><thead><tr>${head.map((c) => `<th>${inline(c, link)}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${inline(c, link)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`);
      continue;
    }
    if (/^\s*([-*+]|\d+[.)])\s+/.test(line)) { flush(); const [html, next] = list(i); out.push(html); i = next; continue; }
    if (line.trim() === "") { flush(); i++; continue; }
    para.push(line.trim());
    i++;
  }
  flush();
  return { html: out.join("\n"), headings };
}

export function plainText(source) {
  return String(source).replace(/```[\s\S]*?```/g, " ").replace(/!\[[^\]]*\]\([^)]*\)/g, " ").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/[#>*_`|-]/g, " ").replace(/\s+/g, " ").trim();
}
