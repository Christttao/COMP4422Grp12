#!/usr/bin/env python3
"""Generate the M2 UV checker texture.

The image is authored for this project (no third-party artwork), so it is
redistributed with the repository. Rendered at 2048 px and downsampled to
1024 px for clean antialiased edges.

Usage:  python tools/generate_texture.py assets/textures/uv-checker-1024.png
"""
from __future__ import annotations

import os
import sys

from PIL import Image, ImageDraw, ImageFont

SIZE = 1024
SS = 2  # supersampling factor
S = SIZE * SS

BG_DARK = (96, 112, 134)
BG_LIGHT = (178, 196, 216)
GRID_MINOR = (222, 232, 242)
GRID_MAJOR = (140, 205, 255)
CYAN = (0, 188, 212)
MAGENTA = (236, 64, 122)
YELLOW = (255, 193, 7)
GREEN = (76, 175, 80)
INK = (18, 26, 38)
MUTED = (55, 70, 88)


def font(size: int, bold: bool = True) -> ImageFont.FreeTypeFont:
    candidates = [
        r"C:\Windows\Fonts\arialbd.ttf" if bold else r"C:\Windows\Fonts\arial.ttf",
        r"C:\Windows\Fonts\segoeuib.ttf" if bold else r"C:\Windows\Fonts\segoeui.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold
        else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    ]
    for path in candidates:
        if os.path.exists(path):
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def main(out_path: str) -> None:
    img = Image.new("RGB", (S, S), BG_DARK)
    d = ImageDraw.Draw(img)

    # 8 x 8 checkerboard (128 px cells at final resolution).
    cell = S // 8
    for y in range(8):
        for x in range(8):
            colour = BG_LIGHT if (x + y) % 2 else BG_DARK
            d.rectangle([x * cell, y * cell, (x + 1) * cell - 1, (y + 1) * cell - 1], fill=colour)

    # Orientation bands: top=cyan, right=magenta, bottom=yellow, left=green.
    band = 26 * SS
    d.rectangle([0, 0, S - 1, band - 1], fill=CYAN)
    d.rectangle([S - band, 0, S - 1, S - 1], fill=MAGENTA)
    d.rectangle([0, S - band, S - 1, S - 1], fill=YELLOW)
    d.rectangle([0, 0, band - 1, S - 1], fill=GREEN)

    # Grid lines, every 4th one emphasised.
    for i in range(9):
        p = i * cell
        major = i % 4 == 0
        colour = GRID_MAJOR if major else GRID_MINOR
        width = (4 if major else 1) * SS
        d.line([(p, 0), (p, S)], fill=colour, width=width)
        d.line([(0, p), (S, p)], fill=colour, width=width)

    # Corner triangles make mirroring / rotation immediately visible.
    tri = 118 * SS
    d.polygon([(0, 0), (tri, 0), (0, tri)], fill=(30, 40, 55))
    d.polygon([(S - 1, 0), (S - 1 - tri, 0), (S - 1, tri)], fill=(255, 120, 60))
    d.polygon([(0, S - 1), (tri, S - 1), (0, S - 1 - tri)], fill=(60, 140, 255))

    # Centre panel.
    pad = 24 * SS
    box = [S // 2 - 330 * SS, S // 2 - 190 * SS, S // 2 + 330 * SS, S // 2 + 190 * SS]
    d.rounded_rectangle(box, radius=26 * SS, fill=(247, 250, 253), outline=(0, 150, 180), width=4 * SS)
    cx = S // 2

    f_title = font(76 * SS)
    f_sub = font(34 * SS)
    f_small = font(26 * SS)
    f_axis = font(30 * SS)

    def centre(text: str, y: int, f: ImageFont.FreeTypeFont, fill=INK) -> None:
        w = d.textlength(text, font=f)
        d.text((cx - w / 2, y), text, font=f, fill=fill)

    centre("COMP4422", S // 2 - 150 * SS, f_title)
    centre("M2  UV CHECKER", S // 2 - 52 * SS, f_sub, CYAN)
    centre("1024 x 1024  -  Group 12", S // 2 + 2 * SS, f_small, MUTED)
    centre("u ->", S // 2 + 54 * SS, f_axis, YELLOW)
    centre("v ^", S // 2 + 96 * SS, f_axis, GREEN)

    # Cell indices along the top row for extra asymmetry. Start at 1 so the
    # top-left orientation triangle stays clean.
    f_num = font(22 * SS)
    for i in range(1, 8):
        d.text((i * cell + 10 * SS, band + 8 * SS), f"{i}", font=f_num, fill=MUTED)

    img = img.resize((SIZE, SIZE), Image.Resampling.LANCZOS)
    os.makedirs(os.path.dirname(os.path.abspath(out_path)), exist_ok=True)
    img.save(out_path, format="PNG", optimize=True)
    print(f"wrote {out_path} ({SIZE}x{SIZE}, {os.path.getsize(out_path)} bytes)")


if __name__ == "__main__":
    target = sys.argv[1] if len(sys.argv) > 1 else "assets/textures/uv-checker-1024.png"
    main(target)
