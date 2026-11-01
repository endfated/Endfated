export async function notify({ title, message, url, priority }) {
  const topic = process.env.NTFY_TOPIC;
  if (!topic) {
    console.log(`[notify skipped, NTFY_TOPIC unset] ${title} - ${message}`);
    return;
  }
  const headers = { Title: `=?UTF-8?B?${Buffer.from(title).toString('base64')}?=`, Tags: 'video_game' };
  if (url) headers.Click = url;
  if (priority) headers.Priority = String(priority);
  const res = await fetch(`https://ntfy.sh/${topic}`, { method: 'POST', headers, body: message });
  if (!res.ok) throw new Error(`ntfy ${res.status}`);
}
