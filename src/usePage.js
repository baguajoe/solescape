import { useEffect } from 'react';

/** Sets the browser tab title and the description search engines show. */
export default function usePage(title, description) {
  useEffect(() => {
    document.title = title ? `${title} | SoleScape Foot Spa & Massage` : 'SoleScape Foot Spa & Massage | Mobile massage in Greater Boston';
    if (description) document.querySelector('meta[name="description"]')?.setAttribute('content', description);
  }, [title, description]);
}
