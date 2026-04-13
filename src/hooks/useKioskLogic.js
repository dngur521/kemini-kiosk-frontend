import { useCallback, useState } from "react";
import { getCategories, getMenus } from "../api/kioskApi";

export const useKioskLogic = () => {
  const [categories, setCategories] = useState([]);
  const [menus, setMenus] = useState([]);
  const [selectedCat, setSelectedCat] = useState("");
  const [cartItems, setCartItems] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMenuName, setModalMenuName] = useState("");
  const [fallback, setFallback] = useState({ open: false, type: "", data: [] });
  const [isSuccessOpen, setIsSuccessOpen] = useState(false);
  const [orderNumber, setOrderNumber] = useState(0);

  const loadInitialData = useCallback(async (connect) => {
    connect();
    const cats = await getCategories();
    setCategories(cats);
    if (cats.length > 0) setSelectedCat(cats[0].name);
    const menuData = await getMenus();
    setMenus(menuData);
  }, []);

  // 🔥 통합 업데이트 함수: 반드시 menu 객체를 받음
  const updateCartItems = (menu, qty) => {
    if (!menu) return;
    setCartItems((prev) => {
      const exist = prev.find((item) => item.menuId === menu.id);
      if (exist) {
        return prev
          .map((item) =>
            item.menuId === menu.id
              ? { ...item, quantity: Math.max(0, item.quantity + qty) }
              : item,
          )
          .filter((item) => item.quantity > 0); // 0개면 삭제
      }
      if (qty <= 0) return prev;
      return [
        ...prev,
        {
          menuId: menu.id,
          menuName: menu.name,
          quantity: qty,
          price: menu.price,
        },
      ];
    });
  };

  const handleCancel = (menuName, qty) => {
    setCartItems((prev) => {
      // 1. "전부" 삭제인 경우 (qty === "ALL")
      if (qty === "ALL") {
        return prev.filter((item) => item.menuName !== menuName);
      }

      // 2. 특정 수량만큼 차감하는 경우
      return prev
        .map((item) =>
          item.menuName === menuName
            ? { ...item, quantity: item.quantity - parseInt(qty) } // quantity로 수정
            : item,
        )
        .filter((item) => item.quantity > 0); // 0개 이하면 목록에서 제거
    });
  };

  // ➕ 장바구니 전체 비우기 기능도 추가 (확실하게 하기 위해)
  const clearCart = () => {
    setCartItems([]);
  };

  const handlePayment = async (speak) => {
    if (cartItems.length === 0) return;
    try {
      await fetch(`https://kemini-kiosk-api.duckdns.org/api/statistics/order`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cartItems),
      });

      const newOrderNum = Math.floor(Math.random() * 900) + 100;
      setOrderNumber(newOrderNum);
      setIsSuccessOpen(true);
      speak(`결제가 완료되었습니다. 주문 번호는 ${newOrderNum}번 입니다.`);

      setTimeout(() => {
        setIsSuccessOpen(false);
        setCartItems([]);
      }, 5000);
    } catch (error) {
      console.error("결제 오류:", error);
    }
  };

  return {
    categories,
    menus,
    selectedCat,
    setSelectedCat,
    cartItems,
    setCartItems,
    isModalOpen,
    setIsModalOpen,
    modalMenuName,
    setModalMenuName,
    fallback,
    setFallback,
    isSuccessOpen,
    setIsSuccessOpen,
    orderNumber,
    loadInitialData,
    updateCartItems,
    handleCancel,
    handlePayment,
    clearCart,
  };
};
