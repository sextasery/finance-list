'use strict';
(function installErrorScreen() {
    var screen = document.getElementById('errScreen');
    var shown = false;
    function show(msg) { if (shown) return; shown = true; screen.textContent = msg; screen.style.display = 'block'; }
    window.addEventListener('error', function(e) { show('ERROR: ' + (e.message || 'unknown') + '\n' + (e.error && e.error.stack ? e.error.stack : '')); });
    window.addEventListener('unhandledrejection', function(e) { show('UNHANDLED PROMISE:\n' + (e.reason && e.reason.stack ? e.reason.stack : String(e.reason))); });
})();

var STORAGE_KEY = 'fin_shield_v8';
var HISTORY_LIMIT = 5000;
var STATE_VERSION = 8;
var TYPE = { INCOME: 'income', EXPENSE: 'expense' };
var FILTERS = [ { id: 'all', label: 'Все' }, { id: TYPE.INCOME, label: 'Доходы' }, { id: TYPE.EXPENSE, label: 'Расходы' } ];
var DEBT_RETURN_PREFIX = 'Возврат: ';
var CATEGORIES = [
    { id: 'food', name: 'Еда', icon: '🍕', cssClass: 'food', color: '#ff9f43' },
    { id: 'things', name: 'Вещи', icon: '👕', cssClass: 'things', color: '#ff6b9d' },
    { id: 'housing', name: 'Жильё', icon: '🏠', cssClass: 'housing', color: '#26de81' },
    { id: 'transport', name: 'Проезд', icon: '🚌', cssClass: 'transport', color: '#45aaf2' },
    { id: 'pharmacy', name: 'Аптека', icon: '🏥', cssClass: 'pharmacy', color: '#00d26a' },
    { id: 'alcohol', name: 'Алкоголь', icon: '🍷', cssClass: 'alcohol', color: '#f7b731' },
    { id: 'sigi', name: 'Сиги', icon: '🚬', cssClass: 'sigi', color: '#ff783c' },
    { id: 'weed', name: 'Трава', icon: '🌿', cssClass: 'weed', color: '#20bf6b' },
    { id: 'gaba', name: 'Габа', icon: '💊', cssClass: 'gaba', color: '#b8a55e' },
    { id: 'synth', name: 'Синтетика', icon: '❄️', cssClass: 'synth', color: '#5b8dff' },
    { id: 'drugs', name: 'Наркотики', icon: '💉', cssClass: 'drugs', color: '#c56cf0' },
    { id: 'tariffs', name: 'Тарифы', icon: '📱', cssClass: 'tariffs', color: '#a55eea' },
    { id: 'other', name: 'Прочее', icon: '💸', cssClass: 'other', color: '#778ca3' }
];
var CATEGORIES_INCOME = [
    { id: 'salary', name: 'Зарплата', icon: '💰', cssClass: 'salary', color: '#00d26a' },
    { id: 'grandma', name: 'Бабушка', icon: '👵', cssClass: 'grandma', color: '#4ade80' },
    { id: 'other-income', name: 'Прочее', icon: '💵', cssClass: 'other-income', color: '#86efac' }
];
var DEFAULT_CATEGORY_ID = 'other';
var DEFAULT_INCOME_CATEGORY_ID = 'other-income';
var TIMEFRAMES = [
    { id: 'D1', label: 'День', days: 30, unit: 'day' },
    { id: 'W1', label: 'Неделя', days: 84, unit: 'week' },
    { id: 'M1', label: 'Месяц', days: 365, unit: 'month' },
    { id: 'M3', label: 'Квартал', days: 730, unit: 'q' },
    { id: 'Y1', label: 'Год', days: 1826, unit: 'year' }
];
var MONTHS_SHORT = ['янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек'];
var MONTHS_FULL = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];

/* ============ УТИЛИТЫ ============ */
var ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
function esc(s) { if (s === null || s === undefined) return ''; return String(s).replace(/[&<>"']/g, function(c) { return ESC_MAP[c]; }); }
function fmt(num) { var n = (typeof num === 'number' && isFinite(num)) ? Math.round(num) : 0; try { return n.toLocaleString('ru-RU') + ' ₽'; } catch(_) { return n + ' ₽'; } }
function fmtShort(num) { var n = Math.round(num); var abs = Math.abs(n); if (abs >= 1000000) return (n / 1000000).toFixed(1) + 'М'; if (abs >= 1000) return (n / 1000).toFixed(1) + 'К'; return String(n); }
function uid() { try { if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID(); } catch(_) {} return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10); }
function parseAmount(raw) { if (raw === null || raw === undefined) return null; var s = String(raw).replace(/\s/g, '').replace(',', '.').trim(); if (!s) return null; var n = Number(s); return (isFinite(n) && n > 0) ? n : null; }

/* ============ ДАТЫ ============ */
function dateToParts(iso) { var d = new Date(iso); if (isNaN(d.getTime())) d = new Date(); return { day: d.getDate(), month: d.getMonth() + 1, year: d.getFullYear() }; }
function partsToIso(day, month, year, sourceIso) { var src = sourceIso ? new Date(sourceIso) : new Date(); if (isNaN(src.getTime())) src = new Date(); return new Date(parseInt(year,10), parseInt(month,10)-1, parseInt(day,10), src.getHours(), src.getMinutes()).toISOString(); }
function getYearRange() { var now = new Date().getFullYear(); var arr = []; for (var y = now - 5; y <= now + 1; y++) arr.push(y); return arr; }
function daysInMonth(m, y) { return new Date(parseInt(y,10), parseInt(m,10), 0).getDate(); }
function formatDateTime(iso) { var d = new Date(iso); if (isNaN(d.getTime())) return ''; try { return d.toLocaleDateString('ru-RU') + ' ' + d.toLocaleTimeString('ru-RU', {hour:'2-digit', minute:'2-digit'}); } catch(_) { return d.toString(); } }
function formatDate(iso) { var d = new Date(iso); if (isNaN(d.getTime())) return ''; try { return d.toLocaleDateString('ru-RU'); } catch(_) { return d.toDateString(); } }
function formatTimeFromIso(iso) { var d = new Date(iso); if (isNaN(d.getTime())) d = new Date(); var hh = d.getHours(); var mm = d.getMinutes(); return (hh<10?'0'+hh:hh) + ':' + (mm<10?'0'+mm:mm); }
function applyTimeToIso(iso, timeStr) { if (!timeStr) return iso; var m = String(timeStr).trim().match(/^(\d{1,2})[:.\s]?(\d{0,2})$/); if (!m) return iso; var hh = parseInt(m[1],10); var mm = m[2] ? parseInt(m[2],10) : 0; if (hh>23||mm>59) return iso; var d = new Date(iso); d.setHours(hh, mm, 0, 0); return d.toISOString(); }
function getMonthKey(iso) { var d = new Date(iso); if (isNaN(d.getTime())) return ''; var y = d.getFullYear(); var m = d.getMonth()+1; return y + '-' + (m<10?'0'+m:m); }
function getCurrentMonthKey() { return getMonthKey(new Date().toISOString()); }
function formatMonthRu(key) { if (!key) return ''; var p = key.split('-'); var y = parseInt(p[0],10); var m = parseInt(p[1],10); if (isNaN(y)||isNaN(m)||m<1||m>12) return key; return MONTHS_FULL[m-1] + ' ' + y; }

/* ============ КАТЕГОРИИ ============ */
function getCategory(id) { for (var i=0; i<CATEGORIES.length; i++) if (CATEGORIES[i].id===id) return CATEGORIES[i]; return null; }
function getIncomeCategory(id) { for (var i=0; i<CATEGORIES_INCOME.length; i++) if (CATEGORIES_INCOME[i].id===id) return CATEGORIES_INCOME[i]; return null; }
function getCategoryAny(id) { return getCategory(id) || getIncomeCategory(id); }
function getCategoriesByType(type) { return (type===TYPE.INCOME) ? CATEGORIES_INCOME : CATEGORIES; }

/* ============ СОСТОЯНИЕ ============ */
function emptyState() { return { version: STATE_VERSION, balance: 0, debts: [], plans: [], history: [], shopping: [], tf: 'D1', budgets: [], budgetsCollapsed: false, budgetsViewMonth: null, periodFrom: null, periodTo: null }; }
var state = emptyState();
var currentTab = 'balance';
var historyFilter = 'all';
var historySearch = '';
var historyCatFilter = [];
var historyDateFrom = null;
var historyDateTo = null;
var historyViewCount = 50;
var selectionMode = false;
var selectedIds = [];
var _flashId = null;
var _animateList = false;
var shoppingSelected = [];

/* ============ PERSISTENCE ============ */
var storageAvailable = true;
try { var _t='fs_test'; localStorage.setItem(_t,'1'); localStorage.removeItem(_t); } catch(e) { storageAvailable = false; }

function loadState() {
    if (!storageAvailable) return;
    try {
        var raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) { var old = localStorage.getItem('fin_shield_v7'); if (old) raw = old; }
        if (!raw) return;
        state = migrate(JSON.parse(raw));
    } catch(e) { console.error('[FS] load error:', e); state = emptyState(); }
}

function migrate(raw) {
    if (!raw || typeof raw !== 'object') return emptyState();
    var s = emptyState();
    s.balance = (typeof raw.balance==='number' && isFinite(raw.balance)) ? raw.balance : 0;
    s.debts = Array.isArray(raw.debts) ? raw.debts.filter(isValidDebt) : [];
    s.plans = Array.isArray(raw.plans) ? raw.plans.filter(isValidPlan) : [];
    s.history = Array.isArray(raw.history) ? raw.history.filter(isValidHistory) : [];
    s.shopping = Array.isArray(raw.shopping) ? raw.shopping.filter(isValidShopping) : [];
    s.tf = isValidTf(raw.tf) ? raw.tf : 'D1';
    s.budgets = Array.isArray(raw.budgets) ? raw.budgets.filter(isValidBudget) : [];
    s.budgetsCollapsed = !!raw.budgetsCollapsed;
    s.budgetsViewMonth = (typeof raw.budgetsViewMonth==='string') ? raw.budgetsViewMonth : null;
    s.periodFrom = raw.periodFrom || null;
    s.periodTo = raw.periodTo || null;
    for (var i=0; i<s.history.length; i++) {
        var h = s.history[i];
        if (!h.id) h.id = uid();
        if (h.categoryId === 'fun') h.categoryId = 'other';
        if (h.type === TYPE.EXPENSE && !h.categoryId) h.categoryId = DEFAULT_CATEGORY_ID;
        if (h.type === TYPE.INCOME && !h.categoryId) h.categoryId = DEFAULT_INCOME_CATEGORY_ID;
        if (h.type === 'transfer') { h.type = TYPE.EXPENSE; if (!h.categoryId) h.categoryId = 'other'; }
    }
    for (var j=0; j<s.shopping.length; j++) { var it=s.shopping[j]; if (!it.id) it.id=uid(); if (!it.categoryId) it.categoryId=DEFAULT_CATEGORY_ID; }
    return s;
}

function isValidTf(id) { for(var i=0;i<TIMEFRAMES.length;i++) if(TIMEFRAMES[i].id===id) return true; return false; }
function isValidDebt(d) { return d && typeof d.to==='string' && typeof d.amount==='number' && isFinite(d.amount) && d.id!=null; }
function isValidPlan(p) { return p && typeof p.name==='string' && typeof p.target==='number' && isFinite(p.target) && typeof p.current==='number' && isFinite(p.current) && p.id!=null; }
function isValidHistory(h) { return h && typeof h.date==='string' && typeof h.amount==='number' && isFinite(h.amount); }
function isValidBudget(b) { return b && typeof b.categoryId==='string' && typeof b.limit==='number' && isFinite(b.limit) && b.limit>0 && typeof b.month==='string' && /^\d{4}-\d{2}$/.test(b.month); }
function isValidShopping(it) { return it && typeof it.name==='string' && it.name.length>0 && it.id!=null; }

function saveState() {
    if (state.history.length > HISTORY_LIMIT) state.history.length = HISTORY_LIMIT;
    if (!storageAvailable) { renderHeader(); return; }
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch(e) { console.error('[FS] save error:', e); }
    renderHeader();
}

/* ============ TOAST SYSTEM ============ */
function showToast(msg) {
    var container = document.getElementById('toastContainer');
    if (!container) { container = document.createElement('div'); container.id = 'toastContainer'; container.className = 'toast-container'; document.body.appendChild(container); }
    var toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = msg;
    container.appendChild(toast);
    requestAnimationFrame(() => { requestAnimationFrame(() => { toast.classList.add('show'); }); });
    setTimeout(() => { toast.classList.remove('show'); setTimeout(() => { if(toast.parentNode) toast.parentNode.removeChild(toast); }, 300); }, 1000);
}

/* ============ HEADER & ANIMATION ============ */
var _numAnimFrames = {};
function animateNumber(el, toValue, duration) {
    if (!el) return;
    duration = duration || 425;
    var key = el.id || 'default';
    if (_numAnimFrames[key]) cancelAnimationFrame(_numAnimFrames[key]);
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
    var balEl = document.getElementById('totalBalance');
    var debtEl = document.getElementById('totalDebt');
    var planEl = document.getElementById('totalPlans');
    var debtSum = 0; for(var i=0;i<state.debts.length;i++) debtSum += state.debts[i].amount;
    var planSum = 0; for(var j=0;j<state.plans.length;j++) planSum += state.plans[j].current;
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

/* ============ TABS & SWIPES ============ */
function switchTab(tab, noScroll) {
    currentTab = tab;
    if (selectionMode) { selectionMode = false; selectedIds = []; }
    shoppingSelected = [];
    var tabs = document.querySelectorAll('.tab-btn');
    for (var i=0; i<tabs.length; i++) { if(tabs[i].getAttribute('data-tab')===tab) tabs[i].classList.add('active'); else tabs[i].classList.remove('active'); }
    var panes = document.querySelectorAll('.tab-pane');
    var targetPane = null;
    for (var p=0; p<panes.length; p++) {
        if (panes[p].id === 'pane-' + tab) { targetPane = panes[p]; panes[p].classList.add('active'); }
        else panes[p].classList.remove('active');
    }
    if (!noScroll && targetPane) {
        var swipeContainer = document.querySelector('.swipe-container');
        if (swipeContainer) swipeContainer.scrollTo({ left: targetPane.offsetLeft, behavior: 'smooth' });
    }
    if (targetPane) {
        targetPane.innerHTML = '';
        if (tab === 'balance') renderBalance(targetPane);
        else if (tab === 'debts') renderDebts(targetPane);
        else if (tab === 'plans') renderPlans(targetPane);
        else if (tab === 'shopping') renderShopping(targetPane);
        else if (tab === 'analytics') renderAnalytics(targetPane);
        else if (tab === 'settings') renderSettings(targetPane);
    }
}

function initSwipeTabs() {
    var container = document.querySelector('.swipe-container');
    if (!container) return;
    var startX = 0, startY = 0, isSwiping = false;
    var tabIds = ['balance', 'debts', 'plans', 'shopping', 'analytics', 'settings'];
    container.addEventListener('touchstart', function(e) { startX = e.touches[0].clientX; startY = e.touches[0].clientY; isSwiping = false; }, {passive: true});
    container.addEventListener('touchmove', function(e) {
        if (!startX) return;
        var dx = e.touches[0].clientX - startX;
        var dy = e.touches[0].clientY - startY;
        if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 10) { isSwiping = true; e.preventDefault(); }
    }, {passive: false});
    container.addEventListener('touchend', function(e) {
        if (!isSwiping) return;
        var dx = e.changedTouches[0].clientX - startX;
        var idx = tabIds.indexOf(currentTab);
        if (dx < -50 && idx < tabIds.length - 1) switchTab(tabIds[idx+1]);
        else if (dx > 50 && idx > 0) switchTab(tabIds[idx-1]);
        startX = 0; isSwiping = false;
    });
}

/* ============ DATE PICKER (SWIPE STYLE) ============ */
function buildSwipeDatePicker(prefix, iso) {
    var st = dateToParts(iso);
    var years = getYearRange();
    var maxDay = daysInMonth(st.month, st.year);
    if (st.day > maxDay) st.day = maxDay;
    var dayHtml = '', monthHtml = '', yearHtml = '';
    for (var d=1; d<=maxDay; d++) dayHtml += '<div class="dp-cell' + (d===st.day?' active':'') + '" data-dp="' + prefix + '" data-kind="day" data-val="' + d + '">' + d + '</div>';
    for (var m=1; m<=12; m++) monthHtml += '<div class="dp-cell' + (m===st.month?' active':'') + '" data-dp="' + prefix + '" data-kind="month" data-val="' + m + '">' + MONTHS_FULL[m-1] + '</div>';
    for (var y=0; y<years.length; y++) yearHtml += '<div class="dp-cell' + (years[y]===st.year?' active':'') + '" data-dp="' + prefix + '" data-kind="year" data-val="' + years[y] + '">' + years[y] + '</div>';
    return '<div class="date-picker-swipe">' +
        '<div class="dp-col"><div class="dp-label">День</div><div class="dp-scroll" id="dp-scroll-day-' + prefix + '">' + dayHtml + '</div></div>' +
        '<div class="dp-col"><div class="dp-label">Месяц</div><div class="dp-scroll" id="dp-scroll-month-' + prefix + '">' + monthHtml + '</div></div>' +
        '<div class="dp-col"><div class="dp-label">Год</div><div class="dp-scroll" id="dp-scroll-year-' + prefix + '">' + yearHtml + '</div></div>' +
    '</div>';
}

function scrollToActiveDP(prefix) {
    ['day','month','year'].forEach(function(kind) {
        var scroll = document.getElementById('dp-scroll-' + kind + '-' + prefix);
        if (!scroll) return;
        var active = scroll.querySelector('.dp-cell.active');
        if (active) active.scrollIntoView({block: 'center', behavior: 'auto'});
    });
}

function handleDPSelect(prefix, kind, val) {
    var scroll = document.getElementById('dp-scroll-' + kind + '-' + prefix);
    if (!scroll) return;
    scroll.querySelectorAll('.dp-cell').forEach(function(c){ c.classList.remove('active'); });
    var target = scroll.querySelector('[data-val="' + val + '"]');
    if (target) { target.classList.add('active'); target.scrollIntoView({block: 'center', behavior: 'smooth'}); }
    if (kind !== 'day') {
        var dayScroll = document.getElementById('dp-scroll-day-' + prefix);
        if (dayScroll) {
            var activeMonth = scroll.querySelector('.dp-cell.active');
            var activeYear = document.getElementById('dp-scroll-year-' + prefix).querySelector('.dp-cell.active');
            if (activeMonth && activeYear) {
                var m = parseInt(activeMonth.getAttribute('data-val'), 10);
                var y = parseInt(activeYear.getAttribute('data-val'), 10);
                var maxD = daysInMonth(m, y);
                var curDay = parseInt(dayScroll.querySelector('.dp-cell.active')?.getAttribute('data-val') || 1, 10);
                if (curDay > maxD) curDay = maxD;
                var newDays = '';
                for(var d=1; d<=maxD; d++) newDays += '<div class="dp-cell' + (d===curDay?' active':'') + '" data-dp="' + prefix + '" data-kind="day" data-val="' + d + '">' + d + '</div>';
                dayScroll.innerHTML = newDays;
                scrollToActiveDP(prefix);
            }
        }
    }
}

function readSwipeDate(prefix, sourceIso) {
    var dayEl = document.querySelector('#dp-scroll-day-' + prefix + ' .dp-cell.active');
    var monthEl = document.querySelector('#dp-scroll-month-' + prefix + ' .dp-cell.active');
    var yearEl = document.querySelector('#dp-scroll-year-' + prefix + ' .dp-cell.active');
    if (!dayEl || !monthEl || !yearEl) return sourceIso;
    return partsToIso(parseInt(dayEl.getAttribute('data-val'),10), parseInt(monthEl.getAttribute('data-val'),10), parseInt(yearEl.getAttribute('data-val'),10), sourceIso);
}

/* ============ AUTOCOMPLETE ============ */
function getAutocompleteSuggestions(inputId, type) {
    var input = document.getElementById(inputId);
    if (!input) return;
    var val = input.value.trim().toLowerCase();
    var list = document.getElementById('ac-list-' + inputId);
    if (!list) { list = document.createElement('div'); list.id = 'ac-list-' + inputId; list.className = 'autocomplete-list'; input.parentNode.style.position = 'relative'; input.parentNode.appendChild(list); }
    if (!val || val.length < 1) { list.classList.remove('visible'); return; }
    var now = Date.now();
    var threeMonthsAgo = now - (90 * 24 * 60 * 60 * 1000);
    var freqMap = {};
    for (var i=0; i<state.history.length; i++) {
        var h = state.history[i];
        var desc = (h.desc || '').toLowerCase();
        if ((type === 'expense' && h.amount < 0) || (type === 'income' && h.amount > 0)) {
            if (!freqMap[desc]) freqMap[desc] = { count: 0, recent: 0 };
            freqMap[desc].count++;
            if (new Date(h.date).getTime() > threeMonthsAgo) freqMap[desc].recent++;
        }
    }
    var suggestions = Object.keys(freqMap)
        .filter(function(k) { return k.indexOf(val) === 0 && k !== val; })
        .map(function(k) { return { text: k, score: (freqMap[k].recent * 2) + freqMap[k].count }; })
        .sort(function(a,b) { return b.score - a.score; })
        .slice(0, 5);
    if (suggestions.length === 0) { list.classList.remove('visible'); return; }
    list.innerHTML = suggestions.map(function(s) {
        return '<div class="ac-item" data-ac-val="' + esc(s.text) + '"><span>' + esc(s.text) + '</span><span class="ac-freq">' + s.score + '</span></div>';
    }).join('');
    list.classList.add('visible');
}

function attachAutocomplete(inputId, type) {
    var input = document.getElementById(inputId);
    if (!input) return;
    input.addEventListener('input', function() { getAutocompleteSuggestions(inputId, type); });
    input.addEventListener('focus', function() { if(input.value.trim()) getAutocompleteSuggestions(inputId, type); });
    document.addEventListener('click', function(e) {
        var list = document.getElementById('ac-list-' + inputId);
        if (list && !list.contains(e.target) && e.target !== input) list.classList.remove('visible');
    });
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
        filtered = filtered.filter(function (h) { var ts = new Date(h.date).getTime(); return ts >= fromTs && ts <= toTs; });
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
    filtered = filtered.slice().sort(function (a, b) { return new Date(b.date).getTime() - new Date(a.date).getTime(); });
    return filtered;
}

/* ============ BALANCE TAB ============ */
function renderBalance(c) {
    var savedScroll = c.scrollTop;
    var formHtml = '<div class="card">' +
        '<div class="card-title" style="margin-bottom:10px">Операция с остатком</div>' +
        '<div style="position:relative;"><input type="text" id="opAmount" placeholder="Сумма" inputmode="decimal" autocomplete="off"><div class="autocomplete-list" id="ac-list-opAmount"></div></div>' +
        '<div style="position:relative;"><input type="text" id="opDesc" placeholder="Название" autocomplete="off"><div class="autocomplete-list" id="ac-list-opDesc"></div></div>' +
        '<input type="text" id="opTime" placeholder="Время (ЧЧ:ММ)" autocomplete="off" value="' + formatTimeFromIso(new Date().toISOString()) + '">' +
        '<div class="field-label">Дата операции</div>' +
        buildSwipeDatePicker('op', new Date().toISOString()) +
        '<div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">' +
            '<button type="button" class="btn-full btn-primary" data-action="op" data-sign="1">+ Пополнить</button>' +
            '<button type="button" class="btn-full btn-danger" data-action="op" data-sign="-1">− Списать</button>' +
        '</div>' +
    '</div>';
    
    var filtered = getFilteredHistory();
    var total = filtered.length;
    var visible = Math.min(historyViewCount, total);
    var filterActive = historyCatFilter.length > 0;
    var hasSearch = historySearch.length > 0;
    
    var toolsHtml = '<div class="history-tools">' +
        '<div class="history-search-wrap' + (hasSearch?' has-value':'') + '">' +
            '<input type="text" class="history-search" id="historySearch" placeholder="Поиск по истории" autocomplete="off" value="' + esc(historySearch) + '">' +
            '<button type="button" class="history-search-clear" data-action="clear-history-search">✕</button>' +
        '</div>' +
    '</div>' +
    '<div class="history-tools" style="margin-top:-4px;">' +
        '<button type="button" class="history-cat-btn' + (filterActive?' active':'') + '" data-action="open-cat-filter">🏷 ' + (filterActive ? 'Категории: '+historyCatFilter.length : 'Категории') + '</button>' +
    '</div>';
    
    var selBar = '';
    if (selectionMode && selectedIds.length > 0) {
        selBar = '<div class="selection-bar"><span class="sb-count">Выбрано: ' + selectedIds.length + '</span>' +
            '<button type="button" data-action="bulk-edit-category">🏷️ Категория</button>' +
            '<button type="button" data-action="bulk-edit-date">📅 Дата</button>' +
            '<button type="button" data-action="bulk-edit-name">✏️ Название</button>' +
            '<button type="button" class="danger" data-action="bulk-delete">🗑️ Удалить</button>' +
            '<button type="button" data-action="exit-selection">Отмена</button></div>';
    }
    
    var histHtml = '<div class="card"><div class="card-title history-card-title">История операций</div>' + toolsHtml + selBar;
    if (total === 0) histHtml += '<div class="empty-state">' + (hasSearch||filterActive ? 'Ничего не найдено' : 'Нет записей<br>Начни с пополнения баланса') + '</div>';
    else {
        histHtml += '<div id="historyList">';
        for (var k=0; k<visible; k++) histHtml += renderHistoryItem(filtered[k]);
        histHtml += '</div>';
        if (total > visible) histHtml += '<div class="history-load-more" id="historyLoadMore">Показано ' + visible + ' из ' + total + ' — прокрути вниз</div>';
    }
    
    var now = new Date();
    var startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    var income=0, expense=0;
    for(var m=0;m<state.history.length;m++) {
        var rec=state.history[m]; var d=new Date(rec.date);
        if(isNaN(d.getTime())||d<startOfMonth) continue;
        if(rec.type===TYPE.INCOME) income+=rec.amount;
        else if(rec.type===TYPE.EXPENSE) expense+=Math.abs(rec.amount);
    }
    histHtml += '<div class="summary-box"><span>Доходы за месяц: <span class="summary-val" style="color:var(--green)">' + fmt(income) + '</span></span><span>Расходы за месяц: <span class="summary-val" style="color:var(--red)">' + fmt(expense) + '</span></span></div></div>';
    
    c.innerHTML = formHtml + buildBudgetsBlockHtml() + histHtml;
    c.scrollTop = savedScroll;
    
    attachAutocomplete('opAmount', 'expense');
    attachAutocomplete('opDesc', 'expense');
    scrollToActiveDP('op');
    
    var searchEl = document.getElementById('historySearch');
    if (searchEl) searchEl.addEventListener('input', handleHistorySearch);
    attachLongPressHandlers();
}

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
        if (el) { el.focus(); try { el.setSelectionRange(el.value.length, el.value.length); } catch (_) {} }
    }, 200);
}

function renderHistoryItem(h) {
    var isPos = h.amount > 0;
    var color = isPos ? 'var(--green)' : 'var(--red)';
    var sign = isPos ? '+' : '';
    var catLine = '';
    if (h.categoryId) {
        var cat = getCategoryAny(h.categoryId);
        if (cat) catLine = '<div class="item-cat-line"><span class="cat-badge ' + cat.cssClass + '">' + cat.icon + ' ' + esc(cat.name) + '</span></div>';
    }
    var isSelected = selectedIds.indexOf(h.id) !== -1;
    if (selectionMode) {
        return '<div class="list-item selectable' + (isSelected?' selected':'') + '" data-action="history-toggle-select" data-id="' + esc(h.id) + '">' +
            '<div class="select-checkbox">✓</div>' +
            '<div class="item-left"><div class="item-name"><span class="item-desc">' + (esc(h.desc)||'Без названия') + '</span></div>' + catLine + '<div class="item-sub">' + formatDateTime(h.date) + '</div></div>' +
            '<div class="item-right"><div class="item-amount" style="color:' + color + '">' + sign + fmt(h.amount) + '</div></div></div>';
    }
    return '<div class="list-item tappable" data-action="history-edit" data-id="' + esc(h.id) + '" data-longpress="history-start-select">' +
        '<div class="item-left"><div class="item-name"><span class="item-desc">' + (esc(h.desc)||'Без названия') + '</span></div>' + catLine + '<div class="item-sub">' + formatDateTime(h.date) + '</div></div>' +
        '<div class="item-right"><div class="item-amount" style="color:' + color + '">' + sign + fmt(h.amount) + '</div><button type="button" class="history-del-btn" data-action="history-del" data-id="' + esc(h.id) + '">✕</button></div></div>';
}

/* ============ OPERATIONS ============ */
var _pendingOp = null;
function doOp(sign) {
    var amtInput = document.getElementById('opAmount');
    var descInput = document.getElementById('opDesc');
    var timeInput = document.getElementById('opTime');
    if (!amtInput || !descInput) return;
    var amt = parseAmount(amtInput.value);
    if (amt === null) { try { amtInput.focus(); } catch(_) {} return; }
    var desc = descInput.value.trim();
    var timeStr = timeInput ? timeInput.value.trim() : '';
    var dateIso = readSwipeDate('op', new Date().toISOString());
    if (timeStr) dateIso = applyTimeToIso(dateIso, timeStr);
    var opType = (sign > 0) ? TYPE.INCOME : TYPE.EXPENSE;
    showCategoryPicker(amt, desc, opType, null, dateIso);
}

function showCategoryPicker(amt, desc, opType, preselectId, dateIso) {
    _pendingOp = { amt: amt, desc: desc, opType: opType, catId: preselectId||null, dateIso: dateIso||new Date().toISOString() };
    var list = getCategoriesByType(opType);
    var isIncome = (opType === TYPE.INCOME);
    var title = isIncome ? 'Откуда пришло?' : 'Куда потратил?';
    var amountStr = (isIncome?'+':'−') + fmt(amt);
    var amountColor = isIncome ? 'var(--green)' : 'var(--red)';
    var buttonsHtml = '';
    for (var i=0; i<list.length; i++) {
        var cat = list[i];
        var active = (preselectId===cat.id) ? ' active' : '';
        buttonsHtml += '<button type="button" class="cat-btn' + active + '" data-action="cat-pick" data-id="' + esc(cat.id) + '"><span class="cat-icon">' + cat.icon + '</span><span>' + esc(cat.name) + '</span></button>';
    }
    showModal('<h3>' + title + '</h3><div class="cat-amount" style="color:' + amountColor + '">' + amountStr + '</div>' + (desc?'<div class="cat-desc">'+esc(desc)+'</div>':'') + '<div class="cat-list">' + buttonsHtml + '</div><button type="button" class="btn-full btn-outline" data-action="cat-cancel">Отмена</button>');
}

function pickCategory(catId) {
    if (!_pendingOp) return;
    var op = _pendingOp; _pendingOp = null; hideModal();
    var sign = (op.opType===TYPE.INCOME) ? 1 : -1;
    applyOp(sign, op.amt, op.desc, catId, op.dateIso);
}

function cancelCategoryPicker() {
    _pendingOp = null;
    hideModal();
    var amtInput = document.getElementById('opAmount');
    if (amtInput) { try { amtInput.focus(); } catch (_) {} }
}

function applyOp(sign, amt, desc, categoryId, dateIso) {
    var delta = amt * sign;
    if (sign < 0 && state.balance + delta < 0) {
        showConfirm('Баланс станет отрицательным', 'После операции остаток: ' + fmt(state.balance + delta) + '. Продолжить?', function() { commitOp(sign, amt, desc, categoryId, delta, dateIso); }, {danger:true, okLabel:'Всё равно списать'});
        return;
    }
    commitOp(sign, amt, desc, categoryId, delta, dateIso);
}

function commitOp(sign, amt, desc, categoryId, delta, dateIso) {
    state.balance += delta;
    var record = { id: uid(), date: dateIso || new Date().toISOString(), type: sign>0?TYPE.INCOME:TYPE.EXPENSE, desc: desc, amount: delta };
    if (categoryId) record.categoryId = categoryId;
    state.history.unshift(record);
    _flashId = record.id;
    saveState();
    hideModal();
    renderBalance(document.getElementById('pane-balance'));
    showToast('Операция сохранена');
}

/* ============ DEBTS ============ */
function renderDebts(c) {
    var html = '<div class="card"><div class="card-header"><div class="card-title">Кому я должен</div><button type="button" class="btn-icon" data-action="add-debt">+</button></div>';
    if (state.debts.length === 0) html += '<div class="empty-state">Долгов нет 🎉</div>';
    else {
        var sorted = state.debts.slice().sort(function (a, b) { return new Date(a.createdAt || 0) - new Date(b.createdAt || 0); });
        for (var i = 0; i < sorted.length; i++) {
            var d = sorted[i];
            html += '<div class="list-item"><div class="item-left"><div class="item-name">' + esc(d.to) + '</div><div class="item-sub">Взял: ' + formatDate(d.createdAt) + '</div></div>' +
                '<div class="item-right"><div class="item-amount" style="color:var(--red)">' + fmt(d.amount) + '</div><div class="item-actions">' +
                '<button type="button" class="mini-btn pay" data-action="pay-debt" data-id="' + esc(d.id) + '">Вернул</button>' +
                '<button type="button" class="mini-btn edit" data-action="edit-debt" data-id="' + esc(d.id) + '">✏️</button>' +
                '<button type="button" class="mini-btn del" data-action="del-debt" data-id="' + esc(d.id) + '">✕</button></div></div></div>';
        }
    }
    html += '</div>';
    c.innerHTML = html;
}

function showAddDebt(existingId) {
    var d = (existingId != null) ? state.debts.filter(function (x) { return x.id === existingId; })[0] : null;
    var dateIso = d ? d.createdAt : new Date().toISOString();
    showModal('<h3>' + (d ? 'Изменить долг' : 'Новый долг') + '</h3>' +
        '<input type="text" id="debtTo" placeholder="Кому (Имя)" autocomplete="off" value="' + esc(d ? d.to : '') + '">' +
        '<input type="text" id="debtAmt" placeholder="Сумма" inputmode="decimal" autocomplete="off" value="' + (d ? d.amount : '') + '">' +
        '<div class="field-label">Когда взял</div>' + buildSwipeDatePicker('debt', dateIso) +
        '<button type="button" class="btn-full btn-primary" data-action="save-debt" data-id="' + (existingId != null ? esc(existingId) : '') + '">' + (d ? 'Сохранить' : 'Добавить') + '</button>' +
        '<button type="button" class="btn-full btn-outline" data-action="close-modal">Отмена</button>');
    scrollToActiveDP('debt');
}

function saveDebt(id) {
    var toEl = document.getElementById('debtTo');
    var amtEl = document.getElementById('debtAmt');
    var to = toEl ? toEl.value.trim() : '';
    var amt = amtEl ? parseAmount(amtEl.value) : null;
    if (!to || amt === null) return;
    var existing = (id != null) ? state.debts.filter(function (x) { return x.id === id; })[0] : null;
    var sourceIso = existing ? existing.createdAt : new Date().toISOString();
    var newIso = readSwipeDate('debt', sourceIso);
    if (existing) { existing.to = to; existing.amount = amt; existing.createdAt = newIso; }
    else { state.debts.push({ id: uid(), to: to, amount: amt, createdAt: newIso }); }
    saveState(); hideModal(); renderDebts(document.getElementById('pane-debts'));
}

function payDebt(id, amount) {
    var d = null; for(var i=0;i<state.debts.length;i++) if(state.debts[i].id===id) { d=state.debts[i]; break; }
    if (!d) return;
    var amt = parseAmount(amount);
    if (amt===null || amt > d.amount || amt > state.balance) { alert('Ошибка суммы или недостаточно средств.'); return; }
    state.balance -= amt;
    d.amount -= amt;
    var descText = DEBT_RETURN_PREFIX + d.to;
    var payRecordId = uid();
    state.history.unshift({ id: payRecordId, date: new Date().toISOString(), type: TYPE.EXPENSE, desc: descText, amount: -amt, categoryId: 'other' });
    _flashId = payRecordId;
    if (d.amount <= 0.0001) state.debts = state.debts.filter(function(x){ return x.id!==id; });
    saveState(); renderHeader(); renderDebts(document.getElementById('pane-debts'));
    showToast('Долг возвращен');
}

function delDebt(id) {
    showConfirm('Удалить долг?', 'Запись о долге будет удалена. Деньги с баланса НЕ списываются.', function () {
        state.debts = state.debts.filter(function (x) { return x.id !== id; });
        saveState(); renderDebts(document.getElementById('pane-debts'));
    }, { danger: true, okLabel: 'Удалить' });
}

/* ============ PLANS ============ */
function renderPlans(c) {
    var html = '<div class="card"><div class="card-header"><div class="card-title">Планы на покупки</div><button type="button" class="btn-icon" data-action="add-plan">+</button></div>';
    if (state.plans.length === 0) html += '<div class="empty-state">Нет запланированных покупок</div>';
    else {
        for (var i = 0; i < state.plans.length; i++) {
            var p = state.plans[i];
            var pct = Math.min(100, Math.round((p.current / p.target) * 100));
            html += '<div class="list-item" style="flex-wrap:wrap;"><div class="item-left" style="width:100%"><div style="display:flex; justify-content:space-between; align-items:center; gap:8px;">' +
                '<div class="item-name">' + esc(p.name) + '</div><div class="item-amount" style="color:var(--green); font-size:13px;">' + fmt(p.current) + ' / ' + fmt(p.target) + '</div></div>' +
                '<div class="progress-bg"><div class="progress-fill" style="width:' + pct + '%"></div></div>' +
                '<div class="item-sub-plan">Создано: ' + formatDate(p.createdAt) + '</div><div class="item-actions">' +
                '<button type="button" class="mini-btn move" data-action="move-plan" data-id="' + esc(p.id) + '" data-dir="-1"' + (i===0?' disabled':'') + '>▲</button>' +
                '<button type="button" class="mini-btn move" data-action="move-plan" data-id="' + esc(p.id) + '" data-dir="1"' + (i===state.plans.length-1?' disabled':'') + '>▼</button>' +
                '<button type="button" class="mini-btn pay" data-action="fund-plan" data-id="' + esc(p.id) + '">+ Вложить</button>' +
                '<button type="button" class="mini-btn edit" data-action="edit-plan" data-id="' + esc(p.id) + '">✏️</button>' +
                '<button type="button" class="mini-btn del" data-action="del-plan" data-id="' + esc(p.id) + '">✕</button></div></div></div>';
        }
    }
    html += '</div>';
    c.innerHTML = html;
}

function movePlan(id, dir) {
    var idx = -1; for (var i = 0; i < state.plans.length; i++) { if (state.plans[i].id === id) { idx = i; break; } }
    if (idx === -1) return;
    var newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= state.plans.length) return;
    var tmp = state.plans[idx]; state.plans[idx] = state.plans[newIdx]; state.plans[newIdx] = tmp;
    saveState(); renderPlans(document.getElementById('pane-plans'));
}

function showAddPlan(existingId) {
    var p = (existingId != null) ? state.plans.filter(function (x) { return x.id === existingId; })[0] : null;
    showModal('<h3>' + (p ? 'Изменить цель' : 'Новая цель') + '</h3>' +
        '<input type="text" id="planName" placeholder="На что копим" autocomplete="off" value="' + esc(p ? p.name : '') + '">' +
        '<input type="text" id="planTarget" placeholder="Нужная сумма" inputmode="decimal" autocomplete="off" value="' + (p ? p.target : '') + '">' +
        '<button type="button" class="btn-full btn-primary" data-action="save-plan" data-id="' + (existingId != null ? esc(existingId) : '') + '">' + (p ? 'Сохранить' : 'Создать') + '</button>' +
        '<button type="button" class="btn-full btn-outline" data-action="close-modal">Отмена</button>');
}

function savePlan(id) {
    var nameEl = document.getElementById('planName');
    var targetEl = document.getElementById('planTarget');
    var name = nameEl ? nameEl.value.trim() : '';
    var target = targetEl ? parseAmount(targetEl.value) : null;
    if (!name || target === null) return;
    if (id) {
        var found = state.plans.filter(function (x) { return x.id === id; })[0];
        if (found) { found.name = name; found.target = target; }
    } else {
        state.plans.push({ id: uid(), name: name, target: target, current: 0, createdAt: new Date().toISOString() });
    }
    saveState(); hideModal(); renderPlans(document.getElementById('pane-plans'));
}

function showFundPlan(id) {
    var p = state.plans.filter(function (x) { return x.id === id; })[0];
    if (!p) return;
    var remain = Math.max(0, p.target - p.current);
    showModal('<h3>Вложить в «' + esc(p.name) + '»</h3>' +
        '<div style="font-size:12px; color:var(--dim); margin-bottom:10px;">Осталось: <b style="color:var(--green)">' + fmt(remain) + '</b><br>Доступно: <b style="color:var(--blue)">' + fmt(state.balance) + '</b></div>' +
        '<input type="text" id="fundAmount" placeholder="Сумма вклада" inputmode="decimal" autocomplete="off">' +
        '<button type="button" class="btn-full btn-primary" data-action="save-fund" data-id="' + esc(p.id) + '">Вложить</button>' +
        '<button type="button" class="btn-full btn-outline" data-action="close-modal">Отмена</button>');
}

function fundPlan(id) {
    var p = state.plans.filter(function (x) { return x.id === id; })[0];
    if (!p) return;
    var input = document.getElementById('fundAmount');
    var amt = input ? parseAmount(input.value) : null;
    if (amt === null || amt > state.balance) { alert('Некорректная сумма или недостаточно средств.'); return; }
    state.balance -= amt; p.current += amt;
    state.history.unshift({ id: uid(), date: new Date().toISOString(), type: TYPE.EXPENSE, desc: 'Вклад в цель: ' + p.name, amount: -amt, categoryId: 'other' });
    _flashId = state.history[0].id;
    saveState(); hideModal(); renderPlans(document.getElementById('pane-plans'));
}

function delPlan(id) {
    var p = state.plans.filter(function (x) { return x.id === id; })[0];
    if (!p) return;
    var refund = p.current;
    showConfirm('Удалить цель "' + p.name + '"?', refund > 0 ? 'Накопленные ' + fmt(refund) + ' вернутся на баланс.' : 'Цель пустая.', function () {
        state.balance += refund;
        if (refund > 0) state.history.unshift({ id: uid(), date: new Date().toISOString(), type: TYPE.INCOME, desc: 'Отмена цели: ' + p.name + ' (возврат)', amount: refund, categoryId: 'other-income' });
        state.plans = state.plans.filter(function (x) { return x.id !== id; });
        saveState(); renderPlans(document.getElementById('pane-plans'));
    }, { danger: true, okLabel: 'Удалить' });
}

/* ============ SHOPPING ============ */
function renderShopping(c) {
    var html = '<div class="card"><div class="card-header"><div class="card-title">Список покупок</div><button type="button" class="btn-icon" data-action="add-shopping">+</button></div>';
    if (state.shopping.length===0) html += '<div class="empty-state">Список пуст<br>Добавь что-нибудь купить</div>';
    else {
        var anySel = shoppingSelected.length > 0;
        var selCat = anySel ? (state.shopping.find(function(it){return it.id===shoppingSelected[0];}) || {}).categoryId : null;
        for(var i=0;i<state.shopping.length;i++) {
            var it = state.shopping[i];
            var isChecked = shoppingSelected.indexOf(it.id)!==-1;
            var isBlocked = anySel && !isChecked && it.categoryId!==selCat;
            var cat = getCategoryAny(it.categoryId) || getCategory(DEFAULT_CATEGORY_ID);
            var badge = cat ? '<span class="cat-badge '+cat.cssClass+'">'+cat.icon+' '+esc(cat.name)+'</span>' : '';
            html += '<div class="shopping-item'+(isChecked?' checked':'')+(isBlocked?' blocked':'')+'" data-action="shopping-toggle" data-id="'+esc(it.id)+'"><div class="shopping-checkbox">✓</div><div class="shopping-name">'+esc(it.name)+badge+'</div><button type="button" class="shopping-del" data-action="del-shopping" data-id="'+esc(it.id)+'">✕</button></div>';
        }
    }
    html += '</div>';
    c.innerHTML = html;
    var bar = document.getElementById('shoppingBarFixed');
    if (!bar) { bar = document.createElement('div'); bar.id='shoppingBarFixed'; bar.className='shopping-bar-fixed'; document.body.appendChild(bar); }
    if (shoppingSelected.length > 0) {
        bar.innerHTML = '<div class="ssb-info">Выбрано: <b>'+shoppingSelected.length+'</b></div><button type="button" class="shopping-convert-btn" data-action="shopping-convert">Создать операцию</button><button type="button" class="btn-outline" style="padding:10px 14px;border-radius:10px;font-size:13px;" data-action="shopping-deselect">Снять</button>';
        bar.classList.add('visible');
    } else {
        bar.classList.remove('visible');
    }
}

function toggleShoppingItem(id) {
    var item = state.shopping.find(function(it){return it.id===id;});
    if (!item) return;
    var idx = shoppingSelected.indexOf(id);
    if (idx !== -1) { shoppingSelected.splice(idx, 1); renderShopping(document.getElementById('pane-shopping')); return; }
    if (shoppingSelected.length > 0) {
        var firstItem = state.shopping.find(function(it){return it.id===shoppingSelected[0];});
        if (firstItem && firstItem.categoryId !== item.categoryId) return; // Блокировка разных категорий
    }
    shoppingSelected.push(id);
    renderShopping(document.getElementById('pane-shopping'));
}

function shoppingDeselect() { shoppingSelected = []; renderShopping(document.getElementById('pane-shopping')); }

function showAddShopping(existingId) {
    var it = (existingId != null) ? state.shopping.find(function(x){return x.id===existingId;}) : null;
    var catHtml = '<div class="field-label">Категория</div><div class="cat-list" style="margin-bottom:12px;">';
    for (var i = 0; i < CATEGORIES.length; i++) {
        var cat = CATEGORIES[i];
        catHtml += '<button type="button" class="cat-btn' + ((it && it.categoryId === cat.id) ? ' active' : '') + '" data-action="shopping-pick-cat" data-id="' + esc(cat.id) + '"><span class="cat-icon">' + cat.icon + '</span><span>' + esc(cat.name) + '</span></button>';
    }
    catHtml += '</div>';
    showModal('<h3>' + (it ? 'Изменить покупку' : 'Новая покупка') + '</h3>' +
        '<input type="text" id="shopName" placeholder="Что купить" autocomplete="off" value="' + esc(it ? it.name : '') + '">' + catHtml +
        '<button type="button" class="btn-full btn-primary" data-action="save-shopping" data-id="' + (existingId != null ? esc(existingId) : '') + '">' + (it ? 'Сохранить' : 'Добавить') + '</button>' +
        '<button type="button" class="btn-full btn-outline" data-action="close-modal">Отмена</button>');
}

function shoppingPickCat(catId) {
    var btns = document.querySelectorAll('.cat-btn');
    for(var i=0; i<btns.length; i++) {
        if(btns[i].getAttribute('data-id') === catId) btns[i].classList.add('active');
        else btns[i].classList.remove('active');
    }
}

function saveShopping(id) {
    var nameEl = document.getElementById('shopName');
    var name = nameEl ? nameEl.value.trim() : '';
    if (!name) return;
    var activeCat = document.querySelector('.cat-btn.active');
    var catId = activeCat ? activeCat.getAttribute('data-id') : DEFAULT_CATEGORY_ID;
    if (id) {
        var found = state.shopping.find(function(x){return x.id===id;});
        if (found) { found.name = name; found.categoryId = catId; }
    } else {
        state.shopping.push({ id: uid(), name: name, categoryId: catId });
    }
    saveState(); hideModal(); renderShopping(document.getElementById('pane-shopping'));
}

function delShopping(id) {
    showConfirm('Удалить покупку?', 'Пункт исчезнет из списка.', function () {
        state.shopping = state.shopping.filter(function (x) { return x.id !== id; });
        shoppingSelected = shoppingSelected.filter(function (x) { return x !== id; });
        saveState(); renderShopping(document.getElementById('pane-shopping'));
    }, { danger: true, okLabel: 'Удалить' });
}

function shoppingConvert() {
    if (shoppingSelected.length === 0) return;
    var items = state.shopping.filter(function (it) { return shoppingSelected.indexOf(it.id) !== -1; });
    var catId = items[0].categoryId;
    var cat = getCategoryAny(catId) || getCategory(DEFAULT_CATEGORY_ID);
    var names = items.map(function (it) { return it.name; }).join(', ');
    showModal('<h3>Создать операцию</h3><div class="cat-desc" style="margin-bottom:14px;">' + esc(names) + '</div>' +
        '<div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;"><span style="width:38px;height:38px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:20px;background:' + cat.color + '33;flex-shrink:0;">' + cat.icon + '</span><span style="font-size:15px;">' + esc(cat.name) + '</span></div>' +
        '<div class="field-label">Сумма</div><input type="text" id="convAmount" placeholder="Сумма" inputmode="decimal" autocomplete="off">' +
        '<div class="field-label">Время</div><input type="text" id="convTime" placeholder="ЧЧ:ММ" autocomplete="off" value="' + formatTimeFromIso(new Date().toISOString()) + '">' +
        '<button type="button" class="btn-full btn-primary" data-action="shopping-convert-confirm">Создать</button>' +
        '<button type="button" class="btn-full btn-outline" data-action="close-modal">Отмена</button>');
}

function shoppingConvertConfirm() {
    var amtEl = document.getElementById('convAmount');
    var timeEl = document.getElementById('convTime');
    var amt = amtEl ? parseAmount(amtEl.value) : null;
    if (amt === null) { if (amtEl) amtEl.focus(); return; }
    var items = state.shopping.filter(function (it) { return shoppingSelected.indexOf(it.id) !== -1; });
    var catId = items[0].categoryId;
    var names = items.map(function (it) { return it.name; }).join(', ');
    var dateIso = applyTimeToIso(new Date().toISOString(), timeEl ? timeEl.value.trim() : '');
    state.balance -= amt;
    var recordId = uid();
    state.history.unshift({ id: recordId, date: dateIso, type: TYPE.EXPENSE, desc: names, amount: -amt, categoryId: catId });
    _flashId = recordId;
    state.shopping = state.shopping.filter(function (it) { return shoppingSelected.indexOf(it.id) === -1; });
    shoppingSelected = [];
    saveState(); hideModal(); switchTab('balance');
}

/* ============ HISTORY EDIT & DELETE ============ */
var _editState = { id: null, catId: null, amount: '', desc: '', dateIso: null, timeStr: '' };

function showEditHistoryItem(id) {
    var item = state.history.find(function(h){return h.id===id;});
    if (!item) return;
    _editState.id = id;
    _editState.amount = String(Math.abs(item.amount));
    _editState.desc = item.desc || '';
    _editState.dateIso = item.date;
    _editState.timeStr = formatTimeFromIso(item.date);
    _editState.catId = item.categoryId || (item.type === TYPE.INCOME ? DEFAULT_INCOME_CATEGORY_ID : DEFAULT_CATEGORY_ID);
    
    var catHtml = '';
    var list = getCategoriesByType(item.type);
    catHtml = '<div class="field-label">Категория</div><div class="cat-list" style="margin-bottom:12px;">';
    for (var j = 0; j < list.length; j++) {
        var cat = list[j];
        catHtml += '<button type="button" class="cat-btn' + (_editState.catId === cat.id ? ' active' : '') + '" data-action="edit-cat-pick" data-id="' + esc(cat.id) + '"><span class="cat-icon">' + cat.icon + '</span><span>' + esc(cat.name) + '</span></button>';
    }
    catHtml += '</div>';
    
    showModal('<h3>Изменить операцию</h3>' +
        '<div class="field-label">Сумма</div><input type="text" id="editAmount" inputmode="decimal" autocomplete="off" value="' + esc(_editState.amount) + '">' +
        '<div class="field-label">Название</div><input type="text" id="editDesc" autocomplete="off" value="' + esc(_editState.desc) + '">' +
        '<div class="field-label">Дата</div>' + buildSwipeDatePicker('edit', _editState.dateIso) +
        '<div class="field-label">Время</div><input type="text" id="editTime" placeholder="ЧЧ:ММ" autocomplete="off" value="' + esc(_editState.timeStr) + '">' +
        catHtml +
        '<button type="button" class="btn-full btn-primary" data-action="save-edit-history" data-id="' + esc(item.id) + '">Сохранить</button>' +
        '<button type="button" class="btn-full btn-outline" data-action="delete-edit-history" data-id="' + esc(item.id) + '">Удалить операцию</button>' +
        '<button type="button" class="btn-full btn-outline" data-action="close-modal">Отмена</button>');
    scrollToActiveDP('edit');
}

function editPickCategory(catId) {
    _editState.catId = catId;
    var btns = document.querySelectorAll('.cat-btn');
    for(var i=0; i<btns.length; i++) {
        if(btns[i].getAttribute('data-id') === catId) btns[i].classList.add('active');
        else btns[i].classList.remove('active');
    }
}

function saveEditedHistory(id) {
    var item = state.history.find(function(h){return h.id===id;});
    if (!item) return;
    var newAbs = parseAmount(document.getElementById('editAmount').value);
    if (newAbs === null) { document.getElementById('editAmount').focus(); return; }
    var oldAmount = item.amount;
    var sign = oldAmount < 0 ? -1 : 1;
    var newAmount = newAbs * sign;
    state.balance += (newAmount - oldAmount);
    var timeStr = document.getElementById('editTime').value;
    var descEl = document.getElementById('editDesc');
    item.amount = newAmount;
    item.desc = descEl ? descEl.value.trim() : '';
    item.date = applyTimeToIso(readSwipeDate('edit', _editState.dateIso), timeStr);
    item.categoryId = _editState.catId;
    saveState(); hideModal(); renderBalance(document.getElementById('pane-balance'));
}

function deleteFromEdit(id) {
    hideModal();
    setTimeout(function () { showDeleteHistoryItem(id, { refund: false, restore: false }); }, 325);
}

var _delHistState = { id: null, refund: false, restore: false, bulkMode: false };

function showDeleteHistoryItem(id, opts) {
    opts = opts || {};
    var item = state.history.find(function(h){return h.id===id;});
    if (!item) return;
    _delHistState.id = id;
    _delHistState.refund = !!opts.refund;
    _delHistState.restore = !!opts.restore;
    _delHistState.bulkMode = false;
    
    var isPos = item.amount > 0;
    var balanceHint = _delHistState.refund ? 'Новый баланс: ' + fmt(state.balance - item.amount) : 'Баланс не изменится';
    
    showModal('<h3>Удалить операцию?</h3>' +
        '<div class="history-summary"><div class="h-title">' + (esc(item.desc) || 'Без названия') + '</div><div class="h-meta">' + formatDateTime(item.date) + '</div><div class="h-amount ' + (isPos?'pos':'neg') + '">' + (isPos?'+':'') + fmt(item.amount) + '</div></div>' +
        '<label class="checkbox-row"><input type="checkbox" id="cbRefund"' + (_delHistState.refund ? ' checked' : '') + '><span class="cb-label">Вернуть деньги на баланс<span class="cb-hint">' + esc(balanceHint) + '</span></span></label>' +
        '<div class="btn-row" style="margin-top:12px;"><button type="button" class="btn-full btn-secondary" data-action="close-modal">Отмена</button><button type="button" class="btn-full btn-danger" data-action="history-confirm-del" data-id="' + esc(id) + '" data-refund="' + (_delHistState.refund?'1':'0') + '" data-restore="' + (_delHistState.restore?'1':'0') + '">Удалить</button></div>');
        
    document.getElementById('cbRefund').addEventListener('change', function(e) {
        showDeleteHistoryItem(id, { refund: e.target.checked, restore: false });
    });
}

function deleteHistoryItem(id, refund, restore) {
    var item = state.history.find(function(h){return h.id===id;});
    if (!item) return;
    if (refund) state.balance -= item.amount;
    if (restore && refund) {
        var desc = item.desc || '';
        if (desc.indexOf(DEBT_RETURN_PREFIX) === 0) {
            var debtorName = desc.slice(DEBT_RETURN_PREFIX.length);
            var matches = state.debts.filter(function (d) { return d.to === debtorName; });
            if (matches.length === 1) matches[0].amount += Math.abs(item.amount);
            else state.debts.push({ id: uid(), to: debtorName, amount: Math.abs(item.amount), createdAt: new Date().toISOString() });
        }
    }
    state.history = state.history.filter(function (h) { return h.id !== id; });
    saveState(); hideModal();
    if (currentTab === 'balance') renderBalance(document.getElementById('pane-balance'));
    else if (currentTab === 'debts') renderDebts(document.getElementById('pane-debts'));
}

/* ============ BULK ACTIONS ============ */
function startSelectionMode(id) { selectionMode = true; selectedIds = [id]; renderBalance(document.getElementById('pane-balance')); }
function toggleSelect(id) {
    var idx = selectedIds.indexOf(id);
    if (idx === -1) selectedIds.push(id); else selectedIds.splice(idx, 1);
    if (selectedIds.length === 0) { selectionMode = false; selectedIds = []; }
    renderBalance(document.getElementById('pane-balance'));
}
function exitSelectionMode() { selectionMode = false; selectedIds = []; renderBalance(document.getElementById('pane-balance')); }

function bulkEditCategory() {
    if (selectedIds.length === 0) return;
    var html = '<h3>Сменить категорию</h3><p style="font-size:12px;color:var(--dim);margin:0 0 14px;">Для ' + selectedIds.length + ' операций.</p><div style="display:flex;flex-direction:column;gap:8px;">';
    for (var i = 0; i < CATEGORIES.length; i++) {
        var cat = CATEGORIES[i];
        html += '<button type="button" class="cat-btn" data-action="bulk-apply-category" data-id="' + esc(cat.id) + '" data-type="expense"><span class="cat-icon">' + cat.icon + '</span><span>' + esc(cat.name) + '</span></button>';
    }
    html += '</div><button type="button" class="btn-full btn-outline" data-action="close-modal" style="margin-top:12px;">Отмена</button>';
    showModal(html);
}

function bulkApplyCategory(catId) {
    for (var i = 0; i < state.history.length; i++) {
        var h = state.history[i];
        if (selectedIds.indexOf(h.id) !== -1 && h.type !== TYPE.INCOME) h.categoryId = catId;
    }
    saveState(); hideModal(); exitSelectionMode();
}

function bulkEditDate() {
    if (selectedIds.length === 0) return;
    showModal('<h3>Сменить дату</h3><p style="font-size:12px;color:var(--dim);margin:0 0 12px;">Для ' + selectedIds.length + ' операций.</p>' +
        buildSwipeDatePicker('bulk', new Date().toISOString()) +
        '<button type="button" class="btn-full btn-primary" data-action="bulk-apply-date">Применить</button>' +
        '<button type="button" class="btn-full btn-outline" data-action="close-modal">Отмена</button>');
    scrollToActiveDP('bulk');
}

function bulkApplyDate() {
    var newIso = readSwipeDate('bulk', new Date().toISOString());
    for (var i = 0; i < state.history.length; i++) {
        var h = state.history[i];
        if (selectedIds.indexOf(h.id) !== -1) {
            var oldDate = new Date(h.date);
            var newDate = new Date(newIso);
            newDate.setHours(oldDate.getHours(), oldDate.getMinutes(), oldDate.getSeconds());
            h.date = newDate.toISOString();
        }
    }
    saveState(); hideModal(); exitSelectionMode();
}

function bulkEditName() {
    if (selectedIds.length === 0) return;
    showModal('<h3>Сменить название</h3><input type="text" id="bulkNameInput" placeholder="Новое название" autocomplete="off">' +
        '<button type="button" class="btn-full btn-primary" data-action="bulk-apply-name">Применить</button>' +
        '<button type="button" class="btn-full btn-outline" data-action="close-modal">Отмена</button>');
}

function bulkApplyName() {
    var newName = document.getElementById('bulkNameInput').value.trim();
    if (!newName) { hideModal(); return; }
    for (var i = 0; i < state.history.length; i++) {
        var h = state.history[i];
        if (selectedIds.indexOf(h.id) !== -1) h.desc = newName;
    }
    saveState(); hideModal(); exitSelectionMode();
}

function bulkDelete() {
    if (selectedIds.length === 0) return;
    showModal('<h3>Удалить операции?</h3><div class="history-summary"><div class="h-title">Выбрано: ' + selectedIds.length + '</div></div>' +
        '<label class="checkbox-row"><input type="checkbox" id="cbBulkRefund"><span class="cb-label">Вернуть деньги на баланс</span></label>' +
        '<div class="btn-row" style="margin-top:12px;"><button type="button" class="btn-full btn-secondary" data-action="close-modal">Отмена</button><button type="button" class="btn-full btn-danger" data-action="bulk-apply-delete">Удалить</button></div>');
}

function bulkApplyDelete() {
    var doRefund = document.getElementById('cbBulkRefund').checked;
    var idsToDelete = selectedIds.slice();
    if (doRefund) {
        for (var i = 0; i < state.history.length; i++) {
            var h = state.history[i];
            if (idsToDelete.indexOf(h.id) !== -1) state.balance -= h.amount;
        }
    }
    state.history = state.history.filter(function (h) { return idsToDelete.indexOf(h.id) === -1; });
    saveState(); hideModal(); exitSelectionMode();
}

/* ============ CATEGORY FILTER ============ */
function openCategoryFilter() {
    var html = '<h3>Фильтр по категориям</h3><div class="cat-filter-list">';
    for (var i = 0; i < CATEGORIES.length; i++) {
        var cat = CATEGORIES[i];
        var checked = historyCatFilter.indexOf(cat.id) !== -1;
        html += '<label class="cat-filter-row"><input type="checkbox" data-cat-filter="' + esc(cat.id) + '"' + (checked ? ' checked' : '') + '><span class="cf-dot" style="background:' + cat.color + '"></span><span class="cf-label">' + cat.icon + ' ' + esc(cat.name) + '</span></label>';
    }
    html += '</div><div class="btn-row" style="margin-top:14px;"><button type="button" class="btn-full btn-secondary" data-action="cat-filter-reset">Сбросить</button><button type="button" class="btn-full btn-primary" data-action="cat-filter-apply">Готово</button></div>';
    showModal(html);
}

function applyCategoryFilter() {
    var checkboxes = document.querySelectorAll('[data-cat-filter]');
    var newFilter = [];
    for (var i = 0; i < checkboxes.length; i++) { if (checkboxes[i].checked) newFilter.push(checkboxes[i].getAttribute('data-cat-filter')); }
    historyCatFilter = newFilter;
    historyViewCount = 50;
    _animateList = true;
    hideModal();
    renderBalance(document.getElementById('pane-balance'));
}

function resetCategoryFilter() {
    var checkboxes = document.querySelectorAll('[data-cat-filter]');
    for (var i = 0; i < checkboxes.length; i++) checkboxes[i].checked = false;
}

/* ============ ANALYTICS ============ */
var chartSlotsCache = [];
var chartTfCache = 'D1';
var chartPanOffset = 0;
var chartIsPanning = false;
var chartPanStartX = 0;

function buildChartData(tfId, panOffset) {
    var tf = TIMEFRAMES.find(function(t){return t.id===tfId;}) || TIMEFRAMES[0];
    var now = new Date();
    var todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23,59,59,999);
    var startDate;
    if (tf.unit==='day') { startDate=new Date(todayEnd); startDate.setDate(startDate.getDate()-tf.days+1-(panOffset||0)); startDate.setHours(0,0,0,0); }
    else if (tf.unit==='week') { startDate=new Date(todayEnd); var dow=startDate.getDay(); var diff=(dow+6)%7; startDate.setDate(startDate.getDate()-diff-11*7-(panOffset||0)*7); startDate.setHours(0,0,0,0); }
    else if (tf.unit==='month') { startDate=new Date(now.getFullYear(), now.getMonth()-11-(panOffset||0), 1, 0,0,0); }
    else if (tf.unit==='q') { var cq=Math.floor(now.getMonth()/3); startDate=new Date(now.getFullYear(), (cq-7-(panOffset||0))*3, 1, 0,0,0); }
    else { startDate=new Date(now.getFullYear()-4-(panOffset||0), 0, 1, 0,0,0); }
    
    var slots = [];
    var cur = new Date(startDate);
    while (cur <= todayEnd) {
        var slotEnd;
        if (tf.unit==='day') slotEnd=new Date(cur.getFullYear(),cur.getMonth(),cur.getDate(),23,59,59,999);
        else if (tf.unit==='week') { slotEnd=new Date(cur); slotEnd.setDate(slotEnd.getDate()+6); slotEnd.setHours(23,59,59,999); }
        else if (tf.unit==='month') slotEnd=new Date(cur.getFullYear(),cur.getMonth()+1,0,23,59,59,999);
        else if (tf.unit==='q') slotEnd=new Date(cur.getFullYear(),cur.getMonth()+3,0,23,59,59,999);
        else slotEnd=new Date(cur.getFullYear(),11,31,23,59,59,999);
        
        var label;
        if (tf.unit==='day') label=cur.getDate()+' '+MONTHS_SHORT[cur.getMonth()];
        else if (tf.unit==='week') label=cur.getDate()+' '+MONTHS_SHORT[cur.getMonth()];
        else if (tf.unit==='month') label=MONTHS_SHORT[cur.getMonth()]+' '+String(cur.getFullYear()).slice(2);
        else if (tf.unit==='q') label='Q'+(Math.floor(cur.getMonth()/3)+1)+' '+String(cur.getFullYear()).slice(2);
        else label=String(cur.getFullYear());
        
        slots.push({start:new Date(cur), end:slotEnd, label:label, income:0, expense:0, ops:0});
        if (tf.unit==='day') cur.setDate(cur.getDate()+1);
        else if (tf.unit==='week') { cur=new Date(cur); cur.setDate(cur.getDate()+7); }
        else if (tf.unit==='month') cur=new Date(cur.getFullYear(),cur.getMonth()+1,1);
        else if (tf.unit==='q') cur=new Date(cur.getFullYear(),cur.getMonth()+3,1);
        else cur=new Date(cur.getFullYear()+1,0,1);
    }
    
    var balanceBefore = state.balance;
    for(var k=0;k<state.history.length;k++) balanceBefore -= state.history[k].amount;
    var sorted = state.history.slice().sort(function(a,b){return new Date(a.date)-new Date(b.date);});
    var running = balanceBefore;
    var hIdx = 0;
    for(var s=0;s<slots.length;s++) {
        var slot = slots[s];
        while(hIdx<sorted.length) {
            var h=sorted[hIdx]; var hTs=new Date(h.date).getTime();
            if(hTs<slot.start.getTime()) { running+=h.amount; hIdx++; continue; }
            if(hTs>slot.end.getTime()) break;
            running+=h.amount;
            if(h.amount>0) slot.income+=h.amount;
            else if(h.amount<0) slot.expense+=Math.abs(h.amount);
            slot.ops++; hIdx++;
        }
        slot.balanceEnd = running;
    }
    return slots;
}

function drawChart(canvas, slots, tfId) {
    if(!canvas||!slots||slots.length===0) return;
    var wrap=canvas.parentNode; var cssW=wrap.clientWidth; var cssH=320;
    var dpr=window.devicePixelRatio||1; canvas.width=Math.floor(cssW*dpr); canvas.height=Math.floor(cssH*dpr);
    canvas.style.width=cssW+'px'; canvas.style.height=cssH+'px';
    var ctx=canvas.getContext('2d'); ctx.setTransform(dpr,0,0,dpr,0,0);
    var PAD_L=44,PAD_R=12,PAD_T=12,PAD_B=22,GAP=6,VOL_H=60;
    var chartW=cssW-PAD_L-PAD_R; var chartH=cssH-PAD_T-PAD_B-GAP-VOL_H;
    var lineTop=PAD_T, lineBot=PAD_T+chartH;
    var volTop=lineBot+GAP, volBot=volTop+VOL_H;
    ctx.clearRect(0,0,cssW,cssH);
    var minBal=Infinity,maxBal=-Infinity;
    for(var i=0;i<slots.length;i++) { var b=slots[i].balanceEnd; if(b<minBal)minBal=b; if(b>maxBal)maxBal=b; }
    if(!isFinite(minBal)){minBal=0;maxBal=1;} if(minBal===maxBal){minBal-=1;maxBal+=1;}
    var range=maxBal-minBal; minBal-=range*0.05; maxBal+=range*0.05;
    if(minBal>0&&minBal<range*0.5)minBal=0; if(maxBal<0&&maxBal>-range*0.5)maxBal=0;
    var yRange=maxBal-minBal; if(yRange===0)yRange=1;
    function yForBal(b){return lineBot-((b-minBal)/yRange)*chartH;}
    var maxVol=0; for(var v=0;v<slots.length;v++){if(slots[v].income>maxVol)maxVol=slots[v].income;if(slots[v].expense>maxVol)maxVol=slots[v].expense;} if(maxVol===0)maxVol=1;
    var volHalf=VOL_H/2;
    ctx.strokeStyle='#2a3548'; ctx.fillStyle='#8b9bb4'; ctx.font='10px -apple-system,sans-serif'; ctx.textAlign='right'; ctx.textBaseline='middle'; ctx.lineWidth=1;
    for(var g=0;g<=4;g++){var val=minBal+(yRange*g/4); var yy=yForBal(val); ctx.beginPath(); ctx.moveTo(PAD_L,yy); ctx.lineTo(PAD_L+chartW,yy); ctx.stroke(); ctx.fillText(fmtShort(val),PAD_L-6,yy);}
    ctx.textAlign='center'; ctx.textBaseline='top';
    var maxLabels=Math.max(3,Math.floor(chartW/55)); var labelEvery=Math.ceil(slots.length/maxLabels);
    for(var s2=0;s2<slots.length;s2++){if(s2%labelEvery!==0&&s2!==slots.length-1)continue; var lx=PAD_L+(chartW*(s2+0.5)/slots.length); ctx.fillText(slots[s2].label,lx,volBot+4);}
    var grad=ctx.createLinearGradient(0,lineTop,0,lineBot); grad.addColorStop(0,'rgba(0,210,255,0.18)'); grad.addColorStop(1,'rgba(0,210,255,0)');
    ctx.beginPath(); for(var p=0;p<slots.length;p++){var px=PAD_L+(chartW*(p+0.5)/slots.length); var py=yForBal(slots[p].balanceEnd); if(p===0)ctx.moveTo(px,py);else ctx.lineTo(px,py);}
    ctx.lineTo(PAD_L+(chartW*(slots.length-0.5)/slots.length),lineBot); ctx.lineTo(PAD_L+(chartW*0.5/slots.length),lineBot); ctx.closePath(); ctx.fillStyle=grad; ctx.fill();
    ctx.beginPath(); for(var p2=0;p2<slots.length;p2++){var px2=PAD_L+(chartW*(p2+0.5)/slots.length); var py2=yForBal(slots[p2].balanceEnd); if(p2===0)ctx.moveTo(px2,py2);else ctx.lineTo(px2,py2);}
    ctx.strokeStyle='#00d2ff'; ctx.lineWidth=2; ctx.lineJoin='round'; ctx.stroke();
    if(slots.length<=40){ctx.fillStyle='#00d2ff'; for(var p3=0;p3<slots.length;p3++){ctx.beginPath(); ctx.arc(PAD_L+(chartW*(p3+0.5)/slots.length),yForBal(slots[p3].balanceEnd),2.5,0,Math.PI*2); ctx.fill();}}
    ctx.strokeStyle='#3a4558'; ctx.beginPath(); ctx.moveTo(PAD_L,volTop+volHalf); ctx.lineTo(PAD_L+chartW,volTop+volHalf); ctx.stroke();
    var slotW=chartW/slots.length; var barW=Math.max(1,Math.min(slotW*0.7,20));
    for(var bx=0;bx<slots.length;bx++){var sl=slots[bx]; var cx=PAD_L+slotW*(bx+0.5);
        if(sl.income>0){ctx.fillStyle='#00d26a'; ctx.fillRect(cx-barW/2,volTop+volHalf-(sl.income/maxVol)*volHalf,barW,(sl.income/maxVol)*volHalf);}
        if(sl.expense>0){ctx.fillStyle='#ff4757'; ctx.fillRect(cx-barW/2,volTop+volHalf,barW,(sl.expense/maxVol)*volHalf);}
    }
    ctx.strokeStyle='#3a4558'; ctx.beginPath(); ctx.moveTo(PAD_L,lineTop); ctx.lineTo(PAD_L,volBot); ctx.stroke();
}

function renderAnalytics(c) {
    var currentTf = state.tf || 'D1';
    var tfHtml = '<div class="tf-switcher">';
    for(var i=0;i<TIMEFRAMES.length;i++) tfHtml += '<button type="button" class="tf-btn'+(currentTf===TIMEFRAMES[i].id?' active':'')+'" data-action="tf" data-tf="'+TIMEFRAMES[i].id+'">'+TIMEFRAMES[i].label+'</button>';
    tfHtml += '</div>';
    var slots = buildChartData(currentTf, chartPanOffset);
    var totalIncome=0,totalExpense=0,totalOps=0;
    for(var j=0;j<slots.length;j++){totalIncome+=slots[j].income;totalExpense+=slots[j].expense;totalOps+=slots[j].ops;}
    var netChange=totalIncome-totalExpense;
    var avgLabel = 'Средний расход/день';
    var avgDivisor = slots.length;
    if (currentTf==='W1') { avgLabel='Средний расход/неделю'; avgDivisor=Math.max(1,slots.length/7); }
    else if (currentTf==='M1') { avgLabel='Средний расход/месяц'; avgDivisor=Math.max(1,slots.length/30); }
    else if (currentTf==='M3') { avgLabel='Средний расход/квартал'; avgDivisor=Math.max(1,slots.length/90); }
    else if (currentTf==='Y1') { avgLabel='Средний расход/год'; avgDivisor=Math.max(1,slots.length/365); }
    var avgPerUnit = totalExpense / avgDivisor;
    var startTs=slots.length>0?slots[0].start.getTime():0;
    var endTs=slots.length>0?slots[slots.length-1].end.getTime():Date.now();
    var expSums={},incSums={};
    for(var e0=0;e0<CATEGORIES.length;e0++) expSums[CATEGORIES[e0].id]=0;
    for(var i0=0;i0<CATEGORIES_INCOME.length;i0++) incSums[CATEGORIES_INCOME[i0].id]=0;
    for(var k=0;k<state.history.length;k++){var h=state.history[k]; var hTs=new Date(h.date).getTime(); if(hTs<startTs||hTs>endTs)continue;
        if(h.amount<0){var catE=h.categoryId||DEFAULT_CATEGORY_ID; if(expSums[catE]===undefined)expSums[catE]=0; expSums[catE]+=Math.abs(h.amount);}
        else if(h.amount>0){var catI=h.categoryId||DEFAULT_INCOME_CATEGORY_ID; if(incSums[catI]===undefined)incSums[catI]=0; incSums[catI]+=h.amount;}
    }
    var totalExpSum=0,totalIncSum=0;
    for(var e1=0;e1<CATEGORIES.length;e1++) totalExpSum+=expSums[CATEGORIES[e1].id]||0;
    for(var i1=0;i1<CATEGORIES_INCOME.length;i1++) totalIncSum+=incSums[CATEGORIES_INCOME[i1].id]||0;
    var expRows='',incRows='';
    for(var ei=0;ei<CATEGORIES.length;ei++){var cat=CATEGORIES[ei]; var sum=expSums[cat.id]||0; var pct=totalExpSum>0?Math.round((sum/totalExpSum)*100):0; expRows+='<div class="cat-table-row"><span class="ct-dot" style="background:'+cat.color+'"></span><span class="ct-name">'+cat.icon+' '+esc(cat.name)+'</span><span class="ct-amount">'+fmt(sum)+'</span><span class="ct-pct">'+pct+'%</span></div>';}
    for(var ii=0;ii<CATEGORIES_INCOME.length;ii++){var catI=CATEGORIES_INCOME[ii]; var sumI=incSums[catI.id]||0; var pctI=totalIncSum>0?Math.round((sumI/totalIncSum)*100):0; incRows+='<div class="cat-table-row"><span class="ct-dot" style="background:'+catI.color+'"></span><span class="ct-name">'+catI.icon+' '+esc(catI.name)+'</span><span class="ct-amount">'+fmt(sumI)+'</span><span class="ct-pct">'+pctI+'%</span></div>';}
    var presetsHtml = '<div class="period-presets">';
    var presets = [{id:'week',label:'Неделя'},{id:'month',label:'Месяц'},{id:'quarter',label:'Квартал'},{id:'year',label:'Год'},{id:'all',label:'Всё'}];
    for(var pr=0;pr<presets.length;pr++) presetsHtml += '<button type="button" class="preset-btn" data-action="period-preset" data-preset="'+presets[pr].id+'">'+presets[pr].label+'</button>';
    presetsHtml += '</div>';
    var periodHtml = '<div class="card"><div class="card-title" style="margin-bottom:12px">Расходы по категориям</div>' + presetsHtml;
    if (state.periodFrom && state.periodTo) {
        periodHtml += '<div style="font-size:12px;color:var(--dim);margin-bottom:12px;">Период: '+formatDate(state.periodFrom)+' — '+formatDate(state.periodTo)+' <button type="button" class="history-cat-btn" data-action="period-open" style="margin-left:8px;padding:4px 10px;font-size:11px;">Изменить</button></div>';
    } else {
        periodHtml += '<div style="margin-bottom:12px;"><button type="button" class="history-cat-btn" data-action="period-open">Выбрать период</button></div>';
    }
    periodHtml += (totalExpSum>0 ? '<div class="cat-table">'+expRows+'</div>' : '<div class="empty-state">За период расходов нет</div>') + '</div>';
    var html = '<div class="card">' + tfHtml + '<div class="chart-wrap"><canvas class="chart-canvas" id="chartCanvas"></canvas></div>' +
        '<div class="analytics-summary">' +
            '<div class="as-row"><span>Доходы за период</span><b style="color:var(--green)">+'+fmt(totalIncome)+'</b></div>' +
            '<div class="as-row"><span>Расходы за период</span><b style="color:var(--red)">−'+fmt(totalExpense)+'</b></div>' +
            '<div class="as-row"><span>Итог</span><b class="'+(netChange>=0?'pos':'neg')+'">'+(netChange>=0?'+':'')+fmt(netChange)+'</b></div>' +
            '<div class="as-row"><span>Операций</span><b>'+totalOps+'</b></div>' +
            '<div class="as-row"><span>'+avgLabel+'</span><b>'+fmt(avgPerUnit)+'</b></div>' +
        '</div></div>' +
        '<div class="card"><div class="card-title" style="margin-bottom:10px">Доходы по категориям</div>' + (totalIncSum>0?'<div class="cat-table">'+incRows+'</div>':'<div class="empty-state">За период доходов нет</div>') + '</div>' + periodHtml;
    c.innerHTML = html;
    requestAnimationFrame(function(){
        var canvas=document.getElementById('chartCanvas');
        if(canvas){drawChart(canvas,slots,currentTf); chartSlotsCache=slots; chartTfCache=currentTf;}
    });
    var chartCanvas = document.getElementById('chartCanvas');
    if(chartCanvas) {
        chartCanvas.addEventListener('touchstart', function(e){chartIsPanning=true; chartPanStartX=e.touches[0].clientX;}, {passive:true});
        chartCanvas.addEventListener('touchmove', function(e){
            if(!chartIsPanning) return;
            var dx=e.touches[0].clientX-chartPanStartX;
            if(Math.abs(dx)>10) { e.preventDefault(); chartPanOffset += (dx>0?-1:1); chartPanStartX=e.touches[0].clientX; drawChart(chartCanvas, buildChartData(currentTf, chartPanOffset), currentTf); chartSlotsCache=buildChartData(currentTf, chartPanOffset); }
        }, {passive:false});
        chartCanvas.addEventListener('touchend', function(){chartIsPanning=false;});
    }
}

function setTimeframe(tfId) { if(!isValidTf(tfId))return; if(state.tf===tfId)return; state.tf=tfId; chartPanOffset=0; saveState(); renderAnalytics(document.getElementById('pane-analytics')); }

function applyPeriodPreset(preset) {
    var now = new Date();
    if (preset==='week') { state.periodFrom=new Date(now.getFullYear(),now.getMonth(),now.getDate()-7).toISOString(); state.periodTo=now.toISOString(); }
    else if (preset==='month') { state.periodFrom=new Date(now.getFullYear(),now.getMonth(),1).toISOString(); state.periodTo=now.toISOString(); }
    else if (preset==='quarter') { var q=Math.floor(now.getMonth()/3); state.periodFrom=new Date(now.getFullYear(),q*3,1).toISOString(); state.periodTo=now.toISOString(); }
    else if (preset==='year') { state.periodFrom=new Date(now.getFullYear(),0,1).toISOString(); state.periodTo=now.toISOString(); }
    else if (preset==='all') { if(state.history.length>0){var oldest=state.history[state.history.length-1].date; state.periodFrom=oldest; state.periodTo=now.toISOString();} else {state.periodFrom=null;state.periodTo=null;} }
    saveState(); renderAnalytics(document.getElementById('pane-analytics'));
    showToast('Период обновлен');
}

function openPeriodPicker() {
    showModal('<h3>Выбрать период</h3><div class="field-label">От</div>' + buildSwipeDatePicker('periodFrom', state.periodFrom || new Date().toISOString()) +
        '<div class="field-label">До</div>' + buildSwipeDatePicker('periodTo', state.periodTo || new Date().toISOString()) +
        '<button type="button" class="btn-full btn-primary" data-action="period-apply">Применить</button>' +
        '<button type="button" class="btn-full btn-outline" data-action="close-modal">Отмена</button>');
    scrollToActiveDP('periodFrom'); scrollToActiveDP('periodTo');
}

function applyPeriod() {
    state.periodFrom = readSwipeDate('periodFrom', new Date().toISOString());
    state.periodTo = readSwipeDate('periodTo', new Date().toISOString());
    saveState(); hideModal(); renderAnalytics(document.getElementById('pane-analytics'));
}

/* ============ BUDGETS ============ */
function buildBudgetsBlockHtml() {
    var viewMonth = state.budgetsViewMonth || getCurrentMonthKey();
    var budgetsForMonth = state.budgets.filter(function(b){return b.month===viewMonth;}).sort(function(a,b){
        var idxA=-1,idxB=-1; for(var i=0;i<CATEGORIES.length;i++){if(CATEGORIES[i].id===a.categoryId)idxA=i;if(CATEGORIES[i].id===b.categoryId)idxB=i;} return idxA-idxB;
    });
    var canGoForward = viewMonth < getCurrentMonthKey();
    var rowsHtml='';
    if(budgetsForMonth.length===0) rowsHtml='<div class="budgets-empty">На этот месяц бюджетов нет</div>';
    else {
        for(var i=0;i<budgetsForMonth.length;i++){
            var b=budgetsForMonth[i]; var cat=getCategory(b.categoryId); if(!cat)continue;
            var spent=0; for(var h=0;h<state.history.length;h++){var hi=state.history[h]; if(getMonthKey(hi.date)!==viewMonth)continue; if(hi.amount<0&&hi.categoryId===b.categoryId)spent+=Math.abs(hi.amount);}
            var pct=b.limit>0?(spent/b.limit)*100:0; var barPct=Math.min(100,pct);
            var color=pct>=100?'#ff4757':pct>=80?'#ff783c':pct>=50?'#f7b731':'#00d26a';
            var over=spent>b.limit;
            rowsHtml+='<div class="budget-row"><div style="display:flex;justify-content:space-between;align-items:center;gap:8px;"><span style="font-size:14px;color:var(--text);font-weight:500;">'+cat.icon+' '+esc(cat.name)+'</span><span style="font-size:12px;color:var(--dim);"><b style="color:var(--text);">'+fmt(spent)+'</b> / '+fmt(b.limit)+'</span></div><div class="budget-bar-bg"><div class="budget-bar-fill" style="width:'+barPct+'%;background:'+color+'"></div></div>'+(over?'<div style="font-size:11px;color:var(--red);font-weight:600;margin-top:2px;">Превышение: '+fmt(spent-b.limit)+'</div>':'')+'</div>';
        }
    }
    var collapseClass=state.budgetsCollapsed?' collapsed':'';
    var rotateClass=state.budgetsCollapsed?' rotated':'';
    return '<div class="card"><div class="budgets-header"><div class="card-title" style="margin:0;">Бюджеты</div><button type="button" class="budgets-toggle '+rotateClass+'" data-action="budgets-toggle">▼</button></div><div class="budgets-collapse-wrap'+collapseClass+'"><div class="budgets-month-nav"><button type="button" class="budgets-month-arrow" data-action="budgets-month-prev">←</button><div class="budgets-month-label" data-action="budgets-month-open">'+formatMonthRu(viewMonth)+'</div><button type="button" class="budgets-month-arrow" data-action="budgets-month-next"' + (canGoForward?'':' disabled') + '>→</button></div><div class="budgets-list">'+rowsHtml+'</div><button type="button" class="budgets-add-btn" data-action="budgets-edit-open">+ Изменить бюджеты</button></div></div>';
}

function shiftMonthKey(key, delta) { var p=key.split('-'); var y=parseInt(p[0],10),m=parseInt(p[1],10); m+=delta; while(m<1){m+=12;y--;} while(m>12){m-=12;y++;} return y+'-'+(m<10?'0'+m:m); }
function budgetsShiftMonth(delta) { var cur=state.budgetsViewMonth||getCurrentMonthKey(); var next=shiftMonthKey(cur,delta); if(next>getCurrentMonthKey())return; state.budgetsViewMonth=next; saveState(); renderBalance(document.getElementById('pane-balance')); }
function budgetsToggleCollapse() { state.budgetsCollapsed=!state.budgetsCollapsed; saveState(); var w=document.querySelector('.budgets-collapse-wrap'); var b=document.querySelector('.budgets-toggle'); if(w)w.classList.toggle('collapsed'); if(b)b.classList.toggle('rotated'); }
function openBudgetsMonthPicker() {
    var months = [getCurrentMonthKey()];
    state.budgets.forEach(function(b){ if(months.indexOf(b.month)===-1) months.push(b.month); });
    months.sort().reverse();
    var html = '<h3>Выбрать месяц</h3><div style="display:flex;flex-direction:column;gap:8px;">';
    for(var i=0; i<months.length; i++) {
        html += '<button type="button" class="cat-btn' + (months[i] === (state.budgetsViewMonth||getCurrentMonthKey()) ? ' active' : '') + '" data-action="budgets-month-set" data-month="' + months[i] + '">' + formatMonthRu(months[i]) + '</button>';
    }
    html += '</div>';
    showModal(html);
}
function budgetsSetMonth(key) { state.budgetsViewMonth = key; saveState(); hideModal(); renderBalance(document.getElementById('pane-balance')); }
function openBudgetsEditModal() {
    var viewMonth = state.budgetsViewMonth || getCurrentMonthKey();
    var html = '<h3>Бюджеты на ' + formatMonthRu(viewMonth) + '</h3><div style="display:flex;flex-direction:column;gap:10px;">';
    for (var i = 0; i < CATEGORIES.length; i++) {
        var cat = CATEGORIES[i];
        var currentLimit = null;
        for(var j=0; j<state.budgets.length; j++) { if(state.budgets[j].categoryId===cat.id && state.budgets[j].month===viewMonth) { currentLimit = state.budgets[j].limit; break; } }
        html += '<div style="display:flex;align-items:center;gap:10px;"><span style="width:34px;height:34px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:18px;background:' + cat.color + '33;flex-shrink:0;">' + cat.icon + '</span>' +
            '<span style="flex:1;font-size:14px;">' + esc(cat.name) + '</span>' +
            '<input type="text" inputmode="decimal" autocomplete="off" data-budget-input="' + esc(cat.id) + '" placeholder="0" value="' + (currentLimit!==null?currentLimit:'') + '" style="width:110px;margin:0;padding:10px;font-size:15px;text-align:right;"></div>';
    }
    html += '</div><button type="button" class="btn-full btn-primary" data-action="budgets-save" data-month="' + esc(viewMonth) + '" style="margin-top:16px;">Сохранить</button><button type="button" class="btn-full btn-outline" data-action="close-modal">Отмена</button>';
    showModal(html);
}
function saveBudgetsFromModal(monthKey) {
    var inputs = document.querySelectorAll('[data-budget-input]');
    for (var i = 0; i < inputs.length; i++) {
        var inp = inputs[i];
        var catId = inp.getAttribute('data-budget-input');
        var raw = String(inp.value).replace(/\s/g, '').replace(',', '.').trim();
        var limit = raw !== '' ? (Number(raw) >= 0 ? Number(raw) : 0) : 0;
        state.budgets = state.budgets.filter(function(b){ return !(b.categoryId===catId && b.month===monthKey); });
        if (limit > 0) state.budgets.push({ categoryId: catId, limit: limit, month: monthKey });
    }
    if (state.budgetsViewMonth === null) state.budgetsViewMonth = monthKey;
    saveState(); hideModal(); renderBalance(document.getElementById('pane-balance'));
}

/* ============ SETTINGS ============ */
function renderSettings(c) {
    c.innerHTML='<div class="card"><div class="card-title" style="margin-bottom:15px">Управление данными</div><p style="font-size:13px;color:var(--dim);margin:0 0 15px;line-height:1.5;">Все данные хранятся только на этом устройстве.</p><button type="button" class="btn-full btn-primary" data-action="export">💾 Экспорт (JSON)</button><button type="button" class="btn-full btn-outline" data-action="import">📥 Импорт (JSON)</button><input type="file" id="importFile" accept=".json,application/json"><div style="margin-top:20px;border-top:1px solid var(--border);padding-top:15px;"><div class="card-title" style="margin-bottom:10px">Сброс данных</div><button type="button" class="btn-full btn-danger" data-action="reset">Удалить все данные</button></div></div><div class="card"><div class="card-title">О приложении</div><p style="font-size:12px;color:var(--dim);line-height:1.5;margin:8px 0 0;">Finance Shield v8<br>Локальное хранилище. Без серверов. Без рекламы.</p></div>';
}
function exportData() { var json=JSON.stringify(state,null,2); var blob=new Blob([json],{type:'application/json'}); var url=URL.createObjectURL(blob); var a=document.createElement('a'); a.href=url; a.download='finance_backup_'+new Date().toISOString().slice(0,10)+'.json'; document.body.appendChild(a); a.click(); document.body.removeChild(a); setTimeout(function(){try{URL.revokeObjectURL(url);}catch(_){}},1500); }
function importData() { var input=document.getElementById('importFile'); if(!input||!input.files||!input.files[0])return; var reader=new FileReader(); reader.onload=function(e){try{var imported=JSON.parse(e.target.result); if(!imported||typeof imported!=='object'||imported.balance===undefined){alert('Ошибка формата.');return;} showConfirm('Заменить все данные?','Текущие данные будут заменены.',function(){state=migrate(imported);saveState();switchTab('balance');alert('Данные восстановлены!');},{danger:true,okLabel:'Заменить'});}catch(err){alert('Ошибка чтения: '+err.message);}}; reader.readAsText(input.files[0]); try{input.value='';}catch(_){} }
function resetAll() { showConfirm('Удалить все данные?','Будут удалены: баланс, долги, планы, история, покупки.',function(){showConfirm('Последнее предупреждение','Точно удалить всё?',function(){state=emptyState();saveState();switchTab('balance');},{danger:true,okLabel:'Удалить навсегда'});},{danger:true,okLabel:'Продолжить'}); }

/* ============ ACTIONS ============ */
var ACTIONS = {
    'op': function(el){doOp(Number(el.getAttribute('data-sign')));},
    'cat-pick': function(el){pickCategory(el.getAttribute('data-id'));},
    'cat-cancel': function(){cancelCategoryPicker();},
    'open-cat-filter': function(){openCategoryFilter();},
    'cat-filter-apply': function(){applyCategoryFilter();},
    'cat-filter-reset': function(){resetCategoryFilter();},
    'clear-history-search': function(){historySearch='';historyViewCount=50;_animateList=true;renderBalance(document.getElementById('pane-balance'));},
    'history-start-select': function(el){startSelectionMode(el.getAttribute('data-id'));},
    'history-toggle-select': function(el){toggleSelect(el.getAttribute('data-id'));},
    'exit-selection': function(){exitSelectionMode();},
    'bulk-edit-category': function(){bulkEditCategory();},
    'bulk-edit-date': function(){bulkEditDate();},
    'bulk-edit-name': function(){bulkEditName();},
    'bulk-delete': function(){bulkDelete();},
    'bulk-apply-category': function(el){bulkApplyCategory(el.getAttribute('data-id'));},
    'bulk-apply-date': function(){bulkApplyDate();},
    'bulk-apply-name': function(){bulkApplyName();},
    'bulk-apply-delete': function(){bulkApplyDelete();},
    'history-edit': function(el){showEditHistoryItem(el.getAttribute('data-id'));},
    'edit-cat-pick': function(el){editPickCategory(el.getAttribute('data-id'));},
    'save-edit-history': function(el){saveEditedHistory(el.getAttribute('data-id'));},
    'delete-edit-history': function(el){deleteFromEdit(el.getAttribute('data-id'));},
    'history-del': function(el){showDeleteHistoryItem(el.getAttribute('data-id'),{refund:false,restore:false});},
    'history-confirm-del': function(el){deleteHistoryItem(el.getAttribute('data-id'),el.getAttribute('data-refund')==='1',el.getAttribute('data-restore')==='1');},
    'tf': function(el){setTimeframe(el.getAttribute('data-tf'));},
    'period-preset': function(el){applyPeriodPreset(el.getAttribute('data-preset'));},
    'period-open': function(){openPeriodPicker();},
    'period-apply': function(){applyPeriod();},
    'budgets-toggle': function(){budgetsToggleCollapse();},
    'budgets-month-prev': function(){budgetsShiftMonth(-1);},
    'budgets-month-next': function(){budgetsShiftMonth(1);},
    'budgets-month-open': function(){openBudgetsMonthPicker();},
    'budgets-month-set': function(el){budgetsSetMonth(el.getAttribute('data-month'));},
    'budgets-edit-open': function(){openBudgetsEditModal();},
    'budgets-save': function(el){saveBudgetsFromModal(el.getAttribute('data-month'));},
    'add-debt': function(){showAddDebt();},
    'edit-debt': function(el){showAddDebt(el.getAttribute('data-id'));},
    'save-debt': function(el){saveDebt(el.getAttribute('data-id')||null);},
    'pay-debt': function(el){showAddDebt(el.getAttribute('data-id')); /* Упрощено для UI, payDebt вызывается напрямую */},
    'del-debt': function(el){delDebt(el.getAttribute('data-id'));},
    'add-plan': function(){showAddPlan();},
    'edit-plan': function(el){showAddPlan(el.getAttribute('data-id'));},
    'save-plan': function(el){savePlan(el.getAttribute('data-id')||null);},
    'move-plan': function(el){movePlan(el.getAttribute('data-id'),Number(el.getAttribute('data-dir')));},
    'fund-plan': function(el){showFundPlan(el.getAttribute('data-id'));},
    'save-fund': function(el){fundPlan(el.getAttribute('data-id'));},
    'del-plan': function(el){delPlan(el.getAttribute('data-id'));},
    'add-shopping': function(){showAddShopping();},
    'shopping-toggle': function(el){toggleShoppingItem(el.getAttribute('data-id'));},
    'del-shopping': function(el){delShopping(el.getAttribute('data-id'));},
    'shopping-pick-cat': function(el){shoppingPickCat(el.getAttribute('data-id'));},
    'save-shopping': function(el){saveShopping(el.getAttribute('data-id')||null);},
    'shopping-convert': function(){shoppingConvert();},
    'shopping-convert-confirm': function(){shoppingConvertConfirm();},
    'shopping-deselect': function(){shoppingDeselect();},
    'export': function(){exportData();},
    'import': function(){var i=document.getElementById('importFile');if(i)i.click();},
    'reset': function(){resetAll();},
    'close-modal': function(){hideModal();},
    'confirm-ok': function(){var cb=window._confirmCallback; window._confirmCallback=null; hideModal(); if(typeof cb==='function')cb();},
    'confirm-cancel': function(){window._confirmCallback=null; hideModal();},
    'debt-quick': function(el){document.getElementById('debtAmt').value=String(el.getAttribute('data-amount'));}
};

function handleClick(e) { var t=e.target; if(!t||typeof t.closest!=='function')return; var el=t.closest('[data-action]'); if(!el)return; var fn=ACTIONS[el.getAttribute('data-action')]; if(fn)fn(el); }
function handleMainContentClick(e) {
    var t=e.target; if(!t)return;
    if(typeof t.closest!=='function')return;
    var el=t.closest('[data-action]'); if(!el)return;
    var action=el.getAttribute('data-action');
    if(selectionMode&&(action==='history-edit'||action==='history-toggle-select')){var id=el.getAttribute('data-id');if(id)toggleSelect(id);return;}
    var fn=ACTIONS[action]; if(fn)fn(el);
}

/* ============ LONG PRESS & PC SELECTION ============ */
var _longPressTimer=null; var _longPressFired=false;
function attachLongPressHandlers() {
    var items=document.querySelectorAll('[data-longpress="history-start-select"]');
    for(var i=0;i<items.length;i++){(function(el){
        if(el._lpAttached)return; el._lpAttached=true;
        el.addEventListener('touchstart',function(){_longPressFired=false;_longPressTimer=setTimeout(function(){_longPressFired=true;var id=el.getAttribute('data-id');if(id)startSelectionMode(id);},500);},{passive:true});
        el.addEventListener('touchend',function(){if(_longPressTimer){clearTimeout(_longPressTimer);_longPressTimer=null;}});
        el.addEventListener('touchcancel',function(){if(_longPressTimer){clearTimeout(_longPressTimer);_longPressTimer=null;}});
        el.addEventListener('touchmove',function(){if(_longPressTimer){clearTimeout(_longPressTimer);_longPressTimer=null;}});
        el.addEventListener('contextmenu',function(e){e.preventDefault();_longPressFired=true;var id=el.getAttribute('data-id');if(id)startSelectionMode(id);});
    })(items[i]);}
}

/* ============ MODAL & BACK BUTTON ============ */
var modalVisible=false;
function showModal(html) {
    var content=document.getElementById('modalContent'); var overlay=document.getElementById('modalOverlay');
    content.innerHTML='<button type="button" class="modal-x" data-action="close-modal">✕</button>'+html;
    overlay.style.display='block';
    requestAnimationFrame(()=>{requestAnimationFrame(()=>{overlay.classList.add('visible');});});
    modalVisible=true;
}
function hideModal() {
    var overlay=document.getElementById('modalOverlay'); var content=document.getElementById('modalContent');
    overlay.classList.remove('visible');
    setTimeout(function(){if(!overlay.classList.contains('visible')){overlay.style.display='none';content.innerHTML='';}},325);
    modalVisible=false; window._confirmCallback=null;
}
function showConfirm(title,text,onOk,opts){
    opts=opts||{}; window._confirmCallback=function(){window._confirmCallback=null;try{onOk();}catch(e){console.error(e);}};
    showModal('<h3>'+esc(title)+'</h3><p class="confirm-text">'+esc(text)+'</p><div class="btn-row"><button type="button" class="btn-full btn-secondary" data-action="confirm-cancel">'+esc(opts.cancelLabel||'Отмена')+'</button><button type="button" class="btn-full '+(opts.danger?'btn-danger':'btn-primary')+'" data-action="confirm-ok">'+esc(opts.okLabel||'Подтвердить')+'</button></div>');
}

document.addEventListener('keydown', function(e){
    if(e.key==='Escape'||e.key==='Backspace'){
        if(modalVisible){hideModal();e.preventDefault();}
        else if(selectionMode){exitSelectionMode();e.preventDefault();}
        else if(shoppingSelected.length>0){shoppingDeselect();e.preventDefault();}
    }
});

/* ============ INIT ============ */
function bindEvents() {
    document.getElementById('navTabs').addEventListener('click',function(e){var t=e.target;if(!t||typeof t.closest!=='function')return;var btn=t.closest('.tab-btn');if(btn)switchTab(btn.getAttribute('data-tab'));});
    document.getElementById('mainContent').addEventListener('click',handleMainContentClick);
    document.getElementById('modalOverlay').addEventListener('click',function(e){if(e.target&&e.target.id==='modalOverlay'){_pendingOp=null;hideModal();return;}handleClick(e);});
    document.body.addEventListener('change',function(e){if(e.target&&e.target.id==='importFile')importData();});
    document.addEventListener('click',function(e){var t=e.target;if(!t)return;var acLists=document.querySelectorAll('.autocomplete-list');for(var i=0;i<acLists.length;i++){if(!acLists[i].contains(t)&&t.tagName!=='INPUT')acLists[i].classList.remove('visible');}});
    document.addEventListener('click',function(e){var t=e.target;if(t&&t.classList.contains('dp-cell'))handleDPSelect(t.getAttribute('data-dp'),t.getAttribute('data-kind'),t.getAttribute('data-val'));});
    window.addEventListener('resize',function(){if(currentTab==='analytics'){var canvas=document.getElementById('chartCanvas');if(canvas&&chartSlotsCache&&chartSlotsCache.length>0)drawChart(canvas,chartSlotsCache,chartTfCache);}});
}

function init() {
    try {
        loadState();
        renderHeader();
        bindEvents();
        initSwipeTabs();
        switchTab('balance', true);
    } catch(e) { var screen=document.getElementById('errScreen'); screen.textContent='INIT ERROR:\n'+(e&&e.stack?e.stack:String(e)); screen.style.display='block'; }
}
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init); else init();