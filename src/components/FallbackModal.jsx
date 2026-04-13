const FallbackModal = ({ isOpen, type, data, onSelect, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content fallback-modal">
        <h2>
          {type === "SIMILAR"
            ? "🔍 혹시 이걸 찾으시나요?"
            : "🔥 이런 메뉴는 어떠세요?"}
        </h2>
        <p>
          {type === "SIMILAR"
            ? "말씀하신 내용과 비슷한 메뉴예요."
            : "잘 이해하지 못했어요. 대신 인기 메뉴를 추천해 드릴게요!"}
        </p>

        <div className="recommend-grid">
          {data.map((menu) => (
            <div
              key={menu.id}
              className="recommend-card"
              onClick={() => onSelect(menu)}
            >
              <img src={menu.imageUrl} alt={menu.name} />
              <h4>{menu.name}</h4>
              <span>{menu.price.toLocaleString()}원</span>
            </div>
          ))}
        </div>

        <div className="modal-footer">
          <button className="modal-close-btn" onClick={onClose}>
            닫기
          </button>
        </div>
      </div>
    </div>
  );
};

export default FallbackModal;
