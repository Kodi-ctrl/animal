/* 动物兄弟打卡 · 前端数据层（纯前端，localStorage 持久化，无需后端服务器）
 * - 配置（力量卡 / 默认任务 / 默认奖励）来自 window.APP_CONFIG（config.js 内联）
 * - 运行态（能量石、打卡记录、解锁卡）存浏览器 localStorage
 * - 业务逻辑（打卡 / 撤销 / 兑换 / 解锁卡片）从原 server.js 平移到此
 * - 数据变化统一派发 window 'app:state' 事件；并监听 'storage' 实现跨标签页同步
 */
const Store = (() => {
  const KEY = 'animal-checkin-v1';

  // 预设图标（SVG 内部路径，动物兄弟 / 自然冒险风格，无 emoji）
  const ICONS = {
    book: '<rect x="5" y="4" width="14" height="16" rx="1"/><line x1="12" y1="4" x2="12" y2="20"/><line x1="8" y1="8" x2="10.5" y2="8"/><line x1="8" y1="11" x2="10.5" y2="11"/><line x1="13.5" y1="8" x2="16" y2="8"/><line x1="13.5" y1="11" x2="16" y2="11"/>',
    chat: '<path d="M5 10c0-3 3-5 7-5s7 2 7 5-3 5-7 5h-3l-4 3v-3c-1-1-1-3-1-5z"/>',
    pencil: '<path d="M4 20l3-1 10-10-2-2-10 10z"/><path d="M14 7l3-3 2 2-3 3"/>',
    abacus: '<line x1="6" y1="6" x2="18" y2="6"/><line x1="6" y1="18" x2="18" y2="18"/><circle cx="8" cy="12" r="2"/><circle cx="16" cy="12" r="2"/><line x1="10" y1="12" x2="14" y2="12"/>',
    music: '<circle cx="8" cy="17" r="2.5"/><circle cx="16" cy="15" r="2.5"/><path d="M10.5 17V7l8-2v10"/>',
    moon: '<path d="M19 13a7 7 0 11-7-7 5.5 5.5 0 007 7z"/>',
    drop: '<path d="M12 3c-3 4-6 8-6 11a6 6 0 0012 0c0-3-3-7-6-11z"/>',
    bag: '<rect x="5" y="8" width="14" height="13" rx="2"/><path d="M8 8V6a4 4 0 018 0v2"/><line x1="5" y1="14" x2="19" y2="14"/>',
    shirt: '<path d="M9 4l3 2 3-2 4 3-3 2v11H7V9L4 7z"/>',
    bowl: '<path d="M5 11h14v5a4 4 0 01-4 4H9a4 4 0 01-4-4z"/><path d="M9 5v4M11 5v4M13 5v4M15 5v4"/>',
    ball: '<circle cx="12" cy="12" r="7"/><path d="M5 12h14M12 5v14"/>',
    house: '<path d="M5 11l7-5 7 5v8H5z"/><rect x="10" y="14" width="4" height="5"/>',
    chair: '<circle cx="12" cy="6" r="2"/><path d="M12 8v6M12 14h-5M12 14h5M8 20l4-6M16 20l-4-6"/>',
    star: '<polygon points="12,3 14.5,9 21,9.5 16,14 17.5,21 12,17 6.5,21 8,14 3,9.5 9.5,9"/>',
    paw: '<circle cx="7" cy="9" r="2"/><circle cx="12" cy="6" r="2"/><circle cx="17" cy="9" r="2"/><path d="M12 11c-3 0-5 2-5 4s2 3 5 3 5-1 5-3-2-4-5-4z"/>',
    flag: '<path d="M7 4v16"/><path d="M7 5h9l-2 3 2 3H7"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/>',
    heart: '<path d="M12 20s-7-4.5-7-10a4 4 0 017-2 4 4 0 017 2c0 5.5-7 10-7 10z"/>',
    target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="1"/>'
  };

  function genId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }
  function todayStr() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  const POWER_CARDS = (window.APP_CONFIG && window.APP_CONFIG.POWER_CARDS) || [];

  function defaultState() {
    const cfg = window.APP_CONFIG || { DEFAULT_TASKS: [], DEFAULT_REWARDS: [] };
    return {
      balance: 0,
      tasks: (cfg.DEFAULT_TASKS || []).map(t => ({ ...t, lastCompletedDate: null })),
      rewards: (cfg.DEFAULT_REWARDS || []).map(r => ({ ...r })),
      completions: [],
      redemptions: [],
      unlockedCards: [],
      mustMilestone: { date: '', cardId: '' }
    };
  }

  let state = null;

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        state = JSON.parse(raw);
        // 自动补全：若任务 / 奖励为空（如家长端在独立书签中打开、与小朋友端存储隔离），
        // 从默认配置恢复，便于家长直接查看与编辑，无需手动同步。其余运行态（能量石、记录）保持不变。
        const cfg = window.APP_CONFIG || { DEFAULT_TASKS: [], DEFAULT_REWARDS: [] };
        if (!Array.isArray(state.tasks) || state.tasks.length === 0) {
          state.tasks = (cfg.DEFAULT_TASKS || []).map(t => ({ ...t, lastCompletedDate: null }));
        }
        if (!Array.isArray(state.rewards) || state.rewards.length === 0) {
          state.rewards = (cfg.DEFAULT_REWARDS || []).map(r => ({ ...r }));
        }
        save();
      } else { state = defaultState(); save(); }
    } catch (e) {
      console.error('[store] load error:', e);
      state = defaultState();
    }
    // 兼容：确保字段存在
    state.unlockedCards = state.unlockedCards || [];
    state.mustMilestone = state.mustMilestone || { date: '', cardId: '' };
    state.completions = state.completions || [];
    state.redemptions = state.redemptions || [];
    return state;
  }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { console.error('[store] save error:', e); }
    window.dispatchEvent(new Event('app:state'));
  }

  // 跨标签页同步：其他窗口修改 localStorage 后，重载内存并通知本页重绘
  window.addEventListener('storage', (e) => {
    if (e.key !== KEY) return;
    reloadFromStorage();
  });

  // 跨主屏 App 同步（小朋友端 / 家长端作为两个独立的 iOS WebClip 时，
  // storage 事件不会触发，但切换 App 时页面会重新可见，借此补全同步）
  function reloadFromStorage() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) state = JSON.parse(raw);
    } catch (_) {}
    window.dispatchEvent(new Event('app:state'));
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') reloadFromStorage();
  });
  window.addEventListener('pageshow', reloadFromStorage);

  /* 完成「每日必打卡」全部任务后，解锁一张力量卡（每日仅一次） */
  function tryUnlockPowerCard(today) {
    state.unlockedCards = state.unlockedCards || [];
    state.mustMilestone = state.mustMilestone || { date: '', cardId: '' };
    const mustTasks = state.tasks.filter(t => t.category === 'must' && t.status === 'active');
    if (!mustTasks.length) return null;
    if (!mustTasks.every(t => t.lastCompletedDate === today)) return null;
    if (state.mustMilestone.date === today) return null;
    const owned = new Set(state.unlockedCards.map(u => u.id));
    let card = POWER_CARDS.find(p => !owned.has(p.id));
    let allCollected = false;
    if (!card) {
      card = POWER_CARDS[state.unlockedCards.length % POWER_CARDS.length];
      allCollected = true;
    } else {
      state.unlockedCards.push({ id: card.id, unlockedDate: today });
    }
    state.mustMilestone = { date: today, cardId: card.id };
    return { card, allCollected };
  }

  function completeTask(id) {
    const today = todayStr();
    const task = state.tasks.find(t => t.id === id);
    if (!task) throw new Error('任务不存在');
    if (task.status !== 'active') throw new Error('任务已停用');
    if (task.lastCompletedDate === today) return { balance: state.balance, task, done: true };
    state.balance += task.stones;
    task.lastCompletedDate = today;
    state.completions.push({ id: genId(), taskId: task.id, taskName: task.name, stones: task.stones, time: new Date().toISOString() });
    const milestone = tryUnlockPowerCard(today);
    save();
    return {
      balance: state.balance,
      task,
      celebrated: !!milestone,
      card: milestone ? milestone.card : null,
      allCollected: milestone ? milestone.allCollected : false
    };
  }

  function undoTask(id) {
    const today = todayStr();
    const task = state.tasks.find(t => t.id === id);
    if (!task) throw new Error('任务不存在');
    if (task.lastCompletedDate !== today) throw new Error('今天还没有打卡');
    state.balance = Math.max(0, state.balance - task.stones);
    task.lastCompletedDate = null;
    state.completions = state.completions.filter(c => !(c.taskId === task.id && c.time.slice(0, 10) === today));
    if (task.category === 'must') {
      state.unlockedCards = (state.unlockedCards || []).filter(u => u.unlockedDate !== today);
      if (state.mustMilestone && state.mustMilestone.date === today) {
        state.mustMilestone = { date: '', cardId: '' };
      }
    }
    save();
    return { balance: state.balance, task };
  }

  function redeemReward(id) {
    const reward = state.rewards.find(r => r.id === id);
    if (!reward) throw new Error('奖励不存在');
    if (reward.status !== 'active') throw new Error('奖励已停用');
    if (state.balance < reward.stones) throw new Error('能量石不足');
    state.balance -= reward.stones;
    const rec = { id: genId(), rewardId: reward.id, rewardName: reward.name, stones: reward.stones, time: new Date().toISOString() };
    state.redemptions.push(rec);
    save();
    return { balance: state.balance, redemption: rec };
  }

  function undoRedemption(id) {
    const idx = state.redemptions.findIndex(r => r.id === id);
    if (idx < 0) throw new Error('兑换记录不存在');
    const rec = state.redemptions[idx];
    state.balance += rec.stones;
    state.redemptions.splice(idx, 1);
    save();
    return { balance: state.balance, redemption: rec };
  }

  /* 家长端：任务 CRUD */
  function addTask(body) {
    const defIcon = body.category === 'must' ? ICONS.flag : body.category === 'habit' ? ICONS.bag : ICONS.book;
    const t = {
      id: genId(),
      name: String(body.name || '').trim().slice(0, 30),
      content: String(body.content || '').slice(0, 200),
      stones: Math.max(0, parseInt(body.stones) || 0),
      category: body.category === 'must' ? 'must' : body.category === 'habit' ? 'habit' : 'learn',
      icon: defIcon,
      status: body.status === 'inactive' ? 'inactive' : 'active',
      lastCompletedDate: null
    };
    state.tasks.push(t);
    save();
    return t;
  }
  function updateTask(id, body) {
    const t = state.tasks.find(x => x.id === id);
    if (!t) throw new Error('任务不存在');
    if (body.name !== undefined) t.name = String(body.name).trim().slice(0, 30);
    if (body.content !== undefined) t.content = String(body.content || '').slice(0, 200);
    if (body.stones !== undefined) t.stones = Math.max(0, parseInt(body.stones) || 0);
    if (body.category !== undefined) t.category = body.category === 'must' ? 'must' : body.category === 'habit' ? 'habit' : 'learn';
    if (body.status !== undefined) t.status = body.status === 'inactive' ? 'inactive' : 'active';
    save();
    return t;
  }
  function deleteTask(id) {
    state.tasks = state.tasks.filter(t => t.id !== id);
    save();
  }

  /* 家长端：奖励 CRUD */
  function addReward(body) {
    const r = {
      id: genId(),
      name: String(body.name || '').trim().slice(0, 30),
      stones: Math.max(1, parseInt(body.stones) || 1),
      image: (typeof body.image === 'string' && body.image.startsWith('data:image/')) ? body.image : null,
      status: body.status === 'inactive' ? 'inactive' : 'active'
    };
    state.rewards.push(r);
    save();
    return r;
  }
  function updateReward(id, body) {
    const r = state.rewards.find(x => x.id === id);
    if (!r) throw new Error('奖励不存在');
    if (body.name !== undefined) r.name = String(body.name).trim().slice(0, 30);
    if (body.stones !== undefined) r.stones = Math.max(1, parseInt(body.stones) || 1);
    if (body.image !== undefined) r.image = (typeof body.image === 'string' && body.image.startsWith('data:image/')) ? body.image : null;
    if (body.status !== undefined) r.status = body.status === 'inactive' ? 'inactive' : 'active';
    save();
    return r;
  }
  function deleteReward(id) {
    state.rewards = state.rewards.filter(r => r.id !== id);
    save();
  }

  /* 家长端：一键清零重置 —— 清空所有运行态并恢复初始默认配置 */
  function resetAll() {
    state = defaultState();
    save();
  }

  /* 视图：小朋友端（仅启用项 + 力量卡全集 + 解锁记录） */
  function getState() {
    return {
      balance: state.balance,
      tasks: state.tasks.filter(t => t.status === 'active'),
      rewards: state.rewards.filter(r => r.status === 'active'),
      powerCards: POWER_CARDS,
      unlockedCards: state.unlockedCards,
      today: todayStr()
    };
  }
  /* 视图：家长端（全量 + 历史流水） */
  function getAdminState() {
    return {
      balance: state.balance,
      tasks: state.tasks,
      rewards: state.rewards,
      completions: state.completions,
      redemptions: state.redemptions,
      unlockedCards: state.unlockedCards,
      today: todayStr()
    };
  }

  return {
    ICONS, load, save, completeTask, undoTask, redeemReward, undoRedemption,
    addTask, updateTask, deleteTask, addReward, updateReward, deleteReward,
    resetAll,
    getState, getAdminState
  };
})();
