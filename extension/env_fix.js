/**
 * Environment Stabilization for MediaPipe
 * Fixed version: Removed locking to prevent ReferenceErrors during library load.
 */

(function() {
    console.log("OFFSCREEN: Initializing Environment Fix...");

    // Bulletproof includes without locking
    String.prototype.includes = function(search, start) {
        if (this == null) return false;
        return String(this).indexOf(search, start || 0) !== -1;
    };

    // Ensure navigator properties are present
    try {
        if (!navigator.platform) {
            Object.defineProperty(navigator, 'platform', { get: () => 'Win32' });
        }
        if (!navigator.userAgent) {
            Object.defineProperty(navigator, 'userAgent', { get: () => 'Mozilla/5.0' });
        }
    } catch (e) {
        console.warn("OFFSCREEN: Navigator mock warning:", e.message);
    }

    // Standard Origin Fix
    if (!window.location.origin) {
        window.location.origin = window.location.protocol + "//" + window.location.hostname + (window.location.port ? ':' + window.location.port: '');
    }

    console.log("OFFSCREEN: Environment Stabilization Complete.");
})();
