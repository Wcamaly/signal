"use client";

/** The body of a post and the two buttons that go with it. Nothing else. */
export default function PostEditor({
  value,
  onChange,
  onSave,
  onDiscard,
  dirty,
  pending,
}: {
  value: string;
  onChange: (value: string) => void;
  onSave: () => void;
  onDiscard: () => void;
  dirty: boolean;
  pending: boolean;
}) {
  return (
    <>
      <textarea
        className="textarea min-h-[260px] font-sans"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <div className="flex gap-2 mt-3">
        <button className="btn btn-primary btn-sm" onClick={onSave} disabled={pending || !dirty}>
          {pending ? "Saving…" : "Save"}
        </button>
        <button className="btn btn-ghost btn-sm" onClick={onDiscard} disabled={pending || !dirty}>
          Discard changes
        </button>
      </div>
    </>
  );
}
