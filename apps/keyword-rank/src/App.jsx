import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import Sidebar from './components/Sidebar.jsx';
import Header from './components/Header.jsx';
import SummaryBand from './components/SummaryBand.jsx';
import MatrixView from './components/MatrixView.jsx';
import ComparisonMatrixView from './components/ComparisonMatrixView.jsx';
import KeywordTrendView from './components/KeywordTrendView.jsx';
import DashboardView from './components/DashboardView.jsx';
import DashboardComparisonOverview from './components/DashboardComparisonOverview.jsx';
import WatchDrawer from './components/WatchDrawer.jsx';
import ABAView from './components/ABAView.jsx';
import HistoryView from './components/HistoryView.jsx';
import AddModelModal from './components/AddModelModal.jsx';
import IconPickerModal from './components/IconPickerModal.jsx';
import SettingsModal from './components/SettingsModal.jsx';
import { EMPTY_FILTER, filterRows } from './components/FilterCascade.jsx';
import { BusyOverlay, Toast } from './components/Feedback.jsx';
import WindowTitlebar from './components/WindowTitlebar.jsx';
import { api } from './lib/api.js';
import { buildDateView } from './lib/format.js';
import { resetAllColumnWidths } from './lib/columnWidths.jsx';

const KNOWN_TABS = new Set(['dashboard', 'natural', 'sp', 'comparison', 'aba', 'history']);

function initialViewFilters() {
  return {
    dashboard: { ...EMPTY_FILTER },
    natural: { ...EMPTY_FILTER },
    sp: { ...EMPTY_FILTER },
    comparison: { ...EMPTY_FILTER },
    aba: { ...EMPTY_FILTER },
  };
}

function isoTime(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : null;
}

function nearestDate(target, dates) {
  const validDates = [...new Set((dates || []).filter((date) => isoTime(date) != null))].sort();
  if (!validDates.length) return '';
  const targetTime = isoTime(target);
  if (targetTime == null) return validDates.at(-1);
  return validDates.reduce((closest, candidate) => {
    const distance = Math.abs(isoTime(candidate) - targetTime);
    const closestDistance = Math.abs(isoTime(closest) - targetTime);
    return distance < closestDistance || (distance === closestDistance && candidate > closest) ? candidate : closest;
  }, validDates[0]);
}

function supportsTab(targetModel, tab) {
  // Current model-shaped records support all views.  Respect an
  // explicitly supplied capability list for future/imported model types so a
  // product switch can fall back only when the target truly lacks a view.
  return !Array.isArray(targetModel?.supportedTabs) || targetModel.supportedTabs.includes(tab);
}

// The standalone web enhancement asks the browser bridge for data when a
// comparison bubble opens.  Rebuilding every model from all workbook history
// on every hover blocks the main thread, so keep the snapshot already loaded
// by React available to that bridge.  The cache is limited to the web bridge
// (the Electron context bridge is intentionally left untouched) and is
// invalidated by enhancement mutations before their normal reload/update path.
function syncWebBridgeData(data) {
  if (typeof window === 'undefined' || !data || !window.__KEYWORD_TRACKER_SEED__) return;
  const bridge = window.keywordTracker;
  if (!bridge || typeof bridge.getData !== 'function') return;
  const cacheKey = '__keywordRankGetDataCache';
  let cache = bridge[cacheKey];
  if (!cache) {
    const original = bridge.getData.bind(bridge);
    cache = { value: data, pending: null, original };
    try {
      Object.defineProperty(bridge, cacheKey, { value: cache, configurable: true });
      bridge.getData = (...args) => {
        if (cache.value) return Promise.resolve(cache.value);
        if (!cache.pending) {
          cache.pending = Promise.resolve(cache.original(...args))
            .then((next) => { cache.value = next; return next; })
            .finally(() => { cache.pending = null; });
        }
        return cache.pending;
      };
      const invalidate = () => { cache.value = null; };
      window.addEventListener('keyword-tracker-competitor-updated', invalidate);
      window.addEventListener('keyword-tracker-aba-imported', invalidate);
      cache.cleanup = () => {
        window.removeEventListener('keyword-tracker-competitor-updated', invalidate);
        window.removeEventListener('keyword-tracker-aba-imported', invalidate);
      };
    } catch {
      return;
    }
  }
  cache.value = data;
}

export default function App({ onStartupSettled }) {
  const [data, setData] = useState(null);
  const annotationQueue = useRef(Promise.resolve());
  const [pendingAnnotations, setPendingAnnotations] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);
  const [activeTab, setActiveTab] = useState('natural');
  const [comparisonFocus, setComparisonFocus] = useState(null);
  const [trendRow, setTrendRow] = useState(null);
  const [comparisonScroll, setComparisonScroll] = useState(null);
  const [selectedDate, setSelectedDate] = useState('');
  const [viewFilters, setViewFilters] = useState(() => initialViewFilters());
  const [watchOpen, setWatchOpen] = useState(false);
  const [addModelOpen, setAddModelOpen] = useState(false);
  const [iconModel, setIconModel] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [webTool, setWebTool] = useState(null);
  const closeWebTools = () => { setWebTool(null); setSettingsOpen(false); window.dispatchEvent(new Event('close-web-data-manager')); };
  const toggleWebTool = (key) => {
    closeWebTools();
    if (webTool === key) return;
    setWebTool(key);
    if (key === 'settings') setSettingsOpen(true);
    if (key === 'files') api.openToolFolder();
  };
  useEffect(() => {
    const close = () => { setWebTool(null); setSettingsOpen(false); };
    const key = (event) => { if (event.key === 'Escape') closeWebTools(); };
    window.addEventListener('web-data-manager-closed', close);
    window.addEventListener('keydown', key);
    return () => { window.removeEventListener('web-data-manager-closed', close); window.removeEventListener('keydown', key); };
  }, []);
  const [busyLabel, setBusyLabel] = useState('正在读取关键词数据…');
  const [toast, setToast] = useState(null);

  const load = async () => {
    setBusyLabel('正在读取关键词数据…');
    try {
      const result = await api.getData();
      setData(result);
      onStartupSettled?.('ready');
      setActiveIndex((index) => Math.min(index, Math.max(0, result.models.length - 1)));
    } catch (error) {
      onStartupSettled?.('error');
      setToast({ type: 'error', title: '读取失败', message: error.message });
    } finally {
      setBusyLabel('');
    }
  };

  useEffect(() => { load(); }, []);

  useEffect(() => api.onSifProgress?.((progress) => {
    if (progress?.message) setBusyLabel(progress.message);
  }), []);

  const model = data?.models?.[activeIndex];
  useEffect(() => {
    if (!model) return;
    setSelectedDate((currentDate) => {
      const dates = model.dates || [];
      return dates.includes(currentDate) ? currentDate : nearestDate(currentDate, dates);
    });
  }, [model?.parentAsin, model?.dates, model?.latestDate]);

  // ABA and history render their own model projections.  Do not rebuild the
  // date-scoped dashboard projection while those tabs are active; on a large
  // history this otherwise turns every product/tab click into a full scan of
  // all snapshot records even though the result is not consumed.
  const needsDateView = activeTab !== 'aba' && activeTab !== 'history';
  const dateView = useMemo(() => {
    if (!needsDateView) return { rows: model.dashboardRows || [], metrics: model.metrics || {} };
    return buildDateView(model, selectedDate);
  }, [model?.historyRecords, model?.watches, model?.dashboardRows, model?.metrics, selectedDate, needsDateView]);

  const dashboardRows = useMemo(() => filterRows(dateView.rows, viewFilters.dashboard), [dateView.rows, viewFilters.dashboard]);
  const naturalRows = useMemo(() => filterRows(model?.matrixRows, viewFilters.natural), [model?.matrixRows, viewFilters.natural]);
  const spRows = useMemo(() => filterRows(model?.matrixRows, viewFilters.sp), [model?.matrixRows, viewFilters.sp]);
  const abaYear = Number(viewFilters.aba.abaYear || model?.selectedYear);
  const abaModel = useMemo(() => model ? { ...model, selectedYear: abaYear, abaRows: model.abaRowsByYear?.[abaYear] || model.abaRows } : null, [model, abaYear]);
  const abaRows = useMemo(() => filterRows(abaModel?.abaRows, viewFilters.aba), [abaModel, viewFilters.aba]);
  const comparisonRows = useMemo(() => filterRows(model?.matrixRows, viewFilters.comparison), [model?.matrixRows, viewFilters.comparison]);
  const filteredMetrics = useMemo(() => ({
    ...dateView.metrics,
    keywordCount: dashboardRows.length,
    watchedCount: dashboardRows.filter((row) => row.watched).length,
    naturalUp: dashboardRows.filter((row) => row.naturalDirection === 'up').length,
    spUp: dashboardRows.filter((row) => row.spDirection === 'up').length,
    unrankedNatural: dashboardRows.filter((row) => row.naturalRank == null).length,
  }), [dateView.metrics, dashboardRows]);
  const activeViewCount = activeTab === 'dashboard' ? dashboardRows.length
    : activeTab === 'natural' ? naturalRows.length
      : activeTab === 'sp' ? spRows.length
        : activeTab === 'aba' ? abaRows.length
          : activeTab === 'comparison' ? comparisonRows.length
            : dateView.rows.length;

  const updateViewFilter = (view, next) => {
    setViewFilters((current) => {
      const updated = { ...current, [view]: { ...EMPTY_FILTER, ...(next || {}) } };
      if (['natural', 'sp', 'comparison'].includes(view)) {
        for (const target of ['natural', 'sp', 'comparison']) {
          updated[target] = { ...updated[target], keywords: next.keywords || [], dateMode: next.dateMode || 'all', dateStart: next.dateStart || '', dateEnd: next.dateEnd || '', matrixYear: next.matrixYear, matrixMonths: next.matrixMonths };
        }
      }
      return updated;
    });
  };

  useEffect(() => {
    // Keyword selections belong to the active product.  Clear stale choices
    // when switching products so a keyword from the previous model cannot
    // silently make the new view appear empty.
    if (!model?.parentAsin) return;
    setViewFilters(initialViewFilters());
    setComparisonFocus(null);
    setTrendRow(null);
    setComparisonScroll(null);
  }, [model?.parentAsin]);

  useEffect(() => { syncWebBridgeData(data); if (data) window.dispatchEvent(new Event('keyword-tracker-data-updated')); }, [data]);

  const applyResult = (result, title) => {
    setData(result.data);
    setActiveIndex((index) => Math.min(index, Math.max(0, (result.data?.models?.length || 0) - 1)));
    setToast({ type: 'success', title, message: result.output?.split(/\r?\n/).filter(Boolean).at(-1) || '数据已保存并重新读取。' });
  };

  const runAction = async (label, action, successTitle) => {
    setBusyLabel(label);
    try {
      const result = await action();
      applyResult(result, successTitle);
      return true;
    } catch (error) {
      setToast({ type: 'error', title: '操作未完成', message: error.message });
      return false;
    } finally {
      setBusyLabel('');
    }
  };

  const toggleWatch = (keyword, enabled, note = '') => runAction(
    enabled ? `正在关注“${keyword}”…` : `正在取消关注“${keyword}”…`,
    () => api.setWatch({ modelName: model.modelName, keyword, enabled, note }),
    enabled ? '已设为关注' : '已取消关注',
  );

  const saveWatch = async (items) => {
    const ok = await runAction('正在一次性保存关注词…', () => api.replaceWatches({
      modelName: model.modelName,
      items,
    }), '关注词已统一保存');
    if (ok) setWatchOpen(false);
  };

  const saveAnnotation = (payload) => {
    const target = { ...payload, modelName: model.modelName, parentAsin: model.parentAsin, metric: payload.metric || 'sp' };
    setPendingAnnotations((count) => count + 1);
    const save = async () => {
      try {
        const result = await api.setAnnotation({ ...target, lightweight: true });
        if (result?.ok === false) throw new Error(result.error || '标注未保存');
        const patch = result.annotation || target;
        const field = patch.metric === 'natural' ? 'naturalAnnotations' : 'spAnnotations';
        setData((current) => {
          const patched = new Map();
          const updateModel = (item) => {
            if (patched.has(item)) return patched.get(item);
            const competitors = item.competitors?.map(updateModel);
            const base = competitors?.some((value, index) => value !== item.competitors[index]) ? { ...item, competitors } : item;
            if (item.parentAsin !== target.parentAsin) return base;
            const index = item.dates.indexOf(patch.date);
            if (index < 0) return item;
            const next = { ...base, matrixRows: item.matrixRows.map((row) => {
              if (row.keyword.trim().toLocaleLowerCase('en-US') !== patch.keyword.trim().toLocaleLowerCase('en-US')) return row;
              const annotations = [...(row[field] || [])];
              annotations[index] = patch.text;
              return { ...row, [field]: annotations };
            }) };
            patched.set(item, next);
            return next;
          };
          return { ...current, models: current.models.map(updateModel),
            ...(current.ownModels ? { ownModels: current.ownModels.map(updateModel) } : {}),
            ...(current.competitors ? { competitors: current.competitors.map(updateModel) } : {}) };
        });
        return true;
      } catch (error) {
        setToast({ type: 'error', title: '标注保存失败，原内容已保留', message: `${target.keyword} · ${target.date}：${error.message}` });
        return false;
      } finally {
        setPendingAnnotations((count) => count - 1);
      }
    };
    annotationQueue.current = annotationQueue.current.then(save, save);
    return annotationQueue.current;
  };

  const resetWidths = () => {
    resetAllColumnWidths();
    setSettingsOpen(false);
    setToast({ type: 'success', title: '列宽已还原', message: '所有表格已恢复原表宽度。' });
  };

  const selectModel = (index) => {
    setTrendRow(null);
    setActiveIndex(index);
    const nextModel = data?.models?.[index];
    if (nextModel) {
      // Resolve the date in the same event as the product change.  The old
      // effect-based correction rendered the new Matrix once with a stale
      // date and then a second time after nearestDate() ran.
      setSelectedDate((currentDate) => {
        const dates = nextModel.dates || [];
        return dates.includes(currentDate) ? currentDate : nearestDate(currentDate, dates);
      });
    }
    if (nextModel && (!supportsTab(nextModel, activeTab) || !KNOWN_TABS.has(activeTab))) setActiveTab('natural');
  };

  const openComparison = (section) => {
    setViewFilters((current) => ({
      ...current,
      comparison: {
        ...current.comparison,
        query: '',
        keywords: [],
        relations: section ? [section] : [],
      },
    }));
    setComparisonFocus(section);
    setActiveTab('comparison');
  };

  const openKeywordTrend = (row) => {
    const scroll = document.querySelector('.comparison-scroll');
    const tableScroll = document.querySelector('.comparison-table-scroll');
    setComparisonScroll({ top: scroll?.scrollTop || 0, left: tableScroll?.scrollLeft || 0 });
    setTrendRow(row);
  };

  const closeKeywordTrend = () => setTrendRow(null);

  const addModel = async (payload) => {
    const ok = await runAction('正在登记型号…', () => api.addModel(payload), '型号已生成');
    if (ok) {
      setAddModelOpen(false);
      setActiveIndex(data?.models?.length || 0);
    }
  };

  const deleteModel = (item) => runAction(
    `正在删除“${item.modelName}”…`,
    () => api.deleteModel({ modelName: item.modelName, parentAsin: item.parentAsin }),
    '产品已删除',
  );

  const setModelCountry = (item, countryCode) => runAction(
    '正在保存产品国家设置…',
    () => api.setModelCountry({ modelName: item.modelName, parentAsin: item.parentAsin, countryCode }),
    '产品国家已更新',
  );

  const importAbaMonthlyCsv = (payload) => runAction(
    '正在导入月 ABA CSV…',
    () => api.importAbaMonthlyCsv(payload),
    '月 ABA 已导入',
  );

  const startSifImport = () => runAction(
    `正在为 ${model.modelName} 自动下载今日报表…`,
    () => api.startSifImport({ parentAsin: model.parentAsin, countryCode: model.countryCode || 'CA' }),
    '今日报表已下载并导入',
  );

  const saveModelIcon = async (iconKey) => {
    const ok = await runAction(
      '正在保存产品图标…',
      () => api.setModelIcon({ parentAsin: iconModel.parentAsin, iconKey }),
      '产品图标已更新',
    );
    if (ok) setIconModel(null);
  };

  if (!data || !model) {
    return (
      <div className={`app-root ${window.keywordTracker?.isWeb ? 'web-edition' : ''}`}>
        <WindowTitlebar onTool={toggleWebTool} activeTool={webTool} />
        <main className="empty-app">
        <BusyOverlay label={busyLabel} />
          <h1>关键词排名每日跟进</h1>
          <p>{data?.models?.length === 0 ? '“型号配置”中没有启用的型号。' : '正在准备软件数据…'}</p>
          <Toast toast={toast} onClose={() => setToast(null)} />
        </main>
      </div>
    );
  }

  return (
    <div className={`app-root ${window.keywordTracker?.isWeb ? 'web-edition' : ''}`}>
      <WindowTitlebar onTool={toggleWebTool} activeTool={webTool} />
      <div className="app-shell">
        <Sidebar
          models={data.models}
          activeIndex={activeIndex}
          onSelect={selectModel}
          onChooseIcon={setIconModel}
          onAddModel={() => setAddModelOpen(true)}
          onHistory={() => setActiveTab('history')}
          onOpenFolder={() => api.openToolFolder()}
          onSettings={() => setSettingsOpen(true)}
        />
        <main className="main-area">
          <Header
            model={model}
            activeTab={activeTab}
            onTab={(tab) => { setTrendRow(null); setActiveTab(tab); }}
            selectedDate={selectedDate}
            onDate={setSelectedDate}
            busy={Boolean(busyLabel)}
            onRefresh={() => runAction('正在刷新看板和矩阵…', () => api.runImport('refresh'), '刷新完成')}
            onImport={() => runAction('正在导入每日关键词报表…', () => api.runImport('normal'), '导入完成')}
            onSifImport={startSifImport}
          />
          {data.workbookOpen && data.storage !== 'local-json' && (
            <div className="workbook-alert"><AlertTriangle size={18} /><span>检测到跟进表可能正在 WPS 中打开。首次迁移完成后，软件将使用本地数据运行，不再依赖工作簿。</span></div>
          )}
          {!trendRow && activeTab !== 'history' && activeTab !== 'aba' && (
            <>
              <SummaryBand
                metrics={activeTab === 'dashboard' ? filteredMetrics : dateView.metrics}
                latestDate={selectedDate || model.latestDate}
                loadedAt={data.loadedAt}
                mode={activeTab}
              />
              {activeTab === 'dashboard' && <DashboardComparisonOverview rows={dashboardRows} selectedDate={selectedDate || model.latestDate} onDetails={openComparison} />}
            </>
          )}
          <div className={`content-area view-transition ${trendRow ? 'content-area-trend' : ''}`}>
            {trendRow && <KeywordTrendView model={model} row={model.matrixRows.find((row) => row.keyword === trendRow.keyword) || trendRow} onBack={closeKeywordTrend} />}
            {!trendRow && activeTab === 'dashboard' && <DashboardView rows={dashboardRows} sourceRows={dateView.rows} model={model} filters={viewFilters.dashboard} onFiltersChange={(next) => updateViewFilter('dashboard', next)} onToggleWatch={toggleWatch} onManage={() => setWatchOpen(true)} onOpenTrend={openKeywordTrend} />}
            {!trendRow && activeTab === 'natural' && <MatrixView model={model} metric="natural" rows={naturalRows} filters={viewFilters.natural} onFiltersChange={(next) => updateViewFilter('natural', next)} selectedDate={selectedDate} onToggleWatch={toggleWatch} onSetAnnotation={(payload) => saveAnnotation({ ...payload, metric: 'natural' })} />}
            {!trendRow && activeTab === 'sp' && <MatrixView model={model} metric="sp" rows={spRows} filters={viewFilters.sp} onFiltersChange={(next) => updateViewFilter('sp', next)} selectedDate={selectedDate} onToggleWatch={toggleWatch} onSetAnnotation={saveAnnotation} />}
            {!trendRow && activeTab === 'comparison' && <ComparisonMatrixView model={model} rows={model.matrixRows} filters={viewFilters.comparison} onFiltersChange={(next) => updateViewFilter('comparison', next)} selectedDate={selectedDate} focusSection={comparisonFocus} onFocusHandled={() => setComparisonFocus(null)} onToggleWatch={toggleWatch} onOpenTrend={openKeywordTrend} restoreScroll={comparisonScroll} />}
            {!trendRow && activeTab === 'aba' && <ABAView model={abaModel} rows={abaRows} filters={viewFilters.aba} onFiltersChange={(next) => updateViewFilter('aba', next)} onToggleWatch={toggleWatch} />}
            {!trendRow && activeTab === 'history' && <HistoryView model={model} sourceCount={data.sourceCount} workbookModifiedAt={data.workbookModifiedAt} storage={data.storage} onOpenWorkbook={() => api.openWorkbook()} onOpenSourceFolder={() => api.openSourceFolder()} />}
          </div>
          <footer className="statusbar">
            <span role="status">{pendingAnnotations > 0 ? `正在后台保存标注（${pendingAnnotations}）…` : '本地数据已同步'} · {activeViewCount} 个关键词 · 源文件 {data.sourceCount} 个</span>
            <span><b className="legend-up">红色＝上升</b><b className="legend-down">绿色＝下降</b><b className="legend-none">灰色＝未上榜</b></span>
          </footer>
        </main>
        <WatchDrawer
          open={watchOpen}
          model={model}
          onClose={() => setWatchOpen(false)}
          onSave={saveWatch}
        />
        <AddModelModal open={addModelOpen} onClose={() => setAddModelOpen(false)} onSubmit={addModel} />
        <IconPickerModal model={iconModel} onClose={() => setIconModel(null)} onSelect={saveModelIcon} />
        {webTool === 'history' && <div className="web-tool-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) closeWebTools(); }}><section className="web-tool-panel" role="dialog" aria-label="导入日志"><div className="drawer-header"><h2>导入日志</h2><button onClick={closeWebTools} aria-label="关闭导入日志">×</button></div><HistoryView model={model} sourceCount={data.sourceCount} workbookModifiedAt={data.workbookModifiedAt} storage={data.storage} onOpenWorkbook={() => api.openWorkbook()} onOpenSourceFolder={() => api.openSourceFolder()} /></section></div>}
        <SettingsModal open={settingsOpen} onClose={closeWebTools} onResetWidths={resetWidths} models={data.models} activeModel={model} onDeleteModel={deleteModel} onAddModel={() => setAddModelOpen(true)} onSetCountry={setModelCountry} abaMonthlyImports={data.abaMonthlyImports} onImportAba={importAbaMonthlyCsv} />
        <BusyOverlay label={busyLabel} />
        <Toast toast={toast} onClose={() => setToast(null)} />
      </div>
    </div>
  );
}
