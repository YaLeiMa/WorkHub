import hashlib
import re
from pathlib import Path

TARGET = "BF2A312F4ED26C162D553698DC0C9F5F8AF0CB952DEC14630C54897E6A7CF61C5C7CF99C560C061E850FF5BB689AA6F8"
LIB = Path(__file__).resolve().parents[1] / "src-tauri" / "src" / "lib.rs"
text = LIB.read_text(encoding="utf-8")

m = re.search(
    r'version: 1,.*?sql: "(.*?)"\s*,\s*kind: MigrationKind::Up',
    text,
    re.S,
)
if not m:
    raise SystemExit("migration 1 not found")

sql = m.group(1)

def digest(s: str) -> str:
    return hashlib.sha384(s.encode("utf-8")).hexdigest().upper()

variants = {
    "current": sql,
    "crlf": sql.replace("\n", "\r\n"),
    "with_desc": sql.replace(
        "title TEXT NOT NULL,\n                category TEXT NOT NULL,",
        "title TEXT NOT NULL,\n                description TEXT,\n                category TEXT NOT NULL,",
    ),
    "with_desc_crlf": None,
}
variants["with_desc_crlf"] = variants["with_desc"].replace("\n", "\r\n")

for name, s in variants.items():
    h = digest(s)
    print(name, "match" if h == TARGET else h[:16] + "...")
