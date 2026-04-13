const PaymentSuccessModal = ({ isOpen, orderNumber, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content success-modal">
        <div className="success-icon">✅</div>
        <h2 style={{ fontSize: "2.5rem", margin: "10px 0" }}>결제 완료!</h2>
        <p style={{ fontSize: "1.2rem", color: "#666" }}>
          주문이 정상적으로 접수되었습니다.
        </p>

        <div className="order-number-box">
          <span>주문 번호 </span>
          <strong className="number">{orderNumber}</strong>
        </div>

        <p className="notice">잠시 후 화면이 자동으로 메인으로 돌아갑니다.</p>
        <button
          className="btn-primary"
          onClick={onClose}
          style={{ marginTop: "20px", width: "100%" }}
        >
          확인
        </button>
      </div>
    </div>
  );
};

export default PaymentSuccessModal;
