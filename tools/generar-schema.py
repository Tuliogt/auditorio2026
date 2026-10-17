"""Une db/base.sql + los asientos de plano.json -> schema.sql (el que se pega en Supabase)."""
import json, pathlib
raiz = pathlib.Path(__file__).resolve().parent.parent
base = (raiz / "db" / "base.sql").read_text(encoding="utf-8")
asientos = json.loads((raiz / "tools" / "plano.json").read_text(encoding="utf-8"))
filas = ",\n".join(f"  ('{a['id']}','{a['fila']}',{a['num']},'{a['zona']}')" for a in asientos)
seed = (f"\n-- ---------- Asientos del plano ({len(asientos)}) ----------\n"
        f"insert into asientos (id, fila, num, zona) values\n{filas}\non conflict (id) do nothing;\n")
# los asientos se insertan justo después de crear la tabla: se agrega antes de la sección de funciones
marca = "-- ---------- Pagos (los sube cada comprador) ----------"
assert marca in base
(raiz / "schema.sql").write_text(base.replace(marca, seed + "\n" + marca, 1), encoding="utf-8")
print("schema.sql listo con", len(asientos), "asientos")
