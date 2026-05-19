(function () {
  const root = document.querySelector('[data-materials-catalog]');
  if (!root) return;

  const catalogUrl = root.dataset.catalogUrl || '';
  const downloadBaseUrl = root.dataset.downloadUrl || '';
  const materialsSection = root.dataset.materialsSection || 'undergraduate';
  const coursesNode = root.querySelector('[data-materials-courses]');
  const statusNode = root.querySelector('[data-materials-status]');
  const isTestCatalog = (() => {
    try {
      return new URL(catalogUrl).hostname === 'test-upload.nuaa.cc';
    } catch {
      return false;
    }
  })();

  let loaded = false;
  let loading = false;
  let statusTimer = 0;
  let catalogCourses = [];

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
    const courses = Array.isArray(payload?.catalog?.courses)
      ? payload.catalog.courses
      : [];

    return courses
      .map((course, index) => {
        const materials = Array.isArray(course?.materials) ? course.materials : [];
        const title = normalizeText(course?.title, '未分类');
        const id = normalizeText(course?.id, '') || `course-${index}-${title}`;
        return {
          ...course,
          __id: id,
          __title: title,
          __letter: getCourseLetter(course),
          __sortKey: getCourseSortKey(course),
          materials
        };
      })
      .filter((course) => course.materials.length > 0)
      .sort(compareByCourseName);
  };

  const findCourse = (courseId) => {
    return catalogCourses.find((course) => course.__id === courseId) || null;
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

  const normalizePublicUrl = (value) => {
    const publicUrl = normalizeText(value, '');
    if (!publicUrl) return '';
    try {
      const url = new URL(publicUrl);
      if (isTestCatalog && url.hostname === 'assets.nuaa.cc') {
        url.hostname = 'test-assets.nuaa.cc';
      }
      return url.toString();
    } catch {
      return publicUrl;
    }
  };

  const getWorkerDownloadUrl = (material) => {
    const key = normalizeText(material?.key, '');
    if (!key || !downloadBaseUrl) return '';
    try {
      const endpoint = new URL(downloadBaseUrl, window.location.origin);
      endpoint.searchParams.set('section', materialsSection);
      endpoint.searchParams.set('key', key);
      return endpoint.toString();
    } catch {
      return `${downloadBaseUrl}?section=${encodeURIComponent(materialsSection)}&key=${encodeURIComponent(key)}`;
    }
  };

  const getDownloadTarget = (material) => {
    const publicUrl = normalizeText(material?.publicUrl, '');
    const normalizedPublicUrl = normalizePublicUrl(publicUrl);
    const workerUrl = getWorkerDownloadUrl(material);
    return {
      openUrl: normalizedPublicUrl || workerUrl,
      checkUrl: workerUrl || normalizedPublicUrl
    };
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

    const target = getDownloadTarget(material);
    if (target.openUrl) {
      const link = document.createElement('a');
      link.className = 'materials-directory__download';
      link.href = target.openUrl;
      link.target = '_blank';
      link.rel = 'noopener';
      link.dataset.noTransition = 'true';
      link.dataset.openUrl = target.openUrl;
      link.dataset.checkUrl = target.checkUrl;
      link.textContent = '下载';
      row.append(text, link);
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

  const renderCourseDetail = (course) => {
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

    const list = document.createElement('ul');
    list.className = 'materials-directory__list';
    course.materials.forEach((material) => list.append(createMaterialRow(material)));

    detail.append(header, list);
    coursesNode.replaceChildren(detail);
    setText(statusNode, '');
  };

  const renderCurrentView = () => {
    const courseId = getCurrentCourseId();
    if (!courseId) {
      renderCourseIndex();
      return;
    }

    const course = findCourse(courseId);
    if (course) {
      renderCourseDetail(course);
      return;
    }

    renderCourseIndex();
    setTemporaryStatus('课程不存在');
    const url = new URL(window.location.href);
    url.searchParams.delete('course');
    window.history.replaceState({}, '', url);
  };

  const loadCatalog = async (force) => {
    if (!catalogUrl || loading || (loaded && !force)) return;
    loading = true;
    setText(statusNode, '加载中');

    try {
      const response = await fetch(catalogUrl, {
        method: 'GET',
        mode: 'cors',
        credentials: 'omit',
        cache: 'no-store',
        headers: { Accept: 'application/json' }
      });
      if (!response.ok) {
        throw new Error(`catalog request failed: ${response.status}`);
      }
      catalogCourses = normalizeCourses(await response.json());
      loaded = true;
      renderCurrentView();
    } catch (error) {
      console.warn('[materials] unable to load catalog:', error);
      setText(statusNode, '加载失败');
      if (coursesNode) coursesNode.replaceChildren();
    } finally {
      loading = false;
    }
  };

  const verifyDownload = async (url) => {
    if (!url) return false;
    const response = await fetch(url, {
      method: 'HEAD',
      mode: 'cors',
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'follow'
    });
    return response.ok;
  };

  const openVerifiedDownload = async (link) => {
    if (!link || link.dataset.downloadBusy === 'true') return;

    const openUrl = link.dataset.openUrl || link.href;
    const checkUrl = link.dataset.checkUrl || openUrl;
    const pendingWindow = window.open('', '_blank');
    if (!pendingWindow) {
      setTemporaryStatus('请允许新标签页');
      window.alert('请允许浏览器打开新标签页');
      return;
    }
    pendingWindow.opener = null;
    link.dataset.downloadBusy = 'true';
    link.textContent = '检查中';

    try {
      const ok = await verifyDownload(checkUrl);
      if (!ok) {
        throw new Error('download unavailable');
      }
      pendingWindow.location.href = openUrl;
    } catch (error) {
      console.warn('[materials] download unavailable:', error);
      if (pendingWindow) pendingWindow.close();
      setTemporaryStatus('下载失败');
      window.alert('下载失败');
    } finally {
      link.dataset.downloadBusy = 'false';
      link.textContent = '下载';
    }
  };

  const handleCatalogClick = (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const downloadLink = target.closest('.materials-directory__download[href]');
    if (downloadLink) {
      event.preventDefault();
      openVerifiedDownload(downloadLink);
      return;
    }

    const courseLink = target.closest('[data-course-id]');
    if (courseLink) {
      event.preventDefault();
      const courseId = courseLink.dataset.courseId;
      const course = findCourse(courseId);
      if (!course) return;
      window.history.pushState({}, '', buildCourseUrl(courseId));
      renderCourseDetail(course);
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
    document.addEventListener('DOMContentLoaded', () => loadCatalog(false), { once: true });
  } else {
    loadCatalog(false);
  }
})();
