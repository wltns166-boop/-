#!/usr/bin/env python3
"""현대카드 보안메일을 푼 HTML에서 결제 상세 내역(일시불)만 rows.json으로 추출.
사용: python3 -I hyundai-rows.py <풀린 html> <명세서 연도(예 2026)> <out.json>
대출 원리금 상환(원리금균등상환) 행은 카드 사용이 아니므로 제외하고 따로 출력한다."""
import re, json, sys
src, year, out = sys.argv[1], sys.argv[2], sys.argv[3]
s = open(src, encoding='utf-8', errors='replace').read()
t = re.sub(r'<script.*?</script>', '', s, flags=re.S); t = re.sub(r'<[^>]+>', '|', t); t = t.replace('&nbsp;', ' ')
t = re.sub(r'(\|\s*)+', '|', t); t = re.sub(r'\s+', ' ', t)
seg = t[t.find('결제 상세 내역'):]
cells = [c.strip() for c in seg.split('|')]
rows, loans, i = [], [], 0
while i < len(cells):
    if re.fullmatch(r'\d{2}\.\d{2}', cells[i]) and i + 10 < len(cells):
        date, card, desc, amt = cells[i:i + 4]
        (loans if ('원리금' in desc or '상환' in desc) else rows).append({'date': f'{year}-' + date.replace('.', '-'), 'desc': desc, 'amount': amt, 'card': card})
        i += 11
    else:
        i += 1
json.dump({'header': '현대카드 명세서', 'rows': rows, 'loans': loans}, open(out, 'w'), ensure_ascii=False)
print(json.dumps({'rows': len(rows), 'sum': sum(int(r['amount'].replace(',', '')) for r in rows), 'loans': len(loans)}, ensure_ascii=False))
