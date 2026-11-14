# Import installation media

Use Import ISO during onboarding or the machine editor's storage step. Choose a trusted local file and its stored filename. Progress reports bytes transferred, then the server confirms the actual saved length.

Each upload is limited to 2 GiB and 15 minutes. At most two uploads run concurrently. The service requires an authenticated session, the exact configured origin and the current CSRF value. It streams bytes to an exclusive mode-0600 temporary file rather than buffering the entire image. Finalization is atomic and never overwrites an existing filename, including concurrent same-name uploads. Disconnects, cancellation, excess size and length mismatches remove only that upload's temporary file.

Filenames must be plain `.iso` names. Directory traversal and an escaping media-directory symlink are rejected. The UI allows naming the upload differently when a filename already exists.

The import verifies transfer integrity and storage length only. It does not verify that an image is authentic, safe, licensed or bootable. Automated fixtures are explicitly nonbootable transport bytes. No ISO is automatically booted by uploading it.

QEMU opens installation media through an explicitly raw, read-only virtual SCSI CD device. Uploaded file headers never select an alternate disk format or backing-file interpretation. The same recipe is exercised with harmless blank CD fixture bytes on every selectable default platform.

The HTTP request limit permits the documented fifteen-minute upload deadline; JSON requests retain a separate thirty-second body deadline and 64 KiB limit. If the media file is saved but activity-history persistence fails, the API returns successful media creation with an explicit audit warning. It never reports the already-saved file as a failed upload.


Source: [docs/features/media.md](https://github.com/Ding-Ding-Projects/material-qemu/blob/2a273d914f9d4a0c4f61be13d391a9011fc38f42/docs/features/media.md).
