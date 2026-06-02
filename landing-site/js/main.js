/**
 * PulmoFlow Landing Page – Main JavaScript
 * Handles: scroll reveals, smooth navigation, counter animations,
 *          mobile menu, active nav link highlighting, network tabs.
 */

document.addEventListener('DOMContentLoaded', () => {
  /* ──────────────────────────────────────────────
   * Utility: throttle — limits callback to once per `wait` ms
   * ────────────────────────────────────────────── */
  function throttle(fn, wait = 100) {
    let last = 0;
    return (...args) => {
      const now = Date.now();
      if (now - last >= wait) {
        last = now;
        fn(...args);
      }
    };
  }

  /* ──────────────────────────────────────────────
   * 1. Navigation — scrolled background class
   * ────────────────────────────────────────────── */
  const mainNav = document.getElementById('main-nav');

  function updateNavBackground() {
    if (!mainNav) return;
    mainNav.classList.toggle('scrolled', window.scrollY > 50);
  }

  /* ──────────────────────────────────────────────
   * 2. Active navigation link highlighting
   * ────────────────────────────────────────────── */
  const NAV_OFFSET = 120; // px below top to consider "in view"
  const navSections = [
    'problem', 'solution', 'features',
    'product', 'technology', 'comparison', 'team'
  ];
  const desktopLinks = document.querySelectorAll('.nav-links a');
  const mobileLinks  = document.querySelectorAll('.nav-mobile a');

  function setActiveLink() {
    let currentId = '';

    // Walk through every candidate section; the last one whose top
    // is above the offset line wins (accounts for overlapping regions).
    for (const id of navSections) {
      const section = document.getElementById(id);
      if (section && section.getBoundingClientRect().top <= NAV_OFFSET) {
        currentId = id;
      }
    }

    const selector = currentId ? `#${currentId}` : '';

    desktopLinks.forEach(link => {
      link.classList.toggle('active', link.getAttribute('href') === `#${currentId}`);
    });
    mobileLinks.forEach(link => {
      link.classList.toggle('active', link.getAttribute('href') === `#${currentId}`);
    });
  }

  // Combine scroll-driven updates and throttle them
  const onScroll = throttle(() => {
    updateNavBackground();
    setActiveLink();
  }, 80);

  window.addEventListener('scroll', onScroll, { passive: true });

  // Run once on load
  updateNavBackground();
  setActiveLink();

  /* ──────────────────────────────────────────────
   * 3. Smooth scroll for anchor links
   * ────────────────────────────────────────────── */
  const NAV_HEIGHT = 70; // fixed-nav offset

  document.addEventListener('click', (e) => {
    const anchor = e.target.closest('a[href^="#"]');
    if (!anchor) return;

    const targetId = anchor.getAttribute('href');
    if (targetId === '#') return;

    const target = document.querySelector(targetId);
    if (!target) return;

    e.preventDefault();
    const top = target.getBoundingClientRect().top + window.scrollY - NAV_HEIGHT;
    window.scrollTo({ top, behavior: 'smooth' });
  });

  /* ──────────────────────────────────────────────
   * 4. Mobile menu toggle
   * ────────────────────────────────────────────── */
  const navToggle = document.getElementById('nav-toggle');
  const navMobile = document.getElementById('nav-mobile');

  if (navToggle && navMobile) {
    navToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      navMobile.classList.toggle('active');
    });

    // Close menu when any mobile link is tapped
    navMobile.addEventListener('click', (e) => {
      if (e.target.closest('a')) {
        navMobile.classList.remove('active');
      }
    });

    // Close menu on outside click
    document.addEventListener('click', (e) => {
      if (!navMobile.contains(e.target) && !navToggle.contains(e.target)) {
        navMobile.classList.remove('active');
      }
    });
  }

  /* ──────────────────────────────────────────────
   * 5. Scroll-triggered reveal animations
   * ────────────────────────────────────────────── */
  const revealElements = document.querySelectorAll('.reveal');

  if (revealElements.length) {
    const revealObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('active');
            revealObserver.unobserve(entry.target); // one-time reveal
          }
        });
      },
      { threshold: 0.1, rootMargin: '0px 0px -50px 0px' }
    );

    revealElements.forEach((el) => revealObserver.observe(el));
  }

  /* ──────────────────────────────────────────────
   * 6. Counter animations (requestAnimationFrame)
   * ────────────────────────────────────────────── */
  const COUNTER_DURATION = 2000; // ms

  function animateCounter(el) {
    const target  = parseFloat(el.dataset.target) || 0;
    const suffix  = el.dataset.suffix || '';
    const prefix  = el.dataset.prefix || '';
    const isFloat = String(target).includes('.');
    const start   = performance.now();

    function step(now) {
      const elapsed  = now - start;
      const progress = Math.min(elapsed / COUNTER_DURATION, 1);
      // Ease-out quad for a natural feel
      const eased = 1 - Math.pow(1 - progress, 3);
      const value = eased * target;

      el.textContent = prefix + (isFloat ? value.toFixed(1) : Math.floor(value)) + suffix;

      if (progress < 1) {
        requestAnimationFrame(step);
      } else {
        // Ensure we land exactly on the target
        el.textContent = prefix + (isFloat ? target.toFixed(1) : target) + suffix;
      }
    }

    requestAnimationFrame(step);
  }

  const counterElements = document.querySelectorAll('.counter');

  if (counterElements.length) {
    const counterObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            animateCounter(entry.target);
            counterObserver.unobserve(entry.target); // only animate once
          }
        });
      },
      { threshold: 0.3 }
    );

    counterElements.forEach((el) => counterObserver.observe(el));
  }

  /* ──────────────────────────────────────────────
   * 7. Network diagram tab switching
   * ────────────────────────────────────────────── */
  const netBtnA  = document.getElementById('net-btn-a');
  const netBtnB  = document.getElementById('net-btn-b');
  const networkA = document.getElementById('network-a');
  const networkB = document.getElementById('network-b');

  function switchNetwork(activeBtn, inactiveBtn, showDiv, hideDiv) {
    activeBtn.classList.add('active');
    inactiveBtn.classList.remove('active');
    showDiv.classList.add('active');
    hideDiv.classList.remove('active');
  }

  if (netBtnA && netBtnB && networkA && networkB) {
    netBtnA.addEventListener('click', () =>
      switchNetwork(netBtnA, netBtnB, networkA, networkB)
    );
    netBtnB.addEventListener('click', () =>
      switchNetwork(netBtnB, netBtnA, networkB, networkA)
    );
  }
});
