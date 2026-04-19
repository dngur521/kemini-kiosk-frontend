// 🔥 onReject 프롭스를 추가로 받습니다.
const FallbackModal = ({ isOpen, type, data, onSelect, onReject, onClose }) => {
  if (!isOpen) return null;

  // 1. 타입에 따른 제목 설정
  const getTitle = () => {
    if (type === "CONFIRM") return "🤔 이 메뉴가 맞으신가요?";
    if (type === "SIMILAR") return "🔍 혹시 이걸 찾으시나요?";
    return "🔥 이런 메뉴는 어떠세요?";
  };

  // 2. 타입에 따른 설명 문구 설정
  const getSubTitle = () => {
    if (type === "CONFIRM")
      return "말씀하신 내용이 아래 메뉴가 맞는지 확인해 주세요.";
    if (type === "SIMILAR") return "말씀하신 내용과 가장 비슷한 메뉴예요.";
    return "잘 이해하지 못했어요. 대신 인기 메뉴를 추천해 드릴게요!";
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content fallback-modal">
        <h2 className="modal-title">{getTitle()}</h2>
        <p className="modal-subtitle">{getSubTitle()}</p>

        <div className="recommend-grid">
          {data &&
            data.map((menu) => (
              <div
                key={menu.id}
                className="recommend-card"
                onClick={() => onSelect(menu)}
              >
                <img src={menu.imageUrl} alt={menu.name} />
                <div className="recommend-info">
                  <h4>{menu.name}</h4>
                  <span>{menu.price.toLocaleString()}원</span>
                </div>
              </div>
            ))}
        </div>

        <div className="modal-footer">
          {/* 🔥 [핵심] CONFIRM 타입일 때만 전용 버튼 노출 */}
          {type === "CONFIRM" ? (
            <div className="confirm-actions">
              <button
                className="modal-btn btn-primary"
                onClick={() => onSelect(data[0])}
              >
                네, 맞아요
              </button>
              <button className="modal-btn btn-secondary" onClick={onReject}>
                아니오, 달라요
              </button>
            </div>
          ) : (
            <button className="modal-close-btn" onClick={onClose}>
              닫기
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default FallbackModal;
