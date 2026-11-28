/* T20 Lab shared helpers. All numbers come from JSON built by tools/cricket/t20lab/build.py.
   The curve / win-probability functions here mirror curve.py and winprob.py exactly. */
const LAB = (() => {
  const PAGES = [
    ["index.html", "Lab"], ["curve.html", "Resource curve & par"], ["players.html", "Players"],
    ["winprob.html", "Win probability"], ["matches.html", "Match cards"], ["validation.html", "Does it hold up?"],
    ["my-game.html", "My game (LMS)"], ["odi.html", "ODI"], ["methods.html", "Methods"],
  ];
  const cache = {};
  function load(name) {
    if (!cache[name]) cache[name] = fetch("data/" + name, { cache: "no-cache" }).then(r => {
      if (!r.ok) throw new Error(name + " " + r.status);
      return r.json();
    });
    return cache[name];
  }
  function nav() {
    const here = location.pathname.split("/").pop() || "index.html";
    const n = document.getElementById("nav");
    if (!n) return;
    n.innerHTML = PAGES.map(([h, t]) => `<a href="${h}"${h === here ? ' aria-current="page"' : ""}>${t}</a>`).join("");
    const cur = n.querySelector("[aria-current]");
    if (cur) cur.scrollIntoView({ inline: "center", block: "nearest" });
  }
  function footer() {
    const f = document.getElementById("foot");
    if (!f) return;
    f.innerHTML = `<p class="note">Methods follow Himanish Ganjoo's <a href="https://hganjoo.github.io/t20basics/">"T20 Metrics: A Primer"</a> (par scores, RAA/WAA, the DLS-style resource curve, Impact, win probability, WPA, leverage). T20 Lab is an independent re-implementation from the public primer, not affiliated with the author; where the primer is silent, our own choices are marked on the <a href="methods.html">Methods</a> page.</p>
<p class="note">Contains information from Cricsheet (<a href="https://cricsheet.org/">https://cricsheet.org/</a>) which is made available under the ODC Attribution License (<a href="https://opendatacommons.org/licenses/by/1-0/">https://opendatacommons.org/licenses/by/1-0/</a>). Last Man Stands figures are from the public LMS live-scoring feed for Johannesburg/Sandton leagues; teams other than mine and all players are anonymised.</p>
<p class="note">Descriptive analysis of past matches only. No predictions, no betting angle, no inside access.</p>
<p class="note"><a href="../../index.html">&larr; Back to the Laptop Ops Room</a></p>`;
  }

  // ---------- curve (mirrors curve.py)
  function F(c, w) { const [a, b, d] = c.f; return Math.max(1 + a * w + b * w * w + d * w ** 3, 1e-6); }
  function beta(c, w) { const [a, b, d] = c.g; return Math.max(c.beta0 * (1 + a * w + b * w * w + d * w ** 3), 1e-3); }
  function R(c, b, w, lam = 1) {
    if (b <= 0 || w >= c.W) return 0;
    const f = F(c, w), nw = c.n0 * f;
    return c.R0 * f * lam ** (nw + 1) * (1 - Math.exp(-b / (beta(c, w) * lam ** nw)));
  }
  function full(c, lam = 1) { return R(c, c.B, 0, lam); }
  function solveLambda(c, par, lo = 0.7, hi = 2.5) {
    if (par <= full(c, lo)) return lo;
    if (par >= full(c, hi)) return hi;
    let a = lo, z = hi;
    while (z - a > 1e-4) { const m = (a + z) / 2; if (full(c, m) < par) a = m; else z = m; }
    return (a + z) / 2;
  }
  // ---------- win probability (mirrors winprob.py, with the fitted Platt shift a)
  function pyth(r, n, a = 0) {
    if (r <= 0) return 0;
    const z = a + n * Math.log(r);
    if (z > 50) return 1; if (z < -50) return 0;
    return 1 / (1 + Math.exp(-z));
  }
  function wp1(c, S, b, w, lam, n, a) { return pyth((S + R(c, b, w, lam) + 1) / full(c, lam), n, a); }
  function wp2(c, N, b, w, lam, n, a) {
    if (N <= 0) return 1;
    if (b <= 0 || w >= c.W) return N === 1 ? 0.5 : 0;
    return pyth(R(c, b, w, lam) / N, n, a);
  }

  // ---------- formatting
  const f = (x, d = 1) => (x === null || x === undefined || Number.isNaN(x)) ? "–" : Number(x).toFixed(d);
  const sg = (x, d = 1) => (x === null || x === undefined) ? "–" : (x > 0 ? "+" : x < 0 ? "−" : "") + Math.abs(x).toFixed(d);
  const pct = (x, d = 0) => (x === null || x === undefined) ? "–" : (100 * x).toFixed(d) + "%";
  const esc = s => String(s).replace(/[&<>"]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));

  // ---------- sortable table. cols: [{k, t, d (decimals), sign, fmt}]
  function table(el, cols, rows, opts = {}) {
    let sortK = opts.sort || null, dir = -1;
    function draw() {
      const rs = rows.slice();
      if (sortK) rs.sort((a, b) => {
        const x = a[sortK], y = b[sortK];
        if (x === null || x === undefined) return 1; if (y === null || y === undefined) return -1;
        if (typeof x === "string") return dir === -1 ? y.localeCompare(x) : x.localeCompare(y);
        return dir === -1 ? y - x : x - y;
      });
      const lim = opts.limit ? rs.slice(0, opts.limit) : rs;
      el.innerHTML = `<table><thead><tr>${cols.map(c => `<th data-k="${c.k}" scope="col"${c.title ? ` title="${esc(c.title)}"` : ""}>${c.t}${sortK === c.k ? (dir === -1 ? " ▾" : " ▴") : ""}</th>`).join("")}</tr></thead><tbody>${lim.map(r => `<tr>${cols.map(c => {
        const v = r[c.k];
        if (c.fmt) return `<td>${c.fmt(v, r)}</td>`;
        if (typeof v === "string") return `<td>${esc(v)}</td>`;
        const cls = c.sign && v ? (v > 0 ? "pos" : "neg") : "";
        return `<td class="${cls}">${c.sign ? sg(v, c.d ?? 1) : f(v, c.d ?? 0)}</td>`;
      }).join("")}</tr>`).join("")}</tbody></table>`;
      el.querySelectorAll("th").forEach(th => th.onclick = () => {
        const k = th.dataset.k; if (sortK === k) dir = -dir; else { sortK = k; dir = -1; } draw();
      });
    }
    draw();
  }

  // ---------- svg helpers
  function bars(el, items, o = {}) {
    // items: [{label, v, cls}] horizontal bars centred on zero
    const W = 360, rowH = o.rowH || 22, H = items.length * rowH + 10;
    const max = Math.max(1e-9, ...items.map(d => Math.abs(d.v)));
    const mid = o.allPos ? 110 : 200, span = o.allPos ? 200 : 110;
    let s = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(o.title || "bar chart")}">`;
    items.forEach((d, i) => {
      const y = 5 + i * rowH, w = Math.abs(d.v) / max * span;
      const x = d.v >= 0 ? mid : mid - w;
      const col = d.v >= 0 ? "var(--pitch)" : "var(--seam)";
      s += `<text x="4" y="${y + rowH * 0.65}">${esc(String(d.label).slice(0, 16))}</text>`;
      s += `<rect x="${x}" y="${y + 3}" width="${Math.max(w, 1)}" height="${rowH - 8}" rx="2" fill="${d.fill || col}"/>`;
      const tx = d.v >= 0 ? x + w + 4 : x - 4;
      s += `<text class="val" x="${tx}" y="${y + rowH * 0.65}" text-anchor="${d.v >= 0 ? "start" : "end"}">${o.fmt ? o.fmt(d.v) : sg(d.v)}</text>`;
    });
    if (!o.allPos) s += `<line class="axis" x1="${mid}" x2="${mid}" y1="2" y2="${H - 2}"/>`;
    el.innerHTML = s + "</svg>";
  }
  function line(el, series, o = {}) {
    // series: [{pts:[[x,y]], color, dash, label}]
    const W = 360, H = o.H || 220, L = 38, Rr = 10, T = 10, B = 28;
    const xs = series.flatMap(s => s.pts.map(p => p[0])), ys = series.flatMap(s => s.pts.map(p => p[1]));
    const x0 = o.x0 ?? Math.min(...xs), x1 = o.x1 ?? Math.max(...xs);
    const y0 = o.y0 ?? Math.min(0, ...ys), y1 = o.y1 ?? Math.max(...ys);
    const X = x => L + (x - x0) / (x1 - x0 || 1) * (W - L - Rr), Y = y => H - B - (y - y0) / (y1 - y0 || 1) * (H - T - B);
    let s = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(o.title || "line chart")}">`;
    const yt = o.yticks || [y0, (y0 + y1) / 2, y1];
    yt.forEach(v => { s += `<line class="gridl" x1="${L}" x2="${W - Rr}" y1="${Y(v)}" y2="${Y(v)}"/><text x="${L - 4}" y="${Y(v) + 4}" text-anchor="end">${o.yfmt ? o.yfmt(v) : f(v, 0)}</text>`; });
    (o.xticks || [x0, (x0 + x1) / 2, x1]).forEach(v => { s += `<text x="${X(v)}" y="${H - 10}" text-anchor="middle">${o.xfmt ? o.xfmt(v) : f(v, 0)}</text>`; });
    if (o.diag) s += `<line x1="${X(x0)}" y1="${Y(y0)}" x2="${X(x1)}" y2="${Y(y1)}" stroke="var(--muted)" stroke-dasharray="4 4"/>`;
    series.forEach(sr => {
      if (sr.dots) sr.pts.forEach(p => { s += `<circle cx="${X(p[0])}" cy="${Y(p[1])}" r="${sr.r || 3}" fill="${sr.color}" opacity="${sr.op || .9}"/>`; });
      else s += `<polyline fill="none" stroke="${sr.color}" stroke-width="${sr.w || 2}" ${sr.dash ? `stroke-dasharray="${sr.dash}"` : ""} points="${sr.pts.map(p => X(p[0]).toFixed(1) + "," + Y(p[1]).toFixed(1)).join(" ")}"/>`;
    });
    if (o.xlab) s += `<text x="${W - Rr}" y="${H - B - 4}" text-anchor="end">${esc(o.xlab)}</text>`;
    el.innerHTML = s + "</svg>";
  }
  function columns(el, vals, o = {}) {
    // vertical bars by index (e.g. Impact by over), with optional phase separators
    const W = 360, H = o.H || 150, L = 28, B = 22, T = 8, n = vals.length;
    const max = Math.max(1, ...vals.map(Math.abs)), bw = (W - L - 6) / n;
    const zero = o.allPos ? H - B : T + (H - T - B) / 2, sc = o.allPos ? (H - T - B) / max : (H - T - B) / 2 / max;
    let s = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(o.title || "column chart")}">`;
    vals.forEach((v, i) => {
      const h = Math.abs(v) * sc, x = L + i * bw + 1, y = v >= 0 ? zero - h : zero;
      s += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${(bw - 2).toFixed(1)}" height="${Math.max(h, .5).toFixed(1)}" fill="${v >= 0 ? (o.pos || "var(--pitch)") : "var(--seam)"}"/>`;
      if (n <= 20 || i % 2 === 0) s += `<text x="${(x + bw / 2 - 1).toFixed(1)}" y="${H - 8}" text-anchor="middle">${i + 1}</text>`;
    });
    (o.seps || []).forEach(k => { const x = L + k * bw; s += `<line x1="${x}" x2="${x}" y1="${T}" y2="${H - B}" stroke="var(--muted)" stroke-dasharray="3 3"/>`; });
    s += `<line class="axis" x1="${L}" x2="${W - 4}" y1="${zero}" y2="${zero}"/>`;
    s += `<text x="${L - 4}" y="${T + 8}" text-anchor="end">${o.allPos ? f(max, 0) : "+" + f(max, 0)}</text>`;
    if (!o.allPos) s += `<text x="${L - 4}" y="${H - B}" text-anchor="end">−${f(max, 0)}</text>`;
    el.innerHTML = s + "</svg>";
  }
  document.addEventListener("DOMContentLoaded", () => { nav(); footer(); });
  return { load, R, full, solveLambda, wp1, wp2, pyth, f, sg, pct, esc, table, bars, line, columns };
})();
