import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import MatrixView from '../src/components/MatrixView.jsx';
import ComparisonMatrixView from '../src/components/ComparisonMatrixView.jsx';
import { EMPTY_FILTER } from '../src/components/FilterCascade.jsx';
import '../src/styles.css';
const days = (month, count) => Array.from({ length: count }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`);
function QA() {
  const [scenario, setScenario] = useState('14');
  const [view, setView] = useState('natural');
  const [filter, setFilter] = useState(EMPTY_FILTER);
  const dates = scenario === 'year' ? ['2025-12-31', '2026-01-01'] : [...days('2026-09', 3), ...days('2026-10', Number(scenario))];
  const row = { keyword: 'bomber jacket men', translation: '男士飞行夹克', naturalValues: dates.map((_, i) => 30 - i), spValues: dates.map((_, i) => 10 - i % 5) };
  const model = { parentAsin: 'B0CJQBTQ8V', modelName: '月份验证产品', countryCode: 'CA', dates, latestDate: dates.at(-1), selectedYear: 2026, matrixRows: [row], historyRecords: [] };
  const props = { model, rows: [row], filters: filter, onFiltersChange: setFilter, selectedDate: dates.at(-1), onToggleWatch() {}, onSetAnnotation() {} };
  return <main style={{ padding: 24 }}><h1>月份默认展示验证（合成测试数据）</h1><div>{['14', '15', 'year'].map(s => <button key={s} onClick={() => { setScenario(s); setFilter(EMPTY_FILTER); }}>{s === 'year' ? '跨年产品' : `${s}天产品`}</button>)}{['natural', 'sp', 'comparison'].map(v => <button key={v} onClick={() => setView(v)}>{v}</button>)}</div><p>当前产品：{scenario} · 当前视图：{view}</p>{view === 'comparison' ? <ComparisonMatrixView {...props} /> : <MatrixView {...props} metric={view} />}</main>;
}
createRoot(document.getElementById('root')).render(<QA />);
