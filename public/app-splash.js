// Splash teardown. Lives in an external file, not inline, so the page's CSP can
// keep script-src free of 'unsafe-inline' — the directive that otherwise lets an
// injected <script> run, which in a password manager means the whole vault.
(function () {
    var observer = new MutationObserver(function () {
        var qApp = document.getElementById('q-app');
        if (qApp && qApp.children.length > 0) {
            var splash = document.getElementById('app-loading');
            if (splash) {
                splash.classList.add('fade-out');
                setTimeout(function () { splash.remove(); }, 300);
            }
            observer.disconnect();
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });
})();
