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

// 🔥 [추가] 특정 카테고리 내의 TOP 3 메뉴를 가져오는 함수
export const fetchCategoryTop3 = async (categoryName) => {
  try {
    // 백엔드 엔드포인트 설계에 맞게 쿼리 파라미터로 categoryName 전달
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
