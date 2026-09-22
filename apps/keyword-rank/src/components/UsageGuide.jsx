import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { BookOpen, Download, X, ArrowRight, Check, Puzzle, Copy } from 'lucide-react';
import './UsageGuide.css';

const STORAGE_KEY = 'keyword-tracker:usage-guide:v1';
function readProgress() { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch { return {}; } }
function saveProgress(value) { try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...readProgress(), ...value })); } catch { /* Guide remains usable when browser storage is unavailable. */ } }

const STEPS = [
  { title: '先选一个要查看的产品', selectors: ['.model-item.active .model-copy', '.sidebar-action'], text: '单击左侧名称，切换产品数据。双击名称或 ASIN，打开对应站点的亚马逊商品页。', hint: '点产品图片可以换图标；「新增型号」用来添加产品。' },
  { title: '把每天的数据导进来', selectors: ['.sif-import-button', '.sif-all-import-button', '.manual-import-button'], text: '「导入当前产品」更新当前产品及关联竞品；「导入全部产品」更新全部已配置产品与竞品；「本地导入」选择电脑上的已有报表。', hint: '自动导入需安装 SIF 插件并登录 SIF。先完成全部自有产品，再导入竞品。' },
  { title: '选择你想看的内容', selectors: ['.tabs'], text: '看板看整体；自然矩阵看自然排名，SP矩阵看广告排名；对比矩阵同时看两者；ABA月榜看热度排名，历史记录查报表。', hint: '日常跟进可以先从「自然矩阵」开始。每周广告关注词分析用于查看已导入的广告分析建议。' },
  { title: '一眼看懂排名变化', selectors: ['.matrix-period-select label', '.matrix-month-trigger', '.matrix-table .matrix-rank-cell'], text: '每行一个关键词，每列一个日期。数字越小，排名越靠前。红色表示上升，绿色表示下降；灰色 0 表示未上榜。', hint: '在表格上方选择年份、月份，查看不同时间的记录。顶部日期决定当前查看日期。' },
  { title: '把重点关键词找出来', selectors: ['.matrix-table .star-button', '.matrix-panel .cascade-filter-bar'], text: '点击星星关注关键词，再点一次取消。用搜索框快速定位，再用筛选缩小查看范围。', hint: '每天先看自己关注的词，更容易发现需要处理的变化。' },
  { title: '记下当天做了什么', selectors: ['.matrix-table .matrix-rank-cell'], text: '点击自然 / SP 矩阵中的排名数字，记录「调整竞价」「更换主图」等操作。蓝色折角表示已有标注。', hint: 'Enter 保存 · Shift + Enter 换行 · Esc 取消。教学不会替你写入标注。' },
  { title: '看看同一个词的竞品表现', selectors: ['.model-item.active .competitor-sidebar-toggle', '.matrix-panel .competitor-keyword-button'], text: '点产品右侧箭头，展开关联竞品；点竞品名称查看其数据。点关键词旁的「竞品」，可以比较同一个词的表现。', hint: '还没有竞品？在「设置 → 竞品设置」选择自有产品，再添加竞品。' },
  { title: '数据备份，教学随时重看', selectors: ['[data-guide-entry]', '[data-web-tool="history"]', '[data-web-tool="files"]'], text: '「导入日志」查看导入情况；「工具文件夹」导出或恢复 JSON 备份。以后忘记操作，点「使用指南」重新学习。', hint: '数据保存在当前浏览器。更换电脑、浏览器或软件目录前，先导出备份。' },
];
const TOPICS = [
  { title: '产品与竞品', sub: '切换产品 · 双击商品页 · 竞品设置', step: 0, lines: ['单击左侧名称切换产品；双击名称或 ASIN 打开对应站点的亚马逊商品页。', '点击图片更换图标。「新增型号」添加产品；设置中的「产品管理」可编辑名称、站点和 ASIN。', '「设置 → 竞品设置」登记关联竞品，左侧箭头展开列表。关键词旁「竞品」用于比较同一个词的排名。'] },
  { title: '数据导入', sub: '扩展准备 · 三种导入 · 失败重试', step: 1, lines: ['自动导入前，先安装 SIF 在线版扩展，并在同一浏览器登录 SIF。已有报表也可以直接「本地导入」。', '「导入当前产品」包含关联竞品。「导入全部产品」覆盖全部已配置产品与竞品，始终先完成自有产品，再处理竞品。', '结束后查看结果面板，确认数据已保存再点「确定并刷新」。部分失败可「仅重试失败项」；未确认保存时，先重试保存或导出备份。'] },
  { title: '排名与筛选', sub: '颜色含义 · 关注词 · 日期范围', step: 3, lines: ['数字越小排名越靠前。红色上升、绿色下降、灰色 0 未上榜；空白表示没有对应记录，不要当作第 0 名。', '表格上方选择年份、月份，顶部选择查看日期。自然矩阵和 SP矩阵分别展示自然与广告排名。', '点击星星关注，搜索框查找关键词，筛选进一步缩小范围；关注和筛选各自保留原有规则。'] },
  { title: '标注与趋势', sub: '记录操作 · 保存快捷键 · 看趋势', step: 5, lines: ['点击自然 / SP 矩阵排名格填写标注。蓝色折角表示有标注；可在编辑卡片清除。', 'Enter 保存，Shift + Enter 换行，Esc 取消；点击卡片外也会保存。等待保存完成后再刷新。', '对比矩阵中双击关键词查看趋势。自然矩阵关键词悬停可查看 ABA 对照；排名格悬停查看同日竞品与标注。'] },
  { title: 'ABA 月榜', sub: '导入月度数据 · 查看热度排名', lines: ['在「设置 → 月 ABA CSV 导入」选择国家、年份、月份和对应的月度 CSV，再点击导入。', '按关键词查看搜索频率排名，数字越小排名越靠前。缺少月份数据时显示空缺，需要补充对应报表。', '同一国家、同一月份再次导入会先提示确认，然后覆盖该月数据。'] },
  { title: '数据备份', sub: '导出备份 · 恢复数据 · 换电脑', step: 7, lines: ['右上角「工具文件夹 → 导出数据备份」下载 JSON 文件。定期保存到你自己的备份目录。', '在新页面用「工具文件夹 → 导入数据备份」恢复记录。换浏览器、电脑或软件目录前先备份。', '「恢复上周的数据」会替换当前业务数据；仅在确实需要恢复时使用，并仔细阅读确认内容。'] },
];

function visibleRect(selector) {
  for (const element of document.querySelectorAll(selector)) {
    const box = element.getBoundingClientRect();
    if (!box.width || !box.height || getComputedStyle(element).visibility === 'hidden') continue;
    let left = Math.max(4, box.left - 4), top = Math.max(4, box.top - 4), right = Math.min(innerWidth - 4, box.right + 4), bottom = Math.min(innerHeight - 4, box.bottom + 4);
    if (element.matches('.matrix-rank-cell')) {
      // Horizontal scrolling can put early dates behind the sticky keyword
      // columns. Only spotlight the portion that is actually visible.
      const sticky = element.parentElement.querySelector('.translation-col');
      const head = element.closest('table')?.querySelector('thead');
      if (sticky) left = Math.max(left, sticky.getBoundingClientRect().right);
      if (head) top = Math.max(top, head.getBoundingClientRect().bottom);
    }
    for (let ancestor = element.parentElement; ancestor; ancestor = ancestor.parentElement) {
      const style = getComputedStyle(ancestor), clip = ancestor.getBoundingClientRect();
      if (/(auto|scroll|hidden)/.test(style.overflowX)) { left = Math.max(left, clip.left); right = Math.min(right, clip.right); }
      if (/(auto|scroll|hidden)/.test(style.overflowY)) { top = Math.max(top, clip.top); bottom = Math.min(bottom, clip.bottom); }
    }
    if (right - left > 6 && bottom - top > 6) return { x: left, y: top, width: right - left, height: bottom - top };
  }
  return null;
}
const SCROLL_SELECTORS = ['.matrix-scroll', '.comparison-scroll', '.content-area', '.model-list', '.main-area'];

export default function UsageGuide({ ready, blocked, hasModel, onPrepare, onRestore, onCloseTools }) {
  const [screen, setScreen] = useState(null);
  const [step, setStep] = useState(0);
  const [topic, setTopic] = useState(0);
  const [installStep, setInstallStep] = useState(0);
  const [browser, setBrowser] = useState(/Edg\//.test(navigator.userAgent) ? 'Edge' : 'Chrome');
  const [installReturn, setInstallReturn] = useState('hub');
  const [message, setMessage] = useState('');
  const [notice, setNotice] = useState('');
  const [connection, setConnection] = useState('idle');
  const [layout, setLayout] = useState({ rects: [], left: 16, top: 70 });
  const cardRef = useRef(null), autoShown = useRef(false), snapshot = useRef(null), checkGeneration = useRef(0);
  const props = useRef({});
  props.current = { ready, blocked, onPrepare, onRestore, onCloseTools, screen };
  const editing = () => Boolean(document.querySelector('.annotation-editor, .add-model-modal, .icon-picker-modal, .busy-overlay, [aria-label="导入结果"]'));
  const rememberScroll = () => {
    if (snapshot.current) return;
    snapshot.current = SCROLL_SELECTORS.flatMap(selector => [...document.querySelectorAll(selector)].map((element, index) => ({ selector, index, left: element.scrollLeft, top: element.scrollTop })));
  };
  const restoreView = () => {
    props.current.onRestore();
    const positions = snapshot.current || [];
    snapshot.current = null;
    const restore = () => positions.forEach(({ selector, index, left, top }) => { const element = document.querySelectorAll(selector)[index]; if (element) { element.scrollLeft = left; element.scrollTop = top; } });
    requestAnimationFrame(() => requestAnimationFrame(restore));
    setTimeout(restore, 180);
  };
  const close = () => {
    saveProgress({ seen: true });
    checkGeneration.current++;
    restoreView(); setScreen(null); setMessage('');
    requestAnimationFrame(() => document.querySelector('[data-guide-entry]')?.focus({ preventScroll: true }));
  };
  const hub = () => { restoreView(); setMessage(''); setScreen('hub'); };
  const tour = (index = 0) => {
    rememberScroll(); setStep(index); setScreen('tour');
    saveProgress({ seen: true, step: index, completed: false });
    if (index >= 3 && index <= 6 && hasModel) props.current.onPrepare();
  };
  const install = (from = 'hub') => { setInstallReturn(from); setInstallStep(0); setScreen('install'); setMessage(''); setConnection('idle'); };

  useEffect(() => {
    const open = event => {
      const current = props.current;
      if (!current.ready || current.blocked || editing()) { setNotice('请先完成当前编辑或等待导入结束，再打开使用指南。'); return; }
      current.onCloseTools(); saveProgress({ seen: true });
      setMessage('');
      if (event.detail?.install) { setInstallReturn('hub'); setInstallStep(0); setScreen('install'); }
      else setScreen('hub');
    };
    const guardPointer = event => {
      if (event.target.closest?.('[data-guide-entry]') && (props.current.blocked || editing())) {
        // Stop before the annotation editor's outside-click save handler.
        event.preventDefault(); event.stopImmediatePropagation();
        setNotice('请先完成当前编辑或等待导入结束，再打开使用指南。');
      }
    };
    window.addEventListener('keyword-guide-open', open);
    window.addEventListener('pointerdown', guardPointer, true);
    return () => { window.removeEventListener('keyword-guide-open', open); window.removeEventListener('pointerdown', guardPointer, true); };
  }, []);
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(''), 4000); return () => clearTimeout(timer); }, [notice]);
  useEffect(() => {
    if (!ready || blocked || autoShown.current || readProgress().seen) return;
    const timer = setInterval(() => {
      const visibleDialog = [...document.querySelectorAll('[role="dialog"]')].some(element => {
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && rect.left < innerWidth && rect.right > 0 && rect.top < innerHeight && rect.bottom > 0 && getComputedStyle(element).visibility !== 'hidden';
      });
      if (editing() || visibleDialog) return;
      autoShown.current = true; setScreen('welcome'); clearInterval(timer);
    }, 400);
    return () => clearInterval(timer);
  }, [ready, blocked]);
  useEffect(() => {
    if (!screen) return;
    const root = document.querySelector('.app-root'), previous = root?.inert;
    if (root) root.inert = true;
    const keyboard = event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); close(); }
      if (event.key === 'Tab') {
        const nodes = [...(cardRef.current?.querySelectorAll('button:not(:disabled), a[href], input') || [])];
        const first = nodes[0], last = nodes.at(-1);
        if (event.shiftKey && (document.activeElement === first || !cardRef.current?.contains(document.activeElement))) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || !cardRef.current?.contains(document.activeElement))) { event.preventDefault(); first?.focus(); }
      }
    };
    window.addEventListener('keydown', keyboard, true);
    return () => { if (root) root.inert = previous; window.removeEventListener('keydown', keyboard, true); };
  }, [Boolean(screen)]);
  useEffect(() => { if (screen) cardRef.current?.focus({ preventScroll: true }); }, [screen, step, installStep, topic]);
  useEffect(() => { if (screen === 'install') saveProgress({ seen: true, installStep }); }, [screen, installStep]);

  useLayoutEffect(() => {
    if (screen !== 'tour') return;
    const place = () => {
      const card = cardRef.current;
      if (!card) return;
      const selectors = !hasModel && step === 0 ? ['[data-guide-add-model]'] : STEPS[step].selectors;
      const rects = selectors.map(visibleRect).filter(Boolean);
      const width = card.offsetWidth, height = card.offsetHeight, margin = 16;
      const clamp = (value, maximum) => Math.max(margin, Math.min(value, maximum - margin));
      const candidates = rects.flatMap(r => [[r.x + r.width + 16, r.y], [r.x - width - 16, r.y], [r.x, r.y + r.height + 16], [r.x, r.y - height - 16]]);
      candidates.push([innerWidth - width - 16, innerHeight - height - 16], [16, innerHeight - height - 16], [(innerWidth - width) / 2, (innerHeight - height) / 2]);
      const positions = candidates.map(([x, y]) => ({ left: clamp(x, innerWidth - width), top: clamp(y, innerHeight - height) }));
      const overlap = p => rects.reduce((total, r) => total + Math.max(0, Math.min(p.left + width + 8, r.x + r.width) - Math.max(p.left - 8, r.x)) * Math.max(0, Math.min(p.top + height + 8, r.y + r.height) - Math.max(p.top - 8, r.y)), 0);
      positions.sort((a, b) => overlap(a) - overlap(b));
      const next = { rects, hasRank: Boolean(visibleRect('.matrix-table .matrix-rank-cell')), ...positions[0] };
      setLayout(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
    };
    place();
    const observer = new ResizeObserver(place); observer.observe(cardRef.current);
    const timer = setInterval(place, 400);
    window.addEventListener('resize', place); window.addEventListener('scroll', place, true);
    return () => { observer.disconnect(); clearInterval(timer); window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
  }, [screen, step, hasModel]);

  const download = () => {
    try { const result = window.keywordTracker.downloadSifExtension(); setMessage(`已发起下载：${result.filename}。请在浏览器下载列表确认完成，然后全部解压。`); }
    catch (error) { setMessage(`下载失败：${error.message} 可以再次点击下载重试。`); }
  };
  const check = async () => {
    const generation = ++checkGeneration.current;
    setConnection('checking'); setMessage('');
    try {
      const result = await window.keywordTracker.checkSifExtension();
      if (generation === checkGeneration.current) setConnection(result.connected ? 'connected' : 'missing');
    } catch (error) { if (generation === checkGeneration.current) { setConnection('error'); setMessage(`检查失败：${error.message}`); } }
  };
  const copyAddress = async () => {
    const address = browser === 'Edge' ? 'edge://extensions/' : 'chrome://extensions/';
    try { await navigator.clipboard.writeText(address); setMessage('已复制。粘贴到浏览器地址栏打开。'); }
    catch { setMessage(`请手动选中并复制 ${address}，粘贴到浏览器地址栏。`); }
  };
  const finish = () => { saveProgress({ seen: true, completed: true, step: 0 }); restoreView(); setScreen('done'); };
  const progress = readProgress();
  const current = STEPS[step];
  const installTitles = ['先把插件下载下来', '全部解压，放在固定位置', `把插件加载到 ${browser}`, '允许插件连接本地网页', '在同一个浏览器登录 SIF', '返回软件，检查插件连接'];
  const edge = browser === 'Edge';
  const noRank = screen === 'tour' && step >= 3 && step <= 6 && !layout.hasRank;
  return createPortal(<>
    {notice && <div className="guide-notice" role="status">{notice}</div>}
    {screen && <div className="guide-layer" data-usage-guide>
      {screen === 'tour' ? <svg className="guide-shade" width="100%" height="100%" aria-hidden="true"><defs><mask id="usage-guide-mask"><rect width="100%" height="100%" fill="white" />{layout.rects.map((r, i) => <rect key={i} {...r} rx="7" fill="black" />)}</mask></defs><rect width="100%" height="100%" fill="#102a469e" mask="url(#usage-guide-mask)" />{layout.rects.map((r, i) => <rect key={i} {...r} rx="7" fill="none" stroke="#30d6e7" strokeWidth="2" />)}</svg> : <div className="guide-dim" />}
      <section ref={cardRef} className={`guide-card ${screen === 'tour' ? 'guide-coach' : 'guide-center'}`} role="dialog" aria-modal="true" aria-labelledby="guide-title" tabIndex={-1} style={screen === 'tour' ? { left: layout.left, top: layout.top } : undefined}>
        <button className="guide-close" onClick={close} aria-label="退出使用指南"><X size={19} /></button>
        {screen === 'welcome' && <><span className="guide-symbol"><BookOpen /></span><div className="guide-kicker">欢迎使用 · 关键词排名每日跟进</div><h1 id="guide-title">用 2 分钟，<br />学会每天查看关键词排名。</h1><p>从选择产品到看排名，一步一步带你熟悉常用功能。</p><div className="guide-mini"><span>① 选择产品</span><span>② 导入数据</span><span>③ 查看排名</span></div><div className="guide-tip">共 8 步，可以随时退出。以后点击右上角「使用指南」重看。</div><div className="guide-actions"><button onClick={close}>暂时跳过</button><button className="guide-primary" onClick={() => tour()}>开始引导 <ArrowRight size={16} /></button></div></>}
        {screen === 'hub' && <><div className="guide-kicker">需要时，随时回来</div><h1 id="guide-title">使用指南</h1><p>从头学习，或只看你现在需要的内容。</p><div className="guide-start-row"><button className="guide-primary" onClick={() => tour()}>重新开始完整引导 <span>8 步 →</span></button>{!progress.completed && Number.isInteger(progress.step) && progress.step > 0 && <button onClick={() => tour(Math.min(7, progress.step))}>继续第 {progress.step + 1} 步</button>}</div><div className="guide-plugin"><strong><Puzzle size={17} />下载与安装 SIF 插件</strong><p>自动导入前先安装 · Chrome / Edge · 6 步完成{window.__SIF_EXTENSION_PACKAGE__?.version ? ` · v${window.__SIF_EXTENSION_PACKAGE__.version}` : ''}</p><button onClick={download}><Download size={14} />下载插件 ZIP</button><button onClick={() => install()}>查看安装教程 →</button>{Number.isInteger(progress.installStep) && progress.installStep > 0 && <button onClick={() => { setInstallReturn('hub'); setInstallStep(Math.min(5, progress.installStep)); setConnection('idle'); setMessage(''); setScreen('install'); }}>继续安装第 {progress.installStep + 1} 步</button>}</div><div className="guide-topics">{TOPICS.map((item, i) => <button key={item.title} onClick={() => { setTopic(i); setScreen('topic'); setMessage(''); }}><strong>{item.title} →</strong><small>{item.sub}</small></button>)}</div><div className="guide-tip">日常顺序：选择产品 → 导入数据 → 查看排名 → 记录操作。</div></>}
        {screen === 'tour' && <><div className="guide-kicker">快速上手 · 第 {step + 1} / 8 步</div><h2 id="guide-title">{!hasModel && step === 0 ? '先添加你的第一个产品' : current.title}</h2><p>{!hasModel && step === 0 ? '目前没有启用的产品。结束教学后，点击「新增型号」填写产品名称、父体 ASIN 和站点。' : current.text}</p>{noRank && <div className="guide-example"><small>教学示例 · 不写入真实数据</small><div>昨天 50 → 今天 <b>38</b> <span>排名上升</span></div></div>}<div className="guide-tip">{current.hint}{step === 1 && <button className="guide-inline" onClick={() => install('tour')}>还没安装？先看安装教程 →</button>}</div><div className="guide-dots" aria-hidden="true">{STEPS.map((_, i) => <i key={i} className={i <= step ? 'is-done' : ''} />)}</div><div className="guide-footer"><button className="guide-text" onClick={close}>退出引导</button><div>{step > 0 && <button onClick={() => tour(step - 1)}>上一步</button>}<button className="guide-primary" onClick={() => step === 7 ? finish() : tour(step + 1)}>{step === 7 ? '完成' : '下一步 →'}</button></div></div></>}
        {screen === 'topic' && <><div className="guide-kicker">使用指南 · 专题</div><h1 id="guide-title">{TOPICS[topic].title}</h1><ol className="guide-list">{TOPICS[topic].lines.map(line => <li key={line}>{line}</li>)}</ol><div className="guide-actions"><button onClick={hub}>返回目录</button>{topic === 1 && <button onClick={() => install('topic')}>安装插件</button>}{TOPICS[topic].step != null && <button className="guide-primary" onClick={() => tour(TOPICS[topic].step)}>看看对应入口 →</button>}</div></>}
        {screen === 'install' && <><div className="guide-kicker">插件安装 · 第 {installStep + 1} / 6 步</div><div className="guide-browsers">{['Chrome', 'Edge'].map(value => <button key={value} aria-pressed={browser === value} onClick={() => { setBrowser(value); setMessage(''); }}>{value}</button>)}</div><h1 id="guide-title">{installTitles[installStep]}</h1>
          {installStep === 0 && <><p>下载与当前软件配套的 SIF 在线版扩展 ZIP。也可以从「工具文件夹 → 下载 SIF 在线版扩展」下载。</p><button className="guide-primary" onClick={download}><Download size={16} />下载插件 ZIP</button><div className="guide-tip">已有随包的 sif-batch-reverse-downloader 文件夹？<button className="guide-inline" onClick={() => setInstallStep(2)}>直接看第 3 步：加载插件 →</button></div></>}
          {installStep === 1 && <><p>在下载目录中找到 ZIP，右键选择「全部解压」。安装时要选择解压后的文件夹。</p><div className="guide-folder">📁 sif-batch-reverse-downloader<br />　├ manifest.json <b>← 选择这一层文件夹</b><br />　├ background.js<br />　└ content.js …</div><div className="guide-tip">不要直接选择 ZIP。安装后保留这个文件夹，不要移动或删除。</div></>}
          {installStep === 2 && <><ol className="guide-list"><li>打开下面的扩展管理页。</li><li>开启「{edge ? '开发人员模式' : '开发者模式'}」。</li><li>点击「{edge ? '加载解压缩的扩展' : '加载已解压的扩展程序'}」。</li><li>选择包含 manifest.json 的插件文件夹。</li></ol><div className="guide-address"><code>{edge ? 'edge://extensions/' : 'chrome://extensions/'}</code><button onClick={copyAddress}><Copy size={14} />复制地址</button></div><div className="guide-tip">复制后，粘贴到浏览器地址栏打开。浏览器内部页面需要你手动操作。</div></>}
          {installStep === 3 && <><p>在扩展卡片点击「详情」，找到并开启「允许访问文件网址」。</p><div className="guide-permission"><small>开关位置示意 · 需在浏览器扩展详情中手动开启</small><div><strong>允许访问文件网址</strong><span aria-hidden="true"><i /></span></div></div><div className="guide-tip">{location.protocol === 'file:' ? '你正在使用本地 HTML，需要开启此权限。' : '通过 localhost 打开时可跳过；双击 index.html 使用时需要开启。'}</div></>}
          {installStep === 4 && <><p>在安装插件的同一个浏览器、同一个用户配置中打开 SIF，并完成登录。</p><a className="guide-primary" href="https://www.sif.com/" target="_blank" rel="noopener noreferrer">打开 SIF →</a><div className="guide-tip">插件能连接软件，并不代表 SIF 已登录。请在 SIF 页面确认登录状态。</div></>}
          {installStep === 5 && <><p>刚安装扩展后，请先刷新关键词软件，再从「使用指南」进入本步骤检查连接。</p><div className={`guide-connection guide-connection-${connection}`} role="status"><strong>{({ idle: '○ 待检查', checking: '正在检查插件连接…', connected: '✓ 插件已连接当前页面', missing: '未检测到插件连接', error: '检查失败，请重试' })[connection]}</strong><button className="guide-primary" disabled={connection === 'checking'} onClick={check}>{connection === 'checking' ? '检查中…' : '检查插件连接'}</button></div>{['missing', 'error'].includes(connection) && <ol className="guide-list"><li>插件是否启用、是否安装在当前浏览器配置中？</li><li>本地 HTML 使用时，是否允许访问文件网址？</li><li>刷新当前软件后，再检查一次。</li></ol>}<div className="guide-tip">连接成功后，可以手动尝试「导入当前产品」（包含关联竞品）。若导入失败，再检查 SIF 登录与多文件下载权限。</div></>}
          <div className="guide-footer"><button onClick={() => installReturn === 'tour' ? tour(step) : installReturn === 'topic' ? setScreen('topic') : hub()}>{installReturn === 'tour' ? '返回导入教学' : '返回目录'}</button><div>{installStep > 0 && <button onClick={() => { setInstallStep(installStep - 1); setMessage(''); }}>上一步</button>}<button className="guide-primary" onClick={() => { setMessage(''); if (installStep < 5) setInstallStep(installStep + 1); else if (installReturn === 'tour') tour(step); else hub(); }}>{installStep === 5 ? '完成教程' : '下一步 →'}</button></div></div>
        </>}
        {screen === 'done' && <><span className="guide-symbol"><Check /></span><h1 id="guide-title">可以开始今天的跟进了</h1><p>选择产品 → 导入数据 → 查看排名 → 记录操作。</p><div className="guide-tip">需要帮助时，右上角「使用指南」随时都在。</div><div className="guide-actions"><button onClick={hub}>查看其他用法</button><button className="guide-primary" onClick={close}>开始使用</button></div></>}
        {message && <p className="guide-message" role="status">{message}</p>}
      </section>
    </div>}
  </>, document.body);
}
