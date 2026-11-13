# Import installation media

Use Import ISO during onboarding or the machine editor's storage step. Choose a trusted local file and its stored filename. Progress reports bytes transferred, then the server confirms the actual saved length.

Each upload is limited to 2 GiB and 15 minutes. At most two uploads run concurrently. The service requires an authenticated session, the exact configured origin and the current CSRF value. It streams bytes to an exclusive mode-0600 temporary file rather than buffering the entire image. Finalization is atomic and never overwrites an existing filename, including concurrent same-name uploads. Disconnects, cancellation, excess size and length mismatches remove only that upload's temporary file.

Filenames must be plain `.iso` names. Directory traversal and an escaping media-directory symlink are rejected. The UI allows naming the upload differently when a filename already exists.

The import verifies transfer integrity and storage length only. It does not verify that an image is authentic, safe, licensed or bootable. Automated fixtures are explicitly nonbootable transport bytes. No ISO is automatically booted by uploading it.
