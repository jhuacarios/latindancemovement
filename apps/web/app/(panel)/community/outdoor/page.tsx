'use client';

import { PLACE_KINDS } from '@/lib/community-places';
import { CommunityPlacesView } from '@/components/community-places-view';

export default function OutdoorSocialsPage() {
  return <CommunityPlacesView copy={PLACE_KINDS.OUTDOOR_SOCIAL} />;
}
