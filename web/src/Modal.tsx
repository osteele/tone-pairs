import type { ReactNode } from "react";
import { useEffect, useRef } from "react";
import { FaXmark } from "react-icons/fa6";

interface Props {
  title: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}

/**
 * A native modal <dialog>: the page behind it is inert, Escape closes it, and so does a tap
 * on the backdrop.
 */
export function Modal({ title, open, onClose, children }: Props) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      dialog.focus();
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: the backdrop click is a pointer shortcut; keyboard users close with Escape (native to <dialog>) or the Close button.
    <dialog
      ref={ref}
      tabIndex={-1}
      aria-label={title}
      onClose={onClose}
      // A click whose target is the dialog itself landed on the backdrop, outside the panel.
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="m-auto max-h-[calc(100dvh-2rem)] outline-none w-[calc(100%-2rem)] max-w-md rounded-2xl bg-white p-0 shadow-xl backdrop:bg-stone-900/40"
    >
      <div className="flex flex-col gap-4 p-5">
        <header className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button
            type="button"
            aria-label="Close"
            className="-mr-2 rounded-full p-2 text-stone-500 active:bg-stone-200"
            onClick={onClose}
          >
            <FaXmark size={20} />
          </button>
        </header>
        {children}
      </div>
    </dialog>
  );
}
