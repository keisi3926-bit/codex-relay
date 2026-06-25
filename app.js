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
  let activeScheduleId = null;
  let activeAttachments = [];
  let toastTimer = null;

  const $ = (selector, parent = document) => parent.querySelector(selector);
  const $$ = (selector, parent = document) => [...parent.querySelectorAll(selector)];

  const elements = {
    templateGrid: $("#templateGrid"),
    scheduleList: $("#scheduleList"),
    scheduleNotice: $("#scheduleNotice"),
    hideCompletedSchedules: $("#hideCompletedSchedules"),
    composeTitle: $("#composeTitle"),
    snsSelect: $("#snsSelect"),
    postBody: $("#postBody"),
    postPreview: $("#postPreview"),
    previewCount: $("#previewCount"),
    characterCount: $("#characterCount"),
    characterLimit: $("#characterLimit"),
    counterCard: $("#counterCard"),
    linkError: $("#linkError"),
    scheduleTitleInput: $("#scheduleTitleInput"),
    scheduleInput: $("#scheduleInput"),
    repeatTypeSelect: $("#repeatTypeSelect"),
    customRepeatField: $("#customRepeatField"),
    customRepeatInput: $("#customRepeatInput"),
    scheduleEditStatus: $("#scheduleEditStatus"),
    saveScheduleButton: $("#saveScheduleButton"),
    cancelScheduleEditButton: $("#cancelScheduleEditButton"),
    attachmentInput: $("#attachmentInput"),
    attachmentList: $("#attachmentList"),
    attachmentMemo: $("#attachmentMemo"),
    settingsDialog: $("#settingsDialog"),
    templateDialog: $("#templateDialog"),
    toast: $("#toast")
  };

  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (!saved) return clone(initialState);
      const merged = {
        ...clone(initialState),
        ...saved,
        links: { ...clone(defaults.links), ...(saved.links || {}) },
        templates: saved.templates?.length ? saved.templates : clone(defaults.templates),
        sns: mergeSns(saved.sns)
      };
      merged.schedules = migrateSchedules(saved.schedules || [], merged.templates);
      return merged;
    } catch {
      return clone(initialState);
    }
  }

  function migrateSchedules(schedules, templates) {
    const now = new Date().toISOString();
    return schedules.map((schedule) => ({
      id: schedule.id || crypto.randomUUID(),
      templateId: schedule.templateId || "",
      title:
        schedule.title ||
        templates.find((template) => template.id === schedule.templateId)?.name ||
        "投稿予定",
      body: schedule.body || "",
      platform: schedule.platform || schedule.snsId || "x",
      scheduledAt: schedule.scheduledAt || schedule.at || "",
      repeatType: ["none", "daily", "weekly", "monthly", "custom"].includes(schedule.repeatType)
        ? schedule.repeatType
        : "none",
      completed: Boolean(schedule.completed),
      createdAt: schedule.createdAt || now,
      updatedAt: schedule.updatedAt || now,
      customRepeatAt: schedule.customRepeatAt || "",
      attachmentMemo: schedule.attachmentMemo || "",
      attachments: clone(schedule.attachments || []),
      generatedFromId: schedule.generatedFromId || ""
    }));
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
    const hideCompleted = elements.hideCompletedSchedules.checked;
    const sorted = [...state.schedules]
      .filter((schedule) => !hideCompleted || !schedule.completed)
      .sort((a, b) => {
        if (a.completed !== b.completed) return Number(a.completed) - Number(b.completed);
        return new Date(a.scheduledAt) - new Date(b.scheduledAt);
      });
    const now = Date.now();
    elements.scheduleList.innerHTML = sorted.length
      ? sorted
          .map((schedule) => {
            const template = state.templates.find((item) => item.id === schedule.templateId);
            const sns = state.sns.find((item) => item.id === schedule.platform);
            const overdue = !schedule.completed && new Date(schedule.scheduledAt).getTime() < now;
            const repeatLabel = getRepeatLabel(schedule.repeatType);
            return `
              <article class="schedule-item ${overdue ? "overdue" : ""} ${schedule.completed ? "completed" : ""}">
                <span class="schedule-dot"></span>
                <div class="schedule-copy">
                  <div class="schedule-title-line">
                    <strong>${escapeHtml(schedule.title || template?.name || "投稿予定")}</strong>
                    ${schedule.completed ? '<span class="schedule-badge complete">完了</span>' : ""}
                    <span class="schedule-badge">${escapeHtml(sns?.name || schedule.platform)}</span>
                    ${repeatLabel ? `<span class="schedule-badge repeat">${escapeHtml(repeatLabel)}</span>` : ""}
                  </div>
                  <small>${escapeHtml(formatDate(schedule.scheduledAt))}${overdue ? "・時刻を過ぎています" : ""}</small>
                </div>
                <div class="schedule-actions">
                  <button class="text-button" type="button" data-open-schedule="${escapeHtml(schedule.id)}">開く</button>
                  <button class="text-button" type="button" data-duplicate-schedule="${escapeHtml(schedule.id)}">複製</button>
                  <button class="text-button complete-button" type="button" data-complete-schedule="${escapeHtml(schedule.id)}">
                    ${schedule.completed ? "未完了に戻す" : "完了"}
                  </button>
                  <button class="delete-button" type="button" data-delete-schedule="${escapeHtml(schedule.id)}" aria-label="予定を削除">削除</button>
                </div>
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

    $$("[data-duplicate-schedule]").forEach((button) => {
      button.addEventListener("click", () => duplicateSchedule(button.dataset.duplicateSchedule));
    });

    $$("[data-complete-schedule]").forEach((button) => {
      button.addEventListener("click", () => toggleScheduleComplete(button.dataset.completeSchedule));
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
      if (schedule.completed) return false;
      const distance = new Date(schedule.scheduledAt).getTime() - now;
      return distance >= -60 * 60 * 1000 && distance <= 24 * 60 * 60 * 1000;
    });
    elements.scheduleNotice.classList.toggle("hidden", !approaching);
    if (approaching) {
      elements.scheduleNotice.textContent = `投稿予定が近づいています：${approaching.title || "投稿"}（${formatDate(approaching.scheduledAt)}）`;
    }
  }

  function getRepeatLabel(repeatType) {
    return {
      daily: "毎日",
      weekly: "毎週",
      monthly: "毎月",
      custom: "カスタム"
    }[repeatType] || "";
  }

  function openTemplate(templateId, schedule = null) {
    activeTemplate = state.templates.find((item) => item.id === templateId);
    if (!activeTemplate) return;
    activeScheduleId = schedule?.id || null;
    state.activeTemplateId = templateId;
    elements.composeTitle.textContent = activeTemplate.name;
    elements.postBody.value = schedule?.body ?? activeTemplate.body;
    elements.scheduleTitleInput.value = schedule?.title || activeTemplate.name;
    elements.scheduleInput.value = schedule?.scheduledAt?.slice(0, 16) || "";
    elements.repeatTypeSelect.value = schedule?.repeatType || "none";
    elements.customRepeatInput.value = schedule?.customRepeatAt?.slice(0, 16) || "";
    elements.attachmentMemo.value = schedule?.attachmentMemo || "";
    elements.snsSelect.value = schedule?.platform || state.activeSnsId || "x";
    elements.attachmentInput.value = "";
    activeAttachments = clone(schedule?.attachments || state.attachments[templateId] || []);
    updateRepeatFields();
    updateScheduleEditState();
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
    if (elements.repeatTypeSelect.value === "custom" && !elements.customRepeatInput.value) {
      showToast("カスタム次回日時を入力してください");
      return;
    }
    const existing = state.schedules.find((item) => item.id === activeScheduleId);
    const now = new Date().toISOString();
    const record = {
      id: existing?.id || crypto.randomUUID(),
      templateId: activeTemplate.id,
      title: elements.scheduleTitleInput.value.trim() || activeTemplate.name,
      body: elements.postBody.value,
      platform: elements.snsSelect.value,
      scheduledAt: elements.scheduleInput.value,
      repeatType: elements.repeatTypeSelect.value,
      completed: existing?.completed || false,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      customRepeatAt: elements.customRepeatInput.value,
      attachmentMemo: elements.attachmentMemo.value,
      attachments: clone(activeAttachments),
      generatedFromId: existing?.generatedFromId || ""
    };
    state.schedules = existing
      ? state.schedules.map((item) => (item.id === existing.id ? record : item))
      : [...state.schedules, record];
    saveState();
    renderSchedules();
    activeScheduleId = record.id;
    updateScheduleEditState();
    showToast(existing ? "投稿予定を更新しました" : "投稿予定を保存しました");
  }

  function duplicateSchedule(scheduleId) {
    const schedule = state.schedules.find((item) => item.id === scheduleId);
    if (!schedule) return;
    const duplicate = {
      ...clone(schedule),
      id: crypto.randomUUID(),
      scheduledAt: "",
      completed: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      generatedFromId: ""
    };
    openTemplate(duplicate.templateId, duplicate);
    activeScheduleId = null;
    updateScheduleEditState();
    elements.scheduleEditStatus.textContent = "複製・日時未設定";
    elements.saveScheduleButton.textContent = "複製した予定を保存";
    showToast("予定を複製しました。日時を選んで保存してください");
  }

  function toggleScheduleComplete(scheduleId) {
    const schedule = state.schedules.find((item) => item.id === scheduleId);
    if (!schedule) return;
    const completing = !schedule.completed;
    schedule.completed = completing;
    schedule.updatedAt = new Date().toISOString();
    if (completing) createNextOccurrence(schedule);
    saveState();
    renderSchedules();
    showToast(completing ? "投稿済みとして完了しました" : "未完了に戻しました");
  }

  function createNextOccurrence(schedule) {
    if (schedule.repeatType === "none") return;
    if (state.schedules.some((item) => item.generatedFromId === schedule.id)) return;
    const nextAt = calculateNextOccurrence(schedule);
    if (!nextAt) return;
    const duplicate = {
      ...clone(schedule),
      id: crypto.randomUUID(),
      scheduledAt: nextAt,
      completed: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      generatedFromId: schedule.id
    };
    if (schedule.repeatType === "custom") {
      duplicate.repeatType = "none";
      duplicate.customRepeatAt = "";
    }
    state.schedules.push(duplicate);
  }

  function calculateNextOccurrence(schedule) {
    if (schedule.repeatType === "custom") return schedule.customRepeatAt || "";
    const date = new Date(schedule.scheduledAt);
    if (Number.isNaN(date.getTime())) return "";
    if (schedule.repeatType === "daily") date.setDate(date.getDate() + 1);
    if (schedule.repeatType === "weekly") date.setDate(date.getDate() + 7);
    if (schedule.repeatType === "monthly") {
      const originalDay = date.getDate();
      date.setDate(1);
      date.setMonth(date.getMonth() + 1);
      const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
      date.setDate(Math.min(originalDay, lastDay));
    }
    return toLocalDateTimeValue(date);
  }

  function toLocalDateTimeValue(date) {
    const offset = date.getTimezoneOffset();
    return new Date(date.getTime() - offset * 60 * 1000).toISOString().slice(0, 16);
  }

  function resetScheduleEditor() {
    activeScheduleId = null;
    elements.scheduleTitleInput.value = activeTemplate?.name || "";
    elements.scheduleInput.value = "";
    elements.repeatTypeSelect.value = "none";
    elements.customRepeatInput.value = "";
    elements.attachmentMemo.value = "";
    activeAttachments = clone(state.attachments[activeTemplate?.id] || []);
    updateRepeatFields();
    updateScheduleEditState();
    renderAttachments();
  }

  function updateScheduleEditState() {
    const editing = Boolean(activeScheduleId);
    elements.scheduleEditStatus.textContent = editing ? "編集中" : "新規";
    elements.saveScheduleButton.textContent = editing ? "予定を更新" : "予定を保存";
    elements.cancelScheduleEditButton.classList.toggle("hidden", !editing);
  }

  function updateRepeatFields() {
    elements.customRepeatField.classList.toggle("hidden", elements.repeatTypeSelect.value !== "custom");
  }

  function handleAttachments(files) {
    if (!activeTemplate) return;
    activeAttachments = [...files].map((file) => ({
      name: file.name,
      type: file.type,
      size: file.size
    }));
    if (!activeScheduleId) state.attachments[activeTemplate.id] = clone(activeAttachments);
    saveState();
    renderAttachments();
  }

  function renderAttachments() {
    const files = activeAttachments;
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
        activeAttachments.splice(Number(button.dataset.removeAttachment), 1);
        if (!activeScheduleId) state.attachments[activeTemplate.id] = clone(activeAttachments);
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
    $("#cancelScheduleEditButton").addEventListener("click", resetScheduleEditor);
    $("#saveTemplateButton").addEventListener("click", saveCurrentTemplate);
    $("#addLinkButton").addEventListener("click", addLinkRow);
    $("#saveSettingsButton").addEventListener("click", saveSettings);
    elements.postBody.addEventListener("input", updateComposer);
    elements.snsSelect.addEventListener("change", updateComposer);
    elements.repeatTypeSelect.addEventListener("change", updateRepeatFields);
    elements.hideCompletedSchedules.addEventListener("change", renderSchedules);
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
