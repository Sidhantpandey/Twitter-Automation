// Scheduler service. The backend is the source of truth for queued posts and
// rate-limited replies; the browser extension only refreshes status information.
import { db, getSettings } from '../db.js';
import { generatePost } from './xaiService.js';
import { publishPost } from './xService.js';

let busy = false;
const nowIso = () => new Date().toISOString();

function nextScheduleDate(times, timezone, after = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });

  for (let day = 0; day < 8; day += 1) {
    const date = new Date(after.getTime() + day * 86400000);
    const parts = Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]));
    const dayStr = `${parts.year}-${parts.month}-${parts.day}`;

    for (const time of times) {
      const [hh, mm] = time.split(':').map(Number);
      const targetLocal = `${dayStr} ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
      let guess = new Date(
        `${dayStr}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00Z`,
      );

      for (let i = 0; i < 3; i += 1) {
        const p = Object.fromEntries(fmt.formatToParts(guess).map((x) => [x.type, x.value]));
        const seen = `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
        const desiredAsUtc = new Date(`${targetLocal.replace(' ', 'T')}:00Z`).getTime();
        const seenAsUtc = new Date(`${seen.replace(' ', 'T')}:00Z`).getTime();
        guess = new Date(guess.getTime() + desiredAsUtc - seenAsUtc);
      }

      if (guess > after) {
        return guess;
      }
    }
  }

  throw new Error('Could not calculate next schedule time.');
}

export const calculateNextRun = (settings, after = new Date()) =>
  nextScheduleDate(settings.scheduleTimes, settings.timezone, after).toISOString();

async function queueNextIfNeeded(settings, nextRunAt) {
  const future = db.prepare("SELECT id FROM posts WHERE status='queued' LIMIT 1").get();
  if (future) {
    return;
  }

  try {
    const recent = db
      .prepare('SELECT text FROM posts ORDER BY id DESC LIMIT 8')
      .all()
      .map((row) => row.text);
    const text = await generatePost({
      topics: settings.topics,
      tone: settings.tone,
      recentPosts: recent,
    });

    db.prepare('INSERT INTO posts(text,status,scheduled_for) VALUES(?,?,?)').run(
      text,
      'queued',
      nextRunAt,
    );
  } catch (error) {
    const message = String(error?.message || error).slice(0, 1500);
    db.prepare('UPDATE settings SET last_error=? WHERE id=1').run(message);
  }
}

export const tick = async () => {
  if (busy) {
    return;
  }

  busy = true;

  try {
    const settings = getSettings();
    if (!settings.enabled) {
      return;
    }

    const due = db
      .prepare(
        "SELECT * FROM posts WHERE status='queued' AND scheduled_for <= ? ORDER BY scheduled_for LIMIT 1",
      )
      .get(nowIso());
    if (!due) {
      return;
    }

    db.prepare(
      "UPDATE posts SET status='publishing', error=NULL WHERE id=? AND status='queued'",
    ).run(due.id);

    try {
      const result = await publishPost(due.text);
      db.prepare(
        "UPDATE posts SET status='published', x_post_id=?, published_at=?, error=NULL WHERE id=?",
      ).run(result?.id || null, nowIso(), due.id);
    } catch (error) {
      const message = String(error?.message || error).slice(0, 1500);
      db.prepare("UPDATE posts SET status='failed', error=? WHERE id=?").run(message, due.id);
      db.prepare('UPDATE settings SET last_error=? WHERE id=1').run(message);
    }

    const next = calculateNextRun(settings, new Date());
    db.prepare('UPDATE settings SET next_run_at=?, last_error=NULL WHERE id=1').run(next);
    await queueNextIfNeeded(settings, next);
  } catch (error) {
    console.error('Scheduler tick error:', error);
    db.prepare('UPDATE settings SET last_error=? WHERE id=1').run(
      String(error?.message || error).slice(0, 1500),
    );
  } finally {
    busy = false;
  }
};

export const enableSchedule = async () => {
  const settings = getSettings();
  if (!settings.scheduleTimes.length) {
    throw new Error('Add at least one schedule time.');
  }

  const next = calculateNextRun(settings);
  db.prepare('UPDATE settings SET enabled=1, next_run_at=?, last_error=NULL WHERE id=1').run(next);

  const recent = db
    .prepare('SELECT text FROM posts ORDER BY id DESC LIMIT 8')
    .all()
    .map((row) => row.text);
  const text = await generatePost({
    topics: settings.topics,
    tone: settings.tone,
    recentPosts: recent,
  });

  db.prepare('INSERT INTO posts(text,status,scheduled_for) VALUES(?,?,?)').run(
    text,
    'queued',
    next,
  );
  return next;
};

export const disableSchedule = () => {
  db.prepare('UPDATE settings SET enabled=0, next_run_at=NULL WHERE id=1').run();
  db.prepare("UPDATE posts SET status='cancelled' WHERE status='queued'").run();
};

export const startScheduler = () => {
  setInterval(() => {
    tick().catch(console.error);
  }, 15_000);

  // Daily schedule starts at 10:00 by default; this is the requested morning rhythm.
  tick().catch(console.error);
};
