import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { BookOpen, Download, X, ArrowRight, Check, Puzzle, Copy } from 'lucide-react';
import './UsageGuide.css';
import AnnotationEditor from './AnnotationEditor.jsx';
import { GUIDE_STEPS as STEPS, GUIDE_TOPICS as TOPICS } from './guideSteps.js';

const STORAGE_KEY = 'keyword-tracker:usage-guide:v1';
function readProgress() { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch { return {}; } }
function saveProgress(value) { try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...readProgress(), ...value })); } catch { /* Guide remains usable when browser storage is unavailable. */ } }

function visibleRect(selector, includeElement = false) {
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
    if (right - left > 6 && bottom - top > 6) return { x: left, y: top, width: right - left, height: bottom - top, ...(includeElement ? { element } : {}) };
  }
  return null;
}
const SCROLL_SELECTORS = ['.dashboard-scroll', '.aba-scroll', '.settings-modal', '.matrix-scroll', '.comparison-scroll', '.content-area', '.model-list', '.main-area'];

export default function UsageGuide({ ready, blocked, hasModel, onPrepare, onRestore, onCloseTools, onOpenBackup }) {
  const [screen, setScreen] = useState(null);
  const [step, setStep] = useState(0);
  const [demoEditor, setDemoEditor] = useState(null);
  const [demoMissing, setDemoMissing] = useState(false);
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
    const restore = () => positions.forEach(({ selector, index, left, top }) => {
      const element = document.querySelectorAll(selector)[index];
      if (element) {
        if (element.matches('.matrix-scroll')) element.setAttribute('data-guide-scroll-restored', '');
        element.scrollLeft = left; element.scrollTop = top;
      }
    });
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
    if (hasModel || STEPS[index].panel === 'files') props.current.onPrepare(STEPS[index]);
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
  useEffect(() => { if (screen) cardRef.current?.focus({ preventScroll: true }); }, [screen, step, installStep]);
  useEffect(() => { if (screen === 'install') saveProgress({ seen: true, installStep }); }, [screen, installStep]);

  // Use the real read-only popovers and editor shell, anchored to real cells.
  // Never click a business action or save demo input into the user's store.
  useEffect(() => {
    setDemoEditor(null); setDemoMissing(false);
    if (screen !== 'tour') return;
    if (!hasModel && STEPS[step].panel !== 'files') { setDemoMissing(true); return; }
    const lesson = STEPS[step];
    let target, attempts = 0, revealed = false;
    const timer = setInterval(() => {
      attempts++;
      if (lesson.reveal && !revealed) {
        const section = document.querySelector(lesson.reveal);
        if (!section) { if (attempts >= 30) { setDemoMissing(true); clearInterval(timer); } return; }
        section.scrollIntoView({ block: 'center', behavior: 'instant' });
        revealed = true;
        return;
      }
      const selector = lesson.hover || (lesson.demo === 'annotation' ? '.matrix-rank-cell' : null);
      if (!selector) { clearInterval(timer); return; }
      const found = visibleRect(selector, true);
      if (!found) {
        if (attempts >= 30) { setDemoMissing(true); clearInterval(timer); }
        return;
      }
      target = found.element;
      target.setAttribute('data-guide-demo-target', '');
      if (lesson.demo === 'annotation') {
        setDemoEditor({ anchor: target, keyword: target.dataset.matrixKeyword, date: target.dataset.matrixDate, rank: target.dataset.rank, original: '教学示例：今天调整竞价，明天观察排名变化。' });
      } else {
        const init = { bubbles: true, clientX: found.x + found.width / 2, clientY: found.y + found.height / 2 };
        target.dispatchEvent(new PointerEvent('pointerover', init));
        target.dispatchEvent(new MouseEvent('mouseover', init));
      }
      clearInterval(timer);
    }, 150);
    return () => {
      clearInterval(timer);
      if (target) {
        target.dispatchEvent(new PointerEvent('pointerout', { bubbles: true }));
        target.dispatchEvent(new MouseEvent('mouseout', { bubbles: true }));
        target.removeAttribute('data-guide-demo-target');
      }
    };
  }, [screen, step, hasModel]);

  useLayoutEffect(() => {
    if (screen !== 'tour') return;
    const place = () => {
      const card = cardRef.current;
      if (!card) return;
      const selectors = !hasModel && step === 0 ? ['[data-guide-add-model]'] : STEPS[step].selectors;
      const rects = selectors.map(selector => visibleRect(selector)).filter(Boolean);
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
  const noRank = screen === 'tour' && demoMissing;
  return createPortal(<>
    {screen === 'tour' && demoEditor && <AnnotationEditor key={`${step}-${demoEditor.keyword}`} preview editor={demoEditor} metric={STEPS[step].tab === 'sp' ? 'sp' : 'natural'} onSave={() => {}} onCancel={() => {}} />}
    {notice && <div className="guide-notice" role="status">{notice}</div>}
    {screen && <div className="guide-layer" data-usage-guide>
      {screen === 'tour' ? <svg className="guide-shade" width="100%" height="100%" aria-hidden="true"><defs><mask id="usage-guide-mask"><rect width="100%" height="100%" fill="white" />{layout.rects.map((r, i) => <rect key={i} {...r} rx="7" fill="black" />)}</mask></defs><rect width="100%" height="100%" fill="#102a469e" mask="url(#usage-guide-mask)" />{layout.rects.map((r, i) => <rect key={i} {...r} rx="7" fill="none" stroke="#30d6e7" strokeWidth="2" />)}</svg> : <div className="guide-dim" />}
      <section ref={cardRef} className={`guide-card ${screen === 'tour' ? 'guide-coach' : 'guide-center'}`} role="dialog" aria-modal="true" aria-labelledby="guide-title" tabIndex={-1} style={screen === 'tour' ? { left: layout.left, top: layout.top } : undefined}>
        <button className="guide-close" onClick={close} aria-label="退出使用指南"><X size={19} /></button>
        {screen === 'welcome' && <><span className="guide-symbol"><BookOpen /></span><div className="guide-kicker">欢迎使用 · Amazon关键词每日跟进-v3.0</div><h1 id="guide-title">一步一演示，<br />跟着页面，学会日常操作。</h1><p>从选择产品到看排名，一步一步带你熟悉常用功能。</p><div className="guide-mini"><span>① 选择产品</span><span>② 导入数据</span><span>③ 查看排名</span></div><div className="guide-tip">共 {STEPS.length} 步，可以随时退出。以后点击右上角「使用指南」重看。</div><div className="guide-actions"><button onClick={close}>暂时跳过</button><button className="guide-primary" onClick={() => tour()}>开始引导 <ArrowRight size={16} /></button></div></>}
        {screen === 'hub' && <><div className="guide-kicker">需要时，随时回来</div><h1 id="guide-title">使用指南</h1><p>从头学习，或只看你现在需要的内容。</p><div className="guide-start-row"><button className="guide-primary" onClick={() => tour()}>重新开始完整引导 <span>{STEPS.length} 步 →</span></button>{!progress.completed && Number.isInteger(progress.step) && progress.step > 0 && <button onClick={() => tour(Math.min(STEPS.length - 1, progress.step))}>继续第 {progress.step + 1} 步</button>}</div><div className="guide-plugin"><strong><Puzzle size={17} />下载与安装 SIF 插件</strong><p>自动导入前先安装 · Chrome / Edge · 6 步完成{window.__SIF_EXTENSION_PACKAGE__?.version ? ` · v${window.__SIF_EXTENSION_PACKAGE__.version}` : ''}</p><button onClick={download}><Download size={14} />下载插件 ZIP</button><button onClick={() => install()}>查看安装教程 →</button>{Number.isInteger(progress.installStep) && progress.installStep > 0 && <button onClick={() => { setInstallReturn('hub'); setInstallStep(Math.min(5, progress.installStep)); setConnection('idle'); setMessage(''); setScreen('install'); }}>继续安装第 {progress.installStep + 1} 步</button>}</div><div className="guide-topics">{TOPICS.map((item, i) => <button key={item.title} onClick={() => tour(item.step)}><strong>{item.title} →</strong><small>{item.sub}</small></button>)}</div><div className="guide-tip">日常顺序：选择产品 → 导入数据 → 查看排名 → 记录操作。</div></>}
        {screen === 'tour' && <><div className="guide-kicker">快速上手 · 第 {step + 1} / {STEPS.length} 步</div><h2 id="guide-title">{!hasModel && step === 0 ? '先添加你的第一个产品' : current.title}</h2><p>{!hasModel && step === 0 ? '目前没有启用的产品。结束教学后，点击「新增型号」填写产品名称、父体 ASIN 和站点。' : current.text}</p>{noRank && <div className="guide-example"><small>当前产品暂无可演示的数据</small><div>已定位到对应页面。导入报表后，可从使用指南重看本步骤。</div></div>}<div className="guide-tip">{current.hint}{current.action === 'importBackup' && <button className="guide-inline" onClick={() => { saveProgress({ completed: true, step: 0 }); close(); onOpenBackup(); }}>结束教学，前往导入 →</button>}{step === 1 && <button className="guide-inline" onClick={() => install('tour')}>还没安装？先看安装教程 →</button>}</div><div className="guide-dots" aria-hidden="true">{STEPS.map((_, i) => <i key={i} className={i <= step ? 'is-done' : ''} />)}</div><div className="guide-footer"><button className="guide-text" onClick={close}>退出引导</button><div>{step > 0 && <button onClick={() => tour(step - 1)}>上一步</button>}<button className="guide-primary" onClick={() => step === STEPS.length - 1 ? finish() : tour(step + 1)}>{step === STEPS.length - 1 ? '完成' : '下一步 →'}</button></div></div></>}
        {screen === 'install' && <><div className="guide-kicker">插件安装 · 第 {installStep + 1} / 6 步</div><div className="guide-browsers">{['Chrome', 'Edge'].map(value => <button key={value} aria-pressed={browser === value} onClick={() => { setBrowser(value); setMessage(''); }}>{value}</button>)}</div><h1 id="guide-title">{installTitles[installStep]}</h1>
          {installStep === 0 && <><p>下载与当前软件配套的 SIF 在线版扩展 ZIP。也可以从「工具文件夹 → 下载 SIF 在线版扩展」下载。</p><button className="guide-primary" onClick={download}><Download size={16} />下载插件 ZIP</button><div className="guide-tip">已有随包的 sif-batch-reverse-downloader 文件夹？<button className="guide-inline" onClick={() => setInstallStep(2)}>直接看第 3 步：加载插件 →</button></div></>}
          {installStep === 1 && <><p>在下载目录中找到 ZIP，右键选择「全部解压」。安装时要选择解压后的文件夹。</p><div className="guide-folder">📁 sif-batch-reverse-downloader<br />　├ manifest.json <b>← 选择这一层文件夹</b><br />　├ background.js<br />　└ content.js …</div><div className="guide-tip">不要直接选择 ZIP。安装后保留这个文件夹，不要移动或删除。</div></>}
          {installStep === 2 && <><ol className="guide-list"><li>打开下面的扩展管理页。</li><li>开启「{edge ? '开发人员模式' : '开发者模式'}」。</li><li>点击「{edge ? '加载解压缩的扩展' : '加载已解压的扩展程序'}」。</li><li>选择包含 manifest.json 的插件文件夹。</li></ol><div className="guide-address"><code>{edge ? 'edge://extensions/' : 'chrome://extensions/'}</code><button onClick={copyAddress}><Copy size={14} />复制地址</button></div><div className="guide-tip">复制后，粘贴到浏览器地址栏打开。浏览器内部页面需要你手动操作。</div></>}
          {installStep === 3 && <><p>在扩展卡片点击「详情」，找到并开启「允许访问文件网址」。</p><div className="guide-permission"><small>开关位置示意 · 需在浏览器扩展详情中手动开启</small><div><strong>允许访问文件网址</strong><span aria-hidden="true"><i /></span></div></div><div className="guide-tip">{location.protocol === 'file:' ? '你正在使用本地 HTML，需要开启此权限。' : '通过 localhost 打开时可跳过；双击 index.html 使用时需要开启。'}</div></>}
          {installStep === 4 && <><p>在安装插件的同一个浏览器、同一个用户配置中打开 SIF，并完成登录。</p><a className="guide-primary" href="https://www.sif.com/" target="_blank" rel="noopener noreferrer">打开 SIF →</a><div className="guide-tip">插件能连接软件，并不代表 SIF 已登录。请在 SIF 页面确认登录状态。</div></>}
          {installStep === 5 && <><p>刚安装扩展后，请先刷新关键词软件，再从「使用指南」进入本步骤检查连接。</p><div className={`guide-connection guide-connection-${connection}`} role="status"><strong>{({ idle: '○ 待检查', checking: '正在检查插件连接…', connected: '✓ 插件已连接当前页面', missing: '未检测到插件连接', error: '检查失败，请重试' })[connection]}</strong><button className="guide-primary" disabled={connection === 'checking'} onClick={check}>{connection === 'checking' ? '检查中…' : '检查插件连接'}</button></div>{['missing', 'error'].includes(connection) && <ol className="guide-list"><li>插件是否启用、是否安装在当前浏览器配置中？</li><li>本地 HTML 使用时，是否允许访问文件网址？</li><li>刷新当前软件后，再检查一次。</li></ol>}<div className="guide-tip">连接成功后，可以手动尝试「导入当前产品」（包含关联竞品）。若导入失败，再检查 SIF 登录与多文件下载权限。</div></>}
          <div className="guide-footer"><button onClick={() => installReturn === 'tour' ? tour(step) : hub()}>{installReturn === 'tour' ? '返回导入教学' : '返回目录'}</button><div>{installStep > 0 && <button onClick={() => { setInstallStep(installStep - 1); setMessage(''); }}>上一步</button>}<button className="guide-primary" onClick={() => { setMessage(''); if (installStep < 5) setInstallStep(installStep + 1); else if (installReturn === 'tour') tour(step); else hub(); }}>{installStep === 5 ? '完成教程' : '下一步 →'}</button></div></div>
        </>}
        {screen === 'done' && <><span className="guide-symbol"><Check /></span><h1 id="guide-title">可以开始今天的跟进了</h1><p>选择产品 → 导入数据 → 查看排名 → 记录操作。</p><div className="guide-tip">需要帮助时，右上角「使用指南」随时都在。</div><div className="guide-actions"><button onClick={hub}>查看其他用法</button><button className="guide-primary" onClick={close}>开始使用</button></div></>}
        {message && <p className="guide-message" role="status">{message}</p>}
      </section>
    </div>}
  </>, document.body);
}
