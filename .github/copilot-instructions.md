# Sprintify - AI Agent Instructions

## Project Overview

**Sprintify** is a collaborative agile project management web app (Spanish language) built with vanilla JavaScript, Firebase, and Tailwind CSS. It enables teams to manage sprints, tasks, epics, and integrate with Google Calendar.

**Key Tech Stack:**

- **Frontend:** ES6+ modules (no bundler), vanilla JS
- **Backend:** Firebase (Firestore + Realtime DB)
- **Auth:** Google OAuth via Firebase Auth
- **UI:** Tailwind CSS 4.1, Quill editor, Chart.js, Font Awesome icons
- **Deployment:** Netlify
- **Code Quality:** ESLint (flat config), Prettier

---

## Architecture Patterns

### Global State Management (`js/core/app.js`)

The app uses a **centralized state object** with action methods (not Redux/Vuex). This is critical to understand:

```javascript
const state = {
  user: null,
  tasks: [], // All tasks across sprints
  taskLists: [], // Sprint containers (backlog, active sprint, etc.)
  currentSprintId: null, // Active sprint reference
  onlineUsers: [], // Real-time presence tracking (RTDB)
  expandedPersonViews: new Set(), // UI state (carril expansions)
  // ... more
};

const actions = {
  setPersonViewPersonFilter(email) {
    /* ... */
  },
  createTask(payload) {
    /* ... */
  },
  // ... 50+ action methods
};
```

**Key patterns:**

- Changes to `state` trigger `requestRender()` which debounces UI updates via `requestAnimationFrame`
- Actions are synchronous; Firebase listeners update state and trigger renders
- Unsubscribe functions stored in `state.unsubscribe[]` to prevent memory leaks

### Firebase Data Hierarchy

All data lives under a **shared namespace** (`artifacts/sprintify-shared-project/public/data/`):

- `taskLists` → Sprint containers (backlog, Sprint 1, etc.)
- `tasks` → Individual task items (with status, assignees, etc.)
- `epics` → Epic groupings
- `profiles` → User profiles (persisted on login)
- `handbook` → Custom knowledge base entries
- `themes` → Team customization

**Real-time Database (RTDB)** is used only for:

- Online user presence (`/presence/{userId}` with `onDisconnect()`)
- Transient state that doesn't need persistence

### Component Communication

Three tiers with **unidirectional data flow**:

1. **`js/core/app.js`** → Orchestrates state, listeners, actions
2. **`js/ui/ui.js`** → Renders DOM from state (3900 lines, stateless rendering functions)
3. **`js/integrations/`** → External API handlers (Google Auth, Calendar)

**Module imports:**

- `firebase.js` exports collections and auth objects, not used directly in UI
- `ui.js` exports pure rendering functions called from `app.js` actions
- `calendar.js` and `auth.js` handle OAuth flows and API calls

---

## Critical Developer Workflows

### Running the Development Server

```bash
npm run lint          # ESLint with flat config
npm run lint:fix      # Auto-fix ESLint issues
npm run format        # Prettier reformat
npm test              # Currently not configured (placeholder)
```

No dev server script exists—open `index.html` directly in browser or use a local HTTP server:

```bash
npx http-server .
```

### Firebase Configuration

- **Config stored in:** [js/core/firebase.js](js/core/firebase.js) (hardcoded, not env vars)
- **Project ID:** `sprintify-815c6`
- **Region:** `America/Monterrey` timezone (for calendar)
- ⚠️ **Security concern:** API keys are exposed; move to environment variables before production

### CSS Architecture

- **Main styles:** [styles/output.css](styles/output.css) (generated from Tailwind)
- **Config:** [tailwind.config.js](tailwind.config.js) with custom colors
- **Input:** [styles/input.css](styles/input.css)
- **Compiled in:** `index.html` inline `<style>` block (custom color palette defined as CSS variables)

### UI Rendering Cycle

1. **Firebase listener fires** → updates `state.tasks`, `state.users`, etc.
2. **`requestRender()` queued** → debounced via `requestAnimationFrame`
3. **`ui.handleRouteChange(state)`** → dispatches render based on current view
4. **View-specific functions called:** `renderBacklogView()`, `renderPersonView()`, `renderTimelineView()`, etc.

**Key UI functions:** All in [js/ui/ui.js](js/ui/ui.js) — no separate component files

- `createTaskElement()` — Renders task cards with time tracking (Days Open, Time in Progress)
- `renderKanbanBoard()` — Sprint task columns (todo/inprogress/done)
- `renderPersonView()` — Swimlanes per team member
- `renderTimelineView()` — Burndown/Gantt visualization

---

## Project-Specific Conventions

### Task Metadata & Time Tracking

Tasks track **four key dates** (all optional Timestamps):

- `createdAt` → Task creation
- `startedAt` → When first moved to "In Progress"
- `completedAt` → When marked done
- `dueDate` → Optional deadline

**Calculations** (in `createTaskElement()`):

- **Days Open** = `(completedAt || now) - createdAt`
- **Time in Progress** = `(completedAt || now) - startedAt`; shown in days/hours

### Sprint Management

- `taskLists` array contains objects with `id`, `name`, `type` (e.g., "backlog", "sprint")
- **Active sprint:** `state.currentSprintId` (set by sprint selector UI)
- **Backlog ID:** `state.backlogId` (fetched on init)
- Views filter tasks by `listId` to separate sprint/backlog displays

### Google Calendar Integration

Sprintify can create Google Calendar events for tasks:

- **Calendar name:** "Sprintify" (auto-created if missing via [js/integrations/calendar.js](js/integrations/calendar.js))
- **Token handling:** Stored in `state.googleAccessToken`; refreshed via `getCalendarAccessToken()`
- **CORS header:** [netlify.toml](netlify.toml) sets `Cross-Origin-Opener-Policy: same-origin-allow-popups` for OAuth popup

### UI State Management

Non-persistent UI state (collapsed sections, expanded carril, filters) stored in `state` Set/String fields:

- `state.expandedPersonViews` → Set of person emails with open swimlanes
- `state.collapsedColumns` → Set of kanban column IDs to hide
- `state.personViewPersonFilter` → Filter by assignee ("all" or email)
- `state.sprintsSummaryFilter` → "active" or other status filter

**These are NOT persisted to Firestore**—resets on page reload.

### Language & Localization

- **Language:** Spanish (es) in `index.html` and UI strings
- **Font:** Inter (from Google Fonts, loaded in `index.html`)
- **Icons:** Font Awesome 6.5.2 from CDN
- **Emoji favicon:** 🚀 (data URI in `<link>` tag)

---

## Key File Reference

| File                                                       | Purpose                                            | Size       |
| ---------------------------------------------------------- | -------------------------------------------------- | ---------- |
| [js/core/app.js](js/core/app.js)                           | State mgmt, action handlers, Firebase listeners    | 1092 lines |
| [js/core/firebase.js](js/core/firebase.js)                 | Firebase SDK init, collection exports              | ~40 lines  |
| [js/ui/ui.js](js/ui/ui.js)                                 | All rendering functions, event listeners           | 3900 lines |
| [js/integrations/auth.js](js/integrations/auth.js)         | Google OAuth, profile persistence                  | 79 lines   |
| [js/integrations/calendar.js](js/integrations/calendar.js) | Google Calendar API calls                          | 99 lines   |
| [index.html](index.html)                                   | Entry point, app shell, inline styles              | 1571 lines |
| [tailwind.config.js](tailwind.config.js)                   | Tailwind theme (custom colors: --brand-700, --ink) | ~17 lines  |

---

## Integration Points & External Dependencies

### Firebase Security Rules

Assuming default public rules (not checked in repo)—enforce authentication checks in production.

### Google APIs

- **OAuth Scopes:** Must include `https://www.googleapis.com/auth/calendar` to create calendar events
- **API Endpoints:**
  - `https://www.googleapis.com/calendar/v3/users/me/calendarList` → List calendars
  - `https://www.googleapis.com/calendar/v3/calendars` → Create calendar
  - `https://www.googleapis.com/calendar/v3/calendars/{id}/events` → Create events

### External CDN Libraries

- Quill (rich text editor): `https://cdn.quilljs.com/1.3.6/`
- Chart.js: `https://cdn.jsdelivr.net/npm/chart.js`
- Google Sign-In: `https://accounts.google.com/gsi/client`

---

## Common Tasks for AI Agents

### Adding a New View

1. Add new view name to route/navigation in `ui.js`
2. Create render function (e.g., `renderNewView(state)`)
3. Call it from `ui.handleRouteChange(state)` switch statement
4. Test with `state` mock containing required fields (tasks, users, sprints)

### Adding Task Fields

1. Update Firestore schema in `tasks` collection document
2. Add field to task creation payload in `app.js` actions
3. Update `createTaskElement()` in `ui.js` to display/edit the field
4. Ensure Timestamps use Firebase's `serverTimestamp()` or `Timestamp` class

### Firebase Listener Best Practices

- Always store unsubscribe function: `state.unsubscribe.push(() => unsubFunc())`
- Clean up in logout: `state.unsubscribe.forEach(unsub => unsub())`
- Use `query(collection, where(...))` to reduce document reads
- Batch writes for multiple updates: `writeBatch()` in `firebase-firestore`

### Testing & Debugging

- Open browser DevTools Console—all errors logged with `[PREFIX]` tags (e.g., `[AUTH]`, `[RENDER]`)
- Firebase emulator not configured—uses live Firebase project
- No unit tests currently—add to `npm test` script as needed

---

## Anti-Patterns to Avoid

1. **Direct DOM manipulation** → Use UI functions in `ui.js`, not `document.querySelector().innerHTML`
2. **Mutating state without actions** → Always use `actions.xyz()` for state changes
3. **Unsubscribed listeners** → Memory leaks; track in `state.unsubscribe[]`
4. **Hardcoded values** → Use `state` or config; especially Firebase credentials
5. **Async/await without error handling** → All promises must catch errors (see calendar.js patterns)
6. **Direct Firestore calls in UI** → Funnel through `app.js` actions for consistency

---

## Next Steps for Contributors

- **Refactor:** Extract [js/ui/ui.js](js/ui/ui.js) (3900 lines) into feature modules
- **Testing:** Add Jest unit tests for actions and Firestore queries
- **Env Vars:** Move Firebase config to `.env` file
- **Security:** Review Firebase rules and OAuth scopes
