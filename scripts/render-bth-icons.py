#!/usr/bin/env python3
"""Render the chosen BTH logo at PWA sizes, from its original 192px PNG.

Run with: python -m pip install Pillow==12.3.0
          python scripts/render-bth-icons.py
No network, model or other image services required while rendering.
The vector files under travel/icons/src are editable traces of the artwork.
"""
from pathlib import Path
from PIL import Image
ROOT = Path(__file__).resolve().parent.parent / "travel" / "icons"
original = Image.open(ROOT / "icon-192.png").convert("RGBA")
if original.size != (192, 192):
    raise SystemExit("Expected the user-selected 192x192 BTH source.")
normal = original.resize((512, 512), Image.Resampling.BICUBIC)
normal.quantize(colors=16, method=Image.Quantize.FASTOCTREE,
                dither=Image.Dither.NONE).save(
    ROOT / "icon-512.png", format="PNG", optimize=True, compress_level=9)
maskable = Image.new("RGBA", (512, 512), (23, 77, 58, 255))
maskable.alpha_composite(normal)
# Full bleed, fully opaque maskable icon (not a rounded transparent square).
maskable.convert("RGB").quantize(colors=16, dither=Image.Dither.NONE).save(
    ROOT / "icon-maskable-512.png", format="PNG", optimize=True, compress_level=9)
for name in ("icon-192.png", "icon-512.png", "icon-maskable-512.png"):
    i = Image.open(ROOT / name)
    print(f"{name}: {i.size[0]}x{i.size[1]} ({(ROOT/name).stat().st_size} bytes)")
