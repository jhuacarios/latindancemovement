import { redirect } from 'next/navigation';

/** Por ahora Comunidad tiene una sola sección: manda directo a ella. */
export default function CommunityPage() {
  redirect('/community/outdoor');
}
