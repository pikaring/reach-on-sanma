# -*- coding: utf-8 -*-
"""紹介ページ用のアイコンを生成する。

三麻＝秋刀魚の駄洒落をそのまま絵にする。炭色の下地に銀色の秋刀魚を斜めに置き、
手前に「北」の牌（三麻の抜きドラ）を重ねる。外部の画像素材は使わず、ここで描く。

    py make_icon.py
"""
import math
import os

from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.join(HERE, 'assets')
S = 1024

CHARCOAL = (34, 36, 41)        # 下地（七輪の炭）
SILVER = (206, 211, 219)       # 秋刀魚の腹
SILVER_DARK = (150, 158, 172)  # 秋刀魚の縁・尾
BACK = (58, 74, 99)            # 秋刀魚の背（青黒い帯）
EMBER = (226, 122, 52)         # 焦げ目（紹介ページのアクセント色）
TILE = (251, 247, 236)         # 牌の面
TILE_EDGE = (205, 196, 174)
INK = (43, 43, 43)             # 「北」
TILT = -16                     # 秋刀魚の傾き（度）


def font(size):
    for name in ('BIZ-UDMinchoM.ttc', 'YuMincho.ttc', 'msmincho.ttc', 'BIZ-UDGothicB.ttc', 'msgothic.ttc'):
        p = os.path.join(r'C:\Windows\Fonts', name)
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()


def fish_layer():
    """水平に描いた秋刀魚（透明レイヤー）。あとで回転させて貼る。"""
    L = int(S * 0.86)          # 全長（尾まで）
    H = int(S * 0.19)          # 最大の高さ（秋刀魚は細長い）
    pad = int(S * 0.08)
    layer = Image.new('RGBA', (L + pad * 2, H * 2 + pad * 2), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    cy = layer.height / 2
    tail_len = int(L * 0.16)
    body_len = L - tail_len
    x0 = pad + tail_len          # 胴の始まり（尾の付け根）

    # 胴：尾側は細く、頭に向かって膨らみ、口先で尖る
    top, bottom = [], []
    n = 80
    for i in range(n + 1):
        t = i / n
        # 太さの分布：尾の付け根 0.35 → 中央付近 1.0 → 口先 0
        w = (math.sin(math.pi * (0.10 + 0.90 * t)) ** 0.75) if t < 0.97 else 0.0
        w = max(w, 0.32 * (1 - t) ** 0.5) if t < 0.5 else w
        h = H * w * 0.5
        x = x0 + body_len * t
        top.append((x, cy - h))
        bottom.append((x, cy + h))
    body = top + bottom[::-1]
    d.polygon(body, fill=SILVER, outline=SILVER_DARK, width=int(S * 0.008))

    # 背の青黒い帯（上側 1/3）
    band = [(x, y) for x, y in top] + [(x, cy - (cy - y) * 0.30) for x, y in top[::-1]]
    d.polygon(band, fill=BACK)

    # 尾びれ（二又）
    tx = x0 + int(S * 0.012)
    fork = int(H * 0.40)
    d.polygon([(tx, cy), (pad, cy - H * 0.55), (pad + tail_len * 0.55, cy),
               (pad, cy + H * 0.55)], fill=SILVER_DARK)
    d.polygon([(tx, cy), (pad + tail_len * 0.40, cy - fork * 0.15),
               (pad + tail_len * 0.40, cy + fork * 0.15)], fill=SILVER)

    # 焦げ目：胴の中ほどに斜めの短い帯を 3 本
    for k in range(3):
        x = x0 + body_len * (0.36 + 0.13 * k)
        d.line([(x - H * 0.10, cy - H * 0.30), (x + H * 0.10, cy + H * 0.32)],
               fill=EMBER, width=int(S * 0.026))

    # 目：頭の近く
    ex = x0 + body_len * 0.86
    r = H * 0.075
    d.ellipse((ex - r, cy - r * 0.6 - r, ex + r, cy - r * 0.6 + r), fill=INK)
    d.ellipse((ex - r * 0.35, cy - r * 0.6 - r * 0.7, ex + r * 0.15, cy - r * 0.6 - r * 0.2), fill=(255, 255, 255))

    return layer


def draw_tile(img):
    """手前に置く「北」の牌。"""
    d = ImageDraw.Draw(img)
    w, h = int(S * 0.235), int(S * 0.31)
    x = int(S * 0.62)
    y = int(S * 0.60)
    # 牌の厚み（下側に少し暗い縁）
    d.rounded_rectangle((x, y + int(S * 0.018), x + w, y + h + int(S * 0.018)),
                        radius=int(S * 0.03), fill=TILE_EDGE)
    d.rounded_rectangle((x, y, x + w, y + h), radius=int(S * 0.03), fill=TILE,
                        outline=TILE_EDGE, width=int(S * 0.006))
    f = font(int(h * 0.66))
    txt = '北'
    bb = d.textbbox((0, 0), txt, font=f)
    tw, th = bb[2] - bb[0], bb[3] - bb[1]
    d.text((x + (w - tw) / 2 - bb[0], y + (h - th) / 2 - bb[1]), txt, font=f, fill=INK)


def draw(img):
    d = ImageDraw.Draw(img)
    d.rounded_rectangle((0, 0, S, S), radius=int(S * 0.22), fill=CHARCOAL)
    # 七輪の網を思わせる細い線を薄く 2 本（小さいサイズでは消える程度）
    for y in (int(S * 0.36), int(S * 0.64)):
        d.line([(int(S * 0.10), y), (int(S * 0.90), y)], fill=(52, 55, 61), width=int(S * 0.012))

    fish = fish_layer().rotate(-TILT, resample=Image.BICUBIC, expand=True)
    fx = int((S - fish.width) / 2) - int(S * 0.02)
    fy = int((S - fish.height) / 2) - int(S * 0.06)
    img.alpha_composite(fish, (fx, fy))
    draw_tile(img)


img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
draw(img)

os.makedirs(ASSETS, exist_ok=True)
img.resize((512, 512), Image.LANCZOS).save(os.path.join(ASSETS, 'icon.png'))
img.save(os.path.join(ASSETS, 'favicon.ico'), sizes=[(48, 48), (32, 32), (16, 16)])
print('書き出し:', os.path.join(ASSETS, 'icon.png'))
print('書き出し:', os.path.join(ASSETS, 'favicon.ico'))

sizes = [256, 128, 64, 48, 32, 16]
strip = Image.new('RGBA', (sum(sizes) + 20 * len(sizes), 280), (250, 250, 250, 255))
x = 10
for s in sizes:
    small = img.resize((s, s), Image.LANCZOS)
    strip.paste(small, (x, 10), small)
    x += s + 20
strip.save(os.path.join(HERE, 'icon_preview.png'))
print('確認用:', os.path.join(HERE, 'icon_preview.png'))

# 小さいサイズでも各要素が残っているかを画素で確認する
print('\n--- 小サイズでの見え方（色の占める割合）---')
for s in (48, 32, 16):
    im = img.resize((s, s), Image.LANCZOS).convert('RGB')
    px = list(im.getdata())

    def near(c, t, tol):
        return sum(abs(a - b) for a, b in zip(c, t)) < tol

    silver = sum(1 for c in px if near(c, SILVER, 110) or near(c, SILVER_DARK, 90))
    tile = sum(1 for c in px if c[0] > 215 and c[1] > 205 and c[2] > 180 and c[0] - c[2] > 5)
    ember = sum(1 for c in px if c[0] - c[2] > 70 and c[0] > 150)
    print(f'  {s:>3}px: 秋刀魚(銀) {silver / len(px) * 100:4.1f}%  '
          f'牌(生成り) {tile / len(px) * 100:4.1f}%  焦げ目(橙) {ember / len(px) * 100:4.1f}%')
