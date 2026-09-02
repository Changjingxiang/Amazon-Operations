(function () {
  'use strict';

  // The production bundle is intentionally kept untouched here.  This small
  // enhancement is loaded after it and adds the ASIN editor, monthly ABA CSV
  // import controls, ABA comparison columns, and the one-click SIF batch-import
  // control to the existing web UI.
  const ASIN_PATTERN = /^B0[A-Z0-9]{8}$/;
  const STYLE_ID = 'keyword-tracker-asin-editor-style';
  const EDITOR_ATTR = 'data-parent-asin-editor';
  const BATCH_ATTR = 'data-sif-batch-import';
  const ABA_IMPORT_ATTR = 'data-aba-monthly-import';
  const ABA_TABLE_ATTR = 'data-aba-comparison-columns';
  const MATRIX_LATEST_SCROLL_ATTR = 'data-matrix-latest-date-aligned';
  const ABA_COUNTRIES = [
    { code: 'US', label: '美国站' },
    { code: 'DE', label: '德国站' },
    { code: 'UK', label: '英国站' },
    { code: 'JP', label: '日本站' },
    { code: 'CA', label: '加拿大站' },
    { code: 'FR', label: '法国站' },
    { code: 'ES', label: '西班牙站' },
    { code: 'IT', label: '意大利站' },
  ];

  function addStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .settings-asin-editor{margin:0 0 10px;padding:10px;border:1px solid #b8d9df;border-radius:9px;background:#f5fdff}
      .settings-asin-editor-title{display:block;margin-bottom:7px;color:#245b68;font-size:11px;font-weight:800}
      .settings-asin-editor-row{display:flex;align-items:center;gap:7px}
      .settings-asin-editor-row input{box-sizing:border-box;min-width:0;flex:1;height:32px;border:1px solid #9fc5cc;border-radius:7px;background:#fff;padding:0 8px;color:#25354d;font:700 12px Inter,"Microsoft YaHei",sans-serif;text-transform:uppercase;outline:0}
      .settings-asin-editor-row input:focus{border-color:#27c7d9;box-shadow:0 0 0 3px #27c7d921}
      .settings-asin-editor-row input[aria-invalid="true"]{border-color:#d85454;background:#fff7f5;box-shadow:0 0 0 3px #d8545420}
      .settings-asin-save{flex:0 0 auto;height:32px;border:1px solid #178b9a;border-radius:7px;background:#27c7d9;color:#173b64;padding:0 10px;font:800 11px Inter,"Microsoft YaHei",sans-serif;cursor:pointer;white-space:nowrap}
      .settings-asin-save:hover:not(:disabled){background:#13b6c9;transform:translateY(-1px)}
      .settings-asin-save:disabled{cursor:wait;opacity:.58}
      .settings-asin-help{display:block;margin-top:6px;color:#66818a;font-size:10px;line-height:1.45}
      .settings-asin-status{display:block;margin-top:6px;color:#16815b;font-size:10px;line-height:1.45}
      .settings-asin-status.is-error{color:#b43b3b}
      .sif-all-import-button{min-width:188px!important;border-color:#173b64!important;background:#173b64!important;color:#fff!important}
      .sif-all-import-button:hover:not(:disabled){background:#245a8e!important;transform:translateY(-1px)}
      .sif-all-import-button:disabled{cursor:wait;opacity:.65}
      .sif-all-import-status{display:block;flex:0 1 280px;min-width:120px;max-width:300px;margin:5px 0 0;color:#547089;font-size:11px;line-height:1.4;white-space:normal}
      .sif-all-import-status.is-error{color:#b43b3b}
      .settings-modal{max-height:calc(100vh - 36px);overflow:auto}
      .settings-aba-import{margin:14px 0 12px;padding:13px;border:1px solid #d5c2ec;border-radius:11px;background:linear-gradient(135deg,#fbf8ff,#f5fbff)}
      .settings-aba-import-title{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:4px;color:#49356d;font-size:13px;font-weight:800}
      .settings-aba-import-title small{color:#7a6a96;font-size:10px;font-weight:600}
      .settings-aba-import-help{display:block;margin:0 0 10px;color:#6e7890;font-size:10px;line-height:1.55}
      .settings-aba-import-fields{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:9px}
      .settings-aba-import-fields label{display:flex;min-width:0;flex-direction:column;gap:4px;color:#52617b;font-size:10px;font-weight:700}
      .settings-aba-import-fields input,.settings-aba-import-fields select{box-sizing:border-box;width:100%;height:31px;border:1px solid #c9b7df;border-radius:7px;background:#fff;padding:0 7px;color:#25354d;font:700 11px Inter,"Microsoft YaHei",sans-serif;outline:0}
      .settings-aba-import-fields input:focus,.settings-aba-import-fields select:focus{border-color:#9066c4;box-shadow:0 0 0 3px #9066c421}
      .settings-aba-file{display:block;width:100%;margin:0 0 9px;color:#52617b;font-size:10px;font-weight:700}
      .settings-aba-file input{box-sizing:border-box;width:100%;margin-top:4px;padding:5px;border:1px dashed #b9a2d7;border-radius:7px;background:#fff;color:#52617b;font:600 10px Inter,"Microsoft YaHei",sans-serif}
      .settings-aba-import-button{width:100%;height:34px;border:1px solid #6947a0;border-radius:8px;background:#7650b5;color:#fff;font:800 12px Inter,"Microsoft YaHei",sans-serif;cursor:pointer}
      .settings-aba-import-button:hover:not(:disabled){background:#633e9d;transform:translateY(-1px)}
      .settings-aba-import-button:disabled{cursor:wait;opacity:.6}
      .settings-aba-import-status{display:block;min-height:15px;margin-top:7px;color:#3d6f74;font-size:10px;line-height:1.45;white-space:pre-wrap}
      .settings-aba-import-status.is-error{color:#b43b3b}
      .settings-aba-imported{margin-top:9px;border-top:1px solid #e6def0;padding-top:8px}
      .settings-aba-imported-title{display:block;margin-bottom:4px;color:#684a8b;font-size:10px;font-weight:800}
      .settings-aba-imported-list{display:grid;gap:3px;max-height:112px;overflow:auto}
      .settings-aba-imported-item{display:flex;align-items:center;justify-content:space-between;gap:6px;color:#657389;font-size:10px;line-height:1.35}
      .settings-aba-imported-item strong{color:#4a5870;font-size:10px}.settings-aba-imported-item small{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .aba-comparison-head{min-width:126px!important;width:126px!important;padding:0 7px!important;line-height:1.3!important;white-space:normal!important}
      .aba-comparison-cell{min-width:126px!important;width:126px!important;font-weight:800;white-space:nowrap}
      .aba-comparison-cell.aba-trend-up{color:#c84d56;background:#fff4f2}
      .aba-comparison-cell.aba-trend-down{color:#23845c;background:#f1fbf5}
      .aba-comparison-cell.aba-trend-same{color:#6d7787;background:#f4f6f8}
      .aba-comparison-cell.aba-trend-none{color:#9aa4b1;background:#fafbfc}
      .aba-comparison-note{display:block;margin-top:2px;color:inherit;font-size:9px;font-weight:600;opacity:.78}
      /* Keep sticky keyword cells below the three sticky ABA header rows.  A
         higher z-index here lets scrolled body keywords paint over the
         header, which is the "飞出"/错位 effect seen in the monthly table. */
      .aba-table tbody .aba-keyword-cell{z-index:3!important}
      .aba-table thead .keyword-col{z-index:8!important}
      /* Matrix ranks are numeric values, so keep them flush to the right edge
         of each date column in both the natural and SP matrices. */
      .matrix-table td.matrix-annotation-cell{text-align:right!important}
      .matrix-table td.matrix-annotation-cell .sp-rank-value{display:block;text-align:right}
      .matrix-table td.matrix-annotation-cell .cell-annotation-input{text-align:right}
      @media (max-width:1180px){.header-actions{flex-wrap:wrap}.sif-all-import-status{flex-basis:100%;max-width:none;text-align:right}}
      @media (max-width:620px){.settings-aba-import-fields{grid-template-columns:1fr 1fr}.settings-aba-import-fields label:last-child{grid-column:1/-1}}
      @media (max-width:520px){.settings-asin-editor-row{align-items:stretch;flex-direction:column}.settings-asin-save{width:100%}.settings-aba-import-fields{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function setStatus(editor, message, isError) {
    const status = editor.querySelector('.settings-asin-status');
    if (!status) return;
    status.textContent = message || '';
    status.classList.toggle('is-error', Boolean(isError));
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (character) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[character]));
  }

  function modelDetails(item) {
    const name = item.querySelector('.settings-product-copy strong')?.textContent.trim() || '';
    const oldAsin = item.querySelector('.settings-product-copy small')?.textContent.trim().toUpperCase() || '';
    return { name, oldAsin };
  }

  function installEditor(item) {
    if (!(item instanceof HTMLElement) || item.querySelector(`[${EDITOR_ATTR}]`)) return;
    const { name, oldAsin } = modelDetails(item);
    if (!name || !ASIN_PATTERN.test(oldAsin)) return;

    const editor = document.createElement('div');
    editor.className = 'settings-asin-editor';
    editor.setAttribute(EDITOR_ATTR, '');
    editor.innerHTML = `
      <span class="settings-asin-editor-title">修改父体 ASIN</span>
      <div class="settings-asin-editor-row">
        <input type="text" value="${escapeHtml(oldAsin)}" maxlength="10" aria-label="${escapeHtml(name)}新的父体 ASIN" spellcheck="false" />
        <button type="button" class="settings-asin-save">保存 ASIN</button>
      </div>
      <small class="settings-asin-help">修改后原有历史、关注词和标注都会保留，旧 ASIN 报表仍可匹配。</small>
      <small class="settings-asin-status" role="status" aria-live="polite"></small>
    `;

    const input = editor.querySelector('input');
    const save = editor.querySelector('.settings-asin-save');
    const submit = async () => {
      const nextAsin = String(input.value || '').trim().toUpperCase();
      input.value = nextAsin;
      input.removeAttribute('aria-invalid');
      if (!ASIN_PATTERN.test(nextAsin)) {
        input.setAttribute('aria-invalid', 'true');
        setStatus(editor, '请输入格式为 B0XXXXXXXX 的 10 位父体 ASIN。', true);
        input.focus();
        return;
      }
      if (nextAsin === oldAsin) {
        setStatus(editor, '新旧 ASIN 相同，无需修改。');
        return;
      }
      const bridge = window.keywordTracker;
      if (!bridge || typeof bridge.changeModelAsin !== 'function') {
        setStatus(editor, '当前网页未加载 ASIN 修改功能，请刷新后重试。', true);
        return;
      }
      save.disabled = true;
      input.disabled = true;
      setStatus(editor, '正在保存，历史数据不会被删除……');
      try {
        const response = await bridge.changeModelAsin({
          modelName: name,
          oldParentAsin: oldAsin,
          newParentAsin: nextAsin,
        });
        const message = response && response.output
          ? String(response.output)
          : `已将父体 ASIN 修改为 ${nextAsin}，历史数据已保留。`;
        setStatus(editor, `${message} 页面即将刷新。`);
        window.setTimeout(() => window.location.reload(), 700);
      } catch (error) {
        save.disabled = false;
        input.disabled = false;
        setStatus(editor, error && error.message ? error.message : '保存失败，请重试。', true);
      }
    };

    input.addEventListener('input', () => {
      input.value = input.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
      input.removeAttribute('aria-invalid');
      setStatus(editor, '');
    });
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        submit();
      }
    });
    save.addEventListener('click', submit);

    const country = item.querySelector('.settings-country-control');
    const actions = item.querySelector('.settings-delete-actions');
    (country || actions || item.lastElementChild)?.before(editor);
  }

  function keywordKey(value) {
    return String(value == null ? '' : value).trim().toLocaleLowerCase('en-US');
  }

  function activeModel(data) {
    const asin = document.querySelector('.topbar p')?.textContent.match(/B0[A-Z0-9]{8}/i)?.[0]?.toUpperCase();
    return (data?.models || []).find((model) => model.parentAsin === asin) || data?.models?.[0] || null;
  }

  function renderAbaImportList(section, data) {
    const list = section.querySelector('.settings-aba-imported-list');
    if (!list) return;
    section._abaImports = Array.isArray(data?.abaMonthlyImports) ? data.abaMonthlyImports : [];
    list.textContent = '';
    const imports = section._abaImports;
    if (!imports.length) {
      const empty = document.createElement('small');
      empty.textContent = '尚未导入去年月 ABA 文件。';
      empty.className = 'settings-aba-imported-item';
      list.appendChild(empty);
      return;
    }
    imports.forEach((item) => {
      const line = document.createElement('div');
      line.className = 'settings-aba-imported-item';
      const title = document.createElement('strong');
      title.textContent = `${item.countryName || item.countryCode || '加拿大站'} ${item.month}`;
      const detail = document.createElement('small');
      detail.textContent = `${Number(item.rowCount || 0).toLocaleString('zh-CN')} 词${item.fileName ? ` · ${item.fileName}` : ''}`;
      detail.title = item.fileName || '';
      line.append(title, detail);
      list.appendChild(line);
    });
  }

  function installAbaImport() {
    const modal = document.querySelector('.settings-modal');
    if (!modal || modal.querySelector(`[${ABA_IMPORT_ATTR}]`)) return;
    const section = document.createElement('section');
    section.className = 'settings-aba-import';
    section.setAttribute(ABA_IMPORT_ATTR, '');
    const year = new Date().getFullYear() - 1;
    const month = new Date().getMonth() + 1;
    section.innerHTML = `
      <div class="settings-aba-import-title"><span>去年月 ABA 导入</span><small>搜索词 = 关键词 · 搜索频率排名 = ABA排名</small></div>
      <p class="settings-aba-import-help">按国家、年份、月份导入月度 ABA CSV。导入后会用于 ABA 月榜的同比和去年环比趋势；同一国家和月份再次导入会覆盖旧文件。</p>
      <div class="settings-aba-import-fields">
        <label>国家<select data-aba-country>${ABA_COUNTRIES.map((item) => `<option value="${item.code}">${item.label}</option>`).join('')}</select></label>
        <label>年份<input data-aba-year type="number" min="2000" max="2100" step="1" value="${year}" /></label>
        <label>月份<select data-aba-month>${Array.from({ length: 12 }, (_item, index) => `<option value="${index + 1}">${index + 1} 月</option>`).join('')}</select></label>
      </div>
      <label class="settings-aba-file">月 ABA CSV 文件<input data-aba-file type="file" accept=".csv,text/csv" /></label>
      <button type="button" class="settings-aba-import-button" data-aba-import-action>导入月 ABA 文件</button>
      <small class="settings-aba-import-status" data-aba-import-status role="status" aria-live="polite"></small>
      <div class="settings-aba-imported"><span class="settings-aba-imported-title">已导入月份</span><div class="settings-aba-imported-list"></div></div>
    `;
    const countryInput = section.querySelector('[data-aba-country]');
    const yearInput = section.querySelector('[data-aba-year]');
    const monthInput = section.querySelector('[data-aba-month]');
    const fileInput = section.querySelector('[data-aba-file]');
    const button = section.querySelector('[data-aba-import-action]');
    const status = section.querySelector('[data-aba-import-status]');
    const setAbaStatus = (message, isError = false) => {
      status.textContent = message || '';
      status.classList.toggle('is-error', Boolean(isError));
    };
    const refresh = async () => {
      const api = window.keywordTracker;
      if (!api || typeof api.getData !== 'function') return null;
      try {
        const data = await api.getData();
        const model = activeModel(data);
        if (model?.countryCode && !countryInput.dataset.userChanged) countryInput.value = model.countryCode;
        renderAbaImportList(section, data);
        return data;
      } catch (error) {
        setAbaStatus(error?.message || '读取已导入月份失败。', true);
        return null;
      }
    };
    countryInput.addEventListener('change', () => { countryInput.dataset.userChanged = 'true'; });
    monthInput.value = String(month);
    button.addEventListener('click', async () => {
      if (button.disabled) return;
      const file = fileInput.files?.[0];
      const selectedYear = Number(yearInput.value);
      const selectedMonth = Number(monthInput.value);
      if (!file) { setAbaStatus('请先选择月 ABA CSV 文件。', true); fileInput.focus(); return; }
      if (!Number.isInteger(selectedYear) || selectedYear < 2000 || selectedYear > 2100) { setAbaStatus('年份应为 2000 至 2100 的整数。', true); yearInput.focus(); return; }
      const monthKey = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}`;
      const existing = (section._abaImports || []).some((item) =>
        item.month === monthKey && String(item.countryCode || '').toUpperCase() === String(countryInput.value || '').toUpperCase());
      // The confirmation is deliberately explicit because replacing a month
      // changes both comparison columns for every matching keyword.
      if (existing && !window.confirm(`已存在 ${monthKey} 的月 ABA 数据，确定覆盖吗？`)) return;
      const api = window.keywordTracker;
      if (!api || typeof api.importAbaMonthlyCsv !== 'function') { setAbaStatus('当前网页未加载月 ABA 导入功能，请刷新后重试。', true); return; }
      button.disabled = true;
      setAbaStatus(`正在解析 ${file.name}，大文件可能需要一点时间……`);
      try {
        const response = await api.importAbaMonthlyCsv({
          countryCode: countryInput.value,
          year: selectedYear,
          month: selectedMonth,
          file,
          replace: true,
        });
        setAbaStatus(response?.output || `${monthKey} 月 ABA 已导入。`);
        fileInput.value = '';
        await refresh();
      } catch (error) {
        setAbaStatus(error?.message || '月 ABA 导入失败，请检查文件和月份。', true);
      } finally {
        button.disabled = false;
      }
    });
    const resetButton = modal.querySelector('.settings-reset-button');
    (resetButton || modal.querySelector('.drawer-header'))?.after(section);
    refresh();
  }

  function comparisonLabel(direction) {
    return ({ up: '上升', down: '下降', same: '持平', none: '—' })[direction] || '—';
  }

  function comparisonTitle(row, kind) {
    if (kind === 'yoy') {
      const median = row.abaCurrentMedian == null ? '—' : Number(row.abaCurrentMedian).toLocaleString('zh-CN');
      const previous = row.abaPreviousYearRank == null ? '—' : Number(row.abaPreviousYearRank).toLocaleString('zh-CN');
      return `${row.abaCurrentMonth || '本月'}周ABA中位数：${median}；${row.abaPreviousYearMonth || '去年同月'}：${previous}。数字越小越好。`;
    }
    const previous = row.abaPreviousYearRank == null ? '—' : Number(row.abaPreviousYearRank).toLocaleString('zh-CN');
    const next = row.abaPreviousYearNextRank == null ? '—' : Number(row.abaPreviousYearNextRank).toLocaleString('zh-CN');
    return `${row.abaPreviousYearMonth || '去年同月'}：${previous}；下一个月：${next}。数字越小越好。`;
  }

  function applyComparisonCell(cell, row, kind) {
    const direction = kind === 'yoy' ? row?.abaYoYTrend : row?.abaPreviousYearMoMTrend;
    const label = comparisonLabel(direction);
    cell.className = `aba-comparison-cell aba-trend-${direction || 'none'}`;
    cell.textContent = label;
    cell.title = comparisonTitle(row || {}, kind);
    cell.setAttribute('aria-label', `${kind === 'yoy' ? 'ABA排名同比趋势' : '去年ABA排名环比趋势'}：${label}`);
  }

  async function enhanceAbaTable(table) {
    if (!(table instanceof HTMLTableElement) || !table.classList.contains('aba-table')) return;
    if (table.dataset.abaComparisonColumns === 'pending') return;
    if (table.dataset.abaComparisonColumns === 'ready') {
      const needsRows = [...table.querySelectorAll('tbody tr')].some((row) =>
        !row.querySelector('[data-aba-comparison-cell="yoy"]')
        || !row.querySelector('[data-aba-comparison-cell="previous-year-mom"]'));
      if (!needsRows) return;
      delete table.dataset.abaComparisonColumns;
    }
    table.dataset.abaComparisonColumns = 'pending';
    const api = window.keywordTracker;
    if (!api || typeof api.getData !== 'function') { delete table.dataset.abaComparisonColumns; return; }
    let data;
    try { data = await api.getData(); } catch (error) { delete table.dataset.abaComparisonColumns; return; }
    const model = activeModel(data);
    const rowsByKeyword = new Map((model?.abaRows || []).map((row) => [keywordKey(row.keyword), row]));
    const colgroup = table.querySelector('colgroup');
    if (colgroup) {
      ['yoy', 'previous-year-mom'].forEach((key) => {
        if (colgroup.querySelector(`[data-aba-comparison-col="${key}"]`)) return;
        const col = document.createElement('col');
        col.dataset.abaComparisonCol = key;
        col.style.width = '126px';
        col.style.minWidth = '126px';
        // Keep the two comparison fields beside the fixed keyword columns so
        // they remain easy to find before the twelve month columns.
        colgroup.children[3] ? colgroup.children[3].before(col) : colgroup.appendChild(col);
      });
    }
    const firstHeader = table.querySelector('thead tr.matrix-year-row');
    if (firstHeader) {
      const spacer = firstHeader.querySelector('.aba-meta-spacer');
      [
        ['yoy', 'ABA排名同比趋势'],
        ['previous-year-mom', '去年ABA排名环比趋势'],
      ].forEach(([key, label]) => {
        let head = firstHeader.querySelector(`[data-aba-comparison-head="${key}"]`);
        if (!head) {
          head = document.createElement('th');
          head.dataset.abaComparisonHead = key;
          head.className = 'aba-comparison-head';
          head.rowSpan = 3;
          head.textContent = label;
        }
        if (spacer) spacer.before(head); else firstHeader.appendChild(head);
      });
    }
    table.setAttribute(ABA_TABLE_ATTR, '');
    table.querySelectorAll('tbody tr').forEach((bodyRow) => {
      const keyword = bodyRow.querySelector('.aba-keyword-cell')?.textContent || '';
      const row = rowsByKeyword.get(keywordKey(keyword));
      [['yoy', 'yoy'], ['previous-year-mom', 'mom']].forEach(([key, kind]) => {
        let cell = bodyRow.querySelector(`[data-aba-comparison-cell="${key}"]`);
        if (!cell) {
          cell = document.createElement('td');
          cell.dataset.abaComparisonCell = key;
        }
        const searchCell = [...bodyRow.children].find((candidate, index) =>
          index >= 3 && !candidate.hasAttribute('data-aba-comparison-cell'));
        if (searchCell && searchCell !== cell) searchCell.before(cell); else bodyRow.appendChild(cell);
        applyComparisonCell(cell, row, kind);
      });
    });
    table.dataset.abaComparisonColumns = 'ready';
  }

  function scanAbaTables() {
    document.querySelectorAll('table.aba-table').forEach((table) => { enhanceAbaTable(table); });
  }

  // Matrix dates are rendered chronologically from left to right.  When a
  // matrix tab opens, move its horizontal scroller to the far right so the
  // latest date is immediately visible while the fixed keyword columns remain
  // pinned on the left.  The small retry loop waits for the table's columns to
  // finish layout without repeatedly overriding a user's later manual scroll.
  const matrixScrollJobs = new WeakMap();
  function alignMatrixToLatestDate(table) {
    if (!(table instanceof HTMLTableElement)
      || !table.classList.contains('matrix-table')
      || table.classList.contains('aba-table')
      || table.hasAttribute(MATRIX_LATEST_SCROLL_ATTR)) return;
    const scroll = table.closest('.matrix-scroll');
    if (!(scroll instanceof HTMLElement) || matrixScrollJobs.has(table)) return;
    const job = { attempts: 0 };
    matrixScrollJobs.set(table, job);
    const run = () => {
      if (!table.isConnected) { matrixScrollJobs.delete(table); return; }
      const hasRows = table.querySelector('tbody tr');
      const hasDateHeaders = table.querySelectorAll('thead tr:last-child th').length > 3;
      if (!scroll.clientWidth || !scroll.clientHeight || !hasRows || !hasDateHeaders) {
        if (job.attempts++ < 18) { window.requestAnimationFrame(run); return; }
        matrixScrollJobs.delete(table);
        return;
      }
      const maxScrollLeft = Math.max(0, scroll.scrollWidth - scroll.clientWidth);
      scroll.scrollLeft = maxScrollLeft;
      table.setAttribute(MATRIX_LATEST_SCROLL_ATTR, '');
      matrixScrollJobs.delete(table);
    };
    window.requestAnimationFrame(() => window.requestAnimationFrame(run));
  }

  function scanMatrices() {
    document.querySelectorAll('table.matrix-table.matrix-group-table:not(.aba-table)')
      .forEach((table) => { alignMatrixToLatestDate(table); });
  }

  function scan() {
    addStyles();
    document.querySelectorAll('.settings-delete-item').forEach(installEditor);
    installAbaImport();
    installBatchButton();
    scanAbaTables();
    scanMatrices();
  }

  function installBatchButton() {
    const singleButton = document.querySelector('button.sif-import-button');
    if (!singleButton || document.querySelector(`[${BATCH_ATTR}]`)) return;
    singleButton.title = '按当前产品设置的国家打开 SIF，下载并自动导入';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'primary-button sif-all-import-button';
    button.setAttribute(BATCH_ATTR, '');
    button.textContent = '一键导入全部产品';
    button.title = '按设置里的国家逐个打开 SIF、下载并自动导入所有产品';
    const status = document.createElement('small');
    status.className = 'sif-all-import-status';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    singleButton.insertAdjacentElement('afterend', button);
    button.insertAdjacentElement('afterend', status);

    let unsubscribe = null;
    const setStatus = (message, isError = false) => {
      status.textContent = message || '';
      status.classList.toggle('is-error', isError);
    };
    const bridge = window.keywordTracker;
    if (bridge && typeof bridge.onSifProgress === 'function') {
      unsubscribe = bridge.onSifProgress((event) => {
        if (event?.message && button.disabled) setStatus(String(event.message));
      });
    }
    button.addEventListener('click', async () => {
      if (button.disabled) return;
      const api = window.keywordTracker;
      if (!api || typeof api.startSifBatchImport !== 'function' || typeof api.getData !== 'function') {
        setStatus('当前网页未加载批量自动导入功能，请刷新后重试。', true);
        return;
      }
      button.disabled = true;
      singleButton.disabled = true;
      setStatus('正在读取产品和国家设置……');
      try {
        const data = await api.getData();
        const items = (data.models || []).map((model) => ({
          asin: model.parentAsin,
          countryCode: model.countryCode || model.site || 'CA',
          modelName: model.modelName,
        }));
        if (!items.length) throw new Error('当前没有已登记产品。');
        const response = await api.startSifBatchImport({ items });
        if (!response?.ok) {
          throw new Error(response?.output || '批量自动导入失败。');
        }
        setStatus(response?.output || '全部产品已下载并导入。');
        window.setTimeout(() => window.location.reload(), 900);
      } catch (error) {
        setStatus(error?.message || '批量自动导入失败，请重试。', true);
        button.disabled = false;
        singleButton.disabled = false;
      }
    });
    button.addEventListener('DOMNodeRemoved', () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    }, { once: true });
  }

  addStyles();
  scan();
  window.addEventListener('keyword-tracker-aba-imported', () => {
    document.querySelectorAll('table.aba-table').forEach((table) => {
      delete table.dataset.abaComparisonColumns;
      enhanceAbaTable(table);
    });
  });
  const observer = new MutationObserver(scan);
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();
