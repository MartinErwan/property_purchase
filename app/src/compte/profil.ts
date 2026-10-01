import { PROFIL_DEFAUT, type Profil } from '../logique/financement'

/** Ne garde d'un profil venu du compte que les champs connus, du bon type (données extérieures à l'appli). */
export function profilValide(brut: unknown): Partial<Profil> {
  if (!brut || typeof brut !== 'object') return {}
  const res: Record<string, unknown> = {}
  for (const [cle, defaut] of Object.entries(PROFIL_DEFAUT)) {
    const v = (brut as Record<string, unknown>)[cle]
    if (typeof v === typeof defaut && (typeof v !== 'number' || Number.isFinite(v))) res[cle] = v
  }
  return res as Partial<Profil>
}
