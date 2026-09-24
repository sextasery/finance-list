'use strict';

/*
 * Отладчик Finance list.
 * Активируется только когда в URL есть #debug:
 *   https://sextasery.github.io/finance-list/#debug
 * Без хэша — обычный режим, ничего не подключается.
 */
(function () {
    if (window.location.hash !== '#debug') return;
    if (window.__FS_DEBUG__) return;
    window.__FS_DEBUG__ = true;

    var MAX_LOG = 50;
    var logs = [];
    var panel = null;
    var logList = null;

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    function now() {
        var d = new Date();
        var hh = d.getHours(), mm = d.getMinutes(), ss = d.getSeconds();
        return (hh < 10 ? '0' + hh : hh) + ':' +
               (mm < 10 ? '0' + mm : mm) + ':' +
               (ss < 10 ? '0' + ss : ss);
    }

    function log(type, text) {
        logs.push({ type: type, text: text, time: now() });
        if (logs.length > MAX_LOG) logs.shift();
        renderLog();
    }

    function renderLog() {
        if (!logList) return;
        var html = '';
        for (var i = 0; i < logs.length; i++) {
            var l = logs[i];
            var cls = l.type === 'error' ? '#ff4757'
                    : l.type === 'warn'  ? '#f7b731'
                    : l.type === 'ok'    ? '#00d26a'
                    : '#9aa9c0';
            html += '<div style="margin-bottom:4px;">' +
                        '<span style="color:#5b8dff;">' + l.time + '</span> ' +
                        '<span style="color:' + cls + ';">[' + l.type + ']</span> ' +
                        esc(l.text) +
                    '</div>';
        }
        logList.innerHTML = html || '<div style="color:#778ca3;">Ждём события…</div>';
    }

    function buildPanel() {
        panel = document.createElement('div');
        panel.id = 'fsDebugPanel';
        panel.style.cssText =
            'position:fixed;left:0;right:0;bottom:0;z-index:99999;' +
            'background:rgba(10,12,16,0.97);border-top:2px solid #00d2ff;' +
            'color:#e0e6ed;font:11px/1.4 monospace;' +
            'max-height:50vh;display:flex;flex-direction:column;' +
            'box-shadow:0 -8px 24px rgba(0,0,0,0.6);';

        panel.innerHTML =
            '<div style="display:flex;align-items:center;gap:8px;padding:8px 10px;border-bottom:1px solid #2a3548;flex-shrink:0;">' +
                '<span style="font-weight:bold;color:#00d2ff;">FS Debug</span>' +
                '<span id="fsDbgCount" style="color:#778ca3;font-size:10px;">0</span>' +
                '<button id="fsDbgClear" style="margin-left:auto;background:transparent;border:1px solid #2a3548;color:#9aa9c0;padding:4px 8px;border-radius:4px;font:inherit;cursor:pointer;">Clear</button>' +
                '<button id="fsDbgClose" style="background:transparent;border:1px solid #ff4757;color:#ff4757;padding:4px 8px;border-radius:4px;font:inherit;cursor:pointer;">✕</button>' +
            '</div>' +
            '<div id="fsDbgList" style="padding:8px 10px;overflow-y:auto;flex:1;-webkit-overflow-scrolling:touch;"></div>';

        document.body.appendChild(panel);
        logList = document.getElementById('fsDbgList');

        document.getElementById('fsDbgClear').addEventListener('click', function () {
            logs = [];
            renderLog();
        });
        document.getElementById('fsDbgClose').addEventListener('click', function () {
            panel.style.display = 'none';
        });

        log('ok', 'Debug включён. Хэш URL: #debug');
    }

    function describeTarget(el) {
        if (!el) return 'null';
        var tag = el.tagName ? el.tagName.toLowerCase() : '?';
        var action = el.getAttribute ? (el.getAttribute('data-action') || '') : '';
        var id = el.id ? '#' + el.id : '';
        var txt = (el.textContent || '').trim().slice(0, 30);
        return tag + id + (action ? ' [action=' + action + ']' : '') + (txt ? ' "' + txt + '"' : '');
    }

    function installGlobalLog() {
        var orig = console.log.bind(console);
        var origWarn = console.warn.bind(console);
        var origErr = console.error.bind(console);

        console.log = function () {
            log('log', Array.prototype.map.call(arguments, String).join(' '));
            orig.apply(null, arguments);
        };
        console.warn = function () {
            log('warn', Array.prototype.map.call(arguments, String).join(' '));
            origWarn.apply(null, arguments);
        };
        console.error = function () {
            log('error', Array.prototype.map.call(arguments, String).join(' '));
            origErr.apply(null, arguments);
        };

        window.addEventListener('error', function (e) {
            log('error', (e.message || 'unknown') + ' @ line ' + (e.lineno || '?'));
        });
        window.addEventListener('unhandledrejection', function (e) {
            log('error', 'Promise: ' + (e.reason && e.reason.message ? e.reason.message : String(e.reason)));
        });
    }

    function installClickTracer() {
        document.addEventListener('click', function (e) {
            var t = e.target;
            if (!t || typeof t.closest !== 'function') return;
            var el = t.closest('[data-action]');
            if (!el) return;

            var action = el.getAttribute('data-action');
            log('log', 'CLICK → ' + describeTarget(el));

            if (!window.ACTIONS) {
                log('warn', 'ACTIONS не найдены');
                return;
            }
            var fn = window.ACTIONS[action];
            if (typeof fn !== 'function') {
                log('error', 'НЕТ обработчика для action="' + action + '"');
                return;
            }
            log('ok', 'Обработчик найден: ' + action);
        }, true);

        document.addEventListener('change', function (e) {
            var t = e.target;
            if (!t) return;
            if (t.type === 'checkbox' && t.id) {
                log('log', 'CHECKBOX ' + t.id + ' = ' + t.checked);
            }
        }, true);
    }

    function installInputTracer() {
        document.addEventListener('input', function (e) {
            var t = e.target;
            if (!t || !t.id) return;
            if (t.tagName === 'INPUT' && t.type !== 'file') {
                log('log', 'INPUT ' + t.id + ' = "' + String(t.value).slice(0, 20) + '"');
            }
        }, true);
    }

    function installModalTracer() {
        var origShow = window.showModal;
        var origHide = window.hideModal;

        if (typeof origShow === 'function') {
            window.showModal = function () {
                log('ok', 'showModal: открытие');
                try { return origShow.apply(this, arguments); }
                catch (e) { log('error', 'showModal упал: ' + e.message); throw e; }
            };
        }
        if (typeof origHide === 'function') {
            window.hideModal = function () {
                log('log', 'hideModal: закрытие');
                try { return origHide.apply(this, arguments); }
                catch (e) { log('error', 'hideModal упал: ' + e.message); throw e; }
            };
        }
    }

    function init() {
        buildPanel();
        installGlobalLog();
        installClickTracer();
        installInputTracer();
        installModalTracer();
        log('ok', 'Трассировка активна');
        log('log', 'Открой проблемный экран и тапни по кнопке');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () { setTimeout(init, 100); });
    } else {
        setTimeout(init, 100);
    }
})();