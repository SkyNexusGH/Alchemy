/* ==========================================================================
   OVYRA — Renderer Logic
   ========================================================================== */

(() => {
  'use strict';

  const $  = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const el = (tag, props = {}, ...kids) => {
    const node = Object.assign(document.createElement(tag), props);
    kids.flat().forEach(k => node.append(k?.nodeType ? k : document.createTextNode(k)));
    return node;
  };
  const ovyra = window.ovyra;

  // ==========================================================================
  // SETTINGS / PREFERENCES
  // ==========================================================================

  const THEMES = [
    { id: 'default',  label: 'Default',  swatch: 'linear-gradient(135deg,#10182B 40%,#ED4872)' },
    { id: 'midnight', label: 'Midnight', swatch: 'linear-gradient(135deg,#0c1224 40%,#5dd2ff)' },
    { id: 'forest',   label: 'Forest',   swatch: 'linear-gradient(135deg,#0d1a14 40%,#7ce5b9)' },
    { id: 'crimson',  label: 'Crimson',  swatch: 'linear-gradient(135deg,#1a0d12 40%,#ff7a8a)' },
    { id: 'violet',   label: 'Violet',   swatch: 'linear-gradient(135deg,#120c1f 40%,#c89bff)' },
    { id: 'mono',     label: 'Mono',     swatch: 'linear-gradient(135deg,#0e0e10 40%,#ffffff)' }
  ];

  const SEARCH_ENGINES = [
    { id: 'ddg',    name: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=%s' },
    { id: 'google', name: 'Google',     url: 'https://www.google.com/search?q=%s' },
    { id: 'brave',  name: 'Brave',      url: 'https://search.brave.com/search?q=%s' },
    { id: 'bing',   name: 'Bing',       url: 'https://www.bing.com/search?q=%s' },
    { id: 'kagi',   name: 'Kagi',       url: 'https://kagi.com/search?q=%s' },
    { id: 'startpage', name: 'Startpage', url: 'https://www.startpage.com/do/search?q=%s' }
  ];

  const LOGOS = [
    { id: 'default', name: 'Logo',   file: 'Logo.png' },
    { id: 'simple',  name: 'Simple', file: 'Ovyra Simple.png' }
  ];

  const APP_CATALOG = [
    { id: 'whatsapp',  name: 'WhatsApp',  url: 'https://web.whatsapp.com/' },
    { id: 'instagram', name: 'Instagram', url: 'https://www.instagram.com/' },
    { id: 'facebook',  name: 'Facebook',  url: 'https://www.facebook.com/' },
    { id: 'messenger', name: 'Messenger', url: 'https://www.messenger.com/' },
    { id: 'snapchat',  name: 'Snapchat',  url: 'https://web.snapchat.com/' },
    { id: 'discord',   name: 'Discord',   url: 'https://discord.com/app' },
    { id: 'telegram',  name: 'Telegram',  url: 'https://web.telegram.org/' },
    { id: 'twitter',   name: 'X',         url: 'https://x.com/' },
    { id: 'reddit',    name: 'Reddit',    url: 'https://www.reddit.com/' },
    { id: 'chatgpt',   name: 'ChatGPT',   url: 'https://chat.openai.com/' },
    { id: 'gmail',     name: 'Gmail',     url: 'https://mail.google.com/' },
    { id: 'outlook',   name: 'Outlook',   url: 'https://outlook.office.com/' }
  ];

  const ECHO_SOURCES = [
    { id: 'builtin',     name: 'Ovyra',        url: null },
    { id: 'spotify',     name: 'Spotify',      url: 'https://open.spotify.com/' },
    { id: 'apple',       name: 'Apple Music',  url: 'https://music.apple.com/' },
    { id: 'ytmusic',     name: 'YouTube Music',url: 'https://music.youtube.com/' },
    { id: 'soundcloud',  name: 'SoundCloud',   url: 'https://soundcloud.com/discover' }
  ];

  const settings = loadSettings();

  function loadSettings() {
    const raw = localStorage.getItem('ovyra:settings');
    let s = {};
    try { s = raw ? JSON.parse(raw) : {}; } catch {}
    return Object.assign({
      welcomed: false,
      theme: 'default',
      searchEngine: 'ddg',
      logo: 'default',
      apps: [],          // enabled app ids
      echoSource: 'builtin'
    }, s);
  }
  function saveSettings() {
    try { localStorage.setItem('ovyra:settings', JSON.stringify(settings)); } catch {}
  }

  function applyTheme(id) {
    settings.theme = id;
    if (id === 'default') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', id);
    saveSettings();
  }
  function applyLogo(id) {
    settings.logo = id;
    const file = (LOGOS.find(l => l.id === id) || LOGOS[0]).file;
    const enc = file.includes(' ') ? file.replace(/ /g, '%20') : file;
    const brand = $('#brandLogo'); if (brand) brand.src = enc;
    const welc = $('#welcomeLogo'); if (welc) welc.src = enc;
    saveSettings();
  }
  function searchUrl(q) {
    const se = SEARCH_ENGINES.find(e => e.id === settings.searchEngine) || SEARCH_ENGINES[0];
    return se.url.replace('%s', encodeURIComponent(q));
  }

  // ==========================================================================
  // STATE
  // ==========================================================================

  const state = {
    tabs: [], activeTabId: null, secondaryTabId: null, splitMode: false,
    workspaces: [{ name: 'Personal', color: '#7aa6ff', tabIds: [] }],
    activeWs: 0,
    groups: [],         // [{ id, name, color, collapsed }]
    blockLog: [],
    sleepAuto: true,
    soundCtx: null, soundNode: null,
    activeApp: null
  };
  const getTab   = id => state.tabs.find(t => t.id === id);
  const getGroup = id => state.groups.find(g => g.id === id);
  const wsTabList = () => state.workspaces[state.activeWs].tabIds.map(getTab).filter(Boolean);

  // ==========================================================================
  // TAB GROUPS ("islands")
  // ==========================================================================

  const GROUP_COLORS = ['#7aa6ff', '#7ce5b9', '#febc2e', '#a78bfa', '#f87171', '#5dd2ff', '#ED4872', '#ff7a8a'];

  function createGroup(name = 'Group', color) {
    const id = 'g_' + Math.random().toString(36).slice(2, 8);
    const g = {
      id, name,
      color: color || GROUP_COLORS[state.groups.length % GROUP_COLORS.length],
      collapsed: false
    };
    state.groups.push(g);
    return g;
  }
  function deleteGroup(id) {
    state.tabs.forEach(t => { if (t.groupId === id) t.groupId = null; });
    state.groups = state.groups.filter(g => g.id !== id);
  }
  /**
   * Move a tab into a group. To keep islands visually contiguous, also
   * reorder the tab so it sits next to the other tabs in that group within
   * its workspace's tabIds list.
   */
  function addTabToGroup(tabId, groupId) {
    const t = getTab(tabId); if (!t) return;
    t.groupId = groupId;

    const ws = state.workspaces[state.activeWs];
    if (!ws.tabIds.includes(tabId)) return;
    // Find the last position of any tab already in this group
    const lastIdx = ws.tabIds
      .map((id, i) => ({ id, i, t: getTab(id) }))
      .filter(x => x.t?.groupId === groupId && x.id !== tabId)
      .map(x => x.i)
      .pop();
    if (lastIdx !== undefined) {
      ws.tabIds = ws.tabIds.filter(x => x !== tabId);
      ws.tabIds.splice(lastIdx + 1, 0, tabId);
    }
  }
  function removeTabFromGroup(tabId) {
    const t = getTab(tabId); if (!t) return;
    t.groupId = null;
  }

  // ==========================================================================
  // URL HELPERS
  // ==========================================================================

  const normalizeUrl = (raw) => {
    const q = (raw || '').trim();
    if (!q) return null;
    if (/^[a-z]+:\/\//i.test(q)) return q;
    if (/^[^\s]+\.[a-z]{2,}(\/.*)?$/i.test(q)) return 'https://' + q;
    return searchUrl(q);
  };
  const prettyHost = (url) => {
    try {
      if (!url) return '';
      if (url.startsWith('file://')) return 'Ovyra · Start';
      const u = new URL(url); return u.hostname.replace(/^www\./, '');
    } catch { return url; }
  };
  const toast = (text) => {
    const t = el('div', { className: 'toast', textContent: text });
    $('#toastWrap').append(t);
    setTimeout(() => t.remove(), 2900);
  };

  // ==========================================================================
  // VIEWPORT BOUNDS (tabs + app panel)
  // ==========================================================================

  const boundsEls = {
    primary:   $('[data-bounds="primary"]'),
    secondary: $('[data-bounds="secondary"]')
  };
  const appBoundsEl  = $('[data-app-bounds]');
  const echoBoundsEl = $('[data-echo-bounds]');

  function pushBounds(pane) {
    const node = boundsEls[pane];
    if (!node || !node.offsetParent) return;
    const r = node.getBoundingClientRect();
    ovyra.viewportBounds(pane, { x: r.x, y: r.y, width: r.width, height: r.height });
  }
  function pushAllBounds() {
    pushBounds('primary');
    if (state.splitMode) pushBounds('secondary');
    if (state.activeApp) {
      const node = state.activeApp.type === 'echo' ? echoBoundsEl : appBoundsEl;
      if (node && node.offsetParent) {
        const r = node.getBoundingClientRect();
        ovyra.appBounds(state.activeApp.id, { x: r.x, y: r.y, width: r.width, height: r.height });
      }
    }
  }
  const ro = new ResizeObserver(() => pushAllBounds());
  ro.observe(boundsEls.primary);
  ro.observe(boundsEls.secondary);
  if (appBoundsEl)  ro.observe(appBoundsEl);
  if (echoBoundsEl) ro.observe(echoBoundsEl);
  window.addEventListener('resize', pushAllBounds);

  // ==========================================================================
  // TABS
  // ==========================================================================

  // Build the start-page URL with the user's chosen search engine encoded as
  // a query param. The start page lives in its own Chromium WebContentsView
  // with a separate file:// origin, so it can't read this renderer's
  // localStorage — the URL query is how we pass the setting in.
  function startUrl() {
    const base = location.href.replace(/[/\\][^/\\]*$/, '/start.html');
    return base + '?engine=' + encodeURIComponent(settings.searchEngine);
  }

  async function newTab(url = null, { activate = true, ws = state.activeWs } = {}) {
    const target = url || startUrl();
    const { id } = await ovyra.tabCreate(target);
    const tab = {
      id, title: 'New Tab', url: url || 'ovyra://start',
      sleeping: false, lastActive: Date.now(),
      canBack: false, canFwd: false, loading: true, favicon: null
    };
    state.tabs.push(tab);
    state.workspaces[ws].tabIds.push(id);
    if (activate) await activateTab(id);
    renderTabs();
    return tab;
  }
  async function closeTab(id) {
    const idx = state.tabs.findIndex(t => t.id === id);
    if (idx < 0) return;
    await ovyra.tabClose(id);
    state.tabs.splice(idx, 1);
    state.workspaces.forEach(w => { w.tabIds = w.tabIds.filter(x => x !== id); });
    if (state.activeTabId === id) {
      const wsTabs = wsTabList();
      const next = wsTabs[Math.min(idx, wsTabs.length - 1)];
      if (next) await activateTab(next.id);
      else { state.activeTabId = null; await newTab(); }
    }
    if (state.secondaryTabId === id) {
      state.secondaryTabId = null;
      if (state.splitMode) toggleSplit(false);
    }
    renderTabs();
  }
  async function activateTab(id, pane = 'primary') {
    const tab = getTab(id); if (!tab) return;
    if (pane === 'primary') state.activeTabId = id;
    else state.secondaryTabId = id;
    tab.lastActive = Date.now();
    await ovyra.tabShow(id, pane);
    pushBounds(pane);
    syncAddressBar();
    renderTabs();
  }

  // ==========================================================================
  // RENDERING
  // ==========================================================================

  function renderTabs() {
    const root = $('#tabs');
    root.innerHTML = '';
    let lastGroupId = undefined;

    wsTabList().forEach(t => {
      // Insert the group label whenever we transition into a new group
      if (t.groupId !== lastGroupId) {
        if (t.groupId) {
          const g = getGroup(t.groupId);
          if (g) root.append(buildGroupLabel(g));
        }
        lastGroupId = t.groupId;
      }
      // Skip the tab if its group is collapsed (label still visible)
      if (t.groupId) {
        const g = getGroup(t.groupId);
        if (g?.collapsed) return;
      }
      root.append(buildTab(t));
    });
  }

  function buildTab(t) {
    const isActive = t.id === state.activeTabId;
    const g = t.groupId ? getGroup(t.groupId) : null;
    const node = el('div', {
      className: 'tab' +
        (isActive ? ' active' : '') +
        (t.sleeping ? ' sleeping' : '') +
        (t.loading ? ' loading' : '') +
        (g ? ' in-group' : ''),
      title: (t.title || prettyHost(t.url)) + (t.sleeping ? ' · sleeping' : '')
    });
    if (g) node.style.setProperty('--g-color', g.color);

    const fav = el('span', { className: 'fav' });
    if (t.favicon) {
      const img = new Image();
      img.src = t.favicon;
      img.onerror = () => { fav.textContent = (prettyHost(t.url) || 'O').charAt(0).toUpperCase(); };
      fav.append(img);
    } else {
      fav.textContent = (prettyHost(t.url) || 'O').charAt(0).toUpperCase();
    }
    node.append(
      fav,
      el('span', { className: 'ttl', textContent: t.title || prettyHost(t.url) || 'New Tab' }),
      el('button', { className: 'x', textContent: '×', onclick: e => { e.stopPropagation(); closeTab(t.id); } })
    );
    node.addEventListener('click', () => activateTab(t.id, 'primary'));
    node.addEventListener('contextmenu', e => showTabMenu(e, t));
    node.addEventListener('auxclick', e => { if (e.button === 1) closeTab(t.id); });
    return node;
  }

  function buildGroupLabel(g) {
    const tabsInGroup = state.tabs.filter(t => t.groupId === g.id).length;
    const label = el('button', {
      className: 'tab-group-label' + (g.collapsed ? ' collapsed' : ''),
      title: `${g.name} (${tabsInGroup}) · click to ${g.collapsed ? 'expand' : 'collapse'} · right-click for options`
    });
    label.style.setProperty('--g-color', g.color);
    label.append(
      el('span', { className: 'tg-dot' }),
      el('span', { className: 'tg-name', textContent: g.name }),
      g.collapsed ? el('span', { className: 'tg-count', textContent: String(tabsInGroup) }) : ''
    );
    label.addEventListener('click', () => { g.collapsed = !g.collapsed; renderTabs(); });
    label.addEventListener('contextmenu', e => showGroupMenu(e, g));
    return label;
  }

  // ==========================================================================
  // CONTEXT MENU
  // ==========================================================================

  function showContextMenu(items, x, y) {
    closeContextMenu();
    const menu = el('div', { className: 'ctx-menu' });
    items.forEach(item => {
      if (item.separator) {
        menu.append(el('div', { className: 'ctx-sep' }));
        return;
      }
      const btn = el('button', {
        className: 'ctx-item' + (item.disabled ? ' disabled' : '')
      });
      if (item.color) {
        btn.append(el('span', { className: 'ctx-dot', style: `background:${item.color}` }));
      }
      btn.append(item.label);
      btn.addEventListener('click', () => {
        if (!item.disabled) { try { item.onClick?.(); } finally { closeContextMenu(); } }
      });
      menu.append(btn);
    });
    document.body.append(menu);

    // Place inside viewport
    menu.style.left = x + 'px'; menu.style.top = y + 'px';
    const r = menu.getBoundingClientRect();
    if (r.right > innerWidth)  menu.style.left = Math.max(4, innerWidth  - r.width - 8) + 'px';
    if (r.bottom > innerHeight) menu.style.top  = Math.max(4, innerHeight - r.height - 8) + 'px';

    // Dismiss on outside interaction
    setTimeout(() => {
      document.addEventListener('mousedown', closeContextMenu, { once: true });
      document.addEventListener('contextmenu', closeContextMenu, { once: true });
      window.addEventListener('blur', closeContextMenu, { once: true });
    }, 0);
  }
  function closeContextMenu() {
    document.querySelector('.ctx-menu')?.remove();
  }

  function showTabMenu(e, tab) {
    e.preventDefault();
    const items = [];
    items.push({ label: 'Open in split view', onClick: async () => {
      if (!state.splitMode) await toggleSplit(true);
      await activateTab(tab.id, 'secondary');
    }});
    items.push({ label: tab.sleeping ? 'Wake tab' : 'Sleep tab', onClick: () => {
      if (tab.sleeping) ovyra.tabWake(tab.id);
      else ovyra.tabSleep(tab.id);
    }});
    items.push({ separator: true });

    items.push({ label: '＋ New tab group', onClick: () => {
      const g = createGroup();
      addTabToGroup(tab.id, g.id);
      renderTabs();
    }});

    const otherGroups = state.groups.filter(g => g.id !== tab.groupId);
    if (otherGroups.length) {
      otherGroups.forEach(g => {
        items.push({
          label: 'Add to ' + g.name,
          color: g.color,
          onClick: () => { addTabToGroup(tab.id, g.id); renderTabs(); }
        });
      });
    }
    if (tab.groupId) {
      items.push({ label: 'Remove from group', onClick: () => {
        removeTabFromGroup(tab.id); renderTabs();
      }});
    }

    items.push({ separator: true });
    items.push({ label: 'Close tab', onClick: () => closeTab(tab.id) });
    items.push({ label: 'Close other tabs', onClick: () => {
      const others = wsTabList().filter(t => t.id !== tab.id).map(t => t.id);
      others.forEach(id => closeTab(id));
    }});

    showContextMenu(items, e.clientX, e.clientY);
  }

  function showGroupMenu(e, group) {
    e.preventDefault();
    const items = [];
    items.push({ label: group.collapsed ? 'Expand' : 'Collapse', onClick: () => {
      group.collapsed = !group.collapsed; renderTabs();
    }});
    items.push({ label: 'Rename…', onClick: () => {
      const name = prompt('Group name:', group.name);
      if (name && name.trim()) { group.name = name.trim().slice(0, 30); renderTabs(); }
    }});
    items.push({ separator: true });
    GROUP_COLORS.forEach(c => {
      if (c === group.color) return;
      items.push({ label: 'Color', color: c, onClick: () => { group.color = c; renderTabs(); } });
    });
    items.push({ separator: true });
    items.push({ label: 'Ungroup', onClick: () => {
      state.tabs.forEach(t => { if (t.groupId === group.id) t.groupId = null; });
      deleteGroup(group.id); renderTabs();
    }});
    items.push({ label: 'Close group', onClick: () => {
      const ids = state.tabs.filter(t => t.groupId === group.id).map(t => t.id);
      if (confirm(`Close "${group.name}" and its ${ids.length} tab${ids.length === 1 ? '' : 's'}?`)) {
        ids.forEach(id => closeTab(id));
        deleteGroup(group.id); renderTabs();
      }
    }});
    showContextMenu(items, e.clientX, e.clientY);
  }

  function renderWorkspaces() {
    const rail = $('#workspaceRail');
    [...rail.querySelectorAll('.ws-btn:not(.ws-add)')].forEach(b => b.remove());
    state.workspaces.forEach((w, i) => {
      const btn = el('button', {
        className: 'ws-btn' + (i === state.activeWs ? ' active' : ''),
        title: w.name + ' · right-click to delete',
        textContent: w.name.charAt(0).toUpperCase()
      });
      btn.style.setProperty('--ws-color', w.color);
      btn.addEventListener('click', () => switchWorkspace(i));
      btn.addEventListener('contextmenu', (e) => { e.preventDefault(); deleteWorkspace(i); });
      rail.insertBefore(btn, $('#addWorkspace'));
    });
  }
  async function switchWorkspace(i) {
    state.activeWs = i;
    const wsTabs = wsTabList();
    if (wsTabs.length === 0) await newTab(); else await activateTab(wsTabs[0].id);
    renderWorkspaces(); renderTabs();
    toast(`Switched to "${state.workspaces[i].name}"`);
  }
  async function deleteWorkspace(i) {
    if (state.workspaces.length <= 1) { toast("Can't delete the only workspace"); return; }
    const w = state.workspaces[i];
    if (!confirm(`Delete "${w.name}" and close its ${w.tabIds.length} tab${w.tabIds.length === 1 ? '' : 's'}?`)) return;
    for (const id of [...w.tabIds]) {
      try { await ovyra.tabClose(id); } catch {}
      const idx = state.tabs.findIndex(t => t.id === id);
      if (idx >= 0) state.tabs.splice(idx, 1);
      if (state.activeTabId === id) state.activeTabId = null;
      if (state.secondaryTabId === id) state.secondaryTabId = null;
    }
    state.workspaces.splice(i, 1);
    if (state.activeWs === i) state.activeWs = Math.max(0, i - 1);
    else if (state.activeWs > i) state.activeWs--;
    renderWorkspaces();
    const remaining = wsTabList();
    if (remaining.length === 0) await newTab(); else await activateTab(remaining[0].id);
    toast(`Workspace "${w.name}" deleted`);
  }

  // ==========================================================================
  // ADDRESS BAR / NAV
  // ==========================================================================

  const addrInput = $('#addrInput');
  async function navigateTo(raw, pane = 'primary') {
    const url = normalizeUrl(raw); if (!url) return;
    const tabId = pane === 'primary' ? state.activeTabId : state.secondaryTabId;
    if (!tabId) return;
    setLoading(pane, true);
    await ovyra.tabNavigate(tabId, url);
  }
  function setLoading(pane, on) {
    const node = document.querySelector(`[data-loading="${pane}"]`);
    if (node) node.hidden = !on;
  }
  function syncAddressBar() {
    const t = getTab(state.activeTabId);
    if (!t) { addrInput.value = ''; return; }
    addrInput.value = (t.url && !t.url.startsWith('file://')) ? t.url : '';
    const isHttps = !t.url || t.url.startsWith('https://') || t.url.startsWith('file://');
    const lock = $('#addrLock');
    lock.style.color = isHttps ? '#7ce5b9' : '#febc2e';
    $('#navBack').disabled = !t.canBack;
    $('#navFwd').disabled  = !t.canFwd;
  }
  addrInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') navigateTo(addrInput.value);
    if (e.key === 'Escape') addrInput.blur();
  });
  addrInput.addEventListener('focus', () => addrInput.select());

  $('#navBack').addEventListener('click',   () => state.activeTabId && ovyra.tabBack(state.activeTabId));
  $('#navFwd').addEventListener('click',    () => state.activeTabId && ovyra.tabForward(state.activeTabId));
  $('#navReload').addEventListener('click', () => state.activeTabId && ovyra.tabReload(state.activeTabId));
  $('#newTab').addEventListener('click',    () => newTab());
  $('#btnSleep').addEventListener('click', () => {
    const id = state.activeTabId; if (!id) return;
    const t = getTab(id); if (!t) return;
    if (t.sleeping) { ovyra.tabWake(id); toast('Tab woken'); }
    else { ovyra.tabSleep(id); toast('Tab put to sleep · process destroyed'); }
  });
  $('#winMin').addEventListener('click',   () => ovyra.winMinimize());
  $('#winMax').addEventListener('click',   () => ovyra.winMaxToggle());
  $('#winClose').addEventListener('click', () => ovyra.winClose());

  // ==========================================================================
  // SPLIT VIEW
  // ==========================================================================

  async function toggleSplit(force) {
    state.splitMode = (typeof force === 'boolean') ? force : !state.splitMode;
    const sec = $('.pane--secondary');
    const handle = $('#splitHandle');
    const primary = $('.pane--primary');
    sec.hidden = !state.splitMode;
    handle.hidden = !state.splitMode;
    if (state.splitMode) {
      if (!state.secondaryTabId) {
        const others = wsTabList().filter(t => t.id !== state.activeTabId);
        const tgt = others[0] || (await newTab(null, { activate: false }));
        await activateTab(tgt.id, 'secondary');
      }
      toast('Split view enabled');
    } else {
      if (state.secondaryTabId) { await ovyra.tabHide('secondary'); state.secondaryTabId = null; }
      primary.style.flex = ''; sec.style.flex = '';
      toast('Split view closed');
    }
    requestAnimationFrame(pushAllBounds);
  }
  $('#btnSplit').addEventListener('click',        () => toggleSplit());
  $('#btnSplitToolbar').addEventListener('click', () => toggleSplit());

  (() => {
    const handle = $('#splitHandle'); const wrap = $('#viewports');
    let dragging = false;
    handle.addEventListener('mousedown', () => { dragging = true; document.body.style.cursor = 'col-resize'; });
    window.addEventListener('mouseup',   () => { dragging = false; document.body.style.cursor = ''; });
    window.addEventListener('mousemove', e => {
      if (!dragging) return;
      const rect = wrap.getBoundingClientRect();
      const ratio = Math.min(0.85, Math.max(0.15, (e.clientX - rect.left) / rect.width));
      $('.pane--primary').style.flex   = `${ratio} 1 0`;
      $('.pane--secondary').style.flex = `${1 - ratio} 1 0`;
      pushAllBounds();
    });
  })();

  // ==========================================================================
  // SIDE PANELS
  // ==========================================================================

  const PANELS = ['guardian', 'limiter', 'echo', 'settings', 'appPanel'];

  async function togglePanel(id, btnId) {
    const panel = $('#' + id);
    const btn = btnId ? $('#' + btnId) : null;
    const willShow = panel.hidden;

    // Close other panels (and hide app view if leaving app/echo panel)
    for (const p of PANELS) {
      if (p !== id && !$('#' + p).hidden) {
        await closePanel(p);
      }
    }

    panel.hidden = !willShow;
    [...$$('.icon-btn.active')].forEach(b => b.classList.remove('active'));
    if (willShow && btn) btn.classList.add('active');

    // Hide active app view if we're not in the app/echo panel
    if (id !== 'appPanel' && id !== 'echo' && state.activeApp) {
      ovyra.appHide(state.activeApp.id);
      state.activeApp = null;
    }

    requestAnimationFrame(pushAllBounds);
  }
  async function closePanel(id) {
    const panel = $('#' + id);
    panel.hidden = true;
    if (id === 'appPanel' && state.activeApp?.type === 'app') {
      await ovyra.appHide(state.activeApp.id); state.activeApp = null;
    }
    if (id === 'echo' && state.activeApp?.type === 'echo') {
      await ovyra.appHide(state.activeApp.id); state.activeApp = null;
    }
  }

  $('#btnGuardian').addEventListener('click', () => togglePanel('guardian', 'btnGuardian'));
  $('#btnLimiter').addEventListener('click',  () => togglePanel('limiter',  'btnLimiter'));
  $('#btnEcho').addEventListener('click',     () => togglePanel('echo',     'btnEcho'));
  $('#btnSettings').addEventListener('click', () => togglePanel('settings', 'btnSettings'));
  $$('[data-close-panel]').forEach(b => b.addEventListener('click', async () => {
    await closePanel(b.dataset.closePanel);
    [...$$('.icon-btn.active')].forEach(x => x.classList.remove('active'));
    requestAnimationFrame(pushAllBounds);
  }));

  // Guardian toggles
  const guardMap = { togAds: 'ads', togTrackers: 'trackers', togSafePath: 'safePath', togHttps: 'https' };
  Object.entries(guardMap).forEach(([id, key]) => {
    $('#' + id).addEventListener('change', async e => {
      await ovyra.guardianSet({ [key]: e.target.checked });
      toast(`Guardian · ${e.target.previousElementSibling.textContent}: ${e.target.checked ? 'ON' : 'OFF'}`);
    });
  });
  $('#purgeCookies').addEventListener('click', async () => { await ovyra.clearCookies(); toast('Cookies purged'); });

  $('#ramCap').addEventListener('input', e => {
    $('#ramCapVal').textContent = `${e.target.value} MB`;
    e.target.style.setProperty('--p', ((e.target.value - 512) / (8192 - 512) * 100) + '%');
  });
  $('#cpuCap').addEventListener('input', e => {
    $('#cpuCapVal').textContent = `${e.target.value}%`;
    e.target.style.setProperty('--p', ((e.target.value - 10) / 90 * 100) + '%');
  });
  $('#togSleepAuto').addEventListener('change', e => { state.sleepAuto = e.target.checked; });

  // ==========================================================================
  // ECHO (built-in audio + external sources)
  // ==========================================================================

  function startSound(kind, vol) {
    stopSound();
    if (kind === 'off') return;
    const ctx = state.soundCtx ||= new (window.AudioContext || window.webkitAudioContext)();
    const gain = ctx.createGain();
    gain.gain.value = (vol / 100) * 0.35;
    gain.connect(ctx.destination);
    if (kind === 'white' || kind === 'brown' || kind === 'rain') {
      const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const d = buf.getChannelData(0); let lastOut = 0;
      for (let i = 0; i < d.length; i++) {
        const wn = Math.random() * 2 - 1;
        if (kind === 'white') d[i] = wn;
        else if (kind === 'brown') { d[i] = (lastOut + 0.02 * wn) / 1.02; lastOut = d[i]; d[i] *= 3.5; }
        else if (kind === 'rain') { d[i] = wn * 0.3 + (Math.random() < 0.001 ? Math.random() * 0.6 : 0); }
      }
      const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true; src.connect(gain); src.start();
      state.soundNode = src;
    } else if (kind === 'lofi') {
      const o1 = ctx.createOscillator(); const o2 = ctx.createOscillator();
      o1.type = 'sine'; o2.type = 'sine';
      o1.frequency.value = 220; o2.frequency.value = 220 * Math.pow(2, 7/12);
      o1.detune.value = -8; o2.detune.value = +8;
      o1.connect(gain); o2.connect(gain); o1.start(); o2.start();
      state.soundNode = { stop: () => { o1.stop(); o2.stop(); } };
    }
  }
  function stopSound() { try { state.soundNode?.stop?.(); } catch {} state.soundNode = null; }

  let echoActiveSound = 'off';
  $$('.sound-card').forEach(c => c.addEventListener('click', () => {
    $$('.sound-card').forEach(x => x.classList.remove('active'));
    c.classList.add('active');
    echoActiveSound = c.dataset.sound;
    startSound(echoActiveSound, +$('#volRange').value);
    toast(`Echo: ${echoActiveSound}`);
  }));
  $('#volRange').addEventListener('input', e => {
    $('#volVal').textContent = `${e.target.value}%`;
    e.target.style.setProperty('--p', e.target.value + '%');
    if (echoActiveSound !== 'off') startSound(echoActiveSound, +e.target.value);
  });

  function renderEchoSources() {
    const tabs = $('#echoSourceTabs');
    tabs.innerHTML = '';
    ECHO_SOURCES.forEach(src => {
      const t = el('button', {
        className: 'source-tab' + (settings.echoSource === src.id ? ' active' : ''),
        textContent: src.name
      });
      t.addEventListener('click', async () => {
        settings.echoSource = src.id; saveSettings();
        renderEchoSources();
        await switchEchoSource(src);
      });
      tabs.append(t);
    });
  }
  async function switchEchoSource(src) {
    const builtin = $('#echoBuiltin');
    const stream  = $('#echoStreaming');
    if (src.id === 'builtin') {
      builtin.hidden = false; stream.hidden = true;
      if (state.activeApp?.type === 'echo') {
        await ovyra.appHide(state.activeApp.id);
        state.activeApp = null;
      }
    } else {
      builtin.hidden = true; stream.hidden = false;
      stopSound(); $$('.sound-card').forEach(x => x.classList.remove('active'));
      $('#echoSourceInfo').textContent = `${src.name} · embedded web player`;
      const appId = 'echo:' + src.id;
      // Hide previously active echo source
      if (state.activeApp?.type === 'echo' && state.activeApp.id !== appId) {
        await ovyra.appHide(state.activeApp.id);
      }
      await ovyra.appShow(appId, src.url);
      state.activeApp = { id: appId, url: src.url, type: 'echo' };
      requestAnimationFrame(pushAllBounds);
    }
  }

  // ==========================================================================
  // SIDEBAR APPS
  // ==========================================================================

  function renderAppsRail() {
    const rail = $('#appsRail');
    rail.innerHTML = '';
    settings.apps.forEach(appId => {
      const app = APP_CATALOG.find(a => a.id === appId);
      if (!app) return;
      const btn = el('button', { className: 'ws-btn', title: app.name });
      const fav = faviconUrl(app.url);
      const img = new Image();
      img.src = fav;
      img.onerror = () => { btn.textContent = app.name.charAt(0); };
      btn.append(img);
      btn.addEventListener('click', () => openApp(app));
      btn.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        if (confirm(`Remove ${app.name} from sidebar?`)) {
          settings.apps = settings.apps.filter(x => x !== appId);
          saveSettings();
          renderAppsRail();
          if (state.activeApp?.id === app.id) {
            ovyra.appClose(app.id); state.activeApp = null;
            $('#appPanel').hidden = true;
          }
        }
      });
      rail.append(btn);
    });
  }
  async function openApp(app) {
    // Close other panels except the appPanel
    for (const p of PANELS) if (p !== 'appPanel' && !$('#' + p).hidden) await closePanel(p);
    [...$$('.icon-btn.active')].forEach(b => b.classList.remove('active'));

    $('#appPanel').hidden = false;
    $('#appPanelTitle').textContent = app.name;

    // Hide previous app
    if (state.activeApp && state.activeApp.id !== app.id) {
      await ovyra.appHide(state.activeApp.id);
    }
    await ovyra.appShow(app.id, app.url);
    state.activeApp = { id: app.id, url: app.url, type: 'app' };
    requestAnimationFrame(pushAllBounds);
  }
  $('#appPanelReload').addEventListener('click', async () => {
    if (state.activeApp) {
      // Reload by closing + re-showing
      await ovyra.appClose(state.activeApp.id);
      await ovyra.appShow(state.activeApp.id, state.activeApp.url);
      requestAnimationFrame(pushAllBounds);
      toast('App reloaded');
    }
  });

  function faviconUrl(siteUrl) {
    try {
      const u = new URL(siteUrl);
      return `https://icons.duckduckgo.com/ip3/${u.hostname}.ico`;
    } catch { return ''; }
  }

  // App catalog modal
  function renderCatalog() {
    const grid = $('#catalogGrid');
    grid.innerHTML = '';
    APP_CATALOG.forEach(app => {
      const enabled = settings.apps.includes(app.id);
      const card = el('div', { className: 'catalog-card-item' + (enabled ? ' enabled' : '') });
      const img = new Image();
      img.src = faviconUrl(app.url);
      img.onerror = () => { img.replaceWith(el('span', { textContent: app.name.charAt(0), style: 'font-size:24px;font-weight:700' })); };
      card.append(
        img,
        el('div', { className: 'ci-name', textContent: app.name }),
        el('div', { className: 'ci-state', textContent: enabled ? 'Added' : 'Add' })
      );
      card.addEventListener('click', () => {
        if (enabled) settings.apps = settings.apps.filter(x => x !== app.id);
        else settings.apps.push(app.id);
        saveSettings(); renderCatalog(); renderAppsRail();
      });
      grid.append(card);
    });
  }
  function openCatalog() {
    renderCatalog();
    $('#appCatalog').hidden = false;
    ovyra.viewsSetVisible(false);
  }
  function closeCatalog() {
    $('#appCatalog').hidden = true;
    ovyra.viewsSetVisible(true);
  }
  $('#manageApps').addEventListener('click', openCatalog);
  $('#catalogClose').addEventListener('click', closeCatalog);
  $('.catalog-scrim').addEventListener('click', closeCatalog);

  // ==========================================================================
  // SETTINGS PANEL renderers
  // ==========================================================================

  function renderThemeGrid(host, current, onPick) {
    host.innerHTML = '';
    THEMES.forEach(t => {
      const btn = el('button', {
        className: 'theme-swatch' + (t.id === current ? ' active' : ''),
        textContent: t.label,
        style: `background: ${t.swatch}`
      });
      btn.addEventListener('click', () => onPick(t.id));
      host.append(btn);
    });
  }
  function renderSeGrid(host, current, onPick) {
    host.innerHTML = '';
    SEARCH_ENGINES.forEach(s => {
      const btn = el('button', {
        className: 'se-card' + (s.id === current ? ' active' : ''),
        textContent: s.name
      });
      btn.addEventListener('click', () => onPick(s.id));
      host.append(btn);
    });
  }
  function renderLogoGrid(host, current, onPick) {
    host.innerHTML = '';
    LOGOS.forEach(l => {
      const enc = l.file.includes(' ') ? l.file.replace(/ /g, '%20') : l.file;
      const btn = el('button', { className: 'logo-card' + (l.id === current ? ' active' : '') });
      const img = new Image(); img.src = enc; btn.append(img);
      btn.append(el('span', { textContent: l.name }));
      btn.addEventListener('click', () => onPick(l.id));
      host.append(btn);
    });
  }

  function refreshSettingsPanel() {
    renderThemeGrid($('#themeGrid'), settings.theme, id => { applyTheme(id); refreshSettingsPanel(); toast(`Theme: ${id}`); });
    renderSeGrid($('#seGrid'), settings.searchEngine, id => { settings.searchEngine = id; saveSettings(); refreshSettingsPanel(); toast(`Search: ${id}`); });
    renderLogoGrid($('#logoGrid'), settings.logo, id => { applyLogo(id); refreshSettingsPanel(); });
  }
  $('#reopenWelcome').addEventListener('click', () => openWelcome());

  // ==========================================================================
  // WELCOME SCREEN (first run)
  // ==========================================================================

  function renderWelcome() {
    renderThemeGrid($('#welcomeThemeGrid'), settings.theme, id => {
      applyTheme(id);
      // Non-default themes pair nicely with the simple logo by default,
      // but the user can override below.
      if (id !== 'default' && settings.logo === 'default') applyLogo('simple');
      else if (id === 'default' && settings.logo === 'simple') applyLogo('default');
      renderWelcome();
    });
    renderSeGrid($('#welcomeSeGrid'), settings.searchEngine, id => {
      settings.searchEngine = id; saveSettings();
      renderWelcome();
    });
    renderLogoGrid($('#welcomeLogoGrid'), settings.logo, id => {
      applyLogo(id);
      renderWelcome();
    });
  }
  function openWelcome() {
    $('#welcome').hidden = false;
    // Hide the Chromium WebContentsViews so the welcome modal can actually
    // appear over the viewport (native overlays always sit above DOM).
    ovyra.viewsSetVisible(false);
    renderWelcome();
  }
  $('#welcomeDone').addEventListener('click', () => {
    settings.welcomed = true; saveSettings();
    $('#welcome').hidden = true;
    ovyra.viewsSetVisible(true);
    refreshSettingsPanel();
    toast('Welcome aboard');
  });

  // ==========================================================================
  // COMMAND PALETTE
  // ==========================================================================

  const palette  = $('#palette');
  const palInput = $('#paletteInput');
  const palList  = $('#paletteList');

  const baseActions = () => [
    { icon: '+', title: 'New Tab', sub: 'Fresh start page', tag: 'CMD', run: () => newTab() },
    { icon: '⎚', title: 'Toggle Split View', sub: 'Two tabs', tag: 'CMD', run: () => toggleSplit() },
    { icon: '🛡', title: 'Open Guardian', sub: 'Trackers blocked', tag: 'CMD', run: () => togglePanel('guardian','btnGuardian') },
    { icon: '⚡', title: 'Resource Limiter', sub: 'Cap RAM & CPU', tag: 'CMD', run: () => togglePanel('limiter','btnLimiter') },
    { icon: '🎧', title: 'Echo', sub: 'Focus audio · music', tag: 'CMD', run: () => togglePanel('echo','btnEcho') },
    { icon: '⚙', title: 'Settings', sub: 'Theme · search · logo', tag: 'CMD', run: () => togglePanel('settings','btnSettings') },
    { icon: '💤', title: 'Sleep / Wake Active Tab', sub: '', tag: 'CMD', run: () => $('#btnSleep').click() },
    { icon: '🔌', title: 'Manage Sidebar Apps', sub: '', tag: 'CMD', run: () => $('#manageApps').click() }
  ];
  const tabActions = () => state.tabs.map(t => ({
    icon: (prettyHost(t.url) || 'O').charAt(0).toUpperCase(),
    title: t.title || prettyHost(t.url) || 'New Tab',
    sub: t.url, tag: 'TAB', run: () => activateTab(t.id)
  }));

  let palSel = 0;
  const renderPalette = () => {
    const q = palInput.value.toLowerCase();
    const all = [...tabActions(), ...baseActions()];
    const filtered = q ? all.filter(a => (a.title + ' ' + (a.sub||'') + ' ' + a.tag).toLowerCase().includes(q)) : all;
    if (q && !filtered.some(a => a.title.toLowerCase() === q)) {
      filtered.unshift({ icon: '↵', tag: 'NAV', title: q, sub: 'Open in current tab', run: () => navigateTo(q) });
    }
    palList.innerHTML = '';
    filtered.slice(0, 12).forEach((a, i) => {
      const node = el('div', { className: 'palette-item' + (i === palSel ? ' sel' : '') },
        el('div', { className: 'pi-icon', textContent: a.icon }),
        el('div', { className: 'pi-meta' },
          el('div', { className: 'pi-title', textContent: a.title }),
          el('div', { className: 'pi-sub', textContent: a.sub || '' })
        ),
        el('div', { className: 'pi-tag', textContent: a.tag })
      );
      node.addEventListener('click', () => { a.run(); closePalette(); });
      palList.append(node);
    });
    palList._actions = filtered;
  };
  const openPalette = () => {
    palette.hidden = false; palInput.value = ''; palSel = 0; renderPalette();
    ovyra.viewsSetVisible(false);
    setTimeout(() => palInput.focus(), 30);
  };
  const closePalette = () => { palette.hidden = true; ovyra.viewsSetVisible(true); };
  $('#addrPalette').addEventListener('click', openPalette);
  $('.palette-scrim').addEventListener('click', closePalette);
  palInput.addEventListener('input', () => { palSel = 0; renderPalette(); });
  palInput.addEventListener('keydown', e => {
    const list = palList._actions || [];
    if (e.key === 'ArrowDown') { palSel = Math.min(palSel + 1, list.length - 1); renderPalette(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { palSel = Math.max(palSel - 1, 0); renderPalette(); e.preventDefault(); }
    else if (e.key === 'Enter') { list[palSel]?.run(); closePalette(); }
    else if (e.key === 'Escape') closePalette();
  });

  // ==========================================================================
  // KEYBOARD SHORTCUTS
  // ==========================================================================

  window.addEventListener('keydown', e => {
    const ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && e.key.toLowerCase() === 'k') { e.preventDefault(); palette.hidden ? openPalette() : closePalette(); }
    else if (ctrl && e.key.toLowerCase() === 't') { e.preventDefault(); newTab(); }
    else if (ctrl && e.key.toLowerCase() === 'w') { e.preventDefault(); state.activeTabId && closeTab(state.activeTabId); }
    else if (ctrl && e.key.toLowerCase() === 'l') { e.preventDefault(); addrInput.focus(); }
    else if (ctrl && e.key === '\\') { e.preventDefault(); toggleSplit(); }
    else if (ctrl && e.key.toLowerCase() === 'r') { e.preventDefault(); $('#navReload').click(); }
    else if (e.altKey && e.key === 'ArrowLeft') $('#navBack').click();
    else if (e.altKey && e.key === 'ArrowRight') $('#navFwd').click();
  });

  // ==========================================================================
  // METRICS + auto-sleep
  // ==========================================================================

  setInterval(async () => {
    try {
      const m = await ovyra.metrics();
      const g = $('#gBlockedTotal'); if (g) g.textContent = m.blocked;
    } catch {}
  }, 1500);

  setInterval(() => {
    if (!state.sleepAuto) return;
    const now = Date.now();
    state.tabs.forEach(t => {
      if (t.id === state.activeTabId || t.id === state.secondaryTabId) return;
      if (!t.sleeping && now - t.lastActive > 5 * 60_000) ovyra.tabSleep(t.id);
    });
  }, 30_000);

  // ==========================================================================
  // EVENTS FROM MAIN
  // ==========================================================================

  ovyra.on('tab:title', ({ id, title }) => {
    const t = getTab(id); if (!t) return;
    t.title = title || t.title; renderTabs();
    if (id === state.activeTabId) document.title = `${t.title} — Ovyra`;
  });
  ovyra.on('tab:url', ({ id, url, canBack, canFwd }) => {
    const t = getTab(id); if (!t) return;
    t.url = url; t.canBack = !!canBack; t.canFwd = !!canFwd;
    if (id === state.activeTabId) syncAddressBar();
    renderTabs();
  });
  ovyra.on('tab:loading', ({ id, loading }) => {
    const t = getTab(id); if (!t) return;
    t.loading = loading;
    if (id === state.activeTabId)   setLoading('primary',   loading);
    if (id === state.secondaryTabId) setLoading('secondary', loading);
    renderTabs();
  });
  ovyra.on('tab:favicon', ({ id, favicon }) => {
    const t = getTab(id); if (!t) return;
    t.favicon = favicon; renderTabs();
  });
  ovyra.on('tab:sleep', ({ id, sleeping }) => {
    const t = getTab(id); if (!t) return;
    t.sleeping = sleeping; renderTabs();
  });
  ovyra.on('tab:requestNew', ({ url }) => { newTab(url); });
  ovyra.on('guardian:blocked', d => {
    state.blockLog.unshift({ t: d.ts, host: d.host });
    state.blockLog = state.blockLog.slice(0, 80);
    renderBlockLog();
  });
  ovyra.on('guardian:safepath', () => toast('Safe-Path blocked a redirect'));
  ovyra.on('window:resized', pushAllBounds);
  ovyra.on('window:state', () => requestAnimationFrame(pushAllBounds));

  function renderBlockLog() {
    const root = $('#blockLog'); if (!root) return;
    root.innerHTML = '';
    state.blockLog.slice(0, 30).forEach(b => {
      const time = new Date(b.t).toLocaleTimeString().slice(0, 8);
      root.append(el('div', { className: 'block-log-row' },
        el('span', { className: 'tt', textContent: time }),
        el('span', { textContent: b.host })
      ));
    });
  }

  $('#addWorkspace').addEventListener('click', () => {
    const colors = ['#7aa6ff', '#7ce5b9', '#febc2e', '#a78bfa', '#f87171', '#ED4872'];
    const c = colors[state.workspaces.length % colors.length];
    state.workspaces.push({ name: `WS${state.workspaces.length + 1}`, color: c, tabIds: [] });
    state.activeWs = state.workspaces.length - 1;
    renderWorkspaces();
    newTab();
    toast('New workspace');
  });

  // ==========================================================================
  // BOOT
  // ==========================================================================

  async function boot() {
    // Apply persisted settings before anything renders
    applyTheme(settings.theme);
    applyLogo(settings.logo);

    renderWorkspaces();
    renderAppsRail();
    renderEchoSources();
    refreshSettingsPanel();

    await newTab();
    requestAnimationFrame(pushAllBounds);

    // First-run welcome — open immediately so the view doesn't flash visible
    if (!settings.welcomed) openWelcome();
  }
  document.addEventListener('DOMContentLoaded', boot);

})();
