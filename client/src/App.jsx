import { useEffect, useState } from "react";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";

const initialMetrics = [
  { label: "Open claims", value: "—", note: "Awaiting live claim data", icon: "◫" },
  { label: "High priority", value: "—", note: "Priority queue will appear here", icon: "↗" },
  { label: "SLA at risk", value: "—", note: "Deadline monitoring planned", icon: "◷" },
  { label: "Resolved today", value: "—", note: "Resolution analytics planned", icon: "✓" }
];

export default function App() {
  const [api, setApi] = useState({ state: "checking", message: "Checking API…" });

  useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    fetch(`${API_URL}/api/health`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("API returned an error");
        return response.json();
      })
      .then((data) => setApi({
        state: "online",
        message: `API online · ${new Date(data.timestamp).toLocaleTimeString()}`
      }))
      .catch(() => setApi({
        state: "offline",
        message: "API offline · Start the server to connect"
      }))
      .finally(() => clearTimeout(timeout));

    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, []);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="/" aria-label="CLAIMSYNC home">
          <span className="brand-mark">C</span>
          <span>CLAIM<span className="brand-light">SYNC</span><small>CLAIMS OPERATIONS</small></span>
        </a>
        <div className="nav-label">WORKSPACE</div>
        <nav aria-label="Main navigation">
          <a className="nav-item active" href="#overview"><span>▦</span> Overview</a>
          <a className="nav-item disabled" href="#claims" aria-disabled="true"><span>▤</span> Claims <em>SOON</em></a>
          <a className="nav-item disabled" href="#queue" aria-disabled="true"><span>⇅</span> Priority queue <em>SOON</em></a>
          <a className="nav-item disabled" href="#team" aria-disabled="true"><span>♙</span> Team workload <em>SOON</em></a>
          <a className="nav-item disabled" href="#analytics" aria-disabled="true"><span>▥</span> Analytics <em>SOON</em></a>
        </nav>
        <div className="sidebar-bottom">
          <span className={`status-dot ${api.state}`}></span>
          <div><strong>System status</strong><small>{api.message}</small></div>
        </div>
      </aside>

      <main className="main-content" id="overview">
        <header className="topbar">
          <div className="breadcrumb">Workspace <span>/</span> Overview</div>
          <div className="topbar-right"><span className="env-tag">DEVELOPMENT</span><div className="avatar">CS</div></div>
        </header>

        <section className="welcome">
          <div>
            <div className="eyebrow"><span className="eyebrow-line"></span> INTELLIGENT CLAIMS OPERATIONS</div>
            <h1>Claims command center<span>.</span></h1>
            <p>One clear view of claim priorities, service deadlines, and team operations.</p>
          </div>
          <div className="date-chip">{new Date().toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" })}</div>
        </section>

        <section className="metrics-grid" aria-label="Claims metrics">
          {initialMetrics.map((metric) => (
            <article className="metric-card" key={metric.label}>
              <div className="metric-top"><span>{metric.label}</span><span className="metric-icon">{metric.icon}</span></div>
              <div className="metric-value">{metric.value}</div>
              <p>{metric.note}</p>
            </article>
          ))}
        </section>

        <section className="content-grid">
          <article className="panel queue-panel">
            <div className="panel-heading"><div><span className="section-kicker">OPERATIONS</span><h2>Priority queue</h2></div><span className="coming-tag">IN DEVELOPMENT</span></div>
            <div className="empty-state">
              <div className="empty-icon">⇅</div>
              <h3>Your queue starts here</h3>
              <p>Claims will be ranked by urgency, deadline risk, and business impact once the claim workflow is connected.</p>
              <div className="progress-track"><span></span></div>
              <small>FOUNDATION · API CONNECTIVITY</small>
            </div>
          </article>
          <article className="panel system-panel">
            <div className="panel-heading"><div><span className="section-kicker">PLATFORM</span><h2>System checks</h2></div><span className="pulse"></span></div>
            <div className="system-row"><span className="system-symbol">⌘</span><div><strong>Web application</strong><small>React + Vite</small></div><span className="check-state good">READY</span></div>
            <div className="system-row"><span className="system-symbol">⌁</span><div><strong>REST API</strong><small>{api.message}</small></div><span className={`check-state ${api.state === "online" ? "good" : api.state === "offline" ? "bad" : ""}`}>{api.state.toUpperCase()}</span></div>
            <div className="system-row"><span className="system-symbol">▤</span><div><strong>PostgreSQL</strong><small>Connection planned next</small></div><span className="check-state pending">PENDING</span></div>
            <div className="system-row"><span className="system-symbol">↝</span><div><strong>Redis queue</strong><small>Priority processing planned</small></div><span className="check-state pending">PENDING</span></div>
          </article>
        </section>

        <footer><span>CLAIMSYNC <span className="footer-separator">/</span> MVP 0.1.0</span><span>Built for reliable, explainable claims operations.</span></footer>
      </main>
    </div>
  );
}