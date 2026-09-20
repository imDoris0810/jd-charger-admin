/* ============================================================
   充电桩安装协同管理后台 · 交互原型脚本
   ------------------------------------------------------------
   职责：路由、权限判定与渲染。
   数据（模拟数据、角色、权限矩阵、工单、版本、状态）见 prototype.data.js，
   该文件必须先于本文件加载。

   本原型无真实后端，所有数据为虚构演示数据。
   ============================================================ */

/* ---------- 运行时状态 ---------- */
let CURRENT_ROLE = 'verifier';
let CURRENT_PAGE = 'l1';
let TODO_GROUP = 'confirm';
let CANVAS_ORDER_ID = null;
let CANVAS_STAGE = 'handover';
let W5_CONFIG_ID = 'cfg-cn-001';
let W5_VERSION_ID = null;

/* 阶段 → AI 场景（facts 阶段无 AI 场景，也不发起正式动作） */
const STAGE_SCENARIO = {
  handover: 'material_organizing',
  review: 'verification_assistance',
  recon: 'reconciliation_explanation'
};
const C6_STAGE_NAME = { handover: '资料正式提交', review: '正式核查结论', recon: '对账正式确认' };
const C6_TARGET = { handover: '京东安装管理系统', review: '京东安装管理系统', recon: '对账工作区' };
const RA_OF_STAGE = { handover: 'R-A1', review: 'R-A2', recon: 'R-A3' };
const SCENARIO_BIZ = {
  mapping_suggestion: '字段映射建议',
  material_organizing: '资料整理草稿',
  verification_assistance: 'AI 核查辅助',
  reconciliation_explanation: '差异解释草稿'
};
const STAGE_NEXT = {
  handover: '人工确认后，由「资料正式提交」提交至京东安装管理系统',
  review: '复核通过后，由「正式核查结论」形成正式结论',
  recon: '确认无误后，由「对账正式确认」形成对账确认结果',
  facts: '核对完成后返回资料交接或核查阶段继续处理'
};

/* ============================================================
   路由表（v2.1 §1.3）
   ------------------------------------------------------------
   L1 #l1 · L2 #l2 · L3 #l3 · W6 #w6 · W5 #w5
   L4 #w4/<工单号>/<阶段>  阶段 ∈ handover | review | recon | facts
   ============================================================ */
const PAGE_META = {
  l1: ['角色工作台', '工作台 / 角色工作台'],
  l2: ['任务队列', '工作台 / 任务队列'],
  l3: ['工单中心', '工作台 / 工单中心'],
  w6: ['业务对账工作区', '工作台 / 业务对账工作区'],
  w5: ['接入配置工作区', '工作台 / 接入配置工作区'],
  w4: ['工单协同画布', '工作台 / 工单中心 / 工单协同画布']
};

/* L4 中栏阶段（v2.1 §6.4） */
const STAGES = ['handover', 'review', 'recon', 'facts'];
const STAGE_LABEL = { handover: '资料交接', review: '核查', recon: '对账', facts: '事实核对' };

/* C6 随阶段变化的正式动作说明（写入逻辑在 M8 实现） */
const STAGE_C6 = {
  handover: '资料正式提交：调用京东安装管理系统提交能力，收到成功回执后写入 R-A1。',
  review: '正式核查结论：由新后台发起时经此区提交；原系统已形成时呈只读同步态。成功后写入 R-A2。',
  recon: '对账正式确认：经此区形成对账确认结果，写入 R-A3。',
  facts: '事实核对阶段不发起正式动作——变更是否有效由原业务系统和原岗位判断。'
};

/* 队列动作类型 → 落地阶段（任务来源优先） */
const STAGE_FOR_ACTION = {
  '确认': 'review', '补充': 'handover', '解释': 'recon', '失败': 'handover', '等待': 'handover'
};

/* ============================================================
   角色与导航
   ============================================================ */
function renderRoleMenu() {
  const jd = Object.entries(ROLES).filter(([, r]) => r.side === 'jd');
  const pv = Object.entries(ROLES).filter(([, r]) => r.side === 'provider');
  const item = ([k, r]) =>
    `<button class="role-opt ${k === CURRENT_ROLE ? 'active' : ''}" onclick="setRole('${k}')">
       ${r.title}<div class="who">${r.name} · ${r.side === 'jd' ? '京东内部（内网）' : '服务商侧（公网账号）'}</div>
     </button>`;
  document.getElementById('role-menu').innerHTML =
    `<div class="group-label">京东内部 · 仅限内网</div>${jd.map(item).join('')}
     <div class="group-label">服务商侧 · 公网账号鉴权</div>${pv.map(item).join('')}`;
}

function toggleRoleMenu(e) {
  e.stopPropagation();
  document.getElementById('role-menu').classList.toggle('open');
}
document.addEventListener('click', () => document.getElementById('role-menu').classList.remove('open'));

/* 一级导航点击：事件委托，仅绑定一次。
   有权限的整行可点击；无权限项已被 hidden，不响应。 */
document.addEventListener('click', (e) => {
  const btn = e.target.closest && e.target.closest('.nav-item');
  if (!btn || btn.hidden || btn.disabled) return;
  const page = btn.dataset.page;
  if (!page || !PAGE_META[page]) return;
  if (!ROLES[CURRENT_ROLE].pages.includes(page)) return;
  go(page);
});
/* 键盘可达：Enter / Space 触发 */
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  const btn = e.target.closest && e.target.closest('.nav-item');
  if (!btn || btn.hidden) return;
  e.preventDefault(); go(btn.dataset.page);
});

/* ============================================================
   页面级隔离（R-15）
   ------------------------------------------------------------
   无权页面**不得把内容留在 DOM 中**——仅靠 CSS 隐藏页面，
   数据仍可被搜索、被 DevTools 读到。此处对无权页面做内容剥离，
   切回有权限的角色时从缓存还原。

   ⚠ 静态原型模拟。prototype.data.js 本身在客户端完整加载，
     真正的隔离必须由服务端鉴权实现。
   ============================================================ */
const PAGE_CACHE = {};

function applyPagePermissions(role) {
  document.querySelectorAll('.page').forEach(sec => {
    if (!(sec.id in PAGE_CACHE)) PAGE_CACHE[sec.id] = sec.innerHTML;
    const id = sec.id.replace('page-', '');
    const allowed = role.pages.includes(id);
    if (allowed) {
      if (sec.dataset.stripped === '1') {
        sec.innerHTML = PAGE_CACHE[sec.id];
        sec.dataset.stripped = '0';
      }
    } else if (sec.dataset.stripped !== '1') {
      sec.innerHTML = `<div class="card"><div class="empty">
        <div class="big">无权访问</div>
        当前角色（${role.title}）无权访问本页面。<br>
        <span style="font-size:12px;color:var(--subtle)">组织与服务商维度的数据隔离</span>
      </div></div>`;
      sec.dataset.stripped = '1';
    }
  });
}

/* 区块级隔离：标记为京东内部专属的区块，服务商侧不得留在 DOM。
   须在 applyPagePermissions 之后调用——页面还原会把区块一并还原。 */
const BLOCK_CACHE = {};

function applyBlockScopes(role) {
  document.querySelectorAll('[data-scope="jd-only"]').forEach(el => {
    const key = el.id || el.dataset.scopeKey;
    if (!key) return;
    if (!(key in BLOCK_CACHE)) BLOCK_CACHE[key] = el.innerHTML;
    if (role.side === 'jd') {
      if (el.dataset.stripped === '1') {
        el.innerHTML = BLOCK_CACHE[key];
        el.dataset.stripped = '0';
        el.hidden = false;
      }
    } else if (el.dataset.stripped !== '1') {
      // 内容剥离后元素本身也不再可见，避免留下空白可点行
      el.innerHTML = '';
      el.dataset.stripped = '1';
      el.hidden = true;
    }
  });
}

/* 工单级区块隔离：抽屉内容源标了 data-order，只有能看见该工单的角色
   才把内容保留在 DOM 中。服务商侧看不到他方工单的完整事实与历史。 */
function applyOrderScopes(role) {
  const visibleIds = new Set(visibleWorkOrders(CURRENT_ROLE).map(o => o.id));
  document.querySelectorAll('[data-order]').forEach(el => {
    const key = 'ord:' + el.dataset.order + ':' + (el.dataset.view || '') + ':' + el.id;
    if (!(key in BLOCK_CACHE)) BLOCK_CACHE[key] = el.innerHTML;
    if (visibleIds.has(el.dataset.order)) {
      if (el.dataset.stripped === '1') {
        el.innerHTML = BLOCK_CACHE[key];
        el.dataset.stripped = '0';
      }
    } else if (el.dataset.stripped !== '1') {
      el.innerHTML = '';
      el.dataset.stripped = '1';
    }
  });
}

function setRole(key) {
  CURRENT_ROLE = key;
  TODO_GROUP = 'confirm';
  const r = ROLES[key];
  document.getElementById('user-avatar').textContent = r.initial;
  document.getElementById('user-name').textContent = r.name;
  document.getElementById('user-role').textContent = r.title;
  document.getElementById('role-btn-label').textContent = r.title;
  document.getElementById('perm-text').textContent = r.perm;
  document.getElementById('role-menu').classList.remove('open');

  applyPagePermissions(r);
  applyBlockScopes(r);
  applyOrderScopes(r);

  document.querySelectorAll('.nav-item').forEach(btn => {
    const allowed = r.pages.includes(btn.dataset.page);
    btn.hidden = !allowed;
    btn.disabled = !allowed;
    btn.title = allowed ? '' : `当前角色（${r.title}）无「${btn.textContent.trim()}」权限`;
  });

  renderProviderFilter();
  renderStatusFilters();
  renderOwnerFilter();

  const target = r.pages.includes(CURRENT_PAGE) ? CURRENT_PAGE : 'l1';
  go(target);

  renderL1();
  renderTodoGroups();
  renderOrders();
  renderTodos();
  renderW6();
  renderW5();

  // 角色切换后重画布：可能从「可见」变为「无权」，必须重新判定
  if (CURRENT_PAGE === 'w4' && CANVAS_ORDER_ID) {
    openCanvas(CANVAS_ORDER_ID, parseHash().stage);
  }

  renderRoleMenu();
}

/* ============================================================
   路由
   ============================================================ */
function go(page) {
  CURRENT_PAGE = page;
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const el = document.getElementById('page-' + page);
  if (el) el.classList.add('active');
  document.querySelectorAll('.nav-item').forEach(b =>
    b.classList.toggle('active', b.dataset.page === page));
  const meta = PAGE_META[page] || PAGE_META.l1;
  document.getElementById('page-title').textContent = meta[0];
  document.getElementById('page-crumb').textContent = meta[1];
  if (parseHash().page !== page) location.hash = page;
  window.scrollTo(0, 0);
}

function parseHash() {
  const raw = location.hash.slice(1);
  const qi = raw.indexOf('?');
  const path = qi >= 0 ? raw.slice(0, qi) : raw;
  const params = new URLSearchParams(qi >= 0 ? raw.slice(qi + 1) : '');
  const parts = path.split('/');
  const page = parts[0] || '';
  const a2 = parts[1] || '';
  const a3 = parts[2] || '';
  return {
    page,
    orderId: a2,
    stage: STAGES.includes(a3) ? a3 : '',
    diff: params.get('diff') || '',
    params
  };
}

window.addEventListener('hashchange', () => {
  const { page, orderId, stage, diff } = parseHash();
  if (!page || !PAGE_META[page]) return;
  if (!ROLES[CURRENT_ROLE].pages.includes(page)) return;
  if (page !== CURRENT_PAGE) go(page);
  if (page === 'w4') openCanvas(orderId, stage, diff);
});

/* ============================================================
   L1 / L2 / L3 —— 全部由 WORK_ORDERS 派生，不另行硬编码
   ============================================================ */

/* ---------- 筛选器：选项一律按可见数据生成 ---------- */
function _fillSelect(id, values, placeholder, fmt) {
  const sel = document.getElementById(id);
  if (!sel) return;
  const cur = sel.value;
  sel.innerHTML = `<option value="">${placeholder}</option>` +
    values.map(v => `<option value="${v}">${fmt ? fmt(v) : v}</option>`).join('');
  sel.value = values.includes(cur) ? cur : '';
}

function renderProviderFilter() {
  _fillSelect('f-provider', visibleProviders(CURRENT_ROLE), '全部服务商');
}

/* 三条状态链各自独立筛选；选项来自可见工单，不得列出无权状态 */
function renderStatusFilters() {
  const vis = visibleWorkOrders(CURRENT_ROLE);
  _fillSelect('f-fulfill', [...new Set(vis.map(o => o.fulfillment.label))].sort(),
    '现场履约 · 全部', v => `现场履约 · ${v}`);
  _fillSelect('f-handover', [...new Set(vis.map(o => o.handover.label))].sort(),
    '资料交接 · 全部', v => `资料交接 · ${v}`);
  _fillSelect('f-settle', [...new Set(vis.map(o => o.settlement.label))].sort(),
    '业务对账 · 全部', v => `业务对账 · ${v}`);
}

function renderOwnerFilter() {
  const vis = visibleWorkOrders(CURRENT_ROLE);
  _fillSelect('f-owner', [...new Set(vis.map(o => o.owner))].sort(), '全部责任岗位');
}

/* ---------- L3 工单中心 ---------- */
function badge(o) {
  return `<span class="badge badge-${o.tone}"><span class="dot"></span>${o.label}</span>`;
}

function orderHasError(o) { return (o.tasks || []).some(t => t.actionType === '失败'); }

function renderOrders() {
  const body = document.getElementById('orders-body');
  if (!body) return;
  const q = (document.getElementById('q').value || '').trim().toLowerCase();
  const fp = document.getElementById('f-provider').value;
  const ff = document.getElementById('f-fulfill').value;
  const fh = document.getElementById('f-handover').value;
  const fs = document.getElementById('f-settle').value;
  const fo = document.getElementById('f-owner').value;
  const sort = document.getElementById('f-sort').value;

  let rows = visibleWorkOrders(CURRENT_ROLE).filter(o => {
    if (fp && o.provider !== fp) return false;
    if (ff && o.fulfillment.label !== ff) return false;
    if (fh && o.handover.label !== fh) return false;
    if (fs && o.settlement.label !== fs) return false;
    if (fo && o.owner !== fo) return false;
    if (q && !(o.id + o.provider + o.project).toLowerCase().includes(q)) return false;
    return true;
  });

  rows = rows.slice().sort((a, b) => {
    if (sort === 'id') return a.id < b.id ? -1 : 1;
    const cmp = a.updatedAt < b.updatedAt ? -1 : (a.updatedAt > b.updatedAt ? 1 : 0);
    return sort === 'updated' ? -cmp : cmp;
  });

  body.innerHTML = rows.length ? rows.map(o => `
    <tr class="clickable" onclick="goCanvas('${o.id}')">
      <td class="mono">${o.id}</td>
      <td>${o.provider}<div class="sub">${o.project}</div></td>
      <td>${o.owner}</td>
      <td>${badge(o.fulfillment)}</td>
      <td>${badge(o.handover)}</td>
      <td>${badge(o.settlement)}</td>
      <td>${(o.tasks || []).length ? `<span class="tag-amber">${o.tasks.length} 项</span>` : '<span class="tag">—</span>'}</td>
      <td style="color:var(--muted); font-size:12.5px">${relTime(o.updatedAt)}</td>
    </tr>`).join('') : `<tr><td colspan="8"><div class="empty">没有符合条件的工单</div></td></tr>`;

  document.getElementById('orders-count').textContent = `共 ${rows.length} 条`;
}

/* ---------- L1 角色工作台 ---------- */
function renderL1() {
  const b = buildBrief(CURRENT_ROLE);
  setTxt('l1-brief', b.text);
  setTxt('l1-brief-meta',
    `角色 ${b.role}　｜　待我处理 ${b.mineCount}　超期 ${b.overdueCount}　` +
    `等待对方 ${b.waitingCount}　处理失败 ${b.failedCount}`);

  const g = document.getElementById('l1-groups');
  const canL2 = ROLES[CURRENT_ROLE].pages.includes('l2');
  if (g) {
    if (canL2) {
      // 动作入口卡：数量 + 一句任务解释 + 最紧急事项 + 明确进入动作
      const active = ACTION_GROUPS.filter(gr => b.counts[gr.key] > 0);
      const zeros = ACTION_GROUPS.filter(gr => b.counts[gr.key] === 0);
      g.style.gridTemplateColumns = `repeat(${Math.max(active.length, 1)}, minmax(0,1fr))`;
      g.innerHTML = active.map(gr => {
        const n = b.counts[gr.key];
        const list = tasksInGroup(CURRENT_ROLE, gr.key);
        const urgent = list.slice().sort((x, y) => {
          if (x.blocking !== y.blocking) return x.blocking ? -1 : 1;
          return (x.deadline || '9999') < (y.deadline || '9999') ? -1 : 1;
        })[0];
        return `
        <div class="ag-card ${gr.key}${n ? '' : ' zero'}"
             role="button" tabindex="0"
             onclick="go('l2');setTodoGroup('${gr.key}')"
             onkeydown="if(event.key==='Enter'){go('l2');setTodoGroup('${gr.key}')}">
          <div class="ag-head">
            <span class="ag-label">${gr.label}</span>
            <span class="ag-num">${n}</span>
          </div>
          <div class="ag-desc">${AG_DESC[gr.key](n)}</div>
          ${urgent ? `<div class="ag-urgent" title="${urgent.title}">最紧急：${urgent.title}${
            isOverdue(urgent.deadline) ? '<span class="overdue"> · 已超期</span>' : ''}</div>`
            : '<div class="ag-urgent muted">当前无此类任务</div>'}
          <button class="btn btn-sm ${n && gr.key !== 'waiting' ? 'btn-primary' : ''}" ${n ? '' : 'disabled'}
            onclick="event.stopPropagation();go('l2');setTodoGroup('${gr.key}')">
            ${gr.key === 'waiting' ? '查看进展' : '进入处理'}</button>
        </div>`;
      }).join('') + (zeros.length ? `<div class="ag-zero-row">${zeros.map(gr =>
        `<span class="ag-chip" title="${AG_DESC[gr.key](0)}">${gr.label} <b>0</b></span>`).join('')}</div>` : '');
    } else {
      // 无任务队列权限：不给可点击入口，避免制造「本角色有 L2 作业权限」的预期。
      // 五分组只作只读状态提示。
      g.innerHTML = `
        <div class="role-panel">
          <div class="rp-title">本角色的作业场所不在任务队列</div>
          <div class="rp-note">
            ${ROLES[CURRENT_ROLE].title}不承担工单级任务队列作业；
            待办的配置事项在<b>接入配置工作区</b>处理。
          </div>
          <button class="btn btn-sm btn-primary" onclick="go('w5')">前往接入配置工作区 →</button>
        </div>
        <div class="rp-summary">
          <div class="rp-summary-label">只读状态提示（不可操作）</div>
          ${ACTION_GROUPS.map(gr => `<span class="rp-chip">${gr.label}
            <b>${b.counts[gr.key]}</b></span>`).join('')}
        </div>`;
    }
  }

  const top = document.getElementById('l1-top');
  if (top) {
    top.innerHTML = b.top
      ? `<div class="brief-top">${taskCardHTML(b.top, true)}</div>`
      : `<div class="empty" style="padding:20px">暂无阻断项，其余事项可在任务队列中查看</div>`;
  }

  const allRows = myWorkOrders(CURRENT_ROLE);
  const rows = allRows.slice(0, 3);
  const tb = document.getElementById('l1-orders');
  if (tb) {
    tb.innerHTML = rows.length ? rows.map(o => `
      <tr class="clickable" onclick="goCanvas('${o.id}')">
        <td class="mono">${o.id}</td>
        <td>${o.provider}<div class="sub">${o.project}</div></td>
        <td>${badge(o.fulfillment)}</td>
        <td>${badge(o.handover)}</td>
        <td>${badge(o.settlement)}</td>
        <td>${(o.tasks || []).length ? `<span class="tag-amber">${o.tasks.length} 项</span>` : '<span class="tag">—</span>'}</td>
        <td style="color:var(--muted); font-size:12.5px">${relTime(o.updatedAt)}</td>
      </tr>`).join('') : `<tr><td colspan="7"><div class="empty">当前没有你负责的工单</div></td></tr>`;
    const c = document.getElementById('l1-orders-count');
    if (c) c.innerHTML = allRows.length > 3
      ? `显示最近 ${rows.length} / ${allRows.length} 条　<a class="clickable-link" role="button" tabindex="0" onclick="go('l3')" onkeydown="if(event.key==='Enter')go('l3')">查看全部工单 →</a>`
      : `共 ${allRows.length} 条`;
  }
}

/* ---------- L2 任务队列 ---------- */
function renderTodoGroups() {
  const box = document.getElementById('todo-group');
  if (!box) return;
  const counts = actionCounts(CURRENT_ROLE);
  box.innerHTML = ACTION_GROUPS.map(gr =>
    `<button class="${TODO_GROUP === gr.key ? 'active' : ''}" data-g="${gr.key}"
       onclick="setTodoGroup('${gr.key}')">${gr.label}<span class="count">${counts[gr.key]}</span></button>`
  ).join('');
}

function setTodoGroup(g) {
  TODO_GROUP = g;
  renderTodoGroups();
  renderTodos();
}

/* 任务卡：至少 14 个字段 */
function taskCardHTML(t, compact) {
  const role = ROLES[t.assignee];
  const isMine = t.assignee === CURRENT_ROLE;
  const grp = groupOfTask(t, CURRENT_ROLE);
  const stage = STAGE_FOR_ACTION[t.actionType] || 'handover';
  const overdue = isOverdue(t.deadline);
  const actionLabel = t.primaryAction || ACTION_LABELS[t.actionType] || '补充材料';

  const failBlock = t.actionType === '失败' ? `
    <div class="gaps" style="margin-top:10px">
      <div class="gap missing"><span class="ic">失败原因</span><span>${t.failReason || '—'}</span></div>
      <div class="gap question"><span class="ic">续办入口</span><span>${t.resumeFrom || '—'}</span></div>
    </div>` : '';

  const waitingNote = grp === 'waiting' ? `
    <div class="note" style="margin-top:10px">
      <span>ⓘ</span><span>本项在对方手中，你只能<b>查看与催办</b>，不得代替对方处理。</span>
    </div>` : '';

  const buttons = grp === 'waiting'
    ? `<button class="btn btn-sm" onclick="goCanvas('${t.orderId}','${stage}')">查看进展</button>
       <button class="btn btn-sm" disabled title="本项在对方手中，不得代办">等待 ${role.title}</button>`
    : grp === 'failed'
      ? `<button class="btn btn-sm btn-primary" onclick="goCanvas('${t.orderId}','${stage}')">查询原系统版本</button>
         <button class="btn btn-sm" onclick="goCanvas('${t.orderId}','${stage}')">从最近节点续办</button>`
      : `<button class="btn btn-sm btn-primary" onclick="goCanvas('${t.orderId}','${stage}')">${actionLabel}</button>
         <button class="btn btn-sm" onclick="goCanvas('${t.orderId}','${stage}')">进入画布</button>`;

  return `
  <div class="task ${t.tone || ''} ${grp === 'waiting' ? 'self' : ''} ${grp === 'failed' ? 'error' : ''}">
    <span class="bar"></span>
    <div class="body">
      <div class="title">${t.title}
        <span class="tag-amber">${ACTION_GROUPS.find(g => g.key === grp).label}</span>
        ${t.blocking ? '<span class="tag-orange">⛔ 阻断提交</span>' : ''}
        ${t.evidence === 'insufficient' ? '<span class="tag" style="background:var(--red-bg);color:var(--red)">证据不足</span>' : '<span class="tag-teal">证据充分</span>'}
      </div>
      <div class="why">${t.why}</div>
      <div class="meta-grid">
        <div><span class="k">工单</span><span class="mono">${t.orderId}</span></div>
        <div><span class="k">服务商 / 项目</span>${t.provider} · ${t.project}</div>
        <div><span class="k">当前阶段</span>${STAGE_LABEL[stage]}</div>
        <div><span class="k">下一步动作</span>${actionLabel}</div>
        <div><span class="k">需要什么</span>${t.need}</div>
        <div><span class="k">当前责任角色</span>${role.title} · ${role.name}</div>
        <div><span class="k">办理位置</span>${t.location}</div>
        <div><span class="k">来源系统</span>${t.src}</div>
        <div><span class="k">等待方</span>${isMine ? '本方' : '对方'}</div>
        <div><span class="k">时效</span>${overdue
          ? `<span class="overdue">已超期 · 截止 ${t.deadline}</span>`
          : `截止 ${t.deadline}（${relTime(t.deadline)}）`}</div>
        <div><span class="k">最近更新</span>${relTime(t.updatedAt)}</div>
      </div>
      ${failBlock}${waitingNote}
    </div>
    <div class="actions">${buttons}</div>
  </div>`;
}

function renderTodos() {
  const list = document.getElementById('todos-list');
  if (!list) return;
  const stage = document.getElementById('t-stage').value;
  const srcSys = document.getElementById('t-src').value;
  const ev = document.getElementById('t-evidence').value;

  let rows = visibleTasks(CURRENT_ROLE);
  if (TODO_GROUP !== 'all') rows = rows.filter(t => groupOfTask(t, CURRENT_ROLE) === TODO_GROUP);
  if (stage) rows = rows.filter(t => (STAGE_FOR_ACTION[t.actionType] || 'handover') === stage);
  if (srcSys) rows = rows.filter(t => t.src === srcSys);
  if (ev) rows = rows.filter(t => t.evidence === ev);

  rows = rows.slice().sort((a, b) => {
    const ab = a.blocking ? 0 : 1, bb = b.blocking ? 0 : 1;
    if (ab !== bb) return ab - bb;
    return (a.deadline || '9999') < (b.deadline || '9999') ? -1 : 1;
  });

  list.innerHTML = rows.length ? rows.map(t => taskCardHTML(t)).join('')
    : `<div class="card"><div class="empty"><div class="big">暂无待办</div>切换分组或筛选条件试试</div></div>`;

  document.getElementById('todos-count').textContent = `共 ${rows.length} 项`;
  document.getElementById('nav-todo-count').textContent =
    actionCounts(CURRENT_ROLE).confirm + actionCounts(CURRENT_ROLE).supply +
    actionCounts(CURRENT_ROLE).explain + actionCounts(CURRENT_ROLE).failed;
}

/* ============================================================
   W6 业务对账工作区（R-08）
   ------------------------------------------------------------
   跨工单、跨服务商、按账期查看待对账 / 差异中 / 待确认 / 已确认。
   只查看与定位，**不形成任何正式结果**；点击差异进入单工单 L4 对账阶段。
   差异全部由 computeReconciliation（普通程序）产出，AI 草稿不参与计算。
   ============================================================ */

/* 对账状态桶（映射自 settlement 状态链，不新增状态） */
const W6_STATE_OF = (s) => ({
  '未开始': '待对账', '待对账': '待对账', '有差异': '差异中',
  '处理中': '待确认', '已确认': '已确认'
}[s.label] || '待对账');

/* W6 上下文：进入 L4 时保存，返回时恢复 */
let W6_CTX = null;

function w6Rows() {
  return visibleWorkOrders(CURRENT_ROLE)
    .filter(o => o.providerLedger && o.jdLedger)
    .map(o => {
      const R = computeReconciliation(o);
      return { o, R, state: W6_STATE_OF(o.settlement),
               period: (o.recon && o.recon.period) || '—' };
    });
}

function renderW6Filters(rows) {
  _fillSelect('w6-period', [...new Set(rows.map(r => r.period))].sort().reverse(), '全部账期');
  _fillSelect('w6-provider', [...new Set(rows.map(r => r.o.provider))].sort(), '全部服务商');
  _fillSelect('w6-state', ['待对账', '差异中', '待确认', '已确认'].filter(s => rows.some(r => r.state === s)), '全部状态');
  _fillSelect('w6-cat', DIFF_CATEGORIES, '全部差异类型');
}

/* 当前筛选结果（订单级 + 差异级过滤） */
function w6Filtered() {
  const all = w6Rows();
  const fp = (document.getElementById('w6-period') || {}).value || '';
  const fv = (document.getElementById('w6-provider') || {}).value || '';
  const fs = (document.getElementById('w6-state') || {}).value || '';
  const fc = (document.getElementById('w6-cat') || {}).value || '';

  const rows = all.filter(r => {
    if (fp && r.period !== fp) return false;
    if (fv && r.o.provider !== fv) return false;
    if (fs && r.state !== fs) return false;
    return true;
  }).map(r => {
    // 差异类型筛选作用于**差异对象**：命中任一 categoryTag 即保留该对象
    const diffs = fc ? r.R.diffs.filter(d => d.categoryTags.includes(fc)) : r.R.diffs;
    return Object.assign({}, r, { diffs, catActive: !!fc });
  }).filter(r => !fc || r.diffs.length > 0);

  return { all, rows };
}

function renderW6() {
  const body = document.getElementById('w6-body');
  if (!body) return;
  const { all, rows } = w6Filtered();
  renderW6Filters(all);

  const fc = (document.getElementById('w6-cat') || {}).value || '';

  // ── 汇总带：按过滤后的订单与差异对象重新计算 ──
  const bucket = { '待对账': 0, '差异中': 0, '待确认': 0, '已确认': 0 };
  rows.forEach(r => bucket[r.state]++);
  const flatDiffs = rows.reduce((a, r) => a.concat(r.diffs), []);
  // 差异金额规模：按**唯一差异对象**计算 |amountDiff| 之和（多标签只计一次）
  const scaleSum = flatDiffs.reduce((s, d) => s + Math.abs(d.amountDiff), 0);
  // 净差额：providerLedger 总额 − jdLedger 总额，保留正负号
  const netDiff = rows.reduce((s, r) => s + (r.R.sp - r.R.jd), 0);
  const netCls = netDiff > 0 ? 'pos' : (netDiff < 0 ? 'neg' : '');
  const netNote = netDiff > 0 ? '服务商申报高于京东账单'
    : netDiff < 0 ? '京东账单高于服务商申报' : '两侧总额一致';
  setHTML('w6-summary', `
    ${Object.keys(bucket).map(k => `<div class="w6-stat">
      <div class="w6-num">${bucket[k]}</div><div class="w6-lbl">${k}</div></div>`).join('')}
    <div class="w6-stat ${netCls}">
      <div class="w6-num">${netDiff > 0 ? '+' : ''}${netDiff.toFixed(2)}</div>
      <div class="w6-lbl">净差额（元）<span class="w6-sub">服务商合计 − 京东合计</span>
        <div class="w6-sub">${netNote}</div></div></div>
    <div class="w6-stat accent">
      <div class="w6-num">${scaleSum.toFixed(2)}</div>
      <div class="w6-lbl">差异金额规模（元）<span class="w6-sub">待处理金额规模 · 非净差额</span>
        <div class="w6-sub">${flatDiffs.length} 个唯一差异对象${fc ? ' · 已按' + fc + '过滤' : ''}</div></div></div>`);

  // ── 五类聚合：按**主分类（primaryCategory）互斥计数**，五项之和 = 唯一差异对象总数。
  //    点击卡片筛选时仍按 categoryTags 命中（一个对象可命中多个标签），
  //    因此筛选结果数可能大于该卡片展示的主分类数量。
  const catCount = {}; DIFF_CATEGORIES.forEach(c => catCount[c] = 0);
  flatDiffs.forEach(d => { catCount[d.primaryCategory] = (catCount[d.primaryCategory] || 0) + 1; });
  setHTML('w6-cats',
    DIFF_CATEGORIES.map(c => `<button class="w6-cat-chip ${catCount[c] ? 'has' : ''}${fc === c ? ' on' : ''}"
      onclick="w6FilterCat('${c}')" title="点击按该类型筛选差异对象">${c} <b>${catCount[c]}</b></button>`).join('')
    + (fc ? `<button class="btn btn-sm btn-ghost" onclick="w6FilterCat('${fc}')">清除筛选</button>` : '')
    + `<span class="w6-cats-note">按<b>主分类</b>统计（五项之和 = 唯一差异对象总数）；
       点击筛选会同时命中该对象的<b>全部差异标签</b>，因此下方结果数可能大于标签数字。</span>`);

  // ── 待对账数据：工单分组父级 + 一行一个差异对象 ──
  const html = rows.map(r => {
    const R = r.R;
    const childDiffs = r.diffs;
    const sumAbs = childDiffs.reduce((s, d) => s + Math.abs(d.amountDiff), 0);
    const a0 = ROLES[r.o.ownerRole];
    const parent = `<tr class="w6-parent">
      <td class="mono">${r.o.id}</td>
      <td>${r.o.provider}<div class="sub">${r.o.project}</div></td>
      <td>${r.period}</td>
      <td>${r.state === '差异中'
        ? '<span class="badge badge-red"><span class="dot"></span>差异中</span>'
        : r.state === '已确认'
          ? '<span class="badge badge-green"><span class="dot"></span>已确认</span>'
          : `<span class="badge badge-${r.state === '待确认' ? 'amber' : 'gray'}"><span class="dot"></span>${r.state}</span>`}</td>
      <td colspan="3">${childDiffs.length
        ? `差异对象 <b>${childDiffs.length}</b> 个${fc ? `（已按 ${fc} 过滤）` : ''}`
        : '<span class="tag-teal">账目一致，无差异对象</span>'}</td>
      <td class="num" style="color:${sumAbs ? 'var(--amber)' : 'var(--muted)'}">${sumAbs ? sumAbs.toFixed(2) : '—'}</td>
      <td><button class="btn btn-sm" onclick="goCanvas('${r.o.id}','recon')">进入对账 ▸</button></td>
    </tr>`;

    if (!childDiffs.length) return parent;

    const children = childDiffs.map(d => {
      const rr = ROLES[d.assignee || r.o.ownerRole];
      const late = d.deadline ? isOverdue(d.deadline)
        : (r.o.tasks[0] && isOverdue(r.o.tasks[0].deadline));
      const dl = d.deadline || (r.o.tasks[0] && r.o.tasks[0].deadline) || null;
      return `<tr class="w6-child clickable" onclick="goCanvas('${r.o.id}','recon','${d.differenceId}')">
        <td class="mono w6-indent" data-l="差异对象 ID">${d.differenceId}</td>
        <td data-l="差异对象">${d.obj || d.jd || '—'}</td>
        <td data-l="主分类"><span class="tag-amber">${d.primaryCategory}</span></td>
        <td data-l="类型标签">${d.categoryTags.map(c => `<span class="tag">${c}</span>`).join(' ')}</td>
        <td data-l="数量差异">${d.qtyDiff ? `${d.qtyDiff.sp}${d.qtyDiff.unit || ''} / ${d.qtyDiff.jd}${d.qtyDiff.unit || ''}` : '—'}</td>
        <td class="num" data-l="金额差异">${d.amountDiff ? d.amountDiff.toFixed(2) : '—'}</td>
        <td data-l="依据状态">${d.basisStatus === '缺少依据材料'
          ? '<span class="tag" style="background:var(--red-bg);color:var(--red)">缺少依据材料</span>'
          : `<span class="tag-teal">${d.basisStatus}</span>`}</td>
        <td data-l="责任角色">${rr ? rr.title : '—'}</td>
        <td data-l="时效 / 状态">${dl ? (late ? '<span class="overdue">已超期</span>' : '截止 ' + dl.slice(5, 16)) : '—'}
          <div class="sub">${r.state === '待确认' ? '处理中 · 待确认' : r.state === '已确认' ? '已确认' : '待处理'}</div></td>
        <td><button class="btn btn-sm">处理该差异 ▸</button></td>
      </tr>`;
    }).join('');

    return parent + children;
  }).join('');

  body.innerHTML = html || `<tr><td colspan="10"><div class="empty">没有符合条件的对账数据</div></td></tr>`;
  setHTML('w6-count', `共 ${rows.length} 条工单 / ${flatDiffs.length} 个差异对象`);

  renderW6E(rows, all);
}

function w6FilterCat(cat) {
  const sel = document.getElementById('w6-cat');
  if (!sel) return;
  sel.value = sel.value === cat ? '' : cat;
  renderW6();
  renderW5();
}

/* ---------- W6-E 完整双账（页内 · 默认折叠 · 只读） ----------
   跨工单、跨服务商，按当前筛选范围只读展示。
   不修改账目、不填处理意见、不正式确认、不形成 R-A3。
   点击具体差异进入对应 L4 recon。 */
let W6E_OPEN = false;

function w6ToggleE() {
  W6E_OPEN = !W6E_OPEN;
  const el = document.getElementById('w6-e-body');
  if (el) el.hidden = !W6E_OPEN;
  const btn = document.getElementById('w6-e-toggle');
  if (btn) btn.textContent = W6E_OPEN ? '收起 ▴' : '展开 ▾';
}

function renderW6E(rows) {
  const el = document.getElementById('w6-e-body');
  if (!el) return;

  const spAll = rows.reduce((s, r) => s + r.R.sp, 0);
  const jdAll = rows.reduce((s, r) => s + r.R.jd, 0);
  const diffAll = rows.reduce((s, r) => s + (r.R.sp - r.R.jd), 0);
  const pv = [...new Set(rows.map(r => `${r.R.providerSource} ${r.R.providerVersion}`))];
  const jv = [...new Set(rows.map(r => `${r.R.jdSource} ${r.R.jdVersion}`))];
  const syncs = rows.map(r => r.R.jdSyncedAt).sort();
  const meta = rows.length ? (rows[0].R.ledgerMeta || null) : null;

  // 按「服务商 → 工单」分组，**不跨工单归并**
  const byProvider = {};
  rows.forEach(r => (byProvider[r.o.provider] = byProvider[r.o.provider] || []).push(r));

  const groups = Object.keys(byProvider).sort().map(pvName => {
    const list = byProvider[pvName];
    const gsp = list.reduce((s, r) => s + r.R.sp, 0);
    const gjd = list.reduce((s, r) => s + r.R.jd, 0);
    const orders = list.map(r => `
      <div class="w6e-order">
        <div class="w6e-order-head">
          <span class="mono">${r.o.id}</span>
          <span class="w6e-proj">${r.o.project}</span>
          <span class="spacer"></span>
          <button class="btn btn-sm" onclick="goCanvas('${r.o.id}','recon')">进入对账 ▸</button>
        </div>
        <div class="dual">
          <div class="w6e-ledger">
            <div class="col-head"><div><div class="name">服务商本地应收</div>
              <div class="src">${r.R.providerSource} · ${r.R.providerVersion} · 同步于 ${r.R.providerSyncedAt}</div></div>
              <span class="readonly-flag">🔒 只读</span></div>
            <table class="data"><tbody>
              ${r.o.providerLedger.items.map(i => `<tr><td>${i.name}</td>
                <td class="num">${i.amount.toFixed(2)}</td></tr>`).join('')}
              <tr class="total"><td>合计</td><td class="num">${r.R.sp.toFixed(2)}</td></tr>
            </tbody></table>
          </div>
          <div class="w6e-ledger">
            <div class="col-head"><div><div class="name">京东正式账单</div>
              <div class="src">${r.R.jdSource} · ${r.R.jdVersion} · 同步于 ${r.R.jdSyncedAt}</div></div>
              <span class="readonly-flag">🔒 只读</span></div>
            <table class="data"><tbody>
              ${r.o.jdLedger.items.map(i => `<tr><td>${i.name}</td>
                <td class="num">${i.amount.toFixed(2)}</td></tr>`).join('')}
              <tr class="total"><td>合计</td><td class="num">${r.R.jd.toFixed(2)}</td></tr>
            </tbody></table>
          </div>
        </div>
        ${r.diffs.length ? `<div class="w6e-diffs">${r.diffs.map(d => `
          <button class="w6e-diff" onclick="goCanvas('${r.o.id}','recon','${d.differenceId}')">
            ${d.obj || d.jd} · ${d.primaryCategory} · ${d.amountDiff.toFixed(2)} 元 ▸</button>`).join('')}</div>`
          : `<div class="note" style="margin-top:8px"><span>ⓘ</span><span>该工单两侧账目一致。</span></div>`}
      </div>`).join('');

    return `<div class="w6e-group">
      <div class="w6e-group-head">
        <span class="w6e-pv">${pvName}</span>
        <span class="sub">${list.length} 张工单</span>
        <span class="spacer"></span>
        <span class="w6e-sum">应收 ${gsp.toFixed(2)}　账单 ${gjd.toFixed(2)}　差额 <b>${(gsp - gjd).toFixed(2)}</b></span>
      </div>
      ${orders}
    </div>`;
  }).join('');

  el.innerHTML = `
    <div class="w6e-scope">
      <span class="w6e-scope-label">当前筛选范围</span>
      <span class="w6e-chip">服务商应收合计 <b>${spAll.toFixed(2)}</b></span>
      <span class="w6e-chip">京东账单合计 <b>${jdAll.toFixed(2)}</b></span>
      <span class="w6e-chip accent">净差额 <b>${diffAll > 0 ? "+" : ""}${diffAll.toFixed(2)}</b></span>
      <span class="w6e-chip">服务商账目版本 <b>${pv.join(' / ') || '—'}</b></span>
      <span class="w6e-chip">京东账目版本 <b>${jv.join(' / ') || '—'}</b></span>
      <span class="w6e-chip">最后同步 <b>${syncs.length ? syncs[syncs.length - 1] : '—'}</b></span>
    </div>
    ${meta ? `<div class="note" style="margin-top:12px">
      <span>ⓘ</span>
      <span>映射来源：<b>${meta.mappingSource}</b>（${meta.mappingRuleId} · 配置 ${meta.configVersion}）。
      <span style="color:var(--subtle)">演示快照，只读呈现，并非用户临时填写后直接生效；M6 将迁移为「已生效配置版本」提供的只读快照。</span></span>
    </div>` : ''}
    <div style="margin-top:14px">${groups || '<div class="empty">当前筛选范围内无可展示账目</div>'}</div>
    <div class="note" style="margin-top:14px">
      <span>ⓘ</span>
      <span>本区<b>只读</b>：不修改账目、不填处理意见、不进行正式确认、不形成 R-A3。
      不同工单的账目<b>各自独立呈现，不跨单归并</b>。处理具体差异请点击进入对应工单的对账阶段。</span>
    </div>`;
}

/* ============================================================
   L4 工单协同画布
   ------------------------------------------------------------
   三栏常驻：左 = 工单事实 ｜ 中 = 当前工作 ｜ 右 = 正式记录
   中栏按阶段切换，**切换不影响左右栏**。
   进入画布一律按「当前选中的工单」渲染，不做任何默认工单回退。
   ============================================================ */
const setTxt = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
const setHTML = (id, v) => { const el = document.getElementById(id); if (el) el.innerHTML = v; };

/* 从任意入口进入画布 */
function goCanvas(orderId, stage, differenceId) {
  // 从 W6 进入时保存返回上下文，返回时恢复（不回到默认首页）
  if (CURRENT_PAGE === 'w6') {
    W6_CTX = {
      period: (document.getElementById('w6-period') || {}).value || '',
      provider: (document.getElementById('w6-provider') || {}).value || '',
      state: (document.getElementById('w6-state') || {}).value || '',
      cat: (document.getElementById('w6-cat') || {}).value || '',
      eOpen: W6E_OPEN
    };
  }
  const q = differenceId ? '?diff=' + encodeURIComponent(differenceId) : '';
  location.hash = 'w4/' + orderId + '/' + (stage || '') + q;
  go('w4');
  openCanvas(orderId, stage, differenceId);
}

/* 从 L4 返回 W6：恢复筛选、分组展开与 W6-E 状态 */
function backToW6() {
  go('w6');
  if (W6_CTX) {
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
    set('w6-period', W6_CTX.period);
    set('w6-provider', W6_CTX.provider);
    set('w6-state', W6_CTX.state);
    set('w6-cat', W6_CTX.cat);
    W6E_OPEN = W6_CTX.eOpen;
    const b = document.getElementById('w6-e-body');
    if (b) b.hidden = !W6E_OPEN;
    const t = document.getElementById('w6-e-toggle');
    if (t) t.textContent = W6E_OPEN ? '收起 ▴' : '展开 ▾';
  }
  renderW6();
  renderW5();
}

/* 解析当前角色是否可查看该工单。
   无权与「不存在」必须区分，且**都不得渲染任何工单数据**。 */
function resolveCanvasOrder(orderId) {
  if (!orderId) return { ok: false, reason: 'missing' };
  const visible = visibleWorkOrders(CURRENT_ROLE).find(o => o.id === orderId);
  if (visible) return { ok: true, order: visible };
  const exists = WORK_ORDERS.some(o => o.id === orderId);
  return { ok: false, reason: exists ? 'forbidden' : 'notfound' };
}

function defaultStageFor(order) {
  // 优先根据任务来源定位
  const todo = visibleTasks(CURRENT_ROLE).find(t => t.orderId === order.id);
  if (todo && STAGE_FOR_ACTION[todo.actionType]) return STAGE_FOR_ACTION[todo.actionType];
  // 没有任务来源时根据工单下一步动作定位
  if (order.settlement.label === '有差异') return 'recon';
  if (order.handover.label === '待确认') return 'review';
  if (order.handover.label === '待补充' || order.handover.label === '异常') return 'handover';
  return 'handover';
}

let CANVAS_DIFF_ID = null;
function openCanvas(orderId, stage, differenceId) {
  const blocked = document.getElementById('canvas-blocked');
  const main = document.getElementById('canvas-main');
  if (!blocked || !main) return;

  const res = resolveCanvasOrder(orderId);
  if (!res.ok) {
    // 不渲染任何工单数据，也不回退到默认工单
    main.hidden = true;
    blocked.hidden = false;
    PAGE_META.w4[0] = '工单协同画布';
    document.getElementById('page-title').textContent = PAGE_META.w4[0];
    if (res.reason === 'notfound') {
      setTxt('blocked-title', '工单不存在或已不可用');
      setTxt('blocked-sub', '请确认工单号是否正确，或返回工单中心重新选择。');
    } else if (res.reason === 'forbidden') {
      setTxt('blocked-title', '无权访问该工单');
      setTxt('blocked-sub', `该工单不在当前角色（${ROLES[CURRENT_ROLE].title}）的组织与服务商可见范围内。`);
    } else {
      setTxt('blocked-title', '未指定工单');
      setTxt('blocked-sub', '请从任务队列、工单中心或业务对账工作区选择一张工单进入。');
    }
    return false;
  }

  main.hidden = false;
  blocked.hidden = true;
  CANVAS_ORDER_ID = res.order.id;
  CANVAS_DIFF_ID = differenceId || null;
  PAGE_META.w4[0] = `工单协同画布 · ${res.order.id}`;
  document.getElementById('page-title').textContent = PAGE_META.w4[0];

  const st = STAGES.includes(stage) ? stage : defaultStageFor(res.order);
  renderLeftCol(res.order);
  renderCrumb(res.order);
  renderRecommend(res.order, st);
  renderTaskCard(res.order);
  renderStages(res.order);
  showStage(st);
  renderC5(res.order, st);
  renderC6(res.order, st);
  renderRightCol(res.order);

  // 返回入口：从 W6 进入的回到 W6 并恢复筛选与展开状态
  const back = document.getElementById('w4-back');
  if (back) {
    if (W6_CTX) {
      back.textContent = '← 返回业务对账工作区';
      back.setAttribute('onclick', 'backToW6()');
    } else {
      back.textContent = '← 返回工单中心';
      back.setAttribute('onclick', "go('l3')");
    }
  }
  return true;
}

/* ---------- 左栏 · 工单事实 ---------- */
function renderLeftCol(order) {
  setTxt('c-order-id', order.id);
  setTxt('c-order-sub', `${order.provider} · ${order.project}`);
  setTxt('c-owner', order.owner);
  setTxt('c-location', order.location);

  const chain = [
    ['c-st-fulfill', 'c-st-fulfill-note', order.fulfillment, '数据来源：京东安装履约系统'],
    ['c-st-handover', 'c-st-handover-note', order.handover, `等 ${ROLES[order.waitingFor] ? ROLES[order.waitingFor].title : '对方'}`],
    ['c-st-settle', 'c-st-settle-note', order.settlement, order.hasDiff ? '存在待核差异' : '—']
  ];
  chain.forEach(([vid, nid, st, note]) => {
    setHTML(vid, `<span class="dot" style="background:var(--${st.tone})"></span>${st.label}`);
    setTxt(nid, note);
  });

  setTxt('fg-facts-count', order.factsConflict ? order.factsCount : '—');
}

/* ---------- 中栏 · 办理位置面包屑 ---------- */
function renderCrumb(order) {
  const nodes = ['服务商本地系统', '新协同后台', order.location];
  const curIdx = 2;
  // 已过节点可点击 → 打开对应节点的记录（原文件 / 处理过程）
  const NODE_DRAWER = { 0: 'rawfiles', 1: 'records' };
  setHTML('c1-crumb', nodes.map((n, i) => {
    if (i === curIdx) return `<span class="node cur">${n}</span>`;
    const dr = NODE_DRAWER[i];
    return `<span class="node done" role="button" tabindex="0"
      onclick="openDrawer('${dr}')" onkeydown="if(event.key==='Enter')openDrawer('${dr}')"
      title="查看该节点的记录">${n}</span>`;
  }).join('<span class="arrow">→</span>') + '<span class="arrow" style="margin-left:auto">当前办理位置</span>');
}

/* ---------- 中栏 · 当前任务卡 ---------- */
function renderTaskCard(order) {
  const todo = visibleTasks(CURRENT_ROLE).find(t => t.orderId === order.id);
  if (!todo) {
    setHTML('c2-task', `<div class="card-body"><div class="empty" style="padding:20px">
      <div class="big" style="font-size:14px">当前无待你处理的任务</div>
      可在下方阶段导航中查看本工单的其他阶段。</div></div>`);
    return;
  }
  const isMine = todo.assignee === CURRENT_ROLE;
  const a = ROLES[todo.assignee];
  const grp = groupOfTask(todo, CURRENT_ROLE);
  const stage = STAGE_FOR_ACTION[todo.actionType] || 'handover';
  const overdue = isOverdue(todo.deadline);
  const actionLabel = ACTION_LABELS[todo.actionType] || '补充材料';

  setHTML('c2-task', `
    <div class="card-head">
      <h2>当前任务<span class="desc">　${todo.title}</span></h2>
      <span class="tag-amber">${ACTION_GROUPS.find(g => g.key === grp).label}</span>
    </div>
    <div class="card-body">
      <div style="font-size:12.5px;color:var(--muted)">${todo.why}</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(158px,1fr));gap:6px 18px;margin-top:10px;font-size:12.5px">
        <div><span class="k" style="color:var(--subtle);font-size:11.5px;display:block">需要什么</span>${todo.need}</div>
        <div><span class="k" style="color:var(--subtle);font-size:11.5px;display:block">责任角色</span>${a.title} · ${a.name}</div>
        <div><span class="k" style="color:var(--subtle);font-size:11.5px;display:block">当前阶段</span>${STAGE_LABEL[stage]}</div>
        <div><span class="k" style="color:var(--subtle);font-size:11.5px;display:block">等待方</span>${isMine ? '本方' : '对方'}</div>
        <div><span class="k" style="color:var(--subtle);font-size:11.5px;display:block">证据</span>${todo.evidence === 'insufficient' ? '证据不足' : '证据充分'}</div>
        <div><span class="k" style="color:var(--subtle);font-size:11.5px;display:block">时效</span>${overdue
          ? `<span class="overdue">已超期 · 截止 ${todo.deadline}</span>`
          : `截止 ${todo.deadline}（${relTime(todo.deadline)}）`}</div>
        <div><span class="k" style="color:var(--subtle);font-size:11.5px;display:block">最近更新</span>${relTime(todo.updatedAt)}</div>
      </div>
      <div style="margin-top:12px;display:flex;gap:8px;justify-content:flex-end">
        ${isMine
          ? `<button class="btn btn-sm btn-primary" onclick="showStage('${stage}')">${actionLabel}</button>
             <button class="btn btn-sm">退回</button>`
          : `<button class="btn btn-sm" disabled>等待 ${a.title}</button>`}
      </div>
    </div>`);
}

/* ============================================================
   M4b · 中栏各阶段按「当前选中工单」动态渲染
   ------------------------------------------------------------
   handover  资料交接 → AI 整理台
   review    核查     → 问题优先
   recon     对账     → 差异优先
   facts     事实核对 → 原件对照（仅 factsConflict 时出现）

   一律从 WORK_ORDERS 的 layers / facts / recon / tasks 派生；
   数据缺失时显示「尚未取得」，**不得补造内容**。
   ============================================================ */

const NO_DATA = (t) => `<div class="empty" style="padding:16px 12px">
  <div style="font-size:13px;color:var(--text)">${t}</div>
  <span style="font-size:11.5px;color:var(--subtle)">尚未取得</span></div>`;

function paneEl(id) { return document.getElementById(id); }

/* ---------- 资料交接 · AI 整理台 ---------- */
function renderStageHandover(order) {
  const el = paneEl('s-handover');
  if (!el) return;
  const L = order.layers || {};
  const raw = L.raw || [], conv = L.converted || [], ai = L.aiDraft || [];
  const cf = L.confirmed || [], of = L.official || [];

  const latest = (a) => a.length ? a[a.length - 1] : null;
  const r = latest(raw), c = latest(conv), a = latest(ai), f = latest(cf), o = latest(of);

  const rawPane = r ? `
    <div class="bench-col">
      <div class="bench-head">原始文件<span class="tag">${r.srcName}</span></div>
      <div class="bench-meta">原记录人 ${r.by} · ${r.at}</div>
      <table class="data">${r.rows.map(x => `<tr>
        <td class="mono">${x.f}</td>
        <td class="num">${x.v}</td><td>${x.u}</td></tr>`).join('')}</table>
    </div>` : `<div class="bench-col">${NO_DATA('未取得原始文件')}</div>`;

  const convPane = c ? `
    <div class="bench-col">
      <div class="bench-head">程序转换结果<span class="tag">${c.cfg}</span></div>
      <div class="bench-meta">${c.by} · ${c.at}</div>
      <table class="data">${c.rows.map(x => `<tr>
        <td>${x.rule && x.rule.indexOf('无对应项') >= 0
              ? `<span class="field-unconfirmed">${x.item}</span>` : x.item}</td>
        <td class="num">${x.amount}</td>
        <td class="sub">${x.rule}</td></tr>`).join('')}</table>
    </div>` : `<div class="bench-col">${NO_DATA('程序转换结果')}</div>`;

  const aiPane = a ? `
    <div class="bench-col">
      <div class="layer draft" style="margin:0">
        <div class="layer-head">
          <span class="t">AI 整理草稿</span>
          <span class="badge badge-ai"><span class="dot"></span>AI 草稿</span>
          <span class="spacer"></span>
          <span class="meta">置信度 ${a.conf} · ${a.at}</span>
        </div>
        <div>${a.text}</div>
        <div class="evidence-line">
          <span>依据 ${a.evidence.length} 条</span>
          <span class="clickable-link" onclick="openDrawer('evidence')">展开查看依据 →</span>
        </div>
        <div class="gaps">
          ${a.missing.map(m => `<div class="gap missing"><span class="ic">缺失证据</span><span>${m}</span></div>`).join('')}
          ${a.questions.map(q => `<div class="gap question"><span class="ic">待人工确认</span><span>${q}</span></div>`).join('')}
        </div>
      </div>
    </div>` : `<div class="bench-col">${NO_DATA('AI 整理草稿（本单未生成）')}</div>`;

  el.innerHTML = `
    <div class="note primary" style="margin-bottom:16px">
      <span>ⓘ</span>
      <span><b>AI 整理台</b>：左侧为服务商原始文件，中间为普通程序的确定性转换结果，
      右侧为 AI 整理草稿。<b>三者并列呈现，互不覆盖</b>。</span>
    </div>

    <div class="bench">${rawPane}${convPane}${aiPane}</div>
    ${aiDraftCard(aiDraftOf('material_organizing', order), { actions: false })}

    <div class="sect">记录层级（后一层不得覆盖前一层）</div>

    ${f ? `<div class="layer confirmed">
      <div class="layer-head">
        <span class="t">④ 人工确认稿</span>
        <span class="badge badge-blue"><span class="dot"></span>人工确认</span>
        <span class="spacer"></span>
        <span class="meta">确认人 ${f.by} · ${f.at}</span>
      </div>
      <div style="font-size:13px">${f.text}</div>
      <div class="note" style="margin-top:10px">
        <span>ⓘ</span><span>人工确认稿是<b>过程材料</b>，不构成正式记录；须经当前阶段正式动作区
        与<b>原系统成功回执</b>后才形成正式版本。</span>
      </div>
    </div>` : `<div class="layer">${NO_DATA('人工确认稿')}</div>`}

    ${o ? `<div class="layer official">
      <div class="layer-head">
        <span class="t">⑤ 正式提交版本</span>
        <span class="badge badge-green"><span class="dot"></span>正式 ${o.v}</span>
        <span class="spacer"></span>
        <span class="meta">${o.at} · 提交人 ${o.by}</span>
      </div>
      <dl class="kv">
        <dt>提交位置</dt><dd>${order.location}</dd>
        <dt>原系统回执号</dt><dd class="mono">${o.ref}</dd>
      </dl>
    </div>` : `<div class="layer">${NO_DATA('正式提交版本')}</div>`}
  `;
}

/* ---------- 核查 · 问题优先 ---------- */
function renderStageReview(order) {
  const el = paneEl('s-review');
  if (!el) return;

  // ① 问题列表：来自待办与变更事实（**不是**程序校验结果）
  const problems = [];
  (order.tasks || []).forEach(t => {
    if (t.evidence === 'insufficient') {
      problems.push({ kind: t.actionType === '失败' ? '风险' : '缺失',
        title: t.title, why: t.why, need: t.need,
        owner: ROLES[t.assignee] ? ROLES[t.assignee].title : '—',
        state: t.blocking ? '阻断正式提交' : '不阻断提交' });
    }
  });
  (order.factChanges || []).forEach(fc => {
    if (fc.approval !== 'approved') {
      problems.push({ kind: '矛盾', title: `${fc.item}　缺少有效批准材料`,
        why: `变更原因：${fc.reason}；影响字段：${fc.fields.join('、')}。`,
        need: '有效的批准 / 确认材料', owner: '原业务岗位',
        state: fc.approval === 'pending' ? '审批中' : '未提交审批' });
    }
  });

  const problemsHTML = problems.length ? problems.map(p => `
    <div class="task ${p.kind === '缺失' || p.kind === '风险' ? 'error' : ''}">
      <span class="bar"></span>
      <div class="body">
        <div class="title">${p.title}<span class="tag-amber">${p.kind}</span></div>
        <div class="why">${p.why}</div>
        <div class="meta-grid">
          <div><span class="k">需要什么</span>${p.need}</div>
          <div><span class="k">责任角色</span>${p.owner}</div>
          <div><span class="k">影响</span>${p.state}</div>
        </div>
      </div>
      <div class="actions">
        <button class="btn btn-sm" onclick="showStage('handover')">查看原始材料</button>
        <button class="btn btn-sm" onclick="openDrawer('evidence')">依据</button>
      </div>
    </div>`).join('') : `<div class="empty" style="padding:18px">暂无待处理问题</div>`;

  // ② 程序校验结果：独立数据源，四类，**由普通程序产生，非 AI 结论**
  const vr = validationOf(order);
  const vrHTML = vr.length ? vr.map(v => {
    const tone = v.status === 'fail' ? 'red' : (v.status === 'na' ? 'gray' : 'green');
    const label = { pass: '通过', fail: '未通过', na: '不适用' }[v.status] || v.status;
    return `<tr>
      <td class="mono">${v.ruleId}</td>
      <td><span class="tag">${v.type}</span></td>
      <td><span class="badge badge-${tone}"><span class="dot"></span>${label}</span></td>
      <td>${v.field && v.field !== '—' ? v.field : (v.object || '—')}</td>
      <td>${v.message}</td>
      <td class="sub">${v.source}<div class="sub">${v.checkedAt}</div></td>
    </tr>`;
  }).join('') : '';

  el.innerHTML = `
    <div class="note primary" style="margin-bottom:16px">
      <span>ⓘ</span>
      <span><b>问题优先</b>：先看问题清单，再核对程序校验结果与原始材料。
      两者是<b>相互独立的数据源</b>——问题清单来自待办与变更事实，
      校验结果来自普通程序。<b>AI 只提供提示与依据，不形成正式核查结论</b>。</span>
    </div>

    ${aiDraftCard(aiDraftOf('verification_assistance', order), { actions: false })}
    <div class="sect">待处理问题（${problems.length}）</div>
    ${problemsHTML}

    <div class="sect">程序校验结果（${vr.length} · <span class="tag-proc">普通程序输出</span>）</div>
    ${vr.length ? `<div class="card" style="margin:0"><div class="card-body tight">
      <table class="data">
        <thead><tr><th>规则</th><th>类型</th><th>结果</th><th>字段 / 对象</th>
          <th>说明</th><th>来源与时间</th></tr></thead>
        <tbody>${vrHTML}</tbody>
      </table>
    </div></div>` : NO_DATA('程序校验结果')}

    <div class="note" style="margin-top:16px">
      <span>ⓘ</span>
      <span>缺少事实或授权依据时，只能退回原责任人补充，<b>不能生成「已确认」的证明</b>。</span>
    </div>`;
}

/* ---------- 对账 · 差异优先 ---------- */
function renderStageRecon(order) {
  const el = paneEl('s-recon');
  if (!el) return;
  const R = computeReconciliation(order);

  if (!R.ok) {
    el.innerHTML = `<div class="note primary" style="margin-bottom:16px">
      <span>ⓘ</span><span><b>差异优先</b>：先看差异对象，完整双账折叠为原始依据。</span></div>
      ${NO_DATA(R.reason)}`;
    return;
  }

  const unresolved = R.diffs || [];
  const focus = CANVAS_DIFF_ID;
  const diffHTML = unresolved.length ? unresolved.map(x => `
    <div class="task${focus && x.differenceId === focus ? ' focus' : ''}" id="diff-${(x.differenceId||'').split('#')[1]}">
      <span class="bar"></span>
      <div class="body">
        <div class="title">${Math.abs(x.amountDiff).toFixed(2)} 元待核差异
          <span class="tag-amber">${x.primaryCategory}</span>
          ${x.categoryTags.map(c => `<span class="tag">${c}</span>`).join(' ')}
          <span class="tag mono" style="font-size:10.5px">${x.differenceId}</span></div>
        <div class="why">${x.obj ? `服务商侧「${x.obj}」` : '服务商侧无此项'}${x.jd ? `，京东侧「${x.jd}」` : '，京东侧无独立对应项'}。${x.note}</div>
        <div class="meta-grid">
          <div><span class="k">服务商侧</span>${x.obj || '无'}${x.obj ? '（' + x.spAmount.toFixed(2) + '）' : ''}</div>
          <div><span class="k">京东侧</span>${x.jd || '无'}${x.jd ? '（' + x.jdAmount.toFixed(2) + '）' : ''}</div>
          <div><span class="k">差额</span>${x.amountDiff.toFixed(2)} 元</div>
          <div><span class="k">依据状态</span>${x.basisStatus}</div>
          <div><span class="k">缺失依据</span>${(order.tasks || []).some(t => t.evidence === 'insufficient' && t.actionType === '解释')
            ? '尚未取得合同条款或批准材料' : '—'}</div>
        </div>
      </div>
      <div class="actions">
        <button class="btn btn-sm btn-primary">补充依据</button>
        <button class="btn btn-sm">记录处理意见</button>
      </div>
    </div>`).join('') : `<div class="note"><span>ⓘ</span><span>双方账目一致，<b>无待核差异</b>。</span></div>`;

  el.innerHTML = `
    <div class="note primary" style="margin-bottom:16px">
      <span>ⓘ</span>
      <span>服务商本地应收与京东正式账单是<b>两套独立账目</b>，只读、互不覆盖。
      下方差异全部由<b>普通程序读取两套账目计算</b>得出，<b>AI 草稿不参与任何金额计算</b>。</span>
    </div>

    ${aiDraftCard(aiDraftOf('reconciliation_explanation', order), { actions: false })}
    <div class="sect">差异对象（${unresolved.length}）</div>
    ${diffHTML}

    <div class="sect">项目对应关系（普通程序建立 · 人工可确认）</div>
    <div class="mapping">
      ${R.items.map(x => `<div class="map-row ${x.amountDiff === 0 ? 'matched' : 'diff'}">
        <div class="side"><span class="lbl">服务商侧</span>${x.obj || '（无）'}
          ${x.spAmount ? '<b>' + x.spAmount.toFixed(2) + '</b>' : ''}</div>
        <div class="link">${x.amountDiff === 0 ? '⇄' : '≠'}</div>
        <div class="side"><span class="lbl">京东侧</span>${x.jd || '（无独立对应项）'}
          ${x.jdAmount ? '<b>' + x.jdAmount.toFixed(2) + '</b>' : ''}</div>
        <div class="map-note">${x.amountDiff === 0 ? '✓ ' : '⚠ '}${x.tags.join(' / ') || '一致'} — ${x.note}</div>
      </div>`).join('')}
    </div>

    <div class="sect">计算结果（普通程序）</div>
    <dl class="kv">
      <dt>服务商应收合计</dt><dd>${R.sp.toFixed(2)} 元<span class="sub" style="margin-left:8px">${R.providerSource} · ${R.providerVersion} · 同步于 ${R.providerSyncedAt}</span></dd>
      <dt>京东账单合计</dt><dd>${R.jd.toFixed(2)} 元<span class="sub" style="margin-left:8px">${R.jdSource} · ${R.jdVersion} · 同步于 ${R.jdSyncedAt}</span></dd>
      <dt>差额</dt><dd><b style="color:${R.diff ? 'var(--amber)' : 'var(--muted)'}">${R.diff.toFixed(2)} 元</b>
        <span class="sub" style="margin-left:8px">${R.unresolvedCount} 项无法对应/金额不符</span></dd>
      <dt>对账结论</dt><dd>${R.diff
        ? '<span class="badge badge-amber"><span class="dot"></span>有差异 · 待处理</span>'
        : '<span class="badge badge-green"><span class="dot"></span>一致</span>'}</dd>
    </dl>

    <details style="margin-top:16px">
      <summary style="cursor:pointer;font-size:12px;font-weight:600;color:var(--muted);letter-spacing:.03em">
        完整双账（两套独立账目 · 点击展开）
      </summary>
      <div class="dual" style="margin-top:12px">
        <div class="card" style="margin:0">
          <div class="col-head"><div><div class="name">服务商本地应收</div>
            <div class="src">${R.providerSource} · ${R.providerVersion} · 同步于 ${R.providerSyncedAt}</div></div>
            <span class="readonly-flag">🔒 只读</span></div>
          <table class="data">
            <tbody>${order.providerLedger.items.map(i => `<tr>
              <td>${i.name}</td><td class="num">${i.amount.toFixed(2)}</td></tr>`).join('')}
              <tr class="total"><td>合计</td><td class="num">${R.sp.toFixed(2)}</td></tr></tbody>
          </table>
          ${R.ledgerMeta ? `<div class="src" style="padding:8px 12px;font-size:11.5px;color:var(--subtle)">
            映射来源：${R.ledgerMeta.mappingSource}（${R.ledgerMeta.mappingRuleId} · 配置 ${R.ledgerMeta.configVersion}）</div>` : ''}
        </div>
        <div class="card" style="margin:0">
          <div class="col-head"><div><div class="name">京东正式账单</div>
            <div class="src">${R.jdSource} · ${R.jdVersion} · 同步于 ${R.jdSyncedAt}</div></div>
            <span class="readonly-flag">🔒 只读</span></div>
          <table class="data">
            <tbody>${order.jdLedger.items.map(i => `<tr>
              <td>${i.name}</td><td class="num">${i.amount.toFixed(2)}</td></tr>`).join('')}
              <tr class="total"><td>合计</td><td class="num">${R.jd.toFixed(2)}</td></tr></tbody>
          </table>
        </div>
      </div>
    </details>`;
}

/* ---------- 事实核对 · 原件对照（仅 factsConflict 时出现） ---------- */
function renderStageFacts(order) {
  const el = paneEl('s-facts');
  if (!el) return;
  const plan = order.originalPlan;
  const act = order.actualCompletion;
  const cmp = computeComparison(order);
  const facts = order.factChanges || [];

  const planPane = plan ? `
    <div class="bench-col">
      <div class="bench-head">原方案<span class="tag">${plan.version}</span></div>
      <div class="bench-meta">${plan.source} · ${plan.formedAt}</div>
      <table class="data">${plan.items.map(i => `<tr>
        <td>${i.name}</td>
        <td class="num">${i.agreed}${i.unit && i.unit !== '—' ? ' ' + i.unit : ''}</td></tr>`).join('')}
      </table>
    </div>` : `<div class="bench-col">${NO_DATA('原方案')}</div>`;

  const actPane = (act && act.obtained) ? `
    <div class="bench-col">
      <div class="bench-head">现场实际</div>
      <div class="bench-meta">${act.source} · ${act.recordedAt}</div>
      <table class="data">${act.items.map(i => `<tr>
        <td>${i.name}</td>
        <td class="num">${i.actual}${i.unit && i.unit !== '—' ? ' ' + i.unit : ''}</td></tr>`).join('')}
      </table>
    </div>` : `<div class="bench-col">
      <div class="bench-head">现场实际</div>
      ${NO_DATA('现场实际完工结果尚未取得')}
    </div>`;

  const cmpHTML = cmp.ok ? `
    <table class="data">
      <thead><tr><th>项目</th><th>原方案</th><th>现场实际</th><th>比对结果</th><th>差异</th></tr></thead>
      <tbody>${cmp.rows.map(r => `<tr>
        <td>${r.name}</td><td>${r.plan}</td><td>${r.actual}</td>
        <td>${r.diffType === '一致'
          ? '<span class="badge badge-green"><span class="dot"></span>一致</span>'
          : `<span class="tag-amber">${r.diffType}</span>`}</td>
        <td>${r.diff}</td></tr>`).join('')}</tbody>
    </table>` : `<div class="note"><span>ⓘ</span><span>${cmp.reason}，无法执行逐项比对。</span></div>`;

  el.innerHTML = `
    <div class="note" style="margin-bottom:16px">
      <span>ⓘ</span>
      <span><b>原件对照</b>：左为原方案，右为现场实际，下方为<b>普通程序逐项比对</b>的结果。
      未取得现场实际时只显示「尚未取得」——<b>不推断、不伪造</b>。
      变更是否有效仍由原业务系统和原岗位判断。</span>
    </div>

    <div class="bench" style="grid-template-columns:repeat(2,minmax(0,1fr))">
      ${planPane}${actPane}
    </div>

    <div class="sect">确定性比对结果（普通程序输出）</div>
    ${cmpHTML}

    <div class="sect">变更事实（${facts.length}）</div>
    ${facts.length ? `<table class="data">
      <thead><tr><th>变化内容</th><th>变更原因</th><th>影响字段</th>
        <th>审批状态</th><th>影响交接</th><th>影响对账</th></tr></thead>
      <tbody>${facts.map(f => `<tr>
        <td>${f.item}</td><td>${f.reason}</td><td>${f.fields.join('、')}</td>
        <td>${f.approval === 'approved'
          ? `<span class="tag-teal">已批准 · ${f.approvedBy}（${f.approvedAt}）</span>`
          : f.approval === 'pending'
            ? '<span class="tag-amber">审批中</span>'
            : '<span class="tag" style="background:var(--red-bg);color:var(--red)">未提交审批</span>'}</td>
        <td>${f.scope.handover ? '是' : '否'}</td><td>${f.scope.recon ? '是' : '否'}</td></tr>`).join('')}
      </tbody></table>` : `<div class="empty" style="padding:18px">本工单无变更事实</div>`}

    <div class="note primary" style="margin-top:16px">
      <span>ⓘ</span><span>本阶段<b>不发起任何正式动作</b>。</span>
    </div>`;
}

/* ---------- 阶段分发 ---------- */
function renderStages(order) {
  renderStageHandover(order);
  renderStageReview(order);
  renderStageRecon(order);
  renderStageFacts(order);
}

/* ---------- D2 · 完整工单事实 ---------- */
function buildFactsView() {
  const order = WORK_ORDERS.find(o => o.id === CANVAS_ORDER_ID);
  if (!order) return NO_DATA('该工单');
  return `
    <div class="sect">工单</div>
    <dl class="kv">
      <dt>京东工单号</dt><dd class="mono">${order.id}</dd>
      <dt>服务商</dt><dd>${order.provider}</dd>
      <dt>项目</dt><dd>${order.project}</dd>
      <dt>安装地址</dt><dd>${order.address}</dd>
      <dt>当前责任岗位</dt><dd>${order.owner}</dd>
      <dt>当前办理位置</dt><dd>${order.location}</dd>
      <dt>最近更新</dt><dd>${relTime(order.updatedAt)}（${order.updatedAt}）</dd>
    </dl>

    <div class="sect">三条独立状态链</div>
    <table class="data">
      <thead><tr><th>维度</th><th>当前状态</th><th>来源系统</th><th>最近变化</th></tr></thead>
      <tbody>
        ${[['现场履约', order.fulfillment], ['资料交接', order.handover], ['对账处理', order.settlement]]
          .map(([n, s]) => `<tr><td>${n}</td><td>${badge(s)}</td>
            <td>${s.source}</td><td>${s.at || '—'}</td></tr>`).join('')}
      </tbody>
    </table>
    <div class="note" style="margin-top:12px"><span>ⓘ</span>
      <span>三条状态链<b>独立呈现，不合并为工单总状态</b>。</span></div>

    <div class="sect">可进入阶段</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      ${(order.stages || []).map(s =>
        `<span class="tag${s === 'facts' ? '' : ''}">${STAGE_LABEL[s]}${s === 'facts' ? '（按需）' : ''}</span>`).join('')}
    </div>
  `;
}

/* ---------- D2 · 处理过程与版本 ---------- */
function buildRecordsView() {
  const order = WORK_ORDERS.find(o => o.id === CANVAS_ORDER_ID);
  if (!order) return NO_DATA('该工单');
  const L = order.layers || {};
  const STEPS = [
    ['raw', '① 原始记录', 'plain'], ['converted', '② 转换结果', 'plain'],
    ['aiDraft', '③ AI 草稿', 'draft'], ['confirmed', '④ 人工确认稿', 'confirmed'],
    ['official', '⑤ 正式提交版本', 'official']
  ];
  const blocks = STEPS.map(([k, label, cls]) => {
    const arr = L[k] || [];
    if (!arr.length) return `<div class="layer">${NO_DATA(label)}</div>`;
    return arr.map(x => {
      if (cls === 'draft') return `<div class="layer draft">
        <div class="layer-head"><span class="t">${label}</span>
          <span class="badge badge-ai"><span class="dot"></span>AI 草稿</span>
          <span class="spacer"></span><span class="meta">${x.scene} · ${x.at}</span></div>
        <div>${x.text}</div></div>`;
      if (cls === 'official') return `<div class="layer official">
        <div class="layer-head"><span class="t">${label}</span>
          <span class="badge badge-green"><span class="dot"></span>正式 ${x.v}</span>
          <span class="spacer"></span><span class="meta">${x.at} · ${x.by}</span></div>
        <dl class="kv"><dt>回执号</dt><dd class="mono">${x.ref}</dd></dl></div>`;
      if (cls === 'confirmed') return `<div class="layer confirmed">
        <div class="layer-head"><span class="t">${label}</span>
          <span class="badge badge-blue"><span class="dot"></span>人工确认</span>
          <span class="spacer"></span><span class="meta">${x.by} · ${x.at}</span></div>
        <div style="font-size:13px">${x.text}</div></div>`;
      return `<div class="layer" style="border:1px solid var(--border);background:#fff">
        <div class="layer-head"><span class="t">${label}</span>
          <span class="tag">${x.srcName || x.cfg}</span>
          <span class="spacer"></span><span class="meta">${x.by} · ${x.at}</span></div>
        <table class="data">${x.rows.map(r => `<tr>
          <td class="mono">${r.f || r.item}</td>
          <td class="num">${r.v ? r.v + ' ' + r.u : r.amount}</td></tr>`).join('')}</table></div>`;
    }).join('');
  }).join('');

  return `<div class="note primary" style="margin-bottom:16px"><span>ⓘ</span>
    <span>除带正式标识的版本外，其余内容均为过程材料，不构成正式结论。</span></div>
    ${blocks}`;
}

/* ---------- D2 · 原始文件 ---------- */
function buildRawfilesView() {
  const order = WORK_ORDERS.find(o => o.id === CANVAS_ORDER_ID);
  if (!order) return NO_DATA('该工单');
  const raw = (order.layers || {}).raw || [];
  if (!raw.length) return NO_DATA('原始文件');
  return `<div class="note" style="margin-bottom:16px"><span>ⓘ</span>
    <span>只读 · 标注来源系统与记录人。原始记录<b>不因后续转换或修改而被覆盖</b>。</span></div>
    ${raw.map(x => `<div class="sect">${x.srcName} · ${x.v}</div>
      <div class="bench-meta" style="margin-bottom:8px">原记录人 ${x.by} · ${x.at}</div>
      <table class="data">
        <thead><tr><th>本地字段</th><th class="num">值</th><th>单位</th></tr></thead>
        <tbody>${x.rows.map(r => `<tr><td class="mono">${r.f}</td>
          <td class="num">${r.v}</td><td>${r.u}</td></tr>`).join('')}</tbody>
      </table>`).join('')}`;
}

/* ---------- D2 · 跨服务商比较（京东内部专用） ---------- */
function buildCompareView() {
  const rows = visibleWorkOrders(CURRENT_ROLE).map(o => {
    const raw = ((o.layers || {}).raw || []);
    const latest = raw.length ? raw[raw.length - 1] : null;
    const cable = latest ? (latest.rows.find(r => /线缆/.test(r.f)) || {}) : {};
    return { o, cable: cable.v ? cable.v + ' ' + cable.u : '—' };
  });
  if (!rows.length) return NO_DATA('可比对的工单');
  return `<div class="note" style="margin-bottom:16px"><span>ⓘ</span>
    <span>京东内部专用 · 服务商侧不可见。仅用于横向查看工程量与服务范围差异。</span></div>
    <table class="data">
      <thead><tr><th>服务商</th><th>项目</th><th class="num">线缆长度</th>
        <th>记录方式</th><th>资料交接</th><th>对账处理</th></tr></thead>
      <tbody>${rows.map(({ o, cable }) => {
        const org = ORGS.providers[o.provider] || {};
        return `<tr><td>${o.provider}${o.id === CANVAS_ORDER_ID ? '（本单）' : ''}</td>
          <td>${o.project}</td><td class="num">${cable}</td>
          <td>${org.recordStyle || '—'}</td>
          <td>${badge(o.handover)}</td><td>${badge(o.settlement)}</td></tr>`;
      }).join('')}</tbody>
    </table>`;
}

/* ---------- 中栏 · 阶段切换（不影响左右栏） ---------- */
function showStage(stage) {
  const order = visibleWorkOrders(CURRENT_ROLE).find(o => o.id === CANVAS_ORDER_ID);
  if (!order) return;
  // 手动点阶段导航离开对账阶段时，不再保留差异对象定位
  if (stage !== 'recon' && CANVAS_DIFF_ID) CANVAS_DIFF_ID = null;
  // facts 阶段按需出现：无变更且无事实冲突时不可进入
  if (stage === 'facts' && !order.factsConflict) stage = 'handover';
  if (!STAGES.includes(stage)) stage = defaultStageFor(order);

  document.querySelectorAll('#stage-tabs .tab').forEach(t =>
    t.classList.toggle('active', t.dataset.stage === stage));
  document.querySelectorAll('#page-w4 .stage-pane').forEach(p =>
    p.classList.toggle('active', p.id === 's-' + stage));

  const factsTab = document.getElementById('tab-facts');
  if (factsTab) factsTab.hidden = !order.factsConflict;

  CANVAS_STAGE = stage;
  const _o = WORK_ORDERS.find(o => o.id === CANVAS_ORDER_ID);
  if (_o) { renderRecommend(_o, stage); renderC5(_o, stage); renderC6(_o, stage); }
  if (CURRENT_PAGE === 'w4') {
    // 保留 ?diff= 参数，避免切换阶段时丢失差异对象定位
    const keep = CANVAS_DIFF_ID ? '?diff=' + encodeURIComponent(CANVAS_DIFF_ID) : '';
    const h = 'w4/' + order.id + '/' + stage + keep;
    if (location.hash.slice(1) !== h) location.hash = h;
  }
}

/* ---------- 右栏 · R-A 三个正式记录区块 ----------
   准入规则（v2.1 §12.1②，四项缺一不可）：
     ① 已由有权业务岗位或原业务系统正式形成
     ② 有回执号或版本号
     ③ 有操作人
     ④ 有形成时间
   缺任意一项 → 该条不进右栏，区块显示空态；**不得擅自补全**。
   无权区块整块从 DOM 剥离，不只做 CSS 隐藏。
   右栏严禁出现：等待回执 / 提交中 / 处理中 / 待确认 / 有差异未解决 /
   AI 草稿 / 人工修改稿 / 人工确认动作——这些只留在左栏状态与中栏任务区。 */
function renderRightCol(order) {
  const summary = [];

  ['ra1', 'ra2', 'ra3'].forEach(k => {
    const block = document.getElementById(k);
    if (!block) return;
    const vis = canSeeRightCol(CURRENT_ROLE, k);

    if (vis === 'none') {
      // 无权：整块剥离，DOM 中不留任何内容
      block.innerHTML = '';
      block.hidden = true;
      block.dataset.stripped = '1';
      summary.push(null);
      return;
    }

    block.hidden = false;
    block.dataset.stripped = '0';
    block.innerHTML = buildRABlock(k, order, vis);

    const vers = admittedVersions(order.id, k);
    summary.push(vers.length
      ? { label: RA_META[k].shortLabel, v: vers[vers.length - 1].v }
      : { label: RA_META[k].shortLabel, v: null });
  });

  renderRightSummary(summary);
}

function buildRABlock(k, order, vis) {
  const meta = RA_META[k];
  const id = k.toUpperCase().replace('RA', 'R-A');
  const head = `<div class="ra-head">${meta.label}<span class="ra-id">${id}</span></div>`;
  const vers = admittedVersions(order.id, k);

  if (!vers.length) {
    return head + `<div class="ra-empty">尚未形成正式记录
      <span class="to-stage" onclick="showStage('${meta.stage}')">前往当前阶段 →</span></div>`;
  }

  const latest = vers[vers.length - 1];
  const history = vers.slice(0, -1).reverse();

  let html = head + verCard(latest, k, true);
  if (history.length) {
    html += `<details class="ra-history">
      <summary>历史版本 (${history.length})</summary>
      ${history.map(v => verCard(v, k, false)).join('')}
    </details>`;
  }
  if (vis === 'readonly') {
    html += `<div class="readonly-flag" style="margin-top:8px">🔒 只读</div>`;
  }
  return html;
}

function verCard(r, k, isLatest) {
  const masked = ROLES[CURRENT_ROLE].amountMasked;
  const amt = (r.amount !== undefined && r.amount !== null)
    ? `<dt>金额</dt><dd>${masked
        ? '<span class="amt-masked" title="业务金额按最小可见原则遮蔽">¥ ••••</span>'
        : '¥ ' + r.amount.toFixed(2)}</dd>`
    : '';
  return `
    <div class="ver-card ${isLatest ? 'latest' : ''}">
      <div class="ver-top">
        <span class="badge badge-green"><span class="dot"></span>正式 ${r.v}</span>
        ${isLatest ? '<span class="tag-teal">最新</span>' : ''}
        <span class="ver-when">${r.at}</span>
      </div>
      <dl class="kv ver-kv">
        <dt>回执 / 编号</dt><dd class="mono">${r.ref}</dd>
        <dt>来源 / 岗位</dt><dd>${r.source} · ${r.role}</dd>
        <dt>操作人</dt><dd>${r.by}</dd>
        ${amt}
      </dl>
      <button class="btn btn-sm" onclick="openFormalDetail('${k}','${r.v}')">查看版本详情</button>
    </div>`;
}

/* ---------- D2 · 正式版本详情 ----------
   从右栏点击某一正式版本时打开。只展示**当前工单**的**该版本**：
   正式结果类型 / 版本号或回执号 / 来源系统或有权岗位 / 操作人 /
   形成时间 / 对应提交版本 / 历史版本关系。
   不得显示其他工单的占位或记录。 */
function openFormalDetail(block, v) {
  openDrawer('formal', { block, v });
}

function buildFormalDetail(payload) {
  const orderId = CANVAS_ORDER_ID;
  const k = payload && payload.block;
  const v = payload && payload.v;
  if (!orderId) return '<div class="empty">未指定工单</div>';
  if (!k || !v) return '<div class="empty">未指定正式版本</div>';

  const vis = canSeeRightCol(CURRENT_ROLE, k);
  if (vis === 'none') return '<div class="empty">当前角色无权查看该正式记录</div>';

  const vers = admittedVersions(orderId, k);
  const idx = vers.findIndex(r => r.v === v);
  if (idx < 0) return '<div class="empty">该正式版本不存在或未通过准入校验</div>';

  const r = vers[idx];
  const prev = idx > 0 ? vers[idx - 1] : null;
  const next = idx < vers.length - 1 ? vers[idx + 1] : null;
  const masked = ROLES[CURRENT_ROLE].amountMasked;
  const amt = (r.amount !== undefined && r.amount !== null)
    ? `<dt>金额</dt><dd>${masked
        ? '<span class="amt-masked" title="业务金额按最小可见原则遮蔽">¥ ••••</span>'
        : '¥ ' + r.amount.toFixed(2)}</dd>${r.note ? `<dt>说明</dt><dd>${r.note}</dd>` : ''}`
    : '';

  return `
    <div class="note primary" style="margin-bottom:16px">
      <span>ⓘ</span>
      <span>本页为 <b>正式记录</b> 详情。内容由原业务系统或有权业务岗位形成，
      本后台只同步读取，不修改、不重复发起。</span>
    </div>

    <div class="sect">正式结果</div>
    <dl class="kv">
      <dt>正式结果类型</dt><dd>${RA_META[k].label}（${k.toUpperCase().replace('RA', 'R-A')}）</dd>
      <dt>工单</dt><dd class="mono">${orderId}</dd>
      <dt>版本号</dt><dd><b>${r.v}</b>${next ? '' : '　<span class="tag-teal">最新</span>'}</dd>
      <dt>回执 / 编号</dt><dd class="mono">${r.ref}</dd>
      <dt>来源系统</dt><dd>${r.source}</dd>
      <dt>有权岗位</dt><dd>${r.role}</dd>
      <dt>操作人</dt><dd>${r.by}</dd>
      <dt>形成时间</dt><dd>${r.at}</dd>
      ${amt}
    </dl>

    <div class="sect">对应提交版本</div>
    <div class="phase-slot">
      <div class="ps-note">${r.submitted || '—'}</div>
      <div class="ps-note" style="margin-top:8px">
        可从该正式版本追溯到其原始资料、程序转换结果与人工确认稿入口。
        <span style="color:var(--subtle)">（入口在 M4 填充，本轮显示占位说明）</span>
      </div>
    </div>

    <div class="sect">历史版本关系</div>
    <div class="ver-chain">
      ${prev ? `<div class="vc-node">
        <span class="vc-tag">上一版</span>
        <b>${prev.v}</b>　<span class="vc-meta">${prev.ref} · ${prev.by} · ${prev.at}</span>
        <button class="btn btn-sm" onclick="openFormalDetail('${k}','${prev.v}')">查看</button>
      </div>` : ''}
      <div class="vc-node current">
        <span class="vc-tag">当前查看</span>
        <b>${r.v}</b>　<span class="vc-meta">${r.ref} · ${r.by} · ${r.at}</span>
      </div>
      ${next ? `<div class="vc-node">
        <span class="vc-tag">下一版</span>
        <b>${next.v}</b>　<span class="vc-meta">${next.ref} · ${next.by} · ${next.at}</span>
        <button class="btn btn-sm" onclick="openFormalDetail('${k}','${next.v}')">查看</button>
      </div>` : ''}
      <div class="vc-node" style="border-bottom:0;color:var(--muted)">
        本阶段共 ${vers.length} 个正式版本，<b>旧版本全部保留，不被新版本覆盖</b>。
      </div>
    </div>`;
}

/* ---------- D2 · 当前工单的全部正式记录（900px 摘要条点击进入） ---------- */
function buildFormalAll() {
  const orderId = CANVAS_ORDER_ID;
  if (!orderId) return '<div class="empty">未指定工单</div>';
  const blocks = ['ra1', 'ra2', 'ra3'].filter(k => canSeeRightCol(CURRENT_ROLE, k) !== 'none');
  if (!blocks.length) return '<div class="empty">当前角色无可见的正式记录区块</div>';

  return `
    <div class="note primary" style="margin-bottom:16px">
      <span>ⓘ</span>
      <span>仅展示工单 <b class="mono">${orderId}</b> 的正式记录。本后台只同步读取，不修改。</span>
    </div>` +
    blocks.map(k => {
      const vers = admittedVersions(orderId, k);
      const body = vers.length
        ? vers.slice().reverse().map((r, i) => `
            <div class="ver-card ${i === 0 ? 'latest' : ''}">
              <div class="ver-top">
                <span class="badge badge-green"><span class="dot"></span>正式 ${r.v}</span>
                ${i === 0 ? '<span class="tag-teal">最新</span>' : ''}
                <span class="ver-when">${r.at}</span>
              </div>
              <dl class="kv ver-kv">
                <dt>回执 / 编号</dt><dd class="mono">${r.ref}</dd>
                <dt>来源 / 岗位</dt><dd>${r.source} · ${r.role}</dd>
                <dt>操作人</dt><dd>${r.by}</dd>
              </dl>
              <button class="btn btn-sm" onclick="openFormalDetail('${k}','${r.v}')">查看版本详情</button>
            </div>`).join('')
        : `<div class="ra-empty">尚未形成正式记录
             <span class="to-stage" onclick="closeDrawer();showStage('${RA_META[k].stage}')">前往当前阶段 →</span></div>`;
      return `<div class="sect">${RA_META[k].label}</div>${body}`;
    }).join('');
}
function renderRightSummary(summary) {
  const bar = document.getElementById('right-summary');
  if (!bar) return;
  const items = summary.filter(Boolean);
  if (!items.length) {
    bar.innerHTML = `<span class="rs-label">正式记录</span><span class="rs-item">无可见区块</span>`;
    return;
  }
  bar.innerHTML = `<span class="rs-label">正式记录</span>` +
    items.map(s => `<span class="rs-item">${s.label}：${s.v ? '正式 ' + s.v : '尚未形成'}</span>`)
         .join('<span class="rs-sep">｜</span>') +
    `<span class="rs-open">展开 ▸</span>`;
}

/* 左栏折叠态（M 档）：展开为浮层，使用同一 DOM 节点 */
function toggleLeftPeek(btn) {
  const col = document.getElementById('col-left');
  if (!col) return;
  const open = col.classList.toggle('peek');
  btn.classList.toggle('active', open);
}

/* ---------- 资料交接：三条入口切换 ---------- */
function setPath(p) {
  document.querySelectorAll('#path-tabs button').forEach(b =>
    b.classList.toggle('active', b.dataset.p === p));
  ['pa', 'pb', 'pc'].forEach(k => {
    const el = document.getElementById(k);
    if (el) el.hidden = (k !== p);
  });
}

/* ============================================================
   抽屉：同一组件两种尺寸
   D1 窄（420px）单条依据 ｜ D2 宽（780px）完整事实 / 版本 / 历史 / 比较
   ============================================================ */
const DRAWER_META = {
  evidence:   { title: '依据来源', sub: '每条 AI 结论均可展开到原始来源与位置', size: 'sm' },
  timeline:   { title: '处理时间线', sub: '谁在什么时候做了什么 · 全程可追溯', size: 'lg' },
  facts:      { title: '完整工单事实', sub: '只读 · 原样呈现各系统来源', size: 'lg' },
  records:    { title: '处理过程与版本', sub: '除带正式标识的版本外，其余内容均为过程材料，不构成正式结论。', size: 'lg' },
  rawfiles:   { title: '原始文件', sub: '只读 · 标注来源系统与记录人', size: 'lg' },
  compare:    { title: '跨服务商比较', sub: '京东内部专用 · 服务商侧不可见', size: 'lg' },
  formal:     { title: '正式版本详情', sub: '只同步读取 · 不修改 · 不重复发起', size: 'lg' },
  formalAll:  { title: '正式记录与版本', sub: '仅当前工单 · 只同步读取', size: 'lg' }
};

function openDrawer(view, payload) {
  const meta = DRAWER_META[view] || DRAWER_META.evidence;
  const drawer = document.getElementById('drawer');
  document.getElementById('drawer-title').textContent = meta.title;
  document.getElementById('drawer-sub').textContent = meta.sub;
  drawer.classList.toggle('size-lg', meta.size === 'lg');

  let html = '';
  if (view === 'evidence') {
    html = EVIDENCE.map(e => `
      <div class="evidence-item">
        <div class="src">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
          ${e.src}
        </div>
        <div class="quote">${e.quote.replace(/\n/g, '<br>')}</div>
        <div class="loc">📍 ${e.loc}</div>
      </div>`).join('')
      + `<div class="gaps">
           <div class="gap missing"><span class="ic">缺失证据</span><span>现场照片未提供标尺，无法核实线缆 12 米的计量依据。</span></div>
           <div class="gap question"><span class="ic">待人工确认</span><span>「搬运费 60 元」是否在基础安装费范围内？需查看本单适用合同条款。</span></div>
         </div>`;
  } else if (view === 'timeline') {
    html = `<div class="timeline">${TIMELINE.map(t => `
      <div class="tl-item ${t.cls}">
        <div class="who">${t.who}</div>
        <div class="what">${t.what}</div>
        <div class="when">${t.when}</div>
      </div>`).join('')}</div>`;
  } else if (view === 'formal') {
    html = buildFormalDetail(payload);
  } else if (view === 'formalAll') {
    html = buildFormalAll();
  } else if (view === 'facts') {
    html = buildFactsView();
  } else if (view === 'records') {
    html = buildRecordsView();
  } else if (view === 'rawfiles') {
    html = buildRawfilesView();
  } else if (view === 'compare') {
    // 跨服务商比较：京东内部专用，服务商侧不可见
    html = ROLES[CURRENT_ROLE].side === 'jd'
      ? buildCompareView()
      : '<div class="empty">该视图仅京东内部可见</div>';
  }

  document.getElementById('drawer-body').innerHTML = html;
  drawer.classList.add('open');
  document.getElementById('drawer-backdrop').classList.add('open');
}

function closeDrawer() {
  const d = document.getElementById('drawer');
  d.classList.remove('open');
  d.classList.remove('size-lg');
  document.getElementById('drawer-backdrop').classList.remove('open');
}

document.addEventListener('keydown', e => { if (e.key === 'Escape') closeDrawer(); });

/* ============================================================
   初始化
   ============================================================ */
const _h = parseHash();
if (_h.page && PAGE_META[_h.page]) CURRENT_PAGE = _h.page;

const ROLE_PARAM = new URLSearchParams(location.search).get('role');
if (ROLE_PARAM && ROLES[ROLE_PARAM]) CURRENT_ROLE = ROLE_PARAM;

restoreSubmissions();
renderRoleMenu();
setRole(CURRENT_ROLE);
if (_h.page === 'w4') openCanvas(_h.orderId, _h.stage, _h.diff);

/* ============================================================
   W5 接入配置治理工作区（R-03 / R-14）
   ------------------------------------------------------------
   config → configVersion → fieldMapping 三层模型。
   生命周期：draft → pending_confirmation → pending_review → effective → disabled
   本地确认与京东确认是**两条独立记录**，不合并成一个状态字段。
   同角色双人分权：创建人与审核人必须不同账号；创建人禁止自审。
   接入配置治理**不形成工单正式记录**。
   ============================================================ */

function w5Versions() { return versionsOf(W5_CONFIG_ID); }
function w5Version() {
  const list = w5Versions();
  return list.find(v => v.versionId === W5_VERSION_ID)
      || list.filter(v => v.status === 'pending_review')[0]
      || list.filter(v => v.status === 'pending_confirmation')[0]
      || list.filter(v => v.status === 'draft')[0]
      || list.find(v => v.versionId === (configById(W5_CONFIG_ID) || {}).currentEffectiveVersionId)
      || list[list.length - 1];
}
function w5SelectConfig(id) { W5_CONFIG_ID = id; W5_VERSION_ID = null; renderW5(); }
function w5SelectVersion(id) { W5_VERSION_ID = id; renderW5(); }
function w5SetAccount(k) { W5_ACCOUNT = k; renderW5(); }

/* AI 映射建议草稿 —— 仅演示结构，不接真实 AI，必须人工逐项决定 */
function aiSuggestions(v) {
  // 已被人工采纳且非 AI 来源的字段不再建议；待决字段仍产生建议
  const decided = new Set(v.fieldMappings
    .filter(m => m.humanDecision === 'accepted' && m.source !== 'ai_suggestion')
    .map(m => m.localField));
  const pool = [
    { localField: '桥架材料', jdField: '桥架综合施工', rule: 'merge', conf: 'high',
      evidence: ['配置草稿历史版本映射表第 1–2 行', '近 3 单转换结果一致'],
      missing: [], question: '是否与「桥架安装」合并为同一京东项目？' },
    { localField: '临时用电', jdField: '其他增项', rule: 'direct', conf: 'low',
      evidence: ['本地模板字段「临时用电」'],
      missing: ['未提供该字段的合同条款或计量口径。'],
      question: '该字段的计量单位与结算依据是什么？' },
    { localField: '夜间施工补贴', jdField: null, rule: null, conf: 'low',
      evidence: [], missing: ['输入中没有该字段的任何历史记录或合同依据。'],
      question: '无法判断该字段是否应映射，是否需要人工补充依据？' }
  ];
  return pool.filter(s => !decided.has(s.localField));
}

function renderW5() {
  const listEl = document.getElementById('w5-list');
  if (!listEl) return;
  const acc = ACCOUNTS[W5_ACCOUNT];
  const isCfgAdmin = ROLES[CURRENT_ROLE].side === 'jd';

  /* ── 账号切换条（仅接入配置管理员角色可见） ── */
  const bar = document.getElementById('w5-account-bar');
  const cfgRoleHolder = ['chenjing', 'sunwei'];
  if (bar) {
    if (CURRENT_ROLE === 'cfgadmin') {
      bar.hidden = false;
      setHTML('w5-accounts', CFGADMIN_ACCOUNTS.map(k =>
        `<button class="${k === W5_ACCOUNT ? 'active' : ''}" onclick="w5SetAccount('${k}')">
          ${ACCOUNTS[k].name}</button>`).join(''));
      const v = w5Version();
      setTxt('w5-account-note', v
        ? (W5_ACCOUNT === v.createdBy
            ? `${acc.name} 是本版本创建人 · 不得审核本人创建的版本`
            : `${acc.name} 非本版本创建人 · 具备审核资格`)
        : '');
    } else {
      bar.hidden = true;
    }
  }

  /* ── 1 配置列表 ── */
  listEl.innerHTML = CONFIGS.map(c => {
    const cur = versionById(c.currentEffectiveVersionId);
    const vers = versionsOf(c.configId);
    const pending = vers.filter(v => v.status === 'pending_review' || v.status === 'pending_confirmation' || v.status === 'draft');
    const st = cur ? CONFIG_STATUS[cur.status] : { label: '—', tone: 'gray' };
    const localOk = !!cur.localConfirmedBy, jdOk = !!cur.jdConfirmedBy;
    const sel = c.configId === W5_CONFIG_ID;
    return `<tr class="clickable" onclick="w5SelectConfig('${c.configId}')"
      style="${sel ? 'background:var(--primary-soft)' : ''}">
      <td>${c.provider}<div class="sub">${c.sourceSystem}</div></td>
      <td><b>${c.name}</b>${pending.length ? `<div class="sub">待处理版本 ${pending.length} 个</div>` : ''}</td>
      <td>${c.applicableScope || '—'}</td>
      <td>${cur ? `${cur.versionNumber}<div class="sub">生效于 ${cur.activatedAt || '—'}</div>` : '—'}</td>
      <td><span class="badge badge-${st.tone}"><span class="dot"></span>${st.label}</span></td>
      <td>${localOk ? '<span class="tag-teal">服务商 ✓</span>' : '<span class="tag-amber">服务商 待确认</span>'}
          ${jdOk ? '<span class="tag-teal">京东 ✓</span>' : '<span class="tag-amber">京东 待确认</span>'}</td>
      <td>${c.updatedAt}</td>
    </tr>`;
  }).join('');

  const v = w5Version();
  if (!v) return;

  /* ── 2 配置版本区 ── */
  const curEff = versionById((configById(W5_CONFIG_ID) || {}).currentEffectiveVersionId);
  setHTML('w5-versions', w5Versions().map(x => {
    const st = CONFIG_STATUS[x.status];
    const isCur = x.versionId === W5_VERSION_ID;
    const isEff = curEff && x.versionId === curEff.versionId;
    return `<div class="w5-ver ${isCur ? 'sel' : ''} ${isEff ? 'eff' : ''}"
        onclick="w5SelectVersion('${x.versionId}')">
      <div class="w5-ver-top">
        <b>${x.versionNumber}</b>
        <span class="badge badge-${st.tone}"><span class="dot"></span>${st.label}</span>
        ${isEff ? '<span class="tag-teal">当前生效版本</span>' : ''}
        ${x.versionId === W5_VERSION_ID ? '<span class="tag-amber">正在查看</span>' : ''}
        <span class="spacer"></span>
        <span class="w5-ver-when">${accName(x.createdBy)} · ${x.createdAt}</span>
      </div>
      <div class="w5-ver-meta">变更原因：${x.changeReason}　｜　适用起：${x.applicableFrom || '—'}
        ${x.previousVersionId ? `　｜　上一版：${versionById(x.previousVersionId).versionNumber}` : ''}</div>
      <div class="w5-ver-meta">
        校验：${x.validationPassed === false
          ? `<span style="color:var(--red)">未通过 · ${x.validationNote || '存在未通过项'}</span>`
          : '通过'}　｜　映射规则 ${x.fieldMappings.length} 条
      </div>
    </div>`;
  }).join(''));

  /* ── 3 字段映射工作区 ── */
  const editable = v.status === 'draft' || v.status === 'pending_confirmation';
  setHTML('w5-mappings', `
    <table class="data">
      <thead><tr><th>本地字段</th><th>京东字段</th><th>转换规则</th><th>适用条件</th>
        <th>建议依据</th><th>置信度</th><th>人工决定</th><th>决定人 / 时间</th></tr></thead>
      <tbody>${v.fieldMappings.map(m => {
        const sug = editable ? aiSuggestions(v).find(s => s.localField === m.localField) : null;
        const needDecision = m.humanDecision !== 'accepted';
        const inlineAI = (sug && needDecision) ? `
          <tr class="ai-inline"><td colspan="8">
            <div class="ai-inline-body">
              <span class="badge badge-ai"><span class="dot"></span>AI 建议草稿</span>
              <span class="tag-ai">字段映射建议</span>
              <span class="ai-inline-text">建议 <b>${sug.localField}</b> → <b>${sug.jdField || '（无对应项）'}</b>（${convLabel(sug.rule)}）
                　置信度 ${CONFIDENCE_LABEL[sug.conf]}</span>
              <span class="spacer"></span>
              <button class="btn btn-sm btn-ghost" onclick="openEvidenceDrawer('${v.versionId}')">查看依据</button>
              <button class="btn btn-sm" onclick="w5AiDecideInline('${v.versionId}','${sug.localField}','rejected')">拒绝</button>
              <button class="btn btn-sm" onclick="w5AiDecideInline('${v.versionId}','${sug.localField}','noted')">补充依据</button>
              <button class="btn btn-sm" onclick="w5AiDecideInline('${v.versionId}','${sug.localField}','modified')">修改</button>
              <button class="btn btn-sm btn-primary" onclick="w5AiDecideInline('${v.versionId}','${sug.localField}','accepted')">采纳</button>
            </div>
            ${(sug.missing || []).length ? `<div class="gaps" style="margin-top:8px">${sug.missing.map(g =>
              `<div class="gap missing"><span class="ic">证据不足</span><span>${g}</span></div>`).join('')}</div>` : ''}
          </td></tr>` : '';
        return `<tr>
        <td class="mono">${m.localField}</td>
        <td>${m.jdField}</td>
        <td>${convLabel(m.conversionRule)}<span class="tech">${m.conversionRule}</span></td>
        <td>${m.applicableCondition}</td>
        <td class="sub">${m.evidence}</td>
        <td>${m.confidence === 'high' ? '<span class="tag-teal">高</span>'
          : m.confidence === 'medium' ? '<span class="tag-amber">中</span>'
          : '<span class="tag" style="background:var(--red-bg);color:var(--red)">低</span>'}</td>
        <td>${m.humanDecision === 'accepted' ? '<span class="tag-teal">已采纳</span>'
          : m.humanDecision === 'rejected' ? '<span class="tag">已拒绝</span>'
          : '<span class="tag-amber">待人工决定</span>'}</td>
        <td>${m.decisionBy ? accName(m.decisionBy) : '—'}<div class="sub">${m.decisionAt || ''}</div></td>
      </tr>` + inlineAI; }).join('')
      + (editable ? aiSuggestions(v).filter(s => !v.fieldMappings.some(m => m.localField === s.localField))
          .map(s => `<tr class="ai-inline"><td colspan="8">
            <div class="ai-inline-body">
              <span class="badge badge-ai"><span class="dot"></span>AI 建议草稿</span>
              <span class="tag-ai">字段映射建议</span>
              <span class="ai-inline-text">建议新增映射 <b>${s.localField}</b> → <b>${s.jdField || '（无对应项）'}</b>（${convLabel(s.rule)}）
                　置信度 ${CONFIDENCE_LABEL[s.conf]}</span>
              <span class="spacer"></span>
              <button class="btn btn-sm btn-ghost" onclick="openEvidenceDrawer('${v.versionId}')">查看依据</button>
              <button class="btn btn-sm" onclick="w5AiDecideInline('${v.versionId}','${s.localField}','rejected')">拒绝</button>
              <button class="btn btn-sm" onclick="w5AiDecideInline('${v.versionId}','${s.localField}','noted')">补充依据</button>
              <button class="btn btn-sm" onclick="w5AiDecideInline('${v.versionId}','${s.localField}','modified')">修改</button>
              <button class="btn btn-sm btn-primary" onclick="w5AiDecideInline('${v.versionId}','${s.localField}','accepted')">采纳</button>
            </div>
            ${(s.missing || []).length ? `<div class="gaps" style="margin-top:8px">${s.missing.map(g =>
              `<div class="gap missing"><span class="ic">证据不足</span><span>${g}</span></div>`).join('')}</div>` : ''}
          </td></tr>`).join('') : '')
      }</tbody>
    </table>
    ${editable ? '' : `<div class="note" style="margin-top:12px"><span>ⓘ</span>
      <span>该版本状态为「${CONFIG_STATUS[v.status].label}」，映射规则<b>只读</b>；
      ${v.status === 'effective' ? '已生效版本不得修改——如需变更请创建新版本。' : ''}</span></div>`}`);

  /* ── 3b AI 映射建议草稿 ── */
  const sug = editable ? aiSuggestions(v) : [];
  setHTML('w5-ai', sug.length ? sug.map((s, i) => `
    <div class="layer draft" style="margin-bottom:12px">
      <div class="layer-head">
        <span class="t">建议：${s.localField} → ${s.jdField || '（无对应项）'}</span>
        <span class="badge badge-ai"><span class="dot"></span>AI 建议草稿</span>
        <span class="tag-ai">字段映射建议</span>
        <span class="spacer"></span>
        <span class="meta">置信度 ${s.conf === 'high' ? '高' : s.conf === 'medium' ? '中' : '低'}</span>
      </div>
      <div class="evidence-line" style="border-top:0;padding-top:0">
        <span>依据 ${s.evidence.length} 条</span>
        <span class="clickable-link" onclick="openDrawer('evidence')">展开查看依据 →</span>
      </div>
      <div class="gaps">
        ${s.missing.map(m => `<div class="gap missing"><span class="ic">缺失证据</span><span>${m}</span></div>`).join('')}
        ${s.question ? `<div class="gap question"><span class="ic">待人工确认</span><span>${s.question}</span></div>` : ''}
      </div>
      <div class="layer-head" style="margin:12px 0 0">
        <span class="spacer"></span>
        <button class="btn btn-sm" onclick="w5AiDecide(${i},'rejected')">拒绝</button>
        <button class="btn btn-sm btn-primary" onclick="w5AiDecide(${i},'accepted')">采纳</button>
      </div>
    </div>`).join('')
    + `<div class="note"><span>ⓘ</span><span>AI 只提供建议草稿，<b>不确认配置、不审核生效、不写入已生效版本</b>；
       每条建议必须由人工逐项采纳、修改或拒绝后才进入正式配置。</span></div>`
    : `<div class="empty" style="padding:18px">${editable ? '本版本暂无待决定的 AI 映射建议' : '已生效/停用版本不接受 AI 建议'}</div>`);

  /* ── 4 模拟转换与程序校验 ── */
  // 样例字段名与配置快照中的 localField 保持一致；
  // 「夜间施工补贴」是快照中确实不存在的独立字段，用于演示 unable_to_map
  const sample = [
    { local: '桥架材料 300' }, { local: '桥架安装 180' },
    { local: '线缆穿管 11 米' }, { local: '穿墙孔 90' },
    { local: '夜间施工补贴 200' }
  ];
  const conv = sample.map(s => {
    const field = s.local.split(' ')[0];
    const rule = v.fieldMappings.find(m => m.localField === field);
    return { local: s.local, jd: rule ? rule.jdField : null, rule: rule ? rule.conversionRule : null,
             mapped: !!rule, ruleId: rule ? rule.mappingRuleId : null };
  });
  setHTML('w5-simulate', `
    <div class="sect">输入样例（确定性，可重复）</div>
    <table class="data">
      <thead><tr><th>本地字段</th><th>转换结果</th><th>转换规则</th><th>映射规则</th></tr></thead>
      <tbody>${conv.map(c => `<tr>
        <td class="mono">${c.local}</td>
        <td>${c.mapped ? c.jd : '<span style="color:var(--red)">unable_to_map</span>'}</td>
        <td>${c.rule ? convLabel(c.rule) + '<span class="tech">' + c.rule + '</span>' : '—'}</td>
        <td class="mono">${c.ruleId || '—'}</td>
      </tr>`).join('')}</tbody>
    </table>
    <div class="sect">四类程序校验</div>
    <table class="data">
      <thead><tr><th>类型</th><th>结果</th><th>说明</th></tr></thead>
      <tbody>
        ${[['必填', 'pass', '必填字段均已定义映射'],
           ['格式', 'pass', '字段类型与单位符合标准'],
           ['范围', v.validationPassed === false ? 'fail' : 'pass',
             v.validationPassed === false ? (v.validationNote || '存在超出范围的值') : '数值与单价在合同约定区间内'],
           ['重复', 'pass', '未发现重复映射规则']].map(([t, st, msg]) => `<tr>
          <td><span class="tag">${t}</span></td>
          <td>${st === 'pass' ? '<span class="badge badge-green"><span class="dot"></span>通过</span>'
            : '<span class="badge badge-red"><span class="dot"></span>未通过</span>'}</td>
          <td>${msg}</td></tr>`).join('')}
      </tbody>
    </table>
    <div class="note" style="margin-top:12px"><span>ⓘ</span>
      <span>模拟转换与四类校验均为<b>普通程序输出</b>，不依赖 AI，可重复得到相同结果。</span></div>`);

  /* ── 5 双方确认区（两条独立记录） ── */
  const canLocal = CURRENT_ROLE === 'pvdocs';
  const canJd = CURRENT_ROLE === 'verifier';
  setHTML('w5-signoff', `
    <div class="signoff">
      <div class="sign-slot ${v.localConfirmedBy ? 'done' : ''}">
        <div class="role">① 服务商确认本地含义</div>
        <div class="state">${v.localConfirmedBy
          ? `✓ 已确认本版本中本地字段的业务含义`
          : '待确认：本版本引入的本地字段含义'}</div>
        <div class="who">${v.localConfirmedBy ? `${accName(v.localConfirmedBy)} · ${v.localConfirmedAt}` : '尚未确认'}</div>
        ${!v.localConfirmedBy && canLocal
          ? `<div style="margin-top:10px"><button class="btn btn-sm btn-primary" onclick="w5Sign('local')">确认本地含义</button></div>`
          : (!v.localConfirmedBy && CURRENT_ROLE === 'cfgadmin'
              ? `<div class="note" style="margin-top:10px"><span>ⓘ</span><span>需由该服务商的<b>服务商资料负责人</b>确认，接入配置管理员不得代签。</span></div>`
              : '')}
      </div>
      <div class="sign-slot ${v.jdConfirmedBy ? 'done' : ''}">
        <div class="role">② 京东确认接收要求</div>
        <div class="state">${v.jdConfirmedBy
          ? `✓ 已确认接收口径与提交位置`
          : '待确认：京东侧接收要求'}</div>
        <div class="who">${v.jdConfirmedBy ? `${accName(v.jdConfirmedBy)} · ${v.jdConfirmedAt}` : '尚未确认'}</div>
        ${!v.jdConfirmedBy && canJd
          ? `<div style="margin-top:10px"><button class="btn btn-sm btn-primary" onclick="w5Sign('jd')">确认接收要求</button></div>`
          : (!v.jdConfirmedBy && CURRENT_ROLE === 'cfgadmin'
              ? `<div class="note" style="margin-top:10px"><span>ⓘ</span><span>需由<b>京东资料核查人员</b>确认，接入配置管理员不得代签。</span></div>`
              : '')}
      </div>
    </div>
    <div class="note" style="margin-top:12px"><span>ⓘ</span>
      <span>两条确认记录<b>相互独立、各自留痕、互不覆盖</b>；任一方缺失都不能审核生效。</span></div>`);

  /* ── 6 审核生效区 ── */
  const res = activationChecks(v.versionId, W5_ACCOUNT);
  const canAct = res.ok && CURRENT_ROLE === 'cfgadmin';
  setHTML('w5-activate', `
    <table class="data">
      <thead><tr><th style="width:56px">#</th><th>前置条件</th><th style="width:90px">状态</th><th>说明</th></tr></thead>
      <tbody>${res.checks.map((c, i) => `<tr>
        <td>${i + 1}</td><td>${c.label}</td>
        <td>${c.ok ? '<span class="badge badge-green"><span class="dot"></span>满足</span>'
          : '<span class="badge badge-red"><span class="dot"></span>未满足</span>'}</td>
        <td class="${c.ok ? 'sub' : ''}" ${c.ok ? '' : 'style="color:var(--red)"'}>${c.note}</td>
      </tr>`).join('')}</tbody>
    </table>
    <div style="margin-top:14px;display:flex;gap:8px;justify-content:flex-end">
      ${v.status === 'effective'
        ? `<button class="btn btn-sm" onclick="w5Disable()">停用该版本（须填原因）</button>`
        : `<button class="btn btn-sm btn-primary" id="config-approve"
             ${canAct ? '' : 'disabled'} onclick="w5Activate()"
             title="${canAct ? '八项前置条件全部满足' : res.checks.filter(c => !c.ok).map(c => c.note).join('；')}">
             审核生效</button>`}
    </div>
    ${!res.ok ? `<div class="note" style="margin-top:12px"><span>ⓘ</span>
      <span>按钮不可用原因：<b>${res.checks.filter(c => !c.ok).map(c => c.note).join('；')}</b></span></div>`
      : (CURRENT_ROLE !== 'cfgadmin'
          ? `<div class="note" style="margin-top:12px"><span>ⓘ</span><span>当前角色无配置审核职责。</span></div>` : '')}
    <div class="note" style="margin-top:12px"><span>ⓘ</span>
      <span>禁止：创建人审核自己的版本；系统管理员代替业务人员确认；缺少任一方确认时生效；
      AI 建议直接生效；修改已生效版本；新版本覆盖旧版本。</span></div>`);

  /* ── 7 版本历史与审计记录 ── */
  const audits = CONFIG_AUDIT.filter(a => versionsOf(W5_CONFIG_ID).some(x => x.versionId === a.versionId));
  setHTML('w5-audit', audits.length ? audits.map(a => `<tr>
    <td>${a.at}</td>
    <td>${CONFIG_ACTIONS[a.action] || a.action}</td>
    <td class="mono">${(versionById(a.versionId) || {}).versionNumber || '—'}</td>
    <td>${accName(a.by)}</td><td>${a.role}</td><td>${a.reason}</td>
    <td class="sub">${a.fromVersionId ? versionById(a.fromVersionId).versionNumber + ' → ' : ''}${a.toVersionId ? versionById(a.toVersionId).versionNumber : ''}</td>
  </tr>`).join('') : `<tr><td colspan="7"><div class="empty">暂无审计记录</div></td></tr>`);
}

/* ── 治理动作 ── */
function w5Sign(kind) {
  const v = w5Version();
  if (!v) return;
  if (kind === 'local') {
    if (CURRENT_ROLE !== 'pvdocs') return;
    v.localConfirmedBy = 'zhangsan'; v.localConfirmedAt = NOW;
    CONFIG_AUDIT.push({ auditId: 'A-' + String(CONFIG_AUDIT.length + 1).padStart(4, '0'),
      versionId: v.versionId, action: 'local_confirm', by: 'zhangsan', role: '服务商资料负责人',
      at: NOW, reason: '确认本地字段含义', fromVersionId: null, toVersionId: null });
    if (v.status === 'draft') v.status = 'pending_confirmation';
  } else {
    if (CURRENT_ROLE !== 'verifier') return;
    v.jdConfirmedBy = 'liqiang'; v.jdConfirmedAt = NOW;
    CONFIG_AUDIT.push({ auditId: 'A-' + String(CONFIG_AUDIT.length + 1).padStart(4, '0'),
      versionId: v.versionId, action: 'jd_confirm', by: 'liqiang', role: '京东资料核查人员',
      at: NOW, reason: '确认京东接收要求', fromVersionId: null, toVersionId: null });
    if (v.status === 'draft') v.status = 'pending_confirmation';
  }
  if (v.status === 'pending_confirmation' && v.localConfirmedBy && v.jdConfirmedBy) {
    v.status = 'pending_review';
  }
  renderW5();
}

function w5Activate() {
  const v = w5Version();
  if (!v || CURRENT_ROLE !== 'cfgadmin') return;
  const res = activationChecks(v.versionId, W5_ACCOUNT);
  if (!res.ok) return;
  const cfg = configById(v.configId);
  const prevEff = versionById(cfg.currentEffectiveVersionId);
  v.status = 'effective';
  v.reviewedBy = W5_ACCOUNT; v.reviewedAt = NOW;
  v.activatedBy = W5_ACCOUNT; v.activatedAt = NOW;
  v.applicableFrom = NOW.slice(0, 10);
  if (prevEff && prevEff.versionId !== v.versionId) {
    prevEff.status = 'disabled';
    prevEff.disabledBy = W5_ACCOUNT; prevEff.disabledAt = NOW;
    prevEff.disabledReason = `由 ${v.versionNumber} 取代，仅对历史工单有效`;
    CONFIG_AUDIT.push({ auditId: 'A-' + String(CONFIG_AUDIT.length + 1).padStart(4, '0'),
      versionId: prevEff.versionId, action: 'disable', by: W5_ACCOUNT,
      role: '接入配置管理员', at: NOW, reason: prevEff.disabledReason,
      fromVersionId: prevEff.versionId, toVersionId: v.versionId });
  }
  cfg.currentEffectiveVersionId = v.versionId;
  cfg.updatedAt = NOW;
  CONFIG_AUDIT.push({ auditId: 'A-' + String(CONFIG_AUDIT.length + 1).padStart(4, '0'),
    versionId: v.versionId, action: 'activate', by: W5_ACCOUNT,
    role: '接入配置管理员', at: NOW,
    reason: '双方确认齐全、校验通过、非创建人审核', fromVersionId: null, toVersionId: null });
  renderW5();
}

function w5Disable() {
  const v = w5Version();
  if (!v || CURRENT_ROLE !== 'cfgadmin') return;
  const reason = prompt('请输入停用原因（必填）');
  if (!reason) return;
  v.status = 'disabled';
  v.disabledBy = W5_ACCOUNT; v.disabledAt = NOW; v.disabledReason = reason;
  CONFIG_AUDIT.push({ auditId: 'A-' + String(CONFIG_AUDIT.length + 1).padStart(4, '0'),
    versionId: v.versionId, action: 'disable', by: W5_ACCOUNT,
    role: '接入配置管理员', at: NOW, reason, fromVersionId: null, toVersionId: null });
  renderW5();
}

function w5NewVersion() {
  const cfg = configById(W5_CONFIG_ID);
  if (!cfg || CURRENT_ROLE !== 'cfgadmin') return;
  const cur = versionById(cfg.currentEffectiveVersionId);
  const n = versionsOf(cfg.configId).length + 1;
  const nv = {
    versionId: `${cfg.configId}@v${n}`, configId: cfg.configId, versionNumber: 'v' + n,
    status: 'draft', changeReason: '基于当前生效版本复制形成的新草稿',
    previousVersionId: cur.versionId,
    createdBy: W5_ACCOUNT, createdAt: NOW,
    localConfirmedBy: null, localConfirmedAt: null, jdConfirmedBy: null, jdConfirmedAt: null,
    reviewedBy: null, reviewedAt: null, activatedBy: null, activatedAt: null,
    disabledBy: null, disabledAt: null, disabledReason: null,
    applicableFrom: null, validationPassed: true,
    fieldMappings: cur.fieldMappings.map(m => Object.assign({}, m, {
      mappingRuleId: m.mappingRuleId.replace(/-\d+$/, '-' + (30 + n)),
      decisionBy: null, decisionAt: null, humanDecision: 'pending' })),
    calculationRules: cur.calculationRules.map(r => Object.assign({}, r)),
    validationRules: cur.validationRules.map(r => Object.assign({}, r))
  };
  CONFIG_VERSIONS.push(nv);
  CONFIG_AUDIT.push({ auditId: 'A-' + String(CONFIG_AUDIT.length + 1).padStart(4, '0'),
    versionId: nv.versionId, action: 'new_version', by: W5_ACCOUNT,
    role: '接入配置管理员', at: NOW, reason: nv.changeReason,
    fromVersionId: cur.versionId, toVersionId: nv.versionId });
  W5_VERSION_ID = nv.versionId;
  renderW5();
}

function w5AiDecideInline(versionId, localField, decision) {
  const v = versionById(versionId);
  if (!v) return;
  const sug = aiSuggestions(v).find(s => s.localField === localField);
  if (!sug) return;
  if (decision === 'rejected') {
    const m = v.fieldMappings.find(x => x.localField === localField);
    if (m) { m.humanDecision = 'rejected'; m.decisionBy = W5_ACCOUNT; m.decisionAt = NOW; }
    renderW5(); return;
  }
  if (decision === 'noted') {
    const m = v.fieldMappings.find(x => x.localField === localField);
    if (m) { m.evidence = (m.evidence || '') + '；人工补充依据：已提供合同条款摘录'; m.humanDecision = 'accepted';
             m.decisionBy = W5_ACCOUNT; m.decisionAt = NOW; }
    renderW5(); return;
  }
  const exists = v.fieldMappings.find(x => x.localField === localField);
  if (exists) {
    exists.humanDecision = 'accepted';
    if (decision === 'modified') exists.applicableCondition = (exists.applicableCondition || '') + '（人工修改）';
    exists.decisionBy = W5_ACCOUNT; exists.decisionAt = NOW;
  } else {
    v.fieldMappings.push({
      mappingRuleId: 'MR-AI-' + (v.fieldMappings.length + 1), localField: sug.localField,
      jdField: sug.jdField, conversionRule: sug.rule, applicableCondition: sug.question || '经人工采纳的 AI 建议',
      evidence: sug.evidence.join('；') || '（人工补充）', confidence: sug.conf,
      source: 'ai_suggestion', humanDecision: 'accepted', decisionBy: W5_ACCOUNT, decisionAt: NOW });
  }
  renderW5();
}

function w5AiDecide(idx, decision) {
  const v = w5Version();
  if (!v) return;
  const sug = aiSuggestions(v);
  const s = sug[idx];
  if (!s) return;
  if (decision === 'rejected') { renderW5(); return; }
  // 采纳：作为**草稿变更**写入当前版本（仅限 draft / pending_confirmation）
  v.fieldMappings.push({
    mappingRuleId: 'MR-AI-' + (v.fieldMappings.length + 1), localField: s.localField,
    jdField: s.jdField, conversionRule: s.rule, applicableCondition: '经人工采纳的 AI 建议',
    evidence: s.evidence.join('；') || '（人工补充）', confidence: s.conf,
    source: 'ai_suggestion', humanDecision: 'accepted',
    decisionBy: W5_ACCOUNT, decisionAt: NOW
  });
  renderW5();
}

/* ============================================================
   C5 人工确认区 / C6 当前阶段正式动作区
   ============================================================ */

function stageDraft(order, stage) {
  const sc = STAGE_SCENARIO[stage];
  if (!sc) return null;
  return aiDraftOf(sc, order);
}

/* ---------- AI 草稿卡（四场景共用） ---------- */
function aiDraftCard(draft, opts) {
  if (!draft) return '';
  const conf = { high: '高', medium: '中', low: '低' }[draft.confidence] || '低';
  return `
    <div class="layer draft" style="margin:0">
      <div class="layer-head">
        <span class="t">${draft.scenarioLabel}</span>
        <span class="badge badge-ai"><span class="dot"></span>AI 草稿</span>
        <span class="tag-ai">${SCENARIO_BIZ[draft.scenario] || draft.scenarioLabel}</span>
        <span class="tag">演示输出 · 非真实模型调用</span>
        <span class="spacer"></span>
        <span class="meta">${draft.draftId} · 置信度 ${conf} · ${draft.generatedAt}</span>
      </div>
      <div class="ai-inputs">
        <span class="k">输入引用</span>${draft.inputReferences.map(r => `<span class="tag">${r}</span>`).join('')}
      </div>
      <div class="ai-items">
        ${draft.outputItems.map((it, i) => `<div class="ai-item">
          <div class="ai-item-title">${it.title || it.localField || '—'}
            ${it.jdField ? `→ ${it.jdField}` : ''}
            ${it.kind ? `<span class="tag-amber">${it.kind}</span>` : ''}
          </div>
          <div class="ai-item-note">${it.value || it.note || it.conversionRule || ''}</div>
        </div>`).join('') || '<div class="sub">（本次未产生输出项）</div>'}
      </div>
      <div class="evidence-line">
        <span>依据 ${draft.evidenceReferences.length} 条</span>
        <span class="clickable-link" onclick="openEvidenceDrawer('${draft.draftId}')">展开查看依据 →</span>
      </div>
      ${draft.evidenceGaps.length ? `<div class="gaps">
        ${draft.evidenceGaps.map(g => `<div class="gap missing"><span class="ic">证据不足</span><span>${g}</span></div>`).join('')}
      </div>` : ''}
      ${opts && opts.actions !== false ? `
      <div class="layer-head" style="margin:12px 0 0">
        <span class="spacer"></span>
        <button class="btn btn-sm" onclick="c5Decide('${draft.scenario}','rejected')">拒绝</button>
        <button class="btn btn-sm" onclick="c5Decide('${draft.scenario}','noted')">补充说明</button>
        <button class="btn btn-sm" onclick="c5Decide('${draft.scenario}','modified')">修改</button>
        <button class="btn btn-sm btn-primary" onclick="c5Decide('${draft.scenario}','accepted')">采纳</button>
      </div>` : ''}
    </div>`;
}

/* ---------- C5 渲染 ---------- */
function renderC5(order, stage) {
  const body = document.getElementById('c5-body');
  if (!body) return;
  const draft = stageDraft(order, stage);
  const revs = revisionsOf(order.id, stage);
  const stageScenario = STAGE_SCENARIO[stage];

  if (!stageScenario) {
    body.innerHTML = `<div class="empty" style="padding:18px">事实核对阶段不产生 AI 草稿，也不形成正式记录。</div>`;
    setTxt('c5-count', '');
    return;
  }
  if (!draft) {
    body.innerHTML = `<div class="empty" style="padding:18px">本阶段暂无 AI 草稿。</div>`;
    setTxt('c5-count', '');
    return;
  }

  body.innerHTML = `
    ${aiDraftCard(draft)}
    <div class="sect">人工确认稿（过程材料 · 不写入右栏）</div>
    ${revs.length ? revs.map(r => `
      <div class="layer confirmed" style="margin-bottom:10px">
        <div class="layer-head">
          <span class="t">人工确认稿 v${r.version}</span>
          <span class="badge badge-blue"><span class="dot"></span>${DECISION_LABEL[r.decision]}</span>
          <span class="spacer"></span>
          <span class="meta">${r.revisionId} · ${accName(ROLE_ACCOUNT[r.operator] || r.operator)} · ${r.operatedAt}</span>
        </div>
        <div style="font-size:13px">${r.humanContent}</div>
        <div class="evidence-line">
          <span>AI 原稿 ${r.originalAIContent.length} 项已永久保留</span>
          <span class="clickable-link" onclick="openRevisionDrawer('${r.revisionId}')">对比 AI 原稿与人工内容 →</span>
        </div>
      </div>`).join('')
      : `<div class="empty" style="padding:18px">尚未人工确认 — C6 的「存在完整的人工确认稿」条件不满足</div>`}
    <div class="note" style="margin-top:12px"><span>ⓘ</span>
      <span>AI 原稿永久保留，人工修改<b>不覆盖原稿</b>；人工确认稿仍是<b>过程材料</b>，不构成正式记录。</span></div>`;
  setTxt('c5-count', revs.length ? `人工确认稿 ${revs.length} 版` : '');
}

function c5Decide(scenario, decision) {
  const order = WORK_ORDERS.find(o => o.id === CANVAS_ORDER_ID);
  if (!order) return;
  const draft = stageDraft(order, CANVAS_STAGE);
  if (!draft) return;
  const stage = CANVAS_STAGE;
  const stageRoleOk = {
    handover: canRunFormalOp(CURRENT_ROLE, 'handover') || CURRENT_ROLE === 'pvdocs',
    review: canRunFormalOp(CURRENT_ROLE, 'review') || CURRENT_ROLE === 'pvdocs',
    recon: canRunFormalOp(CURRENT_ROLE, 'recon') || CURRENT_ROLE === 'pvbiz'
  }[stage];
  if (!stageRoleOk) return;

  const CONTENT = {
    accepted: '已逐项确认 AI 草稿内容，采纳全部整理结果，未作修改。',
    modified: '在 AI 草稿基础上修改了「需人工判断的项目」归属与说明，其余内容采纳。',
    rejected: '经核对该 AI 草稿不适用于本单，已拒绝；转入人工处理。',
    noted: '对 AI 草稿补充了本地事实说明：相关项目已有现场照片与领退料记录佐证。'
  };
  makeRevision(draft, decision, CONTENT[decision], CURRENT_ROLE, draft.evidenceReferences);
  renderC5(order, stage);
  renderC6(order, stage);
}

/* ---------- C6 渲染 ---------- */
function renderC6(orderId, stage) {
  const order = typeof orderId === 'string' ? WORK_ORDERS.find(o => o.id === orderId) : orderId;
  const body = document.getElementById('c6-body');
  if (!body || !order) return;
  const st = stage || CANVAS_STAGE;

  if (st === 'facts') {
    setHTML('c6-mode-badge', '');
    body.innerHTML = `<div class="empty" style="padding:18px">事实核对阶段不发起正式动作 — 变更是否有效由原业务系统和原岗位判断。</div>`;
    return;
  }

  const mode = c6Mode(order.id, st);
  const pre = c6Preconditions(order.id, st, CURRENT_ROLE);
  const state = c6State(order.id, st);
  const raField = stageOfField(st);
  const raVis = canSeeRightCol(CURRENT_ROLE, raField);

  setHTML('c6-mode-badge', mode === 'readonly_sync'
    ? '<span class="badge badge-blue"><span class="dot"></span>只读同步态</span>'
    : '<span class="badge badge-amber"><span class="dot"></span>发起态</span>');

  /* 只读同步态 */
  if (mode === 'readonly_sync') {
    const vers = admittedVersions(order.id, raField);
    const latest = vers[vers.length - 1];
    body.innerHTML = `
      <div class="note primary"><span>ⓘ</span>
        <span>该阶段正式结果<b>已在原业务系统形成</b>（${C6_TARGET[st]}）。新后台<b>只同步读取，不重复发起</b>。</span></div>
      <dl class="kv" style="margin-top:12px">
        <dt>正式结果</dt><dd>${latest ? `正式 ${latest.v} · 回执 ${latest.ref}` : '—'}</dd>
        <dt>操作人 / 时间</dt><dd>${latest ? `${latest.by} · ${latest.at}` : '—'}</dd>
        <dt>写入位置</dt><dd>右栏 ${RA_OF_STAGE[st]}${raVis === 'none' ? '（当前角色不可见）' : ''}</dd>
      </dl>`;
    return;
  }

  /* 发起态 */
  const submitting = state.phase === 'waiting_receipt';
  const failed = state.phase === 'failed';
  const canSubmit = pre.ok && !submitting;

  body.innerHTML = `
    <div class="note primary"><span>ⓘ</span>
      <span>本阶段正式动作：<b>${C6_STAGE_NAME[st]}</b> → 提交至 <b>${C6_TARGET[st]}</b>，成功回执后写入右栏 <b>${RA_OF_STAGE[st]}</b>。
      <span style="color:var(--subtle)">（原型演示：提交与回执均为模拟，未接通真实生产系统）</span></span></div>

    <div class="sect">四项必要前置条件</div>
    <table class="data">
      <thead><tr><th style="width:52px">#</th><th>前置条件</th><th style="width:84px">状态</th><th>说明</th></tr></thead>
      <tbody>${pre.checks.map((c, i) => `<tr>
        <td>${i + 1}</td><td>${c.label}</td>
        <td>${c.ok ? '<span class="badge badge-green"><span class="dot"></span>满足</span>'
          : '<span class="badge badge-red"><span class="dot"></span>未满足</span>'}</td>
        <td class="${c.ok ? 'sub' : ''}" ${c.ok ? '' : 'style="color:var(--red)"'}>${c.note}</td>
      </tr>`).join('')}</tbody>
    </table>
    <div class="sub" style="margin-top:8px">幂等键：<span class="mono">${pre.idempotencyKey}</span>　｜　本次提交版本 v${pre.version}</div>

    ${state.sub ? `<div class="sect">提交状态</div>
      <div class="c6-state ${state.phase}">
        <div class="c6-state-head">
          <span class="badge badge-${state.phase === 'waiting_receipt' ? 'amber' : state.phase === 'failed' ? 'red' : 'green'}">
            <span class="dot"></span>${{
              waiting_receipt: '提交中 · 等待回执',
              failed: '原系统返回失败',
              succeeded: '已收到成功回执'
            }[state.phase]}</span>
          <span class="spacer"></span>
          <span class="meta">${state.sub.submissionId} · 第 ${state.sub.attempt} 次 · ${state.sub.submittedAt}</span>
        </div>
        ${state.phase === 'failed' ? `
          <div class="gaps"><div class="gap missing"><span class="ic">失败原因</span><span>${state.sub.failReason}</span></div>
            <div class="gap question"><span class="ic">恢复方式</span><span>修正后可重新提交；重复点击会被幂等键拦截。</span></div></div>` : ''}
        ${state.phase === 'waiting_receipt' ? `
          <div class="gaps"><div class="gap question"><span class="ic">进行中</span><span>等待 ${C6_TARGET[st]} 返回回执。<b>收到成功回执前不写入右栏</b>。</span></div></div>` : ''}
        ${state.phase === 'succeeded' ? `
          <dl class="kv" style="margin-top:8px">
            <dt>原系统回执号</dt><dd class="mono">${state.sub.ref}</dd>
            <dt>回执时间</dt><dd>${state.sub.receiptAt}</dd>
            <dt>写入位置</dt><dd>右栏 ${RA_OF_STAGE[st]}</dd>
          </dl>` : ''}
      </div>` : ''}

    <div style="margin-top:14px;display:flex;gap:8px;justify-content:flex-end">
      ${state.phase === 'failed'
        ? `<button class="btn btn-sm btn-primary" ${pre.ok ? '' : 'disabled'} onclick="c6Submit('${order.id}','${st}')">重试提交</button>`
        : `<button class="btn btn-sm btn-primary" ${canSubmit ? '' : 'disabled'} onclick="c6Submit('${order.id}','${st}')"
             title="${pre.ok ? (submitting ? '提交进行中' : '四项前置条件全部满足') : pre.checks.filter(c => !c.ok).map(c => c.note).join('；')}">
             ${submitting ? '提交中…' : `提交至 ${C6_TARGET[st]}`}</button>`}
    </div>
    ${!pre.ok ? `<div class="note" style="margin-top:12px"><span>ⓘ</span>
      <span>按钮不可用原因：<b>${pre.checks.filter(c => !c.ok).map(c => c.note).join('；')}</b></span></div>` : ''}
    <div class="note" style="margin-top:12px"><span>ⓘ</span>
      <span>提交中 / 等待回执 / 处理失败 / 已确认但未提交 等状态<b>全部留在中栏</b>；
      只有原系统<b>成功回执</b>才写入右栏。AI 草稿与人工确认稿<b>永不进入右栏</b>。</span></div>`;
}

/* 依据抽屉：显示来源系统 / 文件 / 位置 / 原文摘录 四要素 */
function openEvidenceDrawer(draftId) {
  const order = WORK_ORDERS.find(o => o.id === CANVAS_ORDER_ID);
  const draft = order ? aiDraftOf(STAGE_SCENARIO[CANVAS_STAGE], order) : null;
  const items = draft ? draft.evidenceReferences : [];
  setTxt('drawer-title', '依据来源');
  setTxt('drawer-sub', '每条 AI 结论均可展开到原始来源与位置');
  const drawer = document.getElementById('drawer');
  drawer.classList.remove('size-lg');
  document.getElementById('drawer-body').innerHTML = items.length ? items.map(e => `
    <div class="evidence-item">
      <div class="src">${e.source}</div>
      <div class="quote">${e.quote}</div>
      <div class="loc">📍 ${e.file}${e.loc && e.loc !== '—' ? ' · ' + e.loc : ''}</div>
    </div>`).join('') + (draft.evidenceGaps.length ? `<div class="gaps">
      ${draft.evidenceGaps.map(g => `<div class="gap missing"><span class="ic">证据不足</span><span>${g}</span></div>`).join('')}
    </div>` : '') : '<div class="empty">本次草稿未引用任何依据</div>';
  drawer.classList.add('open');
  document.getElementById('drawer-backdrop').classList.add('open');
}

/* 抽屉：AI 原稿 vs 人工修改对比 */
function openRevisionDrawer(revisionId) {
  const r = HUMAN_REVISIONS.find(x => x.revisionId === revisionId);
  if (!r) return;
  setTxt('drawer-title', `人工修改对比 · ${r.revisionId}`);
  setTxt('drawer-sub', 'AI 原稿永久保留，人工修改不覆盖原稿');
  const drawer = document.getElementById('drawer');
  drawer.classList.add('size-lg');
  document.getElementById('drawer-body').innerHTML = `
    <div class="layer draft" style="margin:0 0 14px">
      <div class="layer-head"><span class="t">AI 原稿</span>
        <span class="badge badge-ai"><span class="dot"></span>AI 草稿</span>
        <span class="spacer"></span><span class="meta">${r.sourceDraftId}</span></div>
      ${r.originalAIContent.map(it => `<div class="ai-item">
        <div class="ai-item-title">${it.title || it.localField || '—'}</div>
        <div class="ai-item-note">${it.value || it.note || ''}</div></div>`).join('') || '<div class="sub">（无）</div>'}
    </div>
    <div class="layer confirmed" style="margin:0">
      <div class="layer-head"><span class="t">人工确认稿 v${r.version}</span>
        <span class="badge badge-blue"><span class="dot"></span>${DECISION_LABEL[r.decision]}</span>
        <span class="spacer"></span><span class="meta">${accName(ROLE_ACCOUNT[r.operator] || r.operator)} · ${r.operatedAt}</span></div>
      <div style="font-size:13px">${r.humanContent}</div>
    </div>
    <div class="note" style="margin-top:14px"><span>ⓘ</span>
      <span>本确认稿是<b>过程材料</b>，不构成正式记录；须经 C6 与模拟原系统成功回执后才形成正式版本。</span></div>`;
  drawer.classList.add('open');
  document.getElementById('drawer-backdrop').classList.add('open');
}

/* 提交后刷新阶段面板与右栏 */
function renderStagePanesRefresh(orderId, stage) {
  const order = WORK_ORDERS.find(o => o.id === orderId);
  if (!order) return;
  renderStages(order);
  showStage(stage);
}

/* ---------- 原型工具：重置演示状态 ----------
   清理 sessionStorage 中的演示提交记录并重新加载初始演示数据。
   这是**原型工具**，不是生产功能。 */
function resetDemo() {
  try { sessionStorage.removeItem('jd_submissions'); } catch (e) { }
  location.reload();
}

/* ---------- L4 中栏顶部 · 当前推荐动作 ----------
   回答：现在做什么 / 为什么 / 缺少什么 / 完成后进入哪一步 */

function renderRecommend(order, stage) {
  const el = document.getElementById('c2-recommend');
  if (!el) return;
  const todo = visibleTasks(CURRENT_ROLE).find(t => t.orderId === order.id);
  const stageLabel = STAGE_LABEL[stage] || '';

  if (stage === 'facts') {
    el.innerHTML = `<div class="rec">
      <div class="rec-head"><span class="rec-title">核对原方案与现场实际</span>
        <span class="tag">${stageLabel}</span></div>
      <div class="rec-row"><span class="k">为什么</span><span>本工单存在变更未获批准或事实冲突，需要逐项对照。</span></div>
      <div class="rec-row"><span class="k">完成后</span><span>${STAGE_NEXT.facts}</span></div>
    </div>`;
    return;
  }

  if (!todo) {
    el.innerHTML = `<div class="rec rec-idle">
      <div class="rec-head"><span class="rec-title">当前阶段无待你处理的任务</span>
        <span class="tag">${stageLabel}</span></div>
      <div class="rec-row"><span class="k">可以先看</span><span>下方 AI 草稿与程序校验结果；如需处理请切换到有任务的阶段。</span></div>
      <div class="rec-row"><span class="k">完成后</span><span>${STAGE_NEXT[stage] || '—'}</span></div>
    </div>`;
    return;
  }

  const grp = groupOfTask(todo, CURRENT_ROLE);
  const isMine = todo.assignee === CURRENT_ROLE;
  const a = ROLES[todo.assignee];
  const overdue = isOverdue(todo.deadline);
  const actionLabel = todo.primaryAction || ACTION_LABELS[todo.actionType] || '补充材料';

  el.innerHTML = `<div class="rec ${isMine ? '' : 'rec-wait'}">
    <div class="rec-head">
      <span class="rec-title">${isMine ? '现在需要你处理' : '当前等待对方处理'}</span>
      <span class="tag-amber">${ACTION_GROUPS.find(g => g.key === grp).label}</span>
      <span class="tag">${stageLabel}</span>
      ${todo.blocking ? '<span class="tag-orange">阻断正式提交</span>' : ''}
      <span class="spacer"></span>
      <span class="meta">${isMine ? `责任角色 ${a.title} · ${a.name}` : `等待 ${a.title} · ${a.name}`}</span>
    </div>
    <div class="rec-title2">${todo.title}</div>
    <div class="rec-row"><span class="k">为什么</span><span>${todo.why}</span></div>
    <div class="rec-row"><span class="k">缺少什么</span><span>${todo.need}${
      todo.evidence === 'insufficient' ? '　<span class="tag-gap">证据不足</span>' : ''}</span></div>
    <div class="rec-row"><span class="k">时效</span><span>${overdue
      ? `<span class="overdue">已超期 · 截止 ${todo.deadline}</span>`
      : `截止 ${todo.deadline}（${relTime(todo.deadline)}）`}</span></div>
    <div class="rec-row"><span class="k">完成后</span><span>${STAGE_NEXT[stage]}</span></div>
    <div class="rec-actions">
      ${isMine
        ? `<button class="btn btn-sm btn-primary" onclick="document.getElementById('c5-panel').scrollIntoView({behavior:'smooth',block:'start'})">${actionLabel}</button>
           <button class="btn btn-sm" onclick="openDrawer('records')">查看处理过程</button>`
        : `<button class="btn btn-sm" disabled title="本项在对方手中，不得代办">等待 ${a.title}</button>
           <button class="btn btn-sm" onclick="openDrawer('timeline')">催办 / 查看时间线</button>`}
    </div>
  </div>`;
}

/* ---------- 业务语言清理：把内部场景标识换成业务名称 ---------- */
