/* 动物兄弟打卡工作台 · 小朋友端逻辑（纯前端版，数据存 localStorage） */
const $ = (s, r = document) => r.querySelector(s);
const today = () => {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
};
const TODAY = today();

let state = { balance: 0, tasks: [], rewards: [], today: TODAY };
/* 视图状态：kid（小朋友端）/ admin（家长端）；单 App 内共享同一份数据 */
let currentView = 'kid';
let adminReady = false;
/* 卡册视图状态：默认折叠只显示已收集，展开后按状态筛选 */
let cardExpanded = false;
let cardFilter = 'collected';
const toast = (msg) => {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._t);
  t._t = setTimeout(() => t.classList.remove('show'), 1500);
};

function iconSvg(path) {
  return '<svg viewBox="0 0 24 24">' + path + '</svg>';
}

function spark(x, y) {
  const s = document.createElement('div');
  s.className = 'spark';
  s.textContent = '💎';
  s.style.left = x + 'px';
  s.style.top = y + 'px';
  document.body.appendChild(s);
  setTimeout(() => s.remove(), 800);
}

function render() {
  $('#balance').textContent = state.balance;

  const learn = state.tasks.filter(t => t.category === 'learn');
  const habit = state.tasks.filter(t => t.category === 'habit');

  const card = (t) => {
    const done = t.lastCompletedDate === TODAY;
    const icoCls = t.category === 'habit' ? 'ico-habit' : t.category === 'must' ? 'ico-must' : 'ico-learn';
    const wrap = document.createElement('button');
    wrap.className = 'task-card' + (done ? ' done' : '') + (t.category === 'must' ? ' must' : '');
    wrap.innerHTML =
      '<div class="ico ' + icoCls + '">' + iconSvg(t.icon) + '</div>' +
      '<div class="name">' + esc(t.name) + '</div>' +
      '<div class="desc">' + esc(t.content || '') + '</div>' +
      '<div class="foot"><span class="stones">💎 ' + t.stones + '</span>' +
      (done ? '<span class="done-flag">已完成</span>' : '') + '</div>';
    wrap.addEventListener('click', (e) => completeTask(t.id, e));
    return wrap;
  };

  const lg = $('#learnGrid'); lg.innerHTML = '';
  learn.forEach(t => lg.appendChild(card(t)));
  const hg = $('#habitGrid'); hg.innerHTML = '';
  habit.forEach(t => hg.appendChild(card(t)));

  const must = state.tasks.filter(t => t.category === 'must');
  const mg = $('#mustGrid'); mg.innerHTML = '';
  must.forEach(t => mg.appendChild(card(t)));
  const doneMust = must.filter(t => t.lastCompletedDate === TODAY).length;
  $('#mustProgress').textContent = must.length ? (doneMust + '/' + must.length + ' 完成') : '';

  const rg = $('#rewardGrid'); rg.innerHTML = '';
  state.rewards.forEach(r => {
    const btn = document.createElement('button');
    btn.className = 'reward-card';
    const can = state.balance >= r.stones;
    btn.innerHTML =
      '<div class="pic">' + (r.image ? '<img src="' + r.image + '" alt="">' : '<span class="ph">🎁</span>') + '</div>' +
      '<div class="rname">' + esc(r.name) + '</div>' +
      '<div class="rcost">💎 ' + r.stones + '</div>' +
      '<button class="btn-redeem" ' + (can ? '' : 'disabled') + '>' + (can ? '兑换' : '能量石不足') + '</button>';
    btn.querySelector('.btn-redeem').addEventListener('click', (e) => { e.stopPropagation(); redeem(r.id); });
    rg.appendChild(btn);
  });
  renderCards();
}

/* 我的动物力量卡册（翻转卡 · 图鉴式；默认折叠只列已收集，可展开/筛选） */
function renderCards() {
  const shelf = $('#cardShelf');
  shelf.innerHTML = '';
  const all = state.powerCards || [];
  const owned = new Set((state.unlockedCards || []).map(u => u.id));
  const collected = all.filter(p => owned.has(p.id));
  const uncollected = all.filter(p => !owned.has(p.id));
  const todaySet = new Set((state.unlockedCards || [])
    .filter(u => u.unlockedDate === state.today).map(u => u.id));

  // 图鉴总进度（标题旁保留「已收集 X/138」）
  $('#cardCount').textContent = '已收集 ' + owned.size + '/' + all.length;

  // 本周进度（周一~周日 7 格）
  const dowLabels = ['一', '二', '三', '四', '五', '六', '日'];
  const [ty, tm, td] = state.today.split('-').map(Number);
  const todayDate = new Date(ty, tm - 1, td);
  const dow = todayDate.getDay(); // 0=周日
  const mondayOff = (dow === 0 ? -6 : 1 - dow);
  const monday = new Date(ty, tm - 1, td + mondayOff);
  const byDate = {};
  (state.unlockedCards || []).forEach(u => {
    if (u.unlockedDate) byDate[u.unlockedDate] = (byDate[u.unlockedDate] || 0) + 1;
  });
  let weekTotal = 0;
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i);
    const ds = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    const cnt = byDate[ds] || 0;
    weekTotal += cnt;
    days.push({ label: dowLabels[i], cnt, ds, isToday: ds === state.today });
  }
  $('#weekCount').textContent = '本周已收集 ' + weekTotal + ' 张';
  $('#weekBar').innerHTML = days.map(x =>
    '<div class="week-day' + (x.cnt ? ' filled' : '') + (x.isToday ? ' today' : '') + '">' +
      '<div class="week-seg"></div>' +
      '<div class="week-num">' + (x.cnt || '') + '</div>' +
      '<div class="week-dow">' + x.label + '</div>' +
    '</div>'
  ).join('');

  // 筛选标签：仅展开时显示，并同步高亮
  $('#cardFilter').classList.toggle('hidden', !cardExpanded);
  document.querySelectorAll('.cf-tab').forEach(b => b.classList.toggle('on', b.dataset.f === cardFilter));

  // 展开按钮文案
  $('#cardExpand').textContent = cardExpanded ? '收起图鉴 ▴' : '📖 翻开全部图鉴（' + all.length + '）▾';

  // 决定本次渲染的列表
  let list;
  if (!cardExpanded || cardFilter === 'collected') list = collected;
  else if (cardFilter === 'uncollected') list = uncollected;
  else list = all;

  if (list.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'card-empty';
    empty.textContent = (cardExpanded && cardFilter === 'uncollected')
      ? '太棒了，所有力量卡都收集到啦！'
      : '还没有收集到力量卡，快去完成「徽章大挑战」解锁吧！';
    shelf.appendChild(empty);
    return;
  }

  list.forEach(p => {
    const isToday = todaySet.has(p.id);
    const isOwned = owned.has(p.id);
    const el = document.createElement('div');
    el.className = 'flip-card' + (isToday ? ' today' : '') + (isOwned ? ' owned' : ' locked');
    if (p.color) el.style.setProperty('--pc', p.color);
    const front = p.image
      ? '<img class="fc-img" loading="lazy" src="' + p.image + '" alt="' + esc(p.animal) + '">'
      : '<div class="fc-emoji">' + (p.emoji || '🐾') + '</div>';
    const seasonEp = (p.season != null && p.episode != null)
      ? ('第' + p.season + '季·第' + p.episode + '集') : '';
    el.innerHTML =
      '<div class="flip-inner">' +
        '<div class="flip-front">' +
          front +
          '<div class="fc-name">' + esc(p.animal) + '</div>' +
          '<div class="fc-power">' + esc(p.power || '') + '</div>' +
          (isToday ? '<div class="fc-ribbon">✨今日</div>'
                   : (isOwned ? '<div class="fc-dot">✓</div>' : '<div class="fc-lock">🔒</div>')) +
        '</div>' +
        '<div class="flip-back">' +
          '<div class="fc-ep">' + seasonEp + '</div>' +
          '<div class="fc-en">' + esc(p.enTitle || '') + '</div>' +
          '<div class="fc-hint">再点一下缩小</div>' +
        '</div>' +
      '</div>';
    // 仅已收集的卡可点击：①放大 → ②翻转 → ③恢复原大小；未收集(locked)不可交互
    if (isOwned) {
      el.addEventListener('click', () => {
        const step = ((Number(el.dataset.step) || 0) + 1) % 3;
        el.dataset.step = String(step);
        if (step === 0) {
          el.classList.remove('zoomed', 'flipped'); // 恢复原大小（正面）
        } else if (step === 1) {
          el.classList.add('zoomed');                // 放大
        } else {
          el.classList.add('flipped');               // 放大状态下翻转
        }
      });
    }
    shelf.appendChild(el);
  });
}

/* 庆祝：每日必打卡全部完成 */
let celebratedToday = '';
function showCelebration(card, allCollected) {
  const big = $('#powerCardBig');
  big.style.setProperty('--pc', card.color);
  big.innerHTML =
    (card.image
      ? '<img class="pc-img" src="' + card.image + '" alt="' + card.animal + '">'
      : '<div class="pc-emoji">' + card.emoji + '</div>') +
    '<div class="pc-name">' + card.animal + '卡</div>' +
    '<div class="pc-power">获得力量：' + card.power + '</div>';
  $('#celebMsg').textContent = allCollected
    ? '你今天又集齐了「徽章大挑战」！已集齐全部 ' + (state.powerCards || []).length + ' 张力量卡，你是超级动物守护者！'
    : '今日「徽章大挑战」全部完成，动物兄弟把力量交给了你！';
  // 彩屑
  const box = $('#confetti');
  box.innerHTML = '';
  const colors = ['#ff8a3d', '#7c83ff', '#3db1ff', '#28c2c2', '#ffd23d', '#5fd07a'];
  for (let i = 0; i < 36; i++) {
    const c = document.createElement('i');
    c.style.left = Math.random() * 100 + '%';
    c.style.background = colors[i % colors.length];
    c.style.animationDelay = (Math.random() * 0.6) + 's';
    c.style.animationDuration = (1.6 + Math.random() * 1.2) + 's';
    box.appendChild(c);
  }
  const ov = $('#celebrate');
  ov.classList.remove('hidden');
  requestAnimationFrame(() => ov.classList.add('show'));
  celebratedToday = TODAY;
}
function maybeCelebrate() {
  const list = state.unlockedCards || [];
  const todayCard = list.find(u => u.unlockedDate === TODAY);
  if (todayCard && celebratedToday !== TODAY) {
    const card = (state.powerCards || []).find(p => p.id === todayCard.id);
    if (card) showCelebration(card, list.length >= (state.powerCards || []).length);
  }
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function completeTask(id, e) {
  try {
    const r = Store.completeTask(id);
    if (r.done) { toast('今天已经完成过啦 ✅'); return; }
    const t = state.tasks.find(x => x.id === id);
    if (t) t.lastCompletedDate = TODAY;
    if (e) spark(e.clientX - 10, e.clientY - 10);
    toast('叮！获得 ' + r.task.stones + ' 颗能量石 💎');
    if (r.celebrated && r.card) showCelebration(r.card, r.allCollected);
    render();
  } catch (err) {
    toast(err.message || '操作失败');
  }
}

async function redeem(id) {
  try {
    const r = Store.redeemReward(id);
    state.balance = r.balance;
    toast('兑换成功！去找爸爸妈妈领取奖励吧 🎉');
    render();
  } catch (err) {
    toast(err.message || '兑换失败');
  }
}

/* ===== 三栏 tab 切换（按任务分类互斥切换）===== */
let currentTab = 'must';
function switchTab(name) {
  currentTab = name;
  document.querySelectorAll('.tab').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  document.querySelectorAll('.panel-kid').forEach(p => p.classList.toggle('hidden', p.id !== 'panel-' + name));
}
document.querySelectorAll('.tab').forEach(b => b.addEventListener('click', () => switchTab(b.dataset.tab)));

/* 数据层：从 Store 读取并（必要时）重绘；Store 在数据变化时统一派发 app:state */
function load() {
  Store.load();
  state = Store.getState();
  render();
  maybeCelebrate();
  // 跨标签页 / 本页操作后的重绘统一由此接管
  window.addEventListener('app:state', () => {
    if (currentView === 'kid') {
      state = Store.getState();
      render();
      maybeCelebrate();
    } else if (adminReady) {
      Admin.render(); // 家长端在前台时，数据变化直接刷新家长视图
    }
  });
}

// 防止 iOS 双击缩放
let lastTouch = 0;
document.addEventListener('touchend', () => { lastTouch = Date.now(); }, { passive: true });

// 庆祝遮罩关闭
$('#celebClose').addEventListener('click', () => {
  const ov = $('#celebrate');
  ov.classList.remove('show');
  setTimeout(() => ov.classList.add('hidden'), 300);
});

// 卡册：展开/收起 + 状态筛选（已收集 / 未收集 / 全部）
$('#cardExpand').addEventListener('click', () => {
  cardExpanded = !cardExpanded;
  if (cardExpanded) cardFilter = 'all'; // 展开默认看全部图鉴
  renderCards();
});
document.querySelectorAll('.cf-tab').forEach(b => b.addEventListener('click', () => {
  cardExpanded = true;
  cardFilter = b.dataset.f;
  renderCards();
}));

load();

/* ===== 视图切换：小朋友端 / 家长端（合并单 App，数据天然同步） ===== */
function showAdmin() {
  $('#kidView').classList.add('hidden');
  $('#adminView').classList.remove('hidden');
  currentView = 'admin';
  if (!adminReady) { Admin.init(); adminReady = true; }
  else Admin.render();
}
function showKid() {
  $('#adminView').classList.add('hidden');
  $('#kidView').classList.remove('hidden');
  currentView = 'kid';
  state = Store.getState();
  render();
  maybeCelebrate();
}

$('#parentEntry').addEventListener('click', () => {
  $('#lockPwd').value = '';
  $('#lockModal').classList.remove('hidden');
  setTimeout(() => { const el = $('#lockPwd'); if (el) el.focus(); }, 50);
});
$('#lockCancel').addEventListener('click', () => $('#lockModal').classList.add('hidden'));
$('#lockModal').addEventListener('click', (e) => { if (e.target === $('#lockModal')) $('#lockModal').classList.add('hidden'); });
$('#lockOk').addEventListener('click', () => {
  const pwd = $('#lockPwd').value;
  const saved = localStorage.getItem('animal-checkin-pwd') || '1234';
  if (pwd === saved) { $('#lockModal').classList.add('hidden'); showAdmin(); }
  else toast('密码错误，请重试');
});
$('#lockPwd').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#lockOk').click(); });
$('#backKidBtn').addEventListener('click', showKid);
$('#aPwdSave').addEventListener('click', () => {
  const v = $('#aPwdInput').value.trim();
  if (!v) { toast('请输入新密码'); return; }
  localStorage.setItem('animal-checkin-pwd', v);
  $('#aPwdInput').value = '';
  toast('家长密码已更新');
});

/* ===== PWA：注册 Service Worker + 「发现新版本」提示 ===== */
(function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  const tip = document.createElement('div');
  tip.id = 'updateTip';
  tip.className = 'update-tip hidden';
  tip.innerHTML = '<span>发现新版本</span><button id="updateBtn" type="button">点此更新</button>';
  document.body.appendChild(tip);

  navigator.serviceWorker.register('sw.js').then(reg => {
    reg.addEventListener('updatefound', () => {
      const installing = reg.installing;
      if (!installing) return;
      installing.addEventListener('statechange', () => {
        if (installing.state === 'installed' && navigator.serviceWorker.controller) {
          tip.classList.remove('hidden');
        }
      });
    });
  }).catch(e => console.warn('[SW] 注册失败:', e));

  document.addEventListener('click', (e) => {
    if (e.target && e.target.id === 'updateBtn') {
      navigator.serviceWorker.getRegistration().then(r => {
        if (r && r.waiting) r.waiting.postMessage('SKIP_WAITING');
      });
    }
  });
  // 新 Service Worker 接管后刷新页面，加载最新资源
  navigator.serviceWorker.addEventListener('controllerchange', () => location.reload());
})();
