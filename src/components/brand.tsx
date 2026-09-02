import Image from "next/image";
import Link from "next/link";

import { cn } from "@/lib/utils";

/**
 * The BCJ crest, supplied by the client as `public/logo.png`.
 *
 * It is a circular badge on a cream ground, so it is rendered as a circle with
 * no tile behind it — the dark green tile the earlier mark used would have
 * shown as a cream disc floating on a green square.
 */
export function BrandMark({
  className,
  size = 36,
}: {
  className?: string;
  size?: number;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-white ring-1 ring-black/5",
        className,
      )}
      style={{ width: size, height: size }}
    >
      <Image
        src="/logo.png"
        alt=""
        width={size * 2}
        height={size * 2}
        priority
        className="size-full object-contain"
      />
    </span>
  );
}

export function Brand({
  href = "/",
  className,
  subdued = false,
}: {
  href?: string;
  className?: string;
  subdued?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center gap-2.5 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        className,
      )}
    >
      <BrandMark />
      <span className="flex flex-col leading-none">
        <span
          className={cn(
            "text-[15px] font-semibold tracking-tight",
            subdued ? "text-current" : "text-green-900 dark:text-green-100",
          )}
        >
          BCJ Healthy Living
        </span>
        <span className="mt-0.5 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
          12-week challenge
        </span>
      </span>
    </Link>
  );
}
