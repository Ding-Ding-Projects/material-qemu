export function uploadIso(file, name, csrf, onProgress) {
  return uploadFile(`/api/media?name=${encodeURIComponent(name)}`, file, csrf, onProgress);
}
export function uploadFile(url, file, csrf, onProgress) {
  const request = new XMLHttpRequest();
  const promise = new Promise((resolve, reject) => {
    request.open("POST", url);
    request.setRequestHeader("Content-Type", "application/octet-stream");
    request.setRequestHeader("X-CSRF-Token", csrf);
    request.upload.onprogress = (event) =>
      onProgress(
        event.loaded,
        event.lengthComputable ? event.total : file.size,
      );
    request.onload = () => {
      let body;
      try {
        body = JSON.parse(request.responseText);
      } catch {
        return reject(new Error("Upload response could not be read."));
      }
      if (request.status >= 200 && request.status < 300) resolve(body);
      else {
        const error = new Error(body.error || "Upload failed.");
        error.status = request.status;
        reject(error);
      }
    };
    request.onerror = () =>
      reject(new Error("Upload connection was interrupted."));
    request.onabort = () =>
      reject(new Error("Upload cancelled. No existing media was changed."));
    request.send(file);
  });
  return {
    promise,
    abort: () => {
      if (request.readyState !== 4) request.abort();
    },
  };
}
