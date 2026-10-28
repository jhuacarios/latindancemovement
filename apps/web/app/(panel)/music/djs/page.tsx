'use client';

import { PLACE_KINDS } from '@/lib/community-places';
import { CommunityPlacesView } from '@/components/community-places-view';

export default function DjsPage() {
  return <CommunityPlacesView copy={PLACE_KINDS.DJ} />;
}
