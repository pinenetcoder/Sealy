// api.js — Supabase leaderboard

const SUPABASE_URL = 'https://rgmgdbljpldjdozkwery.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJnbWdkYmxqcGxkamRvemt3ZXJ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyMDc5MDgsImV4cCI6MjA4Nzc4MzkwOH0.qPMsvedXprt_JtxSpsx6ZLgxu8Qa0DDoI2yDIrMHwH0';

const _H = {
  'Content-Type': 'application/json',
  'apikey': SUPABASE_KEY,
  'Authorization': 'Bearer ' + SUPABASE_KEY,
};

// Find player by nickname, or create a new one.
// Returns { id, nickname, best_time, best_score }
async function registerOrFindPlayer(nickname) {
  const nick = nickname.trim().slice(0, 16);

  const findRes = await fetch(
    `${SUPABASE_URL}/rest/v1/players?nickname=eq.${encodeURIComponent(nick)}&select=id,nickname,best_time,best_score`,
    { headers: _H }
  );
  const found = await findRes.json();
  if (Array.isArray(found) && found.length > 0) return found[0];

  const createRes = await fetch(
    `${SUPABASE_URL}/rest/v1/players`,
    {
      method: 'POST',
      headers: { ..._H, 'Prefer': 'return=representation' },
      body: JSON.stringify({ nickname: nick }),
    }
  );
  const created = await createRes.json();
  return created[0];
}

// Update player's record only if newTime is better than stored.
async function submitScore(playerId, newTime, newScore) {
  await fetch(
    `${SUPABASE_URL}/rest/v1/players?id=eq.${playerId}&best_time=lt.${newTime}`,
    {
      method: 'PATCH',
      headers: { ..._H, 'Prefer': 'return=minimal' },
      body: JSON.stringify({
        best_time:  newTime,
        best_score: newScore,
        updated_at: new Date().toISOString(),
      }),
    }
  );
}

// Fetch top 10 players ordered by best_time descending.
async function fetchLeaderboard() {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/players?select=nickname,best_time,best_score&order=best_time.desc&limit=10`,
    { headers: _H }
  );
  return await res.json();
}
