#!/usr/bin/env python3
"""Gmail RAW 응답(JSON 파일)에서 첨부 파일을 꺼내 저장한다.
사용: python3 -I extract-mail.py <raw-json-file> <out-dir>"""
import json, base64, email, sys, os
from email import policy
raw_file, out_dir = sys.argv[1], sys.argv[2]
os.makedirs(out_dir, exist_ok=True)
d = json.load(open(raw_file))
raw = base64.urlsafe_b64decode(d['raw'] + '=' * (-len(d['raw']) % 4))
msg = email.message_from_bytes(raw, policy=policy.default)
for part in msg.walk():
    fn = part.get_filename()
    if fn:
        data = part.get_payload(decode=True)
        path = os.path.join(out_dir, os.path.basename(fn))
        open(path, 'wb').write(data)
        print(path, len(data), part.get_content_type())
