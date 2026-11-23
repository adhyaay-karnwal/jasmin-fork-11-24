You are setting up Jasmine, an open-source sandbox runtime for AI agents (https://tryjasmine.dev, source: https://github.com/arjunkshah12345-hash/jasmine-sandbox). Each sandbox is a Firecracker microVM restored from a memory snapshot, so it is ready in about 100 ms. Work through the steps below in order. Run the commands yourself, check every result, and stop to ask me only if a step fails in a way you cannot fix.

## 1. Find or confirm a host

Jasmine needs Linux with KVM (x86_64 or arm64). Check the machine you are on:

    uname -sm && test -r /dev/kvm && echo kvm-ok

- If this prints `kvm-ok`, use this machine.
- If not (for example on macOS, or a cloud VM without nested virtualization), ask me for SSH access to a Linux host that has /dev/kvm, such as a bare-metal server. Do not try to emulate KVM.

## 2. Install

    curl -fsSL https://tryjasmine.dev/install | sudo sh

The installer verifies the release checksum and sets up Firecracker, the guest kernel and an XFS reflink store. Confirm with `jasmined --help`.

## 3. Build a template

A template is any OCI image, booted once and snapshotted. Pick the image that matches my project (python:3.12-slim for Python, node:22-bookworm for Node; ask me if unsure):

    sudo jasmined build default python:3.12-slim

Building takes about a minute the first time. Later sandboxes restore from it in milliseconds.

## 4. Start the API with a key

If I gave you a Jasmine API key (it starts with `jsm_`), use it. Otherwise generate one with `openssl rand -hex 24 | sed 's/^/jsm_/'`. Never print the key in logs or commit it.

    sudo install -d -m 700 /etc/jasmine
    echo "JASMINE_API_KEY=$JASMINE_API_KEY" | sudo tee /etc/jasmine/env >/dev/null && sudo chmod 600 /etc/jasmine/env
    sudo systemctl enable --now jasmined
    curl -fsS http://127.0.0.1:7171/healthz

The API listens on 127.0.0.1:7171. Only expose it beyond localhost behind TLS (a reverse proxy, a tunnel or a private network), and only with the key set.

## 5. Smoke test

    curl -fsS -X POST http://127.0.0.1:7171/v1/sandboxes -H "authorization: Bearer $JASMINE_API_KEY"

Take the `id` from the response, then:

    curl -fsS -X POST http://127.0.0.1:7171/v1/sandboxes/$ID/exec -H "authorization: Bearer $JASMINE_API_KEY" -H 'content-type: application/json' -d '{"cmd":"python3 -c \"print(6*7)\""}'
    curl -fsS -X DELETE http://127.0.0.1:7171/v1/sandboxes/$ID -H "authorization: Bearer $JASMINE_API_KEY"

The exec response should contain `"stdout":"42\n"`.

## 6. Wire it into my code

Both SDKs read `JASMINE_URL` (default http://127.0.0.1:7171) and `JASMINE_API_KEY` from the environment.

Python (stdlib only):

    pip install "git+https://github.com/arjunkshah12345-hash/jasmine-sandbox#subdirectory=sdk/python"

    from jasmine_sdk import Jasmine
    with Jasmine().create() as sbx:          # deleted when the block exits
        r = sbx.exec("python3 -c 'print(6*7)'")
        print(r.stdout, r.exit_code)

TypeScript (zero dependencies, Node 18+). Until it is on npm, build it from the repo:

    git clone --depth 1 https://github.com/arjunkshah12345-hash/jasmine-sandbox /tmp/jasmine
    (cd /tmp/jasmine/sdk/typescript && npm install && npm run build) && npm install /tmp/jasmine/sdk/typescript

    import { Jasmine } from "jasmine-sdk";
    await using sbx = await new Jasmine().create();
    const r = await sbx.exec("python3 -c 'print(6*7)'");

Find where my project runs untrusted or model-generated code (a code-interpreter tool, an eval loop, test execution) and route it through a sandbox: create one per task or per conversation, `exec` commands, use `files.write` / `files.readText` (`write_file` / `read_file` in Python) to move files, `pause()` between turns to stop paying CPU while keeping state, `snapshot()` to save a state you want to branch from, and always delete sandboxes when done. Add the two environment variables to my project's example env file, without the real key.

## 7. Report back

Tell me: the host and architecture, the template you built, the smoke-test output, which files you changed, and anything you skipped and why.
