import { useState } from "react";
import MobileFilePicker from "./MobileFilePicker";

const UploadModal = ({
  title,
  open,
  onClose,
  onSubmit,
  loading
}: {
  title: string;
  open: boolean;
  onClose: () => void;
  onSubmit: (file: File) => Promise<void>;
  loading?: boolean;
}) => {
  const [file, setFile] = useState<File | null>(null);

  if (!open) {
    return null;
  }

  return (
    <div className="mobile-sheet">
      <div className="mobile-sheet-card w-full max-w-md">
        <h3 className="text-lg font-bold text-slate-900">{title}</h3>
        <MobileFilePicker file={file} onFileSelect={setFile} accept="image/*,application/pdf" />

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button onClick={onClose} className="btn-secondary rounded-full" disabled={loading}>
            Cancel
          </button>
          <button
            disabled={!file || loading}
            className="btn-primary rounded-full"
            onClick={async () => {
              if (!file) {
                return;
              }
              await onSubmit(file);
              setFile(null);
            }}
          >
            {loading ? "Uploading..." : "Confirm Upload"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default UploadModal;
