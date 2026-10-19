import { useEffect, useMemo, useState } from "react";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";

const navGroups = [
  { label: "WORKSPACE", items: [
    { icon: "▦", label: "Overview" },
    { icon: "▤", label: "Claims", soon: true },
    { icon: "⇅", label: "Priority queue", soon: true },
    { icon: "＋", label: "Submit a claim", soon: true },
    { icon: "▥", label: "Analytics", soon: true }
  ]},
  { label: "MANAGEMENT", items: [
    { icon: "♙", label: "Agents", soon: true },
    { icon: "◷", label: "SLA settings", soon: true }
  ]}
];

const metrics = [
  { label: "Total claims", value: "—", detail: "Waiting for database connection", icon: "▤", tone: "blue" },
  { label: "Awaiting review", value: "—", detail: "Claim workflow is next", icon: "◷", tone: "amber" },
  { label: "SLA at risk", value: "—", detail: "Deadline tracking is planned", icon: "!", tone: "rose" },
  { label: "Resolved today", value: "—", detail: "Resolution analytics planned", icon: "✓", tone: "mint" }
];

function Glyph({ children, className = "" }) {
  return <span className={`glyph ${className}`} aria-hidden="true">{children}</span>;
}

export default function App() {
  const [api, setApi] = useState({ state: "checking", message: "Checking connection" });
  const [activeNav, setActiveNav] = useState("Overview");
  const [search, setSearch] = useState("");
  const [notice, setNotice] = useState("");
  const [token, setToken] = useState(() => window.sessionStorage.getItem("claimsync_token") || "");
  const [currentUser, setCurrentUser] = useState(null);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [claims, setClaims] = useState([]);
  const [claimsLoading, setClaimsLoading] = useState(false);
  const [claimFormOpen, setClaimFormOpen] = useState(false);
  const [claimError, setClaimError] = useState("");
  const [claimForm, setClaimForm] = useState({ claimantName: "", claimantEmail: "", policyNumber: "", type: "AUTO", description: "", estimatedAmount: "", urgency: 3, businessImpact: 3, slaDeadline: "" });

  useEffect(() => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    fetch(`${API_URL}/api/health`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("API unavailable");
        return response.json();
      })
      .then((data) => setApi({
        state: "online",
        message: `Connected at ${new Date(data.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
      }))
      .catch(() => setApi({ state: "offline", message: "API offline · Start the server to connect" }))
      .finally(() => clearTimeout(timeoutId));

    return () => {
      clearTimeout(timeoutId);
      controller.abort();
    };
  }, []);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setClaimsLoading(true);
    Promise.all([
      fetch(`${API_URL}/api/auth/me`, { headers: { Authorization: `Bearer ${token}` } }),
      fetch(`${API_URL}/api/claims?page=1&pageSize=100`, { headers: { Authorization: `Bearer ${token}` } })
    ]).then(async ([userResponse, claimsResponse]) => {
      if (userResponse.status === 401 || claimsResponse.status === 401) throw new Error("Your session expired. Please sign in again.");
      if (!userResponse.ok || !claimsResponse.ok) throw new Error("Could not load the workspace. Check that the database is migrated.");
      const userBody = await userResponse.json();
      const claimsBody = await claimsResponse.json();
      if (!cancelled) { setCurrentUser(userBody.data.user); setClaims(claimsBody.data || []); }
    }).catch((error) => {
      if (!cancelled) { setNotice(error.message); if (error.message.includes("session expired")) { window.sessionStorage.removeItem("claimsync_token"); setToken(""); setCurrentUser(null); } }
    }).finally(() => { if (!cancelled) setClaimsLoading(false); });
    return () => { cancelled = true; };
  }, [token]);

  const signIn = async (event) => {
    event.preventDefault(); setLoginError("");
    try {
      const response = await fetch(`${API_URL}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: loginEmail, password: loginPassword }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message || "Unable to sign in.");
      window.sessionStorage.setItem("claimsync_token", body.data.token); setCurrentUser(body.data.user); setToken(body.data.token); setLoginPassword("");
    } catch (error) { setLoginError(error.message || "Unable to connect to CLAIMSYNC API."); }
  };

  const signOut = () => { window.sessionStorage.removeItem("claimsync_token"); setToken(""); setCurrentUser(null); setClaims([]); setNotice(""); };

  const submitClaim = async (event) => {
    event.preventDefault(); setClaimError("");
    try {
      const response = await fetch(`${API_URL}/api/claims`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ ...claimForm, estimatedAmount: Number(claimForm.estimatedAmount), urgency: Number(claimForm.urgency), businessImpact: Number(claimForm.businessImpact), slaDeadline: new Date(claimForm.slaDeadline).toISOString() }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message || "Could not submit claim.");
      setClaims((previous) => [body.data, ...previous].sort((a, b) => b.priorityScore - a.priorityScore));
      setClaimFormOpen(false); setClaimForm({ claimantName: "", claimantEmail: "", policyNumber: "", type: "AUTO", description: "", estimatedAmount: "", urgency: 3, businessImpact: 3, slaDeadline: "" }); setNotice(`Claim ${body.data.claimNumber} submitted successfully.`);
    } catch (error) { setClaimError(error.message || "Could not submit claim."); }
  };

  const changeClaimStatus = async (claim, status) => {
    try { const response = await fetch(`${API_URL}/api/claims/${claim.id}/status`, { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ status }) }); const body = await response.json(); if (!response.ok) throw new Error(body.error?.message || "Status update failed."); setClaims((items) => items.map((item) => item.id === claim.id ? { ...item, ...body.data } : item)); setNotice(`${claim.claimNumber} moved to ${status.replaceAll("_", " ").toLowerCase()}.`); } catch (error) { setNotice(error.message); }
  };

  const filteredNav = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return navGroups;
    return navGroups.map((group) => ({
      ...group,
      items: group.items.filter((item) => item.label.toLowerCase().includes(query))
    })).filter((group) => group.items.length > 0);
  }, [search]);

  const selectNav = (item) => {
    if (item.soon) {
      setNotice(`${item.label} will be enabled as that workflow is implemented.`);
      return;
    }
    setActiveNav(item.label);
    setNotice("");
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#overview" onClick={() => selectNav({ label: "Overview" })} aria-label="CLAIMSYNC home">
          <span className="brand-mark">C</span>
          <span className="brand-word">CLAIM<span>SYNC</span><small>CLAIMS OPERATIONS</small></span>
        </a>

        <div className="workspace-switcher">
          <div className="workspace-monogram">N</div>
          <div className="workspace-copy"><strong>Northstar Insurance</strong><small>Operations workspace</small></div>
          <span className="switcher-arrow">⌄</span>
        </div>

        {filteredNav.map((group) => (
          <section className="nav-group" key={group.label}>
            <div className="nav-label">{group.label}</div>
            <nav aria-label={group.label}>
              {group.items.map((item) => (
                <button
                  type="button"
                  key={item.label}
                  className={`nav-item ${activeNav === item.label ? "active" : ""} ${item.soon ? "nav-disabled" : ""}`}
                  onClick={() => selectNav(item)}
                  aria-current={activeNav === item.label ? "page" : undefined}
                >
                  <Glyph>{item.icon}</Glyph><span>{item.label}</span>
                  {item.soon && <small className="soon-label">SOON</small>}
                </button>
              ))}
            </nav>
          </section>
        ))}

        <div className="sidebar-grow" />
        <div className="sidebar-help"><span className="help-mark">?</span><div><strong>Need a hand?</strong><small>Project guide coming soon</small></div><span className="external-mark">↗</span></div>
        <div className="connection-card">
          <span className={`connection-dot ${api.state}`} />
          <div><strong>API connection</strong><small>{api.message}</small></div>
          <span className={`connection-state ${api.state}`}>{api.state === "checking" ? "…" : api.state === "online" ? "●" : "○"}</span>
        </div>
        <div className="sidebar-user"><div className="user-avatar">{(currentUser?.name || "CT").slice(0,2).toUpperCase()}</div><div><strong>{currentUser?.name || "Claims team"}</strong><small>{currentUser?.role || "Local development"}</small></div><button className="signout-mini" type="button" onClick={signOut}>↪</button></div>
      </aside>

      <main className="main-content" id="overview">
        <header className="topbar">
          <div className="mobile-brand"><span className="brand-mark">C</span><strong>CLAIMSYNC</strong></div>
          <div className="breadcrumbs">Workspace <span>/</span> <strong>{activeNav}</strong></div>
          <div className="topbar-tools">
            <label className="search-field"><Glyph>⌕</Glyph><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Find a workspace section…" aria-label="Filter workspace navigation" /><kbd>⌘ K</kbd></label>
            <button className="notification-button" type="button" aria-label="Notifications" onClick={() => setNotice("Notifications will appear here when claim events are connected.")}>♧<span className="notification-dot" /></button>
            <div className="user-chip"><div className="user-avatar">{(currentUser?.name || "CT").slice(0,2).toUpperCase()}</div><div><strong>{currentUser?.name || "Claims Team"}</strong><small>{currentUser?.role || "Team member"}</small></div><button className="signout-button" type="button" onClick={signOut}>Sign out</button></div>
          </div>
        </header>

        <div className="page-content">
          {notice && <div className="notice-banner" role="status"><span>ⓘ</span>{notice}<button type="button" onClick={() => setNotice("")} aria-label="Dismiss message">×</button></div>}

          <section className="welcome-section">
            <div>
              <div className="eyebrow"><span /> CLAIM OPERATIONS PLATFORM</div>
              <h1>A clearer view of <span>every claim.</span></h1>
              <p>Your command center for priorities, service deadlines, and team operations.</p>
            </div>
            <div className="welcome-controls">
              <div className="date-chip"><Glyph>◷</Glyph>{new Date().toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}</div>
              <button className="new-claim-button" type="button" onClick={() => setClaimFormOpen(true)}>＋ New claim</button>
            </div>
          </section>

          <section className="hero-banner">
            <div className="hero-content">
              <div className="hero-overline"><span>✳</span> A MORE THOUGHTFUL WAY TO HANDLE CLAIMS</div>
              <h2>Less chasing.<br /><span>More clarity.</span></h2>
              <p>Keep the work visible, put urgent claims first, and help every case move forward with confidence.</p>
              <div className="hero-trust"><span>✓</span> Designed for clarity, accountability, and follow-through</div>
            </div>
            <div className="hero-visual" aria-hidden="true">
              <div className="hero-halo halo-a" /><div className="hero-halo halo-b" />
              <div className="orbit orbit-a" /><div className="orbit orbit-b" />
              <div className="hero-check"><span>✓</span></div>
              <div className="float-card float-card-a"><span className="float-icon blue">↗</span><span><b>Priority-led</b><small>Focus on what matters</small></span></div>
              <div className="float-card float-card-b"><span className="float-icon green">◷</span><span><b>SLA-aware</b><small>Keep deadlines in view</small></span></div>
              <span className="hero-spark spark-a">✦</span><span className="hero-spark spark-b">✳</span>
            </div>
          </section>

          <section className="section-title-row">
            <div><span className="section-eyebrow">YOUR WORKSPACE</span><h2>Operations overview</h2></div>
            <div className="connection-label"><span className={`tiny-dot ${api.state}`} />{api.state === "online" ? "API connected" : api.state === "checking" ? "Connecting to API" : "Awaiting live data"}</div>
          </section>

          <section className="metrics-grid" aria-label="Claims overview">
            {metrics.map((metric, index) => (
              <article className="metric-card" key={metric.label} style={{ "--stagger": index }}>
                <div className="metric-top"><span>{metric.label}</span><span className={`metric-icon ${metric.tone}`}><Glyph>{metric.icon}</Glyph></span></div>
                <div className="metric-value">{metric.label === "Total claims" ? claims.length : metric.label === "Awaiting review" ? claims.filter((claim) => ["SUBMITTED", "UNDER_REVIEW", "NEEDS_INFORMATION"].includes(claim.status)).length : metric.label === "SLA at risk" ? claims.filter((claim) => !["APPROVED", "REJECTED", "CLOSED"].includes(claim.status) && new Date(claim.slaDeadline).getTime() < Date.now() + 24 * 3600000).length : claims.filter((claim) => claim.status === "CLOSED" && claim.resolvedAt && new Date(claim.resolvedAt).toDateString() === new Date().toDateString()).length}</div>
                <div className="metric-footer"><span>{metric.detail}</span><span className={`mini-chart chart-${metric.tone}`} aria-hidden="true"><i /><i /><i /><i /><i /><i /><i /></span></div>
              </article>
            ))}
          </section>

          <section className="dashboard-grid">
            <article className="surface-card priority-card">
              <div className="surface-heading"><div><span className="section-eyebrow">WHAT MATTERS NEXT</span><h2>Priority queue</h2><p>The right work, in the right order.</p></div><span className="status-pill">IN DEVELOPMENT</span></div>
              <div className="empty-queue">
                <div className="queue-art" aria-hidden="true"><div className="queue-paper paper-back" /><div className="queue-paper paper-front"><i /><i /><i /></div><div className="queue-badge">✓</div></div>
                <h3>Your queue is taking shape</h3>
                <p>Claims will be prioritized using urgency, deadline risk, and business impact when intake and scoring are connected.</p>
                <div className="next-step"><span className="next-step-dot" /><span>Next milestone</span><b>Claim intake + priority scoring</b></div>
              </div>
            </article>

            <article className="surface-card health-card">
              <div className="surface-heading"><div><span className="section-eyebrow">UNDER THE HOOD</span><h2>Platform foundation</h2><p>A transparent view of what is connected.</p></div><span className="health-icon">⌁</span></div>
              <div className="service-list">
                <div className="service-row"><span className="service-icon frontend">◈</span><div><b>Web application</b><small>React + Vite</small></div><span className="service-status ready">READY</span></div>
                <div className="service-row"><span className="service-icon backend">⌘</span><div><b>REST API</b><small>{api.message}</small></div><span className={`service-status ${api.state}`}>{api.state === "online" ? "ONLINE" : api.state === "offline" ? "OFFLINE" : "CHECKING"}</span></div>
                <div className="service-row"><span className="service-icon database">▤</span><div><b>PostgreSQL</b><small>Claim records and audit history</small></div><span className="service-status ready">CONNECTED</span></div>
                <div className="service-row"><span className="service-icon redis">⇄</span><div><b>Redis queue</b><small>Priority processing planned</small></div><span className="service-status planned">PLANNED</span></div>
              </div>
              <div className="health-footer"><span />Small milestones. Verified progress.</div>
            </article>
          </section>

          <section className="closing-note"><span className="closing-icon">✳</span><div><b>Clarity first. Real data always.</b><p>Metrics and queue rows are loaded from the authenticated claims API.</p></div><span className="version-tag">MVP <b>0.1.0</b></span></section>
          <footer className="page-footer"><span><b>CLAIMSYNC</b><i>/</i> Claims operations</span><span>Built for reliable, explainable claims handling.</span></footer>
        </div>
      </main>
    </div>
  );
}