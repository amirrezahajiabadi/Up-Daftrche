/* ═══ Native Bridge (Capacitor) ═══
   Provides transparent native adaptations for Android WebView without
   affecting web behaviour. Lazy-imports plugins only when running in native. */

export const isNative = () =>
  typeof window !== 'undefined' && Boolean(window.Capacitor?.isNativePlatform?.());

/* ── File Export & Sharing ──
   In web, invokes standard <a download>. In native WebView, writes to cache in
   manageable base64 chunks and presents the native Android Share sheet. */
export async function saveAndShareBlob(blob, filename, { title = 'دَفتَرچه', mimeType = '' } = {}) {
  if (!blob) return { ok: false };

  if (!isNative()) {
    try {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      return { ok: true, shared: false };
    } catch (err) {
      console.error('Web download error:', err);
      return { ok: false, error: err };
    }
  }

  try {
    const { Filesystem, Directory } = await import('@capacitor/filesystem');
    const { Share } = await import('@capacitor/share');

    // Convert blob to base64 in 1MB chunks to keep memory usage low
    const CHUNK_SIZE = 1024 * 1024;
    let offset = 0;
    let first = true;

    while (offset < blob.size) {
      const slice = blob.slice(offset, offset + CHUNK_SIZE);
      const buffer = await slice.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let binary = '';
      const len = bytes.byteLength;
      for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const base64Chunk = btoa(binary);

      if (first) {
        await Filesystem.writeFile({
          path: filename,
          data: base64Chunk,
          directory: Directory.Cache,
          recursive: true,
        });
        first = false;
      } else {
        await Filesystem.appendFile({
          path: filename,
          data: base64Chunk,
          directory: Directory.Cache,
        });
      }
      offset += CHUNK_SIZE;
    }

    const uriResult = await Filesystem.getUri({
      path: filename,
      directory: Directory.Cache,
    });

    await Share.share({
      title: title || filename,
      files: [uriResult.uri],
      dialogTitle: title || 'ذخیره یا اشتراک‌گذاری',
    });

    return { ok: true, shared: true, uri: uriResult.uri };
  } catch (err) {
    console.error('Native file save/share failed:', err);
    return { ok: false, error: err };
  }
}

/* ── Hardware Back Button ──
   Listens to Android back gesture: closes open dialog/sheet first;
   if none open, navigates history back; otherwise minimizes app. */
export async function initNativeBackHandler(onDialogClose) {
  if (!isNative()) return;

  try {
    const { App } = await import('@capacitor/app');
    App.addListener('backButton', () => {
      if (typeof onDialogClose === 'function' && onDialogClose()) {
        return;
      }
      if (window.history && window.history.length > 1) {
        window.history.back();
      } else {
        App.minimizeApp();
      }
    });
  } catch (err) {
    console.error('Failed to register back button listener:', err);
  }
}

/* ── Status Bar / System Bars Sync ──
   Sets light/dark icon contrast on system bars to match active theme mode
   and ensures the system bar never overlays the webview content. */
export async function syncSystemBars(mode) {
  if (!isNative()) return;

  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar');
    const isDark = mode === 'dark';
    await StatusBar.setStyle({ style: isDark ? Style.Dark : Style.Light });
    await StatusBar.setOverlaysWebView({ overlay: false });
  } catch {
    // StatusBar plugin call optional
  }
}

/* ── Task Notifications Bridge ── */
export async function scheduleNativeTaskNotification({ id, title, body, date }) {
  if (!isNative()) return false;

  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    const perm = await LocalNotifications.checkPermissions();
    if (perm.display !== 'granted') {
      const requested = await LocalNotifications.requestPermissions();
      if (requested.display !== 'granted') return false;
    }

    const notifId = typeof id === 'number'
      ? id
      : (Math.abs(String(id).split('').reduce((acc, c) => ((acc << 5) - acc) + c.charCodeAt(0), 0)) % 1000000);

    await LocalNotifications.schedule({
      notifications: [{
        id: notifId,
        title,
        body,
        schedule: { at: new Date(date) },
      }],
    });
    return true;
  } catch (err) {
    console.error('Native notification scheduling failed:', err);
    return false;
  }
}

export async function cancelNativeTaskNotification(id) {
  if (!isNative()) return false;

  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    const notifId = typeof id === 'number'
      ? id
      : (Math.abs(String(id).split('').reduce((acc, c) => ((acc << 5) - acc) + c.charCodeAt(0), 0)) % 1000000);
    await LocalNotifications.cancel({ notifications: [{ id: notifId }] });
    return true;
  } catch {
    return false;
  }
}

/* ── Minimum WebView Compatibility Warning ── */
export function checkMinWebViewVersion() {
  if (!isNative()) return;

  const supportsColorMix = typeof window !== 'undefined' &&
    window.CSS && typeof window.CSS.supports === 'function' &&
    window.CSS.supports('color', 'color-mix(in srgb, red, blue)');

  if (!supportsColorMix) {
    const notice = document.createElement('div');
    notice.style.cssText = 'position:fixed;inset-block-start:0;inset-inline:0;background:#d9534f;color:#fff;padding:12px 16px;z-index:999999;font-family:var(--font-ui,sans-serif);font-size:13px;text-align:center;direction:rtl;';
    notice.innerHTML = 'نسخهٔ مرورگر داخلی گوشی شما (Android System WebView) قدیمی است و ممکن است رنگ‌ها را درست نمایش ندهد. لطفاً آن را از <strong>کافه‌بازار</strong> یا <strong>مایکت</strong> به‌روزرسانی کنید.';
    document.body.prepend(notice);
  }
}
