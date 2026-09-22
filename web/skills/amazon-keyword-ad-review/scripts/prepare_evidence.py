"""Read-only evidence extraction. No goal confirmation or bid recommendations."""
import argparse
import datetime as dt
import hashlib
import json
from collections import defaultdict
from pathlib import Path
import openpyxl

FIELDS = ['曝光量', '点击', '花费', '广告订单', '广告销售额', '直接订单', '直接销售额']
IDENTITY = ['广告活动', '广告组', '关键词', '匹配方式']

def aggregate(rows):
    out = {k: sum(float(r[k] or 0) for r in rows) if rows and all(k in r for r in rows) else None for k in FIELDS}
    for name, num, den in [('CPC', '花费', '点击'), ('ACoS', '花费', '广告销售额'), ('CVR', '广告订单', '点击'), ('CTR', '点击', '曝光量')]:
        out[name] = out[num] / out[den] if out[num] is not None and out[den] else None
    out['daysWithRows'] = len({r['日期'] for r in rows})
    return out

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--backup', required=True, type=Path)
    parser.add_argument('--ads', nargs='+', required=True, type=Path)
    parser.add_argument('--out', required=True, type=Path)
    args = parser.parse_args()
    if args.out.exists():
        raise ValueError('输出目录已存在，请选择新目录，避免覆盖证据')
    backup = json.loads(args.backup.read_text(encoding='utf-8-sig'))
    rows, sheets, seen = [], [], set()
    for file in args.ads:
        workbook = openpyxl.load_workbook(file, read_only=True, data_only=True)
        for sheet in workbook:
            iterator = sheet.iter_rows(values_only=True)
            header = None
            for line, values in enumerate(iterator, 1):
                cells = [str(v).strip() if v is not None else '' for v in values]
                if '关键词' in cells and '日期' in cells:
                    header = cells
                    break
                if line >= 20:
                    break
            if not header:
                sheets.append({'file':file.name, 'sheet':sheet.title, 'skipped':'未找到日期/关键词表头'})
                continue
            missing = [k for k in IDENTITY + ['日期', '每日竞价', '花费', '点击', '广告订单', '广告销售额'] if k not in header]
            if missing:
                raise ValueError(f'{file.name}/{sheet.title} 缺少列 {missing}')
            if len([x for x in header if x]) != len(set(x for x in header if x)):
                raise ValueError('存在重复列名，请核实源表')
            sheets.append({'file':file.name, 'sheet':sheet.title, 'headers':header})
            for source_row, values in enumerate(iterator, line + 1):
                if not any(v is not None for v in values):
                    continue
                row = {h:v for h,v in zip(header, values) if h}
                value = row['日期']
                row['日期'] = value.date().isoformat() if isinstance(value, dt.datetime) else value.isoformat() if isinstance(value, dt.date) else str(value).strip()
                dt.date.fromisoformat(row['日期'])
                fingerprint = json.dumps(row, ensure_ascii=False, sort_keys=True, default=str)
                if fingerprint in seen:
                    raise ValueError(f'检测到完全重复广告行 {file.name}/{sheet.title}/{source_row}，请去掉重叠导出后重试')
                seen.add(fingerprint)
                row['_source'] = {'file':file.name, 'sheet':sheet.title, 'row':source_row}
                rows.append(row)
        workbook.close()
    if not rows:
        raise ValueError('没有有效的关键词每日广告行')
    end = dt.date.fromisoformat(max(r['日期'] for r in rows))
    windows = {'last30':(end-dt.timedelta(days=29), end), 'last7':(end-dt.timedelta(days=6), end), 'previous7':(end-dt.timedelta(days=13), end-dt.timedelta(days=7))}
    groups = defaultdict(list)
    for row in rows:
        # Product ownership is deliberately unresolved: campaign names alone are insufficient.
        groups[tuple(str(row[k] or '').strip() for k in IDENTITY)].append(row)
    targets = []
    for identity, records in groups.items():
        targets.append({**dict(zip(IDENTITY, identity)), 'productMapping':'待核实', 'windows':{name:aggregate([r for r in records if start.isoformat() <= r['日期'] <= stop.isoformat()]) for name,(start,stop) in windows.items()}, 'dailyRows':sorted(records, key=lambda r:r['日期'])})
    products = []
    for config in backup['configs']:
        watches = [w for w in backup.get('watches', []) if w['modelName'] == config['modelName'] and w.get('enabled') is not False]
        products.append({'config':config, 'watches':watches, 'goalConfirmed':False})
    output = {'sources':[{'file':p.name, 'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in [args.backup]+args.ads], 'windows':{k:[a.isoformat(),b.isoformat()] for k,(a,b) in windows.items()}, 'sheets':sheets, 'products':products, 'targets':targets, 'warnings':['产品归属尚未确认；按备份原始真实排名日期单独对齐', '小时转化与预算限制无法由日明细推断', '每日竞价不是CPC；7天包含在30天内']}
    args.out.mkdir(parents=True)
    (args.out/'evidence.json').write_text(json.dumps(output, ensure_ascii=False, indent=2, default=str), encoding='utf-8')
    print(json.dumps({'rows':len(rows), 'targets':len(targets), 'products':len(products), 'out':str(args.out)}, ensure_ascii=False))

if __name__ == '__main__':
    main()
