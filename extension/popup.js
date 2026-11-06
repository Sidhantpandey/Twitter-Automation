const $ = (id) => document.getElementById(id);
const DEFAULT_BASE = 'http://127.0.0.1:8787';
let settings = null;
let currentDraftId = null;
const extensionChrome = typeof chrome !== 'undefined' ? chrome : null;
const storage = extensionChrome?.storage?.local || null;

function base() {
  const apiBaseInput = $('apiBase');
  const value = apiBaseInput ? apiBaseInput.value : DEFAULT_BASE;
  return String(value || DEFAULT_BASE).trim().replace(/\/$/, '');
}

function message(text, error = false) {
  const el = $('message');
  if (!el) return;
  el.textContent = text;
  el.style.color = error ? '#dc2626' : '';
}

async function api(path, options = {}) {
  const response = await fetch(`${base()}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    signal: AbortSignal.timeout(12000)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}

function setConnectionButtonState(connected) {
  const button = $('connect');
  if (!button) return;

  button.textContent = connected ? 'Disconnect X account' : 'Connect X account';
  button.classList.toggle('danger', connected);
  button.classList.toggle('secondary', !connected);
}

async function load() {
  try {
    if (storage) {
      await storage.set({ apiBase: base() });
    }
    const status = await api('/api/status');
    const settingsResult = await api('/api/settings');
    settings = settingsResult;
    const statusEl = $('status');
    if (statusEl) {
      statusEl.textContent = status.xAccount.connected
        ? `Connected: @${status.xAccount.username || 'X account'} · ${settings.enabled ? 'Auto-posting ON' : 'Auto-posting OFF'}`
        : 'Backend online · X account not connected';
    }

    setConnectionButtonState(Boolean(status.xAccount.connected));

    const enabledEl = $('enabled');
    const postsPerDayEl = $('postsPerDay');
    const replyLimitPerDayEl = $('replyLimitPerDay');

    if (enabledEl) enabledEl.checked = Boolean(settings.enabled);
    if (postsPerDayEl) postsPerDayEl.value = settings.postsPerDay ?? 3;
    if (replyLimitPerDayEl) replyLimitPerDayEl.value = settings.replyLimitPerDay ?? 10;

    const topicsEl = $('topics');
    const toneEl = $('tone');
    const timesEl = $('times');
    const timezoneEl = $('timezone');

    if (topicsEl) topicsEl.value = settings.topics || '';
    if (toneEl) toneEl.value = settings.tone || '';
    if (timesEl) timesEl.value = (settings.scheduleTimes || []).join(',');
    if (timezoneEl) timezoneEl.value = settings.timezone || 'Asia/Kolkata';

    await renderPosts();
    if (extensionChrome?.runtime) {
      extensionChrome.runtime.sendMessage({ type: 'REFRESH_ALARM' }).catch(() => {});
    }
  } catch (e) {
    const statusEl = $('status');
    if (statusEl) {
      statusEl.textContent = `Backend unavailable: ${e.message}`;
    }
  }
}

async function saveSettings() {
  const scheduleTimes = ($('times')?.value || '').split(',').map(x => x.trim()).filter(Boolean);
  const result = await api('/api/settings', {
    method: 'PUT',
    body: JSON.stringify({
      enabled: $('enabled')?.checked ?? false,
      topics: $('topics')?.value || '',
      tone: $('tone')?.value || '',
      scheduleTimes,
      postsPerDay: Number($('postsPerDay')?.value || 3),
      replyLimitPerDay: Number($('replyLimitPerDay')?.value || 10),
      timezone: $('timezone')?.value || 'Asia/Kolkata'
    })
  });
  settings = result;
  if (storage) {
    await storage.set({ apiBase: base() });
  }
  message('Settings saved.');
}

async function renderPosts() {
  const posts = await api('/api/posts?limit=20');
  const container = $('posts');
  if (!container) return;
  container.replaceChildren();
  if (!posts.length) { container.textContent = 'No queued or saved posts yet.'; return; }

  for (const post of posts) {
    const card = document.createElement('div');
    card.className = 'post';

    const p = document.createElement('p');
    p.textContent = post.text;

    const small = document.createElement('small');
    small.textContent = `${post.status}${post.scheduled_for ? ' · ' + new Date(post.scheduled_for).toLocaleString() : ''}${post.error ? ' · ' + post.error : ''}`;

    const actions = document.createElement('div');
    actions.className = 'postActions';

    const loadBtn = document.createElement('button');
    loadBtn.className = 'secondary small';
    loadBtn.textContent = post.status === 'queued' ? 'Load queued' : 'Edit draft';
    loadBtn.addEventListener('click', async () => {
      currentDraftId = post.id;
      const draft = $('draft');
      if (draft) draft.value = post.text;
      const draftSection = $('draftSection');
      if (draftSection) draftSection.hidden = false;
      message(`Loaded ${post.status}.`);
    });

    const publishBtn = document.createElement('button');
    publishBtn.className = 'primary small';
    publishBtn.textContent = 'Post now';
    publishBtn.addEventListener('click', async () => {
      try {
        const id = Number(post.id);
        await api(`/api/drafts/${id}/publish`, { method: 'POST', body: JSON.stringify({}) });
        if (currentDraftId === id) {
          currentDraftId = null;
          const draft = $('draft');
          if (draft) draft.value = '';
        }
        message('Post published instantly and removed from the queue.');
        await renderPosts();
      } catch (e) {
        message(e.message, true);
      }
    });

    actions.append(loadBtn, publishBtn);
    card.append(p, small, actions);
    container.append(card);
  }
}

async function saveCurrentDraft() {
  const draftEl = $('draft');
  const text = (draftEl?.value || '').trim();
  if (!text) {
    message('Draft text cannot be empty.', true);
    return;
  }

  if (!currentDraftId) {
    const result = await api('/api/generate', {
      method: 'POST',
      body: JSON.stringify({ topics: $('topics')?.value, tone: $('tone')?.value })
    });
    currentDraftId = result.id;
    if (draftEl) draftEl.value = result.text;
  }

  const saved = await api(`/api/drafts/${currentDraftId}/save`, {
    method: 'POST',
    body: JSON.stringify({ text })
  });

  currentDraftId = saved.id;
  const draftSection = $('draftSection');
  if (draftSection) draftSection.hidden = false;
  message('Draft saved.');
  await renderPosts();
}

async function publishCurrentDraft() {
  const draftEl = $('draft');
  const text = (draftEl?.value || '').trim();
  if (!text) {
    message('Nothing to post yet.', true);
    return;
  }

  const idToPublish = currentDraftId || null;
  if (!idToPublish) {
    const result = await api('/api/generate', {
      method: 'POST',
      body: JSON.stringify({ topics: $('topics')?.value, tone: $('tone')?.value })
    });
    currentDraftId = result.id;
    if (draftEl) draftEl.value = result.text;
  }

  const result = await api(`/api/drafts/${currentDraftId}/publish`, {
    method: 'POST',
    body: JSON.stringify({ text })
  });

  currentDraftId = null;
  if (draftEl) draftEl.value = '';
  message(`Published instantly${result?.xPostId ? ` (X post ${result.xPostId})` : ''}.`);
  await renderPosts();
}

const connectButton = $('connect');
if (connectButton) {
  connectButton.addEventListener('click', async () => {
    try {
      const status = await api('/api/status');
      if (status.xAccount.connected) {
        await api('/api/x/disconnect', { method: 'POST', body: '{}' });
        setConnectionButtonState(false);
        message('X account disconnected.');
        await load();
        return;
      }

      if (storage) {
        await storage.set({ apiBase: base() });
      }
      if (extensionChrome?.tabs?.create) {
        await extensionChrome.tabs.create({ url: `${base()}/auth/x/start` });
      } else {
        window.open(`${base()}/auth/x/start`, '_blank');
      }
      message('Complete X authorization in the new tab, then refresh this popup.');
    } catch (e) { message(e.message, true); }
  });
}

const saveButton = $('save');
if (saveButton) {
  saveButton.addEventListener('click', async () => {
    try { await saveSettings(); await load(); } catch (e) { message(e.message, true); }
  });
}

const generateButton = $('generate');
if (generateButton) {
  generateButton.addEventListener('click', async () => {
    generateButton.disabled = true;
    try {
      const result = await api('/api/generate', {
        method: 'POST',
        body: JSON.stringify({ topics: $('topics')?.value, tone: $('tone')?.value })
      });
      currentDraftId = result.id;
      const draftSection = $('draftSection');
      const draft = $('draft');
      if (draftSection) draftSection.hidden = false;
      if (draft) draft.value = result.text;
      message('Draft generated and saved. It is not published yet.');
      await renderPosts();
    } catch (e) { message(e.message, true); }
    finally { generateButton.disabled = false; }
  });
}

const saveDraftButton = $('saveDraft');
if (saveDraftButton) {
  saveDraftButton.addEventListener('click', saveCurrentDraft);
}

const postNowButton = $('postNow');
if (postNowButton) {
  postNowButton.addEventListener('click', publishCurrentDraft);
}

const enableButton = $('enable');
if (enableButton) {
  enableButton.addEventListener('click', async () => {
    try {
      await saveSettings();
      const result = await api('/api/schedule/enable', { method: 'POST', body: '{}' });
      message(`Auto-posting enabled. Next scheduled time: ${new Date(result.nextRunAt).toLocaleString()}`);
      await load();
    } catch (e) { message(e.message, true); }
  });
}

const disableButton = $('disable');
if (disableButton) {
  disableButton.addEventListener('click', async () => {
    try {
      await api('/api/schedule/disable', { method: 'POST', body: '{}' });
      message('Auto-posting paused. Queued posts were cancelled.');
      await load();
    } catch (e) { message(e.message, true); }
  });
}

const apiBase = $('apiBase');
if (apiBase) {
  apiBase.addEventListener('change', load);
}

(async () => {
  try {
    if (storage) {
      const stored = await storage.get(['apiBase']);
      if (stored.apiBase && apiBase) apiBase.value = stored.apiBase;
    }
    await load();
  } catch (e) {
    const statusEl = $('status');
    if (statusEl) {
      statusEl.textContent = `Popup error: ${e.message}`;
    }
  }
})();
