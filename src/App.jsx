import { useCallback, useEffect, useRef, useState } from "react";
import { fetchTop3Menus } from "./api/kioskApi";
import "./App.css";
import FallbackModal from "./components/FallbackModal";
import PaymentSuccessModal from "./components/PaymentSuccessModal";
import { QuantityModal } from "./components/QuantityModal";
import { useKioskLogic } from "./hooks/useKioskLogic";
import { useVoiceOrder } from "./hooks/useVoiceOrder";

function App() {
  const logic = useKioskLogic();

  // 🎓 학습을 위해 발화 내용을 임시 저장하는 상태
  const [learningText, setLearningText] = useState("");
  // 실제 웹소켓 세션 ID를 저장할 상태
  const [realSessionId, setRealSessionId] = useState("");

  // 🔥 [핵심] 보이스 훅이 언제든 최신 메뉴를 볼 수 있게 하는 Ref
  const menusRef = useRef([]);
  useEffect(() => {
    menusRef.current = logic.menus;
  }, [logic.menus]);

  // 🗣️ [핵심] transcript의 최신 상태를 실시간으로 추적하는 Ref (클로저 문제 완전 해결)
  const transcriptRef = useRef("");

  // 🗣️ 시스템 메시지 처리 함수
  const handleSystemMessage = useCallback(
    async (message, speak) => {
      if (message.startsWith("SYSTEM:SESSION_ID:")) {
        const sid = message.split(":")[2];
        setRealSessionId(sid);
        return;
      }
      console.log("🛠️ 시스템 메시지 분석:", message);
      // 현재 시점의 가장 최신 발화 내용을 가져옴
      const currentTranscript = transcriptRef.current;

      try {
        // 1. 유사 메뉴 추천 (RECOMMEND_LIST)
        if (message.startsWith("SYSTEM:RECOMMEND_LIST:")) {
          const jsonPart = message.replace("SYSTEM:RECOMMEND_LIST:", "");
          const recommended = JSON.parse(jsonPart);

          // 🔥 현재 발화를 learningText에 박제 (나중에 클릭 시 사용)
          console.log("📍 추천 시점 발화 박제:", currentTranscript);
          setLearningText(currentTranscript);

          logic.setFallback({ open: true, type: "SIMILAR", data: recommended });
          speak("비슷한 메뉴를 찾았어요. 화면에서 선택해 주세요.");
        }
        // 2. 알 수 없는 명령어 (TOP3 추천)
        else if (message === "SYSTEM:UNKNOWN_COMMAND") {
          const top3 = await fetchTop3Menus();

          // 🔥 이때도 학습을 위해 현재 발화 박제
          setLearningText(currentTranscript);

          logic.setFallback({ open: true, type: "TOP3", data: top3 });
          speak("잘 이해하지 못했어요. 대신 인기 메뉴를 추천해 드릴게요.");
        }
        // 3. 주문 성공
        else if (message.startsWith("SYSTEM:ORDER_SUCCESS:")) {
          const [, , name, qty] = message.split(":");
          const menuObj = menusRef.current.find((m) => m.name === name);
          if (menuObj) {
            logic.updateCartItems(menuObj, parseInt(qty));
            speak(`${name} 담았습니다.`);
          }
        }
        // 4. 수량 재확인
        else if (message.startsWith("SYSTEM:REASK_QUANTITY:")) {
          const menuName = message.split(":")[2];
          logic.setModalMenuName(menuName);
          logic.setIsModalOpen(true);
          speak(`${menuName} 몇 개 드릴까요?`);
        }
        // 5. 취소 성공
        else if (message.startsWith("SYSTEM:CANCEL_SUCCESS:")) {
          const [, , name, qty] = message.split(":");
          logic.handleCancel(name, qty);
          speak(`${name} ${qty === "ALL" ? "전부" : qty + "개"} 취소했습니다.`);
        }
        // 6. 장바구니 비우기 성공
        else if (message === "SYSTEM:CLEAR_CART_SUCCESS") {
          logic.clearCart();
          speak("장바구니를 모두 비웠습니다.");
        }
      } catch (err) {
        console.error("시스템 메시지 처리 에러:", err);
      }
    },
    [
      logic.updateCartItems,
      logic.handleCancel,
      logic.clearCart,
      logic.setFallback,
      logic.setIsModalOpen,
      logic.setModalMenuName,
    ],
  );

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

  // 🔥 [추가] transcript가 변할 때마다 Ref를 업데이트 (클로저 트랩 방어)
  useEffect(() => {
    transcriptRef.current = transcript;
  }, [transcript]);

  // 🎓 학습 데이터 전송 로직
  const handleRecommendSelect = async (menu) => {
    let finalQty = 1; // 기본값은 1개

    if (learningText) {
      try {
        console.log(`🎓 학습 및 수량 분석 요청: [${learningText}]`);

        const response = await fetch(
          `https://kemini-kiosk-api.duckdns.org/api/learning`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Session-ID": realSessionId,
            },
            body: JSON.stringify({
              menuId: menu.id,
              text: learningText,
            }),
          },
        );

        if (response.ok) {
          const result = await response.json();
          // 🔥 [핵심] 백엔드가 계산해서 보내준 수량(Integer)을 가져옵니다.
          if (result.success && result.data) {
            finalQty = result.data;
            console.log(`✅ 백엔드 분석 결과: ${finalQty}개 확정`);
          }
        }
      } catch (e) {
        console.error("🌐 학습 API 통신 에러:", e);
      }
    }

    // 🔥 [수정] 하드코딩된 1 대신, 백엔드가 알려준 finalQty를 넣습니다!
    logic.updateCartItems(menu, finalQty);

    logic.setFallback({ ...logic.fallback, open: false });
    setLearningText("");
    speak(`${menu.name} ${finalQty}개 담았습니다.`); // 음성 안내도 수량에 맞춰서!
  };

  useEffect(() => {
    logic.loadInitialData(connect);
  }, []);

  const totalPrice = logic.cartItems.reduce(
    (acc, cur) => acc + cur.price * cur.quantity,
    0,
  );

  return (
    <div className="kiosk-wrapper">
      <aside className="sidebar">
        {logic.categories.map((cat) => (
          <button
            key={cat.id}
            className={logic.selectedCat === cat.name ? "active" : ""}
            onClick={() => logic.setSelectedCat(cat.name)}
          >
            {cat.name.toUpperCase()}
          </button>
        ))}
      </aside>

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
          {logic.menus
            .filter((m) => m.categoryName === logic.selectedCat)
            .map((menu) => (
              <div key={menu.id} className="menu-card">
                <img src={menu.imageUrl} alt={menu.name} />
                <div className="menu-info">
                  <h3>{menu.name}</h3>
                  <p>{menu.price.toLocaleString()}원</p>
                </div>
                <div className="menu-controls">
                  <button
                    className="qty-btn"
                    onClick={() => logic.updateCartItems(menu, -1)}
                  >
                    -
                  </button>
                  <span className="current-qty">
                    {logic.cartItems.find((i) => i.menuId === menu.id)
                      ?.quantity || 0}
                  </span>
                  <button
                    className="qty-btn"
                    onClick={() => logic.updateCartItems(menu, 1)}
                  >
                    +
                  </button>
                </div>
              </div>
            ))}
        </div>

        <footer className="footer">
          <div className="voice-bar">
            {isRecording
              ? transcript || "듣고 있어요..."
              : isSpeakingUI
                ? "📢 안내 중..."
                : "주문하시려면 버튼을 누르세요"}
          </div>
          <button
            className={`mic-btn ${isRecording ? "recording" : ""}`}
            onClick={isRecording ? stopRecording : startRecording}
          >
            {isRecording ? "🛑" : "🎙️"}
          </button>
        </footer>
      </main>

      {/* 장바구니 사이드바 */}
      <section className="cart-sidebar">
        <div className="cart-header">
          <h3>🛒 장바구니</h3>
          <button className="cart-close-btn" onClick={() => logic.clearCart()}>
            ×
          </button>
        </div>

        <div className="cart-list">
          {logic.cartItems.length === 0 ? (
            <p className="empty-msg">주문하신 메뉴가 없습니다.</p>
          ) : (
            logic.cartItems.map((item, idx) => {
              const menuInfo = logic.menus.find((m) => m.id === item.menuId);
              return (
                <div key={idx} className="cart-item">
                  <div className="cart-item-img-box">
                    <img
                      src={menuInfo?.imageUrl}
                      alt={item.menuName}
                      className="cart-item-img"
                    />
                  </div>
                  <div className="cart-item-main">
                    <h4>{item.menuName}</h4>
                    <div className="cart-item-qty-row">
                      <button
                        className="cart-qty-btn tiny-btn"
                        onClick={() => logic.updateCartItems(menuInfo, -1)}
                      >
                        -
                      </button>
                      <span className="cart-item-quantity">
                        {item.quantity}
                      </span>
                      <button
                        className="cart-qty-btn tiny-btn"
                        onClick={() => logic.updateCartItems(menuInfo, 1)}
                      >
                        +
                      </button>
                    </div>
                  </div>
                  <div className="cart-item-price-box">
                    {(item.price * item.quantity).toLocaleString()}원
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="cart-footer">
          <div className="total-price-row">
            <span>총 금액</span>
            <span>{totalPrice.toLocaleString()}원</span>
          </div>
          <button
            className="order-confirm-btn btn-primary"
            onClick={() => logic.handlePayment(speak)}
          >
            결제하기
          </button>
        </div>
      </section>

      {/* 안내 중일 때만 나타나는 플로팅 알림창 */}
      {isSpeakingUI && (
        <div className="speaking-toast">
          <div className="speaking-dot"></div>
          <span>KEMINI가 대답하고 있어요...</span>
        </div>
      )}

      {/* 모달 컴포넌트들 */}
      <QuantityModal
        isOpen={logic.isModalOpen}
        menuName={logic.modalMenuName}
        onConfirm={(qty) => {
          const menu = menusRef.current.find(
            (m) => m.name === logic.modalMenuName,
          );
          logic.updateCartItems(menu, qty);
          logic.setIsModalOpen(false);
          speak(`${logic.modalMenuName} 확인했습니다.`);
        }}
        onClose={() => logic.setIsModalOpen(false)}
      />

      <FallbackModal
        isOpen={logic.fallback.open}
        type={logic.fallback.type}
        data={logic.fallback.data}
        onSelect={handleRecommendSelect} // 🔥 수정된 함수 연결
        onClose={() => logic.setFallback({ ...logic.fallback, open: false })}
      />

      <PaymentSuccessModal
        isOpen={logic.isSuccessOpen}
        orderNumber={logic.orderNumber}
        onClose={() => {
          logic.setIsSuccessOpen(false);
          logic.setCartItems([]);
        }}
      />
    </div>
  );
}

export default App;
