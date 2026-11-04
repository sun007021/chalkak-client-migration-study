#!/usr/bin/env python3
"""shared/design/fonts 의 otf/ttf 를 src/assets/fonts 의 woff2 로 변환한다(fonttools + brotli 필요).
사용: pip install fonttools brotli && npm run gen:fonts
"""
import pathlib
from fontTools.ttLib import TTFont

root = pathlib.Path(__file__).resolve().parents[3]
src = root / "shared" / "design" / "fonts"
dst = root / "web" / "src" / "assets" / "fonts"
dst.mkdir(parents=True, exist_ok=True)
for f in sorted(src.iterdir()):
    if f.suffix.lower() not in (".otf", ".ttf"):
        continue
    font = TTFont(str(f))
    font.flavor = "woff2"
    font.save(str(dst / (f.stem + ".woff2")))
    print("converted", f.name)
