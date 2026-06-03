/**
 * Lazy bootstrap for the 3D respirator showcase.
 *
 * The Three.js / React-Three-Fiber bundle is heavy, so we do NOT load it on
 * initial page load. Instead we wait until the product section is near the
 * viewport, then dynamically import React + the scene as a separate chunk.
 * This keeps the landing page's initial JS tiny (fast FCP / LCP).
 */
const rootElement = document.getElementById('react-respirator-root');

if (rootElement) {
  let started = false;

  const mount = () => {
    if (started) return;
    started = true;
    Promise.all([
      import('react'),
      import('react-dom/client'),
      import('./RespiratorScene'),
    ]).then(([React, ReactDOM, { default: RespiratorScene }]) => {
      ReactDOM.createRoot(rootElement).render(
        React.createElement(React.StrictMode, null, React.createElement(RespiratorScene)),
      );
    });
  };

  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          io.disconnect();
          mount();
        }
      },
      { rootMargin: '500px' }, // start loading a bit before it scrolls into view
    );
    io.observe(rootElement);
  } else {
    mount();
  }
} else {
  // eslint-disable-next-line no-console
  console.error('Could not find #react-respirator-root to mount the 3D respirator showcase!');
}
