import sys
sys.path.insert(0, "sdk/python")
from warren import Warren
w = Warren()
with w.create() as sbx:
    r = sbx.exec(["python3", "-c", "import sys; print(sys.stdin.read().upper())"], stdin="hey")
    sbx.write_file("/tmp/x.bin", b"\x00\x01\x02")
    data = sbx.read_file("/tmp/x.bin")
assert r.ok and r.stdout == "HEY\n" and data == b"\x00\x01\x02", (r, data)
assert w.list() == []
print("PASS  python sdk")
