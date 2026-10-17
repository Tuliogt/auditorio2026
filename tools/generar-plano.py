"""Genera plano.json (posición de cada asiento) a partir de la transcripción del plano.
Las coordenadas están en píxeles del plano original (1845x1025)."""
import json

STEP = 32.9
asientos = []

def add(fila, n, x, y, zona, rot=0):
    asientos.append({"id": f"{fila}-{n}", "fila": fila, "num": n, "x": round(x, 1), "y": round(y, 1), "zona": zona, "rot": rot})

# ---------- PLATEA ALTA (oscura) ----------
filas_alta = "ABCDEFGHIJKLMN"
def bloques_alta(f):
    if f == "A":  return [(3, 8), (9, 23), (24, 29)]
    if f in "BCDEFGHIJ": return [(1, 8), (9, 23), (24, 31)]
    if f in "KLM": return [(2, 8), (9, 23), (24, 30)]
    if f == "N":  return [(2, 4), None, (28, 30)]
def slot(n):
    return n - 1 if n <= 8 else (n if n <= 23 else n + 1)
for i, f in enumerate(filas_alta):
    y = 103 + 32.8 * i
    for b in bloques_alta(f):
        if not b: continue
        for n in range(b[0], b[1] + 1):
            add(f, n, 388 + STEP * slot(n), y, "alta")

# ---------- PLATEA BAJA (clara) ----------
ys = {"AA": 649, "BB": 682, "CC": 715, "DD": 747, "EE": 780, "FF": 813, "GG": 845, "HH": 878, "II": 910}
baja = {
 "AA": [(5,10),(11,24),(25,30)], "BB": [(4,10),(11,23),(25,31)], "CC": [(2,10),(11,23),(25,33)],
 "DD": [(1,10),(11,23),(25,34)], "EE": [(1,10),(11,23),(25,34)], "FF": [(3,9),(13,22),(27,33)],
 "GG": [(4,9),(13,22),(27,32)], "HH": [(4,8),(14,20),(26,31)], "II": [(4,8),None,None],
}
for f, bl in baja.items():
    corto = f in ("FF", "GG", "HH", "II")
    for k, b in enumerate(bl):
        if not b: continue
        for n in range(b[0], b[1] + 1):
            if k == 0:   x = 321 + (n - (3 if corto else 1)) * STEP
            elif k == 1: x = 697 + (n - 11) * STEP
            else:        x = 1207 + (n - (24 if corto else 25)) * STEP
            add(f, n, x, ys[f], "baja")

# ---------- LATERAL IZQUIERDO (AAA..DDD) ----------
izq = {"AAA": (1, 7), "BBB": (1, 7), "CCC": (3, 7), "DDD": (5, 7)}
for r, (f, (a, b)) in enumerate(izq.items()):
    for n in range(a, b + 1):
        add(f, n, 121 + 30.0 * (n - 1) - 14 * r, 514 + 12.85 * (n - 1) + 33 * r, "lat-izq", 23)

# ---------- LATERAL DERECHO (continúa AA..DD) ----------
der = {"AA": (31, 37, 1521, 595), "BB": (32, 39, 1536, 628), "CC": (34, 38, 1550, 660), "DD": (35, 37, 1563, 692)}
for f, (a, b, x0, y0) in der.items():
    for n in range(a, b + 1):
        add(f, n, x0 + 30.4 * (n - a), y0 - 13.0 * (n - a), "lat-der", -23)

ids = [a["id"] for a in asientos]
assert len(ids) == len(set(ids)), "ids duplicados"
json.dump(asientos, open("plano.json", "w"), ensure_ascii=False)
from collections import Counter
print("total", len(asientos), dict(Counter(a["zona"] for a in asientos)))

# ---------- Overlay de verificación ----------
import cv2
im = cv2.imread("plano-original.png")
for a in asientos:
    cv2.circle(im, (int(a["x"]), int(a["y"])), 11, (0, 200, 0), 1)
cv2.imwrite("overlay.png", im)

# ---------- Archivo para el navegador ----------
etiquetas = []
for i, f in enumerate(filas_alta):
    y = round(103 + 32.8 * i, 1)
    etiquetas += [[f, 651, y, 0], [f, 1177, y, 0]]
for f, y in ys.items():
    etiquetas += [[f, 657, y, 0]] + ([[f, 1166, y, 0]] if f != "II" else [])
etiquetas += [["AAA", 338, 608, 23], ["BBB", 326, 640, 23], ["CCC", 313, 670, 23], ["DDD", 301, 701, 23],
              ["AA", 1493, 611, -23], ["BB", 1503, 641, -23], ["CC", 1517, 673, -23], ["DD", 1530, 704, -23]]
salida = {
    "vista": {"x": 80, "y": 60, "w": 1700, "h": 900},
    "zonas": {  # recuadros para acercar con un toque
        "alta":  [350, 70, 1130, 490],
        "baja":  [290, 620, 1260, 320],
        "izq":   [80, 480, 300, 260],
        "der":   [1440, 480, 340, 260],
        "todo":  [80, 60, 1700, 900],
        "alta_i": [365, 80, 350, 480], "alta_c": [650, 80, 530, 480], "alta_d": [1165, 80, 310, 480],
        "baja_i": [295, 625, 360, 320], "baja_c": [665, 625, 490, 320], "baja_d": [1185, 625, 360, 320],
    },
    "asientos": [[a["id"], a["x"], a["y"], a["rot"], a["fila"], a["num"], a["zona"]] for a in asientos],
    "etiquetas": etiquetas,
}
import pathlib
pathlib.Path("../public").mkdir(exist_ok=True)
pathlib.Path("../public/plano.json").write_text(json.dumps(salida, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
print("public/plano.json escrito")
