const PRIORITIES = { min: 1, low: 2, default: 3, high: 4, urgent: 5 };

export async function notify({ title, message, url, priority = 'default' }) {
  const topic = process.env.NTFY_TOPIC;
  if (!topic) {
    console.log(`[notify skipped, NTFY_TOPIC unset] ${title} - ${message}`);
    return;
  }
  // JSON publish: UTF-8 title/emoji without header encoding
  const res = await fetch('https://ntfy.sh/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ topic, title, message, click: url, priority: PRIORITIES[priority] ?? 3, tags: ['video_game'] }),
  });
  if (!res.ok) throw new Error(`ntfy ${res.status}`);
}
