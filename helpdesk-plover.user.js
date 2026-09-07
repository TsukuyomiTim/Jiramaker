// ==UserScript==
// @name         HelpDesk Ticket Helper (Plover)
// @namespace    http://tampermonkey.net/
// @version      3.37
// @description  Быстрые действия + заполнение форм МинМакс/КБ/Аванс
// @author       Plover
// @updateURL    https://github.com/TsukuyomiTim/Jiramaker/raw/refs/heads/main/helpdesk-plover.user.js
// @downloadURL  https://github.com/TsukuyomiTim/Jiramaker/raw/refs/heads/main/helpdesk-plover.user.js
// @match        https://app.helpdesk.com/tickets*
// @match        https://app.helpdesk.com/tickets/*
// @match        https://tasks.deltasystem.tech/servicedesk/customer/portal/22/create/668*
// @match        https://tasks.deltasystem.tech/servicedesk/customer/portal/22/create/682*
// @match        https://tasks.deltasystem.tech/servicedesk/customer/portal/22/create/683*
// @match        https://cc.boadmin.org/*
// @match        https://gm.boadmin.org/*
// @match        https://dy.boadmin.org/*
// @match        https://mr.boadmin.org/*
// @match        https://rs.boadmin.org/*
// @match        https://kn.boadmin.org/*
// @match        https://kt.boadmin.org/*
// @match        https://ak.boadmin.org/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_openInTab
// @grant        unsafeWindow
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    const PROJECTS = ['Cat', 'Gama', 'Daddy', 'Mers', 'R7', 'Kent', 'Kometa', 'Arkada'];
    const CURRENCIES = ['RUB', 'USD', 'EUR', 'KZT', 'UZS', 'BYN', 'USDT', 'BTC', 'LTC', 'ETH', 'BRL', 'TRX'];
    const AVANCE_REASONS = ['Запросили видео', 'Запросили выписку', 'Просьба ускорить зачисление'];
    const LOYALTY_REASONS = [
        'Не наши реквизиты',
        'Не тот банк',
        'Нет возможности проверить',
        'Нет платежа',
        'Оплата подвязалась другому клиенту',
        'Отказ, метод с которого можно отменить платеж',
        'Перевел не на тот адрес',
        'Реквизиты не выдавались',
        'Реквизиты не совпадают',
        'СКАМ'
    ];
    const LOYALTY_STATUSES = ['Failed', 'No Status', 'Completed'];
    const FORM_MINMAX = 'https://tasks.deltasystem.tech/servicedesk/customer/portal/22/create/668';
    const FORM_AVANCE = 'https://tasks.deltasystem.tech/servicedesk/customer/portal/22/create/682';
    const FORM_LOYALTY = 'https://tasks.deltasystem.tech/servicedesk/customer/portal/22/create/683';
    const STORAGE_KEY = 'plover_helpdesk_panel_collapsed';
    const DATA_KEY = 'plover_form_data_v6';
    const AVANCE_KEY = 'plover_avance_data_v1';

    const PROJECT_VALUES = {
        'Cat': '13907', 'Gama': '13908', 'Daddy': '13909', 'Kent': '13910',
        'R7': '13911', 'Kometa': '13912', 'Mers': '13914', 'Arkada': '14500'
    };

    const CURRENCY_VALUES = {
        'USD': '14101', 'EUR': '14102', 'RUB': '14103', 'BYN': '14104',
        'USDT': '14105', 'BTC': '14106', 'LTC': '14107', 'ETH': '14108',
        'KZT': '14109', 'BRL': '14110', 'UZS': '14912', 'TRX': '17347'
    };

    const PROFILE_HOSTS = {
        'Cat': 'https://cc.boadmin.org/ru/Users/Summary/',
        'Gama': 'https://gm.boadmin.org/ru/Users/Summary/',
        'Daddy': 'https://dy.boadmin.org/ru/Users/Summary/',
        'Mers': 'https://mr.boadmin.org/ru/Users/Summary/',
        'R7': 'https://rs.boadmin.org/ru/Users/Summary/',
        'Kent': 'https://kn.boadmin.org/ru/Users/Summary/',
        'Kometa': 'https://kt.boadmin.org/ru/Users/Summary/',
        'Arkada': 'https://ak.boadmin.org/ru/Users/Summary/'
    };

    function getText() {
        return document.body?.innerText || '';
    }

    function extractByRegex(regex, text) {
        const m = (text || getText()).match(regex);
        return m ? m[1].trim() : null;
    }

    function canonProject(name) {
        if (!name) return null;
        return PROJECTS.find(p => p.toLowerCase() === String(name).toLowerCase()) || null;
    }

    function findProject(text) {
        const names = PROJECTS.join('|');
        const raw = String(text);
        const a = raw.match(new RegExp('(' + names + ')\\s+(HighRoll|VIP)\\b', 'i'));
        if (a) return canonProject(a[1]);
        const b = raw.match(new RegExp('(?:HighRoll|VIP)\\s+(' + names + ')\\b', 'i'));
        return b ? canonProject(b[1]) : null;
    }

    function extractPlayerAndProject(text) {
        const names = PROJECTS.join('|');
        const raw = String(text);

        const after = raw.match(new RegExp('(\\d{7,12})[^\\d]{0,80}?(' + names + ')\\s+(HighRoll|VIP)\\b', 'i'));
        if (after) return { playerId: after[1], project: canonProject(after[2]) };

        const before = raw.match(new RegExp('(\\d{7,12})[^\\d]{0,80}?(HighRoll|VIP)\\s+(' + names + ')\\b', 'i'));
        if (before) return { playerId: before[1], project: canonProject(before[3]) };

        const sameLine = raw.match(new RegExp('(\\d{7,12})\\s+(' + names + ')\\b', 'i'));
        if (sameLine) return { playerId: sameLine[1], project: canonProject(sameLine[2]) };

        return { playerId: null, project: findProject(raw) };
    }

    function isExcludedPage() {
        const path = location.pathname.toLowerCase();
        return /\/tickets\/?(all|undelivered|my-open|unassigned|search)(\/|$|\?)/.test(path)
            || /\/tickets\/?$/.test(path);
    }

    function isTicketPage() {
        return /\/tickets\/[A-Za-z0-9-]+/.test(location.pathname) && !isExcludedPage();
    }

    function profileUrl(project, playerId) {
        if (!project || !playerId || !PROFILE_HOSTS[project]) return null;
        return PROFILE_HOSTS[project] + playerId;
    }

    function detectVip(text) {
        const lines = String(text || '').split(/\n/).map(l => l.trim()).filter(Boolean);
        const useful = lines.filter(l =>
            !/hgate|cascad|payment status|merchant transaction|method\s*:|min-max|matching pay-in|wrong payment/i.test(l)
        );
        return useful.some(l => /\b(VIP|HighRoll|High[\s-]?Roll)\b/i.test(l));
    }

    function collectTicketData() {
        const text = getText();

        let ticketId = extractByRegex(/Ticket\s*ID[:\s]*([A-Z0-9]{5,10})/i, text);
        if (!ticketId) ticketId = location.pathname.match(/\/tickets\/([A-Za-z0-9-]+)/)?.[1];

        const pair = extractPlayerAndProject(text);
        let playerId = pair.playerId;
        if (!playerId) playerId = extractByRegex(/(\d{7,12})\s*(?:\n+\s*)?(?:HighRoll|VIP)\s*(?:Cat|Gama|Daddy|Mers|R7|Kent|Kometa|Arkada)/i, text);
        if (!playerId) playerId = extractByRegex(/(?:^|\n)\s*(\d{7,12})\s*\n/i, text);

        return {
            ticketId,
            playerId,
            isVip: detectVip(text),
            minMaxLine: extractByRegex(/([^\n]*min-max:\s*[\d\s\-,]+[^\n]*)/i, text)
                || extractByRegex(/([^\n]*\(min-max:[^\n]*)/i, text),
            token: extractByRegex(/Merchant\s*Transaction\s*ID[:\s]*(\d+)/i, text)
                || extractByRegex(/(?:^|\n)\s*(\d{8,14})\s*(?:\n|Method|Bank)/i, text),
            psp: extractByRegex(/Method[:\s]*([A-Z0-9_]+)/i, text),
            project: pair.project || findProject(text),
            ticketLink: ticketId ? 'https://app.helpdesk.com/tickets/' + ticketId : location.href
        };
    }

    function createPanel() {
        if (document.getElementById('plover-panel')) return;
        if (!document.body) return;

        const collapsed = GM_getValue(STORAGE_KEY, false);
        const panel = document.createElement('div');
        panel.id = 'plover-panel';
        panel.innerHTML = `
            <style>
                #plover-panel {
                    position: fixed; top: 8px; left: 50%; transform: translateX(-50%);
                    z-index: 999999; background: linear-gradient(135deg, #1e293b, #0f172a);
                    border: 1px solid #334155; border-radius: 12px;
                    box-shadow: 0 10px 25px rgba(0,0,0,0.45);
                    font-family: system-ui, sans-serif; color: #e2e8f0; min-width: 360px;
                }
                #plover-panel.collapsed .plover-body { display: none; }
                #plover-header {
                    display: flex; justify-content: space-between; align-items: center;
                    padding: 7px 14px; background: rgba(255,255,255,0.05); cursor: pointer;
                }
                #plover-title {
                    font-size: 12px; font-weight: 600;
                    background: linear-gradient(90deg, #38bdf8, #a78bfa);
                    -webkit-background-clip: text; -webkit-text-fill-color: transparent;
                }
                .plover-body { padding: 10px 12px; display: flex; flex-wrap: wrap; gap: 6px; justify-content: center; }
                .plover-btn {
                    background: #334155; border: none; color: #f1f5f9;
                    padding: 6px 12px; border-radius: 8px; font-size: 12px; font-weight: 500; cursor: pointer;
                }
                .plover-btn:hover { filter: brightness(1.18); }
                .plover-btn.minmax-plus { background: #166534; }
                .plover-btn.minmax-minus { background: #9a3412; }
                .plover-btn.kb { background: #1e40af; }
                .plover-btn.avance { background: #6b21a8; }
                .plover-btn.loyalty { background: #be185d; }
            </style>
            <div id="plover-header">
                <div id="plover-title">Created By Plover</div>
                <div id="plover-toggle">${collapsed ? '▼' : '▲'}</div>
            </div>
            <div class="plover-body">
                <button class="plover-btn minmax-plus" data-action="minmax+">МинМакс+</button>
                <button class="plover-btn minmax-minus" data-action="minmax-">МинМакс-</button>
                <button class="plover-btn kb" data-action="kb">КБ</button>
                <button class="plover-btn avance" data-action="avance">Аванс</button>
                <button class="plover-btn loyalty" data-action="loyalty">Лояльность</button>
            </div>
        `;
        if (collapsed) panel.classList.add('collapsed');
        document.body.appendChild(panel);

        panel.querySelector('#plover-header').onclick = () => {
            const isCollapsed = panel.classList.toggle('collapsed');
            panel.querySelector('#plover-toggle').textContent = isCollapsed ? '▼' : '▲';
            GM_setValue(STORAGE_KEY, isCollapsed);
        };

        panel.querySelectorAll('.plover-btn').forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation();
                showAmountModal(btn.dataset.action);
            };
        });
    }

    function removePanel() {
        document.getElementById('plover-panel')?.remove();
        document.getElementById('plover-modal')?.remove();
    }

    function syncPanel() {
        if (isTicketPage()) createPanel();
        else removePanel();
    }

    function watchHelpdeskSpa() {
        let lastHref = location.href;
        syncPanel();

        setInterval(() => {
            if (location.href !== lastHref) {
                lastHref = location.href;
                removePanel();
                setTimeout(syncPanel, 200);
                setTimeout(syncPanel, 800);
            } else if (isTicketPage() && !document.getElementById('plover-panel')) {
                syncPanel();
            }
        }, 400);

        const origPush = history.pushState;
        const origReplace = history.replaceState;
        history.pushState = function () {
            origPush.apply(this, arguments);
            setTimeout(syncPanel, 200);
        };
        history.replaceState = function () {
            origReplace.apply(this, arguments);
            setTimeout(syncPanel, 200);
        };
        window.addEventListener('popstate', () => setTimeout(syncPanel, 200));
    }

    function showAmountModal(action) {
        document.getElementById('plover-modal')?.remove();
        const isAvance = action === 'avance';
        const isLoyalty = action === 'loyalty';
        const extraForm = isAvance || isLoyalty;
        const reasons = isLoyalty ? LOYALTY_REASONS : AVANCE_REASONS;
        const title = isLoyalty ? 'Лояльность' : isAvance ? 'Аванс' : action.toUpperCase();
        const modal = document.createElement('div');
        modal.id = 'plover-modal';
        modal.innerHTML = `
            <style>
                #plover-modal { position: fixed; inset: 0; background: rgba(0,0,0,0.65); z-index: 1000000;
                    display: flex; align-items: center; justify-content: center; font-family: system-ui, sans-serif; }
                .plover-modal-content { background: #0f172a; border: 1px solid #334155; border-radius: 16px;
                    padding: 24px; width: 400px; color: #e2e8f0; }
                .plover-field { margin-bottom: 14px; }
                .plover-field label { display: block; font-size: 12px; margin-bottom: 5px; color: #94a3b8; }
                .plover-field input, .plover-field select {
                    width: 100%; padding: 10px 12px; border-radius: 8px; border: 1px solid #334155;
                    background: #1e293b; color: #f1f5f9; font-size: 14px; box-sizing: border-box;
                }
                .plover-actions { display: flex; gap: 10px; margin-top: 20px; }
                .plover-actions button { flex: 1; padding: 11px; border: none; border-radius: 8px; font-weight: 600; cursor: pointer; }
                .plover-ok { background: #2563eb; color: white; }
                .plover-cancel { background: #334155; color: #e2e8f0; }
            </style>
            <div class="plover-modal-content">
                <h3 style="margin:0 0 18px;text-align:center;">${title}</h3>
                <div class="plover-field">
                    <label>Сумма</label>
                    <input type="number" id="plover-amount" placeholder="Введите сумму" step="any" autofocus>
                </div>
                <div class="plover-field">
                    <label>Валюта</label>
                    <select id="plover-currency">
                        ${CURRENCIES.map(c => '<option value="' + c + '">' + c + '</option>').join('')}
                    </select>
                </div>
                ${extraForm ? `
                <div class="plover-field">
                    <label>Причина</label>
                    <select id="plover-reason">
                        ${reasons.map(r => '<option value="' + r + '">' + r + '</option>').join('')}
                    </select>
                </div>` : ''}
                ${isLoyalty ? `
                <div class="plover-field">
                    <label>Статус Платежа</label>
                    <select id="plover-token-status">
                        ${LOYALTY_STATUSES.map(s => '<option value="' + s + '">' + s + '</option>').join('')}
                    </select>
                </div>` : ''}
                <div class="plover-actions">
                    <button class="plover-cancel">Отмена</button>
                    <button class="plover-ok">${extraForm ? 'Открыть профиль и форму' : 'Открыть форму'}</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        modal.querySelector('.plover-cancel').onclick = () => modal.remove();
        modal.querySelector('.plover-ok').onclick = () => {
            const amount = parseFloat(modal.querySelector('#plover-amount').value);
            const currency = modal.querySelector('#plover-currency').value;
            const reason = modal.querySelector('#plover-reason')?.value || '';
            const tokenStatus = modal.querySelector('#plover-token-status')?.value || '';
            if (!amount || amount <= 0) return alert('Введите корректную сумму');
            modal.remove();
            if (action === 'avance' || action === 'loyalty') openAvanceFlow(action, amount, currency, reason, tokenStatus);
            else openMinmaxForm(action, amount, currency);
        };
    }

    function openMinmaxForm(action, amount, currency) {
        const data = collectTicketData();
        GM_setValue(DATA_KEY, JSON.stringify({ action, amount, currency, ...data, timestamp: Date.now() }));

        const params = new URLSearchParams();
        const summary = [data.playerId, data.project].filter(Boolean).join(' ');
        if (summary) params.set('summary', summary);
        const description = action === 'kb' ? 'Не дошел КБ' : (data.minMaxLine || '');
        if (description) params.set('description', description);
        if (data.playerId) params.set('customfield_12600', data.playerId);
        params.set('customfield_12602', String(amount));
        params.set('customfield_12800', String(amount));
        if (data.token) params.set('customfield_12603', data.token);
        params.set('customfield_10814', '3');
        if (data.ticketLink) params.set('customfield_12606', data.ticketLink);
        if (data.psp) params.set('customfield_12605', data.psp);

        GM_openInTab(FORM_MINMAX + (params.toString() ? '?' + params.toString() : ''), { active: true });
    }

    function openAvanceFlow(action, amount, currency, reason, tokenStatus) {
        const data = collectTicketData();
        if (!data.playerId || !data.project) {
            alert('Не удалось взять ID игрока или проект из тикета');
            return;
        }
        const url = profileUrl(data.project, data.playerId);
        if (!url) {
            alert('Неизвестный проект: ' + data.project);
            return;
        }

        GM_setValue(AVANCE_KEY, JSON.stringify({
            action: action || 'avance',
            amount,
            currency,
            reason,
            tokenStatus: tokenStatus || '',
            ...data,
            profileUrl: url,
            stage: 'profile',
            timestamp: Date.now()
        }));

        GM_openInTab(url, { active: true });
    }

    function sleep(ms) {
        return new Promise(r => setTimeout(r, ms));
    }

    function getJq() {
        const cand = window.AJS && window.AJS.$ ? window.AJS.$ : (window.jQuery || null);
        return (typeof cand === 'function') ? cand : null;
    }

    function applyNativeSelect(select, value, visibleText) {
        if (!select) return false;

        let opt = [...select.options].find(o => String(o.value) === String(value) || o.text.trim() === visibleText);
        if (!opt && value) {
            opt = document.createElement('option');
            opt.value = String(value);
            opt.textContent = visibleText || String(value);
            select.appendChild(opt);
        }
        if (opt) opt.selected = true;
        select.value = String(value);

        select.dispatchEvent(new Event('input', { bubbles: true }));
        select.dispatchEvent(new Event('change', { bubbles: true }));

        const $ = getJq();
        if ($) {
            try {
                $(select).val(String(value)).trigger('change');
                if ($(select).data('select2')) {
                    try { $(select).select2('val', String(value)); } catch (e) {}
                    $(select).trigger('change.select2');
                }
            } catch (e) {}
        }
        return String(select.value) === String(value);
    }

    function setSelectByLabel(labelText, value) {
        const labels = [...document.querySelectorAll('label')];
        const label = labels.find(l => l.textContent.trim().toLowerCase().includes(labelText.toLowerCase()));
        if (!label) return false;
        const fieldGroup = label.closest('.field-group') || label.parentElement;
        const select = fieldGroup?.querySelector('select');
        if (!select) return false;
        return applyNativeSelect(select, value);
    }

    function setSelectById(fieldId, value, visibleText) {
        const select = document.querySelector('#' + fieldId + ', [name="' + fieldId + '"]');
        if (!select) return false;
        return applyNativeSelect(select, value, visibleText);
    }

    async function pickSelect2Option(select, searchText) {
        if (!select) return false;
        const wrap = select.closest('.field-group') || select.parentElement;
        const s2 = wrap?.querySelector('.select2-container')
            || document.querySelector('.select2-container[id*="' + (select.id || '') + '"]');

        const clickTarget = s2?.querySelector('.select2-selection, .select2-choice, .select2-selection__rendered, .select2-arrow') || s2;
        if (clickTarget) clickTarget.click();
        else select.click();

        await sleep(350);

        const search = document.querySelector('.select2-dropdown .select2-search__field, body > .select2-drop .select2-input, .select2-search__field, .select2-input');
        if (search) {
            search.focus();
            search.value = searchText;
            search.dispatchEvent(new Event('input', { bubbles: true }));
            search.dispatchEvent(new KeyboardEvent('keyup', { key: 'a', bubbles: true }));
            await sleep(400);
        }

        const options = [...document.querySelectorAll('.select2-results__option, .select2-result-label, .select2-result, li[role="option"]')];
        const target = options.find(opt => {
            const t = opt.textContent.trim().toLowerCase();
            return t === searchText.toLowerCase() || t.includes(searchText.toLowerCase());
        });

        if (target) {
            target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
            target.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
            target.click();
            await sleep(150);
            return true;
        }

        document.body.click();
        return false;
    }

    async function forceCurrency(currencyCode) {
        const value = CURRENCY_VALUES[currencyCode];
        if (!value || !currencyCode) return;

        const select = document.querySelector('#customfield_10805, [name="customfield_10805"]');
        if (!select) return;

        applyNativeSelect(select, value, currencyCode);
        await pickSelect2Option(select, currencyCode);
        applyNativeSelect(select, value, currencyCode);

        const container = select.closest('.field-group')?.querySelector('.select2-container');
        const rendered = container?.querySelector('.select2-selection__rendered, .select2-chosen');
        if (rendered) {
            rendered.textContent = currencyCode;
            rendered.title = currencyCode;
        }
    }

    async function doForceFillMinmax(data) {
        const action = data.action;

        setSelectByLabel('Type of Failed', action === 'kb' ? '14302' : '14300');

        if (data.project && PROJECT_VALUES[data.project]) {
            setSelectByLabel('Project', PROJECT_VALUES[data.project]);
        }

        setSelectByLabel('Department', '13918');
        setSelectByLabel('Player VIP', data.isVip ? '13928' : '13929');
        setSelectByLabel('Charge Amount Range', data.amount < 100000 ? '14580' : '14581');

        if (CURRENCY_VALUES[data.currency]) {
            setSelectById('customfield_12801', CURRENCY_VALUES[data.currency], data.currency);
        }

        setSelectByLabel('Token status', action === 'kb' ? '13942' : '13940');
        setSelectByLabel('Financial loss', '14624');

        let reasonValue = '';
        if (action === 'kb') reasonValue = '14640';
        else if (action === 'minmax-') reasonValue = '14641';
        else if (action === 'minmax+') reasonValue = '14642';
        if (reasonValue) setSelectByLabel('Reason', reasonValue);

        const wager = document.querySelector('#customfield_10814, [name="customfield_10814"]');
        if (wager) {
            wager.value = '3';
            wager.dispatchEvent(new Event('input', { bubbles: true }));
            wager.dispatchEvent(new Event('change', { bubbles: true }));
        }

        if (data.currency) {
            await forceCurrency(data.currency);
            setTimeout(() => forceCurrency(data.currency), 900);
            setTimeout(() => forceCurrency(data.currency), 2000);
        }
    }

    function startMinmaxFill() {
        const raw = GM_getValue(DATA_KEY);
        if (!raw) return;
        let data;
        try { data = JSON.parse(raw); } catch { return; }
        if (Date.now() - data.timestamp > 10 * 60 * 1000) return;

        addForceBtn('🔄 Заполнить все поля', () => doForceFillMinmax(data));
        setTimeout(() => doForceFillMinmax(data), 1800);
    }

    function addForceBtn(text, fn) {
        if (document.getElementById('plover-force-btn')) return;
        const btn = document.createElement('button');
        btn.id = 'plover-force-btn';
        btn.textContent = text;
        btn.style.cssText = 'position:fixed;bottom:25px;right:25px;z-index:999999;background:#2563eb;color:white;border:none;padding:14px 22px;border-radius:10px;font-weight:600;cursor:pointer;box-shadow:0 6px 20px rgba(37,99,235,0.5);font-size:14px;';
        btn.onclick = fn;
        document.body.appendChild(btn);
    }

    function setInputByName(name, value) {
        const el = document.querySelector('[name="' + name + '"], #' + name);
        if (!el) return false;
        el.focus();
        el.value = value;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
    }

    function setInputByLabel(labelText, value) {
        if (value == null || value === '') return false;
        const labels = [...document.querySelectorAll('label')];
        const label = labels.find(l => l.textContent.trim().toLowerCase().includes(labelText.toLowerCase()));
        const group = label ? (label.closest('.field-group') || label.parentElement) : null;
        const input = group?.querySelector('input:not([type="hidden"]), textarea')
            || document.querySelector('[name="' + labelText + '"]');
        if (!input) return setInputByName(labelText, value);
        input.focus();
        input.value = String(value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
    }

    function normOpt(s) {
        return String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
    }

    function findOption(select, optionText) {
        const want = normOpt(optionText);
        if (!want || !select) return null;
        const opts = [...select.options];
        return opts.find(o => normOpt(o.text) === want)
            || opts.find(o => {
                const t = normOpt(o.text);
                return t && t !== 'none' && t !== '-' && (t.includes(want) || (want.length > 10 && t.includes(want.slice(0, 16))));
            })
            || null;
    }

    function setSelectByOptionText(labelText, optionText) {
        if (!optionText) return false;
        const labels = [...document.querySelectorAll('label')];
        const matched = labels.filter(l => l.textContent.trim().toLowerCase().includes(labelText.toLowerCase()));
        for (const label of matched) {
            const group = label.closest('.field-group') || label.parentElement;
            const select = group?.querySelector('select');
            const opt = findOption(select, optionText);
            if (opt) return applyNativeSelect(select, opt.value, opt.text);
        }

        for (const select of document.querySelectorAll('select')) {
            const opt = findOption(select, optionText);
            if (opt && opt.value !== '-1' && opt.value !== '') {
                const nearby = (select.closest('.field-group')?.innerText || '').toLowerCase();
                if (!labelText || nearby.includes(labelText.toLowerCase()) || nearby.includes('reason')) {
                    return applyNativeSelect(select, opt.value, opt.text);
                }
            }
        }
        console.warn('[Plover] нет пункта', labelText, optionText);
        return false;
    }

    function avanceChargeRange(amount) {
        const n = parseFloat(amount);
        if (!(n > 0) || n < 15000) return 'Less than 15K';
        if (n <= 50000) return '15K-49K';
        return '50K and more';
    }

    function fillAvanceForm(data) {
        const summary = [data.playerId, data.project].filter(Boolean).join(' ');
        const description = buildAvanceDescription(data);

        setInputByName('summary', summary);
        setInputByLabel('Summary', summary);

        const desc = document.querySelector('#description, [name="description"], textarea#description, textarea[name="description"]');
        if (desc) {
            desc.value = description;
            desc.dispatchEvent(new Event('input', { bubbles: true }));
            desc.dispatchEvent(new Event('change', { bubbles: true }));
        }
        const iframe = document.querySelector('iframe.tox-edit-area__iframe, .wiki-edit-content iframe, iframe[id*="description"]');
        if (iframe && iframe.contentDocument && iframe.contentDocument.body) {
            iframe.contentDocument.body.innerText = description;
        }

        if (data.project) {
            if (PROJECT_VALUES[data.project]) setSelectByLabel('Project', PROJECT_VALUES[data.project]);
            setSelectByOptionText('Project', data.project);
        }
        setSelectByLabel('Department', '13918');
        setSelectByOptionText('Department', 'Support');

        setInputByLabel('Player ID', data.playerId);
        if (data.playerId) {
            setInputByName('customfield_12600', data.playerId);
        }

        setSelectByLabel('Player VIP', data.isVip ? '13928' : '13929');
        setSelectByOptionText('Player VIP', data.isVip ? 'Yes' : 'No');

        const rangeText = avanceChargeRange(data.amount);
        const rangeAliases = rangeText === '50K and more'
            ? ['50K and more', '50K and More', 'More than 50K']
            : [rangeText];
        rangeAliases.some(t =>
            setSelectByOptionText('Please Indicate Charge Range', t)
            || setSelectByOptionText('Charge Range', t)
        );

        const fullAmount = data.amount;
        const chargeAmount = data.action === 'loyalty'
            ? String(Math.round(parseFloat(fullAmount) * 50) / 100)
            : fullAmount;

        setInputByLabel('Charge Amount', chargeAmount);
        setInputByName('customfield_12602', chargeAmount);
        setInputByLabel('Deposit Amount', fullAmount);
        setInputByName('customfield_12800', fullAmount);

        if (data.currency) {
            if (CURRENCY_VALUES[data.currency]) {
                setSelectById('customfield_12801', CURRENCY_VALUES[data.currency], data.currency);
                setSelectById('customfield_10805', CURRENCY_VALUES[data.currency], data.currency);
            }
            setSelectByOptionText('Account Currency', data.currency);
            setSelectByOptionText('Currency', data.currency);
            forceCurrency(data.currency);
        }

        if (data.token) {
            setInputByLabel('Token', data.token);
            setInputByName('customfield_12603', data.token);
        }

        if (data.action === 'loyalty') {
            const st = data.tokenStatus || 'No Status';
            setSelectByOptionText('Token status', st);
            if (/completed/i.test(st)) setSelectByLabel('Token status', '13940');
            else if (/failed/i.test(st)) setSelectByOptionText('Token status', 'Failed');
            else {
                setSelectByLabel('Token status', '13942');
                setSelectByOptionText('Token status', 'No status');
                setSelectByOptionText('Token status', 'No Status');
            }
        } else {
            setSelectByLabel('Token status', '13942');
            setSelectByOptionText('Token status', 'No status');
            setSelectByOptionText('Token status', 'No Status');
        }

        if (data.psp) {
            setInputByLabel('PSP', data.psp);
            setInputByName('customfield_12605', data.psp);
        }

        setSelectByOptionText('Financial loss', data.action === 'loyalty' ? 'Yes' : 'Maybe');

        if (data.reason) {
            setSelectByOptionText('Reason', data.reason);
            setTimeout(() => setSelectByOptionText('Reason', data.reason), 800);
            setTimeout(() => setSelectByOptionText('Reason', data.reason), 2000);
        }

        const wager = document.querySelector('#customfield_10814, [name="customfield_10814"]');
        if (wager) {
            wager.value = '3';
            wager.dispatchEvent(new Event('input', { bubbles: true }));
            wager.dispatchEvent(new Event('change', { bubbles: true }));
        } else {
            setInputByLabel('Wager', '3');
        }

        if (data.ticketLink) {
            setInputByLabel('Ticket Link', data.ticketLink);
            setInputByName('customfield_12606', data.ticketLink);
        }

        console.log('[Plover] Аванс форма заполнена', data);
    }

    function buildAvanceDescription(data) {
        const cur = data.currency || '';
        return [
            'Выводы через платежные системы: ' + (data.pspWithdrawals || 'не найдено'),
            'Депозиты через платежную систему: ' + (data.pspDeposits || 'не найдено'),
            'Ручные за 30 дней: ' + (data.manual30 ?? 'не найдено'),
            'Средний деп: ' + formatMoney(data.avgDeposit, cur),
            'Причина: ' + (data.reason || ''),
            'Дата регистрации: ' + (data.regDate || 'не найдено')
        ].join('\n');
    }

    function groupNumber(val) {
        const n = parseFloat(String(val).replace(/\s/g, '').replace(',', '.'));
        if (isNaN(n)) return String(val);
        const [intPart, frac] = n.toFixed(2).split('.');
        const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
        return grouped + '.' + frac;
    }

    function formatMoney(val, cur) {
        if (val === null || val === undefined || val === '') return 'не найдено';
        return groupNumber(val) + (cur ? ' ' + cur : '');
    }

    function startAvanceFormFill() {
        const raw = GM_getValue(AVANCE_KEY);
        if (!raw) return;
        let data;
        try { data = JSON.parse(raw); } catch { return; }
        if (Date.now() - data.timestamp > 15 * 60 * 1000) return;

        addForceBtn(data.action === 'loyalty' ? '🔄 Заполнить Лояльность' : '🔄 Заполнить Аванс', () => fillAvanceForm(data));
        setTimeout(() => fillAvanceForm(data), 1500);
        setTimeout(() => fillAvanceForm(data), 3000);
    }

    function showProfileStatus(msg) {
        let box = document.getElementById('plover-avance-status');
        if (!box) {
            box = document.createElement('div');
            box.id = 'plover-avance-status';
            box.style.cssText = 'position:fixed;top:12px;right:12px;z-index:999999;background:#0f172a;color:#e2e8f0;border:1px solid #334155;border-radius:12px;padding:12px 14px;font:13px/1.4 system-ui;max-width:320px;box-shadow:0 10px 25px rgba(0,0,0,.4)';
            document.body.appendChild(box);
        }
        box.textContent = msg;
    }

    function clickByText(texts, opts) {
        const loose = opts && opts.loose;
        const all = [...document.querySelectorAll('a, button, span, div, li, label, td, th, option')];
        for (const t of texts) {
            const el = all.find(n => {
                const txt = n.textContent.replace(/\s+/g, ' ').trim().toLowerCase();
                const want = t.toLowerCase();
                if (txt === want) return true;
                if (loose && txt.startsWith(want)) return true;
                return false;
            });
            if (el) {
                el.click();
                return el;
            }
        }
        return null;
    }

    function valueNearLabel(labelRe) {
        const text = getText();
        const m = text.match(labelRe);
        return m ? m[1].trim() : null;
    }

    async function waitForText(re, timeout) {
        const start = Date.now();
        while (Date.now() - start < timeout) {
            if (re.test(getText())) return true;
            await sleep(400);
        }
        return false;
    }

    function labeledRowText(labelStart) {
        const text = getText().replace(/\u00a0/g, ' ');
        const re = new RegExp(labelStart.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*:\\s*([^\\n]+)', 'i');
        const m = text.match(re);
        if (m) return m[1].trim();

        const want = labelStart.toLowerCase().replace(/\s+/g, ' ');
        const nodes = [...document.querySelectorAll('td, th, div, span, dt, dd, li, p, label')];
        for (const node of nodes) {
            const raw = node.textContent.replace(/\s+/g, ' ').trim();
            const low = raw.toLowerCase();
            if (!low.includes(want)) continue;

            if (raw.length > labelStart.length + 3) {
                const idx = low.indexOf(want);
                const rest = raw.slice(idx + labelStart.length).replace(/^[:\s]+/, '');
                if (rest && /\d/.test(rest)) return rest;
            }

            const row = node.closest('tr') || node.parentElement;
            if (row) {
                const after = row.innerText.replace(/\s+/g, ' ');
                const idx = after.toLowerCase().indexOf(want);
                if (idx >= 0) {
                    const rest = after.slice(idx + labelStart.length).replace(/^[:\s]+/, '');
                    if (rest && /\d/.test(rest)) return rest;
                }
            }
        }
        return null;
    }

    function pickAmountByCurrency(text, currency) {
        if (!text) return null;
        const compact = String(text).replace(/\u00a0/g, ' ').replace(/[\u202f\u2009]/g, ' ');
        if (currency) {
            const re = new RegExp('([0-9][0-9\\s,]*(?:[.][0-9]+)?|[0-9][0-9\\s]*)\\s*' + currency + '\\b', 'i');
            const m = compact.match(re);
            if (m) return normalizeAmount(m[1]);
        }
        const money = compact.match(/[0-9]{1,3}(?:,[0-9]{3})+(?:\.[0-9]+)?|[0-9]{1,3}(?:\s[0-9]{3})+(?:[.,][0-9]+)?|[0-9]+[.,][0-9]{2}/);
        if (money) return normalizeAmount(money[0]);
        const any = compact.match(/[0-9][0-9\s,]*/);
        return any ? normalizeAmount(any[0]) : null;
    }

    function namedDd(name) {
        const el = document.querySelector('dd[name="' + name + '"]');
        return el ? el.textContent.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim() : null;
    }

    function formatDualCurrency(line) {
        if (!line) return null;
        const raw = String(line).replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
        const pairs = [...raw.matchAll(/([0-9][0-9\s]*[.,][0-9]+|[0-9][0-9\s]*)\s*([A-Z]{3})\b/g)];
        if (pairs.length >= 2) {
            return pairs.slice(0, 2).map(p => groupNumber(p[1]) + ' ' + p[2]).join(' / ');
        }
        if (pairs.length === 1) return groupNumber(pairs[0][1]) + ' ' + pairs[0][2];
        return raw.replace(/\(\d+\)\s*$/, '').trim() || null;
    }

    function extractTurnoverByLabel(label) {
        const norm = (s) => String(s || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();

        const nodes = [...document.querySelectorAll('td, th, div, span, dt, label, p, b, strong')];
        const lab = nodes.find(n => {
            const own = norm([...n.childNodes].filter(c => c.nodeType === 3).map(c => c.textContent).join(' '));
            const full = norm(n.textContent);
            return own.replace(/:$/, '') === label || full === label || full === label + ':';
        });
        if (lab) {
            const td = lab.closest('td, th');
            const row = lab.closest('tr');
            if (td && row) {
                const cells = [...row.querySelectorAll('td, th')];
                const idx = cells.indexOf(td);
                const next = cells[idx + 1] || cells[cells.length - 1];
                const line = norm(next && next !== td ? next.textContent : row.innerText.replace(label, ''));
                const formatted = formatDualCurrency(line);
                if (formatted) return formatted;
            }
            const sib = lab.nextElementSibling;
            if (sib) {
                const formatted = formatDualCurrency(norm(sib.textContent));
                if (formatted) return formatted;
            }
        }

        const text = (document.body.innerText || '').replace(/\u00a0/g, ' ');
        const re = new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*:\\s*([^\n]*\n?[^\n]{0,160})', 'i');
        const m = text.match(re);
        if (m) return formatDualCurrency(m[1]);
        return null;
    }

    function normalizeAmount(str) {
        if (!str) return null;
        let s = String(str).replace(/\u00a0/g, '').replace(/\s/g, '');
        if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, '');
        else if (/^\d+,\d{1,2}$/.test(s)) s = s.replace(',', '.');
        else s = s.replace(',', '.');
        return s;
    }

    function parseMoney(str) {
        return pickAmountByCurrency(str, null);
    }

    function formatDateInput(d) {
        const dd = String(d.getDate()).padStart(2, '0');
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const yyyy = d.getFullYear();
        return { iso: yyyy + '-' + mm + '-' + dd, ru: dd + '.' + mm + '.' + yyyy };
    }

    function findDepositsSection() {
        const label = [...document.querySelectorAll('div,span,h1,h2,h3,h4,a,td,th,b')].find(n =>
            /^последние депозиты$/i.test(n.textContent.replace(/\s+/g, ' ').trim())
        );
        let el = label;
        while (el && el !== document.body) {
            const t = el.innerText || '';
            if (/успешные платежи/i.test(t) && /ручные/i.test(t)) return el;
            el = el.parentElement;
        }
        return label ? (label.parentElement.parentElement || document.body) : document.body;
    }

    async function setLast30DaysFilter() {
        const root = findDepositsSection();
        root.scrollIntoView({ block: 'center' });
        await sleep(300);

        const to = new Date();
        const from = new Date();
        from.setDate(to.getDate() - 30);
        const fromFmt = formatDateInput(from);
        const toFmt = formatDateInput(to);

        const periodSelect = [...root.querySelectorAll('select')].find(s =>
            [...s.options].some(o => /текущий месяц|произвольн|прошлый месяц|custom/i.test(o.text))
        ) || [...document.querySelectorAll('select')].find(s =>
            [...s.options].some(o => /текущий месяц|произвольн|прошлый месяц/i.test(o.text))
        );

        if (periodSelect) {
            const opt = [...periodSelect.options].find(o => /произвольн|custom range|свой период/i.test(o.text));
            if (opt) {
                periodSelect.value = opt.value;
                periodSelect.dispatchEvent(new Event('change', { bubbles: true }));
            }
        } else {
            const drop = [...root.querySelectorAll('button, a, span, div, select')].find(n =>
                /текущий месяц|произвольн период/i.test(n.textContent.replace(/\s+/g, ' ').trim())
                && n.textContent.trim().length < 40
            );
            if (drop) drop.click();
            await sleep(300);
            clickByText(['Произвольный период', 'Произвольный', 'Custom range'], { loose: true });
        }

        await sleep(500);

        const applyVal = (el, val) => {
            if (!el) return;
            el.focus();
            el.value = el.type === 'date' ? val.iso : val.ru;
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
        };

        const scope = findDepositsSection();
        const inputs = [...scope.querySelectorAll('input[type="date"], input[type="text"], input')].filter(i => {
            const meta = ((i.name || '') + (i.id || '') + (i.placeholder || '') + (i.className || '')).toLowerCase();
            return i.offsetParent !== null && (i.type === 'date' || /date|дат|period|from|to|от|до/.test(meta));
        });

        const fromEl = inputs.find(i => /from|start|от|begin/.test(((i.name || '') + (i.id || '') + (i.placeholder || '')).toLowerCase()));
        const toEl = inputs.find(i => /to|end|до|finish/.test(((i.name || '') + (i.id || '') + (i.placeholder || '')).toLowerCase()));

        if (fromEl && toEl) {
            applyVal(fromEl, fromFmt);
            applyVal(toEl, toFmt);
        } else if (inputs.length >= 2) {
            applyVal(inputs[0], fromFmt);
            applyVal(inputs[1], toFmt);
        }

        const applyBtn = [...scope.querySelectorAll('button, a, input[type="submit"]')].find(n =>
            /применить|показать|фильтр|ok|apply/i.test(n.textContent || n.value || '')
        );
        if (applyBtn) applyBtn.click();
        await sleep(1200);
    }

    function readTabCount(title) {
        const root = findDepositsSection();
        const nodes = [...root.querySelectorAll('a, button, span, div, li, h4, h5, td')];
        const el = nodes.find(n => {
            const t = n.textContent.replace(/\s+/g, ' ').trim();
            return new RegExp('^' + title + '\\s*\\(\\d+\\)$', 'i').test(t);
        });
        const m = el && el.textContent.replace(/\s+/g, ' ').trim().match(/\((\d+)\)\s*$/);
        return m ? m[1] : null;
    }

    function clickDepositTab(title) {
        const root = findDepositsSection();
        const nodes = [...root.querySelectorAll('a, button, span, div, li, h4, h5, td')];
        const el = nodes.find(n => {
            const t = n.textContent.replace(/\s+/g, ' ').trim();
            return new RegExp('^' + title + '\\s*\\(\\d+\\)$', 'i').test(t)
                || new RegExp('^' + title + '$', 'i').test(t);
        });
        if (el) {
            el.scrollIntoView({ block: 'center' });
            (el.closest('a, button, tr, .accordion-toggle, .panel-heading') || el).click();
            el.click();
            return el;
        }
        return clickByText([title], { loose: true });
    }

    function isDateLike(txt) {
        const t = String(txt).trim();
        return /^\d{1,2}[./-]\d{1,2}([./-]\d{2,4})?$/.test(t)
            || /^\d{4}-\d{2}-\d{2}/.test(t)
            || /\d{1,2}[./-]\d{1,2}[./-]\d{2,4}/.test(t);
    }

    function parseCellAmount(txt, currency) {
        if (!txt) return null;
        const raw = String(txt).replace(/\u00a0/g, ' ').trim();
        if (!raw || /^сумма$/i.test(raw) || isDateLike(raw)) return null;
        if (/^\d{6,}$/.test(raw.replace(/\s/g, ''))) return null;

        if (currency) {
            const byCur = pickAmountByCurrency(raw, currency);
            if (byCur) {
                const n = parseFloat(byCur);
                if (!isNaN(n)) return n;
            }
        }

        const money = raw.match(/[0-9]{1,3}(?:,[0-9]{3})+(?:\.[0-9]+)?|[0-9]{1,3}(?:\s[0-9]{3})+(?:[.,][0-9]+)?|[0-9]+[.,][0-9]{2}/);
        if (money && !isDateLike(money[0])) {
            const n = parseFloat(normalizeAmount(money[0]));
            if (!isNaN(n)) return n;
        }
        return null;
    }

    function findSumColumnIndex(table) {
        const rows = [...table.querySelectorAll('tr')];
        for (const row of rows.slice(0, 3)) {
            const cells = [...row.querySelectorAll('th, td')];
            const idx = cells.findIndex(c => /сумма/i.test(c.textContent.replace(/\s+/g, ' ')));
            if (idx >= 0) return idx;
        }
        return -1;
    }

    function isVisibleRow(tr) {
        if (!tr) return false;
        const st = getComputedStyle(tr);
        if (st.display === 'none' || st.visibility === 'hidden') return false;
        return tr.getBoundingClientRect().height > 8;
    }

    function amountFromRow(tr, currency, col) {
        const cells = [...tr.querySelectorAll('td')];
        if (!cells.length || col < 0 || !cells[col]) return null;
        const txt = cells[col].textContent.replace(/\u00a0/g, ' ').trim();
        if (/итого|всего|total/i.test(tr.textContent)) return null;
        return parseCellAmount(txt, currency);
    }

    function amountsFromTable(table, currency) {
        if (!table) return [];
        const col = findSumColumnIndex(table);
        console.log('[Plover] индекс колонки Сумма=', col);
        if (col < 0) return [];

        const bodyRows = [...table.querySelectorAll('tbody tr')];
        const rows = (bodyRows.length ? bodyRows : [...table.querySelectorAll('tr')].slice(1))
            .filter(tr => isVisibleRow(tr) && !tr.querySelector('th'));

        const out = [];
        rows.forEach(tr => {
            const num = amountFromRow(tr, currency, col);
            if (num != null && !isNaN(num)) out.push(num);
        });
        console.log('[Plover] видимые суммы:', out);
        return out;
    }

    function findVisibleSumTable() {
        const root = findDepositsSection();
        const tables = [...root.querySelectorAll('table')].filter(t => {
            const rect = t.getBoundingClientRect();
            return rect.height > 25 && t.querySelectorAll('tr').length > 1;
        });
        return tables.find(t => /сумма/i.test(t.innerText)) || tables[tables.length - 1] || null;
    }

    function paginationRoot(table) {
        return table?.closest('.dataTables_wrapper, .tab-content, .accordion-body, .panel-body, .collapse.in, .collapse.show')
            || table?.parentElement
            || findDepositsSection();
    }

    function findPager(table) {
        const root = findDepositsSection();
        const near = paginationRoot(table);
        const candidates = [...root.querySelectorAll('div, ul, nav, span')].filter(n => {
            const t = n.textContent.replace(/\s+/g, ' ').trim();
            return /следующ/i.test(t) && /\b2\b/.test(t) && t.length < 80;
        });
        return candidates[candidates.length - 1]
            || near.querySelector('.dataTables_paginate, .pagination, ul.pagination, .pager')
            || near;
    }

    function clickTablePage(table, pageNum) {
        const pag = findPager(table);
        const el = [...pag.querySelectorAll('a, button, span, li')].find(n => n.textContent.replace(/\s+/g, ' ').trim() === String(pageNum));
        if (!el) return false;
        (el.closest('a, button, li') || el).click();
        return true;
    }

    function clickTableNext(table) {
        const pag = findPager(table);
        const el = [...pag.querySelectorAll('a, button, span, li')].find(n => {
            const t = n.textContent.replace(/\s+/g, ' ').trim();
            return /следующ/i.test(t);
        });
        if (!el) return false;
        (el.closest('a, button, li') || el).click();
        return true;
    }

    function amountsFromDataTable(table, currency, maxRows) {
        const $ = (typeof window.jQuery === 'function') ? window.jQuery : null;
        if (!$ || !$.fn || !$.fn.dataTable || !table) return null;
        try {
            if (!$.fn.dataTable.isDataTable(table)) return null;
            const dt = $(table).DataTable();
            const headers = dt.columns().header().toArray().map(h => (h.textContent || '').replace(/\s+/g, ' ').trim());
            let col = headers.findIndex(h => /сумма|amount|sum\b/i.test(h));
            if (col < 0) return null;
            const pageLen = dt.page.len() || 10;
            const limit = maxRows ? maxRows : 0;
            const values = [];
            dt.rows({ search: 'applied', order: 'current' }).every(function () {
                if (limit && values.length >= limit) return;
                const data = this.data();
                let txt = '';
                if (Array.isArray(data)) txt = String(data[col] ?? '');
                else if (data && typeof data === 'object') txt = String(data[col] ?? data['Сумма'] ?? '');
                else txt = String(data ?? '');
                txt = txt.replace(/<[^>]+>/g, ' ');
                const n = parseCellAmount(txt, currency);
                if (n != null) values.push(n);
            });
            console.log('[Plover] DataTable', headers, 'col', col, values);
            return values;
        } catch (e) {
            console.warn('[Plover] DataTable error', e);
            return null;
        }
    }

    function pageJQuery() {
        const uw = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
        if (typeof uw.jQuery === 'function') return uw.jQuery;
        if (typeof uw.$ === 'function' && uw.$.fn) return uw.$;
        return null;
    }

    async function setShowPerPage(size, tabTitle) {
        const want = String(size);
        let select = null;
        if (/успешн/i.test(tabTitle || '')) {
            select = document.querySelector('#lastDepositsSucceededPerPageSelector')
                || document.querySelector('#lastDepositsSucceeded select.page-limiter');
        } else if (/ручн/i.test(tabTitle || '')) {
            select = document.querySelector('#lastDepositsManualPerPageSelector')
                || document.querySelector('[id*="Manual"][id*="PerPage"]');
        }
        if (!select) {
            select = document.querySelector('#lastDepositsSucceededPerPageSelector')
                || document.querySelector('select.page-limiter.filter-limit-categories');
        }
        if (!select) {
            console.warn('[Plover] page-limiter не найден');
            return false;
        }

        const opt = [...select.options].find(o => o.value === want || o.text.trim() === want);
        if (!opt) {
            console.warn('[Plover] нет option', want, [...select.options].map(o => o.value));
            return false;
        }

        [...select.options].forEach(o => { o.selected = o === opt; });
        select.value = opt.value;
        select.dispatchEvent(new Event('input', { bubbles: true }));
        select.dispatchEvent(new Event('change', { bubbles: true }));

        const $ = pageJQuery();
        if ($) {
            try { $(select).val(opt.value).trigger('change'); } catch (e) {}
        }

        console.log('[Plover] Показывать по', select.id, '=', want, 'url=', select.getAttribute('data-url'));
        return true;
    }

    async function collectTabAmounts(tabTitle, currency, maxPages, pageSize) {
        clickDepositTab(tabTitle);
        let table = null;
        const startWait = Date.now();
        while (Date.now() - startWait < 8000) {
            table = findVisibleSumTable();
            if (table) break;
            await sleep(400);
        }

        if (pageSize) {
            showProfileStatus('Plover: ' + tabTitle + ' — показывать по ' + pageSize);
            await setShowPerPage(pageSize, tabTitle);
            await sleep(1800);
            table = document.querySelector('#lastDepositsSucceeded table') || findVisibleSumTable() || table;
            let rowsNow = table ? amountsFromTable(table, currency).length : 0;
            if (rowsNow < pageSize - 2) {
                await setShowPerPage(pageSize, tabTitle);
                await sleep(1800);
                table = findVisibleSumTable() || table;
            }
            const waitRows = Date.now();
            while (Date.now() - waitRows < 10000) {
                table = document.querySelector('#lastDepositsSucceeded table') || findVisibleSumTable() || table;
                const chunk = table ? amountsFromTable(table, currency) : [];
                rowsNow = chunk.length;
                showProfileStatus('Plover: строк в таблице ' + rowsNow);
                if (rowsNow >= pageSize - 1) break;
                await sleep(500);
            }
        }

        function rowSign(tbl) {
            const rows = [...(tbl?.querySelectorAll('tbody tr') || tbl?.querySelectorAll('tr') || [])]
                .filter(tr => isVisibleRow(tr) && !tr.querySelector('th') && /\d{6,}/.test(tr.textContent));
            return rows[0] ? rows[0].innerText.replace(/\s+/g, ' ').slice(0, 160) : '';
        }

        function fireClick(el) {
            if (!el) return;
            el.scrollIntoView({ block: 'center' });
            el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
            el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
            el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
            el.click();
        }

        function findNextLink() {
            const nodes = [...document.querySelectorAll('a, button, span, div, li')];
            return nodes
                .filter(n => {
                    const t = n.textContent.replace(/\s+/g, ' ').trim();
                    return /^следующая\s*>?$/i.test(t) || t === 'Следующая >';
                })
                .sort((a, b) => a.textContent.length - b.textContent.length)[0] || null;
        }

        function findPageNumLink(pageNum) {
            const nodes = [...document.querySelectorAll('a, button, span, li, div')];
            return nodes.find(n => {
                const t = n.textContent.replace(/\s+/g, ' ').trim();
                if (t !== String(pageNum)) return false;
                let p = n;
                for (let i = 0; i < 6 && p; i++) {
                    const box = (p.textContent || '').replace(/\s+/g, ' ');
                    if (/следующ/i.test(box) && box.length < 80) return true;
                    p = p.parentElement;
                }
                return false;
            }) || null;
        }

        async function openPage(tbl, pageNum) {
            const before = rowSign(tbl);
            const target = (pageNum === 2 && findNextLink()) || findPageNumLink(pageNum) || findNextLink();
            if (!target) {
                console.warn('[Plover] пагинация не найдена', pageNum);
                return false;
            }
            console.log('[Plover] кликаю пагинацию', target.textContent.trim());
            fireClick(target);

            for (let i = 0; i < 20; i++) {
                await sleep(300);
                const now = findVisibleSumTable() || tbl;
                if (rowSign(now) && rowSign(now) !== before) return true;
            }
            return false;
        }

        let all = [];

        for (let page = 1; page <= maxPages; page++) {
            if (page > 1) {
                table = findVisibleSumTable() || table;
                showProfileStatus('Plover: ' + tabTitle + ' — страница ' + page);
                const ok = await openPage(table, page);
                if (!ok) {
                    fireClick(findNextLink() || findPageNumLink(page));
                    await sleep(1800);
                }
                table = findVisibleSumTable() || table;
            }

            const chunk = table ? amountsFromTable(table, currency) : [];
            console.log('[Plover]', tabTitle, 'стр.', page, chunk);
            all = all.concat(chunk);
        }

        const total = all.reduce((a, b) => a + b, 0);
        const count = all.length;
        return {
            total: count ? String(Math.round(total * 100) / 100) : null,
            avg: count ? String(Math.round((total / count) * 100) / 100) : null,
            count
        };
    }

    async function scrapeAvanceProfile() {
        const raw = GM_getValue(AVANCE_KEY);
        if (!raw) return;
        let data;
        try { data = JSON.parse(raw); } catch { return; }
        if (data.stage !== 'profile') return;
        if (Date.now() - data.timestamp > 15 * 60 * 1000) return;

        showProfileStatus('Plover: жду загрузку профиля…');
        await waitForText(/Последние депозиты|Обороты\/прибыль|Дата регистрации/i, 20000);
        await sleep(1200);

        const showAll = [...document.querySelectorAll('a, button, span')].find(n =>
            /^показать всё$/i.test(n.textContent.replace(/\s+/g, ' ').trim())
        );
        if (showAll) {
            showAll.click();
            showProfileStatus('Plover: нажал «Показать всё», жду обороты…');
        }

        await waitForText(/Выводы через платежные системы[\s\S]{0,80}(EUR|RUB)/i, 15000);
        await sleep(1000);

        showProfileStatus('Plover: читаю обороты/прибыль…');
        const addDate = namedDd('col-AddDateDd');
        const rawDate = addDate
            || valueNearLabel(/Дата регистрации[:\s]*([0-9]{4}-[0-9]{2}-[0-9]{2}(?:\s*\([^)]+\))?)/i)
            || valueNearLabel(/Дата регистрации[:\s]*([0-9./-]+(?:\s+[0-9:]+)?)/i);
        data.regDate = rawDate ? rawDate.replace(/\s*\([^)]*\)\s*/g, '').trim() : null;

        const wRaw = namedDd('col-PaymentSystemWithdrawalsDd') || extractTurnoverByLabel('Выводы через платежные системы');
        const dRaw = namedDd('col-PaymentSystemDepositsDd') || extractTurnoverByLabel('Депозиты через платежную систему');
        data.pspWithdrawals = formatDualCurrency(wRaw) || wRaw;
        data.pspDeposits = formatDualCurrency(dRaw) || dRaw;
        console.log('[Plover] выводы=', data.pspWithdrawals, 'депозиты=', data.pspDeposits);

        showProfileStatus('Plover: период 30 дней в Последние депозиты…');
        const depHeader = [...document.querySelectorAll('div,span,a,h2,h3,h4')].find(n =>
            /^последние депозиты$/i.test(n.textContent.replace(/\s+/g, ' ').trim())
        );
        if (depHeader) depHeader.scrollIntoView({ block: 'center' });
        await sleep(400);
        await setLast30DaysFilter();

        showProfileStatus('Plover: вкладка Ручные…');
        const manual = await collectTabAmounts('Ручные', data.currency, 1);
        const headerCount = readTabCount('Ручные');
        data.manual30 = headerCount || manual.count || null;

        showProfileStatus('Plover: вкладка Успешные платежи, по 30…');
        const success = await collectTabAmounts('Успешные платежи', data.currency, 1, 30);
        data.avgDeposit = success.avg;
        data.successTotal30 = success.total;

        data.stage = 'form';
        data.timestamp = Date.now();
        GM_setValue(AVANCE_KEY, JSON.stringify(data));

        const formUrl = data.action === 'loyalty' ? FORM_LOYALTY : FORM_AVANCE;
        showProfileStatus('Plover: открываю форму…\nВыводы: ' + data.pspWithdrawals + '\nДепозиты: ' + data.pspDeposits + '\nРучные: ' + data.manual30 + '\nСредний: ' + data.avgDeposit);
        await sleep(600);

        const params = new URLSearchParams();
        const summary = [data.playerId, data.project].filter(Boolean).join(' ');
        if (summary) params.set('summary', summary);
        params.set('description', buildAvanceDescription(data));
        GM_openInTab(formUrl + '?' + params.toString(), { active: true });
    }

    if (location.hostname.includes('app.helpdesk.com')) {
        watchHelpdeskSpa();
    } else if (location.href.includes('/create/668')) {
        startMinmaxFill();
    } else if (location.href.includes('/create/682') || location.href.includes('/create/683')) {
        startAvanceFormFill();
    } else if (/\.boadmin\.org$/i.test(location.hostname) && /\/Users\/Summary\//i.test(location.pathname)) {
        scrapeAvanceProfile();
    }
})();
