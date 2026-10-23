const DEFAULT_BASE = 'http://127.0.0.1:8787';
const ALARM_NAME = 'refresh-scheduler-status';
async function getBase() {
  const { apiBase } = await chrome.storage.local.get(['apiBase']);
  return (apiBase || DEFAULT_BASE).replace(/\\/$/, '');
}
async function refresh() {
  try {
    const response = await fetch(`${await getBase()}/api/status`, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error(`Backend status ${response.status}`);
    const data = await response.json();
    await chrome.storage.local.set({
      lastStatus: data,
      lastStatusAt: new Date().toISOString(),
      lastBackendError: null
    });
  } catch (error) {
    await chrome.storage.local.set({
      lastBackendError: String(error?.message || error),
      lastStatusAt: new Date().toISOString()
    });
  }
}
async function ensureAlarm() {
  const existing = await chrome.alarms.get(ALARM_NAME);
  if (!existing) chrome.alarms.create(ALARM_NAME, { periodInMinutes: 5 });
}
chrome.runtime.onInstalled.addListener(() => { ensureAlarm(); refresh(); });
chrome.runtime.onStartup.addListener(() => { ensureAlarm(); refresh(); });
chrome.alarms.onAlarm.addListener(alarm => { if (alarm.name === ALARM_NAME) refresh(); });
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'REFRESH_ALARM') {
    ensureAlarm();
    refresh().then(() => sendResponse({ ok: true })).catch(e => sendResponse({ ok: false, error: String(e) }));
    return true;
  }
});
ensureAlarm();
