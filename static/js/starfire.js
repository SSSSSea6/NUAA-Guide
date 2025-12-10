(function () {
  const qs = (sel, root = document) => root.querySelector(sel);
  const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const notify = (msg, type = "info") => {
    const box = document.createElement("div");
    box.className = `toast toast--${type}`;
    box.textContent = msg;
    document.body.appendChild(box);
    requestAnimationFrame(() => box.classList.add("is-visible"));
    setTimeout(() => {
      box.classList.remove("is-visible");
      setTimeout(() => box.remove(), 300);
    }, 2600);
  };

  const resolveApiBase = (form) => {
    const fromWindow = (window.STARFIRE_API_BASE || "").trim();
    const fromAttr = (form?.dataset?.apiBase || "").trim();
    return fromWindow || fromAttr || "";
  };

  const toggleBlock = (form, type) => {
    qsa("[data-block]", form).forEach((block) => {
      block.hidden = block.dataset.block !== type;
    });
  };

  const updateSubjectCustom = (select, input) => {
    if (!select || !input) return;
    const isCustom = select.value === "__custom";
    input.hidden = !isCustom;
    input.required = isCustom;
    if (isCustom) {
      input.focus();
    } else {
      input.value = "";
    }
  };

  const rebuildLeaderboard = (container, entries) => {
    if (!container) return;
    container.innerHTML = "";
    (entries || []).forEach((item, idx) => {
      const li = document.createElement("li");
      li.className = "board-item";
      li.innerHTML = `
        <span class="board-rank">${idx + 1}</span>
        <span class="board-name">${item.name || "匿名"}</span>
        <span class="board-count">${item.count || 0} 份</span>
      `;
      container.appendChild(li);
    });
    if (!entries || entries.length === 0) {
      const empty = document.createElement("p");
      empty.className = "board-note";
      empty.textContent = "暂无数据，提交后将在此展示。";
      container.appendChild(empty);
    }
  };

  const fetchLeaderboard = async (apiBase, container) => {
    if (!apiBase) return;
    try {
      const url = apiBase.replace(/\/$/, "") + "/leaderboard";
      const res = await fetch(url, { credentials: "omit" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (Array.isArray(data)) {
        rebuildLeaderboard(container, data);
      }
    } catch (error) {
      console.warn("[starfire] leaderboard fetch failed:", error);
    }
  };

  const handleSubmit = (form, apiBase, leaderboardEl) => {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const submitBtn = qs("[data-role='submit-btn']", form);
      const api = resolveApiBase(form);
      if (!api) {
        notify("尚未配置后端接口（params.starfire_api_base），提交未发送。", "warn");
        return;
      }

      const fd = new FormData(form);
      const subject = fd.get("subject");
      if (subject === "__custom") {
        fd.set("subject", fd.get("subject_custom") || "");
      }
      fd.delete("subject_custom");

      const contrib = fd.get("contrib_type");
      if (contrib !== "sunrun") {
        fd.delete("student_id");
      }
      if (contrib !== "redpacket") {
        fd.delete("payment_code");
      }
      if (contrib !== "hero") {
        fd.set("anonymous", "1");
        fd.delete("display_name");
      }

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = "提交中…";
      }

      try {
        const url = api.replace(/\/$/, "") + "/submissions";
        const res = await fetch(url, {
          method: "POST",
          body: fd,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        notify("提交成功，感谢你的星火！", "success");
        form.reset();
        toggleBlock(form, "hero");
        updateSubjectCustom(qs("[data-role='subject-select']", form), qs("[data-role='subject-custom']", form));
        fetchLeaderboard(api, leaderboardEl);
      } catch (error) {
        console.error("[starfire] submit failed:", error);
        notify("提交失败，请稍后再试或检查接口。", "error");
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = "提交";
        }
      }
    });
  };

  const boot = () => {
    const forms = qsa("[data-starfire-form]");
    if (!forms.length) return;

    const leaderboard = qs("[data-role='leaderboard']");
    const refreshBtn = qs("[data-role='refresh-board']");
    const slider = qs("[data-role='slider']");
    const track = qs("[data-role='slider-track']", slider);
    const dots = qsa("[data-role='slider-dots'] .slider-dot", slider);
    const tabs = qsa("[data-role='slider-tabs'] .slider-tab", slider);
    const prevBtn = qs("[data-role='slider-prev']", slider);
    const nextBtn = qs("[data-role='slider-next']", slider);
    let current = 0;
    let touchStartX = 0;
    let touchDeltaX = 0;

    const goTo = (idx) => {
      const max = forms.length - 1;
      current = Math.max(0, Math.min(idx, max));
      if (track) {
        track.style.transform = `translateX(-${current * 100}%)`;
      }
      dots.forEach((dot, i) => dot.classList.toggle("is-active", i === current));
      tabs.forEach((tab, i) => tab.classList.toggle("is-active", i === current));
    };

    const bindSwipe = () => {
      if (!slider) return;
      slider.addEventListener("touchstart", (e) => {
        touchStartX = e.touches[0].clientX;
        touchDeltaX = 0;
      });
      slider.addEventListener("touchmove", (e) => {
        touchDeltaX = e.touches[0].clientX - touchStartX;
      });
      slider.addEventListener("touchend", () => {
        if (touchDeltaX > 50) {
          goTo(current - 1);
        } else if (touchDeltaX < -50) {
          goTo(current + 1);
        }
        touchStartX = 0;
        touchDeltaX = 0;
      });
    };

    dots.forEach((dot) => {
      dot.addEventListener("click", () => {
        const idx = parseInt(dot.dataset.index || "0", 10);
        goTo(idx);
      });
    });
    tabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        const idx = parseInt(tab.dataset.index || "0", 10);
        goTo(idx);
      });
    });
    prevBtn?.addEventListener("click", () => goTo(current - 1));
    nextBtn?.addEventListener("click", () => goTo(current + 1));
    bindSwipe();
    goTo(0);

    forms.forEach((form) => {
      const subjectSelect = qs("[data-role='subject-select']", form);
      const subjectCustom = qs("[data-role='subject-custom']", form);
      updateSubjectCustom(subjectSelect, subjectCustom);
      subjectSelect?.addEventListener("change", () => updateSubjectCustom(subjectSelect, subjectCustom));

      const apiBase = resolveApiBase(form);
      handleSubmit(form, apiBase, leaderboard);
    });

    const apiBaseGlobal = resolveApiBase(forms[0]);
    fetchLeaderboard(apiBaseGlobal, leaderboard);
    refreshBtn?.addEventListener("click", () => fetchLeaderboard(apiBaseGlobal, leaderboard));
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
