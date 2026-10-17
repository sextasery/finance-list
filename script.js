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
var TYPE = { INCOME: 'income', EXPENSE: 'expense', TRANSFER: 'transfer' };
var FILTERS = [
    { id: 'all', label: 'Все' },
    { id: TYPE.INCOME, label: 'Доходы' },
    { id: TYPE.EXPENSE, label: 'Расходы' },
    { id: TYPE.TRANSFER, label: 'Переводы' }
];
var DEBT_FULL_PREFIX = 'Возврат долга: ';
var DEBT_PARTIAL_PREFIX = 'Частичный возврат: ';
var DEBT_PARTIAL_MARKER = ' (остаток ';
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

/* ============ HEADER & ANIMATION ============ */
var _numAnimFrames = {};
function animateNumber(el, toValue, duration) {
    if (!el) return;
    duration = duration || 250; // Ускоренная анимация
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
    animateNumber(balEl, state.balance, 250);
    animateNumber(debtEl, debtSum, 250);
    animateNumber(planEl, planSum, 250);
}

/* ============ TABS ============ */
function switchTab(tab) {
    currentTab = tab;
    if (selectionMode) { selectionMode = false; selectedIds = []; }
    shoppingSelected = [];
    var tabs = document.querySelectorAll('.tab-btn');
    for (var i=0; i<tabs.length; i++) { if(tabs[i].getAttribute('data-tab')===tab) tabs[i].classList.add('active'); else tabs[i].classList.remove('active'); }
    
    var c = document.getElementById('mainContent');
    c.innerHTML = '';
    if (tab === 'balance') renderBalance(c);
    else if (tab === 'debts') renderDebts(c);
    else if (tab === 'plans') renderPlans(c);
    else if (tab === 'shopping') renderShopping(c);
    else if (tab === 'analytics') renderAnalytics(c);
    else if (tab === 'settings') renderSettings(c);
    c.scrollTop = 0;
}

/* ============ ФИЛЬТРЫ ============ */
function renderFiltersBar() {
    var bar = document.getElementById('filtersBar');
    if (!bar) return;
    var html = '<div class="filters">';
    for (var i=0; i<FILTERS.length; i++) {
        var f = FILTERS[i];
        html += '<button type="button" class="filter-btn' + (historyFilter===f.id?' active':'') + '" data-action="filter" data-filter="'+f.id+'">'+f.label+'</button>';
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
    if (historyFilter === TYPE.INCOME) filtered = filtered.filter(function(h){return h.amount>0;});
    else if (historyFilter === TYPE.EXPENSE) filtered = filtered.filter(function(h){return h.amount<0;});
    else if (historyFilter === TYPE.TRANSFER) filtered = filtered.filter(function(h){return h.type===TYPE.TRANSFER;});
    
    if (historyCatFilter.length > 0) {
        filtered = filtered.filter(function(h){return historyCatFilter.indexOf(h.categoryId)!==-1;});
    }
    
    // Фильтр по датам
    if (historyDateFrom && historyDateTo) {
        var fromTs = new Date(historyDateFrom).getTime();
        var toTs = new Date(historyDateTo).getTime();
        filtered = filtered.filter(function(h){
            var ts = new Date(h.date).getTime();
            return ts >= fromTs && ts <= toTs;
        });
    }
    
    var query = historySearch.trim().toLowerCase();
    if (query) {
        filtered = filtered.filter(function(h){
            if ((h.desc||'').toLowerCase().indexOf(query)!==-1) return true;
            var amtStr = String(Math.abs(Math.round(h.amount)));
            if (amtStr.indexOf(query)!==-1) return true;
            return false;
        });
    }
    
    filtered = filtered.slice().sort(function(a,b){return new Date(b.date).getTime()-new Date(a.date).getTime();});
    return filtered;
}

/* ============ ОТРИСОВКА ЗАПИСИ ============ */
function renderHistoryItem(h) {
    var isPos = h.amount > 0;
    var color = isPos ? 'var(--green)' : 'var(--red)';
    var sign = isPos ? '+' : '';
    var badgeHtml = '';
    if (h.categoryId) {
        var cat = getCategoryAny(h.categoryId);
        if (cat) badgeHtml = '<span class="cat-badge '+cat.cssClass+'">'+cat.icon+' '+esc(cat.name)+'</span>';
    }
    var isSelected = selectedIds.indexOf(h.id) !== -1;
    if (selectionMode) {
        return '<div class="list-item selectable'+(isSelected?' selected':'')+'" data-action="history-toggle-select" data-id="'+esc(h.id)+'">'+
            '<div class="select-checkbox">✓</div>'+
            '<div class="item-left"><div class="item-name"><span class="item-desc">'+(esc(h.desc)||'Без названия')+'</span></div>'+badgeHtml+
            '<div class="item-sub">'+formatDateTime(h.date)+'</div></div>'+
            '<div class="item-right"><div class="item-amount" style="color:'+color+'">'+sign+fmt(h.amount)+'</div></div></div>';
    }
    return '<div class="list-item tappable" data-action="history-edit" data-id="'+esc(h.id)+'" data-longpress="history-start-select">'+
        '<div class="item-left"><div class="item-name"><span class="item-desc">'+(esc(h.desc)||'Без названия')+'</span></div>'+badgeHtml+
        '<div class="item-sub">'+formatDateTime(h.date)+'</div></div>'+
        '<div class="item-right"><div class="item-amount" style="color:'+color+'">'+sign+fmt(h.amount)+'</div>'+
        '<button type="button" class="history-del-btn" data-action="history-del" data-id="'+esc(h.id)+'">✕</button></div></div>';
}

/* ============ BALANCE TAB ============ */
function renderBalance(c) {
    var savedScroll = c.scrollTop;
    var formHtml = '<div class="card">'+
        '<div class="card-title" style="margin-bottom:10px">Операция с остатком</div>'+
        '<input type="text" id="opAmount" placeholder="Сумма" inputmode="decimal" autocomplete="off">'+
        '<input type="text" id="opDesc" placeholder="Название" autocomplete="off">'+
        '<input type="text" id="opTime" placeholder="Время (ЧЧ:ММ)" autocomplete="off" value="'+formatTimeFromIso(new Date().toISOString())+'">'+
        '<div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">'+
            '<button type="button" class="btn-full btn-primary" data-action="op" data-sign="1">+ Пополнить</button>'+
            '<button type="button" class="btn-full btn-danger" data-action="op" data-sign="-1">− Списать</button>'+
        '</div></div>';
    
    var filtered = getFilteredHistory();
    var total = filtered.length;
    var visible = Math.min(historyViewCount, total);
    var filterActive = historyCatFilter.length > 0 || historyDateFrom;
    var hasSearch = historySearch.length > 0;
    
    var toolsHtml = '<div class="history-tools">'+
        '<div class="history-search-wrap'+(hasSearch?' has-value':'')+'">'+
            '<input type="text" class="history-search" id="historySearch" placeholder="Поиск по истории" autocomplete="off" value="'+esc(historySearch)+'">'+
            '<button type="button" class="history-search-clear" data-action="clear-history-search">✕</button></div></div>'+
        '<div class="history-tools" style="margin-top:-4px;">'+
            '<button type="button" class="history-cat-btn'+(filterActive?' active':'')+'" data-action="open-cat-filter">🏷 '+(filterActive?'Фильтры':'Категории')+'</button>'+
            '<button type="button" class="history-cat-btn" data-action="open-date-filter">📅 Даты</button></div>';
    
    var selBar = '';
    if (selectionMode && selectedIds.length > 0) {
        selBar = '<div class="selection-bar"><span class="sb-count">Выбрано: '+selectedIds.length+'</span>'+
            '<button type="button" data-action="bulk-edit-category">️ Категория</button>'+
            '<button type="button" data-action="bulk-edit-date"> Дата</button>'+
            '<button type="button" data-action="bulk-edit-name">✏️ Название</button>'+
            '<button type="button" class="danger" data-action="bulk-delete">️ Удалить</button>'+
            '<button type="button" data-action="exit-selection">Отмена</button></div>';
    }
    
    var histHtml = '<div class="card"><div class="card-title history-card-title">История операций</div>'+toolsHtml+selBar;
    if (total === 0) histHtml += '<div class="empty-state">'+(hasSearch||filterActive?'Ничего не найдено':'Нет записей<br>Начни с пополнения баланса')+'</div>';
    else {
        histHtml += '<div id="historyList">';
        for (var k=0; k<visible; k++) histHtml += renderHistoryItem(filtered[k]);
        histHtml += '</div>';
        if (total > visible) histHtml += '<div class="history-load-more" id="historyLoadMore">Показано '+visible+' из '+total+' — прокрути вниз</div>';
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
    histHtml += '<div class="summary-box"><span>Доходы за месяц: <span class="summary-val" style="color:var(--green)">'+fmt(income)+'</span></span><span>Расходы за месяц: <span class="summary-val" style="color:var(--red)">'+fmt(expense)+'</span></span></div></div>';
    
    c.innerHTML = formHtml + buildBudgetsBlockHtml() + histHtml;
    c.scrollTop = savedScroll;
    
    var searchEl = document.getElementById('historySearch');
    if (searchEl) searchEl.addEventListener('input', handleHistorySearch);
    attachLongPressHandlers();
}

function handleHistorySearch(e) {
    historySearch = e.target.value;
    historyViewCount = 50;
    if (_searchTimer) clearTimeout(_searchTimer);
    _searchTimer = setTimeout(function(){
        var c = document.getElementById('mainContent');
        if (!c) return;
        var scrollTop = c.scrollTop;
        _animateList = true;
        renderBalance(c);
        c.scrollTop = scrollTop;
        var el = document.getElementById('historySearch');
        if (el) { el.focus(); try{el.setSelectionRange(el.value.length, el.value.length);}catch(_){} }
    }, 200);
}

var _searchTimer = null;

/* ============ ФИЛЬТР ПО ДАТАМ ============ */
function openDateFilter() {
    var fromIso = historyDateFrom || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
    var toIso = historyDateTo || new Date().toISOString();
    showModal('<h3>Фильтр по датам</h3>'+
        '<div class="field-label">От</div>'+
        '<input type="date" id="dateFrom" value="'+fromIso.slice(0,10)+'">'+
        '<div class="field-label">До</div>'+
        '<input type="date" id="dateTo" value="'+toIso.slice(0,10)+'">'+
        '<button type="button" class="btn-full btn-primary" data-action="apply-date-filter">Применить</button>'+
        '<button type="button" class="btn-full btn-secondary" data-action="clear-date-filter">Сбросить</button>'+
        '<button type="button" class="btn-full btn-outline" data-action="close-modal">Отмена</button>');
}

function applyDateFilter() {
    var fromEl = document.getElementById('dateFrom');
    var toEl = document.getElementById('dateTo');
    if (!fromEl || !toEl) return;
    var fromVal = fromEl.value;
    var toVal = toEl.value;
    if (!fromVal || !toVal) { hideModal(); return; }
    historyDateFrom = new Date(fromVal).toISOString();
    historyDateTo = new Date(toVal + 'T23:59:59').toISOString();
    historyViewCount = 50;
    _animateList = true;
    hideModal();
    renderBalance(document.getElementById('mainContent'));
}

function clearDateFilter() {
    historyDateFrom = null;
    historyDateTo = null;
    historyViewCount = 50;
    _animateList = true;
    hideModal();
    renderBalance(document.getElementById('mainContent'));
}

/* ============ ФИЛЬТР ПО КАТЕГОРИЯМ ============ */
function openCategoryFilter() {
    var html = '<h3>Фильтр по категориям</h3><div style="display:flex;flex-direction:column;gap:8px;">';
    for (var i=0; i<CATEGORIES.length; i++) {
        var cat = CATEGORIES[i];
        var checked = historyCatFilter.indexOf(cat.id) !== -1;
        html += '<label class="checkbox-row"><input type="checkbox" data-cat-filter="'+esc(cat.id)+'"'+(checked?' checked':'')+'>'+
            '<span class="cb-label">'+cat.icon+' '+esc(cat.name)+'</span></label>';
    }
    html += '</div><div class="btn-row" style="margin-top:14px;">'+
        '<button type="button" class="btn-full btn-secondary" data-action="cat-filter-reset">Сбросить</button>'+
        '<button type="button" class="btn-full btn-primary" data-action="cat-filter-apply">Готово</button></div>';
    showModal(html);
}

function applyCategoryFilter() {
    var checkboxes = document.querySelectorAll('[data-cat-filter]');
    var newFilter = [];
    for (var i=0; i<checkboxes.length; i++) { if (checkboxes[i].checked) newFilter.push(checkboxes[i].getAttribute('data-cat-filter')); }
    historyCatFilter = newFilter;
    historyViewCount = 50;
    _animateList = true;
    hideModal();
    renderBalance(document.getElementById('mainContent'));
}

function resetCategoryFilter() {
    var checkboxes = document.querySelectorAll('[data-cat-filter]');
    for (var i=0; i<checkboxes.length; i++) checkboxes[i].checked = false;
}

/* ============ ОПЕРАЦИИ ============ */
function doOp(sign) {
    var amtInput = document.getElementById('opAmount');
    var descInput = document.getElementById('opDesc');
    var timeInput = document.getElementById('opTime');
    if (!amtInput || !descInput) return;
    var amt = parseAmount(amtInput.value);
    if (amt === null) { try{amtInput.focus();}catch(_){} return; }
    var desc = descInput.value.trim();
    var timeStr = timeInput ? timeInput.value.trim() : '';
    var opType = (sign > 0) ? TYPE.INCOME : TYPE.EXPENSE;
    showCategoryPicker(amt, desc, opType, null, timeStr);
}

function showCategoryPicker(amt, desc, opType, preselectId, timeStr) {
    _pendingOp = {amt:amt, desc:desc, opType:opType, catId:preselectId||null, timeStr:timeStr||''};
    var list = getCategoriesByType(opType);
    var isIncome = (opType === TYPE.INCOME);
    var title = isIncome ? 'Откуда пришло?' : 'Куда потратил?';
    var amountStr = (isIncome?'+':'−') + fmt(amt);
    var amountColor = isIncome ? 'var(--green)' : 'var(--red)';
    var buttonsHtml = '';
    for (var i=0; i<list.length; i++) {
        var cat = list[i];
        var active = (preselectId===cat.id) ? ' active' : '';
        buttonsHtml += '<button type="button" class="cat-btn'+active+'" data-action="cat-pick" data-id="'+esc(cat.id)+'">'+
            '<span class="cat-icon">'+cat.icon+'</span><span>'+esc(cat.name)+'</span></button>';
    }
    showModal('<h3>'+title+'</h3><div class="cat-amount" style="color:'+amountColor+'">'+amountStr+'</div>'+(desc?'<div class="cat-desc">'+esc(desc)+'</div>':'')+
        '<div class="cat-list">'+buttonsHtml+'</div><button type="button" class="btn-full btn-outline" data-action="cat-cancel">Отмена</button>');
}

var _pendingOp = null;
function pickCategory(catId) {
    if (!_pendingOp) return;
    var op = _pendingOp; _pendingOp = null; hideModal();
    var sign = (op.opType===TYPE.INCOME) ? 1 : -1;
    applyOp(sign, op.amt, op.desc, catId, op.timeStr);
}

function cancelCategoryPicker() {
    _pendingOp = null;
    hideModal();
    var amtInput = document.getElementById('opAmount');
    if (amtInput) { try{amtInput.focus();}catch(_){} }
}

function applyOp(sign, amt, desc, categoryId, timeStr) {
    var delta = amt * sign;
    if (sign < 0 && state.balance + delta < 0) {
        showConfirm('Баланс станет отрицательным', 'После операции остаток: '+fmt(state.balance+delta)+'. Продолжить?', 
            function(){commitOp(sign, amt, desc, categoryId, delta, timeStr);}, {danger:true, okLabel:'Всё равно списать'});
        return;
    }
    commitOp(sign, amt, desc, categoryId, delta, timeStr);
}

function commitOp(sign, amt, desc, categoryId, delta, timeStr) {
    state.balance += delta;
    var isoNow = new Date().toISOString();
    if (timeStr) isoNow = applyTimeToIso(isoNow, timeStr);
    var record = {id:uid(), date:isoNow, type:sign>0?TYPE.INCOME:TYPE.EXPENSE, desc:desc, amount:delta};
    if (categoryId) record.categoryId = categoryId;
    state.history.unshift(record);
    _flashId = record.id;
    saveState();
    hideModal();
    renderBalance(document.getElementById('mainContent'));
}

/* ============ DEBTS ============ */
function renderDebts(c) {
    var html = '<div class="card"><div class="card-header"><div class="card-title">Кому я должен</div><button type="button" class="btn-icon" data-action="add-debt">+</button></div>';
    if (state.debts.length === 0) html += '<div class="empty-state">Долгов нет 🎉</div>';
    else {
        var sorted = state.debts.slice().sort(function(a,b){return new Date(a.createdAt||0)-new Date(b.createdAt||0);});
        for (var i=0; i<sorted.length; i++) {
            var d = sorted[i];
            html += '<div class="list-item"><div class="item-left"><div class="item-name">'+esc(d.to)+'</div>'+
                '<div class="item-sub">Взял: '+formatDate(d.createdAt)+'</div></div>'+
                '<div class="item-right"><div class="item-amount" style="color:var(--red)">'+fmt(d.amount)+'</div>'+
                '<div class="item-actions">'+
                    '<button type="button" class="mini-btn pay" data-action="pay-debt" data-id="'+esc(d.id)+'">Вернул</button>'+
                    '<button type="button" class="mini-btn edit" data-action="edit-debt" data-id="'+esc(d.id)+'">✏️</button>'+
                    '<button type="button" class="mini-btn del" data-action="del-debt" data-id="'+esc(d.id)+'">✕</button></div></div></div>';
        }
    }
    html += '</div>';
    c.innerHTML = html;
}

function showAddDebt(existingId) {
    var d = (existingId!=null) ? state.debts.filter(function(x){return x.id===existingId;})[0] : null;
    var dateIso = d ? d.createdAt : new Date().toISOString();
    showModal('<h3>'+(d?'Изменить долг':'Новый долг')+'</h3>'+
        '<input type="text" id="debtTo" placeholder="Кому (Имя)" autocomplete="off" value="'+esc(d?d.to:'')+'">'+
        '<input type="text" id="debtAmt" placeholder="Сумма" inputmode="decimal" autocomplete="off" value="'+(d?d.amount:'')+'">'+
        '<div class="field-label">Когда взял</div>'+
        '<input type="date" id="debtDate" value="'+dateIso.slice(0,10)+'">'+
        '<button type="button" class="btn-full btn-primary" data-action="save-debt" data-id="'+(existingId!=null?esc(existingId):'')+'">'+(d?'Сохранить':'Добавить')+'</button>'+
        '<button type="button" class="btn-full btn-outline" data-action="close-modal">Отмена</button>');
}

function saveDebt(id) {
    var toEl = document.getElementById('debtTo');
    var amtEl = document.getElementById('debtAmt');
    var dateEl = document.getElementById('debtDate');
    var to = toEl ? toEl.value.trim() : '';
    var amt = amtEl ? parseAmount(amtEl.value) : null;
    var dateIso = dateEl ? new Date(dateEl.value).toISOString() : new Date().toISOString();
    if (!to || amt === null) return;
    var existing = (id!=null) ? state.debts.filter(function(x){return x.id===id;})[0] : null;
    if (existing) { existing.to=to; existing.amount=amt; existing.createdAt=dateIso; }
    else { state.debts.push({id:uid(), to:to, amount:amt, createdAt:dateIso}); }
    saveState(); hideModal(); renderDebts(document.getElementById('mainContent'));
}

function payDebt(id, amount) {
    var d = null; for(var i=0;i<state.debts.length;i++) if(state.debts[i].id===id) {d=state.debts[i]; break;}
    if (!d) return;
    var amt = parseAmount(amount);
    if (amt===null || amt>d.amount || amt>state.balance) { alert('Ошибка суммы или недостаточно средств.'); return; }
    state.balance -= amt;
    d.amount -= amt;
    var descText = (d.amount<=0.0001) ? DEBT_FULL_PREFIX+d.to : DEBT_PARTIAL_PREFIX+d.to+DEBT_PARTIAL_MARKER+fmt(d.amount)+')';
    state.history.unshift({id:uid(), date:new Date().toISOString(), type:TYPE.TRANSFER, desc:descText, amount:-amt});
    _flashId = state.history[0].id;
    if (d.amount<=0.0001) state.debts = state.debts.filter(function(x){return x.id!==id;});
    saveState(); renderHeader(); renderDebts(document.getElementById('mainContent'));
}

function delDebt(id) {
    showConfirm('Удалить долг?', 'Запись о долге будет удалена. Деньги с баланса НЕ списываются.', function(){
        state.debts = state.debts.filter(function(x){return x.id!==id;});
        saveState(); renderDebts(document.getElementById('mainContent'));
    }, {danger:true, okLabel:'Удалить'});
}

/* ============ PLANS ============ */
function renderPlans(c) {
    var html = '<div class="card"><div class="card-header"><div class="card-title">Планы на покупки</div><button type="button" class="btn-icon" data-action="add-plan">+</button></div>';
    if (state.plans.length === 0) html += '<div class="empty-state">Нет запланированных покупок</div>';
    else {
        for (var i=0; i<state.plans.length; i++) {
            var p = state.plans[i];
            var pct = Math.min(100, Math.round((p.current/p.target)*100));
            var isFirst = i===0;
            var isLast = i===state.plans.length-1;
            html += '<div class="list-item" style="flex-wrap:wrap;"><div class="item-left" style="width:100%">'+
                '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">'+
                    '<div class="item-name">'+esc(p.name)+'</div>'+
                    '<div class="item-amount" style="color:var(--green);font-size:13px;">'+fmt(p.current)+' / '+fmt(p.target)+'</div></div>'+
                '<div class="progress-bg"><div class="progress-fill" style="width:'+pct+'%"></div></div>'+
                '<div class="item-sub-plan">Создано: '+formatDate(p.createdAt)+'</div>'+
                '<div class="item-actions">'+
                    '<button type="button" class="mini-btn move" data-action="move-plan" data-id="'+esc(p.id)+'" data-dir="-1"'+(isFirst?' disabled':'')+'>▲</button>'+
                    '<button type="button" class="mini-btn move" data-action="move-plan" data-id="'+esc(p.id)+'" data-dir="1"'+(isLast?' disabled':'')+'>▼</button>'+
                    '<button type="button" class="mini-btn pay" data-action="fund-plan" data-id="'+esc(p.id)+'">+ Вложить</button>'+
                    '<button type="button" class="mini-btn edit" data-action="edit-plan" data-id="'+esc(p.id)+'">✏️</button>'+
                    '<button type="button" class="mini-btn del" data-action="del-plan" data-id="'+esc(p.id)+'">✕</button></div></div></div>';
        }
    }
    html += '</div>';
    c.innerHTML = html;
}

function movePlan(id, dir) {
    var idx = -1; for(var i=0;i<state.plans.length;i++) if(state.plans[i].id===id) {idx=i; break;}
    if (idx===-1) return;
    var newIdx = idx + dir;
    if (newIdx<0 || newIdx>=state.plans.length) return;
    var tmp = state.plans[idx]; state.plans[idx] = state.plans[newIdx]; state.plans[newIdx] = tmp;
    saveState(); renderPlans(document.getElementById('mainContent'));
}

function showAddPlan(existingId) {
    var p = (existingId!=null) ? state.plans.filter(function(x){return x.id===existingId;})[0] : null;
    showModal('<h3>'+(p?'Изменить цель':'Новая цель')+'</h3>'+
        '<input type="text" id="planName" placeholder="На что копим" autocomplete="off" value="'+esc(p?p.name:'')+'">'+
        '<input type="text" id="planTarget" placeholder="Нужная сумма" inputmode="decimal" autocomplete="off" value="'+(p?p.target:'')+'">'+
        '<button type="button" class="btn-full btn-primary" data-action="save-plan" data-id="'+(existingId!=null?esc(existingId):'')+'">'+(p?'Сохранить':'Создать')+'</button>'+
        '<button type="button" class="btn-full btn-outline" data-action="close-modal">Отмена</button>');
}

function savePlan(id) {
    var nameEl = document.getElementById('planName');
    var targetEl = document.getElementById('planTarget');
    var name = nameEl ? nameEl.value.trim() : '';
    var target = targetEl ? parseAmount(targetEl.value) : null;
    if (!name || target===null) return;
    if (id) { var found=null; for(var i=0;i<state.plans.length;i++) if(state.plans[i].id===id) {found=state.plans[i]; break;} if(found){found.name=name; found.target=target;} }
    else { state.plans.push({id:uid(), name:name, target:target, current:0, createdAt:new Date().toISOString()}); }
    saveState(); hideModal(); renderPlans(document.getElementById('mainContent'));
}

function showFundPlan(id) {
    var p = null; for(var i=0;i<state.plans.length;i++) if(state.plans[i].id===id) {p=state.plans[i]; break;}
    if (!p) return;
    var remain = Math.max(0, p.target - p.current);
    showModal('<h3>Вложить в «'+esc(p.name)+'»</h3>'+
        '<div style="font-size:12px;color:var(--dim);margin-bottom:10px;">Осталось: <b style="color:var(--green)">'+fmt(remain)+'</b><br>Доступно: <b style="color:var(--blue)">'+fmt(state.balance)+'</b></div>'+
        '<input type="text" id="fundAmount" placeholder="Сумма вклада" inputmode="decimal" autocomplete="off">'+
        '<button type="button" class="btn-full btn-primary" data-action="save-fund" data-id="'+esc(p.id)+'">Вложить</button>'+
        '<button type="button" class="btn-full btn-outline" data-action="close-modal">Отмена</button>');
}

function fundPlan(id) {
    var p = null; for(var i=0;i<state.plans.length;i++) if(state.plans[i].id===id) {p=state.plans[i]; break;}
    if (!p) return;
    var input = document.getElementById('fundAmount');
    var amt = input ? parseAmount(input.value) : null;
    if (amt===null || amt>state.balance) { alert('Недостаточно средств.'); return; }
    state.balance -= amt; p.current += amt;
    state.history.unshift({id:uid(), date:new Date().toISOString(), type:TYPE.TRANSFER, desc:'Вклад в цель: '+p.name, amount:-amt});
    _flashId = state.history[0].id;
    saveState(); hideModal(); renderPlans(document.getElementById('mainContent'));
}

function delPlan(id) {
    var p = null; for(var i=0;i<state.plans.length;i++) if(state.plans[i].id===id) {p=state.plans[i]; break;}
    if (!p) return;
    var refund = p.current;
    showConfirm('Удалить цель "'+p.name+'"?', refund>0?'Накопленные '+fmt(refund)+' вернутся на баланс.':'Цель пустая.', function(){
        state.balance += refund;
        if (refund>0) state.history.unshift({id:uid(), date:new Date().toISOString(), type:TYPE.TRANSFER, desc:'Отмена цели: '+p.name+' (возврат)', amount:refund});
        state.plans = state.plans.filter(function(x){return x.id!==id;});
        saveState(); renderPlans(document.getElementById('mainContent'));
    }, {danger:true, okLabel:'Удалить'});
}

/* ============ SHOPPING ============ */
function renderShopping(c) {
    var html = '<div class="card"><div class="card-header"><div class="card-title">Список покупок</div><button type="button" class="btn-icon" data-action="add-shopping">+</button></div>';
    if (state.shopping.length===0) html += '<div class="empty-state">Список пуст<br>Добавь что-нибудь купить</div>';
    else {
        var anySel = shoppingSelected.length > 0;
        var selCat = null;
        if (anySel) { var first=state.shopping.find(function(it){return it.id===shoppingSelected[0];}); if(first) selCat=first.categoryId; }
        for(var i=0;i<state.shopping.length;i++) {
            var it = state.shopping[i];
            var isChecked = shoppingSelected.indexOf(it.id)!==-1;
            var isBlocked = anySel && !isChecked && it.categoryId!==selCat;
            var cat = getCategoryAny(it.categoryId) || getCategory(DEFAULT_CATEGORY_ID);
            var badge = cat ? '<span class="cat-badge '+cat.cssClass+'">'+cat.icon+' '+esc(cat.name)+'</span>' : '';
            html += '<div class="shopping-item'+(isChecked?' checked':'')+(isBlocked?' blocked':'')+'" data-action="shopping-toggle" data-id="'+esc(it.id)+'">'+
                '<div class="shopping-checkbox">✓</div><div class="shopping-name">'+esc(it.name)+badge+'</div>'+
                '<button type="button" class="shopping-del" data-action="del-shopping" data-id="'+esc(it.id)+'">✕</button></div>';
        }
    }
    html += '</div>';
    if (shoppingSelected.length > 0) {
        html += '<div class="shopping-bar visible"><div class="ssb-info">Выбрано: <b>'+shoppingSelected.length+'</b></div>'+
            '<button type="button" class="shopping-convert-btn" data-action="shopping-convert">Создать операцию</button>'+
            '<button type="button" class="history-cat-btn" data-action="shopping-deselect">Снять</button></div>';
    }
    c.innerHTML = html;
}

function toggleShoppingItem(id) {
    var item = state.shopping.find(function(it){return it.id===id;});
    if (!item) return;
    var idx = shoppingSelected.indexOf(id);
    if (idx !== -1) { shoppingSelected.splice(idx,1); renderShopping(document.getElementById('mainContent')); return; }
    if (shoppingSelected.length>0) {
        var first = state.shopping.find(function(it){return it.id===shoppingSelected[0];});
        if (first && first.categoryId !== item.categoryId) return;
    }
    shoppingSelected.push(id);
    renderShopping(document.getElementById('mainContent'));
}

function shoppingDeselect() { shoppingSelected=[]; renderShopping(document.getElementById('mainContent')); }

function showAddShopping(existingId) {
    var it = (existingId!=null) ? state.shopping.find(function(x){return x.id===existingId;}) : null;
    var currentCat = it ? it.categoryId : null;
    var catHtml = '<div class="field-label">Категория</div><div class="cat-list" style="margin-bottom:12px;">';
    for (var i=0; i<CATEGORIES.length; i++) {
        var cat = CATEGORIES[i];
        var active = (currentCat===cat.id) ? ' active' : '';
        catHtml += '<button type="button" class="cat-btn'+active+'" data-action="shopping-pick-cat" data-id="'+esc(cat.id)+'">'+
            '<span class="cat-icon">'+cat.icon+'</span><span>'+esc(cat.name)+'</span></button>';
    }
    catHtml += '</div>';
    showModal('<h3>'+(it?'Изменить покупку':'Новая покупка')+'</h3>'+
        '<input type="text" id="shopName" placeholder="Что купить" autocomplete="off" value="'+esc(it?it.name:'')+'">'+catHtml+
        '<button type="button" class="btn-full btn-primary" data-action="save-shopping" data-id="'+(existingId!=null?esc(existingId):'')+'">'+(it?'Сохранить':'Добавить')+'</button>'+
        '<button type="button" class="btn-full btn-outline" data-action="close-modal">Отмена</button>');
}

function shoppingPickCat(catId) {
    var btns = document.querySelectorAll('.cat-btn');
    for(var i=0;i<btns.length;i++) { if(btns[i].getAttribute('data-id')===catId) btns[i].classList.add('active'); else btns[i].classList.remove('active'); }
}

function saveShopping(id) {
    var nameEl = document.getElementById('shopName');
    var name = nameEl ? nameEl.value.trim() : '';
    if (!name) return;
    var activeCat = document.querySelector('.cat-btn.active');
    var catId = activeCat ? activeCat.getAttribute('data-id') : DEFAULT_CATEGORY_ID;
    if (id) { var found=state.shopping.find(function(x){return x.id===id;}); if(found){found.name=name; found.categoryId=catId;} }
    else { state.shopping.push({id:uid(), name:name, categoryId:catId}); }
    saveState(); hideModal(); renderShopping(document.getElementById('mainContent'));
}

function delShopping(id) {
    showConfirm('Удалить покупку?', 'Пункт исчезнет из списка.', function(){
        state.shopping = state.shopping.filter(function(x){return x.id!==id;});
        shoppingSelected = shoppingSelected.filter(function(x){return x!==id;});
        saveState(); renderShopping(document.getElementById('mainContent'));
    }, {danger:true, okLabel:'Удалить'});
}

function shoppingConvert() {
    if (shoppingSelected.length===0) return;
    var items = state.shopping.filter(function(it){return shoppingSelected.indexOf(it.id)!==-1;});
    if (items.length===0) return;
    var catId = items[0].categoryId;
    var cat = getCategoryAny(catId) || getCategory(DEFAULT_CATEGORY_ID);
    var names = items.map(function(it){return it.name;}).join(', ');
    showModal('<h3>Создать операцию</h3><div class="cat-desc" style="margin-bottom:14px;">'+esc(names)+'</div>'+
        '<div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;">'+
            '<span style="width:38px;height:38px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:20px;background:'+cat.color+'33;flex-shrink:0;">'+cat.icon+'</span>'+
            '<span style="font-size:15px;">'+esc(cat.name)+'</span></div>'+
        '<div class="field-label">Сумма</div><input type="text" id="convAmount" placeholder="Сумма" inputmode="decimal" autocomplete="off">'+
        '<div class="field-label">Время</div><input type="text" id="convTime" placeholder="ЧЧ:ММ" autocomplete="off" value="'+formatTimeFromIso(new Date().toISOString())+'">'+
        '<button type="button" class="btn-full btn-primary" data-action="shopping-convert-confirm">Создать</button>'+
        '<button type="button" class="btn-full btn-outline" data-action="close-modal">Отмена</button>');
}

function shoppingConvertConfirm() {
    var amtEl = document.getElementById('convAmount');
    var timeEl = document.getElementById('convTime');
    var amt = amtEl ? parseAmount(amtEl.value) : null;
    if (amt===null) { if(amtEl) amtEl.focus(); return; }
    var items = state.shopping.filter(function(it){return shoppingSelected.indexOf(it.id)!==-1;});
    if (items.length===0) { hideModal(); return; }
    var catId = items[0].categoryId;
    var names = items.map(function(it){return it.name;}).join(', ');
    var timeStr = timeEl ? timeEl.value.trim() : '';
    var dateIso = applyTimeToIso(new Date().toISOString(), timeStr);
    state.balance -= amt;
    state.history.unshift({id:uid(), date:dateIso, type:TYPE.EXPENSE, desc:names, amount:-amt, categoryId:catId});
    _flashId = state.history[0].id;
    state.shopping = state.shopping.filter(function(it){return shoppingSelected.indexOf(it.id)===-1;});
    shoppingSelected = [];
    saveState(); hideModal(); switchTab('balance');
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
            rowsHtml+='<div class="budget-row"><div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">'+
                '<span style="font-size:14px;color:var(--text);font-weight:500;">'+cat.icon+' '+esc(cat.name)+'</span>'+
                '<span style="font-size:12px;color:var(--dim);"><b style="color:var(--text);">'+fmt(spent)+'</b> / '+fmt(b.limit)+'</span></div>'+
                '<div class="budget-bar-bg"><div class="budget-bar-fill" style="width:'+barPct+'%;background:'+color+'"></div></div>'+
                (over?'<div style="font-size:11px;color:var(--red);font-weight:600;margin-top:2px;">Превышение: '+fmt(spent-b.limit)+'</div>':'')+'</div>';
        }
    }
    var collapseClass=state.budgetsCollapsed?' collapsed':'';
    var rotateClass=state.budgetsCollapsed?' rotated':'';
    return '<div class="card"><div class="budgets-header"><div class="card-title" style="margin:0;">Бюджеты</div>'+
        '<button type="button" class="budgets-toggle '+rotateClass+'" data-action="budgets-toggle">▼</button></div>'+
        '<div class="budgets-collapse-wrap'+collapseClass+'"><div class="budgets-month-nav">'+
            '<button type="button" class="budgets-month-arrow" data-action="budgets-month-prev">←</button>'+
            '<div class="budgets-month-label" data-action="budgets-month-open">'+formatMonthRu(viewMonth)+'</div>'+
            '<button type="button" class="budgets-month-arrow" data-action="budgets-month-next"'+(canGoForward?'':' disabled')+'>→</button></div>'+
        '<div class="budgets-list">'+rowsHtml+'</div><button type="button" class="budgets-add-btn" data-action="budgets-edit-open">+ Изменить бюджеты</button></div></div>';
}

function shiftMonthKey(key, delta) { var p=key.split('-'); var y=parseInt(p[0],10),m=parseInt(p[1],10); m+=delta; while(m<1){m+=12;y--;} while(m>12){m-=12;y++;} return y+'-'+(m<10?'0'+m:m); }
function budgetsShiftMonth(delta) { var cur=state.budgetsViewMonth||getCurrentMonthKey(); var next=shiftMonthKey(cur,delta); if(next>getCurrentMonthKey())return; state.budgetsViewMonth=next; saveState(); renderBalance(document.getElementById('mainContent')); }
function budgetsToggleCollapse() { state.budgetsCollapsed=!state.budgetsCollapsed; saveState(); var w=document.querySelector('.budgets-collapse-wrap'); var b=document.querySelector('.budgets-toggle'); if(w)w.classList.toggle('collapsed'); if(b)b.classList.toggle('rotated'); }

/* ============ SETTINGS ============ */
function renderSettings(c) {
    c.innerHTML='<div class="card"><div class="card-title" style="margin-bottom:15px">Управление данными</div>'+
        '<p style="font-size:13px;color:var(--dim);margin:0 0 15px;line-height:1.5;">Все данные хранятся только на этом устройстве.</p>'+
        '<button type="button" class="btn-full btn-primary" data-action="export">💾 Экспорт (JSON)</button>'+
        '<button type="button" class="btn-full btn-outline" data-action="import">📥 Импорт (JSON)</button>'+
        '<input type="file" id="importFile" accept=".json,application/json">'+
        '<div style="margin-top:20px;border-top:1px solid var(--border);padding-top:15px;">'+
            '<div class="card-title" style="margin-bottom:10px">Сброс данных</div>'+
            '<button type="button" class="btn-full btn-danger" data-action="reset">Удалить все данные</button></div></div>'+
        '<div class="card"><div class="card-title">О приложении</div>'+
        '<p style="font-size:12px;color:var(--dim);line-height:1.5;margin:8px 0 0;">Finance Shield v8<br>Локальное хранилище. Без серверов. Без рекламы.</p></div>';
}

function exportData() {
    var json=JSON.stringify(state,null,2);
    var blob=new Blob([json],{type:'application/json'});
    var url=URL.createObjectURL(blob);
    var a=document.createElement('a'); a.href=url; a.download='finance_backup_'+new Date().toISOString().slice(0,10)+'.json';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function(){try{URL.revokeObjectURL(url);}catch(_){}},1500);
}

function importData() {
    var input=document.getElementById('importFile');
    if(!input||!input.files||!input.files[0])return;
    var reader=new FileReader();
    reader.onload=function(e){
        try{
            var imported=JSON.parse(e.target.result);
            if(!imported||typeof imported!=='object'||imported.balance===undefined){alert('Ошибка формата.');return;}
            showConfirm('Заменить все данные?','Текущие данные будут заменены.',function(){state=migrate(imported);saveState();switchTab('balance');alert('Данные восстановлены!');},{danger:true,okLabel:'Заменить'});
        }catch(err){alert('Ошибка чтения: '+err.message);}
    };
    reader.readAsText(input.files[0]);
    try{input.value='';}catch(_){}
}

function resetAll() {
    showConfirm('Удалить все данные?','Будут удалены: баланс, долги, планы, история, покупки.',function(){
        showConfirm('Последнее предупреждение','Точно удалить всё?',function(){state=emptyState();saveState();switchTab('balance');},{danger:true,okLabel:'Удалить навсегда'});
    },{danger:true,okLabel:'Продолжить'});
}

/* ============ ACTIONS ============ */
var ACTIONS = {
    'op': function(el){doOp(Number(el.getAttribute('data-sign')));},
    'filter': function(el){setHistoryFilter(el.getAttribute('data-filter'));},
    'cat-pick': function(el){pickCategory(el.getAttribute('data-id'));},
    'cat-cancel': function(){cancelCategoryPicker();},
    'open-cat-filter': function(){openCategoryFilter();},
    'cat-filter-apply': function(){applyCategoryFilter();},
    'cat-filter-reset': function(){resetCategoryFilter();},
    'open-date-filter': function(){openDateFilter();},
    'apply-date-filter': function(){applyDateFilter();},
    'clear-date-filter': function(){clearDateFilter();},
    'clear-history-search': function(){historySearch='';historyViewCount=50;_animateList=true;renderBalance(document.getElementById('mainContent'));},
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
    'save-edit-history': function(el){saveEditedHistory(el.getAttribute('data-id'));},
    'delete-edit-history': function(el){deleteFromEdit(el.getAttribute('data-id'));},
    'history-del': function(el){showDeleteHistoryItem(el.getAttribute('data-id'),{refund:false,restore:false});},
    'history-confirm-del': function(el){deleteHistoryItem(el.getAttribute('data-id'),el.getAttribute('data-refund')==='1',el.getAttribute('data-restore')==='1');},
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
    'pay-debt': function(el){showPayDebt(el.getAttribute('data-id'));},
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
    'confirm-ok': function(){handleConfirmOk();},
    'confirm-cancel': function(){handleConfirmCancel();}
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

/* ============ LONG PRESS ============ */
var _longPressTimer=null; var _longPressFired=false;
function attachLongPressHandlers() {
    var items=document.querySelectorAll('[data-longpress="history-start-select"]');
    for(var i=0;i<items.length;i++){(function(el){
        if(el._lpAttached)return; el._lpAttached=true;
        el.addEventListener('touchstart',function(){_longPressFired=false;_longPressTimer=setTimeout(function(){_longPressFired=true;var id=el.getAttribute('data-id');if(id)startSelectionMode(id);},500);},{passive:true});
        el.addEventListener('touchend',function(){if(_longPressTimer){clearTimeout(_longPressTimer);_longPressTimer=null;}});
        el.addEventListener('touchcancel',function(){if(_longPressTimer){clearTimeout(_longPressTimer);_longPressTimer=null;}});
        el.addEventListener('touchmove',function(){if(_longPressTimer){clearTimeout(_longPressTimer);_longPressTimer=null;}});
    })(items[i]);}
}

function startSelectionMode(id) { selectionMode=true; selectedIds=[id]; renderBalance(document.getElementById('mainContent')); }
function toggleSelect(id) {
    var idx=selectedIds.indexOf(id);
    if(idx===-1) selectedIds.push(id); else selectedIds.splice(idx,1);
    if(selectedIds.length===0){selectionMode=false;selectedIds=[];}
    renderBalance(document.getElementById('mainContent'));
}
function exitSelectionMode() { selectionMode=false; selectedIds=[]; renderBalance(document.getElementById('mainContent')); }

/* ============ MODAL ============ */
var modalVisible=false; var _confirmCallback=null;
function showModal(html) {
    var content=document.getElementById('modalContent'); var overlay=document.getElementById('modalOverlay');
    content.innerHTML='<button type="button" class="modal-x" data-action="close-modal">✕</button>'+html;
    overlay.style.display='block';
    setTimeout(function(){overlay.classList.add('visible');},10);
    modalVisible=true;
}
function hideModal() {
    var overlay=document.getElementById('modalOverlay'); var content=document.getElementById('modalContent');
    overlay.classList.remove('visible');
    setTimeout(function(){if(!overlay.classList.contains('visible')){overlay.style.display='none';content.innerHTML='';}},250);
    modalVisible=false; _confirmCallback=null;
}
function showConfirm(title,text,onOk,opts){
    opts=opts||{}; _confirmCallback=function(){_confirmCallback=null;try{onOk();}catch(e){console.error(e);}};
    showModal('<h3>'+esc(title)+'</h3><p class="confirm-text">'+esc(text)+'</p><div class="btn-row"><button type="button" class="btn-full btn-secondary" data-action="confirm-cancel">'+esc(opts.cancelLabel||'Отмена')+'</button><button type="button" class="btn-full '+(opts.danger?'btn-danger':'btn-primary')+'" data-action="confirm-ok">'+esc(opts.okLabel||'Подтвердить')+'</button></div>');
}
function handleConfirmOk(){var cb=_confirmCallback;_confirmCallback=null;hideModal();if(typeof cb==='function')cb();}
function handleConfirmCancel(){_confirmCallback=null;hideModal();}

/* ============ INIT ============ */
function bindEvents() {
    document.getElementById('navTabs').addEventListener('click',function(e){var t=e.target;if(!t||typeof t.closest!=='function')return;var btn=t.closest('.tab-btn');if(btn)switchTab(btn.getAttribute('data-tab'));});
    document.getElementById('filtersBar').addEventListener('click',handleClick);
    document.getElementById('mainContent').addEventListener('click',handleMainContentClick);
    document.getElementById('modalOverlay').addEventListener('click',function(e){if(e.target&&e.target.id==='modalOverlay'){_pendingOp=null;hideModal();return;}handleClick(e);});
    document.body.addEventListener('change',function(e){if(e.target&&e.target.id==='importFile')importData();});
    document.addEventListener('keydown',function(e){
        if(e.key==='Escape'){
            if(modalVisible){hideModal();}
            else if(selectionMode){exitSelectionMode();}
            else if(shoppingSelected.length>0){shoppingDeselect();}
        }
    });
}

function init() {
    try {
        loadState();
        renderHeader();
        bindEvents();
        switchTab('balance');
    } catch(e) { var screen=document.getElementById('errScreen'); screen.textContent='INIT ERROR:\n'+(e&&e.stack?e.stack:String(e)); screen.style.display='block'; }
}
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init); else init();