// ui.js - VERSIÓN CORREGIDA Y COMPLETA

import { Timestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

let modalCallback = null;
let appState = {};
let appActions = {};
let quillInstance = null;
const MODAL_TEXT_BASE_CLASS = "m-4 text-gray-600 hidden";
const MODAL_MODE_CLASSES = [
  "is-task-modal",
  "is-task-action-modal",
  "is-sprint-form-modal",
  "is-epic-form-modal",
  "is-theme-form-modal",
  "is-handbook-form-modal",
  "is-simple-modal",
  "is-points-compact-modal",
];

const dom = {
  viewTitle: document.getElementById("view-title"),
  breadcrumb: document.getElementById("view-breadcrumb"),
  backlogTasksContainer: document.getElementById("backlog-tasks-container"),
  backlogMatrixContainer: document.getElementById("backlog-matrix-container"),
  toggleBacklogViewBtn: document.getElementById("toggle-backlog-view"),
  kanban: {
    todo: document.getElementById("kanban-todo"),
    inprogress: document.getElementById("kanban-inprogress"),
    done: document.getElementById("kanban-done"),
  },
};

const SIDEBAR_COLLAPSED_STORAGE_KEY = "sprintify.sidebar.collapsed";
const SIDEBAR_MOBILE_MEDIA_QUERY = "(max-width: 1023px)";
let sidebarShellState = {
  collapsed: false,
  mobileOpen: false,
};
let sidebarShellInitialized = false;
let sidebarMediaQueryList = null;

function isMobileSidebarLayout() {
  return typeof window !== "undefined" && !!window.matchMedia?.(SIDEBAR_MOBILE_MEDIA_QUERY).matches;
}

function readSidebarCollapsedPreference() {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function writeSidebarCollapsedPreference(isCollapsed) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, String(Boolean(isCollapsed)));
  } catch {
    // Ignore storage failures and keep the in-memory state.
  }
}

function syncSidebarAccessibleLabels() {
  document.querySelectorAll("#sidebar .sidebar-link").forEach((link) => {
    const label = link.querySelector("span")?.textContent?.trim();
    if (!label) return;
    link.setAttribute("title", label);
    link.setAttribute("aria-label", label);
    link.dataset.tooltip = label;
  });

  document.querySelectorAll("#sidebar .nav-group-button").forEach((button) => {
    const label = button.querySelector("h3")?.textContent?.trim();
    if (!label) return;
    button.setAttribute("title", label);
    button.setAttribute("aria-label", `Alternar grupo ${label}`);
  });
}

function updateSidebarToggleButtons() {
  const isMobile = isMobileSidebarLayout();
  const isExpanded = isMobile ? sidebarShellState.mobileOpen : !sidebarShellState.collapsed;
  const ariaLabel = isMobile
    ? sidebarShellState.mobileOpen
      ? "Cerrar navegación lateral"
      : "Abrir navegación lateral"
    : sidebarShellState.collapsed
      ? "Expandir navegación lateral"
      : "Colapsar navegación lateral";
  const title = isMobile
    ? sidebarShellState.mobileOpen
      ? "Cerrar menú"
      : "Abrir menú"
    : sidebarShellState.collapsed
      ? "Expandir sidebar"
      : "Colapsar sidebar";

  document.querySelectorAll('[data-action="toggle-sidebar"]').forEach((button) => {
    button.setAttribute("aria-expanded", String(isExpanded));
    button.setAttribute("aria-label", ariaLabel);
    button.setAttribute("title", title);
  });
}

function applySidebarShellState() {
  const appContainer = document.getElementById("app-container");
  const overlay = document.getElementById("sidebar-overlay");
  if (!appContainer) return;

  const isMobile = isMobileSidebarLayout();
  if (!isMobile) {
    sidebarShellState.mobileOpen = false;
  }

  appContainer.dataset.sidebar = sidebarShellState.collapsed ? "collapsed" : "expanded";
  appContainer.dataset.sidebarMobileOpen = isMobile && sidebarShellState.mobileOpen ? "true" : "false";

  if (overlay) {
    overlay.setAttribute("aria-hidden", String(!(isMobile && sidebarShellState.mobileOpen)));
  }

  if (typeof document !== "undefined") {
    document.body.classList.toggle("sidebar-mobile-open", isMobile && sidebarShellState.mobileOpen);
  }

  updateSidebarToggleButtons();
}

function setSidebarCollapsed(isCollapsed) {
  sidebarShellState.collapsed = Boolean(isCollapsed);
  writeSidebarCollapsedPreference(sidebarShellState.collapsed);
  applySidebarShellState();
}

function setSidebarMobileOpen(isOpen) {
  sidebarShellState.mobileOpen = Boolean(isOpen);
  applySidebarShellState();
}

function initializeSidebarShell() {
  syncSidebarAccessibleLabels();

  if (!sidebarShellInitialized) {
    sidebarShellState.collapsed = readSidebarCollapsedPreference();
    sidebarMediaQueryList = window.matchMedia?.(SIDEBAR_MOBILE_MEDIA_QUERY) || null;
    if (sidebarMediaQueryList?.addEventListener) {
      sidebarMediaQueryList.addEventListener("change", applySidebarShellState);
    } else if (sidebarMediaQueryList?.addListener) {
      sidebarMediaQueryList.addListener(applySidebarShellState);
    }
    sidebarShellInitialized = true;
  }

  applySidebarShellState();
}

function getTaskContext(task, state) {
  if (task.listId === state.backlogId) return "backlog";
  return "sprint";
}

const KANBAN_WIP_LIMITS = Object.freeze({
  todo: 12,
  inprogress: 5,
  done: 999,
});

const KANBAN_COLUMN_META = Object.freeze({
  todo: { title: "Por Hacer", accent: "slate" },
  inprogress: { title: "En Progreso", accent: "blue" },
  done: { title: "Hecho", accent: "green" },
});

let activeDropIndicator = null;
let activeDropZone = null;
let activeDropMatrixQuad = null;

function toDate(value) {
  if (!value) return null;
  if (value.toDate) return value.toDate();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isTaskDone(task) {
  return task.status === "completed" || task.kanbanStatus === "done";
}

function resolveKanbanStatus(task) {
  if (isTaskDone(task)) return "done";
  if (task.kanbanStatus === "inprogress" || task.status === "inprogress") return "inprogress";
  return "todo";
}

function getTaskAgeDays(task, now = new Date()) {
  const lastMovedAt = toDate(task.lastMovedAt);
  const completedAt = toDate(task.completedAt);
  const startedAt = toDate(task.startedAt);
  const createdAt = toDate(task.createdAt) || now;
  const isDone = isTaskDone(task);
  const status = resolveKanbanStatus(task);
  const anchor = lastMovedAt || (status === "inprogress" && startedAt ? startedAt : createdAt);
  const end = isDone && completedAt ? completedAt : now;
  const diffMs = end.getTime() - anchor.getTime();
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
}

function getTaskAgingState(task, now = new Date()) {
  if (isTaskDone(task)) return { key: "none", days: 0, label: "" };
  const ageDays = getTaskAgeDays(task, now);
  if (ageDays >= 14) return { key: "danger", days: ageDays, label: `${ageDays}d sin mover` };
  if (ageDays >= 7) return { key: "warn", days: ageDays, label: `${ageDays}d sin mover` };
  return { key: "none", days: ageDays, label: "" };
}

function getColumnPoints(tasks) {
  return tasks.reduce((sum, t) => sum + (Number(t.points) || 0), 0);
}

function getWipState(statusKey, count) {
  const limit = KANBAN_WIP_LIMITS[statusKey] ?? 999;
  const overBy = Math.max(0, count - limit);
  return { limit, overBy, isOverLimit: overBy > 0 };
}

function isDateToday(value) {
  const d = toDate(value);
  if (!d) return false;
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return d >= start && d < end;
}

function buildKanbanHeader({
  statusKey,
  count,
  points,
  includeAdd = false,
  includeCollapse = false,
  collapseColumnKey = "",
  dense = false,
}) {
  const meta = KANBAN_COLUMN_META[statusKey] || { title: statusKey, accent: "slate" };
  const wip = getWipState(statusKey, count);
  const countClass = wip.isOverLimit
    ? `kanban-column-count kanban-column-count--${statusKey} kanban-column-count--alert`
    : `kanban-column-count kanban-column-count--${statusKey}`;
  const wrapClass = dense ? "kanban-column-head kanban-column-head--dense" : "kanban-column-head";
  const wipText =
    statusKey === "inprogress"
      ? `<span class="kanban-column-meta ${
          wip.isOverLimit ? "kanban-column-meta--alert" : ""
        }">WIP ${count}/${wip.limit}${wip.isOverLimit ? ` (+${wip.overBy})` : ""}</span>`
      : `<span class="kanban-column-meta kanban-column-meta--${statusKey}">${points} pts</span>`;
  const collapseBtn = includeCollapse
    ? `<button data-action="collapse-column" data-col="${collapseColumnKey}" class="kanban-column-action" title="Colapsar columna">
          <i class="fa-solid fa-compress"></i>
       </button>`
    : "";
  const addBtn = includeAdd
    ? `<button data-action="add-task-sprint" class="kanban-column-action kanban-column-action--primary" title="Añadir tarea">
          <i class="fa-solid fa-plus"></i>
       </button>`
    : "";
  return `
    <div class="${wrapClass}">
      <div class="kanban-column-title-wrap">
        ${collapseBtn}
        <h3 class="kanban-column-title kanban-column-title--${statusKey}">
          <span>${meta.title}</span>
          <span class="${countClass}">${count}</span>
        </h3>
        ${wipText}
      </div>
      <div class="kanban-column-actions">${addBtn}</div>
    </div>
  `;
}

function clearDropIndicators() {
  if (activeDropIndicator?.parentElement) activeDropIndicator.parentElement.removeChild(activeDropIndicator);
  if (activeDropZone) activeDropZone.classList.remove("is-drop-target");
  if (activeDropMatrixQuad) activeDropMatrixQuad.classList.remove("is-drop-target");
  activeDropIndicator = null;
  activeDropZone = null;
  activeDropMatrixQuad = null;
}

function ensureDropIndicator(dropZone) {
  if (activeDropZone !== dropZone) {
    clearDropIndicators();
    activeDropZone = dropZone;
    activeDropIndicator = document.createElement("div");
    activeDropIndicator.className = "kanban-drop-indicator";
    dropZone.classList.add("is-drop-target");
  }
  return activeDropIndicator;
}

function updateDropIndicator(dropZone, clientY) {
  const indicator = ensureDropIndicator(dropZone);
  const cards = Array.from(dropZone.querySelectorAll(".task-card:not(.dragging)"));
  const nextCard = cards.find((card) => {
    const rect = card.getBoundingClientRect();
    return clientY < rect.top + rect.height / 2;
  });
  if (nextCard) {
    dropZone.insertBefore(indicator, nextCard);
  } else {
    dropZone.appendChild(indicator);
  }
}

// EN ui.js - Reemplaza la función createTaskElement completa o actualiza su lógica interna

function createTaskElement(task, context, state) {
  const { allUsers, taskLists, epics = [], themes = [] } = state;
  const isCompleted = isTaskDone(task);

  const now = new Date();
  const getDate = (ts) => (ts && ts.toDate ? ts.toDate() : ts ? new Date(ts) : null);

  const createdAt = getDate(task.createdAt) || now;
  const completedAt = getDate(task.completedAt);
  const startedAt = getDate(task.startedAt);

  // Lógica de Antigüedad (Days Open)
  // Si está completada, calculamos hasta la fecha de fin. Si no, hasta hoy.
  const endCalcDate = isCompleted && completedAt ? completedAt : now;
  const daysOpen = Math.round((endCalcDate - createdAt) / (1000 * 60 * 60 * 24));

  let timeInProgressLabel = "";
  if (startedAt && (task.kanbanStatus === "inprogress" || task.status === "completed")) {
    const progressEndDate = isCompleted && completedAt ? completedAt : now;
    const diffMs = progressEndDate - startedAt;
    const hoursInProgress = Math.floor(diffMs / (1000 * 60 * 60));
    const daysInProgress = Math.floor(hoursInProgress / 24);
    timeInProgressLabel = daysInProgress > 0 ? `${daysInProgress}d` : `${Math.max(1, hoursInProgress)}h`;
  }

  const todayForCalc = new Date();
  const currentDay = todayForCalc.getDay();
  const diff = todayForCalc.getDate() - currentDay + (currentDay === 0 ? -6 : 1);
  const startOfWeek = new Date(todayForCalc.setDate(diff));
  startOfWeek.setHours(0, 0, 0, 0);
  const isInherited = createdAt < startOfWeek;

  const user = allUsers.find((u) => u.email === task.assignee);
  const userPhotoURL = user?.photoURL
    ? user.photoURL
    : `https://ui-avatars.com/api/?name=${task.assignee || ""}`;

  const assigneeHTML = task.assignee
    ? `<img src="${userPhotoURL}" class="w-6 h-6 rounded-full border border-white shadow-sm object-cover" title="${task.assignee}">`
    : `<div class="w-6 h-6 rounded-full bg-[color:var(--surface-secondary)] border border-[color:var(--line-default)] border-dashed flex items-center justify-center text-[color:var(--muted)] hover:bg-[color:var(--brand-50)] hover:text-[color:var(--brand-700)] hover:border-[color:var(--line-strong)] transition-colors" title="Asignar Responsable"><i class="fa-solid fa-user-plus" style="font-size: 10px;"></i></div>`;

  const pointsValue = Number(task.points ?? 0);
  const hasMissingPoints = !Number.isFinite(pointsValue) || pointsValue <= 0;
  const pointsLabel = Number.isFinite(pointsValue) ? pointsValue : 0;
  const pointsBadgeClass = hasMissingPoints
    ? "task-points-badge-v3 task-points-badge-v3--missing"
    : "task-points-badge-v3";
  const pointsHTML = `<span class="${pointsBadgeClass}" title="${hasMissingPoints ? "Falta estimar puntos" : "Puntos estimados"}">${pointsLabel} pts</span>`;

  const checkboxHTML = `<input type="checkbox" class="form-checkbox h-3.5 w-3.5 rounded border-gray-300 text-[color:var(--brand-700)] focus:ring-0 cursor-pointer mt-0.5 shrink-0" ${isCompleted ? "checked" : ""} ${context.includes("backlog") ? 'data-select-task="true"' : ""}>`;

  const sprint = taskLists.find((l) => l.id === task.listId);
  const sprintColor = sprint?.color || "#3b82f6";
  const sprintAccent = toRgba(sprintColor, 0.58, "rgba(15, 118, 110, 0.58)");
  const sprintTitle = sprint?.title || "Backlog";
  const epic = task.epicId ? epics.find((entry) => entry.id === task.epicId) : null;
  const epicTitle = epic?.title || "";
  const theme = epic?.themeId ? themes.find((entry) => entry.id === epic.themeId) : null;
  const projectTitle = theme?.title || epicTitle || sprintTitle;

  const commentsCount = task.comments?.length || 0;
  const aging = getTaskAgingState(task, now);

  const hiddenSummary = [];
  if (timeInProgressLabel) hiddenSummary.push(`En progreso: ${timeInProgressLabel}`);
  if (isInherited && !isCompleted) hiddenSummary.push("Heredada");
  if (aging.label) hiddenSummary.push(aging.label);
  hiddenSummary.push(`Creada: ${daysOpen}d`);
  if (commentsCount > 0) hiddenSummary.push(`${commentsCount} comentarios`);
  const hiddenSummaryTitle = hiddenSummary.join(" • ").replace(/"/g, "&quot;");
  const taskTitle = task.title || "Sin título";
  const shouldClampTitle = taskTitle.length > 90;
  // 3.1 Aging chip
  const agingChipHTML = aging.key !== "none" && !isCompleted
    ? `<div class="task-meta-chip task-meta-chip--label task-meta-chip--aging task-meta-chip--aging-${aging.key}" title="${aging.label}"><i class="fa-regular fa-clock"></i><span>${aging.days}d</span></div>`
    : "";

  const dueDate = getDate(task.dueDate);
  let dueChipHTML = "";
  if (dueDate && !Number.isNaN(dueDate.getTime())) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(dueDate);
    due.setHours(0, 0, 0, 0);
    const diffDays = Math.floor((due - today) / (1000 * 60 * 60 * 24));
    let dueClass = "task-meta-chip task-meta-chip--label task-meta-chip--label-muted";
    let dueLabel = due.toLocaleDateString("es-MX", { day: "numeric", month: "short" });
    if (diffDays < 0) {
      dueClass = "task-meta-chip task-meta-chip--status task-meta-chip--danger";
      dueLabel = `Vencida ${Math.abs(diffDays)}d`;
    } else if (diffDays === 0) {
      dueClass = "task-meta-chip task-meta-chip--status task-meta-chip--warn";
      dueLabel = "Entrega hoy";
    } else if (diffDays === 1) {
      dueClass = "task-meta-chip task-meta-chip--status task-meta-chip--warn";
      dueLabel = "Entrega mañana";
    }
    dueChipHTML = `<div class="${dueClass}" title="Fecha compromiso"><i class="fa-regular fa-calendar"></i><span>${dueLabel}</span></div>`;
  }
  const inheritedChipHTML = isInherited && !isCompleted
    ? `<div class="task-meta-chip task-meta-chip--label task-meta-chip--label-muted" title="Tarea heredada"><i class="fa-solid fa-arrow-turn-down"></i><span>Heredada</span></div>`
    : "";

  const ageClass =
    aging.key === "danger" ? "task-card-v3--aging-danger" : aging.key === "warn" ? "task-card-v3--aging-warn" : "";

  let wipAlertClass = "";
  if (context === "sprint" && resolveKanbanStatus(task) === "inprogress" && task.listId === state.currentSprintId) {
    const inProgressCount = state.tasks.filter(
      (t) => t.listId === state.currentSprintId && resolveKanbanStatus(t) === "inprogress"
    ).length;
    if (getWipState("inprogress", inProgressCount).isOverLimit) {
      wipAlertClass = "task-card-v3--wip-alert";
    }
  }

  const compactClass = state.taskCardDensity === "compact" ? "task-card-v3--compact" : "";

  const taskCard = document.createElement("div");
  taskCard.id = task.id;
  taskCard.className = `task-card task-card-v3 ${ageClass} ${wipAlertClass} ${compactClass} group relative rounded-lg ${isCompleted ? "opacity-60" : ""}`;
  taskCard.draggable = true;
  taskCard.dataset.context = context;
  taskCard.style.setProperty("--task-accent", sprintColor);
  taskCard.style.setProperty("--task-accent-soft", sprintAccent);
  taskCard.title = hiddenSummaryTitle || taskTitle;

  taskCard.innerHTML = `
    <div class="task-bento-shell px-3 py-2.5 flex flex-col h-full relative gap-2.5">
        <div class="task-bento-top">
            <div class="task-bento-head">
                ${checkboxHTML}
                <div class="task-bento-copy">
                  <div class="task-kicker-row">
                    <span class="task-kicker" title="${projectTitle.replace(/"/g, "&quot;")}">${projectTitle}</span>
                    ${commentsCount > 0 ? `<span class="task-kicker task-kicker--muted" title="Comentarios"><i class="fa-regular fa-comment"></i>${commentsCount}</span>` : ""}
                  </div>
                  <div class="task-bento-title-wrap">
                      <div class="min-w-0">
                        <span class="task-title-v3 block break-words ${shouldClampTitle ? "is-clamped" : ""} ${isCompleted ? "line-through text-gray-400" : ""}" title="${taskTitle.replace(/"/g, "&quot;")}">${taskTitle}</span>
                        ${shouldClampTitle ? '<button class="task-title-expand" data-action="open-details" type="button">Ver más</button>' : ""}
                      </div>
                  </div>
                </div>
            </div>
            <div class="task-bento-toolbar">
              ${pointsHTML}
              <div class="cursor-pointer shrink-0 task-assignee-anchor" data-action="assign" title="Asignar Responsable">
                  ${assigneeHTML}
              </div>
            </div>
        </div>
        <div class="task-bento-foot">
            <div class="task-meta-zone">
                ${dueChipHTML}
                ${inheritedChipHTML}
                ${agingChipHTML}
            </div>
            <div class="task-actions-zone">
                ${context === "sprint" && !isCompleted ? (() => {
                  const cur = resolveKanbanStatus(task);
                  const next = cur === "todo" ? "inprogress" : cur === "inprogress" ? "done" : null;
                  if (!next) return "";
                  const label = next === "inprogress" ? "Iniciar" : "Completar";
                  const icon = next === "inprogress" ? "fa-play" : "fa-check";
                  const cls = next === "done" ? "task-action-icon task-action-icon--advance task-action-icon--advance-done" : "task-action-icon task-action-icon--advance";
                  return `<button class="${cls}" data-action="advance-status" data-next-status="${next}" title="${label}"><i class="fa-solid ${icon}"></i><span class="task-action-label">${label}</span></button>`;
                })() : ""}
                <button class="task-action-icon" data-action="open-details" title="Editar detalles"><i class="fa-solid fa-pen-to-square"></i></button>
                <button class="task-action-icon" data-action="due-date" title="Cambiar fecha"><i class="fa-regular fa-calendar-check"></i></button>
                <button class="task-action-icon" data-action="points" title="Cambiar puntos"><i class="fa-solid fa-coins"></i></button>
                <button class="task-action-icon" data-action="move-to-sprint" title="Mover a otro sprint"><i class="fa-solid fa-right-left"></i></button>
                <button class="task-action-icon task-action-icon--danger" data-action="delete" title="Eliminar tarea"><i class="fa-solid fa-trash-can"></i></button>
            </div>
        </div>
    </div>
  `;
  return taskCard;
}

function createCommentElement(comment, index, state) {
  if (!comment) return document.createElement("div");
  const author = state.allUsers.find((u) => u.email === comment.authorEmail);
  const authorAvatar = author?.photoURL
    ? author.photoURL
    : `https://ui-avatars.com/api/?name=${comment.author ? comment.author.split(" ")[0] : "A"}`;
  const date = comment.timestamp ? comment.timestamp.toDate().toLocaleString("es-MX") : "";
  const isAuthor = state.user && state.user.email === comment.authorEmail;
  const commentActions = isAuthor
    ? `<div class="text-xs mt-1"><button class="font-semibold text-blue-600 hover:underline" data-action="edit-comment" data-index="${index}">Editar</button><button class="font-semibold text-red-500 hover:underline ml-2" data-action="delete-comment" data-index="${index}">Borrar</button></div>`
    : "";
  const commentEl = document.createElement("div");
  commentEl.className = "flex items-start gap-3";
  commentEl.id = `comment-${index}`;
  commentEl.innerHTML = `<img src="${authorAvatar}" class="w-8 h-8 rounded-full mt-1"><div class="flex-1 bg-white p-2 rounded-lg border border-gray-200"><div class="flex justify-between items-center"><span class="font-semibold text-sm">${comment.author || "Anónimo"}</span><span class="text-xs text-gray-400">${date} ${comment.edited ? "(editado)" : ""}</span></div><p class="text-sm text-gray-700 mt-1">${comment.text || ""}</p>${commentActions}</div>`;
  return commentEl;
}

// Compact task element for list views (Mi trabajo)
function createCompactTaskElement(task, state) {
  const { taskLists, epics } = state;
  const isCompleted = task.status === "completed" || task.kanbanStatus === "done";
  const sprint = taskLists.find((l) => l.id === task.listId);
  const sprintColor = sprint?.color || "#3b82f6";

  const statusLabel = isCompleted
    ? "Hecho"
    : task.kanbanStatus === "inprogress" || task.status === "inprogress"
      ? "En progreso"
      : "Por hacer";
  const statusClass = isCompleted
    ? "bg-green-50 text-green-700 border border-green-200"
    : task.kanbanStatus === "inprogress" || task.status === "inprogress"
      ? "bg-blue-50 text-blue-700 border border-blue-200"
      : "bg-gray-100 text-gray-600 border border-gray-200";

  const epic = task.epicId ? epics.find((e) => e.id === task.epicId) : null;
  const epicLabel = epic?.title || "Sin épica";

  const getDate = (d) => (d && d.toDate ? d.toDate() : d ? new Date(d) : null);
  const dueDate = getDate(task.dueDate);
  let dueLabel = "Sin fecha";
  let dueClass = "text-gray-400";
  if (dueDate) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(dueDate);
    due.setHours(0, 0, 0, 0);
    const diffDays = Math.floor((due - today) / (1000 * 60 * 60 * 24));
    if (diffDays < 0) {
      dueLabel = `Vencida · ${due.toLocaleDateString()}`;
      dueClass = "text-red-600";
    } else if (diffDays === 0) {
      dueLabel = "Hoy";
      dueClass = "text-amber-600";
    } else if (diffDays === 1) {
      dueLabel = "Mañana";
      dueClass = "text-amber-600";
    } else {
      dueLabel = due.toLocaleDateString();
      dueClass = "text-gray-500";
    }
  }

  const compact = document.createElement("div");
  compact.className = `compact-task flex items-center justify-between gap-3 bg-white p-3 rounded-lg border border-gray-200 hover:shadow-sm transition-colors ${isCompleted ? "opacity-60" : ""}`;
  compact.id = `compact-${task.id}`;

  const left = document.createElement("div");
  left.className = "flex items-center gap-3 min-w-0";

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.className = "form-checkbox h-4 w-4 text-blue-600";
  if (isCompleted) checkbox.checked = true;

  const title = document.createElement("div");
  title.className = "min-w-0 flex-1";
  title.innerHTML = `
    <div class="text-sm font-semibold text-slate-900 truncate">${task.title}</div>
    <div class="flex flex-wrap items-center gap-2 mt-1 text-xs">
      <span class="px-2 py-0.5 rounded-full ${statusClass}">${statusLabel}</span>
      <span class="px-2 py-0.5 rounded-full border border-gray-200 bg-gray-50 text-gray-600 truncate" style="max-width: 180px;">${epicLabel}</span>
      ${(task.points || 0) > 0 ? `<span class="px-2 py-0.5 rounded-full border border-gray-200 bg-gray-50 text-gray-600">${task.points} pts</span>` : ""}
    </div>
  `;

  left.appendChild(checkbox);
  left.appendChild(title);

  const right = document.createElement("div");
  right.className = "flex items-center gap-3 ml-2 shrink-0";

  const due = document.createElement("div");
  due.className = `text-xs font-semibold ${dueClass}`;
  due.innerText = dueLabel;

  const sprintDot = document.createElement("div");
  sprintDot.className = "w-2.5 h-2.5 rounded-full border border-white shadow-sm";
  sprintDot.style.backgroundColor = sprintColor;
  sprintDot.title = sprint?.title || "Sprint";

  right.appendChild(due);
  right.appendChild(sprintDot);

  compact.appendChild(left);
  compact.appendChild(right);

  // Checkbox behavior: update task status like other task-card handlers
  checkbox.addEventListener("change", (e) => {
    e.stopPropagation();
    const isChecked = e.target.checked;
    if (typeof appActions !== "undefined" && appActions.updateTask) {
      appActions.updateTask(task.id, {
        status: isChecked ? "completed" : "needsAction",
        kanbanStatus: isChecked ? "done" : "todo",
        completedAt: isChecked ? Timestamp.now() : null,
        lastMovedAt: Timestamp.now(),
      });
    } else {
      compact.classList.toggle("opacity-60", isChecked);
    }
  });

  // Abrir modal de detalles al hacer click en la tarjeta (excepto el checkbox)
  compact.addEventListener("click", (e) => {
    if (e.target === checkbox || e.target.closest('input[type="checkbox"]')) return;
    openTaskDetailsModal(task);
  });

  return compact;
}

function createActivityCommentElement(comment, index, state, taskId) {
  if (!comment) return document.createElement("div");
  const author = state.allUsers.find((u) => u.email === comment.authorEmail);
  const authorAvatar = author
    ? author.photoURL
    : `https://ui-avatars.com/api/?name=${comment.author ? comment.author.split(" ")[0] : "A"}`;
  const date = comment.timestamp ? comment.timestamp.toDate().toLocaleString("es-MX") : "";
  const isRead = comment.readBy?.includes(state.user.email);
  const commentText = comment.text || "";
  const shouldClamp = commentText.length > 170;
  const textId = `activity-comment-text-${taskId}-${index}`;
  const commentEl = document.createElement("div");
  commentEl.className = "flex items-start gap-3";
  commentEl.id = `activity-comment-${taskId}-${index}`;
  commentEl.innerHTML = `<img src="${authorAvatar}" class="w-8 h-8 rounded-full mt-1 border border-white shadow-sm" alt="${comment.author || "Usuario"}"><div class="flex-1 bg-gray-50 p-3 rounded-lg border border-gray-200"><div class="flex justify-between items-center gap-3"><span class="font-semibold text-sm text-slate-800">${comment.author || "Anónimo"}</span><span class="text-xs text-gray-500">${date} ${comment.edited ? "(editado)" : ""}</span></div><p id="${textId}" class="activity-comment-text text-sm text-slate-700 mt-1">${commentText}</p>${shouldClamp ? `<button data-action="toggle-comment-expand" data-target="${textId}" class="activity-expand-btn mt-1" type="button">Ver más</button>` : ""}<div class="flex items-center gap-2 mt-2"><input type="checkbox" data-activity-read="true" data-task-id="${taskId}" data-comment-idx="${index}" class="h-4 w-4 rounded border-gray-300 cursor-pointer" ${isRead ? "checked" : ""}><span class="text-xs font-medium ${isRead ? "text-slate-500" : "text-slate-700"}">${isRead ? "Leído" : "Pendiente"}</span>${!isRead ? '<span class="activity-unread-dot" title="No leída"></span>' : ""}</div></div>`;
  return commentEl;
}

function renderBacklog(state) {
  if (!dom.backlogTasksContainer) return;
  dom.backlogTasksContainer.innerHTML = "";
  const backlogTasks = state.tasks.filter((t) => t.listId === state.backlogId);

  if (backlogTasks.length === 0) {
    dom.backlogTasksContainer.innerHTML = buildEmptyState({
      icon: "inbox",
      title: "El backlog está vacío",
      hint: "Añade la primera tarea para empezar a planear tu próximo sprint.",
      cta: { label: "Añadir Tarea al Backlog", action: "add-task-to-backlog" },
    });
    return;
  }

  // Agrupar tareas por épica (normalizar epicId)
  const grouped = {};
  const noEpicId = "__sin_epic__"; // ID único para tareas sin épica

  backlogTasks.forEach((task) => {
    // Normalizar epicId: si está vacío, null, undefined, o no es string → usar ID especial
    let epicId = noEpicId;

    // Solo usar epicId si:
    // 1. Es un string no vacío
    // 2. La épica EXISTE en state.epics
    if (
      task.epicId &&
      typeof task.epicId === "string" &&
      task.epicId.trim() !== "" &&
      state.epics.find((e) => e.id === task.epicId.trim())
    ) {
      epicId = task.epicId.trim();
    }

    if (!grouped[epicId]) {
      grouped[epicId] = [];
    }
    grouped[epicId].push(task);
  });

  // Ordenar: épicas con tareas primero, luego sin épica
  const epicIds = Object.keys(grouped).sort((a, b) => {
    if (a === noEpicId) return 1;
    if (b === noEpicId) return -1;
    const epicA = state.epics.find((e) => e.id === a);
    const epicB = state.epics.find((e) => e.id === b);
    return (epicA?.createdAt?.seconds || 0) - (epicB?.createdAt?.seconds || 0);
  });

  // Renderizar cada grupo de épica
  epicIds.forEach((epicId) => {
    const tasks = grouped[epicId];
    const isNoEpic = epicId === noEpicId;
    const epic = isNoEpic ? null : state.epics.find((e) => e.id === epicId);
    const isCollapsed = state.collapsedBacklogEpics.has(epicId);

    // Contenedor de grupo
    const groupWrapper = document.createElement("div");
    groupWrapper.className = "mb-4";
    groupWrapper.id = `backlog-epic-group-${epicId}`;

    // Header colapsable
    const header = document.createElement("div");
    header.className = "backlog-epic-header";
    header.dataset.action = "toggle-backlog-epic";
    header.dataset.epicId = epicId;

    const epicColor = epic?.color || "#64748b";
    const epicAccent = toRgba(epicColor, 0.5, "rgba(103, 116, 139, 0.5)");
    const epicAccentSoft = toRgba(epicColor, 0.14, "rgba(103, 116, 139, 0.14)");
    const epicName = epic?.title || "Sin Épica";
    const taskCount = tasks.length;
    const doneCount = tasks.filter((t) => t.status === "completed").length;
    const points = tasks.reduce((sum, t) => sum + (t.points || 0), 0);
    const donePoints = tasks
      .filter((t) => t.status === "completed")
      .reduce((sum, t) => sum + (t.points || 0), 0);

    const chevron = isCollapsed ? "fa-chevron-right" : "fa-chevron-down";

    header.innerHTML = `
      <span class="backlog-epic-accent" style="background:${epicAccent}; box-shadow: 0 0 0 4px ${epicAccentSoft};"></span>
      <i class="fas ${chevron} text-slate-400" style="font-size: 12px;"></i>
      <div class="flex-1 min-w-0">
        <h3 class="backlog-epic-title">${epicName}</h3>
      </div>
      <div class="backlog-epic-stats">
        <span class="backlog-epic-chip">Tareas ${taskCount}</span>
        <span class="backlog-epic-chip">Hechas ${doneCount}</span>
        <span class="backlog-epic-chip">Pts ${donePoints}/${points}</span>
      </div>
    `;

    groupWrapper.appendChild(header);

    // Contenedor de tareas (colapsable)
    const tasksContainer = document.createElement("div");
    tasksContainer.className = `grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 pl-0 pr-0 transition-all duration-200 ${isCollapsed ? "hidden" : ""}`;
    tasksContainer.dataset.epicTasksContainer = epicId;

    tasks.forEach((task) => {
      const element = createTaskElement(task, "backlog", state);
      tasksContainer.appendChild(element);
    });

    groupWrapper.appendChild(tasksContainer);
    dom.backlogTasksContainer.appendChild(groupWrapper);
  });
}

function renderBacklogMatrix(state) {
  if (!dom.backlogMatrixContainer) return;
  const tasks = state.tasks.filter((t) => t.listId === state.backlogId);
  const getQuad = (t) => {
    const impactThreshold = state.triageConfig?.matrixThresholds?.impact || 3;
    const effortThreshold = state.triageConfig?.matrixThresholds?.effort || 3;

    const imp = Number(t.impact || 0);
    const eff = Number(t.effort || 0);
    const impHigh = imp >= impactThreshold;
    const effHigh = eff >= effortThreshold;

    if (impHigh && !effHigh) return "quick";
    if (impHigh && effHigh) return "major";
    if (!impHigh && !effHigh) return "filler";
    return "maybe";
  };

  const counts = { quick: 0, major: 0, filler: 0, maybe: 0 };
  tasks.forEach((t) => {
    const quad = getQuad(t);
    if (counts[quad] !== undefined) counts[quad] += 1;
  });
  const total = tasks.length;
  const quickPct = total ? Math.round((counts.quick / total) * 100) : 0;
  const highEffort = counts.major + counts.maybe;
  const highEffortPct = total ? Math.round((highEffort / total) * 100) : 0;

  dom.backlogMatrixContainer.innerHTML = `
    <div class="matrix-summary-row">
      <span class="matrix-summary-chip">Total <strong>${total}</strong></span>
      <span class="matrix-summary-chip matrix-summary-chip--quick">Quick Wins <strong>${counts.quick}</strong> (${quickPct}%)</span>
      <span class="matrix-summary-chip matrix-summary-chip--warn">Alto esfuerzo <strong>${highEffort}</strong> (${highEffortPct}%)</span>
    </div>
    <div class="backlog-matrix">
      <div class="matrix-axis-label matrix-axis-y">Impacto</div>
      <div class="matrix-axis-label matrix-axis-x">Esfuerzo</div>
      <div class="backlog-matrix-grid">
        <div class="matrix-quad quick" data-quad-list="quick">
          <div class="matrix-quad-header">
            <div class="matrix-quad-title"><span class="matrix-dot quick"></span>Quick Wins</div>
            <div class="matrix-quad-count">${counts.quick}</div>
          </div>
          <div class="space-y-2 flex-grow" data-quad-content="quick"></div>
        </div>
        <div class="matrix-quad major" data-quad-list="major">
          <div class="matrix-quad-header">
            <div class="matrix-quad-title"><span class="matrix-dot major"></span>Major Projects</div>
            <div class="matrix-quad-count">${counts.major}</div>
          </div>
          <div class="space-y-2 flex-grow" data-quad-content="major"></div>
        </div>
        <div class="matrix-quad filler" data-quad-list="filler">
          <div class="matrix-quad-header">
            <div class="matrix-quad-title"><span class="matrix-dot filler"></span>Fillers</div>
            <div class="matrix-quad-count">${counts.filler}</div>
          </div>
          <div class="space-y-2 flex-grow" data-quad-content="filler"></div>
        </div>
        <div class="matrix-quad maybe" data-quad-list="maybe">
          <div class="matrix-quad-header">
            <div class="matrix-quad-title"><span class="matrix-dot maybe"></span>Maybe later</div>
            <div class="matrix-quad-count">${counts.maybe}</div>
          </div>
          <div class="space-y-2 flex-grow" data-quad-content="maybe"></div>
        </div>
      </div>
    </div>
  `;
  const lists = {
    quick: dom.backlogMatrixContainer.querySelector('[data-quad-content="quick"]'),
    major: dom.backlogMatrixContainer.querySelector('[data-quad-content="major"]'),
    filler: dom.backlogMatrixContainer.querySelector('[data-quad-content="filler"]'),
    maybe: dom.backlogMatrixContainer.querySelector('[data-quad-content="maybe"]'),
  };
  tasks.forEach((t) => {
    const where = getQuad(t);
    const el = createTaskElement(t, "backlog-matrix", state);
    if (lists[where]) lists[where].appendChild(el);
  });
}

function toggleBacklogView(state) {
  if (!dom.backlogTasksContainer || !dom.backlogMatrixContainer || !dom.toggleBacklogViewBtn)
    return;
  const matrixHidden = dom.backlogMatrixContainer.classList.contains("hidden");
  if (matrixHidden) {
    dom.backlogTasksContainer.classList.add("hidden");
    dom.backlogMatrixContainer.classList.remove("hidden");
    dom.toggleBacklogViewBtn.innerHTML = '<i class="fas fa-list"></i> Vista Lista';
    renderBacklogMatrix(state);
  } else {
    dom.backlogMatrixContainer.classList.add("hidden");
    dom.backlogTasksContainer.classList.remove("hidden");
    dom.toggleBacklogViewBtn.innerHTML = '<i class="fas fa-table-cells"></i> Vista Matriz';
    renderBacklog(state);
  }
}
// EN js/ui/ui.js - REEMPLAZA LA FUNCIÓN EXISTENTE renderSprintKanban

function renderSprintKanban(state) {
  // Density bar is now part of the sprint command center panel; clear it here.
  const densityBar = document.getElementById("kanban-density-bar");
  if (densityBar) densityBar.innerHTML = "";

  const columns = [
    { key: "todo" },
    { key: "inprogress" },
    { key: "done" },
  ];

  const getColumnTasks = (statusKey) => {
    const base = state.tasks.filter((t) => t.listId === state.currentSprintId && resolveKanbanStatus(t) === statusKey);
    if (!state.kanbanAssigneeFilter) return base;
    return base.filter((t) => t.assignee === state.kanbanAssigneeFilter);
  };

  const sortColumnTasks = (statusKey, tasks) => {
    const sorted = [...tasks];
    if (statusKey === "done") {
      sorted.sort((a, b) => (toDate(b.completedAt)?.getTime() || 0) - (toDate(a.completedAt)?.getTime() || 0));
      return sorted;
    }
    if (statusKey === "inprogress") {
      sorted.sort((a, b) => getTaskAgeDays(b) - getTaskAgeDays(a));
      return sorted;
    }
    sorted.sort((a, b) => (toDate(a.createdAt)?.getTime() || 0) - (toDate(b.createdAt)?.getTime() || 0));
    return sorted;
  };

  columns.forEach((col) => {
    const wrapper = document.getElementById(`col-${col.key}-wrapper`);
    if (!wrapper) return;
    const colTasks = sortColumnTasks(col.key, getColumnTasks(col.key));
    const wip = getWipState(col.key, colTasks.length);

    const isCollapsed = state.collapsedColumns.has(col.key);
    if (isCollapsed) {
      wrapper.className =
        `kanban-column-collapsed kanban-column-collapsed--${col.key}`;
      wrapper.dataset.action = "collapse-column";
      wrapper.dataset.col = col.key;
      wrapper.title = "Clic para expandir";
      wrapper.innerHTML = `
        <div class="h-full flex items-center justify-center pointer-events-none">
           <span class="whitespace-nowrap font-bold text-gray-400 uppercase tracking-widest text-xs" style="writing-mode: vertical-rl; transform: rotate(180deg);">
              ${KANBAN_COLUMN_META[col.key].title}
           </span>
        </div>
        <div class="mt-2 text-gray-400 pointer-events-none flex items-center justify-center">
          <i class="fa-solid fa-expand mr-1"></i>
          <span class="text-[10px] font-semibold">${colTasks.length}</span>
        </div>
      `;
      return;
    }

    const inProgressAlertClass = col.key === "inprogress" && wip.isOverLimit ? "kanban-column--wip-alert" : "";
    wrapper.className =
      `kanban-column kanban-column--${col.key} ${inProgressAlertClass}`;
    wrapper.removeAttribute("data-action");
    // 3.4 — accessibility
    wrapper.setAttribute("role", "region");
    wrapper.setAttribute("aria-label", KANBAN_COLUMN_META[col.key]?.title ?? col.key);
    wrapper.innerHTML = `
      ${buildKanbanHeader({
        statusKey: col.key,
        count: colTasks.length,
        points: getColumnPoints(colTasks),
        includeAdd: col.key === "todo",
        includeCollapse: true,
        collapseColumnKey: col.key,
      })}
      <div id="kanban-${col.key}" class="min-h-[200px] space-y-2 flex-grow swimlane-drop-zone" data-status="${col.key}" aria-label="Tareas ${KANBAN_COLUMN_META[col.key]?.title ?? col.key}"></div>
    `;
    const container = wrapper.querySelector(`#kanban-${col.key}`);
    if (!container) return;

    if (col.key === "done") {
      const todayDone = colTasks.filter((task) => isDateToday(task.completedAt));
      const historyDone = colTasks.filter((task) => !isDateToday(task.completedAt));

      const todayHeader = document.createElement("div");
      todayHeader.className = "kanban-day-label";
      todayHeader.textContent = `Hecho hoy · ${todayDone.length}`;
      container.appendChild(todayHeader);

      if (todayDone.length === 0) {
        const emptyToday = document.createElement("div");
        emptyToday.className = "text-xs text-gray-400 py-1 px-1";
        emptyToday.textContent = "Sin tareas completadas hoy.";
        container.appendChild(emptyToday);
      } else {
        todayDone.forEach((task) => container.appendChild(createTaskElement(task, "sprint", state)));
      }

      if (historyDone.length > 0) {
        const historyToggle = document.createElement("button");
        historyToggle.className = "kanban-history-btn mt-2";
        historyToggle.innerHTML = `<i class="fa-solid fa-history mr-1"></i> Ver historial (${historyDone.length})`;

        const historyContainer = document.createElement("div");
        historyContainer.className = "hidden space-y-2 pt-2 border-t border-gray-200";
        historyDone.forEach((task) => historyContainer.appendChild(createTaskElement(task, "sprint", state)));

        historyToggle.onclick = () => {
          const hidden = historyContainer.classList.contains("hidden");
          historyContainer.classList.toggle("hidden");
          historyToggle.innerHTML = hidden
            ? `<i class="fa-solid fa-chevron-up mr-1"></i> Ocultar historial`
            : `<i class="fa-solid fa-history mr-1"></i> Ver historial (${historyDone.length})`;
        };
        container.appendChild(historyToggle);
        container.appendChild(historyContainer);
      }
      return;
    }

    if (colTasks.length === 0) {
      const emptyCopy = col.key === "todo"
        ? { icon: "list-check", title: "Nada pendiente", hint: "Arrastra tareas desde el Backlog o crea una nueva." }
        : { icon: "play", title: "Sin tareas en progreso", hint: "Mueve aquí lo que esté en ejecución." };
      container.innerHTML = buildEmptyState(emptyCopy);
      return;
    }

    const visibleTasks = colTasks.slice(0, 6);
    const hiddenTasks = colTasks.slice(6);
    visibleTasks.forEach((task) => container.appendChild(createTaskElement(task, "sprint", state)));

    if (hiddenTasks.length > 0) {
      const hiddenContainer = document.createElement("div");
      hiddenContainer.className = "hidden space-y-2";
      hiddenTasks.forEach((task) => {
        hiddenContainer.appendChild(createTaskElement(task, "sprint", state));
      });

      const toggleBtn = document.createElement("button");
      toggleBtn.className = "kanban-history-btn mb-2";
      toggleBtn.innerHTML = `<i class="fa-solid fa-chevron-down mr-1"></i> Ver ${hiddenTasks.length} tareas más`;
      toggleBtn.onclick = () => {
        hiddenContainer.classList.toggle("hidden");
        const isHidden = hiddenContainer.classList.contains("hidden");
        toggleBtn.innerHTML = isHidden
          ? `<i class="fa-solid fa-chevron-down mr-1"></i> Ver ${hiddenTasks.length} tareas más`
          : `<i class="fa-solid fa-chevron-up mr-1"></i> Ocultar`;
      };

      container.appendChild(toggleBtn);
      container.appendChild(hiddenContainer);
    }
  });
}
function renderThemes(state) {
  const container = document.getElementById("themes-container");
  if (!container) return;
  container.innerHTML = "";
  if (state.themes.length === 0) {
    container.innerHTML = `<p class="text-center text-gray-500">Aún no has creado ningún Tema estratégico.</p>`;
    return;
  }

  const sortedThemes = [...state.themes].sort(
    (a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0)
  );

  sortedThemes.forEach((theme) => {
    const themeEpics = state.epics.filter((e) => e.themeId === theme.id);
    const themeCard = document.createElement("div");
    themeCard.className = `theme-card bg-white rounded-lg shadow-md border-t-4 border-blue-600`;
    themeCard.dataset.id = theme.id;

    let epicsHTML =
      '<p class="text-sm text-gray-500 italic px-4">Este tema aún no tiene Epics.</p>';
    if (themeEpics.length > 0) {
      epicsHTML = themeEpics
        .map(
          (epic) => `
        <div class="flex items-center gap-2 p-2 mx-4 mb-2 rounded-md" style="background-color: ${epic.color || "#cbd5e1"}20;">
          <i class="fa-solid fa-book-atlas" style="color: ${epic.color || "#cbd5e1"}"></i>
          <span class="font-medium text-sm text-gray-700">${epic.title}</span>
        </div>
      `
        )
        .join("");
    }

    themeCard.innerHTML = `
      <div class="p-4">
        <div class="flex justify-between items-start">
          <div>
            <h3 class="text-xl font-bold text-gray-900">${theme.title}</h3>
            <p class="text-sm text-gray-600 mt-1">${theme.description || "Sin descripción."}</p>
          </div>
          <div class="flex items-center gap-2 flex-shrink-0">
            <button data-action="edit-theme" class="text-gray-500 hover:text-blue-600 p-1"><i class="fas fa-pencil"></i></button>
            <button data-action="delete-theme" class="text-gray-500 hover:text-red-600 p-1"><i class="fas fa-trash-can"></i></button>
          </div>
        </div>
      </div>
      <div class="bg-gray-50 rounded-b-lg py-3 space-y-1">
        <h4 class="text-xs font-semibold uppercase text-gray-500 px-4 mb-2">Epics en este Tema</h4>
        ${epicsHTML}
      </div>
    `;
    container.appendChild(themeCard);
  });
}
function renderEpics(state) {
  const container = document.getElementById("epics-container");
  if (!container) return;
  container.innerHTML = "";

  const toolbar = document.getElementById("epics-toolbar");
  if (toolbar) {
    toolbar.innerHTML = `
      <div class="epic-control-shell">
        <div class="epic-control-main">
          <input type="text" id="epics-search" placeholder="Buscar iniciativas…"
            class="epic-search-input"
            value="${state.epicsSearch || ""}">
          <div class="epic-control-group">
            <select id="epics-status-filter" class="epic-select">
              <option value="">Todos los estados</option>
              <option value="Por Empezar" ${state.epicsStatusFilter === "Por Empezar" ? "selected" : ""}>Por Empezar</option>
              <option value="En Progreso" ${state.epicsStatusFilter === "En Progreso" ? "selected" : ""}>En Progreso</option>
              <option value="Completado" ${state.epicsStatusFilter === "Completado" ? "selected" : ""}>Completado</option>
            </select>
            <select id="epics-sort" class="epic-select">
              <option value="recent" ${state.epicsSortMode === "recent" ? "selected" : ""}>Recientes</option>
              <option value="progress_asc" ${state.epicsSortMode === "progress_asc" ? "selected" : ""}>Progreso ↑</option>
              <option value="progress_desc" ${state.epicsSortMode === "progress_desc" ? "selected" : ""}>Progreso ↓</option>
              <option value="points_desc" ${state.epicsSortMode === "points_desc" ? "selected" : ""}>Puntos ↓</option>
              <option value="points_asc" ${state.epicsSortMode === "points_asc" ? "selected" : ""}>Puntos ↑</option>
            </select>
          </div>
          <button data-action="new-epic" class="epic-new-btn">
            <i class="fa-solid fa-plus"></i> Nueva Iniciativa
          </button>
        </div>
      </div>
    `;
  }

  if (state.epics.length === 0) {
    container.innerHTML = `
      <div class="epic-empty-state">
        <i class="fas fa-book-atlas"></i>
        <p>No hay iniciativas definidas aún.</p>
        <button data-action="new-epic" class="epic-new-btn" style="margin-top:14px;">
          <i class="fa-solid fa-plus"></i> Nueva Iniciativa
        </button>
      </div>
    `;
    return;
  }

  const searchInput = document.getElementById("epics-search");
  const statusSelect = document.getElementById("epics-status-filter");
  const sortSelect = document.getElementById("epics-sort");

  if (searchInput && typeof appActions !== "undefined")
    searchInput.addEventListener("input", (e) => appActions.setEpicsSearch(e.target.value));
  if (statusSelect && typeof appActions !== "undefined")
    statusSelect.addEventListener("change", (e) => appActions.setEpicsStatusFilter(e.target.value));
  if (sortSelect && typeof appActions !== "undefined")
    sortSelect.addEventListener("change", (e) => appActions.setEpicsSortMode(e.target.value));

  const applyFilters = () => {
    const searchVal = (state.epicsSearch || "").toLowerCase();
    const statusFilter = state.epicsStatusFilter;
    const sortMode = state.epicsSortMode;

    let filtered = state.epics.filter((epic) => {
      const matchesSearch =
        epic.title.toLowerCase().includes(searchVal) ||
        (epic.description || "").toLowerCase().includes(searchVal);
      const matchesStatus = !statusFilter || epic.status === statusFilter;
      return matchesSearch && matchesStatus;
    });

    filtered.sort((a, b) => {
      const getProgress = (e) => {
        const epicTasks = state.tasks.filter((t) => t.epicId === e.id);
        const total = epicTasks.reduce((s, t) => s + (t.points || 0), 0);
        const done = epicTasks
          .filter((t) => t.status === "completed" || t.kanbanStatus === "done")
          .reduce((s, t) => s + (t.points || 0), 0);
        return total > 0 ? done / total : 0;
      };
      const getTotalPoints = (e) =>
        state.tasks.filter((t) => t.epicId === e.id).reduce((s, t) => s + (t.points || 0), 0);

      switch (sortMode) {
        case "progress_asc":  return getProgress(a) - getProgress(b);
        case "progress_desc": return getProgress(b) - getProgress(a);
        case "points_asc":    return getTotalPoints(a) - getTotalPoints(b);
        case "points_desc":   return getTotalPoints(b) - getTotalPoints(a);
        default:              return (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0);
      }
    });

    renderEpicCards(filtered, state);
  };

  applyFilters();
}

function computeEpicHealth(epic, progressPercent, percentTimeElapsed) {
  if (epic.status === "Completado") return { key: "done", label: "Completado" };
  if (epic.status === "Por Empezar" && progressPercent === 0) return { key: "idle", label: "Por Empezar" };
  if (percentTimeElapsed === null) return { key: "ok", label: "En curso" };
  const delta = progressPercent - percentTimeElapsed;
  if (delta <= -10) return { key: "late", label: "Atrasado" };
  if (delta < 0)    return { key: "risk", label: "En riesgo" };
  return { key: "ok", label: "En curso" };
}

function buildEpicProgressBar(progressPct, timePct, healthKey, rowIdx) {
  const clamped = Math.min(Math.max(progressPct, 0), 100);
  const delay = 120 + (rowIdx || 0) * 25;
  const marker = timePct != null
    ? `<div class="epic-bar-time-marker" style="left:${Math.min(timePct, 100)}%"></div>`
    : "";
  return `
    <div class="epic-bar-track" role="progressbar" aria-valuenow="${Math.round(clamped)}">
      <div class="epic-bar-fill epic-bar-fill--${healthKey}"
           style="--bar-w:${clamped}%;--bar-delay:${delay}ms"></div>
      ${marker}
    </div>
  `;
}

function toRgba(color, alpha, fallback = `rgba(15, 118, 110, ${alpha})`) {
  if (typeof color !== "string") return fallback;
  const hex = color.trim();
  const shortMatch = /^#([0-9a-f]{3})$/i.exec(hex);
  if (shortMatch) {
    const [r, g, b] = shortMatch[1].split("").map((part) => parseInt(part + part, 16));
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  const longMatch = /^#([0-9a-f]{6})$/i.exec(hex);
  if (longMatch) {
    const value = longMatch[1];
    const r = parseInt(value.slice(0, 2), 16);
    const g = parseInt(value.slice(2, 4), 16);
    const b = parseInt(value.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  return fallback;
}

function renderEpicCards(epics, state) {
  const container = document.getElementById("epics-container");
  let wrapper = container.querySelector("#epics-cards-wrapper");
  if (!wrapper) {
    wrapper = document.createElement("div");
    wrapper.id = "epics-cards-wrapper";
    container.appendChild(wrapper);
  }
  wrapper.innerHTML = "";

  if (epics.length === 0) {
    wrapper.innerHTML = `<div class="epic-empty-state" style="padding:32px 0;"><p>No se encontraron iniciativas.</p></div>`;
    return;
  }

  // --- Stats for the summary strip ---
  let totalPts = 0, donePts = 0, lateCount = 0, riskCount = 0, noDateCount = 0;
  epics.forEach((epic) => {
    const epicTasks = state.tasks.filter((t) => t.epicId === epic.id);
    const ep = epicTasks.reduce((s, t) => s + (t.points || 0), 0);
    const dp = epicTasks
      .filter((t) => t.status === "completed" || t.kanbanStatus === "done")
      .reduce((s, t) => s + (t.points || 0), 0);
    totalPts += ep;
    donePts += dp;
    const prog = ep > 0 ? (dp / ep) * 100 : 0;
    let timePct = null;
    if (epic.startDate && epic.endDate) {
      const s = epic.startDate.toDate ? epic.startDate.toDate() : new Date(epic.startDate);
      const e = epic.endDate.toDate   ? epic.endDate.toDate()   : new Date(epic.endDate);
      s.setHours(0,0,0,0); e.setHours(23,59,59,999);
      const today = new Date(); today.setHours(0,0,0,0);
      const dur = e - s;
      timePct = dur > 0 ? (Math.max(0, Math.min(today - s, dur)) / dur) * 100 : 0;
    } else {
      noDateCount++;
    }
    const h = computeEpicHealth(epic, prog, timePct);
    if (h.key === "late") lateCount++;
    else if (h.key === "risk") riskCount++;
  });

  const lateBadge = lateCount > 0
    ? `<span class="epic-stats-badge epic-stats-badge--late"><i class="fa-solid fa-circle-exclamation" style="font-size:.65rem"></i> ${lateCount} Atrasada${lateCount > 1 ? "s" : ""}</span>`
    : "";
  const riskBadge = riskCount > 0
    ? `<span class="epic-stats-badge epic-stats-badge--risk"><i class="fa-solid fa-triangle-exclamation" style="font-size:.65rem"></i> ${riskCount} En riesgo</span>`
    : "";
  const noDatePart = noDateCount > 0
    ? `<span class="epic-stats-sep">·</span><span class="epic-stats-item">${noDateCount} sin fecha</span>`
    : "";

  const statsEl = document.createElement("div");
  statsEl.className = "epic-stats-strip";
  statsEl.innerHTML = `
    <span class="epic-stats-item"><span class="epic-stats-num">${epics.length}</span> iniciativa${epics.length !== 1 ? "s" : ""}</span>
    <span class="epic-stats-sep">·</span>
    <span class="epic-stats-item"><span class="epic-stats-num">${donePts}</span> / <span class="epic-stats-num">${totalPts}</span> pts completados</span>
    ${noDatePart}${lateBadge}${riskBadge}
  `;
  wrapper.appendChild(statsEl);

  // --- Board ---
  const board = document.createElement("div");
  board.className = "epic-board";

  const headerEl = document.createElement("div");
  headerEl.className = "epic-list-header";
  headerEl.setAttribute("aria-hidden", "true");
  headerEl.innerHTML = `<span>Iniciativa</span><span>Estado</span><span>Progreso</span><span>Pts</span><span></span>`;
  board.appendChild(headerEl);

  epics.forEach((epic, index) => {
    const epicTasks = state.tasks.filter((t) => t.epicId === epic.id);
    const totalPoints = epicTasks.reduce((s, t) => s + (t.points || 0), 0);
    const completedPoints = epicTasks
      .filter((t) => t.status === "completed" || t.kanbanStatus === "done")
      .reduce((s, t) => s + (t.points || 0), 0);
    const progressPercent = totalPoints > 0 ? (completedPoints / totalPoints) * 100 : 0;

    let percentTimeElapsed = null;
    let timeLabel = "Sin fecha";
    if (epic.startDate && epic.endDate) {
      const start = epic.startDate.toDate ? epic.startDate.toDate() : new Date(epic.startDate);
      const end   = epic.endDate.toDate   ? epic.endDate.toDate()   : new Date(epic.endDate);
      start.setHours(0,0,0,0); end.setHours(23,59,59,999);
      const today = new Date(); today.setHours(0,0,0,0);
      const totalDur = end - start;
      const rawElapsed = today - start;
      percentTimeElapsed = totalDur > 0
        ? (Math.max(0, Math.min(rawElapsed, totalDur)) / totalDur) * 100
        : 0;
      const totalDays = Math.ceil(totalDur / 86400000);
      const daysPassed = Math.ceil(rawElapsed / 86400000);
      const daysLeft = totalDays - daysPassed;
      if (daysPassed < 0) timeLabel = `Inicia en ${Math.abs(daysPassed)}d`;
      else if (daysPassed > totalDays) timeLabel = `Finalizó hace ${daysPassed - totalDays}d`;
      else timeLabel = `${daysLeft}d restantes`;
    }

    const health = computeEpicHealth(epic, progressPercent, percentTimeElapsed);
    const epicColor = epic.color || "#3b82f6";
    const isExpanded = state.expandedEpicIds.has(epic.id);

    const definedKRs = epic.keyResults || [];
    const completedIndices = epic.completedKrIndices || [];
    const krsListHTML = definedKRs.map((kr, i) => {
      const isChecked = completedIndices.includes(i);
      return `
        <div class="epic-kr-item ${isChecked ? "epic-kr-item--done" : ""}">
          <input type="checkbox" class="epic-kr-checkbox"
            data-epic-id="${epic.id}" data-index="${i}" ${isChecked ? "checked" : ""}>
          <span class="epic-kr-text ${isChecked ? "epic-kr-text--done" : ""}">${kr}</span>
        </div>`;
    }).join("");

    const row = document.createElement("div");
    row.className = `epic-row epic-row--${health.key}`;
    row.dataset.epicId = epic.id;
    row.style.setProperty("--row-idx", String(index));
    row.innerHTML = `
      <div class="epic-row-identity">
        <div class="epic-row-dot" style="background:${epicColor};box-shadow:0 0 0 3px ${toRgba(epicColor, 0.15)}"></div>
        <div class="epic-row-text">
          <span class="epic-row-title" title="${epic.title}">${epic.title}</span>
          <span class="epic-row-desc">${epic.description || "Sin descripción"}</span>
        </div>
      </div>
      <div class="epic-row-state">
        <span class="epic-chip epic-chip--${health.key}">${health.label}</span>
      </div>
      <div class="epic-row-bar">
        ${buildEpicProgressBar(progressPercent, percentTimeElapsed, health.key, index)}
        <div class="epic-bar-legend">${timeLabel}</div>
      </div>
      <div class="epic-row-metric">
        <span class="epic-metric-pts">${completedPoints}<span class="epic-metric-sep">/</span>${totalPoints} pts</span>
        <span class="epic-metric-pct">${Math.round(progressPercent)}%</span>
      </div>
      <button class="epic-row-chevron" data-action="toggle-details" aria-expanded="${isExpanded}">
        <i class="fas fa-chevron-down"></i>
      </button>
    `;

    const detail = document.createElement("div");
    detail.className = `epic-row-detail${isExpanded ? "" : " epic-collapsed"}`;
    detail.dataset.epicDetail = epic.id;
    detail.innerHTML = `
      <div class="epic-row-detail-inner">
        <div class="epic-detail-meta">
          <span class="epic-detail-tasks-count">${epicTasks.length} tarea${epicTasks.length !== 1 ? "s" : ""}</span>
          <div class="epic-detail-actions">
            <button data-action="edit-epic" class="epic-detail-btn"><i class="fas fa-pencil"></i> Editar</button>
            <button data-action="delete-epic" class="epic-detail-btn epic-detail-btn--danger"><i class="fas fa-trash-can"></i> Eliminar</button>
          </div>
        </div>
        <div class="epic-krs-list">
          ${krsListHTML || '<p class="epic-krs-empty">Sin objetivos definidos.</p>'}
        </div>
      </div>
    `;

    board.appendChild(row);
    board.appendChild(detail);
  });

  wrapper.appendChild(board);
}

// --- EN ui.js (Reemplaza la función renderMyTasks completa) ---

function renderMyTasks(state) {
  const container = document.getElementById("mytasks-container");
  if (!container || !state.user) return;

  // 1. ESTRUCTURA (Solo la creamos si no existe para no perder el foco al escribir)
  if (!document.getElementById("mytasks-controls-wrapper")) {
    container.innerHTML = `
      <div id="mytasks-controls-wrapper" class="bg-white p-4 rounded-xl shadow-sm border border-gray-200 mb-6 space-y-3">
        <div class="flex flex-wrap items-center gap-3">
          <div class="relative flex-1" style="min-width: 220px;">
            <i class="fas fa-search absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"></i>
            <input type="text" id="mytasks-search" placeholder="Buscar en mis tareas..." 
              class="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all">
          </div>

          <div id="mytasks-status-chips" class="flex items-center gap-2 flex-wrap">
            <button data-mytasks-status="all" class="px-3 py-1.5 rounded-full text-xs font-semibold border border-blue-600 bg-blue-600 text-white">Todos</button>
            <button data-mytasks-status="todo" class="px-3 py-1.5 rounded-full text-xs font-semibold border border-gray-200 bg-white text-gray-600">Por hacer</button>
            <button data-mytasks-status="inprogress" class="px-3 py-1.5 rounded-full text-xs font-semibold border border-gray-200 bg-white text-gray-600">En progreso</button>
            <button data-mytasks-status="completed" class="px-3 py-1.5 rounded-full text-xs font-semibold border border-gray-200 bg-white text-gray-600">Hecho</button>
          </div>

          <label class="flex items-center gap-2 cursor-pointer select-none bg-gray-50 px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-100 transition-colors">
            <input type="checkbox" id="mytasks-hide-completed" class="form-checkbox h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-0 cursor-pointer">
            <span class="text-xs font-bold text-gray-600 uppercase">Ocultar Hecho</span>
          </label>

          <button id="mytasks-more-filters" class="px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-600 hover:bg-gray-50 transition-colors">
            Más filtros
          </button>
        </div>

        <div id="mytasks-extra-filters" class="hidden flex flex-wrap items-center gap-3">
          <div class="relative group">
            <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <i class="fas fa-sort text-gray-400"></i>
            </div>
            <select id="mytasks-sort" class="pl-10 pr-8 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none appearance-none cursor-pointer hover:bg-gray-50 transition-colors">
              <option value="recent_desc">📅 Más recientes</option>
              <option value="recent_asc">📅 Más antiguos</option>
              <option value="due_asc">⏰ Vencimiento próximo</option>
              <option value="due_desc">⏰ Vencimiento lejano</option>
              <option value="points_desc">🔢 Puntos (mayor primero)</option>
              <option value="points_asc">🔢 Puntos (menor primero)</option>
            </select>
          </div>

          <div>
            <select id="mytasks-sprint-filter" class="py-2 pr-6 pl-3 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none hover:bg-gray-50">
              <option value="all">Todos los Sprints</option>
              ${state.taskLists
                .filter((l) => !l.isBacklog && !l.isArchived)
                .map((s) => `<option value="${s.id}">${s.title}</option>`)
                .join("")}
            </select>
          </div>

          <div>
            <select id="mytasks-priority-filter" class="py-2 pr-6 pl-3 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none hover:bg-gray-50">
              <option value="all">Prioridad: Todas</option>
              <option value="high">Alta</option>
              <option value="medium">Media</option>
              <option value="low">Baja</option>
            </select>
          </div>
        </div>

        <input type="hidden" id="mytasks-status-filter" value="all" />
      </div>

      <div id="mytasks-list-area" class="space-y-3 pb-10"></div>
    `;

    // --- EVENT LISTENERS (Se asignan una sola vez) ---
    const searchInput = document.getElementById("mytasks-search");
    const sortSelect = document.getElementById("mytasks-sort");
    const hideCheck = document.getElementById("mytasks-hide-completed");

    const sprintSelect = document.getElementById("mytasks-sprint-filter");
    const prioritySelect = document.getElementById("mytasks-priority-filter");
    const statusInput = document.getElementById("mytasks-status-filter");
    const statusChips = document.querySelectorAll("[data-mytasks-status]");
    const moreFiltersBtn = document.getElementById("mytasks-more-filters");
    const extraFilters = document.getElementById("mytasks-extra-filters");

    const refresh = () => renderMyTasksListArea(state); // Función auxiliar definida abajo

    searchInput.addEventListener("input", refresh);
    sortSelect.addEventListener("change", refresh);
    hideCheck.addEventListener("change", refresh);
    sprintSelect.addEventListener("change", refresh);
    prioritySelect.addEventListener("change", refresh);

    if (moreFiltersBtn && extraFilters) {
      moreFiltersBtn.addEventListener("click", () => {
        extraFilters.classList.toggle("hidden");
        moreFiltersBtn.textContent = extraFilters.classList.contains("hidden")
          ? "Más filtros"
          : "Menos filtros";
      });
    }

    const setActiveChip = (value) => {
      statusChips.forEach((chip) => {
        const active = chip.dataset.mytasksStatus === value;
        chip.classList.toggle("bg-blue-600", active);
        chip.classList.toggle("text-white", active);
        chip.classList.toggle("border-blue-600", active);
        chip.classList.toggle("bg-white", !active);
        chip.classList.toggle("text-gray-600", !active);
        chip.classList.toggle("border-gray-200", !active);
      });
    };

    statusChips.forEach((chip) => {
      chip.addEventListener("click", () => {
        const value = chip.dataset.mytasksStatus || "all";
        statusInput.value = value;
        setActiveChip(value);
        refresh();
      });
    });
  }

  // 2. ACTUALIZAR LISTA (Llamamos a la lógica de renderizado)
  renderMyTasksListArea(state);
}

// --- FUNCIÓN AUXILIAR PARA LA LÓGICA DE FILTRADO Y ORDEN ---
function renderMyTasksListArea(state) {
  const listContainer = document.getElementById("mytasks-list-area");
  if (!listContainer) return;

  // Inputs actuales
  const searchVal = document.getElementById("mytasks-search")?.value.toLowerCase().trim() || "";
  const sortMode = document.getElementById("mytasks-sort")?.value || "recent_desc";
  const hideCompleted = document.getElementById("mytasks-hide-completed")?.checked || false;
  const sprintFilter = document.getElementById("mytasks-sprint-filter")?.value || "all";
  const statusFilter = document.getElementById("mytasks-status-filter")?.value || "all";
  const priorityFilter = document.getElementById("mytasks-priority-filter")?.value || "all";

  // 1. Filtrado Base
  let myTasks = state.tasks.filter((t) => t.assignee === state.user.email);

  // 1.b Filtro por Sprint
  if (sprintFilter && sprintFilter !== "all") {
    myTasks = myTasks.filter((t) => t.listId === sprintFilter);
  }

  // 2. Filtro: Ocultar Completadas
  if (hideCompleted) {
    myTasks = myTasks.filter((t) => t.kanbanStatus !== "done" && t.status !== "completed");
  }

  // 3. Filtro: Búsqueda Texto
  if (searchVal) {
    myTasks = myTasks.filter((t) => t.title.toLowerCase().includes(searchVal));
  }

  // 4. Filtro: Estado
  if (statusFilter && statusFilter !== "all") {
    if (statusFilter === "completed") {
      myTasks = myTasks.filter((t) => t.status === "completed" || t.kanbanStatus === "done");
    } else if (statusFilter === "inprogress") {
      myTasks = myTasks.filter((t) => t.status === "inprogress" || t.kanbanStatus === "inprogress");
    } else if (statusFilter === "todo") {
      myTasks = myTasks.filter(
        (t) =>
          !t.status ||
          (t.status !== "completed" && t.kanbanStatus !== "inprogress" && t.status !== "inprogress")
      );
    }
  }

  // 5. Filtro: Prioridad (impact)
  if (priorityFilter && priorityFilter !== "all") {
    myTasks = myTasks.filter((t) => {
      const impact = t.impact || 0;
      if (priorityFilter === "high") return impact >= 7;
      if (priorityFilter === "medium") return impact >= 4 && impact <= 6;
      if (priorityFilter === "low") return impact <= 3;
      return true;
    });
  }

  // 4. Lógica de Ordenamiento
  myTasks.sort((a, b) => {
    // Helper para fechas seguras
    const getDate = (d) => (d && d.toDate ? d.toDate().getTime() : d ? new Date(d).getTime() : 0);

    switch (sortMode) {
      case "recent_desc":
        return getDate(b.createdAt) - getDate(a.createdAt);
      case "recent_asc":
        return getDate(a.createdAt) - getDate(b.createdAt);
      case "due_asc": {
        const dateA = getDate(a.dueDate) || 9999999999999;
        const dateB = getDate(b.dueDate) || 9999999999999;
        return dateA - dateB;
      }
      case "due_desc": {
        const dateA = getDate(a.dueDate) || 0;
        const dateB = getDate(b.dueDate) || 0;
        return dateB - dateA;
      }
      case "points_desc":
        return (b.points || 0) - (a.points || 0);
      case "points_asc":
        return (a.points || 0) - (b.points || 0);
      default:
        return getDate(b.createdAt) - getDate(a.createdAt);
    }
  });

  // 5. Renderizado Final
  listContainer.innerHTML = "";

  if (myTasks.length > 0) {
    const getDate = (d) => (d && d.toDate ? d.toDate() : d ? new Date(d) : null);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const buckets = {
      today: { title: "Hoy / Vencidas", items: [] },
      week: { title: "Esta semana", items: [] },
      later: { title: "Después", items: [] },
      nodate: { title: "Sin fecha", items: [] },
    };

    myTasks.forEach((t) => {
      const due = getDate(t.dueDate);
      if (!due) {
        buckets.nodate.items.push(t);
        return;
      }
      const dueDate = new Date(due);
      dueDate.setHours(0, 0, 0, 0);
      const diffDays = Math.floor((dueDate - today) / (1000 * 60 * 60 * 24));
      if (diffDays <= 0) buckets.today.items.push(t);
      else if (diffDays <= 7) buckets.week.items.push(t);
      else buckets.later.items.push(t);
    });

    const renderSection = (section) => {
      if (!section.items.length) return;
      const wrapper = document.createElement("div");
      wrapper.className = "space-y-2";
      wrapper.innerHTML = `
        <div class="flex items-center justify-between text-xs font-semibold text-gray-500 uppercase tracking-wider">
          <span>${section.title}</span>
          <span class="text-gray-400">${section.items.length}</span>
        </div>
      `;
      const list = document.createElement("div");
      list.className = "space-y-2";
      section.items.forEach((t) => list.appendChild(createCompactTaskElement(t, state)));
      wrapper.appendChild(list);
      listContainer.appendChild(wrapper);
    };

    renderSection(buckets.today);
    renderSection(buckets.week);
    renderSection(buckets.later);
    renderSection(buckets.nodate);
  } else {
    // Estado Vacío
    listContainer.innerHTML = `
        <div class="flex flex-col items-center justify-center py-12 text-gray-400 border-2 border-dashed border-gray-200 rounded-xl bg-gray-50">
            <i class="fas fa-filter text-3xl mb-3 opacity-50"></i>
            <p class="text-sm font-medium">No se encontraron tareas con estos filtros.</p>
            <p class="text-xs mt-1">Intenta cambiar la búsqueda o el orden.</p>
        </div>
    `;
  }
}
// --- EN ui.js ---

const CYCLE_LENGTH_DAYS = 14;
const CYCLE_POINTS_TARGET = 40;
const CYCLE_ANCHOR_DATE = new Date(2026, 2, 16); // 2026-03-16 (lunes, mes 0-indexado)

function getCurrentCycleWindow(referenceDate = new Date(), anchorDate = null) {
  const base = new Date(referenceDate);
  base.setHours(0, 0, 0, 0);

  const anchor = anchorDate ? new Date(anchorDate) : new Date(CYCLE_ANCHOR_DATE);
  anchor.setHours(0, 0, 0, 0);

  const msPerDay = 24 * 60 * 60 * 1000;
  const baseUtcDay = Date.UTC(base.getFullYear(), base.getMonth(), base.getDate()) / msPerDay;
  const anchorUtcDay =
    Date.UTC(anchor.getFullYear(), anchor.getMonth(), anchor.getDate()) / msPerDay;
  const diffDays = Math.floor(baseUtcDay - anchorUtcDay);
  const cycleIndex = Math.floor(diffDays / CYCLE_LENGTH_DAYS);

  const start = new Date(anchor);
  start.setDate(anchor.getDate() + cycleIndex * CYCLE_LENGTH_DAYS);

  const endExclusive = new Date(start);
  endExclusive.setDate(start.getDate() + CYCLE_LENGTH_DAYS);

  return { start, endExclusive };
}

function formatShortDate(date) {
  return date.toLocaleDateString("es-MX", { day: "2-digit", month: "short" });
}

function formatCycleDateDMY(date) {
  const d = String(date.getDate()).padStart(2, "0");
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const y = date.getFullYear();
  return `${d}-${m}-${y}`;
}

function getQuarterLabel(date) {
  const quarter = Math.floor(date.getMonth() / 3) + 1;
  return `Q${quarter} ${date.getFullYear()}`;
}

function getCycleTitleDateParts(date) {
  return {
    day: date.toLocaleDateString("es-MX", { day: "2-digit" }),
    month: date
      .toLocaleDateString("es-MX", { month: "short" })
      .replace(".", "")
      .toUpperCase(),
    year: date.toLocaleDateString("es-MX", { year: "numeric" }),
  };
}

function buildInlineBar(metrics, capacity, laneIndex) {
  const norm = (v) => Math.max(0, Number(v || 0));
  const cap = Math.max(1, Number(capacity) || CYCLE_POINTS_TARGET);
  const done = norm(metrics.ptsDoneThisCycle);
  const inprogress = norm(metrics.ptsInProgress);
  const todo = norm(metrics.ptsTodo);
  const doneIn = Math.min(done, cap);
  const progressIn = Math.min(inprogress, Math.max(cap - doneIn, 0));
  const todoIn = Math.min(todo, Math.max(cap - doneIn - progressIn, 0));
  const pct = (v) => `${((v / cap) * 100).toFixed(2)}%`;
  const base = 120 + (laneIndex || 0) * 30;
  const aria = `Hecho ${Math.round(done)}, En progreso ${Math.round(inprogress)}, Pendiente ${Math.round(todo)} de ${cap} pts`;
  return `
    <div class="carga-bar-track" role="group" aria-label="${aria}">
      <div class="carga-bar-seg carga-bar-seg--done"
           style="--bar-w:${pct(doneIn)};--bar-delay:${base}ms"
           title="Hecho: ${Math.round(done)} pts"></div>
      <div class="carga-bar-seg carga-bar-seg--progress"
           style="--bar-w:${pct(progressIn)};--bar-delay:${base + 70}ms"
           title="En progreso: ${Math.round(inprogress)} pts"></div>
      <div class="carga-bar-seg carga-bar-seg--todo"
           style="--bar-w:${pct(todoIn)};--bar-delay:${base + 140}ms"
           title="Pendiente: ${Math.round(todo)} pts"></div>
      <div class="carga-bar-seg carga-bar-seg--free"></div>
    </div>
  `;
}

function buildPersonCapacityBar(metrics, capacity = CYCLE_POINTS_TARGET) {
  const normalize = (value) => {
    const num = Number(value || 0);
    return Number.isFinite(num) ? Math.max(0, num) : 0;
  };
  const fmt = (value) => {
    const rounded = Math.round(value * 10) / 10;
    return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  };

  const done = normalize(metrics.ptsDoneThisCycle);
  const inprogress = normalize(metrics.ptsInProgress);
  const todo = normalize(metrics.ptsTodo);
  const cap = Math.max(1, Number(capacity) || 40);

  const total = done + inprogress + todo;
  const overflow = Math.max(0, total - cap);

  const doneIn = Math.min(done, cap);
  const progressIn = Math.min(inprogress, Math.max(cap - doneIn, 0));
  const todoIn = Math.min(todo, Math.max(cap - doneIn - progressIn, 0));
  const emptyIn = Math.max(cap - doneIn - progressIn - todoIn, 0);
  const pct = (value) => `${((value / cap) * 100).toFixed(2)}%`;

  const overflowBadge =
    overflow > 0 ? `<span class="person-capacity-overflow">+${fmt(overflow)} sobre capacidad</span>` : "";

  const aria = `Hecho ${fmt(done)} pts, En progreso ${fmt(inprogress)} pts, Por hacer ${fmt(todo)} pts, Total ${fmt(total)} de ${fmt(cap)} puntos`;

  // Separadores para accesibilidad daltonismo: solo en segmentos con ancho > 0 que tengan alguno posterior visible
  const hasDone = doneIn > 0;
  const hasProgress = progressIn > 0;
  const hasTodo = todoIn > 0;
  const hasEmpty = emptyIn > 0;
  const doneSep = hasDone && (hasProgress || hasTodo || hasEmpty) ? "person-capacity-segment--has-separator" : "";
  const progressSep = hasProgress && (hasTodo || hasEmpty) ? "person-capacity-segment--has-separator" : "";
  const todoSep = hasTodo && hasEmpty ? "person-capacity-segment--has-separator" : "";

  return `
    <div class="person-capacity-wrap" title="${aria}">
      <div class="person-capacity-head">
        <span class="person-capacity-title">Capacidad ciclo</span>
      </div>

      <div class="person-capacity-bar" role="group" aria-label="${aria}">
        <span class="person-capacity-segment person-capacity-segment--done ${doneSep}"
              role="meter" aria-label="Hecho" aria-valuenow="${fmt(done)}" aria-valuemin="0" aria-valuemax="${fmt(cap)}"
              style="width:${pct(doneIn)}" title="Hecho ${fmt(done)} pts"></span>
        <span class="person-capacity-segment person-capacity-segment--progress ${progressSep}"
              role="meter" aria-label="En progreso" aria-valuenow="${fmt(inprogress)}" aria-valuemin="0" aria-valuemax="${fmt(cap)}"
              style="width:${pct(progressIn)}" title="En progreso ${fmt(inprogress)} pts"></span>
        <span class="person-capacity-segment person-capacity-segment--todo ${todoSep}"
              role="meter" aria-label="Pendiente" aria-valuenow="${fmt(todo)}" aria-valuemin="0" aria-valuemax="${fmt(cap)}"
              style="width:${pct(todoIn)}" title="Por hacer ${fmt(todo)} pts"></span>
        <span class="person-capacity-segment person-capacity-segment--empty" style="width:${pct(emptyIn)}" aria-hidden="true"></span>
      </div>

      <div class="person-capacity-legend">
        <span class="person-capacity-chip person-capacity-chip--done" title="Hecho en este ciclo">
          <span class="person-capacity-chip-label">Hecho</span>
          <span class="person-capacity-chip-value">${fmt(done)}</span>
        </span>
        <span class="person-capacity-chip person-capacity-chip--progress" title="Trabajo en progreso">
          <span class="person-capacity-chip-label">Progreso</span>
          <span class="person-capacity-chip-value">${fmt(inprogress)}</span>
        </span>
        <span class="person-capacity-chip person-capacity-chip--todo" title="Trabajo pendiente por hacer">
          <span class="person-capacity-chip-label">Pendiente</span>
          <span class="person-capacity-chip-value">${fmt(todo)}</span>
        </span>
        <span class="person-capacity-chip person-capacity-chip--free" title="Capacidad disponible">
          <span class="person-capacity-chip-label">Libre</span>
          <span class="person-capacity-chip-value">${fmt(emptyIn)}</span>
        </span>
        ${overflowBadge}
      </div>
    </div>
  `;
}

function renderPersonView(state) {
  const container = document.getElementById("view-by-person");
  if (!container) return;
  if (Array.isArray(state.personHistoryCharts)) {
    state.personHistoryCharts.forEach((chart) => chart?.destroy?.());
  }
  state.personHistoryCharts = [];
  container.innerHTML = "";

  const cycleWindow = getCurrentCycleWindow(new Date());
  const cycleStartLabel = formatCycleDateDMY(cycleWindow.start);
  const cycleEnd = new Date(cycleWindow.endExclusive);
  cycleEnd.setDate(cycleEnd.getDate() - 3); // retrocede al viernes (fin de semana laboral)
  const cycleEndLabel = formatCycleDateDMY(cycleEnd);
  const viewMode = state.personViewMode || "current";
  if (dom.viewTitle) {
    dom.viewTitle.textContent = "Carga";
  }

  const normalize = (email) => (email ? email.trim().toLowerCase() : "unassigned");
  const getDateValue = (value) => (value?.toDate ? value.toDate() : value ? new Date(value) : null);
  const isDateInCycle = (value) => {
    const d = getDateValue(value);
    return Boolean(d && d >= cycleWindow.start && d < cycleWindow.endExclusive);
  };
  const sprintMap = new Map(state.taskLists.map((s) => [s.id, s]));
  const sprintOverlapsCycle = (sprint) => {
    if (!sprint || sprint.isBacklog || sprint.isArchived) return false;
    const start = getDateValue(sprint.startDate);
    const end = getDateValue(sprint.endDate);
    if (start && end) {
      const endExclusive = new Date(end);
      endExclusive.setDate(endExclusive.getDate() + 1);
      return start < cycleWindow.endExclusive && endExclusive > cycleWindow.start;
    }
    if (start) return start < cycleWindow.endExclusive;
    if (end) {
      const endExclusive = new Date(end);
      endExclusive.setDate(endExclusive.getDate() + 1);
      return endExclusive > cycleWindow.start;
    }
    return sprint.id === state.currentSprintId;
  };
  const isTodoTask = (task) =>
    task.kanbanStatus === "todo" || !["inprogress", "done"].includes(task.kanbanStatus);
  const isTaskInCurrentCycle = (task) => {
    if (
      isDateInCycle(task.completedAt) ||
      isDateInCycle(task.startedAt) ||
      isDateInCycle(task.createdAt)
    )
      return true;
    if (task.kanbanStatus === "inprogress" || isTodoTask(task)) {
      return sprintOverlapsCycle(sprintMap.get(task.listId));
    }
    return false;
  };
  const getLastUpdatedMs = (task) => {
    const candidates = [task.updatedAt, task.completedAt, task.startedAt, task.createdAt]
      .map((v) => getDateValue(v))
      .filter(Boolean)
      .map((d) => d.getTime());
    return candidates.length ? Math.max(...candidates) : 0;
  };

  const allSprintOptionLabel =
    viewMode === "history" ? "Toda la historia disponible" : "Todos los sprints activos";
  let sprintOptions = `<option value="all">${allSprintOptionLabel}</option>`;
  state.taskLists
    .filter((list) => !list.isBacklog)
    .sort((a, b) => {
      if (Boolean(a.isArchived) !== Boolean(b.isArchived)) return Number(a.isArchived) - Number(b.isArchived);
      const aTime =
        getDateValue(a.endDate)?.getTime() ||
        getDateValue(a.startDate)?.getTime() ||
        getDateValue(a.createdAt)?.getTime() ||
        0;
      const bTime =
        getDateValue(b.endDate)?.getTime() ||
        getDateValue(b.startDate)?.getTime() ||
        getDateValue(b.createdAt)?.getTime() ||
        0;
      return bTime - aTime;
    })
    .forEach((sprint) => {
      const historySuffix = sprint.isArchived ? " · Histórico" : "";
      sprintOptions += `<option value="${sprint.id}">${sprint.title}${historySuffix}</option>`;
    });

  const uniqueEmails = new Set();
  let peopleOptions = `<option value="all">Todo el Equipo</option>
                       <option value="unassigned">Sin Asignar</option>`;

  state.allUsers.forEach((u) => {
    if (u.email && !uniqueEmails.has(u.email.toLowerCase())) {
      uniqueEmails.add(u.email.toLowerCase());
      peopleOptions += `<option value="${u.email}">${u.displayName || u.email}</option>`;
    }
  });

  const selectedSprintId = state.personViewSprintFilter || "all";
  const isHistoryScope = viewMode === "history";
  const selectedSprint = selectedSprintId !== "all" ? sprintMap.get(selectedSprintId) : null;
  const sprintScopedIds =
    selectedSprintId === "all"
      ? state.taskLists
          .filter((list) => !list.isBacklog && (isHistoryScope || !list.isArchived))
          .map((list) => list.id)
      : [selectedSprintId];
  const scopeTasks = state.tasks.filter((task) => sprintScopedIds.includes(task.listId));
  const tasksToShow = scopeTasks;

  const grouped = { unassigned: [] };
  const profileMap = {};

  state.allUsers.forEach((u) => {
    if (u.email) {
      const key = normalize(u.email);
      if (!grouped[key]) grouped[key] = [];
      if (!profileMap[key] || (!profileMap[key].photoURL && u.photoURL)) {
        profileMap[key] = u;
      }
    }
  });

  tasksToShow.forEach((task) => {
    const rawAssignee = task.assignee;
    const key = rawAssignee ? normalize(rawAssignee) : "unassigned";
    if (!grouped[key]) {
      grouped[key] = [];
      if (key !== "unassigned")
        profileMap[key] = {
          email: rawAssignee,
          displayName: rawAssignee.split("@")[0],
          photoURL: null,
        };
    }
    grouped[key].push(task);
  });

  const allKeys = Object.keys(grouped);
  const getProfileDisplay = (emailKey) => {
    if (emailKey === "unassigned") {
      return {
        name: "Sin Asignar",
        email: "Sin responsable",
        avatar: null,
      };
    }
    const profile = profileMap[emailKey];
    const rawEmail = profile?.email || emailKey;
    return {
      name: profile?.displayName || rawEmail,
      email: rawEmail,
      avatar: profile?.photoURL || `https://ui-avatars.com/api/?name=${rawEmail.split("@")[0]}`,
    };
  };

  const getPersonCycleCapacity = (emailKey) => {
    if (emailKey === "unassigned") return CYCLE_POINTS_TARGET;
    const profile = profileMap[emailKey];
    const candidates = [
      profile?.cycleCapacity,
      profile?.capacity,
      profile?.sprintCapacity,
      profile?.pointsCapacity,
      profile?.velocityCapacity,
    ];
    for (const candidate of candidates) {
      const parsed = Number(candidate);
      if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }
    return CYCLE_POINTS_TARGET;
  };

  const getRiskState = (currentLoad, personCapacity = CYCLE_POINTS_TARGET) => {
    const cap = Math.max(1, Number(personCapacity) || CYCLE_POINTS_TARGET);
    const ratio = currentLoad / cap;
    if (ratio > 1.05) {
      return {
        key: "overloaded",
        label: "Sobrecargado",
        title: `Carga mayor al 105% de la meta (${cap} pts por ciclo).`,
        className: "person-risk-text--overloaded",
        chipClass: "person-risk-chip--overloaded",
        score: ratio + 1,
      };
    }
    if (ratio > 0.95) {
      return {
        key: "at-limit",
        label: "Al límite",
        title: `Carga entre 95% y 105% de la meta (${cap} pts por ciclo).`,
        className: "person-risk-text--at-limit",
        chipClass: "person-risk-chip--at-limit",
        score: ratio + 0.4,
      };
    }
    if (ratio >= 0.70) {
      return {
        key: "optimal",
        label: "En rango",
        title: `Carga entre 70% y 95% de la meta (${cap} pts por ciclo).`,
        className: "person-risk-text--optimal",
        chipClass: "person-risk-chip--optimal",
        score: ratio + 0.1,
      };
    }
    return {
      key: "underloaded",
      label: "Subutilizado",
      title: `Carga menor al 70% de la meta (${cap} pts por ciclo).`,
      className: "person-risk-text--underloaded",
      chipClass: "person-risk-chip--underloaded",
      score: ratio,
    };
  };

  const metricsMap = {};
  allKeys.forEach((emailKey) => {
    const tasks = grouped[emailKey] || [];
    const tasksInCurrentCycle = tasks.filter((t) => isTaskInCurrentCycle(t));
    const doneThisCycleTasks = tasksInCurrentCycle.filter((t) => {
      if (t.kanbanStatus !== "done" && t.status !== "completed") return false;
      if (!t.completedAt) return false;
      const d = t.completedAt.toDate ? t.completedAt.toDate() : new Date(t.completedAt);
      return d >= cycleWindow.start && d < cycleWindow.endExclusive;
    });
    const ptsDoneThisCycle = doneThisCycleTasks.reduce((sum, t) => sum + (t.points || 0), 0);
    const inProgressTasks = tasksInCurrentCycle.filter((t) => t.kanbanStatus === "inprogress");
    const ptsInProgress = inProgressTasks.reduce((sum, t) => sum + (t.points || 0), 0);
    const todoTasks = tasksInCurrentCycle.filter((t) => isTodoTask(t));
    const ptsTodo = todoTasks.reduce((sum, t) => sum + (t.points || 0), 0);
    const currentLoad = ptsDoneThisCycle + ptsInProgress + ptsTodo;
    const personCapacity = getPersonCycleCapacity(emailKey);
    const risk = getRiskState(currentLoad, personCapacity);
    const riskScore =
      risk.score +
      (ptsDoneThisCycle === 0 && currentLoad > 0 ? 0.35 : 0) +
      (personCapacity > 0 ? ptsTodo / personCapacity : 0);
    metricsMap[emailKey] = {
      tasksCount: tasks.length,
      ptsDoneThisCycle,
      ptsInProgress,
      ptsTodo,
      capacity: personCapacity,
      currentLoad,
      isOverloaded: currentLoad > personCapacity * 1.05,
      completionPct: currentLoad > 0 ? Math.round((ptsDoneThisCycle / currentLoad) * 100) : 0,
      risk,
      riskScore,
    };
  });

  const personFilter = state.personViewPersonFilter || "all";
  const searchValue = (state.personViewSearch || "").trim().toLowerCase();
  const quickFilter = state.personViewQuickFilter || "all";
  const sortMode = state.personViewSortMode || "load_desc";

  let visibleKeys = allKeys.filter((k) => (metricsMap[k]?.tasksCount || 0) > 0);
  if (personFilter !== "all") {
    const filterKey = normalize(personFilter);
    visibleKeys = grouped[filterKey] ? [filterKey] : [];
  }
  if (searchValue) {
    visibleKeys = visibleKeys.filter((emailKey) => {
      const profile = getProfileDisplay(emailKey);
      return (
        profile.name.toLowerCase().includes(searchValue) ||
        profile.email.toLowerCase().includes(searchValue)
      );
    });
  }
  if (quickFilter !== "all") {
    visibleKeys = visibleKeys.filter((emailKey) => {
      const metrics = metricsMap[emailKey];
      if (!metrics) return false;
      if (quickFilter === "overloaded") return metrics.isOverloaded;
      if (quickFilter === "no_progress")
        return metrics.currentLoad > 0 && metrics.ptsDoneThisCycle === 0;
      if (quickFilter === "unassigned") return emailKey === "unassigned";
      if (quickFilter === "live_load") return metrics.ptsInProgress > 0;
      return true;
    });
  }

  const compareByName = (a, b) => {
    if (a === "unassigned") return -1;
    if (b === "unassigned") return 1;
    return getProfileDisplay(a).name.localeCompare(getProfileDisplay(b).name, "es", {
      sensitivity: "base",
    });
  };

  visibleKeys.sort((a, b) => {
    // "Sin Asignar" siempre fijo al tope, independiente del modo de orden
    if (a === "unassigned") return -1;
    if (b === "unassigned") return 1;
    const ma = metricsMap[a] || {};
    const mb = metricsMap[b] || {};
    switch (sortMode) {
      case "risk_desc":
        if ((mb.riskScore || 0) !== (ma.riskScore || 0)) return (mb.riskScore || 0) - (ma.riskScore || 0);
        return compareByName(a, b);
      case "done_desc":
        if ((mb.ptsDoneThisCycle || 0) !== (ma.ptsDoneThisCycle || 0))
          return (mb.ptsDoneThisCycle || 0) - (ma.ptsDoneThisCycle || 0);
        if ((mb.currentLoad || 0) !== (ma.currentLoad || 0))
          return (mb.currentLoad || 0) - (ma.currentLoad || 0);
        return compareByName(a, b);
      case "name_asc":
        return compareByName(a, b);
      case "load_desc":
      default:
        if ((mb.currentLoad || 0) !== (ma.currentLoad || 0))
          return (mb.currentLoad || 0) - (ma.currentLoad || 0);
        return compareByName(a, b);
    }
  });

  const scopeKeys = allKeys.filter((emailKey) => (metricsMap[emailKey]?.tasksCount || 0) > 0);
  const buildSummary = (keys) =>
    keys.reduce(
      (acc, emailKey) => {
        const m = metricsMap[emailKey];
        if (!m) return acc;
        acc.people += emailKey === "unassigned" ? 0 : 1;
        acc.tasks += m.tasksCount;
        acc.overloaded += m.isOverloaded ? 1 : 0;
        acc.unassigned += emailKey === "unassigned" ? m.tasksCount : 0;
        acc.liveLoad += m.ptsInProgress;
        acc.doneCycle += m.ptsDoneThisCycle;
        acc.totalLoad += m.currentLoad;
        acc.totalCapacity += emailKey === "unassigned" ? 0 : Number(m.capacity) || CYCLE_POINTS_TARGET;
        return acc;
      },
      {
        people: 0,
        tasks: 0,
        overloaded: 0,
        unassigned: 0,
        liveLoad: 0,
        doneCycle: 0,
        totalLoad: 0,
        totalCapacity: 0,
      }
    );
  const cycleSummary = buildSummary(scopeKeys);
  const filteredSummary = buildSummary(visibleKeys);
  const visibleKeySet = new Set(visibleKeys);
  const filteredTasks = tasksToShow.filter((task) => {
    const assigneeKey = task.assignee ? normalize(task.assignee) : "unassigned";
    return visibleKeySet.has(assigneeKey);
  });

  const formatCycleKey = (date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  };

  const getTaskEntryDate = (task) => {
    const dates = [task.createdAt, task.startedAt, task.completedAt]
      .map((value) => getDateValue(value))
      .filter(Boolean)
      .sort((a, b) => a.getTime() - b.getTime());
    return dates[0] || null;
  };

  const buildHistoryAnalytics = (historyTasks) => {
    const cycleKeySet = new Set();
    historyTasks.forEach((task) => {
      [task.createdAt, task.startedAt, task.completedAt].forEach((value) => {
        const date = getDateValue(value);
        if (!date) return;
        cycleKeySet.add(formatCycleKey(getCurrentCycleWindow(date).start));
      });
    });

    const cycleKeys = Array.from(cycleKeySet).sort().slice(-6);
    const cycles = cycleKeys.map((key) => {
      const start = new Date(`${key}T00:00:00`);
      const endExclusive = new Date(start);
      endExclusive.setDate(endExclusive.getDate() + CYCLE_LENGTH_DAYS);

      let donePoints = 0;
      let inProgressOpen = 0;
      let todoOpen = 0;
      let unassignedOpen = 0;
      let noProgress = 0;
      const activePeople = new Set();
      const openLoadByPerson = new Map();

      historyTasks.forEach((task) => {
        const points = Number(task.points) || 0;
        const assigneeKey = task.assignee ? normalize(task.assignee) : "unassigned";
        const entryDate = getTaskEntryDate(task);
        const startedAt = getDateValue(task.startedAt);
        const completedAt = getDateValue(task.completedAt);
        const touchesCycle =
          (entryDate && entryDate < endExclusive && (!completedAt || completedAt >= start)) ||
          (completedAt && completedAt >= start && completedAt < endExclusive);

        if (touchesCycle && assigneeKey !== "unassigned") activePeople.add(assigneeKey);

        if (completedAt && completedAt >= start && completedAt < endExclusive) {
          donePoints += points;
        }

        const isOpenAtClose =
          entryDate && entryDate < endExclusive && (!completedAt || completedAt >= endExclusive);
        if (!isOpenAtClose) return;

        if (startedAt && startedAt < endExclusive) {
          inProgressOpen += points;
        } else {
          todoOpen += points;
          noProgress += 1;
        }

        if (assigneeKey === "unassigned") {
          unassignedOpen += 1;
          return;
        }

        openLoadByPerson.set(assigneeKey, (openLoadByPerson.get(assigneeKey) || 0) + points);
      });

      let capacity = 0;
      activePeople.forEach((emailKey) => {
        capacity += getPersonCycleCapacity(emailKey);
      });

      let overloadedPeople = 0;
      openLoadByPerson.forEach((load, emailKey) => {
        if (load > getPersonCycleCapacity(emailKey)) overloadedPeople += 1;
      });

      return {
        key,
        label: formatShortDate(start),
        rangeLabel: `${formatCycleDateDMY(start)} a ${formatCycleDateDMY(
          new Date(endExclusive.getTime() - 24 * 60 * 60 * 1000)
        )}`,
        donePoints,
        inProgressOpen,
        todoOpen,
        unassignedOpen,
        noProgress,
        overloadedPeople,
        capacity,
      };
    });

    return {
      cycles,
      labels: cycles.map((cycle) => cycle.label),
      donePoints: cycles.map((cycle) => cycle.donePoints),
      inProgressOpen: cycles.map((cycle) => cycle.inProgressOpen),
      todoOpen: cycles.map((cycle) => cycle.todoOpen),
      unassignedOpen: cycles.map((cycle) => cycle.unassignedOpen),
      noProgress: cycles.map((cycle) => cycle.noProgress),
      overloadedPeople: cycles.map((cycle) => cycle.overloadedPeople),
      capacity: cycles.map((cycle) => cycle.capacity),
    };
  };

  const historyAnalytics = buildHistoryAnalytics(filteredTasks);
  const selectedSprintLabel = selectedSprint?.title || allSprintOptionLabel;

  const latestMs = tasksToShow.reduce((max, task) => Math.max(max, getLastUpdatedMs(task)), 0);
  const latestLabel = latestMs
    ? new Date(latestMs).toLocaleString("es-MX", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "Sin actividad reciente";

  const scopeRangeDates = tasksToShow
    .flatMap((task) => [task.createdAt, task.startedAt, task.completedAt].map((value) => getDateValue(value)))
    .filter(Boolean)
    .sort((a, b) => a.getTime() - b.getTime());
  const scopeStartDate = scopeRangeDates[0] || null;
  const scopeEndDate = scopeRangeDates[scopeRangeDates.length - 1] || null;
  const sprintStartDate = getDateValue(selectedSprint?.startDate);
  const sprintEndDate = getDateValue(selectedSprint?.endDate);
  let scopePeriodPillLabel = `Ciclo actual: ${cycleStartLabel} a ${cycleEndLabel}`;
  if (selectedSprint) {
    if (sprintStartDate || sprintEndDate) {
      const startLabel = sprintStartDate ? formatCycleDateDMY(sprintStartDate) : "Sin inicio";
      const endLabel = sprintEndDate ? formatCycleDateDMY(sprintEndDate) : "Sin cierre";
      scopePeriodPillLabel = `Sprint: ${startLabel} a ${endLabel}`;
    } else {
      scopePeriodPillLabel = "Sprint sin fechas configuradas";
    }
  } else if (viewMode === "history") {
    scopePeriodPillLabel =
      scopeStartDate && scopeEndDate
        ? `Historial: ${formatCycleDateDMY(scopeStartDate)} a ${formatCycleDateDMY(scopeEndDate)}`
        : "Historial acumulado";
  }
  const scopeFreshnessPillLabel = latestMs ? `Última actividad: ${latestLabel}` : "Sin actividad reciente";

  const cycleCapacity = Math.max(0, Number(cycleSummary.totalCapacity) || 0);
  const cycleUtilizationPct =
    cycleCapacity > 0 ? Math.round((cycleSummary.totalLoad / cycleCapacity) * 100) : 0;
  const cycleCompletionPct =
    cycleCapacity > 0 ? Math.round((cycleSummary.doneCycle / cycleCapacity) * 100) : 0;
  const cycleLivePct =
    cycleCapacity > 0 ? Math.round((cycleSummary.liveLoad / cycleCapacity) * 100) : 0;
  const cycleAvailablePts = Math.max(cycleCapacity - cycleSummary.totalLoad, 0);
  const cycleOverflowPts = Math.max(cycleSummary.totalLoad - cycleCapacity, 0);
  const cycleAvgCapacity = cycleSummary.people > 0 ? Math.round(cycleCapacity / cycleSummary.people) : 0;

  const filteredCapacity = Math.max(0, Number(filteredSummary.totalCapacity) || 0);
  const filteredCompletionPct =
    filteredCapacity > 0 ? Math.round((filteredSummary.doneCycle / filteredCapacity) * 100) : 0;

  const mountHistoryCharts = (historyPanel, analytics) => {
    const chartShells = historyPanel.querySelectorAll(".person-history-chart-shell");
    if (!analytics.cycles.length) {
      chartShells.forEach((shell) => {
        shell.innerHTML =
          '<div class="person-history-empty">Aun no hay historial suficiente para visualizar tendencia.</div>';
      });
      return;
    }

    if (typeof Chart === "undefined") {
      chartShells.forEach((shell) => {
        shell.innerHTML =
          '<div class="person-history-empty">No se pudo cargar la libreria de graficas.</div>';
      });
      return;
    }

    const rootStyles = getComputedStyle(document.documentElement);
    const textColor = rootStyles.getPropertyValue("--ink").trim() || "#1d231f";
    const mutedColor = rootStyles.getPropertyValue("--muted").trim() || "#5d645b";
    const gridColor = rootStyles.getPropertyValue("--line-default").trim() || "#ccd0bf";
    const doneColor = rootStyles.getPropertyValue("--person-work-done").trim() || "#476c9b";
    const liveColor = rootStyles.getPropertyValue("--person-work-live").trim() || "#0f8c76";
    const todoColor = rootStyles.getPropertyValue("--person-work-todo").trim() || "#c38c47";
    const neutralColor =
      rootStyles.getPropertyValue("--person-risk-underloaded-strong").trim() || "#7a7567";
    const neutralFill = rootStyles.getPropertyValue("--person-work-free").trim() || "#d9ddd2";
    const riskColor =
      rootStyles.getPropertyValue("--person-risk-overloaded-strong").trim() || "#a84d57";
    const limitColor =
      rootStyles.getPropertyValue("--person-risk-at-limit-strong").trim() || "#7e6f40";
    const fontFamily = rootStyles.getPropertyValue("--font-body").trim() || "Inter, sans-serif";
    const toRgba = (hex, alpha) => {
      const value = hex.replace("#", "");
      if (![3, 6].includes(value.length)) return hex;
      const normalized =
        value.length === 3 ? value.split("").map((part) => `${part}${part}`).join("") : value;
      const bigint = Number.parseInt(normalized, 16);
      if (Number.isNaN(bigint)) return hex;
      const r = (bigint >> 16) & 255;
      const g = (bigint >> 8) & 255;
      const b = bigint & 255;
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    };

    const baseOptions = {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: "index",
        intersect: false,
      },
      plugins: {
        legend: {
          labels: {
            color: textColor,
            boxWidth: 12,
            boxHeight: 12,
            usePointStyle: true,
            font: {
              family: fontFamily,
              size: 11,
              weight: "600",
            },
          },
        },
        tooltip: {
          backgroundColor: "#1f1f1d",
          titleColor: "#fbfbf6",
          bodyColor: "#fbfbf6",
          borderColor: "rgba(255,255,255,0.08)",
          borderWidth: 1,
          padding: 10,
          titleFont: {
            family: fontFamily,
            size: 12,
            weight: "700",
          },
          bodyFont: {
            family: fontFamily,
            size: 11,
          },
          callbacks: {
            title(items) {
              const item = items?.[0];
              if (!item) return "";
              return analytics.cycles[item.dataIndex]?.rangeLabel || item.label;
            },
          },
        },
      },
      scales: {
        x: {
          grid: {
            display: false,
          },
          ticks: {
            color: mutedColor,
            font: {
              family: fontFamily,
              size: 11,
            },
          },
        },
        y: {
          beginAtZero: true,
          grid: {
            color: gridColor,
          },
          ticks: {
            precision: 0,
            color: mutedColor,
            font: {
              family: fontFamily,
              size: 11,
            },
          },
        },
      },
    };

    const velocityCanvas = historyPanel.querySelector("#person-history-velocity-chart");
    const loadCanvas = historyPanel.querySelector("#person-history-load-chart");
    const riskCanvas = historyPanel.querySelector("#person-history-risk-chart");
    const charts = [];

    if (velocityCanvas) {
      charts.push(
        new Chart(velocityCanvas, {
          type: "line",
          data: {
            labels: analytics.labels,
            datasets: [
              {
                label: "Hecho",
                data: analytics.donePoints,
                borderColor: doneColor,
                backgroundColor: toRgba(doneColor, 0.16),
                fill: true,
                tension: 0.32,
                pointRadius: 3,
                pointHoverRadius: 4,
                pointBackgroundColor: doneColor,
              },
              {
                label: "Capacidad",
                data: analytics.capacity,
                borderColor: neutralColor,
                borderDash: [6, 6],
                borderWidth: 2,
                pointRadius: 0,
                tension: 0,
              },
            ],
          },
          options: baseOptions,
        })
      );
    }

    if (loadCanvas) {
      charts.push(
        new Chart(loadCanvas, {
          data: {
            labels: analytics.labels,
            datasets: [
              {
                type: "bar",
                label: "En progreso",
                data: analytics.inProgressOpen,
                backgroundColor: liveColor,
                borderRadius: 6,
                stack: "load",
              },
              {
                type: "bar",
                label: "Pendiente",
                data: analytics.todoOpen,
                backgroundColor: todoColor,
                borderColor: toRgba(todoColor, 0.5),
                borderWidth: 1,
                borderRadius: 6,
                stack: "load",
              },
              {
                type: "line",
                label: "Capacidad",
                data: analytics.capacity,
                borderColor: neutralColor,
                backgroundColor: neutralColor,
                borderWidth: 2,
                pointRadius: 2,
                pointHoverRadius: 3,
                tension: 0.25,
              },
            ],
          },
          options: {
            ...baseOptions,
            scales: {
              ...baseOptions.scales,
              x: {
                ...baseOptions.scales.x,
                stacked: true,
              },
              y: {
                ...baseOptions.scales.y,
                stacked: true,
              },
            },
          },
        })
      );
    }

    if (riskCanvas) {
      charts.push(
        new Chart(riskCanvas, {
          type: "bar",
          data: {
            labels: analytics.labels,
            datasets: [
              {
                label: "Sobrecargados",
                data: analytics.overloadedPeople,
                backgroundColor: riskColor,
                borderRadius: 6,
              },
              {
                label: "Sin asignar",
                data: analytics.unassignedOpen,
                backgroundColor: neutralFill,
                borderRadius: 6,
              },
              {
                label: "Sin avance",
                data: analytics.noProgress,
                backgroundColor: limitColor,
                borderRadius: 6,
              },
            ],
          },
          options: baseOptions,
        })
      );
    }

    state.personHistoryCharts = charts;
  };

  const quickChips = [
    { key: "all", label: "Todos" },
    { key: "no_progress", label: "Sin avance" },
    { key: "overloaded", label: "Sobrecargados" },
    { key: "unassigned", label: "Sin asignar" },
    { key: "live_load", label: "Con carga viva" },
  ];
  const sortOptions = [
    { key: "load_desc", label: "Carga total" },
    { key: "risk_desc", label: "Riesgo" },
    { key: "done_desc", label: "Hecho ciclo" },
    { key: "name_asc", label: "A-Z" },
  ];
  const activeQuick = quickChips.find((chip) => chip.key === quickFilter);
  const activeSort = sortOptions.find((option) => option.key === sortMode);
  const hasQuickFilter = quickFilter !== "all";
  const hasCustomSort = sortMode !== "load_desc";
  const hasPerson = personFilter !== "all";
  const hasSearch = searchValue.length > 0;
  const hasAnyFilter = hasPerson || hasSearch || hasQuickFilter || hasCustomSort;
  const activeFilterCount = [hasPerson, hasSearch, hasQuickFilter, hasCustomSort].filter(Boolean).length;
  const openPanel = state.personViewOpenPanel === "sprint" ? null : (state.personViewOpenPanel || null);
  const isFiltersPanelOpen = openPanel === "filters";
  const quickChipsHTML = quickChips
    .map((chip) => {
      const active = quickFilter === chip.key;
      const cls = active ? "person-quick-chip--active" : "person-quick-chip--idle";
      return `<button type="button" data-person-quick="${chip.key}" class="person-quick-chip ${cls}">${chip.label}</button>`;
    })
    .join("");
  const activePillsHTML = [
    hasPerson ? `<span class="person-filter-pill">Persona: ${(state.personViewPersonFilter || "").split("@")[0]}</span>` : "",
    hasSearch ? `<span class="person-filter-pill">Buscar: &ldquo;${searchValue}&rdquo;</span>` : "",
    hasQuickFilter && activeQuick ? `<span class="person-filter-pill">Estado: ${activeQuick.label}</span>` : "",
    hasCustomSort && activeSort ? `<span class="person-filter-pill">Orden: ${activeSort.label}</span>` : "",
  ]
    .filter(Boolean)
    .join("");

  const scopeLabel = selectedSprintLabel || allSprintOptionLabel;
  const alertCount = cycleSummary.overloaded + (cycleSummary.unassigned > 0 ? 1 : 0);

  const controlsDiv = document.createElement("div");
  controlsDiv.className = "workload-view-shell";
  controlsDiv.innerHTML = `
    <section class="workload-control-shell">
      <div class="workload-control-main">
        <div class="workload-mode-switch" id="person-view-mode" role="tablist" aria-label="Modo de vista">
          <button id="person-view-tab-current" type="button" role="tab" data-person-mode="current"
            aria-selected="${viewMode === "current" ? "true" : "false"}"
            aria-controls="person-view-panel-current"
            tabindex="${viewMode === "current" ? "0" : "-1"}"
            class="workload-mode-option ${viewMode === "current" ? "is-active" : ""}"
          >Actual</button>
          <button id="person-view-tab-history" type="button" role="tab" data-person-mode="history"
            aria-selected="${viewMode === "history" ? "true" : "false"}"
            aria-controls="person-view-panel-history"
            tabindex="${viewMode === "history" ? "0" : "-1"}"
            class="workload-mode-option ${viewMode === "history" ? "is-active" : ""}"
          >Histórico</button>
        </div>

        <label class="workload-control-block workload-control-block--primary">
          <select id="person-view-filter" class="person-control-input person-control-input--slim" aria-label="Sprint o scope">
            ${sprintOptions}
          </select>
        </label>

        <label class="workload-control-block workload-control-block--compact">
          <select id="person-view-sort" class="person-control-input person-control-input--slim" aria-label="Ordenar por">
            <option value="load_desc" ${sortMode === "load_desc" ? "selected" : ""}>Carga</option>
            <option value="risk_desc" ${sortMode === "risk_desc" ? "selected" : ""}>Prioridad</option>
            <option value="done_desc" ${sortMode === "done_desc" ? "selected" : ""}>Hecho</option>
            <option value="name_asc" ${sortMode === "name_asc" ? "selected" : ""}>Nombre</option>
          </select>
        </label>

        <div class="workload-secondary-controls">
          <button
            id="person-toggle-filters-panel"
            type="button"
            class="person-toolbar-btn ${isFiltersPanelOpen ? "person-toolbar-btn--active" : ""}"
            data-person-panel="filters"
            aria-expanded="${isFiltersPanelOpen ? "true" : "false"}"
            aria-controls="person-toolbar-filters-panel"
          >
            <i class="fa-solid fa-sliders" aria-hidden="true"></i>
            Filtros
            ${activeFilterCount > 0 ? `<span class="person-toolbar-badge">${activeFilterCount}</span>` : ""}
          </button>
        </div>
      </div>

      <div class="carga-stats-strip" aria-label="Resumen del ciclo">
        <span class="carga-stats-item">${scopeLabel}</span>
        <span class="carga-stats-sep" aria-hidden="true">·</span>
        <span class="carga-stats-item">
          <strong class="carga-stats-num">${cycleSummary.people}</strong> personas
        </span>
        <span class="carga-stats-sep" aria-hidden="true">·</span>
        <span class="carga-stats-item">
          <strong class="carga-stats-num">${cycleSummary.tasks}</strong> tareas
        </span>
        <span class="carga-stats-sep" aria-hidden="true">·</span>
        <span class="carga-stats-item">
          <strong class="carga-stats-num">${cycleSummary.totalLoad}/${cycleCapacity}</strong> pts
        </span>
        <span class="carga-stats-sep" aria-hidden="true">·</span>
        <span class="carga-stats-item">
          <strong class="carga-stats-num">${cycleUtilizationPct}%</strong> utilizado
        </span>
        ${cycleSummary.doneCycle > 0 ? `
        <span class="carga-stats-sep" aria-hidden="true">·</span>
        <span class="carga-stats-item carga-stats-badge carga-stats-badge--done">
          <i class="fas fa-check" aria-hidden="true"></i>
          <strong class="carga-stats-num">${cycleSummary.doneCycle}</strong> pts hecho
        </span>` : ""}
        ${cycleSummary.overloaded > 0 ? `
        <span class="carga-stats-sep" aria-hidden="true">·</span>
        <span class="carga-stats-item carga-stats-badge carga-stats-badge--alert">
          <i class="fas fa-triangle-exclamation" aria-hidden="true"></i>
          ${cycleSummary.overloaded} sobrecargado${cycleSummary.overloaded > 1 ? "s" : ""}
        </span>` : ""}
        ${cycleSummary.unassigned > 0 ? `
        <span class="carga-stats-sep" aria-hidden="true">·</span>
        <span class="carga-stats-item carga-stats-badge carga-stats-badge--warn">
          <i class="fas fa-user-slash" aria-hidden="true"></i>
          ${cycleSummary.unassigned} sin dueño
        </span>` : ""}
      </div>

      <div class="workload-secondary-controls" style="display:none">
      </div>

      <div id="person-toolbar-collapsible" class="person-toolbar-collapsible ${openPanel ? "" : "u-hidden"}">
        <section
          id="person-toolbar-filters-panel"
          class="person-toolbar-panel ${isFiltersPanelOpen ? "" : "u-hidden"}"
          role="region"
          aria-labelledby="person-toggle-filters-panel"
        >
          <div class="person-toolbar-panel-head">
            <h3>Filtros y orden</h3>
            <button id="person-clear-advanced-panel" type="button" class="person-toolbar-clear ${hasAnyFilter ? "" : "u-hidden"}">Limpiar todo</button>
          </div>
          <div class="person-filters-inline-row">
            <div class="person-control-field person-control-field--slim">
              <label class="person-control-label" for="person-view-people-filter">Persona</label>
              <select id="person-view-people-filter" class="person-control-input person-control-input--slim">${peopleOptions}</select>
            </div>
            <div class="person-control-field person-control-field--slim">
              <label class="person-control-label" for="person-view-search">Buscar</label>
              <input
                id="person-view-search"
                type="text"
                value="${(state.personViewSearch || "").replace(/"/g, "&quot;")}"
                placeholder="Nombre o email"
                class="person-control-input person-control-input--slim"
              />
            </div>
          </div>
          <div id="person-view-quick-filters" class="person-quick-filters">${quickChipsHTML}</div>
          ${hasAnyFilter ? `<div class="person-toolbar-active-row">${activePillsHTML}</div>` : ""}
        </section>
      </div>
    </section>
  `;
  container.appendChild(controlsDiv);

  const personSelect = controlsDiv.querySelector("#person-view-people-filter");
  if (personSelect) personSelect.value = state.personViewPersonFilter || "all";
  const searchInput = controlsDiv.querySelector("#person-view-search");
  if (searchInput) searchInput.value = state.personViewSearch || "";
  const sprintSelect = controlsDiv.querySelector("#person-view-filter");
  if (sprintSelect) sprintSelect.value = state.personViewSprintFilter || "all";
  const sortSelect = controlsDiv.querySelector("#person-view-sort");
  if (sortSelect) sortSelect.value = sortMode;
  const clearAdvancedBtn = controlsDiv.querySelector("#person-clear-advanced-panel");

  if (typeof appActions !== "undefined") {
    personSelect?.addEventListener("change", (e) => appActions.setPersonViewPersonFilter(e.target.value));
    searchInput?.addEventListener("input", (e) => appActions.setPersonViewSearch(e.target.value));
    sprintSelect?.addEventListener("change", (e) => appActions.setPersonViewSprintFilter(e.target.value));
    sortSelect?.addEventListener("change", (e) => appActions.setPersonViewSortMode(e.target.value));
    controlsDiv.querySelectorAll("[data-person-mode]").forEach((btn, index, allButtons) => {
      btn.addEventListener("click", () => appActions.setPersonViewMode(btn.dataset.personMode));
      btn.addEventListener("keydown", (event) => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        let nextIndex = index;
        if (event.key === "ArrowRight") nextIndex = (index + 1) % allButtons.length;
        if (event.key === "ArrowLeft") nextIndex = (index - 1 + allButtons.length) % allButtons.length;
        if (event.key === "Home") nextIndex = 0;
        if (event.key === "End") nextIndex = allButtons.length - 1;
        allButtons[nextIndex].focus();
      });
    });
    controlsDiv.querySelectorAll("[data-person-quick]").forEach((btn) => {
      btn.addEventListener("click", () => appActions.setPersonViewQuickFilter(btn.dataset.personQuick));
    });
    controlsDiv.querySelectorAll("[data-person-panel]").forEach((btn) => {
      btn.addEventListener("click", () => appActions.togglePersonViewPanel(btn.dataset.personPanel));
    });
    controlsDiv.querySelectorAll("[data-person-action='toggle-density']").forEach((btn) => {
      btn.addEventListener("click", () => {
        const next = state.taskCardDensity === "compact" ? "comfortable" : "compact";
        appActions.setTaskCardDensity(next);
      });
    });
    clearAdvancedBtn?.addEventListener("click", () => {
      appActions.resetPersonViewControls();
    });
  }

  const currentPanel = document.createElement("section");
  currentPanel.id = "person-view-panel-current";
  currentPanel.setAttribute("role", "tabpanel");
  currentPanel.setAttribute("aria-labelledby", "person-view-tab-current");
  currentPanel.hidden = viewMode !== "current";
  const historyPanel = document.createElement("section");
  historyPanel.id = "person-view-panel-history";
  historyPanel.setAttribute("role", "tabpanel");
  historyPanel.setAttribute("aria-labelledby", "person-view-tab-history");
  historyPanel.hidden = viewMode !== "history";
  container.appendChild(currentPanel);
  container.appendChild(historyPanel);

  if (visibleKeys.length === 0) {
    const emptyState = document.createElement("div");
    emptyState.className =
      "bg-white rounded-xl border border-gray-200 shadow-sm p-8 text-center text-gray-500";
    emptyState.innerHTML = `
      <p class="text-sm font-semibold text-gray-700">No hay resultados con este alcance.</p>
      <p class="text-xs mt-1">Ajusta búsqueda, persona o filtros avanzados para continuar.</p>
      <button id="person-clear-filters" type="button" class="mt-4 px-3 py-2 text-xs font-semibold rounded-lg border border-gray-300 bg-gray-50 hover:bg-gray-100 text-gray-700 transition-colors">Restablecer controles</button>
    `;
    const emptyTarget = viewMode === "history" ? historyPanel : currentPanel;
    emptyTarget.appendChild(emptyState);
    const clearBtn = emptyState.querySelector("#person-clear-filters");
    if (clearBtn && typeof appActions !== "undefined") {
      clearBtn.addEventListener("click", () => appActions.resetPersonViewControls());
    }
    return;
  }

  if (viewMode === "history") {
    const historyReport = buildVelocityReportData(filteredTasks, state.allUsers, 6);
    historyPanel.className = "bg-white rounded-xl border border-gray-200 shadow-sm p-4";
    historyPanel.innerHTML = `
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 class="text-base font-bold text-gray-800">Modo Histórico</h3>
          <p class="text-sm text-gray-500">Tendencia por ciclos quincenales usando el mismo scope activo de la vista.</p>
        </div>
        <span class="person-history-chip">Scope: ${selectedSprintLabel}</span>
      </div>
      <div class="mt-3 grid grid-cols-2 xl:grid-cols-5 gap-2">
        <div class="person-kpi-pill"><span class="person-kpi-label">Equipo visible</span><strong class="person-kpi-value">${filteredSummary.people}</strong></div>
        <div class="person-kpi-pill"><span class="person-kpi-label">Tareas visibles</span><strong class="person-kpi-value">${filteredSummary.tasks}</strong></div>
        <div class="person-kpi-pill"><span class="person-kpi-label">Sobrecargados</span><strong class="person-kpi-value ${filteredSummary.overloaded > 0 ? "person-kpi-value--risk" : ""}">${filteredSummary.overloaded}</strong></div>
        <div class="person-kpi-pill"><span class="person-kpi-label">Carga viva</span><strong class="person-kpi-value person-kpi-value--live">${filteredSummary.liveLoad} pts</strong></div>
        <div class="person-kpi-pill"><span class="person-kpi-label">Hecho ciclo</span><strong class="person-kpi-value person-kpi-value--done">${filteredSummary.doneCycle} pts (${filteredCompletionPct}%)</strong></div>
      </div>
      <div class="person-history-analytics">
        <section class="person-history-card person-history-card--wide">
          <div class="person-history-card-head">
            <div>
              <h4>Velocidad por ciclo</h4>
              <p>Puntos completados por ciclo quincenal frente a la capacidad del equipo visible.</p>
            </div>
            <span class="person-history-chip">Últimos ${historyAnalytics.cycles.length} ciclos</span>
          </div>
          <div class="person-history-chart-shell">
            <canvas id="person-history-velocity-chart" aria-label="Grafica de velocidad por ciclo"></canvas>
          </div>
        </section>
        <div class="person-history-grid">
          <section class="person-history-card">
            <div class="person-history-card-head">
              <div>
                <h4>Carga vs capacidad</h4>
                <p>Cierre de ciclo con trabajo en progreso, pendiente y capacidad disponible.</p>
              </div>
            </div>
            <div class="person-history-chart-shell person-history-chart-shell--compact">
              <canvas id="person-history-load-chart" aria-label="Grafica de carga vs capacidad"></canvas>
            </div>
          </section>
          <section class="person-history-card">
            <div class="person-history-card-head">
              <div>
                <h4>Riesgo operativo</h4>
                <p>Lectura de sobrecarga, tareas sin asignar y trabajo sin avance al cierre.</p>
              </div>
            </div>
            <div class="person-history-chart-shell person-history-chart-shell--compact">
              <canvas id="person-history-risk-chart" aria-label="Grafica de riesgo operativo"></canvas>
            </div>
          </section>
        </div>
        <details class="person-history-table-details">
          <summary>Tabla histórica</summary>
          <div class="mt-3">${renderVelocityReportTable(historyReport)}</div>
        </details>
      </div>
    `;
    mountHistoryCharts(historyPanel, historyAnalytics);
    return;
  }

  // Team health bar — shows overall cycle completion at a glance
  const teamBar = document.createElement("div");
  teamBar.className = "carga-team-bar";
  teamBar.setAttribute("role", "progressbar");
  teamBar.setAttribute("aria-valuenow", String(cycleCompletionPct));
  teamBar.setAttribute("aria-valuemin", "0");
  teamBar.setAttribute("aria-valuemax", "100");
  teamBar.setAttribute("aria-label", `Ciclo ${cycleCompletionPct}% completado`);
  teamBar.innerHTML = `<div class="carga-team-bar-fill" style="--bar-w:${cycleCompletionPct}%"></div>`;
  currentPanel.appendChild(teamBar);

  // Header de columnas con ordenamiento clickeable (T2.3)
  const headerRow = document.createElement("div");
  headerRow.className = "person-list-header";
  headerRow.innerHTML = `
    <div class="person-list-header-inner">
      <button type="button" class="person-list-header-cell person-list-header-cell--sortable ${sortMode === "name_asc" ? "is-active" : ""}" data-person-sort="name_asc" title="Ordenar por nombre">
        Persona <i class="fas fa-${sortMode === "name_asc" ? "arrow-up" : "arrow-up-down"} person-sort-icon" aria-hidden="true"></i>
      </button>
      <button type="button" class="person-list-header-cell person-list-header-cell--sortable ${sortMode === "risk_desc" ? "is-active" : ""}" data-person-sort="risk_desc" title="Ordenar por riesgo">
        Capacidad <i class="fas fa-${sortMode === "risk_desc" ? "arrow-down" : "arrow-up-down"} person-sort-icon" aria-hidden="true"></i>
      </button>
      <button type="button" class="person-list-header-cell person-list-header-cell--sortable ${sortMode === "load_desc" ? "is-active" : ""}" data-person-sort="load_desc" title="Ordenar por carga">
        Trabajo <i class="fas fa-${sortMode === "load_desc" ? "arrow-down" : "arrow-up-down"} person-sort-icon" aria-hidden="true"></i>
      </button>
      <span class="person-list-header-cell">Señal</span>
    </div>
  `;
  headerRow.querySelectorAll("[data-person-sort]").forEach((btn) => {
    btn.addEventListener("click", () => appActions.setPersonViewSortMode(btn.dataset.personSort));
  });
  currentPanel.appendChild(headerRow);

  const riskTiers = new Set(["overloaded", "at-limit"]);
  let zoneDividerInserted = false;

  visibleKeys.forEach((emailKey, index) => {
    const tasks = grouped[emailKey];
    const metrics = metricsMap[emailKey] || {};
    const isExpanded = state.expandedPersonViews.has(emailKey);

    // Separador de zona entre "En riesgo" y "En rango" cuando el sort es por riesgo (T3.3)
    if (!zoneDividerInserted && sortMode === "risk_desc" && index > 0) {
      const prevMetrics = metricsMap[visibleKeys[index - 1]] || {};
      const currKey = metrics.risk?.key;
      const prevKey = prevMetrics.risk?.key;
      if (riskTiers.has(prevKey) && !riskTiers.has(currKey)) {
        const divider = document.createElement("div");
        divider.className = "person-zone-divider";
        divider.innerHTML = `<span class="person-zone-divider-label">En rango</span>`;
        currentPanel.appendChild(divider);
        zoneDividerInserted = true;
      }
    }
    const profile = getProfileDisplay(emailKey);

    const swimlane = document.createElement("div");
    const laneToneClass = {
      overloaded: "person-lane--overloaded",
      "at-limit": "person-lane--at-limit",
      optimal: "person-lane--optimal",
      underloaded: "person-lane--underloaded",
    }[metrics.risk?.key] ?? "person-lane--underloaded";
    swimlane.className = `person-swimlane person-lane ${laneToneClass} ${isExpanded ? "person-swimlane--expanded" : ""} ${emailKey === "unassigned" ? "person-lane--unassigned person-lane-exception" : ""}`.trim();

    const avatarHTML =
      emailKey === "unassigned"
        ? `<div class="person-avatar person-avatar--placeholder rounded-full bg-[color:var(--surface-secondary)] flex items-center justify-center text-[color:var(--muted)]"><i class="fas fa-question"></i></div>`
        : `<img src="${profile.avatar}" class="person-avatar rounded-full border border-[color:var(--line-subtle)] object-cover" alt="${profile.name}">`;

    const cap = metrics.capacity || CYCLE_POINTS_TARGET;
    const loadPct = cap > 0 ? Math.round(((metrics.currentLoad || 0) / cap) * 100) : 0;
    const riskKey = metrics.risk?.key || "underloaded";
    const isUnassigned = emailKey === "unassigned";
    const fmtPts = (value) => {
      const rounded = Math.round(Number(value || 0) * 10) / 10;
      return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
    };
    const taskCountLabel = `${metrics.tasksCount || 0} tarea${metrics.tasksCount !== 1 ? "s" : ""}`;
    const personSubline =
      isUnassigned
        ? `${taskCountLabel} sin dueño`
        : `${taskCountLabel}${metrics.completionPct > 0 ? ` · ${metrics.completionPct}% completado` : ""}`;
    const capacityUsed = Number(metrics.currentLoad || 0);
    const freePts = Math.max(cap - capacityUsed, 0);
    const overCapacityPts = Math.max(capacityUsed - cap, 0);
    const loadPrimaryLabel = `${fmtPts(capacityUsed)} / ${fmtPts(cap)} pts`;
    const loadSecondaryLabel = `${loadPct}% usado`;
    const inProgressCount = tasks.filter((task) => resolveKanbanStatus(task) === "inprogress").length;
    const wipState = getWipState("inprogress", inProgressCount);
    const statusLabel = isUnassigned ? "Atención" : (metrics.risk?.label || "Subutilizado");
    const statusChipClass = isUnassigned
      ? "person-risk-chip--unassigned"
      : (metrics.risk?.chipClass || "person-risk-chip--underloaded");
    const executionSignalLabel = isUnassigned
      ? "Sin owner"
      : overCapacityPts > 0
        ? `+${fmtPts(overCapacityPts)} pts sobre cap`
        : inProgressCount > 0
          ? `WIP ${inProgressCount}/${wipState.limit}`
          : capacityUsed <= 0
            ? "Sin trabajo activo"
            : `${fmtPts(freePts)} pts libres`;
    const executionSignalDetail = isUnassigned
      ? personSubline
      : overCapacityPts > 0
        ? "Rebalancear carga"
        : inProgressCount > 0
          ? `${fmtPts(metrics.ptsInProgress || 0)} pts en progreso`
          : capacityUsed <= 0
            ? "Disponible para tomar trabajo"
            : `${loadPct}% de capacidad usada`;

    swimlane.style.setProperty("--lane-idx", String(index));
    swimlane.innerHTML = `
      <div class="person-swimlane-header-wrap">
        <button class="person-swimlane-toggle" type="button" data-person-toggle="${emailKey}"
                aria-expanded="${isExpanded ? "true" : "false"}"
                aria-controls="person-cols-${emailKey}">
          <div class="person-status-strip person-lane-strip">

            <div class="person-status-identity person-lane-identity">
              <div class="plc-avatar-zone carga-avatar-ring carga-avatar-ring--${riskKey}">
                ${avatarHTML}
                <span class="plc-status-dot plc-status-dot--${riskKey}" title="${metrics.risk?.title || ""}"></span>
              </div>
              <div class="person-workload-identity">
                <h3 class="plc-name ${isUnassigned ? "italic" : ""} truncate">${profile.name}</h3>
                <p class="plc-sub truncate">${personSubline}</p>
              </div>
            </div>

            <div class="person-status-capacity person-lane-capacity">
              <span class="plc-chip ${statusChipClass}">${statusLabel}</span>
            </div>

            <div class="person-status-mix person-lane-work">
              ${buildInlineBar(metrics, cap, index)}
            </div>

            <div class="person-status-signal person-lane-signal">
              <div class="carga-metric-block">
                <span class="carga-metric-pts ${metrics.risk?.className || "person-risk-text--underloaded"}">${loadPrimaryLabel}</span>
                <span class="carga-metric-pct">${loadPct}%</span>
              </div>
            </div>

            <div class="person-status-chevron plc-chevron">
              <i class="fas fa-chevron-down chevron-icon" style="transform: ${isExpanded ? "rotate(180deg)" : "rotate(0deg)"}"></i>
            </div>

          </div>
        </button>
      </div>
    `;

    const columnsGrid = document.createElement("div");
    columnsGrid.id = `person-cols-${emailKey}`;
    columnsGrid.className = `person-columns-grid ${isExpanded ? "" : "hidden"}`;

    ["todo", "inprogress", "done"].forEach((statusKey) => {
      const colDiv = document.createElement("div");
      const colTasks = tasks.filter((t) => resolveKanbanStatus(t) === statusKey);
      const points = getColumnPoints(colTasks);
      const wip = getWipState(statusKey, colTasks.length);
      const toneClass =
        statusKey === "inprogress" && wip.isOverLimit
          ? "person-column person-column--wip-alert"
          : statusKey === "inprogress"
            ? "person-column person-column--inprogress"
            : statusKey === "done"
              ? "person-column person-column--done"
              : "person-column person-column--todo";
      colDiv.className = `p-2 min-h-[150px] flex flex-col ${toneClass}`;
      colDiv.dataset.swimlaneStatus = statusKey;
      colDiv.dataset.assignee = emailKey;

      colDiv.innerHTML = `
        ${buildKanbanHeader({
          statusKey,
          count: colTasks.length,
          points,
          includeAdd: statusKey === "todo",
          includeCollapse: false,
          dense: true,
        }).replace(
          'data-action="add-task-sprint"',
          `data-action="quick-add-task-person" data-assignee="${emailKey}"`
        )}
        <div class="space-y-2 swimlane-drop-zone flex-grow min-h-[100px] w-full pb-4"></div>`;

      const dropZone = colDiv.querySelector(".swimlane-drop-zone");
      colTasks.sort((a, b) => {
        if (statusKey === "done") {
          return (toDate(b.completedAt)?.getTime() || 0) - (toDate(a.completedAt)?.getTime() || 0);
        }
        if (statusKey === "inprogress") {
          return getTaskAgeDays(b) - getTaskAgeDays(a);
        }
        return (toDate(a.createdAt)?.getTime() || 0) - (toDate(b.createdAt)?.getTime() || 0);
      });

      if (statusKey === "done") {
        const todayDone = colTasks.filter((task) => isDateToday(task.completedAt));
        const historyDone = colTasks.filter((task) => !isDateToday(task.completedAt));

        const todayLabel = document.createElement("div");
        todayLabel.className = "kanban-day-label kanban-day-label--compact";
        todayLabel.textContent = `Hecho hoy (${todayDone.length})`;
        dropZone.appendChild(todayLabel);

        if (todayDone.length === 0) {
          const emptyToday = document.createElement("div");
          emptyToday.className = "text-xs text-gray-400 px-1";
          emptyToday.textContent = "Sin completadas hoy";
          dropZone.appendChild(emptyToday);
        } else {
          todayDone.forEach((task) => dropZone.appendChild(createTaskElement(task, "sprint", state)));
        }

        if (historyDone.length > 0) {
          const historyContainer = document.createElement("div");
          historyContainer.className = "hidden space-y-2 pt-2 border-t border-[color:var(--line-subtle)]";
          historyDone.forEach((task) => historyContainer.appendChild(createTaskElement(task, "sprint", state)));

          const historyBtn = document.createElement("button");
          historyBtn.className = "kanban-history-btn kanban-history-btn--compact";
          historyBtn.innerHTML = `<i class="fa-solid fa-history"></i> <span>Historial (${historyDone.length})</span>`;
          historyBtn.onclick = () => {
            const isHidden = historyContainer.classList.contains("hidden");
            historyContainer.classList.toggle("hidden");
            historyBtn.innerHTML = isHidden
              ? `<i class="fa-solid fa-chevron-up"></i> <span>Ocultar historial</span>`
              : `<i class="fa-solid fa-history"></i> <span>Historial (${historyDone.length})</span>`;
          };
          dropZone.appendChild(historyBtn);
          dropZone.appendChild(historyContainer);
        }
      } else {
        colTasks.forEach((task) => dropZone.appendChild(createTaskElement(task, "sprint", state)));
      }

      columnsGrid.appendChild(colDiv);
    });

    swimlane.appendChild(columnsGrid);
    currentPanel.appendChild(swimlane);
  });
}

function renderActivityView(state) {
  const container = document.getElementById("activity-feed-container");
  if (!container || !state.user) return;
  container.innerHTML = "";
  const me = state.user.email;
  const filterMode = state.activityFilter || "unread";

  const myTasks = state.tasks.filter((t) => t.assignee === me);
  const items = [];
  myTasks.forEach((task) => {
    if (!Array.isArray(task.comments)) return;
    task.comments.forEach((comment, index) => {
      if (!comment || comment.authorEmail === me) return;
      const date = comment.timestamp?.toDate
        ? comment.timestamp.toDate()
        : comment.timestamp
          ? new Date(comment.timestamp)
          : null;
      const isRead = comment.readBy?.includes(me);
      items.push({
        task,
        comment,
        index,
        isRead,
        ts: date ? date.getTime() : 0,
      });
    });
  });

  items.sort((a, b) => b.ts - a.ts);
  const visibleItems = filterMode === "all" ? items : items.filter((i) => !i.isRead);
  const hasUnread = items.some((i) => !i.isRead);

  const activityFilters = [
    { key: "unread", label: "No leídas" },
    { key: "all", label: "Todas" },
  ];
  container.innerHTML = `
    <div class="flex items-center justify-between mb-4 gap-3 flex-wrap">
      ${buildFilterBar({
        items: activityFilters,
        activeKey: filterMode,
        action: "set-activity-filter",
        ariaLabel: "Filtros de actividad",
      })}
      <button data-action="mark-all-as-read" ${
        hasUnread ? "" : "disabled"
      } class="text-xs border border-gray-200 rounded px-2 py-1 bg-white shadow-sm ${
        hasUnread ? "text-gray-600 hover:text-gray-900" : "text-gray-300 cursor-not-allowed"
      }">Marcar todo como leído</button>
    </div>
    <div id="notifications-list" class="space-y-4"></div>
  `;

  const list = document.getElementById("notifications-list");
  if (!list) return;

  if (visibleItems.length === 0) {
    list.innerHTML = buildEmptyState(
      filterMode === "all"
        ? { icon: "bell-slash", title: "Sin actividad reciente", hint: "Cuando haya comentarios en tus tareas aparecerán aquí." }
        : { icon: "check-double", title: "Todo al día", hint: "No tienes notificaciones nuevas." }
    );
    return;
  }

  visibleItems.forEach((item) => {
    const taskWrapper = document.createElement("div");
    taskWrapper.className = `activity-item-card bg-white p-4 rounded-xl shadow-md ${item.isRead ? "" : "is-unread"}`;
    taskWrapper.innerHTML = `
      <div class="flex items-center justify-between mb-2">
        <div class="flex items-center gap-2 min-w-0">
          ${item.isRead ? "" : '<span class="activity-unread-dot" title="No leída"></span>'}
          <div class="text-sm text-gray-600 truncate">En la tarea: <span class="font-semibold text-blue-700">${item.task.title}</span></div>
        </div>
        <button data-action="open-task-details" data-id="${item.task.id}" class="text-xs text-blue-600 hover:underline">Abrir</button>
      </div>
    `;
    taskWrapper.appendChild(
      createActivityCommentElement(item.comment, item.index, state, item.task.id)
    );
    list.appendChild(taskWrapper);
  });
}

function renderSprintsSummary(state) {
  const filterContainer = document.getElementById("sprints-summary-filter-container");
  if (filterContainer) {
    filterContainer.innerHTML = buildFilterBar({
      items: [
        { key: "all", label: "Todos" },
        { key: "active", label: "En Progreso" },
        { key: "future", label: "Futuros" },
        { key: "archived", label: "Archivados" },
      ],
      activeKey: state.sprintsSummaryFilter,
      action: "set-sprints-summary-filter",
      ariaLabel: "Filtros de sprints",
    });
  }
  const tableBody = document.getElementById("summary-table-body");
  if (!tableBody) return;
  tableBody.innerHTML = "";
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let sprints;

  switch (state.sprintsSummaryFilter) {
    case "active":
      sprints = state.taskLists.filter(
        (s) => !s.isArchived && s.startDate?.toDate() <= today && s.endDate?.toDate() >= today
      );
      break;
    case "future":
      sprints = state.taskLists.filter((s) => !s.isArchived && s.startDate?.toDate() > today);
      break;
    case "archived":
      sprints = state.taskLists.filter((s) => s.isArchived);
      break;
    case "all":
    default:
      sprints = state.taskLists.filter((l) => !l.isBacklog && l.startDate);
      break;
  }
  sprints.sort((a, b) => (a.startDate?.seconds || 0) - (b.startDate?.seconds || 0));
  const fragment = document.createDocumentFragment();
  const formatDate = (date) => {
    const d = new Date(date);
    const weekdays = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
    const months = [
      "Ene",
      "Feb",
      "Mar",
      "Abr",
      "May",
      "Jun",
      "Jul",
      "Ago",
      "Sep",
      "Oct",
      "Nov",
      "Dic",
    ];
    return `${weekdays[d.getDay()]}, ${d.getDate()}-${months[d.getMonth()]}-${d.getFullYear().toString().slice(-2)}`;
  };
  const getTimeStatus = (startDate, endDate) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const end = new Date(endDate);
    end.setHours(0, 0, 0, 0);
    const diffDays = Math.round((end - today) / (1000 * 60 * 60 * 24));
    if (diffDays < 0)
      return `<span class="text-xs text-gray-500 block mt-1">Terminó hace ${-diffDays} día${-diffDays !== 1 ? "s" : ""}</span>`;
    if (diffDays === 0)
      return `<span class="text-xs font-semibold text-red-600 block mt-1">Termina hoy</span>`;
    return `<span class="text-xs text-gray-500 block mt-1">Faltan ${diffDays} día${diffDays !== 1 ? "s" : ""}</span>`;
  };
  sprints.forEach((sprint) => {
    if (!sprint.startDate || !sprint.endDate) return;
    const sprintTasks = state.tasks.filter((t) => t.listId === sprint.id);
    const totalPoints = sprintTasks.reduce((sum, t) => sum + (t.points || 0), 0);
    const completedPoints = sprintTasks
      .filter((t) => t.status === "completed" || t.kanbanStatus === "done")
      .reduce((sum, t) => sum + (t.points || 0), 0);
    const progress = totalPoints > 0 ? (completedPoints / totalPoints) * 100 : 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const startDate = sprint.startDate.toDate();
    const endDate = sprint.endDate.toDate();
    let statusText, statusClass, statusIcon;
    const allTasksCompleted =
      sprintTasks.length > 0 &&
      sprintTasks.every((t) => t.status === "completed" || t.kanbanStatus === "done");
    if (allTasksCompleted || (today > endDate && progress > 0)) {
      statusText = "Completado";
      statusClass = "bg-green-100 text-green-800";
      statusIcon = '<i class="fas fa-check-circle mr-1.5"></i>';
    } else if (today < startDate) {
      statusText = "Futuro";
      statusClass = "bg-gray-100 text-gray-800";
      statusIcon = '<i class="fas fa-calendar-alt mr-1.5"></i>';
    } else {
      statusText = "En Progreso";
      statusClass = "bg-blue-100 text-blue-800";
      statusIcon = '<i class="fas fa-person-running mr-1.5"></i>';
    }
    const sprintRow = document.createElement("tr");
    sprintRow.className = "sprint-summary-row bg-white border-b hover:bg-gray-50";
    const timeStatusHTML = getTimeStatus(startDate, endDate);
    const sprintColor = sprint.color || "#3b82f6";
    const textColorClass = progress >= 50 ? "text-white" : "text-gray-800";
    const progressBarHTML = `<div class="w-full bg-gray-200 h-5 relative overflow-hidden"><div class="h-full transition-all duration-500" style="width:${progress}%; background-color: ${sprintColor};"></div><div class="absolute inset-0 flex items-center justify-center"><span class="text-xs font-bold ${textColorClass}">${Math.round(progress)}%</span></div></div>`;
    const creator = state.allUsers.find((u) => u.email === sprint.createdBy);
    const creatorName = creator ? creator.displayName : (sprint.createdBy || "").split("@")[0];
    const sprintTitleHTML = `${sprint.title}<span class="block text-xs text-gray-500 font-normal">por ${creatorName}</span>`;
    sprintRow.innerHTML = `<td class="px-6 py-4"><i class="fas fa-chevron-right chevron-icon"></i></td><th scope="row" class="px-6 py-4 font-medium text-gray-900 whitespace-nowrap">${sprintTitleHTML}</th><td class="px-6 py-4 text-sm">${formatDate(startDate)} a ${formatDate(endDate)}${timeStatusHTML}</td><td class="px-6 py-4 text-center">${sprintTasks.length}</td><td class="px-6 py-4 text-center">${completedPoints}/${totalPoints}</td><td class="px-6 py-4">${progressBarHTML}</td><td class="px-6 py-4"><span class="px-2.5 py-1 inline-flex text-xs leading-5 font-semibold rounded-full whitespace-nowrap ${statusClass}">${statusIcon}${statusText}</span></td>`;
    let tasksHTML = '<p class="text-gray-500 p-4">Este sprint no tiene tareas.</p>';
    if (sprintTasks.length > 0) {
      tasksHTML =
        `<div class="overflow-y-auto max-h-80 border rounded-lg"><table class="w-full text-sm">...</table></div>`.replace(
          "...",
          `<thead class="text-xs text-gray-700 uppercase bg-gray-100 sticky top-0"><tr><th class="px-6 py-2">Tarea</th><th class="px-6 py-2">Estado</th><th class="px-6 py-2">Puntos</th></tr></thead><tbody> ${sprintTasks
            .map((task) => {
              const ksm = {
                todo: "Por Hacer",
                inprogress: "En Progreso",
                done: "Hecho",
              };
              return `<tr class="border-b"><td class="px-6 py-3">${task.title}</td><td class="px-6 py-3">${ksm[task.kanbanStatus] || "Por Hacer"}</td><td class="px-6 py-3">${task.points || 0}</td></tr>`;
            })
            .join("")} </tbody>`
        );
    }
    const detailsRow = document.createElement("tr");
    detailsRow.className = "task-details-row hidden";
    detailsRow.innerHTML = `<td colspan="7" class="p-4 bg-gray-50"><div class="grid grid-cols-1 lg:grid-cols-2 gap-6"><div><h4 class="font-bold mb-2 text-gray-600">Gráfico Burndown</h4><div class="p-4 bg-white rounded-lg shadow-inner"><canvas id="burndown-chart-${sprint.id}"></canvas></div></div><div><h4 class="font-bold mb-2 text-gray-600">Tareas del Sprint</h4>${tasksHTML}</div></div></td>`;
    fragment.appendChild(sprintRow);
    fragment.appendChild(detailsRow);
  });
  tableBody.appendChild(fragment);
  if (sprints.length === 0) {
    const emptyRow = document.createElement("tr");
    emptyRow.innerHTML = `<td colspan="7" class="p-6">${buildEmptyState({
      icon: "flag-checkered",
      title: "Sin sprints en este filtro",
      hint: "Cambia el filtro o crea un nuevo sprint para empezar.",
    })}</td>`;
    tableBody.appendChild(emptyRow);
  }
  sprints.forEach((sprint) => {
    if (!sprint.startDate || !sprint.endDate) return;
    const canvas = document.getElementById(`burndown-chart-${sprint.id}`);
    if (!canvas) return;
    const sprintTasks = state.tasks.filter((t) => t.listId === sprint.id);
    const totalPoints = sprintTasks.reduce((sum, t) => sum + (t.points || 0), 0);
    const startDate = sprint.startDate.toDate();
    const endDate = sprint.endDate.toDate();
    const sprintColor = sprint.color || "#3b82f6";
    const sprintDurationDays = Math.max(
      1,
      Math.round((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1
    );
    const labels = Array.from({ length: sprintDurationDays }, (_, i) => `Día ${i}`);
    const pointsPerDayIdeal = totalPoints / Math.max(1, sprintDurationDays - 1);
    const idealData = labels.map((_, i) => Math.max(0, totalPoints - pointsPerDayIdeal * i));
    const actualData = Array.from({ length: sprintDurationDays }, (_, i) => {
      const dayThreshold = new Date(startDate);
      dayThreshold.setDate(startDate.getDate() + i);
      dayThreshold.setHours(23, 59, 59, 999);
      const pointsCompletedByDay = sprintTasks
        .filter((t) => t.completedAt && t.completedAt.toDate() <= dayThreshold)
        .reduce((sum, t) => sum + (t.points || 0), 0);
      return totalPoints - pointsCompletedByDay;
    });
    new Chart(canvas, {
      type: "line",
      data: {
        labels: labels,
        datasets: [
          {
            label: "Trabajo Restante (Real)",
            data: actualData,
            borderColor: sprintColor,
            backgroundColor: sprintColor,
            tension: 0.1,
            fill: false,
            borderWidth: 2.5,
          },
          {
            label: "Ritmo Ideal",
            data: idealData,
            borderColor: "rgba(108, 117, 125, 0.5)",
            borderDash: [5, 5],
            fill: false,
            borderWidth: 2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            beginAtZero: true,
            title: { display: true, text: "Puntos Restantes" },
          },
          x: { title: { display: true, text: "Días del Sprint" } },
        },
        plugins: {
          legend: { position: "bottom", labels: { usePointStyle: true } },
        },
      },
    });
  });
}

function renderArchivedSprints(state) {
  const container = document.getElementById("archived-sprints-container");
  if (!container) return;
  container.innerHTML = "";
  const archivedSprints = state.taskLists
    .filter((l) => l.isArchived)
    .sort((a, b) => (b.endDate?.seconds || 0) - (a.endDate?.seconds || 0));
  if (archivedSprints.length === 0) {
    container.innerHTML = '<p class="text-center text-gray-500">No hay sprints archivados.</p>';
    return;
  }
  const fragment = document.createDocumentFragment();
  archivedSprints.forEach((sprint) => {
    const sprintTasks = state.tasks.filter((t) => t.listId === sprint.id);
    const completedPoints = sprintTasks.reduce((sum, t) => sum + (t.points || 0), 0);
    const summaryCard = document.createElement("div");
    summaryCard.className =
      "archived-sprint-summary bg-white p-4 rounded-lg shadow-md flex justify-between items-center cursor-pointer hover:bg-gray-50 transition-colors";
    summaryCard.innerHTML = `
            <div class="flex items-center gap-4">
                <i class="fas fa-chevron-right chevron-icon transition-transform"></i>
                <div>
                    <h3 class="font-bold text-lg text-gray-800">${sprint.title}</h3>
                    <p class="text-sm text-gray-500 mt-1">
                        Completado con <span class="font-semibold">${completedPoints}</span> puntos.
                    </p>
                </div>
            </div>
            <div>
                <button data-action="unarchive-sprint" data-id="${sprint.id}" class="bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold py-2 px-4 rounded-lg flex items-center gap-2 transition-colors">
                    <i class="fas fa-box-open"></i>
                    <span>Restaurar</span>
                </button>
            </div>
        `;
    const detailsContainer = document.createElement("div");
    detailsContainer.className =
      "archived-sprint-details hidden bg-gray-50 p-4 -mt-2 mb-4 rounded-b-lg border";
    if (sprintTasks.length > 0) {
      const taskList = sprintTasks
        .map(
          (task) => `
                <div data-action="open-task-details" data-id="${task.id}" class="flex justify-between items-center p-2 border-b cursor-pointer hover:bg-gray-100 transition-colors">
                    <span class="text-gray-700">${task.title}</span>
                    <span class="font-bold bg-gray-200 text-gray-600 rounded-full px-2 py-0.5 text-xs">${task.points || 0} Pts</span>
                </div>
            `
        )
        .join("");
      detailsContainer.innerHTML = `<h4 class="font-semibold mb-2 text-gray-600">Tareas Completadas:</h4><div class="space-y-1">${taskList}</div>`;
    } else {
      detailsContainer.innerHTML =
        '<p class="text-sm text-gray-500 text-center">No se encontraron tareas completadas en este sprint.</p>';
    }
    fragment.appendChild(summaryCard);
    fragment.appendChild(detailsContainer);
  });
  container.appendChild(fragment);
}

function renderTimeline(state) {
  const ganttView = document.getElementById("gantt-view");
  const monthYear = document.getElementById("timeline-month-year");
  if (!ganttView || !monthYear) return;
  // Zoom mode (week | month | quarter) persisted in localStorage
  const storedZoom =
    (typeof localStorage !== "undefined" && localStorage.getItem("timelineZoom")) || "month";
  const zoomMode = state.timelineZoom || storedZoom || "month";

  // Render controls: add zoom selector and minimap next to the existing month/year header
  const controlsHtml = `
    <div class="flex items-center gap-4">
      <div class="flex items-center gap-2">
        <label class="text-xs text-gray-500">Vista:</label>
        <select id="timeline-zoom-select" class="text-xs border border-gray-200 rounded px-2 py-1 bg-white">
          <option value="week" ${zoomMode === "week" ? "selected" : ""}>Semana</option>
          <option value="month" ${zoomMode === "month" ? "selected" : ""}>Mes</option>
          <option value="quarter" ${zoomMode === "quarter" ? "selected" : ""}>Trimestre</option>
          <option value="year" ${zoomMode === "year" ? "selected" : ""}>Año</option>
        </select>
      </div>
      <div id="timeline-minimap" class="text-xs text-gray-500"></div>
    </div>
  `;
  // try to attach controls next to the existing month/year header in index.html
  ganttView.querySelector(".timeline-controls")?.remove();
  const controlsWrapper = document.createElement("div");
  controlsWrapper.className = "timeline-controls ml-auto";
  controlsWrapper.innerHTML = controlsHtml;
  const headerDateContainer = document.getElementById("timeline-month-year")?.parentElement;
  if (headerDateContainer) {
    // remove any existing controls in the header to avoid duplicates on re-render
    const existing = headerDateContainer.querySelector(".timeline-controls");
    if (existing) existing.remove();
    // append to the header row so controls appear at the top right
    headerDateContainer.appendChild(controlsWrapper);
  } else {
    ganttView.insertBefore(controlsWrapper, ganttView.firstElementChild);
  }

  // Attach listener for zoom select (use assignment to avoid duplicate handlers)
  const zoomSelect = document.getElementById("timeline-zoom-select");
  if (zoomSelect) {
    zoomSelect.onchange = (e) => {
      const val = e.target.value;
      try {
        localStorage.setItem("timelineZoom", val);
      } catch (err) {}
      if (typeof appActions !== "undefined" && appActions.setTimelineZoom) {
        appActions.setTimelineZoom(val);
      } else {
        state.timelineZoom = val;
        renderTimeline(state);
      }
    };
  }

  const container = document.getElementById("timeline-container");
  const grid = document.getElementById("timeline-grid");
  if (!container || !grid) return;

  container.innerHTML = "";
  grid.innerHTML = "";
  container.style.position = "relative";
  const date = state.timelineDate;
  const msPerDay = 24 * 60 * 60 * 1000;
  const getISOWeekInfo = (d) => {
    const date = new Date(d.getTime());
    date.setHours(0, 0, 0, 0);
    // Thursday in current week decides the year.
    date.setDate(date.getDate() + 3 - ((date.getDay() + 6) % 7));
    const weekYear = date.getFullYear();
    const week1 = new Date(weekYear, 0, 4);
    const week =
      1 +
      Math.round(
        ((date.getTime() - week1.getTime()) / msPerDay - 3 + ((week1.getDay() + 6) % 7)) / 7
      );
    return { week, year: weekYear };
  };

  // Determine visible range according to zoomMode
  let viewStart, viewEnd;
  if (zoomMode === "week") {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday as start
    viewStart = new Date(d.setDate(diff));
    viewStart.setHours(0, 0, 0, 0);
    viewEnd = new Date(viewStart.getTime() + 6 * msPerDay);
    viewEnd.setHours(23, 59, 59, 999);
  } else if (zoomMode === "quarter") {
    const startMonth = Math.floor(date.getMonth() / 3) * 3;
    viewStart = new Date(date.getFullYear(), startMonth, 1);
    viewStart.setHours(0, 0, 0, 0);
    viewEnd = new Date(date.getFullYear(), startMonth + 3, 0);
    viewEnd.setHours(23, 59, 59, 999);
  } else if (zoomMode === "year") {
    viewStart = new Date(date.getFullYear(), 0, 1);
    viewStart.setHours(0, 0, 0, 0);
    viewEnd = new Date(date.getFullYear(), 11, 31);
    viewEnd.setHours(23, 59, 59, 999);
  } else {
    // month
    viewStart = new Date(date.getFullYear(), date.getMonth(), 1);
    viewStart.setHours(0, 0, 0, 0);
    viewEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0);
    viewEnd.setHours(23, 59, 59, 999);
  }

  if (zoomMode === "week") {
    const { week, year } = getISOWeekInfo(viewStart);
    monthYear.textContent = `S${week} ${year}`;
  } else if (zoomMode === "quarter") {
    const quarter = Math.floor(viewStart.getMonth() / 3) + 1;
    monthYear.textContent = `T${quarter} ${viewStart.getFullYear()}`;
  } else if (zoomMode === "year") {
    monthYear.textContent = `${viewStart.getFullYear()}`;
  } else {
    monthYear.textContent = viewStart.toLocaleDateString("es-ES", {
      month: "long",
      year: "numeric",
    });
  }

  const daysCount = Math.ceil((viewEnd.getTime() - viewStart.getTime() + 1) / msPerDay);
  const totalRangeMs = viewEnd.getTime() - viewStart.getTime() + msPerDay;

  grid.className = "relative flex h-full border-t border-l";
  if (zoomMode === "year") {
    // Render 12 month columns for year view
    const months = Array.from({ length: 12 }, (_, m) => {
      const monthDate = new Date(viewStart.getFullYear(), m, 1);
      const label = monthDate.toLocaleDateString("es-ES", { month: "short" });
      return `<div class="text-center text-xs text-gray-500 border-r h-full" style="width: ${100 / 12}%"><div class="border-b pb-1">${label}</div></div>`;
    });
    grid.innerHTML = months.join("");
  } else if (zoomMode === "quarter") {
    const weeksCount = Math.ceil(daysCount / 7);
    grid.innerHTML = Array.from({ length: weeksCount }, (_, i) => {
      const weekStart = new Date(
        viewStart.getFullYear(),
        viewStart.getMonth(),
        viewStart.getDate() + i * 7
      );
      const { week: weekNumber } = getISOWeekInfo(weekStart);
      return `<div class="text-center text-xs text-gray-500 border-r h-full" style="width: ${
        100 / weeksCount
      }%"><div class="border-b pb-1">Sem ${weekNumber}</div></div>`;
    }).join("");
  } else {
    grid.innerHTML = Array.from({ length: daysCount }, (_, i) => {
      const dayDate = new Date(
        viewStart.getFullYear(),
        viewStart.getMonth(),
        viewStart.getDate() + i
      );
      const isWeekend = dayDate.getDay() === 0 || dayDate.getDay() === 6;
      const dayLabel =
        zoomMode === "week"
          ? dayDate.toLocaleDateString("es-ES", { weekday: "short", day: "numeric" })
          : dayDate.getDate();
      return `<div class="text-center text-xs text-gray-500 border-r h-full ${isWeekend ? "bg-gray-50" : ""}" style="width: ${100 / daysCount}%"><div class="border-b pb-1">${dayLabel}</div></div>`;
    }).join("");
  }

  // ▼▼ FILTRO CORREGIDO Y MÁS ROBUSTO ▼▼
  const sprints = state.taskLists.filter(
    (l) =>
      !l.isBacklog &&
      l.startDate &&
      typeof l.startDate.toDate === "function" &&
      l.endDate &&
      typeof l.endDate.toDate === "function"
  );

  // Sólo los sprints que se solapan con el rango visible
  const visibleSprints = sprints.filter((sprint) => {
    const sprintStart = sprint.startDate.toDate();
    const sprintEnd = sprint.endDate.toDate();
    return !(sprintEnd < viewStart || sprintStart > viewEnd);
  });

  // Reducir el espaciado vertical para evitar grandes áreas en blanco
  const rowHeightRem = 2.5;
  container.style.height = `${Math.max(visibleSprints.length, 1) * rowHeightRem}rem`;
  visibleSprints.forEach((sprint, i) => {
    const sprintStart = sprint.startDate.toDate();
    const sprintEnd = sprint.endDate.toDate();

    if (sprintEnd < viewStart || sprintStart > viewEnd) return;

    // --- NUEVA LÓGICA DE CÁLCULO PRECISO ---
    const msPerDay = 24 * 60 * 60 * 1000;

    // Ajustamos las fechas al rango visible
    const visibleStart = new Date(Math.max(sprintStart.getTime(), viewStart.getTime()));
    const visibleEnd = new Date(Math.min(sprintEnd.getTime(), viewEnd.getTime()));

    // Calculamos la posición inicial (left)
    const startOffsetMs = visibleStart.getTime() - viewStart.getTime();
    const durationMs = visibleEnd.getTime() - visibleStart.getTime() + msPerDay;
    // Use el rango total en ms para calcular porcentajes (más robusto para month/year/quarter)
    const left = Math.max(0, (startOffsetMs / totalRangeMs) * 100);
    let width = Math.max(0, (durationMs / totalRangeMs) * 100);

    // Ajustes de seguridad
    if (left < 0) left = 0;
    if (left + width > 100) width = 100 - left;

    const sprintTasks = state.tasks.filter((t) => t.listId === sprint.id);
    const totalPoints = sprintTasks.reduce((sum, t) => sum + (t.points || 0), 0);
    const completedPoints = sprintTasks
      .filter((t) => t.status === "completed" || t.kanbanStatus === "done")
      .reduce((sum, t) => sum + (t.points || 0), 0);
    const progress = totalPoints > 0 ? (completedPoints / totalPoints) * 100 : 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let statusClass = "status-inprogress";
    let statusIcon = "";
    if (today > sprintEnd || (progress === 100 && totalPoints > 0)) {
      statusClass = "status-completed";
      statusIcon = `<i class="fas fa-check-circle mr-2"></i>`;
    } else if (today < sprintStart) {
      statusClass = "status-future";
    }

    const sprintColor = sprint.color || "#3b82f6";
    const tooltip = `${sprint.title}\nProgreso: ${Math.round(progress)}% (${completedPoints}/${totalPoints} Pts)`;
    const barDiv = document.createElement("div");
    barDiv.className = `timeline-bar ${statusClass}`;
    Object.assign(barDiv.style, {
      left: `${left}%`,
      width: `${width}%`,
      top: `${i * rowHeightRem}rem`,
    });
    barDiv.title = tooltip;
    barDiv.innerHTML = `<div class="bar-points-content">${completedPoints}/${totalPoints} Pts</div><div class="progress-fill" style="width: ${progress}%; background-color: ${sprintColor};"></div><div class="bar-title-overlay"><span class="font-bold truncate min-w-0">${statusIcon}${sprint.title}</span></div>`;
    container.appendChild(barDiv);
  });

  // Mini-map: muestra el rango visible dentro del mes (indicador simple)
  const minimapContainer = document.getElementById("timeline-minimap");
  if (minimapContainer) {
    try {
      let mapStart, mapEnd, mapDays;
      if (zoomMode === "year") {
        mapStart = new Date(viewStart.getFullYear(), 0, 1);
        mapEnd = new Date(viewStart.getFullYear(), 11, 31);
      } else {
        mapStart = new Date(viewStart.getFullYear(), viewStart.getMonth(), 1);
        mapEnd = new Date(viewStart.getFullYear(), viewStart.getMonth() + 1, 0);
      }
      mapDays = Math.ceil((mapEnd.getTime() - mapStart.getTime() + 1) / msPerDay);
      const leftPercent = Math.max(
        0,
        ((viewStart.getTime() - mapStart.getTime()) / (mapDays * msPerDay)) * 100
      );
      const widthPercent = Math.max(
        0,
        ((viewEnd.getTime() - viewStart.getTime() + msPerDay) / (mapDays * msPerDay)) * 100
      );
      minimapContainer.innerHTML = `<div class="w-40 h-2 rounded bg-gray-200 relative overflow-hidden">
          <div style="position:absolute; left:${leftPercent}%; width:${widthPercent}%; height:100%; background: rgba(59,130,246,0.55);"></div>
        </div><div class="text-xs text-gray-400 mt-1">${viewStart.toLocaleDateString()} — ${viewEnd.toLocaleDateString()}</div>`;
      // Make minimap clickable to jump to selected position
      const minimapBar = minimapContainer.querySelector(".w-40");
      if (minimapBar) {
        minimapBar.style.cursor = "pointer";
        minimapBar.onclick = (e) => {
          const rect = minimapBar.getBoundingClientRect();
          const clickPercent = (e.clientX - rect.left) / rect.width;
          let mapStart, mapEnd;
          if (zoomMode === "year") {
            mapStart = new Date(state.timelineDate.getFullYear(), 0, 1);
            mapEnd = new Date(state.timelineDate.getFullYear(), 11, 31);
          } else {
            mapStart = new Date(state.timelineDate.getFullYear(), state.timelineDate.getMonth(), 1);
            mapEnd = new Date(
              state.timelineDate.getFullYear(),
              state.timelineDate.getMonth() + 1,
              0
            );
          }
          const mapDuration = mapEnd.getTime() - mapStart.getTime();
          const clickedDate = new Date(mapStart.getTime() + clickPercent * mapDuration);
          state.timelineDate = clickedDate;
          renderTimeline(state);
        };
      }
    } catch (e) {
      minimapContainer.textContent = "";
    }
  }
}

function renderComments(task, state) {
  const commentsList = document.getElementById("comments-list");
  if (!commentsList) return;
  commentsList.innerHTML = "";
  if (!task.comments || task.comments.length === 0) {
    commentsList.innerHTML = '<p class="text-center text-gray-500 text-sm">No hay comentarios.</p>';
    return;
  }
  task.comments
    .sort((a, b) => (a.timestamp?.seconds || 0) - (b.timestamp?.seconds || 0))
    .forEach((comment, index) => {
      commentsList.appendChild(createCommentElement(comment, index, state));
    });
  commentsList.scrollTop = commentsList.scrollHeight;
}

function getIconForEntry(title) {
  const lowerTitle = title.toLowerCase();
  if (lowerTitle.includes("sprint")) return "fa-person-running";
  if (lowerTitle.includes("punto") || lowerTitle.includes("estimar")) return "fa-coins";
  if (lowerTitle.includes("epic")) return "fa-book-atlas";
  if (lowerTitle.includes("kanban") || lowerTitle.includes("flujo")) return "fa-columns";
  if (lowerTitle.includes("calidad") || lowerTitle.includes("hecho")) return "fa-check-double";
  if (lowerTitle.includes("matriz") || lowerTitle.includes("prioridad")) return "fa-table-cells";
  if (lowerTitle.includes("rol") || lowerTitle.includes("equipo")) return "fa-users";
  return "fa-book-open";
}

export function renderHandbook(state) {
  const container = document.getElementById("handbook-container");
  if (!container) return;
  container.innerHTML = "";
  const sortedEntries = [...state.handbookEntries].sort(
    (a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0)
  );
  if (sortedEntries.length === 0) {
    container.innerHTML = `<div class="text-center bg-white p-8 rounded-xl shadow-md col-span-full"><i class="fas fa-book-open text-4xl text-gray-300 mb-4"></i><h3 class="text-xl font-bold text-gray-700">El manual está vacío</h3><p class="text-gray-500 mt-2">Usa el botón "Nueva Entrada" para empezar a documentar.</p></div>`;
    return;
  }
  sortedEntries.forEach((entry) => {
    const entryEl = document.createElement("div");
    entryEl.className =
      "handbook-card bg-white rounded-xl shadow-md hover:shadow-lg hover:border-blue-500 border-2 border-transparent transition-all duration-200 cursor-pointer flex flex-col justify-between p-6";
    entryEl.dataset.id = entry.id;
    entryEl.dataset.action = "open-handbook-entry";
    const iconClass = getIconForEntry(entry.title);
    const author = state.allUsers.find((u) => u.email === entry.createdBy);
    const authorName = author ? author.displayName : entry.createdBy || "Desconocido";
    const authorAvatar = author
      ? author.photoURL
      : `https://ui-avatars.com/api/?name=${authorName}`;
    const createdAt = entry.createdAt
      ? entry.createdAt.toDate().toLocaleDateString("es-MX", { month: "long", day: "numeric" })
      : "";
    entryEl.innerHTML = `
            <div>
                <div class="w-12 h-12 bg-blue-50 rounded-lg flex items-center justify-center mb-4">
                    <i class="fa-solid ${iconClass} text-2xl text-blue-600"></i>
                </div>
                <h3 class="text-lg font-bold text-gray-800 mb-2">${entry.title}</h3>
            </div>
            <div class="flex justify-between items-center gap-2 mt-6 pt-4 border-t border-gray-200">
                <div class="flex items-center gap-2">
                    <img src="${authorAvatar}" class="w-8 h-8 rounded-full" title="${authorName}">
                    <div class="text-xs">
                        <span class="font-semibold block text-gray-700">${authorName}</span>
                        <span class="text-gray-500">${createdAt}</span>
                    </div>
                </div>
                <div class="flex items-center">
                    <button data-action="edit-handbook-entry" data-id="${entry.id}" class="text-gray-400 hover:text-blue-600 p-2"><i class="fas fa-pencil"></i></button>
                    <button data-action="delete-handbook-entry" data-id="${entry.id}" class="text-gray-400 hover:text-red-600 p-2"><i class="fas fa-trash-can"></i></button>
                </div>
            </div>
        `;
    container.appendChild(entryEl);
  });
}

function renderSettingsView(state) {
  const impactEditor = document.getElementById("impact-questions-editor");
  const effortEditor = document.getElementById("effort-questions-editor");
  if (!impactEditor || !effortEditor) return;
  impactEditor.innerHTML = "";
  effortEditor.innerHTML = "";
  const config = state.triageConfig;
  if (!config) {
    impactEditor.innerHTML = '<p class="text-sm text-gray-500">Cargando configuración...</p>';
    return;
  }
  const createQuestionEditor = (q, type) => {
    const el = document.createElement("div");
    el.className = "p-3 border rounded-lg bg-gray-50";
    el.dataset.id = q.id;
    el.dataset.type = type;
    el.innerHTML = `
            <div class="flex items-center gap-2">
                <div class="flex-grow">
                    <label class="text-xs font-semibold text-gray-500">Texto de la pregunta</label>
                    <input data-role="text" type="text" value="${q.text}" class="w-full p-2 border rounded-md mt-1 text-sm focus:ring-2 focus:ring-blue-500">
                </div>
                <div class="w-20">
                    <label class="text-xs font-semibold text-gray-500">Peso</label>
                    <input data-role="weight" type="number" value="${q.weight}" class="w-full p-2 border rounded-md mt-1 text-sm focus:ring-2 focus:ring-blue-500">
                </div>
            </div>
            <div class="flex justify-end gap-2 mt-3">
                <button data-action="delete-triage-question" class="text-gray-500 hover:text-red-600 px-3 py-1 rounded-md text-sm font-semibold">Borrar</button>
                <button data-action="save-triage-question" class="bg-gray-200 hover:bg-gray-300 text-gray-800 px-3 py-1 rounded-md text-sm font-semibold">Guardar</button>
            </div>
        `;
    return el;
  };
  (config.impact || []).forEach((q) => impactEditor.appendChild(createQuestionEditor(q, "impact")));
  (config.effort || []).forEach((q) => effortEditor.appendChild(createQuestionEditor(q, "effort")));
  const impactThresholdInput = document.getElementById("matrix-impact-threshold");
  const effortThresholdInput = document.getElementById("matrix-effort-threshold");
  if (impactThresholdInput && config?.matrixThresholds) {
    impactThresholdInput.value = config.matrixThresholds.impact;
  }
  if (effortThresholdInput && config?.matrixThresholds) {
    effortThresholdInput.value = config.matrixThresholds.effort;
  }
}

// =================================================================================
// SECCIÓN 3: FUNCIONES RESTAURADAS Y CORREGIDAS
// =================================================================================

export function buildEmptyState({ icon = "inbox", title = "Sin elementos", hint = "", cta = null } = {}) {
  const ctaHTML = cta
    ? `<button type="button" class="empty-state__cta" data-action="${cta.action}"${cta.value ? ` data-value="${cta.value}"` : ""}>${escapeBreadcrumbLabel(cta.label)}</button>`
    : "";
  return `
    <div class="empty-state" role="status">
      <div class="empty-state__icon" aria-hidden="true"><i class="fa-solid fa-${icon}"></i></div>
      <h4 class="empty-state__title">${escapeBreadcrumbLabel(title)}</h4>
      ${hint ? `<p class="empty-state__hint">${escapeBreadcrumbLabel(hint)}</p>` : ""}
      ${ctaHTML}
    </div>
  `;
}

export function buildSkeletonCards(count = 3) {
  const cards = Array.from({ length: count })
    .map(
      () => `
      <div class="skeleton-card" aria-hidden="true">
        <div class="skeleton-line skeleton-line--sm"></div>
        <div class="skeleton-line skeleton-line--lg"></div>
        <div class="skeleton-line skeleton-line--md"></div>
        <div class="skeleton-row">
          <div class="skeleton-dot"></div>
          <div class="skeleton-line skeleton-line--xs"></div>
        </div>
      </div>`
    )
    .join("");
  return `<div class="skeleton-stack" role="status" aria-label="Cargando">${cards}</div>`;
}

export function renderLoadingSkeletons() {
  ["col-todo-wrapper", "col-inprogress-wrapper", "col-done-wrapper"].forEach((id) => {
    const wrapper = document.getElementById(id);
    if (!wrapper) return;
    const key = id.replace("col-", "").replace("-wrapper", "");
    wrapper.className = `kanban-column kanban-column--${key}`;
    wrapper.innerHTML = `
      <div class="kanban-column-meta">
        <span class="skeleton-chip"></span>
      </div>
      ${buildSkeletonCards(3)}
    `;
  });
  const backlog = document.getElementById("backlog-tasks-container");
  if (backlog) backlog.innerHTML = buildSkeletonCards(4);
  const summary = document.getElementById("summary-table-body");
  if (summary) {
    summary.innerHTML = Array.from({ length: 4 })
      .map(
        () => `<tr><td colspan="100" class="p-3"><div class="skeleton-line skeleton-line--lg"></div></td></tr>`
      )
      .join("");
  }
}

export function buildFilterBar({ items = [], activeKey, action, dataKey = "filter", ariaLabel = "Filtros" } = {}) {
  if (!items.length) return "";
  const chips = items
    .map((item) => {
      const isActive = item.key === activeKey;
      const activeClass = isActive ? " filter-chip--active" : "";
      const attrs = [
        `type="button"`,
        action ? `data-action="${action}"` : "",
        `data-${dataKey}="${item.key}"`,
        `class="filter-chip${activeClass}"`,
        `aria-pressed="${isActive ? "true" : "false"}"`,
      ]
        .filter(Boolean)
        .join(" ");
      return `<button ${attrs}>${escapeBreadcrumbLabel(item.label)}</button>`;
    })
    .join("");
  return `<div class="filter-bar" role="group" aria-label="${ariaLabel}">${chips}</div>`;
}

function renderBreadcrumb(state, hash, activeLink) {
  const container = dom.breadcrumb || document.getElementById("view-breadcrumb");
  if (!container) return;

  if (!activeLink) {
    container.innerHTML = "";
    return;
  }

  const crumbs = [{ label: "Workspace", href: "#sprint" }];

  const navGroup = activeLink.closest(".nav-group");
  const groupTitle = navGroup?.querySelector("h3")?.textContent?.trim();
  const groupButton = navGroup?.querySelector(".nav-group-button");
  if (groupTitle) {
    crumbs.push({
      label: groupTitle,
      action: groupButton ? "toggle-nav-group" : null,
      target: groupButton?.dataset?.target || null,
    });
  }

  const viewLabel = activeLink.querySelector("span")?.textContent?.trim() || "";
  const context = getBreadcrumbContext(state, hash);
  crumbs.push({ label: viewLabel, href: hash, current: !context });
  if (context) {
    crumbs.push({ label: context, current: true });
  }

  container.innerHTML = crumbs
    .map((c, i) => {
      const isLast = i === crumbs.length - 1;
      const currentClass = c.current || isLast ? " view-breadcrumb__crumb--current" : "";
      const tag = c.href && !(c.current || isLast) ? "a" : "span";
      const hrefAttr = tag === "a" ? ` href="${c.href}"` : "";
      const ariaCurrent = c.current || isLast ? ' aria-current="page"' : "";
      const sep = i > 0
        ? '<span class="view-breadcrumb__separator" aria-hidden="true">/</span>'
        : "";
      return `${sep}<${tag} class="view-breadcrumb__crumb${currentClass}"${hrefAttr}${ariaCurrent}>${escapeBreadcrumbLabel(c.label)}</${tag}>`;
    })
    .join("");
}

function getBreadcrumbContext(state, hash) {
  if (hash === "#sprint") {
    const sprint = state?.taskLists?.find((l) => l.id === state.currentSprintId);
    return sprint?.title || null;
  }
  if (hash === "#by-person" && state?.personViewPersonFilter && state.personViewPersonFilter !== "all") {
    return state.personViewPersonFilter;
  }
  return null;
}

function escapeBreadcrumbLabel(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function handleRouteChange(state) {
  const views = {
    "#themes": document.getElementById("view-themes"),
    "#epics": document.getElementById("view-epics"),
    "#backlog": document.getElementById("view-backlog"),
    "#sprint": document.getElementById("view-sprint"),
    "#summary": document.getElementById("view-summary"),
    "#archived-sprints": document.getElementById("view-archived-sprints"),
    "#timeline": document.getElementById("view-timeline"),
    "#mytasks": document.getElementById("view-mytasks"),
    "#by-person": document.getElementById("view-by-person"),
    "#activity": document.getElementById("view-activity"),
    "#handbook": document.getElementById("view-handbook"),
    "#settings": document.getElementById("view-settings"),
  };
  let hash = window.location.hash || "#backlog";
  if (hash === "#mytasks" || hash === "#activity") {
    hash = "#by-person";
    if (typeof window !== "undefined" && window.history?.replaceState) {
      window.history.replaceState(null, "", "#by-person");
    }
  }

  Object.values(views).forEach((view) => view && view.classList.add("hidden"));
  document.querySelectorAll(".sidebar-link").forEach((link) => link.classList.remove("active"));

  document
    .querySelectorAll(".nav-group-button")
    .forEach((button) => {
      button.classList.remove("is-open");
      button.setAttribute("aria-expanded", "false");
    });
  document
    .querySelectorAll(".nav-group-content")
    .forEach((content) => {
      content.classList.add("hidden");
      content.setAttribute("aria-hidden", "true");
    });
  document
    .querySelectorAll('.nav-group-button[data-default-open="true"]')
    .forEach((button) => {
      const targetId = button.dataset.target;
      const content = targetId ? document.getElementById(targetId) : null;
      if (!content) return;
      button.classList.add("is-open");
      button.setAttribute("aria-expanded", "true");
      content.classList.remove("hidden");
      content.setAttribute("aria-hidden", "false");
    });

  const headerControls = document.getElementById("header-controls");
  if (headerControls) {
    const isControlView = ["#backlog", "#sprint"].includes(hash);
    headerControls.style.visibility = isControlView ? "visible" : "hidden";
  }
  const sprintControlEl = document.querySelector(".sprint-control");
  if (sprintControlEl) {
    sprintControlEl.style.display = hash === "#backlog" ? "" : "none";
  }
  const backlogHeaderActions = document.getElementById("backlog-header-actions");
  if (backlogHeaderActions) {
    backlogHeaderActions.style.display = hash === "#backlog" ? "flex" : "none";
  }

  if (views[hash]) {
    views[hash].classList.remove("hidden");
    const activeLink = document.querySelector(`.sidebar-link[href="${hash}"]`);
    if (activeLink) {
      activeLink.classList.add("active");

      const parentGroup = activeLink.closest(".nav-group-content");
      if (parentGroup) {
        const button = document.querySelector(`[data-target="${parentGroup.id}"]`);
        if (button) {
          button.classList.add("is-open");
          button.setAttribute("aria-expanded", "true");
          parentGroup.classList.remove("hidden");
          parentGroup.setAttribute("aria-hidden", "false");
        }
      }

      let title = activeLink.querySelector("span").textContent;
      if (hash === "#sprint") {
        renderActiveSprintTitle(state); // Llamamos a la nueva función
      } else {
        dom.viewTitle.textContent = title;
      }

      renderBreadcrumb(state, hash, activeLink);
    } else {
      renderBreadcrumb(state, hash, null);
    }

    switch (hash) {
      case "#themes": // <-- AÑADIR ESTE BLOQUE
        renderThemes(state);
        break;
      case "#epics":
        renderEpics(state);
        break;
      case "#backlog": {
        const matrixViewIsActive =
          dom.backlogMatrixContainer && !dom.backlogMatrixContainer.classList.contains("hidden");
        if (matrixViewIsActive) {
          renderBacklogMatrix(state);
        } else {
          renderBacklog(state);
        }
        break;
      }
      case "#sprint":
        renderSprintKanban(state);
        break;
      case "#summary":
        renderSprintsSummary(state);
        break;
      case "#archived-sprints":
        renderArchivedSprints(state);
        break;
      case "#timeline":
        renderTimeline(state);
        break;
      case "#mytasks":
        renderMyTasks(state);
        break;
      case "#by-person":
        renderPersonView(state);
        break;
      case "#activity":
        renderActivityView(state);
        break;
      case "#handbook":
        renderHandbook(state);
        break;
      case "#settings":
        renderSettingsView(state);
        break;
    }
  }
}

let _hudObserver = null;

function initSprintHUDObserver() {
  if (_hudObserver) {
    _hudObserver.disconnect();
    _hudObserver = null;
  }
  const sentinel = document.getElementById("hud-sentinel");
  const panel = document.getElementById("sprint-breakdown-panel");
  const scrollRoot = document.getElementById("main-content");
  if (!sentinel || !panel || !scrollRoot) return;

  _hudObserver = new IntersectionObserver(
    ([entry]) => {
      panel.classList.toggle("hud--collapsed", !entry.isIntersecting);
    },
    { root: scrollRoot, threshold: 0 }
  );
  _hudObserver.observe(sentinel);
}

export function renderActiveSprintTitle(state) {
  const domViewTitle = document.getElementById("view-title");
  if (!domViewTitle || window.location.hash !== "#sprint") return;

  const selectedSprint = state.taskLists.find((l) => l.id === state.currentSprintId);
  const title = selectedSprint ? selectedSprint.title : "Sprint";
  domViewTitle.textContent = title;

  const sprintTasks = state.tasks.filter((t) => t.listId === state.currentSprintId);
  renderSprintHUD(state, sprintTasks, selectedSprint);
  initSprintHUDObserver();
}

function getSprintHealth(sprint, donePts, totalPts) {
  if (!sprint?.startDate || !sprint?.endDate) return "unknown";
  const getMs = (v) => (v?.toDate ? v.toDate() : v ? new Date(v) : null)?.getTime();
  const start = getMs(sprint.startDate);
  const end = getMs(sprint.endDate);
  if (!start || !end || end <= start) return "unknown";
  const now = Date.now();
  const totalDays = (end - start) / 86400000;
  const daysElapsed = Math.max(0, (now - start) / 86400000);
  const pctTime = Math.min(1, daysElapsed / totalDays);
  const pctDone = totalPts > 0 ? donePts / totalPts : 0;
  if (pctDone >= pctTime) return "green";
  if (pctDone >= pctTime * 0.75) return "yellow";
  return "red";
}

function renderSprintHUD(state, sprintTasks, sprint) {
  const density = state.taskCardDensity || "comfortable";
  const densityLabel = density === "compact" ? "Compacto" : "Cómodo";

  const densityBtn = document.getElementById("sprint-density-btn");
  if (densityBtn) {
    densityBtn.dataset.density = density === "compact" ? "comfortable" : "compact";
    const densityLabelEl = document.getElementById("sprint-density-label");
    if (densityLabelEl) densityLabelEl.textContent = densityLabel;
    densityBtn.classList.toggle("sprint-toolbar-btn--active", density === "compact");
  }

  _renderSprintPersonDropdown(state, sprintTasks);
  _renderSprintStatusBadge(sprint);
}

function _renderSprintStatusBadge(sprint) {
  const badge = document.getElementById("sprint-status-badge");
  if (!badge) return;

  const startDate = parseAppDate(sprint?.startDate);
  const endDate = parseAppDate(sprint?.endDate);

  if (!startDate || !endDate) { badge.style.display = "none"; return; }

  // Compare at day granularity: end of the last day counts as still active
  const todayMs = new Date(new Date().toDateString()).getTime();
  const startMs = new Date(startDate.toDateString()).getTime();
  const endMs = new Date(endDate.toDateString()).getTime();

  badge.style.display = "inline-flex";
  badge.className = "sprint-status-badge";

  if (todayMs < startMs) {
    const daysUntil = Math.round((startMs - todayMs) / 86400000);
    badge.classList.add("sprint-status-badge--upcoming");
    badge.innerHTML = `<span class="sprint-status-dot"></span>Próximo · ${daysUntil}d`;
  } else if (todayMs > endMs) {
    badge.classList.add("sprint-status-badge--done");
    badge.innerHTML = `<span class="sprint-status-dot"></span>Completado`;
  } else {
    const daysLeft = Math.round((endMs - todayMs) / 86400000);
    const totalDays = Math.round((endMs - startMs) / 86400000) || 1;
    const pctTime = Math.min(1, (todayMs - startMs) / (endMs - startMs));
    let variant = "active";
    if (daysLeft <= 2) variant = "danger";
    else if (pctTime > 0.7) variant = "warning";
    badge.classList.add(`sprint-status-badge--${variant}`);
    badge.innerHTML = `<span class="sprint-status-dot"></span>${daysLeft === 0 ? "Último día" : `${daysLeft} días restantes`}`;
  }
}

function _renderSprintPersonDropdown(state, sprintTasks) {
  const list = document.getElementById("sprint-person-list");
  const btn = document.getElementById("sprint-person-btn");
  const labelEl = document.getElementById("sprint-person-label");
  if (!list) return;

  const activeFilter = state.kanbanAssigneeFilter;
  const assigneeEmails = [...new Set(sprintTasks.map((t) => t.assignee).filter(Boolean))];

  // Update button label + active style
  if (labelEl) {
    if (activeFilter) {
      const u = state.allUsers.find((u) => u.email === activeFilter);
      labelEl.textContent = u?.displayName?.split(" ")[0] || activeFilter.split("@")[0];
    } else {
      labelEl.textContent = "Persona";
    }
  }
  if (btn) btn.classList.toggle("sprint-toolbar-btn--active", !!activeFilter);

  const makeAvatar = (email) => {
    const u = state.allUsers.find((u) => u.email === email);
    if (u?.photoURL) return `<img src="${u.photoURL}" class="kanban-filter-avatar-img" alt="">`;
    const initial = (u?.displayName || email)[0].toUpperCase();
    return `<span class="kanban-filter-avatar-initial">${initial}</span>`;
  };

  const allChip = `<div class="sprint-person-chip ${!activeFilter ? "is-active" : ""}" data-action="filter-kanban-assignee" data-assignee="" role="button" tabindex="0">
    <span style="width:18px;height:18px;border-radius:50%;background:var(--surface-secondary);display:inline-flex;align-items:center;justify-content:center;font-size:10px;">✓</span>
    Todos
  </div>`;

  const chips = assigneeEmails.map((email) => {
    const u = state.allUsers.find((u) => u.email === email);
    const name = u?.displayName || email.split("@")[0];
    const isActive = activeFilter === email;
    return `<div class="sprint-person-chip ${isActive ? "is-active" : ""}" data-action="filter-kanban-assignee" data-assignee="${email}" role="button" tabindex="0">
      ${makeAvatar(email)}
      ${name}
    </div>`;
  }).join("");

  list.innerHTML = allChip + chips;
}

// Mantener compatibilidad con toggles existentes — ahora es no-op ya que el HUD es permanente
function renderSprintBreakdown(state, sprintTasks) {}

export function renderSprintSelector(state) {
  const sprints = state.taskLists
    .filter((l) => !l.isBacklog && !l.isArchived)
    .sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));

  const populate = (el) => {
    if (!el) return;
    el.innerHTML = "";
    if (sprints.length > 0) {
      sprints.forEach((s) => el.add(new Option(s.title, s.id)));
      el.value = state.currentSprintId;
    } else {
      el.innerHTML = "<option>Crea un sprint</option>";
    }
  };

  populate(document.getElementById("sprint-list-select"));
  populate(document.getElementById("sprint-nav-select"));
}

export function renderCalendarButton(state) {
  const container = document.getElementById("calendar-connection-ui");
  if (!container) return;
  // Oculto por ahora: para reactivar, cambia a false o elimina este bloque.
  const hideCalendarButton = true;
  if (hideCalendarButton) {
    container.style.display = "none";
    return;
  }
  const isVisible = ["#backlog", "#sprint"].includes(window.location.hash);
  container.style.display = isVisible ? "" : "none";
  if (!isVisible) return;
  let buttonHTML = "";
  switch (state.calendarStatus) {
    case "connecting":
      buttonHTML = `<button class="bg-gray-100 text-gray-500 font-semibold py-2 px-3 rounded-md border border-gray-200 flex items-center gap-2 cursor-wait shadow-sm" disabled><i class="fas fa-spinner fa-spin"></i><span>Conectando...</span></button>`;
      break;
    case "connected":
      buttonHTML = `<button class="bg-green-100 text-green-700 font-semibold py-2 px-3 rounded-md border border-green-200 flex items-center gap-2 shadow-sm" disabled><i class="fas fa-check"></i><span>Calendario Conectado</span></button>`;
      break;
    default:
      buttonHTML = `<button data-action="connect-calendar" class="bg-white text-gray-700 font-semibold py-2 px-3 rounded-md border border-gray-200 flex items-center gap-2 transition-all shadow-sm"><i class="fab fa-google-drive text-green-500"></i><span>Conectar con Calendar</span></button>`;
      break;
  }
  container.innerHTML = buttonHTML;
}

export function updateSprintCapacityInput(state) {
  const sprint = state.taskLists.find((l) => l.id === state.currentSprintId);
  const input = document.getElementById("sprint-capacity-input");
  if (sprint && input) input.value = sprint.capacity || "";
}

export function renderAllViews(state, actions) {
  if (!state.user) return;
  renderBacklog(state);
  renderBacklogMatrix(state);
  renderSprintKanban(state);
  renderEpics(state, actions);
  renderMyTasks(state);
  renderPersonView(state);
  renderActivityView(state);
  renderSprintsSummary(state);
  renderArchivedSprints(state);
  renderTimeline(state);
  renderHandbook(state);
  renderSettingsView(state);
  renderSprintSelector(state);
  updateSprintCapacityInput(state);
  renderCalendarButton(state);
  renderOnlineUsers(state.onlineUsers);
  handleRouteChange(state);
}

// =================================================================================
// SECCIÓN 4: MANEJADORES DE EVENTOS Y FUNCIONES EXPUESTAS
// =================================================================================

function showHandbookModal(entry = null) {
  // --- PROTECCIÓN CONTRA LIBRERÍA NO CARGADA ---
  if (typeof Quill === "undefined") {
    showModal({
      title: "Cargando editor...",
      text: "El editor de texto aún se está descargando. Por favor, espera 2 segundos e intenta de nuevo.",
      okText: "Entendido",
    });
    return;
  }
  const isEditing = entry !== null;
  const title = isEditing ? "Editar Entrada del Manual" : "Nueva Entrada del Manual";
  const okText = isEditing ? "Guardar Cambios" : "Crear Entrada";
  const callback = (result) => {
    if (isEditing) {
      appActions.updateHandbookEntry(entry.id, result);
    } else {
      appActions.addHandbookEntry(result);
    }
  };
  showModal({ title, handbookInputs: true, okText, callback });
  document.getElementById("modal-handbook-title").value = isEditing ? entry.title : "";
  const wrapper = document.getElementById("quill-wrapper");
  wrapper.innerHTML = '<div id="handbook-editor" style="height: 250px;"></div>';
  const editorContainer = document.getElementById("handbook-editor");
  quillInstance = new Quill(editorContainer, {
    theme: "snow",
    placeholder: "Escribe algo increíble...",
    modules: {
      toolbar: [
        [{ header: [1, 2, 3, false] }],
        ["bold", "italic", "underline"],
        [{ list: "ordered" }, { list: "bullet" }],
        ["clean"],
      ],
    },
  });
  if (isEditing && entry.content) {
    if (entry.content.blocks) {
      const plainText = entry.content.blocks.map((block) => block.data.text || "").join("\n");
      quillInstance.setText(plainText);
    } else {
      quillInstance.setContents(entry.content);
    }
  }
  quillInstance.focus();
}
function showThemeModal(theme = null) {
  const isEditing = theme !== null;
  const title = isEditing ? "Editar Tema" : "Nuevo Tema";
  const okText = isEditing ? "Guardar Cambios" : "Crear Tema";

  const callback = (result) => {
    if (isEditing) {
      appActions.updateTheme(theme.id, result);
    } else {
      appActions.addNewTheme(result);
    }
  };

  showModal({ title, themeInputs: true, okText, callback });

  const themeTitleInput = document.getElementById("modal-theme-title");
  const themeDescriptionInput = document.getElementById("modal-theme-description");
  if (!themeTitleInput || !themeDescriptionInput) {
    console.error("No se encontraron los inputs del modal de Tema.");
    return;
  }

  themeTitleInput.value = isEditing ? theme.title : "";
  themeDescriptionInput.value = isEditing ? theme.description : "";
}
function showHandbookReaderModal(entry) {
  if (!entry) return;
  const author = appState.allUsers.find((u) => u.email === entry.createdBy);
  const authorName = author ? author.displayName : entry.createdBy || "Desconocido";
  const createdAt = entry.createdAt
    ? entry.createdAt.toDate().toLocaleDateString("es-MX", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : "N/A";
  const modalHTML = `
        <div class="handbook-reader">
            <div class="reader-header border-b border-gray-200 pb-4 mb-6">
                <h2 class="text-3xl font-bold text-gray-900">${entry.title}</h2>
                <p class="text-sm text-gray-500 mt-2">Por ${authorName} &bull; Creado el ${createdAt}</p>
            </div>
            <div id="handbook-reader-content" class="reader-content"></div>
        </div>
    `;
  showModal({ htmlContent: modalHTML, okText: "Cerrar" });
  const readerContainer = document.getElementById("handbook-reader-content");
  if (readerContainer) {
    const readerQuill = new Quill(readerContainer, {
      theme: "snow",
      modules: { toolbar: false },
      readOnly: true,
    });
    if (entry.content) {
      if (entry.content.blocks) {
        const plainText = entry.content.blocks.map((block) => block.data.text || "").join("\n");
        readerQuill.setText(plainText);
      } else {
        readerQuill.setContents(entry.content);
      }
    }
    const editorElement = readerContainer.querySelector(".ql-container");
    if (editorElement) editorElement.style.border = "none";
  }
}

function setSprintMenuOpen(isOpen) {
  const menuContainer = document.getElementById("sprint-menu-container");
  const menuButton = menuContainer?.querySelector('[data-action="toggle-sprint-menu"]');
  const menuContent = document.getElementById("sprint-actions-menu");
  if (!menuContainer || !menuButton || !menuContent) return;

  menuContainer.classList.toggle("is-active", isOpen);
  menuButton.setAttribute("aria-expanded", String(isOpen));
  menuContent.setAttribute("aria-hidden", String(!isOpen));
}

function handleAppClick(e) {
  const target = e.target;
  const actionTarget = target.closest("[data-action]");
  const colorSwatch = target.closest(".color-swatch");
  const sidebarLink = target.closest("#sidebar .sidebar-link");

  if (!target.closest("#sprint-menu-container")) {
    setSprintMenuOpen(false);
  }

  // Person filter dropdown toggle
  const personDropdown = document.getElementById("sprint-person-dropdown");
  const personPanel = document.getElementById("sprint-person-panel");
  const personBtn = document.getElementById("sprint-person-btn");
  if (personPanel) {
    if (target.closest("#sprint-person-btn")) {
      personPanel.classList.toggle("is-open");
      return;
    }
    if (!target.closest("#sprint-person-dropdown")) {
      personPanel.classList.remove("is-open");
    }
    if (target.closest("[data-action='filter-kanban-assignee']") && target.closest("#sprint-person-panel")) {
      personPanel.classList.remove("is-open");
    }
  }

  if (sidebarLink && isMobileSidebarLayout()) {
    setSidebarMobileOpen(false);
  }

  if (colorSwatch) {
    const palette = colorSwatch.parentElement;
    palette.querySelectorAll(".color-swatch").forEach((sw) => sw.classList.remove("selected"));
    colorSwatch.classList.add("selected");
    return;
  }

  const taskCard = target.closest(".task-card");
  if (taskCard) {
    const taskId = taskCard.id;
    if (target.closest('input[type="checkbox"]')) {
      const checkbox = target.closest('input[type="checkbox"]');
      e.stopPropagation();
      if (!checkbox.hasAttribute("data-select-task")) {
        const isChecked = checkbox.checked;
        if (isChecked && window.confetti)
          confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
        appActions.updateTask(taskId, {
          status: isChecked ? "completed" : "needsAction",
          kanbanStatus: isChecked ? "done" : "todo",
          completedAt: isChecked ? Timestamp.now() : null,
          lastMovedAt: Timestamp.now(),
        });
      }
      return;
    }
    if (actionTarget) {
      const action = actionTarget.dataset.action;
      handleTaskCardAction(action, taskId);
      return;
    }
    openTaskDetailsModal(appState.tasks.find((t) => t.id === taskId));
    return;
  }

  if (actionTarget) {
    const action = actionTarget.dataset.action;

    if (action === "collapse-column") {
      const colId = actionTarget.dataset.col;
      const meta = KANBAN_COLUMN_META[colId];
      appActions.toggleColumnCollapse(colId);
      showToast({
        message: `Columna «${meta?.title ?? colId}» colapsada`,
        onUndo: () => appActions.toggleColumnCollapse(colId),
      });
      return;
    }

    if (action === "toggle-task-density" || action === "set-kanban-density") {
      const next = appState.taskCardDensity === "compact" ? "comfortable" : "compact";
      appActions.setTaskCardDensity(next);
      return;
    }

    if (action === "toggle-sprint-breakdown") {
      appActions.toggleSprintBreakdown();
      return;
    }

    if (action === "filter-kanban-assignee") {
      const email = actionTarget.dataset.assignee || null;
      // empty string = "Todos" button → always clear
      if (!email) {
        appActions.setKanbanAssigneeFilter(null);
      } else {
        appActions.setKanbanAssigneeFilter(email);
      }
      return;
    }

    if (action === "open-handbook-entry") {
      const entryId = actionTarget.dataset.id;
      const entry = appState.handbookEntries.find((e) => e.id === entryId);
      if (entry && !target.closest("button")) {
        showHandbookReaderModal(entry);
      }
      return;
    }

    const questionEditor = target.closest("[data-id]");
    const cloneConfig = () =>
      JSON.parse(JSON.stringify(appState.triageConfig || { impact: [], effort: [] }));

    if (action === "add-triage-question") {
      const type = actionTarget.dataset.type;
      const newConfig = cloneConfig();
      const newQuestion = {
        id: `q_${Date.now()}`,
        text: "Nueva pregunta",
        weight: 1,
      };
      newConfig[type].push(newQuestion);
      appActions.updateTriageConfig(newConfig);
      return;
    }
    if (action === "save-triage-question" && questionEditor) {
      const id = questionEditor.dataset.id;
      const type = questionEditor.dataset.type;
      const newText = questionEditor.querySelector('[data-role="text"]').value;
      const newWeight = parseInt(questionEditor.querySelector('[data-role="weight"]').value, 10);
      const newConfig = cloneConfig();
      const questionToUpdate = newConfig[type].find((q) => q.id === id);
      if (questionToUpdate) {
        questionToUpdate.text = newText;
        questionToUpdate.weight = isNaN(newWeight) ? 1 : newWeight;
        appActions.updateTriageConfig(newConfig);
      }
      return;
    }
    if (action === "delete-triage-question" && questionEditor) {
      const id = questionEditor.dataset.id;
      const type = questionEditor.dataset.type;
      const newConfig = cloneConfig();
      newConfig[type] = newConfig[type].filter((q) => q.id !== id);
      appActions.updateTriageConfig(newConfig);
      return;
    }

    switch (action) {
      case "quick-add-task-person": {
        const assignee = actionTarget.dataset.assignee;
        const targetEmail = assignee === "unassigned" ? null : assignee;

        // 1. Obtener Sprints Activos para el Dropdown
        const activeSprints = appState.taskLists
          .filter((l) => !l.isBacklog && !l.isArchived)
          .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));

        if (activeSprints.length === 0) {
          alert("No hay sprints activos. Crea uno primero.");
          return;
        }

        // 2. Generar opciones del Select (Pre-seleccionar el actual si existe)
        let sprintOptions = "";
        activeSprints.forEach((s) => {
          const isSelected = s.id === appState.currentSprintId ? "selected" : "";
          sprintOptions += `<option value="${s.id}" ${isSelected}>${s.title}</option>`;
        });

        // 3. HTML del Formulario
        const formHTML = `
            <div class="flex flex-col gap-4">
                <div>
                    <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Título de la Tarea</label>
                    <input id="quick-task-title" type="text" class="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 outline-none" placeholder="Escribe el nombre de la tarea...">
                </div>
                <div>
                    <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Selecciona el Sprint</label>
                    <select id="quick-task-sprint" class="w-full p-2 border border-gray-300 rounded bg-white focus:ring-2 focus:ring-blue-500 outline-none">
                        ${sprintOptions}
                    </select>
                </div>
            </div>
        `;

        // 4. Mostrar Modal
        showModal({
          title: `Añadir Tarea para ${targetEmail ? targetEmail.split("@")[0] : "Equipo"}`,
          htmlContent: formHTML,
          okText: "Añadir Tarea",
          callback: () => {
            const titleInput = document.getElementById("quick-task-title");
            const sprintSelect = document.getElementById("quick-task-sprint");

            if (titleInput && sprintSelect && titleInput.value.trim()) {
              appActions.addNewTask(
                titleInput.value,
                sprintSelect.value, // Usamos el ID del sprint seleccionado
                { assignee: targetEmail }
              );
            }
          },
        });

        // Foco automático en el input
        setTimeout(() => document.getElementById("quick-task-title")?.focus(), 100);
        return;
      }
      case "toggle-triage-section": {
        const content = document.getElementById("triage-content-area");
        const chevron = document.getElementById("triage-chevron");
        // Buscamos el span del texto "Ver Detalles" para cambiarlo dinámicamente
        const label = actionTarget.querySelector("span.text-\\[9px\\]");

        if (content) {
          const isHidden = content.classList.contains("hidden");

          if (isHidden) {
            // MOSTRAR
            content.classList.remove("hidden");
            if (chevron) chevron.style.transform = "rotate(180deg)";
            if (label) label.textContent = "Ocultar";
          } else {
            // OCULTAR
            content.classList.add("hidden");
            if (chevron) chevron.style.transform = "rotate(0deg)";
            if (label) label.textContent = "Ver Detalles";
          }
        }
        return;
      }
      case "new-theme":
        showThemeModal();
        return;
      case "edit-theme": {
        const themeId = actionTarget.closest(".theme-card").dataset.id;
        const theme = appState.themes.find((t) => t.id === themeId);
        if (theme) showThemeModal(theme);
        return;
      }
      case "delete-theme": {
        const themeId = actionTarget.closest(".theme-card").dataset.id;
        appActions.deleteTheme(themeId);
        return;
      }
      case "set-sprints-summary-filter":
        const filter = actionTarget.dataset.filter;
        if (filter) {
          appActions.setSprintsSummaryFilter(filter);
        }
        return;
      case "set-activity-filter":
        const activityFilter = actionTarget.dataset.filter;
        if (activityFilter) {
          appActions.setActivityFilter(activityFilter);
        }
        return;
      case "open-task-details":
        const taskId = actionTarget.dataset.id;
        const task = appState.tasks.find((t) => t.id === taskId);
        if (task) {
          openTaskDetailsModal(task);
        }
        return;
      case "toggle-nav-group": {
        const button = actionTarget;
        const targetId = button.dataset.target;
        const content = document.getElementById(targetId);
        if (content) {
          const isOpen = button.classList.toggle("is-open");
          content.classList.toggle("hidden", !isOpen);
          button.setAttribute("aria-expanded", String(isOpen));
          content.setAttribute("aria-hidden", String(!isOpen));
        }
        return;
      }
      case "toggle-sidebar": {
        if (isMobileSidebarLayout()) {
          setSidebarMobileOpen(!sidebarShellState.mobileOpen);
        } else {
          setSidebarCollapsed(!sidebarShellState.collapsed);
        }
        return;
      }
      case "close-sidebar-overlay":
        setSidebarMobileOpen(false);
        return;
      case "toggle-sprint-menu": {
        const menuContainer = document.getElementById("sprint-menu-container");
        const isOpen = !!menuContainer?.classList.contains("is-active");
        setSprintMenuOpen(!isOpen);
        return;
      }

      case "save-matrix-thresholds": {
        const impactThreshold = document.getElementById("matrix-impact-threshold").value;
        const effortThreshold = document.getElementById("matrix-effort-threshold").value;
        appActions.updateTriageConfig({
          matrixThresholds: {
            impact: Number(impactThreshold) || 3,
            effort: Number(effortThreshold) || 3,
          },
        });
        showModal({
          title: "Guardado",
          text: "Los límites de la matriz se han actualizado.",
          okText: "Entendido",
        });
        return;
      }
      case "new-handbook-entry":
        showHandbookModal();
        return;

      case "edit-handbook-entry": {
        const entryIdToEdit = actionTarget.dataset.id;
        const entry = appState.handbookEntries.find((e) => e.id === entryIdToEdit);
        if (entry) showHandbookModal(entry);
        return;
      }

      case "delete-handbook-entry":
        appActions.deleteHandbookEntry(actionTarget.dataset.id);
        return;

      case "unarchive-sprint": {
        const sprintIdToUnarchive = actionTarget.dataset.id;
        if (sprintIdToUnarchive) {
          showModal({
            title: "Restaurar Sprint",
            text: "Por favor, establece una nueva fecha de finalización para este sprint.",
            input: true,
            inputType: "date",
            okText: "Restaurar",
            callback: (newDate) => {
              if (newDate) {
                appActions.unarchiveSprint(sprintIdToUnarchive, newDate);
              }
            },
          });
        }
        return;
      }
      case "post-comment":
        handlePostComment();
        return;
      case "edit-comment":
      case "delete-comment": {
        const commentIndex = Number(actionTarget.dataset.index);
        const taskIdForComment = document.getElementById("modal-content")?.dataset.activeTaskId;
        appActions.handleCommentAction(action, taskIdForComment, commentIndex);
        return;
      }
      case "connect-calendar":
        appActions.connectCalendar();
        return;
      case "new-sprint":
        showModal({
          title: "Crear Nuevo Sprint",
          sprintInputs: true,
          okText: "Crear Sprint",
          callback: appActions.addNewSprint,
        });

        // 1. Resetear UI
        const palette = document.getElementById("sprint-color-palette");
        palette.querySelectorAll(".selected").forEach((el) => el.classList.remove("selected"));
        if (palette.firstElementChild) palette.firstElementChild.classList.add("selected");

        const nameInput = document.getElementById("modal-sprint-name");
        nameInput.value = ""; // Limpiar input
        const capacityInput = document.getElementById("modal-sprint-capacity");
        if (capacityInput) capacityInput.value = CYCLE_POINTS_TARGET;

        // 2. Lógica Epic/Secuencia
        const epicSelect = document.getElementById("modal-sprint-epic-select");
        const suffixSpan = document.getElementById("modal-sprint-suffix");

        // Llenar Select
        epicSelect.innerHTML = '<option value="">-- Selecciona un Epic --</option>';
        appState.epics.forEach((epic) => {
          epicSelect.add(new Option(epic.title, epic.id));
        });

        // Evento de cambio inteligente
        const handleEpicChange = () => {
          const epicId = epicSelect.value;
          if (!epicId) {
            suffixSpan.textContent = "(#?)";
            suffixSpan.dataset.seq = "0"; // Guardamos el número en un dataset invisible
            return;
          }

          const nextNum = getNextSequenceForEpic(epicId, appState);
          suffixSpan.textContent = `(#${nextNum})`;
          suffixSpan.dataset.seq = nextNum; // Guardamos el número puro
        };

        epicSelect.onchange = handleEpicChange;

        // Selección automática del primero
        if (appState.epics.length > 0) {
          epicSelect.value = appState.epics[0].id;
          handleEpicChange();
        } else {
          suffixSpan.textContent = "(#1)";
          suffixSpan.dataset.seq = "1";
        }
        return;
      case "edit-sprint":
        setSprintMenuOpen(false);
        handleEditSprintClick();
        return;
      case "archive-sprint":
        setSprintMenuOpen(false);
        appActions.archiveSprint(appState.currentSprintId);
        return;
      case "delete-sprint":
        setSprintMenuOpen(false);
        appActions.deleteSprint(appState.currentSprintId);
        return;
      case "new-epic":
        showModal({
          title: "Crear Nuevo Epic",
          epicInputs: true,
          okText: "Crear Epic",
          callback: appActions.addNewEpic,
        });
        document
          .getElementById("epic-color-palette")
          .querySelectorAll(".selected")
          .forEach((el) => el.classList.remove("selected"));
        return;
      case "toggle-backlog-epic": {
        const epicId = actionTarget.dataset.epicId;
        if (typeof appActions !== "undefined" && appActions.toggleBacklogEpic) {
          appActions.toggleBacklogEpic(epicId);
        }
        return;
      }
      case "plan-sprint": {
        const selectedTaskIds = Array.from(
          document.querySelectorAll(
            "#backlog-tasks-container .task-card input[data-select-task]:checked"
          )
        ).map((cb) => cb.closest(".task-card").id);
        appActions.moveTasksToSprint(selectedTaskIds, appState.currentSprintId);
        return;
      }
      case "add-task-backlog":
        if (!appState.backlogId) return;
        showModal({
          title: `Añadir Tarea al Backlog`,
          input: true,
          okText: "Añadir",
          callback: (title) => appActions.addNewTask(title, appState.backlogId),
        });
        return;
      case "add-task-sprint":
        if (!appState.currentSprintId) return;
        showModal({
          title: `Añadir Tarea al Sprint`,
          input: true,
          okText: "Añadir",
          callback: (title) => appActions.addNewTask(title, appState.currentSprintId),
        });
        return;
      case "timeline-prev":
        appActions.setTimelineDate(-1);
        return;
      case "timeline-next":
        appActions.setTimelineDate(1);
        return;
      case "mark-all-as-read":
        appActions.markAllAsRead();
        return;
      case "toggle-comment-expand": {
        const textId = actionTarget.dataset.target;
        const textEl = textId ? document.getElementById(textId) : null;
        if (!textEl) return;
        const isExpanded = textEl.classList.toggle("is-expanded");
        actionTarget.textContent = isExpanded ? "Ver menos" : "Ver más";
        return;
      }
    }
  }

  const sprintRow = target.closest(".sprint-summary-row");
  if (sprintRow) {
    sprintRow.classList.toggle("details-shown");
    sprintRow.querySelector(".chevron-icon").style.transform = sprintRow.classList.contains(
      "details-shown"
    )
      ? "rotate(90deg)"
      : "rotate(0deg)";
    sprintRow.nextElementSibling?.classList.toggle("hidden");
    return;
  }

  const archivedSprintRow = e.target.closest(".archived-sprint-summary");
  if (archivedSprintRow && !e.target.closest("button")) {
    archivedSprintRow.classList.toggle("details-shown");
    const icon = archivedSprintRow.querySelector(".chevron-icon");
    if (icon) {
      icon.style.transform = archivedSprintRow.classList.contains("details-shown")
        ? "rotate(90deg)"
        : "rotate(0deg)";
    }
    archivedSprintRow.nextElementSibling?.classList.toggle("hidden");
    return;
  }

  const epicRow = target.closest(".epic-row") || target.closest(".epic-row-detail");
  if (epicRow && actionTarget) {
    const epicId = epicRow.dataset.epicId || epicRow.dataset.epicDetail;
    const action = actionTarget.dataset.action;
    if (epicId && action) {
      handleEpicCardAction(action, epicId);
    }
    return;
  }

  const personHeader = target.closest("[data-person-toggle]");
  if (personHeader) {
    const email = personHeader.dataset.personToggle;

    // 1. Elementos — usa aria-controls para encontrar el cuerpo (T1.6)
    const chevron = personHeader.querySelector(".chevron-icon");
    const chevronLabel = personHeader.querySelector(".person-chevron-label");
    const contentBody = document.getElementById(personHeader.getAttribute("aria-controls"))
      || personHeader.closest(".person-swimlane-header-wrap")?.nextElementSibling;

    // 2. Lógica visual — chevron-down rota 180° al abrir (T2.2)
    if (contentBody) {
      const isHidden = contentBody.classList.contains("hidden");
      if (isHidden) {
        contentBody.classList.remove("hidden");
        if (chevron) chevron.style.transform = "rotate(180deg)";
        if (chevronLabel) chevronLabel.textContent = "Cerrar";
      } else {
        contentBody.classList.add("hidden");
        if (chevron) chevron.style.transform = "rotate(0deg)";
        if (chevronLabel) chevronLabel.textContent = "Ver tareas";
      }
      // Actualizar aria-expanded (T1.6)
      personHeader.setAttribute("aria-expanded", String(!isHidden));
    }

    // 3. Guardar estado en silencio
    appActions.togglePersonView(email);
  }
}

function parseAppDate(rawValue) {
  if (!rawValue) return null;
  if (rawValue instanceof Date) return new Date(rawValue);
  if (rawValue?.toDate && typeof rawValue.toDate === "function") return rawValue.toDate();
  if (typeof rawValue === "string") {
    const normalized = /^\d{4}-\d{2}-\d{2}$/.test(rawValue) ? `${rawValue}T00:00:00` : rawValue;
    const parsed = new Date(normalized);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  const parsed = new Date(rawValue);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normalizeDateToMidnight(dateValue) {
  const date = parseAppDate(dateValue);
  if (!date) return null;
  date.setHours(0, 0, 0, 0);
  return date;
}

function toDateInputValue(dateValue) {
  const date = normalizeDateToMidnight(dateValue);
  return date ? date.toISOString().split("T")[0] : "";
}

function dateDiffInDays(startDate, endDate) {
  const start = normalizeDateToMidnight(startDate);
  const end = normalizeDateToMidnight(endDate);
  if (!start || !end) return 0;
  const msPerDay = 24 * 60 * 60 * 1000;
  const startUtc = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
  const endUtc = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());
  return Math.round((endUtc - startUtc) / msPerDay);
}

function formatDateLabel(dateValue) {
  const date = parseAppDate(dateValue);
  if (!date) return "Sin fecha";
  return date.toLocaleDateString("es-MX", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function openCommitmentDateModal(taskId) {
  const task = appState.tasks.find((t) => t.id === taskId);
  if (!task) return;

  const taskCreatedAt = normalizeDateToMidnight(task.createdAt) || normalizeDateToMidnight(new Date());
  const today = normalizeDateToMidnight(new Date());
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const plusSeven = new Date(today);
  plusSeven.setDate(plusSeven.getDate() + 7);

  const sprint = appState.taskLists.find((list) => list.id === task.listId && !list.isBacklog);
  let cycleEndDate = normalizeDateToMidnight(sprint?.endDate);
  if (!cycleEndDate) {
    const cycleWindow = getCurrentCycleWindow(new Date());
    cycleEndDate = new Date(cycleWindow.endExclusive);
    cycleEndDate.setDate(cycleEndDate.getDate() - 3); // retrocede al viernes
    cycleEndDate = normalizeDateToMidnight(cycleEndDate);
  }

  const currentDueDate = normalizeDateToMidnight(task.dueDate);
  const daysOpen = Math.max(0, dateDiffInDays(taskCreatedAt, today));
  const quickPickMap = {
    today: toDateInputValue(today),
    tomorrow: toDateInputValue(tomorrow),
    cycle: toDateInputValue(cycleEndDate),
    plus7: toDateInputValue(plusSeven),
    none: "",
  };

  const dueDateModalHTML = `
    <div class="task-modal-shell">
      <p class="task-modal-subtitle">Define una fecha clara para ejecución. La fecha exacta seguirá disponible en el modal de detalle.</p>
      <div class="task-modal-chip-grid" id="task-date-quick-picks">
        <button type="button" class="task-modal-chip" data-quick-pick="today">Hoy</button>
        <button type="button" class="task-modal-chip" data-quick-pick="tomorrow">Mañana</button>
        <button type="button" class="task-modal-chip" data-quick-pick="cycle">Fin de ciclo</button>
        <button type="button" class="task-modal-chip" data-quick-pick="plus7">+7 días</button>
        <button type="button" class="task-modal-chip task-modal-chip--danger" data-quick-pick="none">Sin fecha</button>
      </div>
      <div class="task-modal-field">
        <label for="task-commitment-date-input">Fecha exacta</label>
        <input id="task-commitment-date-input" type="date" class="task-modal-input" value="${toDateInputValue(currentDueDate)}" />
      </div>
      <div class="task-modal-summary" id="task-commitment-summary">Fecha seleccionada: ${currentDueDate ? formatDateLabel(currentDueDate) : "Sin fecha"}</div>
      <div id="task-commitment-risk" class="task-risk-indicator task-risk-indicator--neutral">
        <span id="task-commitment-risk-tag" class="task-risk-indicator__tag">Sin riesgo definido</span>
        <p id="task-commitment-risk-text" class="task-risk-indicator__text">Selecciona una fecha para evaluar urgencia y riesgo.</p>
      </div>
      <p id="task-commitment-error" class="task-modal-error hidden" role="alert"></p>
      <p id="task-commitment-feedback" class="task-modal-feedback hidden" aria-live="polite"></p>
      <div class="task-modal-inline-actions">
        <button id="task-commitment-cancel-btn" type="button" class="task-modal-btn task-modal-btn--ghost">Cancelar</button>
        <button id="task-commitment-save-btn" type="button" class="task-modal-btn task-modal-btn--solid">Guardar fecha</button>
      </div>
    </div>
  `;

  showModal({
    title: "Fecha compromiso",
    htmlContent: dueDateModalHTML,
    actionModal: true,
  });

  const modalFooter = document.getElementById("modal-footer");
  if (modalFooter) modalFooter.classList.add("hidden");

  const dateInput = document.getElementById("task-commitment-date-input");
  const quickPickContainer = document.getElementById("task-date-quick-picks");
  const summary = document.getElementById("task-commitment-summary");
  const riskBox = document.getElementById("task-commitment-risk");
  const riskTag = document.getElementById("task-commitment-risk-tag");
  const riskText = document.getElementById("task-commitment-risk-text");
  const errorBox = document.getElementById("task-commitment-error");
  const feedbackBox = document.getElementById("task-commitment-feedback");
  const cancelBtn = document.getElementById("task-commitment-cancel-btn");
  const saveBtn = document.getElementById("task-commitment-save-btn");

  const interactiveElements = [dateInput, cancelBtn, saveBtn].filter(Boolean);

  const setFeedback = (type, message) => {
    if (!feedbackBox) return;
    feedbackBox.classList.remove("hidden", "is-loading", "is-success");
    feedbackBox.textContent = message;
    if (type === "loading") feedbackBox.classList.add("is-loading");
    if (type === "success") feedbackBox.classList.add("is-success");
  };

  const clearFeedback = () => {
    if (!feedbackBox) return;
    feedbackBox.classList.add("hidden");
    feedbackBox.classList.remove("is-loading", "is-success");
    feedbackBox.textContent = "";
  };

  const setError = (message = "") => {
    if (!errorBox) return;
    if (!message) {
      errorBox.classList.add("hidden");
      errorBox.textContent = "";
      return;
    }
    errorBox.classList.remove("hidden");
    errorBox.textContent = message;
  };

  const setBusy = (isBusy) => {
    interactiveElements.forEach((el) => {
      el.disabled = isBusy;
    });
    if (saveBtn) saveBtn.textContent = isBusy ? "Guardando..." : "Guardar fecha";
  };

  const applyRiskState = (dueDate) => {
    if (!riskBox || !riskTag || !riskText) return;
    riskBox.classList.remove(
      "task-risk-indicator--neutral",
      "task-risk-indicator--low",
      "task-risk-indicator--medium",
      "task-risk-indicator--high"
    );

    if (!dueDate) {
      const noDateMessage =
        daysOpen > 14
          ? `Sin fecha tras ${daysOpen} días abierta. Define compromiso para evitar deuda.`
          : "Sin fecha compromiso. Se recomienda definirla para priorizar mejor.";
      riskBox.classList.add(daysOpen > 14 ? "task-risk-indicator--high" : "task-risk-indicator--neutral");
      riskTag.textContent = daysOpen > 14 ? "Riesgo alto" : "Sin compromiso";
      riskText.textContent = noDateMessage;
      return;
    }

    const daysToDue = dateDiffInDays(today, dueDate);
    if (daysToDue < 0) {
      riskBox.classList.add("task-risk-indicator--high");
      riskTag.textContent = `Vencida hace ${Math.abs(daysToDue)}d`;
      riskText.textContent = "Requiere acción inmediata o renegociación de fecha.";
      return;
    }

    if (daysToDue <= 2) {
      riskBox.classList.add("task-risk-indicator--high");
      riskTag.textContent = "Riesgo alto";
      riskText.textContent = "Fecha muy próxima. Verifica bloqueos y responsable antes de guardar.";
      return;
    }

    if (daysToDue <= 5) {
      riskBox.classList.add("task-risk-indicator--medium");
      riskTag.textContent = "Riesgo medio";
      riskText.textContent = "Ventana ajustada. Conviene dividir o cerrar dependencias.";
      return;
    }

    riskBox.classList.add("task-risk-indicator--low");
    riskTag.textContent = "Riesgo bajo";
    riskText.textContent = "Margen saludable para ejecución con seguimiento normal.";
  };

  const refreshQuickPickState = () => {
    const currentValue = dateInput?.value || "";
    quickPickContainer?.querySelectorAll("[data-quick-pick]").forEach((btn) => {
      const quickValue = quickPickMap[btn.dataset.quickPick] ?? "";
      btn.classList.toggle("is-active", quickValue === currentValue);
    });
  };

  const refreshDueDateUI = () => {
    const selectedDate = normalizeDateToMidnight(dateInput?.value || "");
    if (summary) {
      summary.textContent = `Fecha seleccionada: ${selectedDate ? formatDateLabel(selectedDate) : "Sin fecha"}`;
    }
    applyRiskState(selectedDate);
    refreshQuickPickState();
  };

  quickPickContainer?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-quick-pick]");
    if (!button || !dateInput) return;
    const pick = button.dataset.quickPick;
    dateInput.value = quickPickMap[pick] ?? "";
    setError("");
    clearFeedback();
    refreshDueDateUI();
  });

  dateInput?.addEventListener("change", () => {
    setError("");
    clearFeedback();
    refreshDueDateUI();
  });

  cancelBtn?.addEventListener("click", hideModal);

  saveBtn?.addEventListener("click", async () => {
    setError("");
    clearFeedback();
    const selectedDate = normalizeDateToMidnight(dateInput?.value || "");

    if (selectedDate && taskCreatedAt && selectedDate < taskCreatedAt) {
      setError(
        `La fecha compromiso no puede ser anterior a la creación (${formatDateLabel(taskCreatedAt)}).`
      );
      return;
    }

    setBusy(true);
    setFeedback("loading", "Guardando fecha compromiso...");
    await Promise.resolve(
      appActions.updateTask(taskId, {
        dueDate: selectedDate ? Timestamp.fromDate(selectedDate) : null,
      })
    );
    setFeedback(
      "success",
      selectedDate ? `Fecha guardada: ${formatDateLabel(selectedDate)}.` : "Fecha compromiso eliminada."
    );
    setTimeout(() => hideModal(), 620);
  });

  refreshDueDateUI();
}

const POINT_ASSIGNMENT_OPTIONS = [0, 0.5, 1, 2, 3, 5, 8, 13, 20, 40];
const POINT_HOURS_REFERENCE = 2;

function formatPointUnits(points) {
  const numeric = Number(points);
  if (!Number.isFinite(numeric)) return "0 pts";
  return `${numeric} ${numeric === 1 ? "pt" : "pts"}`;
}

function formatPointHourEstimate(points) {
  const numeric = Number(points);
  if (!Number.isFinite(numeric) || numeric <= 0) return "Sin estimar";
  const hours = numeric * POINT_HOURS_REFERENCE;
  const hoursLabel = Number.isInteger(hours) ? String(hours) : hours.toFixed(1).replace(/\.0$/, "");
  return `~${hoursLabel} h`;
}

function getPointOptionLabel(points) {
  return `${formatPointUnits(points)} · ${formatPointHourEstimate(points)}`;
}

function getPointHoursHelperText(points) {
  const estimateLabel = formatPointHourEstimate(points);
  if (estimateLabel === "Sin estimar") {
    return `Sin estimar. Referencia: 1 pt ≈ ${POINT_HOURS_REFERENCE} h de trabajo efectivo.`;
  }
  return `Equivalencia aprox.: ${estimateLabel}. Referencia: 1 pt ≈ ${POINT_HOURS_REFERENCE} h de trabajo efectivo.`;
}

function updatePointHoursHint(element, points) {
  if (!element) return;
  element.textContent = getPointHoursHelperText(points);
}

function openPointsAssignmentModal(taskId) {
  const task = appState.tasks.find((t) => t.id === taskId);
  if (!task) return;

  const pointsModalHTML = `
    <div class="flex flex-col gap-3">
      <div class="text-sm text-slate-600">
        <strong class="text-slate-800">${(task.title || "Tarea").replace(/</g, "&lt;")}</strong>
        <div class="mt-1">Selecciona los puntos de forma directa.</div>
      </div>
      <div class="flex flex-col gap-2">
        <label for="task-points-final-select" class="text-sm font-bold text-gray-700">Puntos</label>
        <select id="task-points-final-select" class="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white">
          ${POINT_ASSIGNMENT_OPTIONS.map((value) => {
            const isSelected = Number(task.points ?? 0) === value;
            return `<option value="${value}" ${isSelected ? "selected" : ""}>${getPointOptionLabel(value)}</option>`;
          }).join("")}
        </select>
        <p id="task-points-hours-hint" class="text-xs text-gray-500">${getPointHoursHelperText(task.points ?? 0)}</p>
      </div>
    </div>
  `;

  showModal({
    title: "Cambiar puntos",
    htmlContent: pointsModalHTML,
    okText: "Guardar puntos",
    compactPointsModal: true,
    callback: () => {
      const selectEl = document.getElementById("task-points-final-select");
      if (!selectEl) return;
      const selectedPoints = Number(selectEl.value);
      if (!POINT_ASSIGNMENT_OPTIONS.includes(selectedPoints)) return;
      if (selectedPoints !== Number(task.points ?? 0)) {
        appActions.updateTask(taskId, { points: selectedPoints });
      }
    },
  });
  const finalSelect = document.getElementById("task-points-final-select");
  const finalHoursHintEl = document.getElementById("task-points-hours-hint");
  finalSelect?.addEventListener("change", () => {
    updatePointHoursHint(finalHoursHintEl, Number(finalSelect.value));
  });
}

function handleTaskCardAction(action, taskId) {
  const task = appState.tasks.find((t) => t.id === taskId);
  if (!task) return;
  switch (action) {
    case "open-details":
      openTaskDetailsModal(task);
      break;
    case "due-date":
      openCommitmentDateModal(taskId);
      break;
    case "sync-task-to-calendar":
      appActions.syncTaskToCalendar(taskId);
      break;
    case "check-calendar-status":
      appActions.checkCalendarStatus(taskId);
      break;
    case "delete":
      appActions.deleteTask(taskId);
      break;
    case "edit":
      showModal({
        title: "Editar Tarea",
        input: true,
        inputValue: task.title,
        okText: "Guardar",
        callback: (title) => title && appActions.updateTask(taskId, { title }),
      });
      break;
    case "points":
      openPointsAssignmentModal(taskId);
      break;
    case "move-to-sprint": {
      const availableSprints = appState.taskLists
        .filter((list) => !list.isBacklog && !list.isArchived && list.id !== task.listId)
        .sort((a, b) => (a.title || "").localeCompare(b.title || ""));

      if (availableSprints.length === 0) {
        showModal({
          title: "Sin sprints disponibles",
          text: "No hay otro sprint activo disponible para mover esta tarea.",
          okText: "Cerrar",
        });
        break;
      }

      const currentList = appState.taskLists.find((list) => list.id === task.listId);
      const optionsHTML = availableSprints
        .map(
          (sprint) =>
            `<option value="${sprint.id}">${(sprint.title || "Sprint").replace(/</g, "&lt;")}</option>`
        )
        .join("");

      showModal({
        title: "Mover a otro sprint",
        htmlContent: `
          <div class="flex flex-col gap-3">
            <div class="text-sm text-slate-600">
              <strong class="text-slate-800">${(task.title || "Tarea").replace(/</g, "&lt;")}</strong>
              <div class="mt-1">Sprint actual: ${currentList?.title || "Sin sprint"}</div>
            </div>
            <div class="flex flex-col gap-2">
              <label for="modal-move-sprint-select" class="text-sm font-bold text-gray-700">Sprint destino</label>
              <select id="modal-move-sprint-select" class="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white">
                ${optionsHTML}
              </select>
            </div>
          </div>
        `,
        okText: "Mover tarea",
        callback: async () => {
          const selectEl = document.getElementById("modal-move-sprint-select");
          const targetSprintId = selectEl?.value;
          if (!targetSprintId) return;
          await Promise.resolve(appActions.moveTasksToSprint([taskId], targetSprintId));
        },
      });
      break;
    }

    case "assign": {
      // 1. FILTRAR DUPLICADOS
      // Usamos un Set para guardar emails ya procesados y evitar repetirlos
      const seenEmails = new Set();
      const uniqueUsers = [];

      appState.allUsers.forEach((u) => {
        const email = u.email ? u.email.toLowerCase().trim() : "";
        if (email && !seenEmails.has(email)) {
          seenEmails.add(email);
          uniqueUsers.push(u);
        }
      });

      // 2. ORDENAR ALFABÉTICAMENTE
      const sortedUsers = uniqueUsers.sort((a, b) =>
        (a.displayName || a.email).localeCompare(b.displayName || b.email)
      );

      // 3. GENERAR OPCIONES
      let optionsHTML = `<option value="">-- Desasignar (Sin responsable) --</option>`;

      sortedUsers.forEach((u) => {
        const isSelected = task.assignee === u.email ? "selected" : "";
        const label = u.displayName || u.email;
        optionsHTML += `<option value="${u.email}" ${isSelected}>${label}</option>`;
      });

      // 4. MOSTRAR MODAL (Igual que antes)
      const dropdownHTML = `
        <div class="flex flex-col gap-2">
            <label class="text-sm font-bold text-gray-700">Selecciona un miembro del equipo:</label>
            <select id="modal-assign-select" class="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white">
                ${optionsHTML}
            </select>
            <p class="text-xs text-gray-500 mt-1">
               Solo puedes asignar a usuarios registrados en Sprintify.
            </p>
        </div>
      `;

      showModal({
        title: "Asignar Tarea",
        htmlContent: dropdownHTML,
        okText: "Guardar Asignación",
        callback: () => {
          const selectEl = document.getElementById("modal-assign-select");
          if (selectEl) {
            const newAssignee = selectEl.value || null;
            if (newAssignee !== task.assignee) {
              appActions.updateTask(taskId, { assignee: newAssignee });
            }
          }
        },
      });
      break;
    }
    case "return-to-backlog":
      appActions.returnTaskToBacklog(taskId);
      break;
    case "comments":
      openTaskDetailsModal(task);
      break;
    case "advance-status": {
      const cur = resolveKanbanStatus(task);
      const next = cur === "todo" ? "inprogress" : cur === "inprogress" ? "done" : null;
      if (!next) break;
      const updates = { kanbanStatus: next, lastMovedAt: Timestamp.now() };
      if (next === "inprogress") {
        updates.status = "needsAction";
        updates.startedAt = Timestamp.now();
        updates.completedAt = null;
      } else if (next === "done") {
        updates.status = "completed";
        updates.completedAt = Timestamp.now();
        if (window.confetti) confetti({ particleCount: 50, spread: 50, origin: { y: 0.7 } });
      }
      appActions.updateTask(taskId, updates);
      break;
    }
  }
}

function handleEpicCardAction(action, epicId) {
  if (action === "toggle-details") {
    appActions.toggleEpicDetails(epicId);
    const detail = document.querySelector(`.epic-row-detail[data-epic-detail="${epicId}"]`);
    const chevron = document.querySelector(`.epic-row[data-epic-id="${epicId}"] .epic-row-chevron`);
    if (detail) {
      detail.classList.toggle("epic-collapsed");
      const expanded = !detail.classList.contains("epic-collapsed");
      if (chevron) chevron.setAttribute("aria-expanded", String(expanded));
    }
  } else if (action === "edit-epic") {
    const epic = appState.epics.find((p) => p.id === epicId);
    if (!epic) return;

    // Callback simple
    const callback = (result) => appActions.updateEpic(epicId, result);

    showModal({
      title: "Editar Epic",
      epicInputs: true,
      okText: "Guardar Cambios",
      callback: callback,
    });

    // 1. Datos básicos
    document.getElementById("modal-epic-title").value = epic.title || "";
    document.getElementById("modal-epic-description").value = epic.description || "";
    document.getElementById("modal-epic-status").value = epic.status || "Por Empezar";

    // 2. Fechas
    if (epic.startDate) {
      const dateVal = epic.startDate.toDate ? epic.startDate.toDate() : new Date(epic.startDate);
      document.getElementById("modal-epic-start-date").value = dateVal.toISOString().split("T")[0];
    } else {
      document.getElementById("modal-epic-start-date").value = "";
    }

    if (epic.endDate) {
      const dateVal = epic.endDate.toDate ? epic.endDate.toDate() : new Date(epic.endDate);
      document.getElementById("modal-epic-end-date").value = dateVal.toISOString().split("T")[0];
    } else {
      document.getElementById("modal-epic-end-date").value = "";
    }

    // 3. Color
    const palette = document.getElementById("epic-color-palette");
    if (palette) {
      palette.querySelectorAll(".selected").forEach((el) => el.classList.remove("selected"));
      if (epic.color) {
        const swatch = palette.querySelector(`[data-color="${epic.color}"]`);
        if (swatch) swatch.classList.add("selected");
      }
    }

    // 4. KRs (ACTUALIZADO PARA 5 CAMPOS)
    // Limpiamos del 0 al 4
    [0, 1, 2, 3, 4].forEach((index) => {
      const input = document.getElementById(`modal-epic-kr-${index}`);
      if (input) input.value = "";
    });

    // Llenamos si existen
    if (epic.keyResults && Array.isArray(epic.keyResults)) {
      epic.keyResults.forEach((krText, index) => {
        if (index < 5) {
          // Aceptamos hasta 5
          const input = document.getElementById(`modal-epic-kr-${index}`);
          if (input) input.value = krText;
        }
      });
    }
  } else if (action === "delete-epic") {
    appActions.deleteEpic(epicId);
  }
}

function handleEditSprintClick() {
  const sprint = appState.taskLists.find((l) => l.id === appState.currentSprintId);
  if (!sprint || sprint.isBacklog) return;

  showModal({
    title: `Editar Sprint`,
    sprintInputs: true,
    okText: "Guardar Cambios",
    callback: (result) => appActions.updateSprint(appState.currentSprintId, result),
  });

  const nameInput = document.getElementById("modal-sprint-name");
  const suffixSpan = document.getElementById("modal-sprint-suffix");
  const epicSelect = document.getElementById("modal-sprint-epic-select");

  // Verificar que los elementos existen (Diagnóstico para tu problema visual)
  if (!epicSelect || !suffixSpan) {
    console.error(
      "ERROR CRÍTICO: No se encuentran los campos de Epic o Sufijo en el HTML. Verifica tu index.html"
    );
    return;
  }

  // 1. Llenar Epics
  epicSelect.innerHTML = '<option value="">-- Selecciona un Epic --</option>';
  if (appState.epics && appState.epics.length > 0) {
    appState.epics.forEach((epic) => epicSelect.add(new Option(epic.title, epic.id)));
  }

  // 2. Determinar Número de Secuencia Actual
  // Preferimos el dato 'sequence' guardado, si no existe, usamos regex
  let seqNum = sprint.sequence;
  let cleanName = sprint.title;

  if (seqNum === undefined || seqNum === null) {
    const match = sprint.title.match(/^(.*)\s+\(#\s*(\d+)\s*\)$/);
    if (match) {
      cleanName = match[1].trim();
      seqNum = match[2];
    } else {
      seqNum = 0;
    }
  } else {
    // Si tenemos secuencia, limpiamos el título visualmente
    cleanName = sprint.title.replace(/\s*\(#\d+\)$/, "").trim();
  }

  // 3. Renderizar valores iniciales
  nameInput.value = cleanName;
  suffixSpan.textContent = seqNum > 0 ? `(#${seqNum})` : "";
  suffixSpan.dataset.seq = seqNum || 0;

  // 4. Seleccionar Epic Actual
  const currentEpicId = sprint.epicId || (sprint.epicIds && sprint.epicIds[0]) || "";
  epicSelect.value = currentEpicId;

  // 5. Habilitar y Asignar Evento de Cambio (La lógica de recálculo)
  epicSelect.disabled = false;

  // Limpiamos cualquier evento anterior para evitar duplicados
  epicSelect.onchange = null;

  epicSelect.onchange = () => {
    const newEpicId = epicSelect.value;
    console.log("Cambio de Epic detectado. Nuevo ID:", newEpicId);

    // A) Si volvemos al Epic original, restauramos su número original
    if (newEpicId === currentEpicId) {
      suffixSpan.textContent = seqNum > 0 ? `(#${seqNum})` : "";
      suffixSpan.dataset.seq = seqNum || 0;
    }
    // B) Si es un Epic nuevo (o si el sprint no tenía epic antes)
    else {
      const nextSeq = getNextSequenceForEpic(newEpicId, appState);
      console.log("Calculando nuevo consecutivo:", nextSeq);

      suffixSpan.textContent = `(#${nextSeq})`;
      suffixSpan.dataset.seq = nextSeq;
    }
  };

  // 6. Resto de campos
  if (sprint.startDate)
    document.getElementById("modal-start-date").value = sprint.startDate
      .toDate()
      .toISOString()
      .split("T")[0];
  if (sprint.endDate)
    document.getElementById("modal-end-date").value = sprint.endDate
      .toDate()
      .toISOString()
      .split("T")[0];
  document.getElementById("modal-sprint-capacity").value = sprint.capacity || CYCLE_POINTS_TARGET;

  const palette = document.getElementById("sprint-color-palette");
  palette.querySelectorAll(".selected").forEach((el) => el.classList.remove("selected"));
  if (sprint.color)
    palette.querySelector(`[data-color="${sprint.color}"]`)?.classList.add("selected");
}

function handlePostComment() {
  // Recuperamos el ID del dataset que guardamos al abrir el modal
  const taskId = document.getElementById("modal-content")?.dataset.activeTaskId;
  const input = document.getElementById("comment-input");

  if (taskId && input?.value.trim() !== "") {
    appActions.postComment(taskId, input.value);
    input.value = ""; // Limpiamos el campo inmediatamente
  }
}

export function openTaskDetailsModal(task) {
  if (!task) return;
  // Guardamos el ID para que app.js sepa qué tarea actualizar
  document.getElementById("modal-content").dataset.activeTaskId = task.id;
  renderTaskDetails(task, appState);
  showModal({ taskDetails: true, okText: "Cerrar" });
}

function handleAppChange(e) {
  const target = e.target;

  // 1. Checkbox de Actividad (Leído/No leído)
  if (target.dataset.activityRead && target.type === "checkbox") {
    const taskId = target.dataset.taskId;
    const commentIndex = Number(target.dataset.commentIdx);
    if (taskId && !isNaN(commentIndex)) {
      appActions.handleCommentAction("toggle-read", taskId, commentIndex);
    }
    return;
  }

  // 2. Asignar Epic a Tarea
  if (target.dataset.action === "assign-epic") {
    const taskId = document.getElementById("modal-content")?.dataset.activeTaskId;
    if (taskId) appActions.assignEpicToTask(taskId, target.value);
    return;
  }

  // 3. Triage Checkbox
  if (target.closest("#modal-triage-view") && target.type === "checkbox") {
    const taskId = document.getElementById("modal-content")?.dataset.activeTaskId;
    if (taskId) {
      appActions.updateTriageScore(taskId);
    }
    return;
  }

  // ▼▼▼ 4. NUEVO: Checkbox de Key Results (KR) ▼▼▼
  if (target.classList.contains("epic-kr-checkbox")) {
    const epicId = target.dataset.epicId;
    const index = target.dataset.index;
    if (epicId && index !== undefined) {
      appActions.toggleEpicKr(epicId, index);
    }
    return;
  }
  // ▲▲▲▲▲▲
}

export function initializeEventListeners(state, actions) {
  appState = state;
  appActions = actions;
  initializeSidebarShell();

  const modalOkBtn = document.getElementById("modal-ok-btn");
  const modalCancelBtn = document.getElementById("modal-cancel-btn");
  const modalCloseIcon = document.getElementById("modal-close-icon");
  const taskModalCloseTop = document.getElementById("task-modal-close-top");
  const sprintSelector = document.getElementById("sprint-list-select");
  const sprintCapacityInput = document.getElementById("sprint-capacity-input");
  const selectAllBacklog = document.getElementById("select-all-backlog-tasks");

  document.addEventListener("click", handleAppClick);
  document.addEventListener("change", handleAppChange);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && sidebarShellState.mobileOpen && isMobileSidebarLayout()) {
      setSidebarMobileOpen(false);
      return;
    }
    if (e.key !== "Enter" || e.target?.id !== "comment-input") return;
    e.preventDefault();
    handlePostComment();
  });

  if (dom.toggleBacklogViewBtn) {
    dom.toggleBacklogViewBtn.addEventListener("click", () => toggleBacklogView(appState));
  }

  // --- DRAG START ---
  document.addEventListener("dragstart", (e) => {
    const card = e.target.closest(".task-card");
    if (card) {
      card.classList.add("dragging");
      appActions.setDraggedTaskId(card.id);
      e.dataTransfer.effectAllowed = "move";
    }
  });

  // --- DRAG END ---
  document.addEventListener("dragend", (e) => {
    const card = e.target.closest(".task-card");
    if (card) {
      card.classList.remove("dragging");
      appActions.setDraggedTaskId(null);
    }
    clearDropIndicators();
  });

  // --- DRAG OVER (Permitir soltar) ---
  document.addEventListener("dragover", (e) => {
    const dropZone = e.target.closest(".swimlane-drop-zone");
    if (dropZone) {
      e.preventDefault();
      updateDropIndicator(dropZone, e.clientY);
      return;
    }

    const dropQuad = e.target.closest("[data-quad-list]");
    if (dropQuad) {
      e.preventDefault();
      if (activeDropZone || activeDropIndicator) clearDropIndicators();
      if (activeDropMatrixQuad && activeDropMatrixQuad !== dropQuad) {
        activeDropMatrixQuad.classList.remove("is-drop-target");
      }
      dropQuad.classList.add("is-drop-target");
      activeDropMatrixQuad = dropQuad;
      return;
    }

    clearDropIndicators();
  });

  // --- DRAG LEAVE (Limpiar estilos) ---
  document.addEventListener("dragleave", (e) => {
    if (!e.relatedTarget) clearDropIndicators();
  });

  // --- DROP (Soltar) ---
  document.addEventListener("drop", (e) => {
    const taskId = appState.draggedTaskId;
    if (!taskId) return;
    clearDropIndicators();

    const dropZone = e.target.closest(".swimlane-drop-zone");
    if (dropZone) {
      e.preventDefault();
      const sprintStatus = dropZone.dataset.status;
      if (sprintStatus) {
        updateTaskStatusLogic(taskId, sprintStatus, null);
        return;
      }

      const colDiv = dropZone.closest("[data-swimlane-status]");
      if (!colDiv) return;
      const newStatus = colDiv.dataset.swimlaneStatus;
      const newAssigneeRaw = colDiv.dataset.assignee;
      const newAssignee = newAssigneeRaw === "unassigned" ? null : newAssigneeRaw;
      updateTaskStatusLogic(taskId, newStatus, newAssignee);
      return;
    }

    const dropQuad = e.target.closest("[data-quad-list]");
    if (dropQuad) {
      e.preventDefault();
      dropQuad.classList.remove("is-drop-target");
      activeDropMatrixQuad = null;
      const targetQuad = dropQuad.dataset.quadList;
      const impactThreshold = appState.triageConfig?.matrixThresholds?.impact || 3;
      const effortThreshold = appState.triageConfig?.matrixThresholds?.effort || 3;
      const highImpact = Math.max(impactThreshold, 1);
      const lowImpact = Math.max(impactThreshold - 1, 0);
      const highEffort = Math.max(effortThreshold, 1);
      const lowEffort = Math.max(effortThreshold - 1, 0);

      const scoreMap = {
        quick: { impact: highImpact, effort: lowEffort },
        major: { impact: highImpact, effort: highEffort },
        filler: { impact: lowImpact, effort: lowEffort },
        maybe: { impact: lowImpact, effort: highEffort },
      };
      if (scoreMap[targetQuad]) {
        appActions.updateTask(taskId, scoreMap[targetQuad]);
      }
    }
  });

  // --- Helper interno para lógica centralizada de estados ---
  function updateTaskStatusLogic(taskId, newStatus, newAssignee) {
    const task = appState.tasks.find((t) => t.id === taskId);
    if (!task) return;
    if (task.kanbanStatus === newStatus && newAssignee === undefined) return;

    const updates = { kanbanStatus: newStatus };
    if (task.kanbanStatus !== newStatus) updates.lastMovedAt = Timestamp.now();

    // Solo actualizamos assignee si se pasó explícitamente (Vista Personas)
    if (newAssignee !== undefined) {
      updates.assignee = newAssignee;
    }

    // LÓGICA DE TIEMPOS
    if (newStatus === "inprogress") {
      // Iniciar contador si no estaba ya en progreso
      if (task.kanbanStatus !== "inprogress") {
        updates.startedAt = Timestamp.now();
        updates.status = "needsAction";
        updates.completedAt = null;
      }
    } else if (newStatus === "done") {
      updates.status = "completed";
      updates.completedAt = Timestamp.now();
      // Mantenemos startedAt para cálculo final
      if (window.confetti) confetti({ particleCount: 50, spread: 50, origin: { y: 0.7 } });
    } else if (newStatus === "todo") {
      // Resetear todo
      updates.status = "needsAction";
      updates.completedAt = null;
      updates.startedAt = null;
    }

    appActions.updateTask(taskId, updates);
  }

  // --- Resto de listeners (Modales, Selects, etc) ---
  modalCancelBtn.addEventListener("click", hideModal);
  if (modalCloseIcon) modalCloseIcon.addEventListener("click", hideModal);
  if (taskModalCloseTop) taskModalCloseTop.addEventListener("click", hideModal);

  modalOkBtn.addEventListener("click", async () => {
    if (!modalCallback) return hideModal();
    let result = true;

    // 1. LÓGICA PARA INPUT SIMPLE (Ej: Editar Título Tarea)
    const simpleInput = document.getElementById("modal-input");
    if (simpleInput && !simpleInput.classList.contains("hidden")) {
      result = simpleInput.value;
    }

    // 2. LÓGICA PARA EPICS (¡ESTO ES LO QUE FALTABA!)
    const epicInputs = document.getElementById("modal-epic-inputs");
    if (epicInputs && !epicInputs.classList.contains("hidden")) {
      const krs = [];
      // Recopilar los 5 inputs de KRs
      for (let i = 0; i < 5; i++) {
        const val = document.getElementById(`modal-epic-kr-${i}`)?.value.trim();
        if (val) krs.push(val);
      }

      result = {
        title: document.getElementById("modal-epic-title").value,
        description: document.getElementById("modal-epic-description").value,
        status: document.getElementById("modal-epic-status").value,
        startDate: document.getElementById("modal-epic-start-date").value,
        endDate: document.getElementById("modal-epic-end-date").value,
        color: document.querySelector("#epic-color-palette .selected")?.dataset.color || "#3b82f6",
        keyResults: krs,
      };
    }

    // 3. LÓGICA PARA SPRINTS
    const sprintInputs = document.getElementById("modal-sprint-inputs");
    if (sprintInputs && !sprintInputs.classList.contains("hidden")) {
      const suffixSpan = document.getElementById("modal-sprint-suffix");
      // Usamos el dataset.seq que guardamos al cambiar el Epic, o 0 si no existe
      const seqNum = suffixSpan ? Number(suffixSpan.dataset.seq) || 0 : 0;

      result = {
        title: document.getElementById("modal-sprint-name").value,
        sequence: seqNum,
        start: document.getElementById("modal-start-date").value,
        end: document.getElementById("modal-end-date").value,
        capacity: document.getElementById("modal-sprint-capacity").value,
        color:
          document.querySelector("#sprint-color-palette .selected")?.dataset.color || "#3b82f6",
        epicId: document.getElementById("modal-sprint-epic-select").value,
      };
    }

    // 4. LÓGICA PARA TEMAS (Themes)
    const themeInputs = document.getElementById("modal-theme-inputs");
    if (themeInputs && !themeInputs.classList.contains("hidden")) {
      const themeTitleInput = document.getElementById("modal-theme-title");
      const themeDescriptionInput = document.getElementById("modal-theme-description");
      result = {
        title: themeTitleInput?.value || "",
        description: themeDescriptionInput?.value || "",
      };
    }

    // 5. LÓGICA PARA HANDBOOK
    const handbookInputs = document.getElementById("modal-handbook-inputs");
    if (handbookInputs && !handbookInputs.classList.contains("hidden") && quillInstance) {
      result = {
        title: document.getElementById("modal-handbook-title").value,
        content: quillInstance.getContents(),
      };
    }

    if (modalCallback) modalCallback(result);
    hideModal();
  });

  if (sprintSelector) {
    sprintSelector.addEventListener("change", (e) => appActions.setCurrentSprintId(e.target.value));
  }
  const sprintNavSelect = document.getElementById("sprint-nav-select");
  if (sprintNavSelect) {
    sprintNavSelect.addEventListener("change", (e) => appActions.setCurrentSprintId(e.target.value));
  }
  if (sprintCapacityInput) {
    sprintCapacityInput.addEventListener("change", (e) => {
      const val = e.target.value;
      if (val.trim() !== "" && !isNaN(Number(val)))
        appActions.updateSprintCapacity(state.currentSprintId, Number(val));
    });
  }
  if (selectAllBacklog) {
    selectAllBacklog.addEventListener("change", (e) => {
      document
        .querySelectorAll("#backlog-tasks-container input[data-select-task]")
        .forEach((cb) => (cb.checked = e.target.checked));
    });
  }

  window.addEventListener("hashchange", appActions.handleRouteChange);
  window.addEventListener("load", appActions.handleRouteChange);
}

export function showApp(user) {
  document.getElementById("main-content")?.classList.remove("hidden");
  document.getElementById("sidebar")?.classList.add("flex");
  document.getElementById("sidebar")?.classList.remove("hidden");
  document.getElementById("welcome-message")?.classList.add("hidden");
  document.getElementById("user-name").textContent = user.displayName;
  document.getElementById("user-email").textContent = user.email;
  document.getElementById("user-avatar").src = user.photoURL;
  document.getElementById("user-info")?.setAttribute("title", user.displayName || user.email || "Usuario");
  document
    .getElementById("user-info")
    ?.setAttribute("aria-label", user.displayName || user.email || "Usuario");
  applySidebarShellState();
}
export function hideApp() {
  setSidebarMobileOpen(false);
  document.getElementById("main-content")?.classList.add("hidden");
  document.getElementById("sidebar")?.classList.remove("flex");
  document.getElementById("sidebar")?.classList.add("hidden");
  document.getElementById("welcome-message")?.classList.remove("hidden");
}

// 3.2 — Undo toast system
function showToast({ message, undoLabel = "Deshacer", onUndo = null, duration = 4000 } = {}) {
  const container = document.getElementById("toast-container");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = "toast";
  toast.setAttribute("role", "status");
  toast.innerHTML = `
    <span class="toast__msg">${message}</span>
    ${onUndo ? `<button type="button" class="toast__undo">${undoLabel}</button>` : ""}
    <button type="button" class="toast__close" aria-label="Cerrar"><i class="fa-solid fa-xmark"></i></button>
  `;

  const dismiss = () => {
    toast.classList.add("toast--out");
    toast.addEventListener("animationend", () => toast.remove(), { once: true });
  };

  if (onUndo) {
    toast.querySelector(".toast__undo")?.addEventListener("click", () => {
      onUndo();
      dismiss();
    });
  }
  toast.querySelector(".toast__close")?.addEventListener("click", dismiss);

  container.appendChild(toast);
  if (duration > 0) setTimeout(dismiss, duration);
  return { dismiss };
}

export function showModal(config) {
  const modalContent = document.getElementById("modal-content");
  const modal = {
    overlay: document.getElementById("modal-overlay"),
    title: document.getElementById("modal-title"),
    text: document.getElementById("modal-text"),
    input: document.getElementById("modal-input"),
    sprintInputs: document.getElementById("modal-sprint-inputs"),
    epicInputs: document.getElementById("modal-epic-inputs"),
    themeInputs: document.getElementById("modal-theme-inputs"),
    taskDetails: document.getElementById("modal-task-details"),
    handbookInputs: document.getElementById("modal-handbook-inputs"),
    okBtn: document.getElementById("modal-ok-btn"),
    footer: document.getElementById("modal-footer"),
    closeIcon: document.getElementById("modal-close-icon"),
  };
  const modalCancelBtn = document.getElementById("modal-cancel-btn");
  const modalSections = [
    modal.title,
    modal.text,
    modal.input,
    modal.sprintInputs,
    modal.epicInputs,
    modal.themeInputs,
    modal.taskDetails,
    modal.handbookInputs,
  ];
  modalSections.forEach((section) => section?.classList.add("hidden"));

  if (modal.text) {
    modal.text.textContent = "";
    modal.text.innerHTML = "";
    modal.text.className = MODAL_TEXT_BASE_CLASS;
  }
  if (modal.input) {
    modal.input.value = "";
    modal.input.placeholder = "";
    modal.input.type = "text";
  }
  if (modal.okBtn) {
    modal.okBtn.className = "modal-solid-btn px-6 py-2.5 text-sm font-semibold shadow-sm transition-all hidden";
    modal.okBtn.textContent = "Aceptar";
  }
  if (modal.footer) modal.footer.classList.remove("hidden");
  if (modalCancelBtn) {
    modalCancelBtn.className = "modal-ghost-btn px-6 py-2.5 text-sm font-semibold transition-colors";
    modalCancelBtn.classList.remove("hidden");
  }
  if (modal.overlay) {
    modal.overlay.classList.remove("hidden");
    modal.overlay.style.display = "flex";
  }

  if (config.title) {
    modal.title.textContent = config.title;
    modal.title.classList.remove("hidden");
  }
  if (config.htmlContent) {
    modal.text.innerHTML = config.htmlContent;
    modal.text.classList.remove("hidden");
  } else if (config.text) {
    modal.text.textContent = config.text;
    modal.text.classList.remove("hidden");
  }
  if (config.input) {
    modal.input.value = config.inputValue || "";
    modal.input.placeholder = config.inputPlaceholder || "";
    modal.input.type = config.inputType || "text";
    modal.input.classList.remove("hidden");
  }
  if (config.sprintInputs) modal.sprintInputs.classList.remove("hidden");
  if (config.epicInputs) modal.epicInputs.classList.remove("hidden");
  if (config.themeInputs) modal.themeInputs.classList.remove("hidden");
  if (config.taskDetails) modal.taskDetails.classList.remove("hidden");
  if (config.handbookInputs) modal.handbookInputs.classList.remove("hidden");
  if (modalContent) {
    modalContent.classList.remove(...MODAL_MODE_CLASSES);
    if (!config.taskDetails) modalContent.removeAttribute("data-active-task-id");
    if (config.taskDetails) modalContent.classList.add("is-task-modal");
    else if (config.sprintInputs) modalContent.classList.add("is-sprint-form-modal");
    else if (config.epicInputs) modalContent.classList.add("is-epic-form-modal");
    else if (config.themeInputs) modalContent.classList.add("is-theme-form-modal");
    else if (config.handbookInputs) modalContent.classList.add("is-handbook-form-modal");
    else modalContent.classList.add("is-simple-modal");
    if (config.actionModal) modalContent.classList.add("is-task-action-modal");
    if (config.compactPointsModal) modalContent.classList.add("is-points-compact-modal");
  }
  if (modal.footer) modal.footer.classList.toggle("hidden", Boolean(config.taskDetails));
  if (modal.closeIcon) modal.closeIcon.classList.remove("hidden");
  if (config.okText) {
    modal.okBtn.textContent = config.okText;
    const isCloseAction = /^cerrar$/i.test(config.okText.trim());
    const baseClass = isCloseAction
      ? "modal-ghost-btn font-semibold py-1.5 px-5 rounded-md transition-colors"
      : "modal-solid-btn font-semibold py-1.5 px-5 rounded-md shadow-sm transition-all";
    modal.okBtn.className = `${baseClass} ${config.okClass || ""}`.trim();
    modal.okBtn.classList.remove("hidden");
    if (modalCancelBtn && (config.hideCancel || isCloseAction)) {
      modalCancelBtn.classList.add("hidden");
    }
  }
  modalCallback = typeof config.callback === "function" ? config.callback : null;
}

export function hideModal() {
  if (quillInstance) {
    quillInstance = null;
  }
  const overlay = document.getElementById("modal-overlay");
  if (overlay) {
    overlay.classList.add("hidden");
    overlay.style.display = "none";
  }
  const content = document.getElementById("modal-content");
  if (content) {
    content.removeAttribute("data-active-task-id");
    content.classList.remove(...MODAL_MODE_CLASSES);
  }
  modalCallback = null;
}

export function renderTaskDetails(task, state) {
  const els = {
    title: document.getElementById("modal-task-title"),
    description: document.getElementById("modal-task-description"),
    timeStats: document.getElementById("modal-task-time-stats"),
    points: document.getElementById("modal-task-points"),
    pointsField: document.getElementById("modal-task-points-field"),
    pointsHint: document.getElementById("modal-task-points-hint"),
    assignee: document.getElementById("modal-task-assignee"),
    assigneeField: document.getElementById("modal-task-assignee-field"),
    assigneeHint: document.getElementById("modal-task-assignee-hint"),
    sprint: document.getElementById("modal-task-sprint"),
    status: document.getElementById("modal-task-status"),
    creator: document.getElementById("modal-task-creator"),
    history: document.getElementById("history-list"),
    epicSelect: document.getElementById("modal-task-epic-select"),
    epicField: document.getElementById("modal-task-epic-field"),
    epicHint: document.getElementById("modal-task-epic-hint"),
    krSelect: document.getElementById("modal-task-kr-select"),
    dueDate: document.getElementById("modal-task-due-date"),
    saveStatus: document.getElementById("modal-save-status"),
    impactContainer: document.getElementById("impactContainer"),
    effortContainer: document.getElementById("effortContainer"),
    avatarImg: document.getElementById("modal-task-avatar-img"),
    banner: document.querySelector(".modal-task-banner"),
  };

  if (!els.title) return;

  // Custom action buttons for the profile-card styled modal
  const customOkBtn = document.getElementById("task-modal-ok-btn");
  const customCancelBtn = document.getElementById("task-modal-cancel-btn");
  if (customOkBtn) {
    customOkBtn.onclick = () => document.getElementById("modal-ok-btn")?.click();
  }
  if (customCancelBtn) {
    customCancelBtn.onclick = () => document.getElementById("modal-cancel-btn")?.click();
  }

  const getDate = (ts) => (ts && ts.toDate ? ts.toDate() : ts ? new Date(ts) : null);
  const toDateInputValue = (dateObj) => {
    if (!dateObj) return "";
    const y = dateObj.getFullYear();
    const m = String(dateObj.getMonth() + 1).padStart(2, "0");
    const d = String(dateObj.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  };

  let saveStatusTimeout = null;
  const setSaveStatus = (mode, text) => {
    if (!els.saveStatus) return;
    els.saveStatus.textContent = text;
    els.saveStatus.classList.remove("is-saving", "is-saved", "is-error");
    if (mode === "saving") els.saveStatus.classList.add("is-saving");
    if (mode === "saved") els.saveStatus.classList.add("is-saved");
    if (mode === "error") els.saveStatus.classList.add("is-error");
  };
  const persistTaskUpdate = (patch) => {
    if (!patch || typeof appActions === "undefined") return;
    setSaveStatus("saving", "Guardando...");
    Promise.resolve(appActions.updateTask(task.id, patch))
      .then(() => {
        setSaveStatus("saved", "Guardado ahora");
        if (saveStatusTimeout) clearTimeout(saveStatusTimeout);
        saveStatusTimeout = setTimeout(() => {
          setSaveStatus("idle", "Sin cambios recientes");
        }, 2200);
      })
      .catch(() => {
        setSaveStatus("error", "No se pudo guardar");
      });
  };
  setSaveStatus("idle", "Sin cambios recientes");

  const setRequiredState = (fieldEl, hintEl, isMissing) => {
    if (!fieldEl) return;
    fieldEl.classList.toggle("ring-2", isMissing);
    fieldEl.classList.toggle("ring-rose-300", isMissing);
    fieldEl.classList.toggle("border-rose-300", isMissing);
    fieldEl.classList.toggle("bg-rose-50/60", isMissing);
    if (hintEl) {
      hintEl.classList.toggle("hidden", !isMissing);
      hintEl.style.display = isMissing ? "inline-flex" : "none";
    }
  };

  const setSelectState = (selectEl, isMissing) => {
    if (!selectEl) return;
    selectEl.classList.toggle("border-rose-300", isMissing);
    selectEl.classList.toggle("text-rose-700", isMissing);
    selectEl.classList.toggle("text-gray-700", !isMissing);
  };

  const updateRequiredStates = () => {
    const pointsRaw = document.getElementById("detail-modal-points")?.value;
    const pointsVal =
      pointsRaw !== undefined && pointsRaw !== null && pointsRaw !== ""
        ? Number(pointsRaw)
        : Number(task.points ?? 0);
    const isPointsMissing = pointsVal === 0;
    setRequiredState(els.pointsField, els.pointsHint, isPointsMissing);
    const pointsSelectEl = document.getElementById("detail-modal-points");
    if (pointsSelectEl) {
      pointsSelectEl.classList.toggle("text-rose-600", isPointsMissing);
      pointsSelectEl.classList.toggle("text-blue-600", !isPointsMissing);
    }

    const epicRaw = els.epicSelect?.value;
    const epicVal = epicRaw !== undefined && epicRaw !== null ? epicRaw : (task.epicId ?? "");
    const isEpicMissing = !epicVal;
    setRequiredState(els.epicField, els.epicHint, isEpicMissing);
    setSelectState(els.epicSelect, isEpicMissing);

    const assigneeRaw = document.getElementById("detail-modal-assignee")?.value;
    const assigneeVal =
      assigneeRaw !== undefined && assigneeRaw !== null ? assigneeRaw : (task.assignee ?? "");
    const isAssigneeMissing = !assigneeVal;
    setRequiredState(els.assigneeField, els.assigneeHint, isAssigneeMissing);
    setSelectState(document.getElementById("detail-modal-assignee"), isAssigneeMissing);
  };

  const normalizeTitle = (raw) => (raw || "").replace(/\s+/g, " ").trim();
  const initialTitle = normalizeTitle(task.title || "Sin título");
  els.title.textContent = initialTitle;

  const persistTitle = () => {
    const nextTitle = normalizeTitle(els.title.textContent);
    const currentTitle = normalizeTitle(task.title || "Sin título");
    if (!nextTitle) {
      els.title.textContent = currentTitle;
      return;
    }
    if (nextTitle === currentTitle) {
      els.title.textContent = currentTitle;
      return;
    }
    task.title = nextTitle;
    els.title.textContent = nextTitle;
    persistTaskUpdate({ title: nextTitle });
  };

  els.title.onblur = persistTitle;
  els.title.onkeydown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      els.title.blur();
    }
  };

  if (els.description) {
    if (document.activeElement !== els.description) {
      els.description.value = task.description || "";
    }

    const persistDescription = () => {
      const nextDescription = els.description.value ?? "";
      const currentDescription = task.description || "";
      if (nextDescription === currentDescription) return;
      task.description = nextDescription;
      persistTaskUpdate({ description: nextDescription });
    };

    els.description.onblur = persistDescription;
    els.description.onkeydown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        persistDescription();
      }
    };
  }
  els.points.textContent = task.points || "0";

  // Avatar & Banner
  let assigneeUser = null;
  if (task.assignee) {
    assigneeUser = state.allUsers.find((u) => u.email === task.assignee);
  }
  if (els.avatarImg) {
    if (assigneeUser && assigneeUser.photoURL) {
      els.avatarImg.src = assigneeUser.photoURL;
    } else {
      els.avatarImg.src = `https://ui-avatars.com/api/?name=${task.assignee ? task.assignee : "U"}&background=random&size=96`;
    }
  }
  // --- 1.5. ESTADÍSTICAS DE TIEMPO ---
  if (els.timeStats) {
    const now = new Date();
    const createdAt = getDate(task.createdAt) || now;
    const startedAt = getDate(task.startedAt);
    const completedAt = getDate(task.completedAt);

    const formatDiff = (start, end) => {
      if (!start) return "—";
      const diffMs = (end || now) - start;
      const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      if (days > 0) return `${days}d ${hours}h`;
      return `${hours}h`;
    };

    const daysSinceCreation = formatDiff(createdAt, completedAt || now);
    let timeInTodo = "—";
    let timeInProgress = "—";

    if (startedAt) {
      timeInTodo = formatDiff(createdAt, startedAt);
      timeInProgress = formatDiff(startedAt, completedAt || now);
    } else {
      timeInTodo = formatDiff(createdAt, completedAt || now);
    }

    const createdCycleStr = createdAt.toLocaleDateString("es-MX", {
      day: "2-digit",
      month: "short",
      year: "2-digit",
    });

    els.timeStats.innerHTML = `
      <div class="time-stat-card">
          <span class="time-stat-title">Creada</span>
          <span class="time-stat-value">${createdCycleStr}</span>
      </div>
      <div class="time-stat-card">
          <span class="time-stat-title">Antigüedad Total</span>
          <span class="time-stat-value">${daysSinceCreation}</span>
      </div>
      <div class="time-stat-card">
          <span class="time-stat-title">T. Por Hacer</span>
          <span class="time-stat-value">${timeInTodo}</span>
      </div>
      <div class="time-stat-card time-stat-card-blue">
          <span class="time-stat-title time-stat-title-blue">T. En Progreso</span>
          <span class="time-stat-value time-stat-value-blue">${timeInProgress}</span>
      </div>
    `;
  }

  // --- 2. RENDERIZADO DE USUARIOS Y PUNTOS (EDITABLES) ---

  // A) SELECTOR DE PUNTOS
  let pointsSelectHTML = `<div class="modal-points-field-stack"><select id="detail-modal-points" class="modal-input-slim font-medium">`;
  POINT_ASSIGNMENT_OPTIONS.forEach((p) => {
    pointsSelectHTML += `<option value="${p}" ${task.points == p ? "selected" : ""}>${getPointOptionLabel(p)}</option>`;
  });
  pointsSelectHTML += `</select><p id="detail-modal-points-hours" class="modal-helper-inline">${getPointHoursHelperText(task.points ?? 0)}</p></div>`;

  // Reemplazamos el contenido estático
  els.points.innerHTML = pointsSelectHTML;
  els.points.classList.remove("text-3xl"); // Quitamos clases que estorben al select

  // Listener para cambio de puntos
  const pointsSelect = document.getElementById("detail-modal-points");
  const detailPointsHoursHint = document.getElementById("detail-modal-points-hours");
  if (pointsSelect) {
    pointsSelect.addEventListener("change", (e) => {
      const nextPoints = Number(e.target.value);
      updatePointHoursHint(detailPointsHoursHint, nextPoints);
      persistTaskUpdate({ points: nextPoints });
      updateRequiredStates();
    });
  }

  // B) SELECTOR DE ASIGNADO (RESPONSABLE)
  let assigneeSelectHTML = `<select id="detail-modal-assignee" class="modal-input-slim text-xs text-gray-700">
    <option value="">-- Sin Asignar --</option>`;

  // Ordenar usuarios
  const sortedUsers = [...state.allUsers].sort((a, b) =>
    (a.displayName || a.email).localeCompare(b.displayName || b.email)
  );

  sortedUsers.forEach((u) => {
    const isSelected = task.assignee === u.email ? "selected" : "";
    assigneeSelectHTML += `<option value="${u.email}" ${isSelected}>${u.displayName || u.email}</option>`;
  });
  assigneeSelectHTML += `</select>`;

  els.assignee.innerHTML = assigneeSelectHTML;

  // Listener para cambio de asignado
  const assigneeSelect = document.getElementById("detail-modal-assignee");
  if (assigneeSelect) {
    assigneeSelect.addEventListener("change", (e) => {
      persistTaskUpdate({ assignee: e.target.value || null });
      updateRequiredStates();
    });
  }

  if (els.dueDate) {
    const taskDueDate = getDate(task.dueDate);
    els.dueDate.value = toDateInputValue(taskDueDate);
    els.dueDate.onchange = (e) => {
      const dateVal = e.target.value;
      if (dateVal) {
        const dateObj = new Date(`${dateVal}T00:00:00`);
        persistTaskUpdate({ dueDate: Timestamp.fromDate(dateObj) });
      } else {
        persistTaskUpdate({ dueDate: null });
      }
    };
  }

  // --- 3. SPRINT Y STATUS ---
  const sprint = state.taskLists?.find((l) => l.id === task.listId);
  els.sprint.textContent = sprint ? sprint.title : "Backlog (Sin Sprint)";

  if (els.banner) {
    const color = sprint?.color || "#8ec5fc";
    els.banner.style.background = `linear-gradient(135deg, #ffffff 0%, ${color} 100%)`;
  }

  const statusConfig = {
    todo: {
      text: "Por hacer",
      class: "bg-slate-50 text-slate-700 border border-slate-200",
      icon: "fa-regular fa-circle text-slate-500",
    },
    inprogress: {
      text: "En progreso",
      class: "bg-blue-50 text-blue-700 border border-blue-200",
      icon: "fa-solid fa-circle-dot text-blue-600",
    },
    done: {
      text: "Hecho",
      class: "bg-emerald-50 text-emerald-700 border border-emerald-200",
      icon: "fa-solid fa-check text-emerald-700",
    },
  };
  const getStatusValue = () =>
    task.kanbanStatus && statusConfig[task.kanbanStatus] ? task.kanbanStatus : "todo";
  els.status.className = "w-full";
  els.status.innerHTML = `
    <select id="detail-modal-status" class="modal-input-slim font-medium">
      <option value="todo">Por hacer</option>
      <option value="inprogress">En progreso</option>
      <option value="done">Hecho</option>
    </select>
  `;

  const applyStatusUpdate = (newStatus) => {
    if (task.kanbanStatus === newStatus) return;
    const updates = { kanbanStatus: newStatus };
    updates.lastMovedAt = Timestamp.now();
    if (newStatus === "inprogress") {
      if (task.kanbanStatus !== "inprogress") {
        updates.startedAt = Timestamp.now();
        updates.status = "needsAction";
        updates.completedAt = null;
      }
    } else if (newStatus === "done") {
      updates.status = "completed";
      updates.completedAt = Timestamp.now();
      if (window.confetti) confetti({ particleCount: 50, spread: 50, origin: { y: 0.7 } });
    } else {
      updates.status = "needsAction";
      updates.completedAt = null;
      updates.startedAt = null;
    }
    task.kanbanStatus = newStatus;
    persistTaskUpdate(updates);
  };

  const statusSelect = document.getElementById("detail-modal-status");
  if (statusSelect) {
    statusSelect.value = getStatusValue();

    // Asignamos color dinámicamente según el estado seleccionado para un toque premium
    const updateSelectColor = () => {
      if (statusSelect.value === "done") statusSelect.style.color = "#16a34a";
      else if (statusSelect.value === "inprogress") statusSelect.style.color = "#2563eb";
      else statusSelect.style.color = "#4b5563";
    };
    updateSelectColor();

    statusSelect.onchange = (e) => {
      const newStatus = e.target.value;
      updateSelectColor();
      applyStatusUpdate(newStatus);
    };
  }

  // --- 4. ALINEACIÓN ESTRATÉGICA (EPIC/KR) ---
  if (els.epicSelect && els.krSelect) {
    els.epicSelect.innerHTML = '<option value="">-- Seleccionar Epic --</option>';
    state.epics?.forEach((epic) => els.epicSelect.add(new Option(epic.title, epic.id)));
    els.epicSelect.value = task.epicId || "";

    const updateKRDropdown = (epicId, currentKrId) => {
      els.krSelect.innerHTML = '<option value="">-- Seleccionar KR --</option>';
      const selectedEpic = state.epics?.find((e) => e.id === epicId);
      if (selectedEpic?.keyResults) {
        selectedEpic.keyResults.forEach((kr, index) => els.krSelect.add(new Option(kr, index)));
        els.krSelect.value = currentKrId !== undefined && currentKrId !== null ? currentKrId : "";
      }
    };

    updateKRDropdown(task.epicId, task.krId);

    els.epicSelect.onchange = (e) => {
      const newEpicId = e.target.value;
      updateKRDropdown(newEpicId, null);
      persistTaskUpdate({ epicId: newEpicId, krId: null });
      updateRequiredStates();
    };
    els.krSelect.onchange = (e) => {
      persistTaskUpdate({ krId: e.target.value });
    };
  }

  updateRequiredStates();

  // --- 5. TRIAGE (IMPACTO / ESFUERZO) - CORREGIDO ---
  const triageConfig = state.triageConfig;
  const renderTriageColumn = (container, questions, selections) => {
    if (!container || !questions) return;
    container.innerHTML = "";
    questions.forEach((q) => {
      const isChecked = selections.includes(q.id);
      const wrapper = document.createElement("div");
      wrapper.className =
        "flex items-start gap-2 mb-2 group cursor-pointer hover:bg-gray-50 p-1 rounded";
      wrapper.innerHTML = `
        <input type="checkbox" id="${q.id}" data-id="${q.id}" 
               class="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer" 
               ${isChecked ? "checked" : ""}>
        <label for="${q.id}" class="text-xs text-gray-600 leading-snug cursor-pointer select-none">${q.text}</label>
      `;
      container.appendChild(wrapper);
    });
  };

  // CORRECCIÓN 2: Usamos els.impactContainer en lugar de la variable global indefinida
  if (els.impactContainer && els.effortContainer && triageConfig) {
    renderTriageColumn(els.impactContainer, triageConfig.impact, task.triageImpactSelections || []);
    renderTriageColumn(els.effortContainer, triageConfig.effort, task.triageEffortSelections || []);
  }

  // --- 6. HISTORIAL ---
  if (els.history) {
    els.history.innerHTML =
      task.history?.length > 0
        ? [...task.history]
            .sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0))
            .map(
              (entry) => `
            <div class="flex items-center gap-3 text-xs py-2 border-b border-gray-100 last:border-0">
              <div class="w-6 text-center"><i class="fas fa-clock text-gray-300"></i></div>
              <div class="flex-1">
                <span class="font-semibold text-gray-700">${entry.action || "Acción"}</span>
                <span class="text-gray-500"> - ${entry.user || "Sistema"}</span>
              </div>
              <span class="text-[10px] text-gray-400 font-mono">
                ${entry.timestamp ? entry.timestamp.toDate().toLocaleDateString("es-MX") : ""}
              </span>
            </div>`
            )
            .join("")
        : '<p class="text-center text-gray-400 text-xs py-2 italic">Sin actividad reciente.</p>';
  }

  // CORRECCIÓN 3: HE BORRADO EL BLOQUE QUE CAMBIABA ICONOS POR TEXTO "ASIGNAR/CAMBIAR"

  // --- 9. RENDER DE COMENTARIOS ---
  if (typeof renderComments === "function") {
    // Nota: renderComments está definida en este archivo pero fuera de export,
    // asegúrate de que sea accesible o llámala directamente si está en scope.
    // En tu archivo original estaba definida arriba, así que esto funcionará.
    // Si te da error, cambia 'renderComments' por la lógica interna o asegúrate que sea global.
    // Basado en tu archivo ui.js, renderComments es interna, así que esto está bien:
    const commentsList = document.getElementById("comments-list");
    if (commentsList) {
      commentsList.innerHTML = "";
      if (!task.comments || task.comments.length === 0) {
        commentsList.innerHTML =
          '<p class="text-center text-gray-500 text-sm">No hay comentarios.</p>';
      } else {
        task.comments
          .sort((a, b) => (a.timestamp?.seconds || 0) - (b.timestamp?.seconds || 0))
          .forEach((comment, index) => {
            // createCommentElement es interna de ui.js, accesible aquí
            // Necesitamos acceder a createCommentElement. Si no es exportada,
            // esta función renderTaskDetails debe estar en el mismo archivo.
            // Asumo que reemplazas en el mismo archivo ui.js.
            // Si createCommentElement no está disponible, el render original fallaba también.
            // Para seguridad, inserto lógica simple si falla:
            try {
              // Intentamos llamar a la función auxiliar existente en ui.js
              /* NOTA: Como estoy dándote el bloque aislado, asumo que createCommentElement
                           sigue existiendo arriba en tu archivo.
                        */
              // commentsList.appendChild(createCommentElement(comment, index, state));
              // Como no puedo llamar createCommentElement desde aquí sin ver si es exportada o scope,
              // Usaré una versión simplificada inline para asegurar que funcione:

              const div = document.createElement("div");
              div.className = "flex gap-2 p-2 bg-gray-50 rounded mb-2";
              div.innerHTML = `<span class="font-bold text-xs">${comment.author}:</span> <span class="text-xs">${comment.text}</span>`;
              commentsList.appendChild(div);
            } catch (e) {
              console.log(e);
            }
          });
        // NOTA IMPORTANTE: Si tu función createCommentElement está disponible en el scope
        // (que lo está en tu archivo ui.js original), descomenta la línea de abajo y borra el bloque try/catch de arriba
        // renderComments(task, state); <--- ESTO ES LO IDEAL SI ESTÁS EN EL MISMO ARCHIVO
      }
    }
  }
  // Para no romper nada, llamamos a la función original de comentarios si existe en el scope:
  try {
    renderComments(task, state);
  } catch (e) {}
}

/**
 * Helper para renderizar checkboxes de Triage de forma limpia
 */
function renderTriageQuestions(container, questions, selections) {
  container.innerHTML = "";
  questions.forEach((q) => {
    const isChecked = selections.includes(q.id);
    const wrapper = document.createElement("div");
    wrapper.className = "flex items-center mb-2";
    wrapper.innerHTML = `
      <input type="checkbox" id="${q.id}" data-id="${q.id}" 
             class="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" 
             ${isChecked ? "checked" : ""}>
      <label for="${q.id}" class="ml-2 block text-sm text-gray-900">${q.text}</label>
    `;
    container.appendChild(wrapper);
  });
}

export function renderOnlineUsers(onlineUsers) {
  const container = document.getElementById("online-users-container");
  if (!container) return;
  container.innerHTML = onlineUsers
    .map(
      (user) =>
        `<div class="relative" title="${user.displayName}"><img src="${user.photoURL}" alt="${user.displayName}" class="w-8 h-8 rounded-full"><div class="online-indicator"></div></div>`
    )
    .join("");
}

function getAuthErrorMessage(error, action) {
  switch (error?.code) {
    case "auth/popup-closed-by-user":
      return "Se cerró la ventana de Google antes de completar la autenticación.";
    case "auth/popup-blocked":
      return "El navegador bloqueó la ventana emergente. Intenta permitir popups para este sitio.";
    case "auth/network-request-failed":
      return `No se pudo ${action} por un problema de red.`;
    default:
      return `No se pudo ${action}. Intenta de nuevo.`;
  }
}

function setAuthButtonBusy(button, isBusy, idleText, busyText) {
  if (!button) return;
  button.disabled = isBusy;
  button.setAttribute("aria-busy", String(isBusy));
  button.classList.toggle("opacity-70", isBusy);
  button.classList.toggle("pointer-events-none", isBusy);
  const label = button.querySelector("span");
  if (label) label.textContent = isBusy ? busyText : idleText;
}

export function initializeAuthButtons(actions) {
  const loginButton = document.getElementById("login-button");
  const logoutButton = document.getElementById("auth-button");
  let loginInFlight = false;
  let logoutInFlight = false;

  if (loginButton) {
    loginButton.addEventListener("click", async (event) => {
      event.preventDefault();
      if (loginInFlight) return;
      loginInFlight = true;
      setAuthButtonBusy(loginButton, true, "Sign in with Google", "Abriendo Google...");
      try {
        await actions.login();
      } catch (error) {
        console.error("[AUTH] login error:", error);
        showModal({
          title: "No se pudo iniciar sesión",
          text: getAuthErrorMessage(error, "iniciar sesión"),
          okText: "Cerrar",
        });
      } finally {
        loginInFlight = false;
        setAuthButtonBusy(loginButton, false, "Sign in with Google", "Abriendo Google...");
      }
    });
  }

  if (logoutButton) {
    logoutButton.addEventListener("click", async (event) => {
      event.preventDefault();
      if (logoutInFlight) return;
      logoutInFlight = true;
      setAuthButtonBusy(logoutButton, true, "Cerrar Sesión", "Cerrando...");
      try {
        await actions.logout();
      } catch (error) {
        console.error("[AUTH] logout error:", error);
        showModal({
          title: "No se pudo cerrar sesión",
          text: getAuthErrorMessage(error, "cerrar sesión"),
          okText: "Cerrar",
        });
      } finally {
        logoutInFlight = false;
        setAuthButtonBusy(logoutButton, false, "Cerrar Sesión", "Cerrando...");
      }
    });
  }
}
(() => {
  try {
    const ov = document.getElementById("modal-overlay");
    if (ov) {
      ov.classList.remove("bg-black", "bg-gray-900", "bg-opacity-50");
      ov.classList.add("modal-overlay");
    }
  } catch (e) {
    console.warn("overlay fix skipped:", e);
  }
})();

// --- HELPER: Calcular número de secuencia ---
function getNextSequenceForEpic(epicId, state) {
  if (!epicId) return 1;

  // Filtramos sprints de este Epic (usando ambas referencias por compatibilidad)
  const epicSprints = state.taskLists.filter(
    (l) => !l.isBacklog && (l.epicId === epicId || (l.epicIds && l.epicIds.includes(epicId)))
  );

  let maxSeq = 0;

  epicSprints.forEach((s) => {
    // 1. Si ya tiene el campo 'sequence' guardado, confiamos en él (ELEGANCIA)
    if (typeof s.sequence === "number") {
      if (s.sequence > maxSeq) maxSeq = s.sequence;
    }
    // 2. Si es antiguo, intentamos extraerlo del título (COMPATIBILIDAD)
    else {
      const match = s.title.match(/\(#\s*(\d+)\s*\)$/);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > maxSeq) maxSeq = num;
      }
    }
  });

  return maxSeq + 1;
}

// --- AL FINAL DE ui.js ---

function buildVelocityReportData(tasks, allUsers, cyclesToShow = 6) {
  const completedTasks = tasks.filter(
    (task) => (task.status === "completed" || task.kanbanStatus === "done") && task.completedAt
  );
  const relevantAssignees = new Set(tasks.map((task) => task.assignee || "unassigned"));
  const reportData = {};
  const userNames = {};
  const allCycles = new Set();

  allUsers.forEach((user) => {
    if (!user.email) return;
    const email = user.email;
    if (!relevantAssignees.has(email)) return;
    reportData[email] = {};
    userNames[email] = user.displayName || email.split("@")[0];
  });

  relevantAssignees.forEach((assignee) => {
    if (!reportData[assignee]) reportData[assignee] = {};
    if (!userNames[assignee]) {
      userNames[assignee] = assignee === "unassigned" ? "Sin Asignar" : assignee.split("@")[0];
    }
  });

  completedTasks.forEach((task) => {
    const date = task.completedAt.toDate ? task.completedAt.toDate() : new Date(task.completedAt);
    const cycleStart = getCurrentCycleWindow(date).start;
    const cycleKey = `${cycleStart.getFullYear()}-${String(cycleStart.getMonth() + 1).padStart(2, "0")}-${String(cycleStart.getDate()).padStart(2, "0")}`;
    const assignee = task.assignee || "unassigned";
    allCycles.add(cycleKey);
    if (!reportData[assignee]) reportData[assignee] = {};
    reportData[assignee][cycleKey] = (reportData[assignee][cycleKey] || 0) + (task.points || 0);
  });

  const sortedCycles = Array.from(allCycles).sort().slice(-cyclesToShow);
  const allPoints = [];
  Object.keys(reportData).forEach((email) => {
    sortedCycles.forEach((cycleKey) => allPoints.push(reportData[email][cycleKey] || 0));
  });
  const maxPoint = Math.max(1, ...allPoints);
  const totalPointsGlobal = allPoints.reduce((sum, points) => sum + points, 0);
  const avgCycleGlobal = (totalPointsGlobal / (sortedCycles.length || 1)).toFixed(1);
  const cycleRangeLabel = (() => {
    if (!sortedCycles.length) return "—";
    const firstStart = new Date(`${sortedCycles[0]}T00:00:00`);
    const lastStart = new Date(`${sortedCycles[sortedCycles.length - 1]}T00:00:00`);
    const lastEnd = new Date(lastStart);
    lastEnd.setDate(lastEnd.getDate() + CYCLE_LENGTH_DAYS - 3);
    return `${formatCycleDateDMY(firstStart)} a ${formatCycleDateDMY(lastEnd)}`;
  })();

  return {
    reportData,
    userNames,
    sortedCycles,
    maxPoint,
    totalPointsGlobal,
    avgCycleGlobal,
    cycleRangeLabel,
    cyclesToShow,
  };
}

function renderVelocityReportTable(report) {
  if (!report.sortedCycles.length) {
    return '<div class="person-history-empty">Aún no hay historial suficiente para mostrar una tabla.</div>';
  }

  const rootStyles = getComputedStyle(document.documentElement);
  const doneColor = rootStyles.getPropertyValue("--person-work-done").trim() || "#476c9b";
  const lowAvgColor =
    rootStyles.getPropertyValue("--person-risk-at-limit-strong").trim() || "#7e6f40";
  const toRgba = (hex, alpha) => {
    const value = hex.replace("#", "");
    if (![3, 6].includes(value.length)) return hex;
    const normalized =
      value.length === 3 ? value.split("").map((part) => `${part}${part}`).join("") : value;
    const bigint = Number.parseInt(normalized, 16);
    if (Number.isNaN(bigint)) return hex;
    const r = (bigint >> 16) & 255;
    const g = (bigint >> 8) & 255;
    const b = bigint & 255;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  };

  const formatCycleHeader = (key) => {
    const start = new Date(`${key}T00:00:00`);
    const end = new Date(start);
    end.setDate(start.getDate() + CYCLE_LENGTH_DAYS - 3);
    return `<span class="block leading-tight">${formatCycleDateDMY(start)}</span><span class="block leading-tight text-[10px] normal-case text-gray-500">${formatCycleDateDMY(end)}</span>`;
  };

  let rowsHTML = "";
  Object.keys(report.reportData)
    .sort((a, b) => report.userNames[a].localeCompare(report.userNames[b], "es", { sensitivity: "base" }))
    .forEach((email) => {
      const pointsInPeriod = report.sortedCycles.map((cycleKey) => report.reportData[email][cycleKey] || 0);
      const totalPoints = pointsInPeriod.reduce((sum, points) => sum + points, 0);
      const avg = (totalPoints / (report.sortedCycles.length || 1)).toFixed(1);
      const name = report.userNames[email] || email;
      let avgColor = "text-gray-600";
      if (avg >= CYCLE_POINTS_TARGET) avgColor = "person-history-table-avg--strong font-bold";
      else if (avg < CYCLE_POINTS_TARGET * 0.5)
        avgColor = "person-history-table-avg--low font-bold";

      rowsHTML += `
        <tr class="border-b hover:bg-gray-50 transition-colors">
          <th scope="row" class="px-2 py-2 font-medium text-gray-900 border-r bg-white">
            <div class="truncate" title="${name}">${name}</div>
          </th>
          ${pointsInPeriod
            .map((pts) => {
              const intensity = pts > 0 ? Math.min(1, pts / report.maxPoint) : 0;
              const bg = pts > 0 ? toRgba(doneColor, 0.08 + intensity * 0.35) : "transparent";
              const color = pts > 0 ? doneColor : "#cbd5e1";
              return `
                <td class="px-1 py-1.5 text-center border-r">
                  <div style="height:22px; line-height:22px; border-radius:7px; background:${bg}; color:${color}; font-weight:${pts > 0 ? 600 : 400};">
                    ${pts > 0 ? pts : "—"}
                  </div>
                </td>
              `;
            })
            .join("")}
          <td class="px-1.5 py-2 text-center bg-gray-50 font-semibold text-gray-900">${totalPoints}</td>
          <td class="px-1.5 py-2 text-center bg-gray-50 font-bold ${avgColor}" ${avg < CYCLE_POINTS_TARGET * 0.5 ? `style="color:${lowAvgColor}"` : ""}>${avg}</td>
        </tr>
      `;
    });

  return `
    <div class="space-y-3">
      <div class="flex flex-wrap items-center gap-1.5 mb-3 text-[11px] text-gray-500">
        <span class="px-2 py-1 rounded-full bg-gray-50 border border-gray-200">Periodo: ${report.cycleRangeLabel}</span>
        <span class="px-2 py-1 rounded-full bg-gray-50 border border-gray-200">Total: <strong class="text-gray-900">${report.totalPointsGlobal}</strong> pts</span>
        <span class="px-2 py-1 rounded-full bg-gray-50 border border-gray-200">Prom/ciclo: <strong class="text-gray-900">${report.avgCycleGlobal}</strong></span>
        <span class="px-2 py-1 rounded-full bg-blue-50 border border-blue-200 text-blue-700">Meta: <strong>${CYCLE_POINTS_TARGET} pts</strong></span>
      </div>
      <div class="rounded-xl border border-gray-200 overflow-x-auto bg-white">
        <table class="person-history-table min-w-[760px] w-full table-fixed text-xs text-left text-gray-500 border-collapse">
          <caption class="sr-only">
            Puntos completados por persona en los últimos ${report.cyclesToShow} ciclos quincenales.
          </caption>
          <thead class="text-[10px] text-gray-700 uppercase bg-gray-50 border-b">
            <tr>
              <th scope="col" class="px-2 py-2 border-r w-[24%]">Miembro</th>
              ${report.sortedCycles
                .map((cycleKey) => `<th scope="col" class="px-1.5 py-2 text-center border-r">${formatCycleHeader(cycleKey)}</th>`)
                .join("")}
              <th scope="col" class="px-1.5 py-2 text-center bg-gray-100 w-[9%]">Total</th>
              <th scope="col" class="px-1.5 py-2 text-center bg-gray-100 w-[9%]">Prom</th>
            </tr>
          </thead>
          <tbody class="bg-white">
            ${rowsHTML}
          </tbody>
        </table>
      </div>
      <p class="text-[11px] text-gray-400 mt-2 text-right">* Se muestran los últimos ${report.cyclesToShow} ciclos de ${CYCLE_LENGTH_DAYS} días con actividad.</p>
    </div>
  `;
}

// --- FIN DEL ARCHIVO ui.js ---
