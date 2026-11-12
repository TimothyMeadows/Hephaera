'use strict';
const crypto = require('node:crypto');
const TASK_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,119}$/;

// Optional descriptive metadata only. Never publish an ambient task, command
// output, arbitrary file, transcript or the rest of a task's sections.
function capture(root, task, { readText, label }) {
  if (!TASK_ID.test(task || '')) return undefined;
  try {
    label(task);
    const reference = '.hephaera/.cache/tasks/' + task + '/TASK.md';
    const text = readText(root, reference, 131072);
    let fence;
    const visible = text.replace(/^\uFEFF/, '').replace(/<!--[\s\S]*?(?:-->|$)/g, '').split(/\r?\n/).filter(line => {
      const marker = /^ {0,3}(`{3,}|~{3,})/.exec(line)?.[1];
      if (marker) { if (!fence) fence = marker; else if (marker[0] === fence[0] && marker.length >= fence.length && /^ {0,3}(?:`+|~+)[ \t]*$/.test(line)) fence = undefined; return false; }
      return !fence;
    }).join('\n');
    const clean = (value, maximum) => {
      if (/\bBearer\s+\S+|\b(?:token|authorization|cookie|client[_-]?secret)\s*[:=]|https?:\/\/[^\s/]+@/i.test(value)) throw new Error('Sensitive task metadata.');
      label(value.replace(/\s+/g, ' ').trim(), Math.max(maximum,value.length));
      const plain = value.replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/<[^>]*>/g, '')
        .replace(/(`+)(.*?)\1/g,'$2').replace(/(\*\*|__)(.*?)\1/g,'$2').replace(/(^|\s)[*_]([^*_]+)[*_](?=\s|$)/g,'$1$2').replace(/\s+/g, ' ').trim();
      label(plain, Math.max(maximum, plain.length)); // Scan the full field before truncation.
      let bounded = plain;
      if (plain.length > maximum) { bounded=plain.slice(0,maximum-1);if(/[\uD800-\uDBFF]$/.test(bounded))bounded=bounded.slice(0,-1);bounded+='…'; }
      return label(bounded, maximum);
    };
    const heading = /^#[ \t]+(.+)$/m.exec(visible);
    if (!heading || /\{\{/.test(heading[1])) return undefined;
    const title = clean(heading[1].replace(/[ \t]+#+[ \t]*$/,''), 160);
    let summary;
    const sections = visible.split(/^##[ \t]+(.+)$/m);
    for (let index = 1; index < sections.length; index += 2) {
      if (!/^(?:goal|objective|objectives|summary|request)$/i.test(sections[index].replace(/[ \t]+#+[ \t]*$/,'').trim())) continue;
      const paragraph = sections[index + 1].trim().split(/\r?\n\s*\r?\n/)[0];
      if (!paragraph || /^Describe the requested observable outcome\.?$/i.test(paragraph.trim())) continue;
      try { summary = clean(paragraph.replace(/^\s*(?:[-+*]|\d+\.)\s+/gm, ''), 320); } catch { /* Omit sensitive/invalid description, retain a safe title. */ }
      break;
    }
    return { schemaVersion: 1, taskId: task, title, ...(summary ? { summary } : {}), reference, sha256: crypto.createHash('sha256').update(text).digest('hex') };
  } catch { return undefined; } // Metadata failure never changes an operation.
}
module.exports = { capture };
