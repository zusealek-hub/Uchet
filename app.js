(() => {
  'use strict';

  const STORAGE_KEY = 'uchet.data.v1';

  const DEBUG = false;
  const dbg = (...args) => {
    if (!DEBUG) return;
    // eslint-disable-next-line no-console
    console.log('[uchet]', ...args);
  };

  const $ = (sel) => document.querySelector(sel);
  const el = (tag, attrs = {}, children = []) => {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') node.className = v;
      else if (k === 'text') node.textContent = v;
      else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
      else node.setAttribute(k, v);
    }
    for (const ch of children) node.append(ch);
    return node;
  };

  const fmtMoney = (n) => {
    const x = Number(n || 0);
    const sign = x < 0 ? '-' : '';
    const abs = Math.abs(x);
    const s = abs % 1 === 0 ? String(abs.toFixed(0)) : String(abs.toFixed(2));
    return sign + s.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  };

  const fmtDateTime = (iso) => {
    try {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return '—';
      return d.toLocaleString('ru-RU', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return '—';
    }
  };

  const uid = () => {
    if (crypto?.randomUUID) return crypto.randomUUID();
    return 'id-' + Math.random().toString(16).slice(2) + '-' + Date.now().toString(16);
  };

  const toast = (() => {
    const node = $('#toast');
    let t = 0;
    return (msg) => {
      if (!node) return;
      node.textContent = msg;
      node.hidden = false;
      clearTimeout(t);
      t = window.setTimeout(() => (node.hidden = true), 2200);
    };
  })();

  const store = {
    load() {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { version: 1, ledgers: [] };
      try {
        const data = JSON.parse(raw);
        if (!data || typeof data !== 'object') throw new Error('bad');
        if (!Array.isArray(data.ledgers)) data.ledgers = [];
        data.version = 1;
        for (const l of data.ledgers) {
          if (!l.id) l.id = uid();
          if (!l.name) l.name = 'Без названия';
          if (!Array.isArray(l.ops)) l.ops = [];
        }
        return data;
      } catch {
        return { version: 1, ledgers: [] };
      }
    },
    save(data) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    }
  };

  let state = store.load();

  const calcLedger = (ledger) => {
    const ops = Array.isArray(ledger.ops) ? ledger.ops : [];
    let income = 0;
    let expense = 0;
    for (const o of ops) {
      const amt = Number(o.amount || 0);
      if (o.type === 'expense') expense += amt;
      else income += amt;
    }
    const balance = income - expense;
    const lastTs = ops.length ? ops.reduce((a, b) => (a > b.ts ? a : b.ts), ops[0].ts) : null;
    return {
      income,
      expense,
      balance,
      count: ops.length,
      lastTs
    };
  };

  const getLedgerById = (id) => state.ledgers.find((l) => l.id === id) || null;

  const route = {
    get() {
      const h = (location.hash || '#/').slice(1);
      const parts = h.split('/').filter(Boolean);
      if (!parts.length) return { name: 'home' };
      if (parts[0] === 'ledger' && parts[1]) return { name: 'ledger', id: parts[1] };
      return { name: 'home' };
    },
    goHome() {
      location.hash = '#/';
    },
    goLedger(id) {
      location.hash = '#/ledger/' + encodeURIComponent(id);
    }
  };

  const dom = {
    brand: $('#brand'),

    viewHome: $('#viewHome'),
    viewLedger: $('#viewLedger'),

    searchInput: $('#searchInput'),
    btnCreateLedger: $('#btnCreateLedger'),
    ledgersList: $('#ledgersList'),
    emptyState: $('#emptyState'),

    btnBack: $('#btnBack'),
    ledgerTitle: $('#ledgerTitle'),
    ledgerBalance: $('#ledgerBalance'),
    btnAddOp: $('#btnAddOp'),
    btnDeleteLedger: $('#btnDeleteLedger'),
    btnRenameLedger: $('#btnRenameLedger'),

    statIncome: $('#statIncome'),
    statExpense: $('#statExpense'),
    statBalance: $('#statBalance'),

    opsList: $('#opsList'),
    opsEmpty: $('#opsEmpty'),

    dlgLedger: $('#dlgLedger'),
    dlgLedgerTitle: $('#dlgLedgerTitle'),
    formLedger: $('#formLedger'),
    ledgerName: $('#ledgerName'),

    dlgOp: $('#dlgOp'),
    formOp: $('#formOp'),
    opType: $('#opType'),
    opTypeToggle: $('#opTypeToggle'),
    opTypeIncome: $('#opTypeIncome'),
    opTypeExpense: $('#opTypeExpense'),
    opAmount: $('#opAmount'),
    opTitle: $('#opTitle'),

    btnExport: $('#btnExport'),
    importFile: $('#importFile')
  };

  const closeDialogByButton = (e) => {
    const btn = e.target.closest('[data-close]');
    if (!btn) return;
    const dlg = btn.closest('dialog');
    if (dlg?.open) dlg.close('cancel');
  };

  const dialogsInit = () => {
    dom.dlgLedger?.addEventListener('click', closeDialogByButton);
    dom.dlgOp?.addEventListener('click', closeDialogByButton);
  };

  const openLedgerDialog = (mode, currentName = '') => {
    dom.formLedger.reset();
    dom.ledgerName.value = currentName;
    dom.dlgLedgerTitle.textContent = mode === 'rename' ? 'Редактировать название' : 'Создать учет';
    dom.dlgLedger.showModal();
    window.setTimeout(() => dom.ledgerName.focus(), 0);
  };

  const setOpType = (type) => {
    const safeType = type === 'expense' ? 'expense' : 'income';
    dom.opType.value = safeType;

    if (dom.opTypeIncome) {
      const active = safeType === 'income';
      dom.opTypeIncome.classList.toggle('is-active', active);
      dom.opTypeIncome.setAttribute('aria-pressed', String(active));
    }

    if (dom.opTypeExpense) {
      const active = safeType === 'expense';
      dom.opTypeExpense.classList.toggle('is-active', active);
      dom.opTypeExpense.setAttribute('aria-pressed', String(active));
    }
  };

  const openOpDialog = () => {
    dom.formOp.reset();
    setOpType('income');
    dom.opAmount.value = '';
    dom.opTitle.value = '';
    dom.dlgOp.showModal();
    window.setTimeout(() => dom.opAmount.focus(), 0);
  };

  const renderHome = () => {
    dom.brand.textContent = 'Учеты';

    const q = (dom.searchInput.value || '').trim().toLowerCase();
    const list = [...state.ledgers].sort((a, b) => {
      const ca = calcLedger(a);
      const cb = calcLedger(b);
      const ta = ca.lastTs ? new Date(ca.lastTs).getTime() : 0;
      const tb = cb.lastTs ? new Date(cb.lastTs).getTime() : 0;
      return tb - ta;
    });

    const filtered = q
      ? list.filter((l) => (l.name || '').toLowerCase().includes(q))
      : list;

    dbg('renderHome', { total: state.ledgers.length, filtered: filtered.length, q });

    dom.ledgersList.innerHTML = '';

    for (const ledger of filtered) {
      const s = calcLedger(ledger);
      const meta = [
        `Операций: ${s.count}`,
        `Последняя: ${s.lastTs ? fmtDateTime(s.lastTs) : '—'}`
      ].join(' • ');

      const item = el('div', { class: 'item' }, [
        el('div', { class: 'item__top' }, [
          el('div', { class: 'item__left' }, [
            el('div', { class: 'item__title', text: ledger.name }),
            el('div', { class: 'item__meta', text: meta })
          ]),
          el('div', { class: 'item__balance', text: fmtMoney(s.balance) })
        ]),
        el('div', { class: 'item__actions' }, [
          el('button', {
            class: 'btn',
            type: 'button',
            'data-action': 'open',
            'data-id': ledger.id
          }, [document.createTextNode('Открыть')]),
          el('button', {
            class: 'btn btn--ghost',
            type: 'button',
            'data-action': 'delete',
            'data-id': ledger.id
          }, [document.createTextNode('Удалить')])
        ])
      ]);

      dom.ledgersList.append(item);
    }

    const isEmpty = !state.ledgers.length;
    dom.emptyState.hidden = !isEmpty;

    dom.viewHome.hidden = false;
    dom.viewLedger.hidden = true;
  };

  const renderLedger = (ledgerId) => {
    const ledger = getLedgerById(ledgerId);
    if (!ledger) {
      route.goHome();
      return;
    }

    dom.brand.textContent = 'Учет';
    dom.ledgerTitle.textContent = ledger.name;

    const s = calcLedger(ledger);
    dom.ledgerBalance.textContent = fmtMoney(s.balance);

    dom.statIncome.textContent = fmtMoney(s.income);
    dom.statExpense.textContent = fmtMoney(s.expense);
    dom.statBalance.textContent = fmtMoney(s.balance);

    const ops = [...ledger.ops].sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());
    dom.opsList.innerHTML = '';

    for (const o of ops) {
      const isExpense = o.type === 'expense';
      const amt = Number(o.amount || 0);
      const signed = isExpense ? -amt : amt;

      const node = el('div', { class: 'op' }, [
        el('div', { class: 'op__left' }, [
          el('div', { class: 'op__title', text: o.title || '—' }),
          el('div', { class: 'op__sub', text: fmtDateTime(o.ts) })
        ]),
        el('div', { class: 'op__right' }, [
          el('div', { class: `tag ${isExpense ? 'tag--expense' : 'tag--income'}`, text: isExpense ? 'Списание' : 'Пополнение' }),
          el('div', { class: 'op__amount', text: fmtMoney(signed) }),
          el('button', {
            class: 'btn btn--danger btn--sm',
            type: 'button',
            onClick: () => {
              const ok = confirm('Удалить операцию?');
              if (!ok) return;
              ledger.ops = ledger.ops.filter((x) => x.id !== o.id);
              store.save(state);
              render();
              toast('Операция удалена');
            }
          }, [document.createTextNode('Удалить')])
        ])
      ]);

      dom.opsList.append(node);
    }

    dom.opsEmpty.hidden = ops.length !== 0;

    dom.viewHome.hidden = true;
    dom.viewLedger.hidden = false;
  };

  const render = () => {
    const r = route.get();
    if (r.name === 'ledger') renderLedger(r.id);
    else renderHome();
  };

  function onLedgersListClick(event) {
    dbg('ledgersList click', event.target);
    const button = event.target.closest('button[data-action]');
    if (!button) return;

    const action = button.dataset.action;
    const id = button.dataset.id;
    console.log('clicked', action, id);
    dbg('action resolved', { action, id });

    if (!id) return;
    const ledger = getLedgerById(id);
    if (!ledger) return;

    if (action === 'open') {
      route.goLedger(id);
      return;
    }

    if (action === 'delete') {
      const ok = confirm(`Удалить учет "${ledger.name}"?`);
      if (!ok) return;
      state.ledgers = state.ledgers.filter((x) => x.id !== id);
      store.save(state);
      render();
      toast('Учет удален');
    }
  }

  const downloadJson = (filename, obj) => {
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.append(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const importJsonText = (text) => {
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error('Некорректный JSON');
    }

    if (!data || typeof data !== 'object') throw new Error('Некорректные данные');

    const ledgers = Array.isArray(data.ledgers) ? data.ledgers : [];

    const normalized = {
      version: 1,
      ledgers: ledgers.map((l) => {
        const id = typeof l.id === 'string' && l.id ? l.id : uid();
        const name = typeof l.name === 'string' && l.name.trim() ? l.name.trim() : 'Без названия';
        const ops = Array.isArray(l.ops) ? l.ops : [];
        return {
          id,
          name,
          createdAt: typeof l.createdAt === 'string' ? l.createdAt : new Date().toISOString(),
          ops: ops
            .map((o) => ({
              id: typeof o.id === 'string' && o.id ? o.id : uid(),
              ts: typeof o.ts === 'string' ? o.ts : new Date().toISOString(),
              type: o.type === 'expense' ? 'expense' : 'income',
              amount: Number(o.amount || 0),
              title: typeof o.title === 'string' ? o.title : ''
            }))
            .filter((o) => Number.isFinite(o.amount) && o.amount >= 0)
        };
      })
    };

    return normalized;
  };

  function autoExportJSON() {
    try {
      const data = localStorage.getItem(STORAGE_KEY) || '{}';

      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url;

      const now = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      const fileName = `uchet-backup-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}.json`;

      a.download = fileName;

      document.body.appendChild(a);
      a.click();
      a.remove();

      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('Auto export failed', e);
    }
  }

  const bindEvents = () => {
    window.addEventListener('hashchange', render);

    dom.searchInput.addEventListener('input', () => renderHome());

    dom.btnCreateLedger.addEventListener('click', () => openLedgerDialog('create'));

    dom.opTypeToggle?.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-type]');
      if (!btn) return;
      setOpType(btn.dataset.type);
    });

    dom.formLedger.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = (dom.ledgerName.value || '').trim();
      if (!name) return;

      const r = route.get();
      if (r.name === 'ledger') {
        const ledger = getLedgerById(r.id);
        if (!ledger) return;
        ledger.name = name;
        store.save(state);
        dom.dlgLedger.close('ok');
        render();
        toast('Название обновлено');
        return;
      }

      const ledger = {
        id: uid(),
        name,
        createdAt: new Date().toISOString(),
        ops: []
      };
      state.ledgers.unshift(ledger);
      store.save(state);
      dom.dlgLedger.close('ok');
      render();
      toast('Учет создан');
    });

    dom.btnBack.addEventListener('click', () => route.goHome());

    dom.btnAddOp.addEventListener('click', () => {
      const r = route.get();
      if (r.name !== 'ledger') return;
      if (!getLedgerById(r.id)) return;
      openOpDialog();
    });

    dom.formOp.addEventListener('submit', (e) => {
      e.preventDefault();
      const r = route.get();
      if (r.name !== 'ledger') return;
      const ledger = getLedgerById(r.id);
      if (!ledger) return;

      const type = dom.opType.value === 'expense' ? 'expense' : 'income';
      const amount = Number(dom.opAmount.value);
      const title = (dom.opTitle.value || '').trim();

      if (!Number.isFinite(amount) || amount < 0) return;
      if (!title) return;

      ledger.ops.push({
        id: uid(),
        ts: new Date().toISOString(),
        type,
        amount,
        title
      });

      store.save(state);
      dom.dlgOp.close('ok');
      render();
      toast('Операция добавлена');
      autoExportJSON();
    });

    dom.btnDeleteLedger.addEventListener('click', () => {
      const r = route.get();
      if (r.name !== 'ledger') return;
      const ledger = getLedgerById(r.id);
      if (!ledger) return;

      const ok = confirm(`Удалить учет "${ledger.name}"? Все операции будут удалены.`);
      if (!ok) return;

      state.ledgers = state.ledgers.filter((x) => x.id !== ledger.id);
      store.save(state);
      route.goHome();
      toast('Учет удален');
    });

    dom.btnRenameLedger.addEventListener('click', () => {
      const r = route.get();
      if (r.name !== 'ledger') return;
      const ledger = getLedgerById(r.id);
      if (!ledger) return;

      openLedgerDialog('rename', ledger.name);
    });

    dom.btnExport.addEventListener('click', () => {
      const out = {
        exportedAt: new Date().toISOString(),
        ...state
      };
      downloadJson(`uchet-export-${new Date().toISOString().slice(0,10)}.json`, out);
      toast('Экспорт готов');
    });

    dom.importFile.addEventListener('change', async () => {
      const f = dom.importFile.files?.[0];
      dom.importFile.value = '';
      if (!f) return;

      try {
        const text = await f.text();
        const imported = importJsonText(text);
        const ok = confirm('Импорт заменит текущие данные. Продолжить?');
        if (!ok) return;

        state = imported;
        store.save(state);
        route.goHome();
        render();
        toast('Импорт выполнен');
      } catch (err) {
        alert(err?.message || 'Ошибка импорта');
      }
    });
  };

  const initPwa = () => {
    if (!('serviceWorker' in navigator)) return;

    window.addEventListener('load', async () => {
      try {
        const reg = await navigator.serviceWorker.register('/service-worker.js', {
          scope: '/',
          updateViaCache: 'none'
        });
        console.log('service worker registered', reg.scope);
      } catch (err) {
        console.error('service worker register failed', err);
      }
    });
  };

  const bootstrap = () => {
    dialogsInit();

    const ledgersList = document.querySelector('#ledgersList');
    if (ledgersList) {
      ledgersList.addEventListener('click', onLedgersListClick);
      console.log('ledgers click handler attached');
    }

    bindEvents();
    initPwa();

    if (!location.hash) route.goHome();
    render();
  };

  bootstrap();
})();
