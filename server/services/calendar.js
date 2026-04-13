// Generate RFC 5545 .ics calendar events for scheduled posts.
// Output is compatible with Google Calendar, Apple Calendar, and Outlook.

function formatICSDate(date) {
  const d = new Date(date);
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function escapeICS(str) {
  if (!str) return '';
  return String(str)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '');
}

function foldLine(line) {
  // RFC 5545 — lines should be ≤75 octets, continuation lines start with a space
  const limit = 74;
  if (line.length <= limit) return line;
  const parts = [];
  let i = 0;
  while (i < line.length) {
    parts.push((i === 0 ? '' : ' ') + line.slice(i, i + limit));
    i += limit;
  }
  return parts.join('\r\n');
}

export function buildIcsEvent({ id, platform, postText, scheduledAt, durationMinutes = 15, url }) {
  const start = new Date(scheduledAt);
  const end = new Date(start.getTime() + durationMinutes * 60_000);
  const summary = `ScribeShift: ${platform} post`;
  const description = (postText || '').slice(0, 400);

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//ScribeShift//Schedule//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${id}@scribeshift.app`,
    `DTSTAMP:${formatICSDate(new Date())}`,
    `DTSTART:${formatICSDate(start)}`,
    `DTEND:${formatICSDate(end)}`,
    `SUMMARY:${escapeICS(summary)}`,
    `DESCRIPTION:${escapeICS(description)}`,
    url ? `URL:${escapeICS(url)}` : null,
    'STATUS:CONFIRMED',
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `DESCRIPTION:${escapeICS(summary)}`,
    'TRIGGER:-PT15M',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean).map(foldLine);

  return lines.join('\r\n');
}

export function icsAttachment(post, opts = {}) {
  const ics = buildIcsEvent({
    id: post.id,
    platform: post.platform,
    postText: post.post_text,
    scheduledAt: post.scheduled_at,
    ...opts,
  });
  return {
    filename: 'scribeshift-post.ics',
    content: Buffer.from(ics, 'utf-8').toString('base64'),
    contentType: 'text/calendar; charset=utf-8; method=PUBLISH',
  };
}
