export type Status = "PUBLISHED" | "DRAFT" | "ARCHIVED";
export type HeritageSite = { id: string; name: string; location: string; state: string; category: string; era: string; status: Status; updatedAt: string; image: string };
export type TimelineEvent = { id: string; year: string; event: string; description: string; site: string; status: Status };
export type AdminUser = { id: string; name: string; email: string; role: "ADMIN" | "USER"; status: "ACTIVE" | "SUSPENDED"; joined: string };
export type Story = { id: string; title: string; category: string; author: string; status: Status; published: string };

export const heritageSites: HeritageSite[] = [
  { id: "panhala", name: "Panhala Fort", location: "Kolhapur, Maharashtra", state: "Maharashtra", category: "Fort", era: "17th Century", status: "PUBLISHED", updatedAt: "2 hours ago", image: "https://images.unsplash.com/photo-1609920658906-8223bd289001?auto=format&fit=crop&w=500&q=80" },
  { id: "ajanta", name: "Ajanta Caves", location: "Aurangabad, Maharashtra", state: "Maharashtra", category: "Cave", era: "2nd Century BCE", status: "PUBLISHED", updatedAt: "5 hours ago", image: "https://images.unsplash.com/photo-1605649487212-47bdab064df7?auto=format&fit=crop&w=500&q=80" },
  { id: "konark", name: "Konark Sun Temple", location: "Puri, Odisha", state: "Odisha", category: "Temple", era: "13th Century", status: "DRAFT", updatedAt: "Yesterday", image: "https://images.unsplash.com/photo-1599661046289-e31897846e41?auto=format&fit=crop&w=500&q=80" },
  { id: "hampi", name: "Hampi", location: "Vijayanagara, Karnataka", state: "Karnataka", category: "Archaeological site", era: "14th Century", status: "PUBLISHED", updatedAt: "Aug 20, 2026", image: "https://images.unsplash.com/photo-1582510003544-4d00b7f74232?auto=format&fit=crop&w=500&q=80" },
];
export const timelineEvents: TimelineEvent[] = [
  { id: "1", year: "1666", event: "Shivaji escapes Panhala", description: "A defining passage in the fort's Maratha history.", site: "Panhala Fort", status: "PUBLISHED" },
  { id: "2", year: "c. 200 BCE", event: "Ajanta's early caves", description: "The first Buddhist excavations begin.", site: "Ajanta Caves", status: "PUBLISHED" },
  { id: "3", year: "1250", event: "Temple of the sun", description: "Konark is commissioned by Narasimhadeva I.", site: "Konark Sun Temple", status: "DRAFT" },
];
export const adminUsers: AdminUser[] = [
  { id: "1", name: "Aarav Mehta", email: "aarav@heritageverse.in", role: "ADMIN", status: "ACTIVE", joined: "Jan 12, 2025" },
  { id: "2", name: "Diya Nair", email: "diya.nair@example.com", role: "USER", status: "ACTIVE", joined: "Mar 08, 2026" },
  { id: "3", name: "Kabir Shah", email: "kabir.shah@example.com", role: "USER", status: "SUSPENDED", joined: "Apr 19, 2026" },
];
export const stories: Story[] = [
  { id: "1", title: "The fort that watched the Sahyadris", category: "Architecture", author: "Aarav Mehta", status: "PUBLISHED", published: "Aug 22, 2026" },
  { id: "2", title: "Ajanta: colour in the dark", category: "Art & culture", author: "Diya Nair", status: "DRAFT", published: "—" },
  { id: "3", title: "A calendar carved in stone", category: "History", author: "Aarav Mehta", status: "ARCHIVED", published: "Jul 04, 2026" },
];
