import { useState, useEffect, useRef, useCallback } from "react";

// ============================================================
// CONFIG — your Supabase credentials
// ============================================================
const SUPABASE_URL = "https://jrnwdratwfjxyfzayyhe.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpybndkcmF0d2ZqeHlmemF5eWhlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYwNDIyMDAsImV4cCI6MjA5MTYxODIwMH0.XSWYQQBldikEU6K5mDCABbdD6LLM4KVxO8QssczakP8";

// ============================================================
// Minimal Supabase client (no npm needed)
// ============================================================
function createClient(url, key) {
  const headers = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };
  let accessToken = null;
  let currentUser = null;
  let listeners = [];

  function authHeaders() {
    const h = { ...headers };
    if (accessToken) h.Authorization = `Bearer ${accessToken}`;
    return h;
  }

  async function refreshSession() {
    const stored = localStorage.getItem("sb-session");
    if (!stored) return null;
    const session = JSON.parse(stored);
    if (!session?.refresh_token) return null;
    try {
      const res = await fetch(`${url}/auth/v1/token?grant_type=refresh_token`, {
        method: "POST",
        headers,
        body: JSON.stringify({ refresh_token: session.refresh_token }),
      });
      if (!res.ok) {
        localStorage.removeItem("sb-session");
        return null;
      }
      const data = await res.json();
      accessToken = data.access_token;
      localStorage.setItem(
        "sb-session",
        JSON.stringify({
          access_token: data.access_token,
          refresh_token: data.refresh_token,
          user: data.user,
        })
      );
      currentUser = data.user;
      return data;
    } catch {
      return null;
    }
  }

  return {
    auth: {
      async signInWithOtp({ email }) {
        const res = await fetch(`${url}/auth/v1/otp`, {
          method: "POST",
          headers,
          body: JSON.stringify({ email }),
        });
        return { error: res.ok ? null : await res.json() };
      },
      async getSession() {
        if (accessToken && currentUser)
          return {
            data: {
              session: { access_token: accessToken, user: currentUser },
            },
          };
        const s = await refreshSession();
        if (s) return { data: { session: s } };
        return { data: { session: null } };
      },
      async getUser() {
        if (!accessToken) {
          const s = await refreshSession();
          if (!s) return { data: { user: null } };
        }
        return { data: { user: currentUser } };
      },
      async signOut() {
        try {
          await fetch(`${url}/auth/v1/logout`, {
            method: "POST",
            headers: authHeaders(),
          });
        } catch {}
        accessToken = null;
        currentUser = null;
        localStorage.removeItem("sb-session");
        listeners.forEach((fn) => fn("SIGNED_OUT", null));
      },
      onAuthStateChange(callback) {
        listeners.push(callback);
        // check hash for magic link callback
        const hash = window.location.hash;
        if (hash && hash.includes("access_token")) {
          const params = new URLSearchParams(hash.substring(1));
          const at = params.get("access_token");
          const rt = params.get("refresh_token");
          if (at) {
            accessToken = at;
            // decode user from JWT
            try {
              const payload = JSON.parse(atob(at.split(".")[1]));
              currentUser = { id: payload.sub, email: payload.email };
            } catch {}
            localStorage.setItem(
              "sb-session",
              JSON.stringify({
                access_token: at,
                refresh_token: rt,
                user: currentUser,
              })
            );
            window.history.replaceState(null, "", window.location.pathname);
            callback("SIGNED_IN", { access_token: at, user: currentUser });
          }
        } else {
          refreshSession().then((s) => {
            if (s) callback("SIGNED_IN", s);
          });
        }
        return {
          data: {
            subscription: {
              unsubscribe: () => {
                listeners = listeners.filter((fn) => fn !== callback);
              },
            },
          },
        };
      },
    },
    from(table) {
      let query = `${url}/rest/v1/${table}`;
      let filters = [];
      let selectStr = "*";
      let orderStr = "";
      let limitStr = "";
      let method = "GET";
      let body = null;
      let isSingle = false;
      let isCount = false;
      let extraHeaders = {};

      const builder = {
        select(cols = "*", opts) {
          selectStr = cols;
          method = "GET";
          if (opts?.count === "exact") {
            isCount = true;
            extraHeaders["Prefer"] = "count=exact";
          }
          return builder;
        },
        insert(data) {
          method = "POST";
          body = data;
          return builder;
        },
        update(data) {
          method = "PATCH";
          body = data;
          return builder;
        },
        eq(col, val) {
          filters.push(`${col}=eq.${val}`);
          return builder;
        },
        gte(col, val) {
          filters.push(`${col}=gte.${val}`);
          return builder;
        },
        lte(col, val) {
          filters.push(`${col}=lte.${val}`);
          return builder;
        },
        order(col, { ascending = true } = {}) {
          orderStr = `&order=${col}.${ascending ? "asc" : "desc"}`;
          return builder;
        },
        limit(n) {
          limitStr = `&limit=${n}`;
          return builder;
        },
        single() {
          isSingle = true;
          return builder;
        },
        async then(resolve) {
          let finalUrl = `${query}?select=${encodeURIComponent(selectStr)}`;
          filters.forEach((f) => (finalUrl += `&${f}`));
          finalUrl += orderStr + limitStr;

          const h = { ...authHeaders(), ...extraHeaders };
          if (method === "POST") h["Prefer"] = "return=representation";
          if (method === "PATCH") h["Prefer"] = "return=representation";

          try {
            const res = await fetch(finalUrl, {
              method,
              headers: h,
              body: body ? JSON.stringify(body) : undefined,
            });
            const text = await res.text();
            let data = text ? JSON.parse(text) : null;
            if (isSingle && Array.isArray(data)) data = data[0] || null;
            resolve({ data, error: res.ok ? null : data, count: res.headers.get('content-range')?.split('/')[1] });
          } catch (err) {
            resolve({ data: null, error: err });
          }
        },
      };
      return builder;
    },
    rpc(fnName, params) {
      return fetch(`${url}/rest/v1/rpc/${fnName}`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(params),
      }).then((r) => r.json());
    },
  };
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============================================================
// Helpers
// ============================================================
function getStartOfWeek() {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d.setDate(diff));
  monday.setHours(0, 0, 0, 0);
  return monday.toISOString();
}
function getStartOfMonth() {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}
function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}
function getInitials(name) {
  if (!name) return "?";
  return name
    .split(/[\s_]+/)
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

// ============================================================
// Styles
// ============================================================
const theme = {
  red: "#C4372E",
  redDark: "#8B1A14",
  redLight: "#F5D0CE",
  redLighter: "#FDF0EF",
  tan: "#F5E6C8",
  tanDark: "#D4B896",
  tanDarker: "#A08060",
  cream: "#FDF8EF",
  brown: "#3D2B1F",
  brownLight: "#6B4D3A",
  white: "#FFFDFB",
};

// ============================================================
// Components
// ============================================================

function LoginPage({ onLogin }) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const { error } = await supabase.auth.signInWithOtp({ email });
    setLoading(false);
    if (error) {
      setError("Something went wrong. Try again.");
    } else {
      setSent(true);
    }
  }

  return (
    <div style={styles.loginWrapper}>
      <div style={styles.loginCard}>
        <div style={styles.loginLogo}>🍝</div>
        <h1 style={styles.loginTitle}>Pasta Pomodoro</h1>
        <p style={styles.loginSub}>Focus. Rank. Repeat.</p>
        {sent ? (
          <div style={styles.sentBox}>
            <p style={{ fontSize: 15, color: theme.brown, fontWeight: 500 }}>
              Check your email
            </p>
            <p style={{ fontSize: 13, color: theme.brownLight, marginTop: 6 }}>
              We sent a magic link to <strong>{email}</strong>. Click it to sign
              in.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ width: "100%" }}>
            <input
              type="email"
              placeholder="your@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              style={styles.loginInput}
            />
            <button
              type="submit"
              disabled={loading}
              style={{
                ...styles.loginBtn,
                opacity: loading ? 0.7 : 1,
              }}
            >
              {loading ? "Sending..." : "Send magic link"}
            </button>
            {error && (
              <p style={{ color: theme.red, fontSize: 13, marginTop: 8 }}>
                {error}
              </p>
            )}
          </form>
        )}
      </div>
    </div>
  );
}

function Timer({ user, profile, onComplete }) {
  const WORK_TIME = 50 * 60;
  const BREAK_TIME = 10 * 60;

  const [secondsLeft, setSecondsLeft] = useState(WORK_TIME);
  const [isRunning, setIsRunning] = useState(false);
  const [isBreak, setIsBreak] = useState(false);
  const [cyclesDone, setCyclesDone] = useState(0);
  const intervalRef = useRef(null);
  const audioRef = useRef(null);

  useEffect(() => {
    return () => clearInterval(intervalRef.current);
  }, []);

  useEffect(() => {
    if (isRunning) {
      intervalRef.current = setInterval(() => {
        setSecondsLeft((prev) => {
          if (prev <= 1) {
            clearInterval(intervalRef.current);
            handleTimerEnd();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      clearInterval(intervalRef.current);
    }
    return () => clearInterval(intervalRef.current);
  }, [isRunning, isBreak]);

  async function handleTimerEnd() {
    // play a sound
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = isBreak ? 523 : 440;
      gain.gain.value = 0.3;
      osc.start();
      setTimeout(() => osc.stop(), 300);
    } catch {}

    if (!isBreak) {
      // Work session complete — log it
      setCyclesDone((c) => c + 1);
      await supabase
        .from("completions")
        .insert({ user_id: user.id });
      onComplete();
      // switch to break
      setIsBreak(true);
      setSecondsLeft(BREAK_TIME);
      setIsRunning(true);
    } else {
      // Break complete — back to work
      setIsBreak(false);
      setSecondsLeft(WORK_TIME);
      setIsRunning(false);
    }
  }

  function toggleTimer() {
    setIsRunning(!isRunning);
  }

  function resetTimer() {
    setIsRunning(false);
    setIsBreak(false);
    setSecondsLeft(WORK_TIME);
  }

  const progress = isBreak
    ? 1 - secondsLeft / BREAK_TIME
    : 1 - secondsLeft / WORK_TIME;

  return (
    <div style={styles.timerSection}>
      <div
        style={{
          ...styles.timerProgressBg,
          background: isBreak ? theme.tan : theme.redLighter,
        }}
      >
        <div
          style={{
            ...styles.timerProgressFill,
            width: `${progress * 100}%`,
            background: isBreak ? theme.tanDark : theme.red,
          }}
        />
      </div>
      <p style={styles.timerLabel}>
        {isBreak ? "Break time" : "Focus session"}
      </p>
      <p style={styles.timerDisplay}>{formatTime(secondsLeft)}</p>
      <p style={{ fontSize: 13, color: theme.tanDarker, marginBottom: 16 }}>
        {cyclesDone} pomodoro{cyclesDone !== 1 ? "s" : ""} completed today
      </p>
      <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
        <button onClick={toggleTimer} style={styles.timerBtn}>
          {isRunning ? "Pause" : "Start"}
        </button>
        <button
          onClick={resetTimer}
          style={{ ...styles.timerBtn, ...styles.timerBtnSecondary }}
        >
          Reset
        </button>
      </div>
    </div>
  );
}

function Podium({ leaders }) {
  if (leaders.length < 3) return null;
  const order = [leaders[1], leaders[0], leaders[2]];
  const heights = [75, 100, 55];
  const ranks = [2, 1, 3];

  return (
    <div style={styles.podium}>
      {order.map((user, i) => (
        <div key={user.id} style={styles.podiumSlot}>
          <div
            style={{
              ...styles.podiumAvatar,
              borderColor: ranks[i] === 1 ? theme.red : theme.tanDark,
              background: ranks[i] === 1 ? theme.redLighter : theme.tan,
              color: ranks[i] === 1 ? theme.redDark : theme.brown,
            }}
          >
            {user.avatar_url ? (
              <img
                src={user.avatar_url}
                style={{
                  width: "100%",
                  height: "100%",
                  borderRadius: "50%",
                  objectFit: "cover",
                }}
              />
            ) : (
              getInitials(user.username)
            )}
          </div>
          <p style={styles.podiumName}>{user.username || "anon"}</p>
          <p style={styles.podiumCount}>{user.count} poms</p>
          <div
            style={{
              ...styles.podiumBar,
              height: heights[i],
              background: ranks[i] === 1 ? theme.red : theme.tanDark,
              color: ranks[i] === 1 ? "#fff" : theme.brown,
            }}
          >
            {ranks[i]}
          </div>
        </div>
      ))}
    </div>
  );
}

function Leaderboard({ user }) {
  const [period, setPeriod] = useState("week");
  const [leaders, setLeaders] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchLeaderboard = useCallback(async () => {
    setLoading(true);
    let dateFilter = null;
    if (period === "week") dateFilter = getStartOfWeek();
    else if (period === "month") dateFilter = getStartOfMonth();

    // Fetch all completions (filtered by date if needed) and aggregate client-side
    let query = supabase.from("completions").select("user_id, completed_at");
    if (dateFilter) query = query.gte("completed_at", dateFilter);

    const { data: completions } = await query;
    const { data: profiles } = await supabase.from("profiles").select("*");

    if (!completions || !profiles) {
      setLoading(false);
      return;
    }

    // Count per user
    const counts = {};
    completions.forEach((c) => {
      counts[c.user_id] = (counts[c.user_id] || 0) + 1;
    });

    // Merge with profiles
    const board = profiles
      .map((p) => ({
        ...p,
        count: counts[p.id] || 0,
      }))
      .filter((p) => p.count > 0)
      .sort((a, b) => b.count - a.count);

    setLeaders(board);
    setLoading(false);
  }, [period]);

  useEffect(() => {
    fetchLeaderboard();
  }, [fetchLeaderboard]);

  // expose refresh
  useEffect(() => {
    window.__refreshLeaderboard = fetchLeaderboard;
  }, [fetchLeaderboard]);

  return (
    <div>
      <div style={styles.lbHeader}>
        <span
          style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: theme.tanDarker, fontWeight: 500 }}
        >
          Rankings
        </span>
        <div style={{ display: "flex", gap: 4 }}>
          {["week", "month", "all"].map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              style={{
                ...styles.pill,
                ...(period === p ? styles.pillActive : {}),
              }}
            >
              {p === "all" ? "All time" : p.charAt(0).toUpperCase() + p.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p style={{ textAlign: "center", padding: 40, color: theme.tanDarker, fontSize: 14 }}>
          Loading...
        </p>
      ) : leaders.length === 0 ? (
        <p style={{ textAlign: "center", padding: 40, color: theme.tanDarker, fontSize: 14 }}>
          No pomodoros yet. Start the timer to get on the board!
        </p>
      ) : (
        <>
          <Podium leaders={leaders.slice(0, 3)} />
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>#</th>
                <th style={styles.th}>Player</th>
                <th style={{ ...styles.th, textAlign: "right" }}>Pomodoros</th>
              </tr>
            </thead>
            <tbody>
              {leaders.map((l, i) => (
                <tr
                  key={l.id}
                  style={{
                    background: l.id === user.id ? theme.redLighter : "transparent",
                  }}
                >
                  <td style={{ ...styles.td, ...styles.rank }}>{i + 1}</td>
                  <td style={styles.td}>
                    <div style={styles.userCell}>
                      <div
                        style={{
                          ...styles.tableAvatar,
                          background: l.id === user.id ? theme.redLight : theme.tan,
                          color: l.id === user.id ? theme.redDark : theme.brown,
                        }}
                      >
                        {l.avatar_url ? (
                          <img
                            src={l.avatar_url}
                            style={{
                              width: "100%",
                              height: "100%",
                              borderRadius: "50%",
                              objectFit: "cover",
                            }}
                          />
                        ) : (
                          getInitials(l.username)
                        )}
                      </div>
                      <div>
                        <span style={{ fontWeight: 500, fontSize: 13 }}>
                          {l.username || "anon"}
                          {l.id === user.id && (
                            <span
                              style={{
                                color: theme.red,
                                fontSize: 11,
                                marginLeft: 6,
                              }}
                            >
                              (you)
                            </span>
                          )}
                        </span>
                        {l.bio && (
                          <span
                            style={{
                              display: "block",
                              fontSize: 11,
                              color: theme.tanDarker,
                            }}
                          >
                            {l.bio}
                          </span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td
                    style={{
                      ...styles.td,
                      textAlign: "right",
                      fontWeight: 500,
                      fontSize: 15,
                      color: theme.red,
                    }}
                  >
                    {l.count}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}

function ProfilePage({ user, profile, onUpdate }) {
  const [username, setUsername] = useState(profile?.username || "");
  const [bio, setBio] = useState(profile?.bio || "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    setSaving(true);
    await supabase
      .from("profiles")
      .update({ username, bio })
      .eq("id", user.id);
    setSaving(false);
    setSaved(true);
    onUpdate({ ...profile, username, bio });
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div style={{ maxWidth: 400 }}>
      <div style={{ marginBottom: 20 }}>
        <div
          style={{
            ...styles.podiumAvatar,
            width: 64,
            height: 64,
            fontSize: 22,
            margin: "0 auto 12px",
            borderColor: theme.red,
            background: theme.redLighter,
            color: theme.redDark,
          }}
        >
          {getInitials(username || profile?.username)}
        </div>
        <p
          style={{
            textAlign: "center",
            fontSize: 12,
            color: theme.tanDarker,
          }}
        >
          {user.email}
        </p>
      </div>
      <label style={styles.fieldLabel}>Username</label>
      <input
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        style={styles.fieldInput}
        placeholder="your_username"
      />
      <label style={{ ...styles.fieldLabel, marginTop: 14 }}>Bio</label>
      <input
        value={bio}
        onChange={(e) => setBio(e.target.value)}
        style={styles.fieldInput}
        placeholder="studying for finals..."
        maxLength={80}
      />
      <button
        onClick={handleSave}
        disabled={saving}
        style={{ ...styles.timerBtn, width: "100%", marginTop: 16 }}
      >
        {saving ? "Saving..." : saved ? "Saved!" : "Save profile"}
      </button>
    </div>
  );
}

// ============================================================
// Main App
// ============================================================
export default function App() {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [tab, setTab] = useState("leaderboard");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === "SIGNED_IN" && session?.user) {
        setUser(session.user);
        // Fetch profile
        const { data: p } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", session.user.id)
          .single();
        setProfile(p);
        setLoading(false);
      } else if (event === "SIGNED_OUT") {
        setUser(null);
        setProfile(null);
        setLoading(false);
      }
    });
    // also check existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) setLoading(false);
    });
    return () => data?.subscription?.unsubscribe();
  }, []);

  function handleComplete() {
    if (window.__refreshLeaderboard) window.__refreshLeaderboard();
  }

  if (loading) {
    return (
      <div style={styles.loadingScreen}>
        <div style={{ fontSize: 40 }}>🍝</div>
        <p style={{ color: theme.tanDarker, marginTop: 12, fontSize: 14 }}>
          Loading...
        </p>
      </div>
    );
  }

  if (!user) return <LoginPage />;

  return (
    <div style={styles.appWrapper}>
      <div style={styles.appFrame}>
        {/* Top bar */}
        <div style={styles.topbar}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 22 }}>🍝</span>
            <span style={styles.topbarTitle}>Pasta Pomodoro</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button
              onClick={() => supabase.auth.signOut()}
              style={styles.topbarBtn}
            >
              Sign out
            </button>
            <div
              style={styles.topbarAvatar}
              onClick={() => setTab("profile")}
              title="Edit profile"
            >
              {getInitials(profile?.username)}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div style={styles.tabs}>
          {["leaderboard", "timer", "profile"].map((t) => (
            <div
              key={t}
              onClick={() => setTab(t)}
              style={{
                ...styles.tab,
                ...(tab === t ? styles.tabActive : {}),
              }}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </div>
          ))}
        </div>

        {/* Content */}
        <div style={styles.content}>
          {tab === "leaderboard" && <Leaderboard user={user} />}
          {tab === "timer" && (
            <Timer
              user={user}
              profile={profile}
              onComplete={handleComplete}
            />
          )}
          {tab === "profile" && (
            <ProfilePage
              user={user}
              profile={profile}
              onUpdate={setProfile}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Styles object
// ============================================================
const styles = {
  loadingScreen: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "100vh",
    background: theme.cream,
    fontFamily: "'DM Sans', system-ui, sans-serif",
  },
  appWrapper: {
    minHeight: "100vh",
    background: theme.cream,
    fontFamily: "'DM Sans', system-ui, sans-serif",
    color: theme.brown,
    display: "flex",
    justifyContent: "center",
    padding: "20px 16px",
  },
  appFrame: {
    width: "100%",
    maxWidth: 640,
    background: theme.white,
    borderRadius: 16,
    border: `1px solid ${theme.tanDark}`,
    overflow: "hidden",
    alignSelf: "flex-start",
  },
  topbar: {
    background: theme.red,
    padding: "14px 20px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  topbarTitle: {
    color: "#fff",
    fontSize: 17,
    fontWeight: 600,
    letterSpacing: "0.01em",
  },
  topbarBtn: {
    background: "rgba(255,255,255,0.2)",
    border: "none",
    color: "#fff",
    padding: "6px 14px",
    borderRadius: 8,
    fontSize: 13,
    cursor: "pointer",
    fontFamily: "inherit",
  },
  topbarAvatar: {
    width: 34,
    height: 34,
    borderRadius: "50%",
    background: theme.tan,
    border: "2px solid rgba(255,255,255,0.5)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 13,
    fontWeight: 600,
    color: theme.brown,
    cursor: "pointer",
  },
  tabs: {
    display: "flex",
    borderBottom: `1px solid ${theme.tanDark}`,
    background: theme.tan,
  },
  tab: {
    padding: "11px 20px",
    fontSize: 13,
    fontWeight: 500,
    color: theme.brownLight,
    cursor: "pointer",
    borderBottom: "2px solid transparent",
    transition: "all 0.15s",
  },
  tabActive: {
    color: theme.red,
    borderBottomColor: theme.red,
    background: theme.white,
  },
  content: {
    padding: 20,
  },
  // Leaderboard
  lbHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  pill: {
    padding: "5px 13px",
    borderRadius: 99,
    fontSize: 12,
    cursor: "pointer",
    border: `1px solid ${theme.tanDark}`,
    background: "transparent",
    color: theme.brownLight,
    fontFamily: "inherit",
    fontWeight: 500,
  },
  pillActive: {
    background: theme.red,
    color: "#fff",
    borderColor: theme.red,
  },
  podium: {
    display: "flex",
    alignItems: "flex-end",
    justifyContent: "center",
    gap: 8,
    margin: "20px 0 28px",
  },
  podiumSlot: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
  },
  podiumAvatar: {
    width: 48,
    height: 48,
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 600,
    fontSize: 16,
    marginBottom: 6,
    border: "2px solid",
    overflow: "hidden",
  },
  podiumName: {
    fontSize: 12,
    fontWeight: 500,
    color: theme.brown,
    marginBottom: 2,
  },
  podiumCount: {
    fontSize: 11,
    color: theme.tanDarker,
    marginBottom: 4,
  },
  podiumBar: {
    borderRadius: "8px 8px 0 0",
    width: 80,
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "center",
    paddingTop: 8,
    fontSize: 18,
    fontWeight: 600,
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: 13,
  },
  th: {
    textAlign: "left",
    fontSize: 11,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: theme.tanDarker,
    fontWeight: 500,
    padding: "8px 10px",
    borderBottom: `1px solid ${theme.tanDark}`,
  },
  td: {
    padding: "10px",
    borderBottom: `1px solid ${theme.tan}`,
    color: theme.brown,
  },
  rank: {
    fontWeight: 600,
    color: theme.red,
    width: 36,
  },
  userCell: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  tableAvatar: {
    width: 30,
    height: 30,
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 11,
    fontWeight: 600,
    overflow: "hidden",
    flexShrink: 0,
  },
  // Timer
  timerSection: {
    textAlign: "center",
    padding: "24px 16px",
    background: theme.cream,
    borderRadius: 12,
  },
  timerProgressBg: {
    height: 6,
    borderRadius: 3,
    marginBottom: 20,
    overflow: "hidden",
  },
  timerProgressFill: {
    height: "100%",
    borderRadius: 3,
    transition: "width 1s linear",
  },
  timerLabel: {
    fontSize: 13,
    color: theme.tanDarker,
    marginBottom: 4,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    fontWeight: 500,
  },
  timerDisplay: {
    fontSize: 56,
    fontWeight: 600,
    color: theme.red,
    fontVariantNumeric: "tabular-nums",
    margin: "8px 0 8px",
    lineHeight: 1,
  },
  timerBtn: {
    background: theme.red,
    color: "#fff",
    border: "none",
    padding: "10px 32px",
    borderRadius: 10,
    fontSize: 15,
    fontWeight: 500,
    cursor: "pointer",
    fontFamily: "inherit",
    transition: "opacity 0.15s",
  },
  timerBtnSecondary: {
    background: "transparent",
    color: theme.brownLight,
    border: `1px solid ${theme.tanDark}`,
  },
  // Login
  loginWrapper: {
    minHeight: "100vh",
    background: theme.cream,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "'DM Sans', system-ui, sans-serif",
    padding: 20,
  },
  loginCard: {
    background: theme.white,
    borderRadius: 16,
    border: `1px solid ${theme.tanDark}`,
    padding: "40px 32px",
    width: "100%",
    maxWidth: 380,
    textAlign: "center",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
  },
  loginLogo: {
    fontSize: 48,
    marginBottom: 8,
  },
  loginTitle: {
    fontSize: 24,
    fontWeight: 600,
    color: theme.brown,
    margin: "0 0 4px",
  },
  loginSub: {
    fontSize: 14,
    color: theme.tanDarker,
    margin: "0 0 28px",
  },
  loginInput: {
    width: "100%",
    padding: "11px 14px",
    borderRadius: 10,
    border: `1px solid ${theme.tanDark}`,
    fontSize: 15,
    fontFamily: "inherit",
    background: theme.cream,
    color: theme.brown,
    outline: "none",
    marginBottom: 10,
    boxSizing: "border-box",
  },
  loginBtn: {
    width: "100%",
    padding: "11px 0",
    borderRadius: 10,
    border: "none",
    background: theme.red,
    color: "#fff",
    fontSize: 15,
    fontWeight: 500,
    cursor: "pointer",
    fontFamily: "inherit",
  },
  sentBox: {
    background: theme.cream,
    borderRadius: 10,
    padding: "20px 16px",
    border: `1px solid ${theme.tanDark}`,
    width: "100%",
  },
  // Profile
  fieldLabel: {
    display: "block",
    fontSize: 12,
    fontWeight: 500,
    color: theme.tanDarker,
    marginBottom: 4,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  },
  fieldInput: {
    width: "100%",
    padding: "10px 14px",
    borderRadius: 10,
    border: `1px solid ${theme.tanDark}`,
    fontSize: 14,
    fontFamily: "inherit",
    background: theme.cream,
    color: theme.brown,
    outline: "none",
    boxSizing: "border-box",
  },
};