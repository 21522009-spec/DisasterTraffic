/**
 * theme-toggle.js v2
 * Thêm vào <head> TRƯỚC mọi script khác (tránh flash):
 *   <script src="/theme-toggle.js"></script>
 *
 * Inject slider toggle vào navbar (trong #auth-bar hoặc trước #connection-status).
 */
(function () {
  const STORAGE_KEY = 'dt_theme';
  const html = document.documentElement;

  /* ── 1. Áp dụng theme ngay (tránh FOUC) ── */
  function applyTheme(theme) {
    if (theme === 'light') html.classList.add('light');
    else html.classList.remove('light');
  }

  function getSaved() {
    try { return localStorage.getItem(STORAGE_KEY); } catch { return null; }
  }
  function save(theme) {
    try { localStorage.setItem(STORAGE_KEY, theme); } catch {}
  }

  applyTheme(getSaved() || 'dark');

  /* ── 2. Tạo slider toggle HTML ── */
  function createToggle() {
    const wrap = document.createElement('div');
    wrap.id = 'theme-toggle';
    wrap.setAttribute('role', 'switch');
    wrap.setAttribute('aria-label', 'Toggle dark/light mode');
    wrap.setAttribute('tabindex', '0');
    wrap.innerHTML = `
      <span class="t-sun" aria-hidden="true">☀️</span>
      <div class="t-track">
        <div class="t-thumb"></div>
      </div>
      <span class="t-moon" aria-hidden="true">🌙</span>
    `;
    return wrap;
  }

  /* ── 3. Inject vào navbar ── */
  function injectToggle() {
    if (document.getElementById('theme-toggle')) return;

    const toggle = createToggle();

    // Hàm toggle thực sự
    function doToggle() {
      const isLight = html.classList.contains('light');
      const next = isLight ? 'dark' : 'light';
      applyTheme(next);
      save(next);

      // Toast ngắn
      const toast = document.getElementById('toast');
      if (toast) {
        toast.textContent = next === 'light' ? 'LIGHT_MODE' : 'DARK_MODE';
        toast.classList.remove('hidden');
        clearTimeout(window._themeToast);
        window._themeToast = setTimeout(() => toast.classList.add('hidden'), 1800);
      }
    }

    toggle.addEventListener('click', doToggle);
    toggle.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); doToggle(); }
    });

    // Tìm điểm inject: ngay trước #connection-status trong header
    const connStatus = document.getElementById('connection-status');
    if (connStatus) {
      // Thêm separator + toggle vào flex container của header
      const sep = document.createElement('div');
      sep.className = 'w-px h-4 bg-outline-variant/30 hidden md:block';

      const headerFlex = connStatus.parentElement; // div.flex.items-center.gap-4
      headerFlex.insertBefore(sep, connStatus);
      headerFlex.insertBefore(toggle, sep);
    } else {
      // Fallback: thêm vào cuối body
      document.body.appendChild(toggle);
    }
  }

  /* ── 4. Theo system preference nếu chưa set ── */
  window.matchMedia('(prefers-color-scheme: light)')
    .addEventListener('change', (e) => {
      if (!getSaved()) applyTheme(e.matches ? 'light' : 'dark');
    });

  /* ── 5. Chờ DOM ── */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectToggle);
  } else {
    injectToggle();
  }
})();