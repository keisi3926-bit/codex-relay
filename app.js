(function () {
  "use strict";

  const STORAGE_KEY = "codex-relay-state-v1";
  const defaults = window.CODEX_RELAY_DEFAULTS;
  const clone = (value) => JSON.parse(JSON.stringify(value));

  const initialState = {
    links: clone(defaults.links),
    templates: clone(defaults.templates),
    sns: clone(defaults.sns),
    schedules: [],
    attachments: {},
    activeTemplateId: null,
    activeSnsId: "x"
  };

  let state = loadState();
  let activeTemplate = null;
  let toastTimer = null;

  const $ = (selector, parent = document) => parent.querySelector(selector);
  const $$ = (selector, parent = document) => [...parent.querySelectorAll(selector)];

  const elements = {
    templateGrid: $("#templateGrid"),
    scheduleList: $("#scheduleList"),
    scheduleNotice: $("#scheduleNotice"),
    composeTitle: $("#composeTitle"),
    snsSelect: $("#snsSelect"),
    postBody: $("#postBody"),
    postPreview: $("#postPreview"),
    previewCount: $("#previewCount"),
    characterCount: $("#characterCount"),
    characterLimit: $("#characterLimit"),
    counterCard: $("#counterCard"),
    linkError: $("#linkError"),
    scheduleInput: $("#scheduleInput"),
    attachmentInput: $("#attachmentInput"),
    attachmentList: $("#attachmentList"),
    settingsDialog: $("#settingsDialog"),
    templateDialog: $("#templateDialog"),
    toast: $("#toast")
  };

  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (!saved) return clone(initialState);
      return {
        ...clone(initialState),
        ...saved,
        links: { ...clone(defaults.links), ...(saved.links || {}) },
        templates: saved.templates?.length ? saved.templates : clone(defaults.templates),
        sns: mergeSns(saved.sns)
      };
    } catch {
      return clone(initialState);
    }
  }

  function mergeSns(savedSns = []) {
    return defaults.sns.map((item) => ({
      ...item,
      ...(savedSns.find((saved) => saved.id === item.id) || {})
    }));
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function showView(name) {
    $$(".view").forEach((view) => view.classList.toggle("active", view.dataset.view === name));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function expandLinks(text) {
    const missing = new Set();
    const expanded = text.replace(/\{link:([a-zA-Z0-9_-]+)\}/g, (match, key) => {
      if (!state.links[key]) {
        missing.add(key);
        return match;
      }
      return state.links[key];
    });
    return { expanded, missing: [...missing] };
  }

  function countCharacters(text) {
    return [...text].length;
  }

  function getActiveSns() {
    return state.sns.find((sns) => sns.id === elements.snsSelect.value) || state.sns[0];
  }

  function renderHome() {
    elements.templateGrid.innerHTML = state.templates
      .map(
        (template) => `
          <button class="template-card" type="button" data-template-id="${escapeHtml(template.id)}"
            style="--card-accent:${escapeHtml(template.accent || "#64748b")}">
            <span class="template-icon">${escapeHtml(template.name.slice(0, 1))}</span>
            <span class="template-card-copy">
              <strong>${escapeHtml(template.name)}</strong>
              <small>投稿を準備する</small>
            </span>
            <span class="template-arrow">→</span>
          </button>
        `
      )
      .join("");

    $$(".template-card", elements.templateGrid).forEach((button) => {
      button.addEventListener("click", () => openTemplate(button.dataset.templateId));
    });

    renderSchedules();
  }

  function renderSchedules() {
    const sorted = [...state.schedules].sort((a, b) => new Date(a.at) - new Date(b.at));
    const now = Date.now();
    elements.scheduleList.innerHTML = sorted.length
      ? sorted
          .map((schedule) => {
            const template = state.templates.find((item) => item.id === schedule.templateId);
            const overdue = new Date(schedule.at).getTime() < now;
            return `
              <article class="schedule-item ${overdue ? "overdue" : ""}">
                <span class="schedule-dot"></span>
                <div>
                  <strong>${escapeHtml(template?.name || "削除済みテンプレート")}</strong>
                  <small>${escapeHtml(formatDate(schedule.at))}${overdue ? "・時刻を過ぎています" : ""}</small>
                </div>
                <button class="text-button" type="button" data-open-schedule="${escapeHtml(schedule.id)}">開く</button>
                <button class="delete-button" type="button" data-delete-schedule="${escapeHtml(schedule.id)}" aria-label="予定を削除">×</button>
              </article>
            `;
          })
          .join("")
      : `<div class="empty-state">登録済みの投稿予定はありません。</div>`;

    $$("[data-open-schedule]").forEach((button) => {
      button.addEventListener("click", () => {
        const schedule = state.schedules.find((item) => item.id === button.dataset.openSchedule);
        if (schedule) openTemplate(schedule.templateId, schedule);
      });
    });

    $$("[data-delete-schedule]").forEach((button) => {
      button.addEventListener("click", () => {
        state.schedules = state.schedules.filter((item) => item.id !== button.dataset.deleteSchedule);
        saveState();
        renderSchedules();
        showToast("投稿予定を削除しました");
      });
    });

    const approaching = sorted.find((schedule) => {
      const distance = new Date(schedule.at).getTime() - now;
      return distance >= -60 * 60 * 1000 && distance <= 24 * 60 * 60 * 1000;
    });
    elements.scheduleNotice.classList.toggle("hidden", !approaching);
    if (approaching) {
      const template = state.templates.find((item) => item.id === approaching.templateId);
      elements.scheduleNotice.textContent = `投稿予定が近づいています：${template?.name || "投稿"}（${formatDate(approaching.at)}）`;
    }
  }

  function openTemplate(templateId, schedule = null) {
    activeTemplate = state.templates.find((item) => item.id === templateId);
    if (!activeTemplate) return;
    state.activeTemplateId = templateId;
    elements.composeTitle.textContent = activeTemplate.name;
    elements.postBody.value = schedule?.body ?? activeTemplate.body;
    elements.scheduleInput.value = schedule?.at?.slice(0, 16) || "";
    elements.snsSelect.value = schedule?.snsId || state.activeSnsId || "x";
    elements.attachmentInput.value = "";
    updateComposer();
    renderAttachments();
    saveState();
    showView("compose");
  }

  function renderSnsOptions() {
    elements.snsSelect.innerHTML = state.sns
      .map((sns) => `<option value="${escapeHtml(sns.id)}">${escapeHtml(sns.name)}</option>`)
      .join("");
    elements.snsSelect.value = state.activeSnsId || "x";
  }

  function updateComposer() {
    const { expanded, missing } = expandLinks(elements.postBody.value);
    const sns = getActiveSns();
    const count = countCharacters(expanded);
    const overLimit = count > sns.limit;
    elements.postPreview.textContent = expanded || "ここにリンク展開後の本文が表示されます。";
    elements.postPreview.classList.toggle("placeholder", !expanded);
    elements.previewCount.textContent = `${count}文字`;
    elements.characterCount.textContent = count;
    elements.characterLimit.textContent = `/ ${sns.limit}`;
    elements.counterCard.classList.toggle("over-limit", overLimit);
    elements.linkError.textContent = missing.length
      ? `未登録のリンクキー：${missing.join(", ")}`
      : overLimit
        ? `${sns.name} の設定上限を ${count - sns.limit} 文字超えています。`
        : "";
    elements.linkError.classList.toggle("error", missing.length > 0 || overLimit);
    state.activeSnsId = sns.id;
    saveState();
  }

  async function copyPost() {
    const { expanded } = expandLinks(elements.postBody.value);
    if (!expanded.trim()) {
      showToast("コピーする本文がありません");
      return;
    }
    try {
      await navigator.clipboard.writeText(expanded);
    } catch {
      const helper = document.createElement("textarea");
      helper.value = expanded;
      document.body.appendChild(helper);
      helper.select();
      document.execCommand("copy");
      helper.remove();
    }
    showToast("本文をコピーしました");
  }

  function openSns() {
    const sns = getActiveSns();
    const { expanded } = expandLinks(elements.postBody.value);
    const url = sns.launchUrl.replace("{text}", encodeURIComponent(expanded));
    if (!sns.supportsPrefill) {
      copyPost();
      showToast(`${sns.name}を開きます。本文はコピー済みです`);
    }
    window.open(url, "_blank", "noopener,noreferrer");
  }

  function saveSchedule() {
    if (!activeTemplate || !elements.scheduleInput.value) {
      showToast("投稿予定日時を入力してください");
      return;
    }
    const existing = state.schedules.find(
      (item) => item.templateId === activeTemplate.id && item.at === elements.scheduleInput.value
    );
    const record = {
      id: existing?.id || crypto.randomUUID(),
      templateId: activeTemplate.id,
      snsId: elements.snsSelect.value,
      at: elements.scheduleInput.value,
      body: elements.postBody.value
    };
    state.schedules = existing
      ? state.schedules.map((item) => (item.id === existing.id ? record : item))
      : [...state.schedules, record];
    saveState();
    renderSchedules();
    showToast("投稿予定を保存しました");
  }

  function handleAttachments(files) {
    if (!activeTemplate) return;
    state.attachments[activeTemplate.id] = [...files].map((file) => ({
      name: file.name,
      type: file.type,
      size: file.size
    }));
    saveState();
    renderAttachments();
  }

  function renderAttachments() {
    const files = state.attachments[activeTemplate?.id] || [];
    elements.attachmentList.innerHTML = files.length
      ? files
          .map(
            (file, index) => `
              <li>
                <span>${file.type.startsWith("video") ? "🎬" : "🖼️"}</span>
                <span class="attachment-name">${escapeHtml(file.name)}<small>${formatBytes(file.size)}</small></span>
                <button type="button" data-remove-attachment="${index}" aria-label="添付を外す">×</button>
              </li>
            `
          )
          .join("")
      : "";
    $$("[data-remove-attachment]", elements.attachmentList).forEach((button) => {
      button.addEventListener("click", () => {
        state.attachments[activeTemplate.id].splice(Number(button.dataset.removeAttachment), 1);
        saveState();
        renderAttachments();
      });
    });
  }

  function saveCurrentTemplate() {
    if (!activeTemplate) return;
    activeTemplate.body = elements.postBody.value;
    state.templates = state.templates.map((item) => (item.id === activeTemplate.id ? activeTemplate : item));
    saveState();
    renderHome();
    showToast("テンプレートを更新しました");
  }

  function openSettings() {
    renderSettings();
    elements.settingsDialog.showModal();
  }

  function renderSettings() {
    $("#linkSettingsList").innerHTML = Object.entries(state.links)
      .map(
        ([key, url]) => `
          <div class="setting-row link-setting">
            <input type="text" value="${escapeHtml(key)}" data-link-key aria-label="リンクキー" />
            <input type="url" value="${escapeHtml(url)}" data-link-url aria-label="URL" />
            <button class="delete-button" type="button" data-remove-link>×</button>
          </div>
        `
      )
      .join("");

    $("#templateSettingsList").innerHTML = state.templates
      .map(
        (template) => `
          <div class="setting-card" data-template-setting="${escapeHtml(template.id)}">
            <div class="setting-row">
              <input type="text" value="${escapeHtml(template.name)}" data-template-name aria-label="作品名" />
              <input type="color" value="${escapeHtml(template.accent || "#64748b")}" data-template-accent aria-label="色" />
              <button class="delete-button" type="button" data-remove-template>×</button>
            </div>
            <textarea rows="4" data-template-body aria-label="テンプレート本文">${escapeHtml(template.body)}</textarea>
          </div>
        `
      )
      .join("");

    $("#snsSettingsList").innerHTML = state.sns
      .map(
        (sns) => `
          <div class="setting-row sns-setting" data-sns-setting="${escapeHtml(sns.id)}">
            <strong>${escapeHtml(sns.name)}</strong>
            <label>文字数上限 <input type="number" min="1" max="100000" value="${sns.limit}" data-sns-limit /></label>
          </div>
        `
      )
      .join("");

    bindSettingsDeleteButtons();
  }

  function bindSettingsDeleteButtons() {
    $$("[data-remove-link]").forEach((button) => {
      button.addEventListener("click", () => button.closest(".link-setting").remove());
    });
    $$("[data-remove-template]").forEach((button) => {
      button.addEventListener("click", () => button.closest(".setting-card").remove());
    });
  }

  function addLinkRow() {
    const row = document.createElement("div");
    row.className = "setting-row link-setting";
    row.innerHTML = `
      <input type="text" placeholder="キー" data-link-key aria-label="リンクキー" />
      <input type="url" placeholder="https://..." data-link-url aria-label="URL" />
      <button class="delete-button" type="button" data-remove-link>×</button>
    `;
    $("#linkSettingsList").appendChild(row);
    row.querySelector("[data-remove-link]").addEventListener("click", () => row.remove());
    row.querySelector("[data-link-key]").focus();
  }

  function saveSettings(event) {
    event.preventDefault();
    const links = {};
    $$(".link-setting").forEach((row) => {
      const key = $("[data-link-key]", row).value.trim();
      const url = $("[data-link-url]", row).value.trim();
      if (key && url) links[key] = url;
    });

    const templates = $$("[data-template-setting]").map((card) => {
      const old = state.templates.find((item) => item.id === card.dataset.templateSetting);
      return {
        ...old,
        name: $("[data-template-name]", card).value.trim() || old.name,
        accent: $("[data-template-accent]", card).value,
        body: $("[data-template-body]", card).value
      };
    });

    const sns = state.sns.map((item) => {
      const row = $(`[data-sns-setting="${item.id}"]`);
      return { ...item, limit: Math.max(1, Number($("[data-sns-limit]", row).value) || item.limit) };
    });

    state = { ...state, links, templates, sns };
    saveState();
    renderSnsOptions();
    renderHome();
    if (activeTemplate) {
      activeTemplate = state.templates.find((item) => item.id === activeTemplate.id) || null;
      if (activeTemplate) updateComposer();
    }
    elements.settingsDialog.close();
    showToast("設定を保存しました");
  }

  function createTemplate(event) {
    event.preventDefault();
    const name = $("#newTemplateName").value.trim();
    if (!name) {
      showToast("作品名を入力してください");
      return;
    }
    const id = `${slugify(name) || "template"}-${Date.now().toString(36)}`;
    state.templates.push({
      id,
      name,
      accent: "#22c55e",
      body: $("#newTemplateBody").value
    });
    saveState();
    renderHome();
    elements.templateDialog.close();
    $("#newTemplateName").value = "";
    $("#newTemplateBody").value = "";
    showToast("テンプレートを追加しました");
  }

  function slugify(value) {
    return value
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^\w-]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  function formatDate(value) {
    return new Intl.DateTimeFormat("ja-JP", {
      month: "numeric",
      day: "numeric",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit"
    }).format(new Date(value));
  }

  function formatBytes(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  function showToast(message) {
    clearTimeout(toastTimer);
    elements.toast.textContent = message;
    elements.toast.classList.add("visible");
    toastTimer = setTimeout(() => elements.toast.classList.remove("visible"), 2600);
  }

  function bindEvents() {
    $$("[data-view-link]").forEach((button) => {
      button.addEventListener("click", () => showView(button.dataset.viewLink));
    });
    $("#settingsButton").addEventListener("click", openSettings);
    $("#newTemplateButton").addEventListener("click", () => elements.templateDialog.showModal());
    $("#createTemplateButton").addEventListener("click", createTemplate);
    $("#copyButton").addEventListener("click", copyPost);
    $("#openSnsButton").addEventListener("click", openSns);
    $("#saveScheduleButton").addEventListener("click", saveSchedule);
    $("#saveTemplateButton").addEventListener("click", saveCurrentTemplate);
    $("#addLinkButton").addEventListener("click", addLinkRow);
    $("#saveSettingsButton").addEventListener("click", saveSettings);
    elements.postBody.addEventListener("input", updateComposer);
    elements.snsSelect.addEventListener("change", updateComposer);
    elements.attachmentInput.addEventListener("change", (event) => handleAttachments(event.target.files));

    $$("[data-settings-tab]").forEach((tab) => {
      tab.addEventListener("click", () => {
        $$("[data-settings-tab]").forEach((item) => item.classList.toggle("active", item === tab));
        $$("[data-settings-pane]").forEach((pane) => {
          pane.classList.toggle("active", pane.dataset.settingsPane === tab.dataset.settingsTab);
        });
      });
    });
  }

  function init() {
    renderSnsOptions();
    renderHome();
    bindEvents();
    if ("serviceWorker" in navigator) {
      window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js"));
    }
  }

  init();
})();
