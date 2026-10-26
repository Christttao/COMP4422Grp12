# UV checker texture — provenance and licence

| Field | Value |
|-------|-------|
| File | `uv-checker-1024.png` |
| Dimensions | 1024 × 1024 |
| Format | PNG, RGB |
| Author | COMP4422 Group 12 |
| Created | 2026-10-25 |
| Generator | [`../../tools/generate_texture.py`](../../tools/generate_texture.py) |
| Licence | CC0 1.0 Universal (public-domain dedication) |

## Source compliance

This image was **authored for this project**. It contains no third-party artwork,
photographs, logos, fonts embedded as images, or textures copied from the internet.
The text in the image is rendered with a system font at generation time and is not
redistributed as a font. No external asset was downloaded for M2.

## Regenerate

```bash
python tools/generate_texture.py assets/textures/uv-checker-1024.png
```

Requires Pillow (`pip install Pillow`). The script renders at 2048 px and downsamples to
1024 px with Lanczos for clean edges.

## Why this texture

- A checkerboard makes UV stretching, seams and filtering immediately visible.
- Asymmetric colour bands (cyan top, magenta right, yellow bottom, green left), corner
  triangles and cell indices make rotation/mirroring detectable.
- A power-of-two size allows mipmaps under WebGL2 without resizing.
- It is not a flat colour placeholder: the texel values vary across the whole surface.
