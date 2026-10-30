"""내레이션 + 잔잔한 배경음(합성 패드) + 퀴즈 정답 효과음을 섞어 mix.wav 를 만든다.

사용법:  python3 mix_audio.py <작업폴더/카테고리id> [...]
"""
import json
import os
import subprocess
import sys
import wave

import numpy as np

SR = 48000
CHORDS = [  # Cmaj7 · Am7 · Fmaj7 · G6 (한 옥타브 낮게)
    [130.8, 164.8, 196.0, 246.9],
    [110.0, 130.8, 164.8, 196.0],
    [87.3, 110.0, 130.8, 164.8],
    [98.0, 123.5, 146.8, 196.0],
]
CHORD_SEC = 4.0


def pad(duration):
    n = int(round(duration * SR))
    t = np.arange(n) / SR
    out = np.zeros(n)
    seg = int(CHORD_SEC * SR)
    fade = int(0.8 * SR)
    for start in range(0, n, seg):
        idx = (start // seg) % len(CHORDS)
        end = min(n, start + seg + fade)
        tt = t[start:end]
        tone = sum(np.sin(2 * np.pi * f * tt) + 0.25 * np.sin(4 * np.pi * f * tt) for f in CHORDS[idx])
        env = np.ones(end - start)
        a = min(fade, end - start)
        env[:a] = np.linspace(0, 1, a)
        if end - start > seg:
            env[seg:] = np.linspace(1, 0, end - start - seg)
        out[start:end] += tone * env
    out *= 0.85 + 0.15 * np.sin(2 * np.pi * 0.11 * t)   # 느린 숨결
    out /= np.max(np.abs(out)) + 1e-9
    out *= 0.045                                          # 아주 작게
    f = min(n, int(2.5 * SR))
    out[:f] *= np.linspace(0, 1, f)
    out[-f:] *= np.linspace(1, 0, f)
    return out


def chime(n, at):
    out = np.zeros(n)
    s = int(at * SR)
    ln = int(1.2 * SR)
    tt = np.arange(ln) / SR
    tone = (np.sin(2 * np.pi * 1046.5 * tt) + 0.6 * np.sin(2 * np.pi * 1568 * tt)) * np.exp(-tt * 4.5)
    e = min(n, s + ln)
    out[s:e] += 0.16 * tone[:e - s]
    return out


def read_wav(path):
    with wave.open(path) as w:
        data = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float64) / 32768
    return data


def main(d):
    tl = json.load(open(os.path.join(d, "timeline.json"), encoding="utf-8"))
    voice = read_wav(os.path.join(d, "narration.wav"))
    n = max(len(voice), int(round(tl["duration"] * SR)))
    voice = np.pad(voice, (0, n - len(voice)))
    mix = voice + pad(n / SR)
    for sc in tl["scenes"]:
        if sc["type"] == "quiz":
            mix += chime(n, sc["start"] + sc["sentences"][-1]["at"] - 0.25)
    mix = np.clip(mix, -1, 1)
    raw = os.path.join(d, "mix_raw.wav")
    with wave.open(raw, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((mix * 32767).astype(np.int16).tobytes())
    subprocess.check_call(["ffmpeg", "-v", "error", "-y", "-i", raw,
                           "-af", "loudnorm=I=-14:TP=-1.0:LRA=11", "-ar", str(SR), "-ac", "2",
                           os.path.join(d, "mix.wav")])
    print("mixed", tl["id"])


if __name__ == "__main__":
    for d in sys.argv[1:]:
        main(d)
