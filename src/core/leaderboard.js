// Shared online leaderboard backed by Supabase (its auto-generated PostgREST API).
// Rankings are by fastest completion time (time_ms ascending).
// ─────────────────────────────────────────────────────────────────────────────

const SUPABASE_URL = "https://accedpndcomrgzhkoorw.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_q772TO8xItRU0-hgzgAYZw_6HzASEyF";

const PLACEHOLDER = /YOUR-/;

// True once the two constants above have been filled in with real values.
export function isConfigured() {
  return !PLACEHOLDER.test(SUPABASE_URL) && !PLACEHOLDER.test(SUPABASE_ANON_KEY);
}

function headers(extra) {
  return {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    ...extra,
  };
}

// Fetch the top scores, fastest first. Returns an array on success, or null on
// error (so callers can tell "no scores yet" apart from "couldn't reach server").
export async function fetchTop(limit = 10) {
  if (!isConfigured()) return null;
  try {
    const url = `${SUPABASE_URL}/rest/v1/scores` +
      `?select=name,time_ms,kills,deaths,created_at&order=time_ms.asc&limit=${limit}`;
    const res = await fetch(url, { headers: headers() });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (e) {
    console.warn("[leaderboard] fetch failed:", e);
    return null;
  }
}

// Insert one run. Returns true on success, false on any failure.
export async function submitScore({ name, timeMs, kills, deaths }) {
  if (!isConfigured()) return false;
  const clean = (name || "").trim().slice(0, 20) || "ANON";
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/scores`, {
      method: "POST",
      headers: headers({ "Content-Type": "application/json", Prefer: "return=minimal" }),
      body: JSON.stringify({
        name: clean,
        time_ms: Math.max(0, Math.round(timeMs)),
        kills: Math.max(0, Math.round(kills)),
        deaths: Math.max(0, Math.round(deaths)),
      }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return true;
  } catch (e) {
    console.warn("[leaderboard] submit failed:", e);
    return false;
  }
}

// Milliseconds → "m:ss".
export function formatTime(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
