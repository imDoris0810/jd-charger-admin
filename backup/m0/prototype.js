/* ============================================================
   充电桩安装协同管理后台 · 交互原型脚本
   本原型无真实后端，所有数据为虚构演示数据
   ============================================================ */

/* ---------- 角色定义（基线 §6 六角色） ---------- */
const ROLES = {
  verifier: {
    name: '李强', title: '京东资料核查人员', side: 'jd', initial: '李',
    pages: ['orders', 'todos', 'detail'],
    perm: '可查看正式资料、提出问题、复核补充、形成原系统正式结论。不得替服务商修改本地事实。'
  },
  reconciler: {
    name: '周明', title: '京东业务对账人员', side: 'jd', initial: '周',
    pages: ['orders', 'todos', 'recon', 'detail'],
    perm: '可建立或确认账目对应、查看差额、记录处理意见。不得直接改账或执行付款。'
  },
  cfgadmin: {
    name: '陈静', title: '接入配置管理员', side: 'jd', initial: '陈',
    pages: ['orders', 'config', 'detail'],
    perm: '可维护接入配置草稿、适用范围和版本。不得单方面让配置生效——必须服务商与京东双方确认后才能审核生效。'
  },
  sysadmin: {
    name: '王磊', title: '系统管理员', side: 'jd', initial: '王',
    pages: ['orders', 'todos', 'recon', 'config', 'detail'],
    perm: '负责用户、角色、权限和基础维护。不得代替业务岗位作专业结论，也不得单方面让配置生效。'
  },
  pvdocs: {
    name: '张三', title: '服务商资料负责人', side: 'provider', initial: '张',
    pages: ['orders', 'todos', 'detail'],
    perm: '可确认本地交接范围、上传文件、提交资料、查看退回问题、补充材料。不得确认京东正式核查结论。'
  },
  pvbiz: {
    name: '刘敏', title: '服务商业务负责人', side: 'provider', initial: '刘',
    pages: ['orders', 'recon', 'detail'],
    perm: '可确认本地应收、查看差异、提供合同或批准依据、反馈处理意见。不得修改京东账单。'
  }
};

let CURRENT_ROLE = 'reconciler';
let CURRENT_PAGE = 'orders';
let TODO_GROUP = 'self';
let ORDER_FILTER = 'all';

/* ---------- 工单数据 ---------- */
const ORDERS = [
  {
    id: 'JD202409130001', provider: '城南安装', project: '望京 SOHO B1 充电站',
    owner: '李强', location: '京东安装管理系统',
    fulfillment: { label: '已完工', tone: 'green' },
    handover: { label: '待补充', tone: 'amber' },
    settlement: { label: '未开始', tone: 'gray' },
    tasks: 3, waitingFor: 'pvdocs', hasDiff: false, hasError: false, updated: '2 小时前'
  },
  {
    id: 'JD202409120014', provider: '远程机电', project: '朝阳大悦城 P2 停车场',
    owner: '李强', location: '文件交付事项',
    fulfillment: { label: '已验收', tone: 'green' },
    handover: { label: '待确认', tone: 'amber' },
    settlement: { label: '待对账', tone: 'gray' },
    tasks: 2, waitingFor: 'verifier', hasDiff: false, hasError: false, updated: '5 小时前'
  },
  {
    id: 'JD202409110008', provider: '安家安装', project: '亦庄经开区 A 座',
    owner: '周明', location: '对账工作区',
    fulfillment: { label: '已完工', tone: 'green' },
    handover: { label: '已完成', tone: 'green' },
    settlement: { label: '有差异', tone: 'red' },
    tasks: 1, waitingFor: 'pvbiz', hasDiff: true, hasError: false, updated: '1 天前'
  },
  {
    id: 'JD202409100003', provider: '城南安装', project: '中关村软件园 B3',
    owner: '王磊', location: '本地任务',
    fulfillment: { label: '待整改', tone: 'orange' },
    handover: { label: '异常', tone: 'red' },
    settlement: { label: '未开始', tone: 'gray' },
    tasks: 2, waitingFor: 'sysadmin', hasDiff: false, hasError: true, updated: '3 小时前'
  },
  {
    id: 'JD202409080015', provider: '安家安装', project: '石景山万达 B2',
    owner: '周明', location: '对账工作区',
    fulfillment: { label: '已验收', tone: 'green' },
    handover: { label: '已完成', tone: 'green' },
    settlement: { label: '有差异', tone: 'red' },
    tasks: 1, waitingFor: 'reconciler', hasDiff: true, hasError: false, updated: '6 小时前'
  },
  {
    id: 'JD202409090021', provider: '远程机电', project: '通州万达 B1',
    owner: '周明', location: '京东安装履约系统',
    fulfillment: { label: '履约中', tone: 'blue' },
    handover: { label: '转换中', tone: 'blue' },
    settlement: { label: '未开始', tone: 'gray' },
    tasks: 0, waitingFor: null, hasDiff: false, hasError: false, updated: '2 天前'
  }
];

/* ---------- 待办数据 ---------- */
const TODOS = [
  {
    order: 'JD202409130001', title: '桥架长度缺少计量依据', type: '待补充',
    why: '来自 CN-2024-0912-018 领退料记录第 3 行，桥架记为 3 米，但附件中无标尺参照。',
    need: '补充带标尺的现场照片，或本地记录截图',
    src: '服务商本地系统', location: '本地任务', assignee: 'pvdocs',
    waited: '2 小时', overdue: false, tone: ''
  },
  {
    order: 'JD202409130001', title: '「搬运费 60 元」是否属于合同范围', type: '待确认',
    why: '京东标准项目中无独立对应项，需核对本单适用合同条款。',
    need: '本单适用合同条款原文，或批准材料',
    src: '服务商本地系统', location: '对账工作区', assignee: 'pvbiz',
    waited: '1 天 2 小时', overdue: true, tone: ''
  },
  {
    order: 'JD202409130001', title: '线缆 12 米需复核', type: '待确认',
    why: '服务商已补充带标尺照片，等待复核。',
    need: '复核照片计量结果',
    src: '文件交付', location: '文件交付事项', assignee: 'verifier',
    waited: '40 分钟', overdue: false, tone: 'self'
  },
  {
    order: 'JD202409100003', title: '原系统提交中断', type: '提交失败',
    why: '调用京东安装管理系统提交接口超时，已保留最近一次确认节点。',
    need: '确认原系统是否已生成正式版本后再重试',
    src: '服务商本地系统', location: '本地任务', assignee: 'sysadmin',
    waited: '3 小时', overdue: false, tone: 'error'
  },
  {
    order: 'JD202409120014', title: '接入配置待双方确认', type: '配置待确认',
    why: '远程机电「分段工程 · 完工明细」v1 已由服务商确认本地含义，京东侧接收要求尚未确认。',
    need: '京东业务确认接收口径',
    src: '文件交付', location: '配置草稿', assignee: 'cfgadmin',
    waited: '1 天', overdue: false, tone: ''
  },
  {
    order: 'JD202409080015', title: '160 元差额待记录处理意见', type: '待对账',
    why: '服务商侧「高空作业费 160 元」在京东账单中无对应项，程序已算出差额，等待记录处理意见。',
    need: '查看服务商提供的合同附件后记录处理意见',
    src: '文件交付', location: '对账工作区', assignee: 'reconciler',
    waited: '6 小时', overdue: false, tone: 'self'
  }
];

/* ---------- 对账批次 ---------- */
const RECON = [
  { order: 'JD202409130001', provider: '城南安装', project: '望京 SOHO B1 充电站', sp: 960, jd: 900, diff: 60, note: '待核差异', tone: 'amber' },
  { order: 'JD202409110008', provider: '安家安装', project: '亦庄经开区 A 座', sp: 1240, jd: 1240, diff: 0, note: '一致', tone: 'green' },
  { order: 'JD202409120014', provider: '远程机电', project: '朝阳大悦城 P2 停车场', sp: 780, jd: 780, diff: 0, note: '一致', tone: 'green' },
  { order: 'JD202409080015', provider: '安家安装', project: '石景山万达 B2', sp: 1520, jd: 1360, diff: 160, note: '待核差异', tone: 'amber' }
];

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

function setRole(key) {
  CURRENT_ROLE = key;
  ORDER_FILTER = 'all';
  TODO_GROUP = 'self';
  document.querySelectorAll('#page-orders .todo').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('#todo-group button').forEach(b =>
    b.classList.toggle('active', b.dataset.g === 'self'));
  const r = ROLES[key];
  document.getElementById('user-avatar').textContent = r.initial;
  document.getElementById('user-name').textContent = r.name;
  document.getElementById('user-role').textContent = r.title;
  document.getElementById('role-btn-label').textContent = r.title;
  document.getElementById('perm-text').textContent = r.perm;
  document.getElementById('role-menu').classList.remove('open');

  // 导航可见性
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.hidden = !r.pages.includes(btn.dataset.page);
  });
  // 当前页面被隐藏则回到工单列表
  if (!r.pages.includes(CURRENT_PAGE)) {
    go('orders');
  } else {
    go(CURRENT_PAGE);
  }

  // 接入配置：仅审核人可执行「审核生效」
  const approve = document.getElementById('config-approve');
  if (approve) {
    const canApprove = key === 'verifier' || key === 'reconciler';
    approve.disabled = !canApprove;
    approve.title = canApprove
      ? '双方确认人均已签署，可执行审核生效'
      : '接入配置管理员不得单方面让配置生效：需服务商与京东双方确认后，由审核人执行';
  }
  renderRoleMenu();
}

const PAGE_META = {
  orders: ['工单列表', '工作台 / 工单列表'],
  todos: ['资料交接 · 异常待办', '工作台 / 资料交接 · 异常待办'],
  recon: ['业务对账', '工作台 / 业务对账'],
  config: ['服务商接入配置', '工作台 / 服务商接入配置'],
  detail: ['工单详情 · JD202409130001', '工作台 / 工单列表 / 工单详情']
};

function go(page) {
  CURRENT_PAGE = page;
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const el = document.getElementById('page-' + page);
  if (el) el.classList.add('active');
  document.querySelectorAll('.nav-item').forEach(b =>
    b.classList.toggle('active', b.dataset.page === page));
  const meta = PAGE_META[page] || PAGE_META.orders;
  document.getElementById('page-title').textContent = meta[0];
  document.getElementById('page-crumb').textContent = meta[1];
  if (location.hash.slice(1).split('/')[0] !== page) location.hash = page;
  window.scrollTo(0, 0);
}

/* 支持直接以 #orders / #todos / #recon / #config / #detail/t-handover 打开，便于评审时分享链接 */
window.addEventListener('hashchange', () => {
  const [h, tab] = location.hash.slice(1).split('/');
  if (!h || !PAGE_META[h] || !ROLES[CURRENT_ROLE].pages.includes(h)) return;
  if (h !== CURRENT_PAGE) go(h);
  if (h === 'detail' && tab) showTab(tab);
});

/* ============================================================
   工单列表
   ============================================================ */
function badge(o) {
  return `<span class="badge badge-${o.tone}"><span class="dot"></span>${o.label}</span>`;
}

function renderOrders() {
  const q = (document.getElementById('q').value || '').trim().toLowerCase();
  const fp = document.getElementById('f-provider').value;
  const fs = document.getElementById('f-status').value;

  const rows = ORDERS.filter(o => {
    if (fp && o.provider !== fp) return false;
    if (fs && o.handover.label !== fs) return false;
    if (q) {
      const hit = (o.id + o.provider + o.project).toLowerCase().includes(q);
      if (!hit) return false;
    }
    if (ORDER_FILTER === 'mine' && o.waitingFor !== CURRENT_ROLE) return false;
    if (ORDER_FILTER === 'others' && !(o.waitingFor && o.waitingFor !== CURRENT_ROLE)) return false;
    if (ORDER_FILTER === 'diff' && !o.hasDiff) return false;
    if (ORDER_FILTER === 'error' && !o.hasError) return false;
    return true;
  });

  document.getElementById('orders-body').innerHTML = rows.length ? rows.map(o => `
    <tr class="clickable" onclick="go('detail')">
      <td class="mono">${o.id}</td>
      <td>${o.provider}<div class="sub">${o.project}</div></td>
      <td>${o.owner}</td>
      <td>${badge(o.fulfillment)}</td>
      <td>${badge(o.handover)}</td>
      <td>${badge(o.settlement)}</td>
      <td>${o.tasks ? `<span class="tag-amber">${o.tasks} 项</span>` : '<span class="tag">—</span>'}</td>
      <td style="color:var(--muted); font-size:12.5px">${o.updated}</td>
    </tr>`).join('') : `<tr><td colspan="8"><div class="empty">没有符合条件的工单</div></td></tr>`;

  document.getElementById('orders-count').textContent = `共 ${rows.length} 条`;
}

function countOrders() {
  const mine = ORDERS.filter(o => o.waitingFor === CURRENT_ROLE).length;
  const others = ORDERS.filter(o => o.waitingFor && o.waitingFor !== CURRENT_ROLE).length;
  const diff = ORDERS.filter(o => o.hasDiff).length;
  const error = ORDERS.filter(o => o.hasError).length;
  document.getElementById('kpi-mine').textContent = mine;
  document.getElementById('kpi-others').textContent = others;
  document.getElementById('kpi-diff').textContent = diff;
  document.getElementById('kpi-error').textContent = error;
}

function filterOrders(kind) {
  ORDER_FILTER = (ORDER_FILTER === kind) ? 'all' : kind;
  document.querySelectorAll('#page-orders .todo').forEach((t, i) => {
    t.classList.toggle('active', ['mine', 'others', 'diff', 'error'][i] === ORDER_FILTER);
  });
  renderOrders();
}

/* ============================================================
   资料交接 · 异常待办
   ============================================================ */
function setTodoGroup(g) {
  TODO_GROUP = g;
  document.querySelectorAll('#todo-group button').forEach(b =>
    b.classList.toggle('active', b.dataset.g === g));
  renderTodos();
}

function renderTodos() {
  const t = document.getElementById('t-type').value;
  const s = document.getElementById('t-src').value;

  const rows = TODOS.filter(x => {
    if (t && x.type !== t) return false;
    if (s && x.src !== s) return false;
    if (TODO_GROUP === 'self' && x.assignee !== CURRENT_ROLE) return false;
    if (TODO_GROUP === 'other' && x.assignee === CURRENT_ROLE) return false;
    return true;
  });

  const me = ROLES[CURRENT_ROLE];
  document.getElementById('todos-list').innerHTML = rows.length ? rows.map(x => {
    const a = ROLES[x.assignee];
    const isMine = x.assignee === CURRENT_ROLE;
    const actionLabel = x.type === '提交失败' ? '查询原系统版本'
      : x.type === '配置待确认' ? '确认接收要求'
      : x.type === '待对账' ? '记录处理意见'
      : x.type === '待确认' ? '确认 / 记录意见'
      : '补充材料';
    return `
    <div class="task ${x.tone}">
      <span class="bar"></span>
      <div class="body">
        <div class="title">${x.title}
          <span class="tag-amber">${x.type}</span>
          <span class="tag">${x.order}</span>
        </div>
        <div class="why">${x.why}</div>
        <div class="meta-grid">
          <div><span class="k">需要什么</span>${x.need}</div>
          <div><span class="k">当前责任人</span>${a.title} · ${a.name}</div>
          <div><span class="k">办理位置</span>${x.location}</div>
          <div><span class="k">来源系统</span>${x.src}</div>
          <div><span class="k">等待方</span>${isMine ? '本方' : '对方'}</div>
          <div><span class="k">时效</span>${x.overdue ? `<span class="overdue">已超期 · ${x.waited}</span>` : `已等待 ${x.waited}`}</div>
        </div>
      </div>
      <div class="actions">
        ${isMine
          ? `<button class="btn btn-sm btn-primary">${actionLabel}</button>
             <button class="btn btn-sm" onclick="openDrawer('timeline')">处理时间线</button>`
          : `<button class="btn btn-sm" disabled title="当前轮不到 ${me.title} 处理">等待 ${a.title}</button>
             <button class="btn btn-sm" onclick="openDrawer('timeline')">处理时间线</button>`}
      </div>
    </div>`;
  }).join('') : `<div class="card"><div class="empty"><div class="big">暂无待办</div>切换分组或筛选条件试试</div></div>`;

  document.getElementById('todos-count').textContent = `共 ${rows.length} 项`;

  document.getElementById('nav-todo-count').textContent = TODOS
    .filter(x => x.assignee === CURRENT_ROLE).length;
}

/* ============================================================
   业务对账
   ============================================================ */
function renderRecon() {
  document.getElementById('recon-body').innerHTML = RECON.map(r => `
    <tr class="clickable" onclick="go('detail')">
      <td class="mono">${r.order}</td>
      <td>${r.provider}</td>
      <td>${r.project}</td>
      <td class="num">${r.sp.toFixed(2)}</td>
      <td class="num">${r.jd.toFixed(2)}</td>
      <td class="num" style="color:${r.diff ? 'var(--amber)' : 'var(--muted)'}">${r.diff ? r.diff.toFixed(2) : '—'}</td>
      <td><span class="badge badge-${r.tone}"><span class="dot"></span>${r.note}</span></td>
      <td><button class="btn btn-sm">进入对账</button></td>
    </tr>`).join('');
}

/* ============================================================
   详情页：页签与入口切换
   ============================================================ */
function showTab(id) {
  document.querySelectorAll('#detail-tabs .tab').forEach(t =>
    t.classList.toggle('active', t.dataset.tab === id));
  document.querySelectorAll('#page-detail .tabpane').forEach(p =>
    p.classList.toggle('active', p.id === id));
  if (CURRENT_PAGE === 'detail' && id) location.hash = 'detail/' + id;
}

function setPath(p) {
  document.querySelectorAll('#path-tabs button').forEach(b =>
    b.classList.toggle('active', b.dataset.p === p));
  ['pa', 'pb', 'pc'].forEach(k => {
    const el = document.getElementById(k);
    if (el) el.hidden = (k !== p);
  });
}

/* ============================================================
   抽屉：依据来源 / 处理时间线
   ============================================================ */
const EVIDENCE = [
  {
    src: '服务商本地系统 · 领退料记录',
    quote: '桥架材料  216\n桥架安装  144',
    loc: '文件 CN-2024-0912-018 · 第 3 行 · 单元格 D3:E3'
  },
  {
    src: '新协同后台 · 接入配置 v2',
    quote: '规则：桥架材料 + 桥架安装 → 桥架综合施工（合并）',
    loc: '配置项：城南安装 / 领退料记录 / 完工明细 · 映射表第 1–2 行'
  },
  {
    src: '文件交付事项 · 附件区',
    quote: '现场照片 4 张（IMG_0341 ~ IMG_0344）',
    loc: '上传人 张三 · 2024-09-13 09:58 · 其中 2 张无标尺参照'
  }
];

const TIMELINE = [
  { who: '张三 · 服务商资料负责人', what: '提交本地领退料记录', when: '2024-09-12 18:20', cls: 'done' },
  { who: '系统 · 普通程序', what: '按配置 v2 完成确定性转换', when: '2024-09-12 18:21', cls: 'done' },
  { who: '系统 · 结构化 Prompt', what: '生成资料整理草稿（1 项缺失证据）', when: '2024-09-13 09:15', cls: 'done' },
  { who: '李强 · 京东资料核查人员', what: '提出问题：桥架长度缺少计量依据', when: '2024-09-13 09:40', cls: 'done' },
  { who: '张三 · 服务商资料负责人', what: '补充材料：上传现场照片', when: '2024-09-13 09:58', cls: 'done' },
  { who: '当前', what: '等待 京东资料核查人员 复核', when: '—', cls: 'current' }
];

function openDrawer(kind) {
  const title = kind === 'evidence' ? '依据来源' : '处理时间线';
  const sub = kind === 'evidence'
    ? '每条 AI 结论均可展开到原始来源与位置'
    : '谁在什么时候做了什么 · 全程可追溯';
  document.getElementById('drawer-title').textContent = title;
  document.getElementById('drawer-sub').textContent = sub;

  document.getElementById('drawer-body').innerHTML = kind === 'evidence'
    ? EVIDENCE.map(e => `
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
         </div>`
    : `<div class="timeline">${TIMELINE.map(t => `
        <div class="tl-item ${t.cls}">
          <div class="who">${t.who}</div>
          <div class="what">${t.what}</div>
          <div class="when">${t.when}</div>
        </div>`).join('')}</div>`;

  document.getElementById('drawer').classList.add('open');
  document.getElementById('drawer-backdrop').classList.add('open');
}

function closeDrawer() {
  document.getElementById('drawer').classList.remove('open');
  document.getElementById('drawer-backdrop').classList.remove('open');
}

document.addEventListener('keydown', e => { if (e.key === 'Escape') closeDrawer(); });

/* ============================================================
   初始化
   ============================================================ */
const INITIAL_PAGE = location.hash.slice(1).split('/')[0];
if (INITIAL_PAGE && PAGE_META[INITIAL_PAGE]) CURRENT_PAGE = INITIAL_PAGE;
const INITIAL_TAB = location.hash.slice(1).split('/')[1];

/* 支持 ?role=cfgadmin 直接以指定角色打开，便于按角色分享评审链接 */
const ROLE_PARAM = new URLSearchParams(location.search).get('role');
if (ROLE_PARAM && ROLES[ROLE_PARAM]) CURRENT_ROLE = ROLE_PARAM;

renderRoleMenu();
renderOrders();
renderTodos();
renderRecon();
countOrders();
setRole(CURRENT_ROLE);
if (INITIAL_TAB) showTab(INITIAL_TAB);
if (INITIAL_TAB) location.hash = 'detail/' + INITIAL_TAB;
