"use client";

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  isLoading?: boolean;
}

export default function ConfirmDialog({
  isOpen,
  title,
  message,
  onConfirm,
  onCancel,
  isLoading = false,
}: ConfirmDialogProps) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50"
      onClick={onCancel}
    >
      <div
        className="bg-slate-900 border border-slate-800 rounded-lg p-6 max-w-sm w-full shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-message"
      >
        <h2
          id="confirm-dialog-title"
          className="text-lg font-semibold text-slate-100 mb-2"
        >
          {title}
        </h2>
        <p id="confirm-dialog-message" className="text-sm text-slate-400 mb-6">
          {message}
        </p>
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onCancel}
            disabled={isLoading}
            className="bg-slate-800 text-slate-300 hover:bg-slate-700 px-4 py-2 rounded disabled:cursor-not-allowed disabled:opacity-60"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isLoading}
            className="bg-red-600 text-white hover:bg-red-700 px-4 py-2 rounded ml-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLoading ? "Eliminando..." : "Eliminar"}
          </button>
        </div>
      </div>
    </div>
  );
}
