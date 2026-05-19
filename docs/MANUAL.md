# 📋 Polla Mundial 2026 — Manual de operación

**URL:** https://polla-mundial-2026-lac.vercel.app
**Repo código:** https://github.com/jupramirezes/polla_mundial_2026
**Base de datos:** Supabase (proyecto `frklosfaptkptqmiqlqi`)

---

## 🎯 Qué es

Web app donde los 20 participantes predicen los resultados del Mundial 2026. Cada acierto suma puntos (total a repartir: **1.160 pts**). El ranking se actualiza en vivo a medida que el admin va cargando los resultados oficiales.

---

## ⚽ Lógica del Mundial 2026 (48 equipos)

- **12 grupos de 4 equipos** (A-L). Cada equipo juega 3 partidos. **72 partidos de fase de grupos.**
- **Top 2 de cada grupo + 8 mejores 3ros** clasifican a Dieciseisavos (R32) → **32 equipos**.
- **8 mejores 3ros**: se ranquean los 12 terceros de los grupos por: Puntos → Diferencia de gol → Goles a favor. Los 8 mejores pasan.
- **Eliminatorias**: R32 (16 partidos) → Octavos (8) → Cuartos (4) → Semis (2) → 3er puesto (1) → Final (1). **32 partidos KO**.

### Cómo se definen los enfrentamientos de eliminatorias

FIFA **publica los cruces oficialmente** apenas termina la fase de grupos. El admin solo los copia en la app. La estructura del bracket está predefinida por FIFA: algunos enfrentamientos son fijos (ej. "Ganador del Grupo C vs Subcampeón del Grupo F") y otros involucran terceros (ej. "Ganador del Grupo A vs uno de los 8 mejores 3ros del Grupo C/E/F/H/I"). FIFA define qué tercero específico le toca a cada cruce según los grupos de los que vinieron los 8 que clasificaron.

Resumen para el admin: **no tienes que adivinar nada**, FIFA lo publica y tú lo copias en `/admin/eliminatorias`.

---

## 📊 Sistema de puntos (1.160 pts)

| Categoría | Pts | Cómo se gana |
|---|---|---|
| Acertar ganador del partido | 2 c/u | 72 partidos de grupos + 32 KO = 208 puntos máx |
| Bonus marcador exacto | 3 c/u | Adicional al ganador, mismo conteo (216 + 96 máx) |
| Posición del grupo (1°/2°/3°/4°) | 4/3/2/1 | Por cada grupo, se calculan SOLAS de los marcadores predichos |
| Clasificado a R32 / Oct / 4tos / Semi / Final | 2/3/6/12/22 | Por cada equipo correctamente predicho en esa ronda |
| Campeón / Sub / 3° / 4° | 90/60/40/28 | Asignados desde el bracket del usuario |
| Goleador del mundial | 50 | Si hay empate de goleadores, todos los que predijeron a cualquiera ganan los 50 |

---

## 👤 Para el ADMIN — qué hacer y cuándo

### Antes del mundial (al cierre de inscripciones)

1. **Verificar que todos están registrados**: `/admin/usuarios` → ves los 20.
2. **Verificar que confirmaron bracket**: cada usuario debe tener el badge "🔒 bracket confirmado". Si alguno falta, recordarle por WhatsApp.
3. Cierre automático de pronósticos de grupos: 11 jun 4pm hora Bogotá. Después de eso, nadie puede cambiar marcadores de grupos.

### Durante fase de grupos (11–27 jun)

Apenas termine cada partido:
- `/admin/resultados` → tab **Fase de grupos** → buscar el partido → meter marcador (X – Y)
- Se guarda solo. Ranking se recalcula automático.
- Tip: hay un botón **"🎲 Autollenar grupos"** SOLO para testing — NO lo uses en producción.

### Al cierre de fase de grupos

- FIFA publica los **16 cruces de R32** (qué equipo juega contra cuál).
- `/admin/eliminatorias` → tab **R32** → asigna los 2 equipos a cada uno de los 16 partidos.
- Esto **abre el formulario de pronóstico** para los participantes en `/pronosticos/eliminatorias`.

### Durante eliminatorias (28 jun – 19 jul)

Apenas termine cada partido KO:
- `/admin/resultados` → tab de la etapa → meter marcador.

Al cerrar cada ronda (R32 → octavos → cuartos → semis):
- FIFA publica los cruces de la siguiente.
- `/admin/eliminatorias` → asignar los 2 equipos a cada partido de la siguiente ronda.

### El día de la final (19 jul)

- `/admin/top` → asignar campeón / subcampeón / 3° / 4° + goleador(es).
- Listo. Ranking final.

---

## 🔒 Reglas anti-trampa (importantes)

- **Cada marcador se bloquea al guardar**: el usuario hace click en "Guardar" del partido + modal de confirmación. Después NO puede cambiarlo.
- **El bracket se bloquea con "Confirmar mi bracket"**: una sola acción al final, bloquea octavos/cuartos/semis/final/top4/goleador en bloque.
- **Solo el admin puede sobreescribir** algo bloqueado. Si un usuario pide cambio legítimo: ir a `/admin/usuarios` → click "Ver →" en su fila → botón "Desbloquear" (o editar puntualmente).

---

## 🗺️ Pantallas

### Lo que ve el USUARIO

| Pantalla | Qué hace |
|---|---|
| `/pronosticos/grupos` | Llena los 72 marcadores de fase de grupos. Cada uno con botón Guardar individual. La tabla de posiciones se calcula sola. |
| `/pronosticos/clasificados` | Bracket completo: R32 (auto) → Octavos → Cuartos → Semis → Final → Top 4 + Goleador. Un solo botón **"Confirmar mi bracket"** al final que bloquea todo. |
| `/pronosticos/eliminatorias` | Marcadores de partidos KO en vivo. Cada partido tiene su botón Guardar. Aparece solo cuando el admin asigna los 2 equipos. |
| `/resumen` | Ver predicciones de TODOS los usuarios por partido. Solo se ven las predicciones ya guardadas. |
| `/ranking` | Leaderboard en vivo con campeón proyectado, goleador proyectado y aciertos. Se actualiza solo cuando el admin guarda un resultado. |

### Lo que ve el ADMIN (botón dorado "Admin" en el header)

| Pantalla | Qué hace |
|---|---|
| `/admin/resultados` | ① Cargar marcadores oficiales (lo más frecuente). Tabs por etapa. |
| `/admin/eliminatorias` | ② Asignar los 2 equipos a cada partido de R32/octavos/cuartos/semis/final. |
| `/admin/clasificados` | ③ OPCIONAL — el sistema ya deriva los clasificados automáticamente desde ②. |
| `/admin/top` | ④ Campeón/sub/3°/4° + goleador. El día de la final. |
| `/admin/usuarios` | Lista de los 20. Promover/quitar admin. Click "Ver →" para ver/editar las predicciones de cualquiera. |

---

## 🆘 Troubleshooting

| Problema | Solución |
|---|---|
| Usuario dice "no puedo cambiar mi marcador" | Es lo esperado (anti-trampa). Si la razón es válida, el admin lo edita por él. |
| Usuario no puede registrarse / login | Revisar Supabase → Auth → Users. Si tiene "Email confirmation pending", desactivar "Confirm email" en Authentication → Providers. |
| Ranking no se actualiza tras guardar | Refrescar la página (en raras ocasiones Realtime tarda unos segundos). |
| "Desbloquear bracket" no aplica | Refrescar `/admin/usuarios/[id]`. Si persiste, SQL: `update profiles set bracket_locked_at = null where id = '...';` |
| Quiero borrar TODO y empezar de cero | SQL Editor → ejecutar contenido de `sql/reset_test_data.sql`. Borra todos los pronósticos y resultados oficiales, mantiene usuarios y estructura del torneo. |

---

## 🧰 SQL útil (Supabase SQL Editor)

```sql
-- Promover admin manualmente
update profiles set is_admin = true where email = 'amigo@example.com';

-- Cambiar fecha de cierre de pronósticos de grupos
update phase_locks set locks_at = '2026-06-11T16:00:00-05:00' where phase = 'group';

-- Desbloquear bracket de un usuario
update profiles set bracket_locked_at = null where email = 'usuario@example.com';

-- Borrar todos los datos de prueba (resetear)
-- Ver: sql/reset_test_data.sql
```

---

## 📞 Contacto

- **Construcción técnica**: Juan Pablo Ramírez (rjuanpablohb@gmail.com)
- **Operación durante el mundial**: [tu amigo admin]
