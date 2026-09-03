import { useEffect, useRef, useState } from 'react';
import { SIF_COUNTRIES } from '../lib/countries.js';

export default function AbaImportSection({ imports = [], defaultCountry = 'CA', defaultYear, defaultMonth, onImport }) {
  const [countryCode, setCountryCode] = useState(defaultCountry || 'CA');
  const [year, setYear] = useState(String(defaultYear || new Date().getFullYear()));
  const [month, setMonth] = useState(String(defaultMonth || new Date().getMonth() + 1));
  const [file, setFile] = useState(null);
  const [status, setStatus] = useState('');
  const [isError, setIsError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (defaultCountry) setCountryCode(defaultCountry);
  }, [defaultCountry]);
  useEffect(() => {
    if (defaultYear) setYear(String(defaultYear));
    if (defaultMonth) setMonth(String(defaultMonth));
  }, [defaultYear, defaultMonth]);

  const setMessage = (message, error = false) => {
    setStatus(message || '');
    setIsError(Boolean(error));
  };

  const submit = async () => {
    if (submitting) return;
    const selectedYear = Number(year);
    const selectedMonth = Number(month);
    if (!file) { setMessage('请先选择月 ABA CSV 文件。', true); inputRef.current?.focus(); return; }
    if (!Number.isInteger(selectedYear) || selectedYear < 2000 || selectedYear > 2100) { setMessage('年份应为 2000 至 2100 的整数。', true); return; }
    const monthKey = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}`;
    const existing = imports.some((item) => item.month === monthKey && String(item.countryCode || '').toUpperCase() === countryCode);
    if (existing && !window.confirm(`已存在 ${monthKey} 的月 ABA 数据，确定覆盖吗？`)) return;
    if (typeof onImport !== 'function') { setMessage('当前环境未加载月 ABA 导入功能，请刷新后重试。', true); return; }
    setSubmitting(true);
    setMessage(`正在解析 ${file.name}，大文件可能需要一点时间……`);
    try {
      const ok = await onImport({
        countryCode,
        year: selectedYear,
        month: selectedMonth,
        file,
        filePath: file.path || '',
      });
      if (ok === false) {
        setMessage('月 ABA 导入未完成，请查看页面提示。', true);
        return;
      }
      setMessage(`${monthKey} 月 ABA 已导入。`);
      setFile(null);
      if (inputRef.current) inputRef.current.value = '';
    } catch (error) {
      setMessage(error?.message || '月 ABA 导入失败，请检查文件和月份。', true);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="settings-aba-import" data-aba-monthly-import>
      <div className="settings-aba-import-title"><span>月 ABA CSV 导入</span><small>今年/去年均可 · 搜索词 = 关键词</small></div>
      <p className="settings-aba-import-help">按国家、年份、月份导入月度 ABA CSV。看板和 ABA 月榜会优先使用自己记录的数据，仅在对应月份缺少记录时使用 CSV 补缺；原始 CSV 不会被修改。</p>
      <div className="settings-aba-import-fields">
        <label>国家<select value={countryCode} onChange={(event) => setCountryCode(event.target.value)}>{SIF_COUNTRIES.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}</select></label>
        <label>年份<input type="number" min="2000" max="2100" step="1" value={year} onChange={(event) => setYear(event.target.value)} /></label>
        <label>月份<select value={month} onChange={(event) => setMonth(event.target.value)}>{Array.from({ length: 12 }, (_item, index) => <option key={index + 1} value={index + 1}>{index + 1} 月</option>)}</select></label>
      </div>
      <label className="settings-aba-file">月 ABA CSV 文件<input ref={inputRef} type="file" accept=".csv,text/csv" onChange={(event) => setFile(event.target.files?.[0] || null)} /></label>
      <button type="button" className="settings-aba-import-button" disabled={submitting} onClick={submit}>{submitting ? '正在导入…' : '导入月 ABA 文件'}</button>
      <small className={`settings-aba-import-status ${isError ? 'is-error' : ''}`} role="status" aria-live="polite">{status}</small>
      <div className="settings-aba-imported"><span className="settings-aba-imported-title">已导入月份</span><div className="settings-aba-imported-list">
        {imports.length ? imports.map((item) => <div className="settings-aba-imported-item" key={`${item.countryCode}-${item.month}`}><strong>{item.countryName || item.countryCode} {item.month}</strong><small title={item.fileName || ''}>{Number(item.rowCount || 0).toLocaleString('zh-CN')} 词{item.fileName ? ` · ${item.fileName}` : ''}</small></div>) : <small className="settings-aba-imported-item">尚未导入月 ABA 文件。</small>}
      </div></div>
    </section>
  );
}
