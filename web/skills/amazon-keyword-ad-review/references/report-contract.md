# 可导入结果格式 v1

输出纯UTF-8 JSON（非Markdown代码块），type固定keyword-ad-review、schemaVersion为1。以下是合成示例，不是911建议；替换所有产品、日期、目标、词条和证据。无证据不要复制示例金额。

```json
{
  "type": "keyword-ad-review",
  "schemaVersion": 1,
  "runId": "CA-20260921-monday-am-unique-id",
  "analysisDate": "2026-09-21",
  "slot": "monday_am",
  "dataStart": "2026-08-22",
  "dataEnd": "2026-09-20",
  "summary": "按产品归纳机会、风险、预算合计和待核实项。",
  "sources": ["网页备份.json", "领星30天广告.xlsx"],
  "goals": [{
    "countryCode": "CA", "parentAsin": "B0DEMO0001",
    "confirmed": true, "confirmedAt": "2026-09-21T01:00:00Z",
    "text": "记录用户本轮实际确认的目标、预算周期、币种、ABA口径、时区和未定项；禁止自动伪造确认。"
  }],
  "items": [{
    "itemId": "demo-1", "countryCode": "CA", "parentAsin": "B0DEMO0001", "keyword": "demo jacket",
    "strategy": "排名优先",
    "recommendation": "示例：数据不足，暂维持并补齐真实出价记录。",
    "evidence": "分别列7/30天花费、点击、订单、销售、CPC、ACoS；实际bid阶段及排名观察日期、人工标注；明确缺失和矛盾。",
    "confidence": "低：缺少可比样本",
    "review": "周四核对执行日期与新增成熟订单；满足已确认止损条件时撤回。",
    "budget": "上限周期未定，暂不提供金额分配。",
    "dayparting": "仅有日明细，不能判断小时转化率；暂不设置小时停投。",
    "actions": [{
      "campaign": "示例活动", "adGroup": "示例组", "match": "exact",
      "instruction": "待核实当前基础bid后再决定；不是把CPC当成bid。",
      "currentBid": null, "proposedBid": null, "bidDate": null
    }]
  }]
}
```

slot只能monday_am或thursday_pm。补跑可在summary说明实际运行时间；不能伪造周一/周四日期。runId不可复用覆盖旧内容；同ID同内容重复导入不清除采纳状态。数据起止不可晚于analysisDate。

每个产品一个goals条目；每个产品+规范关键词一个item；itemId全批次唯一。actions按活动/组/匹配拆分；无可执行动作可用空数组。currentBid/proposedBid必须为非负数字或null，有数字时bidDate必须是实际基准日期且不晚于dataEnd，币种写入目标和行动说明。所有文字字段必填，缺数据写明缺口。

严格匹配备份configs内站点+父ASIN（含legacyParentAsins）及watches内该产品启用的精确关键词，不按产品名称模糊分配。不要输出accepted或用户决策；网页自行维护。导入有未匹配项时整体阻止，先修正报告，不部分悄悄丢词。

矩阵角标位于数据截止日前最近的矩阵日期，只是报告入口，不表示该日期有新增真实排名测量。一个格有多轮时显示最新批次状态，双击可看该词全部历史。
