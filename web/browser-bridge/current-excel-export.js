(function () {
  'use strict';

  const MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  const BLUE = '1D3D62';
  const TEAL = '23B8CC';
  const PALE = 'EDF6FA';
  const MAX_ROWS = 1048576;
  const MAX_COLUMNS = 16384;

  function value(input) {
    if (input == null || input === '') return null;
    if (typeof input === 'number') return Number.isFinite(input) ? input : null;
    if (typeof input === 'boolean') return input ? '是' : '否';
    return String(input);
  }

  function addSheet(book, name, title, description, headers, widths) {
    const sheet = book.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 3, xSplit: Math.min(4, headers.length) }] });
    sheet.mergeCells(1, 1, 1, headers.length);
    sheet.getCell(1, 1).value = title;
    sheet.getCell(1, 1).font = { name: 'Microsoft YaHei', size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
    sheet.getCell(1, 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${BLUE}` } };
    sheet.getRow(1).height = 30;
    sheet.mergeCells(2, 1, 2, headers.length);
    sheet.getCell(2, 1).value = description;
    sheet.getCell(2, 1).font = { name: 'Microsoft YaHei', size: 10, color: { argb: 'FF52677B' } };
    sheet.getRow(2).height = 25;
    const heading = sheet.getRow(3);
    heading.values = headers;
    heading.height = 23;
    heading.eachCell((cell) => {
      cell.font = { name: 'Microsoft YaHei', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${TEAL}` } };
      cell.alignment = { vertical: 'middle' };
    });
    headers.forEach((_, index) => { sheet.getColumn(index + 1).width = widths[index] || 15; });
    sheet.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: headers.length } };
    sheet.properties.pageSetup = { fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
    return sheet;
  }

  function row(sheet, cells) {
    if (sheet.rowCount >= MAX_ROWS) throw new Error(`${sheet.name} 超过 Excel 行数上限。请分批导出。`);
    sheet.addRow(cells.map(value));
  }

  function modelCells(model) {
    return [model.kind === 'competitor' ? '竞品' : '自有产品', model.modelName, model.parentAsin, model.ownerParentAsin || ''];
  }

  function imageKey(icon) {
    if (icon && typeof icon === 'object' && icon.key === 'custom') return icon.dataUrl;
    return typeof icon === 'string' && icon.startsWith('data:image/') ? icon : String(icon || 'generic-apparel');
  }

  async function pngData(icon) {
    const source = imageKey(icon);
    if (!source.startsWith('data:image/')) {
      const found = window.__KEYWORD_EXPORT_ICONS__?.[source] || window.__KEYWORD_EXPORT_ICONS__?.['generic-apparel'];
      if (!found) throw new Error(`缺少内置图片：${source}`);
      return found;
    }
    if (/^data:image\/png;base64,/i.test(source)) return source;
    const image = new Image();
    image.src = source;
    await image.decode();
    const canvas = document.createElement('canvas');
    const scale = Math.min(1, 800 / Math.max(image.width, image.height));
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/png');
  }

  async function ensureExcelJs() {
    if (window.ExcelJS) return window.ExcelJS;
    if (!window.__keywordExcelJsLoading) {
      window.__keywordExcelJsLoading = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = new URL('./vendor/exceljs.min.js', document.baseURI).href;
        script.onload = () => window.ExcelJS ? resolve(window.ExcelJS) : reject(new Error('Excel 导出组件未初始化。'));
        script.onerror = () => reject(new Error('无法加载 Excel 导出组件。'));
        document.head.appendChild(script);
      }).catch((error) => { window.__keywordExcelJsLoading = null; throw error; });
    }
    return window.__keywordExcelJsLoading;
  }

  function addOverview(book, store, models, now) {
    const sheet = addSheet(book, '导出说明', '当前数据 Excel 导出', '本文件是当前浏览器数据的可读快照；需要迁移软件数据时，请使用工具文件夹的 JSON 备份。', ['项目', '内容'], [28, 95]);
    [
      ['导出时间', now.toLocaleString('zh-CN', { hour12: false })],
      ['数据更新时间', store.updatedAt || ''],
      ['自有产品', models.filter((m) => m.kind !== 'competitor').length],
      ['竞品', models.filter((m) => m.kind === 'competitor').length],
      ['排名历史记录', models.reduce((sum, m) => sum + m.historyRecords.length, 0)],
      ['ABA 月榜导入', Object.keys(store.abaMonthly || {}).length],
      ['图片说明', '产品图片 Sheet 内嵌当前图及历史图；自定义图片与内置图标均随文件保存。'],
      ['排名说明', '排名数字越小越靠前；空白表示没有记录，不能视为 0。'],
      ['矩阵说明', '自然、SP、对比矩阵按快照年份分 Sheet，包含该年全部日期及所有产品/竞品。'],
      ['ABA 说明', 'ABA 月榜仅来自已导入的月度 CSV；原始数据仅导出各产品及竞品所属站点的已有关键词（含历史词和关注词），同站点共有词去重；同比表逐月展示本年和上年数据。'],
      ['数据范围', '导出所有当前保存的产品、竞品、关注词、排名历史、月榜、标注、导入记录和广告分析。'],
    ].forEach((item) => row(sheet, item));
    sheet.getColumn(2).alignment = { wrapText: true, vertical: 'top' };
    sheet.getRow(4).height = 28;
    const section = addSheet(book, 'Sheet目录', '工作表目录', '各 Sheet 的用途及数据范围。', ['Sheet', '用途'], [26, 95]);
    return section;
  }

  function addModelSheets(book, models) {
    const products = addSheet(book, '产品与竞品', '产品与竞品', '竞品归属以“所属自有 ASIN”为准。', ['身份', '产品名称', '父体 ASIN', '所属自有 ASIN', '站点', '最新快照', '关键词', '关注词', '历史记录', '图片历史数'], [13, 30, 18, 19, 14, 15, 12, 12, 14, 14]);
    const dashboard = addSheet(book, '当前看板', '当前看板', '每个产品最新快照的关键词；保留页面中关注词与流量前 1000 名。', ['身份', '产品名称', '父体 ASIN', '所属自有 ASIN', '快照日期', '关注', '关键词', '翻译', '词类型', '流量排名', '流量占比', '自然排名', 'SP 排名', 'ABA 周排名', '周搜索量', '转化率', '关注备注', '状态'], [13, 28, 18, 18, 14, 9, 34, 28, 24, 12, 12, 12, 12, 15, 14, 12, 24, 18]);
    for (const model of models) {
      row(products, [...modelCells(model), model.countryCode || model.site || '', model.latestDate, model.matrixRows.length, model.watches.length, model.historyRecords.length, model.iconHistory?.length || 0]);
      for (const item of model.dashboardRows) {
        row(dashboard, [...modelCells(model), model.latestDate, item.watched ? '★' : '', item.keyword, item.translation, item.keywordType, item.trafficRank, item.trafficShare, item.naturalRank, item.spRank, item.weeklyAbaRank, item.weeklySearchVolume, item.conversionRate, item.watchNote, item.status]);
      }
    }
    [11, 16].forEach((column) => { dashboard.getColumn(column).numFmt = '0.00%'; });
  }

  function addMatrices(book, models) {
    const years = [...new Set(models.flatMap((m) => m.dates.map((d) => d.slice(0, 4))))].sort();
    for (const year of years) {
      const dates = [...new Set(models.flatMap((m) => m.dates.filter((d) => d.startsWith(`${year}-`))))].sort();
      if (!dates.length) continue;
      if (dates.length * 2 + 7 > MAX_COLUMNS) throw new Error(`${year} 年日期列超过 Excel 上限。`);
      const base = ['身份', '产品名称', '父体 ASIN', '所属自有 ASIN', '关注', '关键词', '翻译'];
      const natural = addSheet(book, `自然矩阵${year}`, `${year} 自然排名矩阵`, '空白表示当日未有自然排名；单元格标注另见“单元格标注”。', [...base, ...dates], [...[13, 28, 18, 18, 9, 34, 28], ...dates.map(() => 12)]);
      const sp = addSheet(book, `SP矩阵${year}`, `${year} SP 排名矩阵`, '空白表示当日未有 SP 排名；单元格标注另见“单元格标注”。', [...base, ...dates], [...[13, 28, 18, 18, 9, 34, 28], ...dates.map(() => 12)]);
      const comparisonHeaders = base.concat(dates.flatMap((d) => [`${d} 自然`, `${d} SP`]));
      const comparison = addSheet(book, `对比矩阵${year}`, `${year} 自然 / SP 对比矩阵`, '每个日期的自然排名和 SP 排名并排显示；空白表示未上榜或无记录。', comparisonHeaders, [...[13, 28, 18, 18, 9, 34, 28], ...dates.flatMap(() => [12, 12])]);
      for (const model of models) {
        const positions = new Map(model.dates.map((date, index) => [date, index]));
        const yearDates = dates.filter((date) => positions.has(date));
        if (!yearDates.length) continue;
        for (const item of model.matrixRows) {
          const prefix = [...modelCells(model), item.watched ? '★' : '', item.keyword, item.translation];
          const ns = dates.map((date) => item.naturalValues[positions.get(date)] ?? null);
          const ss = dates.map((date) => item.spValues[positions.get(date)] ?? null);
          if (!item.watched && ns.every((v) => v == null) && ss.every((v) => v == null)) continue;
          row(natural, [...prefix, ...ns]);
          row(sp, [...prefix, ...ss]);
          row(comparison, [...prefix, ...dates.flatMap((_, i) => [ns[i], ss[i]])]);
        }
      }
    }
  }

  function addAbaSheets(book, store, models) {
    const imports = Object.entries(store.abaMonthly || {});
    const keywordKey = (input) => String(input ?? '').trim().toLocaleLowerCase('en-US');
    const countryCode = (input) => {
      const raw = String(input || '').trim();
      const countries = { US: '美国', DE: '德国', UK: '英国', JP: '日本', CA: '加拿大', FR: '法国', ES: '西班牙', IT: '意大利' };
      return Object.hasOwn(countries, raw.toUpperCase()) ? raw.toUpperCase()
        : Object.keys(countries).find((code) => raw.includes(countries[code])) || 'CA';
    };
    const keywordsByCountry = new Map();
    for (const model of models) {
      const code = countryCode(model.countryCode || model.site);
      if (!keywordsByCountry.has(code)) keywordsByCountry.set(code, new Set());
      const keywords = keywordsByCountry.get(code);
      // Matrix rows include historical keywords and enabled watch-only keywords.
      for (const item of model.matrixRows || []) {
        const keyword = keywordKey(item.keyword);
        if (keyword) keywords.add(keyword);
      }
    }
    const detail = addSheet(book, 'ABA月榜原始数据', 'ABA 月榜原始数据（产品相关词）', '仅含各产品及竞品所属站点的已有关键词（含历史词和关注词）；同一站点、月份、关键词一行，不导出全站词库。', ['站点', '月份', '关键词', 'ABA 搜索频率排名', '源文件', '导入时间'], [13, 14, 40, 22, 54, 25]);
    const exported = new Set();
    for (const [entryKey, entry] of imports) {
      const month = entry.month || entry.monthKey || entryKey.match(/\d{4}-\d{2}/)?.[0] || '';
      const code = countryCode(entry.countryCode || entry.site || entryKey.match(/^([A-Za-z]{2})[:-]/)?.[1]);
      const keywords = keywordsByCountry.get(code);
      if (!keywords?.size) continue;
      const append = (keyword, rank) => {
        const normalized = keywordKey(keyword);
        if (!keywords.has(normalized)) return;
        const identity = JSON.stringify([code, month, normalized]);
        if (exported.has(identity)) return;
        exported.add(identity);
        row(detail, [code, month, keyword, rank, entry.fileName || entry.sourceFile, entry.importedAt]);
      };
      if (Array.isArray(entry.rows)) {
        for (const item of entry.rows) append(item.keyword, item.rank ?? item.abaRank ?? item.searchFrequencyRank);
      } else {
        // Avoid allocating an Object.entries array for a full-market monthly CSV.
        for (const keyword in entry.rows || {}) {
          if (Object.hasOwn(entry.rows, keyword)) append(keyword, entry.rows[keyword]);
        }
      }
    }
    const years = [...new Set(imports.map(([key, entry]) => String(entry.month || entry.monthKey || key).match(/\d{4}/)?.[0]).filter(Boolean))].sort();
    for (const year of years) {
      const base = ['身份', '产品名称', '父体 ASIN', '所属自有 ASIN', '关注', '关键词', '翻译'];
      const months = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`);
      const monthly = addSheet(book, `ABA月榜${year}`, `${year} ABA 月榜`, '仅使用已导入的月度 CSV；空白表示该月该词没有记录。', [...base, ...months], [...[13, 28, 18, 18, 9, 34, 28], ...months.map(() => 14)]);
      const yoy = addSheet(book, `ABA同比${year}`, `${year} ABA 同月对比`, '每月并列本年和上年 ABA 排名；数字越小排名越好。', [...base, ...months.flatMap((month) => [`${month} 本年`, `${Number(year) - 1}-${month.slice(5)} 上年`])], [...[13, 28, 18, 18, 9, 34, 28], ...months.flatMap(() => [14, 14])]);
      for (const model of models) {
        const current = model.abaRowsByYear?.[year] || [];
        const previous = model.abaRowsByYear?.[String(Number(year) - 1)] || [];
        for (let index = 0; index < current.length; index += 1) {
          const item = current[index];
          if (!item.watched && item.months.every((rank) => rank == null) && !(previous[index]?.months || []).some((rank) => rank != null)) continue;
          const prefix = [...modelCells(model), item.watched ? '★' : '', item.keyword, item.translation];
          row(monthly, [...prefix, ...item.months]);
          row(yoy, [...prefix, ...item.months.flatMap((rank, i) => [rank, previous[index]?.months?.[i] ?? null])]);
        }
      }
    }
  }

  function addDetailSheets(book, store, models) {
    const watch = addSheet(book, '关注词', '关注词', '含启用和停用的关注词；原顺序及备注保留。', ['身份', '产品名称', '父体 ASIN', '所属自有 ASIN', '关键词', '启用', '顺序', '备注'], [13, 28, 18, 18, 40, 10, 10, 48]);
    for (const model of models) {
      const aliases = new Set([model.parentAsin, ...(model.legacyParentAsins || [])].map((s) => String(s).toUpperCase()));
      for (const item of store.watches || []) {
        const matches = item.parentAsin ? aliases.has(String(item.parentAsin).toUpperCase()) : item.modelName === model.modelName;
        if (matches) row(watch, [...modelCells(model), item.keyword, item.enabled !== false, item.order, item.note]);
      }
    }
    const history = addSheet(book, '排名历史', '每日排名完整历史', '按产品和快照日期保留原始已保存记录；空白不代表 0。', ['身份', '产品名称', '父体 ASIN', '所属自有 ASIN', '快照日期', '关键词', '翻译', '词类型', '流量排名', '流量占比', '自然排名', '自然排名日期', '自然子 ASIN', 'SP 排名', 'SP 日期', 'SP 广告活动', 'SP 子 ASIN', 'ABA 周排名', '周搜索量', '转化率', '历史关注', '状态', '源文件', '导入时间'], [13, 28, 18, 18, 14, 38, 28, 25, 14, 14, 14, 16, 18, 13, 16, 30, 18, 15, 15, 13, 12, 18, 50, 25]);
    for (const model of models) for (const item of model.historyRecords) row(history, [...modelCells(model), item.snapshotDate, item.keyword, item.translation, item.keywordType, item.trafficRank, item.trafficShare, item.naturalRank, item.naturalRankDate, item.naturalChildAsin, item.spRank, item.spRankDate, item.spCampaign, item.spChildAsin, item.weeklyAbaRank, item.weeklySearchVolume, item.conversionRate, item.historyWatched, item.status, item.sourceFile, item.importTime]);
    [10, 20].forEach((col) => { history.getColumn(col).numFmt = '0.00%'; });
    const annotations = addSheet(book, '单元格标注', '单元格标注', '自然矩阵和 SP 矩阵的手工标注。', ['产品名称', '父体 ASIN', '关键词', '日期', '指标', '标注内容'], [28, 18, 40, 15, 13, 70]);
    for (const item of store.annotations || []) row(annotations, [item.modelName, item.parentAsin, item.keyword, item.date, item.metric === 'natural' ? '自然排名' : item.metric === 'sp' ? 'SP 排名' : item.metric, item.text]);
    const imports = addSheet(book, '导入记录', '导入记录', '每日 SIF 文件和 ABA 月榜文件的导入信息。', ['类型', '文件标识', '产品 ASIN / 站点', '快照日期 / 月份', '导入时间', '记录数', '指纹'], [16, 55, 20, 20, 25, 14, 42]);
    for (const [file, item] of Object.entries(store.importedFiles || {})) row(imports, ['每日 SIF', file, item.parentAsin, item.snapshotDate, item.importedAt, null, item.fingerprint]);
    for (const [key, item] of Object.entries(store.abaMonthly || {})) row(imports, ['ABA 月榜', item.fileName || key, item.countryCode || item.site, item.month || item.monthKey, item.importedAt, item.rowCount, item.fingerprint]);
    const reviews = addSheet(book, '广告分析', '广告分析报告', '当前浏览器中保存的分析批次与词条。', ['批次 ID', '产品 ASIN', '批次日期', '关键词', '建议', '依据 / 说明', '词条 ID'], [35, 18, 20, 38, 38, 80, 35]);
    for (const report of store.adReviews?.reports || []) {
      if (!(report.items || []).length) row(reviews, [report.runId, report.parentAsin, report.createdAt, '', '', '', '']);
      for (const item of report.items || []) row(reviews, [report.runId, item.parentAsin || report.parentAsin, report.createdAt, item.keyword, item.action || item.recommendation, item.reason || item.evidence || item.summary, item.itemId]);
    }
    const decisions = addSheet(book, '广告分析采纳', '广告分析采纳记录', '保存每个分析词条的采纳状态。', ['批次 ID', '词条 ID', '已采纳', '更新时间'], [36, 36, 13, 25]);
    for (const item of store.adReviews?.decisions || []) row(decisions, [item.runId, item.itemId, item.accepted, item.updatedAt]);
  }

  async function addImages(book, models) {
    const sheet = addSheet(book, '产品图片', '产品图片', '当前图与历史图均嵌入文件；自定义图转为 PNG 以便 Excel 显示。', ['身份', '产品名称', '父体 ASIN', '所属自有 ASIN', '图片状态', '替换时间', '图片', '图片名称 / 图标键'], [13, 28, 18, 18, 16, 25, 20, 45]);
    const cache = new Map();
    for (const model of models) {
      const entries = [{ iconKey: model.iconKey, current: true }, ...(model.iconHistory || [])];
      for (const entry of entries) {
        const icon = entry.iconKey;
        const label = typeof icon === 'object' ? icon.label || '自定义图片' : String(icon || 'generic-apparel');
        const cells = [...modelCells(model), entry.current ? '当前图片' : '历史图片', entry.replacedAt || '', '', label];
        row(sheet, cells);
        const rowIndex = sheet.rowCount;
        sheet.getRow(rowIndex).height = 78;
        const identity = imageKey(icon);
        try {
          let id = cache.get(identity);
          if (id == null) {
            id = book.addImage({ base64: await pngData(icon), extension: 'png' });
            cache.set(identity, id);
          }
          sheet.addImage(id, { tl: { col: 6.1, row: rowIndex - 0.9 }, ext: { width: 92, height: 92 }, editAs: 'oneCell' });
        } catch (error) {
          sheet.getCell(rowIndex, 7).value = `图片无法嵌入：${error.message}`;
        }
      }
    }
  }

  async function build(store, models, now = new Date()) {
    const ExcelJS = await ensureExcelJs();
    const book = new ExcelJS.Workbook();
    book.creator = 'Amazon关键词每日跟进';
    book.created = now;
    book.subject = '当前浏览器数据导出';
    const directory = addOverview(book, store, models, now);
    addModelSheets(book, models);
    addMatrices(book, models);
    addAbaSheets(book, store, models);
    addDetailSheets(book, store, models);
    await addImages(book, models);
    const descriptions = {
      导出说明: '导出时间、数据范围与各项说明', Sheet目录: '工作簿导航', 产品与竞品: '产品身份、归属与数量概览', 产品图片: '当前与历史图片，图像嵌入', 当前看板: '最新快照关键词', ABA月榜原始数据: '仅产品及竞品相关词的月度 CSV 原始排名', 关注词: '全部关注词及备注', 排名历史: '每日排名完整记录', 单元格标注: '自然与 SP 标注', 导入记录: '每日及 ABA 文件导入信息', 广告分析: '广告分析批次与词条', 广告分析采纳: '分析采纳状态',
    };
    for (const sheet of book.worksheets) row(directory, [sheet.name, descriptions[sheet.name] || (sheet.name.includes('同比') ? 'ABA 本年 / 上年同月对比' : sheet.name.includes('矩阵') ? '按年展开的排名矩阵' : 'ABA 月度矩阵')]);
    const sparks = improveWorkbook(book);
    const buffer = await addSparklines(await book.xlsx.writeBuffer(), sparks);
    return { buffer, workbook: book };
  }

  function download(buffer, date = new Date()) {
    const filename = `Amazon关键词每日跟进-当前数据_${date.toISOString().slice(0, 10)}.xlsx`;
    const url = URL.createObjectURL(new Blob([buffer], { type: MIME }));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    return filename;
  }

  // Operates on the exported snapshot only. Ranking/import algorithms are unchanged.
  function improveWorkbook(book) {
    const ink = 'FF243746';
    const up = { fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFCE4E6' } }, font: { color: { argb: 'FFB43C50' } } };
    const down = { fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0F1E8' } }, font: { color: { argb: 'FF267251' } } };
    const col = (n) => { let s = ''; for (; n; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + (n - 1) % 26) + s; return s; };
    const ref = (s, a) => `'${s.name.replace(/'/g, "''")}'!${a}`;
    const link = (s, a, text) => ({ text, hyperlink: `#${ref(s, a)}` });
    const numeric = (v) => typeof v === 'number' && Number.isFinite(v);
    const matrices = book.worksheets.filter(s => /^(自然矩阵|SP矩阵|对比矩阵|ABA月榜|ABA同比)\d{4}$/.test(s.name));
    const originalDates = new Map(matrices.map(s => [s.id, s.getRow(3).values.slice()]));
    for (const sheet of book.worksheets) {
      const matrix = matrices.includes(sheet);
      const last = sheet.columnCount;
      const keyword = sheet.getRow(3).values.findIndex(v => v === '关键词');
      sheet.views = [{ state: 'frozen', xSplit: matrix ? 7 : Math.max(0, keyword), ySplit: 3, showGridLines: false, zoomScale: 90 }];
      sheet.properties.defaultRowHeight = 19;
      sheet.autoFilter = { from: { row: 3, column: 1 }, to: { row: Math.max(3, sheet.rowCount), column: last } };
      sheet.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: '1:3' };
      // Column defaults avoid allocating styles on millions of history cells.
      for (let c = 1; c <= last && sheet.rowCount < 30000; c++) {
        sheet.getColumn(c).font = { name: 'Microsoft YaHei', size: 10, color: { argb: ink } };
      }
      sheet.getRow(1).height = 30;
      sheet.getCell('A1').font = { name: 'Microsoft YaHei', size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
      sheet.getCell('A2').font = { name: 'Microsoft YaHei', size: 10, color: { argb: 'FF52677B' } };
      sheet.getRow(3).height = 30;
      sheet.getRow(3).eachCell(cell => {
        cell.style = { ...cell.style, font: { name: 'Microsoft YaHei', size: 10, bold: true, color: { argb: 'FFFFFFFF' } }, fill: { type:'pattern', pattern:'solid', fgColor:{argb:'FF287E9C'} } };
        cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      });
      const watch = sheet.getRow(3).values.findIndex(v => v === '关注');
      if (watch > 0 && sheet.rowCount > 3) sheet.addConditionalFormatting({ ref: `A4:${col(matrix ? 7 : keyword || last)}${sheet.rowCount}`, rules: [{ type: 'expression', formulae: [`$${col(watch)}4="★"`], style: { font: { bold: true, color: { argb: 'FF8A641D' } }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF5DA' } } } }] });
      if (!matrix) continue;
      sheet.properties.tabColor = { argb: sheet.name.startsWith('ABA') ? 'FF8974B7' : 'FF287E9C' };
      // Identity fields remain available via Excel's outline controls.
      for (const c of [1, 3, 4]) { sheet.getColumn(c).outlineLevel = 1; sheet.getColumn(c).hidden = true; }
      sheet.getColumn(2).width = 24; sheet.getColumn(5).width = 6; sheet.getColumn(6).width = 30; sheet.getColumn(7).width = 18;
      const paired = /^(对比|ABA同比)/.test(sheet.name);
      const monthly = sheet.name.startsWith('ABA');
      const dates = [];
      for (let c = 8; c <= last; c++) dates.push(String(sheet.getCell(3, c).value || ''));
      const newestMonth = dates.map(d => d.slice(0, 7)).sort().at(-1);
      sheet.properties.outlineProperties = { summaryRight: true };
      for (let c = 8; c <= last; c++) {
        const header = dates[c - 8];
        const column = sheet.getColumn(c);
        column.width = monthly ? 11 : paired ? 9 : 10;
        column.numFmt = '#,##0';
        sheet.getCell(3, c).value = header.replace(/^(\d{4})-(\d{2})-(\d{2})(.*)$/, '$2/$3$4').replace(' 自然', '\n自然').replace(' SP', '\nSP').replace(' 本年', '\n本年').replace(' 上年', '\n上年');
        if (paired) sheet.getCell(3, c).style = { ...sheet.getCell(3,c).style, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: c % 2 ? 'FF657CB0' : 'FF287E9C' } } };
        if (!monthly && header.slice(0, 7) !== newestMonth) {
          // Leave each month's final date visible as the group's summary boundary.
          const next = dates[c - 8 + (paired ? 2 : 1)];
          if (next && next.slice(0, 7) === header.slice(0, 7)) { column.outlineLevel = 1; column.hidden = true; }
        }
        if (sheet.rowCount <= 3) continue;
        let prev = c - (paired ? 2 : 1);
        if (sheet.name.startsWith('ABA同比')) { if (c % 2) continue; prev = c + 1; }
        if (prev < 8 || prev > last) continue;
        const currentCell = `${col(c)}4`, previousCell = `${col(prev)}4`;
        sheet.addConditionalFormatting({ ref: `${col(c)}4:${col(c)}${sheet.rowCount}`, rules: [
          { type: 'expression', formulae: [`AND(ISNUMBER(${currentCell}),ISNUMBER(${previousCell}),${currentCell}<${previousCell})`], style: up },
          { type: 'expression', formulae: [`AND(ISNUMBER(${currentCell}),ISNUMBER(${previousCell}),${currentCell}>${previousCell})`], style: down },
        ] });
      }
      sheet.getCell('A2').value = sheet.name.startsWith('ABA同比') ? '红底：本年排名改善；绿底：本年排名下降。仅比较两年都有数值的同月。' : '红底：较前一列同指标排名改善；绿底：下降。空白不按 0 比较。旧月份可通过上方 + 展开。';
    }

    const dashboard = book.getWorksheet('当前看板');
    const products = book.getWorksheet('产品与竞品');
    const overview = addSheet(book, '产品总览', '产品总览', '各产品最新快照分别统计；空白表示无记录。点击产品名称查看当前看板。', ['身份', '产品名称', '最新快照', '关键词数', '关注词数', '自然上榜', 'SP上榜', '自然前10', '自然前50', '产品图片'], [12, 30, 15, 13, 13, 13, 13, 13, 13, 17]);
    const groups = new Map();
    if (dashboard) for (let r = 4; r <= dashboard.rowCount; r++) {
      const asin = dashboard.getCell(r, 3).value;
      if (!groups.has(asin)) groups.set(asin, { first: r, last: r, count: 0, watch: 0, natural: 0, sp: 0, top10: 0, top50: 0 });
      const g = groups.get(asin); g.last = r; g.count++;
      if (dashboard.getCell(r, 6).value === '★') g.watch++;
      const n = dashboard.getCell(r, 12).value, s = dashboard.getCell(r, 13).value;
      if (numeric(n)) { g.natural++; if (n <= 10) g.top10++; if (n <= 50) g.top50++; }
      if (numeric(s)) g.sp++;
    }
    const pictures = book.getWorksheet('产品图片');
    if (products) for (let r = 4; r <= products.rowCount; r++) {
      const asin = products.getCell(r, 3).value, g = groups.get(asin);
      row(overview, [products.getCell(r, 1).value, products.getCell(r, 2).value, products.getCell(r, 6).value, g?.count || 0, g?.watch || 0, g?.natural || 0, g?.sp || 0, g?.top10 || 0, g?.top50 || 0]);
      const out = overview.rowCount;
      if (g) overview.getCell(out, 2).value = link(dashboard, `G${g.first}`, String(products.getCell(r, 2).value));
      if (pictures) for (let p = 4; p <= pictures.rowCount; p++) {
        if (pictures.getCell(p, 3).value !== asin || pictures.getCell(p, 5).value !== '当前图片') continue;
        const image = pictures.getImages().find(img => Math.floor(img.range.tl.nativeRow) === p - 1);
        if (image) { overview.getRow(out).height = 55; overview.addImage(image.imageId, { tl: { col: 9.2, row: out - 0.9 }, ext: { width: 62, height: 62 } }); }
        break;
      }
    }
    overview.properties.tabColor = { argb: 'FF1D3D62' };
    if (overview.rowCount > 3) for (const c of ['F','G','H','I']) overview.addConditionalFormatting({ ref: `${c}4:${c}${overview.rowCount}`, rules: [{ type:'dataBar', cfvo:[{type:'num',value:0},{type:'max'}], color:{argb:'FF8FC5D8'}, showValue:true }] });

    const trends = addSheet(book, '关注词趋势', '关注词趋势', '折线越高排名越好，空白断开，各线独立刻度。自然/SP最近30个日期；变化对比本产品前一次快照，正数为改善。', ['产品名称', '关键词', '最新快照', '自然排名', '自然变化', '自然趋势', 'SP排名', 'SP变化', 'SP趋势', 'ABA本年', 'ABA去年'], [27, 32, 15, 12, 12, 25, 12, 12, 25, 25, 25]);
    const sparks = [];
    const naturalSheets = matrices.filter(s => s.name.startsWith('自然矩阵')).sort((a,b) => b.name.localeCompare(a.name));
    const latestYear = Math.max(0, ...matrices.filter(s => /^ABA月榜/.test(s.name)).map(s => Number(s.name.slice(-4))));
    const abaMaps = new Map();
    for (const year of [latestYear, latestYear - 1]) {
      const sheet = book.getWorksheet(`ABA月榜${year}`), map = new Map();
      if (sheet) for (let r = 4; r <= sheet.rowCount; r++) map.set(JSON.stringify([sheet.getCell(r, 3).value, sheet.getCell(r, 6).value]), r);
      abaMaps.set(year, { sheet, map });
    }
    const seen = new Set();
    const snapshots = new Map();
    const history = book.getWorksheet('排名历史');
    if (history) for (let r = 4; r <= history.rowCount; r++) {
      const asin = history.getCell(r,3).value;
      if (!snapshots.has(asin)) snapshots.set(asin,new Set());
      snapshots.get(asin).add(history.getCell(r,5).value);
    }
    for (const ns of naturalSheets) {
      const columnCount = ns.columnCount;
      const sp = book.getWorksheet(ns.name.replace('自然', 'SP'));
      if (!sp) continue;
      // Sibling matrices are generated in the same order; key maps protect imported copies too.
      const spRows = new Map();
      for (let r = 4; r <= sp.rowCount; r++) spRows.set(JSON.stringify([sp.getCell(r, 3).value, sp.getCell(r, 6).value]), r);
      const lastByProduct = new Map();
      for (let r = 4; r <= ns.rowCount; r++) {
        const asin = ns.getCell(r, 3).value;
        if (!lastByProduct.has(asin)) lastByProduct.set(asin, new Set());
        const sr = spRows.get(JSON.stringify([asin, ns.getCell(r, 6).value]));
        for (let c = 8; c <= columnCount; c++) if (numeric(ns.getCell(r,c).value) || (sr && numeric(sp.getCell(sr,c).value))) lastByProduct.get(asin).add(c);
      }
      for (let r = 4; r <= ns.rowCount; r++) {
        if (ns.getCell(r, 5).value !== '★') continue;
        const asin = ns.getCell(r, 3).value, keyword = ns.getCell(r, 6).value, id = JSON.stringify([asin, keyword]);
        if (seen.has(id)) continue; seen.add(id);
        const sr = spRows.get(id);
        const headers = originalDates.get(ns.id);
        const dates = snapshots.has(asin) ? headers.map((d,c) => c >= 8 && snapshots.get(asin).has(d) ? c : null).filter(c => c != null) : [...(lastByProduct.get(asin) || [])].sort((a,b) => a-b);
        const last = dates.at(-1), previous = dates.at(-2);
        const n = last ? ns.getCell(r,last).value : null, s = last && sr ? sp.getCell(sr,last).value : null;
        const pn = previous ? ns.getCell(r,previous).value : null, ps = previous && sr ? sp.getCell(sr,previous).value : null;
        const date = last ? headers[last] : '';
        row(trends, [ns.getCell(r,2).value, keyword, date, n, numeric(n) && numeric(pn) ? pn-n : null, null, s, numeric(s) && numeric(ps) ? ps-s : null]);
        const t = trends.rowCount;
        trends.getCell(t, 2).value = link(ns, `F${r}`, String(keyword));
        if (last) {
          const start = Math.max(8, last - 29);
          sparks.push({ sheetId: trends.id, target: `F${t}`, source: ref(ns, `${col(start)}${r}:${col(last)}${r}`), color: '287E9C' });
          if (sr) sparks.push({ sheetId: trends.id, target: `I${t}`, source: ref(sp, `${col(start)}${sr}:${col(last)}${sr}`), color: '657CB0' });
        }
        for (const [year, target, color] of [[latestYear,'J','8974B7'],[latestYear-1,'K','A6AEBB']]) {
          const entry = abaMaps.get(year), ar = entry?.map.get(id);
          if (ar) sparks.push({ sheetId: trends.id, target: `${target}${t}`, source: ref(entry.sheet, `H${ar}:S${ar}`), color });
        }
      }
    }
    trends.getCell('J3').value = `ABA ${latestYear || '本年'}`;
    trends.getCell('K3').value = `ABA ${latestYear ? latestYear-1 : '去年'}`;
    trends.properties.tabColor = { argb: 'FFB08A37' };
    for (const c of [5, 8]) {
      trends.getColumn(c).numFmt = '+0;-0;"持平"';
      if (trends.rowCount > 3) trends.addConditionalFormatting({ ref: `${col(c)}4:${col(c)}${trends.rowCount}`, rules: [{ type: 'cellIs', operator: 'greaterThan', formulae: [0], style: up }, { type: 'cellIs', operator: 'lessThan', formulae: [0], style: down }] });
    }
    for (const sheet of [overview, trends]) {
      sheet.views = [{ state: 'frozen', xSplit: 2, ySplit: 3, showGridLines: false, zoomScale: 90 }];
      sheet.autoFilter = `A3:${col(sheet.columnCount)}${Math.max(3,sheet.rowCount)}`;
      sheet.getRow(3).height = 28;
      for (let r = 4; r <= sheet.rowCount; r++) {
        if (sheet === trends) sheet.getRow(r).height = 30;
        sheet.getRow(r).eachCell(cell => { cell.font = { name: 'Microsoft YaHei', size: 10, color: { argb: ink } }; cell.alignment = { vertical: 'middle' }; if (r % 2 === 0) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F6FA' } }; });
        sheet.getCell(r,2).font = { name: 'Microsoft YaHei', size: 10, color: { argb: 'FF287E9C' }, underline: true };
      }
    }
    const order = [overview, trends, book.getWorksheet('当前看板'), ...matrices, book.getWorksheet('产品与竞品'), book.getWorksheet('产品图片')].filter(Boolean);
    const all = [...order, ...book.worksheets.filter(s => !order.includes(s))];
    all.forEach((s,i) => { s.orderNo = i; });
    book.views = [{ activeTab: 0, firstSheet: 0 }];
    const directory = book.getWorksheet('Sheet目录');
    if (directory) {
      if (directory.rowCount > 3) directory.spliceRows(4, directory.rowCount - 3);
      for (const sheet of all) {
        row(directory, [sheet.name, sheet.getCell('A1').value]);
        directory.getCell(directory.rowCount,1).value = link(sheet, 'A1', sheet.name);
      }
    }
    // Native sparklines have no reversed vertical axis. Formula-linked negative
    // ranks make better (smaller) rankings appear higher while retaining gaps.
    let helperRow = 4;
    const helpers = addSheet(book, '趋势计算', '趋势计算', '迷你折线使用负排名，便于向上表示改善；空白保留。', ['来源', '说明'], [50, 35]);
    helpers.state = 'hidden';
    for (const spark of sparks) {
      const match = spark.source.match(/^'((?:[^']|'')+)'!([A-Z]+)(\d+):([A-Z]+)(\d+)$/);
      if (!match) continue;
      const source = book.getWorksheet(match[1].replace(/''/g, "'"));
      const from = source.getCell(`${match[2]}${match[3]}`).col, to = source.getCell(`${match[4]}${match[5]}`).col;
      helpers.getCell(helperRow,1).value = spark.source;
      for (let c = from; c <= to; c++) {
        const address = `${col(c)}${match[3]}`, v = source.getCell(address).value;
        const f = ref(source,address);
        if (numeric(v)) helpers.getCell(helperRow, c-from+2).value = { formula: `IF(ISNUMBER(${f}),-${f},"")`, result: -v };
      }
      spark.source = ref(helpers, `B${helperRow}:${col(to-from+2)}${helperRow}`);
      helperRow++;
    }
    return sparks;
  }

  async function addSparklines(buffer, sparks) {
    if (!sparks.length) return buffer;
    if (!window.JSZip) await new Promise((resolve,reject) => {
      const script = document.createElement('script'); script.src = new URL('./vendor/jszip.min.js', document.baseURI).href;
      script.onload = resolve; script.onerror = () => reject(new Error('无法加载趋势导出组件。')); document.head.appendChild(script);
    });
    const zip = await window.JSZip.loadAsync(buffer);
    const esc = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    for (const id of new Set(sparks.map(s => s.sheetId))) {
      const file = `xl/worksheets/sheet${id}.xml`;
      let xml = await zip.file(file).async('string');
      const groups = sparks.filter(s => s.sheetId === id).map(s => `<x14:sparklineGroup type="line" lineWeight="1.5" displayEmptyCellsAs="gap" markers="0" high="0" low="0" first="0" last="1" negative="0" displayXAxis="0" displayHidden="1" minAxisType="individual" maxAxisType="individual" rightToLeft="0"><x14:colorSeries rgb="FF${s.color}"/><x14:colorNegative rgb="FFB43C50"/><x14:colorAxis rgb="FF52677B"/><x14:colorMarkers rgb="FF${s.color}"/><x14:colorFirst rgb="FF${s.color}"/><x14:colorLast rgb="FF${s.color}"/><x14:colorHigh rgb="FF${s.color}"/><x14:colorLow rgb="FF${s.color}"/><x14:sparklines><x14:sparkline><xm:f>${esc(s.source)}</xm:f><xm:sqref>${s.target}</xm:sqref></x14:sparkline></x14:sparklines></x14:sparklineGroup>`).join('');
      // Reversed rank axis is achieved using negative rank helper values below.
      xml = xml.replace('</worksheet>', `<extLst><ext uri="{05C60535-1F16-4fd2-B633-F4F36F0B64E0}" xmlns:x14="http://schemas.microsoft.com/office/spreadsheetml/2009/9/main"><x14:sparklineGroups xmlns:xm="http://schemas.microsoft.com/office/excel/2006/main">${groups}</x14:sparklineGroups></ext></extLst></worksheet>`);
      zip.file(file, xml);
    }
    return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  }

  window.KeywordCurrentExcelExport = { build, download, improveWorkbook, addSparklines };
})();
