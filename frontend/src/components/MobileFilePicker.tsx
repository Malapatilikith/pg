import { useId } from "react";

const MobileFilePicker = ({
  file,
  onFileSelect,
  accept,
  note = "Allowed: jpg, jpeg, png, pdf. Max 5MB.",
  allowCamera = true,
  fileLabel = "Choose File",
  cameraLabel = "Take Photo"
}: {
  file: File | null;
  onFileSelect: (file: File | null) => void;
  accept: string;
  note?: string;
  allowCamera?: boolean;
  fileLabel?: string;
  cameraLabel?: string;
}) => {
  const fileInputId = useId();
  const cameraInputId = useId();

  return (
    <div className="mt-4 space-y-3">
      <p className="text-sm text-slate-500">{note}</p>

      <div className={`grid gap-2 ${allowCamera ? "sm:grid-cols-2" : "sm:grid-cols-1"}`}>
        {allowCamera && (
          <label
            htmlFor={cameraInputId}
            className="inline-flex cursor-pointer items-center justify-center rounded-full bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            {cameraLabel}
            <input
              id={cameraInputId}
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              onChange={(e) => onFileSelect(e.target.files?.[0] || null)}
            />
          </label>
        )}

        <label
          htmlFor={fileInputId}
          className="inline-flex cursor-pointer items-center justify-center rounded-full border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-primary hover:text-primary"
        >
          {fileLabel}
          <input
            id={fileInputId}
            type="file"
            accept={accept}
            className="sr-only"
            onChange={(e) => onFileSelect(e.target.files?.[0] || null)}
          />
        </label>
      </div>

      {file && <p className="text-xs text-slate-500">Selected: {file.name}</p>}
    </div>
  );
};

export default MobileFilePicker;