import { useCallback, useEffect, useRef, useState } from "react";
import { fetchCategoryTop3, fetchTop3Menus } from "./api/kioskApi";
import "./App.css";
import FallbackModal from "./components/FallbackModal";
import PaymentSuccessModal from "./components/PaymentSuccessModal";
import { QuantityModal } from "./components/QuantityModal";
import { useKioskLogic } from "./hooks/useKioskLogic";
import { useVoiceOrder } from "./hooks/useVoiceOrder";

function App() {
  const logic = useKioskLogic();

  // --- 1. 상태 및 레퍼런스 선언 ---
  const [learningText, setLearningText] = useState("");
  const [realSessionId, setRealSessionId] = useState("");
  const [orderQueue, setOrderQueue] = useState([]); // 처리 대기 중인 주문 큐

  const menusRef = useRef([]);
  const transcriptRef = useRef("");

  /**
   * [즉시 처리 로직]
   * 백엔드에서 이미 처리된 주문(직접 매칭)을 프론트 UI 상태에 동기화합니다.
   * JSON 속성명(cancel, allCancel 등)을 백엔드 직렬화 규칙에 맞췄습니다.
   */
  const handleImmediateOrderUpdate = useCallback(
    (order, speakFunc) => {
      if (order.allCancel) {
        logic.clearCart();
        speakFunc("장바구니를 모두 비웠습니다.");
      } else if (order.menuDto) {
        if (order.menuAllCancel) {
          logic.handleCancel(order.menuDto.name, "ALL");
          speakFunc(`${order.menuDto.name} 전부 취소했습니다.`);
        } else if (order.cancel) {
          // 🔥 order.isCancel 대신 order.cancel 사용
          logic.handleCancel(order.menuDto.name, order.quantity);
          speakFunc(`${order.menuDto.name} ${order.quantity}개 취소했습니다.`);
        } else {
          logic.updateCartItems(order.menuDto, order.quantity);
          speakFunc(`${order.menuDto.name} 담았습니다.`);
        }
      }
    },
    [logic],
  );

  /**
   * [핵심 함수] 큐에 쌓인 주문을 순차적으로 처리하는 프로세서
   */
  const processNextOrder = useCallback(
    async (currentQueue, speakFunc) => {
      const targetQueue = currentQueue || orderQueue;
      // 🔥 async 확인!
      if (!targetQueue || targetQueue.length === 0) {
        console.log("✅ 모든 주문 처리 완료");
        return;
      }

      // 1. 큐에서 첫 번째 항목 추출
      const [currentOrder, ...remaining] = targetQueue;
      setOrderQueue(remaining);

      console.log("🎯 현재 처리 중인 데이터:", currentOrder);

      // 2. 타입별 분기 처리

      // A. 추천이 필요한 경우 (unknown: true)
      if (currentOrder.unknown) {
        // 🔥 수정 포인트: 데이터가 있는지 먼저 확인
        let displayData = currentOrder.suggestedMenus || [];
        const type = displayData.length > 0 ? "SIMILAR" : "TOP3";

        // [핵심] 데이터가 없는 TOP3 상황이라면 직접 API를 호출해서 데이터를 채웁니다.
        if (type === "TOP3" && displayData.length === 0) {
          console.log("📈 인기 메뉴 데이터를 가져옵니다...");
          displayData = await fetchTop3Menus();
        }

        logic.setFallback({
          open: true,
          type: type,
          data: displayData, // 이제 빈 배열이 아니라 꽉 찬 데이터가 들어갑니다!
          quantity: currentOrder.quantity,
        });

        speakFunc(
          type === "SIMILAR"
            ? "비슷한 메뉴를 찾았어요."
            : "잘 이해하지 못했어요. 대신 인기 메뉴를 추천해 드릴게요.",
        );
      }

      // B. 의도 확인이 필요한 경우 (learnedMatch: true)
      else if (
        currentOrder.learnedMatch &&
        !currentOrder.cancel &&
        !currentOrder.allCancel
      ) {
        logic.setFallback({
          open: true,
          type: "CONFIRM",
          data: [currentOrder.menuDto],
          quantity: currentOrder.quantity,
        });
        speakFunc(`${currentOrder.menuDto.name} 맞으실까요?`);
      }

      // C. 수량이 0인 경우 재질문
      else if (
        currentOrder.quantity === 0 &&
        !currentOrder.cancel &&
        !currentOrder.allCancel
      ) {
        logic.setModalMenuName(currentOrder.menuDto.name);
        logic.setIsModalOpen(true);
        speakFunc(`${currentOrder.menuDto.name} 몇 개 드릴까요?`);
      }

      // D. 즉시 처리 (일반 주문 및 취소)
      else {
        handleImmediateOrderUpdate(currentOrder, speakFunc);
        // 즉시 처리 후 재귀적으로 다음 큐 실행
        await processNextOrder(remaining, speakFunc);
      }
    },
    [logic, handleImmediateOrderUpdate, orderQueue],
  );

  /**
   * 시스템 메시지 수신부
   */
  const handleSystemMessage = useCallback(
    async (message, speakFunc) => {
      if (message.startsWith("SYSTEM:SESSION_ID:")) {
        setRealSessionId(message.split(":")[2]);
        return;
      }

      if (message.startsWith("SYSTEM:PROCESS_ORDERS:")) {
        const orders = JSON.parse(
          message.replace("SYSTEM:PROCESS_ORDERS:", ""),
        );
        setLearningText(transcriptRef.current);
        processNextOrder(orders, speakFunc); // 큐 처리 시작
      }
    },
    [processNextOrder],
  );

  // --- 2. 커스텀 훅 및 이펙트 ---
  const {
    status,
    transcript,
    isRecording,
    isSpeakingUI,
    connect,
    startRecording,
    stopRecording,
    speak,
  } = useVoiceOrder(handleSystemMessage, () => logic.fallback.open || logic.isModalOpen);

  useEffect(() => {
    menusRef.current = logic.menus;
  }, [logic.menus]);
  useEffect(() => {
    transcriptRef.current = transcript;
  }, [transcript]);

  /**
   * 모달 액션 처리 (인터랙션 완료 후 큐 재개)
   */
  const handleRecommendSelect = async (menu) => {
    // 백엔드에서 온 수량을 우선 사용하고, 없으면 1로 기본값 설정
    let finalQty = logic.fallback.quantity || 1;
    if (logic.fallback.type === "SIMILAR" && learningText) {
      try {
        const res = await fetch(
          `https://kemini-kiosk-api.duckdns.org/api/learning`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Session-ID": realSessionId,
            },
            body: JSON.stringify({ menuId: menu.id, text: learningText }),
          },
        );
        const result = await res.json();
        // 학습 API 응답에 수량이 있다면 업데이트 (보통 1차 인식 수량과 동일)
        if (result.success && result.data) finalQty = result.data;
      } catch (e) {
        console.error(e);
      }
    }

    logic.updateCartItems(menu, finalQty);
    logic.setFallback({ ...logic.fallback, open: false });
    speak(`${menu.name} 담았습니다.`);
    // 0.5초 뒤 다음 큐 실행
    //setTimeout(() => processNextOrder(orderQueue, speak), 500);
    setTimeout(() => processNextOrder(undefined, speak), 500);
  };

  /**
   * [하이브리드 핵심] 사용자가 "아니오(Reject)"를 눌렀을 때의 처리
   */
  const handleConfirmReject = async () => {
    const wrongMenu = logic.fallback.data[0];
    const currentQty = logic.fallback.quantity;
    speak("죄송해요. 원하시는 메뉴를 다시 찾아볼게요.");

    try {
      // 1. 사용자가 처음에 했던 말(learningText)이 있는지 확인
      if (learningText) {
        console.log("🤖 AI 시맨틱 추천 재시도 중... Query:", learningText);

        // 백엔드에 새로 만든 AI 추천 엔드포인트 호출
        const response = await fetch(
          `https://kemini-kiosk-api.duckdns.org/api/ai/recommend`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ query: learningText }),
          },
        );

        const aiSuggestions = await response.json();

        // 2. AI 추천 결과가 있다면 SIMILAR 모달로 표시
        if (aiSuggestions && aiSuggestions.length > 0) {
          logic.setFallback({
            open: true,
            type: "SIMILAR",
            data: aiSuggestions,
            quantity: currentQty,
          });
          speak("혹시 이 메뉴들 중에 있을까요?");
          return; // AI가 찾았으므로 여기서 종료
        }
      }

      // 3. AI도 못 찾았거나 원본 텍스트가 없다면, 기존처럼 카테고리 TOP3로 폴백 (기존 로직 보존)
      console.log("⚠️ AI 추천 결과 없음 -> 카테고리 인기 메뉴로 폴백");
      const top3 = await fetchCategoryTop3(wrongMenu.categoryName);
      logic.setFallback({ open: true, type: "TOP3", data: top3, quantity: currentQty });
      speak("대신 이 카테고리에서 가장 인기 있는 메뉴들이에요.");
    } catch (e) {
      console.error("AI 추천 재시도 실패:", e);
      // 에러 발생 시 모달 닫고 다음 주문 큐로 진행
      logic.setFallback({ ...logic.fallback, open: false });
      processNextOrder(orderQueue, speak);
    }
  };

  const handleQuantityConfirm = (qty) => {
    const menu = menusRef.current.find((m) => m.name === logic.modalMenuName);
    logic.updateCartItems(menu, qty);
    logic.setIsModalOpen(false);
    speak(`${logic.modalMenuName} 확인했습니다.`);
    setTimeout(() => processNextOrder(orderQueue, speak), 500);
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
      {/* 사이드바 */}
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

      {/* 메인 영역 */}
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

      {/* 장바구니 */}
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

      {/* 모달 모음 */}
      {isSpeakingUI && (
        <div className="speaking-toast">
          <div className="speaking-dot"></div>
          <span>KEMINI가 대답하고 있어요...</span>
        </div>
      )}

      <QuantityModal
        isOpen={logic.isModalOpen}
        menuName={logic.modalMenuName}
        onConfirm={handleQuantityConfirm}
        onClose={() => {
          logic.setIsModalOpen(false);
          processNextOrder(orderQueue, speak);
        }}
      />
      <FallbackModal
        isOpen={logic.fallback.open}
        type={logic.fallback.type}
        data={logic.fallback.data}
        onSelect={handleRecommendSelect}
        onReject={handleConfirmReject}
        onClose={() => {
          logic.setFallback({ ...logic.fallback, open: false });
          processNextOrder(orderQueue, speak);
        }}
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
