export function parseApiError(detail, defaultMsg = "An unexpected error occurred. Please try again.") {
  if (!detail) return defaultMsg;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    return detail.map(item => {
      if (typeof item === 'string') return item;
      if (item && typeof item === 'object') {
        const field = item.loc && item.loc.length > 1 ? `${item.loc[item.loc.length - 1]}: ` : '';
        return `${field}${item.msg || JSON.stringify(item)}`;
      }
      return String(item);
    }).join('; ');
  }
  if (typeof detail === 'object') {
    return detail.msg || detail.detail || JSON.stringify(detail);
  }
  return String(detail);
}
