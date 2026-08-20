/* 动物兄弟打卡工作台 · 家长端逻辑（纯前端版，数据存 localStorage） */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

let state = { balance: 0, tasks: [], rewards: [], completions: [], redemptions: [], today: '' };
let editingTask = null, editingReward = null;

const toast = (msg) => {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._t);
  t._t = setTimeout(() => t.classList.remove('show'), 1600);
};

const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtTime = (iso) => {
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
};

/* ===== 数据加载 ===== */
/* 拉取最新状态并（必要时）重绘 —— 孩子打卡后家长端实时可见（跨标签页） */
function load() {
  Store.load();
  state = Store.getAdminState();
  $('#balance').textContent = state.balance;
  renderTasks();
  renderRewards();
  renderHistory();
  // Store 数据变化时统一重绘（本页操作 / 小朋友端在另一标签页打卡都会触发）
  window.addEventListener('app:state', () => {
    state = Store.getAdminState();
    $('#balance').textContent = state.balance;
    renderTasks();
    renderRewards();
    renderHistory();
  });
}

/* ===== 任务列表 ===== */
function renderTasks() {
  const list = $('#taskList');
  list.innerHTML = '';
  if (!state.tasks.length) { list.innerHTML = '<div class="empty">还没有任务，点击下方新增吧</div>'; return; }
  state.tasks.forEach(t => {
    const row = document.createElement('div');
    row.className = 'row';
    const catLabel = t.category === 'must' ? '徽章大挑战' : t.category === 'habit' ? '生活好习惯' : '学习大冒险';
    const catCls = t.category === 'must' ? 'tag-must' : t.category === 'habit' ? 'tag-habit' : 'tag-learn';
    row.innerHTML =
      '<div class="meta">' +
        '<div class="t">' + esc(t.name) + (t.status === 'inactive' ? ' <span style="font-size:10px;color:#9bb0a3;font-weight:600">[停用]</span>' : '') + '</div>' +
        '<div class="d">' + esc(t.content || '') + '</div>' +
        '<div class="s"><span class="tag ' + catCls + '" style="padding:1px 6px;border-radius:10px;font-size:10px">' + catLabel + '</span> · 💎 ' + t.stones + '</div>' +
      '</div>' +
      '<div class="actions">' +
        '<button class="icon-btn ok" title="打卡发石">✓</button>' +
        '<button class="icon-btn undo" title="撤销今日打卡"' + (t.lastCompletedDate === state.today ? '' : ' disabled') + '>↩</button>' +
        '<button class="icon-btn" title="编辑">✎</button>' +
        '<button class="icon-btn danger" title="删除">🗑</button>' +
      '</div>';
    const [btnOk, btnUndo, btnEdit, btnDel] = $$('.icon-btn', row);
    btnOk.addEventListener('click', () => completeTask(t.id));
    btnUndo.addEventListener('click', () => { if (!btnUndo.disabled) undoTask(t.id); });
    btnEdit.addEventListener('click', () => openTaskModal(t));
    btnDel.addEventListener('click', () => delTask(t.id));
    list.appendChild(row);
  });
}

/* ===== 奖励列表 ===== */
function renderRewards() {
  const list = $('#rewardList');
  list.innerHTML = '';
  if (!state.rewards.length) { list.innerHTML = '<div class="empty">还没有奖励，点击下方新增吧</div>'; return; }
  state.rewards.forEach(r => {
    const recs = (state.redemptions || []).filter(x => x.rewardId === r.id).sort((a, b) => b.time.localeCompare(a.time));
    const last = recs[0];
    const row = document.createElement('div');
    row.className = 'row';
    row.innerHTML =
      '<div class="meta">' +
        '<div class="t">' + esc(r.name) + (r.status === 'inactive' ? ' <span style="font-size:10px;color:#9bb0a3;font-weight:600">[停用]</span>' : '') + '</div>' +
        '<div class="s">💎 需要 ' + r.stones + '</div>' +
        (last ? '<div class="d" style="margin-top:4px">最近兑换：' + fmtTime(last.time) + '</div>' : '') +
      '</div>' +
      '<div class="actions">' +
        (last ? '<button class="icon-btn undo" title="撤销兑换">↩</button>' : '') +
        '<button class="icon-btn edit" title="编辑">✎</button>' +
        '<button class="icon-btn danger del" title="删除">🗑</button>' +
      '</div>';
    row.querySelector('.edit').addEventListener('click', () => openRewardModal(r));
    row.querySelector('.del').addEventListener('click', () => delReward(r.id));
    if (last) row.querySelector('.undo').addEventListener('click', () => undoRedemption(last.id));
    list.appendChild(row);
  });
}

/* ===== 历史记录（日历视图） ===== */
const dateOf = (iso) => String(iso).slice(0, 10);
const pad2 = (n) => String(n).padStart(2, '0');

/* 日历视图状态（模块级，跨重绘保留月份与选中日） */
let calView = (() => {
  const d = new Date();
  return { y: d.getFullYear(), m: d.getMonth(), sel: dateOf(d.toISOString()) };
})();

/* 把打卡/兑换按日期聚合 */
function buildDateMap() {
  const map = {};
  const push = (kind, rec) => {
    const k = dateOf(rec.time);
    (map[k] = map[k] || []).push({ kind, rec });
  };
  (state.completions || []).forEach(c => push('completion', c));
  (state.redemptions || []).forEach(r => push('redemption', r));
  return map;
}

/* 渲染整块日历面板：月导航标题 + 42 格 + 选中日详情 */
function renderHistory() {
  const title = $('#calTitle');
  const grid = $('#calGrid');
  if (!title || !grid) return;

  title.textContent = calView.y + '年' + pad2(calView.m + 1) + '月';

  const dateMap = buildDateMap();
  const today = dateOf(new Date().toISOString());
  const firstDay = new Date(calView.y, calView.m, 1);
  // Mon=0 ... Sun=6
  const startWeekday = (firstDay.getDay() + 6) % 7;
  const daysInMonth = new Date(calView.y, calView.m + 1, 0).getDate();

  grid.innerHTML = '';
  // 42 格：月外 + 月内
  for (let i = 0; i < 42; i++) {
    const cell = document.createElement('div');
    cell.className = 'cal-cell';
    const dayNum = i - startWeekday + 1;
    if (dayNum < 1 || dayNum > daysInMonth) {
      cell.classList.add('out');
      grid.appendChild(cell);
      continue;
    }
    const dateStr = calView.y + '-' + pad2(calView.m + 1) + '-' + pad2(dayNum);
    cell.textContent = String(dayNum);
    if (dateMap[dateStr] && dateMap[dateStr].length) cell.classList.add('has-rec');
    if (dateStr === today) cell.classList.add('today');
    if (dateStr === calView.sel && dateStr !== today) cell.classList.add('sel');
    cell.addEventListener('click', () => {
      calView.sel = dateStr;
      renderHistory();
    });
    grid.appendChild(cell);
  }

  renderCalDetail(dateMap);
}

/* 渲染选中日的详情列表（沿用原能量石流水行样式） */
function renderCalDetail(dateMap) {
  const box = $('#calDetail');
  if (!box) return;
  const items = (dateMap[calView.sel] || []).slice().sort((a, b) => a.rec.time.localeCompare(b.rec.time));
  const [, mStr, dStr] = calView.sel.split('-');
  let html = '<div class="cal-detail-title">📋 ' + parseInt(mStr, 10) + '月' + parseInt(dStr, 10) + '日 · 共 ' + items.length + ' 条</div>';
  if (!items.length) {
    html += '<div class="cal-detail-empty">这一天还没有记录哦</div>';
  } else {
    items.forEach(it => {
      const r = it.rec;
      const isPlus = it.kind === 'completion';
      const ico = isPlus ? '✅' : '🎁';
      const title = isPlus ? r.taskName : r.rewardName;
      const val = (isPlus ? '+' : '-') + r.stones;
      const cls = isPlus ? 'plus' : 'minus';
      const canUndo = isPlus ? (dateOf(r.time) === dateOf(new Date().toISOString())) : true;
      html +=
        '<div class="cal-record">' +
          '<div class="hico" style="background:' + (isPlus ? '#e6f8ea' : '#fff3e0') + '">' + ico + '</div>' +
          '<div class="hmain"><div class="ht">' + esc(title) + '</div><div class="hd">' + fmtTime(r.time) + '</div></div>' +
          '<div class="hv ' + cls + '">' + val + '</div>' +
          (canUndo ? '<button class="icon-btn undo" data-id="' + r.id + '" data-kind="' + it.kind + '" title="撤销">↩</button>' : '') +
        '</div>';
    });
  }
  box.innerHTML = html;
  // 绑定撤销按钮
  $$('#calDetail .icon-btn.undo').forEach(b => {
    b.addEventListener('click', () => undoRecord(b.dataset.kind, b.dataset.id));
  });
}

/* 撤销一条记录（打卡仅当日可撤，兑换任意可撤） */
async function undoRecord(kind, id) {
  try {
    if (kind === 'completion') {
      const r = await Store.undoTask(id);
      state.balance = r.balance;
      const t = state.tasks.find(x => x.id === id);
      if (t) t.lastCompletedDate = null;
      state.completions = state.completions.filter(c => c.id !== id);
    } else {
      const r = await Store.undoRedemption(id);
      state.balance = r.balance;
      state.redemptions = state.redemptions.filter(x => x.id !== id);
    }
    $('#balance').textContent = state.balance;
    renderHistory();
    toast(kind === 'completion' ? '已撤销今日打卡' : '已撤销兑换，能量石已恢复');
  } catch (e) { toast(e.message || '撤销失败'); }
}

/* 月份切换 */
function shiftMonth(delta) {
  let { y, m } = calView;
  m += delta;
  if (m < 0) { m = 11; y--; }
  if (m > 11) { m = 0; y++; }
  calView.y = y; calView.m = m;
  // 切月后选中日若不存在于新月则置空
  const days = new Date(y, m + 1, 0).getDate();
  const [, mm, dd] = calView.sel.split('-');
  if (parseInt(mm, 10) !== m + 1 || parseInt(dd, 10) > days) {
    calView.sel = y + '-' + pad2(m + 1) + '-01';
  }
  renderHistory();
}
function jumpToToday() {
  const d = new Date();
  calView.y = d.getFullYear();
  calView.m = d.getMonth();
  calView.sel = dateOf(d.toISOString());
  renderHistory();
}

/* 撤销单条历史（兑换任意可撤销；打卡仅当日可撤销） */
async function undoRedemption(id) {
  try {
    const r = await Store.undoRedemption(id);
    state.balance = r.balance;
    state.redemptions = state.redemptions.filter(x => x.id !== id);
    $('#balance').textContent = state.balance;
    renderRewards();
    toast('已撤销兑换，能量石已恢复');
  } catch (e) { toast(e.message || '撤销失败'); }
}

/* ===== 任务操作 ===== */
async function completeTask(id) {
  try {
    const r = await Store.completeTask(id);
    if (r.done) { toast('今天已打卡'); return; }
    state.balance = r.balance;
    const t = state.tasks.find(x => x.id === id);
    if (t) t.lastCompletedDate = state.today;
    $('#balance').textContent = r.balance;
    toast('已发放 ' + r.task.stones + ' 颗能量石');
  } catch (err) {
    toast(err.message);
  }
}
async function undoTask(id) {
  try {
    const r = await Store.undoTask(id);
    state.balance = r.balance;
    const t = state.tasks.find(x => x.id === id);
    if (t) t.lastCompletedDate = null;
    $('#balance').textContent = state.balance;
    renderTasks();
    toast('已撤销今日打卡，小朋友可重新打卡');
  } catch (e) { toast(e.message || '撤销失败'); }
}
async function delTask(id) {
  if (!confirm('确定删除该任务？')) return;
  try {
    await Store.deleteTask(id);
    state.tasks = state.tasks.filter(t => t.id !== id);
    renderTasks();
    toast('已删除');
  } catch (e) { toast('删除失败'); }
}

/* ===== 奖励操作 ===== */
async function delReward(id) {
  if (!confirm('确定删除该奖励？')) return;
  try {
    await Store.deleteReward(id);
    state.rewards = state.rewards.filter(r => r.id !== id);
    renderRewards();
    toast('已删除');
  } catch (e) { toast('删除失败'); }
}

/* ===== 弹窗：任务 ===== */
function openTaskModal(task) {
  editingTask = task || null;
  $('#taskModalTitle').textContent = task ? '编辑任务' : '新增任务';
  $('#tName').value = task ? task.name : '';
  $('#tContent').value = task ? (task.content || '') : '';
  $('#tStones').value = task ? task.stones : 1;
  segSet('#tCat', task ? task.category : 'learn');
  segSet('#tStatus', task ? task.status : 'active');
  $('#taskModal').classList.remove('hidden');
}
function segSet(sel, val) {
  $$(sel + ' button').forEach(b => b.classList.toggle('on', b.dataset.v === val));
}
$$('#tCat button, #tStatus button, #rStatus button').forEach(b => {
  b.addEventListener('click', () => {
    const seg = b.parentElement;
    $$('button', seg).forEach(x => x.classList.remove('on'));
    b.classList.add('on');
  });
});
$('#taskCancel').addEventListener('click', () => $('#taskModal').classList.add('hidden'));
$('#taskSave').addEventListener('click', async () => {
  const name = $('#tName').value.trim();
  if (!name) { toast('请填写任务名称'); return; }
  const body = {
    name,
    content: $('#tContent').value.trim(),
    stones: Math.max(0, parseInt($('#tStones').value) || 0),
    category: $('#tCat .on').dataset.v,
    status: $('#tStatus .on').dataset.v
  };
  try {
    if (editingTask) {
      const t = await Store.updateTask(editingTask.id, body);
      Object.assign(editingTask, t);
    } else {
      const t = await Store.addTask(body);
      state.tasks.push(t);
    }
    $('#taskModal').classList.add('hidden');
    renderTasks();
    toast('已保存');
  } catch (e) { toast(e.message || '保存失败'); }
});

/* ===== 弹窗：奖励（含图片上传） ===== */
let rewardImgData = null;
function openRewardModal(reward) {
  editingReward = reward || null;
  $('#rewardModalTitle').textContent = reward ? '编辑奖励' : '新增奖励';
  $('#rName').value = reward ? reward.name : '';
  $('#rStones').value = reward ? reward.stones : 10;
  segSet('#rStatus', reward ? reward.status : 'active');
  rewardImgData = reward && reward.image ? reward.image : null;
  const prev = $('#rImgPrev');
  if (rewardImgData) { prev.src = rewardImgData; prev.style.display = 'block'; }
  else prev.style.display = 'none';
  $('#rewardModal').classList.remove('hidden');
}
$('#rImg').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  if (file.size > 2 * 1024 * 1024) { toast('图片需小于 2MB'); return; }
  const reader = new FileReader();
  reader.onload = () => {
    rewardImgData = reader.result;
    const prev = $('#rImgPrev');
    prev.src = rewardImgData; prev.style.display = 'block';
  };
  reader.readAsDataURL(file);
});
$('#rewardCancel').addEventListener('click', () => $('#rewardModal').classList.add('hidden'));
$('#rewardSave').addEventListener('click', async () => {
  const name = $('#rName').value.trim();
  if (!name) { toast('请填写奖励名称'); return; }
  const body = {
    name,
    stones: Math.max(1, parseInt($('#rStones').value) || 1),
    image: rewardImgData,
    status: $('#rStatus .on').dataset.v
  };
  try {
    if (editingReward) {
      const r = await Store.updateReward(editingReward.id, body);
      Object.assign(editingReward, r);
    } else {
      const r = await Store.addReward(body);
      state.rewards.push(r);
    }
    $('#rewardModal').classList.add('hidden');
    renderRewards();
    toast('已保存');
  } catch (e) { toast(e.message || '保存失败'); }
});

/* ===== 标签切换 ===== */
$$('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    $$('.tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    ['tasks', 'rewards', 'history'].forEach(p => {
      $('#panel-' + p).classList.toggle('hidden', p !== tab.dataset.tab);
    });
  });
});

$('#addTaskBtn').addEventListener('click', () => openTaskModal(null));
$('#addRewardBtn').addEventListener('click', () => openRewardModal(null));

/* 日历导航 */
$('#calPrev').addEventListener('click', () => shiftMonth(-1));
$('#calNext').addEventListener('click', () => shiftMonth(1));
$('#calToday').addEventListener('click', () => jumpToToday());

/* 一键清零重置 */
$('#resetBtn').addEventListener('click', () => {
  if (!confirm('确定要清零重置吗？\n\n将清空：能量石余额、所有打卡 / 兑换记录、已解锁的力量卡，并把任务 / 奖励恢复为初始默认。\n\n此操作不可恢复！')) return;
  Store.resetAll();
  state = Store.getAdminState();
  $('#balance').textContent = state.balance;
  renderTasks();
  renderRewards();
  renderHistory();
  toast('已清零，所有记录与设置已恢复初始状态');
});

// 点击遮罩关闭弹窗
$$('.modal-mask').forEach(m => m.addEventListener('click', (e) => { if (e.target === m) m.classList.add('hidden'); }));

load();
