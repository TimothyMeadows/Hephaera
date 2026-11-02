(() => {
  'use strict';
  const base = document.currentScript?.dataset.base || '/';
  const openButton = document.querySelector('.search-open');
  const dialog = document.querySelector('.search-dialog');
  const input = document.querySelector('#search-input');
  const status = document.querySelector('#search-status');
  const results = document.querySelector('#search-results');
  let indexPromise;
  let searchVersion = 0;
  const sidebar = document.querySelector('.docs-sidebar details');
  if (sidebar) {
    const mobile = window.matchMedia('(max-width: 760px)');
    sidebar.open = !mobile.matches;
    mobile.addEventListener('change', () => { sidebar.open = !mobile.matches; });
  }

  async function search() {
    const version = ++searchVersion;
    const terms = input.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    results.replaceChildren();
    if (!terms.length) { status.textContent = 'Type a few words to find a guide.'; return; }
    status.textContent = 'Looking through the guides…';
    try {
      indexPromise ||= fetch(`${base}search-index.json`, { credentials: 'same-origin' }).then(response => {
        if (!response.ok) throw new Error('Search index unavailable');
        return response.json();
      });
      const index = await indexPromise;
      if (version !== searchVersion) return;
      const found = index.filter(page => terms.every(term => `${page.title} ${page.summary} ${page.text}`.toLowerCase().includes(term)))
        .sort((a, b) => terms.reduce((score, term) => score + (b.title.toLowerCase().includes(term) ? 1 : 0) - (a.title.toLowerCase().includes(term) ? 1 : 0), 0)).slice(0, 8);
      for (const page of found) {
        const url = new URL(page.url, location.origin);
        if (url.origin !== location.origin || !url.pathname.startsWith(base)) continue;
        const li = document.createElement('li');
        const anchor = document.createElement('a');
        const title = document.createElement('strong');
        const summary = document.createElement('span');
        anchor.href = url.pathname;
        title.textContent = page.title;
        summary.textContent = page.summary;
        anchor.append(title, summary);
        li.append(anchor);
        results.append(li);
      }
      status.textContent = results.childElementCount ? `${results.childElementCount} guide${results.childElementCount === 1 ? '' : 's'} found.` : 'No guide found. Try fewer words, or use the reference wiki below.';
    } catch {
      indexPromise = undefined;
      if (version === searchVersion) status.textContent = 'Search is unavailable right now. You can still browse the guides or use the reference wiki.';
    }
  }

  if (openButton && dialog && typeof dialog.showModal === 'function') {
    openButton.hidden = false;
    const open = () => { if (!dialog.open) { dialog.showModal(); input.focus(); } };
    openButton.addEventListener('click', open);
    input.addEventListener('input', search);
    document.addEventListener('keydown', event => {
      if (event.key === '/' && !event.ctrlKey && !event.metaKey && !event.altKey && !event.target.closest('input, textarea, [contenteditable="true"]')) { event.preventDefault(); open(); }
    });
    dialog.addEventListener('close', () => openButton.focus());
    dialog.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); dialog.close(); }
    }, { capture: true });
    dialog.addEventListener('click', event => { if (event.target === dialog && (event.clientX < dialog.getBoundingClientRect().left || event.clientX > dialog.getBoundingClientRect().right || event.clientY < dialog.getBoundingClientRect().top || event.clientY > dialog.getBoundingClientRect().bottom)) dialog.close(); });
  }

  const copyStatus = document.createElement('span');
  copyStatus.className = 'copy-status';
  copyStatus.setAttribute('role', 'status');
  copyStatus.setAttribute('aria-live', 'polite');
  document.body.append(copyStatus);
  for (const pre of document.querySelectorAll('pre')) {
    const code = pre.querySelector('code');
    if (!code) continue;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'copy-code';
    button.textContent = 'Copy';
    button.setAttribute('aria-label', 'Copy this code block');
    pre.style.position = 'relative';
    pre.append(button);
    button.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(code.textContent);
        button.textContent = 'Copied';
        copyStatus.textContent = 'Code copied to clipboard.';
      } catch {
        const range = document.createRange();
        range.selectNodeContents(code);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        button.textContent = 'Code selected';
        copyStatus.textContent = 'Clipboard access is unavailable. The code is selected so you can copy it manually.';
      }
    });
  }
})();
