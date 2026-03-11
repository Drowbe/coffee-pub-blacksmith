/**
 * Smooth horizontal scroll with easing for predictable per-click movement.
 * Kept in a combat-bar-specific module (not menubar API surface).
 *
 * @param {HTMLElement} element
 * @param {number} deltaX
 * @param {number} durationMs
 * @param {() => void} [onUpdate]
 */
export function easeHorizontalScroll(element, deltaX, durationMs = 220, onUpdate) {
    if (!element || !Number.isFinite(deltaX) || deltaX === 0) return;
    const start = element.scrollLeft || 0;
    const max = Math.max(0, element.scrollWidth - element.clientWidth);
    const target = Math.min(max, Math.max(0, start + deltaX));
    if (Math.abs(target - start) < 0.5) return;

    // Cancel any in-flight click-scroll so repeated clicks feel responsive.
    if (element._blacksmithScrollRafId) {
        cancelAnimationFrame(element._blacksmithScrollRafId);
        element._blacksmithScrollRafId = null;
    }

    const t0 = performance.now();
    const easeInOutCubic = (t) => (t < 0.5)
        ? 4 * t * t * t
        : 1 - Math.pow(-2 * t + 2, 3) / 2;

    const tick = (now) => {
        const elapsed = now - t0;
        const progress = Math.min(1, elapsed / durationMs);
        const eased = easeInOutCubic(progress);
        element.scrollLeft = start + ((target - start) * eased);
        if (typeof onUpdate === 'function') onUpdate();
        if (progress < 1) {
            element._blacksmithScrollRafId = requestAnimationFrame(tick);
        } else {
            element._blacksmithScrollRafId = null;
        }
    };

    element._blacksmithScrollRafId = requestAnimationFrame(tick);
}
