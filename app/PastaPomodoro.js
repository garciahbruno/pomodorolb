"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "../lib/supabase";

// ── Helpers ──────────────────────────────────────────────────
function getStartOfWeek() {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.getFullYear(), d.getMonth(), diff, 0, 0, 0).toISOString();
}
function getStartOfMonth() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0).toISOString();
}
function fmt(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
function initials(name) {
  if (!name) return "?";
  return name.split(/[\s_]+/).map((w) => w[0]).join("").toUpperCase().slice(0, 2);
}

// ── Theme ────────────────────────────────────────────────────
const c = {
  red: "#C4372E", redDk: "#8B1A14", redLt: "#F5D0CE", redLtr: "#FDF0EF",
  tan: "#F5E6C8", tanDk: "#D4B896", tanDkr: "#A08060",
  cream: "#FDF8EF", brown: "#3D2B1F", brownLt: "#6B4D3A", white: "#FFFDFB",
};

const inputSt = { width: "100%", padding: "11px 14px", borderRadius: 10, border: `1px solid ${c.tanDk}`, fontSize: 15, background: c.cream, color: c.brown, outline: "none", marginBottom: 10, boxSizing: "border-box", fontFamily: "inherit" };
const btnSt = { width: "100%", padding: "11px 0", borderRadius: 10, border: "none", background: c.red, color: "#fff", fontSize: 15, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" };

// ── Avatar component (reusable, clickable for upload) ────────
function Avatar({ url, name, size = 64, editable = false, userId, onUpload }) {
  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file || !userId) return;
    setUploading(true);
    const ext = file.name.split(".").pop();
    const path = `${userId}/avatar.${ext}`;

    // Upload to Supabase Storage
    const { error: upErr } = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
    if (upErr) { setUploading(false); alert("Upload failed: " + upErr.message); return; }

    // Get public URL
    const { data: { publicUrl } } = supabase.storage.from("avatars").getPublicUrl(path);
    // Add cache buster
    const finalUrl = publicUrl + "?t=" + Date.now();

    // Save to profile
    await supabase.from("profiles").update({ avatar_url: finalUrl }).eq("id", userId);
    setUploading(false);
    if (onUpload) onUpload(finalUrl);
  }

  const display = url ? (
    <img src={url} alt="" style={{ width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover" }} />
  ) : (
    initials(name)
  );

  return (
    <div
      onClick={editable ? () => fileRef.current?.click() : undefined}
      title={editable ? "Click to change photo" : undefined}
      style={{
        width: size, height: size, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
        fontWeight: 600, fontSize: size * 0.34, border: `2px solid ${c.red}`, background: c.redLtr, color: c.redDk,
        overflow: "hidden", cursor: editable ? "pointer" : "default", position: "relative", flexShrink: 0,
      }}
    >
      {uploading ? (
        <span style={{ fontSize: size * 0.2, color: c.tanDkr }}>...</span>
      ) : display}
      {editable && (
        <>
          <div style={{
            position: "absolute", bottom: 0, left: 0, right: 0, height: size * 0.3,
            background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <span style={{ color: "#fff", fontSize: size * 0.16, fontWeight: 500 }}>Edit</span>
          </div>
          <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} style={{ display: "none" }} />
        </>
      )}
    </div>
  );
}

// ── LoginPage ────────────────────────────────────────────────
function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function go(e) {
    e.preventDefault();
    setBusy(true);
    setErr("");

    if (isSignUp) {
      if (!username.trim()) { setErr("Username is required"); setBusy(false); return; }
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { username: username.trim() } },
      });
      if (error) { setErr(error.message); setBusy(false); return; }
      // Update the profile with the chosen username
      if (data?.user) {
        await supabase.from("profiles").update({ username: username.trim() }).eq("id", data.user.id);
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) { setErr(error.message); setBusy(false); return; }
    }
    setBusy(false);
  }

  return (
    <div style={{ minHeight: "100vh", background: c.cream, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ background: c.white, borderRadius: 16, border: `1px solid ${c.tanDk}`, padding: "40px 32px", width: "100%", maxWidth: 380, textAlign: "center" }}>
        <div style={{ fontSize: 48, marginBottom: 8 }}>🍝</div>
        <h1 style={{ fontSize: 24, fontWeight: 600, color: c.brown, margin: "0 0 4px" }}>Pomodoro Leaderboard</h1>
        <p style={{ fontSize: 14, color: c.tanDkr, margin: "0 0 28px" }}>Study study study</p>
        <form onSubmit={go}>
          {isSignUp && (
            <input type="text" placeholder="choose a username" value={username} onChange={(e) => setUsername(e.target.value)} required
              style={inputSt} />
          )}
          <input type="email" placeholder="your@email.com" value={email} onChange={(e) => setEmail(e.target.value)} required style={inputSt} />
          <input type="password" placeholder="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} style={inputSt} />
          <button type="submit" disabled={busy} style={{ ...btnSt, opacity: busy ? 0.7 : 1 }}>
            {busy ? "Loading..." : isSignUp ? "Sign up" : "Sign in"}
          </button>
          {err && <p style={{ color: c.red, fontSize: 13, marginTop: 8 }}>{err}</p>}
        </form>
        <p style={{ fontSize: 13, color: c.tanDkr, marginTop: 16, cursor: "pointer" }} onClick={() => { setIsSignUp(!isSignUp); setErr(""); }}>
          {isSignUp ? "Already have an account? Sign in" : "No account? Sign up"}
        </p>
      </div>
    </div>
  );
}

// ── Timer ────────────────────────────────────────────────────
function Timer({ user, onComplete }) {
  const MODES = {
    pomodoro: { label: "Pomodoro", seconds: 50 * 60 },  // TODO: change back to 50 * 60
    short: { label: "Break", seconds: 10 * 60 },         // TODO: change back to 10 * 60
  };

  const [mode, setMode] = useState("pomodoro");
  const [left, setLeft] = useState(MODES.pomodoro.seconds);
  const [on, setOn] = useState(false);
  const [done, setDone] = useState(0);
  const [ringing, setRinging] = useState(false);
  const ref = useRef(null);
  const finishing = useRef(false);

  useEffect(() => () => clearInterval(ref.current), []);

  useEffect(() => {
    clearInterval(ref.current);
    if (on) {
      ref.current = setInterval(() => {
        setLeft((p) => {
          if (p <= 1) { clearInterval(ref.current); finish(); return 0; }
          return p - 1;
        });
      }, 1000);
    }
    return () => clearInterval(ref.current);
  }, [on]);

  function playAlarm() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      [0, 0.4, 0.8, 1.2, 1.6, 2.0].forEach((delay) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.connect(g); g.connect(ctx.destination);
        o.frequency.value = mode === "pomodoro" ? 880 : 523;
        g.gain.value = 0.4;
        o.start(ctx.currentTime + delay);
        o.stop(ctx.currentTime + delay + 0.25);
      });
      setTimeout(() => ctx.close(), 4000);
    } catch {}
  }

  async function finish() {
    if (finishing.current) return;
    finishing.current = true;
    setOn(false);
    setRinging(true);
    playAlarm();

    if (mode === "pomodoro") {
      setDone((d) => d + 1);
      await supabase.from("completions").insert({ user_id: user.id });
      onComplete();
    }

    // Wait 6 seconds while ringing, then switch
    setTimeout(() => {
      const nextMode = mode === "pomodoro" ? "short" : "pomodoro";
      setMode(nextMode);
      setLeft(MODES[nextMode].seconds);
      setRinging(false);
      finishing.current = false;
    }, 6000);
  }

  function switchMode(newMode) {
    if (ringing) return;
    setOn(false);
    clearInterval(ref.current);
    setMode(newMode);
    setLeft(MODES[newMode].seconds);
  }

  const total = MODES[mode].seconds;

  return (
    <div style={{ textAlign: "center", borderRadius: 16, overflow: "hidden" }}>
      <div style={{
        background: ringing ? "#A02A22" : c.red,
        padding: "32px 24px 36px", borderRadius: 16,
        animation: ringing ? "pulse 0.5s ease-in-out infinite alternate" : "none",
      }}>
        <style>{`@keyframes pulse { from { opacity: 1; } to { opacity: 0.7; } }`}</style>

        {/* Mode tabs */}
        <div style={{ display: "flex", justifyContent: "center", gap: 4, marginBottom: 28 }}>
          {Object.entries(MODES).map(([key, val]) => (
            <button key={key} onClick={() => switchMode(key)}
              style={{
                padding: "8px 18px", borderRadius: 8, fontSize: 14, fontWeight: 500,
                cursor: ringing ? "not-allowed" : "pointer", fontFamily: "inherit", border: "none",
                background: mode === key ? "rgba(0,0,0,0.2)" : "transparent",
                color: mode === key ? "#fff" : "rgba(255,255,255,0.7)",
                transition: "all 0.15s",
              }}>
              {val.label}
            </button>
          ))}
        </div>

        {/* Time display */}
        <p style={{
          fontSize: 96, fontWeight: 700, color: "#fff", fontVariantNumeric: "tabular-nums",
          margin: "0 0 28px", lineHeight: 1, letterSpacing: "0.02em",
        }}>
          {ringing ? "00:00" : fmt(left)}
        </p>

        {/* Ringing or Start/Pause */}
        {ringing ? (
          <div style={{ padding: "14px 0" }} />
        ) : (
          <button onClick={() => setOn(!on)}
            style={{
              background: "#fff", color: c.red, border: "none", padding: "14px 64px",
              borderRadius: 10, fontSize: 20, fontWeight: 600, cursor: "pointer",
              fontFamily: "inherit", letterSpacing: "0.08em", textTransform: "uppercase",
              boxShadow: on ? "none" : "0 4px 0 0 rgba(0,0,0,0.15)",
              transform: on ? "translateY(2px)" : "none",
              transition: "all 0.1s",
            }}>
            {on ? "PAUSE" : "START"}
          </button>
        )}
      </div>

      {/* Stats below */}
      <div style={{ padding: "16px 24px", display: "flex", justifyContent: "center", gap: 20, background: c.cream, borderRadius: "0 0 16px 16px" }}>
        <span style={{ fontSize: 13, color: c.tanDkr }}>{done} pomodoro{done !== 1 ? "s" : ""} this session</span>
        <button onClick={() => { if (!ringing) { setOn(false); setLeft(MODES[mode].seconds); } }}
          style={{ fontSize: 13, color: c.brownLt, background: "none", border: "none", cursor: ringing ? "not-allowed" : "pointer", fontFamily: "inherit", textDecoration: "underline" }}>
          Reset
        </button>
      </div>
    </div>
  );
}

// ── Podium ───────────────────────────────────────────────────
function Podium({ leaders }) {
  if (leaders.length < 3) return null;
  const order = [leaders[1], leaders[0], leaders[2]];
  const hts = [75, 100, 55], ranks = [2, 1, 3];
  return (
    <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "center", gap: 8, margin: "20px 0 28px" }}>
      {order.map((u, i) => (
        <div key={u.id} style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <div style={{ width: 48, height: 48, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 600, fontSize: 16, marginBottom: 6, border: "2px solid", overflow: "hidden", borderColor: ranks[i] === 1 ? c.red : c.tanDk, background: ranks[i] === 1 ? c.redLtr : c.tan, color: ranks[i] === 1 ? c.redDk : c.brown }}>
            {u.avatar_url ? <img src={u.avatar_url} alt="" style={{ width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover" }} /> : initials(u.username)}
          </div>
          <p style={{ fontSize: 12, fontWeight: 500, color: c.brown, marginBottom: 2 }}>{u.username || "anon"}</p>
          <p style={{ fontSize: 11, color: c.tanDkr, marginBottom: 4 }}>{u.count} poms</p>
          <div style={{ borderRadius: "8px 8px 0 0", width: 80, height: hts[i], display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: 8, fontSize: 18, fontWeight: 600, background: ranks[i] === 1 ? c.red : c.tanDk, color: ranks[i] === 1 ? "#fff" : c.brown }}>
            {ranks[i]}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Leaderboard ──────────────────────────────────────────────
function Leaderboard({ user, refreshKey }) {
  const [period, setPeriod] = useState("week");
  const [leaders, setLeaders] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    let df = null;
    if (period === "week") df = getStartOfWeek();
    else if (period === "month") df = getStartOfMonth();

    let q = supabase.from("completions").select("user_id, completed_at");
    if (df) q = q.gte("completed_at", df);
    const { data: comps } = await q;
    const { data: profiles } = await supabase.from("profiles").select("*");
    if (!comps || !profiles) { setLoading(false); return; }

    const counts = {};
    comps.forEach((r) => (counts[r.user_id] = (counts[r.user_id] || 0) + 1));
    const board = profiles.map((p) => ({ ...p, count: counts[p.id] || 0 })).filter((p) => p.count > 0).sort((a, b) => b.count - a.count);
    setLeaders(board);
    setLoading(false);
  }, [period, refreshKey]);

  useEffect(() => { load(); }, [load]);

  const thStyle = (align) => ({ textAlign: align || "left", fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase", color: c.tanDkr, fontWeight: 500, padding: "8px 10px", borderBottom: `1px solid ${c.tanDk}` });

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <span style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: c.tanDkr, fontWeight: 500 }}>Rankings</span>
        <div style={{ display: "flex", gap: 4 }}>
          {["week", "month", "all"].map((p) => (
            <button key={p} onClick={() => setPeriod(p)}
              style={{ padding: "5px 13px", borderRadius: 99, fontSize: 12, cursor: "pointer", border: `1px solid ${period === p ? c.red : c.tanDk}`, background: period === p ? c.red : "transparent", color: period === p ? "#fff" : c.brownLt, fontFamily: "inherit", fontWeight: 500 }}>
              {p === "all" ? "All time" : p[0].toUpperCase() + p.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p style={{ textAlign: "center", padding: 40, color: c.tanDkr, fontSize: 14 }}>Loading...</p>
      ) : leaders.length === 0 ? (
        <p style={{ textAlign: "center", padding: 40, color: c.tanDkr, fontSize: 14 }}>No pomodoros yet. Start the timer to get on the board!</p>
      ) : (
        <>
          <Podium leaders={leaders.slice(0, 3)} />
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead><tr><th style={thStyle()}>{"#"}</th><th style={thStyle()}>User</th><th style={thStyle("right")}>Pomodoros</th></tr></thead>
            <tbody>
              {leaders.map((l, i) => (
                <tr key={l.id} style={{ background: l.id === user.id ? c.redLtr : "transparent" }}>
                  <td style={{ padding: 10, borderBottom: `1px solid ${c.tan}`, fontWeight: 600, color: c.red, width: 36 }}>{i + 1}</td>
                  <td style={{ padding: 10, borderBottom: `1px solid ${c.tan}`, color: c.brown }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ width: 30, height: 30, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 600, overflow: "hidden", flexShrink: 0, background: l.id === user.id ? c.redLt : c.tan, color: l.id === user.id ? c.redDk : c.brown }}>
                        {l.avatar_url ? <img src={l.avatar_url} alt="" style={{ width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover" }} /> : initials(l.username)}
                      </div>
                      <div>
                        <span style={{ fontWeight: 500, fontSize: 13 }}>
                          {l.username || "anon"}
                        </span>
                        {l.bio && <span style={{ display: "block", fontSize: 11, color: c.tanDkr }}>{l.bio}</span>}
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: 10, borderBottom: `1px solid ${c.tan}`, textAlign: "right", fontWeight: 500, fontSize: 15, color: c.red }}>{l.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}

// ── Profile ──────────────────────────────────────────────────
function ProfilePage({ user, profile, onUpdate }) {
  const [bio, setBio] = useState(profile?.bio || "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function save() {
    setSaving(true);
    await supabase.from("profiles").update({ bio }).eq("id", user.id);
    setSaving(false);
    setSaved(true);
    onUpdate({ ...profile, bio });
    setTimeout(() => setSaved(false), 2000);
  }

  const labelSt = { display: "block", fontSize: 12, fontWeight: 500, color: c.tanDkr, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" };
  const fieldSt = { width: "100%", padding: "10px 14px", borderRadius: 10, border: `1px solid ${c.tanDk}`, fontSize: 14, fontFamily: "inherit", background: c.cream, color: c.brown, outline: "none", boxSizing: "border-box" };

  return (
    <div style={{ maxWidth: 400 }}>
      <div style={{ marginBottom: 20, textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center" }}>
        <Avatar
          url={profile?.avatar_url}
          name={profile?.username}
          size={80}
          editable={true}
          userId={user.id}
          onUpload={(newUrl) => onUpdate({ ...profile, avatar_url: newUrl })}
        />
        <p style={{ fontSize: 12, color: c.tanDkr, marginTop: 10 }}>{user.email}</p>
      </div>
      <label style={labelSt}>Username</label>
      <div style={{ ...fieldSt, background: c.tan, color: c.brownLt, cursor: "not-allowed" }}>
        {profile?.username || "no username set"}
      </div>
      <label style={{ ...labelSt, marginTop: 14 }}>Bio</label>
      <input value={bio} onChange={(e) => setBio(e.target.value)} style={fieldSt} placeholder="studying for finals..." maxLength={80} />
      <button onClick={save} disabled={saving}
        style={{ width: "100%", marginTop: 16, background: c.red, color: "#fff", border: "none", padding: "10px 32px", borderRadius: 10, fontSize: 15, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>
        {saving ? "Saving..." : saved ? "Saved!" : "Save profile"}
      </button>
    </div>
  );
}

// ── Main App ─────────────────────────────────────────────────
export default function PastaPomodoro() {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [tab, setTab] = useState("leaderboard");
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser(session.user);
        supabase.from("profiles").select("*").eq("id", session.user.id).single().then(({ data }) => {
          setProfile(data);
          setLoading(false);
        });
      } else {
        setLoading(false);
      }
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === "SIGNED_IN" && session?.user) {
        setUser(session.user);
        const { data } = await supabase.from("profiles").select("*").eq("id", session.user.id).single();
        setProfile(data);
        setLoading(false);
      } else if (event === "SIGNED_OUT") {
        setUser(null);
        setProfile(null);
      }
    });
    return () => subscription?.unsubscribe();
  }, []);

  if (loading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", background: c.cream }}>
        <div style={{ fontSize: 40 }}>🍝</div>
        <p style={{ color: c.tanDkr, marginTop: 12, fontSize: 14 }}>Loading...</p>
      </div>
    );
  }

  if (!user) return <LoginPage />;

  return (
    <div style={{ minHeight: "100vh", background: c.cream, display: "flex", justifyContent: "center", padding: "20px 16px" }}>
      <div style={{ width: "100%", maxWidth: 640, background: c.white, borderRadius: 16, border: `1px solid ${c.tanDk}`, overflow: "hidden", alignSelf: "flex-start" }}>
        {/* Topbar */}
        <div style={{ background: c.red, padding: "14px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ color: "#fff", fontSize: 17, fontWeight: 600 }}>Pomodoro Leaderboards</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button onClick={() => supabase.auth.signOut()}
              style={{ background: "rgba(255,255,255,0.2)", border: "none", color: "#fff", padding: "6px 14px", borderRadius: 8, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
              Sign out
            </button>
            <div onClick={() => setTab("profile")} title="Edit profile"
              style={{ width: 34, height: 34, borderRadius: "50%", background: c.tan, border: "2px solid rgba(255,255,255,0.5)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 600, color: c.brown, cursor: "pointer", overflow: "hidden" }}>
              {profile?.avatar_url ? <img src={profile.avatar_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : initials(profile?.username)}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", borderBottom: `1px solid ${c.tanDk}`, background: c.tan }}>
          {["leaderboard", "timer", "profile"].map((t_) => (
            <div key={t_} onClick={() => setTab(t_)}
              style={{ padding: "11px 20px", fontSize: 13, fontWeight: 500, cursor: "pointer", borderBottom: "2px solid", transition: "all 0.15s", color: tab === t_ ? c.red : c.brownLt, borderBottomColor: tab === t_ ? c.red : "transparent", background: tab === t_ ? c.white : "transparent" }}>
              {t_[0].toUpperCase() + t_.slice(1)}
            </div>
          ))}
        </div>

        {/* Content */}
        <div style={{ padding: 20 }}>
          <div style={{ display: tab === "leaderboard" ? "block" : "none" }}>
            <Leaderboard user={user} refreshKey={refreshKey} />
          </div>
          <div style={{ display: tab === "timer" ? "block" : "none" }}>
            <Timer user={user} onComplete={() => setRefreshKey((k) => k + 1)} />
          </div>
          <div style={{ display: tab === "profile" ? "block" : "none" }}>
            <ProfilePage user={user} profile={profile} onUpdate={setProfile} />
          </div>
        </div>
      </div>
    </div>
  );
}