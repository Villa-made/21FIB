// Comodidad por navegador: el contrato v1 no tiene "listar mis contribuciones",
// así que recordamos localmente los IDs enviados para poder volver a su estado.
const KEY = 'recentContributions';

export interface RecentContribution {
  id: string;
  actionType: string;
  submittedAt: string;
}

export function getRecent(): RecentContribution[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]') as RecentContribution[];
  } catch {
    return [];
  }
}

export function addRecent(item: RecentContribution): void {
  try {
    const list = [item, ...getRecent().filter((r) => r.id !== item.id)].slice(0, 10);
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // sin almacenamiento local: el usuario sigue viendo el estado en la página actual
  }
}
