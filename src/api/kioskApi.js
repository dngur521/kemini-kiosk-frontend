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

// 백엔드 통계 API에서 TOP 3 메뉴를 가져오는 함수
export const fetchTop3Menus = async () => {
  try {
    const response = await fetch(
      "https://kemini-kiosk-api.duckdns.org/api/statistics/top3",
    );
    if (!response.ok) throw new Error("네트워크 응답에 문제가 있습니다.");

    const result = await response.json();
    // 백엔드 ApiResponse 구조가 { success: true, data: [...] } 라면 result.data를 반환
    return result.data || result;
  } catch (error) {
    console.error("TOP 3 메뉴를 가져오는데 실패했습니다:", error);
    return []; // 에러 시 빈 배열 반환
  }
};
