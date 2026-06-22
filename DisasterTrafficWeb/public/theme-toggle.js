/**
 * theme-toggle.js v3
 * Thêm vào <head> TRƯỚC mọi script khác (tránh flash):
 *   <script src="/theme-toggle.js"></script>
 *
 * Inject nút tròn toggle vào navbar (trước #connection-status).
 * Dùng Material Symbols Outlined (đã có sẵn trong dự án).
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

  /* ── 2. Tạo nút tròn với icon Material Symbols bên trong ── */
  function createToggle() {
    const btn = document.createElement('button');
    btn.id = 'theme-toggle';
    btn.setAttribute('aria-label', 'Toggle dark/light mode');
    btn.type = 'button';

    const icon = document.createElement('span');
    icon.className = 'material-symbols-outlined';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = html.classList.contains('light') ? 'light_mode' : 'dark_mode';

    btn.appendChild(icon);
    return btn;
  }

  /* ── 3. Inject vào navbar ── */
  function injectToggle() {
    if (document.getElementById('theme-toggle')) return;

    const toggle = createToggle();

    function doToggle() {
      const isLight = html.classList.contains('light');
      const next = isLight ? 'dark' : 'light';
      applyTheme(next);
      save(next);

      /* Đổi icon theo theme mới */
      const icon = toggle.querySelector('span.material-symbols-outlined');
      icon.textContent = next === 'light' ? 'light_mode' : 'dark_mode';

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

    /* Inject ngay trước #connection-status trong header */
    const connStatus = document.getElementById('connection-status');
    if (connStatus) {
      const sep = document.createElement('div');
      sep.className = 'w-px h-4 bg-outline-variant/30 hidden md:block';
      const headerFlex = connStatus.parentElement;
      headerFlex.insertBefore(sep, connStatus);
      headerFlex.insertBefore(toggle, sep);
    } else {
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