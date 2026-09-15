import { useEffect, useState } from "react";
import { resolveBotPhotoSrc } from "./apiOrigin.js";
import {
  getCachedBotPhotoSync,
  resolveCachedBotPhoto,
  warmBotPhotoCache,
} from "./botPhotoCache.js";

/**
 * Robot / hero avatar that paints from local cache first, then upgrades
 * from network without leaving a blank disc.
 */
export default function BotAvatar({
  bot,
  className = "",
  alt = "",
  width,
  height,
  fallback = "/logo.png",
  fetchPriority,
  decoding = "async",
}) {
  const id = String(bot?.id || "").trim();
  const remote = resolveBotPhotoSrc(bot, fallback);

  const [src, setSrc] = useState(() => {
    const cached = getCachedBotPhotoSync(id);
    if (cached) return cached;
    const photo = String(bot?.photo || "").trim();
    if (photo.startsWith("data:image/") || photo.startsWith("blob:")) return photo;
    // Prefer the real remote URL over the logo so the browser can start
    // decoding immediately on first visit (cache still fills in the background).
    if (remote && remote !== fallback) return remote;
    return fallback || "/logo.png";
  });

  useEffect(() => {
    let cancelled = false;

    const applyInstant = () => {
      const cached = getCachedBotPhotoSync(id);
      if (cached) {
        setSrc(cached);
        return;
      }
      const photo = String(bot?.photo || "").trim();
      if (photo.startsWith("data:image/") || photo.startsWith("blob:")) {
        setSrc(photo);
        return;
      }
      if (remote && remote !== (fallback || "/logo.png")) {
        setSrc(remote);
        return;
      }
      setSrc(fallback || "/logo.png");
    };

    applyInstant();

    warmBotPhotoCache()
      .then(() => {
        if (cancelled) return;
        const cached = getCachedBotPhotoSync(id);
        if (cached) setSrc(cached);
      })
      .catch(() => {});

    resolveCachedBotPhoto(bot, fallback)
      .then((url) => {
        if (!cancelled && url) setSrc(url);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [id, bot?.photo, remote, fallback]);

  return (
    <img
      className={className}
      src={src || fallback || "/logo.png"}
      alt={alt}
      width={width}
      height={height}
      decoding={decoding}
      loading={fetchPriority === "high" ? "eager" : "lazy"}
      fetchPriority={fetchPriority}
      onError={(event) => {
        const node = event.currentTarget;
        if (!node) return;
        if (node.dataset.fallbackApplied === "1") return;
        node.dataset.fallbackApplied = "1";
        node.src = fallback || "/logo.png";
      }}
    />
  );
}
