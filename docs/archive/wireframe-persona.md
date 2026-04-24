# Wireframe V3 Slim - Seccion "Por Persona"

Objetivo: reducir altura y ruido visual en la cabecera para devolver protagonismo a los carriles/personas.

## Principio de Diseno

- Solo 1 fila principal siempre visible.
- Lo especifico vive en colapsables.
- Mantener visibles solo decisiones de alto uso.

## Desktop (estado base, todo colapsado)

```text
+----------------------------------------------------------------------------------------------------------------+
| [Persona: Todo el equipo v] [Buscar nombre o email.................] [Actual | Historico] [Sprint v] [Filtros]|
|                                                                                                   [Tabla v]    |
+----------------------------------------------------------------------------------------------------------------+
| GRID / CARRILES DE PERSONAS                                                                                   |
+----------------------------------------------------------------------------------------------------------------+
```

## Desktop (con "Filtros" expandido)

```text
+----------------------------------------------------------------------------------------------------------------+
| [Persona v] [Buscar........] [Actual|Historico] [Sprint v] [Filtros (2) activo] [Tabla v]                    |
+----------------------------------------------------------------------------------------------------------------+
| Estado: [Todos] [Sin avance] [Sobrecargados]   Especificos: [Sin asignar x] [Con carga viva x]   [Limpiar]   |
+----------------------------------------------------------------------------------------------------------------+
| GRID / CARRILES DE PERSONAS                                                                                   |
+----------------------------------------------------------------------------------------------------------------+
```

## Desktop (con "Contexto sprint" expandido desde [Sprint v])

```text
+----------------------------------------------------------------------------------------------------------------+
| [Persona v] [Buscar........] [Actual|Historico] [Sprint v] [Filtros] [Tabla v]                               |
+----------------------------------------------------------------------------------------------------------------+
| 02-03-2026 a 16-03-2026 | Meta 40 pts | Equipo 6 | Tareas 184 | Carga viva 79 | Hecho 13 | Act. 10:03        |
+----------------------------------------------------------------------------------------------------------------+
| GRID / CARRILES DE PERSONAS                                                                                   |
+----------------------------------------------------------------------------------------------------------------+
```

## Mobile (estado base)

```text
+----------------------------------------------------+
| [Actual | Historico]                               |
| [Persona: Equipo v]                                |
| [Buscar.............................]              |
| [Sprint v] [Filtros] [Tabla v]                     |
+----------------------------------------------------+
| GRID / CARRILES                                    |
+----------------------------------------------------+
```

## Mobile (estado expandido)

```text
+----------------------------------------------------+
| [Actual | Historico]                               |
| [Persona v]                                         |
| [Buscar.........................]                  |
| [Sprint v] [Filtros (2)] [Tabla v]                |
+----------------------------------------------------+
| [Todos] [Sin avance] [Sobrecargados]              |
| [Sin asignar x] [Con carga viva x] [Limpiar]      |
+----------------------------------------------------+
| GRID / CARRILES                                    |
+----------------------------------------------------+
```

## Que queda visible siempre

- Persona.
- Buscar.
- Vista Actual/Historico.
- Sprint (solo selector, sin KPI fijos).
- Filtros.

## Que pasa a colapsable

- Chips de estado (se muestran solo al abrir Filtros).
- Filtros especificos.
- Metadatos/KPI del sprint (se muestran al abrir Sprint).
- Accion de Tabla historica dentro de `Tabla v` (menu compacto).

## Reglas de Jerarquia (slim)

- Un solo boton de accion secundaria por bloque (`Filtros`, `Tabla`).
- Altura de control unica: 36px desktop, 34px mobile.
- Maximo 6 elementos en la fila principal.
- Sin segunda fila persistente.
- `Resumen de ciclo` se mantiene fuera de esta barra y colapsado por defecto.
