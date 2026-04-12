import { useEffect, useState } from "react";
import { getCategories, getMenus } from "./api/kioskApi";
import "./App.css";
import { QuantityModal } from "./components/QuantityModal";
import { useVoiceOrder } from "./hooks/useVoiceOrder";

function App() {
  const [categories, setCategories] = useState([]);
  const [menus, setMenus] = useState([]);
  const [selectedCat, setSelectedCat] = useState("");
  const [cartItems, setCartItems] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMenuName, setModalMenuName] = useState("");

  // 백엔드에서 온 시스템 메시지를 처리하는 함수
  const handleSystemMessage = (message, speak) => {
    console.log("🛠️ 시스템 메시지 분석:", message);

    if (message.startsWith("SYSTEM:ORDER_SUCCESS:")) {
      const [, , name, qty] = message.split(":");
      updateCartItems(name, parseInt(qty));
      speak(`${name} ${qty}개 담았습니다.`);
    } else if (message.startsWith("SYSTEM:REASK_QUANTITY:")) {
      const menuName = message.split(":")[2];
      setModalMenuName(menuName); // 어떤 메뉴인지 저장
      setIsModalOpen(true); // 커스텀 모달 오픈!
      speak(
        `${menuName}을 얼마나 많이 드릴까요? 화면에서 숫자를 선택해 주세요.`,
      );
    } else if (message.startsWith("SYSTEM:CANCEL_SUCCESS:")) {
      const [, , name, qty] = message.split(":");
      handleCancel(name, qty);
      speak(`${name} ${qty === "ALL" ? "전부" : qty + "개"} 취소했습니다.`);
    } else if (message === "SYSTEM:CLEAR_CART_SUCCESS") {
      setCartItems([]);
      speak("장바구니를 모두 비웠습니다.");
    }
  };

  // 모달에서 '확인'을 눌렀을 때 실행될 함수
  const handleModalConfirm = (selectedQty) => {
    updateCartItems(modalMenuName, selectedQty); // 장바구니에 추가
    setIsModalOpen(false); // 모달 닫기
    // 안내 음성도 커스텀 모달에 맞춰서!
    speak(`${modalMenuName} ${selectedQty}개 확인했습니다.`);
  };

  // 음성 인식 훅 연결
  const {
    status,
    transcript,
    isRecording,
    isSpeakingUI,
    connect,
    startRecording,
    stopRecording,
    speak,
  } = useVoiceOrder(handleSystemMessage);

  // 초기 데이터 로드
  useEffect(() => {
    connect(); // 웹소켓 연결
    getCategories().then((data) => {
      setCategories(data);
      if (data.length > 0) setSelectedCat(data[0].name); // 첫 번째 카테고리 자동 선택
    });
    getMenus().then(setMenus);
  }, []);

  // 장바구니 업데이트 로직 (주문)
  const updateCartItems = (name, qty) => {
    setCartItems((prev) => {
      const exist = prev.find((item) => item.name === name);
      if (exist) {
        return prev.map((item) =>
          item.name === name ? { ...item, qty: item.qty + qty } : item,
        );
      }
      return [...prev, { name, qty, time: new Date().toLocaleTimeString() }];
    });
  };

  // 장바구니 업데이트 로직 (취소)
  const handleCancel = (name, qty) => {
    setCartItems((prev) => {
      if (qty === "ALL") return prev.filter((item) => item.name !== name);
      return prev
        .map((item) =>
          item.name === name
            ? { ...item, qty: item.qty - parseInt(qty) }
            : item,
        )
        .filter((item) => item.qty > 0);
    });
  };

  const handleQtyChange = (menuName, delta) => {
    setCartItems((prev) => {
      const existing = prev.find((item) => item.name === menuName);

      if (existing) {
        const newQty = existing.qty + delta;
        if (newQty <= 0) {
          return prev.filter((item) => item.name !== menuName); // 0개면 삭제
        }
        return prev.map((item) =>
          item.name === menuName ? { ...item, qty: newQty } : item,
        );
      } else {
        if (delta <= 0) return prev; // 없는 메뉴를 뺄 순 없음
        return [
          ...prev,
          { name: menuName, qty: 1, time: new Date().toLocaleTimeString() },
        ];
      }
    });
  };

  return (
    <div className="kiosk-wrapper">
      {/* 1. 사이드바: 카테고리 목록 */}
      <aside className="sidebar">
        {categories.map((cat) => (
          <button
            key={cat.id}
            className={selectedCat === cat.name ? "active" : ""}
            onClick={() => setSelectedCat(cat.name)}
          >
            {cat.name.toUpperCase()}
          </button>
        ))}
      </aside>

      {/* 2. 메인: 메뉴 리스트 */}
      <main className="content">
        <header className="kiosk-header">
          <h1>KEMINI CAFE</h1>
          <span
            className={`status ${status === "Connected" ? "connected" : ""}`}
          >
            {status}
          </span>
        </header>

        <div className="menu-grid">
          {menus
            .filter((m) => m.categoryName === selectedCat)
            .map((menu) => {
              // 현재 장바구니에 담긴 수량 확인
              const cartItem = cartItems.find(
                (item) => item.name === menu.name,
              );
              const currentQty = cartItem ? cartItem.qty : 0;

              return (
                <div key={menu.id} className="menu-card">
                  <img src={menu.imageUrl} alt={menu.name} />
                  <div className="menu-info">
                    <h3>{menu.name}</h3>
                    <p>{menu.price.toLocaleString()}원</p>
                  </div>

                  {/* 🔥 메뉴 카드 하단 컨트롤 버튼 추가 */}
                  <div className="menu-controls">
                    <button
                      className="qty-btn"
                      onClick={() => handleQtyChange(menu.name, -1)}
                    >
                      -
                    </button>
                    <span className="current-qty">{currentQty}</span>
                    <button
                      className="qty-btn"
                      onClick={() => handleQtyChange(menu.name, 1)}
                    >
                      +
                    </button>
                  </div>
                </div>
              );
            })}
        </div>

        {/* 3. 푸터: 음성 인식 상태 바 */}
        <footer className="footer">
          <div className="voice-bar">
            {isSpeakingUI
              ? "📢 안내 중..."
              : transcript || "주문하시려면 버튼을 누르세요"}
          </div>
          <button
            className={`mic-btn ${isRecording ? "recording" : ""}`}
            onClick={isRecording ? stopRecording : startRecording}
          >
            {isRecording ? "🛑" : "🎙️"}
          </button>
        </footer>
      </main>

      {/* 4. 장바구니 사이드바 */}
      <section className="cart-sidebar">
        <h3>🛒 장바구니</h3>
        <div className="cart-list" style={{ flex: 1, overflowY: "auto" }}>
          {cartItems.length === 0 ? (
            <p className="empty-msg">주문하신 메뉴가 없습니다.</p>
          ) : (
            cartItems.map((item, idx) => {
              // 전체 메뉴 데이터에서 해당 메뉴의 이미지와 가격을 찾습니다.
              const menuInfo = menus.find((m) => m.name === item.name);
              return (
                <div key={idx} className="cart-item">
                  <img
                    src={menuInfo?.imageUrl}
                    alt={item.name}
                    className="cart-item-img"
                  />
                  <div className="cart-item-info">
                    <h4>{item.name}</h4>
                    <p>{item.qty}개</p>
                  </div>
                  <div className="cart-item-price">
                    {((menuInfo?.price || 0) * item.qty).toLocaleString()}원
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* 하단 총 결제 금액 구역 */}
        <div
          className="cart-footer"
          style={{ borderTop: "2px solid #333", paddingTop: "20px" }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: "1.4rem",
              fontWeight: "bold",
            }}
          >
            <span>총 금액</span>
            <span style={{ color: "var(--danger)" }}>
              {cartItems
                .reduce((acc, cur) => {
                  const price =
                    menus.find((m) => m.name === cur.name)?.price || 0;
                  return acc + price * cur.qty;
                }, 0)
                .toLocaleString()}
              원
            </span>
          </div>
          <button
            className="order-confirm-btn"
            style={{
              width: "100%",
              marginTop: "20px",
              padding: "15px",
              background: "#333",
              color: "white",
              borderRadius: "10px",
              fontSize: "1.2rem",
            }}
          >
            결제하기
          </button>
        </div>
      </section>

      {/* 🚩 커스텀 모달 배치 */}
      <QuantityModal
        isOpen={isModalOpen}
        menuName={modalMenuName}
        onConfirm={handleModalConfirm}
        onClose={() => setIsModalOpen(false)}
      />
    </div>
  );
}

export default App;
