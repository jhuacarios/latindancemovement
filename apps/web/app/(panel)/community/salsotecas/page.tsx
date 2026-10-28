'use client';

import { PLACE_KINDS } from '@/lib/community-places';
import { CommunityPlacesView } from '@/components/community-places-view';

export default function SalsotecasPage() {
  return <CommunityPlacesView copy={PLACE_KINDS.SALSOTECA} />;
}
