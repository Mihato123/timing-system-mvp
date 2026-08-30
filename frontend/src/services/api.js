export const API_BASE_URL = "http://localhost:3000/api";

export async function api(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });

  let responseData = {};

  try {
    responseData = await response.json();
  } catch (error) {
    responseData = {};
  }

  if (!response.ok) {
    const requestError = new Error(
      responseData.message || "Có lỗi xảy ra khi kết nối hệ thống."
    );

    requestError.data = responseData;
    requestError.status = response.status;

    throw requestError;
  }

  return responseData;
}
