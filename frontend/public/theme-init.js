// Applies the saved theme before the first paint, so dark-theme users never see a light flash.
// A separate file (not an inline script) so the page CSP can stay script-src 'self'.
(function () {
  var theme = 'dark';
  try {
    if (localStorage.getItem('theme') === 'light') theme = 'light';
  } catch (e) {
    // storage blocked: keep the default
  }
  document.documentElement.setAttribute('data-theme', theme);
})();
