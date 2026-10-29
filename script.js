'use strict';

(function installErrorScreen() {
    var screen = document.getElementById('errScreen');
    var shown = false;
    function show(msg) {
        if (shown) return;
        shown = true;
        screen.textContent = msg;
        screen.style.display = 'block';
    }
    window.addEventListener('error', function (e) {
        var info = 'ERROR: ' + (e.message || 'unknown') + '\n';
        if (e.filename) info += 'at ' + e.filename + ':' + (e.lineno || '?') + ':' + (e.colno || '?') + '\n\n';
        if (e.error && e.error.stack) info += e.error.stack;
        show(info);
    });
    window.addEventListener('unhandledrejection', function (e) {
        show('UNHANDLED PROMISE:\n' + (e.reason && e.reason.stack ? e.reason.stack : String(e.reason)));
    });
})();

var STORAGE_KEY        = 'fin_shield_v8';
var HISTORY_LIMIT      = 5000;
var HISTORY_VIEW_LIMIT = 50;
var STATE_VERSION      = 8;

var TYPE = { INCOME: 'income', EXPENSE: 'expense', TRANSFER: 'transfer' };

var FILTERS = [
    { id: 'all',         label: 'Все'      },
    { id: TYPE.INCOME,   label: 'Доходы'   },
    { id: TYPE.EXPENSE,  label: 'Расходы'  }
];

var DEBT_FULL_PREFIX    = 'Возврат долга: ';
var DEBT_PARTIAL_PREFIX = 'Частичный возврат: ';
var DEBT_PARTIAL_MARKER = ' (остаток ';

var CATEGORIES = [
    { id: 'food',      name: 'Еда',       icon: '🍕', cssClass: 'food',      color: '#ff9f43' },
    { id: 'things',    name: 'Вещи',      icon: '👕', cssClass: 'things',    color: '#ff6b9d' },
    { id: 'housing',   name: 'Жильё',     icon: '🏠', cssClass: 'housing',   color: '#26de81' },
    { id: 'transport', name: 'Проезд',    icon: '🚌', cssClass: 'transport', color: '#45aaf2' },
    { id: 'pharmacy',  name: 'Аптека',    icon: '🏥', cssClass: 'pharmacy',  color: '#00d26a' },
    { id: 'alcohol',   name: 'Алкоголь',  icon: '🍷', cssClass: 'alcohol',   color: '#f7b731' },
    { id: 'sigi',      name: 'Сиги',      icon: '🚬', cssClass: 'sigi',      color: '#ff783c' },
    { id: 'weed',      name: 'Трава',     icon: '🌿', cssClass: 'weed',      color: '#20bf6b' },
    { id: 'gaba',      name: 'Габа',      icon: '💊', cssClass: 'gaba',      color: '#b8a55e' },
    { id: 'synth',     name: 'Синтетика', icon: '❄️', cssClass: 'synth',     color: '#5b8dff' },
    { id: 'drugs',     name: 'Наркотики', icon: '💉', cssClass: 'drugs',     color: '#c56cf0' },
    { id: 'tariffs',   name: 'Тарифы',    icon: '📱', cssClass: 'tariffs',   color: '#a55eea' },
    { id: 'other',     name: 'Прочее',    icon: '💸', cssClass: 'other',     color: '#778ca3' }
];

var CATEGORIES_INCOME = [
    { id: 'salary',       name: 'Зарплата', icon: '💰', cssClass: 'salary',       color: '#00d26a' },
    { id: 'grandma',      name: 'Бабушка',  icon: '👵', cssClass: 'grandma',      color: '#4ade80' },
    { id: 'other-income', name: 'Прочее',   icon: '💵', cssClass: 'other-income', color: '#86efac' }
];

var DEFAULT_CATEGORY_ID        = 'other';
var DEFAULT_INCOME_CATEGORY_ID = 'other-income';

var TIMEFRAMES = [
    { id: 'D1', label: 'D1', days: 30,   unit: 'day'   },
    { id: 'W1', label: 'W1', days: 84,   unit: 'week'  },
    { id: 'M1', label: 'M1', days: 365,  unit: 'month' },
    { id: 'M3', label: 'M3', days: 730,  unit: 'q'     },
    { id: 'Y1', label: 'Y1', days: 1826, unit: 'year'  }
];

var MONTHS_SHORT = ['янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек'];
var MONTHS_FULL  = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];

/* ============ УТИЛИТЫ ============ */
var ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
function esc(s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/[&<>"']/g, function (c) { return ESC_MAP[c]; });
}

function fmt(num) {
    var n = (typeof num === 'number' && isFinite(num)) ? Math.round(num) : 0;
    try { return n.toLocaleString('ru-RU') + ' ₽'; }
    catch (_) { return n + ' ₽'; }
}

function fmtShort(num) {
    var n = Math.round(num);
    var abs = Math.abs(n);
    if (abs >= 1000000) return (n / 1000000).toFixed(1) + 'М';
    if (abs >= 1000)    return (n / 1000).toFixed(1) + 'К';
    return String(n);
}

function uid() {
    try {
        if (typeof crypto !== 'undefined' && crypto && typeof crypto.randomUUID === 'function') {
            return crypto.randomUUID();
        }
    } catch (_) {}
    return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

function parseAmount(raw) {
    if (raw === null || raw === undefined) return null;
    var s = String(raw).replace(/\s/g, '').replace(',', '.').trim();
    if (!s) return null;
    var n = Number(s);
    return (isFinite(n) && n > 0) ? n : null;
}

/* ============ ДАТЫ ============ */
function dateToParts(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) d = new Date();
    return { day: d.getDate(), month: d.getMonth() + 1, year: d.getFullYear() };
}

function partsToIso(day, month, year, sourceIso) {
    var src = sourceIso ? new Date(sourceIso) : new Date();
    if (isNaN(src.getTime())) src = new Date();
    var hh = src.getHours(), mi = src.getMinutes(), ss = src.getSeconds();
    var d = new Date(parseInt(year, 10), parseInt(month, 10) - 1, parseInt(day, 10), hh, mi, ss);
    return d.toISOString();
}

function getYearRange() {
    var now = new Date().getFullYear();
    var arr = [];
    for (var y = now - 5; y <= now + 1; y++) arr.push(y);
    return arr;
}

function daysInMonth(month, year) {
    return new Date(parseInt(year, 10), parseInt(month, 10), 0).getDate();
}

function formatDateTime(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    try { return d.toLocaleDateString('ru-RU') + ' ' + d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }); }
    catch (_) { return d.toString(); }
}

function formatDate(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    try { return d.toLocaleDateString('ru-RU'); }
    catch (_) { return d.toDateString(); }
}

function formatTimeFromIso(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) d = new Date();
    var hh = d.getHours(), mm = d.getMinutes();
    return (hh < 10 ? '0' + hh : hh) + ':' + (mm < 10 ? '0' + mm : mm);
}

function parseTimeStr(str) {
    if (!str) return null;
    var s = String(str).trim();
    var m = s.match(/^(\d{1,2})[:.\s]?(\d{0,2})$/);
    if (!m) return null;
    var hh = parseInt(m[1], 10), mm = m[2] ? parseInt(m[2], 10) : 0;
    if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
    return { hh: hh, mm: mm };
}

function applyTimeToIso(iso, timeStr) {
    var tp = parseTimeStr(timeStr);
    if (!tp) return iso;
    var d = new Date(iso);
    if (isNaN(d.getTime())) d = new Date();
    d.setHours(tp.hh, tp.mm, 0, 0);
    return d.toISOString();
}

/* ============ КАТЕГОРИИ / БЮДЖЕТЫ ============ */
function getCategory(catId) {
    for (var i = 0; i < CATEGORIES.length; i++) if (CATEGORIES[i].id === catId) return CATEGORIES[i];
    return null;
}
function getIncomeCategory(catId) {
    for (var i = 0; i < CATEGORIES_INCOME.length; i++) if (CATEGORIES_INCOME[i].id === catId) return CATEGORIES_INCOME[i];
    return null;
}
function getCategoryAny(catId) { return getCategory(catId) || getIncomeCategory(catId); }
function getCategoriesByType(type) { return (type === TYPE.INCOME) ? CATEGORIES_INCOME : CATEGORIES; }

function parseDebtReturn(desc) {
    if (typeof desc !== 'string') return null;
    if (desc.indexOf(DEBT_FULL_PREFIX) === 0) {
        var fullName = desc.slice(DEBT_FULL_PREFIX.length);
        return fullName ? { kind: 'full', to: fullName } : null;
    }
    if (desc.indexOf(DEBT_PARTIAL_PREFIX) === 0) {
        var rest = desc.slice(DEBT_PARTIAL_PREFIX.length);
        var parenIdx = rest.indexOf(DEBT_PARTIAL_MARKER);
        var partName = (parenIdx > 0) ? rest.slice(0, parenIdx) : rest;
        return partName ? { kind: 'partial', to: partName } : null;
    }
    return null;
}

function getMonthKey(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    var y = d.getFullYear(), m = d.getMonth() + 1;
    return y + '-' + (m < 10 ? '0' + m : m);
}
function getCurrentMonthKey() { return getMonthKey(new Date().toISOString()); }
function formatMonthRu(key) {
    if (!key) return '';
    var parts = key.split('-');
    var y = parseInt(parts[0], 10), m = parseInt(parts[1], 10);
    if (isNaN(y) || isNaN(m) || m < 1 || m > 12) return key;
    return MONTHS_FULL[m - 1] + ' ' + y;
}
function getBudgetForCategory(catId, monthKey) {
    for (var i = 0; i < state.budgets.length; i++) {
        var b = state.budgets[i];
        if (b.categoryId === catId && b.month === monthKey) return b.limit;
    }
    return null;
}
function getSpentForCategory(catId, monthKey) {
    var total = 0;
    for (var i = 0; i < state.history.length; i++) {
        var h = state.history[i];
        if (getMonthKey(h.date) !== monthKey || h.amount >= 0) continue;
        if (h.categoryId === catId) total += Math.abs(h.amount);
        else if (catId === 'other' && h.type === TYPE.TRANSFER && !h.categoryId) total += Math.abs(h.amount);
    }
    return total;
}
function setBudgetLimit(catId, limit, monthKey) {
    state.budgets = state.budgets.filter(function (b) { return !(b.categoryId === catId && b.month === monthKey); });
    if (limit > 0) state.budgets.push({ categoryId: catId, limit: limit, month: monthKey });
    saveState();
}
function getBudgetColor(pct) {
    if (pct >= 100) return '#ff4757';
    if (pct >= 80)  return '#ff783c';
    if (pct >= 50)  return '#f7b731';
    return '#00d26a';
}
function shiftMonthKey(key, delta) {
    var parts = key.split('-');
    var y = parseInt(parts[0], 10), m = parseInt(parts[1], 10);
    if (isNaN(y) || isNaN(m)) return key;
    m += delta;
    while (m < 1) { m += 12; y -= 1; }
    while (m > 12) { m -= 12; y += 1; }
    return y + '-' + (m < 10 ? '0' + m : m);
}

/* ============ СОСТОЯНИЕ ============ */
function emptyState() {
    return {
        version: STATE_VERSION, balance: 0, initialBalance: 0, debts: [], plans: [], history: [], shopping: [],
        tf: 'D1', budgets: [], budgetsCollapsed: false, budgetsViewMonth: null,
        catExpensePeriod: null, // Для аналитики расходов по категориям
        periodFrom: null, periodTo: null
    };
}

var state = emptyState();
var currentTab = 'balance';
var historyFilter = 'all';
var historySearch = '';
var historyCatFilter = [];
var historyViewCount = 50;
var historyDateFrom = null, historyDateTo = null;

var selectionMode = false, selectedIds = [], _flashId = null, _animateList = false;
var shoppingSelected = [], shoppingFilterCategory = null;

/* ============ PERSISTENCE ============ */
var storageAvailable = true;
try {
    var _t = '__fs_test__'; window.localStorage.setItem(_t, '1'); window.localStorage.removeItem(_t);
} catch (e) { storageAvailable = false; }

function loadState() {
    if (!storageAvailable) return;
    try {
        var raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) { var old = window.localStorage.getItem('fin_shield_v7'); if (old) raw = old; }
        if (!raw) return;
        state = migrate(JSON.parse(raw));
    } catch (e) { console.error('[FinanceList] load error:', e); state = emptyState(); }
}

function migrate(raw) {
    if (!raw || typeof raw !== 'object') return emptyState();
    var s = emptyState();
    s.balance  = (typeof raw.balance === 'number' && isFinite(raw.balance)) ? raw.balance : 0;
    s.debts    = Array.isArray(raw.debts)    ? raw.debts.filter(isValidDebt)       : [];
    s.plans    = Array.isArray(raw.plans)    ? raw.plans.filter(isValidPlan)       : [];
    s.history  = Array.isArray(raw.history)  ? raw.history.filter(isValidHistory)  : [];
    s.shopping = Array.isArray(raw.shopping) ? raw.shopping.filter(isValidShopping): [];
    s.tf       = isValidTf(raw.tf) ? raw.tf : 'D1';
    s.budgets  = Array.isArray(raw.budgets)  ? raw.budgets.filter(isValidBudget)   : [];
    s.budgetsCollapsed = !!raw.budgetsCollapsed;
    s.budgetsViewMonth = typeof raw.budgetsViewMonth === 'string' ? raw.budgetsViewMonth : null;
    s.catExpensePeriod = raw.catExpensePeriod || null;
    s.periodFrom = raw.periodFrom || null;
    s.periodTo = raw.periodTo || null;

    for (var i = 0; i < s.history.length; i++) {
        var h = s.history[i];
        if (!h.id) h.id = uid();
        if (h.categoryId === 'fun') h.categoryId = 'other';
        // МИГРАЦИЯ ПЕРЕВОДОВ В РАСХОДЫ (ПРОЧЕЕ)
        if (h.type === TYPE.TRANSFER && h.amount < 0) {
            h.type = TYPE.EXPENSE;
            h.categoryId = 'other';
        } else if (h.type === TYPE.TRANSFER && h.amount > 0) {
            h.type = TYPE.INCOME;
            h.categoryId = 'other-income';
        }
        if (h.type === TYPE.EXPENSE && !h.categoryId) h.categoryId = DEFAULT_CATEGORY_ID;
        if (h.type === TYPE.INCOME  && !h.categoryId) h.categoryId = DEFAULT_INCOME_CATEGORY_ID;
    }

    for (var j = 0; j < s.shopping.length; j++) {
        var it = s.shopping[j];
        if (!it.id) it.id = uid();
        if (!it.categoryId) it.categoryId = DEFAULT_CATEGORY_ID;
    }

    if (typeof raw.initialBalance === 'number' && isFinite(raw.initialBalance)) s.initialBalance = raw.initialBalance;
    else {
        var histSum = 0;
        for (var k = 0; k < s.history.length; k++) histSum += s.history[k].amount;
        s.initialBalance = s.balance - histSum;
    }
    return s;
}

function isValidTf(id) { for (var i = 0; i < TIMEFRAMES.length; i++) if (TIMEFRAMES[i].id === id) return true; return false; }
function isValidDebt(d) { return d && typeof d.to === 'string' && typeof d.amount === 'number' && isFinite(d.amount) && d.id != null; }
function isValidPlan(p) { return p && typeof p.name === 'string' && typeof p.target === 'number' && isFinite(p.target) && typeof p.current === 'number' && isFinite(p.current) && p.id != null; }
function isValidHistory(h) { return h && typeof h.date === 'string' && typeof h.amount === 'number' && isFinite(h.amount); }
function isValidBudget(b) { return b && typeof b.categoryId === 'string' && typeof b.limit === 'number' && isFinite(b.limit) && b.limit > 0 && typeof b.month === 'string' && /^\d{4}-\d{2}$/.test(b.month); }
function isValidShopping(it) { return it && typeof it.name === 'string' && it.name.length > 0 && it.id != null; }

function saveState() {
    if (state.history.length > HISTORY_LIMIT) state.history.length = HISTORY_LIMIT;
    _acCache = null; // Сброс кэша автозаполнения
    if (!storageAvailable) { renderHeader(); return; }
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
    catch (e) {
        console.error('[FinanceList] save error:', e);
        if (e && e.name === 'QuotaExceededError') alert('Хранилище переполнено. Сделай экспорт и очисти историю.');
    }
    renderHeader();
}

/* ============ ХЕДЕР / АНИМАЦИИ ============ */
var _numAnimFrames = {};
function animateNumber(el, toValue, duration) {
    if (!el) return;
    duration = duration || 425;
    var key = el.id || 'default';
    if (_numAnimFrames[key]) { cancelAnimationFrame(_numAnimFrames[key]); _numAnimFrames[key] = null; }
    var fromValue = parseFloat(el.getAttribute('data-value')) || 0;
    if (Math.abs(fromValue - toValue) < 1) { el.textContent = fmt(toValue); el.setAttribute('data-value', String(toValue)); return; }
    var start = performance.now();
    function step(now) {
        var t = Math.min(1, (now - start) / duration);
        var eased = 1 - Math.pow(1 - t, 3);
        var current = fromValue + (toValue - fromValue) * eased;
        el.textContent = fmt(Math.round(current));
        if (t < 1) _numAnimFrames[key] = requestAnimationFrame(step);
        else { el.textContent = fmt(toValue); el.setAttribute('data-value', String(toValue)); _numAnimFrames[key] = null; }
    }
    _numAnimFrames[key] = requestAnimationFrame(step);
}

function renderHeader() {
    var balEl = document.getElementById('totalBalance'), debtEl = document.getElementById('totalDebt'), planEl = document.getElementById('totalPlans');
    var debtSum = 0; for (var i = 0; i < state.debts.length; i++) debtSum += state.debts[i].amount;
    var planSum = 0; for (var j = 0; j < state.plans.length; j++) planSum += state.plans[j].current;

    if (balEl.getAttribute('data-value') === null) {
        balEl.textContent = fmt(state.balance); balEl.setAttribute('data-value', String(state.balance));
        debtEl.textContent = fmt(debtSum); debtEl.setAttribute('data-value', String(debtSum));
        planEl.textContent = fmt(planSum); planEl.setAttribute('data-value', String(planSum));
        return;
    }
    animateNumber(balEl, state.balance, 425);
    animateNumber(debtEl, debtSum, 425);
    animateNumber(planEl, planSum, 425);
}

/* ============ ТОАСТ / RIPPLE ============ */
var _toastTimer = null;
function showToast(msg, type) {
    var el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.style.borderColor = type === 'error' ? 'var(--red)' : type === 'info' ? 'var(--blue)' : 'var(--green)';
    el.style.display = 'block'; void el.offsetWidth; el.classList.add('visible');
    if (_toastTimer) clearTimeout(_toastTimer);
    _toastTimer = setTimeout(function () {
        el.classList.remove('visible');
        setTimeout(function () { el.style.display = 'none'; }, 250);
    }, 1000);
}

var _rippleSelectors = '.btn-full,.mini-btn,.shopping-convert-btn,.selection-bar button,.period-empty-btn,.quick-amounts button,.history-cat-btn,.budgets-add-btn,.budgets-month-arrow,.budgets-month-label,.period-edit-btn,.tf-btn,.preset-btn,.floating-panel .fp-btn';
function spawnRipple(e) {
    var t = e.target; if (!t || typeof t.closest !== 'function') return;
    var btn = t.closest(_rippleSelectors); if (!btn) return;
    var rect = btn.getBoundingClientRect(); var size = Math.max(rect.width, rect.height);
    if (size === 0) return;
    var wave = document.createElement('span'); wave.className = 'ripple-wave';
    wave.style.width = size + 'px'; wave.style.height = size + 'px';
    wave.style.left = (e.clientX - rect.left - size / 2) + 'px'; wave.style.top = (e.clientY - rect.top - size / 2) + 'px';
    btn.appendChild(wave); setTimeout(function () { if (wave.parentNode) wave.parentNode.removeChild(wave); }, 600);
}

/* ============ АВТОЗАПОЛНЕНИЕ ============ */
var _acCache = null;
function getRecentNames() {
    if (_acCache) return _acCache;
    var map = Object.create(null);
    for (var i = 0; i < state.history.length; i++) {
        var raw = (state.history[i].desc || '').trim();
        if (!raw) continue;
        var key = raw.toLowerCase();
        if (!map[key]) map[key] = { name: raw, categoryId: state.history[i].categoryId, count: 0 };
        map[key].count++;
    }
    var result = Object.keys(map).map(function (k) { return map[k]; });
    result.sort(function (a, b) { return b.count - a.count; });
    _acCache = result;
    return result;
}

function setupAutocomplete(inputId) {
    var input = document.getElementById(inputId);
    if (!input || input._acAttached) return;
    input._acAttached = true;

    var wrap = document.createElement('div'); wrap.className = 'autocomplete-wrap';
    input.parentNode.insertBefore(wrap, input); wrap.appendChild(input);
    var list = document.createElement('div'); list.className = 'autocomplete-list'; wrap.appendChild(list);

    function hide() { list.classList.remove('visible'); }
    function show() {
        var q = input.value.trim().toLowerCase();
        if (!q) { hide(); return; }
        var names = getRecentNames().filter(function (n) { return n.name.toLowerCase().indexOf(q) === 0; });
        if (names.length === 0) { hide(); return; }
        var html = '';
        var max = Math.min(5, names.length);
        for (var i = 0; i < max; i++) {
            var n = names[i];
            var cat = n.categoryId ? getCategoryAny(n.categoryId) : null;
            var badge = cat ? '<span class="ac-badge cat-badge ' + cat.cssClass + '">' + cat.icon + '</span>' : '';
            html += '<div class="autocomplete-item" data-ac-value="' + esc(n.name) + '"><span class="ac-name">' + esc(n.name) + '</span>' + badge + '</div>';
        }
        list.innerHTML = html; list.classList.add('visible');
    }

    input.addEventListener('focus', show);
    input.addEventListener('input', show);
    input.addEventListener('blur', function () { setTimeout(hide, 180); });

    list.addEventListener('mousedown', function (e) {
        e.preventDefault(); var t = e.target; if (!t || typeof t.closest !== 'function') return;
        var item = t.closest('[data-ac-value]'); if (!item) return;
        input.value = item.getAttribute('data-ac-value'); hide();
        input.dispatchEvent(new Event('input', { bubbles: true }));
    });

    document.addEventListener('click', function (e) {
        if (!wrap.contains(e.target)) hide();
    });
}
/* ============ TABS ============ */
function switchTab(tab) {
    currentTab = tab;
    if (selectionMode) { selectionMode = false; selectedIds = []; }
    shoppingSelected = [];

    var tabs = document.querySelectorAll('.tab-btn');
    for (var i = 0; i < tabs.length; i++) {
        if (tabs[i].getAttribute('data-tab') === tab) tabs[i].classList.add('active');
        else tabs[i].classList.remove('active');
    }

    if (tab === 'balance') renderFiltersBar();
    else hideFiltersBar();

    var c = document.getElementById('mainContent');
    c.innerHTML = '';

    if (tab === 'balance')        renderBalance(c);
    else if (tab === 'debts')     renderDebts(c);
    else if (tab === 'plans')     renderPlans(c);
    else if (tab === 'shopping')  renderShopping(c);
    else if (tab === 'analytics') renderAnalytics(c);
    else if (tab === 'settings')  renderSettings(c);

    c.scrollTop = 0;
    hideChartTooltip();
    hideFloatingPanel();

    c.classList.remove('tab-enter');
    void c.offsetWidth;
    c.classList.add('tab-enter');
    setTimeout(function () { c.classList.remove('tab-enter'); }, 700);
}

/* ============ FILTERS BAR ============ */
function renderFiltersBar() {
    var bar = document.getElementById('filtersBar');
    if (!bar) return;
    var html = '<div class="filters">';
    for (var i = 0; i < FILTERS.length; i++) {
        var f = FILTERS[i];
        html += '<button type="button" class="filter-btn ' +
            (historyFilter === f.id ? 'active' : '') +
            '" data-action="filter" data-filter="' + f.id + '">' + f.label + '</button>';
    }
    html += '</div>';
    bar.innerHTML = html;
    bar.classList.add('visible');
}

function hideFiltersBar() {
    var bar = document.getElementById('filtersBar');
    if (bar) { bar.classList.remove('visible'); bar.innerHTML = ''; }
}

function setHistoryFilter(f) {
    historyFilter = f;
    historyViewCount = 50;
    _animateList = true;
    renderFiltersBar();
    renderBalance(document.getElementById('mainContent'));
}

/* ============ ФИЛЬТРАЦИЯ ИСТОРИИ ============ */
function getFilteredHistory() {
    var filtered = state.history;
    if (historyFilter === TYPE.INCOME) filtered = filtered.filter(function (h) { return h.amount > 0; });
    else if (historyFilter === TYPE.EXPENSE) filtered = filtered.filter(function (h) { return h.amount < 0; });

    if (historyCatFilter.length > 0) {
        filtered = filtered.filter(function (h) { return historyCatFilter.indexOf(h.categoryId) !== -1; });
    }

    if (historyDateFrom && historyDateTo) {
        var fromTs = new Date(historyDateFrom).getTime();
        var toTs = new Date(historyDateTo).getTime();
        filtered = filtered.filter(function (h) {
            var ts = new Date(h.date).getTime();
            return ts >= fromTs && ts <= toTs;
        });
    }

    var query = historySearch.trim().toLowerCase();
    if (query) {
        filtered = filtered.filter(function (h) {
            if ((h.desc || '').toLowerCase().indexOf(query) !== -1) return true;
            var amtStr = String(Math.abs(Math.round(h.amount)));
            if (amtStr.indexOf(query) !== -1) return true;
            return false;
        });
    }

    filtered = filtered.slice().sort(function (a, b) {
        return new Date(b.date).getTime() - new Date(a.date).getTime();
    });
    return filtered;
}

/* ============ ОТРИСОВКА ЗАПИСИ ИСТОРИИ ============ */
function renderHistoryItem(h) {
    var isPos = h.amount > 0;
    var color = isPos ? 'var(--green)' : 'var(--red)';
    var sign  = isPos ? '+' : '';

    var badgeHtml = '';
    if (h.categoryId) {
        var cat = getCategoryAny(h.categoryId);
        if (cat) badgeHtml = '<span class="cat-badge ' + cat.cssClass + '"><span class="cat-icon">' + cat.icon + '</span>' + esc(cat.name) + '</span>';
    } // <--- ВОТ ЭТУ СКОБКУ ТЫ ПОТЕРЯЛ

    var isSelected = selectedIds.indexOf(h.id) !== -1;
    var leftContent = 
        (badgeHtml ? '<div class="item-category">' + badgeHtml + '</div>' : '') +
        '<div class="item-name"><span class="item-desc">' + (esc(h.desc) || 'Без названия') + '</span></div>' +
        '<div class="item-sub">' + formatDateTime(h.date) + '</div>';

    if (selectionMode) {
        return '<div class="list-item selectable ' + (isSelected ? 'selected' : '') + '" data-action="history-toggle-select" data-id="' + esc(h.id) + '">' +
            '<div class="select-checkbox">✓</div>' +
            '<div class="item-left">' + leftContent + '</div>' +
            '<div class="item-right"><div class="item-amount" style="color:' + color + '">' + sign + fmt(h.amount) + '</div></div>' +
        '</div>';
    }

    return '<div class="list-item tappable" data-action="history-edit" data-id="' + esc(h.id) + '" data-longpress="history-start-select">' +
        '<div class="item-left">' + leftContent + '</div>' +
        '<div class="item-right">' +
            '<div class="item-amount" style="color:' + color + '">' + sign + fmt(h.amount) + '</div>' +
            '<button type="button" class="history-del-btn" data-action="history-del" data-id="' + esc(h.id) + '" aria-label="Удалить запись">✕</button>' +
        '</div>' +
    '</div>';
}

/* ============ РЕЖИМ ВЫДЕЛЕНИЯ ============ */
function startSelectionMode(id) {
    if (selectionMode) return;
    selectionMode = true;
    selectedIds = [id];
    renderBalance(document.getElementById('mainContent'));
}

function toggleSelect(id) {
    var idx = selectedIds.indexOf(id);
    if (idx === -1) selectedIds.push(id);
    else selectedIds.splice(idx, 1);

    if (selectedIds.length === 0) { 
        exitSelectionMode(); 
        return; 
    }

    // Меняем ТОЛЬКО класс нажатого элемента (без renderBalance!)
    var el = document.querySelector('.list-item[data-id="' + id + '"]');
    if (el) {
        if (idx === -1) el.classList.add('selected');
        else el.classList.remove('selected');
    }

    // Обновляем счетчик на плавающей панели
    var fpInfo = document.querySelector('.floating-panel .fp-info');
    if (fpInfo) fpInfo.textContent = 'Выбрано: ' + selectedIds.length;
}

function exitSelectionMode() {
    selectionMode = false;
    selectedIds = [];
    renderBalance(document.getElementById('mainContent'));
}

/* ============ LONG-PRESS (МЫШЬ И ТАЧ) ============ */
var _longPressTimer = null;
var _longPressFired = false;

function attachLongPressHandlers() {
    var items = document.querySelectorAll('[data-longpress="history-start-select"]');
    for (var i = 0; i < items.length; i++) {
        (function (el) {
            if (el._lpAttached) return;
            el._lpAttached = true;

            function start(e) {
                _longPressFired = false;
                if (e.touches) {
                    el._startX = e.touches[0].clientX;
                    el._startY = e.touches[0].clientY;
                } else {
                    el._startX = e.clientX;
                    el._startY = e.clientY;
                }
                _longPressTimer = setTimeout(function () {
                    _longPressFired = true;
                    var id = el.getAttribute('data-id');
                    if (id) startSelectionMode(id);
                }, 500);
            }
            function cancel() {
                if (_longPressTimer) { clearTimeout(_longPressTimer); _longPressTimer = null; }
            }
            function move(e) {
                if (!_longPressTimer) return;
                var x, y;
                if (e.touches) { x = e.touches[0].clientX; y = e.touches[0].clientY; }
                else { x = e.clientX; y = e.clientY; }
                var dx = Math.abs(x - el._startX);
                var dy = Math.abs(y - el._startY);
                if (dx > 15 || dy > 15) cancel();
            }

            el.addEventListener('touchstart', start, { passive: true });
            el.addEventListener('touchend', cancel);
            el.addEventListener('touchcancel', cancel);
            el.addEventListener('touchmove', move, { passive: true });
            el.addEventListener('contextmenu', function (e) { e.preventDefault(); });

            el.addEventListener('mousedown', function(e) {
                if (e.button !== 0) return;
                start(e);
            });
            el.addEventListener('mouseup', cancel);
            el.addEventListener('mouseleave', cancel);
            el.addEventListener('mousemove', move);
        })(items[i]);
    }
}

function shouldBlockEditClick() {
    if (_longPressFired) { _longPressFired = false; return true; }
    return false;
}

/* ============ DATE PICKER (СВАЙП) ============ */
var _datePickerState = {};

function ensureDatePickerState(prefix, iso) {
    if (!_datePickerState[prefix]) {
        var p = dateToParts(iso);
        _datePickerState[prefix] = { day: p.day, month: p.month, year: p.year };
    }
    return _datePickerState[prefix];
}

function buildDatePickerHtml(prefix, iso) {
    var st = ensureDatePickerState(prefix, iso);
    var years = getYearRange();
    var maxDay = daysInMonth(st.month, st.year);
    if (st.day > maxDay) st.day = maxDay;

    var dayItems = '';
    for (var d = 1; d <= maxDay; d++) {
        dayItems += '<div class="picker-item ' + (d === st.day ? 'active' : '') + '" data-action="dp-select" data-prefix="' + prefix + '" data-kind="day" data-value="' + d + '">' + (d < 10 ? '0'+d : d) + '</div>';
    }

    var monthItems = '';
    for (var m = 1; m <= 12; m++) {
        monthItems += '<div class="picker-item ' + (m === st.month ? 'active' : '') + '" data-action="dp-select" data-prefix="' + prefix + '" data-kind="month" data-value="' + m + '">' + (m < 10 ? '0'+m : m) + '</div>';
    }

    var yearItems = '';
    for (var y = 0; y < years.length; y++) {
        yearItems += '<div class="picker-item ' + (years[y] === st.year ? 'active' : '') + '" data-action="dp-select" data-prefix="' + prefix + '" data-kind="year" data-value="' + years[y] + '">' + years[y] + '</div>';
    }

    return '<div class="date-picker" data-prefix="' + prefix + '">' +
        '<div class="picker-wrap">' +
            '<div class="picker-highlight"></div>' +
            '<div class="picker-col" data-kind="day">' +
                '<div class="picker-padding"></div>' + dayItems + '<div class="picker-padding"></div>' +
            '</div>' +
            '<div class="picker-col" data-kind="month">' +
                '<div class="picker-padding"></div>' + monthItems + '<div class="picker-padding"></div>' +
            '</div>' +
            '<div class="picker-col" data-kind="year">' +
                '<div class="picker-padding"></div>' + yearItems + '<div class="picker-padding"></div>' +
            '</div>' +
        '</div>' +
    '</div>';
}

function initDatePickers() {
    var cols = document.querySelectorAll('.picker-col');
    for (var c = 0; c < cols.length; c++) {
        (function(col) {
            if (col._initialized) return;
            col._initialized = true;
            
            var prefix = col.closest('.date-picker').getAttribute('data-prefix');
            var kind = col.getAttribute('data-kind');
            var activeItem = col.querySelector('.picker-item.active');
            
            if (activeItem) {
                setTimeout(function() { col.scrollTop = activeItem.offsetTop - 50; }, 10);
            }
            
            var scrollTimer;
            col.addEventListener('scroll', function() {
                clearTimeout(scrollTimer);
                scrollTimer = setTimeout(function() {
                    var centerY = col.scrollTop + 50;
                    var items = col.querySelectorAll('.picker-item');
                    var closestItem = null;
                    var minDiff = Infinity;
                    
                    for (var i = 0; i < items.length; i++) {
                        var itemCenter = items[i].offsetTop + 25;
                        var diff = Math.abs(centerY - itemCenter);
                        if (diff < minDiff) { minDiff = diff; closestItem = items[i]; }
                    }
                    
                    if (closestItem && !closestItem.classList.contains('active')) {
                        for (var j=0; j<items.length; j++) items[j].classList.remove('active');
                        closestItem.classList.add('active');
                        
                        var val = parseInt(closestItem.getAttribute('data-value'), 10);
                        var st = _datePickerState[prefix];
                        if (st) {
                            if (kind === 'day') st.day = val;
                            else if (kind === 'month') st.month = val;
                            else if (kind === 'year') st.year = val;
                            
                            if (kind === 'month' || kind === 'year') {
                                var maxDay = daysInMonth(st.month, st.year);
                                if (st.day > maxDay) {
                                    st.day = maxDay;
                                    var dayCol = col.closest('.picker-wrap').querySelector('[data-kind="day"]');
                                    if (dayCol) {
                                        var dayItems = '';
                                        for (var d = 1; d <= maxDay; d++) {
                                            dayItems += '<div class="picker-item ' + (d === st.day ? 'active' : '') + '" data-action="dp-select" data-prefix="' + prefix + '" data-kind="day" data-value="' + d + '">' + (d < 10 ? '0'+d : d) + '</div>';
                                        }
                                        dayCol.innerHTML = '<div class="picker-padding"></div>' + dayItems + '<div class="picker-padding"></div>';
                                        // ВМЕСТО повторного вызова просто скроллим к новому активному дню
                                        var newActive = dayCol.querySelector('.picker-item.active');
                                        if (newActive) {
                                            setTimeout(function() { dayCol.scrollTop = newActive.offsetTop - 50; }, 10);
                                        }
                                    }
                                }
                            }
                        }
                    }
                }, 100);
            }, { passive: true });
        })(cols[c]);
    }
}

function datePickerSelect(prefix, kind, value) {
    var st = _datePickerState[prefix];
    if (!st) return;
    if (kind === 'day') st.day = parseInt(value, 10);
    else if (kind === 'month') st.month = parseInt(value, 10);
    else if (kind === 'year') st.year = parseInt(value, 10);
    rerenderDatePicker(prefix);
}

function rerenderDatePicker(prefix) {
    var st = _datePickerState[prefix];
    if (!st) return;
    var host = document.querySelector('.date-picker[data-prefix="' + prefix + '"]');
    if (!host) return;

    var maxDay = daysInMonth(st.month, st.year);
    if (st.day > maxDay) st.day = maxDay;

    var dayCol = host.querySelector('[data-kind="day"]');
    var monthCol = host.querySelector('[data-kind="month"]');
    var yearCol = host.querySelector('[data-kind="year"]');

    // Перестраиваем дни, если изменился месяц/год (количество дней)
    if (dayCol && dayCol.children.length - 2 !== maxDay) {
        var dayItems = '';
        for (var d = 1; d <= maxDay; d++) {
            dayItems += '<div class="picker-item ' + (d === st.day ? 'active' : '') + '" data-action="dp-select" data-prefix="' + prefix + '" data-kind="day" data-value="' + d + '">' + (d < 10 ? '0'+d : d) + '</div>';
        }
        dayCol.innerHTML = '<div class="picker-padding"></div>' + dayItems + '<div class="picker-padding"></div>';
    }

    // Прокручиваем к выбранным значениям
    if (dayCol) {
        var active = dayCol.querySelector('.picker-item[data-value="' + st.day + '"]');
        if (active) dayCol.scrollTop = active.offsetTop - 50;
    }
    if (monthCol) {
        var active = monthCol.querySelector('.picker-item[data-value="' + st.month + '"]');
        if (active) monthCol.scrollTop = active.offsetTop - 50;
    }
    if (yearCol) {
        var active = yearCol.querySelector('.picker-item[data-value="' + st.year + '"]');
        if (active) yearCol.scrollTop = active.offsetTop - 50;
    }
}

function readDatePicker(prefix, sourceIso) {
    var st = _datePickerState[prefix];
    if (!st) {
        var p = dateToParts(sourceIso);
        st = { day: p.day, month: p.month, year: p.year };
    }
    var maxDay = daysInMonth(st.month, st.year);
    if (st.day > maxDay) st.day = maxDay;
    return partsToIso(st.day, st.month, st.year, sourceIso);
}

function resetDatePickerState(prefix) { delete _datePickerState[prefix]; }

/* ============ TAB: BALANCE ============ */
var _opSelectedDate = null;

function renderBalance(c) {
    var savedScroll = c.scrollTop;
    
    var isRemembered = state.opDateRemembered || false;
    var currentOpDate = _opSelectedDate || new Date().toISOString();
    var displayDate = formatDate(currentOpDate);
    var pinStyle = isRemembered ? 'background:rgba(0,210,255,0.15); border-color:var(--blue); color:var(--blue);' : '';

    var formHtml =
        '<div class="card">' +
            '<div class="card-title" style="margin-bottom:10px">Создать операцию</div>' +
            '<input type="text" id="opAmount" placeholder="Сумма" inputmode="decimal" autocomplete="off">' +
            '<input type="text" id="opDesc" placeholder="Название" autocomplete="off">' +
            '<div style="display:flex; gap:8px; margin-bottom:10px; align-items:stretch;">' +
                '<input type="text" id="opTime" placeholder="ЧЧ:ММ" autocomplete="off" value="' + formatTimeFromIso(new Date().toISOString()) + '" style="margin:0; width:80px; flex-shrink:0; padding:12px 8px;">' +
                '<button type="button" class="btn-full btn-outline" style="margin:0; flex:1; padding:0 10px; font-size:13px;" data-action="op-date-open">' +
                    '📅 <span id="opDateLabel">' + displayDate + '</span>' +
                '</button>' +
                '<button type="button" class="btn-full btn-outline" style="margin:0; width:44px; flex-shrink:0; padding:0; font-size:16px; ' + pinStyle + '" data-action="op-date-toggle-remember" id="opDatePin" title="Запомнить дату">📌</button>' +
            '</div>' +
            '<div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">' +
                '<button type="button" class="btn-full btn-primary" data-action="op" data-sign="1">+ Пополнить</button>' +
                '<button type="button" class="btn-full btn-danger"  data-action="op" data-sign="-1">− Списать</button>' +
            '</div>' +
        '</div>';

    var allFiltered = getFilteredHistory();
    var totalFiltered = allFiltered.length;
    var visibleCount = Math.min(historyViewCount, totalFiltered);

    var filterActive = historyCatFilter.length > 0;
    var hasSearchValue = historySearch.length > 0;
    var hasDateFilter = !!(historyDateFrom && historyDateTo);
    
    var toolsHtml =
        '<div class="history-tools">' +
            '<div class="history-search-wrap' + (hasSearchValue ? ' has-value' : '') + '">' +
                '<input type="text" class="history-search" id="historySearch" placeholder="Поиск по истории" autocomplete="off" value="' + esc(historySearch) + '">' +
                '<button type="button" class="history-search-clear" data-action="clear-history-search" aria-label="Очистить">✕</button>' +
            '</div>' +
        '</div>' +
        '<div class="history-tools" style="margin-top:-4px;">' +
            '<button type="button" class="history-cat-btn ' + (filterActive ? 'active' : '') + '" data-action="open-cat-filter">' +
                '🏷 ' + (filterActive ? 'Категории: ' + historyCatFilter.length : 'Категории') +
            '</button>' +
            '<button type="button" class="history-cat-btn ' + (hasDateFilter ? 'active' : '') + '" data-action="hist-date-open">' +
                '📅 ' + (hasDateFilter ? 'Даты выбраны' : 'Даты') +
            '</button>' +
        '</div>';

    var selectionBarHtml = '';
    if (selectionMode && selectedIds.length > 0) {
        selectionBarHtml =
            '<div class="selection-bar">' +
                '<span class="sb-count">Выбрано: ' + selectedIds.length + '</span>' +
                '<button type="button" data-action="bulk-edit-category">🏷️ Категория</button>' +
                '<button type="button" data-action="bulk-edit-date">📅 Дата</button>' +
                '<button type="button" data-action="bulk-edit-name">✏️ Название</button>' +
                '<button type="button" class="danger" data-action="bulk-delete">🗑️ Удалить</button>' +
                '<button type="button" data-action="exit-selection">✕ Отмена</button>' +
            '</div>';
    }

    var historyHtml = '<div class="card"><div class="card-title history-card-title">История операций</div>' + toolsHtml + selectionBarHtml;

    if (totalFiltered === 0) {
        var emptyMsg = (historySearch.trim() || filterActive || hasDateFilter) ? 'Ничего не найдено' : 'Нет записей<br>Начни с пополнения баланса';
        historyHtml += '<div class="empty-state">' + emptyMsg + '</div>';
    } else {
        historyHtml += '<div id="historyList">';
        for (var k = 0; k < visibleCount; k++) historyHtml += renderHistoryItem(allFiltered[k]);
        historyHtml += '</div>';
        if (totalFiltered > visibleCount) {
            historyHtml += '<div class="history-load-more" id="historyLoadMore">Показано ' + visibleCount + ' из ' + totalFiltered + ' — прокрути вниз</div>';
        }
    }

    var now = new Date();
    var startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    var income = 0, expense = 0;
    for (var m = 0; m < state.history.length; m++) {
        var rec = state.history[m];
        var d = new Date(rec.date);
        if (isNaN(d.getTime()) || d < startOfMonth) continue;
        if (rec.type === TYPE.INCOME) income += rec.amount;
        else if (rec.type === TYPE.EXPENSE) expense += Math.abs(rec.amount);
    }

    historyHtml +=
        '<div class="summary-box">' +
            '<span>Доходы за месяц: <span class="summary-val" style="color:var(--green)">' + fmt(income) + '</span></span>' +
            '<span>Расходы за месяц: <span class="summary-val" style="color:var(--red)">' + fmt(expense) + '</span></span>' +
        '</div>' +
    '</div>';

    c.innerHTML = formHtml + buildBudgetsBlockHtml() + historyHtml;
    c.scrollTop = savedScroll;

    if (_animateList) {
        var listEl = document.getElementById('historyList');
        if (listEl) listEl.classList.add('animate-in');
        _animateList = false;
    }

    if (_flashId) {
        var items = c.querySelectorAll('[data-id]');
        for (var fi = 0; fi < items.length; fi++) {
            if (items[fi].getAttribute('data-id') === _flashId) {
                var isIncome = items[fi].querySelector('.item-amount') && items[fi].querySelector('.item-amount').textContent.indexOf('+') === 0;
                items[fi].classList.add('flash-new');
                items[fi].classList.add(isIncome ? 'flash-income' : 'flash-expense');
                break;
            }
        }
        _flashId = null;
    }

    var searchEl = document.getElementById('historySearch');
    if (searchEl) searchEl.addEventListener('input', handleHistorySearch);

    attachLongPressHandlers();
    setupAutocomplete('opDesc');

    var listEl2 = document.getElementById('historyList');
    if (listEl2) listEl2.classList.add('history-stagger');
}

/* ============ ПОИСК / ПАГИНАЦИЯ ============ */
var _searchTimer = null;
function handleHistorySearch(e) {
    historySearch = e.target.value;
    historyViewCount = 50;
    if (_searchTimer) clearTimeout(_searchTimer);
    _searchTimer = setTimeout(function () {
        var c = document.getElementById('mainContent');
        if (!c) return;
        var scrollTop = c.scrollTop;
        _animateList = true;
        renderBalance(c);
        c.scrollTop = scrollTop;
        var el = document.getElementById('historySearch');
        if (el) {
            el.focus();
            var len = el.value.length;
            try { el.setSelectionRange(len, len); } catch (_) {}
        }
    }, 200);
}

function handleContentScroll() {
    if (currentTab !== 'balance') return;
    var el = document.getElementById('mainContent');
    if (!el) return;
    if (el.scrollTop + el.clientHeight < el.scrollHeight - 200) return;

    var all = getFilteredHistory();
    if (historyViewCount >= all.length) return;

    var list = document.getElementById('historyList');
    var loadMore = document.getElementById('historyLoadMore');
    if (!list) return;

    var start = historyViewCount;
    var next = Math.min(historyViewCount + 50, all.length);

    var appendHtml = '';
    for (var i = start; i < next; i++) appendHtml += renderHistoryItem(all[i]);

    if (loadMore) {
        loadMore.insertAdjacentHTML('beforebegin', appendHtml);
        if (next >= all.length) loadMore.parentNode.removeChild(loadMore);
        else loadMore.textContent = 'Показано ' + next + ' из ' + all.length + ' — прокрути вниз';
    } else {
        list.insertAdjacentHTML('beforeend', appendHtml);
    }

    historyViewCount = next;
    attachLongPressHandlers();
}

/* ============ ОПЕРАЦИИ С ОСТАТКОМ ============ */
function doOp(sign) {
    var amtInput  = document.getElementById('opAmount');
    var descInput = document.getElementById('opDesc');
    var timeInput = document.getElementById('opTime');
    if (!amtInput || !descInput) return;

    var amt = parseAmount(amtInput.value);
    if (amt === null) { try { amtInput.focus(); } catch (_) {} return; }

    var desc = descInput.value.trim();
    var timeStr = timeInput ? timeInput.value.trim() : '';
    var opType = (sign > 0) ? TYPE.INCOME : TYPE.EXPENSE;
    showCategoryPicker(amt, desc, opType, null, timeStr);
}

function applyOp(sign, amt, desc, categoryId, timeStr) {
    var delta = amt * sign;
    if (sign < 0 && state.balance + delta < 0) {
        showConfirm('Баланс станет отрицательным', 'После операции остаток: ' + fmt(state.balance + delta) + '. Продолжить?',
            function () { commitOp(sign, amt, desc, categoryId, delta, timeStr); },
            { danger: true, okLabel: 'Всё равно списать' }
        );
        return;
    }
    commitOp(sign, amt, desc, categoryId, delta, timeStr);
}

function commitOp(sign, amt, desc, categoryId, delta, timeStr) {
    state.balance += delta;
    var isoNow = _opSelectedDate || new Date().toISOString();
    if (timeStr) isoNow = applyTimeToIso(isoNow, timeStr);

    var record = { id: uid(), date: isoNow, type: sign > 0 ? TYPE.INCOME : TYPE.EXPENSE, desc: desc, amount: delta };
    if (categoryId) record.categoryId = categoryId;

    state.history.unshift(record);
    _flashId = record.id;

    // Сбрасываем дату ТОЛЬКО если НЕ стоит галочка "запомнить"
    if (!state.opDateRemembered) {
        _opSelectedDate = null;
    }

    saveState();
    hideModal();
    renderBalance(document.getElementById('mainContent'));
    showToast('Операция сохранена');
}

/* ============ ВЫБОР КАТЕГОРИИ ============ */
var _pendingOp = null;
function showCategoryPicker(amt, desc, opType, preselectId, timeStr) {
    _pendingOp = { amt: amt, desc: desc, opType: opType, catId: preselectId || null, timeStr: timeStr || '' };
    var list = getCategoriesByType(opType);
    var isIncome = (opType === TYPE.INCOME);
    var title = isIncome ? 'Откуда пришло?' : 'Куда потратил?';
    var amountStr = (isIncome ? '+' : '−') + fmt(amt);
    var amountColor = isIncome ? 'var(--green)' : 'var(--red)';

    var buttonsHtml = '';
    for (var i = 0; i < list.length; i++) {
        var cat = list[i];
        var active = (preselectId === cat.id) ? ' active' : '';
        buttonsHtml += '<button type="button" class="cat-btn' + active + '" data-action="cat-pick" data-id="' + esc(cat.id) + '">' +
            '<span class="cat-icon">' + cat.icon + '</span><span>' + esc(cat.name) + '</span></button>';
    }

    showModal(
        '<h3>' + title + '</h3>' +
        '<div class="cat-amount" style="color:' + amountColor + '">' + amountStr + '</div>' +
        (desc ? '<div class="cat-desc">' + esc(desc) + '</div>' : '') +
        '<div class="cat-list">' + buttonsHtml + '</div>' +
        '<button type="button" class="btn-full btn-outline" data-action="cat-cancel">Отмена</button>'
    );
}

function pickCategory(catId) {
    if (!_pendingOp) return;
    var amt = _pendingOp.amt, desc = _pendingOp.desc, opType = _pendingOp.opType, timeStr = _pendingOp.timeStr || '';
    _pendingOp = null;
    hideModal();
    var sign = (opType === TYPE.INCOME) ? 1 : -1;
    applyOp(sign, amt, desc, catId, timeStr);
}

function cancelCategoryPicker() {
    _pendingOp = null; hideModal();
    var amtInput = document.getElementById('opAmount');
    if (amtInput) { try { amtInput.focus(); } catch (_) {} }
}

/* ============ ФИЛЬТР ПО КАТЕГОРИЯМ И ДАТАМ ============ */
function openCategoryFilter() {
    var html = '<h3>Фильтр по категориям</h3><p style="font-size:12px; color:var(--dim); margin:0 0 12px; line-height:1.4;">Отметь, что показывать.</p>';
    html += '<div class="cat-filter-subtitle">Расходы</div><div class="cat-filter-list">';
    for (var i = 0; i < CATEGORIES.length; i++) {
        var cat = CATEGORIES[i];
        var checked = historyCatFilter.indexOf(cat.id) !== -1;
        html += '<label class="cat-filter-row"><input type="checkbox" data-cat-filter="' + esc(cat.id) + '"' + (checked ? ' checked' : '') + '>' +
            '<span class="cf-dot" style="background:' + cat.color + '"></span><span class="cf-label">' + cat.icon + ' ' + esc(cat.name) + '</span></label>';
    }
    html += '</div><div class="cat-filter-subtitle">Доходы</div><div class="cat-filter-list">';
    for (var j = 0; j < CATEGORIES_INCOME.length; j++) {
        var catI = CATEGORIES_INCOME[j];
        var checkedI = historyCatFilter.indexOf(catI.id) !== -1;
        html += '<label class="cat-filter-row"><input type="checkbox" data-cat-filter="' + esc(catI.id) + '"' + (checkedI ? ' checked' : '') + '>' +
            '<span class="cf-dot" style="background:' + catI.color + '"></span><span class="cf-label">' + catI.icon + ' ' + esc(catI.name) + '</span></label>';
    }
    html += '</div><div class="btn-row" style="margin-top:14px;"><button type="button" class="btn-full btn-secondary" data-action="cat-filter-reset">Сбросить</button>' +
        '<button type="button" class="btn-full btn-primary" data-action="cat-filter-apply">Готово</button></div>';
    showModal(html);
}

function applyCategoryFilter() {
    var checkboxes = document.querySelectorAll('[data-cat-filter]');
    var newFilter = [];
    for (var i = 0; i < checkboxes.length; i++) if (checkboxes[i].checked) newFilter.push(checkboxes[i].getAttribute('data-cat-filter'));
    historyCatFilter = newFilter;
    historyViewCount = 50;
    _animateList = true;
    hideModal();
    renderBalance(document.getElementById('mainContent'));
}
function resetCategoryFilter() {
    var checkboxes = document.querySelectorAll('[data-cat-filter]');
    for (var i = 0; i < checkboxes.length; i++) checkboxes[i].checked = false;
}

function openHistoryDatePicker() {
    var fromIso = historyDateFrom || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
    var toIso   = historyDateTo   || new Date().toISOString();
    delete _datePickerState.histFrom; delete _datePickerState.histTo;
    ensureDatePickerState('histFrom', fromIso);
    ensureDatePickerState('histTo', toIso);

    showModal(
        '<h3>Фильтр по датам</h3>' +
        '<div class="period-picker-label">От</div>' + buildDatePickerHtml('histFrom', fromIso) +
        '<div class="period-picker-label">До</div>' + buildDatePickerHtml('histTo', toIso) +
        '<div class="btn-row" style="margin-top:14px;">' +
            '<button type="button" class="btn-full btn-secondary" data-action="hist-date-clear">Сбросить</button>' +
            '<button type="button" class="btn-full btn-primary" data-action="hist-date-apply">Применить</button>' +
        '</div>'
    );
}

function applyHistoryDate() {
    var fromSt = _datePickerState.histFrom, toSt = _datePickerState.histTo;
    if (!fromSt || !toSt) return;
    var fromDate = new Date(fromSt.year, fromSt.month - 1, fromSt.day, 0, 0, 0);
    var toDate   = new Date(toSt.year, toSt.month - 1, toSt.day, 23, 59, 59);
    if (fromDate > toDate) { alert('Дата «От» позже, чем «До». Поменяй местами.'); return; }
    historyDateFrom = fromDate.toISOString();
    historyDateTo = toDate.toISOString();
    historyViewCount = 50;
    delete _datePickerState.histFrom; delete _datePickerState.histTo;
    _animateList = true;
    hideModal();
    renderBalance(document.getElementById('mainContent'));
}
function clearHistoryDate() {
    historyDateFrom = null; historyDateTo = null; historyViewCount = 50;
    delete _datePickerState.histFrom; delete _datePickerState.histTo;
    _animateList = true;
    hideModal();
    renderBalance(document.getElementById('mainContent'));
}

/* ============ МОДАЛКИ (ОБЩИЕ) ============ */
var modalVisible = false;
var _confirmCallback = null;
var _modalHistoryPushed = false;

function showModal(html) {
    var content = document.getElementById('modalContent');
    var overlay = document.getElementById('modalOverlay');
    content.innerHTML = '<button type="button" class="modal-x" data-action="close-modal" aria-label="Закрыть">✕</button>' + html;

    overlay.style.display = 'block';
    overlay.classList.add('visible');
    overlay.scrollTop = 0;
    modalVisible = true;
    initDatePickers();

    if (!_modalHistoryPushed) {
        try { history.pushState({ fsModal: true }, ''); _modalHistoryPushed = true; } catch (_) {}
    }
}

function _hideModalInternal() {
    var overlay = document.getElementById('modalOverlay');
    var content = document.getElementById('modalContent');
    overlay.classList.remove('visible');
    setTimeout(function () {
        if (!overlay.classList.contains('visible')) {
            overlay.style.display = 'none';
            content.innerHTML = '';
        }
    }, 375);
    modalVisible = false;
    _confirmCallback = null;
    _delHistState = { id: null, refund: false, restore: false, bulkMode: false };
    delete _datePickerState.periodFrom; delete _datePickerState.periodTo;
    delete _datePickerState.histFrom; delete _datePickerState.histTo;
    delete _datePickerState.debt; delete _datePickerState.edit;
    delete _datePickerState.bulk; delete _datePickerState.shop;
}

function hideModal() {
    var wasPushed = _modalHistoryPushed;
    _modalHistoryPushed = false;
    _hideModalInternal();
    if (wasPushed) { try { history.back(); } catch (_) {} }
}

function showConfirm(title, text, onOk, opts) {
    opts = opts || {};
    _confirmCallback = function () {
        _confirmCallback = null;
        try { onOk(); } catch (e) { console.error('[FinanceList] confirm:', e); }
    };
    showModal(
        '<h3>' + esc(title) + '</h3><p class="confirm-text">' + esc(text) + '</p>' +
        '<div class="btn-row">' +
            '<button type="button" class="btn-full btn-secondary" data-action="confirm-cancel">' + esc(opts.cancelLabel || 'Отмена') + '</button>' +
            '<button type="button" class="btn-full ' + (opts.danger ? 'btn-danger' : 'btn-primary') + '" data-action="confirm-ok">' + esc(opts.okLabel || 'Подтвердить') + '</button>' +
        '</div>' + (opts.hint ? '<div class="confirm-hint">' + esc(opts.hint) + '</div>' : '')
    );
}

function handleConfirmOk() {
    var cb = _confirmCallback;
    _confirmCallback = null;
    hideModal();
    if (typeof cb === 'function') cb();
}
function handleConfirmCancel() { _confirmCallback = null; hideModal(); }

/* ============ ВЫБОР ДАТЫ ДЛЯ ОПЕРАЦИИ ============ */
function openOpDatePicker() {
    resetDatePickerState('opDate');
    var baseIso = _opSelectedDate || new Date().toISOString();
    ensureDatePickerState('opDate', baseIso);
    showModal(
        '<h3>Дата операции</h3>' +
        buildDatePickerHtml('opDate', baseIso) +
        '<button type="button" class="btn-full btn-primary" data-action="op-date-apply" style="margin-top:14px;">Применить</button>' +
        '<button type="button" class="btn-full btn-outline" data-action="close-modal">Отмена</button>'
    );
}

function applyOpDate() {
    var newIso = readDatePicker('opDate', _opSelectedDate || new Date().toISOString());
    _opSelectedDate = newIso;
    hideModal();
    var lbl = document.getElementById('opDateLabel');
    if (lbl) lbl.textContent = formatDate(newIso);
    else renderBalance(document.getElementById('mainContent'));
}
/* ============ TAB: DEBTS ============ */
function renderDebts(c) {
    var html =
        '<div class="card">' +
            '<div class="card-header">' +
                '<div class="card-title">Кому я должен</div>' +
                '<button type="button" class="btn-icon" data-action="add-debt" aria-label="Добавить долг">+</button>' +
            '</div>';

    if (state.debts.length === 0) {
        html += '<div class="empty-state">Долгов нет 🎉</div>';
    } else {
        var sorted = state.debts.slice().sort(function (a, b) { return new Date(a.createdAt || 0) - new Date(b.createdAt || 0); });
        for (var i = 0; i < sorted.length; i++) {
            var d = sorted[i];
            html +=
                '<div class="list-item">' +
                    '<div class="item-left">' +
                        '<div class="item-name">' + esc(d.to) + '</div>' +
                        '<div class="item-sub">Взял: ' + formatDate(d.createdAt) + '</div>' +
                    '</div>' +
                    '<div class="item-right">' +
                        '<div class="item-amount" style="color:var(--red)">' + fmt(d.amount) + '</div>' +
                        '<div class="item-actions">' +
                            '<button type="button" class="mini-btn pay" data-action="pay-debt" data-id="' + esc(d.id) + '">Вернул</button>' +
                            '<button type="button" class="mini-btn edit" data-action="edit-debt" data-id="' + esc(d.id) + '" aria-label="Изменить">✏️</button>' +
                            '<button type="button" class="mini-btn del" data-action="del-debt" data-id="' + esc(d.id) + '" aria-label="Удалить">✕</button>' +
                        '</div>' +
                    '</div>' +
                '</div>';
        }
    }
    html += '</div>';
    c.innerHTML = html;
}

function showAddDebt(existingId) {
    var d = (existingId != null) ? state.debts.filter(function (x) { return x.id === existingId; })[0] : null;
    var dateIso = d ? d.createdAt : new Date().toISOString();
    resetDatePickerState('debt');
    var dateHtml = buildDatePickerHtml('debt', dateIso);

    showModal(
        '<h3>' + (d ? 'Изменить долг' : 'Новый долг') + '</h3>' +
        '<input type="text" id="debtTo" placeholder="Кому (Имя)" autocomplete="off" value="' + esc(d ? d.to : '') + '">' +
        '<input type="text" id="debtAmt" placeholder="Сумма" inputmode="decimal" autocomplete="off" value="' + (d ? d.amount : '') + '">' +
        '<div class="field-label">Когда взял</div>' + dateHtml +
        '<button type="button" class="btn-full btn-primary" data-action="save-debt" data-id="' + (existingId != null ? esc(existingId) : '') + '">' + (d ? 'Сохранить' : 'Добавить') + '</button>' +
        '<button type="button" class="btn-full btn-outline" data-action="close-modal">Отмена</button>'
    );
    setupAutocomplete('debtTo');
}

function saveDebt(id) {
    var toEl = document.getElementById('debtTo'), amtEl = document.getElementById('debtAmt');
    var to = toEl ? toEl.value.trim() : '', amt = amtEl ? parseAmount(amtEl.value) : null;
    if (!to || amt === null) return;

    var existing = (id != null) ? state.debts.filter(function (x) { return x.id === id; })[0] : null;
    var sourceIso = existing ? existing.createdAt : new Date().toISOString();
    var newIso = readDatePicker('debt', sourceIso);

    if (existing) { existing.to = to; existing.amount = amt; existing.createdAt = newIso; }
    else { state.debts.push({ id: uid(), to: to, amount: amt, createdAt: newIso }); }

    resetDatePickerState('debt'); saveState(); hideModal();
    renderDebts(document.getElementById('mainContent'));
    showToast('Долг сохранён');
}

function showPayDebt(id) {
    var d = state.debts.filter(function (x) { return x.id === id; })[0];
    if (!d) return;
    var remain = d.amount, available = state.balance;
    var maxReturn = Math.min(remain, available), half = Math.floor(remain / 2);

    var quickHtml = '<div class="quick-amounts">' +
        (half > 0 && half <= maxReturn ? '<button type="button" data-action="debt-quick" data-amount="' + half + '">50% (' + fmt(half) + ')</button>' : '') +
        (remain <= available ? '<button type="button" data-action="debt-quick" data-amount="' + remain + '">Весь долг (' + fmt(remain) + ')</button>' : '') + '</div>';

    showModal(
        '<h3>Вернуть долг: ' + esc(d.to) + '</h3>' +
        '<div class="debt-info">Остаток долга: <b class="remain">' + fmt(remain) + '</b><br>Доступно на балансе: <b class="available">' + fmt(available) + '</b></div>' +
        quickHtml +
        '<input type="text" id="debtPayAmount" placeholder="Сумма возврата" inputmode="decimal" autocomplete="off">' +
        '<button type="button" class="btn-full btn-primary" data-action="debt-pay-confirm" data-id="' + esc(d.id) + '">Вернуть</button>' +
        '<button type="button" class="btn-full btn-outline" data-action="close-modal">Отмена</button>'
    );
}

function payDebt(id, amount) {
    var d = state.debts.filter(function (x) { return x.id === id; })[0];
    if (!d) return;
    var amt = parseAmount(amount);
    if (amt === null) return;
    if (amt > d.amount) { alert('Сумма больше остатка долга (' + fmt(d.amount) + ').'); return; }
    if (amt > state.balance) { alert('Недостаточно средств.\nНужно: ' + fmt(amt) + '\nДоступно: ' + fmt(state.balance)); return; }

    state.balance -= amt; d.amount -= amt;
    var isFull = d.amount <= 0.0001;
    var descText = isFull ? DEBT_FULL_PREFIX + d.to : DEBT_PARTIAL_PREFIX + d.to + DEBT_PARTIAL_MARKER + fmt(d.amount) + ')';

    var payRecordId = uid();
    // ТЕПЕРЬ ЭТО РАСХОД В ПРОЧЕЕ
    state.history.unshift({
        id: payRecordId, date: new Date().toISOString(),
        type: TYPE.EXPENSE, categoryId: 'other',
        desc: descText, amount: -amt
    });
    _flashId = payRecordId;

    if (isFull) state.debts = state.debts.filter(function (x) { return x.id !== id; });

    saveState(); renderHeader(); renderDebts(document.getElementById('mainContent'));
    showToast('Возврат записан');
}

function editDebt(id) { showAddDebt(id); }
function delDebt(id) {
    showConfirm('Удалить долг?', 'Запись о долге будет удалена. Деньги с баланса НЕ списываются.', function () {
        state.debts = state.debts.filter(function (x) { return x.id !== id; });
        saveState(); renderDebts(document.getElementById('mainContent'));
    }, { danger: true, okLabel: 'Удалить' });
}

/* ============ TAB: PLANS ============ */
function renderPlans(c) {
    var html = '<div class="card"><div class="card-header"><div class="card-title">Планы на покупки</div>' +
        '<button type="button" class="btn-icon" data-action="add-plan" aria-label="Добавить цель">+</button></div>';
    if (state.plans.length === 0) {
        html += '<div class="empty-state">Нет запланированных покупок</div>';
    } else {
        for (var i = 0; i < state.plans.length; i++) {
            var p = state.plans[i];
            var pct = Math.min(100, Math.round((p.current / p.target) * 100));
            var isFirst = i === 0, isLast = i === state.plans.length - 1;
            html +=
                '<div class="list-item" style="flex-wrap:wrap;">' +
                    '<div class="item-left" style="width:100%">' +
                        '<div style="display:flex; justify-content:space-between; align-items:center; gap:8px;">' +
                            '<div class="item-name">' + esc(p.name) + '</div>' +
                            '<div class="item-amount" style="color:var(--green); font-size:13px; white-space:nowrap;">' + fmt(p.current) + ' / ' + fmt(p.target) + '</div>' +
                        '</div>' +
                        '<div class="progress-bg"><div class="progress-fill" style="width:' + pct + '%"></div></div>' +
                        '<div class="item-sub-plan">Создано: ' + formatDate(p.createdAt) + '</div>' +
                        '<div class="item-actions">' +
                            '<button type="button" class="mini-btn move" data-action="move-plan" data-id="' + esc(p.id) + '" data-dir="-1"' + (isFirst ? ' disabled' : '') + ' aria-label="Выше">▲</button>' +
                            '<button type="button" class="mini-btn move" data-action="move-plan" data-id="' + esc(p.id) + '" data-dir="1"' + (isLast ? ' disabled' : '') + ' aria-label="Ниже">▼</button>' +
                            '<button type="button" class="mini-btn pay" data-action="fund-plan" data-id="' + esc(p.id) + '">+ Вложить</button>' +
                            '<button type="button" class="mini-btn edit" data-action="edit-plan" data-id="' + esc(p.id) + '" aria-label="Изменить">✏️</button>' +
                            '<button type="button" class="mini-btn del" data-action="del-plan" data-id="' + esc(p.id) + '" aria-label="Удалить">✕</button>' +
                        '</div>' +
                    '</div>' +
                '</div>';
        }
    }
    html += '</div>'; c.innerHTML = html;
}

function movePlan(id, dir) {
    var idx = -1; for (var i = 0; i < state.plans.length; i++) if (state.plans[i].id === id) { idx = i; break; }
    if (idx === -1) return;
    var newIdx = idx + dir; if (newIdx < 0 || newIdx >= state.plans.length) return;
    var tmp = state.plans[idx]; state.plans[idx] = state.plans[newIdx]; state.plans[newIdx] = tmp;
    saveState(); renderPlans(document.getElementById('mainContent'));
}

function showAddPlan(existingId) {
    var p = (existingId != null) ? state.plans.filter(function (x) { return x.id === existingId; })[0] : null;
    showModal(
        '<h3>' + (p ? 'Изменить цель' : 'Новая цель') + '</h3>' +
        '<input type="text" id="planName" placeholder="На что копим" autocomplete="off" value="' + esc(p ? p.name : '') + '">' +
        '<input type="text" id="planTarget" placeholder="Нужная сумма" inputmode="decimal" autocomplete="off" value="' + (p ? p.target : '') + '">' +
        '<button type="button" class="btn-full btn-primary" data-action="save-plan" data-id="' + (existingId != null ? esc(existingId) : '') + '">' + (p ? 'Сохранить' : 'Создать') + '</button>' +
        '<button type="button" class="btn-full btn-outline" data-action="close-modal">Отмена</button>'
    );
    setupAutocomplete('planName');
}

function savePlan(id) {
    var nameEl = document.getElementById('planName'), targetEl = document.getElementById('planTarget');
    var name = nameEl ? nameEl.value.trim() : '', target = targetEl ? parseAmount(targetEl.value) : null;
    if (!name || target === null) return;
    if (id) {
        var found = null; for (var i = 0; i < state.plans.length; i++) if (state.plans[i].id === id) { found = state.plans[i]; break; }
        if (found) { found.name = name; found.target = target; }
    } else {
        state.plans.push({ id: uid(), name: name, target: target, current: 0, createdAt: new Date().toISOString() });
    }
    saveState(); hideModal(); renderPlans(document.getElementById('mainContent'));
    showToast('Цель сохранена');
}

function showFundPlan(id) {
    var p = state.plans.filter(function (x) { return x.id === id; })[0];
    if (!p) return;
    var remain = Math.max(0, p.target - p.current);
    showModal(
        '<h3>Вложить в «' + esc(p.name) + '»</h3>' +
        '<div style="font-size:12px; color:var(--dim); margin-bottom:10px; line-height:1.5;">Осталось накопить: <b style="color:var(--green)">' + fmt(remain) + '</b><br>Доступно на балансе: <b style="color:var(--blue)">' + fmt(state.balance) + '</b></div>' +
        '<input type="text" id="fundAmount" placeholder="Сумма вклада" inputmode="decimal" autocomplete="off">' +
        '<button type="button" class="btn-full btn-primary" data-action="save-fund" data-id="' + esc(p.id) + '">Вложить</button>' +
        '<button type="button" class="btn-full btn-outline" data-action="close-modal">Отмена</button>'
    );
}

function fundPlan(id) {
    var p = state.plans.filter(function (x) { return x.id === id; })[0];
    if (!p) return;
    var input = document.getElementById('fundAmount'), amt = input ? parseAmount(input.value) : null;
    if (amt === null) { if (input) { try { input.focus(); } catch (_) {} } return; }
    if (amt > state.balance) { alert('Недостаточно средств.\nНужно: ' + fmt(amt) + '\nДоступно: ' + fmt(state.balance)); return; }

    state.balance -= amt; p.current += amt;
    var fundRecordId = uid();
    // ВКЛАД В ЦЕЛЬ — ТОЖЕ РАСХОД В ПРОЧЕЕ
    state.history.unshift({
        id: fundRecordId, date: new Date().toISOString(),
        type: TYPE.EXPENSE, categoryId: 'other',
        desc: 'Вклад в цель: ' + p.name, amount: -amt
    });
    _flashId = fundRecordId;
    saveState(); hideModal(); renderPlans(document.getElementById('mainContent'));
    showToast('Вклад сделан');
}

function editPlan(id) { showAddPlan(id); }
function delPlan(id) {
    var p = state.plans.filter(function (x) { return x.id === id; })[0];
    if (!p) return;
    var refund = p.current;
    var text = refund > 0 ? 'Накопленные ' + fmt(refund) + ' вернутся на баланс.' : 'Цель пустая, возвращать нечего.';
    showConfirm('Удалить цель "' + p.name + '"?', text, function () {
        state.balance += refund;
        if (refund > 0) {
            // ВОЗВРАТ ИЗ ЦЕЛИ — ЭТО ДОХОД В ПРОЧЕЕ
            state.history.unshift({
                id: uid(), date: new Date().toISOString(),
                type: TYPE.INCOME, categoryId: 'other-income',
                desc: 'Отмена цели: ' + p.name + ' (возврат)', amount: refund
            });
        }
        state.plans = state.plans.filter(function (x) { return x.id !== id; });
        saveState(); renderPlans(document.getElementById('mainContent'));
        showToast('Цель удалена');
    }, { danger: true, okLabel: 'Удалить' });
}

/* ============ TAB: SHOPPING ============ */
function renderShopping(c) {
    var savedScroll = c.scrollTop;
    var html = '<div class="card"><div class="card-header"><div class="card-title">Список покупок</div>' +
        '<button type="button" class="btn-icon" data-action="add-shopping" aria-label="Добавить покупку">+</button></div>';

    if (state.shopping.length === 0) {
        html += '<div class="empty-state">Список пуст<br>Добавь что-нибудь купить</div>';
    } else {
        var anySelected = shoppingSelected.length > 0;
        var selectedCategory = null;
        if (anySelected) {
            var firstItem = state.shopping.filter(function (it) { return it.id === shoppingSelected[0]; })[0];
            if (firstItem) selectedCategory = firstItem.categoryId;
        }

        html += '<div>';
        for (var i = 0; i < state.shopping.length; i++) {
            var it = state.shopping[i];
            var isChecked = shoppingSelected.indexOf(it.id) !== -1;
            var isBlocked = anySelected && !isChecked && it.categoryId !== selectedCategory;
            var cat = getCategoryAny(it.categoryId) || getCategory(DEFAULT_CATEGORY_ID);

            var badgeHtml = cat ? '<div class="item-category"><span class="cat-badge ' + cat.cssClass + '"><span class="cat-icon">' + cat.icon + '</span>' + esc(cat.name) + '</span></div>' : '';
            var dateHtml = it.dateIso ? '<span class="shopping-date">' + formatDate(it.dateIso) + '</span>' : '';

            html +=
                '<div class="shopping-item' + (isChecked ? ' checked' : '') + (isBlocked ? ' blocked' : '') + '" data-action="shopping-toggle" data-id="' + esc(it.id) + '">' +
                    '<div class="shopping-checkbox">✓</div>' +
                    '<div class="shopping-name">' + badgeHtml + '<span>' + esc(it.name) + '</span></div>' +
                    dateHtml +
                    '<button type="button" class="shopping-del" data-action="del-shopping" data-id="' + esc(it.id) + '" aria-label="Удалить">✕</button>' +
                '</div>';
        }
        html += '</div>';
    }
    html += '</div>';
    c.innerHTML = html; c.scrollTop = savedScroll;
    if (shoppingSelected.length > 0) showFloatingPanel(); else hideFloatingPanel();
}

function toggleShoppingItem(id) {
    var item = state.shopping.filter(function (x) { return x.id === id; })[0];
    if (!item) return;
    var idx = shoppingSelected.indexOf(id);

    // 1. Если уже выбрано — снимаем галочку
    if (idx !== -1) {
        shoppingSelected.splice(idx, 1);
        var el = document.querySelector('.shopping-item[data-id="' + id + '"]');
        if (el) el.classList.remove('checked');

        // Если сняли последнюю — разблокируем все остальные
        if (shoppingSelected.length === 0) {
            var allItems = document.querySelectorAll('.shopping-item');
            for (var i = 0; i < allItems.length; i++) allItems[i].classList.remove('blocked');
            hideFloatingPanel();
        } else {
            var fpInfo = document.querySelector('.floating-panel .fp-info');
            if (fpInfo) fpInfo.textContent = 'Выбрано: ' + shoppingSelected.length;
        }
        return;
    }

    // 2. Если ставим галочку — проверяем категорию ТОЛЬКО если это не первая галочка
    if (shoppingSelected.length > 0) {
        var firstItem = state.shopping.filter(function (it) { return it.id === shoppingSelected[0]; })[0];
        if (firstItem && firstItem.categoryId !== item.categoryId) {
            // Разные категории — просто мигаем элементом, БЕЗ перерисовки списка
            var el = document.querySelector('.shopping-item[data-id="' + id + '"]');
            if (el) {
                el.classList.add('flash-new', 'flash-expense');
                setTimeout(function () { el.classList.remove('flash-new', 'flash-expense'); }, 900);
            }
            return;
        }
    }

    // 3. Добавляем в массив и ставим класс
    shoppingSelected.push(id);
    var el = document.querySelector('.shopping-item[data-id="' + id + '"]');
    if (el) el.classList.add('checked');

    // Если это ПЕРВОЕ выделение — блокируем все остальные категории
    if (shoppingSelected.length === 1) {
        var allItems = document.querySelectorAll('.shopping-item');
        for (var i = 0; i < allItems.length; i++) {
            var itemId = allItems[i].getAttribute('data-id');
            var sItem = state.shopping.filter(function(x){return x.id === itemId;})[0];
            if (sItem && sItem.categoryId !== item.categoryId) {
                allItems[i].classList.add('blocked');
            }
        }
        showFloatingPanel('shopping');
    } else {
        var fpInfo = document.querySelector('.floating-panel .fp-info');
        if (fpInfo) fpInfo.textContent = 'Выбрано: ' + shoppingSelected.length;
    }
}

function showFloatingPanel(mode) {
    var panel = document.getElementById('floatingPanel');
    if (!panel) return;
    
    if (mode === 'history') {
        panel.innerHTML =
            '<div class="fp-info">Выбрано: ' + selectedIds.length + '</div>' +
            '<button type="button" class="fp-btn" style="font-size:12px; padding:8px;" data-action="bulk-edit-category">🏷️ Кат.</button>' +
            '<button type="button" class="fp-btn" style="font-size:12px; padding:8px;" data-action="bulk-edit-date">📅 Дата</button>' +
            '<button type="button" class="fp-btn" style="font-size:12px; padding:8px;" data-action="bulk-edit-name">✏️ Имя</button>' +
            '<button type="button" class="fp-btn" style="background:var(--red);color:#fff; font-size:12px; padding:8px;" data-action="bulk-delete">🗑️</button>' +
            '<button type="button" class="fp-btn" style="background:transparent;border:1px solid var(--dim);color:var(--dim); font-size:12px; padding:8px;" data-action="exit-selection">✕</button>';
    } else {
        panel.innerHTML =
            '<div class="fp-info">Выбрано: ' + shoppingSelected.length + '</div>' +
            '<button type="button" class="fp-btn" data-action="shopping-convert">Создать</button>' +
            '<button type="button" class="fp-btn" style="background:transparent;border:1px solid var(--dim);color:var(--dim);" data-action="shopping-deselect">Снять</button>';
    }
    
    panel.classList.add('visible');
    panel.style.display = 'flex';
}
function hideFloatingPanel() {
    var panel = document.getElementById('floatingPanel');
    if (!panel) return;
    panel.classList.remove('visible');
    setTimeout(function() { if (!panel.classList.contains('visible')) panel.style.display = 'none'; }, 375);
}

function shoppingDeselect() {
    shoppingSelected = [];
    renderShopping(document.getElementById('mainContent'));
    hideFloatingPanel();
}

function showAddShopping(existingId) {
    var it = (existingId != null) ? state.shopping.filter(function (x) { return x.id === existingId; })[0] : null;
    var currentCat = it ? it.categoryId : null;
    var catHtml = '<div class="field-label">Категория</div><div class="cat-list" style="margin-bottom:12px;">';
    for (var i = 0; i < CATEGORIES.length; i++) {
        var cat = CATEGORIES[i], active = (currentCat === cat.id) ? ' active' : '';
        catHtml += '<button type="button" class="cat-btn' + active + '" data-action="shopping-pick-cat" data-id="' + esc(cat.id) + '">' +
            '<span class="cat-icon">' + cat.icon + '</span><span>' + esc(cat.name) + '</span></button>';
    }
    catHtml += '</div>';

    resetDatePickerState('shop');
    var dateIso = it && it.dateIso ? it.dateIso : null;
    var dateHtml = dateIso ? '<div class="field-label">Дата покупки</div>' + buildDatePickerHtml('shop', dateIso) : '';

    showModal(
        '<h3>' + (it ? 'Изменить покупку' : 'Новая покупка') + '</h3>' +
        '<input type="text" id="shopName" placeholder="Что купить" autocomplete="off" value="' + esc(it ? it.name : '') + '">' +
        catHtml + (dateIso ? dateHtml : '') +
        '<label class="checkbox-row" style="margin-top:8px;">' +
            '<input type="checkbox" id="shopHasDate"' + (dateIso ? ' checked' : '') + '>' +
            '<span class="cb-label">Указать дату покупки<span class="cb-hint">Поможет вспомнить, когда это нужно</span></span>' +
        '</label>' +
        '<button type="button" class="btn-full btn-primary" data-action="save-shopping" data-id="' + (existingId != null ? esc(existingId) : '') + '">' + (it ? 'Сохранить' : 'Добавить') + '</button>' +
        '<button type="button" class="btn-full btn-outline" data-action="close-modal">Отмена</button>'
    );
    setupAutocomplete('shopName');

    var checkbox = document.getElementById('shopHasDate');
    if (checkbox) {
        checkbox.addEventListener('change', function () {
            var nameEl = document.getElementById('shopName'), name = nameEl ? nameEl.value : '';
            var activeCat = document.querySelector('.cat-btn.active'), selectedCat = activeCat ? activeCat.getAttribute('data-id') : null;
            _shopTempState = { name: name, catId: selectedCat, hasDate: checkbox.checked, dateIso: checkbox.checked ? new Date().toISOString() : null };
            showAddShoppingWithState(existingId != null ? existingId : null);
        });
    }
}

var _shopTempState = null;

function showAddShoppingWithState(existingId) {
    var it = (existingId != null) ? state.shopping.filter(function (x) { return x.id === existingId; })[0] : null;
    var name = _shopTempState && _shopTempState.name !== undefined ? _shopTempState.name : (it ? it.name : '');
    var catId = _shopTempState && _shopTempState.catId ? _shopTempState.catId : (it ? it.categoryId : null);
    var hasDate = _shopTempState && _shopTempState.hasDate ? _shopTempState.hasDate : !!(it && it.dateIso);
    var dateIso = _shopTempState && _shopTempState.dateIso ? _shopTempState.dateIso : (it && it.dateIso ? it.dateIso : new Date().toISOString());

    var catHtml = '<div class="field-label">Категория</div><div class="cat-list" style="margin-bottom:12px;">';
    for (var i = 0; i < CATEGORIES.length; i++) {
        var cat = CATEGORIES[i], active = (catId === cat.id) ? ' active' : '';
        catHtml += '<button type="button" class="cat-btn' + active + '" data-action="shopping-pick-cat" data-id="' + esc(cat.id) + '">' +
            '<span class="cat-icon">' + cat.icon + '</span><span>' + esc(cat.name) + '</span></button>';
    }
    catHtml += '</div>';

    resetDatePickerState('shop');
    var dateHtml = '';
    if (hasDate) { ensureDatePickerState('shop', dateIso); dateHtml = '<div class="field-label">Дата покупки</div>' + buildDatePickerHtml('shop', dateIso); }

    showModal(
        '<h3>' + (it ? 'Изменить покупку' : 'Новая покупка') + '</h3>' +
        '<input type="text" id="shopName" placeholder="Что купить" autocomplete="off" value="' + esc(name) + '">' +
        catHtml + dateHtml +
        '<label class="checkbox-row" style="margin-top:8px;">' +
            '<input type="checkbox" id="shopHasDate"' + (hasDate ? ' checked' : '') + '>' +
            '<span class="cb-label">Указать дату покупки<span class="cb-hint">Поможет вспомнить, когда это нужно</span></span>' +
        '</label>' +
        '<button type="button" class="btn-full btn-primary" data-action="save-shopping" data-id="' + (existingId != null ? esc(existingId) : '') + '">' + (it ? 'Сохранить' : 'Добавить') + '</button>' +
        '<button type="button" class="btn-full btn-outline" data-action="close-modal">Отмена</button>'
    );
    setupAutocomplete('shopName');

    var checkbox = document.getElementById('shopHasDate');
    if (checkbox) {
        checkbox.addEventListener('change', function () {
            var nameEl = document.getElementById('shopName'), name2 = nameEl ? nameEl.value : '';
            var activeCat = document.querySelector('.cat-btn.active'), selCat = activeCat ? activeCat.getAttribute('data-id') : null;
            _shopTempState = { name: name2, catId: selCat, hasDate: checkbox.checked, dateIso: checkbox.checked ? new Date().toISOString() : null };
            showAddShoppingWithState(existingId != null ? existingId : null);
        });
    }
}

function shoppingPickCat(catId) {
    var nameEl = document.getElementById('shopName'), name = nameEl ? nameEl.value : '';
    var checkbox = document.getElementById('shopHasDate');
    _shopTempState = { name: name, catId: catId, hasDate: !!(checkbox && checkbox.checked), dateIso: checkbox && checkbox.checked ? new Date().toISOString() : null };
    
    var overlay = document.getElementById('modalOverlay');
    var scrollPos = overlay.scrollTop;
    
    showAddShoppingWithState(null);
    
    setTimeout(function() { overlay.scrollTop = scrollPos; }, 0);
}

function saveShopping(id) {
    var nameEl = document.getElementById('shopName'), name = nameEl ? nameEl.value.trim() : '';
    if (!name) return;
    var activeCat = document.querySelector('.cat-btn.active'), catId = activeCat ? activeCat.getAttribute('data-id') : DEFAULT_CATEGORY_ID;
    var checkbox = document.getElementById('shopHasDate'), hasDate = !!(checkbox && checkbox.checked);
    var dateIso = hasDate ? readDatePicker('shop', new Date().toISOString()) : null;

    if (id) {
        var found = state.shopping.filter(function (x) { return x.id === id; })[0];
        if (found) { found.name = name; found.categoryId = catId; found.dateIso = dateIso; }
    } else {
        state.shopping.push({ id: uid(), name: name, categoryId: catId, dateIso: dateIso });
    }
    _shopTempState = null; saveState(); hideModal(); renderShopping(document.getElementById('mainContent'));
}

function delShopping(id) {
    showConfirm('Удалить покупку?', 'Пункт исчезнет из списка.', function () {
        state.shopping = state.shopping.filter(function (x) { return x.id !== id; });
        shoppingSelected = shoppingSelected.filter(function (x) { return x !== id; });
        saveState(); renderShopping(document.getElementById('mainContent'));
        if (shoppingSelected.length === 0) hideFloatingPanel();
    }, { danger: true, okLabel: 'Удалить' });
}

function shoppingConvert() {
    if (shoppingSelected.length === 0) return;
    var items = state.shopping.filter(function (it) { return shoppingSelected.indexOf(it.id) !== -1; });
    if (items.length === 0) return;

    var catId = items[0].categoryId, cat = getCategoryAny(catId) || getCategory(DEFAULT_CATEGORY_ID);
    var names = items.map(function (it) { return it.name; }).join(', ');
    var dateIso = new Date().toISOString();
    var dates = items.map(function (it) { return it.dateIso; }).filter(function (d) { return !!d; });
    if (dates.length > 0) { dates.sort(); dateIso = dates[0]; }

    showModal(
        '<h3>Создать операцию</h3>' +
        '<div class="cat-desc" style="margin-bottom:14px;">' + esc(names) + '</div>' +
        '<div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;">' +
            '<span style="width:38px;height:38px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:20px;background:' + cat.color + '33;flex-shrink:0;">' + cat.icon + '</span>' +
            '<span style="font-size:15px;color:var(--text);">' + esc(cat.name) + '</span>' +
        '</div>' +
        '<div class="field-label">Сумма</div>' +
        '<input type="text" id="convAmount" placeholder="Сумма" inputmode="decimal" autocomplete="off">' +
        '<div class="field-label">Время</div>' +
        '<input type="text" id="convTime" placeholder="ЧЧ:ММ" autocomplete="off" value="' + formatTimeFromIso(new Date().toISOString()) + '">' +
        '<button type="button" class="btn-full btn-primary" data-action="shopping-convert-confirm">Создать</button>' +
        '<button type="button" class="btn-full btn-outline" data-action="close-modal">Отмена</button>'
    );
}

function shoppingConvertConfirm() {
    var amtEl = document.getElementById('convAmount'), timeEl = document.getElementById('convTime');
    var amt = amtEl ? parseAmount(amtEl.value) : null;
    if (amt === null) { if (amtEl) { try { amtEl.focus(); } catch (_) {} } return; }

    if (amt > state.balance) {
        showConfirm('Баланс станет отрицательным', 'После операции остаток: ' + fmt(state.balance - amt) + '. Продолжить?',
            function () { _commitShoppingConvert(amt, timeEl ? timeEl.value.trim() : ''); },
            { danger: true, okLabel: 'Всё равно списать' }
        );
        return;
    }
    _commitShoppingConvert(amt, timeEl ? timeEl.value.trim() : '');
}

function _commitShoppingConvert(amt, timeStr) {
    var items = state.shopping.filter(function (it) { return shoppingSelected.indexOf(it.id) !== -1; });
    if (items.length === 0) { hideModal(); return; }
    var catId = items[0].categoryId, names = items.map(function (it) { return it.name; }).join(', ');

    var dateIso = new Date().toISOString();
    var dates = items.map(function (it) { return it.dateIso; }).filter(function (d) { return !!d; });
    if (dates.length > 0) { dates.sort(); dateIso = dates[0]; }
    dateIso = applyTimeToIso(dateIso, timeStr);

    state.balance -= amt;
    var recordId = uid();
    state.history.unshift({ id: recordId, date: dateIso, type: TYPE.EXPENSE, desc: names, amount: -amt, categoryId: catId });
    _flashId = recordId;

    state.shopping = state.shopping.filter(function (it) { return shoppingSelected.indexOf(it.id) === -1; });
    shoppingSelected = [];
    saveState(); hideModal(); switchTab('balance');
    showToast('Создана операция на ' + fmt(amt));
}

/* ============ РЕДАКТИРОВАНИЕ ИСТОРИИ ============ */
var _editState = { id: null, catId: null, amount: '', desc: '', dateIso: null, timeStr: '' };

function showEditHistoryItem(id) {
    var item = state.history.filter(function (h) { return h.id === id; })[0];
    if (!item) return;
    _editState.id = id;
    _editState.amount = String(Math.abs(item.amount));
    _editState.desc = item.desc || '';
    _editState.dateIso = item.date;
    _editState.timeStr = formatTimeFromIso(item.date);

    if (item.type === TYPE.EXPENSE) _editState.catId = item.categoryId || DEFAULT_CATEGORY_ID;
    else if (item.type === TYPE.INCOME) _editState.catId = item.categoryId || DEFAULT_INCOME_CATEGORY_ID;
    else _editState.catId = null;

    resetDatePickerState('edit'); ensureDatePickerState('edit', item.date);
    renderEditHistoryModal(item);
}

function renderEditHistoryModal(item) {
    var dateHtml = buildDatePickerHtml('edit', _editState.dateIso);
    var catHtml = '';
    if (item.type === TYPE.EXPENSE || item.type === TYPE.INCOME) {
        var list = getCategoriesByType(item.type);
        catHtml = '<div class="field-label">Категория</div><div class="cat-list" style="margin-bottom:12px;">';
        for (var j = 0; j < list.length; j++) {
            var cat = list[j], active = (_editState.catId === cat.id) ? ' active' : '';
            catHtml += '<button type="button" class="cat-btn' + active + '" data-action="edit-cat-pick" data-id="' + esc(cat.id) + '">' +
                '<span class="cat-icon">' + cat.icon + '</span><span>' + esc(cat.name) + '</span></button>';
        }
        catHtml += '</div>';
    }

    var isIncome = item.amount > 0;
    var hint = isIncome ? '<div style="font-size:11px;color:var(--dim);text-align:center;margin-bottom:8px;">Пополнение баланса</div>' : '';

    showModal(
        '<h3>Изменить операцию</h3>' + hint +
        '<div class="field-label">Сумма</div><input type="text" id="editAmount" inputmode="decimal" autocomplete="off" value="' + esc(_editState.amount) + '">' +
        '<div class="field-label">Название</div><input type="text" id="editDesc" autocomplete="off" value="' + esc(_editState.desc) + '">' +
        '<div class="field-label">Дата</div>' + dateHtml +
        '<div class="field-label">Время</div><input type="text" id="editTime" placeholder="ЧЧ:ММ" autocomplete="off" value="' + esc(_editState.timeStr || '') + '">' +
        catHtml +
        '<button type="button" class="btn-full btn-primary" data-action="save-edit-history" data-id="' + esc(item.id) + '">Сохранить</button>' +
        '<button type="button" class="btn-full btn-outline" data-action="delete-edit-history" data-id="' + esc(item.id) + '">Удалить операцию</button>' +
        '<button type="button" class="btn-full btn-outline" data-action="close-modal">Отмена</button>'
    );
    setupAutocomplete('editDesc');
}

function captureEditFields() {
    var amtEl = document.getElementById('editAmount'), descEl = document.getElementById('editDesc'), timeEl = document.getElementById('editTime');
    if (amtEl) _editState.amount = amtEl.value;
    if (descEl) _editState.desc = descEl.value;
    if (timeEl) _editState.timeStr = timeEl.value;
    _editState.dateIso = readDatePicker('edit', _editState.dateIso);
}

function editPickCategory(catId) {
    if (!_editState.id) return;
    var item = state.history.filter(function (h) { return h.id === _editState.id; })[0];
    if (!item) return;
    
    captureEditFields(); 
    _editState.catId = catId; 
    
    // Запоминаем позицию скролла перед перерисовкой
    var overlay = document.getElementById('modalOverlay');
    var scrollPos = overlay.scrollTop;
    
    renderEditHistoryModal(item);
    
    // Возвращаем на место после перерисовки
    setTimeout(function() { overlay.scrollTop = scrollPos; }, 0);
}

function saveEditedHistory(id) {
    var item = state.history.filter(function (h) { return h.id === id; })[0];
    if (!item) return;
    captureEditFields();
    var newAbs = parseAmount(_editState.amount);
    if (newAbs === null) { var amtEl = document.getElementById('editAmount'); if (amtEl) { try { amtEl.focus(); } catch (_) {} } return; }

    var oldAmount = item.amount, sign = oldAmount < 0 ? -1 : 1, newAmount = newAbs * sign;
    state.balance += (newAmount - oldAmount);
    var finalIso = applyTimeToIso(_editState.dateIso, _editState.timeStr);

    item.amount = newAmount; item.desc = _editState.desc.trim(); item.date = finalIso;
    if (item.type === TYPE.EXPENSE) item.categoryId = _editState.catId || DEFAULT_CATEGORY_ID;
    else if (item.type === TYPE.INCOME) item.categoryId = _editState.catId || DEFAULT_INCOME_CATEGORY_ID;
    else delete item.categoryId;

    resetDatePickerState('edit'); saveState(); hideModal(); renderBalance(document.getElementById('mainContent'));
    showToast('Изменения сохранены');
}

function deleteFromEdit(id) {
    resetDatePickerState('edit'); hideModal();
    setTimeout(function () { showDeleteHistoryItem(id, { refund: false, restore: false }); }, 50);
}

/* ============ УДАЛЕНИЕ ИСТОРИИ ============ */
var _delHistState = { id: null, refund: false, restore: false, bulkMode: false };
function showDeleteHistoryItem(id, opts) {
    opts = opts || {};
    var item = state.history.filter(function (h) { return h.id === id; })[0];
    if (!item) return;

    var refundVal = typeof opts.refund === 'boolean' ? opts.refund : false;
    var restoreVal = typeof opts.restore === 'boolean' ? opts.restore : false;
    if (!refundVal && restoreVal) restoreVal = false;

    _delHistState.id = id; _delHistState.refund = refundVal; _delHistState.restore = restoreVal; _delHistState.bulkMode = false;

    var isPos = item.amount > 0, sign = isPos ? '+' : '', amountClass = isPos ? 'pos' : 'neg';
    var debtInfo = parseDebtReturn(item.desc), canRestoreDebt = !!debtInfo;
    var balanceHint = refundVal ? 'Новый баланс: ' + fmt(state.balance - item.amount) : 'Баланс не изменится';

    var restoreHint = '';
    if (canRestoreDebt) {
        if (!refundVal) restoreHint = 'Сначала включи «Вернуть деньги на баланс»';
        else {
            var matches = state.debts.filter(function (d) { return d.to === debtInfo.to; });
            if (matches.length === 1) restoreHint = 'Прибавится к долгу «' + debtInfo.to + '» (' + fmt(matches[0].amount) + ' + ' + fmt(Math.abs(item.amount)) + ')';
            else if (matches.length === 0) restoreHint = 'Создастся новый долг «' + debtInfo.to + '» на ' + fmt(Math.abs(item.amount));
            else restoreHint = 'Найдено несколько долгов «' + debtInfo.to + '» — создастся новый';
        }
    }

    var refundRow = '<label class="checkbox-row" for="cbRefund"><input type="checkbox" id="cbRefund"' + (refundVal ? ' checked' : '') + '>' +
        '<span class="cb-label">Вернуть деньги на баланс<span class="cb-hint">' + esc(balanceHint) + '</span></span></label>';
    var restoreRow = '';
    if (canRestoreDebt) {
        var restoreDisabled = !refundVal;
        restoreRow = '<label class="checkbox-row' + (restoreDisabled ? ' disabled' : '') + '" for="cbRestoreDebt">' +
            '<input type="checkbox" id="cbRestoreDebt"' + (restoreVal ? ' checked' : '') + (restoreDisabled ? ' disabled' : '') + '>' +
            '<span class="cb-label">Восстановить долг «' + esc(debtInfo.to) + '»<span class="cb-hint">' + esc(restoreHint) + '</span></span></label>';
    }

    showModal(
        '<h3>Удалить операцию?</h3>' +
        '<div class="history-summary"><div class="h-title">' + (esc(item.desc) || 'Без названия') + '</div>' +
        '<div class="h-meta">' + formatDateTime(item.date) + '</div><div class="h-amount ' + amountClass + '">' + sign + fmt(item.amount) + '</div></div>' +
        refundRow + restoreRow +
        '<div class="btn-row" style="margin-top:12px;">' +
            '<button type="button" class="btn-full btn-secondary" data-action="close-modal">Отмена</button>' +
            '<button type="button" class="btn-full btn-danger" data-action="history-confirm-del" data-id="' + esc(id) + '" data-refund="' + (refundVal ? '1' : '0') + '" data-restore="' + (restoreVal ? '1' : '0') + '">Удалить</button>' +
        '</div>'
    );
}

function handleRefundToggle(checked) {
    if (_delHistState.bulkMode) return;
    var id = _delHistState.id; if (!id) return;
    var restore = _delHistState.restore; if (!checked) restore = false;
    showDeleteHistoryItem(id, { refund: checked, restore: restore });
}

function handleRestoreToggle(checked) {
    if (_delHistState.bulkMode) return;
    var id = _delHistState.id; if (!id) return;
    if (!_delHistState.refund) return;
    showDeleteHistoryItem(id, { refund: true, restore: checked });
}

function deleteHistoryItem(id, refund, restore) {
    var item = state.history.filter(function (h) { return h.id === id; })[0];
    if (!item) return;

    if (refund) state.balance -= item.amount;
    if (restore && refund) {
        var debtInfo = parseDebtReturn(item.desc);
        if (debtInfo) {
            var restoreAmount = Math.abs(item.amount);
            var matches = state.debts.filter(function (d) { return d.to === debtInfo.to; });
            if (matches.length === 1) matches[0].amount += restoreAmount;
            else state.debts.push({ id: uid(), to: debtInfo.to, amount: restoreAmount, createdAt: new Date().toISOString() });
        }
    }

    state.history = state.history.filter(function (h) { return h.id !== id; });
    saveState(); hideModal();
    var c = document.getElementById('mainContent');
    if (currentTab === 'balance') renderBalance(c);
    else if (currentTab === 'debts') renderDebts(c);
    else if (currentTab === 'plans') renderPlans(c);
    else if (currentTab === 'shopping') renderShopping(c);
    else if (currentTab === 'analytics') renderAnalytics(c);
    else if (currentTab === 'settings') renderSettings(c);
    showToast('Операция удалена');
}

/* ============ МАССОВЫЕ ДЕЙСТВИЯ ============ */
var _bulkState = {};
function bulkEditCategory() {
    if (selectedIds.length === 0) return;
    var hasExpense = false, hasIncome = false;
    for (var i = 0; i < selectedIds.length; i++) {
        var h = state.history.filter(function(x){return x.id === selectedIds[i];})[0];
        if (h) { if (h.type === TYPE.EXPENSE) hasExpense = true; if (h.type === TYPE.INCOME) hasIncome = true; }
    }
    if (!hasExpense && !hasIncome) {
        showModal('<h3>Сменить категорию</h3><p style="font-size:13px;color:var(--dim);margin:0 0 14px;">Нет подходящих операций.</p><button type="button" class="btn-full btn-outline" data-action="close-modal">Понятно</button>');
        return;
    }

        function makeBtn(cat, type) {
        return '<button type="button" data-action="bulk-apply-category" data-id="' + esc(cat.id) + '" data-type="' + type + '" style="display:flex;align-items:center;gap:12px;width:100%;padding:12px 14px;background:rgba(255,255,255,0.03);border:1px solid #2a3548;border-radius:10px;color:#e0e6ed;font-size:15px;font-family:inherit;cursor:pointer;min-height:52px;text-align:left;box-sizing:border-box;">' +
            '<span class="cat-badge ' + cat.cssClass + '" style="font-size:18px; padding:4px 8px; border-radius:6px;">' + cat.icon + '</span>' +
            '<span style="font-weight:500;">' + esc(cat.name) + '</span></button>';
    }

    var html = '<h3>Сменить категорию</h3><p style="font-size:12px;color:#9aa9c0;margin:0 0 14px;line-height:1.4;">Для ' + selectedIds.length + ' операций.</p>';
    if (hasExpense) {
        html += '<div style="font-size:11px;color:#9aa9c0;text-transform:uppercase;margin:0 0 8px;">Расходы</div><div style="display:flex;flex-direction:column;gap:8px;margin-bottom:14px;">';
        for (var e = 0; e < CATEGORIES.length; e++) html += makeBtn(CATEGORIES[e], TYPE.EXPENSE);
        html += '</div>';
    }
    if (hasIncome) {
        html += '<div style="font-size:11px;color:#9aa9c0;text-transform:uppercase;margin:0 0 8px;">Доходы</div><div style="display:flex;flex-direction:column;gap:8px;margin-bottom:14px;">';
        for (var inc = 0; inc < CATEGORIES_INCOME.length; inc++) html += makeBtn(CATEGORIES_INCOME[inc], TYPE.INCOME);
        html += '</div>';
    }
    html += '<button type="button" style="width:100%;padding:14px;border:1px solid #2a3548;border-radius:8px;background:transparent;color:#9aa9c0;font-size:15px;font-weight:bold;font-family:inherit;cursor:pointer;margin-top:6px;" data-action="close-modal">Отмена</button>';
    showModal(html);
}

function bulkApplyCategory(catId, forcedType) {
    for (var i = 0; i < state.history.length; i++) {
        var h = state.history[i];
        if (selectedIds.indexOf(h.id) === -1) continue;
        if (h.type === TYPE.TRANSFER) continue;
        if (forcedType && h.type !== forcedType) continue;
        h.categoryId = catId;
    }
    saveState(); hideModal(); exitSelectionMode();
}

function bulkEditDate() {
    if (selectedIds.length === 0) return;
    resetDatePickerState('bulk');
    _bulkState.dateIso = new Date().toISOString();
    showModal(
        '<h3>Сменить дату</h3><p style="font-size:12px; color:var(--dim); margin:0 0 12px;">Для ' + selectedIds.length + ' операций.</p>' +
        buildDatePickerHtml('bulk', _bulkState.dateIso) +
        '<button type="button" class="btn-full btn-primary" data-action="bulk-apply-date">Применить</button>' +
        '<button type="button" class="btn-full btn-outline" data-action="close-modal">Отмена</button>'
    );
}

function bulkApplyDate() {
    var baseIso = _bulkState.dateIso || new Date().toISOString();
    var newIso = readDatePicker('bulk', baseIso);
    for (var i = 0; i < state.history.length; i++) {
        var h = state.history[i];
        if (selectedIds.indexOf(h.id) === -1) continue;
        var oldDate = new Date(h.date), newDate = new Date(newIso);
        newDate.setHours(oldDate.getHours(), oldDate.getMinutes(), oldDate.getSeconds());
        h.date = newDate.toISOString();
    }
    resetDatePickerState('bulk'); saveState(); hideModal(); exitSelectionMode();
}

function bulkEditName() {
    if (selectedIds.length === 0) return;
    showModal(
        '<h3>Сменить название</h3><p style="font-size:12px; color:var(--dim); margin:0 0 12px;">Для ' + selectedIds.length + ' операций. Оставь пустым — не изменятся.</p>' +
        '<input type="text" id="bulkNameInput" placeholder="Новое название" autocomplete="off">' +
        '<button type="button" class="btn-full btn-primary" data-action="bulk-apply-name">Применить</button>' +
        '<button type="button" class="btn-full btn-outline" data-action="close-modal">Отмена</button>'
    );
}

function bulkApplyName() {
    var input = document.getElementById('bulkNameInput'), newName = input ? input.value.trim() : '';
    if (!newName) { hideModal(); return; }
    for (var i = 0; i < state.history.length; i++) {
        var h = state.history[i];
        if (selectedIds.indexOf(h.id) === -1) continue;
        h.desc = newName;
    }
    saveState(); hideModal(); exitSelectionMode();
}

function bulkDelete() {
    if (selectedIds.length === 0) return;
    var totalIncome = 0, totalExpense = 0;
    for (var i = 0; i < state.history.length; i++) {
        var h = state.history[i];
        if (selectedIds.indexOf(h.id) === -1) continue;
        if (h.amount > 0) totalIncome += h.amount; else totalExpense += Math.abs(h.amount);
    }
    var preview = (totalIncome > 0 ? '+ ' + fmt(totalIncome) + '<br>' : '') + (totalExpense > 0 ? '− ' + fmt(totalExpense) : '');
    _delHistState.bulkMode = true;

    showModal(
        '<h3>Удалить операции?</h3><div class="history-summary"><div class="h-title">Выбрано: ' + selectedIds.length + '</div><div class="h-meta">' + preview + '</div></div>' +
        '<label class="checkbox-row" for="cbBulkRefund"><input type="checkbox" id="cbBulkRefund"><span class="cb-label">Вернуть деньги на баланс<span class="cb-hint">Баланс скорректируется</span></span></label>' +
        '<div class="btn-row" style="margin-top:12px;">' +
            '<button type="button" class="btn-full btn-secondary" data-action="close-modal">Отмена</button>' +
            '<button type="button" class="btn-full btn-danger" data-action="bulk-apply-delete">Удалить</button>' +
        '</div>'
    );
}

function bulkApplyDelete() {
    var refundEl = document.getElementById('cbBulkRefund'), doRefund = !!(refundEl && refundEl.checked);
    var idsToDelete = selectedIds.slice();
    if (doRefund) {
        for (var i = 0; i < state.history.length; i++) {
            var h = state.history[i];
            if (idsToDelete.indexOf(h.id) === -1) continue;
            state.balance -= h.amount;
        }
    }
    state.history = state.history.filter(function (h) { return idsToDelete.indexOf(h.id) === -1; });
    _delHistState.bulkMode = false; saveState(); hideModal(); exitSelectionMode();
}

/* ============ АНАЛИТИКА ============ */
var chartSlotsCache = [];
var chartTfCache = 'D1';
var chartViewOffset = 0; // Для перетаскивания графика
var _chartDragX = 0;
var _chartIsDragging = false;

function formatDayLabel(d) { return d.getDate() + ' ' + MONTHS_SHORT[d.getMonth()]; }
function formatWeekLabel(d) { return d.getDate() + ' ' + MONTHS_SHORT[d.getMonth()]; }
function formatMonthLabel(d) { return MONTHS_SHORT[d.getMonth()] + ' ' + String(d.getFullYear()).slice(2); }
function formatQuarterLabel(d) { return 'Q' + (Math.floor(d.getMonth() / 3) + 1) + ' ' + String(d.getFullYear()).slice(2); }
function formatPeriodFull(slot, tfId) {
    if (tfId === 'D1') return slot.start.getDate() + ' ' + MONTHS_FULL[slot.start.getMonth()] + ' ' + slot.start.getFullYear();
    if (tfId === 'W1') return slot.start.getDate() + ' ' + MONTHS_SHORT[slot.start.getMonth()] + ' — ' + slot.end.getDate() + ' ' + MONTHS_SHORT[slot.end.getMonth()] + ' ' + slot.start.getFullYear();
    if (tfId === 'M1') return MONTHS_FULL[slot.start.getMonth()] + ' ' + slot.start.getFullYear();
    if (tfId === 'M3') return 'Квартал ' + (Math.floor(slot.start.getMonth() / 3) + 1) + ', ' + slot.start.getFullYear();
    return 'Год ' + slot.start.getFullYear();
}

function buildChartData(tfId) {
    var tf = TIMEFRAMES[0]; for (var i = 0; i < TIMEFRAMES.length; i++) if (TIMEFRAMES[i].id === tfId) { tf = TIMEFRAMES[i]; break; }
    var now = new Date(), todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999), startDate;

    if (tf.unit === 'day') { startDate = new Date(todayEnd); startDate.setDate(startDate.getDate() - tf.days + 1); startDate.setHours(0, 0, 0, 0); }
    else if (tf.unit === 'week') { startDate = new Date(todayEnd); startDate.setDate(startDate.getDate() - ((startDate.getDay() + 6) % 7) - 11 * 7); startDate.setHours(0, 0, 0, 0); }
    else if (tf.unit === 'month') startDate = new Date(now.getFullYear(), now.getMonth() - 11, 1);
    else if (tf.unit === 'q') startDate = new Date(now.getFullYear(), (Math.floor(now.getMonth() / 3) - 7) * 3, 1);
    else startDate = new Date(now.getFullYear() - 4, 0, 1);

    var slots = [];
    if (tf.unit === 'day') {
        var cur = new Date(startDate);
        while (cur <= todayEnd) {
            slots.push({ start: new Date(cur), end: new Date(cur.getFullYear(), cur.getMonth(), cur.getDate(), 23, 59, 59, 999), label: formatDayLabel(cur), income: 0, expense: 0, ops: 0 });
            cur.setDate(cur.getDate() + 1);
        }
    } else if (tf.unit === 'week') {
        var w = new Date(startDate);
        while (w <= todayEnd) {
            var wEnd = new Date(w); wEnd.setDate(wEnd.getDate() + 6); wEnd.setHours(23, 59, 59, 999);
            slots.push({ start: new Date(w), end: wEnd, label: formatWeekLabel(w), income: 0, expense: 0, ops: 0 });
            var nw = new Date(w); nw.setDate(nw.getDate() + 7); w = nw;
        }
    } else if (tf.unit === 'month') {
        var m = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
        while (m <= now) {
            slots.push({ start: new Date(m), end: new Date(m.getFullYear(), m.getMonth() + 1, 0, 23, 59, 59, 999), label: formatMonthLabel(m), income: 0, expense: 0, ops: 0 });
            m = new Date(m.getFullYear(), m.getMonth() + 1, 1);
        }
    } else if (tf.unit === 'q') {
        var q = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
        while (q <= now) {
            slots.push({ start: new Date(q), end: new Date(q.getFullYear(), q.getMonth() + 3, 0, 23, 59, 59, 999), label: formatQuarterLabel(q), income: 0, expense: 0, ops: 0 });
            q = new Date(q.getFullYear(), q.getMonth() + 3, 1);
        }
    } else {
        var y = new Date(startDate.getFullYear(), 0, 1);
        while (y <= now) {
            slots.push({ start: new Date(y), end: new Date(y.getFullYear(), 11, 31, 23, 59, 59, 999), label: String(y.getFullYear()), income: 0, expense: 0, ops: 0 });
            y = new Date(y.getFullYear() + 1, 0, 1);
        }
    }

    var balanceBefore = state.balance;
    for (var k = 0; k < state.history.length; k++) balanceBefore -= state.history[k].amount;
    var sorted = state.history.slice().sort(function (a, b) { return new Date(a.date) - new Date(b.date); });
    var running = balanceBefore, hIdx = 0;

    for (var s = 0; s < slots.length; s++) {
        var slot = slots[s];
        while (hIdx < sorted.length) {
            var h = sorted[hIdx], hTs = new Date(h.date).getTime();
            if (hTs < slot.start.getTime()) { running += h.amount; hIdx++; continue; }
            if (hTs > slot.end.getTime()) break;
            running += h.amount;
            if (h.amount > 0) slot.income += h.amount; else if (h.amount < 0) slot.expense += Math.abs(h.amount);
            slot.ops++; hIdx++;
        }
        slot.balanceEnd = running;
    }
    return slots;
}

function drawChart(canvas, slots, tfId, offsetX) {
    if (!canvas || !slots || slots.length === 0) return;
    var wrap = canvas.parentNode, cssW = wrap.clientWidth, cssH = 320;
    var dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(cssW * dpr); canvas.height = Math.floor(cssH * dpr);
    canvas.style.width = cssW + 'px'; canvas.style.height = cssH + 'px';
    var ctx = canvas.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);

    var PAD_L = 44, PAD_R = 12, PAD_T = 12, PAD_B = 22, GAP = 6, VOL_H = 60;
    var chartW = cssW - PAD_L - PAD_R, chartH = cssH - PAD_T - PAD_B - GAP - VOL_H;
    var lineTop = PAD_T, lineBot = PAD_T + chartH, volTop = lineBot + GAP, volBot = volTop + VOL_H;

    // Прокрутка: сколько слотов помещается, и с какого начинать
    var maxVisible = Math.max(10, Math.floor(chartW / 30)); 
    var startIdx = Math.max(0, slots.length - maxVisible - offsetX);
    var endIdx = Math.min(slots.length, startIdx + maxVisible);
    var visibleSlots = slots.slice(startIdx, endIdx);

    if (visibleSlots.length === 0) return;

    var minBal = Infinity, maxBal = -Infinity;
    for (var i = 0; i < visibleSlots.length; i++) { if (visibleSlots[i].balanceEnd < minBal) minBal = visibleSlots[i].balanceEnd; if (visibleSlots[i].balanceEnd > maxBal) maxBal = visibleSlots[i].balanceEnd; }
    if (minBal === maxBal) { minBal -= 1; maxBal += 1; }
    var range = maxBal - minBal; minBal -= range * 0.05; maxBal += range * 0.05;
    if (minBal > 0 && minBal < range * 0.5) minBal = 0;
    if (maxBal < 0 && maxBal > -range * 0.5) maxBal = 0;
    var yRange = maxBal - minBal; if (yRange === 0) yRange = 1;
    function yForBalance(b) { return lineBot - ((b - minBal) / yRange) * chartH; }

    var maxVol = 0;
    for (var v = 0; v < visibleSlots.length; v++) { if (visibleSlots[v].income > maxVol) maxVol = visibleSlots[v].income; if (visibleSlots[v].expense > maxVol) maxVol = visibleSlots[v].expense; }
    if (maxVol === 0) maxVol = 1;
    var volHalf = VOL_H / 2;

    ctx.strokeStyle = '#2a3548'; ctx.fillStyle = '#8b9bb4'; ctx.font = '10px -apple-system, sans-serif';
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.lineWidth = 1;
    for (var g = 0; g <= 4; g++) {
        var val = minBal + (yRange * g / 4), yy = yForBalance(val);
        ctx.beginPath(); ctx.moveTo(PAD_L, yy); ctx.lineTo(PAD_L + chartW, yy); ctx.stroke();
        ctx.fillText(fmtShort(val), PAD_L - 6, yy);
    }

    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    var slotW = chartW / visibleSlots.length;
    for (var s2 = 0; s2 < visibleSlots.length; s2++) {
        var lx = PAD_L + slotW * (s2 + 0.5);
        ctx.fillText(visibleSlots[s2].label, lx, volBot + 4);
    }

    var grad = ctx.createLinearGradient(0, lineTop, 0, lineBot);
    grad.addColorStop(0, 'rgba(0,210,255,0.18)'); grad.addColorStop(1, 'rgba(0,210,255,0)');
    ctx.beginPath();
    for (var p = 0; p < visibleSlots.length; p++) {
        var px = PAD_L + slotW * (p + 0.5), py = yForBalance(visibleSlots[p].balanceEnd);
        if (p === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    if (visibleSlots.length > 0) {
        ctx.lineTo(PAD_L + slotW * (visibleSlots.length - 0.5), lineBot);
        ctx.lineTo(PAD_L + slotW * 0.5, lineBot); ctx.closePath(); ctx.fillStyle = grad; ctx.fill();
    }

    ctx.beginPath();
    for (var p2 = 0; p2 < visibleSlots.length; p2++) {
        var px2 = PAD_L + slotW * (p2 + 0.5), py2 = yForBalance(visibleSlots[p2].balanceEnd);
        if (p2 === 0) ctx.moveTo(px2, py2); else ctx.lineTo(px2, py2);
    }
    ctx.strokeStyle = '#00d2ff'; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.stroke();

    ctx.strokeStyle = '#3a4558';
    ctx.beginPath(); ctx.moveTo(PAD_L, volTop + volHalf); ctx.lineTo(PAD_L + chartW, volTop + volHalf); ctx.stroke();

    var barW = Math.max(1, Math.min(slotW * 0.7, 20));
    for (var bx = 0; bx < visibleSlots.length; bx++) {
        var sl = visibleSlots[bx], cx = PAD_L + slotW * (bx + 0.5);
        if (sl.income > 0) { ctx.fillStyle = '#00d26a'; ctx.fillRect(cx - barW / 2, volTop + volHalf - (sl.income / maxVol) * volHalf, barW, (sl.income / maxVol) * volHalf); }
        if (sl.expense > 0) { ctx.fillStyle = '#ff4757'; ctx.fillRect(cx - barW / 2, volTop + volHalf, barW, (sl.expense / maxVol) * volHalf); }
    }

    ctx.strokeStyle = '#3a4558'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(PAD_L, lineTop); ctx.lineTo(PAD_L, volBot); ctx.stroke();
}

function renderAnalytics(c) {
    var currentTf = state.tf || 'D1';
    var tfHtml = '<div class="tf-switcher">';
    for (var i = 0; i < TIMEFRAMES.length; i++) {
        var tf = TIMEFRAMES[i];
        tfHtml += '<button type="button" class="tf-btn ' + (currentTf === tf.id ? 'active' : '') + '" data-action="tf" data-tf="' + tf.id + '">' + tf.label + '</button>';
    }
    tfHtml += '</div>';

    var slots = buildChartData(currentTf);
    var totalIncome = 0, totalExpense = 0, totalOps = 0, unitDays = 1;
    for (var u = 0; u < TIMEFRAMES.length; u++) {
        if (TIMEFRAMES[u].id === currentTf) { unitDays = TIMEFRAMES[u].unit === 'day' ? 1 : TIMEFRAMES[u].unit === 'week' ? 7 : TIMEFRAMES[u].unit === 'month' ? 30 : TIMEFRAMES[u].unit === 'q' ? 90 : 365; break; }
    }
    for (var j = 0; j < slots.length; j++) { totalIncome += slots[j].income; totalExpense += slots[j].expense; totalOps += slots[j].ops; }
    var netChange = totalIncome - totalExpense, netClass = netChange >= 0 ? 'pos' : 'neg', netSign = netChange >= 0 ? '+' : '';
    var daysInPeriod = Math.max(1, slots.length * unitDays);
    var avgUnitLabel, avgUnitCount;
    if (currentTf === 'D1') { avgUnitLabel = '/день'; avgUnitCount = daysInPeriod; }
    else if (currentTf === 'W1') { avgUnitLabel = '/неделю'; avgUnitCount = daysInPeriod / 7; }
    else if (currentTf === 'M1') { avgUnitLabel = '/месяц'; avgUnitCount = daysInPeriod / 30; }
    else if (currentTf === 'M3') { avgUnitLabel = '/квартал'; avgUnitCount = daysInPeriod / 90; }
    else { avgUnitLabel = '/год'; avgUnitCount = daysInPeriod / 365; }
    var avgExpense = totalExpense / Math.max(1, avgUnitCount);

        var html =
        '<div class="card">' + tfHtml +
            '<div style="display:flex; justify-content:space-between; margin-bottom:10px; align-items:center;">' +
                '<button type="button" class="btn-full btn-outline" style="margin:0; padding:8px; width:44px; height:44px; font-size:18px;" data-action="chart-prev">←</button>' +
                '<span style="color:var(--dim); font-size:12px; font-weight:600;">График</span>' +
                '<button type="button" class="btn-full btn-outline" style="margin:0; padding:8px; width:44px; height:44px; font-size:18px;" data-action="chart-next">→</button>' +
            '</div>' +
            '<div class="chart-wrap"><canvas class="chart-canvas" id="chartCanvas"></canvas></div>' +
            '<div class="analytics-summary">' +
                /* ... остальная часть summary остаётся как было ... */
                '<div class="as-row"><span>Доходы за период</span><b class="pos">+' + fmt(totalIncome) + '</b></div>' +
                '<div class="as-row"><span>Расходы за период</span><b class="neg">−' + fmt(totalExpense) + '</b></div>' +
                '<div class="as-row"><span>Итог</span><b class="' + netClass + '">' + netSign + fmt(netChange) + '</b></div>' +
                '<div class="as-row"><span>Операций</span><b>' + totalOps + '</b></div>' +
                '<div class="as-row"><span>Средний расход' + avgUnitLabel + '</span><b>' + fmt(avgExpense) + '</b></div>' +
            '</div>' +
        '</div>' +
        buildCatExpensesHtml() + // Вынесли в отдельную функцию с периодом
        buildPeriodBlockHtml();

    c.innerHTML = html;
    chartViewOffset = 0; // Сброс при смене таба

    requestAnimationFrame(function () {
        var canvas = document.getElementById('chartCanvas');
        if (canvas) {
            drawChart(canvas, slots, currentTf, chartViewOffset);
            chartSlotsCache = slots; chartTfCache = currentTf;
        }
    });
}

function setTimeframe(tfId) {
    if (!isValidTf(tfId) || state.tf === tfId) return;
    state.tf = tfId; saveState(); hideChartTooltip(); renderAnalytics(document.getElementById('mainContent'));
}

/* ============ РАСХОДЫ ПО КАТЕГОРИЯМ (С ПЕРИОДОМ) ============ */
function buildCatExpensesHtml() {
    var currentPeriod = state.catExpensePeriod || getCurrentMonthKey(); // По умолчанию текущий месяц
    var isMonth = currentPeriod.length === 7; // YYYY-MM
    var label = isMonth ? formatMonthRu(currentPeriod) : 'Выбранный период';

    var expSums = {}, incSums = {};
    for (var e0 = 0; e0 < CATEGORIES.length; e0++) expSums[CATEGORIES[e0].id] = 0;
    for (var i0 = 0; i0 < CATEGORIES_INCOME.length; i0++) incSums[CATEGORIES_INCOME[i0].id] = 0;

    var totalExpSum = 0, totalIncSum = 0;

    for (var k = 0; k < state.history.length; k++) {
        var h = state.history[k];
        var hKey = getMonthKey(h.date);
        if (isMonth && hKey !== currentPeriod) continue;
        // Если выбран не месяц, а произвольный период (можно расширить логику)

        if (h.amount < 0) {
            var catE = h.categoryId || DEFAULT_CATEGORY_ID;
            if (expSums[catE] === undefined) expSums[catE] = 0;
            expSums[catE] += Math.abs(h.amount); totalExpSum += Math.abs(h.amount);
        } else if (h.amount > 0) {
            var catI = h.categoryId || DEFAULT_INCOME_CATEGORY_ID;
            if (incSums[catI] === undefined) incSums[catI] = 0;
            incSums[catI] += h.amount; totalIncSum += h.amount;
        }
    }

    var expRowsHtml = '';
    for (var ei = 0; ei < CATEGORIES.length; ei++) {
        var catE2 = CATEGORIES[ei], sumE = expSums[catE2.id] || 0, pctE = totalExpSum > 0 ? Math.round((sumE / totalExpSum) * 100) : 0;
        expRowsHtml += '<div class="cat-table-row"><span class="ct-dot" style="background:' + catE2.color + '"></span><span class="ct-name">' + catE2.icon + ' ' + esc(catE2.name) + '</span><span class="ct-amount">' + fmt(sumE) + '</span><span class="ct-pct">' + pctE + '%</span></div>';
    }

    var periodNav = 
        '<div class="budgets-month-nav" style="margin-bottom:12px;">' +
            '<button type="button" class="budgets-month-arrow" data-action="cat-month-prev">←</button>' +
            '<div class="budgets-month-label" data-action="cat-period-open" style="min-width:140px;">' + label + '</div>' +
            '<button type="button" class="budgets-month-arrow" data-action="cat-month-next">→</button>' +
        '</div>';

    return '<div class="card"><div class="card-title" style="margin-bottom:10px">Расходы по категориям</div>' +
        periodNav +
        (totalExpSum > 0 ? '<div class="cat-table">' + expRowsHtml + '</div>' : '<div class="empty-state">Нет расходов за этот период</div>') +
    '</div>';
}

/* ============ АНАЛИЗ ПЕРИОДА (ГЛОБАЛЬНЫЙ) ============ */
function openPeriodPicker() {
    var fromIso = state.periodFrom || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
    var toIso   = state.periodTo   || new Date().toISOString();
    delete _datePickerState.periodFrom; delete _datePickerState.periodTo;
    ensureDatePickerState('periodFrom', fromIso); ensureDatePickerState('periodTo', toIso);

    var presets = '<div class="preset-bar">' +
        '<button type="button" class="preset-btn" data-action="preset-period" data-preset="week">Неделя</button>' +
        '<button type="button" class="preset-btn" data-action="preset-period" data-preset="month">Месяц</button>' +
        '<button type="button" class="preset-btn" data-action="preset-period" data-preset="quarter">Квартал</button>' +
        '<button type="button" class="preset-btn" data-action="preset-period" data-preset="year">Год</button>' +
        '<button type="button" class="preset-btn" data-action="preset-period" data-preset="all">Всё</button></div>';

    showModal(
        '<h3>Выбрать период</h3>' + presets +
        '<div class="period-picker-label">От</div>' + buildDatePickerHtml('periodFrom', fromIso) +
        '<div class="period-picker-label">До</div>' + buildDatePickerHtml('periodTo', toIso) +
        '<button type="button" class="btn-full btn-primary" data-action="period-apply">Применить</button>' +
        '<button type="button" class="btn-full btn-outline" data-action="close-modal">Отмена</button>'
    );
}

function applyPeriod() {
    var fromSt = _datePickerState.periodFrom, toSt = _datePickerState.periodTo;
    if (!fromSt || !toSt) return;
    var fromDate = new Date(fromSt.year, fromSt.month - 1, fromSt.day, 0, 0, 0);
    var toDate   = new Date(toSt.year, toSt.month - 1, toSt.day, 23, 59, 59);
    if (fromDate > toDate) { alert('Дата «От» позже, чем «До».'); return; }
    state.periodFrom = fromDate.toISOString(); state.periodTo = toDate.toISOString();
    delete _datePickerState.periodFrom; delete _datePickerState.periodTo;
    saveState(); hideModal(); renderAnalytics(document.getElementById('mainContent'));
}

function computePresetRange(preset) {
    var now = new Date(), from;
    if (preset === 'week') { from = new Date(now); from.setDate(from.getDate() - 7); }
    else if (preset === 'month') from = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
    else if (preset === 'quarter') from = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());
    else if (preset === 'year') from = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
    else {
        from = new Date(2000, 0, 1);
        if (state.history.length > 0) {
            var oldest = state.history[0].date;
            for (var i = 1; i < state.history.length; i++) if (new Date(state.history[i].date) < new Date(oldest)) oldest = state.history[i].date;
            from = new Date(oldest);
        }
    }
    return { from: from, to: now };
}

function applyPeriodPreset(preset) {
    var r = computePresetRange(preset);
    state.periodFrom = new Date(r.from.getFullYear(), r.from.getMonth(), r.from.getDate(), 0, 0, 0).toISOString();
    state.periodTo   = new Date(r.to.getFullYear(),   r.to.getMonth(),   r.to.getDate(),   23, 59, 59).toISOString();
    delete _datePickerState.periodFrom; delete _datePickerState.periodTo;
    saveState(); hideModal(); renderAnalytics(document.getElementById('mainContent'));
    showToast('Период установлен', 'info');
}

function buildPeriodBlockHtml() {
    if (!state.periodFrom || !state.periodTo) {
        return '<div class="card"><div class="card-title" style="margin-bottom:12px">Анализ периода</div>' +
            '<div class="period-empty"><button type="button" class="period-empty-btn" data-action="period-open">Выбрать период</button></div></div>';
    }
    var fromDate = new Date(state.periodFrom), toDate = new Date(state.periodTo);
    var fromStr = fromDate.getDate() + ' ' + MONTHS_SHORT[fromDate.getMonth()] + ' ' + fromDate.getFullYear();
    var toStr = toDate.getDate() + ' ' + MONTHS_SHORT[toDate.getMonth()] + ' ' + toDate.getFullYear();

    var expSums = {}, incSums = {};
    for (var e = 0; e < CATEGORIES.length; e++) expSums[CATEGORIES[e].id] = 0;
    for (var i = 0; i < CATEGORIES_INCOME.length; i++) incSums[CATEGORIES_INCOME[i].id] = 0;

    var fromTs = fromDate.getTime(), toTs = toDate.getTime();
    for (var k = 0; k < state.history.length; k++) {
        var h = state.history[k], hTs = new Date(h.date).getTime();
        if (hTs < fromTs || hTs > toTs) continue;
        if (h.amount < 0) { var catE = h.categoryId || DEFAULT_CATEGORY_ID; if (expSums[catE] === undefined) expSums[catE] = 0; expSums[catE] += Math.abs(h.amount); }
        else if (h.amount > 0) { var catI = h.categoryId || DEFAULT_INCOME_CATEGORY_ID; if (incSums[catI] === undefined) incSums[catI] = 0; incSums[catI] += h.amount; }
    }

    var totalExp = 0, totalInc = 0;
    for (var ei = 0; ei < CATEGORIES.length; ei++) totalExp += expSums[CATEGORIES[ei].id] || 0;
    for (var ii = 0; ii < CATEGORIES_INCOME.length; ii++) totalInc += incSums[CATEGORIES_INCOME[ii].id] || 0;
    var totalAll = totalExp + totalInc, items = [];

    for (var c1 = 0; c1 < CATEGORIES.length; c1++) {
        var cat1 = CATEGORIES[c1], sum1 = expSums[cat1.id] || 0, pct1 = totalAll > 0 ? (sum1 / totalAll) * 100 : 0;
        items.push({ icon: cat1.icon, amount: sum1, pct: pct1, type: 'expense', hasData: sum1 > 0 });
    }
    for (var c2 = 0; c2 < CATEGORIES_INCOME.length; c2++) {
        var cat2 = CATEGORIES_INCOME[c2], sum2 = incSums[cat2.id] || 0, pct2 = totalAll > 0 ? (sum2 / totalAll) * 100 : 0;
        items.push({ icon: cat2.icon, amount: sum2, pct: pct2, type: 'income', hasData: sum2 > 0 });
    }
    items.sort(function (a, b) { return Math.abs(b.amount) - Math.abs(a.amount); });

    var maxAmount = 0;
    for (var mi = 0; mi < items.length; mi++) if (items[mi].amount > maxAmount) maxAmount = items[mi].amount;
    if (maxAmount === 0) maxAmount = 1;

    var candlesHtml = '';
    for (var ci = 0; ci < items.length; ci++) {
        var it = items[ci], heightPx = it.hasData ? Math.max(4, Math.round((it.amount / maxAmount) * 160)) : 3;
        var barClass = it.hasData ? it.type : 'empty', pctStr = it.hasData ? (it.pct < 1 ? '<1%' : Math.round(it.pct) + '%') : '0%';
        candlesHtml += '<div class="candle"><div class="candle-amount">' + (it.hasData ? fmtShort(it.amount) : '') + '</div>' +
            '<div class="candle-bar ' + barClass + '" style="height:' + heightPx + 'px"></div>' +
            '<div class="candle-icon">' + it.icon + '</div><div class="candle-pct">' + pctStr + '</div></div>';
    }

    var net = totalInc - totalExp, netSign = net >= 0 ? '+' : '', netColor = net >= 0 ? 'var(--green)' : 'var(--red)';

    return '<div class="card"><div class="card-title" style="margin-bottom:12px">Анализ периода</div>' +
        '<div class="period-header"><div class="period-range"><span class="pr-label">Период</span>' + fromStr + ' — ' + toStr + '</div>' +
        '<button type="button" class="period-edit-btn" data-action="period-open">Изменить</button></div>' +
        '<div class="candles-wrap"><div class="candles-row">' + candlesHtml + '</div></div>' +
        '<div class="period-legend"><span class="pl-item"><span class="pl-dot income"></span>Доходы</span><span class="pl-item"><span class="pl-dot expense"></span>Расходы</span><span class="pl-item"><span class="pl-dot empty"></span>Нет данных</span></div>' +
        '<div class="period-totals">' +
            '<div class="pt-row"><span class="pt-label">Всего доходов</span><span class="pt-value" style="color:var(--green)">' + (totalInc > 0 ? '+' : '') + fmt(totalInc) + '</span></div>' +
            '<div class="pt-row"><span class="pt-label">Всего расходов</span><span class="pt-value" style="color:var(--red)">' + (totalExp > 0 ? '−' : '') + fmt(totalExp) + '</span></div>' +
            '<div class="pt-row pt-row-total"><span class="pt-label">Итог за период</span><span class="pt-value" style="color:' + netColor + '">' + netSign + fmt(net) + '</span></div>' +
        '</div></div>';
}

/* ============ БЮДЖЕТЫ ============ */
function buildBudgetsBlockHtml() {
    var viewMonth = state.budgetsViewMonth || getCurrentMonthKey();
    var budgetsForMonth = state.budgets.filter(function (b) { return b.month === viewMonth; });
    budgetsForMonth.sort(function (a, b) {
        var idxA = -1, idxB = -1;
        for (var i = 0; i < CATEGORIES.length; i++) { if (CATEGORIES[i].id === a.categoryId) idxA = i; if (CATEGORIES[i].id === b.categoryId) idxB = i; }
        return idxA - idxB;
    });

    var canGoForward = viewMonth < getCurrentMonthKey(), rowsHtml = '';
    if (budgetsForMonth.length === 0) {
        rowsHtml = '<div class="budgets-empty">На этот месяц бюджетов нет<br><span style="font-size:11px;">Нажми «Изменить бюджеты» ниже</span></div>';
    } else {
        for (var i = 0; i < budgetsForMonth.length; i++) {
            var b = budgetsForMonth[i], cat = getCategory(b.categoryId);
            if (!cat) continue;
            var spent = getSpentForCategory(b.categoryId, viewMonth), pct = b.limit > 0 ? (spent / b.limit) * 100 : 0;
            var barPct = Math.min(100, pct), color = getBudgetColor(pct), over = spent > b.limit, overAmount = over ? (spent - b.limit) : 0;
            rowsHtml += '<div class="budget-row"><div class="budget-row-top"><span class="budget-row-name">' + cat.icon + ' ' + esc(cat.name) + '</span>' +
                '<span class="budget-row-amounts"><b>' + fmt(spent) + '</b> / ' + fmt(b.limit) + '</span></div>' +
                '<div class="budget-bar-bg"><div class="budget-bar-fill" style="width:' + barPct + '%;background:' + color + '"></div></div>' +
                (over ? '<div class="budget-over">Превышение: ' + fmt(overAmount) + '</div>' : '') + '</div>';
        }
    }

    var collapseClass = state.budgetsCollapsed ? ' collapsed' : '', rotateClass = state.budgetsCollapsed ? ' rotated' : '';
    return '<div class="card"><div class="budgets-header"><div class="card-title" style="margin:0;">Бюджеты</div>' +
        '<button type="button" class="budgets-toggle ' + rotateClass + '" data-action="budgets-toggle" aria-label="Свернуть">▼</button></div>' +
        '<div class="budgets-collapse-wrap' + collapseClass + '"><div class="budgets-month-nav">' +
            '<button type="button" class="budgets-month-arrow" data-action="budgets-month-prev">←</button>' +
            '<div class="budgets-month-label" data-action="budgets-month-open">' + formatMonthRu(viewMonth) + '</div>' +
            '<button type="button" class="budgets-month-arrow" data-action="budgets-month-next"' + (canGoForward ? '' : ' disabled') + '>→</button></div>' +
            '<div class="budgets-list">' + rowsHtml + '</div>' +
            '<button type="button" class="budgets-add-btn" data-action="budgets-edit-open">+ Изменить бюджеты</button></div></div>';
}

function budgetsShiftMonth(delta) {
    var current = state.budgetsViewMonth || getCurrentMonthKey(), next = shiftMonthKey(current, delta);
    if (next > getCurrentMonthKey()) return;
    state.budgetsViewMonth = next; saveState(); renderBalance(document.getElementById('mainContent'));
}
function budgetsToggleCollapse() {
    state.budgetsCollapsed = !state.budgetsCollapsed; saveState();
    var wrap = document.querySelector('.budgets-collapse-wrap'), btn = document.querySelector('.budgets-toggle');
    if (wrap) wrap.classList.toggle('collapsed'); if (btn) btn.classList.toggle('rotated');
}
function openBudgetsMonthPicker() {
    var months = getAllMonthsWithBudgets(), currentKey = getCurrentMonthKey();
    if (months.indexOf(currentKey) === -1) months.push(currentKey);
    months.sort(); months.reverse();
    var viewMonth = state.budgetsViewMonth || currentKey;
    var html = '<h3>Выбрать месяц</h3><div class="budgets-month-list">';
    for (var i = 0; i < months.length; i++) {
        var mk = months[i];
        html += '<button type="button" class="budgets-month-item' + (mk === viewMonth ? ' active' : '') + '" data-action="budgets-month-set" data-month="' + esc(mk) + '">' + formatMonthRu(mk) + '</button>';
    }
    html += '</div>'; showModal(html);
}
function budgetsSetMonth(key) {
    if (!key || key > getCurrentMonthKey()) return;
    state.budgetsViewMonth = key; saveState(); hideModal(); renderBalance(document.getElementById('mainContent'));
}
function openBudgetsEditModal() {
    var viewMonth = state.budgetsViewMonth || getCurrentMonthKey(), isCurrentMonth = (viewMonth === getCurrentMonthKey());
    var html = '<h3>Бюджеты на ' + formatMonthRu(viewMonth) + '</h3><p style="font-size:12px;color:var(--dim);margin:0 0 12px;line-height:1.4;">' + (isCurrentMonth ? 'Оставь поле пустым — бюджета не будет.' : 'Редактирование прошлого месяца.') + '</p><div style="display:flex;flex-direction:column;gap:10px;">';
    for (var i = 0; i < CATEGORIES.length; i++) {
        var cat = CATEGORIES[i], currentLimit = getBudgetForCategory(cat.id, viewMonth), value = (currentLimit !== null) ? String(currentLimit) : '';
        html += '<div style="display:flex;align-items:center;gap:10px;"><span style="width:34px;height:34px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:18px;background:' + cat.color + '33;flex-shrink:0;">' + cat.icon + '</span>' +
            '<span style="flex:1;font-size:14px;color:var(--text);min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + esc(cat.name) + '</span>' +
            '<input type="text" inputmode="decimal" autocomplete="off" data-budget-input="' + esc(cat.id) + '" placeholder="0" value="' + esc(value) + '" style="width:110px;margin:0;padding:10px;font-size:15px;text-align:right;"></div>';
    }
    html += '</div><button type="button" class="btn-full btn-primary" data-action="budgets-save" data-month="' + esc(viewMonth) + '" style="margin-top:16px;">Сохранить</button><button type="button" class="btn-full btn-outline" data-action="close-modal">Отмена</button>';
    showModal(html);
}
function saveBudgetsFromModal(monthKey) {
    if (!monthKey) return;
    var inputs = document.querySelectorAll('[data-budget-input]');
    if (!inputs || inputs.length === 0) { hideModal(); return; }
    for (var i = 0; i < inputs.length; i++) {
        var inp = inputs[i], catId = inp.getAttribute('data-budget-input');
        if (!catId) continue;
        var raw = String(inp.value).replace(/\s/g, '').replace(',', '.').trim(), limit = 0;
        if (raw !== '') { var n = Number(raw); if (!isFinite(n) || n < 0) { alert('Только положительные числа.'); return; } limit = n; }
        setBudgetLimit(catId, limit, monthKey);
    }
    if (state.budgetsViewMonth === null) state.budgetsViewMonth = monthKey;
    saveState(); hideModal(); renderBalance(document.getElementById('mainContent'));
}

/* ============ НАСТРОЙКИ ============ */
function renderSettings(c) {
    c.innerHTML = '<div class="card"><div class="card-title" style="margin-bottom:15px">Управление данными</div>' +
        '<p style="font-size:13px; color:var(--dim); margin:0 0 15px; line-height:1.5;">Все данные хранятся только на этом устройстве. Регулярно делай резервные копии.</p>' +
        '<button type="button" class="btn-full btn-primary" data-action="export">💾 Экспорт (Скачать JSON)</button>' +
        '<button type="button" class="btn-full btn-outline" data-action="import">📥 Импорт (Загрузить JSON)</button>' +
        '<input type="file" id="importFile" accept=".json,application/json">' +
        '<div style="margin-top:20px; border-top:1px solid var(--border); padding-top:15px;"><div class="card-title" style="margin-bottom:10px">Сброс данных</div>' +
        '<button type="button" class="btn-full btn-danger" data-action="reset">Удалить все данные</button></div></div>' +
        '<div class="card"><div class="card-title">О приложении</div><p style="font-size:12px; color:var(--dim); line-height:1.5; margin:8px 0 0;">Finance list<br>Локальное хранилище. Без серверов. Без рекламы.<br>Данные никогда не покидают твоё устройство.</p></div>';
}

function exportData() {
    var json = JSON.stringify(state, null, 2), filename = 'finance_backup_' + new Date().toISOString().slice(0, 10) + '.json';
    try {
        var blob = new Blob([json], { type: 'application/json;charset=utf-8' }), url = URL.createObjectURL(blob);
        var a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); document.body.removeChild(a);
        setTimeout(function () { try { URL.revokeObjectURL(url); } catch (_) {} }, 1500); return;
    } catch (e) { console.warn('[FinanceList] Blob export failed', e); }
    try {
        var dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(json), a2 = document.createElement('a');
        a2.href = dataUri; a2.download = filename; document.body.appendChild(a2); a2.click(); document.body.removeChild(a2);
    } catch (e2) { alert('Экспорт не удался.'); console.log(json); }
}

function importData() {
    var input = document.getElementById('importFile'); if (!input || !input.files || !input.files[0]) return;
    var file = input.files[0], reader = new FileReader();
    reader.onload = function (e) {
        try {
            var imported = JSON.parse(e.target.result);
            if (!imported || typeof imported !== 'object' || imported.balance === undefined) { alert('Ошибка: неверный формат файла.'); return; }
            showConfirm('Заменить все данные?', 'Текущие данные будут полностью заменены.', function () {
                state = migrate(imported); saveState(); switchTab('balance'); alert('Данные восстановлены!');
            }, { danger: true, okLabel: 'Заменить' });
        } catch (err) { alert('Ошибка чтения: ' + err.message); }
    };
    reader.onerror = function () { alert('Не удалось прочитать файл.'); };
    reader.readAsText(file); try { input.value = ''; } catch (_) {}
}

function resetAll() {
    showConfirm('Удалить все данные?', 'Будут удалены: баланс, долги, планы, история, покупки.', function () {
        showConfirm('Последнее предупреждение', 'Точно удалить всё?', function () {
            state = emptyState(); saveState(); switchTab('balance');
        }, { danger: true, okLabel: 'Удалить навсегда', hint: 'Тап мимо окна = отмена' });
    }, { danger: true, okLabel: 'Продолжить' });
}

/* ============ ACTIONS ============ */
var ACTIONS = {
    'op':     function (el) { doOp(Number(el.getAttribute('data-sign'))); },
    'filter': function (el) { setHistoryFilter(el.getAttribute('data-filter')); },
    'cat-pick':   function (el) { pickCategory(el.getAttribute('data-id')); },
    'cat-cancel': function ()   { cancelCategoryPicker(); },
    'open-cat-filter':  function () { openCategoryFilter(); },
    'cat-filter-apply': function () { applyCategoryFilter(); },
    'cat-filter-reset': function () { resetCategoryFilter(); },
    'hist-date-open':  function () { openHistoryDatePicker(); },
    'hist-date-apply': function () { applyHistoryDate(); },
    'hist-date-clear': function () { clearHistoryDate(); },
    'clear-history-search': function () { historySearch = ''; historyViewCount = 50; _animateList = true; renderBalance(document.getElementById('mainContent')); },
    'dp-select': function (el) { datePickerSelect(el.getAttribute('data-prefix'), el.getAttribute('data-kind'), el.getAttribute('data-value')); },
    'history-start-select':  function (el) { startSelectionMode(el.getAttribute('data-id')); },
    'history-toggle-select': function (el) { toggleSelect(el.getAttribute('data-id')); },
    'exit-selection':        function ()   { exitSelectionMode(); },
    'bulk-edit-category':  function ()   { bulkEditCategory(); },
    'bulk-edit-date':      function ()   { bulkEditDate(); },
    'bulk-edit-name':      function ()   { bulkEditName(); },
    'bulk-delete':         function ()   { bulkDelete(); },
    'bulk-apply-category': function (el) { bulkApplyCategory(el.getAttribute('data-id'), el.getAttribute('data-type')); },
    'bulk-apply-date':     function ()   { bulkApplyDate(); },
    'bulk-apply-name':     function ()   { bulkApplyName(); },
    'bulk-apply-delete':   function ()   { bulkApplyDelete(); },
    'edit-cat-pick': function (el) { editPickCategory(el.getAttribute('data-id')); },
    'history-edit':        function (el) { showEditHistoryItem(el.getAttribute('data-id')); },
    'save-edit-history':   function (el) { saveEditedHistory(el.getAttribute('data-id')); },
    'delete-edit-history': function (el) { deleteFromEdit(el.getAttribute('data-id')); },
    'history-del': function (el) { showDeleteHistoryItem(el.getAttribute('data-id'), { refund: false, restore: false }); },
    'history-confirm-del': function (el) { deleteHistoryItem(el.getAttribute('data-id'), el.getAttribute('data-refund') === '1', el.getAttribute('data-restore') === '1'); },
    'tf':           function (el) { setTimeframe(el.getAttribute('data-tf')); },
    'period-open':  function ()   { openPeriodPicker(); },
    'period-apply': function ()   { applyPeriod(); },
    'preset-period': function (el) { applyPeriodPreset(el.getAttribute('data-preset')); },
        'op-date-toggle-remember': function () {
        state.opDateRemembered = !state.opDateRemembered;
        saveState();
        var pin = document.getElementById('opDatePin');
        if (pin) {
            if (state.opDateRemembered) {
                pin.style.background = 'rgba(0,210,255,0.15)';
                pin.style.borderColor = 'var(--blue)';
                pin.style.color = 'var(--blue)';
            } else {
                pin.style.background = 'transparent';
                pin.style.borderColor = 'var(--border)';
                pin.style.color = 'var(--dim)';
                _opSelectedDate = null;
                var lbl = document.getElementById('opDateLabel');
                if (lbl) lbl.textContent = 'Сегодня';
            }
        }
    },
    'chart-prev': function() {
        chartViewOffset += 7;
        var maxOffset = Math.max(0, chartSlotsCache.length - 10);
        chartViewOffset = Math.max(0, Math.min(maxOffset, chartViewOffset));
        var canvas = document.getElementById('chartCanvas');
        if (canvas) drawChart(canvas, chartSlotsCache, chartTfCache, chartViewOffset);
    },
    'chart-next': function() {
        chartViewOffset -= 7;
        var maxOffset = Math.max(0, chartSlotsCache.length - 10);
        chartViewOffset = Math.max(0, Math.min(maxOffset, chartViewOffset));
        var canvas = document.getElementById('chartCanvas');
        if (canvas) drawChart(canvas, chartSlotsCache, chartTfCache, chartViewOffset);
    },
    
    // Аналитика: периоды категорий
    'cat-month-prev': function () { 
        var cur = state.catExpensePeriod || getCurrentMonthKey();
        state.catExpensePeriod = shiftMonthKey(cur, -1); saveState(); renderAnalytics(document.getElementById('mainContent')); 
    },
    'cat-month-next': function () {
        var cur = state.catExpensePeriod || getCurrentMonthKey();
        if (cur >= getCurrentMonthKey()) return;
        state.catExpensePeriod = shiftMonthKey(cur, 1); saveState(); renderAnalytics(document.getElementById('mainContent'));
    },
    'cat-period-open': function () {
        // Упрощенно: пока выбор только по месяцам, но можно расширить до произвольного
        var months = getAllMonthsWithBudgets(), currentKey = getCurrentMonthKey();
        if (months.indexOf(currentKey) === -1) months.push(currentKey);
        months.sort(); months.reverse();
        var viewMonth = state.catExpensePeriod || currentKey;
        var html = '<h3>Период анализа</h3><div class="budgets-month-list">';
        for (var i = 0; i < months.length; i++) {
            var mk = months[i];
            html += '<button type="button" class="budgets-month-item' + (mk === viewMonth ? ' active' : '') + '" data-action="cat-month-set" data-month="' + esc(mk) + '">' + formatMonthRu(mk) + '</button>';
        }
        html += '</div>'; showModal(html);
    },
    'cat-month-set': function (el) {
        state.catExpensePeriod = el.getAttribute('data-month'); saveState(); hideModal(); renderAnalytics(document.getElementById('mainContent'));
    },

    'budgets-toggle':     function ()   { budgetsToggleCollapse(); },
    'budgets-month-prev': function ()   { budgetsShiftMonth(-1); },
    'budgets-month-next': function ()   { budgetsShiftMonth(1); },
    'budgets-month-open': function ()   { openBudgetsMonthPicker(); },
    'budgets-month-set':  function (el) { budgetsSetMonth(el.getAttribute('data-month')); },
    'budgets-edit-open':  function ()   { openBudgetsEditModal(); },
    'budgets-save':       function (el) { saveBudgetsFromModal(el.getAttribute('data-month')); },
    'add-debt':  function ()   { showAddDebt(); },
    'edit-debt': function (el) { editDebt(el.getAttribute('data-id')); },
    'save-debt': function (el) { saveDebt(el.getAttribute('data-id') || null); },
    'pay-debt':  function (el) { showPayDebt(el.getAttribute('data-id')); },
    'del-debt':  function (el) { delDebt(el.getAttribute('data-id')); },
    'add-plan':  function ()   { showAddPlan(); },
    'edit-plan': function (el) { editPlan(el.getAttribute('data-id')); },
    'save-plan': function (el) { savePlan(el.getAttribute('data-id') || null); },
    'move-plan': function (el) { movePlan(el.getAttribute('data-id'), Number(el.getAttribute('data-dir'))); },
    'fund-plan': function (el) { showFundPlan(el.getAttribute('data-id')); },
    'save-fund': function (el) { fundPlan(el.getAttribute('data-id')); },
    'del-plan':  function (el) { delPlan(el.getAttribute('data-id')); },
    'add-shopping':         function ()   { showAddShopping(); },
    'shopping-toggle':      function (el) { toggleShoppingItem(el.getAttribute('data-id')); },
    'del-shopping':         function (el) { delShopping(el.getAttribute('data-id')); },
    'shopping-pick-cat':    function (el) { shoppingPickCat(el.getAttribute('data-id')); },
    'save-shopping':        function (el) { saveShopping(el.getAttribute('data-id') || null); },
    'shopping-convert':     function ()   { shoppingConvert(); },
    'shopping-convert-confirm': function () { shoppingConvertConfirm(); },
    'shopping-deselect':    function ()   { shoppingDeselect(); },
    'export':      function () { exportData(); },
    'import':      function () { var i = document.getElementById('importFile'); if (i) i.click(); },
    'reset':       function () { resetAll(); },
    'close-modal': function () { hideModal(); },
    'confirm-ok':     function () { handleConfirmOk(); },
    'confirm-cancel': function () { handleConfirmCancel(); },
    'debt-quick': function (el) { debtQuickFill(Number(el.getAttribute('data-amount'))); },
    'debt-pay-confirm': function (el) {
        var id = el.getAttribute('data-id'), input = document.getElementById('debtPayAmount');
        hideModal(); payDebt(id, input ? input.value : '');
    },
    'integrity-close': function () { document.getElementById('integrityBanner').style.display = 'none'; },
    'op-date-open': function () { openOpDatePicker(); },
    'op-date-apply': function () { applyOpDate(); }
};

function handleClick(e) {
    var t = e.target; if (!t || typeof t.closest !== 'function') return;
    var el = t.closest('[data-action]'); if (!el) return;
    var fn = ACTIONS[el.getAttribute('data-action')]; if (fn) fn(el);
}

function handleModalChange(e) {
    var t = e.target; if (!t) return;
    if (t.id === 'cbRefund') { handleRefundToggle(!!t.checked); return; }
    if (t.id === 'cbRestoreDebt') { handleRestoreToggle(!!t.checked); return; }
}

function handleMainContentClick(e) {
    var t = e.target; if (!t) return;
    if (t.id === 'chartCanvas') { return; } // Chart logic in drag handlers
    if (typeof t.closest !== 'function') return;
    var el = t.closest('[data-action]'); if (!el) return;
    var action = el.getAttribute('data-action');

    if (action === 'history-edit' && shouldBlockEditClick()) { e.preventDefault(); e.stopPropagation(); return; }
    if (selectionMode && (action === 'history-edit' || action === 'history-toggle-select')) {
        var id = el.getAttribute('data-id'); if (id) toggleSelect(id); return;
    }
    var fn = ACTIONS[action]; if (fn) fn(el);
}

function debtQuickFill(amount) {
    var input = document.getElementById('debtPayAmount'); if (input) input.value = String(amount);
}

function hideChartTooltip() { var tt = document.getElementById('chartTooltip'); if (tt) { tt.style.display = 'none'; tt.innerHTML = ''; } }

function handleChartTap(e, canvas) {
    if (!chartSlotsCache || chartSlotsCache.length === 0) return;
    var rect = canvas.getBoundingClientRect(), tapX = e.clientX - rect.left;
    var PAD_L = 44, PAD_R = 12, chartW = rect.width - PAD_L - PAD_R;
    if (tapX < PAD_L || tapX > PAD_L + chartW) { hideChartTooltip(); return; }
    
    var maxVisible = Math.max(10, Math.floor(chartW / 30));
    var startIdx = Math.max(0, chartSlotsCache.length - maxVisible - chartViewOffset);
    var endIdx = Math.min(chartSlotsCache.length, startIdx + maxVisible);
    var visibleSlots = chartSlotsCache.slice(startIdx, endIdx);
    
    var slotW = chartW / visibleSlots.length, idx = Math.floor((tapX - PAD_L) / slotW);
    if (idx < 0 || idx >= visibleSlots.length) { hideChartTooltip(); return; }
    showChartTooltip(visibleSlots[idx], e.clientX, e.clientY);
}

function showChartTooltip(slot, tapX, tapY) {
    var tt = document.getElementById('chartTooltip'); if (!tt) return;
    var period = formatPeriodFull(slot, chartTfCache), net = slot.income - slot.expense;
    var netSign = net >= 0 ? '+' : '', netClass = net >= 0 ? 'pos' : 'neg';

    tt.innerHTML = '<div class="tt-period">' + esc(period) + '</div>' +
        '<div class="tt-row"><span class="tt-label">Доход</span><span class="tt-value pos">+' + fmt(slot.income) + '</span></div>' +
        '<div class="tt-row"><span class="tt-label">Расход</span><span class="tt-value neg">−' + fmt(slot.expense) + '</span></div>' +
        '<div class="tt-row"><span class="tt-label">Итог</span><span class="tt-value ' + netClass + '">' + netSign + fmt(net) + '</span></div>' +
        '<div class="tt-sep"></div>' +
        '<div class="tt-row"><span class="tt-label">Баланс</span><span class="tt-value">' + fmt(slot.balanceEnd || 0) + '</span></div>' +
        '<div class="tt-row"><span class="tt-label">Операций</span><span class="tt-value">' + slot.ops + '</span></div>';
    tt.style.display = 'block';

    var ttRect = tt.getBoundingClientRect(), vw = window.innerWidth, vh = window.innerHeight, offset = 12;
    var posX = tapX + offset, posY = tapY + offset;
    if (posX + ttRect.width > vw - 8) posX = tapX - ttRect.width - offset; if (posX < 8) posX = 8;
    if (posY + ttRect.height > vh - 8) posY = tapY - ttRect.height - offset; if (posY < 8) posY = 8;
    tt.style.left = posX + 'px'; tt.style.top = posY + 'px';
}

/* ============ INIT & BIND ============ */
function bindEvents() {
    document.getElementById('navTabs').addEventListener('click', function (e) {
        var t = e.target; if (!t || typeof t.closest !== 'function') return;
        var btn = t.closest('.tab-btn'); if (btn) switchTab(btn.getAttribute('data-tab'));
    });

    document.getElementById('filtersBar').addEventListener('click', handleClick);
    var contentEl = document.getElementById('mainContent');
    contentEl.addEventListener('click', handleMainContentClick);
    contentEl.addEventListener('scroll', handleContentScroll, { passive: true });

    document.getElementById('modalOverlay').addEventListener('click', function (e) {
        if (e.target && e.target.id === 'modalOverlay') {
            _pendingOp = null; _shopTempState = null;
            resetDatePickerState('debt'); resetDatePickerState('edit'); resetDatePickerState('bulk'); resetDatePickerState('shop');
            hideModal(); return;
        }
        handleClick(e);
    });
    document.getElementById('modalOverlay').addEventListener('change', handleModalChange);

    document.body.addEventListener('change', function (e) {
        if (e.target && e.target.id === 'importFile') importData();
    });

    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
            if (modalVisible) { _pendingOp = null; _shopTempState = null; hideModal(); }
            else if (selectionMode) exitSelectionMode();
            else if (shoppingSelected.length > 0) shoppingDeselect();
            else hideChartTooltip();
        }
    });

    window.addEventListener('resize', function () {
        if (currentTab === 'analytics') {
            var canvas = document.getElementById('chartCanvas');
            if (canvas && chartSlotsCache && chartSlotsCache.length > 0) drawChart(canvas, chartSlotsCache, chartTfCache, chartViewOffset);
        }
    });

    document.addEventListener('click', function (e) {
        var t = e.target; if (!t) return;
        if (t.id === 'chartCanvas') { handleChartTap(e, t); return; }
        if (t.closest && t.closest('.chart-tooltip')) return;
        hideChartTooltip();
    });
}

function bindExtraEvents() {
    document.addEventListener('click', spawnRipple, { passive: true });
    window.addEventListener('popstate', function () {
        if (modalVisible) { _modalHistoryPushed = false; _hideModalInternal(); }
    });
}

function init() {
    try {
        loadState();
        renderHeader();
        bindEvents();
        bindExtraEvents();
        switchTab('balance');
        setTimeout(function() {
            var expected = (state.initialBalance || 0);
            for (var i = 0; i < state.history.length; i++) expected += state.history[i].amount;
            var diff = state.balance - expected;
            if (Math.abs(diff) > 0.5) {
                document.getElementById('integrityDiff').textContent = 'Ожидалось: ' + fmt(expected) + ' · Фактически: ' + fmt(state.balance) + ' · Расхождение: ' + fmt(diff);
                document.getElementById('integrityBanner').style.display = 'flex';
            }
        }, 100);
    } catch (e) {
        var screen = document.getElementById('errScreen');
        screen.textContent = 'INIT ERROR:\n' + (e && e.stack ? e.stack : String(e));
        screen.style.display = 'block';
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}