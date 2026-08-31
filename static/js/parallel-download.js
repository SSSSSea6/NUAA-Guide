/**
 * 网页内多线程下载：把一个大文件拆成若干段并发拉取，再拼回本地文件。
 * 长肥链路（国内访问境外节点）单连接吞吐受限，并发几条能明显提速。
 * 任何一步不满足条件（浏览器太老、不支持 Range、跨域被拦）都会回落成普通下载。
 */
(function () {
  'use strict';

  var CONNECTIONS = 8;
  var MIN_PARALLEL_BYTES = 4 * 1024 * 1024;
  var PROGRESS_INTERVAL_MS = 120;

  function supported() {
    return !!(window.fetch && window.AbortController && window.Blob && window.URL && URL.createObjectURL);
  }

  function formatSize(bytes) {
    if (!bytes || bytes < 0) return '';
    var mb = bytes / 1048576;
    return mb >= 1024 ? (mb / 1024).toFixed(2) + ' GB' : mb.toFixed(1) + ' MB';
  }

  function formatSpeed(bytesPerSecond) {
    if (!bytesPerSecond || bytesPerSecond < 0) return '';
    var mb = bytesPerSecond / 1048576;
    return mb >= 1 ? mb.toFixed(1) + ' MB/s' : Math.max(1, Math.round(bytesPerSecond / 1024)) + ' KB/s';
  }

  function fileNameFrom(link) {
    var explicit = link.getAttribute('download');
    if (explicit) return explicit;
    try {
      var path = new URL(link.href, window.location.href).pathname;
      return decodeURIComponent(path.substring(path.lastIndexOf('/') + 1)) || 'download';
    } catch (error) {
      return 'download';
    }
  }

  function saveBlob(blob, fileName) {
    var objectUrl = URL.createObjectURL(blob);
    var anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = fileName;
    anchor.rel = 'noopener';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(function () { URL.revokeObjectURL(objectUrl); }, 60000);
  }

  async function readPart(response, onChunk) {
    if (!response.body || !response.body.getReader) {
      var buffer = new Uint8Array(await response.arrayBuffer());
      onChunk(buffer.length);
      return buffer;
    }
    var reader = response.body.getReader();
    var chunks = [];
    var size = 0;
    for (;;) {
      var step = await reader.read();
      if (step.done) break;
      chunks.push(step.value);
      size += step.value.length;
      onChunk(step.value.length);
    }
    var merged = new Uint8Array(size);
    var offset = 0;
    for (var i = 0; i < chunks.length; i += 1) {
      merged.set(chunks[i], offset);
      offset += chunks[i].length;
    }
    return merged;
  }

  async function parallelDownload(url, signal, onProgress) {
    var head = await fetch(url, { method: 'HEAD', signal: signal, cache: 'no-store' });
    if (!head.ok) throw new Error('head-failed');

    var total = Number(head.headers.get('content-length'));
    var ranged = (head.headers.get('accept-ranges') || '').toLowerCase().indexOf('bytes') !== -1;
    if (!total || !ranged || total < MIN_PARALLEL_BYTES) throw new Error('range-unavailable');

    var connections = Math.min(CONNECTIONS, Math.ceil(total / MIN_PARALLEL_BYTES)) || 1;
    var chunkSize = Math.ceil(total / connections);
    var parts = new Array(connections);
    var loaded = 0;

    function bump(delta) {
      loaded += delta;
      onProgress(loaded, total);
    }

    var jobs = [];
    for (var i = 0; i < connections; i += 1) {
      var start = i * chunkSize;
      var end = Math.min(start + chunkSize - 1, total - 1);
      if (start > end) {
        parts[i] = new Uint8Array(0);
        continue;
      }
      jobs.push(fetch(url, {
        headers: { Range: 'bytes=' + start + '-' + end },
        signal: signal,
        cache: 'no-store'
      }).then(function (index, expected, response) {
        if (response.status !== 206) throw new Error('range-rejected');
        return readPart(response, bump).then(function (part) {
          if (part.length !== expected) throw new Error('range-short');
          parts[index] = part;
        });
      }.bind(null, i, end - start + 1)));
    }

    await Promise.all(jobs);
    return new Blob(parts, { type: head.headers.get('content-type') || 'application/octet-stream' });
  }

  function enhance(link) {
    var section = link.closest('.tool-download');
    if (!section) return;

    var panel = section.querySelector('[data-download-progress]');
    var bar = section.querySelector('[data-download-bar]');
    var label = section.querySelector('[data-download-text]');
    var cancelButton = section.querySelector('[data-download-cancel]');
    if (!panel || !bar || !label || !cancelButton) return;

    var running = false;

    function setPanel(visible) {
      panel.hidden = !visible;
      link.hidden = visible;
    }

    function reset() {
      running = false;
      setPanel(false);
      bar.style.width = '0%';
      label.textContent = '';
    }

    function fallback() {
      running = false;
      setPanel(false);
      window.location.href = link.href;
    }

    link.addEventListener('click', function (event) {
      if (!supported()) return;
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      event.preventDefault();
      if (running) return;
      running = true;

      var controller = new AbortController();
      var fileName = fileNameFrom(link);
      var startedAt = Date.now();
      var lastPaint = 0;
      var lastLoaded = 0;
      var lastSample = startedAt;
      var speed = 0;

      setPanel(true);
      bar.style.width = '0%';
      label.textContent = '正在建立连接…';

      cancelButton.onclick = function () {
        controller.abort();
      };

      parallelDownload(link.href, controller.signal, function (loaded, total) {
        var now = Date.now();
        if (now - lastPaint < PROGRESS_INTERVAL_MS && loaded < total) return;
        lastPaint = now;

        if (now - lastSample >= 500) {
          speed = ((loaded - lastLoaded) * 1000) / (now - lastSample);
          lastLoaded = loaded;
          lastSample = now;
        }

        var percent = Math.min(100, Math.round((loaded / total) * 100));
        bar.style.width = percent + '%';
        label.textContent = '正在下载 ' + percent + '% · ' + formatSize(loaded) + ' / ' + formatSize(total) +
          (speed ? ' · ' + formatSpeed(speed) : '');
      }).then(function (blob) {
        bar.style.width = '100%';
        label.textContent = '下载完成，正在保存…';
        saveBlob(blob, fileName);
        window.setTimeout(reset, 1500);
      }).catch(function (error) {
        if (error && error.name === 'AbortError') {
          reset();
          return;
        }
        fallback();
      });
    });
  }

  function init() {
    var links = document.querySelectorAll('[data-parallel-download]');
    for (var i = 0; i < links.length; i += 1) enhance(links[i]);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
