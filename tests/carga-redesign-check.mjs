import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

const root = resolve(import.meta.dirname, '..');
const ui = readFileSync(resolve(root, 'js/ui/ui.js'), 'utf8');
const html = readFileSync(resolve(root, 'index.html'), 'utf8');

assert.ok(
  ui.includes('workload-summary-disclosure') && ui.includes('workload-summary-band'),
  'Carga should render the summary as a collapsable disclosure'
);

assert.ok(
  !ui.includes('<h2 class="workload-page-title">Carga</h2>'),
  'Carga should not repeat the section name inside the internal header block'
);

assert.ok(
  ui.includes('workload-control-shell') &&
    ui.includes('workload-control-main') &&
    ui.includes('workload-summary-trigger'),
  'Carga should render a compact unified control shell with a summary trigger'
);

assert.ok(
  ui.includes('person-lane-strip'),
  'Collapsed Carga rows should render the workload lane strip wrapper'
);

assert.ok(
  ui.includes('person-lane-work') && !ui.includes('person-lane-work-caption'),
  'Collapsed Carga rows should keep the pills without rendering a second text row under the bar'
);

assert.ok(
  ui.includes('person-lane-signal'),
  'Collapsed Carga rows should expose one contextual execution signal'
);

assert.ok(
  ui.includes('Atención') && ui.includes('Sin owner'),
  'Sin asignar should use exception language instead of normal capacity status copy'
);

assert.ok(
  !ui.includes('person-workload-done') && !ui.includes('Completado <i'),
  'Collapsed Carga rows should fuse completed progress into the load column'
);

assert.ok(
  !ui.includes('person-context-btn') && !ui.includes('data-person-context'),
  'Collapsed Carga rows should not render a trailing ellipsis context menu'
);

assert.ok(
  ui.includes('person-lane-exception') && ui.includes('sin dueño'),
  'Sin asignar should be treated as an exception row with direct operational copy'
);

assert.ok(
  !ui.includes('<section class="workload-summary-band">'),
  'Carga should not leave the summary band permanently expanded above the lanes'
);

assert.ok(
  html.includes('.person-lane-strip') &&
    html.includes(
      'minmax(260px, 1.4fr) minmax(150px, 0.7fr) minmax(420px, 2fr) minmax(180px, 0.8fr) 32px'
    ),
  'Carga should use the approved 5-zone lane strip grid'
);

assert.ok(
  html.includes('.workload-summary-disclosure') &&
    html.includes('.workload-summary-trigger') &&
    html.includes('.workload-summary-band') &&
    html.includes('.workload-control-shell') &&
    !html.includes('.person-lane-work-caption'),
  'Carga should include the compact workload board and collapsable summary styles'
);

console.log('Carga redesign static checks passed');
