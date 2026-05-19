(function () {
  const root = document.querySelector('[data-materials-catalog]');
  if (!root) return;

  const coursesUrl = root.dataset.coursesUrl || '';
  const courseUrl = root.dataset.courseUrl || '';
  const ticketUrl = root.dataset.ticketUrl || '';
  const materialsSection = root.dataset.materialsSection || 'undergraduate';
  const coursesNode = root.querySelector('[data-materials-courses]');
  const statusNode = root.querySelector('[data-materials-status]');
  const coursesCacheKey = `nuaa-materials-courses:v2:${coursesUrl}`;
  const coursesCacheMaxAgeMs = 60 * 1000;

  let loaded = false;
  let loading = false;
  let statusTimer = 0;
  let catalogCourses = [];
  let activeCourseRequestId = 0;

  const setText = (node, text) => {
    if (node) node.textContent = text;
  };

  const normalizeText = (value, fallback) => {
    if (typeof value !== 'string') return fallback;
    const normalized = value.trim();
    return normalized || fallback;
  };

  const formatSize = (value) => {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) return '';
      if (!/^\d+(\.\d+)?$/.test(trimmed)) return trimmed;
    }
    const size = Number(value);
    if (!Number.isFinite(size) || size <= 0) return '';
    const units = ['B', 'KB', 'MB', 'GB'];
    let nextSize = size;
    let unitIndex = 0;
    while (nextSize >= 1024 && unitIndex < units.length - 1) {
      nextSize /= 1024;
      unitIndex += 1;
    }
    const precision = unitIndex === 0 || nextSize >= 10 ? 0 : 1;
    return `${nextSize.toFixed(precision)} ${units[unitIndex]}`;
  };

  const getCourseLetter = (course) => {
    const letter = normalizeText(course?.sortLetter, '').toUpperCase();
    if (/^[A-Z]$/.test(letter)) return letter;

    const source = normalizeText(course?.sortKey, normalizeText(course?.title, ''));
    const fallbackLetter = source.match(/[A-Za-z]/)?.[0]?.toUpperCase();
    return fallbackLetter || '#';
  };

  const getCourseSortKey = (course) => {
    return normalizeText(course?.sortKey, normalizeText(course?.title, '')).toLowerCase();
  };

  const getMaterialCount = (course) => {
    const count = Number(course?.materialCount);
    if (Number.isFinite(count) && count >= 0) return count;
    return Array.isArray(course?.materials) ? course.materials.length : 0;
  };

  const compareByCourseName = (a, b) => {
    const letterA = a.__letter || '#';
    const letterB = b.__letter || '#';
    if (letterA !== letterB) {
      if (letterA === '#') return 1;
      if (letterB === '#') return -1;
      return letterA.localeCompare(letterB, 'en-US');
    }
    const sortResult = a.__sortKey.localeCompare(b.__sortKey, 'zh-CN', {
      numeric: true,
      sensitivity: 'base'
    });
    if (sortResult !== 0) return sortResult;
    return a.__title.localeCompare(b.__title, 'zh-CN', {
      numeric: true,
      sensitivity: 'base'
    });
  };

  const normalizeCourses = (payload) => {
    const courses = Array.isArray(payload?.courses) ? payload.courses : [];

    return courses
      .map((course, index) => {
        const title = normalizeText(course?.title, '未分类');
        const id = normalizeText(course?.id, '') || `course-${index}-${title}`;
        const materials = Array.isArray(course?.materials) ? course.materials : null;
        return {
          ...course,
          __id: id,
          __title: title,
          __letter: getCourseLetter(course),
          __sortKey: getCourseSortKey(course),
          __materialsLoaded: Array.isArray(materials),
          materialCount: getMaterialCount(course),
          materials
        };
      })
      .filter((course) => course.materialCount > 0)
      .sort(compareByCourseName);
  };

  const findCourse = (courseId) => {
    return catalogCourses.find((course) => course.__id === courseId) || null;
  };

  const updateCourse = (course) => {
    const index = catalogCourses.findIndex((item) => item.__id === course.__id);
    if (index >= 0) {
      catalogCourses[index] = course;
    }
    return course;
  };

  const getCurrentCourseId = () => {
    const url = new URL(window.location.href);
    return url.searchParams.get('course') || '';
  };

  const buildCourseUrl = (courseId) => {
    const url = new URL(window.location.href);
    url.searchParams.set('course', courseId);
    url.hash = '';
    return url.toString();
  };

  const buildIndexUrl = () => {
    const url = new URL(window.location.href);
    url.searchParams.delete('course');
    url.hash = '';
    return url.toString();
  };

  const buildCourseDetailUrl = (courseId) => {
    const endpoint = new URL(courseUrl, window.location.origin);
    endpoint.searchParams.set('section', materialsSection);
    endpoint.searchParams.set('id', courseId);
    return endpoint.toString();
  };

  const readCoursesCache = () => {
    if (!coursesCacheKey || typeof sessionStorage === 'undefined') return null;
    try {
      const cached = JSON.parse(sessionStorage.getItem(coursesCacheKey) || 'null');
      if (!cached || typeof cached !== 'object') return null;
      if (!cached.payload || !Array.isArray(cached.payload.courses)) return null;
      const fetchedAt = Number(cached.fetchedAt || 0);
      return { payload: cached.payload, fetchedAt };
    } catch {
      return null;
    }
  };

  const writeCoursesCache = (payload) => {
    if (!coursesCacheKey || typeof sessionStorage === 'undefined') return;
    try {
      sessionStorage.setItem(coursesCacheKey, JSON.stringify({
        fetchedAt: Date.now(),
        payload
      }));
    } catch (error) {
      console.warn('[materials] unable to write courses cache:', error);
    }
  };

  const setTemporaryStatus = (message) => {
    setText(statusNode, message);
    window.clearTimeout(statusTimer);
    statusTimer = window.setTimeout(() => {
      if (loaded) setText(statusNode, '');
    }, 2600);
  };

  const createMeta = (material) => {
    const parts = [
      normalizeText(material?.extension, '').replace(/^\./, '').toUpperCase(),
      formatSize(material?.size)
    ].filter(Boolean);
    const meta = document.createElement('span');
    meta.className = 'materials-directory__meta';
    meta.textContent = parts.join(' / ');
    return meta;
  };

  const createMaterialRow = (material) => {
    const row = document.createElement('li');
    row.className = 'materials-directory__item';

    const text = document.createElement('div');
    text.className = 'materials-directory__item-text';

    const title = document.createElement('span');
    title.className = 'materials-directory__title';
    title.textContent = normalizeText(material?.title, '未命名资料');
    text.append(title, createMeta(material));

    const key = normalizeText(material?.key, '');
    if (key && ticketUrl) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'materials-directory__download';
      button.dataset.materialKey = key;
      button.textContent = '下载';
      row.append(text, button);
    } else {
      const unavailable = document.createElement('span');
      unavailable.className = 'materials-directory__download is-disabled';
      unavailable.textContent = '不可用';
      row.append(text, unavailable);
    }

    return row;
  };

  const createCourseLink = (course) => {
    const link = document.createElement('a');
    link.className = 'materials-course-link';
    link.href = buildCourseUrl(course.__id);
    link.dataset.courseId = course.__id;
    link.textContent = course.__title;
    return link;
  };

  const renderCourseIndex = () => {
    if (!coursesNode) return;
    const fragment = document.createDocumentFragment();
    let currentLetter = '';
    let currentGrid = null;

    catalogCourses.forEach((course) => {
      if (course.__letter !== currentLetter) {
        currentLetter = course.__letter;
        const group = document.createElement('section');
        group.className = 'materials-letter-group';

        const heading = document.createElement('h2');
        heading.textContent = currentLetter;

        currentGrid = document.createElement('div');
        currentGrid.className = 'materials-course-grid';

        group.append(heading, currentGrid);
        fragment.append(group);
      }
      currentGrid.append(createCourseLink(course));
    });

    coursesNode.replaceChildren(fragment);
    setText(statusNode, catalogCourses.length > 0 ? '' : '暂无资料');
  };

  const renderCourseDetail = (course, loadingMaterials) => {
    if (!coursesNode) return;

    const detail = document.createElement('section');
    detail.className = 'materials-directory__detail';

    const header = document.createElement('div');
    header.className = 'materials-directory__detail-header';

    const back = document.createElement('a');
    back.className = 'materials-directory__back';
    back.href = buildIndexUrl();
    back.dataset.materialsBack = 'true';
    back.textContent = '返回';

    const title = document.createElement('h2');
    title.textContent = course.__title;
    header.append(back, title);
    detail.append(header);

    if (loadingMaterials) {
      coursesNode.replaceChildren(detail);
      setText(statusNode, '加载中');
      return;
    }

    const materials = Array.isArray(course.materials) ? course.materials : [];
    if (materials.length > 0) {
      const list = document.createElement('ul');
      list.className = 'materials-directory__list';
      materials.forEach((material) => list.append(createMaterialRow(material)));
      detail.append(list);
      setText(statusNode, '');
    } else {
      setText(statusNode, '暂无资料');
    }
    coursesNode.replaceChildren(detail);
  };

  const normalizeCourseDetail = (payload, baseCourse) => {
    if (payload?.ok !== true || !payload?.course) {
      throw new Error('course detail response is invalid');
    }

    const course = payload.course;
    const materials = Array.isArray(course.materials) ? course.materials : [];
    const merged = {
      ...baseCourse,
      ...course,
      __id: baseCourse.__id,
      __title: normalizeText(course.title, baseCourse.__title),
      __letter: getCourseLetter(course),
      __sortKey: getCourseSortKey(course),
      __materialsLoaded: true,
      materialCount: materials.length,
      materials
    };
    return updateCourse(merged);
  };

  const fetchCourseDetail = async (course) => {
    if (!courseUrl) throw new Error('course endpoint is not configured');
    const response = await fetch(buildCourseDetailUrl(course.__id), {
      method: 'GET',
      mode: 'cors',
      credentials: 'omit',
      headers: { Accept: 'application/json' }
    });
    if (!response.ok) {
      throw new Error(`course detail request failed: ${response.status}`);
    }
    return normalizeCourseDetail(await response.json(), course);
  };

  const showCourseDetail = async (course) => {
    if (!course) return;
    if (course.__materialsLoaded) {
      renderCourseDetail(course, false);
      return;
    }

    const requestId = activeCourseRequestId + 1;
    activeCourseRequestId = requestId;
    renderCourseDetail(course, true);

    try {
      const detailedCourse = await fetchCourseDetail(course);
      if (requestId === activeCourseRequestId && getCurrentCourseId() === course.__id) {
        renderCourseDetail(detailedCourse, false);
      }
    } catch (error) {
      console.warn('[materials] unable to load course detail:', error);
      if (requestId === activeCourseRequestId && getCurrentCourseId() === course.__id) {
        renderCourseDetail(course, false);
        setTemporaryStatus('加载失败');
      }
    }
  };

  const renderCurrentView = () => {
    const courseId = getCurrentCourseId();
    if (!courseId) {
      activeCourseRequestId += 1;
      renderCourseIndex();
      return;
    }

    const course = findCourse(courseId);
    if (course) {
      showCourseDetail(course);
      return;
    }

    renderCourseIndex();
    setTemporaryStatus('课程不存在');
    const url = new URL(window.location.href);
    url.searchParams.delete('course');
    window.history.replaceState({}, '', url);
  };

  const applyCoursesPayload = (payload) => {
    catalogCourses = normalizeCourses(payload);
    loaded = true;
    renderCurrentView();
  };

  const loadCourses = async (force) => {
    if (!coursesUrl || loading) return;

    const cached = force ? null : readCoursesCache();
    if (cached && !loaded) {
      applyCoursesPayload(cached.payload);
    }
    if (!force && cached && Date.now() - cached.fetchedAt < coursesCacheMaxAgeMs) {
      return;
    }

    loading = true;
    if (!loaded) setText(statusNode, '加载中');

    try {
      const response = await fetch(coursesUrl, {
        method: 'GET',
        mode: 'cors',
        credentials: 'omit',
        headers: { Accept: 'application/json' }
      });
      if (!response.ok) {
        throw new Error(`courses request failed: ${response.status}`);
      }
      const payload = await response.json();
      if (payload?.ok !== true || !Array.isArray(payload.courses)) {
        throw new Error('courses response is invalid');
      }
      writeCoursesCache(payload);
      applyCoursesPayload(payload);
    } catch (error) {
      console.warn('[materials] unable to load courses:', error);
      if (!loaded) {
        setText(statusNode, '加载失败');
        if (coursesNode) coursesNode.replaceChildren();
      }
    } finally {
      loading = false;
    }
  };

  const requestDownloadTicket = async (key) => {
    const response = await fetch(ticketUrl, {
      method: 'POST',
      mode: 'cors',
      credentials: 'omit',
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        section: materialsSection,
        key
      })
    });

    if (!response.ok) {
      throw new Error(`download ticket request failed: ${response.status}`);
    }

    const payload = await response.json();
    const url = normalizeText(payload?.url, '');
    if (payload?.ok !== true || !url) {
      throw new Error('download ticket response is invalid');
    }
    return url;
  };

  const openTicketDownload = async (button) => {
    if (!button || button.dataset.downloadBusy === 'true') return;

    const key = normalizeText(button.dataset.materialKey, '');
    if (!key || !ticketUrl) {
      setTemporaryStatus('下载失败，请重试');
      window.alert('下载失败，请重试');
      return;
    }

    const pendingWindow = window.open('', '_blank');
    if (!pendingWindow) {
      setTemporaryStatus('下载失败，请重试');
      window.alert('下载失败，请重试');
      return;
    }
    pendingWindow.opener = null;
    button.dataset.downloadBusy = 'true';
    button.disabled = true;
    button.textContent = '准备中';

    try {
      pendingWindow.location.href = await requestDownloadTicket(key);
    } catch (error) {
      console.warn('[materials] download unavailable:', error);
      if (pendingWindow) pendingWindow.close();
      setTemporaryStatus('下载失败，请重试');
      window.alert('下载失败，请重试');
    } finally {
      button.dataset.downloadBusy = 'false';
      button.disabled = false;
      button.textContent = '下载';
    }
  };

  const handleCatalogClick = (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const downloadButton = target.closest('.materials-directory__download[data-material-key]');
    if (downloadButton) {
      event.preventDefault();
      openTicketDownload(downloadButton);
      return;
    }

    const courseLink = target.closest('[data-course-id]');
    if (courseLink) {
      event.preventDefault();
      const courseId = courseLink.dataset.courseId;
      const course = findCourse(courseId);
      if (!course) return;
      window.history.pushState({}, '', buildCourseUrl(courseId));
      showCourseDetail(course);
      root.scrollIntoView({ block: 'start' });
      return;
    }

    const backLink = target.closest('[data-materials-back]');
    if (backLink) {
      event.preventDefault();
      window.history.pushState({}, '', buildIndexUrl());
      renderCourseIndex();
      root.scrollIntoView({ block: 'start' });
    }
  };

  coursesNode?.addEventListener('click', handleCatalogClick);
  window.addEventListener('popstate', renderCurrentView);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => loadCourses(false), { once: true });
  } else {
    loadCourses(false);
  }
})();
