// Kalender-abonnement (.ics). iPhone henter denne URL-en jevnlig:
//   https://<prosjekt>.supabase.co/functions/v1/calendar-feed?token=<feed_token>
// Deploy:  npx supabase functions deploy calendar-feed --no-verify-jwt
import { createClient } from 'npm:@supabase/supabase-js@2';

const sb = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, // settes automatisk av Supabase
);

const UUID_RE = /^[0-9a-f-]{36}$/i;

// Lokal tid uten tidssone ("flytende tid") – iPhone viser den i egen tidssone (Norge).
const stamp = (date: string, time: string) => date.replaceAll('-', '') + 'T' + time.slice(0, 5).replace(':', '') + '00';

function addDay(date: string) {
  const d = new Date(date + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

// Escape ICS-tegn og fjern linjeskift helt, så et vaktnavn ikke kan legge til egne linjer i feeden.
const escape = (s: string) => s.replace(/[\r\n]+/g, ' ').replace(/[\\;,]/g, (c) => '\\' + c).slice(0, 100);

Deno.serve(async (req) => {
  const token = new URL(req.url).searchParams.get('token') ?? '';
  if (!UUID_RE.test(token)) return new Response('Ugyldig lenke', { status: 400 });

  const { data: profile } = await sb.from('profiles').select('id').eq('feed_token', token).maybeSingle();
  if (!profile) return new Response('Fant ikke kalenderen', { status: 404 });

  // Ta med vakter fra 3 måneder tilbake og fremover.
  const since = new Date();
  since.setMonth(since.getMonth() - 3);
  const { data: shifts, error } = await sb
    .from('shifts')
    .select('id, date, name, start_time, end_time')
    .eq('user_id', profile.id)
    .gte('date', since.toISOString().slice(0, 10))
    .order('date');
  if (error) return new Response('Feil', { status: 500 });

  const now = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Skiftlonn//NO',
    'CALSCALE:GREGORIAN',
    'X-WR-CALNAME:Jobb',
    'X-PUBLISHED-TTL:PT1H',
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
  ];
  for (const s of shifts ?? []) {
    const overnight = s.end_time <= s.start_time;
    lines.push(
      'BEGIN:VEVENT',
      `UID:${s.id}@skiftlonn`,
      `DTSTAMP:${now}`,
      `DTSTART:${stamp(s.date, s.start_time)}`,
      `DTEND:${stamp(overnight ? addDay(s.date) : s.date, s.end_time)}`,
      `SUMMARY:${escape(s.name)}`,
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');

  return new Response(lines.join('\r\n') + '\r\n', {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="jobb.ics"',
      'Cache-Control': 'no-cache',
    },
  });
});
