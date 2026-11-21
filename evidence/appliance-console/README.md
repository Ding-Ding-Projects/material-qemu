# Appliance console

`console.png` is the unedited QMP screendump that the CI boot check took of the appliance's local console for v0.1.0-build.60 (commit cbc81aca1ec959ff39ca0bf01f7173ccb96a575c, run 44932396308). The disk booted under QEMU with user networking, so the guest address is 10.0.2.15.

The login screen shows the version, the IP address of the network interface, the address to open and the owner hint. The boot check reads this picture with OCR and fails unless it finds `IP address:` followed by the address the appliance reported on its serial port.
