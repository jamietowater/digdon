"""One-time export of Dig-Don's voxel sprites, breeds and arenas from the Unreal C++ into web data.

Run from anywhere:  python DigDonWeb/tools/export_unreal_data.py
Writes DigDonWeb/src/data/sprites.json and copies the arena files the web build uses.
"""
import json
import re
import shutil
import sys
from pathlib import Path

WEB = Path(__file__).resolve().parents[1]
UNREAL = WEB.parent / "DigDon"
SRC = UNREAL / "Source" / "DigDon" / "Private"
LEVELS = ["arena01.txt", "arena04.txt"]

ROWS_RE = re.compile(r"const TCHAR\*\s+(\w+)\s*\[[^\]]*\]\s*=\s*\{(.*?)\};", re.S)
TEXT_RE = re.compile(r'TEXT\("([^"]*)"\)')
PALETTE_RE = re.compile(r"const (?:FDigVoxelColour|FDigPixel|FBonusPixel)\s+(\w+)\s*\[\]\s*=\s*\{(.*?)\};", re.S)
ENTRY_RE = re.compile(r"\{\s*TEXT\('(.)'\)\s*,\s*FLinearColor\(([^)]*)\)\s*(?:,\s*(FDigSurface\{[^}]*\}|[^}]*?))?\s*\}")
CONST_RE = re.compile(r"constexpr int32 (\w+) = (\d+);")


def floats(text):
    return [float(v.strip().rstrip("f")) for v in text.split(",") if v.strip()]


def surface(extra):
    """Palette extras: Matte(r), Metal(r), Glow(e), FDigSurface{e, m, r} or a bare glow float."""
    extra = (extra or "").strip()
    if not extra:
        return {"glow": 0.0, "metal": 0.0, "rough": 0.6}
    m = re.match(r"(Matte|Metal|Glow)\(([^)]*)\)", extra)
    if m:
        v = floats(m.group(2))[0] if m.group(2).strip() else None
        if m.group(1) == "Matte":
            return {"glow": 0.0, "metal": 0.0, "rough": v if v is not None else 0.9}
        if m.group(1) == "Metal":
            return {"glow": 0.0, "metal": 1.0, "rough": v if v is not None else 0.3}
        return {"glow": v, "metal": 0.0, "rough": 0.5}
    m = re.match(r"FDigSurface\{([^}]*)\}", extra)
    if m:
        e, metal, rough = floats(m.group(1))
        return {"glow": e, "metal": metal, "rough": rough}
    return {"glow": floats(extra)[0], "metal": 0.0, "rough": 0.6}


def parse(path):
    text = path.read_text(encoding="utf-8")
    rows = {name: TEXT_RE.findall(body) for name, body in ROWS_RE.findall(text)}
    palettes = {}
    for name, body in PALETTE_RE.findall(text):
        palettes[name] = [
            {"key": key, "rgb": floats(rgb), **surface(extra)} for key, rgb, extra in ENTRY_RE.findall(body)
        ]
    consts = {k: int(v) for k, v in CONST_RE.findall(text)}
    return text, rows, palettes, consts


def sprite(name, rows, width, palette, stride=None):
    height = len(rows)
    for i, line in enumerate(rows + (stride or [])):
        if len(line) > width + 1:
            sys.exit(f"{name}: row {i} is {len(line)} wide, declared {width}")
    out = {"name": name, "width": width, "height": height, "rows": rows, "palette": palette}
    if stride:
        out["stride"] = stride
    return out


def main():
    data = {"characters": {}, "breeds": [], "bonus": []}

    _, rows, palettes, _ = parse(SRC / "DigCharacterSprites.cpp")
    text = (SRC / "DigCharacterSprites.cpp").read_text(encoding="utf-8")
    for fn, rows_name, width, pal, stride in re.findall(
        r"DigSprites::(\w+)\(\)\s*\{\s*static const FDigVoxelSprite Sprite\{(\w+),\s*(\d+),\s*UE_ARRAY_COUNT\(\w+\),\s*(\w+)(?:,\s*(\w+))?\}",
        text,
    ):
        data["characters"][fn] = sprite(fn, rows[rows_name], int(width), palettes[pal], rows.get(stride) if stride else None)

    text, rows, palettes, consts = parse(SRC / "DigEnemy.cpp")
    table = re.search(r"const FDigBreed Breeds\[\]\s*=\s*\{(.*?)\n\t\};", text, re.S).group(1)
    for comment, body in re.findall(r"//\s*([^:\n]+):[^\n]*\n\s*\{(.*?)\}(?=,\s*\n|\s*$)", table, re.S):
        m = re.match(
            r"\s*(\w+),\s*(\w+),\s*(\w+),\s*(\w+),\s*UE_ARRAY_COUNT\(\w+\),\s*FLinearColor\(([^)]*)\),\s*(.*)",
            body,
            re.S,
        )
        rows_name, w, h, pal, angry, rest = m.groups()
        speed, patience, bob_h, bob_rate, wobble, extra, pause_i, pause_t = floats(rest)
        entry = sprite(comment.strip(), rows[rows_name], consts[w], palettes[pal])
        if len(entry["rows"]) != consts[h]:
            sys.exit(f"{comment}: {len(entry['rows'])} rows, declared {consts[h]}")
        entry.update(
            angry=floats(angry), speedMul=speed, patienceMul=patience, bobHeightCm=bob_h, bobRate=bob_rate,
            wobble=wobble, extraSetStages=int(extra), pauseInterval=pause_i, pauseTime=pause_t,
        )
        data["breeds"].append(entry)
    data["hat"] = sprite("Hat", rows["HatRows"], consts["HatW"], palettes["HatPalette"])

    text, rows, palettes, _ = parse(SRC / "DigBonus.cpp")
    items = re.search(r"const FBonusItem Items\[\]\s*=\s*\{(.*?)\};", text, re.S).group(1)
    for rows_name, width, height, pal in re.findall(r"\{\s*(\w+),\s*(\d+),\s*(\d+),\s*(\w+),", items):
        entry = sprite(rows_name.replace("Rows", ""), rows[rows_name], int(width), palettes[pal])
        entry["rows"] = entry["rows"][: int(height)]
        entry["height"] = int(height)
        data["bonus"].append(entry)

    if len(data["breeds"]) != 12 or len(data["bonus"]) != 10 or "Don" not in data["characters"]:
        sys.exit(f"unexpected counts: {len(data['breeds'])} breeds, {len(data['bonus'])} bonus items")

    out = WEB / "src" / "data"
    (out / "levels").mkdir(parents=True, exist_ok=True)
    (out / "sprites.json").write_text(json.dumps(data, indent=1), encoding="utf-8")
    for name in LEVELS:
        shutil.copyfile(UNREAL / "Content" / "Levels" / name, out / "levels" / name)
    print(
        f"Exported {len(data['characters'])} characters, {len(data['breeds'])} breeds, "
        f"{len(data['bonus'])} bonus items, {len(LEVELS)} arenas"
    )


if __name__ == "__main__":
    main()
