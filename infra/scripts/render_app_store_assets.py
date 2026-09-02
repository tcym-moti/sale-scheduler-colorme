from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "docs" / "release" / "app-store" / "assets"
FONT_REGULAR = next(
    (Path(candidate) for candidate in (
        "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
        r"C:\Windows\Fonts\NotoSansJP-VF.ttf",
        r"C:\Windows\Fonts\YuGothM.ttc",
    ) if Path(candidate).exists()),
    None,
)
FONT_BOLD = next(
    (Path(candidate) for candidate in (
        "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc",
        r"C:\Windows\Fonts\YuGothB.ttc",
        r"C:\Windows\Fonts\meiryob.ttc",
    ) if Path(candidate).exists()),
    FONT_REGULAR,
)


def font(size: int, bold: bool = False):
    font_path = FONT_BOLD if bold else FONT_REGULAR
    if font_path:
        return ImageFont.truetype(str(font_path), size)
    return ImageFont.load_default()


def gradient(size, top, bottom):
    image = Image.new("RGB", size, top)
    pixels = image.load()
    for y in range(size[1]):
        ratio = y / max(1, size[1] - 1)
        color = tuple(int(top[index] * (1 - ratio) + bottom[index] * ratio) for index in range(3))
        for x in range(size[0]):
            pixels[x, y] = color
    return image


def text(draw, xy, value, size, fill=(23, 34, 46), bold=False, anchor=None):
    draw.text(xy, value, font=font(size, bold), fill=fill, anchor=anchor)


def card(draw, box, fill=(255, 255, 255), outline=(220, 228, 236), radius=24):
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=2)


def header(draw, title="Sale Scheduler"):
    draw.rectangle((0, 0, 1600, 92), fill=(255, 255, 255))
    draw.rounded_rectangle((54, 25, 110, 81), radius=16, fill=(23, 107, 135))
    text(draw, (82, 53), "SS", 22, (255, 255, 255), True, "mm")
    text(draw, (132, 31), title, 25, bold=True)
    text(draw, (132, 61), "安全なセール価格スケジューラー", 13, (100, 115, 131))
    text(draw, (1518, 39), "ショップA", 15, bold=True, anchor="ra")
    text(draw, (1518, 66), "Account ID: DEMO-001", 12, (100, 115, 131), anchor="ra")


def save(image, name):
    OUT.mkdir(parents=True, exist_ok=True)
    image.save(OUT / name, "PNG", optimize=True)


def make_icon():
    image = gradient((1200, 1200), (13, 79, 104), (23, 107, 135))
    draw = ImageDraw.Draw(image)
    draw.ellipse((110, 110, 1090, 1090), fill=(255, 255, 255, 18))
    draw.rounded_rectangle((145, 145, 1055, 1055), radius=240, outline=(161, 224, 226), width=10)
    text(draw, (600, 515), "SS", 280, (255, 255, 255), True, "mm")
    draw.rounded_rectangle((350, 760, 850, 800), radius=20, fill=(244, 181, 72))
    text(draw, (600, 895), "SALE SCHEDULER", 44, (255, 255, 255), True, "mm")
    save(image, "icon-1200.png")


def make_eyecatch():
    image = gradient((1320, 740), (247, 251, 252), (218, 241, 244))
    draw = ImageDraw.Draw(image)
    draw.ellipse((940, -170, 1510, 400), fill=(201, 232, 235))
    text(draw, (80, 92), "SALE SCHEDULER", 22, (23, 107, 135), True)
    text(draw, (80, 155), "セールの開始と、", 53, bold=True)
    text(draw, (80, 220), "元価格への復元を安全に予約。", 43, bold=True)
    text(draw, (82, 310), "指定日時から商品ごとに順次反映", 24, (80, 104, 119), True)
    text(draw, (82, 356), "Previewで変更内容を確認し、", 19, (100, 115, 131))
    text(draw, (82, 387), "手動変更はConflictとして保護します。", 19, (100, 115, 131))
    draw.rounded_rectangle((82, 500, 730, 568), radius=18, fill=(23, 107, 135))
    text(draw, (406, 534), "カラーミーショップ向け", 23, (255, 255, 255), True, "mm")
    # Dashboard mockup
    card(draw, (780, 88, 1245, 655), (255, 255, 255), (220, 228, 236), 28)
    draw.rounded_rectangle((810, 120, 1215, 180), radius=14, fill=(239, 248, 251))
    text(draw, (840, 139), "予約前Preview", 20, (23, 107, 135), True)
    for index, label in enumerate(("商品A   5,000円 → 3,980円", "商品B   3,980円 → 3,184円", "商品C   2,800円 → 2,240円")):
        y = 228 + index * 78
        draw.ellipse((830, y + 8, 850, y + 28), fill=(25, 114, 74))
        text(draw, (875, y), label, 19, bold=True)
        draw.line((875, y + 39, 1175, y + 39), fill=(220, 228, 236), width=2)
    draw.rounded_rectangle((830, 480, 1175, 548), radius=16, fill=(255, 248, 232))
    text(draw, (1002, 514), "指定日時から順次反映", 17, (121, 80, 12), True, "mm")
    save(image, "eyecatch-1320x740.png")


def make_selection():
    image = gradient((1600, 1000), (245, 248, 250), (232, 243, 245))
    draw = ImageDraw.Draw(image)
    header(draw)
    text(draw, (70, 145), "セール予約", 34, bold=True)
    text(draw, (70, 193), "商品を選び、条件を設定します。", 17, (100, 115, 131))
    card(draw, (70, 245, 900, 905))
    text(draw, (108, 285), "1. 商品を選択", 22, bold=True)
    draw.rounded_rectangle((108, 330, 860, 382), radius=10, outline=(201, 213, 223), fill=(255, 255, 255))
    text(draw, (130, 346), "商品名・商品IDで検索", 15, (150, 160, 170))
    for index, row in enumerate((("商品A", "5,000円"), ("商品B", "3,980円"), ("商品C", "2,800円"), ("商品D", "1,980円"))):
        y = 435 + index * 86
        draw.rounded_rectangle((110, y, 855, y + 70), radius=11, fill=(251, 253, 254), outline=(237, 241, 244))
        draw.rounded_rectangle((136, y + 23, 160, y + 47), radius=5, fill=(23, 107, 135))
        text(draw, (148, y + 35), "✓", 17, (255, 255, 255), True, "mm")
        text(draw, (190, y + 16), row[0], 18, bold=True)
        text(draw, (190, y + 43), "バリエーションなし", 12, (100, 115, 131))
        text(draw, (815, y + 27), row[1], 16, bold=True, anchor="ra")
    card(draw, (960, 245, 1530, 905))
    text(draw, (998, 285), "2. セールを設定", 22, bold=True)
    text(draw, (998, 345), "価格方式", 13, (100, 115, 131), True)
    draw.rounded_rectangle((998, 375, 1250, 425), radius=10, fill=(239, 248, 251), outline=(23, 107, 135))
    text(draw, (1124, 400), "価格を指定", 16, (23, 107, 135), True, "mm")
    text(draw, (998, 470), "セール価格（円）", 13, (100, 115, 131), True)
    draw.rounded_rectangle((998, 500, 1490, 555), radius=10, outline=(201, 213, 223), fill=(255, 255, 255))
    text(draw, (1020, 518), "3,980", 18, bold=True)
    text(draw, (998, 615), "開始日時（JST）", 13, (100, 115, 131), True)
    text(draw, (998, 650), "2026/09/15 10:00", 17, bold=True)
    text(draw, (998, 730), "終了日時（JST）", 13, (100, 115, 131), True)
    text(draw, (998, 765), "2026/09/22 23:59", 17, bold=True)
    draw.rounded_rectangle((998, 820, 1490, 872), radius=12, fill=(23, 107, 135))
    text(draw, (1244, 846), "Previewを表示", 17, (255, 255, 255), True, "mm")
    save(image, "screenshot-01-selection.png")


def make_preview():
    image = gradient((1600, 1000), (245, 248, 250), (232, 243, 245))
    draw = ImageDraw.Draw(image)
    header(draw)
    text(draw, (70, 145), "実行前Preview", 34, bold=True)
    text(draw, (70, 193), "変更内容と処理時間の概算を確認してから予約します。", 17, (100, 115, 131))
    card(draw, (70, 245, 1530, 390))
    labels = (("対象商品", "10件"), ("開始予定", "9/15 10:00"), ("開始処理の概算", "約2分"), ("終了処理の概算", "約2分"))
    for index, label in enumerate(labels):
        x = 105 + index * 355
        text(draw, (x, 286), label[0], 13, (100, 115, 131), True)
        text(draw, (x, 326), label[1], 25, bold=True)
    draw.rounded_rectangle((105, 350, 1490, 375), radius=8, fill=(255, 248, 232))
    text(draw, (130, 356), "API制限により、指定日時から商品ごとに順次反映されます。retryで延長する場合があります。", 13, (121, 80, 12), True)
    card(draw, (70, 430, 1530, 905))
    text(draw, (105, 470), "価格変更の内容", 21, bold=True)
    columns = (("商品", 110), ("現在価格", 780), ("セール価格", 1000), ("値引額", 1230), ("結果", 1400))
    for label, x in columns:
        text(draw, (x, 530), label, 13, (100, 115, 131), True, "ra" if x > 700 else None)
    for index, row in enumerate((("商品A", "5,000円", "3,980円", "1,020円"), ("商品B", "3,980円", "3,184円", "796円"), ("商品C", "2,800円", "2,240円", "560円"))):
        y = 585 + index * 77
        draw.line((105, y - 18, 1490, y - 18), fill=(237, 241, 244), width=2)
        text(draw, (110, y), row[0], 16, bold=True)
        for value, x in zip(row[1:], (780, 1000, 1230)):
            text(draw, (x, y), value, 16, bold=True, anchor="ra")
        draw.rounded_rectangle((1365, y - 5, 1465, y + 28), radius=12, fill=(231, 246, 237))
        text(draw, (1415, y + 11), "登録可能", 12, (25, 114, 74), True, "mm")
    draw.rounded_rectangle((1110, 835, 1490, 885), radius=12, fill=(23, 107, 135))
    text(draw, (1300, 860), "予約を確定", 17, (255, 255, 255), True, "mm")
    save(image, "screenshot-02-preview.png")


def make_history():
    image = gradient((1600, 1000), (245, 248, 250), (232, 243, 245))
    draw = ImageDraw.Draw(image)
    header(draw)
    text(draw, (70, 145), "予約履歴", 34, bold=True)
    text(draw, (70, 193), "商品ごとの結果とConflictを確認できます。", 17, (100, 115, 131))
    card(draw, (70, 245, 1530, 470))
    text(draw, (110, 285), "2026/09/15 10:00 〜 2026/09/22 23:59", 19, bold=True)
    draw.rounded_rectangle((1330, 275, 1475, 315), radius=20, fill=(231, 246, 237))
    text(draw, (1402, 295), "完了", 14, (25, 114, 74), True, "mm")
    text(draw, (110, 335), "10商品 · 20% OFF", 14, (100, 115, 131))
    for index, (label, value, fill, color) in enumerate((("成功", "9", (231, 246, 237), (25, 114, 74)), ("Conflict", "1", (255, 233, 233), (179, 58, 58)), ("確認待ち", "0", (255, 243, 216), (164, 102, 10)))):
        x = 110 + index * 210
        draw.rounded_rectangle((x, 380, x + 170, 440), radius=12, fill=fill)
        text(draw, (x + 18, 398), label, 13, color, True)
        text(draw, (x + 150, 398), value, 20, color, True, "ra")
    card(draw, (70, 510, 1530, 905))
    text(draw, (110, 550), "予約の詳細", 21, bold=True)
    text(draw, (110, 606), "商品", 13, (100, 115, 131), True)
    text(draw, (890, 606), "状態", 13, (100, 115, 131), True)
    text(draw, (1120, 606), "現在価格", 13, (100, 115, 131), True)
    text(draw, (1300, 606), "理由", 13, (100, 115, 131), True)
    for index, row in enumerate((("商品A", "完了", "3,980円", "—"), ("商品B", "完了", "3,184円", "—"), ("商品C", "Conflict", "3,500円", "手動変更を検出"))):
        y = 670 + index * 72
        draw.line((105, y - 20, 1490, y - 20), fill=(237, 241, 244), width=2)
        text(draw, (110, y), row[0], 16, bold=True)
        fill, color = ((255, 233, 233), (179, 58, 58)) if row[1] == "Conflict" else ((231, 246, 237), (25, 114, 74))
        draw.rounded_rectangle((890, y - 6, 1000, y + 28), radius=12, fill=fill)
        text(draw, (945, y + 11), row[1], 12, color, True, "mm")
        text(draw, (1120, y), row[2], 16, bold=True)
        text(draw, (1300, y), row[3], 14, color if row[1] == "Conflict" else (100, 115, 131), row[1] == "Conflict")
    save(image, "screenshot-03-history.png")


if __name__ == "__main__":
    make_icon()
    make_eyecatch()
    make_selection()
    make_preview()
    make_history()
    print(f"Rendered App Store assets to {OUT}")
