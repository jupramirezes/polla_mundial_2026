"""Genera docs/Manual-Polla-Mundial-2026.pdf"""

from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch, cm
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_JUSTIFY
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, PageBreak, Table, TableStyle,
    KeepTogether,
)
import os

OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                   'docs', 'Manual-Polla-Mundial-2026.pdf')

# ---------- Paleta ----------
GREEN_DARK = colors.HexColor('#15803D')
GREEN_LIGHT = colors.HexColor('#DCFCE7')
AMBER = colors.HexColor('#B45309')
AMBER_LIGHT = colors.HexColor('#FEF3C7')
SLATE_DARK = colors.HexColor('#0F172A')
SLATE = colors.HexColor('#475569')
SLATE_LIGHT = colors.HexColor('#F1F5F9')

# ---------- Estilos ----------
styles = getSampleStyleSheet()

title_style = ParagraphStyle(
    'Title', parent=styles['Title'], fontSize=26, leading=32,
    textColor=GREEN_DARK, alignment=TA_CENTER, spaceAfter=4,
)
subtitle_style = ParagraphStyle(
    'Subtitle', parent=styles['Normal'], fontSize=12, leading=16,
    textColor=SLATE, alignment=TA_CENTER, spaceAfter=18,
)
h1_style = ParagraphStyle(
    'H1', parent=styles['Heading1'], fontSize=18, leading=24,
    textColor=GREEN_DARK, spaceBefore=14, spaceAfter=8, fontName='Helvetica-Bold',
)
h2_style = ParagraphStyle(
    'H2', parent=styles['Heading2'], fontSize=14, leading=18,
    textColor=SLATE_DARK, spaceBefore=10, spaceAfter=4, fontName='Helvetica-Bold',
)
h3_style = ParagraphStyle(
    'H3', parent=styles['Heading3'], fontSize=11, leading=14,
    textColor=AMBER, spaceBefore=8, spaceAfter=2, fontName='Helvetica-Bold',
)
body_style = ParagraphStyle(
    'Body', parent=styles['Normal'], fontSize=10, leading=14,
    textColor=SLATE_DARK, alignment=TA_LEFT, spaceAfter=4,
)
bullet_style = ParagraphStyle(
    'Bullet', parent=body_style, fontSize=10, leading=14,
    leftIndent=14, bulletIndent=2, spaceAfter=2,
)
callout_style = ParagraphStyle(
    'Callout', parent=body_style, fontSize=10, leading=14,
    backColor=AMBER_LIGHT, borderColor=AMBER, borderWidth=1, borderPadding=8,
    leftIndent=0, rightIndent=0, spaceBefore=6, spaceAfter=8,
)
url_style = ParagraphStyle(
    'Url', parent=body_style, fontSize=11, leading=14,
    textColor=GREEN_DARK, fontName='Helvetica-Bold', alignment=TA_CENTER,
    backColor=GREEN_LIGHT, borderPadding=8, spaceAfter=12,
)

def p(text, style=body_style):
    return Paragraph(text, style)

def bullet(text):
    return Paragraph(f'&bull;&nbsp;&nbsp;{text}', bullet_style)

def numbered(n, text):
    return Paragraph(f'<b>{n}.</b>&nbsp;&nbsp;{text}', bullet_style)

# ---------- Documento ----------
doc = SimpleDocTemplate(
    OUT, pagesize=letter,
    leftMargin=2*cm, rightMargin=2*cm,
    topMargin=1.5*cm, bottomMargin=2*cm,
    title='Polla Mundial 2026 - Manual',
    author='Polla Mundial 2026',
)
story = []

# =================== PORTADA ===================
story.append(Spacer(1, 0.4*inch))
story.append(p('Polla Mundial 2026', title_style))
story.append(p('Manual de uso', subtitle_style))
story.append(p(
    'polla-mundial-2026-lac.vercel.app',
    url_style,
))

story.append(p(
    'Web app donde los participantes predicen los resultados del Mundial FIFA 2026 '
    '(USA, M&eacute;xico, Canad&aacute;). Cada acierto suma puntos. El ranking se actualiza '
    'en vivo a medida que terminan los partidos.',
    body_style,
))
story.append(p(
    '<b>Total a repartir:</b> 1.160 puntos. '
    '<b>Fechas del mundial:</b> 11 de junio a 19 de julio de 2026.',
    body_style,
))

story.append(Spacer(1, 0.2*inch))

# Resumen de qué se predice
story.append(p('Qu&eacute; se predice (resumen)', h2_style))
items_resumen = [
    ('Marcadores de los 72 partidos de fase de grupos', '360 pts'),
    ('Posiciones finales de cada grupo (4/3/2/1 por grupo)', '120 pts'),
    ('Equipos clasificados a dieciseisavos, octavos, cuartos, semis y final', '252 pts'),
    ('Marcadores de los 32 partidos de eliminatorias', '160 pts'),
    ('Campe&oacute;n, subcampe&oacute;n, tercer y cuarto lugar', '218 pts'),
    ('Goleador del mundial', '50 pts'),
]
tbl = Table(
    [[p(t, body_style), p(v, ParagraphStyle('R', parent=body_style, alignment=2, fontName='Helvetica-Bold', textColor=GREEN_DARK))] for t, v in items_resumen],
    colWidths=[None, 1.2*inch],
)
tbl.setStyle(TableStyle([
    ('VALIGN', (0,0), (-1,-1), 'TOP'),
    ('ROWBACKGROUNDS', (0,0), (-1,-1), [colors.white, SLATE_LIGHT]),
    ('LEFTPADDING', (0,0), (-1,-1), 6),
    ('RIGHTPADDING', (0,0), (-1,-1), 6),
    ('TOPPADDING', (0,0), (-1,-1), 5),
    ('BOTTOMPADDING', (0,0), (-1,-1), 5),
]))
story.append(tbl)

story.append(PageBreak())

# =================== PARTE 1: USUARIO ===================
story.append(p('Para todos los participantes', h1_style))

story.append(p('C&oacute;mo registrarse', h2_style))
story.append(numbered(1, 'Entrar a la URL desde el celular o computador.'))
story.append(numbered(2, 'Click en <b>Crear cuenta</b>. Llenar nombre completo, email y contrase&ntilde;a (m&iacute;nimo 8 caracteres).'))
story.append(numbered(3, 'Quedas logueado autom&aacute;ticamente. Listo para llenar pron&oacute;sticos.'))

story.append(p('Qu&eacute; tienes que llenar (en orden)', h2_style))

# Sección 1 - Fase de grupos
story.append(p('1. Marcadores de fase de grupos (72 partidos)', h3_style))
story.append(p('Entra a <b>Pron&oacute;sticos &rarr; Fase de grupos</b>.', body_style))
story.append(bullet('Cada grupo (A hasta L) se expande con un click. Adentro est&aacute;n los 6 partidos del grupo.'))
story.append(bullet('Pon el marcador que crees: equipo local X &mdash; Y equipo visitante.'))
story.append(bullet('La tabla de posiciones del grupo <b>se calcula sola</b> a medida que vas llenando los marcadores. Los dos primeros se marcan con &check; a R32 (van a dieciseisavos).'))
story.append(bullet('Cada partido tiene su propio bot&oacute;n <b>Guardar</b> con un modal de confirmaci&oacute;n.'))
story.append(bullet('Una vez guardas un partido, queda bloqueado y <b>no puedes cambiarlo</b>. Solo el admin puede editar despu&eacute;s.'))
story.append(bullet('Lo que vas escribiendo sin guardar se queda en tu navegador, as&iacute; que puedes cambiar de pantalla y volver sin perder lo escrito.'))

story.append(p(
    '<b>Tip:</b> llena todos los marcadores que quieres primero, revisa c&oacute;mo te queda la tabla de cada grupo, y al final vas guardando partido por partido. Una vez guardas, no hay vuelta atr&aacute;s.',
    callout_style,
))

# Sección 2 - Bracket
story.append(p('2. Bracket de eliminatorias (octavos &rarr; final + top 4 + goleador)', h3_style))
story.append(p('Entra a <b>Pron&oacute;sticos &rarr; Bracket completo</b>. Tiene 6 pesta&ntilde;as en cascada:', body_style))
story.append(bullet('<b>R32 (Dieciseisavos):</b> esta lista de 32 equipos se llena <b>sola</b> a partir de tus marcadores de grupos (top 2 de cada grupo + los 8 mejores 3ros con regla FIFA: Puntos &rarr; Diferencia de gol &rarr; Goles a favor). Solo se ve, no se edita.'))
story.append(bullet('<b>Octavos:</b> de esos 32, eliges los 16 que crees que pasan.'))
story.append(bullet('<b>Cuartos:</b> de tus 16, eliges 8.'))
story.append(bullet('<b>Semifinales:</b> de tus 8, eliges 4.'))
story.append(bullet('<b>Final:</b> de tus 4, eliges 2.'))
story.append(bullet('<b>Top 4 + Goleador:</b> entre tus 4 semifinalistas asignas campe&oacute;n / subcampe&oacute;n / 3&deg; / 4&deg;, y escribes el nombre del goleador del mundial.'))
story.append(bullet('Cuando todo est&eacute; completo, bot&oacute;n grande <b>Confirmar mi bracket</b>. Modal de confirmaci&oacute;n. Se guarda y se bloquea TODO de una. No podr&aacute;s cambiar octavos, cuartos, semis, final, top 4 ni goleador. Solo el admin.'))

# Sección 3 - KO live
story.append(p('3. Marcadores en eliminatorias (en vivo, durante el mundial)', h3_style))
story.append(p('Entra a <b>Pron&oacute;sticos &rarr; Marcadores en eliminatorias</b>.', body_style))
story.append(bullet('Aqu&iacute; predices el marcador exacto de cada partido KO (R32, octavos, cuartos, semis, tercer puesto, final).'))
story.append(bullet('Cada ronda <b>se abre cuando el admin asigna los enfrentamientos</b> oficiales (apenas FIFA los publica al cerrar la ronda anterior).'))
story.append(bullet('Cada partido tiene bot&oacute;n Guardar individual con modal de confirmaci&oacute;n. Mismo lock que en grupos.'))
story.append(bullet('Tienes hasta antes del pitazo inicial del partido para guardar.'))

story.append(p('Qu&eacute; puedes ver', h2_style))
story.append(bullet('<b>Ranking</b>: el leaderboard con todos los participantes, sus puntos, el campe&oacute;n proyectado de cada uno, el goleador proyectado y sus aciertos. Se actualiza en vivo cuando el admin guarda un resultado oficial.'))
story.append(bullet('<b>Resumen</b>: las predicciones de TODOS los participantes por partido. Solo se ven las predicciones ya guardadas. Cuando hay resultado oficial, marca cada predicci&oacute;n con &check; exacto, &check; ganador o &times;.'))

story.append(PageBreak())

# =================== PARTE 2: SISTEMA DE PUNTOS ===================
story.append(p('Sistema de puntos (1.160 pts total)', h1_style))

points_data = [
    ['Categor&iacute;a', 'Puntos', 'C&oacute;mo se gana'],
    ['Acertar ganador del partido (1X2)', '2 c/u', '72 partidos de grupos + 32 KO'],
    ['Bonus marcador exacto', '3 c/u', 'Adicional al ganador, mismo conteo'],
    ['Posici&oacute;n del grupo: 1&deg;', '4', 'Por cada grupo (12)'],
    ['Posici&oacute;n del grupo: 2&deg;', '3', 'Por cada grupo (12)'],
    ['Posici&oacute;n del grupo: 3&deg;', '2', 'Por cada grupo (12)'],
    ['Posici&oacute;n del grupo: 4&deg;', '1', 'Por cada grupo (12)'],
    ['Equipo correctamente a R32', '2 c/u', '32 equipos'],
    ['Equipo correctamente a Octavos', '3 c/u', '16 equipos'],
    ['Equipo correctamente a Cuartos', '6 c/u', '8 equipos'],
    ['Equipo correctamente a Semis', '12 c/u', '4 equipos'],
    ['Equipo correctamente a la Final', '22 c/u', '2 equipos'],
    ['Campe&oacute;n', '90', 'Si aciertas qui&eacute;n gan&oacute; el mundial'],
    ['Subcampe&oacute;n', '60', 'Si aciertas el perdedor de la final'],
    ['Tercer lugar', '40', 'Si aciertas el ganador del 3er puesto'],
    ['Cuarto lugar', '28', 'Si aciertas el perdedor del 3er puesto'],
    ['Goleador del mundial', '50', 'Si empatan varios, todos los que predijeron a cualquiera ganan'],
]

points_rows = []
for i, row in enumerate(points_data):
    cells = [
        Paragraph(row[0], ParagraphStyle('c1', parent=body_style, fontSize=9, leading=12, fontName='Helvetica-Bold' if i == 0 else 'Helvetica')),
        Paragraph(row[1], ParagraphStyle('c2', parent=body_style, fontSize=9, leading=12, fontName='Helvetica-Bold' if i == 0 else 'Helvetica', alignment=TA_CENTER, textColor=GREEN_DARK if i > 0 else colors.white)),
        Paragraph(row[2], ParagraphStyle('c3', parent=body_style, fontSize=9, leading=12, fontName='Helvetica-Bold' if i == 0 else 'Helvetica')),
    ]
    points_rows.append(cells)

points_table = Table(points_rows, colWidths=[2.8*inch, 0.8*inch, 2.6*inch])
points_table.setStyle(TableStyle([
    ('BACKGROUND', (0, 0), (-1, 0), GREEN_DARK),
    ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
    ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, SLATE_LIGHT]),
    ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ('LEFTPADDING', (0, 0), (-1, -1), 6),
    ('RIGHTPADDING', (0, 0), (-1, -1), 6),
    ('TOPPADDING', (0, 0), (-1, -1), 5),
    ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
]))
story.append(points_table)

story.append(Spacer(1, 0.1*inch))
story.append(p(
    '<b>Anti-trampa:</b> cada partido bloquea individualmente al guardar (no se puede cambiar). '
    'El bracket completo se bloquea con &quot;Confirmar mi bracket&quot;. Solo el admin puede sobreescribir despu&eacute;s. '
    'Por eso es importante revisar bien antes de darle Guardar / Confirmar.',
    callout_style,
))

story.append(PageBreak())

# =================== PARTE 3: ADMIN ===================
story.append(p('Para el administrador', h1_style))
story.append(p(
    'El admin ver&aacute; un bot&oacute;n dorado <b>Admin</b> en la parte de arriba de la app. Ese bot&oacute;n abre el panel con todas las tareas.',
    body_style,
))

story.append(p('Antes del mundial (cierre de inscripciones)', h2_style))
story.append(numbered(1, '<b>Admin &rarr; Usuarios y permisos:</b> verificar que los 20 amigos est&aacute;n registrados.'))
story.append(numbered(2, 'Verificar que todos tienen su bracket confirmado (insignia &quot;bracket confirmado&quot; junto al nombre).'))
story.append(numbered(3, 'Si a alguien le falta, mandar recordatorio por WhatsApp.'))

story.append(p('Durante fase de grupos (11 a 27 de junio)', h2_style))
story.append(p('Cada vez que termine un partido:', body_style))
story.append(numbered(1, '<b>Admin &rarr; 1. Cargar marcadores de partidos.</b>'))
story.append(numbered(2, 'Pesta&ntilde;a <b>Fase de grupos</b>. Los 72 partidos vienen agrupados en acorde&oacute;n por grupo (A-L).'))
story.append(numbered(3, 'Buscar el partido y meter el marcador oficial (ej. 2 &mdash; 1).'))
story.append(numbered(4, 'Se guarda solo. El ranking se recalcula autom&aacute;ticamente.'))

story.append(p('Al terminar la fase de grupos (28 de junio)', h2_style))
story.append(p(
    'FIFA publica oficialmente los 16 enfrentamientos de R32. Son cruces predefinidos por el reglamento '
    '(ej. ganador del grupo C contra subcampe&oacute;n del grupo F).',
    body_style,
))
story.append(numbered(1, '<b>Admin &rarr; 2. Asignar enfrentamientos de eliminatorias.</b>'))
story.append(numbered(2, 'Pesta&ntilde;a <b>R32</b>. En cada uno de los 16 partidos, asignar los dos equipos.'))
story.append(numbered(3, 'Esto abre el formulario para los participantes en &quot;Marcadores en eliminatorias&quot;.'))

story.append(p('Durante las eliminatorias (28 jun a 19 jul)', h2_style))
story.append(p('Por cada partido KO que termine:', body_style))
story.append(numbered(1, '<b>Admin &rarr; 1. Cargar marcadores</b> &rarr; pesta&ntilde;a de la etapa (R32, Octavos, Cuartos, etc.) &rarr; meter marcador.'))
story.append(numbered(2, 'El ranking se recalcula solo: puntos por ganador acertado, marcador exacto, y los que ten&iacute;an a esos equipos como clasificados a esa ronda ya tienen sus puntos.'))

story.append(p('Apenas termine cada ronda completa:', body_style))
story.append(numbered(1, '<b>Admin &rarr; 2. Asignar enfrentamientos</b> &rarr; pesta&ntilde;a de la siguiente ronda &rarr; asignar los enfrentamientos que public&oacute; FIFA.'))
story.append(numbered(2, 'Esto abre el formulario de marcadores para los participantes.'))

story.append(p('El d&iacute;a de la final (19 de julio)', h2_style))
story.append(numbered(1, '<b>Admin &rarr; 4. Top 4 + goleador final.</b>'))
story.append(numbered(2, 'Asignar campe&oacute;n / subcampe&oacute;n / 3&deg; lugar / 4&deg; lugar.'))
story.append(numbered(3, 'Asignar goleador(es) del mundial. Si varios empataron como m&aacute;ximo goleador, agregar todos.'))
story.append(numbered(4, 'Listo. Ranking final cerrado.'))

story.append(p('Gestionar usuarios', h2_style))
story.append(bullet('<b>Admin &rarr; Usuarios y permisos:</b> lista de los 20.'))
story.append(bullet('Click en <b>Hacer admin</b> si quieres a&ntilde;adir m&aacute;s administradores.'))
story.append(bullet('Click en <b>Ver &rarr;</b> en cualquier fila para ver TODAS sus predicciones (marcadores de grupos, bracket, top 4, goleador, marcadores KO).'))
story.append(bullet('Si un usuario pide cambio leg&iacute;timo de su bracket por WhatsApp con raz&oacute;n v&aacute;lida: dentro de su perfil, bot&oacute;n <b>Desbloquear</b> para que pueda volver a editar. Tambi&eacute;n puedes editar t&uacute; directamente como admin.'))

story.append(PageBreak())

# =================== FAQ ===================
story.append(p('Preguntas comunes', h1_style))

faqs = [
    ('No puedo cambiar mi predicci&oacute;n',
     'Es lo esperado: una vez le das Guardar (o Confirmar al bracket), queda bloqueado para evitar trampa. Si la raz&oacute;n del cambio es leg&iacute;tima, el admin lo arregla.'),
    ('El ranking no se actualiza',
     'Refrescar la p&aacute;gina. A veces tarda unos segundos en propagar. Si persiste, avisar al admin.'),
    ('No me lleg&oacute; el correo de confirmaci&oacute;n al registrarme',
     'Avisar al admin para que verifique la configuraci&oacute;n. En general la app no pide confirmaci&oacute;n por email.'),
    ('No s&eacute; qu&eacute; enfrentamientos asignar en eliminatorias',
     'FIFA publica oficialmente los enfrentamientos apenas termina cada ronda. El admin solo copia lo que diga FIFA en la pesta&ntilde;a correspondiente. Los partidos est&aacute;n numerados igual que FIFA (R32-01, R32-02, etc.).'),
    ('Puedo predecir el marcador de un partido KO antes de que se conozca el cruce',
     'No. Cada cruce se abre cuando el admin asigna los dos equipos al partido. Antes de eso, no se puede predecir.'),
    ('Y si quiero apostar plata',
     'La app no maneja plata. La organizan ustedes por fuera (consignaci&oacute;n, etc.). Solo se encarga del puntaje y el ranking.'),
]
for q, a in faqs:
    story.append(p(f'&iquest;{q}?', h3_style))
    story.append(p(a, body_style))

story.append(Spacer(1, 0.3*inch))
story.append(p(
    '<i>Construcci&oacute;n t&eacute;cnica: Juan Pablo Ram&iacute;rez. Operaci&oacute;n del torneo: equipo admin.</i>',
    ParagraphStyle('foot', parent=body_style, alignment=TA_CENTER, fontSize=9, textColor=SLATE),
))

# ---------- Build ----------
os.makedirs(os.path.dirname(OUT), exist_ok=True)
doc.build(story)
print(f'PDF generado en: {OUT}')
