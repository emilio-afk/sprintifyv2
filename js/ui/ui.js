// ui.js - VERSIÓN CORREGIDA Y COMPLETA

import { Timestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

let modalCallback = null;
let appState = {};
let appActions = {};
let quillInstance = null;

const dom = {
  viewTitle: document.getElementById("view-title"),
  backlogTasksContainer: document.getElementById("backlog-tasks-container"),
  backlogMatrixContainer: document.getElementById("backlog-matrix-container"),
  toggleBacklogViewBtn: document.getElementById("toggle-backlog-view"),
  kanban: {
    todo: document.getElementById("kanban-todo"),
    inprogress: document.getElementById("kanban-inprogress"),
    done: document.getElementById("kanban-done"),
  },
};

function getTaskContext(task, state) {
  if (task.listId === state.backlogId) return "backlog";
  return "sprint";
}

// EN ui.js - Reemplaza la función createTaskElement completa o actualiza su lógica interna

function createTaskElement(task, context, state) {
  const { allUsers, taskLists, epics } = state;
  const isCompleted = task.status === "completed";

  // --- 1. HELPERS DE FECHA AVANZADOS ---
  const now = new Date();
  const getDate = (ts) => (ts && ts.toDate ? ts.toDate() : ts ? new Date(ts) : null);

  const createdAt = getDate(task.createdAt) || now;
  const completedAt = getDate(task.completedAt);
  const startedAt = getDate(task.startedAt);

  // Lógica de Antigüedad (Days Open)
  // Si está completada, calculamos hasta la fecha de fin. Si no, hasta hoy.
  const endCalcDate = isCompleted && completedAt ? completedAt : now;
  const daysOpen = Math.round((endCalcDate - createdAt) / (1000 * 60 * 60 * 24));

  // Lógica de Tiempo en Progreso (Time in Progress)
  let timeInProgressHTML = "";

  // Solo mostramos contador si tiene fecha de inicio Y (está en progreso O ya se completó)
  // Si se movió a "Por Hacer", startedAt debería ser null, así que esto no se ejecuta.
  if (startedAt && (task.kanbanStatus === "inprogress" || task.status === "completed")) {
    const progressEndDate = isCompleted && completedAt ? completedAt : now;

    // Diferencia en milisegundos
    const diffMs = progressEndDate - startedAt;
    // Convertir a horas
    const hoursInProgress = Math.floor(diffMs / (1000 * 60 * 60));
    const daysInProgress = Math.floor(hoursInProgress / 24);

    let timeString = "";
    if (daysInProgress > 0) {
      timeString = `${daysInProgress}d`;
    } else if (hoursInProgress > 0) {
      timeString = `${hoursInProgress}h`;
    } else {
      timeString = "1h"; // Mínimo visual para indicar que acaba de iniciar
    }

    const icon = isCompleted ? "fa-flag-checkered" : "fa-stopwatch"; // Icono distinto si terminó
    // Si está completado gris, si está vivo azul animado (pulso opcional)
    const colorClass = isCompleted ? "text-gray-400" : "text-blue-600 font-bold";
    const animClass = !isCompleted ? "fa-beat-fade" : ""; // Animación suave si está corriendo

    timeInProgressHTML = `
        <div class="flex items-center gap-1 ${colorClass} ml-1 px-1.5 py-0.5 rounded bg-blue-50 border border-blue-100" style="font-size: 9px;" title="Tiempo invertido">
            <i class="fa-solid ${icon} ${animClass}" style="--fa-animation-duration: 2s;"></i>
            <span>${timeString}</span>
        </div>
      `;
  }

  // --- LÓGICA DE HERENCIA ---
  const todayForCalc = new Date();
  const currentDay = todayForCalc.getDay();
  const diff = todayForCalc.getDate() - currentDay + (currentDay === 0 ? -6 : 1);
  const startOfWeek = new Date(todayForCalc.setDate(diff));
  startOfWeek.setHours(0, 0, 0, 0);
  const isInherited = createdAt < startOfWeek;

  const inheritedBadge =
    isInherited && !isCompleted // Solo mostrar herencia si no está completada para reducir ruido visual
      ? `<div class="flex items-center justify-center w-4 h-4 rounded-full bg-amber-50 text-amber-600 border border-amber-100" title="Tarea heredada">
         <i class="fa-solid fa-clock-rotate-left" style="font-size: 9px;"></i>
       </div>`
      : ``;

  // HTML FINAL DE TIEMPOS
  const metaInfoHTML = `
    <div class="flex items-center gap-2">
        <div class="flex items-center gap-1 ${isCompleted ? "text-gray-400" : "text-gray-500"}" style="font-size: 10px;" title="Antigüedad total">
            <i class="fa-regular fa-calendar"></i><span>${daysOpen}d</span>
        </div>
        ${timeInProgressHTML}
        ${inheritedBadge}
    </div>`;

  // ... (Resto de lógica de Epics, KRs, Asignee igual que antes) ...
  // 3. ICONO EPIC (Igual)
  let epicTopIconHTML = "";
  if (task.epicId) {
    const epic = epics.find((e) => e.id === task.epicId);
    if (epic) {
      const epicColor = epic.color || "#94a3b8";
      epicTopIconHTML = `<div style="position: absolute; top: 8px; right: 8px; font-size: 12px; color: ${epicColor}; opacity: 0.7; z-index: 10;" title="Epic: ${epic.title}"><i class="fa-solid fa-book-atlas"></i></div>`;
    }
  }

  // 4. PÍLDORA KR (Igual)
  let alignmentBadgeHTML = "";
  if (task.epicId && task.krId !== null && task.krId !== undefined) {
    const epic = epics.find((e) => e.id === task.epicId);
    const krText = epic && epic.keyResults ? epic.keyResults[task.krId] : null;
    if (krText) {
      alignmentBadgeHTML = `
        <div class="mt-1 flex items-center gap-1 px-2 py-0.5 rounded-full border border-gray-200 bg-gray-50 text-blue-700 max-w-full w-fit">
            <i class="fa-solid fa-bullseye shrink-0" style="font-size: 9px;"></i>
            <span class="font-medium truncate" style="font-size: 9px; line-height: 1.1;">${krText}</span>
        </div>`;
    }
  }

  // 5. ESTÁNDARES (Igual)
  const user = allUsers.find((u) => u.email === task.assignee);
  const userPhotoURL = user?.photoURL
    ? user.photoURL
    : `https://ui-avatars.com/api/?name=${task.assignee || ""}`;

  const assigneeHTML = task.assignee
    ? `<img src="${userPhotoURL}" class="w-6 h-6 rounded-full border border-white shadow-sm object-cover" title="${task.assignee}">`
    : `<div class="w-6 h-6 rounded-full bg-gray-50 border border-gray-300 border-dashed flex items-center justify-center text-gray-400 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-300 transition-colors" title="Asignar Responsable"><i class="fa-solid fa-user-plus" style="font-size: 10px;"></i></div>`;

  const pointsHTML =
    (task.points || 0) > 0
      ? `<span class="font-bold text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded" style="font-size: 10px;">${task.points}</span>`
      : ``;

  const checkboxHTML = `<input type="checkbox" class="form-checkbox h-3.5 w-3.5 text-blue-600 rounded border-gray-300 focus:ring-0 cursor-pointer mt-0.5 shrink-0" ${isCompleted ? "checked" : ""} ${context.includes("backlog") ? 'data-select-task="true"' : ""}>`;

  const sprint = taskLists.find((l) => l.id === task.listId);
  const sprintColor = sprint?.color || "#3b82f6";

  // 6. ESTRUCTURA FINAL (Card)
  const taskCard = document.createElement("div");
  taskCard.id = task.id;
  taskCard.className = `task-card group relative bg-white p-3 rounded-lg transition-all ${isCompleted ? "opacity-60" : ""}`;
  taskCard.draggable = true;
  taskCard.dataset.context = context;

  taskCard.innerHTML = `
    <div style="position: absolute; left: 0; top: 0; bottom: 0; width: 4px; background-color: ${sprintColor}; border-top-left-radius: 6px; border-bottom-left-radius: 6px;"></div>
    ${epicTopIconHTML}
    <div class="pl-2 pr-4 flex flex-col h-full relative">
        <div class="flex items-start gap-2"> 
            ${checkboxHTML}
            <div class="flex-1 min-w-0">
                <span class="text-sm font-semibold text-gray-900 leading-snug block break-words ${isCompleted ? "line-through text-gray-400" : ""}">${task.title}</span>
                ${alignmentBadgeHTML}
            </div>
        </div>
        <div class="flex-grow min-h-[8px]"></div>
        <div class="flex items-center justify-between mt-2 pt-1 relative">
            <div class="flex items-center gap-3">
                 ${(task.comments?.length || 0) > 0 ? `<div class="flex items-center gap-1 text-gray-400" style="font-size: 10px;"><i class="fa-regular fa-comment"></i><span>${task.comments.length}</span></div>` : ""}
                 ${metaInfoHTML} 
            </div>
            <div class="flex items-center gap-2">
                <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                    <button class="text-gray-400 hover:text-blue-600 p-1 transition-colors" data-action="due-date" title="Fecha"><i class="fa-regular fa-calendar-check" style="font-size: 11px;"></i></button>
                    <button class="text-gray-400 hover:text-blue-600 p-1 transition-colors" data-action="points" title="Puntos"><i class="fa-solid fa-coins" style="font-size: 11px;"></i></button>
                    <button class="text-gray-400 hover:text-blue-600 p-1 transition-colors" data-action="edit" title="Editar"><i class="fa-solid fa-pencil" style="font-size: 11px;"></i></button>
                    <button class="text-gray-400 hover:text-red-600 p-1 transition-colors" data-action="delete" title="Borrar"><i class="fa-solid fa-trash-can" style="font-size: 11px;"></i></button>
                </div>
                ${pointsHTML}
                <div class="cursor-pointer shrink-0" data-action="assign" title="Asignar Responsable">
                    ${assigneeHTML}
                </div>
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
  const { allUsers, taskLists } = state;
  const isCompleted = task.status === "completed" || task.kanbanStatus === "done";
  const user = allUsers.find((u) => u.email === task.assignee);
  const userPhotoURL = user?.photoURL
    ? user.photoURL
    : `https://ui-avatars.com/api/?name=${task.assignee || ""}`;
  const sprint = taskLists.find((l) => l.id === task.listId);
  const sprintColor = sprint?.color || "#3b82f6";

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
  title.innerHTML = `<div class="text-sm font-medium text-slate-800 truncate">${task.title}</div><div class="text-xs text-gray-400 truncate mt-0.5">${task.description ? (task.description.length > 80 ? task.description.slice(0, 80) + "…" : task.description) : ""}</div>`;

  left.appendChild(checkbox);
  left.appendChild(title);

  const right = document.createElement("div");
  right.className = "flex items-center gap-3 ml-2 shrink-0";

  const points = document.createElement("div");
  points.className = "text-xs text-gray-600 font-semibold";
  points.innerText = (task.points || 0) > 0 ? `${task.points} pts` : "";

  const due = document.createElement("div");
  due.className = "text-xs text-gray-400";
  if (task.dueDate) {
    const d = task.dueDate.toDate ? task.dueDate.toDate() : new Date(task.dueDate);
    due.innerText = d.toLocaleDateString();
  }

  const assignee = document.createElement("img");
  assignee.src = userPhotoURL;
  assignee.className = "w-6 h-6 rounded-full object-cover border";
  assignee.title = task.assignee || "Sin asignar";

  right.appendChild(points);
  right.appendChild(due);
  right.appendChild(assignee);

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
  const commentEl = document.createElement("div");
  commentEl.className = "flex items-start gap-3";
  commentEl.id = `activity-comment-${taskId}-${index}`;
  commentEl.innerHTML = `<img src="${authorAvatar}" class="w-8 h-8 rounded-full mt-1"><div class="flex-1 bg-gray-50 p-3 rounded-lg border"><div class="flex justify-between items-center"><span class="font-semibold text-sm">${comment.author || "Anónimo"}</span><span class="text-xs text-gray-400">${date} ${comment.edited ? "(editado)" : ""}</span></div><p class="text-sm text-gray-700 mt-1">${comment.text || ""}</p><div class="flex items-center gap-2 mt-2"><input type="checkbox" data-activity-read="true" data-task-id="${taskId}" data-comment-idx="${index}" ${isRead ? "checked" : ""}><span class="text-xs">${isRead ? "Leído" : "Pendiente"}</span></div></div>`;
  return commentEl;
}

function renderBacklog(state) {
  if (!dom.backlogTasksContainer) return;
  dom.backlogTasksContainer.innerHTML = "";
  const backlogTasks = state.tasks.filter((t) => t.listId === state.backlogId);

  if (backlogTasks.length === 0) {
    dom.backlogTasksContainer.innerHTML =
      '<p class="text-gray-500 text-center col-span-full py-8">El backlog está vacío.</p>';
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
    header.className =
      "flex items-center gap-3 p-3 bg-gradient-to-r from-slate-50 to-slate-100 rounded-lg border border-slate-200 cursor-pointer hover:from-slate-100 hover:to-slate-150 transition-all mb-2 group";
    header.dataset.action = "toggle-backlog-epic";
    header.dataset.epicId = epicId;

    const epicColor = epic?.color || "#64748b";
    const epicName = epic?.title || "Sin Épica";
    const taskCount = tasks.length;
    const doneCount = tasks.filter((t) => t.status === "completed").length;
    const points = tasks.reduce((sum, t) => sum + (t.points || 0), 0);
    const donePoints = tasks
      .filter((t) => t.status === "completed")
      .reduce((sum, t) => sum + (t.points || 0), 0);

    const chevron = isCollapsed ? "fa-chevron-right" : "fa-chevron-down";

    header.innerHTML = `
      <div style="flex-shrink: 0; width: 4px; height: 24px; background-color: ${epicColor}; border-radius: 2px;"></div>
      <i class="fas ${chevron} text-slate-400 group-hover:text-slate-600 transition-colors" style="font-size: 12px;"></i>
      <div class="flex-1 min-w-0">
        <h3 class="font-semibold text-slate-700 text-sm">${epicName}</h3>
      </div>
      <div class="flex items-center gap-3 opacity-0 group-hover:opacity-100 transition-opacity text-xs text-slate-500">
        <span title="Completadas/Total"><i class="fas fa-check text-green-600"></i> ${doneCount}/${taskCount}</span>
        <span class="h-4 border-l border-slate-300"></span>
        <span title="Puntos completados/Total"><i class="fas fa-coins text-yellow-600"></i> ${donePoints}/${points}</span>
      </div>
    `;

    groupWrapper.appendChild(header);

    // Contenedor de tareas (colapsable)
    const tasksContainer = document.createElement("div");
    tasksContainer.className = `grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 pl-4 pr-0 transition-all duration-200 ${isCollapsed ? "hidden" : ""}`;
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

  dom.backlogMatrixContainer.innerHTML = `<div class="grid grid-cols-1 md:grid-cols-2 gap-4"><div class="rounded-lg border p-3 bg-white min-h-[200px] flex flex-col"><div class="text-xs font-semibold text-emerald-700 mb-2">Quick Wins (Alto impacto / Bajo esfuerzo)</div><div class="space-y-2 flex-grow" data-quad-list="quick"></div></div><div class="rounded-lg border p-3 bg-white min-h-[200px] flex flex-col"><div class="text-xs font-semibold text-blue-700 mb-2">Major Projects (Alto impacto / Alto esfuerzo)</div><div class="space-y-2 flex-grow" data-quad-list="major"></div></div><div class="rounded-lg border p-3 bg-white min-h-[200px] flex flex-col"><div class="text-xs font-semibold text-gray-700 mb-2">Fillers (Bajo impacto / Bajo esfuerzo)</div><div class="space-y-2 flex-grow" data-quad-list="filler"></div></div><div class="rounded-lg border p-3 bg-white min-h-[200px] flex flex-col"><div class="text-xs font-semibold text-amber-700 mb-2">Maybe later (Bajo impacto / Alto esfuerzo)</div><div class="space-y-2 flex-grow" data-quad-list="maybe"></div></div></div>`;
  const lists = {
    quick: dom.backlogMatrixContainer.querySelector('[data-quad-list="quick"]'),
    major: dom.backlogMatrixContainer.querySelector('[data-quad-list="major"]'),
    filler: dom.backlogMatrixContainer.querySelector('[data-quad-list="filler"]'),
    maybe: dom.backlogMatrixContainer.querySelector('[data-quad-list="maybe"]'),
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
  // Definimos las columnas y sus títulos
  const columns = [
    { key: "todo", title: "Por Hacer" },
    { key: "inprogress", title: "En Progreso" },
    { key: "done", title: "Hecho" },
  ];

  columns.forEach((col) => {
    const wrapper = document.getElementById(`col-${col.key}-wrapper`);
    if (!wrapper) return;

    // Verificar si está colapsada
    const isCollapsed = state.collapsedColumns.has(col.key);

    // --- MODO COLAPSADO ---
    if (isCollapsed) {
      // Ajustamos estilos del wrapper para que sea delgado
      wrapper.className =
        "w-12 py-4 bg-gray-100 rounded-xl flex flex-col items-center justify-center transition-all duration-300 cursor-pointer hover:bg-gray-200 border border-gray-200";
      wrapper.dataset.action = "collapse-column";
      wrapper.dataset.col = col.key;
      wrapper.title = "Clic para expandir";

      // HTML Vertical
      wrapper.innerHTML = `
        <div class="h-full flex items-center justify-center pointer-events-none">
           <span class="whitespace-nowrap font-bold text-gray-400 uppercase tracking-widest text-xs" style="writing-mode: vertical-rl; transform: rotate(180deg);">
              ${col.title}
           </span>
        </div>
        <div class="mt-2 text-gray-400 pointer-events-none"><i class="fa-solid fa-expand"></i></div>
      `;
      return; // Terminamos aquí si está colapsada
    }

    // --- MODO EXPANDIDO ---
    // Restauramos clases originales
    wrapper.className =
      "flex-1 min-w-0 bg-white rounded-xl p-3 flex flex-col transition-all duration-300 ease-in-out border border-gray-200 shadow-sm";
    // Quitamos data-action del wrapper para que no colapse al hacer clic en el fondo
    wrapper.removeAttribute("data-action");

    // 1. Construir Encabezado
    const addBtnHTML =
      col.key === "todo"
        ? `<button data-action="add-task-sprint" class="text-blue-500 hover:text-blue-700 transition-colors" title="Añadir Tarea">
             <i class="fa-solid fa-circle-plus text-xl"></i>
           </button>`
        : "";

    const headerHTML = `
      <div class="flex justify-between items-center mb-3 pb-2 border-b border-gray-200">
        <h3 class="font-bold text-gray-500 uppercase tracking-wider flex items-center gap-2 text-xs">
          <button data-action="collapse-column" data-col="${col.key}" class="text-gray-400 hover:text-gray-600 transition-colors" title="Colapsar">
            <i class="fa-solid fa-compress"></i>
          </button>
          <span>${col.title}</span>
        </h3>
        ${addBtnHTML}
      </div>
      <div id="kanban-${col.key}" class="min-h-[200px] space-y-2 flex-grow swimlane-drop-zone" data-status="${col.key}"></div>
    `;

    wrapper.innerHTML = headerHTML;

    // 2. Filtrar y Ordenar Tareas (Más viejas primero)
    const container = wrapper.querySelector(`#kanban-${col.key}`);

    // Filtramos tareas de este sprint y columna
    let colTasks = state.tasks.filter(
      (t) =>
        t.listId === state.currentSprintId &&
        (t.kanbanStatus === col.key || (col.key === "todo" && !t.kanbanStatus))
    );

    // ORDENAR: Antigüedad (Fecha de creación ASCENDENTE)
    // Las fechas más pequeñas (viejas) van primero
    colTasks.sort((a, b) => {
      const dateA = a.createdAt?.seconds || 0;
      const dateB = b.createdAt?.seconds || 0;
      return dateA - dateB;
    });

    // 3. Renderizar (Top 5 + Resto oculto)
    const visibleTasks = colTasks.slice(0, 5);
    const hiddenTasks = colTasks.slice(5);

    visibleTasks.forEach((task) => {
      container.appendChild(createTaskElement(task, "sprint", state));
    });

    // Si hay más de 5, creamos el acordeón
    if (hiddenTasks.length > 0) {
      // Separador visual
      const separator = document.createElement("div");
      separator.className = "flex items-center gap-2 py-2";
      separator.innerHTML = `<div class="h-px bg-gray-200 flex-1"></div><span class="text-[10px] text-gray-400 font-medium">Más recientes</span><div class="h-px bg-gray-200 flex-1"></div>`;
      container.appendChild(separator);

      // Botón "Ver más"
      const toggleBtn = document.createElement("button");
      toggleBtn.className =
        "w-full py-1.5 text-xs font-semibold text-gray-500 bg-white border border-gray-200 rounded hover:bg-gray-50 transition-colors mb-2";
      toggleBtn.innerHTML = `<i class="fa-solid fa-chevron-down mr-1"></i> Ver ${hiddenTasks.length} tareas más`;

      // Contenedor oculto
      const hiddenContainer = document.createElement("div");
      hiddenContainer.className = "hidden space-y-3";

      hiddenTasks.forEach((task) => {
        hiddenContainer.appendChild(createTaskElement(task, "sprint", state));
      });

      // Acción del botón
      toggleBtn.onclick = () => {
        hiddenContainer.classList.toggle("hidden");
        const isHidden = hiddenContainer.classList.contains("hidden");
        toggleBtn.innerHTML = isHidden
          ? `<i class="fa-solid fa-chevron-down mr-1"></i> Ver ${hiddenTasks.length} tareas más`
          : `<i class="fa-solid fa-chevron-up mr-1"></i> Ocultar recientes`;
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
      <div class="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
        <div class="flex items-center gap-3">
          <input type="text" id="epics-search" placeholder="Buscar epics por nombre..." 
            class="px-4 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            style="width: 260px; height: 40px;"
            value="${state.epicsSearch}">

          <select id="epics-status-filter" class="py-2 px-3 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none" style="height: 40px;">
            <option value="">Todos los Estados</option>
            <option value="Por Empezar" ${state.epicsStatusFilter === "Por Empezar" ? "selected" : ""}>🚀 Por Empezar</option>
            <option value="En Progreso" ${state.epicsStatusFilter === "En Progreso" ? "selected" : ""}>⚡ En Progreso</option>
            <option value="Completado" ${state.epicsStatusFilter === "Completado" ? "selected" : ""}>✅ Completado</option>
          </select>

          <select id="epics-sort" class="py-2 px-3 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none" style="height: 40px;">
            <option value="recent" ${state.epicsSortMode === "recent" ? "selected" : ""}>Recientes primero</option>
            <option value="progress_asc" ${state.epicsSortMode === "progress_asc" ? "selected" : ""}>Progreso (menor %)</option>
            <option value="progress_desc" ${state.epicsSortMode === "progress_desc" ? "selected" : ""}>Progreso (mayor %)</option>
            <option value="points_asc" ${state.epicsSortMode === "points_asc" ? "selected" : ""}>Puntos (menor)</option>
            <option value="points_desc" ${state.epicsSortMode === "points_desc" ? "selected" : ""}>Puntos (mayor)</option>
          </select>

          <button
            data-action="new-epic"
            class="bg-blue-500 hover:bg-blue-900 text-white font-semibold py-2 px-3 rounded-md flex items-center gap-2 transition-opacity"
            style="height: 40px;"
          >
            <i class="fa-solid fa-plus fa-fw inline-block w-4 h-4 text-current"></i>
            Nuevo Epic
          </button>
        </div>
      </div>
    `;
  }

  if (state.epics.length === 0) {
    container.innerHTML = `<div class="col-span-full text-center py-12 bg-white rounded-xl border-2 border-dashed border-gray-300">
      <div class="text-gray-300 mb-3"><i class="fas fa-book-atlas text-5xl"></i></div>
      <p class="text-gray-500 font-medium">No hay Epics definidos aún.</p>
    </div>`;
    return;
  }

  // Attach listeners (se llama a actions, no manipula DOM directamente)
  const searchInput = document.getElementById("epics-search");
  const statusSelect = document.getElementById("epics-status-filter");
  const sortSelect = document.getElementById("epics-sort");

  if (searchInput && typeof appActions !== "undefined") {
    searchInput.addEventListener("input", (e) => appActions.setEpicsSearch(e.target.value));
  }
  if (statusSelect && typeof appActions !== "undefined") {
    statusSelect.addEventListener("change", (e) => appActions.setEpicsStatusFilter(e.target.value));
  }
  if (sortSelect && typeof appActions !== "undefined") {
    sortSelect.addEventListener("change", (e) => appActions.setEpicsSortMode(e.target.value));
  }

  // Aplicar filtros desde state
  const applyFilters = () => {
    const searchVal = state.epicsSearch.toLowerCase();
    const statusFilter = state.epicsStatusFilter;
    const sortMode = state.epicsSortMode;

    // Filtrado
    let filtered = state.epics.filter((epic) => {
      const matchesSearch =
        epic.title.toLowerCase().includes(searchVal) ||
        (epic.description || "").toLowerCase().includes(searchVal);
      const matchesStatus = !statusFilter || epic.status === statusFilter;
      return matchesSearch && matchesStatus;
    });

    // Ordenamiento
    filtered.sort((a, b) => {
      const getProgress = (e) => {
        const epicTasks = state.tasks.filter((t) => t.epicId === e.id);
        const totalPoints = epicTasks.reduce((sum, t) => sum + (t.points || 0), 0);
        const completedPoints = epicTasks
          .filter((t) => t.status === "completed" || t.kanbanStatus === "done")
          .reduce((sum, t) => sum + (t.points || 0), 0);
        return totalPoints > 0 ? completedPoints / totalPoints : 0;
      };

      const getTotalPoints = (e) => {
        const epicTasks = state.tasks.filter((t) => t.epicId === e.id);
        return epicTasks.reduce((sum, t) => sum + (t.points || 0), 0);
      };

      switch (sortMode) {
        case "progress_asc":
          return getProgress(a) - getProgress(b);
        case "progress_desc":
          return getProgress(b) - getProgress(a);
        case "points_asc":
          return getTotalPoints(a) - getTotalPoints(b);
        case "points_desc":
          return getTotalPoints(b) - getTotalPoints(a);
        case "recent":
        default:
          return (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0);
      }
    });

    // Renderizar tarjetas
    renderEpicCards(filtered, state);
  };

  // Llamar filtros al renderizar
  applyFilters();
}

function renderEpicCards(epics, state) {
  const container = document.getElementById("epics-container");

  // Encontrar o crear contenedor de tarjetas
  let cardsContainer = container.querySelector("#epics-cards-wrapper");
  if (!cardsContainer) {
    cardsContainer = document.createElement("div");
    cardsContainer.id = "epics-cards-wrapper";
    container.appendChild(cardsContainer);
  }

  cardsContainer.className = "grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 items-start";
  cardsContainer.innerHTML = ""; // Limpiar

  if (epics.length === 0) {
    cardsContainer.innerHTML = `<div class="col-span-full text-center py-8 text-gray-500">No se encontraron epics.</div>`;
    return;
  }

  epics.forEach((epic) => {
    // --- CÁLCULOS ---
    const epicTasks = state.tasks.filter((t) => t.epicId === epic.id);
    const totalPoints = epicTasks.reduce((sum, t) => sum + (t.points || 0), 0);
    const completedPoints = epicTasks
      .filter((t) => t.status === "completed" || t.kanbanStatus === "done")
      .reduce((sum, t) => sum + (t.points || 0), 0);
    const progressPercent = totalPoints > 0 ? (completedPoints / totalPoints) * 100 : 0;

    let timeLabel = "Sin fecha";
    let daysRemaining = 0;
    if (epic.startDate && epic.endDate) {
      const start = epic.startDate.toDate ? epic.startDate.toDate() : new Date(epic.startDate);
      const end = epic.endDate.toDate ? epic.endDate.toDate() : new Date(epic.endDate);
      const today = new Date();
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      today.setHours(0, 0, 0, 0);

      const totalDuration = end - start;
      const elapsed = today - start;
      const totalDays = Math.ceil(totalDuration / (1000 * 60 * 60 * 24));
      const daysPassed = Math.ceil(elapsed / (1000 * 60 * 60 * 24));
      daysRemaining = totalDays - daysPassed;

      if (daysPassed < 0) timeLabel = `En ${Math.abs(daysPassed)} días`;
      else if (daysPassed > totalDays) timeLabel = `Fin hace ${daysPassed - totalDays}d`;
      else timeLabel = `Día ${daysPassed}/${totalDays}`;
    }

    // --- HEALTH INDICATOR (NUEVO) ---
    let healthIcon = "●";
    let healthLabel = "On Track";
    let healthColor = "text-green-700";
    // --- TIME-BASED PROGRESS ---
    let percentTimeElapsed = null;
    let deltaPercent = null;
    if (epic.startDate && epic.endDate) {
      const start = epic.startDate.toDate ? epic.startDate.toDate() : new Date(epic.startDate);
      const end = epic.endDate.toDate ? epic.endDate.toDate() : new Date(epic.endDate);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const totalDuration = end - start;
      const rawElapsed = today - start;
      const elapsedMs = Math.max(0, Math.min(rawElapsed, totalDuration));
      percentTimeElapsed = totalDuration > 0 ? (elapsedMs / totalDuration) * 100 : 0;
      deltaPercent = progressPercent - percentTimeElapsed;
    }

    if (totalPoints > 0) {
      const expectedProgress = percentTimeElapsed != null ? percentTimeElapsed : 100;
      if (progressPercent < expectedProgress * 0.7) {
        healthLabel = "Behind";
        healthColor = "text-red-600";
      } else if (progressPercent < expectedProgress) {
        healthLabel = "At Risk";
        healthColor = "text-amber-700";
      }
    }

    const definedKRs = epic.keyResults || [];
    const completedIndices = epic.completedKrIndices || [];
    const validCompletedCount = completedIndices.filter((idx) => idx < definedKRs.length).length;
    const totalDefined = definedKRs.length;
    const krProgress = totalDefined > 0 ? (validCompletedCount / totalDefined) * 100 : 0;
    const isExpanded = state.expandedEpicIds.has(epic.id);

    // HTML KRs
    const krsListHTML = definedKRs
      .map((kr, index) => {
        const isChecked = completedIndices.includes(index);
        return `
        <div class="flex items-start gap-2 text-xs p-2 rounded-md border transition-colors bg-white ${isChecked ? "border-green-200" : "border-gray-200"}">
          <input type="checkbox" 
                 class="epic-kr-checkbox mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer flex-shrink-0"
                 data-epic-id="${epic.id}"
                 data-index="${index}"
                 ${isChecked ? "checked" : ""}>
          <span class="text-gray-700 leading-snug ${isChecked ? "line-through opacity-50" : ""}">${kr}</span>
        </div>`;
      })
      .join("");

    const statusConfig = {
      "Por Empezar": {
        class: "bg-gray-100 text-gray-700 border border-gray-200",
        icon: "fa-hourglass-start",
      },
      "En Progreso": {
        class: "bg-blue-50 text-blue-700 border border-gray-200",
        icon: "fa-person-running",
      },
      Completado: {
        class: "bg-gray-100 text-green-700 border border-green-200",
        icon: "fa-check-circle",
      },
    };
    const statusStyle = statusConfig[epic.status] || statusConfig["Por Empezar"];
    const epicColor = epic.color || "#3b82f6";

    // Progress bar color gradient (rojo -> amarillo -> verde)
    let barColor = "#ef4444"; // rojo
    if (progressPercent > 50) barColor = "#eab308"; // amarillo
    if (progressPercent > 75) barColor = "#22c55e"; // verde

    // Delta badge color based on how far ahead/behind the epic is relative to time
    let deltaColorClass = "text-gray-600";
    if (deltaPercent != null) {
      if (deltaPercent >= 10) deltaColorClass = "text-green-700";
      else if (deltaPercent <= -10) deltaColorClass = "text-red-600";
      else deltaColorClass = "text-amber-700";
    }
    const deltaSign =
      deltaPercent == null ? "" : deltaPercent > 0 ? "+" : deltaPercent < 0 ? "-" : "";

    // --- RENDERIZADO ---
    const epicCard = document.createElement("div");
    epicCard.className =
      "epic-card bg-white rounded-xl shadow-sm border border-gray-200 flex flex-col transition-all duration-200 relative overflow-hidden group h-fit";
    epicCard.dataset.id = epic.id;

    epicCard.innerHTML = `
      <div class="h-1 w-full absolute top-0 left-0" style="background-color: ${epicColor}"></div>

      <div class="p-4">
        <div class="flex justify-between items-center mb-2">
            <div class="flex items-center gap-2">
              <span class="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-semibold uppercase tracking-wider ${statusStyle.class}" style="font-size: 10px;">
                  <i class="fa-solid ${statusStyle.icon}" style="font-size: 10px;"></i> ${epic.status}
              </span>
              <span class="${healthColor}" title="${healthLabel}">${healthIcon}</span>
            </div>
            <div class="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <button data-action="edit-epic" class="text-gray-400 hover:text-blue-600 transition-colors"><i class="fas fa-pencil"></i></button>
                <button data-action="delete-epic" class="text-gray-400 hover:text-red-600 transition-colors"><i class="fas fa-trash-can"></i></button>
            </div>
        </div>

        <div class="mb-2">
            <h3 class="font-semibold text-gray-900 truncate" style="font-size: 16px;" title="${epic.title}">${epic.title}</h3>
            <p class="text-xs text-gray-500 truncate">${epic.description || "Sin descripción."}</p>
        </div>

        <div class="flex items-center justify-between text-xs text-gray-600">
          <span><span class="text-gray-500">Pts</span> <span class="font-semibold text-gray-900">${completedPoints}/${totalPoints}</span></span>
          <span><span class="text-gray-500">Prog</span> <span class="font-semibold text-gray-900">${Math.round(progressPercent)}%</span></span>
          <span><span class="text-gray-500">Tiempo</span> <span class="font-semibold text-gray-900">${timeLabel}</span></span>
          <span class="${deltaColorClass} font-semibold">${deltaPercent != null ? deltaSign + Math.abs(Math.round(deltaPercent)) + "%" : "—"}</span>
        </div>

        <div class="mt-2 w-full bg-gray-200 rounded-full overflow-hidden relative" style="height: 8px;">
          <div 
            class="h-full transition-all duration-500 ease-out rounded-full"
            style="width: ${Math.min(progressPercent, 100)}%; background-color: ${barColor};"
          ></div>
          ${percentTimeElapsed != null ? `<div class="absolute top-0" style="left: ${Math.min(percentTimeElapsed, 100)}%; height:100%; width:2px; transform: translateX(-1px); background-color: rgba(0,0,0,0.25)"></div>` : ``}
        </div>
      </div>

      <button data-action="toggle-details" class="w-full py-2 border-t border-gray-200 text-xs font-semibold text-gray-500 hover:text-blue-600 transition-colors flex items-center justify-center gap-2">
          <span>${isExpanded ? "Ocultar objetivos" : "Ver objetivos"}</span>
          <i class="fas fa-chevron-down transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}"></i>
      </button>

      <div class="bg-gray-50 px-4 pb-4 pt-2 space-y-2 animate-fade-in ${isExpanded ? "" : "hidden"}">
         ${krsListHTML || '<p class="text-xs text-gray-400 italic text-center py-2">Sin KRs definidos.</p>'}
      </div>
    `;

    cardsContainer.appendChild(epicCard);
  });
}

// --- EN ui.js (Reemplaza la función renderMyTasks completa) ---

function renderMyTasks(state) {
  const container = document.getElementById("mytasks-container");
  if (!container || !state.user) return;

  // 1. ESTRUCTURA (Solo la creamos si no existe para no perder el foco al escribir)
  if (!document.getElementById("mytasks-controls-wrapper")) {
    container.innerHTML = `
      <div id="mytasks-controls-wrapper" class="bg-white p-4 rounded-xl shadow-sm border border-gray-200 mb-6 flex flex-col md:flex-row gap-4 justify-between items-end md:items-center">
          
            <div class="w-full md:w-1/3 relative">
              <i class="fas fa-search absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"></i>
              <input type="text" id="mytasks-search" placeholder="Buscar en mis tareas..." 
                class="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all">
            </div>

            <div class="flex items-center gap-3 w-full md:w-auto flex-wrap">
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
              <select id="mytasks-status-filter" class="py-2 pr-6 pl-3 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none hover:bg-gray-50">
                <option value="all">Estado: Todos</option>
                <option value="todo">Por Empezar</option>
                <option value="inprogress">En Progreso</option>
                <option value="completed">Completado</option>
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

              <label class="flex items-center gap-2 cursor-pointer select-none bg-gray-50 px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-100 transition-colors">
                <input type="checkbox" id="mytasks-hide-completed" class="form-checkbox h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-0 cursor-pointer">
                <span class="text-xs font-bold text-gray-600 uppercase">Ocultar Hecho</span>
              </label>
            </div>
      </div>

      <div id="mytasks-list-area" class="space-y-3 pb-10"></div>
    `;

    // --- EVENT LISTENERS (Se asignan una sola vez) ---
    const searchInput = document.getElementById("mytasks-search");
    const sortSelect = document.getElementById("mytasks-sort");
    const hideCheck = document.getElementById("mytasks-hide-completed");

    const sprintSelect = document.getElementById("mytasks-sprint-filter");
    const statusSelect = document.getElementById("mytasks-status-filter");
    const prioritySelect = document.getElementById("mytasks-priority-filter");

    const refresh = () => renderMyTasksListArea(state); // Función auxiliar definida abajo

    searchInput.addEventListener("input", refresh);
    sortSelect.addEventListener("change", refresh);
    hideCheck.addEventListener("change", refresh);
    sprintSelect.addEventListener("change", refresh);
    statusSelect.addEventListener("change", refresh);
    prioritySelect.addEventListener("change", refresh);
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
    // Agrupación visual opcional: Separar "Vencido/Hoy" si estamos en modo urgencia
    // Por simplicidad, renderizamos la lista plana pero ordenada
    myTasks.forEach((t) => {
      listContainer.appendChild(createCompactTaskElement(t, state));
    });

    // Contador de resultados
    const countLabel = document.createElement("div");
    countLabel.className = "text-xs text-gray-400 text-right mt-2 italic";
    countLabel.innerText = `Mostrando ${myTasks.length} tarea(s)`;
    listContainer.appendChild(countLabel);
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

function renderPersonView(state) {
  const container = document.getElementById("view-by-person");
  if (!container) return;
  container.innerHTML = "";

  // 1. HELPERS DE FECHA
  const getStartOfWeek = (d) => {
    const date = new Date(d);
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(date.setDate(diff));
    monday.setHours(0, 0, 0, 0);
    return monday;
  };
  const currentWeekStart = getStartOfWeek(new Date());

  // 2. CONTROLES DE FILTROS
  const controlsDiv = document.createElement("div");
  controlsDiv.className =
    "mb-6 flex flex-wrap gap-4 items-end bg-white p-4 rounded-xl shadow-sm border border-gray-100";

  let sprintOptions = `<option value="all">Todos los Sprints Activos</option>`;

  state.taskLists
    .filter((l) => !l.isBacklog && !l.isArchived)
    .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
    .forEach((s) => {
      // CORRECCIÓN: Quitamos el 'if (s.id !== state.currentSprintId)'
      // Ahora agregamos TODOS los sprints a la lista sin discriminar.
      sprintOptions += `<option value="${s.id}">${s.title}</option>`;
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

  controlsDiv.innerHTML = `
      <div class="flex flex-col gap-1">
          <label class="text-xs font-bold text-gray-500 uppercase">Período</label>
          <select id="person-view-filter" class="p-2 pr-8 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white">
              ${sprintOptions}
          </select>
      </div>
      <div class="flex flex-col gap-1">
          <label class="text-xs font-bold text-gray-500 uppercase">Persona</label>
          <select id="person-view-people-filter" class="p-2 pr-8 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white">
              ${peopleOptions}
          </select>
      </div>

      <div class="flex flex-col justify-end">
         <button id="btn-show-velocity" class="h-[38px] px-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg border border-gray-300 transition-colors flex items-center gap-2 text-sm font-semibold" title="Ver tabla de puntos por semana">
            <i class="fas fa-table"></i> Histórico
         </button>
      </div>
      
      <div class="w-full md:w-auto md:ml-auto flex items-center gap-4 text-xs text-gray-500 bg-gray-50 px-3 py-2 rounded-lg border border-gray-100 mt-2 md:mt-0">
          <div class="flex items-center gap-1.5" title="Puntos terminados desde el lunes">
              <span style="display:inline-block; width:10px; height:10px; border-radius:50%; background-color:#22c55e; border:1px solid #16a34a;"></span>
              <span class="font-medium">Hecho (Semana)</span>
          </div>
          <div class="flex items-center gap-1.5" title="Puntos actualmente en la columna 'En Progreso'">
              <span style="display:inline-block; width:10px; height:10px; border-radius:50%; background-color:#2563eb; border:1px solid #1d4ed8;"></span>
              <span class="font-medium">Carga Viva</span>
          </div>
      </div>
  `;
  container.appendChild(controlsDiv);

  // Restore selections
  const sprintSelect = controlsDiv.querySelector("#person-view-filter");
  if (state.personViewSprintFilter) sprintSelect.value = state.personViewSprintFilter;
  const personSelect = controlsDiv.querySelector("#person-view-people-filter");
  if (state.personViewPersonFilter) personSelect.value = state.personViewPersonFilter;

  if (typeof appActions !== "undefined") {
    sprintSelect.addEventListener("change", (e) =>
      appActions.setPersonViewSprintFilter(e.target.value)
    );
    personSelect.addEventListener("change", (e) =>
      appActions.setPersonViewPersonFilter(e.target.value)
    );
  }

  const btnVelocity = controlsDiv.querySelector("#btn-show-velocity");
  if (btnVelocity) {
    btnVelocity.addEventListener("click", () => showVelocityReport(state));
  }
  // 3. FILTRADO
  let tasksToShow = [];
  if (state.personViewSprintFilter === "all" || !state.personViewSprintFilter) {
    const activeSprintIds = state.taskLists
      .filter((l) => !l.isBacklog && !l.isArchived)
      .map((l) => l.id);
    tasksToShow = state.tasks.filter((t) => activeSprintIds.includes(t.listId));
  } else {
    tasksToShow = state.tasks.filter((t) => t.listId === state.personViewSprintFilter);
  }

  const normalize = (email) => (email ? email.trim().toLowerCase() : "unassigned");
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

  let visibleKeys = Object.keys(grouped);
  if (state.personViewPersonFilter && state.personViewPersonFilter !== "all") {
    const filterKey = normalize(state.personViewPersonFilter);
    visibleKeys = visibleKeys.filter((k) => k === filterKey);
  }

  visibleKeys.sort((a, b) => {
    if (a === "unassigned") return -1;
    if (b === "unassigned") return 1;
    return a.localeCompare(b);
  });

  if (visibleKeys.length === 0) {
    container.innerHTML += `<div class="text-center py-10 text-gray-400 italic">No hay resultados.</div>`;
    return;
  }

  // 4. RENDERIZADO DE CARRILES
  const WEEKLY_CAPACITY = 20;

  visibleKeys.forEach((emailKey) => {
    const tasks = grouped[emailKey];
    const userProfile = profileMap[emailKey];
    const isExpanded = state.expandedPersonViews.has(emailKey);

    // --- CÁLCULO DE MÉTRICAS ---
    const doneThisWeekTasks = tasks.filter((t) => {
      if (t.kanbanStatus !== "done" && t.status !== "completed") return false;
      if (!t.completedAt) return false;
      const d = t.completedAt.toDate ? t.completedAt.toDate() : new Date(t.completedAt);
      return d >= currentWeekStart;
    });
    const ptsDoneThisWeek = doneThisWeekTasks.reduce((sum, t) => sum + (t.points || 0), 0);

    const inProgressTasks = tasks.filter((t) => t.kanbanStatus === "inprogress");
    const ptsInProgress = inProgressTasks.reduce((sum, t) => sum + (t.points || 0), 0);

    const todoTasks = tasks.filter((t) => t.kanbanStatus === "todo");
    const ptsTodo = todoTasks.reduce((sum, t) => sum + (t.points || 0), 0);

    const currentLoad = ptsDoneThisWeek + ptsInProgress + ptsTodo;

    // Porcentajes
    const pctDone = Math.min(100, (ptsDoneThisWeek / WEEKLY_CAPACITY) * 100);
    const pctProg = Math.min(100 - pctDone, (ptsInProgress / WEEKLY_CAPACITY) * 100);
    const spaceLeft = 100 - pctDone - pctProg;
    const pctTodo = Math.min(spaceLeft, (ptsTodo / WEEKLY_CAPACITY) * 100);

    const isOverloaded = currentLoad > WEEKLY_CAPACITY;
    const loadColor = isOverloaded
      ? "text-red-600"
      : currentLoad >= 15
        ? "text-blue-600"
        : "text-gray-500";

    // --- HEADER ---
    const swimlane = document.createElement("div");
    swimlane.className =
      "mb-4 border border-gray-200 rounded-xl shadow-sm bg-white overflow-hidden transition-all duration-200";

    let headerHTML = "";

    if (emailKey === "unassigned") {
      headerHTML = `
        <div class="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50 transition-colors" data-person-toggle="${emailKey}">
           <div class="flex items-center gap-3">
               <div class="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-gray-400"><i class="fas fa-question"></i></div>
               <div>
                   <h3 class="text-base font-bold text-gray-700 italic">Sin Asignar</h3>
                   <p class="text-xs text-gray-500">${tasks.length} tareas</p>
               </div>
           </div>
           <div class="pl-2">
                   <i class="fas fa-chevron-right chevron-icon transition-transform duration-300 text-gray-400" 
              style="transform: ${isExpanded ? "rotate(90deg)" : "rotate(0deg)"}">
           </i>
               </div>
        </div>`;
    } else {
      const avatar =
        userProfile?.photoURL || `https://ui-avatars.com/api/?name=${emailKey.split("@")[0]}`;
      const name = userProfile?.displayName || emailKey;

      headerHTML = `
        <div class="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50 transition-colors group/header" data-person-toggle="${userProfile ? userProfile.email : emailKey}">
           
           <div class="flex items-center gap-3">
               <img src="${avatar}" class="w-10 h-10 rounded-full border border-gray-100 shadow-sm object-cover">
               <div>
                   <div class="flex items-center gap-2">
                       <h3 class="text-base font-bold text-gray-800">${name}</h3>
                       <button data-action="delete-user-profile" data-email="${emailKey}" class="opacity-0 group-hover/header:opacity-100 text-gray-300 hover:text-red-500 transition-opacity p-1" title="Borrar perfil">
                           <i class="fas fa-trash-can text-xs"></i>
                       </button>
                   </div>
               </div>
           </div>

           <div class="flex items-center gap-6">
               
               <div style="width: 140px; height: 12px; background-color: #f3f4f6; border-radius: 9999px; overflow: hidden; display: flex; border: 1px solid #e5e7eb; position: relative;">
                   <div style="width: ${pctDone}%; background-color: #22c55e; height: 100%;" title="Hecho esta semana: ${ptsDoneThisWeek}"></div>
                   <div style="width: ${pctProg}%; background-color: #2563eb; height: 100%;" title="En curso: ${ptsInProgress}"></div>
                   <div style="width: ${pctTodo}%; background-color: #9ca3af; height: 100%; opacity: 0.5;" title="Por Hacer: ${ptsTodo}"></div>
                   
                   ${isOverloaded ? `<div style="position: absolute; right: 0; top: 0; bottom: 0; width: 4px; background-color: #dc2626;"></div>` : ""}
               </div>

               <div class="text-right min-w-[80px]">
                   <span class="block text-sm font-bold ${loadColor}">${currentLoad} / ${WEEKLY_CAPACITY} pts</span>
               </div>
               <div class="pl-2">
                   <i class="fas fa-chevron-right chevron-icon text-gray-400" 
                      style="transform: ${isExpanded ? "rotate(90deg)" : "rotate(0deg)"}">
                   </i>
               </div>
           </div>
        </div>`;
    }

    swimlane.innerHTML = headerHTML;

    // --- BODY ---
    const columnsGrid = document.createElement("div");
    columnsGrid.className = `grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x border-gray-100 bg-gray-50/50 ${isExpanded ? "" : "hidden"}`;

    const cols = {
      todo: { title: "Por Hacer", bg: "bg-transparent" },
      inprogress: { title: "En Progreso", bg: "bg-blue-50/30" },
      done: { title: "Hecho", bg: "bg-green-50/30" },
    };

    Object.keys(cols).forEach((statusKey) => {
      const colDiv = document.createElement("div");

      // CAMBIO 1: Agregamos 'flex flex-col' para que los hijos ocupen altura completa
      colDiv.className = `p-2 min-h-[150px] flex flex-col ${cols[statusKey].bg}`;

      colDiv.dataset.swimlaneStatus = statusKey;
      colDiv.dataset.assignee = emailKey;

      let headerActionHTML = "";

      if (statusKey === "todo") {
        headerActionHTML = `
            <button data-action="quick-add-task-person" data-assignee="${emailKey}" class="ml-auto text-gray-400 hover:text-blue-600 transition-colors" title="Agregar tarea a ${emailKey}">
                <i class="fa-solid fa-plus-circle"></i>
            </button>`;
      }

      // CAMBIO 2: Agregamos 'flex-grow' y 'min-h-[50px]' a la swimlane-drop-zone
      // Esto asegura que la zona de soltar tenga cuerpo aunque esté vacía.
      colDiv.innerHTML = `
        <div class="flex items-center justify-between mb-2 sticky top-0 bg-opacity-90 z-10 px-1 py-1 shrink-0">
            <h4 class="text-[10px] font-bold text-gray-400 uppercase tracking-wider">${cols[statusKey].title}</h4>
            ${headerActionHTML} 
        </div>
        <div class="space-y-2 swimlane-drop-zone flex-grow min-h-[100px] w-full pb-4"></div>`;

      const dropZone = colDiv.querySelector(".swimlane-drop-zone");

      // 1. Filtrado General
      let colTasks = tasks.filter((t) => {
        if (statusKey === "todo")
          return t.kanbanStatus === "todo" || !["inprogress", "done"].includes(t.kanbanStatus);
        return t.kanbanStatus === statusKey;
      });

      // 2. Ordenamiento (Más reciente arriba)
      colTasks.sort((a, b) => {
        const getTime = (t, field) => {
          const val = t[field];
          if (!val) return 0;
          return val.toDate ? val.toDate().getTime() : new Date(val).getTime();
        };
        let dateA, dateB;
        if (statusKey === "done") {
          dateA = getTime(a, "completedAt");
          dateB = getTime(b, "completedAt");
        } else if (statusKey === "inprogress") {
          dateA = getTime(a, "startedAt") || getTime(a, "createdAt");
          dateB = getTime(b, "startedAt") || getTime(b, "createdAt");
        } else {
          dateA = getTime(a, "createdAt");
          dateB = getTime(b, "createdAt");
        }
        return dateB - dateA;
      });

      // 3. LÓGICA ESPECIAL PARA "HECHO" (SEPARAR SEMANA ACTUAL VS ANTERIORES)
      if (statusKey === "done") {
        // A) Separamos las tareas
        const recentTasks = [];
        const oldTasks = [];

        colTasks.forEach((t) => {
          // Si no tiene fecha, asumimos reciente para no perderla
          if (!t.completedAt) {
            recentTasks.push(t);
            return;
          }
          const d = t.completedAt.toDate ? t.completedAt.toDate() : new Date(t.completedAt);
          if (d >= currentWeekStart) {
            recentTasks.push(t);
          } else {
            oldTasks.push(t);
          }
        });

        // B) Renderizamos las RECIENTES (Esta semana)
        // Aplicamos límite de 10 solo si hay muchísimas recientes
        const recentVisible = recentTasks.slice(0, 10);
        const recentHidden = recentTasks.slice(10); // Exceso de la semana actual

        recentVisible.forEach((task) =>
          dropZone.appendChild(createTaskElement(task, "sprint", state))
        );

        // Si hay más de 10 de ESTA semana, botón "Ver más recientes"
        if (recentHidden.length > 0) {
          const moreRecentContainer = document.createElement("div");
          moreRecentContainer.className = "hidden space-y-2";
          recentHidden.forEach((task) =>
            moreRecentContainer.appendChild(createTaskElement(task, "sprint", state))
          );
          dropZone.appendChild(moreRecentContainer);

          const btn = document.createElement("button");
          btn.className =
            "w-full text-xs text-green-700 font-semibold py-1 hover:bg-green-100 rounded mt-1";
          btn.innerHTML = `Ver ${recentHidden.length} más de esta semana`;
          btn.onclick = () => {
            moreRecentContainer.classList.remove("hidden");
            btn.remove();
          };
          dropZone.appendChild(btn);
        }

        // C) Renderizamos las ANTIGUAS (Semanas pasadas) -> SIEMPRE OCULTAS POR DEFECTO
        if (oldTasks.length > 0) {
          // Separador visual
          const separator = document.createElement("div");
          separator.className = "pt-3 mt-2 border-t border-green-200/50";
          dropZone.appendChild(separator);

          // Contenedor Oculto
          const historyContainer = document.createElement("div");
          historyContainer.className = "hidden space-y-2 opacity-80"; // Un poco más transparentes para denotar antigüedad

          oldTasks.forEach((task) =>
            historyContainer.appendChild(createTaskElement(task, "sprint", state))
          );

          // Botón Activador (Estilo carpeta)
          const historyBtn = document.createElement("button");
          historyBtn.className =
            "w-full flex items-center justify-center gap-2 text-xs text-gray-400 hover:text-gray-600 hover:bg-gray-100 py-2 rounded border border-dashed border-gray-300 transition-all";
          historyBtn.innerHTML = `<i class="fa-solid fa-history"></i> <span>Ver ${oldTasks.length} de semanas anteriores</span>`;

          historyBtn.onclick = () => {
            const isHidden = historyContainer.classList.contains("hidden");
            if (isHidden) {
              historyContainer.classList.remove("hidden");
              historyBtn.innerHTML = `<i class="fa-solid fa-chevron-up"></i> Ocultar anteriores`;
              historyBtn.classList.add("bg-gray-50", "text-gray-600");
            } else {
              historyContainer.classList.add("hidden");
              historyBtn.innerHTML = `<i class="fa-solid fa-history"></i> <span>Ver ${oldTasks.length} de semanas anteriores</span>`;
              historyBtn.classList.remove("bg-gray-50", "text-gray-600");
            }
          };

          dropZone.appendChild(historyBtn);
          dropZone.appendChild(historyContainer);
        }
      } else {
        // RENDER NORMAL (ToDo / InProgress)
        colTasks.forEach((task) => dropZone.appendChild(createTaskElement(task, "sprint", state)));
      }

      columnsGrid.appendChild(colDiv);
    });

    swimlane.appendChild(columnsGrid);
    container.appendChild(swimlane);
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

  const filters = [
    { key: "unread", label: "No leídas" },
    { key: "all", label: "Todas" },
  ];
  container.innerHTML = `
    <div class="flex items-center justify-between mb-4">
      <div class="flex items-center gap-2">
        ${filters
          .map((f) => {
            const isActive = filterMode === f.key;
            const classes = isActive
              ? "bg-[#0b56c6] text-white font-semibold"
              : "bg-white hover:bg-gray-100 text-gray-700";
            return `<button data-action="set-activity-filter" data-filter="${f.key}" class="py-1.5 px-3 rounded-lg text-xs shadow-sm border transition-colors ${classes}">${f.label}</button>`;
          })
          .join("")}
      </div>
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
    list.innerHTML =
      filterMode === "all"
        ? '<p class="text-center text-gray-500">No hay notificaciones.</p>'
        : '<p class="text-center text-gray-500">No tienes notificaciones nuevas.</p>';
    return;
  }

  visibleItems.forEach((item) => {
    const taskWrapper = document.createElement("div");
    taskWrapper.className = "bg-white p-4 rounded-xl shadow-md";
    taskWrapper.innerHTML = `
      <div class="flex items-center justify-between mb-2">
        <div class="text-sm text-gray-500">En la tarea: <span class="font-semibold text-blue-600">${item.task.title}</span></div>
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
    const filters = [
      { key: "all", label: "Todos" },
      { key: "active", label: "En Progreso" },
      { key: "future", label: "Futuros" },
      { key: "archived", label: "Archivados" },
    ];
    filterContainer.innerHTML = filters
      .map((f) => {
        const isActive = state.sprintsSummaryFilter === f.key;
        const classes = isActive
          ? "bg-[#0b56c6] text-white font-semibold"
          : "bg-white hover:bg-gray-100 text-gray-700";
        return `<button data-action="set-sprints-summary-filter" data-filter="${f.key}" class="py-2 px-4 rounded-lg text-sm shadow-sm border transition-colors ${classes}">${f.label}</button>`;
      })
      .join("");
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
  const hash = window.location.hash || "#backlog";

  Object.values(views).forEach((view) => view && view.classList.add("hidden"));
  document.querySelectorAll(".sidebar-link").forEach((link) => link.classList.remove("active"));

  document
    .querySelectorAll(".nav-group-button")
    .forEach((button) => button.classList.remove("is-open"));
  document
    .querySelectorAll(".nav-group-content")
    .forEach((content) => content.classList.add("hidden"));

  const headerControls = document.getElementById("header-controls");
  if (headerControls) {
    const isControlView = ["#backlog", "#sprint"].includes(hash);
    headerControls.style.visibility = isControlView ? "visible" : "hidden";
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
          parentGroup.classList.remove("hidden");
        }
      }

      let title = activeLink.querySelector("span").textContent;
      if (hash === "#sprint") {
        renderActiveSprintTitle(state); // Llamamos a la nueva función
      } else {
        dom.viewTitle.textContent = title;
      }
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

export function renderActiveSprintTitle(state) {
  const domViewTitle = document.getElementById("view-title");
  if (!domViewTitle || window.location.hash !== "#sprint") return;

  const selectedSprint = state.taskLists.find((l) => l.id === state.currentSprintId);
  let title = selectedSprint ? selectedSprint.title : "Sprint Activo";

  const sprintTasks = state.tasks.filter((t) => t.listId === state.currentSprintId);
  const completedPoints = sprintTasks
    .filter((t) => t.kanbanStatus === "done")
    .reduce((sum, task) => sum + (task.points || 0), 0);
  const totalPoints = sprintTasks.reduce((sum, task) => sum + (task.points || 0), 0);
  const myPoints = sprintTasks
    .filter((t) => t.assignee === state.user.email)
    .reduce((sum, task) => sum + (task.points || 0), 0);

  domViewTitle.innerHTML = `${title}<span class="view-title-stats">Hechos: ${completedPoints} / Total: ${totalPoints} | Míos: ${myPoints} Pts</span>`;
}

export function renderSprintSelector(state) {
  const sprintListSelect = document.getElementById("sprint-list-select");
  if (!sprintListSelect) return;

  const sprints = state.taskLists
    .filter((l) => !l.isBacklog && !l.isArchived)
    .sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));

  sprintListSelect.innerHTML = "";

  if (sprints.length > 0) {
    sprints.forEach((s) => {
      const option = new Option(s.title, s.id);
      sprintListSelect.add(option);
    });
    sprintListSelect.value = state.currentSprintId;
  } else {
    sprintListSelect.innerHTML = "<option>Crea un sprint</option>";
  }
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

  document.getElementById("modal-theme-title").value = isEditing ? theme.title : "";
  document.getElementById("modal-theme-description").value = isEditing ? theme.description : "";
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

function handleAppClick(e) {
  const target = e.target;
  const actionTarget = target.closest("[data-action]");
  const colorSwatch = target.closest(".color-swatch");

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
      appActions.toggleColumnCollapse(colId);
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
          button.classList.toggle("is-open");
          content.classList.toggle("hidden");
        }
        return;
      }
      /* case "toggle-sprint-menu": {
        const menuContainer = document.getElementById("sprint-menu-container");
        if (menuContainer) {
          menuContainer.classList.toggle("is-active");
        }
        return;
      }
      */

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
        handleEditSprintClick();
        return;
      case "archive-sprint":
        appActions.archiveSprint(appState.currentSprintId);
        return;
      case "delete-sprint":
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

  const epicCard = target.closest(".epic-card");
  if (epicCard && actionTarget) {
    const epicId = epicCard.dataset.id;
    const action = actionTarget.dataset.action;
    if (epicId && action) {
      handleEpicCardAction(action, epicId);
    }
    return;
  }

  const personHeader = target.closest("[data-person-toggle]");
  if (personHeader) {
    const email = personHeader.dataset.personToggle;

    // 1. Elementos (Buscamos 'chevron-icon' para que sea más genérico)
    const chevron = personHeader.querySelector(".chevron-icon");
    const contentBody = personHeader.nextElementSibling;

    // 2. Lógica Visual (0 -> 90 grados)
    if (contentBody) {
      const isHidden = contentBody.classList.contains("hidden");

      if (isHidden) {
        // ABRIR
        contentBody.classList.remove("hidden");
        if (chevron) chevron.style.transform = "rotate(90deg)"; // <--- 90 GRADOS
      } else {
        // CERRAR
        contentBody.classList.add("hidden");
        if (chevron) chevron.style.transform = "rotate(0deg)"; // <--- 0 GRADOS
      }
    }

    // 3. Guardar estado en silencio
    appActions.togglePersonView(email);
  }
}

function handleTaskCardAction(action, taskId) {
  const task = appState.tasks.find((t) => t.id === taskId);
  if (!task) return;
  switch (action) {
    case "due-date":
      showModal({
        title: "Asignar Fecha Compromiso",
        input: true,
        inputType: "date",
        inputValue: task.dueDate
          ? task.dueDate.toDate
            ? task.dueDate.toDate().toISOString().split("T")[0]
            : task.dueDate
          : "",
        okText: "Guardar Fecha",
        callback: (dateVal) => {
          if (dateVal) {
            // Guardamos como Timestamp de Firestore si es posible, o string si no
            const dateObj = new Date(dateVal + "T00:00:00");
            appActions.updateTask(taskId, {
              dueDate: Timestamp.fromDate(dateObj),
            });
          } else {
            appActions.updateTask(taskId, { dueDate: null }); // Borrar si se deja vacío
          }
        },
      });
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
    // --- EN ui.js (dentro de handleTaskCardAction) ---

    // --- EN ui.js (dentro de handleTaskCardAction) ---

    // --- EN ui.js (dentro de handleTaskCardAction) ---

    case "points":
      // ESCALA CORREGIDA: 1 DÍA = 4 PUNTOS (Base: 20 pts/semana)
      const pointOptions = [
        { val: 0.5, label: "1 hr / Quick Fix" },
        { val: 1, label: "2 hrs / Bloque corto" },
        { val: 2, label: "Medio día (4 hrs)" },
        { val: 4, label: "1 día (8 hrs)" },
        { val: 8, label: "2 días" },
        { val: 12, label: "3 días" },
        { val: 20, label: "1 semana (Full)" },
        { val: 40, label: "Sprint Completo (2 sem)" },
      ];

      // Generamos el HTML con diseño de 2 columnas
      let buttonsHTML = pointOptions
        .map((opt) => {
          const isActive =
            task.points === opt.val
              ? "bg-blue-600 text-white ring-2 ring-blue-300 shadow-md"
              : "bg-white border border-gray-200 text-gray-700 hover:bg-blue-50 hover:border-blue-200";

          return `
            <button type="button" class="point-selector-btn ${isActive} flex flex-col items-center justify-center py-2 px-1 rounded-lg transition-all" data-value="${opt.val}">
                <span class="text-lg font-bold">${opt.val}</span>
                <span class="text-[10px] opacity-80 font-medium leading-tight">${opt.label}</span>
            </button>`;
        })
        .join("");

      const contentHTML = `
        <div class="flex flex-col gap-3">
            <p class="text-xs text-gray-500 font-medium uppercase tracking-wide mb-1">Guía de Esfuerzo (Base: 4 pts = 1 día)</p>
            <div class="grid grid-cols-2 gap-2" id="points-grid">
                ${buttonsHTML}
            </div>
            <div class="mt-3 pt-3 border-t border-gray-100">
                 <label class="text-xs text-gray-400 block mb-1">O ingresa valor manual:</label>
                 <input type="number" id="manual-points-input" class="w-full border border-gray-300 rounded-md p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" value="${task.points || 0}" step="0.5">
            </div>
        </div>
      `;

      showModal({
        title: "Asignar Puntos",
        htmlContent: contentHTML,
        okText: "Guardar Puntos",
        callback: () => {
          const selectedBtn = document.querySelector(".point-selector-btn.selected-in-modal");
          let val = selectedBtn ? Number(selectedBtn.dataset.value) : null;

          if (val === null) {
            const manualVal = document.getElementById("manual-points-input").value;
            val = manualVal === "" ? 0 : Number(manualVal);
          }

          appActions.updateTask(taskId, { points: val });
        },
      });

      // Script para selección visual
      setTimeout(() => {
        const grid = document.getElementById("points-grid");
        if (grid) {
          grid.addEventListener("click", (e) => {
            const btn = e.target.closest("button");
            if (btn) {
              grid.querySelectorAll("button").forEach((b) => {
                b.className =
                  "point-selector-btn bg-white border border-gray-200 text-gray-700 hover:bg-blue-50 hover:border-blue-200 flex flex-col items-center justify-center py-2 px-1 rounded-lg transition-all";
              });
              btn.className =
                "point-selector-btn bg-blue-600 text-white ring-2 ring-blue-300 shadow-md flex flex-col items-center justify-center py-2 px-1 rounded-lg transition-all selected-in-modal";
              document.getElementById("manual-points-input").value = btn.dataset.value;
            }
          });
        }
      }, 50);
      break;
    // --- EN ui.js (dentro de handleTaskCardAction) ---

    // --- EN ui.js (dentro de handleTaskCardAction) ---

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
  }
}

function handleEpicCardAction(action, epicId) {
  if (action === "toggle-details") {
    appActions.toggleEpicDetails(epicId);
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
  document.getElementById("modal-sprint-capacity").value = sprint.capacity || "";

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

  const modalOkBtn = document.getElementById("modal-ok-btn");
  const modalCancelBtn = document.getElementById("modal-cancel-btn");
  const sprintSelector = document.getElementById("sprint-list-select");
  const sprintCapacityInput = document.getElementById("sprint-capacity-input");
  const selectAllBacklog = document.getElementById("select-all-backlog-tasks");

  document.addEventListener("click", handleAppClick);
  document.addEventListener("change", handleAppChange);

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
  });

  // --- DRAG OVER (Permitir soltar) ---
  document.addEventListener("dragover", (e) => {
    // 1. Kanban Sprint (Columnas normales)
    if (e.target.closest("#kanban-todo, #kanban-inprogress, #kanban-done")) {
      e.preventDefault();
      return;
    }

    // 2. Swimlanes (Vista por Persona) - DETECCIÓN MEJORADA
    const dropZone = e.target.closest(".swimlane-drop-zone");
    if (dropZone) {
      e.preventDefault();
      dropZone.parentElement.classList.add("bg-gray-100"); // Feedback visual
      return;
    }

    // 3. Matriz Backlog
    const dropQuad = e.target.closest("[data-quad-list]");
    if (dropQuad) {
      e.preventDefault();
      dropQuad.style.backgroundColor = "rgba(59, 130, 246, 0.1)";
    }
  });

  // --- DRAG LEAVE (Limpiar estilos) ---
  document.addEventListener("dragleave", (e) => {
    const dropZone = e.target.closest(".swimlane-drop-zone");
    if (dropZone) {
      dropZone.parentElement.classList.remove("bg-gray-100");
    }
    const dropQuad = e.target.closest("[data-quad-list]");
    if (dropQuad) {
      dropQuad.style.backgroundColor = "";
    }
  });

  // --- DROP (Soltar) ---
  document.addEventListener("drop", (e) => {
    const taskId = appState.draggedTaskId;
    if (!taskId) return;

    // A) Soltar en KANBAN SPRINT (Vista normal)
    const kanbanCol = e.target.closest("#kanban-todo, #kanban-inprogress, #kanban-done");
    if (kanbanCol) {
      e.preventDefault();
      const newStatus = kanbanCol.id.replace("kanban-", ""); // todo, inprogress, done
      updateTaskStatusLogic(taskId, newStatus, null); // null = no cambiar assignee
      return;
    }

    // B) Soltar en SWIMLANES (Vista por Persona)
    const dropZone = e.target.closest(".swimlane-drop-zone");
    if (dropZone) {
      e.preventDefault();
      dropZone.parentElement.classList.remove("bg-gray-100");

      const colDiv = dropZone.parentElement;
      const newStatus = colDiv.dataset.swimlaneStatus;
      const newAssigneeRaw = colDiv.dataset.assignee;
      // Si es "unassigned", mandamos null, si no, el email
      const newAssignee = newAssigneeRaw === "unassigned" ? null : newAssigneeRaw;

      updateTaskStatusLogic(taskId, newStatus, newAssignee);
      return;
    }

    // C) Soltar en MATRIZ BACKLOG
    const dropQuad = e.target.closest("[data-quad-list]");
    if (dropQuad) {
      e.preventDefault();
      dropQuad.style.backgroundColor = "";
      const targetQuad = dropQuad.dataset.quadList;
      const scoreMap = {
        quick: { impact: 3, effort: 2 },
        major: { impact: 3, effort: 3 },
        filler: { impact: 2, effort: 2 },
        maybe: { impact: 2, effort: 3 },
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

    const updates = { kanbanStatus: newStatus };

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
      result = {
        title: document.getElementById("modal-theme-title").value,
        description: document.getElementById("modal-theme-description").value,
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
}
export function hideApp() {
  document.getElementById("main-content")?.classList.add("hidden");
  document.getElementById("sidebar")?.classList.remove("flex");
  document.getElementById("sidebar")?.classList.add("hidden");
  document.getElementById("welcome-message")?.classList.remove("hidden");
}

export function showModal(config) {
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
  };
  Object.keys(modal).forEach((key) => {
    const el = modal[key];
    if (el && el.classList) {
      // Verificamos que el elemento y su lista de clases existan
      el.classList.add("hidden");
      if (key === "text" || el.id === "modal-text") {
        el.textContent = "";
        el.className = "mb-4 hidden";
      }
    }
  });
  modal.overlay.classList.remove("hidden");
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
  if (config.okText) {
    modal.okBtn.textContent = config.okText;
    modal.okBtn.className = `text-white font-semibold py-2 px-4 rounded-lg ${config.okClass || "bg-blue-600 hover:bg-blue-700"}`;
    modal.okBtn.classList.remove("hidden");
  }
  modalCallback = config.callback;
  modal.overlay.style.display = "flex";
}

export function hideModal() {
  if (quillInstance) {
    quillInstance = null;
  }
  const overlay = document.getElementById("modal-overlay");
  if (overlay) overlay.style.display = "none";
  const content = document.getElementById("modal-content");
  if (content) content.removeAttribute("data-active-task-id");
}

export function renderTaskDetails(task, state) {
  const els = {
    title: document.getElementById("modal-task-title"),
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
    // CORRECCIÓN 1: Usamos los IDs que coinciden con tu index.html
    impactContainer: document.getElementById("impactContainer"),
    effortContainer: document.getElementById("effortContainer"),
  };

  if (!els.title) return;

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
    const epicVal = epicRaw !== undefined && epicRaw !== null ? epicRaw : task.epicId ?? "";
    const isEpicMissing = !epicVal;
    setRequiredState(els.epicField, els.epicHint, isEpicMissing);
    setSelectState(els.epicSelect, isEpicMissing);

    const assigneeRaw = document.getElementById("detail-modal-assignee")?.value;
    const assigneeVal =
      assigneeRaw !== undefined && assigneeRaw !== null ? assigneeRaw : task.assignee ?? "";
    const isAssigneeMissing = !assigneeVal;
    setRequiredState(els.assigneeField, els.assigneeHint, isAssigneeMissing);
    setSelectState(document.getElementById("detail-modal-assignee"), isAssigneeMissing);
  };

  // --- 1. DATOS BÁSICOS ---
  els.title.textContent = task.title || "Sin título";
  els.points.textContent = task.points || "0";
  if (els.desc) {
    const descText = (task.description || "").trim();
    els.desc.textContent = descText.length ? descText : "Sin descripción";
    els.desc.classList.toggle("italic", !descText.length);
  }

  // --- 2. RENDERIZADO DE USUARIOS Y PUNTOS (EDITABLES) ---

  // A) SELECTOR DE PUNTOS
  const pointOptions = [0, 0.5, 1, 2, 3, 5, 8, 13, 20, 40];
  let pointsSelectHTML = `<select id="detail-modal-points" class="font-black text-blue-600 bg-transparent border-none focus:ring-0 cursor-pointer text-2xl leading-none appearance-none text-right w-16">`;
  pointOptions.forEach((p) => {
    pointsSelectHTML += `<option value="${p}" ${task.points == p ? "selected" : ""}>${p}</option>`;
  });
  pointsSelectHTML += `</select>`;

  // Reemplazamos el contenido estático
  els.points.innerHTML = pointsSelectHTML;
  els.points.classList.remove("text-3xl"); // Quitamos clases que estorben al select

  // Listener para cambio de puntos
  const pointsSelect = document.getElementById("detail-modal-points");
  if (pointsSelect) {
    pointsSelect.addEventListener("change", (e) => {
      if (typeof appActions !== "undefined") {
        appActions.updateTask(task.id, { points: Number(e.target.value) });
      }
      updateRequiredStates();
    });
  }

  // B) SELECTOR DE ASIGNADO (RESPONSABLE)
  let assigneeSelectHTML = `<select id="detail-modal-assignee" class="w-full text-xs border border-gray-200 rounded p-1 bg-gray-50 text-gray-700 focus:ring-blue-500 outline-none">
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
      if (typeof appActions !== "undefined") {
        appActions.updateTask(task.id, { assignee: e.target.value || null });
      }
      updateRequiredStates();
    });
  }

  // --- 3. SPRINT Y STATUS ---
  const sprint = state.taskLists?.find((l) => l.id === task.listId);
  els.sprint.textContent = sprint ? sprint.title : "Backlog (Sin Sprint)";

  const statusConfig = {
    todo: {
      text: "Por hacer",
      class: "bg-gray-100 text-gray-700 border border-gray-200",
      icon: "fa-regular fa-circle text-gray-500",
    },
    inprogress: {
      text: "En progreso",
      class: "bg-blue-50 text-blue-700 border border-gray-200",
      icon: "fa-solid fa-circle-dot text-blue-600",
    },
    done: {
      text: "Hecho",
      class: "bg-gray-50 text-green-700 border border-green-200",
      icon: "fa-solid fa-check text-green-700",
    },
  };
  const getStatusValue = () =>
    task.kanbanStatus && statusConfig[task.kanbanStatus] ? task.kanbanStatus : "todo";
  const currentStatus = statusConfig[getStatusValue()];
  els.status.className = "shrink-0";
  els.status.innerHTML = `
    <div id="detail-modal-status-wrapper" class="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-semibold uppercase tracking-wider ${currentStatus.class}">
      <i id="detail-modal-status-icon" class="${currentStatus.icon}" style="font-size: 10px;"></i>
      <select id="detail-modal-status" class="bg-transparent border-none text-xs font-semibold uppercase tracking-wider focus:ring-0 outline-none cursor-pointer" style="color: inherit;">
        <option value="todo">Por hacer</option>
        <option value="inprogress">En progreso</option>
        <option value="done">Hecho</option>
      </select>
    </div>
  `;

  const applyStatusUpdate = (newStatus) => {
    const updates = { kanbanStatus: newStatus };
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
    appActions.updateTask(task.id, updates);
  };

  const statusSelect = document.getElementById("detail-modal-status");
  const statusWrapper = document.getElementById("detail-modal-status-wrapper");
  const statusIcon = document.getElementById("detail-modal-status-icon");
  if (statusSelect) {
    statusSelect.value = getStatusValue();
    statusSelect.onchange = (e) => {
      const newStatus = e.target.value;
      const cfg = statusConfig[newStatus] || statusConfig.todo;
      if (statusWrapper) {
        statusWrapper.className = `inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-semibold uppercase tracking-wider ${cfg.class}`;
      }
      if (statusIcon) statusIcon.className = cfg.icon;
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
      if (typeof appActions !== "undefined")
        appActions.updateTask(task.id, { epicId: newEpicId, krId: null });
      updateRequiredStates();
    };
    els.krSelect.onchange = (e) => {
      if (typeof appActions !== "undefined")
        appActions.updateTask(task.id, { krId: e.target.value });
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

export function initializeAuthButtons(actions) {
  const loginButton = document.getElementById("login-button");
  const logoutButton = document.getElementById("auth-button");
  if (loginButton) loginButton.addEventListener("click", actions.login);
  if (logoutButton) logoutButton.addEventListener("click", actions.logout);
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

function showVelocityReport(state) {
  // 1. Obtener todas las tareas completadas
  const completedTasks = state.tasks.filter(
    (t) => (t.status === "completed" || t.kanbanStatus === "done") && t.completedAt
  );

  if (completedTasks.length === 0) {
    alert("No hay tareas completadas para generar el reporte.");
    return;
  }

  // 2. Helper para obtener "Año-Semana" (Ej: "2024-W05")
  const getWeekKey = (date) => {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + 4 - (d.getDay() || 7)); // Ajuste ISO
    const yearStart = new Date(d.getFullYear(), 0, 1);
    const weekNo = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
    return `${d.getFullYear()}-S${weekNo.toString().padStart(2, "0")}`;
  };

  // 3. Organizar datos: Mapa[Email][Semana] = Puntos
  const reportData = {};
  const allWeeks = new Set();
  const userNames = {};

  // Inicializar usuarios
  state.allUsers.forEach((u) => {
    const email = u.email;
    reportData[email] = {};
    userNames[email] = u.displayName || email.split("@")[0];
  });
  // Agregar opción "Sin Asignar"
  reportData["unassigned"] = {};
  userNames["unassigned"] = "Sin Asignar";

  // Rellenar datos
  completedTasks.forEach((t) => {
    const date = t.completedAt.toDate ? t.completedAt.toDate() : new Date(t.completedAt);
    const weekKey = getWeekKey(date);
    const assignee = t.assignee || "unassigned";

    allWeeks.add(weekKey);

    if (!reportData[assignee]) reportData[assignee] = {}; // Por si es un usuario borrado

    const currentPts = reportData[assignee][weekKey] || 0;
    reportData[assignee][weekKey] = currentPts + (t.points || 0);
  });

  // 4. Ordenar semanas (Columnas)
  const sortedWeeks = Array.from(allWeeks).sort().slice(-8); // ÚLTIMAS 8 SEMANAS para que quepa

  // 5. Construir Tabla HTML
  let tableHTML = `
    <div class="overflow-x-auto">
        <table class="min-w-full text-sm text-left text-gray-500 border-collapse">
            <thead class="text-xs text-gray-700 uppercase bg-gray-50 border-b">
                <tr>
                    <th class="px-4 py-3 border-r">Miembro</th>
                    ${sortedWeeks.map((w) => `<th class="px-4 py-3 text-center border-r">${w.replace("-", " ")}</th>`).join("")}
                    <th class="px-4 py-3 text-center bg-gray-100">Promedio</th>
                </tr>
            </thead>
            <tbody class="bg-white">
    `;

  // Generar filas por usuario
  Object.keys(reportData)
    .sort()
    .forEach((email) => {
      // Solo mostrar usuarios que tengan al menos 1 punto en el periodo o sean activos
      const pointsInPeriod = sortedWeeks.map((w) => reportData[email][w] || 0);
      const totalPoints = pointsInPeriod.reduce((a, b) => a + b, 0);

      // Ocultar filas vacías de gente inactiva (opcional, aquí las mostramos todas si son del equipo)
      // Si quieres ocultar vacíos: if (totalPoints === 0 && email !== 'unassigned') return;

      const avg = (totalPoints / sortedWeeks.length).toFixed(1);
      const name = userNames[email] || email;

      // Estilo condicional para el promedio
      let avgColor = "text-gray-600";
      if (avg >= 20) avgColor = "text-green-600 font-bold";
      else if (avg < 10) avgColor = "text-amber-600";

      tableHTML += `
            <tr class="border-b hover:bg-gray-50 transition-colors">
                <td class="px-4 py-3 font-medium text-gray-900 border-r whitespace-nowrap">${name}</td>
                ${pointsInPeriod
                  .map(
                    (pts) => `
                    <td class="px-4 py-3 text-center border-r ${pts > 0 ? "text-blue-600 font-semibold" : "text-gray-300"}">
                        ${pts > 0 ? pts : "-"}
                    </td>
                `
                  )
                  .join("")}
                <td class="px-4 py-3 text-center bg-gray-50 font-bold ${avgColor}">${avg}</td>
            </tr>
        `;
    });

  tableHTML += `</tbody></table></div>
    <p class="text-xs text-gray-400 mt-2 text-right">* Se muestran las últimas 8 semanas con actividad.</p>
    `;

  // 6. Mostrar Modal
  showModal({
    title: "Histórico de Velocidad (Puntos Completados)",
    htmlContent: tableHTML,
    okText: "Cerrar",
  });
}

// --- FIN DEL ARCHIVO ui.js ---
