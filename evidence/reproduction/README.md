# Isolated browser reproduction

These scripts are verification fixtures, not production administration tools. Run only against a newly created disposable application container in its own network namespace. They create an owner and synthetic machines, change settings and exercise lifecycle operations. Never point them at an existing installation. The setup authorization value is supplied only through protected standard input and is never printed or saved.

The verified browser environment uses Chromium 141.0.7390.37 and Playwright 1.56.0 on Linux. `browser-proof.py` also expects `PROOF_SOURCE` and `PROOF_IMAGE` and a writable `/proof` output directory. Each script names its exact observed assertions; screenshots retain their own source-bound receipts. No native installer or physical-authenticator proof is implied.
