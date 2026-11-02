// Los datos son archivos JSON publicados junto a la web (carpeta public/data).
// La tarea semanal de GitHub los renueva; «Recargar datos» solo los vuelve a leer.
export async function readData<T = any>(name: string): Promise<T> {
  const r = await fetch(import.meta.env.BASE_URL + 'data/' + name, { cache: 'no-cache' });
  if (!r.ok) throw new Error('No se pudo cargar ' + name);
  return (await r.json()) as T;
}
export async function readOptional<T = any>(name: string): Promise<T | null> {
  try { return await readData<T>(name); } catch { return null; }
}
