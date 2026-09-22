/* Shared, dependency-free import contract. Also used by the Skill validator. */
(function (root) {
  'use strict';
  const key = value => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
  const fail = message => { throw new Error(message); };
  const str = (v, label, max = 20000) => typeof v === 'string' && v.trim() && v.length <= max ? v.trim() : fail(`${label} 缺失或过长`);
  const date = (v, label) => /^\d{4}-\d{2}-\d{2}$/.test(v || '') && new Date(v).toISOString().slice(0, 10) === v ? v : fail(`${label} 日期无效`);
  function validate(input) {
    if (!input || input.type !== 'keyword-ad-review' || input.schemaVersion !== 1) fail('请选择 Skill 生成的 keyword-ad-review v1 分析结果，不是网页备份或广告报表。');
    const report = {
      type: input.type, schemaVersion: 1,
      runId: str(input.runId, 'runId', 120),
      analysisDate: date(input.analysisDate, '分析日期'),
      slot: input.slot,
      dataStart: date(input.dataStart, '数据起始'), dataEnd: date(input.dataEnd, '数据截止'),
      summary: str(input.summary, '分析摘要'),
      sources: input.sources,
      goals: input.goals,
      items: [],
    };
    if (!['monday_am', 'thursday_pm'].includes(report.slot)) fail('分析批次必须为 monday_am 或 thursday_pm');
    if (report.dataStart > report.dataEnd || report.dataEnd > report.analysisDate) fail('数据窗口不能倒置或晚于分析日期');
    if (!Array.isArray(report.sources) || !report.sources.length || report.sources.length > 100) fail('缺少来源文件');
    report.sources = report.sources.map(s => str(s, '来源', 500));
    if (!Array.isArray(report.goals) || !report.goals.length || report.goals.length > 1000) fail('缺少本次已确认的产品目标');
    report.goals = report.goals.map(g => {
      if (g.confirmed !== true || !Number.isFinite(Date.parse(g.confirmedAt))) fail('每次分析必须先确认各产品目标并记录 confirmedAt');
      return { countryCode: str(g.countryCode, '站点', 8).toUpperCase(), parentAsin: str(g.parentAsin, '父ASIN', 20).toUpperCase(), confirmed: true, confirmedAt: g.confirmedAt, text: str(g.text, '产品目标') };
    });
    const goalKeys = report.goals.map(g => `${g.countryCode}|${g.parentAsin}`);
    if (new Set(goalKeys).size !== goalKeys.length) fail('产品目标重复');
    if (!Array.isArray(input.items) || !input.items.length || input.items.length > 5000) fail('分析词条须为1–5000条');
    const ids = new Set(), identities = new Set();
    for (const raw of input.items) {
      const item = { itemId: str(raw.itemId, '词条ID', 160), countryCode: str(raw.countryCode, '站点', 8).toUpperCase(), parentAsin: str(raw.parentAsin, '父ASIN', 20).toUpperCase(), keyword: str(raw.keyword, '关键词', 500), strategy: str(raw.strategy, '策略', 500), recommendation: str(raw.recommendation, '建议'), evidence: str(raw.evidence, '证据'), confidence: str(raw.confidence, '置信度', 100), review: str(raw.review, '复盘条件'), budget: str(raw.budget, '预算建议/缺口'), dayparting: str(raw.dayparting, '时段建议/缺口'), actions: [] };
      const identity = `${item.countryCode}|${item.parentAsin}|${key(item.keyword)}`;
      if (ids.has(item.itemId) || identities.has(identity)) fail('同一批次存在重复词条ID或产品关键词');
      if (!goalKeys.includes(`${item.countryCode}|${item.parentAsin}`)) fail(`缺少 ${item.parentAsin} 的本次确认目标`);
      ids.add(item.itemId); identities.add(identity);
      if (!Array.isArray(raw.actions) || raw.actions.length > 100) fail('actions 必须为数组（无可执行动作时用空数组）');
      item.actions = raw.actions.map(a => {
        const action = { campaign: str(a.campaign, '广告活动', 500), adGroup: str(a.adGroup, '广告组', 500), match: str(a.match, '匹配方式', 100), instruction: str(a.instruction, '行动说明'), currentBid: a.currentBid, proposedBid: a.proposedBid, bidDate: a.bidDate };
        for (const n of ['currentBid', 'proposedBid']) if (action[n] !== null && (typeof action[n] !== 'number' || !Number.isFinite(action[n]) || action[n] < 0)) fail(`${n} 必须为非负数或null`);
        if (action.currentBid !== null || action.proposedBid !== null) date(action.bidDate, '竞价基准日期');
        if (action.bidDate && action.bidDate > report.dataEnd) fail('竞价日期晚于数据截止');
        return action;
      });
      report.items.push(item);
    }
    return report;
  }
  function preview(input, configs, watches, reports = []) {
    const report = validate(input);
    const existing = reports.find(r => r.runId === report.runId);
    if (existing && JSON.stringify(validate(existing)) !== JSON.stringify(report)) fail('同一批次ID已有不同内容，请由 Agent 使用新的 runId，原报告与采纳记录不会覆盖。');
    const matches = report.items.map(item => {
      const candidates = configs.filter(c => (c.countryCode || 'CA').toUpperCase() === item.countryCode && [c.parentAsin, ...(c.legacyParentAsins || [])].includes(item.parentAsin));
      const config = candidates.length === 1 ? candidates[0] : null;
      const watched = config && watches.some(w => w.modelName === config.modelName && w.enabled !== false && key(w.keyword) === key(item.keyword));
      return { itemId: item.itemId, keyword: item.keyword, parentAsin: item.parentAsin, modelName: config?.modelName || '', matched: Boolean(watched), reason: !config ? '站点/父ASIN未唯一匹配自有产品' : !watched ? '不是该产品已启用关注词' : '已匹配' };
    });
    return { report, duplicate: Boolean(existing), matches, valid: matches.every(m => m.matched) };
  }
  function entries(state, model, keyword) {
    if (!model || model.kind === 'competitor') return [];
    return (state?.reports || []).flatMap(report => report.items.filter(i => i.countryCode === (model.countryCode || 'CA') && [model.parentAsin, ...(model.legacyParentAsins || [])].includes(i.parentAsin) && (!keyword || key(i.keyword) === key(keyword))).map(item => ({ report, item, accepted: (state.decisions || []).some(d => d.runId === report.runId && d.itemId === item.itemId && d.accepted === true) }))).sort((a,b) => b.report.analysisDate.localeCompare(a.report.analysisDate) || b.report.slot.localeCompare(a.report.slot) || b.report.runId.localeCompare(a.report.runId));
  }
  function anchor(report, dates) { return dates.filter(d => d <= report.dataEnd).sort().at(-1) || null; }
  const core = { key, validate, preview, entries, anchor, label: slot => slot === 'monday_am' ? '周一上午' : '周四下午' };
  root.AdReviewCore = core;
  if (typeof module !== 'undefined') module.exports = core;
})(globalThis);
