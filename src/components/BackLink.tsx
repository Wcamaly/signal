import Link from "next/link";

/** "← Sources" above an item's page: back to the list it was opened from. */
export default function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="text-[12px] text-muted hover:text-ink self-start">
      {label}
    </Link>
  );
}
