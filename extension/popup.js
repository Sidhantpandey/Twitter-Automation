const $ = id => document.getElementById(id);
const DEFAULT_BASE = 'http://127.0.0.1:8787';
let settings = null;
function base() { return ($('apiBase').value || DEFAULT_BASE).replace(/\\/$/, ''); }
function message(text, error = false) {
  $('message').textContent = text;
  $('message').style.color = error ? '#dc2626' : '';
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
async function load() {
  try {
    await chrome.storage.local.set({ apiBase: base() });
    const status = await api('/api/status');
    settings = status.settings;
    $('status').textContent = status.xAccount.connected
      ? `Connected: @${status.xAccount.username || 'X account'} · ${settings.enabled ? 'Auto-posting ON' : 'Auto-posting OFF'}`
      : 'Backend online · X account not connected';
    $('topics').value = settings.topics;
    $('tone').value = settings.tone;
    $('times').value = settings.scheduleTimes.join(',');
    $('timezone').value = settings.timezone;
    await renderPosts();
    chrome.runtime.sendMessage({ type: 'REFRESH_ALARM' }).catch(() => {});
  } catch (e) {
    $('status').textContent = `Backend unavailable: ${e.message}`;
  }
}
async function saveSettings() {
  const scheduleTimes = $('times').value.split(',').map(x => x.trim()).filter(Boolean);
  const result = await api('/api/settings', {
    method: 'PUT',
    body: JSON.stringify({
      topics: $('topics').value,
      tone: $('tone').value,
      scheduleTimes,
      postsPerDay: scheduleTimes.length,
      timezone: $('timezone').value
    })
  });
  settings = result;
  await chrome.storage.local.set({ apiBase: base() });
  message('Settings saved.');
}
async function renderPosts() {
  const posts = await api('/api/posts?limit=8');
  const container = $('posts');
  container.replaceChildren();
  if (!posts.length) { container.textContent = 'No posts yet.'; return; }
  for (const post of posts) {
    const card = document.createElement('div'); card.className = 'post';
    const p = document.createElement('p'); p.textContent = post.text;
    const small = document.createElement('small');
    small.textContent = `${post.status}${post.scheduled_for ? ' · ' + new Date(post.scheduled_for).toLocaleString() : ''}${post.error ? ' · ' + post.error : ''}`;
    card.append(p, small); container.append(card);
  }
}
$('connect').addEventListener('click', async () => {
  try {
    await chrome.storage.local.set({ apiBase: base() });
    await chrome.tabs.create({ url: `${base()}/auth/x/start` });
    message('Complete X authorization in the new tab, then refresh this popup.');
  } catch (e) { message(e.message, true); }
});
$('save').addEventListener('click', async () => {
  try { await saveSettings(); await load(); } catch (e) { message(e.message, true); }
});
$('generate').addEventListener('click', async () => {
  $('generate').disabled = true;
  try {
    const result = await api('/api/generate', {
      method: 'POST',
      body: JSON.stringify({ topics: $('topics').value, tone: $('tone').value })
    });
    $('draftSection').hidden = false;
    $('draft').value = result.text;
    message('Draft generated and saved. It is not published yet.');
    await renderPosts();
  } catch (e) { message(e.message, true); }
  finally { $('generate').disabled = false; }
});
$('enable').addEventListener('click', async () => {
  try {
    await saveSettings();
    const result = await api('/api/schedule/enable', { method: 'POST', body: '{}' });
    message(`Auto-posting enabled. Next scheduled time: ${new Date(result.nextRunAt).toLocaleString()}`);
    await load();
  } catch (e) { message(e.message, true); }
});
$('disable').addEventListener('click', async () => {
  try {
    await api('/api/schedule/disable', { method: 'POST', body: '{}' });
    message('Auto-posting paused. Queued posts were cancelled.');
    await load();
  } catch (e) { message(e.message, true); }
});
$('apiBase').addEventListener('change', load);
(async () => {
  const stored = await chrome.storage.local.get(['apiBase']);
  if (stored.apiBase) $('apiBase').value = stored.apiBase;
  await load();
})();
