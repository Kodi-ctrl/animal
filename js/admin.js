/* 动物兄弟打卡工作台 · 家长端逻辑（合并版：作为 Admin 模块，由 app.js 调用）
 * 所有 DOM id 均加 a 前缀，避免与小朋友端冲突；仅作用于 #adminView 内。 */
const Admin = (() => {
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));

  let state = { balance: 0, tasks: [], rewards: [], completions: [], redemptions: [], today: '' };
  let editingTask = null, editingReward = null;

  const toast = (msg) => {
    const t = $('#aToast');
    if (!t) return;
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

  /* ===== 初始化（由 app.js 在首次进入家长端时调用一次） ===== */
  function init() {
    Store.load();
    state = Store.getAdminState();
    bindAll();
    render();
  }

  /* ===== 重绘（数据变化 / 跨端同步时调用） ===== */
  function render() {
    $('#aBalance').textContent = state.balance;
    renderTasks();
    renderRewards();
    renderHistory();
  }

  /* ===== 任务列表 ===== */
  function renderTasks() {
    const list = $('#aTaskList');
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
    const list = $('#aRewardList');
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

  let calView = (() => {
    const d = new Date();
    return { y: d.getFullYear(), m: d.getMonth(), sel: dateOf(d.toISOString()) };
  })();

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

  function renderHistory() {
    const title = $('#aCalTitle');
    const grid = $('#aCalGrid');
    if (!title || !grid) return;

    title.textContent = calView.y + '年' + pad2(calView.m + 1) + '月';

    const dateMap = buildDateMap();
    const todayStr = dateOf(new Date().toISOString());
    const firstDay = new Date(calView.y, calView.m, 1);
    const startWeekday = (firstDay.getDay() + 6) % 7;
    const daysInMonth = new Date(calView.y, calView.m + 1, 0).getDate();

    grid.innerHTML = '';
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
      if (dateStr === todayStr) cell.classList.add('today');
      if (dateStr === calView.sel && dateStr !== todayStr) cell.classList.add('sel');
      cell.addEventListener('click', () => { calView.sel = dateStr; renderHistory(); });
      grid.appendChild(cell);
    }
    renderCalDetail(dateMap);
  }

  function renderCalDetail(dateMap) {
    const box = $('#aCalDetail');
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
    $$('#aCalDetail .icon-btn.undo').forEach(b => {
      b.addEventListener('click', () => undoRecord(b.dataset.kind, b.dataset.id));
    });
  }

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
      $('#aBalance').textContent = state.balance;
      renderHistory();
      toast(kind === 'completion' ? '已撤销今日打卡' : '已撤销兑换，能量石已恢复');
    } catch (e) { toast(e.message || '撤销失败'); }
  }

  function shiftMonth(delta) {
    let { y, m } = calView;
    m += delta;
    if (m < 0) { m = 11; y--; }
    if (m > 11) { m = 0; y++; }
    calView.y = y; calView.m = m;
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

  async function undoRedemption(id) {
    try {
      const r = await Store.undoRedemption(id);
      state.balance = r.balance;
      state.redemptions = state.redemptions.filter(x => x.id !== id);
      $('#aBalance').textContent = state.balance;
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
      $('#aBalance').textContent = r.balance;
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
      $('#aBalance').textContent = state.balance;
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
    $('#aTaskModalTitle').textContent = task ? '编辑任务' : '新增任务';
    $('#aTName').value = task ? task.name : '';
    $('#aTContent').value = task ? (task.content || '') : '';
    $('#aTStones').value = task ? task.stones : 1;
    segSet('#aTCat', task ? task.category : 'learn');
    segSet('#aTStatus', task ? task.status : 'active');
    $('#aTaskModal').classList.remove('hidden');
  }
  function segSet(sel, val) {
    $$(sel + ' button').forEach(b => b.classList.toggle('on', b.dataset.v === val));
  }
  function bindAll() {
    $$('#aTCat button, #aTStatus button, #aRStatus button').forEach(b => {
      b.addEventListener('click', () => {
        const seg = b.parentElement;
        $$('button', seg).forEach(x => x.classList.remove('on'));
        b.classList.add('on');
      });
    });
    $('#aTaskCancel').addEventListener('click', () => $('#aTaskModal').classList.add('hidden'));
    $('#aTaskSave').addEventListener('click', async () => {
      const name = $('#aTName').value.trim();
      if (!name) { toast('请填写任务名称'); return; }
      const body = {
        name,
        content: $('#aTContent').value.trim(),
        stones: Math.max(0, parseInt($('#aTStones').value) || 0),
        category: $('#aTCat .on').dataset.v,
        status: $('#aTStatus .on').dataset.v
      };
      try {
        if (editingTask) {
          const t = await Store.updateTask(editingTask.id, body);
          Object.assign(editingTask, t);
        } else {
          const t = await Store.addTask(body);
          state.tasks.push(t);
        }
        $('#aTaskModal').classList.add('hidden');
        renderTasks();
        toast('已保存');
      } catch (e) { toast(e.message || '保存失败'); }
    });

    /* ===== 弹窗：奖励（含图片上传） ===== */
    $('#aRImg').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      if (file.size > 2 * 1024 * 1024) { toast('图片需小于 2MB'); return; }
      const reader = new FileReader();
      reader.onload = () => {
        rewardImgData = reader.result;
        const prev = $('#aRImgPrev');
        prev.src = rewardImgData; prev.style.display = 'block';
      };
      reader.readAsDataURL(file);
    });
    $('#aRewardCancel').addEventListener('click', () => $('#aRewardModal').classList.add('hidden'));
    $('#aRewardSave').addEventListener('click', async () => {
      const name = $('#aRName').value.trim();
      if (!name) { toast('请填写奖励名称'); return; }
      const body = {
        name,
        stones: Math.max(1, parseInt($('#aRStones').value) || 1),
        image: rewardImgData,
        status: $('#aRStatus .on').dataset.v
      };
      try {
        if (editingReward) {
          const r = await Store.updateReward(editingReward.id, body);
          Object.assign(editingReward, r);
        } else {
          const r = await Store.addReward(body);
          state.rewards.push(r);
        }
        $('#aRewardModal').classList.add('hidden');
        renderRewards();
        toast('已保存');
      } catch (e) { toast(e.message || '保存失败'); }
    });

    /* ===== 标签切换（仅限家长视图内） ===== */
    $$('#adminView .tab').forEach(tab => {
      tab.addEventListener('click', () => {
        $$('#adminView .tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        ['tasks', 'rewards', 'history'].forEach(p => {
          $('#aPanel' + p.charAt(0).toUpperCase() + p.slice(1)).classList.toggle('hidden', p !== tab.dataset.tab);
        });
      });
    });

    $('#aAddTaskBtn').addEventListener('click', () => openTaskModal(null));
    $('#aAddRewardBtn').addEventListener('click', () => openRewardModal(null));

    $('#aCalPrev').addEventListener('click', () => shiftMonth(-1));
    $('#aCalNext').addEventListener('click', () => shiftMonth(1));
    $('#aCalToday').addEventListener('click', () => jumpToToday());

    $('#aResetBtn').addEventListener('click', () => {
      if (!confirm('确定要清零重置吗？\n\n将清空：能量石余额、所有打卡 / 兑换记录、已解锁的力量卡，并把任务 / 奖励恢复为初始默认。\n\n此操作不可恢复！')) return;
      Store.resetAll();
      state = Store.getAdminState();
      $('#aBalance').textContent = state.balance;
      renderTasks();
      renderRewards();
      renderHistory();
      toast('已清零，所有记录与设置已恢复初始状态');
    });

    // 点击遮罩关闭家长端弹窗
    $$('#adminView .modal-mask').forEach(m => m.addEventListener('click', (e) => { if (e.target === m) m.classList.add('hidden'); }));
  }

  let rewardImgData = null;
  function openRewardModal(reward) {
    editingReward = reward || null;
    $('#aRewardModalTitle').textContent = reward ? '编辑奖励' : '新增奖励';
    $('#aRName').value = reward ? reward.name : '';
    $('#aRStones').value = reward ? reward.stones : 10;
    segSet('#aRStatus', reward ? reward.status : 'active');
    rewardImgData = reward && reward.image ? reward.image : null;
    const prev = $('#aRImgPrev');
    if (rewardImgData) { prev.src = rewardImgData; prev.style.display = 'block'; }
    else prev.style.display = 'none';
    $('#aRewardModal').classList.remove('hidden');
  }

  /* ===== 家长端进入时若任务 / 奖励为空，会自动从默认配置恢复（见 store.js load），
       因此这里无需导出 / 导入逻辑 ===== */

  return { init, render };
})();
