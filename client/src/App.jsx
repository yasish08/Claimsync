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
  const [notifications, setNotifications] = useState([]);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
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

  const signOut = () => { window.sessionStorage.removeItem("claimsync_token"); setToken(""); setCurrentUser(null); setClaims([]); setNotifications([]); setNotificationsOpen(false); setNotice(""); };

  const loadNotifications = async () => {
    if (!token) return;
    setNotificationsLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/notifications`, { headers: { Authorization: `Bearer ${token}` } });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message || "Could not load notifications.");
      setNotifications(body.data || []);
    } catch (error) {
      setNotice(error.message || "Could not load notifications.");
    } finally {
      setNotificationsLoading(false);
    }
  };

  const toggleNotifications = async () => {
    const opening = !notificationsOpen;
    setNotificationsOpen(opening);
    if (opening) await loadNotifications();
  };

  const markNotificationRead = async (notification) => {
    try {
      const response = await fetch(`${API_URL}/api/notifications/${notification.id}/read`, { method: "PATCH", headers: { Authorization: `Bearer ${token}` } });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message || "Could not update notification.");
      setNotifications((items) => items.map((item) => item.id === notification.id ? { ...item, readAt: new Date().toISOString() } : item));
    } catch (error) { setNotice(error.message || "Could not update notification."); }
  };

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

  if (!token) return (
    <div className="login-shell">
      <div className="login-art"><div className="login-brand"><span className="brand-mark">C</span><span>CLAIM<span>SYNC</span></span></div><div className="login-art-copy"><span className="hero-overline">CLAIMS OPERATIONS, MADE CLEAR</span><h1>Make room for<br/><span>better outcomes.</span></h1><p>A thoughtful workspace for claim priorities, clear ownership, and dependable follow-through.</p><div className="login-art-points"><span>✓ Priority-led workflow</span><span>✓ Role-based access</span><span>✓ Auditable claim history</span></div></div><div className="login-art-orbit"></div></div>
      <form className="login-card" onSubmit={signIn}><span className="section-eyebrow">WELCOME BACK</span><h2>Sign in to CLAIMSYNC</h2><p>Use your workspace administrator or team account.</p><label>Email address<input type="email" autoComplete="username" required value={loginEmail} onChange={(event) => setLoginEmail(event.target.value)} placeholder="you@company.com"/></label><label>Password<input type="password" autoComplete="current-password" required value={loginPassword} onChange={(event) => setLoginPassword(event.target.value)} placeholder="Enter your password"/></label>{loginError && <div className="login-error" role="alert">{loginError}</div>}<button className="login-submit" type="submit">Sign in securely <span>→</span></button><div className="login-foot"><span className="connection-dot online"></span> Protected workspace <span>·</span> JWT authentication</div></form>
    </div>
  );

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
            <button className={`notification-button ${notificationsOpen ? "selected" : ""}`} type="button" aria-label="Notifications" aria-expanded={notificationsOpen} onClick={toggleNotifications}>♧{notifications.some((item) => !item.readAt) && <span className="notification-dot" />}</button>
            <div className="user-chip"><div className="user-avatar">{(currentUser?.name || "CT").slice(0,2).toUpperCase()}</div><div><strong>{currentUser?.name || "Claims Team"}</strong><small>{currentUser?.role || "Team member"}</small></div><button className="signout-button" type="button" onClick={signOut}>Sign out</button></div>
          </div>
        </header>

        {notificationsOpen && <section className="notifications-panel" aria-label="Notifications"><div className="notifications-panel-heading"><div><strong>Notifications</strong><small>{notifications.filter((item) => !item.readAt).length} unread</small></div><button type="button" onClick={loadNotifications} disabled={notificationsLoading}>{notificationsLoading ? "Loading…" : "Refresh"}</button></div>{notificationsLoading && !notifications.length ? <p className="notifications-empty">Loading notifications…</p> : notifications.length ? <ul>{notifications.map((item) => <li key={item.id} className={item.readAt ? "is-read" : "is-unread"}><span className={`notification-kind ${item.kind.toLowerCase()}`}>{item.kind.replaceAll("_", " ")}</span><strong>{item.title}</strong><p>{item.message}</p>{item.claim && <small>{item.claim.claimNumber} · Due {new Date(item.claim.slaDeadline).toLocaleString()}</small>}{!item.readAt && <button type="button" onClick={() => markNotificationRead(item)}>Mark as read</button>}</li>)}</ul> : <p className="notifications-empty">You’re all caught up. SLA alerts and claim notifications will appear here.</p>}</section>}
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
                <div className="metric-value">{metric.label === "Total claims" ? claims.length : metric.label === "Awaiting review" ? claims.filter((claim) => ["SUBMITTED", "UNDER_REVIEW", "NEEDS_INFORMATION"].includes(claim.status)).length : metric.label === "SLA at risk" ? claims.filter((claim) => !["APPROVED", "REJECTED", "CLOSED"].includes(claim.status) && new Date(claim.slaDeadline).getTime() < Date.now() + 24 * 3600000).length : claims.filter((claim) => ["APPROVED", "REJECTED", "CLOSED"].includes(claim.status) && claim.resolvedAt && new Date(claim.resolvedAt).toDateString() === new Date().toDateString()).length}</div>
                <div className="metric-footer"><span>{metric.detail}</span><span className={`mini-chart chart-${metric.tone}`} aria-hidden="true"><i /><i /><i /><i /><i /><i /><i /></span></div>
              </article>
            ))}
          </section>

          <section className="dashboard-grid">
            <article className="surface-card priority-card">
              <div className="surface-heading"><div><span className="section-eyebrow">WHAT MATTERS NEXT</span><h2>Priority queue</h2><p>The right work, in the right order.</p></div><span className="status-pill">LIVE CLAIMS</span></div>
              {claimsLoading ? <div className="claims-empty-state">Loading your claims…</div> : claims.length ? <div className="claims-table-wrap"><table className="claims-table"><thead><tr><th>CLAIM</th><th>PRIORITY</th><th>STATUS</th><th>SLA DEADLINE</th><th>ACTION</th></tr></thead><tbody>{claims.slice(0, 8).map((claim) => <tr key={claim.id}><td><strong>{claim.claimNumber}</strong><small>{claim.claimantName} · {claim.type}</small></td><td><span className={`priority-badge ${claim.priority.toLowerCase()}`}>{claim.priority}</span><small>Score {claim.priorityScore}</small></td><td><span className={`claim-status ${claim.status.toLowerCase()}`}>{claim.status.replaceAll("_", " ")}</span></td><td>{new Date(claim.slaDeadline).toLocaleDateString()}</td><td><select aria-label={`Update status for ${claim.claimNumber}`} value={claim.status} onChange={(event) => changeClaimStatus(claim, event.target.value)}><option value={claim.status}>{claim.status.replaceAll("_", " ")}</option>{({SUBMITTED:["UNDER_REVIEW","CLOSED"],UNDER_REVIEW:["NEEDS_INFORMATION","APPROVED","REJECTED","CLOSED"],NEEDS_INFORMATION:["UNDER_REVIEW","CLOSED"],APPROVED:["CLOSED"],REJECTED:["CLOSED"],CLOSED:[]})[claim.status].filter((status) => !["APPROVED","REJECTED"].includes(status) || ["ADMIN","MANAGER"].includes(currentUser?.role)).map((status) => <option key={status} value={status}>{status.replaceAll("_"," ")}</option>)}</select></td></tr>)}</tbody></table></div> : <div className="empty-queue">
                <div className="queue-art" aria-hidden="true"><div className="queue-paper paper-back" /><div className="queue-paper paper-front"><i /><i /><i /></div><div className="queue-badge">✓</div></div>
                <h3>Your queue is taking shape</h3>
                <p>Submit a claim to see its priority score, service deadline, status, and next available actions here.</p>
                <div className="next-step"><span className="next-step-dot" /><span>Next step</span><b>Submit your first claim</b></div>
              </div>}
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
        {claimFormOpen && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setClaimFormOpen(false); }}><form className="claim-modal" onSubmit={submitClaim}><div className="modal-heading"><div><span className="section-eyebrow">CLAIM INTAKE</span><h2>Submit a new claim</h2><p>Fields are validated by the API before saving.</p></div><button type="button" className="modal-close" onClick={() => setClaimFormOpen(false)} aria-label="Close">×</button></div><div className="claim-form-grid"><label>Claimant name<input required minLength="2" maxLength="120" value={claimForm.claimantName} onChange={(e) => setClaimForm({...claimForm,claimantName:e.target.value})}/></label><label>Claimant email<input required type="email" value={claimForm.claimantEmail} onChange={(e) => setClaimForm({...claimForm,claimantEmail:e.target.value})}/></label><label>Policy number<input required minLength="3" value={claimForm.policyNumber} onChange={(e) => setClaimForm({...claimForm,policyNumber:e.target.value})}/></label><label>Claim type<select value={claimForm.type} onChange={(e) => setClaimForm({...claimForm,type:e.target.value})}><option value="AUTO">Auto</option><option value="HEALTH">Health</option><option value="PROPERTY">Property</option><option value="TRAVEL">Travel</option><option value="LIFE">Life</option><option value="OTHER">Other</option></select></label><label>Estimated amount<input required type="number" min="0.01" step="0.01" value={claimForm.estimatedAmount} onChange={(e) => setClaimForm({...claimForm,estimatedAmount:e.target.value})}/></label><label>SLA deadline<input required type="datetime-local" min={new Date(Date.now()+60000).toISOString().slice(0,16)} value={claimForm.slaDeadline} onChange={(e) => setClaimForm({...claimForm,slaDeadline:e.target.value})}/></label><label>Urgency (1–5)<select value={claimForm.urgency} onChange={(e) => setClaimForm({...claimForm,urgency:Number(e.target.value)})}>{[1,2,3,4,5].map(n=><option key={n} value={n}>{n}</option>)}</select></label><label>Business impact (1–5)<select value={claimForm.businessImpact} onChange={(e) => setClaimForm({...claimForm,businessImpact:Number(e.target.value)})}>{[1,2,3,4,5].map(n=><option key={n} value={n}>{n}</option>)}</select></label><label className="form-wide">Description<textarea required minLength="10" maxLength="5000" rows="3" value={claimForm.description} onChange={(e) => setClaimForm({...claimForm,description:e.target.value})}/></label></div>{claimError && <div className="login-error" role="alert">{claimError}</div>}<div className="modal-actions"><button type="button" className="cancel-button" onClick={() => setClaimFormOpen(false)}>Cancel</button><button type="submit" className="login-submit">Validate & submit claim →</button></div></form></div>}
      </main>
    </div>
  );
}