#!/usr/bin/env bash
# 특약 교육 영상 전체 빌드: 내레이션 → 오디오 믹스 → 영상 렌더 (3개씩 병렬)
# 사용법: ./build_all.sh <작업폴더>   (결과: ../videos/NN-<id>.mp4)
set -euo pipefail
cd "$(dirname "$0")"
WORK="${1:?작업 폴더를 지정하세요}"
OUT="$(cd .. && pwd)/videos"
mkdir -p "$OUT"
python3 build_audio.py "$WORK"
python3 mix_audio.py "$WORK"/*/
python3 - "$WORK" <<'PY' | xargs -P 3 -L 1 bash -c 'node render.js "$0" "$1" 30'
import json, os, sys
work = sys.argv[1]
for c in json.load(open("../riders.json", encoding="utf-8"))["categories"]:
    print(os.path.join(work, c["id"]), os.path.join("..", "videos", f"{c['no']:02d}-{c['id']}.mp4"))
PY
# 미리보기 이미지(포스터): 각 영상의 인트로 화면
for f in "$OUT"/*.mp4; do
  ffmpeg -v error -y -ss 7 -i "$f" -frames:v 1 -vf scale=1280:-2 -q:v 4 "${f%.mp4}.jpg"
done
ls -la "$OUT"
