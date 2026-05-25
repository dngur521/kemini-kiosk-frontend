import { BASE_URL } from "../constants/api";

export const getCategories = async () => {
  try {
    const res = await fetch(`${BASE_URL}/category`);
    const json = await res.json();
    return json.success ? json.data : [];
  } catch (e) {
    console.error("카테고리 로드 실패:", e);
    return [];
  }
};

export const getMenus = async () => {
  try {
    const res = await fetch(`${BASE_URL}/menu`);
    const json = await res.json();
    return json.success ? json.data : [];
  } catch (e) {
    console.error("메뉴 로드 실패:", e);
    return [];
  }
};

// 백엔드 전체 통계 TOP 3
export const fetchTop3Menus = async () => {
  try {
    const response = await fetch(`${BASE_URL}/statistics/top3`);
    if (!response.ok) throw new Error("네트워크 응답에 문제가 있습니다.");
    const result = await response.json();
    return result.data || result;
  } catch (error) {
    console.error("TOP 3 메뉴를 가져오는데 실패했습니다:", error);
    return [];
  }
};

export const fetchCategoryTop3 = async (categoryName) => {
  try {
    const response = await fetch(
      `${BASE_URL}/statistics/top3?categoryName=${categoryName}`,
    );
    if (!response.ok) throw new Error("카테고리 통계 로드 실패");
    const result = await response.json();
    return result.success ? result.data : [];
  } catch (error) {
    console.error(`${categoryName} TOP 3 로드 실패:`, error);
    return [];
  }
};

export const postLearning = async (menuId, text, sessionId) => {
  const res = await fetch(`${BASE_URL}/learning`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Session-ID": sessionId,
    },
    body: JSON.stringify({ menuId, text }),
  });
  return res.json();
};

export const postCart = async (sessionId, menuId, quantity) => {
  try {
    const res = await fetch(`${BASE_URL}/cart/${sessionId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ menuId, quantity }),
    });
    return res.json();
  } catch (e) {
    console.error("장바구니 추가 실패:", e);
  }
};

export const fetchAiRecommend = async (query) => {
  const response = await fetch(`${BASE_URL}/ai/recommend`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  return response.json();
};
