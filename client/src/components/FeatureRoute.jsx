import { useAuth } from '../context/AuthContext.jsx';
import { hasFeature } from '../lib/features.js';
import NoAccess from '../pages/NoAccess.jsx';

// Wraps a page route so a direct URL visit to a disabled feature shows an
// explicit "no access" screen instead of the page itself — the sidebar
// already hides the nav entry, but that alone doesn't stop a bookmarked or
// typed-in URL from reaching the page.
export default function FeatureRoute({ feature, children }) {
  const { user } = useAuth();
  if (!hasFeature(user, feature)) return <NoAccess feature={feature} />;
  return children;
}
