'use strict';
// vibe-agent terrarium benchmark browser — pure static, on-demand fetch.
const DATA = 'data';
const S = {
  index: null, servers: null,
  task: null, trial: null, attempt: null,
  stepIdx: 0, tab: 'demo', search: '',
  playing: false, timer: null, speed: 1,
  demo: { days: [], dayKeys: [], cur: 0, playing: false, timer: null },
};

// ------------------------------------------------------------------ utils
const $ = (s, r = document) => r.querySelector(s);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
async function getJSON(path) {
  const r = await fetch(path);
  if (!r.ok) throw new Error(path + ' ' + r.status);
  return r.json();
}
function scoreColor(v) {
  if (v == null) return '#6e7681';
  const t = Math.max(0, Math.min(1, v));
  const h = 0 + t * 130;               // red -> green
  return `hsl(${h},60%,45%)`;
}
function scorePill(v) {
  const txt = v == null ? '—' : v.toFixed(3);
  const c = scoreColor(v);
  return `<span class="score-pill" style="background:${c}22;color:${c};border:1px solid ${c}55">${txt}</span>`;
}
function fmt(n) { return n == null ? '—' : n.toLocaleString(); }

// minimal, safe markdown (escape first, then inline styling)
function md(src) {
  if (!src) return '';
  const lines = esc(src).split('\n');
  let out = '', inUl = false, inCode = false;
  const inline = t => t
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  for (let ln of lines) {
    if (/^```/.test(ln.trim())) {
      if (!inCode) { out += '<pre>'; inCode = true; } else { out += '</pre>'; inCode = false; }
      continue;
    }
    if (inCode) { out += ln + '\n'; continue; }
    let m;
    if ((m = ln.match(/^(#{1,4})\s+(.*)/))) {
      if (inUl) { out += '</ul>'; inUl = false; }
      const lv = Math.min(3, m[1].length);
      out += `<h${lv}>${inline(m[2])}</h${lv}>`;
    } else if ((m = ln.match(/^\s*[-*]\s+(.*)/))) {
      if (!inUl) { out += '<ul>'; inUl = true; }
      out += `<li>${inline(m[1])}</li>`;
    } else if (ln.trim() === '') {
      if (inUl) { out += '</ul>'; inUl = false; }
      out += '<br>';
    } else {
      if (inUl) { out += '</ul>'; inUl = false; }
      out += `<div>${inline(ln)}</div>`;
    }
  }
  if (inUl) out += '</ul>';
  if (inCode) out += '</pre>';
  return out;
}
function catLabel(c) {
  return { travel: '旅行', shopping: '购物', finance: '理财', fitness: '健身',
    career: '求职', exam_preparation: '备考', renovation: '装修', litigation: '诉讼',
    rental: '租房', team_building: '团建' }[c] || c;
}

// ------------------------------------------------------------------ boot
async function boot() {
  try {
    [S.index, S.servers] = await Promise.all([
      getJSON(`${DATA}/index.json`), getJSON(`${DATA}/servers.json`),
    ]);
  } catch (e) {
    $('#detail').innerHTML = `<div class="loading">数据加载失败：${esc(e.message)}<br>请在 demo/ 目录下起静态服务器。</div>`;
    return;
  }
  const m = S.index.meta;
  $('#meta-set').textContent = `${m.task_set} · ${m.model}`;
  $('#stats').innerHTML =
    `<span><b>${m.n_tasks}</b>任务</span><span><b>${m.n_trials}</b>轨迹</span>` +
    `<span><b>${m.n_servers}</b>MCP服务</span><span><b>${m.n_tools}</b>工具API</span>`;
  renderSidebar();
  wireGlobal();
}

function wireGlobal() {
  $('#search').addEventListener('input', e => { S.search = e.target.value.toLowerCase(); renderSidebar(); });
  $('#btn-api').addEventListener('click', () => openApiModal());
  $('#api-close').addEventListener('click', () => { $('#api-modal').hidden = true; });
  $('#api-modal').addEventListener('click', e => { if (e.target.id === 'api-modal') $('#api-modal').hidden = true; });
  $('#api-search').addEventListener('input', e => renderApiBody(e.target.value.toLowerCase()));
  document.addEventListener('keydown', e => {
    if (S.tab !== 'trace' || !S.trial) return;
    if (!$('#api-modal').hidden) return;
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    if (e.key === 'ArrowLeft') { e.preventDefault(); stopPlay(); step(-1); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); stopPlay(); step(1); }
  });
}

// ------------------------------------------------------------------ sidebar
function renderSidebar() {
  const sb = $('#sidebar'); sb.innerHTML = '';
  const q = S.search;
  const byCat = {};
  for (const t of S.index.tasks) {
    const hay = (t.name + ' ' + t.category + ' ' + (t.tags || []).join(' ')).toLowerCase();
    if (q && !hay.includes(q)) continue;
    (byCat[t.category] = byCat[t.category] || []).push(t);
  }
  for (const cat of S.index.meta.categories) {
    const list = byCat[cat]; if (!list) continue;
    const g = el('div', 'cat-group');
    g.appendChild(el('div', 'cat-head',
      `<span>${esc(catLabel(cat))} · ${esc(cat)}</span><span class="cnt">${list.length}</span>`));
    for (const t of list) {
      const it = el('div', 'task-item' + (S.task && S.task.name === t.name ? ' active' : ''));
      it.innerHTML =
        `<div style="min-width:0"><div class="nm">${esc(t.name)}</div>` +
        `<div class="sub">${t.n_stages}阶段 · ${t.n_events}事件 · ${t.servers_used.length}服务 · ${t.n_attempts}次</div></div>` +
        scorePill(t.avg_score);
      it.addEventListener('click', () => openTask(t));
      g.appendChild(it);
    }
    sb.appendChild(g);
  }
  if (!sb.children.length) sb.innerHTML = '<div class="loading">无匹配任务</div>';
}

// ------------------------------------------------------------------ open task
async function openTask(entry) {
  $('#detail').innerHTML = '<div class="loading">加载任务…</div>';
  let task;
  try { task = await getJSON(`${DATA}/${entry.file}`); }
  catch (e) { $('#detail').innerHTML = `<div class="loading">任务加载失败：${esc(e.message)}</div>`; return; }
  S.task = task; S.trial = null; S.attempt = null; S.tab = 'demo';
  demoStop();
  renderSidebar();
  // preselect best attempt for trace/score
  const atts = task.attempts || [];
  let best = null;
  for (const a of atts) if (a.score != null && (!best || a.score > best.score)) best = a;
  S.attempt = best || atts[0] || null;
  renderDetail();
  if (S.attempt) selectAttempt(S.attempt, false);
}

function renderDetail() {
  const t = S.task;
  const d = $('#detail'); d.innerHTML = '';
  d.appendChild(renderHead());
  const tabs = el('div', 'tabs');
  const defs = [['demo', '演示'], ['brief', '需求 & 剧本'], ['env', '环境 & API'], ['score', '评分标准'], ['trace', '轨迹回放']];
  for (const [k, lbl] of defs) {
    const tb = el('div', 'tab' + (S.tab === k ? ' active' : ''), esc(lbl));
    tb.addEventListener('click', () => { S.tab = k; renderDetail(); });
    tabs.appendChild(tb);
  }
  d.appendChild(tabs);
  const body = el('div', 'tabbody'); body.id = 'tabbody'; d.appendChild(body);
  if (S.tab === 'demo') renderDemo(body);
  else if (S.tab === 'brief') renderBrief(body);
  else if (S.tab === 'env') renderEnv(body);
  else if (S.tab === 'score') renderScore(body);
  else if (S.tab === 'trace') renderTrace(body);
}

function renderHead() {
  const t = S.task, h = el('div', 'head');
  const atts = t.attempts || [];
  const scores = atts.map(a => a.score).filter(v => v != null);
  const avg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
  const srvChips = t.servers_used.map(s =>
    `<span class="chip srv" data-srv="${esc(s)}_mock">${esc(s)}</span>`).join('');
  const tagChips = (t.tags || []).map(x => `<span class="chip">${esc(x)}</span>`).join('');
  h.innerHTML =
    `<div class="crumbs">${esc(catLabel(t.category))} · ${esc(t.category)} / <span style="color:var(--fg)">${esc(t.path)}</span></div>` +
    `<h1>${esc(t.name)}</h1>` +
    `<div class="tags">${t.difficulty ? `<span class="chip diff">难度 ${esc(t.difficulty)}</span>` : ''}${tagChips}</div>` +
    `<div class="summary-row">` +
      `<div class="big-score" style="color:${scoreColor(avg)}">${avg == null ? '—' : avg.toFixed(3)}<small>avg@${scores.length} 分</small></div>` +
      `<div class="metric"><b>${new Set(t.events.map(e => e.stage)).size}</b>阶段</div>` +
      `<div class="metric"><b>${t.events.length}</b>脚本事件</div>` +
      `<div class="metric"><b>${t.servers_used.length}</b>MCP服务</div>` +
      `<div class="metric"><b>${(t.rubrics || []).reduce((n, s) => n + s.checks.length, 0)}</b>评分点</div>` +
      `<div class="attempts" id="atts"></div>` +
    `</div>`;
  const ab = h.querySelector('#atts');
  for (const a of atts) {
    const b = el('div', 'att-btn' + (S.attempt && S.attempt.attempt === a.attempt ? ' active' : ''),
      `#${a.attempt}<small>${a.score == null ? '—' : a.score.toFixed(3)}</small>`);
    b.addEventListener('click', () => { S.attempt = a; renderDetail(); selectAttempt(a, S.tab === 'trace'); });
    ab.appendChild(b);
  }
  h.querySelectorAll('.chip.srv').forEach(c =>
    c.addEventListener('click', () => openApiModal(c.dataset.srv)));
  return h;
}

// ------------------------------------------------------------------ BRIEF
function renderBrief(body) {
  const t = S.task;
  // task.md
  if (t.task_md) {
    const s = el('div', 'sec'); s.innerHTML = `<h3>任务说明 (task.md)</h3><div class="card md">${md(t.task_md)}</div>`;
    body.appendChild(s);
  }
  // constraints
  if (t.constraints && t.constraints.length) {
    const s = el('div', 'sec'); s.innerHTML = '<h3>隐含约束 / 安全红线</h3>';
    const card = el('div', 'card');
    for (const c of t.constraints) {
      card.appendChild(el('div', 'constraint' + (c.critical ? ' crit' : ''),
        `<span class="n">${c.n}.</span><span>${esc(c.text)}${c.critical ? '<span class="badge-crit">安全关键</span>' : ''}</span>`));
    }
    s.appendChild(card); body.appendChild(s);
  }
  // workspace persona/context
  if (t.workspace && t.workspace.length) {
    const s = el('div', 'sec');
    s.innerHTML = '<h3>Agent 初始上下文 (workspace/)</h3>' +
      '<div class="muted" style="margin-bottom:8px">任务开始时注入到 agent 工作区的人设 / 用户档案 / 行为准则。评分会检查这些内容是否被正确读取与遵守。</div>';
    const grid = el('div', 'ws-grid');
    for (const w of t.workspace) {
      const c = el('div', 'card ws-file');
      c.innerHTML = `<div class="fn">${esc(w.name)}</div><div class="md">${md(w.text)}</div>` +
        (w.truncated ? '<div class="muted">…(截断)</div>' : '');
      grid.appendChild(c);
    }
    s.appendChild(grid); body.appendChild(s);
  }
  // event script timeline
  if (t.events && t.events.length) {
    const s = el('div', 'sec');
    s.innerHTML = '<h3>事件剧本 (event.yaml) — 编排器按时间注入</h3>';
    let lastStage = null;
    for (const e of t.events) {
      if (e.stage !== lastStage) {
        s.appendChild(el('div', 'muted', `<div style="margin:12px 0 4px;font-weight:700;color:var(--fg)">▸ 阶段 ${esc(e.stage)}</div>`));
        lastStage = e.stage;
      }
      s.appendChild(renderEventRow(e));
    }
    body.appendChild(s);
  }
}

function eventKindClass(k) {
  if (k === 'user_message') return 'user';
  return k || '';
}
function renderEventRow(e) {
  const row = el('div', 'ev ' + eventKindClass(e.kind));
  const kindLabel = { user_message: '用户消息', world: '世界事件', notification: '通知',
    mutation: '环境变更', accident: '意外' }[e.kind] || e.kind;
  let mutHtml = '';
  if (e.apply && e.apply.length) {
    for (const op of e.apply) {
      if (op.mode === 'tool')
        mutHtml += `<div class="ev-mut"><div class="op">${esc(op.server)} → ${esc(op.tool)}()</div><pre class="json">${esc(op.args)}</pre></div>`;
      else if (op.mode === 'table')
        mutHtml += `<div class="ev-mut"><div class="op">${esc(op.server)}.${esc(op.table)} · ${esc(op.op)}</div><pre class="json">${esc(op.values)}</pre></div>`;
      else
        mutHtml += `<div class="ev-mut"><pre class="json">${esc(op.raw)}</pre></div>`;
    }
  }
  row.innerHTML =
    `<div class="ev-rail"><div class="t">${esc(e.time || '')}</div><div class="st">${esc(e.id)}</div></div>` +
    `<div class="ev-body">` +
      `<span class="ev-kind">${esc(kindLabel)}</span>` +
      (e.actor ? `<span class="ev-actor">@ ${esc(e.actor)}</span>` : '') +
      (e.silent ? '<span class="silent-flag">silent · 不通知agent</span>' : '') +
      (e.trigger ? `<span class="ev-actor">(${esc(e.trigger)})</span>` : '') +
      (e.body ? `<div class="ev-text">${esc(e.body)}</div>` : '') +
      mutHtml +
    `</div>`;
  return row;
}

// ------------------------------------------------------------------ ENV & API
function renderEnv(body) {
  const t = S.task;
  const envByServer = {}; for (const e of (t.envs || [])) envByServer[e.server] = e;
  const s = el('div', 'sec');
  s.innerHTML = '<h3>本任务使用的 MCP 服务 · 种子数据 · 工具 API</h3>' +
    '<div class="muted" style="margin-bottom:10px">每个服务是一个独立 mock server(独立 SQLite)。点击展开：种子数据(init.sql 灌入的表/行)与该服务全部工具签名。</div>';
  for (const srvName of t.servers_used) {
    const srvKey = srvName + '_mock';
    const meta = S.servers[srvKey] || S.servers[srvName] || { blurb: '', tools: [], n_tools: 0 };
    const env = envByServer[srvName];
    const block = el('div', 'srv-block');
    const top = el('div', 'srv-top');
    top.innerHTML = `<span class="snm">${esc(srvName)}</span><span class="blurb">${esc(meta.blurb || '')}</span>` +
      `<span class="cnt">${meta.n_tools || (meta.tools || []).length} 工具</span>`;
    top.addEventListener('click', () => block.classList.toggle('open'));
    block.appendChild(top);
    const inner = el('div', 'srv-inner');
    // seed data
    if (env) {
      let seed = '<h4 style="margin:0 0 6px;font-size:11px;color:var(--mut)">种子数据 (init.sql)</h4>';
      if (env.tables && env.tables.length) {
        seed += '<div class="tbl-chips">' + env.tables.map(tb =>
          `<span class="tbl-chip">${esc(tb.table)} <b>${tb.rows}</b></span>`).join('') + '</div>';
      } else seed += '<div class="muted">无表数据</div>';
      if (env.readme) seed += `<details><summary>README</summary><div class="md">${md(env.readme)}</div></details>`;
      if (env.init_sql) seed += `<details><summary>init.sql (${fmt(env.sql_bytes)} 字节${env.sql_truncated ? ' · 已截断' : ''})</summary><pre class="json">${esc(env.init_sql)}</pre></details>`;
      inner.appendChild(el('div', null, seed));
    }
    // tools
    const tw = el('div', null, '<h4 style="margin:12px 0 6px;font-size:11px;color:var(--mut)">工具 API</h4>');
    for (const tool of (meta.tools || [])) tw.appendChild(renderTool(tool));
    inner.appendChild(tw);
    block.appendChild(inner);
    s.appendChild(block);
  }
  body.appendChild(s);
}

function renderTool(tool) {
  const params = (tool.params || []).map(p =>
    `<span class="pm">${esc(p.name)}</span>${p.type ? `<span class="ty">:${esc(p.type)}</span>` : ''}${p.default != null ? `<span class="ty">=${esc(p.default)}</span>` : ''}`
  ).join('<span class="ty">, </span>');
  const d = el('div', 'tool');
  d.innerHTML = `<div class="sig"><span class="tn">${esc(tool.name)}</span>(<wbr>${params})</div>` +
    (tool.doc ? `<div class="doc">${esc(tool.doc)}</div>` : '');
  return d;
}

// ------------------------------------------------------------------ SCORE
function rubricMap(task) {
  const m = {};
  for (const st of (task.rubrics || []))
    for (const c of st.checks) m[c.id] = { weight: c.weight, semantics: c.semantics, stage: st.stage, file: st.file };
  return m;
}
function renderScore(body) {
  const t = S.task;
  const rmap = rubricMap(t);
  const trial = S.trial; // may be null if not yet loaded
  const passMap = {};
  if (trial) for (const c of trial.checks) passMap[c.name] = c.passed;

  // weighted summary
  let totW = 0, gotW = 0, haveW = false;
  for (const id in rmap) { const w = rmap[id].weight; if (w != null) { totW += w; haveW = true; if (passMap[id]) gotW += w; } }
  const hdr = el('div', 'sec');
  hdr.innerHTML = '<h3>评分标准 (rubrics/) — 按阶段分组</h3>' +
    '<div class="muted" style="margin-bottom:10px">每个评分点由一个 Python 函数判定：或匹配 <b>agent 回复/笔记里的关键词</b>,或查询 <b>环境最终状态</b>(预订/订单/邮件…)。展开可看确切逻辑。' +
    (trial ? ` 当前显示 <b style="color:var(--fg)">attempt #${S.attempt.attempt}</b> 的通过情况。` : '') +
    (haveW ? ` 加权得分 <b style="color:var(--fg)">${gotW.toFixed(1)} / ${totW.toFixed(1)}</b>。` : '') +
    '</div>';
  body.appendChild(hdr);

  for (const st of (t.rubrics || [])) {
    const det = el('details', 'rub-stage'); det.open = true;
    const nP = st.checks.filter(c => passMap[c.id]).length;
    det.appendChild(el('summary', null,
      `阶段 ${st.stage == null ? esc(st.file) : st.stage} · ${st.checks.length} 点` +
      (trial ? `<span class="sc">${nP}/${st.checks.length} 通过</span>` : `<span class="sc">${esc(st.file)}</span>`)));
    for (const c of st.checks) det.appendChild(renderCheck(c, passMap));
    body.appendChild(det);
  }
}
function renderCheck(c, passMap) {
  const known = c.id in passMap;
  const passed = passMap[c.id];
  const cls = known ? (passed ? 'pass' : 'fail') : '';
  const mk = known ? (passed ? '✓' : '✕') : '·';
  const sem = c.semantics || {};
  let meaning = '';
  if (sem.doc) meaning += `<div class="meaning">${esc(sem.doc)}</div>`;
  // keyword groups
  if (sem.keywords && sem.keywords.length) {
    let kl = '<div class="kwline"><span class="muted" style="font-size:11px">须命中：</span>';
    kl += sem.keywords.map(grp =>
      '<span class="kw-grp">' + grp.map(k => `<span class="kw">${esc(k)}</span>`).join('') + '</span>'
    ).join('<span class="kw-and">且</span>');
    kl += '</div>';
    meaning += kl;
  }
  if (sem.inspects && sem.inspects.length) {
    meaning += '<div class="kwline"><span class="muted" style="font-size:11px">检查状态：</span>' +
      sem.inspects.map(x => `<span class="inspect">${esc(x)}</span>`).join('') + '</div>';
  }
  let src = '';
  if (sem.source) src = `<details class="src"><summary>判定逻辑 (${esc(sem.fn || '')}${sem.defined_in ? ' · ' + esc(sem.defined_in) : ''})</summary><pre class="json">${esc(sem.source)}</pre></details>`;
  else if (sem.fn && !sem.resolved) meaning += `<div class="meaning">判定函数：<code>${esc(sem.fn)}</code>(未解析)</div>`;
  const d = el('div', 'check ' + cls);
  d.innerHTML = `<div class="mk">${mk}</div><div style="min-width:0;flex:1">` +
    `<span class="cid">${esc(c.id)}</span>${c.weight != null ? `<span class="w">权重 ${c.weight}</span>` : ''}` +
    meaning + src + '</div>';
  return d;
}

// ------------------------------------------------------------------ TRACE (scrubber)
async function selectAttempt(att, switchToTrace) {
  if (!att) return;
  if (S.trial && S.trial._attempt === att.attempt) { if (switchToTrace) { S.tab = 'trace'; renderDetail(); } return; }
  demoStop();
  try {
    const tr = await getJSON(`${DATA}/${att.file}`);
    tr._attempt = att.attempt;
    S.trial = tr; S.stepIdx = 0;
  } catch (e) { S.trial = null; }
  if (switchToTrace) { S.tab = 'trace'; renderDetail(); }
  else if (S.tab === 'score' || S.tab === 'trace' || S.tab === 'demo') renderDetail();
}

function renderTrace(body) {
  if (!S.attempt) { body.innerHTML = '<div class="loading">该任务无轨迹。</div>'; return; }
  if (!S.trial) { body.innerHTML = '<div class="loading">加载轨迹…</div>'; selectAttempt(S.attempt, false); return; }
  const tr = S.trial, steps = tr.steps;
  const n = steps.length;
  if (S.stepIdx >= n) S.stepIdx = n - 1;

  // scrubber
  const wrap = el('div', 'scrub-wrap');
  wrap.innerHTML =
    `<div class="scrub-ctrls">` +
      `<button class="btn nav" id="first" title="回到开头">⏮</button>` +
      `<button class="btn nav" id="prev" title="上一步 (←)">◀</button>` +
      `<button class="btn play" id="play" title="播放/暂停">▶</button>` +
      `<button class="btn nav" id="next" title="下一步 (→)">▶</button>` +
      `<button class="btn nav" id="last" title="跳到结尾">⏭</button>` +
      `<span class="scrub-pos">步 <input id="posin" type="number" min="1" max="${n}" value="${S.stepIdx + 1}"> / ${n}</span>` +
      `<span class="scrub-stage" id="stg"></span>` +
      `<span class="speed">速度 <button class="btn ghost" id="sp">${S.speed}×</button></span>` +
    `</div>` +
    `<div class="ticks" id="ticks"></div>` +
    `<input type="range" id="rng" min="0" max="${n - 1}" value="${S.stepIdx}">` +
    `<div class="scrub-legend">` +
      `<span><i style="background:var(--user)"></i>用户消息(阶段)</span>` +
      `<span><i style="background:var(--world)"></i>世界事件</span>` +
      `<span><i style="background:var(--notif)"></i>通知</span>` +
      `<span><i style="background:#5cd685"></i>工具调用</span>` +
      `<span><i style="background:#b39ddb"></i>思考</span>` +
    `</div>`;
  body.appendChild(wrap);

  // ticks (inject markers)
  const ticks = wrap.querySelector('#ticks');
  steps.forEach((st, i) => {
    if (st.kind === 'inject') {
      const t = el('div', 'tick ' + (st.subtype === 'user_message' ? 'user' : st.subtype || ''));
      t.style.left = (i / (n - 1) * 100) + '%';
      t.title = (st.subtype || '') + ' @ ' + (st.time || '');
      ticks.appendChild(t);
    }
  });

  // main grid
  const grid = el('div', 'trace-grid');
  grid.innerHTML = `<div class="step-view" id="stepview"></div>` +
    `<div class="side" id="side"></div>`;
  body.appendChild(grid);

  const rng = wrap.querySelector('#rng');
  rng.addEventListener('input', e => seek(parseInt(e.target.value, 10)));
  wrap.querySelector('#play').addEventListener('click', togglePlay);
  wrap.querySelector('#first').addEventListener('click', () => { stopPlay(); seek(0); });
  wrap.querySelector('#last').addEventListener('click', () => { stopPlay(); seek(n - 1); });
  wrap.querySelector('#prev').addEventListener('click', () => { stopPlay(); step(-1); });
  wrap.querySelector('#next').addEventListener('click', () => { stopPlay(); step(1); });
  const posin = wrap.querySelector('#posin');
  const jump = () => { const v = parseInt(posin.value, 10); if (!isNaN(v)) { stopPlay(); seek(v - 1); } };
  posin.addEventListener('change', jump);
  posin.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); jump(); posin.blur(); } });
  wrap.querySelector('#sp').addEventListener('click', () => {
    S.speed = ({ 1: 2, 2: 4, 4: 8, 8: 1 })[S.speed] || 1;
    wrap.querySelector('#sp').textContent = S.speed + '×';
    if (S.playing) { stopPlay(); startPlay(); }
  });
  seek(S.stepIdx);
}

// advance by delta steps (clamped)
function step(delta) {
  if (!S.trial) return;
  seek(S.stepIdx + delta);
}

function stageAt(idx) {
  const steps = S.trial.steps; let s = 0;
  for (let i = 0; i <= idx && i < steps.length; i++) if (steps[i].stage != null && steps[i].stage > s) s = steps[i].stage;
  // stage may start at -1 -> clamp
  const st = steps[idx] ? steps[idx].stage : 0;
  return st != null && st >= 0 ? st : 0;
}

function seek(idx) {
  const steps = S.trial && S.trial.steps ? S.trial.steps : [];
  const n = steps.length;
  if (!n) return;
  idx = Math.max(0, Math.min(n - 1, idx));
  S.stepIdx = idx;
  const tb = $('#tabbody'); if (!tb) return;
  const posEl = tb.querySelector('#posin'); if (posEl && +posEl.value !== idx + 1) posEl.value = idx + 1;
  const rng = tb.querySelector('#rng'); if (rng && +rng.value !== idx) rng.value = idx;
  const stg = tb.querySelector('#stg'); if (stg) stg.textContent = '阶段 ' + Math.max(0, stageAt(idx));
  const first = tb.querySelector('#first'); if (first) first.disabled = idx === 0;
  const prev = tb.querySelector('#prev'); if (prev) prev.disabled = idx === 0;
  const next = tb.querySelector('#next'); if (next) next.disabled = idx === n - 1;
  const last = tb.querySelector('#last'); if (last) last.disabled = idx === n - 1;
  renderStepView(idx);
  renderSide(idx);
}

function stepKindLabel(k) {
  return { inject: '注入', thinking: '思考', tool_use: '工具调用', tool_result: '工具返回',
    agent_text: 'Agent 回复', user_text: '用户文本' }[k] || k;
}
function renderStepView(idx) {
  const view = $('#stepview'); if (!view) return;
  view.innerHTML = '';
  const steps = S.trial.steps;
  const lo = Math.max(0, idx - 2);
  for (let i = lo; i <= idx; i++) view.appendChild(renderStepCard(steps[i], i === idx));
  const cur = view.querySelector('.step.cur');
  if (cur) cur.scrollIntoView({ block: 'nearest' });
}
function renderStepCard(st, isCur) {
  const c = el('div', 'step' + (isCur ? ' cur' : ''));
  let head = `<span class="k ${st.kind}">${esc(stepKindLabel(st.kind))}</span>`;
  let bodyHtml = '', mono = false;
  if (st.kind === 'inject') {
    const sub = { user_message: '用户消息', world: '世界事件', notification: '通知', system: '系统' }[st.subtype] || st.subtype;
    head += `<span class="who">${esc(sub)}${st.actor ? ' · ' + esc(st.actor) : ''}</span>`;
    bodyHtml = esc(st.text);
  } else if (st.kind === 'thinking') {
    bodyHtml = esc(st.text);
  } else if (st.kind === 'tool_use') {
    head += `<span class="who">${esc(st.server || '?')} → ${esc(st.tool)}</span>`;
    let args = st.input; try { args = JSON.stringify(st.input, null, 2); } catch (e) { args = String(st.input); }
    bodyHtml = esc(args); mono = true;
  } else if (st.kind === 'tool_result') {
    head += `<span class="who">← 返回</span>`;
    bodyHtml = esc(st.content); mono = true;
  } else {
    bodyHtml = esc(st.text);
  }
  if (st.time) head += `<span class="tm">${esc(st.time)}</span>`;
  c.innerHTML = `<div class="sh">${head}</div><div class="body${mono ? ' mono' : ''}">${bodyHtml}</div>`;
  return c;
}

function renderSide(idx) {
  const side = $('#side'); if (!side) return;
  const steps = S.trial.steps;
  const srvUse = {}; let nThink = 0, nTool = 0, injSub = {};
  for (let i = 0; i <= idx; i++) {
    const st = steps[i];
    if (st.kind === 'tool_use') { nTool++; const k = st.server || '(agent)'; srvUse[k] = (srvUse[k] || 0) + 1; }
    else if (st.kind === 'thinking') nThink++;
    else if (st.kind === 'inject') injSub[st.subtype] = (injSub[st.subtype] || 0) + 1;
  }
  const maxUse = Math.max(1, ...Object.values(srvUse));
  const useRows = Object.entries(srvUse).sort((a, b) => b[1] - a[1]).map(([k, v]) =>
    `<div><div class="usebar"><span>${esc(k)}</span><span>${v}</span></div><div class="bar" style="width:${v / maxUse * 100}%"></div></div>`
  ).join('') || '<div class="muted">尚无工具调用</div>';

  const tr = S.trial, mt = tr.metrics || {};
  let html = '';
  html += `<div class="box"><h4>到当前节点的累计状态</h4>` +
    `<div class="usebar"><span>已注入事件</span><span>${Object.values(injSub).reduce((a, b) => a + b, 0)}</span></div>` +
    `<div class="usebar"><span>思考次数</span><span>${nThink}</span></div>` +
    `<div class="usebar"><span>工具调用</span><span>${nTool}</span></div>` +
    `<div class="usebar"><span>当前阶段</span><span>${Math.max(0, stageAt(idx))}</span></div></div>`;
  html += `<div class="box"><h4>各服务调用次数(累计)</h4>${useRows}</div>`;
  html += `<div class="box"><h4>本轨迹整体</h4>` +
    `<div class="usebar"><span>最终得分</span><span>${tr.score == null ? '—' : tr.score.toFixed(3)}</span></div>` +
    `<div class="usebar"><span>通过评分点</span><span>${tr.n_passed}/${tr.n_checks}</span></div>` +
    `<div class="usebar"><span>LLM 调用</span><span>${fmt(mt.total_llm_calls)}</span></div>` +
    `<div class="usebar"><span>工具调用总</span><span>${fmt(mt.total_tool_calls)}</span></div>` +
    `<div class="usebar"><span>输入/输出 tokens</span><span>${fmt(mt.total_input_tokens)}/${fmt(mt.total_output_tokens)}</span></div></div>`;
  // jump list of injects
  let jl = '<div class="box"><h4>事件锚点(点击跳转)</h4><div class="mini-list">';
  steps.forEach((st, i) => {
    if (st.kind === 'inject') {
      const sub = { user_message: '用户', world: '世界', notification: '通知', system: '系统' }[st.subtype] || st.subtype;
      const txt = (st.text || '').replace(/\s+/g, ' ').slice(0, 40);
      jl += `<div class="mini-item${i <= idx ? ' cur' : ''}" data-i="${i}"><span class="ki">[${esc(sub)}]</span> ${esc(txt)}</div>`;
    }
  });
  jl += '</div></div>';
  html += jl;
  side.innerHTML = html;
  side.querySelectorAll('.mini-item').forEach(m =>
    m.addEventListener('click', () => seek(parseInt(m.dataset.i, 10))));
}

function togglePlay() { S.playing ? stopPlay() : startPlay(); }
function startPlay() {
  S.playing = true; const b = $('#play'); if (b) b.textContent = '⏸';
  S.timer = setInterval(() => {
    if (S.stepIdx >= S.trial.steps.length - 1) { stopPlay(); return; }
    seek(S.stepIdx + 1);
  }, 500 / S.speed);
}
function stopPlay() {
  S.playing = false; const b = $('#play'); if (b) b.textContent = '▶';
  if (S.timer) clearInterval(S.timer); S.timer = null;
}

// ================================================================== DEMO VIEW
// calendar (left, shows the scripted timeline "推进过程") + phone chat (right).
// simulated-time cursor advances by day; chat reveals messages up to the cursor.

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
const EV_META = {
  user_message: { icon: '👤', cls: 'u', label: '用户' },
  world:        { icon: '🌐', cls: 'w', label: '世界' },
  notification: { icon: '🔔', cls: 'n', label: '通知' },
  mutation:     { icon: '✎',  cls: 'm', label: '变更' },
  accident:     { icon: '⚠',  cls: 'a', label: '意外' },
};

function pdate(s) {                       // "2026-04-17T09:00" -> Date at local midnight
  if (!s) return null;
  const m = String(s).match(/(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return new Date(+m[1], +m[2] - 1, +m[3]);
}
function dkey(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function stripPrefix(text) {              // drop leading "[World event @ ...]" / "[来自 X ...]" line
  if (!text) return '';
  return String(text).replace(/^\s*\[[^\]]*\]\s*\n?/, '').trim();
}
function firstLine(s, n) {
  const t = stripPrefix(s).replace(/\s+/g, ' ').trim();
  return t.length > n ? t.slice(0, n - 1) + '…' : t;
}
function weatherGlyph(events) {           // heuristic glyph if a weather advisory hit that day
  const hay = events.map(e => ((e.actor || '') + ' ' + (e.body || '')).toLowerCase()).join(' ');
  if (!/weather|天气|台风|typhoon|storm|jma|forecast|rain|雨|snow|雪|sunny|晴|cloud|云/.test(hay)) return '';
  if (/台风|typhoon|storm|advisory|warning|预警/.test(hay)) return '🌀';
  if (/snow|雪/.test(hay)) return '❄️';
  if (/rain|雨|shower/.test(hay)) return '🌧️';
  if (/cloud|云|overcast/.test(hay)) return '⛅';
  if (/sunny|clear|晴/.test(hay)) return '☀️';
  return '🌤️';
}

// build the day model for the current task: min..max event date, events bucketed per day
function buildDemoModel() {
  const t = S.task; const dm = S.demo;
  if (dm.taskName !== t.name) { dm.taskName = t.name; dm.cur = 0; }   // reset cursor on task switch
  const evs = (t.events || []).filter(e => pdate(e.time));
  if (!evs.length) { dm.days = []; dm.dayKeys = []; dm.byDay = {}; dm.cur = 0; return; }
  let lo = pdate(evs[0].time), hi = lo;
  for (const e of evs) { const d = pdate(e.time); if (d < lo) lo = d; if (d > hi) hi = d; }
  const days = []; const keys = [];
  for (let d = new Date(lo); d <= hi; d = addDays(d, 1)) { days.push(new Date(d)); keys.push(dkey(d)); }
  const byDay = {};
  for (const e of evs) { const k = dkey(pdate(e.time)); (byDay[k] = byDay[k] || []).push(e); }
  dm.days = days; dm.dayKeys = keys; dm.byDay = byDay; dm.lo = lo; dm.hi = hi;
  if (dm.cur == null || dm.cur < 0 || dm.cur >= days.length) dm.cur = 0;
}

function renderDemo(body) {
  if (!S.task) { body.innerHTML = '<div class="loading">请选择一个任务。</div>'; return; }
  buildDemoModel();
  const dm = S.demo;
  if (!dm.days.length) { body.innerHTML = '<div class="loading">该任务无带时间的事件，无法生成日历。</div>'; return; }
  if (!S.trial && S.attempt) { selectAttempt(S.attempt, false); }

  const grid = el('div', 'demo-grid');
  grid.innerHTML = `<div class="cal-wrap" id="calwrap"></div><div class="phone-col" id="phonecol"></div>`;
  body.appendChild(grid);
  demoRender();                 // paint calendar + phone at current cursor
}

// full repaint of both panels for current cursor
function demoRender() {
  const cw = $('#calwrap'), pc = $('#phonecol');
  if (!cw || !pc) return;
  renderCalendar(cw);
  renderPhone(pc);
}

function renderCalendar(root) {
  const dm = S.demo, t = S.task;
  const cur = dm.days[dm.cur];
  const y = cur.getFullYear(), mo = cur.getMonth();
  const dayN = dm.cur + 1, total = dm.days.length;
  root.innerHTML =
    `<div class="cal-top">` +
      `<div class="cal-month">${y}年${mo + 1}月 <span class="cal-sub">${esc(catLabel(t.category))} · ${esc(t.name)}</span></div>` +
      `<div class="cal-timenav">` +
        `<button class="cal-nav" id="d-prev" title="前一天">‹</button>` +
        `<span class="cal-cursor">模拟时间 <b>${y}年${mo + 1}月${cur.getDate()}日</b> · 第 ${dayN}/${total} 天</span>` +
        `<button class="cal-nav" id="d-next" title="后一天">›</button>` +
      `</div>` +
      `<button class="cal-auto${dm.playing ? ' on' : ''}" id="d-play">${dm.playing ? '⏸ 暂停' : '▶ 自动播放'}</button>` +
    `</div>` +
    `<input type="range" class="cal-range" id="d-range" min="0" max="${total - 1}" value="${dm.cur}">` +
    `<div class="cal-weekdays">${WEEKDAYS.map(w => `<div>${w}</div>`).join('')}</div>` +
    `<div class="cal-grid" id="calgrid"></div>` +
    `<div class="cal-legend">` +
      Object.values(EV_META).map(m => `<span><i class="dot ${m.cls}"></i>${m.label}</span>`).join('') +
    `</div>`;

  // build the month grid (leading blanks from weekday of day 1)
  const gridEl = root.querySelector('#calgrid');
  const first = new Date(y, mo, 1);
  const lead = first.getDay();
  const daysInMonth = new Date(y, mo + 1, 0).getDate();
  const curKey = dkey(cur);
  for (let i = 0; i < lead; i++) gridEl.appendChild(el('div', 'cal-cell other'));
  for (let dnum = 1; dnum <= daysInMonth; dnum++) {
    const cellDate = new Date(y, mo, dnum);
    const k = dkey(cellDate);
    const evs = (dm.byDay[k] || []);
    const inRange = cellDate >= dm.lo && cellDate <= dm.hi;
    const future = cellDate > cur;
    const cell = el('div', 'cal-cell' + (k === curKey ? ' today' : '') + (future ? ' future' : '') + (inRange ? '' : ' oob'));
    const wx = weatherGlyph(evs);
    let inner = `<div class="ch"><span class="dn">${dnum}</span>${wx ? `<span class="wx">${wx}</span>` : ''}</div>`;
    const shown = evs.slice(0, 3);
    for (const e of shown) {
      const meta = EV_META[e.kind] || { icon: '•', cls: '' };
      let label = e.kind === 'user_message' ? '用户消息'
        : e.kind === 'mutation' ? firstLine(mutLabel(e), 14)
        : (e.actor ? e.actor.replace(/_mock$/, '') + '：' : '') + firstLine(e.body, 14);
      inner += `<div class="cal-ev ${meta.cls}"><span class="ei">${meta.icon}</span>${esc(label || meta.label || '')}</div>`;
    }
    if (evs.length > shown.length) inner += `<div class="cal-more">+${evs.length - shown.length}</div>`;
    cell.innerHTML = inner;
    if (inRange) cell.addEventListener('click', () => { demoStop(); demoSeekKey(k); });
    gridEl.appendChild(cell);
  }

  root.querySelector('#d-prev').addEventListener('click', () => { demoStop(); demoSeek(dm.cur - 1); });
  root.querySelector('#d-next').addEventListener('click', () => { demoStop(); demoSeek(dm.cur + 1); });
  root.querySelector('#d-play').addEventListener('click', demoTogglePlay);
  root.querySelector('#d-range').addEventListener('input', e => { demoStop(); demoSeek(+e.target.value); });
}

function mutLabel(e) {
  const ap = (e.apply || [])[0];
  if (!ap) return '状态变更';
  if (ap.mode === 'tool') return (ap.tool || '工具调用').replace(/^API-/, '');
  if (ap.table) return ap.op + ' ' + ap.table;
  return '状态变更';
}

// map cursor day -> reveal chat steps whose time <= end of that day
function renderPhone(root) {
  const dm = S.demo;
  const cur = dm.days[dm.cur];
  const cutoff = addDays(cur, 1);              // include everything on the cursor day
  const t = S.task;
  const agentName = (catLabel(t.category) || 'AI') + ' Agent';

  let msgs = [];
  if (S.trial && S.trial.steps) {
    for (const st of S.trial.steps) {
      const d = pdate(st.time); if (!d) continue;
      if (d >= cutoff) continue;
      if (st.kind === 'inject' && st.subtype === 'user_message') msgs.push({ who: 'user', time: st.time, text: stripPrefix(st.text) });
      else if (st.kind === 'agent_text') msgs.push({ who: 'agent', time: st.time, text: st.text });
      else if (st.kind === 'inject' && (st.subtype === 'world' || st.subtype === 'notification'))
        msgs.push({ who: 'sys', sub: st.subtype, actor: st.actor, time: st.time, text: stripPrefix(st.text) });
    }
  }

  root.innerHTML =
    `<div class="phone">` +
      `<div class="phone-notch"></div>` +
      `<div class="phone-hd">` +
        `<span class="ph-back">‹</span>` +
        `<div class="ph-ava">🤖</div>` +
        `<div class="ph-id"><div class="ph-nm">${esc(agentName)}</div><div class="ph-st">智能助手 · 在线</div></div>` +
      `</div>` +
      `<div class="phone-body" id="phbody"></div>` +
      `<div class="phone-input"><span>输入你的问题或需求…</span><i class="send">➤</i></div>` +
    `</div>`;

  const pb = root.querySelector('#phbody');
  if (!S.attempt) { pb.innerHTML = '<div class="ph-empty">该任务无轨迹。</div>'; return; }
  if (!S.trial) { pb.innerHTML = '<div class="ph-empty">加载对话…</div>'; return; }
  if (!msgs.length) { pb.innerHTML = '<div class="ph-empty">这一天还没有对话，拖动时间线或点“自动播放”继续。</div>'; return; }

  let lastDay = '';
  for (const m of msgs) {
    const d = pdate(m.time), k = dkey(d);
    if (k !== lastDay) {
      lastDay = k;
      const rel = Math.round((d - dm.lo) / 86400000) + 1;
      pb.appendChild(el('div', 'day-div', `${d.getMonth() + 1}月${d.getDate()}日 · 第 ${rel} 天`));
    }
    const hhmm = (String(m.time).match(/T(\d{2}:\d{2})/) || [, ''])[1];
    if (m.who === 'sys') {
      const meta = EV_META[m.sub] || {};
      pb.appendChild(el('div', 'msg sys',
        `<div class="bubble">${meta.icon || ''} <b>${m.sub === 'world' ? '世界事件' : '通知'}</b>` +
        `${m.actor ? ' · ' + esc(m.actor.replace(/_mock$/, '')) : ''}<div class="sys-tx">${esc(firstLine(m.text, 160))}</div></div>`));
    } else {
      const cls = m.who === 'user' ? 'user' : 'agent';
      pb.appendChild(el('div', 'msg ' + cls,
        `<div class="bubble">${mdChat(m.text)}</div><div class="msg-time">${hhmm}</div>`));
    }
  }
  pb.scrollTop = pb.scrollHeight;
}

// lightweight chat markdown: bold, inline code, bullets, line breaks
function mdChat(src) {
  const inline = t => esc(t)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  const lines = String(src || '').split('\n');
  let out = '', inUl = false;
  for (const ln of lines) {
    const m = ln.match(/^\s*[-*]\s+(.*)/);
    if (m) { if (!inUl) { out += '<ul>'; inUl = true; } out += `<li>${inline(m[1])}</li>`; }
    else { if (inUl) { out += '</ul>'; inUl = false; } if (ln.trim()) out += `<div>${inline(ln)}</div>`; }
  }
  if (inUl) out += '</ul>';
  return out;
}

function demoSeek(idx) {
  const dm = S.demo;
  idx = Math.max(0, Math.min(dm.days.length - 1, idx));
  dm.cur = idx;
  demoRender();
}
function demoSeekKey(k) {
  const i = S.demo.dayKeys.indexOf(k);
  if (i >= 0) demoSeek(i);
}
function demoTogglePlay() { S.demo.playing ? demoStop() : demoStart(); }
function demoStart() {
  const dm = S.demo;
  if (dm.cur >= dm.days.length - 1) dm.cur = 0;
  dm.playing = true;
  const b = $('#d-play'); if (b) { b.textContent = '⏸ 暂停'; b.classList.add('on'); }
  dm.timer = setInterval(() => {
    if (dm.cur >= dm.days.length - 1) { demoStop(); return; }
    demoSeek(dm.cur + 1);
  }, 900);
}
function demoStop() {
  const dm = S.demo;
  dm.playing = false;
  if (dm.timer) clearInterval(dm.timer);
  dm.timer = null;
  const b = $('#d-play'); if (b) { b.textContent = '▶ 自动播放'; b.classList.remove('on'); }
}

// ------------------------------------------------------------------ API modal
function openApiModal(focusServer) {
  $('#api-modal').hidden = false;
  $('#api-search').value = '';
  renderApiBody('', focusServer);
}
function renderApiBody(q, focusServer) {
  const bodyEl = $('#api-body'); bodyEl.innerHTML = '';
  const names = Object.keys(S.servers).sort();
  for (const name of names) {
    const s = S.servers[name];
    const tools = (s.tools || []).filter(t =>
      !q || t.name.toLowerCase().includes(q) || (t.doc || '').toLowerCase().includes(q));
    if (q && !tools.length && !name.toLowerCase().includes(q)) continue;
    const block = el('div', 'srv-block');
    const open = !!focusServer && (name === focusServer);
    if (open) block.classList.add('open');
    const top = el('div', 'srv-top');
    top.innerHTML = `<span class="snm">${esc(name)}</span><span class="blurb">${esc(s.blurb || '')}</span><span class="cnt">${(s.tools || []).length} 工具</span>`;
    top.addEventListener('click', () => block.classList.toggle('open'));
    block.appendChild(top);
    const inner = el('div', 'srv-inner');
    for (const t of (q ? tools : s.tools || [])) inner.appendChild(renderTool(t));
    block.appendChild(inner);
    bodyEl.appendChild(block);
    if (q) block.classList.add('open');
  }
  if (!bodyEl.children.length) bodyEl.innerHTML = '<div class="loading">无匹配工具</div>';
}

boot();
