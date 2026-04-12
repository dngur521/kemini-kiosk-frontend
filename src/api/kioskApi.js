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
