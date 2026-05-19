(function () {
  if (document.querySelector('[data-materials-catalog]')) return;

  const script = document.currentScript;
  const coursesUrl = script?.dataset.coursesUrl || '';
  if (!coursesUrl) return;

  const coursesCacheKey = `nuaa-materials-courses:v2:${coursesUrl}`;
  const coursesCacheMaxAgeMs = 60 * 1000;

  const hasFreshCache = () => {
    if (typeof sessionStorage === 'undefined') return false;
    try {
      const cached = JSON.parse(sessionStorage.getItem(coursesCacheKey) || 'null');
      const fetchedAt = Number(cached?.fetchedAt || 0);
      return Boolean(cached?.payload?.courses?.length) && Date.now() - fetchedAt < coursesCacheMaxAgeMs;
    } catch {
      return false;
    }
  };

  const writeCache = (payload) => {
    if (typeof sessionStorage === 'undefined') return;
    try {
      sessionStorage.setItem(coursesCacheKey, JSON.stringify({
        fetchedAt: Date.now(),
        payload
      }));
    } catch {}
  };

  const prefetchCourses = async () => {
    if (hasFreshCache()) return;
    try {
      const response = await fetch(coursesUrl, {
        method: 'GET',
        mode: 'cors',
        credentials: 'omit',
        headers: { Accept: 'application/json' }
      });
      if (!response.ok) return;
      const payload = await response.json();
      if (payload?.ok === true && Array.isArray(payload.courses)) {
        writeCache(payload);
      }
    } catch {}
  };

  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(prefetchCourses, { timeout: 3000 });
  } else {
    window.setTimeout(prefetchCourses, 1400);
  }
})();
