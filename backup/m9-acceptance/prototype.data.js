/* ============================================================
   充电桩安装协同管理后台 · 原型数据层
   ------------------------------------------------------------
   依据：docs/wireframe-spec-v2.1.docx（已冻结）
        docs/requirements-baseline.md §6 §7 §8
        docs/brd.md R-01～R-15

   职责：模拟数据、角色、权限矩阵、工单、版本与状态。
   prototype.js 只负责路由、权限判定与渲染，不再定义数据。

   ⚠ 本文件为**静态原型模拟**。组织隔离、字段遮蔽、权限判定
     全部在前端完成，生产环境必须由服务端鉴权。
   ============================================================ */

/* ============================================================
   一、组织与服务商（R-15 组织隔离的数据基础）
   ============================================================ */
const ORGS = {
  jd: { id: 'jd', label: '京东', scope: '本组织范围内全部工单' },
  providers: {
    '城南安装': { id: 'p-cn', label: '城南安装', recordStyle: '领退料记录' },
    '远程机电': { id: 'p-yc', label: '远程机电', recordStyle: '分段工程' },
    '安家安装': { id: 'p-aj', label: '安家安装', recordStyle: 'Excel 交付' }
  }
};

/* ============================================================
   二、六角色与权限矩阵（基线 §6 / v2.1 §11）
   ------------------------------------------------------------
   org            : 'jd' | 服务商名 —— 组织隔离维度
   pages          : 可见的一级导航与画布
   leftCol        : 左栏字段可见性
   rightCol       : 右栏三个正式记录区块的可见性
                    'full' 完全可见 / 'readonly' 只读 / 'none' 不可见
   formalOps      : 可在「当前阶段正式动作区」发起的正式动作
   canConfigActivate : 是否具备 CONFIG_ACTIVATE（W5 审核生效）
   amountMasked   : 业务金额是否遮蔽（最小可见原则）
   ============================================================ */
const ROLES = {
  verifier: {
    name: '李强', title: '京东资料核查人员', side: 'jd', initial: '李',
    pages: ['l1', 'l2', 'l3', 'w6', 'w5', 'w4'],
    perm: '可查看正式资料、提出问题、复核补充、形成原系统正式结论。不得替服务商修改本地事实。',
    org: 'jd', providerScope: null, amountMasked: false,
    leftCol: { full: true, groups: ['order', 'facts', 'config', 'sources', 'files'] },
    rightCol: { ra1: 'full', ra2: 'full', ra3: 'full' },
    formalOps: ['review'],
    canConfigActivate: false
  },
  reconciler: {
    name: '周明', title: '京东业务对账人员', side: 'jd', initial: '周',
    pages: ['l1', 'l2', 'l3', 'w6', 'w4'],
    perm: '可建立或确认账目对应、查看差额、记录处理意见。不得直接改账或执行付款。',
    org: 'jd', providerScope: null, amountMasked: false,
    leftCol: { full: true, groups: ['order', 'facts', 'config', 'sources', 'files'] },
    rightCol: { ra1: 'full', ra2: 'full', ra3: 'full' },
    formalOps: ['recon'],
    canConfigActivate: false
  },
  cfgadmin: {
    name: '陈静', title: '接入配置管理员', side: 'jd', initial: '陈',
    pages: ['l1', 'l3', 'w5', 'w4'],
    perm: '可维护接入配置草稿、适用范围和版本。不得单方面让配置生效——须服务商确认本地含义、京东确认接收要求后，由非创建人的另一账号审核生效。',
    org: 'jd', providerScope: null, amountMasked: true,
    leftCol: { full: false, groups: ['config', 'sources'] },
    rightCol: { ra1: 'readonly', ra2: 'readonly', ra3: 'none' },
    formalOps: [],
    canConfigActivate: true
  },
  sysadmin: {
    name: '王磊', title: '系统管理员', side: 'jd', initial: '王',
    pages: ['l1', 'l2', 'l3', 'w6', 'w5', 'w4'],
    perm: '负责用户、角色、权限和基础维护。不得代替业务岗位作专业结论，不得审核生效配置，也不得单方面让配置生效。',
    org: 'jd', providerScope: null, amountMasked: true,
    leftCol: { full: false, groups: ['order', 'facts', 'config', 'sources', 'files'] },
    rightCol: { ra1: 'readonly', ra2: 'readonly', ra3: 'readonly' },
    formalOps: [],
    canConfigActivate: false
  },
  pvdocs: {
    name: '张三', title: '服务商资料负责人', side: 'provider', initial: '张',
    pages: ['l1', 'l2', 'l3', 'w4'],
    perm: '可确认本地交接范围、上传文件、提交资料、查看退回问题、补充材料。不得确认京东正式核查结论。',
    org: '城南安装', providerScope: '城南安装', amountMasked: true,
    leftCol: { full: true, groups: ['order', 'facts', 'config', 'sources', 'files'] },
    rightCol: { ra1: 'full', ra2: 'readonly', ra3: 'none' },
    formalOps: ['handover'],
    canConfigActivate: false
  },
  pvbiz: {
    name: '刘敏', title: '服务商业务负责人', side: 'provider', initial: '刘',
    pages: ['l1', 'l2', 'l3', 'w6', 'w4'],
    perm: '可确认本地应收、查看差异、提供合同或批准依据、反馈处理意见。不得修改京东账单。',
    pages_note: '有「提供合同依据」类待办，故开放任务队列',
    org: '安家安装', providerScope: '安家安装', amountMasked: false,
    leftCol: { full: true, groups: ['order', 'facts', 'config', 'sources'] },
    rightCol: { ra1: 'full', ra2: 'readonly', ra3: 'readonly' },
    formalOps: [],
    canConfigActivate: false
  }
};

/* ============================================================
   三、三类业务状态链（R-10：三条链独立，永不合并）
   ============================================================ */
const STATE_CHAINS = {
  fulfillment: {
    label: '现场履约', owner: '京东安装履约系统',
    values: ['待履约', '履约中', '待整改', '已完工', '已验收']
  },
  handover: {
    label: '资料交接', owner: '新协同后台',
    values: ['未交接', '转换中', '待确认', '提交中', '待补充', '已完成', '异常']
  },
  settlement: {
    label: '对账处理', owner: '新协同后台',
    values: ['未开始', '待对账', '有差异', '处理中', '已确认']
  }
};

/* ============================================================
   四、统一工单数据模型（R-01 / R-06 / R-08 / R-10 / R-13）
   ------------------------------------------------------------
   ⚠ 这是 L1 / L2 / L3 / L4 / W6 的**唯一数据源**。
     任何计数、分组、筛选项、简报数字都必须由本模型派生，
     不得在任何页面另行硬编码。

   每张工单包含：
     · 基础信息与服务商 / 项目 / 责任岗位
     · 三条独立状态链（现场履约 / 资料交接 / 对账处理）
     · 当前任务与下一步动作（tasks[]，首项为当前任务）
     · 五动作分组所需的 actionType / assignee / blocking / evidence
     · 时效与截止时间
     · 可进入阶段 stages 与 factsConflict 条件
     · 正式记录 formal（R-A1 / R-A2 / R-A3）
     · 最近更新时间 updatedAt
     · 组织与服务商可见范围 providerOrg

   演示基准时间：本原型用固定 NOW 计算「N 小时前」，保证时序自洽且可复现。
   ============================================================ */
const NOW = '2024-09-13 18:00';

/* 相对时间：由 updatedAt 与 NOW 计算，不写死 */
function relTime(iso) {
  if (!iso) return '—';
  const p = (s) => { const [d, t] = s.split(' '); const [Y, M, D] = d.split('-').map(Number); const [h, m] = t.split(':').map(Number); return Date.UTC(Y, M - 1, D, h, m); };
  const mins = Math.round((p(NOW) - p(iso)) / 60000);
  if (mins < 0) return '刚刚';
  if (mins < 60) return `${mins} 分钟前`;
  if (mins < 1440) return `${Math.round(mins / 60)} 小时前`;
  return `${Math.round(mins / 1440)} 天前`;
}

/* 是否超期：由 deadline 与 NOW 比较 */
function isOverdue(deadline) {
  if (!deadline) return false;
  return deadline < NOW;
}

const WORK_ORDERS = [
  /* ── 城南安装 · 望京 SOHO ─────────────────────────────——
     资料已提交两版；核查因桥架计量依据不足退回补充，尚有 3 项待办 */
  {
    id: 'JD202409130001',
    provider: '城南安装', providerId: 'p-cn', providerOrg: '城南安装',
    project: '望京 SOHO B1 充电站',
    address: '北京市朝阳区望京街 10 号 B1 层',
    owner: '李强', ownerRole: 'verifier', location: '京东安装管理系统',

    fulfillment: { label: '已完工', tone: 'green', at: '2024-09-12 18:40', source: '京东安装履约系统' },
    handover:    { label: '待补充', tone: 'amber', at: '2024-09-13 16:00', source: '新协同后台' },
    settlement:  { label: '未开始', tone: 'gray',  at: null,                source: '新协同后台' },

    tasks: [
      { id: 'T-0001-A', primaryAction: '补充桥架计量依据', title: '桥架长度缺少计量依据', actionType: '补充', assignee: 'pvdocs',
        why: '来自 CN-2024-0912-018 领退料记录第 3 行，桥架记为 3 米，但附件中无标尺参照。',
        need: '补充带标尺的现场照片，或本地记录截图',
        evidence: 'insufficient', blocking: true,
        deadline: '2024-09-13 20:00', location: '本地任务', src: '服务商本地系统',
        updatedAt: '2024-09-13 16:00' },
      { id: 'T-0001-C', primaryAction: '复核照片计量结果', title: '线缆 12 米需复核', actionType: '确认', assignee: 'verifier',
        why: '服务商已补充带标尺照片，等待复核。',
        need: '复核照片计量结果',
        evidence: 'sufficient', blocking: true,
        deadline: '2024-09-13 18:40', location: '文件交付事项', src: '文件交付',
        updatedAt: '2024-09-13 17:20' }
    ],

    factsConflict: true, factsCount: 2,
    stages: ['handover', 'review', 'recon'],
    recon: null,   // 资料交接未完成，对账尚未开始
    layers: {
      raw: [{ v: 'v1', at: '2024-09-12 18:20', by: '王师傅', srcName: '城南安装 · 领退料记录',
        rows: [{ f: '桥架材料', v: '216', u: '元' }, { f: '桥架安装', v: '144', u: '元' },
               { f: '线缆长度', v: '12', u: '米', unconfirmed: true }, { f: '搬运费', v: '60', u: '元' }] }],
      converted: [{ v: 'v1', at: '2024-09-12 18:21', by: '系统（普通程序）', cfg: '配置 v2',
        rows: [{ item: '桥架综合施工', amount: '360 元', rule: '216 + 144（合并）' },
               { item: '电缆穿管', amount: '540 元', rule: '12 米 × 45 元/米' },
               { item: '搬运费', amount: '60 元', rule: '无对应项 · 保留原值待人工判断', unconfirmed: true }] }],
      aiDraft: [{ v: 'v1', at: '2024-09-13 09:15', scene: 'material_organizing', conf: '中',
        text: '本单共识别 4 项本地记录，其中 3 项可映射到京东标准项目。桥架材料与安装属同一施工项的两条拆分记录；「搬运费」在京东标准项目中无对应项，建议由人工判断是否属于合同范围外事项。',
        evidence: ['服务商本地系统 · 领退料记录（文件 CN-2024-0912-018 · 第 3 行 · D3:E3）',
                   '新协同后台 · 接入配置 v2（映射表第 1–2 行）',
                   '文件交付事项 · 附件区（现场照片 4 张，其中 2 张无标尺参照）'],
        missing: ['现场照片未提供标尺，无法核实线缆 12 米的计量依据。'],
        questions: ['「搬运费 60 元」是否在基础安装费范围内？需查看本单适用合同条款。'] }],
      confirmed: [{ v: 'v1', at: '2024-09-13 10:02', by: '张三',
        text: '已确认桥架两项合并为「桥架综合施工」；线缆 12 米已补充现场照片（含标尺）。「搬运费」暂不提交，另开待办确认合同范围。' }],
      official: [
        { v: 'v1', ref: 'JD-INS-20240912-003901', at: '2024-09-12 19:05', by: '张三' },
        { v: 'v2', ref: 'JD-INS-20240913-004417', at: '2024-09-13 10:20', by: '张三' }]
    },
    facts: [
      { item: '线缆由 7 米增至 12 米', reason: '车位实际距离超出勘测', field: '线缆长度',
        material: '已确认 · 用户签字单', materialOk: true, affectsHandover: '是', affectsRecon: '是（+5 米穿管费）' },
      { item: '新增桥架 3 米', reason: '电缆需跨通道敷设', field: '桥架',
        material: '有现场照片，无书面确认', materialOk: false, affectsHandover: '是', affectsRecon: '是（新增桥架综合施工）' }
    ],
    formal: {
      ra1: [
        { formed: true, v: 'v1', ref: 'JD-INS-20240912-003901', at: '2024-09-12 19:05',
          by: '张三', role: '服务商资料负责人', source: '京东安装管理系统',
          submitted: '原始资料 v1 · 程序转换结果 v1 · 人工确认稿 v1' },
        { formed: true, v: 'v2', ref: 'JD-INS-20240913-004417', at: '2024-09-13 10:20',
          by: '张三', role: '服务商资料负责人', source: '京东安装管理系统',
          submitted: '原始资料 v2 · 程序转换结果 v2 · AI 整理草稿 v2 · 人工确认稿 v2' }
      ],
      ra2: [], ra3: []
    },
    originalPlan: {
      version: '方案 v1', formedAt: '2024-09-10 10:00', source: '京东安装履约系统',
      items: [
        { name: '基础安装', agreed: '交流充电桩 × 1（含 7 米内线缆）' },
        { name: '线缆长度', agreed: '7', unit: '米' },
        { name: '桥架', agreed: '无', unit: '—' },
        { name: '供料方', agreed: '服务商供料' }
      ]
    },
    actualCompletion: {
      obtained: true, recordedAt: '2024-09-12 18:20',
      source: '城南安装 · 领退料记录 + 文件交付事项 · 现场照片',
      items: [
        { name: '线缆长度', actual: '12', unit: '米' },
        { name: '桥架', actual: '3', unit: '米' },
        { name: '供料方', actual: '服务商供料' }
      ]
    },
    factChanges: [
      { id: 'FC-0001-A', item: '线缆由 7 米增至 12 米', reason: '车位实际距离超出勘测',
        approval: 'approved', approvedBy: '用户签字单', approvedAt: '2024-09-12 17:50',
        fields: ['线缆长度'], scope: { handover: true, recon: true }, evidence: '用户签字单（现场）' },
      { id: 'FC-0001-B', item: '新增桥架 3 米', reason: '电缆需跨通道敷设',
        approval: 'none', approvedBy: null, approvedAt: null,
        fields: ['桥架'], scope: { handover: true, recon: true }, evidence: null }
    ],
    validationResults: [
      { ruleId: 'REQ-001', type: '必填', status: 'pass', object: '完工明细', field: '线缆长度',
        message: '必填字段已填写', source: '京东安装管理系统 · 受理校验 v2', checkedAt: '2024-09-13 09:20' },
      { ruleId: 'FMT-003', type: '格式', status: 'pass', object: '完工明细', field: '完工日期',
        message: '日期格式符合 YYYY-MM-DD', source: '受理校验 v2', checkedAt: '2024-09-13 09:20' },
      { ruleId: 'RNG-002', type: '范围', status: 'fail', object: '完工明细', field: '桥架',
        message: '桥架计量缺少可核验依据：附件中无标尺参照', source: '受理校验 v2', checkedAt: '2024-09-13 09:20' },
      { ruleId: 'DUP-001', type: '重复', status: 'pass', object: '完工明细', field: '—',
        message: '未发现重复提交记录', source: '幂等校验（工单号＋资料类型＋提交版本）', checkedAt: '2024-09-13 09:20' }
    ],
    configSnapshotId: 'cfg-cn-001@v1',
    updatedAt: '2024-09-13 16:00'
  },

  /* ── 远程机电 · 朝阳大悦城 ─────────────────────────────——
     资料已提交，等待京东确认；被一条接入配置待确认事项阻塞 */
  {
    id: 'JD202409120014',
    provider: '远程机电', providerId: 'p-yc', providerOrg: '远程机电',
    project: '朝阳大悦城 P2 停车场',
    address: '北京市朝阳区朝阳北路 101 号 P2 层',
    owner: '李强', ownerRole: 'verifier', location: '文件交付事项',

    fulfillment: { label: '已验收', tone: 'green', at: '2024-09-11 17:30', source: '京东安装履约系统' },
    handover:    { label: '待确认', tone: 'amber', at: '2024-09-12 15:12', source: '新协同后台' },
    settlement:  { label: '待对账', tone: 'gray',  at: '2024-09-12 15:12', source: '新协同后台' },

    tasks: [
      { id: 'T-0014-A', primaryAction: '确认京东接收要求', title: '接入配置待双方确认', actionType: '确认', assignee: 'verifier',
        why: '远程机电「分段工程 · 完工明细」v1 已由服务商确认本地含义，京东侧接收要求尚未确认。',
        need: '京东业务确认接收口径',
        evidence: 'sufficient', blocking: true,
        deadline: '2024-09-14 18:00', location: '配置草稿', src: '文件交付',
        updatedAt: '2024-09-12 18:00' }
    ],

    factsConflict: false, factsCount: 0,
    stages: ['handover', 'review', 'recon'],
    recon: { period: '2024-09' },
    layers: {
      raw: [{ v: 'v1', at: '2024-09-12 14:30', by: '张三', srcName: '远程机电 · 分段工程',
        rows: [{ f: '桥架·材料', v: '198', u: '元' }, { f: '桥架·安装', v: '132', u: '元' },
               { f: '线缆长度', v: '10', u: '米' }] }],
      converted: [{ v: 'v1', at: '2024-09-12 14:31', by: '系统（普通程序）', cfg: '配置 v1（待生效）',
        rows: [{ item: '桥架综合施工', amount: '330 元', rule: '198 + 132（合并）' },
               { item: '电缆穿管', amount: '450 元', rule: '10 米 × 45 元/米' }] }],
      aiDraft: [],
      confirmed: [{ v: 'v1', at: '2024-09-12 15:02', by: '张三',
        text: '分段工程记录已逐项确认，与转换结果一致，无人工修改。' }],
      official: [{ v: 'v1', ref: 'JD-INS-20240912-003955', at: '2024-09-12 15:12', by: '张三' }]
    },
    formal: {
      ra1: [
        { formed: true, v: 'v1', ref: 'JD-INS-20240912-003955', at: '2024-09-12 15:12',
          by: '张三', role: '服务商资料负责人', source: '文件交付事项',
          submitted: '原始资料 v1 · 程序转换结果 v1 · 人工确认稿 v1' }
      ],
      ra2: [], ra3: []
    },
    originalPlan: {
      version: '方案 v1', formedAt: '2024-09-11 09:30', source: '京东安装履约系统',
      items: [
        { name: '基础安装', agreed: '交流充电桩 × 1（含 7 米内线缆）' },
        { name: '线缆长度', agreed: '10', unit: '米' },
        { name: '桥架', agreed: '2', unit: '米' }
      ]
    },
    actualCompletion: {
      obtained: true, recordedAt: '2024-09-12 14:30',
      source: '远程机电 · 分段工程记录',
      items: [
        { name: '线缆长度', actual: '10', unit: '米' },
        { name: '桥架', actual: '2', unit: '米' }
      ]
    },
    factChanges: [],
    validationResults: [
      { ruleId: 'REQ-001', type: '必填', status: 'pass', object: '完工明细', field: '线缆长度',
        message: '必填字段已填写', source: '京东安装管理系统 · 受理校验 v2', checkedAt: '2024-09-12 15:00' },
      { ruleId: 'FMT-003', type: '格式', status: 'pass', object: '完工明细', field: '完工日期',
        message: '日期格式符合 YYYY-MM-DD', source: '受理校验 v2', checkedAt: '2024-09-12 15:00' },
      { ruleId: 'RNG-002', type: '范围', status: 'pass', object: '完工明细', field: '桥架',
        message: '测量值在合理范围内', source: '受理校验 v2', checkedAt: '2024-09-12 15:00' },
      { ruleId: 'DUP-001', type: '重复', status: 'pass', object: '完工明细', field: '—',
        message: '未发现重复提交记录', source: '幂等校验', checkedAt: '2024-09-12 15:00' }
    ],
    providerLedger: {
      source: '远程机电本地系统', version: 'v1', syncedAt: '2024-09-12 14:30',
      items: [
        { name: '桥架·材料', amount: 198, basis: 'contract' },
        { name: '桥架·安装', amount: 132, basis: 'contract' },
        { name: '线缆穿管', amount: 450, qty: 10, unit: '米', basis: 'contract' }
      ]
    },
    jdLedger: {
      source: '京东账单模块', version: '2024-09-12', syncedAt: '2024-09-13 08:00',
      items: [
        { name: '桥架综合施工', amount: 330, qty: 1, unit: '项' },
        { name: '电缆穿管', amount: 450, qty: 10, unit: '米' }
      ]
    },
    configSnapshotId: 'cfg-yc-001@v1',
    updatedAt: '2024-09-13 13:00'
  },

  /* ── 安家安装 · 亦庄经开区 ─────────────────────────────——
     三项正式记录均已形成，三条状态链全部闭环（时序一致性基准样本） */
  {
    id: 'JD202409110008',
    provider: '安家安装', providerId: 'p-aj', providerOrg: '安家安装',
    project: '亦庄经开区 A 座',
    address: '北京市大兴区荣华南路 12 号 A 座 B1',
    owner: '李强', ownerRole: 'verifier', location: '对账工作区',

    // 时序：资料提交 09-11 14:02 → 核查结论 09-12 09:30 → 对账确认 09-12 11:15 → 验收 09-12 12:00
    fulfillment: { label: '已验收', tone: 'green', at: '2024-09-12 12:00', source: '京东安装履约系统' },
    handover:    { label: '已完成', tone: 'green', at: '2024-09-12 09:30', source: '新协同后台' },
    settlement:  { label: '已确认', tone: 'green', at: '2024-09-12 11:15', source: '新协同后台' },

    tasks: [],

    factsConflict: false, factsCount: 0,
    stages: ['handover', 'review', 'recon'],
    recon: { period: '2024-09' },
    layers: {
      raw: [{ v: 'v1', at: '2024-09-11 13:40', by: '李师傅', srcName: '安家安装 · Excel 交付',
        rows: [{ f: '桥架', v: '380', u: '元' }, { f: '线缆长度', v: '14', u: '米' }, { f: '调试费', v: '200', u: '元' }] }],
      converted: [{ v: 'v1', at: '2024-09-11 13:42', by: '系统（普通程序）', cfg: '配置 v1',
        rows: [{ item: '桥架综合施工', amount: '380 元', rule: '合并计算' },
               { item: '电缆穿管', amount: '630 元', rule: '14 米 × 45 元/米' },
               { item: '调试费', amount: '200 元', rule: '固定项' }] }],
      aiDraft: [{ v: 'v1', at: '2024-09-11 13:50', scene: 'material_organizing', conf: '高',
        text: 'Excel 交付的 3 项记录均可直接映射到京东标准项目，字段含义清晰，无需人工解释。',
        evidence: ['安家安装 · Excel 交付（第 2–4 行）', '新协同后台 · 接入配置 v1（映射表第 1–3 行）'],
        missing: [], questions: [] }],
      confirmed: [{ v: 'v1', at: '2024-09-11 14:00', by: '张三', text: '逐项确认，采纳 AI 整理结果，无修改。' }],
      official: [{ v: 'v1', ref: 'JD-INS-20240911-003712', at: '2024-09-11 14:02', by: '张三' }]
    },
    formal: {
      ra1: [
        { formed: true, v: 'v1', ref: 'JD-INS-20240911-003712', at: '2024-09-11 14:02',
          by: '张三', role: '服务商资料负责人', source: '京东安装管理系统',
          submitted: '原始资料 v1 · 程序转换结果 v1 · 人工确认稿 v1' }
      ],
      ra2: [
        { formed: true, v: 'v1', ref: 'JD-CHK-20240912-001044', at: '2024-09-12 09:30',
          by: '李强', role: '京东资料核查人员', source: '京东安装管理系统',
          submitted: '正式核查结论 v1' }
      ],
      ra3: [
        { formed: true, v: 'v1', ref: 'RECON-20240912-0007', at: '2024-09-12 11:15',
          by: '周明', role: '京东业务对账人员', source: '对账工作区',
          submitted: '对账确认结果 v1', amount: 0.00, note: '双方一致，无差额' }
      ]
    },
    originalPlan: {
      version: '方案 v1', formedAt: '2024-09-10 14:00', source: '京东安装履约系统',
      items: [
        { name: '基础安装', agreed: '交流充电桩 × 1（含 7 米内线缆）' },
        { name: '线缆长度', agreed: '14', unit: '米' },
        { name: '桥架', agreed: '4', unit: '米' }
      ]
    },
    actualCompletion: {
      obtained: true, recordedAt: '2024-09-11 13:40',
      source: '安家安装 · Excel 交付',
      items: [
        { name: '线缆长度', actual: '14', unit: '米' },
        { name: '桥架', actual: '4', unit: '米' }
      ]
    },
    factChanges: [],
    validationResults: [
      { ruleId: 'REQ-001', type: '必填', status: 'pass', object: '完工明细', field: '线缆长度',
        message: '必填字段已填写', source: '京东安装管理系统 · 受理校验 v2', checkedAt: '2024-09-11 13:55' },
      { ruleId: 'FMT-003', type: '格式', status: 'pass', object: '完工明细', field: '完工日期',
        message: '日期格式符合 YYYY-MM-DD', source: '受理校验 v2', checkedAt: '2024-09-11 13:55' },
      { ruleId: 'RNG-002', type: '范围', status: 'pass', object: '完工明细', field: '桥架',
        message: '测量值在合理范围内', source: '受理校验 v2', checkedAt: '2024-09-11 13:55' },
      { ruleId: 'DUP-001', type: '重复', status: 'pass', object: '完工明细', field: '—',
        message: '未发现重复提交记录', source: '幂等校验', checkedAt: '2024-09-11 13:55' }
    ],
    providerLedger: {
      source: '安家安装本地系统', version: 'v1', syncedAt: '2024-09-11 13:40',
      items: [
        { name: '桥架', amount: 380, qty: 4, unit: '米', basis: 'contract' },
        { name: '线缆穿管', amount: 630, qty: 14, unit: '米', basis: 'contract' },
        { name: '调试费', amount: 230, qty: 1, unit: '项', basis: 'contract' }
      ]
    },
    jdLedger: {
      source: '京东账单模块', version: '2024-09-12', syncedAt: '2024-09-13 08:00',
      items: [
        { name: '桥架综合施工', amount: 380, qty: 4, unit: '米' },
        { name: '电缆穿管', amount: 630, qty: 14, unit: '米' },
        { name: '调试费', amount: 230, qty: 1, unit: '项' }
      ]
    },
    configSnapshotId: 'cfg-aj-001@v1',
    updatedAt: '2024-09-12 12:00'
  },

  /* ── 城南安装 · 中关村软件园 ───────────────────────────——
     原系统提交中断 → 处理失败分组；带失败原因与续办入口 */
  {
    id: 'JD202409100003',
    provider: '城南安装', providerId: 'p-cn', providerOrg: '城南安装',
    project: '中关村软件园 B3',
    address: '北京市海淀区中关村软件园 3 号楼 B3 层',
    owner: '王磊', ownerRole: 'sysadmin', location: '本地任务',

    fulfillment: { label: '待整改', tone: 'orange', at: '2024-09-11 10:00', source: '京东安装履约系统' },
    handover:    { label: '异常',   tone: 'red',    at: '2024-09-13 15:00', source: '新协同后台' },
    settlement:  { label: '未开始', tone: 'gray',   at: null,                source: '新协同后台' },

    tasks: [
      { id: 'T-0003-A', primaryAction: '查询原系统版本', title: '原系统提交中断', actionType: '失败', assignee: 'sysadmin',
        why: '调用京东安装管理系统提交接口超时，已保留最近一次确认节点。',
        need: '确认原系统是否已生成正式版本后再重试',
        evidence: 'sufficient', blocking: true,
        deadline: '2024-09-13 16:00', location: '本地任务', src: '服务商本地系统',
        failReason: '提交接口超时（2024-09-13 10:18），未收到原系统回执',
        resumeFrom: '最近确认节点：人工确认稿 v1（2024-09-13 10:02）',
        updatedAt: '2024-09-13 15:00' }
    ],

    factsConflict: false, factsCount: 0,
    stages: ['handover', 'review', 'recon'],
    recon: null,
    layers: {
      raw: [{ v: 'v1', at: '2024-09-13 09:40', by: '王师傅', srcName: '城南安装 · 领退料记录',
        rows: [{ f: '桥架材料', v: '180', u: '元' }, { f: '线缆长度', v: '9', u: '米' }] }],
      converted: [{ v: 'v1', at: '2024-09-13 09:42', by: '系统（普通程序）', cfg: '配置 v2',
        rows: [{ item: '桥架综合施工', amount: '300 元', rule: '合并计算' },
               { item: '电缆穿管', amount: '405 元', rule: '9 米 × 45 元/米' }] }],
      aiDraft: [],
      confirmed: [{ v: 'v1', at: '2024-09-13 10:02', by: '张三', text: '逐项确认完毕，内容无修改。' }],
      official: []
    },
    formal: { ra1: [], ra2: [], ra3: [] },
    originalPlan: {
      version: '方案 v1', formedAt: '2024-09-09 10:00', source: '京东安装履约系统',
      items: [
        { name: '基础安装', agreed: '交流充电桩 × 1（含 7 米内线缆）' },
        { name: '线缆长度', agreed: '9', unit: '米' },
        { name: '桥架', agreed: '2', unit: '米' }
      ]
    },
    // 现场待整改，实际完工结果尚未取得 —— 不得推断，也不得伪造
    actualCompletion: null,
    factChanges: [
      { id: 'FC-0003-A', item: '现场待整改：桥架走向需调整', reason: '与消防管道冲突',
        approval: 'pending', approvedBy: null, approvedAt: null,
        fields: ['桥架'], scope: { handover: true, recon: false }, evidence: null }
    ],
    validationResults: [
      { ruleId: 'REQ-001', type: '必填', status: 'pass', object: '完工明细', field: '线缆长度',
        message: '必填字段已填写', source: '京东安装管理系统 · 受理校验 v2', checkedAt: '2024-09-13 09:45' },
      { ruleId: 'FMT-003', type: '格式', status: 'pass', object: '完工明细', field: '完工日期',
        message: '日期格式符合 YYYY-MM-DD', source: '受理校验 v2', checkedAt: '2024-09-13 09:45' },
      { ruleId: 'RNG-002', type: '范围', status: 'na', object: '完工明细', field: '桥架',
        message: '现场实际未取得，无法执行范围校验', source: '受理校验 v2', checkedAt: '2024-09-13 09:45' },
      { ruleId: 'DUP-001', type: '重复', status: 'pass', object: '完工明细', field: '—',
        message: '未发现重复提交记录', source: '幂等校验', checkedAt: '2024-09-13 09:45' }
    ],
    configSnapshotId: 'cfg-cn-001@v1',
    updatedAt: '2024-09-13 15:00'
  },

  /* ── 安家安装 · 石景山万达 ─────────────────────────────——
     对账发现 160 元待核差异；R-A3 记录缺「操作人」须被准入规则拒绝 */
  {
    id: 'JD202409080015',
    provider: '安家安装', providerId: 'p-aj', providerOrg: '安家安装',
    project: '石景山万达 B2',
    address: '北京市石景山区石景山路 18 号 B2 层',
    owner: '周明', ownerRole: 'reconciler', location: '对账工作区',

    fulfillment: { label: '已验收', tone: 'green', at: '2024-09-10 16:00', source: '京东安装履约系统' },
    handover:    { label: '已完成', tone: 'green', at: '2024-09-10 10:05', source: '新协同后台' },
    settlement:  { label: '有差异', tone: 'red',   at: '2024-09-10 14:20', source: '新协同后台' },

    tasks: [
      { id: 'T-0015-A', primaryAction: '确认差异处理意见', title: '160 元差额待记录处理意见', actionType: '解释', assignee: 'reconciler',
        why: '服务商侧「高空作业费 160 元」在京东账单中无对应项，程序已算出差额，等待记录处理意见。',
        need: '查看服务商提供的合同附件后记录处理意见',
        evidence: 'insufficient', blocking: false,
        deadline: '2024-09-13 12:00', location: '对账工作区', src: '文件交付',
        updatedAt: '2024-09-13 12:00' }
    ],

    factsConflict: true, factsCount: 1,
    stages: ['handover', 'review', 'recon'],
    recon: { period: '2024-09' },
    layers: {
      raw: [{ v: 'v1', at: '2024-09-09 16:20', by: '王师傅', srcName: '安家安装 · Excel 交付',
        rows: [{ f: '桥架', v: '420', u: '元' }, { f: '线缆长度', v: '12', u: '米' }, { f: '高空作业费', v: '160', u: '元' }] }],
      converted: [{ v: 'v1', at: '2024-09-09 16:22', by: '系统（普通程序）', cfg: '配置 v1',
        rows: [{ item: '桥架综合施工', amount: '420 元', rule: '合并计算' },
               { item: '电缆穿管', amount: '540 元', rule: '12 米 × 45 元/米' },
               { item: '高空作业费', amount: '160 元', rule: '无对应项 · 待人工判断', unconfirmed: true }] }],
      aiDraft: [{ v: 'v1', at: '2024-09-09 16:30', scene: 'material_organizing', conf: '低',
        text: '「高空作业费」在京东标准项目中无对应项，且未提供合同条款或批准材料，无法判断其归属。',
        evidence: ['安家安装 · Excel 交付（第 5 行）'],
        missing: ['未提供本单适用的合同条款原文。'],
        questions: ['该 160 元是否在合同约定范围内？'] }],
      confirmed: [{ v: 'v1', at: '2024-09-09 16:40', by: '张三',
        text: '已确认桥架与线缆项；高空作业费保留原值提交，由对账环节判断。' }],
      official: [{ v: 'v1', ref: 'JD-INS-20240909-003601', at: '2024-09-09 16:48', by: '张三' }]
    },
    facts: [
      { item: '新增高空作业 160 元', reason: '作业面高于 4 米，需搭设脚手架', field: '其他增项',
        material: '无合同条款依据，仅口头说明', materialOk: false, affectsHandover: '否', affectsRecon: '是（形成 160 元待核差异）' }
    ],
    formal: {
      ra1: [
        { formed: true, v: 'v1', ref: 'JD-INS-20240909-003601', at: '2024-09-09 16:48',
          by: '张三', role: '服务商资料负责人', source: '京东安装管理系统',
          submitted: '原始资料 v1 · 程序转换结果 v1 · 人工确认稿 v1' }
      ],
      ra2: [
        { formed: true, v: 'v1', ref: 'JD-CHK-20240910-000982', at: '2024-09-10 10:05',
          by: '李强', role: '京东资料核查人员', source: '京东安装管理系统',
          submitted: '正式核查结论 v1' }
      ],
      ra3: [
        // ⚠ 准入测试记录：故意缺少 by（操作人），用于验证四项准入缺一不可
        { formed: true, v: 'v1', ref: 'RECON-20240910-0003', at: '2024-09-10 14:20',
          by: null, role: null, source: '对账工作区',
          submitted: '对账确认结果 v1', amount: 160.00, note: '高空作业费待核差异',
          _testMissing: 'by' }
      ]
    },
    originalPlan: {
      version: '方案 v1', formedAt: '2024-09-08 09:00', source: '京东安装履约系统',
      items: [
        { name: '基础安装', agreed: '交流充电桩 × 1（含 7 米内线缆）' },
        { name: '线缆长度', agreed: '12', unit: '米' },
        { name: '桥架', agreed: '4', unit: '米' },
        { name: '高空作业', agreed: '无', unit: '—' }
      ]
    },
    actualCompletion: {
      obtained: true, recordedAt: '2024-09-09 16:20',
      source: '安家安装 · Excel 交付',
      items: [
        { name: '线缆长度', actual: '12', unit: '米' },
        { name: '桥架', actual: '4', unit: '米' },
        { name: '高空作业', actual: '1', unit: '项' }
      ]
    },
    factChanges: [
      { id: 'FC-0015-A', item: '新增高空作业 160 元', reason: '作业面高于 4 米，需搭设脚手架',
        approval: 'none', approvedBy: null, approvedAt: null,
        fields: ['其他增项'], scope: { handover: false, recon: true }, evidence: null }
    ],
    validationResults: [
      { ruleId: 'REQ-001', type: '必填', status: 'pass', object: '完工明细', field: '线缆长度',
        message: '必填字段已填写', source: '京东安装管理系统 · 受理校验 v2', checkedAt: '2024-09-09 16:35' },
      { ruleId: 'FMT-003', type: '格式', status: 'pass', object: '完工明细', field: '完工日期',
        message: '日期格式符合 YYYY-MM-DD', source: '受理校验 v2', checkedAt: '2024-09-09 16:35' },
      { ruleId: 'RNG-002', type: '范围', status: 'fail', object: '完工明细', field: '高空作业费',
        message: '该项无合同条款依据，超出可核验范围', source: '受理校验 v2', checkedAt: '2024-09-09 16:35' },
      { ruleId: 'DUP-001', type: '重复', status: 'pass', object: '完工明细', field: '—',
        message: '未发现重复提交记录', source: '幂等校验', checkedAt: '2024-09-09 16:35' }
    ],
    providerLedger: {
      source: '安家安装本地系统', version: 'v1', syncedAt: '2024-09-09 16:20',
      items: [
        { name: '桥架', amount: 420, qty: 4, unit: '米', basis: 'contract' },
        { name: '线缆穿管', amount: 540, qty: 12, unit: '米', basis: 'contract' },
        // 无合同条款或批准材料支撑 → 分类为「缺少依据」
        { name: '高空作业费', amount: 160, qty: 1, unit: '项', basis: null }
      ]
    },
    jdLedger: {
      source: '京东账单模块', version: '2024-09-10', syncedAt: '2024-09-13 08:00',
      items: [
        { name: '桥架综合施工', amount: 420, qty: 4, unit: '米' },
        { name: '电缆穿管', amount: 540, qty: 12, unit: '米' }
      ]
    },
    configSnapshotId: 'cfg-aj-001@v1',
    updatedAt: '2024-09-13 12:00'
  },

  /* ── 安家安装 · 通州梨园 ─────────────────────────────——
     对账发现「额外搬运 60 元」无对应项；由本服务商业务负责人提供合同依据 */
  {
    id: 'JD202409070006',
    provider: '安家安装', providerId: 'p-aj', providerOrg: '安家安装',
    project: '通州梨园充电站 B1',
    address: '北京市通州区梨园镇云景东路 55 号 B1 层',
    owner: '周明', ownerRole: 'reconciler', location: '对账工作区',

    fulfillment: { label: '已验收', tone: 'green', at: '2024-09-07 15:20', source: '京东安装履约系统' },
    handover:    { label: '已完成', tone: 'green', at: '2024-09-07 11:40', source: '新协同后台' },
    settlement:  { label: '有差异', tone: 'red',   at: '2024-09-08 10:05', source: '新协同后台' },

    tasks: [
      { id: 'T-0006-A', primaryAction: '补充合同依据', title: '「搬运费 60 元」是否属于合同范围', actionType: '解释', assignee: 'pvbiz',
        why: '京东标准项目中无独立对应项，需核对本单适用合同条款。',
        need: '本单适用合同条款原文，或批准材料',
        evidence: 'insufficient', blocking: false,
        deadline: '2024-09-12 18:00', location: '对账工作区', src: '服务商本地系统',
        updatedAt: '2024-09-12 16:00' }
    ],

    factsConflict: true, factsCount: 1,
    stages: ['handover', 'review', 'recon'],
    recon: { period: '2024-09' },
    layers: {
      raw: [{ v: 'v1', at: '2024-09-07 11:10', by: '赵师傅', srcName: '安家安装 · Excel 交付',
        rows: [{ f: '桥架', v: '300', u: '元' }, { f: '线缆长度', v: '8', u: '米' }, { f: '额外搬运', v: '60', u: '元' }] }],
      converted: [{ v: 'v1', at: '2024-09-07 11:12', by: '系统（普通程序）', cfg: '配置 v1',
        rows: [{ item: '桥架综合施工', amount: '300 元', rule: '合并计算' },
               { item: '电缆穿管', amount: '360 元', rule: '8 米 × 45 元/米' },
               { item: '额外搬运', amount: '60 元', rule: '无对应项 · 待人工判断', unconfirmed: true }] }],
      aiDraft: [],
      confirmed: [{ v: 'v1', at: '2024-09-07 11:30', by: '张三',
        text: '桥架与线缆项已确认；额外搬运保留原值提交，由对账环节判断。' }],
      official: [{ v: 'v1', ref: 'JD-INS-20240907-003488', at: '2024-09-07 11:40', by: '张三' }]
    },
    facts: [
      { item: '新增额外搬运 60 元', reason: '现场通道受限，需二次转运材料', field: '其他增项',
        material: '无批准材料', materialOk: false, affectsHandover: '否', affectsRecon: '是（形成 60 元待核差异）' }
    ],
    formal: {
      ra1: [
        { formed: true, v: 'v1', ref: 'JD-INS-20240907-003488', at: '2024-09-07 11:40',
          by: '张三', role: '服务商资料负责人', source: '京东安装管理系统',
          submitted: '原始资料 v1 · 程序转换结果 v1 · 人工确认稿 v1' }
      ],
      ra2: [
        { formed: true, v: 'v1', ref: 'JD-CHK-20240907-000901', at: '2024-09-07 16:10',
          by: '李强', role: '京东资料核查人员', source: '京东安装管理系统',
          submitted: '正式核查结论 v1' }
      ],
      ra3: []
    },
    originalPlan: {
      version: '方案 v1', formedAt: '2024-09-06 09:00', source: '京东安装履约系统',
      items: [
        { name: '基础安装', agreed: '交流充电桩 × 1（含 7 米内线缆）' },
        { name: '线缆长度', agreed: '8', unit: '米' },
        { name: '桥架', agreed: '3', unit: '米' },
        { name: '搬运', agreed: '无', unit: '—' }
      ]
    },
    actualCompletion: {
      obtained: true, recordedAt: '2024-09-07 11:10',
      source: '安家安装 · Excel 交付',
      items: [
        { name: '线缆长度', actual: '8', unit: '米' },
        { name: '桥架', actual: '3', unit: '米' },
        { name: '搬运', actual: '1', unit: '项' }
      ]
    },
    factChanges: [
      { id: 'FC-0006-A', item: '新增额外搬运 60 元', reason: '现场通道受限，需二次转运材料',
        approval: 'none', approvedBy: null, approvedAt: null,
        fields: ['其他增项'], scope: { handover: false, recon: true }, evidence: null }
    ],
    validationResults: [
      { ruleId: 'REQ-001', type: '必填', status: 'pass', object: '完工明细', field: '线缆长度',
        message: '必填字段已填写', source: '京东安装管理系统 · 受理校验 v2', checkedAt: '2024-09-07 11:20' },
      { ruleId: 'FMT-003', type: '格式', status: 'pass', object: '完工明细', field: '完工日期',
        message: '日期格式符合 YYYY-MM-DD', source: '受理校验 v2', checkedAt: '2024-09-07 11:20' },
      { ruleId: 'RNG-002', type: '范围', status: 'fail', object: '完工明细', field: '额外搬运',
        message: '该项无对应标准项目，无法执行范围校验', source: '受理校验 v2', checkedAt: '2024-09-07 11:20' },
      { ruleId: 'DUP-001', type: '重复', status: 'pass', object: '完工明细', field: '—',
        message: '未发现重复提交记录', source: '幂等校验', checkedAt: '2024-09-07 11:20' }
    ],
    providerLedger: {
      source: '安家安装本地系统', version: 'v1', syncedAt: '2024-09-07 11:10',
      items: [
        { name: '桥架', amount: 300, qty: 3, unit: '米', basis: 'contract' },
        { name: '线缆穿管', amount: 360, qty: 8, unit: '米', basis: 'contract' },
        // 有批准材料但京东侧无对应项 → 分类为「无法对应」
        { name: '额外搬运', amount: 60, qty: 1, unit: '项', basis: 'approved' }
      ]
    },
    jdLedger: {
      source: '京东账单模块', version: '2024-09-08', syncedAt: '2024-09-13 08:00',
      items: [
        // 与本地记录金额相差 20 元 → 分类为「金额差异」
        { name: '桥架综合施工', amount: 280, qty: 3, unit: '米' },
        { name: '电缆穿管', amount: 360, qty: 8, unit: '米' }
      ]
    },
    configSnapshotId: 'cfg-aj-001@v1',
    updatedAt: '2024-09-13 12:00'
  },

  /* ── 远程机电 · 大兴绿地中心 ─────────────────────────——
     覆盖「一对多归并」与「数量差异」两类差异对象 */
  {
    id: 'JD202409050009',
    provider: '远程机电', providerId: 'p-yc', providerOrg: '远程机电',
    project: '大兴绿地中心 B2',
    address: '北京市大兴区金星西路 6 号 B2 层',
    owner: '周明', ownerRole: 'reconciler', location: '对账工作区',

    fulfillment: { label: '已验收', tone: 'green', at: '2024-09-05 16:00', source: '京东安装履约系统' },
    handover:    { label: '已完成', tone: 'green', at: '2024-09-05 11:20', source: '新协同后台' },
    settlement:  { label: '有差异', tone: 'red',   at: '2024-09-06 09:40', source: '新协同后台' },

    tasks: [
      { id: 'T-0009-A', primaryAction: '核对差异依据', title: '桥架与线缆两项差异待核对', actionType: '解释', assignee: 'reconciler',
        why: '桥架为两条本地记录合并后与京东账单相差 40 元；线缆长度两侧相差 1 米。',
        need: '核对拆包记录与实际敷设米数',
        evidence: 'insufficient', blocking: false,
        deadline: '2024-09-12 18:00', location: '对账工作区', src: '服务商本地系统',
        updatedAt: '2024-09-12 10:00' }
    ],

    factsConflict: false, factsCount: 0,
    stages: ['handover', 'review', 'recon'],
    recon: { period: '2024-09' },
    layers: {
      raw: [{ v: 'v1', at: '2024-09-05 11:00', by: '赵师傅', srcName: '远程机电 · 分段工程',
        rows: [{ f: '桥架·材料', v: '240', u: '元' }, { f: '桥架·安装', v: '160', u: '元' },
               { f: '线缆长度', v: '12', u: '米' }] }],
      converted: [{ v: 'v1', at: '2024-09-05 11:02', by: '系统（普通程序）', cfg: '配置 v1',
        rows: [{ item: '桥架综合施工', amount: '400 元', rule: '240 + 160（合并）' },
               { item: '电缆穿管', amount: '540 元', rule: '12 米 × 45 元/米' }] }],
      aiDraft: [], confirmed: [{ v: 'v1', at: '2024-09-05 11:15', by: '张三', text: '逐项确认完毕。' }],
      official: [{ v: 'v1', ref: 'JD-INS-20240905-003322', at: '2024-09-05 11:20', by: '张三' }]
    },
    originalPlan: {
      version: '方案 v1', formedAt: '2024-09-04 09:00', source: '京东安装履约系统',
      items: [
        { name: '基础安装', agreed: '交流充电桩 × 1（含 7 米内线缆）' },
        { name: '线缆长度', agreed: '11', unit: '米' },
        { name: '桥架', agreed: '4', unit: '米' }
      ]
    },
    actualCompletion: {
      obtained: true, recordedAt: '2024-09-05 11:00', source: '远程机电 · 分段工程记录',
      items: [{ name: '线缆长度', actual: '12', unit: '米' }, { name: '桥架', actual: '4', unit: '米' }]
    },
    factChanges: [],
    validationResults: [
      { ruleId: 'REQ-001', type: '必填', status: 'pass', object: '完工明细', field: '线缆长度',
        message: '必填字段已填写', source: '受理校验 v2', checkedAt: '2024-09-05 11:10' },
      { ruleId: 'FMT-003', type: '格式', status: 'pass', object: '完工明细', field: '完工日期',
        message: '日期格式符合 YYYY-MM-DD', source: '受理校验 v2', checkedAt: '2024-09-05 11:10' },
      { ruleId: 'RNG-002', type: '范围', status: 'pass', object: '完工明细', field: '桥架',
        message: '测量值在合理范围内', source: '受理校验 v2', checkedAt: '2024-09-05 11:10' },
      { ruleId: 'DUP-001', type: '重复', status: 'pass', object: '完工明细', field: '—',
        message: '未发现重复提交记录', source: '幂等校验', checkedAt: '2024-09-05 11:10' }
    ],
    providerLedger: {
      source: '远程机电本地系统', version: 'v1', syncedAt: '2024-09-05 11:00',
      items: [
        { name: '桥架·材料', amount: 240, basis: 'contract' },
        { name: '桥架·安装', amount: 160, basis: 'contract' },
        { name: '线缆穿管', amount: 540, qty: 12, unit: '米', basis: 'contract' }
      ]
    },
    jdLedger: {
      source: '京东账单模块', version: '2024-09-06', syncedAt: '2024-09-13 08:00',
      items: [
        { name: '桥架综合施工', amount: 360, qty: 4, unit: '米' },
        { name: '电缆穿管', amount: 495, qty: 11, unit: '米' }
      ]
    },
    formal: {
      ra1: [{ formed: true, v: 'v1', ref: 'JD-INS-20240905-003322', at: '2024-09-05 11:20',
        by: '张三', role: '服务商资料负责人', source: '京东安装管理系统',
        submitted: '原始资料 v1 · 程序转换结果 v1 · 人工确认稿 v1' }],
      ra2: [{ formed: true, v: 'v1', ref: 'JD-CHK-20240905-000877', at: '2024-09-05 16:30',
        by: '李强', role: '京东资料核查人员', source: '京东安装管理系统',
        submitted: '正式核查结论 v1' }],
      ra3: []
    },
    configSnapshotId: 'cfg-yc-001@v1',
    updatedAt: '2024-09-12 10:00'
  },

  /* ── 城南安装 · 亦庄荣京东街 ─────────────────────────——
     对账「处理中 / 待确认」样本：双方已交换处理意见、存在人工确认稿，
     但**尚未经过 C6**，因此 R-A3 必须为空，不得伪造成已正式确认。 */
  {
    id: 'JD202409040004',
    provider: '城南安装', providerId: 'p-cn', providerOrg: '城南安装',
    project: '亦庄荣京东街 B1',
    address: '北京市大兴区荣京东街 12 号 B1 层',
    owner: '周明', ownerRole: 'reconciler', location: '对账工作区',

    fulfillment: { label: '已验收', tone: 'green', at: '2024-09-04 15:00', source: '京东安装履约系统' },
    handover:    { label: '已完成', tone: 'green', at: '2024-09-04 11:10', source: '新协同后台' },
    settlement:  { label: '处理中', tone: 'amber', at: '2024-09-12 09:30', source: '新协同后台' },

    tasks: [
      { id: 'T-0004-A', primaryAction: '确认差异处理意见', title: '对账处理意见待确认', actionType: '解释', assignee: 'reconciler',
        why: '服务商已提供合同补充条款说明额外穿墙孔 80 元的来源，等待记录处理意见。',
        need: '确认处理意见并进入正式确认流程',
        evidence: 'sufficient', blocking: false,
        deadline: '2024-09-14 18:00', location: '对账工作区', src: '文件交付',
        updatedAt: '2024-09-12 09:30' }
    ],

    factsConflict: false, factsCount: 0,
    stages: ['handover', 'review', 'recon'],
    recon: { period: '2024-09' },
    layers: {
      raw: [{ v: 'v1', at: '2024-09-04 11:00', by: '王师傅', srcName: '城南安装 · 领退料记录',
        rows: [{ f: '桥架材料', v: '260', u: '元' }, { f: '桥架安装', v: '160', u: '元' },
               { f: '线缆长度', v: '11', u: '米' }, { f: '穿墙孔', v: '80', u: '元' }] }],
      converted: [{ v: 'v1', at: '2024-09-04 11:02', by: '系统（普通程序）', cfg: '配置 v2',
        rows: [{ item: '桥架综合施工', amount: '420 元', rule: '260 + 160（合并）' },
               { item: '电缆穿管', amount: '495 元', rule: '11 米 × 45 元/米' },
               { item: '穿墙孔', amount: '80 元', rule: '无对应项 · 待人工判断', unconfirmed: true }] }],
      aiDraft: [],
      confirmed: [{ v: 'v1', at: '2024-09-04 11:08', by: '张三',
        text: '桥架与线缆项已确认；穿墙孔保留原值提交，由对账环节判断。' }],
      official: [{ v: 'v1', ref: 'JD-INS-20240904-003277', at: '2024-09-04 11:10', by: '张三' }]
    },
    originalPlan: {
      version: '方案 v1', formedAt: '2024-09-03 09:00', source: '京东安装履约系统',
      items: [
        { name: '基础安装', agreed: '交流充电桩 × 1（含 7 米内线缆）' },
        { name: '线缆长度', agreed: '11', unit: '米' },
        { name: '桥架', agreed: '4', unit: '米' }
      ]
    },
    actualCompletion: {
      obtained: true, recordedAt: '2024-09-04 11:00', source: '城南安装 · 领退料记录',
      items: [{ name: '线缆长度', actual: '11', unit: '米' }, { name: '桥架', actual: '4', unit: '米' }]
    },
    factChanges: [],
    validationResults: [
      { ruleId: 'REQ-001', type: '必填', status: 'pass', object: '完工明细', field: '线缆长度',
        message: '必填字段已填写', source: '受理校验 v2', checkedAt: '2024-09-04 11:05' },
      { ruleId: 'FMT-003', type: '格式', status: 'pass', object: '完工明细', field: '完工日期',
        message: '日期格式符合 YYYY-MM-DD', source: '受理校验 v2', checkedAt: '2024-09-04 11:05' },
      { ruleId: 'RNG-002', type: '范围', status: 'fail', object: '完工明细', field: '穿墙孔',
        message: '该项无标准对应项目，需补充合同依据', source: '受理校验 v2', checkedAt: '2024-09-04 11:05' },
      { ruleId: 'DUP-001', type: '重复', status: 'pass', object: '完工明细', field: '—',
        message: '未发现重复提交记录', source: '幂等校验', checkedAt: '2024-09-04 11:05' }
    ],
    providerLedger: {
      source: '城南安装本地系统', version: 'v1', syncedAt: '2024-09-04 11:00',
      items: [
        { name: '桥架材料', amount: 260, basis: 'contract' },
        { name: '桥架安装', amount: 160, basis: 'contract' },
        { name: '线缆穿管', amount: 495, qty: 11, unit: '米', basis: 'contract' },
        { name: '穿墙孔', amount: 80, qty: 1, unit: '个', basis: 'approved' }
      ]
    },
    jdLedger: {
      source: '京东账单模块', version: '2024-09-05', syncedAt: '2024-09-13 08:00',
      items: [
        { name: '桥架综合施工', amount: 420, qty: 4, unit: '米' },
        { name: '电缆穿管', amount: 495, qty: 11, unit: '米' }
      ]
    },
    formal: {
      ra1: [{ formed: true, v: 'v1', ref: 'JD-INS-20240904-003277', at: '2024-09-04 11:10',
        by: '张三', role: '服务商资料负责人', source: '京东安装管理系统',
        submitted: '原始资料 v1 · 程序转换结果 v1 · 人工确认稿 v1' }],
      ra2: [{ formed: true, v: 'v1', ref: 'JD-CHK-20240904-000855', at: '2024-09-04 15:00',
        by: '李强', role: '京东资料核查人员', source: '京东安装管理系统',
        submitted: '正式核查结论 v1' }],
      ra3: []
    },
    configSnapshotId: 'cfg-cn-001@v1',
    updatedAt: '2024-09-12 09:30'
  },

  /* ── 城南安装 · 大兴生物医药基地 ─────────────────────——
     绑定 cfg-cn-001@v2：v2 新增「穿墙孔 → 其他增项」映射，
     同样的本地字段在 v1 工单上会进入 unable_to_map。 */
  {
    id: 'JD202409060005',
    provider: '城南安装', providerId: 'p-cn', providerOrg: '城南安装',
    project: '大兴生物医药基地 B1',
    address: '北京市大兴区科苑路 18 号 B1 层',
    owner: '周明', ownerRole: 'reconciler', location: '对账工作区',
    formal: {
      ra1: [{ formed: true, v: 'v1', ref: 'JD-INS-20240906-003450', at: '2024-09-06 14:20',
        by: '张三', role: '服务商资料负责人', source: '京东安装管理系统',
        submitted: '原始资料 v1 · 程序转换结果 v1 · 人工确认稿 v1' }],
      ra2: [], ra3: []
    },
    configSnapshotId: 'cfg-cn-001@v2',

    fulfillment: { label: '已验收', tone: 'green', at: '2024-09-06 17:00', source: '京东安装履约系统' },
    handover:    { label: '已完成', tone: 'green', at: '2024-09-06 14:20', source: '新协同后台' },
    settlement:  { label: '有差异', tone: 'red',   at: '2024-09-07 09:30', source: '新协同后台' },

    tasks: [
      { id: 'T-0005-A', primaryAction: '核对拆包记录与单价', title: '桥架合并金额与京东账单相差 20 元', actionType: '解释', assignee: 'reconciler',
        why: '本地「桥架材料 300 + 桥架安装 180」合并为 480 元，京东账单为 460 元。',
        need: '核对拆包记录与单价依据',
        evidence: 'insufficient', blocking: false,
        deadline: '2024-09-14 18:00', location: '对账工作区', src: '服务商本地系统',
        updatedAt: '2024-09-12 09:30' }
    ],

    factsConflict: false, factsCount: 0,
    stages: ['handover', 'review', 'recon'],
    recon: { period: '2024-09' },
    layers: {
      raw: [{ v: 'v1', at: '2024-09-06 14:00', by: '王师傅', srcName: '城南安装 · 领退料记录',
        rows: [{ f: '桥架材料', v: '300', u: '元' }, { f: '桥架安装', v: '180', u: '元' },
               { f: '线缆长度', v: '11', u: '米' }, { f: '穿墙孔', v: '90', u: '元' }] }],
      converted: [{ v: 'v1', at: '2024-09-06 14:02', by: '系统（普通程序）', cfg: '配置 v2',
        rows: [{ item: '桥架综合施工', amount: '480 元', rule: '300 + 180（合并）' },
               { item: '电缆穿管', amount: '495 元', rule: '11 米 × 45 元/米' },
               { item: '其他增项', amount: '90 元', rule: '穿墙孔 → 其他增项（v2 映射）' }] }],
      aiDraft: [], confirmed: [{ v: 'v1', at: '2024-09-06 14:15', by: '张三', text: '逐项确认完毕，穿墙孔按 v2 映射归入其他增项。' }],
      official: [{ v: 'v1', ref: 'JD-INS-20240906-003450', at: '2024-09-06 14:20', by: '张三' }]
    },
    originalPlan: {
      version: '方案 v1', formedAt: '2024-09-05 09:00', source: '京东安装履约系统',
      items: [{ name: '基础安装', agreed: '交流充电桩 × 1（含 7 米内线缆）' },
              { name: '线缆长度', agreed: '11', unit: '米' }, { name: '桥架', agreed: '4', unit: '米' }]
    },
    actualCompletion: {
      obtained: true, recordedAt: '2024-09-06 14:00', source: '城南安装 · 领退料记录',
      items: [{ name: '线缆长度', actual: '11', unit: '米' }, { name: '桥架', actual: '4', unit: '米' }]
    },
    factChanges: [],
    validationResults: [
      { ruleId: 'REQ-001', type: '必填', status: 'pass', object: '完工明细', field: '线缆长度', message: '必填字段已填写', source: '受理校验 v2', checkedAt: '2024-09-06 14:10' },
      { ruleId: 'FMT-003', type: '格式', status: 'pass', object: '完工明细', field: '完工日期', message: '日期格式符合 YYYY-MM-DD', source: '受理校验 v2', checkedAt: '2024-09-06 14:10' },
      { ruleId: 'RNG-002', type: '范围', status: 'pass', object: '完工明细', field: '穿墙孔', message: '已按 v2 映射归入其他增项，范围校验通过', source: '受理校验 v2', checkedAt: '2024-09-06 14:10' },
      { ruleId: 'DUP-001', type: '重复', status: 'pass', object: '完工明细', field: '—', message: '未发现重复提交记录', source: '幂等校验', checkedAt: '2024-09-06 14:10' }
    ],
    providerLedger: {
      source: '城南安装本地系统', version: 'v1', syncedAt: '2024-09-06 14:00',
      items: [
        { name: '桥架材料', amount: 300, basis: 'contract' },
        { name: '桥架安装', amount: 180, basis: 'contract' },
        { name: '线缆穿管', amount: 495, qty: 11, unit: '米', basis: 'contract' },
        { name: '穿墙孔', amount: 90, qty: 1, unit: '个', basis: 'approved' }
      ]
    },
    jdLedger: {
      source: '京东账单模块', version: '2024-09-07', syncedAt: '2024-09-13 08:00',
      items: [
        { name: '桥架综合施工', amount: 460, qty: 4, unit: '米' },
        { name: '电缆穿管', amount: 495, qty: 11, unit: '米' },
        { name: '其他增项', amount: 90, qty: 1, unit: '项' }
      ]
    },
    updatedAt: '2024-09-12 09:30'
  },

  /* ── 远程机电 · 通州万达 ─────────────────────────────——
     现场履约中，资料仍在转换；无待办、无正式记录 */
  {
    id: 'JD202409090021',
    provider: '远程机电', providerId: 'p-yc', providerOrg: '远程机电',
    project: '通州万达 B1',
    address: '北京市通州区新华西街 58 号 B1 层',
    owner: '周明', ownerRole: 'reconciler', location: '京东安装履约系统',

    fulfillment: { label: '履约中', tone: 'blue', at: '2024-09-11 09:00', source: '京东安装履约系统' },
    handover:    { label: '转换中', tone: 'blue', at: '2024-09-11 09:00', source: '新协同后台' },
    settlement:  { label: '未开始', tone: 'gray', at: null,                source: '新协同后台' },

    tasks: [],

    factsConflict: false, factsCount: 0,
    stages: ['handover', 'review', 'recon'],
    recon: null,
    layers: {
      raw: [{ v: 'v1', at: '2024-09-11 09:00', by: '赵师傅', srcName: '远程机电 · 分段工程',
        rows: [{ f: '桥架·材料', v: '150', u: '元' }] }],
      converted: [], aiDraft: [], confirmed: [], official: []
    },
    formal: { ra1: [], ra2: [], ra3: [] },
    originalPlan: {
      version: '方案 v1', formedAt: '2024-09-09 15:00', source: '京东安装履约系统',
      items: [
        { name: '基础安装', agreed: '交流充电桩 × 1（含 7 米内线缆）' },
        { name: '线缆长度', agreed: '9', unit: '米' },
        { name: '桥架', agreed: '2', unit: '米' }
      ]
    },
    // 现场履约中，实际完工结果尚未取得
    actualCompletion: null,
    factChanges: [],
    validationResults: [
      { ruleId: 'REQ-001', type: '必填', status: 'na', object: '完工明细', field: '线缆长度',
        message: '资料尚未交付，暂不执行必填校验', source: '受理校验 v2', checkedAt: '2024-09-11 09:05' },
      { ruleId: 'FMT-003', type: '格式', status: 'na', object: '完工明细', field: '完工日期',
        message: '资料尚未交付，暂不执行格式校验', source: '受理校验 v2', checkedAt: '2024-09-11 09:05' },
      { ruleId: 'RNG-002', type: '范围', status: 'na', object: '完工明细', field: '桥架',
        message: '现场实际未取得，无法执行范围校验', source: '受理校验 v2', checkedAt: '2024-09-11 09:05' },
      { ruleId: 'DUP-001', type: '重复', status: 'pass', object: '完工明细', field: '—',
        message: '未发现重复提交记录', source: '幂等校验', checkedAt: '2024-09-11 09:05' }
    ],
    configSnapshotId: 'cfg-yc-001@v1',
    updatedAt: '2024-09-11 18:00'
  }
];

/* ============================================================
   五、派生视图：五动作分组、计数与简报
   ------------------------------------------------------------
   全部由 WORK_ORDERS 派生。页面不得另行硬编码任何数字。
   ============================================================ */

/* 五动作分组（v2.1 §L2） */
const ACTION_GROUPS = [
  { key: 'confirm', label: '待我确认' },
  { key: 'supply',  label: '待我补充' },
  { key: 'explain', label: '待我解释' },
  { key: 'waiting', label: '等待对方' },
  { key: 'failed',  label: '处理失败' }
];

const ACTION_GROUP_OF_TYPE = { '确认': 'confirm', '补充': 'supply', '解释': 'explain' };

/* 队列层主动作文案。**不得出现「复核通过」**——该词会被理解为
   已形成正式核查结论，而队列层的按钮只完成本项处理、不产生正式记录。 */
const ACTION_LABELS = {
  '确认': '确认本项处理结果',
  '补充': '补充材料',
  '解释': '补充依据',
  '等待': '等待对方处理',
  '失败': '查询原系统版本'
};
const ACTION_TYPES = ['确认', '补充', '解释', '等待', '失败'];

/* L1 动作入口卡的一句话任务解释（按数量动态生成，非 AI） */
const AG_DESC = {
  confirm: (n) => n ? `${n} 项处理结果等待你的业务判断` : '暂无需要你确认的处理结果',
  supply:  (n) => n ? `${n} 项资料需要你补充后重新提交` : '暂无需要你补充的资料',
  explain: (n) => n ? `${n} 项差异需要你提供依据或说明` : '暂无需要你解释的差异',
  waiting: (n) => n ? `${n} 项已交对方，等待回复（只能查看与催办）` : '当前没有等待对方的事项',
  failed:  (n) => n ? `${n} 项处理失败，需查询原系统后续办` : '当前没有处理失败的事项'
};

/* 一条任务相对当前角色属于哪个分组 */
function groupOfTask(task, roleKey) {
  if (task.actionType === '失败') return 'failed';
  if (task.assignee === roleKey) return ACTION_GROUP_OF_TYPE[task.actionType] || 'supply';
  return 'waiting';
}

/* 当前角色的全部可见任务（扁平化，带工单上下文） */
function visibleTasks(roleKey) {
  const out = [];
  visibleWorkOrders(roleKey).forEach(o => {
    (o.tasks || []).forEach(t => out.push(Object.assign({}, t, {
      orderId: o.id, provider: o.provider, project: o.project,
      orderUpdatedAt: o.updatedAt
    })));
  });
  return out;
}

/* 五动作分组计数 */
function actionCounts(roleKey) {
  const c = { confirm: 0, supply: 0, explain: 0, waiting: 0, failed: 0 };
  visibleTasks(roleKey).forEach(t => { c[groupOfTask(t, roleKey)]++; });
  return c;
}

/* 按分组取任务 */
function tasksInGroup(roleKey, group) {
  return visibleTasks(roleKey).filter(t => groupOfTask(t, roleKey) === group);
}

/* 角色今日简报（R-01 / R-06）——**由普通程序模板填充，禁止调用 AI** */
function buildBrief(roleKey) {
  const role = ROLES[roleKey];
  const mine = visibleTasks(roleKey).filter(t =>
    ['confirm', 'supply', 'explain'].includes(groupOfTask(t, roleKey)));
  const overdue = mine.filter(t => isOverdue(t.deadline));
  const waiting = tasksInGroup(roleKey, 'waiting');
  const failed = tasksInGroup(roleKey, 'failed');

  // 最优先事项：先看阻断，再看截止时间
  const ranked = mine.slice().sort((a, b) => {
    if (a.blocking !== b.blocking) return a.blocking ? -1 : 1;
    return (a.deadline || '9999') < (b.deadline || '9999') ? -1 : 1;
  });
  const top = ranked[0] || null;
  const ACTION_VERB = { '确认': '复核确认', '补充': '资料补充', '解释': '差异解释', '失败': '异常续办' };

  const parts = [];
  if (mine.length === 0) {
    parts.push(`今天没有需要你处理的事项。`);
  } else {
    parts.push(`今天有 ${mine.length} 项需要你处理` +
      (overdue.length ? `，其中 ${overdue.length} 项已超期。` : `。`));
    if (top) {
      parts.push(`优先处理 ${top.orderId} 的${ACTION_VERB[top.actionType] || '待办事项'}` +
        (isOverdue(top.deadline) ? `（已超期）` : `（截止 ${top.deadline}）`) + `；`);
    }
  }
  if (waiting.length) parts.push(`另有 ${waiting.length} 项正在等待对方回复。`);
  if (failed.length) parts.push(`有 ${failed.length} 项处理失败，需查询原系统后续办。`);
  if (mine.length === 0 && !waiting.length && !failed.length) parts.push(`当前无待办。`);

  return {
    text: parts.join(''),
    counts: actionCounts(roleKey),
    mineCount: mine.length,
    overdueCount: overdue.length,
    waitingCount: waiting.length,
    failedCount: failed.length,
    top,
    role: role.title
  };
}

/* 「我负责的工单」：当前角色是责任岗位的工单 */
function myWorkOrders(roleKey) {
  return visibleWorkOrders(roleKey).filter(o => o.ownerRole === roleKey);
}

/* ============================================================
   七、W5 接入配置治理（R-03 / R-14）
   ------------------------------------------------------------
   三层模型：config → configVersion → fieldMapping
   生命周期：draft → pending_confirmation → pending_review → effective → disabled
   本地含义确认与京东接收要求确认是**两条独立记录**，不得合并成一个状态字段。
   同角色双人分权：创建人与审核人必须是两个不同账号；创建人禁止自审。

   ⚠ 接入配置治理**不形成工单正式记录**（不产生 R-A1/R-A2/R-A3）。
   ============================================================ */

const CONFIG_STATUS = {
  draft: { label: '草稿', tone: 'gray' },
  pending_confirmation: { label: '待确认', tone: 'amber' },
  pending_review: { label: '待审核生效', tone: 'orange' },
  effective: { label: '生效中', tone: 'green' },
  disabled: { label: '已停用', tone: 'gray' }
};

const CONFIG_ACTIONS = {
  create_draft: '创建配置草稿',
  local_confirm: '服务商确认本地含义',
  jd_confirm: '京东确认接收要求',
  submit_review: '提交审核',
  activate: '审核生效',
  disable: '停用配置',
  new_version: '创建新版本'
};

const CONFIGS = [
  { configId: 'cfg-cn-001', providerId: 'p-cn', provider: '城南安装',
    name: '领退料记录 · 完工明细', sourceSystem: '服务商本地系统',
    applicableScope: '望京片区 · 2024 批次',
    currentEffectiveVersionId: 'cfg-cn-001@v2', updatedAt: '2024-09-06 10:20' },
  { configId: 'cfg-yc-001', providerId: 'p-yc', provider: '远程机电',
    name: '分段工程 · 完工明细', sourceSystem: '文件交付',
    applicableScope: '朝阳片区',
    currentEffectiveVersionId: 'cfg-yc-001@v1', updatedAt: '2024-09-12 09:10' },
  { configId: 'cfg-aj-001', providerId: 'p-aj', provider: '安家安装',
    name: '完工明细（Excel 交付）', sourceSystem: '京东入口',
    applicableScope: '亦庄 / 石景山 / 通州片区',
    currentEffectiveVersionId: 'cfg-aj-001@v1', updatedAt: '2024-09-12 11:40' }
];

/* 字段映射：本地字段 → 京东标准字段。
   无对应映射规则的本地字段在转换时进入 **unable_to_map**，不使用默认猜测。 */
function fm(ruleId, localField, jdField, rule, cond, evidence, conf, decision, by, at) {
  return { mappingRuleId: ruleId, localField, jdField, conversionRule: rule,
    applicableCondition: cond, evidence, confidence: conf,
    source: 'human', humanDecision: decision, decisionBy: by, decisionAt: at };
}

const CONFIG_VERSIONS = [
  /* ── 城南安装 v1：已被 v2 取代，完整保留；历史工单继续绑定此版本 ── */
  { versionId: 'cfg-cn-001@v1', configId: 'cfg-cn-001', versionNumber: 'v1',
    status: 'disabled', changeReason: '初始版本', previousVersionId: null,
    createdBy: 'chenjing', createdAt: '2024-05-02 10:00',
    localConfirmedBy: 'zhangsan', localConfirmedAt: '2024-05-06 14:20',
    jdConfirmedBy: 'liqiang', jdConfirmedAt: '2024-05-07 09:30',
    reviewedBy: 'sunwei', reviewedAt: '2024-05-08 11:00',
    activatedBy: 'sunwei', activatedAt: '2024-05-08 11:02',
    disabledBy: 'sunwei', disabledAt: '2024-09-06 10:22', disabledReason: '由 v2 取代，仅对历史工单有效',
    applicableFrom: '2024-05-08',
    validationPassed: true,
    fieldMappings: [
      fm('MR-CN-01', '桥架材料', '桥架综合施工', 'merge', '同一工单内合并计算', '配置草稿 v1 第 1–2 行', 'high', 'accepted', '陈静', '2024-05-06 13:00'),
      fm('MR-CN-02', '桥架安装', '桥架综合施工', 'merge', '同一工单内合并计算', '配置草稿 v1 第 1–2 行', 'high', 'accepted', '陈静', '2024-05-06 13:00'),
      fm('MR-CN-03', '线缆穿管', '电缆穿管', 'unit_price', '按米数与单价换算', '合同附件 · 电缆穿管 45 元/米', 'high', 'accepted', '陈静', '2024-05-06 13:05')
    ],
    calculationRules: [ { ruleId: 'CALC-CN-01', desc: '桥架材料 + 桥架安装 → 桥架综合施工（金额相加）' },
                        { ruleId: 'CALC-CN-02', desc: '电缆穿管 = 线缆米数 × 45 元/米' } ],
    validationRules: [ { ruleId: 'REQ-001', type: '必填' }, { ruleId: 'FMT-003', type: '格式' },
                       { ruleId: 'RNG-002', type: '范围' }, { ruleId: 'DUP-001', type: '重复' } ] },

  /* ── 城南安装 v2：当前生效；新增「穿墙孔 → 其他增项」映射 ── */
  { versionId: 'cfg-cn-001@v2', configId: 'cfg-cn-001', versionNumber: 'v2',
    status: 'effective', changeReason: '新增「穿墙孔」映射，覆盖现场增项场景',
    previousVersionId: 'cfg-cn-001@v1',
    createdBy: 'chenjing', createdAt: '2024-09-04 16:00',
    localConfirmedBy: 'zhangsan', localConfirmedAt: '2024-09-05 10:10',
    jdConfirmedBy: 'liqiang', jdConfirmedAt: '2024-09-05 15:40',
    reviewedBy: 'sunwei', reviewedAt: '2024-09-06 09:50',
    activatedBy: 'sunwei', activatedAt: '2024-09-06 10:20',
    disabledBy: null, disabledAt: null, disabledReason: null,
    applicableFrom: '2024-09-06',
    validationPassed: true,
    fieldMappings: [
      fm('MR-CN-11', '桥架材料', '桥架综合施工', 'merge', '同一工单内合并计算', '沿用 v1 映射', 'high', 'accepted', '陈静', '2024-09-04 16:30'),
      fm('MR-CN-12', '桥架安装', '桥架综合施工', 'merge', '同一工单内合并计算', '沿用 v1 映射', 'high', 'accepted', '陈静', '2024-09-04 16:30'),
      fm('MR-CN-13', '线缆穿管', '电缆穿管', 'unit_price', '按米数与单价换算', '合同附件 · 电缆穿管 45 元/米', 'high', 'accepted', '陈静', '2024-09-04 16:32'),
      fm('MR-CN-14', '穿墙孔', '其他增项', 'direct', '现场实际发生且经用户确认', '用户签字单（穿墙孔 80 元）', 'medium', 'accepted', '陈静', '2024-09-05 09:20')
    ],
    calculationRules: [ { ruleId: 'CALC-CN-11', desc: '桥架材料 + 桥架安装 → 桥架综合施工（金额相加）' },
                        { ruleId: 'CALC-CN-12', desc: '电缆穿管 = 线缆米数 × 45 元/米' },
                        { ruleId: 'CALC-CN-13', desc: '穿墙孔 → 其他增项（据实）' } ],
    validationRules: [ { ruleId: 'REQ-001', type: '必填' }, { ruleId: 'FMT-003', type: '格式' },
                       { ruleId: 'RNG-002', type: '范围' }, { ruleId: 'DUP-001', type: '重复' } ] },

  /* ── 城南安装 v3：草稿，缺服务商确认 → 不可生效 ── */
  { versionId: 'cfg-cn-001@v3', configId: 'cfg-cn-001', versionNumber: 'v3',
    status: 'pending_confirmation', changeReason: '拟新增「临时用电」映射，待服务商确认本地含义',
    previousVersionId: 'cfg-cn-001@v2',
    createdBy: 'chenjing', createdAt: '2024-09-12 14:00',
    localConfirmedBy: null, localConfirmedAt: null,
    jdConfirmedBy: null, jdConfirmedAt: null,
    reviewedBy: null, reviewedAt: null, activatedBy: null, activatedAt: null,
    disabledBy: null, disabledAt: null, disabledReason: null,
    applicableFrom: null, validationPassed: true,
    fieldMappings: [
      fm('MR-CN-21', '桥架材料', '桥架综合施工', 'merge', '同一工单内合并计算', '沿用 v2 映射', 'high', 'accepted', '陈静', '2024-09-12 14:10'),
      fm('MR-CN-22', '桥架安装', '桥架综合施工', 'merge', '同一工单内合并计算', '沿用 v2 映射', 'high', 'accepted', '陈静', '2024-09-12 14:10'),
      fm('MR-CN-23', '线缆穿管', '电缆穿管', 'unit_price', '按米数与单价换算', '沿用 v2 映射', 'high', 'accepted', '陈静', '2024-09-12 14:12'),
      fm('MR-CN-24', '穿墙孔', '其他增项', 'direct', '现场实际发生且经用户确认', '沿用 v2 映射', 'medium', 'accepted', '陈静', '2024-09-12 14:12'),
      fm('MR-CN-25', '临时用电', '其他增项', 'direct', '现场实际发生', '待服务商确认本地含义', 'low', 'pending', null, null)
    ],
    calculationRules: [ { ruleId: 'CALC-CN-21', desc: '临时用电 → 其他增项（据实，待确认）' } ],
    validationRules: [ { ruleId: 'REQ-001', type: '必填' } ] },

  /* ── 远程机电 v1：生效中 ── */
  { versionId: 'cfg-yc-001@v1', configId: 'cfg-yc-001', versionNumber: 'v1',
    status: 'effective', changeReason: '初始版本', previousVersionId: null,
    createdBy: 'chenjing', createdAt: '2024-06-03 10:00',
    localConfirmedBy: 'zhangsan', localConfirmedAt: '2024-06-05 11:00',
    jdConfirmedBy: 'liqiang', jdConfirmedAt: '2024-06-06 09:20',
    reviewedBy: 'sunwei', reviewedAt: '2024-06-07 10:00',
    activatedBy: 'sunwei', activatedAt: '2024-06-07 10:05',
    disabledBy: null, disabledAt: null, disabledReason: null,
    applicableFrom: '2024-06-07', validationPassed: true,
    fieldMappings: [
      fm('MR-YC-01', '桥架·材料', '桥架综合施工', 'merge', '同一工单内合并计算', '远程机电分段工程模板 v1', 'high', 'accepted', '陈静', '2024-06-04 15:00'),
      fm('MR-YC-02', '桥架·安装', '桥架综合施工', 'merge', '同一工单内合并计算', '远程机电分段工程模板 v1', 'high', 'accepted', '陈静', '2024-06-04 15:00'),
      fm('MR-YC-03', '线缆穿管', '电缆穿管', 'unit_price', '按米数与单价换算', '合同附件', 'high', 'accepted', '陈静', '2024-06-04 15:05')
    ],
    calculationRules: [ { ruleId: 'CALC-YC-01', desc: '桥架·材料 + 桥架·安装 → 桥架综合施工' } ],
    validationRules: [ { ruleId: 'REQ-001', type: '必填' }, { ruleId: 'FMT-003', type: '格式' } ] },

  /* ── 远程机电 v2：待审核；双方已确认但**程序校验未通过** → 不可生效 ── */
  { versionId: 'cfg-yc-001@v2', configId: 'cfg-yc-001', versionNumber: 'v2',
    status: 'pending_review', changeReason: '调整线缆穿管单价为 48 元/米',
    previousVersionId: 'cfg-yc-001@v1',
    createdBy: 'chenjing', createdAt: '2024-09-11 15:00',
    localConfirmedBy: 'zhangsan', localConfirmedAt: '2024-09-12 09:00',
    jdConfirmedBy: 'liqiang', jdConfirmedAt: '2024-09-12 09:10',
    reviewedBy: null, reviewedAt: null, activatedBy: null, activatedAt: null,
    disabledBy: null, disabledAt: null, disabledReason: null,
    applicableFrom: null,
    validationPassed: false,
    validationNote: '范围校验未通过：单价 48 元/米 超出合同约定区间（40–46 元/米）',
    fieldMappings: [
      fm('MR-YC-11', '桥架·材料', '桥架综合施工', 'merge', '同一工单内合并计算', '沿用 v1 映射', 'high', 'accepted', '陈静', '2024-09-11 15:10'),
      fm('MR-YC-12', '线缆穿管', '电缆穿管', 'unit_price', '按米数与单价换算', '拟调整单价（待核）', 'low', 'accepted', '陈静', '2024-09-11 15:12')
    ],
    calculationRules: [ { ruleId: 'CALC-YC-11', desc: '电缆穿管 = 线缆米数 × 48 元/米（待核）' } ],
    validationRules: [ { ruleId: 'RNG-002', type: '范围' } ] },

  /* ── 安家安装 v1：生效中 ── */
  { versionId: 'cfg-aj-001@v1', configId: 'cfg-aj-001', versionNumber: 'v1',
    status: 'effective', changeReason: '初始版本', previousVersionId: null,
    createdBy: 'chenjing', createdAt: '2024-06-10 10:00',
    localConfirmedBy: 'zhangsan', localConfirmedAt: '2024-06-11 10:00',
    jdConfirmedBy: 'liqiang', jdConfirmedAt: '2024-06-12 09:00',
    reviewedBy: 'sunwei', reviewedAt: '2024-06-13 10:00',
    activatedBy: 'sunwei', activatedAt: '2024-06-13 10:05',
    disabledBy: null, disabledAt: null, disabledReason: null,
    applicableFrom: '2024-06-13', validationPassed: true,
    fieldMappings: [
      fm('MR-AJ-01', '桥架', '桥架综合施工', 'direct', '按金额直接对应', '安家安装 Excel 模板 v1', 'high', 'accepted', '陈静', '2024-06-10 15:00'),
      fm('MR-AJ-02', '线缆穿管', '电缆穿管', 'unit_price', '按米数与单价换算', '合同附件', 'high', 'accepted', '陈静', '2024-06-10 15:05'),
      fm('MR-AJ-03', '调试费', '调试费', 'direct', '固定项', '京东标准项目表', 'high', 'accepted', '陈静', '2024-06-10 15:08')
    ],
    calculationRules: [ { ruleId: 'CALC-AJ-01', desc: '各项目按映射直接对应' } ],
    validationRules: [ { ruleId: 'REQ-001', type: '必填' }, { ruleId: 'FMT-003', type: '格式' } ] },

  /* ── 安家安装 v2：待审核；双方已确认且校验通过 → **可生效样本**（用于双人分权演示） ── */
  { versionId: 'cfg-aj-001@v2', configId: 'cfg-aj-001', versionNumber: 'v2',
    status: 'pending_review', changeReason: '新增「高空作业费 → 其他增项」映射',
    previousVersionId: 'cfg-aj-001@v1',
    createdBy: 'chenjing', createdAt: '2024-09-11 16:00',
    localConfirmedBy: 'zhangsan', localConfirmedAt: '2024-09-12 10:00',
    jdConfirmedBy: 'liqiang', jdConfirmedAt: '2024-09-12 11:40',
    reviewedBy: null, reviewedAt: null, activatedBy: null, activatedAt: null,
    disabledBy: null, disabledAt: null, disabledReason: null,
    applicableFrom: null, validationPassed: true,
    fieldMappings: [
      fm('MR-AJ-11', '桥架', '桥架综合施工', 'direct', '按金额直接对应', '沿用 v1 映射', 'high', 'accepted', '陈静', '2024-09-11 16:10'),
      fm('MR-AJ-12', '线缆穿管', '电缆穿管', 'unit_price', '按米数与单价换算', '沿用 v1 映射', 'high', 'accepted', '陈静', '2024-09-11 16:10'),
      fm('MR-AJ-13', '调试费', '调试费', 'direct', '固定项', '沿用 v1 映射', 'high', 'accepted', '陈静', '2024-09-11 16:12'),
      fm('MR-AJ-14', '高空作业费', '其他增项', 'direct', '作业面高于 4 米且经用户确认', '用户签字单 + 现场照片', 'medium', 'accepted', '陈静', '2024-09-11 16:20')
    ],
    calculationRules: [ { ruleId: 'CALC-AJ-11', desc: '高空作业费 → 其他增项（据实）' } ],
    validationRules: [ { ruleId: 'REQ-001', type: '必填' }, { ruleId: 'RNG-002', type: '范围' } ] }
];

/* 配置治理审计记录：**只追加，不覆盖** */
const CONFIG_AUDIT = [
  { auditId: 'A-0001', versionId: 'cfg-cn-001@v1', action: 'create_draft', by: 'chenjing', role: '接入配置管理员', at: '2024-05-02 10:00', reason: '初始建档', fromVersionId: null, toVersionId: null },
  { auditId: 'A-0002', versionId: 'cfg-cn-001@v1', action: 'local_confirm', by: 'zhangsan', role: '服务商资料负责人', at: '2024-05-06 14:20', reason: '确认本地字段含义', fromVersionId: null, toVersionId: null },
  { auditId: 'A-0003', versionId: 'cfg-cn-001@v1', action: 'jd_confirm', by: 'liqiang', role: '京东资料核查人员', at: '2024-05-07 09:30', reason: '确认京东接收要求', fromVersionId: null, toVersionId: null },
  { auditId: 'A-0004', versionId: 'cfg-cn-001@v1', action: 'activate', by: 'sunwei', role: '接入配置管理员', at: '2024-05-08 11:02', reason: '双方确认齐全、校验通过、非创建人审核', fromVersionId: null, toVersionId: null },
  { auditId: 'A-0005', versionId: 'cfg-cn-001@v2', action: 'new_version', by: 'chenjing', role: '接入配置管理员', at: '2024-09-04 16:00', reason: '新增穿墙孔映射', fromVersionId: 'cfg-cn-001@v1', toVersionId: 'cfg-cn-001@v2' },
  { auditId: 'A-0006', versionId: 'cfg-cn-001@v2', action: 'local_confirm', by: 'zhangsan', role: '服务商资料负责人', at: '2024-09-05 10:10', reason: '确认「穿墙孔」本地含义', fromVersionId: null, toVersionId: null },
  { auditId: 'A-0007', versionId: 'cfg-cn-001@v2', action: 'jd_confirm', by: 'liqiang', role: '京东资料核查人员', at: '2024-09-05 15:40', reason: '确认接收口径', fromVersionId: null, toVersionId: null },
  { auditId: 'A-0008', versionId: 'cfg-cn-001@v2', action: 'activate', by: 'sunwei', role: '接入配置管理员', at: '2024-09-06 10:20', reason: '双方确认齐全、校验通过、非创建人审核', fromVersionId: null, toVersionId: null },
  { auditId: 'A-0009', versionId: 'cfg-cn-001@v1', action: 'disable', by: 'sunwei', role: '接入配置管理员', at: '2024-09-06 10:22', reason: '由 v2 取代，仅对历史工单有效', fromVersionId: 'cfg-cn-001@v1', toVersionId: 'cfg-cn-001@v2' },
  { auditId: 'A-0010', versionId: 'cfg-aj-001@v2', action: 'new_version', by: 'chenjing', role: '接入配置管理员', at: '2024-09-11 16:00', reason: '新增高空作业费映射', fromVersionId: 'cfg-aj-001@v1', toVersionId: 'cfg-aj-001@v2' },
  { auditId: 'A-0011', versionId: 'cfg-aj-001@v2', action: 'local_confirm', by: 'zhangsan', role: '服务商资料负责人', at: '2024-09-12 10:00', reason: '确认高空作业费属本地实收项', fromVersionId: null, toVersionId: null },
  { auditId: 'A-0012', versionId: 'cfg-aj-001@v2', action: 'jd_confirm', by: 'liqiang', role: '京东资料核查人员', at: '2024-09-12 11:40', reason: '确认接收要求', fromVersionId: null, toVersionId: null },
  { auditId: 'A-0013', versionId: 'cfg-yc-001@v2', action: 'local_confirm', by: 'zhangsan', role: '服务商资料负责人', at: '2024-09-12 09:00', reason: '确认单价调整本地含义', fromVersionId: null, toVersionId: null },
  { auditId: 'A-0014', versionId: 'cfg-yc-001@v2', action: 'jd_confirm', by: 'liqiang', role: '京东资料核查人员', at: '2024-09-12 09:10', reason: '确认接收要求', fromVersionId: null, toVersionId: null }
];

/* 账号表。**M6 新增第二个接入配置管理员账号**（同一角色、不同人），
   用于验证「同角色不同人分权」——创建人不得自审。 */
const ACCOUNTS = {
  chenjing: { name: '陈静', role: 'cfgadmin', isCreator: true,  perms: ['CONFIG_DRAFT', 'CONFIG_ACTIVATE'] },
  sunwei:   { name: '孙薇', role: 'cfgadmin', isCreator: false, perms: ['CONFIG_DRAFT', 'CONFIG_ACTIVATE'] },
  wanglei:  { name: '王磊', role: 'sysadmin', perms: ['USER_ADMIN'] },
  liqiang:  { name: '李强', role: 'verifier', perms: ['REVIEW'] },
  zhouming: { name: '周明', role: 'reconciler', perms: ['RECON'] },
  zhangsan: { name: '张三', role: 'pvdocs', perms: ['SUBMIT'] },
  liumin:   { name: '刘敏', role: 'pvbiz', perms: ['CONFIRM_RECEIVABLE'] }
};

/* 角色 → 代表账号 */
const ROLE_ACCOUNT = {
  verifier: 'liqiang', reconciler: 'zhouming', cfgadmin: 'chenjing',
  sysadmin: 'wanglei', pvdocs: 'zhangsan', pvbiz: 'liumin'
};

/* 接入配置管理员角色下的两个账号（W5 内可切换，验证同角色不同人） */
const CFGADMIN_ACCOUNTS = ['chenjing', 'sunwei'];

/* ── 配置查询与治理动作 ── */

/* 账号 key → 姓名（数据层统一存 key，展示时解析） */
function accName(key) { return (ACCOUNTS[key] && ACCOUNTS[key].name) || key || '—'; }

function configById(id) { return CONFIGS.find(c => c.configId === id) || null; }
function versionById(id) { return CONFIG_VERSIONS.find(v => v.versionId === id) || null; }
function versionsOf(configId) {
  return CONFIG_VERSIONS.filter(v => v.configId === configId)
    .sort((a, b) => a.versionNumber < b.versionNumber ? -1 : 1);
}
function currentConfigAdmin() { return ACCOUNTS[W5_ACCOUNT] ? W5_ACCOUNT : 'chenjing'; }

/* 审核生效**八项前置条件**，逐条由程序判定 */
function activationChecks(versionId, accountKey) {
  const v = versionById(versionId);
  if (!v) return { ok: false, checks: [{ label: '版本存在', ok: false, note: '版本不存在' }] };
  const acc = ACCOUNTS[accountKey];
  const checks = [
    { key: 'local', label: '本地含义已由服务商资料负责人确认',
      ok: !!v.localConfirmedBy,
      note: v.localConfirmedBy ? `${v.localConfirmedBy} · ${v.localConfirmedAt}` : '缺少服务商确认' },
    { key: 'jd', label: '京东接收要求已由京东资料核查人员确认',
      ok: !!v.jdConfirmedBy,
      note: v.jdConfirmedBy ? `${v.jdConfirmedBy} · ${v.jdConfirmedAt}` : '缺少京东确认' },
    { key: 'convert', label: '确定性模拟转换通过',
      ok: v.validationPassed !== false,
      note: v.validationPassed === false ? '模拟转换或校验未通过' : '转换结果可重复、无异常' },
    { key: 'validate', label: '四类程序校验通过（必填/格式/范围/重复）',
      ok: v.validationPassed !== false,
      note: v.validationPassed === false ? (v.validationNote || '存在未通过的校验项') : '四类校验全部通过' },
    { key: 'perm', label: '当前操作者具有 CONFIG_ACTIVATE',
      ok: !!(acc && acc.perms.includes('CONFIG_ACTIVATE')),
      note: acc && acc.perms.includes('CONFIG_ACTIVATE') ? `${acc.name} 具备该权限` : '当前账号不具备 CONFIG_ACTIVATE' },
    { key: 'notcreator', label: '当前操作者不是该配置版本创建人',
      ok: !!(acc && accountKey !== v.createdBy),
      note: (acc && accountKey === v.createdBy)
        ? '创建人不得审核本人创建的版本'
        : `创建人为 ${accName(v.createdBy)}，当前为 ${acc ? acc.name : '—'}` },
    { key: 'status', label: '当前版本尚未生效或停用',
      ok: v.status !== 'effective' && v.status !== 'disabled',
      note: v.status === 'effective' ? '该版本已生效' : v.status === 'disabled' ? '该版本已停用' : '版本处于待审核状态' },
    { key: 'idempotent', label: '幂等键未重复',
      ok: !CONFIG_AUDIT.some(a => a.versionId === versionId && a.action === 'activate'),
      note: CONFIG_AUDIT.some(a => a.versionId === versionId && a.action === 'activate') ? '该版本已有生效记录' : '未发现重复生效记录' }
  ];
  return { ok: checks.every(c => c.ok), checks };
}

/* ── 工单 → 配置快照 ──
   工单绑定**不可变**的配置版本快照；新版本生效不改变历史工单的既有映射。 */
function snapshotOf(versionId) {
  const v = versionById(versionId);
  if (!v) return null;
  return {
    configVersionId: v.versionId, configId: v.configId, versionNumber: v.versionNumber,
    frozen: true, activatedAt: v.activatedAt,
    fieldMappings: v.fieldMappings.map(m => Object.assign({}, m))
  };
}

let W5_ACCOUNT = 'chenjing';

/* ============================================================
   八、五层记录与版本（R-11：后一层不得覆盖前一层）
   ------------------------------------------------------------
   原始资料 → 程序转换结果 → AI草稿 → 人工确认稿 → 正式提交版本
   ============================================================ */
const RECORD_LAYERS = [
  { key: 'raw',       label: '原始资料',     container: 'plain' },
  { key: 'converted', label: '程序转换结果', container: 'plain' },
  { key: 'aiDraft',   label: 'AI 草稿',      container: 'draft' },
  { key: 'confirmed', label: '人工确认稿',   container: 'confirmed' },
  { key: 'official',  label: '正式提交版本', container: 'official' }
];

const VERSIONS = {
  'JD202409130001': {
    raw:       [{ v: 'v1', at: '2024-09-12 18:20', by: '张三' }],
    converted: [{ v: 'v1', at: '2024-09-12 18:21', by: '系统（普通程序）' }],
    aiDraft:   [{ v: 'v1', at: '2024-09-13 09:15', by: '系统（结构化 Prompt）' }],
    confirmed: [{ v: 'v1', at: '2024-09-13 10:02', by: '张三' }],
    official:  []
  }
};

/* ============================================================
   八之二、正式记录（R-A1 / R-A2 / R-A3）
   ------------------------------------------------------------
   只有「已由有权业务岗位或原业务系统正式形成」且具备
   回执号/版本号、操作人、形成时间的结果才会出现在此。
   AI 草稿、人工确认稿、程序转换结果**一律不得进入**。

   ⚠ M2 只建立结构与空态，写入逻辑在 M3/M8 实现，故此处全为 null。
   ============================================================ */

/* 四项正式记录准入信息（v2.1 §12.1②）
   —— 与 C6 四项提交前置条件不是同一组，不得混用 */
const ADMISSION_FIELDS = [
  { key: 'formed', label: '已由有权业务岗位或原业务系统正式形成' },
  { key: 'ref',    label: '缺少回执号或版本号' },
  { key: 'by',     label: '缺少操作人' },
  { key: 'at',     label: '缺少形成时间' }
];

/* 准入判定。返回 { ok, missing: [] }。被拒绝的记录不进入右栏，
   拒绝原因写入准入日志（仅供测试与排障，不渲染到界面）。 */
let ADMISSION_LOG = [];
if (typeof window !== 'undefined') window.__admissionLog = ADMISSION_LOG;

function admissionCheck(rec, orderId, block) {
  const missing = [];
  if (!rec || rec.formed !== true) missing.push('已由有权业务岗位或原业务系统正式形成');
  if (!rec || !rec.ref) missing.push('缺少回执号或版本号');
  if (!rec || !rec.by) missing.push('缺少操作人');
  if (!rec || !rec.at) missing.push('缺少形成时间');
  if (missing.length) {
    ADMISSION_LOG.push({ orderId, block, ref: rec && rec.ref, missing });
  }
  return { ok: missing.length === 0, missing };
}

/* 取某工单某区块**通过准入**的正式版本（数组，末尾为最新） */
function admittedVersions(orderId, block) {
  const order = WORK_ORDERS.find(o => o.id === orderId);
  const list = (order && order.formal && order.formal[block]) || [];
  return list.filter(r => admissionCheck(r, orderId, block).ok);
}

/* 右栏三区块与阶段、来源的对应（用于空态指路与摘要条） */
const RA_META = {
  ra1: { stage: 'handover', label: '资料正式提交', shortLabel: '资料' },
  ra2: { stage: 'review',   label: '正式核查结论', shortLabel: '核查' },
  ra3: { stage: 'recon',    label: '对账确认结果', shortLabel: '对账' }
};

/* ============================================================
   九、抽屉数据
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

/* ============================================================
   十、组织隔离与派生视图（R-15）
   ------------------------------------------------------------
   L1 / L2 / L3 / L4 / W6 一律从 visible* 取数，不直接读 WORK_ORDERS。
   无权数据**不得进入 DOM、搜索结果、计数和筛选选项**。

   ⚠ 静态原型模拟。生产环境必须由服务端鉴权。
   ============================================================ */
function _scopeProvider(rows, roleKey) {
  const role = ROLES[roleKey];
  if (!role) return [];
  if (role.side === 'jd') return rows;                        // 京东内部：本组织范围内全部
  return rows.filter(r => r.providerOrg === role.providerScope); // 服务商侧：仅本服务商
}

function visibleWorkOrders(roleKey) {
  return _scopeProvider(WORK_ORDERS, roleKey);
}

/* 筛选下拉选项按可见数据生成，不得列出无权服务商 */
function visibleProviders(roleKey) {
  return [...new Set(visibleWorkOrders(roleKey).map(o => o.provider))].sort();
}

/* ============================================================
   十一、权限判定（R-15）
   ============================================================ */
function canSeeRightCol(roleKey, block) {
  const r = ROLES[roleKey];
  if (!r) return 'none';
  return r.rightCol[block] || 'none';
}

function canRunFormalOp(roleKey, stage) {
  const r = ROLES[roleKey];
  return !!r && r.formalOps.includes(stage);
}

function canConfigActivate(accountKey) {
  const a = ACCOUNTS[accountKey];
  return !!a && a.perms.includes('CONFIG_ACTIVATE');
}

/* 同角色双人分权：创建人不得自审 */
function canReviewConfig(accountKey, configId) {
  const cfg = CONFIG.find(c => c.id === configId);
  if (!cfg) return { ok: false, reason: '配置不存在' };
  if (cfg.createdBy === accountKey) {
    return { ok: false, reason: '创建人不得审核自己创建或修改的版本' };
  }
  if (!canConfigActivate(accountKey)) {
    return { ok: false, reason: '需具备配置审核权限（CONFIG_ACTIVATE）' };
  }
  if (!cfg.signedProvider || !cfg.signedJd) {
    return { ok: false, reason: '需服务商与京东双方确认后才能审核生效' };
  }
  return { ok: true, reason: '可执行审核生效' };
}


/* ============================================================
   六、确定性程序输出（R-07 / R-08 / R-09）
   ------------------------------------------------------------
   以下三项**全部由普通程序计算**，AI 草稿不参与任何金额或状态计算：
     · comparisonResult     原方案 vs 现场实际 逐项比对
     · reconciliationResult 两套独立账目的项目对应与差额
   校验结果（validationResults）是**独立数据源**，不由问题列表反推。
   ============================================================ */

/* 原方案 vs 现场实际 —— 逐项比对，未取得现场实际时不推断 */
function computeComparison(order) {
  const plan = order.originalPlan;
  const act = order.actualCompletion;
  if (!plan) return { ok: false, reason: '未取得原方案', rows: [] };
  if (!act || !act.obtained) return { ok: false, reason: '未取得现场实际', rows: [] };

  const rows = plan.items.map(p => {
    const a = act.items.find(x => x.name === p.name);
    // 方案值始终取自原方案；现场未记录只影响「实际」列与比对结果
    const pv = String(p.agreed);
    const planText = `${pv}${p.unit && p.unit !== '—' ? ' ' + p.unit : ''}`;
    if (!a) {
      return { name: p.name, plan: planText, actual: '—', diffType: '现场未记录', diff: '尚未取得' };
    }
    const av = String(a.actual);
    const actText = `${av}${a.unit && a.unit !== '—' ? ' ' + a.unit : ''}`;
    let diffType, diff;
    if (pv === av) { diffType = '一致'; diff = '无差异'; }
    else {
      const pn = parseFloat(pv), an = parseFloat(av);
      if (!isNaN(pn) && !isNaN(an)) {
        diffType = '数量差异';
        diff = (an - pn > 0 ? '+' : '') + (an - pn) + (p.unit && p.unit !== '—' ? ' ' + p.unit : '');
      } else { diffType = '内容差异'; diff = `${pv} → ${av}`; }
    }
    return { name: p.name, plan: planText, actual: actText, diffType, diff };
  });
  const extra = act.items.filter(a => !plan.items.some(p => p.name === a.name))
    .map(a => ({ name: a.name, plan: '—', actual: `${a.actual} ${a.unit || ''}`.trim(),
                 diffType: '方案未约定', diff: '新增' }));
  return { ok: true, computedBy: '普通程序', rows: rows.concat(extra) };
}

/* 两套独立账目 → 项目对应、合并、差额与**五类差异分类**。
   只读 providerLedger / jdLedger，**不读 AI 草稿**。

   输出的是**差异对象（difference object）**，每个对象：
     · differenceId   稳定标识，用于路由 #w4/<工单号>/recon?diff=<id>
     · categoryTags   命中的差异类型（**可多个**）
     · primaryCategory 主类型（按优先级取第一个），用于排序与默认展示
     · 一个对象即使命中多个类型，在列表中也**只出现一行**

   类型判定：
     缺少依据   basis == null
     无法对应   两侧项目无法建立对应
     一对多归并 多条本地记录合并为一条京东项目，且金额不符
     数量差异   已建立对应、数量不一致
     金额差异   已建立对应、金额一致或未知、金额不符 */
const DIFF_CATEGORIES = ['缺少依据', '无法对应', '一对多归并', '数量差异', '金额差异'];

/* 内部技术值 → 中文业务名称。界面显示业务名，原值作为次级技术信息（title/小字） */
const CONVERSION_RULE_LABEL = {
  merge: '合并计算',
  unit_price: '按单价换算',
  direct: '直接对应',
  split: '拆分计算'
};
const MAP_STATUS_LABEL = {
  mapped: '已对应',
  unable_to_map: '无有效映射'
};
const CONFIDENCE_LABEL = { high: '高', medium: '中', low: '低' };
function convLabel(v) { return CONVERSION_RULE_LABEL[v] || v || '—'; }
function mapStatusLabel(v) { return MAP_STATUS_LABEL[v] || v || '—'; }

/* 取工单绑定的**不可变配置快照**。新版本生效不改变历史工单的映射。 */
function orderSnapshot(order) {
  if (!order) return null;
  if (order.configSnapshot) return order.configSnapshot;
  if (order.configSnapshotId) return snapshotOf(order.configSnapshotId);
  return null;
}

/* 在快照中查找本地字段的映射规则；找不到即 unable_to_map（不使用默认猜测） */
function mappingFor(snap, localField) {
  if (!snap) return null;
  return snap.fieldMappings.find(m => m.localField === localField
    && (!m.humanDecision || m.humanDecision === 'accepted')) || null;
}

function computeReconciliation(order) {
  const pl = order.providerLedger, jl = order.jdLedger;
  const snap = orderSnapshot(order);
  if (!pl || !jl) return { ok: false, reason: '尚未取得对应账目',
    items: [], diffs: [], categories: {}, unresolvedCount: 0, sp: 0, jd: 0, diff: 0,
    configVersionId: snap ? snap.configVersionId : null };

  const groups = {}, groupRule = {};
  pl.items.forEach(it => {
    const rule = mappingFor(snap, it.name);
    const k = rule ? rule.jdField : ('__unmatched__' + it.name);
    if (rule) groupRule[k] = rule;
    (groups[k] = groups[k] || []).push(it);
  });

  const items = [], diffs = [];
  let seq = 0;

  // 差异对象基础字段（在 groups 循环外声明，供京东侧未匹配项复用）
  const buildBase = (k, group, extra) => {
    const g = group || [];
    const spSum = g.reduce((s, x) => s + x.amount, 0);
    const noBasis = g.length > 0 && g.every(x => !x.basis);
    const isMerge = g.length > 1;
    const spName = g.length ? g.map(x => x.name).join(' + ') : null;
    const rule = groupRule[k] || null;
    return Object.assign({
      orderId: order.id, obj: spName,
      spAmount: spSum, spQty: isMerge ? null : (g[0] ? g[0].qty : null), spUnit: g[0] ? g[0].unit : null,
      spNames: g.map(x => x.name), isMerge,
      basis: noBasis ? null : (g[0] ? (g[0].basis || null) : null),
      basisStatus: noBasis ? '缺少依据材料'
        : (g[0] && g[0].basis === 'contract' ? '有合同条款'
          : (g[0] && g[0].basis === 'approved' ? '有批准材料' : '—')),
      mappingRuleId: rule ? rule.mappingRuleId : null,
      mapStatus: rule ? 'mapped' : 'unable_to_map',
      configVersionId: snap ? snap.configVersionId : null,
      qtyDiff: null, amountDiff: 0, tags: []
    }, extra);
  };

  const emit = (o) => {
    items.push(o);
    if (!o.tags.length) return;
    seq++;
    diffs.push(Object.assign({}, o, {
      differenceId: `${order.id}#D${seq}`,
      primaryCategory: DIFF_CATEGORIES.find(c => o.tags.includes(c)) || o.tags[0],
      categoryTags: o.tags
    }));
  };

  Object.keys(groups).forEach(k => {
    const g = groups[k];
    const spSum = g.reduce((s, x) => s + x.amount, 0);
    const noBasis = g.every(x => !x.basis);
    const isMerge = g.length > 1;
    const spQty = isMerge ? null : g[0].qty;
    const unit = g[0].unit;
    const rule = groupRule[k] || null;
    const jdItem = rule ? jl.items.find(x => x.name === k) : null;

    if (!rule || !jdItem) {
      const it = buildBase(k, g, {
        jd: jdItem ? jdItem.name : null, jdAmount: jdItem ? jdItem.amount : 0,
        jdQty: jdItem ? jdItem.qty : null, jdUnit: jdItem ? jdItem.unit : null,
        amountDiff: spSum - (jdItem ? jdItem.amount : 0),
        note: !rule
          ? `无有效映射规则（unable_to_map）· 配置 ${snap ? snap.versionNumber : '—'} 未定义本地字段「${g.map(x => x.name).join(' + ')}」`
          : (noBasis ? '无合同条款或批准材料支撑' : '京东账单中无独立对应项')
      });
      it.tags.push('无法对应');
      if (noBasis) it.tags.push('缺少依据');
      if (it.amountDiff !== 0) it.tags.push('金额差异');
      return emit(it);
    }

    const d = spSum - jdItem.amount;
    const qtyKnown = spQty != null && jdItem.qty != null;
    const q = qtyKnown && spQty !== jdItem.qty
      ? { sp: spQty, jd: jdItem.qty, unit: jdItem.unit || unit } : null;

    const it = buildBase(k, g, {
      jd: jdItem.name, jdAmount: jdItem.amount, jdQty: jdItem.qty, jdUnit: jdItem.unit,
      qtyDiff: q, amountDiff: d,
      note: (d === 0 && !q) ? (isMerge ? '拆分方式不同，金额一致' : '项目名称与金额均一致')
        : (noBasis ? '金额不符，且无合同条款或批准材料支撑'
          : isMerge ? '多条本地记录合并为一条京东项目，金额不符'
          : q ? `数量不一致：本地 ${spQty}${unit || ''} / 京东 ${jdItem.qty}${jdItem.unit || ''}`
              : '项目已对应、数量一致，金额不符')
    });
    if (noBasis) it.tags.push('缺少依据');
    if (isMerge && d !== 0) { it.tags.push('一对多归并'); it.tags.push('金额差异'); }
    if (q) it.tags.push('数量差异');
    if (d !== 0 && !isMerge && !q) it.tags.push('金额差异');
    return emit(it);
  });

  // 京东侧有、服务商侧无对应（依据快照映射判断，不再依赖已删除的 mapsTo）
  const mappedJdFields = new Set(Object.keys(groupRule));
  jl.items.filter(j => !mappedJdFields.has(j.name)).forEach(j => {
    const it = buildBase('__jdonly__' + j.name, [], {
      obj: null, spAmount: 0, spQty: null, spUnit: null, spNames: [],
      jd: j.name, jdAmount: j.amount, jdQty: j.qty, jdUnit: j.unit,
      amountDiff: -j.amount, note: '京东侧有、服务商侧无对应项', tags: ['无法对应']
    });
    it.mapStatus = 'unable_to_map';
    return emit(it);
  });

  const sp = pl.items.reduce((s, x) => s + x.amount, 0);
  const jd = jl.items.reduce((s, x) => s + x.amount, 0);
  const categories = {}; DIFF_CATEGORIES.forEach(c => categories[c] = 0);
  diffs.forEach(x => { categories[x.primaryCategory] = (categories[x.primaryCategory] || 0) + 1; });

  return {
    ok: true, computedBy: '普通程序',
    configVersionId: snap ? snap.configVersionId : null,
    configVersionNumber: snap ? snap.versionNumber : null,
    mappingSource: snap ? `接入配置 ${snap.versionNumber}（工单快照 · 只读）` : '未绑定配置快照',
    providerSource: pl.source, providerVersion: pl.version, providerSyncedAt: pl.syncedAt,
    jdSource: jl.source, jdVersion: jl.version, jdSyncedAt: jl.syncedAt,
    items, diffs, categories,
    categoryTagsCount: (() => { const c = {}; DIFF_CATEGORIES.forEach(x => c[x] = 0);
      diffs.forEach(d => d.categoryTags.forEach(t => c[t]++)); return c; })(),
    unableCount: items.filter(x => x.mapStatus === 'unable_to_map').length,
    sp, jd, diff: sp - jd,
    unresolvedCount: diffs.length
  };
}

/* 校验结果按四类分组（独立数据源，不由问题列表反推） */
const VALIDATION_TYPES = ['必填', '格式', '范围', '重复'];
function validationOf(order) { return order.validationResults || []; }

/* ============================================================
   十二、AI 辅助草稿（R-05 / R-06 / R-12）
   ------------------------------------------------------------
   仅四种场景，**不得新增第五种**：
     mapping_suggestion          字段映射建议（W5）
     material_organizing         资料整理草稿（L4 资料交接）
     verification_assistance     核查问题辅助（L4 核查）
     reconciliation_explanation  差异解释草稿（L4 对账）

   今日简报、任务分组、状态、金额、映射执行、校验、提交与权限判断
   **全部由确定性程序负责**，不经过 AI。

   不接真实模型：以下为**确定的演示输出**，页面明确标注为演示，
   不得伪装成真实调用。
   ============================================================ */

const AI_SCENARIOS = ['mapping_suggestion', 'material_organizing', 'verification_assistance', 'reconciliation_explanation'];

const AI_SCENARIO_LABEL = {
  mapping_suggestion: '字段映射建议',
  material_organizing: '资料整理草稿',
  verification_assistance: '核查问题辅助',
  reconciliation_explanation: '差异解释草稿'
};

let AI_DRAFT_SEQ = 0;

/* 组装一份标准 AI 草稿（结构固定，页面据此渲染） */
function makeAIDraft(scenario, ctx) {
  AI_DRAFT_SEQ++;
  return Object.assign({
    draftId: `DRAFT-${scenario.slice(0, 4).toUpperCase()}-${String(AI_DRAFT_SEQ).padStart(4, '0')}`,
    scenario, scenarioLabel: AI_SCENARIO_LABEL[scenario],
    orderId: ctx.orderId || null, configVersionId: ctx.configVersionId || null,
    inputReferences: ctx.inputReferences || [],
    evidenceReferences: ctx.evidenceReferences || [],
    outputItems: ctx.outputItems || [],
    confidence: ctx.confidence || 'low',
    evidenceGaps: ctx.evidenceGaps || [],
    generatedAt: NOW, promptVersion: 'p1.0',
    status: 'draft', demo: true
  });
}

/* ── 场景 1：mapping_suggestion（W5） ── */
function aiMappingSuggestion(version) {
  // 已被人工采纳的字段不再建议；待决（pending/low）字段仍产生建议
  const decided = new Set(version.fieldMappings.filter(m => m.humanDecision === 'accepted'
    && m.source !== 'ai_suggestion').map(m => m.localField));
  const pool = [
    { localField: '桥架安装', jdField: '桥架综合施工', rule: 'merge',
      evidence: ['配置草稿历史版本映射表第 1–2 行', '近 3 单转换结果一致'],
      gaps: [], question: '是否与「桥架材料」合并为同一京东项目？', conf: 'high' },
    { localField: '临时用电', jdField: '其他增项', rule: 'direct',
      evidence: ['本地模板字段「临时用电」'],
      gaps: ['未提供该字段的合同条款或计量口径。'],
      question: '该字段的计量单位与结算依据是什么？', conf: 'low' },
    { localField: '夜间施工补贴', jdField: null, rule: null,
      evidence: [], gaps: ['输入中没有该字段的任何历史记录或合同依据。'],
      question: '无法判断该字段是否应映射，是否需要人工补充依据？', conf: 'low' }
  ];
  const items = pool.filter(s => !decided.has(s.localField));
  return makeAIDraft('mapping_suggestion', {
    configVersionId: version.versionId,
    inputReferences: [`配置版本 ${version.versionNumber} 的本地模板字段清单`,
                      `配置 ${version.configId} 的历史映射表（${version.fieldMappings.length} 条）`],
    evidenceReferences: items.flatMap(s => s.evidence.map(e => ({ source: '接入配置', file: e, loc: '—', quote: e }))),
    outputItems: items.map(s => ({
      localField: s.localField, jdField: s.jdField, conversionRule: s.rule,
      confidence: s.conf, note: s.question, evidenceCount: s.evidence.length
    })),
    confidence: items.some(s => s.conf === 'high') ? 'high' : 'low',
    evidenceGaps: items.flatMap(s => s.gaps)
  });
}

/* ── 场景 2：material_organizing（L4 资料交接） ── */
function aiMaterialOrganizing(order) {
  const L = order.layers || {};
  const raw = (L.raw || [])[L.raw.length - 1];
  const conv = (L.converted || [])[L.converted.length - 1];
  if (!raw) return null;
  const unmatched = conv ? conv.rows.filter(r => r.rule.indexOf('无对应项') >= 0) : [];
  const gaps = unmatched.map(r => `「${r.item}」在京东标准项目中无对应项，是否属于合同范围外事项需人工判断。`);
  const disorder = raw.rows.filter(r => r.unconfirmed).map(r =>
    `本地字段「${r.f}」缺少可核验计量依据（未提供标尺照片或原始记录）。`);
  return makeAIDraft('material_organizing', {
    orderId: order.id, configVersionId: (orderSnapshot(order) || {}).configVersionId,
    inputReferences: [raw.srcName, conv ? `程序转换结果（${conv.cfg}）` : '程序转换结果（未生成）'],
    evidenceReferences: raw.rows.map(r => ({ source: raw.srcName, file: r.f, loc: '明细行', quote: `${r.f} = ${r.v} ${r.u || ''}`.trim() })),
    outputItems: [
      { title: '本单识别到的本地记录', value: `${raw.rows.length} 项，其中 ${conv ? conv.rows.length : 0} 项已映射到京东标准项目` },
      { title: '需人工判断的项目', value: unmatched.length ? unmatched.map(r => r.item).join('、') : '无' },
      { title: '整理结论', value: '已按生效配置完成字段对应，未对原始值做任何修改' }
    ],
    confidence: unmatched.length || disorder.length ? 'medium' : 'high',
    evidenceGaps: gaps.concat(disorder)
  });
}

/* ── 场景 3：verification_assistance（L4 核查） ── */
function aiVerificationAssistance(order) {
  const problems = [];
  (order.tasks || []).forEach(t => {
    if (t.evidence === 'insufficient') problems.push({ kind: t.actionType === '失败' ? '风险' : '缺失', title: t.title, why: t.why });
  });
  (order.factChanges || []).forEach(fc => {
    if (fc.approval !== 'approved') problems.push({ kind: '矛盾', title: `${fc.item} 缺少有效批准材料`, why: `变更原因：${fc.reason}` });
  });
  const vr = order.validationResults || [];
  vr.filter(v => v.status === 'fail').forEach(v =>
    problems.push({ kind: '风险', title: `程序校验未通过：${v.field}`, why: v.message }));
  const gaps = vr.filter(v => v.status === 'na').map(v => v.message);
  return makeAIDraft('verification_assistance', {
    orderId: order.id, configVersionId: (orderSnapshot(order) || {}).configVersionId,
    inputReferences: ['本工单待办事项', '变更事实', '程序校验结果（四类）'],
    evidenceReferences: problems.map(p => ({ source: '程序校验 / 工单待办', file: p.title, loc: '—', quote: p.why })),
    outputItems: problems.map(p => ({ title: p.title, kind: p.kind, note: p.why })),
    confidence: problems.length ? 'medium' : 'high',
    evidenceGaps: gaps.length ? gaps : (problems.length ? [] : ['未发现需补充的事实。'])
  });
}

/* ── 场景 4：reconciliation_explanation（L4 对账） ── */
function aiReconciliationExplanation(order) {
  const R = computeReconciliation(order);
  if (!R.ok || !R.diffs.length) return null;
  const items = R.diffs.map(d => {
    const basis = d.basisStatus === '缺少依据材料'
      ? '该项未提供合同条款或批准材料，无法判断是否应计入。'
      : `该项依据状态为「${d.basisStatus}」。`;
    const kind = d.primaryCategory === '无法对应'
      ? `在京东账单中无独立对应项（${d.mapStatus === 'unable_to_map' ? '配置快照无有效映射规则' : '有映射但京东侧无对应项'}）。`
      : `与京东账单存在 ${Math.abs(d.amountDiff).toFixed(2)} 元差额。`;
    return { title: `${d.obj || d.jd}（${d.primaryCategory}）`, kind: d.primaryCategory,
             note: `${kind}${basis}本结论不构成责任认定。` };
  });
  const gaps = R.diffs.filter(d => d.basisStatus === '缺少依据材料')
    .map(d => `${d.obj || d.jd} 缺少合同条款或批准材料。`);
  if (R.unableCount) gaps.push(`${R.unableCount} 项差异因配置快照无有效映射规则（unable_to_map），需先修订接入配置。`);
  return makeAIDraft('reconciliation_explanation', {
    orderId: order.id, configVersionId: R.configVersionId,
    inputReferences: [`服务商账目（${R.providerSource} ${R.providerVersion}）`,
                      `京东账单（${R.jdSource} ${R.jdVersion}）`,
                      `确定性差异计算结果（${R.diffs.length} 个差异对象）`],
    evidenceReferences: R.diffs.map(d => ({ source: '双账差异计算', file: d.differenceId || '—', loc: '对账结果',
      quote: `${d.obj || d.jd}｜sp ${d.spAmount}｜jd ${d.jdAmount}｜差额 ${d.amountDiff}` })),
    outputItems: items,
    confidence: gaps.length ? 'low' : 'medium',
    evidenceGaps: gaps
  });
}

/* 按场景取草稿 */
function aiDraftOf(scenario, ctx) {
  if (scenario === 'mapping_suggestion') return aiMappingSuggestion(ctx);
  if (scenario === 'material_organizing') return aiMaterialOrganizing(ctx);
  if (scenario === 'verification_assistance') return aiVerificationAssistance(ctx);
  if (scenario === 'reconciliation_explanation') return aiReconciliationExplanation(ctx);
  return null;
}

/* ============================================================
   十三、C5 人工确认区 · 人工修改稿（R-11）
   ------------------------------------------------------------
   AI 原稿**永久保留**；人工修改写入独立 humanRevision，不覆盖原稿。
   人工确认稿仍是**过程材料**，不得写入右栏正式记录。
   ============================================================ */
const HUMAN_REVISIONS = [];
let REV_SEQ = 0;

const DECISION_LABEL = { accepted: '采纳', modified: '修改', rejected: '拒绝', noted: '补充说明' };

function makeRevision(draft, decision, humanContent, operator, evidenceRefs) {
  REV_SEQ++;
  const rev = {
    revisionId: `REV-${String(REV_SEQ).padStart(4, '0')}`,
    sourceDraftId: draft ? draft.draftId : null,
    scenario: draft ? draft.scenario : null,
    orderId: draft ? draft.orderId : null,
    configVersionId: draft ? draft.configVersionId : null,
    originalAIContent: draft ? JSON.parse(JSON.stringify(draft.outputItems)) : [],
    humanContent,
    decision, operator, operatedAt: NOW,
    evidenceReferences: evidenceRefs || [],
    version: HUMAN_REVISIONS.filter(r => draft && r.sourceDraftId === draft.draftId).length + 1,
    status: 'confirmed_draft'   // 过程材料，非正式记录
  };
  HUMAN_REVISIONS.push(rev);
  return rev;
}

function revisionsOf(orderId, stage) {
  const stageScenario = { handover: 'material_organizing', review: 'verification_assistance', recon: 'reconciliation_explanation', config: 'mapping_suggestion' };
  return HUMAN_REVISIONS.filter(r => r.orderId === orderId && r.scenario === stageScenario[stage]);
}

/* ============================================================
   十四、C6 当前阶段正式动作区（R-04 / R-06 / R-08 / R-13）
   ------------------------------------------------------------
   一个组件、三个阶段变体。每阶段只有一条正式结果路径：
     handover → R-A1    review → R-A2    recon → R-A3
   两种模式由程序判定：
     发起态      新后台发起，提交至模拟的京东安装管理系统
     只读同步态  正式结果已在原业务系统形成，只同步读取，不重复发起
   只有模拟原系统**返回成功**后才写入右栏。
   ============================================================ */
const FORMAL_SUBMISSIONS = [];   // 本次会话的提交记录

/* 演示用：指定哪些 (工单, 阶段) 首次提交会失败，用于覆盖异常路径 */
const SIM_FAIL_ONCE = { 'JD202409050009|recon': true };

function stageOfField(stage) {
  return { handover: 'ra1', review: 'ra2', recon: 'ra3' }[stage] || null;
}

/* 幂等键：工单号 + 阶段 + 提交版本 */
function idempotencyKey(orderId, stage, version) {
  return `${orderId}|${stage}|v${version}`;
}

function submissionsOf(orderId, stage) {
  return FORMAL_SUBMISSIONS.filter(s => s.orderId === orderId && s.stage === stage);
}

/* 下一次提交版本号 */
function nextSubmitVersion(orderId, stage) {
  const done = submissionsOf(orderId, stage).filter(s => s.status === 'succeeded');
  return done.length + 1;
}

/* C6 四项必要前置条件 */
function c6Preconditions(orderId, stage, roleKey) {
  const order = WORK_ORDERS.find(o => o.id === orderId);
  const revs = revisionsOf(orderId, stage);
  const confirmed = revs.length > 0;
  const convOk = !(order && order.layers && order.layers.converted
    && order.layers.converted.length === 0 && stage === 'handover');
  const vr = order ? (order.validationResults || []) : [];
  const valOk = !vr.some(v => v.status === 'fail');
  const permOk = canRunFormalOp(roleKey, stage);
  const ver = nextSubmitVersion(orderId, stage);
  const key = idempotencyKey(orderId, stage, ver);
  const dup = FORMAL_SUBMISSIONS.some(s => s.idempotencyKey === key && s.status !== 'failed');
  const checks = [
    { key: 'confirm', label: '存在完整的人工确认稿', ok: confirmed,
      note: confirmed ? `人工确认稿 v${revs[revs.length - 1].version}（${revs[revs.length - 1].operator}）` : '尚未人工确认任何 AI 草稿' },
    { key: 'validate', label: '确定性校验通过', ok: valOk && convOk,
      note: (!valOk) ? '存在未通过的程序校验项' : (!convOk ? '尚无程序转换结果' : '必填/格式/范围/重复 四类全部通过') },
    { key: 'perm', label: '当前角色具有该阶段正式操作权限', ok: permOk,
      note: permOk ? `${ROLES[roleKey].title} 具备「${STAGE_LABEL[stage]}」正式操作权限`
                   : `${ROLES[roleKey].title} 不具备该阶段正式操作权限` },
    { key: 'idem', label: '幂等键未重复', ok: !dup,
      note: dup ? `幂等键 ${key} 已存在提交记录，重复提交被拦截` : `幂等键 ${key} 可用` }
  ];
  return { ok: checks.every(c => c.ok), checks, version: ver, idempotencyKey: key };
}

/* C6 模式判定：原系统是否已经形成该阶段正式结果 */
function c6Mode(orderId, stage) {
  const field = stageOfField(stage);
  const formed = admittedVersions(orderId, field).length > 0;
  const doneHere = submissionsOf(orderId, stage).some(s => s.status === 'succeeded');
  if (doneHere) return 'readonly_sync';
  if (formed) return 'readonly_sync';
  return 'initiated';
}

/* 当前提交状态（供 C6 渲染与刷新恢复） */
function c6State(orderId, stage) {
  const subs = submissionsOf(orderId, stage);
  const inflight = subs.filter(s => s.status === 'submitting' || s.status === 'waiting_receipt')[0];
  const failed = subs.filter(s => s.status === 'failed').slice(-1)[0];
  if (inflight) return { phase: 'waiting_receipt', sub: inflight };
  if (failed) return { phase: 'failed', sub: failed };
  if (subs.some(s => s.status === 'succeeded')) return { phase: 'succeeded', sub: subs.filter(s => s.status === 'succeeded').slice(-1)[0] };
  return { phase: 'idle', sub: null };
}

/* 发起提交：模拟原系统调用（无真实接口） */
function c6Submit(orderId, stage) {
  const pre = c6Preconditions(orderId, stage, CURRENT_ROLE);
  if (!pre.ok) return { ok: false, reason: pre.checks.filter(c => !c.ok).map(c => c.note).join('；') };
  const willFail = SIM_FAIL_ONCE[`${orderId}|${stage}`] && !FORMAL_SUBMISSIONS.some(s => s.idempotencyKey === pre.idempotencyKey && s.status === 'failed');
  const sub = {
    submissionId: `SUB-${String(FORMAL_SUBMISSIONS.length + 1).padStart(4, '0')}`,
    orderId, stage, version: pre.version, idempotencyKey: pre.idempotencyKey,
    status: 'submitting', submittedBy: CURRENT_ROLE, submittedAt: NOW,
    mode: 'initiated', attempt: submissionsOf(orderId, stage).length + 1,
    willFail: !!willFail, ref: null, receiptAt: null, failReason: null
  };
  FORMAL_SUBMISSIONS.push(sub);
  persistSubmissions();
  // 模拟原系统往返（演示用延迟；真实实现为服务端调用）
  setTimeout(() => {
    if (sub.willFail) {
      sub.status = 'failed';
      sub.failReason = '模拟京东安装管理系统返回：校验未通过（E-4031 附件格式不符合受理要求）';
    } else {
      sub.status = 'succeeded';
      sub.ref = `JD-INS-${(orderId.match(/\d{8}/) || ['20240913'])[0]}-${String(1000 + FORMAL_SUBMISSIONS.length).slice(-4)}`;
      sub.receiptAt = NOW;
      writeFormalRecord(sub);
    }
    persistSubmissions();
    if (CURRENT_PAGE === 'w4' && CANVAS_ORDER_ID === orderId) {
      renderC6(orderId, stage); renderStagePanesRefresh(orderId, stage); renderRightCol(WORK_ORDERS.find(o => o.id === orderId));
    }
  }, 700);
  return { ok: true, sub };
}

/* 仅当模拟原系统返回成功后才写入正式记录（右栏 R-A） */
function writeFormalRecord(sub) {
  const field = stageOfField(sub.stage);
  const order = WORK_ORDERS.find(o => o.id === sub.orderId);
  if (!order || !field) return;
  if (!order.formal) order.formal = { ra1: [], ra2: [], ra3: [] };
  const STAGE_SOURCE = { handover: '京东安装管理系统', review: '京东安装管理系统', recon: '对账工作区' };
  const STAGE_ROLE = { handover: '服务商资料负责人', review: '京东资料核查人员', recon: '京东业务对账人员' };
  const SUBMITTED = {
    handover: `原始资料 v${sub.version} · 程序转换结果 v${sub.version} · AI 草稿 v${sub.version} · 人工确认稿 v${sub.version}`,
    review: `正式核查结论 v${sub.version}`,
    recon: `对账确认结果 v${sub.version}`
  };
  order.formal[field].push({
    formed: true, v: 'v' + sub.version, ref: sub.ref, at: sub.receiptAt,
    by: accName(ROLE_ACCOUNT[sub.submittedBy]),
    role: STAGE_ROLE[sub.stage], source: STAGE_SOURCE[sub.stage],
    submitted: SUBMITTED[sub.stage],
    prev: sub.version > 1 ? 'v' + (sub.version - 1) : null
  });
}

/* 刷新恢复：提交状态持久化到 sessionStorage（演示环境可恢复） */
function persistSubmissions() {
  try { sessionStorage.setItem('jd_submissions', JSON.stringify(FORMAL_SUBMISSIONS)); } catch (e) { }
}
function restoreSubmissions() {
  try {
    const raw = sessionStorage.getItem('jd_submissions');
    if (!raw) return;
    const arr = JSON.parse(raw);
    arr.forEach(s => {
      // 刷新时仍在途的提交视为“等待回执”，不写入正式记录
      if (s.status === 'submitting') { s.status = 'waiting_receipt'; s.note = '页面刷新后恢复：仍在等待原系统回执'; }
      FORMAL_SUBMISSIONS.push(s);
    });
  } catch (e) { }
}
