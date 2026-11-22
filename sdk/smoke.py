import sys
sys.path.insert(0, "sdk/python")
from jasmine_sdk import Jasmine
w = Jasmine()
with w.create() as sbx:
    r = sbx.exec(["python3", "-c", "import sys; print(sys.stdin.read().upper())"], stdin="hey")
    sbx.write_file("/tmp/x.bin", b"\x00\x01\x02")
    data = sbx.read_file("/tmp/x.bin")
    sbx.pause()
    resumed = sbx.exec("cat /tmp/x.bin | od -An -tx1").stdout.split()
    t = sbx.snapshot()
    with w.create(template=t["name"]) as copy:
        copied = copy.read_file("/tmp/x.bin")
    w._request("DELETE", f"/v1/templates/{t['name']}")
assert r.ok and r.stdout == "HEY\n" and data == b"\x00\x01\x02", (r, data)
assert resumed == ["00", "01", "02"] and copied == data, (resumed, copied)
assert w.list() == []
print("PASS  python sdk (exec, files, pause, snapshot)")
