"""Rewrites template bodies in supabase/2-contactos.sql as single-line E'' strings (\\n for line breaks),
so the SQL can be typed into an editor that auto-indents new lines."""
import pathlib, re

p = pathlib.Path(__file__).resolve().parent.parent / "supabase" / "2-contactos.sql"
s = p.read_text(encoding="utf-8")
pre, post = s.split("select 'templates'", 1)
a = post.index("from (values\n") + len("from (values\n")
b = post.index("\n) as t(")
body = post[a:b]
rows = re.findall(r"\('(tpl-\d+)',E?'((?:[^'\\]|\\.|'')*)',(\d+),E?'((?:[^'\\]|\\.|'')*)'\)", body, re.S)
assert len(rows) == 5, len(rows)


def e(x):
    x = x.replace("''", "'")
    return "E'" + x.replace("\\", "\\\\").replace("'", "\\'").replace("\r", "").replace("\n", "\\n") + "'"


new = ",\n".join(f"('{i}',{e(n)},{o},{e(t)})" for i, n, o, t in rows)
p.write_text(pre + "select 'templates'" + post[:a] + new + post[b:], encoding="utf-8")
print("ok", new.count("\n"))
