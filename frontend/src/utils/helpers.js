export const generateUniqueId = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 7)}`;