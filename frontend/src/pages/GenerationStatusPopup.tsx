import React, { useEffect } from "react";
import "./GenerationStatusPopup.css";

export type GenerationStatusData = {
  title: string;
  count: number;
  label: string;
  subtitle?: string;
};

type Props = {
  data: GenerationStatusData | null;
  onClose: () => void;
};

export default function GenerationStatusPopup({ data, onClose }: Props) {
  useEffect(() => {
    if (!data) return;
    const timer = window.setTimeout(() => onClose(), 3200);
    return () => window.clearTimeout(timer);
  }, [data, onClose]);

  if (!data) return null;

  return (
    <div className="generation-popup-overlay" onClick={onClose}>
      <div className="generation-popup-card" onClick={(e) => e.stopPropagation()}>
        <div className="generation-popup-status">Completed</div>
        <h3 className="generation-popup-title">{data.title}</h3>
        {data.subtitle ? <p className="generation-popup-subtitle">{data.subtitle}</p> : null}
        <div className="generation-popup-count-wrap">
          <span className="generation-popup-count">{data.count}</span>
          <span className="generation-popup-label">{data.label}</span>
        </div>
        <button type="button" className="generation-popup-close" onClick={onClose}>
          OK
        </button>
      </div>
    </div>
  );
}

