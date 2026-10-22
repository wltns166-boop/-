#!/usr/bin/env python3
"""추출한 명세서 행을 가계부 cardTx 문서에 중복 없이 합친다.
사용: python3 -I merge-cardtx.py <cardTx.json(ArtifactData get 결과)> <rows.json> <cardId> <periodStart> <out.json>
rows.json: {"rows":[{"date":"26. 9. 14" 또는 "2026-09-14", "desc":"가맹점", "amount":"4,600"}]}
periodStart: 카드 사용기간 시작일(1~31). 날짜의 일이 시작일 이상이면 다음 달 청구."""
import json, re, sys, time, random, string
src, rows_file, card, start, out = sys.argv[1], sys.argv[2], sys.argv[3], int(sys.argv[4]), sys.argv[5]
d = json.load(open(src)); doc = d.get('data') or d; cur = doc['v']
rows = json.load(open(rows_file))['rows']
def ymadd(ym, n):
    y, m = map(int, ym.split('-')); m += n
    while m > 12: m -= 12; y += 1
    return f"{y}-{m:02d}"
def bill(date):
    return ymadd(date[:7], 1) if start > 1 and int(date[8:10]) >= start else date[:7]
def uid():
    return format(int(time.time() * 1000), 'x')[-8:] + ''.join(random.choices(string.ascii_lowercase + string.digits, k=5))
def norm_date(s):
    m = re.search(r'(\d{4})[-./]\s*(\d{1,2})[-./]\s*(\d{1,2})', s) or re.search(r'(\d{2})[-./]\s*(\d{1,2})[-./]\s*(\d{1,2})', s)
    y = m.group(1); y = y if len(y) == 4 else '20' + y
    return f"{y}-{int(m.group(2)):02d}-{int(m.group(3)):02d}"
key = lambda t: (t['cardId'], t['date'], re.sub(r'\s+', '', str(t.get('desc', ''))), int(t['amount']))
existing = {key(t) for t in cur}
new, dup = [], 0
for r in rows:
    date = norm_date(r['date'])
    t = {'id': uid(), 'cardId': card, 'date': date, 'desc': str(r['desc'])[:40], 'amount': int(re.sub(r'[^\d-]', '', str(r['amount']))), 'billMonth': bill(date)}
    if t['amount'] <= 0 or key(t) in existing: dup += 1; continue
    existing.add(key(t)); new.append(t)
merged = cur + new
merged.sort(key=lambda t: t['date'], reverse=True)
json.dump({'v': merged, 'at': int(time.time() * 1000)}, open(out, 'w'), ensure_ascii=False)
print(json.dumps({'existing': len(cur), 'new': len(new), 'skipped': dup, 'newSum': sum(t['amount'] for t in new), 'billMonths': sorted({t['billMonth'] for t in new})}, ensure_ascii=False))
