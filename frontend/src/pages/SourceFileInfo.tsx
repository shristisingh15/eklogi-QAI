import React, { useEffect, useState } from "react";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:5004";

type SourceFileInfoProps = {
  projectId?: string | null;
  className?: string;
  style?: React.CSSProperties;
};

type ProjectFile = {
  filename?: string;
  uploadedAt?: string;
};

export default function SourceFileInfo({ projectId, className, style }: SourceFileInfoProps) {
  const [latestFileName, setLatestFileName] = useState<string>("");

  useEffect(() => {
    if (!projectId) {
      setLatestFileName("");
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/projects/${projectId}/files`);
        if (!res.ok) {
          if (!cancelled) setLatestFileName("");
          return;
        }

        const files = (await res.json()) as ProjectFile[];
        if (!Array.isArray(files) || files.length === 0) {
          if (!cancelled) setLatestFileName("");
          return;
        }

        const sorted = [...files].sort((a, b) => {
          const ta = Date.parse(String(a?.uploadedAt || "")) || 0;
          const tb = Date.parse(String(b?.uploadedAt || "")) || 0;
          return tb - ta;
        });

        if (!cancelled) setLatestFileName(String(sorted[0]?.filename || ""));
      } catch {
        if (!cancelled) setLatestFileName("");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [projectId]);

  if (!projectId) return null;

  return (
    <div
      className={className}
      style={{
        marginTop: 8,
        marginBottom: 10,
        color: "#334155",
        ...style,
      }}
    >
      <strong>Files used for BP generation:</strong>{" "}
      {latestFileName || "No uploaded files"}
    </div>
  );
}
