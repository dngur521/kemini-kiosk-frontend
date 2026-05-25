import { useCallback, useEffect, useRef, useState } from "react";
import { fetchAiRecommend, fetchCategoryTop3, fetchTop3Menus, postLearning } from "./api/kioskApi";
import "./App.css";
import FallbackModal from "./components/FallbackModal";
import PaymentSuccessModal from "./components/PaymentSuccessModal";
import { QuantityModal } from "./components/QuantityModal";
import { useEyeTracking } from "./hooks/useEyeTracking";
import { useKioskLogic } from "./hooks/useKioskLogic";
import { useLipReading } from "./hooks/useLipReading";
import { useVoiceOrder } from "./hooks/useVoiceOrder";

function App() {
  const logic = useKioskLogic();
  useLipReading();

  // --- 1. 상태 및 레퍼런스 선언 ---
  const [learningText, setLearningText] = useState("");
  const [realSessionId, setRealSessionId] = useState("");
  const [orderQueue, setOrderQueue] = useState([]); // 처리 대기 중인 주문 큐
  const [lipReadingMatch, setLipReadingMatch] = useState(null); // 립리딩 결과 표시용
  const [isLipReadingAnalyzing, setIsLipReadingAnalyzing] = useState(false); // 립리딩 분석 중 로딩
  const [lipReadingFailed, setLipReadingFailed] = useState(false); // 립리딩 매칭 실패 알림
  const [lipReadingCandidates, setLipReadingCandidates] = useState(null); // 립리딩 후보 선택 모달

  // handleQuantityConfirm의 stale closure를 피하기 위해 ref로 최신 menus를 유지
  const menusRef = useRef([]);
  // handleSystemMessage의 stale closure를 피하기 위해 ref로 최신 transcript를 유지
  const transcriptRef = useRef("");
  // 아이트래킹 패턴 핸들러에서 speak 최신값을 참조하기 위한 ref
  const speakRef = useRef(null);
  // handleSystemMessage stale closure 대응 — updateCartItems 최신값 유지
  const updateCartItemsRef = useRef(null);

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
        let displayData = currentOrder.suggestedMenus || [];
        const type = displayData.length > 0 ? "SIMILAR" : "TOP3";

        // 백엔드가 suggestedMenus를 내려주지 않은 TOP3 상황이면 직접 API 호출
        if (type === "TOP3" && displayData.length === 0) {
          displayData = await fetchTop3Menus();
        }

        logic.setFallback({
          open: true,
          type: type,
          data: displayData,
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
        return;
      }

      if (message.startsWith("SYSTEM:LIPREADING_ANALYZING")) {
        setIsLipReadingAnalyzing(true);
        return;
      }

      if (message.startsWith("SYSTEM:LIPREADING_CANDIDATES:")) {
        const candidates = JSON.parse(message.replace("SYSTEM:LIPREADING_CANDIDATES:", ""));
        setIsLipReadingAnalyzing(false);
        const enriched = candidates
          .map((c) => menusRef.current.find((m) => m.id === c.id))
          .filter(Boolean);
        if (enriched.length > 0) {
          setLipReadingCandidates(enriched);
          speakFunc("혹시 이 메뉴를 말씀하셨나요?");
        }
        return;
      }

      if (message.startsWith("SYSTEM:LIPREADING_FAILED")) {
        setIsLipReadingAnalyzing(false);
        setLipReadingFailed(true);
        speakFunc("입술 모양으로도 인식하지 못했어요. 다시 말씀해 주세요.");
        setTimeout(() => setLipReadingFailed(false), 3000);
        return;
      }

      if (message.startsWith("SYSTEM:LIPREADING_MATCH:")) {
        const [, , menuIdStr, menuName, scoreStr] = message.split(":");
        setIsLipReadingAnalyzing(false);
        setLipReadingMatch({ menuName, score: parseFloat(scoreStr) });
        speakFunc(`립리딩으로 ${menuName} 담았습니다.`);
        setTimeout(() => setLipReadingMatch(null), 3000);
        const menu = menusRef.current.find((m) => m.id === Number(menuIdStr));
        if (menu) updateCartItemsRef.current?.(menu, 1);
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
    stopSpeak,
  } = useVoiceOrder(handleSystemMessage, () => logic.fallback.open || logic.isModalOpen || lipReadingCandidates !== null);

  useEffect(() => {
    menusRef.current = logic.menus;
  }, [logic.menus]);
  useEffect(() => {
    transcriptRef.current = transcript;
  }, [transcript]);
  useEffect(() => {
    speakRef.current = speak;
  });
  useEffect(() => {
    updateCartItemsRef.current = logic.updateCartItems;
  });

  // --- 아이트래킹 ---
  const { isActive: isEyeActive, detectedPattern, fixedGazePos, toggleEyeTracking, clearPattern } =
    useEyeTracking(() => logic.fallback.open || logic.isModalOpen || logic.isSuccessOpen || lipReadingCandidates !== null);

  useEffect(() => {
    if (!detectedPattern) return;
    if (detectedPattern === "wandering") {
      speakRef.current?.("도움이 필요하신가요? 음성 버튼을 누르고 주문해 보세요.");
    } else if (detectedPattern === "deviation") {
      speakRef.current?.("장바구니를 확인하고 계신가요? 결제를 원하시면 결제하기 버튼을 눌러주세요.")
    } else if (detectedPattern === "fixed" && fixedGazePos) {
      const screenX = fixedGazePos.x * window.innerWidth;
      const screenY = fixedGazePos.y * window.innerHeight;
      const el = document.elementFromPoint(screenX, screenY);
      const card = el?.closest("[data-menu-id]");
      if (card) {
        speakRef.current?.(`${card.dataset.menuName}에 관심이 있으신가요? 음성 버튼을 누르고 주문해 보세요.`);
      }
    }
    clearPattern();
  }, [detectedPattern, fixedGazePos, clearPattern]);

  const handleLipReadingCandidateSelect = (menu) => {
    updateCartItemsRef.current?.(menu, 1);
    setLipReadingCandidates(null);
    speak(`${menu.name} 담았습니다.`);
  };

  /**
   * 모달 액션 처리 (인터랙션 완료 후 큐 재개)
   */
  const handleRecommendSelect = async (menu) => {
    // 백엔드에서 온 수량을 우선 사용하고, 없으면 1로 기본값 설정
    let finalQty = logic.fallback.quantity || 1;
    if (logic.fallback.type === "SIMILAR" && learningText) {
      try {
        const result = await postLearning(menu.id, learningText, realSessionId);
        if (result.success && result.data) finalQty = result.data;
      } catch (e) {
        console.error(e);
      }
    }

    logic.updateCartItems(menu, finalQty);
    logic.setFallback({ ...logic.fallback, open: false });
    speak(`${menu.name} 담았습니다.`);
    setTimeout(() => processNextOrder(orderQueue, speak), 500);
  };

  /**
   * [하이브리드 핵심] 사용자가 "아니오(Reject)"를 눌렀을 때의 처리
   */
  const handleConfirmReject = async () => {
    window.speechSynthesis.cancel();
    const wrongMenu = logic.fallback.data[0];
    const currentQty = logic.fallback.quantity;
    speak("죄송해요. 원하시는 메뉴를 다시 찾아볼게요.");

    try {
      // 1. 사용자가 처음에 했던 말(learningText)이 있는지 확인
      // 1. 원본 발화가 있으면 AI 시맨틱 검색으로 재시도
      if (learningText) {
        const aiSuggestions = await fetchAiRecommend(learningText);

        // 2. AI 추천 결과가 있다면 SIMILAR 모달로 표시
        if (aiSuggestions && aiSuggestions.length > 0) {
          logic.setFallback({
            open: true,
            type: "SIMILAR",
            data: aiSuggestions,
            quantity: currentQty,
          });
          speak("혹시 이 메뉴들 중에 있을까요?");
          return;
        }
      }

      // 3. AI도 결과 없거나 원본 발화가 없으면 카테고리 TOP3로 폴백
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

  /**
   * 수량 모달에서 확인 시 — menusRef로 최신 menus 참조 후 장바구니에 추가
   */
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
              <div key={menu.id} className="menu-card" data-menu-id={menu.id} data-menu-name={menu.name}>
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
          <button
            className={`eye-btn ${isEyeActive ? "active" : ""}`}
            onClick={toggleEyeTracking}
            title={isEyeActive ? "아이트래킹 끄기" : "아이트래킹 켜기"}
          >
            👁️
          </button>
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
      {isLipReadingAnalyzing && (
        <div className="lipreading-toast analyzing">
          <div className="lipreading-spinner"></div>
          <span>입술 모양 분석 중...</span>
        </div>
      )}
      {lipReadingMatch && (
        <div className="lipreading-toast">
          <span>립리딩: {lipReadingMatch.menuName} ({Math.round(lipReadingMatch.score * 100)}%)</span>
        </div>
      )}
      {lipReadingFailed && (
        <div className="lipreading-toast failed">
          <span>입술 모양을 인식하지 못했어요</span>
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
          stopSpeak();
          logic.setFallback({ ...logic.fallback, open: false });
          processNextOrder(orderQueue, speak);
        }}
      />
      <FallbackModal
        isOpen={lipReadingCandidates !== null}
        type="LIPREADING_CANDIDATES"
        data={lipReadingCandidates}
        onSelect={handleLipReadingCandidateSelect}
        onClose={() => setLipReadingCandidates(null)}
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
