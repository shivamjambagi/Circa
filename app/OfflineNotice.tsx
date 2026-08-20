"use client";

import { useEffect, useState } from "react";

export default function OfflineNotice() {
  const [offline, setOffline] = useState(false);
  useEffect(() => { const update = () => setOffline(!navigator.onLine); update(); window.addEventListener("online", update); window.addEventListener("offline", update); return () => { window.removeEventListener("online", update); window.removeEventListener("offline", update); }; }, []);
  return offline ? <aside className="offline-notice" role="status">You are offline. Personal Maps keep working here; cloud changes will wait until you reconnect.</aside> : null;
}
