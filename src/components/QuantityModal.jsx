import { useEffect, useState } from "react";

export const QuantityModal = ({ isOpen, menuName, onConfirm, onClose }) => {
  const [qty, setQty] = useState(1);

  // 모달이 열릴 때마다 수량을 1로 초기화
  useEffect(() => {
    if (isOpen) setQty(1);
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <h2 style={{ fontSize: "2rem", marginBottom: "10px" }}>
          🥤 {menuName}
        </h2>
        <p style={{ fontSize: "1.2rem", color: "#666" }}>
          얼마나 많이 드릴까요?
        </p>

        <div className="qty-selector">
          <button onClick={() => setQty(Math.max(1, qty - 1))}>-</button>
          <span>{qty}</span>
          <button onClick={() => setQty(qty + 1)}>+</button>
        </div>

        <div
          className="modal-actions"
          style={{ display: "flex", gap: "10px", justifyContent: "center" }}
        >
          <button
            className="btn-secondary"
            onClick={onClose}
            style={{ padding: "15px 30px", fontSize: "1.2rem" }}
          >
            취소
          </button>
          <button
            className="btn-primary"
            onClick={() => onConfirm(qty)}
            style={{
              padding: "15px 30px",
              fontSize: "1.2rem",
              background: "#ffc107",
              border: "none",
              borderRadius: "10px",
              fontWeight: "bold",
            }}
          >
            확인
          </button>
        </div>
      </div>
    </div>
  );
};
